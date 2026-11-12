const SURFACE_EPSILON = 0.001;
const GRID_CELL = 4;
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = v => Math.hypot(v.x, v.y, v.z);

function makePlane(nx, ny, nz, px, py, pz) {
  const len = Math.hypot(nx, ny, nz);
  const n = { x: nx / len, y: ny / len, z: nz / len };
  return { n, d: n.x * px + n.y * py + n.z * pz };
}

function intersectPlanes(a, b, c) {
  const n1 = a.n, n2 = b.n, n3 = c.n;
  const c23 = { x: n2.y * n3.z - n2.z * n3.y, y: n2.z * n3.x - n2.x * n3.z, z: n2.x * n3.y - n2.y * n3.x };
  const det = dot(n1, c23);
  if (Math.abs(det) < 1e-9) return null;
  const c31 = { x: n3.y * n1.z - n3.z * n1.y, y: n3.z * n1.x - n3.x * n1.z, z: n3.x * n1.y - n3.y * n1.x };
  const c12 = { x: n1.y * n2.z - n1.z * n2.y, y: n1.z * n2.x - n1.x * n2.z, z: n1.x * n2.y - n1.y * n2.x };
  return {
    x: (a.d * c23.x + b.d * c31.x + c.d * c12.x) / det,
    y: (a.d * c23.y + b.d * c31.y + c.d * c12.y) / det,
    z: (a.d * c23.z + b.d * c31.z + c.d * c12.z) / det,
  };
}

export function brushVertices(planes) {
  const points = [];
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const p = intersectPlanes(planes[i], planes[j], planes[k]);
        if (!p || planes.some(pl => dot(pl.n, p) - pl.d > 1e-4)) continue;
        if (points.some(q => Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + Math.abs(q.z - p.z) < 1e-5)) continue;
        points.push(p);
      }
    }
  }
  return points;
}

function finishBrush(planes, options) {
  const vertices = brushVertices(planes);
  if (vertices.length < 4) throw new Error("degenerate brush");
  const min = vec(Infinity, Infinity, Infinity), max = vec(-Infinity, -Infinity, -Infinity);
  for (const p of vertices) {
    min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y); max.z = Math.max(max.z, p.z);
  }
  const collisionPlanes = [...planes];
  const bounds = [max.x, -min.x, max.y, -min.y, max.z, -min.z];
  AXES.forEach(([x, y, z], i) => {
    if (collisionPlanes.some(p => p.n.x * x + p.n.y * y + p.n.z * z > 0.9999)) return;
    collisionPlanes.push({ n: { x, y, z }, d: bounds[i] });
  });
  return { planes, collisionPlanes, vertices, min, max, material: options.material || "concrete", faces: options.faces || null, isSolid: options.isSolid !== false, isVisible: options.isVisible !== false };
}

export function box(x1, y1, z1, x2, y2, z2, options = {}) {
  const [ax, bx] = x1 < x2 ? [x1, x2] : [x2, x1];
  const [ay, by] = y1 < y2 ? [y1, y2] : [y2, y1];
  const [az, bz] = z1 < z2 ? [z1, z2] : [z2, z1];
  return finishBrush([
    makePlane(1, 0, 0, bx, 0, 0), makePlane(-1, 0, 0, ax, 0, 0),
    makePlane(0, 1, 0, 0, by, 0), makePlane(0, -1, 0, 0, ay, 0),
    makePlane(0, 0, 1, 0, 0, bz), makePlane(0, 0, -1, 0, 0, az),
  ], options);
}

export function ramp(x1, y1, z1, x2, y2, z2, rise, options = {}) {
  const [ax, bx] = x1 < x2 ? [x1, x2] : [x2, x1];
  const [ay, by] = y1 < y2 ? [y1, y2] : [y2, y1];
  const [az, bz] = z1 < z2 ? [z1, z2] : [z2, z1];
  const h = by - ay;
  const sides = [makePlane(0, -1, 0, 0, ay, 0)];
  if (rise === "+x") sides.push(makePlane(-h, bx - ax, 0, ax, ay, 0), makePlane(1, 0, 0, bx, 0, 0), makePlane(0, 0, 1, 0, 0, bz), makePlane(0, 0, -1, 0, 0, az));
  else if (rise === "-x") sides.push(makePlane(h, bx - ax, 0, bx, ay, 0), makePlane(-1, 0, 0, ax, 0, 0), makePlane(0, 0, 1, 0, 0, bz), makePlane(0, 0, -1, 0, 0, az));
  else if (rise === "+z") sides.push(makePlane(0, bz - az, -h, 0, ay, az), makePlane(0, 0, 1, 0, 0, bz), makePlane(1, 0, 0, bx, 0, 0), makePlane(-1, 0, 0, ax, 0, 0));
  else if (rise === "-z") sides.push(makePlane(0, bz - az, h, 0, ay, bz), makePlane(0, 0, -1, 0, 0, az), makePlane(1, 0, 0, bx, 0, 0), makePlane(-1, 0, 0, ax, 0, 0));
  else throw new Error(`bad ramp direction ${rise}`);
  return finishBrush(sides, options);
}

export function createWorld(brushes) {
  const solids = brushes.filter(b => b.isSolid);
  const min = vec(Infinity, Infinity, Infinity), max = vec(-Infinity, -Infinity, -Infinity);
  for (const b of solids) {
    min.x = Math.min(min.x, b.min.x); min.y = Math.min(min.y, b.min.y); min.z = Math.min(min.z, b.min.z);
    max.x = Math.max(max.x, b.max.x); max.y = Math.max(max.y, b.max.y); max.z = Math.max(max.z, b.max.z);
  }
  const cols = Math.ceil((max.x - min.x) / GRID_CELL) + 1;
  const rows = Math.ceil((max.z - min.z) / GRID_CELL) + 1;
  const cells = Array.from({ length: cols * rows }, () => []);
  solids.forEach((b, index) => {
    const c0 = Math.floor((b.min.x - min.x) / GRID_CELL), c1 = Math.floor((b.max.x - min.x) / GRID_CELL);
    const r0 = Math.floor((b.min.z - min.z) / GRID_CELL), r1 = Math.floor((b.max.z - min.z) / GRID_CELL);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * cols + c].push(index);
  });
  return { brushes: solids, min, max, cols, rows, cells, stamp: new Uint32Array(solids.length), stampValue: 0, scratch: [] };
}

function gatherBrushes(world, minX, minZ, maxX, maxZ) {
  const out = world.scratch;
  out.length = 0;
  world.stampValue = (world.stampValue + 1) >>> 0;
  if (world.stampValue === 0) { world.stamp.fill(0); world.stampValue = 1; }
  const c0 = Math.max(0, Math.floor((minX - world.min.x) / GRID_CELL)), c1 = Math.min(world.cols - 1, Math.floor((maxX - world.min.x) / GRID_CELL));
  const r0 = Math.max(0, Math.floor((minZ - world.min.z) / GRID_CELL)), r1 = Math.min(world.rows - 1, Math.floor((maxZ - world.min.z) / GRID_CELL));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      for (const index of world.cells[r * world.cols + c]) {
        if (world.stamp[index] === world.stampValue) continue;
        world.stamp[index] = world.stampValue;
        out.push(index);
      }
    }
  }
  return out;
}

function clipToBrush(brush, start, end, hx, hy, hz, trace) {
  let enterFrac = -1, leaveFrac = 1, hitPlane = null, startsOut = false, endsOut = false;
  for (const plane of brush.collisionPlanes) {
    const n = plane.n;
    const dist = plane.d + Math.abs(n.x) * hx + Math.abs(n.y) * hy + Math.abs(n.z) * hz;
    const d1 = n.x * start.x + n.y * start.y + n.z * start.z - dist;
    const d2 = n.x * end.x + n.y * end.y + n.z * end.z - dist;
    if (d2 > 0) endsOut = true;
    if (d1 > 0) startsOut = true;
    if (d1 > 0 && (d2 >= SURFACE_EPSILON || d2 >= d1)) return;
    if (d1 <= 0 && d2 <= 0) continue;
    if (d1 > d2) {
      const f = Math.max(0, (d1 - SURFACE_EPSILON) / (d1 - d2));
      if (f > enterFrac) { enterFrac = f; hitPlane = plane; }
    } else {
      const f = Math.min(1, (d1 + SURFACE_EPSILON) / (d1 - d2));
      if (f < leaveFrac) leaveFrac = f;
    }
  }
  if (!startsOut) {
    trace.startSolid = true;
    if (!endsOut) trace.allSolid = true;
    trace.fraction = 0;
    trace.brush = brush;
    return;
  }
  if (enterFrac < leaveFrac && enterFrac > -1 && enterFrac < trace.fraction) {
    trace.fraction = Math.max(0, enterFrac);
    trace.normal = hitPlane.n;
    trace.brush = brush;
  }
}

export function traceBox(world, start, end, hx, hy, hz) {
  const trace = { fraction: 1, normal: null, startSolid: false, allSolid: false, brush: null, end: null };
  const minX = Math.min(start.x, end.x) - hx - 0.01, maxX = Math.max(start.x, end.x) + hx + 0.01;
  const minY = Math.min(start.y, end.y) - hy - 0.01, maxY = Math.max(start.y, end.y) + hy + 0.01;
  const minZ = Math.min(start.z, end.z) - hz - 0.01, maxZ = Math.max(start.z, end.z) + hz + 0.01;
  for (const index of gatherBrushes(world, minX, minZ, maxX, maxZ)) {
    const b = world.brushes[index];
    if (b.min.x > maxX || b.max.x < minX || b.min.y > maxY || b.max.y < minY || b.min.z > maxZ || b.max.z < minZ) continue;
    clipToBrush(b, start, end, hx, hy, hz, trace);
    if (trace.allSolid) break;
  }
  const f = trace.fraction;
  trace.end = { x: start.x + (end.x - start.x) * f, y: start.y + (end.y - start.y) * f, z: start.z + (end.z - start.z) * f };
  return trace;
}

export const traceRay = (world, start, end) => traceBox(world, start, end, 0, 0, 0);

export function isPointSolid(world, p) {
  for (const index of gatherBrushes(world, p.x, p.z, p.x, p.z)) {
    const b = world.brushes[index];
    if (b.collisionPlanes.every(pl => dot(pl.n, p) - pl.d < 0)) return true;
  }
  return false;
}

export function rayBox(origin, dir, maxDist, min, max) {
  let tMin = 0, tMax = maxDist;
  for (const axis of ["x", "y", "z"]) {
    const o = origin[axis], d = dir[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < min[axis] || o > max[axis]) return -1;
      continue;
    }
    let t1 = (min[axis] - o) / d, t2 = (max[axis] - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }
  return tMin;
}
