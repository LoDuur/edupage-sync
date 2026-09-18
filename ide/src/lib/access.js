const ACCESS_HASH = "40f241867b5b11875589f3fa4f95e363c1f12802496f7667c44a5443df175a00";
export async function sha256(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
export const accessKey = () => localStorage.getItem("java-access") || "";
export async function hasAccess() { const k = accessKey(); return !!k && await sha256(k) === ACCESS_HASH; }
export async function tryAccess(v) { v = v.trim().toUpperCase(); if (await sha256(v) === ACCESS_HASH) { localStorage.setItem("java-access", v); return true; } return false; }
export const signOut = () => { localStorage.removeItem("java-access"); location.reload(); };
