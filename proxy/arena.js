import { DurableObject } from "cloudflare:workers";
import { CODE_PATTERN } from "../docs/arena/sim/protocol.js";
import { ArenaServer, CLOSE_GONE, TICK_MS } from "./arena-server.js";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;
const CREATE_ATTEMPTS = 6;
const LOOP_MS = Math.round(TICK_MS);

function createCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function connectRoom(env, code, action, settings) {
  const stub = env.ARENA.get(env.ARENA.idFromName(code));
  const query = new URLSearchParams({ code });
  if (settings) query.set("settings", settings);
  return stub.fetch(`https://room/${action}?${query}`, { headers: { Upgrade: "websocket" } });
}

export async function handleArena(request, env, url, allowedOrigins) {
  if (request.headers.get("Upgrade") !== "websocket") return new Response("websocket required", { status: 426 });
  if (!allowedOrigins.includes(request.headers.get("Origin") || "")) return new Response("forbidden", { status: 403 });
  if (!env.ARENA) return new Response("arena not configured", { status: 503 });
  if (url.pathname === "/arena/create") {
    const settings = (url.searchParams.get("settings") || "").slice(0, 400);
    for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
      const response = await connectRoom(env, createCode(), "create", settings);
      if (response.status === 101) return response;
    }
    return new Response("no free code", { status: 503 });
  }
  const code = url.pathname.startsWith("/arena/rooms/") ? url.pathname.slice("/arena/rooms/".length).toUpperCase() : "";
  if (!CODE_PATTERN.test(code)) return new Response("not found", { status: 404 });
  return connectRoom(env, code, "join");
}

export class ArenaRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.server = null;
    this.loop = 0;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const isCreate = url.pathname === "/create";
    if (isCreate && this.server) return new Response("taken", { status: 409 });
    if (isCreate) this.open(url.searchParams.get("code"), url.searchParams.get("settings"));
    const [client, socket] = Object.values(new WebSocketPair());
    socket.accept();
    if (!this.server) {
      socket.send(JSON.stringify({ t: "error", code: "not_found" }));
      socket.close(CLOSE_GONE, "not_found");
      return new Response(null, { status: 101, webSocket: client });
    }
    const server = this.server;
    server.connect(socket, Date.now());
    socket.addEventListener("message", event => server.receive(socket, event.data, Date.now()));
    socket.addEventListener("close", () => server.disconnect(socket, Date.now()));
    socket.addEventListener("error", () => server.disconnect(socket, Date.now()));
    return new Response(null, { status: 101, webSocket: client });
  }

  open(code, rawSettings) {
    let settings = null;
    try {
      settings = rawSettings ? JSON.parse(rawSettings) : null;
    } catch {
      settings = null;
    }
    this.server = new ArenaServer({
      code, settings, now: Date.now(),
      send: (socket, message) => {
        try {
          socket.send(typeof message === "string" ? message : JSON.stringify(message));
        } catch {}
      },
      close: (socket, closeCode, reason) => {
        try {
          socket.close(closeCode, reason);
        } catch {}
      },
    });
    clearInterval(this.loop);
    this.loop = setInterval(() => {
      if (!this.server.update(Date.now())) this.shutdown();
    }, LOOP_MS);
  }

  shutdown() {
    clearInterval(this.loop);
    for (const socket of this.server?.connections.keys() ?? []) {
      try {
        socket.close(CLOSE_GONE, "closed");
      } catch {}
    }
    this.server = null;
  }
}
