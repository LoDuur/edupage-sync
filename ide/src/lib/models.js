// The five assistant models. Mirrored in proxy/worker.js (MODELS) – keep both lists identical.
export const MODELS = [
  { id: "qwen/qwen3.8-27b:free", name: "Qwen3.8 27B", short: "Qwen 3.8", provider: "qwen" },
  { id: "z-ai/glm-5.2:free", name: "Z.ai GLM 5.2", short: "GLM 5.2", provider: "zai" },
  { id: "google/gemma-4-26b-a4b-it:free", name: "Google Gemma 26B", short: "Gemma 26B", provider: "google" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Nvidia Nemotron 3 Ultra", short: "Nemotron 3 Ultra", provider: "nvidia" },
  { id: "nvidia/nemotron-3.5-lightning:free", name: "Nvidia Nemotron 3.5 Lightning", short: "Nemotron 3.5", provider: "nvidia" },
];
export const DEFAULT_MODEL = MODELS[0].id;
export const modelOf = id => MODELS.find(m => m.id === id) || null;
export const providerOf = (id = "") => modelOf(id)?.provider || (/qwen/i.test(id) ? "qwen" : /glm|z-ai|zhipu/i.test(id) ? "zai" : /gemma|google/i.test(id) ? "google" : /nvidia|nemotron/i.test(id) ? "nvidia" : undefined);
