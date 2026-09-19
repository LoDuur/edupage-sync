(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const ALLOWED_URLS = ["https://my-editor-website.com"];
  const PROMPT_RE = /developer@sandbox:[^\n]*\$ $/;
  const LANG_OF = { py: "python", js: "javascript", java: "java", c: "c", cpp: "cpp", sh: "shell", md: "markdown", txt: "plaintext", json: "json", html: "html", css: "css" };
  const TEMPLATES = {
    "main.py": 'name = input("Name: ")\nprint(f"Hello, {name}!")\n',
    "Main.java": 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        System.out.print("Name: ");\n        String name = in.nextLine();\n        System.out.println("Hello, " + name + "!");\n    }\n}\n',
    "main.js": 'const name = process.argv[2] || "world";\nconsole.log(`Hello, ${name}!`);\n',
    "main.c": '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, world!\\n");\n    return 0;\n}\n',
  };
  const ACTIONS = {
    explain: ["Explain", "Explain what this code does, step by step (input → processing → output). Name one thing a beginner would not notice."],
    review: ["Review", "Review this code as a teacher: logic bugs, edge cases (empty input, 0, negative numbers), style. Order by importance, at most 5 points. If the code is good, say so."],
    understand: ["Understand", "Explain the last terminal output or error: what happened → why (quote the line) → how to fix → how to spot it next time. One sentence each."],
    practice: ["Practice", "Invent one small practical exercise (5–15 lines) that trains the same topic as this code but with a different story. Give the task, an input/output example and one hint – no solution."],
    fix: ["Fix", "Fix the problems in this code, keeping my names and style. Return the WHOLE file in one code block, then 1–3 sentences on what changed and why."],
  };
  const SYSTEM = `# Role
You are an experienced programming teacher for second-year students at Valmiera Technical School (group 28). They are beginners; your goal is that the student understands AND the code works.
# Context
After every question you get the current file (with its name), the recent terminal output and the language. Work from that code – do not ask for it again.
# How to answer
1. Answer in English unless the student writes in Latvian – then answer in Latvian. Keep technical terms as they are.
2. Be brief. Answer/fix first, explanation second. No preambles.
3. Explain errors as: what happened → why (line number) → how to fix → how to spot it next time.
4. When fixing or completing code, return the WHOLE file in one code block with the correct language tag, then 1–3 sentences on what changed.
5. No tables; at most 5 bullet points. Never invent program output.`;

  const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icon = d => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = { model: icon('<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/>'), speed: icon('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'), time: icon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'), copy: icon('<rect width="14" height="14" x="8" y="8" rx="1"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'), check: icon('<path d="M20 6 9 17l-5-5"/>'), apply: icon('<path d="M4 12v8h16v-8"/><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/>'), chev: icon('<path d="m9 18 6-6-6-6"/>') };
  let toastTimer = 0;
  const toast = text => { let el = document.querySelector(".toast"); if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); } el.textContent = text; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2200); };

  /* ---------- menus ---------- */
  function openMenu(anchor, items, { align = "right" } = {}) {
    closeMenu();
    const m = document.createElement("div"); m.className = "menu"; m.setAttribute("role", "menu");
    for (const it of items) {
      if (it === "-") { m.appendChild(document.createElement("hr")); continue; }
      if (it.h) { const h = document.createElement("div"); h.className = "h"; h.textContent = it.h; m.appendChild(h); continue; }
      const b = document.createElement("button"); b.setAttribute("role", "menuitem"); b.className = it.on ? "on" : "";
      b.innerHTML = `${it.icon ? `<img src="${esc(it.icon)}" alt="" width="16" height="16">` : ""}<span>${esc(it.label)}</span>${it.k ? `<span class="k">${esc(it.k)}</span>` : ""}`;
      b.onclick = () => { closeMenu(); it.run?.(); };
      m.appendChild(b);
    }
    $("menu-root").appendChild(m);
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    let left = align === "right" ? r.right - w : r.left; left = Math.max(4, Math.min(left, innerWidth - w - 4));
    let top = r.bottom + 4; if (top + h > innerHeight - 4) top = Math.max(4, r.top - h - 4);
    m.style.left = left + "px"; m.style.top = top + "px";
    m.querySelector("button")?.focus();
    const key = e => { const bs = [...m.querySelectorAll("button")]; const i = bs.indexOf(document.activeElement); if (e.key === "Escape") { closeMenu(); anchor.focus(); } else if (e.key === "ArrowDown") { e.preventDefault(); bs[(i + 1) % bs.length]?.focus(); } else if (e.key === "ArrowUp") { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length]?.focus(); } };
    const down = e => { if (!m.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
    m.addEventListener("keydown", key); document.addEventListener("mousedown", down);
    m._off = () => document.removeEventListener("mousedown", down);
  }
  function closeMenu() { const m = document.querySelector(".menu"); if (m) { m._off?.(); m.remove(); } }

  /* ---------- gate ---------- */
  async function gate() {
    const key = ls.get("access", "");
    if (key) { const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).then(r => r.json()).catch(() => ({ ok: false })); if (r.ok) return key; }
    $("gate").hidden = false; $("gate-input").focus();
    return new Promise(resolve => {
      $("gate-form").onsubmit = async e => {
        e.preventDefault(); const v = $("gate-input").value.trim().toUpperCase(); if (!v) return;
        const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: v }) }).then(r => r.json()).catch(() => ({ ok: false }));
        if (r.ok) { ls.set("access", v); $("gate").hidden = true; resolve(v); } else $("gate-err").textContent = "Incorrect access code.";
      };
    });
  }

  /* ---------- app ---------- */
  async function main() {
    const KEY = await gate();
    const H = { "Content-Type": "application/json", "X-Access-Key": KEY };
    const app = $("app"); app.hidden = false;
    const cfg = await fetch("/api/models", { headers: H }).then(r => r.json()).catch(() => ({ models: [], commands: {} }));
    const MODELS = cfg.models || [], COMMANDS = cfg.commands || {};

    /* layout */
    const panels = ls.get("panels", { side: 220, ai: 380, term: 260, sideOn: true, aiOn: true, termOn: true });
    const applyPanels = () => { app.style.setProperty("--w-side", panels.side + "px"); app.style.setProperty("--w-ai", panels.ai + "px"); app.style.setProperty("--h-term", panels.term + "px"); app.dataset.side = panels.sideOn ? "on" : "off"; app.dataset.ai = panels.aiOn ? "on" : "off"; app.dataset.term = panels.termOn ? "on" : "off"; $("tg-side").classList.toggle("on", panels.sideOn); $("tg-ai").classList.toggle("on", panels.aiOn); $("tg-term").classList.toggle("on", panels.termOn); ls.set("panels", panels); editor?.layout(); fitTerm(); };
    const toggle = k => { panels[k + "On"] = !panels[k + "On"]; applyPanels(); if (k === "term" && panels.termOn) setTimeout(() => term.focus(), 50); };
    $("tg-side").onclick = () => toggle("side"); $("tg-ai").onclick = () => toggle("ai"); $("tg-term").onclick = () => toggle("term");
    function resizer(el, axis, key, min, max, fromEnd) {
      let drag = false, start = 0, base = 0;
      const set = v => { panels[key] = Math.round(Math.min(max(), Math.max(min, v))); applyPanels(); };
      el.addEventListener("mousedown", e => { drag = true; start = axis === "x" ? e.clientX : e.clientY; base = panels[key]; el.classList.add("on"); document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize"; document.body.style.userSelect = "none"; e.preventDefault(); });
      addEventListener("mousemove", e => { if (!drag) return; const d = (axis === "x" ? e.clientX : e.clientY) - start; set(base + (fromEnd ? -d : d)); });
      addEventListener("mouseup", () => { if (!drag) return; drag = false; el.classList.remove("on"); document.body.style.cursor = ""; document.body.style.userSelect = ""; });
      el.addEventListener("keydown", e => { const step = e.shiftKey ? 48 : 16; if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); set(panels[key] + (fromEnd ? step : -step)); } else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); set(panels[key] + (fromEnd ? -step : step)); } });
    }
    resizer($("split-side"), "x", "side", 160, () => innerWidth * 0.4, false);
    resizer($("split-ai"), "x", "ai", 280, () => innerWidth * 0.6, true);
    resizer($("split-term"), "y", "term", 96, () => innerHeight * 0.8, true);
    addEventListener("resize", () => { editor?.layout(); fitTerm(); });

    /* files */
    let files = ls.get("ws-files", null);
    if (!files) files = Object.entries(TEMPLATES).map(([name, content]) => ({ name, content }));
    let active = ls.get("ws-active", files[0].name);
    if (!files.some(f => f.name === active)) active = files[0].name;
    const saveFiles = () => { ls.set("ws-files", files); ls.set("ws-active", active); };
    const fileOf = name => files.find(f => f.name === name);
    const extOf = name => (name.split(".").pop() || "").toLowerCase();
    function renderFiles() {
      $("files").innerHTML = files.map(f => `<div class="row${f.name === active ? " on" : ""}" role="option" aria-selected="${f.name === active}" tabindex="0" data-name="${esc(f.name)}"><span class="ext">${esc(extOf(f.name).slice(0, 4))}</span><span class="name">${esc(f.name)}</span><button class="x" aria-label="Delete ${esc(f.name)}" data-del="${esc(f.name)}">×</button></div>`).join("");
      $("crumb-file").textContent = active; $("st-lang").textContent = LANG_OF[extOf(active)] || "plaintext";
      $("run").disabled = !COMMANDS[extOf(active)];
    }
    $("files").addEventListener("click", e => { const del = e.target.closest("[data-del]"); if (del) { const n = del.dataset.del; if (files.length === 1) return toast("Keep at least one file."); if (!confirm(`Delete ${n}?`)) return; files = files.filter(f => f.name !== n); models[n]?.dispose(); delete models[n]; if (active === n) openFile(files[0].name); else { saveFiles(); renderFiles(); } return; } const row = e.target.closest("[data-name]"); if (row) openFile(row.dataset.name); });
    $("files").addEventListener("keydown", e => { if (e.key === "Enter") { const row = e.target.closest("[data-name]"); if (row) openFile(row.dataset.name); } });
    $("new-file").onclick = () => { const n = (prompt("File name (e.g. hello.py):") || "").trim(); if (!n) return; if (!/^[\w.-]{1,64}$/.test(n) || n.startsWith(".")) return toast("Use letters, digits, . _ - only."); if (fileOf(n)) return openFile(n); files.push({ name: n, content: "" }); openFile(n); };

    /* editor */
    let editor = null; const models = {};
    require.config({ paths: { vs: "/vendor/monaco" } });
    await new Promise(res => require(["vs/editor/editor.main"], res));
    monaco.editor.defineTheme("mono", { base: "vs-dark", inherit: true, rules: [
      { token: "comment", foreground: "555555", fontStyle: "italic" }, { token: "keyword", foreground: "e6e6e6" }, { token: "string", foreground: "a8c5a8" }, { token: "number", foreground: "d9cba0" }, { token: "type", foreground: "b8c7d9" }, { token: "type.identifier", foreground: "b8c7d9" }, { token: "delimiter", foreground: "888888" }, { token: "operator", foreground: "999999" }, { token: "identifier", foreground: "ffffff" }, { token: "annotation", foreground: "999999" },
    ], colors: { "editor.background": "#0a0a0a", "editor.foreground": "#ffffff", "editorLineNumber.foreground": "#444444", "editorLineNumber.activeForeground": "#888888", "editor.lineHighlightBackground": "#0f0f0f", "editor.lineHighlightBorder": "#0f0f0f", "editor.selectionBackground": "#333333", "editor.inactiveSelectionBackground": "#222222", "editorCursor.foreground": "#ffffff", "editorIndentGuide.background1": "#1a1a1a", "editorIndentGuide.activeBackground1": "#333333", "editorWidget.background": "#0a0a0a", "editorWidget.border": "#333333", "editorSuggestWidget.background": "#0a0a0a", "editorSuggestWidget.border": "#333333", "editorSuggestWidget.selectedBackground": "#222222", "editorHoverWidget.background": "#0a0a0a", "editorHoverWidget.border": "#333333", "scrollbarSlider.background": "#22222299", "scrollbarSlider.hoverBackground": "#333333", "editorGutter.background": "#0a0a0a", "editorOverviewRuler.border": "#0a0a0a", "focusBorder": "#ffffff", "editorBracketMatch.background": "#222222", "editorBracketMatch.border": "#555555", "minimap.background": "#0a0a0a" } });
    editor = monaco.editor.create($("editor"), { theme: "mono", fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace', fontSize: 13, lineHeight: 21, fontLigatures: false, automaticLayout: false, minimap: { enabled: false }, scrollBeyondLastLine: false, renderLineHighlight: "line", cursorBlinking: "solid", smoothScrolling: false, padding: { top: 10, bottom: 40 }, tabSize: 4, insertSpaces: true, bracketPairColorization: { enabled: false }, guides: { indentation: true, bracketPairs: false }, scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false }, lineNumbersMinChars: 4, glyphMargin: false, folding: false, overviewRulerBorder: false, hideCursorInOverviewRuler: true, stickyScroll: { enabled: false }, roundedSelection: false });
    const modelFor = f => { if (!models[f.name]) { models[f.name] = monaco.editor.createModel(f.content, LANG_OF[extOf(f.name)] || "plaintext", monaco.Uri.parse(`inmemory://ws/${f.name}`)); models[f.name].onDidChangeContent(() => { f.content = models[f.name].getValue(); clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveFiles(); flashSaved(); }, 500); }); } return models[f.name]; };
    let saveTimer = 0, savedTimer = 0;
    const flashSaved = () => { $("saved").textContent = "saved"; clearTimeout(savedTimer); savedTimer = setTimeout(() => { $("saved").textContent = ""; }, 1500); };
    function openFile(name) { const f = fileOf(name); if (!f) return; active = name; editor.setModel(modelFor(f)); saveFiles(); renderFiles(); editor.focus(); }
    editor.onDidChangeCursorPosition(e => { $("st-pos").textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`; });
    openFile(active);
    $("st-lang").onclick = e => openMenu(e.currentTarget, Object.entries(LANG_OF).map(([ext, lang]) => ({ label: `${lang} (.${ext})`, on: extOf(active) === ext, run: () => { const base = active.replace(/\.[^.]+$/, ""); const n = base + "." + ext; if (fileOf(n)) return openFile(n); const f = fileOf(active); f.name = n; models[n] = models[active]; delete models[active]; monaco.editor.setModelLanguage(models[n], lang); active = n; saveFiles(); renderFiles(); } })));
    $("more").onclick = e => openMenu(e.currentTarget, [
      { label: "Format document", k: "⇧⌥F", run: () => editor.getAction("editor.action.formatDocument")?.run() },
      { label: "Download file", run: () => { const f = fileOf(active); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([f.content])); a.download = f.name; a.click(); } },
      { label: "Reset file to template", run: () => { if (TEMPLATES[active] && confirm(`Reset ${active}?`)) modelFor(fileOf(active)).setValue(TEMPLATES[active]); } },
      "-",
      { label: "Restart sandbox", run: restartSandbox },
      { label: "Sign out", run: () => { localStorage.removeItem("access"); location.reload(); } },
    ]);

    /* terminal */
    const term = new Terminal({ fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace', fontSize: 13, lineHeight: 1.45, cursorBlink: false, cursorStyle: "bar", cursorWidth: 1, scrollback: 5000, allowProposedApi: true, theme: { background: "#0a0a0a", foreground: "#ffffff", cursor: "#ffffff", cursorAccent: "#0a0a0a", selectionBackground: "#333333", black: "#111111", red: "#d97c7c", green: "#7fbf7f", yellow: "#d9cba0", blue: "#b8c7d9", magenta: "#c9b8d9", cyan: "#a8c5c5", white: "#cccccc", brightBlack: "#666666", brightRed: "#e89a9a", brightGreen: "#a3d9a3", brightYellow: "#e8dcb8", brightBlue: "#cfdbe8", brightMagenta: "#dccfe8", brightCyan: "#c5dede", brightWhite: "#ffffff" } });
    const fitAddon = new FitAddon.FitAddon(); term.loadAddon(fitAddon); term.open($("terminal"));
    let recent = "", runPending = false;
    const fitTerm = () => { try { if (panels.termOn) { fitAddon.fit(); socket?.emit("terminal-resize", { cols: term.cols, rows: term.rows }); } } catch {} };
    new ResizeObserver(() => fitTerm()).observe($("terminal"));
    document.fonts?.ready.then(() => { term.options.fontFamily = term.options.fontFamily; fitTerm(); });
    $("term-clear").onclick = () => { term.clear(); term.focus(); };
    $("term-restart").onclick = restartSandbox;

    const socket = io({ auth: { key: KEY }, transports: ["websocket", "polling"] });
    const setState = (state, message) => {
      const map = { creating: ["mid", "starting sandbox"], attached: ["on", "sandbox ready"], exited: ["", "sandbox stopped"], limit: ["", "limit reached"], error: ["", "sandbox error"], disconnected: ["", "disconnected"], connecting: ["mid", "connecting"] };
      const [dot, text] = map[state] || ["", state];
      $("st-dot").className = "dot " + dot; $("st-container-text").textContent = text;
      const empty = $("term-empty"); empty.hidden = state === "attached" || state === "creating";
      empty.textContent = message || (state === "exited" ? "Sandbox stopped. Restart it from the terminal header." : state === "disconnected" ? "Connection lost – reconnecting…" : "");
      $("term-hint").textContent = state === "attached" ? `idle timeout ${Math.round(idleMs / 60000)} min` : "";
      if (state !== "attached") { runPending = false; setRunButton(false); }
    };
    let idleMs = 600000, lastInput = Date.now();
    socket.on("connect", () => { setState("creating"); fitAddon.fit(); socket.emit("terminal-open", { cols: term.cols, rows: term.rows }); });
    socket.on("connect_error", e => setState("error", e.message === "access denied" ? "Access denied – sign out and enter the code again." : "Cannot reach the server."));
    socket.on("disconnect", () => setState("disconnected"));
    socket.on("terminal-status", ({ state, message, idleMs: ms }) => { if (ms) idleMs = ms; if (state === "attached") { term.clear(); lastInput = Date.now(); setTimeout(() => { fitTerm(); term.focus(); }, 30); } setState(state, message); });
    socket.on("terminal-output", data => { term.write(data); recent = (recent + data).slice(-6000); if (runPending && PROMPT_RE.test(stripAnsi(recent))) { runPending = false; setRunButton(false); } });
    socket.on("open-url", url => { if (ALLOWED_URLS.includes(url)) window.open(url, "_blank", "noopener"); });
    term.onData(d => { lastInput = Date.now(); socket.emit("terminal-input", d); });
    term.onResize(({ cols, rows }) => socket.emit("terminal-resize", { cols, rows }));
    function restartSandbox() { fitAddon.fit(); recent = ""; socket.emit("terminal-restart", { cols: term.cols, rows: term.rows }); }
    const stripAnsi = s => s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g, "");
    setInterval(() => { const left = idleMs - (Date.now() - lastInput); const el = $("st-idle"); if ($("st-dot").classList.contains("on") && left < 60000 && left > 0) { el.hidden = false; el.textContent = `sandbox idle: ${Math.ceil(left / 1000)}s`; } else el.hidden = true; }, 1000);

    /* run */
    function setRunButton(running) { $("run-lbl").textContent = running ? "Stop" : "Run"; $("run-ico").innerHTML = running ? '<rect x="5" y="5" width="14" height="14"/>' : '<polygon points="6 3 20 12 6 21 6 3"/>'; $("run").title = running ? "Send Ctrl+C" : "Run active file in the sandbox (⌘↵)"; }
    function run() {
      if (runPending) { socket.emit("terminal-input", "\x03"); runPending = false; setRunButton(false); return; }
      const f = fileOf(active); if (!f || !COMMANDS[extOf(f.name)]) return toast(`No run command for .${extOf(f.name)}`);
      if (!$("st-dot").classList.contains("on")) return toast("The sandbox is not running.");
      if (!panels.termOn) toggle("term");
      runPending = true; setRunButton(true); lastInput = Date.now();
      socket.emit("run-file", { name: f.name, content: f.content }, r => { if (!r?.ok) { runPending = false; setRunButton(false); toast(r?.error || "Run failed"); } else term.focus(); });
    }
    $("run").onclick = run;

    /* assistant */
    let model = ls.get("model", ""); if (!MODELS.some(m => m.id === model)) model = MODELS[0]?.id || "";
    const modelInfo = id => MODELS.find(m => m.id === id);
    const iconUrl = m => m?.icon ? `https://cdn.simpleicons.org/${m.icon}/white` : null;
    function renderModel() { const m = modelInfo(model); $("model-lbl").textContent = m ? m.label : "No model"; $("model-btn").title = m ? `${m.label} · ${m.provider}` : "No provider configured"; const url = iconUrl(m); $("model-ico").hidden = !url; if (url) $("model-ico").src = url; }
    renderModel();
    $("model-btn").onclick = e => openMenu(e.currentTarget, MODELS.length ? MODELS.map(m => ({ label: m.label, icon: iconUrl(m), on: m.id === model, run: () => { model = m.id; ls.set("model", model); renderModel(); } })) : [{ label: "No API key configured on the server" }]);

    const history = []; let busy = null, lastCode = "";
    const chat = $("chat");
    const context = () => { const f = fileOf(active); return `Language: ${LANG_OF[extOf(f.name)] || "plaintext"}. Current file (${f.name}):\n\`\`\`${LANG_OF[extOf(f.name)] || ""}\n${f.content}\n\`\`\`${recent.trim() ? `\nRecent terminal output:\n${stripAnsi(recent).slice(-2500)}` : ""}`; };
    function parseMd(text, streaming) {
      const blocks = []; const re = /```([a-zA-Z#+]*)[^\n]*\n?([\s\S]*?)(```|$)/g; let last = 0, m;
      while ((m = re.exec(text))) { if (m.index > last) blocks.push({ t: "text", s: text.slice(last, m.index) }); blocks.push({ t: "code", lang: m[1], code: m[2].replace(/\n$/, ""), open: m[3] !== "```" }); last = re.lastIndex; if (m[3] !== "```") break; }
      if (last < text.length) blocks.push({ t: "text", s: text.slice(last) });
      if (streaming) { const b = blocks[blocks.length - 1]; if (b?.t === "text") { if ((b.s.split("**").length - 1) % 2) b.s = b.s.slice(0, b.s.lastIndexOf("**")); if ((b.s.split("`").length - 1) % 2) b.s = b.s.slice(0, b.s.lastIndexOf("`")); } }
      return blocks;
    }
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
    const textHtml = s => s.replace(/^\n+|\n+$/g, "").split(/\n{2,}/).map(p => { const lines = p.split("\n"); if (lines.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l))) return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>`).join("")}</ul>`; if (/^#{1,4}\s/.test(p) && lines.length === 1) return `<div class="h">${inline(p.replace(/^#+\s/, ""))}</div>`; return `<p>${inline(p)}</p>`; }).join("");
    const bodyHtml = (text, streaming) => parseMd(text, streaming).map((b, i) => b.t === "text" ? textHtml(b.s) : `<div class="codeblk" data-i="${i}"><div class="hd"><span>${esc(b.lang || "code")}</span><span class="grow"></span><button class="ibtn" data-copy aria-label="Copy code" title="Copy">${ICONS.copy}</button><button class="ibtn" data-apply aria-label="Apply to editor" title="Apply to editor">${ICONS.apply}</button></div><pre>${esc(b.code)}</pre></div>`).join("");
    chat.addEventListener("click", e => {
      const blk = e.target.closest(".codeblk"); const act = e.target.closest("[data-act]"); const th = e.target.closest(".think > button");
      if (act) return ask(ACTIONS[act.dataset.act][1], ACTIONS[act.dataset.act][0]);
      if (th) { const pre = th.nextElementSibling; pre.hidden = !pre.hidden; th.setAttribute("aria-expanded", String(!pre.hidden)); return; }
      if (!blk) return; const code = blk.querySelector("pre").textContent;
      if (e.target.closest("[data-copy]")) { navigator.clipboard.writeText(code); const b = e.target.closest("[data-copy]"); b.innerHTML = ICONS.check; setTimeout(() => { b.innerHTML = ICONS.copy; }, 1200); }
      if (e.target.closest("[data-apply]")) applyCode(code);
    });
    function applyCode(code) { const m = editor.getModel(); editor.pushUndoStop(); editor.executeEdits("ai", [{ range: m.getFullModelRange(), text: code }]); editor.pushUndoStop(); editor.focus(); toast(`Applied to ${active}`); }
    $("apply-last").onclick = () => lastCode && applyCode(lastCode);
    $("actions").addEventListener("click", e => { const b = e.target.closest("[data-act]"); if (b) ask(ACTIONS[b.dataset.act][1], ACTIONS[b.dataset.act][0]); });
    const ta = $("prompt");
    ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; });
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    $("send").onclick = () => busy ? busy.abort() : send();
    function send() { const v = ta.value.trim(); if (!v) return; ta.value = ""; ta.style.height = "auto"; ask(v, v); }
    const metaHtml = (m, tps, secs, est) => `<span>${ICONS.model}${esc(modelInfo(m)?.label || m)}</span><span>${ICONS.speed}${est ? "~" : ""}${Math.round(tps)} tok/s</span><span>${ICONS.time}${secs.toFixed(1)}s</span>`;

    async function ask(text, shown) {
      if (busy) return; if (!model) return toast("No model available – configure an API key on the server.");
      $("chat-empty").hidden = true;
      const u = document.createElement("div"); u.className = "msg user"; u.innerHTML = `<div class="who">you</div><div class="body">${esc(shown)}</div>`; chat.appendChild(u);
      const a = document.createElement("div"); a.className = "msg ai"; const mi = modelInfo(model);
      a.innerHTML = `<div class="who">${iconUrl(mi) ? `<img src="${iconUrl(mi)}" alt="">` : ""}${esc(mi?.label || model)}</div><div class="think" hidden><button aria-expanded="false">${ICONS.chev} thinking</button><pre hidden></pre></div><div class="body"></div><div class="meta"></div>`;
      const wait = document.createElement("div"); wait.className = "busy"; wait.innerHTML = "<i></i><i></i><i></i> thinking"; chat.appendChild(wait);
      chat.scrollTop = chat.scrollHeight;
      const body = a.querySelector(".body"), think = a.querySelector(".think"), meta = a.querySelector(".meta");
      busy = new AbortController(); $("send").textContent = "Stop"; for (const b of document.querySelectorAll("[data-act]")) b.disabled = true;
      const t0 = performance.now(); let first = 0, content = "", reasoning = "", usage = null, raf = 0, err = "";
      const paint = () => { raf = 0; if (reasoning) { think.hidden = false; think.querySelector("pre").textContent = reasoning; } body.innerHTML = bodyHtml(content, true) + '<span class="caret"></span>'; chat.scrollTop = chat.scrollHeight; };
      try {
        const r = await fetch("/api/chat", { method: "POST", headers: H, signal: busy.signal, body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM }, ...history.slice(-6), { role: "user", content: text + "\n\n" + context() }] }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "";
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data:")) continue; let j; try { j = JSON.parse(line.slice(5)); } catch { continue; }
            if (j.error) { err = j.error; break; }
            if (j.done) { usage = j.usage; continue; }
            if (!first && (j.delta || j.reasoning)) { first = performance.now(); if (wait.parentNode) wait.remove(); chat.insertBefore(a, null); }
            content += j.delta || ""; reasoning += j.reasoning || "";
            if (!raf) raf = requestAnimationFrame(paint);
          }
        }
      } catch (e) { if (e.name !== "AbortError") err = e.message; }
      cancelAnimationFrame(raf); wait.remove(); if (!a.parentNode) chat.appendChild(a);
      const end = performance.now(), secs = (end - t0) / 1000, tokens = usage?.output || Math.round((content.length + reasoning.length) / 4), gen = Math.max(0.05, (end - (first || t0)) / 1000);
      if (reasoning) { think.hidden = false; think.querySelector("pre").textContent = reasoning; }
      body.innerHTML = bodyHtml(content, false) || (err ? "" : "<p>(empty answer)</p>");
      meta.innerHTML = err ? esc(err) : metaHtml(model, tokens / gen, secs, !usage?.output); meta.classList.toggle("err", !!err);
      const codes = parseMd(content, false).filter(b => b.t === "code"); if (codes.length) { lastCode = codes[codes.length - 1].code; $("apply-last").disabled = false; }
      if (content) history.push({ role: "user", content: shown }, { role: "assistant", content });
      busy = null; $("send").textContent = "Send"; for (const b of document.querySelectorAll("[data-act]")) b.disabled = false; chat.scrollTop = chat.scrollHeight;
    }

    /* shortcuts */
    addEventListener("keydown", e => {
      const mod = e.metaKey || e.ctrlKey; if (!mod) return; const k = e.key.toLowerCase();
      if (e.key === "Enter") { e.preventDefault(); run(); } else if (k === "b") { e.preventDefault(); toggle("side"); } else if (k === "j") { e.preventDefault(); toggle("term"); } else if (k === "i") { e.preventDefault(); toggle("ai"); if (panels.aiOn) ta.focus(); } else if (k === "`") { e.preventDefault(); if (!panels.termOn) toggle("term"); term.focus(); }
    });
    applyPanels();
  }

  main().catch(e => { console.error(e); document.body.insertAdjacentHTML("beforeend", `<div class="toast">${esc(e.message)}</div>`); });
})();
