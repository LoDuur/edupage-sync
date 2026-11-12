import { API, esc, fold, getPrefs, saveRootPref, setVersion, THEMES, themeList, isJuarch, applyTheme, subjectColor, addDays, todayIso, shortDate, hhmm, weekRange, parseIso, isoDate, formatStamp } from "./store.js";
import { minutesOf, isBreak } from "./timetable.js";

const NAMED_COLORS={sarkans:"#ff3b30",red:"#ff3b30",oranžs:"#ff9500",orange:"#ff9500",dzeltens:"#ffcc00",yellow:"#ffcc00",zaļš:"#34c759",green:"#34c759",piparmētra:"#00c7be",mint:"#00c7be",tirkīzs:"#30b0c7",teal:"#30b0c7",ciāns:"#32ade6",cyan:"#32ade6",zils:"#007aff",blue:"#007aff",indigo:"#5856d6",violets:"#af52de",purple:"#af52de",rozā:"#ff2d55",pink:"#ff2d55",brūns:"#a2845e",brown:"#a2845e",pelēks:"#8e8e93",gray:"#8e8e93",grey:"#8e8e93",melns:"#1c1c1e",black:"#1c1c1e",balts:"#f2f2f7",white:"#f2f2f7",lime:"#a5d63f",olive:"#808000",navy:"#1d3f8f",maroon:"#800000",coral:"#ff7f50",salmon:"#fa8072",gold:"#ffd700",khaki:"#c3b091",lavender:"#b57edc",magenta:"#ff00ff",crimson:"#dc143c",turquoise:"#40e0d0",tomato:"#ff6347",orchid:"#da70d6",skyblue:"#87ceeb",steelblue:"#4682b4",seagreen:"#2e8b57"};
const ALIASES={java:"compiler java",javac:"compiler java",pil:"compiler pil",play:"games",h:"help",c:"clear",q:"exit",n:"next",t:"cat today",tm:"cat tomorrow",w:"cat week",s:"stats",g:"grep",m:"man",cls:"clear",l:"ls",ll:"ls -l",dir:"ls",pacman:"juarchupdate",draw:"paint",PingPong:"pingpong",pong:"pingpong",fps:"arena",shooter:"arena",starpbridis:"arena"};
const FORTUNES=["Brīvstunda ir tikai starpbrīdis ar ambīcijām.","Mājasdarbs, kas nav uzdots, nav jāizdara.","Piektdien 5 minūšu starpbrīži – jo ātrāk mājās.","Skolotājs kavē 15 minūtes = brīvstunda. Teorētiski.","Kafija pirms 1. stundas ir cilvēktiesības.","Pusdienas – vienīgā stunda, kurā visi ir laikā.","Vislabākā stunda ir tā, kura tiek atcelta.","Ja nezini atbildi – atbildi ar jautājumu.","Kodēšana: 10 % rakstīšana, 90 % domāšana, kāpēc nestrādā.","Matemātika ir viegla, ja tu esi kalkulators.","Pirmssvētku dienā pat 30 minūtes šķiet garas.","Stundu saraksts mainās biežāk nekā laikapstākļi Valmierā.","Neaizmirsti: 213. kabinets ir 2. stāvā, ne 21. stāvā.","Sports 3.–4. stundā – dušas nav, dezodorants ir.","Aizvietošana = pārsteiguma stunda.","Rīts sākas nevis 8:10, bet tad, kad atrodi kabinetu."];
const TRAIN=["      ====        ________                ___________ ","  _D _|  |_______/        \\__I_I_____===__|_________| ","   |(_)---  |   H\\________/ |   |        =|___ ___|   ","   /     |  |   H  |  |     |   |         ||_| |_||   ","  |      |  |   H  |__--------------------| [___] |   ","  | ________|___H__/__|_____/[][]~\\_______|       |   ","  |/ |   |-----------I_____I [][] []  D   |=======|__ ","__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ "," |/-=|___|=    ||    ||    ||    |_____/~\\___/        ","  \\_/      \\O=====O=====O=====O_/      \\_/            "];
const JUARCH_LOGO=["      ▟█▙      ","     ▟███▙     ","    ▟██▀██▙    ","   ▟██▘ ▝██▙   ","  ▟██▘   ▝██▙  "," ▟█▀       ▀█▙ "];
const LOGO=["   ██╗   ██╗","   ██║   ██║","   ██║   ██║","   ╚██╗ ██╔╝","    ╚████╔╝ ","     ╚═══╝  "];
const COW=t=>{const w=[...t].length;return ` ${"_".repeat(w+2)}\n< ${esc(t)} >\n ${"-".repeat(w+2)}\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||`};
const FIGLET_FONT={A:[" ▄▀▄ ","█▀▀█","▀  ▀"],B:["█▀▄ ","█▀▄ ","▀▀  "],C:["▄▀▀ ","█   ","▀▀▀ "],D:["█▀▄ ","█ █ ","▀▀  "],E:["█▀▀ ","█▀  ","▀▀▀ "],F:["█▀▀ ","█▀  ","▀   "],G:["▄▀▀ ","█ ▀█","▀▀▀ "],H:["█ █ ","█▀█ ","▀ ▀ "],I:["▀█▀ "," █  ","▀▀▀ "],J:["  █ ","  █ ","▀▀  "],K:["█ █ ","█▀▄ ","▀ ▀ "],L:["█   ","█   ","▀▀▀ "],M:["█▄█ ","█ █ ","▀ ▀ "],N:["█▄█ ","█ █ ","▀ ▀ "],O:["▄▀▄ ","█ █ "," ▀  "],P:["█▀▄ ","█▀  ","▀   "],Q:["▄▀▄ ","█ █ "," ▀▄ "],R:["█▀▄ ","█▀▄ ","▀ ▀ "],S:["▄▀▀ ","▀▀▄ ","▀▀  "],T:["▀█▀ "," █  "," ▀  "],U:["█ █ ","█ █ ","▀▀▀ "],V:["█ █ ","█ █ "," ▀  "],W:["█ █ ","█▄█ ","▀ ▀ "],X:["█ █ "," █  ","▀ ▀ "],Y:["█ █ "," █  "," ▀  "],Z:["▀▀█ "," █  ","▀▀▀ "]," ":["  ","  ","  "]};

const WD = ["Pirmdiena", "Otrdiena", "Trešdiena", "Ceturtdiena", "Piektdiena", "Sestdiena", "Svētdiena"];
const WD2 = ["Pr", "Ot", "Tr", "Ce", "Pk", "Se", "Sv"];
const DESIGNS = { default: "klasiskais EduPage režģis", remastered: "jaunais dizains ar laika asi", claude: "silts, redakcionāls dizains ar dienu kartītēm" };
const GAMES = { doom: { title: "DOOM (1993)", note: "shareware · id Software", url: "../games/doom.jsdos" } };
const OVERLAY_GAMES = { arena: { title: "Starpbrīdis", note: "arēnas šāvējs · bhop, slīde, AA-12" }, pingpong: { title: "Ping Pong", note: "istabas ar klasi" } };

export function openOverlayGame({ id, title, src, allow, exitMessage, onClose }) {
  if (document.getElementById(id)) return;
  const frame = document.createElement("iframe");
  frame.id = id;
  frame.title = title;
  frame.allow = allow;
  frame.src = src;
  frame.className = "overlay-frame";
  const previousOverflow = document.body.style.overflow;
  const closeOnExit = event => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data !== exitMessage) return;
    removeEventListener("message", closeOnExit);
    frame.remove();
    document.body.style.overflow = previousOverflow;
    onClose?.();
  };
  document.body.style.overflow = "hidden";
  addEventListener("message", closeOnExit);
  document.body.append(frame);
  frame.focus();
}

export function openArena(onClose) {
  openOverlayGame({ id: "arena-frame", title: "Starpbrīdis", allow: "autoplay; fullscreen; pointer-lock; gamepad", src: "../arena/", exitMessage: "arena:exit", onClose });
}
const LANGS = ["python", "java", "c", "cpp", "csharp", "lua", "pil", "js", "bash"];
const SESSION_STORE = "schedule-session";
const FREE_WINDOW_MINUTES = 45;
const JUARCH_VERSION = "2026.09";
const PAGE_LOADED = Date.now();

const pad = n => String(n).padStart(2, "0");
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const wdIdx = iso => (parseIso(iso).getDay() + 6) % 7;
const dname = iso => `${WD[wdIdx(iso)]}, ${shortDate(iso)}`;
const subjectKey = summary => summary.replace(/\s*\(.*\)\s*$/, "");
const swatch = color => `<span class="con-sw" style="background:${color}"></span>`;
const fmtDur = ms => { const m = Math.floor(ms / 60000), h = Math.floor(m / 60); return h ? `${h} h ${m % 60} min` : `${m} min`; };
const q = s => (/\s/.test(s) ? `"${s}"` : s);

function parseColor(value) {
  let v = value.trim();
  const low = v.toLowerCase();
  if (low in NAMED_COLORS) return NAMED_COLORS[low];
  if (/^\d{1,3}$/.test(v) && Number(v) <= 360) return `hsl(${Number(v)} 70% 52%)`;
  if (/^[0-9a-f]{6}$/i.test(v) || /^[0-9a-f]{3}$/i.test(v)) v = `#${v}`;
  if (CSS.supports("color", v) && !/^(inherit|initial|unset|currentcolor|transparent)$/i.test(v)) {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = v;
    return ctx.fillStyle;
  }
  return null;
}

export function buildCommands(io, ctx) {
  const { print, pre } = io;
  const prefs = () => getPrefs();
  const juarch = () => isJuarch();
  const host = () => (juarch() ? "juarch" : location.hostname || "localhost");
  const user = () => (io.state.root ? "root" : "skolēns");
  const sudoName = () => (juarch() ? "judo" : "sudo");
  const className = () => ctx.classData()?.name || "nav izvēlēta klase";
  const weekStart = () => ctx.timetable.weekStart || todayIso();
  const lessonsOn = iso => ctx.timetable.lessonsOn(iso);
  const weekEvents = () => ctx.timetable.weekLessons();
  const subjects = () => [...new Set((ctx.classData()?.events || []).map(e => subjectKey(e.summary)))].sort();
  const needClass = () => { if (ctx.classData()) return true; print("vispirms izvēlies klasi: class &lt;nosaukums&gt;", "err"); return false; };

  function dayIso(name) {
    const map = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, pr: 0, ot: 1, tr: 2, ce: 3, pk: 4 };
    if (name === "today" || name === "šodien") return todayIso();
    if (name === "tomorrow" || name === "rīt") return addDays(todayIso(), 1);
    if (name in map) return addDays(weekStart(), map[name]);
    return null;
  }

  function dayLines(iso) {
    const events = lessonsOn(iso);
    const lines = [`<b>${dname(iso)}</b>`];
    if (!events.length) return [...lines, '<span class="dim">Nav stundu</span>'];
    let previous = null;
    for (const e of events) {
      const start = minutesOf(e.start);
      if (previous !== null && start > previous) {
        const gap = start - previous;
        lines.push(`<span class="dim">      ${"─".repeat(11)}  ${gap >= FREE_WINDOW_MINUTES ? "Brīvs logs" : "Starpbrīdis"} · ${gap} min</span>`);
      }
      const meta = [e.location, (e.teachers || []).join(", ")].filter(Boolean).join(" · ");
      lines.push(`${esc(e.periods.padEnd(5))} ${hhmm(e.start)}–${hhmm(e.end)}  ${esc(e.summary)}${meta ? ` <span class="dim">· ${esc(meta)}</span>` : ""}`);
      previous = Math.max(previous ?? 0, minutesOf(e.end));
    }
    return lines;
  }

  function changeLines() {
    const entries = ctx.entries();
    if (!entries.length) return ['<span class="dim">Izmaiņu nav</span>'];
    return entries.slice(0, 10).flatMap(entry => {
      const head = `<b>${esc(formatStamp(entry.detectedAt))}</b> <span class="dim">· ${entry.kind === "published" ? "publicēts" : entry.kind === "substitutions" ? "aizvietošana" : "atjaunināts"} · ${weekRange(entry.weekStart)}</span>`;
      const line = e => `${WD2[wdIdx(e.date)]} ${shortDate(e.date)} ${hhmm(e.start)} ${esc(e.summary)}`;
      if (entry.kind === "published") return [head, `<span class="ok">+</span> ${entry.lessons} stundas`];
      if (entry.kind === "substitutions") return [head, ...entry.added.map(s => `<span class="warn">!</span> ${esc(s.date)} ${esc(s.period)}. ${esc(s.text)}`), ...entry.removed.map(s => `<span class="err">-</span> ${esc(s.date)} ${esc(s.period)}. ${esc(s.text)}`)];
      return [head, ...entry.added.map(e => `<span class="ok">+</span> ${line(e)}`), ...entry.changed.map(c => `<span class="warn">~</span> ${line(c.after)} <span class="dim">(${c.fields.join(", ")})</span>`), ...entry.moved.map(m => `<span class="warn">→</span> ${line(m.before)} → ${line(m.after)}`), ...entry.removed.map(e => `<span class="err">-</span> ${line(e)}`)];
    });
  }

  const FILES = {
    today: () => dayLines(dayIso("today")),
    tomorrow: () => dayLines(dayIso("tomorrow")),
    week: () => [0, 1, 2, 3, 4].flatMap(i => [...dayLines(addDays(weekStart(), i)), ""]),
    mon: () => dayLines(dayIso("mon")), tue: () => dayLines(dayIso("tue")), wed: () => dayLines(dayIso("wed")), thu: () => dayLines(dayIso("thu")), fri: () => dayLines(dayIso("fri")),
    changes: changeLines,
    subst: () => (ctx.classData()?.substitutions || []).length ? ctx.classData().substitutions.map(s => `${esc(s.date)}  ${esc(s.period)}. ${esc(s.text)}`) : ['<span class="dim">Aizvietošanu nav</span>'],
    colors: () => subjects().map(s => { const c = subjectColor(s); return `${swatch(c)}${esc(s)} <span class="dim">${esc(c)}${s in (prefs().colors || {}) ? " · saglabāts" : ""}</span>`; }),
    themes: () => themeList().map(t => `${t === (prefs().theme || "auto") ? "<b>●</b>" : " "} <b>${t}</b> <span class="dim">${THEMES[t] || "juarch – uz Arch bāzēta"}</span>`),
    designs: () => Object.keys(DESIGNS).map(d => `${d === prefs().design ? "<b>●</b>" : " "} <b>${d}</b> <span class="dim">${DESIGNS[d]} (1. versija)</span>`),
  };

  function findSubject(name) {
    const all = subjects(), n = name.toLowerCase();
    return all.find(s => s.toLowerCase() === n) || all.filter(s => s.toLowerCase().includes(n));
  }
  function pickSubject(name) {
    const s = findSubject(name);
    if (!s || (Array.isArray(s) && !s.length)) { print("priekšmets nav atrasts (skat. cat colors)", "err"); return null; }
    if (Array.isArray(s) && s.length > 1) { print(`neviennozīmīgi: ${s.map(esc).join(" | ")}`, "err"); return null; }
    return Array.isArray(s) ? s[0] : s;
  }
  function requireRoot(name) {
    if (io.state.root) return true;
    print(`${name}: jāpalaiž kā root (${sudoName()} ${name})`, "err");
    return false;
  }
  function setColors(colors) { saveRootPref("colors", colors); ctx.timetable.render(); }

  async function juarchInstall() {
    if (juarch()) return print(`juarch ${prefs().juarch.version} jau ir instalēts. Mēģini: judo juarchupdate`);
    const ok = await io.steps([
      `<b>juarchinstall</b> ${JUARCH_VERSION} — <span class="dim">unikālā, uz Arch bāzētā pieredze</span>`,
      ':: Pārbauda root tiesības... <span class="dim">ok</span>',
      `:: Nosaka aparatūru... <span class="dim">1 × skolēns, ${subjects().length} priekšmeti, ${(ctx.classData()?.events || []).length} stundas</span>`,
      ":: Sadala /dev/stundas...", "   /boot   512M   pirmdiena", "   /       100%   pārējais",
      ":: Sinhronizē pakotņu datubāzes...", { bar: "core" }, { bar: "extra" }, { bar: "juarch" },
      ':: Instalē pakotnes (7): <span class="dim">base juarch-theme judo starpbrīdis-daemon brīvstunda-utils kafija neofetch-juarch</span>',
      "(1/7) instalē base", 300, "(2/7) instalē juarch-theme", 300, "(3/7) instalē judo", 300, "(4/7) instalē starpbrīdis-daemon", 200, "(5/7) instalē brīvstunda-utils", 200, '(6/7) instalē kafija <span class="dim">☕</span>', 200, "(7/7) instalē neofetch-juarch",
      ':: Ģenerē fstab... <span class="dim">gatavs</span>', ":: Iestata hostname: <b>juarch</b>", ':: Ieslēdz judo lietotājam skolēns... <span class="dim">gatavs</span>', ":: Pielieto juarch tēmu...",
      () => { saveRootPref("juarch", { installed: true, version: JUARCH_VERSION, installedAt: new Date().toISOString(), updates: 0 }); saveRootPref("theme", "juarch"); applyTheme(); io.setPrompt(); },
      '<b class="ok">✔ Instalācija pabeigta.</b> Pārstartēt? Nē — jau darbojas. <span class="dim">sudo vairs nav; lieto <b>judo</b>. Mēģini: judo neofetch</span>',
    ]);
    if (!ok) print("juarchinstall: pārtraukts, nekas netika mainīts", "err");
  }

  async function juarchUpdate() {
    if (!juarch()) return print("juarchupdate: juarch nav instalēts (sudo juarchinstall)", "err");
    const before = ctx.classData()?.updated || "";
    await io.steps([
      ":: Sinhronizē pakotņu datubāzes...", { bar: "core", ms: 20 }, { bar: "extra", ms: 20 }, { bar: "juarch", ms: 20 },
      ":: Sāk pilnu sistēmas atjaunināšanu...",
      async () => {
        await ctx.refresh();
        const after = ctx.classData()?.updated || "";
        if (after && after !== before) print(`Pakotnes (1) <b>stundu-saraksts</b> ${esc(before.slice(0, 16))} → ${esc(after.slice(0, 16))}`);
        else print(" nav ko darīt");
      },
      () => { const j = prefs().juarch; saveRootPref("juarch", { ...j, updates: (j.updates || 0) + 1, version: JUARCH_VERSION }); },
      '<span class="dim">juarch ir aktuāls</span>',
    ]);
  }

  async function juarchPurge() {
    const cards = [...document.querySelectorAll(".lesson, .day-lesson")];
    await io.steps([
      ":: Iztīra visu OS...", "noņem judo", 120, "noņem juarch-theme", 120, 'noņem kafija <span class="dim">☕ (nēēē)</span>', 200, "noņem krāsas, vēsturi, iestatījumus",
      async () => { for (let i = 0; i < cards.length; i++) { cards[i].style.transition = "opacity .25s"; cards[i].style.opacity = "0"; if (i % 4 === 0) await io.sleep(60); } await io.sleep(400); },
      () => { saveRootPref("juarch", undefined); saveRootPref("theme", "auto"); saveRootPref("colors", {}); io.clearHistory(); io.state.root = false; applyTheme(); io.setPrompt(); ctx.timetable.render(); },
      '<b>Sistēma iztīrīta.</b> Atpakaļ uz garlaicīgo noklusējumu. <span class="dim">sudo atkal strādā.</span>',
    ]);
  }

  function wipe() {
    const cards = [...document.querySelectorAll(".lesson, .day-lesson")];
    print("rm: ieiet '/'…");
    cards.forEach((card, i) => setTimeout(() => {
      card.style.transition = "opacity .3s, transform .3s";
      card.style.opacity = "0";
      card.style.transform = "scale(.94)";
      if (i % 3 === 0) print(`<span class="dim">dzēsts '/${esc((card.querySelector(".lesson-title, .dl-title")?.textContent || "stunda").trim().toLowerCase().replace(/\s+/g, "_"))}'</span>`);
    }, i * 40));
    setTimeout(() => { print("<b>Labs mēģinājums.</b> Stundu saraksts atjaunots no EduPage."); ctx.timetable.render(); }, cards.length * 40 + 600);
  }

  async function submitAdminKey(key) {
    if (!key.trim()) return print("admin: atslēga nav ievadīta", "err");
    const line = print("pārbauda atslēgu…", "dim");
    try {
      const response = await fetch(`${API}/schedule/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        line.className = "err";
        line.textContent = response.status === 401 ? `admin: nepareiza atslēga${Number.isInteger(body.attemptsLeft) ? ` · atlikuši ${body.attemptsLeft} mēģinājumi` : ""}`
          : response.status === 429 ? `admin: pārāk daudz nepareizu mēģinājumu · mēģini vēlreiz pēc ${Math.ceil((body.retryAfterSeconds || 900) / 60)} min`
          : response.status === 503 ? "admin: serverī nav iestatīta administratora atslēga" : `admin: servera kļūda (${response.status}) · mēģini vēlreiz`;
        return;
      }
      try { localStorage.setItem(SESSION_STORE, JSON.stringify({ token: body.token, expiresAt: body.expiresAt })); } catch {}
      line.className = "ok";
      line.textContent = "atslēga pareiza · atver paneli…";
      location.href = "../dashboard/";
    } catch {
      line.className = "err";
      line.textContent = "admin: nevar sazināties ar serveri · pārbaudi savienojumu un mēģini vēlreiz";
    }
  }
  function readSession() {
    try { const s = JSON.parse(localStorage.getItem(SESSION_STORE) || "null"); return s && s.token && s.expiresAt > Date.now() ? s : null; } catch { return null; }
  }

  function openPingPong(code) {
    openOverlayGame({ id: "pingpong-frame", title: "Ping Pong", allow: "clipboard-write; autoplay", src: `../pingpong/${code ? `?join=${encodeURIComponent(code)}` : ""}`, exitMessage: "pingpong:exit", onClose: () => io.focus() });
  }

  function launchGame(key) {
    const game = GAMES[key];
    if (!game) return print(`nav tādas spēles: ${esc(key)}`, "err");
    const frame = document.createElement("iframe");
    frame.setAttribute("allow", "fullscreen; autoplay; gamepad; pointer-lock; keyboard-map");
    frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://v8.js-dos.com/latest/js-dos.css"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#d{position:absolute;inset:0}</style></head><body><div id="d"></div><script src="https://v8.js-dos.com/latest/js-dos.js"><\/script><script>Dos(document.getElementById("d"),{url:${JSON.stringify(new URL(game.url, location.href).href)},pathPrefix:"https://v8.js-dos.com/latest/emulators/",autoStart:true,kiosk:true,noCloud:true,theme:"dark"});addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="q"){e.preventDefault();parent.postMessage("game-close","*")}});<\/script></body></html>`;
    print(`${game.title} <span class="dim">· spēle darbojas konsolē · aizvērt: Ctrl+Q vai <b>clear</b></span>`, "ok");
    io.openGame(game.title, frame);
  }

  const commands = {
    help: { g: "Saraksts", d: "komandu saraksts", f() {
      const groups = {};
      for (const [name, c] of Object.entries(commands)) { if (c.hide?.()) continue; (groups[c.g] ??= []).push(`  <b>${name}</b>${c.u ? ` ${esc(c.u)}` : ""} <span class="dim">— ${c.d}</span>`); }
      for (const g of ["Saraksts", "Kods", "Sistēma", "juarch", "Jautri"]) if (groups[g]) { print(`<span class="dim">${g}</span>`); groups[g].forEach(l => print(l)); }
      print(`<span class="dim">man &lt;komanda&gt; — vairāk · saīsnes: ${Object.entries(ALIASES).slice(0, 8).map(([a, b]) => `${a}=${b}`).join(", ")}</span>`);
    } },
    class: { g: "Saraksts", u: "<nosaukums>", d: "izvēlas klasi (piem. class 28)", f(a) {
      const needle = fold(a.join(" "));
      if (!needle) return print(`klase: ${esc(className())}`);
      const matches = ctx.classes().filter(c => fold(c.name).includes(needle));
      const exact = matches.find(c => fold(c.name) === needle || fold(c.short) === needle);
      const target = exact || (matches.length === 1 ? matches[0] : null);
      if (!target) return print(matches.length ? `neviennozīmīgi: ${matches.map(c => esc(c.name)).join(" | ")}` : "klase nav atrasta", "err");
      ctx.selectClass(target.id);
      print(`klase: ${esc(target.name)}`, "ok");
    } },
    open: { g: "Saraksts", u: "<sadaļa>", d: "atver sadaļu (saraksts, izmainas, konsultacijas, autobusi, starppilsetu)", f([name]) {
      const key = Object.keys(ctx.tabs).find(k => k.startsWith(fold(name || "")));
      if (!name || !key) return print(`lietojums: open ${Object.keys(ctx.tabs).join("|")}`, "err");
      ctx.openTab(key);
      print(`atvērts: ${esc(ctx.tabs[key])}`, "ok");
    } },
    ls: { g: "Saraksts", u: "[-l]", d: "faili: dienas, week, changes, subst, colors, themes", f(a) {
      const names = Object.keys(FILES);
      if (a[0] === "-l" || a[0] === "-la") for (const n of names) { const iso = dayIso(n); print(`${n.padEnd(9)} <span class="dim">${iso ? `${lessonsOn(iso).length} st.` : ""}</span>`); }
      else print(names.join("  "));
    } },
    cat: { g: "Saraksts", u: "<fails>", d: "parāda failu (piem. cat today, cat week)", m: "Faili: today tomorrow week mon tue wed thu fri changes subst colors themes designs", f(a) {
      if (!a.length) return print("lietojums: cat &lt;fails&gt;", "err");
      for (const n of a) { if (!FILES[n]) return print(`cat: ${esc(n)}: nav tāda faila`, "err"); FILES[n]().forEach(l => print(l)); }
    } },
    next: { g: "Saraksts", d: "kas notiek tagad un kas nākamais", f() {
      if (!needClass()) return;
      const now = new Date(), m = now.getHours() * 60 + now.getMinutes(), events = lessonsOn(todayIso());
      const current = events.find(e => minutesOf(e.start) <= m && m < minutesOf(e.end)), next = events.find(e => minutesOf(e.start) > m);
      if (current) print(`Tagad: <b>${esc(current.summary)}</b> <span class="dim">līdz ${hhmm(current.end)}, vēl ${minutesOf(current.end) - m} min</span>`);
      if (next) print(`Nākamā: <b>${esc(next.summary)}</b> ${hhmm(next.start)} <span class="dim">(pēc ${minutesOf(next.start) - m} min${next.location ? ` · ${esc(next.location)}` : ""})</span>`);
      if (!current && !next) {
        let d = addDays(todayIso(), 1), n = 0;
        while (!ctx.timetable.allLessons().some(e => e.date === d) && n < 14) { d = addDays(d, 1); n++; }
        const first = ctx.timetable.allLessons().filter(e => e.date === d).sort((x, y) => x.start.localeCompare(y.start))[0];
        print(events.length ? "Šodien viss 🎉" : "Šodien nav stundu 🎉");
        if (first) print(`${dname(d)} pirmā: <b>${esc(first.summary)}</b> ${hhmm(first.start)}`);
      }
    } },
    grep: { g: "Saraksts", u: "[-c] <teksts>", d: "meklē stundās", f(a) {
      const count = a[0] === "-c";
      const needle = (count ? a.slice(1) : a).join(" ").toLowerCase();
      if (!needle) return print("lietojums: grep &lt;teksts&gt;", "err");
      const hits = ctx.timetable.allLessons().filter(e => [e.summary, e.location, ...(e.teachers || [])].join(" ").toLowerCase().includes(needle)).sort((x, y) => x.start.localeCompare(y.start));
      if (count) return print(String(hits.length));
      if (!hits.length) return print('<span class="dim">nekas netika atrasts</span>');
      hits.slice(0, 40).forEach(e => print(`${WD2[wdIdx(e.date)]} ${e.date.slice(8)}.${e.date.slice(5, 7)} ${esc(e.periods.padEnd(4))} ${hhmm(e.start)}  ${esc(e.summary)} <span class="dim">· ${esc(e.location)}</span>`));
      if (hits.length > 40) print(`<span class="dim">… vēl ${hits.length - 40}</span>`);
    } },
    stats: { g: "Saraksts", d: "stundu statistika šai nedēļai", f() {
      const events = weekEvents().filter(e => !isBreak(e));
      if (!events.length) return print('<span class="dim">šonedēļ nav stundu</span>');
      const counts = {};
      let minutes = 0;
      for (const e of events) { const k = subjectKey(e.summary); counts[k] = (counts[k] || 0) + 1; minutes += minutesOf(e.end) - minutesOf(e.start); }
      const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]), width = Math.max(...rows.map(r => r[0].length));
      for (const [k, n] of rows) print(`${swatch(subjectColor(k))}${esc(k.padEnd(width))}  ${"█".repeat(n)} ${n}`);
      print(`<span class="dim">${events.length} stundas · ${Math.round(minutes / 60)} h</span>`);
    } },
    color: { g: "Saraksts", u: "<priekšmets> <krāsa>", d: "maina priekšmeta krāsu; saglabājas", m: 'Krāsa: nosaukums (sarkans, blue, tomato …), #hex (#ff6b35 vai ff6b35), rgb(…), hsl(…) vai tonis 0–360. Piem.: color "Fizika I" #ff6b35', f(a) {
      if (a.length < 2) return print("lietojums: color &lt;priekšmets&gt; &lt;krāsa&gt;", "err");
      const color = parseColor(a[a.length - 1]);
      if (color === null) return print(`nezināma krāsa: ${esc(a[a.length - 1])} · nosaukums, #hex, rgb(), hsl() vai 0–360`, "err");
      const name = pickSubject(a.slice(0, -1).join(" "));
      if (!name) return;
      setColors({ ...(prefs().colors || {}), [name]: color });
      print(`${swatch(color)}${esc(name)} → ${esc(color)}`);
    } },
    reset: { g: "Saraksts", u: "[priekšmets]", d: "atiestata krāsas", f(a) {
      if (!a.length) setColors({});
      else { const name = pickSubject(a.join(" ")); if (!name) return; const colors = { ...(prefs().colors || {}) }; delete colors[name]; setColors(colors); }
      print("ok", "ok");
    } },
    theme: { g: "Saraksts", u: "[nosaukums]", d: "tēma; bez argumenta parāda sarakstu", m: `Tēmas: ${Object.keys(THEMES).join(", ")} (+ juarch pēc instalēšanas).`, f(a) {
      if (!a.length) return FILES.themes().forEach(l => print(l));
      if (!themeList().includes(a[0])) return print(`nezināma tēma · ${themeList().join(" | ")}`, "err");
      saveRootPref("theme", a[0]);
      applyTheme();
      io.setPrompt();
      print("ok", "ok");
    } },
    versions: { g: "Saraksts", u: "[1|2]", d: "stundu saraksta versija: 1 – iepriekšējā, 2 – šī", f([choice]) {
      if (!choice) { print('  <b>1</b> <span class="dim">Legacy – iepriekšējais saraksts</span>'); print('<b>●</b> <b>2</b> <span class="dim">New – šī versija</span>'); return; }
      if (choice === "2") return print("jau izmanto 2. versiju", "ok");
      if (choice !== "1") return print("lietojums: versions 1|2", "err");
      setVersion(1);
      print("pārslēdz uz 1. versiju…", "ok");
      location.href = "../";
    } },
    design: { g: "Saraksts", u: "[default|remastered|claude]", d: "1. versijas dizains; saglabājas", m: "2. versijai ir savs dizains; šī komanda maina 1. versijas izskatu.", f(a) {
      if (!a.length) return FILES.designs().forEach(l => print(l));
      if (!DESIGNS[a[0]]) return print("lietojums: design default|remastered|claude", "err");
      saveRootPref("design", a[0]);
      print("ok · redzams 1. versijā (versions 1)", "ok");
    } },
    compiler: { g: "Kods", u: "[python|java|c|cpp|csharp|lua|pil|js|bash|list|<id>]", d: "atver 28teh – kodu redaktoru ar termināli", m: "compiler – atver 28teh. compiler <valoda> izveido jaunu projektu. compiler list – projektu saraksts. compiler <id> – atver kopīgotu projektu.", f(a) {
      const arg = (a[0] || "").toLowerCase();
      const lang = arg === "js" ? "javascript" : arg;
      const url = !arg ? "../compiler/" : arg === "list" || arg === "works" ? "../compiler/?list" : LANGS.includes(arg) ? `../compiler/?lang=${lang}` : `../compiler/?p=${encodeURIComponent(a[0])}`;
      const opened = window.open(url, "_blank");
      if (!opened) location.href = url;
      print(`atver ${esc(url.replace("../", ""))}`, "ok");
    } },
    works: { g: "Kods", d: "saglabāto darbu arhīvs", f() { commands.compiler.f(["works"]); } },
    week: { g: "Saraksts", u: "today|next|prev", d: "pārslēdz nedēļu", f(a) {
      if (a[0] === "next") { if (!ctx.timetable.goWeek(1)) return print("nākamā nedēļa vēl nav publicēta", "err"); }
      else if (a[0] === "prev") { if (!ctx.timetable.goWeek(-1)) return print("vecāku nedēļu nav", "err"); }
      else ctx.timetable.goToday();
      ctx.openTab("saraksts");
      print(weekRange(weekStart()));
    } },
    cal: { g: "Saraksts", d: "mēneša kalendārs", f() {
      const now = new Date(), y = now.getFullYear(), mo = now.getMonth(), first = new Date(y, mo, 1), days = new Date(y, mo + 1, 0).getDate();
      const title = first.toLocaleString("lv-LV", { month: "long", year: "numeric" });
      const lessonDays = new Set(ctx.timetable.allLessons().map(e => e.date));
      const lines = [`<b>${title.padStart(Math.floor((20 + title.length) / 2)).padEnd(20)}</b>`, "Pr Ot Tr Ce Pk Se Sv"];
      let row = " ".repeat(((first.getDay() + 6) % 7) * 3);
      for (let d = 1; d <= days; d++) {
        const iso = isoDate(new Date(y, mo, d));
        let cell = String(d).padStart(2);
        cell = d === now.getDate() ? `<span class="con-today">${cell}</span>` : lessonDays.has(iso) ? `<b>${cell}</b>` : `<span class="dim">${cell}</span>`;
        row += `${cell} `;
        if ((first.getDay() + 6 + d) % 7 === 0) { lines.push(row); row = ""; }
      }
      if (row.trim()) lines.push(row);
      pre(lines);
    } },
    top: { g: "Saraksts", d: "šodienas stundas kā procesi", f() {
      const now = new Date(), m = now.getHours() * 60 + now.getMinutes(), events = lessonsOn(todayIso());
      if (!events.length) return print("nav procesu (šodien nav stundu)");
      print(`<span class="dim">top - ${fromMin(m)} · ${events.length} procesi · slodze: ${events.filter(e => minutesOf(e.start) <= m && m < minutesOf(e.end)).length} aktīvs</span>`);
      print("<b>  PID  STAT  %CPU  LAIKS        KOMANDA</b>");
      events.forEach((e, i) => { const s = minutesOf(e.start), en = minutesOf(e.end), pc = m < s ? 0 : m >= en ? 100 : Math.round(((m - s) / (en - s)) * 100), st = m < s ? "S" : m >= en ? "Z" : "R"; print(`${String(1000 + i).padStart(5)}  ${st}     ${String(pc).padStart(3)}%  ${hhmm(e.start)}–${hhmm(e.end)}  ${esc(e.summary)}`); });
    } },
    df: { g: "Saraksts", d: "nedēļas noslodze pa dienām", f() {
      print("<b>Fails       Izmērs  Lietots  Brīvs  Liet%  Piemontēts</b>");
      for (let i = 0; i < 5; i++) {
        const events = lessonsOn(addDays(weekStart(), i)), size = 10, used = new Set(events.map(e => e.periods)).size, pc = Math.round((used / size) * 100);
        print(`/dev/${WD2[i].toLowerCase().padEnd(6)} ${String(size).padStart(5)}st ${String(used).padStart(6)}st ${String(Math.max(0, size - used)).padStart(5)}st ${String(pc).padStart(4)}%  /${WD[i].toLowerCase()}`);
      }
    } },
    free: { g: "Saraksts", d: "brīvie logi šonedēļ", f() {
      print("<b>            stundas   brīvi logi   starpbrīži</b>");
      for (let i = 0; i < 5; i++) {
        const events = lessonsOn(addDays(weekStart(), i));
        let windows = 0, breaks = 0, previous = null;
        for (const e of events) { if (previous !== null) { const gap = minutesOf(e.start) - previous; if (gap >= FREE_WINDOW_MINUTES) windows++; else if (gap > 0) breaks++; } previous = Math.max(previous ?? 0, minutesOf(e.end)); }
        print(`${WD2[i].padEnd(10)} ${String(events.length).padStart(7)} ${String(windows).padStart(12)} ${String(breaks).padStart(12)}`);
      }
    } },
    tree: { g: "Saraksts", d: "nedēļa kā koks", f() {
      print(`<b>${weekStart()}/</b>`);
      for (let i = 0; i < 5; i++) {
        const events = lessonsOn(addDays(weekStart(), i));
        print(`${i < 4 ? "├──" : "└──"} <b>${WD[i].toLowerCase()}/</b>`);
        events.forEach((e, j) => print(`${i < 4 ? "│   " : "    "}${j < events.length - 1 ? "├──" : "└──"} ${esc(e.periods.padEnd(4))} ${esc(e.summary)} <span class="dim">${hhmm(e.start)}</span>`));
      }
    } },
    wc: { g: "Saraksts", d: "skaitļi par nedēļu", f() {
      const events = weekEvents();
      print(`${String(events.length).padStart(5)} stundas  ${String(subjects().length).padStart(3)} priekšmeti  ${String(new Set(events.flatMap(e => e.teachers || [])).size).padStart(3)} skolotāji  ${String(new Set(events.map(e => e.location).filter(Boolean)).size).padStart(3)} kabineti`);
    } },
    sudo: { g: "Sistēma", u: "<komanda>", d: "izpilda komandu kā root", m: "Prasa paroli (der jebkura). sudo rm -rf / – uz savu atbildību. Uz juarch sudo vietā ir judo.", hide: () => juarch(), f(a) {
      if (juarch()) return print('sudo: komanda nav atrasta. <span class="dim">Uz juarch lieto <b>judo</b></span>', "err");
      if (!a.length) return print("lietojums: sudo &lt;komanda&gt;", "err");
      io.askSecret("[sudo] parole lietotājam skolēns:", () => io.runAsRoot(a));
    } },
    judo: { g: "Sistēma", u: "<komanda>", d: "sudo, tikai vēsāks (uz juarch)", m: "Tas pats, kas sudo, tikai ar labāku promptu. Pieejams pēc juarchinstall.", hide: () => !juarch(), f(a) {
      if (!juarch()) return print('judo: komanda nav atrasta. <span class="dim">Vispirms instalē juarch: sudo juarchinstall</span>', "err");
      if (!a.length) return print('lietojums: judo &lt;komanda&gt;  <span class="dim">🥋 liela vara – liels stundu saraksts</span>', "err");
      io.askSecret("🥋 [judo] parole lietotājam skolēns ⟩", () => io.runAsRoot(a));
    } },
    su: { g: "Sistēma", d: "tas pats, kas sudo -i", f() { io.askSecret(`[${sudoName()}] parole lietotājam skolēns:`, () => io.runAsRoot(["-i"])); } },
    whoami: { g: "Sistēma", d: "kas tu esi", f() { print(io.state.root ? "root" : `${esc(className())}${juarch() ? ' <span class="dim">(uz juarch)</span>' : ""}`); } },
    hostname: { g: "Sistēma", d: "", f() { print(host()); } },
    pwd: { g: "Sistēma", d: "", f() { print(`/valteh/${esc(className())}/${weekStart()}`); } },
    date: { g: "Sistēma", d: "datums un laiks (Rīga)", f() { print(new Date().toLocaleString("lv-LV", { timeZone: "Europe/Riga", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })); } },
    uptime: { g: "Sistēma", d: "", f() { const updated = ctx.classData()?.updated; print(`lapa atvērta pirms ${fmtDur(Date.now() - PAGE_LOADED)}${updated ? ` · EduPage dati atjaunināti pirms ${fmtDur(Date.now() - new Date(updated))}` : ""}`); } },
    echo: { g: "Sistēma", u: "<teksts>", d: "", f(a) { print(esc(a.join(" "))); } },
    yes: { g: "Sistēma", u: "[teksts]", d: "", f(a) { const t = esc(a.join(" ") || "j"); for (let i = 0; i < 30; i++) print(t); print('<span class="dim">^C (pietiks)</span>'); } },
    history: { g: "Sistēma", d: "komandu vēsture", f() { [...io.history()].reverse().forEach((h, i) => print(`<span class="dim">${String(i + 1).padStart(3)}</span>  ${esc(h)}`)); } },
    man: { g: "Sistēma", u: "<komanda>", d: "komandas apraksts", f(a) { const c = commands[a[0]]; if (!c) return print(`man: nav rokasgrāmatas: ${esc(a[0] || "")}`, "err"); print(`<b>${esc(a[0])}</b> ${esc(c.u || "")}`); print(c.d || ""); if (c.m) print(`<span class="dim">${esc(c.m)}</span>`); } },
    alias: { g: "Sistēma", d: "saīsnes", f() { Object.entries(ALIASES).forEach(([a, b]) => print(`<b>${esc(a)}</b>='${esc(b)}'`)); } },
    ping: { g: "Sistēma", u: "edupage", d: "pārbauda savienojumu ar datiem", async f() {
      const url = "../classes/index.json";
      print(`PING ${host()} (classes/index.json)`);
      let received = 0, total = 0;
      for (let i = 0; i < 4; i++) {
        const t0 = performance.now();
        try { const r = await fetch(`${url}?p=${Math.random()}`, { cache: "no-store" }); const ms = performance.now() - t0; total += ms; received++; print(`${r.headers.get("content-length") || "?"} baiti: seq=${i} status=${r.status} laiks=${ms.toFixed(1)} ms`); }
        catch { print(`seq=${i} noildze`, "err"); }
        await io.sleep(300);
      }
      print(`--- ${received}/4 saņemti, vid. ${(total / Math.max(received, 1)).toFixed(1)} ms ---`);
    } },
    rm: { g: "Sistēma", u: "<fails>", d: "", f(a) { const target = a.filter(x => !x.startsWith("-")).join(" "); if (!a.length) return print("rm: trūkst argumenta", "err"); if (target === "/" && io.state.root) return wipe(); print(`rm: nevar dzēst '${esc(target)}': piekļuve liegta`, "err"); } },
    touch: { g: "Sistēma", u: "<fails>", d: "", f(a) { print(`touch: nevar izveidot '${esc(a[0] || "")}': failu sistēma ir tikai lasāma (EduPage lemj, ne mēs)`, "err"); } },
    mkdir: { g: "Sistēma", u: "<mape>", d: "", f(a) { print(`mkdir: nevar izveidot '${esc(a[0] || "")}': piekļuve liegta. Jaunas dienas nedēļā nepieņem.`, "err"); } },
    kill: { g: "Sistēma", u: "<stunda>", d: "", f(a) { const t = a.join(" "); if (!t) return print("kill: lietojums: kill &lt;stunda&gt;", "err"); const name = pickSubject(t); if (!name) return; print(io.state.root ? `kill: ${esc(name)}: process ir aizsargāts (skolotājs ir root)` : `kill: (${esc(name)}) – darbība nav atļauta`, "err"); } },
    make: { g: "Sistēma", d: "", f(a) { const t = a.join(" "); if (/sandwich|sviestmaiz/i.test(t)) return print(io.state.root ? "Labi." : "Ko? Uztaisi pats."); print("make: *** nav norādīts mērķis un nav Makefile. Stop.", "err"); } },
    apt: { g: "Sistēma", d: "", f() { print(juarch() ? "apt: šeit ir juarch. Lieto judo juarchupdate." : "apt: šī nav Debian. Mēģini sudo juarchinstall.", "err"); } },
    vim: { g: "Sistēma", d: "", f() { io.state.vim = true; print('<span class="dim">~\n~\n~   VIM – Vi IMproved · stundu saraksts ir tikai lasāms\n~\n~   iziet: ievadi :q</span>'); } },
    reboot: { g: "Sistēma", u: "[-f]", d: "pārbauda jaunu sarakstu un atjauno datus", m: "reboot – pieprasa jaunākos datus un pārzīmē sarakstu. reboot -f – pilnībā pārlādē lapu.", async f(a) {
      if ((a[0] || "") === "-f") { print("Pārstartē…"); setTimeout(() => location.reload(), 400); return; }
      const line = print("Pārbauda serverī jaunu sarakstu…", "dim");
      const before = ctx.classData()?.updated;
      const ok = await ctx.refresh();
      const after = ctx.classData()?.updated;
      if (!ok) { line.className = "err"; line.textContent = "kļūda: neizdevās ielādēt datus"; return; }
      line.innerHTML = after && after !== before ? `<span class="ok">saraksts atjaunināts · ${esc(formatStamp(after))}</span>` : `<span class="dim">nav izmaiņu · dati no ${esc(formatStamp(after))}</span>`;
    } },
    clear: { g: "Sistēma", d: "notīra konsoli", f() { io.clear(); } },
    admin: { g: "Saraksts", u: "[status|logout]", d: "atver stundu saraksta paneli (vajag administratora atslēgu)", m: "admin – prasa atslēgu un atver paneli. admin status – vai esi pieslēdzies. admin logout – iziet no paneļa šajā pārlūkā.", f(a) {
      if (a[0] === "logout") { try { localStorage.removeItem(SESSION_STORE); } catch {} return print("izgāji no paneļa", "ok"); }
      const session = readSession();
      if (a[0] === "status") return print(session ? `pieslēdzies līdz ${new Date(session.expiresAt).toLocaleString("lv-LV", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "nav pieslēdzies · ievadi <b>admin</b>");
      if (a.length) return print("lietojums: admin [status|logout]", "err");
      if (session) { print("atver paneli…", "ok"); location.href = "../dashboard/"; return; }
      io.askSecret("[admin] atslēga:", submitAdminKey);
    } },
    exit: { g: "Sistēma", d: "aizver konsoli (vai iziet no root)", f() { if (io.state.root) { io.state.root = false; io.setPrompt(); print("atteikšanās"); } else io.toggle(false); } },
    juarchinstall: { g: "juarch", d: "instalē juarch (vajag root)", m: "Unikāla, uz Arch bāzēta pieredze: jauna tēma, judo sudo vietā. Palaid: sudo juarchinstall", f() { if (!requireRoot("juarchinstall")) return; return juarchInstall(); } },
    juarchupdate: { g: "juarch", d: "atjaunina juarch un stundu datus (vajag root)", m: "pacman -Syu stilā; pa īstam pārlādē datus. Palaid: judo juarchupdate", f() { if (!requireRoot("juarchupdate")) return; return juarchUpdate(); } },
    juarch: { g: "juarch", u: "purge|status", d: "juarch pārvaldība (vajag root)", m: "juarch purge – iztīra visu OS (tēmu, krāsas, vēsturi). juarch status – versija.", f(a) {
      if (a[0] === "status") { if (!juarch()) return print("juarch: nav instalēts"); const j = prefs().juarch; return print(`juarch ${esc(j.version)} · instalēts ${new Date(j.installedAt).toLocaleDateString("lv-LV")} · atjauninājumi: ${j.updates || 0}`); }
      if (a[0] !== "purge") return print("lietojums: juarch purge|status", "err");
      if (!requireRoot("juarch purge")) return;
      if (!juarch()) return print("juarch purge: nav ko tīrīt — juarch nav instalēts", "err");
      io.askConfirm(":: Tas iztīrīs <b>visu OS</b> (juarch, tēmu, krāsas, vēsturi). Turpināt?", juarchPurge);
    } },
    paint: { g: "Jautri", u: "[istaba]", d: "kopīgā zīmēšana ar klasi vienā audeklā", m: "paint – atver kopīgo audeklu klasei. paint <istaba> – atsevišķa istaba (burti, cipari, -). Saīsne: draw.", f(a) {
      if (a.length > 1) return print("lietojums: paint [istaba]", "err");
      const room = (a[0] || "klase").toLowerCase();
      if (!/^[a-z0-9-]{1,32}$/.test(room)) return print("paint: istabas nosaukumā drīkst būt tikai a–z, 0–9 un -, līdz 32 zīmēm", "err");
      print(`atver zīmēšanu · istaba ${esc(room)}`, "ok");
      location.href = `../paint/?room=${encodeURIComponent(room)}`;
    } },
    pingpong: { g: "Jautri", u: "[kods]", d: "retro Ping Pong ar neparedzamiem notikumiem", m: "pingpong – atver spēli (arī PingPong vai pong). pingpong <kods> – uzreiz pievienojas istabai ar 5 zīmju kodu.", f(a) {
      if (a.length > 1) return print("lietojums: pingpong [kods]", "err");
      const code = (a[0] || "").toUpperCase();
      if (code && !/^[A-HJKMNP-Z2-9]{5}$/.test(code)) return print("pingpong: kods ir 5 zīmes, piemēram ABC23", "err");
      print(code ? `atver Ping Pong · istaba ${esc(code)}` : "atver Ping Pong", "ok");
      openPingPong(code);
    } },
    arena: { g: "Jautri", d: "Starpbrīdis – ātrs arēnas šāvējs ar botiem", m: "arena – atver Starpbrīdi (arī fps, shooter). Bhop, slīde, sienu lēcieni un AA-12. Vajag tastatūru un peli. Esc – pauze, izvēlnē var atgriezties sarakstā.", f(a) {
      if (a.length) return print("lietojums: arena", "err");
      print("atver Starpbrīdi", "ok");
      openArena(() => io.focus());
    } },
    doom: { g: "Jautri", u: "", d: "palaiž DOOM (1993, shareware) tieši pārlūkā", m: "doom – DOS emulators (js-dos) ar DOOM shareware epizodi tieši konsolē. Vadība: bultiņas, Ctrl šauj, atstarpe atver durvis, Esc – izvēlne. Aizvērt: Ctrl+Q, poga vai clear. Pirmajā reizē lejupielādē ~2 MB.", f() { launchGame("doom"); } },
    games: { g: "Jautri", d: "spēļu saraksts", f() { print([...Object.entries(GAMES), ...Object.entries(OVERLAY_GAMES)].map(([k, g]) => `<span class="ok">${k.padEnd(8)}</span> ${g.title} <span class="dim">· ${g.note}</span>`).join("\n")); } },
    neofetch: { g: "Jautri", d: "sistēmas info", f() {
      const events = weekEvents();
      const logo = juarch() ? JUARCH_LOGO : LOGO;
      const info = [`<b>${user()}@${host()}</b>`, "─".repeat(24), `<b>OS</b>: ${juarch() ? `juarch ${esc(prefs().juarch.version)}` : "stundu-saraksts web v2"} · <b>Klase</b>: ${esc(className())}`, `<b>Nedēļa</b>: ${weekRange(weekStart())}`, `<b>Stundas</b>: ${events.length} · <b>Priekšmeti</b>: ${subjects().length}`, `<b>Tēma</b>: ${esc(prefs().theme || "auto")} · <b>Darbojas</b>: ${fmtDur(Date.now() - PAGE_LOADED)}`, `<b>Versijas</b>: ${(ctx.index()?.weeks || []).map(w => w.version).join(", ")}`];
      pre(logo.map((l, i) => `<span class="con-accent">${l}</span>   ${info[i] || ""}`).concat([`             ${info.slice(6).join("")}`]));
    } },
    cowsay: { g: "Jautri", u: "<teksts>", d: "", f(a) { pre([COW(a.join(" ") || "Mūūū")]); } },
    fortune: { g: "Jautri", d: "gudrība dienai", f() { print(esc(FORTUNES[Math.floor(Math.random() * FORTUNES.length)])); } },
    sl: { g: "Jautri", d: "čuh-čuh", f() { const w = Math.min(60, Math.floor(io.width() / 9)); const frames = []; for (let off = w; off >= -56; off -= 2) frames.push(TRAIN.map(l => (" ".repeat(Math.max(0, off)) + l).slice(Math.max(0, -off)).slice(0, w)).join("\n")); io.animate(frames, 45); } },
    cmatrix: { g: "Jautri", d: "matrica tevi ir ieguvusi", f() {
      const w = Math.min(70, Math.floor(io.width() / 9)), h = 10, chars = "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ01";
      const drops = Array.from({ length: w }, () => Math.floor(Math.random() * h));
      const grid = Array.from({ length: h }, () => Array(w).fill(" "));
      const frames = [];
      for (let f = 0; f < 60; f++) {
        for (let x = 0; x < w; x++) { grid[drops[x] % h][x] = chars[Math.floor(Math.random() * chars.length)]; if (Math.random() < 0.3) grid[(drops[x] + h - 4) % h][x] = " "; drops[x] = (drops[x] + 1) % h; }
        frames.push(`<span style="color:#39ff14">${grid.map(r => r.join("")).join("\n")}</span>`);
      }
      io.animate(frames, 70);
    } },
    figlet: { g: "Jautri", u: "<teksts>", d: "lieli burti", f(a) {
      const text = (a.join(" ") || "VALTEH").toUpperCase().slice(0, 12);
      const rows = ["", "", ""];
      for (const ch of text) { const glyph = FIGLET_FONT[ch] || FIGLET_FONT[" "]; rows[0] += glyph[0]; rows[1] += glyph[1]; rows[2] += glyph[2]; }
      pre(rows.map(esc));
    } },
    lolcat: { g: "Jautri", u: "<teksts>", d: "varavīksne", f(a) { const t = a.join(" ") || "stundu saraksts"; print([...t].map((c, i) => `<span style="color:hsl(${(i * 25) % 360} 80% 55%)">${esc(c)}</span>`).join("")); } },
  };

  function pool(cmd, argIndex) {
    if (argIndex === 0) return Object.keys(commands).filter(c => !commands[c].hide?.());
    if (cmd === "theme") return themeList();
    if (cmd === "design") return Object.keys(DESIGNS);
    if (cmd === "versions") return ["1", "2"];
    if (cmd === "week") return ["today", "next", "prev"];
    if (cmd === "cat") return Object.keys(FILES);
    if (cmd === "open") return Object.keys(ctx.tabs);
    if (cmd === "class") return ctx.classes().map(c => q(c.short));
    if (cmd === "compiler") return [...LANGS, "list"];
    if (cmd === "juarch") return ["purge", "status"];
    if (cmd === "admin") return ["status", "logout"];
    if (cmd === "man" || ((cmd === "sudo" || cmd === "judo") && argIndex === 1)) return Object.keys(commands).filter(c => !["sudo", "judo"].includes(c) && !commands[c].hide?.());
    if (cmd === "color" || cmd === "reset" || cmd === "kill" || cmd === "grep") return subjects().map(q);
    return [];
  }

  return { commands, aliases: ALIASES, pool };
}
