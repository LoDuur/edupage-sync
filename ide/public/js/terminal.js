import { settings, onSettings, resolvedTheme } from "./settings.js";
import { LANGUAGE_META } from "./languages.js";
import { copyText, toast } from "./util.js";

const THEMES = {
  dark: { background: "#0e0f12", foreground: "#d9dade", cursor: "#d9dade", cursorAccent: "#0e0f12", selectionBackground: "#3a4a6b99", black: "#1d1e23", red: "#ef6b67", green: "#5fc98f", yellow: "#e8b24a", blue: "#7aa6f0", magenta: "#c4a7f5", cyan: "#6cc4c4", white: "#c9cad0", brightBlack: "#6b6d76", brightRed: "#f59491", brightGreen: "#8adbad", brightYellow: "#f0c97a", brightBlue: "#a3c2f5", brightMagenta: "#d8c4f8", brightCyan: "#99d8d8", brightWhite: "#ffffff" },
  light: { background: "#f4f4f3", foreground: "#1c1d21", cursor: "#1c1d21", cursorAccent: "#f4f4f3", selectionBackground: "#c9d7f5", black: "#1c1d21", red: "#c8312d", green: "#227a3e", yellow: "#946100", blue: "#2659b8", magenta: "#7246c9", cyan: "#167a7a", white: "#6b6d76", brightBlack: "#8b8d96", brightRed: "#d9534f", brightGreen: "#2f8f4e", brightYellow: "#a87000", brightBlue: "#3d6fd6", brightMagenta: "#8559d6", brightCyan: "#1e8f8f", brightWhite: "#1c1d21" },
};
const LIMIT_CODES = new Set([124, 137, 152, 153]);
const START_TIMEOUT_MS = 8000;
const FORCE_STOP_MS = 3000;

export function createTerminal({ element, socket, onStatus, onRunState, onLink }) {
  const term = new window.Terminal({
    fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace', fontSize: settings.fontSize - 1, lineHeight: 1.4,
    cursorBlink: true, cursorStyle: "bar", scrollback: 5000, allowProposedApi: true, theme: THEMES[resolvedTheme()],
  });
  const fitAddon = new window.FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(element);

  let status = "connecting", run = idleRun(), lastRun = null, startTimer = 0, stopTimer = 0, queuedRun = null;
  function idleRun() { return { phase: "idle", language: null, file: null, startedAt: 0, runAt: 0, startLine: 0 }; }

  const fit = () => { if (!element.offsetParent) return; try { fitAddon.fit(); socket.emit("terminal-resize", { cols: term.cols, rows: term.rows }); } catch {} };
  new ResizeObserver(fit).observe(element);
  document.fonts?.ready.then(fit);
  onSettings(() => { term.options.theme = THEMES[resolvedTheme()]; term.options.fontSize = settings.fontSize - 1; fit(); });

  const setStatus = (state, message = "") => { status = state; if (state !== "attached") resetRun(); onStatus(state, message); };
  const setRun = patch => { run = { ...run, ...patch }; onRunState(run); };
  const resetRun = () => { clearTimeout(startTimer); clearTimeout(stopTimer); if (run.phase !== "idle") { run = idleRun(); onRunState(run); } };
  const cursorLine = () => term.buffer.active.baseY + term.buffer.active.cursorY;

  function transcript(fromLine) {
    const buffer = term.buffer.active, lines = [];
    for (let y = Math.max(0, fromLine); y <= cursorLine(); y++) {
      const line = buffer.getLine(y); if (!line) continue;
      const text = line.translateToString(true);
      if (line.isWrapped && lines.length) lines[lines.length - 1] += text; else lines.push(text);
    }
    return lines.join("\n");
  }

  function finish(exitCode) {
    clearTimeout(startTimer); clearTimeout(stopTimer);
    const sawRun = run.runAt > 0, compiles = LANGUAGE_META[run.language]?.compiles;
    const outcome = exitCode === 0 ? "success"
      : !run.startedAt ? "system"
      : !sawRun && compiles ? "compile-error"
      : exitCode === 130 ? "stopped"
      : LIMIT_CODES.has(exitCode) ? "limit" : "runtime-error";
    const finished = { ...run, phase: "finished", outcome, exitCode, endedAt: Date.now(), output: transcript(run.startLine) };
    run = idleRun();
    onRunState(finished);
    if (queuedRun) { const next = queuedRun; queuedRun = null; start(next); }
  }

  term.parser.registerOscHandler(7777, data => {
    const [kind, value] = data.split(";");
    if (kind === "start") { clearTimeout(startTimer); setRun({ phase: LANGUAGE_META[value]?.compiles ? "compiling" : "running", language: value, startedAt: Date.now(), runAt: 0, startLine: cursorLine() }); }
    else if (kind === "run" && run.phase !== "idle") setRun({ phase: "running", runAt: Date.now() });
    else if (kind === "prompt" && run.phase !== "idle") finish(+value || 0);
    return true;
  });

  term.registerLinkProvider({
    provideLinks(y, callback) {
      const file = lastRun?.file, line = term.buffer.active.getLine(y - 1);
      if (!file || !line) return callback(undefined);
      const text = line.translateToString(true), links = [];
      const re = new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?::| \\(|", line |: line )(\\d+)(?:[:,](\\d+))?`, "g");
      let m;
      while ((m = re.exec(text))) {
        const target = { line: +m[1], column: +(m[2] || 1) };
        links.push({ text: m[0], range: { start: { x: m.index + 1, y }, end: { x: m.index + m[0].length, y } }, activate: () => onLink(target.line, target.column) });
      }
      callback(links.length ? links : undefined);
    },
  });

  socket.on("connect", () => { setStatus("creating"); fit(); socket.emit("terminal-open", { cols: term.cols, rows: term.rows }); });
  socket.on("connect_error", e => setStatus("error", e.message === "access denied" ? "Access denied – sign out and enter the access code again." : "Cannot reach the server. Retrying…"));
  socket.on("disconnect", () => setStatus("disconnected", "Connection lost. Reconnecting…"));
  socket.on("terminal-status", ({ state, message }) => {
    if (state === "creating") term.reset();
    setStatus(state, message);
    if (state === "attached") setTimeout(fit, 30);
  });
  socket.on("terminal-output", data => term.write(data));
  term.onData(data => socket.emit("terminal-input", data));

  function start(target) {
    lastRun = target;
    if (settings.clearOnRun) term.clear();
    setRun({ phase: "pending", language: target.language, file: target.file, startedAt: 0, runAt: 0 });
    startTimer = setTimeout(() => { if (run.phase === "pending") { resetRun(); toast("The program did not start. Is something else running in the terminal?", "error"); } }, START_TIMEOUT_MS);
    socket.emit("run-file", { name: target.file, content: target.code }, reply => {
      if (!reply?.ok) { resetRun(); toast(reply?.error || "Could not start the program.", "error"); }
    });
  }

  return {
    term, fit,
    get status() { return status; },
    get run() { return run; },
    get lastRun() { return lastRun; },
    focus: () => term.focus(),
    start(target) {
      if (status !== "attached") return toast("The terminal is not ready yet.", "error");
      if (run.phase !== "idle") return;
      start(target);
    },
    rerun(target) {
      if (run.phase === "idle") return this.start(target);
      queuedRun = target;
      this.stop();
    },
    stop() {
      if (run.phase === "idle") return;
      socket.emit("terminal-input", "\x03");
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        if (run.phase === "idle") return;
        queuedRun = null;
        toast("The program ignored Ctrl+C – restarting the terminal.");
        this.restart();
      }, FORCE_STOP_MS);
    },
    restart() { resetRun(); queuedRun = null; fit(); socket.emit("terminal-restart", { cols: term.cols, rows: term.rows }); },
    clear() { term.clear(); term.focus(); },
    async copyOutput() {
      let text = term.getSelection();
      if (!text) { term.selectAll(); text = term.getSelection(); term.clearSelection(); }
      if (text.trim() && await copyText(text.trimEnd())) toast("Terminal output copied");
    },
    recentOutput: () => transcript(cursorLine() - 60).slice(-4000),
  };
}
