import { AUTHORITATIVE_EFFECTS, STEP_MS, applyInput, restoreMatch, serializeMatch, stepMatch } from "./sim.js?v=3";

const LEAD_MARGIN_MS = 45;
const DEFAULT_RTT_MS = 120;
const CLOCK_SAMPLE_COUNT = 8;
const CLOCK_BLEND = 0.2;
const MAX_DRIFT_STEPS = 40;
const SNAP_DISTANCE_PX = 220;
const TELEPORT_DISTANCE_PX = 120;
const ERROR_DECAY_MS = 70;
const MIN_VISIBLE_ERROR_PX = 0.3;

function trackedPositions(m) {
  const positions = new Map();
  for (const ball of m.balls) positions.set(ball.id, { x: ball.x, y: ball.y });
  for (const paddle of m.paddles) positions.set(paddle.id, { x: paddle.x, y: paddle.y });
  for (const hazard of m.boss?.hazards ?? []) positions.set(hazard.id, { x: hazard.x, y: hazard.y });
  return positions;
}

export class MatchPredictor {
  constructor({ me, settings }) {
    this.me = me;
    this.settings = settings;
    this.match = null;
    this.confirmed = null;
    this.log = [];
    this.cursor = 0;
    this.seq = 0;
    this.isDirty = false;
    this.clockOffset = null;
    this.rtt = DEFAULT_RTT_MS;
    this.samples = [];
    this.previous = new Map();
    this.errors = new Map();
    this.lastAdvanceAt = 0;
    this.alpha = 0;
  }

  observePong(sentAt, serverStep, now) {
    const rtt = Math.max(0, now - sentAt);
    this.samples.push({ rtt, offset: serverStep + rtt / 2 / STEP_MS - now / STEP_MS });
    if (this.samples.length > CLOCK_SAMPLE_COUNT) this.samples.shift();
    this.rtt = this.samples.reduce((sum, sample) => sum + sample.rtt, 0) / this.samples.length;
    const best = this.samples.reduce((lowest, sample) => (sample.rtt < lowest.rtt ? sample : lowest));
    const isFarOff = this.clockOffset === null || Math.abs(best.offset - this.clockOffset) > MAX_DRIFT_STEPS / 2;
    this.clockOffset = isFarOff ? best.offset : this.clockOffset + (best.offset - this.clockOffset) * CLOCK_BLEND;
  }

  targetStep(now) {
    return now / STEP_MS + this.clockOffset + (this.rtt / 2 + LEAD_MARGIN_MS) / STEP_MS;
  }

  ingestSync(state, acks, now) {
    this.confirmed = state;
    this.log = this.log.filter(entry => entry.seq > (acks[entry.owner] ?? 0));
    this.isDirty = true;
    if (this.clockOffset === null) this.clockOffset = state.step + DEFAULT_RTT_MS / 2 / STEP_MS - now / STEP_MS;
    const shortfall = state.step - this.targetStep(now);
    if (shortfall > 0) this.clockOffset += shortfall;
  }

  insertEntry(entry) {
    let index = this.log.length;
    while (index > 0 && this.log[index - 1].step > entry.step) index--;
    this.log.splice(index, 0, entry);
    if (index < this.cursor) this.isDirty = true;
  }

  ingestRemoteInput(owner, seq, step, input) {
    this.insertEntry({ owner, seq, step, input });
    if (this.match && step <= this.match.step) this.isDirty = true;
  }

  applyDue(m, nextStep) {
    while (this.cursor < this.log.length && this.log[this.cursor].step <= nextStep) {
      const entry = this.log[this.cursor++];
      applyInput(m, entry.owner, entry.input);
    }
  }

  replay(targetStep) {
    const before = this.match && this.match.step === targetStep ? trackedPositions(this.match) : null;
    const m = restoreMatch(structuredClone(this.confirmed), this.settings);
    this.cursor = 0;
    this.applyDue(m, m.step);
    this.previous = trackedPositions(m);
    while (m.step < targetStep && m.phase !== "over") {
      if (m.step === targetStep - 1) this.previous = trackedPositions(m);
      this.applyDue(m, m.step + 1);
      stepMatch(m);
      m.fx.length = 0;
    }
    this.match = m;
    this.isDirty = false;
    this.recordCorrections(before, trackedPositions(m));
  }

  recordCorrections(before, after) {
    if (!before) {
      this.errors.clear();
      return;
    }
    for (const [id, position] of after) {
      const old = before.get(id);
      if (!old) continue;
      const carried = this.errors.get(id) ?? { x: 0, y: 0 };
      const x = old.x + carried.x - position.x;
      const y = old.y + carried.y - position.y;
      if (Math.hypot(x, y) > SNAP_DISTANCE_PX) this.errors.delete(id);
      else this.errors.set(id, { x, y });
    }
  }

  decayErrors(deltaMs) {
    const keep = Math.exp(-deltaMs / ERROR_DECAY_MS);
    for (const [id, error] of this.errors) {
      error.x *= keep;
      error.y *= keep;
      if (Math.hypot(error.x, error.y) < MIN_VISIBLE_ERROR_PX) this.errors.delete(id);
    }
  }

  advance(now, gatherLocalInputs, sendInput) {
    if (!this.confirmed) return [];
    const exactTarget = this.targetStep(now);
    const target = Math.max(this.confirmed.step, Math.floor(exactTarget));
    this.alpha = Math.max(0, Math.min(1, exactTarget - Math.floor(exactTarget)));
    this.decayErrors(Math.min(100, now - this.lastAdvanceAt));
    this.lastAdvanceAt = now;
    const isFarOff = !this.match || Math.abs(target - this.match.step) > MAX_DRIFT_STEPS;
    if (isFarOff) this.replay(target);
    else if (this.isDirty) this.replay(this.match.step);
    const effects = [];
    const m = this.match;
    while (m.step < target && m.phase !== "over") {
      this.previous = trackedPositions(m);
      const nextStep = m.step + 1;
      for (const input of gatherLocalInputs()) {
        const entry = { owner: this.me, seq: ++this.seq, step: nextStep, input };
        this.insertEntry(entry);
        sendInput(entry);
      }
      this.applyDue(m, nextStep);
      stepMatch(m);
      for (const effect of m.fx) if (!AUTHORITATIVE_EFFECTS.has(effect[0])) effects.push(effect);
      m.fx.length = 0;
    }
    return effects;
  }

  blended(id, x, y) {
    const previous = this.previous.get(id);
    const error = this.errors.get(id);
    const isTeleport = !previous || Math.hypot(x - previous.x, y - previous.y) > TELEPORT_DISTANCE_PX;
    const baseX = isTeleport ? x : previous.x + (x - previous.x) * this.alpha;
    const baseY = isTeleport ? y : previous.y + (y - previous.y) * this.alpha;
    return { x: baseX + (error?.x ?? 0), y: baseY + (error?.y ?? 0) };
  }

  view() {
    if (!this.match) return null;
    const view = serializeMatch(this.match);
    for (const row of view.balls) {
      const { x, y } = this.blended(row[0], row[1], row[2]);
      row[1] = x;
      row[2] = y;
    }
    for (const row of view.paddles) {
      const { x, y } = this.blended(row[0], row[2], row[3]);
      row[2] = x;
      row[3] = y;
    }
    view.hazards = view.hazards.map(hazard => ({ ...hazard, ...this.blended(hazard.id, hazard.x, hazard.y) }));
    return view;
  }
}
