// One panel/preview clock: 2.5s text, .5s crossfade, 1.25s art/seal,
// .75s crossfade back, 1.5s text. Rebuilt DOM resumes the same 6.5s phase.
export const CARD_CONTENT_CYCLE_MS = 6500;

export function cardContentCycleElapsed(startedAt, now = Date.now()) {
  const epoch = Number(startedAt);
  return Number.isFinite(epoch) && epoch > 0
    ? Math.max(0, now - epoch) % CARD_CONTENT_CYCLE_MS : 0;
}

// Capture the shared clock's current opacity when selection interrupts a card.
// The selection fade has its own 500ms deadline; it never moves the panel clock.
export function cardContentOverlayOpacity(startedAt, now = Date.now()) {
  const elapsed = cardContentCycleElapsed(startedAt, now);
  if (elapsed < 2500 || elapsed >= 5000) return 0;
  if (elapsed < 3000) return (elapsed - 2500) / 500;
  if (elapsed <= 4250) return 1;
  return (5000 - elapsed) / 750;
}
