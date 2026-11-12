import { sanitizeInput } from "./game.js";
import { LOADOUT_WEAPONS, WEAPONS, WEAPON_ORDER } from "./weapons.js";

export const PROTOCOL_VERSION = 1;
export const SNAPSHOT_EVERY = 4;
export const INPUT_BATCH = 4;
export const MAX_BATCH = 12;
export const MAX_QUEUED_INPUTS = 30;
export const INTERP_TICKS = 6;
export const LAG_COMP_TICKS = 18;
export const MAX_HUMANS = 6;
export const MAX_PLAYERS = 8;
export const NAME_MAX = 16;
export const CODE_PATTERN = /^[A-HJKMNP-Z2-9]{5}$/;

const round = (value, scale) => Math.round(value * scale) / scale;

export function packInput(seq, input, viewTick) {
  return [seq, round(input.fwd, 100), round(input.side, 100), round(input.yaw, 1e5), round(input.pitch, 1e5), input.buttons | 0, input.weapon | 0, viewTick | 0];
}

export function unpackInput(raw) {
  if (!Array.isArray(raw) || raw.length !== 8) return null;
  const [seq, fwd, side, yaw, pitch, buttons, weapon, viewTick] = raw;
  if (!Number.isInteger(seq) || seq < 0) return null;
  return { seq, input: sanitizeInput({ fwd, side, yaw, pitch, buttons, weapon }), viewTick: Number.isInteger(viewTick) ? viewTick : -1 };
}

export function cleanName(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

export function cleanLoadout(raw) {
  return LOADOUT_WEAPONS.includes(raw) ? raw : null;
}

const MOVE_FIELDS = ["time", "yaw", "pitch", "lastGroundTime", "slideReadyAt", "jumpBufferUntil", "prevButtons", "wallTime", "wallJumps", "dashCharge", "dashReadyAt", "padReadyAt"];
const MOVE_FLAGS = ["isOnGround", "hasJumpedSinceGround", "isCrouched", "isSliding"];

export function packMove(m) {
  return {
    p: [m.pos.x, m.pos.y, m.pos.z], v: [m.vel.x, m.vel.y, m.vel.z], g: [m.groundNormal.x, m.groundNormal.y, m.groundNormal.z],
    w: m.wallNormal ? [m.wallNormal.x, m.wallNormal.z] : null,
    f: MOVE_FIELDS.map(k => m[k]),
    b: MOVE_FLAGS.reduce((bits, k, i) => bits | (m[k] ? 1 << i : 0), 0),
  };
}

export function unpackMove(packed, target) {
  target.pos = { x: packed.p[0], y: packed.p[1], z: packed.p[2] };
  target.vel = { x: packed.v[0], y: packed.v[1], z: packed.v[2] };
  target.groundNormal = { x: packed.g[0], y: packed.g[1], z: packed.g[2] };
  target.wallNormal = packed.w ? { x: packed.w[0], y: 0, z: packed.w[1] } : null;
  MOVE_FIELDS.forEach((k, i) => { target[k] = packed.f[i]; });
  MOVE_FLAGS.forEach((k, i) => { target[k] = (packed.b & (1 << i)) !== 0; });
  return target;
}

export function packArsenal(a) {
  const ammo = {};
  for (const id of Object.keys(a.owned)) ammo[id] = [a.ammo[id].mag, a.ammo[id].reserve === Infinity ? -1 : a.ammo[id].reserve];
  return {
    a: ammo, c: a.current, pv: a.previous, s: a.state, su: a.stateUntil, nf: a.nextFireAt, bl: a.bloom,
    wf: a.wasFireHeld ? 1 : 0, fb: a.fireBufferedUntil, es: a.emptySince, sc: a.shotCount, is: a.isScoped ? 1 : 0, re: a.reloadWasEmpty ? 1 : 0,
  };
}

export function unpackArsenal(packed, target = {}) {
  target.owned = {};
  target.ammo = {};
  for (const [id, [mag, reserve]] of Object.entries(packed.a || {})) {
    if (!WEAPONS[id]) continue;
    target.owned[id] = true;
    target.ammo[id] = { mag, reserve: reserve < 0 ? Infinity : reserve };
  }
  if (!target.owned[packed.c]) throw new Error("bad arsenal");
  target.current = packed.c;
  target.previous = packed.pv;
  target.state = packed.s;
  target.stateUntil = packed.su;
  target.nextFireAt = packed.nf;
  target.bloom = packed.bl;
  target.wasFireHeld = packed.wf === 1;
  target.fireBufferedUntil = packed.fb;
  target.emptySince = packed.es;
  target.shotCount = packed.sc;
  target.isScoped = packed.is === 1;
  target.reloadWasEmpty = packed.re === 1;
  return target;
}

const FLAG = { alive: 1, crouched: 2, sliding: 4, ground: 8 };

export function packRemote(p) {
  const m = p.move;
  const flags = (p.isAlive ? FLAG.alive : 0) | (m.isCrouched ? FLAG.crouched : 0) | (m.isSliding ? FLAG.sliding : 0) | (m.isOnGround ? FLAG.ground : 0);
  return [p.id, round(m.pos.x, 1000), round(m.pos.y, 1000), round(m.pos.z, 1000), round(m.vel.x, 100), round(m.vel.y, 100), round(m.vel.z, 100), round(m.yaw, 1e4), round(p.lastInput?.pitch ?? 0, 1e4), flags, WEAPON_ORDER.indexOf(p.arsenal.current), p.kills, p.deaths];
}

export function unpackRemote(raw) {
  const [id, x, y, z, vx, vy, vz, yaw, pitch, flags, weaponIndex, kills, deaths] = raw;
  return {
    id, pos: { x, y, z }, vel: { x: vx, y: vy, z: vz }, yaw, pitch,
    isAlive: (flags & FLAG.alive) !== 0, isCrouched: (flags & FLAG.crouched) !== 0, isSliding: (flags & FLAG.sliding) !== 0, isOnGround: (flags & FLAG.ground) !== 0,
    weapon: WEAPON_ORDER[weaponIndex] || "pistol", kills, deaths,
  };
}

export function roundDeep(value, scale = 1000) {
  if (typeof value === "number") return Number.isFinite(value) ? round(value, scale) : 0;
  if (Array.isArray(value)) return value.map(v => roundDeep(v, scale));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = roundDeep(v, scale);
    return out;
  }
  return value;
}
