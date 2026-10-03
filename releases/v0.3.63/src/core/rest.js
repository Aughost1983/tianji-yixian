import { CARDS } from "../data/cards.js";
import { ITEMS } from "../data/items.js";
import { getStatus, removeStatus, heartDemonTriggerChance } from "./status.js";
import { appendCardInstance, addCardUseCount, ensureCardUseCounts, getCardUseCount } from "./state.js";
import { noteAdvancedSkill } from "./run-records.js";
import { ADVANCED_UPGRADE_CHAINS, ADVANCED_UNLOCK_ORDER, ADVANCED_UNLOCK_RULES, ADVANCED_TERMINAL_CARD_IDS, getElementalRefinementPenalty, isAdvancedUnlockEligible } from "../data/progression.js";

export const HEART_DEMON_CARD_ID = "heartDemonCard";
export const HARMONIZE_MIN_DECK_SIZE = 15;
export const HARMONIZE_SENSE_MILESTONES = Object.freeze([2, 4, 8, 16, 32]);

export function nextHarmonizeSenseMilestone(count = 0) {
  const completed = Math.max(0, Math.floor(Number(count) || 0));
  return HARMONIZE_SENSE_MILESTONES.find((milestone) => milestone > completed) ?? null;
}

export const REST_COSTS = Object.freeze({
  refineBody: { sense: 0, refiningPill: 0 },
  refineSpirit: { sense: 0, refiningPill: 0 },
  harmonize: { sense: 0, refiningPill: 0 },
});

export class RestEngine {
  constructor(app) { this.app = app; }

  ensureRefineStats() {
    const state = this.app.state;
    state.run ??= {};
    const defaults = {
      success: 0, failure: 0, pillsConsumed: 0, basicUpgrades: 0,
      advancedUnlocks: 0, advancedFirstUpgrades: 0, advancedSecondUpgrades: 0,
      manualSuccess: 0, manualFailure: 0, bodySuccess: 0, bodyFailure: 0,
      harmonizeSuccess: 0, harmonizeFailure: 0,
    };
    const stats = state.run.refineStats && typeof state.run.refineStats === "object" ? state.run.refineStats : {};
    for (const [key, value] of Object.entries(defaults)) stats[key] = Math.max(0, Math.floor(Number(stats[key] ?? value) || 0));
    state.run.refineStats = stats;
    return stats;
  }

  getRefineStats() { return { ...this.ensureRefineStats() }; }

  recordRefineStat(key, amount = 1) {
    const stats = this.ensureRefineStats();
    if (!(key in stats)) return;
    stats[key] = Math.max(0, Math.floor(Number(stats[key]) || 0) + Math.max(0, Math.floor(Number(amount) || 0)));
  }

  recordChoiceOutcome(type, succeeded) {
    const keys = {
      studyManual: ["manualSuccess", "manualFailure"],
      refineBody: ["bodySuccess", "bodyFailure"],
      refineSpirit: ["success", "failure"],
      harmonize: ["harmonizeSuccess", "harmonizeFailure"],
    }[type];
    if (keys) this.recordRefineStat(keys[succeeded ? 0 : 1]);
  }

  getSuccessChance() {
    const p = this.app.state.player;
    const heart = getStatus(p, "heartDemon");
    if (heart <= 0) return 100;
    return Math.max(0, 100 - heartDemonTriggerChance(p));
  }

  getChoiceCost(choiceOrType) {
    const choice = typeof choiceOrType === "string" ? { type: choiceOrType } : (choiceOrType ?? {});
    const base = REST_COSTS[choice.type] ?? { sense: 0, refiningPill: 0 };
    if (choice.type === "studyManual") return {
      ...base,
      sense: 0,
      focusPill: Math.max(0, Math.floor(Number(choice.focusPills) || 0)),
    };
    if (choice.type !== "refineSpirit") return { ...base };
    return {
      ...base,
      refiningPill: Math.max(0, Math.floor(Number(choice.refiningPills) || 0)),
    };
  }

  manualStudyCount(itemId) {
    const item = ITEMS[itemId];
    if (!item || item.type !== "manual" || !item.learnCardId) return 0;
    return (this.app.state.player.deck ?? []).filter((card) => card.cardId === item.learnCardId).length;
  }

  isStudyableManualDefinition(item) {
    return Boolean(item?.type === "manual" && (CARDS[item.learnCardId] || item.studyEffect));
  }

  getManualStudyBaseChance(itemId) {
    const item = ITEMS[itemId];
    if (!this.isStudyableManualDefinition(item)) return 0;
    if (!item.learnCardId) return 100;
    return Math.max(0, 100 - this.manualStudyCount(itemId) * 20);
  }

  getFocusPillSenseGain() {
    const effect = (ITEMS.focusPill?.effects ?? []).find((entry) => entry?.type === "gainSense");
    return Math.max(0, Math.floor(Number(effect?.amount) || 0));
  }

  getManualStudySenseCoefficient(itemId, focusPills = 0) {
    const item = ITEMS[itemId];
    if (!this.isStudyableManualDefinition(item)) return 0;
    const rarity = Math.max(1, Math.floor(Number(item.rarity) || 1));
    const pillCount = Math.max(0, Math.floor(Number(focusPills) || 0));
    const sense = Math.max(0, Number(this.app.state.player.sense) || 0) + pillCount * this.getFocusPillSenseGain();
    return Math.min(1, 0.5 + sense / (rarity * 5));
  }

  getManualStudyMeditationChance(focusPills = 0) {
    const p = this.app.state.player;
    const heart = getStatus(p, "heartDemon");
    if (heart <= 0) return 100;
    const pillCount = Math.max(0, Math.floor(Number(focusPills) || 0));
    const effectiveSense = Math.max(0, Number(p.sense) || 0) + pillCount * this.getFocusPillSenseGain();
    const effectivePlayer = { ...p, sense: effectiveSense };
    return Math.max(0, 100 - heartDemonTriggerChance(effectivePlayer));
  }

  getManualStudyFormulaChance(itemId, focusPills = 0) {
    return this.getManualStudyBaseChance(itemId) * this.getManualStudySenseCoefficient(itemId, focusPills);
  }

  getManualStudyFinalChance(itemId, focusPills = 0) {
    const raw = this.getManualStudyFormulaChance(itemId, focusPills) * this.getManualStudyMeditationChance(focusPills) / 100;
    return Math.max(0, Math.min(100, Math.floor(raw)));
  }

  canStudyManual(itemId) {
    const item = ITEMS[itemId];
    return Boolean(this.isStudyableManualDefinition(item) && (this.app.state.player.inventory?.[itemId] ?? 0) > 0);
  }

  getRefineFormulaChance(card, refiningPills = 0) {
    if (!card || !this.canUpgrade(card)) return 0;
    const usage = getCardUseCount(this.app.state.player, card);
    const targetId = ADVANCED_UPGRADE_CHAINS[card.cardId];
    const baseChance = targetId
      ? (String(targetId).endsWith("PlusPlus") ? 0 : 25)
      : 50;
    const normalFormulaChance = Math.max(0, Math.min(100, baseChance + usage + Math.max(0, Math.floor(Number(refiningPills) || 0)) * 33));
    const elementalPenalty = getElementalRefinementPenalty(this.app.state.player, card);
    return Math.max(0, normalFormulaChance - elementalPenalty);
  }

  getRefineFinalChance(card, refiningPills = 0) {
    const refineChance = this.getRefineFormulaChance(card, refiningPills);
    return Math.max(0, Math.min(100, Math.floor(refineChance * this.getSuccessChance() / 100)));
  }

  isHeartDemonCard(card) {
    return card?.cardId === HEART_DEMON_CARD_ID;
  }

  hasChoiceResources(choice) {
    const p = this.app.state.player;
    const cost = this.getChoiceCost(choice);
    if ((p.sense ?? 0) < cost.sense) return false;
    if ((p.inventory?.refiningPill ?? 0) < (cost.refiningPill ?? 0)) return false;
    if ((p.inventory?.focusPill ?? 0) < (cost.focusPill ?? 0)) return false;
    return true;
  }

  validateChoice(choice) {
    const p = this.app.state.player;
    if (!choice?.type || !this.hasChoiceResources(choice)) return false;
    if (choice.type === "refineBody") return true;
    if (choice.type === "refineSpirit") {
      const card = p.deck.find((c) => c.uid === choice.cardUid);
      return Boolean(card && !card.upgraded && this.canUpgrade(card) && this.getRefineFinalChance(card, choice.refiningPills) > 0);
    }
    if (choice.type === "harmonize") {
      if (!choice.cardAUid || !choice.cardBUid || choice.cardAUid === choice.cardBUid) return false;
      const a = p.deck.find((c) => c.uid === choice.cardAUid);
      const b = p.deck.find((c) => c.uid === choice.cardBUid);
      return Boolean(a && b && p.deck.length - 2 >= HARMONIZE_MIN_DECK_SIZE);
    }
    if (choice.type === "studyManual") {
      return this.canStudyManual(choice.itemId) && this.getManualStudyFinalChance(choice.itemId, choice.focusPills) > 0;
    }
    return false;
  }

  consumeChoiceResources(choice) {
    const p = this.app.state.player;
    const cost = this.getChoiceCost(choice);
    const beforeSense = p.sense ?? 0;
    p.sense = Math.max(0, beforeSense - cost.sense);
    if (p.sense !== beforeSense) void this.app.showResourceChange?.(p, "sense", beforeSense, p.sense, { wait: false });
    if ((cost.refiningPill ?? 0) > 0) {
      p.inventory ??= {};
      p.inventory.refiningPill = Math.max(0, (p.inventory.refiningPill ?? 0) - cost.refiningPill);
      if (choice.type === "refineSpirit") this.recordRefineStat("pillsConsumed", cost.refiningPill);
    }
    if ((cost.focusPill ?? 0) > 0) {
      p.inventory ??= {};
      p.inventory.focusPill = Math.max(0, (p.inventory.focusPill ?? 0) - cost.focusPill);
      const beforeFocusSense = Math.max(0, Number(p.sense) || 0);
      p.sense = beforeFocusSense + cost.focusPill * this.getFocusPillSenseGain();
      if (p.sense !== beforeFocusSense) void this.app.showResourceChange?.(p, "sense", beforeFocusSense, p.sense, { wait: false });
    }
    return cost;
  }

  async presentResult(sound, gain) {
    if (this.app.presentRestResultWithSound) {
      await this.app.presentRestResultWithSound(sound, gain);
    } else {
      this.app.render?.();
      this.app.audio?.play?.(sound, gain);
    }
  }

  async attemptChoice(choice) {
    const state = this.app.state;
    const p = state.player;
    if (!this.validateChoice(choice)) return false;
    // Load both possible result cues during progress, before the prompt exists.
    this.app.audio?.preload?.(["win", "fail"]);

    state.screen = "rest";
    state.map.restHeartDemonResult = null;
    state.map.restSuccessResult = null;
    this.app.restSuccessDismissLocked = false;

    // Refine Body, Deduction and Harmonize all use the ordinary meditation
    // Heart-Demon interruption roll. Manual study is the exception: its requested
    // formula folds the meditation-success factor into one composite final chance,
    // with the Sense coefficient X capped at 1 before Heart-Demon pressure.
    const heartSensitive = ["refineBody", "refineSpirit", "harmonize"].includes(choice.type);
    const heart = heartSensitive ? getStatus(p, "heartDemon") : 0;
    const triggerChance = heart > 0 ? heartDemonTriggerChance(p) : 0;
    const triggered = heart > 0 && Boolean(this.app.rng?.chance?.(triggerChance));
    this.consumeChoiceResources(choice);

    const stopPercent = triggered ? Math.max(0, 100 - triggerChance) : 100;
    await this.app.animateRestProgress?.(choice.type, { targetPercent: stopPercent });

    if (triggered) {
      this.recordChoiceOutcome(choice.type, false);
      const beforeHeart = getStatus(p, "heartDemon");
      const heartCards = [appendCardInstance(p, HEART_DEMON_CARD_ID)];
      removeStatus(p, "heartDemon", 1);
      state.map.restHeartDemonResult = {
        chance: triggerChance,
        cardUids: heartCards.map((card) => card.uid),
        beforeHeart,
        afterHeart: getStatus(p, "heartDemon"),
      };
      this.app.persist();
      await this.presentResult("fail", .45);
      void this.app.flashPlayerHeartDemon?.(500, { playSound: false, renderFirst: false });
      return false;
    }

    if (choice.type === "refineSpirit") {
      const card = p.deck.find((entry) => entry.uid === choice.cardUid);
      const refineChance = this.getRefineFormulaChance(card, choice.refiningPills);
      const refined = refineChance >= 100 || Boolean(this.app.rng?.chance?.(refineChance));
      if (!refined) {
        this.recordChoiceOutcome(choice.type, false);
        const usageAfter = addCardUseCount(p, card, 5);
        state.map.restSuccessResult = { type: "refineSpiritFailure", refineChance, usageAfter };
        this.app.persist();
        await this.presentResult("fail", .42);
        return false;
      }
    }

    if (choice.type === "studyManual") {
      const studyChance = this.getManualStudyFinalChance(choice.itemId);
      const learned = studyChance >= 100 || Boolean(this.app.rng?.chance?.(studyChance));
      if (!learned) {
        this.recordChoiceOutcome(choice.type, false);
        state.map.restSuccessResult = { type: "studyManualFailure", itemId: choice.itemId, studyChance };
        this.app.persist();
        await this.presentResult("fail", .42);
        return false;
      }
    }

    const success = await this.performChoice(choice);
    if (!success) {
      this.recordChoiceOutcome(choice.type, false);
      this.app.audio?.play?.("fail", .42);
      this.app.restProgressHold = null;
      this.app.render?.();
      return false;
    }

    this.recordChoiceOutcome(choice.type, true);
    state.map.restSuccessResult = success;
    this.app.persist();
    await this.presentResult("win", .4);
    return true;
  }

  async performChoice(choice) {
    const p = this.app.state.player;

    if (choice.type === "refineBody") {
      const oldMaxHp = p.maxHp;
      const missing = Math.max(0, oldMaxHp - p.hp);
      const recovery = Math.min(missing, Math.ceil(oldMaxHp * .35));
      const beforeHp = p.hp;
      p.hp += recovery;
      const maxHpGain = Math.max(1, Math.ceil(recovery * .10));
      p.maxHp = oldMaxHp + maxHpGain;
      if (recovery > 0) {
        // Refine Body uses the same support cue as consuming a Blood Pill. The HP
        // popup starts immediately, while the result modal is allowed to appear
        // 280ms later. Dismissal remains locked until this exact 560ms popup
        // promise finishes, so an early tap can never leave Rest prematurely.
        this.app.audio?.play?.("support", .6);
        this.app.restSuccessDismissLocked = true;
        const popupPromise = Promise.resolve(
          this.app.showResourceChange?.(p, "hp", beforeHp, p.hp, { duration: 560, wait: true })
        );
        void popupPromise.finally(() => { this.app.restSuccessDismissLocked = false; });
        await this.app.wait?.(280);
      }
      return { type: "refineBody", hpRecovered: recovery, maxHpGain };
    }

    if (choice.type === "refineSpirit") {
      const card = p.deck.find((c) => c.uid === choice.cardUid);
      if (!card || card.upgraded || !this.canUpgrade(card)) return null;
      const beforeCardId = card.cardId;
      const beforeUpgraded = Boolean(card.upgraded);
      const upgradeTarget = this.getUpgradeTarget(card);
      if (!upgradeTarget) return null;

      // Preserve true acquisition order. Refinement mutates the chosen card
      // instance in place rather than deleting it and appending a replacement.
      // Its uid and deck index therefore remain unchanged in Mind Sea/Refine/
      // Harmonize views.
      card.cardId = upgradeTarget.cardId;
      card.upgraded = Boolean(upgradeTarget.upgraded);
      noteAdvancedSkill(p, card.cardId, card.upgraded);
      ensureCardUseCounts(p);

      const advancedTarget = ADVANCED_UPGRADE_CHAINS[beforeCardId];
      if (advancedTarget) {
        this.recordRefineStat(String(advancedTarget).endsWith("PlusPlus") ? "advancedSecondUpgrades" : "advancedFirstUpgrades");
      } else {
        this.recordRefineStat("basicUpgrades");
      }

      this.queueAllAdvancedUnlocks();
      return {
        type: "refineSpirit",
        cardId: beforeCardId,
        beforeCardId,
        beforeUpgraded,
        afterCardId: upgradeTarget.cardId,
        afterUpgraded: Boolean(upgradeTarget.upgraded),
      };
    }

    if (choice.type === "studyManual") {
      const item = ITEMS[choice.itemId];
      if (!this.canStudyManual(choice.itemId) || !item) return null;

      let result = null;
      if (item.studyEffect?.type === "maxSense") {
        const amount = Math.max(0, Math.floor(Number(item.studyEffect.amount) || 0));
        p.maxSense = Math.max(0, Math.floor(Number(p.maxSense) || 0)) + amount;
        result = { type: "studyManual", itemId: choice.itemId, studyEffect: "maxSense", amount };
      } else if (item.studyEffect?.type === "maxMana") {
        const amount = Math.max(0, Math.floor(Number(item.studyEffect.amount) || 0));
        p.maxMana = Math.max(0, Math.floor(Number(p.maxMana) || 0)) + amount;
        result = { type: "studyManual", itemId: choice.itemId, studyEffect: "maxMana", amount };
      } else if (item.learnCardId && CARDS[item.learnCardId]) {
        const learned = appendCardInstance(p, item.learnCardId);
        result = { type: "studyManual", itemId: choice.itemId, cardId: item.learnCardId, cardUid: learned.uid };
      }
      if (!result) return null;

      // Grade-4 fragments and explicitly consumable higher-grade fragments are
      // consumed only after successful comprehension; failed study keeps them.
      if (Math.max(0, Math.floor(item.rarity ?? 0)) === 4 || item.consumeOnStudySuccess) {
        p.inventory ??= {};
        p.inventory[choice.itemId] = Math.max(0, Math.floor(p.inventory[choice.itemId] ?? 0) - 1);
      }
      return result;
    }

    if (choice.type === "harmonize") {
      const a = p.deck.find((c) => c.uid === choice.cardAUid);
      const b = p.deck.find((c) => c.uid === choice.cardBUid);
      if (!a || !b || a.uid === b.uid || p.deck.length - 2 < HARMONIZE_MIN_DECK_SIZE) return null;
      const first = { cardId: a.cardId, upgraded: Boolean(a.upgraded) };
      const second = { cardId: b.cardId, upgraded: Boolean(b.upgraded) };
      p.deck = p.deck.filter((c) => c.uid !== a.uid && c.uid !== b.uid);
      p.harmonizeCount = Math.max(0, Math.floor(Number(p.harmonizeCount) || 0)) + 1;
      const milestone = HARMONIZE_SENSE_MILESTONES.includes(p.harmonizeCount);
      return { type: "harmonize", first, second, remaining: p.deck.length, harmonizeCount: p.harmonizeCount, milestone };
    }

    return null;
  }

  refineBody() { return this.attemptChoice({ type: "refineBody" }); }

  refineSpirit(cardUid, refiningPills = 0) { return this.attemptChoice({ type: "refineSpirit", cardUid, refiningPills }); }

  studyManual(itemId, focusPills = 0) { return this.attemptChoice({ type: "studyManual", itemId, focusPills }); }

  getUpgradeTarget(card) {
    if (!card || card.upgraded || !CARDS[card.cardId]) return null;
    const advancedTarget = ADVANCED_UPGRADE_CHAINS[card.cardId];
    if (advancedTarget) return { cardId: advancedTarget, upgraded: false };
    if (ADVANCED_TERMINAL_CARD_IDS.includes(card.cardId)) return null;
    if (["gatherQi", "swordHeartClarity"].includes(card.cardId)) return null;
    if (this.isHeartDemonCard(card)) return null;
    return { cardId: card.cardId, upgraded: true };
  }

  canUpgrade(card) {
    return Boolean(this.getUpgradeTarget(card));
  }

  getRefinePreviewUnlocks(card) {
    const state = this.app.state;
    const p = state?.player;
    const upgradeTarget = this.getUpgradeTarget(card);
    if (!p || !upgradeTarget) return [];

    const simulatedPlayer = {
      ...p,
      deck: (p.deck ?? []).map((entry) => ({ ...entry })),
    };
    const simulatedCard = simulatedPlayer.deck.find((entry) => entry.uid === card.uid);
    if (!simulatedCard) return [];
    simulatedCard.cardId = upgradeTarget.cardId;
    simulatedCard.upgraded = Boolean(upgradeTarget.upgraded);

    const queue = Array.isArray(state?.map?.pendingRestCardUnlocks) ? state.map.pendingRestCardUnlocks : [];
    const flags = state?.world?.flags ?? {};
    const result = [];
    for (const cardId of ADVANCED_UNLOCK_ORDER) {
      const rule = ADVANCED_UNLOCK_RULES[cardId];
      if (!rule || rule.previewHidden) continue;
      if (flags[rule.flag]) continue;
      if ((p.deck ?? []).some((entry) => rule.variants.includes(entry.cardId))) continue;
      if (queue.some((entry) => entry.cardId === cardId)) continue;
      if (isAdvancedUnlockEligible(p, rule)) continue;
      if (isAdvancedUnlockEligible(simulatedPlayer, rule)) result.push(cardId);
    }
    return result;
  }

  shouldListForRefineSpirit(card) {
    if (!card || !CARDS[card.cardId]) return false;
    return this.canUpgrade(card) || Boolean(card.upgraded) || ADVANCED_TERMINAL_CARD_IDS.includes(card.cardId);
  }

  ensureUnlockQueue() {
    const state = this.app.state;
    state.map ??= {};
    if (!Array.isArray(state.map.pendingRestCardUnlocks)) state.map.pendingRestCardUnlocks = [];
    // v0.1.57 and earlier stored only one pending unlock.
    if (state.map.pendingRestCardUnlock?.cardId) {
      const id = state.map.pendingRestCardUnlock.cardId;
      if (!state.map.pendingRestCardUnlocks.some((entry) => entry.cardId === id)) state.map.pendingRestCardUnlocks.push({ cardId: id });
      state.map.pendingRestCardUnlock = null;
    }
    return state.map.pendingRestCardUnlocks;
  }

  queueAdvancedUnlockIfEligible(cardId) {
    const state = this.app.state;
    const p = state.player;
    const rule = ADVANCED_UNLOCK_RULES[cardId];
    if (!rule) return false;
    const queue = this.ensureUnlockQueue();
    state.world ??= { flags: {} };
    state.world.flags ??= {};
    if (state.world.flags[rule.flag]) return false;
    if (p.deck.some((card) => rule.variants.includes(card.cardId))) {
      state.world.flags[rule.flag] = true;
      return false;
    }
    if (queue.some((entry) => entry.cardId === cardId)) return false;
    if (!isAdvancedUnlockEligible(p, rule)) return false;
    queue.push({ cardId });
    return true;
  }

  queueAllAdvancedUnlocks() {
    let added = false;
    for (const cardId of ADVANCED_UNLOCK_ORDER) {
      if (this.queueAdvancedUnlockIfEligible(cardId)) added = true;
    }
    return added;
  }

  grantPendingRestCardUnlock() {
    const state = this.app.state;
    const queue = this.ensureUnlockQueue();
    const pending = queue.shift();
    if (!pending?.cardId) return false;
    state.world ??= { flags: {} };
    state.world.flags ??= {};
    const rule = ADVANCED_UNLOCK_RULES[pending.cardId];
    if (!rule) return this.grantPendingRestCardUnlock();
    if (!state.world.flags[rule.flag] && !state.player.deck.some((card) => rule.variants.includes(card.cardId))) {
      appendCardInstance(state.player, pending.cardId);
      state.world.flags[rule.flag] = true;
      this.recordRefineStat("advancedUnlocks");
      // A newly granted advanced card can itself complete another hidden rule.
      // Scan once more, preserving the existing queue's earlier unlocks.
      this.queueAllAdvancedUnlocks();
    }
    state.map.restCardUnlockResult = { cardId: pending.cardId };
    this.app.audio?.play?.("win", .4);
    this.app.persist();
    this.app.render();
    return true;
  }

  harmonize(cardAUid, cardBUid) {
    return this.attemptChoice({ type: "harmonize", cardAUid, cardBUid });
  }

  abandonCurrent() {
    this.app.restSuccessDismissLocked = false;
    this.app.restProgressHold = null;
    const state = this.app.state;
    if (state.screen !== "rest") return;

    state.map.restHeartDemonResult = null;
    state.map.restSuccessResult = null;
    state.map.harmonyMilestoneResult = null;
    state.map.pendingRestCardUnlock = null;
    state.map.pendingRestCardUnlocks = [];
    state.map.restCardUnlockResult = null;
    state.map.spiritRestRemaining = 0;

    const restContext = state.map.restContext;
    state.map.restContext = null;

    if (restContext?.type === "debug") {
      state.screen = restContext.returnScreen ?? "map";
      this.app.persist();
      return this.app.render();
    }

    if (restContext?.type === "postBattle") {
      state.screen = "map";
      this.app.map.preparePathSelection();
      this.app.persist(true);
      return this.app.render();
    }

    const node = this.app.map.currentNode?.();
    if (node?.type === "spirit" && !state.map.resolved?.[node.id]) {
      return this.app.events.open("spiritVein", node.id);
    }

    this.app.map.completeCurrentNodeIfNeeded();
    state.screen = "map";
    this.app.map.preparePathSelection();
    this.app.persist(true);
    return this.app.render();
  }

  dismissHeartDemonFailure() {
    const state = this.app.state;
    if (!state.map.restHeartDemonResult) return;
    this.app.restProgressHold = null;
    state.map.restHeartDemonResult = null;
    return this.finishAttempt();
  }

  isSuccessDismissLocked() {
    return Boolean(this.app.restSuccessDismissLocked);
  }

  dismissSuccessResult() {
    if (this.isSuccessDismissLocked()) return;
    const state = this.app.state;
    const success = state.map.restSuccessResult;
    if (!success) return;
    this.app.restProgressHold = null;
    state.map.restSuccessResult = null;
    if (success.type === "harmonize" && success.milestone) {
      const beforeMaxSense = Math.max(0, Math.floor(Number(state.player.maxSense) || 0));
      state.player.maxSense = beforeMaxSense + 1;
      state.map.harmonyMilestoneResult = { maxSenseGain: 1, harmonizeCount: success.harmonizeCount };
      this.app.persist();
      this.app.render();
      this.app.audio?.play?.("win", .4);
      return;
    }
    if (this.grantPendingRestCardUnlock()) return;
    return this.finishAttempt();
  }

  dismissHarmonyMilestone() {
    const state = this.app.state;
    if (!state.map.harmonyMilestoneResult) return;
    state.map.harmonyMilestoneResult = null;
    return this.finishAttempt();
  }

  dismissCardUnlockResult() {
    const state = this.app.state;
    if (!state.map.restCardUnlockResult) return;
    state.map.restCardUnlockResult = null;
    // Multiple insights from one refinement are shown serially. Kui Thunder is
    // queued last by ADVANCED_UNLOCK_ORDER.
    if (this.grantPendingRestCardUnlock()) return;
    return this.finishAttempt();
  }

  finishAttempt() {
    const state = this.app.state;
    this.app.restSuccessDismissLocked = false;
    state.map.spiritRestRemaining = Math.max(0, state.map.spiritRestRemaining - 1);
    if (state.map.spiritRestRemaining > 0) {
      state.screen = "rest";
      state.map.restHeartDemonResult = null;
      state.map.restSuccessResult = null;
      state.map.harmonyMilestoneResult = null;
      state.map.pendingRestCardUnlock = null;
      state.map.pendingRestCardUnlocks = [];
      state.map.restCardUnlockResult = null;
      this.app.persist(true);
      return this.app.render();
    }

    const restContext = state.map.restContext;
    state.map.restContext = null;

    if (restContext?.type === "debug") {
      state.screen = restContext.returnScreen ?? "map";
      this.app.persist(true);
      return this.app.render();
    }

    if (restContext?.type === "postBattle") {
      state.screen = "map";
      const pursuitTriggered = this.app.increasePursuit(1);
      this.app.persist(true);
      if (pursuitTriggered) return;
      this.app.map.preparePathSelection();
      this.app.persist(true);
      return this.app.render();
    }

    this.app.map.completeCurrentNodeIfNeeded();
    state.screen = "map";
    this.app.map.preparePathSelection();
    this.app.persist(true);
    this.app.render();
  }
}
