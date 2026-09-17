/* shared: dither-grid gradient, access gate, chrome helpers */
const UI = (() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = id => document.getElementById(id);

  /* ---------- Dither Grid gradient (21st.dev spec, canvas) ---------- */
  const PALETTE = [
    { hex: "#0E2417", pos: 0 }, { hex: "#2E6B3E", pos: 24 }, { hex: "#DDF0C8", pos: 61 }, { hex: "#78B86B", pos: 67 },
  ].sort((a, b) => a.pos - b.pos).map(c => ({ ...c, rgb: [1, 3, 5].map(i => parseInt(c.hex.slice(i, i + 2), 16)) }));
  const P = { cols: 25, rows: 15, angle: 62, dither: .76, gap: .07, count: 6, wave: .12, distortion: .28, grain: 1, vignette: 1, speed: .71, amt: .6, dir: 1 };
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  function ramp(u) {
    u = Math.min(1, Math.max(0, u)) * 100;
    for (let i = 1; i < PALETTE.length; i++) {
      const a = PALETTE[i - 1], b = PALETTE[i];
      if (u <= b.pos) { const k = (u - a.pos) / Math.max(1e-6, b.pos - a.pos); return a.rgb.map((v, j) => Math.round(v + (b.rgb[j] - v) * k)); }
    }
    return PALETTE[PALETTE.length - 1].rgb;
  }
  function makeGrain(size) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const x = c.getContext("2d"), img = x.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (Math.random() - .5) * 90; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0); return c;
  }
  function initDither(canvas, opts = {}) {
    const ctx = canvas.getContext("2d"), grain = makeGrain(160);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const rad = P.angle * Math.PI / 180, dx = Math.cos(rad), dy = Math.sin(rad);
    let w = 0, h = 0, raf = 0;
    function resize() { const r = Math.min(devicePixelRatio || 1, 1.5); w = canvas.width = Math.floor(canvas.clientWidth * r); h = canvas.height = Math.floor(canvas.clientHeight * r); }
    addEventListener("resize", resize); resize();
    function frame(now) {
      const t = (now - start) / 1000, ph = reduced ? 0 : t * P.speed, spin = ph * P.dir;
      const slide = Math.sin(ph * .9 * P.dir) * .5 * P.amt;
      const cw = w / P.cols, ch = h / P.rows, g = Math.min(cw, ch) * P.gap;
      ctx.fillStyle = "#0E2417"; ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < P.rows; y++) for (let x = 0; x < P.cols; x++) {
        const nx = (x + .5) / P.cols, ny = (y + .5) / P.rows;
        let u = (nx * dx + ny * dy) / (dx + dy);
        u += (Math.sin(ny * Math.PI * 4 + spin) - Math.sin(spin)) * P.wave * P.distortion;
        u += (Math.cos(nx * Math.PI * 3 + spin * .7) - Math.cos(spin * .7)) * P.wave * .5;
        u += slide;
        const th = (BAYER[y % 4][x % 4] / 16 - .5) * P.dither;
        const level = Math.floor(u * (P.count - 1) + .5 + th);
        const [r, gg, b] = ramp(level / (P.count - 1));
        ctx.fillStyle = `rgb(${r},${gg},${b})`;
        ctx.fillRect(x * cw + g / 2, y * ch + g / 2, cw - g, ch - g);
      }
      if (P.grain) { ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = .5 * P.grain; const pat = ctx.createPattern(grain, "repeat"); ctx.fillStyle = pat; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; }
      if (P.vignette) { const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .75); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(0,0,0,${.8 * P.vignette})`); ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h); }
      if (!reduced && !document.hidden) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !reduced) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } });
  }

  /* ---------- access gate ---------- */
  const ACCESS_HASH = "40f241867b5b11875589f3fa4f95e363c1f12802496f7667c44a5443df175a00";
  async function sha256(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  const accessKey = () => localStorage.getItem("java-access") || "";
  const BANNER = [
    "     ██╗ █████╗ ██╗   ██╗ █████╗ ",
    "     ██║██╔══██╗██║   ██║██╔══██╗",
    "     ██║███████║██║   ██║███████║",
    "██   ██║██╔══██║╚██╗ ██╔╝██╔══██║",
    "╚█████╔╝██║  ██║ ╚████╔╝ ██║  ██║",
    " ╚════╝ ╚═╝  ╚═╝  ╚═══╝  ╚═╝  ╚═╝",
  ].join("\n");
  async function requireAccess(onOk, { title = "PIEKĻUVES KODS", sub = "2.k. 28.grupa · Java", banner = BANNER, back = "../" } = {}) {
    const k = accessKey();
    if (k && await sha256(k) === ACCESS_HASH) { onOk(); return; }
    const g = document.createElement("div"); g.className = "gate"; g.id = "gate";
    g.innerHTML = `<div class="card"><pre>${banner}</pre><p class="sub">${esc(sub)} — ${esc(title)}</p>
      <div class="field"><input id="gate-in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ACCESS KEY"></div>
      <div class="err" id="gate-err"></div>
      <div class="row"><button class="btn pri" id="gate-ok">Ienākt →</button><a class="btn" href="${back}">‹ Stundu saraksts</a></div>
      <p class="note">Kods ir arī saglabāšanas atslēga. Tas paliek saglabāts šajā ierīcē.<br>SYSTEM.LOCKED · V1.0.0</p></div>`;
    document.body.appendChild(g);
    document.body.classList.add("hero");
    const inp = g.querySelector("#gate-in"), err = g.querySelector("#gate-err"), card = g.querySelector(".card");
    inp.focus();
    async function tryIt() {
      const v = inp.value.trim().toUpperCase();
      if (await sha256(v) === ACCESS_HASH) { localStorage.setItem("java-access", v); g.remove(); document.body.classList.remove("hero"); onOk(); }
      else { err.textContent = "ACCESS DENIED · nepareizs kods"; card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); inp.select(); }
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
  function clock(el) { const tick = () => { el.textContent = new Date().toLocaleTimeString("lv-LV", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }; tick(); setInterval(tick, 1000); }

  return { esc, $, initDither, requireAccess, accessKey, sha256, toast, clock, BANNER };
})();
