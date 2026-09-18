import { accessKey } from "./access.js";
import { MODELS, DEFAULT_MODEL } from "./models.js";

const AI_URL = "https://text.pollinations.ai/openai", AI_PROXY = "https://edupage-proxy.loduur.workers.dev/ai";

export async function loadModels() {
  try { const r = await fetch(`${AI_PROXY}/models`, { headers: { "X-Access-Key": accessKey() } }); if (!r.ok) throw 0; const d = await r.json(); const ids = new Set((d.models || []).map(m => m.id)); const list = MODELS.filter(m => ids.has(m.id)); return list.length ? list : MODELS; } catch { return MODELS; }
}

const splitThink = raw => { const m = raw.match(/^\s*<think>([\s\S]*?)(?:<\/think>|$)([\s\S]*)$/); return m ? { reasoning: m[1].trim(), content: m[2].replace(/^\s+/, "") } : { reasoning: "", content: raw }; };

// Streams one chat completion. onUpdate receives the full accumulated { content, reasoning } every time new tokens arrive.
export async function chat(model, messages, { signal, onUpdate } = {}) {
  const t0 = performance.now();
  const st = { raw: "", reasoning: "", model: model || DEFAULT_MODEL, provider: "", usage: null, first: 0, streamed: false };
  const emit = () => { const s = splitThink(st.raw); onUpdate?.({ content: s.content, reasoning: (st.reasoning + (st.reasoning && s.reasoning ? "\n" : "") + s.reasoning).trim(), model: st.model }); };
  const push = (text, reasoning) => { if (!st.first && (text || reasoning)) st.first = performance.now(); if (text) st.raw += text; if (reasoning) st.reasoning += reasoning; emit(); };
  const finish = () => {
    const end = performance.now(), s = splitThink(st.raw);
    const tokens = st.usage?.completion_tokens || 0, estimated = !tokens, count = tokens || Math.round((st.raw.length + st.reasoning.length) / 4);
    const gen = Math.max(1, end - (st.streamed && st.first ? st.first : t0));
    return { content: s.content, reasoning: (st.reasoning + (st.reasoning && s.reasoning ? "\n" : "") + s.reasoning).trim(), model: st.model, provider: st.provider, metrics: { ms: Math.round(end - t0), ttft: st.first ? Math.round(st.first - t0) : 0, tokens: count, estimated, tps: count / (gen / 1000) } };
  };
  const consume = async r => {
    const type = r.headers.get("content-type") || "";
    if (!type.includes("text/event-stream")) {
      const d = await r.json(); if (d.error) throw new Error(typeof d.error === "string" ? d.error : d.error.message || "AI error");
      const c = d.content ?? d.choices?.[0]?.message?.content; if (!c) throw new Error("empty");
      if (d.model) st.model = d.model; if (d.provider) st.provider = d.provider; if (d.usage) st.usage = d.usage;
      push(c, d.reasoning || d.choices?.[0]?.message?.reasoning || ""); return;
    }
    st.streamed = true;
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "", got = false;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data:")) continue; const data = line.slice(5).trim(); if (!data || data === "[DONE]") continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        if (j.error) throw new Error(j.error.message || String(j.error));
        if (j.model) st.model = j.model; if (j.provider) st.provider = j.provider; if (j.usage) st.usage = j.usage;
        const d = j.choices?.[0]?.delta || {}; const c = d.content || "", re = d.reasoning || d.reasoning_content || "";
        if (c || re) { got = true; push(c, re); }
      }
    }
    if (!got) throw new Error("empty");
  };
  try {
    const r = await fetch(`${AI_PROXY}/chat`, { method: "POST", headers: { "Content-Type": "text/plain", "X-Access-Key": accessKey(), Accept: "text/event-stream" }, body: JSON.stringify({ model: st.model, messages, stream: true }), signal });
    if (!r.ok) throw new Error("proxy " + r.status);
    await consume(r); return finish();
  } catch (e) { if (e.name === "AbortError") return finish(); }
  st.raw = ""; st.reasoning = ""; st.first = 0; st.streamed = false; st.provider = "pollinations"; st.model = "openai";
  for (let a = 0; a < 2; a++) {
    try { const r = await fetch(AI_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ model: "openai", messages, temperature: 0.3, stream: true }), signal }); if (r.ok) { await consume(r); return finish(); } }
    catch (e) { if (e.name === "AbortError") return finish(); }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error("The AI service is not reachable right now.");
}
