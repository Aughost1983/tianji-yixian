import { ARTIFACTS } from "../data/artifacts.js?v=v0.3.90";
import { addOwnedArtifact, isArtifactOwned } from "./state.js?v=v0.3.90";

// Learning belongs to the UI, not the run, rewind snapshots or resource cache.
export const TUTORIAL_SEEN_KEY = "tianji.tutorialHintsSeen";
export const TUTORIAL_PENDING_KEY = "tianji.tutorialHintsPending";
export const COMBAT_TUTORIAL_IDS = Object.freeze(["firstCombat", "firstTurnEnd", "firstEnemyBuff"]);
const validKey = (value) => typeof value === "string" && value.length <= 120
  && /^[\w.-]+$/.test(value) && !["__proto__", "constructor", "prototype"].includes(value);

export class TutorialHints {
  constructor(storage) {
    try { this.storage = storage ?? globalThis.localStorage; } catch { this.storage = null; }
    this.seen = new Set();
    this.pending = [];
    this.active = null;
    this.seenStorageSignature = null;
    this.refreshSeen();
    const saved = this.read(TUTORIAL_PENDING_KEY);
    if (Array.isArray(saved)) {
      for (const hint of saved) {
        if (!hint || !validKey(hint.id) || !validKey(hint.bodyKey) || this.seen.has(hint.id)
          || this.pending.some((entry) => entry.id === hint.id)) continue;
        this.pending.push({ id: hint.id, bodyKey: hint.bodyKey });
      }
    }
  }

  read(key) {
    try { return JSON.parse(this.storage?.getItem(key) ?? "null"); } catch { return null; }
  }

  write(key, value) {
    // A blocked/full local store must not interrupt gameplay; session state still works.
    try {
      if (!this.storage) return false;
      this.storage.setItem(key, JSON.stringify(value));
      return true;
    } catch { return false; /* best effort */ }
  }

  refreshSeen() {
    const saved = this.read(TUTORIAL_SEEN_KEY);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
    const signature = JSON.stringify(saved);
    if (signature === this.seenStorageSignature) return;
    this.seenStorageSignature = signature;
    // Recognize another window's reset, while retaining session learning if a
    // blocked/full store could not persist our latest mark.
    this.seen = new Set(Object.entries(saved)
      .filter(([id, value]) => validKey(id) && value === true).map(([id]) => id));
  }

  persistSeen() {
    const saved = Object.fromEntries([...this.seen].map((id) => [id, true]));
    if (this.write(TUTORIAL_SEEN_KEY, saved)) this.seenStorageSignature = JSON.stringify(saved);
  }

  markSeen(id) {
    if (!validKey(id)) return false;
    this.refreshSeen();
    this.seen.add(id);
    this.pending = this.pending.filter((hint) => hint.id !== id);
    this.persistSeen();
    this.write(TUTORIAL_PENDING_KEY, this.pending);
    return true;
  }

  hasSeenAny() {
    this.refreshSeen();
    return this.seen.size > 0;
  }

  reset(ids = null) {
    if (ids == null) {
      this.seen.clear();
      this.pending = [];
      this.active = null;
    } else {
      // A failed opening battle only makes combat lessons eligible again.
      // Preserve unrelated learning, queued hints and another window's marks.
      this.refreshSeen();
      const affected = new Set(ids.filter(validKey));
      for (const id of affected) this.seen.delete(id);
      this.pending = this.pending.filter((hint) => !affected.has(hint.id));
      if (affected.has(this.active?.id)) this.active = null;
    }
    this.persistSeen();
    this.write(TUTORIAL_PENDING_KEY, this.pending);
  }

  enqueue(id, bodyKey = `tutorial.${id}`) {
    if (!validKey(id) || !validKey(bodyKey)) return false;
    this.refreshSeen();
    if (this.seen.has(id) || this.active?.id === id || this.pending.some((hint) => hint.id === id)) return false;
    this.pending.push({ id, bodyKey });
    this.write(TUTORIAL_PENDING_KEY, this.pending);
    return true;
  }

  activateNext(canShow = () => true) {
    if (this.active) return this.active;
    this.refreshSeen();
    this.pending = this.pending.filter((hint) => !this.seen.has(hint.id));
    // A hint for another screen waits without blocking a newly relevant hint.
    const index = this.pending.findIndex(canShow);
    if (index < 0) return null;
    this.active = this.pending.splice(index, 1)[0];
    this.markSeen(this.active.id);
    return this.active;
  }

  dismiss() {
    if (!this.active) return false;
    this.active = null;
    return true;
  }
}

// Every actual acquisition uses the same hook. Initial/load-time inventory
// normalization does not count as acquiring a new artifact.
export function grantArtifactWithTutorial(app, artifactId, options) {
  const player = app.state?.player;
  if (!player) return false;
  const ownedBefore = isArtifactOwned(player, artifactId);
  const added = addOwnedArtifact(player, artifactId, options);
  if (added && !ownedBefore && artifactId !== "treasureToken" && !ARTIFACTS[artifactId]?.hidden) {
    app.showTutorialOnce?.("firstArtifact");
  }
  return added;
}
