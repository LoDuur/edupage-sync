import { readSSE } from "./sse.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const enabled = () => !!process.env.GEMINI_API_KEY;

// OpenAI-style messages → Gemini contents; the system prompt becomes systemInstruction.
function convert(messages) {
  const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const contents = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  return { system, contents };
}

export async function* stream(model, messages, { signal } = {}) {
  const { system, contents } = convert(messages);
  const r = await fetch(`${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents, generationConfig: { temperature: 0.3, maxOutputTokens: 4096 } }),
  });
  if (!r.ok) { const text = await r.text(); let msg = text.slice(0, 200); try { msg = JSON.parse(text).error?.message || msg; } catch {} throw new Error(`${r.status}: ${msg}`); }
  for await (const j of readSSE(r.body)) {
    if (j.error) throw new Error(j.error.message || "gemini error");
    let delta = "", reasoning = "";
    for (const p of j.candidates?.[0]?.content?.parts || []) { if (!p.text) continue; if (p.thought) reasoning += p.text; else delta += p.text; }
    const u = j.usageMetadata;
    yield { delta, reasoning, model, usage: u ? { input: u.promptTokenCount, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) } : null };
  }
}
