// Runtime-only barriers: promises never enter the save or resource caches.
// Start the clock at the HP-zero transaction, so impact feedback overlaps the
// 555ms hold instead of adding a second, source-dependent delay.
export const ZERO_HP_PAUSE_MS = 555;
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
    pause = { complete: false, promise: null, startedAt: Date.now(), duration: ZERO_HP_PAUSE_MS, resolve: null };
    pauses.set(unit, pause);
    pause.promise = new Promise((resolve) => { pause.resolve = resolve; });
    completeAfter(app, pause, ZERO_HP_PAUSE_MS);
  }
  return pause.promise;
}

function completeAfter(app, pause, duration) {
  Promise.resolve(app.wait?.(duration)).then(() => {
    if (pause.complete) return;
    pause.complete = true;
    pause.resolve();
  });
}

// Both death presentation and rule resolution await the same barrier. Shorten
// that existing barrier instead of stacking another wait onto the combo beat.
export function shortenZeroHpPause(app, unit, duration = 280) {
  const pause = pausesByApp.get(app)?.get(unit);
  if (!pause || pause.complete || unit.hp > 0 || unit.kind === "player" || unit.enemyId === "gate") return;
  const shortened = Math.max(0, Math.floor(duration));
  if (shortened >= pause.duration) return;
  pause.duration = shortened;
  completeAfter(app, pause, Math.max(0, shortened - (Date.now() - pause.startedAt)));
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
