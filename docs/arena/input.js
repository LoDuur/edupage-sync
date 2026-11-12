import { BUTTON } from "./sim/constants.js";

const MOUSE_YAW = 0.022 * (Math.PI / 180);
const PITCH_LIMIT = 1.54;

export function createInput(canvas, getSettings) {
  const down = new Set();
  let yaw = 0, pitch = 0, lookDX = 0, lookDY = 0, wheel = 0, isLocked = false;
  let pendingSlot = 0, lastSlot = 1, currentSlot = 1, sensitivityScale = 1;
  let touchFwd = 0, touchSide = 0, touchButtons = 0, cycleRequests = 0;
  const listeners = new Set();
  let fullscreenHandler = null;

  const actionDown = action => down.has(getSettings().binds[action]);

  const onKeyDown = e => {
    if (!isLocked) return;
    if (e.code === "Escape") return;
    e.preventDefault();
    if (e.repeat) return;
    down.add(e.code);
    const binds = getSettings().binds;
    if (e.code === binds.fullscreen) fullscreenHandler?.();
    for (let slot = 1; slot <= 6; slot++) if (e.code === binds[`slot${slot}`]) pendingSlot = slot;
    if (e.code === binds.lastWeapon) pendingSlot = lastSlot;
  };
  const onKeyUp = e => { down.delete(e.code); };
  const onMouseDown = e => {
    if (!isLocked) return;
    e.preventDefault();
    down.add(`Mouse${e.button}`);
  };
  const onMouseUp = e => { down.delete(`Mouse${e.button}`); };
  const onMouseMove = e => {
    if (!isLocked) return;
    const s = getSettings();
    const scale = s.sensitivity * MOUSE_YAW * sensitivityScale;
    yaw -= e.movementX * scale;
    pitch -= e.movementY * scale * (s.invertY ? -1 : 1);
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    lookDX += e.movementX;
    lookDY += e.movementY;
  };
  const onWheel = e => {
    if (!isLocked) return;
    e.preventDefault();
    wheel += Math.sign(e.deltaY);
  };
  const onLockChange = () => {
    isLocked = document.pointerLockElement === canvas;
    if (!isLocked) down.clear();
    for (const fn of listeners) fn(isLocked);
  };
  const onBlur = () => down.clear();

  addEventListener("keydown", onKeyDown);
  addEventListener("keyup", onKeyUp);
  addEventListener("mousedown", onMouseDown);
  addEventListener("mouseup", onMouseUp);
  addEventListener("mousemove", onMouseMove);
  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("blur", onBlur);
  document.addEventListener("pointerlockchange", onLockChange);

  async function lock() {
    try {
      await canvas.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try { await canvas.requestPointerLock(); } catch { return false; }
    }
    return true;
  }

  function sample(ownedSlots) {
    const fwd = Math.max(-1, Math.min(1, (actionDown("forward") ? 1 : 0) - (actionDown("back") ? 1 : 0) + touchFwd));
    const side = Math.max(-1, Math.min(1, (actionDown("right") ? 1 : 0) - (actionDown("left") ? 1 : 0) + touchSide));
    let buttons = touchButtons;
    if (actionDown("jump")) buttons |= BUTTON.JUMP;
    if (actionDown("crouch")) buttons |= BUTTON.CROUCH;
    if (actionDown("dash")) buttons |= BUTTON.DASH;
    if (actionDown("reload")) buttons |= BUTTON.RELOAD;
    if (down.has("Mouse0")) buttons |= BUTTON.FIRE;
    if (down.has("Mouse2")) buttons |= BUTTON.ALT;
    if (cycleRequests > 0) {
      wheel += cycleRequests;
      cycleRequests = 0;
    }
    if (wheel !== 0 && ownedSlots.length) {
      const index = ownedSlots.indexOf(currentSlot);
      pendingSlot = ownedSlots[(index + (wheel > 0 ? 1 : -1) + ownedSlots.length) % ownedSlots.length];
      wheel = 0;
    }
    if (pendingSlot && ownedSlots.includes(pendingSlot) && pendingSlot !== currentSlot) {
      lastSlot = currentSlot;
      currentSlot = pendingSlot;
    }
    pendingSlot = 0;
    return { fwd, side, yaw, pitch, buttons, weapon: currentSlot };
  }

  function syncSlot(slot) {
    if (slot !== currentSlot) {
      lastSlot = currentSlot;
      currentSlot = slot;
    }
  }

  function consumeLook() {
    const out = { dx: lookDX, dy: lookDY };
    lookDX = 0;
    lookDY = 0;
    return out;
  }

  function setView(newYaw, newPitch) {
    yaw = newYaw;
    pitch = newPitch;
  }

  function dispose() {
    removeEventListener("keydown", onKeyDown);
    removeEventListener("keyup", onKeyUp);
    removeEventListener("mousedown", onMouseDown);
    removeEventListener("mouseup", onMouseUp);
    removeEventListener("mousemove", onMouseMove);
    removeEventListener("wheel", onWheel);
    removeEventListener("blur", onBlur);
    document.removeEventListener("pointerlockchange", onLockChange);
  }

  return {
    lock, sample, syncSlot, consumeLook, setView, dispose,
    isHeld: action => actionDown(action),
    setSensitivityScale(value) { sensitivityScale = value; },
    get sensitivityScale() { return sensitivityScale; },
    setTouchAxes(fwd, side) { touchFwd = fwd; touchSide = side; },
    setTouchButtons(mask) { touchButtons = mask; },
    cycleWeapon() { cycleRequests++; },
    setFullscreenHandler(fn) { fullscreenHandler = fn; },
    onLockChange: fn => listeners.add(fn),
    get isLocked() { return isLocked; },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    addPitch(delta) { pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch + delta)); },
    addYaw(delta) { yaw += delta; },
  };
}
