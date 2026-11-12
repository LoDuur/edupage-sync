const PREFS_KEY = "prefs";
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
export const API = isLocal ? "http://localhost:8790" : "https://edupage-proxy.loduur.workers.dev";
export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri"];
export const DAY_SHORT = ["Pirmd.", "Otrd.", "Trešd.", "Ceturtd.", "Piektd."];
export const DAY_MIN = ["Pr", "Ot", "Tr", "Ce", "Pk"];
export const DAY_LONG = ["Pirmdiena", "Otrdiena", "Trešdiena", "Ceturtdiena", "Piektdiena"];
const HUES = [212, 262, 340, 14, 32, 48, 150, 175, 192, 285];

function readPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getPrefs() {
  const prefs = readPrefs();
  return { ...prefs, v2: { ...(prefs.v2 || {}) } };
}

export function savePref(name, value) {
  const prefs = readPrefs();
  const next = { ...prefs, v2: { ...(prefs.v2 || {}), [name]: value } };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {}
}

export function saveRootPref(name, value) {
  const prefs = readPrefs();
  const next = { ...prefs };
  if (value === undefined) delete next[name];
  else next[name] = value;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {}
}

export const setVersion = version => saveRootPref("version", version);

export const THEMES = { auto: "seko sistēmai", light: "gaišā", dark: "tumšā", nord: "Nord – arktiski zils", dracula: "Dracula – violets", forest: "Forest – gaišs, zaļš", sunset: "Sunset – gaišs, silts", rose: "Rosé Pine – tumšs, maigs" };
export const isJuarch = () => !!readPrefs().juarch?.installed;
export const themeList = () => Object.keys(THEMES).concat(isJuarch() ? ["juarch"] : []);

export function applyTheme() {
  const theme = readPrefs().theme;
  if (!theme || theme === "auto" || !themeList().includes(theme)) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function subjectColor(summary) {
  const custom = readPrefs().colors?.[summary.replace(/\s*\(.*\)\s*$/, "")];
  if (typeof custom === "string" && CSS.supports("color", custom)) return custom;
  return `hsl(${subjectHue(summary)} 62% 52%)`;
}

export class FetchError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

export async function fetchJSON(url, { signal } = {}) {
  let response;
  try {
    response = await fetch(url, { cache: "no-cache", signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new FetchError("offline");
  }
  if (!response.ok) throw new FetchError(`http_${response.status}`, response.status);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new FetchError("invalid_json", response.status);
  }
  return { body, fromCache: response.headers.get("X-SW-Cache") === "1" };
}

export const isOffline = error => error?.message === "offline" && !navigator.onLine;

export const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export const fold = value => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function subjectHue(summary) {
  const key = summary.replace(/\s*\(.*\)\s*$/, "");
  const custom = readPrefs().colors?.[key];
  if (typeof custom === "number") return custom;
  const customHue = typeof custom === "string" && custom.match(/^hsl\((\d+)/);
  if (customHue) return Number(customHue[1]);
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[hash % HUES.length];
}

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, days) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function weekStartOf(iso) {
  const d = parseIso(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

export const todayIso = () => isoDate(new Date());

export const shortDate = iso => { const [, m, d] = iso.split("-"); return `${d}.${m}.`; };

export const hhmm = isoDateTime => isoDateTime.slice(11, 16);

export function formatStamp(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("lv-LV", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function weekRange(weekStart) {
  const end = addDays(weekStart, 4);
  const start = weekStart.slice(5, 7) === end.slice(5, 7) ? `${weekStart.slice(8)}.` : shortDate(weekStart);
  return `${start}–${shortDate(end)}${end.slice(0, 4)}.`;
}

export function stateHtml(title, text = "", tone = "") {
  return `<div class="state ${tone}"><b>${esc(title)}</b>${esc(text)}</div>`;
}
