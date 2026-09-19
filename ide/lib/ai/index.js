import * as openrouter from "./openrouter.js";
import * as gemini from "./gemini.js";

// Adding a provider = one adapter file exposing enabled() + stream() and one entry here.
const PROVIDERS = { openrouter, gemini };

// Vendor marks come from Simple Icons (verified slugs only); rows without a verified slug render name-only.
export const MODELS = [
  { id: "qwen/qwen3.8-27b:free", label: "Qwen 3.8 27B", provider: "openrouter", icon: "qwen" },
  { id: "z-ai/glm-5.2:free", label: "Z.ai GLM 5.2", provider: "openrouter", icon: null },
  { id: "google/gemma-4-26b-a4b-it:free", label: "Google Gemma 26B", provider: "openrouter", icon: "google" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nvidia Nemotron 3 Ultra", provider: "openrouter", icon: "nvidia" },
  { id: "nvidia/nemotron-3.5-lightning:free", label: "Nvidia Nemotron 3.5 Lightning", provider: "openrouter", icon: "nvidia" },
  { id: "gemini-2.5-flash", label: "Google Gemini 2.5 Flash", provider: "gemini", icon: "googlegemini" },
  { id: "gemini-2.5-pro", label: "Google Gemini 2.5 Pro", provider: "gemini", icon: "googlegemini" },
];

export const availableModels = () => MODELS.filter(m => PROVIDERS[m.provider].enabled());
export const modelOf = id => availableModels().find(m => m.id === id) || null;
export function stream(modelId, messages, opts) {
  const m = modelOf(modelId); if (!m) throw new Error("unknown or unavailable model");
  return PROVIDERS[m.provider].stream(m.id, messages, opts);
}
