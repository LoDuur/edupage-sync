import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTHORITATIVE_EFFECTS, ARENA_HEIGHT, EVENT_IDS, MODES, STEP_MS, applyInput, assignTeams, createMatch, defaultSettings, encodeMatchState, predictBallY, restoreMatch,
  sanitizeInput, sanitizeSettings, serializeMatch, setOwnerAi, startEvent, stepMatch,
} from "../docs/pingpong/sim.js";
import { MatchPredictor } from "../docs/pingpong/predict.js";

function matchBetweenAi(left, right, overrides = {}, seed = 7) {
  const settings = { ...defaultSettings(), ...overrides };
  const m = createMatch({ settings, teams: [["a"], ["b"]], seed });
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
  const m = createMatch({ settings, teams: assignTeams("boss", ["a", "b"]), seed: 3 });
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

function networkRig({ rttMs, jitterMs = 0, seed = 5, settings = { ...defaultSettings(), mode: "classic", targetScore: 5 }, teams = [["me"], ["them"]] }) {
  let jitterState = seed;
  const nextJitter = () => {
    jitterState = (jitterState * 1664525 + 1013904223) >>> 0;
    return jitterState / 4294967296 * jitterMs;
  };
  const server = createMatch({ settings, teams, seed });
  const client = new MatchPredictor({ me: "me", settings });
  const rig = { server, client, now: 0, toClient: [], toServer: [], history: new Map(), acked: 0, serverClock: 0, lastSyncAt: -1000, pendingInputs: [], localInputs: [], effects: [], nextPingAt: 0 };
  const latency = () => rttMs / 2 + nextJitter();
  rig.deliver = () => {
    for (const message of rig.toServer.filter(item => item.at <= rig.now)) {
      if (message.ping !== undefined) rig.toClient.push({ at: rig.now + latency(), pong: message.ping, step: server.step });
      else rig.pendingInputs.push(message.entry);
    }
    rig.toServer = rig.toServer.filter(item => item.at > rig.now);
    for (const message of rig.toClient.filter(item => item.at <= rig.now)) {
      if (message.pong !== undefined) client.observePong(message.pong, message.step, rig.now);
      else client.ingestSync(JSON.parse(message.state), message.acks, rig.now);
    }
    rig.toClient = rig.toClient.filter(item => item.at > rig.now);
  };
  rig.serverStep = () => {
    const next = server.step + 1;
    rig.pendingInputs = rig.pendingInputs.filter(entry => {
      if (entry.step > next) return true;
      applyInput(server, entry.owner, entry.input);
      rig.acked = entry.seq;
      return false;
    });
    stepMatch(server);
    rig.history.set(server.step, server.balls.filter(ball => !ball.isFake).map(ball => ({ id: ball.id, x: ball.x, y: ball.y })));
    const isImportant = server.fx.some(effect => AUTHORITATIVE_EFFECTS.has(effect[0]));
    server.fx.length = 0;
    if (isImportant || rig.now - rig.lastSyncAt >= 200 || server.phase === "over") {
      rig.lastSyncAt = rig.now;
      rig.toClient.push({ at: rig.now + latency(), state: encodeMatchState(server), acks: { me: rig.acked } });
    }
  };
  rig.frame = gather => {
    if (rig.now >= rig.nextPingAt) {
      rig.nextPingAt = rig.now + 250;
      rig.toServer.push({ at: rig.now + latency(), ping: rig.now });
    }
    client.advance(rig.now, gather, entry => rig.toServer.push({ at: rig.now + latency(), entry }));
  };
  rig.run = (ms, { gather = () => [], onFrame = () => {} } = {}) => {
    const endAt = rig.now + ms;
    while (rig.now < endAt && server.phase !== "over") {
      rig.now += STEP_MS;
      rig.deliver();
      rig.serverStep();
      rig.frame(gather);
      onFrame();
    }
  };
  rig.toClient.push({ at: 0, state: encodeMatchState(server), acks: { me: 0 } });
  return rig;
}

test("local paddle responds on the very next step despite a 200 ms round trip", () => {
  const rig = networkRig({ rttMs: 200 });
  rig.run(1000);
  const myPaddle = () => rig.client.match.paddles.find(paddle => paddle.owner === "me");
  const startY = myPaddle().y;
  let isPressed = false;
  rig.run(STEP_MS * 3, { gather: () => (isPressed ? [] : (isPressed = true, [{ dir: 1 }])) });
  assert.ok(myPaddle().y > startY, "paddle should already have moved");
  assert.equal(rig.server.paddles.find(paddle => paddle.owner === "me").y, ARENA_HEIGHT / 2, "server has not heard yet");
});

test("server agrees with the predicted paddle once input arrives", () => {
  const rig = networkRig({ rttMs: 150, jitterMs: 40 });
  rig.run(1000);
  let frames = 0;
  rig.run(1200, { gather: () => (frames++ === 0 ? [{ target: 80 }] : []) });
  const predicted = rig.client.match.paddles.find(paddle => paddle.owner === "me").y;
  const authoritative = rig.server.paddles.find(paddle => paddle.owner === "me").y;
  assert.ok(Math.abs(predicted - authoritative) < 1, `${predicted} vs ${authoritative}`);
  assert.equal(rig.client.log.length, 0, "acked inputs are pruned");
});

test("predicted ball matches the server timeline and never jumps on screen", () => {
  for (const [rttMs, jitterMs] of [[40, 5], [120, 40], [250, 80]]) {
    const rig = networkRig({ rttMs, jitterMs, settings: { ...defaultSettings(), mode: "classic", targetScore: 3 } });
    setOwnerAi(rig.server, "them", "hard");
    setOwnerAi(rig.server, "me", "hard");
    let lastView = null;
    let largestJump = 0;
    let largestError = 0;
    let frames = 0;
    rig.run(20000, {
      onFrame() {
        const m = rig.client.match;
        if (!m) return;
        frames++;
        const view = rig.client.view();
        const ball = view.balls[0];
        if (m.phase === "play" && ball && lastView?.id === ball[0] && lastView.phase === "play") {
          largestJump = Math.max(largestJump, Math.hypot(ball[1] - lastView.x, ball[2] - lastView.y));
        }
        lastView = ball ? { id: ball[0], x: ball[1], y: ball[2], phase: m.phase } : null;
        const truth = rig.history.get(m.step)?.[0];
        const predicted = m.balls[0];
        if (truth && predicted && truth.id === predicted.id && !predicted.isHeld) largestError = Math.max(largestError, Math.hypot(truth.x - predicted.x, truth.y - predicted.y));
      },
    });
    assert.ok(frames > 100);
    assert.ok(largestJump < 60, `rtt ${rttMs}: ball jumped ${largestJump}px in one frame`);
    assert.ok(largestError < 60, `rtt ${rttMs}: prediction off by ${largestError}px`);
  }
});

test("scores only change when the server says so", () => {
  const rig = networkRig({ rttMs: 160, jitterMs: 30, settings: { ...defaultSettings(), mode: "classic", targetScore: 3 } });
  setOwnerAi(rig.server, "them", "easy");
  setOwnerAi(rig.server, "me", "easy");
  rig.run(60000, {
    onFrame() {
      const local = rig.client.match?.scores;
      if (local) assert.ok(local[0] <= rig.server.scores[0] && local[1] <= rig.server.scores[1], `${local} ahead of ${rig.server.scores}`);
    },
  });
  rig.now += 500;
  rig.deliver();
  rig.client.advance(rig.now, () => [], () => {});
  assert.equal(rig.server.phase, "over");
  assert.deepEqual(rig.client.match.scores, rig.server.scores);
  assert.equal(rig.client.match.phase, "over");
});

test("match state survives the wire and keeps simulating", () => {
  const settings = { ...defaultSettings(), mode: "chaos" };
  const m = createMatch({ settings, teams: [["a"], ["b"]], seed: 9 });
  setOwnerAi(m, "a", "hard");
  setOwnerAi(m, "b", "hard");
  for (let step = 0; step < 60 * 5; step++) stepMatch(m);
  startEvent(m, "suddenDeath");
  stepMatch(m);
  const restored = restoreMatch(JSON.parse(encodeMatchState(m)), settings);
  assert.equal(restored.nextEventAt > 0, true);
  assert.equal(restored.active[0].endsAt > 1e11, true);
  const originalRoll = m.rng();
  assert.equal(restored.rng(), originalRoll, "random stream continues identically");
  for (let step = 0; step < 120; step++) stepMatch(restored);
  assert.equal(restored.phase === "play" || restored.phase === "serve", true);
  assert.equal(restored.scores.join(), m.scores.join(), "prediction never scores on its own");
});

function humanMatch(mode, extra = {}, seed = 4) {
  const settings = { ...defaultSettings(), mode, ...extra };
  return createMatch({ settings, teams: assignTeams(mode, ["a", "b"]), seed });
}

test("2FA locks the paddle until the right answer and then ends", () => {
  const m = humanMatch("classic", { targetScore: 21 });
  while (m.phase === "serve") stepMatch(m);
  startEvent(m, "twofa");
  stepMatch(m);
  const paddle = m.paddles.find(candidate => candidate.owner === "a");
  const other = m.paddles.find(candidate => candidate.owner === "b");
  const startY = paddle.y;
  applyInput(m, "a", { dir: 1 });
  stepMatch(m);
  assert.equal(paddle.y, startY, "disabled while challenged");
  applyInput(m, "a", { answer: paddle.challenge.answer === "1" ? "2" : "1" });
  assert.ok(paddle.challenge, "wrong answer keeps it locked");
  assert.equal(paddle.challenge.wrong, 1);
  applyInput(m, "a", { answer: paddle.challenge.answer });
  assert.equal(paddle.challenge, null);
  stepMatch(m);
  assert.ok(paddle.y > startY, "moves again");
  assert.ok(m.active.some(ev => ev.id === "twofa"), "other player still locked");
  applyInput(m, "b", { answer: other.challenge.answer });
  stepMatch(m);
  assert.equal(m.active.some(ev => ev.id === "twofa"), false, "ends as soon as everyone passed");
});

test("2FA always times out instead of locking a player forever", () => {
  const m = humanMatch("classic", { targetScore: 21 });
  while (m.phase === "serve") stepMatch(m);
  startEvent(m, "twofa");
  m.paddles.forEach(paddle => { paddle.h = 0; paddle.scale = 0; });
  for (let step = 0; step < 60 * 9; step++) stepMatch(m);
  assert.equal(m.active.some(ev => ev.id === "twofa"), false);
  assert.ok(m.paddles.every(paddle => paddle.challenge === null));
});

test("spam makes paddles fall and presses hold them up", () => {
  const m = humanMatch("classic", { targetScore: 21 });
  while (m.phase === "serve") stepMatch(m);
  startEvent(m, "spam");
  stepMatch(m);
  const idle = m.paddles.find(candidate => candidate.owner === "a");
  const busy = m.paddles.find(candidate => candidate.owner === "b");
  for (let step = 0; step < 60 * 2; step++) {
    if (step % 6 === 0) applyInput(m, "b", { spam: true });
    stepMatch(m);
  }
  assert.ok(idle.y >= ARENA_HEIGHT - idle.h / 2 - 1, `idle paddle fell to ${idle.y}`);
  assert.ok(busy.y < idle.y - 100, `busy paddle stayed up at ${busy.y}`);
  for (let step = 0; step < 60 * 7; step++) stepMatch(m);
  assert.equal(m.mods.spam, false);
  assert.ok(m.paddles.every(paddle => paddle.fall === 0));
});

test("spam presses are ignored outside the event and rate limited inside it", () => {
  const m = humanMatch("classic", { targetScore: 21 });
  stepMatch(m);
  const paddle = m.paddles.find(candidate => candidate.owner === "a");
  const startY = paddle.y;
  applyInput(m, "a", { spam: true });
  assert.equal(paddle.y, startY);
  while (m.phase === "serve") stepMatch(m);
  startEvent(m, "spam");
  stepMatch(m);
  const before = paddle.y;
  applyInput(m, "a", { spam: true });
  applyInput(m, "a", { spam: true });
  applyInput(m, "a", { spam: true });
  assert.ok(before - paddle.y < 30, "only one press counts per window");
});

test("bass boost is a timed flag that clears itself", () => {
  const m = humanMatch("classic", { targetScore: 21 });
  while (m.phase === "serve") stepMatch(m);
  startEvent(m, "bassBoost");
  stepMatch(m);
  assert.equal(m.mods.bassBoost, true);
  m.paddles.forEach(paddle => { paddle.h = 0; paddle.scale = 0; });
  for (let step = 0; step < 60 * 9; step++) stepMatch(m);
  assert.equal(m.mods.bassBoost, false);
});

test("King Terry takes over, runs every attack, can be defeated and restores the arena", () => {
  const m = matchBetweenAi("hard", "hard", { mode: "chaos", targetScore: 21, frequency: "off" });
  while (m.phase === "serve") stepMatch(m);
  startEvent(m, "speed");
  startEvent(m, "kingTerry");
  assert.ok(m.boss);
  assert.equal(m.active.some(ev => ev.id === "speed"), false, "other events are cleared");
  assert.equal(m.balls.length, 0, "intro has no ball");
  const seenAttacks = new Set();
  let previousHp = m.boss.hp;
  const scoresAtStart = [...m.scores];
  for (let step = 0; step < 60 * 70 && m.boss; step++) {
    if (m.boss.phase === "fight" && step % 240 === 0 && step > 400) {
      m.balls[0] && Object.assign(m.balls[0], { x: m.boss.x - 40, y: m.boss.y, vx: 300, vy: 0, lastSide: 0 });
    }
    stepMatch(m);
    if (!m.boss) break;
    if (m.boss.attack) seenAttacks.add(m.boss.attack.id);
    assert.ok(m.boss.hp <= previousHp);
    previousHp = m.boss.hp;
    assert.ok(m.boss.hazards.length <= 48);
    for (const hazard of m.boss.hazards) assert.ok(Number.isFinite(hazard.x + hazard.y));
  }
  assert.equal(m.boss, null, "encounter finished");
  assert.ok(seenAttacks.size >= 4, `saw ${[...seenAttacks]}`);
  assert.equal(m.active.some(ev => ev.id === "kingTerry"), false);
  assert.equal(m.objects.obstacles.length, 0);
  assert.ok(m.scores[0] + m.scores[1] >= scoresAtStart[0] + scoresAtStart[1]);
  while (m.phase === "serve") stepMatch(m);
  for (let step = 0; step < 5; step++) stepMatch(m);
  assert.equal(m.mods.top, 0);
  assert.equal(m.mods.bottom, ARENA_HEIGHT);
  assert.equal(m.mods.lowRes, false);
});

test("a predicting client cannot defeat a boss on its own", () => {
  const settings = { ...defaultSettings(), mode: "bossRush" };
  const server = createMatch({ settings, teams: [["a"], []], seed: 2 });
  while (server.boss.phase === "intro") stepMatch(server);
  const m = restoreMatch(JSON.parse(encodeMatchState(server)), settings);
  m.boss.hp = 1;
  m.boss.invulnerableUntil = 0;
  m.balls[0] && Object.assign(m.balls[0], { x: m.boss.x - m.boss.w, y: m.boss.y, vx: 400, vy: 0 });
  for (let step = 0; step < 20; step++) stepMatch(m);
  assert.equal(m.boss.phase, "fight");
  assert.equal(m.boss.hp, 1);
});

test("boss rush walks through all three bosses and ends", () => {
  const m = createMatch({ settings: { ...defaultSettings(), mode: "bossRush" }, teams: [["a"], []], seed: 8 });
  setOwnerAi(m, "a", "unfair");
  assert.equal(m.lives, 5);
  assert.equal(m.paddles.length, 1, "no opponent paddle");
  const seen = new Set();
  for (let step = 0; step < 60 * 60 * 15 && m.phase !== "over"; step++) {
    if (m.boss) seen.add(m.boss.id);
    if (m.boss?.phase === "fight" && step % 90 === 0 && m.balls[0]) Object.assign(m.balls[0], { x: m.boss.x - 60, y: m.boss.y, vx: 300, vy: 0, lastSide: 0, isGrabbed: false });
    stepMatch(m);
    m.fx.length = 0;
  }
  assert.equal(m.phase, "over");
  assert.ok(seen.has("golem"));
  if (m.winner === 0) {
    assert.deepEqual([...seen], ["golem", "johnPrime", "terry"]);
    assert.equal(m.scores[0], 3);
  } else {
    assert.equal(m.lives, 0);
  }
});

test("rush loses when shared lives run out", () => {
  const m = createMatch({ settings: { ...defaultSettings(), mode: "bossRush" }, teams: [["a"], []], seed: 8 });
  m.paddles.forEach(paddle => { paddle.y = -1000; paddle.h = 0; paddle.scale = 0; });
  for (let step = 0; step < 60 * 60 * 5 && m.phase !== "over"; step++) stepMatch(m);
  assert.equal(m.phase, "over");
  assert.equal(m.winner, 1);
  assert.equal(m.lives, 0);
});

test("john challenge climbs the ladder on wins and stops on a loss", () => {
  const m = createMatch({ settings: { ...defaultSettings(), mode: "johnChallenge" }, teams: [["a"], []], seed: 6 });
  const john = m.paddles.find(paddle => paddle.owner === null);
  assert.equal(john.ai, "easy");
  assert.equal(m.target, 3);
  const score = side => {
    while (m.phase === "serve") stepMatch(m);
    m.paddles.forEach(paddle => { paddle.y = -1000; paddle.h = 0; paddle.scale = 0; });
    m.balls[0].x = side === 0 ? 795 : 5;
    m.balls[0].vx = side === 0 ? 400 : -400;
    m.balls[0].vy = 0;
    for (let step = 0; step < 10 && m.scores[side] !== undefined; step++) stepMatch(m);
  };
  for (let goal = 0; goal < 3; goal++) score(0);
  assert.equal(m.johnLevel, 1);
  assert.equal(john.ai, "normal");
  assert.deepEqual(m.scores, [0, 0]);
  assert.notEqual(m.phase, "over");
  for (let goal = 0; goal < 3; goal++) score(1);
  assert.equal(m.phase, "over");
  assert.equal(m.winner, 1);
});

test("last paddle standing eliminates down to one champion", () => {
  const m = createMatch({ settings: { ...defaultSettings(), mode: "lastStanding", frequency: "off" }, teams: assignTeams("lastStanding", ["a", "b"]), seed: 3 });
  setOwnerAi(m, "a", "easy");
  setOwnerAi(m, "b", "unfair");
  assert.equal(m.paddles.length, 3, "John fills the arena");
  assert.ok(m.paddles.every(paddle => paddle.lives === 3));
  for (let step = 0; step < 60 * 60 * 20 && m.phase !== "over"; step++) {
    stepMatch(m);
    m.fx.length = 0;
    const sides = new Set(m.paddles.map(paddle => paddle.side));
    if (m.paddles.length >= 2) assert.equal(sides.size, 2, "survivors always face each other");
  }
  assert.equal(m.phase, "over");
  assert.ok(m.champion);
  assert.equal(m.paddles.length, 1);
});

test("team relay lets a paddle sit out until its teammate has hit", () => {
  const m = createMatch({ settings: { ...defaultSettings(), mode: "team" }, teams: assignTeams("team", ["a", "b"]), seed: 3 });
  assert.equal(m.paddles.filter(paddle => paddle.side === 0).length, 2, "John joins the team");
  assert.equal(m.paddles.filter(paddle => paddle.side === 1).length, 2);
  while (m.phase === "serve") stepMatch(m);
  const front = m.paddles.find(paddle => paddle.owner === "a");
  m.relay[0] = front.id;
  const ball = m.balls[0];
  Object.assign(ball, { x: front.x + 14, y: front.y, vx: -300, vy: 0 });
  m.paddles.filter(paddle => paddle !== front).forEach(paddle => { paddle.y = -1000; paddle.h = 0; paddle.scale = 0; paddle.ai = null; });
  stepMatch(m);
  stepMatch(m);
  assert.ok(ball.vx < 0, "cooled paddle lets the ball through");
});

test("abilities respect their cooldown and swap after use", () => {
  const m = createMatch({ settings: { ...defaultSettings(), mode: "ability" }, teams: [["a"], ["b"]], seed: 3 });
  const paddle = m.paddles.find(candidate => candidate.owner === "a");
  assert.ok(paddle.ability);
  stepMatch(m);
  applyInput(m, "a", { ability: true });
  const readyAt = paddle.abilityReadyAt;
  assert.ok(readyAt > m.t);
  stepMatch(m);
  applyInput(m, "a", { ability: true });
  assert.equal(paddle.abilityReadyAt, readyAt, "second press is ignored during cooldown");
});

test("every mode plays to a finish with broken-number and serialization checks", () => {
  for (const mode of Object.keys(MODES)) {
    const ids = ["a", "b", "c"];
    const teams = assignTeams(mode, ids);
    const m = createMatch({ settings: { ...defaultSettings(), mode, targetScore: 3 }, teams, seed: 12 });
    for (const id of ids) setOwnerAi(m, id, "normal");
    let step = 0;
    for (; step < 60 * 60 * 25 && m.phase !== "over"; step++) {
      stepMatch(m);
      m.fx.length = 0;
      if (step % 37 === 0) {
        for (const ball of m.balls) assert.ok(Number.isFinite(ball.x + ball.y + ball.vx + ball.vy), `${mode} ball`);
        for (const paddle of m.paddles) assert.ok(Number.isFinite(paddle.y + paddle.h), `${mode} paddle`);
        const copy = restoreMatch(JSON.parse(encodeMatchState(m)), m.settings);
        stepMatch(copy);
        assert.doesNotThrow(() => JSON.stringify(serializeMatch(copy)));
      }
    }
    assert.equal(m.phase, "over", `${mode} never finished at ${Math.round(m.t / 1000)}s, score ${m.scores}`);
  }
});

test("john pong has moods and taunts through the authoritative channel", () => {
  const m = createMatch({ settings: { ...defaultSettings(), mode: "classic", targetScore: 21 }, teams: [["a"], []], seed: 3 });
  const john = m.paddles.find(paddle => paddle.owner === null);
  assert.ok(john.john);
  assert.ok(m.fx.some(effect => effect[0] === "john"), "announces joining");
  m.fx.length = 0;
  while (m.phase === "serve") stepMatch(m);
  m.nextTauntAt = 0;
  m.paddles.forEach(paddle => { if (paddle.owner) { paddle.y = -1000; paddle.h = 0; paddle.scale = 0; } });
  m.balls[0].x = 5;
  m.balls[0].vx = -300;
  m.balls[0].vy = 0;
  for (let step = 0; step < 10; step++) stepMatch(m);
  assert.equal(m.scores[1], 1);
  assert.equal(john.john.mood, "cocky");
  const predicted = restoreMatch(JSON.parse(encodeMatchState(m)), m.settings);
  predicted.nextTauntAt = 0;
  predicted.nextIdleTauntAt = 0;
  for (let step = 0; step < 60; step++) stepMatch(predicted);
  assert.equal(predicted.fx.some(effect => effect[0] === "taunt"), false, "clients never invent taunts");
});

test("input from the wire is whitelisted", () => {
  assert.deepEqual(sanitizeInput({ dir: 1, spam: true }), { dir: 1 });
  assert.deepEqual(sanitizeInput({ target: 99999 }), { target: ARENA_HEIGHT });
  assert.deepEqual(sanitizeInput({ answer: "1234" }), { answer: "1234" });
  assert.equal(sanitizeInput({ answer: "<script>" }), null);
  assert.equal(sanitizeInput({ dir: 7 }), null);
  assert.equal(sanitizeInput({ y: 100, score: 99 }), null);
  assert.equal(sanitizeInput(null), null);
});
