const ALLOWED = /^\/(timetable\/server\/(ttviewer|regulartt)|substitution\/server\/viewer)\.js$/;
const ORIGINS = ["https://loduur.github.io", "http://localhost:8123", "http://127.0.0.1:8123", "http://localhost:5173", "http://127.0.0.1:5173"];
const OPENROUTER = "https://openrouter.ai/api/v1";
// The five assistant models. Mirrored in ide/src/lib/models.js – keep both lists identical.
const MODELS = [
  { id: "qwen/qwen3.8-27b:free", name: "Qwen3.8 27B" },
  { id: "z-ai/glm-5.2:free", name: "Z.ai GLM 5.2" },
  { id: "google/gemma-4-26b-a4b-it:free", name: "Google Gemma 26B" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Nvidia Nemotron 3 Ultra" },
  { id: "nvidia/nemotron-3.5-lightning:free", name: "Nvidia Nemotron 3.5 Lightning" },
];
const OR_HEADERS = { "HTTP-Referer": "https://loduur.github.io/edupage-sync/", "X-Title": "28teh IDE" };

function cors(request, extra = {}) {
  const origin = request.headers.get("Origin") || "";
  const allow = ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Headers": "Content-Type, X-Access-Key, X-Proxy-Key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin", ...extra };
}
const json = (request, body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors(request, { "Content-Type": "application/json" }) });

async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function chatOpenAI(base, key, model, messages, extraHeaders = {}) {
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 2048, usage: { include: true } }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 200)}`);
  const d = JSON.parse(text);
  const content = d.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty");
  return { content, reasoning: d.choices?.[0]?.message?.reasoning || "", model: d.model || model, usage: d.usage || null };
}

// Server-sent events straight from the upstream; the client reads delta.content / delta.reasoning and the final usage chunk.
async function streamOpenAI(base, key, model, messages, extraHeaders = {}) {
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 2048, stream: true, stream_options: { include_usage: true }, usage: { include: true } }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  if (!(r.headers.get("content-type") || "").includes("text/event-stream")) throw new Error("no stream");
  return r.body;
}

async function handleAI(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  const key = request.headers.get("X-Access-Key") || "";
  if (!env.ACCESS_HASH || await sha256(key.trim().toUpperCase()) !== env.ACCESS_HASH) return json(request, { error: "access denied" }, 403);

  if (url.pathname === "/ai/models") return json(request, { openrouter: !!env.OPENROUTER_KEY, models: MODELS });
  if (url.pathname === "/ai/chat" && request.method === "POST") {
    const { model, messages, stream } = await request.json();
    if (!Array.isArray(messages) || !messages.length) return json(request, { error: "messages required" }, 400);
    const errors = [];
    if (env.OPENROUTER_KEY) {
      const chosen = MODELS.some(m => m.id === model) ? model : MODELS[0].id;
      const tryList = [chosen, ...MODELS.map(m => m.id).filter(id => id !== chosen).slice(0, 2)];
      for (const m of tryList) {
        try {
          if (stream) { const body = await streamOpenAI(OPENROUTER, env.OPENROUTER_KEY, m, messages, OR_HEADERS); return new Response(body, { status: 200, headers: cors(request, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Model": m }) }); }
          const r = await chatOpenAI(OPENROUTER, env.OPENROUTER_KEY, m, messages, OR_HEADERS); return json(request, { ...r, provider: "openrouter" });
        } catch (e) { errors.push(`openrouter/${m}: ${e.message}`); }
      }
    }
    try {
      const r = await fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "openai", messages, temperature: 0.3 }) });
      const d = await r.json();
      const content = d.choices?.[0]?.message?.content;
      if (content) return json(request, { content, model: "openai", provider: "pollinations", usage: d.usage || null });
      errors.push("pollinations: empty");
    } catch (e) { errors.push("pollinations: " + e.message); }
    return json(request, { error: "all providers failed", details: errors }, 502);
  }
  return json(request, { error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ai/")) return handleAI(request, env, url);

    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    if (request.headers.get("X-Proxy-Key") !== env.PROXY_KEY) return new Response("forbidden", { status: 403 });
    if (!ALLOWED.test(url.pathname)) return new Response("not found", { status: 404 });
    const school = url.searchParams.get("school") || env.SCHOOL || "valteh";
    url.searchParams.delete("school");
    const target = `https://${school}.edupage.org${url.pathname}${url.search}`;
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": `https://${school}.edupage.org`,
        "Referer": `https://${school}.edupage.org/timetable/view.php`,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      },
      body: await request.text(),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json" } });
  },
};
