import test from "node:test";
import assert from "node:assert/strict";
import {
  ARENA_HEIGHT, EVENT_IDS, assignTeams, createMatch, defaultSettings, predictBallY, sanitizeSettings,
  serializeMatch, setOwnerAi, startEvent, stepMatch,
} from "../docs/pingpong/sim.js";

function seededRng(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function matchBetweenAi(left, right, overrides = {}, seed = 7) {
  const settings = { ...defaultSettings(), ...overrides };
  const m = createMatch({ settings, teams: [["a"], ["b"]], rng: seededRng(seed) });
  setOwnerAi(m, "a", left);
  setOwnerAi(m, "b", right);
  return m;
}

function runToEnd(m, maxMs = 30 * 60000) {
  while (m.phase !== "over" && m.t < maxMs) {
    stepMatch(m);
    m.fx.length = 0;
  }
  return m;
}

test("classic match ends at the target score with no events", () => {
  const m = matchBetweenAi("easy", "easy", { mode: "classic", targetScore: 3 });
  let sawEvent = false;
  while (m.phase !== "over" && m.t < 600000) {
    stepMatch(m);
    sawEvent ||= m.active.length > 0;
  }
  assert.equal(m.phase, "over");
  assert.equal(Math.max(...m.scores), 3);
  assert.equal(sawEvent, false);
});

test("stronger AI beats weaker AI", () => {
  let wins = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const m = runToEnd(matchBetweenAi("unfair", "easy", { mode: "classic", targetScore: 5 }, seed));
    if (m.winner === 0) wins++;
  }
  assert.ok(wins >= 4, `unfair won only ${wins}/5`);
});

test("every event survives a full match without broken numbers", () => {
  for (const id of EVENT_IDS) {
    const m = matchBetweenAi("normal", "normal", { mode: "chaos", targetScore: 3 }, 11);
    while (m.phase === "serve") stepMatch(m);
    startEvent(m, id);
    for (let step = 0; step < 60 * 20 && m.phase !== "over"; step++) {
      stepMatch(m);
      for (const ball of m.balls) assert.ok(Number.isFinite(ball.x + ball.y + ball.vx + ball.vy), `${id} broke a ball`);
      for (const paddle of m.paddles) assert.ok(Number.isFinite(paddle.y), `${id} broke a paddle`);
      assert.doesNotThrow(() => JSON.stringify(serializeMatch(m)));
    }
  }
});

test("chaotic marathon never hangs or lets a ball escape forever", () => {
  for (let seed = 1; seed <= 4; seed++) {
    const m = runToEnd(matchBetweenAi("hard", "hard", { mode: "survival", targetScore: 11, chaotic: true, intensity: "wild" }, seed));
    assert.equal(m.phase, "over", `seed ${seed} still running at ${Math.round(m.t / 1000)}s, score ${m.scores}`);
  }
});

test("timed events run out and put the arena back", () => {
  const m = matchBetweenAi("hard", "hard", { mode: "classic", targetScore: 21 });
  while (m.phase === "serve") stepMatch(m);
  startEvent(m, "walls");
  startEvent(m, "bumpers");
  startEvent(m, "double");
  assert.ok(m.objects.bumpers.length > 0);
  for (let step = 0; step < 60 * 16; step++) stepMatch(m);
  assert.equal(m.active.length, 0);
  assert.equal(m.objects.bumpers.length, 0);
  assert.equal(m.mods.top, 0);
  assert.equal(m.mods.bottom, ARENA_HEIGHT);
  assert.ok(m.balls.filter(ball => !ball.isFake).length <= 1);
});

test("reverse scoring gives the point to the side the ball falls on", () => {
  const m = matchBetweenAi("easy", "easy", { mode: "classic", targetScore: 21 });
  while (m.phase === "serve") stepMatch(m);
  startEvent(m, "reversePong");
  stepMatch(m);
  m.paddles.forEach(paddle => { paddle.y = -1000; paddle.h = 0; paddle.ai = null; paddle.scale = 0; });
  const ball = m.balls[0];
  ball.x = 5;
  ball.vx = -300;
  ball.vy = 0;
  for (let step = 0; step < 20; step++) stepMatch(m);
  assert.deepEqual(m.scores, [1, 0]);
});

test("fake balls never score and are not distinguishable in snapshots", () => {
  const m = matchBetweenAi("easy", "easy", { mode: "classic", targetScore: 21 });
  while (m.phase === "serve") stepMatch(m);
  startEvent(m, "fake");
  assert.equal(JSON.stringify(serializeMatch(m)).includes("isFake"), false);
  m.paddles.forEach(paddle => { paddle.y = -1000; paddle.h = 0; paddle.ai = null; paddle.scale = 0; });
  m.balls = m.balls.filter(ball => ball.isFake);
  for (let step = 0; step < 60 * 4; step++) stepMatch(m);
  assert.deepEqual(m.scores, [0, 0]);
});

test("boss mode climbs difficulty as players score", () => {
  const settings = { ...defaultSettings(), mode: "boss", aiDifficulty: "easy", targetScore: 4 };
  const m = createMatch({ settings, teams: assignTeams("boss", ["a", "b"]), rng: seededRng(3) });
  assert.equal(m.paddles.filter(paddle => paddle.side === 0).length, 2);
  const boss = m.paddles.find(paddle => paddle.isBoss);
  assert.equal(boss.ai, "easy");
  m.paddles.filter(paddle => paddle.side === 1).forEach(paddle => { paddle.y = -1000; paddle.h = 0; paddle.scale = 0; paddle.ai = null; paddle.isBoss = true; });
  const ball = m.balls[0];
  m.phase = "play";
  ball.x = 795;
  ball.vx = 300;
  ball.vy = 0;
  for (let step = 0; step < 10; step++) stepMatch(m);
  assert.equal(m.scores[0], 1);
  assert.equal(m.paddles.find(paddle => paddle.isBoss).ai, "normal");
});

test("sudden death ends the match on the next point", () => {
  const m = matchBetweenAi("easy", "easy", { mode: "classic", targetScore: 21 });
  while (m.phase === "serve") stepMatch(m);
  startEvent(m, "suddenDeath");
  stepMatch(m);
  m.paddles.forEach(paddle => { paddle.y = -1000; paddle.h = 0; paddle.ai = null; paddle.scale = 0; });
  m.balls[0].x = 5;
  m.balls[0].vx = -300;
  m.balls[0].vy = 0;
  for (let step = 0; step < 20; step++) stepMatch(m);
  assert.equal(m.phase, "over");
  assert.equal(m.winner, 1);
});

test("prediction reflects off the walls", () => {
  const ball = { x: 400, y: 450, vx: 100, vy: 100 };
  const y = predictBallY(ball, 500, 0, 500);
  assert.ok(Math.abs(y - (494 - (550 - 494))) < 1, `got ${y}`);
});

test("settings from the client are whitelisted", () => {
  const base = defaultSettings();
  const next = sanitizeSettings({ mode: "constructor", targetScore: 9999, frequency: "__proto__", events: ["speed", "nope"], chaotic: "yes", aiDifficulty: "toString" }, base);
  assert.equal(next.mode, base.mode);
  assert.equal(next.targetScore, base.targetScore);
  assert.equal(next.frequency, base.frequency);
  assert.equal(next.chaotic, false);
  assert.equal(next.aiDifficulty, base.aiDifficulty);
  assert.deepEqual(next.events, ["speed"]);
});
