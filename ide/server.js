import "./lib/env.js";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkKey, requireKey, AUTH_ENABLED } from "./lib/auth.js";
import * as sandbox from "./lib/sandbox.js";
import * as ai from "./lib/ai/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const nm = p => path.join(here, "node_modules", p);
const PORT = +process.env.PORT || 8787;
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const RUN_COMMANDS = { py: "python3", js: "node", java: "java", c: "gcc -Wall -o main {base} && ./main", cpp: "g++ -Wall -o main {base} && ./main", sh: "bash" };

const app = express();
if (TRUST_PROXY) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));
app.use(express.static(path.join(here, "public"), { index: "index.html" }));
app.use("/vendor/monaco", express.static(nm("monaco-editor/min/vs")));
app.use("/vendor/font", express.static(nm("@fontsource/jetbrains-mono/files")));
app.get("/vendor/xterm.js", (req, res) => res.sendFile(nm("@xterm/xterm/lib/xterm.js")));
app.get("/vendor/xterm.css", (req, res) => res.sendFile(nm("@xterm/xterm/css/xterm.css")));
app.get("/vendor/addon-fit.js", (req, res) => res.sendFile(nm("@xterm/addon-fit/lib/addon-fit.js")));

app.get("/health", async (req, res) => res.json({ ok: true, docker: await sandbox.ping(), sessions: sandbox.total() }));
app.post("/api/auth", (req, res) => res.json({ ok: checkKey(req.body?.key) }));
app.get("/api/models", requireKey, (req, res) => res.json({ models: ai.availableModels(), commands: RUN_COMMANDS }));

// Streams normalized SSE: {delta, reasoning} chunks, then {done:true, model, usage}. Provider keys never leave this process.
app.post("/api/chat", requireKey, async (req, res) => {
  const { model, messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length || messages.length > 40) return res.status(400).json({ error: "messages required" });
  if (!messages.every(m => ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.length <= 120_000)) return res.status(400).json({ error: "bad message" });
  const m = ai.modelOf(model); if (!m) return res.status(400).json({ error: "unknown model" });
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  const ctl = new AbortController(); req.on("close", () => ctl.abort());
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

const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 512 * 1024, pingInterval: 20_000, pingTimeout: 30_000 });
const ipOf = socket => (TRUST_PROXY && socket.handshake.headers["x-forwarded-for"]) ? String(socket.handshake.headers["x-forwarded-for"]).split(",")[0].trim() : socket.handshake.address;

io.use((socket, next) => next(checkKey(socket.handshake.auth?.key) ? undefined : new Error("access denied")));

io.on("connection", socket => {
  const ip = ipOf(socket);
  const status = (state, message = "") => socket.emit("terminal-status", { state, message, idleMs: sandbox.IDLE_MS });

  async function open(cols, rows) {
    if (sandbox.get(socket.id)) await sandbox.destroy(socket.id, "restart");
    if (sandbox.countForIp(ip) >= sandbox.MAX_PER_IP || sandbox.total() >= sandbox.MAX_TOTAL) return status("limit", `Sandbox limit reached (${sandbox.MAX_PER_IP} per client). Close another tab and retry.`);
    status("creating");
    let s;
    try { s = await sandbox.create(socket.id, { ip, cols, rows }); }
    catch (e) { console.error(`[sandbox] create failed for ${ip}: ${e.message}`); return status("error", /no such image|not found/i.test(e.message) ? `Sandbox image "${sandbox.IMAGE}" is missing – build it with: docker build -t ${sandbox.IMAGE} .` : /ENOENT|ECONNREFUSED|connect/i.test(e.message) ? "Docker daemon is not reachable." : "Could not start the sandbox: " + e.message); }
    s.stream.on("data", chunk => {
      const { text, urls } = s.filter(chunk.toString("utf8"));
      if (text) socket.emit("terminal-output", text);
      for (const url of urls) {
        if (sandbox.ALLOWED_URLS.includes(url)) socket.emit("open-url", url);
        else console.warn(`[sandbox] rejected open-url "${url}" from ${ip}`);
      }
    });
    s.stream.on("end", async () => { if (sandbox.get(socket.id) === s) { await sandbox.destroy(socket.id, "shell exited"); status("exited", "Shell exited."); } });
    s.stream.on("error", () => {});
    status("attached");
  }

  socket.on("terminal-open", ({ cols, rows } = {}) => open(clampCols(cols), clampRows(rows)).catch(e => status("error", e.message)));
  socket.on("terminal-restart", ({ cols, rows } = {}) => open(clampCols(cols), clampRows(rows)).catch(e => status("error", e.message)));
  socket.on("terminal-input", data => { if (typeof data === "string" && data.length <= 64 * 1024) sandbox.write(socket.id, data); });
  socket.on("terminal-resize", ({ cols, rows } = {}) => sandbox.resize(socket.id, clampCols(cols), clampRows(rows)));
  socket.on("run-file", async ({ name, content } = {}, ack) => {
    try {
      if (!sandbox.get(socket.id)) throw new Error("sandbox is not running");
      if (typeof name !== "string" || typeof content !== "string" || content.length > 200 * 1024) throw new Error("bad file");
      const ext = name.split(".").pop(), tpl = RUN_COMMANDS[ext];
      if (!tpl) throw new Error(`no run command for .${ext}`);
      await sandbox.putFile(socket.id, name, content);
      const cmd = tpl.includes("{base}") ? tpl.replaceAll("{base}", name) : `${tpl} ${name}`;
      sandbox.write(socket.id, "\x15" + cmd + "\r");
      ack?.({ ok: true });
    } catch (e) { ack?.({ ok: false, error: e.message }); }
  });
  socket.on("disconnect", () => sandbox.destroy(socket.id, "disconnect"));
});

const clampCols = c => Math.min(Math.max(+c || 100, 20), 300);
const clampRows = r => Math.min(Math.max(+r || 30, 5), 120);

const sweeper = sandbox.startSweeper(id => io.sockets.sockets.get(id)?.emit("terminal-status", { state: "exited", message: `Sandbox stopped after ${sandbox.IDLE_MS / 60000} min without input.` }));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { clearInterval(sweeper); await sandbox.destroyAll("shutdown"); process.exit(0); });

const dockerUp = await sandbox.ping();
if (dockerUp) await sandbox.reconcile(); else console.warn("[sandbox] Docker is not reachable – terminals will report an error until it is.");
console.log(`[28teh] auth ${AUTH_ENABLED ? "on" : "OFF"} · providers: ${ai.availableModels().map(m => m.provider).filter((p, i, a) => a.indexOf(p) === i).join(", ") || "none"} · docker ${dockerUp ? "ok" : "unavailable"}`);
http.listen(PORT, () => console.log(`[28teh] listening on http://localhost:${PORT}`));
