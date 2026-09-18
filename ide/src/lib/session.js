// Owns the xterm instance and the run lifecycle. Output streams into the terminal; problems/output land in the store.
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useStore } from "../store.js";
import { LANGUAGES } from "./languages.js";
import { runOnServer, runOnWandbox, runPilWasm } from "./exec.js";
import { diagnose, stripAnsi } from "./diagnose.js";
import { setMarkers } from "./editor.js";

const A = { dim: "\x1b[3;38;2;107;107;112m", red: "\x1b[38;2;248;81;73m", reset: "\x1b[0m" };
const S = useStore;
let term, fit, container;
let conn = null, mode = "idle", transcript = "", lineBuf = "", runId = 0, t0 = 0, currentLang = null, currentCode = "";
let fb = null; // fallback (batch) state: { stdin, consumed, waiting, eof }
const onDataHandlers = [];
const history = []; let histPos = 0, idleBuf = "";
const tw = s => term && term.write(String(s).replace(/\r?\n/g, "\r\n"));

export function attach(el) {
  if (term) { if (container !== el) { el.appendChild(container); } fit.fit(); return term; }
  container = document.createElement("div"); container.style.cssText = "position:absolute;inset:6px 0 0 12px"; el.appendChild(container);
  term = new Terminal({ fontFamily: '"Geist Mono","JetBrains Mono",ui-monospace,Menlo,monospace', fontSize: 13, lineHeight: 1.6, letterSpacing: 0, cursorBlink: true, cursorStyle: "bar", cursorWidth: 1, scrollback: 4000, allowProposedApi: true,
    theme: { background: "#0a0a0a", foreground: "#ededed", cursor: "#3291ff", cursorAccent: "#0a0a0a", selectionBackground: "#3291ff1f", black: "#18181b", red: "#f85149", green: "#3fb950", yellow: "#e3a008", blue: "#82aaff", magenta: "#c792ea", cyan: "#82aaff", white: "#ededed", brightBlack: "#6b6b70", brightRed: "#f85149", brightGreen: "#a3e6a3", brightYellow: "#f0c674", brightBlue: "#82aaff", brightMagenta: "#c792ea", brightCyan: "#82aaff", brightWhite: "#ffffff" } });
  fit = new FitAddon(); term.loadAddon(fit); term.open(container); fit.fit();
  document.fonts?.ready.then(() => { term.options.fontFamily = term.options.fontFamily; fit.fit(); });
  term.parser.registerOscHandler(7777, data => { if (data === "run") { S.getState().setRun({ phase: "running", state: "running" }); } return true; });
  term.onData(d => { for (const h of onDataHandlers) h(d); if (mode === "server" && conn) conn.write(d); else if (mode === "fallback") for (const ch of d.replace(/\r\n/g, "\r")) localKey(ch); else idleInput(d); });
  new ResizeObserver(() => { try { fit.fit(); if (conn) conn.resize(term.cols, term.rows); } catch {} }).observe(el);
  tw(`${A.dim}Program input and output appear here. Press ⌘/Ctrl+Enter to run; type clear to empty the panel.${A.reset}\n`); prompt();
  if (import.meta.env.DEV) window.__28 = { term, run, stop };
  return term;
}
export const focus = () => term && term.focus();
export const clear = () => { if (term) { term.clear(); } };
export const resize = () => { try { fit && fit.fit(); } catch {} };
export const onData = h => { onDataHandlers.push(h); return () => onDataHandlers.splice(onDataHandlers.indexOf(h), 1); };

/* ---------- idle shell: local line editor with history; nothing runs outside Run ---------- */
const PROMPT = "\x1b[38;2;160;160;166m❯\x1b[0m ";
function prompt() { idleBuf = ""; histPos = history.length; term.write(PROMPT); }
function redrawIdle(text) { term.write("\r\x1b[2K" + PROMPT + text); idleBuf = text; }
function idleInput(d) {
  if (d === "\x1b[A" || d === "\x1b[B") { if (!history.length) return; histPos = d === "\x1b[A" ? Math.max(0, histPos - 1) : Math.min(history.length, histPos + 1); redrawIdle(histPos === history.length ? "" : history[histPos]); return; }
  if (d.startsWith("\x1b")) return;
  for (const ch of d.replace(/\r\n/g, "\r")) {
    if (ch === "\x0c") { term.clear(); continue; }
    if (ch === "\x03") { term.write("^C"); tw("\n"); prompt(); continue; }
    if (ch === "\r" || ch === "\n") { const line = idleBuf.trim(); if (line && history[history.length - 1] !== line) history.push(line); term.write("\r\n", () => { runIdle(line); prompt(); }); continue; }
    if (ch === "\x7f" || ch === "\b") { if (idleBuf) { idleBuf = idleBuf.slice(0, -1); term.write("\b \b"); } continue; }
    if (ch >= " ") { idleBuf += ch; term.write(ch); }
  }
}
function runIdle(line) {
  if (!line) return;
  const cmd = line.split(/\s+/)[0].toLowerCase();
  if (cmd === "clear" || cmd === "cls") { term.clear(); return; }
  tw(`${A.dim}${line}: not available outside Run in this environment${A.reset}\n`);
}
function header(lang) { const d = LANGUAGES[lang]; term.write("\r\x1b[2K"); tw(`${PROMPT}${A.dim}${d.cmd}${A.reset}\n`); }
function footer() { term.write("", () => term.write(term.buffer.active.cursorX === 0 ? "" : "\r\n", prompt)); }
function finishDiag(lang, text, rc, signal, cls) {
  const items = diagnose(lang, text, { rc, signal, file: LANGUAGES[lang].file, cls });
  S.getState().setProblems(items); setMarkers(items);
  const hasErr = items.some(i => i.kind !== "warning");
  if (hasErr) S.getState().setDock({ view: "problems", open: true });
  return hasErr;
}

/* ---------- run ---------- */
export async function run({ lang, code, provider }) {
  if (mode !== "idle") stop();
  const id = ++runId; currentLang = lang; currentCode = code; transcript = ""; lineBuf = ""; t0 = performance.now();
  const st = S.getState(); st.setProblems([]); setMarkers([]); st.setOutput(""); st.setDock({ view: st.dock.view === "problems" ? "terminal" : st.dock.view, open: true });
  st.setRun({ state: "starting", rc: null, ms: 0, provider, note: "", phase: LANGUAGES[lang].wandbox || ["c", "cpp", "java", "csharp"].includes(lang) ? "compiling" : "running" });
  header(lang); term.focus();
  if (provider === "sandbox") return runServer(id, lang, code);
  return runFallback(id, lang, code);
}
export function stop() {
  if (mode === "server" && conn) { conn.kill(); conn.close(); }
  const wasActive = mode !== "idle";
  mode = "idle"; conn = null; fb = null; runId++;
  if (wasActive) { tw(`\n${A.red}^C interrupted${A.reset}\n`); prompt(); S.getState().setRun({ state: "interrupted", phase: "" }); }
}

function runServer(id, lang, code) {
  mode = "server"; let pilTail = false;
  conn = runOnServer({ lang, code, cols: term.cols, rows: term.rows,
    onStart: () => { if (id === runId) S.getState().setRun({ state: LANGUAGES[lang].cmd.includes("&&") ? "compiling" : "running" }); },
    onOut: d => { if (id !== runId) return; if (lang === "pil") { if (pilTail) return; const i = (transcript + d).indexOf("\r\nExecution time:"); if (i >= 0) { const keep = i - transcript.length; pilTail = true; d = keep > 0 ? d.slice(0, keep) : ""; } } term.write(d); transcript += d; },
    onExit: ({ code: rc, signal, ms, reason }) => {
      if (id !== runId) return; mode = "idle"; conn = null;
      const text = stripAnsi(transcript);
      const hasErr = finishDiag(lang, text, rc, reason === "timeout" ? "time limit" : "", LANGUAGES[lang].classOf ? LANGUAGES[lang].classOf(code) : "Main");
      S.getState().setOutput(text);
      const ok = rc === 0 && !hasErr; footer();
      S.getState().setRun({ state: ok ? "done" : "failed", rc, ms, phase: "", note: reason && reason !== "killed" ? reason : "" });
    },
    onError: message => { if (id !== runId) return; mode = "idle"; conn = null; tw(`${A.red}${message}${A.reset}\n`); prompt(); S.getState().setRun({ state: "failed", rc: -1, phase: "" }); S.getState().setProblems([{ kind: "error", line: 0, col: 0, msg: message, hint: "" }]); },
  });
}

/* ---------- fallback (batch executors with local line editing) ---------- */
async function runFallback(id, lang, code) {
  mode = "fallback"; fb = { stdin: "", consumed: 0, waiting: false, eof: false, cls: "Main" };
  await fallbackStep(id, lang, code, false);
}
function localKey(ch) {
  if (!fb) return;
  if (ch === "\x03") return stop();
  if (ch === "\x04") { if (fb.waiting) { fb.eof = true; fb.waiting = false; tw(`${A.dim}^D${A.reset}\n`); fallbackStep(runId, currentLang, currentCode, true); } return; }
  if (ch === "\x0c") return term.clear();
  if (fb.busy) return;
  if (ch === "\r" || ch === "\n") { tw("\n"); const line = lineBuf; lineBuf = ""; fb.stdin += line + "\n"; if (fb.waiting) { fb.waiting = false; fallbackStep(runId, currentLang, currentCode, true); } return; }
  if (ch === "\x7f" || ch === "\b") { if (lineBuf) { lineBuf = lineBuf.slice(0, -1); term.write("\b \b"); } return; }
  if (ch >= " " && ch !== "\x1b") { lineBuf += ch; term.write(ch); }
}
async function fallbackStep(id, lang, code, cont) {
  const st = S.getState(); fb.busy = true; st.setRun({ state: cont ? "running" : (LANGUAGES[lang].wandbox && !["py", "lua"].includes(LANGUAGES[lang].wandbox.ext) ? "compiling" : "running") });
  let r;
  try {
    if (lang === "pil") { const p = await runPilWasm(code, fb.stdin, { eof: fb.eof }); r = { out: p.out, err: p.crash ? "The interpreter crashed: " + p.crash : "", compiler: "", rc: p.rc, signal: "", need: p.need, runtime: p.runtime }; }
    else r = await runOnWandbox(lang, code, fb.stdin, { eof: fb.eof });
  } catch (e) { r = { out: "", err: e.message, compiler: "", rc: -1, signal: "", need: false }; }
  if (id !== runId || !fb) return;
  fb.busy = false;
  const cut = r.need ? r.out.length : r.out.length;
  if (cut > fb.consumed) { tw(r.out.slice(fb.consumed, cut)); transcript += r.out.slice(fb.consumed, cut); fb.consumed = cut; }
  if (r.need) { fb.waiting = true; st.setRun({ state: "waiting" }); term.focus(); return; }
  const ms = Math.round(performance.now() - t0);
  if (r.compiler) { st.setOutput(r.compiler + "\n"); }
  if (r.err) tw(`${A.red}${r.err.trimEnd()}${A.reset}\n`);
  const text = [r.compiler, r.err, r.out].filter(Boolean).join("\n");
  st.setOutput([r.compiler, r.err].filter(Boolean).join("\n") || (r.out ? r.out : ""));
  const hasErr = finishDiag(lang, text.replace(/prog\.(cc|c|cs|py|lua|pil)/g, LANGUAGES[lang].file), r.rc, r.signal, r.cls || "Main");
  const ok = r.rc === 0 && !hasErr; footer();
  mode = "idle"; fb = null;
  st.setRun({ state: ok ? "done" : "failed", rc: r.rc, ms, phase: "", note: r.runtime || "" });
}
export const isRunning = () => mode !== "idle";
