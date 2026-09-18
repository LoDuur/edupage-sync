import { accessKey } from "./access.js";
import i_deepseek_color from "@lobehub/icons-static-svg/icons/deepseek-color.svg";
import i_gemma_color from "@lobehub/icons-static-svg/icons/gemma-color.svg";
import i_google_color from "@lobehub/icons-static-svg/icons/google-color.svg";
import i_qwen_color from "@lobehub/icons-static-svg/icons/qwen-color.svg";
import i_mistral_color from "@lobehub/icons-static-svg/icons/mistral-color.svg";
import i_meta_color from "@lobehub/icons-static-svg/icons/meta-color.svg";
import i_cohere_color from "@lobehub/icons-static-svg/icons/cohere-color.svg";
import i_nvidia_color from "@lobehub/icons-static-svg/icons/nvidia-color.svg";
import i_microsoft_color from "@lobehub/icons-static-svg/icons/microsoft-color.svg";
import i_openai from "@lobehub/icons-static-svg/icons/openai.svg";
import i_moonshot from "@lobehub/icons-static-svg/icons/moonshot.svg";
import i_zhipu_color from "@lobehub/icons-static-svg/icons/zhipu-color.svg";
import i_xai from "@lobehub/icons-static-svg/icons/xai.svg";
import i_grok from "@lobehub/icons-static-svg/icons/grok.svg";
import i_anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg";
import i_groq from "@lobehub/icons-static-svg/icons/groq.svg";
import i_openrouter_color from "@lobehub/icons-static-svg/icons/openrouter-color.svg";
export const BRAND_ICONS = {"deepseek-color": i_deepseek_color, "gemma-color": i_gemma_color, "google-color": i_google_color, "qwen-color": i_qwen_color, "mistral-color": i_mistral_color, "meta-color": i_meta_color, "cohere-color": i_cohere_color, "nvidia-color": i_nvidia_color, "microsoft-color": i_microsoft_color, "openai": i_openai, "moonshot": i_moonshot, "zhipu-color": i_zhipu_color, "xai": i_xai, "grok": i_grok, "anthropic": i_anthropic, "groq": i_groq, "openrouter-color": i_openrouter_color};
const AI_URL = "https://text.pollinations.ai/openai", AI_PROXY = "https://edupage-proxy.loduur.workers.dev/ai";
export async function loadModels() { try { const r = await fetch(`${AI_PROXY}/models`, { headers: { "X-Access-Key": accessKey() } }); if (!r.ok) throw 0; const d = await r.json(); return d.models || []; } catch { return []; } }
export async function chat(model, messages) {
  try { const r = await fetch(`${AI_PROXY}/chat`, { method: "POST", headers: { "Content-Type": "text/plain", "X-Access-Key": accessKey() }, body: JSON.stringify({ model, messages }) }); const d = await r.json(); if (r.ok && d.content) return { content: d.content, model: d.model }; } catch {}
  const body = JSON.stringify({ model: "openai", messages, temperature: 0.3 });
  for (let a = 0; a < 2; a++) { try { const r = await fetch(AI_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body }); if (r.ok) { const d = await r.json(); const c = d.choices?.[0]?.message?.content; if (c) return { content: c, model: "pollinations" }; } } catch {} await new Promise(r => setTimeout(r, 1500)); }
  throw new Error("The AI service is not reachable right now.");
}
// brand icon for a model id (LobeHub static SVGs)
const BRANDS = [["deepseek", "deepseek-color"], ["gemma", "gemma-color"], ["google", "google-color"], ["qwen", "qwen-color"], ["mistral", "mistral-color"], ["meta-llama", "meta-color"], ["llama", "meta-color"], ["cohere", "cohere-color"], ["nvidia", "nvidia-color"], ["microsoft", "microsoft-color"], ["openai", "openai"], ["gpt", "openai"], ["moonshot", "moonshot"], ["zhipu", "zhipu-color"], ["glm", "zhipu-color"], ["x-ai", "xai"], ["grok", "grok"], ["anthropic", "anthropic"], ["claude", "anthropic"], ["groq", "groq"]];
export function brandOf(id = "") { const l = id.toLowerCase(); for (const [k, v] of BRANDS) if (l.includes(k)) return v; return l.includes("pollinations") ? "openai" : "openrouter-color"; }
