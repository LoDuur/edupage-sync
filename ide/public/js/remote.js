import { settings } from "./settings.js";
import { LANGUAGE_META } from "./languages.js";
import { createXterm, outcomeOf, copyTerminal, fileLinkProvider } from "./terminal.js";
import { stripAnsi } from "./diagnose.js";

const WANDBOX = "https://wandbox.org/api/compile.json";
const REQUEST_TIMEOUT_MS = 45_000;
const PIL_TIMEOUT_MS = 10_000;
const NEED = "\x1e__NEED_INPUT__\x1e";
const DIM = "\x1b[2m", RED = "\x1b[31m", RESET = "\x1b[0m";

const CSHIM = `#include <stdio.h>
#include <stdlib.h>
#ifdef __cplusplus
#include <iostream>
#include <streambuf>
extern "C" {
#endif
__attribute__((unused)) static void __vt_need(void) { fflush(stdout); fputs("\\n${NEED}", stderr); fflush(stderr); exit(0); }
__attribute__((unused)) static void __vt_chk(void) { int c = getc(stdin); if (c == EOF) __vt_need(); ungetc(c, stdin); }
#ifdef __cplusplus
}
struct __VtBuf : std::streambuf {
  std::streambuf* in; char nl; bool any; int last;
  explicit __VtBuf(std::streambuf* b) : in(b), nl('\\n'), any(false), last(0) {}
  int underflow() override { int c = in->sgetc(); if (c != EOF) return c; if (any && last != '\\n') { last = '\\n'; setg(&nl, &nl, &nl + 1); return '\\n'; } __vt_need(); return EOF; }
  int uflow() override { if (gptr() && gptr() < egptr()) { gbump(1); return '\\n'; } int c = in->sbumpc(); if (c != EOF) { any = true; last = c; return c; } if (any && last != '\\n') { last = '\\n'; return '\\n'; } __vt_need(); return EOF; }
  int pbackfail(int c) override { return c == EOF ? in->sungetc() : in->sputbackc((char)c); }
};
static struct __VtInit { __VtInit() { static __VtBuf b(std::cin.rdbuf()); std::cin.rdbuf(&b); } } __vt_init;
#endif
#define scanf(...) (__vt_chk(), scanf(__VA_ARGS__))
#define getchar() (__vt_chk(), getchar())
#define fgets(s, n, f) (((f) == stdin ? (__vt_chk(), 0) : 0), fgets((s), (n), (f)))
#define getc(f) (((f) == stdin ? (__vt_chk(), 0) : 0), getc(f))
#define fgetc(f) (((f) == stdin ? (__vt_chk(), 0) : 0), fgetc(f))
`;
const LUASHIM = `do local r=io.read;io.read=function(...) local a={r(...)} if a[1]==nil then io.stdout:flush() io.stderr:write("${NEED}") os.exit(0) end return table.unpack(a) end end;`;
const csharpShim = code => {
  const main = /(static\s+(?:async\s+)?(?:void|int)\s+Main\s*\([^)]*\)\s*\{)/;
  if (!main.test(code)) return code;
  return code.replace(main, "$1Console.SetIn(new __Vt(Console.In));")
    + `\nclass __Vt : System.IO.TextReader { System.IO.TextReader r; public __Vt(System.IO.TextReader x){r=x;} void N(){System.Console.Out.Flush();System.Console.Error.Write("${NEED}");System.Environment.Exit(0);} public override string ReadLine(){var l=r.ReadLine();if(l==null)N();return l;} public override int Read(){var c=r.Read();if(c<0)N();return c;} public override int Peek(){var c=r.Peek();if(c<0)N();return c;} public override string ReadToEnd(){return r.ReadToEnd();} }\n`;
};

const COMPILERS = {
  python: { compiler: "cpython-3.13.8", name: "Python 3.13", ext: "py", needs: /EOFError: EOF when reading a line/ },
  javascript: { compiler: "nodejs-20.17.0", name: "Node.js 20", ext: "js" },
  java: { compiler: "openjdk-jdk-22+36", name: "OpenJDK 22", ext: "java", needs: /java\.util\.NoSuchElementException/ },
  c: { compiler: "gcc-13.2.0-c", name: "GCC 13", ext: "c", options: "-Wall\n-lm", shim: true },
  cpp: { compiler: "gcc-13.2.0", name: "GCC 13", ext: "cc", options: "-std=c++20\n-Wall", shim: true },
  csharp: { compiler: "mono-6.12.0.199", name: "Mono 6.12", ext: "cs", transform: csharpShim },
  lua: { compiler: "lua-5.4.7", name: "Lua 5.4", ext: "lua", prepend: LUASHIM },
  bash: { compiler: "bash", name: "Bash 5.2", ext: "sh" },
};
export const REMOTE_LANGUAGES = [...Object.keys(COMPILERS), "pil"];
export const engineName = language => language === "pil" ? "PIL, in your browser" : `${COMPILERS[language]?.name || language} on wandbox.org`;

const javaClassOf = code => (code.match(/public\s+(?:final\s+)?class\s+([A-Za-z_]\w*)/) || code.match(/class\s+([A-Za-z_]\w*)/) || [])[1] || "Main";

function wandboxBody(language, code, stdin, eof) {
  const c = COMPILERS[language], shim = !eof;
  if (language === "java") {
    const cls = javaClassOf(code);
    return { compiler: c.compiler, stdin, code: `public class prog { public static void main(String[] a) throws Exception { ${cls}.main(a); } }`, codes: [{ file: cls + ".java", code }], "compiler-option-raw": "-encoding\nUTF-8", "runtime-option-raw": "-Dfile.encoding=UTF-8\n-Dstdout.encoding=UTF-8\n-Dstderr.encoding=UTF-8" };
  }
  const body = { compiler: c.compiler, stdin, code: (shim && c.prepend || "") + (shim && c.transform ? c.transform(code) : code) };
  if (c.options) body["compiler-option-raw"] = (shim && c.shim ? "-include\nshim.h\n" : "") + c.options;
  if (shim && c.shim) body.codes = [{ file: "shim.h", code: CSHIM }];
  return body;
}

async function runOnWandbox(language, code, stdin, eof, signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response;
  try { response = await fetch(WANDBOX, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(wandboxBody(language, code, stdin, eof)), signal: AbortSignal.any([signal, timeout]) }); }
  catch (e) {
    if (signal.aborted) throw e;
    throw new Error(timeout.aborted ? "The compiler service (wandbox.org) did not answer within 45 s." : "Cannot reach the compiler service (wandbox.org). Check your connection.");
  }
  if (response.status === 429) throw new Error("The compiler service is busy – wait a few seconds and run again.");
  if (!response.ok) throw new Error(`The compiler service answered with an error (${response.status}).`);
  const d = await response.json();
  const compilerText = [d.compiler_output, d.compiler_error].filter(Boolean).join("").replace(/^(?:In file included from )?shim\.h:.*(?:\n(?!\S).*)*\n?/gm, "").replace(/prog\.java:\d+: error:.*?\n.*?\n.*?\n/gs, "");
  const failed = /(^|\n)[^\n]*\berror\b/i.test(compilerText) && !d.program_output && !d.program_error;
  let err = d.program_error || "", needs = false;
  if (!eof && !failed) {
    if (err.includes(NEED)) { needs = true; err = err.replace(NEED, "").replace(/\n$/, ""); }
    else if (COMPILERS[language].needs?.test(err)) needs = true;
  }
  const signalCode = d.signal ? ({ Killed: 137, "Segmentation fault": 139, "CPU time limit exceeded": 152, Aborted: 134 }[d.signal] || 137) : 0;
  return { out: d.program_output || "", err: needs ? "" : err, compiler: compilerText.trim(), exitCode: failed ? 1 : signalCode || +(d.status ?? 1), compiled: !failed, needs };
}

function runPil(code, stdin, eof) {
  return new Promise(resolve => {
    const worker = new Worker(new URL("../pil/worker.js", import.meta.url));
    let out = "", needAt = -1, timer = 0;
    const finish = result => { clearTimeout(timer); worker.terminate(); resolve(result); };
    const done = exitCode => finish({ out: needAt >= 0 ? out.slice(0, needAt) : out, err: "", compiler: "", exitCode: needAt >= 0 ? 0 : exitCode, compiled: true, needs: needAt >= 0 });
    worker.onmessage = ({ data }) => {
      if (data.t === "out") out += data.s;
      else if (data.t === "need") { needAt = data.at; clearTimeout(timer); timer = setTimeout(() => done(0), 400); }
      else if (data.t === "crash") finish({ out, err: "The PIL interpreter crashed: " + data.s, compiler: "", exitCode: 1, compiled: true, needs: false });
      else if (data.t === "done") done(data.rc);
    };
    worker.onerror = e => finish({ out, err: "The PIL interpreter could not start: " + (e.message || "worker error"), compiler: "", exitCode: 1, compiled: true, needs: false });
    timer = setTimeout(() => finish({ out, err: "", compiler: "", exitCode: 152, compiled: true, needs: false }), PIL_TIMEOUT_MS);
    worker.postMessage({ code, stdin, eof });
  });
}

const fromWandboxNames = (text, file) => text.replace(/\bprog\.(?:c|cc|py|cs|lua|js|sh)\b/g, file);
const crlf = s => s.replace(/\r?\n/g, "\r\n");

export function createRemoteTerminal({ element, onStatus, onRunState, onLink }) {
  const { term, fit } = createXterm(element);
  let run = idleRun(), lastRun = null, stdin = "", consumed = 0, line = "", transcript = "", controller = null, hinted = false, echoQueue = "";
  function idleRun() { return { phase: "idle", language: null, file: null, startedAt: 0, runAt: 0 }; }
  const setRun = patch => { run = { ...run, ...patch }; onRunState(run); };
  const print = text => { if (!text) return; term.write(crlf(text)); transcript = (transcript + stripAnsi(text)).slice(-8000); };

  term.registerLinkProvider(fileLinkProvider(term, () => lastRun?.file, onLink));
  term.write(`${DIM}Programs run on wandbox.org (PIL runs in your browser). Press Run, then type input here when the program asks for it.${RESET}\r\n`);

  term.onData(data => {
    if (run.phase === "idle") {
      if (!hinted) { hinted = true; term.write(`\r\n${DIM}Nothing is running. Press Run to start the program.${RESET}\r\n`); }
      return;
    }
    const echo = text => { if (run.phase === "waiting") term.write(text); else echoQueue += text; };
    for (const ch of data.replace(/\r\n/g, "\r")) {
      if (ch === "\x03") { stop(); return; }
      if (ch === "\x04") { if (run.phase === "waiting") { term.write(`${DIM}^D${RESET}\r\n`); step(true); } continue; }
      if (ch === "\r" || ch === "\n") { echo("\r\n"); stdin += line + "\n"; transcript += line + "\n"; line = ""; if (run.phase === "waiting") step(false); continue; }
      if (ch === "\x7f" || ch === "\b") { if (line) { line = line.slice(0, -1); if (run.phase === "waiting") term.write("\b \b"); else echoQueue = echoQueue.slice(0, -1); } continue; }
      if (ch >= " " && ch !== "\x1b") { line += ch; echo(ch); }
    }
  });

  async function step(eof) {
    const target = lastRun, id = run.startedAt;
    const compiles = LANGUAGE_META[target.language]?.compiles;
    setRun({ phase: compiles && !run.runAt ? "compiling" : "running" });
    controller = new AbortController();
    const sent = stdin;
    let result;
    try {
      result = target.language === "pil" ? await runPil(target.code, sent, eof) : await runOnWandbox(target.language, target.code, sent, eof, controller.signal);
    } catch (e) {
      if (controller.signal.aborted || run.startedAt !== id) return;
      print(`${RED}${e.message}${RESET}\n`);
      return finish({ exitCode: 1, started: false, compiled: false });
    }
    if (run.startedAt !== id) return;
    if (!run.runAt && result.compiled) setRun({ runAt: Date.now() });
    if (!consumed && result.compiler) print(fromWandboxNames(result.compiler, target.file) + "\n");
    if (result.out.length > consumed) { print(result.out.slice(consumed)); consumed = result.out.length; }
    if (echoQueue) { term.write(echoQueue); echoQueue = ""; }
    if (result.needs) { if (stdin.length > sent.length) return step(false); setRun({ phase: "waiting" }); term.focus(); return; }
    if (result.err) print((result.out && !result.out.endsWith("\n") ? "\n" : "") + fromWandboxNames(result.err, target.file).replace(/\n?$/, "\n"));
    finish({ exitCode: result.exitCode, started: true, compiled: result.compiled });
  }

  function finish({ exitCode, started, compiled }) {
    const outcome = outcomeOf({ exitCode, started, compiled, compiles: LANGUAGE_META[run.language]?.compiles });
    const finished = { ...run, phase: "finished", outcome, exitCode, started, endedAt: Date.now(), output: transcript };
    run = idleRun(); controller = null; line = "";
    onRunState(finished);
  }

  function stop() {
    if (run.phase === "idle") return;
    controller?.abort();
    term.write(`${DIM}^C${RESET}\r\n`);
    finish({ exitCode: 130, started: true, compiled: !!run.runAt });
  }

  function start(target) {
    if (run.phase !== "idle") return;
    lastRun = target; stdin = ""; consumed = 0; line = ""; transcript = ""; echoQueue = "";
    if (settings.clearOnRun) term.clear();
    term.write(`${DIM}${target.file} – ${engineName(target.language)}${RESET}\r\n`);
    setRun({ phase: "pending", language: target.language, file: target.file, startedAt: Date.now(), runAt: 0 });
    step(false);
  }

  setTimeout(() => onStatus("attached"), 0);
  return {
    term, fit,
    get status() { return "attached"; },
    get run() { return run; },
    get lastRun() { return lastRun; },
    focus: () => term.focus(),
    start,
    rerun(target) { stop(); start(target); },
    stop,
    restart() { stop(); term.reset(); },
    clear() { term.clear(); term.focus(); },
    copyOutput: () => copyTerminal(term),
    recentOutput: () => transcript.slice(-4000),
  };
}
