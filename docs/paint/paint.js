import { PaintConnection } from "./connection.js?v=2";
import { SHAPE_TOOLS, constrainShape, drawStroke, renderOps, simplifyPoints } from "./canvas.js?v=2";

const PRODUCTION_SOCKET = "wss://edupage-proxy.loduur.workers.dev";
const LOCAL_SOCKET = "ws://localhost:8790";
const SOCKET_BASE = ["localhost", "127.0.0.1"].includes(location.hostname) ? LOCAL_SOCKET : PRODUCTION_SOCKET;
const DEFAULT_ROOM = "klase";
const DEFAULT_WORLD = { width: 1600, height: 1000 };
const BACKING_SCALE = 2;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.25;
const WORLD_MARGIN = 150;
const MIN_POINT_DISTANCE = 0.4;
const LIVE_SEND_INTERVAL_MS = 40;
const MAX_LIVE_BATCH_POINTS = 500;
const MAX_COMMIT_POINTS = 4000;
const CURSOR_SEND_INTERVAL_MS = 50;
const OUTBOX_RETRY_MS = 4000;
const CURSOR_IDLE_MS = 8000;
const CURSOR_SWEEP_MS = 2000;
const TOAST_DURATION_MS = 3200;
const MAX_VISIBLE_AVATARS = 4;
const STORAGE_KEYS = { name: "paint-name", clientKey: "paint-client-key", settings: "paint-settings" };
const PRESET_COLORS = ["#1c1c1e", "#ffffff", "#8e8e93", "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#0a84ff", "#5856d6", "#af52de", "#ff2d55", "#a2845e"];
const TOOL_KEYS = { b: "brush", e: "eraser", l: "line", r: "rect", o: "ellipse", h: "hand" };
const STATUS_TEXT = { online: "Tiešsaistē", connecting: "Savieno…", retrying: "Atjauno…", offline: "Bezsaistē", full: "Istaba pilna" };
const REJECTION_TEXT = { invalid: "Zīmējumu neizdevās saglabāt", room_full: "Audekls ir pilns — notīriet to, lai zīmētu tālāk", cooldown: "Audeklu tikko notīrīja — pagaidi mirkli" };

const $ = id => document.getElementById(id);
const viewport = $("viewport");
const stage = $("stage");
const committedLayer = $("committed-layer");
const liveLayer = $("live-layer");
const committedContext = committedLayer.getContext("2d");
const liveContext = liveLayer.getContext("2d");
const cursorsLayer = $("cursors");
const brushRing = $("brush-ring");

const room = parseRoom(new URLSearchParams(location.search).get("room"));
const clientKey = readClientKey();

const state = {
  world: DEFAULT_WORLD,
  me: null,
  users: new Map(),
  ops: [],
  opsById: new Map(),
  pendingSnapshot: null,
  isReady: false,
  background: "#ffffff",
  live: new Map(),
  outbox: new Map(),
  redoStack: [],
  tool: "brush",
  color: PRESET_COLORS[8],
  sizes: { brush: 6, eraser: 28, shape: 4 },
  view: { x: 0, y: 0, scale: 1, isFitted: true },
  connectionState: "connecting",
};

const frame = { isScheduled: false, needsFullRedraw: false, isLiveDirty: false, isViewDirty: true };
const pointers = new Map();
const cursors = new Map();
let drawing = null;
let panning = null;
let pinch = null;
let isSpaceHeld = false;
let lastCursorSentAt = 0;
let connection = null;

function parseRoom(raw) {
  const normalized = (raw || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return normalized || DEFAULT_ROOM;
}

function readStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {}
}

function readClientKey() {
  const stored = readStorage(sessionStorage, STORAGE_KEYS.clientKey);
  if (stored && /^[0-9a-f]{32}$/.test(stored)) return stored;
  const generated = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  writeStorage(sessionStorage, STORAGE_KEYS.clientKey, generated);
  return generated;
}

function loadSettings() {
  try {
    const saved = JSON.parse(readStorage(localStorage, STORAGE_KEYS.settings) || "{}");
    if (/^#[0-9a-f]{6}$/.test(saved.color)) state.color = saved.color;
    for (const key of Object.keys(state.sizes)) {
      if (Number.isInteger(saved.sizes?.[key]) && saved.sizes[key] >= 1 && saved.sizes[key] <= 120) state.sizes[key] = saved.sizes[key];
    }
  } catch {}
}

function saveSettings() {
  writeStorage(localStorage, STORAGE_KEYS.settings, JSON.stringify({ color: state.color, sizes: state.sizes }));
}

function makeOpId() {
  return crypto.randomUUID();
}

function sizeKeyFor(tool) {
  if (tool === "eraser") return "eraser";
  return SHAPE_TOOLS.has(tool) ? "shape" : "brush";
}

function currentSize() {
  return state.sizes[sizeKeyFor(state.tool)];
}

function requestFrame() {
  if (frame.isScheduled) return;
  frame.isScheduled = true;
  requestAnimationFrame(renderFrame);
}

function renderFrame() {
  frame.isScheduled = false;
  if (frame.needsFullRedraw) {
    frame.needsFullRedraw = false;
    renderOps(committedContext, state.ops, state.world.width, state.world.height);
  }
  if (frame.isLiveDirty) {
    frame.isLiveDirty = false;
    liveContext.clearRect(0, 0, state.world.width, state.world.height);
    for (const stroke of state.live.values()) drawStroke(liveContext, stroke, state.background);
  }
  if (frame.isViewDirty) {
    frame.isViewDirty = false;
    applyView();
  }
}

function markLiveDirty() {
  frame.isLiveDirty = true;
  requestFrame();
}

function markFullRedraw() {
  frame.needsFullRedraw = true;
  requestFrame();
}

function configureWorld(world) {
  state.world = world;
  for (const layer of [committedLayer, liveLayer]) {
    layer.width = world.width * BACKING_SCALE;
    layer.height = world.height * BACKING_SCALE;
    layer.getContext("2d").setTransform(BACKING_SCALE, 0, 0, BACKING_SCALE, 0, 0);
  }
  stage.style.width = `${world.width}px`;
  stage.style.height = `${world.height}px`;
  fitView();
}

function viewportInsets() {
  const isCompact = innerWidth <= 760;
  return isCompact ? { top: 110, right: 12, bottom: 220, left: 12 } : { top: 76, right: 24, bottom: 84, left: 80 };
}

function fitView() {
  const insets = viewportInsets();
  const availableWidth = Math.max(100, innerWidth - insets.left - insets.right);
  const availableHeight = Math.max(100, innerHeight - insets.top - insets.bottom);
  const scale = Math.min(availableWidth / state.world.width, availableHeight / state.world.height);
  state.view = {
    scale,
    x: insets.left + (availableWidth - state.world.width * scale) / 2,
    y: insets.top + (availableHeight - state.world.height * scale) / 2,
    isFitted: true,
  };
  frame.isViewDirty = true;
  requestFrame();
}

function zoomAt(screenX, screenY, nextScale) {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
  const ratio = scale / state.view.scale;
  state.view = { scale, x: screenX - (screenX - state.view.x) * ratio, y: screenY - (screenY - state.view.y) * ratio, isFitted: false };
  frame.isViewDirty = true;
  requestFrame();
}

function zoomByStep(direction) {
  zoomAt(innerWidth / 2, innerHeight / 2, state.view.scale * ZOOM_STEP ** direction);
}

function panBy(dx, dy) {
  state.view.x += dx;
  state.view.y += dy;
  state.view.isFitted = false;
  frame.isViewDirty = true;
  requestFrame();
}

function applyView() {
  const { x, y, scale } = state.view;
  stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  $("zoom-value").textContent = `${Math.round(scale * 100)}%`;
  for (const cursor of cursors.values()) positionCursor(cursor);
  updateBrushRingSize();
}

function toWorld(clientX, clientY) {
  const x = (clientX - state.view.x) / state.view.scale;
  const y = (clientY - state.view.y) / state.view.scale;
  return [
    Math.min(state.world.width + WORLD_MARGIN, Math.max(-WORLD_MARGIN, x)),
    Math.min(state.world.height + WORLD_MARGIN, Math.max(-WORLD_MARGIN, y)),
  ];
}

function toScreen(worldX, worldY) {
  return [worldX * state.view.scale + state.view.x, worldY * state.view.scale + state.view.y];
}

function indexOps(ops) {
  state.ops = ops;
  state.opsById = new Map(ops.map(op => [op.id, op]));
}

function appendOp(op) {
  state.ops.push(op);
  state.opsById.set(op.id, op);
  if (op.undone) return;
  if (op.tool === "clear") committedContext.clearRect(0, 0, state.world.width, state.world.height);
  else drawStroke(committedContext, op);
}

function lastOwnActiveOp() {
  for (let index = state.ops.length - 1; index >= 0; index--) {
    const op = state.ops[index];
    if (op.mine && !op.undone) return op;
  }
  return null;
}

function updateHistoryButtons() {
  $("undo").disabled = !state.isReady || !lastOwnActiveOp();
  $("redo").disabled = !state.isReady || !state.redoStack.some(id => state.opsById.has(id));
}

function handleMessage(message) {
  switch (message.type) {
    case "welcome": return handleWelcome(message);
    case "ops": return state.pendingSnapshot?.push(...message.ops);
    case "ready": return handleReady();
    case "op": return handleOp(message.op);
    case "undone": return handleUndone(message);
    case "pruned": return handlePruned(message.beforeSeq);
    case "rejected": return handleRejected(message);
    case "background": return applyBackground(message.color);
    case "join": return handleJoin(message.user);
    case "leave": return handleLeave(message.user);
    case "live": return handleLive(message);
    case "cancel": return removeLive(message.id);
    case "cursor": return handleCursor(message);
  }
}

function handleWelcome(message) {
  state.pendingSnapshot = [];
  state.isReady = false;
  state.me = message.me;
  state.users = new Map([[message.me.id, message.me], ...message.users.map(user => [user.id, user])]);
  for (const [id, stroke] of state.live) if (stroke.user !== "me") state.live.delete(id);
  for (const cursor of cursors.values()) cursor.element.remove();
  cursors.clear();
  if (message.world.width !== state.world.width || message.world.height !== state.world.height) configureWorld(message.world);
  applyBackground(message.background);
  renderPeople();
  markLiveDirty();
}

function handleReady() {
  indexOps(state.pendingSnapshot || []);
  state.pendingSnapshot = null;
  state.isReady = true;
  for (const id of state.live.keys()) if (state.opsById.has(id)) state.live.delete(id);
  resendQueued(0);
  markFullRedraw();
  markLiveDirty();
  $("loading").hidden = true;
  setStatus("online");
  updateHistoryButtons();
}

function handleOp(op) {
  state.outbox.delete(op.id);
  const known = state.opsById.get(op.id);
  if (known) {
    known.mine = op.mine;
  } else if (state.pendingSnapshot) {
    state.pendingSnapshot.push(op);
  } else {
    appendOp(op);
    if (op.tool === "clear" && !op.mine) toast("Audekls notīrīts · tas, kurš notīrīja, var to atsaukt");
  }
  removeLive(op.id);
  updateHistoryButtons();
  refreshStatusText();
}

function handleUndone({ id, undone }) {
  const op = state.opsById.get(id);
  if (!op) return;
  op.undone = undone;
  markFullRedraw();
  updateHistoryButtons();
}

function handlePruned(beforeSeq) {
  indexOps(state.ops.filter(op => op.seq >= beforeSeq));
  state.redoStack = state.redoStack.filter(id => state.opsById.has(id));
  updateHistoryButtons();
}

function handleRejected({ id, code }) {
  state.outbox.delete(id);
  removeLive(id);
  toast(REJECTION_TEXT[code] || REJECTION_TEXT.invalid);
  refreshStatusText();
}

function handleJoin(user) {
  state.users.set(user.id, user);
  renderPeople();
  toast(`${user.name} pievienojās`);
}

function handleLeave(userId) {
  const user = state.users.get(userId);
  state.users.delete(userId);
  for (const [id, stroke] of state.live) if (stroke.user === userId) state.live.delete(id);
  cursors.get(userId)?.element.remove();
  cursors.delete(userId);
  markLiveDirty();
  renderPeople();
  if (user) toast(`${user.name} izgāja`);
}

function handleLive(message) {
  const existing = state.live.get(message.id);
  if (existing && !message.reset) existing.points.push(...message.points);
  else state.live.set(message.id, { user: message.user, tool: message.tool, color: message.color, size: message.size, points: message.points });
  markLiveDirty();
}

function removeLive(id) {
  if (state.live.delete(id)) markLiveDirty();
}

function handleCursor({ user: userId, x, y }) {
  const user = state.users.get(userId);
  if (!user) return;
  let cursor = cursors.get(userId);
  if (!cursor) {
    cursor = createCursor(user);
    cursors.set(userId, cursor);
  }
  cursor.isHidden = x === null;
  cursor.x = x;
  cursor.y = y;
  cursor.lastSeenAt = Date.now();
  cursor.element.classList.remove("is-idle");
  positionCursor(cursor);
}

function createCursor(user) {
  const element = document.createElement("div");
  element.className = "remote-cursor";
  element.style.setProperty("--cursor-color", user.color);
  element.innerHTML = `<svg><use href="#i-cursor"/></svg><span></span>`;
  element.querySelector("span").textContent = user.name;
  cursorsLayer.appendChild(element);
  return { element, x: 0, y: 0, isHidden: true, lastSeenAt: Date.now() };
}

function positionCursor(cursor) {
  cursor.element.style.opacity = cursor.isHidden ? "0" : "";
  if (cursor.isHidden) return;
  const [screenX, screenY] = toScreen(cursor.x, cursor.y);
  cursor.element.style.transform = `translate(${screenX - 3}px, ${screenY - 3}px)`;
}

function sweepIdleCursors() {
  const now = Date.now();
  for (const cursor of cursors.values()) cursor.element.classList.toggle("is-idle", now - cursor.lastSeenAt > CURSOR_IDLE_MS);
}

function applyBackground(color) {
  state.background = color;
  stage.style.backgroundColor = color;
  $("bg-swatch").style.background = color;
  $("bg-input").value = color;
  markLiveDirty();
}

function initials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
}

function createAvatar(user) {
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.style.setProperty("--avatar-color", user.color);
  avatar.textContent = initials(user.name);
  avatar.title = user.name;
  return avatar;
}

function orderedUsers() {
  const others = [...state.users.values()].filter(user => user.id !== state.me?.id).sort((a, b) => a.name.localeCompare(b.name, "lv"));
  return state.me ? [state.me, ...others] : others;
}

function renderPeople() {
  const users = orderedUsers();
  const avatars = $("avatars");
  avatars.replaceChildren(...users.slice(0, MAX_VISIBLE_AVATARS).map(createAvatar));
  if (users.length > MAX_VISIBLE_AVATARS) {
    const more = document.createElement("span");
    more.className = "avatar more";
    more.textContent = `+${users.length - MAX_VISIBLE_AVATARS}`;
    avatars.appendChild(more);
  }
  $("people-count").textContent = String(users.length);
  const heading = document.createElement("div");
  heading.className = "people-heading";
  heading.textContent = `Istabā ${users.length}`;
  const rows = users.map(user => {
    const row = document.createElement("div");
    row.className = "people-row";
    const name = document.createElement("b");
    name.textContent = user.name;
    row.append(createAvatar(user), name);
    if (user.id === state.me?.id) {
      const note = document.createElement("small");
      note.textContent = "tu";
      row.appendChild(note);
    }
    return row;
  });
  $("people-list").replaceChildren(heading, ...rows);
  $("clear-count").textContent = String(users.length);
}

function setStatus(connectionState) {
  state.connectionState = connectionState;
  $("status").dataset.state = connectionState;
  refreshStatusText();
}

function refreshStatusText() {
  const pending = state.outbox.size;
  const base = STATUS_TEXT[state.connectionState] || "";
  $("status-text").textContent = pending && state.connectionState !== "online" ? `${base} · ${pending} gaida` : base;
}

function handleConnectionStatus({ state: connectionState }) {
  setStatus(connectionState);
  if (connectionState === "full") toast("Istabā nav vietas — mēģinās vēlreiz");
}

function toast(text) {
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = text;
  $("toasts").appendChild(element);
  setTimeout(() => {
    element.classList.add("is-leaving");
    setTimeout(() => element.remove(), 300);
  }, TOAST_DURATION_MS);
}

function sendQueued(id, message) {
  state.outbox.set(id, { message, sentAt: Date.now() });
  connection?.send(message);
  refreshStatusText();
}

function resendQueued(olderThanMs) {
  if (!state.isReady || !connection?.isOpen) return;
  const now = Date.now();
  for (const entry of state.outbox.values()) {
    if (now - entry.sentAt < olderThanMs) continue;
    entry.sentAt = now;
    connection.send(entry.message);
  }
}

function beginDrawing(event) {
  const [x, y] = toWorld(event.clientX, event.clientY);
  const isShape = SHAPE_TOOLS.has(state.tool);
  drawing = {
    id: makeOpId(),
    pointerId: event.pointerId,
    tool: state.tool,
    color: state.tool === "eraser" ? "" : state.color,
    size: currentSize(),
    isShape,
    origin: [x, y],
    sentPointCount: 0,
    hasUnsentShape: true,
    sendTimer: setInterval(flushLive, LIVE_SEND_INTERVAL_MS),
  };
  state.live.set(drawing.id, { user: "me", tool: drawing.tool, color: drawing.color, size: drawing.size, points: isShape ? [x, y, x, y] : [x, y] });
  markLiveDirty();
}

function extendDrawing(event) {
  const stroke = state.live.get(drawing.id);
  if (!stroke) return;
  if (drawing.isShape) {
    const [x, y] = toWorld(event.clientX, event.clientY);
    const [endX, endY] = event.shiftKey ? constrainShape(drawing.tool, ...drawing.origin, x, y) : [x, y];
    stroke.points = [...drawing.origin, endX, endY];
    drawing.hasUnsentShape = true;
  } else {
    const samples = event.getCoalescedEvents?.() || [];
    for (const sample of samples.length ? samples : [event]) appendPoint(stroke.points, ...toWorld(sample.clientX, sample.clientY));
  }
  markLiveDirty();
}

function appendPoint(points, x, y) {
  const lastX = points[points.length - 2];
  const lastY = points[points.length - 1];
  if (Math.hypot(x - lastX, y - lastY) < MIN_POINT_DISTANCE) return;
  points.push(x, y);
}

function flushLive() {
  const stroke = drawing && state.live.get(drawing.id);
  if (!stroke || !connection?.isOpen) return;
  const base = { type: "live", id: drawing.id, tool: drawing.tool, color: drawing.color, size: drawing.size };
  if (drawing.isShape) {
    if (!drawing.hasUnsentShape) return;
    drawing.hasUnsentShape = false;
    connection.send({ ...base, reset: true, points: stroke.points.map(roundCoordinate) });
    return;
  }
  const totalPoints = stroke.points.length / 2;
  while (drawing.sentPointCount < totalPoints) {
    const end = Math.min(totalPoints, drawing.sentPointCount + MAX_LIVE_BATCH_POINTS);
    const points = stroke.points.slice(drawing.sentPointCount * 2, end * 2).map(roundCoordinate);
    connection.send({ ...base, reset: drawing.sentPointCount === 0, points });
    drawing.sentPointCount = end;
  }
}

function roundCoordinate(value) {
  return Math.round(value * 10) / 10;
}

function finishDrawing() {
  if (!drawing) return;
  const finished = drawing;
  clearInterval(finished.sendTimer);
  drawing = null;
  const stroke = state.live.get(finished.id);
  if (!stroke) return;
  if (finished.isShape && stroke.points[0] === stroke.points[2] && stroke.points[1] === stroke.points[3]) {
    cancelOwnLive(finished.id);
    return;
  }
  const points = finished.isShape ? stroke.points.map(roundCoordinate) : simplifyPoints(stroke.points);
  state.live.delete(finished.id);
  splitPoints(points).forEach((chunk, index) => {
    const id = index === 0 ? finished.id : `${finished.id}-${index}`;
    const op = { id, tool: finished.tool, color: finished.color, size: finished.size, points: chunk };
    state.live.set(id, { user: "me", ...op });
    sendQueued(id, { type: "commit", op });
  });
  state.redoStack = [];
  markLiveDirty();
  updateHistoryButtons();
}

function splitPoints(points) {
  const limit = MAX_COMMIT_POINTS * 2;
  if (points.length <= limit) return [points];
  const chunks = [];
  for (let start = 0; start < points.length - 2; start += limit - 2) chunks.push(points.slice(start, start + limit));
  return chunks;
}

function cancelDrawing() {
  if (!drawing) return;
  clearInterval(drawing.sendTimer);
  cancelOwnLive(drawing.id);
  drawing = null;
}

function cancelOwnLive(id) {
  state.live.delete(id);
  connection?.send({ type: "cancel", id });
  markLiveDirty();
}

function undo() {
  const op = lastOwnActiveOp();
  if (!op || !connection?.send({ type: "undo", id: op.id })) return;
  state.redoStack.push(op.id);
  updateHistoryButtons();
}

function redo() {
  while (state.redoStack.length) {
    const id = state.redoStack.pop();
    if (!state.opsById.get(id)?.undone) continue;
    if (!connection?.send({ type: "redo", id })) state.redoStack.push(id);
    break;
  }
  updateHistoryButtons();
}

function openClearDialog() {
  if (!state.isReady) return;
  $("clear-dialog").hidden = false;
  $("clear-cancel").focus();
}

function closeClearDialog() {
  $("clear-dialog").hidden = true;
}

function confirmClear() {
  closeClearDialog();
  const id = makeOpId();
  sendQueued(id, { type: "clear", id });
  state.redoStack = [];
}

function sendCursor(clientX, clientY) {
  const now = Date.now();
  if (now - lastCursorSentAt < CURSOR_SEND_INTERVAL_MS || !state.isReady) return;
  lastCursorSentAt = now;
  const [x, y] = toWorld(clientX, clientY);
  connection?.send({ type: "cursor", x: Math.round(x), y: Math.round(y) });
}

function hideOwnCursor() {
  lastCursorSentAt = 0;
  brushRing.classList.remove("is-visible");
  connection?.send({ type: "cursor", x: null, y: null });
}

function updateBrushRingSize() {
  const diameter = Math.max(4, currentSize() * state.view.scale);
  brushRing.style.width = `${diameter}px`;
  brushRing.style.height = `${diameter}px`;
  brushRing.style.marginLeft = `${-diameter / 2}px`;
  brushRing.style.marginTop = `${-diameter / 2}px`;
}

function moveBrushRing(event) {
  const isVisible = (state.tool === "brush" || state.tool === "eraser") && event.pointerType !== "touch" && !isSpaceHeld && !panning;
  brushRing.classList.toggle("is-visible", isVisible);
  if (isVisible) brushRing.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
}

function startPan(event) {
  panning = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
  viewport.classList.add("is-panning");
}

function startPinch() {
  const [first, second] = [...pointers.values()];
  pinch = {
    distance: Math.hypot(second.x - first.x, second.y - first.y) || 1,
    midX: (first.x + second.x) / 2,
    midY: (first.y + second.y) / 2,
    view: { ...state.view },
  };
}

function updatePinch() {
  const [first, second] = [...pointers.values()];
  const distance = Math.hypot(second.x - first.x, second.y - first.y) || 1;
  const midX = (first.x + second.x) / 2;
  const midY = (first.y + second.y) / 2;
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.view.scale * distance / pinch.distance));
  const ratio = scale / pinch.view.scale;
  state.view = { scale, x: midX - (pinch.midX - pinch.view.x) * ratio, y: midY - (pinch.midY - pinch.view.y) * ratio, isFitted: false };
  frame.isViewDirty = true;
  requestFrame();
}

function handlePointerDown(event) {
  if (!state.isReady) return;
  viewport.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) {
    cancelDrawing();
    panning = null;
    startPinch();
    return;
  }
  if (pointers.size > 2) return;
  const wantsPan = event.button === 1 || state.tool === "hand" || isSpaceHeld;
  if (wantsPan) {
    event.preventDefault();
    startPan(event);
    return;
  }
  if (event.button !== 0) return;
  beginDrawing(event);
}

function handlePointerMove(event) {
  moveBrushRing(event);
  if (event.pointerType !== "touch" || pointers.has(event.pointerId)) sendCursor(event.clientX, event.clientY);
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinch && pointers.size === 2) return updatePinch();
  if (panning?.pointerId === event.pointerId) {
    panBy(event.clientX - panning.lastX, event.clientY - panning.lastY);
    panning.lastX = event.clientX;
    panning.lastY = event.clientY;
    return;
  }
  if (drawing?.pointerId === event.pointerId) extendDrawing(event);
}

function handlePointerEnd(event) {
  pointers.delete(event.pointerId);
  if (pinch) {
    if (pointers.size < 2) pinch = null;
    return;
  }
  if (panning?.pointerId === event.pointerId) {
    panning = null;
    viewport.classList.remove("is-panning");
  }
  if (drawing?.pointerId === event.pointerId) {
    if (event.type === "pointercancel") cancelDrawing();
    else finishDrawing();
  }
  if (event.pointerType === "touch") hideOwnCursor();
}

function handleWheel(event) {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    zoomAt(event.clientX, event.clientY, state.view.scale * Math.exp(-event.deltaY * 0.01));
    return;
  }
  panBy(-event.deltaX, -event.deltaY);
}

function selectTool(tool) {
  if (drawing) finishDrawing();
  state.tool = tool;
  viewport.dataset.tool = tool;
  for (const button of document.querySelectorAll(".tool[data-tool]")) button.setAttribute("aria-checked", String(button.dataset.tool === tool));
  syncSizeControls();
}

function selectColor(color) {
  state.color = color;
  if (state.tool === "eraser" || state.tool === "hand") selectTool("brush");
  const isPreset = PRESET_COLORS.includes(color);
  for (const swatch of document.querySelectorAll(".swatch")) swatch.setAttribute("aria-checked", String(swatch.dataset.color === color));
  document.querySelector(".custom-color").classList.toggle("is-active", !isPreset);
  $("custom-color-fill").style.setProperty("--custom", color);
  $("color-input").value = color;
  syncSizeControls();
  saveSettings();
}

function setSize(size) {
  state.sizes[sizeKeyFor(state.tool)] = Math.min(120, Math.max(1, Math.round(size)));
  syncSizeControls();
  saveSettings();
}

function syncSizeControls() {
  const size = currentSize();
  $("size-input").value = String(size);
  $("size-value").textContent = String(size);
  const dot = $("size-dot");
  const dotSize = Math.max(2, Math.min(34, size));
  dot.style.width = `${dotSize}px`;
  dot.style.height = `${dotSize}px`;
  dot.style.background = state.tool === "eraser" ? "transparent" : state.color;
  dot.style.boxShadow = state.tool === "eraser" ? "inset 0 0 0 1.5px var(--text-2)" : state.color === "#ffffff" ? "inset 0 0 0 1px var(--line-strong)" : "";
  $("stylebar").classList.toggle("is-eraser", state.tool === "eraser");
  updateBrushRingSize();
}

function buildPalette() {
  const palette = $("palette");
  for (const color of PRESET_COLORS) {
    const swatch = document.createElement("button");
    swatch.className = "swatch";
    swatch.type = "button";
    swatch.dataset.color = color;
    swatch.setAttribute("role", "radio");
    swatch.setAttribute("aria-label", color);
    swatch.style.setProperty("--swatch", color);
    if (color === "#ffffff") swatch.style.setProperty("--swatch-ring", "var(--text-3)");
    swatch.addEventListener("click", () => selectColor(color));
    palette.appendChild(swatch);
  }
}

function isTypingTarget(target) {
  return target instanceof HTMLInputElement && target.type !== "range" && target.type !== "color";
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    closeClearDialog();
    togglePeople(false);
    cancelDrawing();
    return;
  }
  if (isTypingTarget(event.target) || !$("gate").hidden || !$("clear-dialog").hidden) return;
  const key = event.key.toLowerCase();
  const isCommand = event.ctrlKey || event.metaKey;
  if (isCommand && key === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if (isCommand && key === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if (isCommand || event.altKey) return;
  if (event.key === " ") {
    event.preventDefault();
    isSpaceHeld = true;
    viewport.classList.add("is-panning-ready");
    brushRing.classList.remove("is-visible");
    return;
  }
  if (TOOL_KEYS[key]) return selectTool(TOOL_KEYS[key]);
  if (key === "[") return setSize(currentSize() - Math.max(1, Math.round(currentSize() * 0.15)));
  if (key === "]") return setSize(currentSize() + Math.max(1, Math.round(currentSize() * 0.15)));
  if (key === "0") return fitView();
  if (key === "+" || key === "=") return zoomByStep(1);
  if (key === "-") return zoomByStep(-1);
}

function handleKeyUp(event) {
  if (event.key !== " ") return;
  isSpaceHeld = false;
  viewport.classList.remove("is-panning-ready");
}

function togglePeople(isOpen) {
  const list = $("people-list");
  const shouldOpen = isOpen ?? list.hidden;
  list.hidden = !shouldOpen;
  $("people-button").setAttribute("aria-expanded", String(shouldOpen));
}

function bindUi() {
  for (const button of document.querySelectorAll(".tool[data-tool]")) button.addEventListener("click", () => selectTool(button.dataset.tool));
  $("undo").addEventListener("click", undo);
  $("redo").addEventListener("click", redo);
  $("clear").addEventListener("click", openClearDialog);
  $("clear-cancel").addEventListener("click", closeClearDialog);
  $("clear-confirm").addEventListener("click", confirmClear);
  $("clear-dialog").addEventListener("click", event => {
    if (event.target === event.currentTarget) closeClearDialog();
  });
  $("color-input").addEventListener("input", event => selectColor(event.target.value));
  $("size-input").addEventListener("input", event => setSize(Number(event.target.value)));
  $("bg-input").addEventListener("input", event => {
    applyBackground(event.target.value);
    connection?.send({ type: "background", color: event.target.value });
  });
  $("zoom-in").addEventListener("click", () => zoomByStep(1));
  $("zoom-out").addEventListener("click", () => zoomByStep(-1));
  $("zoom-value").addEventListener("click", fitView);
  $("people-button").addEventListener("click", () => togglePeople());
  document.addEventListener("pointerdown", event => {
    if (!event.target.closest(".people-panel")) togglePeople(false);
  });
  viewport.addEventListener("pointerdown", handlePointerDown);
  viewport.addEventListener("pointermove", handlePointerMove);
  viewport.addEventListener("pointerup", handlePointerEnd);
  viewport.addEventListener("pointercancel", handlePointerEnd);
  viewport.addEventListener("pointerleave", event => {
    if (!pointers.has(event.pointerId)) hideOwnCursor();
  });
  viewport.addEventListener("wheel", handleWheel, { passive: false });
  viewport.addEventListener("contextmenu", event => event.preventDefault());
  addEventListener("keydown", handleKeyDown);
  addEventListener("keyup", handleKeyUp);
  addEventListener("blur", () => {
    isSpaceHeld = false;
    viewport.classList.remove("is-panning-ready");
    finishDrawing();
  });
  addEventListener("resize", () => {
    if (state.view.isFitted) fitView();
  });
  $("gate-form").addEventListener("submit", handleGateSubmit);
}

function showGate() {
  $("gate").hidden = false;
  $("gate-room").textContent = room;
  $("gate-name").value = readStorage(localStorage, STORAGE_KEYS.name) || "";
  $("gate-error").hidden = true;
  $("gate-name").focus();
}

function handleGateSubmit(event) {
  event.preventDefault();
  const name = $("gate-name").value.replace(/\s+/g, " ").trim();
  if (!name) {
    $("gate-error").hidden = false;
    $("gate-error").textContent = "Ievadi savu vārdu.";
    return;
  }
  writeStorage(localStorage, STORAGE_KEYS.name, name);
  $("gate").hidden = true;
  startSession();
}

function startSession() {
  connection?.stop();
  $("loading").hidden = false;
  connection = new PaintConnection({
    url: `${SOCKET_BASE}/paint/rooms/${encodeURIComponent(room)}`,
    buildHello: () => ({
      type: "hello",
      name: readStorage(localStorage, STORAGE_KEYS.name) || "",
      clientKey,
    }),
    onMessage: handleMessage,
    onStatus: handleConnectionStatus,
  });
  connection.connect();
}

function start() {
  $("room-label").textContent = `Istaba: ${room}`;
  document.title = `${room} · Kopīgā zīmēšana`;
  loadSettings();
  buildPalette();
  configureWorld(DEFAULT_WORLD);
  bindUi();
  selectTool("brush");
  selectColor(state.color);
  setInterval(sweepIdleCursors, CURSOR_SWEEP_MS);
  setInterval(() => resendQueued(OUTBOX_RETRY_MS), OUTBOX_RETRY_MS);
  addEventListener("pagehide", () => connection?.stop());
  addEventListener("pageshow", event => {
    if (event.persisted && hasIdentity()) startSession();
  });
  if (hasIdentity()) startSession();
  else showGate();
}

function hasIdentity() {
  return Boolean(readStorage(localStorage, STORAGE_KEYS.name));
}

start();
