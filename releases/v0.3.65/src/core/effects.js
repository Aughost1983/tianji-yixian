import { beginZeroHpPause, waitForZeroHpPause, releaseZeroHpPause } from "./lethal.js?v=v0.3.65";
import { CARDS, CARD_UPGRADES } from "../data/cards.js?v=v0.3.65";
import { ITEMS } from "../data/items.js?v=v0.3.65";
import { addStatus, addDarkForceInstance, clearDarkForce, removeStatus, gainGuard, clearGuard, reduceGuard, getStatus, resolveUndying, statusResistance, syncBuffOrder, burnDamageAfterHeatResistance, consumeConcentrationOnHpLoss, convertEntangleToBurn, resolveNirvanaFromBurn, canTriggerWindRaccoonBody, resolveWindRaccoonBody, gatherQiHpGain } from "./status.js?v=v0.3.65";
import { appendCardInstance } from "./state.js?v=v0.3.65";
import { recordCombatDamage, recordArtifactTrigger, ensureRunRecords } from "./run-records.js?v=v0.3.65";

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

const SINGLE_HIT_FEEDBACK_MS = 560;
const COMBO_HIT_FEEDBACK_MS = Math.round(SINGLE_HIT_FEEDBACK_MS * 0.5);
// One recovery number per simultaneous Green Wood attack wave. Keep it a few
// ms shorter than the 280ms damage beat so the next wave has its own frame.
const GREEN_WOOD_HEAL_WAVE_MS = COMBO_HIT_FEEDBACK_MS - 10;
const ENEMY_SINGLE_DAMAGE_TAKEN_FX_MS = 200;
const ENEMY_COMBO_DAMAGE_TAKEN_FX_MS = 100;
const PLAYER_DAMAGE_TAKEN_FX_MS = 100;

export class EffectEngine {
  constructor(app) { this.app = app; }

  addLog(key, params = {}) { this.app.combat?.addLog?.(key, params); }
  unitRef(unit) { return this.app.combat?.unitRef?.(unit) ?? { i18nKey: unit?.nameKey ?? "combat.actor.unknown" }; }
  nameRef(i18nKey, suffix = "") { return this.app.combat?.nameRef?.(i18nKey, suffix) ?? { i18nKey, suffix }; }

  // Exactly the same tag boundary as Sword Intent; school/type alone is not
  // sufficient (Kui Thunder is a Sword-school Thunder spell without this tag).
  isSwordGodAttack(source, card) {
    return Boolean(source?.kind === "player" && source.combatFlags?.swordGodActive
      && card?.tags?.includes("sword") && this.app.state?.combat?.phase !== "enemy");
  }

  gainQiWithFeedback(unit, amount, popupOptions = {}) {
    const before = Math.max(0, Math.floor(unit.qi ?? 0));
    unit.qi = before + Math.max(0, Math.floor(amount));
    syncBuffOrder(unit, "qi");
    if (unit.qi > before) this.app.showStatusPopup?.(unit, "qi", true, unit.qi - before, popupOptions);
    this.addLog("combat.log.qiGain", { target: this.unitRef(unit), amount: unit.qi - before, before, after: unit.qi });
  }

  beginZeroHpPause(unit) { return beginZeroHpPause(this.app, unit); }

  async waitForLethalResolution(unit) {
    if (!unit || unit.hp > 0) return;
    await waitForZeroHpPause(this.app, unit);
    if (unit.hp > 0) return;
    if (!this.canTriggerWindRaccoonBody(unit)) clearDarkForce(unit);
    // Gate disconnection is a consequence of death, never part of the impact.
    if (unit.enemyId === "gate") await this.app.combat?.handleGateDeathLinkBreak?.(unit);
  }

  canTriggerWindRaccoonBody(unit) { return canTriggerWindRaccoonBody(unit); }

  resolveWindRaccoonBodyIfNeeded(unit) {
    return resolveWindRaccoonBody(unit);
  }

  async presentWindRaccoonBodyRecovery(unit, revived) {
    if (!revived) return null;
    this.addLog("combat.log.windRaccoonBodyTrigger", {
      target: this.unitRef(unit), mana: revived.manaSpent, hp: revived.hpRecovered,
    });
    this.app.audio?.play?.("revive", .5);
    await Promise.all([
      this.app.showResourceChange?.(unit, "mana", revived.manaSpent, 0, { duration: 500, wait: true }),
      this.app.showResourceChange?.(unit, "hp", 0, revived.hpRecovered, { duration: 500, wait: true }),
    ]);
    this.app.render?.();
    return revived;
  }

  hasPendingLethalRecovery(result) {
    return Boolean(result?.pendingWindRaccoonBody || result?.pendingUndying);
  }

  async finalizeWindRaccoonBodyIfNeeded(unit, result = null) {
    if (!this.canTriggerWindRaccoonBody(unit)) return null;
    await this.waitForLethalResolution(unit);
    if (!this.canTriggerWindRaccoonBody(unit)) return null;
    const revived = this.resolveWindRaccoonBodyIfNeeded(unit);
    if (!revived) return null;
    releaseZeroHpPause(this.app, unit);
    if (result) {
      result.pendingWindRaccoonBody = false;
      result.windRaccoonBody = revived;
      result.currentHp = unit.hp;
    }
    await this.presentWindRaccoonBodyRecovery(unit, revived);
    return revived;
  }

  async finalizePendingLethalRecovery(unit, result = null) {
    if (result?.pendingWindRaccoonBody || this.canTriggerWindRaccoonBody(unit)) {
      return this.finalizeWindRaccoonBodyIfNeeded(unit, result);
    }
    // Preserve the lethal hit's rule through delayed feedback. A fallback
    // status check must not revive the target after a Sword God execution.
    if (result?.ignoreUndying) return null;
    if (result?.pendingUndying || this.canTriggerUndying(unit)) return this.finalizeUndyingIfNeeded(unit, result);
    return null;
  }

  logDamageResult(source, target, result, { skipDamageStart = false } = {}) {
    if (result?.missed) {
      this.addLog("combat.log.attackMiss", { source: this.unitRef(source) });
      return;
    }
    const detailed = (result.qiAbsorbed ?? 0) > 0 || (result.guardBlockedDamage ?? 0) > 0 || (result.armorBreakBonus ?? 0) > 0;
    if (!detailed) {
      if (skipDamageStart) {
        this.addLog("combat.log.hpLoss", { target: this.unitRef(target), actual: result.actual, before: result.beforeHp, after: result.afterHp });
      } else {
        this.addLog("combat.log.damage", {
          source: this.unitRef(source), target: this.unitRef(target), raw: result.raw, actual: result.actual, before: result.beforeHp, after: result.afterHp,
        });
      }
      return;
    }

    if (!skipDamageStart) this.addLog("combat.log.damageStart", { source: this.unitRef(source), target: this.unitRef(target), raw: result.raw });
    if ((result.qiAbsorbed ?? 0) > 0) {
      this.addLog("combat.log.qiAbsorb", {
        target: this.unitRef(target), absorbed: result.qiAbsorbed, before: result.beforeQi, after: result.afterQi, remaining: result.postQiDamage,
      });
    }
    if ((result.guardBlockedDamage ?? 0) > 0) {
      this.addLog(result.guardBroken ? "combat.log.guardBreak" : "combat.log.guardHold", {
        target: this.unitRef(target), absorbed: result.guardBlockedDamage, before: result.beforeGuard, after: result.afterGuard,
        guard: result.beforeGuard, remaining: result.postDefenseDamage,
      });
    }
    if ((result.armorBreakBonus ?? 0) > 0) {
      this.addLog("combat.log.armorBreakDamage", {
        target: this.unitRef(target), actual: result.actual, before: result.beforeHp, after: result.afterHp,
      });
    } else {
      this.addLog("combat.log.hpLoss", { target: this.unitRef(target), actual: result.actual, before: result.beforeHp, after: result.afterHp });
    }
  }

  resolveDamageAmount(effect, source, targetIndex = 0, targetCount = 1) {
    const countRanges = effect?.targetCountRanges?.[targetCount];
    const selectedRange = Array.isArray(countRanges) ? countRanges[targetIndex] : null;
    const range = Array.isArray(selectedRange) ? selectedRange : effect?.amountRange;
    if (Array.isArray(range) && range.length >= 2) {
      const min = Math.floor(Math.min(Number(range[0]) || 0, Number(range[1]) || 0));
      const max = Math.floor(Math.max(Number(range[0]) || 0, Number(range[1]) || 0));
      return this.app.rng?.int?.(min, max) ?? min;
    }
    return this.resolveAmount(effect?.amount, source);
  }

  resolveAmount(spec, source) {
    if (typeof spec === "number") return spec;
    if (spec?.sourceStatus) {
      const raw = (spec.add ?? 0) + getStatus(source ?? {}, spec.sourceStatus) * (spec.mult ?? 1);
      const rounded = spec.round === "ceil" ? Math.ceil(raw) : spec.round === "round" ? Math.round(raw) : Math.floor(raw);
      return Math.max(spec.min ?? 0, rounded);
    }
    if (spec?.sourceStat) {
      const raw = (spec.add ?? 0) + (source[spec.sourceStat] ?? 0) * (spec.mult ?? 1);
      const rounded = spec.round === "ceil" ? Math.ceil(raw) : spec.round === "round" ? Math.round(raw) : Math.floor(raw);
      return Math.max(spec.min ?? 0, rounded);
    }
    if (spec?.remainingHand) {
      const handCount = Math.max(0, Math.floor(this.app.state?.combat?.hand?.length ?? 0));
      return Math.max(0, Math.floor(spec.base ?? 0) + handCount * Math.floor(spec.perCard ?? 0));
    }
    return 0;
  }

  resolveChance(spec, source) {
    if (typeof spec === "number") return clamp(spec, 0, 100);
    if (spec?.sourceStat) {
      const raw = (spec.add ?? 0) + (source?.[spec.sourceStat] ?? 0) * (spec.mult ?? 1);
      const rounded = spec.round === "ceil" ? Math.ceil(raw) : spec.round === "round" ? Math.round(raw) : Math.floor(raw);
      return clamp(rounded, spec.min ?? 0, spec.max ?? 100);
    }
    return 100;
  }

  resolveStatusStacks(spec, target) {
    let stacks = Math.max(0, Math.floor(spec?.stacks ?? 1));
    if (target?.kind === "enemy" && target.humanoid === false && Number.isFinite(spec?.nonHumanoidStacks)) {
      return Math.max(0, Math.floor(spec.nonHumanoidStacks));
    }
    if (Array.isArray(spec?.stacksRange) && spec.stacksRange.length >= 2) {
      const minStacks = Math.max(0, Math.floor(Math.min(spec.stacksRange[0], spec.stacksRange[1])));
      const maxStacks = Math.max(minStacks, Math.floor(Math.max(spec.stacksRange[0], spec.stacksRange[1])));
      stacks = this.app.rng?.int?.(minStacks, maxStacks) ?? minStacks;
    }
    return stacks;
  }

  pickLowestHpLivingEnemy() {
    const living = (this.app.getLivingEnemies?.() ?? []).filter((enemy) => enemy && enemy.hp > 0);
    if (!living.length) return null;
    const minHp = Math.min(...living.map((enemy) => Math.max(0, Math.floor(enemy.hp ?? 0))));
    const tied = living.filter((enemy) => Math.max(0, Math.floor(enemy.hp ?? 0)) === minHp);
    return this.app.rng?.pick?.(tied) ?? tied[0] ?? null;
  }

  resolveRepeatCount(effect) {
    if (Array.isArray(effect?.repeatRange) && effect.repeatRange.length >= 2) {
      const minRepeat = Math.max(1, Math.floor(Math.min(effect.repeatRange[0], effect.repeatRange[1])));
      const maxRepeat = Math.max(minRepeat, Math.floor(Math.max(effect.repeatRange[0], effect.repeatRange[1])));
      return this.app.rng?.int?.(minRepeat, maxRepeat) ?? minRepeat;
    }
    return Math.max(1, Math.floor(effect?.repeat ?? 1));
  }


  effectTargets(effect, source, target) {
    if (effect?.target === "allCombatants") {
      const units = [this.app.state?.player, ...(this.app.getLivingEnemies?.() ?? [])].filter(Boolean);
      return [...new Map(units.map((unit) => [unit.uid ?? (unit.kind === "player" ? "__player__" : unit), unit])).values()];
    }
    if (effect?.target === "allEnemies") return (this.app.getLivingEnemies?.() ?? []).filter(Boolean);
    return [target ?? source].filter(Boolean);
  }

  applyResistance(target, status, baseChance, { ignoreBarrier = false } = {}) {
    return clamp(baseChance - statusResistance(target, status, { ignoreBarrier }), 0, 100);
  }

  reportStatusAttempt(target, status, applied, stacks = 1) {
    this.app.showStatusPopup?.(target, status, Boolean(applied), stacks);
    return applied;
  }

  addStatusWithFeedback(target, status, stacks) {
    const before = getStatus(target, status);
    const applied = addStatus(target, status, stacks);
    return this.reportStatusAttempt(target, status, applied, Math.max(1, getStatus(target, status) - before));
  }

  tryApplyStatus(target, statusSpec) {
    const chance = this.applyResistance(target, statusSpec.status, statusSpec.chance ?? 100, {
      ignoreBarrier: Boolean(statusSpec.ignoreBarrierResistance),
    });
    if (!this.app.rng.chance(chance)) return this.reportStatusAttempt(target, statusSpec.status, false);
    return this.addStatusWithFeedback(target, statusSpec.status, statusSpec.stacks ?? 1);
  }

  tryApplyDarkForce(target, statusSpec = {}) {
    const stacks = Math.max(0, Math.floor(statusSpec.stacks ?? 1));
    const chance = this.applyResistance(target, "darkForce", statusSpec.chance ?? 100);
    if (stacks <= 0 || !target || target.hp <= 0) return { applied: false, damage: 0 };
    if (chance <= 0 || !this.app.rng.chance(chance)) {
      this.reportStatusAttempt(target, "darkForce", false);
      return { applied: false, damage: 0 };
    }
    const damage = Math.ceil(Math.max(0, Math.floor(target.hp ?? 0)) * 0.15 * stacks);
    return { applied: this.reportStatusAttempt(target, "darkForce", addDarkForceInstance(target, stacks, damage), stacks), damage };
  }

  isEvasionSuppressed(unit) {
    if (!unit) return true;
    const flags = unit?.combatFlags ?? {};
    return getStatus(unit, "freeze") > 0 || getStatus(unit, "stun") > 0
      || Boolean(flags.mountainCounter && (unit?.guard ?? 0) > 0)
      || Boolean(flags.enemyMountainCounter && (unit?.guard ?? 0) > 0)
      || Boolean(flags.huntian || flags.enemyHuntian);
  }

  getTotalEvasion(unit, { ignoreBoots = false } = {}) {
    if (!unit || this.isEvasionSuppressed(unit)) return 0;
    if (unit.combatFlags?.enemyGhostFlash || unit.combatFlags?.ghostFlash) return 100;
    const base = Number(unit.evasion ?? 0);
    const artifact = !ignoreBoots && unit.kind === "player" && unit.artifacts?.includes("shadowlessBoots") ? 10 : 0;
    let halo = 0;
    if (getStatus(unit, "mainCharacterHalo") > 0) {
      const maxHp = Math.max(1, Math.floor(unit.maxHp ?? 1));
      const hpRatio = Math.max(0, Math.floor(unit.hp ?? 0)) / maxHp;
      halo = hpRatio < 0.25 ? 35 : hpRatio < 0.5 ? 25 : 15;
    }
    const total = clamp((Number.isFinite(base) ? base : 0) + artifact + halo, 0, 100);
    // Entangle reduces the combined passive evasion by five percentage points
    // per stack, without changing the buff description or other escape rules.
    return clamp(total - Math.max(0, Math.floor(getStatus(unit, "entangle"))) * 5, 0, 100);
  }

  incomingAttackBlocked(target) {
    if (this.isEvasionSuppressed(target)) return false;
    if (target.kind === "player" && getStatus(target, "foresight") > 0) return true;
    if (target.kind === "enemy" && target.combatFlags?.enemyGhostFlash) {
      target.combatFlags.mainCharacterHaloMissPopups = Math.max(0, Math.floor(target.combatFlags.mainCharacterHaloMissPopups ?? 0)) + 1;
      return true;
    }
    return false;
  }

  outgoingDamageAmount(source, amount, options = {}) {
    let raw = Math.max(0, Math.floor(amount));
    if (source.kind === "player" && options.card?.tags?.includes("sword")) {
      raw += getStatus(source, "swordIntent");
    }
    const isMartial = Boolean(options.card?.tags?.includes("martial") || options.actionTags?.includes("martial") || options.isMartial);
    if (isMartial) {
      if (source.kind === "player") raw += source.combatFlags?.martialBurst?.bonus ?? 0;
      if (source.kind === "enemy") raw += source.combatFlags?.enemyMartialBurst?.bonus ?? 0;
      if (source.combatFlags?.ironBoneActive) {
        const lockedEnemyBonus = source.kind === "enemy" ? source.intent?.lockedIronBoneBonus : null;
        if (Number.isFinite(lockedEnemyBonus)) raw += Math.max(0, Math.floor(lockedEnemyBonus));
        else {
          const maxHp = Math.max(1, Math.floor(source.maxHp ?? 1));
          const hp = Math.max(0, Math.min(maxHp, Math.floor(source.hp ?? 0)));
          raw += 3 + Math.floor((maxHp - hp) * 10 / maxHp);
        }
      }
    }
    return raw;
  }

  previewCardDamage(cardInstance) {
    if (!cardInstance) return null;
    const card = CARDS[cardInstance.cardId];
    if (!card) return null;
    const source = this.app.state?.player;
    if (!source) return null;
    const kuiIndex = card.effects.findIndex((effect) => effect.type === "kuiThunder");
    if (kuiIndex >= 0) {
      const effect = card.effects[kuiIndex];
      const { damage, qi, intent } = this.kuiThunderAbsorption(effect, source);
      return { effectIndex: kuiIndex, base: damage, repeat: 1, firstHit: damage, laterHit: damage, qiSpent: qi, swordIntentSpent: intent };
    }
    const effectIndex = card.effects.findIndex((effect) => effect.type === "damage");
    if (effectIndex < 0) return null;
    const effect = this.applyUpgrade(cardInstance, card.effects[effectIndex]);
    const base = this.resolveAmount(effect.amount, source);
    return {
      effectIndex,
      base,
      repeat: effect.repeat ?? null,
      repeatRange: Array.isArray(effect.repeatRange) ? [...effect.repeatRange] : null,
      firstHit: this.outgoingDamageAmount(source, base, { card, firstHit: true }),
      laterHit: this.outgoingDamageAmount(source, base, { card, firstHit: false }),
    };
  }

  kuiThunderAbsorption(effect, source) {
    const units = [source, ...(this.app.getLivingEnemies?.() ?? this.app.state?.combat?.enemies?.filter((unit) => unit.hp > 0) ?? [])]
      .filter((unit, index, all) => unit && unit.hp > 0 && all.indexOf(unit) === index);
    const qi = units.reduce((sum, unit) => sum + Math.max(0, Math.floor(unit.qi ?? 0)), 0);
    const intent = units.reduce((sum, unit) => sum + Math.max(0, Math.floor(getStatus(unit, "swordIntent"))), 0);
    const damage = Math.max(0, Math.floor(effect.baseDamage ?? 0))
      + qi * Math.max(0, Math.floor(effect.qiMultiplier ?? 0))
      + intent * Math.max(0, Math.floor(effect.swordIntentMultiplier ?? 0));
    return { units, qi, intent, damage };
  }

  dealDamage(source, target, amount, options = {}) {
    // Reflection damage is a fixed amount generated from the HP actually lost,
    // so it must not inherit the defender's outgoing martial/sword modifiers.
    let raw = options.fixedRawDamage
      ? Math.max(0, Math.floor(Number(amount) || 0))
      : this.outgoingDamageAmount(source, amount, options);
    const conditionalMultiplier = options.damageMultiplierIfTargetStatus;
    if (conditionalMultiplier?.status && getStatus(target ?? {}, conditionalMultiplier.status) > 0) {
      raw = Math.max(0, Math.floor(raw * Math.max(0, Number(conditionalMultiplier.multiplier ?? 1))));
    }
    if (!target || target.hp <= 0) {
      return {
        actual: 0, blocked: true, raw, beforeHp: target?.hp ?? 0, afterHp: target?.hp ?? 0,
        beforeQi: target?.qi ?? 0, afterQi: target?.qi ?? 0, beforeGuard: target?.guard ?? 0, afterGuard: target?.guard ?? 0,
        alreadyDead: true,
      };
    }
    beginZeroHpPause(this.app, target);
    const beforeHp = target.hp;
    const beforeQi = target.qi ?? 0;
    const beforeGuard = target.guard ?? 0;

    if (!options.unavoidable && this.incomingAttackBlocked(target)) {
      return { actual: 0, blocked: true, missed: Boolean(target.kind === "enemy" && target.combatFlags?.enemyGhostFlash),
        raw, beforeHp, afterHp: target.hp, beforeQi, afterQi: target.qi ?? 0, beforeGuard, afterGuard: target.guard ?? 0 };
    }

    // One roll per actual hit combines intrinsic, equipped and status evasion.
    // Calculate after the forced-state checks; later segments use the current HP
    // ratio for Halo. Misses block Qi/Guard damage and every on-hit rider.
    if (!options.unavoidable) {
      const missChance = this.getTotalEvasion(target);
      if (missChance > 0 && (missChance === 100 || this.app.rng?.chance?.(missChance))) {
        if (target.kind === "player" && missChance > this.getTotalEvasion(target, { ignoreBoots: true })) {
          recordArtifactTrigger(this.app.state, "shadowlessBoots");
        }
        target.combatFlags ??= {};
        // Keep the existing shared miss-popup queue and its combat render lock.
        target.combatFlags.mainCharacterHaloMissPopups = Math.max(0, Math.floor(target.combatFlags.mainCharacterHaloMissPopups ?? 0)) + 1;
        return {
          actual: 0, blocked: true, missed: true, raw, beforeHp, afterHp: target.hp,
          beforeQi, afterQi: target.qi ?? 0, beforeGuard, afterGuard: target.guard ?? 0,
        };
      }
    }

    // The active artifact is committed only once a live target is actually hit.
    // This precedes lethal damage/record freezing, and misses never reach it.
    if (options.recordArtifactId && source?.kind === "player" && raw > 0) {
      recordArtifactTrigger(this.app.state, options.recordArtifactId, { active: true });
    }

    // Shared damage order for players and enemies: Qi absorbs first, then Guard/Stance.
    // Guard only breaks when the post-Qi hit exceeds it; otherwise it nullifies the hit and remains.
    let remaining = raw;
    let qiAbsorbed = 0;
    if (!options.ignoreQi && target.qi > 0) {
      qiAbsorbed = Math.min(target.qi, remaining);
      target.qi -= qiAbsorbed;
      remaining -= qiAbsorbed;
    }
    const postQiDamage = Math.max(0, remaining);

    let guardBlockedDamage = 0;
    let guardBroken = false;
    const conditionalIgnoreGuard = options.ignoreGuardIfTargetStatus?.status
      && getStatus(target, options.ignoreGuardIfTargetStatus.status) > 0;
    const ignoresGuard = Boolean(options.ignoreGuard || conditionalIgnoreGuard);
    if (!ignoresGuard && remaining > 0 && target.guard > 0) {
      if (remaining <= target.guard) {
        guardBlockedDamage = remaining;
        remaining = 0;
      } else {
        guardBlockedDamage = target.guard;
        remaining -= target.guard;
        guardBroken = true;
        clearGuard(target);
      }
    }

    // Shared post-defense modifier order for players and enemies:
    // [Armor Break] first multiplies the post-Qi/Stance remainder by 1.5 (ceil),
    // then [Hardness] reduces that result to 75% (floor).
    const postDefenseDamage = Math.max(0, remaining);
    const postArmorBreakDamage = !options.ignoreArmorBreakBonus && getStatus(target, "armorBreak") > 0 && postDefenseDamage > 0
      ? Math.ceil(postDefenseDamage * 1.5)
      : postDefenseDamage;
    const armorBreakBonus = Math.max(0, postArmorBreakDamage - postDefenseDamage);
    const postHardnessDamage = getStatus(target, "hardness") > 0 && postArmorBreakDamage > 0
      ? Math.floor(postArmorBreakDamage * 0.75)
      : postArmorBreakDamage;
    const hardnessReduction = Math.max(0, postArmorBreakDamage - postHardnessDamage);
    const actual = postHardnessDamage;
    target.hp = Math.max(0, target.hp - actual);
    this.beginZeroHpPause(target);
    const damageAfterHp = target.hp;
    recordCombatDamage(this.app.state, target, beforeHp, damageAfterHp, { source, playedCard: Boolean(options.card) });
    const pendingWindRaccoonBody = damageAfterHp <= 0 && this.canTriggerWindRaccoonBody(target);

    consumeConcentrationOnHpLoss(target, Math.max(0, beforeHp - damageAfterHp));
    // Lethal damage and fixed/passive recovery are deliberately resolved in two stages.
    // The hit must first exist as a complete combat event (HP reaches 0 and
    // Qi/Stance changes are logged), then the revival clears the old state and
    // creates its fresh HP/Qi. This keeps mechanics, logs and visuals in the
    // same chronological order.
    const ignoreUndying = Boolean(options.ignoreUndying || this.isSwordGodAttack(source, options.card));
    const pendingUndying = damageAfterHp <= 0 && !pendingWindRaccoonBody && !ignoreUndying && this.canTriggerUndying(target);

    // Each hit reflects a fraction of HP actually lost, after defenses and the
    // HP floor. A fully blocked hit cannot reflect; noReflection prevents loops.
    let reflection = null;
    const reflectionStacks = Math.max(0, Math.floor(getStatus(target, "reflection")));
    const hpLost = Math.max(0, beforeHp - damageAfterHp);
    if (!options.noReflection && hpLost > 0 && reflectionStacks > 0 && source && source !== target && source.hp > 0) {
      const reflectionRaw = Math.ceil(hpLost * reflectionStacks * 0.05);
      // Defer the reflected hit until its own feedback beat. Applying it here used
      // to mutate the attacker's HP/Qi before the primary hit popup finished, so
      // the HUD could visibly lose resources before the Reflection number appeared.
      reflection = { source: target, target: source, stacks: reflectionStacks, received: hpLost, raw: reflectionRaw, result: null };
    }

    syncBuffOrder(target, "qi");
    syncBuffOrder(target, "guard");
    return {
      actual, blocked: false, raw, beforeHp, afterHp: damageAfterHp, currentHp: target.hp, windRaccoonBody: null, pendingWindRaccoonBody, undying: null, pendingUndying, ignoreUndying, reflection,
      beforeQi, afterQi: target.qi ?? 0, qiAbsorbed, postQiDamage,
      beforeGuard, afterGuard: target.guard ?? 0, guardBlockedDamage, guardBroken,
      postDefenseDamage, postArmorBreakDamage, postHardnessDamage, hardnessReduction, armorBreakBonus,
    };
  }

  canTriggerUndying(unit) {
    return Boolean(unit && ["player", "enemy"].includes(unit.kind) && unit.hp <= 0 && getStatus(unit, "undying") > 0);
  }

  // Legacy-named aliases remain so older tests/callers do not break; the effect
  // itself is now genuinely shared by players and enemies.
  canPlayerTriggerUndying(unit) { return this.canTriggerUndying(unit); }

  resolveUndyingIfNeeded(unit) {
    const revived = resolveUndying(unit);
    if (!revived) return null;
    this.addLog("combat.log.undyingTrigger", {
      target: this.unitRef(unit), stacks: revived.stacks, hp: revived.hpRecovered, qi: revived.qiGained,
    });
    if (revived.qiGained > 0) this.app.showStatusPopup?.(unit, "qi", true, revived.qiGained);
    return revived;
  }

  resolvePlayerUndyingIfNeeded(unit) { return this.resolveUndyingIfNeeded(unit); }

  async finalizeUndyingIfNeeded(unit, result = null) {
    if (!this.canTriggerUndying(unit)) return null;
    await this.waitForLethalResolution(unit);
    if (!this.canTriggerUndying(unit)) return null;
    const revived = this.resolveUndyingIfNeeded(unit);
    if (!revived) return null;
    releaseZeroHpPause(this.app, unit);
    if (result) {
      result.pendingUndying = false;
      result.undying = revived;
      result.currentHp = unit.hp;
    }
    if (unit.kind === "player") {
      await Promise.all([
        this.app.flashPlayerUndying?.(500),
        this.app.showResourceChange?.(unit, "hp", 0, unit.hp, { duration: 500, wait: true }),
      ]);
    } else {
      this.app.audio?.play?.("revive", .5);
      await this.app.showResourceChange?.(unit, "hp", 0, unit.hp, { duration: 500, wait: true });
      this.app.render?.();
    }
    return revived;
  }

  async finalizePlayerUndyingIfNeeded(unit, result = null) { return this.finalizeUndyingIfNeeded(unit, result); }

  canTriggerNirvanaFromBurn(unit, burnStacks) {
    return Boolean(unit && ["player", "enemy"].includes(unit.kind) && unit.hp <= 0
      && getStatus(unit, "nirvana") > 0 && Math.max(0, Math.floor(burnStacks ?? getStatus(unit, "burn"))) > 0);
  }

  resolveNirvanaFromBurnIfNeeded(unit, burnStacks) {
    const revived = resolveNirvanaFromBurn(unit, burnStacks);
    if (!revived) return null;
    this.addLog("combat.log.nirvanaTrigger", {
      target: this.unitRef(unit), stacks: revived.burnStacks, hp: revived.hpRecovered, mana: revived.manaGained,
    });
    return revived;
  }

  async finalizeNirvanaFromBurnIfNeeded(unit, burnStacks) {
    if (!this.canTriggerNirvanaFromBurn(unit, burnStacks)) return null;
    await this.waitForLethalResolution(unit);
    if (!this.canTriggerNirvanaFromBurn(unit, burnStacks)) return null;
    const revived = this.resolveNirvanaFromBurnIfNeeded(unit, burnStacks);
    if (!revived) return null;
    releaseZeroHpPause(this.app, unit);
    const feedback = [
      this.app.showResourceChange?.(unit, "hp", 0, unit.hp, { duration: 500, wait: true }),
      this.app.showResourceChange?.(unit, "mana", revived.manaBefore, revived.manaAfter, { duration: 500, wait: true }),
    ];
    if (unit.kind === "player") feedback.push(this.app.flashPlayerUndying?.(500));
    else this.app.audio?.play?.("revive", .5);
    await Promise.all(feedback);
    if (unit.kind !== "player") this.app.render?.();
    return revived;
  }

  applyUpgrade(cardInstance, effect) {
    if (!cardInstance?.upgraded) return effect;
    const mod = CARD_UPGRADES[cardInstance.cardId] ?? {};
    const copy = structuredClone(effect);
    if (copy.type === "damage") {
      copy.amount = typeof copy.amount === "number" ? copy.amount + (mod.damageBonus ?? 0) : copy.amount;
      if (copy.amount?.sourceStat && Number.isFinite(mod.damageMultiplier)) {
        copy.amount.mult = (copy.amount.mult ?? 1) * mod.damageMultiplier;
      }
      if (Number.isFinite(mod.repeatBonus)) copy.repeat = (copy.repeat ?? 1) + mod.repeatBonus;
      if (Array.isArray(mod.repeatRangeOverride)) copy.repeatRange = [...mod.repeatRangeOverride];
      else if (Array.isArray(copy.repeatRange) && Number.isFinite(mod.repeatRangeBonus)) {
        copy.repeatRange = copy.repeatRange.map((value) => Math.max(1, Math.floor(value + mod.repeatRangeBonus)));
      }
      if (mod.extraRepeatChance) copy.extraRepeatChance = mod.extraRepeatChance;
      if (Number.isFinite(mod.drawIfRepeatBelowMax)) copy.drawIfRepeatBelowMax = Math.max(0, Math.floor(mod.drawIfRepeatBelowMax));
      if (copy.statusOnHit?.status === "burn") copy.statusOnHit.chance += mod.burnChanceBonus ?? 0;
      if (copy.statusOnHit && Number.isFinite(mod.statusChance)) copy.statusOnHit.chance = mod.statusChance;
      if (copy.statusOnHit && Number.isFinite(mod.statusStacksBonus)) copy.statusOnHit.stacks = Math.max(0, Math.floor(copy.statusOnHit.stacks ?? 0) + mod.statusStacksBonus);
      if (copy.statusOnHit && Number.isFinite(mod.statusOnHitManaBonus)) copy.statusOnHit.manaOnSuccess = Math.max(0, Math.floor(copy.statusOnHit.manaOnSuccess ?? 0) + mod.statusOnHitManaBonus);
      if (mod.guardReductionMultiplier) copy.reduceGuardFromActualDamage = mod.guardReductionMultiplier;
      if (mod.armorBreakIfGuardBroken) copy.armorBreakIfGuardBroken = true;
      if (Number.isFinite(mod.armorBreakStacks)) copy.armorBreakStacks = Math.max(1, Math.floor(mod.armorBreakStacks));
      if (mod.stunChance) copy.statusOnHit = { status: "stun", stacks: 1, chance: mod.stunChance };
    }
    if (copy.type === "gainQi" && (mod.qiBonus ?? 0) !== 0) {
      copy.amount = typeof copy.amount === "number" ? copy.amount + mod.qiBonus : copy.amount;
    }
    if (copy.type === "gainQi" && copy.amount?.sourceStat && Number.isFinite(mod.qiMultiplierOverride)) {
      copy.amount.mult = mod.qiMultiplierOverride;
    }
    if (copy.type === "gainMana") copy.amount += mod.manaBonus ?? 0;
    if (copy.type === "increaseFleeChance") copy.amount += mod.fleeChanceBonus ?? 0;
    if (copy.type === "earthEscape") copy.guardOnFailure = mod.guardOnFailure ?? 0;
    if (copy.type === "frostSpell") {
      if (Number.isFinite(mod.freezeChanceOverride)) copy.freezeChance = mod.freezeChanceOverride;
    }
    if (copy.type === "gainGuard") {
      if (mod.guardFromHand) copy.amount = { remainingHand: true, ...mod.guardFromHand };
      else copy.amount += mod.guardBonus ?? 0;
    }
    if (copy.type === "addStatus" && copy.status === "swordIntent") copy.stacks += mod.statusBonus ?? 0;
    if (copy.type === "addStatus" && Number.isFinite(mod.statusStacksBonus)) copy.stacks += mod.statusStacksBonus;
    if (copy.type === "setEndTurnGuard") copy.amount += mod.endTurnGuardBonus ?? 0;
    if (copy.type === "armMountainCounter" && Number.isFinite(mod.counterMultiplier)) copy.multiplier = mod.counterMultiplier;
    if (copy.type === "armMountainCounter" && Number.isFinite(mod.counterGuardRetention)) copy.guardRetention = Math.max(0, Math.min(1, mod.counterGuardRetention));
    if (copy.type === "xuanpinQi") {
      if (Number.isFinite(mod.statusChanceOverride)) copy.statusChance = Math.max(0, Math.min(100, Number(mod.statusChanceOverride)));
      if (Number.isFinite(mod.reflectionPerRoundOverride)) copy.reflectionPerRound = Math.max(0, Number(mod.reflectionPerRoundOverride));
      if (Number.isFinite(mod.qiPerRoundOverride)) copy.qiPerRound = Math.max(0, Number(mod.qiPerRoundOverride));
      if (typeof mod.defenseModeOverride === "string") copy.defenseMode = mod.defenseModeOverride;
    }
    if (copy.type === "valleyGodCurse") {
      if (Number.isFinite(mod.healMultiplierOverride)) copy.healMultiplier = Math.max(0, Number(mod.healMultiplierOverride));
      if (Number.isFinite(mod.undyingStacksOverride)) copy.undyingStacks = Math.max(0, Math.floor(Number(mod.undyingStacksOverride)));
    }
    return copy;
  }


  async resolveSwordDomainPulse(unit, profile, { fromTurnStart = false } = {}) {
    if (!unit || unit.hp <= 0 || !profile) return { damage: 0, dead: unit?.hp <= 0 };
    const damage = Math.max(0, Math.floor(profile.damage ?? 0));
    const qiGain = Math.max(0, Math.floor(profile.qi ?? 0));
    const intentGain = Math.max(0, Math.floor(profile.swordIntent ?? 0));
    const beforeHp = unit.hp;
    beginZeroHpPause(this.app, unit);
    unit.hp = Math.max(0, unit.hp - damage);
    this.beginZeroHpPause(unit);
    const damageAfterHp = unit.hp;
    recordCombatDamage(this.app.state, unit, beforeHp, damageAfterHp);
    const pendingWindRaccoonBody = damageAfterHp <= 0 && this.canTriggerWindRaccoonBody(unit);

    consumeConcentrationOnHpLoss(unit, Math.max(0, beforeHp - damageAfterHp));
    const actual = Math.max(0, beforeHp - damageAfterHp);
    const pendingUndying = damageAfterHp <= 0 && !pendingWindRaccoonBody && this.canTriggerUndying(unit);

    if (actual > 0) {
      this.addLog("combat.log.statusDamage", {
        target: this.unitRef(unit), status: this.nameRef("status.swordDomain"), damage: actual, before: beforeHp, after: damageAfterHp,
      });
      this.app.audio?.play?.("hit", .5);
      this.app.audio?.playEnemyHit?.(unit);

      await Promise.all([
        this.app.flashDamageTaken?.(unit, PLAYER_DAMAGE_TAKEN_FX_MS),
        this.app.showDamagePopup?.(unit, actual, { duration: SINGLE_HIT_FEEDBACK_MS }),
      ]);
    }

    await this.waitForLethalResolution(unit);
    const windRaccoonBody = pendingWindRaccoonBody ? await this.finalizeWindRaccoonBodyIfNeeded(unit) : null;
    const undying = !windRaccoonBody && pendingUndying ? await this.finalizeUndyingIfNeeded(unit) : null;
    if (unit.hp <= 0 && !windRaccoonBody && !undying) return { damage: actual, dead: true, fromTurnStart };
    if (windRaccoonBody || undying) return { damage: actual, dead: false, revived: true, windRaccoonBody, undying, fromTurnStart };

    const beforeQi = unit.qi ?? 0;
    unit.qi = beforeQi + qiGain;
    syncBuffOrder(unit, "qi");
    if (qiGain > 0) this.app.showStatusPopup?.(unit, "qi", true, qiGain);
    if (qiGain > 0) this.addLog("combat.log.qiGain", { target: this.unitRef(unit), amount: qiGain, before: beforeQi, after: unit.qi });

    const beforeIntent = getStatus(unit, "swordIntent");
    if (intentGain > 0) this.addStatusWithFeedback(unit, "swordIntent", intentGain);
    const afterIntent = getStatus(unit, "swordIntent");
    if (intentGain > 0) {
      this.addLog("combat.log.statusGain", {
        target: this.unitRef(unit), status: this.nameRef("status.swordIntent"), before: beforeIntent, after: afterIntent,
      });
    }
    return { damage: actual, qi: qiGain, swordIntent: intentGain, dead: false, fromTurnStart };
  }

  async resolveReflectionFeedback(result, { duration = SINGLE_HIT_FEEDBACK_MS } = {}) {
    const reflected = result?.reflection;
    if (!reflected) return null;
    const reflectedResult = this.dealDamage(reflected.source, reflected.target, reflected.raw, {
      fixedRawDamage: true, noReflection: true, reflectionDamage: true,
    });
    reflected.result = reflectedResult;
    this.addLog("combat.log.reflection", {
      source: this.unitRef(reflected.source), target: this.unitRef(reflected.target),
      percent: reflected.stacks * 5, received: reflected.received, damage: reflected.raw,
    });
    this.logDamageResult(reflected.source, reflected.target, reflectedResult, { skipDamageStart: true });
    this.app.audio.play(reflectedResult.missed ? "miss" : reflectedResult.actual === 0 ? "defense" : "hit", reflectedResult.actual === 0 ? .42 : .5);
    if (reflectedResult.actual > 0) this.app.audio.playEnemyHit?.(reflected.target);
    const deathFx = reflectedResult.beforeHp > 0 && reflectedResult.afterHp <= 0 && !this.hasPendingLethalRecovery(reflectedResult)
      ? (reflected.target.kind === "player" ? null : this.app.startEnemyDeathFx?.(reflected.target))
      : null;
    await Promise.all([
      this.app.flashDamageTaken?.(reflected.target, reflected.target.kind === "player" ? PLAYER_DAMAGE_TAKEN_FX_MS : ENEMY_SINGLE_DAMAGE_TAKEN_FX_MS, { red: reflectedResult.actual > 0 }),
      this.app.showDamagePopup?.(reflected.target, reflectedResult.actual, { duration }),
    ]);
    await this.waitForLethalResolution(reflected.target);
    if (deathFx) await deathFx;
    if (this.hasPendingLethalRecovery(reflectedResult)) await this.finalizePendingLethalRecovery(reflected.target, reflectedResult);

    // Reflection is its own completed damage event. If it is lethal, settle death
    // immediately instead of waiting for End Turn / enemy-phase cleanup.
    if (reflected.target.hp <= 0) {
      if (reflected.target.kind === "player") {
        await this.app.onPlayerDeath?.();
      } else {
        this.app.combat?.cleanupDeadEnemies?.();
        if ((this.app.combat?.getLivingEnemies?.() ?? []).length === 0) this.app.combat?.finishVictory?.();
      }
    }
    return reflectedResult;
  }

  async applyPostDamageEffects(effect, source, oneTarget, result, ctx = {}) {
    await this.resolveReflectionFeedback(result, { duration: ctx.reflectionFeedbackDuration ?? SINGLE_HIT_FEEDBACK_MS });
    // A lethal reflected hit ends the acting unit's continuation immediately.
    // Do not attach further on-hit statuses or other post-hit effects after death.
    if ((source?.hp ?? 1) <= 0 || this.app.state?.combat?.result) return;
    let guardBrokenByThisEffect = false;
    if (effect.reduceGuardFromActualDamage && result.actual > 0) {
      const beforeGuard = Math.max(0, Math.floor(oneTarget.guard ?? 0));
      reduceGuard(oneTarget, Math.floor(result.actual * effect.reduceGuardFromActualDamage));
      const afterGuard = Math.max(0, Math.floor(oneTarget.guard ?? 0));
      guardBrokenByThisEffect = beforeGuard > 0 && afterGuard === 0;
      if (beforeGuard !== afterGuard) this.addLog("combat.log.guardChange", { target: this.unitRef(oneTarget), before: beforeGuard, after: afterGuard });
    }
    if (effect.armorBreakIfGuardBroken && guardBrokenByThisEffect && oneTarget.hp > 0) {
      const before = getStatus(oneTarget, "armorBreak");
      const applied = this.tryApplyStatus(oneTarget, { status: "armorBreak", stacks: Math.max(1, Math.floor(effect.armorBreakStacks ?? 1)), chance: 100 });
      const after = getStatus(oneTarget, "armorBreak");
      this.addLog(applied ? "combat.log.statusGain" : "combat.log.statusResist", {
        target: this.unitRef(oneTarget), status: this.nameRef("status.armorBreak"), before, after,
      });
    }
    if (effect.stealStonesOnActualDamage && result.actual > 0 && source?.kind === "enemy" && oneTarget?.kind === "player") {
      const spec = effect.stealStonesOnActualDamage;
      const min = Math.max(0, Math.floor(spec.min ?? 1));
      const max = Math.max(min, Math.floor(spec.max ?? min));
      const rolled = this.app.rng?.int?.(min, max) ?? min;
      const available = Math.max(0, Math.floor(oneTarget.stones ?? 0));
      const stolen = Math.min(available, rolled);
      if (stolen > 0) {
        ensureRunRecords(this.app.state);
        oneTarget.stones = available - stolen;
        source.combatFlags ??= {};
        source.combatFlags.stolenStones = Math.max(0, Math.floor(source.combatFlags.stolenStones ?? 0)) + stolen;
        if (this.app.state?.combat) this.app.state.combat.stolenStonesTotal = Math.max(0, Math.floor(this.app.state.combat.stolenStonesTotal ?? 0)) + stolen;
        this.addLog("combat.log.stealStones", { source: this.unitRef(source), amount: stolen });
        void this.app.showResourceChange?.(oneTarget, "stones", available, oneTarget.stones, { duration: 560, wait: false });
      }
    }
    if (effect.intensifyEntangleOnActualDamage && result.actual > 0) {
      const before = Math.max(0, Math.floor(getStatus(oneTarget, "entangle")));
      if (before > 0) {
        const added = before <= 4 ? 3 : before <= 8 ? 2 : 1;
        this.addStatusWithFeedback(oneTarget, "entangle", added);
        const after = getStatus(oneTarget, "entangle");
        this.addLog("combat.log.statusGain", {
          target: this.unitRef(oneTarget), status: this.nameRef("status.entangle"), before, after,
        });
      }
    }

    let burnApplied = 0;
    // A missed Green Snake Sword strike (player artifact or enemy skill) must
    // not attach Entangle; all on-hit riders share this blocked-hit gate.
    if (effect.statusOnHit && !result.blocked && !result.missed && (!effect.statusOnHit.requireActualDamage || result.actual > 0)) {
      const statusSpec = { ...effect.statusOnHit };
      statusSpec.stacks = this.resolveStatusStacks(statusSpec, oneTarget);
      if (Number.isFinite(statusSpec.chanceFromActualDamageMultiplier)) {
        statusSpec.chance = clamp(result.actual * statusSpec.chanceFromActualDamageMultiplier, 0, 100);
      } else {
        statusSpec.chance = this.resolveChance(statusSpec.chance ?? 100, source);
      }
      const before = getStatus(oneTarget, statusSpec.status);
      const applied = this.tryApplyStatus(oneTarget, statusSpec);
      const after = getStatus(oneTarget, statusSpec.status);
      if (statusSpec.status === "burn") burnApplied = Math.max(0, after - before);
      this.addLog(applied ? "combat.log.statusGain" : "combat.log.statusResist", {
        target: this.unitRef(oneTarget), status: this.nameRef(`status.${statusSpec.status}`), before, after,
      });
      if (applied && (statusSpec.guardOnSuccess ?? 0) > 0 && oneTarget.hp > 0) {
        const guardBefore = Math.max(0, Math.floor(oneTarget.guard ?? 0));
        const gained = gainGuard(oneTarget, statusSpec.guardOnSuccess);
        if (gained > 0) this.app.showStatusPopup?.(oneTarget, "guard", true, gained);
        if (gained > 0) this.addLog("combat.log.guardGain", { target: this.unitRef(oneTarget), amount: gained, before: guardBefore, after: oneTarget.guard });
        else this.addLog("combat.log.guardBlocked", { target: this.unitRef(oneTarget) });
      }
      if (applied && statusSpec.status === "armorBreak" && (statusSpec.manaOnSuccess ?? 0) > 0 && source) {
        const manaBefore = Math.max(0, Math.floor(source.mana ?? 0));
        const manaGain = Math.max(0, Math.floor(statusSpec.manaOnSuccess));
        source.mana = Math.min(source.maxMana ?? (manaBefore + manaGain), manaBefore + manaGain);
        const restored = Math.max(0, source.mana - manaBefore);
        if (restored > 0 && source.kind === "player") {
          this.addLog("combat.log.manaRestore", { target: this.unitRef(source), amount: restored, before: manaBefore, after: source.mana });
          void this.app.showResourceChange?.(source, "mana", manaBefore, source.mana, { duration: 420, wait: false });
        }
      }
    }

    const isFireAttack = Boolean(
      effect.fireAttack
      || effect.statusOnHit?.status === "burn"
      || (ctx.card?.tags?.includes("fire") && ctx.card?.tags?.includes("attack"))
      || ctx.actionTags?.includes?.("fire")
    );
    if (isFireAttack && getStatus(oneTarget, "entangle") > 0 && (result.actual > 0 || burnApplied > 0)) {
      const converted = convertEntangleToBurn(oneTarget);
      if (converted.converted > 0) {
        this.addLog("combat.log.statusGain", {
          target: this.unitRef(oneTarget), status: this.nameRef("status.entangle"), before: converted.entangleBefore, after: converted.entangleAfter,
        });
        this.addLog("combat.log.statusGain", {
          target: this.unitRef(oneTarget), status: this.nameRef("status.burn"), before: converted.burnBefore, after: converted.burnAfter,
        });
      }
    }
  }

  async executeEffects(effects, ctx) {
    let shouldEndTurn = false;
    const enemyDeathPromises = [];
    let healFeedbackTail = null;
    const simultaneousRecoveryFeedback = [];
    // An attack's repeated self-resource rider is consumed at its hit beats,
    // so the ordinary effect entry must not award the same Qi a third time.
    const perAttackQiEffects = new Set();

    // The first recovery starts with its attack wave. Sequential waves queue
    // feedback independently of damage so combatRenderLocks remain untouched.
    const queueActualDamageHealAmount = (effect, source, rawAmount) => {
      if (!effect?.healFromActualDamage || !(rawAmount > 0) || !source) return;
      const amount = Math.max(0, Math.floor(rawAmount));
      const run = async () => {
        const beforeHp = source.hp;
        source.hp = Math.min(source.maxHp, source.hp + amount);
        const healed = Math.max(0, source.hp - beforeHp);
        this.addLog("combat.log.hpDrain", { target: this.unitRef(source), amount: healed, before: beforeHp, after: source.hp });
        await this.app.showResourceChange?.(source, "hp", beforeHp, source.hp, { duration: GREEN_WOOD_HEAL_WAVE_MS, wait: true, showZeroAsGain: true });
      };
      if (!healFeedbackTail) healFeedbackTail = Promise.resolve(run());
      else healFeedbackTail = healFeedbackTail.then(run, run);
    };
    const drainManaFromDamagedEnemies = (effect, source, results) => {
      const spec = effect?.drainManaOnActualDamage;
      if (!spec || !source || !["player", "enemy"].includes(source.kind) || !Array.isArray(results)) return 0;
      let total = 0;
      for (const { oneTarget, result } of results) {
        if (!oneTarget || oneTarget === source || !["player", "enemy"].includes(oneTarget.kind) || !(result?.actual > 0)) continue;
        const before = Math.max(0, Math.floor(oneTarget.mana ?? 0));
        const cap = spec === "all" ? before : Math.max(0, Math.floor(spec));
        const drained = Math.min(before, cap);
        if (drained <= 0) continue;
        oneTarget.mana = before - drained;
        if (oneTarget.kind === "player") void this.app.showResourceChange?.(oneTarget, "mana", before, oneTarget.mana, { duration: 560, wait: false });
        total += drained;
      }
      if (total > 0) {
        const before = Math.max(0, Math.floor(source.mana ?? 0));
        source.mana = before + total; // deliberate temporary overflow, same resource rule as Primordial Orb/Qi Eating
        this.addLog("combat.log.manaDrain", { target: this.unitRef(source), amount: total, before, after: source.mana });
        void this.app.showResourceChange?.(source, "mana", before, source.mana, { duration: 560, wait: false });
      }
      return total;
    };
    for (let i = 0; i < effects.length; i += 1) {
      if (perAttackQiEffects.has(i)) continue;
      const base = effects[i];
      const effect = ctx.cardInstance ? this.applyUpgrade(ctx.cardInstance, base) : base;
      // Some items have an extra combat-only rider while their ordinary recovery
      // remains usable on the map. Skip only that rider outside a live battle.
      if (effect.combatOnly && this.app.state?.screen !== "combat") continue;
      const source = ctx.source;
      const forceAttackSelf = Boolean(ctx.forceAttackSelf && ["damage", "frostSpell"].includes(effect.type));
      const target = forceAttackSelf ? source : (effect.target === "self" ? source : ctx.target);
      const dodgesPlayerTarget = Boolean(ctx.playerDodgesAttack && !forceAttackSelf && target?.kind === "player"
        && effect.target !== "self" && getStatus(target, "freeze") <= 0 && getStatus(target, "stun") <= 0);
      if (dodgesPlayerTarget && !["damage", "frostSpell", "shatterDefensesDamage"].includes(effect.type)) continue;

      if (effect.type === "frostSpell") {
        // Mystic Frost bypasses all evasion on both sides. Clear Burn for each
        // living target, then independently roll Freeze against its resistance;
        // only a successful Freeze grants Stance and dispels Ghost Flash.
        const targets = forceAttackSelf ? [source]
          : effect.target === "allEnemies" || ctx.targetMode === "allEnemies"
            ? (this.app.getLivingEnemies?.() ?? this.app.state?.combat?.enemies?.filter((enemy) => enemy.hp > 0) ?? [target].filter(Boolean))
            : [target];
        for (const unit of targets) {
          if (!unit || unit.hp <= 0) continue;
          const nested = await this.executeEffects([
            { type: "removeStatus", status: "burn", stacks: Infinity },
            { type: "addStatus", status: "freeze", stacks: 1, chance: effect.freezeChance ?? 40, guardOnSuccess: effect.guardOnSuccess ?? 15 },
          ], { ...ctx, cardInstance: null, target: unit, targetMode: unit.kind, playerDodgesAttack: false, forceAttackSelf: false });
          if (nested?.combatEnded) return { shouldEndTurn, combatEnded: true };
        }
      } else if (effect.type === "qiToSwordIntent") {
        const qiSpent = Math.max(0, Math.floor(source.qi ?? 0));
        if (qiSpent > 0) {
          const beforeQi = qiSpent;
          source.qi = 0;
          syncBuffOrder(source, "qi");
          this.addLog("combat.log.qiChange", { target: this.unitRef(source), before: beforeQi, after: 0 });
          const beforeIntent = getStatus(source, "swordIntent");
          this.addStatusWithFeedback(source, "swordIntent", qiSpent);
          const afterIntent = getStatus(source, "swordIntent");
          this.addLog("combat.log.statusGain", {
            target: this.unitRef(source), status: this.nameRef("status.swordIntent"), before: beforeIntent, after: afterIntent,
          });
        }
      } else if (effect.type === "fiveElementsSword") {
        const elements = ["wood", "fire", "earth", "thunder", "water"];
        const startIndex = Math.max(0, Math.min(4, this.app.rng?.int?.(0, 4) ?? 0));
        const sequence = [...elements.slice(startIndex), ...elements.slice(0, startIndex)];
        if (this.isSwordGodAttack(source, ctx.card)) {
          // Keep the original five-element cycle intact; only the final bonus
          // strike rolls an independent element. Nested hits must not double.
          const bonusIndex = Math.max(0, Math.min(4, this.app.rng?.int?.(0, 4) ?? 0));
          sequence.push(elements[bonusIndex]);
        }
        const effectFor = (element) => {
          if (element === "wood") return { type: "damage", amount: 5, ignoreGuard: true, statusOnHit: { status: "entangle", stacks: 2, chance: 100 } };
          if (element === "fire") return { type: "damage", amount: 5, ignoreQi: true, fireAttack: true, statusOnHit: { status: "burn", stacks: 2, chance: 100 } };
          if (element === "earth") return { type: "damage", amount: 5, statusOnHit: { status: "armorBreak", stacks: 1, chance: 100 } };
          if (element === "thunder") return { type: "damage", amount: 5, ignoreGuard: true, statusOnHit: { status: "stun", stacks: 1, chance: 100, ignoreBarrierResistance: true } };
          return { type: "damage", amount: 5, intensifyEntangleOnActualDamage: true, statusOnHit: { status: "qiStagnation", stacks: 1, chance: 100 } };
        };
        for (const element of sequence) {
          const nested = await this.executeEffects([effectFor(element)], {
            ...ctx, cardInstance: null, swordGodBonusHandled: true,
            comboSequence: true,
          });
          shouldEndTurn ||= Boolean(nested?.shouldEndTurn);
          if (nested?.combatEnded || (ctx.target && ctx.target.hp <= 0) || source?.hp <= 0) {
            if (nested?.combatEnded) return { shouldEndTurn, combatEnded: true };
            break;
          }
        }
      } else if (effect.type === "kuiThunder") {
        const { units, damage } = this.kuiThunderAbsorption(effect, source);
        // Consume every combatant's Qi/Intent before resolving the strike, so
        // the target cannot use its own absorbed Qi to mitigate this hit.
        for (const unit of units) {
          const beforeQi = Math.max(0, Math.floor(unit.qi ?? 0));
          const beforeIntent = Math.max(0, Math.floor(getStatus(unit, "swordIntent")));
          if (beforeQi > 0) {
            unit.qi = 0;
            syncBuffOrder(unit, "qi");
            this.addLog("combat.log.qiChange", { target: this.unitRef(unit), before: beforeQi, after: 0 });
          }
          if (beforeIntent > 0) {
            removeStatus(unit, "swordIntent", Infinity);
            this.addLog("combat.log.statusGain", {
              target: this.unitRef(unit), status: this.nameRef("status.swordIntent"), before: beforeIntent, after: 0,
            });
          }
        }
        const nested = await this.executeEffects([{
          type: "damage", amount: damage, ignoreGuard: true, statusOnHit: effect.statusOnHit,
        }], { ...ctx, cardInstance: null });
        shouldEndTurn ||= Boolean(nested?.shouldEndTurn);
        if (nested?.combatEnded) return { shouldEndTurn, combatEnded: true };
      } else if (effect.type === "earthEscape") {
        const escaped = await this.app.combat?.attemptEarthEscapeFromCard?.({ guardOnFailure: effect.guardOnFailure ?? 0 });
        if (escaped) return { shouldEndTurn: false, combatEnded: true };
      } else if (effect.type === "discardRemainingHand") {
        const combat = this.app.state?.combat;
        if (!combat) continue;
        const discarded = combat.hand.length;
        if (effect.banishForCombat) {
          // Keep the persistent deck intact: these cards return automatically
          // at the next battle, but cannot be redrawn or reshuffled this battle.
          combat.banished ??= [];
          combat.banished.push(...combat.hand);
        } else combat.discard.push(...combat.hand);
        combat.hand = [];
        combat.selectedCardId = null;
        combat.selectedCardAt = 0;
        this.addLog("combat.log.discardHand", { count: discarded });
        const amount = Math.max(0, Math.floor(effect.damageBase ?? 0)) + discarded * Math.max(0, Math.floor(effect.damagePerCard ?? 0));
        const result = await this.executeEffects([
          { type: "damage", amount, target: "allEnemies" },
        ], { ...ctx, cardInstance: null });
        shouldEndTurn ||= Boolean(result?.shouldEndTurn);
        if (result?.combatEnded) return { shouldEndTurn, combatEnded: true };
      } else if (effect.type === "stealManaFromAllEnemies") {
        // Roll each victim first; only then cap that roll by its actual Mana.
        // Status-based misses do not affect this non-attack spell.
        const enemies = (this.app.getLivingEnemies?.() ?? []).filter((unit) => unit.hp > 0);
        const min = Math.max(0, Math.floor(effect.min ?? 1));
        const max = Math.max(min, Math.floor(effect.max ?? min));
        const rolls = enemies.map((unit) => ({ unit, roll: this.app.rng?.int?.(min, max) ?? min }));
        let total = 0;
        for (const { unit, roll } of rolls) {
          const before = Math.max(0, Math.floor(unit.mana ?? 0));
          const actual = Math.min(before, roll);
          unit.mana = before - actual;
          total += actual;
          if (actual > 0) void this.app.showResourceChange?.(unit, "mana", before, unit.mana, { duration: 560, wait: false });
        }
        if (total > 0) {
          const before = Math.max(0, Math.floor(source.mana ?? 0));
          source.mana = before + total;
          this.addLog("combat.log.manaDrain", { target: this.unitRef(source), amount: total, before, after: source.mana });
          void this.app.showResourceChange?.(source, "mana", before, source.mana, { duration: 560, wait: false });
        }
      } else if (effect.type === "damage") {
        const allOtherCombatants = !forceAttackSelf && effect.target === "allOtherCombatants";
        const allCombatants = !forceAttackSelf && effect.target === "allCombatants";
        const playerAndLostMindApothecaries = !forceAttackSelf && effect.target === "playerAndLostMindApothecaries";
        const isGroup = !forceAttackSelf && (allOtherCombatants || allCombatants || playerAndLostMindApothecaries || effect.target === "allEnemies" || ctx.targetMode === "allEnemies");
        let targets = forceAttackSelf ? [source] : (allOtherCombatants
          ? [this.app.state?.player, ...(this.app.getLivingEnemies?.() ?? [])].filter((unit) => unit && unit !== source && unit.hp > 0)
          : allCombatants
            ? [this.app.state?.player, ...(this.app.getLivingEnemies?.() ?? [])].filter((unit) => unit && unit.hp > 0)
            : playerAndLostMindApothecaries
              ? [this.app.state?.player, ...(this.app.getLivingEnemies?.() ?? []).filter((unit) => unit?.enemyId === "lostMindApothecary")].filter((unit) => unit && unit !== source && unit.hp > 0)
              : (isGroup ? this.app.getLivingEnemies() : [target]));
        if (ctx.playerDodgesAttack) targets = targets.filter((unit) => unit?.kind !== "player" || getStatus(unit, "freeze") > 0 || getStatus(unit, "stun") > 0);
        const swordGodAttack = this.isSwordGodAttack(source, ctx.card);
        const swordGodExtraHit = swordGodAttack && !ctx.swordGodBonusHandled ? 1 : 0;
        const baseRepeat = this.resolveRepeatCount(effect) + swordGodExtraHit;
        const nextQiEffect = effects[i + 1];
        const attackQiGain = swordGodAttack && effect.repeatSelfQiGain
          && nextQiEffect?.type === "gainQi" && nextQiEffect.target === "self"
          ? (ctx.cardInstance ? this.applyUpgrade(ctx.cardInstance, nextQiEffect) : nextQiEffect) : null;
        if (attackQiGain) perAttackQiEffects.add(i + 1);
        const grantAttackQi = () => {
          if (attackQiGain && source.hp > 0) this.gainQiWithFeedback(source, this.resolveAmount(attackQiGain.amount, source));
        };
        let resolvedBaseHits = 0;
        // Keep one-off attacks at the established pace, but halve the spacing
        // between repeated hits so sword barrages read as rapid chained attacks.
        const isMultiHitSequence = baseRepeat > 1 || Boolean(effect.extraRepeatChance) || Boolean(ctx.comboSequence);
        const repeatedHitDuration = isMultiHitSequence ? COMBO_HIT_FEEDBACK_MS : SINGLE_HIT_FEEDBACK_MS;
        const enemyDamageTakenDuration = isMultiHitSequence ? ENEMY_COMBO_DAMAGE_TAKEN_FX_MS : ENEMY_SINGLE_DAMAGE_TAKEN_FX_MS;
        const pendingReflection = new Map();
        const collectReflection = (result) => {
          if (!isMultiHitSequence || !result?.reflection) return;
          const hit = result.reflection;
          const total = pendingReflection.get(hit.source) ?? { ...hit, received: 0, weightedDamage: 0 };
          total.received += hit.received;
          total.weightedDamage += hit.received * hit.stacks;
          pendingReflection.set(hit.source, total);
          // Individual hits retain their normal damage/status feedback; only the
          // reflected damage is deferred to the end of this multi-hit attack.
          result.reflection = null;
        };

        if (isGroup) {
          // Resolve each wave of a group attack together so every target's
          // floating HP number starts at the same time.
          for (let n = 0; n < baseRepeat; n += 1) {
            const activeTargets = targets.filter((oneTarget) => oneTarget && oneTarget.hp > 0);
            if (!activeTargets.length) break;
            const displayOrder = Array.isArray(effect?.targetCountRanges?.[activeTargets.length])
              ? (this.app.state?.combat?.enemyTurnOrder ?? [])
                .map((uid) => activeTargets.find((oneTarget) => oneTarget.uid === uid))
                .filter(Boolean)
              : activeTargets;
            for (const oneTarget of activeTargets) if (!displayOrder.includes(oneTarget)) displayOrder.push(oneTarget);
            const results = activeTargets.map((oneTarget) => {
              const targetIndex = Math.max(0, displayOrder.indexOf(oneTarget));
              const amount = this.resolveDamageAmount(effect, source, targetIndex, activeTargets.length);
              const result = this.dealDamage(source, oneTarget, amount, { ...effect, firstHit: n === 0, card: ctx.card, actionTags: ctx.actionTags });
              this.logDamageResult(source, oneTarget, result);
              return { oneTarget, result };
            });
            queueActualDamageHealAmount(effect, source,
              results.reduce((sum, { result }) => sum + Math.max(0, result?.actual ?? 0), 0));
            drainManaFromDamagedEnemies(effect, source, results);
            if (effect.gainQiFromActualDamage && source.hp > 0) {
              const hpDamage = results.reduce((sum, { result }) =>
                sum + Math.max(0, result.beforeHp - result.afterHp), 0);
              if (hpDamage > 0) this.gainQiWithFeedback(source, hpDamage, { duration: repeatedHitDuration, synchronized: true });
            }
            const impactFx = [
              ...results.map(({ oneTarget, result }) =>
                this.app.flashDamageTaken?.(oneTarget, enemyDamageTakenDuration, { red: result.actual > 0 })
              ),
              ...results.map(({ oneTarget, result }) =>
                this.app.showDamagePopup(oneTarget, result.actual, { duration: repeatedHitDuration })
              ),
            ];
            if (results.some(({ result }) => result.actual > 0)) this.app.audio.play("hit", .5);
            for (const { oneTarget, result } of results) {
              if (result.actual > 0) this.app.audio.playEnemyHit?.(oneTarget);
            }
            if (results.some(({ result }) => result.missed)) this.app.audio.play("miss", .42);
            if (results.some(({ result }) => result.actual === 0 && !result.missed)) this.app.audio.play("defense", .42);
            for (const { oneTarget, result } of results) {
              if (result.beforeHp > 0 && result.afterHp <= 0 && !this.hasPendingLethalRecovery(result) && !result.undying && !result.windRaccoonBody) {
                if (oneTarget.kind !== "player") {
                  const deathFx = this.app.startEnemyDeathFx?.(oneTarget);
                  if (deathFx) enemyDeathPromises.push(deathFx);
                }
              }
            }
            await Promise.all(impactFx);
            await Promise.all(results.map(({ oneTarget }) => this.waitForLethalResolution(oneTarget)));
            for (const { oneTarget, result } of results) {
              if (this.hasPendingLethalRecovery(result)) await this.finalizePendingLethalRecovery(oneTarget, result);
            }
            for (const { oneTarget, result } of results) {
              collectReflection(result);
              await this.applyPostDamageEffects(effect, source, oneTarget, result,
                { ...ctx, reflectionFeedbackDuration: repeatedHitDuration });
            }
            grantAttackQi();
            if ((source?.hp ?? 1) <= 0) break;
          }
        } else {
          for (const initialTarget of targets) {
            let oneTarget = initialTarget;
            if (!oneTarget || oneTarget.hp <= 0) continue;
            if (effect.logSelfDamageCause && oneTarget === source && ctx.actionKey) {
              this.addLog("combat.log.selfDamageCause", { source: this.unitRef(source), action: this.nameRef(ctx.actionKey) });
            }
            let hit = 0;
            let totalRepeats = baseRepeat;
            let completedBaseHits = 0;
            let everyBaseHitDamaged = true;
            for (let n = 0; n < baseRepeat; n += 1) {
              const amount = this.resolveDamageAmount(effect, source, 0, 1);
              const result = this.dealDamage(source, oneTarget, amount, { ...effect, firstHit: hit === 0, card: ctx.card, actionTags: ctx.actionTags });
              hit += 1;
              completedBaseHits += 1;
              resolvedBaseHits += 1;
              if (!(result.actual > 0)) everyBaseHitDamaged = false;
              this.logDamageResult(source, oneTarget, result);
              queueActualDamageHealAmount(effect, source, result.actual);
              const impactFx = [
                this.app.flashDamageTaken?.(oneTarget, oneTarget.kind === "player" ? PLAYER_DAMAGE_TAKEN_FX_MS : enemyDamageTakenDuration, { red: result.actual > 0 }),
                this.app.showDamagePopup(oneTarget, result.actual, { duration: repeatedHitDuration }),
              ];
              this.app.audio.play(result.missed ? "miss" : result.actual === 0 ? "defense" : "hit", result.actual === 0 ? .42 : .5);
              if (result.actual > 0) this.app.audio.playEnemyHit?.(oneTarget);
              if (result.beforeHp > 0 && result.afterHp <= 0 && !this.hasPendingLethalRecovery(result) && !result.undying && !result.windRaccoonBody) {
                if (oneTarget.kind !== "player") {
                  const deathFx = this.app.startEnemyDeathFx?.(oneTarget);
                  if (deathFx) enemyDeathPromises.push(deathFx);
                }
              }
              await Promise.all(impactFx);
              await this.waitForLethalResolution(oneTarget);
              if (this.hasPendingLethalRecovery(result)) await this.finalizePendingLethalRecovery(oneTarget, result);
              collectReflection(result);
              await this.applyPostDamageEffects(effect, source, oneTarget, result,
                { ...ctx, reflectionFeedbackDuration: repeatedHitDuration });
              grantAttackQi();
              if (source?.hp <= 0) break;
              if (oneTarget.hp <= 0) {
                const canRetarget = source?.kind === "player"
                  && effect.retargetOnKill === "lowestHp"
                  && n + 1 < baseRepeat;
                const nextTarget = canRetarget ? this.pickLowestHpLivingEnemy() : null;
                if (nextTarget) {
                  oneTarget = nextTarget;
                  continue;
                }
                break;
              }
            }
            if (effect.afterAllHitsStatus && oneTarget.hp > 0 && (source?.hp ?? 1) > 0) {
              const spec = effect.afterAllHitsStatus;
              const conditionMet = !spec.requireEveryHitActualDamage || (completedBaseHits === baseRepeat && everyBaseHitDamaged);
              if (conditionMet) {
                const before = getStatus(oneTarget, spec.status);
                let applied = false;
                if (spec.status === "darkForce") {
                  ({ applied } = this.tryApplyDarkForce(oneTarget, spec));
                } else {
                  applied = this.tryApplyStatus(oneTarget, spec);
                }
                const after = getStatus(oneTarget, spec.status);
                this.addLog(applied ? "combat.log.statusGain" : "combat.log.statusResist", applied
                  ? { target: this.unitRef(oneTarget), status: this.nameRef(`status.${spec.status}`), before, after }
                  : { target: this.unitRef(oneTarget), status: this.nameRef(`status.${spec.status}`), before, after });
              }
            }
            if (effect.extraRepeatChance) {
              while (this.app.rng.chance(effect.extraRepeatChance) && totalRepeats < 64 && oneTarget.hp > 0 && (source?.hp ?? 1) > 0) {
                totalRepeats += 1;
                const amount = this.resolveAmount(effect.amount, source);
                const result = this.dealDamage(source, oneTarget, amount, { ...effect, firstHit: false, card: ctx.card, actionTags: ctx.actionTags });
                hit += 1;
                this.logDamageResult(source, oneTarget, result);
                queueActualDamageHealAmount(effect, source, result.actual);
                const impactFx = [
                  this.app.flashDamageTaken?.(oneTarget, oneTarget.kind === "player" ? PLAYER_DAMAGE_TAKEN_FX_MS : enemyDamageTakenDuration, { red: result.actual > 0 }),
                  this.app.showDamagePopup(oneTarget, result.actual, { duration: COMBO_HIT_FEEDBACK_MS }),
                ];
                this.app.audio.play(result.missed ? "miss" : result.actual === 0 ? "defense" : "hit", result.actual === 0 ? .42 : .5);
                if (result.actual > 0) this.app.audio.playEnemyHit?.(oneTarget);
                if (result.beforeHp > 0 && result.afterHp <= 0 && !this.hasPendingLethalRecovery(result) && !result.undying && !result.windRaccoonBody) {
                  if (oneTarget.kind !== "player") {
                    const deathFx = this.app.startEnemyDeathFx?.(oneTarget);
                    if (deathFx) enemyDeathPromises.push(deathFx);
                  }
                }
                await Promise.all(impactFx);
                await this.waitForLethalResolution(oneTarget);
                if (this.hasPendingLethalRecovery(result)) await this.finalizePendingLethalRecovery(oneTarget, result);
                collectReflection(result);
                await this.applyPostDamageEffects(effect, source, oneTarget, result,
                  { ...ctx, reflectionFeedbackDuration: COMBO_HIT_FEEDBACK_MS });
                grantAttackQi();
              }
            }
          }
        }
        for (const reflected of pendingReflection.values()) {
          if ((source?.hp ?? 0) <= 0 || this.app.state?.combat?.result) break;
          reflected.raw = Math.ceil(reflected.weightedDamage / 20);
          await this.resolveReflectionFeedback({ reflection: reflected }, { duration: COMBO_HIT_FEEDBACK_MS });
        }
        if (source?.kind === "player" && (effect.drawIfRepeatBelowMax ?? 0) > 0 && Array.isArray(effect.repeatRange)) {
          const maxRepeat = Math.max(...effect.repeatRange.map((value) => Math.max(1, Math.floor(value)))) + swordGodExtraHit;
          if (resolvedBaseHits < maxRepeat) {
            const before = this.app.state.combat?.hand.length ?? 0;
            await this.app.combat?.drawCardsAnimated?.(Math.max(0, Math.floor(effect.drawIfRepeatBelowMax)), { interval: 100 });
            const after = this.app.state.combat?.hand.length ?? before;
            this.addLog("combat.log.draw", { count: Math.max(0, after - before) });
          }
        }
      } else if (effect.type === "igniteBurn") {
        const unit = target ?? source;
        const stacks = Math.max(0, Math.floor(getStatus(unit, "burn")));
        if (stacks > 0 && unit.hp > 0) {
          const beforeHp = unit.hp;
          removeStatus(unit, "burn", Infinity);
          const burnDamage = burnDamageAfterHeatResistance(unit, stacks * 4);
          beginZeroHpPause(this.app, unit);
          unit.hp = Math.max(0, unit.hp - burnDamage);
          this.beginZeroHpPause(unit);
          recordCombatDamage(this.app.state, unit, beforeHp, unit.hp, { source, playedCard: Boolean(ctx.card) });

          const pendingWindRaccoonBody = unit.hp <= 0 && this.canTriggerWindRaccoonBody(unit);

          const actual = Math.max(0, beforeHp - unit.hp);
          consumeConcentrationOnHpLoss(unit, actual);
          const pendingNirvana = unit.hp <= 0 && !pendingWindRaccoonBody && this.canTriggerNirvanaFromBurn(unit, stacks);
          const pendingUndying = unit.hp <= 0 && !pendingWindRaccoonBody && !pendingNirvana && this.canTriggerUndying(unit);
          this.addLog("combat.log.burnIgnite", { target: this.unitRef(unit), stacks, damage: actual });
          if (actual > 0) {
            this.app.audio.play("hit", .5);
            this.app.audio.playEnemyHit?.(unit);
            if (beforeHp > 0 && unit.hp <= 0 && !pendingWindRaccoonBody && !pendingNirvana && !pendingUndying) {
              if (unit.kind !== "player") {
                const deathFx = this.app.startEnemyDeathFx?.(unit);
                if (deathFx) enemyDeathPromises.push(deathFx);
              }
            }
            await Promise.all([
              this.app.flashDamageTaken?.(unit, unit.kind === "player" ? PLAYER_DAMAGE_TAKEN_FX_MS : ENEMY_SINGLE_DAMAGE_TAKEN_FX_MS, { red: true }),
              this.app.showDamagePopup?.(unit, actual, { duration: SINGLE_HIT_FEEDBACK_MS }),
            ]);
          }
          await this.waitForLethalResolution(unit);
          if (pendingWindRaccoonBody) await this.finalizeWindRaccoonBodyIfNeeded(unit);
          else if (pendingNirvana) await this.finalizeNirvanaFromBurnIfNeeded(unit, stacks);
          else if (pendingUndying) await this.finalizeUndyingIfNeeded(unit);
        }
      } else if (effect.type === "shatterDefensesDamage") {
        const unit = target ?? source;
        if (unit && unit.hp > 0) {
          const qiBefore = Math.max(0, Math.floor(unit.qi ?? 0));
          const guardBefore = Math.max(0, Math.floor(unit.guard ?? 0));
          unit.qi = 0;
          syncBuffOrder(unit, "qi");
          if (guardBefore > 0) clearGuard(unit);
          else syncBuffOrder(unit, "guard");
          if (qiBefore > 0) this.addLog("combat.log.qiChange", { target: this.unitRef(unit), before: qiBefore, after: 0 });
          if (guardBefore > 0) this.addLog("combat.log.guardChange", { target: this.unitRef(unit), before: guardBefore, after: 0 });
          const result = this.dealDamage(source, unit, qiBefore + guardBefore, {
            ignoreQi: true, ignoreGuard: true, ignoreArmorBreakBonus: true, unavoidable: true, card: ctx.card, firstHit: true,
          });
          this.logDamageResult(source, unit, result);
          this.app.audio.play(result.actual === 0 ? "defense" : "hit", result.actual === 0 ? .42 : .5);
          if (result.actual > 0) this.app.audio.playEnemyHit?.(unit);
          const deathFx = result.beforeHp > 0 && result.afterHp <= 0 && !this.hasPendingLethalRecovery(result)
            ? (unit.kind === "player" ? null : this.app.startEnemyDeathFx?.(unit))
            : null;
          await Promise.all([
            this.app.flashDamageTaken?.(unit, unit.kind === "player" ? PLAYER_DAMAGE_TAKEN_FX_MS : ENEMY_SINGLE_DAMAGE_TAKEN_FX_MS, { red: result.actual > 0 }),
            this.app.showDamagePopup?.(unit, result.actual, { duration: SINGLE_HIT_FEEDBACK_MS }),
          ]);
          await this.waitForLethalResolution(unit);
          if (deathFx) await deathFx;
          if (this.hasPendingLethalRecovery(result)) await this.finalizePendingLethalRecovery(unit, result);
          await this.applyPostDamageEffects(effect, source, unit, result, ctx);
        }
      } else if (effect.type === "loseMaxHpPercent") {
        const unit = target ?? source;
        const beforeHp = unit.hp;
        const amount = Math.floor((unit.maxHp ?? 0) * Math.max(0, effect.percent ?? 0) / 100);
        beginZeroHpPause(this.app, unit);
        unit.hp = Math.max(0, unit.hp - amount);
        this.beginZeroHpPause(unit);
        const damageAfterHp = unit.hp;
        recordCombatDamage(this.app.state, unit, beforeHp, damageAfterHp, { source, playedCard: Boolean(ctx.card) });

        const pendingWindRaccoonBody = damageAfterHp <= 0 && this.canTriggerWindRaccoonBody(unit);

        const actual = Math.max(0, beforeHp - damageAfterHp);
        consumeConcentrationOnHpLoss(unit, actual);
        const pendingUndying = damageAfterHp <= 0 && !pendingWindRaccoonBody && this.canTriggerUndying(unit);
        this.addLog("combat.log.heartDemonCardDamage", {
          target: this.unitRef(unit), damage: actual, before: beforeHp, after: damageAfterHp,
        });
        if (actual > 0) {
          this.app.audio.play("hit", .5);
          this.app.audio.playEnemyHit?.(unit);
          await this.app.showDamagePopup(unit, actual, { duration: 560 });
        }
        await this.waitForLethalResolution(unit);
        if (pendingWindRaccoonBody) await this.finalizeWindRaccoonBodyIfNeeded(unit);
        else if (pendingUndying) await this.finalizeUndyingIfNeeded(unit);
      } else if (effect.type === "awakenStoneGolem") {
        this.app.combat?.summonStoneGolemRightOf?.(source);
      } else if (effect.type === "xuanpinQi") {
        const unit = effect.target === "self" ? source : (target ?? source);
        const round = Math.max(1, Math.floor(this.app.state?.combat?.round ?? 1));
        const statusChance = Math.max(0, Math.min(100, Number(effect.statusChance ?? 40)));
        const opponents = source?.kind === "player"
          ? (this.app.getLivingEnemies?.() ?? []).filter((candidate) => candidate?.hp > 0)
          : [this.app.state?.player].filter((candidate) => candidate?.hp > 0);
        for (const opponent of opponents) {
          const status = this.app.rng?.pick?.(["qiStagnation", "heartDemon"])
            ?? ((this.app.rng?.int?.(0, 1) ?? 0) === 0 ? "qiStagnation" : "heartDemon");
          const before = getStatus(opponent, status);
          const applied = this.tryApplyStatus(opponent, { status, stacks: 1, chance: statusChance });
          const after = getStatus(opponent, status);
          this.addLog(applied ? "combat.log.statusGain" : "combat.log.statusResist", {
            target: this.unitRef(opponent), status: this.nameRef(`status.${status}`), before, after,
          });
        }
        const reflectionStacks = Math.max(0, Math.floor(round * Math.max(0, Number(effect.reflectionPerRound ?? 2))));
        const qiGain = Math.max(0, Math.floor(round * Math.max(0, Number(effect.qiPerRound ?? 2))));
        const grantQi = () => {
          if (qiGain <= 0) return;
          const before = Math.max(0, Math.floor(unit.qi ?? 0));
          unit.qi = before + qiGain;
          syncBuffOrder(unit, "qi");
          this.app.showStatusPopup?.(unit, "qi", true, qiGain);
          this.addLog("combat.log.qiGain", { target: this.unitRef(unit), amount: qiGain, before, after: unit.qi });
        };
        const grantReflection = () => {
          if (reflectionStacks <= 0) return;
          const before = getStatus(unit, "reflection");
          this.addStatusWithFeedback(unit, "reflection", reflectionStacks);
          this.addLog("combat.log.statusGain", { target: this.unitRef(unit), status: this.nameRef("status.reflection"), before, after: getStatus(unit, "reflection") });
        };
        if ((effect.defenseMode ?? "both") === "either") {
          // Upgraded Xuanpin Qi rolls one self-defense branch per cast.
          const defenseBranch = this.app.rng?.int?.(0, 1)
            ?? (this.app.rng?.chance?.(50) ? 0 : 1);
          if (defenseBranch === 0) grantQi();
          else grantReflection();
        } else {
          // Base Xuanpin Qi (and Gate) receive both Qi and Reflection together.
          grantQi();
          grantReflection();
        }
      } else if (effect.type === "valleyGodCurse" || effect.type === "gateValleyGodCurse") {
        const unit = effect.target === "self" ? source : (target ?? source);
        const beforeQi = Math.max(0, Math.floor(unit?.qi ?? 0));
        if (beforeQi > 0) {
          unit.qi = 0;
          syncBuffOrder(unit, "qi");
          this.addLog("combat.log.qiChange", { target: this.unitRef(unit), before: beforeQi, after: 0 });
          await this.app.showResourceChange?.(unit, "qi", beforeQi, 0, { duration: 420, wait: true });
          const healMultiplier = Math.max(0, Number(effect.healMultiplier ?? 1));
          const beforeHp = Math.max(0, Math.floor(unit.hp ?? 0));
          const healAmount = Math.max(0, Math.floor(beforeQi * healMultiplier));
          unit.hp = Math.min(Math.max(0, Math.floor(unit.maxHp ?? beforeHp)), beforeHp + healAmount);
          this.addLog("combat.log.heal", { target: this.unitRef(unit), amount: unit.hp - beforeHp, before: beforeHp, after: unit.hp });
          await this.app.showResourceChange?.(unit, "hp", beforeHp, unit.hp, { duration: 560, wait: true, showZeroAsGain: true });
        } else {
          const stacks = Math.max(1, Math.floor(Number(effect.undyingStacks ?? 1)));
          const before = getStatus(unit, "undying");
          this.addStatusWithFeedback(unit, "undying", stacks);
          this.addLog("combat.log.statusGain", { target: this.unitRef(unit), status: this.nameRef("status.undying"), before, after: getStatus(unit, "undying") });
        }
      } else if (effect.type === "gainQi") {
        let amount = this.resolveAmount(effect.amount, source);
        if (effect.conditionalAmount && source[effect.conditionalAmount.sourceStat] >= effect.conditionalAmount.gte) amount = effect.conditionalAmount.amount;
        const unit = target ?? source;
        this.gainQiWithFeedback(unit, amount);
      } else if (effect.type === "scheduleNextTurnQi") {
        const unit = effect.target === "self" ? source : (target ?? source);
        const amount = Math.max(0, Math.floor(this.resolveAmount(effect.amount, source)));
        if (unit && amount > 0) {
          unit.combatFlags ??= {};
          unit.combatFlags.nextTurnQiGain = Math.max(0, Math.floor(unit.combatFlags.nextTurnQiGain ?? 0)) + amount;
        }
      } else if (effect.type === "advanceChiefDiamondBody") {
        source.combatFlags ??= {};
        source.combatFlags.enemyChiefDiamondBodyBonus = Math.min(30, Math.max(0, Math.floor(source.combatFlags.enemyChiefDiamondBodyBonus ?? 0)) + 10);
        source.combatFlags.enemyChiefDiamondBodyGatherArmed = true;
      } else if (effect.type === "reduceGuard") {
        const unit = target ?? source;
        const before = unit.guard ?? 0;
        reduceGuard(unit, Math.max(0, Math.floor(effect.amount ?? 0)));
        if (before !== unit.guard) this.addLog("combat.log.guardChange", { target: this.unitRef(unit), before, after: unit.guard });
      } else if (effect.type === "clearStatusHealPerStack") {
        const unit = target ?? source;
        const status = effect.status;
        const stacks = Math.max(0, Math.floor(getStatus(unit, status)));
        if (stacks > 0) {
          const beforeStatus = stacks;
          removeStatus(unit, status, Infinity);
          this.addLog("combat.log.statusGain", { target: this.unitRef(unit), status: this.nameRef(`status.${status}`), before: beforeStatus, after: 0 });
          const beforeHp = unit.hp;
          const amount = stacks * Math.max(0, Math.floor(effect.healPerStack ?? 0));
          unit.hp = Math.min(unit.maxHp, unit.hp + amount);
          this.addLog("combat.log.heal", { target: this.unitRef(unit), amount: unit.hp - beforeHp, before: beforeHp, after: unit.hp });
          await this.app.showResourceChange?.(unit, "hp", beforeHp, unit.hp, { duration: 560, wait: true, showZeroAsGain: true });
        }
      } else if (effect.type === "gainGuard") {
        const units = this.effectTargets(effect, source, target);
        for (const unit of units) {
          if (!unit) continue;
          const before = unit.guard ?? 0;
          const gained = gainGuard(unit, this.resolveAmount(effect.amount, source));
          if (gained > 0) this.app.showStatusPopup?.(unit, "guard", true, gained);
          if (gained > 0) this.addLog("combat.log.guardGain", { target: this.unitRef(unit), amount: unit.guard - before, before, after: unit.guard });
          else this.addLog("combat.log.guardBlocked", { target: this.unitRef(unit) });
        }
      } else if (effect.type === "addStatus") {
        const units = effect.target === "allEnemies" ? (this.app.getLivingEnemies?.() ?? []) : [target ?? source];
        for (const unit of units) {
          if (!unit) continue;
          const stacks = this.resolveStatusStacks(effect, unit);
          const statusSpec = { ...effect, stacks, chance: this.resolveChance(effect.chance ?? 100, source) };
          const before = getStatus(unit, effect.status);
          const applied = effect.ignoreResistance
            ? this.addStatusWithFeedback(unit, effect.status, stacks)
            : this.tryApplyStatus(unit, statusSpec);
          const after = getStatus(unit, effect.status);
          this.addLog(applied ? "combat.log.statusGain" : "combat.log.statusResist", {
            target: this.unitRef(unit), status: this.nameRef(`status.${effect.status}`), before, after,
          });
          if (applied && (effect.guardOnSuccess ?? 0) > 0) {
            const beforeGuard = unit.guard ?? 0;
            const gained = gainGuard(unit, effect.guardOnSuccess);
            if (gained > 0) this.app.showStatusPopup?.(unit, "guard", true, gained);
            if (gained > 0) this.addLog("combat.log.guardGain", { target: this.unitRef(unit), amount: unit.guard - beforeGuard, before: beforeGuard, after: unit.guard });
            else this.addLog("combat.log.guardBlocked", { target: this.unitRef(unit) });
          }
        }
      } else if (effect.type === "ensureStatus") {
        const units = this.effectTargets(effect, source, target);
        for (const unit of units) {
          if (!unit) continue;
          const before = getStatus(unit, effect.status);
          if (before > 0) continue;
          this.addStatusWithFeedback(unit, effect.status, Math.max(1, Math.floor(effect.stacks ?? 1)));
          const after = getStatus(unit, effect.status);
          if (after !== before) this.addLog("combat.log.statusGain", {
            target: this.unitRef(unit), status: this.nameRef(`status.${effect.status}`), before, after,
          });
        }
      } else if (effect.type === "clearStatusesExcept") {
        const units = this.effectTargets(effect, source, target);
        const preserved = new Set(Array.isArray(effect.except) ? effect.except : []);
        for (const unit of units) {
          if (!unit) continue;
          const beforeQi = Math.max(0, Math.floor(unit.qi ?? 0));
          const beforeGuard = Math.max(0, Math.floor(unit.guard ?? 0));
          unit.qi = 0;
          clearGuard(unit);
          syncBuffOrder(unit, "qi");
          if (beforeQi > 0) this.addLog("combat.log.qiChange", { target: this.unitRef(unit), before: beforeQi, after: 0 });
          if (beforeGuard > 0) this.addLog("combat.log.guardChange", { target: this.unitRef(unit), before: beforeGuard, after: 0 });
          for (const status of Object.keys(unit.statuses ?? {})) {
            if (preserved.has(status)) continue;
            const before = getStatus(unit, status);
            if (before <= 0) continue;
            removeStatus(unit, status, Infinity);
            this.addLog("combat.log.statusGain", {
              target: this.unitRef(unit), status: this.nameRef(`status.${status}`), before, after: 0,
            });
          }
        }
      } else if (effect.type === "halveStatus") {
        const units = this.effectTargets(effect, source, target);
        for (const unit of units) {
          if (!unit) continue;
          const before = getStatus(unit, effect.status);
          const after = Math.floor(before / 2);
          if (after < before) removeStatus(unit, effect.status, before - after);
          if (after !== before) this.addLog("combat.log.statusGain", {
            target: this.unitRef(unit), status: this.nameRef(`status.${effect.status}`), before, after,
          });
        }
      } else if (effect.type === "removeStatus") {
        const units = this.effectTargets(effect, source, target);
        for (const unit of units) {
          if (!unit) continue;
          const before = getStatus(unit, effect.status);
          removeStatus(unit, effect.status, Math.max(0, Math.floor(effect.stacks ?? Infinity)));
          const after = getStatus(unit, effect.status);
          if (after !== before) this.addLog("combat.log.statusGain", {
            target: this.unitRef(unit), status: this.nameRef(`status.${effect.status}`), before, after,
          });
        }
      } else if (effect.type === "howlWolves") {
        for (const enemy of this.app.getLivingEnemies?.() ?? []) {
          if (!["wolf", "berserkWolf"].includes(enemy.enemyId)) continue;
          enemy.combatFlags ??= {};
          enemy.combatFlags.wolfHowlNext = true;
        }
      } else if (effect.type === "increaseCombatFlag") {
        const unit = target ?? source;
        unit.combatFlags ??= {};
        const flag = effect.flag;
        if (flag) unit.combatFlags[flag] = Math.max(0, Math.floor(unit.combatFlags[flag] ?? 0) + Math.floor(effect.amount ?? 0));
      } else if (effect.type === "clearQi") {
        const units = this.effectTargets(effect, source, target);
        for (const unit of units) {
          if (!unit) continue;
          const before = unit.qi ?? 0;
          unit.qi = 0;
          syncBuffOrder(unit, "qi");
          if (before !== 0) this.addLog("combat.log.qiChange", { target: this.unitRef(unit), before, after: 0 });
        }
      } else if (effect.type === "activateSwordDomain") {
        const unit = target ?? source;
        const profile = {
          damage: Math.max(0, Math.floor(effect.damage ?? 0)),
          qi: Math.max(0, Math.floor(effect.qi ?? 0)),
          swordIntent: Math.max(0, Math.floor(effect.swordIntent ?? 0)),
        };
        if (getStatus(unit, "swordDomain") > 0) {
          // Recasting any tier while the Domain is already open costs 0 Mana and
          // immediately resolves that card's own numbers; it does not overwrite
          // the tier/profile that powers the persistent turn-start Domain.
          await this.resolveSwordDomainPulse(unit, profile, { fromTurnStart: false });
        } else {
          const before = getStatus(unit, "swordDomain");
          this.addStatusWithFeedback(unit, "swordDomain", 1);
          unit.combatFlags ??= {};
          unit.combatFlags.swordDomainProfile = profile;
          this.addLog("combat.log.statusGain", {
            target: this.unitRef(unit), status: this.nameRef("status.swordDomain"), before, after: getStatus(unit, "swordDomain"),
          });
        }
      } else if (effect.type === "armNextSpellCostCap") {
        const unit = target ?? source;
        unit.combatFlags ??= {};
        unit.combatFlags.nextSpellCostCap = Math.max(0, Math.floor(effect.cap ?? 1));
      } else if (effect.type === "loseSense") {
        const unit = target ?? source;
        const before = Math.max(0, Math.floor(unit.sense ?? 0));
        const amount = Math.max(0, Math.floor(effect.amount ?? 0));
        unit.sense = Math.max(0, before - amount);
        if (unit.sense !== before) {
          this.addLog("combat.log.senseLoss", { target: this.unitRef(unit), amount: before - unit.sense, before, after: unit.sense });
          await this.app.showResourceChange?.(unit, "sense", before, unit.sense, { duration: 560, wait: true });
        }
      } else if (effect.type === "rookieBrokenGreenBottle") {
        const combat = this.app.state?.combat;
        const living = (combat?.enemies ?? []).filter((unit) => unit.hp > 0);
        const livingByUid = new Map(living.map((unit) => [unit.uid, unit]));
        const ordered = (combat?.enemyTurnOrder ?? []).map((uid) => livingByUid.get(uid)).filter(Boolean);
        const orderedUids = new Set(ordered.map((unit) => unit.uid));
        // Enemy cards are rendered left-to-right from enemyTurnOrder. Resolve the
        // bottle in that current visual order rather than immutable spawn order.
        const allies = [...ordered, ...living.filter((unit) => !orderedUids.has(unit.uid))];
        try {
          for (const unit of allies) {
            combat.healingEnemyId = unit.uid;
            this.app.render?.();
            const hpBefore = Math.max(0, Math.floor(unit.hp ?? 0));
            const healPercent = this.app.rng?.int?.(10, 20) ?? 10;
            const healRaw = Math.ceil(Math.max(0, Math.floor(unit.maxHp ?? 0)) * healPercent / 100);
            unit.hp = Math.min(unit.maxHp ?? hpBefore, hpBefore + healRaw);
            const healed = Math.max(0, unit.hp - hpBefore);
            this.addLog("combat.log.heal", { target: this.unitRef(unit), amount: healed, before: hpBefore, after: unit.hp });
            await this.app.showResourceChange?.(unit, "hp", hpBefore, unit.hp, { duration: 420, wait: true, showZeroAsGain: true });
            const manaBefore = Math.max(0, Math.floor(unit.mana ?? 0));
            const manaGain = this.app.rng?.int?.(1, 2) ?? 1;
            unit.mana = manaBefore + manaGain;
            this.addLog("combat.log.manaRestore", { target: this.unitRef(unit), amount: manaGain, before: manaBefore, after: unit.mana });
            await this.app.showResourceChange?.(unit, "mana", manaBefore, unit.mana, { duration: 420, wait: true });
            if (unit.mana > Math.max(0, Math.floor(unit.maxMana ?? 0))) {
              const beforeDarkForce = getStatus(unit, "darkForce");
              const { applied } = this.tryApplyDarkForce(unit, { stacks: 1, chance: 100 });
              const afterDarkForce = getStatus(unit, "darkForce");
              this.addLog(applied ? "combat.log.statusGain" : "combat.log.statusResist", {
                target: this.unitRef(unit), status: this.nameRef("status.darkForce"), before: beforeDarkForce, after: afterDarkForce,
              });
            }
          }
        } finally {
          if (combat) combat.healingEnemyId = null;
          this.app.render?.();
        }
        const senseBefore = Math.max(0, Math.floor(source?.sense ?? 0));
        if (source) source.sense = Math.max(0, senseBefore - 2);
        if (source && source.sense !== senseBefore) {
          this.addLog("combat.log.senseLoss", { target: this.unitRef(source), amount: senseBefore - source.sense, before: senseBefore, after: source.sense });
          await this.app.showResourceChange?.(source, "sense", senseBefore, source.sense, { duration: 560, wait: true });
        }
      } else if (effect.type === "gainMana") {
        const unit = target ?? source;
        const before = unit.mana ?? 0;
        const amount = Math.max(0, Math.floor(effect.amount ?? 0));
        unit.mana = effect.allowOverflow ? before + amount : Math.min(unit.maxMana ?? before + amount, before + amount);
        if (unit.mana !== before) {
          this.addLog("combat.log.manaRestore", { target: this.unitRef(unit), amount: unit.mana - before, before, after: unit.mana });
          const feedback = this.app.showResourceChange?.(unit, "mana", before, unit.mana, { duration: 560, wait: true });
          if (ctx.simultaneousRecovery) simultaneousRecoveryFeedback.push(feedback);
          else await feedback;
        }
      } else if (effect.type === "restoreManaFull") {
        const unit = target ?? source;
        const before = unit.mana ?? 0;
        unit.mana = unit.maxMana ?? unit.mana ?? 0;
        if (unit.mana !== before) {
          this.addLog("combat.log.manaRestore", { target: this.unitRef(unit), amount: unit.mana - before, before, after: unit.mana });
          await this.app.showResourceChange?.(unit, "mana", before, unit.mana, { duration: 560 });
        }
      } else if (effect.type === "restoreSense" || effect.type === "gainSense") {
        const unit = target ?? source;
        const before = unit.sense ?? 0;
        const amount = Math.max(0, Math.floor(effect.amount ?? 0));
        unit.sense = effect.type === "gainSense" || effect.allowOverflow
          ? before + amount
          : Math.min(unit.maxSense ?? before + amount, before + amount);
        if (unit.sense !== before) {
          this.addLog("combat.log.senseRestore", { target: this.unitRef(unit), amount: unit.sense - before, before, after: unit.sense });
          await this.app.showResourceChange?.(unit, "sense", before, unit.sense, { duration: 560 });
        }
      } else if (effect.type === "gainMaxHp") {
        const unit = target ?? source;
        const before = unit.maxHp ?? unit.hp ?? 0;
        const amount = Math.max(0, Math.floor(effect.amount ?? 0));
        unit.maxHp = before + amount;
        if (amount > 0) this.addLog("combat.log.maxHpGain", { target: this.unitRef(unit), amount, before, after: unit.maxHp });
      } else if (effect.type === "gainMaxHpPercent") {
        const unit = target ?? source;
        const before = unit.maxHp ?? unit.hp ?? 0;
        const raw = before * Math.max(0, Number(effect.percent) || 0) / 100;
        const amount = effect.round === "ceil" ? Math.ceil(raw) : effect.round === "round" ? Math.round(raw) : Math.floor(raw);
        unit.maxHp = before + Math.max(0, amount);
        if (amount > 0) this.addLog("combat.log.maxHpGain", { target: this.unitRef(unit), amount, before, after: unit.maxHp });
      } else if (effect.type === "healMaxHpPercent") {
        const unit = target ?? source;
        const before = unit.hp;
        const raw = (unit.maxHp ?? 0) * Math.max(0, Number(effect.percent) || 0) / 100;
        const amount = effect.round === "ceil" ? Math.ceil(raw) : effect.round === "round" ? Math.round(raw) : Math.floor(raw);
        unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, amount));
        this.addLog("combat.log.heal", { target: this.unitRef(unit), amount: unit.hp - before, before, after: unit.hp });
        await this.app.showResourceChange?.(unit, "hp", before, unit.hp, { duration: 560, showZeroAsGain: true });
      } else if (effect.type === "heal") {
        const unit = target ?? source;
        const before = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + effect.amount);
        this.addLog("combat.log.heal", { target: this.unitRef(unit), amount: unit.hp - before, before, after: unit.hp });
        const feedback = this.app.showResourceChange?.(unit, "hp", before, unit.hp, { duration: 560, showZeroAsGain: true });
        if (ctx.simultaneousRecovery) simultaneousRecoveryFeedback.push(feedback);
        else await feedback;
      } else if (effect.type === "increaseFleeChance") {
        if (source?.kind === "player" && this.app.state?.combat) {
          const amount = Math.max(0, Math.floor(effect.amount ?? 0));
          this.app.state.combat.fleeArtifactBonus = Math.min(100, Math.max(0, Math.floor(this.app.state.combat.fleeArtifactBonus ?? 0)) + amount);
        }
      } else if (effect.type === "enemyEarthEscape") {
        const escaped = await this.app.combat?.attemptEnemyEarthEscape?.(source, effect);
        if (escaped) return { shouldEndTurn: false, combatEnded: true };
      } else if (effect.type === "adaptiveSelfTalisman") {
        const burn = Math.max(0, Math.floor(getStatus(source, "burn")));
        const heart = Math.max(0, Math.floor(getStatus(source, "heartDemon")));
        let chosen = ctx.adaptiveTalismanChoice ?? null;
        if (!chosen) {
          chosen = "diamond";
          if (burn > 0 || heart > 0) {
            if (burn > heart) chosen = "cooling";
            else if (heart > burn) chosen = "spiritHeart";
            else chosen = this.app.rng?.chance?.(50) ? "cooling" : "spiritHeart";
          }
        }
        if (chosen === "cooling") {
          const before = getStatus(source, "burn");
          removeStatus(source, "burn", 10);
          this.addLog("combat.log.enemyUsesTalisman", { source: this.unitRef(source), action: this.nameRef("item.coolingTalisman.name"), before, after: getStatus(source, "burn") });
        } else if (chosen === "spiritHeart") {
          const before = getStatus(source, "heartDemon");
          removeStatus(source, "heartDemon", 5);
          this.addLog("combat.log.enemyUsesTalisman", { source: this.unitRef(source), action: this.nameRef("item.spiritHeartTalisman.name"), before, after: getStatus(source, "heartDemon") });
        } else {
          const beforeQi = Math.max(0, Math.floor(source.qi ?? 0));
          const beforeGuard = Math.max(0, Math.floor(source.guard ?? 0));
          source.qi = beforeQi + 12;
          syncBuffOrder(source, "qi");
          this.app.showStatusPopup?.(source, "qi", true, 12);
          const guardGained = gainGuard(source, 12);
          if (guardGained > 0) this.app.showStatusPopup?.(source, "guard", true, guardGained);
          this.addLog("combat.log.enemyUsesTalisman", { source: this.unitRef(source), action: this.nameRef("item.diamondTalisman.name") });
          this.addLog("combat.log.qiGain", { target: this.unitRef(source), amount: 12, before: beforeQi, after: source.qi });
          if (guardGained > 0) this.addLog("combat.log.guardGain", { target: this.unitRef(source), amount: guardGained, before: beforeGuard, after: source.guard });
          else this.addLog("combat.log.guardBlocked", { target: this.unitRef(source) });
        }
      } else if (effect.type === "draw") {
        const before = this.app.state.combat?.hand.length ?? 0;
        await this.app.combat.drawCardsAnimated(effect.amount);
        const after = this.app.state.combat?.hand.length ?? before;
        this.addLog("combat.log.draw", { count: after - before });
      } else if (effect.type === "addNextTurnDraw") {
        source.combatFlags ??= {};
        source.combatFlags.nextTurnDraw = (source.combatFlags.nextTurnDraw ?? 0) + Math.max(0, Math.floor(effect.amount ?? 0));
      } else if (effect.type === "activateSwordGod") {
        source.combatFlags ??= {};
        source.combatFlags.swordGodActive = true;
      } else if (effect.type === "reduceSwordSpellCost") {
        source.combatFlags ??= {};
        source.combatFlags.swordSpellCostReduction = (source.combatFlags.swordSpellCostReduction ?? 0) + Math.max(0, Math.floor(effect.amount ?? 0));
      } else if (effect.type === "armNextSwordControlOrSpellDiscount") {
        source.combatFlags ??= {};
        const amount = Math.max(0, Math.floor(effect.amount ?? 0));
        if (ctx.cardInstance?.upgraded) {
          source.combatFlags.nextSwordSpellCostReduction = (source.combatFlags.nextSwordSpellCostReduction ?? 0) + amount;
        } else {
          source.combatFlags.nextSwordControlCostReduction = (source.combatFlags.nextSwordControlCostReduction ?? 0) + amount;
        }
      } else if (effect.type === "endTurn") {
        shouldEndTurn = true;
      } else if (effect.type === "setEndTurnGuard") {
        source.combatFlags ??= {};
        source.combatFlags.endTurnGuard = Math.max(0, Math.floor(source.combatFlags.endTurnGuard ?? 0)) + Math.max(0, Math.floor(effect.amount ?? 0));
        this.addLog("combat.log.prepareGuard", { amount: source.combatFlags.endTurnGuard });
      } else if (effect.type === "armMountainCounter") {
        source.combatFlags ??= {};
        // The player's rooted counter stance displaces Ghost Flash immediately.
        if (source.kind === "player") delete source.combatFlags.ghostFlash;
        source.combatFlags.mountainCounter = {
          multiplier: Math.max(1, Math.floor(effect.multiplier ?? 1)),
          guardRetention: Math.max(0, Math.min(1, Number.isFinite(effect.guardRetention) ? effect.guardRetention : 0)),
        };
        this.addLog("combat.log.mountainCounterArmed", { multiplier: source.combatFlags.mountainCounter.multiplier });
      } else if (effect.type === "armEnemyMountainCounter") {
        source.combatFlags ??= {};
        source.combatFlags.enemyMountainCounter = {
          multiplier: Math.max(1, Math.floor(effect.multiplier ?? 1)),
          guardRetention: Math.max(0, Math.min(1, Number.isFinite(effect.guardRetention) ? effect.guardRetention : 0.5)),
        };
      } else if (effect.type === "bodyGatherQi") {
        const gained = gatherQiHpGain(source);
        if (gained > 0) this.gainQiWithFeedback(source, gained);
        const spent = Math.max(0, Math.floor(source.qi ?? 0));
        source.qi = 0;
        syncBuffOrder(source, "qi");
        source.combatFlags ??= {};
        // Repeated casts in this round add their actual spends. The existing
        // next-player-turn/battle-exit cleanup ends this bonus after enemy acts.
        const bonus = Math.max(0, Math.floor(source.combatFlags.martialBurst?.bonus ?? 0)) + spent;
        source.combatFlags.martialBurst = { bonus };
        this.addLog("combat.log.gatherQi", { target: this.unitRef(source), amount: spent, bonus });
      } else if (effect.type === "armGhostFlash") {
        source.combatFlags ??= {};
        removeStatus(source, "entangle", Infinity);
        if (source.kind === "player") {
          delete source.combatFlags.mountainCounter;
          delete source.combatFlags.huntian;
        }
        source.combatFlags.ghostFlash = { shadowKickPlusUses: Math.max(0, Math.floor(effect.shadowKickPlusUses ?? 0)), triggered: false };
        this.addLog("combat.log.ghostFlashArmed", { count: source.combatFlags.ghostFlash.shadowKickPlusUses });
      } else if (effect.type === "armHuntian") {
        source.combatFlags ??= {};
        if (source.kind === "player") delete source.combatFlags.ghostFlash;
        source.combatFlags.huntian = { armorBreakStacks: Math.max(1, Math.floor(effect.armorBreakStacks ?? 1)) };
        this.addLog("combat.log.huntianArmed", { stacks: source.combatFlags.huntian.armorBreakStacks });
      } else if (effect.type === "armEnemyHuntian") {
        source.combatFlags ??= {};
        source.combatFlags.enemyHuntian = {
          armorBreakStacks: Math.max(1, Math.floor(effect.armorBreakStacks ?? 1)),
          healingStacks: Math.max(0, Math.floor(effect.healingStacks ?? 0)),
        };
        if (effect.nextDecisionFlag) source.combatFlags[effect.nextDecisionFlag] = true;
      } else if (effect.type === "activateIronBone") {
        source.combatFlags ??= {};
        if (!source.combatFlags.ironBoneHardnessGranted) { this.addStatusWithFeedback(source, "hardness", 1); source.combatFlags.ironBoneHardnessGranted = 1; }
        source.combatFlags.ironBoneActive = true;
        const maxHp = Math.max(1, Math.floor(source.maxHp ?? 1));
        const hp = Math.max(0, Math.min(maxHp, Math.floor(source.hp ?? 0)));
        this.addLog("combat.log.ironBone", { bonus: 3 + Math.floor((maxHp - hp) * 10 / maxHp) });
      } else if (effect.type === "activateEnemyIronBone") {
        source.combatFlags ??= {};
        if (effect.restorePersistentHardnessIfMissing && getStatus(source, "hardness") <= 0) this.addStatusWithFeedback(source, "hardness", 1);
        source.combatFlags.ironBoneActive = true;
        source.combatFlags.enemyIronBoneDecisionLock = true;
        if (source.intent) delete source.intent.lockedIronBoneBonus;
        const maxHp = Math.max(1, Math.floor(source.maxHp ?? 1));
        const hp = Math.max(0, Math.min(maxHp, Math.floor(source.hp ?? 0)));
        this.addLog("combat.log.enemyIronBone", { target: this.unitRef(source), bonus: 3 + Math.floor((maxHp - hp) * 10 / maxHp) });
      } else if (effect.type === "armEnemyGhostFlash") {
        source.combatFlags ??= {};
        removeStatus(source, "entangle", Infinity);
        source.combatFlags.enemyGhostFlash = true;
        source.combatFlags.leftGhostDecisionLock = true;
      } else if (effect.type === "activateEnemyGatherQi") {
        const spent = Math.max(0, Math.floor(source.qi ?? 0));
        source.qi = 0;
        syncBuffOrder(source, "qi");
        source.combatFlags ??= {};
        source.combatFlags.enemyMartialBurst = { bonus: spent };
        this.addLog("combat.log.gatherQi", { target: this.unitRef(source), amount: spent, bonus: spent });
        if (source.enemyId === "zhengyangChief") {
          source.combatFlags.enemyChiefDiamondBodyBonus = 0;
          delete source.combatFlags.enemyChiefDiamondBodyGatherArmed;
          delete source.combatFlags.enemyGatherQiDecisionLock;
          // Chief Gather-Qi shares Iron Bone's one-decision defensive lock:
          // next decision skill 1/4 are zero; residual Huntian++ redirects to 2/3.
          source.combatFlags.enemyIronBoneDecisionLock = true;
        } else {
          source.combatFlags.enemyGatherQiDecisionLock = true;
        }
      }
      // Reflection is resolved hit-by-hit. If it kills the acting unit, do not
      // continue resolving later effects from the same card/skill.
      if (source && source.hp <= 0) break;
    }

    if (enemyDeathPromises.length) await Promise.all(enemyDeathPromises);
    if (healFeedbackTail) await healFeedbackTail;
    if (simultaneousRecoveryFeedback.length) await Promise.all(simultaneousRecoveryFeedback);

    const upgrade = ctx.cardInstance?.upgraded ? (CARD_UPGRADES[ctx.cardInstance.cardId] ?? {}) : {};
    if ((upgrade.addSwordIntent ?? 0) > 0) {
      const upgradeSource = ctx.source;
      const before = getStatus(upgradeSource, "swordIntent");
      this.addStatusWithFeedback(upgradeSource, "swordIntent", upgrade.addSwordIntent);
      const after = getStatus(upgradeSource, "swordIntent");
      this.addLog("combat.log.statusGain", {
        target: this.unitRef(upgradeSource), status: this.nameRef("status.swordIntent"), before, after,
      });
    }
    if ((upgrade.drawBonus ?? 0) > 0 && ctx.source?.kind === "player" && this.app.state?.combat) {
      const before = this.app.state.combat.hand.length;
      await this.app.combat.drawCardsAnimated(upgrade.drawBonus);
      const after = this.app.state.combat?.hand.length ?? before;
      this.addLog("combat.log.draw", { count: after - before });
    }
    return { shouldEndTurn, combatEnded: Boolean(this.app.state?.combat?.result) };
  }

  playItemActionSound(item) {
    const actionType = item?.actionType;
    if (!["attack", "defense", "support"].includes(actionType)) return;
    this.app.audio.play(actionType, actionType === "support" ? .6 : .42);
    if (this.app.state?.combat) this.app.queueSkillSfx?.(item.skillSfxKey, actionType);
  }

  async useItem(itemId, targetId = null) {
    const state = this.app.state;
    const item = ITEMS[itemId];
    if (!item || (state.player.inventory[itemId] ?? 0) <= 0) return { ok: false };
    if (itemId === "bloodPill" && (state.player.hp ?? 0) >= (state.player.maxHp ?? 0)) return { ok: false, error: "full" };

    if (item.type === "manual") {
      // Bag use is preview-only. Actual study is resolved by RestEngine and never
      // consumes the manual itself.
      return { ok: false, error: "restOnly" };
    }

    // DESIGN LOCK: inventory/talisman attacks intentionally resolve through
    // item effects only and do NOT call enemy Mountain/Huntian attack reactions.
    // Future enemy talisman attacks must follow the reciprocal rule as well.
    this.addLog("combat.log.useItem", { action: this.nameRef(item.nameKey) });
    this.playItemActionSound(item);
    state.player.inventory[itemId] -= 1;
    const target = targetId ? this.app.findEnemy(targetId) : state.player;
    await this.executeEffects(item.effects ?? [], {
      source: state.player, target, targetMode: item.effects?.[0]?.target, actionTags: item.tags ?? [],
      simultaneousRecovery: ["demonPill2", "demonPill3", "demonPill4"].includes(itemId),
    });
    return { ok: true };
  }
}
