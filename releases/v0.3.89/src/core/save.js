const RUN_KEY = "tianji.demo.run.v1";
const CHECKPOINT_KEY = "tianji.demo.checkpoint.v1";
// Keep the existing storage key so upgrades do not strand old browser storage, but
// v0.2.52 stores only map rewind nodes here. Legacy turn entries are ignored.
const REWIND_HISTORY_KEY = "tianji.demo.turnHistory.v1";
const MAX_REWIND_NODES = 3;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function checkpointIdentity(state) {
  if (!state) return "";
  const seed = String(state.run?.seed ?? "");
  const history = Array.isArray(state.map?.history) ? state.map.history.join(">") : "";
  const nodeId = String(state.map?.currentNodeId ?? "");
  const resolved = state.map?.resolved?.[nodeId] ? "1" : "0";
  return `${seed}|${history}>${nodeId}|${resolved}`;
}

function sanitizeRewindSnapshot(state) {
  const snapshot = clone(state);
  snapshot.combat = null;
  snapshot.overlay = null;
  snapshot.screen = "map";
  snapshot.map ??= {};
  snapshot.map.pendingMoveTarget = null;
  snapshot.map.postBattlePrompt = null;
  snapshot.map.pursuitPrompt = null;
  snapshot.map.restContext = null;
  snapshot.map.pendingSenseRecoveryNode = null;
  snapshot.map.pendingMoveHadPursuit = false;
  snapshot.map.pendingMoveHadLongBattle = false;
  return snapshot;
}

function rewindNodeIdentity(state) {
  const seed = String(state?.run?.seed ?? "");
  const nodeId = String(state?.map?.currentNodeId ?? "");
  const history = Array.isArray(state?.map?.history) ? state.map.history.join(">") : "";
  return `${seed}|${history}>${nodeId}`;
}

export class SaveManager {
  saveRun(state) {
    localStorage.setItem(RUN_KEY, JSON.stringify(state));
  }

  loadRun() {
    const raw = localStorage.getItem(RUN_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  // Legacy/general safe checkpoint storage remains available to old saves and other
  // code paths, but death rewind no longer reads from it in v0.2.52.
  saveCheckpoint(state) {
    const snapshot = clone(state);
    snapshot.combat = null;
    snapshot.screen = "map";
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(snapshot));
  }

  loadCheckpoint() {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  loadRewindHistory() {
    const raw = localStorage.getItem(REWIND_HISTORY_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // v0.2.51 stored {kind:"turn"}/{kind:"initial"} combat memories in the same
      // key. They must never light the new map-node rewind buttons.
      return parsed.filter((entry) => entry?.kind === "node" && entry?.snapshot);
    } catch { return []; }
  }

  saveRewindHistory(entries) {
    const nodes = (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry?.kind === "node" && entry?.snapshot)
      .slice(-MAX_REWIND_NODES);
    localStorage.setItem(REWIND_HISTORY_KEY, JSON.stringify(nodes));
  }

  resetRewindHistory(initialState) {
    const snapshot = sanitizeRewindSnapshot(initialState);
    const entry = { id: rewindNodeIdentity(snapshot), kind: "node", source: "initial", snapshot };
    this.saveRewindHistory([entry]);
  }

  saveRewindNode(state, source = "senseRecovery") {
    if (!state || state.screen !== "map" || state.combat) return false;
    const snapshot = sanitizeRewindSnapshot(state);
    const id = rewindNodeIdentity(snapshot);
    let history = this.loadRewindHistory();
    if (history.at(-1)?.id === id) {
      // The same resolved map position may call preparePathSelection repeatedly;
      // update the snapshot but never create duplicate rewind depth.
      history[history.length - 1] = { id, kind: "node", source, snapshot };
    } else {
      history.push({ id, kind: "node", source, snapshot });
    }
    this.saveRewindHistory(history);
    return true;
  }

  availableRewindDepth() {
    return Math.min(MAX_REWIND_NODES, this.loadRewindHistory().length);
  }

  loadRewindSnapshot(nodesBack = 1) {
    const depth = Math.max(1, Math.min(MAX_REWIND_NODES, Math.floor(Number(nodesBack) || 1)));
    const history = this.loadRewindHistory();
    if (history.length < depth) return null;
    const selectedIndex = history.length - depth;
    const entry = history[selectedIndex];
    if (!entry?.snapshot) return null;
    // Rewinding abandons all future checkpoints. New automatic Sense recovery beats
    // will grow a new timeline from the restored node.
    this.saveRewindHistory(history.slice(0, selectedIndex + 1));
    return clone(entry.snapshot);
  }

  // Temporary compatibility aliases for any old internal/debug callers. They now use
  // map-node semantics and never save combat rounds.
  loadTurnHistory() { return this.loadRewindHistory(); }
  saveTurnHistory(entries) { this.saveRewindHistory(entries); }
  resetTurnHistory(initialState) { this.resetRewindHistory(initialState); }
  saveTurnSnapshot() { return false; }

  clear() {
    localStorage.removeItem(RUN_KEY);
    localStorage.removeItem(CHECKPOINT_KEY);
    localStorage.removeItem(REWIND_HISTORY_KEY);
  }
}
