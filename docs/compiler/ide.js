/* 28teh IDE: Monaco editor, xterm terminal, Wandbox/PIL runners, saved works, live coding, AI chat */
(() => {
const { esc, $, ico, toast, accessKey } = UI;
const SUPABASE_URL = "https://jlxnlqkwdshhywdprrtq.supabase.co";
const SUPABASE_KEY = "sb_publishable_ElHsgwQvJYfgjdV1yhZugw_aL4HGVaE";
const HEAD = { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY };
const WANDBOX = "https://wandbox.org/api/compile.json", JAVA_COMPILER = "openjdk-jdk-22+36";
const PIL_TIMEOUT = 10000, WANDBOX_TIMEOUT = 40000;
const MONACO = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min";
const AI_URL = "https://text.pollinations.ai/openai", AI_PROXY = "https://edupage-proxy.loduur.workers.dev/ai";

const LANGS = {
  java: { name: "Java", monaco: "java", color: "#e76f00", indent: 4, engine: "OpenJDK 22", fileOf: c => JAVA.classNameOf(c) + ".java", examples: JAVA.EXAMPLES, template: JAVA.TEMPLATE, snippets: JAVA.SNIPPETS, keywords: [...JAVA.KEYWORDS, ...JAVA.API, ...JAVA.MEMBERS], wandbox: { compiler: JAVA_COMPILER }, need: /java\.util\.NoSuchElementException|NumberFormatException: Cannot parse null string/, cmd: "javac Main.java && java Main" },
  python: { ...LANGS_EXTRA.list.python, monaco: "python", color: "#3572a5", cmd: "python3 main.py" },
  c: { ...LANGS_EXTRA.list.c, monaco: "c", color: "#555555", cmd: "gcc -Wall main.c -o main && ./main" },
  cpp: { ...LANGS_EXTRA.list.cpp, monaco: "cpp", color: "#f34b7d", cmd: "g++ -std=c++20 -Wall main.cpp -o main && ./main" },
  csharp: { ...LANGS_EXTRA.list.csharp, monaco: "csharp", color: "#178600", cmd: "mcs Program.cs && mono Program.exe" },
  lua: { ...LANGS_EXTRA.list.lua, monaco: "lua", color: "#000080", cmd: "lua main.lua" },
  pil: { name: "PIL", monaco: "pil", color: "#8a63d2", indent: 3, engine: "PIL (WebAssembly)", fileOf: c => { const m = c.match(/^\s*([A-Za-z_][\w-]*)\s*\(/m); return (m && m[1] !== "main" ? m[1] : "main") + ".pil"; }, examples: PIL.EXAMPLES, template: PIL.TEMPLATE, snippets: PIL.SNIPPETS, keywords: PIL.KEYWORDS, cmd: "pil main.pil" },
};
for (const l of Object.values(LANGS)) if (!l.newFile) l.newFile = l.template;
const LANG_ORDER = ["java", "python", "c", "cpp", "csharp", "lua", "pil"];

let monaco, editor, term, fit;
let lang = "java", pilVer = "";
const models = {}, tabs = [];
let activeTab = null, viewing = null, liveHost = null, liveView = null;
let lastError = "", lastOutput = "", diagItems = [];
fetch("pil/VERSION", { cache: "no-store" }).then(r => r.ok ? r.text() : "").then(v => { pilVer = v.trim(); }).catch(() => {});
const L = () => LANGS[lang];
const draftKey = l => "draft-" + l;
const loadDraft = l => localStorage.getItem(draftKey(l)) || (l === "java" ? localStorage.getItem("java-draft") : l === "pil" ? localStorage.getItem("pil-draft") : null) || LANGS[l].template;
const fmtTime = d => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/* ================= Monaco ================= */
function bootMonaco() {
  return new Promise(resolve => {
    window.MonacoEnvironment = { getWorkerUrl: () => URL.createObjectURL(new Blob([`self.MonacoEnvironment={baseUrl:'${MONACO}/'};importScripts('${MONACO}/vs/base/worker/workerMain.js');`], { type: "text/javascript" })) };
    require.config({ paths: { vs: MONACO + "/vs" } });
    require(["vs/editor/editor.main"], m => { monaco = m; setupMonaco(); resolve(); });
  });
}
function setupMonaco() {
  monaco.editor.defineTheme("dark-modern", {
    base: "vs-dark", inherit: true,
    rules: [
      { token: "comment", foreground: "6a9955" }, { token: "keyword", foreground: "569cd6" }, { token: "keyword.control", foreground: "c586c0" },
      { token: "string", foreground: "ce9178" }, { token: "number", foreground: "b5cea8" }, { token: "type", foreground: "4ec9b0" }, { token: "type.identifier", foreground: "4ec9b0" },
      { token: "delimiter", foreground: "d4d4d4" }, { token: "operator", foreground: "d4d4d4" }, { token: "variable", foreground: "9cdcfe" }, { token: "variable.predefined", foreground: "9cdcfe" },
      { token: "identifier", foreground: "d4d4d4" }, { token: "annotation", foreground: "dcdcaa" }, { token: "builtin", foreground: "dcdcaa" }, { token: "label", foreground: "c8c8c8", fontStyle: "bold" },
    ],
    colors: {
      "editor.background": "#1f1f1f", "editor.foreground": "#cccccc", "editorLineNumber.foreground": "#6e7681", "editorLineNumber.activeForeground": "#cccccc",
      "editor.lineHighlightBackground": "#282828", "editor.lineHighlightBorder": "#282828", "editor.selectionBackground": "#264f78", "editorCursor.foreground": "#aeafad",
      "editorIndentGuide.background1": "#404040", "editorIndentGuide.activeBackground1": "#707070", "editorWidget.background": "#202020", "editorWidget.border": "#454545",
      "editorSuggestWidget.background": "#202020", "editorSuggestWidget.border": "#454545", "editorSuggestWidget.selectedBackground": "#04395e", "editorHoverWidget.background": "#202020",
      "scrollbarSlider.background": "#79797966", "scrollbarSlider.hoverBackground": "#646464b3", "editorError.foreground": "#f14c4c", "editorWarning.foreground": "#cca700",
      "editorGutter.background": "#1f1f1f", "editorOverviewRuler.border": "#1f1f1f", "focusBorder": "#0078d4", "editorBracketMatch.background": "#0064001a", "editorBracketMatch.border": "#888888",
    },
  });
  monaco.languages.register({ id: "pil" });
  monaco.languages.setLanguageConfiguration("pil", { comments: { lineComment: ";" }, brackets: [["(", ")"], ["[", "]"]], autoClosingPairs: [{ open: "(", close: ")" }, { open: "[", close: "]" }, { open: '"', close: '"' }, { open: "'", close: "'" }] });
  monaco.languages.setMonarchTokensProvider("pil", {
    builtins: [...PIL.BUILTIN_SET],
    tokenizer: { root: [
      [/;.*$/, "comment"], [/"(?:[^"\\]|\\.)*"/, "string"], [/'(?:[^'\\]|\\.)*'/, "string"],
      [/R?\$\d+/, "variable.predefined"], [/@[\w-]+/, "annotation"], [/\.\.\./, "keyword"],
      [/^\s*[A-Za-z_][\w-]*(?=\s*\()/, "type.identifier"], [/^\s*[A-Za-z_][\w-]*(?=\s*:)/, "label"],
      [/\b(let|const)\b/, "keyword"], [/-?\d+(\.\d+)?([eE][-+]?\d+)?/, "number"],
      [/^\s*[A-Za-z_][\w-]*/, { cases: { "@builtins": "builtin", "@default": "type.identifier" } }],
      [/[A-Za-z_][\w-]*/, "identifier"], [/[()\[\],:]/, "delimiter"],
    ] },
  });
  for (const key of LANG_ORDER) {
    const d = LANGS[key];
    monaco.languages.registerCompletionItemProvider(d.monaco, {
      provideCompletionItems(model, position) {
        const w = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
        const K = monaco.languages.CompletionItemKind, out = [];
        for (const [name, s] of Object.entries(d.snippets || {})) out.push({ label: name, kind: K.Snippet, detail: s.k, insertText: snippetText(s), insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, sortText: "0" + name });
        if (key === "pil") { for (const b of PIL.BUILTINS) out.push({ label: b.n, kind: K.Function, detail: b.sig, insertText: b.n + " ", range }); for (const dd of PIL.DIRECTIVES) out.push({ label: dd, kind: K.Keyword, insertText: dd + " ", range }); }
        else for (const kw of d.keywords || []) out.push({ label: kw, kind: kw.includes(".") ? K.Method : K.Keyword, insertText: kw, range });
        return { suggestions: out };
      },
    });
  }
  editor = monaco.editor.create($("monaco"), {
    theme: "dark-modern", fontFamily: '"JetBrains Mono","Fira Code",Menlo,monospace', fontSize: +localStorage.getItem("code-font") || 13.5, lineHeight: 22, fontLigatures: true,
    automaticLayout: true, minimap: { enabled: localStorage.getItem("minimap") === "1" }, scrollBeyondLastLine: false, renderLineHighlight: "all", cursorBlinking: "smooth", cursorSmoothCaretAnimation: "on",
    smoothScrolling: true, padding: { top: 8 }, wordWrap: localStorage.getItem("wrap") === "1" ? "on" : "off", bracketPairColorization: { enabled: true }, tabSize: 4, insertSpaces: true, guides: { indentation: true },
    suggest: { showWords: true, preview: true }, quickSuggestions: { other: true, comments: false, strings: false }, roundedSelection: true, scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run());
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => openSave());
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, () => zoom(1));
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, () => zoom(-1));
  editor.onDidChangeCursorPosition(e => { $("s-pos").textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`; });
  editor.onDidChangeModelContent(() => {
    const t = activeTab; if (!t || t.kind !== "file") return;
    try { localStorage.setItem(draftKey(t.lang), editor.getValue()); } catch (e) {}
    if (diagItems.length) clearDiags();
    updateTitle(); if (liveHost) liveHost.changed();
  });
}
function snippetText(s) {
  const lines = s.text.split("\n");
  if (typeof s.cur === "number") { const t = s.text; const i = t.length + s.cur; return t.slice(0, i) + "$0" + t.slice(i); }
  if (s.cur && typeof s.cur.line === "number") { lines[s.cur.line] = lines[s.cur.line] + "$0"; return lines.join("\n"); }
  return s.text;
}
function modelFor(l) {
  if (!models[l]) { models[l] = monaco.editor.createModel(loadDraft(l), LANGS[l].monaco, monaco.Uri.parse(`inmemory://28teh/${LANGS[l].fileOf(loadDraft(l))}`)); models[l].updateOptions({ tabSize: LANGS[l].indent, insertSpaces: true }); }
  return models[l];
}
function zoom(d) { const v = Math.max(10, Math.min(24, editor.getOption(monaco.editor.EditorOption.fontSize) + d)); editor.updateOptions({ fontSize: v }); localStorage.setItem("code-font", v); }

/* ================= tabs / files ================= */
function openFile(l, { focus = true } = {}) {
  let t = tabs.find(x => x.kind === "file" && x.lang === l);
  if (!t) { t = { id: "file:" + l, kind: "file", lang: l, model: modelFor(l) }; tabs.push(t); }
  activate(t, focus);
}
function activate(t, focus = true) {
  activeTab = t; lang = t.lang;
  editor.setModel(t.model); editor.updateOptions({ readOnly: t.kind !== "file" });
  localStorage.setItem("code-lang", lang);
  $("viewbar").hidden = t.kind === "file";
  $("fork").hidden = t.kind === "live" && !!liveHost;
  $("live-end").hidden = !(t.kind === "live" && liveHost);
  renderTabs(); updateTitle(); renderLangUI(); clearDiags(); resetRun();
  if (t.kind === "file" && liveHost && liveHost.state.lang !== lang) liveHost.setLang(lang);
  const u = new URL(location.href); u.search = t.kind === "file" ? `?lang=${lang}` : t.kind === "snippet" ? `?id=${t.data.id}` : `?live=${t.data.id}`; history.replaceState(null, "", u);
  if (focus) editor.focus();
  if (currentView === "explorer") renderSidebar();
}
function closeTab(t) {
  const i = tabs.indexOf(t); if (i < 0) return;
  if (t.kind === "live") { if (liveHost && t.data.id === liveHost.state.id) return endLive(); if (liveView) { liveView.close(); liveView = null; } }
  if (t.kind === "snippet" || t.kind === "live") t.model.dispose();
  tabs.splice(i, 1);
  if (activeTab === t) { const next = tabs[i] || tabs[i - 1]; if (next) activate(next); else openFile(t.kind === "file" ? "java" : lang); }
  else renderTabs();
}
function renderTabs() {
  $("tabs").innerHTML = tabs.map(t => {
    const title = t.kind === "file" ? LANGS[t.lang].fileOf(t.model.getValue()) : t.data.title;
    const iconName = t.kind === "live" ? "broadcast" : t.kind === "snippet" ? "lock" : "file-code";
    const color = t.kind === "file" ? LANGS[t.lang].color : t.kind === "live" ? "var(--live)" : "var(--fg-2)";
    return `<div class="tab${t === activeTab ? " on" : ""}" data-id="${t.id}" title="${esc(title)}"><i class="codicon codicon-${iconName}" style="color:${color}"></i><span>${esc(title)}</span>${t.kind !== "file" ? `<span class="ro">${t.kind === "live" ? "live" : "read-only"}</span>` : ""}<span class="x" data-x="${t.id}" title="Close"><i class="codicon codicon-close"></i></span></div>`;
  }).join("");
  $("tabs").querySelectorAll(".tab").forEach(el => { el.onclick = e => { const t = tabs.find(x => x.id === el.dataset.id); if (e.target.closest(".x")) closeTab(t); else activate(t); }; el.onauxclick = e => { if (e.button === 1) closeTab(tabs.find(x => x.id === el.dataset.id)); }; });
}
function updateTitle() {
  const t = activeTab; if (!t) return;
  const name = t.kind === "file" ? LANGS[lang].fileOf(editor.getValue()) : t.data.title;
  $("tb-file").textContent = name; document.title = `${name} – 28teh`;
  $("crumbs").innerHTML = `<i class="codicon codicon-folder"></i>${t.kind === "file" ? "workspace" : t.kind === "snippet" ? "saved works" : "live"}<i class="codicon codicon-chevron-right"></i><i class="codicon codicon-file-code" style="color:${LANGS[lang].color}"></i>${esc(name)}`;
  const active = tabs.find(x => x === activeTab); if (active) { const el = $("tabs").querySelector(`.tab[data-id="${CSS.escape(active.id)}"] span`); if (el) el.textContent = name; }
}
function renderLangUI() {
  const d = L();
  $("lang-name").textContent = d.name; $("lang-dot").style.background = d.color; $("s-lang").textContent = d.name; $("s-engine").textContent = d.engine; $("s-indent").textContent = `Spaces: ${d.indent}`;
}

/* ================= menus ================= */
let openMenu = null;
function showMenu(anchor, items, { align = "left", width } = {}) {
  hideMenu();
  const m = document.createElement("div"); m.className = "menu-list"; if (width) m.style.minWidth = width + "px";
  m.innerHTML = items.map(it => it === "-" ? "<hr>" : it.h ? `<div class="h">${esc(it.h)}</div>` : `<button ${it.disabled ? "disabled" : ""} data-i="${items.indexOf(it)}" class="${it.selected ? "sel" : ""}">${it.icon ? ico(it.icon) : it.dot ? `<span class="lang-dot" style="background:${it.dot}"></span>` : ""}<span>${esc(it.label)}</span>${it.k ? `<span class="k">${esc(it.k)}</span>` : ""}</button>`).join("");
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(); m.style.top = r.bottom + 4 + "px";
  if (align === "right") m.style.right = innerWidth - r.right + "px"; else m.style.left = r.left + "px";
  m.querySelectorAll("button[data-i]").forEach(b => b.onclick = () => { const it = items[+b.dataset.i]; hideMenu(); it.run && it.run(); });
  openMenu = m;
}
function hideMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
document.addEventListener("mousedown", e => { if (openMenu && !e.target.closest(".menu-list")) hideMenu(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { hideMenu(); document.querySelectorAll(".modal-bg.on").forEach(m => m.classList.remove("on")); } });

function langMenu(anchor, align) { showMenu(anchor, LANG_ORDER.map(k => ({ label: LANGS[k].name, dot: LANGS[k].color, selected: k === lang, k: LANGS[k].fileOf(loadDraft(k)), run: () => openFile(k) })), { align, width: 220 }); }
$("lang-pick").onclick = e => langMenu(e.currentTarget);
$("s-lang").onclick = e => langMenu(e.currentTarget, "right");
$("more").onclick = e => showMenu(e.currentTarget, [
  { label: "New file", icon: "new-file", run: newFile },
  { label: "Format document", icon: "list-flat", k: "⇧⌥F", run: () => editor.getAction("editor.action.formatDocument")?.run() },
  "-", { h: "Examples" }, ...L().examples.map((ex, i) => ({ label: ex.name, icon: "file-code", run: () => loadExample(i) })),
  "-", { label: "Start live coding", icon: "broadcast", run: () => $("live-start") ? $("live-start").click() : openLiveModal() },
  { label: "Open timetable", icon: "calendar", run: () => location.href = "../" },
], { align: "right", width: 240 });
$("act-settings").onclick = e => showMenu(e.currentTarget, [
  { label: "Increase font size", icon: "zoom-in", k: "⌘ +", run: () => zoom(1) }, { label: "Decrease font size", icon: "zoom-out", k: "⌘ −", run: () => zoom(-1) },
  { label: (editor.getOption(monaco.editor.EditorOption.wordWrap) === "on" ? "Disable" : "Enable") + " word wrap", icon: "word-wrap", run: () => { const on = editor.getOption(monaco.editor.EditorOption.wordWrap) !== "on"; editor.updateOptions({ wordWrap: on ? "on" : "off" }); localStorage.setItem("wrap", on ? "1" : "0"); } },
  { label: (editor.getOption(monaco.editor.EditorOption.minimap).enabled ? "Hide" : "Show") + " minimap", icon: "map", run: () => { const on = !editor.getOption(monaco.editor.EditorOption.minimap).enabled; editor.updateOptions({ minimap: { enabled: on } }); localStorage.setItem("minimap", on ? "1" : "0"); } },
  "-", { label: "Sign out (forget access code)", icon: "sign-out", run: () => { localStorage.removeItem("java-access"); location.reload(); } },
]);
$("model-pick").onclick = e => showMenu(e.currentTarget, aiModels.length ? aiModels.map(m => ({ label: m.name, selected: m.id === aiModel, run: () => setModel(m.id) })) : [{ label: "pollinations (fallback)", selected: true }], { align: "right", width: 260 });

/* ================= sidebar views ================= */
let currentView = "explorer", sbOpen = true;
const secState = JSON.parse(localStorage.getItem("secs") || "{}");
document.querySelectorAll(".act[data-view]").forEach(b => b.onclick = () => { const v = b.dataset.view; if (v === currentView && sbOpen) { sbOpen = false; } else { currentView = v; sbOpen = true; } $("sidebar").hidden = !sbOpen; document.querySelectorAll(".act[data-view]").forEach(x => x.classList.toggle("on", x.dataset.view === currentView && sbOpen)); renderSidebar(); });
function section(id, title, bodyHtml, count) { const closed = secState[id]; return `<div class="sec${closed ? " closed" : ""}" data-sec="${id}"><div class="sec-h">${ico("chevron-down", "tw")}${esc(title)}${count != null ? `<span class="n">${count}</span>` : ""}</div><div class="sec-b">${bodyHtml}</div></div>`; }
function bindSections(root) { root.querySelectorAll(".sec-h").forEach(h => h.onclick = () => { const s = h.parentElement; s.classList.toggle("closed"); secState[s.dataset.sec] = s.classList.contains("closed"); localStorage.setItem("secs", JSON.stringify(secState)); }); }
async function renderSidebar() {
  const body = $("sb-body"); $("sb-refresh").hidden = currentView === "explorer";
  $("sb-title").textContent = { explorer: "Explorer", saved: "Saved works", live: "Live coding" }[currentView];
  if (currentView === "explorer") {
    const files = LANG_ORDER.map(k => `<div class="row${activeTab && activeTab.kind === "file" && activeTab.lang === k ? " on" : ""}" data-lang="${k}">${ico("file-code")}<span class="name" style="color:${k === lang ? "var(--fg-strong)" : ""}">${esc(LANGS[k].fileOf(loadDraft(k)))}</span><span class="ext" style="color:${LANGS[k].color}">${esc(LANGS[k].name)}</span></div>`).join("");
    const ex = L().examples.map((e, i) => `<div class="row" data-ex="${i}">${ico("symbol-file")}<span class="name">${esc(e.name)}</span></div>`).join("");
    body.innerHTML = section("ws", "28teh workspace", files) + section("ex", `Examples · ${L().name}`, ex, L().examples.length);
    body.querySelectorAll("[data-lang]").forEach(r => r.onclick = () => openFile(r.dataset.lang));
    body.querySelectorAll("[data-ex]").forEach(r => r.onclick = () => loadExample(+r.dataset.ex));
  } else if (currentView === "saved") {
    body.innerHTML = `<div class="sb-actions"><div class="field">${ico("search")}<input id="sb-q" placeholder="Search saved works"></div></div><div id="sb-list"><div class="sb-empty">Loading…</div></div>`;
    $("sb-q").oninput = () => renderSaved();
    await loadSaved(); renderSaved();
  } else if (currentView === "live") {
    const hosting = liveHost ? `<div class="sb-note"><span class="live-pill">${ico("circle-filled")}LIVE</span> · ${esc(liveHost.title)}<br>Viewers join from this list or via the link.</div><div class="sb-actions"><button class="btn" id="live-copy">${ico("link")}Copy viewer link</button><button class="btn danger" id="live-stop">${ico("debug-stop")}End session</button></div>` : `<div class="sb-note">Share your editor in real time. Viewers see every change; add a password to encrypt the session.</div><div class="sb-actions"><button class="btn pri" id="live-start">${ico("broadcast")}Start live coding</button></div>`;
    body.innerHTML = section("mine", "Your session", hosting) + section("active", "Active sessions", `<div id="live-list"><div class="sb-empty">Loading…</div></div>`);
    if ($("live-start")) $("live-start").onclick = openLiveModal;
    if ($("live-stop")) $("live-stop").onclick = endLive;
    if ($("live-copy")) $("live-copy").onclick = () => copyText(`${location.origin}${location.pathname}?live=${liveHost.state.id}`, "Viewer link copied");
    loadLiveList();
  }
  bindSections(body);
}
$("sb-refresh").onclick = () => renderSidebar();
let savedAll = [];
async function loadSaved() { try { const r = await fetch(`${SUPABASE_URL}/rest/v1/snippets?select=id,title,author,lang,created_at&order=created_at.desc&limit=300`, { headers: HEAD }); savedAll = await r.json(); } catch (e) { savedAll = []; } }
function renderSaved() {
  const q = ($("sb-q")?.value || "").trim().toLowerCase(); const list = $("sb-list"); if (!list) return;
  const items = savedAll.filter(s => !q || (s.title + " " + (s.author || "")).toLowerCase().includes(q));
  const by = {}; for (const s of items) (by[s.lang || "java"] ||= []).push(s);
  list.innerHTML = items.length ? LANG_ORDER.filter(k => by[k]).map(k => section("sv-" + k, LANGS[k].name, by[k].map(s => `<div class="row${viewing && viewing.id === s.id ? " on" : ""}" data-id="${s.id}" title="${esc(s.title)} · ${esc(s.author || "anonymous")}">${ico("file-code")}<span class="name">${esc(s.title)}</span><span class="meta">${esc(s.author || "anonymous")} · ${fmtTime(s.created_at)}</span></div>`).join(""), by[k].length)).join("") : `<div class="sb-empty">${q ? "No matches." : "Nothing saved yet."}</div>`;
  list.querySelectorAll("[data-id]").forEach(r => r.onclick = () => openSnippet(r.dataset.id));
  bindSections(list);
}
async function loadLiveList() {
  const el = $("live-list"); if (!el) return;
  try {
    const items = (await LIVE.listActive()).filter(s => !liveHost || s.id !== liveHost.state.id);
    el.innerHTML = items.length ? items.map(s => `<div class="row" data-live="${s.id}">${ico("broadcast")}<span class="name">${esc(s.title)}</span>${s.protected ? ico("lock") : ""}<span class="meta">${esc(s.author || "anonymous")} · ${esc(LANGS[s.lang]?.name || s.lang)}</span></div>`).join("") : `<div class="sb-empty">No live sessions right now.</div>`;
    el.querySelectorAll("[data-live]").forEach(r => r.onclick = () => openLive(r.dataset.live));
    $("live-dot").hidden = !items.length && !liveHost;
  } catch (e) { el.innerHTML = `<div class="sb-empty">Could not load sessions.</div>`; }
}
setInterval(() => { if (!document.hidden) { if (currentView === "live") loadLiveList(); else LIVE.listActive().then(items => { $("live-dot").hidden = !items.length && !liveHost; }).catch(() => {}); } }, 20000);
function loadExample(i) { const e = L().examples[i]; if (activeTab.kind !== "file") openFile(lang); if (editor.getValue().trim() && editor.getValue() !== L().template && !confirm(`Replace the current code with the example "${e.name}"?`)) return; editor.setValue(e.code); resetRun(); editor.focus(); }
function newFile() { if (activeTab.kind !== "file") openFile(lang); if (editor.getValue().trim() && editor.getValue() !== L().template && !confirm("Clear the editor?")) return; editor.setValue(L().newFile); resetRun(); editor.focus(); }
async function copyText(t, msg) { try { await navigator.clipboard.writeText(t); toast(msg, "ok"); } catch (e) { prompt("Copy:", t); } }

/* ================= panel ================= */
let panelView = "terminal", panelMax = false;
function showPanel(v) { panelView = v; document.querySelectorAll(".ptab").forEach(b => b.classList.toggle("on", b.dataset.p === v)); for (const k of ["problems", "output", "terminal"]) $("pv-" + k).hidden = k !== v; if (v === "terminal") { fit.fit(); term.focus(); } }
document.querySelectorAll(".ptab").forEach(b => b.onclick = () => showPanel(b.dataset.p));
$("pmax").onclick = () => { panelMax = !panelMax; $("panel").classList.toggle("max", panelMax); $("pmax").innerHTML = ico(panelMax ? "chevron-down" : "chevron-up"); $("pmax").title = panelMax ? "Restore panel size" : "Maximize panel"; setTimeout(() => fit.fit(), 50); };
$("pclear").onclick = () => { if (panelView === "terminal") { term.clear(); } else if (panelView === "output") $("output").innerHTML = '<span class="d">Compiler output will appear here.</span>'; else clearDiags(); };
(() => { const g = $("psplit"), area = document.querySelector(".editor-area"); let drag = false;
  const saved = localStorage.getItem("panelh"); if (saved) area.style.setProperty("--panelh", saved);
  g.addEventListener("mousedown", e => { drag = true; g.classList.add("on"); e.preventDefault(); });
  addEventListener("mousemove", e => { if (!drag) return; const r = area.getBoundingClientRect(); const p = Math.min(85, Math.max(12, (r.bottom - e.clientY) / r.height * 100)); area.style.setProperty("--panelh", p + "%"); });
  addEventListener("mouseup", () => { if (!drag) return; drag = false; g.classList.remove("on"); localStorage.setItem("panelh", area.style.getPropertyValue("--panelh")); fit.fit(); });
})();
function setStatus(text, cls) { const html = (cls === "run" ? ico("sync") : cls === "ok" ? ico("check") : cls === "err" ? ico("error") : "") + esc(text); $("st").innerHTML = html; $("st").className = "st " + (cls || ""); $("s-state").innerHTML = html; $("s-state").className = "si " + (cls || ""); }
function output(html, append = false) { const o = $("output"); if (append) o.innerHTML += html; else o.innerHTML = html; o.scrollTop = o.scrollHeight; }

/* ================= diagnostics ================= */
function clearDiags() { diagItems = []; if (activeTab) monaco.editor.setModelMarkers(activeTab.model, "run", []); renderProblems(); }
function setDiags(items) {
  diagItems = items;
  const model = activeTab.model, S = monaco.MarkerSeverity;
  monaco.editor.setModelMarkers(model, "run", items.filter(i => i.line).map(i => { const ln = Math.min(i.line, model.getLineCount()); const text = model.getLineContent(ln); const sc = i.col || (text.match(/^\s*/)[0].length + 1); return { startLineNumber: ln, endLineNumber: ln, startColumn: sc, endColumn: Math.max(sc + 1, text.length + 1), message: i.msg + (i.hint ? "\n" + i.hint : ""), severity: i.kind === "warning" ? S.Warning : S.Error, source: i.kind === "runtime" ? "runtime" : "compiler" }; }));
  renderProblems();
}
function renderProblems() {
  const errs = diagItems.filter(i => i.kind !== "warning").length, warns = diagItems.length - errs;
  $("s-err").textContent = errs; $("s-warn").textContent = warns; $("prob-n").textContent = diagItems.length; $("prob-n").hidden = !diagItems.length; $("prob-n").className = "n" + (errs ? " err" : "");
  const file = activeTab ? (activeTab.kind === "file" ? LANGS[lang].fileOf(editor.getValue()) : activeTab.data.title) : "";
  $("problems").innerHTML = diagItems.length ? diagItems.map((i, n) => `<div class="prob ${i.kind === "warning" ? "warning" : "error"}" data-n="${n}">${ico(i.kind === "warning" ? "warning" : "error")}<div><span>${esc(i.msg)}</span><span class="src">${esc(file)}${i.line ? ` [Ln ${i.line}${i.col ? ", Col " + i.col : ""}]` : ""} · ${i.kind}</span>${i.hint ? `<span class="hint">${esc(i.hint)}</span>` : ""}</div></div>`).join("") : '<div class="pempty">No problems have been detected.</div>';
  $("problems").querySelectorAll(".prob").forEach(el => el.onclick = () => { const i = diagItems[+el.dataset.n]; if (!i.line) return; editor.revealLineInCenter(i.line); editor.setPosition({ lineNumber: i.line, column: i.col || 1 }); editor.focus(); });
}
const HINTS = [
  [/NoSuchElementException/, "The program expected more input than it received."],
  [/ArithmeticException: \/ by zero|ZeroDivisionError|integer divide by zero|DivideByZeroException/, "Division by zero."],
  [/ArrayIndexOutOfBounds|IndexOutOfRangeException|IndexError: list index out of range|StringIndexOutOfBounds/, "Index outside the array bounds – check loop limits (< instead of <=)."],
  [/NullPointerException|NullReferenceException/, "The variable is null – it was never assigned a value."],
  [/NumberFormatException|ValueError: invalid literal for int|FormatException|InputMismatchException|could not convert string to float/, "The text is not a number – validate the input first."],
  [/StackOverflowError|RecursionError|stack overflow/, "Infinite recursion – the base case is missing."],
  [/Segmentation fault|SIGSEGV/i, "Invalid memory access – check array indices and pointers."],
  [/NameError: name '\w+' is not defined/, "The name is not defined (or misspelled)."],
  [/cannot find symbol|was not declared in this scope|undeclared|does not exist in the current context/, "Unknown name – check the spelling or declare it before use."],
  [/';' expected|expected ';'|missing ';'|CS1002/, "Missing semicolon (usually on the previous line)."],
  [/incompatible types|cannot convert|invalid conversion|TypeError:/, "Type mismatch."],
  [/attempt to (?:call|index|concatenate|perform arithmetic on) a nil value/, "The value is nil – the variable was never assigned or the function does not exist."],
  [/IndentationError|unexpected indent/, "Inconsistent indentation."],
  [/unterminated string|missing terminating|unclosed string/, "Unclosed string literal."],
  [/expected '\)'|expected '}'|reached end of file while parsing|unexpected EOF|expected 'end'|'end' expected/, "A closing bracket or block end is missing."],
  [/undefined reference to `main'|no main method|does not contain a static 'Main'/, "The program has no main entry point."],
];
const hintFor = msg => { for (const [re, h] of HINTS) if (re.test(msg)) return h; return ""; };
function diagnose(cls, ce, perr, signal, rc) {
  const items = []; const add = (kind, line, col, msg) => { msg = (msg || "").trim(); if (!msg) return; line = +line || 0; if (items.some(i => i.line === line && i.msg === msg)) return; items.push({ kind, line, col: +col || 0, msg, hint: msg.includes("–") ? "" : hintFor(msg) }); };
  let m, re;
  if (ce) {
    if (lang === "java") { re = new RegExp("(?:\\./)?" + cls + "\\.java:(\\d+): (error|warning): (.*)", "g"); while ((m = re.exec(ce))) add(m[2], m[1], 0, m[3]); }
    else if (lang === "c" || lang === "cpp") { re = /prog\.cc?:(\d+):(\d+): (?:fatal )?(error|warning): (.*)/g; while ((m = re.exec(ce))) add(m[3], m[1], m[2], m[4]); if (!items.length && /undefined reference/.test(ce)) add("error", 0, 0, (ce.match(/undefined reference to [^\n]*/) || ["Linker error"])[0]); }
    else if (lang === "csharp") { re = /prog\.cs\((\d+),(\d+)\): (error|warning) (CS\d+: .*)/g; while ((m = re.exec(ce))) add(m[3], m[1], m[2], m[4]); }
    if (!items.length && /error/i.test(ce)) add("error", 0, 0, ce.split("\n").find(l => /error/i.test(l)) || ce.split("\n")[0]);
  }
  if (perr) {
    if (lang === "java") { const ex = perr.match(/(?:Exception in thread "[^"]*" |Caused by: )?((?:[\w.]+\.)?(\w+(?:Exception|Error)))(?:: ([^\n]*))?/); const at = perr.match(new RegExp("at " + cls + "\\.\\w+\\(" + cls + "\\.java:(\\d+)\\)")); if (ex) add("runtime", at ? at[1] : 0, 0, ex[2] + (ex[3] ? ": " + ex[3] : "")); }
    else if (lang === "python") { const frames = [...perr.matchAll(/File "[^"]*prog\.py", line (\d+)/g)]; const last = perr.trim().split("\n").pop(); if (/\w+(?:Error|Exception|Interrupt|Exit)\b/.test(last)) add("runtime", frames.length ? frames[frames.length - 1][1] : 0, 0, last); }
    else if (lang === "lua") { m = perr.match(/prog\.lua:(\d+): ([^\n]*)/) || perr.match(/lua: [^\n]*?:(\d+): ([^\n]*)/); if (m) add("runtime", m[1], 0, m[2]); else if (/^lua:/m.test(perr)) add("runtime", 0, 0, perr.split("\n")[0].replace(/^lua: /, "")); }
    else if (lang === "csharp") { m = perr.match(/Unhandled Exception:\s*\n?\s*([\w.]+(?:Exception|Error))(?:: ([^\n]*))?/); if (m) add("runtime", 0, 0, m[1].split(".").pop() + (m[2] ? ": " + m[2] : "")); }
    else if (lang === "c" || lang === "cpp") { m = perr.match(/terminate called after throwing an instance of '([^']+)'\s*\n?\s*(?:what\(\):\s*(.*))?/); if (m) add("runtime", 0, 0, m[1] + (m[2] ? ": " + m[2] : "")); }
  }
  const EXIT = { 137: "Process killed – time or memory limit exceeded (infinite loop?)", 139: "Segmentation fault – invalid memory access", 134: "Process aborted", 136: "Arithmetic exception (SIGFPE) – division by zero?", 124: "Time limit exceeded" };
  if (signal) add("runtime", 0, 0, `Process terminated: ${signal}`);
  else if (rc !== 0 && !items.some(i => i.kind !== "warning") && !perr) add("runtime", 0, 0, EXIT[rc] || `Process exited with code ${rc}`);
  return items.sort((a, b) => (a.line || 1e9) - (b.line || 1e9));
}

/* ================= terminal ================= */
const ANSI = { dim: "\x1b[90m", red: "\x1b[31m", yellow: "\x1b[33m", green: "\x1b[32m", cyan: "\x1b[36m", reset: "\x1b[0m" };
const tw = s => term.write(String(s).replace(/\r?\n/g, "\r\n"));
let lineBuf = "", consumed = 0, stdinBuf = "", waiting = false, busy = false, pendingIn = [], worker = null, runTimer = 0, runSeq = 0, eofMode = false, lastCol0 = true;
function bootTerm() {
  term = new Terminal({ fontFamily: '"JetBrains Mono","Fira Code",Menlo,monospace', fontSize: 13, lineHeight: 1.25, cursorBlink: true, cursorStyle: "bar", convertEol: false, scrollback: 3000, allowProposedApi: true,
    theme: { background: "#181818", foreground: "#cccccc", cursor: "#cccccc", cursorAccent: "#181818", selectionBackground: "#264f78", black: "#000000", red: "#f14c4c", green: "#89d185", yellow: "#cca700", blue: "#3794ff", magenta: "#bc3fbc", cyan: "#29b8db", white: "#e5e5e5", brightBlack: "#6f6f6f", brightRed: "#f14c4c", brightGreen: "#89d185", brightYellow: "#e2c08d", brightBlue: "#3b8eea", brightMagenta: "#d670d6", brightCyan: "#29b8db", brightWhite: "#ffffff" } });
  fit = new FitAddon.FitAddon(); term.loadAddon(fit); term.open($("xterm")); fit.fit();
  new ResizeObserver(() => { try { fit.fit(); } catch (e) {} }).observe($("xterm"));
  term.onData(d => { for (const ch of d.replace(/\r\n/g, "\r")) onKey(ch); });
  banner();
}
function banner() { tw(`${ANSI.dim}28teh terminal · program input and output appear here. Ctrl+Enter runs the current file.${ANSI.reset}\n`); }
function onKey(ch) {
  if (ch === "\x03") { if (busy || waiting) { abortRun(); setWaiting(false); tw(`^C\n`); finishLine("Process interrupted", -1, 0, "err"); } else if (lineBuf) { lineBuf = ""; tw("^C\n"); } return; }
  if (ch === "\x04") { if (waiting && !busy) { eofMode = true; setWaiting(false); tw(`${ANSI.dim}^D${ANSI.reset}\n`); execute(true); } return; }
  if (ch === "\x0c") { term.clear(); return; }
  if (busy) return;
  if (ch === "\r" || ch === "\n") { tw("\n"); const line = lineBuf; lineBuf = ""; if (waiting) { stdinBuf += line + "\n"; setWaiting(false); execute(true); } else pendingIn.push(line); return; }
  if (ch === "\x7f" || ch === "\b") { if (lineBuf) { lineBuf = lineBuf.slice(0, -1); term.write("\b \b"); } return; }
  if (ch >= " " && ch !== "\x1b") { lineBuf += ch; term.write(ANSI.cyan + ch + ANSI.reset); }
}
function setWaiting(on) { waiting = on; if (on) { setStatus("Waiting for input", "run"); term.focus(); } }
function resetRun() { abortRun(); consumed = 0; stdinBuf = ""; pendingIn = []; eofMode = false; lineBuf = ""; setWaiting(false); setStatus(""); $("s-time").textContent = ""; }
function abortRun() { runSeq++; clearTimeout(runTimer); if (worker) { worker.terminate(); worker = null; } busy = false; $("run").disabled = false; $("stop").disabled = true; }
function finishLine(text, rc, ms, cls) { if (!lastCol0) tw("\n"); tw(`${cls === "err" ? ANSI.red : ANSI.dim}[${text}${ms ? ` in ${ms < 1000 ? ms + " ms" : (ms / 1000).toFixed(1) + " s"}` : ""}]${ANSI.reset}\n\n`); lastCol0 = true; }
function run() {
  if (busy) return; if (!editor.getValue().trim()) return toast("Nothing to run", "error");
  abortRun(); showPanel("terminal");
  stdinBuf = pendingIn.length ? pendingIn.join("\n") + "\n" : ""; pendingIn = []; consumed = 0; eofMode = false; lineBuf = ""; setWaiting(false);
  tw(`${ANSI.dim}$ ${L().cmd}${ANSI.reset}\n`); lastCol0 = true;
  execute(false);
}
$("run").onclick = run; $("stop").onclick = () => onKey("\x03");
async function execute(cont) {
  const code = editor.getValue(), seq = ++runSeq, t0 = performance.now(), tab = activeTab;
  busy = true; $("run").disabled = true; $("stop").disabled = false;
  setStatus(cont ? "Running" : L().wandbox && !["py", "lua"].includes(L().wandbox.ext) ? "Compiling" : "Running", "run");
  let r;
  try { r = await (lang === "pil" ? runPil(code, stdinBuf) : runWandbox(code, stdinBuf)); }
  catch (e) { if (seq !== runSeq) return; r = { out: "", err: "", rc: -1, needAt: -1, raw: "", diag: [{ kind: "error", msg: e.message }] }; }
  if (seq !== runSeq || tab !== activeTab) return;
  busy = false; $("run").disabled = false; $("stop").disabled = true;
  const ms = Math.round(performance.now() - t0);
  const full = r.out || "", cut = r.needAt >= 0 ? r.needAt : full.length;
  if (cut > consumed) { const chunk = full.slice(consumed, cut); tw(chunk); lastCol0 = chunk.endsWith("\n"); }
  consumed = cut;
  if (r.raw) output(`<span class="d">$ ${esc(L().cmd)}</span>\n${esc(r.raw.trim())}\n`, false); else if (!cont) output(`<span class="d">$ ${esc(L().cmd)}\n(no compiler output)</span>\n`);
  if (r.needAt >= 0) { setWaiting(true); lastOutput = full.slice(0, cut); lastError = ""; return; }
  if (r.err) { tw(ANSI.red + r.err.trimEnd() + ANSI.reset + "\n"); lastCol0 = true; }
  const hasErr = r.diag.some(i => i.kind !== "warning");
  if (r.diag.length) { setDiags(r.diag); for (const i of r.diag) tw(`${i.kind === "warning" ? ANSI.yellow : ANSI.red}${i.kind}${ANSI.reset}${i.line ? `${ANSI.dim} ${LANGS[lang].fileOf(code)}:${i.line}${i.col ? ":" + i.col : ""}${ANSI.reset}` : ""} ${i.msg}${i.hint ? `\n  ${ANSI.dim}${i.hint}${ANSI.reset}` : ""}\n`); lastCol0 = true; if (hasErr) showPanel("problems"); }
  const ok = r.rc === 0 && !hasErr;
  finishLine(`Process exited with code ${r.rc}${r.runtime ? " · " + r.runtime : ""}`, r.rc, ms, ok ? "ok" : "err");
  lastOutput = full.replace(/\x1b\[[0-9;]*m/g, "");
  lastError = r.diag.length ? r.diag.map(i => `${i.kind}${i.line ? " line " + i.line : ""}: ${i.msg}`).join("\n") + (r.raw ? "\n" + r.raw.slice(0, 1200) : "") : (r.err || (r.rc !== 0 ? lastOutput.slice(-600) : ""));
  $("s-time").textContent = `${ms < 1000 ? ms + " ms" : (ms / 1000).toFixed(1) + " s"} · exit ${r.rc}`;
  setStatus(ok ? "Finished" : "Failed", ok ? "ok" : "err");
  if (hasErr) showPanel("problems"); else term.focus();
}
async function runWandbox(code, stdin) {
  const d0 = L(), wb = d0.wandbox, marker = LANGS_EXTRA.NEED, cls = lang === "java" ? JAVA.classNameOf(code) : "prog";
  const trimmed = stdin.replace(/\n$/, "");
  let body;
  if (lang === "java") body = { compiler: wb.compiler, stdin: trimmed, "compiler-option-raw": "-encoding\nUTF-8", "runtime-option-raw": "-Dfile.encoding=UTF-8\n-Dstdout.encoding=UTF-8\n-Dstderr.encoding=UTF-8", code: `public class prog { public static void main(String[] a) throws Exception { ${cls}.main(a); } }`, codes: [{ file: cls + ".java", code }] };
  else {
    const shim = !eofMode;
    body = { compiler: wb.compiler, stdin: trimmed, code: (shim && wb.prepend ? wb.prepend : "") + (shim && wb.transform ? wb.transform(code) : code) };
    if (shim && wb.options) body["compiler-option-raw"] = wb.options; else if (!shim && wb.options) body["compiler-option-raw"] = wb.options.split("\n").filter(o => o !== "-include" && o !== "shim.h").join("\n");
    if (shim && wb.codes) body.codes = wb.codes();
  }
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), WANDBOX_TIMEOUT);
  let resp;
  try { resp = await fetch(WANDBOX, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal }); }
  catch (e) { throw new Error(e.name === "AbortError" ? "The compiler service did not respond within 40 s – try again." : "Cannot reach the compiler service (wandbox.org)."); }
  finally { clearTimeout(tm); }
  if (resp.status === 429) throw new Error("Too many requests – wait a moment.");
  if (!resp.ok) throw new Error("The compiler service responded with " + resp.status + ".");
  const d = await resp.json();
  const cmsg = (d.compiler_error || "").replace(/prog\.java:\d+: error:.*?\n.*?\n.*?\n/gs, "").replace(/^(?:In file included from )?shim\.h:.*(?:\n(?![^\s]).*)*\n?/gm, "").trim();
  const failed = /(^|\n)[^\n]*\b(error|Error)\b[: (]/.test(cmsg) && !(d.program_output || d.program_error);
  let perr = d.program_error || "", need = false;
  if (!eofMode && !failed) { if (perr.includes(marker)) { need = true; perr = perr.replace(marker, "").replace(/\n$/, ""); } else if (d0.need && d0.need.test(perr)) need = true; }
  const rc = failed ? 1 : +(d.status ?? -1);
  const diag = need ? [] : diagnose(cls.replace(/\$/g, "\\$"), cmsg, perr, d.signal, rc);
  const raw = [(d.compiler_output || "").trim(), cmsg, need ? "" : perr].filter(Boolean).join("\n");
  return { out: d.program_output || "", err: need || diag.length ? "" : perr, rc, needAt: need ? (d.program_output || "").length : -1, diag, raw };
}
const STALE = { printn: "println", printfn: "printfln", readline: "readln", readchar: "readch", global: "const (file level)" };
function runPil(code, stdin) {
  return new Promise((resolve, reject) => {
    if (worker) worker.terminate();
    worker = new Worker(`pil/worker.js?v=${encodeURIComponent(pilVer)}`);
    let raw = "", needAt = -1;
    worker.onmessage = e => {
      const d = e.data;
      if (d.t === "out") raw += d.s;
      else if (d.t === "need") { needAt = d.at; clearTimeout(runTimer); runTimer = setTimeout(() => { if (worker) { worker.terminate(); worker = null; } finish({ rc: 0 }); }, 400); }
      else if (d.t === "crash") { clearTimeout(runTimer); resolve({ out: raw, err: "", rc: -1, needAt: -1, raw: "", diag: [{ kind: "runtime", msg: "The interpreter crashed: " + d.s }] }); }
      else if (d.t === "done") finish(d);
    };
    function finish(d) {
      clearTimeout(runTimer);
      let body = raw, runtime = ""; const cut = body.lastIndexOf("\nExecution time:\n");
      if (cut >= 0) { const t = body.slice(cut + 1).match(/Runtime: ([\d.]+ms)/); runtime = t ? t[1] : ""; body = body.slice(0, cut); }
      const items = []; const re = /\x1b\[0;3[13]m(Error|Warning)\x1b\[0m: (.*?)(?: at prog\.pil:(\d+))?\.\n/g;
      const clean = body.replace(re, (all, kind, msg, line) => { items.push({ kind: kind === "Error" ? "error" : "warning", line: line ? +line : 0, col: 0, msg, hint: hintFor(msg) }); return ""; }).replace(/\x1b\[0;31mProgram exited with error code \d+\.\x1b\[0m\n?/, "");
      for (const it of items) { const s = it.msg.match(/No such function '([\w-]+)'/); if (s && STALE[s[1]]) it.hint = `In this PIL version it is called "${STALE[s[1]]}".`; }
      const isNeed = needAt >= 0 && needAt <= body.length;
      resolve({ out: isNeed ? body : clean, err: "", rc: d.rc, needAt: isNeed ? needAt : -1, runtime, raw: "", diag: isNeed ? [] : items });
    }
    worker.onerror = e => { clearTimeout(runTimer); reject(new Error(e.message || "Worker error")); };
    runTimer = setTimeout(() => { if (worker) { worker.terminate(); worker = null; } resolve({ out: raw, err: "", rc: -1, needAt: -1, raw: "", diag: [{ kind: "runtime", msg: `Stopped after ${PIL_TIMEOUT / 1000} s – infinite loop?` }] }); }, PIL_TIMEOUT);
    worker.postMessage({ code, stdin, eof: eofMode });
  });
}

/* ================= save / saved works ================= */
function openSave() { if (activeTab.kind !== "file") return toast("This code is already saved", "info"); if (!editor.getValue().trim()) return; $("m-title").value = $("m-title").value || L().fileOf(editor.getValue()).replace(/\.\w+$/, ""); $("m-author").value = localStorage.getItem("java-author") || ""; $("m-key").value = sessionStorage.getItem("java-key") || accessKey() || ""; $("m-msg").textContent = "Saved code is public and cannot be edited afterwards."; $("m-msg").className = "msg"; $("save-bg").classList.add("on"); $("m-title").focus(); }
$("save").onclick = openSave;
$("m-cancel").onclick = () => $("save-bg").classList.remove("on");
document.querySelectorAll(".modal-bg").forEach(m => m.onclick = e => { if (e.target === m) m.classList.remove("on"); });
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT") { const m = e.target.closest(".modal-bg.on"); if (m) m.querySelector(".btn.pri").click(); } if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.target.closest(".monaco-editor")) { e.preventDefault(); run(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); openSave(); } if ((e.ctrlKey || e.metaKey) && e.key === "`") { e.preventDefault(); showPanel("terminal"); } });
$("m-ok").onclick = async () => {
  const title = $("m-title").value.trim(), author = $("m-author").value.trim(), key = $("m-key").value, msg = $("m-msg");
  if (!title) return msg.textContent = "A title is required.", msg.className = "msg err";
  if (!key) return msg.textContent = "The class access code is required.", msg.className = "msg err";
  $("m-ok").disabled = true; msg.textContent = "Saving…"; msg.className = "msg";
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_snippet`, { method: "POST", headers: { ...HEAD, "Content-Type": "application/json" }, body: JSON.stringify({ p_title: title, p_author: author, p_code: editor.getValue(), p_passkey: key, p_lang: lang }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.message || "error");
    localStorage.setItem("java-author", author); sessionStorage.setItem("java-key", key);
    $("save-bg").classList.remove("on"); $("m-title").value = ""; toast("Saved to the class archive", "ok");
    await loadSaved(); if (currentView === "saved") renderSaved(); openSnippet(d);
  } catch (e) { msg.textContent = e.message === "Nepareiza atslēga" ? "Incorrect access code." : "Could not save: " + e.message; msg.className = "msg err"; }
  $("m-ok").disabled = false;
};
async function openSnippet(id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/snippets?id=eq.${encodeURIComponent(id)}&select=*`, { headers: HEAD }); const [s] = await r.json();
  if (!s) return toast("Saved work not found", "error");
  let t = tabs.find(x => x.kind === "snippet" && x.data.id === s.id);
  if (!t) { const l = s.lang || "java"; t = { id: "snip:" + s.id, kind: "snippet", lang: l, data: s, model: monaco.editor.createModel(s.code, LANGS[l].monaco) }; tabs.push(t); }
  viewing = s; activate(t);
  $("viewmeta").innerHTML = `<b>${esc(s.title)}</b> · ${esc(s.author || "anonymous")} · ${fmtTime(s.created_at)} · read-only`;
  if (currentView === "saved") renderSaved();
}
$("fork").onclick = () => { const t = activeTab; if (t.kind === "file") return; const code = t.model.getValue(); const l = t.lang; openFile(l); if (editor.getValue().trim() && editor.getValue() !== LANGS[l].template && !confirm("Replace your current code with a copy of this file?")) return; editor.setValue(code); toast("Copy opened for editing", "ok"); };
$("copylink").onclick = () => copyText(location.href, "Link copied");

/* ================= live coding ================= */
function openLiveModal() { if (liveHost) return; if (activeTab.kind !== "file") openFile(lang); $("l-title").value = $("l-title").value || L().fileOf(editor.getValue()).replace(/\.\w+$/, ""); $("l-author").value = localStorage.getItem("java-author") || ""; $("l-pass").value = ""; $("l-key").value = sessionStorage.getItem("java-key") || accessKey() || ""; $("l-msg").textContent = "Viewers see your code update in real time. With a password the code is encrypted end-to-end."; $("l-msg").className = "msg"; $("live-bg").classList.add("on"); $("l-title").focus(); }
$("l-cancel").onclick = () => $("live-bg").classList.remove("on");
$("l-ok").onclick = async () => {
  const title = $("l-title").value.trim(), author = $("l-author").value.trim(), password = $("l-pass").value, passkey = $("l-key").value, msg = $("l-msg");
  if (!title) return msg.textContent = "A title is required.", msg.className = "msg err";
  if (!passkey) return msg.textContent = "The class access code is required.", msg.className = "msg err";
  $("l-ok").disabled = true; msg.textContent = "Starting…"; msg.className = "msg";
  try {
    const h = LIVE.host({ title, author, lang, password, passkey, getCode: () => editor.getValue() }); h.title = title;
    h.state.onError = e => setStatus("Live: " + e.message, "err");
    const id = await h.start(); liveHost = h;
    localStorage.setItem("java-author", author); sessionStorage.setItem("java-key", passkey);
    $("live-bg").classList.remove("on"); $("s-live").hidden = false; $("live-dot").hidden = false;
    toast("Live session started · viewer link copied", "ok"); try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}?live=${id}`); } catch (e) {}
    if (currentView === "live") renderSidebar();
  } catch (e) { msg.textContent = e.message === "Nepareiza atslēga" ? "Incorrect access code." : "Could not start: " + e.message; msg.className = "msg err"; }
  $("l-ok").disabled = false;
};
async function endLive() { if (!liveHost) return; const h = liveHost; liveHost = null; await h.end(); $("s-live").hidden = true; toast("Live session ended", "info"); if (currentView === "live") renderSidebar(); }
$("s-live").onclick = () => { currentView = "live"; sbOpen = true; $("sidebar").hidden = false; document.querySelectorAll(".act[data-view]").forEach(x => x.classList.toggle("on", x.dataset.view === "live")); renderSidebar(); };
$("live-end").onclick = endLive;
addEventListener("pagehide", () => { if (liveHost) liveHost.end(true); });
async function openLive(id) {
  if (liveView) { liveView.close(); liveView = null; }
  let tab = null;
  const v = LIVE.view(id, {
    onMeta: s => { if (!tab) return; $("viewmeta").innerHTML = `<b>${esc(s.title)}</b> · ${esc(s.author || "anonymous")} · ${LIVE.active(s) ? `<span class="live-pill">${ico("circle-filled")}LIVE</span>` : "session ended"}${s.protected ? " · " + ico("lock") : ""}`; },
    onCode: (code, s) => { if (!tab) return; const l = s.lang || "java"; if (tab.lang !== l) { tab.lang = l; monaco.editor.setModelLanguage(tab.model, LANGS[l].monaco); if (tab === activeTab) { lang = l; renderLangUI(); } } if (tab.model.getValue() !== code) { const pos = editor.getPosition(); tab.model.setValue(code); if (tab === activeTab && pos) editor.setPosition(pos); } tab.data.title = s.title; renderTabs(); if (tab === activeTab) updateTitle(); },
    onEnd: () => { if (tab === activeTab) setStatus("Live session ended", "err"); $("lock-bg").classList.remove("on"); },
    onLocked: wrong => { $("lock-title").textContent = (v.session?.title || "") + " · " + (v.session?.author || ""); $("lock-msg").textContent = wrong ? "Incorrect password." : ""; $("lock-msg").className = "msg err"; $("lock-bg").classList.add("on"); $("lock-pass").value = ""; $("lock-pass").focus(); },
  });
  try {
    const s = await v.open(); liveView = v;
    const l = s.lang || "java";
    tab = { id: "live:" + id, kind: "live", lang: l, data: { id, title: s.title }, model: monaco.editor.createModel(s.protected ? "" : (s.code || ""), LANGS[l].monaco) };
    tabs.push(tab); activate(tab); await v.open();
  } catch (e) { toast(e.message, "error"); }
}
$("lock-cancel").onclick = () => { $("lock-bg").classList.remove("on"); const t = tabs.find(x => x.kind === "live" && liveView && x.data.id === (liveView.session || {}).id); if (t) closeTab(t); };
$("lock-ok").onclick = async () => { const p = $("lock-pass").value; if (!p || !liveView) return; $("lock-msg").textContent = "Checking…"; $("lock-msg").className = "msg"; const ok = await liveView.unlock(p); if (ok) $("lock-bg").classList.remove("on"); };

/* ================= AI chat ================= */
let aiModels = [], aiModel = localStorage.getItem("java-ai-model") || "", aiBusy = false, aiHistory = [];
function setModel(id) { aiModel = id; localStorage.setItem("java-ai-model", id); $("model-name").textContent = (aiModels.find(m => m.id === id) || {}).name || "model"; }
async function loadModels() {
  try { const r = await fetch(`${AI_PROXY}/models`, { headers: { "X-Access-Key": accessKey() } }); if (!r.ok) throw 0; const info = await r.json(); aiModels = info.models || []; }
  catch (e) { aiModels = []; }
  if (!aiModels.some(m => m.id === aiModel)) aiModel = aiModels[0]?.id || "";
  setModel(aiModel); if (!aiModels.length) $("model-name").textContent = "pollinations";
}
function toggleAI(open) { const a = $("aux"); a.hidden = open === undefined ? !a.hidden : !open; $("ai-toggle").classList.toggle("on", !a.hidden); localStorage.setItem("ai-open", a.hidden ? "0" : "1"); if (!a.hidden) { if (!$("chat").children.length) addMsg("a", `Hi! I can see your code, the input you typed and the last output. Ask me anything about it, or use the quick actions below. <span class="thinking">Free models – always verify by running the code.</span>`); $("ai-q").focus(); } }
$("ai-toggle").onclick = () => toggleAI(); $("aux-close").onclick = () => toggleAI(false);
async function aiChat(messages) {
  try { const r = await fetch(`${AI_PROXY}/chat`, { method: "POST", headers: { "Content-Type": "text/plain", "X-Access-Key": accessKey() }, body: JSON.stringify({ model: aiModel, messages }) }); const d = await r.json(); if (r.ok && d.content) return { content: d.content, model: d.model }; } catch (e) {}
  const body = JSON.stringify({ model: "openai", messages, temperature: 0.3 });
  for (let a = 0; a < 2; a++) { try { const r = await fetch(AI_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body }); if (r.ok) { const d = await r.json(); const c = d.choices?.[0]?.message?.content; if (c) return { content: c, model: "pollinations" }; } } catch (e) {} await new Promise(r => setTimeout(r, 1500)); }
  throw new Error("The AI service is not reachable right now.");
}
function ctx() { const stdin = stdinBuf.trim(); return `Language: ${L().name}. Current code (${L().fileOf(editor.getValue())}):\n\`\`\`${lang}\n${editor.getValue()}\n\`\`\`${stdin ? `\nInput (stdin) the user typed:\n${stdin}` : ""}${lastError ? `\nLast error:\n${lastError.slice(0, 1500)}` : ""}${lastOutput && !lastError ? `\nLast output:\n${lastOutput.slice(0, 800)}` : ""}${waiting ? "\nThe program is currently waiting for input." : ""}`; }
function renderMd(s) { const parts = s.split(/```[a-zA-Z#+]*\n?([\s\S]*?)```/g); return parts.map((p, i) => i % 2 ? `<pre>${esc(p.trim())}<button class="ins" data-code="${encodeURIComponent(p.trim())}">${ico("edit")}Insert</button></pre>` : esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>")).join(""); }
const isWholeFile = code => lang === "java" ? /class\s+\w+/.test(code) && code.includes("main(") : lang === "pil" ? /^\s*main\s*\(\s*\)/m.test(code) : lang === "python" || lang === "lua" ? code.split("\n").length > 3 : /\bmain\b/.test(code);
function addMsg(role, html) { const m = document.createElement("div"); m.className = "msg " + (role === "u" ? "u" : "a"); m.innerHTML = (role === "a" ? `<span class="av">${ico("hubot")}</span>` : "") + `<div class="bub">${html}</div>`; $("chat").appendChild(m); $("chat").scrollTop = $("chat").scrollHeight; return m.querySelector(".bub"); }
async function ask(userText, shown) {
  if (aiBusy) return; aiBusy = true; $("ai-send").disabled = true; toggleAI(true);
  addMsg("u", esc(shown || userText)); const a = addMsg("a", '<span class="thinking">Thinking…</span>');
  try {
    const res = await aiChat([{ role: "system", content: PROMPTS.system(lang, PIL.DOC_TEXT) }, ...aiHistory.slice(-6), { role: "user", content: userText + "\n\n" + ctx() }]);
    aiHistory.push({ role: "user", content: shown || userText }, { role: "assistant", content: res.content });
    a.innerHTML = renderMd(res.content) + `<span class="prov">${esc(res.model)}</span>`;
    a.querySelectorAll(".ins").forEach(b => b.onclick = () => { const code = decodeURIComponent(b.dataset.code); if (activeTab.kind !== "file") openFile(lang); if (isWholeFile(code)) { if (confirm("Replace the whole file with this code?")) editor.setValue(code); } else editor.executeEdits("ai", [{ range: editor.getSelection(), text: code }]); editor.focus(); });
  } catch (e) { a.innerHTML = `<span style="color:var(--error)">${esc(e.message)}</span>`; }
  aiBusy = false; $("ai-send").disabled = false; $("chat").scrollTop = $("chat").scrollHeight;
}
document.querySelectorAll(".chips button").forEach(b => b.onclick = () => { const [q, label] = PROMPTS.QUICK[b.dataset.q]; if (b.dataset.q === "err" && !lastError) return toast("Run the code first – there is no error to explain", "info"); ask(q, label); });
$("ai-send").onclick = () => { const v = $("ai-q").value.trim(); if (!v) return; $("ai-q").value = ""; $("ai-q").style.height = ""; ask(v); };
$("ai-q").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("ai-send").click(); } });
$("ai-q").addEventListener("input", e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; });

/* ================= boot ================= */
async function boot() {
  await bootMonaco(); bootTerm();
  const params = new URLSearchParams(location.search);
  const start = params.get("lang") || localStorage.getItem("code-lang") || "java";
  openFile(LANGS[start] ? start : "java", { focus: false });
  if (params.get("view") === "saved") { currentView = "saved"; document.querySelectorAll(".act[data-view]").forEach(x => x.classList.toggle("on", x.dataset.view === "saved")); }
  renderSidebar();
  if (localStorage.getItem("ai-open") === "1" && innerWidth > 900) toggleAI(true);
  loadModels();
  if (params.get("id")) openSnippet(params.get("id")); else if (params.get("live")) openLive(params.get("live"));
  LIVE.listActive().then(items => { $("live-dot").hidden = !items.length; }).catch(() => {});
}
window.__28 = { get term() { return term; }, get editor() { return editor; }, run };
UI.requireAccess(boot, { sub: "2.k. 28.grupa · enter the class access code" });
})();
