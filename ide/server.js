import "./lib/env.js";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkKey, requireKey, AUTH_ENABLED } from "./lib/auth.js";
import * as shell from "./lib/shell.js";
import * as projects from "./lib/projects.js";
import * as ai from "./lib/ai/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const nm = p => path.join(here, "node_modules", p);
const PORT = +process.env.PORT || 8787;
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const MAX_CODE = 200 * 1024;
const TEXT_LIMITS = { title: 80, description: 4000, lesson: 60, author: 60 };
const OWNER_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const WRITES_PER_MINUTE = 120;
const LANGUAGES = shell.languages();
const LANGUAGE_IDS = new Set(LANGUAGES.map(l => l.id));

const app = express();
if (TRUST_PROXY) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));
app.use(express.static(path.join(here, "public"), { index: "index.html" }));
app.use("/vendor/monaco", express.static(nm("monaco-editor/min/vs"), { maxAge: "7d" }));
app.use("/vendor/font/mono", express.static(nm("@fontsource/jetbrains-mono/files"), { maxAge: "30d" }));
app.use("/vendor/font/sans", express.static(nm("@fontsource/ibm-plex-sans/files"), { maxAge: "30d" }));
app.get("/vendor/xterm.js", (req, res) => res.sendFile(nm("@xterm/xterm/lib/xterm.js")));
app.get("/vendor/xterm.css", (req, res) => res.sendFile(nm("@xterm/xterm/css/xterm.css")));
app.get("/vendor/addon-fit.js", (req, res) => res.sendFile(nm("@xterm/addon-fit/lib/addon-fit.js")));

app.get("/health", (req, res) => res.json({ ok: true, sandbox: shell.SANDBOX.mode, sessions: shell.total() }));
app.post("/api/auth", (req, res) => res.json({ ok: checkKey(req.body?.key) }));
app.get("/api/config", requireKey, (req, res) => res.json({ models: ai.availableModels(), languages: LANGUAGES, sandbox: { mode: shell.SANDBOX.mode, reason: shell.SANDBOX.reason }, idleMs: shell.IDLE_MS }));

app.post("/api/chat", requireKey, async (req, res) => {
  const { model, messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length || messages.length > 40) return res.status(400).json({ error: "messages required" });
  if (!messages.every(m => ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.length <= 120_000)) return res.status(400).json({ error: "bad message" });
  const m = ai.modelOf(model); if (!m) return res.status(400).json({ error: "unknown model" });
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  const ctl = new AbortController(); res.on("close", () => { if (!res.writableFinished) ctl.abort(); });
  const send = o => res.write(`data: ${JSON.stringify(o)}\n\n`);
  let usage = null;
  try {
    for await (const c of ai.stream(m.id, messages, { signal: ctl.signal })) {
      if (c.usage) usage = c.usage;
      if (c.delta || c.reasoning) send({ delta: c.delta, reasoning: c.reasoning });
    }
    send({ done: true, model: m.id, usage });
  } catch (e) { if (!ctl.signal.aborted) send({ error: e.message }); }
  res.end();
});

const writeCounts = new Map();
setInterval(() => writeCounts.clear(), 60_000).unref();
function limitWrites(req, res, next) {
  const n = (writeCounts.get(req.ip) || 0) + 1;
  writeCounts.set(req.ip, n);
  if (n > WRITES_PER_MINUTE) return res.status(429).json({ error: "Too many saves – wait a minute." });
  next();
}

function requireOwner(req, res, next) {
  const token = req.get("X-Owner") || "";
  if (!OWNER_TOKEN.test(token)) return res.status(400).json({ error: "missing workspace key" });
  req.owner = projects.ownerHash(token);
  next();
}

class BadRequest extends Error {}
function readFields(body) {
  const out = {};
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "string") throw new BadRequest(`${key} must be text`);
    out[key] = body[key].trim().slice(0, max);
  }
  if (body.code !== undefined) {
    if (typeof body.code !== "string") throw new BadRequest("code must be text");
    if (body.code.length > MAX_CODE) throw new BadRequest("The file is too large (200 KB limit).");
    out.code = body.code;
  }
  if (body.language !== undefined && !LANGUAGE_IDS.has(body.language)) throw new BadRequest("unknown language");
  if (body.language !== undefined) out.language = body.language;
  if (body.visibility !== undefined && !projects.VISIBILITIES.includes(body.visibility)) throw new BadRequest("unknown visibility");
  if (body.visibility !== undefined) out.visibility = body.visibility;
  if (body.editable !== undefined) out.editable = !!body.editable;
  return out;
}

const api = express.Router();
api.use(requireKey, requireOwner);
const route = handler => (req, res) => {
  try { handler(req, res); }
  catch (e) {
    if (e instanceof BadRequest) return res.status(400).json({ error: e.message });
    console.error(`[projects] ${req.method} ${req.path}: ${e.stack || e.message}`);
    res.status(500).json({ error: "Could not complete the request." });
  }
};
const viewable = (req, res) => {
  const a = projects.access(req.params.id, req.owner);
  if (!a.canView) { res.status(404).json({ error: "Project not found or not shared with you." }); return null; }
  return a;
};
const editable = (req, res) => {
  const a = viewable(req, res); if (!a) return null;
  if (!a.canEdit) { res.status(403).json({ error: "This project is read-only for you. Duplicate it to make changes." }); return null; }
  return a;
};
const withAccess = a => ({ ...a.project, isOwner: a.isOwner, canEdit: a.canEdit });
const room = id => "p:" + id;
const broadcast = project => {
  if (project.visibility === "private") io.to(room(project.id)).emit("project:closed", { id: project.id });
  else io.to(room(project.id)).emit("project:changed", project);
};

api.get("/projects", route((req, res) => res.json({ projects: projects.listMine(req.owner) })));
api.get("/projects/public", route((req, res) => res.json({ projects: projects.listPublic() })));
api.post("/projects", limitWrites, route((req, res) => {
  const fields = readFields(req.body || {});
  if (!fields.language) throw new BadRequest("language required");
  if (projects.countMine(req.owner) >= projects.MAX_PROJECTS_PER_OWNER) return res.status(409).json({ error: `You have ${projects.MAX_PROJECTS_PER_OWNER} projects – delete some first.` });
  const project = projects.create(req.owner, { title: "Untitled", code: "", ...fields });
  res.status(201).json({ project: { ...project, isOwner: true, canEdit: true } });
}));
api.get("/projects/:id", route((req, res) => { const a = viewable(req, res); if (a) res.json({ project: withAccess(a) }); }));
api.put("/projects/:id", limitWrites, route((req, res) => {
  const a = editable(req, res); if (!a) return;
  const fields = readFields(req.body || {});
  if (!a.isOwner) for (const key of Object.keys(fields)) if (key !== "code") delete fields[key];
  const baseRev = Number.isInteger(req.body?.rev) ? req.body.rev : undefined;
  const result = projects.update(req.params.id, fields, baseRev);
  if (result.conflict) return res.status(409).json({ error: "Someone else saved a newer version.", project: withAccess({ ...a, project: result.conflict }) });
  broadcast(result.project);
  res.json({ project: withAccess({ ...a, project: result.project }) });
}));
api.delete("/projects/:id", limitWrites, route((req, res) => {
  const a = viewable(req, res); if (!a) return;
  if (!a.isOwner) return res.status(403).json({ error: "Only the owner can delete this project." });
  projects.remove(req.params.id);
  io.to(room(req.params.id)).emit("project:closed", { id: req.params.id });
  res.json({ ok: true });
}));
api.post("/projects/:id/fork", limitWrites, route((req, res) => {
  const a = viewable(req, res); if (!a) return;
  if (projects.countMine(req.owner) >= projects.MAX_PROJECTS_PER_OWNER) return res.status(409).json({ error: `You have ${projects.MAX_PROJECTS_PER_OWNER} projects – delete some first.` });
  const { title, description, lesson, language, code } = a.project;
  const author = typeof req.body?.author === "string" ? req.body.author.trim().slice(0, TEXT_LIMITS.author) : "";
  const project = projects.create(req.owner, { author, title: `${title} (copy)`.slice(0, TEXT_LIMITS.title), description, lesson, language, code, forkedFrom: a.project.id });
  res.status(201).json({ project: { ...project, isOwner: true, canEdit: true } });
}));
api.get("/projects/:id/versions", route((req, res) => { if (viewable(req, res)) res.json({ versions: projects.listVersions(req.params.id) }); }));
api.get("/projects/:id/versions/:vid", route((req, res) => {
  if (!viewable(req, res)) return;
  const version = projects.getVersion(req.params.id, +req.params.vid);
  if (!version) return res.status(404).json({ error: "Version not found." });
  res.json({ version });
}));
api.post("/projects/:id/versions", limitWrites, route((req, res) => {
  if (!editable(req, res)) return;
  const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 80) : "";
  res.status(201).json({ versions: projects.saveVersion(req.params.id, label || "Saved version") });
}));
api.post("/projects/:id/versions/:vid/restore", limitWrites, route((req, res) => {
  const a = editable(req, res); if (!a) return;
  const version = projects.getVersion(req.params.id, +req.params.vid);
  if (!version) return res.status(404).json({ error: "Version not found." });
  const { project } = projects.update(req.params.id, { code: version.code });
  projects.saveVersion(req.params.id, `Restored from revision ${version.rev}`);
  broadcast(project);
  res.json({ project: withAccess({ ...a, project }) });
}));
app.use("/api", api);
app.use("/api", (req, res) => res.status(404).json({ error: "not found" }));

const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 512 * 1024, pingInterval: 20_000, pingTimeout: 30_000 });
const ipOf = socket => (TRUST_PROXY && socket.handshake.headers["x-forwarded-for"]) ? String(socket.handshake.headers["x-forwarded-for"]).split(",")[0].trim() : socket.handshake.address;
const clampCols = c => Math.min(Math.max(+c || 100, 20), 300);
const clampRows = r => Math.min(Math.max(+r || 30, 5), 120);

io.use((socket, next) => {
  if (!checkKey(socket.handshake.auth?.key)) return next(new Error("access denied"));
  const token = socket.handshake.auth?.owner;
  socket.data.owner = typeof token === "string" && OWNER_TOKEN.test(token) ? projects.ownerHash(token) : null;
  next();
});

io.on("connection", socket => {
  const ip = ipOf(socket);
  const status = (state, message = "") => socket.emit("terminal-status", { state, message, idleMs: shell.IDLE_MS });

  function open(cols, rows) {
    if (shell.SANDBOX.mode === "unavailable") return status("error", `Code execution is disabled: ${shell.SANDBOX.reason}`);
    if (!shell.get(socket.id) && (shell.countForIp(ip) >= shell.MAX_PER_IP || shell.total() >= shell.MAX_TOTAL)) return status("limit", `Terminal limit reached (${shell.MAX_PER_IP} per device). Close another tab and retry.`);
    status("creating");
    try {
      shell.create(socket.id, { ip, cols, rows, onOutput: text => socket.emit("terminal-output", text), onExit: () => status("exited", "The shell exited.") });
    } catch (e) {
      console.error(`[shell] create failed for ${ip}: ${e.message}`);
      return status("error", "Could not start the terminal: " + e.message);
    }
    status("attached");
  }

  socket.on("terminal-open", ({ cols, rows } = {}) => open(clampCols(cols), clampRows(rows)));
  socket.on("terminal-restart", ({ cols, rows } = {}) => open(clampCols(cols), clampRows(rows)));
  socket.on("terminal-input", data => { if (typeof data === "string" && data.length <= 64 * 1024) shell.write(socket.id, data); });
  socket.on("terminal-resize", ({ cols, rows } = {}) => shell.resize(socket.id, clampCols(cols), clampRows(rows)));
  socket.on("run-file", async ({ name, content } = {}, ack) => {
    try {
      if (!shell.get(socket.id)) throw new Error("The terminal is not running.");
      if (typeof name !== "string" || typeof content !== "string" || content.length > MAX_CODE) throw new Error("bad file");
      await shell.putFile(socket.id, name, content);
      shell.write(socket.id, `\x15compiler ${name}\r`);
      ack?.({ ok: true });
    } catch (e) { ack?.({ ok: false, error: e.message }); }
  });
  socket.on("project:watch", (id, ack) => {
    if (typeof id !== "string" || id.length > 32) return ack?.({ ok: false });
    for (const r of socket.rooms) if (r.startsWith("p:")) socket.leave(r);
    const a = projects.access(id, socket.data.owner);
    if (!a.canView) return ack?.({ ok: false });
    socket.join(room(id));
    ack?.({ ok: true });
  });
  socket.on("disconnect", () => shell.destroy(socket.id, "disconnect"));
});

shell.prepareRunDir();
const sweeper = shell.startSweeper(id => io.sockets.sockets.get(id)?.emit("terminal-status", { state: "exited", message: `The terminal stopped after ${shell.IDLE_MS / 60000} min without input.` }));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { clearInterval(sweeper); shell.destroyAll("shutdown"); process.exit(0); });

if (shell.SANDBOX.mode === "off") console.warn("\x1b[33m[28teh] SANDBOX=off – code runs WITHOUT isolation. Use only for local development.\x1b[0m");
if (shell.SANDBOX.mode === "unavailable") console.warn(`[28teh] code execution disabled: ${shell.SANDBOX.reason}`);
console.log(`[28teh] auth ${AUTH_ENABLED ? "on" : "OFF"} · sandbox ${shell.SANDBOX.mode} · languages: ${LANGUAGES.filter(l => l.available).map(l => l.id).join(", ") || "none"} · providers: ${[...new Set(ai.availableModels().map(m => m.provider))].join(", ") || "none"}`);
http.listen(PORT, () => console.log(`[28teh] listening on http://localhost:${PORT}`));
