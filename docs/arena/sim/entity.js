import * as C from "./constants.js";
import { traceRay } from "./collision.js";
import { eyeHeight, playerHeight } from "./movement.js";

export function viewDirection(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export function eyePosition(player) {
  const m = player.move;
  return { x: m.pos.x, y: m.pos.y + eyeHeight(m), z: m.pos.z };
}

export function chestPosition(player) {
  const m = player.move;
  return { x: m.pos.x, y: m.pos.y + playerHeight(m) * 0.62, z: m.pos.z };
}

export function hitboxes(player, pos = player.move.pos, isCrouched = player.move.isCrouched) {
  const h = isCrouched ? C.CROUCH_HEIGHT : C.STAND_HEIGHT;
  const r = C.PLAYER_RADIUS;
  const headBottom = pos.y + h - C.HEAD_SIZE;
  const headR = C.HEAD_SIZE / 2 + 0.02;
  return {
    body: { min: { x: pos.x - r, y: pos.y, z: pos.z - r }, max: { x: pos.x + r, y: headBottom, z: pos.z + r } },
    head: { min: { x: pos.x - headR, y: headBottom, z: pos.z - headR }, max: { x: pos.x + headR, y: pos.y + h, z: pos.z + headR } },
  };
}

export function hasLineOfSight(world, from, to) {
  return traceRay(world, from, to).fraction >= 0.999;
}

export function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export function pitchTo(from, to) {
  return Math.atan2(to.y - from.y, Math.hypot(to.x - from.x, to.z - from.z));
}

export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
