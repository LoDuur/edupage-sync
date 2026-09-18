import pty from "node-pty";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LANGUAGES } from "./languages.js";
import { sandboxCommand, sandboxEnv, sandboxIdentity, MODE } from "./sandbox.js";

const RUN_DIR = process.env.RUN_DIR || path.join(tmpdir(), "28teh-runs");
const MAX_CODE = 200 * 1024, MAX_OUTPUT = 2 * 1024 * 1024;

// One Run per websocket. Lifecycle: workspace -> pty(firejail) -> stream -> exit|timeout|kill -> cleanup.
export class Run {
  constructor(ws, { lang, code, cols = 100, rows = 30 }) {
    this.ws = ws; this.langId = lang; this.lang = LANGUAGES[lang]; this.code = String(code || "");
    this.cols = Math.min(Math.max(+cols || 100, 20), 300); this.rows = Math.min(Math.max(+rows || 30, 5), 120);
    this.term = null; this.dir = null; this.done = false; this.bytes = 0; this.t0 = Date.now(); this.timer = null;
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  async start() {
    if (!this.lang) return this.fail("Unknown language.");
    if (this.code.length > MAX_CODE) return this.fail("The file is too large (200 KB limit).");
    try {
      await rm(RUN_DIR, { recursive: false, force: true }).catch(() => {});
      await (await import("node:fs/promises")).mkdir(RUN_DIR, { recursive: true, mode: 0o1777 });
      this.dir = await mkdtemp(path.join(RUN_DIR, "ws-"));
      await chmod(this.dir, 0o777);
      await writeFile(path.join(this.dir, this.lang.file), this.code, "utf8");
      const { file, args } = sandboxCommand(this.lang, this.dir);
      this.term = pty.spawn(file, args, { name: "xterm-256color", cols: this.cols, rows: this.rows, cwd: this.dir, env: sandboxEnv(this.dir), ...sandboxIdentity() });
    } catch (e) { return this.fail("Could not start the sandbox: " + e.message); }
    this.send({ type: "started", mode: MODE, pid: this.term.pid });
    this.term.onData(d => { this.bytes += d.length; if (this.bytes > MAX_OUTPUT) { this.send({ type: "out", data: "\r\n\u001b[31m[output limit reached – process killed]\u001b[0m\r\n" }); return this.kill("output-limit"); } this.send({ type: "out", data: d }); });
    this.term.onExit(({ exitCode, signal }) => this.finish(exitCode, signal));
    this.timer = setTimeout(() => { this.send({ type: "out", data: `\r\n\u001b[31m[time limit of ${this.lang.wall} s exceeded – process killed]\u001b[0m\r\n` }); this.kill("timeout"); }, this.lang.wall * 1000 + 1500);
  }
  write(data) { if (this.term && !this.done) this.term.write(String(data)); }
  resize(cols, rows) { if (this.term && !this.done) { try { this.term.resize(Math.min(Math.max(+cols || 100, 20), 300), Math.min(Math.max(+rows || 30, 5), 120)); } catch {} } }
  kill(reason = "killed") { this.reason = reason; if (this.term && !this.done) { try { this.term.kill("SIGKILL"); } catch {} } }
  fail(message) { this.send({ type: "error", message }); this.cleanup(); }
  finish(code, signal) {
    if (this.done) return; this.done = true; clearTimeout(this.timer);
    this.send({ type: "exit", code, signal, ms: Date.now() - this.t0, reason: this.reason || null });
    this.cleanup();
  }
  async cleanup() { this.done = true; clearTimeout(this.timer); if (this.dir) { const d = this.dir; this.dir = null; await rm(d, { recursive: true, force: true }).catch(() => {}); } }
}
