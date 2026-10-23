import pty from "node-pty";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, lstatSync, readlinkSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin");
export const IDLE_MS = (+process.env.IDLE_MINUTES || 10) * 60_000;
export const MAX_PER_IP = +process.env.MAX_PER_IP || 2;
export const MAX_TOTAL = +process.env.MAX_TOTAL || 20;
const MAX_PROCESSES = +process.env.MAX_PROCESSES || 256;
const RUN_DIR = process.env.RUN_DIR || path.join(tmpdir(), "28teh-sessions");
const SWEEP_MS = 60_000;
const OUTPUT_BYTES_PER_SECOND = 1024 * 1024;
const FLUSH_MS = 16;
const ETC_ENTRIES = /^(alternatives|ld\.so\.cache|ld\.so\.conf(\.d)?|localtime|java.*|mono|terminfo|inputrc)$/;

const which = bin => { try { return execFileSync("/bin/sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).trim() || null; } catch { return null; } };

function sandboxMounts() {
  const args = [];
  for (const name of ["bin", "sbin", "lib", "lib32", "lib64", "libx32"]) {
    const p = "/" + name;
    try {
      const st = lstatSync(p);
      if (st.isSymbolicLink()) args.push("--symlink", readlinkSync(p), p);
      else if (st.isDirectory()) args.push("--ro-bind", p, p);
    } catch {}
  }
  let etc = [];
  try { etc = readdirSync("/etc").filter(n => ETC_ENTRIES.test(n)); } catch {}
  for (const n of etc) args.push("--ro-bind-try", "/etc/" + n, "/etc/" + n);
  return args;
}

function bwrapArgs(workdir, env) {
  const args = [
    "--unshare-all", "--die-with-parent", "--cap-drop", "ALL", "--hostname", "sandbox",
    "--ro-bind", "/usr", "/usr", ...sandboxMounts(),
    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
    "--bind", workdir, "/work", "--ro-bind", BIN, "/opt/compiler", "--chdir", "/work", "--clearenv",
  ];
  for (const [k, v] of Object.entries(env)) args.push("--setenv", k, v);
  return args;
}

function resolveMode() {
  const wanted = (process.env.SANDBOX || "auto").toLowerCase();
  if (wanted === "off") return { mode: "off", reason: "" };
  const bwrap = which("bwrap");
  if (!bwrap) return { mode: "unavailable", reason: "bubblewrap is not installed (apt install bubblewrap). For local development only, set SANDBOX=off." };
  try { execFileSync(bwrap, [...bwrapArgs(tmpdir(), {}), "--", "/bin/true"], { stdio: "pipe", timeout: 5000 }); }
  catch (e) { return { mode: "unavailable", reason: `bubblewrap cannot create a sandbox here (${String(e.stderr || e.message).trim().split("\n")[0]}). User namespaces must be enabled.` }; }
  return { mode: "bwrap", reason: "", bwrap };
}

export const SANDBOX = resolveMode();

const sessions = new Map();

export const countForIp = ip => [...sessions.values()].filter(s => s.ip === ip).length;
export const total = () => sessions.size;
export const get = id => sessions.get(id);

export function prepareRunDir() {
  rmSync(RUN_DIR, { recursive: true, force: true });
  mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 });
}

function spawnShell(workdir, cols, rows) {
  const env = { PATH: "/opt/compiler:/usr/local/bin:/usr/bin:/bin", HOME: "/work", TERM: "xterm-256color", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PYTHONUNBUFFERED: "1", PYTHONDONTWRITEBYTECODE: "1" };
  const options = { name: "xterm-256color", cols, rows, cwd: workdir };
  if (SANDBOX.mode === "bwrap") return pty.spawn(SANDBOX.bwrap, [...bwrapArgs(workdir, { ...env, SANDBOX_NPROC: String(MAX_PROCESSES) }), "--", "/bin/bash", "--rcfile", "/opt/compiler/sandbox.bashrc", "-i"], { ...options, env: {} });
  return pty.spawn("/bin/bash", ["--rcfile", path.join(BIN, "sandbox.bashrc"), "-i"], { ...options, env: { ...env, PATH: `${BIN}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`, HOME: workdir, BASH_SILENCE_DEPRECATION_WARNING: "1" } });
}

export function create(id, { ip, cols = 100, rows = 30, onOutput, onExit }) {
  if (SANDBOX.mode === "unavailable") throw new Error(SANDBOX.reason);
  destroy(id, "restart");
  const dir = mkdtempSync(path.join(RUN_DIR, "s-"));
  const term = spawnShell(dir, cols, rows);
  const s = { term, dir, ip, lastInput: Date.now(), createdAt: Date.now(), pending: "", flushTimer: 0, windowStart: Date.now(), windowBytes: 0, paused: false };
  const flush = () => { s.flushTimer = 0; if (s.pending) { onOutput(s.pending); s.pending = ""; } };
  term.onData(chunk => {
    s.pending += chunk;
    if (!s.flushTimer) s.flushTimer = setTimeout(flush, FLUSH_MS);
    const now = Date.now();
    if (now - s.windowStart >= 1000) { s.windowStart = now; s.windowBytes = 0; }
    s.windowBytes += chunk.length;
    if (s.windowBytes > OUTPUT_BYTES_PER_SECOND && !s.paused) {
      s.paused = true; term.pause();
      setTimeout(() => { s.paused = false; s.windowStart = Date.now(); s.windowBytes = 0; if (sessions.get(id) === s) term.resume(); }, 1000);
    }
  });
  term.onExit(() => { if (sessions.get(id) !== s) return; flush(); destroy(id, "shell exited"); onExit?.(); });
  sessions.set(id, s);
  return s;
}

export function write(id, data) { const s = sessions.get(id); if (!s) return false; s.lastInput = Date.now(); s.term.write(data); return true; }
export function resize(id, cols, rows) { const s = sessions.get(id); if (s) try { s.term.resize(cols, rows); } catch {} }

export async function putFile(id, name, content) {
  const s = sessions.get(id); if (!s) throw new Error("no session");
  if (!/^[\w.-]{1,64}$/.test(name) || name.startsWith(".")) throw new Error("bad file name");
  await writeFile(path.join(s.dir, name), content, "utf8");
}

export function destroy(id, reason = "closed") {
  const s = sessions.get(id); if (!s) return;
  sessions.delete(id);
  clearTimeout(s.flushTimer);
  try { process.kill(-s.term.pid, "SIGKILL"); } catch {}
  try { s.term.kill("SIGKILL"); } catch {}
  rmSync(s.dir, { recursive: true, force: true });
  console.log(`[shell] closed ${id} (${reason}, ${Math.round((Date.now() - s.createdAt) / 1000)}s)`);
}

export function startSweeper(onIdle) {
  return setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) if (now - s.lastInput > IDLE_MS) { destroy(id, "idle"); onIdle?.(id); }
  }, SWEEP_MS);
}

export function destroyAll(reason) { for (const id of [...sessions.keys()]) destroy(id, reason); }

export function languages() {
  try {
    return execFileSync(path.join(BIN, "compiler"), ["--languages"], { encoding: "utf8", timeout: 10_000, env: { PATH: `${BIN}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin` } })
      .trim().split("\n").map(line => { const [id, name, ext, available] = line.split("\t"); return { id, name, ext, available: available === "1" }; });
  } catch (e) { console.error(`[shell] compiler --languages failed: ${e.message}`); return []; }
}
