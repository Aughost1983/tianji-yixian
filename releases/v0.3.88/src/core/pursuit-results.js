// Presentation transactions are deliberately outside state/save/rewind data.
// Rule application stays immediate. Only a completed behavior can enqueue a
// result; render may display it but can never create another copy.
const natural = (value) => Math.max(0, Math.floor(Number(value) || 0));
const TUTORIAL_REASONS = new Set(["postBattleRest", "backtrack", "longBattle"]);

export class PursuitResults {
  constructor() { this.reset(); }

  reset() {
    this.ledger = null;
    this.queue = [];
    this.active = null;
    this.sequence = 0;
  }

  record(before, delta, { clear = false, reason = null } = {}) {
    this.ledger ??= { initial: natural(before), net: 0, cleared: null, tutorialEligible: false };
    if (delta > 0 && TUTORIAL_REASONS.has(reason)) this.ledger.tutorialEligible = true;
    if (clear) this.ledger.cleared = natural(before);
    else if (this.ledger.cleared == null) this.ledger.net += Math.trunc(Number(delta) || 0);
  }

  commit(current) {
    const ledger = this.ledger;
    if (!ledger) return null;
    this.ledger = null;
    const delta = ledger.cleared != null ? -ledger.cleared
      : ledger.net > 0 ? ledger.net
        : Math.max(ledger.net, Math.min(0, natural(current) - ledger.initial));
    if (!delta) return null;
    const result = { id: ++this.sequence, delta,
      ...(delta > 0 && ledger.tutorialEligible ? { tutorialEligible: true } : {}) };
    this.queue.push(result);
    return result;
  }

  get hasWork() { return Boolean(this.ledger || this.active || this.queue.length); }
  get hasResult() { return Boolean(this.active || this.queue.length); }

  activate() {
    this.active ??= this.queue.shift() ?? null;
    return this.active;
  }

  dismiss() {
    if (!this.active) return false;
    this.active = null;
    return true;
  }
}

export function recordPursuitRule(app, delta, options) {
  if (app?.state?.map && !app.suppressPursuitFeedback) app.pursuitResults?.record(app.state.map.pursuit, delta, options);
}
