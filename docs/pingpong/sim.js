export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 500;
export const PADDLE_WIDTH = 12;
export const PADDLE_HEIGHT = 84;
export const PADDLE_SPEED = 460;
export const BALL_SIZE = 12;
export const STEP_MS = 1000 / 60;
export const MAX_PLAYERS = 8;
export const SCORE_OPTIONS = [3, 5, 7, 11, 15, 21];

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
const PORTAL_RADIUS = 26;
const PORTAL_LOCK_MS = 500;
const BOX_SIZE = 28;
const OBJECT_MARGIN_X = 170;
const OBJECT_MARGIN_Y = 60;
const OBJECT_CENTER_CLEARANCE = 70;

export const AI_LEVELS = {
  easy: { label: "Viegls", reactMs: 420, errorPx: 60, speed: 0.55, predicts: false, seesFakes: false },
  normal: { label: "Normāls", reactMs: 200, errorPx: 30, speed: 0.8, predicts: false, seesFakes: false },
  hard: { label: "Grūts", reactMs: 90, errorPx: 16, speed: 1, predicts: true, seesFakes: false },
  unfair: { label: "Negodīgs", reactMs: 16, errorPx: 3, speed: 1.7, predicts: true, seesFakes: true },
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
    if (!isNearCenter && isClear(x, y)) return { x, y };
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
    id: "ai", group: "player", label: "AI izaicinātājs", info: "Spēlē uz brīdi iesaistās AI rakete", weight: 6, duration: 14000,
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
    id: "confusion", group: "player", label: "Apjukums", info: "Vadība apgriežas otrādi", weight: 8, duration: 8000, slot: "invert",
    mod(mods, ev) { eachSide(ev, side => { mods.invert[side] = true; }); },
  },
  {
    id: "speedy", group: "player", label: "Ātrās rokas", info: "Raketes kustas daudz ātrāk", weight: 9, duration: 10000, slot: "paddleSpeed",
    mod(mods, ev) { eachSide(ev, side => { mods.paddleSpeed[side] *= 1 + 0.7 * ev.strength; }); },
  },
  {
    id: "frozen", group: "player", label: "Sasalis!", info: "Vienas puses raketes uz brīdi sasalst", weight: 7, duration: strength => 2200 * strength, slot: "frozen",
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
      const first = spawnPosition(m, x => x < ARENA_WIDTH / 2) || { x: 240, y: 120 };
      const second = spawnPosition(m, x => x > ARENA_WIDTH / 2) || { x: 560, y: 380 };
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
    id: "suddenDeath", group: "wild", label: "Pēkšņā nāve", info: "Nākamais punkts uzvar, un arēna kļūst arvien trakāka", weight: 2, duration: Infinity, shake: 3,
    canStart: m => Math.max(...m.scores) >= m.target - 2,
    mod(mods, ev, m) {
      mods.ballSpeed *= Math.min(1.8, 1 + (m.t - ev.startedAt) / 25000);
      mods.suddenDeath = true;
    },
  },
];

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
    label: "Boss cīņa", info: "Visi kopā pret AI, kurš ar katru jūsu punktu kļūst stiprāks.", usesEvents: true, minPlayers: 1,
    assignTeams: ids => [ids, []],
    onPoint(m, side) {
      if (side !== 0) return;
      const boss = m.paddles.find(paddle => paddle.isBoss);
      if (!boss) return;
      const stage = bossStage(m);
      if (boss.ai !== stage) m.fx.push(["boss", stage]);
      boss.ai = stage;
      if (m.nextEventAt !== Infinity) m.nextEventAt = m.t + SERVE_MS + 500;
    },
  },
  tournament: { label: "Turnīrs", info: "Izslēgšanas spēles viens pret vienu, līdz paliek viens čempions.", usesEvents: true, minPlayers: 2, isBracket: true },
};

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
    paddleScale: [1, 1], paddleSpeed: [1, 1], invert: [false, false], frozen: [false, false],
    top: 0, bottom: ARENA_HEIGHT,
  };
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
    target: null,
    aiTarget: ARENA_HEIGHT / 2,
    aiThinkAt: 0,
    aiError: 0,
    aiErrorAt: 0,
  };
  m.paddles.push(paddle);
  return paddle;
}

export function createMatch({ settings, teams, rng = Math.random }) {
  const m = {
    settings,
    rng,
    t: 0,
    phase: "serve",
    serveAt: FIRST_SERVE_MS,
    target: settings.targetScore,
    scores: [0, 0],
    paddles: [],
    balls: [],
    active: [],
    objects: { bumpers: [], obstacles: [], portals: [], box: null },
    mods: baseMods(),
    fx: [],
    nextId: 0,
    nextEventAt: Infinity,
    winner: null,
    isForfeit: false,
  };
  teams.forEach((team, side) => {
    const scale = TEAM_PADDLE_SCALE[Math.min(team.length, TEAM_PADDLE_SCALE.length) - 1] ?? 1;
    team.forEach((owner, lane) => addPaddle(m, { side, lane, owner, scale }));
  });
  if (settings.mode === "boss") addPaddle(m, { side: 1, lane: 0, ai: bossStage(m), scale: BOSS_PADDLE_SCALE, isBoss: true });
  else for (const side of [0, 1]) if (!teams[side].length) addPaddle(m, { side, lane: 0, ai: settings.aiDifficulty });
  scheduleNextEvent(m, FIRST_EVENT_DELAY_MS);
  launchBall(m, randomSide(m));
  return m;
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
  m.nextEventAt = interval === null ? Infinity : m.t + Math.max(minimumDelay, interval * eventPressure(m).intervalScale);
}

function rollEvent(m) {
  const activeIds = new Set(m.active.map(ev => ev.id));
  const activeSlots = new Set(m.active.map(ev => EVENTS[ev.id].slot).filter(Boolean));
  const pool = EVENT_LIST.filter(def =>
    (m.settings.chaotic || m.settings.events.includes(def.id)) &&
    !activeIds.has(def.id) &&
    !(def.slot && activeSlots.has(def.slot)) &&
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
  for (const ev of [...m.active]) if (m.t >= ev.endsAt) endEvent(m, ev);
  if (m.phase === "play" && m.t >= m.nextEventAt) {
    if (m.active.length < eventPressure(m).maxActive) {
      const id = rollEvent(m);
      if (id) startEvent(m, id);
    }
    scheduleNextEvent(m);
  }
  const mods = baseMods();
  for (const ev of m.active) EVENTS[ev.id].mod?.(mods, ev, m);
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
}

function bounceOffPaddle(m, ball, paddle) {
  const offset = Math.max(-1, Math.min(1, (ball.y - paddle.y) / (paddle.h / 2)));
  const noise = m.mods.deflectNoise ? randomBetween(m, -m.mods.deflectNoise, m.mods.deflectNoise) : 0;
  const angle = Math.max(-MAX_BOUNCE_ANGLE, Math.min(MAX_BOUNCE_ANGLE, offset * MAX_BOUNCE_ANGLE + noise));
  const speed = Math.min(BALL_MAX_SPEED, Math.hypot(ball.vx, ball.vy) * RALLY_GROWTH);
  const direction = paddle.side === 0 ? 1 : -1;
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
  for (const paddle of m.paddles) {
    if (!hitsPaddle(ball, paddle)) continue;
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
  if (!box || ball.isFake) return;
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
  m.balls = m.balls.filter(other => other !== ball);
  if (ball.isFake) {
    m.fx.push(["puff", Math.round(Math.max(0, Math.min(ARENA_WIDTH, ball.x))), Math.round(ball.y)]);
    return true;
  }
  const concedingSide = isPastLeft ? 0 : 1;
  const scoringSide = m.mods.reverseScoring ? concedingSide : 1 - concedingSide;
  awardPoint(m, scoringSide);
  return true;
}

function awardPoint(m, side) {
  m.scores[side]++;
  m.fx.push(["score", side]);
  const king = m.active.find(ev => ev.id === "king" && ev.side !== side);
  if (king) endEvent(m, king);
  if (m.mods.suddenDeath || m.scores[side] >= m.target) {
    finishMatch(m, side);
    return;
  }
  MODES[m.settings.mode].onPoint?.(m, side);
  if (!m.balls.some(ball => !ball.isFake)) beginServe(m, 1 - side);
}

function beginServe(m, towardSide) {
  m.phase = "serve";
  m.serveAt = m.t + SERVE_MS;
  m.balls = [];
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
    collidePortals(m, ball);
    collideBox(m, ball);
    if (m.phase === "over" || checkGoal(m, ball)) return;
  }
}

function threatFor(m, paddle, level) {
  let threat = null;
  let soonest = Infinity;
  for (const ball of m.balls) {
    if (ball.isFake && level.seesFakes) continue;
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

function thinkAi(m, paddle) {
  if (m.t < paddle.aiThinkAt) return;
  const level = AI_LEVELS[paddle.ai];
  paddle.aiThinkAt = m.t + level.reactMs;
  if (m.t >= paddle.aiErrorAt) {
    paddle.aiError = randomBetween(m, -level.errorPx, level.errorPx);
    paddle.aiErrorAt = m.t + 900;
  }
  const threat = threatFor(m, paddle, level);
  if (!threat) {
    paddle.aiTarget = (m.mods.top + m.mods.bottom) / 2;
    return;
  }
  const faceX = paddle.side === 0 ? paddle.x + PADDLE_WIDTH : paddle.x;
  const expected = level.predicts ? predictBallY(threat, faceX, m.mods.top, m.mods.bottom) : threat.y;
  paddle.aiTarget = expected + paddle.aiError;
}

function updatePaddle(m, paddle, stepMs) {
  const seconds = stepMs / 1000;
  const desiredHeight = PADDLE_HEIGHT * paddle.scale * m.mods.paddleScale[paddle.side];
  paddle.h += (desiredHeight - paddle.h) * Math.min(1, stepMs * 0.012);
  const isInverted = m.mods.invert[paddle.side];
  let speed = PADDLE_SPEED * m.mods.paddleSpeed[paddle.side];
  let dir = 0;
  let target = null;
  if (m.mods.frozen[paddle.side]) {
    speed = 0;
  } else if (paddle.ai) {
    thinkAi(m, paddle);
    speed *= AI_LEVELS[paddle.ai].speed;
    target = paddle.aiTarget;
  } else if (paddle.target !== null) {
    target = isInverted ? ARENA_HEIGHT - paddle.target : paddle.target;
  } else {
    dir = isInverted ? -paddle.dir : paddle.dir;
  }
  if (target !== null) {
    const gap = target - paddle.y;
    paddle.y += Math.sign(gap) * Math.min(Math.abs(gap), speed * seconds);
  } else {
    paddle.y += dir * speed * seconds;
  }
  const half = paddle.h / 2;
  paddle.y = Math.max(m.mods.top + half, Math.min(m.mods.bottom - half, paddle.y));
}

export function stepMatch(m, stepMs = STEP_MS) {
  if (m.phase === "over") return;
  m.t += stepMs;
  updateEvents(m);
  for (const paddle of m.paddles) updatePaddle(m, paddle, stepMs);
  if (m.phase === "serve") {
    if (m.t >= m.serveAt) m.phase = "play";
    return;
  }
  for (const ball of [...m.balls]) {
    if (m.phase !== "play") return;
    if (m.balls.includes(ball)) moveBall(m, ball, stepMs);
  }
}

export function applyInput(m, owner, input) {
  const paddle = m.paddles.find(candidate => candidate.owner === owner);
  if (!paddle) return;
  if (input.dir === -1 || input.dir === 0 || input.dir === 1) {
    paddle.dir = input.dir;
    paddle.target = null;
  }
  if (Number.isFinite(input.target)) {
    paddle.target = Math.max(0, Math.min(ARENA_HEIGHT, input.target));
    paddle.dir = 0;
  }
}

export function setOwnerAi(m, owner, level) {
  for (const paddle of m.paddles) {
    if (paddle.owner !== owner) continue;
    paddle.ai = level;
    paddle.dir = 0;
    paddle.target = null;
  }
}

export function removeOwner(m, owner) {
  m.paddles = m.paddles.filter(paddle => paddle.owner !== owner);
}

export function sideHasHumans(m, side) {
  return m.paddles.some(paddle => paddle.side === side && paddle.owner !== null);
}

export function serializeMatch(m) {
  const fx = m.fx;
  m.fx = [];
  const { bumpers, obstacles, portals, box } = m.objects;
  const hasObjects = bumpers.length || obstacles.length || portals.length || box;
  const { ghost, flip, reverseScoring, suddenDeath, invert, frozen, paddleSpeed, top, bottom, gravityDirection } = m.mods;
  return {
    type: "state",
    t: Math.round(m.t),
    phase: m.phase,
    scores: m.scores,
    serveIn: m.phase === "serve" ? Math.max(0, Math.round(m.serveAt - m.t)) : 0,
    top: Math.round(top),
    bottom: Math.round(bottom),
    paddles: m.paddles.map(p => [p.id, p.side, Math.round(p.x), Math.round(p.y), Math.round(p.h), p.owner, p.ai ? 1 : 0, p.isBoss ? 1 : 0]),
    balls: m.balls.map(ball => [ball.id, Math.round(ball.x), Math.round(ball.y)]),
    active: m.active.map(ev => [ev.id, Number.isFinite(ev.endsAt) ? Math.round(ev.endsAt - m.t) : -1, Number.isFinite(ev.endsAt) ? Math.round(ev.endsAt - ev.startedAt) : -1, ev.side, Math.round(ev.seed * 1000) / 1000, Math.round(m.t - ev.startedAt)]),
    objects: hasObjects ? m.objects : null,
    mods: { ghost, flip, reverseScoring, suddenDeath, invert, frozen, paddleSpeed, gravityDirection },
    fx,
  };
}
