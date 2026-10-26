const NEED = "\x1e__NEED_INPUT__\x1e";
const REQUEST_TIMEOUT_MS = 45_000;
const LOCAL_TIMEOUT_MS = 30_000;
const NEED_GRACE_MS = 400;
const WANDBOX = "https://wandbox.org/api/compile.json";
const GODBOLT = "https://godbolt.org/api/compiler";
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

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

const ENGINES = {
  python: { kind: "python", name: "Python 3.14, in your browser" },
  pil: { kind: "pil", name: "PIL, in your browser" },
  c: { kind: "godbolt", compiler: "cg142", lang: "c", name: "GCC 14 on godbolt.org", options: "-std=c17 -Wall -O0 -lm", shim: true },
  cpp: { kind: "godbolt", compiler: "g142", lang: "c++", name: "GCC 14 on godbolt.org", options: "-std=c++20 -Wall -O0", shim: true },
  csharp: { kind: "godbolt", compiler: "dotnet90csharpcoreclr", lang: "csharp", name: ".NET 9 on godbolt.org", options: "", transform: csharpShim },
  lua: { kind: "godbolt", compiler: "lua547", lang: "lua", name: "Lua 5.4 on godbolt.org", options: "", prepend: LUASHIM },
  java: { kind: "wandbox", compiler: "openjdk-jdk-21+35", name: "OpenJDK 21 on wandbox.org", needs: /java\.util\.NoSuchElementException/ },
  javascript: { kind: "wandbox", compiler: "nodejs-20.17.0", name: "Node.js 20 on wandbox.org" },
  bash: { kind: "wandbox", compiler: "bash", name: "Bash 5.2 on wandbox.org" },
};
export const engineName = language => ENGINES[language]?.name || language;

const lines = list => (list || []).map(l => l.text).join("\n");
const javaClassOf = code => (code.match(/public\s+(?:final\s+)?class\s+([A-Za-z_]\w*)/) || code.match(/class\s+([A-Za-z_]\w*)/) || [])[1] || "Main";
const sourceNames = (text, file) => text.replace(/\/opt\/compiler-explorer\/[^\s:]*\/bin\/(\w+)/g, "$1").replace(/<source>|\/app\/output\.s\b|\bprog\.(?:c|cc|py|cs|lua|js|sh)\b/g, file);

async function postJson(url, body, signal, service) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response;
  try { response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.any([signal, timeout]) }); }
  catch (e) {
    if (signal.aborted) throw e;
    throw new Error(timeout.aborted ? `The compiler service (${service}) did not answer within 45 s.` : `Cannot reach the compiler service (${service}). Check your connection.`);
  }
  if (response.status === 429) throw new Error(`The compiler service (${service}) is busy – wait a few seconds and run again.`);
  if (!response.ok) throw new Error(`The compiler service (${service}) answered with an error (${response.status}).`);
  return response.json();
}

function finishBatch({ out, err, compiler, exitCode, compiled, needsBy }, { eof, file, onOutput, onCompiler }) {
  let needs = false;
  if (!eof && compiled) {
    if (err.includes("__NEED_INPUT__")) { needs = true; err = ""; }
    else if (needsBy?.test(err)) { needs = true; err = ""; }
  }
  if (compiler) onCompiler(sourceNames(compiler, file));
  if (out) onOutput(sourceNames(out, file));
  if (err && !needs) onOutput((out && !out.endsWith("\n") ? "\n" : "") + sourceNames(err, file).replace(/\n?$/, "\n"));
  return { exitCode: needs ? 0 : exitCode, compiled, needs };
}

async function runGodbolt(engine, { code, file, stdin, eof, signal, onOutput, onCompiler }) {
  const shim = !eof;
  let source = code;
  if (shim && engine.shim) source = `${CSHIM}\n#line 1 "${file}"\n${code}`;
  else if (shim && engine.prepend) source = engine.prepend + code;
  else if (shim && engine.transform) source = engine.transform(code);
  const d = await postJson(`${GODBOLT}/${engine.compiler}/compile`, {
    source, lang: engine.lang, allowStoreCodeDebug: false,
    options: { userArguments: engine.options, executeParameters: { args: [], stdin }, compilerOptions: { executorRequest: true, skipAsm: true }, filters: { execute: true }, tools: [], libraries: [] },
  }, signal, "godbolt.org");
  const build = d.buildResult || {};
  const compiled = d.didExecute !== false && !(build.code && build.code !== 0);
  const compiler = [lines(build.stdout), lines(build.stderr)].filter(Boolean).join("\n") || (compiled ? "" : lines(d.stderr));
  const stdoutText = lines(d.stdout);
  const out = stdoutText && (d.stderr?.some(l => l.text.includes("__NEED_INPUT__")) ? stdoutText : stdoutText + "\n");
  return finishBatch({ out, err: compiled ? lines(d.stderr) : "", compiler: compiled ? compiler.trim() : compiler, exitCode: !compiled ? (build.code || 1) : d.timedOut ? 124 : d.code ?? 0, compiled }, { eof, file, onOutput, onCompiler });
}

async function runWandbox(engine, language, { code, file, stdin, eof, signal, onOutput, onCompiler }) {
  const body = { compiler: engine.compiler, stdin, code };
  if (language === "java") {
    const cls = javaClassOf(code);
    Object.assign(body, { code: `public class prog { public static void main(String[] a) throws Exception { ${cls}.main(a); } }`, codes: [{ file: cls + ".java", code }], "compiler-option-raw": "-encoding\nUTF-8", "runtime-option-raw": "-Dfile.encoding=UTF-8\n-Dstdout.encoding=UTF-8\n-Dstderr.encoding=UTF-8" });
  }
  const d = await postJson(WANDBOX, body, signal, "wandbox.org");
  const compiler = [d.compiler_output, d.compiler_error].filter(Boolean).join("").replace(/prog\.java:\d+: error:.*?\n.*?\n.*?\n/gs, "");
  const compiled = !(/(^|\n)[^\n]*\berror\b/i.test(compiler) && !d.program_output && !d.program_error);
  const signalCode = d.signal ? ({ Killed: 137, "Segmentation fault": 139, "CPU time limit exceeded": 152, Aborted: 134 }[d.signal] || 137) : 0;
  return finishBatch({ out: d.program_output || "", err: d.program_error || "", compiler: compiler.trim(), exitCode: compiled ? signalCode || +(d.status ?? 1) : 1, compiled, needsBy: engine.needs }, { eof, file, onOutput, onCompiler });
}

function createLocalEngine(makeWorker, readyMessage) {
  let worker = null, ready = null;
  const kill = () => { worker?.terminate(); worker = null; ready = null; };
  const replace = () => { kill(); start(); };
  function start() {
    if (worker) return ready;
    worker = makeWorker();
    ready = readyMessage ? new Promise((resolve, reject) => {
      const onMessage = ({ data }) => {
        if (data.type === "ready") { worker.removeEventListener("message", onMessage); resolve(); }
        else if (data.type === "failed") { kill(); reject(new Error(data.error)); }
      };
      worker.addEventListener("message", onMessage);
      worker.onerror = e => { kill(); reject(new Error(e.message || "The interpreter could not start.")); };
    }) : Promise.resolve();
    ready.catch(() => {});
    return ready;
  }
  async function run({ code, file, stdin, eof, signal, onOutput, onLoading }) {
    if (!worker && readyMessage) onLoading?.();
    await Promise.race([start(), new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")), { once: true }))]);
    const current = worker;
    return new Promise((resolve, reject) => {
      let timer = 0, settled = false;
      const settle = (result, keep) => {
        if (settled) return; settled = true;
        clearTimeout(timer); current.removeEventListener("message", onMessage); signal.removeEventListener("abort", onAbort);
        if (!keep) replace();
        resolve(result);
      };
      const onMessage = ({ data }) => {
        if (data.type === "out") onOutput(data.text);
        else if (data.type === "need") { clearTimeout(timer); timer = setTimeout(() => settle({ exitCode: 0, compiled: true, needs: true }, false), NEED_GRACE_MS); }
        else if (data.type === "done") settle({ exitCode: data.needs ? 0 : data.exitCode, compiled: true, needs: !!data.needs || data.sawNeed === true }, true);
        else if (data.type === "crash") { onOutput(`The interpreter crashed: ${data.error}\n`); settle({ exitCode: 1, compiled: true, needs: false }, false); }
      };
      const onAbort = () => { settled = true; clearTimeout(timer); current.removeEventListener("message", onMessage); replace(); reject(new DOMException("stopped", "AbortError")); };
      current.addEventListener("message", onMessage);
      signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => { onOutput(`\nTime limit (${LOCAL_TIMEOUT_MS / 1000} s) reached – the program was stopped.\n`); settle({ exitCode: 124, compiled: true, needs: false }, false); }, LOCAL_TIMEOUT_MS);
      current.postMessage({ code, file, stdin, eof });
    });
  }
  return { run, prepare: () => start() };
}

const python = createLocalEngine(() => new Worker(new URL(`../py/worker.js?pyodide=${encodeURIComponent(PYODIDE)}`, import.meta.url), { type: "module" }), true);
const pil = createLocalEngine(() => new Worker(new URL("../pil/worker.js", import.meta.url)), false);

export function prepareEngine(language) {
  if (ENGINES[language]?.kind === "python") python.prepare();
}

export function execute(language, options) {
  const engine = ENGINES[language];
  if (!engine) return Promise.reject(new Error(`${language} cannot run here.`));
  if (engine.kind === "python") return python.run(options);
  if (engine.kind === "pil") return pil.run(options);
  if (engine.kind === "godbolt") return runGodbolt(engine, options);
  return runWandbox(engine, language, options);
}
