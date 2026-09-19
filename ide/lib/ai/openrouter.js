import { readSSE } from "./sse.js";

const BASE = "https://openrouter.ai/api/v1";

export const enabled = () => !!process.env.OPENROUTER_KEY;

export async function* stream(model, messages, { signal } = {}) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_KEY}`, "HTTP-Referer": "https://loduur.github.io/edupage-sync/", "X-Title": "28teh workspace" },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 2048, stream: true, stream_options: { include_usage: true }, usage: { include: true } }),
  });
  if (!r.ok) throw new Error(`openrouter ${r.status}: ${(await r.text()).slice(0, 200)}`);
  for await (const j of readSSE(r.body)) {
    if (j.error) throw new Error(j.error.message || "openrouter error");
    const d = j.choices?.[0]?.delta || {};
    yield { delta: d.content || "", reasoning: d.reasoning || d.reasoning_content || "", model: j.model, usage: j.usage ? { input: j.usage.prompt_tokens, output: j.usage.completion_tokens } : null };
  }
}
