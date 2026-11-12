import * as C from "./constants.js";
import { traceBox } from "./collision.js";

const MAX_CLIP_PLANES = 5;
const OVERCLIP = 1.001;

export function createMoveState(position, yaw = 0) {
  return {
    pos: { ...position }, vel: { x: 0, y: 0, z: 0 }, yaw, pitch: 0,
    time: 0, isOnGround: false, groundNormal: { x: 0, y: 1, z: 0 }, lastGroundTime: -1, hasJumpedSinceGround: false,
    isCrouched: false, isSliding: false, slideReadyAt: 0, jumpBufferUntil: -1, prevButtons: 0,
    wallNormal: null, wallTime: -1, wallJumps: 0, dashCharge: 1, dashReadyAt: 0, padReadyAt: 0,
  };
}

export function cloneMoveState(s) {
  return { ...s, pos: { ...s.pos }, vel: { ...s.vel }, groundNormal: { ...s.groundNormal }, wallNormal: s.wallNormal && { ...s.wallNormal } };
}

export const playerHeight = s => (s.isCrouched ? C.CROUCH_HEIGHT : C.STAND_HEIGHT);
export const eyeHeight = s => (s.isCrouched ? C.EYE_CROUCH : C.EYE_STAND);
export const horizontalSpeed = s => Math.hypot(s.vel.x, s.vel.z);

function trace(world, s, from, to, height = playerHeight(s)) {
  const hh = height / 2;
  const t = traceBox(world, { x: from.x, y: from.y + hh, z: from.z }, { x: to.x, y: to.y + hh, z: to.z }, C.PLAYER_RADIUS, hh, C.PLAYER_RADIUS);
  t.end.y -= hh;
  return t;
}

function clipVelocity(v, n, overbounce = OVERCLIP) {
  let backoff = v.x * n.x + v.y * n.y + v.z * n.z;
  backoff = backoff < 0 ? backoff * overbounce : backoff / overbounce;
  return { x: v.x - n.x * backoff, y: v.y - n.y * backoff, z: v.z - n.z * backoff };
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

function noteWall(s, n) {
  if (Math.abs(n.y) >= C.WALL_NORMAL_MAX) return;
  s.wallNormal = { x: n.x, y: 0, z: n.z };
  const len = Math.hypot(n.x, n.z) || 1;
  s.wallNormal.x /= len;
  s.wallNormal.z /= len;
  s.wallTime = s.time;
}

function slideMove(world, s, dt) {
  const planes = [];
  let timeLeft = dt;
  let hasCollided = false;
  if (s.isOnGround) planes.push(s.groundNormal);
  const speed = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
  if (speed > 0) planes.push({ x: s.vel.x / speed, y: s.vel.y / speed, z: s.vel.z / speed });
  for (let bump = 0; bump < 4; bump++) {
    const end = { x: s.pos.x + s.vel.x * timeLeft, y: s.pos.y + s.vel.y * timeLeft, z: s.pos.z + s.vel.z * timeLeft };
    const t = trace(world, s, s.pos, end);
    if (t.allSolid) {
      s.vel.y = 0;
      return true;
    }
    if (t.fraction > 0) s.pos = t.end;
    if (t.fraction === 1) break;
    if (!t.normal) {
      s.pos.y += 0.01;
      continue;
    }
    hasCollided = true;
    noteWall(s, t.normal);
    timeLeft -= timeLeft * t.fraction;
    if (planes.length >= MAX_CLIP_PLANES) {
      s.vel = { x: 0, y: 0, z: 0 };
      return true;
    }
    if (planes.some(p => dot(p, t.normal) > 0.99)) {
      s.vel = { x: s.vel.x + t.normal.x * 0.01, y: s.vel.y + t.normal.y * 0.01, z: s.vel.z + t.normal.z * 0.01 };
      continue;
    }
    planes.push(t.normal);
    let resolved = false;
    for (let i = 0; i < planes.length && !resolved; i++) {
      if (dot(s.vel, planes[i]) >= 0.1) continue;
      let clip = clipVelocity(s.vel, planes[i]);
      let isBlocked = false;
      for (let j = 0; j < planes.length; j++) {
        if (j === i || dot(clip, planes[j]) >= 0.1) continue;
        clip = clipVelocity(clip, planes[j]);
        if (dot(clip, planes[i]) >= 0) continue;
        const a = planes[i], b = planes[j];
        let dir = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
        const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
        dir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
        const d = dot(dir, s.vel);
        clip = { x: dir.x * d, y: dir.y * d, z: dir.z * d };
        for (let k = 0; k < planes.length; k++) {
          if (k === i || k === j || dot(clip, planes[k]) >= 0.1) continue;
          isBlocked = true;
          break;
        }
        if (isBlocked) break;
      }
      if (isBlocked) {
        s.vel = { x: 0, y: 0, z: 0 };
        return true;
      }
      s.vel = clip;
      resolved = true;
    }
  }
  return hasCollided;
}

function stepSlideMove(world, s, dt) {
  const startPos = { ...s.pos }, startVel = { ...s.vel };
  if (!slideMove(world, s, dt)) return;
  const downPos = { ...s.pos }, downVel = { ...s.vel };
  if (!s.isOnGround && startVel.y > 0) return;
  const up = trace(world, s, startPos, { x: startPos.x, y: startPos.y + C.STEP_HEIGHT, z: startPos.z });
  if (up.allSolid) return;
  const stepSize = up.end.y - startPos.y;
  s.pos = up.end;
  s.vel = { ...startVel };
  slideMove(world, s, dt);
  const down = trace(world, s, s.pos, { x: s.pos.x, y: s.pos.y - stepSize, z: s.pos.z });
  if (!down.allSolid) s.pos = down.end;
  if (down.fraction < 1 && down.normal) s.vel = clipVelocity(s.vel, down.normal);
  const steppedDist = (s.pos.x - startPos.x) ** 2 + (s.pos.z - startPos.z) ** 2;
  const flatDist = (downPos.x - startPos.x) ** 2 + (downPos.z - startPos.z) ** 2;
  const landedOnWalkable = down.fraction < 1 && !!down.normal && down.normal.y >= C.GROUND_NORMAL_MIN;
  if (steppedDist <= flatDist + 1e-6 || !landedOnWalkable) {
    s.pos = downPos;
    s.vel = downVel;
  }
}

function categorize(world, s, events, wasOnGround) {
  const probe = wasOnGround && s.vel.y <= 0.5 ? C.STEP_HEIGHT : C.GROUND_PROBE;
  const t = trace(world, s, s.pos, { x: s.pos.x, y: s.pos.y - probe, z: s.pos.z });
  const hasGround = t.fraction < 1 && !!t.normal && t.normal.y >= C.GROUND_NORMAL_MIN && dot(s.vel, t.normal) <= 1;
  if (!hasGround) {
    s.isOnGround = false;
    return;
  }
  if (!wasOnGround) {
    events?.push({ type: "land", speed: -s.vel.y });
    s.wallJumps = 0;
  }
  s.isOnGround = true;
  s.groundNormal = t.normal;
  s.pos = t.end;
  s.lastGroundTime = s.time;
  s.hasJumpedSinceGround = false;
  if (s.vel.y < 0) s.vel = clipVelocity(s.vel, t.normal);
}

export function wishDirection(yaw, fwd, side) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  let x = -sin * fwd + cos * side;
  let z = -cos * fwd - sin * side;
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 0, z: 0, amount: 0 };
  return { x: x / len, z: z / len, amount: Math.min(1, len) };
}

function accelerate(s, dir, wishSpeed, accel, dt) {
  const current = s.vel.x * dir.x + s.vel.z * dir.z;
  const add = wishSpeed - current;
  if (add <= 0) return;
  const amount = Math.min(add, accel * dt * wishSpeed);
  s.vel.x += dir.x * amount;
  s.vel.z += dir.z * amount;
}

function airAccelerate(s, dir, wishSpeed, dt) {
  const capped = Math.min(wishSpeed, C.AIR_WISH_CAP);
  const current = s.vel.x * dir.x + s.vel.z * dir.z;
  const add = capped - current;
  if (add <= 0) return;
  const amount = Math.min(add, C.AIR_ACCEL * wishSpeed * dt);
  s.vel.x += dir.x * amount;
  s.vel.z += dir.z * amount;
}

function airControl(s, dir, dt) {
  const speed = Math.hypot(s.vel.x, s.vel.z);
  if (speed < 1) return;
  const vx = s.vel.x / speed, vz = s.vel.z / speed;
  const d = vx * dir.x + vz * dir.z;
  if (d <= 0) return;
  const k = C.AIR_CONTROL * d * d * dt;
  let nx = vx * speed + dir.x * k, nz = vz * speed + dir.z * k;
  const len = Math.hypot(nx, nz);
  s.vel.x = (nx / len) * speed;
  s.vel.z = (nz / len) * speed;
}

function applyFriction(s, friction, stopSpeed, dt) {
  const speed = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
  if (speed < 0.01) {
    s.vel.x = 0;
    s.vel.z = 0;
    return;
  }
  const drop = Math.max(speed, stopSpeed) * friction * dt;
  const scale = Math.max(0, speed - drop) / speed;
  s.vel.x *= scale;
  s.vel.y *= scale;
  s.vel.z *= scale;
}

function updateCrouch(world, s, wantsCrouch) {
  if (wantsCrouch) {
    s.isCrouched = true;
    return;
  }
  if (!s.isCrouched) return;
  const t = trace(world, s, s.pos, s.pos, C.STAND_HEIGHT);
  if (!t.startSolid) s.isCrouched = false;
}

function probeWalls(world, s, wish) {
  const dirs = [];
  const hs = Math.hypot(s.vel.x, s.vel.z);
  if (hs > 0.5) dirs.push({ x: s.vel.x / hs, z: s.vel.z / hs });
  if (wish.amount > 0) dirs.push(wish);
  for (const d of dirs) {
    const t = trace(world, s, s.pos, { x: s.pos.x + d.x * C.WALL_PROBE, y: s.pos.y, z: s.pos.z + d.z * C.WALL_PROBE });
    if (t.fraction < 1 && t.normal) noteWall(s, t.normal);
  }
}

function touchPads(s, pads, events) {
  if (!pads?.length || s.time < s.padReadyAt) return;
  const p = s.pos;
  for (const pad of pads) {
    if (p.x < pad.min.x || p.x > pad.max.x || p.z < pad.min.z || p.z > pad.max.z || p.y < pad.min.y || p.y > pad.max.y) continue;
    s.vel = { ...pad.velocity };
    s.isOnGround = false;
    s.isSliding = false;
    s.hasJumpedSinceGround = true;
    s.padReadyAt = s.time + C.PAD_COOLDOWN;
    s.dashCharge = 1;
    events?.push({ type: "pad" });
    return;
  }
}

export function stepMovement(world, s, input, dt, pads, events) {
  s.time += dt;
  s.yaw = input.yaw;
  s.pitch = input.pitch;
  const buttons = input.buttons | 0;
  const pressed = buttons & ~s.prevButtons;
  s.prevButtons = buttons;
  const wish = wishDirection(input.yaw, input.fwd, input.side);
  const wantsCrouch = (buttons & C.BUTTON.CROUCH) !== 0;
  const wasOnGround = s.isOnGround;

  updateCrouch(world, s, wantsCrouch);
  if (pressed & C.BUTTON.JUMP) s.jumpBufferUntil = s.time + C.JUMP_BUFFER;

  if (s.isOnGround && s.time >= s.dashReadyAt) s.dashCharge = 1;
  if ((pressed & C.BUTTON.DASH) && s.dashCharge > 0 && s.time >= s.dashReadyAt) {
    const dir = wish.amount > 0 ? wish : wishDirection(input.yaw, 1, 0);
    const speed = Math.max(Math.hypot(s.vel.x, s.vel.z) + C.DASH_EXTRA, C.DASH_SPEED);
    s.vel.x = dir.x * speed;
    s.vel.z = dir.z * speed;
    if (!s.isOnGround) s.vel.y = Math.max(s.vel.y, C.DASH_LIFT);
    s.dashCharge = 0;
    s.dashReadyAt = s.time + C.DASH_COOLDOWN;
    events?.push({ type: "dash" });
  }

  const wantsJump = (buttons & C.BUTTON.JUMP) !== 0 || s.time < s.jumpBufferUntil;
  const canGroundJump = s.isOnGround || (!s.hasJumpedSinceGround && s.time - s.lastGroundTime < C.COYOTE_TIME && s.vel.y <= 0);
  let didJump = false;
  if (wantsJump && canGroundJump) {
    s.vel.y = Math.min(Math.max(s.vel.y, 0) + C.JUMP_SPEED, C.JUMP_MAX_VERTICAL);
    s.isOnGround = false;
    s.hasJumpedSinceGround = true;
    s.jumpBufferUntil = -1;
    didJump = true;
    events?.push({ type: s.isSliding ? "slidejump" : "jump" });
    s.isSliding = false;
  } else if ((pressed & C.BUTTON.JUMP) && !s.isOnGround && s.wallNormal && s.time - s.wallTime <= C.WALLJUMP_WINDOW && s.wallJumps < C.WALLJUMP_MAX) {
    const n = s.wallNormal;
    const into = s.vel.x * n.x + s.vel.z * n.z;
    if (into < 0) {
      s.vel.x -= n.x * into;
      s.vel.z -= n.z * into;
    }
    s.vel.x += n.x * C.WALLJUMP_PUSH;
    s.vel.z += n.z * C.WALLJUMP_PUSH;
    s.vel.y = Math.max(s.vel.y, C.WALLJUMP_UP);
    s.wallJumps++;
    s.wallTime = -1;
    s.jumpBufferUntil = -1;
    events?.push({ type: "walljump", normal: { ...n } });
  }

  const hs = Math.hypot(s.vel.x, s.vel.z);
  if (s.isOnGround && !didJump) {
    if (wantsCrouch && !s.isSliding && hs > C.SLIDE_MIN_SPEED) {
      s.isSliding = true;
      if (s.time >= s.slideReadyAt) {
        const scale = (hs + C.SLIDE_BOOST) / hs;
        s.vel.x *= scale;
        s.vel.z *= scale;
        s.slideReadyAt = s.time + C.SLIDE_COOLDOWN;
      }
      events?.push({ type: "slide" });
    }
    if (s.isSliding && (!wantsCrouch || hs < C.SLIDE_END_SPEED)) s.isSliding = false;
  } else if (!s.isOnGround) {
    s.isSliding = false;
  }

  if (s.isOnGround && !didJump) {
    if (s.isSliding) {
      applyFriction(s, C.SLIDE_FRICTION, C.SLIDE_STOP_SPEED, dt);
      if (wish.amount > 0) accelerate(s, wish, Math.min(Math.hypot(s.vel.x, s.vel.z), C.RUN_SPEED), C.SLIDE_STEER_ACCEL, dt);
      s.vel.y -= C.GRAVITY * dt;
      s.vel = clipVelocity(s.vel, s.groundNormal);
    } else {
      applyFriction(s, C.GROUND_FRICTION, C.STOP_SPEED, dt);
      if (wish.amount > 0) accelerate(s, wish, (s.isCrouched ? C.CROUCH_SPEED : C.RUN_SPEED) * wish.amount, C.GROUND_ACCEL, dt);
      s.vel.y = 0;
      s.vel = clipVelocity(s.vel, s.groundNormal);
    }
  } else {
    if (wish.amount > 0) {
      airAccelerate(s, wish, C.RUN_SPEED * wish.amount, dt);
      if (input.side === 0 && input.fwd !== 0) airControl(s, wish, dt);
    }
    const speed = Math.hypot(s.vel.x, s.vel.z);
    if (speed > C.AIR_DRAG_START) {
      const scale = Math.max(C.AIR_DRAG_START, speed - (speed - C.AIR_DRAG_START) * C.AIR_DRAG * dt) / speed;
      s.vel.x *= scale;
      s.vel.z *= scale;
    }
    s.vel.y -= C.GRAVITY * dt * 0.5;
  }

  stepSlideMove(world, s, dt);
  if (!s.isOnGround) s.vel.y -= C.GRAVITY * dt * 0.5;
  categorize(world, s, events, wasOnGround && !didJump);
  if (!s.isOnGround) probeWalls(world, s, wish);
  touchPads(s, pads, events);
}
