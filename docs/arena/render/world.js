import * as THREE from "three";
import { canvasTexture, createSurfaceMaterials } from "./textures.js";

const DAYS = ["Pirmdiena", "Otrdiena", "Trešdiena", "Ceturtdiena", "Piektdiena"];
const SUBJECTS = [["Matemātika", "#3fae7a"], ["Fizika", "#4f8fd8"], ["Latviešu val.", "#e0a43a"], ["Angļu val.", "#c95a8a"], ["Informātika", "#6b6be0"], ["Ķīmija", "#d8624f"], ["Sports", "#47b5b0"], ["Vēsture", "#a27b4f"], ["Programmēšana", "#58c06a"]];
const BELLS = ["8:30", "9:20", "10:10", "11:10", "12:00", "12:50", "13:40", "14:30"];

function faceMaterialName(brush, normal) {
  const faces = brush.faces || {};
  if (normal.y > 0.7) return faces.top || brush.material;
  if (normal.y < -0.7) return faces.bottom || brush.material;
  return faces.side || brush.material;
}

function faceBasis(n) {
  if (Math.abs(n.y) > 0.7) return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
  if (Math.abs(n.x) > Math.abs(n.z)) return [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)];
  return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
}

function buildBrushGeometry(brushes, materials) {
  const buckets = new Map();
  for (const brush of brushes) {
    if (!brush.isVisible) continue;
    for (const plane of brush.planes) {
      const onPlane = brush.vertices.filter(p => Math.abs(plane.n.x * p.x + plane.n.y * p.y + plane.n.z * p.z - plane.d) < 1e-3);
      if (onPlane.length < 3) continue;
      const n = new THREE.Vector3(plane.n.x, plane.n.y, plane.n.z);
      const center = onPlane.reduce((c, p) => c.add(new THREE.Vector3(p.x, p.y, p.z)), new THREE.Vector3()).multiplyScalar(1 / onPlane.length);
      const helper = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const t1 = new THREE.Vector3().crossVectors(n, helper).normalize();
      const t2 = new THREE.Vector3().crossVectors(n, t1);
      const sorted = onPlane.map(p => new THREE.Vector3(p.x, p.y, p.z)).sort((a, b) => {
        const da = a.clone().sub(center), db = b.clone().sub(center);
        return Math.atan2(da.dot(t2), da.dot(t1)) - Math.atan2(db.dot(t2), db.dot(t1));
      });
      const name = faceMaterialName(brush, plane.n);
      const material = materials[name] || materials.concrete;
      const scale = material.userData.texScale || 2;
      const [ua, va] = faceBasis(plane.n);
      if (!buckets.has(name)) buckets.set(name, { positions: [], normals: [], uvs: [] });
      const bucket = buckets.get(name);
      for (let i = 1; i < sorted.length - 1; i++) {
        const tri = [sorted[0], sorted[i], sorted[i + 1]];
        for (const p of tri) {
          bucket.positions.push(p.x, p.y, p.z);
          bucket.normals.push(n.x, n.y, n.z);
          bucket.uvs.push(p.dot(ua) / scale, p.dot(va) / scale);
        }
      }
    }
  }
  const meshes = [];
  for (const [name, bucket] of buckets) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[name] || materials.concrete);
    mesh.castShadow = name !== "ceiling";
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.name = `world-${name}`;
    meshes.push(mesh);
  }
  return meshes;
}

function timetableTexture() {
  return canvasTexture(2048, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#101418";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3fae7a";
    ctx.font = "bold 64px 'JetBrains Mono', monospace";
    ctx.fillText("▚ stundu-saraksts", 48, 92);
    ctx.fillStyle = "#8a949e";
    ctx.font = "32px 'JetBrains Mono', monospace";
    ctx.fillText("STARPBRĪDIS · arēna atvērta pēc stundām", 48, 140);
    const left = 200, top = 190, colW = (w - left - 48) / DAYS.length, rowH = (h - top - 40) / BELLS.length;
    ctx.font = "bold 30px 'JetBrains Mono', monospace";
    DAYS.forEach((d, i) => { ctx.fillStyle = "#cfd6dc"; ctx.fillText(d, left + i * colW + 16, top - 16); });
    BELLS.forEach((b, r) => { ctx.fillStyle = "#6c7680"; ctx.fillText(b, 48, top + r * rowH + rowH * 0.62); });
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let c = 0; c < DAYS.length; c++) {
      for (let r = 0; r < BELLS.length; r++) {
        if (rand() < 0.12) continue;
        const [subject, color] = SUBJECTS[Math.floor(rand() * SUBJECTS.length)];
        const x = left + c * colW + 6, y = top + r * rowH + 6;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.22;
        ctx.fillRect(x, y, colW - 12, rowH - 12);
        ctx.globalAlpha = 1;
        ctx.fillRect(x, y, 8, rowH - 12);
        ctx.fillStyle = "#e9eef2";
        ctx.font = "bold 28px 'JetBrains Mono', monospace";
        ctx.fillText(subject, x + 22, y + rowH * 0.5);
        ctx.fillStyle = "#93a0aa";
        ctx.font = "22px 'JetBrains Mono', monospace";
        ctx.fillText(`${200 + Math.floor(rand() * 120)}. kab.`, x + 22, y + rowH * 0.5 + 28);
      }
    }
  });
}

function chalkboardTexture() {
  return canvasTexture(2048, 640, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#1f3a2e");
    g.addColorStop(1, "#173026");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 140, 2 + Math.random() * 8);
    }
    ctx.fillStyle = "rgba(240,244,236,0.92)";
    ctx.font = "bold 92px 'Comic Sans MS', 'Chalkboard', cursive";
    ctx.fillText("Starpbrīdis", 70, 130);
    ctx.font = "54px 'Comic Sans MS', 'Chalkboard', cursive";
    ctx.fillStyle = "rgba(240,244,236,0.85)";
    ctx.fillText("v = v₀ + a·t   (bet gaisā a ir tavs A/D + pele)", 70, 240);
    ctx.fillText("bhop: turi atstarpi, nezaudē ātrumu", 70, 330);
    ctx.fillText("slīde + lēciens = momentum", 70, 420);
    ctx.fillStyle = "rgba(255,214,120,0.9)";
    ctx.fillText("Mājasdarbs: 25 fragi līdz zvanam!", 70, 540);
    ctx.strokeStyle = "rgba(240,244,236,0.7)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(1650, 330, 170, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(1500, 470); ctx.lineTo(1820, 470); ctx.moveTo(1500, 470); ctx.lineTo(1500, 160);
    ctx.stroke();
  });
}

function windowTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0e1a33");
    g.addColorStop(0.7, "#22365a");
    g.addColorStop(1, "#3b4a63");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
      ctx.fillRect(Math.random() * w, Math.random() * h * 0.6, 1.5, 1.5);
    }
    ctx.fillStyle = "#070a10";
    ctx.fillRect(0, h * 0.82, w, h);
    ctx.fillStyle = "#1a1d22";
    ctx.fillRect(w / 2 - 4, 0, 8, h);
    ctx.fillRect(0, h / 2 - 4, w, 8);
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#1a1d22";
    ctx.strokeRect(0, 0, w, h);
  });
}

function clockTexture() {
  return canvasTexture(512, 512, (ctx, w) => {
    ctx.fillStyle = "#f3f0e8";
    ctx.beginPath(); ctx.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 18; ctx.strokeStyle = "#202020"; ctx.stroke();
    ctx.fillStyle = "#202020";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2, r1 = w / 2 - 30, r2 = i % 5 ? w / 2 - 44 : w / 2 - 70;
      ctx.lineWidth = i % 5 ? 4 : 12;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.sin(a) * r1, w / 2 - Math.cos(a) * r1);
      ctx.lineTo(w / 2 + Math.sin(a) * r2, w / 2 - Math.cos(a) * r2);
      ctx.stroke();
    }
  });
}

function addPanel(group, decor, texture, emissiveIntensity) {
  const material = new THREE.MeshStandardMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity, roughness: 0.8 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(decor.w, decor.h), material);
  mesh.position.set(decor.pos.x, decor.pos.y, decor.pos.z);
  mesh.rotation.y = decor.rotY;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(decor.w + 0.3, decor.h + 0.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.6 }));
  frame.position.copy(mesh.position);
  frame.rotation.y = decor.rotY;
  frame.translateZ(-0.05);
  mesh.translateZ(0.005);
  group.add(frame, mesh);
}

function curtainGeometry(width, height) {
  const segs = 160;
  const geometry = new THREE.PlaneGeometry(width, height, segs, 8);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const folds = Math.sin(x * 4.2) * 0.12 + Math.sin(x * 9.1 + 1.3) * 0.04;
    pos.setZ(i, folds * (0.7 + 0.3 * (1 - (y + height / 2) / height)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function buildDecor(map, group, materials) {
  const timetable = timetableTexture(), chalk = chalkboardTexture(), win = windowTexture(), clock = clockTexture();
  const stripMaterial = new THREE.MeshStandardMaterial({ color: 0x3fae7a, emissive: 0x3fae7a, emissiveIntensity: 2.4 });
  const lampShade = new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide });
  const bulb = new THREE.MeshStandardMaterial({ color: 0xfff4dd, emissive: 0xffe2b0, emissiveIntensity: 3 });
  const cable = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const skyMaterial = new THREE.MeshStandardMaterial({ color: 0x9fb8d8, emissive: 0x8fb0e0, emissiveIntensity: 0.75, roughness: 0.2 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.8, roughness: 0.35 });
  const lamps = [];
  const clockHands = [];
  for (const d of map.decor) {
    if (d.kind === "timetable") addPanel(group, d, timetable, 0.75);
    else if (d.kind === "chalkboard") addPanel(group, d, chalk, 0.35);
    else if (d.kind === "window") {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), new THREE.MeshStandardMaterial({ map: win, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.3 }));
      m.position.set(d.pos.x, d.pos.y, d.pos.z);
      m.rotation.y = d.rotY;
      m.translateZ(0.01);
      group.add(m);
    } else if (d.kind === "curtain") {
      const m = new THREE.Mesh(curtainGeometry(d.w, d.h), new THREE.MeshStandardMaterial({ color: 0x6d1420, roughness: 0.92 }));
      m.position.set(d.pos.x, d.pos.y, d.pos.z);
      m.rotation.y = d.rotY;
      m.translateZ(0.15);
      m.receiveShadow = true;
      group.add(m);
    } else if (d.kind === "clock") {
      const face = new THREE.Mesh(new THREE.CircleGeometry(d.r, 48), new THREE.MeshStandardMaterial({ map: clock, roughness: 0.4 }));
      face.position.set(d.pos.x, d.pos.y, d.pos.z);
      face.rotation.y = d.rotY;
      face.translateZ(0.06);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.06, 12, 48), frameMaterial);
      rim.position.copy(face.position);
      rim.rotation.y = d.rotY;
      group.add(face, rim);
      for (const [len, width, kind] of [[d.r * 0.55, 0.06, "h"], [d.r * 0.8, 0.04, "m"], [d.r * 0.85, 0.015, "s"]]) {
        const pivot = new THREE.Group();
        pivot.position.copy(face.position);
        pivot.rotation.y = d.rotY;
        pivot.translateZ(0.02 + clockHands.length * 0.01);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(width, len, 0.01), new THREE.MeshStandardMaterial({ color: kind === "s" ? 0xc0392b : 0x111111 }));
        hand.position.y = len / 2 - 0.05;
        const spinner = new THREE.Group();
        spinner.add(hand);
        pivot.add(spinner);
        group.add(pivot);
        clockHands.push({ spinner, kind });
      }
    } else if (d.kind === "lamp") {
      const lamp = new THREE.Group();
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6), cable);
      c.position.y = 0.4;
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.4, 32, 1, true), lampShade);
      shade.position.y = -0.1;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), bulb);
      b.position.y = -0.22;
      lamp.add(c, shade, b);
      lamp.position.set(d.pos.x, d.pos.y, d.pos.z);
      group.add(lamp);
      lamps.push(lamp);
    } else if (d.kind === "skylight") {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.d), skyMaterial);
      panel.rotation.x = Math.PI / 2;
      panel.position.set(d.pos.x, d.pos.y - 0.005, d.pos.z);
      group.add(panel);
      for (let i = 0; i <= 4; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, d.d), frameMaterial);
        bar.position.set(d.pos.x - d.w / 2 + (d.w / 4) * i, d.pos.y - 0.06, d.pos.z);
        group.add(bar);
      }
      for (let i = 0; i <= 2; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(d.w, 0.12, 0.08), frameMaterial);
        bar.position.set(d.pos.x, d.pos.y - 0.06, d.pos.z - d.d / 2 + (d.d / 2) * i);
        group.add(bar);
      }
    } else if (d.kind === "strip") {
      const from = new THREE.Vector3(d.from.x, d.from.y, d.from.z), to = new THREE.Vector3(d.to.x, d.to.y, d.to.z);
      const len = from.distanceTo(to);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), stripMaterial);
      strip.position.copy(from).lerp(to, 0.5);
      strip.lookAt(to);
      group.add(strip);
    }
  }
  return { clockHands, lamps };
}

function buildPads(map, group) {
  const pads = [];
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x3fae7a, emissive: 0x3fae7a, emissiveIntensity: 2.5, transparent: true, opacity: 0.9, depthWrite: false });
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1e22, metalness: 0.8, roughness: 0.3 });
  for (const pad of map.pads) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.12, 40), baseMaterial);
    base.position.y = 0.06;
    base.receiveShadow = true;
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.7, 40), ringMaterial);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.125;
    g.add(base, inner);
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.025, 8, 48), ringMaterial.clone());
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      rings.push(ring);
    }
    g.position.set(pad.center.x, pad.center.y, pad.center.z);
    group.add(g);
    pads.push({ rings });
  }
  return pads;
}

export function buildWorld(scene, renderer, map, brushes, quality) {
  const group = new THREE.Group();
  group.name = "world";
  const materials = createSurfaceMaterials(renderer, quality);
  for (const mesh of buildBrushGeometry(brushes, materials)) {
    mesh.updateMatrix();
    group.add(mesh);
  }
  const decor = buildDecor(map, group, materials);
  const pads = buildPads(map, group);

  scene.add(new THREE.HemisphereLight(0xbfd3ea, 0x3a2e24, 0.2));
  const sun = new THREE.DirectionalLight(map.sun.color, map.sun.intensity);
  const sd = map.sun.dir;
  sun.position.set(-sd.x * 40, -sd.y * 40, -sd.z * 40);
  sun.target.position.set(0, 0, 0);
  if (quality !== "low") {
    sun.castShadow = true;
    const size = quality === "high" ? 2048 : 1024;
    sun.shadow.mapSize.set(size, size);
    Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 28, bottom: -28, near: 1, far: 100 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
  }
  scene.add(sun, sun.target);
  const maxPoint = quality === "low" ? 3 : quality === "medium" ? 5 : map.lights.length;
  for (const light of map.lights.slice(0, maxPoint)) {
    const p = new THREE.PointLight(light.color, light.intensity, light.distance, 2);
    p.position.set(light.pos.x, light.pos.y, light.pos.z);
    scene.add(p);
  }
  scene.fog = new THREE.Fog(map.fogColor, 40, 110);
  scene.background = new THREE.Color(map.fogColor);
  scene.add(group);

  const update = (time, now) => {
    const d = new Date(now);
    const h = d.getHours() % 12 + d.getMinutes() / 60, m = d.getMinutes() + d.getSeconds() / 60, s = d.getSeconds() + d.getMilliseconds() / 1000;
    for (const hand of decor.clockHands) hand.spinner.rotation.z = -(hand.kind === "h" ? h / 12 : hand.kind === "m" ? m / 60 : s / 60) * Math.PI * 2;
    for (const pad of pads) {
      pad.rings.forEach((ring, i) => {
        const phase = (time * 0.9 + i / 3) % 1;
        ring.position.y = 0.15 + phase * 2.2;
        ring.scale.setScalar(1 - phase * 0.4);
        ring.material.opacity = (1 - phase) * 0.8;
      });
    }
    decor.lamps.forEach((lamp, i) => { lamp.rotation.z = Math.sin(time * 0.6 + i) * 0.01; });
  };
  return { group, update, materials };
}
