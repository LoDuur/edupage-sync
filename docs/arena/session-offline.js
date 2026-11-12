import { TICK_DT } from "./sim/constants.js";
import { setLoadout, stepGame } from "./sim/game.js";

const MAX_STEPS_PER_FRAME = 6;

export function createOfflineSession(game, local) {
  let accumulator = 0;
  const prevPositions = new Map();
  const inputs = new Map([[local.id, null]]);
  return {
    game, local, localId: local.id, isOnline: false, prevPositions,
    get alpha() { return accumulator / TICK_DT; },
    step(dt, sample, onTick) {
      accumulator = Math.min(accumulator + dt, TICK_DT * MAX_STEPS_PER_FRAME);
      while (accumulator >= TICK_DT) {
        accumulator -= TICK_DT;
        for (const p of game.players) {
          let prev = prevPositions.get(p.id);
          if (!prev) prevPositions.set(p.id, prev = { x: 0, y: 0, z: 0 });
          prev.x = p.move.pos.x; prev.y = p.move.pos.y; prev.z = p.move.pos.z;
        }
        inputs.set(local.id, sample());
        onTick(stepGame(game, inputs));
        if (game.isOver) return;
      }
    },
    setLoadout(loadout) { setLoadout(game, local.id, loadout); },
    dispose() {},
  };
}
