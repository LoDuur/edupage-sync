import { MODES, TICK_DT } from "../docs/arena/sim/constants.js";
import { addPlayer, createGame, fillWithBots, removePlayer, scoreboard, setLoadout, stepGame } from "../docs/arena/sim/game.js";
import { MAPS } from "../docs/arena/sim/maps/index.js";
import { DIFFICULTIES } from "../docs/arena/sim/bots.js";
import {
  CODE_PATTERN, LAG_COMP_TICKS, MAX_BATCH, MAX_HUMANS, MAX_PLAYERS, MAX_QUEUED_INPUTS, PROTOCOL_VERSION, SNAPSHOT_EVERY,
  cleanLoadout, cleanName, packArsenal, packMove, packRemote, roundDeep, unpackInput,
} from "../docs/arena/sim/protocol.js";

export const TICK_MS = TICK_DT * 1000;
export const CLOSE_FULL = 4002;
export const CLOSE_GONE = 4004;
export const CLOSE_BAD = 4005;
const MAX_CATCHUP_TICKS = 8;
const QUEUE_TRIM_AT = 8;
const QUEUE_TRIM_TO = 3;
const RECONNECT_GRACE_MS = 15000;
const EMPTY_ROOM_MS = 60000;
const RESTART_MS = 12000;
const RATE_REFILL_PER_SEC = 40;
const RATE_BURST = 80;
const MAX_MESSAGE_CHARS = 6000;
const HISTORY_SIZE = LAG_COMP_TICKS + 4;
const IDLE_INPUT = Object.freeze({ fwd: 0, side: 0, yaw: 0, pitch: 0, buttons: 0, weapon: 0 });

export function sanitizeRoomSettings(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const int = (v, min, max, fallback) => (Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback);
  return {
    map: MAPS[r.map] ? r.map : "aktuzale",
    mode: "ffa",
    bots: int(r.bots, 0, MAX_PLAYERS - 1, 3),
    difficulty: DIFFICULTIES[r.difficulty] ? r.difficulty : "normal",
    fragLimit: int(r.fragLimit, 5, 50, MODES.ffa.fragLimit),
    timeLimit: int(r.timeLimit, 120, 900, 600),
  };
}

function randomToken(random) {
  return Array.from({ length: 4 }, () => Math.floor(random() * 0xffffffff).toString(16).padStart(8, "0")).join("");
}

export class ArenaServer {
  constructor({ code, settings, send, close, now = Date.now(), random = Math.random }) {
    if (!CODE_PATTERN.test(code)) throw new Error("bad code");
    this.code = code;
    this.settings = sanitizeRoomSettings(settings);
    this.send = send;
    this.close = close;
    this.random = random;
    this.connections = new Map();
    this.humans = new Map();
    this.nextHumanId = 1;
    this.lastUpdate = now;
    this.accumulator = 0;
    this.emptySince = now;
    this.restartAt = 0;
    this.pendingEvents = [];
    this.history = new Map();
    this.matchId = 0;
    this.startGame(now);
  }

  startGame() {
    this.game = createGame({ mapId: this.settings.map, mode: this.settings.mode, seed: Math.floor(this.random() * 1e9), fragLimit: this.settings.fragLimit, timeLimit: this.settings.timeLimit });
    this.game.positionsAt = (shooter, target) => this.rewound(shooter, target);
    this.matchId++;
    this.history.clear();
    for (const human of this.humans.values()) {
      addPlayer(this.game, { id: human.id, name: human.name, loadout: human.loadout });
      human.queue.length = 0;
    }
    this.syncBots();
    this.restartAt = 0;
    this.pendingEvents.length = 0;
  }

  syncBots() {
    const bots = this.game.players.filter(p => p.isBot);
    const desired = Math.max(0, Math.min(this.settings.bots, MAX_PLAYERS - this.humans.size));
    if (bots.length < desired) fillWithBots(this.game, desired - bots.length, this.settings.difficulty);
    for (const bot of bots.slice(desired)) {
      removePlayer(this.game, bot.id);
      this.broadcast({ t: "leave", id: bot.id });
    }
    for (const bot of this.game.players.filter(p => p.isBot && !bots.includes(p))) this.broadcast({ t: "join", p: this.describe(bot) });
  }

  describe(player) {
    return [player.id, player.name, player.isBot ? 1 : 0, player.team];
  }

  get isEmpty() {
    return this.connections.size === 0;
  }

  connect(socket, now) {
    this.connections.set(socket, { socket, humanId: null, tokens: RATE_BURST, refilledAt: now });
  }

  disconnect(socket, now) {
    const conn = this.connections.get(socket);
    this.connections.delete(socket);
    if (!conn?.humanId) return;
    const human = this.humans.get(conn.humanId);
    if (human && human.socket === socket) {
      human.socket = null;
      human.goneAt = now;
    }
    if (this.connections.size === 0) this.emptySince = now;
  }

  reject(socket, code, closeCode = CLOSE_BAD) {
    this.send(socket, { t: "error", code });
    this.close(socket, closeCode, code);
    this.connections.delete(socket);
  }

  receive(socket, text, now) {
    const conn = this.connections.get(socket);
    if (!conn) return;
    if (text === "ping") return this.send(socket, "pong");
    if (typeof text !== "string" || text.length > MAX_MESSAGE_CHARS) return this.reject(socket, "too_large");
    conn.tokens = Math.min(RATE_BURST, conn.tokens + ((now - conn.refilledAt) / 1000) * RATE_REFILL_PER_SEC);
    conn.refilledAt = now;
    if (conn.tokens < 1) return;
    conn.tokens -= 1;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (message.t === "hello") return this.hello(conn, message, now);
    const human = conn.humanId ? this.humans.get(conn.humanId) : null;
    if (!human) return;
    if (message.t === "in") this.queueInputs(human, message.f);
    else if (message.t === "loadout") {
      human.loadout = cleanLoadout(message.w);
      setLoadout(this.game, human.id, human.loadout);
    } else if (message.t === "ping" && Number.isFinite(message.c)) this.send(socket, { t: "pong", c: message.c, k: this.game.tick });
  }

  hello(conn, message, now) {
    if (conn.humanId) return;
    if (message.v !== PROTOCOL_VERSION) return this.reject(conn.socket, "version");
    let human = typeof message.token === "string" ? [...this.humans.values()].find(h => h.token === message.token) : null;
    if (human) {
      if (human.socket && human.socket !== conn.socket) this.close(human.socket, 1000, "replaced");
    } else {
      if (this.humans.size >= MAX_HUMANS) return this.reject(conn.socket, "full", CLOSE_FULL);
      const id = `h-${this.nextHumanId++}`;
      human = { id, token: randomToken(this.random), name: cleanName(message.name) || `Spēlētājs ${id.slice(2)}`, loadout: cleanLoadout(message.loadout), queue: [], lastSeq: -1, ackSeq: -1, lastInput: IDLE_INPUT, socket: null, goneAt: 0 };
      this.humans.set(id, human);
      const player = addPlayer(this.game, { id, name: human.name, loadout: human.loadout });
      this.syncBots();
      this.broadcast({ t: "join", p: this.describe(player) }, conn.socket);
    }
    human.socket = conn.socket;
    human.goneAt = 0;
    conn.humanId = human.id;
    this.send(conn.socket, this.welcome(human));
  }

  welcome(human) {
    const g = this.game;
    return {
      t: "welcome", type: "ready", matchId: this.matchId, id: human.id, token: human.token, code: this.code, settings: this.settings,
      map: g.map.id, mode: g.mode, fragLimit: g.fragLimit, timeLimit: g.timeLimit, tick: g.tick, time: g.time,
      players: g.players.map(p => this.describe(p)), lastSeq: human.ackSeq, isOver: g.isOver,
    };
  }

  queueInputs(human, frames) {
    if (!Array.isArray(frames) || frames.length === 0 || frames.length > MAX_BATCH) return;
    for (const raw of frames) {
      const frame = unpackInput(raw);
      if (!frame || frame.seq <= human.lastSeq) continue;
      human.lastSeq = frame.seq;
      human.queue.push(frame);
    }
    if (human.queue.length > MAX_QUEUED_INPUTS) human.queue.splice(0, human.queue.length - MAX_QUEUED_INPUTS);
  }

  rewound(shooter, target) {
    if (shooter.isBot || shooter.viewTick < 0) return null;
    const tick = Math.max(this.game.tick - LAG_COMP_TICKS, Math.min(this.game.tick, shooter.viewTick));
    const slot = this.history.get(target.id)?.[tick % HISTORY_SIZE];
    return slot && slot.tick === tick ? slot : null;
  }

  record() {
    const tick = this.game.tick;
    for (const p of this.game.players) {
      let ring = this.history.get(p.id);
      if (!ring) this.history.set(p.id, ring = new Array(HISTORY_SIZE));
      const slot = ring[tick % HISTORY_SIZE] || (ring[tick % HISTORY_SIZE] = { tick: -1, pos: { x: 0, y: 0, z: 0 }, isCrouched: false });
      slot.tick = tick;
      slot.pos.x = p.move.pos.x; slot.pos.y = p.move.pos.y; slot.pos.z = p.move.pos.z;
      slot.isCrouched = p.move.isCrouched;
    }
  }

  nextInputs() {
    const inputs = new Map();
    for (const human of this.humans.values()) {
      const player = this.game.players.find(p => p.id === human.id);
      if (!player) continue;
      if (human.queue.length > QUEUE_TRIM_AT) human.queue.splice(0, human.queue.length - QUEUE_TRIM_TO);
      const frame = human.queue.shift();
      if (frame) {
        human.ackSeq = frame.seq;
        human.lastInput = frame.input;
        player.viewTick = frame.viewTick;
      }
      inputs.set(human.id, human.socket ? human.lastInput : { ...human.lastInput, fwd: 0, side: 0, buttons: 0 });
    }
    return inputs;
  }

  step() {
    const events = stepGame(this.game, this.nextInputs());
    for (const e of events) this.pendingEvents.push(roundDeep(e, 1000));
    this.record();
    if (this.game.tick % SNAPSHOT_EVERY === 0) this.flush();
  }

  flush() {
    const g = this.game;
    const remote = g.players.map(packRemote);
    const projectiles = g.projectiles.map(r => roundDeep([r.id, r.pos.x, r.pos.y, r.pos.z, r.vel.x, r.vel.y, r.vel.z], 1000));
    const pickups = g.pickups.map(p => Math.max(0, Math.ceil((p.availableAt - g.time) * 10)));
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const human of this.humans.values()) {
      if (!human.socket) continue;
      const me = g.players.find(p => p.id === human.id);
      this.send(human.socket, {
        t: "s", k: g.tick, tm: g.time, a: human.ackSeq,
        me: me ? { mv: packMove(me.move), ar: packArsenal(me.arsenal), h: me.health, am: me.armor, al: me.isAlive ? 1 : 0, rs: Math.max(0, me.respawnAt - g.time), k: me.kills, d: me.deaths } : null,
        p: remote, pr: projectiles, pk: pickups, e: events,
      });
    }
  }

  sweep(now) {
    for (const human of [...this.humans.values()]) {
      if (human.socket || now - human.goneAt < RECONNECT_GRACE_MS) continue;
      this.humans.delete(human.id);
      removePlayer(this.game, human.id);
      this.history.delete(human.id);
      this.broadcast({ t: "leave", id: human.id });
      this.syncBots();
    }
  }

  update(now) {
    this.sweep(now);
    if (this.connections.size === 0 && now - this.emptySince > EMPTY_ROOM_MS && [...this.humans.values()].every(h => !h.socket)) return false;
    this.accumulator = Math.min(this.accumulator + (now - this.lastUpdate), TICK_MS * MAX_CATCHUP_TICKS);
    this.lastUpdate = now;
    if (this.restartAt) {
      this.accumulator = 0;
      if (now >= this.restartAt) {
        this.startGame();
        for (const human of this.humans.values()) if (human.socket) this.send(human.socket, this.welcome(human));
      }
      return true;
    }
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.step();
      if (this.game.isOver) {
        this.flush();
        this.restartAt = now + RESTART_MS;
        this.broadcast({ t: "end", winner: this.game.winner, board: scoreboard(this.game), restartIn: RESTART_MS / 1000 });
        break;
      }
    }
    return true;
  }

  broadcast(message, except = null) {
    for (const human of this.humans.values()) if (human.socket && human.socket !== except) this.send(human.socket, message);
  }
}
