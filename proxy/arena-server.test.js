import test from "node:test";
import assert from "node:assert/strict";
import { ArenaServer, TICK_MS } from "./arena-server.js";
import { BUTTON } from "../docs/arena/sim/constants.js";
import { PROTOCOL_VERSION, packInput, unpackArsenal, unpackMove } from "../docs/arena/sim/protocol.js";
import { createArsenal } from "../docs/arena/sim/weapons.js";
import { createMoveState, stepMovement } from "../docs/arena/sim/movement.js";
import { updateArsenal } from "../docs/arena/sim/weapons.js";
import { TICK_DT } from "../docs/arena/sim/constants.js";

function room(settings = { bots: 2 }) {
  const inbox = new Map();
  const closed = new Map();
  let now = 1000;
  const server = new ArenaServer({
    code: "ABC23", settings, now,
    send: (socket, message) => inbox.get(socket).push(typeof message === "string" ? message : JSON.parse(JSON.stringify(message))),
    close: (socket, code, reason) => closed.set(socket, { code, reason }),
    random: (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(),
  });
  const join = (name = "Anna", extra = {}) => {
    const socket = { name };
    inbox.set(socket, []);
    server.connect(socket, now);
    server.receive(socket, JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, name, ...extra }), now);
    return socket;
  };
  const advance = ms => { now += ms; return server.update(now); };
  const messages = (socket, type) => inbox.get(socket).filter(m => m.t === type);
  return { server, join, advance, messages, inbox, closed, get now() { return now; } };
}

test("players get a welcome with id, token and the room roster", () => {
  const r = room();
  const anna = r.join("Anna <b>");
  const [welcome] = r.messages(anna, "welcome");
  assert.equal(welcome.code, "ABC23");
  assert.match(welcome.token, /^[0-9a-f]{32}$/);
  assert.ok(welcome.players.some(p => p[0] === welcome.id && p[1] === "Anna b"));
  assert.equal(welcome.players.filter(p => p[2] === 1).length, 2);
});

test("inputs are acknowledged and move the player on the server", () => {
  const r = room({ bots: 0 });
  const anna = r.join();
  const { id } = r.messages(anna, "welcome")[0];
  r.server.game.players.find(p => p.id === id).move.pos = { x: -20, y: 0.02, z: 9 };
  const start = { ...r.server.game.players.find(p => p.id === id).move.pos };
  for (let seq = 0; seq < 120; seq += 4) {
    const frames = [0, 1, 2, 3].map(i => packInput(seq + i, { fwd: 1, side: 0, yaw: 0, pitch: 0, buttons: 0, weapon: 1 }, 0));
    r.server.receive(anna, JSON.stringify({ t: "in", f: frames }), r.now);
    r.advance(TICK_MS * 4 + 0.1);
  }
  const snaps = r.messages(anna, "s");
  assert.ok(snaps.length > 20);
  assert.ok(snaps.at(-1).a >= 100, `ack ${snaps.at(-1).a}`);
  const end = r.server.game.players.find(p => p.id === id).move.pos;
  assert.ok(Math.hypot(end.x - start.x, end.z - start.z) > 10, "player did not move");
});

test("client prediction from a snapshot replays to the same state as the server", () => {
  const r = room({ bots: 0 });
  const anna = r.join();
  const { id } = r.messages(anna, "welcome")[0];
  const inputs = [];
  for (let seq = 0; seq < 200; seq++) inputs.push({ fwd: 1, side: seq % 40 < 20 ? 1 : -1, yaw: seq * 0.01, pitch: 0, buttons: seq % 30 < 5 ? BUTTON.JUMP : 0, weapon: 1 });
  for (let seq = 0; seq < 200; seq += 4) {
    r.server.receive(anna, JSON.stringify({ t: "in", f: [0, 1, 2, 3].map(i => packInput(seq + i, inputs[seq + i], 0)) }), r.now);
    r.advance(TICK_MS * 4 + 0.1);
  }
  const snap = r.messages(anna, "s").find(s => s.a >= 100);
  const move = unpackMove(snap.me.mv, createMoveState({ x: 0, y: 0, z: 0 }));
  const ars = unpackArsenal(snap.me.ar, createArsenal(0));
  const { world, map } = r.server.game;
  for (let seq = snap.a + 1; seq < 200; seq++) {
    const unpacked = JSON.parse(JSON.stringify(packInput(seq, inputs[seq], 0)));
    const input = { fwd: unpacked[1], side: unpacked[2], yaw: unpacked[3] % (Math.PI * 2), pitch: unpacked[4], buttons: unpacked[5], weapon: unpacked[6] };
    stepMovement(world, move, input, TICK_DT, map.pads, null);
    updateArsenal(ars, input, move.time, TICK_DT);
  }
  const server = r.server.game.players.find(p => p.id === id).move;
  assert.ok(Math.hypot(server.pos.x - move.pos.x, server.pos.y - move.pos.y, server.pos.z - move.pos.z) < 1e-6);
});

test("bots fill the room and make space for humans", () => {
  const r = room({ bots: 7 });
  const sockets = [r.join("A"), r.join("B"), r.join("C")];
  const game = r.server.game;
  assert.equal(game.players.length, 8);
  assert.equal(game.players.filter(p => !p.isBot).length, 3);
  assert.ok(r.messages(sockets[0], "leave").length >= 2);
});

test("the seventh human is turned away", () => {
  const r = room({ bots: 0 });
  for (let i = 0; i < 6; i++) r.join(`P${i}`);
  const late = r.join("Late");
  assert.equal(r.messages(late, "error")[0].code, "full");
  assert.equal(r.closed.get(late).code, 4002);
});

test("malformed, oversized and replayed input batches are ignored", () => {
  const r = room({ bots: 0 });
  const anna = r.join();
  const human = [...r.server.humans.values()][0];
  r.server.receive(anna, JSON.stringify({ t: "in", f: "nope" }), r.now);
  r.server.receive(anna, JSON.stringify({ t: "in", f: Array.from({ length: 40 }, (_, i) => packInput(i, { fwd: 1, side: 0, yaw: 0, pitch: 0, buttons: 0, weapon: 1 }, 0)) }), r.now);
  assert.equal(human.queue.length, 0);
  r.server.receive(anna, JSON.stringify({ t: "in", f: [packInput(5, { fwd: 99, side: -99, yaw: 1e9, pitch: 7, buttons: 0xffff, weapon: 1 }, 0), [4, 0, 0, 0, 0, 0, 1, 0], ["x"]] }), r.now);
  assert.equal(human.queue.length, 1);
  const frame = human.queue[0];
  assert.ok(Math.hypot(frame.input.fwd, frame.input.side) <= 1 + 1e-9);
  assert.equal(frame.input.pitch, 1.55);
  assert.equal(frame.input.buttons, 63);
  r.server.receive(anna, "x".repeat(7000), r.now);
  assert.equal(r.messages(anna, "error").at(-1).code, "too_large");
});

test("message flood is rate limited", () => {
  const r = room({ bots: 0 });
  const anna = r.join();
  const human = [...r.server.humans.values()][0];
  for (let i = 0; i < 300; i++) r.server.receive(anna, JSON.stringify({ t: "in", f: [packInput(i, { fwd: 1, side: 0, yaw: 0, pitch: 0, buttons: 0, weapon: 1 }, 0)] }), r.now);
  assert.ok(human.queue.length < 100, `queued ${human.lastSeq}`);
  assert.ok(human.lastSeq < 100);
});

test("lag compensation: a shot aimed where the target was on screen hits", () => {
  const r = room({ bots: 0 });
  const shooterSocket = r.join("Shooter", { loadout: "sniper" });
  const targetSocket = r.join("Target");
  const game = r.server.game;
  const [shooter, target] = game.players;
  shooter.protectedUntil = target.protectedUntil = 0;
  shooter.move.pos = { x: -20, y: 0.02, z: 8 };
  target.move.pos = { x: -20, y: 0.02, z: -6 };
  r.advance(TICK_MS * 30 + 0.1);
  const seenTick = game.tick;
  target.move.pos = { x: -16, y: 0.02, z: -6 };
  r.advance(TICK_MS * 6 + 0.1);
  shooter.arsenal.state = "ready";
  const aimed = { fwd: 0, side: 0, yaw: 0, pitch: Math.atan2(1.2 - 1.62, 14), buttons: BUTTON.FIRE | BUTTON.ALT, weapon: 5 };
  const ready = { ...aimed, buttons: BUTTON.ALT };
  const frames = [packInput(0, ready, seenTick), packInput(1, aimed, seenTick), packInput(2, aimed, seenTick)];
  r.server.receive(shooterSocket, JSON.stringify({ t: "in", f: frames }), r.now);
  void targetSocket;
  const before = target.health;
  r.advance(TICK_MS * 4 + 0.1);
  assert.ok(target.health < before || !target.isAlive, `target health ${target.health}`);
});

test("finished matches restart with everyone still in the room", () => {
  const r = room({ bots: 1, fragLimit: 5 });
  const anna = r.join();
  const game = r.server.game;
  const me = game.players.find(p => !p.isBot);
  me.kills = 4;
  const bot = game.players.find(p => p.isBot);
  bot.protectedUntil = 0;
  bot.health = 1;
  game.time = 10;
  game.events.length = 0;
  me.move.time = 5;
  r.advance(TICK_MS + 0.1);
  bot.health = 1;
  bot.isAlive = true;
  bot.protectedUntil = 0;
  me.kills = 5;
  me.deaths = 0;
  game.isOver = false;
  game.fragLimit = 5;
  r.server.game.time = game.timeLimit + 1;
  r.advance(TICK_MS + 0.1);
  assert.equal(r.messages(anna, "end").length, 1);
  r.advance(13000);
  r.advance(TICK_MS + 0.1);
  const welcomes = r.messages(anna, "welcome");
  assert.equal(welcomes.length, 2);
  assert.notEqual(r.server.game, game);
  assert.ok(r.server.game.players.some(p => p.name === "Anna"));
});

test("an empty room closes after a minute and a reconnect keeps the player", () => {
  const r = room({ bots: 0 });
  const anna = r.join();
  const { token, id } = r.messages(anna, "welcome")[0];
  r.server.disconnect(anna, r.now);
  r.advance(5000);
  const again = r.join("Anna", { token });
  assert.equal(r.messages(again, "welcome")[0].id, id);
  r.server.disconnect(again, r.now);
  assert.equal(r.advance(20000), true);
  assert.equal(r.server.humans.size, 0);
  assert.equal(r.advance(61000), false);
});
