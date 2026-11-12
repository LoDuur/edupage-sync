import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { canvasTexture } from "./textures.js";
import { createPartBuilder } from "./bake.js";

const MAX_SPARKS = 600;
const MAX_DECALS = 220;
const MAX_TRACERS = 48;
const MAX_PUFFS = 40;
const SPARK_GRAVITY = 14;

function holeTexture() {
  return canvasTexture(128, 128, (ctx, w) => {
    const c = w / 2;
    const g = ctx.createRadialGradient(c, c, 2, c, c, c);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.22, "rgba(15,12,10,0.95)");
    g.addColorStop(0.35, "rgba(40,34,28,0.6)");
    g.addColorStop(1, "rgba(40,34,28,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = "rgba(10,8,6,0.6)";
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 10, c + Math.sin(a) * 10);
      ctx.lineTo(c + Math.cos(a) * (20 + Math.random() * 30), c + Math.sin(a) * (20 + Math.random() * 30));
      ctx.stroke();
    }
  });
}

function softTexture() {
  return canvasTexture(128, 128, (ctx, w) => {
    const c = w / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.5, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

export function createEffects(scene) {
  const soft = softTexture();
  const sparkGeometry = new THREE.BufferGeometry();
  const sparkPositions = new Float32Array(MAX_SPARKS * 3);
  const sparkColors = new Float32Array(MAX_SPARKS * 3);
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute("color", new THREE.BufferAttribute(sparkColors, 3).setUsage(THREE.DynamicDrawUsage));
  const sparkPoints = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ size: 0.07, map: soft, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  const sparks = Array.from({ length: MAX_SPARKS }, () => ({ life: 0, max: 1, vel: new THREE.Vector3(), color: new THREE.Color() }));
  let sparkCursor = 0;

  const decalGeometry = new THREE.PlaneGeometry(1, 1);
  const decalMaterial = new THREE.MeshStandardMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1 });
  const decals = new THREE.InstancedMesh(decalGeometry, decalMaterial, MAX_DECALS);
  decals.count = 0;
  decals.frustumCulled = false;
  scene.add(decals);
  let decalCursor = 0;
  const tmpMatrix = new THREE.Matrix4(), tmpQuat = new THREE.Quaternion(), tmpScale = new THREE.Vector3(), tmpPos = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);

  const tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffe2a6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracerGeometry = new THREE.BoxGeometry(0.012, 0.012, 1).translate(0, 0, -0.5);
  const tracers = Array.from({ length: MAX_TRACERS }, () => {
    const mesh = new THREE.Mesh(tracerGeometry, tracerMaterial.clone());
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, life: 0, from: new THREE.Vector3(), to: new THREE.Vector3() };
  });
  let tracerCursor = 0;

  const puffs = Array.from({ length: MAX_PUFFS }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: 0xb9b2a6, transparent: true, depthWrite: false, opacity: 0 }));
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, life: 0, max: 1, grow: 1, vel: new THREE.Vector3() };
  });
  let puffCursor = 0;

  const flashLight = new THREE.PointLight(0xffb070, 0, 9, 2);
  scene.add(flashLight);
  let flashLife = 0, flashDuration = 0.05, flashPeak = 0;
  const bursts = Array.from({ length: 14 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, life: 0, max: 1, size: 1 };
  });
  let burstCursor = 0;
  const rocketMeshes = new Map();
  const rocketBody = new THREE.MeshStandardMaterial({ color: 0x4a5240, roughness: 0.5, metalness: 0.4 });
  const rocketHead = new THREE.MeshStandardMaterial({ color: 0xc23a1c, roughness: 0.4, metalness: 0.2 });
  const rocketFin = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.5, metalness: 0.6 });
  const exhaustMaterial = new THREE.SpriteMaterial({ map: soft, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

  function makeRocket() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 14), rocketBody);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 14), rocketHead);
    head.position.y = 0.33;
    g.add(body, head);
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, 0.11), rocketFin);
      fin.position.y = -0.2;
      fin.rotation.y = (k * Math.PI) / 2;
      fin.translateZ(0.06);
      g.add(fin);
    }
    const flame = new THREE.Sprite(exhaustMaterial);
    flame.scale.set(0.5, 0.5, 1);
    flame.position.y = -0.38;
    g.add(flame);
    const holder = new THREE.Group();
    g.rotation.x = Math.PI / 2;
    holder.add(g);
    scene.add(holder);
    return { holder, smokeAt: 0 };
  }

  function updateRockets(game, alpha, dt, time) {
    const seen = new Set();
    for (const r of game.projectiles) {
      seen.add(r.id);
      let v = rocketMeshes.get(r.id);
      if (!v) { v = makeRocket(); rocketMeshes.set(r.id, v); }
      const x = r.prev.x + (r.pos.x - r.prev.x) * alpha, y = r.prev.y + (r.pos.y - r.prev.y) * alpha, z = r.prev.z + (r.pos.z - r.prev.z) * alpha;
      v.holder.position.set(x, y, z);
      v.holder.lookAt(x + r.vel.x, y + r.vel.y, z + r.vel.z);
      if (time >= v.smokeAt) {
        v.smokeAt = time + 0.025;
        addPuff({ x: x - r.vel.x * 0.012, y: y - r.vel.y * 0.012, z: z - r.vel.z * 0.012 }, null, 0xd4cfc6, 0.28);
        emitSparks({ x: x - r.vel.x * 0.015, y: y - r.vel.y * 0.015, z: z - r.vel.z * 0.015 }, null, 1, 0xffa040, 2, 0.3);
      }
    }
    for (const [id, v] of rocketMeshes) {
      if (seen.has(id)) continue;
      scene.remove(v.holder);
      rocketMeshes.delete(id);
    }
    void dt;
  }

  function explosion(pos, normal, radius) {
    const n = normal ? new THREE.Vector3(normal.x, normal.y, normal.z) : new THREE.Vector3(0, 1, 0);
    const center = new THREE.Vector3(pos.x, pos.y, pos.z).addScaledVector(n, 0.3);
    for (const [color, life, size] of [[0xff7a1f, 0.42, radius * 1.15], [0xffe2a0, 0.22, radius * 0.7], [0xff3d0a, 0.6, radius * 1.5]]) {
      const b = bursts[burstCursor];
      burstCursor = (burstCursor + 1) % bursts.length;
      b.life = b.max = life;
      b.size = size;
      b.sprite.material.color.set(color);
      b.sprite.position.copy(center);
      b.sprite.visible = true;
    }
    emitSparks(center, n, 70, 0xffb35a, 11, 0.9);
    emitSparks(center, n, 30, 0xfff0c0, 16, 0.5);
    for (let i = 0; i < 6; i++) addPuff({ x: center.x + (Math.random() - 0.5) * 1.2, y: center.y + Math.random() * 0.8, z: center.z + (Math.random() - 0.5) * 1.2 }, n, 0x4a4743, 1.5 + Math.random());
    if (normal) addDecal(pos, normal, 0.9 + Math.random() * 0.25);
    flashLight.position.copy(center);
    flashLight.intensity = 30;
    flashLight.distance = 16;
    flashLife = flashDuration = 0.25;
    flashPeak = 30;
  }

  function emitSparks(pos, normal, count, color, speed = 6, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const s = sparks[sparkCursor];
      sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
      s.life = s.max = life * (0.5 + Math.random() * 0.8);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      if (normal) dir.addScaledVector(normal, 1.2).normalize();
      s.vel.copy(dir).multiplyScalar(speed * (0.3 + Math.random()));
      s.color.set(color);
      const idx = (sparkCursor === 0 ? MAX_SPARKS - 1 : sparkCursor - 1) * 3;
      sparkPositions[idx] = pos.x; sparkPositions[idx + 1] = pos.y; sparkPositions[idx + 2] = pos.z;
    }
  }

  function addDecal(pos, normal, size = 0.09 + Math.random() * 0.05) {
    const n = new THREE.Vector3(normal.x, normal.y, normal.z);
    tmpQuat.setFromUnitVectors(zAxis, n);
    const spin = new THREE.Quaternion().setFromAxisAngle(n, Math.random() * Math.PI * 2);
    tmpQuat.premultiply(spin);
    tmpPos.set(pos.x + n.x * 0.004, pos.y + n.y * 0.004, pos.z + n.z * 0.004);
    tmpScale.setScalar(size);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    decals.setMatrixAt(decalCursor, tmpMatrix);
    decalCursor = (decalCursor + 1) % MAX_DECALS;
    decals.count = Math.min(MAX_DECALS, decals.count + 1);
    decals.instanceMatrix.needsUpdate = true;
  }

  function addPuff(pos, normal, color = 0xb9b2a6, size = 0.35) {
    const p = puffs[puffCursor];
    puffCursor = (puffCursor + 1) % MAX_PUFFS;
    p.life = p.max = 0.5 + Math.random() * 0.3;
    p.grow = size;
    p.sprite.material.color.set(color);
    p.sprite.position.set(pos.x, pos.y, pos.z);
    p.vel.set(normal?.x ?? 0, (normal?.y ?? 0) + 0.3, normal?.z ?? 0).multiplyScalar(0.8);
    p.sprite.visible = true;
  }

  function tracer(from, to, color = 0xffe2a6) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
    t.from.copy(from);
    t.to.copy(to);
    t.life = 0.07;
    t.mesh.material.color.set(color);
    t.mesh.visible = true;
  }

  function impact(trace) {
    const p = trace.point;
    if (trace.victim) {
      emitSparks(p, null, 10, 0x7ff0ff, 4, 0.35);
      return;
    }
    if (!trace.normal) return;
    const n = new THREE.Vector3(trace.normal.x, trace.normal.y, trace.normal.z);
    addDecal(p, trace.normal);
    const isMetal = trace.material === "metal";
    emitSparks(p, n, isMetal ? 9 : 4, isMetal ? 0xffd27a : 0xffb35a, isMetal ? 7 : 4, 0.4);
    const dustColor = trace.material === "parquet" || trace.material === "stage" || trace.material === "crate" ? 0x9c7a55 : 0xb9b2a6;
    if (Math.random() < 0.7) addPuff(p, n, dustColor, 0.3);
  }

  function muzzleLight(pos, intensity) {
    flashLight.position.copy(pos);
    flashLight.intensity = intensity;
    flashLight.distance = 9;
    flashLife = flashDuration = 0.05;
    flashPeak = intensity;
  }

  function deathBurst(pos, color) {
    const c = new THREE.Vector3(pos.x, pos.y + 1, pos.z);
    emitSparks(c, null, 60, color, 7, 0.8);
    addPuff(c, null, 0x6b7280, 1.2);
  }

  function update(dt) {
    for (let i = 0; i < MAX_SPARKS; i++) {
      const s = sparks[i];
      const idx = i * 3;
      if (s.life <= 0) {
        sparkColors[idx] = sparkColors[idx + 1] = sparkColors[idx + 2] = 0;
        continue;
      }
      s.life -= dt;
      s.vel.y -= SPARK_GRAVITY * dt;
      sparkPositions[idx] += s.vel.x * dt;
      sparkPositions[idx + 1] += s.vel.y * dt;
      sparkPositions[idx + 2] += s.vel.z * dt;
      const k = Math.max(0, s.life / s.max);
      sparkColors[idx] = s.color.r * k; sparkColors[idx + 1] = s.color.g * k; sparkColors[idx + 2] = s.color.b * k;
    }
    sparkGeometry.attributes.position.needsUpdate = true;
    sparkGeometry.attributes.color.needsUpdate = true;
    for (const t of tracers) {
      if (!t.mesh.visible) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      const len = t.from.distanceTo(t.to);
      const head = new THREE.Vector3().lerpVectors(t.from, t.to, Math.min(1, 1 - t.life / 0.07 + 0.35));
      t.mesh.position.copy(head);
      t.mesh.lookAt(t.from);
      t.mesh.rotateY(Math.PI);
      t.mesh.scale.set(1, 1, Math.min(len, 4));
      t.mesh.material.opacity = t.life / 0.07;
    }
    for (const p of puffs) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.sprite.scale.setScalar(p.grow * (0.4 + k * 1.6));
      p.sprite.material.opacity = (1 - k) * 0.45;
      p.sprite.position.addScaledVector(p.vel, dt);
    }
    for (const b of bursts) {
      if (!b.sprite.visible) continue;
      b.life -= dt;
      if (b.life <= 0) { b.sprite.visible = false; continue; }
      const k = 1 - b.life / b.max;
      b.sprite.scale.setScalar(b.size * (0.25 + 0.85 * Math.sqrt(k)));
      b.sprite.material.opacity = (1 - k) ** 1.5;
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashLight.intensity = flashLife <= 0 ? 0 : flashPeak * (flashLife / flashDuration);
    }
  }

  return { tracer, impact, update, muzzleLight, deathBurst, emitSparks, updateRockets, explosion };
}

function frameModel(model, length) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  model.position.sub(center);
  const wrapper = new THREE.Group();
  wrapper.add(model);
  wrapper.rotation.y = Math.PI / 2;
  wrapper.scale.setScalar(length / Math.max(size.x, size.y, size.z));
  const outer = new THREE.Group();
  outer.add(wrapper);
  return outer;
}

const BODY = 0xf2f1ec, GREEN = 0x2f9e64, DARK = 0x24272b;

function buildKit(isMega) {
  const size = isMega ? 0.5 : 0.36;
  const part = createPartBuilder()
    .add(new RoundedBoxGeometry(size, size * 0.7, size * 0.55, 3, 0.04), { color: BODY })
    .add(new THREE.TorusGeometry(size * 0.18, 0.018, 6, 16, Math.PI), { pos: [0, size * 0.35, 0], color: DARK });
  for (const z of [-1, 1]) {
    part.add(new THREE.BoxGeometry(size * 0.18, size * 0.5, 0.012), { pos: [0, 0, z * size * 0.28], color: isMega ? 0x3fae7a : GREEN });
    part.add(new THREE.BoxGeometry(size * 0.5, size * 0.18, 0.012), { pos: [0, 0, z * size * 0.28], color: isMega ? 0x3fae7a : GREEN });
  }
  return part.build();
}

function buildVest(isHeavy) {
  const plate = isHeavy ? 0x3f6fb8 : 0x4f8fd8;
  const part = createPartBuilder().add(new RoundedBoxGeometry(0.46, 0.5, 0.17, 4, 0.05), { color: plate });
  for (const x of [-0.19, 0.19]) part.add(new RoundedBoxGeometry(0.1, 0.18, 0.2, 3, 0.02), { pos: [x, 0.2, 0], color: DARK });
  part.add(new RoundedBoxGeometry(0.26, 0.24, 0.05, 3, 0.02), { pos: [0, 0.02, 0.1], color: 0xe9eef2 });
  part.add(new RoundedBoxGeometry(0.26, 0.24, 0.05, 3, 0.02), { pos: [0, 0.02, -0.1], color: 0xc9d4de });
  return part.build();
}

function buildAmmoCrate() {
  const part = createPartBuilder()
    .add(new RoundedBoxGeometry(0.46, 0.26, 0.3, 3, 0.03), { color: 0x4d5a3a })
    .add(new THREE.BoxGeometry(0.47, 0.04, 0.31), { pos: [0, 0.02, 0], color: 0x3fae7a });
  for (let k = 0; k < 5; k++) {
    part.add(new THREE.CylinderGeometry(0.025, 0.025, 0.11, 10), { pos: [-0.16 + k * 0.08, 0.17, 0], color: 0xc9a14a });
    part.add(new THREE.ConeGeometry(0.025, 0.05, 10), { pos: [-0.16 + k * 0.08, 0.255, 0], color: 0x6d4b2a });
  }
  return part.build();
}

export function createPickupVisuals(scene, pickups, weaponFactory) {
  const kitMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
  const megaMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.25, emissive: 0x3fae7a, emissiveIntensity: 0.3 });
  const glowGeometry = new THREE.SphereGeometry(0.55, 20, 12);
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x3fae7a, transparent: true, opacity: 0.12, depthWrite: false });
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.8, roughness: 0.35 });
  const baseInstances = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.48, 0.06, 32), baseMaterial, pickups.length);
  const ringInstances = new THREE.InstancedMesh(new THREE.TorusGeometry(0.4, 0.018, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), pickups.length);
  const matrix = new THREE.Matrix4(), tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), unit = new THREE.Vector3(1, 1, 1);
  const lit = new THREE.Color(0x3fae7a), dim = new THREE.Color(0x14301f);
  const geometries = { kit: buildKit(false), mega: buildKit(true), armor: buildVest(false), heavy: buildVest(true), ammo: buildAmmoCrate() };
  const items = pickups.map((item, i) => {
    matrix.compose(new THREE.Vector3(item.pos.x, item.pos.y + 0.03, item.pos.z), new THREE.Quaternion(), unit);
    baseInstances.setMatrixAt(i, matrix);
    matrix.compose(new THREE.Vector3(item.pos.x, item.pos.y + 0.07, item.pos.z), tilt, unit);
    ringInstances.setMatrixAt(i, matrix);
    ringInstances.setColorAt(i, lit);
    const spinner = new THREE.Group();
    spinner.position.set(item.pos.x, item.pos.y + 0.75, item.pos.z);
    if (item.kind === "weapon") {
      const model = weaponFactory?.(item.weapon);
      if (model) spinner.add(frameModel(model, 1.25));
    } else {
      const key = item.kind === "health" ? "kit" : item.kind === "mega" ? "mega" : item.kind === "armor" ? (item.amount >= 100 ? "heavy" : "armor") : "ammo";
      const mesh = new THREE.Mesh(geometries[key], key === "mega" ? megaMaterial : kitMaterial);
      mesh.castShadow = false;
      spinner.add(mesh);
      if (key === "mega") spinner.add(new THREE.Mesh(glowGeometry, glowMaterial));
      if (key === "heavy") spinner.scale.setScalar(1.25);
    }
    scene.add(spinner);
    return { item, spinner, baseY: item.pos.y + 0.75, isAvailable: true };
  });
  baseInstances.instanceMatrix.needsUpdate = true;
  baseInstances.computeBoundingSphere();
  ringInstances.instanceMatrix.needsUpdate = true;
  ringInstances.computeBoundingSphere();
  baseInstances.receiveShadow = true;
  scene.add(baseInstances, ringInstances);

  function update(game, time) {
    let isRingDirty = false;
    items.forEach((v, i) => {
      const isAvailable = game.time >= game.pickups[v.item.index].availableAt;
      if (isAvailable !== v.isAvailable) {
        v.isAvailable = isAvailable;
        ringInstances.setColorAt(i, isAvailable ? lit : dim);
        isRingDirty = true;
      }
      v.spinner.visible = isAvailable;
      if (!isAvailable) return;
      v.spinner.rotation.y = time * 1.6;
      v.spinner.position.y = v.baseY + Math.sin(time * 2.2 + v.item.index) * 0.06;
    });
    if (isRingDirty) ringInstances.instanceColor.needsUpdate = true;
  }

  return { update };
}
