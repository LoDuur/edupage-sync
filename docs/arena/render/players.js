import * as THREE from "three";
import { WEAPON_ORDER } from "../sim/weapons.js";
import { createPartBuilder } from "./bake.js";

const TEAM_COLORS = [0x3fae7a, 0xe08a3a];
const FFA_HUES = [0.42, 0.08, 0.58, 0.95, 0.15, 0.72, 0.5, 0.0, 0.33, 0.85, 0.25, 0.65];

let shared = null;

function lathe(points, segments = 20) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

function sharedGeometry() {
  if (shared) return shared;
  shared = {
    pelvis: lathe([[0, -0.1], [0.15, -0.08], [0.19, 0], [0.17, 0.1], [0, 0.12]]),
    torso: lathe([[0, 0], [0.16, 0.02], [0.2, 0.15], [0.24, 0.32], [0.25, 0.42], [0.2, 0.5], [0.1, 0.54], [0, 0.55]]),
    chestPlate: new THREE.SphereGeometry(0.22, 20, 12, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.18, Math.PI * 0.42),
    backpack: new THREE.BoxGeometry(0.34, 0.4, 0.16, 2, 2, 2),
    backpackFlap: new THREE.CylinderGeometry(0.17, 0.17, 0.34, 16, 1, false, 0, Math.PI),
    strap: new THREE.TorusGeometry(0.16, 0.015, 6, 20, Math.PI),
    neck: new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12),
    helmet: new THREE.SphereGeometry(0.15, 24, 18),
    visor: new THREE.SphereGeometry(0.152, 24, 12, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.22),
    antenna: new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6),
    shoulder: new THREE.SphereGeometry(0.085, 16, 12),
    upperArm: new THREE.CapsuleGeometry(0.055, 0.22, 4, 12),
    foreArm: new THREE.CapsuleGeometry(0.05, 0.2, 4, 12),
    hand: new THREE.BoxGeometry(0.08, 0.1, 0.07, 1, 1, 1),
    thigh: new THREE.CapsuleGeometry(0.075, 0.3, 4, 12),
    knee: new THREE.SphereGeometry(0.075, 12, 10),
    shin: new THREE.CapsuleGeometry(0.065, 0.3, 4, 12),
    boot: new THREE.BoxGeometry(0.12, 0.09, 0.24, 1, 1, 1),
  };
  shared.pelvis.translate(0, 0, 0);
  shared.hand.translate(0, -0.05, 0);
  shared.upperArm.translate(0, -0.14, 0);
  shared.foreArm.translate(0, -0.13, 0);
  shared.thigh.translate(0, -0.19, 0);
  shared.shin.translate(0, -0.2, 0);
  shared.boot.translate(0, -0.03, -0.05);
  return shared;
}

function colorFor(player, index) {
  if (player.team >= 0) return new THREE.Color(TEAM_COLORS[player.team]);
  return new THREE.Color().setHSL(FFA_HUES[index % FFA_HUES.length], 0.62, 0.52);
}

const SUIT = 0x2b2f35, GLOVE = 0x15171a, BOOT = 0x1b1d20;

function bakeMesh(builder, material, parent, shadow) {
  const mesh = new THREE.Mesh(builder.build(), material);
  mesh.castShadow = shadow;
  parent.add(mesh);
  return mesh;
}

function buildRig(color, weaponFactory, castShadow) {
  const geo = sharedGeometry();
  const armor = color.getHex(), bag = color.clone().multiplyScalar(0.55).getHex();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3, emissive: 0x000000 });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: 0x0a0c0f, emissive: color, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.9 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);
  bakeMesh(createPartBuilder().add(geo.pelvis, { color: SUIT }), material, hips, castShadow);

  const spine = new THREE.Group();
  spine.position.y = 0.08;
  hips.add(spine);
  const torso = createPartBuilder()
    .add(geo.torso, { color: SUIT })
    .add(geo.chestPlate, { pos: [0, 0.3, 0], rot: [0, Math.PI, 0], scale: [1.05, 1, 0.9], color: armor })
    .add(geo.backpack, { pos: [0, 0.3, 0.2], color: bag })
    .add(geo.backpackFlap, { pos: [0, 0.5, 0.2], rot: [0, Math.PI / 2, Math.PI / 2], color: bag })
    .add(geo.neck, { pos: [0, 0.59, 0], color: SUIT });
  for (const side of [-1, 1]) torso.add(geo.strap, { pos: [0.11 * side, 0.36, 0.02], rot: [0, Math.PI / 2, 0], color: GLOVE });
  bakeMesh(torso, material, spine, castShadow);

  const head = new THREE.Group();
  head.position.y = 0.71;
  spine.add(head);
  bakeMesh(createPartBuilder().add(geo.helmet, { color: armor }).add(geo.antenna, { pos: [0.1, 0.16, 0.04], color: GLOVE }), material, head, castShadow);
  const visor = new THREE.Mesh(geo.visor, visorMaterial);
  visor.rotation.y = Math.PI;
  head.add(visor);

  const arms = [-1, 1].map(side => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.24 * side, 0.44, 0);
    spine.add(shoulder);
    bakeMesh(createPartBuilder().add(geo.shoulder, { color: armor }).add(geo.upperArm, { color: SUIT }), material, shoulder, castShadow);
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    shoulder.add(elbow);
    bakeMesh(createPartBuilder().add(geo.foreArm, { color: SUIT }).add(geo.hand, { pos: [0, -0.26, 0], color: GLOVE }), material, elbow, false);
    return { shoulder, elbow };
  });
  const legs = [-1, 1].map(side => {
    const hip = new THREE.Group();
    hip.position.set(0.1 * side, -0.04, 0);
    hips.add(hip);
    bakeMesh(createPartBuilder().add(geo.thigh, { color: SUIT }), material, hip, castShadow);
    const knee = new THREE.Group();
    knee.position.y = -0.39;
    hip.add(knee);
    bakeMesh(createPartBuilder().add(geo.knee, { color: armor }).add(geo.shin, { color: SUIT }).add(geo.boot, { pos: [0, -0.42, 0], color: BOOT }), material, knee, false);
    return { hip, knee };
  });
  const [armL, armR] = arms, [legL, legR] = legs;
  const gunMount = new THREE.Group();
  gunMount.position.set(0, -0.34, -0.02);
  armR.elbow.add(gunMount);
  const weapons = {};
  const weaponList = [];
  for (const id of WEAPON_ORDER) {
    const model = weaponFactory?.(id);
    if (!model) continue;
    model.rotation.x = -Math.PI / 2;
    model.visible = false;
    model.castShadow = false;
    gunMount.add(model);
    weapons[id] = model;
    weaponList.push([id, model]);
  }
  return { root, body, hips, spine, head, armL, armR, legL, legR, mats: { body: material, visor: visorMaterial }, weapons, weaponList, visor };
}

export function createPlayerModels(scene, weaponFactory, castShadow = false) {
  const models = new Map();

  function ensure(player, index) {
    let m = models.get(player.id);
    if (m) return m;
    const rig = buildRig(colorFor(player, index), weaponFactory, castShadow);
    rig.state = { phase: 0, deathT: 0, wasAlive: true, kick: 0, lean: 0, crouch: 0, slide: 0, air: 0, prevPos: null, renderPos: new THREE.Vector3(), yaw: 0 };
    scene.add(rig.root);
    models.set(player.id, rig);
    return rig;
  }

  const alive = new Set();

  function sync(game, localId, alpha, dt, prevPositions) {
    alive.clear();
    game.players.forEach((p, index) => {
      alive.add(p.id);
      const rig = ensure(p, index);
      const s = rig.state;
      const isLocal = p.id === localId;
      rig.root.visible = !isLocal && (p.isAlive || s.deathT < 3);
      if (!rig.root.visible) return;
      const prev = prevPositions.get(p.id) || p.move.pos;
      const cur = p.move.pos;
      s.renderPos.set(prev.x + (cur.x - prev.x) * alpha, prev.y + (cur.y - prev.y) * alpha, prev.z + (cur.z - prev.z) * alpha);
      rig.root.position.copy(s.renderPos);
      if (p.isAlive && !s.wasAlive) s.deathT = 0;
      s.wasAlive = p.isAlive;
      animate(rig, p, dt);
      for (const entry of rig.weaponList) entry[1].visible = p.isAlive && p.arsenal.current === entry[0];
    });
    for (const [id, rig] of models) {
      if (alive.has(id)) continue;
      scene.remove(rig.root);
      models.delete(id);
    }
  }

  function notifyShot(id) {
    const rig = models.get(id);
    if (rig) rig.state.kick = 1;
  }

  function hitFlash(id) {
    const rig = models.get(id);
    if (!rig) return;
    rig.mats.body.emissive.setRGB(0.55, 0.55, 0.55);
    rig.mats.body.emissiveIntensity = 1;
  }

  return { sync, notifyShot, hitFlash, models };
}

const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

function animate(rig, p, dt) {
  const s = rig.state, m = p.move;
  const speed = Math.hypot(m.vel.x, m.vel.z);
  s.yaw = m.yaw;
  rig.root.rotation.y = m.yaw;
  if (rig.mats.body.emissiveIntensity > 0) rig.mats.body.emissiveIntensity = Math.max(0, rig.mats.body.emissiveIntensity - dt * 6);
  if (!p.isAlive) {
    s.deathT += dt;
    const t = Math.min(1, s.deathT / 0.55);
    const ease = 1 - (1 - t) ** 3;
    rig.body.rotation.x = -ease * Math.PI / 2;
    rig.body.position.y = -ease * 0.05;
    rig.body.position.z = ease * 0.4;
    rig.visor.material.emissiveIntensity = Math.max(0, 1.6 - s.deathT * 2);
    rig.armL.shoulder.rotation.x = damp(rig.armL.shoulder.rotation.x, -2.4, 6, dt);
    rig.armR.shoulder.rotation.x = damp(rig.armR.shoulder.rotation.x, -2.6, 6, dt);
    return;
  }
  rig.body.rotation.x = 0;
  rig.body.position.set(0, 0, 0);
  rig.visor.material.emissiveIntensity = 1.6;
  const sin = Math.sin(m.yaw), cos = Math.cos(m.yaw);
  const localFwd = -sin * m.vel.x - cos * m.vel.z;
  const localSide = cos * m.vel.x - sin * m.vel.z;
  s.crouch = damp(s.crouch, m.isCrouched && !m.isSliding ? 1 : 0, 14, dt);
  s.slide = damp(s.slide, m.isSliding ? 1 : 0, 12, dt);
  s.air = damp(s.air, m.isOnGround ? 0 : 1, 10, dt);
  s.kick = Math.max(0, s.kick - dt * 8);
  const runAmount = m.isOnGround && !m.isSliding ? Math.min(1, speed / 8) : 0;
  s.phase += dt * (4 + speed * 1.05) * (runAmount > 0.05 ? 1 : 0);
  const dirSign = localFwd < -0.5 ? -1 : 1;
  s.lean = damp(s.lean, Math.max(-0.35, Math.min(0.35, -localSide * 0.03)), 8, dt);

  rig.hips.position.y = 0.95 - s.crouch * 0.35 - s.slide * 0.5 - Math.abs(Math.cos(s.phase)) * 0.04 * runAmount;
  rig.hips.rotation.z = s.lean;
  rig.spine.rotation.x = -0.12 * runAmount * dirSign + s.slide * 0.55 + s.crouch * 0.25 - s.kick * 0.08;
  rig.head.rotation.x = -(p.lastInput?.pitch ?? 0) * 0.6 - rig.spine.rotation.x * 0.6;

  const aimPitch = p.lastInput?.pitch ?? 0;
  rig.armR.shoulder.rotation.set(-1.45 - aimPitch * 0.8 + s.kick * 0.25, 0, -0.1);
  rig.armR.elbow.rotation.set(-0.35, 0, 0);
  rig.armL.shoulder.rotation.set(-1.3 - aimPitch * 0.8 + s.kick * 0.2, 0, 0.55);
  rig.armL.elbow.rotation.set(-0.9, 0, 0);

  const legSwing = (side, offset) => {
    const legRig = side < 0 ? rig.legL : rig.legR;
    const ph = Math.sin(s.phase + offset);
    let thigh = ph * 0.75 * runAmount * dirSign;
    let knee = Math.max(0, -Math.cos(s.phase + offset)) * 1.1 * runAmount;
    thigh += s.air * (side < 0 ? -0.7 : -0.3);
    knee += s.air * (side < 0 ? 1.1 : 0.5);
    thigh -= s.crouch * 1.2;
    knee += s.crouch * 1.9;
    if (side < 0) { thigh -= s.slide * 1.3; knee += s.slide * 0.1; }
    else { thigh -= s.slide * 0.3; knee += s.slide * 1.6; }
    legRig.hip.rotation.x = thigh;
    legRig.knee.rotation.x = knee;
    legRig.hip.rotation.z = Math.max(-0.4, Math.min(0.4, localSide * 0.02)) * runAmount;
  };
  legSwing(-1, 0);
  legSwing(1, Math.PI);
}
