export const SUPABASE_URL = "https://jlxnlqkwdshhywdprrtq.supabase.co";
export const SUPABASE_KEY = "sb_publishable_ElHsgwQvJYfgjdV1yhZugw_aL4HGVaE";
export const HEAD = { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY };
export async function listSnippets() { const r = await fetch(`${SUPABASE_URL}/rest/v1/snippets?select=id,title,author,lang,created_at&order=created_at.desc&limit=300`, { headers: HEAD }); return r.ok ? r.json() : []; }
export async function getSnippet(id) { const r = await fetch(`${SUPABASE_URL}/rest/v1/snippets?id=eq.${encodeURIComponent(id)}&select=*`, { headers: HEAD }); const [s] = r.ok ? await r.json() : []; return s || null; }
export async function saveSnippet({ title, author, code, passkey, lang }) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_snippet`, { method: "POST", headers: { ...HEAD, "Content-Type": "application/json" }, body: JSON.stringify({ p_title: title, p_author: author, p_code: code, p_passkey: passkey, p_lang: lang }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.message === "Nepareiza atslēga" ? "Incorrect access code." : d.message || "Could not save.");
  return d;
}
