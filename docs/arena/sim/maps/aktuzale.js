import { box, ramp } from "../collision.js";

const SLAB = { material: "terrazzo", faces: { side: "concrete", bottom: "concrete" } };
const WALL = { material: "concrete" };
const CRATE = { material: "crate" };
const RAIL = { material: "metal" };
const PILLAR = { material: "concreteDark" };

function mirrorZ(build) {
  return [...build(1), ...build(-1)];
}

function zSpan(sign, a, b) {
  return sign > 0 ? [a, b] : [-b, -a];
}

function buildBrushes() {
  const brushes = [
    box(-31, -1, -21, 31, 0, 21, { material: "parquet", faces: { side: "concreteDark", bottom: "concreteDark" } }),
    box(-31, 0, -21, 31, 13, -20, WALL),
    box(-31, 0, 20, 31, 13, 21, WALL),
    box(-31, 0, -20, -30, 13, 20, WALL),
    box(30, 0, -20, 31, 13, 20, WALL),
    box(-31, 12, -21, 31, 13, 21, { material: "ceiling" }),

    box(18, 0, -10, 30, 1.4, 10, { material: "stage", faces: { side: "stageFront" } }),
    ramp(13, 0, -10, 18, 1.4, -6.5, "+x", { material: "stage", faces: { side: "stageFront" } }),
    ramp(13, 0, 6.5, 18, 1.4, 10, "+x", { material: "stage", faces: { side: "stageFront" } }),

    box(-30, 4.6, 14, 30, 5, 20, SLAB),
    box(-30, 4.6, -20, 30, 5, -14, SLAB),
    box(-30, 4.6, -14, -24, 5, 14, SLAB),
    ramp(-24, 0, 10, -10, 5, 13.6, "-x", SLAB),
    ramp(-24, 0, -13.6, -10, 5, -10, "-x", SLAB),

    box(-4, 0, -4, 4, 2.4, 4, { material: "tile", faces: { side: "concrete" } }),
    ramp(-11, 0, -2, -4, 2.4, 2, "+x", { material: "tile", faces: { side: "concrete" } }),
    box(1.6, 2.4, -0.45, 2.4, 3.5, 0.45, { material: "lectern" }),

    box(-17, 0, -6, -15.8, 1.2, -4.8, CRATE),
    box(-17, 0, 4.8, -15.8, 1.2, 6, CRATE),
  ];

  for (let i = 0; i < 4; i++) brushes.push(box(16 + 0.5 * i, 0, -3, 18, 0.35 * (i + 1), 3, { material: "stage", faces: { side: "stageFront" } }));

  brushes.push(...mirrorZ(sign => {
    const out = [];
    for (let i = 0; i <= 8; i++) {
      const [z1, z2] = zSpan(sign, 10 + 0.5 * i, 10.5 + 0.5 * i);
      out.push(box(26, 0, z1, 30, 1.8 + 0.4 * i, z2, { material: "stage", faces: { side: "concrete" } }));
    }
    for (const [x1, x2] of [[-24, -14], [-10, 2], [6, 18]]) {
      const [z1, z2] = zSpan(sign, 14, 14.25);
      out.push(box(x1, 5, z1, x2, 6, z2, RAIL));
    }
    for (const x of [-20, -10, 0, 10, 20]) {
      const [z1, z2] = zSpan(sign, 14.3, 15.1);
      out.push(box(x - 0.4, 0, z1, x + 0.4, 4.6, z2, PILLAR));
    }
    {
      const [z1, z2] = zSpan(sign, 11, 13);
      out.push(box(8, 0, z1, 10, 1, z2, CRATE));
      const [z3, z4] = zSpan(sign, 11.4, 12.6);
      out.push(box(8.4, 1, z3, 9.6, 2, z4, CRATE));
    }
    {
      const [z1, z2] = zSpan(sign, 12, 12.5);
      out.push(box(-6, 0, z1, -2, 1.1, z2, { material: "concreteDark" }));
    }
    return out;
  }));
  for (const [z1, z2] of [[-10, -3], [3, 10]]) brushes.push(box(-24, 5, z1, -23.75, 6, z2, RAIL));

  for (const x of [-9, 9]) for (const z of [-6, 6]) brushes.push(box(x - 0.7, 0, z - 0.7, x + 0.7, 12, z + 0.7, PILLAR));
  return brushes;
}

const SPAWNS = [
  [-26, 0, 0, -Math.PI / 2], [-20, 0, -17, -Math.PI / 2], [-20, 0, 17, -Math.PI / 2], [10, 0, -17, Math.PI / 2], [10, 0, 17, Math.PI / 2],
  [24, 1.4, 0, Math.PI / 2], [-27, 5, 0, -Math.PI / 2], [0, 5, -17, Math.PI], [0, 5, 17, 0], [20, 5, 17, Math.PI / 2],
  [20, 5, -17, Math.PI / 2], [12, 0, 0, Math.PI / 2], [-8, 0, -8, -Math.PI / 4], [-8, 0, 8, -3 * Math.PI / 4],
].map(([x, y, z, yaw]) => ({ pos: { x, y: y + 0.02, z }, yaw }));

const PICKUPS = [
  { kind: "weapon", weapon: "aa12", pos: { x: 0, y: 2.4, z: 0 } },
  { kind: "weapon", weapon: "aa12", pos: { x: -27, y: 5, z: -7 } },
  { kind: "health", amount: 25, pos: { x: -27, y: 0, z: -10 } },
  { kind: "health", amount: 25, pos: { x: -27, y: 0, z: 10 } },
  { kind: "health", amount: 25, pos: { x: 20, y: 0, z: -17.5 } },
  { kind: "health", amount: 25, pos: { x: 20, y: 0, z: 17.5 } },
  { kind: "health", amount: 25, pos: { x: 10, y: 5, z: -17.5 } },
  { kind: "health", amount: 25, pos: { x: 10, y: 5, z: 17.5 } },
  { kind: "mega", amount: 50, pos: { x: 27.5, y: 1.4, z: 0 } },
];

const PADS = [
  { center: { x: 4, y: 0, z: -12 }, velocity: { x: 0, y: 16.5, z: -3 } },
  { center: { x: 4, y: 0, z: 12 }, velocity: { x: 0, y: 16.5, z: 3 } },
].map(p => ({ ...p, min: { x: p.center.x - 0.8, y: p.center.y - 0.2, z: p.center.z - 0.8 }, max: { x: p.center.x + 0.8, y: p.center.y + 0.6, z: p.center.z + 0.8 } }));

const DECOR = [
  { kind: "timetable", pos: { x: 0, y: 8.4, z: 19.95 }, rotY: Math.PI, w: 22, h: 5.2 },
  { kind: "timetable", pos: { x: 0, y: 8.4, z: -19.95 }, rotY: 0, w: 22, h: 5.2 },
  { kind: "chalkboard", pos: { x: -29.95, y: 8.2, z: 0 }, rotY: Math.PI / 2, w: 16, h: 4.6 },
  { kind: "curtain", pos: { x: 29.9, y: 6.4, z: 0 }, rotY: -Math.PI / 2, w: 19.6, h: 10 },
  { kind: "clock", pos: { x: 29.85, y: 10.6, z: 0 }, rotY: -Math.PI / 2, r: 0.9 },
  ...[-20, -10, 0, 10, 20].flatMap(x => [{ kind: "lamp", pos: { x, y: 11.2, z: -7 } }, { kind: "lamp", pos: { x, y: 11.2, z: 7 } }]),
  ...[-18, -6, 6, 18].map(x => ({ kind: "skylight", pos: { x, y: 11.99, z: 0 }, w: 7, d: 5 })),
  { kind: "strip", from: { x: -30, y: 4.62, z: 13.98 }, to: { x: 30, y: 4.62, z: 13.98 } },
  { kind: "strip", from: { x: -30, y: 4.62, z: -13.98 }, to: { x: 30, y: 4.62, z: -13.98 } },
  { kind: "strip", from: { x: -23.98, y: 4.62, z: -14 }, to: { x: -23.98, y: 4.62, z: 14 } },
  { kind: "strip", from: { x: 18.02, y: 1.38, z: -10 }, to: { x: 18.02, y: 1.38, z: 10 } },
  { kind: "strip", from: { x: -4, y: 2.38, z: -4.02 }, to: { x: 4, y: 2.38, z: -4.02 } },
  { kind: "strip", from: { x: -4, y: 2.38, z: 4.02 }, to: { x: 4, y: 2.38, z: 4.02 } },
  ...[-26, -16, -6, 4, 14, 24].flatMap(x => [{ kind: "window", pos: { x, y: 2.6, z: 19.98 }, rotY: Math.PI, w: 3.2, h: 3.4 }, { kind: "window", pos: { x, y: 2.6, z: -19.98 }, rotY: 0, w: 3.2, h: 3.4 }]),
];

const LIGHTS = [
  { pos: { x: 24, y: 7, z: 0 }, color: 0xffd9a0, intensity: 60, distance: 22 },
  { pos: { x: 0, y: 7, z: 0 }, color: 0xdfe9ff, intensity: 45, distance: 22 },
  { pos: { x: -20, y: 7, z: 0 }, color: 0xdfe9ff, intensity: 45, distance: 22 },
  { pos: { x: -6, y: 3.6, z: 17 }, color: 0x6fe0a8, intensity: 18, distance: 14 },
  { pos: { x: -6, y: 3.6, z: -17 }, color: 0x6fe0a8, intensity: 18, distance: 14 },
  { pos: { x: 12, y: 9, z: 17 }, color: 0xffc27a, intensity: 22, distance: 16 },
  { pos: { x: 12, y: 9, z: -17 }, color: 0xffc27a, intensity: 22, distance: 16 },
];

export const AKTUZALE = {
  id: "aktuzale",
  name: "Aktu zāle",
  description: "Skatuve, balkoni un lēcienu paliktņi. Ātri apļi caur rampām.",
  buildBrushes,
  spawns: SPAWNS,
  pickups: PICKUPS,
  pads: PADS,
  decor: DECOR,
  lights: LIGHTS,
  sun: { dir: { x: -0.35, y: -1, z: 0.2 }, color: 0xfff1dc, intensity: 1.6 },
  navTop: 11.5,
  fogColor: 0x1d1f22,
};
