import { BUTTON } from "./constants.js";

export const WEAPONS = Object.freeze({
  pistol: {
    id: "pistol", slot: 1, name: "Pistole", isAuto: false, pellets: 1, damage: 24, headMultiplier: 2,
    spread: 0.004, bloomPerShot: 0.014, bloomMax: 0.05, bloomRecovery: 0.14, fireInterval: 0.15, fireBuffer: 0.12,
    magazine: 12, reserve: Infinity, reloadTime: 1.25, emptyReloadTime: 1.45, raiseTime: 0.16,
    range: 150, falloffStart: 30, falloffEnd: 70, falloffMin: 0.6,
    recoilPitch: 0.028, recoilYaw: 0.006, botRange: 28, botCone: 0.04,
  },
  aa12: {
    id: "aa12", slot: 2, name: "AA-12", isAuto: true, pellets: 8, damage: 9, headMultiplier: 1.5,
    spread: 0.075, bloomPerShot: 0.008, bloomMax: 0.03, bloomRecovery: 0.12, fireInterval: 0.2, fireBuffer: 0,
    magazine: 20, reserve: 60, pickupAmmo: 20, reloadTime: 2.4, emptyReloadTime: 2.75, raiseTime: 0.24,
    range: 70, falloffStart: 7, falloffEnd: 24, falloffMin: 0.3,
    recoilPitch: 0.05, recoilYaw: 0.018, botRange: 15, botCone: 0.1,
  },
});

export const WEAPON_ORDER = Object.freeze(["pistol", "aa12"]);
export const AUTO_RELOAD_DELAY = 0.2;

export function createArsenal(time) {
  return {
    owned: { pistol: true },
    ammo: { pistol: { mag: WEAPONS.pistol.magazine, reserve: WEAPONS.pistol.reserve } },
    current: "pistol", previous: null,
    state: "raise", stateUntil: time + WEAPONS.pistol.raiseTime,
    nextFireAt: 0, bloom: 0, wasFireHeld: false, fireBufferedUntil: -1, emptySince: -1, shotCount: 0,
  };
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
      const spread = w.spread + ars.bloom;
      ars.bloom = Math.min(w.bloomMax, ars.bloom + w.bloomPerShot);
      return { spread };
    }
  }
  return null;
}
