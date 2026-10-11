import { recordPursuitRule } from "./pursuit-results.js?v=v0.3.88";
import { CARDS, CARD_UPGRADES } from "../data/cards.js?v=v0.3.88";
import { ENEMIES, GRADE_RULES, leftProtectorInchPunchHits } from "../data/enemies.js?v=v0.3.88";
import { ENCOUNTER_TABLES } from "../data/encounters.js?v=v0.3.88";
import { MAP_NODES } from "../data/map-data.js?v=v0.3.88";
import { ARTIFACTS } from "../data/artifacts.js?v=v0.3.88";
import { getStatus, startTurnCommon, endTurnCommonWithFeedback, addStatus, removeStatus, resolveHeartDemon, statusResistance, syncBuffOrder, clearGuard, gainGuard, consumeConcentrationOnHpLoss, clearDarkForce, setMana, canTriggerWindRaccoonBody } from "./status.js?v=v0.3.88";
import { beginZeroHpPause, waitForZeroHpPause } from "./lethal.js?v=v0.3.88";
import { resetCombatVisualEpoch } from "./combat-visuals.js?v=v0.3.88";
import { appendCardInstance, addInventoryItem, addCardUseCount, reducePursuitValue, combatDeckUids, removeSealedCardsFromCombat } from "./state.js?v=v0.3.88";
import { grantArtifactWithTutorial } from "./tutorials.js?v=v0.3.88";
import { ensureRunRecords, recordBattleStart, recordBattleOutcome, recordEnemyDefeat, recordEscapeFailure, recordPlayerCardUse, recordCombatDamage, recordPursuitPeak, finishRoundDamage, recordArtifactTrigger, recordStoneGain, recoveredVictoryStones } from "./run-records.js?v=v0.3.88";

export const OPENING_BATTLE_NODES = new Set(["1A", "1B", "1C"]);

export function isOpeningWolfCombat(combat) {
  return Boolean(combat && !combat.debugEncounter && !combat.pursuit && OPENING_BATTLE_NODES.has(combat.nodeId)
    && combat.enemies?.length === 1 && combat.enemies[0].enemyId === "wolf");
}

function uid(prefix, rng) { return `${prefix}-${Math.floor(rng.next()*1e9).toString(36)}`; }

const GRADE_RANK = { D: 1, C: 2, B: 3, A: 4 };
const EARTH_ESCAPE_CHANCE = { D: 75, C: 50, B: 25, A: 0 };
const ORDINARY_FLEE_CHANCE = { D: 70, C: 45, B: 20, A: 0 };
const isSwordSpellCard = (card) => Boolean(card?.type === "spell" && card?.tags?.includes("sword"));
const isThunderSpellCard = (card) => Boolean(card?.type === "spell" && card?.tags?.includes("thunder"));
// Sword God now modifies hit counts in EffectEngine, using the same Sword tag
// as Sword Intent. It never changes a card's target selection or reaction list;
// Secret Arts, existing barrages and future tagged attacks share that one path.

export class CombatEngine {
  constructor(app) { this.app = app; this.ai = app.enemyAI; }

  leftProtectorGiftCount(player) {
    const maxHp = Math.max(1, Math.floor(Number(player?.maxHp) || 1));
    const hp = Math.max(0, Math.min(maxHp, Math.floor(Number(player?.hp ?? maxHp))));
    const steps = Math.floor((maxHp - hp) * 100 / (18 * maxHp) + 1e-9);
    return Math.min(6, 1 + steps);
  }

  addLog(key, params = {}) {
    const log = this.app.state?.combat?.log;
    if (!log) return;
    log.push({ key, params });
  }

  duplicateSuffixKey(enemy) {
    if (enemy?.combatFlags?.gateAwakened && enemy.gateSummonOrdinal >= 1 && enemy.gateSummonOrdinal <= 10) {
      return `enemy.duplicateSuffix.${enemy.gateSummonOrdinal}`;
    }
    if (!enemy || (enemy.duplicateCount ?? 1) <= 1) return null;
    return `enemy.duplicateSuffix.${Math.max(1, enemy.duplicateIndex ?? 1)}`;
  }

  rookieCombatDisplayNameKey(enemyId, chapterIndex = 1) {
    const chapter = Math.max(1, Math.floor(Number(chapterIndex) || 1));
    const trueNameKeys = {
      hiddenSwordOuterDisciple: "enemy.rookie.peiben.name",
      fiveElementsOuterDisciple: "enemy.rookie.aqiao.name",
      zhengyangOuterDisciple: "enemy.rookie.hanping.name",
    };
    const aliasNameKeys = {
      hiddenSwordOuterDisciple: "enemy.rookie.brocadeYoungMaster.name",
      fiveElementsOuterDisciple: "enemy.rookie.plainCladGirl.name",
      zhengyangOuterDisciple: "enemy.rookie.coarseCladBoy.name",
    };
    if (!trueNameKeys[enemyId]) return null;
    // Chapter 1 uses descriptive aliases rather than exposing sect ranks or real
    // names. Later chapters progressively replace those aliases with true names.
    const revealChapter = {
      fiveElementsOuterDisciple: 2,
      hiddenSwordOuterDisciple: 3,
      zhengyangOuterDisciple: 4,
    };
    return chapter >= revealChapter[enemyId] ? trueNameKeys[enemyId] : aliasNameKeys[enemyId];
  }

  unitRef(unit) {
    if (unit?.kind === "player") return { i18nKey: "combat.actor.player" };
    return {
      i18nKey: unit?.displayNameKey ?? unit?.nameKey ?? "combat.actor.unknown",
      suffixKey: this.duplicateSuffixKey(unit),
    };
  }

  nameRef(i18nKey, suffix = "") { return { i18nKey, suffix }; }

  ensureEnemyDuplicateLabels() {
    const enemies = this.app.state?.combat?.enemies ?? [];
    const counts = new Map();
    for (const enemy of enemies) counts.set(enemy.nameKey, (counts.get(enemy.nameKey) ?? 0) + 1);
    const seen = new Map();
    for (const enemy of enemies) {
      const count = counts.get(enemy.nameKey) ?? 1;
      const next = (seen.get(enemy.nameKey) ?? 0) + 1;
      seen.set(enemy.nameKey, next);
      enemy.duplicateCount = count;
      enemy.duplicateIndex ??= next;
    }
  }

  initialEnemyCombatFlags(def) {
    const flags = {};
    const range = def?.startingBloodPillsRange;
    if (Array.isArray(range) && range.length >= 2) {
      const min = Math.max(0, Math.floor(Math.min(range[0], range[1])));
      const max = Math.max(min, Math.floor(Math.max(range[0], range[1])));
      flags.bloodPillCarried = this.app.rng.int(min, max);
    }
    return flags;
  }

  consumeEnemyBloodPill(enemy) {
    if (!enemy || !["zhengyangDisciple", "zhengyangElite", "zhengyangChief"].includes(enemy.enemyId)) return;
    if (!Number.isFinite(enemy.combatFlags?.bloodPillCarried)) return;
    enemy.combatFlags.bloodPillCarried = Math.max(0, Math.floor(enemy.combatFlags.bloodPillCarried) - 1);
  }

  createSummonedEnemy(enemyId) {
    const def = ENEMIES[enemyId];
    if (!def) return null;
    const rollStat = (base, range) => Array.isArray(range) && range.length >= 2
      ? this.app.rng.int(Math.min(range[0], range[1]), Math.max(range[0], range[1]))
      : base;
    const rolledMaxHp = rollStat(def.maxHp, def.hpRange);
    const rolledSpeed = rollStat(def.speed, def.speedRange);
    return {
      uid: uid(enemyId, this.app.rng), enemyId, kind: "enemy", isSummoned: true,
      nameKey: def.nameKey, grade: def.grade, humanoid: def.humanoid, nonliving: Boolean(def.nonliving), evasion: def.evasion ?? 0,
      hp: rolledMaxHp, maxHp: rolledMaxHp,
      mana: def.maxMana, maxMana: def.maxMana,
      sense: def.sense, maxSense: def.sense, speed: rolledSpeed,
      qi: 0, guard: 0,
      statuses: structuredClone(def.startingStatuses ?? {}),
      buffOrder: Object.entries(def.startingStatuses ?? {}).filter(([, stacks]) => stacks > 0).map(([key]) => key),
      resist: structuredClone(def.resist ?? {}), combatFlags: this.initialEnemyCombatFlags(def), intent: null,
    };
  }

  summonStoneGolemRightOf(source) {
    const c = this.app.state?.combat;
    if (!c || !source || source.hp <= 0) return null;
    const livingGolems = c.enemies.filter((unit) => unit.hp > 0 && unit.enemyId === "stoneGolem").length;
    if (livingGolems >= 2) return null;
    const summoned = this.createSummonedEnemy("stoneGolem");
    if (!summoned) return null;
    source.combatFlags ??= {};
    const ordinal = Math.max(0, Math.floor(source.combatFlags.gateAwakenSuccessCount ?? 0)) + 1;
    summoned.combatFlags.gateAwakened = true;
    summoned.gateSummonOrdinal = ordinal;
    const sourceIndex = Math.max(0, c.enemies.findIndex((unit) => unit.uid === source.uid));
    c.enemies.splice(sourceIndex + 1, 0, summoned);
    const sourceOrderIndex = c.enemyTurnOrder.indexOf(source.uid);
    if (sourceOrderIndex >= 0) c.enemyTurnOrder.splice(sourceOrderIndex + 1, 0, summoned.uid);
    else c.enemyTurnOrder.push(summoned.uid);
    const petrify = ENEMIES.stoneGolem.skills.find((skill) => skill.id === "petrify");
    const projected = this.ai.projectedState(summoned);
    summoned.intent = {
      skillId: "petrify", hidden: false, revealed: true,
      preview: this.ai.previewFor(projected, petrify), adaptiveTalismanChoice: null, displayNameKey: null,
    };
    c.pendingImmediateEnemyUids ??= [];
    c.pendingImmediateEnemyUids.push(summoned.uid);
    source.combatFlags.gateAwakenSuccessCount = ordinal;
    this.ensureEnemyDuplicateLabels();
    this.app.render?.();
    return summoned;
  }

  async handleGateDeathLinkBreak(gate, { ignoreUndying = false } = {}) {
    const c = this.app.state?.combat;
    if (!c || gate?.enemyId !== "gate" || gate.hp > 0 || !c.enemies?.includes(gate)) return 0;
    // A recoverable zero is not a death. Sword God executions explicitly bypass
    // Undying, while Wind Raccoon recovery retains its existing precedence.
    const recoveryPending = () => canTriggerWindRaccoonBody(gate)
      || (!ignoreUndying && getStatus(gate, "undying") > 0);
    if (recoveryPending()) return 0;
    this.gateDeathLinks ??= new WeakMap();
    if (this.gateDeathLinks.has(gate)) return this.gateDeathLinks.get(gate);
    const pending = (async () => {
      await waitForZeroHpPause(this.app, gate);
      if (this.app.state?.combat !== c || gate.hp > 0 || recoveryPending()) return 0;
      const feedback = [];
      let affected = 0;
      for (const golem of c.enemies ?? []) {
        if (golem.enemyId !== "stoneGolem" || golem.hp <= 0) continue;
        const beforeHp = Math.max(0, Math.floor(golem.hp ?? 0));
        beginZeroHpPause(this.app, golem);
        golem.hp = 0;
        beginZeroHpPause(this.app, golem);
        recordCombatDamage(this.app.state, golem, beforeHp, 0);
        consumeConcentrationOnHpLoss(golem, beforeHp);
        this.addLog("combat.log.gateDisconnect", { target: this.unitRef(golem), gate: this.nameRef("enemy.gate.name"), damage: beforeHp });
        this.app.audio?.playEnemyHit?.(golem);
        feedback.push(this.app.showDamagePopup?.(golem, beforeHp, { duration: 560 }),
          this.app.effects.waitForLethalResolution(golem), this.app.startEnemyDeathFx?.(golem));
        affected += 1;
      }
      await Promise.all(feedback);
      return affected;
    })();
    this.gateDeathLinks.set(gate, pending);
    try { return await pending; }
    finally { this.gateDeathLinks.delete(gate); }
  }

  async endTurnWithFeedback(unit) {
    beginZeroHpPause(this.app, unit);
    return endTurnCommonWithFeedback(unit, {
      rng: this.app.rng,
      onResourceGain: (status, amount) => this.app.showStatusPopup?.(unit, status, true, amount),
      onStep: async (step) => {
        if (step.type === "windRecovery") return this.app.effects.finalizeWindRaccoonBodyIfNeeded(unit);
        if (step.type !== "damage") return null;
        this.app.effects.beginZeroHpPause(unit);
        recordCombatDamage(this.app.state, unit, step.beforeHp, step.afterHp);
        this.addLog(step.burnIgnited ? "combat.log.burnIgnite" : "combat.log.statusDamage", step.burnIgnited ? {
          target: this.unitRef(unit), stacks: step.burnStacks, damage: step.damage,
        } : {
          target: this.unitRef(unit), status: this.nameRef(`status.${step.status}`),
          damage: step.damage, before: step.beforeHp, after: step.afterHp,
        });
        const recoveryPending = this.app.effects.canTriggerWindRaccoonBody(unit)
          || (step.status === "burn" && this.app.effects.canTriggerNirvanaFromBurn(unit, step.burnStacks))
          || this.app.effects.canTriggerUndying(unit);
        const deathFx = step.beforeHp > 0 && step.afterHp <= 0 && unit.kind !== "player" && !recoveryPending
          ? this.app.startEnemyDeathFx?.(unit) : null;
        if (step.damage > 0) this.app.audio.playEnemyHit?.(unit);
        await this.app.showDamagePopup?.(unit, step.damage, { duration: 560 });
        await this.app.effects.waitForLethalResolution(unit, {
          pendingWindRaccoonBody: this.app.effects.canTriggerWindRaccoonBody(unit),
          pendingUndying: this.app.effects.canTriggerUndying(unit),
          pendingNirvana: step.status === "burn" && this.app.effects.canTriggerNirvanaFromBurn(unit, step.burnStacks),
        });
        if (deathFx) await deathFx;
        return null;
      },
    });
  }

  preservePersistentPlayerStatuses() {
    const player = this.app.state?.player;
    if (!player) return;
    const heart = getStatus(player, "heartDemon");
    player.statuses = heart > 0 ? { heartDemon: heart } : {};
    player.buffOrder = heart > 0 ? ["heartDemon"] : [];
  }

  clearTemporaryBodyCombatEffects() {
    const player = this.app.state?.player;
    if (!player) return;
    const flags = player.combatFlags ?? {};
    if (flags.ironBoneHardnessGranted) removeStatus(player, "hardness", flags.ironBoneHardnessGranted);
    for (const key of ["martialBurst", "ironBoneActive", "ironBoneHardnessGranted", "mountainCounter", "ghostFlash", "huntian"]) {
      if (key in flags) delete flags[key];
    }
  }

  buildEnemyTurnOrder() {
    const c = this.app.state?.combat;
    if (!c) return [];
    const randomized = this.app.rng.shuffle(this.getLivingEnemies());
    randomized.sort((a, b) => b.speed - a.speed);

    // A dead enemy can remain visible briefly while its final HP popup finishes.
    // Preserve that corpse's current visual slot while reordering only living
    // enemies; otherwise the dead card falls to the end of the sort and visibly
    // slides across the row immediately before disappearing.
    const allUids = c.enemies.map((enemy) => enemy.uid);
    const previous = (c.enemyTurnOrder?.length ? c.enemyTurnOrder : allUids)
      .filter((uid) => allUids.includes(uid));
    for (const uidValue of allUids) if (!previous.includes(uidValue)) previous.push(uidValue);
    const deadUids = new Set(c.enemies.filter((enemy) => enemy.hp <= 0).map((enemy) => enemy.uid));
    const livingUids = randomized.map((enemy) => enemy.uid);
    let livingIndex = 0;
    c.enemyTurnOrder = previous.map((uidValue) => {
      if (deadUids.has(uidValue)) return uidValue;
      const next = livingUids[livingIndex];
      livingIndex += 1;
      return next;
    }).filter(Boolean);
    while (livingIndex < livingUids.length) {
      c.enemyTurnOrder.push(livingUids[livingIndex]);
      livingIndex += 1;
    }
    return randomized;
  }

  isCardInputLocked() {
    const c = this.app.state?.combat;
    return Boolean(c && (c.phase !== "player" || c.dealingCards || c.cardResolving || Date.now() < (c.cardPlayLockUntil ?? 0)));
  }

  armCardPlayCooldown(duration = 444) {
    const c = this.app.state?.combat;
    if (!c) return;
    c.cardResolving = true;
    c.cardPlayLockUntil = Math.max(c.cardPlayLockUntil ?? 0, Date.now() + duration);
  }

  releaseCardPlayCooldown(combatRef) {
    if (!combatRef || this.app.state?.combat !== combatRef) return;
    combatRef.cardResolving = false;
    const remaining = Math.max(0, (combatRef.cardPlayLockUntil ?? 0) - Date.now());
    if (remaining <= 0) {
      this.app.render();
      return;
    }
    setTimeout(() => {
      if (this.app.state?.combat === combatRef && !combatRef.cardResolving && Date.now() >= (combatRef.cardPlayLockUntil ?? 0)) this.app.render();
    }, remaining + 8);
  }

  resolveEnemySkillEffects(enemy, skill) {
    const effects = structuredClone(skill?.effects ?? []);
    if (!enemy || !skill) return effects;
    if (enemy.enemyId === "zhengyangLeftProtector" && skill.id === "frenzyPalmPlus"
      && Number.isFinite(enemy.combatFlags?.leftProtectorHeartBeforeFlare)) {
      const damage = effects.find((effect) => effect.type === "damage" && effect.target !== "self");
      if (damage) damage.amount = 7 + Math.max(0, Math.floor(enemy.combatFlags.leftProtectorHeartBeforeFlare)) * 3;
    }
    if (enemy.enemyId === "zhengyangLeftProtector" && skill.id === "inchPunchPlus") {
      const damage = effects.find((effect) => effect.type === "damage" && effect.target !== "self");
      if (damage) damage.repeat = Number.isFinite(enemy.intent?.preview?.hits)
        ? Math.max(2, Math.min(6, Math.floor(enemy.intent.preview.hits)))
        : leftProtectorInchPunchHits(enemy);
    }
    if (enemy.enemyId === "evilAlchemist" && skill.id === "goldLight") {
      const qiEffect = effects.find((effect) => effect.type === "gainQi");
      if (qiEffect && Number.isFinite(enemy.intent?.preview?.amount)) {
        qiEffect.amount = Math.max(0, Math.floor(enemy.intent.preview.amount));
      }
    }
    if (skill.packSkillOne && enemy.combatFlags?.wolfHowlActive) {
      for (const effect of effects) if (effect.type === "damage" && effect.target !== "self" && typeof effect.amount === "number") effect.amount += 2;
    }
    if (skill.repeatFromFlag) {
      const bonus = Math.max(0, Math.floor(enemy.combatFlags?.[skill.repeatFromFlag] ?? 0));
      for (const effect of effects) if (effect.type === "damage" && effect.target !== "self") effect.repeat = (effect.repeat ?? 1) + bonus;
    }
    if (skill.swordIntentScaling) {
      const bonus = getStatus(enemy, "swordIntent");
      if (bonus > 0) {
        for (const effect of effects) {
          if (effect.type === "damage" && effect.target !== "self" && typeof effect.amount === "number") effect.amount += bonus;
        }
      }
    }
    return effects;
  }

  getCardPlayError(cardUid, targetUid = null) {
    const state = this.app.state;
    const c = state?.combat;
    if (!c || c.phase !== "player" || !c.hand.includes(cardUid)) return null;
    const inst = this.findCardInstance(cardUid);
    const card = inst ? CARDS[inst.cardId] : null;
    if (!card) return null;
    if (state.player.mana < this.getCardManaCost(inst)) return "combat.noMana";
    if (card.target === "enemy" && !this.app.findEnemy(targetUid ?? c.selectedEnemyId)) return "combat.selectEnemy";
    return null;
  }

  async startEncounter(tableId, { pursuit = false, nodeId = null, debugEncounter = false, returnScreen = null, excludeEnemyIds = [] } = {}) {
    const state = this.app.state;
    if (pursuit) {
      state.map.pursuitStealth = 0;
      if (state.map.pendingSenseRecoveryNode) state.map.pendingMoveHadPursuit = true;
    }
    const excluded = new Set(Array.isArray(excludeEnemyIds) ? excludeEnemyIds.filter(Boolean) : []);
    const rawGroups = ENCOUNTER_TABLES[tableId] ?? [];
    const availableGroups = excluded.size
      ? rawGroups.filter((formation) => !formation.some((enemyId) => excluded.has(enemyId)))
      : rawGroups;
    const group = this.app.rng.pick(availableGroups.length ? availableGroups : rawGroups);
    const rollStat = (base, range) => Array.isArray(range) && range.length >= 2
      ? this.app.rng.int(Math.min(range[0], range[1]), Math.max(range[0], range[1]))
      : base;
    const enemies = group.map((enemyId) => {
      const def = ENEMIES[enemyId];
      const rolledMaxHp = rollStat(def.maxHp, def.hpRange);
      const rolledSpeed = rollStat(def.speed, def.speedRange);
      return {
        uid: uid(enemyId, this.app.rng), enemyId, kind: "enemy",
        nameKey: def.nameKey, displayNameKey: this.rookieCombatDisplayNameKey(enemyId, state.run?.chapterIndex), grade: def.grade, humanoid: def.humanoid, nonliving: Boolean(def.nonliving), evasion: def.evasion ?? 0,
        hp: rolledMaxHp, maxHp: rolledMaxHp,
        mana: def.maxMana, maxMana: def.maxMana,
        sense: def.sense, maxSense: def.sense, speed: rolledSpeed,
        qi: 0, guard: 0,
        statuses: structuredClone(def.startingStatuses ?? {}),
        buffOrder: Object.entries(def.startingStatuses ?? {}).filter(([, stacks]) => stacks > 0).map(([key]) => key),
        resist: structuredClone(def.resist ?? {}), combatFlags: this.initialEnemyCombatFlags(def), intent: null,
      };
    });

    const combatDeck = combatDeckUids(state.player);
    const rookieIds = new Set(["hiddenSwordOuterDisciple", "fiveElementsOuterDisciple", "zhengyangOuterDisciple"]);
    const rookieSquadEncounter = group.length === 3 && group.every((enemyId) => rookieIds.has(enemyId));
    const chapter = Math.max(1, Math.min(4, Math.floor(Number(state.run?.chapterIndex) || 1)));
    state.map.rookieSquadPursuitStateByChapter ??= {};
    const rookieStateAtStart = state.map.rookieSquadPursuitStateByChapter[chapter] ?? "unseen";
    const rookieSquadFirstEncounter = Boolean(pursuit && rookieSquadEncounter && !debugEncounter && rookieStateAtStart === "unseen");
    // A first Rookie-Squad escape imposes exactly one real ordinary-pursuit gap.
    // Consume that gap only when another pursuit battle actually starts; merely
    // generating or displaying a pursuit prompt is not enough.
    if (pursuit && !rookieSquadEncounter && rookieStateAtStart === "escapedCooldown") {
      state.map.rookieSquadPursuitStateByChapter[chapter] = "escaped";
    }
    // Failed attempts retain their battle telemetry, but the opening aid lasts
    // until this run first wins the actual introductory Wolf at node 1A.
    const openingHandStyle = !state.run?.completed && !state.run?.openingWolfDefeated
      && isOpeningWolfCombat({ nodeId, pursuit, debugEncounter, enemies })
      ? state.player.styleId : null;
    state.combat = {
      nodeId, pursuit, encounterId: tableId, rookieSquadEncounter, rookieSquadFirstEncounter, debugEncounter: Boolean(debugEncounter), debugReturnScreen: debugEncounter ? (returnScreen ?? state.screen) : null, round: 0, phase: "dealing",
      draw: this.app.rng.shuffle(combatDeck), discard: [], hand: [],
      openingHandStyle, openingHandPrepared: false,
      enemies, selectedEnemyId: enemies.length === 1 ? enemies[0].uid : null, selectedCardId: null, selectedCardAt: 0, cardPlayLockUntil: 0, cardResolving: false,
      dealingCards: true, lastDealtCardUid: null, banished: [],
      log: [], firstPlayerTurn: true, loot: { stones: 0, items: {} }, lootGranted: false, result: null, enemyTurnOrder: [],
      fleeArtifactBonus: 0,
    };
    resetCombatVisualEpoch(state.combat);
    // Do not teach while encounter entry still owes its special opening dialog.
    this.app.tutorialEntryCombatRef = state.combat;
    this.app.tutorialAutoTurnRef = null;
    this.app.inventorySelectedId = null;
    this.app.resetTutorialIdle?.();
    recordBattleStart(state);
    this.ensureEnemyDuplicateLabels();
    state.player.kind = "player";
    state.player.qi = 0; state.player.guard = 0; this.preservePersistentPlayerStatuses(); state.player.combatFlags = {};
    state.player.mana = Math.max(0, state.player.mana ?? 0);

    // v0.2.52 keeps the 50ms + 1500ms visual/BGM timing from v0.2.51, but moves
    // the second combat cue to +666ms and lowers it to 0.33 gain.
    this.app.battleTransitionStage = "prelude";
    this.app.audio?.play?.("battleStart", .99);
    this.app.render?.();
    await (this.app.wait?.(50) ?? Promise.resolve());
    this.app.battleTransitionStage = "blur-out";
    this.app.audio?.setBgm?.(null);
    this.app.render?.();
    await (this.app.wait?.(616) ?? Promise.resolve());
    this.app.audio?.play?.("swordApproach", .33);
    await (this.app.wait?.(134) ?? Promise.resolve());
    state.screen = "combat";
    this.app.mapBattleTransitionSourceNodeId = null;
    // A map swipe that hides Chrome's address bar can leave the single-page
    // document scrolled when its DOM is replaced. Normalize that residue before
    // rendering; combat geometry itself is derived from the address-bar-visible
    // small viewport, independent of whether browser chrome is hidden right now.
    this.app.combatViewportSnapshot = null;
    this.app.combatEnemyLayout = null;
    globalThis.scrollTo?.(0, 0);
    if (globalThis.document?.documentElement) globalThis.document.documentElement.scrollTop = 0;
    if (globalThis.document?.body) globalThis.document.body.scrollTop = 0;
    this.app.battleTransitionStage = "focus-in";
    this.app.render?.();
    await (this.app.wait?.(500) ?? Promise.resolve());
    this.app.battleTransitionStage = "focus-in-bgm";
    const combatBgmId = enemies.some((enemy) => enemy.enemyId === "gate") ? "gateCombat" : "combat";
    if (combatBgmId === "gateCombat") {
      this.app.audio?.setBgm?.("gateCombat", .125);
      this.app.audio?.fadeBgmVolume?.(.25, 1000);
    } else {
      this.app.audio?.setBgm?.("combat", .125);
      this.app.audio?.fadeBgmVolume?.(.25, 1000);
    }
    await (this.app.wait?.(250) ?? Promise.resolve());
    this.app.battleTransitionStage = null;
    this.app.render?.();

    await this.startPlayerTurn();

    this.app.tutorialEntryCombatRef = null;
    if (state.screen === "combat") {
      if (tableId === "zhengyangLeftProtector" && state.combat) {
        state.combat.leftProtectorGiftCount = this.leftProtectorGiftCount(state.player);
        state.combat.leftProtectorGiftPrompt = true;
      }
      this.app.persist();
      this.app.render();
    }
  }

  dismissLeftProtectorGift() {
    const combat = this.app.state?.combat;
    if (!combat?.leftProtectorGiftPrompt || combat.encounterId !== "zhengyangLeftProtector") return false;
    combat.leftProtectorGiftPrompt = false;
    addInventoryItem(this.app.state.player, "bloodPill", combat.leftProtectorGiftCount ?? this.leftProtectorGiftCount(this.app.state.player));
    this.app.persist();
    this.app.render();
    return true;
  }

  findCardInstance(uidValue) { return this.app.state.player.deck.find((c) => c.uid === uidValue); }

  isSwordSpell(card) { return isSwordSpellCard(card); }

  isThunderSpell(card) { return isThunderSpellCard(card); }

  // Targeting remains data-driven under Sword God: the bonus belongs to each
  // attack sequence, not to enemy count. Keep discounts independent of repeats.

  getDisplayedCardManaCost(inst) {
    const snapshot = this.app.playedCardManaCost;
    const c = this.app.state?.combat;
    return snapshot?.combat === c && snapshot.cardUid === inst?.uid && c?.hand.includes(inst.uid)
      ? snapshot.cost : this.getCardManaCost(inst);
  }

  getCardManaCost(cardInstance, { includeTurnDiscount = true } = {}) {
    const card = cardInstance ? CARDS[cardInstance.cardId] : null;
    if (!card) return 0;
    // Once Lifeless Sword Domain is already active, every version of the card
    // becomes a zero-cost immediate pulse without replacing the active Domain.
    if (["swordDomain", "swordDomainPlus", "swordDomainPlusPlus"].includes(card.id) && getStatus(this.app.state?.player, "swordDomain") > 0) return 0;
    const upgrade = cardInstance.upgraded ? (CARD_UPGRADES[cardInstance.cardId] ?? {}) : {};
    let cost = Math.max(0, (card.cost ?? 0) + (upgrade.costDelta ?? 0));
    // Mysterious-Female Qi is normally free. On player rounds 2/4/8/16/...
    // its Mana cost becomes 1/2/4/8/... respectively. Base and + share the same
    // timing rule because + is the ordinary one-step Refine-Spirit upgrade.
    if (card.id === "xuanpinQi") {
      const round = Math.max(1, Math.floor(this.app.state?.combat?.round ?? 1));
      // The cost changes at rounds 2/4/8/16/... and keeps that value until
      // the next threshold: 0, 1,1, 2,2,2,2, 4...
      cost = round < 2 ? 0 : 2 ** Math.max(0, Math.floor(Math.log2(round)) - 1);
    }
    if (includeTurnDiscount && isSwordSpellCard(card)) {
      cost = Math.max(0, cost - Math.max(0, this.app.state?.player?.combatFlags?.swordSpellCostReduction ?? 0));
    }
    const player = this.app?.state?.player ?? this.state?.player;
    // Base Sword Control stores a persistent discount for the next Sword Control
    // card (either base or upgraded). It survives turns and ignores unrelated cards.
    if (includeTurnDiscount && card.id === "swordControl" && player?.combatFlags?.nextSwordControlCostReduction) {
      cost = Math.max(0, cost - Math.max(0, Math.floor(player.combatFlags.nextSwordControlCostReduction)));
    }
    // Sword Control+ stores a persistent discount for the next sword-school Spell.
    // It survives turns and is consumed only when a matching card is actually cast.
    if (includeTurnDiscount && isSwordSpellCard(card) && player?.combatFlags?.nextSwordSpellCostReduction) {
      cost = Math.max(0, cost - Math.max(0, Math.floor(player.combatFlags.nextSwordSpellCostReduction)));
    }
    // Water Dragon keeps a single "immediately after Thunder" window across
    // turns. Any successfully played intervening card cancels it; casting a new
    // Thunder Spell simply opens a fresh window.
    if (includeTurnDiscount && card.id === "waterDragon" && player?.combatFlags?.waterDragonAfterThunderDiscount) {
      cost = Math.max(0, cost - 1);
    }
    // Qian Kun One Qi caps the next Spell at 1 Mana instead of forcing it to 1:
    // an already-free Spell stays free, while any cost above 1 becomes 1.
    if (includeTurnDiscount && card.type === "spell" && Number.isFinite(player?.combatFlags?.nextSpellCostCap)) {
      cost = Math.min(cost, Math.max(0, Math.floor(player.combatFlags.nextSpellCostCap)));
    }
    // Stone Screen is explicitly free while the player is Burning. Its own wording is
    // a card-specific final exception, so Burning still reduces Qian Kun's exact 1 to 0.
    if (includeTurnDiscount && card.id === "stoneScreen" && getStatus(player, "burn") > 0) cost = Math.max(0, cost - 1);
    return cost;
  }

  drawOne() {
    removeSealedCardsFromCombat(this.app.state);
    const c = this.app.state.combat;
    if (!c.draw.length && c.discard.length) {
      c.draw = this.app.rng.shuffle(c.discard);
      c.discard = [];
    }
    const next = c.draw.shift();
    if (next) c.hand.push(next);
  }

  drawCards(count) { for (let i = 0; i < count; i += 1) this.drawOne(); }

  async animateCardsIntoHand(cardUids, { interval = 100 } = {}) {
    const c = this.app.state?.combat;
    if (!c || !cardUids?.length) return 0;
    c.dealingCards = true;
    let added = 0;
    for (const cardUid of cardUids) {
      if (this.app.state?.combat !== c) break;
      c.hand.push(cardUid);
      c.lastDealtCardUid = cardUid;
      added += 1;
      this.app.audio?.play?.("click", .70);
      this.app.render();
      await this.app.wait(interval);
    }
    if (this.app.state?.combat === c) {
      c.lastDealtCardUid = null;
      c.dealingCards = false;
      this.app.render();
    }
    return added;
  }

  prepareOpeningHand() {
    const c = this.app.state?.combat;
    if (!c?.openingHandStyle || c.openingHandPrepared || c.round !== 1 || !c.firstPlayerTurn) return;
    c.openingHandPrepared = true;
    removeSealedCardsFromCombat(this.app.state);
    const required = {
      sword: ["swordControl", "swordGuard", "swordQiSlash", "swordIntent", "myriadSwords"],
      body: ["inchPunch", "inchPunch", "shadowKick", "bodyTemper", "bodyTemper"],
      law: ["palmThunder", "waterDragon", "karmaFire", "goldLight", "qiEating"],
    }[c.openingHandStyle];
    const chosen = new Set();
    if (required) {
      const remaining = new Map();
      for (const id of required) remaining.set(id, (remaining.get(id) ?? 0) + 1);
      for (const uid of c.draw) {
        const id = this.findCardInstance(uid)?.cardId;
        if ((remaining.get(id) ?? 0) <= 0) continue;
        chosen.add(uid);
        remaining.set(id, remaining.get(id) - 1);
      }
    } else if (c.openingHandStyle === "scatter") {
      const excluded = new Set(["mountainForce", "stoneScreen", "earthEscape"]);
      for (const uid of c.draw) {
        if (chosen.size >= 5) break;
        if (!excluded.has(this.findCardInstance(uid)?.cardId)) chosen.add(uid);
      }
    }
    // Stable partition: preserve the original shuffle's order in both parts,
    // consume no extra RNG, never add/unseal cards in legacy or edited decks.
    c.draw = [...c.draw.filter((uid) => chosen.has(uid)), ...c.draw.filter((uid) => !chosen.has(uid))];
  }

  async drawCardsAnimated(count, { interval = 100 } = {}) {
    removeSealedCardsFromCombat(this.app.state);
    const c = this.app.state?.combat;
    if (!c) return 0;
    c.dealingCards = true;
    let added = 0;
    for (let i = 0; i < count; i += 1) {
      if (this.app.state?.combat !== c) break;
      if (!c.draw.length && c.discard.length) {
        c.draw = this.app.rng.shuffle(c.discard);
        c.discard = [];
      }
      const next = c.draw.shift();
      if (!next) break;
      c.hand.push(next);
      c.lastDealtCardUid = next;
      added += 1;
      this.app.audio?.play?.("click", .70);
      this.app.render();
      await this.app.wait(interval);
    }
    if (this.app.state?.combat === c) {
      c.lastDealtCardUid = null;
      c.dealingCards = false;
      this.app.render();
    }
    return added;
  }

  async returnFrenzyPalmsAfterHeartDemonCard() {
    removeSealedCardsFromCombat(this.app.state);
    const c = this.app.state?.combat;
    if (!c) return 0;
    const frenzyIds = new Set(["frenzyPalm", "frenzyPalmPlus", "frenzyPalmPlusPlus"]);
    const seen = new Set();
    const returning = [];
    for (const cardUid of [...c.draw, ...c.discard]) {
      if (seen.has(cardUid)) continue;
      const instance = this.findCardInstance(cardUid);
      if (!instance || !frenzyIds.has(instance.cardId)) continue;
      seen.add(cardUid);
      returning.push(cardUid);
    }
    if (!returning.length) return 0;
    c.draw = c.draw.filter((cardUid) => !seen.has(cardUid));
    c.discard = c.discard.filter((cardUid) => !seen.has(cardUid));
    const returned = await this.animateCardsIntoHand(returning, { interval: 100 });
    if (returned > 0) this.addLog("combat.log.frenzyPalmReturn", { count: returned });
    return returned;
  }

  async startPlayerTurn() {
    const state = this.app.state;
    const c = state.combat;
    if (!c) return;
    const wasFirstPlayerTurn = c.firstPlayerTurn;
    c.phase = "dealing";
    c.dealingCards = true;
    c.lastDealtCardUid = null;
    this.normalizeSelectedEnemy();
    this.app.render();
    c.round += 1;
    c.recordPlayerTurnDamage = 0;
    c.recordRoundDamage = 0;
    c.recordRoundDamageClosed = false;
    c.greenSnakeSwordUses = 0;

    // Effects lasting through the following enemy phase expire at the next player turn.
    if (state.player.combatFlags?.martialBurst) delete state.player.combatFlags.martialBurst;
    if (state.player.combatFlags?.ironBoneHardnessGranted) removeStatus(state.player, "hardness", state.player.combatFlags.ironBoneHardnessGranted);
    if (state.player.combatFlags?.ironBoneActive) delete state.player.combatFlags.ironBoneActive;
    if (state.player.combatFlags?.ironBoneHardnessGranted) delete state.player.combatFlags.ironBoneHardnessGranted;
    if (state.player.combatFlags?.mountainCounter) delete state.player.combatFlags.mountainCounter;
    if (state.player.combatFlags?.ghostFlash) delete state.player.combatFlags.ghostFlash;
    if (state.player.combatFlags?.huntian) delete state.player.combatFlags.huntian;
    if (state.player.combatFlags?.swordSpellCostReduction) delete state.player.combatFlags.swordSpellCostReduction;
    if (state.player.combatFlags?.swordGodActive) delete state.player.combatFlags.swordGodActive;
    if (state.player.combatFlags?.swordControlCostReduction) delete state.player.combatFlags.swordControlCostReduction; // legacy v0.2.17 flag
    const nextTurnDrawBonus = Math.max(0, Math.floor(state.player.combatFlags?.nextTurnDraw ?? 0));
    if (state.player.combatFlags?.nextTurnDraw) delete state.player.combatFlags.nextTurnDraw;
    c.fleeArtifactBonus = 0;

    const manaRegen = Math.ceil(state.player.maxMana / 2);
    const beforeStartMana = state.player.mana;
    const start = startTurnCommon(state.player, { manaRegen, rng: this.app.rng,
      onResourceGain: (status, amount) => this.app.showStatusPopup?.(state.player, status, true, amount) });
    if ((start.delayedQiGain ?? 0) > 0) {
      this.addLog("combat.log.diamondBodyDelayedQi", { target: this.unitRef(state.player), amount: start.delayedQiGain, before: start.delayedQiBefore, after: start.delayedQiAfter });
    }

    // Mana has four deliberately separate lifecycle steps:
    // 1) ordinary turn-start recovery is capped at max and gets its own popup;
    // 2) Mixed Orb checks only after that recovery and may create +1 temporary overflow;
    //    Spirit Stones can also carry temporary overflow into the turn;
    // 3) unused overflow from either source is stripped at player turn end with its own popup;
    // 4) victory / successful retreat silently restore Mana to max.
    // Keeping these steps separate prevents one combined floating number from
    // pretending that ordinary regeneration and the artifact proc are the same event.
    const afterTurnRegenMana = state.player.mana;
    if ((start.healingStacks ?? 0) > 0) {
      this.addLog("combat.log.heal", { target: this.unitRef(state.player), amount: start.healingAmount, before: start.healingBeforeHp, after: start.healingAfterHp });
      await this.app.showResourceChange?.(state.player, "hp", start.healingBeforeHp, start.healingAfterHp, { duration: 420, wait: true, showZeroAsGain: true });
    }
    if ((start.concentrationSenseRestored ?? 0) > 0) {
      this.addLog("combat.log.senseRestore", { target: this.unitRef(state.player), amount: start.concentrationSenseRestored, before: start.concentrationBeforeSense, after: start.concentrationAfterSense });
      await this.app.showResourceChange?.(state.player, "sense", start.concentrationBeforeSense, start.concentrationAfterSense, { duration: 420, wait: true });
    }
    if (afterTurnRegenMana > beforeStartMana) {
      await this.app.showResourceChange?.(state.player, "mana", beforeStartMana, afterTurnRegenMana, { duration: 420, wait: true });
    }

    if (state.player.artifacts.includes("mixedOrb") && state.player.mana >= state.player.maxMana) {
      await this.app.flashArtifactAction?.("mixedOrb", 500);
      const beforeOrbMana = state.player.mana;
      setMana(state.player, state.player.mana + 1);
      recordArtifactTrigger(state, "mixedOrb");
      void this.app.showResourceChange?.(state.player, "mana", beforeOrbMana, state.player.mana, { duration: 560, wait: false });
    }

    // Yang-Sun Mirror fires once at every player turn start. The stated 100%
    // application chance is still subject to each enemy's normal Burn resistance
    // and Freeze immunity through the shared status application pipeline.
    await this.triggerYangSunMirrorAtTurnStart();

    // Lifeless Sword Domain resolves after ordinary turn-start decay/regeneration
    // and before Heart Demon. Its self-damage is direct HP loss; only a surviving
    // player receives the Domain's Qi and Sword Intent for this turn.
    if (getStatus(state.player, "swordDomain") > 0) {
      const profile = state.player.combatFlags?.swordDomainProfile;
      if (profile) await this.app.effects.resolveSwordDomainPulse(state.player, profile, { fromTurnStart: true });
      if (state.player.hp <= 0) return this.app.onPlayerDeath();
    }

    // Player Heart Demon flare-up inserts one permanent pollution card into the
    // ordinary draw. Frenzy Palm recovery is intentionally not tied to this random
    // flare anymore; it happens only after actively playing a Heart-Demon card.
    const heartResult = resolveHeartDemon(state.player, this.app.rng);
    if (heartResult.triggered) {
      await this.app.flashPlayerHeartDemon?.(500);
      const beforeHeart = getStatus(state.player, "heartDemon");
      const heartCards = [appendCardInstance(state.player, "heartDemonCard")];
      c.draw.unshift(...heartCards.map((card) => card.uid));
      removeStatus(state.player, "heartDemon", 1);
      this.addLog("combat.log.heartDemonPlayer", { chance: heartResult.chance, before: beforeHeart, after: getStatus(state.player, "heartDemon"), count: heartCards.length });
    }

    const drawCount = Math.max(0, 5 + nextTurnDrawBonus);
    const handBefore = c.hand.length;
    this.prepareOpeningHand();
    await this.drawCardsAnimated(drawCount, { interval: 100 });
    // Keep input disabled until enemy intents (and Tianji Compass, if present)
    // have completed for this round.
    c.dealingCards = true;
    const actuallyDrawn = c.hand.length - handBefore;

    // Keep round-one ordering consistent with later rounds: the encounter first has
    // its neutral spawn order, then enemy decision-making establishes the real next
    // action order and the UI may visibly reorder with the same FLIP animation.
    if (wasFirstPlayerTurn && state.player.hp > 0) {
      this.app.render();
      await this.app.wait(40);
    }
    await this.generateEnemyIntents();
    c.firstPlayerTurn = false;
    c.dealingCards = false;
    c.lastDealtCardUid = null;
    c.phase = "player";
    // A skipped turn queues endPlayerTurn below; it must not display an input prompt.
    this.app.tutorialAutoTurnRef = start.skip ? c : null;
    this.app.render();
    // Once dealing/intents finish, End Turn transitions from disabled gray back
    // to its normal yellow state through a short 200ms glow. Use a deferred DOM
    // effect so the encounter's outer render cannot replace the flashing button.
    if (!start.skip) setTimeout(() => this.app.flashEndTurnUnlock?.(200), 0);
    this.addLog("combat.log.roundStart", { round: c.round, draw: actuallyDrawn, mana: state.player.mana });

    if (state.player.hp <= 0) return this.app.onPlayerDeath();
    if (start.skip) {
      const skipLogKey = start.entangleTriggered
        ? "combat.log.entangleSkip"
        : getStatus(state.player, "stun") > 0
          ? "combat.log.stunSkip"
          : getStatus(state.player, "freeze") > 0
            ? "combat.log.freezeSkip"
          : "combat.log.skip";
      this.addLog(skipLogKey, { name: this.unitRef(state.player) });
      queueMicrotask(() => { void this.endPlayerTurn(); });
    }
  }

  async generateEnemyIntents() {
    const state = this.app.state;
    const c = state.combat;
    const living = c.enemies.filter((enemy) => enemy.hp > 0);

    // Build the actual next enemy action queue before intent rolls. Three defensive
    // skills (Stone Wall, Stone Screen, Mount Tai) are allowed only for the enemy
    // that will act last in this exact queue, including mixed formations and random
    // tie-breaking between equal Speed values.
    this.buildEnemyTurnOrder();

    // 1) Resolve and display the enemies' own prediction result first. Pack howl
    // bonuses are promoted here so a howl cast in the previous enemy phase affects
    // exactly this round's first skill, never a wolf that has not yet acted in the
    // same phase as the howl.
    living.forEach((enemy) => {
      enemy.combatFlags ??= {};
      enemy.combatFlags.wolfHowlActive = Boolean(enemy.combatFlags.wolfHowlNext);
      delete enemy.combatFlags.wolfHowlNext;
      // Once an enemy has begun showing its current skill name, keep that title
      // sticky through the rest of the enemy phase and the following draw. Only
      // a genuinely newly generated intent is allowed to restore the “next turn”
      // prefix, so the just-used skill never flashes back as an old prediction.
      delete enemy.combatFlags.intentTitleCurrent;
      enemy.intent = this.ai.generateIntent(enemy);
      // Elite Iron Bone suppresses itself and Mountain-Shattering Force for one
      // decision only. If that locked decision falls through to Huntian Art+, its
      // data-driven replacement randomly selects Shadowless Kick+ or Inch Punch+.
      // Preserve the original prediction roll while refreshing the final preview.
      this.ai.replaceIntentForSelfCombatFlag?.(enemy);
      // Huntian/Huntian+ may turn into a healing pill according to complete 20%
      // chunks of missing HP. The post-Iron-Bone random attack replacement above
      // takes precedence because it no longer remains a Huntian decision.
      this.ai.replaceIntentForSelfMissingHp?.(enemy);
      // Chief-disciple Iron Bone may instead consume projected turn-start Qi
      // through Qi Into Bone. Resolve this only after any forced decision-lock replacement.
      this.ai.replaceIntentForSelfQi?.(enemy);
      // These flags constrain exactly one intent decision, then are consumed.
      if (enemy.combatFlags.enemyIronBoneDecisionLock) delete enemy.combatFlags.enemyIronBoneDecisionLock;
      if (enemy.combatFlags.enemyGatherQiDecisionLock) delete enemy.combatFlags.enemyGatherQiDecisionLock;
      if (enemy.combatFlags.enemyChiefHuntianDecisionLock) delete enemy.combatFlags.enemyChiefHuntianDecisionLock;
      if (enemy.combatFlags.leftGhostDecisionLock) delete enemy.combatFlags.leftGhostDecisionLock;
    });

    // Zhengyang disciples coordinate with team-wide Stone Wall / Stone Screen:
    // after every unit has made its ordinary choice, the disciple's final intent
    // is forcibly replaced by Mountain-Shattering Force+. Preserve the original
    // hidden/revealed roll; only the chosen skill and its preview change.
    const synchronizedGuardSkillIds = new Set(["superHarden", "stoneScreen"]);
    for (const enemy of living) {
      if (enemy.enemyId !== "zhengyangDisciple") continue;
      const teammateRaisesWall = living.some((teammate) => teammate.uid !== enemy.uid
        && synchronizedGuardSkillIds.has(teammate.intent?.skillId));
      if (teammateRaisesWall) enemy.intent = this.ai.replaceIntentSkill(enemy, "mountainForcePlus");
    }

    // Iron Bone's HP-based martial bonus becomes immutable only after all normal
    // choices and forced replacements have produced the final intent.
    for (const enemy of living) this.ai.lockIronBoneIntent?.(enemy);

    if (!state.player.artifacts.includes("tianji")) return;

    // 2) Once per round, after ~0.5s of the normal prediction being visible, compare
    // current Sense. Keep the combat input locked during this short resolution so
    // a card cannot be committed before the artifact has finished its round check.
    const previousPhase = c.phase;
    c.phase = "intent";
    this.app.render();
    await this.app.wait(500);
    if (this.app.state?.combat !== c || state.screen !== "combat") return;

    const exposed = living.filter((enemy) => enemy.hp > 0 && state.player.sense > enemy.sense);
    for (const enemy of exposed) {
      if (!enemy.intent) continue;
      enemy.intent.hidden = false;
      enemy.intent.revealed = true;
    }

    if (exposed.some((enemy) => enemy.intent)) recordArtifactTrigger(state, "tianji");

    if (exposed.length) await this.app.flashArtifactAction?.("tianji", 500);
    if (this.app.state?.combat === c && c.phase === "intent") c.phase = previousPhase;
    this.app.render();
  }

  getCardActionType(card) {
    if (card?.id === "heartDemonCard") return "artifact";
    if (card?.tags?.includes("attack") || card?.effects?.some((effect) => effect.type === "damage")) return "attack";
    if (card?.tags?.includes("defense") || card?.effects?.some((effect) => ["gainQi", "gainGuard", "setEndTurnGuard", "armGhostFlash", "activateIronBone"].includes(effect.type))) return "defense";
    return "support";
  }

  async playCard(cardUid, targetUid = null) {
    const state = this.app.state;
    const c = state.combat;
    if (!c || c.phase !== "player" || this.isCardInputLocked()) return;
    const handIndex = c.hand.indexOf(cardUid);
    if (handIndex < 0) return;
    const inst = this.findCardInstance(cardUid);
    if (!inst || inst.sealed === true) return;
    const card = CARDS[inst.cardId];
    if (!card) return;
    const errorKey = this.getCardPlayError(cardUid, targetUid);
    if (errorKey) return { ok: false, errorKey };

    this.armCardPlayCooldown(444);
    try {
      const target = card.target === "enemy"
        ? this.app.findEnemy(targetUid ?? c.selectedEnemyId)
        : state.player;
      const consumesNextSwordControl = card.id === "swordControl" && Boolean(state.player.combatFlags?.nextSwordControlCostReduction);
      const consumesNextSwordSpell = this.isSwordSpell(card) && Boolean(state.player.combatFlags?.nextSwordSpellCostReduction);
      const consumesNextSpellCap = card.type === "spell" && Number.isFinite(state.player.combatFlags?.nextSpellCostCap);
      const clearsWaterDragonThunderWindow = Boolean(state.player.combatFlags?.waterDragonAfterThunderDiscount);
      const manaCost = this.getCardManaCost(inst);
      // UI-only: keep the paid cost through every frame of the outgoing card.
      this.app.playedCardManaCost = { combat: c, cardUid, cost: manaCost };
      const manaBefore = state.player.mana;
      state.player.mana -= manaCost;
      // Consume old one-shot discounts before resolving the card, so this Sword
      // Control can immediately arm the appropriate fresh discount afterward.
      if (consumesNextSwordControl) delete state.player.combatFlags.nextSwordControlCostReduction;
      if (consumesNextSwordSpell) delete state.player.combatFlags.nextSwordSpellCostReduction;
      if (consumesNextSpellCap) delete state.player.combatFlags.nextSpellCostCap;
      if (clearsWaterDragonThunderWindow) delete state.player.combatFlags.waterDragonAfterThunderDiscount;
      // Re-arm only after the old window has been consumed/cancelled. This makes
      // Thunder -> Thunder valid, while Thunder -> any non-Thunder -> Water Dragon is not.
      if (this.isThunderSpell(card)) state.player.combatFlags.waterDragonAfterThunderDiscount = 1;
      if (manaCost > 0) void this.app.showResourceChange?.(state.player, "mana", manaBefore, state.player.mana, { wait: false });
      this.addLog("combat.log.playerCard", {
        action: this.nameRef(card.nameKey, inst.upgraded ? "+" : ""), before: manaBefore, after: state.player.mana,
      });
      // Every successfully played player card has an independent, persistent
      // same-name usage counter. Base/+ variants are distinct keys and all cards,
      // including Heart Demon cards, are capped at 500 uses.
      addCardUseCount(state.player, inst, 1);
      recordPlayerCardUse(state, inst);
      this.app.noteTutorialCardPlayed?.(c);
      await this.app.flashPlayerCardAction?.(cardUid, this.getCardActionType(card), 444, card.skillSfxKey);
      c.selectedCardId = null;
      c.selectedCardAt = 0;
      c.hand.splice(handIndex, 1);
      this.app.playedCardManaCost = null;
      if (!card.permanentDestroyOnUse) c.discard.push(cardUid);
      // Rebuild the hand only after the full 444ms icon reveal has finished.
      this.app.render();

      const lostMindSelfAttack = this.getCardActionType(card) === "attack"
        && getStatus(state.player, "lostMind") > 0
        && this.app.rng.chance(25);
      const playerAttackReactionTargets = !lostMindSelfAttack && this.getCardActionType(card) === "attack"
        ? ((card.target === "allEnemies")
            ? [...this.getLivingEnemies()]
            : (card.target === "enemy" ? [target].filter(Boolean) : []))
        : [];
      if (lostMindSelfAttack) this.addLog("combat.log.lostMindSelf", { name: this.unitRef(state.player) });
      c.activePlayedCardUid = cardUid;
      let result;
      try {
        result = await this.app.effects.executeEffects(card.effects, {
          source: state.player, target, card, cardInstance: inst, forceAttackSelf: lostMindSelfAttack,
          targetMode: card.target,
        });
      } finally {
        c.activePlayedCardUid = null;
      }
      if (!result?.combatEnded && state.combat && card.id === "heartDemonCard") {
        await this.returnFrenzyPalmsAfterHeartDemonCard();
      }
      if (!result?.combatEnded && state.combat) {
        const seenReactionTargets = new Set();
        for (const reactionTarget of playerAttackReactionTargets) {
          if (!reactionTarget || reactionTarget.hp <= 0 || seenReactionTargets.has(reactionTarget.uid)) continue;
          seenReactionTargets.add(reactionTarget.uid);
          const reaction = await this.triggerEnemyPlayerAttackReactions(reactionTarget);
          if (reaction?.combatEnded || !state.combat) return;
        }
        await this.triggerColdLightSwordAfterCard(card);
      }
      if (result?.combatEnded || !state.combat) return;
      if (card.permanentDestroyOnUse) {
        state.player.deck = state.player.deck.filter((entry) => entry.uid !== cardUid);
      }
      if (state.player.hp <= 0) return this.app.onPlayerDeath();
      this.cleanupDeadEnemies();
      if (this.getLivingEnemies().length === 0) return this.finishVictory();
      if (result.shouldEndTurn) return this.endPlayerTurn();
      this.app.render();
    } finally {
      if (this.app.playedCardManaCost?.combat === c && this.app.playedCardManaCost.cardUid === cardUid) this.app.playedCardManaCost = null;
      this.releaseCardPlayCooldown(c);
    }
  }


  isColdLightSwordSpell(card) {
    return this.isSwordSpell(card);
  }

  async triggerColdLightSwordAfterCard(card) {
    const state = this.app.state;
    if (!this.isColdLightSwordSpell(card)) return false;
    if (!(state.player.artifacts ?? []).includes("coldLightSword")) return false;
    await this.app.flashArtifactAction?.("coldLightSword", 260);
    const before = state.player.qi ?? 0;
    state.player.qi = before + 3;
    recordArtifactTrigger(state, "coldLightSword");
    syncBuffOrder(state.player, "qi");
    this.app.showStatusPopup?.(state.player, "qi", true, 3);
    this.addLog("combat.log.qiGain", { target: this.unitRef(state.player), amount: 3, before, after: state.player.qi });
    void this.app.showResourceChange?.(state.player, "qi", before, state.player.qi, { duration: 420, wait: false });
    return true;
  }

  async triggerYangSunMirrorAtTurnStart() {
    const state = this.app.state;
    if (!(state.player.artifacts ?? []).includes("yangSunMirror")) return false;
    const enemies = this.getLivingEnemies();
    if (!enemies.length) return false;
    await this.app.flashArtifactAction?.("yangSunMirror", 360);
    let succeeded = false;
    for (const enemy of enemies) {
      const before = getStatus(enemy, "burn");
      const stacks = this.app.rng?.int?.(1, 3) ?? 1;
      const applied = this.app.effects.tryApplyStatus(enemy, { status: "burn", stacks, chance: 100 });
      succeeded ||= Boolean(applied);
      const after = getStatus(enemy, "burn");
      this.addLog(applied ? "combat.log.statusGain" : "combat.log.statusResist", {
        target: this.unitRef(enemy), status: this.nameRef("status.burn"), before, after,
      });
    }
    // A group passive is one activation, regardless of how many enemies receive it.
    if (succeeded) recordArtifactTrigger(state, "yangSunMirror");
    return true;
  }

  getArtifactSenseCost(artifactId) {
    const artifact = ARTIFACTS[artifactId];
    if (!artifact?.active) return 0;
    if (artifactId === "greenSnakeSword") {
      const uses = Math.max(0, Math.floor(this.app.state?.combat?.greenSnakeSwordUses ?? 0));
      return 2 ** Math.min(uses, 30);
    }
    return artifact.senseCost ?? 0;
  }

  async useGreenSnakeSwordArtifact(targetUid) {
    const state = this.app.state;
    const combat = state.combat;
    if (combat?.greenSnakeSwordResolving) return;
    const target = this.getLivingEnemies().find((enemy) => enemy.uid === (targetUid ?? combat.selectedEnemyId))
      ?? (this.getLivingEnemies().length === 1 ? this.getLivingEnemies()[0] : null);
    if (!target) {
      this.app.audio.play("fail", .45);
      this.app.showCombatFeedback?.("combat.selectEnemy");
      return;
    }
    const cost = this.getArtifactSenseCost("greenSnakeSword");
    if (state.player.sense < cost) {
      this.app.audio.play("fail", .45);
      return;
    }
    combat.greenSnakeSwordResolving = true;
    try {
      await this.app.flashArtifactAction?.("greenSnakeSword", 500);
      const beforeSense = state.player.sense;
      state.player.sense -= cost;
      combat.greenSnakeSwordUses = Math.max(0, Math.floor(combat.greenSnakeSwordUses ?? 0)) + 1;
      void this.app.showResourceChange?.(state.player, "sense", beforeSense, state.player.sense, { wait: false });
      this.addLog("combat.log.greenSnakeSword", { source: this.unitRef(state.player), action: this.nameRef("artifact.greenSnakeSword.name") });
      const result = await this.app.effects.executeEffects([{
        type: "damage", amount: 5, ignoreGuard: true, recordArtifactId: "greenSnakeSword",
        statusOnHit: { status: "entangle", stacksRange: [1, 3], chance: 100 },
      }], { source: state.player, target, targetMode: "enemy" });
      if (result?.combatEnded || !state.combat) return;
      if (target.hp > 0) {
        const reaction = await this.triggerEnemyPlayerAttackReactions(target);
        if (reaction?.combatEnded || !state.combat) return;
      }
      if (state.player.hp <= 0) return this.app.onPlayerDeath();
      this.cleanupDeadEnemies();
      if (!this.getLivingEnemies().length) return this.finishVictory();
      this.app.render();
    } finally {
      combat.greenSnakeSwordResolving = false;
    }
  }

  async useArtifact(artifactId, targetUid = null) {
    const state = this.app.state;
    const combat = state.combat;
    const artifact = ARTIFACTS[artifactId];
    if (combat?.phase !== "player" || !artifact?.active) return;
    if (!state.player.artifacts.includes(artifactId)) return;

    const senseCost = this.getArtifactSenseCost(artifactId);
    if (state.player.sense < senseCost) {
      this.app.audio.play("fail", .45);
      return;
    }
    if (artifactId === "greenSnakeSword") return this.useGreenSnakeSwordArtifact(targetUid);

    await this.app.flashArtifactAction?.(artifactId, 500);

    const beforeSense = state.player.sense;
    state.player.sense -= senseCost;
    void this.app.showResourceChange?.(state.player, "sense", beforeSense, state.player.sense, { wait: false });

    if (artifactId === "heartMace") {
      const rollHumanoidStacks = () => this.app.rng?.int?.(2, 3) ?? 2;
      const applyHeartDemon = (unit, stacksOrRoll) => {
        const chance = Math.max(0, Math.min(100, 100 - statusResistance(unit, "heartDemon")));
        if (chance <= 0) return this.app.effects?.reportStatusAttempt?.(unit, "heartDemon", false) ?? false;
        if (chance < 100 && !this.app.rng?.chance?.(chance)) return this.app.effects?.reportStatusAttempt?.(unit, "heartDemon", false) ?? false;
        const stacks = typeof stacksOrRoll === "function" ? stacksOrRoll() : stacksOrRoll;
        return this.app.effects?.addStatusWithFeedback?.(unit, "heartDemon", stacks) ?? addStatus(unit, "heartDemon", stacks);
      };
      let succeeded = Boolean(applyHeartDemon(state.player, rollHumanoidStacks));
      for (const enemy of this.getLivingEnemies()) {
        const applied = applyHeartDemon(enemy, enemy.humanoid === false ? 1 : rollHumanoidStacks);
        succeeded ||= Boolean(applied);
      }
      if (succeeded) recordArtifactTrigger(state, artifactId, { active: true });
    }

    this.app.render();
  }

  predict(enemyUid) {
    const state = this.app.state;
    if (state.combat?.phase !== "player") return;
    const enemy = this.app.findEnemy(enemyUid);
    if (!enemy?.intent?.hidden || enemy.intent.revealed) return;
    if (state.player.sense <= 0) return;
    const beforeSense = state.player.sense;
    state.player.sense -= 1;
    void this.app.showResourceChange?.(state.player, "sense", beforeSense, state.player.sense, { wait: false });
    enemy.intent.revealed = true;
    this.app.render();
  }

  highestLivingGrade() {
    const living = this.getLivingEnemies();
    if (!living.length) return "D";
    return living.reduce((highest, enemy) =>
      (GRADE_RANK[enemy.grade] ?? 0) > (GRADE_RANK[highest] ?? 0) ? enemy.grade : highest,
    living[0].grade);
  }

  applyEscapeModifiers(baseChance, unit = this.app.state?.player, { ignoreBoots = false } = {}) {
    const entanglePenalty = Math.min(100, Math.max(0, Math.floor(unit ? getStatus(unit, "entangle") : 0)) * 10);
    const bootsBonus = !ignoreBoots && unit?.kind === "player" && unit.artifacts?.includes("shadowlessBoots") ? 20 : 0;
    return Math.max(0, Math.min(100, baseChance + bootsBonus - entanglePenalty));
  }

  getEarthEscapeChance(cardUid = null, { ignoreBoots = false } = {}) {
    const grade = this.highestLivingGrade();
    const base = EARTH_ESCAPE_CHANCE[grade] ?? 0;
    // Grade A is an absolute 0% for Earth Escape; hand bonuses cannot raise it.
    if (grade === "A") return 0;
    const hand = this.app.state?.combat?.hand ?? [];
    let remainingCards = hand.length;
    if (cardUid && hand.includes(cardUid)) remainingCards = Math.max(0, remainingCards - 1);
    const handBonus = remainingCards * 5;
    const artifactBonus = Math.max(0, Math.floor(this.app.state?.combat?.fleeArtifactBonus ?? 0));
    return this.applyEscapeModifiers(base + handBonus + artifactBonus, this.app.state?.player, { ignoreBoots });
  }

  getFleeChance({ ignoreBoots = false } = {}) {
    const grade = this.highestLivingGrade();
    // Grade A is an absolute 0% for ordinary fleeing too: Shadowless Boots may
    // still draw cards there, but its escape-rate bonus has no effect.
    if (grade === "A") return 0;
    const ordinaryBase = ORDINARY_FLEE_CHANCE[grade] ?? 0;
    const bodyStyleBonus = this.app.state?.player?.styleId === "body" ? 10 : 0;
    const artifactBonus = Math.max(0, Math.floor(this.app.state?.combat?.fleeArtifactBonus ?? 0));
    return this.applyEscapeModifiers(Math.min(100, ordinaryBase + bodyStyleBonus + artifactBonus), this.app.state?.player, { ignoreBoots });
  }

  completeEscape() {
    const state = this.app.state;
    const combat = state.combat;
    if (!combat || combat.result) return false;

    // A successful retreat is now a proper combat result instead of silently
    // dropping back to the map. Keep the combat shell alive until the player
    // dismisses the result so a possible long-battle penalty can chain after
    // this popup in a deterministic order.
    this.preservePersistentPlayerStatuses();
    setMana(state.player, state.player.maxMana);
    this.app.clearResourcePopup?.(state.player, "mana");
    state.player.qi = 0;
    state.player.guard = 0;
    state.player.combatFlags = {};
    combat.phase = "result";
    recordBattleOutcome(state, "escape");
    combat.selectedCardId = null;
    combat.selectedCardAt = 0;
    combat.longBattleEligible = this.isLongBattleEligible(combat);
    const silentGateEscape = !combat.pursuit && !combat.debugEncounter && combat.nodeId === "19B";
    combat.swiftBattleEligible = silentGateEscape ? false : this.isSwiftMapBattleEligible(combat);
    state.overlay = null;

    this.app.audio?.play?.("win", .5);
    // The final Gate is a special retreat: never show the ordinary/Swift Escape
    // result and never grant the <=2-round escape Pursuit reduction. Long Battle
    // still applies, so an >10-round retreat goes straight to that result; otherwise
    // return silently to 18B using the ordinary Gate escape exit path.
    if (silentGateEscape) {
      if (combat.longBattleEligible) return this.applyLongBattlePenaltyIfEligible("escape");
      return this.finalizeEscapeExit();
    }

    combat.result = { type: "escape", swift: combat.swiftBattleEligible };
    this.app.persist();
    this.app.render();
    return true;
  }

  getEnemyEarthEscapeChance(enemy, baseChance = 50) {
    if (!enemy) return 0;
    const entanglePenalty = Math.min(100, Math.max(0, Math.floor(getStatus(enemy, "entangle"))) * 10);
    return Math.max(0, Math.min(100, Math.floor(baseChance) - entanglePenalty));
  }

  async attemptEnemyEarthEscape(enemy, effect = {}) {
    const state = this.app.state;
    const combat = state.combat;
    if (!combat || combat.phase !== "enemy" || !enemy || enemy.hp <= 0) return false;
    const chance = this.getEnemyEarthEscapeChance(enemy, effect.baseChance ?? 50);
    if (!this.app.rng.chance(chance)) {
      this.app.audio.play("fail", .42);
      this.addLog("combat.log.enemyFleeFail", { name: this.unitRef(enemy) });
      if ((effect.guardOnFailure ?? 0) > 0) {
        const before = enemy.guard ?? 0;
        const gained = gainGuard(enemy, effect.guardOnFailure);
        if (gained > 0) this.app.showStatusPopup?.(enemy, "guard", true, gained);
        this.addLog(gained > 0 ? "combat.log.guardGain" : "combat.log.guardBlocked", gained > 0
          ? { target: this.unitRef(enemy), amount: enemy.guard - before, before, after: enemy.guard }
          : { target: this.unitRef(enemy) });
      }
      return false;
    }
    this.preservePersistentPlayerStatuses();
    setMana(state.player, state.player.maxMana);
    this.app.clearResourcePopup?.(state.player, "mana");
    state.player.qi = 0;
    state.player.guard = 0;
    state.player.combatFlags = {};
    combat.phase = "result";
    combat.selectedCardId = null;
    combat.selectedCardAt = 0;
    combat.longBattleEligible = this.isLongBattleEligible(combat);
    const stolen = Math.max(0, Math.floor(combat.stolenStonesTotal ?? enemy.combatFlags?.stolenStones ?? 0));
    combat.result = { type: "enemyEscape", stolenStones: stolen };
    recordBattleOutcome(state, "enemyEscape");
    state.overlay = null;
    this.app.audio.play("fail", .55);
    this.app.persist();
    this.app.render();
    return true;
  }

  completeEnemyEscapeResult() {
    const combat = this.app.state?.combat;
    if (!combat || combat.result?.type !== "enemyEscape") return false;
    if (this.applyLongBattlePenaltyIfEligible("enemyEscape")) return true;
    return this.finalizeEnemyEscapeExit();
  }

  finalizeEnemyEscapeExit() {
    const state = this.app.state;
    const combat = state.combat;
    if (!combat) return false;
    if (combat.debugEncounter) {
      const returnScreen = combat.debugReturnScreen ?? "map";
      state.combat = null;
      state.overlay = null;
      state.screen = returnScreen;
      this.app.persist();
      this.app.render();
      return true;
    }
    state.combat = null;
    state.overlay = null;
    state.screen = "map";
    state.map.canStayRest = false;
    this.app.map.preparePathSelection();
    this.app.commitPursuitSettlement?.();
    this.app.persist(true);
    this.app.render();
    return true;
  }

  async attemptEarthEscapeFromCard({ guardOnFailure = 0 } = {}) {
    const state = this.app.state;
    const c = state.combat;
    if (!c || c.phase !== "player") return false;
    // The casting card has already left the hand when effects resolve, so every
    // card currently remaining in hand contributes +5%.
    const chance = this.getEarthEscapeChance();
    if (!this.app.rng.chance(chance)) {
      recordEscapeFailure(state);
      this.app.audio.play("fail", .45);
      this.addLog("combat.earthEscape.fail", { chance });
      if (guardOnFailure > 0) {
        const before = state.player.guard ?? 0;
        const gained = gainGuard(state.player, guardOnFailure);
        if (gained > 0) this.app.showStatusPopup?.(state.player, "guard", true, gained);
        this.addLog(gained > 0 ? "combat.log.guardGain" : "combat.log.guardBlocked", gained > 0
          ? { target: this.unitRef(state.player), amount: state.player.guard - before, before, after: state.player.guard }
          : { target: this.unitRef(state.player) });
      }
      return false;
    }
    // Count only a successful retreat with an effective boots bonus. Comparing
    // rates is deterministic and consumes no additional gameplay RNG rolls.
    if (chance > this.getEarthEscapeChance(null, { ignoreBoots: true })) recordArtifactTrigger(state, "shadowlessBoots");
    return this.completeEscape();
  }

  async attemptFlee() {
    const state = this.app.state;
    const c = state.combat;
    if (!c || c.phase !== "player") return;
    const chance = this.getFleeChance();
    c.selectedCardId = null;
    c.selectedCardAt = 0;

    if (!this.app.rng.chance(chance)) {
      recordEscapeFailure(state);
      this.app.audio.play("fail", .45);
      this.addLog("combat.flee.fail", { chance });
      return this.endPlayerTurn();
    }

    if (chance > this.getFleeChance({ ignoreBoots: true })) recordArtifactTrigger(state, "shadowlessBoots");
    return this.completeEscape();
  }

  async endPlayerTurn() {
    const state = this.app.state;
    const c = state.combat;
    if (!c || c.phase !== "player") return;
    c.phase = "ending";
    c.selectedCardId = null;
    c.selectedCardAt = 0;
    this.app.render();

    if (state.player.combatFlags?.endTurnGuard) {
      const amount = Math.max(0, Math.floor(state.player.combatFlags.endTurnGuard));
      const gained = gainGuard(state.player, amount);
      if (gained > 0) this.app.showStatusPopup?.(state.player, "guard", true, gained);
      delete state.player.combatFlags.endTurnGuard;
    }

    // Temporary Mana gained above max (Mixed Orb, Spirit Stone, Spirit-Qi Pill, etc.) survives until end of turn. If it survives
    // unused until the player ends the turn, remove only the excess and show the loss.
    // Spent overflow naturally needs no cleanup because Mana is already <= max.
    if (state.player.mana > state.player.maxMana) {
      const beforeOverflowCleanup = state.player.mana;
      state.player.mana = state.player.maxMana;
      await this.app.showResourceChange?.(state.player, "mana", beforeOverflowCleanup, state.player.mana, { duration: 420, wait: true });
    }

    // Every unplayed card is discarded in hand order, including Qi Into Bone.
    // Do not prepend a special card to Draw: reshuffles must randomize it with
    // the ordinary discard pile. The legacy log placeholder remains compatible.
    const discarded = c.hand.length;
    c.discard.push(...c.hand);
    c.hand = [];
    this.addLog("combat.log.endTurn", { discard: discarded, retain: 0 });

    const end = await this.endTurnWithFeedback(state.player);
    this.logEndTurnGuardGains(state.player, end);
    if (end.nirvanaPending) await this.app.effects.finalizeNirvanaFromBurnIfNeeded(state.player, end.nirvanaBurnStacks);
    else if (state.player.hp <= 0) await this.app.effects.finalizePendingLethalRecovery(state.player);
    if (state.player.hp <= 0) return this.app.onPlayerDeath();
    // Keep the locked enemy across the enemy phase. Selection is keyed by uid,
    // so the gold lock follows that enemy when action-order reflow moves its card.
    state.overlay = null;
    c.phase = "enemy";
    this.app.render();
    await this.runEnemyPhase();
  }

  async triggerMountainCounter(enemy) {
    const state = this.app.state;
    const player = state?.player;
    const armed = player?.combatFlags?.mountainCounter;
    if (!armed || !enemy || enemy.hp <= 0 || player.hp <= 0) return { triggered: false, combatEnded: false };
    const guardBeforeCounter = Math.max(0, Math.floor(player.guard ?? 0));
    // v0.2.53: Mountain-Shattering Force is no longer consumed by the first attacker.
    // After each enemy finishes its complete attack skill, counter only if Stance
    // still remains. A broken Stance silently invalidates the prepared counter: no
    // zero-damage popup and no battle-log noise.
    if (guardBeforeCounter <= 0) {
      delete player.combatFlags.mountainCounter;
      return { triggered: false, combatEnded: false };
    }
    const multiplier = Math.max(1, Math.floor(armed.multiplier ?? 1));
    const guardRetention = Math.max(0, Math.min(1, Number.isFinite(armed.guardRetention) ? armed.guardRetention : 0));
    const baseDamage = guardBeforeCounter * multiplier;
    this.addLog("combat.log.mountainCounter", {
      source: this.unitRef(player), target: this.unitRef(enemy), action: this.nameRef("card.mountainForce.name"), guard: guardBeforeCounter, multiplier,
    });
    const result = this.app.effects.dealDamage(player, enemy, baseDamage, { isMartial: true });
    this.app.effects.logDamageResult(player, enemy, result);
    this.app.audio.play(result.missed ? "miss" : result.actual === 0 ? "defense" : "hit", result.actual === 0 ? .42 : .5);
    if (result.actual > 0) this.app.audio.playEnemyHit?.(enemy);
    const deathFx = result.beforeHp > 0 && result.afterHp <= 0 && !this.app.effects.hasPendingLethalRecovery(result)
      ? this.app.startEnemyDeathFx?.(enemy)
      : null;
    await Promise.all([
      this.app.flashDamageTaken?.(enemy, 200, { red: result.actual > 0 }),
      this.app.showDamagePopup?.(enemy, result.actual, { duration: 560 }),
    ]);
    await this.app.effects.waitForLethalResolution(enemy, result);
    await this.app.effects.resolveReflectionFeedback?.(result);
    if (deathFx) await deathFx;
    if (this.app.effects.hasPendingLethalRecovery(result)) await this.app.effects.finalizePendingLethalRecovery(enemy, result);
    const guardBeforeSettle = Math.max(0, Math.floor(player.guard ?? 0));
    const guardAfterSettle = guardRetention > 0 ? Math.floor(guardBeforeSettle * guardRetention) : 0;
    if (guardAfterSettle <= 0) {
      clearGuard(player);
      delete player.combatFlags.mountainCounter;
    } else {
      player.guard = guardAfterSettle;
      syncBuffOrder(player, "guard");
    }
    if (guardBeforeSettle !== guardAfterSettle) this.addLog("combat.log.guardChange", { target: this.unitRef(player), before: guardBeforeSettle, after: guardAfterSettle });
    this.cleanupDeadEnemies();
    if (!this.getLivingEnemies().length) {
      this.finishVictory();
      return { triggered: true, combatEnded: true, result };
    }
    return { triggered: true, combatEnded: false, result };
  }

  async triggerGhostFlashCounter(enemy, shadowKickPlusUses = 0) {
    const player = this.app.state?.player;
    for (let i = 0; i < Math.max(0, Math.floor(shadowKickPlusUses ?? 0)); i += 1) {
      if (!enemy || enemy.hp <= 0 || player?.hp <= 0) break;
      this.addLog("combat.log.ghostFlashCounter", { source: this.unitRef(player), target: this.unitRef(enemy), count: i + 1 });
      const result = await this.app.effects.executeEffects(CARDS.shadowKick.effects, { source: player, target: enemy, targetMode: "enemy", card: CARDS.shadowKick, cardInstance: { cardId: "shadowKick", upgraded: true }, actionKey: "card.shadowKick.name" });
      if (result?.combatEnded) return { combatEnded: true };
      this.cleanupDeadEnemies();
      if (!this.getLivingEnemies().length) { this.finishVictory(); return { combatEnded: true }; }
    }
    return { combatEnded: false };
  }

  triggerHuntian(enemy) {
    const player = this.app.state?.player;
    const armed = player?.combatFlags?.huntian;
    if (!armed || !enemy) return false;
    const before = getStatus(enemy, "armorBreak");
    const stacks = Math.max(1, Math.floor(armed.armorBreakStacks ?? 1));
    const applied = this.app.effects.tryApplyStatus(enemy, { status: "armorBreak", stacks, chance: 100 });
    const after = getStatus(enemy, "armorBreak");
    this.addLog(applied ? "combat.log.huntianTrigger" : "combat.log.statusResist", applied
      ? { source: this.unitRef(player), target: this.unitRef(enemy), before, after, stacks }
      : { target: this.unitRef(enemy), status: this.nameRef("status.armorBreak"), before, after });
    return applied;
  }

  async triggerEnemyMountainCounterAfterPlayerAttack(enemy) {
    const player = this.app.state?.player;
    const armed = enemy?.combatFlags?.enemyMountainCounter;
    if (!armed || !enemy || enemy.hp <= 0 || !player || player.hp <= 0) return { triggered: false, combatEnded: false };
    const guardBeforeCounter = Math.max(0, Math.floor(enemy.guard ?? 0));
    if (guardBeforeCounter <= 0) { delete enemy.combatFlags.enemyMountainCounter; return { triggered: false, combatEnded: false }; }
    const multiplier = Math.max(1, Math.floor(armed.multiplier ?? 2));
    const retention = Math.max(0, Math.min(1, Number.isFinite(armed.guardRetention) ? armed.guardRetention : 0.5));
    this.addLog("combat.log.mountainCounter", { source: this.unitRef(enemy), target: this.unitRef(player), action: this.nameRef("skill.zhengyang.mountainForcePlus"), guard: guardBeforeCounter, multiplier });
    const result = this.app.effects.dealDamage(enemy, player, guardBeforeCounter * multiplier, { isMartial: true });
    this.app.effects.logDamageResult(enemy, player, result);
    this.app.audio.play(result.missed ? "miss" : result.actual === 0 ? "defense" : "hit", result.actual === 0 ? .42 : .5);
    await Promise.all([
      this.app.flashDamageTaken?.(player, 100, { red: result.actual > 0 }),
      this.app.showDamagePopup?.(player, result.actual, { duration: 560 }),
    ]);
    await this.app.effects.waitForLethalResolution(player, result);
    await this.app.effects.resolveReflectionFeedback?.(result);
    if (this.app.effects.hasPendingLethalRecovery(result)) await this.app.effects.finalizePendingLethalRecovery(player, result);
    const guardBeforeSettle = Math.max(0, Math.floor(enemy.guard ?? 0));
    const guardAfterSettle = Math.floor(guardBeforeSettle * retention);
    if (guardAfterSettle <= 0) { clearGuard(enemy); delete enemy.combatFlags.enemyMountainCounter; }
    else { enemy.guard = guardAfterSettle; syncBuffOrder(enemy, "guard"); }
    if (guardBeforeSettle !== guardAfterSettle) this.addLog("combat.log.guardChange", { target: this.unitRef(enemy), before: guardBeforeSettle, after: guardAfterSettle });
    this.cleanupDeadEnemies();
    if (player.hp <= 0) { await this.app.onPlayerDeath(); return { triggered: true, combatEnded: true, result }; }
    if (!this.getLivingEnemies().length) { this.finishVictory(); return { triggered: true, combatEnded: true, result }; }
    return { triggered: true, combatEnded: false, result };
  }

  triggerEnemyHuntianAfterPlayerAttack(enemy) {
    const player = this.app.state?.player;
    const armed = enemy?.combatFlags?.enemyHuntian;
    if (!armed || !player || player.hp <= 0 || enemy.hp <= 0) return false;
    const before = getStatus(player, "armorBreak");
    const stacks = Math.max(1, Math.floor(armed.armorBreakStacks ?? 2));
    const applied = this.app.effects.tryApplyStatus(player, { status: "armorBreak", stacks, chance: 100 });
    const after = getStatus(player, "armorBreak");
    this.addLog(applied ? "combat.log.huntianTrigger" : "combat.log.statusResist", applied
      ? { source: this.unitRef(enemy), target: this.unitRef(player), before, after, stacks }
      : { target: this.unitRef(player), status: this.nameRef("status.armorBreak"), before, after });
    const healingStacks = Math.max(0, Math.floor(armed.healingStacks ?? 0));
    if (healingStacks > 0) {
      const beforeHealing = getStatus(enemy, "healing");
      if (this.app.effects?.addStatusWithFeedback) this.app.effects.addStatusWithFeedback(enemy, "healing", healingStacks);
      else addStatus(enemy, "healing", healingStacks);
      const afterHealing = getStatus(enemy, "healing");
      this.addLog("combat.log.statusGain", {
        target: this.unitRef(enemy), status: this.nameRef("status.healing"), before: beforeHealing, after: afterHealing,
      });
    }
    return applied;
  }

  async triggerEnemyPlayerAttackReactions(enemy) {
    if (!enemy || enemy.hp <= 0) return { combatEnded: false };
    if (enemy.combatFlags?.enemyMountainCounter) {
      const counter = await this.triggerEnemyMountainCounterAfterPlayerAttack(enemy);
      if (counter?.combatEnded) return counter;
    }
    if (enemy.combatFlags?.enemyHuntian) this.triggerEnemyHuntianAfterPlayerAttack(enemy);
    return { combatEnded: false };
  }

  async runEnemyPhase() {
    const state = this.app.state;
    const c = state.combat;
    const byUid = new Map(c.enemies.map((enemy) => [enemy.uid, enemy]));
    const planned = (c.enemyTurnOrder ?? []).map((uid) => byUid.get(uid)).filter((enemy) => enemy?.hp > 0);
    const plannedUids = new Set(planned.map((enemy) => enemy.uid));
    const order = [...planned, ...this.getLivingEnemies().filter((enemy) => !plannedUids.has(enemy.uid))];
    for (let orderIndex = 0; orderIndex < order.length; orderIndex += 1) {
      const enemy = order[orderIndex];
      if (enemy.hp <= 0) continue;
      c.actingEnemyId = enemy.uid;
      enemy.combatFlags ??= {};
      // Ghost Flash covers the intervening player phase, then expires as its
      // owner begins the next action, including turns lost to control effects.
      if (enemy.combatFlags.enemyGhostFlash) delete enemy.combatFlags.enemyGhostFlash;
      // Enemy Mountain-Shattering Force always expires unconditionally at this
      // enemy's next turn start. Do not rely on Guard's separate auto-clear to
      // happen to remove the reaction flag.
      if (enemy.combatFlags.enemyMountainCounter) delete enemy.combatFlags.enemyMountainCounter;
      // Huntian has the same owner-turn lifetime as Mountain-Shattering Force:
      // clear it before turn-start/Heart-Demon/skip checks so a skipped turn can
      // never accidentally preserve the previous round's reactive effect.
      if (enemy.combatFlags.enemyHuntian) delete enemy.combatFlags.enemyHuntian;
      const enemyIronBoneWasActive = Boolean(enemy.combatFlags.ironBoneActive);
      const enemyMartialBurstWasActive = Boolean(enemy.combatFlags.enemyMartialBurst);
      const rookieSwordDiscountWasActive = enemy.enemyId === "hiddenSwordOuterDisciple"
        && Boolean(enemy.combatFlags.rookieSwordControlFreeNext);
      let rookieSwordControlExecuted = false;
      enemy.combatFlags.intentTitleCurrent = true;
      this.app.render();
      // If the player never spent Sense to reveal a hidden intent, the skill is
      // revealed automatically when that specific enemy is about to act.
      if (enemy.intent?.hidden && !enemy.intent.revealed) {
        enemy.intent.revealed = true;
        this.app.render();
        await this.app.wait(180);
      }
      const def = ENEMIES[enemy.enemyId];
      const hadWolfHowlActive = Boolean(enemy.combatFlags?.wolfHowlActive);
      const ordinaryManaRegen = Math.max(0, Math.floor(GRADE_RULES[enemy.grade].manaRegen ?? 0));
      const start = startTurnCommon(enemy, { manaRegen: ordinaryManaRegen, rng: this.app.rng,
        onResourceGain: (status, amount) => this.app.showStatusPopup?.(enemy, status, true, amount) });
      if ((start.delayedQiGain ?? 0) > 0) {
        this.addLog("combat.log.diamondBodyDelayedQi", { target: this.unitRef(enemy), amount: start.delayedQiGain, before: start.delayedQiBefore, after: start.delayedQiAfter });
      }
      if ((start.healingStacks ?? 0) > 0) {
        this.addLog("combat.log.heal", { target: this.unitRef(enemy), amount: start.healingAmount, before: start.healingBeforeHp, after: start.healingAfterHp });
        await this.app.showResourceChange?.(enemy, "hp", start.healingBeforeHp, start.healingAfterHp, { duration: 420, wait: true, showZeroAsGain: true });
      }
      if ((start.concentrationSenseRestored ?? 0) > 0) {
        this.addLog("combat.log.senseRestore", { target: this.unitRef(enemy), amount: start.concentrationSenseRestored, before: start.concentrationBeforeSense, after: start.concentrationAfterSense });
      }
      const heartResult = resolveHeartDemon(enemy, this.app.rng);
      if (heartResult.triggered) {
        const beforeHeart = getStatus(enemy, "heartDemon");
        // Heart Demon is visually distinct from normal attack/defense feedback:
        // tint the whole enemy card red and shake it slightly before damage lands.
        await this.app.flashEnemyAction?.(enemy.uid, "heart-demon", 500);
        const beforeHp = enemy.hp;
        const heartDamage = Math.floor(enemy.maxHp * 0.08);
        beginZeroHpPause(this.app, enemy);
        enemy.hp = Math.max(0, enemy.hp - heartDamage);
        beginZeroHpPause(this.app, enemy);
        recordCombatDamage(state, enemy, beforeHp, enemy.hp);
        const heartWindRaccoonPending = enemy.hp <= 0 && this.app.effects.canTriggerWindRaccoonBody(enemy);
        const actualHeartDamage = Math.max(0, beforeHp - enemy.hp);
        consumeConcentrationOnHpLoss(enemy, actualHeartDamage);
        removeStatus(enemy, "heartDemon", 1);
        this.addLog("combat.log.heartDemonEnemy", {
          name: this.unitRef(enemy),
          before: beforeHeart,
          after: getStatus(enemy, "heartDemon"),
          chance: heartResult.chance,
          damage: actualHeartDamage,
        });
        if (actualHeartDamage > 0) {
          this.app.audio.play("hit", .5);
          this.app.audio.playEnemyHit?.(enemy);
          const heartUndyingPending = enemy.hp <= 0 && !heartWindRaccoonPending && getStatus(enemy, "undying") > 0;
          const deathFx = beforeHp > 0 && enemy.hp <= 0 && !heartWindRaccoonPending && !heartUndyingPending ? this.app.startEnemyDeathFx?.(enemy) : null;
          await this.app.showDamagePopup(enemy, actualHeartDamage, { duration: 560 });
          await this.app.effects.waitForLethalResolution(enemy);
          if (deathFx) await deathFx;
          if (heartWindRaccoonPending) await this.app.effects.finalizeWindRaccoonBodyIfNeeded(enemy);
          else if (heartUndyingPending) await this.app.effects.finalizeUndyingIfNeeded(enemy);
        }
        if (enemy.hp <= 0) {
          this.cleanupDeadEnemies();
          if (!this.getLivingEnemies().length) return this.finishVictory();
          continue;
        }
        // Undying may rebuild combatFlags; retain the pre-decay count for the
        // forced attack if the left protector survives the flare by reviving.
        if (enemy.enemyId === "zhengyangLeftProtector") enemy.combatFlags.leftProtectorHeartBeforeFlare = beforeHeart;
      }
      if (enemy.combatFlags.skipNextTurn) {
        enemy.combatFlags.skipNextTurn = false;
        delete enemy.combatFlags.leftProtectorHeartBeforeFlare;
        if (rookieSwordDiscountWasActive) delete enemy.combatFlags.rookieSwordControlFreeNext;
        if (hadWolfHowlActive) delete enemy.combatFlags.wolfHowlActive;
        if (enemyIronBoneWasActive) {
          delete enemy.combatFlags.ironBoneActive;
          if (enemy.intent) delete enemy.intent.lockedIronBoneBonus;
        }
        if (enemyMartialBurstWasActive) delete enemy.combatFlags.enemyMartialBurst;
        this.addLog("combat.log.skip", { name: this.unitRef(enemy) });
        continue;
      }
      const forcedFrenzy = enemy.enemyId === "zhengyangLeftProtector" && heartResult.triggered;
      if (start.skip || (heartResult.triggered && !forcedFrenzy)) {
        const skipLogKey = start.entangleTriggered
          ? "combat.log.entangleSkip"
          : start.skip && getStatus(enemy, "stun") > 0
            ? "combat.log.stunSkip"
            : start.skip && getStatus(enemy, "freeze") > 0
              ? "combat.log.freezeSkip"
            : "combat.log.skip";
        this.addLog(skipLogKey, { name: this.unitRef(enemy) });
      } else {
        if (forcedFrenzy) {
          enemy.intent = this.ai.replaceIntentSkill(enemy, "frenzyPalmPlus");
          if (enemy.combatFlags.ironBoneActive) enemy.intent.lockedIronBoneBonus = this.ai.dynamicIronBoneDamageBonus(enemy);
          const forcedSkill = def.skills.find((candidate) => candidate.id === "frenzyPalmPlus");
          enemy.intent.preview = this.ai.previewFor(enemy, forcedSkill);
          enemy.intent.hidden = false;
          enemy.intent.revealed = true;
          this.app.render();
        }
        const skill = def.skills.find((s) => s.id === enemy.intent?.skillId) ?? def.skills[def.skills.length - 1];
        const skillManaCost = this.ai?.skillManaCost?.(skill, enemy) ?? Math.max(0, Math.floor(skill?.manaCost ?? 0));
        if (skillManaCost <= enemy.mana) {
          enemy.mana -= skillManaCost;
          this.addLog("combat.log.enemySkill", { source: this.unitRef(enemy), action: this.nameRef(enemy.intent?.displayNameKey ?? skill.nameKey) });
          enemy.combatFlags ??= {};
          enemy.combatFlags.skillUseCounts ??= {};
          enemy.combatFlags.skillUseCounts[skill.id] = (enemy.combatFlags.skillUseCounts[skill.id] ?? 0) + 1;
          if (enemy.enemyId === "hiddenSwordOuterDisciple") {
            rookieSwordControlExecuted = ["rookieSwordControl", "rookieSwordControlPlus"].includes(skill.id);
            if (rookieSwordControlExecuted) enemy.combatFlags.rookieSwordControlFreeNext = true;
            else delete enemy.combatFlags.rookieSwordControlFreeNext;
          }
          await this.app.flashEnemyAction(enemy.uid, skill.type ?? "support", 500, skill.skillSfxKey);
          const resolvedSkillEffects = this.resolveEnemySkillEffects(enemy, skill);
          const lostMindSelfAttack = skill.type === "attack"
            && getStatus(enemy, "lostMind") > 0
            && this.app.rng.chance(25);
          if (lostMindSelfAttack) this.addLog("combat.log.lostMindSelf", { name: this.unitRef(enemy) });
          const beforeSkillMaxHp = Math.max(0, Math.floor(enemy.maxHp ?? 0));
          const ghostArmed = skill.type === "attack" && !lostMindSelfAttack && state.player.hp > 0
            && getStatus(state.player, "freeze") <= 0 && getStatus(state.player, "stun") <= 0
            ? state.player.combatFlags?.ghostFlash : null;
          // Gold-Stone Burst is unavoidable; it cannot consume the player's
          // armed Ghost Flash or trigger its evasion/counterattack branch.
          const ghostDodgesThisAttacker = Boolean(ghostArmed && !ghostArmed.triggered
            && !skill.effects?.some((effect) => effect.type === "shatterDefensesDamage"));
          if (ghostDodgesThisAttacker) { ghostArmed.triggered = true; this.addLog("combat.log.ghostFlashDodge", { source: this.unitRef(state.player), target: this.unitRef(enemy) }); }
          const skillEffectResult = await this.app.effects.executeEffects(resolvedSkillEffects, {
            source: enemy, target: lostMindSelfAttack ? enemy : state.player, targetMode: lostMindSelfAttack ? "self" : "player",
            actionKey: skill.nameKey, actionTags: skill.tags ?? [], forceAttackSelf: lostMindSelfAttack,
            playerDodgesAttack: ghostDodgesThisAttacker, adaptiveTalismanChoice: enemy.intent?.adaptiveTalismanChoice ?? null,
          });
          if (skill.cooldownRoundsAfterUse) {
            enemy.combatFlags.skillLastUsedRound ??= {};
            enemy.combatFlags.skillLastUsedRound[skill.id] = c.round;
          }
          if (skill.id === "bloodPill") this.consumeEnemyBloodPill(enemy);
          if (skillEffectResult?.combatEnded) return;
          if (forcedFrenzy) delete enemy.combatFlags.leftProtectorHeartBeforeFlare;
          if (enemy.hp <= 0) {
            this.cleanupDeadEnemies();
            if (!this.getLivingEnemies().length) return this.finishVictory();
            continue;
          }
          // DESIGN LOCK: this branch is for ordinary enemy skill attacks. Any
          // future enemy talisman attack must bypass player Mountain/Huntian
          // reactions, mirroring current player inventory-talisman behavior.
          if (skill.type === "attack" && !skill.bypassPlayerReactions && !lostMindSelfAttack && state.player.hp > 0) {
            if (ghostDodgesThisAttacker) {
              const ghostCounter = await this.triggerGhostFlashCounter(enemy, ghostArmed?.shadowKickPlusUses ?? 0);
              if (state.player.combatFlags?.huntian) this.triggerHuntian(enemy);
              delete state.player.combatFlags.ghostFlash;
              if (ghostCounter?.combatEnded) return;
            } else if (state.player.combatFlags?.mountainCounter) {
              const counter = await this.triggerMountainCounter(enemy);
              if (state.player.combatFlags?.huntian) this.triggerHuntian(enemy);
              if (counter?.combatEnded) return;
            } else if (state.player.combatFlags?.huntian) this.triggerHuntian(enemy);
          }
          // Snake Slough is produced only by a successful Shed: merely selecting /
          // paying for the skill is not enough. The Max-HP increase is the concrete
          // success signal, kept separate from generic skillUseCounts used elsewhere.
          if (skill.id === "shed" && Math.max(0, Math.floor(enemy.maxHp ?? 0)) > beforeSkillMaxHp) {
            enemy.combatFlags.successfulSkillUseCounts ??= {};
            enemy.combatFlags.successfulSkillUseCounts.shed = (enemy.combatFlags.successfulSkillUseCounts.shed ?? 0) + 1;
          }
          if (state.player.hp <= 0) return this.app.onPlayerDeath();
          this.app.render();
          await this.app.wait(220);
        } else {
          this.addLog("combat.log.enemyNoManaSkip", { name: this.unitRef(enemy) });
        }
      }
      if (forcedFrenzy) delete enemy.combatFlags.leftProtectorHeartBeforeFlare;
      // Sword Control's free follow-up exists for exactly the next own turn. If
      // that turn was skipped, consumed by Heart Demon, or used for another action,
      // an unused old discount expires. Executing Sword Control again re-arms a fresh
      // discount; an Undying revival may still purge that freshly armed flag.
      if (rookieSwordDiscountWasActive && !rookieSwordControlExecuted) delete enemy.combatFlags.rookieSwordControlFreeNext;
      if (enemyIronBoneWasActive) {
        delete enemy.combatFlags.ironBoneActive;
        if (enemy.intent) delete enemy.intent.lockedIronBoneBonus;
      }
      if (enemyMartialBurstWasActive) delete enemy.combatFlags.enemyMartialBurst;
      const end = await this.endTurnWithFeedback(enemy);
      this.logEndTurnGuardGains(enemy, end);
      if (end.nirvanaPending) await this.app.effects.finalizeNirvanaFromBurnIfNeeded(enemy, end.nirvanaBurnStacks);
      else if (enemy.hp <= 0) await this.app.effects.finalizePendingLethalRecovery(enemy);
      const pendingImmediateUids = Array.isArray(c.pendingImmediateEnemyUids) ? c.pendingImmediateEnemyUids.splice(0) : [];
      if (pendingImmediateUids.length) {
        const pendingUnits = pendingImmediateUids
          .map((uidValue) => c.enemies.find((unit) => unit.uid === uidValue))
          .filter((unit) => unit?.hp > 0 && !order.some((queued) => queued.uid === unit.uid));
        if (pendingUnits.length) order.splice(orderIndex + 1, 0, ...pendingUnits);
      }
      if (hadWolfHowlActive) delete enemy.combatFlags.wolfHowlActive;
      if (state.player.hp <= 0) return this.app.onPlayerDeath();
    }
    c.actingEnemyId = null;
    finishRoundDamage(state);
    this.cleanupDeadEnemies();
    if (!this.getLivingEnemies().length) return this.finishVictory();
    // v0.2.52 death rewind is map-node based. Combat rounds are deliberately not
    // rewind checkpoints; ordinary run persistence still continues here.
    this.app.persist?.();
    await this.startPlayerTurn();
    this.app.render();
  }

  logEndTurnGuardGains(unit, end) {
    for (const status of ["barrier", "petrify"]) {
      if ((end[`${status}Stacks`] ?? 0) <= 0) continue;
      const amount = end[`${status}GuardGained`] ?? 0;
      this.addLog(amount > 0 ? "combat.log.guardGain" : "combat.log.guardBlocked", amount > 0
        ? { target: this.unitRef(unit), amount, before: end[`${status}BeforeGuard`], after: end[`${status}AfterGuard`] }
        : { target: this.unitRef(unit) });
    }
  }

  getLivingEnemies() { return this.app.state.combat?.enemies?.filter((e) => e.hp > 0) ?? []; }

  normalizeSelectedEnemy() {
    const c = this.app.state.combat;
    if (!c) return;
    const living = this.getLivingEnemies();
    if (living.length === 1) {
      c.selectedEnemyId = living[0].uid;
      return;
    }
    if (!living.some((enemy) => enemy.uid === c.selectedEnemyId)) c.selectedEnemyId = null;
  }

  cleanupDeadEnemies() {
    const c = this.app.state.combat;
    if (!c) return;
    for (const enemy of c.enemies ?? []) {
      if (enemy.hp <= 0) clearDarkForce(enemy);
      if (enemy.hp <= 0 && !enemy.combatFlags.dropsGranted) {
        enemy.combatFlags.dropsGranted = true;
        recordEnemyDefeat(this.app.state);
        const def = ENEMIES[enemy.enemyId];
        // Summoned and ordinary golems roll the same complete per-enemy table.
        const resolvedDrops = def.drops ?? [];
        for (const drop of resolvedDrops) {
          const oncePerRunFlag = drop.oncePerRunFlag ?? null;
          const oncePerChapterFlag = drop.oncePerChapterFlag ?? null;
          const uniqueDropFlags = this.app.state.run?.uniqueDropFlags ?? {};
          const chapterIndex = Math.max(1, Math.min(4, Math.floor(Number(this.app.state.run?.chapterIndex) || 1)));
          const chapterDropKey = oncePerChapterFlag ? `${oncePerChapterFlag}:chapter:${chapterIndex}` : null;
          const uniqueChapterDropFlags = this.app.state.run?.uniqueChapterDropFlags ?? {};
          if (oncePerRunFlag && uniqueDropFlags[oncePerRunFlag]) continue;
          if (chapterDropKey && uniqueChapterDropFlags[chapterDropKey]) continue;
          const skillUnused = drop.guaranteedIfSkillUnused
            && Math.max(0, Math.floor(enemy.combatFlags?.skillUseCounts?.[drop.guaranteedIfSkillUnused] ?? 0)) === 0;
          if (!this.app.rng.chance(skillUnused ? 100 : (drop.chance ?? 100))) continue;
          const skillCount = drop.countFromCombatTotalFlag
            ? Math.max(0, Math.floor(c?.[drop.countFromCombatTotalFlag] ?? 0))
            : drop.countFromCombatFlag
              ? Math.max(0, Math.floor(enemy.combatFlags?.[drop.countFromCombatFlag] ?? 0))
              : drop.countFromSuccessfulSkillUses
              ? Math.max(0, Math.floor(enemy.combatFlags?.successfulSkillUseCounts?.[drop.countFromSuccessfulSkillUses] ?? 0))
              : drop.countFromSkillUses
                ? Math.max(0, Math.floor(enemy.combatFlags?.skillUseCounts?.[drop.countFromSkillUses] ?? 0))
                : null;
          const bonus = Number.isFinite(drop.bonusMin) || Number.isFinite(drop.bonusMax)
            ? this.app.rng.int(Math.max(0, Math.floor(drop.bonusMin ?? 0)), Math.max(Math.max(0, Math.floor(drop.bonusMin ?? 0)), Math.floor(drop.bonusMax ?? drop.bonusMin ?? 0)))
            : 0;
          const remainingFromUses = drop.baseCountMinusSkillUses?.skillId
            ? Math.max(0, Math.floor(drop.baseCountMinusSkillUses.base ?? 0)
              - Math.max(0, Math.floor(enemy.combatFlags?.skillUseCounts?.[drop.baseCountMinusSkillUses.skillId] ?? 0)))
            : null;
          const count = (remainingFromUses ?? skillCount ?? this.app.rng.int(drop.min ?? 1, drop.max ?? drop.min ?? 1)) + bonus;
          if (count <= 0) continue;
          c.loot ??= { stones: 0, items: {} };
          const markUniqueDrop = () => {
            this.app.state.run ??= {};
            if (oncePerRunFlag) {
              this.app.state.run.uniqueDropFlags ??= {};
              this.app.state.run.uniqueDropFlags[oncePerRunFlag] = true;
            }
            if (chapterDropKey) {
              this.app.state.run.uniqueChapterDropFlags ??= {};
              this.app.state.run.uniqueChapterDropFlags[chapterDropKey] = true;
            }
          };
          if (drop.currency === "stones") {
            c.loot.stones += count;
            if (drop.countFromCombatTotalFlag === "stolenStonesTotal") {
              c.loot.recoveredStones = Math.max(0, Math.floor(c.loot.recoveredStones ?? 0)) + Math.max(0, skillCount ?? 0);
            }
            markUniqueDrop();
            continue;
          }
          if (drop.artifactId && ARTIFACTS[drop.artifactId]) {
            c.loot.artifacts ??= {};
            c.loot.artifacts[drop.artifactId] = (c.loot.artifacts[drop.artifactId] ?? 0) + count;
            markUniqueDrop();
            continue;
          }
          if (Array.isArray(drop.itemPool) && drop.itemPool.length && Math.floor(drop.distinctPicks ?? 0) > 1) {
            const pool = [...new Set(drop.itemPool)];
            const picks = Math.min(pool.length, Math.max(1, Math.floor(drop.distinctPicks)));
            let grantedPick = false;
            for (let pickIndex = 0; pickIndex < picks; pickIndex += 1) {
              const picked = this.app.rng.pick?.(pool) ?? pool[this.app.rng.int(0, pool.length - 1)];
              const poolIndex = pool.indexOf(picked);
              if (poolIndex < 0) continue;
              c.loot.items[picked] = (c.loot.items[picked] ?? 0) + count;
              pool.splice(poolIndex, 1);
              grantedPick = true;
            }
            if (grantedPick) markUniqueDrop();
            continue;
          }
          const itemId = Array.isArray(drop.itemPool) && drop.itemPool.length
            ? (this.app.rng.pick?.(drop.itemPool) ?? drop.itemPool[this.app.rng.int(0, drop.itemPool.length - 1)])
            : drop.itemId;
          if (!itemId) continue;
          c.loot.items[itemId] = (c.loot.items[itemId] ?? 0) + count;
          markUniqueDrop();
        }
      }
    }
    this.normalizeSelectedEnemy();
  }


  grantPendingVictoryLoot() {
    const c = this.app.state?.combat;
    if (!c || c.lootGranted) return false;
    c.loot ??= { stones: 0, items: {} };
    const player = this.app.state.player;
    const stones = Math.max(0, Math.floor(c.loot.stones ?? 0));
    recordStoneGain(this.app.state, stones - recoveredVictoryStones(c));
    player.stones = (player.stones ?? 0) + stones;
    for (const [itemId, count] of Object.entries(c.loot.items ?? {})) {
      if ((count ?? 0) > 0) addInventoryItem(player, itemId, count);
    }
    for (const [artifactId, count] of Object.entries(c.loot.artifacts ?? {})) {
      if ((count ?? 0) > 0) grantArtifactWithTutorial(this.app, artifactId);
    }
    c.lootGranted = true;
    return true;
  }

  finishVictory() {
    const state = this.app.state;
    const combat = state.combat;
    if (!combat || combat.result) return;

    // Heart Demon now persists unchanged through victory. Only a flare-up
    // itself reduces the status by 1 stack.
    // Combat-end Mana recovery happens immediately, before victory/rest prompts.
    // It is a silent cleanup: clear any still-playing cost/regeneration popup so
    // the result screen never shows a stale -Mana number next to a full bar.
    setMana(state.player, state.player.maxMana);
    this.app.clearResourcePopup?.(state.player, "mana");
    if (state.player.combatFlags?.nextSpellCostOne) delete state.player.combatFlags.nextSpellCostOne; // legacy
    if (state.player.combatFlags?.nextSpellCostCap != null) delete state.player.combatFlags.nextSpellCostCap;
    if (state.player.combatFlags?.nextSwordControlCostReduction) delete state.player.combatFlags.nextSwordControlCostReduction;
    if (state.player.combatFlags?.nextSwordSpellCostReduction) delete state.player.combatFlags.nextSwordSpellCostReduction;
    if (state.player.combatFlags?.swordControlCostReduction) delete state.player.combatFlags.swordControlCostReduction; // legacy
    if (state.player.combatFlags?.swordSpellCostReduction) delete state.player.combatFlags.swordSpellCostReduction;
    if (state.player.combatFlags?.swordGodActive) delete state.player.combatFlags.swordGodActive;
    if (state.player.combatFlags?.waterDragonAfterThunderDiscount) delete state.player.combatFlags.waterDragonAfterThunderDiscount;
    this.clearTemporaryBodyCombatEffects();
    // [Undying] is combat-only: an unused stack disappears as soon as combat is
    // won, rather than lingering behind the victory overlay until it is dismissed.
    if (getStatus(state.player, "undying") > 0) removeStatus(state.player, "undying", Infinity);

    // Victory itself no longer grants generic Spirit Stones. Currency now comes
    // only from explicit enemy drops (currently the two humanoid pursuer types).
    combat.loot ??= { stones: 0, items: {} };
    // Final cleanup is idempotent and guarantees the killing blow's drops are
    // materialized before the victory ledger is granted.
    this.cleanupDeadEnemies();
    if (isOpeningWolfCombat(combat)) {
      state.run ??= {};
      state.run.openingWolfDefeated = true;
    }
    recordBattleOutcome(state, "victory");
    this.grantPendingVictoryLoot();
    combat.phase = "result";
    combat.selectedCardId = null;
    combat.selectedCardAt = 0;
    combat.longBattleEligible = this.isLongBattleEligible(combat);
    if (combat.rookieSquadEncounter && !combat.debugEncounter) {
      const chapter = Math.max(1, Math.min(4, Math.floor(Number(state.run?.chapterIndex) || 1)));
      state.map.rookieSquadPursuitStateByChapter ??= {};
      state.map.rookieSquadPursuitStateByChapter[chapter] = "defeated";
    }
    if (!combat.debugEncounter && (combat.enemies ?? []).some((enemy) => enemy.enemyId === "zhengyangChief")) {
      state.map.zhengyangChiefPursuitHideRemaining = 3;
    }
    combat.result = (combat.enemies ?? []).some((enemy) => enemy.enemyId === "qingyiCultivator")
      ? { type: "qingyiAftermath", loot: structuredClone(combat.loot) }
      : (combat.enemies ?? []).some((enemy) => enemy.enemyId === "zhengyangChief")
        ? { type: "zhengyangChiefAftermath", loot: structuredClone(combat.loot) }
        : combat.rookieSquadEncounter
          ? { type: "rookieSquadAftermath", loot: structuredClone(combat.loot) }
          : { type: "victory", loot: structuredClone(combat.loot) };
    // Freeze the clock as the Gate's loot prompt opens, before its dismissal.
    if (!combat.debugEncounter && combat.nodeId === "19B" && combat.enemies.some((enemy) => enemy.enemyId === "gate")) {
      this.app.finishRunClockAtGateVictory?.();
    }
    state.overlay = null;

    // Ordinary wins keep the existing immediate loot+victory cue. Qingyi/Chief
    // first show a silent bespoke aftermath; the cue is deferred until dismissing
    // that aftermath actually reveals the normal loot result.
    if (combat.result.type === "victory") this.app.audio.play("win", .5);
    this.app.persist();
    this.app.render();
  }

  isSwiftMapBattleEligible(combat = this.app.state?.combat) {
    if (!combat || combat.debugEncounter || combat.pursuit) return false;
    const node = combat.nodeId ? MAP_NODES[combat.nodeId] : null;
    if (!node || !["battle", "boss"].includes(node.type)) return false;
    return Math.max(0, Math.floor(combat.round ?? 0)) <= 2;
  }

  settleSwiftMapBattlePursuitIfEligible(combat = this.app.state?.combat) {
    if (!combat || combat.swiftBattlePursuitSettled || !this.isSwiftMapBattleEligible(combat)) return false;
    combat.swiftBattlePursuitSettled = true;
    const map = this.app.state?.map;
    if (!map) return false;
    recordPursuitRule(this.app, -1);
    reducePursuitValue(map, 1);
    return true;
  }

  isLongBattleEligible(combat = this.app.state?.combat) {
    return Boolean(combat && !combat.debugEncounter && Math.max(0, Math.floor(combat.round ?? 0)) > 10);
  }

  applyLongBattlePenaltyIfEligible(outcome) {
    const state = this.app.state;
    const combat = state.combat;
    if (!combat || combat.longBattleSettled || !combat.longBattleEligible) return false;
    combat.longBattleSettled = true;
    combat.result = { type: "longBattle", outcome };
    // v0.2.92: long-battle delay raises Pursuit but deliberately does NOT roll
    // another pursuit encounter immediately. The higher value only affects a
    // later Pursuit-triggering event.
    if (state.map) {
      recordPursuitRule(this.app, 1, { reason: "longBattle" });
      state.map.pursuit = Math.min(5, Math.max(0, Math.floor(state.map.pursuit ?? 0)) + 1);
      recordPursuitPeak(state);
      if (state.map.pendingSenseRecoveryNode) state.map.pendingMoveHadLongBattle = true;
    }
    this.app.persist();
    this.app.render();
    return true;
  }

  completeLongBattleResult() {
    const combat = this.app.state?.combat;
    if (!combat || combat.result?.type !== "longBattle") return false;
    const outcome = combat.result.outcome;
    if (outcome === "escape") return this.finalizeEscapeExit();
    if (outcome === "enemyEscape") return this.finalizeEnemyEscapeExit();
    return this.finalizeVictoryExit();
  }

  finalizeVictoryExit() {
    const state = this.app.state;
    const combat = state.combat;
    if (!combat) return;
    if (combat.debugEncounter) {
      const returnScreen = combat.debugReturnScreen ?? "map";
      this.preservePersistentPlayerStatuses();
      state.player.qi = 0;
      state.player.guard = 0;
      state.combat = null;
      state.overlay = null;
      state.screen = returnScreen;
      this.app.persist();
      this.app.render();
      return;
    }
    const wasPursuit = combat.pursuit;
    const nodeId = combat.nodeId;
    const node = nodeId ? MAP_NODES[nodeId] : null;

    this.preservePersistentPlayerStatuses();
    state.player.qi = 0;
    state.player.guard = 0;
    state.combat = null;
    state.overlay = null;
    state.screen = "map";
    state.map.canStayRest = false;

    if (wasPursuit) {
      this.app.map.preparePathSelection();
    } else {
      this.app.map.completeCurrentNodeIfNeeded();
      if (node?.type === "battle" || nodeId === "18B") {
        // The Stone Gate Tiger at 18B is a boss node, but it still resolves like
        // an ordinary map battle before the final Gate: offer the usual optional
        // post-battle meditation instead of skipping straight to path selection.
        state.map.postBattlePrompt = { nodeId };
      } else {
        this.app.map.preparePathSelection();
      }
    }

    // A pursuit encounter is chained content attached to the last completed map
    // node. Once it has actually ended, refresh that same-node checkpoint so rewind
    // can never resurrect the already-dismissed pursuitPrompt / replay the pursuer.
    if (!state.map.postBattlePrompt) this.app.commitPursuitSettlement?.();
    this.app.persist(wasPursuit);
    this.app.render();
  }


  completeQingyiAftermath() {
    const combat = this.app.state?.combat;
    if (!combat || combat.result?.type !== "qingyiAftermath") return false;
    combat.result = { type: "victory", loot: structuredClone(combat.result.loot ?? combat.loot ?? { stones: 0, items: {} }) };
    this.app.audio.play("win", .5);
    this.app.persist();
    this.app.render();
    return true;
  }

  completeZhengyangChiefAftermath() {
    const combat = this.app.state?.combat;
    if (!combat || combat.result?.type !== "zhengyangChiefAftermath") return false;
    combat.result = { type: "victory", loot: structuredClone(combat.result.loot ?? combat.loot ?? { stones: 0, items: {} }) };
    this.app.audio.play("win", .5);
    this.app.persist();
    this.app.render();
    return true;
  }

  completeRookieSquadAftermath() {
    const combat = this.app.state?.combat;
    if (!combat || combat.result?.type !== "rookieSquadAftermath") return false;
    combat.result = { type: "victory", loot: structuredClone(combat.result.loot ?? combat.loot ?? { stones: 0, items: {} }) };
    this.app.audio.play("win", .5);
    this.app.persist();
    this.app.render();
    return true;
  }

  completeVictoryResult() {
    const state = this.app.state;
    const combat = state.combat;
    if (!combat || combat.result?.type !== "victory") return;

    if (combat.encounterId === "zhengyangLeftProtector") {
      // This scripted pursuit ends the chase completely, even after a long fight.
      recordPursuitRule(this.app, 0, { clear: true });
      reducePursuitValue(state.map, Math.max(0, Math.floor(state.map.pursuit ?? 0)));
      return this.finalizeVictoryExit();
    }
    // Defeating a pursuer reduces Pursuit by exactly 1. Swift-kill reduction is
    // limited to ordinary map battle/boss nodes and never applies to a pursuit.
    if (combat.pursuit && !combat.pursuitVictorySettled) {
      recordPursuitRule(this.app, -1);
      reducePursuitValue(state.map, 1);
      combat.pursuitVictorySettled = true;
    }
    const swiftKill = this.settleSwiftMapBattlePursuitIfEligible(combat);
    if (this.applyLongBattlePenaltyIfEligible("victory")) return;
    if (swiftKill && !combat.swiftBattleResultShown) {
      combat.swiftBattleResultShown = true;
      combat.result = { type: "swiftKill" };
      this.app.persist();
      this.app.render();
      return true;
    }
    return this.finalizeVictoryExit();
  }

  completeSwiftKillResult() {
    const combat = this.app.state?.combat;
    if (!combat || combat.result?.type !== "swiftKill") return false;
    return this.finalizeVictoryExit();
  }

  finalizeEscapeExit() {
    const state = this.app.state;
    const combat = state.combat;
    if (!combat) return false;
    if (combat.debugEncounter) {
      const returnScreen = combat.debugReturnScreen ?? "map";
      state.combat = null;
      state.overlay = null;
      state.screen = returnScreen;
      this.app.persist();
      this.app.render();
      return true;
    }
    const wasPursuit = combat.pursuit;
    const nodeId = combat.nodeId;
    if (wasPursuit && combat.rookieSquadEncounter) {
      const chapter = Math.max(1, Math.min(4, Math.floor(Number(state.run?.chapterIndex) || 1)));
      state.map.rookieSquadPursuitStateByChapter ??= {};
      if (state.map.rookieSquadPursuitStateByChapter[chapter] !== "defeated") {
        state.map.rookieSquadPursuitStateByChapter[chapter] = combat.rookieSquadFirstEncounter ? "escapedCooldown" : "escaped";
      }
    }

    state.combat = null;
    state.overlay = null;
    state.screen = "map";
    state.map.canStayRest = false;

    // The final Gate may be fled, but fleeing it does not count as passing it.
    // Return explicitly to the already-defeated Stone Tiger node. Do not depend
    // on map.history here: debug-jumping straight to 19B has no synthetic 18B
    // history entry, which previously left the player stranded on layer 19.
    if (!wasPursuit && nodeId === "19B") {
      state.map.resolved["19B"] = false;
      state.map.resolved["18B"] = true;
      if (state.map.pendingSenseRecoveryNode === "19B") state.map.pendingSenseRecoveryNode = null;
      state.map.pendingMoveHadPursuit = false;
      state.map.pendingMoveHadLongBattle = false;
      if (state.map.history?.at?.(-1) === "18B") state.map.history.pop();
      state.map.currentNodeId = "18B";
      state.map.pathRecoveryAtNode = null;
    } else if (!wasPursuit && nodeId && !state.map.resolved[nodeId]) {
      state.map.resolved[nodeId] = true;
      this.app.persist(true);
    }
    this.app.map.preparePathSelection();
    if (!wasPursuit && nodeId === "19B") {
      // Refresh the death-rewind checkpoint at the returned 18B state. In normal
      // play this has the same rewind identity as the existing 18B checkpoint,
      // so SaveManager replaces that entry instead of adding rewind depth.
      this.app.syncRng?.();
      this.app.save?.saveRun?.(state);
      this.app.save?.saveRewindNode?.(state, "gateEscape");
    }
    // Escaping a pursuer also settles that chained encounter. Save the settled state
    // as the latest safe snapshot on the same completed node, without changing its
    // checkpoint identity / rewind-streak semantics.
    this.app.commitPursuitSettlement?.();
    this.app.persist(wasPursuit);
    this.app.render();
    return true;
  }

  completeEscapeResult() {
    const combat = this.app.state?.combat;
    if (!combat || combat.result?.type !== "escape") return false;
    const stolen = Math.max(0, Math.floor(combat.stolenStonesTotal ?? 0));
    if (stolen > 0) {
      combat.result = { type: "escapeStolen", stolenStones: stolen, swift: Boolean(combat.result.swift) };
      this.app.persist();
      this.app.render();
      return true;
    }
    this.settleSwiftMapBattlePursuitIfEligible(combat);
    if (this.applyLongBattlePenaltyIfEligible("escape")) return true;
    return this.finalizeEscapeExit();
  }

  completeEscapeStolenResult() {
    const combat = this.app.state?.combat;
    if (!combat || combat.result?.type !== "escapeStolen") return false;
    this.settleSwiftMapBattlePursuitIfEligible(combat);
    if (this.applyLongBattlePenaltyIfEligible("escape")) return true;
    return this.finalizeEscapeExit();
  }
}
