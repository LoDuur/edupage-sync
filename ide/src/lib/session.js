// Owns the xterm instance and the run lifecycle. Output streams into the terminal; problems/output land in the store.
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useStore } from "../store.js";
import { LANGUAGES } from "./languages.js";
import { runOnServer, runOnWandbox, runPilWasm } from "./exec.js";
import { diagnose, stripAnsi } from "./diagnose.js";
import { setMarkers } from "./editor.js";

const A = { dim: "\x1b[38;5;243m", red: "\x1b[38;5;203m", yellow: "\x1b[38;5;221m", green: "\x1b[38;5;114m", cyan: "\x1b[38;5;117m", violet: "\x1b[38;5;147m", reset: "\x1b[0m" };
const S = useStore;
let term, fit, container;
let conn = null, mode = "idle", transcript = "", lineBuf = "", runId = 0, t0 = 0, currentLang = null, currentCode = "";
let fb = null; // fallback (batch) state: { stdin, consumed, waiting, eof }
const onDataHandlers = [];
const tw = s => term && term.write(String(s).replace(/\r?\n/g, "\r\n"));

export function attach(el) {
  if (term) { if (container !== el) { el.appendChild(container); } fit.fit(); return term; }
  container = document.createElement("div"); container.style.cssText = "position:absolute;inset:0"; el.appendChild(container);
  term = new Terminal({ fontFamily: '"JetBrains Mono","Fira Code",Menlo,monospace', fontSize: 13, lineHeight: 1.3, letterSpacing: 0, cursorBlink: true, cursorStyle: "bar", cursorWidth: 2, scrollback: 4000, allowProposedApi: true,
    theme: { background: "#0f0f0f", foreground: "#d6d6d6", cursor: "#c7c9ff", cursorAccent: "#0f0f0f", selectionBackground: "#2b305066", black: "#1a1a1a", red: "#ff6b6b", green: "#7ed4a0", yellow: "#f5b74f", blue: "#82aaff", magenta: "#c3a6ff", cyan: "#7fd1c7", white: "#d6d6d6", brightBlack: "#5c5f6a", brightRed: "#ff8080", brightGreen: "#96e6b3", brightYellow: "#ffd07a", brightBlue: "#9dbcff", brightMagenta: "#d7c3ff", brightCyan: "#9fe0d8", brightWhite: "#ffffff" } });
  fit = new FitAddon(); term.loadAddon(fit); term.open(container); fit.fit();
  term.parser.registerOscHandler(7777, data => { if (data === "run") { S.getState().setRun({ phase: "running", state: "running" }); } return true; });
  term.onData(d => { for (const h of onDataHandlers) h(d); if (mode === "server" && conn) conn.write(d); else if (mode === "fallback") for (const ch of d.replace(/\r\n/g, "\r")) localKey(ch); else for (const ch of d) idleKey(ch); });
  new ResizeObserver(() => { try { fit.fit(); if (conn) conn.resize(term.cols, term.rows); } catch {} }).observe(el);
  tw(`${A.dim}28teh · program input and output appear here. Press ⌘/Ctrl+Enter to run.${A.reset}\n`);
  if (import.meta.env.DEV) window.__28 = { term, run, stop };
  return term;
}
export const focus = () => term && term.focus();
export const clear = () => { if (term) { term.clear(); } };
export const resize = () => { try { fit && fit.fit(); } catch {} };
export const onData = h => { onDataHandlers.push(h); return () => onDataHandlers.splice(onDataHandlers.indexOf(h), 1); };

function idleKey(ch) { if (ch === "\x0c") term.clear(); }
function header(lang) { const d = LANGUAGES[lang]; tw(`${A.violet}❯${A.reset} ${A.dim}${d.cmd}${A.reset}\n`); }
function footer(rc, ms, ok, extra = "") { const t = ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`; tw(`\n${ok ? A.dim : A.red}⏎ exited with code ${rc}${extra} · ${t}${A.reset}\n\n`); }
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
  st.setRun({ state: "starting", rc: null, ms: 0, provider, phase: LANGUAGES[lang].wandbox || ["c", "cpp", "java", "csharp"].includes(lang) ? "compiling" : "running" });
  header(lang); term.focus();
  if (provider === "sandbox") return runServer(id, lang, code);
  return runFallback(id, lang, code);
}
export function stop() {
  if (mode === "server" && conn) { conn.kill(); conn.close(); }
  const wasActive = mode !== "idle";
  mode = "idle"; conn = null; fb = null; runId++;
  if (wasActive) { tw(`\n${A.red}^C interrupted${A.reset}\n\n`); S.getState().setRun({ state: "interrupted", phase: "" }); }
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
      const ok = rc === 0 && !hasErr; footer(rc, ms, ok, reason && reason !== "killed" ? ` (${reason})` : "");
      S.getState().setRun({ state: ok ? "done" : "failed", rc, ms, phase: "" });
    },
    onError: message => { if (id !== runId) return; mode = "idle"; conn = null; tw(`${A.red}${message}${A.reset}\n\n`); S.getState().setRun({ state: "failed", rc: -1, phase: "" }); S.getState().setProblems([{ kind: "error", line: 0, col: 0, msg: message, hint: "" }]); },
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
  const ok = r.rc === 0 && !hasErr; footer(r.rc, ms, ok, r.runtime ? ` · ${r.runtime}` : "");
  mode = "idle"; fb = null;
  st.setRun({ state: ok ? "done" : "failed", rc: r.rc, ms, phase: "" });
}
export const isRunning = () => mode !== "idle";
