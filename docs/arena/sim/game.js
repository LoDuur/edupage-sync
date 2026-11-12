import * as C from "./constants.js";
import { createWorld, rayBox, traceBox, traceRay } from "./collision.js";
import { createMoveState, playerHeight, stepMovement } from "./movement.js";
import { buildNav } from "./nav.js";
import { createRng } from "./random.js";
import { LOADOUT_WEAPONS, WEAPONS, createArsenal, giveAmmo, giveWeapon, updateArsenal } from "./weapons.js";
import { eyePosition, hitboxes, viewDirection } from "./entity.js";
import { createBrain, thinkBot } from "./bots.js";
import { MAPS } from "./maps/index.js";

const PICKUP_RESPAWN = { health: 20, mega: 35, weapon: 10, armor: 25, ammo: 15 };
const IDLE_INPUT = Object.freeze({ fwd: 0, side: 0, yaw: 0, pitch: 0, buttons: 0, weapon: 0 });
const BOT_NAMES = ["Fizmats", "Ķīmiķe", "Dežurants", "Direktore", "Bibliotekārs", "Sportists", "Matemātiķis", "Laborante", "Ģeogrāfs", "Mūziķe", "Informātiķis", "Vēsturnieks"];
const mapCache = new Map();

export const TEAM_NAMES = ["Zaļie", "Oranžie"];

export function loadMap(mapId) {
  if (mapCache.has(mapId)) return mapCache.get(mapId);
  const map = MAPS[mapId];
  if (!map) throw new Error(`unknown map ${mapId}`);
  const brushes = map.buildBrushes();
  const world = createWorld(brushes);
  const nav = buildNav(world, map);
  const loaded = { map, brushes, world, nav };
  mapCache.set(mapId, loaded);
  return loaded;
}

export function createGame({ mapId = "aktuzale", mode = "ffa", seed = 1, fragLimit, timeLimit } = {}) {
  const { map, world, nav } = loadMap(mapId);
  const rules = C.MODES[mode] || C.MODES.ffa;
  return {
    map, world, nav, mode,
    fragLimit: fragLimit ?? rules.fragLimit, timeLimit: timeLimit ?? rules.timeLimit,
    time: 0, tick: 0, rng: createRng(seed),
    players: [], teamScores: [0, 0],
    pickups: map.pickups.map((p, index) => ({ ...p, index, availableAt: 0 })),
    projectiles: [], nextProjectileId: 1, nextBotId: 1,
    events: [], isOver: false, winner: null,
  };
}

export function addPlayer(game, { id, name, isBot = false, difficulty = "normal", team = -1, loadout = null }) {
  if (game.players.some(p => p.id === id)) throw new Error(`duplicate player ${id}`);
  const assignedTeam = game.mode === "tdm" ? (team >= 0 ? team : smallerTeam(game)) : -1;
  const player = {
    id, name, isBot, team: assignedTeam, loadout: LOADOUT_WEAPONS.includes(loadout) ? loadout : null, viewTick: -1,
    move: null, arsenal: null, health: 0, armor: 0, isAlive: false, respawnAt: game.time, protectedUntil: 0,
    kills: 0, deaths: 0, streak: 0, lastInput: IDLE_INPUT, lastHurtBy: null, lastHurtAt: -1, damageDealt: 0,
    brain: isBot ? createBrain(game, difficulty) : null,
  };
  game.players.push(player);
  spawnPlayer(game, player);
  return player;
}

export function setLoadout(game, id, loadout) {
  const player = game.players.find(p => p.id === id);
  if (!player || player.isBot || !(loadout === null || LOADOUT_WEAPONS.includes(loadout))) return false;
  player.loadout = loadout;
  return true;
}

export function removePlayer(game, id) {
  game.players = game.players.filter(p => p.id !== id);
}

export function fillWithBots(game, count, difficulty) {
  const used = new Set(game.players.map(p => p.name));
  const names = BOT_NAMES.filter(n => !used.has(n));
  for (let i = 0; i < count; i++) {
    const name = names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : "");
    addPlayer(game, { id: `bot-${game.nextBotId++}`, name, isBot: true, difficulty });
  }
}

function smallerTeam(game) {
  const counts = [0, 0];
  for (const p of game.players) if (p.team >= 0) counts[p.team]++;
  return counts[0] <= counts[1] ? 0 : 1;
}

export const isEnemy = (game, a, b) => a !== b && (game.mode !== "tdm" || a.team !== b.team);

function pickSpawn(game, player) {
  const enemies = game.players.filter(p => p.isAlive && isEnemy(game, player, p));
  const scored = game.map.spawns.map(spawn => {
    let nearest = 60;
    for (const e of enemies) nearest = Math.min(nearest, Math.hypot(e.move.pos.x - spawn.pos.x, e.move.pos.y - spawn.pos.y, e.move.pos.z - spawn.pos.z));
    return { spawn, score: nearest + game.rng.range(0, 6) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].spawn;
}

function spawnPlayer(game, player) {
  const spawn = pickSpawn(game, player);
  player.move = createMoveState(spawn.pos, spawn.yaw);
  if (player.isBot && game.rng.chance(0.5)) player.loadout = game.rng.pick(LOADOUT_WEAPONS);
  player.arsenal = createArsenal(0, player.loadout);
  player.health = C.MAX_HEALTH;
  player.armor = 0;
  player.isAlive = true;
  player.streak = 0;
  player.protectedUntil = game.time + C.SPAWN_PROTECTION;
  player.lastHurtBy = null;
  if (player.brain) player.brain.reset(game, player);
  game.events.push({ type: "spawn", id: player.id, pos: { ...spawn.pos }, yaw: spawn.yaw });
}

export function applyDamage(game, victim, attacker, amount, weaponId, isHeadshot = false, origin = null) {
  if (!victim.isAlive || amount <= 0 || game.isOver) return 0;
  if (game.time < victim.protectedUntil) return 0;
  if (attacker && attacker !== victim && !isEnemy(game, attacker, victim)) return 0;
  const saved = Math.min(victim.armor, Math.ceil(amount * C.ARMOR_ABSORB));
  victim.armor -= saved;
  const dealt = Math.min(victim.health, amount - saved);
  victim.health -= amount - saved;
  victim.lastHurtBy = attacker?.id ?? null;
  victim.lastHurtAt = game.time;
  if (attacker && attacker !== victim) attacker.damageDealt += dealt + saved;
  game.events.push({ type: "damage", victim: victim.id, attacker: attacker?.id ?? null, amount, isHeadshot, weapon: weaponId, origin });
  if (victim.health <= 0) killPlayer(game, victim, attacker, weaponId, isHeadshot);
  return amount;
}

function killPlayer(game, victim, attacker, weaponId, isHeadshot) {
  victim.isAlive = false;
  victim.deaths++;
  victim.streak = 0;
  victim.respawnAt = game.time + C.RESPAWN_DELAY;
  const isSuicide = !attacker || attacker === victim;
  if (isSuicide) victim.kills--;
  else {
    attacker.kills++;
    attacker.streak++;
    if (game.mode === "tdm") game.teamScores[attacker.team]++;
  }
  game.events.push({ type: "kill", killer: attacker?.id ?? null, victim: victim.id, weapon: weaponId, isHeadshot, streak: attacker?.streak ?? 0, pos: { ...victim.move.pos } });
  checkMatchEnd(game);
}

function checkMatchEnd(game) {
  if (game.isOver) return;
  let winner = null;
  if (game.mode === "tdm") {
    const best = game.teamScores[0] >= game.teamScores[1] ? 0 : 1;
    if (game.teamScores[best] >= game.fragLimit || game.time >= game.timeLimit) winner = { team: best };
  } else {
    const leader = [...game.players].sort((a, b) => b.kills - a.kills)[0];
    if (leader && (leader.kills >= game.fragLimit || game.time >= game.timeLimit)) winner = { id: leader.id };
  }
  if (!winner) return;
  game.isOver = true;
  game.winner = winner;
  game.events.push({ type: "matchEnd", winner });
}

function spreadDirection(rng, dir, spread) {
  const up = Math.abs(dir.y) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const right = { x: dir.y * up.z - dir.z * up.y, y: dir.z * up.x - dir.x * up.z, z: dir.x * up.y - dir.y * up.x };
  const rl = Math.hypot(right.x, right.y, right.z);
  right.x /= rl; right.y /= rl; right.z /= rl;
  const u = { x: right.y * dir.z - right.z * dir.y, y: right.z * dir.x - right.x * dir.z, z: right.x * dir.y - right.y * dir.x };
  const radius = Math.sqrt(rng.next()) * spread, angle = rng.next() * Math.PI * 2;
  const a = Math.cos(angle) * radius, b = Math.sin(angle) * radius;
  const out = { x: dir.x + right.x * a + u.x * b, y: dir.y + right.y * a + u.y * b, z: dir.z + right.z * a + u.z * b };
  const len = Math.hypot(out.x, out.y, out.z);
  return { x: out.x / len, y: out.y / len, z: out.z / len };
}

function falloff(w, distance) {
  if (distance <= w.falloffStart) return 1;
  if (distance >= w.falloffEnd) return w.falloffMin;
  return 1 - (1 - w.falloffMin) * ((distance - w.falloffStart) / (w.falloffEnd - w.falloffStart));
}

export function fireHitscan(game, shooter, weaponId, spread, view, positionsAt = null) {
  const w = WEAPONS[weaponId];
  const origin = eyePosition(shooter);
  const forward = viewDirection(view.yaw, view.pitch);
  const targets = game.players.filter(p => p !== shooter && p.isAlive).map(p => {
    const past = positionsAt?.(p);
    return { player: p, boxes: hitboxes(p, past?.pos, past?.isCrouched) };
  });
  const damageBy = new Map();
  const traces = [];
  for (let i = 0; i < w.pellets; i++) {
    const dir = spreadDirection(game.rng, forward, spread);
    const end = { x: origin.x + dir.x * w.range, y: origin.y + dir.y * w.range, z: origin.z + dir.z * w.range };
    const wall = traceRay(game.world, origin, end);
    let best = wall.fraction * w.range, hitPlayer = null, isHead = false;
    for (const t of targets) {
      const head = rayBox(origin, dir, best, t.boxes.head.min, t.boxes.head.max);
      if (head >= 0 && head < best) { best = head; hitPlayer = t.player; isHead = true; }
      const body = rayBox(origin, dir, best, t.boxes.body.min, t.boxes.body.max);
      if (body >= 0 && body < best) { best = body; hitPlayer = t.player; isHead = false; }
    }
    const point = { x: origin.x + dir.x * best, y: origin.y + dir.y * best, z: origin.z + dir.z * best };
    traces.push({ point, normal: hitPlayer ? null : wall.normal, victim: hitPlayer?.id ?? null, isHead, material: hitPlayer ? null : wall.brush?.material ?? null });
    if (!hitPlayer) continue;
    const amount = w.damage * (isHead ? w.headMultiplier : 1) * falloff(w, best);
    const entry = damageBy.get(hitPlayer) || { amount: 0, isHead: false };
    entry.amount += amount;
    entry.isHead ||= isHead;
    damageBy.set(hitPlayer, entry);
  }
  game.events.push({ type: "shot", id: shooter.id, weapon: weaponId, origin, traces });
  for (const [victim, { amount, isHead }] of damageBy) applyDamage(game, victim, shooter, Math.round(amount), weaponId, isHead, origin);
}

function closestPointOnBox(p, min, max) {
  return { x: Math.min(max.x, Math.max(min.x, p.x)), y: Math.min(max.y, Math.max(min.y, p.y)), z: Math.min(max.z, Math.max(min.z, p.z)) };
}

function explode(game, rocket, point, normal) {
  const cfg = WEAPONS[rocket.weapon].projectile;
  const owner = game.players.find(p => p.id === rocket.owner) || null;
  game.events.push({ type: "explosion", pos: { ...point }, normal: normal ? { ...normal } : null, owner: rocket.owner, radius: cfg.splashRadius });
  for (const target of game.players) {
    if (!target.isAlive) continue;
    const m = target.move;
    const r = C.PLAYER_RADIUS, h = playerHeight(m);
    const near = closestPointOnBox(point, { x: m.pos.x - r, y: m.pos.y, z: m.pos.z - r }, { x: m.pos.x + r, y: m.pos.y + h, z: m.pos.z + r });
    const distance = Math.hypot(near.x - point.x, near.y - point.y, near.z - point.z);
    if (distance >= cfg.splashRadius) continue;
    const chest = { x: m.pos.x, y: m.pos.y + h * 0.55, z: m.pos.z };
    const lift = { x: point.x + (normal?.x ?? 0) * 0.15, y: point.y + (normal?.y ?? 0) * 0.15, z: point.z + (normal?.z ?? 0) * 0.15 };
    if (distance > 0.4 && traceRay(game.world, lift, chest).fraction < 0.95) continue;
    const falloff = 1 - distance / cfg.splashRadius;
    const isSelf = target === owner;
    let dx = chest.x - point.x, dy = chest.y - point.y, dz = chest.z - point.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    const push = cfg.knockback * falloff;
    m.vel.x += dx * push;
    m.vel.y += dy * push;
    m.vel.z += dz * push;
    if (dy * push > 1) { m.isOnGround = false; m.hasJumpedSinceGround = true; m.isSliding = false; }
    const amount = Math.round(cfg.splashDamage * falloff * (isSelf ? cfg.selfScale : 1));
    if (amount > 0) applyDamage(game, target, owner, amount, rocket.weapon, false, point);
  }
}

function fireProjectile(game, shooter, weaponId, view) {
  const cfg = WEAPONS[weaponId].projectile;
  const eye = eyePosition(shooter);
  const dir = viewDirection(view.yaw, view.pitch);
  const spawn = { x: eye.x + dir.x * 0.6, y: eye.y + dir.y * 0.6, z: eye.z + dir.z * 0.6 };
  const rocket = { id: game.nextProjectileId++, owner: shooter.id, weapon: weaponId, pos: spawn, prev: { ...spawn }, vel: { x: dir.x * cfg.speed, y: dir.y * cfg.speed, z: dir.z * cfg.speed }, age: 0 };
  game.events.push({ type: "shot", id: shooter.id, weapon: weaponId, origin: eye, traces: [] });
  const blocked = traceRay(game.world, eye, spawn);
  if (blocked.fraction < 1) return explode(game, rocket, blocked.end, blocked.normal);
  game.projectiles.push(rocket);
  game.events.push({ type: "rocket", id: rocket.id, owner: shooter.id, pos: { ...spawn }, vel: { ...rocket.vel } });
}

function stepProjectiles(game) {
  const alive = [];
  for (const rocket of game.projectiles) {
    const cfg = WEAPONS[rocket.weapon].projectile;
    rocket.prev = { ...rocket.pos };
    rocket.age += C.TICK_DT;
    const from = rocket.pos;
    const to = { x: from.x + rocket.vel.x * C.TICK_DT, y: from.y + rocket.vel.y * C.TICK_DT, z: from.z + rocket.vel.z * C.TICK_DT };
    const wall = traceBox(game.world, from, to, 0.08, 0.08, 0.08);
    const segment = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const dir = { x: (to.x - from.x) / segment, y: (to.y - from.y) / segment, z: (to.z - from.z) / segment };
    let best = wall.fraction * segment, hit = false;
    for (const p of game.players) {
      if (!p.isAlive || (p.id === rocket.owner && rocket.age < cfg.ownerGrace)) continue;
      const boxes = hitboxes(p);
      const min = { x: boxes.body.min.x - 0.08, y: boxes.body.min.y - 0.08, z: boxes.body.min.z - 0.08 };
      const max = { x: boxes.head.max.x + 0.08, y: boxes.head.max.y + 0.08, z: boxes.head.max.z + 0.08 };
      const t = rayBox(from, dir, best, min, max);
      if (t >= 0 && t <= best) { best = t; hit = true; }
    }
    if (hit || wall.fraction < 1) {
      const point = { x: from.x + dir.x * best, y: from.y + dir.y * best, z: from.z + dir.z * best };
      explode(game, rocket, point, hit ? null : wall.normal);
      continue;
    }
    if (rocket.age >= cfg.maxLife) {
      explode(game, rocket, to, null);
      continue;
    }
    rocket.pos = to;
    alive.push(rocket);
  }
  game.projectiles = alive;
}

function touchPickups(game, player) {
  const p = player.move.pos;
  for (const item of game.pickups) {
    if (game.time < item.availableAt) continue;
    if (Math.hypot(item.pos.x - p.x, item.pos.z - p.z) > C.PICKUP_RADIUS || p.y < item.pos.y - 1 || p.y > item.pos.y + 1.2) continue;
    let isTaken = false;
    if (item.kind === "health" && player.health < C.MAX_HEALTH) {
      player.health = Math.min(C.MAX_HEALTH, player.health + item.amount);
      isTaken = true;
    } else if (item.kind === "mega" && player.health < C.MAX_OVERHEAL) {
      player.health = Math.min(C.MAX_OVERHEAL, player.health + item.amount);
      isTaken = true;
    } else if (item.kind === "armor" && player.armor < C.MAX_ARMOR) {
      player.armor = Math.min(C.MAX_ARMOR, player.armor + item.amount);
      isTaken = true;
    } else if (item.kind === "ammo") {
      isTaken = giveAmmo(player.arsenal);
    } else if (item.kind === "weapon") {
      isTaken = giveWeapon(player.arsenal, item.weapon, player.move.time);
    }
    if (!isTaken) continue;
    item.availableAt = game.time + PICKUP_RESPAWN[item.kind];
    game.events.push({ type: "pickup", id: player.id, index: item.index, kind: item.kind, weapon: item.weapon });
  }
}

export function sanitizeInput(raw) {
  if (!raw || typeof raw !== "object") return IDLE_INPUT;
  const num = (v, min, max) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0);
  let fwd = num(raw.fwd, -1, 1), side = num(raw.side, -1, 1);
  const len = Math.hypot(fwd, side);
  if (len > 1) { fwd /= len; side /= len; }
  const yaw = num(raw.yaw, -1e6, 1e6) % (Math.PI * 2);
  return { fwd, side, yaw, pitch: num(raw.pitch, -1.55, 1.55), buttons: (raw.buttons | 0) & C.BUTTON_MASK, weapon: num(raw.weapon, 0, 9) | 0 };
}

export function stepPlayer(game, player, input) {
  player.lastInput = input;
  const moveEvents = [];
  stepMovement(game.world, player.move, input, C.TICK_DT, game.map.pads, moveEvents);
  for (const e of moveEvents) game.events.push({ ...e, id: player.id });
  const shot = updateArsenal(player.arsenal, input, player.move.time, C.TICK_DT);
  if (shot === "dry") game.events.push({ type: "dry", id: player.id });
  else if (shot) {
    player.protectedUntil = Math.min(player.protectedUntil, game.time);
    if (WEAPONS[player.arsenal.current].projectile) fireProjectile(game, player, player.arsenal.current, input);
    else fireHitscan(game, player, player.arsenal.current, shot.spread, input, game.positionsAt?.bind(null, player));
  }
  touchPickups(game, player);
  if (player.move.pos.y < C.FALL_KILL_Y) applyDamage(game, player, null, 999, "fall");
}

export function stepGame(game, inputs) {
  game.events.length = 0;
  game.time += C.TICK_DT;
  game.tick++;
  for (const player of game.players) {
    if (!player.isAlive) {
      if (!game.isOver && game.time >= player.respawnAt) spawnPlayer(game, player);
      continue;
    }
    const input = player.isBot ? thinkBot(game, player) : inputs?.get(player.id) ?? { ...player.lastInput, buttons: 0 };
    stepPlayer(game, player, input);
  }
  stepProjectiles(game);
  if (game.time >= game.timeLimit) checkMatchEnd(game);
  return game.events;
}

export function scoreboard(game) {
  return [...game.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).map(p => ({ id: p.id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, isBot: p.isBot }));
}
