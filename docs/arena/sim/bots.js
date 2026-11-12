import * as C from "./constants.js";
import { findPath, linkBetween } from "./nav.js";
import { traceBox } from "./collision.js";
import { WEAPONS } from "./weapons.js";
import { angleDelta, chestPosition, eyePosition, hasLineOfSight, pitchTo, yawTo } from "./entity.js";

export const DIFFICULTIES = Object.freeze({
  easy: { name: "Viegli", reaction: 0.6, aimError: 0.09, turnSpeed: 4, bhop: 0, dodge: 0.25, dash: 0, wallJump: 0, aggression: 0.35, fov: 1.6, fireCone: 1.6, headshot: 0, strafeSwitch: [0.7, 1.4], hearing: 14 },
  normal: { name: "Normāli", reaction: 0.38, aimError: 0.05, turnSpeed: 7, bhop: 0.35, dodge: 0.55, dash: 0.25, wallJump: 0.3, aggression: 0.55, fov: 2, fireCone: 1.25, headshot: 0.1, strafeSwitch: [0.45, 1], hearing: 22 },
  hard: { name: "Grūti", reaction: 0.24, aimError: 0.028, turnSpeed: 11, bhop: 0.75, dodge: 0.8, dash: 0.55, wallJump: 0.6, aggression: 0.75, fov: 2.2, fireCone: 1, headshot: 0.3, strafeSwitch: [0.3, 0.75], hearing: 30 },
  nightmare: { name: "Murgs", reaction: 0.14, aimError: 0.014, turnSpeed: 18, bhop: 1, dodge: 1, dash: 0.85, wallJump: 1, aggression: 0.9, fov: 2.4, fireCone: 0.85, headshot: 0.55, strafeSwitch: [0.2, 0.55], hearing: 40 },
});

const THINK_INTERVAL = 0.1;
const STUCK_INTERVAL = 1;
const HUNT_MEMORY = 4;
const AWARE_AFTER_HIT = 1.5;

const dirOfYaw = yaw => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const yawOfDir = d => Math.atan2(-d.x, -d.z);

export function createBrain(game, difficultyId) {
  const d = DIFFICULTIES[difficultyId] || DIFFICULTIES.normal;
  const brain = {
    d, difficultyId,
    path: null, pathIndex: 0, goal: null, repathAt: 0, isBhopping: false,
    targetId: null, targetSince: 0, lastSeenPos: null, lastSeenAt: -10,
    aimYaw: 0, aimPitch: 0, errYaw: 0, errPitch: 0, aimAtHead: false,
    strafeSign: 1, strafeUntil: 0, airSign: 1, nextThinkAt: 0,
    stuckPos: null, stuckCheckAt: 0, stuckCount: 0, prevButtons: 0, fireToggle: false, wantsReload: false, lastHurtSeen: -1,
    reset(g, bot) {
      this.path = null;
      this.goal = null;
      this.targetId = null;
      this.aimYaw = bot.move.yaw;
      this.aimPitch = 0;
      this.stuckPos = { ...bot.move.pos };
      this.stuckCheckAt = g.time + STUCK_INTERVAL;
      this.nextThinkAt = g.time;
    },
  };
  return brain;
}

function enemiesOf(game, bot) {
  return game.players.filter(p => p !== bot && p.isAlive && (game.mode !== "tdm" || p.team !== bot.team));
}

function hasFiredRecently(p, time) {
  const w = WEAPONS[p.arsenal.current];
  return p.arsenal.nextFireAt - w.fireInterval > time - 0.5;
}

function perceive(game, bot, brain) {
  const eye = eyePosition(bot);
  let best = null, bestScore = Infinity;
  for (const enemy of enemiesOf(game, bot)) {
    const chest = chestPosition(enemy);
    const dist = Math.hypot(chest.x - eye.x, chest.y - eye.y, chest.z - eye.z);
    const facing = Math.abs(angleDelta(brain.aimYaw, yawTo(eye, chest)));
    const wasHitByThem = bot.lastHurtBy === enemy.id && game.time - bot.lastHurtAt < AWARE_AFTER_HIT;
    const isAudible = dist < brain.d.hearing && hasFiredRecently(enemy, game.time);
    const isNoticed = facing < brain.d.fov / 2 || dist < 4 || wasHitByThem || isAudible || enemy.id === brain.targetId;
    if (!isNoticed || !hasLineOfSight(game.world, eye, chest)) continue;
    const score = dist + (enemy.id === brain.targetId ? -6 : 0) + (wasHitByThem ? -8 : 0) + enemy.health * 0.03;
    if (score < bestScore) { bestScore = score; best = enemy; }
  }
  if (best) {
    if (best.id !== brain.targetId) {
      brain.targetId = best.id;
      brain.targetSince = game.time;
      brain.errYaw = game.rng.range(-1, 1) * brain.d.aimError * 3;
      brain.errPitch = game.rng.range(-1, 1) * brain.d.aimError * 2;
      brain.aimAtHead = game.rng.chance(brain.d.headshot);
    }
    brain.lastSeenPos = { ...best.move.pos };
    brain.lastSeenAt = game.time;
  } else if (brain.targetId && game.time - brain.lastSeenAt > 0.4) {
    brain.targetId = null;
  }
  if (!best && bot.lastHurtBy && bot.lastHurtAt > brain.lastHurtSeen) {
    brain.lastHurtSeen = bot.lastHurtAt;
    const attacker = game.players.find(p => p.id === bot.lastHurtBy);
    if (attacker?.isAlive) {
      brain.lastSeenPos = { ...attacker.move.pos };
      brain.lastSeenAt = game.time;
    }
  }
  return best;
}

function nearestAvailablePickup(game, bot, predicate) {
  let best = null, bestDist = Infinity;
  for (const item of game.pickups) {
    if (game.time < item.availableAt - 2 || !predicate(item)) continue;
    const p = bot.move.pos;
    const dist = Math.hypot(item.pos.x - p.x, (item.pos.y - p.y) * 2, item.pos.z - p.z);
    if (dist < bestDist) { bestDist = dist; best = item; }
  }
  return best;
}

function chooseGoal(game, bot, brain, target) {
  const d = brain.d;
  const ownsShotgun = bot.arsenal.owned.aa12 && bot.arsenal.ammo.aa12.mag + bot.arsenal.ammo.aa12.reserve > 0;
  const healthNeed = bot.health < 45 + (1 - d.aggression) * 40;
  if (healthNeed) {
    const item = nearestAvailablePickup(game, bot, i => i.kind === "health" || i.kind === "mega");
    if (item && (!target || bot.health < 40)) return { kind: "item", pos: item.pos };
  }
  if (target) {
    const range = ownsShotgun ? 7 : 16;
    const dist = Math.hypot(target.move.pos.x - bot.move.pos.x, target.move.pos.z - bot.move.pos.z);
    if (dist > range + 3 || !hasLineOfSight(game.world, eyePosition(bot), chestPosition(target))) return { kind: "chase", pos: target.move.pos };
    return { kind: "fight", pos: null };
  }
  if (!ownsShotgun) {
    const item = nearestAvailablePickup(game, bot, i => i.kind === "weapon");
    if (item) return { kind: "item", pos: item.pos };
  }
  if (brain.lastSeenPos && game.time - brain.lastSeenAt < HUNT_MEMORY * (0.5 + d.aggression)) return { kind: "hunt", pos: brain.lastSeenPos };
  if (brain.goal?.kind === "roam" && brain.path && brain.pathIndex < brain.path.length) return brain.goal;
  const options = d.aggression > 0.6 && game.rng.chance(0.6) ? game.pickups.map(i => i.pos) : game.map.spawns.map(s => s.pos);
  return { kind: "roam", pos: game.rng.pick(options) };
}

function planPath(game, bot, brain, goal) {
  const from = game.nav.nearest(bot.move.pos, 3);
  const to = game.nav.nearest(goal.pos, 3);
  brain.path = findPath(game.nav, from, to);
  brain.pathIndex = 0;
  brain.isBhopping = game.rng.chance(brain.d.bhop);
  brain.repathAt = game.time + (goal.kind === "chase" ? 0.5 : goal.kind === "hunt" ? 1 : 4);
}

function sameGoal(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (!a.pos || !b.pos) return a.pos === b.pos;
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z) < 2;
}

function skipAhead(game, bot, brain) {
  const path = brain.path;
  const m = bot.move;
  while (brain.pathIndex + 1 < path.length) {
    const next = game.nav.nodes[path[brain.pathIndex + 1]];
    const link = linkBetween(game.nav, path[brain.pathIndex], path[brain.pathIndex + 1]);
    if (!link || link.type !== "walk" || Math.abs(next.y - m.pos.y) > 0.6) break;
    const hh = C.STAND_HEIGHT / 2 - 0.25;
    const t = traceBox(game.world, { x: m.pos.x, y: m.pos.y + 0.5 + hh, z: m.pos.z }, { x: next.x, y: next.y + 0.5 + hh, z: next.z }, C.PLAYER_RADIUS, hh, C.PLAYER_RADIUS);
    if (t.fraction < 1) break;
    brain.pathIndex++;
  }
}

function decide(game, bot, brain) {
  const target = perceive(game, bot, brain);
  const goal = chooseGoal(game, bot, brain, target);
  if (goal.pos && (!sameGoal(goal, brain.goal) || !brain.path || game.time >= brain.repathAt)) planPath(game, bot, brain, goal);
  brain.goal = goal;
  if (brain.path) skipAhead(game, bot, brain);
  if (game.time >= brain.strafeUntil) {
    brain.strafeSign = game.rng.chance(0.5) ? 1 : -1;
    brain.strafeUntil = game.time + game.rng.range(...brain.d.strafeSwitch);
  }
  brain.errYaw = brain.errYaw * 0.7 + game.rng.range(-1, 1) * brain.d.aimError * 0.6;
  brain.errPitch = brain.errPitch * 0.7 + game.rng.range(-1, 1) * brain.d.aimError * 0.4;
  if (game.time >= brain.stuckCheckAt) {
    const moved = Math.hypot(bot.move.pos.x - brain.stuckPos.x, bot.move.pos.z - brain.stuckPos.z);
    brain.stuckCount = moved < 0.6 && brain.goal?.kind !== "fight" ? brain.stuckCount + 1 : 0;
    if (brain.stuckCount >= 3) {
      brain.path = null;
      brain.goal = { kind: "roam", pos: game.rng.pick(game.map.spawns).pos };
      planPath(game, bot, brain, brain.goal);
      brain.stuckCount = 0;
    }
    brain.stuckPos = { ...bot.move.pos };
    brain.stuckCheckAt = game.time + STUCK_INTERVAL;
  }
  return target;
}

function followPath(game, bot, brain, buttons) {
  const path = brain.path;
  if (!path || brain.pathIndex >= path.length) return null;
  const m = bot.move;
  const speed = Math.hypot(m.vel.x, m.vel.z);
  let node = game.nav.nodes[path[brain.pathIndex]];
  const reach = Math.max(0.7, speed * 0.09);
  if (Math.hypot(node.x - m.pos.x, node.z - m.pos.z) < reach && Math.abs(node.y - m.pos.y) < 1.4) {
    brain.pathIndex++;
    if (brain.pathIndex >= path.length) return null;
    node = game.nav.nodes[path[brain.pathIndex]];
  }
  const prev = brain.pathIndex > 0 ? path[brain.pathIndex - 1] : null;
  const link = prev !== null ? linkBetween(game.nav, prev, path[brain.pathIndex]) : null;
  const dx = node.x - m.pos.x, dz = node.z - m.pos.z;
  const flat = Math.hypot(dx, dz) || 1;
  if (link?.type === "jump" && m.isOnGround && flat < 2.2) buttons.jump = true;
  if (!m.isOnGround && node.y > m.pos.y + 0.8 && m.wallNormal && game.time - m.wallTime < 0.2 && game.rng.chance(brain.d.wallJump * 0.3)) buttons.jumpPress = true;
  if (brain.stuckCount > 0) buttons.jump = true;
  return { x: dx / flat, z: dz / flat, node, link };
}

function strafeJumpWish(m, desired, brain) {
  const speed = Math.hypot(m.vel.x, m.vel.z);
  if (speed < 6) return desired;
  const velYaw = Math.atan2(-m.vel.x, -m.vel.z);
  const delta = angleDelta(velYaw, yawOfDir(desired));
  if (Math.abs(delta) > 1.2) return desired;
  const sign = Math.abs(delta) < 0.08 ? brain.airSign : -Math.sign(delta);
  const offset = Math.PI / 2 + Math.asin(Math.min(1, 0.62 / speed));
  return dirOfYaw(velYaw - sign * offset);
}

function chooseWeapon(bot, target) {
  const a = bot.arsenal;
  const hasShotgunAmmo = a.owned.aa12 && a.ammo.aa12.mag + a.ammo.aa12.reserve > 0;
  if (!target) return hasShotgunAmmo ? WEAPONS.aa12.slot : WEAPONS.pistol.slot;
  const dist = Math.hypot(target.move.pos.x - bot.move.pos.x, target.move.pos.z - bot.move.pos.z);
  return hasShotgunAmmo && dist < 20 ? WEAPONS.aa12.slot : WEAPONS.pistol.slot;
}

function aimAt(game, bot, brain, target, dt) {
  const d = brain.d;
  let wantYaw = brain.aimYaw, wantPitch = 0;
  if (target) {
    const eye = eyePosition(bot);
    const aimPoint = chestPosition(target);
    if (brain.aimAtHead) aimPoint.y = target.move.pos.y + (target.move.isCrouched ? C.CROUCH_HEIGHT : C.STAND_HEIGHT) - C.HEAD_SIZE / 2;
    const tracking = Math.exp(-(game.time - brain.targetSince) / 0.7);
    const lateral = Math.hypot(target.move.vel.x, target.move.vel.z) / Math.max(4, Math.hypot(aimPoint.x - eye.x, aimPoint.z - eye.z));
    const errScale = 1 + tracking * 2.5 + lateral * (1 - d.aggression) * 0.5;
    wantYaw = yawTo(eye, aimPoint) + brain.errYaw * errScale;
    wantPitch = pitchTo(eye, aimPoint) + brain.errPitch * errScale;
  } else if (brain.lastSeenPos && game.time - brain.lastSeenAt < 1.5) {
    const eye = eyePosition(bot);
    wantYaw = yawTo(eye, { ...brain.lastSeenPos, y: brain.lastSeenPos.y + 1.4 });
  } else {
    const v = bot.move.vel;
    if (Math.hypot(v.x, v.z) > 1.5) wantYaw = Math.atan2(-v.x, -v.z);
  }
  const maxTurn = d.turnSpeed * dt;
  const dy = angleDelta(brain.aimYaw, wantYaw);
  brain.aimYaw += Math.max(-maxTurn, Math.min(maxTurn, dy));
  brain.aimPitch += Math.max(-maxTurn, Math.min(maxTurn, wantPitch - brain.aimPitch));
  brain.aimPitch = Math.max(-1.5, Math.min(1.5, brain.aimPitch));
}

export function thinkBot(game, bot) {
  const brain = bot.brain;
  const dt = C.TICK_DT;
  let target = brain.targetId ? game.players.find(p => p.id === brain.targetId && p.isAlive) || null : null;
  if (game.time >= brain.nextThinkAt) {
    target = decide(game, bot, brain);
    brain.nextThinkAt = game.time + THINK_INTERVAL;
  }
  const m = bot.move;
  const flags = { jump: false, jumpPress: false, crouch: false, dash: false, fire: false };
  const route = followPath(game, bot, brain, flags);
  let wish = route ? { x: route.x, z: route.z } : null;

  if (target) {
    const toTarget = { x: target.move.pos.x - m.pos.x, z: target.move.pos.z - m.pos.z };
    const dist = Math.hypot(toTarget.x, toTarget.z) || 1;
    toTarget.x /= dist;
    toTarget.z /= dist;
    const side = { x: -toTarget.z * brain.strafeSign, z: toTarget.x * brain.strafeSign };
    const preferred = bot.arsenal.current === "aa12" ? 6 : 14;
    const approach = brain.goal?.kind === "fight" ? Math.max(-1, Math.min(1, (dist - preferred) / 4)) * (0.4 + brain.d.aggression) : 0;
    const base = brain.goal?.kind === "fight" || !wish ? { x: toTarget.x * approach, z: toTarget.z * approach } : { x: wish.x * 0.8, z: wish.z * 0.8 };
    const dodge = brain.d.dodge;
    wish = { x: base.x + side.x * dodge, z: base.z + side.z * dodge };
    if (m.isOnGround && game.rng.chance(dodge * 0.9 * dt)) flags.jump = true;
    if (bot.lastHurtAt > game.time - dt * 1.5 && game.rng.chance(brain.d.dash)) {
      flags.dash = true;
      wish = side;
    }
  }

  if (route && brain.isBhopping && !target && route.link?.type !== "jump") {
    const ahead = brain.path.length - brain.pathIndex;
    if (ahead > 4) {
      flags.jump = true;
      if (!m.isOnGround) wish = strafeJumpWish(m, wish, brain);
    }
  }
  if (m.isOnGround && brain.wasAirborne) brain.airSign = -brain.airSign;
  brain.wasAirborne = !m.isOnGround;
  if (!target && route && Math.hypot(m.vel.x, m.vel.z) > C.SLIDE_MIN_SPEED + 1 && m.isOnGround && game.rng.chance(brain.d.bhop * 0.02)) flags.crouch = true;

  aimAt(game, bot, brain, target, dt);
  const weapon = chooseWeapon(bot, target);
  if (target && game.time - brain.targetSince >= brain.d.reaction) {
    const w = WEAPONS[bot.arsenal.current];
    const eye = eyePosition(bot);
    const chest = chestPosition(target);
    const dist = Math.hypot(chest.x - eye.x, chest.y - eye.y, chest.z - eye.z);
    const off = Math.abs(angleDelta(brain.aimYaw, yawTo(eye, chest))) + Math.abs(brain.aimPitch - pitchTo(eye, chest));
    const cone = Math.max(w.botCone, 0.45 / dist) * brain.d.fireCone;
    if (off < cone && dist < w.botRange * 1.8) {
      if (w.isAuto) flags.fire = true;
      else {
        brain.fireToggle = !brain.fireToggle;
        flags.fire = brain.fireToggle;
      }
    }
  }
  const ammo = bot.arsenal.ammo[bot.arsenal.current];
  const wantsReload = !target && ammo.mag < WEAPONS[bot.arsenal.current].magazine * 0.5 && ammo.reserve > 0;

  let buttons = 0;
  if (flags.jump || flags.jumpPress) buttons |= C.BUTTON.JUMP;
  if (flags.jumpPress && (brain.prevButtons & C.BUTTON.JUMP)) buttons &= ~C.BUTTON.JUMP;
  if (flags.crouch) buttons |= C.BUTTON.CROUCH;
  if (flags.dash) buttons |= C.BUTTON.DASH;
  if (flags.fire) buttons |= C.BUTTON.FIRE;
  if (wantsReload) buttons |= C.BUTTON.RELOAD;
  brain.prevButtons = buttons;

  let fwd = 0, side = 0;
  if (wish) {
    const len = Math.hypot(wish.x, wish.z);
    if (len > 0.05) {
      const wx = wish.x / Math.max(1, len), wz = wish.z / Math.max(1, len);
      const sin = Math.sin(brain.aimYaw), cos = Math.cos(brain.aimYaw);
      fwd = -sin * wx - cos * wz;
      side = cos * wx - sin * wz;
    }
  }
  return { fwd, side, yaw: brain.aimYaw, pitch: brain.aimPitch, buttons, weapon: weapon };
}
