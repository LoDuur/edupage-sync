import { DurableObject } from "cloudflare:workers";

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1000;
const WORLD_MARGIN = 200;
const ROOM_PATTERN = /^[a-z0-9-]{1,32}$/;
const OP_ID_PATTERN = /^[A-Za-z0-9-]{8,48}$/;
const CLIENT_KEY_PATTERN = /^[0-9a-f]{32}$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const STROKE_TOOLS = new Set(["brush", "eraser"]);
const SHAPE_TOOLS = new Set(["line", "rect", "ellipse"]);
const MAX_MESSAGE_CHARS = 96 * 1024;
const MAX_STROKE_POINTS = 4000;
const MAX_LIVE_POINTS = 600;
const MIN_SIZE = 1;
const MAX_SIZE = 120;
const MAX_NAME_CHARS = 24;
const MAX_USERS = 50;
const MAX_OPS = 20000;
const SNAPSHOT_CHUNK_CHARS = 256 * 1024;
const CLEAR_COOLDOWN_MS = 3000;
const RATE_REFILL_PER_SEC = 90;
const RATE_BURST = 180;
const AUTH_CLOSE_CODE = 4001;
const FULL_CLOSE_CODE = 4002;
const DEFAULT_BACKGROUND = "#ffffff";
const USER_COLORS = ["#ff3b30", "#0a84ff", "#34c759", "#ff9500", "#af52de", "#ff2d55", "#00c7be", "#5856d6", "#a2845e", "#ffcc00", "#30b0c7", "#8e8e93"];

const sha256Hex = async text => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};

export async function handlePaint(request, env, url, allowedOrigins) {
  const room = decodeURIComponent(url.pathname.slice("/paint/rooms/".length));
  if (!url.pathname.startsWith("/paint/rooms/") || !ROOM_PATTERN.test(room)) return new Response("not found", { status: 404 });
  if (request.headers.get("Upgrade") !== "websocket") return new Response("websocket required", { status: 426 });
  if (!allowedOrigins.includes(request.headers.get("Origin") || "")) return new Response("forbidden", { status: 403 });
  if (!env.PAINT) return new Response("paint not configured", { status: 503 });
  return env.PAINT.get(env.PAINT.idFromName(room)).fetch(request);
}

function isWorldCoordinate(value, limit) {
  return typeof value === "number" && Number.isFinite(value) && value >= -WORLD_MARGIN && value <= limit + WORLD_MARGIN;
}

function parsePoints(raw, tool, maxPoints) {
  if (!Array.isArray(raw) || raw.length % 2 !== 0) return null;
  const pointCount = raw.length / 2;
  if (SHAPE_TOOLS.has(tool) ? pointCount !== 2 : pointCount < 1 || pointCount > maxPoints) return null;
  const points = new Array(raw.length);
  for (let index = 0; index < raw.length; index++) {
    const limit = index % 2 === 0 ? WORLD_WIDTH : WORLD_HEIGHT;
    if (!isWorldCoordinate(raw[index], limit)) return null;
    points[index] = Math.round(raw[index] * 10) / 10;
  }
  return points;
}

function parseDrawing(raw, maxPoints) {
  if (!raw || typeof raw !== "object") return null;
  if (!STROKE_TOOLS.has(raw.tool) && !SHAPE_TOOLS.has(raw.tool)) return null;
  if (!Number.isFinite(raw.size) || raw.size < MIN_SIZE || raw.size > MAX_SIZE) return null;
  if (raw.tool !== "eraser" && (typeof raw.color !== "string" || !COLOR_PATTERN.test(raw.color))) return null;
  const points = parsePoints(raw.points, raw.tool, maxPoints);
  if (!points) return null;
  return { tool: raw.tool, color: raw.tool === "eraser" ? "" : raw.color, size: Math.round(raw.size), points };
}

function cleanName(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_CHARS);
}

export class PaintRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rateBuckets = new Map();
    this.lastClearAt = 0;
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS ops (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      owner TEXT NOT NULL,
      tool TEXT NOT NULL,
      color TEXT NOT NULL,
      size INTEGER NOT NULL,
      points TEXT NOT NULL,
      undone INTEGER NOT NULL DEFAULT 0
    )`);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS room_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ isAuthed: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  authedSockets(except) {
    return this.ctx.getWebSockets().filter(socket => socket !== except && socket.deserializeAttachment()?.isAuthed);
  }

  send(socket, message) {
    try {
      socket.send(typeof message === "string" ? message : JSON.stringify(message));
    } catch {
      this.dropSocket(socket);
    }
  }

  broadcast(message, except) {
    const text = JSON.stringify(message);
    for (const socket of this.authedSockets(except)) this.send(socket, text);
  }

  dropSocket(socket) {
    this.rateBuckets.delete(socket);
    try {
      socket.close(1011, "send failed");
    } catch {}
  }

  isWithinRate(socket) {
    const now = Date.now();
    const bucket = this.rateBuckets.get(socket) || { tokens: RATE_BURST, at: now };
    bucket.tokens = Math.min(RATE_BURST, bucket.tokens + (now - bucket.at) / 1000 * RATE_REFILL_PER_SEC);
    bucket.at = now;
    this.rateBuckets.set(socket, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  background() {
    return this.ctx.storage.sql.exec("SELECT value FROM room_meta WHERE key = 'background'").toArray()[0]?.value || DEFAULT_BACKGROUND;
  }

  serializeOp(row, clientKey) {
    return { seq: row.seq, id: row.id, tool: row.tool, color: row.color, size: row.size, points: JSON.parse(row.points), undone: row.undone === 1, mine: row.owner === clientKey };
  }

  async webSocketMessage(socket, raw) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_CHARS) return socket.close(1009, "message too large");
    if (!this.isWithinRate(socket)) return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message.type !== "string") return;
    const session = socket.deserializeAttachment();
    if (!session?.isAuthed) {
      if (message.type === "hello") await this.handleHello(socket, message);
      return;
    }
    switch (message.type) {
      case "live": return this.handleLive(socket, session, message);
      case "cancel": return this.handleCancel(socket, session, message);
      case "cursor": return this.handleCursor(socket, session, message);
      case "commit": return this.handleCommit(socket, session, message);
      case "clear": return this.handleClear(socket, session, message);
      case "undo": return this.handleUndoToggle(socket, session, message, true);
      case "redo": return this.handleUndoToggle(socket, session, message, false);
      case "background": return this.handleBackground(socket, session, message);
    }
  }

  async handleHello(socket, message) {
    const code = typeof message.code === "string" ? message.code.trim().toUpperCase() : "";
    if (!this.env.ACCESS_HASH || !code || await sha256Hex(code) !== this.env.ACCESS_HASH) {
      this.send(socket, { type: "error", code: "auth" });
      return socket.close(AUTH_CLOSE_CODE, "access denied");
    }
    if (typeof message.clientKey !== "string" || !CLIENT_KEY_PATTERN.test(message.clientKey)) return socket.close(1008, "invalid client");
    const others = this.authedSockets(socket).map(other => other.deserializeAttachment());
    if (others.length >= MAX_USERS) {
      this.send(socket, { type: "error", code: "full" });
      return socket.close(FULL_CLOSE_CODE, "room full");
    }
    const usedColors = new Set(others.map(other => other.user.color));
    const color = USER_COLORS.find(candidate => !usedColors.has(candidate)) || USER_COLORS[others.length % USER_COLORS.length];
    const user = { id: crypto.randomUUID().slice(0, 8), name: cleanName(message.name) || "Viesis", color };
    socket.serializeAttachment({ isAuthed: true, clientKey: message.clientKey, user });
    this.sendSnapshot(socket, message.clientKey, user, others.map(other => other.user));
    this.broadcast({ type: "join", user }, socket);
  }

  sendSnapshot(socket, clientKey, user, users) {
    this.send(socket, { type: "welcome", me: user, users, background: this.background(), world: { width: WORLD_WIDTH, height: WORLD_HEIGHT } });
    let chunk = [];
    let chunkChars = 0;
    for (const row of this.ctx.storage.sql.exec("SELECT * FROM ops ORDER BY seq")) {
      chunk.push(this.serializeOp(row, clientKey));
      chunkChars += row.points.length + 120;
      if (chunkChars >= SNAPSHOT_CHUNK_CHARS) {
        this.send(socket, { type: "ops", ops: chunk });
        chunk = [];
        chunkChars = 0;
      }
    }
    if (chunk.length) this.send(socket, { type: "ops", ops: chunk });
    this.send(socket, { type: "ready" });
  }

  handleLive(socket, session, message) {
    if (typeof message.id !== "string" || !OP_ID_PATTERN.test(message.id)) return;
    const drawing = parseDrawing(message, MAX_LIVE_POINTS);
    if (!drawing) return;
    this.broadcast({ type: "live", user: session.user.id, id: message.id, reset: message.reset === true, ...drawing }, socket);
  }

  handleCancel(socket, session, message) {
    if (typeof message.id !== "string" || !OP_ID_PATTERN.test(message.id)) return;
    this.broadcast({ type: "cancel", user: session.user.id, id: message.id }, socket);
  }

  handleCursor(socket, session, message) {
    const isHidden = message.x === null;
    if (!isHidden && (!isWorldCoordinate(message.x, WORLD_WIDTH) || !isWorldCoordinate(message.y, WORLD_HEIGHT))) return;
    this.broadcast({ type: "cursor", user: session.user.id, x: isHidden ? null : Math.round(message.x), y: isHidden ? null : Math.round(message.y) }, socket);
  }

  findOp(id) {
    return this.ctx.storage.sql.exec("SELECT * FROM ops WHERE id = ?", id).toArray()[0];
  }

  opCount() {
    return this.ctx.storage.sql.exec("SELECT COUNT(*) AS total FROM ops").one().total;
  }

  insertOp(id, owner, drawing) {
    this.ctx.storage.sql.exec("INSERT INTO ops (id, owner, tool, color, size, points) VALUES (?, ?, ?, ?, ?, ?)", id, owner, drawing.tool, drawing.color, drawing.size, JSON.stringify(drawing.points));
    return this.findOp(id);
  }

  broadcastOp(row) {
    for (const socket of this.authedSockets()) this.send(socket, { type: "op", op: this.serializeOp(row, socket.deserializeAttachment().clientKey) });
  }

  acknowledgeExisting(socket, session, id) {
    const existing = this.findOp(id);
    if (!existing) return false;
    this.send(socket, { type: "op", op: this.serializeOp(existing, session.clientKey) });
    return true;
  }

  handleCommit(socket, session, message) {
    const op = message.op;
    if (!op || typeof op.id !== "string" || !OP_ID_PATTERN.test(op.id)) return;
    if (this.acknowledgeExisting(socket, session, op.id)) return;
    const drawing = parseDrawing(op, MAX_STROKE_POINTS);
    if (!drawing) return this.send(socket, { type: "rejected", id: op.id, code: "invalid" });
    if (this.opCount() >= MAX_OPS) return this.send(socket, { type: "rejected", id: op.id, code: "room_full" });
    this.broadcastOp(this.insertOp(op.id, session.clientKey, drawing));
  }

  handleClear(socket, session, message) {
    if (typeof message.id !== "string" || !OP_ID_PATTERN.test(message.id)) return;
    if (this.acknowledgeExisting(socket, session, message.id)) return;
    const now = Date.now();
    if (now - this.lastClearAt < CLEAR_COOLDOWN_MS) return this.send(socket, { type: "rejected", id: message.id, code: "cooldown" });
    this.lastClearAt = now;
    const previousClear = this.ctx.storage.sql.exec("SELECT seq FROM ops WHERE tool = 'clear' AND undone = 0 ORDER BY seq DESC LIMIT 1").toArray()[0];
    if (previousClear) this.ctx.storage.sql.exec("DELETE FROM ops WHERE seq < ?", previousClear.seq);
    if (previousClear) this.broadcast({ type: "pruned", beforeSeq: previousClear.seq });
    this.broadcastOp(this.insertOp(message.id, session.clientKey, { tool: "clear", color: "", size: 0, points: [] }));
  }

  handleUndoToggle(socket, session, message, isUndo) {
    if (typeof message.id !== "string" || !OP_ID_PATTERN.test(message.id)) return;
    const row = this.findOp(message.id);
    if (!row || row.owner !== session.clientKey || (row.undone === 1) === isUndo) return;
    this.ctx.storage.sql.exec("UPDATE ops SET undone = ? WHERE id = ?", isUndo ? 1 : 0, message.id);
    this.broadcast({ type: "undone", id: message.id, undone: isUndo });
  }

  handleBackground(socket, session, message) {
    if (typeof message.color !== "string" || !COLOR_PATTERN.test(message.color)) return;
    this.ctx.storage.sql.exec("INSERT INTO room_meta (key, value) VALUES ('background', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", message.color);
    this.broadcast({ type: "background", color: message.color, user: session.user.id });
  }

  webSocketClose(socket, code) {
    this.handleDeparture(socket);
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code, "closing");
    } catch {}
  }

  webSocketError(socket) {
    this.handleDeparture(socket);
  }

  handleDeparture(socket) {
    this.rateBuckets.delete(socket);
    const session = socket.deserializeAttachment();
    if (!session?.isAuthed) return;
    socket.serializeAttachment({ isAuthed: false });
    this.broadcast({ type: "leave", user: session.user.id }, socket);
  }
}
