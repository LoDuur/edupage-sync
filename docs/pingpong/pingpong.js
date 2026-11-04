import { PaintConnection } from "../paint/connection.js?v=2";
import {
  AI_LEVELS, ARENA_HEIGHT, ARENA_WIDTH, BALL_SIZE, EVENTS, EVENT_GROUPS, EVENT_IDS, FREQUENCIES, INTENSITIES, MAX_PLAYERS,
  MODES, PADDLE_SPEED, PADDLE_WIDTH, SCORE_OPTIONS, STEP_MS, createMatch, defaultSettings, serializeMatch, stepMatch,
} from "./sim.js?v=1";

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
const INTERPOLATION_DELAY_MS = 60;
const SNAPSHOT_BUFFER_SIZE = 12;
const TARGET_SEND_INTERVAL_MS = 40;
const TELEPORT_DISTANCE = 140;
const ANNOUNCEMENT_MS = 1900;
const MAX_PARTICLES = 70;
const EVENT_LIST_X = 150;
const SHAKE_STRENGTH = [0, 4, 7, 12];
const IS_REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLOR = { white: "#f1f4ec", dim: "#626b60", faint: "#2a322a", accent: "#72ff91", ice: "#7fd6ff", danger: "#ff6a5e", black: "#000" };
const FONT_FAMILY = '"Press Start 2P", "Courier New", monospace';

const $ = id => document.getElementById(id);
const canvas = $("arena");
const ctx = canvas.getContext("2d", { alpha: false });

const state = {
  connection: null,
  me: null,
  code: null,
  lobby: null,
  snapshots: [],
  latest: null,
  clockOffset: null,
  localPaddleY: null,
  announcement: null,
  particles: [],
  trails: new Map(),
  shake: 0,
  flash: 0,
  pressedKeys: new Set(),
  sentDir: 0,
  pointerTarget: null,
  lastTargetSentAt: 0,
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
    oscillator.connect(volume).connect(this.context.destination);
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
    case "state": return handleState(message);
    case "notice":
      $("lobby-message").textContent = "Vajag vairāk spēlētāju";
      return;
    case "error": return handleServerError(message.code);
  }
}

function handleWelcome({ me, token, code }) {
  state.me = me;
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
  state.latest = null;
  state.snapshots = [];
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
  state.snapshots = [];
  state.latest = null;
  state.clockOffset = null;
  state.localPaddleY = null;
  state.announcement = null;
  state.particles = [];
  state.trails.clear();
  state.countdownShown = 0;
  state.sentDir = 0;
  state.pointerTarget = null;
  syncKeyInput(true);
}

function playerName(id) {
  return state.lobby?.players.find(player => player.id === id)?.name ?? "Pametis spēli";
}

function teamNames(team) {
  return team.map(playerName).join(", ");
}

function myTeam() {
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
        ? "Esi viens: pretī stāsies AI. Uzaicini klasesbiedrus ar kodu!"
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
  const { winner, scores, teams, isBoss, isForfeit, champion } = lobby.result;
  const mine = teams.findIndex(team => team.includes(state.me));
  overlay.hidden = false;
  if (champion) {
    $("overlay-kicker").textContent = "Turnīra čempions";
    $("overlay-title").textContent = playerName(champion);
  } else if (isBoss) {
    $("overlay-kicker").textContent = "Boss cīņa";
    $("overlay-title").textContent = winner === 0 ? "Boss uzvarēts!" : "Boss uzvarēja";
  } else {
    $("overlay-kicker").textContent = mine < 0 ? "Spēle beigusies" : mine === winner ? "Uzvara!" : "Zaudējums";
    $("overlay-title").textContent = teamNames(teams[winner]) || "AI";
  }
  $("overlay-score").textContent = `${scores[0]} : ${scores[1]}`;
  $("overlay-detail").textContent = isForfeit ? "Pretinieks pameta spēli" : isHost() ? "" : "Gaidām vadītāja lēmumu…";
  $("overlay-actions").hidden = !isHost();
  if (!state.resultSoundPlayed) sound.sequence(mine === winner || mine < 0 ? [523, 659, 784, 1047] : [392, 330, 262, 196], 0.13);
  state.resultSoundPlayed = true;
}

function handleState(snapshot) {
  state.resultSoundPlayed = false;
  const now = performance.now();
  const offset = snapshot.t - now;
  state.clockOffset = state.clockOffset === null ? offset : state.clockOffset + (offset - state.clockOffset) * 0.05;
  state.snapshots.push(snapshot);
  if (state.snapshots.length > SNAPSHOT_BUFFER_SIZE) state.snapshots.shift();
  state.latest = snapshot;
  for (const effect of snapshot.fx) playEffect(effect);
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

function playEffect([kind, a, b, c]) {
  switch (kind) {
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
      addParticles(a, b, 12, COLOR.accent);
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
      const def = EVENTS[a];
      announce(def.label, describeSide(b) || def.info, a === "suddenDeath");
      sound.sequence(c >= 3 ? [110, 147, 110, 82] : [523, 784, 659, 1047], 0.07, c >= 3 ? { type: "sawtooth", gain: 0.06 } : {});
      addShake(c);
      return;
    }
  }
}

function currentKeyDir() {
  const up = state.pressedKeys.has("up");
  const down = state.pressedKeys.has("down");
  return up === down ? 0 : up ? -1 : 1;
}

function syncKeyInput(isForced = false) {
  const dir = currentKeyDir();
  if (!isForced && dir === state.sentDir) return;
  state.sentDir = dir;
  state.pointerTarget = null;
  state.connection?.send({ type: "input", dir });
}

const KEY_DIRECTIONS = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down" };

function isTypingTarget(target) {
  return target instanceof HTMLInputElement && target.type !== "radio" && target.type !== "checkbox";
}

addEventListener("keydown", event => {
  sound.unlock();
  const direction = KEY_DIRECTIONS[event.code];
  if (!direction || isTypingTarget(event.target) || state.lobby?.phase !== "match") return;
  event.preventDefault();
  state.pressedKeys.add(direction);
  syncKeyInput();
});

addEventListener("keyup", event => {
  const direction = KEY_DIRECTIONS[event.code];
  if (!direction) return;
  state.pressedKeys.delete(direction);
  if (state.lobby?.phase === "match") syncKeyInput();
});

addEventListener("blur", () => {
  state.pressedKeys.clear();
  if (state.lobby?.phase === "match") syncKeyInput();
});

function handlePointer(event) {
  if (state.lobby?.phase !== "match") return;
  const bounds = canvas.getBoundingClientRect();
  const rawY = (event.clientY - bounds.top) / bounds.height * ARENA_HEIGHT;
  const y = state.latest?.mods.flip ? ARENA_HEIGHT - rawY : rawY;
  state.pointerTarget = y;
  const now = performance.now();
  if (now - state.lastTargetSentAt < TARGET_SEND_INTERVAL_MS) return;
  state.lastTargetSentAt = now;
  state.sentDir = 0;
  state.connection?.send({ type: "input", target: Math.round(y) });
}

canvas.addEventListener("pointermove", handlePointer);
canvas.addEventListener("pointerdown", event => {
  sound.unlock();
  handlePointer(event);
});

function myPaddle(snapshot) {
  return snapshot.paddles.find(paddle => paddle[5] === state.me) ?? null;
}

function updateLocalPaddle(deltaMs) {
  const snapshot = state.latest;
  const paddle = snapshot && myPaddle(snapshot);
  if (!paddle || paddle[6]) {
    state.localPaddleY = null;
    return;
  }
  const [, side, , serverY, height] = paddle;
  state.localPaddleY ??= serverY;
  const { invert, frozen, paddleSpeed } = snapshot.mods;
  const speed = PADDLE_SPEED * paddleSpeed[side];
  const seconds = deltaMs / 1000;
  let isMoving = false;
  if (!frozen[side] && snapshot.phase !== "over") {
    if (state.pointerTarget !== null) {
      const target = invert[side] ? ARENA_HEIGHT - state.pointerTarget : state.pointerTarget;
      const gap = target - state.localPaddleY;
      isMoving = Math.abs(gap) > 1;
      state.localPaddleY += Math.sign(gap) * Math.min(Math.abs(gap), speed * seconds);
    } else {
      const dir = currentKeyDir() * (invert[side] ? -1 : 1);
      isMoving = dir !== 0;
      state.localPaddleY += dir * speed * seconds;
    }
  }
  const half = height / 2;
  state.localPaddleY = Math.max(snapshot.top + half, Math.min(snapshot.bottom - half, state.localPaddleY));
  const error = serverY - state.localPaddleY;
  const tolerance = isMoving ? speed * 0.12 : 0;
  if (Math.abs(error) > tolerance) state.localPaddleY += (error - Math.sign(error) * tolerance) * Math.min(1, deltaMs * 0.012);
}

function interpolateRows(fromRows, toRows, ratio, xIndex, yIndex) {
  return toRows.map(row => {
    const previous = fromRows.find(candidate => candidate[0] === row[0]);
    if (!previous) return row;
    const distance = Math.hypot(row[xIndex] - previous[xIndex], row[yIndex] - previous[yIndex]);
    if (distance > TELEPORT_DISTANCE) return row;
    const copy = [...row];
    copy[xIndex] = previous[xIndex] + (row[xIndex] - previous[xIndex]) * ratio;
    copy[yIndex] = previous[yIndex] + (row[yIndex] - previous[yIndex]) * ratio;
    return copy;
  });
}

function viewForNow(now) {
  const { snapshots, latest, clockOffset } = state;
  if (!latest) return null;
  const renderT = now + clockOffset - INTERPOLATION_DELAY_MS;
  let previous = null;
  let next = null;
  for (let index = snapshots.length - 1; index >= 0; index--) {
    if (snapshots[index].t <= renderT) {
      previous = snapshots[index];
      next = snapshots[index + 1] ?? null;
      break;
    }
  }
  if (!previous || !next) return latest;
  const ratio = Math.min(1, (renderT - previous.t) / Math.max(1, next.t - previous.t));
  return {
    ...next,
    balls: interpolateRows(previous.balls, next.balls, ratio, 1, 2),
    paddles: interpolateRows(previous.paddles, next.paddles, ratio, 2, 3),
  };
}

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

function drawNet() {
  ctx.fillStyle = COLOR.faint;
  for (let y = 10; y < ARENA_HEIGHT; y += 26) ctx.fillRect(ARENA_WIDTH / 2 - 2, y, 4, 14);
}

function drawWalls(view) {
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(0, 0, ARENA_WIDTH, 3);
  ctx.fillRect(0, ARENA_HEIGHT - 3, ARENA_WIDTH, 3);
  if (view.top > 0) drawHatchedWall(0, view.top);
  if (view.bottom < ARENA_HEIGHT) drawHatchedWall(view.bottom, ARENA_HEIGHT - view.bottom);
}

function drawHatchedWall(y, height) {
  ctx.fillStyle = COLOR.dim;
  ctx.fillRect(0, y, ARENA_WIDTH, height);
  ctx.fillStyle = COLOR.black;
  for (let x = 0; x < ARENA_WIDTH; x += 24) ctx.fillRect(x, y, 12, height);
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(0, y === 0 ? height - 3 : y, ARENA_WIDTH, 3);
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
  objects.portals.forEach((portal, index) => {
    ctx.strokeStyle = index === 0 ? COLOR.accent : COLOR.ice;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = now / 30 * (index === 0 ? 1 : -1);
    ctx.beginPath();
    ctx.arc(portal.x, portal.y, portal.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(portal.x, portal.y, portal.r * 0.45, 0, Math.PI * 2);
    ctx.stroke();
  });
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

function drawPaddles(view) {
  const king = kingSide(view);
  for (const row of view.paddles) {
    const [, side, x, serverY, height, owner, isAi, isBoss] = row;
    const isMine = owner === state.me && state.me !== null;
    const y = isMine && state.localPaddleY !== null ? state.localPaddleY : serverY;
    const top = y - height / 2;
    const isFrozen = view.mods.frozen[side];
    ctx.fillStyle = isFrozen ? COLOR.ice : isAi && !isBoss ? "#a9b2a5" : COLOR.white;
    ctx.fillRect(x, top, PADDLE_WIDTH, height);
    if (isAi && !isBoss) {
      ctx.fillStyle = COLOR.black;
      for (let stripe = top + 6; stripe < top + height - 4; stripe += 12) ctx.fillRect(x, stripe, PADDLE_WIDTH, 4);
    }
    if (isMine) {
      ctx.fillStyle = COLOR.accent;
      ctx.fillRect(side === 0 ? x - 5 : x + PADDLE_WIDTH + 2, top + 2, 3, height - 4);
    }
    if (isBoss) drawText("BOSS", x - 6, top - 12, 9, COLOR.danger, "right");
    else if (isAi && !owner) drawText("AI", x + PADDLE_WIDTH / 2, top - 12, 9, COLOR.dim);
    if (king === side) drawCrown(x + PADDLE_WIDTH / 2, top - (isAi ? 28 : 14));
  }
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
    ctx.fillStyle = COLOR.white;
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
  const lobbyTeams = state.lobby?.teams;
  drawText(String(view.scores[0]), ARENA_WIDTH / 2 - 90, 58, 44, COLOR.white);
  drawText(String(view.scores[1]), ARENA_WIDTH / 2 + 90, 58, 44, COLOR.white);
  if (!lobbyTeams) return;
  const leftName = teamNames(lobbyTeams[0]) || "AI";
  const rightName = state.lobby.settings.mode === "boss" ? "BOSS" : teamNames(lobbyTeams[1]) || "AI";
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
  drawText("W / S · ↑ / ↓ · PELE", ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 82, 9, COLOR.dim);
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
  drawNet();
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
  drawPaddles(view);
  drawBalls(view, now);
  updateAndDrawParticles(deltaMs);
  drawBlackout(view);
  ctx.restore();
  drawSuddenDeathFrame(view, now);
  if (hasHud) {
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

function frame(now) {
  requestAnimationFrame(frame);
  const deltaMs = Math.min(100, now - state.lastFrameAt);
  state.lastFrameAt = now;
  const screen = document.body.dataset.screen;
  if (screen === "lobby") return;
  if (screen === "menu") {
    if (!IS_REDUCED_MOTION || !state.attract) drawFrame(stepAttract(deltaMs), now, deltaMs, { hasHud: false });
    return;
  }
  const view = viewForNow(now);
  if (!view) {
    drawWaitingScreen();
    return;
  }
  updateLocalPaddle(deltaMs);
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

function wireControls() {
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
