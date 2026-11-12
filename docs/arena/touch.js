import { BUTTON } from "./sim/constants.js";

const STICK_RADIUS = 56;
const DEADZONE = 0.14;
const LOOK_SPEED = 0.0055;
const TAP_MS = 120;

const LAYOUT = `
  <div class="touch-zone touch-move" data-zone="move"><div class="stick" hidden><i></i></div></div>
  <div class="touch-zone touch-look" data-zone="look"></div>
  <button type="button" class="tb fire" data-hold="FIRE" data-look aria-label="Šaut"><span>●</span></button>
  <button type="button" class="tb jump" data-hold="JUMP" aria-label="Lēkt"><span>⤒</span></button>
  <button type="button" class="tb crouch" data-hold="CROUCH" aria-label="Pietupties un slīdēt"><span>⤓</span></button>
  <button type="button" class="tb dash" data-tap="DASH" aria-label="Rāviens"><span>»</span></button>
  <button type="button" class="tb reload" data-tap="RELOAD" aria-label="Pārlādēt"><span>R</span></button>
  <button type="button" class="tb swap" data-action="swap" aria-label="Mainīt ieroci"><span>⇄</span></button>
  <button type="button" class="tb tb-scope" data-toggle="ALT" aria-label="Tēmēklis"><span>◎</span></button>
  <button type="button" class="tb pause" data-action="pause" aria-label="Pauze"><span>❚❚</span></button>
`;

export function createTouchControls(input, getSettings, { onPause, onFirstTouch }) {
  const layer = document.createElement("div");
  layer.id = "touch";
  layer.innerHTML = LAYOUT;
  document.body.append(layer);
  const stick = layer.querySelector(".stick");
  const knob = stick.querySelector("i");
  const pointers = new Map();
  let held = 0, toggled = 0, isFirst = true;
  const tapTimers = new Map();

  const publish = () => input.setTouchButtons(held | toggled);

  function setStick(origin, x, y) {
    let dx = x - origin.x, dy = y - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) { dx *= STICK_RADIUS / len; dy *= STICK_RADIUS / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let fwd = -dy / STICK_RADIUS, side = dx / STICK_RADIUS;
    if (Math.hypot(fwd, side) < DEADZONE) fwd = side = 0;
    input.setTouchAxes(fwd, side);
  }

  function look(p, x, y) {
    const scale = LOOK_SPEED * getSettings().touchSensitivity * input.sensitivityScale;
    input.addYaw(-(x - p.x) * scale);
    input.addPitch(-(y - p.y) * scale);
    p.x = x;
    p.y = y;
  }

  function onDown(e) {
    e.preventDefault();
    if (isFirst) { isFirst = false; onFirstTouch?.(); }
    const button = e.target.closest(".tb");
    const zone = e.target.closest("[data-zone]");
    layer.setPointerCapture?.(e.pointerId);
    if (button) {
      button.classList.add("down");
      const entry = { button, x: e.clientX, y: e.clientY, isLook: button.hasAttribute("data-look") };
      pointers.set(e.pointerId, entry);
      if (button.dataset.hold) { held |= BUTTON[button.dataset.hold]; publish(); }
      if (button.dataset.tap) {
        const bit = BUTTON[button.dataset.tap];
        held |= bit;
        publish();
        clearTimeout(tapTimers.get(bit));
        tapTimers.set(bit, setTimeout(() => { held &= ~bit; publish(); }, TAP_MS));
      }
      if (button.dataset.toggle) {
        toggled ^= BUTTON[button.dataset.toggle];
        button.classList.toggle("on", (toggled & BUTTON[button.dataset.toggle]) !== 0);
        publish();
      }
      if (button.dataset.action === "swap") input.cycleWeapon();
      if (button.dataset.action === "pause") onPause?.();
      return;
    }
    if (zone?.dataset.zone === "move" && ![...pointers.values()].some(p => p.zone === "move")) {
      pointers.set(e.pointerId, { zone: "move", origin: { x: e.clientX, y: e.clientY } });
      stick.hidden = false;
      stick.style.left = `${e.clientX}px`;
      stick.style.top = `${e.clientY}px`;
      setStick({ x: e.clientX, y: e.clientY }, e.clientX, e.clientY);
      return;
    }
    pointers.set(e.pointerId, { zone: "look", x: e.clientX, y: e.clientY });
  }

  function onMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.zone === "move") setStick(p.origin, e.clientX, e.clientY);
    else if (p.zone === "look" || p.isLook) look(p, e.clientX, e.clientY);
  }

  function onUp(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (p.zone === "move") {
      stick.hidden = true;
      input.setTouchAxes(0, 0);
    }
    if (p.button) {
      p.button.classList.remove("down");
      if (p.button.dataset.hold) { held &= ~BUTTON[p.button.dataset.hold]; publish(); }
    }
  }

  layer.addEventListener("pointerdown", onDown);
  layer.addEventListener("pointermove", onMove);
  layer.addEventListener("pointerup", onUp);
  layer.addEventListener("pointercancel", onUp);
  layer.addEventListener("contextmenu", e => e.preventDefault());

  function reset() {
    pointers.clear();
    held = 0;
    toggled = 0;
    stick.hidden = true;
    for (const b of layer.querySelectorAll(".tb")) b.classList.remove("down", "on");
    input.setTouchAxes(0, 0);
    publish();
  }

  return { reset, element: layer };
}
