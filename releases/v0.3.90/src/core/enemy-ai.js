import { ENEMIES, GRADE_RULES, leftProtectorInchPunchHits } from "../data/enemies.js?v=v0.3.90";
import { getStatus, startTurnCommon } from "./status.js?v=v0.3.90";

export class EnemyAI {
  constructor(app) { this.app = app; }

  projectedState(enemy) {
    const clone = structuredClone(enemy);
    clone.combatFlags ??= {};
    // Mountain-Shattering Force is guaranteed to expire at the owner's next
    // turn start, before the ordinary projected turn-start resource changes.
    if (clone.combatFlags.enemyMountainCounter) delete clone.combatFlags.enemyMountainCounter;
    // Enemy Huntian follows the same duration contract: it protects/reacts through
    // the opposing player phase, then expires unconditionally at its owner's next
    // turn start even when that turn will later be skipped.
    if (clone.combatFlags.enemyHuntian) delete clone.combatFlags.enemyHuntian;
    // Enemy intent is chosen against the state that will actually exist at the
    // start of that enemy's upcoming turn: Guard clears, Qi halves, Mana regens,
    // and true turn-start effects such as Eightfold Mountain Ward resolve before
    // the action executes. Sword Intent Gourd now only prevents end-turn decay,
    // so it requires no special projected gain.
    startTurnCommon(clone, { manaRegen: GRADE_RULES[clone.grade].manaRegen });
    return clone;
  }


  skillManaCost(skill, enemy) {
    let cost = Math.max(0, Math.floor(skill?.manaCost ?? 0));
    if (skill?.dynamicManaCost === "xuanpinQiRound") {
      const round = Math.max(1, Math.floor(this.app.state?.combat?.round ?? 1));
      cost = round < 2 ? 0 : 2 ** Math.max(0, Math.floor(Math.log2(round)) - 1);
    }
    for (const mod of skill?.manaCostModifiers ?? []) {
      if (mod.source === "selfStatus" && getStatus(enemy, mod.status) > 0) cost += Math.floor(mod.amount ?? 0);
    }
    if (skill?.freeIfSelfCombatFlag && enemy?.combatFlags?.[skill.freeIfSelfCombatFlag]) cost = 0;
    return Math.max(0, cost);
  }

  skillChance(skill, projectedEnemy) {
    let chance = skill.chance ?? 100;
    if (skill.cooldownRoundsAfterUse) {
      const lastUsedRound = projectedEnemy.combatFlags?.skillLastUsedRound?.[skill.id];
      const currentRound = this.app.state?.combat?.round;
      if (Number.isFinite(lastUsedRound) && Number.isFinite(currentRound)
        && currentRound > lastUsedRound && currentRound - lastUsedRound <= skill.cooldownRoundsAfterUse) return 0;
    }
    if (skill.forceZeroIfSelfCombatFlag && projectedEnemy.combatFlags?.[skill.forceZeroIfSelfCombatFlag]) return 0;
    if (Array.isArray(skill.forceZeroIfSelfCombatFlags)
      && skill.forceZeroIfSelfCombatFlags.some((flag) => projectedEnemy.combatFlags?.[flag])) return 0;
    if (skill.forceZeroIfLivingEnemyCountAtLeast?.enemyId) {
      const enemyId = skill.forceZeroIfLivingEnemyCountAtLeast.enemyId;
      const threshold = Math.max(0, Math.floor(skill.forceZeroIfLivingEnemyCountAtLeast.count ?? 0));
      const livingCount = (this.app.state?.combat?.enemies ?? []).filter((unit) => unit.hp > 0 && unit.enemyId === enemyId).length;
      if (livingCount >= threshold) return 0;
    }
    if (skill.onlyLastInNextTurnOrder) {
      const combat = this.app.state.combat;
      const livingUids = new Set((combat?.enemies ?? []).filter((unit) => unit.hp > 0).map((unit) => unit.uid));
      const nextOrder = (combat?.enemyTurnOrder ?? []).filter((uid) => livingUids.has(uid));
      const lastUid = nextOrder.at(-1);
      if (lastUid && lastUid !== projectedEnemy.uid) return 0;
    }
    for (const mod of skill.chanceModifiers ?? []) {
      if (mod.source === "playerStatus") chance += getStatus(this.app.state.player, mod.status) * mod.perStack;
      if (mod.source === "playerHasStatus" && getStatus(this.app.state.player, mod.status) > 0) chance += mod.amount ?? 0;
      if (mod.source === "selfHasStatus" && getStatus(projectedEnemy, mod.status) > 0) chance += mod.amount ?? 0;
      if (mod.source === "selfStatusAtLeast" && getStatus(projectedEnemy, mod.status) >= Math.max(0, Math.floor(mod.threshold ?? 1))) chance += mod.amount ?? 0;
      if (mod.source === "selfHpBelow" && projectedEnemy.hp <= mod.threshold) chance += mod.amount;
      if (mod.source === "selfHpAtLeast" && projectedEnemy.hp >= mod.threshold) chance += mod.amount;
      if (mod.source === "selfHpAtMost" && projectedEnemy.hp <= mod.threshold) chance += mod.amount;
      if (mod.source === "selfMissingHpPercentStep") {
        const maxHp = Math.max(1, Math.floor(projectedEnemy.maxHp ?? 1));
        const missingHp = Math.max(0, maxHp - Math.max(0, Math.floor(projectedEnemy.hp ?? 0)));
        const step = Math.max(1, Number(mod.step ?? 10));
        const missingPercent = missingHp * 100 / maxHp;
        const steps = Math.floor((missingPercent + 1e-9) / step);
        chance += steps * Number(mod.amount ?? 0);
      }
      if (mod.source === "playerMissingHpPercentStep") {
        const player = this.app.state.player ?? {};
        const maxHp = Math.max(1, Math.floor(player.maxHp ?? 1));
        const missingHp = Math.max(0, maxHp - Math.max(0, Math.floor(player.hp ?? 0)));
        const step = Math.max(1, Number(mod.step ?? 10));
        const missingPercent = missingHp * 100 / maxHp;
        const steps = Math.floor((missingPercent + 1e-9) / step);
        chance += steps * Number(mod.amount ?? 0);
      }
      if (mod.source === "selfStatus") chance += getStatus(projectedEnemy, mod.status) * mod.perStack;
      if (mod.source === "selfSkillUseCount") chance += Math.max(0, Math.floor(projectedEnemy.combatFlags?.skillUseCounts?.[mod.skillId] ?? 0)) * (mod.perUse ?? 0);
      if (mod.source === "selfSkillUseCountSum") {
        const ids = Array.isArray(mod.skillIds) ? mod.skillIds : [];
        const uses = ids.reduce((sum, skillId) => sum + Math.max(0, Math.floor(projectedEnemy.combatFlags?.skillUseCounts?.[skillId] ?? 0)), 0);
        chance += uses * (mod.perUse ?? 0);
      }
      if (mod.source === "selfCombatFlag" && projectedEnemy.combatFlags?.[mod.flag]) chance += Number(mod.amount ?? 0);
      if (mod.source === "selfCombatFlagValue") chance += Math.max(0, Number(projectedEnemy.combatFlags?.[mod.flag] ?? 0)) * Number(mod.perPoint ?? 1);
      if (mod.source === "playerQi") chance += Math.max(0, this.app.state.player?.qi ?? 0) * (mod.perPoint ?? 0);
      if (mod.source === "playerQiAtMost" && Math.max(0, this.app.state.player?.qi ?? 0) <= Math.max(0, Number(mod.threshold ?? 0))) chance += Number(mod.amount ?? 0);
      if (mod.source === "playerGuard") chance += Math.max(0, this.app.state.player?.guard ?? 0) * (mod.perPoint ?? 0);
      if (mod.source === "livingEnemiesTotalHpAtMost") {
        const totalHp = (this.app.state?.combat?.enemies ?? []).filter((unit) => unit.hp > 0).reduce((sum, unit) => sum + Math.max(0, Math.floor(unit.hp ?? 0)), 0);
        if (totalHp <= Math.max(0, Number(mod.threshold ?? 0))) chance += Number(mod.amount ?? 0);
      }
      if (mod.source === "playerStonesAtLeast" && Math.max(0, Math.floor(this.app.state.player?.stones ?? 0)) >= Math.max(0, Math.floor(mod.threshold ?? 0))) chance += mod.amount ?? 0;
      if (mod.source === "playerStonesBelow" && Math.max(0, Math.floor(this.app.state.player?.stones ?? 0)) < Math.max(0, Math.floor(mod.threshold ?? 0))) chance += mod.amount ?? 0;
    }
    // A pack howl is a one-round tactical override: the affected wolf's first
    // skill is guaranteed in the next enemy phase. The flag is consumed after
    // that wolf's turn, whether it acts or is prevented from acting.
    if (skill.packSkillOne && projectedEnemy.combatFlags?.wolfHowlActive) chance = 100;
    if (Number.isFinite(skill.forceZeroIfPlayerStonesAtMost)
      && Math.max(0, Math.floor(this.app.state.player?.stones ?? 0)) <= Math.max(0, Math.floor(skill.forceZeroIfPlayerStonesAtMost))) return 0;
    const minChance = Number.isFinite(skill.minChance) ? Math.max(0, Math.min(100, Number(skill.minChance))) : 0;
    const maxChance = Number.isFinite(skill.maxChance) ? Math.max(minChance, Math.min(100, Number(skill.maxChance))) : 100;
    return Math.max(minChance, Math.min(maxChance, chance));
  }

  chooseAdaptiveTalisman(projectedEnemy) {
    const burn = Math.max(0, Math.floor(getStatus(projectedEnemy ?? {}, "burn")));
    const heart = Math.max(0, Math.floor(getStatus(projectedEnemy ?? {}, "heartDemon")));
    if (heart >= 4) return "spiritHeart";
    if (burn >= 4) return "cooling";
    return "diamond";
  }

  adaptiveTalismanNameKey(choice) {
    if (choice === "cooling") return "item.coolingTalisman.name";
    if (choice === "spiritHeart") return "item.spiritHeartTalisman.name";
    return "item.diamondTalisman.name";
  }

  prepareTurnStartManaFlow(enemy) {
    enemy.combatFlags ??= {};
    if (getStatus(enemy, "fiveElementsSecret") > 0) {
      // Roll exactly once before intent selection. projectedState() consumes the
      // flag only on its clone; the real enemy keeps the same plan until its turn.
      enemy.combatFlags.fiveElementsManaFlowNext = Boolean(this.app.rng.chance(50));
    } else {
      delete enemy.combatFlags.fiveElementsManaFlowNext;
    }
  }

  selfMissingHpPercentSteps(unit, step = 20) {
    const maxHp = Math.max(1, Math.floor(unit?.maxHp ?? 1));
    const hp = Math.max(0, Math.min(maxHp, Math.floor(unit?.hp ?? 0)));
    const missingPercent = (maxHp - hp) * 100 / maxHp;
    return Math.floor((missingPercent + 1e-9) / Math.max(1, Number(step) || 20));
  }

  resolveDecisionHpReplacement(enemy, skillId) {
    const skill = ENEMIES[enemy?.enemyId]?.skills?.find((candidate) => candidate.id === skillId);
    const rule = skill?.decisionHpReplacement;
    // Use current HP at the decision, never projected Healing or execution HP.
    if (rule?.skillId && Number(enemy?.hp) > Number(rule.aboveHp)) {
      return rule.skillId;
    }
    return skillId;
  }

  replaceIntentForSelfMissingHp(enemy) {
    const def = ENEMIES[enemy?.enemyId];
    const selectedSkill = def?.skills?.find((skill) => skill.id === enemy?.intent?.skillId);
    const rule = selectedSkill?.selfMissingHpReplacement;
    if (!rule?.skillId) return enemy?.intent ?? null;
    const projected = this.projectedState(enemy);
    const replacementSkillId = this.resolveDecisionHpReplacement(enemy, rule.skillId);
    if (replacementSkillId === "bloodPill" && Number.isFinite(projected.combatFlags?.bloodPillCarried)
      && Math.max(0, Math.floor(projected.combatFlags.bloodPillCarried)) <= 0) return enemy.intent;
    const chance = Math.max(0, Math.min(100,
      Math.max(0, Number(rule.baseChance) || 0)
      + this.selfMissingHpPercentSteps(projected, rule.step) * Math.max(0, Number(rule.chancePerStep) || 0)));
    if (rule.requireReplacementManaAvailable) {
      const replacement = def?.skills?.find((skill) => skill.id === replacementSkillId);
      if (!replacement || this.skillManaCost(replacement, projected) > Math.max(0, Math.floor(projected.mana ?? 0))) return enemy.intent;
    }
    if (chance <= 0 || !this.app.rng.chance(chance)) return enemy.intent;
    enemy.intent = this.replaceIntentSkill(enemy, replacementSkillId);
    return enemy.intent;
  }

  replaceIntentForSelfQi(enemy) {
    const def = ENEMIES[enemy?.enemyId];
    const selectedSkill = def?.skills?.find((skill) => skill.id === enemy?.intent?.skillId);
    const rule = selectedSkill?.selfQiReplacement;
    if (!rule?.skillId) return enemy?.intent ?? null;
    const projected = this.projectedState(enemy);
    const qi = Math.max(0, Math.floor(projected.qi ?? 0));
    const chance = Math.max(0, Math.min(100, qi * Math.max(0, Number(rule.chancePerPoint) || 0)));
    if (chance <= 0 || !this.app.rng.chance(chance)) return enemy.intent;
    enemy.intent = this.replaceIntentSkill(enemy, rule.skillId);
    return enemy.intent;
  }

  replaceIntentForSelfCombatFlag(enemy) {
    const def = ENEMIES[enemy?.enemyId];
    const selectedSkill = def?.skills?.find((skill) => skill.id === enemy?.intent?.skillId);
    if (!selectedSkill) return enemy?.intent ?? null;
    const flags = enemy.combatFlags ?? {};
    const singleActive = Boolean(selectedSkill.replaceIfSelfCombatFlag && flags[selectedSkill.replaceIfSelfCombatFlag]);
    const anyActive = Array.isArray(selectedSkill.replaceIfSelfCombatFlags)
      && selectedSkill.replaceIfSelfCombatFlags.some((flag) => flags[flag]);
    if (!singleActive && !anyActive) return enemy.intent;
    const projected = this.projectedState(enemy);
    if (Number.isFinite(selectedSkill.replacementMinSelfQiExclusive)
      && Math.max(0, Math.floor(projected.qi ?? 0)) <= Number(selectedSkill.replacementMinSelfQiExclusive)) return enemy.intent;
    const replacementChance = Number.isFinite(selectedSkill.replacementChance)
      ? Math.max(0, Math.min(100, Number(selectedSkill.replacementChance)))
      : 100;
    if (replacementChance < 100 && !this.app.rng.chance(replacementChance)) return enemy.intent;
    let replacementSkillId = null;
    if (singleActive) {
      replacementSkillId = selectedSkill.replacementSkillId ?? null;
      if (!replacementSkillId) {
        const pool = Array.isArray(selectedSkill.replacementSkillIds) ? selectedSkill.replacementSkillIds.filter(Boolean) : [];
        replacementSkillId = pool.length ? (this.app.rng.pick?.(pool) ?? pool[0]) : null;
      }
    } else {
      const pool = Array.isArray(selectedSkill.replacementSkillIds) ? selectedSkill.replacementSkillIds.filter(Boolean) : [];
      replacementSkillId = pool.length ? (this.app.rng.pick?.(pool) ?? pool[0]) : (selectedSkill.replacementSkillId ?? null);
    }
    replacementSkillId = this.resolveDecisionHpReplacement(enemy, replacementSkillId);
    if (replacementSkillId === "bloodPill" && Number.isFinite(projected.combatFlags?.bloodPillCarried)
      && Math.max(0, Math.floor(projected.combatFlags.bloodPillCarried)) <= 0) return enemy.intent;
    if (replacementSkillId) enemy.intent = this.replaceIntentSkill(enemy, replacementSkillId);
    return enemy.intent;
  }

  chooseSkill(enemy) {
    const def = ENEMIES[enemy.enemyId];
    this.prepareTurnStartManaFlow(enemy);
    const projected = this.projectedState(enemy);
    const resolveReplacement = (skill) => {
      if (Number.isFinite(skill?.replaceIfSelfSenseBelow)
        && Math.max(0, Math.floor(projected.sense ?? 0)) < Math.max(0, Number(skill.replaceIfSelfSenseBelow))) {
        const replacement = def.skills.find((candidate) => candidate.id === skill.replacementSkillId);
        if (replacement) return replacement;
      }
      return skill;
    };

    // The Hidden Sword Peak rookie's skill #1 is one mutually-exclusive consumable
    // branch. Check Lock-Life -> Spirit-Qi -> Heaven-Sword in that exact priority;
    // if the chosen branch fails its roll, continue immediately from ordinary skill #2.
    if (enemy.enemyId === "hiddenSwordOuterDisciple") {
      const uses = projected.combatFlags?.skillUseCounts ?? {};
      const livingCount = (this.app.state?.combat?.enemies ?? []).filter((unit) => unit.hp > 0).length;
      let special = null;
      let chance = 0;
      if (projected.hp <= 30 && Math.max(0, uses.rookieLifeLockPill ?? 0) < 1) {
        special = def.skills.find((skill) => skill.id === "rookieLifeLockPill"); chance = 100;
      } else if (projected.mana === 0 && Math.max(0, uses.rookieQiPill ?? 0) < 1) {
        special = def.skills.find((skill) => skill.id === "rookieQiPill"); chance = 25;
      } else if (livingCount < 3 && Math.max(0, uses.rookieSwordTalisman ?? 0) < 2) {
        special = def.skills.find((skill) => skill.id === "rookieSwordTalisman"); chance = 75;
      }
      if (special && this.app.rng.chance(chance)) return { skillId: special.id, projected };
    }

    for (let pass = 0; pass < 10; pass += 1) {
      for (const skill of def.skills) {
        if (skill.decisionFallbackOnly || skill.decisionReplacementOnly) continue;
        if (skill.rookieSkillOneLogic) continue;
        const cost = this.skillManaCost(skill, projected);
        if (cost > projected.mana) {
          if (skill.noManaDecisionFallbackSkillId) {
            const fallback = def.skills.find((candidate) => candidate.id === skill.noManaDecisionFallbackSkillId);
            if (fallback && this.skillManaCost(fallback, projected) <= projected.mana) return { skillId: fallback.id, projected };
          }
          continue;
        }
        const chance = this.skillChance(skill, projected);
        if (this.app.rng.chance(chance)) {
          let resolved = resolveReplacement(skill);
          if (resolved?.randomReplacementSkillId) {
            let replacementChance = Number(resolved.randomReplacementChance ?? 0);
            if (resolved.randomReplacementChanceFromSelfStatus?.status) {
              replacementChance += getStatus(projected, resolved.randomReplacementChanceFromSelfStatus.status)
                * Number(resolved.randomReplacementChanceFromSelfStatus.perStack ?? 0);
            }
            replacementChance = Math.max(0, Math.min(100, replacementChance));
            if (replacementChance > 0 && this.app.rng.chance(replacementChance)) {
              const replacement = def.skills.find((candidate) => candidate.id === resolved.randomReplacementSkillId);
              if (replacement) resolved = replacement;
            }
          }
          return { skillId: this.resolveDecisionHpReplacement(enemy, resolved.id), projected };
        }
      }
    }
    // Locked Ghost Flash cannot reappear through the ordinary final fallback.
    const fallback = enemy.enemyId === "zhengyangLeftProtector" && projected.combatFlags?.leftGhostDecisionLock
      ? def.skills[0]
      : def.skills.find((skill) => skill.decisionFallbackOnly) ?? def.skills[def.skills.length - 1];
    return { skillId: this.resolveDecisionHpReplacement(enemy, fallback.id), projected };
  }

  dynamicIronBoneDamageBonus(enemy) {
    if (!enemy?.combatFlags?.ironBoneActive) return 0;
    const maxHp = Math.max(1, Math.floor(enemy.maxHp ?? 1));
    const hp = Math.max(0, Math.min(maxHp, Math.floor(enemy.hp ?? 0)));
    return 3 + Math.floor((maxHp - hp) * 10 / maxHp);
  }

  ironBoneDamageBonus(enemy) {
    if (!enemy?.combatFlags?.ironBoneActive) return 0;
    const locked = enemy.kind === "enemy" ? enemy.intent?.lockedIronBoneBonus : null;
    return Number.isFinite(locked)
      ? Math.max(0, Math.floor(locked))
      : this.dynamicIronBoneDamageBonus(enemy);
  }

  lockIronBoneIntent(enemy) {
    const def = ENEMIES[enemy?.enemyId];
    const skill = def?.skills?.find((candidate) => candidate.id === enemy?.intent?.skillId);
    if (!enemy?.intent || !enemy.combatFlags?.ironBoneActive || !skill?.tags?.includes("martial")) return null;
    if (Number.isFinite(enemy.intent.lockedIronBoneBonus)) return Math.max(0, Math.floor(enemy.intent.lockedIronBoneBonus));
    // Intent selection already previews the upcoming turn-start state. Capture
    // that exact HP-based Iron Bone bonus once, after every forced replacement,
    // so later player damage/healing cannot rewrite either the displayed number
    // or the damage eventually dealt by this planned action.
    const projected = this.projectedState(enemy);
    const bonus = this.dynamicIronBoneDamageBonus(projected);
    const decidedHits = enemy.enemyId === "zhengyangLeftProtector" && skill.id === "inchPunchPlus"
      ? enemy.intent.preview?.hits ?? leftProtectorInchPunchHits(enemy) : null;
    enemy.intent.lockedIronBoneBonus = bonus;
    enemy.intent.preview = this.previewFor(projected, skill);
    if (decidedHits !== null) enemy.intent.preview.hits = decidedHits;
    return bonus;
  }

  previewFor(enemy, skill) {
    if (!skill) return null;
    if (skill.intentUnknownDamage) return { type: "attackUnknown" };
    if (skill.type === "attack") {
      const damageEffect = skill.effects.find((effect) => effect.type === "damage" && effect.target !== "self");
      if (!damageEffect) return null;
      let damage = typeof damageEffect.amount === "number"
        ? damageEffect.amount
        : this.app.effects.resolveAmount(damageEffect.amount, enemy);
      if (enemy.enemyId === "zhengyangLeftProtector" && skill.id === "frenzyPalmPlus"
        && Number.isFinite(enemy.combatFlags?.leftProtectorHeartBeforeFlare)) {
        damage = 7 + Math.max(0, Math.floor(enemy.combatFlags.leftProtectorHeartBeforeFlare)) * 3;
      }
      let hits = Array.isArray(damageEffect.repeatRange)
        ? damageEffect.repeatRange.join("~") : damageEffect.repeat ?? 1;
      if (enemy.enemyId === "zhengyangLeftProtector" && skill.id === "inchPunchPlus") {
        hits = leftProtectorInchPunchHits(enemy);
      }
      if (skill.packSkillOne && enemy.combatFlags?.wolfHowlActive) damage += 2;
      if (skill.repeatFromFlag) hits += Math.max(0, Math.floor(enemy.combatFlags?.[skill.repeatFromFlag] ?? 0));
      if (skill.swordIntentScaling) damage += getStatus(enemy, "swordIntent");
      if (skill.tags?.includes("martial")) {
        damage += this.ironBoneDamageBonus(enemy);
        if (enemy.kind === "enemy") damage += Math.max(0, Math.floor(enemy.combatFlags?.enemyMartialBurst?.bonus ?? 0));
      }
      return {
        type: "attack", damage, hits,
        ignoreGuard: Boolean(damageEffect.ignoreGuard),
        ignoreQi: Boolean(damageEffect.ignoreQi),
      };
    }
    if (skill.type === "defense") {
      const qi = skill.effects.find((effect) => effect.type === "gainQi");
      if (qi) return { type: "defense", resource: "qi", amount: typeof qi.amount === "number"
        ? qi.amount : (this.app.effects?.resolveAmount?.(qi.amount, enemy)
          ?? Math.max(0, Math.floor((enemy?.[qi.amount?.sourceStat] ?? 0) * (qi.amount?.mult ?? 1) + (qi.amount?.add ?? 0)))) };
      const guard = skill.effects.find((effect) => effect.type === "gainGuard");
      if (guard) return {
        type: "defense", resource: "guard", amount: typeof guard.amount === "number" ? guard.amount : 0,
        allEnemies: guard.target === "allEnemies",
      };
    }
    return { type: skill.type ?? "support" };
  }

  liveIntentPreview(enemy, skill) {
    const announced = enemy?.intent?.preview;
    if (announced?.type !== "attack" || !skill) return announced;
    const liveHeartDemon = enemy.enemyId === "zhengyangLeftProtector" && skill.id === "frenzyPalmPlus";
    const liveSwordIntent = ["pursuerSword", "pursuerElite"].includes(enemy.enemyId) && skill.swordIntentScaling;
    if (!liveHeartDemon && !liveSwordIntent) return announced;
    // Only the displayed damage changes. In particular, Inch Punch hit count
    // and all other predicted effects keep their original decision-time value.
    return { ...announced, damage: this.previewFor(enemy, skill).damage };
  }

  replaceIntentSkill(enemy, skillId) {
    const def = ENEMIES[enemy?.enemyId];
    if (!enemy || !def) return enemy?.intent ?? null;
    const projected = this.projectedState(enemy);
    const resolvedId = this.resolveDecisionHpReplacement(enemy, skillId);
    const skill = def.skills.find((candidate) => candidate.id === resolvedId);
    if (!skill) return enemy?.intent ?? null;
    const previous = enemy.intent ?? {};
    const decidedHits = enemy.enemyId === "zhengyangLeftProtector" && skill.id === "inchPunchPlus"
      ? leftProtectorInchPunchHits(enemy) : null;
    const preview = this.previewFor(projected, skill);
    if (decidedHits !== null) preview.hits = decidedHits;
    return {
      ...previous,
      skillId: skill.id,
      preview,
      adaptiveTalismanChoice: null,
      displayNameKey: decidedHits !== null ? `skill.zhengyang.leftInchPunch${decidedHits}` : null,
    };
  }

  generateIntent(enemy) {
    const def = ENEMIES[enemy.enemyId];
    const choice = this.chooseSkill(enemy);
    const skill = def.skills.find((s) => s.id === this.resolveDecisionHpReplacement(enemy, choice.skillId));
    // Intent prediction is resolved independently of Tianji Compass. The artifact
    // gets a separate once-per-round pass after the normal prediction has already
    // appeared on screen, so an initial “unable to predict” result can visibly be
    // overwritten by the artifact half a second later.
    const adaptiveTalismanChoice = skill.adaptiveTalismanIntent ? this.chooseAdaptiveTalisman(choice.projected) : null;
    const hiddenChance = GRADE_RULES[enemy.grade].hiddenIntent;
    const hidden = this.app.rng.chance(hiddenChance);
    const decidedHits = enemy.enemyId === "zhengyangLeftProtector" && skill.id === "inchPunchPlus"
      ? leftProtectorInchPunchHits(enemy) : null;
    const preview = this.previewFor(choice.projected, skill);
    if (decidedHits !== null) preview.hits = decidedHits;
    return {
      skillId: skill.id,
      hidden,
      revealed: !hidden,
      preview,
      adaptiveTalismanChoice,
      displayNameKey: adaptiveTalismanChoice ? this.adaptiveTalismanNameKey(adaptiveTalismanChoice)
        : decidedHits !== null ? `skill.zhengyang.leftInchPunch${decidedHits}` : null,
    };
  }
}
