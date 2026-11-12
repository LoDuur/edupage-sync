import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { WEAPONS } from "../sim/weapons.js";
import { canvasTexture } from "./textures.js";

const MODEL_URLS = Object.fromEntries(["pistol", "smg", "ar", "aa12", "sniper", "rocket"].map(id => [id, `assets/weapons/${id}.glb?v=4`]));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CONFIG = {
  pistol: { moving: "Slide", mag: "Mag", magDir: [0, -1, 0.15], hold: V(0.15, -0.15, -0.36), kickBack: 0.035, kickPitch: 0.2, kickYaw: 0.015, boltTravel: 0.03, flashScale: 0.22, light: 1.4, sideFlash: false, shell: { r: 0.0048, len: 0.019, brass: true }, reload: { tilt: -0.35, drop: 0.3, empty: "slide" }, handL: [-0.25, -0.2] },
  smg: { moving: "Bolt", mag: "Mag", magDir: [0, -1, 0.05], hold: V(0.15, -0.19, -0.4), kickBack: 0.02, kickPitch: 0.1, kickYaw: 0.03, boltTravel: 0.035, flashScale: 0.2, light: 1.2, sideFlash: false, shell: { r: 0.0048, len: 0.019, brass: true }, reload: { tilt: -0.3, drop: 0.28, empty: "bolt" }, handL: [0.15, 1.2] },
  ar: { moving: "Bolt", mag: "Mag", magDir: [0, -1, 0.25], hold: V(0.15, -0.2, -0.42), kickBack: 0.03, kickPitch: 0.12, kickYaw: 0.02, boltTravel: 0.045, flashScale: 0.34, light: 2, sideFlash: false, shell: { r: 0.0057, len: 0.045, brass: true }, reload: { tilt: -0.35, drop: 0.32, empty: "bolt+hand" }, handL: [0.2, 1.3] },
  aa12: { moving: "Bolt", mag: "Drum", magDir: [0, -1, 0.15], hold: V(0.15, -0.235, -0.43), kickBack: 0.075, kickPitch: 0.16, kickYaw: 0.02, boltTravel: 0.07, flashScale: 0.5, light: 3, sideFlash: true, shell: { r: 0.0095, len: 0.065, brass: false }, reload: { tilt: 0.5, drop: 0.42, empty: "bolt+hand" }, handL: [0.2, 1.35] },
  sniper: { moving: "Bolt", mag: "Mag", magDir: [0, -1, 0.1], hold: V(0.14, -0.22, -0.44), kickBack: 0.13, kickPitch: 0.36, kickYaw: 0.015, boltTravel: 0.1, flashScale: 0.6, light: 3.5, sideFlash: true, shell: { r: 0.0065, len: 0.07, brass: true }, reload: { tilt: 0.25, drop: 0.2, empty: "bolt+hand", alwaysBolt: true }, handL: [0.2, 1.3] },
  rocket: { moving: null, mag: "Rocket", magDir: [0, 0, 1], hold: V(0.3, -0.27, -0.66), kickBack: 0.11, kickPitch: 0.26, kickYaw: 0.015, boltTravel: 0, flashScale: 0.9, light: 5, sideFlash: true, shell: null, reload: { tilt: 0.3, drop: 0.62, empty: "none" }, handL: [0.3, 1.3] },
};
const HOLD = CONFIG;
const SHELL_LIFETIME = 0.9;

const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const window01 = (t, a, b) => ease((t - a) / (b - a));

class Spring {
  constructor(stiffness, damping) {
    this.k = stiffness;
    this.c = damping;
    this.value = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
  }

  impulse(x, y, z) {
    this.velocity.x += x; this.velocity.y += y; this.velocity.z += z;
  }

  step(dt) {
    const ax = -this.k * this.value.x - this.c * this.velocity.x;
    const ay = -this.k * this.value.y - this.c * this.velocity.y;
    const az = -this.k * this.value.z - this.c * this.velocity.z;
    this.velocity.x += ax * dt; this.velocity.y += ay * dt; this.velocity.z += az * dt;
    this.value.x += this.velocity.x * dt; this.value.y += this.velocity.y * dt; this.value.z += this.velocity.z * dt;
  }
}

function flashTexture() {
  return canvasTexture(256, 256, (ctx, w) => {
    const c = w / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, "rgba(255,255,240,1)");
    g.addColorStop(0.15, "rgba(255,220,140,0.95)");
    g.addColorStop(0.45, "rgba(255,140,40,0.45)");
    g.addColorStop(1, "rgba(255,80,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
      const len = c * (0.6 + Math.random() * 0.4);
      const grad = ctx.createLinearGradient(c, c, c + Math.cos(a) * len, c + Math.sin(a) * len);
      grad.addColorStop(0, "rgba(255,240,200,0.9)");
      grad.addColorStop(1, "rgba(255,120,20,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 6 + Math.random() * 8;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
      ctx.stroke();
    }
  });
}

function buildHand(isLeft, materials) {
  const hand = new THREE.Group();
  const side = isLeft ? -1 : 1;
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.085, 0.07, 3, 0.012), materials.glove);
  palm.position.set(0.022 * side, -0.05, 0.004);
  hand.add(palm);
  const knuckles = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.08, 0.022, 3, 0.01), materials.glove);
  knuckles.position.set(0.004 * side, -0.05, -0.032);
  hand.add(knuckles);
  for (let i = 0; i < 4; i++) {
    const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.022, 3, 8), materials.glove);
    tip.rotation.z = Math.PI / 2;
    tip.position.set(-0.016 * side, -0.018 - i * 0.021, -0.03);
    hand.add(tip);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.045, 3, 8), materials.glove);
  thumb.position.set(-0.016 * side, -0.006, -0.012);
  thumb.rotation.set(Math.PI / 2 - 0.3, 0, 0.35 * side);
  hand.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.045, 16), materials.cuff);
  cuff.position.set(0.024 * side, -0.07, 0.06);
  cuff.rotation.x = Math.PI / 2 - 0.5;
  hand.add(cuff);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.004, 6, 24), materials.patch);
  stripe.position.set(0.024 * side, -0.074, 0.07);
  stripe.rotation.x = -0.5;
  hand.add(stripe);
  const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.043, 0.34, 4, 16), materials.sleeve);
  sleeve.position.set(0.04 * side, -0.15, 0.22);
  sleeve.rotation.x = Math.PI / 2 - 0.5;
  hand.add(sleeve);
  return hand;
}

export function createViewmodel({ onCue } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
  scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x3a3128, 1.1));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.position.set(0.6, 1, 0.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fe0a8, 0.9);
  rim.position.set(-1, 0.3, -0.6);
  scene.add(rim);
  const flashLight = new THREE.PointLight(0xffb060, 0, 1.6, 2);
  scene.add(flashLight);

  const materials = {
    glove: new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.75, metalness: 0.05 }),
    cuff: new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.7 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x2d333b, roughness: 0.85 }),
    patch: new THREE.MeshStandardMaterial({ color: 0x3fae7a, roughness: 0.5, emissive: 0x3fae7a, emissiveIntensity: 0.4 }),
  };
  const sway = new THREE.Group();
  camera.add(sway);
  scene.add(camera);
  const rigs = {};
  const flashTex = flashTexture();
  let current = null, loadError = null, isReady = false;
  const recoil = new Spring(180, 18), recoilRot = new Spring(150, 16), bump = new Spring(90, 14);
  const look = new THREE.Vector2();
  let bobPhase = 0, lastShotCount = -1, lastWeapon = null, boltT = 1, flashT = 1, lastReloadCue = -1;
  const shells = [];

  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3 });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xb3262c, roughness: 0.5 });

  function makeShell(id) {
    const g = new THREE.Group();
    const cfg = CONFIG[id].shell;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(cfg.r, cfg.r, cfg.len, 10), cfg.brass ? brassMat : hullMat));
    if (!cfg.brass) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(cfg.r * 1.03, cfg.r * 1.03, 0.014, 10), brassMat);
      base.position.y = -cfg.len / 2 + 0.004;
      g.add(base);
    }
    g.visible = false;
    camera.add(g);
    return { mesh: g, id, life: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3() };
  }

  async function load() {
    const loader = new GLTFLoader();
    const results = await Promise.allSettled(Object.entries(MODEL_URLS).map(async ([id, url]) => [id, await loader.loadAsync(url)]));
    const failed = results.filter(r => r.status === "rejected");
    if (failed.length) loadError = failed.map(f => String(f.reason?.message || f.reason)).join("; ");
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const [id, gltf] = r.value;
      const model = gltf.scene;
      model.traverse(o => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        if (o.material) o.material.envMapIntensity = 1.2;
      });
      const root = new THREE.Group();
      root.add(model);
      root.visible = false;
      sway.add(root);
      const part = name => (name ? model.getObjectByName(name) : null);
      const moving = part(CONFIG[id].moving), mag = part(CONFIG[id].mag);
      const muzzle = part("Muzzle") || new THREE.Object3D();
      const handLAnchor = part("HandL") || new THREE.Object3D();
      const eject = part("Eject") || muzzle;
      const handR = buildHand(false, materials);
      const handL = buildHand(true, materials);
      root.add(handR, handL);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      flash.visible = false;
      muzzle.add(flash);
      const sideFlash = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.35), new THREE.MeshBasicMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide }));
      sideFlash.rotation.y = Math.PI / 2;
      sideFlash.position.z = -0.12;
      sideFlash.visible = false;
      muzzle.add(sideFlash);
      rigs[id] = {
        id, root, model, moving, mag, muzzle, eject, handR, handL, handLAnchor, flash, sideFlash,
        movingBase: moving?.position.clone(), magBase: mag?.position.clone(), trigger: part("Trigger"), hammer: part("Hammer"),
        shellPool: CONFIG[id].shell ? Array.from({ length: 10 }, () => makeShell(id)) : [], shellIndex: 0,
      };
    }
    isReady = true;
    return { error: loadError };
  }

  function spawnShell(rig) {
    if (!rig.shellPool.length) return;
    const shell = rig.shellPool[rig.shellIndex++ % rig.shellPool.length];
    shells.push(shell);
    rig.eject.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(rig.eject.matrixWorld);
    camera.worldToLocal(p);
    shell.mesh.position.copy(p);
    shell.mesh.rotation.set(Math.random(), Math.random(), Math.PI / 2);
    shell.vel.set(1.4 + Math.random() * 0.6, 1.2 + Math.random() * 0.6, 0.3 + Math.random() * 0.3);
    shell.spin.set(Math.random() * 20, Math.random() * 20, 12 + Math.random() * 10);
    shell.life = SHELL_LIFETIME;
    shell.mesh.visible = true;
  }

  function reloadPose(rig, ars, time, out) {
    const w = WEAPONS[rig.id], cfg = CONFIG[rig.id].reload;
    const duration = ars.reloadWasEmpty ? w.emptyReloadTime : w.reloadTime;
    const t = Math.min(1, Math.max(0, 1 - (ars.stateUntil - time) / duration));
    const tilt = window01(t, 0, 0.12) * (1 - window01(t, 0.86, 1));
    out.rotZ += cfg.tilt * tilt;
    out.rotX += 0.18 * tilt;
    out.posY -= 0.03 * tilt;
    const magOut = window01(t, 0.14, 0.3), magIn = window01(t, 0.5, 0.72);
    out.magOffset = magOut * (1 - magIn) * cfg.drop + (magOut >= 1 && magIn <= 0 ? cfg.drop : 0);
    out.magHidden = t > 0.32 && t < 0.5;
    out.handToMag = window01(t, 0.08, 0.16) * (1 - window01(t, 0.76, 0.86));
    const wantsBolt = ars.reloadWasEmpty || cfg.alwaysBolt;
    if (wantsBolt && cfg.empty.includes("bolt")) out.bolt = window01(t, 0.78, 0.86) * (1 - window01(t, 0.88, 0.9));
    if (wantsBolt && cfg.empty.includes("hand")) out.handToBolt = window01(t, 0.74, 0.8) * (1 - window01(t, 0.9, 0.95));
    if (ars.reloadWasEmpty && cfg.empty === "slide") out.bolt = 1 - window01(t, 0.8, 0.84);
    for (const [cue, at] of [["magOut", 0.16], ["magIn", 0.7], ["bolt", 0.84]]) {
      if (t >= at && lastReloadCue < at && (cue !== "bolt" || (wantsBolt && cfg.empty !== "none"))) onCue?.(cue, rig.id);
    }
    lastReloadCue = t;
    out.bump = t > 0.7 && t < 0.76;
  }

  function update(dt, time, player, motion) {
    if (!isReady) return;
    const ars = player?.arsenal;
    const id = player?.isAlive ? ars.current : null;
    current = id;
    for (const [rid, rig] of Object.entries(rigs)) rig.root.visible = rid === id && !motion.isScoped;
    const rig = id ? rigs[id] : null;
    flashLight.intensity = 0;
    stepShells(dt);
    if (!rig) return;
    const cfg = CONFIG[id];
    const hold = { ...cfg, pos: cfg.hold };
    if (lastWeapon !== id) {
      lastWeapon = id;
      lastShotCount = ars.shotCount;
      lastReloadCue = -1;
    }
    if (ars.shotCount !== lastShotCount) {
      const shots = ars.shotCount - lastShotCount;
      lastShotCount = ars.shotCount;
      if (shots > 0) {
        recoil.impulse((Math.random() - 0.5) * 0.15, 0.15, hold.kickBack * 30);
        recoilRot.impulse(hold.kickPitch * 22, (Math.random() - 0.5) * hold.kickYaw * 40, (Math.random() - 0.5) * 1.2);
        boltT = 0;
        flashT = 0;
        rig.flash.material.rotation = Math.random() * Math.PI * 2;
        rig.flash.scale.setScalar(hold.flashScale * (0.8 + Math.random() * 0.5));
        rig.sideFlash.scale.set(hold.flashScale * 1.4, hold.flashScale * 1.4, 1);
        spawnShell(rig);
      }
    }
    if (ars.state !== "reload") lastReloadCue = -1;
    recoil.step(dt);
    recoilRot.step(dt);
    bump.step(dt);
    boltT = Math.min(1, boltT + dt / (WEAPONS[id].fireInterval * 0.6));
    flashT += dt;

    const pose = { posY: 0, rotX: 0, rotZ: 0, magOffset: 0, magHidden: false, handToMag: 0, bolt: 0, handToBolt: 0, bump: false };
    if (ars.state === "reload") reloadPose(rig, ars, time, pose);
    if (ars.state === "raise") {
      const t = 1 - Math.max(0, (ars.stateUntil - time) / WEAPONS[id].raiseTime);
      const e = 1 - (1 - t) ** 3;
      pose.posY -= (1 - e) * 0.25;
      pose.rotX -= (1 - e) * 0.7;
    }
    if (pose.bump) bump.impulse(0, -0.25, 0);

    look.x += (Math.max(-0.08, Math.min(0.08, -motion.lookDX * 0.0009)) - look.x) * Math.min(1, dt * 10);
    look.y += (Math.max(-0.06, Math.min(0.06, motion.lookDY * 0.0009)) - look.y) * Math.min(1, dt * 10);
    const speed = motion.onGround && !motion.sliding ? Math.min(1, motion.speed / 8.5) : 0;
    bobPhase += dt * (6 + motion.speed * 0.9) * (speed > 0.05 ? 1 : 0.25);
    const bobX = Math.sin(bobPhase) * 0.012 * speed, bobY = -Math.abs(Math.cos(bobPhase)) * 0.012 * speed;
    const breathe = Math.sin(time * 1.6) * 0.0025;

    sway.position.set(hold.pos.x + bobX + look.x * 0.5 - recoil.value.x * 0.01, hold.pos.y + bobY + breathe + pose.posY + motion.landKick * -0.04 + motion.slide * -0.03 + bump.value.y * 0.05, hold.pos.z + recoil.value.z * 0.01);
    sway.rotation.set(look.y + recoilRot.value.x * 0.01 + pose.rotX + motion.landKick * 0.05, look.x * 2 + recoilRot.value.y * 0.01, -motion.roll * 0.6 + recoilRot.value.z * 0.01 + pose.rotZ + motion.slide * 0.35);
    rig.root.position.set(0, 0, 0);

    const isLockedBack = cfg.reload.empty === "slide" && ars.ammo[id].mag === 0;
    const cycle = boltT < 1 ? Math.sin(boltT * Math.PI) : 0;
    const boltAmount = Math.max(cycle, pose.bolt, isLockedBack && ars.state !== "reload" ? 1 : 0);
    if (rig.moving && rig.movingBase) rig.moving.position.set(rig.movingBase.x, rig.movingBase.y, rig.movingBase.z + boltAmount * hold.boltTravel);
    if (rig.mag && rig.magBase) {
      const dir = cfg.magDir;
      rig.mag.position.set(rig.magBase.x + dir[0] * pose.magOffset, rig.magBase.y + dir[1] * pose.magOffset, rig.magBase.z + dir[2] * pose.magOffset);
      rig.mag.visible = !pose.magHidden;
    }
    if (rig.trigger) rig.trigger.rotation.x = (motion.isFiring ? 0.25 : 0);
    if (rig.hammer) rig.hammer.rotation.x = boltT < 1 ? 0.6 * (1 - boltT) : 0;

    const anchor = new THREE.Vector3();
    rig.handLAnchor.updateWorldMatrix(true, false);
    anchor.setFromMatrixPosition(rig.handLAnchor.matrixWorld);
    rig.root.worldToLocal(anchor);
    if (pose.handToMag > 0 && rig.mag) {
      const magPos = new THREE.Vector3();
      rig.mag.updateWorldMatrix(true, false);
      magPos.setFromMatrixPosition(rig.mag.matrixWorld);
      rig.root.worldToLocal(magPos);
      anchor.lerp(magPos.add(new THREE.Vector3(-0.03, -0.02, 0)), pose.handToMag);
    }
    if (pose.handToBolt > 0 && rig.moving) {
      const boltPos = new THREE.Vector3();
      rig.moving.updateWorldMatrix(true, false);
      boltPos.setFromMatrixPosition(rig.moving.matrixWorld);
      rig.root.worldToLocal(boltPos);
      anchor.lerp(boltPos.add(new THREE.Vector3(-0.03, 0.02, 0)), pose.handToBolt);
    }
    rig.handL.position.copy(anchor);
    rig.handL.rotation.set(cfg.handL[0], 0, cfg.handL[1]);
    rig.handR.position.set(0, 0, 0);
    rig.handR.rotation.set(-0.26, 0, 0);

    const isFlashing = flashT < 0.045;
    rig.flash.visible = isFlashing;
    rig.sideFlash.visible = isFlashing && cfg.sideFlash;
    if (isFlashing) {
      rig.muzzle.updateWorldMatrix(true, false);
      flashLight.position.setFromMatrixPosition(rig.muzzle.matrixWorld);
      flashLight.intensity = cfg.light;
    }
  }

  function stepShells(dt) {
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        shells.splice(i, 1);
        continue;
      }
      s.vel.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
    }
  }

  function muzzleWorldPosition(mainCamera, out) {
    const rig = current && rigs[current];
    if (!rig) return out.set(0.15, -0.12, -0.6).applyMatrix4(mainCamera.matrixWorld);
    rig.muzzle.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(rig.muzzle.matrixWorld);
    camera.worldToLocal(out);
    return out.applyMatrix4(mainCamera.matrixWorld);
  }

  function weaponFactory(id) {
    const rig = rigs[id];
    if (!rig) return null;
    const clone = rig.model.clone(true);
    clone.traverse(o => { o.castShadow = true; });
    return clone;
  }

  return {
    scene, camera, load, update, muzzleWorldPosition, weaponFactory,
    get error() { return loadError; },
    get isReady() { return isReady; },
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); },
  };
}
