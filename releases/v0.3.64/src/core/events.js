import { EVENTS, RANDOM_EVENT_IDS } from "../data/events-data.js?v=v0.3.64";
import { ITEMS } from "../data/items.js?v=v0.3.64";
import { SWORD_MANUAL_DROP_POOL } from "../data/enemies.js?v=v0.3.64";
import { addInventoryItem, addOwnedArtifact, isArtifactOwned, ensureInventoryOrder, reducePursuitValue } from "./state.js?v=v0.3.64";
import { addStatus } from "./status.js?v=v0.3.64";
import { recordStoneGain } from "./run-records.js?v=v0.3.64";

export class EventEngine {
  constructor(app) { this.app = app; }

  ensureRandomPool() {
    const map = this.app.state.map;
    const valid = new Set(RANDOM_EVENT_IDS);
    if (!Array.isArray(map.randomEventPool)) map.randomEventPool = [...RANDOM_EVENT_IDS];
    map.randomEventPool = map.randomEventPool.filter((id, index, arr) => valid.has(id) && arr.indexOf(id) === index);
    return map.randomEventPool;
  }

  open(eventId, nodeId) {
    if (eventId === "random") {
      const pool = this.ensureRandomPool();
      if (!pool.length) {
        // Random events are one-use-per-chapter. If a route reaches more random
        // opportunity nodes than the chapter currently has events, the empty node
        // simply resolves instead of recycling a previously seen event.
        this.app.map.completeCurrentNodeIfNeeded();
        this.app.state.screen = "map";
        this.app.state.overlay = null;
        this.app.map.preparePathSelection();
        this.app.persist();
        return this.app.render();
      }
      const index = this.app.rng.int(0, pool.length - 1);
      eventId = pool.splice(index, 1)[0];
      this.app.persist();
    }

    this.app.state.overlay = { eventId, nodeId, stage: "intro", result: null, pendingDeath: false };
    this.app.state.screen = "event";
    this.app.render();
  }

  currentEvent() {
    return EVENTS[this.app.state.overlay?.eventId] ?? null;
  }

  isRandomEvent() {
    return Boolean(this.currentEvent()?.random);
  }

  riftSuccessChance() {
    const p = this.app.state.player;
    const hpRate = (p.maxHp ?? 0) > 0 ? Math.max(0, Math.min(1, (p.hp ?? 0) / p.maxHp)) : 0;
    const coefficient = p.styleId === "body" ? 75 : 50;
    return Math.max(0, Math.min(100, Math.floor(coefficient * hpRate)));
  }

  tabletSuccessChance() {
    const sense = Math.max(0, Math.floor(this.app.state.player.sense ?? 0));
    return Math.max(0, Math.min(100, 15 + 5 * sense));
  }

  knowsFrostSpell() {
    // Refinement retains the cardId; upgraded Frost is still the same spell.
    return (this.app.state.player.deck ?? []).some((card) => card?.cardId === "frostSpell");
  }

  firePitSuccessChance() {
    return this.app.state.player.styleId === "body" ? 35 : 15;
  }

  hasRequirements(choice) {
    if (!choice) return false;
    if (choice.id === "probe" && this.app.state.overlay?.eventId === "corpse") return (this.app.state.player.sense ?? 0) >= 2;
    if (choice.id === "study" && this.app.state.overlay?.eventId === "tablet") return (this.app.state.player.sense ?? 0) >= 1;
    if (choice.id === "useTool" && this.app.state.overlay?.eventId === "firePit") {
      return this.knowsFrostSpell() || (this.app.state.player.inventory?.spiderSilk ?? 0) >= 5;
    }
    return (choice.requires ?? []).every((r) => (this.app.state.player.inventory[r.itemId] ?? 0) >= r.count);
  }

  applyPendingResultEffects(result) {
    const state = this.app.state;
    const pending = Array.isArray(result?.pendingEffects) ? result.pendingEffects : [];
    if (result) result.pendingEffects = [];
    const resourceChanges = [];

    for (const effect of pending) {
      if (!effect) continue;
      if (effect.type === "gainMaxHp") {
        const amount = Math.max(0, Math.floor(Number(effect.amount) || 0));
        const beforeHp = state.player.hp ?? 0;
        state.player.maxHp = Math.max(1, Math.floor(state.player.maxHp ?? 0) + amount);
        if (effect.refillHp) state.player.hp = state.player.maxHp;
        if (state.player.hp !== beforeHp) resourceChanges.push({ resource: "hp", before: beforeHp, after: state.player.hp });
      } else if (effect.type === "loseHp") {
        const amount = Math.max(0, Math.floor(Number(effect.amount) || 0));
        const beforeHp = state.player.hp ?? 0;
        state.player.hp = Math.max(0, beforeHp - amount);
        if (state.player.hp !== beforeHp) resourceChanges.push({ resource: "hp", before: beforeHp, after: state.player.hp });
      }
    }
    if (state.player.hp <= 0) this.app.state.overlay.pendingDeath = true;
    return resourceChanges;
  }

  finishEvent() {
    const state = this.app.state;
    const overlay = state.overlay;
    if (overlay?.result?.nextKey) {
      const nextKey = overlay.result.nextKey;
      const nextSound = overlay.result.nextSound ?? null;
      overlay.result.key = nextKey;
      overlay.result.nextKey = null;
      overlay.result.nextSound = null;
      overlay.result.hideTitle = Boolean(nextSound);

      // Narrative pages do not settle HP. The actual HP / Max-HP transaction is
      // committed exactly when the final result prompt (and its sound) appears.
      const resourceChanges = this.applyPendingResultEffects(overlay.result);
      if (nextSound) this.app.audio?.play?.(nextSound, nextSound === "win" ? .4 : .42);
      this.app.persist();
      for (const change of resourceChanges) {
        void this.app.showResourceChange?.(state.player, change.resource, change.before, change.after, { wait: false });
      }
      return this.app.render();
    }
    if (overlay?.pendingDeath || state.player.hp <= 0) {
      state.overlay = null;
      return this.app.onPlayerDeath();
    }
    if (overlay?.result?.returnToIntro) {
      overlay.stage = "intro";
      overlay.result = null;
      overlay.pendingDeath = false;
      this.app.persist();
      return this.app.render();
    }
    if (overlay?.result?.openRest) {
      const nodeId = overlay.nodeId ?? state.map.currentNodeId;
      const remaining = Math.max(1, Math.floor(Number(overlay.result.restRemaining ?? 1) || 1));
      state.overlay = null;
      return this.app.openRest({ nodeId, remaining });
    }
    this.app.map.completeCurrentNodeIfNeeded();
    state.screen = "map";
    state.overlay = null;
    this.app.map.preparePathSelection();
    this.app.persist();
    this.app.render();
  }

  setResult(key, params = {}, { pendingDeath = false, returnToIntro = false, openRest = false, restRemaining = 1, nextKey = null, nextSound = null, pendingEffects = [] } = {}) {
    const overlay = this.app.state.overlay;
    if (!overlay) return;
    overlay.stage = "result";
    overlay.result = {
      key, params, returnToIntro: Boolean(returnToIntro), openRest: Boolean(openRest),
      restRemaining: Math.max(1, Math.floor(Number(restRemaining) || 1)),
      nextKey: nextKey || null,
      nextSound: nextSound || null,
      pendingEffects: Array.isArray(pendingEffects) ? pendingEffects.map((effect) => ({ ...effect })) : [],
      hideTitle: false,
    };
    overlay.pendingDeath = Boolean(pendingDeath);
    this.app.persist();
    this.app.render();
  }

  grantCorpseLoot() {
    const state = this.app.state;
    const stones = this.app.rng.int(30, 50);
    const manualId = this.app.rng.pick?.(SWORD_MANUAL_DROP_POOL)
      ?? SWORD_MANUAL_DROP_POOL[this.app.rng.int(0, SWORD_MANUAL_DROP_POOL.length - 1)];
    recordStoneGain(state, stones);
    state.player.stones += stones;
    addInventoryItem(state.player, manualId, 1);
    return { stones, manualId };
  }

  async chooseRandom(choiceId) {
    const state = this.app.state;
    const overlay = state.overlay;
    if (!overlay) return;

    if (overlay.eventId === "rift") {
      if (choiceId === "leave") return this.finishEvent();
      if (choiceId !== "risk" || overlay.stage !== "intro") return;
      const chance = this.riftSuccessChance();
      if (this.app.rng.chance(chance)) {
        return this.setResult("event.rift.successNarrative", {}, {
          nextKey: "event.rift.successSummary", nextSound: "win",
          pendingEffects: [{ type: "gainMaxHp", amount: 3, refillHp: true }],
        });
      }
      const damage = this.app.rng.int(5, 10);
      reducePursuitValue(state.map, Math.max(0, Math.floor(Number(state.map.pursuit) || 0)));
      state.map.pursuitStealth = 0;
      return this.setResult("event.rift.failureNarrative", { damage }, {
        nextKey: "event.rift.failureSummary", nextSound: "fail",
        pendingEffects: [{ type: "loseHp", amount: damage }],
      });
    }

    if (overlay.eventId === "corpse") {
      if (overlay.stage === "intro") {
        if (choiceId === "leave") return this.finishEvent();
        if (choiceId === "inspect") {
          overlay.stage = "method";
          this.app.persist();
          return this.app.render();
        }
        return;
      }

      if (overlay.stage !== "method") return;
      if (choiceId === "probe") {
        if ((state.player.sense ?? 0) < 2) return;
        const beforeSense = state.player.sense;
        state.player.sense -= 2;
        void this.app.showResourceChange?.(state.player, "sense", beforeSense, state.player.sense, { wait: false });
        if (this.app.rng.chance(50)) return this.setResult("event.corpse.probeTrap");
        const loot = this.grantCorpseLoot();
        return this.setResult("event.corpse.probeSafeNarrative", loot, { nextKey: "event.corpse.lootSummary", nextSound: "win" });
      }
      if (choiceId === "grab") {
        if (this.app.rng.chance(50)) {
          const damage = this.app.rng.int(20, 30);
          return this.setResult("event.corpse.explosionNarrative", { damage }, {
            nextKey: "event.corpse.damageSummary", nextSound: "fail",
            pendingEffects: [{ type: "loseHp", amount: damage }],
          });
        }
        const loot = this.grantCorpseLoot();
        return this.setResult("event.corpse.grabSafeNarrative", loot, { nextKey: "event.corpse.lootSummary", nextSound: "win" });
      }
    }

    if (overlay.eventId === "tablet") {
      if (choiceId === "leave") return this.finishEvent();
      if (choiceId !== "study" || overlay.stage !== "intro" || (state.player.sense ?? 0) < 1) return;
      const chance = this.tabletSuccessChance();
      const beforeSense = state.player.sense;
      state.player.sense = Math.max(0, beforeSense - 1);
      void this.app.showResourceChange?.(state.player, "sense", beforeSense, state.player.sense, { wait: false });
      if (this.app.rng.chance(chance)) {
        state.player.maxSense = Math.max(0, Math.floor(state.player.maxSense ?? 0)) + 1;
        return this.setResult("event.tablet.successNarrative", {}, { nextKey: "event.tablet.successSummary", nextSound: "win" });
      }
      addStatus(state.player, "heartDemon", 1);
      return this.setResult("event.tablet.failureNarrative", {}, { returnToIntro: true, nextKey: "event.tablet.failureSummary", nextSound: "fail" });
    }
  }

  async chooseAltar(choiceId) {
    const state = this.app.state;
    const overlay = state.overlay;
    if (!overlay || overlay.eventId !== "altar" || overlay.stage !== "intro") return;
    if (choiceId === "use") {
      if ((state.player.inventory?.bigWolfFang ?? 0) < 1) return;
      state.player.inventory.bigWolfFang = Math.max(0, state.player.inventory.bigWolfFang - 1);
      ensureInventoryOrder(state.player);
      return this.setResult("event.altar.useNarrative", {}, {
        nextKey: "event.altar.useSummary", nextSound: "win",
        pendingEffects: [{ type: "gainMaxHp", amount: 10 }],
      });
    }
    if (choiceId === "rest") return this.setResult("event.altar.restResult", {}, { openRest: true, restRemaining: 2 });
  }

  grantYangSunMirror() {
    if (!isArtifactOwned(this.app.state.player, "yangSunMirror")) {
      addOwnedArtifact(this.app.state.player, "yangSunMirror", { autoEquip: true });
    }
  }

  async chooseFirePit(choiceId) {
    const state = this.app.state;
    const overlay = state.overlay;
    if (!overlay || overlay.eventId !== "firePit" || overlay.stage !== "intro") return;
    if (choiceId === "leave") return this.finishEvent();

    if (choiceId === "useTool") {
      const useFrost = this.knowsFrostSpell();
      if (!useFrost) {
        if ((state.player.inventory?.spiderSilk ?? 0) < 5) return;
        state.player.inventory.spiderSilk = Math.max(0, state.player.inventory.spiderSilk - 5);
        ensureInventoryOrder(state.player);
      }
      this.grantYangSunMirror();
      return this.setResult(
        useFrost ? "event.firePit.frostNarrative" : "event.firePit.silkNarrative",
        {},
        { nextKey: "event.firePit.gainMirror", nextSound: "win" },
      );
    }

    if (choiceId === "force") {
      const chance = this.firePitSuccessChance();
      if (this.app.rng.chance(chance)) {
        this.grantYangSunMirror();
        return this.setResult("event.firePit.forceSuccessNarrative", {}, { nextKey: "event.firePit.gainMirror", nextSound: "win" });
      }
      return this.setResult("event.firePit.forceFailureNarrative", {}, {
        returnToIntro: true,
        nextKey: "event.firePit.forceFailureSummary",
        nextSound: "fail",
        pendingEffects: [{ type: "loseHp", amount: 4 }],
      });
    }
  }

  async chooseAlchemy(choiceId) {
    const state = this.app.state;
    const overlay = state.overlay;
    if (!overlay || overlay.eventId !== "alchemy" || overlay.stage !== "intro") return;
    if (choiceId === "leave") return this.finishEvent();
    if (choiceId !== "give" || (state.player.inventory?.snakeSlough ?? 0) < 2) return;

    state.player.inventory.snakeSlough = Math.max(0, state.player.inventory.snakeSlough - 2);
    ensureInventoryOrder(state.player);
    addInventoryItem(state.player, "lifeLockPill", 2);
    return this.setResult("event.alchemy.giveNarrative", {}, { nextKey: "event.alchemy.giveSummary", nextSound: "win" });
  }

  async chooseSpiritVein(choiceId) {
    const state = this.app.state;
    const overlay = state.overlay;
    if (!overlay || overlay.eventId !== "spiritVein" || overlay.stage !== "intro") return;
    if (choiceId === "mine") {
      const stones = this.app.rng.int(300, 500);
      recordStoneGain(state, stones);
      state.player.stones += stones;
      return this.setResult("event.spiritVein.mineNarrative", { stones }, { nextKey: "event.spiritVein.mineSummary", nextSound: "win" });
    }
    if (choiceId === "rest") {
      return this.setResult("event.spiritVein.restResult", {}, { openRest: true, restRemaining: 3 });
    }
  }

  async choose(choiceId) {
    const state = this.app.state;
    const event = this.currentEvent();
    if (!event) return;
    if (event.random) return this.chooseRandom(choiceId);
    if (event.id === "altar") return this.chooseAltar(choiceId);
    if (event.id === "firePit") return this.chooseFirePit(choiceId);
    if (event.id === "alchemy") return this.chooseAlchemy(choiceId);
    if (event.id === "spiritVein") return this.chooseSpiritVein(choiceId);

    const choice = event.choices.find((c) => c.id === choiceId);
    if (!choice || !this.hasRequirements(choice)) return;
    let effects = choice.effects ?? [];
    if (choice.outcomes) {
      const total = choice.outcomes.reduce((s, o) => s + o.weight, 0);
      let roll = this.app.rng.next() * total;
      let selected = choice.outcomes[choice.outcomes.length - 1];
      for (const outcome of choice.outcomes) {
        roll -= outcome.weight;
        if (roll <= 0) { selected = outcome; break; }
      }
      effects = selected.effects ?? [];
    }
    await this.applyEventEffects(effects);
    if (state.screen === "event") this.finishEvent();
  }

  async applyEventEffects(effects) {
    const state = this.app.state;
    for (const e of effects) {
      if (e.type === "gainMaxHp") state.player.maxHp += e.amount;
      if (e.type === "heal") {
        const before = state.player.hp;
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + e.amount);
        if (state.player.hp > before) await this.app.showResourceChange(state.player, "hp", before, state.player.hp);
      }
      if (e.type === "loseHp") {
        const before = state.player.hp;
        state.player.hp = Math.max(0, state.player.hp - e.amount);
        await this.app.showDamagePopup(state.player, before - state.player.hp);
      }
      if (e.type === "loseHpKeepOne") {
        const before = state.player.hp;
        state.player.hp = Math.max(1, state.player.hp - this.app.rng.int(e.min, e.max));
        await this.app.showDamagePopup(state.player, before - state.player.hp);
      }
      if (e.type === "addPursuit") this.app.increasePursuit(e.amount);
      if (e.type === "consumeItem") state.player.inventory[e.itemId] -= e.count;
      if (e.type === "gainArtifact" && e.artifactId && !isArtifactOwned(state.player, e.artifactId)) addOwnedArtifact(state.player, e.artifactId, { autoEquip: true });
      if (e.type === "openRest") { this.app.openRest({ nodeId: state.map.currentNodeId, remaining: 1 }); }
    }
    if (state.player.hp <= 0) this.app.onPlayerDeath();
  }

  resultTextParams(result = this.app.state.overlay?.result) {
    const params = { ...(result?.params ?? {}) };
    if (params.manualId && ITEMS[params.manualId]) params.manual = this.app.i18n.t(ITEMS[params.manualId].nameKey);
    return params;
  }
}
