const ALLOWED = /^\/(timetable\/server\/(ttviewer|regulartt)|substitution\/server\/viewer)\.js$/;
const ORIGINS = ["https://loduur.github.io", "http://localhost:8123", "http://127.0.0.1:8123"];
const OPENROUTER = "https://openrouter.ai/api/v1";
const GROQ = "https://api.groq.com/openai/v1";
const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
const PREFERRED = ["google/gemma-4-31b", "qwen/qwen3-coder", "deepseek/deepseek", "meta-llama/llama-3.3-70b", "cohere/north-mini-code", "google/gemma-4-26b", "mistralai/"];

let modelCache = { at: 0, list: [] };

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

async function freeModels(env) {
  if (Date.now() - modelCache.at < 3600_000 && modelCache.list.length) return modelCache.list;
  const r = await fetch(`${OPENROUTER}/models`, { headers: env.OPENROUTER_KEY ? { Authorization: `Bearer ${env.OPENROUTER_KEY}` } : {} });
  if (!r.ok) return modelCache.list;
  const d = await r.json();
  const list = (d.data || [])
    .filter(m => m.id.endsWith(":free"))
    .map(m => ({ id: m.id, name: (m.name || m.id).replace(/ \(free\)$/i, ""), context: m.context_length || 0 }))
    .sort((a, b) => {
      const pa = PREFERRED.findIndex(p => a.id.startsWith(p)), pb = PREFERRED.findIndex(p => b.id.startsWith(p));
      return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.name.localeCompare(b.name);
    });
  modelCache = { at: Date.now(), list };
  return list;
}

async function chatOpenAI(base, key, model, messages, extraHeaders = {}) {
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 2048 }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 200)}`);
  const d = JSON.parse(text);
  const content = d.choices?.[0]?.message?.content;
  if (!content) throw new Error("empty");
  return { content, model: d.model || model };
}

async function handleAI(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  const key = request.headers.get("X-Access-Key") || "";
  if (!env.ACCESS_HASH || await sha256(key.trim().toUpperCase()) !== env.ACCESS_HASH) return json(request, { error: "access denied" }, 403);

  if (url.pathname === "/ai/models") {
    const list = env.OPENROUTER_KEY ? await freeModels(env) : [];
    return json(request, { openrouter: !!env.OPENROUTER_KEY, groq: !!env.GROQ_KEY, models: list });
  }
  if (url.pathname === "/ai/chat" && request.method === "POST") {
    const { model, messages } = await request.json();
    if (!Array.isArray(messages) || !messages.length) return json(request, { error: "messages required" }, 400);
    const errors = [];
    if (env.OPENROUTER_KEY) {
      const models = await freeModels(env);
      const chosen = model && models.some(m => m.id === model) ? model : (models[0]?.id);
      const tryList = [chosen, ...models.map(m => m.id).filter(id => id !== chosen).slice(0, 2)].filter(Boolean);
      for (const m of tryList) {
        try { const r = await chatOpenAI(OPENROUTER, env.OPENROUTER_KEY, m, messages, { "HTTP-Referer": "https://loduur.github.io/edupage-sync/", "X-Title": "Valteh Java" }); return json(request, { ...r, provider: "openrouter" }); }
        catch (e) { errors.push(`openrouter/${m}: ${e.message}`); }
      }
    }
    if (env.GROQ_KEY) {
      for (const m of GROQ_MODELS) {
        try { const r = await chatOpenAI(GROQ, env.GROQ_KEY, m, messages); return json(request, { ...r, provider: "groq" }); }
        catch (e) { errors.push(`groq/${m}: ${e.message}`); }
      }
    }
    try {
      const r = await fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "openai", messages, temperature: 0.3 }) });
      const d = await r.json();
      const content = d.choices?.[0]?.message?.content;
      if (content) return json(request, { content, model: "openai", provider: "pollinations" });
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
