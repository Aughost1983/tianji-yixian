// Runtime-only barriers: promises never enter the save or resource caches.
// Start the clock at the HP-zero transaction, so impact feedback overlaps the
// one-second hold instead of adding a second, source-dependent delay.
export const ZERO_HP_PAUSE_MS = 1000;
const pausesByApp = new WeakMap();

function pausesFor(app) {
  let pauses = pausesByApp.get(app);
  if (!pauses) { pauses = new WeakMap(); pausesByApp.set(app, pauses); }
  return pauses;
}

export function beginZeroHpPause(app, unit) {
  if (!unit) return null;
  const pauses = pausesFor(app);
  if (unit.hp > 0) { pauses.delete(unit); return null; }
  let pause = pauses.get(unit);
  if (!pause) {
    pause = { complete: false, promise: null };
    pauses.set(unit, pause);
    pause.promise = Promise.resolve(app.wait?.(ZERO_HP_PAUSE_MS)).then(() => {
      pause.complete = true;
    });
  }
  return pause.promise;
}

export async function waitForZeroHpPause(app, unit) {
  const promise = beginZeroHpPause(app, unit);
  if (promise) await promise;
}

export function isZeroHpPaused(app, unit) {
  return Boolean(unit && unit.hp <= 0 && !pausesByApp.get(app)?.get(unit)?.complete
    && pausesByApp.get(app)?.has(unit));
}

export function releaseZeroHpPause(app, unit) {
  if (unit?.hp > 0) pausesByApp.get(app)?.delete(unit);
}
