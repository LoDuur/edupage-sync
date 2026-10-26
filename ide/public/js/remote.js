import { settings } from "./settings.js";
import { LANGUAGE_META } from "./languages.js";
import { createXterm, outcomeOf, copyTerminal, fileLinkProvider } from "./terminal.js";
import { stripAnsi } from "./diagnose.js";
import { execute, engineName, prepareEngine } from "./engines.js";

export { prepareEngine };
const DIM = "\x1b[2m", RED = "\x1b[31m", RESET = "\x1b[0m";
const crlf = s => s.replace(/\r?\n/g, "\r\n");

export function createRemoteTerminal({ element, onStatus, onRunState, onLink }) {
  const { term, fit } = createXterm(element);
  let run = idleRun(), lastRun = null, stdin = "", consumed = 0, line = "", transcript = "", controller = null, hinted = false, echoQueue = "", compilerShown = false;
  function idleRun() { return { phase: "idle", language: null, file: null, startedAt: 0, runAt: 0 }; }
  const setRun = patch => { run = { ...run, ...patch }; onRunState(run); };
  const print = text => {
    if (!text) return;
    term.write(crlf(text));
    transcript += stripAnsi(text);
    if (transcript.length > 32_000) transcript = transcript.slice(-16_000);
  };

  term.registerLinkProvider(fileLinkProvider(term, () => lastRun?.file, onLink));
  term.write(`${DIM}Python and PIL run in your browser; C, C++, C# and Lua on godbolt.org; Java, JavaScript and Bash on wandbox.org. Press Run, then type input here when the program asks for it.${RESET}\r\n`);

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
    let seen = 0;
    const onOutput = text => {
      if (run.startedAt !== id) return;
      if (!run.runAt) setRun({ phase: "running", runAt: Date.now() });
      const start = seen; seen += text.length;
      if (seen <= consumed) return;
      if (!run.firstOutputAt) run.firstOutputAt = Date.now();
      print(text.slice(Math.max(0, consumed - start)));
      consumed = seen;
    };
    const onCompiler = text => { if (run.startedAt === id && !compilerShown) { compilerShown = true; print(text + "\n"); } };
    const onLoading = () => { if (run.startedAt === id) setRun({ phase: "loading" }); };
    let result;
    try {
      result = await execute(target.language, { code: target.code, file: target.file, stdin: sent, eof, signal: controller.signal, onOutput, onCompiler, onLoading });
    } catch (e) {
      if (e.name === "AbortError" || run.startedAt !== id) return;
      print(`${RED}${e.message}${RESET}\n`);
      return finish({ exitCode: 1, started: false, compiled: false });
    }
    if (run.startedAt !== id) return;
    if (!run.runAt && result.compiled) setRun({ runAt: Date.now() });
    if (echoQueue) { term.write(echoQueue); echoQueue = ""; }
    if (result.needs) { if (stdin.length > sent.length) return step(false); setRun({ phase: "waiting" }); term.focus(); return; }
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
    lastRun = target; stdin = ""; consumed = 0; line = ""; transcript = ""; echoQueue = ""; compilerShown = false;
    if (settings.clearOnRun) term.clear();
    term.write(`${DIM}${target.file} – ${engineName(target.language)}${RESET}\r\n`);
    setRun({ phase: "pending", language: target.language, file: target.file, startedAt: Date.now(), runAt: 0, firstOutputAt: 0 });
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
