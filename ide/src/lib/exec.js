// Execution providers: the 28teh sandbox server (WebSocket + PTY) or, when it is unreachable, remote Wandbox / in-browser PIL wasm.
import { LANGUAGES, LANGS_EXTRA } from "./languages.js";

export const WS_URL = import.meta.env.VITE_WS_URL || (location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "ws://localhost:8787/ws" : "");
const httpOf = ws => ws.replace(/^ws/, "http").replace(/\/ws$/, "");

export async function probeServer() {
  if (!WS_URL) return null;
  try { const r = await fetch(httpOf(WS_URL) + "/api/runtimes", { signal: AbortSignal.timeout(2500) }); if (!r.ok) throw 0; return await r.json(); } catch { return null; }
}

/* ---- sandbox server (PTY) ---- */
export function runOnServer({ lang, code, cols, rows, onOut, onPhase, onExit, onError, onStart }) {
  const ws = new WebSocket(WS_URL);
  let closed = false;
  ws.onopen = () => ws.send(JSON.stringify({ type: "run", lang, code, cols, rows }));
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === "out") onOut(m.data); else if (m.type === "started") onStart?.(m); else if (m.type === "exit") { closed = true; onExit(m); ws.close(); } else if (m.type === "error") { closed = true; onError(m.message); ws.close(); } };
  ws.onerror = () => { if (!closed) { closed = true; onError("Lost connection to the sandbox server."); } };
  ws.onclose = () => { if (!closed) { closed = true; onError("Connection closed."); } };
  return { write: d => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "stdin", data: d })); }, resize: (c, r) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "resize", cols: c, rows: r })); }, kill: () => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "kill" })); }, close: () => ws.close() };
}

/* ---- fallback: Wandbox (batch) ---- */
const WANDBOX = "https://wandbox.org/api/compile.json";
export async function runOnWandbox(langId, code, stdin, { eof = false } = {}) {
  const d0 = LANGUAGES[langId], wb = d0.wandbox, marker = LANGS_EXTRA.NEED;
  const trimmed = stdin.replace(/\n$/, "");
  let body, cls = "prog";
  if (langId === "java") { cls = d0.classOf(code); body = { compiler: wb.compiler, stdin: trimmed, "compiler-option-raw": "-encoding\nUTF-8", "runtime-option-raw": "-Dfile.encoding=UTF-8\n-Dstdout.encoding=UTF-8\n-Dstderr.encoding=UTF-8", code: `public class prog { public static void main(String[] a) throws Exception { ${cls}.main(a); } }`, codes: [{ file: cls + ".java", code }] }; }
  else {
    const shim = !eof;
    body = { compiler: wb.compiler, stdin: trimmed, code: (shim && wb.prepend ? wb.prepend : "") + (shim && wb.transform ? wb.transform(code) : code) };
    if (shim && wb.options) body["compiler-option-raw"] = wb.options; else if (!shim && wb.options) body["compiler-option-raw"] = wb.options.split("\n").filter(o => o !== "-include" && o !== "shim.h").join("\n");
    if (shim && wb.codes) body.codes = wb.codes();
  }
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 40000);
  let resp;
  try { resp = await fetch(WANDBOX, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal }); }
  catch (e) { throw new Error(e.name === "AbortError" ? "The compiler service did not respond within 40 s." : "Cannot reach the compiler service (wandbox.org)."); }
  finally { clearTimeout(tm); }
  if (resp.status === 429) throw new Error("Too many requests – wait a moment.");
  if (!resp.ok) throw new Error("The compiler service responded with " + resp.status + ".");
  const d = await resp.json();
  const cmsg = (d.compiler_error || "").replace(/prog\.java:\d+: error:.*?\n.*?\n.*?\n/gs, "").replace(/^(?:In file included from )?shim\.h:.*(?:\n(?![^\s]).*)*\n?/gm, "").trim();
  const failed = /(^|\n)[^\n]*\b(error|Error)\b[: (]/.test(cmsg) && !(d.program_output || d.program_error);
  let perr = d.program_error || "", need = false;
  if (!eof && !failed) { if (perr.includes(marker)) { need = true; perr = perr.replace(marker, "").replace(/\n$/, ""); } else if (d0.need && d0.need.test(perr)) need = true; }
  return { out: d.program_output || "", err: need ? "" : perr, compiler: [(d.compiler_output || "").trim(), cmsg].filter(Boolean).join("\n"), rc: failed ? 1 : +(d.status ?? -1), signal: d.signal || "", need, cls };
}

/* ---- fallback: PIL in the browser (wasm worker) ---- */
export function runPilWasm(code, stdin, { eof = false, timeout = 10000 } = {}) {
  return new Promise(resolve => {
    const worker = new Worker(`${import.meta.env.BASE_URL}pil/worker.js`);
    let raw = "", needAt = -1, timer = 0;
    const finish = rc => { clearTimeout(timer); worker.terminate(); let body = raw, runtime = ""; const cut = body.lastIndexOf("\nExecution time:\n"); if (cut >= 0) { const t = body.slice(cut + 1).match(/Runtime: ([\d.]+ms)/); runtime = t ? t[1] : ""; body = body.slice(0, cut); } const isNeed = needAt >= 0 && needAt <= body.length; resolve({ out: isNeed ? body.slice(0, needAt) : body, rc, need: isNeed, runtime, crash: null }); };
    worker.onmessage = e => { const d = e.data; if (d.t === "out") raw += d.s; else if (d.t === "need") { needAt = d.at; clearTimeout(timer); timer = setTimeout(() => finish(0), 400); } else if (d.t === "crash") { clearTimeout(timer); worker.terminate(); resolve({ out: raw, rc: -1, need: false, crash: d.s }); } else if (d.t === "done") finish(d.rc); };
    worker.onerror = e => { clearTimeout(timer); worker.terminate(); resolve({ out: raw, rc: -1, need: false, crash: e.message || "worker error" }); };
    timer = setTimeout(() => { worker.terminate(); resolve({ out: raw, rc: 137, need: false, crash: null }); }, timeout);
    worker.postMessage({ code, stdin, eof });
  });
}
