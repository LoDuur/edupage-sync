import { $, esc, icon, store, toast, mod, relativeTime, absoluteTime, copyText } from "./util.js";
import { openMenu, openModal, confirmDialog, openPalette, makeResizer } from "./ui.js";
import { createApi, checkAccess, workspaceKey } from "./api.js";
import { settings, layout, LAYOUT_DEFAULTS, saveLayout, onSettings, updateSettings, resolvedTheme, openSettings, openShortcuts } from "./settings.js";
import { LANGUAGE_META } from "./languages.js";
import { loadMonaco, createEditor, setProblems, revealLine, getMonaco } from "./editor.js";
import { createTerminal } from "./terminal.js";
import { createRemoteTerminal } from "./remote.js";
import { socketLive, pollingLive } from "./live.js";
import { createWorkspace } from "./workspace.js";
import { createAssistant } from "./assistant.js";
import { diagnose, exitReason } from "./diagnose.js";

const VISIBILITY = {
  private: { label: "Private", description: "Only you can open it.", icon: icon.lock },
  link: { label: "Anyone with the link", description: "Classmates and teachers can open the link.", icon: icon.link },
  public: { label: "Public", description: "Listed under Class gallery for everyone in the class.", icon: icon.globe },
};

const shareUrl = id => `${location.origin}${location.pathname}?p=${encodeURIComponent(id)}`;

async function gate() {
  const saved = store.get("access", "");
  if (saved && await checkAccess(saved)) return saved;
  $("boot").hidden = true; $("gate").hidden = false; $("gate-input").focus();
  return new Promise(resolve => {
    $("gate-form").onsubmit = async e => {
      e.preventDefault();
      const key = $("gate-input").value.trim().toUpperCase(); if (!key) return;
      const ok = await checkAccess(key);
      if (ok) { store.set("access", key); $("gate").hidden = true; resolve(key); }
      else $("gate-error").textContent = ok === null ? "Cannot reach the workspace server. Try again in a moment." : "That code is not correct. Check it with your teacher.";
    };
  });
}

function applyTheme() { document.documentElement.dataset.theme = resolvedTheme(); }

async function main() {
  applyTheme();
  onSettings(applyTheme);
  const accessKey = await gate();
  $("boot").hidden = false; $("boot").textContent = "Loading workspace…";
  const api = createApi(accessKey);
  const [config] = await Promise.all([api.get("/api/config"), loadMonaco()]);
  const languages = config.languages.filter(l => LANGUAGE_META[l.id]);
  const languageById = Object.fromEntries(languages.map(l => [l.id, l]));
  const app = $("app");
  $("boot").hidden = true; app.hidden = false;

  for (const [id, svg] of Object.entries({ "toggle-side": icon.sidebar, "toggle-aside": icon.aside, more: icon.more, "new-project": icon.plus, "term-rerun": icon.rerun, "term-copy": icon.copy, "term-clear": icon.clear, "term-restart": icon.restart, "term-hide": icon.hide })) $(id).innerHTML = svg;
  document.querySelector(".search-icon").innerHTML = icon.search;
  $("search-kbd").textContent = `${mod}P`;
  $("open-settings").innerHTML = `${icon.settings}<span>Settings</span>`;
  $("open-shortcuts").innerHTML = `${icon.keyboard}<span>Shortcuts</span>`;
  const tips = { "toggle-side": `Sidebar (${mod}B)`, "toggle-aside": `Side panel (${mod}Alt+B)`, more: "More", "new-project": "New project", "term-rerun": "Rerun", "term-copy": "Copy output", "term-clear": "Clear terminal", "term-restart": "Restart terminal", "term-hide": `Hide panel (${mod}J)` };
  for (const [id, tip] of Object.entries(tips)) $(id).title = tip;

  const editor = createEditor($("editor"));
  const remote = config.sandbox.mode === "remote";
  const socket = remote ? null : window.io({ auth: { key: accessKey, owner: workspaceKey() }, transports: ["websocket", "polling"] });
  const workspace = createWorkspace({ api, live: remote ? pollingLive(api) : socketLive(socket), editor });

  const isNarrow = () => innerWidth < 760;
  if (isNarrow()) Object.assign(layout, { sideOn: false, asideOn: false });
  const applyLayout = () => {
    app.style.setProperty("--w-side", layout.side + "px");
    app.style.setProperty("--w-aside", layout.aside + "px");
    app.style.setProperty("--h-term", layout.term + "px");
    app.dataset.side = layout.sideOn ? "on" : "off";
    app.dataset.aside = layout.asideOn ? "on" : "off";
    app.dataset.term = layout.termOn ? "on" : "off";
    $("toggle-side").classList.toggle("on", layout.sideOn);
    $("toggle-aside").classList.toggle("on", layout.asideOn);
    for (const t of document.querySelectorAll(".tab[data-aside]")) { const on = t.dataset.aside === layout.asideTab; t.classList.toggle("on", on); t.setAttribute("aria-selected", on); $("aside-" + t.dataset.aside).hidden = !on; }
    if (!isNarrow()) saveLayout();
    requestAnimationFrame(() => terminal?.fit());
  };
  const togglePanel = key => { layout[key + "On"] = !layout[key + "On"]; applyLayout(); };
  const showAside = tab => { layout.asideOn = true; layout.asideTab = tab; applyLayout(); if (tab === "history") renderHistory(); if (tab === "assistant") assistant.focus(); };
  const resetLayout = () => { Object.assign(layout, LAYOUT_DEFAULTS); applyLayout(); toast("Layout reset"); };
  const clamp = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)));
  makeResizer($("split-side"), { axis: "x", get: () => layout.side, set: v => { layout.side = clamp(v, 180, innerWidth * 0.4); applyLayout(); } });
  makeResizer($("split-aside"), { axis: "x", invert: true, get: () => layout.aside, set: v => { layout.aside = clamp(v, 280, innerWidth * 0.5); applyLayout(); } });
  makeResizer($("split-term"), { axis: "y", invert: true, get: () => layout.term, set: v => { layout.term = clamp(v, 100, innerHeight - 220); applyLayout(); } });
  $("toggle-side").onclick = () => togglePanel("side");
  $("toggle-aside").onclick = () => togglePanel("aside");
  $("term-hide").onclick = () => togglePanel("term");
  for (const t of document.querySelectorAll(".tab[data-aside]")) t.onclick = () => showAside(t.dataset.aside);

  let bottomTab = "terminal";
  const showBottomTab = tab => {
    bottomTab = tab;
    for (const t of document.querySelectorAll(".tab[data-tab]")) { const on = t.dataset.tab === tab; t.classList.toggle("on", on); t.setAttribute("aria-selected", on); }
    $("problems").hidden = tab !== "problems";
    $("terminal").style.visibility = tab === "terminal" ? "visible" : "hidden";
    if (tab === "terminal") terminal.focus();
  };
  for (const t of document.querySelectorAll(".tab[data-tab]")) t.onclick = () => showBottomTab(t.dataset.tab);

  let problems = [], elapsedTimer = 0, lastOutcome = null;
  const fileOf = project => LANGUAGE_META[project.language]?.file || "main.txt";
  const terminal = (remote ? createRemoteTerminal : createTerminal)({
    element: $("terminal"), socket,
    onStatus: renderSandbox,
    onRunState: run => { if (run.phase === "finished") onRunFinished(run); renderRun(run); },
    onLink: (line, column) => revealLine(editor, line, column),
  });

  function renderSandbox(state, message) {
    const map = { connecting: ["wait", "Connecting"], creating: ["wait", "Starting terminal"], attached: ["ok", remote ? "Runs on wandbox.org" : config.sandbox.mode === "off" ? "Terminal ready (no sandbox)" : "Terminal ready"], exited: ["", "Terminal stopped"], limit: ["err", "Terminal limit reached"], error: ["err", "Terminal unavailable"], disconnected: ["wait", "Reconnecting"] };
    const [dot, text] = map[state] || ["", state];
    $("sandbox-dot").className = "dot " + dot;
    $("sandbox-text").textContent = text;
    const overlay = $("term-overlay");
    overlay.hidden = state === "attached";
    if (state === "creating" || state === "connecting") overlay.innerHTML = `<p class="muted">${esc(text)}…</p>`;
    else if (!overlay.hidden) overlay.innerHTML = `<div class="empty-state small">${icon.terminal}<p>${esc(message || text)}</p>${state === "exited" || state === "limit" ? '<button class="btn sm" data-restart>Restart terminal</button>' : ""}</div>`;
    overlay.querySelector("[data-restart]")?.addEventListener("click", () => terminal.restart());
    renderRunButton();
  }

  const OUTCOME_TEXT = { success: ["ok", "Finished"], "compile-error": ["err", "Compilation failed"], "runtime-error": ["err", "Runtime error"], stopped: ["muted", "Stopped"], limit: ["warn", "Limit reached"], system: ["info", "Could not run"] };
  const seconds = ms => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  function renderRun(run) {
    const el = $("run-status"), line = $("runline");
    clearInterval(elapsedTimer);
    if (["pending", "compiling", "running", "waiting"].includes(run.phase)) {
      const label = { compiling: "Compiling", running: "Running", waiting: "Waiting for input", pending: "Starting" }[run.phase];
      line.dataset.state = run.phase === "compiling" ? "compiling" : "running";
      const tick = () => { el.innerHTML = `<span class="dot ${run.phase === "compiling" ? "warn" : "ok"} pulse"></span><span>${label}</span>${run.startedAt ? `<span class="muted">${seconds(Date.now() - run.startedAt)}</span>` : ""}`; };
      tick(); elapsedTimer = setInterval(tick, 100);
    } else if (lastOutcome) {
      const [kind, text] = OUTCOME_TEXT[lastOutcome.outcome];
      line.dataset.state = kind;
      const detail = lastOutcome.outcome === "success" ? "" : lastOutcome.outcome === "limit" ? exitReason(lastOutcome.exitCode) : lastOutcome.outcome === "stopped" ? "" : `exit code ${lastOutcome.exitCode}`;
      const duration = lastOutcome.startedAt ? seconds(lastOutcome.endedAt - (lastOutcome.runAt || lastOutcome.startedAt)) : "";
      el.innerHTML = `<span class="dot ${kind}"></span><span>${text}</span>${detail ? `<span class="muted">${esc(detail)}</span>` : ""}${duration ? `<span class="muted">${duration}</span>` : ""}`;
    } else { line.dataset.state = ""; el.innerHTML = ""; }
    renderRunButton();
  }

  function onRunFinished(run) {
    lastOutcome = run;
    const project = workspace.state.current;
    if (!project || !run.file || run.file !== fileOf(project)) return;
    problems = run.outcome === "success" || run.outcome === "stopped" ? [] : diagnose(run.language, run.output, { exitCode: run.exitCode, file: run.file });
    setProblems(workspace.model, problems);
    renderProblems();
    if (problems.some(p => p.line > 0) && run.outcome !== "limit") revealLine(editor, problems.find(p => p.line > 0).line, problems.find(p => p.line > 0).column);
  }

  function renderProblems() {
    const count = $("problem-count");
    count.hidden = !problems.length; count.textContent = problems.length;
    $("problems").innerHTML = problems.length
      ? problems.map((p, i) => `<button class="problem" data-i="${i}"><span class="problem-kind ${p.kind}">${p.kind === "warning" ? "Warning" : p.kind === "runtime" ? "Runtime" : "Error"}</span><span class="problem-msg">${esc(p.message)}${p.hint ? `<span class="muted">${esc(p.hint)}</span>` : ""}</span>${p.line ? `<span class="problem-loc">Line ${p.line}</span>` : ""}</button>`).join("")
      : `<div class="empty-state small">${icon.check}<p>No problems from the last run.</p></div>`;
  }
  $("problems").addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) { const p = problems[+b.dataset.i]; revealLine(editor, p.line, p.column); } });
  renderProblems();

  const isRunning = () => terminal.run.phase !== "idle";
  function renderRunButton() {
    const project = workspace.state.current, button = $("run");
    const running = isRunning();
    const available = project && languageById[project.language]?.available;
    button.disabled = !project || (!running && (terminal.status !== "attached" || !available));
    button.classList.toggle("stop", running);
    button.innerHTML = running ? `${icon.stop}<span>Stop</span>` : `${icon.play}<span>Run</span><kbd>${mod}↵</kbd>`;
    button.title = !project ? "Open a project first" : !available ? `${languageById[project.language]?.name || project.language} is not installed on this server` : terminal.status !== "attached" ? "The terminal is not ready" : running ? "Stop the program (sends Ctrl+C)" : `Run ${fileOf(project)}`;
  }
  function runTarget() { const p = workspace.state.current; return p && { language: p.language, file: fileOf(p), code: workspace.model.getValue() }; }
  function run() {
    if (isRunning()) return terminal.stop();
    const target = runTarget(); if (!target) return;
    if (!languageById[target.language]?.available) return toast(`${languageById[target.language]?.name || target.language} is not installed on this server.`, "error");
    if (!layout.termOn) togglePanel("term");
    showBottomTab("terminal");
    problems = []; setProblems(workspace.model, []); renderProblems();
    if (workspace.isDirty()) workspace.save();
    terminal.start(target);
  }
  const rerun = () => { const target = runTarget(); if (target) terminal.rerun(target); };
  $("run").onclick = run;
  $("term-rerun").onclick = rerun;
  $("term-copy").onclick = () => terminal.copyOutput();
  $("term-clear").onclick = () => terminal.clear();
  $("term-restart").onclick = () => terminal.restart();
  editor.onDidChangeCursorPosition(e => { $("status-pos").textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`; });

  const saveNow = async () => { if (!workspace.state.current?.canEdit) return toast("This project is read-only."); await workspace.save(); if (workspace.state.saveState === "saved") toast("Saved"); };
  function renderSaveState() {
    const s = workspace.state, el = $("save-state");
    const text = { idle: "", saved: s.savedAt ? `Saved ${relativeTime(s.savedAt)}` : "Saved", dirty: settings.autosave ? "Unsaved changes" : `Unsaved – ${mod}S to save`, saving: "Saving…", error: `Not saved: ${s.saveError}`, conflict: "Newer version saved elsewhere", readonly: s.current ? `Updated ${relativeTime(s.current.updatedAt)}` : "" }[s.saveState];
    el.textContent = text; el.dataset.state = s.saveState;
    el.title = s.savedAt ? absoluteTime(s.savedAt) : "";
    document.title = (workspace.isDirty() ? "• " : "") + (s.current ? `${s.current.title} – 28teh` : "28teh");
    renderBanner();
  }
  setInterval(() => { if (["saved", "readonly"].includes(workspace.state.saveState)) renderSaveState(); }, 30_000);

  function renderBanner() {
    const s = workspace.state, p = s.current, el = $("banner");
    if (s.saveState === "conflict") {
      el.hidden = false; el.dataset.kind = "warn";
      el.innerHTML = `<span>${icon.alert}Someone saved a newer version of this project while you were editing.</span><span class="grow"></span><button class="btn sm" data-theirs>Load their version</button><button class="btn sm primary" data-mine>Keep mine</button>`;
      el.querySelector("[data-theirs]").onclick = () => workspace.resolveConflict(true);
      el.querySelector("[data-mine]").onclick = () => workspace.resolveConflict(false);
    } else if (p && !p.isOwner) {
      el.hidden = false; el.dataset.kind = "info";
      el.innerHTML = `<span>${p.canEdit ? icon.eye : icon.lock}${p.canEdit ? `Shared with edit access${p.author ? ` by ${esc(p.author)}` : ""}. Your changes are saved to their project.` : `Read-only project${p.author ? ` by ${esc(p.author)}` : ""}. Changes by the owner appear live.`}</span><span class="grow"></span><button class="btn sm" data-fork>${icon.fork}<span>Duplicate to my projects</span></button>`;
      el.querySelector("[data-fork]").onclick = () => workspace.duplicate();
    } else el.hidden = true;
  }

  function renderHeader() {
    const p = workspace.state.current;
    const title = $("title");
    title.disabled = !p?.isOwner;
    if (document.activeElement !== title) title.value = p?.title || "";
    $("crumb-lesson").hidden = !p?.lesson;
    $("crumb-lesson").textContent = p?.lesson || "";
    const lang = p && languageById[p.language];
    $("language").disabled = !p?.isOwner;
    $("language").innerHTML = p ? `<span>${esc(lang?.name || p.language)}</span>${p.isOwner ? icon.chevron : ""}` : "<span>Language</span>";
    $("share").disabled = !p;
    $("share").innerHTML = `${p ? VISIBILITY[p.visibility].icon : icon.share}<span>Share</span>`;
    const badge = $("badge");
    badge.hidden = !p || p.visibility === "private";
    if (p) badge.textContent = !p.isOwner ? (p.canEdit ? "Shared, editable" : "Read-only") : p.editable ? "Shared, editable" : p.visibility === "public" ? "Public" : "Shared";
    $("status-lang").textContent = lang?.name || "";
    const model = workspace.model;
    $("status-indent").textContent = model ? `Spaces: ${model.getOptions().tabSize}` : "";
    $("status-live").hidden = !p || (p.isOwner && p.visibility === "private");
    $("status-live").innerHTML = `<span class="dot ok"></span>Live`;
    $("status-live").title = p?.isOwner ? "People who open the link see your saved changes as you type." : "You see the owner's changes as they save.";
    $("editor-empty").hidden = !!p;
    renderRunButton(); renderSaveState(); renderDetails();
  }

  const commitTitle = () => { const p = workspace.state.current, v = $("title").value.trim(); if (p?.isOwner && v && v !== p.title) workspace.updateMeta({ title: v }); else $("title").value = p?.title || ""; };
  $("title").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("title").blur(); } if (e.key === "Escape") { $("title").value = workspace.state.current?.title || ""; $("title").blur(); } });
  $("title").addEventListener("blur", commitTitle);
  $("crumb-lesson").onclick = () => { $("search").value = workspace.state.current?.lesson || ""; renderList(); if (!layout.sideOn) togglePanel("side"); };

  const languageItems = (current, choose) => languages.map(l => ({ label: l.name, hint: l.available ? "." + l.ext : "not installed", on: l.id === current, run: () => choose(l.id) }));
  $("language").onclick = e => {
    const p = workspace.state.current; if (!p?.isOwner) return;
    openMenu(e.currentTarget, languageItems(p.language, async id => {
      if (id === p.language) return;
      const model = workspace.model, isTemplate = model.getValue().trim() === (LANGUAGE_META[p.language]?.template || "").trim() || !model.getValue().trim();
      await workspace.updateMeta({ language: id });
      if (isTemplate) model.setValue(LANGUAGE_META[id].template);
    }), { align: "right" });
  };

  $("share").onclick = () => openShare();
  function openShare() {
    const p = workspace.state.current; if (!p) return;
    const url = shareUrl(p.id);
    const body = document.createElement("div");
    body.className = "form";
    const linkRow = `<div class="inline"><input class="input mono" readonly value="${esc(url)}" aria-label="Share link"><button class="btn primary" data-copy>${icon.copy}<span>Copy link</span></button></div>`;
    if (!p.isOwner) {
      body.innerHTML = `<p class="muted">${p.canEdit ? "You can edit this shared project. Changes are saved to the owner's copy." : "This project is read-only for you."}</p>${linkRow}<button class="btn" data-fork>${icon.fork}<span>Duplicate to my projects</span></button>`;
      body.querySelector("[data-fork]").onclick = () => { modal.close(); workspace.duplicate(); };
    } else {
      body.innerHTML = `
        <fieldset class="choices">${Object.entries(VISIBILITY).map(([k, v]) => `<label class="choice"><input type="radio" name="visibility" value="${k}" ${p.visibility === k ? "checked" : ""}><span class="choice-icon">${v.icon}</span><span><b>${v.label}</b><span class="muted">${v.description}</span></span></label>`).join("")}</fieldset>
        <label class="check"><input type="checkbox" name="editable" ${p.editable ? "checked" : ""} ${p.visibility === "private" ? "disabled" : ""}><span>Let people with the link edit the code</span></label>
        <div data-link ${p.visibility === "private" ? "hidden" : ""}>${linkRow}<p class="muted small">Viewers see your changes live, a moment after each save. They can duplicate the project into their own workspace.</p></div>`;
      body.addEventListener("change", async e => {
        const fields = e.target.name === "visibility" ? { visibility: e.target.value } : { editable: e.target.checked };
        const updated = await workspace.updateMeta(fields); if (!updated) return;
        body.querySelector("[data-link]").hidden = updated.visibility === "private";
        body.querySelector("[name=editable]").disabled = updated.visibility === "private";
      });
    }
    body.querySelector("[data-copy]").onclick = async () => { if (await copyText(url)) toast("Link copied"); };
    const modal = openModal({ title: `Share “${p.title}”`, body });
  }

  const newProjectMenu = anchor => openMenu(anchor, [{ heading: "New project" }, ...languageItems(null, id => workspace.create({ language: id, title: `Untitled ${languageById[id].name}` }))], { align: "left" });
  $("new-project").onclick = e => newProjectMenu(e.currentTarget);
  $("search").addEventListener("input", renderList);
  $("search").addEventListener("keydown", e => { if (e.key === "Escape") { $("search").value = ""; renderList(); editor.focus(); } if (e.key === "Enter") $("project-list").querySelector(".project")?.click(); });
  let galleryOpen = store.get("gallery-open", false);

  function rowHtml(p, { owned }) {
    const lang = languageById[p.language], active = workspace.state.current?.id === p.id;
    const dirty = active && workspace.isDirty();
    return `<div class="project${active ? " on" : ""}" role="button" tabindex="0" data-id="${esc(p.id)}" ${active ? 'aria-current="true"' : ""} title="${esc(p.title)}${p.updatedAt ? `\nUpdated ${absoluteTime(p.updatedAt)}` : ""}">
      <span class="ext">${esc(lang?.ext || p.language)}</span><span class="project-title">${esc(p.title)}</span>
      ${dirty ? '<span class="dirty" title="Unsaved changes"></span>' : owned && p.visibility !== "private" ? `<span class="vis" title="${esc(VISIBILITY[p.visibility].label)}">${VISIBILITY[p.visibility].icon}</span>` : ""}
      <span class="project-meta">${p.updatedAt ? esc(relativeTime(p.updatedAt)) : esc(p.author || "")}</span>
      <button class="ibtn sm row-more" data-row-menu="${esc(p.id)}" data-owned="${owned ? 1 : 0}" aria-label="Actions for ${esc(p.title)}">${icon.more}</button></div>`;
  }

  function renderList() {
    const s = workspace.state, query = $("search").value.trim().toLowerCase();
    const matches = p => !query || [p.title, p.lesson, p.language, p.author, languageById[p.language]?.name].some(v => (v || "").toLowerCase().includes(query));
    const mine = s.mine.filter(matches), groups = new Map();
    for (const p of mine) { const key = p.lesson || ""; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); }
    const ordered = [...groups.entries()].sort(([a], [b]) => (a === "") - (b === "") || 0);
    let html = "";
    if (s.listError) html += `<div class="empty-state small">${icon.alert}<p>${esc(s.listError)}</p><button class="btn sm" data-retry>Try again</button></div>`;
    else if (!s.mine.length) html += `<div class="empty-state small"><p>No projects yet.</p><button class="btn sm" data-new>${icon.plus}<span>New project</span></button></div>`;
    else if (!mine.length && query) html += `<p class="list-note">No projects match “${esc(query)}”.</p>`;
    for (const [lesson, items] of ordered) html += `<div class="group"><div class="group-h">${lesson ? `${icon.book}<span>${esc(lesson)}</span>` : `<span>${groups.size > 1 ? "Other projects" : "My projects"}</span>`}</div>${items.map(p => rowHtml(p, { owned: true })).join("")}</div>`;
    const recent = s.recent.filter(matches);
    if (recent.length) html += `<div class="group"><div class="group-h"><span>Opened from links</span></div>${recent.map(p => rowHtml(p, { owned: false })).join("")}</div>`;
    const shared = s.shared.filter(matches);
    html += `<div class="group"><button class="group-h toggle" data-gallery aria-expanded="${galleryOpen}">${icon.chevron}<span>Class gallery</span></button>${galleryOpen ? (shared.length ? shared.map(p => rowHtml(p, { owned: false })).join("") : '<p class="list-note">Nothing public yet. Share a project as Public to list it here.</p>') : ""}</div>`;
    $("project-list").innerHTML = html;
  }

  $("project-list").addEventListener("click", async e => {
    if (e.target.closest("[data-retry]")) return workspace.loadList();
    if (e.target.closest("[data-new]")) return newProjectMenu(e.target.closest("[data-new]"));
    if (e.target.closest("[data-gallery]")) { galleryOpen = !galleryOpen; store.set("gallery-open", galleryOpen); if (galleryOpen) await workspace.loadShared(); return renderList(); }
    const menuButton = e.target.closest("[data-row-menu]");
    if (menuButton) {
      e.stopPropagation();
      const id = menuButton.dataset.rowMenu, owned = menuButton.dataset.owned === "1";
      return openMenu(menuButton, [
        { label: "Open", run: () => workspace.open(id) },
        { label: "Duplicate", run: () => workspace.duplicate(id) },
        { label: "Copy link", run: async () => { if (await copyText(shareUrl(id))) toast("Link copied"); } },
        ...(owned ? ["-", { label: "Delete…", danger: true, run: () => deleteProject(id) }] : [{ label: "Remove from list", run: () => { workspace.state.recent = workspace.state.recent.filter(r => r.id !== id); store.set("recent-shared", workspace.state.recent); renderList(); } }]),
      ]);
    }
    const row = e.target.closest("[data-id]");
    if (row) { await workspace.open(row.dataset.id); if (isNarrow()) { layout.sideOn = false; applyLayout(); } editor.focus(); }
  });
  $("project-list").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[data-id]")) e.target.click(); });

  async function deleteProject(id) {
    const p = workspace.state.mine.find(x => x.id === id); if (!p) return;
    if (await confirmDialog("Delete project?", `“${p.title}” and its version history will be deleted for everyone. This cannot be undone.`, "Delete", true)) workspace.remove(id);
  }

  function renderDetails() {
    const p = workspace.state.current, root = $("aside-details");
    if (!p) { root.innerHTML = '<div class="empty-state small"><p>Open a project to see its details.</p></div>'; return; }
    if (root.dataset.id === p.id && root.contains(document.activeElement)) return;
    root.dataset.id = p.id;
    const lang = languageById[p.language];
    const facts = [["Language", lang?.name || p.language], ["File", fileOf(p)], ["Author", p.author || "–"], ["Created", absoluteTime(p.createdAt)], ["Last saved", absoluteTime(p.updatedAt)], ["Sharing", VISIBILITY[p.visibility].label + (p.editable && p.visibility !== "private" ? ", editable" : "")]];
    root.innerHTML = p.isOwner
      ? `<form class="form" data-details>
          <label class="field"><span>Lesson or assignment</span><input class="input" name="lesson" maxlength="60" value="${esc(p.lesson)}" placeholder="e.g. Loops – week 6" list="lesson-options"></label>
          <datalist id="lesson-options">${[...new Set(workspace.state.mine.map(x => x.lesson).filter(Boolean))].map(l => `<option value="${esc(l)}">`).join("")}</datalist>
          <label class="field"><span>Task or notes</span><textarea class="input" name="description" rows="7" maxlength="4000" placeholder="Paste the assignment or write what this program should do.">${esc(p.description)}</textarea></label>
          <label class="field"><span>Author</span><input class="input" name="author" maxlength="60" value="${esc(p.author)}" placeholder="Your name"></label>
        </form>${factsHtml(facts)}${p.forkedFrom ? `<p class="muted small">Duplicated from <a href="?p=${esc(p.forkedFrom)}" data-open="${esc(p.forkedFrom)}">another project</a>.</p>` : ""}`
      : `${p.description ? `<div class="task"><h3>Task</h3><p>${esc(p.description).replace(/\n/g, "<br>")}</p></div>` : '<p class="muted">No task description.</p>'}${factsHtml(facts.concat(p.lesson ? [["Lesson", p.lesson]] : []))}`;
    root.querySelector("[data-details]")?.addEventListener("change", e => workspace.updateMeta({ [e.target.name]: e.target.value }));
    root.querySelector("[data-open]")?.addEventListener("click", e => { e.preventDefault(); workspace.open(e.target.dataset.open); });
  }
  const factsHtml = facts => `<dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;

  async function renderHistory() {
    const p = workspace.state.current, root = $("aside-history");
    if (!p) { root.innerHTML = '<div class="empty-state small"><p>Open a project to see its history.</p></div>'; return; }
    root.innerHTML = '<p class="muted pad">Loading history…</p>';
    let versions;
    try { versions = await workspace.listVersions(); } catch (e) { root.innerHTML = `<div class="empty-state small">${icon.alert}<p>${esc(e.message)}</p></div>`; return; }
    root.innerHTML = `${p.canEdit ? `<div class="history-h"><button class="btn sm" data-save-version>${icon.history}<span>Save version</span></button><span class="muted small">Autosaves keep a version every 10 minutes.</span></div>` : ""}
      <ol class="versions">${versions.map(v => `<li><button class="version" data-version="${v.id}"><span class="version-label">${esc(v.label || "Autosave")}</span><span class="muted small" title="${esc(absoluteTime(v.createdAt))}">${esc(relativeTime(v.createdAt))}, revision ${v.rev}</span></button></li>`).join("") || '<li class="muted pad">No saved versions yet.</li>'}</ol>`;
    root.querySelector("[data-save-version]")?.addEventListener("click", saveNamedVersion);
    root.querySelectorAll("[data-version]").forEach(b => b.onclick = () => previewVersion(+b.dataset.version));
  }

  async function saveNamedVersion() {
    if (!workspace.state.current?.canEdit) return;
    const label = prompt("Name this version (optional):", "");
    if (label === null) return;
    try { await workspace.saveVersion(label.trim()); toast("Version saved"); if (layout.asideOn && layout.asideTab === "history") renderHistory(); }
    catch (e) { toast(e.message, "error"); }
  }

  async function previewVersion(id) {
    let version;
    try { version = await workspace.getVersion(id); } catch (e) { return toast(e.message, "error"); }
    const monaco = getMonaco(), p = workspace.state.current;
    const host = document.createElement("div"); host.className = "diff-host";
    const languageId = LANGUAGE_META[p.language]?.monaco || "plaintext";
    const original = monaco.editor.createModel(version.code, languageId), modified = monaco.editor.createModel(workspace.model.getValue(), languageId);
    let diff;
    const modal = openModal({
      title: `${version.label || "Autosave"}, ${absoluteTime(version.createdAt)}`, body: host, wide: true,
      actions: [{ label: "Close" }, ...(p.canEdit ? [{ label: "Restore this version", primary: true, run: async () => { try { await workspace.restoreVersion(id); toast("Version restored"); renderHistory(); } catch (e) { toast(e.message, "error"); return false; } } }] : [])],
      onClose: () => { diff?.dispose(); original.dispose(); modified.dispose(); },
    });
    host.insertAdjacentHTML("beforebegin", '<p class="muted small diff-legend">Left: this version. Right: current code.</p>');
    diff = monaco.editor.createDiffEditor(host, { theme: `28teh-${resolvedTheme()}`, readOnly: true, automaticLayout: true, renderSideBySide: innerWidth > 900, minimap: { enabled: false }, fontFamily: '"JetBrains Mono", monospace', fontSize: settings.fontSize - 1, scrollBeyondLastLine: false });
    diff.setModel({ original, modified });
    return modal;
  }

  const assistant = createAssistant({
    root: $("aside-assistant"), chatUrl: window.WORKSPACE?.chat || "api/chat", accessHeaders: api.headers, models: config.models,
    getContext: () => {
      const p = workspace.state.current; if (!p) return "No file is open.";
      const output = terminal.recentOutput().trim();
      return `Language: ${languageById[p.language]?.name || p.language}. Current file (${fileOf(p)}):\n\`\`\`${p.language}\n${workspace.model.getValue()}\n\`\`\`${p.description ? `\nTask description:\n${p.description}` : ""}${output ? `\nRecent terminal output:\n${output}` : ""}`;
    },
    applyCode: code => {
      if (!workspace.state.current?.canEdit) return toast("This project is read-only. Duplicate it first.", "error");
      const model = editor.getModel();
      editor.pushUndoStop(); editor.executeEdits("assistant", [{ range: model.getFullModelRange(), text: code }]); editor.pushUndoStop(); editor.focus();
      toast("Applied to the editor – undo with " + mod + "Z");
    },
  });

  $("editor-empty").innerHTML = `<h2>Start a project</h2><p class="muted">Pick a language. Your work saves automatically and you can share it with a link.</p><div class="lang-grid">${languages.map(l => `<button class="lang-card" data-lang="${l.id}" ${l.available ? "" : 'title="Not installed on this server – you can still write and save code"'}><span class="ext">${esc(l.ext)}</span><span>${esc(l.name)}</span>${l.available ? "" : '<span class="muted small">not installed</span>'}</button>`).join("")}</div>`;
  $("editor-empty").addEventListener("click", e => { const b = e.target.closest("[data-lang]"); if (b) workspace.create({ language: b.dataset.lang, title: `Untitled ${languageById[b.dataset.lang].name}` }); });

  $("more").onclick = e => openMenu(e.currentTarget, moreItems());
  function moreItems() {
    const p = workspace.state.current;
    return [
      { label: "Save now", hint: `${mod}S`, disabled: !p?.canEdit, run: saveNow },
      { label: "Save a named version", hint: `${mod}⇧S`, disabled: !p?.canEdit, run: saveNamedVersion },
      { label: "Version history", disabled: !p, run: () => showAside("history") },
      { label: "Duplicate project", disabled: !p, run: () => workspace.duplicate() },
      { label: "Download file", disabled: !p, run: () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([workspace.model.getValue()], { type: "text/plain" })); a.download = fileOf(p); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); } },
      { label: "Format document", disabled: !p?.canEdit, run: () => editor.getAction("editor.action.formatDocument")?.run() },
      "-",
      { label: "Reset layout", run: resetLayout },
      { label: "Settings", hint: `${mod},`, run: openSettings },
      { label: "Keyboard shortcuts", run: openShortcuts },
      ...(p?.isOwner ? ["-", { label: "Delete project…", danger: true, run: () => deleteProject(p.id) }] : []),
      "-",
      { label: "Sign out", run: () => { store.remove("access"); location.reload(); } },
    ];
  }

  const commands = () => {
    const p = workspace.state.current;
    const list = [
      { group: "Run", label: isRunning() ? "Stop program" : "Run program", hint: `${mod}↵`, run },
      { group: "Run", label: "Rerun program", run: rerun },
      { group: "Terminal", label: "Clear terminal", run: () => terminal.clear() },
      { group: "Terminal", label: "Copy terminal output", run: () => terminal.copyOutput() },
      { group: "Terminal", label: "Restart terminal", run: () => terminal.restart() },
      { group: "View", label: "Toggle sidebar", hint: `${mod}B`, run: () => togglePanel("side") },
      { group: "View", label: "Toggle terminal panel", hint: `${mod}J`, run: () => togglePanel("term") },
      { group: "View", label: "Toggle side panel", hint: `${mod}⌥B`, run: () => togglePanel("aside") },
      { group: "View", label: "Show problems", run: () => { if (!layout.termOn) togglePanel("term"); showBottomTab("problems"); } },
      { group: "View", label: "Show assistant", run: () => showAside("assistant") },
      { group: "View", label: "Show project details", run: () => showAside("details") },
      { group: "View", label: "Reset layout", run: resetLayout },
      { group: "View", label: settings.minimap ? "Hide minimap" : "Show minimap", run: () => updateSettings({ minimap: !settings.minimap }) },
      { group: "View", label: settings.wordWrap ? "Turn off word wrap" : "Turn on word wrap", run: () => updateSettings({ wordWrap: !settings.wordWrap }) },
      { group: "Theme", label: resolvedTheme() === "dark" ? "Switch to light theme" : "Switch to dark theme", run: () => updateSettings({ theme: resolvedTheme() === "dark" ? "light" : "dark" }) },
      { group: "Project", label: "New project…", run: () => openPalette(languages.map(l => ({ group: "New", label: l.name, run: () => workspace.create({ language: l.id, title: `Untitled ${l.name}` }) })), { placeholder: "Choose a language" }) },
      { group: "Project", label: "Find a project…", hint: `${mod}P`, run: findProject },
      { group: "Editor", label: "Editor commands…", hint: "F1", run: () => { editor.focus(); editor.trigger("palette", "editor.action.quickCommand"); } },
      { group: "Editor", label: "Find and replace", run: () => { editor.focus(); editor.getAction("editor.action.startFindReplaceAction")?.run(); } },
      { group: "Help", label: "Keyboard shortcuts", run: openShortcuts },
      { group: "Help", label: "Settings", hint: `${mod},`, run: openSettings },
    ];
    if (p) list.push(
      { group: "Project", label: "Share…", run: openShare },
      { group: "Project", label: "Copy share link", run: async () => { if (await copyText(shareUrl(p.id))) toast("Link copied"); } },
      { group: "Project", label: "Duplicate project", run: () => workspace.duplicate() },
      { group: "Project", label: "Version history", run: () => showAside("history") },
    );
    if (p?.canEdit) list.push({ group: "Project", label: "Save now", hint: `${mod}S`, run: saveNow }, { group: "Project", label: "Save a named version", hint: `${mod}⇧S`, run: saveNamedVersion });
    if (p?.isOwner) list.push({ group: "Project", label: "Change language…", run: () => $("language").click() }, { group: "Project", label: "Rename project", run: () => { $("title").focus(); $("title").select(); } });
    return list;
  };
  function findProject() {
    const s = workspace.state, seen = new Set();
    const all = [...s.mine.map(p => ({ ...p, group: p.lesson || "Mine" })), ...s.recent.map(p => ({ ...p, group: "From links" })), ...s.shared.map(p => ({ ...p, group: "Gallery" }))].filter(p => !seen.has(p.id) && seen.add(p.id));
    openPalette(all.map(p => ({ group: p.group, label: p.title, keywords: `${p.language} ${p.author || ""}`, hint: languageById[p.language]?.ext, run: () => workspace.open(p.id) })), { placeholder: "Search projects by name, lesson or language" });
  }

  addEventListener("keydown", e => {
    const cmd = e.metaKey || e.ctrlKey;
    if (e.ctrlKey && e.key === "`") { e.preventDefault(); if (!layout.termOn) togglePanel("term"); if ($("terminal").contains(document.activeElement)) editor.focus(); else { showBottomTab("terminal"); terminal.focus(); } return; }
    if (!cmd) return;
    const action = e.key === "Enter" ? run
      : e.code === "KeyS" ? (e.shiftKey ? saveNamedVersion : saveNow)
      : e.code === "KeyP" ? (e.shiftKey ? () => openPalette(commands()) : findProject)
      : e.code === "KeyB" ? () => togglePanel(e.altKey ? "aside" : "side")
      : e.code === "KeyJ" ? () => togglePanel("term")
      : e.key === "," ? openSettings : null;
    if (!action) return;
    e.preventDefault(); e.stopPropagation();
    action();
  }, true);
  $("open-settings").onclick = openSettings;
  $("open-shortcuts").onclick = openShortcuts;

  workspace.onUpdate((state, reason) => {
    if (reason === "list") return renderList();
    if (reason === "save") { renderSaveState(); renderList(); return; }
    if (reason === "versions") { if (layout.asideOn && layout.asideTab === "history") renderHistory(); return; }
    if (reason === "open") {
      problems = []; renderProblems(); $("aside-details").dataset.id = "";
      if (layout.asideOn && layout.asideTab === "history") renderHistory();
    }
    renderHeader(); renderList();
  });
  onSettings(() => { renderSaveState(); renderHeader(); });

  applyLayout();
  renderHeader();
  await workspace.loadList();
  const params = new URLSearchParams(location.search);
  const requested = params.get("p") || params.get("id");
  const oldFiles = store.get("ws-files", null);
  if (oldFiles?.length && !store.get("ws-imported", false) && !workspace.state.mine.length) { await workspace.importLocalFiles(oldFiles); store.set("ws-imported", true); }
  if (galleryOpen) workspace.loadShared();
  let opened = null;
  if (requested) opened = await workspace.open(requested);
  if (!opened && params.has("lang") && languageById[params.get("lang")]) opened = await workspace.create({ language: params.get("lang"), title: `Untitled ${languageById[params.get("lang")].name}` });
  if (!opened) { const last = store.get("last-project", ""); const target = workspace.state.mine.find(p => p.id === last) || workspace.state.mine[0]; if (target) opened = await workspace.open(target.id, { quiet: true }); }
  if (!opened && requested) history.replaceState(null, "", location.pathname);
  if (params.has("list")) { layout.sideOn = true; applyLayout(); $("search").focus(); }
  else if (opened) editor.focus();
}

main().catch(e => {
  console.error(e);
  const boot = $("boot");
  boot.hidden = false;
  boot.innerHTML = `<div class="empty-state"><h2>The workspace could not load</h2><p class="muted">${esc(e.message || String(e))}</p><button class="btn" onclick="location.reload()">Reload</button></div>`;
});
