import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { canvasTexture } from "./textures.js";

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

function crossTexture(color) {
  return canvasTexture(256, 256, (ctx, w) => {
    ctx.fillStyle = "#f2f1ec";
    ctx.fillRect(0, 0, w, w);
    ctx.fillStyle = color;
    ctx.fillRect(w * 0.38, w * 0.16, w * 0.24, w * 0.68);
    ctx.fillRect(w * 0.16, w * 0.38, w * 0.68, w * 0.24);
    ctx.strokeStyle = "#c9c6bd";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, w - 10);
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
  let flashLife = 0;

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

  function addDecal(pos, normal) {
    const n = new THREE.Vector3(normal.x, normal.y, normal.z);
    tmpQuat.setFromUnitVectors(zAxis, n);
    const spin = new THREE.Quaternion().setFromAxisAngle(n, Math.random() * Math.PI * 2);
    tmpQuat.premultiply(spin);
    tmpPos.set(pos.x + n.x * 0.004, pos.y + n.y * 0.004, pos.z + n.z * 0.004);
    tmpScale.setScalar(0.09 + Math.random() * 0.05);
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
    flashLife = 0.05;
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
    if (flashLife > 0) {
      flashLife -= dt;
      if (flashLife <= 0) flashLight.intensity = 0;
    }
  }

  return { tracer, impact, update, muzzleLight, deathBurst, emitSparks };
}

export function createPickupVisuals(scene, pickups, weaponFactory) {
  const healthTex = crossTexture("#2f9e64"), megaTex = crossTexture("#3fae7a");
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x3fae7a, emissive: 0x3fae7a, emissiveIntensity: 1.8, transparent: true, opacity: 0.85 });
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.8, roughness: 0.35 });
  const items = pickups.map(item => {
    const group = new THREE.Group();
    group.position.set(item.pos.x, item.pos.y, item.pos.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.06, 32), baseMaterial);
    base.position.y = 0.03;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.018, 8, 40), ringMaterial.clone());
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.07;
    group.add(base, ring);
    const spinner = new THREE.Group();
    spinner.position.y = 0.75;
    group.add(spinner);
    if (item.kind === "weapon") {
      const model = weaponFactory?.(item.weapon);
      if (model) {
        model.scale.setScalar(1.15);
        model.position.z = 0.25;
        spinner.add(model);
      }
    } else {
      const isMega = item.kind === "mega";
      const size = isMega ? 0.5 : 0.36;
      const kit = new THREE.Mesh(new RoundedBoxGeometry(size, size * 0.7, size * 0.55, 3, 0.04), new THREE.MeshStandardMaterial({ map: isMega ? megaTex : healthTex, roughness: 0.4, emissive: isMega ? 0x3fae7a : 0x000000, emissiveIntensity: isMega ? 0.35 : 0 }));
      kit.castShadow = true;
      spinner.add(kit);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(size * 0.18, 0.018, 6, 16, Math.PI), baseMaterial);
      handle.position.y = size * 0.35;
      spinner.add(handle);
      if (isMega) {
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshBasicMaterial({ color: 0x3fae7a, transparent: true, opacity: 0.12, depthWrite: false }));
        spinner.add(glow);
      }
    }
    scene.add(group);
    return { item, group, spinner, ring };
  });

  function update(game, time) {
    for (const v of items) {
      const isAvailable = game.time >= game.pickups[v.item.index].availableAt;
      v.spinner.visible = isAvailable;
      v.spinner.rotation.y = time * 1.6;
      v.spinner.position.y = 0.75 + Math.sin(time * 2.2 + v.item.index) * 0.06;
      v.ring.material.emissiveIntensity = isAvailable ? 1.8 : 0.3;
    }
  }

  return { update };
}
