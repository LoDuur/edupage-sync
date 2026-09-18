import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { Run } from "./runner.js";
import { detectRuntimes } from "./languages.js";
import { MODE, FIREJAIL } from "./sandbox.js";

const PORT = +process.env.PORT || 8787;
const ORIGINS = (process.env.ORIGINS || "https://loduur.github.io,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8123").split(",");

if (MODE === "none") {
  console.error("Refusing to start: firejail is not installed and SANDBOX=dev is not set.\nInstall firejail (apt install firejail) on a Linux host, or run `SANDBOX=dev npm start` for local development only.");
  process.exit(1);
}
if (MODE === "dev") console.warn("\u001b[33m[28teh] DEV MODE – code runs WITHOUT a sandbox. Never expose this server.\u001b[0m");
else console.log(`[28teh] sandbox: firejail (${FIREJAIL})`);
if (MODE === "firejail" && process.getuid && process.getuid() !== 0 && !process.env.SANDBOX_UID) console.warn("[28teh] running as a normal user; set SANDBOX_UID/SANDBOX_GID and start as root to run code as a dedicated low-privilege user.");

const runtimes = detectRuntimes();
console.log("[28teh] runtimes:", Object.entries(runtimes).map(([k, v]) => `${k}:${v.available ? "ok" : "missing(" + v.missing.join(",") + ")"}`).join("  "));

const app = express();
app.use((req, res, next) => { const o = req.headers.origin; if (o && ORIGINS.includes(o)) { res.setHeader("Access-Control-Allow-Origin", o); res.setHeader("Vary", "Origin"); } next(); });
app.get("/health", (req, res) => res.json({ ok: true, mode: MODE }));
app.get("/api/runtimes", (req, res) => res.json({ mode: MODE, runtimes }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 512 * 1024, verifyClient: ({ origin }) => !origin || ORIGINS.includes(origin) });
wss.on("connection", ws => {
  let run = null;
  ws.on("message", async raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === "run") { if (run && !run.done) run.kill("restart"); if (!runtimes[m.lang]?.available) return ws.send(JSON.stringify({ type: "error", message: `${runtimes[m.lang]?.name || m.lang} is not available on this server.` })); run = new Run(ws, m); await run.start(); }
    else if (m.type === "stdin") run?.write(m.data);
    else if (m.type === "resize") run?.resize(m.cols, m.rows);
    else if (m.type === "kill") run?.kill("killed");
  });
  ws.on("close", () => { if (run && !run.done) run.kill("disconnect"); });
});
server.listen(PORT, () => console.log(`[28teh] listening on :${PORT}  ws://localhost:${PORT}/ws`));
