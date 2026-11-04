import { DurableObject } from "cloudflare:workers";
import {
  MAX_PLAYERS, MODES, STEP_MS, applyInput, assignTeams, createMatch, defaultSettings, forfeitMatch, removeOwner,
  sanitizeSettings, serializeMatch, setOwnerAi, sideHasHumans, stepMatch,
} from "../docs/pingpong/sim.js";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;
const CODE_PATTERN = /^[A-HJKMNP-Z2-9]{5}$/;
const CREATE_ATTEMPTS = 6;
const TOKEN_PATTERN = /^[0-9a-f-]{36}$/;
const MAX_MESSAGE_CHARS = 4096;
const MAX_NAME_CHARS = 16;
const TICK_MS = 33;
const MAX_CATCHUP_MS = 250;
const SWEEP_MS = 1000;
const RECONNECT_GRACE_MS = 20000;
const EMPTY_LOBBY_MS = 60000;
const IDLE_LOBBY_MS = 15 * 60000;
const RESULTS_MS = 45000;
const INTERMISSION_MS = 4000;
const STAND_IN_AI = "normal";
const RATE_REFILL_PER_SEC = 60;
const RATE_BURST = 120;
const CLOSE_GONE = 4004;

function createCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function connectLobby(env, code, action) {
  const stub = env.PINGPONG.get(env.PINGPONG.idFromName(code));
  return stub.fetch(`https://lobby/${action}?code=${code}`, { headers: { Upgrade: "websocket" } });
}

export async function handlePingPong(request, env, url, allowedOrigins) {
  if (request.headers.get("Upgrade") !== "websocket") return new Response("websocket required", { status: 426 });
  if (!allowedOrigins.includes(request.headers.get("Origin") || "")) return new Response("forbidden", { status: 403 });
  if (!env.PINGPONG) return new Response("pingpong not configured", { status: 503 });
  if (url.pathname === "/pingpong/create") {
    for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
      const response = await connectLobby(env, createCode(), "create");
      if (response.status === 101) return response;
    }
    return new Response("no free code", { status: 503 });
  }
  const code = url.pathname.startsWith("/pingpong/lobbies/") ? url.pathname.slice("/pingpong/lobbies/".length).toUpperCase() : "";
  if (!CODE_PATTERN.test(code)) return new Response("not found", { status: 404 });
  return connectLobby(env, code, "join");
}

function cleanName(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_CHARS);
}

function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
  }
  return copy;
}

export class PingPongLobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sockets = new Map();
    this.code = null;
    this.resetLobbyState();
  }

  resetLobbyState() {
    this.players = new Map();
    this.hostId = null;
    this.settings = defaultSettings();
    this.phase = "lobby";
    this.match = null;
    this.teams = null;
    this.bracket = null;
    this.result = null;
    this.phaseEndsAt = 0;
    this.emptySince = 0;
    this.lastActivityAt = Date.now();
    this.nextPlayerNumber = 1;
    this.tickTimer = 0;
    this.sweepTimer = 0;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const isCreate = url.pathname === "/create";
    if (isCreate && this.code) return new Response("taken", { status: 409 });
    if (isCreate) this.openLobby(url.searchParams.get("code"));
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.sockets.set(server, { playerId: null, tokens: RATE_BURST, refilledAt: Date.now() });
    server.addEventListener("message", event => this.handleSocketMessage(server, event.data));
    server.addEventListener("close", () => this.handleSocketGone(server));
    server.addEventListener("error", () => this.handleSocketGone(server));
    if (!this.code) this.rejectSocket(server, "not_found");
    return new Response(null, { status: 101, webSocket: client });
  }

  openLobby(code) {
    this.resetLobbyState();
    this.code = code;
    this.emptySince = Date.now();
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_MS);
  }

  closeLobby(reason) {
    clearInterval(this.tickTimer);
    clearInterval(this.sweepTimer);
    for (const socket of this.sockets.keys()) {
      this.send(socket, { type: "error", code: reason });
      try {
        socket.close(CLOSE_GONE, reason);
      } catch {}
    }
    this.sockets.clear();
    this.code = null;
    this.resetLobbyState();
  }

  send(socket, message) {
    try {
      socket.send(typeof message === "string" ? message : JSON.stringify(message));
    } catch {
      this.handleSocketGone(socket);
    }
  }

  broadcast(message) {
    const text = JSON.stringify(message);
    for (const [socket, session] of this.sockets) if (session.playerId) this.send(socket, text);
  }

  lobbyView() {
    return {
      type: "lobby",
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      settings: this.settings,
      players: [...this.players.values()].map(({ id, name, socket }) => ({ id, name, isConnected: Boolean(socket) })),
      teams: this.teams,
      result: this.result,
      nextMatchIn: this.phase === "intermission" ? Math.max(0, this.phaseEndsAt - Date.now()) : 0,
    };
  }

  broadcastLobby() {
    this.broadcast(this.lobbyView());
  }

  isWithinRate(session) {
    const now = Date.now();
    session.tokens = Math.min(RATE_BURST, session.tokens + (now - session.refilledAt) / 1000 * RATE_REFILL_PER_SEC);
    session.refilledAt = now;
    if (session.tokens < 1) return false;
    session.tokens -= 1;
    return true;
  }

  handleSocketMessage(socket, raw) {
    const session = this.sockets.get(socket);
    if (!session) return;
    if (raw === "ping") return this.send(socket, "pong");
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_CHARS) return socket.close(1009, "message too large");
    if (!this.isWithinRate(session)) return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message.type !== "string") return;
    if (!session.playerId) {
      if (message.type === "hello") this.handleHello(socket, session, message);
      return;
    }
    const player = this.players.get(session.playerId);
    if (!player) return;
    switch (message.type) {
      case "input": return this.handleInput(player, message);
      case "settings": return this.handleSettings(player, message);
      case "start": return this.handleStart(player);
      case "toLobby": return this.handleToLobby(player);
      case "leave": return this.removePlayer(player.id);
    }
  }

  handleHello(socket, session, message) {
    const token =typeof message.token === "string" && TOKEN_PATTERN.test(message.token) ? message.token : null;
    const returning = token && [...this.players.values()].find(player => player.token === token);
    if (returning) return this.resumePlayer(socket, session, returning);
    if (this.players.size >= MAX_PLAYERS) return this.rejectSocket(socket, "full");
    const player = {
      id: `p${this.nextPlayerNumber++}`,
      token: crypto.randomUUID(),
      name: cleanName(message.name) || `Spēlētājs ${this.nextPlayerNumber - 1}`,
      socket,
      goneAt: 0,
    };
    this.players.set(player.id, player);
    this.hostId ??= player.id;
    session.playerId = player.id;
    this.lastActivityAt = Date.now();
    this.emptySince = 0;
    this.welcome(socket, player);
    this.broadcastLobby();
  }

  rejectSocket(socket, code) {
    this.send(socket, { type: "error", code });
    this.sockets.delete(socket);
    try {
      socket.close(CLOSE_GONE, code);
    } catch {}
  }

  resumePlayer(socket, session, player) {
    if (player.socket && player.socket !== socket) this.rejectSocket(player.socket, "replaced");
    player.socket = socket;
    player.goneAt = 0;
    session.playerId = player.id;
    this.emptySince = 0;
    if (this.match) setOwnerAi(this.match, player.id, null);
    this.welcome(socket, player);
    this.broadcastLobby();
  }

  welcome(socket, player) {
    this.send(socket, { type: "welcome", me: player.id, token: player.token, code: this.code });
    this.send(socket, this.lobbyView());
    this.send(socket, { type: "ready" });
  }

  handleInput(player, message) {
    if (this.match) applyInput(this.match, player.id, message);
  }

  handleSettings(player, message) {
    if (player.id !== this.hostId || this.phase !== "lobby") return;
    this.settings = sanitizeSettings(message.settings, this.settings);
    this.lastActivityAt = Date.now();
    this.broadcastLobby();
  }

  handleStart(player) {
    if (player.id !== this.hostId || (this.phase !== "lobby" && this.phase !== "results")) return;
    const ids = [...this.players.keys()];
    const mode = MODES[this.settings.mode];
    if (ids.length < mode.minPlayers) return this.send(player.socket, { type: "notice", code: "need_players" });
    this.lastActivityAt = Date.now();
    this.result = null;
    if (mode.isBracket) {
      this.bracket = { round: shuffled(ids), winners: [] };
      this.startNextBracketMatch();
      return;
    }
    this.bracket = null;
    this.beginMatch(assignTeams(this.settings.mode, ids));
  }

  handleToLobby(player) {
    if (player.id !== this.hostId || this.phase !== "results") return;
    this.returnToLobby();
  }

  returnToLobby() {
    this.phase = "lobby";
    this.result = null;
    this.teams = null;
    this.lastActivityAt = Date.now();
    this.broadcastLobby();
  }

  beginMatch(teams) {
    clearInterval(this.tickTimer);
    this.teams = teams;
    this.phase = "match";
    this.match = createMatch({ settings: this.settings, teams });
    for (const id of teams.flat()) if (!this.players.get(id)?.socket) setOwnerAi(this.match, id, STAND_IN_AI);
    this.lastTickAt = Date.now();
    this.unsimulatedMs = 0;
    this.broadcastLobby();
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    if (!this.match) return;
    const now = Date.now();
    this.unsimulatedMs = Math.min(MAX_CATCHUP_MS, this.unsimulatedMs + now - this.lastTickAt);
    this.lastTickAt = now;
    while (this.unsimulatedMs >= STEP_MS) {
      stepMatch(this.match);
      this.unsimulatedMs -= STEP_MS;
    }
    this.broadcast(serializeMatch(this.match));
    if (this.match.phase === "over") this.finishMatch();
  }

  finishMatch() {
    clearInterval(this.tickTimer);
    const { winner, scores, isForfeit } = this.match;
    const teams = this.teams;
    this.match = null;
    const summary = { winner, scores, isForfeit, teams, isBoss: this.settings.mode === "boss" };
    if (!this.bracket) return this.showResults({ ...summary, champion: null });
    this.bracket.winners.push(...teams[winner].filter(id => this.players.has(id)));
    this.lastBracketSummary = summary;
    this.startNextBracketMatch();
  }

  showResults(result) {
    this.phase = "results";
    this.result = result;
    this.phaseEndsAt = Date.now() + RESULTS_MS;
    this.lastActivityAt = Date.now();
    this.broadcastLobby();
  }

  nextBracketPair() {
    const bracket = this.bracket;
    for (;;) {
      bracket.round = bracket.round.filter(id => this.players.has(id));
      bracket.winners = bracket.winners.filter(id => this.players.has(id));
      if (bracket.round.length >= 2) return bracket.round.splice(0, 2);
      if (bracket.round.length === 1) bracket.winners.push(bracket.round.pop());
      if (bracket.winners.length <= 1) return null;
      bracket.round = shuffled(bracket.winners);
      bracket.winners = [];
    }
  }

  startNextBracketMatch() {
    const pair = this.nextBracketPair();
    if (!pair) {
      const champion = this.bracket.winners[0] ?? null;
      const summary = this.lastBracketSummary ?? { winner: 0, scores: [0, 0], isForfeit: false, teams: [[], []], isBoss: false };
      this.bracket = null;
      this.lastBracketSummary = null;
      return this.showResults({ ...summary, champion });
    }
    this.phase = "intermission";
    this.teams = [[pair[0]], [pair[1]]];
    this.phaseEndsAt = Date.now() + INTERMISSION_MS;
    this.broadcastLobby();
  }

  handleSocketGone(socket) {
    const session = this.sockets.get(socket);
    if (!session) return;
    this.sockets.delete(socket);
    const player = session.playerId && this.players.get(session.playerId);
    if (!player || player.socket !== socket) return;
    player.socket = null;
    player.goneAt = Date.now();
    if (this.match) setOwnerAi(this.match, player.id, STAND_IN_AI);
    this.broadcastLobby();
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;
    const socket = player.socket;
    this.players.delete(id);
    if (socket) {
      this.sockets.delete(socket);
      try {
        socket.close(1000, "left");
      } catch {}
    }
    if (!this.players.size) return this.closeLobby("expired");
    if (this.hostId === id) this.hostId = this.nextHostId();
    if (this.match) this.removeFromMatch(id);
    if (this.phase === "intermission" && this.teams?.flat().includes(id)) this.startBracketAfterDeparture(id);
    this.broadcastLobby();
  }

  startBracketAfterDeparture(id) {
    const opponent = this.teams.flat().find(other => other !== id);
    if (opponent && this.players.has(opponent)) this.bracket.winners.push(opponent);
    this.startNextBracketMatch();
  }

  nextHostId() {
    const players = [...this.players.values()];
    return (players.find(player => player.socket) ?? players[0])?.id ?? null;
  }

  removeFromMatch(id) {
    const team = this.teams.findIndex(ids => ids.includes(id));
    removeOwner(this.match, id);
    if (team < 0 || sideHasHumans(this.match, team)) return;
    if (this.match.phase === "over") return;
    if (MODES[this.settings.mode].assignTeams && team === 0) return this.returnFromAbandonedMatch();
    forfeitMatch(this.match, 1 - team);
    this.broadcast(serializeMatch(this.match));
    this.finishMatch();
  }

  returnFromAbandonedMatch() {
    clearInterval(this.tickTimer);
    this.match = null;
    this.returnToLobby();
  }

  sweep() {
    const now = Date.now();
    for (const player of [...this.players.values()]) {
      if (!player.socket && now - player.goneAt > RECONNECT_GRACE_MS) this.removePlayer(player.id);
    }
    if (!this.code) return;
    const isAnyoneConnected = [...this.players.values()].some(player => player.socket);
    if (isAnyoneConnected) this.emptySince = 0;
    else this.emptySince ||= now;
    if (this.emptySince && now - this.emptySince > EMPTY_LOBBY_MS) return this.closeLobby("expired");
    if (this.phase === "lobby" && now - this.lastActivityAt > IDLE_LOBBY_MS) return this.closeLobby("expired");
    if (this.phase === "results" && now > this.phaseEndsAt) this.returnToLobby();
    if (this.phase === "intermission" && now > this.phaseEndsAt) this.beginMatch(this.teams);
  }
}
