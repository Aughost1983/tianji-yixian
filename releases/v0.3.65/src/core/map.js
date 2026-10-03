import { MAP_NODES, COLS } from "../data/map-data.js?v=v0.3.65";
import { reducePursuitValue } from "./state.js?v=v0.3.65";
import { completeRun } from "./run-records.js?v=v0.3.65";

export class MapEngine {
  constructor(app) { this.app = app; }

  currentNode() { return MAP_NODES[this.app.state.map.currentNodeId]; }

  nodeIdFromDirection(node, direction) {
    if (direction === "down") return null;
    const colIndex = COLS.indexOf(node.col);
    const targetIndex = direction === "nw" ? colIndex - 1 : direction === "ne" ? colIndex + 1 : colIndex;
    return `${node.layer + 1}${COLS[targetIndex]}`;
  }

  nextNodes(node = this.currentNode()) {
    return node.directions
      .filter((d) => d !== "down")
      .map((d) => this.nodeIdFromDirection(node, d))
      .filter((id) => MAP_NODES[id] && !this.app.state.map.blockedNodes.includes(id));
  }

  pathRevealKey(fromId, targetId) { return `${fromId}>${targetId}`; }

  scoutCost(node = this.currentNode()) { return (node?.layer ?? 0) >= 7 ? 2 : 1; }

  isPathRevealed(targetId, node = this.currentNode()) {
    const map = this.app.state.map;
    // Keep old saves compatible: v0.1.8 could reveal every route from one node at once.
    if (map.revealedFrom?.[node.id] === true) return true;
    if (map.revealedPaths?.[node.id]?.[targetId]) return true;
    return Boolean(map.revealedPaths?.[this.pathRevealKey(node.id, targetId)]);
  }

  revealPath(targetId) {
    const state = this.app.state;
    const node = this.currentNode();
    if (!this.nextNodes(node).includes(targetId)) return;
    state.map.revealedPaths ??= {};
    const key = this.pathRevealKey(node.id, targetId);
    if (state.map.revealedPaths[key]) return;
    const cost = this.scoutCost(node);
    if (state.player.sense < cost) return;
    const beforeSense = state.player.sense;
    state.player.sense -= cost;
    void this.app.showResourceChange?.(state.player, "sense", beforeSense, state.player.sense, { wait: false });
    state.map.revealedPaths[key] = true;
    state.map.pendingMoveTarget = null;
    // Keep the just-revealed route in a short transition render so the radial
    // rays can visibly tint from unknown black to the revealed route color.
    // Record the real start time because this UI uses full innerHTML renders:
    // if any unrelated render rebuilds the map during the tint, the new DOM
    // resumes from the actual elapsed point instead of replaying from 0%.
    this.app.pathFogClearingTarget = targetId;
    this.app.pathRayRevealStartedAt = Date.now();
    this.app.persist();
    this.app.render();
    clearTimeout(this.app.pathFogClearTimer);
    this.app.pathFogClearTimer = setTimeout(() => {
      if (this.app.pathFogClearingTarget !== targetId) return;
      this.app.pathFogClearingTarget = null;
      this.app.pathRayRevealStartedAt = null;
      this.app.render();
    }, 1680);
  }

  queueSenseRecoveryForMove(nodeId) {
    const state = this.app.state;
    state.map.pendingSenseRecoveryNode = nodeId ?? null;
    state.map.pendingMoveHadPursuit = false;
    state.map.pendingMoveHadLongBattle = false;
  }

  recoverSenseAfterResolvedMoveIfReady() {
    const state = this.app.state;
    const map = state.map;
    const nodeId = map.pendingSenseRecoveryNode;
    if (!nodeId || map.currentNodeId !== nodeId || !map.resolved?.[nodeId]) return 0;
    // A forward move is only considered fully settled after the destination node
    // and all chained content have ended. Post-battle meditation and pursuit fights
    // deliberately keep the recovery pending until the player is truly back at the map.
    if (state.screen !== "map" || state.combat || map.postBattlePrompt || map.pursuitPrompt || map.restContext || state.overlay) return 0;
    const pursuit = Math.max(0, Math.floor(map.pursuit ?? 0));
    const hadPursuit = Boolean(map.pendingMoveHadPursuit);
    const hadLongBattle = Boolean(map.pendingMoveHadLongBattle);
    map.pendingMoveHadPursuit = false;
    map.pendingMoveHadLongBattle = false;
    if (hadPursuit) {
      map.pursuitStealth = 0;
    } else if (pursuit <= 0) {
      map.pursuitStealth = 0;
    } else if (!hadLongBattle) {
      map.pursuitStealth = Math.max(0, Math.floor(map.pursuitStealth ?? 0)) + 1;
      if (map.pursuitStealth >= 4) {
        reducePursuitValue(map, 1);
        map.pursuitStealth = 0;
      }
    }
    map.pendingSenseRecoveryNode = null;
    const beforeSense = state.player.sense;
    const maxSense = Math.max(0, Math.floor(Number(state.player.maxSense) || 0));
    const recovery = Math.ceil(maxSense / 2);
    // Regional recovery keeps its normal half-Max-Sense behavior. Any temporary
    // Sense overflow from a pill disperses when this automatic recovery beat occurs.
    if (beforeSense > maxSense) state.player.sense = maxSense;
    else if (beforeSense < maxSense) state.player.sense = Math.min(maxSense, beforeSense + recovery);
    if (state.player.sense !== beforeSense) {
      void this.app.showResourceChange?.(state.player, "sense", beforeSense, state.player.sense, { wait: false });
    }
    const beforeHp = Math.max(0, Math.floor(state.player.hp ?? 0));
    const maxHp = Math.max(0, Math.floor(state.player.maxHp ?? 0));
    state.player.hp = Math.min(maxHp, beforeHp + Math.ceil(maxHp / 10));
    if (state.player.hp > beforeHp) {
      void this.app.showResourceChange?.(state.player, "hp", beforeHp, state.player.hp, { wait: false });
    }
    // v0.2.52: completing this automatic Sense-recovery transaction is the only
    // recurring map checkpoint that creates a death-rewind node. It creates a node
    // even when Sense was already full (or overflow merely dispersed), because the
    // recovery beat itself—not the numeric gain—is the checkpoint event.
    this.app.syncRng?.();
    this.app.save?.saveRun?.(state);
    this.app.save?.saveRewindNode?.(state, "senseRecovery");
    return state.player.sense - beforeSense;
  }

  preparePathSelection() {
    const state = this.app.state;
    const node = this.currentNode();
    if (!node || !state.map.resolved[node.id]) return false;
    this.recoverSenseAfterResolvedMoveIfReady();
    if (this.nextNodes(node).length <= 0) return false;
    if (state.map.pathRecoveryAtNode === node.id) return false;

    // Path-selection recovery keeps the established Mana refill. Sense recovery
    // is queued by a forward move and is granted only after that destination node
    // (plus any chained post-battle rest / pursuit) has fully resolved back to map.
    const beforeMana = state.player.mana;
    state.player.mana = state.player.maxMana;
    if (state.player.mana > beforeMana) void this.app.showResourceChange?.(state.player, "mana", beforeMana, state.player.mana, { wait: false });
    state.map.pathRecoveryAtNode = node.id;
    return true;
  }

  requestMove(nodeId) {
    const state = this.app.state;
    if (!this.nextNodes(this.currentNode()).includes(nodeId)) return;
    state.map.pendingMoveTarget = nodeId;
    this.app.render();
  }

  cancelMove() {
    this.app.state.map.pendingMoveTarget = null;
    this.app.render();
  }

  confirmMove() {
    const nodeId = this.app.state.map.pendingMoveTarget;
    if (!nodeId) return;
    this.app.state.map.pendingMoveTarget = null;
    return this.moveTo(nodeId);
  }

  moveTo(nodeId) {
    const state = this.app.state;
    const current = this.currentNode();
    if (!this.nextNodes(current).includes(nodeId)) return;
    const destination = MAP_NODES[nodeId];
    this.app.mapBattleTransitionSourceNodeId = ["battle", "boss"].includes(destination?.type) ? current.id : null;
    state.map.history.push(current.id);
    state.map.currentNodeId = nodeId;
    this.queueSenseRecoveryForMove(nodeId);
    state.map.resolved[nodeId] ??= false;
    state.map.canStayRest = false;
    state.map.pendingMoveTarget = null;
    state.map.postBattlePrompt = null;
    state.map.pathRecoveryAtNode = null;

    // Save the route choice first, then immediately execute the destination node.
    this.app.persist();
    return this.resolveCurrent();
  }

  backtrack() {
    const state = this.app.state;
    state.map.pursuitStealth = 0;
    const current = this.currentNode();
    const previous = state.map.history.pop();
    if (!previous) return;
    state.map.blockedNodes.push(current.id);
    state.map.currentNodeId = previous;
    // Backtracking is not a new forward-node completion and therefore does not
    // create a new Sense recovery transaction.
    state.map.pendingSenseRecoveryNode = null;
    state.map.pendingMoveHadPursuit = false;
    state.map.pendingMoveHadLongBattle = false;
    state.map.pendingMoveTarget = null;
    state.map.postBattlePrompt = null;
    state.map.pathRecoveryAtNode = null;
    if (this.app.increasePursuit(2)) return;
    this.preparePathSelection();
    this.app.persist();
    this.app.render();
  }

  resolveCurrent() {
    const node = this.currentNode();
    const state = this.app.state;
    if (state.map.resolved[node.id]) {
      this.preparePathSelection();
      this.app.persist();
      return this.app.render();
    }
    if (node.type === "story") {
      this.completeCurrentNodeIfNeeded();
      this.preparePathSelection();
      this.app.persist();
      return this.app.render();
    }
    if (node.type === "battle" || node.type === "boss") return this.app.combat.startEncounter(node.encounter, { nodeId: node.id });
    if (node.type === "shop") return this.app.shop.open(node.id);
    if (node.type === "event" || node.type === "fixedEvent") return this.app.events.open(node.event, node.id);
    if (node.type === "rest") return this.app.openRest({ nodeId: node.id, remaining: 1 });
    if (node.type === "spirit") return this.app.events.open("spiritVein", node.id);
  }

  completeCurrentNodeIfNeeded() {
    const state = this.app.state;
    const node = this.currentNode();
    state.map.pendingMoveTarget = null;
    if (!state.map.resolved[node.id]) {
      state.map.resolved[node.id] = true;
      this.app.persist(true);
    }
    if (node.id === "19B") {
      completeRun(state);
      state.screen = "map";
    }
  }

  continueAfterBattle() {
    const state = this.app.state;
    if (!state.map.postBattlePrompt) return;
    state.map.postBattlePrompt = null;
    this.preparePathSelection();
    this.app.persist(true);
    this.app.render();
  }

  restAfterBattle() {
    const state = this.app.state;
    const prompt = state.map.postBattlePrompt;
    if (!prompt) return;
    state.map.postBattlePrompt = null;
    state.map.restContext = { type: "postBattle", nodeId: prompt.nodeId };
    this.app.persist();
    this.app.openRest({ nodeId: prompt.nodeId, remaining: 1 });
  }
}
