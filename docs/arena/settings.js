const STORE_KEY = "arena-settings-v1";

export const DEFAULT_BINDS = Object.freeze({
  forward: "KeyW", back: "KeyS", left: "KeyA", right: "KeyD",
  jump: "Space", crouch: "KeyC", dash: "ShiftLeft", reload: "KeyR",
  lastWeapon: "KeyQ", scoreboard: "Tab", slot1: "Digit1", slot2: "Digit2", slot3: "Digit3", slot4: "Digit4", slot5: "Digit5", slot6: "Digit6",
});

export const BIND_LABELS = Object.freeze({
  forward: "Uz priekšu", back: "Atpakaļ", left: "Pa kreisi", right: "Pa labi",
  jump: "Lēciens", crouch: "Pietupiens / slīde", dash: "Rāviens", reload: "Pārlādēt",
  lastWeapon: "Iepriekšējais ierocis", scoreboard: "Rezultāti", slot1: "Pistole", slot2: "SMG", slot3: "Triecienšautene", slot4: "AA-12", slot5: "Snaiperšautene", slot6: "Raķešu palaidējs",
});

export const DEFAULT_SETTINGS = Object.freeze({
  sensitivity: 2.2, fov: 105, quality: "medium", volume: 0.8, invertY: false, showSpeed: true, binds: DEFAULT_BINDS,
  bots: 5, difficulty: "normal", fragLimit: 20, timeLimit: 600, map: "aktuzale",
});

const QUALITIES = ["low", "medium", "high"];

function sanitize(raw) {
  const s = { ...DEFAULT_SETTINGS, binds: { ...DEFAULT_BINDS } };
  if (!raw || typeof raw !== "object") return s;
  const num = (v, min, max, fallback) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  s.sensitivity = num(raw.sensitivity, 0.1, 20, s.sensitivity);
  s.fov = num(raw.fov, 80, 130, s.fov);
  s.volume = num(raw.volume, 0, 1, s.volume);
  s.quality = QUALITIES.includes(raw.quality) ? raw.quality : s.quality;
  s.invertY = raw.invertY === true;
  s.showSpeed = raw.showSpeed !== false;
  s.bots = num(raw.bots, 1, 11, s.bots) | 0;
  s.difficulty = ["easy", "normal", "hard", "nightmare"].includes(raw.difficulty) ? raw.difficulty : s.difficulty;
  s.fragLimit = num(raw.fragLimit, 5, 100, s.fragLimit) | 0;
  s.timeLimit = num(raw.timeLimit, 120, 1800, s.timeLimit) | 0;
  if (raw.binds && typeof raw.binds === "object") {
    for (const action of Object.keys(DEFAULT_BINDS)) {
      if (typeof raw.binds[action] === "string" && raw.binds[action].length < 32) s.binds[action] = raw.binds[action];
    }
  }
  return s;
}

export function loadSettings() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORE_KEY) || "null"));
  } catch {
    return sanitize(null);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    return false;
  }
  return true;
}

export function keyLabel(code) {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const names = { Space: "Atstarpe", ShiftLeft: "Shift", ShiftRight: "Labais Shift", ControlLeft: "Ctrl", ControlRight: "Labais Ctrl", AltLeft: "Alt", Tab: "Tab", Mouse0: "Pele 1", Mouse1: "Pele 3", Mouse2: "Pele 2", Mouse3: "Pele 4", Mouse4: "Pele 5" };
  return names[code] || code;
}
