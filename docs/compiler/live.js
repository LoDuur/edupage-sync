/* Live Coding: sesija tabulā live_sessions, kods (pēc izvēles šifrēts ar paroli) atjaunojas caur Supabase Realtime */
const LIVE = (() => {
  const URL = "https://jlxnlqkwdshhywdprrtq.supabase.co";
  const KEY = "sb_publishable_ElHsgwQvJYfgjdV1yhZugw_aL4HGVaE";
  const HEAD = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
  const STALE_MS = 90_000, HEARTBEAT_MS = 25_000, THROTTLE_MS = 600;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function deriveKey(password, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encrypt(key, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
    return `enc1:${b64(iv)}:${b64(ct)}`;
  }
  async function decrypt(key, payload) {
    const [, iv, ct] = payload.split(":");
    return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct)));
  }
  const isEncrypted = s => typeof s === "string" && s.startsWith("enc1:");

  async function rpc(name, body, opts = {}) {
    const r = await fetch(`${URL}/rest/v1/rpc/${name}`, { method: "POST", headers: HEAD, body: JSON.stringify(body), ...opts });
    if (!r.ok) { let m = "kļūda"; try { m = (await r.json()).message || m; } catch (e) {} throw new Error(m); }
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  let sbPromise = null;
  function client() {
    if (!sbPromise) sbPromise = new Promise((res, rej) => {
      if (window.supabase) return res(window.supabase.createClient(URL, KEY));
      const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      s.onload = () => res(window.supabase.createClient(URL, KEY)); s.onerror = () => rej(new Error("supabase-js neielādējās")); document.head.appendChild(s);
    });
    return sbPromise;
  }
  const active = s => !s.ended_at && Date.now() - new Date(s.last_seen).getTime() < STALE_MS;

  async function listActive() {
    const since = new Date(Date.now() - STALE_MS).toISOString();
    const r = await fetch(`${URL}/rest/v1/live_sessions?select=id,title,author,lang,protected,started_at,last_seen&ended_at=is.null&last_seen=gt.${encodeURIComponent(since)}&order=started_at.desc`, { headers: HEAD });
    return r.ok ? r.json() : [];
  }
  async function get(id) {
    const r = await fetch(`${URL}/rest/v1/live_sessions?id=eq.${encodeURIComponent(id)}&select=id,title,author,lang,protected,code,started_at,last_seen,ended_at`, { headers: HEAD });
    const [s] = r.ok ? await r.json() : []; return s || null;
  }

  /* ---- vadītājs ---- */
  function host({ title, author, lang, password, passkey, getCode }) {
    const state = { id: null, token: null, key: null, lang, lastSent: null, timer: 0, beat: 0, pending: false, onError: () => {} };
    async function payload(code) { return state.key ? encrypt(state.key, code) : code; }
    async function push(force) {
      const code = getCode();
      if (!force && code === state.lastSent) return;
      state.lastSent = code;
      try { await rpc("live_update", { p_id: state.id, p_token: state.token, p_code: await payload(code), p_lang: state.lang }); }
      catch (e) { state.onError(e); }
    }
    return {
      state,
      async start() {
        const d = await rpc("live_start", { p_title: title, p_author: author, p_lang: lang, p_protected: !!password, p_passkey: passkey });
        state.id = d.id; state.token = d.token;
        if (password) state.key = await deriveKey(password, d.id);
        await push(true);
        state.beat = setInterval(() => push(true), HEARTBEAT_MS);
        return d.id;
      },
      changed() {
        if (state.pending) return; state.pending = true;
        state.timer = setTimeout(() => { state.pending = false; push(false); }, THROTTLE_MS);
      },
      setLang(l) { state.lang = l; push(true); },
      async end(keepalive) {
        clearInterval(state.beat); clearTimeout(state.timer);
        if (!state.id) return;
        const body = { p_id: state.id, p_token: state.token }; const id = state.id; state.id = null;
        try { await rpc("live_end", body, keepalive ? { keepalive: true } : {}); } catch (e) {}
        return id;
      },
    };
  }

  /* ---- skatītājs ---- */
  function view(id, { onCode, onMeta, onEnd, onLocked }) {
    let key = null, channel = null, poll = 0, last = null, closed = false;
    async function apply(s) {
      if (!s || closed) return;
      last = s; onMeta(s);
      if (!active(s)) { onEnd(s); return; }
      if (s.protected && !key) { onLocked(); return; }
      try { onCode(isEncrypted(s.code) ? await decrypt(key, s.code) : s.code, s); }
      catch (e) { key = null; onLocked(true); }
    }
    async function subscribe() {
      try {
        const sb = await client();
        channel = sb.channel("live-" + id).on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${id}` }, p => apply(p.new)).subscribe();
      } catch (e) {}
      poll = setInterval(async () => { if (!document.hidden) apply(await get(id)); }, channel ? 15_000 : 3_000);
    }
    return {
      async open() { const s = await get(id); if (!s) throw new Error("Sesija nav atrasta"); await apply(s); if (active(s)) subscribe(); return s; },
      async unlock(password) { key = await deriveKey(password, id); await apply(last); return !!key; },
      close() { closed = true; clearInterval(poll); if (channel) channel.unsubscribe(); },
      get session() { return last; },
    };
  }

  return { host, view, listActive, get, active, STALE_MS };
})();
