export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 500;
export const PADDLE_WIDTH = 12;
export const PADDLE_HEIGHT = 84;
export const PADDLE_SPEED = 460;
export const BALL_SIZE = 12;
export const STEP_MS = 1000 / 60;
export const MAX_PLAYERS = 8;
export const SCORE_OPTIONS = [3, 5, 7, 11, 15, 21];
export const JOHN_ID = "john";
export const AUTHORITATIVE_EFFECTS = new Set(["score", "event", "bonus", "boss", "taunt", "john", "bossIntro", "bossDown", "drop", "level", "rules", "heart", "out"]);

const NEVER = 1e12;

const PADDLE_INSET = 26;
const LANE_GAP = 30;
const TEAM_PADDLE_SCALE = [1, 0.85, 0.7, 0.6];
const BOSS_PADDLE_SCALE = 1.3;
const PADDLE_HIT_GRACE = 5;
const BALL_START_SPEED = 340;
const BALL_MAX_SPEED = 860;
const RALLY_GROWTH = 1.04;
const MAX_BOUNCE_ANGLE = Math.PI / 3;
const MIN_HORIZONTAL_SHARE = 0.4;
const MAX_SUBSTEP_PX = 5;
const FIRST_SERVE_MS = 3200;
const SERVE_MS = 1200;
const FIRST_EVENT_DELAY_MS = 8000;
const PORTAL_RADIUS = 56;
const PORTAL_MIN_NET_DISTANCE = 90;
const METEOR_INTERVAL_MS = 950;
const METEOR_WARN_MS = 1000;
const METEOR_SPEED = 640;
const METEOR_RADIUS = 14;
const METEOR_BLAST_RADIUS = 58;
const METEOR_LAST_SPAWN_MS = 1700;
const METEOR_KNOCK_PX = 34;
const METEOR_BALL_LOCK_MS = 300;
const FREE_MOVE_EDGE = 8;
const FREE_MOVE_NET_GAP = 40;
const HOME_SLIDE_SCALE = 1.5;
const PORTAL_LOCK_MS = 500;
const BOX_SIZE = 28;
const OBJECT_MARGIN_X = 170;
const OBJECT_MARGIN_Y = 60;
const OBJECT_CENTER_CLEARANCE = 70;
const SPAM_FALL_ACCEL = 900;
const SPAM_MAX_FALL = 420;
const SPAM_LIFT_PX = 24;
const SPAM_MIN_PRESS_MS = 50;
const TWOFA_AI_SOLVE_MS = [1200, 3600];
const TAUNT_COOLDOWN_MS = 4500;
const IDLE_TAUNT_MS = [14000, 26000];
const MOOD_MS = 6000;
const LATE_LUNGE_S = 0.38;
const WRONG_WAY_MS = 320;
const BOSS_INTRO_MS = 4200;
const BOSS_DEFEAT_MS = 3400;
const BOSS_LEAVE_MS = 2200;
const BOSS_EVENT_MAX_MS = 75000;
const BOSS_EVENT_MIN_MATCH_MS = 40000;
const BOSS_RELAUNCH_MS = 1000;
const BOSS_HIT_INVULNERABLE_MS = 500;
const BOSS_MATCH_POINT_MARGIN = 1;
const RUSH_BOSS_X = 610;
const RUSH_LIVES = 5;
const MAX_HAZARDS = 48;
const STUN_MS = 650;
const ABILITY_COOLDOWN_MS = 9000;
const RULE_INTERVAL_MS = 15000;
const LAST_STANDING_LIVES = 3;
const LAST_STANDING_MIN_PADDLES = 3;

export const AI_LEVELS = {
  easy: { label: "Viegls", reactMs: 420, errorPx: 60, speed: 0.55, predicts: false, seesFakes: false, blunderChance: 0.18, trickChance: 0, lateChance: 0, spamMs: 240 },
  normal: { label: "Normāls", reactMs: 200, errorPx: 30, speed: 0.8, predicts: false, seesFakes: false, blunderChance: 0.07, trickChance: 0.1, lateChance: 0.1, spamMs: 150 },
  hard: { label: "Grūts", reactMs: 90, errorPx: 16, speed: 1, predicts: true, seesFakes: false, blunderChance: 0.02, trickChance: 0.3, lateChance: 0.2, spamMs: 100 },
  unfair: { label: "Negodīgs", reactMs: 16, errorPx: 3, speed: 1.7, predicts: true, seesFakes: true, blunderChance: 0, trickChance: 0.5, lateChance: 0.3, spamMs: 60 },
};
const AI_LADDER = Object.keys(AI_LEVELS);

export const FREQUENCIES = {
  off: { label: "Izslēgti", range: null },
  rare: { label: "Reti", range: [30000, 45000] },
  normal: { label: "Vidēji", range: [18000, 30000] },
  often: { label: "Bieži", range: [10000, 18000] },
};

export const INTENSITIES = {
  mild: { label: "Maigi", strength: 0.7 },
  normal: { label: "Normāli", strength: 1 },
  wild: { label: "Traki", strength: 1.35 },
};

export const EVENT_GROUPS = { ball: "Bumba", player: "Spēlētāji", arena: "Arēna", wild: "Trakumi" };

const randomBetween = (m, low, high) => low + m.rng() * (high - low);
const randomSide = m => (m.rng() < 0.5 ? 0 : 1);
const affectsSide = (ev, side) => ev.side === null || ev.side === side;

function eachSide(ev, apply) {
  for (const side of [0, 1]) if (affectsSide(ev, side)) apply(side);
}

function spawnPosition(m, isClear) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const x = randomBetween(m, OBJECT_MARGIN_X, ARENA_WIDTH - OBJECT_MARGIN_X);
    const y = randomBetween(m, OBJECT_MARGIN_Y, ARENA_HEIGHT - OBJECT_MARGIN_Y);
    const isNearCenter = Math.hypot(x - ARENA_WIDTH / 2, y - ARENA_HEIGHT / 2) < OBJECT_CENTER_CLEARANCE;
    const isNearBoss = m.boss && Math.abs(x - m.boss.x) < 110;
    if (!isNearCenter && !isNearBoss && isClear(x, y)) return { x, y };
  }
  return null;
}

function spawnBumpers(m, count) {
  const bumpers = [];
  for (let index = 0; index < count; index++) {
    const radius = randomBetween(m, 18, 30);
    const spot = spawnPosition(m, (x, y) => bumpers.every(other => Math.hypot(x - other.x, y - other.y) > radius + other.r + 30));
    if (spot) bumpers.push({ x: Math.round(spot.x), y: Math.round(spot.y), r: Math.round(radius) });
  }
  return bumpers;
}

function spawnObstacles(m, count) {
  const obstacles = [];
  for (let index = 0; index < count; index++) {
    const w = Math.round(randomBetween(m, 14, 26));
    const h = Math.round(randomBetween(m, 40, 90));
    const spot = spawnPosition(m, (x, y) => obstacles.every(other => Math.abs(x - other.x) > 70 || Math.abs(y - other.y) > 110));
    if (spot) obstacles.push({ x: Math.round(spot.x - w / 2), y: Math.round(spot.y - h / 2), w, h });
  }
  return obstacles;
}

const MYSTERY_REWARDS = [
  (m, side) => startEvent(m, "giant", { side }),
  (m, side) => startEvent(m, "tiny", { side: 1 - side }),
  (m, side) => startEvent(m, "frozen", { side: 1 - side }),
  (m, side) => startEvent(m, "speedy", { side }),
  (m, side) => startEvent(m, "confusion", { side: 1 - side }),
  m => startEvent(m, "double"),
  (m, side) => {
    m.fx.push(["bonus", side]);
    awardPoint(m, side);
  },
];

const EVENT_LIST = [
  {
    id: "speed", group: "ball", label: "Ātrums!", info: "Bumba kļūst daudz ātrāka", weight: 10, duration: 9000, slot: "ballSpeed",
    mod(mods, ev) { mods.ballSpeed *= 1 + 0.55 * ev.strength; },
  },
  {
    id: "slow", group: "ball", label: "Palēninājums", info: "Bumba kustas kā caur medu", weight: 10, duration: 7000, slot: "ballSpeed",
    mod(mods, ev) { mods.ballSpeed /= 1 + 0.9 * ev.strength; },
  },
  {
    id: "ghost", group: "ball", label: "Spoka bumba", info: "Bumba kļūst gandrīz neredzama", weight: 8, duration: 9000,
    mod(mods) { mods.ghost = true; },
  },
  {
    id: "double", group: "ball", label: "Dubultas nepatikšanas", info: "Parādās vēl viena bumba", weight: 8, duration: 12000,
    start(m, ev) {
      const count = Math.max(1, Math.round(ev.strength));
      for (let index = 0; index < count; index++) launchBall(m, randomSide(m), { isExtra: true });
    },
    end(m) {
      const realBalls = m.balls.filter(ball => !ball.isFake);
      const keeper = realBalls.find(ball => !ball.isExtra) || realBalls[0];
      m.balls = m.balls.filter(ball => ball.isFake || ball === keeper);
      if (keeper) keeper.isExtra = false;
    },
  },
  {
    id: "curve", group: "ball", label: "Līkā bumba", info: "Bumba lido pa līkni", weight: 8, duration: 9000,
    mod(mods, ev) { mods.curve = 1.3 * ev.strength; },
  },
  {
    id: "heavy", group: "ball", label: "Smagā bumba", info: "Lēna, krīt lejup un atsitas neprognozējami", weight: 6, duration: 9000, slot: "ballSpeed",
    mod(mods, ev) {
      mods.ballSpeed *= 0.7;
      mods.gravity += 300 * ev.strength;
      mods.deflectNoise = 0.5 * ev.strength;
    },
  },
  {
    id: "reverse", group: "ball", label: "Atpakaļgaita", info: "Bumba pēkšņi maina virzienu", weight: 6, duration: 0, shake: 1,
    start(m) {
      for (const ball of m.balls) {
        ball.vx = -ball.vx;
        ball.lastSide = null;
      }
    },
  },
  {
    id: "ai", group: "player", label: "John Pong ielaužas", info: "Spēlē uz brīdi iesaistās John Pong", weight: 6, duration: 14000,
    canStart: m => m.settings.aiEnabled,
    start(m, ev) {
      const weakerSide = m.scores[0] === m.scores[1] ? randomSide(m) : (m.scores[0] < m.scores[1] ? 0 : 1);
      ev.side = weakerSide;
      const lane = m.paddles.filter(paddle => paddle.side === weakerSide).length;
      ev.paddleId = addPaddle(m, { side: weakerSide, lane, ai: m.settings.aiDifficulty }).id;
    },
    end(m, ev) { m.paddles = m.paddles.filter(paddle => paddle.id !== ev.paddleId); },
  },
  {
    id: "tiny", group: "player", label: "Sīkās raketes", info: "Raketes saraujas", weight: 9, duration: 10000, slot: "paddleSize",
    mod(mods, ev) { eachSide(ev, side => { mods.paddleScale[side] /= 1 + 0.8 * ev.strength; }); },
  },
  {
    id: "giant", group: "player", label: "Milzu raketes", info: "Raketes izaug milzīgas", weight: 9, duration: 10000, slot: "paddleSize",
    mod(mods, ev) { eachSide(ev, side => { mods.paddleScale[side] *= 1 + 0.7 * ev.strength; }); },
  },
  {
    id: "confusion", group: "player", label: "Apjukums", info: "Vadība apgriežas otrādi", weight: 8, duration: 8000, slot: "control",
    mod(mods, ev) { eachSide(ev, side => { mods.invert[side] = true; }); },
  },
  {
    id: "speedy", group: "player", label: "Ātrās rokas", info: "Raketes kustas daudz ātrāk", weight: 9, duration: 10000, slot: "paddleSpeed",
    mod(mods, ev) { eachSide(ev, side => { mods.paddleSpeed[side] *= 1 + 0.7 * ev.strength; }); },
  },
  {
    id: "frozen", group: "player", label: "Sasalis!", info: "Vienas puses raketes uz brīdi sasalst", weight: 7, duration: strength => 2200 * strength, slot: "control",
    start(m, ev) { ev.side ??= randomSide(m); },
    mod(mods, ev) { mods.frozen[ev.side] = true; },
  },
  {
    id: "walls", group: "arena", label: "Kustīgās sienas", info: "Augšas un apakšas sienas sāk kustēties", weight: 7, duration: 11000, slot: "walls",
    mod(mods, ev, m) {
      const elapsed = m.t - ev.startedAt;
      const fade = Math.min(1, elapsed / 1000, (ev.endsAt - m.t) / 1000);
      const reach = Math.min(110, 70 * ev.strength) * fade;
      const phase = elapsed / 1000 * 1.8;
      mods.top = reach * (0.5 - 0.5 * Math.cos(phase));
      mods.bottom = ARENA_HEIGHT - reach * (0.5 - 0.5 * Math.cos(phase + 1.4));
    },
  },
  {
    id: "blackout", group: "arena", label: "Tumsa", info: "Daļa arēnas pazūd tumsā", weight: 7, duration: 8000,
  },
  {
    id: "gravity", group: "arena", label: "Gravitāte", info: "Gravitācija maina virzienu", weight: 7, duration: 10000,
    mod(mods, ev, m) {
      const direction = Math.sin((m.t - ev.startedAt) / 800 + ev.seed * 6) >= 0 ? 1 : -1;
      mods.gravity += 300 * ev.strength * direction;
      mods.gravityDirection = direction;
    },
  },
  {
    id: "bumpers", group: "arena", label: "Bumperu trakums", info: "Arēnā parādās atsperīgi bumperi", weight: 7, duration: 14000, slot: "arenaObjects",
    start(m, ev) { m.objects.bumpers = spawnBumpers(m, 3 + Math.round(ev.strength)); },
    end(m) { m.objects.bumpers = []; },
  },
  {
    id: "portal", group: "arena", label: "Portāli", info: "Divi portāli teleportē bumbu", weight: 6, duration: 14000, slot: "arenaObjects",
    start(m) {
      const first = spawnPosition(m, x => x < ARENA_WIDTH / 2 - PORTAL_MIN_NET_DISTANCE) || { x: 240, y: 120 };
      const second = spawnPosition(m, x => x > ARENA_WIDTH / 2 + PORTAL_MIN_NET_DISTANCE) || { x: 560, y: 380 };
      m.objects.portals = [first, second].map(spot => ({ x: Math.round(spot.x), y: Math.round(spot.y), r: PORTAL_RADIUS }));
    },
    end(m) { m.objects.portals = []; },
  },
  {
    id: "obstacles", group: "arena", label: "Šķēršļu josla", info: "Vidū izaug šķēršļi", weight: 6, duration: 14000, slot: "arenaObjects",
    start(m, ev) { m.objects.obstacles = spawnObstacles(m, 3 + Math.round(ev.strength)); },
    end(m) { m.objects.obstacles = []; },
  },
  {
    id: "mystery", group: "wild", label: "Noslēpuma kaste", info: "Kas pirmais trāpa kastei, saņem pārsteigumu", weight: 8, duration: 12000,
    start(m) {
      const spot = spawnPosition(m, () => true) || { x: 300, y: 150 };
      m.objects.box = { x: Math.round(spot.x), y: Math.round(spot.y), s: BOX_SIZE };
    },
    end(m) { m.objects.box = null; },
  },
  {
    id: "fake", group: "wild", label: "Viltus bumba", info: "Viena no bumbām ir mānekle", weight: 7, duration: 10000,
    start(m, ev) {
      const count = Math.max(1, Math.round(ev.strength));
      for (let index = 0; index < count; index++) launchBall(m, randomSide(m), { isFake: true });
    },
    end(m) { m.balls = m.balls.filter(ball => !ball.isFake); },
  },
  {
    id: "quake", group: "wild", label: "Zemestrīce", info: "Arēna nodreb un bumba maina kursu", weight: 6, duration: 1400, shake: 3,
    start(m, ev) {
      for (const ball of m.balls) {
        rotateVelocity(ball, randomBetween(m, -0.8, 0.8) * ev.strength);
        keepHorizontal(ball);
      }
    },
  },
  {
    id: "flip", group: "wild", label: "Kājām gaisā", info: "Visa arēna apgriežas otrādi", weight: 4, duration: 8000,
    avoids: ["spam", "meteor"],
    mod(mods) { mods.flip = true; },
  },
  {
    id: "reversePong", group: "wild", label: "Otrādi!", info: "Punktu dabū tas, kura pusē bumba iekrīt", weight: 4, duration: 14000, shake: 1,
    mod(mods) { mods.reverseScoring = true; },
  },
  {
    id: "king", group: "wild", label: "Kalna karalis", info: "Viena puse saņem priekšrocību, līdz otra gūst punktu", weight: 5, duration: 12000, slot: "king",
    start(m, ev) { ev.side = randomSide(m); },
    mod(mods, ev) {
      mods.paddleScale[ev.side] *= 1.5;
      mods.paddleSpeed[ev.side] *= 1.25;
    },
  },
  {
    id: "suddenDeath", group: "wild", label: "Pēkšņā nāve", info: "Nākamais punkts uzvar, un arēna kļūst arvien trakāka", weight: 2, duration: NEVER, shake: 3,
    canStart: m => Math.max(...m.scores) >= m.target - 2,
    mod(mods, ev, m) {
      mods.ballSpeed *= Math.min(1.8, 1 + (m.t - ev.startedAt) / 25000);
      mods.suddenDeath = true;
    },
  },
  {
    id: "bassBoost", group: "wild", label: "Bass Boost", info: "Skaļums 1000%. Skaņa atgriežas, kad notikums beidzas", weight: 6, duration: 8000, shake: 2,
    mod(mods) { mods.bassBoost = true; },
  },
  {
    id: "twofa", group: "player", label: "2FA", info: "Ievadi kodu, citādi rakete nekustas", weight: 6, duration: 7500, slot: "control",
    start(m) {
      for (const paddle of m.paddles) paddle.challenge = makeChallenge(m);
    },
    tick(m, ev) {
      if (!m.paddles.some(paddle => paddle.challenge)) ev.endsAt = m.t;
    },
    mod(mods) { mods.twofa = true; },
    end(m) {
      for (const paddle of m.paddles) paddle.challenge = null;
    },
  },
  {
    id: "spam", group: "player", label: "Spam!", info: "Raketes krīt. Spied atstarpi, peli vai ekrānu, lai tās noturētu", weight: 7, duration: 8000, slot: "control", avoids: ["flip"],
    mod(mods) { mods.spam = true; },
    end(m) {
      for (const paddle of m.paddles) paddle.fall = 0;
    },
  },
  {
    id: "meteor", group: "arena", label: "Meteorīti", info: "No debesīm krīt meteorīti. Skaties uz brīdinājumiem un bēdz", weight: 7, duration: 13000, shake: 1, avoids: ["flip"],
    start(m, ev) { ev.nextMeteorAt = m.t + 300; },
    tick(m, ev) {
      if (m.t < ev.nextMeteorAt || m.t > ev.endsAt - METEOR_LAST_SPAWN_MS) return;
      ev.nextMeteorAt = m.t + METEOR_INTERVAL_MS / ev.strength;
      spawnMeteor(m);
    },
    end(m) { m.meteors = []; },
  },
  {
    id: "freeMove", group: "player", label: "Brīvā kustība", info: "Raketes var kustēties arī pa kreisi un pa labi", weight: 7, duration: 12000, slot: "control",
    canStart: m => m.settings.mode !== "free2d",
    mod(mods) { mods.free2d = true; },
  },
  {
    id: "kingTerry", group: "wild", label: "King Terry Davis", info: "Boss pārņem arēnu. Kopīgi sitiet viņu ar bumbu un izvairieties no uzbrukumiem", weight: 2, duration: NEVER, shake: 3,
    canStart: m => m.t >= BOSS_EVENT_MIN_MATCH_MS && !m.boss && !MODES[m.settings.mode].blocksBossEvent && !m.mods.suddenDeath && Math.max(...m.scores) < m.target - BOSS_MATCH_POINT_MARGIN,
    start(m) {
      for (const running of [...m.active]) endEvent(m, running);
      startBoss(m, "terry");
    },
    end(m) { clearBoss(m); },
  },
];

function spawnMeteor(m) {
  const { top, bottom } = m.mods;
  const paddle = m.paddles.length && m.rng() < 0.6 ? m.paddles[Math.floor(m.rng() * m.paddles.length)] : null;
  const targetX = paddle ? paddle.x + PADDLE_WIDTH / 2 + randomBetween(m, -24, 24) : randomBetween(m, 90, ARENA_WIDTH - 90);
  const rawTargetY = paddle ? paddle.y + randomBetween(m, -30, 30) : randomBetween(m, top + 60, bottom - 30);
  const targetY = Math.max(top + METEOR_RADIUS, Math.min(bottom - METEOR_RADIUS, rawTargetY));
  const startX = targetX + randomBetween(m, -70, 70);
  const startY = -METEOR_RADIUS * 2;
  const warnUntil = m.t + METEOR_WARN_MS;
  m.meteors.push({
    id: ++m.nextId, x: startX, y: startY, startX, startY, targetX, targetY, warnUntil,
    landsAt: warnUntil + (targetY - startY) / METEOR_SPEED * 1000, r: METEOR_RADIUS, blast: METEOR_BLAST_RADIUS,
  });
  m.fx.push(["meteorWarn"]);
}

function distanceToPaddle(paddle, x, y) {
  const nearestX = Math.max(paddle.x, Math.min(paddle.x + PADDLE_WIDTH, x));
  const nearestY = Math.max(paddle.y - paddle.h / 2, Math.min(paddle.y + paddle.h / 2, y));
  return Math.hypot(x - nearestX, y - nearestY);
}

function meteorStrikesPaddle(m, paddle, meteor) {
  if (m.t < paddle.stunUntil) return;
  paddle.stunUntil = m.t + STUN_MS;
  paddle.y += paddle.y < meteor.y ? -METEOR_KNOCK_PX : METEOR_KNOCK_PX;
  johnSay(m, paddle, "meteor", 0.4);
}

function meteorStrikesBall(m, ball) {
  if (m.t < ball.meteorLockUntil) return;
  ball.meteorLockUntil = m.t + METEOR_BALL_LOCK_MS;
  rotateVelocity(ball, randomBetween(m, 0.5, 1) * (m.rng() < 0.5 ? -1 : 1));
  keepHorizontal(ball);
  m.fx.push(["meteorHit", Math.round(ball.x), Math.round(ball.y)]);
}

function explodeMeteor(m, meteor) {
  const { x, y, blast } = meteor;
  m.meteors = m.meteors.filter(other => other !== meteor);
  m.fx.push(["meteorImpact", Math.round(x), Math.round(y)]);
  for (const paddle of m.paddles) if (distanceToPaddle(paddle, x, y) <= blast) meteorStrikesPaddle(m, paddle, meteor);
  for (const ball of m.balls) if (!ball.isHeld && !ball.isGrabbed && Math.hypot(ball.x - x, ball.y - y) <= blast) meteorStrikesBall(m, ball);
  m.objects.obstacles = m.objects.obstacles.filter(block => Math.hypot(block.x + block.w / 2 - x, block.y + block.h / 2 - y) > blast);
  m.objects.bumpers = m.objects.bumpers.filter(bumper => Math.hypot(bumper.x - x, bumper.y - y) > blast);
}

function updateMeteors(m) {
  for (const meteor of [...m.meteors]) {
    if (m.t < meteor.warnUntil) continue;
    const progress = Math.min(1, (m.t - meteor.warnUntil) / (meteor.landsAt - meteor.warnUntil));
    meteor.x = meteor.startX + (meteor.targetX - meteor.startX) * progress;
    meteor.y = meteor.startY + (meteor.targetY - meteor.startY) * progress;
    const isTouchingPaddle = m.paddles.some(paddle => distanceToPaddle(paddle, meteor.x, meteor.y) <= meteor.r);
    if (progress >= 1 || isTouchingPaddle) {
      explodeMeteor(m, meteor);
      continue;
    }
    for (const ball of m.balls) {
      if (!ball.isHeld && !ball.isGrabbed && Math.hypot(ball.x - meteor.x, ball.y - meteor.y) <= meteor.r + BALL_SIZE / 2) meteorStrikesBall(m, ball);
    }
  }
}

const TWOFA_WORDS = ["bumba", "rakete", "trijstūris"];

function randomDigits(m, count) {
  let digits = "";
  for (let index = 0; index < count; index++) digits += Math.floor(m.rng() * 10);
  return digits;
}

function makeChallenge(m) {
  const aiSolveAt = m.t + randomBetween(m, TWOFA_AI_SOLVE_MS[0], TWOFA_AI_SOLVE_MS[1]);
  const roll = m.rng();
  if (roll < 0.35) {
    const shown = randomDigits(m, 4);
    return { kind: "code", shown, answer: shown, aiSolveAt, wrong: 0 };
  }
  if (roll < 0.6) {
    const shown = randomDigits(m, 3);
    return { kind: "reverse", shown, answer: [...shown].reverse().join(""), aiSolveAt, wrong: 0 };
  }
  if (roll < 0.8) {
    const first = 2 + Math.floor(m.rng() * 8);
    const second = 2 + Math.floor(m.rng() * 8);
    return { kind: "math", shown: `${first} + ${second}`, answer: String(first + second), aiSolveAt, wrong: 0 };
  }
  const options = [...TWOFA_WORDS];
  for (let index = options.length - 1; index > 0; index--) {
    const swapWith = Math.floor(m.rng() * (index + 1));
    [options[index], options[swapWith]] = [options[swapWith], options[index]];
  }
  const picked = Math.floor(m.rng() * options.length);
  return { kind: "pick", shown: options[picked], options, answer: String(picked + 1), aiSolveAt, wrong: 0 };
}

function answerChallenge(m, paddle, answer) {
  if (!paddle.challenge) return;
  if (answer === paddle.challenge.answer) {
    paddle.challenge = null;
    m.fx.push(["twofaOk", paddle.id]);
    return;
  }
  paddle.challenge.wrong++;
  m.fx.push(["twofaBad", paddle.id]);
}

const CHIP_COUNT = 8;

function spawnHazard(m, boss, x, y, vx, vy, kind, r = 8) {
  if (boss.hazards.length >= MAX_HAZARDS) return;
  boss.hazards.push({ id: ++m.nextId, x, y, vx, vy, r, kind, chip: Math.floor(m.rng() * CHIP_COUNT) });
}

function aimAtRandomPaddle(m, boss, speed, spread = 30) {
  const targets = m.paddles;
  const target = targets[Math.floor(m.rng() * targets.length)];
  if (!target) return null;
  const dx = target.x - boss.x;
  const dy = target.y + randomBetween(m, -spread, spread) - boss.y;
  const distance = Math.hypot(dx, dy) || 1;
  return { vx: dx / distance * speed, vy: dy / distance * speed };
}

function isPastAttackInterval(atk, m, intervalMs) {
  if (m.t < atk.nextShotAt) return false;
  atk.nextShotAt = m.t + intervalMs;
  return true;
}

function fireAimedShot(m, boss, atk, intervalMs, speed, kind) {
  if (!isPastAttackInterval(atk, m, intervalMs)) return;
  const velocity = aimAtRandomPaddle(m, boss, speed);
  if (velocity) spawnHazard(m, boss, boss.x, boss.y, velocity.vx, velocity.vy, kind);
}

function fireRing(m, boss, atk, count, speed) {
  atk.spin = (atk.spin ?? 0) + 0.55;
  const gapStart = Math.floor(m.rng() * count);
  for (let index = 0; index < count; index++) {
    const distanceFromGap = (index - gapStart + count) % count;
    if (distanceFromGap < 3) continue;
    const angle = atk.spin + index / count * Math.PI * 2;
    spawnHazard(m, boss, boss.x, boss.y, Math.cos(angle) * speed, Math.sin(angle) * speed, "ring", 7);
  }
}

function removeBossBalls(m) {
  const hasOwnRealBall = m.balls.some(ball => !ball.fromBoss && !ball.isFake);
  let hasKeeper = hasOwnRealBall;
  m.balls = m.balls.filter(ball => {
    if (!ball.fromBoss) return true;
    if (ball.isFake || hasKeeper) return false;
    hasKeeper = true;
    ball.fromBoss = false;
    ball.isExtra = false;
    return true;
  });
}

function launchFromBoss(m, boss, options) {
  const ball = launchBall(m, m.rush ? 0 : randomSide(m), { ...options });
  ball.x = boss.x;
  ball.y = boss.y;
  ball.fromBoss = true;
  return ball;
}

const ATTACKS = {
  holyC: {
    ms: 4600,
    tick(m, boss, atk) { fireAimedShot(m, boss, atk, 480 - boss.stage * 80, 210 + boss.stage * 50, "code"); },
  },
  ring0: {
    ms: 3900,
    tick(m, boss, atk) {
      if (isPastAttackInterval(atk, m, 1150 - boss.stage * 170)) fireRing(m, boss, atk, 12 + boss.stage * 2, 150 + boss.stage * 30);
    },
  },
  temple: {
    ms: 6500,
    start(m, boss) { m.objects.obstacles = spawnObstacles(m, 2 + boss.stage); },
    end(m) { m.objects.obstacles = []; },
  },
  redSea: {
    ms: 6400,
    mod(mods, m, boss, atk) {
      const elapsed = m.t - atk.startedAt;
      const fade = Math.max(0, Math.min(1, elapsed / 900, (atk.endsAt - m.t) / 700));
      const corridor = 250 - boss.stage * 20;
      const center = ARENA_HEIGHT / 2 + Math.sin(elapsed / 900 + atk.seed * 6) * (ARENA_HEIGHT - corridor) * 0.32;
      mods.top = (center - corridor / 2) * fade;
      mods.bottom = ARENA_HEIGHT - (ARENA_HEIGHT - center - corridor / 2) * fade;
      mods.redSea = true;
    },
  },
  sixteen: {
    ms: 6000,
    start(m, boss) {
      for (let index = 0; index < boss.stage; index++) launchFromBoss(m, boss, { isFake: true });
      if (boss.stage >= 3) launchFromBoss(m, boss, { isExtra: true });
    },
    mod(mods) { mods.palette = true; },
    end(m) { removeBossBalls(m); },
  },
  oracle: {
    ms: 4200,
    start(m, boss, atk) {
      const ball = m.balls.find(candidate => !candidate.isFake);
      if (!ball) return;
      ball.isGrabbed = true;
      atk.ballId = ball.id;
    },
    tick(m, boss, atk) {
      const ball = m.balls.find(candidate => candidate.id === atk.ballId);
      if (!ball || !ball.isGrabbed) return;
      if (m.t - atk.startedAt < 1300) {
        ball.x += (boss.x - ball.x) * 0.09;
        ball.y += (boss.y - ball.y) * 0.09;
        return;
      }
      const velocity = aimAtRandomPaddle(m, boss, Math.min(BALL_MAX_SPEED, 420 + boss.stage * 70), 40);
      ball.isGrabbed = false;
      ball.lastSide = null;
      if (velocity) {
        ball.vx = velocity.vx;
        ball.vy = velocity.vy;
        keepHorizontal(ball);
      }
      m.fx.push(["oracle", Math.round(ball.x), Math.round(ball.y)]);
    },
    end(m) { releaseGrabbedBalls(m); },
  },
  lowres: {
    ms: 5400,
    mod(mods, m, boss) {
      mods.lowRes = true;
      if (boss.stage >= 3) mods.ghost = true;
    },
  },
  rockfall: {
    ms: 5000,
    tick(m, boss, atk) {
      if (!isPastAttackInterval(atk, m, 460 - boss.stage * 70)) return;
      const target = m.paddles[Math.floor(m.rng() * m.paddles.length)];
      const x = target ? target.x + randomBetween(m, -40, 40) : randomBetween(m, 60, ARENA_WIDTH - 60);
      spawnHazard(m, boss, Math.max(20, Math.min(ARENA_WIDTH - 20, x)), -10, 0, 230 + boss.stage * 40, "rock", 11);
    },
  },
  pillars: {
    ms: 6000,
    start(m, boss) { m.objects.obstacles = spawnObstacles(m, 3 + boss.stage); },
    end(m) { m.objects.obstacles = []; },
  },
  stomp: {
    ms: 3600,
    start(m) {
      m.fx.push(["stomp"]);
      for (const ball of m.balls) {
        rotateVelocity(ball, randomBetween(m, -0.7, 0.7));
        keepHorizontal(ball);
      }
    },
    mod(mods, m, boss, atk) {
      const reach = 90 * Math.max(0, Math.min(1, (m.t - atk.startedAt) / 500, (atk.endsAt - m.t) / 500));
      mods.top = reach;
      mods.bottom = ARENA_HEIGHT - reach;
    },
  },
  tauntVolley: {
    ms: 4400,
    tick(m, boss, atk) { fireAimedShot(m, boss, atk, 520 - boss.stage * 80, 230 + boss.stage * 40, "word"); },
  },
  tripleServe: {
    ms: 6500,
    start(m, boss) {
      for (let index = 0; index < 2; index++) launchFromBoss(m, boss, { isExtra: true });
    },
    end(m) { removeBossBalls(m); },
  },
  mirror: {
    ms: 4200,
    mod(mods) { mods.invert = [true, true]; },
  },
};

const BOSSES = {
  golem: { hp: 6, w: 76, h: 92, hover: 60, restMs: 2600, attacks: [["rockfall", 1], ["pillars", 1], ["stomp", 2]] },
  johnPrime: { hp: 8, w: 40, h: 130, hover: 130, restMs: 2200, attacks: [["tauntVolley", 1], ["tripleServe", 1], ["mirror", 2], ["ring0", 2]] },
  terry: { hp: 12, w: 64, h: 84, hover: 90, restMs: 1900, attacks: [["holyC", 1], ["ring0", 1], ["temple", 1], ["redSea", 2], ["sixteen", 2], ["oracle", 3], ["lowres", 3]] },
};

const RUSH_ORDER = ["golem", "johnPrime", "terry"];

function startBoss(m, id) {
  const def = BOSSES[id];
  m.balls = [];
  m.objects = { bumpers: [], obstacles: [], portals: [], box: null };
  m.boss = {
    id, hp: def.hp, maxHp: def.hp, phase: "intro", phaseEndsAt: m.t + BOSS_INTRO_MS, stage: 1,
    x: m.rush ? RUSH_BOSS_X : ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, w: def.w, h: def.h, startedAt: m.t,
    attack: null, lastAttack: null, seen: [], nextAttackAt: 0, relaunchAt: 0, invulnerableUntil: 0, hazards: [], tally: [0, 0],
  };
  m.fx.push(["bossIntro", id]);
}

function releaseGrabbedBalls(m) {
  for (const ball of m.balls) ball.isGrabbed = false;
}

function endBossAttack(m, boss) {
  if (!boss.attack) return;
  ATTACKS[boss.attack.id].end?.(m, boss, boss.attack);
  boss.attack = null;
}

function clearBoss(m) {
  if (!m.boss) return;
  endBossAttack(m, m.boss);
  removeBossBalls(m);
  releaseGrabbedBalls(m);
  m.objects.obstacles = [];
  m.boss = null;
}

function pickBossAttack(m, boss) {
  const available = BOSSES[boss.id].attacks.filter(([id, stage]) => stage <= boss.stage && id !== boss.lastAttack).map(([id]) => id);
  const unseen = available.filter(id => !boss.seen.includes(id));
  const pool = unseen.length ? unseen : available;
  return pool[Math.floor(m.rng() * pool.length)];
}

function startBossAttack(m, boss) {
  const id = pickBossAttack(m, boss);
  const def = ATTACKS[id];
  const atk = { id, startedAt: m.t, endsAt: m.t + def.ms, nextShotAt: m.t + 300, seed: m.rng(), word: Math.floor(m.rng() * 16) };
  boss.attack = atk;
  boss.lastAttack = id;
  if (!boss.seen.includes(id)) boss.seen.push(id);
  def.start?.(m, boss, atk);
}

function launchBossServe(m, boss) {
  const ball = launchBall(m, m.rush ? 0 : randomSide(m));
  ball.x = boss.x;
  ball.y = boss.y;
}

function updateHazards(m, boss, stepMs) {
  const seconds = stepMs / 1000;
  boss.hazards = boss.hazards.filter(hazard => {
    hazard.x += hazard.vx * seconds;
    hazard.y += hazard.vy * seconds;
    if (hazard.x < -30 || hazard.x > ARENA_WIDTH + 30 || hazard.y < -40 || hazard.y > ARENA_HEIGHT + 30) return false;
    for (const paddle of m.paddles) {
      if (m.t < paddle.stunUntil) continue;
      const isTouching = hazard.x + hazard.r >= paddle.x && hazard.x - hazard.r <= paddle.x + PADDLE_WIDTH &&
        hazard.y + hazard.r >= paddle.y - paddle.h / 2 && hazard.y - hazard.r <= paddle.y + paddle.h / 2;
      if (!isTouching) continue;
      paddle.stunUntil = m.t + STUN_MS;
      boss.tally[paddle.side]--;
      m.fx.push(["zap", Math.round(hazard.x), Math.round(hazard.y)]);
      return false;
    }
    return true;
  });
}

function beginBossExit(m, boss, phase, durationMs) {
  endBossAttack(m, boss);
  boss.phase = phase;
  boss.phaseEndsAt = m.t + durationMs;
  boss.hazards = [];
  m.balls = [];
  if (phase === "defeat") m.fx.push(["bossDown", boss.id]);
}

function resolveBoss(m, boss) {
  if (m.rush) {
    m.scores[0]++;
    m.rush.index++;
    m.boss = null;
    const next = RUSH_ORDER[m.rush.index];
    if (next) startBoss(m, next);
    else finishMatch(m, 0);
    return;
  }
  const [left, right] = boss.tally;
  const running = m.active.find(ev => ev.id === "kingTerry");
  if (running) endEvent(m, running);
  else clearBoss(m);
  scheduleNextEvent(m);
  if (left === right) beginServe(m, randomSide(m));
  else awardPoint(m, left > right ? 0 : 1);
}

function stepBoss(m, stepMs) {
  const boss = m.boss;
  const def = BOSSES[boss.id];
  if (boss.attack?.id !== "oracle") boss.y = ARENA_HEIGHT / 2 + Math.sin((m.t - boss.startedAt) / 1400) * def.hover;
  updateHazards(m, boss, stepMs);
  if (boss.phase === "intro") {
    if (m.t < boss.phaseEndsAt) return;
    boss.phase = "fight";
    boss.nextAttackAt = m.t + 1800;
    launchBossServe(m, boss);
    return;
  }
  if (boss.phase !== "fight") {
    if (!m.isPrediction && m.t >= boss.phaseEndsAt) resolveBoss(m, boss);
    return;
  }
  if (!m.isPrediction && !m.rush && m.t >= boss.startedAt + BOSS_EVENT_MAX_MS) return beginBossExit(m, boss, "leave", BOSS_LEAVE_MS);
  if (!m.balls.some(ball => !ball.isFake) && m.t >= boss.relaunchAt) launchBossServe(m, boss);
  const atk = boss.attack;
  if (atk) {
    ATTACKS[atk.id].tick?.(m, boss, atk, stepMs);
    if (m.t >= atk.endsAt) {
      endBossAttack(m, boss);
      boss.nextAttackAt = m.t + Math.max(800, def.restMs - boss.stage * 300);
    }
  } else if (m.t >= boss.nextAttackAt) {
    startBossAttack(m, boss);
  }
}

function collideBoss(m, ball) {
  const boss = m.boss;
  if (!boss || boss.phase !== "fight" || ball.isFake) return;
  const half = BALL_SIZE / 2;
  const reachX = boss.w / 2 + half;
  const reachY = boss.h / 2 + half;
  const dx = ball.x - boss.x;
  const dy = ball.y - boss.y;
  if (Math.abs(dx) >= reachX || Math.abs(dy) >= reachY) return;
  const direction = dx < 0 ? -1 : 1;
  ball.x = boss.x + direction * reachX;
  ball.vx = direction * Math.abs(ball.vx);
  ball.vy += dy * 2;
  keepHorizontal(ball);
  if (m.t < boss.invulnerableUntil) return;
  boss.invulnerableUntil = m.t + BOSS_HIT_INVULNERABLE_MS;
  m.fx.push(["bossHit", Math.round(ball.x), Math.round(ball.y)]);
  const creditedSide = ball.lastSide ?? (direction < 0 ? 0 : 1);
  boss.tally[creditedSide]++;
  boss.hp = Math.max(m.isPrediction ? 1 : 0, boss.hp - 1);
  boss.stage = boss.hp / boss.maxHp > 0.66 ? 1 : boss.hp / boss.maxHp > 0.33 ? 2 : 3;
  if (boss.hp <= 0) beginBossExit(m, boss, "defeat", BOSS_DEFEAT_MS);
}

function dropBallDuringBoss(m, concedingSide) {
  const boss = m.boss;
  boss.tally[concedingSide] -= 2;
  boss.relaunchAt = m.t + BOSS_RELAUNCH_MS;
  m.fx.push(["drop", concedingSide]);
  if (!m.rush) return;
  m.lives--;
  m.scores[1]++;
  if (m.lives <= 0) finishMatch(m, 1);
}

const ABILITIES = {
  smash(m, paddle) { paddle.smashUntil = m.t + 5000; },
  shield(m, paddle) { paddle.shieldUntil = m.t + 3500; },
  blink(m, paddle) {
    const threat = threatFor(m, paddle, AI_LEVELS.unfair);
    if (threat) paddle.y = threat.y;
  },
  grow(m, paddle) { paddle.growUntil = m.t + 5000; },
  slow(m) { m.slowUntil = m.t + 2500; },
};
export const ABILITY_IDS = Object.keys(ABILITIES);

function rollAbility(m) {
  return ABILITY_IDS[Math.floor(m.rng() * ABILITY_IDS.length)];
}

function useAbility(m, paddle) {
  if (!paddle.ability || m.t < paddle.abilityReadyAt) return;
  ABILITIES[paddle.ability](m, paddle);
  m.fx.push(["ability", paddle.id, paddle.ability]);
  paddle.ability = rollAbility(m);
  paddle.abilityReadyAt = m.t + ABILITY_COOLDOWN_MS;
}

const RULES = {
  fastBall(mods) { mods.ballSpeed *= 1.45; },
  slowBall(mods) { mods.ballSpeed *= 0.7; },
  tinyPaddles(mods) { mods.paddleScale = mods.paddleScale.map(scale => scale * 0.6); },
  giantPaddles(mods) { mods.paddleScale = mods.paddleScale.map(scale => scale * 1.5); },
  moonGravity(mods) { mods.gravity += 260; },
  curveBall(mods) { mods.curve = Math.max(mods.curve, 1); },
  reverseGoals(mods) { mods.reverseScoring = true; },
  swiftPaddles(mods) { mods.paddleSpeed = mods.paddleSpeed.map(speed => speed * 1.5); },
  heavyPaddles(mods) { mods.paddleSpeed = mods.paddleSpeed.map(speed => speed * 0.65); },
  mirrored(mods) { mods.invert = [true, true]; },
};
const RULE_IDS = Object.keys(RULES);

function rollRules(m) {
  const first = RULE_IDS[Math.floor(m.rng() * RULE_IDS.length)];
  const rest = RULE_IDS.filter(id => id !== first);
  m.rules = m.rng() < 0.4 ? [first, rest[Math.floor(m.rng() * rest.length)]] : [first];
  m.nextRuleAt = m.t + RULE_INTERVAL_MS;
  m.fx.push(["rules", m.rules]);
}

function placePaddle(paddle, side, lane) {
  const inset = PADDLE_INSET + lane * LANE_GAP;
  paddle.side = side;
  paddle.x = side === 0 ? inset : ARENA_WIDTH - inset - PADDLE_WIDTH;
  paddle.homeX = paddle.x;
  paddle.aiTargetX = paddle.x;
}

function rebalancePaddles(m) {
  const order = [...m.paddles].sort((a, b) => a.id - b.id);
  const lanes = [0, 0];
  const counts = [Math.ceil(order.length / 2), Math.floor(order.length / 2)];
  order.forEach((paddle, index) => {
    const side = index % 2;
    placePaddle(paddle, side, lanes[side]++);
    paddle.scale = TEAM_PADDLE_SCALE[Math.min(counts[side], TEAM_PADDLE_SCALE.length) - 1];
  });
}

function settleFreeForAll(m) {
  if (m.paddles.length > 1 || m.phase === "over") return false;
  const survivor = m.paddles[0];
  m.champion = survivor ? survivor.owner ?? JOHN_ID : null;
  finishMatch(m, survivor?.side ?? 0);
  return true;
}

export const EVENTS = Object.fromEntries(EVENT_LIST.map(def => [def.id, def]));
export const EVENT_IDS = EVENT_LIST.map(def => def.id);

export const MODES = {
  classic: { label: "Klasika", info: "Parasts Pong bez notikumiem.", usesEvents: false, minPlayers: 1 },
  chaos: { label: "Haoss", info: "Var notikt jebkurš atļautais notikums.", usesEvents: true, minPlayers: 1 },
  survival: {
    label: "Izdzīvošana", info: "Jo ilgāk spēlē, jo biežāki un trakāki notikumi.", usesEvents: true, minPlayers: 1, forcesEvents: true,
    pressure(m) {
      const progress = Math.min(1, m.t / 180000);
      return { intervalScale: 1 - 0.65 * progress, strengthScale: 1 + progress, maxActive: 1 + Math.round(progress * 3) };
    },
  },
  boss: {
    label: "Boss cīņa", info: "Visi kopā pret John Pong, kurš ar katru jūsu punktu kļūst stiprāks.", usesEvents: true, minPlayers: 1, isBossFight: true,
    restingMood: "cocky",
    assignTeams: ids => [ids, []],
    onPoint(m, side) {
      if (side !== 0) return;
      const boss = m.paddles.find(paddle => paddle.isBoss);
      if (!boss) return;
      const stage = bossStage(m);
      if (boss.ai !== stage) m.fx.push(["boss", stage]);
      boss.ai = stage;
      if (m.nextEventAt < NEVER) m.nextEventAt = m.t + SERVE_MS + 500;
    },
  },
  tournament: { label: "Turnīrs", info: "Izslēgšanas spēles viens pret vienu, līdz paliek viens čempions.", usesEvents: true, minPlayers: 2, isBracket: true },
  bossRush: {
    label: "Boss maratons", info: "Visi kopā pret trim bosiem pēc kārtas ar piecām kopīgām sirdīm. Beigās gaida King Terry Davis.", usesEvents: false, minPlayers: 1,
    isBossFight: true, hasNoOpponent: true, fixedTarget: 99,
    assignTeams: ids => [ids, []],
    setup(m) {
      m.lives = RUSH_LIVES;
      m.rush = { index: 0 };
      m.phase = "play";
      startBoss(m, RUSH_ORDER[0]);
    },
  },
  hardcore: {
    label: "Hardcore", info: "Ātrāka bumba, mazākas raketes, tikai bīstami notikumi. Trīs kļūdas, un viss.", usesEvents: true, minPlayers: 1, forcesEvents: true, fixedTarget: 3,
    blunderScale: 0, blocksBossEvent: true, firstEventMs: 5000,
    eventPool: ["speed", "curve", "ghost", "tiny", "confusion", "frozen", "spam", "twofa", "quake", "blackout", "reverse", "fake", "walls", "meteor"],
    pressure: () => ({ intervalScale: 0.55, strengthScale: 1.25, maxActive: 2 }),
    mod(mods) {
      mods.ballSpeed *= 1.22;
      mods.paddleScale = mods.paddleScale.map(scale => scale * 0.8);
    },
  },
  randomizer: {
    label: "Nejaušība", info: "Ik pa 15 sekundēm noteikumi mainās pilnīgi nejauši, un notikumi nāk klāt.", usesEvents: true, minPlayers: 1, forcesEvents: true,
    step(m) {
      if (m.phase === "play" && m.t >= m.nextRuleAt) rollRules(m);
    },
    mod(mods, m) {
      for (const id of m.rules) RULES[id](mods);
    },
  },
  ability: {
    label: "Spējas", info: "Katram ir speciāla spēja. Spied E vai pogu īstajā brīdī, un pēc atdzišanas saņem nākamo.", usesEvents: false, minPlayers: 1,
    setup(m) {
      for (const paddle of m.paddles) paddle.ability = rollAbility(m);
    },
    mod(mods, m) {
      if (m.t < m.slowUntil) mods.ballSpeed *= 0.5;
    },
  },
  lastStanding: {
    label: "Pēdējā rakete", info: "Visi pret visiem. Katram 3 sirdis, un izdzīvo tikai pēdējais. Trūkstošos aizstāj John Pong.", usesEvents: true, minPlayers: 1, isFreeForAll: true, fixedTarget: 99, blocksBossEvent: true,
    setup(m) {
      while (m.paddles.length < LAST_STANDING_MIN_PADDLES) addPaddle(m, { side: 0, lane: 0, ai: m.settings.aiDifficulty });
      for (const paddle of m.paddles) paddle.lives = LAST_STANDING_LIVES;
      rebalancePaddles(m);
    },
    onGoal(m, concedingSide, ball) {
      const defenders = m.paddles.filter(paddle => paddle.side === concedingSide);
      const blamed = defenders.reduce((nearest, paddle) => (!nearest || Math.abs(paddle.y - ball.y) < Math.abs(nearest.y - ball.y) ? paddle : nearest), null);
      if (blamed) {
        blamed.lives--;
        m.fx.push(["heart", blamed.id]);
        if (blamed.lives <= 0) {
          m.fx.push(["out", blamed.owner ?? JOHN_ID]);
          m.paddles = m.paddles.filter(paddle => paddle !== blamed);
          rebalancePaddles(m);
        }
      }
      if (settleFreeForAll(m)) return;
      if (!m.balls.some(other => !other.isFake)) beginServe(m, 1 - concedingSide);
    },
  },
  johnChallenge: {
    label: "John Pong izaicinājums", info: "Uzvari John Pong četros aizvien grūtākos līmeņos. Katrā līmenī spēle līdz 3.", usesEvents: false, minPlayers: 1, fixedTarget: 3,
    assignTeams: ids => [ids, []],
    setup(m) {
      for (const paddle of m.paddles) if (paddle.owner === null) paddle.ai = AI_LADDER[0];
    },
    onTarget(m, side) {
      if (side !== 0) return false;
      const next = AI_LADDER[m.johnLevel + 1];
      if (!next) return false;
      m.johnLevel++;
      m.scores = [0, 0];
      const john = m.paddles.find(paddle => paddle.owner === null);
      if (john) {
        john.ai = next;
        johnSay(m, john, "level");
      }
      m.fx.push(["level", next]);
      beginServe(m, 0);
      return true;
    },
  },
  frenzy: {
    label: "Notikumu vētra", info: "Notikumi pārklājas un nāk arvien ātrāk. Vienīgais noteikums ir izdzīvot līdz beigām.", usesEvents: true, minPlayers: 1, forcesEvents: true, blocksBossEvent: true, firstEventMs: 3000,
    pressure(m) {
      const progress = Math.min(1, m.t / 120000);
      return { intervalScale: 0.26 - 0.12 * progress, strengthScale: 1.1 + 0.3 * progress, maxActive: 4 + Math.round(progress * 3) };
    },
  },
  free2d: {
    label: "2D Pong", info: "Raketes kustas brīvi pa visu savu arēnas pusi. Dodies pretī bumbai, bet neatstāj vārtus tukšus.", usesEvents: true, minPlayers: 1,
    mod(mods) { mods.free2d = true; },
  },
  team: {
    label: "Komandas", info: "Stafete: pēc sava sitiena rakete atdziest, un nākamo sit komandas biedrs. Trūkstošos aizstāj John Pong.", usesEvents: true, minPlayers: 1, restingMood: "calm", tauntOnScore: "team",
    setup(m) {
      const size = Math.max(2, ...[0, 1].map(side => m.paddles.filter(paddle => paddle.side === side && paddle.owner !== null).length));
      for (const side of [0, 1]) {
        let lane = m.paddles.filter(paddle => paddle.side === side).length;
        while (lane < size) addPaddle(m, { side, lane: lane++, ai: m.settings.aiDifficulty });
        const scale = TEAM_PADDLE_SCALE[Math.min(size, TEAM_PADDLE_SCALE.length) - 1];
        for (const paddle of m.paddles) if (paddle.side === side) paddle.scale = scale;
      }
    },
    blocksHit: (m, paddle) => isPaddleCooling(m, paddle),
  },
};

export function isPaddleCooling(m, paddle) {
  return m.settings.mode === "team" && m.relay[paddle.side] === paddle.id && m.paddles.some(other => other.side === paddle.side && other !== paddle);
}

export function bossStage(m) {
  const start = AI_LADDER.indexOf(m.settings.aiDifficulty);
  const climbed = Math.floor(m.scores[0] / m.target * AI_LADDER.length);
  return AI_LADDER[Math.min(AI_LADDER.length - 1, start + climbed)];
}

export function defaultSettings() {
  return {
    mode: "chaos",
    targetScore: 7,
    frequency: "normal",
    intensity: "normal",
    aiEnabled: true,
    aiDifficulty: "normal",
    chaotic: false,
    events: [...EVENT_IDS],
  };
}

export function sanitizeSettings(raw, current) {
  const next = { ...current };
  if (!raw || typeof raw !== "object") return next;
  if (Object.hasOwn(MODES, raw.mode)) next.mode = raw.mode;
  if (SCORE_OPTIONS.includes(raw.targetScore)) next.targetScore = raw.targetScore;
  if (Object.hasOwn(FREQUENCIES, raw.frequency)) next.frequency = raw.frequency;
  if (Object.hasOwn(INTENSITIES, raw.intensity)) next.intensity = raw.intensity;
  if (Object.hasOwn(AI_LEVELS, raw.aiDifficulty)) next.aiDifficulty = raw.aiDifficulty;
  if (typeof raw.aiEnabled === "boolean") next.aiEnabled = raw.aiEnabled;
  if (typeof raw.chaotic === "boolean") next.chaotic = raw.chaotic;
  if (Array.isArray(raw.events)) next.events = EVENT_IDS.filter(id => raw.events.includes(id));
  return next;
}

export function assignTeams(mode, playerIds) {
  const customAssign = MODES[mode].assignTeams;
  if (customAssign) return customAssign(playerIds);
  const teams = [[], []];
  playerIds.forEach((id, index) => teams[index % 2].push(id));
  return teams;
}

function baseMods() {
  return {
    ballSpeed: 1, gravity: 0, gravityDirection: 0, curve: 0, deflectNoise: 0,
    ghost: false, flip: false, reverseScoring: false, suddenDeath: false,
    bassBoost: false, twofa: false, spam: false, redSea: false, palette: false, lowRes: false, rightWall: false, free2d: false,
    paddleScale: [1, 1], paddleSpeed: [1, 1], invert: [false, false], frozen: [false, false],
    top: 0, bottom: ARENA_HEIGHT,
  };
}

function attachRandom(m) {
  m.rng = () => {
    m.rngState = (m.rngState + 0x6d2b79f5) >>> 0;
    let mixed = m.rngState;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return m;
}

function addPaddle(m, { side, lane, owner = null, ai = null, scale = 1, isBoss = false }) {
  const inset = PADDLE_INSET + lane * LANE_GAP;
  const paddle = {
    id: ++m.nextId,
    side,
    owner,
    ai,
    scale,
    isBoss,
    x: side === 0 ? inset : ARENA_WIDTH - inset - PADDLE_WIDTH,
    y: ARENA_HEIGHT / 2,
    h: PADDLE_HEIGHT * scale,
    dir: 0,
    dirX: 0,
    target: null,
    targetX: null,
    homeX: 0,
    aiTargetX: 0,
    aiTarget: ARENA_HEIGHT / 2,
    aiThinkAt: 0,
    aiError: 0,
    aiErrorAt: 0,
    stunUntil: 0,
    fall: 0,
    spamReadyAt: 0,
    challenge: null,
    lives: null,
    ability: null,
    abilityReadyAt: 0,
    smashUntil: 0,
    shieldUntil: 0,
    growUntil: 0,
    john: ai && owner === null ? { mood: MODES[m.settings.mode].restingMood ?? "calm", moodUntil: 0, plan: "straight", planKey: "", planUntil: 0, trickSign: 1, isLunging: false, joinedAt: m.t } : null,
  };
  paddle.homeX = paddle.x;
  paddle.aiTargetX = paddle.x;
  m.paddles.push(paddle);
  if (paddle.john) {
    m.fx.push(["john", paddle.id]);
    johnSay(m, paddle, "join", 0.7);
  }
  return paddle;
}

export function createMatch({ settings, teams, seed = Math.floor(Math.random() * 4294967296) }) {
  const mode = MODES[settings.mode];
  const m = attachRandom({
    settings,
    rngState: seed >>> 0,
    isPrediction: false,
    step: 0,
    t: 0,
    phase: "serve",
    serveAt: FIRST_SERVE_MS,
    target: mode.fixedTarget ?? settings.targetScore,
    scores: [0, 0],
    paddles: [],
    balls: [],
    meteors: [],
    active: [],
    objects: { bumpers: [], obstacles: [], portals: [], box: null },
    mods: baseMods(),
    fx: [],
    nextId: 0,
    nextEventAt: NEVER,
    winner: null,
    champion: null,
    isForfeit: false,
    boss: null,
    rush: null,
    lives: null,
    relay: [null, null],
    rules: [],
    nextRuleAt: FIRST_SERVE_MS,
    johnLevel: 0,
    slowUntil: 0,
    nextTauntAt: 0,
    nextIdleTauntAt: 12000,
  });
  teams.forEach((team, side) => {
    const scale = TEAM_PADDLE_SCALE[Math.min(team.length, TEAM_PADDLE_SCALE.length) - 1] ?? 1;
    team.forEach((owner, lane) => addPaddle(m, { side, lane, owner, scale }));
  });
  if (settings.mode === "boss") addPaddle(m, { side: 1, lane: 0, ai: bossStage(m), scale: BOSS_PADDLE_SCALE, isBoss: true });
  else if (!mode.hasNoOpponent && !mode.isFreeForAll) for (const side of [0, 1]) if (!teams[side].length) addPaddle(m, { side, lane: 0, ai: settings.aiDifficulty });
  scheduleNextEvent(m, mode.firstEventMs ?? FIRST_EVENT_DELAY_MS);
  launchBall(m, randomSide(m));
  mode.setup?.(m);
  return m;
}

const NON_STATE_KEYS = new Set(["settings", "fx"]);

function encodeStateValue(key, value) {
  if (NON_STATE_KEYS.has(key)) return undefined;
  return typeof value === "number" && !Number.isInteger(value) ? Math.round(value * 1000) / 1000 : value;
}

export function encodeMatchState(m) {
  return JSON.stringify(m, encodeStateValue);
}

export function restoreMatch(state, settings) {
  state.settings = settings;
  state.fx = [];
  state.isPrediction = true;
  return attachRandom(state);
}

function eventPressure(m) {
  const { chaotic, intensity, mode } = m.settings;
  const base = chaotic
    ? { intervalScale: 0.4, strength: INTENSITIES.wild.strength, maxActive: 4 }
    : { intervalScale: 1, strength: INTENSITIES[intensity].strength, maxActive: 2 };
  const modePressure = MODES[mode].pressure?.(m);
  if (modePressure) {
    base.intervalScale *= modePressure.intervalScale;
    base.strength *= modePressure.strengthScale;
    base.maxActive = Math.max(chaotic ? base.maxActive : 0, modePressure.maxActive);
  }
  if (m.mods.suddenDeath) {
    base.intervalScale *= 0.35;
    base.maxActive += 2;
  }
  return base;
}

function eventInterval(m) {
  const { frequency, chaotic, mode } = m.settings;
  if (!MODES[mode].usesEvents) return null;
  const range = FREQUENCIES[frequency].range ?? (chaotic || MODES[mode].forcesEvents ? FREQUENCIES.normal.range : null);
  if (!range) return null;
  return randomBetween(m, range[0], range[1]);
}

function scheduleNextEvent(m, minimumDelay = 0) {
  const interval = eventInterval(m);
  m.nextEventAt = interval === null ? NEVER : m.t + Math.max(minimumDelay, interval * eventPressure(m).intervalScale);
}

function rollEvent(m) {
  const activeIds = new Set(m.active.map(ev => ev.id));
  const activeSlots = new Set(m.active.map(ev => EVENTS[ev.id].slot).filter(Boolean));
  const modePool = MODES[m.settings.mode].eventPool;
  const pool = EVENT_LIST.filter(def =>
    (m.settings.chaotic || m.settings.events.includes(def.id)) &&
    (!modePool || modePool.includes(def.id)) &&
    !activeIds.has(def.id) &&
    !(def.slot && activeSlots.has(def.slot)) &&
    !def.avoids?.some(id => activeIds.has(id)) &&
    (!def.canStart || def.canStart(m)));
  let remaining = m.rng() * pool.reduce((sum, def) => sum + def.weight, 0);
  for (const def of pool) {
    remaining -= def.weight;
    if (remaining <= 0) return def.id;
  }
  return null;
}

export function startEvent(m, id, { side = null } = {}) {
  const def = EVENTS[id];
  for (const running of [...m.active]) {
    if (running.id === id || (def.slot && EVENTS[running.id].slot === def.slot)) endEvent(m, running);
  }
  const strength = eventPressure(m).strength;
  const duration = typeof def.duration === "function" ? def.duration(strength) : def.duration;
  const ev = { id, side, strength, seed: m.rng(), startedAt: m.t, endsAt: m.t + duration };
  def.start?.(m, ev);
  if (duration > 0) m.active.push(ev);
  m.fx.push(["event", id, ev.side, def.shake ?? 0]);
  return ev;
}

function endEvent(m, ev) {
  EVENTS[ev.id].end?.(m, ev);
  m.active = m.active.filter(running => running !== ev);
}

function updateEvents(m) {
  for (const ev of m.active) EVENTS[ev.id].tick?.(m, ev);
  for (const ev of [...m.active]) if (m.t >= ev.endsAt) endEvent(m, ev);
  if (!m.isPrediction && !m.boss && m.phase === "play" && m.t >= m.nextEventAt) {
    if (m.active.length < eventPressure(m).maxActive) {
      const id = rollEvent(m);
      if (id) startEvent(m, id);
    }
    scheduleNextEvent(m);
  }
  const mods = baseMods();
  for (const ev of m.active) EVENTS[ev.id].mod?.(mods, ev, m);
  MODES[m.settings.mode].mod?.(mods, m);
  if (m.rush) mods.rightWall = true;
  if (m.boss?.attack) ATTACKS[m.boss.attack.id].mod?.(mods, m, m.boss, m.boss.attack);
  m.mods = mods;
}

function launchBall(m, towardSide, { isFake = false, isExtra = false } = {}) {
  const angle = randomBetween(m, -0.6, 0.6);
  const direction = towardSide === 0 ? -1 : 1;
  const ball = {
    id: ++m.nextId,
    x: ARENA_WIDTH / 2,
    y: randomBetween(m, ARENA_HEIGHT * 0.3, ARENA_HEIGHT * 0.7),
    vx: Math.cos(angle) * BALL_START_SPEED * direction,
    vy: Math.sin(angle) * BALL_START_SPEED,
    isFake,
    isExtra,
    lastSide: null,
    curveSign: m.rng() < 0.5 ? 1 : -1,
    portalLockUntil: 0,
  };
  m.balls.push(ball);
  return ball;
}

function rotateVelocity(ball, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const vx = ball.vx * cos - ball.vy * sin;
  ball.vy = ball.vx * sin + ball.vy * cos;
  ball.vx = vx;
}

function keepHorizontal(ball) {
  const speed = Math.hypot(ball.vx, ball.vy);
  const minimum = speed * MIN_HORIZONTAL_SHARE;
  if (Math.abs(ball.vx) >= minimum) return;
  ball.vx = (ball.vx < 0 ? -1 : 1) * minimum;
  ball.vy = (ball.vy < 0 ? -1 : 1) * Math.sqrt(speed * speed - minimum * minimum);
}

function bendBall(m, ball, seconds) {
  const { gravity, curve } = m.mods;
  if (!gravity && !curve) return;
  const speed = Math.hypot(ball.vx, ball.vy);
  ball.vy += gravity * seconds;
  if (curve) rotateVelocity(ball, curve * ball.curveSign * seconds);
  const scale = speed / Math.hypot(ball.vx, ball.vy);
  ball.vx *= scale;
  ball.vy *= scale;
  keepHorizontal(ball);
}

function collideWalls(m, ball) {
  const half = BALL_SIZE / 2;
  if (ball.y - half < m.mods.top) {
    ball.y = m.mods.top + half;
    if (ball.vy < 0) {
      ball.vy = -ball.vy;
      m.fx.push(["wall"]);
    }
  } else if (ball.y + half > m.mods.bottom) {
    ball.y = m.mods.bottom - half;
    if (ball.vy > 0) {
      ball.vy = -ball.vy;
      m.fx.push(["wall"]);
    }
  }
  if (m.mods.rightWall && ball.x + half > ARENA_WIDTH) {
    ball.x = ARENA_WIDTH - half;
    if (ball.vx > 0) {
      ball.vx = -ball.vx;
      m.fx.push(["wall"]);
    }
  }
}

function bounceOffPaddle(m, ball, paddle) {
  const offset = Math.max(-1, Math.min(1, (ball.y - paddle.y) / (paddle.h / 2)));
  const noise = m.mods.deflectNoise ? randomBetween(m, -m.mods.deflectNoise, m.mods.deflectNoise) : 0;
  const angle = Math.max(-MAX_BOUNCE_ANGLE, Math.min(MAX_BOUNCE_ANGLE, offset * MAX_BOUNCE_ANGLE + noise));
  const isSmash = m.t < paddle.smashUntil;
  const speed = Math.min(BALL_MAX_SPEED, Math.hypot(ball.vx, ball.vy) * (isSmash ? 1.5 : RALLY_GROWTH));
  const direction = paddle.side === 0 ? 1 : -1;
  if (isSmash) {
    paddle.smashUntil = 0;
    m.fx.push(["smash", Math.round(ball.x), Math.round(ball.y)]);
  }
  m.relay[paddle.side] = paddle.id;
  ball.vx = Math.cos(angle) * speed * direction;
  ball.vy = Math.sin(angle) * speed;
  ball.x = direction > 0 ? paddle.x + PADDLE_WIDTH + BALL_SIZE / 2 : paddle.x - BALL_SIZE / 2;
  ball.lastSide = paddle.side;
  ball.curveSign = -ball.curveSign;
  m.fx.push(["paddle", Math.round(ball.x), Math.round(ball.y)]);
}

function hitsPaddle(ball, paddle) {
  const half = BALL_SIZE / 2;
  const isIncoming = paddle.side === 0 ? ball.vx < 0 : ball.vx > 0;
  return isIncoming &&
    ball.x + half >= paddle.x && ball.x - half <= paddle.x + PADDLE_WIDTH &&
    ball.y + half >= paddle.y - paddle.h / 2 - PADDLE_HIT_GRACE && ball.y - half <= paddle.y + paddle.h / 2 + PADDLE_HIT_GRACE;
}

function collidePaddles(m, ball) {
  const blocksHit = MODES[m.settings.mode].blocksHit;
  for (const paddle of m.paddles) {
    if (!hitsPaddle(ball, paddle) || blocksHit?.(m, paddle)) continue;
    if (ball.isFake) {
      m.fx.push(["puff", Math.round(ball.x), Math.round(ball.y)]);
      m.balls = m.balls.filter(other => other !== ball);
      return true;
    }
    bounceOffPaddle(m, ball, paddle);
    return false;
  }
  return false;
}

function collideBumpers(m, ball) {
  const half = BALL_SIZE / 2;
  for (const bumper of m.objects.bumpers) {
    const dx = ball.x - bumper.x;
    const dy = ball.y - bumper.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance >= bumper.r + half) continue;
    const nx = dx / distance;
    const ny = dy / distance;
    const approach = ball.vx * nx + ball.vy * ny;
    if (approach < 0) {
      ball.vx -= 2 * approach * nx;
      ball.vy -= 2 * approach * ny;
      const speed = Math.hypot(ball.vx, ball.vy);
      const boost = Math.min(BALL_MAX_SPEED, speed * 1.04) / speed;
      ball.vx *= boost;
      ball.vy *= boost;
      keepHorizontal(ball);
      m.fx.push(["bumper", bumper.x, bumper.y]);
    }
    ball.x = bumper.x + nx * (bumper.r + half);
    ball.y = bumper.y + ny * (bumper.r + half);
  }
}

function collideObstacles(m, ball) {
  const half = BALL_SIZE / 2;
  for (const block of m.objects.obstacles) {
    const overlapX = Math.min(ball.x + half - block.x, block.x + block.w - (ball.x - half));
    const overlapY = Math.min(ball.y + half - block.y, block.y + block.h - (ball.y - half));
    if (overlapX <= 0 || overlapY <= 0) continue;
    if (overlapX < overlapY) {
      const isLeftSide = ball.x < block.x + block.w / 2;
      ball.x += isLeftSide ? -overlapX : overlapX;
      ball.vx = isLeftSide ? -Math.abs(ball.vx) : Math.abs(ball.vx);
    } else {
      const isAbove = ball.y < block.y + block.h / 2;
      ball.y += isAbove ? -overlapY : overlapY;
      ball.vy = isAbove ? -Math.abs(ball.vy) : Math.abs(ball.vy);
    }
    m.fx.push(["block", Math.round(ball.x), Math.round(ball.y)]);
  }
}

function collidePortals(m, ball) {
  const [first, second] = m.objects.portals;
  if (!first || m.t < ball.portalLockUntil) return;
  for (const [entry, exit] of [[first, second], [second, first]]) {
    if (Math.hypot(ball.x - entry.x, ball.y - entry.y) >= entry.r) continue;
    ball.x = exit.x;
    ball.y = exit.y;
    ball.portalLockUntil = m.t + PORTAL_LOCK_MS;
    m.fx.push(["portal", exit.x, exit.y]);
    return;
  }
}

function collideBox(m, ball) {
  const box = m.objects.box;
  if (!box || ball.isFake || m.isPrediction) return;
  const reach = box.s / 2 + BALL_SIZE / 2;
  if (Math.abs(ball.x - box.x) >= reach || Math.abs(ball.y - box.y) >= reach) return;
  const running = m.active.find(ev => ev.id === "mystery");
  if (running) endEvent(m, running);
  const side = ball.lastSide ?? randomSide(m);
  MYSTERY_REWARDS[Math.floor(m.rng() * MYSTERY_REWARDS.length)](m, side);
}

function checkGoal(m, ball) {
  const half = BALL_SIZE / 2;
  const isPastLeft = ball.x + half < 0;
  const isPastRight = ball.x - half > ARENA_WIDTH;
  if (!isPastLeft && !isPastRight) return false;
  if (ball.isFake) {
    m.balls = m.balls.filter(other => other !== ball);
    m.fx.push(["puff", Math.round(Math.max(0, Math.min(ARENA_WIDTH, ball.x))), Math.round(ball.y)]);
    return true;
  }
  const concedingSide = isPastLeft ? 0 : 1;
  const shielded = m.paddles.find(paddle => paddle.side === concedingSide && m.t < paddle.shieldUntil);
  if (shielded) {
    ball.x = isPastLeft ? half : ARENA_WIDTH - half;
    ball.vx = -ball.vx;
    ball.lastSide = concedingSide;
    m.fx.push(["shield", Math.round(ball.x), Math.round(ball.y)]);
    return false;
  }
  if (m.isPrediction) {
    ball.isHeld = true;
    return true;
  }
  m.balls = m.balls.filter(other => other !== ball);
  if (m.boss) {
    dropBallDuringBoss(m, concedingSide);
    return true;
  }
  const onGoal = MODES[m.settings.mode].onGoal;
  if (onGoal) {
    onGoal(m, concedingSide, ball);
    return true;
  }
  const scoringSide = m.mods.reverseScoring ? concedingSide : 1 - concedingSide;
  awardPoint(m, scoringSide);
  return true;
}

function awardPoint(m, side) {
  m.scores[side]++;
  m.fx.push(["score", side]);
  const king = m.active.find(ev => ev.id === "king" && ev.side !== side);
  if (king) endEvent(m, king);
  reactJohnToPoint(m, side);
  if (m.mods.suddenDeath || m.scores[side] >= m.target) {
    if (!MODES[m.settings.mode].onTarget?.(m, side)) finishMatch(m, side);
    return;
  }
  MODES[m.settings.mode].onPoint?.(m, side);
  if (!m.balls.some(ball => !ball.isFake)) beginServe(m, 1 - side);
}

function beginServe(m, towardSide) {
  m.phase = "serve";
  m.serveAt = m.t + SERVE_MS;
  m.balls = [];
  m.relay = [null, null];
  launchBall(m, towardSide);
}

function finishMatch(m, winner) {
  m.phase = "over";
  m.winner = winner;
  for (const ev of [...m.active]) endEvent(m, ev);
  m.balls = [];
}

export function forfeitMatch(m, winner) {
  m.isForfeit = true;
  finishMatch(m, winner);
}

function moveBall(m, ball, stepMs) {
  if (ball.isHeld || ball.isGrabbed) return;
  const seconds = stepMs / 1000;
  const speed = Math.hypot(ball.vx, ball.vy) * m.mods.ballSpeed;
  const substeps = Math.min(10, Math.max(1, Math.ceil(speed * seconds / MAX_SUBSTEP_PX)));
  const fraction = seconds / substeps;
  for (let step = 0; step < substeps; step++) {
    bendBall(m, ball, fraction);
    ball.x += ball.vx * m.mods.ballSpeed * fraction;
    ball.y += ball.vy * m.mods.ballSpeed * fraction;
    collideWalls(m, ball);
    if (collidePaddles(m, ball)) return;
    collideBumpers(m, ball);
    collideObstacles(m, ball);
    collideBoss(m, ball);
    if (m.boss && m.boss.phase !== "fight") return;
    collidePortals(m, ball);
    collideBox(m, ball);
    if (m.phase === "over" || checkGoal(m, ball)) return;
  }
}

function threatFor(m, paddle, level) {
  let threat = null;
  let soonest = Infinity;
  for (const ball of m.balls) {
    if ((ball.isFake && level.seesFakes) || ball.isHeld || ball.isGrabbed) continue;
    const isIncoming = paddle.side === 0 ? ball.vx < 0 : ball.vx > 0;
    if (!isIncoming) continue;
    const time = Math.abs(ball.x - paddle.x) / Math.max(1, Math.abs(ball.vx));
    if (time < soonest) {
      soonest = time;
      threat = ball;
    }
  }
  return threat;
}

export function predictBallY(ball, targetX, top, bottom) {
  const half = BALL_SIZE / 2;
  const low = top + half;
  const span = Math.max(1, bottom - half - low);
  const time = Math.abs(targetX - ball.x) / Math.max(1, Math.abs(ball.vx));
  const travelled = ball.y - low + ball.vy * time;
  const wrapped = ((travelled % (2 * span)) + 2 * span) % (2 * span);
  return low + (wrapped > span ? 2 * span - wrapped : wrapped);
}

function johnSay(m, paddle, situation, chance = 1) {
  if (m.isPrediction || !paddle.john || m.t < m.nextTauntAt || m.rng() >= chance) return;
  m.nextTauntAt = m.t + TAUNT_COOLDOWN_MS;
  m.fx.push(["taunt", paddle.id, situation, Math.floor(m.rng() * 997)]);
}

function setJohnMood(m, paddle, mood) {
  paddle.john.mood = mood;
  paddle.john.moodUntil = m.t + MOOD_MS;
}

function reactJohnToPoint(m, scoringSide) {
  const mode = MODES[m.settings.mode];
  for (const paddle of m.paddles) {
    if (!paddle.john) continue;
    if (paddle.side === scoringSide) {
      setJohnMood(m, paddle, "cocky");
      johnSay(m, paddle, mode.tauntOnScore ?? "scored", 0.6);
    } else if (m.scores[scoringSide] >= m.target - 1) {
      setJohnMood(m, paddle, "nervous");
      johnSay(m, paddle, "nervous", 0.7);
    } else {
      setJohnMood(m, paddle, "angry");
      johnSay(m, paddle, "conceded", 0.6);
    }
  }
}

function johnErrorScale(john) {
  if (!john) return 1;
  return { angry: 1.4, nervous: 1.3, cocky: 1.15 }[john.mood] ?? 1;
}

function johnSpeedScale(john) {
  if (!john) return 1;
  if (john.isLunging) return 1.35;
  return { angry: 1.12, nervous: 0.95 }[john.mood] ?? 1;
}

function johnIdleTarget(m, paddle, level) {
  const center = (m.mods.top + m.mods.bottom) / 2;
  const mood = paddle.john?.mood;
  if (mood === "cocky") return center + Math.sin(m.t / 110 + paddle.id) * 52;
  if (mood === "nervous") return center + Math.sin(m.t / 45 + paddle.id) * 14;
  if (paddle.john && level.blunderChance > 0.1) return center + Math.sin(m.t / 900 + paddle.id) * 40;
  return center;
}

function rollJohnPlan(m, paddle, level, ball, key) {
  const john = paddle.john;
  const blunderChance = level.blunderChance * (MODES[m.settings.mode].blunderScale ?? 1);
  const roll = m.rng();
  john.planKey = key;
  john.isLunging = false;
  john.trickSign = m.rng() < 0.5 ? 1 : -1;
  john.planUntil = m.t + WRONG_WAY_MS;
  if (roll < blunderChance) {
    john.plan = m.rng() < 0.65 ? "wrongWay" : "daydream";
    johnSay(m, paddle, "blunder", 0.45);
  } else if (roll < blunderChance + level.trickChance) {
    john.plan = "trick";
    johnSay(m, paddle, "trick", 0.15);
  } else if (roll < blunderChance + level.trickChance + level.lateChance) {
    john.plan = "late";
  } else {
    john.plan = "straight";
  }
}

function johnShotTarget(m, paddle, level, ball, expected) {
  const john = paddle.john;
  if (!john) return expected;
  const key = `${ball.id}:${ball.vx < 0 ? "l" : "r"}`;
  if (john.planKey !== key) rollJohnPlan(m, paddle, level, ball, key);
  switch (john.plan) {
    case "trick":
      return expected + john.trickSign * paddle.h * 0.36;
    case "late": {
      const seconds = Math.abs(ball.x - paddle.x) / Math.max(1, Math.abs(ball.vx));
      john.isLunging = seconds <= LATE_LUNGE_S;
      return john.isLunging ? expected : johnIdleTarget(m, paddle, level);
    }
    case "wrongWay":
      return m.t < john.planUntil ? paddle.y + (paddle.y - expected) : expected;
    case "daydream":
      return johnIdleTarget(m, paddle, level);
    default:
      return expected;
  }
}

function chooseFreeMoveX(m, paddle, threat) {
  const forward = paddle.side === 0 ? 1 : -1;
  if (!threat) return paddle.homeX + forward * (70 + Math.sin(m.t / 1100 + paddle.id) * 50);
  if (forward * (threat.x - paddle.x) < 0) return paddle.homeX;
  return paddle.john?.plan === "trick" ? paddle.homeX + forward * 190 : paddle.x;
}

function thinkAi(m, paddle) {
  if (m.t < paddle.aiThinkAt) return;
  const level = AI_LEVELS[paddle.ai];
  paddle.aiThinkAt = m.t + level.reactMs;
  const john = paddle.john;
  if (john && john.moodUntil && m.t >= john.moodUntil) {
    john.mood = MODES[m.settings.mode].restingMood ?? "calm";
    john.moodUntil = 0;
  }
  if (m.t >= paddle.aiErrorAt) {
    const errorRange = level.errorPx * johnErrorScale(john);
    paddle.aiError = randomBetween(m, -errorRange, errorRange);
    paddle.aiErrorAt = m.t + 900;
  }
  const threat = threatFor(m, paddle, level);
  paddle.aiTargetX = chooseFreeMoveX(m, paddle, threat);
  if (!threat || isPaddleCooling(m, paddle)) {
    if (john) john.isLunging = false;
    paddle.aiTarget = johnIdleTarget(m, paddle, level);
    return;
  }
  if (paddle.ability && m.t >= paddle.abilityReadyAt && Math.abs(threat.x - paddle.x) < 220 && m.rng() < 0.12) useAbility(m, paddle);
  const faceX = paddle.side === 0 ? paddle.x + PADDLE_WIDTH : paddle.x;
  const expected = level.predicts ? predictBallY(threat, faceX, m.mods.top, m.mods.bottom) : threat.y;
  paddle.aiTarget = johnShotTarget(m, paddle, level, threat, expected) + paddle.aiError;
}

function liftPaddle(m, paddle, minimumPressMs) {
  paddle.y -= SPAM_LIFT_PX;
  paddle.fall = 0;
  paddle.spamReadyAt = m.t + minimumPressMs;
  m.fx.push(["lift", Math.round(paddle.x), Math.round(paddle.y)]);
}

function dropPaddle(m, paddle, seconds) {
  if (paddle.ai) {
    thinkAi(m, paddle);
    if (paddle.y > paddle.aiTarget && m.t >= paddle.spamReadyAt) liftPaddle(m, paddle, AI_LEVELS[paddle.ai].spamMs);
  }
  paddle.fall = Math.min(SPAM_MAX_FALL, paddle.fall + SPAM_FALL_ACCEL * seconds);
  paddle.y += paddle.fall * seconds;
}

function moveFreely(paddle, step, dir, dirX, target, targetX) {
  const gapY = target !== null ? target - paddle.y : dir * step;
  const gapX = targetX !== null ? targetX - paddle.x : dirX * step;
  const distance = Math.hypot(gapX, gapY);
  if (!distance) return;
  const scale = Math.min(1, step / distance);
  paddle.x += gapX * scale;
  paddle.y += gapY * scale;
}

function keepPaddleOnOwnHalf(paddle) {
  const low = paddle.side === 0 ? FREE_MOVE_EDGE : ARENA_WIDTH / 2 + FREE_MOVE_NET_GAP;
  const high = paddle.side === 0 ? ARENA_WIDTH / 2 - FREE_MOVE_NET_GAP - PADDLE_WIDTH : ARENA_WIDTH - FREE_MOVE_EDGE - PADDLE_WIDTH;
  paddle.x = Math.max(low, Math.min(high, paddle.x));
}

function slidePaddleHome(paddle, seconds) {
  const gap = paddle.homeX - paddle.x;
  paddle.x += Math.sign(gap) * Math.min(Math.abs(gap), PADDLE_SPEED * HOME_SLIDE_SCALE * seconds);
}

function steerPaddle(m, paddle, seconds) {
  const isInverted = m.mods.invert[paddle.side];
  let speed = PADDLE_SPEED * m.mods.paddleSpeed[paddle.side];
  let dir = 0;
  let dirX = 0;
  let target = null;
  let targetX = null;
  if (paddle.ai) {
    thinkAi(m, paddle);
    speed *= AI_LEVELS[paddle.ai].speed * johnSpeedScale(paddle.john);
    target = paddle.aiTarget;
    targetX = paddle.aiTargetX;
  } else if (paddle.target !== null) {
    target = isInverted ? ARENA_HEIGHT - paddle.target : paddle.target;
    targetX = paddle.targetX;
    if (isInverted && targetX !== null) targetX = ARENA_WIDTH - targetX;
  } else {
    dir = isInverted ? -paddle.dir : paddle.dir;
    dirX = isInverted ? -paddle.dirX : paddle.dirX;
  }
  if (m.mods.free2d) {
    moveFreely(paddle, speed * seconds, dir, dirX, target, targetX);
    return;
  }
  if (target !== null) {
    const gap = target - paddle.y;
    paddle.y += Math.sign(gap) * Math.min(Math.abs(gap), speed * seconds);
  } else {
    paddle.y += dir * speed * seconds;
  }
}

function updatePaddle(m, paddle, stepMs) {
  const seconds = stepMs / 1000;
  const growth = m.t < paddle.growUntil ? 1.7 : 1;
  const desiredHeight = PADDLE_HEIGHT * paddle.scale * m.mods.paddleScale[paddle.side] * growth;
  paddle.h += (desiredHeight - paddle.h) * Math.min(1, stepMs * 0.012);
  if (paddle.ai && paddle.challenge && m.t >= paddle.challenge.aiSolveAt) {
    paddle.challenge = null;
    johnSay(m, paddle, "twofa", 0.5);
  }
  const isDisabled = m.mods.frozen[paddle.side] || paddle.challenge || m.t < paddle.stunUntil;
  if (m.mods.spam && !isDisabled) dropPaddle(m, paddle, seconds);
  else if (!isDisabled) steerPaddle(m, paddle, seconds);
  if (m.mods.free2d) keepPaddleOnOwnHalf(paddle);
  else if (paddle.x !== paddle.homeX) slidePaddleHome(paddle, seconds);
  const half = paddle.h / 2;
  paddle.y = Math.max(m.mods.top + half, Math.min(m.mods.bottom - half, paddle.y));
}

function maybeIdleTaunt(m) {
  if (m.t < m.nextIdleTauntAt) return;
  m.nextIdleTauntAt = m.t + randomBetween(m, IDLE_TAUNT_MS[0], IDLE_TAUNT_MS[1]);
  const johns = m.paddles.filter(paddle => paddle.john);
  if (johns.length) johnSay(m, johns[Math.floor(m.rng() * johns.length)], "idle");
}

export function stepMatch(m, stepMs = STEP_MS) {
  if (m.phase === "over") return;
  m.step++;
  m.t += stepMs;
  updateEvents(m);
  for (const paddle of m.paddles) updatePaddle(m, paddle, stepMs);
  updateMeteors(m);
  if (m.boss) stepBoss(m, stepMs);
  if (!m.isPrediction) {
    MODES[m.settings.mode].step?.(m);
    maybeIdleTaunt(m);
  }
  if (m.phase === "serve") {
    if (m.t >= m.serveAt) m.phase = "play";
    return;
  }
  for (const ball of [...m.balls]) {
    if (m.phase !== "play") return;
    if (m.balls.includes(ball)) moveBall(m, ball, stepMs);
  }
}

export function sanitizeInput(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.dir === -1 || raw.dir === 0 || raw.dir === 1) return { dir: raw.dir };
  if (raw.dirX === -1 || raw.dirX === 0 || raw.dirX === 1) return { dirX: raw.dirX };
  if (Number.isFinite(raw.target)) {
    const input = { target: Math.max(0, Math.min(ARENA_HEIGHT, Math.round(raw.target))) };
    if (Number.isFinite(raw.targetX)) input.targetX = Math.max(0, Math.min(ARENA_WIDTH, Math.round(raw.targetX)));
    return input;
  }
  if (raw.spam === true) return { spam: true };
  if (raw.ability === true) return { ability: true };
  if (typeof raw.answer === "string" && /^[0-9]{1,6}$/.test(raw.answer)) return { answer: raw.answer };
  return null;
}

export function applyInput(m, owner, input) {
  const paddle = m.paddles.find(candidate => candidate.owner === owner);
  if (!paddle || paddle.ai) return;
  if (input.dir !== undefined) {
    paddle.dir = input.dir;
    paddle.target = null;
    paddle.targetX = null;
  } else if (input.dirX !== undefined) {
    paddle.dirX = input.dirX;
    paddle.target = null;
    paddle.targetX = null;
  } else if (input.target !== undefined) {
    paddle.target = input.target;
    paddle.targetX = input.targetX ?? null;
    paddle.dir = 0;
    paddle.dirX = 0;
  } else if (input.spam) {
    if (m.mods.spam && m.t >= paddle.spamReadyAt) liftPaddle(m, paddle, SPAM_MIN_PRESS_MS);
  } else if (input.ability) {
    useAbility(m, paddle);
  } else if (input.answer !== undefined) {
    answerChallenge(m, paddle, input.answer);
  }
}

export function setOwnerAi(m, owner, level) {
  for (const paddle of m.paddles) {
    if (paddle.owner !== owner) continue;
    paddle.ai = level;
    paddle.dir = 0;
    paddle.dirX = 0;
    paddle.target = null;
    paddle.targetX = null;
    if (level && paddle.challenge) paddle.challenge = null;
  }
}

export function removeOwner(m, owner) {
  m.paddles = m.paddles.filter(paddle => paddle.owner !== owner);
  if (!MODES[m.settings.mode].isFreeForAll) return;
  rebalancePaddles(m);
  settleFreeForAll(m);
}

export function sideHasHumans(m, side) {
  return m.paddles.some(paddle => paddle.side === side && paddle.owner !== null);
}

export function serializeMatch(m) {
  const fx = m.fx;
  m.fx = [];
  const { bumpers, obstacles, portals, box } = m.objects;
  const hasObjects = bumpers.length || obstacles.length || portals.length || box;
  const isTimed = ev => ev.endsAt < NEVER;
  return {
    t: m.t,
    step: m.step,
    phase: m.phase,
    scores: m.scores,
    serveIn: m.phase === "serve" ? Math.max(0, Math.round(m.serveAt - m.t)) : 0,
    top: m.mods.top,
    bottom: m.mods.bottom,
    paddles: m.paddles.map(p => [p.id, p.side, p.x, p.y, p.h, p.owner, p.ai ? 1 : 0, p.isBoss ? 1 : 0, p, isPaddleCooling(m, p)]),
    balls: m.balls.map(ball => [ball.id, ball.x, ball.y]),
    active: m.active.map(ev => [ev.id, isTimed(ev) ? Math.round(ev.endsAt - m.t) : -1, isTimed(ev) ? Math.round(ev.endsAt - ev.startedAt) : -1, ev.side, Math.round(ev.seed * 1000) / 1000, Math.round(m.t - ev.startedAt)]),
    objects: hasObjects ? m.objects : null,
    mods: m.mods,
    boss: m.boss,
    hazards: m.boss?.hazards ?? [],
    meteors: m.meteors,
    lives: m.lives,
    rules: m.rules,
    johnLevel: m.johnLevel,
    slowUntil: m.slowUntil,
    fx,
  };
}
