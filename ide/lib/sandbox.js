import Docker from "dockerode";

export const IMAGE = process.env.SANDBOX_IMAGE || "28teh-sandbox";
export const IDLE_MS = (+process.env.IDLE_MINUTES || 10) * 60_000;
export const MAX_PER_IP = +process.env.MAX_PER_IP || 2;
export const MAX_TOTAL = +process.env.MAX_TOTAL || 20;
const LABEL = "28teh.session";
const SWEEP_MS = 60_000;

function dockerOptions() {
  const host = process.env.DOCKER_HOST;
  if (!host) return { socketPath: process.platform === "win32" ? "//./pipe/docker_engine" : "/var/run/docker.sock" };
  if (host.startsWith("npipe://")) return { socketPath: host.replace(/^npipe:\/\//, "") };
  if (host.startsWith("unix://")) return { socketPath: host.replace(/^unix:\/\//, "") };
  const u = new URL(host.replace(/^tcp:/, "http:"));
  return { host: u.hostname, port: +u.port || 2375, protocol: u.protocol === "https:" ? "https" : "http" };
}
export const docker = new Docker(dockerOptions());

// sessions: socket id → { container, stream, ip, lastInput, createdAt, cols, rows, filter }
const sessions = new Map();

export const countForIp = ip => [...sessions.values()].filter(s => s.ip === ip).length;
export const total = () => sessions.size;
export const get = id => sessions.get(id);

export async function ping() { try { await docker.ping(); return true; } catch { return false; } }

export async function create(id, { ip, cols = 100, rows = 30 }) {
  if (sessions.has(id)) await destroy(id, "restart");
  const container = await docker.createContainer({
    Image: IMAGE, Tty: true, OpenStdin: true, StdinOnce: false, AttachStdin: true, AttachStdout: true, AttachStderr: true,
    User: "developer", WorkingDir: "/home/developer", Hostname: "sandbox",
    Env: ["HOME=/home/developer", "USER=developer", "TERM=xterm-256color", "LANG=C.UTF-8", "PYTHONUNBUFFERED=1", "PS1=\\u@\\h:\\w$ "],
    Labels: { [LABEL]: id, "28teh.ip": ip, "28teh.created": String(Date.now()) },
    HostConfig: {
      Memory: 256 * 1024 * 1024,
      MemorySwap: 256 * 1024 * 1024,
      NanoCpus: 0.5 * 1e9,
      PidsLimit: 64,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      ReadonlyRootfs: true,
      Tmpfs: { "/tmp": "rw,noexec,nosuid,size=64m", "/home/developer": "rw,nosuid,size=128m,uid=1000,gid=1000,mode=0750" },
      NetworkMode: "bridge",
      Binds: [], Privileged: false, AutoRemove: false, LogConfig: { Type: "none" },
    },
  });
  const stream = await container.attach({ stream: true, stdin: true, stdout: true, stderr: true, hijack: true });
  const s = { container, stream, ip, lastInput: Date.now(), createdAt: Date.now(), cols, rows, filter: markerFilter() };
  sessions.set(id, s);
  try { await container.start(); await container.resize({ h: rows, w: cols }); }
  catch (e) { sessions.delete(id); await container.remove({ force: true }).catch(() => {}); throw e; }
  return s;
}

export function write(id, data) { const s = sessions.get(id); if (!s) return false; s.lastInput = Date.now(); s.stream.write(data); return true; }
export async function resize(id, cols, rows) { const s = sessions.get(id); if (!s) return; s.cols = cols; s.rows = rows; await s.container.resize({ h: rows, w: cols }).catch(() => {}); }

// Writes a file into the container's tmpfs home through exec (docker cp cannot write to a tmpfs on a read-only rootfs).
export async function putFile(id, name, content) {
  const s = sessions.get(id); if (!s) throw new Error("no session");
  if (!/^[\w.-]{1,64}$/.test(name) || name.startsWith(".")) throw new Error("bad file name");
  const exec = await s.container.exec({ Cmd: ["sh", "-c", 'base64 -d > "/home/developer/$1"', "sh", name], AttachStdin: true, AttachStdout: true, AttachStderr: true, User: "developer" });
  const es = await exec.start({ hijack: true, stdin: true });
  await new Promise((resolve, reject) => {
    es.on("error", reject); es.on("end", resolve); es.on("close", resolve); es.resume();
    es.end(Buffer.from(content, "utf8").toString("base64"));
  });
  const info = await exec.inspect();
  if (info.ExitCode) throw new Error(`could not write ${name} (exit ${info.ExitCode})`);
}

export async function destroy(id, reason = "closed") {
  const s = sessions.get(id); if (!s) return;
  sessions.delete(id);
  try { s.stream.destroy(); } catch {}
  await s.container.kill().catch(() => {});
  await s.container.remove({ force: true }).catch(() => {});
  console.log(`[sandbox] removed ${id} (${reason}, ${Math.round((Date.now() - s.createdAt) / 1000)}s)`);
}

// Idle sweep: anything without input for IDLE_MS is torn down.
export function startSweeper(onKilled) {
  return setInterval(async () => {
    const now = Date.now();
    for (const [id, s] of sessions) if (now - s.lastInput > IDLE_MS) { await destroy(id, "idle"); onKilled?.(id, "idle"); }
  }, SWEEP_MS);
}

// On boot, remove every container this server ever labelled — covers crashes that skipped cleanup.
export async function reconcile() {
  const list = await docker.listContainers({ all: true, filters: { label: [LABEL] } });
  for (const c of list) await docker.getContainer(c.Id).remove({ force: true }).catch(() => {});
  if (list.length) console.log(`[sandbox] reconciled ${list.length} orphaned container(s) on startup`);
  return list.length;
}

export async function destroyAll(reason) { for (const id of [...sessions.keys()]) await destroy(id, reason); }

/* ---------- ::TRIGGER_OPEN_URL:: filtering (server-side, so no fragment ever reaches the browser) ---------- */
export const MARKER = "::TRIGGER_OPEN_URL::";
export const ALLOWED_URLS = ["https://my-editor-website.com"];

// Line-buffers terminal output. Whole lines that are exactly MARKER<url> are removed from the stream and returned as urls;
// a trailing partial line is held back only while it could still be the start of a marker.
export function markerFilter() {
  let tail = "";
  return chunk => {
    let text = tail + chunk; tail = "";
    let out = ""; const urls = []; let i;
    while ((i = text.indexOf("\n")) >= 0) {
      const line = text.slice(0, i); text = text.slice(i + 1);
      const bare = line.replace(/\r$/, "");
      if (bare.startsWith(MARKER) && !/\s/.test(bare)) urls.push(bare.slice(MARKER.length));
      else out += line + "\n";
    }
    const bare = text.replace(/\r$/, "");
    if (text && (MARKER.startsWith(bare) || bare.startsWith(MARKER))) tail = text; else out += text;
    return { text: out, urls };
  };
}
