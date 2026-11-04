import { PaintConnection } from "../paint/connection.js?v=2";
import {
  AI_LEVELS, ARENA_HEIGHT, ARENA_WIDTH, BALL_SIZE, EVENTS, EVENT_GROUPS, EVENT_IDS, FREQUENCIES, INTENSITIES, JOHN_ID, MAX_PLAYERS,
  MODES, PADDLE_WIDTH, SCORE_OPTIONS, STEP_MS, createMatch, defaultSettings, serializeMatch, stepMatch,
} from "./sim.js?v=3";
import { MatchPredictor } from "./predict.js?v=3";

const PRODUCTION_SOCKET = "wss://edupage-proxy.loduur.workers.dev";
const LOCAL_SOCKET = "ws://localhost:8790";
const SOCKET_BASE = ["localhost", "127.0.0.1"].includes(location.hostname) ? LOCAL_SOCKET : PRODUCTION_SOCKET;
const CODE_PATTERN = /^[A-HJKMNP-Z2-9]{5}$/;
const STORAGE_KEYS = { name: "paint-name", session: "pingpong-session", muted: "pingpong-muted" };
const ERROR_TEXT = {
  not_found: "Istaba ar šādu kodu nav atrasta",
  full: `Istaba ir pilna (${MAX_PLAYERS} spēlētāji)`,
  expired: "Istaba tika aizvērta neaktivitātes dēļ",
  replaced: "Šī istaba ir atvērta citā cilnē",
};
const TARGET_SEND_INTERVAL_MS = 33;
const PING_FAST_MS = 150;
const PING_SLOW_MS = 1000;
const PING_FAST_COUNT = 4;
const BASS_BOOST_GAIN = 10;
const BASS_BEAT_MS = 468;
const BUBBLE_MS = 2600;
const JOHN_JOIN_MS = 900;
const TYPE_MS_PER_CHAR = 26;
const ATTACK_LINE_MS = 2400;
const ANNOUNCEMENT_MS = 1900;
const MAX_PARTICLES = 110;
const SHOCKWAVE_MS = 450;
const EVENT_LIST_X = 150;
const SHAKE_STRENGTH = [0, 4, 7, 12];
const IS_REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const METEOR_COLORS = ["#ffff55", "#ffaa00", "#ff5500", "#a81f1f"];
const COLOR = { white: "#f1f4ec", dim: "#626b60", faint: "#2a322a", accent: "#72ff91", ice: "#7fd6ff", danger: "#ff6a5e", black: "#000" };
const FONT_FAMILY = '"Press Start 2P", "Courier New", monospace';
const VGA_COLORS = ["#ffff55", "#55ffff", "#ff55ff", "#55ff55", "#ff5555", "#5555ff", "#ffffff", "#ffaa00"];
const JOHN_LINES = {
  join: ["Sveiki. Es esmu John Pong.", "Kas te prasīja profesionāli?", "Būšu maigs. Meloju.", "Atvainojos par kavēšanos. Tagad tu zaudē."],
  scored: ["Tas bija viegli.", "Ieraksti to dienasgrāmatā.", "Vai tu vispār mēģini?", "Paldies par punktu!", "Klasiskais John Pong."],
  conceded: ["Es tev ļāvu.", "Laimīga nejaušība.", "Mana rakete slīdēja!", "Saules stars acīs. Telpās.", "Tagad es esmu dusmīgs."],
  nervous: ["Viss ir kontrolē. Viss.", "Kāpēc te tik karsti?", "Vēl nav beigas. Vai ir?"],
  blunder: ["Ups.", "Es tevi pārbaudīju.", "Kur ir bumba?", "SMS no mammas…", "Šo neskaita."],
  trick: ["Šis būs skaisti.", "Mērķēju stūrī.", "Skaties un mācies."],
  idle: ["Cik ilgi vēl?", "Man šodien vēl trīs spēles.", "Tev labas kurpes. Nekas cits.", "Vai bumbai ir jābūt tik lēnai?"],
  team: ["Labs darbs, komanda!", "Es piespēlēju!", "Tagad tava kārta.", "Mēs! Galvenokārt es."],
  meteor: ["Kurš tur met akmeņus?!", "Tas bija tuvu. Pārāk tuvu.", "Es to speciāli pieļāvu.", "Mana rakete! Mana cepure!"],
  twofa: ["Mans kods vienmēr ir 1234.", "Man atnāca uz pulksteni.", "Nokārtots. Kur tu paliec?"],
  level: ["Labi. Tagad nopietni.", "Uzvilkšu nopietnās zeķes.", "Iesildīšanās beigusies."],
};
const JOHN_LEVEL_NAMES = { easy: "Miegainais John", normal: "Parastais John", hard: "Nopietnais John", unfair: "Negodīgais John" };
const ABILITY_LABELS = { smash: "Spēka sitiens", shield: "Vairogs", blink: "Lēciens", grow: "Milzu rakete", slow: "Palēnināt" };
const RULE_LABELS = {
  fastBall: "Ātra bumba", slowBall: "Lēna bumba", tinyPaddles: "Sīkas raketes", giantPaddles: "Milzu raketes", moonGravity: "Gravitācija",
  curveBall: "Līkā bumba", reverseGoals: "Punkti otrādi", swiftPaddles: "Ātras raketes", heavyPaddles: "Smagas raketes", mirrored: "Vadība otrādi",
};
const CODE_CHIPS = ["U0", "I64", "F64", "{ }", "if", "goto", "#exe", "Ring0"];
const WORD_CHIPS = ["PFF", "LOL", "VĀJI", "OHO", "NU", "ZZZ", "BŪ", "HA"];
const ORACLE_WORDS = ["BUMBA", "RAKETE", "TEMPLIS", "KOMPILATORS", "SPOŽUMS", "KODS", "PIKSELIS", "TASTATŪRA", "KRONIS", "LAIKS", "TUMSA", "GAISMA", "SKOLA", "TĀFELE", "PUNKTS", "MIERS"];
const SPRITE_COLORS = { Y: "#ffff55", R: "#ff5555", S: "#e8c39e", K: "#111111", B: "#5555ff", G: "#8d8d7a" };
const TERRY_SPRITE = [
  ".Y..Y..Y..Y..Y..", ".YY.YY.YY.YY.YY.", ".YYYYYYYYYYYYYY.", ".YRYYYRYYRYYYRY.", "...SSSSSSSSSS...", "...SKKSSSSKKS...", "...SKKSSSSKKS...",
  "...SSSSSSSSSS...", "...SSSKKKKSSS...", "....SSSSSSSS....", ".....SSSSSS.....", "..BBBBBBBBBBBB..", ".BBBBBBYYBBBBBB.", "BBBBBBBYYBBBBBBB",
  "BB.BBBBYYBBBB.BB", "BB.BBBBYYBBBB.BB", "SS.BBBBYYBBBB.SS", "...BBBBYYBBBB...", "...BBBBYYBBBB...", "...BBB....BBB...", "...KKK....KKK...",
];
const GOLEM_SPRITE = [
  "....GGGGGGGGGGG....", "...GGGGGGGGGGGGG...", "...GGRRGGGGGRRGG...", "...GGRRGGGGGRRGG...", "...GGGGGGGGGGGGG...", "...GGKKKKKKKKKGG...", "....GGGGGGGGGGG....",
  "GGGGGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGGGGG", "GGG.GGGGGGGGGGG.GGG", "GGG.GGGKGGGKGGG.GGG", "GGG.GGGGGGGGGGG.GGG", "GGG.GGGGGGGGGGG.GGG", "GGG.GGGKGGGKGGG.GGG",
  "GGG.GGGGGGGGGGG.GGG", "....GGGGGGGGGGG....", "....GGGG...GGGG....", "....GGGG...GGGG....", "....GGGG...GGGG....", "....GGGG...GGGG....", "...GGGGG...GGGGG...",
  "...GGGGG...GGGGG...", "...GGGGG...GGGGG...",
];
const BOSS_INFO = {
  golem: { name: "Pikseļu Golems", sprite: GOLEM_SPRITE, intro: ["* Pikseļi saliekas kopā.", "* Tas ir smags. Un ļoti dusmīgs."], defeat: "* Golems sabirst atpakaļ pikseļos." },
  johnPrime: { name: "John Pong Prime", sprite: null, intro: ["* John Pong atgriežas ar lielāku raketi.", "* Šoreiz viņš izlasīja instrukciju."], defeat: "* John Pong Prime: \"Es tev ļāvu.\"" },
  terry: { name: "King Terry Davis", sprite: TERRY_SPRITE, intro: ["* KING TERRY DAVIS ieņem savu troni.", "* 640×480. 16 krāsas. Vairāk nevajag."], defeat: "* Templis paliek stāvam. Karalis godam atkāpjas." },
};
const ATTACK_LINES = {
  holyC: "* HolyC kompilējas tieši tev virsū!", ring0: "* Šeit viss skrien Ring 0.", temple: "* Templim vajag kolonnas.", redSea: "* RedSea šķiras. Tu paliec vidū.",
  sixteen: "* 16 krāsas. Īsta ir tikai viena bumba.", oracle: "* Orākuls saka: ", lowres: "* 640×480 ir pilnīgi pietiekami.", rockfall: "* Griesti krīt pa vienam pikselim.",
  pillars: "* Golems izaudzē kolonnas.", stomp: "* Golems piesit kāju!", tauntVolley: "* John Pong met vārdus.", tripleServe: "* Trīs servi vienlaikus!", mirror: "* John Pong apgriež tavu vadību.",
};
const TWOFA_PROMPTS = {
  code: () => "Ievadi kodu no SMS",
  reverse: () => "Ievadi kodu no otra gala",
  math: () => "Pierādi, ka neesi robots",
  pick: challenge => `Kurš ir ${challenge.shown}?`,
};
const TWOFA_SYMBOLS = { bumba: "●", rakete: "▮", "trijstūris": "▲" };
const TWOFA_FOOTERS = ["Mēs nekad neprasīsim tavu paroli. Tikai šo.", "Ja tas neesi tu, vienalga ievadi.", "Kods derīgs vēl mirkli.", "Pārbaudi arī mēstuļu mapi.", "Tava rakete gaida apstiprinājumu."];
const IS_COARSE_POINTER = matchMedia("(pointer: coarse)").matches;

const $ = id => document.getElementById(id);
const canvas = $("arena");
const ctx = canvas.getContext("2d", { alpha: false });

const state = {
  connection: null,
  me: null,
  code: null,
  lobby: null,
  predictor: null,
  view: null,
  announcement: null,
  particles: [],
  trails: new Map(),
  shake: 0,
  flash: 0,
  pressedKeys: new Set(),
  sentDir: 0,
  sentDirX: 0,
  pointerTarget: null,
  pointerTargetX: null,
  isPointerDirty: false,
  shockwaves: [],
  lastTargetSentAt: 0,
  queuedActions: [],
  nextPingAt: 0,
  pingCount: 0,
  nextBeatAt: 0,
  bassPulse: 0,
  bubble: null,
  spamPresses: [],
  twofaKey: "",
  twofaEntry: "",
  abilityText: "",
  lastBossCue: "",
  nextExplosionAt: 0,
  typedChars: 0,
  attract: null,
  attractClock: 0,
  lastFrameAt: 0,
  countdownShown: 0,
  renderScale: 1,
};

function readStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {}
}

function readSession() {
  try {
    return JSON.parse(readStorage(sessionStorage, STORAGE_KEYS.session) || "null");
  } catch {
    return null;
  }
}

const sound = {
  context: null,
  isMuted: readStorage(localStorage, STORAGE_KEYS.muted) === "1",
  unlock() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) this.context = new AudioContextClass();
    }
    if (this.context?.state === "suspended") this.context.resume();
  },
  output() {
    if (this.master) return this.master;
    this.master = this.context.createGain();
    this.lowShelf = this.context.createBiquadFilter();
    this.lowShelf.type = "lowshelf";
    this.lowShelf.frequency.value = 120;
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.master.connect(this.lowShelf).connect(this.limiter).connect(this.context.destination);
    return this.master;
  },
  isBassBoosted: false,
  setBassBoost(isOn) {
    if (this.isBassBoosted === isOn || !this.context) return;
    this.isBassBoosted = isOn;
    this.output();
    const at = this.context.currentTime;
    this.master.gain.setTargetAtTime(isOn ? BASS_BOOST_GAIN : 1, at, 0.05);
    this.lowShelf.gain.setTargetAtTime(isOn ? 15 : 0, at, 0.05);
  },
  beep(frequency, duration, { type = "square", gain = 0.045, slideTo = null, delay = 0 } = {}) {
    if (this.isMuted || !this.context || this.context.state !== "running") return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const volume = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    volume.gain.setValueAtTime(gain, start);
    volume.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(volume).connect(this.output());
    oscillator.start(start);
    oscillator.stop(start + duration);
  },
  sequence(notes, step = 0.07, options = {}) {
    notes.forEach((note, index) => this.beep(note, step * 1.3, { ...options, delay: index * step }));
  },
};

function setScreen(screen) {
  document.body.dataset.screen = screen;
  $("menu").hidden = screen !== "menu";
  $("lobby").hidden = screen !== "lobby";
  $("bar-code").textContent = screen === "game" && state.code ? `Kods: ${state.code}` : "";
}

function connectTo(path) {
  sound.unlock();
  state.connection?.stop();
  $("menu-message").textContent = "";
  const connection = new PaintConnection({
    url: `${SOCKET_BASE}${path}`,
    buildHello() {
      const session = readSession();
      const code = connection.url.split("/").pop();
      return { type: "hello", name: $("name").value.trim(), token: session?.code === code ? session.token : undefined };
    },
    onMessage: handleMessage,
    onStatus: handleStatus,
  });
  state.connection = connection;
  connection.connect();
}

function handleStatus({ state: status }) {
  const text = { connecting: "Savieno…", retrying: "Atjauno…", offline: "Nav interneta" }[status] || "";
  $("status").textContent = text;
}

function handleMessage(message) {
  switch (message.type) {
    case "welcome": return handleWelcome(message);
    case "ready": $("status").textContent = ""; return;
    case "lobby": return handleLobby(message);
    case "sync": return handleSync(message);
    case "i": return state.predictor?.ingestRemoteInput(message.o, message.q, message.s, message.i);
    case "pong": return state.predictor?.observePong(message.c, message.s, performance.now());
    case "notice":
      $("lobby-message").textContent = "Vajag vairāk spēlētāju";
      return;
    case "error": return handleServerError(message.code);
  }
}

function handleWelcome({ me, token, code }) {
  state.me = me;
  state.predictor = null;
  state.code = code;
  state.connection.url = `${SOCKET_BASE}/pingpong/lobbies/${code}`;
  writeStorage(sessionStorage, STORAGE_KEYS.session, JSON.stringify({ code, token }));
  const url = new URL(location.href);
  url.searchParams.set("join", code);
  history.replaceState(null, "", url);
}

function leaveToMenu(messageText = "") {
  state.connection?.stop();
  state.connection = null;
  state.me = null;
  state.code = null;
  state.lobby = null;
  state.predictor = null;
  state.view = null;
  sound.setBassBoost(false);
  syncGameControls(null);
  writeStorage(sessionStorage, STORAGE_KEYS.session, null);
  const url = new URL(location.href);
  url.searchParams.delete("join");
  history.replaceState(null, "", url);
  $("overlay").hidden = true;
  $("status").textContent = "";
  $("menu-message").textContent = messageText;
  setScreen("menu");
}

function handleServerError(code) {
  leaveToMenu(ERROR_TEXT[code] || "Radās kļūda");
}

function handleLobby(lobby) {
  const previousPhase = state.lobby?.phase;
  state.lobby = lobby;
  const isPlaying = lobby.phase === "match";
  if (isPlaying && previousPhase !== "match") resetMatchView();
  if (lobby.phase === "lobby") {
    setScreen("lobby");
    renderLobby();
  } else {
    setScreen("game");
  }
  renderOverlay();
}

function resetMatchView() {
  state.predictor = null;
  state.view = null;
  state.announcement = null;
  state.particles = [];
  state.trails.clear();
  state.countdownShown = 0;
  state.sentDir = 0;
  state.sentDirX = 0;
  state.pointerTarget = null;
  state.pointerTargetX = null;
  state.isPointerDirty = false;
  state.shockwaves = [];
  state.queuedActions = [];
  state.nextPingAt = 0;
  state.pingCount = 0;
  state.bubble = null;
  state.spamPresses = [];
  state.twofaKey = "";
  state.twofaEntry = "";
  state.lastBossCue = "";
  sound.setBassBoost(false);
  syncGameControls(null);
}

function playerName(id) {
  if (id === JOHN_ID) return "John Pong";
  return state.lobby?.players.find(player => player.id === id)?.name ?? "Pametis spēli";
}

function teamNames(team) {
  return team.map(playerName).join(", ");
}

function myPaddleRow(view = state.view) {
  return view?.paddles.find(row => row[5] === state.me) ?? null;
}

function myTeam() {
  const row = myPaddleRow();
  if (row) return row[1];
  return state.lobby?.teams?.findIndex(team => team.includes(state.me)) ?? -1;
}

function isHost() {
  return state.lobby?.hostId === state.me;
}

function buildRadioGroup(container, name, options) {
  for (const [value, label] of options) {
    const option = document.createElement("label");
    option.className = "option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.addEventListener("change", () => sendSettings({ [name]: name === "targetScore" ? Number(value) : value }));
    const text = document.createElement("span");
    text.textContent = label;
    option.append(input, text);
    container.append(option);
  }
}

function buildEventList() {
  for (const [group, title] of Object.entries(EVENT_GROUPS)) {
    const section = document.createElement("div");
    section.className = "event-group";
    const head = document.createElement("div");
    head.className = "event-group-head";
    const heading = document.createElement("span");
    heading.textContent = title;
    const groupIds = EVENT_IDS.filter(id => EVENTS[id].group === group);
    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.textContent = "visi";
    allButton.addEventListener("click", () => setEventsEnabled(groupIds, true));
    const noneButton = document.createElement("button");
    noneButton.type = "button";
    noneButton.textContent = "neviens";
    noneButton.addEventListener("click", () => setEventsEnabled(groupIds, false));
    head.append(heading, allButton, noneButton);
    const list = document.createElement("div");
    list.className = "event-list";
    for (const id of groupIds) {
      const label = document.createElement("label");
      label.className = "toggle";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.event = id;
      input.addEventListener("change", () => setEventsEnabled([id], input.checked));
      const text = document.createElement("span");
      text.textContent = EVENTS[id].label;
      const info = document.createElement("small");
      info.textContent = EVENTS[id].info;
      text.append(info);
      label.append(input, text);
      list.append(label);
    }
    section.append(head, list);
    $("event-groups").append(section);
  }
}

function setEventsEnabled(ids, isEnabled) {
  const enabled = new Set(state.lobby.settings.events);
  for (const id of ids) {
    if (isEnabled) enabled.add(id);
    else enabled.delete(id);
  }
  sendSettings({ events: [...enabled] });
}

function sendSettings(settings) {
  state.connection?.send({ type: "settings", settings });
}

function checkRadio(name, value) {
  for (const input of document.getElementsByName(name)) input.checked = input.value === String(value);
}

function renderLobby() {
  const { code, players, hostId, settings } = state.lobby;
  const mode = MODES[settings.mode];
  $("lobby-code").textContent = code;
  $("player-count").textContent = `${players.length}/${MAX_PLAYERS}`;
  const list = $("players");
  list.replaceChildren(...players.map(player => {
    const row = document.createElement("li");
    row.classList.toggle("is-away", !player.isConnected);
    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.name;
    row.append(name);
    const tags = [];
    if (player.id === hostId) tags.push("vadītājs");
    if (player.id === state.me) tags.push("tu");
    if (!player.isConnected) tags.push("atvienots");
    if (tags.length) {
      const tag = document.createElement("span");
      tag.className = "player-tag";
      tag.textContent = tags.join(" · ");
      row.append(tag);
    }
    return row;
  }));
  $("settings-form").disabled = !isHost();
  $("settings-owner").textContent = isHost() ? "tu esi vadītājs" : "maina tikai vadītājs";
  checkRadio("mode", settings.mode);
  checkRadio("targetScore", settings.targetScore);
  checkRadio("frequency", settings.frequency);
  checkRadio("intensity", settings.intensity);
  checkRadio("aiDifficulty", settings.aiDifficulty);
  $("mode-info").textContent = mode.info;
  $("target-score-setting").hidden = mode.fixedTarget !== undefined;
  $("chaotic").checked = settings.chaotic;
  $("ai-enabled").checked = settings.aiEnabled;
  $("event-settings").hidden = !mode.usesEvents;
  $("events-panel").hidden = !mode.usesEvents;
  $("event-count").textContent = settings.chaotic ? "trakajā režīmā visi" : `${settings.events.length}/${EVENT_IDS.length}`;
  for (const input of document.querySelectorAll("[data-event]")) input.checked = settings.events.includes(input.dataset.event);
  const hasEnoughPlayers = players.length >= mode.minPlayers;
  $("start").hidden = !isHost();
  $("start").disabled = !hasEnoughPlayers;
  $("lobby-message").textContent = !isHost()
    ? "Gaidām, kamēr vadītājs sāks spēli…"
    : !hasEnoughPlayers
      ? `Šim režīmam vajag vismaz ${mode.minPlayers} spēlētājus`
      : players.length === 1 && settings.mode !== "boss"
        ? "Esi viens: pretī stāsies John Pong. Uzaicini klasesbiedrus ar kodu!"
        : "";
}

function renderOverlay() {
  const lobby = state.lobby;
  const overlay = $("overlay");
  if (lobby?.phase === "intermission") {
    const [[first], [second]] = lobby.teams;
    overlay.hidden = false;
    $("overlay-kicker").textContent = "Turnīrs · nākamā spēle";
    $("overlay-title").textContent = `${playerName(first)} pret ${playerName(second)}`;
    $("overlay-score").textContent = "";
    $("overlay-detail").textContent = myTeam() >= 0 ? "Gatavojies, tu spēlē!" : "Tu šajā spēlē skaties";
    $("overlay-actions").hidden = true;
    return;
  }
  if (lobby?.phase !== "results" || !lobby.result) {
    overlay.hidden = true;
    return;
  }
  const { winner, scores, teams, isBoss, isForfeit, champion, johnLevel } = lobby.result;
  const resultMode = lobby.settings.mode;
  const mine = teams.findIndex(team => team.includes(state.me));
  overlay.hidden = false;
  if (champion) {
    $("overlay-kicker").textContent = resultMode === "lastStanding" ? "Pēdējā rakete" : "Turnīra čempions";
    $("overlay-title").textContent = playerName(champion);
  } else if (isBoss) {
    $("overlay-kicker").textContent = MODES[resultMode].label;
    $("overlay-title").textContent = winner === 0 ? "Boss uzvarēts!" : "Boss uzvarēja";
  } else {
    $("overlay-kicker").textContent = mine < 0 ? "Spēle beigusies" : mine === winner ? "Uzvara!" : "Zaudējums";
    $("overlay-title").textContent = teamNames(teams[winner]) || "John Pong";
  }
  $("overlay-score").textContent = resultMode === "lastStanding" ? "" : resultMode === "bossRush" ? `${scores[0]} / 3 bosi` : `${scores[0]} : ${scores[1]}`;
  const challengeDetail = resultMode === "johnChallenge" ? `Līmenis ${johnLevel + 1} no ${Object.keys(AI_LEVELS).length}. ` : "";
  $("overlay-detail").textContent = `${challengeDetail}${isForfeit ? "Pretinieks pameta spēli" : isHost() ? "" : "Gaidām vadītāja lēmumu…"}`;
  $("overlay-actions").hidden = !isHost();
  if (!state.resultSoundPlayed) sound.sequence(mine === winner || mine < 0 ? [523, 659, 784, 1047] : [392, 330, 262, 196], 0.13);
  state.resultSoundPlayed = true;
}

function handleSync({ acks, effects, state: matchState }) {
  state.resultSoundPlayed = false;
  state.predictor ??= new MatchPredictor({ me: state.me, settings: state.lobby.settings });
  state.predictor.ingestSync(matchState, acks, performance.now());
  for (const effect of effects) playEffect(effect);
}

function addParticles(x, y, count, color = COLOR.white) {
  for (let index = 0; index < count && state.particles.length < MAX_PARTICLES; index++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 180;
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
  }
}

function addShake(level) {
  if (!IS_REDUCED_MOTION) state.shake = Math.max(state.shake, SHAKE_STRENGTH[level] ?? 0);
}

function announce(text, detail = "", isDanger = false) {
  state.announcement = { text: text.toLocaleUpperCase("lv"), detail, isDanger, startedAt: performance.now() };
  state.flash = 1;
}

function describeSide(side) {
  if (side === null || side === undefined) return "";
  if (side === myTeam()) return "Tava puse!";
  return side === 0 ? "Kreisā puse" : "Labā puse";
}

function paddleRowById(id) {
  return state.view?.paddles.find(row => row[0] === id) ?? null;
}

function showBubble(paddleId, situation, pick) {
  const lines = JOHN_LINES[situation];
  if (!lines) return;
  state.bubble = { paddleId, text: lines[pick % lines.length], startedAt: performance.now() };
  sound.sequence([620, 740, 560], 0.05, { gain: 0.02 });
}

function playEffect([kind, a, b, c]) {
  switch (kind) {
    case "lift":
      sound.beep(520, 0.04, { gain: 0.025 });
      addParticles(a + PADDLE_WIDTH / 2, b + 30, 2, COLOR.accent);
      return;
    case "twofaOk":
      sound.sequence([880, 1175], 0.06);
      return;
    case "twofaBad":
      sound.beep(110, 0.25, { type: "sawtooth", gain: 0.06 });
      $("twofa").classList.remove("is-wrong");
      void $("twofa").offsetWidth;
      $("twofa").classList.add("is-wrong");
      return;
    case "john": {
      const row = paddleRowById(a);
      if (row) addParticles(row[2] + PADDLE_WIDTH / 2, row[3], 16, COLOR.accent);
      sound.sequence([196, 262, 392, 523], 0.06, { type: "triangle", gain: 0.05 });
      return;
    }
    case "taunt":
      showBubble(a, b, c);
      return;
    case "level":
      announce(JOHN_LEVEL_NAMES[a], "Nākamais līmenis!", true);
      sound.sequence([262, 330, 392, 523], 0.1, { type: "sawtooth", gain: 0.05 });
      addShake(2);
      return;
    case "rules":
      announce("Jauni noteikumi", a.map(id => RULE_LABELS[id]).join(" + "));
      sound.sequence([440, 660, 440, 880], 0.07);
      return;
    case "heart":
      sound.sequence([330, 165], 0.1);
      addShake(1);
      return;
    case "out":
      announce(`${playerName(a)} ārā!`, "", true);
      sound.sequence([262, 196, 131, 98], 0.12, { type: "sawtooth", gain: 0.05 });
      addShake(2);
      return;
    case "ability":
      sound.sequence([523, 784], 0.05);
      return;
    case "smash":
      sound.beep(150, 0.14, { slideTo: 60, type: "sawtooth", gain: 0.07 });
      addParticles(a, b, 14, COLOR.danger);
      addShake(2);
      return;
    case "shield":
      sound.beep(880, 0.1, { slideTo: 1320 });
      addParticles(a, b, 10, COLOR.ice);
      return;
    case "zap":
      sound.beep(90, 0.18, { type: "sawtooth", gain: 0.06 });
      addParticles(a, b, 10, COLOR.danger);
      addShake(1);
      return;
    case "bossHit":
      sound.beep(180, 0.16, { slideTo: 70, type: "square", gain: 0.07 });
      addParticles(a, b, 16, VGA_COLORS[Math.floor(Math.random() * VGA_COLORS.length)]);
      addShake(2);
      state.flash = Math.max(state.flash, 0.35);
      return;
    case "bossIntro":
      sound.sequence([55, 55, 82, 55, 110, 73], 0.2, { type: "sawtooth", gain: 0.06 });
      addShake(3);
      state.flash = 1;
      return;
    case "bossDown":
      sound.sequence([523, 494, 440, 392, 330, 262, 196, 131, 98, 65], 0.16, { type: "sawtooth", gain: 0.06 });
      addShake(3);
      state.flash = 1;
      return;
    case "drop":
      sound.sequence([220, 165], 0.1);
      addShake(1);
      return;
    case "oracle":
      sound.beep(1400, 0.28, { slideTo: 120, type: "sawtooth", gain: 0.05 });
      addParticles(a, b, 18, COLOR.accent);
      addShake(2);
      return;
    case "stomp":
      sound.beep(70, 0.32, { type: "square", gain: 0.08 });
      addShake(3);
      return;
    case "paddle":
      sound.beep(440, 0.06);
      addParticles(a, b, 6);
      return;
    case "wall":
      sound.beep(220, 0.05, { gain: 0.03 });
      return;
    case "bumper":
      sound.beep(660, 0.09, { slideTo: 990 });
      addParticles(a, b, 8, COLOR.accent);
      return;
    case "block":
      sound.beep(180, 0.06);
      addParticles(a, b, 4, COLOR.dim);
      return;
    case "portal":
      sound.beep(300, 0.2, { slideTo: 1400, type: "sawtooth", gain: 0.03 });
      addParticles(a, b, 30, COLOR.accent);
      state.shockwaves.push({ x: a, y: b, startedAt: performance.now(), color: COLOR.ice });
      state.flash = Math.max(state.flash, 0.25);
      return;
    case "meteorWarn":
      sound.sequence([1046, 784], 0.08, { gain: 0.03 });
      return;
    case "meteorHit":
      sound.beep(320, 0.1, { slideTo: 140 });
      addParticles(a, b, 10, METEOR_COLORS[1]);
      return;
    case "meteorImpact":
      sound.beep(95, 0.34, { slideTo: 35, type: "sawtooth", gain: 0.08 });
      for (const color of METEOR_COLORS) addParticles(a, b, 10, color);
      state.shockwaves.push({ x: a, y: b, startedAt: performance.now(), color: METEOR_COLORS[1] });
      addShake(2);
      return;
    case "puff":
      sound.beep(1200, 0.14, { slideTo: 200, type: "triangle" });
      addParticles(a, b, 14, COLOR.dim);
      return;
    case "score":
      sound.sequence([330, 220, 165], 0.09);
      addShake(1);
      state.flash = 0.5;
      return;
    case "bonus":
      announce("+1 punkts!", describeSide(a));
      sound.sequence([784, 1047, 1319], 0.07);
      return;
    case "boss":
      announce(`Boss: ${AI_LEVELS[a].label}`, "Boss kļūst stiprāks!", true);
      sound.sequence([110, 98, 82], 0.16, { type: "sawtooth", gain: 0.06 });
      addShake(2);
      return;
    case "event": {
      if (a === "kingTerry") return;
      const def = EVENTS[a];
      announce(def.label, describeSide(b) || def.info, a === "suddenDeath");
      sound.sequence(c >= 3 ? [110, 147, 110, 82] : [523, 784, 659, 1047], 0.07, c >= 3 ? { type: "sawtooth", gain: 0.06 } : {});
      addShake(c);
      return;
    }
  }
}

function currentKeyDirX() {
  const left = state.pressedKeys.has("left");
  const right = state.pressedKeys.has("right");
  return left === right ? 0 : left ? -1 : 1;
}

function currentKeyDir() {
  const up = state.pressedKeys.has("up");
  const down = state.pressedKeys.has("down");
  return up === down ? 0 : up ? -1 : 1;
}

function gatherLocalInputs() {
  if (state.lobby?.phase !== "match" || !state.predictor?.match?.paddles.some(paddle => paddle.owner === state.me)) return [];
  const inputs = [];
  const isFree = Boolean(state.predictor.match.mods.free2d);
  const dir = currentKeyDir();
  if (dir !== state.sentDir) {
    state.sentDir = dir;
    state.pointerTarget = null;
    state.isPointerDirty = false;
    inputs.push({ dir });
  }
  const dirX = isFree ? currentKeyDirX() : 0;
  if (dirX !== state.sentDirX) {
    state.sentDirX = dirX;
    state.pointerTarget = null;
    state.isPointerDirty = false;
    inputs.push({ dirX });
  }
  const now = performance.now();
  if (state.isPointerDirty && dir === 0 && dirX === 0 && now - state.lastTargetSentAt >= TARGET_SEND_INTERVAL_MS) {
    state.lastTargetSentAt = now;
    state.isPointerDirty = false;
    const input = { target: Math.round(state.pointerTarget) };
    if (isFree) input.targetX = Math.round(state.pointerTargetX);
    inputs.push(input);
  }
  inputs.push(...state.queuedActions);
  state.queuedActions = [];
  return inputs;
}

function sendLocalInput({ seq, step, input }) {
  state.connection?.send({ type: "input", q: seq, s: step, i: input });
}

function pressSpam() {
  sound.unlock();
  state.queuedActions.push({ spam: true });
  const now = performance.now();
  state.spamPresses.push(now);
  while (state.spamPresses.length && now - state.spamPresses[0] > 1000) state.spamPresses.shift();
}

function useMyAbility() {
  state.queuedActions.push({ ability: true });
}

function isMatchInputActive() {
  return state.lobby?.phase === "match" && state.view !== null;
}

function enterTwofaDigit(digit) {
  const challenge = myPaddleRow()?.[8].challenge;
  if (!challenge) return;
  state.twofaEntry += digit;
  sound.beep(700, 0.03, { gain: 0.02 });
  if (state.twofaEntry.length < challenge.answer.length) return;
  state.queuedActions.push({ answer: state.twofaEntry });
  state.twofaEntry = "";
}

const KEY_DIRECTIONS = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };

function isTypingTarget(target) {
  return target instanceof HTMLInputElement && target.type !== "radio" && target.type !== "checkbox";
}

addEventListener("keydown", event => {
  sound.unlock();
  if (isTypingTarget(event.target) || !isMatchInputActive()) return;
  const direction = KEY_DIRECTIONS[event.code];
  if (direction) {
    event.preventDefault();
    state.pressedKeys.add(direction);
    return;
  }
  if (event.code === "Space" && state.view.mods.spam) {
    event.preventDefault();
    if (!event.repeat) pressSpam();
    return;
  }
  if (event.code === "KeyE" && !event.repeat) return useMyAbility();
  if (/^[0-9]$/.test(event.key) && !event.repeat) return enterTwofaDigit(event.key);
  if (event.code === "Backspace") state.twofaEntry = state.twofaEntry.slice(0, -1);
});

addEventListener("keyup", event => {
  const direction = KEY_DIRECTIONS[event.code];
  if (direction) state.pressedKeys.delete(direction);
});

addEventListener("blur", () => state.pressedKeys.clear());

addEventListener("pointerdown", event => {
  if (!isMatchInputActive() || !state.view.mods.spam || event.target instanceof HTMLButtonElement) return;
  pressSpam();
});

function handlePointer(event) {
  if (!isMatchInputActive()) return;
  const bounds = canvas.getBoundingClientRect();
  const rawY = (event.clientY - bounds.top) / bounds.height * ARENA_HEIGHT;
  state.pointerTarget = state.view.mods.flip ? ARENA_HEIGHT - rawY : rawY;
  state.pointerTargetX = (event.clientX - bounds.left) / bounds.width * ARENA_WIDTH;
  state.isPointerDirty = true;
}

canvas.addEventListener("pointermove", handlePointer);
canvas.addEventListener("pointerdown", event => {
  sound.unlock();
  handlePointer(event);
});

function setFont(size) {
  ctx.font = `${size}px ${FONT_FAMILY}`;
}

function drawText(text, x, y, size, color = COLOR.white, align = "center") {
  setFont(size);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawNet(view) {
  ctx.fillStyle = view.mods.free2d ? COLOR.accent : COLOR.faint;
  for (let y = 10; y < ARENA_HEIGHT; y += 26) ctx.fillRect(ARENA_WIDTH / 2 - 2, y, 4, 14);
}

function drawWalls(view) {
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(0, 0, ARENA_WIDTH, 3);
  ctx.fillRect(0, ARENA_HEIGHT - 3, ARENA_WIDTH, 3);
  const wallColor = view.mods.redSea ? "#a81f1f" : COLOR.dim;
  if (view.top > 0) drawHatchedWall(0, view.top, wallColor);
  if (view.bottom < ARENA_HEIGHT) drawHatchedWall(view.bottom, ARENA_HEIGHT - view.bottom, wallColor);
  if (view.mods.rightWall) {
    ctx.fillStyle = COLOR.white;
    ctx.fillRect(ARENA_WIDTH - 3, 0, 3, ARENA_HEIGHT);
  }
}

function drawHatchedWall(y, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, y, ARENA_WIDTH, height);
  ctx.fillStyle = COLOR.black;
  for (let x = 0; x < ARENA_WIDTH; x += 24) ctx.fillRect(x, y, 12, height);
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(0, y === 0 ? height - 3 : y, ARENA_WIDTH, 3);
}

function drawPortal(portal, index, now) {
  const color = index === 0 ? COLOR.accent : COLOR.ice;
  const spin = index === 0 ? 1 : -1;
  const pulse = 1 + Math.sin(now / 170) * 0.05;
  ctx.globalAlpha = 0.16 + Math.abs(Math.sin(now / 300)) * 0.12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(portal.x, portal.y, portal.r * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  for (const [ratio, width, dash] of [[1, 6, 18], [0.7, 4, 12], [0.4, 3, 7]]) {
    ctx.lineWidth = width;
    ctx.setLineDash([dash, dash * 0.6]);
    ctx.lineDashOffset = now / (18 * ratio) * spin;
    ctx.beginPath();
    ctx.arc(portal.x, portal.y, portal.r * ratio * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  for (let spark = 0; spark < 8; spark++) {
    const angle = spark / 8 * Math.PI * 2 + now / 260 * spin;
    const reach = portal.r * (1.12 + Math.sin(now / 200 + spark) * 0.1);
    ctx.fillRect(portal.x + Math.cos(angle) * reach - 2, portal.y + Math.sin(angle) * reach - 2, 4, 4);
  }
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(portal.x - 4, portal.y - 4, 8, 8);
  ctx.lineWidth = 3;
}

function drawMeteorWarning(meteor, view, now) {
  const leftMs = meteor.landsAt - view.t;
  const urgency = Math.max(0, Math.min(1, 1 - leftMs / 1500));
  const isBright = Math.floor(now / (130 - urgency * 80)) % 2 === 0;
  ctx.strokeStyle = isBright ? COLOR.danger : METEOR_COLORS[0];
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -now / 25;
  ctx.beginPath();
  ctx.moveTo(meteor.startX, 0);
  ctx.lineTo(meteor.targetX, meteor.targetY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(meteor.targetX, meteor.targetY, meteor.blast, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.08 + urgency * 0.22;
  ctx.beginPath();
  ctx.arc(meteor.targetX, meteor.targetY, meteor.blast * urgency, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillRect(meteor.targetX - 12, meteor.targetY - 1, 24, 3);
  ctx.fillRect(meteor.targetX - 1, meteor.targetY - 12, 3, 24);
}

function drawMeteorBody(meteor, now) {
  const dx = meteor.targetX - meteor.startX;
  const dy = meteor.targetY - meteor.startY;
  const length = Math.hypot(dx, dy) || 1;
  for (let segment = 8; segment >= 1; segment--) {
    const flicker = (segment * 7 + Math.floor(now / 40)) % 5 - 2;
    const size = Math.max(3, meteor.r * 1.7 - segment * 2.1);
    ctx.fillStyle = METEOR_COLORS[Math.min(METEOR_COLORS.length - 1, Math.floor(segment / 2.4))];
    ctx.globalAlpha = 1 - segment * 0.09;
    ctx.fillRect(meteor.x - dx / length * segment * 13 + flicker * 2 - size / 2, meteor.y - dy / length * segment * 13 - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
  const size = meteor.r * 2;
  ctx.fillStyle = "#3b2a20";
  ctx.fillRect(meteor.x - meteor.r, meteor.y - meteor.r, size, size);
  ctx.fillStyle = METEOR_COLORS[1];
  ctx.fillRect(meteor.x - meteor.r, meteor.y + meteor.r - 5, size, 5);
  ctx.fillRect(meteor.x - 4, meteor.y - 4, 7, 7);
  ctx.strokeStyle = METEOR_COLORS[0];
  ctx.lineWidth = 2;
  ctx.strokeRect(meteor.x - meteor.r, meteor.y - meteor.r, size, size);
}

function drawMeteors(view, now) {
  for (const meteor of view.meteors) {
    drawMeteorWarning(meteor, view, now);
    if (view.t >= meteor.warnUntil) drawMeteorBody(meteor, now);
  }
}

function drawShockwaves(now) {
  state.shockwaves = state.shockwaves.filter(wave => now - wave.startedAt < SHOCKWAVE_MS);
  for (const wave of state.shockwaves) {
    const progress = (now - wave.startedAt) / SHOCKWAVE_MS;
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = wave.color;
    ctx.lineWidth = 8 * (1 - progress) + 1;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, 12 + progress * 80, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawObjects(objects, now) {
  if (!objects) return;
  ctx.lineWidth = 3;
  for (const bumper of objects.bumpers) {
    ctx.strokeStyle = COLOR.accent;
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLOR.accent;
    ctx.fillRect(bumper.x - 3, bumper.y - 3, 6, 6);
  }
  ctx.fillStyle = COLOR.dim;
  for (const block of objects.obstacles) ctx.fillRect(block.x, block.y, block.w, block.h);
  objects.portals.forEach((portal, index) => drawPortal(portal, index, now));
  if (objects.box) {
    const { x, y, s } = objects.box;
    const isBright = Math.floor(now / 250) % 2 === 0;
    ctx.fillStyle = isBright ? COLOR.accent : COLOR.white;
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
    drawText("?", x + 1, y + 1, 16, COLOR.black);
  }
}

function kingSide(view) {
  return view.active.find(row => row[0] === "king")?.[3] ?? null;
}

function drawHearts(x, y, count) {
  ctx.fillStyle = COLOR.danger;
  for (let index = 0; index < count; index++) {
    const heartX = x + index * 10;
    ctx.fillRect(heartX, y, 3, 3);
    ctx.fillRect(heartX + 4, y, 3, 3);
    ctx.fillRect(heartX, y + 3, 7, 2);
    ctx.fillRect(heartX + 2, y + 5, 3, 2);
  }
}

function drawJohnLook(x, y, top, height, paddle, view, now) {
  const john = paddle.john;
  const centerX = x + PADDLE_WIDTH / 2;
  const scale = Math.min(2.4, Math.max(1, PADDLE_WIDTH / 12));
  ctx.fillStyle = COLOR.dim;
  ctx.fillRect(centerX - 12, top - 5, 24, 3);
  ctx.fillRect(centerX - 7, top - 13, 14, 8);
  const nearestBall = view.balls[0];
  const gazeY = nearestBall ? Math.max(-2, Math.min(2, (nearestBall[2] - y) / 80)) : 0;
  const eyeY = Math.max(top + 4, y - height * 0.22);
  if (john.mood === "cocky") {
    ctx.fillStyle = COLOR.black;
    ctx.fillRect(x - 3, eyeY, PADDLE_WIDTH + 6, 3);
    ctx.fillRect(x, eyeY, 5, 5);
    ctx.fillRect(x + 7, eyeY, 5, 5);
  } else {
    ctx.fillStyle = john.mood === "angry" ? COLOR.danger : COLOR.black;
    ctx.fillRect(x + 2, eyeY + gazeY, 3 * scale, 3 * scale);
    ctx.fillRect(x + 7, eyeY + gazeY, 3 * scale, 3 * scale);
    if (john.mood === "angry") {
      ctx.fillStyle = COLOR.black;
      ctx.fillRect(x + 1, eyeY - 3, 10, 2);
    }
  }
  ctx.fillStyle = COLOR.black;
  ctx.fillRect(x + 3, eyeY + 9, john.mood === "nervous" ? 3 : 6, 2);
  if (john.mood === "nervous") {
    ctx.fillStyle = COLOR.ice;
    ctx.fillRect(x - 5, top + 6 + (now / 18) % 24, 3, 5);
  }
}

function drawPaddles(view, now) {
  const king = kingSide(view);
  for (const row of view.paddles) {
    const [, side, x, y, height, owner, isAi, isBoss, paddle, isCooling] = row;
    const isMine = owner === state.me && state.me !== null;
    const top = y - height / 2;
    const isFrozen = view.mods.frozen[side];
    const isStunned = view.t < paddle.stunUntil;
    const joinAge = paddle.john ? view.t - paddle.john.joinedAt : Infinity;
    const isMaterializing = joinAge < JOHN_JOIN_MS;
    ctx.globalAlpha = isCooling ? 0.3 : isMaterializing ? (Math.floor(now / 60) % 2 ? 0.25 : 0.9) : 1;
    ctx.fillStyle = isStunned ? (Math.floor(now / 70) % 2 ? COLOR.danger : COLOR.white) : isFrozen || paddle.challenge ? COLOR.ice : isAi && !paddle.john ? "#a9b2a5" : COLOR.white;
    ctx.fillRect(x, top, PADDLE_WIDTH, height);
    ctx.globalAlpha = 1;
    if (isAi && !paddle.john) {
      ctx.fillStyle = COLOR.black;
      for (let stripe = top + 6; stripe < top + height - 4; stripe += 12) ctx.fillRect(x, stripe, PADDLE_WIDTH, 4);
    }
    if (paddle.john && !isMaterializing) drawJohnLook(x, y, top, height, paddle, view, now);
    if (isMine) {
      ctx.fillStyle = COLOR.accent;
      ctx.fillRect(side === 0 ? x - 5 : x + PADDLE_WIDTH + 2, top + 2, 3, height - 4);
    }
    if (view.t < paddle.shieldUntil) {
      ctx.fillStyle = COLOR.ice;
      ctx.fillRect(side === 0 ? 0 : ARENA_WIDTH - 6, 0, 6, ARENA_HEIGHT);
    }
    if (view.t < paddle.smashUntil) {
      ctx.strokeStyle = COLOR.danger;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 3, top - 3, PADDLE_WIDTH + 6, height + 6);
    }
    if (paddle.lives !== null) drawHearts(x - 8, top - 24, paddle.lives);
    if (paddle.challenge) drawText("2FA", x + PADDLE_WIDTH / 2, top - (paddle.john ? 24 : 12), 8, COLOR.ice);
    else if (isBoss) drawText("BOSS", x - 18, top - 8, 9, COLOR.danger, "right");
    else if (paddle.john) drawText(joinAge < 3000 ? "JOHN PONG" : "JOHN", Math.max(42, Math.min(ARENA_WIDTH - 42, x + PADDLE_WIDTH / 2)), top - 22, 8, COLOR.dim);
    else if (isAi) drawText("ATVIENOTS", x + PADDLE_WIDTH / 2, top - 12, 8, COLOR.dim);
    if (king === side) drawCrown(x + PADDLE_WIDTH / 2, top - (paddle.john ? 34 : 14));
  }
}

function drawJohnBubble(view, now) {
  const bubble = state.bubble;
  if (!bubble) return;
  const age = now - bubble.startedAt;
  const row = view.paddles.find(candidate => candidate[0] === bubble.paddleId);
  if (age > BUBBLE_MS || !row) {
    state.bubble = null;
    return;
  }
  const [, side, x, y, height] = row;
  const size = 9;
  setFont(size);
  const width = Math.min(360, ctx.measureText(bubble.text).width) + 18;
  const boxX = side === 0 ? x + 26 : x - 14 - width;
  const rawY = view.mods.flip ? ARENA_HEIGHT - y : y;
  const boxY = Math.max(24, Math.min(ARENA_HEIGHT - 44, rawY - height / 2 - 6));
  const shown = bubble.text.slice(0, Math.ceil(age / TYPE_MS_PER_CHAR));
  ctx.globalAlpha = Math.min(1, (BUBBLE_MS - age) / 250);
  ctx.fillStyle = COLOR.black;
  ctx.fillRect(boxX, boxY, width, 22);
  ctx.strokeStyle = COLOR.white;
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, width, 22);
  drawText(fitText(shown, 340, size), boxX + 9, boxY + 12, size, COLOR.white, "left");
  ctx.globalAlpha = 1;
}

function drawSprite(sprite, centerX, centerY, pixel, isFlashing, alpha) {
  const originX = centerX - sprite[0].length * pixel / 2;
  const originY = centerY - sprite.length * pixel / 2;
  ctx.globalAlpha = alpha;
  sprite.forEach((line, rowIndex) => {
    for (let column = 0; column < line.length; column++) {
      const key = line[column];
      if (key === ".") continue;
      ctx.fillStyle = isFlashing ? COLOR.white : SPRITE_COLORS[key];
      ctx.fillRect(originX + column * pixel, originY + rowIndex * pixel, pixel, pixel);
    }
  });
  ctx.globalAlpha = 1;
}

function drawJohnPrime(boss, isFlashing, alpha) {
  const left = boss.x - boss.w / 2;
  const top = boss.y - boss.h / 2;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = isFlashing ? COLOR.danger : COLOR.white;
  ctx.fillRect(left, top, boss.w, boss.h);
  ctx.fillStyle = COLOR.dim;
  ctx.fillRect(left - 12, top - 8, boss.w + 24, 8);
  ctx.fillRect(left + 4, top - 26, boss.w - 8, 18);
  ctx.fillStyle = COLOR.black;
  ctx.fillRect(left - 4, top + 26, boss.w + 8, 6);
  ctx.fillRect(left + 3, top + 26, 15, 12);
  ctx.fillRect(left + boss.w - 18, top + 26, 15, 12);
  ctx.fillRect(left + 10, top + 58, boss.w - 20, 5);
  ctx.globalAlpha = 1;
}

function drawBoss(view, now) {
  const boss = view.boss;
  if (!boss) return;
  const info = BOSS_INFO[boss.id];
  const isIntro = boss.phase === "intro";
  const isDown = boss.phase === "defeat" || boss.phase === "leave";
  const introGrowth = isIntro ? Math.min(1, (view.t - boss.startedAt) / 1200) : 1;
  const downFade = isDown ? Math.max(0, (boss.phaseEndsAt - view.t) / 2400) : 1;
  const alpha = isDown ? (Math.floor(now / 70) % 2 ? downFade : downFade * 0.4) : introGrowth < 1 && Math.floor(now / 90) % 2 ? 0.45 : 1;
  const isFlashing = view.t < boss.invulnerableUntil && Math.floor(now / 50) % 2 === 0;
  if (info.sprite) drawSprite(info.sprite, boss.x, boss.y, 4, isFlashing, alpha);
  else drawJohnPrime(boss, isFlashing, alpha);
  if (boss.id === "terry" && boss.phase === "fight") {
    ctx.strokeStyle = VGA_COLORS[Math.floor(now / 200) % VGA_COLORS.length];
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = now / 20;
    ctx.strokeRect(boss.x - boss.w / 2 - 8, boss.y - boss.h / 2 - 8, boss.w + 16, boss.h + 16);
    ctx.setLineDash([]);
  }
  for (const hazard of view.hazards) drawHazard(hazard, now);
}

function drawHazard(hazard, now) {
  if (hazard.kind === "code" || hazard.kind === "word") {
    const chips = hazard.kind === "code" ? CODE_CHIPS : WORD_CHIPS;
    drawText(chips[hazard.chip % chips.length], hazard.x, hazard.y, 11, VGA_COLORS[hazard.chip % VGA_COLORS.length]);
    return;
  }
  ctx.fillStyle = hazard.kind === "rock" ? "#8d8d7a" : VGA_COLORS[(hazard.id + Math.floor(now / 120)) % VGA_COLORS.length];
  ctx.fillRect(hazard.x - hazard.r, hazard.y - hazard.r, hazard.r * 2, hazard.r * 2);
}

function drawLowRes(view, now) {
  if (!view.mods.lowRes) return;
  const tile = 40;
  const shift = Math.floor(now / 380);
  ctx.fillStyle = COLOR.black;
  for (let column = 0; column * tile < ARENA_WIDTH; column++) {
    for (let line = 0; line * tile < ARENA_HEIGHT; line++) {
      if ((column * 7 + line * 13 + shift) % 4 === 0) ctx.fillRect(column * tile, line * tile, tile, tile);
    }
  }
}

function currentBossLine(view) {
  const boss = view.boss;
  const info = BOSS_INFO[boss.id];
  if (boss.phase === "intro") {
    const elapsed = view.t - boss.startedAt;
    const index = elapsed < 2100 ? 0 : 1;
    return { text: info.intro[index], age: index === 0 ? elapsed : elapsed - 2100 };
  }
  if (boss.phase === "defeat") return { text: info.defeat, age: 3400 - (boss.phaseEndsAt - view.t) };
  if (boss.phase === "leave") return { text: `* ${info.name} zaudē interesi un aiziet.`, age: 2200 - (boss.phaseEndsAt - view.t) };
  const attack = boss.attack;
  if (!attack || view.t - attack.startedAt > ATTACK_LINE_MS) return null;
  const line = ATTACK_LINES[attack.id] + (attack.id === "oracle" ? ORACLE_WORDS[attack.word % ORACLE_WORDS.length] : "");
  return { text: line, age: view.t - attack.startedAt };
}

function drawBossHud(view) {
  const boss = view.boss;
  const info = BOSS_INFO[boss.id];
  const barWidth = 340;
  const barX = ARENA_WIDTH / 2 - barWidth / 2;
  const introFill = boss.phase === "intro" ? Math.min(1, (view.t - boss.startedAt) / 1800) : 1;
  drawText(info.name.toLocaleUpperCase("lv"), ARENA_WIDTH / 2, 20, 12, boss.stage >= 3 ? COLOR.danger : COLOR.white);
  ctx.fillStyle = COLOR.faint;
  ctx.fillRect(barX, 34, barWidth, 10);
  ctx.fillStyle = boss.stage === 1 ? COLOR.accent : boss.stage === 2 ? "#ffff55" : COLOR.danger;
  ctx.fillRect(barX, 34, barWidth * (boss.hp / boss.maxHp) * introFill, 10);
  ctx.strokeStyle = COLOR.white;
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, 34, barWidth, 10);
  if (view.lives !== null) {
    drawHearts(20, 22, view.lives);
    drawText(`BOSS ${view.scores[0] + 1}/3`, ARENA_WIDTH - 20, 26, 9, COLOR.dim, "right");
  } else {
    drawText(`${view.boss.tally[0]}`, barX - 20, 40, 11, COLOR.dim, "right");
    drawText(`${view.boss.tally[1]}`, barX + barWidth + 20, 40, 11, COLOR.dim, "left");
  }
  const line = currentBossLine(view);
  if (!line) return;
  const chars = Math.max(0, Math.ceil(line.age / TYPE_MS_PER_CHAR));
  if (chars !== state.typedChars && chars < line.text.length && chars % 2 === 0) sound.beep(240, 0.025, { gain: 0.015 });
  state.typedChars = chars;
  const boxWidth = 620;
  const boxX = ARENA_WIDTH / 2 - boxWidth / 2;
  const boxY = ARENA_HEIGHT - 66;
  ctx.fillStyle = COLOR.black;
  ctx.fillRect(boxX, boxY, boxWidth, 46);
  ctx.strokeStyle = COLOR.white;
  ctx.lineWidth = 3;
  ctx.strokeRect(boxX, boxY, boxWidth, 46);
  drawText(fitText(line.text.slice(0, chars), boxWidth - 28, 11), boxX + 14, boxY + 24, 11, COLOR.white, "left");
}

function syncBossCues(view, now) {
  const boss = view.boss;
  if (!boss) {
    state.lastBossCue = "";
    return;
  }
  if (boss.phase === "defeat" && now >= state.nextExplosionAt) {
    state.nextExplosionAt = now + 170;
    addParticles(boss.x + (Math.random() - 0.5) * boss.w, boss.y + (Math.random() - 0.5) * boss.h, 14, VGA_COLORS[Math.floor(Math.random() * VGA_COLORS.length)]);
    sound.beep(70 + Math.random() * 80, 0.14, { type: "sawtooth", gain: 0.05 });
    addShake(2);
  }
  const cue = `${boss.stage}:${boss.attack?.id ?? ""}:${boss.attack?.startedAt ?? ""}`;
  if (cue === state.lastBossCue) return;
  const wasStage = Number(state.lastBossCue.split(":")[0]);
  state.lastBossCue = cue;
  if (boss.attack) sound.sequence([165, 220, 330], 0.07, { type: "sawtooth", gain: 0.05 });
  if (wasStage && wasStage !== boss.stage) {
    announce(`${boss.stage}. fāze`, "Uzbrukumi kļūst bīstamāki!", true);
    sound.sequence([110, 147, 196, 262], 0.1, { type: "sawtooth", gain: 0.06 });
  }
}

function updateBassBoost(view, now, deltaMs) {
  const isOn = Boolean(view?.mods.bassBoost) && state.lobby?.phase === "match";
  sound.setBassBoost(isOn);
  state.bassPulse *= Math.pow(0.992, deltaMs);
  if (!isOn || now < state.nextBeatAt) return;
  state.nextBeatAt = now + BASS_BEAT_MS;
  state.bassPulse = 1;
  sound.beep(100, 0.2, { type: "sine", gain: 0.3, slideTo: 42 });
  addShake(1);
}

function drawBassBoostMeter(view, now) {
  if (!view.mods.bassBoost) return;
  const blink = Math.floor(now / 110) % 2 === 0;
  drawText("BASS BOOST 1000%", ARENA_WIDTH / 2, 132, 16, blink ? COLOR.danger : "#ffff55");
  const bars = 20;
  for (let index = 0; index < bars; index++) {
    const level = 0.4 + 0.6 * state.bassPulse * Math.abs(Math.sin(index * 1.7 + now / 90));
    ctx.fillStyle = index > 14 ? COLOR.danger : index > 9 ? "#ffff55" : COLOR.accent;
    ctx.fillRect(ARENA_WIDTH / 2 - 150 + index * 15, 172 - 22 * level, 11, 22 * level);
  }
  ctx.globalAlpha = state.bassPulse * 0.5;
  ctx.strokeStyle = COLOR.danger;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, ARENA_WIDTH - 10, ARENA_HEIGHT - 10);
  ctx.globalAlpha = 1;
}

function drawSpamPrompt(view, now) {
  if (!view.mods.spam || !myPaddleRow(view)) return;
  const nowMs = performance.now();
  const pressesPerSecond = state.spamPresses.filter(at => nowMs - at < 1000).length;
  const hint = IS_COARSE_POINTER ? "SIT PA EKRĀNU!" : "ATSTARPE VAI PELE!";
  drawText(Math.floor(now / 120) % 2 ? hint : `SPIED! ${pressesPerSecond}/s`, ARENA_WIDTH / 2, ARENA_HEIGHT - 44, 15, pressesPerSecond >= 6 ? COLOR.accent : COLOR.danger);
}

function syncTwofaPanel(view) {
  const challenge = myPaddleRow(view)?.[8].challenge ?? null;
  const panel = $("twofa");
  panel.hidden = !challenge;
  if (!challenge) {
    state.twofaKey = "";
    state.twofaEntry = "";
    return;
  }
  const key = `${challenge.kind}:${challenge.shown}`;
  if (key !== state.twofaKey) {
    state.twofaKey = key;
    state.twofaEntry = "";
    $("twofa-prompt").textContent = TWOFA_PROMPTS[challenge.kind](challenge);
    $("twofa-shown").textContent = challenge.kind === "pick"
      ? challenge.options.map((word, index) => `${index + 1}${TWOFA_SYMBOLS[word]}`).join("  ")
      : challenge.kind === "math" ? `${challenge.shown} = ?` : challenge.shown;
    $("twofa-footer").textContent = TWOFA_FOOTERS[challenge.answer.charCodeAt(0) % TWOFA_FOOTERS.length];
  }
  const entered = state.twofaEntry.padEnd(challenge.answer.length, "_");
  if ($("twofa-entry").textContent !== entered) $("twofa-entry").textContent = entered;
  const timer = view.active.find(row => row[0] === "twofa");
  if (timer) $("twofa-timer").style.width = `${Math.max(0, timer[1] / timer[2] * 100)}%`;
}

function syncAbilityButton(view) {
  const paddle = myPaddleRow(view)?.[8] ?? null;
  const button = $("ability");
  button.hidden = !paddle?.ability;
  if (!paddle?.ability) return;
  const remainingMs = paddle.abilityReadyAt - view.t;
  const text = remainingMs > 0 ? `${Math.ceil(remainingMs / 1000)} s` : `${ABILITY_LABELS[paddle.ability]} (E)`;
  if (text === state.abilityText) return;
  state.abilityText = text;
  button.textContent = text;
  button.disabled = remainingMs > 0;
}

function syncGameControls(view) {
  if (!view) {
    $("twofa").hidden = true;
    $("ability").hidden = true;
    state.abilityText = "";
    return;
  }
  syncTwofaPanel(view);
  syncAbilityButton(view);
}

function drawCrown(x, y) {
  ctx.fillStyle = COLOR.accent;
  ctx.fillRect(x - 8, y, 16, 5);
  ctx.fillRect(x - 8, y - 5, 3, 5);
  ctx.fillRect(x - 1.5, y - 7, 3, 7);
  ctx.fillRect(x + 5, y - 5, 3, 5);
}

function drawBalls(view, now) {
  const half = BALL_SIZE / 2;
  const alpha = view.mods.ghost ? 0.1 + 0.1 * Math.abs(Math.sin(now / 220)) : 1;
  const ballColor = view.mods.palette ? VGA_COLORS[Math.floor(now / 140) % VGA_COLORS.length] : COLOR.white;
  const seen = new Set();
  for (const [id, x, y] of view.balls) {
    seen.add(id);
    const trail = state.trails.get(id) ?? [];
    if (!view.mods.ghost) {
      trail.forEach((point, index) => {
        ctx.globalAlpha = (index + 1) / trail.length * 0.16;
        ctx.fillStyle = COLOR.white;
        ctx.fillRect(point.x - half, point.y - half, BALL_SIZE, BALL_SIZE);
      });
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ballColor;
    ctx.fillRect(x - half, y - half, BALL_SIZE, BALL_SIZE);
    ctx.globalAlpha = 1;
    trail.push({ x, y });
    if (trail.length > 5) trail.shift();
    state.trails.set(id, trail);
  }
  for (const id of state.trails.keys()) if (!seen.has(id)) state.trails.delete(id);
}

function updateAndDrawParticles(deltaMs) {
  const seconds = deltaMs / 1000;
  state.particles = state.particles.filter(particle => particle.life > 0);
  for (const particle of state.particles) {
    particle.x += particle.vx * seconds;
    particle.y += particle.vy * seconds;
    particle.life -= seconds * 2.6;
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawBlackout(view) {
  const blackout = view.active.find(row => row[0] === "blackout");
  if (!blackout) return;
  const [, remaining, , , seed, elapsed] = blackout;
  ctx.globalAlpha = Math.min(1, elapsed / 300, remaining / 300);
  ctx.fillStyle = "#000";
  const firstX = ARENA_WIDTH * (0.25 + seed * 0.2) + Math.sin(elapsed / 800) * 150;
  const secondX = ARENA_WIDTH * (0.6 + seed * 0.2) + Math.cos(elapsed / 650) * 130;
  ctx.fillRect(firstX - 95, 0, 190, ARENA_HEIGHT);
  ctx.fillRect(secondX - 85, 0, 170, ARENA_HEIGHT);
  ctx.globalAlpha = 1;
}

function drawGravityHint(view, now) {
  const direction = view.mods.gravityDirection;
  if (!direction) return;
  ctx.fillStyle = COLOR.dim;
  const drift = (now / 40) % 40;
  for (const x of [120, ARENA_WIDTH - 120]) {
    for (let index = 0; index < 3; index++) {
      const y = ARENA_HEIGHT / 2 + direction * (index * 40 + drift - 40);
      ctx.fillRect(x - 10, y, 20, 4);
      ctx.fillRect(x - 5, y + direction * 5, 10, 4);
    }
  }
}

function drawScores(view) {
  if (view.boss) return;
  const lobbyTeams = state.lobby?.teams;
  if (view.paddles.some(row => row[8].lives !== null)) return;
  drawText(String(view.scores[0]), ARENA_WIDTH / 2 - 90, 58, 44, COLOR.white);
  drawText(String(view.scores[1]), ARENA_WIDTH / 2 + 90, 58, 44, COLOR.white);
  if (!lobbyTeams) return;
  const leftName = teamNames(lobbyTeams[0]) || "John Pong";
  const rightName = state.lobby.settings.mode === "boss" ? "JOHN PONG (BOSS)" : teamNames(lobbyTeams[1]) || "John Pong";
  drawText(fitText(leftName, 300, 9), ARENA_WIDTH / 2 - 40, 96, 9, COLOR.dim, "right");
  drawText(fitText(rightName, 300, 9), ARENA_WIDTH / 2 + 40, 96, 9, COLOR.dim, "left");
}

function fitText(text, maxWidth, size) {
  setFont(size);
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) trimmed = trimmed.slice(0, -1);
  return `${trimmed}…`;
}

function drawActiveEvents(view) {
  view.active.forEach((row, index) => {
    const [id, remaining, total] = row;
    const y = ARENA_HEIGHT - 16 - index * 18;
    const label = EVENTS[id].label.toLocaleUpperCase("lv");
    drawText(label, EVENT_LIST_X, y, 8, COLOR.white, "left");
    if (total > 0) {
      setFont(8);
      const barX = EVENT_LIST_X + 8 + ctx.measureText(label).width;
      ctx.fillStyle = COLOR.faint;
      ctx.fillRect(barX, y - 3, 70, 6);
      ctx.fillStyle = COLOR.accent;
      ctx.fillRect(barX, y - 3, 70 * remaining / total, 6);
    }
  });
}

function drawStatusLines(view) {
  const side = myTeam();
  const lines = [];
  if (view.mods.reverseScoring) lines.push(["GŪSTI PUNKTU SAVĀ PUSĒ!", COLOR.accent]);
  if (side >= 0 && view.mods.invert[side]) lines.push(["VADĪBA APGRIEZTA", COLOR.accent]);
  if (side >= 0 && view.mods.frozen[side]) lines.push(["TU ESI SASALIS", COLOR.ice]);
  if (view.mods.suddenDeath) lines.push(["NĀKAMAIS PUNKTS UZVAR", COLOR.danger]);
  if (side >= 0 && view.mods.free2d) lines.push([IS_COARSE_POINTER ? "VELC RAKETI AR PIRKSTU" : "BRĪVI: W A S D · BULTAS · PELE", COLOR.accent]);
  if (view.rules.length) lines.push([view.rules.map(id => RULE_LABELS[id]).join(" + ").toLocaleUpperCase("lv"), COLOR.dim]);
  if (state.lobby?.settings.mode === "johnChallenge") lines.push([`${view.johnLevel + 1}. LĪMENIS: ${JOHN_LEVEL_NAMES[Object.keys(JOHN_LEVEL_NAMES)[view.johnLevel]].toLocaleUpperCase("lv")}`, COLOR.dim]);
  if (view.t < view.slowUntil) lines.push(["BUMBA PALĒNINĀTA", COLOR.ice]);
  lines.forEach(([text, color], index) => drawText(text, ARENA_WIDTH / 2, 118 + index * 16, 9, color));
}

function drawServeCountdown(view) {
  if (view.phase !== "serve" || view.t > 3300) return;
  const seconds = Math.ceil(view.serveIn / 1000);
  if (seconds !== state.countdownShown && seconds > 0) {
    state.countdownShown = seconds;
    sound.beep(seconds === 1 ? 880 : 440, 0.1);
  }
  drawText(String(seconds), ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 60, COLOR.white);
  const side = myTeam();
  drawText(side < 0 ? "TU SKATIES" : side === 0 ? "TU ESI PA KREISI" : "TU ESI PA LABI", ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 58, 11, COLOR.accent);
  drawText(view.mods.free2d ? "W A S D · BULTAS · PELE" : "W / S · ↑ / ↓ · PELE", ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 82, 9, COLOR.dim);
}

function announcementProgress(now) {
  const announcement = state.announcement;
  if (!announcement) return null;
  const age = now - announcement.startedAt;
  if (age > ANNOUNCEMENT_MS) {
    state.announcement = null;
    return null;
  }
  return {
    announcement,
    age,
    growth: IS_REDUCED_MOTION ? 1 : Math.min(1, Math.ceil(age / 40) / 4),
    fade: Math.min(1, (ANNOUNCEMENT_MS - age) / 300),
  };
}

function drawAnnouncementBand(now) {
  const progress = announcementProgress(now);
  if (!progress) return;
  const { announcement, growth, fade } = progress;
  const centerY = ARENA_HEIGHT / 2;
  ctx.globalAlpha = fade;
  ctx.fillStyle = "#141a14";
  ctx.fillRect(0, centerY - 56 * growth, ARENA_WIDTH, 112 * growth);
  ctx.fillStyle = announcement.isDanger ? COLOR.danger : COLOR.white;
  ctx.fillRect(0, centerY - 56 * growth, ARENA_WIDTH, 4);
  ctx.fillRect(0, centerY + 56 * growth - 4, ARENA_WIDTH, 4);
  ctx.globalAlpha = 1;
}

function drawAnnouncementText(now) {
  const progress = announcementProgress(now);
  if (!progress || progress.growth < 1) return;
  const { announcement, age, fade } = progress;
  let size = 40;
  setFont(size);
  const width = ctx.measureText(announcement.text).width;
  if (width > ARENA_WIDTH - 60) size = Math.floor(size * (ARENA_WIDTH - 60) / width);
  const centerY = ARENA_HEIGHT / 2;
  const isBlinkOn = age > 500 || Math.floor(age / 80) % 2 === 0;
  const baseColor = announcement.isDanger ? COLOR.danger : COLOR.white;
  ctx.globalAlpha = fade;
  drawText(announcement.text, ARENA_WIDTH / 2, centerY - 8, size, isBlinkOn ? baseColor : COLOR.accent);
  if (announcement.detail) drawText(fitText(announcement.detail, ARENA_WIDTH - 40, 11), ARENA_WIDTH / 2, centerY + 32, 11, COLOR.dim);
  ctx.globalAlpha = 1;
}

function drawSuddenDeathFrame(view, now) {
  if (!view.mods.suddenDeath) return;
  ctx.globalAlpha = 0.45 + 0.45 * Math.sin(now / 130);
  ctx.strokeStyle = COLOR.danger;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, ARENA_WIDTH - 8, ARENA_HEIGHT - 8);
  ctx.globalAlpha = 1;
}

function drawFrame(view, now, deltaMs, { hasHud }) {
  ctx.setTransform(state.renderScale, 0, 0, state.renderScale, 0, 0);
  ctx.fillStyle = COLOR.black;
  ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
  if (view.mods.bassBoost && !IS_REDUCED_MOTION) {
    const zoom = 1 + state.bassPulse * 0.025;
    ctx.translate(ARENA_WIDTH / 2, ARENA_HEIGHT / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-ARENA_WIDTH / 2, -ARENA_HEIGHT / 2);
  }
  if (state.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * state.shake * 2, (Math.random() - 0.5) * state.shake * 2);
    state.shake *= Math.pow(0.992, deltaMs);
  } else {
    state.shake = 0;
  }
  ctx.save();
  if (view.mods.flip) {
    ctx.translate(0, ARENA_HEIGHT);
    ctx.scale(1, -1);
  }
  drawNet(view);
  drawGravityHint(view, now);
  drawWalls(view);
  ctx.restore();
  drawScores(view);
  if (hasHud) drawAnnouncementBand(now);
  ctx.save();
  if (view.mods.flip) {
    ctx.translate(0, ARENA_HEIGHT);
    ctx.scale(1, -1);
  }
  drawObjects(view.objects, now);
  drawBoss(view, now);
  drawPaddles(view, now);
  drawBalls(view, now);
  drawMeteors(view, now);
  drawShockwaves(now);
  updateAndDrawParticles(deltaMs);
  drawBlackout(view);
  drawLowRes(view, now);
  ctx.restore();
  drawSuddenDeathFrame(view, now);
  if (hasHud) {
    if (view.boss) drawBossHud(view);
    drawJohnBubble(view, now);
    drawBassBoostMeter(view, now);
    drawSpamPrompt(view, now);
    drawActiveEvents(view);
    drawStatusLines(view);
    drawServeCountdown(view);
    drawAnnouncementText(now);
  }
  if (state.flash > 0.02) {
    ctx.globalAlpha = state.flash * 0.25;
    ctx.fillStyle = COLOR.white;
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    ctx.globalAlpha = 1;
    state.flash *= Math.pow(0.99, deltaMs);
  }
}

function stepAttract(deltaMs) {
  state.attract ??= createMatch({
    settings: { ...defaultSettings(), frequency: "often", targetScore: 7 },
    teams: [[], []],
  });
  state.attractClock = Math.min(200, state.attractClock + deltaMs);
  while (state.attractClock >= STEP_MS) {
    stepMatch(state.attract);
    state.attractClock -= STEP_MS;
  }
  const view = serializeMatch(state.attract);
  if (state.attract.phase === "over") state.attract = null;
  return view;
}

function sendPingWhenDue(now) {
  if (now < state.nextPingAt) return;
  state.pingCount++;
  state.nextPingAt = now + (state.pingCount <= PING_FAST_COUNT ? PING_FAST_MS : PING_SLOW_MS);
  state.connection?.send({ type: "ping", c: now });
  if (state.predictor?.samples.length && state.code) $("bar-code").textContent = `Kods: ${state.code} · ${Math.round(state.predictor.rtt)} ms`;
}

function frame(now) {
  requestAnimationFrame(frame);
  const deltaMs = Math.min(100, now - state.lastFrameAt);
  state.lastFrameAt = now;
  const screen = document.body.dataset.screen;
  if (screen === "lobby") return;
  if (screen === "menu") {
    sound.setBassBoost(false);
    if (!IS_REDUCED_MOTION || !state.attract) drawFrame(stepAttract(deltaMs), now, deltaMs, { hasHud: false });
    return;
  }
  if (!state.predictor) {
    drawWaitingScreen();
    return;
  }
  sendPingWhenDue(now);
  const effects = state.predictor.advance(now, gatherLocalInputs, sendLocalInput);
  for (const effect of effects) playEffect(effect);
  const view = state.predictor.view();
  if (!view) {
    drawWaitingScreen();
    return;
  }
  state.view = view;
  syncGameControls(view);
  syncBossCues(view, now);
  updateBassBoost(view, now, deltaMs);
  drawFrame(view, now, deltaMs, { hasHud: true });
}

function drawWaitingScreen() {
  ctx.setTransform(state.renderScale, 0, 0, state.renderScale, 0, 0);
  ctx.fillStyle = COLOR.black;
  ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
  drawText("GAIDĀM…", ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 16, COLOR.dim);
}

function resizeCanvas() {
  const bounds = $("stage").getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const cssWidth = Math.floor(Math.min(bounds.width, bounds.height * ARENA_WIDTH / ARENA_HEIGHT));
  const cssHeight = Math.floor(cssWidth * ARENA_HEIGHT / ARENA_WIDTH);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const backingWidth = Math.min(1600, Math.round(cssWidth * Math.min(2, devicePixelRatio || 1)));
  canvas.width = backingWidth;
  canvas.height = Math.round(backingWidth * ARENA_HEIGHT / ARENA_WIDTH);
  state.renderScale = backingWidth / ARENA_WIDTH;
}

function exitGame() {
  state.connection?.send({ type: "leave" });
  leaveToMenu();
  if (window.parent !== window) window.parent.postMessage("pingpong:exit", location.origin);
  else location.href = "../";
}

function rememberName() {
  const name = $("name").value.trim();
  if (!name) {
    $("menu-message").textContent = "Ieraksti savu vārdu";
    $("name").focus();
    return false;
  }
  writeStorage(localStorage, STORAGE_KEYS.name, name);
  return true;
}

function joinFromForm() {
  if (!rememberName()) return;
  const code = $("code").value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    $("menu-message").textContent = "Kods ir 5 zīmes, piemēram ABC23";
    $("code").focus();
    return;
  }
  connectTo(`/pingpong/lobbies/${code}`);
}

async function copyInvite() {
  const url = new URL(location.href);
  url.search = `?join=${state.code}`;
  try {
    await navigator.clipboard.writeText(url.href);
    $("copy-note").textContent = "Saite nokopēta!";
  } catch {
    $("copy-note").textContent = url.href;
  }
  setTimeout(() => { $("copy-note").textContent = "Klikšķini, lai kopētu saiti"; }, 2500);
}

function syncMuteButton() {
  $("mute").textContent = sound.isMuted ? "Skaņa: nē" : "Skaņa: jā";
  $("mute").setAttribute("aria-pressed", String(sound.isMuted));
}

function buildSettingsForm() {
  buildRadioGroup($("modes"), "mode", Object.entries(MODES).map(([id, mode]) => [id, mode.label]));
  buildRadioGroup($("target-score"), "targetScore", SCORE_OPTIONS.map(score => [score, String(score)]));
  buildRadioGroup($("frequency"), "frequency", Object.entries(FREQUENCIES).map(([id, frequency]) => [id, frequency.label]));
  buildRadioGroup($("intensity"), "intensity", Object.entries(INTENSITIES).map(([id, intensity]) => [id, intensity.label]));
  buildRadioGroup($("ai-difficulty"), "aiDifficulty", Object.entries(AI_LEVELS).map(([id, level]) => [id, level.label]));
  buildEventList();
  $("chaotic").addEventListener("change", event => sendSettings({ chaotic: event.target.checked }));
  $("ai-enabled").addEventListener("change", event => sendSettings({ aiEnabled: event.target.checked }));
}

function buildTwofaKeypad() {
  for (const digit of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"]) {
    const key = document.createElement("button");
    key.type = "button";
    key.textContent = digit;
    key.addEventListener("pointerdown", event => {
      event.preventDefault();
      if (digit === "⌫") state.twofaEntry = state.twofaEntry.slice(0, -1);
      else enterTwofaDigit(digit);
    });
    $("twofa-keys").append(key);
  }
}

function wireControls() {
  buildTwofaKeypad();
  $("ability").addEventListener("pointerdown", event => {
    event.preventDefault();
    useMyAbility();
  });
  $("exit").addEventListener("click", exitGame);
  $("create").addEventListener("click", () => {
    if (rememberName()) connectTo("/pingpong/create");
  });
  $("menu-form").addEventListener("submit", event => {
    event.preventDefault();
    joinFromForm();
  });
  $("copy-code").addEventListener("click", copyInvite);
  $("start").addEventListener("click", () => state.connection?.send({ type: "start" }));
  $("rematch").addEventListener("click", () => state.connection?.send({ type: "start" }));
  $("to-lobby").addEventListener("click", () => state.connection?.send({ type: "toLobby" }));
  $("mute").addEventListener("click", () => {
    sound.isMuted = !sound.isMuted;
    writeStorage(localStorage, STORAGE_KEYS.muted, sound.isMuted ? "1" : null);
    sound.unlock();
    syncMuteButton();
  });
}

function boot() {
  buildSettingsForm();
  wireControls();
  syncMuteButton();
  new ResizeObserver(resizeCanvas).observe($("stage"));
  resizeCanvas();
  const joinCode = new URLSearchParams(location.search).get("join")?.toUpperCase() ?? "";
  $("name").value = readStorage(localStorage, STORAGE_KEYS.name) || "";
  $("code").value = CODE_PATTERN.test(joinCode) ? joinCode : "";
  if ($("code").value && $("name").value) joinFromForm();
  else ($("name").value ? $("code") : $("name")).focus();
  requestAnimationFrame(frame);
}

boot();
