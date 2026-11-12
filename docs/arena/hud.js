import { WEAPONS, WEAPON_ORDER } from "./sim/weapons.js";
import { MAX_HEALTH, MAX_ARMOR } from "./sim/constants.js";
import { scoreboard } from "./sim/game.js";

const $ = id => document.getElementById(id);
const KILLFEED_MAX = 5;
const SHORT_NAMES = { pistol: "Pistole", smg: "SMG", ar: "AR", aa12: "AA-12", sniper: "Snaiperis", rocket: "Raķete" };

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function createHud() {
  const el = {
    crosshair: $("crosshair"), hitmarker: $("hitmarker"), damageRing: $("damage-ring"), vignette: $("vignette"),
    score: $("hud-score"), timer: $("hud-timer"), leader: $("hud-leader"), killfeed: $("killfeed"), center: $("center-message"),
    speed: $("speed"), speedValue: $("speed-value"), health: $("hud-health"), healthBar: $("hud-health-bar"), armor: $("hud-armor"), armorBar: $("hud-armor-bar"),
    dash: $("hud-dash"), slots: $("weapon-slots"), mag: $("hud-mag"), reserve: $("hud-reserve"), weaponName: $("hud-weapon-name"),
    scoreboard: $("scoreboard"), scoreRows: $("scoreboard-rows"), scope: $("scope"),
  };
  let hitTimer = 0, centerUntil = 0, lastSlotsKey = "", lastBoardAt = 0;
  const cache = new Map();
  const set = (node, key, value) => {
    if (cache.get(key) === value) return;
    cache.set(key, value);
    node.textContent = value;
  };

  function hit(kind) {
    el.hitmarker.className = `hitmarker show ${kind}`;
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => { el.hitmarker.className = "hitmarker"; }, kind === "kill" ? 220 : 90);
  }

  function damageFrom(angle) {
    const span = document.createElement("span");
    span.style.transform = `rotate(${angle}rad)`;
    el.damageRing.append(span);
    setTimeout(() => span.remove(), 900);
  }

  function message(html, seconds, now) {
    el.center.innerHTML = html;
    centerUntil = now + seconds * 1000;
  }

  function killfeed(game, event, localId) {
    const name = id => escapeHtml(game.players.find(p => p.id === id)?.name ?? "?");
    const li = document.createElement("li");
    if (event.killer === localId || event.victim === localId) li.className = "me";
    const weapon = WEAPONS[event.weapon]?.name ?? (event.weapon === "fall" ? "kritiens" : "");
    li.innerHTML = event.killer && event.killer !== event.victim
      ? `${name(event.killer)}<span class="weapon">[${escapeHtml(weapon)}]</span>${event.isHeadshot ? '<span class="head">◎ </span>' : ""}${name(event.victim)}`
      : `${name(event.victim)}<span class="weapon">[${escapeHtml(weapon || "pašnāvība")}]</span>`;
    el.killfeed.prepend(li);
    while (el.killfeed.children.length > KILLFEED_MAX) el.killfeed.lastChild.remove();
  }

  function renderBoard(game, localId, tbody) {
    tbody.innerHTML = scoreboard(game).map((row, i) => `<tr class="${row.id === localId ? "me" : ""} ${row.isBot ? "bot" : ""}"><td>${i + 1}</td><td>${escapeHtml(row.name)}</td><td>${row.kills}</td><td>${row.deaths}</td></tr>`).join("");
  }

  function update(game, local, { showScoreboard, showSpeed, now }) {
    if (!local) return;
    set(el.timer, "timer", formatTime(game.timeLimit - game.time));
    const board = scoreboard(game);
    const leader = board[0];
    const myRank = board.findIndex(r => r.id === local.id) + 1;
    el.score.innerHTML = `<b>${local.kills}</b> / ${game.fragLimit} · ${myRank}. vieta`;
    set(el.leader, "leader", leader && leader.id !== local.id ? `Līderis: ${leader.name} ${leader.kills}` : "Tu esi līderis");

    const health = Math.max(0, local.health);
    set(el.health, "health", String(health));
    el.healthBar.style.width = `${Math.min(100, (health / MAX_HEALTH) * 100)}%`;
    el.health.parentElement.classList.toggle("low", health <= 30);
    set(el.armor, "armor", String(local.armor));
    el.armorBar.style.width = `${(local.armor / MAX_ARMOR) * 100}%`;
    el.vignette.style.opacity = local.isAlive ? String(Math.max(0, (40 - health) / 40) * 0.9) : "0.6";
    el.dash.classList.toggle("empty", !(local.move.dashCharge > 0 && local.move.time >= local.move.dashReadyAt));

    const ars = local.arsenal;
    const w = WEAPONS[ars.current];
    const ammo = ars.ammo[ars.current];
    set(el.mag, "mag", ars.state === "reload" ? "··" : String(ammo.mag));
    set(el.reserve, "reserve", `/ ${ammo.reserve === Infinity ? "∞" : ammo.reserve}`);
    el.mag.parentElement.classList.toggle("low", ammo.mag <= Math.ceil(w.magazine * 0.25));
    set(el.weaponName, "weapon", w.name);
    const slotsKey = WEAPON_ORDER.map(id => `${id}:${!!ars.owned[id]}:${ars.current === id}`).join();
    if (slotsKey !== lastSlotsKey) {
      lastSlotsKey = slotsKey;
      el.slots.innerHTML = WEAPON_ORDER.filter(id => ars.owned[id]).map(id => `<li class="${ars.current === id ? "active" : ""}">${WEAPONS[id].slot} ${escapeHtml(SHORT_NAMES[id])}</li>`).join("");
    }
    const gap = 5 + Math.min(26, (w.spread + ars.bloom) * 260);
    el.crosshair.style.setProperty("--gap", `${gap.toFixed(1)}px`);

    const kmh = Math.round(Math.hypot(local.move.vel.x, local.move.vel.z) * 3.6);
    el.speed.hidden = !showSpeed;
    set(el.speedValue, "speed", String(kmh));
    el.speed.className = `speed${kmh > 65 ? " insane" : kmh > 36 ? " fast" : ""}`;

    if (!local.isAlive) {
      el.center.innerHTML = `Tevi izsita<small>Atdzimsi pēc ${Math.max(0, local.respawnAt - game.time).toFixed(1)} s</small>`;
      centerUntil = now + 100;
    } else if (now > centerUntil) el.center.textContent = "";

    el.scoreboard.hidden = !showScoreboard;
    if (showScoreboard && now - lastBoardAt > 250) {
      lastBoardAt = now;
      renderBoard(game, local.id, el.scoreRows);
    }
  }

  function setScoped(isScoped) {
    el.scope.hidden = !isScoped;
    el.crosshair.hidden = isScoped;
  }

  function reset() {
    el.killfeed.textContent = "";
    el.center.textContent = "";
    el.damageRing.textContent = "";
    cache.clear();
    lastSlotsKey = "";
  }

  return { update, setScoped, hit, damageFrom, message, killfeed, renderBoard, reset };
}
