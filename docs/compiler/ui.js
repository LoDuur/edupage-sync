/* kopīgais: piekļuves vārti, toast, sīkrīki */
const UI = (() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = id => document.getElementById(id);

  const ACCESS_HASH = "40f241867b5b11875589f3fa4f95e363c1f12802496f7667c44a5443df175a00";
  async function sha256(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  const accessKey = () => localStorage.getItem("java-access") || "";
  async function requireAccess(onOk, { sub = "piekļuves kods", back = "../" } = {}) {
    const k = accessKey();
    if (k && await sha256(k) === ACCESS_HASH) { onOk(); return; }
    const g = document.createElement("div"); g.className = "gate"; g.id = "gate";
    g.innerHTML = `<div class="card"><h1>28teh</h1><p class="sub">${esc(sub)}</p>
      <div class="field"><input id="gate-in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="kods"></div>
      <div class="err" id="gate-err"></div>
      <div class="row"><button class="btn pri" id="gate-ok">Ienākt</button><a href="${back}">← saraksts</a></div></div>`;
    document.body.appendChild(g);
    document.body.classList.add("hero");
    const inp = g.querySelector("#gate-in"), err = g.querySelector("#gate-err"), card = g.querySelector(".card");
    inp.focus();
    async function tryIt() {
      const v = inp.value.trim().toUpperCase();
      if (await sha256(v) === ACCESS_HASH) { localStorage.setItem("java-access", v); g.remove(); document.body.classList.remove("hero"); onOk(); }
      else { err.textContent = "Nepareizs kods"; card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); inp.select(); }
    }
    g.querySelector("#gate-ok").onclick = tryIt;
    inp.addEventListener("keydown", e => { if (e.key === "Enter") tryIt(); });
  }

  function toast(t) {
    let el = $("toast");
    if (!el) {
      el = document.createElement("div"); el.className = "toast"; el.id = "toast"; document.body.appendChild(el);
      const hide = () => { if (performance.now() - toast._at > 250) el.classList.remove("on"); };
      el.onclick = () => el.classList.remove("on");
      document.addEventListener("mousedown", hide, true); document.addEventListener("keydown", hide, true);
    }
    el.textContent = t; el.classList.add("on"); toast._at = performance.now();
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("on"), 2500);
  }

  return { esc, $, requireAccess, accessKey, sha256, toast };
})();
