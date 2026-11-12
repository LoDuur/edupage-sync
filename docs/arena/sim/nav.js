import * as C from "./constants.js";
import { traceBox } from "./collision.js";
import { createMoveState, stepMovement } from "./movement.js";

const CELL = 1.25;
const THIN = 0.05;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const MAX_DROP = 6.5;
const MAX_JUMP_UP = 1.15;

function standingFits(world, p) {
  const hh = C.STAND_HEIGHT / 2;
  return !traceBox(world, { x: p.x, y: p.y + 0.02 + hh, z: p.z }, { x: p.x, y: p.y + 0.02 + hh, z: p.z }, C.PLAYER_RADIUS, hh, C.PLAYER_RADIUS).startSolid;
}

function isThinSolid(world, x, y, z) {
  return traceBox(world, { x, y, z }, { x, y, z }, C.PLAYER_RADIUS, THIN, C.PLAYER_RADIUS).startSolid;
}

function sampleColumn(world, x, z, top, bottom) {
  const floors = [];
  let y = top;
  while (y > bottom) {
    while (y > bottom && isThinSolid(world, x, y, z)) y -= 0.2;
    if (y <= bottom) break;
    const t = traceBox(world, { x, y, z }, { x, y: bottom, z }, C.PLAYER_RADIUS, THIN, C.PLAYER_RADIUS);
    if (t.fraction >= 1 || !t.normal) break;
    const floorY = t.end.y - THIN;
    if (t.normal.y >= C.GROUND_NORMAL_MIN) floors.push(floorY);
    y = floorY - 0.1;
  }
  return floors;
}

function boxClear(world, from, to, height = C.STAND_HEIGHT) {
  const hh = height / 2;
  const t = traceBox(world, { x: from.x, y: from.y + hh, z: from.z }, { x: to.x, y: to.y + hh, z: to.z }, C.PLAYER_RADIUS * 0.9, hh, C.PLAYER_RADIUS * 0.9);
  return t.fraction >= 1 && !t.startSolid;
}

function hasGroundBelow(world, p, depth) {
  const t = traceBox(world, { x: p.x, y: p.y + 0.3, z: p.z }, { x: p.x, y: p.y - depth, z: p.z }, 0.15, THIN, 0.15);
  return t.fraction < 1 && t.normal && t.normal.y >= C.GROUND_NORMAL_MIN;
}

function addLink(node, to, type, cost) {
  if (node.links.some(l => l.to === to)) return;
  node.links.push({ to, type, cost });
}

function linkNeighbors(world, nodes, grid, cols) {
  for (const node of nodes) {
    for (const [dx, dz] of NEIGHBORS) {
      const list = grid.get((node.iz + dz) * cols + node.ix + dx);
      if (!list) continue;
      for (const otherIndex of list) {
        const other = nodes[otherIndex];
        const dy = other.y - node.y;
        const flat = Math.hypot(other.x - node.x, other.z - node.z);
        if (Math.abs(dy) <= C.STEP_HEIGHT + 0.05) {
          const lift = { x: 0, y: C.STEP_HEIGHT, z: 0 };
          const a = { x: node.x, y: node.y + lift.y, z: node.z }, b = { x: other.x, y: other.y + lift.y, z: other.z };
          const mid = { x: (node.x + other.x) / 2, y: Math.max(node.y, other.y), z: (node.z + other.z) / 2 };
          if (boxClear(world, a, b, C.STAND_HEIGHT - C.STEP_HEIGHT) && hasGroundBelow(world, mid, 0.8)) addLink(node, otherIndex, "walk", flat);
        } else if (dy > 0 && dy <= MAX_JUMP_UP) {
          const up = { x: node.x, y: node.y + dy + 0.15, z: node.z };
          if (boxClear(world, { x: node.x, y: node.y + 0.05, z: node.z }, up) && boxClear(world, up, { x: other.x, y: other.y + 0.15, z: other.z })) addLink(node, otherIndex, "jump", flat + 1.5);
        } else if (dy < 0 && dy >= -MAX_DROP) {
          const over = { x: other.x, y: node.y + 0.05, z: other.z };
          if (boxClear(world, { x: node.x, y: node.y + 0.05, z: node.z }, over) && boxClear(world, over, { x: other.x, y: other.y + 0.05, z: other.z })) addLink(node, otherIndex, "drop", flat + 0.5);
        }
      }
    }
  }
}

function linkPads(world, nav, pads) {
  for (const pad of pads || []) {
    const start = nav.nearest(pad.center, 2);
    if (start < 0) continue;
    const s = createMoveState({ x: pad.center.x, y: pad.center.y + 0.02, z: pad.center.z });
    s.vel = { ...pad.velocity };
    s.padReadyAt = 1e9;
    const still = { fwd: 0, side: 0, yaw: 0, pitch: 0, buttons: 0 };
    for (let i = 0; i < 300; i++) {
      stepMovement(world, s, still, C.TICK_DT, null, null);
      if (i > 5 && s.isOnGround) break;
    }
    const landing = nav.nearest(s.pos, 3);
    if (landing < 0 || landing === start) continue;
    nav.nodes.forEach((node, index) => {
      const isInside = node.x >= pad.min.x - 0.3 && node.x <= pad.max.x + 0.3 && node.z >= pad.min.z - 0.3 && node.z <= pad.max.z + 0.3 && Math.abs(node.y - pad.center.y) < 0.5;
      if (!isInside && index !== start) return;
      node.links = [{ to: landing, type: "pad", cost: 2 }];
      node.isPad = true;
    });
  }
}

export function buildNav(world, map) {
  const nodes = [];
  const minX = world.min.x + 0.6, maxX = world.max.x - 0.6, minZ = world.min.z + 0.6, maxZ = world.max.z - 0.6;
  const cols = Math.ceil((maxX - minX) / CELL) + 1;
  const grid = new Map();
  for (let iz = 0; minZ + iz * CELL <= maxZ; iz++) {
    for (let ix = 0; minX + ix * CELL <= maxX; ix++) {
      const x = minX + ix * CELL, z = minZ + iz * CELL;
      for (const y of sampleColumn(world, x, z, map.navTop, world.min.y)) {
        const p = { x, y, z };
        if (!standingFits(world, p)) continue;
        const index = nodes.length;
        nodes.push({ x, y, z, ix, iz, links: [] });
        const key = iz * cols + ix;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(index);
      }
    }
  }
  linkNeighbors(world, nodes, grid, cols);
  const nav = {
    nodes,
    nearest(pos, maxCells = 2) {
      const cx = Math.round((pos.x - minX) / CELL), cz = Math.round((pos.z - minZ) / CELL);
      let best = -1, bestScore = Infinity;
      for (let dz = -maxCells; dz <= maxCells; dz++) {
        for (let dx = -maxCells; dx <= maxCells; dx++) {
          const list = grid.get((cz + dz) * cols + cx + dx);
          if (!list) continue;
          for (const i of list) {
            const n = nodes[i];
            const dy = n.y - pos.y;
            const score = (n.x - pos.x) ** 2 + (n.z - pos.z) ** 2 + (dy > 0.6 ? dy * dy * 9 : dy * dy * 3);
            if (score < bestScore) { bestScore = score; best = i; }
          }
        }
      }
      return best;
    },
  };
  linkPads(world, nav, map.pads);
  return nav;
}

export function findPath(nav, from, to) {
  if (from < 0 || to < 0) return null;
  if (from === to) return [to];
  const nodes = nav.nodes;
  const goal = nodes[to];
  const g = new Map([[from, 0]]);
  const came = new Map();
  const heap = [[0, from]];
  const closed = new Set();
  const push = item => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [, current] = pop();
    if (current === to) {
      const path = [to];
      let c = to;
      while (came.has(c)) { c = came.get(c); path.push(c); }
      return path.reverse();
    }
    if (closed.has(current)) continue;
    closed.add(current);
    const base = g.get(current);
    for (const link of nodes[current].links) {
      const cost = base + link.cost;
      if (cost >= (g.get(link.to) ?? Infinity)) continue;
      g.set(link.to, cost);
      came.set(link.to, current);
      const n = nodes[link.to];
      push([cost + Math.hypot(n.x - goal.x, n.y - goal.y, n.z - goal.z), link.to]);
    }
  }
  return null;
}

export function linkBetween(nav, from, to) {
  return nav.nodes[from]?.links.find(l => l.to === to) || null;
}
