import * as THREE from "three";

const SIZE = 512;

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = i => ((i % period) + period) % period;
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, seed, octaves = 5, basePeriod = 8) {
  let total = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    total += valueNoise(x * freq, y * freq, seed + o * 17, basePeriod * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / norm;
}

function makeCanvas(size = SIZE) {
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(size, size) : Object.assign(document.createElement("canvas"), { width: size, height: size });
  return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true }) };
}

function pixelTexture(size, shade) {
  const { canvas, ctx } = makeCanvas(size);
  const image = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { r, g, b, h } = shade(x / size, y / size, x, y);
      const i = (y * size + x) * 4;
      image.data[i] = r; image.data[i + 1] = g; image.data[i + 2] = b; image.data[i + 3] = 255;
      height[y * size + x] = h;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, ctx, height, size };
}

function normalFromHeight(height, size, strength) {
  const { canvas, ctx } = makeCanvas(size);
  const image = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      image.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      image.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function finish(canvas, isColor, anisotropy) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const clamp255 = v => Math.max(0, Math.min(255, v));

const RECIPES = {
  parquet: { scale: 2, strength: 3, roughness: 0.55, shade(u, v) {
    const plankW = 1 / 8, plankL = 1 / 2;
    const col = Math.floor(u / plankW);
    const offset = (col % 2) * plankL * 0.5;
    const row = Math.floor((v + offset) / plankL);
    const pu = (u % plankW) / plankW, pv = (((v + offset) % plankL) + plankL) % plankL / plankL;
    const tone = hash(col, row, 3) * 0.35;
    const grain = fbm(u * 2, v * 40 + col * 3, 5, 3, 16) * 0.5 + Math.sin((v + hash(col, row, 4)) * 260 + fbm(u * 8, v * 8, 6, 2, 8) * 6) * 0.06;
    const seam = Math.min(pu, 1 - pu, pv * 4, (1 - pv) * 4) < 0.025 ? 1 : 0;
    const base = 0.55 + tone + grain * 0.4;
    return { r: clamp255((150 * base) - seam * 70), g: clamp255((96 * base) - seam * 50), b: clamp255((58 * base) - seam * 35), h: seam ? 0 : 0.6 + grain * 0.2 };
  } },
  concrete: { scale: 4, strength: 2.5, roughness: 0.9, shade(u, v) {
    const n = fbm(u * 8, v * 8, 11, 6, 8);
    const pits = fbm(u * 64, v * 64, 12, 2, 64) > 0.78 ? -0.25 : 0;
    const seamU = Math.abs(u - 0.5) < 0.003 || u < 0.003 ? 1 : 0;
    const seamV = Math.abs(v - 0.5) < 0.003 || v < 0.003 ? 1 : 0;
    const tieHole = [0.125, 0.375, 0.625, 0.875].some(a => [0.25, 0.75].some(b => Math.hypot(u - a, v - b) < 0.012)) ? 1 : 0;
    const stain = fbm(u * 3, v * 1.5, 13, 3, 3) * 0.18 * v;
    const value = 120 + n * 70 + pits * 60 - stain * 120 - (seamU || seamV) * 30 - tieHole * 70;
    return { r: clamp255(value * 0.98), g: clamp255(value), b: clamp255(value * 1.03), h: n * 0.5 + pits - tieHole - (seamU || seamV) * 0.4 };
  } },
  concreteDark: { scale: 3, strength: 2.5, roughness: 0.85, shade(u, v) {
    const n = fbm(u * 10, v * 10, 21, 6, 10);
    const value = 62 + n * 45;
    return { r: clamp255(value), g: clamp255(value * 1.02), b: clamp255(value * 1.06), h: n };
  } },
  terrazzo: { scale: 2.5, strength: 1.5, roughness: 0.35, shade(u, v) {
    const n = fbm(u * 6, v * 6, 31, 4, 6);
    const cell = 48;
    const cx = Math.floor(u * cell), cy = Math.floor(v * cell);
    const fx = u * cell - cx, fy = v * cell - cy;
    const chip = hash(cx, cy, 33) > 0.55 && Math.hypot(fx - hash(cx, cy, 34), fy - hash(cx, cy, 35)) < 0.18 + hash(cx, cy, 36) * 0.2;
    const chipTone = hash(cx, cy, 37);
    const palette = chipTone < 0.33 ? [70, 150, 110] : chipTone < 0.66 ? [215, 205, 190] : [40, 42, 46];
    const base = 128 + n * 26;
    return chip ? { r: palette[0], g: palette[1], b: palette[2], h: 0.55 } : { r: clamp255(base), g: clamp255(base * 0.97), b: clamp255(base * 0.92), h: 0.5 };
  } },
  tile: { scale: 1.6, strength: 4, roughness: 0.25, shade(u, v) {
    const t = 6;
    const fu = (u * t) % 1, fv = (v * t) % 1;
    const grout = fu < 0.04 || fv < 0.04;
    const tone = hash(Math.floor(u * t), Math.floor(v * t), 41) * 18;
    const n = fbm(u * 20, v * 20, 42, 2, 20) * 10;
    return grout ? { r: 70, g: 72, b: 70, h: 0 } : { r: clamp255(48 + tone + n), g: clamp255(112 + tone + n), b: clamp255(92 + tone + n), h: 1 };
  } },
  stage: { scale: 3, strength: 3, roughness: 0.6, shade(u, v) {
    const planks = 10;
    const p = Math.floor(v * planks);
    const pv = (v * planks) % 1;
    const seam = pv < 0.03 || ((u + hash(p, 0, 51)) % 0.5) < 0.004;
    const grain = fbm(u * 30, v * 3 + p, 52, 3, 30) * 0.4 + Math.sin(u * 300 + fbm(u * 4, v * 4, 53, 2, 4) * 8) * 0.05;
    const tone = 0.45 + hash(p, 0, 54) * 0.25 + grain;
    return { r: clamp255(110 * tone - (seam ? 40 : 0)), g: clamp255(66 * tone - (seam ? 25 : 0)), b: clamp255(40 * tone - (seam ? 15 : 0)), h: seam ? 0 : 0.6 + grain * 0.3 };
  } },
  stageFront: { scale: 2, strength: 3, roughness: 0.7, shade(u, v) {
    const panel = (u * 4) % 1;
    const rail = panel < 0.05 || panel > 0.95 || v < 0.06 || v > 0.94;
    const n = fbm(u * 12, v * 12, 61, 3, 12) * 12;
    return { r: clamp255(28 + n), g: clamp255(26 + n), b: clamp255(30 + n), h: rail ? 1 : 0.4 };
  } },
  metal: { scale: 1, strength: 1, roughness: 0.4, metalness: 0.85, shade(u, v) {
    const brush = fbm(u * 2, v * 120, 71, 3, 2) * 25;
    const value = 120 + brush;
    return { r: clamp255(value * 0.95), g: clamp255(value), b: clamp255(value * 1.05), h: brush / 25 };
  } },
  crate: { scale: 1.2, strength: 4, roughness: 0.75, shade(u, v) {
    const frame = u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92;
    const diag = Math.abs(u - v) < 0.06 && !frame;
    const plank = Math.floor(v * 5);
    const grain = fbm(u * 18, v * 2 + plank, 81, 3, 18) * 0.35;
    const tone = 0.6 + hash(plank, 1, 82) * 0.2 + grain;
    const shade = frame || diag ? 0.82 : 1;
    const seam = !frame && (v * 5) % 1 < 0.03;
    return { r: clamp255(176 * tone * shade - (seam ? 50 : 0)), g: clamp255(132 * tone * shade - (seam ? 40 : 0)), b: clamp255(82 * tone * shade - (seam ? 30 : 0)), h: frame || diag ? 1 : seam ? 0 : 0.5 };
  } },
  ceiling: { scale: 2.4, strength: 3, roughness: 0.95, tint: 0.62, shade(u, v) {
    const grid = (u * 2) % 1 < 0.02 || (v * 2) % 1 < 0.02;
    const holes = hash(Math.floor(u * 90), Math.floor(v * 90), 91) > 0.82 ? 1 : 0;
    const n = fbm(u * 10, v * 10, 92, 2, 10) * 12;
    const value = grid ? 90 : 200 - holes * 40 + n;
    return { r: clamp255(value), g: clamp255(value), b: clamp255(value * 0.98), h: grid ? 0 : 1 - holes * 0.5 };
  } },
  lectern: { scale: 1, strength: 2, roughness: 0.45, shade(u, v) {
    const grain = Math.sin(v * 90 + fbm(u * 6, v * 6, 101, 3, 6) * 10) * 0.08 + fbm(u * 20, v * 2, 102, 2, 20) * 0.3;
    const tone = 0.55 + grain;
    return { r: clamp255(120 * tone), g: clamp255(70 * tone), b: clamp255(38 * tone), h: grain };
  } },
};

export function createSurfaceMaterials(renderer, quality) {
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), quality === "low" ? 2 : 8);
  const size = quality === "low" ? 256 : SIZE;
  const materials = {};
  for (const [name, recipe] of Object.entries(RECIPES)) {
    const tex = pixelTexture(size, (u, v, x, y) => recipe.shade(u, v, x, y));
    const map = finish(tex.canvas, true, anisotropy);
    const normalMap = finish(normalFromHeight(tex.height, size, recipe.strength), false, anisotropy);
    materials[name] = new THREE.MeshStandardMaterial({
      map, normalMap, roughness: recipe.roughness, metalness: recipe.metalness ?? 0,
      normalScale: new THREE.Vector2(1, 1), envMapIntensity: 0.35, color: new THREE.Color().setScalar(recipe.tint ?? 1),
    });
    materials[name].userData.texScale = recipe.scale;
  }
  return materials;
}

export function canvasTexture(width, height, draw, isColor = true) {
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
  draw(canvas.getContext("2d"), width, height);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}
