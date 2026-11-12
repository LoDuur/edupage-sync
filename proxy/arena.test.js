import test from "node:test";
import assert from "node:assert/strict";
import { BUTTON, DASH_SPEED, RUN_SPEED, TICK_DT, WALLJUMP_WINDOW } from "../docs/arena/sim/constants.js";
import { box, createWorld, ramp } from "../docs/arena/sim/collision.js";
import { createMoveState, horizontalSpeed, stepMovement } from "../docs/arena/sim/movement.js";
import { WEAPONS, createArsenal, giveWeapon, updateArsenal } from "../docs/arena/sim/weapons.js";
import { addPlayer, applyDamage, createGame, fillWithBots, loadMap, sanitizeInput, stepGame, stepPlayer } from "../docs/arena/sim/game.js";
import { findPath } from "../docs/arena/sim/nav.js";

const flat = createWorld([box(-500, -1, -500, 500, 0, 500), box(5, 0, -2, 6, 0.4, 2), box(10, 0, -2, 11, 0.6, 2), box(-2, 0, 20, 2, 10, 21)]);
const input = (overrides = {}) => ({ fwd: 0, side: 0, yaw: 0, pitch: 0, buttons: 0, weapon: 0, ...overrides });

function simulate(world, state, ticks, makeInput, events = []) {
  for (let i = 0; i < ticks; i++) stepMovement(world, state, makeInput(i, state), TICK_DT, null, events);
  return state;
}

function running(speed = RUN_SPEED, yaw = 0) {
  const s = createMoveState({ x: 0, y: 0.01, z: 0 }, yaw);
  s.vel.x = -Math.sin(yaw) * speed;
  s.vel.z = -Math.cos(yaw) * speed;
  return s;
}

test("ground movement reaches run speed and stops with friction", () => {
  const s = simulate(flat, createMoveState({ x: 0, y: 0.01, z: 0 }), 120, () => input({ fwd: 1 }));
  assert.ok(Math.abs(horizontalSpeed(s) - RUN_SPEED) < 0.05);
  simulate(flat, s, 60, () => input());
  assert.ok(horizontalSpeed(s) < 0.01);
});

test("holding jump keeps momentum between hops", () => {
  const s = simulate(flat, running(), 300, () => input({ fwd: 1, buttons: BUTTON.JUMP }));
  assert.ok(horizontalSpeed(s) > RUN_SPEED - 0.01, `speed ${horizontalSpeed(s)}`);
});

test("air strafing gains speed well beyond run speed", () => {
  let dir = 1;
  const open = createWorld([box(-500, -1, -500, 500, 0, 500)]);
  const s = simulate(open, running(), 900, (i, st) => {
    if (st.isOnGround) dir = -dir;
    const speed = Math.hypot(st.vel.x, st.vel.z);
    const velYaw = Math.atan2(-st.vel.x, -st.vel.z);
    return input({ side: dir, yaw: velYaw - dir * Math.asin(Math.min(1, 0.62 / speed)), buttons: BUTTON.JUMP });
  });
  assert.ok(horizontalSpeed(s) > 14, `speed ${horizontalSpeed(s)}`);
});

test("fast movement never tunnels through walls", () => {
  const s = createMoveState({ x: 0, y: 0.01, z: 10 });
  s.vel.z = 120;
  simulate(flat, s, 30, () => input());
  assert.ok(s.pos.z < 20 - 0.34, `ended at z=${s.pos.z}`);
});

test("steps up low ledges but not tall ones", () => {
  const low = simulate(flat, createMoveState({ x: 3, y: 0.01, z: 0 }), 90, () => input({ fwd: 1, yaw: -Math.PI / 2 }));
  assert.ok(low.pos.x > 6, `low ledge x=${low.pos.x}`);
  const tall = simulate(flat, createMoveState({ x: 8, y: 0.01, z: 0 }), 90, () => input({ fwd: 1, yaw: -Math.PI / 2 }));
  assert.ok(tall.pos.x < 10, `tall ledge x=${tall.pos.x}`);
});

test("slide boosts speed and keeps it longer than walking stops", () => {
  const events = [];
  const s = simulate(flat, running(10), 1, () => input());
  simulate(flat, s, 1, () => input({ buttons: BUTTON.CROUCH }), events);
  assert.ok(events.some(e => e.type === "slide"));
  assert.ok(horizontalSpeed(s) > 10.5, `boost ${horizontalSpeed(s)}`);
  simulate(flat, s, 30, () => input({ buttons: BUTTON.CROUCH }));
  assert.ok(horizontalSpeed(s) > 7, `after 0.5s ${horizontalSpeed(s)}`);
});

test("ramp slide gains speed downhill", () => {
  const world = createWorld([box(-100, -1, -100, 100, 0, 100), ramp(-20, 0, -2, 0, 6, 2, "-x")]);
  const s = createMoveState({ x: -18, y: 5.5, z: 0 }, -Math.PI / 2);
  s.vel.x = 9;
  simulate(world, s, 8, () => input());
  const before = horizontalSpeed(s);
  simulate(world, s, 40, () => input({ buttons: BUTTON.CROUCH }));
  assert.ok(horizontalSpeed(s) > before, `${before} -> ${horizontalSpeed(s)}`);
});

test("wall jump works inside the window and not after it", () => {
  const near = createMoveState({ x: 0, y: 3, z: 19.3 });
  near.vel.z = 4;
  const events = [];
  simulate(flat, near, 4, () => input(), events);
  simulate(flat, near, 1, () => input({ buttons: BUTTON.JUMP }), events);
  assert.ok(events.some(e => e.type === "walljump"));
  assert.ok(near.vel.z < 0 && near.vel.y > 6);

  const late = createMoveState({ x: 0, y: 6, z: 19.3 });
  late.vel.z = 4;
  const lateEvents = [];
  simulate(flat, late, 3, () => input(), lateEvents);
  late.pos.z = 10;
  late.vel = { x: 0, y: 0, z: 0 };
  simulate(flat, late, Math.ceil(WALLJUMP_WINDOW / TICK_DT) + 2, () => input(), lateEvents);
  simulate(flat, late, 1, () => input({ buttons: BUTTON.JUMP }), lateEvents);
  assert.ok(!lateEvents.some(e => e.type === "walljump"));
});

test("dash keeps momentum and recharges only on the ground", () => {
  const s = running(15);
  s.pos.y = 4;
  s.isOnGround = false;
  const events = [];
  simulate(flat, s, 1, () => input({ fwd: 1, buttons: BUTTON.DASH }), events);
  assert.ok(horizontalSpeed(s) >= Math.max(DASH_SPEED, 16.9));
  simulate(flat, s, 2, () => input());
  simulate(flat, s, 1, () => input({ fwd: 1, buttons: BUTTON.DASH }), events);
  assert.equal(events.filter(e => e.type === "dash").length, 1);
});

test("jump pads launch onto the balcony", () => {
  const { map, world } = loadMap("aktuzale");
  const pad = map.pads[0];
  const s = createMoveState({ x: pad.center.x, y: 0.02, z: pad.center.z });
  for (let i = 0; i < 240 && !(i > 10 && s.isOnGround); i++) stepMovement(world, s, input(), TICK_DT, map.pads, null);
  assert.ok(s.pos.y > 4.9, `landed at y=${s.pos.y}`);
});

test("AA-12 fires full auto at its rate; pistol is semi-auto", () => {
  const ars = createArsenal(0);
  giveWeapon(ars, "aa12", 0);
  let shots = 0;
  for (let t = 0; t < 60; t++) if (updateArsenal(ars, input({ weapon: 2, buttons: BUTTON.FIRE }), 0.3 + t * TICK_DT, TICK_DT)?.spread !== undefined) shots++;
  assert.equal(shots, Math.round(1 / WEAPONS.aa12.fireInterval));
  const pistol = createArsenal(0);
  let pistolShots = 0;
  for (let t = 0; t < 60; t++) if (updateArsenal(pistol, input({ weapon: 1, buttons: BUTTON.FIRE }), 0.3 + t * TICK_DT, TICK_DT)?.spread !== undefined) pistolShots++;
  assert.equal(pistolShots, 1);
});

test("empty magazine auto-reloads from reserve", () => {
  const ars = createArsenal(0);
  giveWeapon(ars, "aa12", 0);
  ars.ammo.aa12.mag = 0;
  let time = 1;
  for (let i = 0; i < 300; i++, time += TICK_DT) updateArsenal(ars, input({ weapon: 2 }), time, TICK_DT);
  assert.equal(ars.ammo.aa12.mag, WEAPONS.aa12.magazine);
  assert.equal(ars.ammo.aa12.reserve, 0);
});

test("armor absorbs damage, kills score, spawn protection blocks damage", () => {
  const game = createGame({ seed: 3 });
  const a = addPlayer(game, { id: "a", name: "A" });
  const b = addPlayer(game, { id: "b", name: "B" });
  game.time = 5;
  assert.equal(applyDamage(game, b, a, 50, "pistol"), 50);
  b.protectedUntil = 0;
  b.armor = 60;
  applyDamage(game, b, a, 30, "pistol");
  assert.equal(b.armor, 40);
  assert.equal(b.health, 40);
  applyDamage(game, b, a, 200, "aa12");
  assert.equal(b.isAlive, false);
  assert.equal(a.kills, 1);
  assert.equal(b.deaths, 1);
  const c = addPlayer(game, { id: "c", name: "C" });
  assert.equal(applyDamage(game, c, a, 50, "pistol"), 0);
});

test("health pickups heal only when hurt and then respawn later", () => {
  const game = createGame({ seed: 4 });
  const p = addPlayer(game, { id: "p", name: "P" });
  const item = game.pickups.find(i => i.kind === "health");
  p.move.pos = { ...item.pos, y: item.pos.y + 0.02 };
  stepPlayer(game, p, input());
  assert.ok(game.time >= item.availableAt);
  p.health = 50;
  stepPlayer(game, p, input());
  assert.equal(p.health, 75);
  assert.ok(item.availableAt > game.time);
});

test("nav graph connects floor, balconies, stage and podium", () => {
  const { nav } = loadMap("aktuzale");
  const at = (x, y, z) => nav.nearest({ x, y, z }, 3);
  const floor = at(0, 0, -8);
  for (const [x, y, z] of [[0, 5, 17], [0, 5, -17], [24, 1.4, 0], [0, 2.4, 0], [-27, 5, 0]]) {
    assert.ok(findPath(nav, floor, at(x, y, z)), `no path to ${x},${y},${z}`);
    assert.ok(findPath(nav, at(x, y, z), floor), `no path back from ${x},${y},${z}`);
  }
});

test("bot soak: 8 bots fight for 3 minutes without getting stuck", () => {
  for (const difficulty of ["easy", "nightmare"]) {
    const game = createGame({ seed: 11, fragLimit: 999, timeLimit: 999 });
    fillWithBots(game, 8, difficulty);
    let kills = 0;
    const lastMoved = new Map(game.players.map(p => [p.id, { pos: { ...p.move.pos }, at: 0 }]));
    let longestStill = 0;
    for (let i = 0; i < 60 * 180; i++) {
      for (const e of stepGame(game)) if (e.type === "kill") kills++;
      for (const p of game.players) {
        const rec = lastMoved.get(p.id);
        if (!p.isAlive || Math.hypot(p.move.pos.x - rec.pos.x, p.move.pos.z - rec.pos.z) > 1.5) {
          rec.pos = { ...p.move.pos };
          rec.at = game.time;
        }
        longestStill = Math.max(longestStill, game.time - rec.at);
      }
    }
    assert.ok(kills > 30, `${difficulty}: only ${kills} kills`);
    assert.ok(longestStill < 12, `${difficulty}: a bot stood still for ${longestStill.toFixed(1)}s`);
  }
});

test("harder bots win more often against easy bots", () => {
  const game = createGame({ seed: 21, fragLimit: 999, timeLimit: 999 });
  fillWithBots(game, 3, "easy");
  fillWithBots(game, 3, "nightmare");
  for (let i = 0; i < 60 * 150; i++) stepGame(game);
  const total = level => game.players.filter(p => p.brain.difficultyId === level).reduce((n, p) => n + p.kills, 0);
  assert.ok(total("nightmare") > total("easy") * 1.3, `nightmare ${total("nightmare")} vs easy ${total("easy")}`);
});

test("sanitizeInput clamps hostile payloads", () => {
  const clean = sanitizeInput({ fwd: 50, side: 50, yaw: NaN, pitch: 9, buttons: 0xffff, weapon: 99 });
  assert.ok(Math.hypot(clean.fwd, clean.side) <= 1 + 1e-9);
  assert.equal(clean.yaw, 0);
  assert.equal(clean.pitch, 1.55);
  assert.equal(clean.buttons, 63);
  assert.equal(clean.weapon, 9);
  assert.deepEqual(sanitizeInput("nope"), { fwd: 0, side: 0, yaw: 0, pitch: 0, buttons: 0, weapon: 0 });
});
