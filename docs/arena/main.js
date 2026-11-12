import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { TICK_DT } from "./sim/constants.js";
import { addPlayer, createGame, fillWithBots, loadMap } from "./sim/game.js";
import { createOfflineSession } from "./session-offline.js";
import { createOnlineSession } from "./net/client.js";
import { eyeHeight } from "./sim/movement.js";
import { LOADOUT_WEAPONS, WEAPONS, WEAPON_ORDER } from "./sim/weapons.js";
import { CODE_PATTERN, cleanName } from "./sim/protocol.js";
import { BIND_LABELS, DEFAULT_SETTINGS, DEFAULT_BINDS, keyLabel, loadSettings, saveSettings } from "./settings.js";
import { createInput } from "./input.js";
import { createTouchControls } from "./touch.js";
import { createHud } from "./hud.js";
import { createAudio } from "./audio/sound.js";
import { buildWorld } from "./render/world.js";
import { createPlayerModels } from "./render/players.js";
import { createEffects, createPickupVisuals } from "./render/fx.js";
import { createViewmodel } from "./render/viewmodel.js";

const LOCAL_ID = "local";
const STEP_DISTANCE = 2.3;
const PIXEL_RATIO = { low: 0.75, medium: 1.25, high: 2 };
const TRACERS_PER_SHOT = { aa12: 3, pistol: 1, smg: 1, ar: 1, sniper: 1, rocket: 0 };
const SHOT_SHAKE = { pistol: 0.12, smg: 0.07, ar: 0.1, aa12: 0.3, sniper: 0.35, rocket: 0.5 };
const PICKUP_TEXT = { weapon: e => `+ ${WEAPONS[e.weapon].name}`, mega: () => "+ Mega veselība", health: () => "+ Veselība", armor: () => "+ Bruņas", ammo: () => "+ Munīcija" };
const SHOT_LIGHT = { pistol: 3, smg: 2, ar: 4, aa12: 6, sniper: 7, rocket: 8 };

const $ = id => document.getElementById(id);
const body = document.body;
let settings = loadSettings();
let previousScreen = "menu";

function showScreen(name) {
  if (body.dataset.screen !== "settings") previousScreen = body.dataset.screen;
  body.dataset.screen = name;
  if (name === "settings") renderSettings();
  if (name === "setup") renderSetup();
}

const fullscreenRoot = document.documentElement;
const isFullscreenSupported = !!(fullscreenRoot.requestFullscreen || fullscreenRoot.webkitRequestFullscreen);
const getFullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

async function toggleFullscreen() {
  if (!isFullscreenSupported) return;
  try {
    if (getFullscreenElement()) await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
    else await (fullscreenRoot.requestFullscreen ? fullscreenRoot.requestFullscreen({ navigationUI: "hide" }) : fullscreenRoot.webkitRequestFullscreen());
  } catch (error) {
    console.warn("fullscreen", error);
  }
}

function onFullscreenChange() {
  const isFullscreen = !!getFullscreenElement();
  for (const button of document.querySelectorAll("[data-fullscreen-label]")) button.textContent = isFullscreen ? "Iziet no pilnekrāna" : "Pilnekrāns";
  resize();
  if (isFullscreen && match && !match.game.isOver && body.dataset.screen === "pause") requestLock();
}

function exitToLessonList() {
  if (document.pointerLockElement) document.exitPointerLock();
  if (window.parent !== window) window.parent.postMessage("arena:exit", location.origin);
  else location.href = "../v2/";
}

const isTouch = matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && !matchMedia("(any-pointer: fine)").matches);

function hasSavedSettings() {
  try {
    return localStorage.getItem("arena-settings-v1") !== null;
  } catch {
    return false;
  }
}

if (isTouch) {
  body.classList.add("touch");
  if (!hasSavedSettings()) settings.quality = "low";
}

const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 220);
camera.rotation.order = "YXZ";
const audio = createAudio();
audio.setVolume(settings.volume);
const hud = createHud();
const input = createInput(canvas, () => settings);
const viewmodel = createViewmodel({ onCue: (cue, weapon) => audio.play(cue, { isLocal: true, weapon }) });
viewmodel.scene.environment = environment;

let match = null;

function horizontalToVertical(hfov, aspect) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov) / 2) / aspect));
}

let resolutionScale = 1;

function pixelRatio() {
  const quality = match?.quality || settings.quality;
  return Math.min(devicePixelRatio, PIXEL_RATIO[quality]) * resolutionScale;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  viewmodel.resize(w / h);
  match?.composer?.setSize(w, h);
}
addEventListener("resize", resize);

function disposeScene(scene) {
  scene.traverse(o => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData.shared) continue;
      for (const key of ["map", "normalMap", "emissiveMap"]) m[key]?.dispose();
      m.dispose();
    }
  });
}

function createLocalGame() {
  const game = createGame({ mapId: settings.map, mode: "ffa", seed: (Math.random() * 1e9) | 0, fragLimit: settings.fragLimit, timeLimit: settings.timeLimit });
  const local = addPlayer(game, { id: LOCAL_ID, name: "Tu", loadout: settings.loadout });
  fillWithBots(game, settings.bots, settings.difficulty);
  return createOfflineSession(game, local);
}

function startMatch(makeSession = createLocalGame) {
  const quality = settings.quality;
  $("loading-text").textContent = "Būvē arēnu…";
  showScreen("loading");
  requestAnimationFrame(() => setTimeout(() => {
    try {
      buildMatch(quality, makeSession());
    } catch (error) {
      console.error(error);
      $("asset-error").hidden = false;
      $("asset-error").textContent = `Neizdevās sākt maču: ${error.message}`;
      showScreen("menu");
      return;
    }
    showScreen("game");
    requestLock();
  }, 30));
}

function buildMatch(quality, session) {
  endMatch(session);
  const { game, local } = session;
  const { brushes } = loadMap(game.map.id);
  const scene = new THREE.Scene();
  scene.environment = environment;
  renderer.shadowMap.enabled = quality !== "low";
  renderer.shadowMap.type = quality === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const world = buildWorld(scene, renderer, game.map, brushes, quality);
  const fx = createEffects(scene);
  const pickups = createPickupVisuals(scene, game.pickups, viewmodel.weaponFactory);
  const players = createPlayerModels(scene, viewmodel.weaponFactory, quality === "high");
  let composer = null;
  if (quality === "high") {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.85));
    composer.addPass(new OutputPass());
  }
  match = {
    session, game, local, localId: session.localId, scene, world, fx, pickups, players, composer, quality,
    stepDistances: new Map(), isPaused: false, shadowTick: 0, ownedSlots: [],
    view: { landKick: 0, landVel: 0, eyeOffset: 0, roll: 0, trauma: 0, fovKick: 0, punch: 0, punchVel: 0 },
  };
  input.setView(local.move.yaw, 0);
  input.syncSlot(WEAPONS[local.arsenal.current].slot);
  hud.reset();
  resize();
  const roomLine = session.isOnline ? `Istaba ${session.code} · ${game.players.length} spēlētāji` : `${settings.bots} boti`;
  hud.message(`Mačs sākas!<small>${game.fragLimit} fragi · ${Math.round(game.timeLimit / 60)} min · ${roomLine}</small>`, 3, performance.now());
  renderRoomInfo();
}

function endMatch(keepSession = null) {
  if (!match) return;
  if (match.session !== keepSession) match.session.dispose();
  audio.setSliding(false);
  disposeScene(match.scene);
  match.composer?.dispose();
  match = null;
}

function requestLock() {
  audio.ensure();
  if (isTouch) {
    if (!match) return;
    match.isPaused = false;
    touch?.reset();
    if (body.dataset.screen !== "game") showScreen("game");
    return;
  }
  input.lock().then(ok => { $("click-to-play").hidden = ok; });
}

function pauseMatch() {
  if (!match || match.game.isOver) return;
  match.isPaused = true;
  audio.setSliding(false);
  touch?.reset();
  $("copy-invite").textContent = "Kopēt uzaicinājuma saiti";
  renderRoomInfo();
  showScreen("pause");
}

input.onLockChange(isLocked => {
  if (!match) return;
  $("click-to-play").hidden = true;
  if (!isLocked && body.dataset.screen === "game" && !match.game.isOver) pauseMatch();
  if (isLocked) {
    match.isPaused = false;
    if (body.dataset.screen !== "game") showScreen("game");
  }
});

canvas.addEventListener("click", () => {
  if (!isTouch && match && body.dataset.screen === "game" && !input.isLocked) requestLock();
});

const touch = isTouch ? createTouchControls(input, () => settings, { onPause: pauseMatch, onFirstTouch: () => audio.ensure() }) : null;

function nameOf(game, id) {
  return game.players.find(p => p.id === id)?.name ?? "?";
}

function playerById(game, id) {
  return game.players.find(p => p.id === id);
}

function handleEvents(events) {
  const { game, local, fx, players, view, localId } = match;
  const now = performance.now();
  for (const e of events) {
    const isLocal = e.id === localId;
    const actor = e.id ? playerById(game, e.id) : null;
    const pos = actor?.move.pos;
    switch (e.type) {
      case "shot": {
        const w = WEAPONS[e.weapon];
        audio.play(e.weapon, { isLocal, pos: e.origin });
        let from;
        if (isLocal) {
          from = viewmodel.muzzleWorldPosition(camera, new THREE.Vector3());
          fx.muzzleLight(from, SHOT_LIGHT[e.weapon]);
          view.trauma = Math.min(1, view.trauma + SHOT_SHAKE[e.weapon] * (local.arsenal.isScoped ? 0.4 : 1));
          input.addPitch(w.recoilPitch * (0.55 + Math.random() * 0.25));
          input.addYaw(Math.sin(local.arsenal.shotCount * 0.6) * w.recoilYaw * 0.8 + (Math.random() - 0.5) * w.recoilYaw * 0.4);
          view.punchVel += w.recoilPitch * 9;
        } else {
          players.notifyShot(e.id);
          const yaw = actor?.move.yaw ?? 0;
          from = new THREE.Vector3(e.origin.x + Math.cos(yaw) * 0.25, e.origin.y - 0.25, e.origin.z - Math.sin(yaw) * 0.25);
          fx.muzzleLight(from, SHOT_LIGHT[e.weapon] * 0.6);
        }
        e.traces.forEach((t, i) => {
          if (i < TRACERS_PER_SHOT[e.weapon]) fx.tracer(from, new THREE.Vector3(t.point.x, t.point.y, t.point.z));
          fx.impact(t);
          if (i === 0 && !t.victim) audio.play("impact", { pos: t.point });
        });
        break;
      }
      case "damage": {
        players.hitFlash(e.victim);
        if (e.attacker === localId && e.victim !== localId) {
          hud.hit(e.isHeadshot ? "head" : "");
          audio.play("hit", { isLocal: true, intensity: e.isHeadshot ? 2 : 1 });
        }
        if (e.victim === localId) {
          audio.play("hurt", { isLocal: true });
          view.trauma = Math.min(1, view.trauma + Math.min(0.5, e.amount / 80));
          if (e.origin) {
            const toward = Math.atan2(-(e.origin.x - local.move.pos.x), -(e.origin.z - local.move.pos.z));
            hud.damageFrom(-(toward - input.yaw));
          }
        }
        break;
      }
      case "kill": {
        hud.killfeed(game, e, localId);
        const victim = playerById(game, e.victim);
        fx.deathBurst(e.pos, victim?.id === localId ? 0xe0564f : 0x7ff0ff);
        audio.play("death", { pos: e.pos, isLocal: e.victim === localId });
        if (e.killer === localId && e.victim !== localId) {
          hud.hit("kill");
          audio.play("kill", { isLocal: true });
          const streak = e.streak >= 5 ? "\nNeapturams!" : e.streak >= 3 ? `\n${e.streak} pēc kārtas` : "";
          hud.message(`${e.isHeadshot ? "◎ " : ""}Izsitu: ${nameOf(game, e.victim)}${streak}`, 1.6, now);
        }
        if (e.victim === localId && e.killer && e.killer !== localId) hud.message(`Tevi izsita ${nameOf(game, e.killer)}`, 2.4, now);
        break;
      }
      case "jump": case "slidejump": case "walljump": case "dash": case "pad":
        audio.play(e.type === "slidejump" ? "jump" : e.type, { isLocal, pos });
        if (isLocal && e.type === "dash") view.fovKick = 8;
        if (isLocal && e.type === "walljump") view.trauma = Math.min(1, view.trauma + 0.08);
        break;
      case "land":
        if (e.speed > 3) audio.play("land", { isLocal, pos, intensity: e.speed / 12 });
        if (isLocal) view.landVel -= Math.min(0.5, e.speed * 0.025);
        break;
      case "pickup":
        audio.play("pickup", { isLocal, pos, weapon: e.kind === "weapon", intensity: e.kind === "mega" || e.kind === "armor" ? 2 : 1 });
        if (isLocal) hud.message(PICKUP_TEXT[e.kind](e), 1.2, now);
        break;
      case "explosion": {
        fx.explosion(e.pos, e.normal, e.radius);
        audio.play("explosion", { pos: e.pos });
        const distance = Math.hypot(e.pos.x - camera.position.x, e.pos.y - camera.position.y, e.pos.z - camera.position.z);
        view.trauma = Math.min(1, view.trauma + Math.max(0, 1 - distance / 24) * 0.9);
        break;
      }
      case "spawn":
        if (isLocal) {
          input.setView(e.yaw, 0);
          input.syncSlot(WEAPONS[local.arsenal.current].slot);
          audio.play("spawn", { isLocal: true });
        }
        break;
      case "dry":
        if (isLocal) audio.play("dry", { isLocal: true });
        break;
      case "matchEnd":
        finishMatch();
        break;
    }
  }
}

function finishMatch() {
  const { game } = match;
  const winner = game.winner?.id ? nameOf(game, game.winner.id) : null;
  $("results-title").textContent = game.winner?.id === match.localId ? "Tu uzvarēji!" : winner ? `Uzvarēja ${winner}` : "Mačs beidzies";
  hud.renderBoard(game, match.localId, $("results-rows"));
  body.classList.toggle("online", match.session.isOnline);
  $("results-note").textContent = match.session.isOnline ? "Nākamais mačs sāksies pēc dažām sekundēm" : "";
  audio.setSliding(false);
  if (document.pointerLockElement) document.exitPointerLock();
  showScreen("results");
}

function sampleInput() {
  const { local, ownedSlots } = match;
  ownedSlots.length = 0;
  for (const id of WEAPON_ORDER) if (local.arsenal.owned[id]) ownedSlots.push(WEAPONS[id].slot);
  input.syncSlot(WEAPONS[local.arsenal.current].slot);
  const sample = input.sample(ownedSlots);
  if (!local.isAlive) sample.weapon = 0;
  return sample;
}

function idleInput() {
  return { fwd: 0, side: 0, yaw: input.yaw, pitch: input.pitch, buttons: 0, weapon: 0 };
}

function onTick(events) {
  if (!match) return;
  input.syncSlot(WEAPONS[match.local.arsenal.current].slot);
  handleEvents(events);
  if (!match || match.game.isOver) return;
  footsteps();
}

function stepMatch(dt, isRunning) {
  match.session.step(dt, isRunning ? sampleInput : idleInput, onTick);
}

function footsteps() {
  const { game, stepDistances } = match;
  for (const p of game.players) {
    if (!p.isAlive || !p.move.isOnGround || p.move.isSliding) continue;
    const speed = Math.hypot(p.move.vel.x, p.move.vel.z);
    if (speed < 3) continue;
    const travelled = (stepDistances.get(p.id) || 0) + speed * TICK_DT;
    stepDistances.set(p.id, travelled >= STEP_DISTANCE ? 0 : travelled);
    if (travelled < STEP_DISTANCE) continue;
    if (p.id === match.localId) audio.play("step", { isLocal: true, volume: 0.7 });
    else if (Math.hypot(p.move.pos.x - camera.position.x, p.move.pos.z - camera.position.z) < 22) audio.play("step", { pos: p.move.pos, volume: 1.4 });
  }
}

function updateCamera(dt, look) {
  const { local, view, session } = match;
  const m = local.move;
  const alpha = session.alpha;
  const prev = session.prevPositions.get(match.localId) || m.pos;
  const offset = session.visualOffset;
  const targetEye = eyeHeight(m);
  view.eyeOffset += (targetEye - view.eyeOffset) * Math.min(1, dt * 18);
  view.landVel += -view.landKick * 160 * dt - view.landVel * 16 * dt;
  view.landKick += view.landVel * dt * 10;
  view.punchVel += -view.punch * 220 * dt - view.punchVel * 22 * dt;
  view.punch += view.punchVel * dt;
  const sin = Math.sin(m.yaw), cos = Math.cos(m.yaw);
  const sideVel = cos * m.vel.x - sin * m.vel.z;
  const targetRoll = Math.max(-0.035, Math.min(0.035, sideVel * 0.0028)) + (m.isSliding ? 0.05 : 0);
  view.roll += (targetRoll - view.roll) * Math.min(1, dt * 8);
  view.trauma = Math.max(0, view.trauma - dt * 2.2);
  const shake = view.trauma * view.trauma;
  const t = performance.now() / 1000;
  const sx = (Math.sin(t * 61.3) + Math.sin(t * 37.1)) * 0.5 * shake * 0.035;
  const sy = (Math.sin(t * 53.7) + Math.sin(t * 29.3)) * 0.5 * shake * 0.035;
  camera.position.set(prev.x + (m.pos.x - prev.x) * alpha, prev.y + (m.pos.y - prev.y) * alpha + view.eyeOffset + view.landKick * 0.6, prev.z + (m.pos.z - prev.z) * alpha);
  if (offset) camera.position.add(offset);
  camera.rotation.set(input.pitch + view.punch + sy, input.yaw + sx, -view.roll);
  const speed = Math.hypot(m.vel.x, m.vel.z);
  view.fovKick = Math.max(0, view.fovKick - dt * 30);
  const weapon = WEAPONS[local.arsenal.current];
  const isScoped = local.isAlive && local.arsenal.isScoped;
  const fov = settings.fov + Math.min(12, Math.max(0, speed - 9) * 0.7) + view.fovKick;
  let vfov = horizontalToVertical(fov, camera.aspect);
  if (isScoped) vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov) / 2) / weapon.zoom));
  input.setSensitivityScale(isScoped ? 1 / weapon.zoom : 1);
  if (Math.abs(camera.fov - vfov) > 0.01) {
    camera.fov += (vfov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }
  audio.updateListener(camera);
  audio.setSliding(local.isAlive && m.isSliding && m.isOnGround);
  return { isScoped, speed, onGround: m.isOnGround, sliding: m.isSliding, slide: m.isSliding ? 1 : 0, roll: view.roll, landKick: view.landKick, lookDX: look.dx, lookDY: look.dy, isFiring: input.isLocked && (local.lastInput.buttons & 8) !== 0 };
}

let lastFrame = performance.now();
const perf = { element: $("perf"), averageFrame: 16.7, cpu: 0, shownAt: 0, slowFor: 0, fastFor: 0, scaleChangedAt: 0 };

function adaptResolution(rawDt, now) {
  if (!settings.adaptive || match?.isPaused || rawDt > 0.25) return;
  if (perf.averageFrame > 21) { perf.slowFor += rawDt; perf.fastFor = 0; }
  else if (perf.averageFrame < 14.5) { perf.fastFor += rawDt; perf.slowFor = 0; }
  else perf.slowFor = perf.fastFor = 0;
  if (now - perf.scaleChangedAt < 2500) return;
  let next = resolutionScale;
  if (perf.slowFor > 1.2 && resolutionScale > 0.55) next = Math.max(0.55, resolutionScale * 0.85);
  else if (perf.fastFor > 5 && resolutionScale < 1) next = Math.min(1, resolutionScale * 1.12);
  if (next === resolutionScale) return;
  resolutionScale = next;
  perf.scaleChangedAt = now;
  perf.slowFor = perf.fastFor = 0;
  resize();
}

function showPerf(now) {
  perf.element.hidden = !settings.showFps;
  if (!settings.showFps || now - perf.shownAt < 500) return;
  perf.shownAt = now;
  const info = renderer.info.render;
  perf.element.textContent = `${Math.round(1000 / perf.averageFrame)} fps · ${perf.averageFrame.toFixed(1)} ms · JS ${perf.cpu.toFixed(1)} ms\n${info.calls} zīmēšanas izsaukumi · ${(info.triangles / 1000).toFixed(0)}k trijst. · izšķirtspēja ×${resolutionScale.toFixed(2)}`;
}

renderer.info.autoReset = false;

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - lastFrame) / 1000;
  const dt = Math.min(0.1, rawDt);
  lastFrame = now;
  if (!match) return;
  const cpuStart = performance.now();
  renderer.info.reset();
  if (rawDt < 0.25) perf.averageFrame += (rawDt * 1000 - perf.averageFrame) * 0.05;
  adaptResolution(rawDt, now);
  const isOnline = match.session.isOnline;
  const isRunning = !match.isPaused && body.dataset.screen === "game" && !match.game.isOver;
  if (isRunning || isOnline) stepMatch(dt, isRunning);
  if (!match) return;
  match.local = match.session.local;
  match.localId = match.session.localId;
  if (!match.local) return;
  const animDt = isRunning || isOnline ? dt : 0;
  const look = input.consumeLook();
  const motion = updateCamera(dt, look);
  const alpha = match.session.alpha;
  match.players.sync(match.game, match.localId, alpha, animDt, match.session.prevPositions);
  match.pickups.update(match.game, now / 1000);
  match.world.update(now / 1000, Date.now());
  match.fx.update(animDt);
  match.fx.updateRockets(match.game, alpha, dt, now / 1000);
  hud.setScoped(motion.isScoped);
  viewmodel.update(animDt, match.local.move.time, match.local, motion);
  hud.update(match.game, match.local, { showScoreboard: input.isHeld("scoreboard") || body.dataset.screen === "pause", showSpeed: settings.showSpeed, now });
  if (match.quality !== "low" && (match.quality === "high" || ++match.shadowTick % 2 === 0 || match.shadowTick < 3)) renderer.shadowMap.needsUpdate = true;
  renderer.clear();
  if (match.composer) match.composer.render();
  else renderer.render(match.scene, camera);
  renderer.clearDepth();
  renderer.render(viewmodel.scene, viewmodel.camera);
  perf.cpu += (performance.now() - cpuStart - perf.cpu) * 0.1;
  showPerf(now);
}

function renderSetup() {
  const bots = $("setup-bots"), frags = $("setup-frags");
  bots.value = settings.bots;
  frags.value = settings.fragLimit;
  $("setup-bots-out").textContent = settings.bots;
  $("setup-frags-out").textContent = settings.fragLimit;
  $("setup-difficulty").value = settings.difficulty;
  $("setup-time").value = String(settings.timeLimit);
  $("setup-map").value = settings.map;
}

function readSetup() {
  settings.bots = Number($("setup-bots").value) | 0;
  settings.fragLimit = Number($("setup-frags").value) | 0;
  settings.difficulty = $("setup-difficulty").value;
  settings.timeLimit = Number($("setup-time").value) | 0;
  settings.map = $("setup-map").value;
  saveSettings(settings);
}

let listeningBind = null;
function renderSettings() {
  $("set-sens").value = settings.sensitivity;
  $("set-sens-out").textContent = settings.sensitivity.toFixed(1);
  $("set-fov").value = settings.fov;
  $("set-fov-out").textContent = `${settings.fov}°`;
  $("set-quality").value = settings.quality;
  $("set-volume").value = settings.volume;
  $("set-touch").value = settings.touchSensitivity;
  $("set-touch-out").textContent = settings.touchSensitivity.toFixed(1);
  $("set-volume-out").textContent = `${Math.round(settings.volume * 100)}%`;
  $("set-invert").checked = settings.invertY;
  $("set-speed").checked = settings.showSpeed;
  $("set-fps").checked = settings.showFps;
  $("set-adaptive").checked = settings.adaptive;
  $("binds").innerHTML = Object.keys(DEFAULT_BINDS).map(action => `<button type="button" class="bind${listeningBind === action ? " listening" : ""}" data-bind="${action}"><span>${BIND_LABELS[action]}</span><kbd>${listeningBind === action ? "…" : keyLabel(settings.binds[action])}</kbd></button>`).join("");
}

function applyBind(code) {
  if (!listeningBind) return;
  if (code !== "Escape") {
    for (const [action, bound] of Object.entries(settings.binds)) if (bound === code && action !== listeningBind) settings.binds[action] = settings.binds[listeningBind];
    settings.binds[listeningBind] = code;
    saveSettings(settings);
  }
  listeningBind = null;
  renderSettings();
}

addEventListener("keydown", e => {
  if (!listeningBind) return;
  e.preventDefault();
  e.stopPropagation();
  applyBind(e.code);
}, true);
addEventListener("mousedown", e => {
  if (!listeningBind || e.target.closest?.("[data-bind]")) return;
  e.preventDefault();
  applyBind(`Mouse${e.button}`);
}, true);

document.addEventListener("click", e => {
  const target = e.target.closest("[data-screen-target], [data-action], [data-bind], [data-loadout]");
  if (!target) return;
  audio.ensure();
  if (target.dataset.loadout) return chooseLoadout(target.dataset.loadout);
  if (target.dataset.bind) {
    listeningBind = target.dataset.bind;
    renderSettings();
    return;
  }
  if (target.dataset.screenTarget) return showScreen(target.dataset.screenTarget);
  switch (target.dataset.action) {
    case "exit": endMatch(); return exitToLessonList();
    case "copy-invite":
      if (!match?.session.isOnline) return;
      navigator.clipboard?.writeText(inviteLink(match.session.code)).then(() => { $("copy-invite").textContent = "Saite nokopēta!"; }, () => { $("copy-invite").textContent = inviteLink(match.session.code); });
      return;
    case "fullscreen": return toggleFullscreen();
    case "resume": return requestLock();
    case "quit-match":
      endMatch();
      try { history.replaceState(null, "", location.pathname); } catch {}
      return showScreen("menu");
    case "rematch": return startMatch();
    case "settings-back":
      audio.setVolume(settings.volume);
      return showScreen(match && previousScreen === "pause" ? "pause" : "menu");
    case "settings-reset":
      settings = { ...DEFAULT_SETTINGS, binds: { ...DEFAULT_BINDS }, bots: settings.bots, difficulty: settings.difficulty, fragLimit: settings.fragLimit, timeLimit: settings.timeLimit, map: settings.map };
      saveSettings(settings);
      return renderSettings();
  }
});

$("start-match").addEventListener("click", () => { readSetup(); startMatch(); });
$("setup-bots").addEventListener("input", e => { $("setup-bots-out").textContent = e.target.value; });
$("setup-frags").addEventListener("input", e => { $("setup-frags-out").textContent = e.target.value; });
const settingInputs = {
  "set-sens": v => { settings.sensitivity = Number(v); },
  "set-fov": v => { settings.fov = Number(v); },
  "set-quality": v => { settings.quality = v; },
  "set-volume": v => { settings.volume = Number(v); audio.setVolume(settings.volume); },
  "set-touch": v => { settings.touchSensitivity = Number(v); },
};
for (const [id, apply] of Object.entries(settingInputs)) {
  $(id).addEventListener("input", e => { apply(e.target.value); saveSettings(settings); renderSettings(); });
}
$("set-invert").addEventListener("change", e => { settings.invertY = e.target.checked; saveSettings(settings); });
$("set-speed").addEventListener("change", e => { settings.showSpeed = e.target.checked; saveSettings(settings); });
$("set-fps").addEventListener("change", e => { settings.showFps = e.target.checked; saveSettings(settings); });
$("set-adaptive").addEventListener("change", e => {
  settings.adaptive = e.target.checked;
  saveSettings(settings);
  if (!settings.adaptive && resolutionScale !== 1) { resolutionScale = 1; resize(); }
});

addEventListener("keydown", e => {
  if (e.code !== "Escape" || input.isLocked || listeningBind) return;
  if (body.dataset.screen === "pause") requestLock();
  else if (["setup", "settings", "controls"].includes(body.dataset.screen)) showScreen(match && previousScreen === "pause" ? "pause" : "menu");
});

document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);
input.setFullscreenHandler(toggleFullscreen);
for (const button of document.querySelectorAll("[data-action=fullscreen]")) button.hidden = !isFullscreenSupported;

document.addEventListener("visibilitychange", () => {
  if (document.hidden) audio.suspend();
});

const ONLINE_STATUS = { connecting: "Savienojas ar serveri…", retrying: "Savienojums pārtrūka, mēģina vēlreiz…", offline: "Nav interneta savienojuma, gaida…", full: "Istaba ir pilna, mēģina vēlreiz…" };
const ONLINE_ERRORS = { not_found: "Istaba ar šādu kodu nav atrasta vai jau aizvērta.", full: "Istaba ir pilna (6 cilvēki).", version: "Spēle ir atjaunināta – pārlādē lapu.", too_large: "Savienojuma kļūda." };

function weaponStats(id) {
  const w = WEAPONS[id];
  const dps = (w.damage * w.pellets) / w.fireInterval;
  const maxDps = Math.max(...LOADOUT_WEAPONS.map(k => (WEAPONS[k].damage * WEAPONS[k].pellets) / WEAPONS[k].fireInterval));
  return { power: dps / maxDps, range: Math.min(1, w.falloffEnd / 100), ammo: Math.min(1, w.magazine / 35) };
}

function renderLoadoutPickers() {
  const html = LOADOUT_WEAPONS.map(id => {
    const stats = weaponStats(id);
    const bar = (label, value) => `<span class="stat">${label}<i style="width:${Math.round(value * 100)}%"></i></span>`;
    return `<button type="button" class="loadout-option${settings.loadout === id ? " selected" : ""}" data-loadout="${id}"><b>${WEAPONS[id].name}</b>${bar("Spēks", stats.power)}${bar("Tālums", stats.range)}${bar("Aptvere", stats.ammo)}</button>`;
  }).join("");
  for (const picker of document.querySelectorAll("[data-loadout-picker]")) picker.innerHTML = html;
}

function chooseLoadout(id) {
  if (!LOADOUT_WEAPONS.includes(id)) return;
  settings.loadout = id;
  saveSettings(settings);
  renderLoadoutPickers();
  if (!match) return;
  match.session.setLoadout(id);
  hud.message(`Ekipējums: ${WEAPONS[id].name}<small>Stāsies spēkā pēc atdzimšanas</small>`, 2, performance.now());
}

function inviteLink(code) {
  return `${location.origin}${location.pathname}?join=${code}`;
}

function renderRoomInfo() {
  const isOnline = !!match?.session.isOnline;
  $("room-info").hidden = !isOnline;
  if (!isOnline) return;
  $("room-code").textContent = match.session.code;
  $("room-ping").textContent = match.session.rtt ? `ping ${Math.round(match.session.rtt)} ms` : "";
}

function showOnlineError(text) {
  $("online-error").hidden = !text;
  $("online-error").textContent = text || "";
}

function startOnline(mode) {
  const name = cleanName($("online-name").value);
  const code = $("online-code").value.trim().toUpperCase();
  if (!name) return showOnlineError("Ieraksti vārdu, ko redzēs citi spēlētāji.");
  if (mode === "join" && !CODE_PATTERN.test(code)) return showOnlineError("Istabas kods ir 5 zīmes, piemēram ABC23.");
  settings.name = name;
  saveSettings(settings);
  showOnlineError("");
  endMatch();
  $("loading-text").textContent = mode === "create" ? "Veido istabu…" : `Pievienojas istabai ${code}…`;
  showScreen("loading");
  audio.ensure();
  const roomSettings = { map: settings.map, bots: Math.min(settings.bots, 7), difficulty: settings.difficulty, fragLimit: Math.min(50, settings.fragLimit), timeLimit: Math.min(900, settings.timeLimit) };
  const session = createOnlineSession({
    mode, code, settings: roomSettings, name, loadout: settings.loadout,
    onReady() {
      try {
        buildMatch(settings.quality, session);
      } catch (error) {
        console.error(error);
        session.dispose();
        showScreen("online");
        return showOnlineError(`Neizdevās sākt maču: ${error.message}`);
      }
      try { history.replaceState(null, "", `?join=${session.code}`); } catch {}
      showScreen("game");
      requestLock();
    },
    onRestart() {
      if (match?.session !== session) return;
      hud.reset();
      hud.message(`Jauns mačs!<small>Istaba ${session.code}</small>`, 2.5, performance.now());
      if (body.dataset.screen === "results") {
        showScreen("game");
        requestLock();
      }
    },
    onStatus(status) {
      const text = ONLINE_STATUS[status.state];
      if (!text) return;
      if (body.dataset.screen === "loading") $("loading-text").textContent = text;
      else if (match?.session === session && status.state !== "connecting") hud.message(text, 3, performance.now());
    },
    onError(code) {
      if (match?.session === session) endMatch();
      if (document.pointerLockElement) document.exitPointerLock();
      showScreen("online");
      showOnlineError(ONLINE_ERRORS[code] || `Kļūda: ${code}`);
    },
  });
}

$("online-create").addEventListener("click", () => startOnline("create"));
$("online-join").addEventListener("click", () => startOnline("join"));
$("online-code").addEventListener("keydown", e => { if (e.key === "Enter") startOnline("join"); });

async function boot() {
  resize();
  requestAnimationFrame(frame);
  $("loading-bar").style.width = "30%";
  $("loading-text").textContent = "Ielādē ieročus…";
  const { error } = await viewmodel.load();
  $("loading-bar").style.width = "70%";
  $("loading-text").textContent = "Gatavo karti…";
  await new Promise(r => setTimeout(r, 0));
  loadMap(settings.map);
  $("loading-bar").style.width = "100%";
  if (error) {
    $("asset-error").hidden = false;
    $("asset-error").textContent = `Ieroču modeļi neielādējās (${error}).`;
  }
  renderLoadoutPickers();
  $("online-name").value = settings.name;
  const joinCode = new URLSearchParams(location.search).get("join")?.toUpperCase();
  if (joinCode && CODE_PATTERN.test(joinCode)) {
    $("online-code").value = joinCode;
    showScreen("online");
    if (settings.name) startOnline("join");
    return;
  }
  showScreen("menu");
}

boot().catch(error => {
  console.error(error);
  $("loading-text").textContent = `Neizdevās ielādēt: ${error.message}`;
});
