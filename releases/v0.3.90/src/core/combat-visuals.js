const clockNow = () => globalThis.performance?.now?.() ?? Date.now();

export function resetCombatVisualEpoch(combat, now = clockNow()) {
  if (combat) combat.visualEpoch = now;
}

// One render snapshot serves every enemy and every persistent animation.
// Negative delays reconstruct the current phase even when innerHTML replaces
// the nodes. Each subanimation uses its own actual CSS period.
export function combatAnimationStyle(combat, now = clockNow()) {
  if (!combat) return "";
  if (!Number.isFinite(combat.visualEpoch)) resetCombatVisualEpoch(combat, now);
  const elapsed = Math.max(0, now - combat.visualEpoch);
  const periods = {
    burn: 1150, "burn-sparks": 2300, freeze: 3400, stun: 1000,
    huntian: 2150, mountain: 180, "mountain-touch": 200, "ghost-flash": 2150,
  };
  return Object.entries(periods)
    .map(([name, period]) => `--enemy-${name}-phase:-${(elapsed % period).toFixed(3)}ms;`)
    .join("");
}
