import * as THREE from "three";

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

function makeMesh(geometry, material, parent, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function limb(parent, geo, mats, side) {
  const shoulder = new THREE.Group();
  shoulder.position.set(0.24 * side, 0.44, 0);
  parent.add(shoulder);
  makeMesh(geo.shoulder, mats.armor, shoulder);
  makeMesh(geo.upperArm, mats.suit, shoulder);
  const elbow = new THREE.Group();
  elbow.position.y = -0.28;
  shoulder.add(elbow);
  makeMesh(geo.foreArm, mats.suit, elbow);
  const wrist = new THREE.Group();
  wrist.position.y = -0.26;
  elbow.add(wrist);
  makeMesh(geo.hand, mats.glove, wrist);
  return { shoulder, elbow, wrist };
}

function leg(parent, geo, mats, side) {
  const hip = new THREE.Group();
  hip.position.set(0.1 * side, -0.04, 0);
  parent.add(hip);
  makeMesh(geo.thigh, mats.suit, hip);
  const knee = new THREE.Group();
  knee.position.y = -0.39;
  hip.add(knee);
  makeMesh(geo.knee, mats.armor, knee);
  makeMesh(geo.shin, mats.suit, knee);
  const ankle = new THREE.Group();
  ankle.position.y = -0.42;
  knee.add(ankle);
  makeMesh(geo.boot, mats.boot, ankle);
  return { hip, knee, ankle };
}

function buildRig(color, weaponFactory) {
  const geo = sharedGeometry();
  const mats = {
    suit: new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.7, metalness: 0.2 }),
    armor: new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6, metalness: 0.3 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x0a0c0f, emissive: color, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.9 }),
    bag: new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.55), roughness: 0.85 }),
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);
  makeMesh(geo.pelvis, mats.suit, hips);
  const spine = new THREE.Group();
  spine.position.y = 0.08;
  hips.add(spine);
  makeMesh(geo.torso, mats.suit, spine);
  const plate = makeMesh(geo.chestPlate, mats.armor, spine, [0, 0.3, 0]);
  plate.rotation.y = Math.PI;
  plate.scale.set(1.05, 1, 0.9);
  const bag = makeMesh(geo.backpack, mats.bag, spine, [0, 0.3, 0.2]);
  const flap = makeMesh(geo.backpackFlap, mats.bag, bag, [0, 0.2, 0]);
  flap.rotation.z = Math.PI / 2;
  flap.rotation.y = Math.PI / 2;
  for (const side of [-1, 1]) {
    const strap = makeMesh(geo.strap, mats.glove, spine, [0.11 * side, 0.36, 0.02]);
    strap.rotation.y = Math.PI / 2;
  }
  const neck = new THREE.Group();
  neck.position.y = 0.55;
  spine.add(neck);
  makeMesh(geo.neck, mats.suit, neck, [0, 0.04, 0]);
  const head = new THREE.Group();
  head.position.y = 0.16;
  neck.add(head);
  makeMesh(geo.helmet, mats.armor, head);
  const visor = makeMesh(geo.visor, mats.visor, head);
  visor.rotation.y = Math.PI;
  makeMesh(geo.antenna, mats.glove, head, [0.1, 0.16, 0.04]);
  const armL = limb(spine, geo, mats, -1), armR = limb(spine, geo, mats, 1);
  const legL = leg(hips, geo, mats, -1), legR = leg(hips, geo, mats, 1);
  const gunMount = new THREE.Group();
  gunMount.position.set(0, -0.08, -0.02);
  armR.wrist.add(gunMount);
  const weapons = {};
  if (weaponFactory) {
    for (const id of ["pistol", "aa12"]) {
      const model = weaponFactory(id);
      if (!model) continue;
      model.rotation.x = -Math.PI / 2;
      model.visible = false;
      gunMount.add(model);
      weapons[id] = model;
    }
  }
  return { root, body, hips, spine, neck, head, armL, armR, legL, legR, mats, weapons, visor };
}

export function createPlayerModels(scene, weaponFactory) {
  const models = new Map();

  function ensure(player, index) {
    let m = models.get(player.id);
    if (m) return m;
    const rig = buildRig(colorFor(player, index), weaponFactory);
    rig.state = { phase: 0, deathT: 0, wasAlive: true, kick: 0, lean: 0, crouch: 0, slide: 0, air: 0, prevPos: null, renderPos: new THREE.Vector3(), yaw: 0 };
    scene.add(rig.root);
    models.set(player.id, rig);
    return rig;
  }

  function sync(game, localId, alpha, dt, prevPositions) {
    const alive = new Set();
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
      for (const [id, model] of Object.entries(rig.weapons)) model.visible = p.isAlive && p.arsenal.current === id;
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
    rig.mats.armor.emissive.setRGB(1, 1, 1);
    rig.mats.armor.emissiveIntensity = 1.2;
  }

  return { sync, notifyShot, hitFlash, models };
}

const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

function animate(rig, p, dt) {
  const s = rig.state, m = p.move;
  const speed = Math.hypot(m.vel.x, m.vel.z);
  s.yaw = m.yaw;
  rig.root.rotation.y = m.yaw;
  if (rig.mats.armor.emissiveIntensity > 0) rig.mats.armor.emissiveIntensity = Math.max(0, rig.mats.armor.emissiveIntensity - dt * 6);
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
    legRig.ankle.rotation.x = -knee * 0.3 + Math.max(0, thigh) * 0.2;
    legRig.hip.rotation.z = Math.max(-0.4, Math.min(0.4, localSide * 0.02)) * runAmount;
  };
  legSwing(-1, 0);
  legSwing(1, Math.PI);
}
