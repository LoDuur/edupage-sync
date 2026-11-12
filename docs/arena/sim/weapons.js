import { BUTTON } from "./constants.js";

export const WEAPONS = Object.freeze({
  pistol: {
    id: "pistol", slot: 1, name: "Pistole", isAuto: false, pellets: 1, damage: 20, headMultiplier: 2,
    spread: 0.004, bloomPerShot: 0.014, bloomMax: 0.05, bloomRecovery: 0.14, fireInterval: 0.22, fireBuffer: 0.12,
    magazine: 12, reserve: Infinity, reloadTime: 1.25, emptyReloadTime: 1.45, raiseTime: 0.16,
    range: 150, falloffStart: 30, falloffEnd: 70, falloffMin: 0.6,
    recoilPitch: 0.028, recoilYaw: 0.006, botRange: 28, botCone: 0.04, botIdeal: 14, botMin: 0, botMax: 40, botPriority: 0,
  },
  smg: {
    id: "smg", slot: 2, name: "SMG", isAuto: true, pellets: 1, damage: 9, headMultiplier: 1.6,
    spread: 0.012, bloomPerShot: 0.0045, bloomMax: 0.055, bloomRecovery: 0.2, fireInterval: 0.055, fireBuffer: 0,
    magazine: 35, reserve: 105, pickupAmmo: 35, reloadTime: 1.7, emptyReloadTime: 1.95, raiseTime: 0.18,
    range: 90, falloffStart: 12, falloffEnd: 40, falloffMin: 0.45,
    recoilPitch: 0.012, recoilYaw: 0.012, botRange: 22, botCone: 0.07, botIdeal: 8, botMin: 0, botMax: 20, botPriority: 2,
  },
  ar: {
    id: "ar", slot: 3, name: "Triecienšautene", isAuto: true, pellets: 1, damage: 15, headMultiplier: 2,
    spread: 0.005, bloomPerShot: 0.0035, bloomMax: 0.035, bloomRecovery: 0.14, fireInterval: 0.092, fireBuffer: 0,
    magazine: 30, reserve: 90, pickupAmmo: 30, reloadTime: 2.0, emptyReloadTime: 2.3, raiseTime: 0.22,
    range: 140, falloffStart: 28, falloffEnd: 80, falloffMin: 0.55,
    recoilPitch: 0.02, recoilYaw: 0.016, botRange: 34, botCone: 0.05, botIdeal: 15, botMin: 6, botMax: 40, botPriority: 3,
  },
  aa12: {
    id: "aa12", slot: 4, name: "AA-12", isAuto: true, pellets: 8, damage: 9, headMultiplier: 1.5,
    spread: 0.075, bloomPerShot: 0.008, bloomMax: 0.03, bloomRecovery: 0.12, fireInterval: 0.2, fireBuffer: 0,
    magazine: 20, reserve: 60, pickupAmmo: 20, reloadTime: 2.4, emptyReloadTime: 2.75, raiseTime: 0.24,
    range: 70, falloffStart: 7, falloffEnd: 24, falloffMin: 0.3,
    recoilPitch: 0.05, recoilYaw: 0.018, botRange: 15, botCone: 0.1, botIdeal: 6, botMin: 0, botMax: 14, botPriority: 4,
  },
  sniper: {
    id: "sniper", slot: 5, name: "Snaiperšautene", isAuto: false, pellets: 1, damage: 80, headMultiplier: 2.5,
    spread: 0.045, scopeSpread: 0.0004, zoom: 4, bloomPerShot: 0, bloomMax: 0, bloomRecovery: 1, fireInterval: 1.15, fireBuffer: 0.25,
    magazine: 5, reserve: 20, pickupAmmo: 5, reloadTime: 2.8, emptyReloadTime: 3.1, raiseTime: 0.4,
    range: 400, falloffStart: 400, falloffEnd: 401, falloffMin: 1,
    recoilPitch: 0.09, recoilYaw: 0.01, botRange: 70, botCone: 0.012, botIdeal: 30, botMin: 16, botMax: 80, botPriority: 3,
  },
  rocket: {
    id: "rocket", slot: 6, name: "Raķešu palaidējs", isAuto: false, pellets: 0, damage: 0, headMultiplier: 1,
    spread: 0.002, bloomPerShot: 0, bloomMax: 0, bloomRecovery: 1, fireInterval: 0.85, fireBuffer: 0.2,
    magazine: 4, reserve: 12, pickupAmmo: 4, reloadTime: 2.6, emptyReloadTime: 2.9, raiseTime: 0.4,
    range: 0, falloffStart: 0, falloffEnd: 1, falloffMin: 1,
    projectile: { speed: 30, splashRadius: 3.8, splashDamage: 110, knockback: 15, selfScale: 0.35, maxLife: 6, ownerGrace: 0.12 },
    recoilPitch: 0.07, recoilYaw: 0.01, botRange: 40, botCone: 0.03, botIdeal: 13, botMin: 5, botMax: 40, botPriority: 5,
  },
});

export const WEAPON_ORDER = Object.freeze(["pistol", "smg", "ar", "aa12", "sniper", "rocket"]);
export const LOADOUT_WEAPONS = Object.freeze(["smg", "ar", "aa12", "sniper"]);
export const AUTO_RELOAD_DELAY = 0.2;

export function createArsenal(time, loadout = null) {
  const ars = {
    owned: { pistol: true },
    ammo: { pistol: { mag: WEAPONS.pistol.magazine, reserve: WEAPONS.pistol.reserve } },
    current: "pistol", previous: null,
    state: "raise", stateUntil: time + WEAPONS.pistol.raiseTime,
    nextFireAt: 0, bloom: 0, wasFireHeld: false, fireBufferedUntil: -1, emptySince: -1, shotCount: 0, isScoped: false, reloadWasEmpty: false,
  };
  if (LOADOUT_WEAPONS.includes(loadout)) {
    const w = WEAPONS[loadout];
    ars.owned[loadout] = true;
    ars.ammo[loadout] = { mag: w.magazine, reserve: w.pickupAmmo };
    ars.current = loadout;
    ars.previous = "pistol";
    ars.stateUntil = time + w.raiseTime;
  }
  return ars;
}

export function giveWeapon(ars, id, time) {
  const w = WEAPONS[id];
  if (!w) return false;
  if (ars.owned[id]) {
    const a = ars.ammo[id];
    if (a.reserve >= w.reserve) return false;
    a.reserve = Math.min(w.reserve, a.reserve + (w.pickupAmmo ?? w.magazine));
    return true;
  }
  ars.owned[id] = true;
  ars.ammo[id] = { mag: w.magazine, reserve: Math.min(w.reserve, w.pickupAmmo ?? w.magazine) };
  if (WEAPONS[ars.current].slot < w.slot) switchWeapon(ars, id, time);
  return true;
}

export function giveAmmo(ars) {
  let isGiven = false;
  for (const id of Object.keys(ars.owned)) {
    const w = WEAPONS[id], a = ars.ammo[id];
    if (w.reserve === Infinity || a.reserve >= w.reserve) continue;
    a.reserve = Math.min(w.reserve, a.reserve + Math.ceil((w.pickupAmmo ?? w.magazine) * 0.6));
    isGiven = true;
  }
  return isGiven;
}

export function switchWeapon(ars, id, time) {
  if (!ars.owned[id] || ars.current === id) return false;
  ars.previous = ars.current;
  ars.current = id;
  ars.state = "raise";
  ars.stateUntil = time + WEAPONS[id].raiseTime;
  ars.fireBufferedUntil = -1;
  return true;
}

function startReload(ars, time) {
  const w = WEAPONS[ars.current], a = ars.ammo[ars.current];
  if (a.mag >= w.magazine || a.reserve <= 0) return false;
  ars.state = "reload";
  ars.stateUntil = time + (a.mag === 0 ? w.emptyReloadTime : w.reloadTime);
  ars.reloadWasEmpty = a.mag === 0;
  return true;
}

function finishReload(ars) {
  const w = WEAPONS[ars.current], a = ars.ammo[ars.current];
  const moved = Math.min(w.magazine - a.mag, a.reserve);
  a.mag += moved;
  if (a.reserve !== Infinity) a.reserve -= moved;
}

export function weaponIdForSlot(slot) {
  return WEAPON_ORDER.find(id => WEAPONS[id].slot === slot) || null;
}

export function updateArsenal(ars, input, time, dt) {
  const wantId = weaponIdForSlot(input.weapon | 0);
  if (wantId && wantId !== ars.current && ars.owned[wantId]) switchWeapon(ars, wantId, time);
  const w = WEAPONS[ars.current], a = ars.ammo[ars.current];
  ars.bloom = Math.max(0, ars.bloom - w.bloomRecovery * dt);
  ars.isScoped = !!w.zoom && (input.buttons & BUTTON.ALT) !== 0 && ars.state !== "reload" && ars.state !== "raise";
  if (ars.state !== "ready" && time >= ars.stateUntil) {
    if (ars.state === "reload") finishReload(ars);
    ars.state = "ready";
  }
  const isFireHeld = (input.buttons & BUTTON.FIRE) !== 0;
  const isFirePressed = isFireHeld && !ars.wasFireHeld;
  ars.wasFireHeld = isFireHeld;
  if (isFirePressed && w.fireBuffer > 0) ars.fireBufferedUntil = time + w.fireBuffer;

  if (ars.state === "ready") {
    if ((input.buttons & BUTTON.RELOAD) && startReload(ars, time)) return null;
    if (a.mag === 0) {
      if (ars.emptySince < 0) ars.emptySince = time;
      if ((isFirePressed || time - ars.emptySince >= AUTO_RELOAD_DELAY) && startReload(ars, time)) return null;
      return isFirePressed ? "dry" : null;
    }
    ars.emptySince = -1;
    const wantsShot = w.isAuto ? isFireHeld : time <= ars.fireBufferedUntil;
    if (wantsShot && time >= ars.nextFireAt) {
      a.mag--;
      ars.nextFireAt = time + w.fireInterval;
      ars.fireBufferedUntil = -1;
      ars.shotCount++;
      const spread = ars.isScoped ? w.scopeSpread : w.spread + ars.bloom;
      ars.bloom = Math.min(w.bloomMax, ars.bloom + w.bloomPerShot);
      return { spread };
    }
  }
  return null;
}
