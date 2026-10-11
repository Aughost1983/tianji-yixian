export const STATUS_KEYS = ["burn","entangle","swordIntent","swordIntentGourd","swordDomain","eightDirectionsWard","clearMind","coldResistance","steadfast","heatResistance","hardness","reflection","undying","nirvana","armorBreak","heartDemon","lostMind","foresight","qiStagnation","stun","freeze","barrier","healing","concentration","fiveElementsSecret","windRaccoonBody","tianGangArmor","mainCharacterHalo","petrify","darkForce"];

const TOKEN_KEYS = ["qi", "guard", ...STATUS_KEYS];

// Popup colors and their two short sounds share the same status polarity.
export const POSITIVE_STATUSES = new Set(["swordIntent", "swordIntentGourd", "swordDomain", "eightDirectionsWard", "qi", "guard", "clearMind", "coldResistance", "steadfast", "heatResistance", "hardness", "reflection", "undying", "nirvana", "foresight", "barrier", "healing", "concentration", "fiveElementsSecret", "windRaccoonBody", "tianGangArmor", "petrify"]);

// Qi Into Bone reads live HP in both gameplay and every card preview. Clamp
// over-healing and invalid legacy values before taking complete 25% HP bands.
export function gatherQiHpGain(unit) {
  const maxHp = Number(unit?.maxHp);
  if (!Number.isFinite(maxHp) || maxHp <= 0) return 0;
  const hp = Math.max(0, Math.min(maxHp, Number(unit?.hp) || 0));
  return Math.max(0, Math.min(4, Math.floor(hp * 4 / maxHp)));
}

function buffTokenActive(unit, key) {
  if (key === "qi") return (unit?.qi ?? 0) > 0;
  if (key === "guard") return (unit?.guard ?? 0) > 0;
  return getStatus(unit ?? {}, key) > 0;
}

function normalizeBuffOrder(unit) {
  if (!unit) return [];
  const seen = new Set();
  const existing = Array.isArray(unit.buffOrder) ? unit.buffOrder : [];
  unit.buffOrder = existing.filter((key) => {
    if (!TOKEN_KEYS.includes(key) || seen.has(key) || !buffTokenActive(unit, key)) return false;
    seen.add(key);
    return true;
  });
  return unit.buffOrder;
}

export function syncBuffOrder(unit, key = null) {
  if (!unit) return [];
  const order = normalizeBuffOrder(unit);
  if (key && TOKEN_KEYS.includes(key) && buffTokenActive(unit, key) && !order.includes(key)) order.push(key);
  if (key && !buffTokenActive(unit, key)) unit.buffOrder = order.filter((entry) => entry !== key);
  return unit.buffOrder;
}

export function orderedBuffKeys(unit) {
  const order = normalizeBuffOrder(unit);
  for (const key of TOKEN_KEYS) {
    if (buffTokenActive(unit, key) && !order.includes(key)) order.push(key);
  }
  return [...order];
}

export function getStatus(unit, status) {
  return unit.statuses?.[status] ?? 0;
}

// Full-Mana resistance is derived from the current resources, never stored as
// a buff: spending Mana or raising Max Mana must remove it immediately.
export function isManaAtCap(unit) {
  if (unit?.maxMana == null) return false;
  const cap = Number(unit?.maxMana);
  const mana = Number(unit?.mana ?? 0);
  return Number.isFinite(cap) && cap >= 0 && Number.isFinite(mana) && mana >= cap;
}

// Every Mana gain/refill uses this transition, including items, drain effects,
// turn-start flow and enemy skills. Deliberate overflow remains unchanged.
export function setMana(unit, amount) {
  const before = Number(unit.mana ?? 0);
  unit.mana = amount;
  const clearedQiStagnation = before < Number(unit.maxMana) && isManaAtCap(unit)
    ? Math.max(0, getStatus(unit, "qiStagnation")) : 0;
  if (clearedQiStagnation > 0) removeStatus(unit, "qiStagnation", Infinity);
  return { before, after: unit.mana, clearedQiStagnation };
}

export function getDarkForceInstances(unit) {
  return Array.isArray(unit?.combatFlags?.darkForceInstances)
    ? unit.combatFlags.darkForceInstances.filter((entry) => entry && entry.stacks > 0)
    : [];
}

function syncDarkForceStatus(unit) {
  if (!unit) return 0;
  unit.statuses ??= {};
  unit.combatFlags ??= {};
  const instances = getDarkForceInstances(unit).map((entry) => ({
    stacks: Math.max(0, Math.floor(entry.stacks ?? 0)),
    damage: Math.max(0, Math.floor(entry.damage ?? 0)),
  })).filter((entry) => entry.stacks > 0);
  unit.combatFlags.darkForceInstances = instances;
  unit.statuses.darkForce = instances.reduce((sum, entry) => sum + entry.stacks, 0);
  syncBuffOrder(unit, "darkForce");
  return unit.statuses.darkForce;
}

export function addDarkForceInstance(unit, stacks, damage) {
  if (!unit) return false;
  const normalizedStacks = Math.max(0, Math.floor(stacks ?? 0));
  if (normalizedStacks <= 0) return false;
  unit.combatFlags ??= {};
  unit.combatFlags.darkForceInstances ??= [];
  unit.combatFlags.darkForceInstances.push({ stacks: normalizedStacks, damage: Math.max(0, Math.floor(damage ?? 0)) });
  syncDarkForceStatus(unit);
  return true;
}

export function clearDarkForce(unit) {
  if (!unit) return;
  unit.combatFlags ??= {};
  unit.combatFlags.darkForceInstances = [];
  unit.statuses ??= {};
  unit.statuses.darkForce = 0;
  syncBuffOrder(unit, "darkForce");
}

export function statusResistance(unit, status, { ignoreBarrier = false } = {}) {
  if (status === "qiStagnation" && isManaAtCap(unit)) return 100;
  // Nonliving immunity belongs to the unit itself, not to a removable buff.
  // The id fallback also covers old combat saves that lack the nonliving flag.
  if (["stun", "darkForce"].includes(status) && (unit?.nonliving || ["stoneGolem", "gate"].includes(unit?.enemyId))) return 100;
  // Barrier is normally a hard immunity gate for the listed elemental/control debuffs.
  // A few explicitly barrier-piercing lightning attacks bypass only this Barrier-conferred
  // resistance; other resistance sources still apply normally.
  if (!ignoreBarrier && getStatus(unit, "barrier") > 0 && ["freeze", "burn", "stun", "qiStagnation", "armorBreak", "entangle"].includes(status)) return 100;

  let resist = 0;
  if (["freeze", "burn", "stun", "qiStagnation", "armorBreak", "entangle"].includes(status) && getStatus(unit, "fiveElementsSecret") > 0) resist += 25;
  if (status === "freeze" && getStatus(unit, "coldResistance") > 0) resist += 75;
  if (status === "stun" && getStatus(unit, "steadfast") > 0) resist += 75;
  if (status === "stun" && getStatus(unit, "clearMind") > 0) resist += 50;
  if (status === "stun") resist += 25 * Math.max(0, getStatus(unit, "stun"));
  if (status === "burn") {
    if (getStatus(unit, "heatResistance") > 0) resist += 75;
    return Math.max(0, Math.min(100, resist));
  }
  if (status === "armorBreak" && getStatus(unit, "hardness") > 0) resist += 75;
  if (status === "qiStagnation" && getStatus(unit, "swordIntentGourd") > 0) resist += 50;
  if (status === "heartDemon" && unit?.grade === "D") resist += 100;
  if (status === "heartDemon" && getStatus(unit, "lostMind") > 0) resist += 100;
  if (status === "heartDemon" && getStatus(unit, "clearMind") > 0) resist += 50;
  return Math.max(0, Math.min(100, resist));
}

export function burnDamageAfterHeatResistance(unit, rawDamage) {
  const raw = Math.max(0, Math.floor(rawDamage ?? 0));
  return getStatus(unit, "heatResistance") > 0 ? Math.floor(raw / 2) : raw;
}

export function consumeConcentrationOnHpLoss(unit, hpLoss) {
  const before = Math.max(0, Math.floor(getStatus(unit, "concentration")));
  if (before <= 0 || !(hpLoss > 0)) return { before, after: before };
  removeStatus(unit, "concentration", 1);
  return { before, after: Math.max(0, Math.floor(getStatus(unit, "concentration"))) };
}

export function entangleSkipChance(unitOrStacks) {
  const stacks = typeof unitOrStacks === "number"
    ? Math.max(0, Math.floor(unitOrStacks))
    : Math.max(0, Math.floor(getStatus(unitOrStacks ?? {}, "entangle")));
  return Math.min(100, Math.min(stacks, 2) * 10 + Math.max(0, stacks - 2) * 5);
}

// Fire-hit conversion is a status transformation, not a fresh Burn application.
// It bypasses ordinary numeric Burn resistance (notably Heat Resistance), but
// preserves hard state rules: Barrier is Burn immunity, and Freeze cannot coexist
// with a newly acquired Burn status. If either gate is active, no conversion occurs.
export function convertEntangleToBurn(unit) {
  const entangleBefore = Math.max(0, Math.floor(getStatus(unit ?? {}, "entangle")));
  const burnBefore = Math.max(0, Math.floor(getStatus(unit ?? {}, "burn")));
  const hardBlocked = Boolean(unit && (getStatus(unit, "barrier") > 0 || getStatus(unit, "freeze") > 0));
  if (!unit || entangleBefore <= 0 || hardBlocked) {
    return { converted: 0, entangleBefore, entangleAfter: entangleBefore, burnBefore, burnAfter: burnBefore, hardBlocked };
  }
  removeStatus(unit, "entangle", Infinity);
  unit.statuses ??= {};
  unit.statuses.burn = burnBefore + entangleBefore;
  syncBuffOrder(unit, "burn");
  return { converted: entangleBefore, entangleBefore, entangleAfter: 0, burnBefore, burnAfter: unit.statuses.burn, hardBlocked: false };
}

export function addStatus(unit, status, stacks) {
  unit.statuses ??= {};
  if (status === "qiStagnation" && stacks > 0 && isManaAtCap(unit)) return false;
  if (status === "burn" && getStatus(unit, "freeze") > 0) return false;
  if (status === "stun" && getStatus(unit, "freeze") > 0) return false;
  unit.statuses[status] = Math.max(0, (unit.statuses[status] ?? 0) + stacks);
  if (status === "lostMind" && unit.statuses[status] > 0) unit.statuses[status] = 1;
  // Freeze and Armor Break cannot coexist. Clear Armor Break only after Freeze
  // has actually been applied (i.e. after resistance/chance gates in callers),
  // so guard granted by the successful Freeze can exist immediately.
  if (status === "freeze" && unit.statuses[status] > 0 && getStatus(unit, "armorBreak") > 0) {
    removeStatus(unit, "armorBreak", Infinity);
  }
  // Only a successfully applied control status dispels armed reactions. Stun
  // clears Stance below as usual; neither it nor Freeze purges passive buffs.
  if ((status === "freeze" || status === "stun") && stacks > 0 && unit.statuses[status] > 0 && unit.combatFlags) {
    delete unit.combatFlags.ghostFlash;
    delete unit.combatFlags.enemyGhostFlash;
    delete unit.combatFlags.mountainCounter;
    delete unit.combatFlags.enemyMountainCounter;
  }
  if (status === "armorBreak" || status === "stun") {
    clearGuard(unit);
  }
  syncBuffOrder(unit, status);
  return true;
}

export function removeStatus(unit, status, stacks = Infinity) {
  // Wind-Raccoon Body is a fixed permanent passive of the Five-Elements rookie.
  // Generic cleanses, status purges and other effects may not remove it.
  if (status === "windRaccoonBody" && unit?.enemyId === "fiveElementsOuterDisciple" && getStatus(unit, status) > 0) return;
  const current = getStatus(unit, status);
  unit.statuses ??= {};
  unit.statuses[status] = Math.max(0, current - stacks);
  syncBuffOrder(unit, status);
}

export function clearGuard(unit, { breakFreeze = true } = {}) {
  if (!unit) return 0;
  const before = Math.max(0, Math.floor(unit.guard ?? 0));
  unit.guard = 0;
  syncBuffOrder(unit, "guard");
  // Freeze is an ice shell tied to Stance. Any explicit Stance break thaws all
  // remaining Freeze, except the normal turn-start reset which must happen
  // before the shell is rebuilt from the current Freeze stacks.
  if (breakFreeze && getStatus(unit, "freeze") > 0) removeStatus(unit, "freeze", Infinity);
  return before;
}

export function reduceGuard(unit, amount, { breakFreeze = true } = {}) {
  if (!unit) return 0;
  const before = Math.max(0, Math.floor(unit.guard ?? 0));
  const loss = Math.max(0, Math.floor(amount ?? 0));
  unit.guard = Math.max(0, before - loss);
  syncBuffOrder(unit, "guard");
  if (breakFreeze && before > 0 && unit.guard === 0 && getStatus(unit, "freeze") > 0) removeStatus(unit, "freeze", Infinity);
  return before - unit.guard;
}

export function gainGuard(unit, amount) {
  if (getStatus(unit, "armorBreak") > 0) {
    clearGuard(unit);
    return 0;
  }
  unit.guard = Math.max(0, Math.floor(unit.guard ?? 0)) + Math.max(0, Math.floor(amount));
  syncBuffOrder(unit, "guard");
  return amount;
}

function permanentStatusesFor(unit) {
  const preserved = {};
  if (unit?.enemyId === "fiveElementsOuterDisciple" && getStatus(unit, "windRaccoonBody") > 0) preserved.windRaccoonBody = 1;
  return preserved;
}

export function canTriggerWindRaccoonBody(unit) {
  return Boolean(unit && unit.kind === "enemy" && unit.enemyId === "fiveElementsOuterDisciple"
    && unit.hp <= 0 && getStatus(unit, "windRaccoonBody") > 0 && Math.max(0, Math.floor(unit.mana ?? 0)) > 0);
}

export function resolveWindRaccoonBody(unit) {
  if (!canTriggerWindRaccoonBody(unit)) return null;
  const manaSpent = Math.max(0, Math.floor(unit.mana ?? 0));
  const maxHp = Math.max(0, Math.floor(unit.maxHp ?? 0));
  const hpRecovered = Math.min(maxHp, manaSpent * 5);
  unit.mana = 0;
  unit.hp = hpRecovered;
  // No statuses, flags, Qi or Stance are touched. This fixed passive deliberately
  // resolves before Undying / Nirvana and preserves the entire existing state.
  syncBuffOrder(unit, "windRaccoonBody");
  return { manaSpent, hpRecovered };
}

function preserveRevivalMartialDamageFlags(unit) {
  const flags = unit?.combatFlags ?? {};
  const preserved = {};
  // These are skill-created, round-scoped damage commitments rather than statuses.
  // Keep them across Undying/Nirvana so a revived unit executes the martial damage
  // already shown by its intent/card preview; ordinary statuses/resources still purge.
  for (const key of ["martialBurst", "enemyMartialBurst", "ironBoneActive"]) {
    if (!(key in flags)) continue;
    const value = flags[key];
    preserved[key] = value && typeof value === "object" ? { ...value } : value;
  }
  // Hidden Sword Peak's rookie consumes real pills/talismans. Their successful
  // use counts survive an [Undying] revival so AI limits and remaining drops
  // cannot be reset by dying once; the next-turn Sword Control discount is
  // intentionally not preserved.
  if (unit?.enemyId === "hiddenSwordOuterDisciple" && flags.skillUseCounts) {
    preserved.skillUseCounts = structuredClone(flags.skillUseCounts);
  }
  // Zhengyang body cultivators carry a finite stock of Blood Pills for the whole
  // battle. Reviving through Undying/Nirvana must not refill that stock.
  if (["zhengyangDisciple", "zhengyangElite", "zhengyangChief"].includes(unit?.enemyId)
    && Number.isFinite(flags.bloodPillCarried)) {
    preserved.bloodPillCarried = Math.max(0, Math.floor(flags.bloodPillCarried));
  }
  // Gate Awaken decay is explicitly battle-wide. Undying revival must not erase
  // the number of Stone Golems that were successfully awakened earlier in the fight.
  if (unit?.enemyId === "gate" && Number.isFinite(flags.gateAwakenSuccessCount)) {
    preserved.gateAwakenSuccessCount = Math.max(0, Math.floor(flags.gateAwakenSuccessCount));
  }
  return preserved;
}

// [Undying] is combat-only and does not decay by turn. When any combat unit with
// one or more stacks reaches 0 HP, all current combat statuses/resources are purged,
// then the pre-purge stack count determines the one-shot recovery. Percentage HP
// recovery follows the project's existing integer percent convention: floor.
export function resolveUndying(unit) {
  const stacks = Math.max(0, Math.floor(getStatus(unit, "undying")));
  if (!unit || !["player", "enemy"].includes(unit.kind) || unit.hp > 0 || stacks <= 0) return null;
  const hpRecovered = Math.floor((unit.maxHp ?? 0) * stacks * 0.04);
  const qiGained = stacks * 4;
  const preservedMartialFlags = preserveRevivalMartialDamageFlags(unit);
  unit.statuses = permanentStatusesFor(unit);
  unit.buffOrder = Object.keys(unit.statuses);
  unit.qi = 0;
  unit.guard = 0;
  unit.combatFlags = preservedMartialFlags;
  unit.hp = Math.min(unit.maxHp ?? hpRecovered, hpRecovered);
  unit.qi = qiGained;
  syncBuffOrder(unit, "qi");
  return { stacks, hpRecovered: unit.hp, qiGained };
}

// [Nirvana] is a Burn-specific rescue. It triggers only when Burn damage has
// already reduced HP to 0. The Burn stack count is captured before the purge:
// every cleared stack adds 20 HP and 2 Mana on top of the immediate 1 HP.
// HP remains capped, while Mana is intentionally allowed to overflow maxMana.
export function resolveNirvanaFromBurn(unit, burnStacksOverride = null) {
  const burnStacks = Math.max(0, Math.floor(burnStacksOverride ?? getStatus(unit ?? {}, "burn")));
  if (!unit || !["player", "enemy"].includes(unit.kind) || unit.hp > 0 || getStatus(unit, "nirvana") <= 0 || burnStacks <= 0) return null;
  const maxHp = Math.max(0, Math.floor(unit.maxHp ?? 0));
  const manaBefore = Math.max(0, Math.floor(unit.mana ?? 0));
  const hpRecovered = Math.min(maxHp, 1 + burnStacks * 20);
  const manaGained = burnStacks * 2;
  const preservedMartialFlags = preserveRevivalMartialDamageFlags(unit);
  unit.statuses = permanentStatusesFor(unit);
  unit.buffOrder = Object.keys(unit.statuses);
  unit.qi = 0;
  unit.guard = 0;
  unit.combatFlags = preservedMartialFlags;
  unit.hp = hpRecovered;
  setMana(unit, manaBefore + manaGained);
  return { burnStacks, hpRecovered, manaBefore, manaAfter: unit.mana, manaGained };
}

export function heartDemonTriggerChance(unit) {
  const heart = getStatus(unit, "heartDemon");
  return Math.max(0, Math.min(100, 50 + (heart - (unit.sense ?? 0)) * 5));
}

// Shared Heart Demon roll. The probability is common to player, enemies and
// meditation, while each caller resolves the consequence. A flare-up is also
// the only generic way Heart Demon naturally decays: callers remove 1 stack
// after resolving their player/enemy/meditation consequence.
export function resolveHeartDemon(unit, rng) {
  const heart = getStatus(unit, "heartDemon");
  const chance = heartDemonTriggerChance(unit);
  const triggered = heart > 0 && Boolean(rng?.chance?.(chance));
  return { triggered, chance, heartBefore: heart, heartAfter: heart };
}

export function startTurnCommon(unit, { manaRegen = 0, rng = null, onResourceGain = null } = {}) {
  // [Reflection] lasts only until the holder's next own turn. Clear it before
  // any new turn-start resources are rebuilt.
  if (getStatus(unit, "reflection") > 0) removeStatus(unit, "reflection", Infinity);

  // Ordinary turn-start Stance cleanup is the one clear that must preserve
  // Freeze: the frozen shell is rebuilt immediately afterward from its stacks.
  clearGuard(unit, { breakFreeze: false });

  const stagnation = getStatus(unit, "qiStagnation");
  unit.qi = Math.floor((unit.qi ?? 0) / 2);
  if (stagnation > 0) unit.qi = Math.floor((unit.qi ?? 0) / 2);
  syncBuffOrder(unit, "qi");

  // Diamond Body's delayed half resolves only after all ordinary Qi decay,
  // including Qi Stagnation's second halving. This shared hook keeps player and
  // enemy versions identical and is also used by projected enemy intent state.
  const delayedQiGain = Math.max(0, Math.floor(unit.combatFlags?.nextTurnQiGain ?? 0));
  const delayedQiBefore = Math.max(0, Math.floor(unit.qi ?? 0));
  if (delayedQiGain > 0) {
    unit.qi = delayedQiBefore + delayedQiGain;
    delete unit.combatFlags.nextTurnQiGain;
    syncBuffOrder(unit, "qi");
    onResourceGain?.("qi", delayedQiGain);
  }
  const delayedQiAfter = Math.max(0, Math.floor(unit.qi ?? 0));

  // Qi Stagnation pauses all turn-start Mana flow, including the Five-Elements
  // Secret Art bonus. Enemy intent generation pre-rolls the Secret Art proc and
  // stores it on combatFlags so projected Mana and the real upcoming turn use the
  // exact same result. Players (or defensive fallback enemy paths) roll here.
  const hasFiveElementsSecret = getStatus(unit, "fiveElementsSecret") > 0;
  const hasWindRaccoonBody = getStatus(unit, "windRaccoonBody") > 0;
  const plannedFiveElementsFlow = typeof unit.combatFlags?.fiveElementsManaFlowNext === "boolean"
    ? unit.combatFlags.fiveElementsManaFlowNext
    : null;
  const fiveElementsManaFlowRolled = hasFiveElementsSecret
    ? (plannedFiveElementsFlow ?? rollPercent(rng, 50))
    : false;
  if (plannedFiveElementsFlow != null && unit.combatFlags) delete unit.combatFlags.fiveElementsManaFlowNext;
  const fiveElementsManaFlowTriggered = stagnation <= 0 && fiveElementsManaFlowRolled;
  const windRaccoonManaFlowTriggered = stagnation <= 0 && hasWindRaccoonBody;
  const adjustedRegen = stagnation > 0
    ? 0
    : Math.max(0, manaRegen) + (fiveElementsManaFlowTriggered ? 1 : 0) + (windRaccoonManaFlowTriggered ? 1 : 0);
  const manaBeforeRegen = Math.max(0, unit.mana ?? 0);
  setMana(unit, manaBeforeRegen >= unit.maxMana
    ? manaBeforeRegen
    : Math.min(unit.maxMana, manaBeforeRegen + adjustedRegen));

  const healingStacks = Math.max(0, Math.floor(getStatus(unit, "healing")));
  const healingBeforeHp = Math.max(0, Math.floor(unit.hp ?? 0));
  // [Healing] scales with the holder's own Max HP. The displayed value and the
  // real turn-start recovery share this exact ceil(4% * Max HP * stacks) rule.
  const healingRawAmount = healingStacks > 0
    ? Math.ceil(Math.max(0, Math.floor(unit.maxHp ?? 0)) * healingStacks * 0.04)
    : 0;
  if (healingStacks > 0) {
    unit.hp = Math.min(unit.maxHp ?? healingBeforeHp, healingBeforeHp + healingRawAmount);
    removeStatus(unit, "healing", 1);
  }
  const healingAfterHp = Math.max(0, Math.floor(unit.hp ?? 0));

  const concentrationStacks = Math.max(0, Math.floor(getStatus(unit, "concentration")));
  const concentrationBeforeSense = Math.max(0, Math.floor(unit.sense ?? 0));
  if (concentrationStacks > 0) {
    const maxSense = Math.max(concentrationBeforeSense, Math.floor(unit.maxSense ?? concentrationBeforeSense));
    unit.sense = Math.min(maxSense, concentrationBeforeSense + concentrationStacks);
  }
  const concentrationAfterSense = Math.max(0, Math.floor(unit.sense ?? 0));
  if (concentrationStacks > 0) removeStatus(unit, "concentration", 1);

  if (getStatus(unit, "foresight") > 0) removeStatus(unit, "foresight", 1);

  const freeze = getStatus(unit, "freeze");
  if (freeze > 0) {
    // Rebuilding the frozen shell is a turn-start upkeep, not a new status
    // application. Keep the Stance without repeating its floating number.
    gainGuard(unit, freeze * 15);
  }

  let passiveQiGain = 0;
  if (getStatus(unit, "eightDirectionsWard") > 0) passiveQiGain += 8;
  if (getStatus(unit, "tianGangArmor") > 0) passiveQiGain += 1 + Math.ceil(Math.max(0, Math.floor(unit.sense ?? 0)) * 0.5);
  if (passiveQiGain > 0) {
    unit.qi = (unit.qi ?? 0) + passiveQiGain;
    syncBuffOrder(unit, "qi");
    onResourceGain?.("qi", passiveQiGain);
  }

  const entangleStacks = Math.max(0, Math.floor(getStatus(unit, "entangle")));
  const entangleActionSkipChance = entangleSkipChance(entangleStacks);
  const entangleTriggered = entangleStacks > 0 && rng != null && rollPercent(rng, entangleActionSkipChance);

  // gainGuard() can itself shatter Freeze if Armor Break prevents the shell
  // from existing, so decide the action skip from the post-rebuild state.
  const skip = getStatus(unit, "stun") > 0 || getStatus(unit, "freeze") > 0 || entangleTriggered;
  return {
    skip, passiveQiGain, delayedQiGain, delayedQiBefore, delayedQiAfter, entangleStacks, entangleSkipChance: entangleActionSkipChance, entangleTriggered,
    healingStacks, healingAmount: Math.max(0, healingAfterHp - healingBeforeHp), healingBeforeHp, healingAfterHp,
    concentrationStacks, concentrationSenseRestored: Math.max(0, concentrationAfterSense - concentrationBeforeSense),
    concentrationBeforeSense, concentrationAfterSense,
    fiveElementsManaFlowRolled, fiveElementsManaFlowTriggered, windRaccoonManaFlowTriggered, manaBeforeRegen, manaAfterRegen: unit.mana,
  };
}

export function burnTurnEndChances(unit) {
  const burn = Math.max(0, Math.floor(getStatus(unit, "burn")));
  const upChance = Math.min(100, burn * 5 + 10);
  return { downChance: 100 - upChance, upChance };
}

function rollPercent(rng, chance) {
  if (chance <= 0) return false;
  if (chance >= 100) return true;
  if (rng?.chance) return Boolean(rng.chance(chance));
  return Math.random() * 100 < chance;
}

function* endTurnSteps(unit, { rng = null, onResourceGain = null } = {}) {
  const burn = getStatus(unit, "burn");
  let burnDamage = 0, burnChange = 0, burnDownChance = 0, burnUpChance = 0;
  let burnIgnited = false, burnStacksConsumed = 0, nirvanaPending = false, nirvanaBurnStacks = 0;
  let burnAfterHp = Math.max(0, Math.floor(unit.hp ?? 0));
  let burnWindRaccoonBody = null;
  const darkForceTriggers = [];
  const terminalResult = () => ({
    burnDamage, burnChange, burnDownChance, burnUpChance, burnIgnited, burnStacksConsumed, burnAfterHp,
    nirvanaPending, nirvanaBurnStacks, burnWindRaccoonBody, darkForceTriggers,
    barrierStacks: 0, barrierGuardGained: 0, barrierBeforeGuard: Math.max(0, Math.floor(unit.guard ?? 0)), barrierAfterGuard: Math.max(0, Math.floor(unit.guard ?? 0)),
    petrifyStacks: 0, petrifyGuardGained: 0, petrifyBeforeGuard: Math.max(0, Math.floor(unit.guard ?? 0)), petrifyAfterGuard: Math.max(0, Math.floor(unit.guard ?? 0)),
  });

  if (burn >= 18) {
    burnIgnited = true; burnStacksConsumed = burn; burnDamage = burnDamageAfterHeatResistance(unit, burn * 4);
    const beforeBurnHp = unit.hp; unit.hp = Math.max(0, unit.hp - burnDamage); burnAfterHp = unit.hp;
    consumeConcentrationOnHpLoss(unit, Math.max(0, beforeBurnHp - unit.hp));
    yield { type: "damage", status: "burn", beforeHp: beforeBurnHp, afterHp: unit.hp,
      damage: Math.max(0, beforeBurnHp - unit.hp), burnIgnited, burnStacks: burn };
    burnWindRaccoonBody = unit.hp <= 0 ? yield { type: "windRecovery" } : null;
    nirvanaPending = unit.hp <= 0 && !burnWindRaccoonBody && getStatus(unit, "nirvana") > 0;
    if (nirvanaPending) { nirvanaBurnStacks = burn; clearDarkForce(unit); burnChange = -burn; return terminalResult(); }
    removeStatus(unit, "burn", Infinity); burnChange = -burn;
  } else if (burn > 0) {
    burnDamage = burnDamageAfterHeatResistance(unit, 4);
    const beforeBurnHp = unit.hp; unit.hp = Math.max(0, unit.hp - burnDamage); burnAfterHp = unit.hp;
    consumeConcentrationOnHpLoss(unit, Math.max(0, beforeBurnHp - unit.hp));
    yield { type: "damage", status: "burn", beforeHp: beforeBurnHp, afterHp: unit.hp,
      damage: Math.max(0, beforeBurnHp - unit.hp), burnIgnited, burnStacks: burn };
    burnWindRaccoonBody = unit.hp <= 0 ? yield { type: "windRecovery" } : null;
    nirvanaPending = unit.hp <= 0 && !burnWindRaccoonBody && getStatus(unit, "nirvana") > 0;
    if (nirvanaPending) { nirvanaBurnStacks = burn; clearDarkForce(unit); return terminalResult(); }
    ({ downChance: burnDownChance, upChance: burnUpChance } = burnTurnEndChances(unit));
    if (rollPercent(rng, burnUpChance)) { unit.statuses ??= {}; unit.statuses.burn = burn + 1; syncBuffOrder(unit, "burn"); burnChange = 1; }
    else { removeStatus(unit, "burn", 1); burnChange = -1; }
  }
  burnAfterHp = Math.max(0, Math.floor(unit.hp ?? 0));

  // Death clears Dark Force before it can detonate. This makes Undying/Nirvana a
  // genuine answer to pending Dark Force rather than a second delayed death.
  if (unit.hp <= 0) { clearDarkForce(unit); return terminalResult(); }

  const survivingDarkInstances = [];
  for (const instance of getDarkForceInstances(unit).map((entry) => ({ ...entry }))) {
    const nextStacks = Math.max(0, Math.floor(instance.stacks ?? 0) - 1);
    if (nextStacks > 0) { survivingDarkInstances.push({ ...instance, stacks: nextStacks }); continue; }
    const beforeHp = Math.max(0, Math.floor(unit.hp ?? 0));
    const scheduled = Math.max(0, Math.floor(instance.damage ?? 0));
    unit.hp = Math.max(0, beforeHp - scheduled);
    const afterHp = Math.max(0, Math.floor(unit.hp ?? 0));
    const actual = Math.max(0, beforeHp - afterHp);
    consumeConcentrationOnHpLoss(unit, actual);
    yield { type: "damage", status: "darkForce", beforeHp, afterHp,
      damage: actual, scheduled };
    const windRaccoonBody = unit.hp <= 0 ? yield { type: "windRecovery" } : null;
    const trigger = { damage: actual, scheduled, beforeHp, afterHp };
    if (windRaccoonBody) trigger.windRaccoonBody = windRaccoonBody;
    darkForceTriggers.push(trigger);
    if (unit.hp <= 0) break;
  }
  unit.combatFlags ??= {};
  unit.combatFlags.darkForceInstances = unit.hp <= 0 ? [] : survivingDarkInstances;
  syncDarkForceStatus(unit);
  if (unit.hp <= 0) { clearDarkForce(unit); return terminalResult(); }

  if (getStatus(unit, "entangle") > 0) removeStatus(unit, "entangle", 1);
  if (getStatus(unit, "swordIntent") > 0 && getStatus(unit, "swordIntentGourd") <= 0) removeStatus(unit, "swordIntent", 1);
  if (getStatus(unit, "armorBreak") > 0) removeStatus(unit, "armorBreak", 1);
  if (getStatus(unit, "qiStagnation") > 0) removeStatus(unit, "qiStagnation", 1);
  if (getStatus(unit, "stun") > 0) removeStatus(unit, "stun", 1);
  if (getStatus(unit, "freeze") > 0) { removeStatus(unit, "freeze", 1); reduceGuard(unit, 15); }
  if (getStatus(unit, "steadfast") > 0) removeStatus(unit, "stun", Infinity);
  if (getStatus(unit, "coldResistance") > 0) removeStatus(unit, "freeze", Infinity);

  const barrierStacks = Math.max(0, Math.floor(getStatus(unit, "barrier")));
  const barrierBeforeGuard = Math.max(0, Math.floor(unit.guard ?? 0));
  let barrierGuardGained = 0;
  if (barrierStacks > 0 && (unit.hp ?? 0) > 0) { barrierGuardGained = Math.max(0, Math.floor(gainGuard(unit, barrierStacks * 18) ?? 0)); if (barrierGuardGained > 0) onResourceGain?.("guard", barrierGuardGained); removeStatus(unit, "barrier", 1); }
  const petrifyStacks = Math.max(0, Math.floor(getStatus(unit, "petrify")));
  const petrifyBeforeGuard = Math.max(0, Math.floor(unit.guard ?? 0));
  let petrifyGuardGained = 0;
  if (petrifyStacks > 0 && (unit.hp ?? 0) > 0) {
    petrifyGuardGained = Math.max(0, Math.floor(gainGuard(unit, petrifyStacks * 4) ?? 0));
    if (petrifyGuardGained > 0) onResourceGain?.("guard", petrifyGuardGained);
  }
  return {
    burnDamage, burnChange, burnDownChance, burnUpChance, burnIgnited, burnStacksConsumed, burnAfterHp,
    nirvanaPending, nirvanaBurnStacks, burnWindRaccoonBody, darkForceTriggers,
    barrierStacks, barrierGuardGained, barrierBeforeGuard, barrierAfterGuard: Math.max(0, Math.floor(unit.guard ?? 0)),
    petrifyStacks, petrifyGuardGained, petrifyBeforeGuard, petrifyAfterGuard: Math.max(0, Math.floor(unit.guard ?? 0)),
  };
}


// The synchronous rules API remains useful for AI/tests. Live combat drives
// these same steps asynchronously, showing the impact and holding HP zero
// before allowing the next step of the exact same status/recovery rules.
export function endTurnCommon(unit, options = {}) {
  const steps = endTurnSteps(unit, options);
  let step = steps.next();
  while (!step.done) {
    step = steps.next(step.value.type === "windRecovery" ? resolveWindRaccoonBody(unit) : null);
  }
  return step.value;
}

export async function endTurnCommonWithFeedback(unit, { onStep, ...options } = {}) {
  const steps = endTurnSteps(unit, options);
  let step = steps.next();
  while (!step.done) {
    const response = await onStep?.(step.value);
    step = steps.next(response);
  }
  return step.value;
}
