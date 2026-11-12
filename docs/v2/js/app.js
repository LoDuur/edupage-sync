import { fetchJSON, getPrefs, savePref, esc, fold, stateHtml, formatStamp, isOffline } from "./store.js";
import { createTimetable } from "./timetable.js";
import { renderChanges, unseenCount } from "./changes.js";
import { createConsult } from "./consult.js";
import { createBus } from "./bus.js";
import { createIntercity } from "./intercity.js";
import { createTerminal } from "./terminal.js";
import { setupPwa } from "./pwa.js";

const POLL_MS = 2 * 60 * 1000;
const TABS = { saraksts: "Stundu saraksts", izmainas: "Izmaiņas", konsultacijas: "Konsultācijas", autobusi: "Pilsētas autobusi", starppilsetu: "Starppilsētu" };
const $ = id => document.getElementById(id);

const state = { index: null, classId: getPrefs().v2.classId || null, classData: null, entries: [], fromCache: false, tab: null };

const timetable = createTimetable({
  root: $("timetable"), nowStrip: $("now-strip"), weekLabel: $("week-label"),
  prev: $("week-prev"), next: $("week-next"), today: $("week-today"),
  layoutButtons: document.querySelectorAll("[data-layout]"),
});
const consult = createConsult($("consult"), $("consult-lead"));
const bus = createBus($("bus"));
const intercity = createIntercity($("intercity"));

const seenMap = () => getPrefs().v2.seen || {};
const seenId = () => seenMap()[state.classId] || null;
function markSeen() {
  if (!state.entries.length) return;
  savePref("seen", { ...seenMap(), [state.classId]: state.entries[0].id });
  updateBadge();
}

function updateBadge() {
  const count = unseenCount(state.entries, seenId());
  const badge = $("changes-count");
  badge.textContent = String(count);
  badge.hidden = !count;
}

let toastTimer = 0;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

function updateNotice() {
  const notice = $("notice");
  const offline = !navigator.onLine || state.fromCache;
  notice.hidden = !offline;
  if (offline) notice.textContent = `[!] Bezsaistē — rāda saglabātos datus${state.classData?.updated ? `, atjaunināti ${formatStamp(state.classData.updated)}` : ""}. Tie var nebūt aktuāli.`;
  const status = $("status");
  status.hidden = !state.classData;
  status.dataset.tone = offline ? "warn" : "";
  status.textContent = offline ? "bezsaistē" : `atjaunināts ${formatStamp(state.classData?.updated)}`;
}

function renderChangesView() {
  renderChanges($("changes"), $("changes-lead"), { entries: state.entries, classData: state.classData, index: state.index, seenId: seenId() });
}

function openTab(tab) {
  if (!TABS[tab]) tab = "saraksts";
  state.tab = tab;
  savePref("tab", tab);
  if (location.hash.slice(1) !== tab) history.replaceState(null, "", `#${tab}`);
  for (const view of document.querySelectorAll("[data-view]")) view.hidden = view.dataset.view !== tab;
  for (const link of document.querySelectorAll("[data-tab]")) {
    if (link.dataset.tab === tab) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.title = `${TABS[tab]} · Stundu saraksts`;
  if (tab === "izmainas") { renderChangesView(); markSeen(); }
  if (tab === "konsultacijas") loadConsult();
  if (tab === "autobusi") bus.open();
  if (tab === "starppilsetu") intercity.open();
  scrollTo({ top: 0 });
}

async function loadConsult() {
  if (consult.loaded) return;
  consult.showLoading();
  try {
    consult.setData((await fetchJSON("../data/consultations.json")).body);
  } catch (error) {
    consult.showError(stateHtml(isOffline(error) ? "Nav saglabātu konsultāciju datu" : "Konsultāciju grafiks nav pieejams", isOffline(error) ? "Atver šo sadaļu ar internetu vienreiz, lai tā strādātu arī bezsaistē." : "Mēģini vēlreiz vēlāk.", "error"));
  }
}

function renderClassList(filter = "") {
  const needle = fold(filter.trim());
  const groups = new Map();
  for (const c of state.index.classes) {
    if (needle && !fold(`${c.name} ${c.short}`).includes(needle)) continue;
    const key = c.course ? `${c.course}. kurss` : "Citas";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  $("class-list").innerHTML = groups.size
    ? [...groups].map(([title, list]) => `<section class="class-group"><h3>${esc(title)}</h3><div>${list.map(c => `<button type="button" data-class="${esc(c.id)}" aria-current="${c.id === state.classId}">${esc(c.name)}</button>`).join("")}</div></section>`).join("")
    : stateHtml("Klase nav atrasta");
}

function openClassSheet() {
  if (!state.index) return;
  $("class-search").value = "";
  renderClassList();
  $("class-sheet").showModal();
  $("class-search").focus();
}

async function loadClass({ silent = false } = {}) {
  const info = state.index?.classes.find(c => c.id === state.classId);
  if (!info) { $("class-name").textContent = "Izvēlies klasi"; timetable.showError(stateHtml("Izvēlies klasi", "Spied uz klases pogas augšā, lai redzētu tās stundu sarakstu.")); return; }
  $("class-name").textContent = info.name;
  if (!silent) timetable.showLoading();
  try {
    const [classResult, changesResult] = await Promise.all([
      fetchJSON(`../classes/${encodeURIComponent(info.id)}.json`),
      fetchJSON(`../classes/${encodeURIComponent(info.id)}.changes.json`).catch(error => ({ body: { entries: error.status === 404 ? [] : state.entries }, fromCache: error.status !== 404 })),
    ]);
    if (state.classId !== info.id) return;
    const isUpdate = silent && state.classData && state.classData.updated !== classResult.body.updated;
    const previousTop = state.entries[0]?.id;
    state.classData = classResult.body;
    state.entries = Array.isArray(changesResult.body.entries) ? changesResult.body.entries : [];
    state.fromCache = classResult.fromCache;
    if (!seenId() && state.entries.length) markSeen();
    timetable.setClass(state.classData, { keepWeek: silent });
    if (state.tab === "izmainas") { renderChangesView(); markSeen(); }
    updateBadge();
    if (silent && state.entries[0] && state.entries[0].id !== previousTop) toast("Stundu sarakstā ir jaunas izmaiņas — skat. sadaļu Izmaiņas");
    else if (isUpdate) toast("Stundu saraksts atjaunināts");
  } catch (error) {
    if (silent) return;
    timetable.showError(stateHtml(isOffline(error) ? "Nav saglabāta saraksta" : "Neizdevās ielādēt sarakstu", isOffline(error) ? "Šī klase vēl nav atvērta ar internetu, tāpēc bezsaistē tās saraksts nav pieejams." : "Mēģini vēlreiz pēc brīža.", "error"));
  } finally {
    updateNotice();
  }
}

function selectClass(id) {
  if (!state.index?.classes.some(c => c.id === id)) return;
  state.classId = id;
  state.classData = null;
  state.entries = [];
  savePref("classId", id);
  loadClass();
  if (state.tab === "izmainas") renderChangesView();
}

async function loadIndex({ silent = false } = {}) {
  try {
    const { body } = await fetchJSON("../classes/index.json");
    if (!Array.isArray(body?.classes)) throw new Error("invalid_index");
    state.index = body;
    timetable.setIndex(body);
    return true;
  } catch (error) {
    if (!silent) timetable.showError(stateHtml(isOffline(error) ? "Nav interneta savienojuma" : "Saraksts nav pieejams", isOffline(error) ? "Atver lietotni ar internetu vienreiz, lai saraksts būtu pieejams bezsaistē." : "Klašu saraksts pašlaik nav ielādējams. Mēģini vēlreiz pēc brīža.", "error"));
    return false;
  }
}

async function refresh() {
  if (document.visibilityState !== "visible") return;
  if (await loadIndex({ silent: true })) await loadClass({ silent: true });
}

function tickClock() {
  $("clock").textContent = new Date().toLocaleTimeString("lv-LV", { hour: "2-digit", minute: "2-digit" });
}

$("class-button").addEventListener("click", openClassSheet);
$("class-search").addEventListener("input", event => renderClassList(event.target.value));
$("class-list").addEventListener("click", event => {
  const button = event.target.closest("[data-class]");
  if (!button) return;
  $("class-sheet").close();
  selectClass(button.dataset.class);
});
addEventListener("hashchange", () => openTab(location.hash.slice(1)));
addEventListener("online", () => { updateNotice(); refresh(); });
addEventListener("offline", updateNotice);
document.addEventListener("visibilitychange", refresh);
setInterval(refresh, POLL_MS);
setInterval(() => { tickClock(); timetable.render(); }, 30 * 1000);

createTerminal(
  { panel: $("terminal"), output: $("terminal-out"), form: $("terminal-form"), input: $("terminal-input"), openers: [$("open-terminal"), $("open-terminal-side")] },
  { tabs: TABS, classes: () => state.index?.classes || [], selectClass, openTab },
);
setupPwa({ installButton: $("install"), iosSheet: $("ios-sheet"), updateBar: $("update-bar"), updateButton: $("update-apply") });

tickClock();
openTab(location.hash.slice(1) || getPrefs().v2.tab || "saraksts");
if (await loadIndex()) {
  if (state.classId && state.index.classes.some(c => c.id === state.classId)) await loadClass();
  else { state.classId = null; await loadClass(); openClassSheet(); }
}
