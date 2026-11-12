import { PaintConnection } from "../../paint/connection.js";
import { TICK_DT } from "../sim/constants.js";
import { rayBox, traceRay } from "../sim/collision.js";
import { createMoveState, stepMovement } from "../sim/movement.js";
import { loadMap } from "../sim/game.js";
import { WEAPONS, createArsenal, updateArsenal } from "../sim/weapons.js";
import { eyePosition, hitboxes, viewDirection } from "../sim/entity.js";
import { INPUT_BATCH, INTERP_TICKS, PROTOCOL_VERSION, packInput, unpackArsenal, unpackInput, unpackMove, unpackRemote } from "../sim/protocol.js";

const TICK_MS = TICK_DT * 1000;
const PRODUCTION_SOCKET = "wss://edupage-proxy.loduur.workers.dev";
const LOCAL_SOCKET = "ws://localhost:8790";
const MAX_STEPS_PER_FRAME = 6;
const SNAPSHOT_KEEP = 40;
const MAX_EXTRAPOLATE_TICKS = 8;
const TELEPORT_DISTANCE = 6;
const SMOOTH_LIMIT = 2.5;
const PING_MS = 2000;
const PREDICTED = new Set(["shot", "jump", "slidejump", "walljump", "land", "dash", "pad", "slide", "dry"]);
const TOKEN_KEY = "arena-room-token";

export const socketBase = () => (["localhost", "127.0.0.1"].includes(location.hostname) ? LOCAL_SOCKET : PRODUCTION_SOCKET);

function readToken(code) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
    return saved?.code === code ? saved.token : null;
  } catch {
    return null;
  }
}

function saveToken(code, token) {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ code, token }));
  } catch {
    return;
  }
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function spread(dir, amount) {
  const up = Math.abs(dir.y) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  let rx = dir.y * up.z - dir.z * up.y, ry = dir.z * up.x - dir.x * up.z, rz = dir.x * up.y - dir.y * up.x;
  const rl = Math.hypot(rx, ry, rz);
  rx /= rl; ry /= rl; rz /= rl;
  const ux = ry * dir.z - rz * dir.y, uy = rz * dir.x - rx * dir.z, uz = rx * dir.y - ry * dir.x;
  const radius = Math.sqrt(Math.random()) * amount, angle = Math.random() * Math.PI * 2;
  const a = Math.cos(angle) * radius, b = Math.sin(angle) * radius;
  const x = dir.x + rx * a + ux * b, y = dir.y + ry * a + uy * b, z = dir.z + rz * a + uz * b;
  const len = Math.hypot(x, y, z);
  return { x: x / len, y: y / len, z: z / len };
}

function makePlayerView(id, name, isBot, team) {
  return {
    id, name, isBot: !!isBot, team, move: createMoveState({ x: 0, y: -100, z: 0 }), arsenal: createArsenal(0),
    health: 100, armor: 0, isAlive: false, kills: 0, deaths: 0, respawnAt: 0, lastInput: { pitch: 0 }, protectedUntil: 0,
  };
}

export function createOnlineSession({ mode, code, settings, name, loadout, onReady, onRestart, onStatus, onError, onEnd }) {
  const { map, world } = loadMap("aktuzale");
  const game = {
    map, world, mode: "ffa", fragLimit: 20, timeLimit: 600, time: 0, tick: 0, players: [], projectiles: [], teamScores: [0, 0],
    pickups: map.pickups.map((p, index) => ({ ...p, index, availableAt: 0 })), isOver: false, winner: null,
  };
  const prevPositions = new Map();
  const snapshots = [];
  const pending = [];
  const queuedEvents = [];
  let outgoing = [];
  let local = null, localId = null, roomCode = code || null, matchId = 0;
  let seq = 0, accumulator = 0, clockOffset = null, serverTime = 0, serverTimeAt = 0, renderTick = 0;
  let rtt = 0, pingTimer = 0, isReady = false, isClosed = false, restartIn = 0;
  const visualOffset = { x: 0, y: 0, z: 0 };
  const playersById = new Map();
  const createUrl = `${socketBase()}/arena/create?settings=${encodeURIComponent(JSON.stringify(settings || {}))}`;
  const connection = new PaintConnection({
    url: mode === "create" ? createUrl : `${socketBase()}/arena/rooms/${encodeURIComponent(code)}`,
    buildHello: () => ({ t: "hello", v: PROTOCOL_VERSION, name, loadout, token: roomCode ? readToken(roomCode) : null }),
    onMessage: message => handle(message),
    onStatus: status => onStatus?.(status),
  });
  connection.connect();

  const nowTicks = () => performance.now() / TICK_MS;
  const estimatedServerTick = () => (clockOffset === null ? 0 : nowTicks() + clockOffset);

  function addPlayer(raw) {
    const [id, playerName, isBot, team] = raw;
    if (playersById.has(id)) return playersById.get(id);
    const view = id === localId && local ? local : makePlayerView(id, playerName, isBot, team);
    view.name = playerName;
    playersById.set(id, view);
    game.players.push(view);
    return view;
  }

  function removePlayer(id) {
    playersById.delete(id);
    game.players = game.players.filter(p => p.id !== id);
  }

  function welcome(message) {
    const isNewMatch = message.matchId !== matchId;
    matchId = message.matchId;
    localId = message.id;
    roomCode = message.code;
    saveToken(roomCode, message.token);
    connection.url = `${socketBase()}/arena/rooms/${roomCode}`;
    Object.assign(game, { fragLimit: message.fragLimit, timeLimit: message.timeLimit, mode: message.mode, tick: message.tick, time: message.time });
    serverTime = message.time;
    serverTimeAt = performance.now();
    if (isNewMatch) {
      game.isOver = false;
      game.winner = null;
      game.projectiles = [];
      game.players = [];
      playersById.clear();
      snapshots.length = 0;
      local = null;
    }
    for (const raw of message.players) addPlayer(raw);
    local = playersById.get(localId);
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].seq <= message.lastSeq) pending.splice(i, 1);
    if (!isReady) {
      isReady = true;
      clearInterval(pingTimer);
      pingTimer = setInterval(() => connection.send({ t: "ping", c: performance.now() }), PING_MS);
      onReady?.();
    } else if (isNewMatch) onRestart?.();
  }

  function replay(fromSeq) {
    for (const frame of pending) {
      if (frame.seq <= fromSeq) continue;
      stepMovement(world, local.move, frame.input, TICK_DT, map.pads, null);
      updateArsenal(local.arsenal, frame.input, local.move.time, TICK_DT);
    }
  }

  function snapshot(message) {
    const sample = message.k - nowTicks();
    clockOffset = clockOffset === null ? sample : sample > clockOffset ? clockOffset + (sample - clockOffset) * 0.3 : clockOffset + (sample - clockOffset) * 0.03;
    game.tick = message.k;
    serverTime = message.tm;
    serverTimeAt = performance.now();
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].seq <= message.a) pending.splice(i, 1);
    if (local && message.me) {
      const me = message.me;
      const wasAlive = local.isAlive;
      const before = { ...local.move.pos };
      unpackMove(me.mv, local.move);
      unpackArsenal(me.ar, local.arsenal);
      local.isAlive = me.al === 1;
      if (local.isAlive) replay(message.a);
      local.health = me.h;
      local.armor = me.am;
      local.kills = me.k;
      local.deaths = me.d;
      local.respawnAt = message.tm + me.rs;
      const dx = before.x - local.move.pos.x, dy = before.y - local.move.pos.y, dz = before.z - local.move.pos.z;
      if (wasAlive && local.isAlive && Math.hypot(dx, dy, dz) < SMOOTH_LIMIT) {
        visualOffset.x += dx; visualOffset.y += dy; visualOffset.z += dz;
      } else visualOffset.x = visualOffset.y = visualOffset.z = 0;
    }
    const states = new Map();
    for (const raw of message.p) {
      const state = unpackRemote(raw);
      states.set(state.id, state);
      const view = playersById.get(state.id);
      if (!view) continue;
      view.kills = state.kills;
      view.deaths = state.deaths;
      if (view !== local) view.isAlive = state.isAlive;
    }
    snapshots.push({ tick: message.k, states });
    if (snapshots.length > SNAPSHOT_KEEP) snapshots.shift();
    const receivedAt = performance.now();
    game.projectiles = message.pr.map(([id, x, y, z, vx, vy, vz]) => ({ id, weapon: "rocket", base: { x, y, z }, pos: { x, y, z }, prev: { x, y, z }, vel: { x: vx, y: vy, z: vz }, receivedAt }));
    message.pk.forEach((remaining, i) => { if (game.pickups[i]) game.pickups[i].availableAt = message.tm + remaining / 10; });
    for (const e of message.e) {
      if (e.id === localId && PREDICTED.has(e.type)) continue;
      if (e.type === "matchEnd") {
        game.isOver = true;
        game.winner = e.winner;
      }
      queuedEvents.push(e);
    }
  }

  function handle(message) {
    if (isClosed || !message || typeof message !== "object") return;
    switch (message.t) {
      case "welcome": return welcome(message);
      case "s": return isReady && snapshot(message);
      case "join": return addPlayer(message.p);
      case "leave": return removePlayer(message.id);
      case "pong": rtt = performance.now() - message.c; return;
      case "end":
        game.isOver = true;
        game.winner = message.winner;
        restartIn = message.restartIn;
        onEnd?.(message);
        return;
      case "error":
        dispose();
        onError?.(message.code);
        return;
    }
  }

  function predictedShot(input, spreadAmount) {
    const w = WEAPONS[local.arsenal.current];
    const origin = eyePosition(local);
    if (w.projectile) return { type: "shot", id: localId, weapon: w.id, origin, traces: [] };
    const forward = viewDirection(input.yaw, input.pitch);
    const targets = game.players.filter(p => p !== local && p.isAlive).map(p => ({ player: p, boxes: hitboxes(p) }));
    const traces = [];
    for (let i = 0; i < w.pellets; i++) {
      const dir = spread(forward, spreadAmount);
      const end = { x: origin.x + dir.x * w.range, y: origin.y + dir.y * w.range, z: origin.z + dir.z * w.range };
      const wall = traceRay(world, origin, end);
      let best = wall.fraction * w.range, victim = null;
      for (const t of targets) {
        const hit = Math.min(...[rayBox(origin, dir, best, t.boxes.head.min, t.boxes.head.max), rayBox(origin, dir, best, t.boxes.body.min, t.boxes.body.max)].filter(v => v >= 0), Infinity);
        if (hit < best) { best = hit; victim = t.player.id; }
      }
      traces.push({ point: { x: origin.x + dir.x * best, y: origin.y + dir.y * best, z: origin.z + dir.z * best }, normal: victim ? null : wall.normal, victim, material: victim ? null : wall.brush?.material ?? null });
    }
    return { type: "shot", id: localId, weapon: w.id, origin, traces };
  }

  function predict(input, events) {
    local.lastInput = input;
    const moveEvents = [];
    stepMovement(world, local.move, input, TICK_DT, map.pads, moveEvents);
    for (const e of moveEvents) events.push({ ...e, id: localId });
    const shot = updateArsenal(local.arsenal, input, local.move.time, TICK_DT);
    if (shot === "dry") events.push({ type: "dry", id: localId });
    else if (shot) events.push(predictedShot(input, shot.spread));
  }

  function interpolate() {
    renderTick = estimatedServerTick() - INTERP_TICKS;
    if (!snapshots.length) return;
    let a = snapshots[0], b = snapshots[snapshots.length - 1];
    for (let i = snapshots.length - 1; i > 0; i--) {
      if (snapshots[i - 1].tick <= renderTick) {
        a = snapshots[i - 1];
        b = snapshots[i];
        break;
      }
    }
    const span = Math.max(1, b.tick - a.tick);
    const t = Math.max(0, Math.min(1, (renderTick - a.tick) / span));
    const extra = Math.max(0, Math.min(MAX_EXTRAPOLATE_TICKS, renderTick - b.tick)) * TICK_DT;
    for (const [id, to] of b.states) {
      const view = playersById.get(id);
      if (!view || view === local) continue;
      const from = a.states.get(id) || to;
      const jump = Math.hypot(to.pos.x - from.pos.x, to.pos.y - from.pos.y, to.pos.z - from.pos.z) > TELEPORT_DISTANCE;
      const k = jump ? 1 : t;
      const m = view.move;
      m.pos.x = from.pos.x + (to.pos.x - from.pos.x) * k + to.vel.x * extra;
      m.pos.y = from.pos.y + (to.pos.y - from.pos.y) * k + to.vel.y * extra;
      m.pos.z = from.pos.z + (to.pos.z - from.pos.z) * k + to.vel.z * extra;
      m.vel.x = to.vel.x; m.vel.y = to.vel.y; m.vel.z = to.vel.z;
      m.yaw = lerpAngle(from.yaw, to.yaw, k);
      view.lastInput.pitch = from.pitch + (to.pitch - from.pitch) * k;
      const source = k < 0.5 ? from : to;
      m.isCrouched = source.isCrouched;
      m.isSliding = source.isSliding;
      m.isOnGround = source.isOnGround;
      if (view.arsenal.current !== to.weapon) {
        view.arsenal.owned[to.weapon] = true;
        view.arsenal.current = to.weapon;
      }
    }
  }

  function step(dt, sample, onTick) {
    if (!isReady || !local) return;
    game.time = serverTime + (performance.now() - serverTimeAt) / 1000;
    accumulator = Math.min(accumulator + dt, TICK_DT * MAX_STEPS_PER_FRAME);
    const viewTick = Math.max(0, Math.round(renderTick));
    while (accumulator >= TICK_DT) {
      accumulator -= TICK_DT;
      let prev = prevPositions.get(localId);
      if (!prev) prevPositions.set(localId, prev = { x: 0, y: 0, z: 0 });
      prev.x = local.move.pos.x; prev.y = local.move.pos.y; prev.z = local.move.pos.z;
      const packed = packInput(seq, sample(), viewTick);
      const { input } = unpackInput(packed);
      pending.push({ seq, input });
      outgoing.push(packed);
      seq++;
      const events = queuedEvents.splice(0);
      if (local.isAlive) predict(input, events);
      if (outgoing.length >= INPUT_BATCH) {
        connection.send({ t: "in", f: outgoing });
        outgoing = [];
      }
      onTick(events);
    }
    const decay = Math.exp(-dt * 12);
    visualOffset.x *= decay; visualOffset.y *= decay; visualOffset.z *= decay;
    interpolate();
    const now = performance.now();
    for (const r of game.projectiles) {
      const age = Math.min(0.25, (now - r.receivedAt) / 1000);
      r.prev.x = r.pos.x; r.prev.y = r.pos.y; r.prev.z = r.pos.z;
      r.pos.x = r.base.x + r.vel.x * age; r.pos.y = r.base.y + r.vel.y * age; r.pos.z = r.base.z + r.vel.z * age;
    }
  }

  function dispose() {
    if (isClosed) return;
    isClosed = true;
    clearInterval(pingTimer);
    connection.stop();
  }

  return {
    game, isOnline: true, prevPositions, visualOffset,
    get local() { return local; },
    get localId() { return localId; },
    get code() { return roomCode; },
    get rtt() { return rtt; },
    get restartIn() { return restartIn; },
    get alpha() { return accumulator / TICK_DT; },
    get renderTick() { return renderTick; },
    get latestTick() { return snapshots.at(-1)?.tick ?? -1; },
    step,
    setLoadout(next) { connection.send({ t: "loadout", w: next }); },
    dispose,
  };
}
