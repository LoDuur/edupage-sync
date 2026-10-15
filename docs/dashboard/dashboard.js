"use strict";

const PRODUCTION_API = "https://edupage-proxy.loduur.workers.dev";
const LOCAL_API = "http://localhost:8790";
const SESSION_STORAGE_KEY = "schedule-session";
const DRAFTS_STORAGE_KEY = "schedule-drafts";
const PERIOD_COUNT = 10;
const SCHOOL_DAYS = 5;
const POLL_INTERVAL_MS = 20000;
const REQUEST_TIMEOUT_MS = 15000;
const TOAST_DURATION_MS = 4200;
const HISTORY_PAGE_SIZE = 8;
const COMPACT_QUERY = matchMedia("(max-width: 760px)");
const WEEKDAY_NAMES = ["Pirmdiena", "Otrdiena", "Trešdiena", "Ceturtdiena", "Piektdiena", "Sestdiena", "Svētdiena"];
const WEEKDAY_SHORT = ["Pr", "Ot", "Tr", "Ce", "Pk", "Se", "Sv"];
const WEEKDAY_DAY_TYPES = ["monday", "midweek", "midweek", "midweek", "friday"];
const SUBJECT_HUES = [212, 262, 340, 14, 32, 48, 150, 175, 192, 285];
const EMPTY_FIELDS = { subject: "", room: "", teacher: "", note: "" };
const ERROR_MESSAGES = {
  network: "Neizdevās sazināties ar serveri. Pārbaudi savienojumu un mēģini vēlreiz.",
  invalid_key: "Atslēga nav pareiza.",
  too_many_attempts: "Pārāk daudz neveiksmīgu mēģinājumu.",
  admin_key_not_configured: "Pārvaldībai vēl nav iestatīta piekļuves atslēga.",
  storage_not_configured: "Serverim nav pieslēgta datubāze.",
  storage_unavailable: "Serveris īslaicīgi nav pieejams. Mēģini vēlreiz pēc brīža.",
  subject_required: "Katrai stundai jānorāda priekšmets.",
};

const $ = id => document.getElementById(id);
const pad2 = value => String(value).padStart(2, "0");
const toIsoDate = date => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const parseIsoDate = iso => { const [year, month, day] = iso.split("-").map(Number); return new Date(year, month - 1, day); };
const addDays = (date, days) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const mondayOf = date => { const monday = new Date(date); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); return monday; };
const weekdayIndex = iso => (parseIsoDate(iso).getDay() + 6) % 7;
const slotKey = (date, period) => `${date}|${period}`;
const splitSlotKey = key => { const [date, period] = key.split("|"); return { date, period: Number(period) }; };
const formatMinutes = minutes => `${Math.floor(minutes / 60)}:${pad2(minutes % 60)}`;
const parseClock = text => { const [hours, minutes] = text.split(":").map(Number); return hours * 60 + minutes; };
const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const LUNCH_SUBJECT = "Pusdienas";
const OTHER_SUBJECT_VALUE = "__other__";
const isLunch = subject => /^pusdienas\b/i.test(subject.trim());
const shortDate = iso => { const date = parseIsoDate(iso); return `${WEEKDAY_SHORT[weekdayIndex(iso)]} ${date.getDate()}.${pad2(date.getMonth() + 1)}.`; };
const longDate = iso => capitalize(parseIsoDate(iso).toLocaleDateString("lv-LV", { weekday: "long", day: "numeric", month: "long" }));
const monthName = date => date.toLocaleDateString("lv-LV", { month: "long" });
const relativeTime = new Intl.RelativeTimeFormat("lv", { numeric: "auto" });

const state = {
  apiBase: resolveApiBase(),
  session: null,
  schedule: null,
  originals: new Map(),
  dayTypes: new Map(),
  subjectCatalog: new Map(),
  revision: 0,
  saved: new Map(),
  drafts: new Map(),
  history: [],
  historyVisible: HISTORY_PAGE_SIZE,
  weekStart: mondayOf(new Date()),
  selectedDayIndex: Math.min((new Date().getDay() + 6) % 7, SCHOOL_DAYS - 1),
  view: "current",
  swapSourceKey: null,
  dragSourceKey: null,
  editorKey: null,
  editorStatus: "active",
  isLoaded: false,
  isSaving: false,
  isOffline: false,
  pollTimer: null,
};

function resolveApiBase() {
  return ["localhost", "127.0.0.1"].includes(location.hostname) ? LOCAL_API : PRODUCTION_API;
}

class ApiError extends Error {
  constructor(code, status, payload = {}) {
    super(code);
    this.status = status;
    this.payload = payload;
  }
}

async function apiRequest(path, { method = "GET", body, isAuthenticated = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (isAuthenticated && state.session) headers.Authorization = `Bearer ${state.session.token}`;
  let response;
  try {
    response = await fetch(state.apiBase + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network", 0);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error || "storage_unavailable", response.status, payload);
  return payload;
}

function messageFor(error) {
  return ERROR_MESSAGES[error.message] || ERROR_MESSAGES.storage_unavailable;
}

function readStoredJson(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
}

function writeStoredJson(storageKey, value) {
  try {
    if (value === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    return;
  }
}

function persistDrafts() {
  writeStoredJson(DRAFTS_STORAGE_KEY, state.drafts.size ? [...state.drafts] : null);
}

function restoreDrafts() {
  const stored = readStoredJson(DRAFTS_STORAGE_KEY);
  if (!Array.isArray(stored)) return;
  for (const entry of stored) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
    const override = entry[1];
    if (override !== null && (typeof override !== "object" || typeof override.subject !== "string")) continue;
    state.drafts.set(entry[0], override && { ...EMPTY_FIELDS, ...override, removed: override.removed === true });
  }
}

function periodRange(periods) {
  const numbers = (periods.match(/\d+/g) || []).map(Number);
  return numbers.length ? [numbers[0], numbers[numbers.length - 1]] : [0, -1];
}

function buildOriginals(schedule) {
  state.originals = new Map();
  state.dayTypes = new Map();
  const catalogCounts = new Map();
  for (const event of schedule.events || []) {
    state.dayTypes.set(event.date, event.dayType);
    const [first, last] = periodRange(event.periods || "");
    const teacher = (event.teachers || []).join(", ");
    for (let period = first; period <= last; period++) {
      const minutes = event.slots?.[period - first] || null;
      state.originals.set(slotKey(event.date, period), { subject: event.summary, room: event.location || "", teacher, minutes });
    }
    if (isLunch(event.summary)) continue;
    const comboKey = `${event.summary}\u0000${event.location || ""}\u0000${teacher}`;
    catalogCounts.set(comboKey, (catalogCounts.get(comboKey) || 0) + 1);
  }
  const bestBySubject = new Map();
  for (const [comboKey, count] of catalogCounts) {
    const [subject, room, teacher] = comboKey.split("\u0000");
    const best = bestBySubject.get(subject);
    if (!best || count > best.count) bestBySubject.set(subject, { room, teacher, count });
  }
  state.subjectCatalog = bestBySubject;
}

function dayTypeFor(iso) {
  return state.dayTypes.get(iso) || WEEKDAY_DAY_TYPES[weekdayIndex(iso)] || "midweek";
}

function slotMinutes(date, period) {
  const original = state.originals.get(slotKey(date, period));
  if (original?.minutes) return original.minutes;
  const bell = state.schedule?.bells?.[dayTypeFor(date)]?.[period - 1];
  return bell ? bell.split("-").map(parseClock) : null;
}

function slotTimeLabel(date, period) {
  const minutes = slotMinutes(date, period);
  return minutes ? `${formatMinutes(minutes[0])}–${formatMinutes(minutes[1])}` : "";
}

function subjectHue(subject) {
  const key = subject.replace(/\s*\(.*\)\s*$/, "");
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SUBJECT_HUES[hash % SUBJECT_HUES.length];
}

function overridesEqual(first, second) {
  if (!first || !second) return first === second;
  return first.subject === second.subject && first.room === second.room && first.teacher === second.teacher && first.note === second.note && first.removed === second.removed;
}

function overrideAt(key, includeDrafts = true) {
  if (includeDrafts && state.drafts.has(key)) return state.drafts.get(key);
  return state.saved.get(key) || null;
}

function describeSlot(key, override) {
  const original = state.originals.get(key) || null;
  const base = { key, ...splitSlotKey(key), original };
  if (!override) return original ? { ...base, ...EMPTY_FIELDS, ...pickFields(original), status: "original" } : { ...base, ...EMPTY_FIELDS, status: "empty" };
  if (override.removed) return original ? { ...base, ...pickFields(original), note: override.note, status: "removed" } : { ...base, ...EMPTY_FIELDS, status: "empty" };
  return { ...base, ...pickFields(override), note: override.note, status: original ? "changed" : "added" };
}

function pickFields(source) {
  return { subject: source.subject, room: source.room, teacher: source.teacher, note: source.note || "" };
}

function lessonAt(key) {
  if (state.view === "original") return { ...describeSlot(key, null), isDraft: false };
  return { ...describeSlot(key, overrideAt(key)), isDraft: state.drafts.has(key) };
}

function contentOf(lesson) {
  return lesson.status === "empty" || lesson.status === "removed" ? null : pickFields(lesson);
}

function normalizeOverride(key, override) {
  if (!override) return null;
  const original = state.originals.get(key);
  if (override.removed) return original ? { ...EMPTY_FIELDS, note: override.note || "", removed: true } : null;
  const fields = pickFields(override);
  if (original && !fields.note && fields.subject === original.subject && fields.room === original.room && fields.teacher === original.teacher) return null;
  return { ...fields, removed: false };
}

function overrideFromContent(key, content) {
  if (content) return normalizeOverride(key, { ...content, removed: false });
  return state.originals.has(key) ? { ...EMPTY_FIELDS, removed: true } : null;
}

function stageOverride(key, override) {
  const normalized = normalizeOverride(key, override);
  if (overridesEqual(normalized, state.saved.get(key) || null)) state.drafts.delete(key);
  else state.drafts.set(key, normalized);
}

function pruneDrafts() {
  for (const [key, draft] of state.drafts) {
    if (overridesEqual(draft, state.saved.get(key) || null)) state.drafts.delete(key);
  }
}

function applyServerState({ revision, overrides }) {
  const hasChanged = revision !== state.revision;
  state.revision = revision;
  state.saved = new Map(overrides.map(row => [slotKey(row.date, row.period), { subject: row.subject, room: row.room, teacher: row.teacher, note: row.note, removed: row.removed }]));
  pruneDrafts();
  persistDrafts();
  return hasChanged;
}

function weekDates() {
  return Array.from({ length: SCHOOL_DAYS }, (_, index) => toIsoDate(addDays(state.weekStart, index)));
}

function lessonLabel(lesson) {
  if (lesson.status === "empty") return "Brīvs";
  if (lesson.status === "removed") return `${lesson.subject} (atcelta)`;
  return lesson.subject;
}

function describeDifference(before, after) {
  if (before.status === "removed" && after.status !== "removed" && before.subject === after.subject) return `${after.subject} atjaunota`;
  if (after.status === "removed") return `${before.subject || after.subject} atcelta`;
  if (before.subject !== after.subject || before.status === "empty" || after.status === "empty") return `${lessonLabel(before)} → ${lessonLabel(after)}`;
  const details = [];
  if (before.room !== after.room) details.push(`kabinets ${before.room || "—"} → ${after.room || "—"}`);
  if (before.teacher !== after.teacher) details.push(`skolotājs ${before.teacher || "—"} → ${after.teacher || "—"}`);
  if (before.note !== after.note) details.push(after.note ? `piezīme „${after.note}”` : "piezīme noņemta");
  return `${after.subject}: ${details.join(", ") || "bez izmaiņām"}`;
}

function setSyncStatus() {
  const element = $("sync-status");
  let tone = "ok";
  let text = "Viss saglabāts";
  if (state.isSaving) { tone = "busy"; text = "Saglabā…"; }
  else if (state.isOffline) { tone = "error"; text = "Nav savienojuma"; }
  else if (state.drafts.size) { tone = "pending"; text = state.drafts.size === 1 ? "1 nesaglabāta izmaiņa" : `${state.drafts.size} nesaglabātas izmaiņas`; }
  element.dataset.tone = tone;
  element.querySelector("span").textContent = text;
  element.title = text;
}

function renderSaveBar() {
  const count = state.drafts.size;
  $("savebar").hidden = count === 0 || Boolean(state.swapSourceKey);
  $("savebar-text").textContent = count === 1 ? "1 nesaglabāta izmaiņa" : `${count} nesaglabātas izmaiņas`;
  $("save-drafts").disabled = state.isSaving;
  $("discard-drafts").disabled = state.isSaving;
  $("save-drafts").classList.toggle("is-busy", state.isSaving);
}

function renderWeekNav() {
  const dates = weekDates();
  const first = parseIsoDate(dates[0]);
  const last = parseIsoDate(dates[SCHOOL_DAYS - 1]);
  $("week-label").textContent = first.getMonth() === last.getMonth()
    ? `${first.getDate()}.–${last.getDate()}. ${monthName(last)}`
    : `${first.getDate()}. ${monthName(first).slice(0, 3)}. – ${last.getDate()}. ${monthName(last).slice(0, 3)}.`;
  $("week-today").disabled = toIsoDate(state.weekStart) === toIsoDate(mondayOf(new Date()));
}

function renderBoardNotice(dates) {
  const notice = $("board-notice");
  const hasOriginalData = dates.some(date => state.dayTypes.has(date));
  if (state.view === "original") {
    notice.className = "notice";
    notice.textContent = "Skatīts EduPage oriģinālais saraksts bez manuālām izmaiņām. Lai rediģētu, pārslēdz uz „Aktuālais”.";
    notice.hidden = false;
    return;
  }
  notice.hidden = hasOriginalData;
  if (!hasOriginalData) {
    notice.className = "notice";
    notice.textContent = "Šai nedēļai EduPage datu nav. Stundas vari pievienot manuāli.";
  }
}

function cellHtml(lesson, { joinsPrev, joinsNext, isEditable }) {
  const classes = ["cell", `is-${lesson.status}`];
  if (lesson.isDraft) classes.push("is-draft");
  if (joinsPrev) classes.push("joins-prev");
  if (joinsNext) classes.push("joins-next");
  if (lesson.subject && isLunch(lesson.subject) && lesson.status === "original") classes.push("is-lunch");
  if (lesson.key === state.swapSourceKey) classes.push("is-swap-source");
  const minutes = slotMinutes(lesson.date, lesson.period);
  const time = minutes ? formatMinutes(minutes[0]) : "";
  const timeLabel = slotTimeLabel(lesson.date, lesson.period);
  const dayName = WEEKDAY_NAMES[weekdayIndex(lesson.date)];
  const disabled = isEditable ? "" : " disabled";
  if (lesson.status === "empty") {
    return `<button type="button" class="${classes.join(" ")}" data-key="${lesson.key}" aria-label="${dayName}, ${lesson.period}. stunda${timeLabel ? `, ${timeLabel}` : ""}: brīvs. Pievienot stundu"${disabled}>
      <span class="cell-top"><span class="cell-time">${time}</span>${lesson.isDraft ? '<span class="cell-tag">Noņemta</span>' : ""}</span>
      <span class="cell-add" aria-hidden="true">+ Pievienot</span>
    </button>`;
  }
  const tag = { changed: "Mainīta", added: "Pievienota", removed: "Atcelta" }[lesson.status] || (lesson.isDraft ? "Oriģināls" : "");
  const statusText = tag ? `, ${tag.toLowerCase()}` : "";
  const draggable = isEditable && lesson.status !== "removed" ? ' draggable="true"' : "";
  return `<button type="button" class="${classes.join(" ")}" data-key="${lesson.key}" style="--hue:${subjectHue(lesson.subject)}" aria-label="${escapeHtml(`${dayName}, ${lesson.period}. stunda${timeLabel ? `, ${timeLabel}` : ""}: ${lesson.subject}${lesson.room ? `, ${lesson.room}` : ""}${statusText}${lesson.isDraft ? ", nesaglabāta" : ""}`)}"${draggable}${disabled}>
    <span class="cell-top"><span class="cell-time">${time}</span>${tag ? `<span class="cell-tag">${tag}</span>` : ""}</span>
    <span class="cell-subject"><span class="mark">${escapeHtml(lesson.subject)}</span></span>
    ${lesson.room || lesson.teacher ? `<span class="cell-meta">${lesson.room ? `<span class="room">${escapeHtml(lesson.room)}</span>` : ""}${lesson.teacher ? `<span>${escapeHtml(lesson.teacher)}</span>` : ""}</span>` : ""}
    ${lesson.note ? `<span class="cell-note">${escapeHtml(lesson.note)}</span>` : ""}
  </button>`;
}

function isSameBlock(first, second) {
  return first && second && first.status === second.status && first.status !== "empty" && first.isDraft === second.isDraft
    && first.subject === second.subject && first.room === second.room && first.teacher === second.teacher && first.note === second.note;
}

function renderDayTabs(dates) {
  const todayIso = toIsoDate(new Date());
  $("day-tabs").innerHTML = dates.map((date, index) => {
    const hasChanges = Array.from({ length: PERIOD_COUNT }, (_, period) => slotKey(date, period + 1)).some(key => state.drafts.has(key) || state.saved.has(key));
    const classes = ["day-tab", date === todayIso ? "is-today" : "", hasChanges && state.view === "current" ? "has-changes" : ""].filter(Boolean).join(" ");
    return `<button type="button" role="tab" class="${classes}" data-day-index="${index}" aria-selected="${index === state.selectedDayIndex}">${WEEKDAY_SHORT[index]}<b>${parseIsoDate(date).getDate()}</b></button>`;
  }).join("");
}

function renderTimetable() {
  const table = $("timetable");
  const dates = weekDates();
  const isCompact = COMPACT_QUERY.matches;
  const visibleDates = isCompact ? [dates[state.selectedDayIndex]] : dates;
  const todayIso = toIsoDate(new Date());
  const isEditable = state.view === "current";
  table.classList.toggle("is-single", isCompact);
  table.setAttribute("aria-busy", "false");
  renderBoardNotice(dates);
  renderDayTabs(dates);

  const columns = visibleDates.map(date => Array.from({ length: PERIOD_COUNT }, (_, index) => lessonAt(slotKey(date, index + 1))));
  const parts = ['<div class="corner"></div>'];
  for (const date of visibleDates) {
    const day = parseIsoDate(date);
    parts.push(`<div class="day-head${date === todayIso ? " is-today" : ""}"><span class="day-name">${WEEKDAY_NAMES[weekdayIndex(date)]}</span><span class="day-date">${day.getDate()}.${pad2(day.getMonth() + 1)}.</span></div>`);
  }
  for (let period = 1; period <= PERIOD_COUNT; period++) {
    parts.push(`<div class="period-label" aria-hidden="true">${period}.</div>`);
    for (const column of columns) {
      const lesson = column[period - 1];
      parts.push(cellHtml(lesson, {
        joinsPrev: isSameBlock(column[period - 2], lesson),
        joinsNext: isSameBlock(lesson, column[period]),
        isEditable,
      }));
    }
  }
  table.innerHTML = parts.join("");
}

function renderSkeleton() {
  const parts = ['<div class="corner"></div>'];
  const columns = COMPACT_QUERY.matches ? 1 : SCHOOL_DAYS;
  $("timetable").classList.toggle("is-single", COMPACT_QUERY.matches);
  for (let index = 0; index < columns; index++) parts.push('<div class="day-head"><span class="day-name">&nbsp;</span></div>');
  for (let period = 1; period <= 7; period++) {
    parts.push(`<div class="period-label">${period}.</div>`);
    for (let index = 0; index < columns; index++) parts.push('<div class="skeleton"></div>');
  }
  $("timetable").innerHTML = parts.join("");
}

function nextSchoolDay() {
  const today = new Date();
  for (let offset = 0; offset < 14; offset++) {
    const iso = toIsoDate(addDays(today, offset));
    if (weekdayIndex(iso) >= SCHOOL_DAYS) continue;
    const hasLessons = Array.from({ length: PERIOD_COUNT }, (_, index) => lessonAt(slotKey(iso, index + 1))).some(lesson => lesson.status !== "empty");
    if (hasLessons) return { iso, offset };
  }
  return null;
}

function mergedLessons(iso) {
  const blocks = [];
  for (let period = 1; period <= PERIOD_COUNT; period++) {
    const lesson = describeSlot(slotKey(iso, period), overrideAt(slotKey(iso, period), false));
    if (lesson.status === "empty") continue;
    const minutes = slotMinutes(iso, period);
    const previous = blocks[blocks.length - 1];
    if (previous && previous.lastPeriod === period - 1 && isSameBlock({ ...previous.lesson, isDraft: false }, { ...lesson, isDraft: false })) {
      previous.lastPeriod = period;
      if (minutes) previous.end = minutes[1];
      continue;
    }
    blocks.push({ lesson, firstPeriod: period, lastPeriod: period, start: minutes?.[0] ?? null, end: minutes?.[1] ?? null });
  }
  return blocks;
}

function renderToday() {
  const target = nextSchoolDay();
  const list = $("today-list");
  if (!target) {
    $("today-title").textContent = "Šodien";
    $("today-date").textContent = longDate(toIsoDate(new Date()));
    list.innerHTML = '<li class="empty-state">Tuvākajās divās nedēļās stundu nav.</li>';
    return;
  }
  $("today-title").textContent = target.offset === 0 ? "Šodien" : target.offset === 1 ? "Rīt" : "Nākamā mācību diena";
  $("today-date").textContent = longDate(target.iso);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  list.innerHTML = mergedLessons(target.iso).map(({ lesson, start, end }) => {
    const isToday = target.offset === 0;
    const classes = [`is-${lesson.status}`];
    if (isToday && start !== null && start <= nowMinutes && nowMinutes < end) classes.push("is-now");
    if (isToday && end !== null && end <= nowMinutes) classes.push("is-past");
    const meta = [lesson.room, lesson.teacher].filter(Boolean).join(", ");
    const detail = lesson.status === "removed" ? "Atcelta" : meta;
    return `<li class="${classes.join(" ")}"><time>${start !== null ? formatMinutes(start) : ""}</time><div><b><span>${escapeHtml(lesson.subject)}</span></b>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div></li>`;
  }).join("");
}

function renderWeekChanges() {
  const dates = new Set(weekDates());
  const keys = [...new Set([...state.saved.keys(), ...state.drafts.keys()])]
    .filter(key => dates.has(splitSlotKey(key).date))
    .sort((first, second) => {
      const a = splitSlotKey(first);
      const b = splitSlotKey(second);
      return a.date === b.date ? a.period - b.period : a.date < b.date ? -1 : 1;
    });
  const items = keys.map(key => {
    const before = describeSlot(key, null);
    const after = describeSlot(key, overrideAt(key));
    if (before.status === after.status && overridesEqual(pickFields(before), pickFields(after))) return "";
    const { date, period } = splitSlotKey(key);
    const draftLabel = state.drafts.has(key) ? " <em>nesaglabāta</em>" : "";
    return `<li><button type="button" class="change-item" data-key="${key}"><span class="change-what">${escapeHtml(describeDifference(before, after))}</span><span class="change-where">${WEEKDAY_NAMES[weekdayIndex(date)]}, ${period}. stunda${draftLabel}</span></button></li>`;
  }).filter(Boolean);
  $("week-changes").innerHTML = items.length ? items.join("") : '<li class="empty-state">Šajā nedēļā saraksts sakrīt ar EduPage.</li>';
}

function describeSnapshot(key, snapshot) {
  return describeSlot(key, snapshot ? { ...EMPTY_FIELDS, ...snapshot } : null);
}

function renderHistory() {
  const visible = state.history.slice(0, state.historyVisible);
  $("history-list").innerHTML = visible.length
    ? visible.map(entry => {
      const key = slotKey(entry.date, entry.period);
      const text = describeDifference(describeSnapshot(key, entry.before), describeSnapshot(key, entry.after));
      const when = formatRelative(new Date(entry.at));
      return `<li><button type="button" class="change-item" data-key="${key}" data-jump="true"><span class="change-what">${escapeHtml(text)}</span><span class="change-where">${shortDate(entry.date)}, ${entry.period}. st. · <time datetime="${escapeHtml(entry.at)}" title="${new Date(entry.at).toLocaleString("lv-LV")}">${when}</time></span></button></li>`;
    }).join("")
    : '<li class="empty-state">Vēl nav saglabātu izmaiņu.</li>';
  $("history-more").hidden = state.history.length <= state.historyVisible;
}

function formatRelative(date) {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeTime.format(Math.round(seconds / size), unit);
  }
  return "tikko";
}

function renderSwapBanner() {
  const banner = $("swap-banner");
  document.body.classList.toggle("is-swapping", Boolean(state.swapSourceKey));
  if (!state.swapSourceKey) { banner.hidden = true; return; }
  const source = lessonAt(state.swapSourceKey);
  $("swap-text").textContent = `Izvēlies stundu, ar kuru samainīt „${lessonLabel(source)}” (${shortDate(source.date)}, ${source.period}. st.)`;
  banner.hidden = false;
}

function renderAll() {
  if (!state.isLoaded) return;
  renderWeekNav();
  renderTimetable();
  renderSwapBanner();
  renderToday();
  renderWeekChanges();
  renderHistory();
  renderSaveBar();
  setSyncStatus();
}

function showToast(message, tone = "ok") {
  const toast = document.createElement("div");
  toast.className = `toast${tone === "ok" ? "" : ` is-${tone}`}`;
  toast.textContent = message;
  $("toasts").append(toast);
  setTimeout(() => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 220);
  }, TOAST_DURATION_MS);
}

function confirmAction({ title, body, acceptLabel }) {
  const dialog = $("confirm");
  $("confirm-title").textContent = title;
  $("confirm-body").textContent = body;
  $("confirm-accept").textContent = acceptLabel;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "accept"), { once: true }));
}

function flashCell(key) {
  requestAnimationFrame(() => {
    const cell = document.querySelector(`.cell[data-key="${CSS.escape(key)}"]`);
    if (!cell) return;
    cell.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    cell.classList.add("is-flash");
    cell.addEventListener("animationend", () => cell.classList.remove("is-flash"), { once: true });
  });
}

function revealSlot(key) {
  const { date } = splitSlotKey(key);
  state.weekStart = mondayOf(parseIsoDate(date));
  state.selectedDayIndex = Math.min(weekdayIndex(date), SCHOOL_DAYS - 1);
  renderAll();
  flashCell(key);
}

function fillEditorOptions() {
  const subjects = new Set([...state.subjectCatalog.keys()]);
  const teachers = new Set();
  for (const original of state.originals.values()) original.teacher.split(", ").filter(Boolean).forEach(name => teachers.add(name));
  for (const override of state.saved.values()) {
    if (override.subject && !isLunch(override.subject)) subjects.add(override.subject);
    if (override.teacher) teachers.add(override.teacher);
  }
  const options = values => [...values].sort((a, b) => a.localeCompare(b, "lv")).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  subjects.add(LUNCH_SUBJECT);
  $("editor-subject-pick").innerHTML = `<option value="">Izvēlies priekšmetu</option>${options(subjects)}<option value="${OTHER_SUBJECT_VALUE}">Cits priekšmets…</option>`;
  $("teacher-options").innerHTML = options(teachers);
}

function setEditorStatus(status) {
  state.editorStatus = status;
  for (const button of $("editor-status").querySelectorAll("button")) button.setAttribute("aria-checked", String(button.dataset.status === status));
  const isRemoved = status === "removed";
  for (const id of ["editor-subject-pick", "editor-subject", "editor-room", "editor-teacher"]) $(id).disabled = isRemoved;
  $("editor-note").placeholder = isRemoved ? "Piem., skolotājs slims" : "Piem., aizvieto skolotāju";
  clearSubjectError();
}

function clearSubjectError() {
  $("editor-subject-error").hidden = true;
  $("editor-subject-pick").removeAttribute("aria-invalid");
  $("editor-subject").removeAttribute("aria-invalid");
}

function openEditor(key) {
  const lesson = lessonAt(key);
  const original = lesson.original;
  state.editorKey = key;
  fillEditorOptions();
  $("editor-title").textContent = `${longDate(lesson.date)}, ${lesson.period}. stunda`;
  $("editor-sub").textContent = slotTimeLabel(lesson.date, lesson.period) || "Laiks nav zināms";
  $("editor-original").innerHTML = original
    ? `<span class="original-label">EduPage</span><b>${escapeHtml(original.subject)}</b>${original.room || original.teacher ? `<span>${escapeHtml([original.room, original.teacher].filter(Boolean).join(", "))}</span>` : ""}`
    : '<span class="original-label">EduPage</span><span>Šajā laikā stundas nav</span>';
  $("editor-status").hidden = !original;
  const isRemoved = lesson.status === "removed";
  showSubject(isRemoved ? original.subject : lesson.subject);
  $("editor-room").value = isRemoved ? original.room : lesson.room;
  $("editor-teacher").value = isRemoved ? original.teacher : lesson.teacher;
  $("editor-note").value = lesson.note;
  setEditorStatus(isRemoved ? "removed" : "active");
  $("editor-reset").hidden = !original || lesson.status === "original";
  $("editor-clear").hidden = Boolean(original) || lesson.status === "empty";
  $("editor-swap").hidden = lesson.status === "empty" && !original;
  $("editor").showModal();
  if (!isRemoved) $("editor-subject-pick").focus();
}

function closeEditor() {
  state.editorKey = null;
  if ($("editor").open) $("editor").close();
}

function applyEditor(event) {
  event.preventDefault();
  const key = state.editorKey;
  if (!key) return;
  const isRemoved = state.editorStatus === "removed";
  const fields = {
    subject: $("editor-subject").value.replace(/\s+/g, " ").trim(),
    room: $("editor-room").value.replace(/\s+/g, " ").trim(),
    teacher: $("editor-teacher").value.replace(/\s+/g, " ").trim(),
    note: $("editor-note").value.replace(/\s+/g, " ").trim(),
  };
  if (!isRemoved && !fields.subject) {
    const field = $("editor-subject").hidden ? $("editor-subject-pick") : $("editor-subject");
    $("editor-subject-error").hidden = false;
    field.setAttribute("aria-invalid", "true");
    field.focus();
    return;
  }
  stageOverride(key, { ...fields, removed: isRemoved });
  persistDrafts();
  closeEditor();
  renderAll();
  flashCell(key);
}

function showSubject(subject) {
  const picker = $("editor-subject-pick");
  const isListed = [...picker.options].some(option => option.value === subject && option.value !== OTHER_SUBJECT_VALUE);
  picker.value = isListed || !subject ? subject : OTHER_SUBJECT_VALUE;
  $("editor-subject").value = subject;
  $("editor-subject").hidden = isListed || !subject;
}

function pickSubject() {
  clearSubjectError();
  const picked = $("editor-subject-pick").value;
  if (picked === OTHER_SUBJECT_VALUE) {
    $("editor-subject").value = "";
    $("editor-subject").hidden = false;
    $("editor-subject").focus();
    return;
  }
  $("editor-subject").value = picked;
  $("editor-subject").hidden = true;
  if (isLunch(picked)) {
    $("editor-room").value = "";
    $("editor-teacher").value = "";
    return;
  }
  const known = state.subjectCatalog.get(picked);
  if (!known) return;
  $("editor-room").value = known.room;
  $("editor-teacher").value = known.teacher;
}

function resetEditorSlot() {
  const key = state.editorKey;
  if (!key) return;
  stageOverride(key, null);
  persistDrafts();
  closeEditor();
  renderAll();
  flashCell(key);
}

function clearEditorSlot() {
  const key = state.editorKey;
  if (!key) return;
  stageOverride(key, null);
  persistDrafts();
  closeEditor();
  renderAll();
}

function startSwap(key) {
  closeEditor();
  state.swapSourceKey = key;
  renderAll();
}

function cancelSwap() {
  state.swapSourceKey = null;
  renderAll();
}

function swapSlots(firstKey, secondKey) {
  if (firstKey === secondKey) return;
  const first = lessonAt(firstKey);
  const second = lessonAt(secondKey);
  stageOverride(firstKey, overrideFromContent(firstKey, contentOf(second)));
  stageOverride(secondKey, overrideFromContent(secondKey, contentOf(first)));
  persistDrafts();
  state.swapSourceKey = null;
  renderAll();
  showToast(`Samainītas vietām: ${lessonLabel(first)} un ${lessonLabel(second)}`);
  flashCell(secondKey);
}

function handleCellActivate(key) {
  if (state.view !== "current") return;
  if (state.swapSourceKey) {
    if (state.swapSourceKey === key) cancelSwap();
    else swapSlots(state.swapSourceKey, key);
    return;
  }
  openEditor(key);
}

async function saveDrafts() {
  if (!state.drafts.size || state.isSaving) return;
  state.isSaving = true;
  renderSaveBar();
  setSyncStatus();
  const changes = [...state.drafts].map(([key, override]) => ({ ...splitSlotKey(key), override }));
  try {
    const result = await apiRequest("/schedule/changes", { method: "POST", body: { baseRevision: state.revision, changes }, isAuthenticated: true });
    state.drafts.clear();
    applyServerState(result);
    state.isOffline = false;
    showToast(changes.length === 1 ? "Izmaiņa saglabāta" : `Saglabātas ${changes.length} izmaiņas`);
    refreshHistory();
  } catch (error) {
    handleSaveError(error);
  } finally {
    state.isSaving = false;
    renderAll();
  }
}

function handleSaveError(error) {
  if (error.status === 401) return expireSession();
  if (error.status === 409 && error.payload.overrides) {
    applyServerState(error.payload);
    refreshHistory();
    const remaining = state.drafts.size;
    showToast(remaining ? "Kāds cits tikko saglabāja izmaiņas. Saraksts atjaunots, tavas izmaiņas palika nesaglabātas — pārskati un saglabā vēlreiz." : "Kāds cits jau saglabāja tās pašas izmaiņas.", "warn");
    return;
  }
  if (error.message === "network") state.isOffline = true;
  showToast(`Neizdevās saglabāt. ${messageFor(error)}`, "error");
}

async function discardDrafts() {
  if (!state.drafts.size) return;
  const count = state.drafts.size;
  const isConfirmed = await confirmAction({
    title: count === 1 ? "Atmest 1 izmaiņu?" : `Atmest ${count} izmaiņas?`,
    body: "Nesaglabātās izmaiņas tiks dzēstas. Saglabātais saraksts paliks nemainīts.",
    acceptLabel: "Atmest",
  });
  if (!isConfirmed) return;
  state.drafts.clear();
  persistDrafts();
  renderAll();
  showToast("Nesaglabātās izmaiņas atmestas");
}

async function refreshHistory() {
  try {
    const { history } = await apiRequest("/schedule/history", { isAuthenticated: true });
    state.history = history;
    renderHistory();
  } catch (error) {
    if (error.status === 401) expireSession();
  }
}

async function pollForUpdates() {
  if (document.hidden || state.isSaving || !state.session) return;
  try {
    const result = await apiRequest("/schedule/overrides");
    const wasOffline = state.isOffline;
    state.isOffline = false;
    if (applyServerState(result)) {
      renderAll();
      refreshHistory();
      showToast("Saraksts atjaunināts — kāds saglabāja jaunas izmaiņas");
    } else if (wasOffline) {
      setSyncStatus();
    }
  } catch (error) {
    if (error.message === "network") { state.isOffline = true; setSyncStatus(); }
  }
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(pollForUpdates, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function loadSchedule() {
  const response = await fetch(new URL("../data.json", location.href), { cache: "no-store" }).catch(() => null);
  if (!response?.ok) throw new ApiError("schedule_unavailable", 0);
  return response.json();
}

async function loadDashboard() {
  $("login-screen").hidden = true;
  $("app").hidden = false;
  renderSkeleton();
  try {
    const [schedule, serverState, { history }] = await Promise.all([
      loadSchedule(),
      apiRequest("/schedule/overrides"),
      apiRequest("/schedule/history", { isAuthenticated: true }),
    ]);
    state.schedule = schedule;
    buildOriginals(schedule);
    $("group-name").textContent = schedule.className || "Stundu saraksts";
    document.title = `Saraksta pārvaldība · ${schedule.className || ""}`.trim();
    restoreDrafts();
    applyServerState(serverState);
    state.history = history;
    state.isLoaded = true;
    renderAll();
    startPolling();
    if (state.drafts.size) showToast("Atjaunotas iepriekš nesaglabātās izmaiņas", "warn");
  } catch (error) {
    if (error.status === 401) return expireSession();
    renderLoadError(error);
  }
}

function renderLoadError(error) {
  const notice = $("board-notice");
  notice.className = "notice is-error";
  notice.innerHTML = `<span>${escapeHtml(error.message === "schedule_unavailable" ? "Neizdevās ielādēt EduPage sarakstu." : messageFor(error))}</span><button class="button button-secondary button-small" type="button" id="retry-load">Mēģināt vēlreiz</button>`;
  notice.hidden = false;
  $("timetable").innerHTML = "";
  $("retry-load").addEventListener("click", () => { notice.hidden = true; loadDashboard(); });
}

function showLogin(message) {
  stopPolling();
  closeEditor();
  $("app").hidden = true;
  $("login-screen").hidden = false;
  $("login-lead").textContent = message || "Ievadi piekļuves atslēgu, lai rediģētu stundu sarakstu.";
  $("login-key").value = "";
  setLoginError("");
  $("login-key").focus();
}

function setLoginError(message) {
  $("login-error").textContent = message;
  $("login-error").hidden = !message;
  $("login-key").toggleAttribute("aria-invalid", Boolean(message));
}

function expireSession() {
  state.session = null;
  writeStoredJson(SESSION_STORAGE_KEY, null);
  showLogin(state.drafts.size ? "Sesija beigusies. Ievadi atslēgu vēlreiz — nesaglabātās izmaiņas ir saglabātas šajā pārlūkā." : "Sesija beigusies. Ievadi atslēgu vēlreiz.");
}

async function submitLogin(event) {
  event.preventDefault();
  const key = $("login-key").value.trim();
  if (!key) { setLoginError("Ievadi atslēgu."); return; }
  const submit = $("login-submit");
  submit.disabled = true;
  submit.classList.add("is-busy");
  setLoginError("");
  try {
    state.session = await apiRequest("/schedule/login", { method: "POST", body: { key } });
    writeStoredJson(SESSION_STORAGE_KEY, state.session);
    $("login-key").value = "";
    await loadDashboard();
  } catch (error) {
    setLoginError(loginErrorMessage(error));
    $("login-key").select();
  } finally {
    submit.disabled = false;
    submit.classList.remove("is-busy");
  }
}

function loginErrorMessage(error) {
  if (error.message === "invalid_key") {
    const attemptsLeft = error.payload.attemptsLeft;
    return attemptsLeft > 0 && attemptsLeft <= 3 ? `${ERROR_MESSAGES.invalid_key} Atlikuši ${attemptsLeft} mēģinājumi.` : ERROR_MESSAGES.invalid_key;
  }
  if (error.message === "too_many_attempts") {
    const minutes = Math.max(1, Math.ceil((error.payload.retryAfterSeconds || 60) / 60));
    return `${ERROR_MESSAGES.too_many_attempts} Mēģini vēlreiz pēc ${minutes} min.`;
  }
  return messageFor(error);
}

async function logout() {
  if (state.drafts.size) {
    const isConfirmed = await confirmAction({
      title: "Iziet ar nesaglabātām izmaiņām?",
      body: "Izmaiņas paliks saglabātas šajā pārlūkā un būs redzamas pēc nākamās ieiešanas, bet citi tās neredzēs.",
      acceptLabel: "Iziet",
    });
    if (!isConfirmed) return;
  }
  state.session = null;
  state.isLoaded = false;
  state.drafts.clear();
  writeStoredJson(SESSION_STORAGE_KEY, null);
  showLogin();
}

async function resumeSession() {
  const stored = readStoredJson(SESSION_STORAGE_KEY);
  if (!stored || typeof stored.token !== "string" || !(stored.expiresAt > Date.now())) {
    writeStoredJson(SESSION_STORAGE_KEY, null);
    return showLogin();
  }
  state.session = stored;
  try {
    await apiRequest("/schedule/session", { isAuthenticated: true });
    await loadDashboard();
  } catch (error) {
    if (error.status === 401) return expireSession();
    showLogin(messageFor(error));
  }
}

function changeWeek(offsetWeeks) {
  state.weekStart = addDays(state.weekStart, offsetWeeks * 7);
  renderAll();
}

function bindEvents() {
  $("login-form").addEventListener("submit", submitLogin);
  $("week-prev").addEventListener("click", () => changeWeek(-1));
  $("week-next").addEventListener("click", () => changeWeek(1));
  $("week-today").addEventListener("click", () => {
    state.weekStart = mondayOf(new Date());
    state.selectedDayIndex = Math.min((new Date().getDay() + 6) % 7, SCHOOL_DAYS - 1);
    renderAll();
  });
  $("logout").addEventListener("click", logout);
  $("save-drafts").addEventListener("click", saveDrafts);
  $("discard-drafts").addEventListener("click", discardDrafts);
  $("swap-cancel").addEventListener("click", cancelSwap);
  $("history-more").addEventListener("click", () => { state.historyVisible += HISTORY_PAGE_SIZE; renderHistory(); });

  for (const button of document.querySelectorAll(".topbar .segmented button")) {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.swapSourceKey = null;
      for (const other of document.querySelectorAll(".topbar .segmented button")) other.setAttribute("aria-checked", String(other === button));
      renderAll();
    });
  }

  $("day-tabs").addEventListener("click", event => {
    const tab = event.target.closest(".day-tab");
    if (!tab) return;
    state.selectedDayIndex = Number(tab.dataset.dayIndex);
    renderAll();
  });

  const timetable = $("timetable");
  timetable.addEventListener("click", event => {
    const cell = event.target.closest(".cell");
    if (cell && !cell.disabled) handleCellActivate(cell.dataset.key);
  });
  timetable.addEventListener("dragstart", event => {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    state.dragSourceKey = cell.dataset.key;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cell.dataset.key);
    cell.classList.add("is-dragging");
  });
  timetable.addEventListener("dragover", event => {
    const cell = event.target.closest(".cell");
    if (!cell || !state.dragSourceKey || cell.disabled || cell.dataset.key === state.dragSourceKey) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    for (const other of timetable.querySelectorAll(".is-drop-target")) if (other !== cell) other.classList.remove("is-drop-target");
    cell.classList.add("is-drop-target");
  });
  timetable.addEventListener("dragleave", event => {
    const cell = event.target.closest(".cell");
    if (cell && !cell.contains(event.relatedTarget)) cell.classList.remove("is-drop-target");
  });
  timetable.addEventListener("drop", event => {
    const cell = event.target.closest(".cell");
    if (!cell || !state.dragSourceKey) return;
    event.preventDefault();
    const sourceKey = state.dragSourceKey;
    state.dragSourceKey = null;
    swapSlots(sourceKey, cell.dataset.key);
  });
  timetable.addEventListener("dragend", () => {
    state.dragSourceKey = null;
    for (const cell of timetable.querySelectorAll(".is-dragging, .is-drop-target")) cell.classList.remove("is-dragging", "is-drop-target");
  });

  for (const list of [$("week-changes"), $("history-list")]) {
    list.addEventListener("click", event => {
      const item = event.target.closest(".change-item");
      if (!item) return;
      if (item.dataset.jump) revealSlot(item.dataset.key);
      else if (state.view === "current") openEditor(item.dataset.key);
    });
  }

  $("editor-form").addEventListener("submit", applyEditor);
  $("editor-subject-pick").addEventListener("change", pickSubject);
  $("editor-subject").addEventListener("input", clearSubjectError);
  $("editor-swap").addEventListener("click", () => startSwap(state.editorKey));
  $("editor-reset").addEventListener("click", resetEditorSlot);
  $("editor-clear").addEventListener("click", clearEditorSlot);
  $("editor").addEventListener("close", () => { state.editorKey = null; });
  for (const button of document.querySelectorAll("#editor [data-close]")) button.addEventListener("click", closeEditor);
  for (const button of $("editor-status").querySelectorAll("button")) button.addEventListener("click", () => setEditorStatus(button.dataset.status));
  for (const dialog of [$("editor"), $("confirm")]) {
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  }

  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && state.isLoaded) {
      event.preventDefault();
      saveDrafts();
    }
    if (event.key === "Escape" && state.swapSourceKey && !$("editor").open) cancelSwap();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollForUpdates(); });
  window.addEventListener("beforeunload", event => {
    if (!state.drafts.size) return;
    event.preventDefault();
    event.returnValue = "";
  });
  COMPACT_QUERY.addEventListener("change", () => { if (state.isLoaded) renderAll(); else if (!$("app").hidden) renderSkeleton(); });
  setInterval(() => { if (state.isLoaded && !document.hidden) { renderToday(); renderHistory(); } }, 60000);
}

bindEvents();
resumeSession();
