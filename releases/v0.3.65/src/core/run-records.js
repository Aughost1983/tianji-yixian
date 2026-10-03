import { CARDS } from "../data/cards.js?v=v0.3.65";
import { ARTIFACTS } from "../data/artifacts.js?v=v0.3.65";
import { ADVANCED_UPGRADE_CHAINS, ADVANCED_UNLOCK_RULES } from "../data/progression.js?v=v0.3.65";

const previousAdvancedId = Object.fromEntries(
  Object.entries(ADVANCED_UPGRADE_CHAINS).map(([before, after]) => [after, before])
);

function natural(value) { return Math.max(0, Math.floor(Number(value) || 0)); }

// Count refinement-unlocked base families, including hidden/previewable ones;
// direct fragment/manual study is not an advanced unlock for this record.
export const COMPLETION_ADVANCED_IDS = Object.freeze(Object.keys(ADVANCED_UNLOCK_RULES)
  .filter((id) => CARDS[id]?.tags?.includes("advanced")));
// Heart Mace is reserved for a future obtainable-artifact catalogue. Its actual
// trigger score continues to be recorded even though this collection excludes it.
export const COMPLETION_ARTIFACT_IDS = Object.freeze(Object.keys(ARTIFACTS)
  .filter((id) => !ARTIFACTS[id].hidden && id !== "heartMace"));

export function countDeckComposition(deck = []) {
  const counts = { martial: 0, spell: 0, secret: 0 };
  for (const inst of deck) {
    const type = CARDS[inst?.cardId]?.type;
    if (Object.hasOwn(counts, type)) counts[type] += 1;
  }
  return counts;
}

function advancedFamily(cardId) {
  let current = cardId;
  while (previousAdvancedId[current]) current = previousAdvancedId[current];
  return current;
}

// The record names a learned family once, even if its card was strengthened or
// later discarded. Gameplay keeps its existing highest-rank history separately.
export function baseAdvancedSkills(skills = []) {
  const seen = new Set();
  return (Array.isArray(skills) ? skills : []).flatMap((skill) => {
    const family = advancedFamily(skill?.cardId);
    if (!COMPLETION_ADVANCED_IDS.includes(family) || seen.has(family)) return [];
    seen.add(family);
    return [{ cardId: family, upgraded: false }];
  });
}

export function ensureArtifactAcquisitionOrder(player) {
  if (!player) return [];
  const seen = new Set();
  player.artifactAcquisitionOrder = [
    ...(Array.isArray(player.artifactAcquisitionOrder) ? player.artifactAcquisitionOrder : []),
    ...(Array.isArray(player.ownedArtifacts) ? player.ownedArtifacts : []),
    ...(Array.isArray(player.artifacts) ? player.artifacts : []),
  ].filter((id) => ARTIFACTS[id] && !ARTIFACTS[id].hidden && !seen.has(id) && seen.add(id));
  return player.artifactAcquisitionOrder;
}

function advancedRank(card) {
  let rank = card?.upgraded ? 1 : 0;
  let current = card?.cardId;
  while (previousAdvancedId[current]) { rank += 2; current = previousAdvancedId[current]; }
  return rank;
}

export function ensureAdvancedSkillOrder(player) {
  if (!player) return [];
  if (!Array.isArray(player.advancedSkillOrder)) player.advancedSkillOrder = [];
  if (!player.advancedSkillHistory || typeof player.advancedSkillHistory !== "object" || Array.isArray(player.advancedSkillHistory)) {
    player.advancedSkillHistory = {};
  }
  const order = player.advancedSkillOrder;
  for (const card of player.deck ?? []) {
    if (!CARDS[card.cardId]?.tags?.includes("advanced")) continue;
    const family = advancedFamily(card.cardId);
    if (!order.includes(family)) order.push(family);
    const previous = player.advancedSkillHistory[family];
    if (!previous || !CARDS[previous.cardId]?.tags?.includes("advanced")
      || advancedFamily(previous.cardId) !== family || advancedRank(card) > advancedRank(previous)) {
      player.advancedSkillHistory[family] = { cardId: card.cardId, upgraded: Boolean(card.upgraded) };
    }
  }
  return order;
}

export function noteAdvancedSkill(player, cardId, upgraded = false) {
  if (!CARDS[cardId]?.tags?.includes("advanced")) return;
  const order = ensureAdvancedSkillOrder(player);
  const family = advancedFamily(cardId);
  if (!order.includes(family)) order.push(family);
  const previous = player.advancedSkillHistory[family];
  const candidate = { cardId, upgraded: Boolean(upgraded) };
  if (!previous || advancedRank(candidate) > advancedRank(previous)) player.advancedSkillHistory[family] = candidate;
}

export function createRunRecords() {
  return {
    telemetryVersion: 4, battleHistoryIncomplete: false, stoneHistoryIncomplete: false,
    battles: 0, pursuitBattles: 0, pursuersDefeated: 0, highestPursuit: 0,
    battleWins: 0, battleEscapes: 0, battleDeaths: 0,
    pursuitWins: 0, pursuitEscapes: 0, pursuitDeaths: 0,
    stonesGained: 50, stonesSpent: 0,
    enemiesDefeated: 0, escapes: 0, escapeFailures: 0, deaths: 0,
    roundsTotal: 0, roundsRecorded: 0, fastestRound: 0, longestRound: 0,
    longestEnemyKeys: [], damageTaken: 0, highestTurnDamage: 0, highestRoundDamage: 0, cardPlays: {},
    artifactUses: {}, artifactOrder: [],
  };
}

export function ensureRunRecords(state) {
  if (!state?.run) return null;
  const defaults = createRunRecords();
  const records = state.run.records && typeof state.run.records === "object" ? state.run.records : {};
  if (natural(records.telemetryVersion) < 4) {
    // Old saves did not retain outcome splits or currency transactions. Keep
    // their old totals; do not manufacture missing history from the balance.
    records.battleHistoryIncomplete = natural(records.battles) > 0;
    records.stoneHistoryIncomplete = true;
    records.stonesGained ??= 50; // Every existing starting style begins with 50.
    records.stonesSpent ??= 0;
    records.telemetryVersion = 4;
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value === "boolean") records[key] = Boolean(records[key]);
    else if (Array.isArray(value)) records[key] = Array.isArray(records[key]) ? records[key] : [];
    else if (value && typeof value === "object") records[key] = records[key] && typeof records[key] === "object" && !Array.isArray(records[key]) ? records[key] : {};
    else records[key] = natural(records[key]);
  }
  state.run.records = records;
  if (state?.map) records.highestPursuit = Math.max(records.highestPursuit, natural(state.map.pursuit));
  ensureAdvancedSkillOrder(state.player);
  // Store first acquisition order with run telemetry so deaths and rewinds keep
  // it, just as they keep card-use counts. Never infer old triggers from visuals.
  records.artifactOrder = [...new Set([...records.artifactOrder, ...ensureArtifactAcquisitionOrder(state.player)])]
    .filter((id) => ARTIFACTS[id] && !ARTIFACTS[id].hidden);
  for (const [id, count] of Object.entries(records.artifactUses)) {
    if (!ARTIFACTS[id] || ARTIFACTS[id].hidden) delete records.artifactUses[id];
    else records.artifactUses[id] = Math.min(100, natural(count));
  }
  return records;
}

export function recordStoneGain(state, amount) {
  if (!state?.run || state.run.completed || state?.combat?.debugEncounter) return;
  const records = ensureRunRecords(state);
  records.stonesGained += natural(amount);
}

export function recordStoneSpend(state, amount) {
  if (!state?.run || state.run.completed || state?.combat?.debugEncounter) return;
  const records = ensureRunRecords(state);
  records.stonesSpent += natural(amount);
}

export function recordArtifactTrigger(state, artifactId, { active = false } = {}) {
  if (!state?.run || state.run.completed || state?.combat?.debugEncounter
    || !ARTIFACTS[artifactId] || ARTIFACTS[artifactId].hidden) return;
  const records = ensureRunRecords(state);
  if (!records.artifactOrder.includes(artifactId)) records.artifactOrder.push(artifactId);
  // Future Signature Artifact refining consumes the reserved 0..100 score.
  // Keep real passive +1 / active +5 hooks and acquisition tie ordering intact.
  records.artifactUses[artifactId] = Math.min(100, natural(records.artifactUses[artifactId]) + (active ? 5 : 1));
}

export function mainArtifactId(state) {
  const records = ensureRunRecords(state);
  if (!records) return null;
  // A strict comparison keeps the earliest acquisition when scores are tied,
  // including an all-zero fresh/legacy run. Hidden Reincarnation is excluded.
  return records.artifactOrder.reduce((best, id) => best === null
    || natural(records.artifactUses[id]) > natural(records.artifactUses[best]) ? id : best, null);
}

export function recordPursuitPeak(state) {
  const records = ensureRunRecords(state);
  if (records) records.highestPursuit = Math.max(records.highestPursuit, natural(state.map?.pursuit));
}

export function recordBattleStart(state) {
  const combat = state?.combat;
  if (!combat || combat.debugEncounter) return;
  // Freeze opening names before Gate summons or any later display-name change.
  // An already-running legacy save can only recover its non-summoned roster.
  combat.recordOpeningEnemyKeys ??= (combat.enemies ?? [])
    .filter((enemy) => !enemy.isSummoned && !enemy.gateSummonOrdinal)
    .map((enemy) => enemy.displayNameKey ?? enemy.nameKey).filter(Boolean);
  if (combat.runRecordStarted) return;
  const records = ensureRunRecords(state);
  if (!records) return;
  combat.runRecordStarted = true;
  records.battles += 1;
  if (combat.pursuit) records.pursuitBattles += 1;
  recordPursuitPeak(state);
}

export function recordEnemyDefeat(state) {
  if (state?.combat?.debugEncounter || !state?.combat?.runRecordStarted) return;
  const records = ensureRunRecords(state);
  if (records) records.enemiesDefeated += 1;
}

export function recordBattleOutcome(state, outcome) {
  const combat = state?.combat;
  if (!combat?.runRecordStarted || combat.runRecordOutcome || combat.debugEncounter) return;
  const records = ensureRunRecords(state);
  if (!records) return;
  finishRoundDamage(state);
  combat.runRecordOutcome = outcome;
  const suffix = outcome === "victory" ? "Wins"
    : ["escape", "enemyEscape"].includes(outcome) ? "Escapes"
      : outcome === "defeat" ? "Deaths" : null;
  if (suffix) {
    records[`battle${suffix}`] += 1;
    if (combat.pursuit) records[`pursuit${suffix}`] += 1;
  }
  // Theft is provisional while fighting. Recovered stones are neither new
  // income nor spending; only the amount lost on the final exit is consumed.
  const stolen = natural(combat.stolenStonesTotal);
  const recovered = outcome === "victory" ? Math.min(stolen, recoveredVictoryStones(combat)) : 0;
  recordStoneSpend(state, stolen - recovered);
  const rounds = Math.max(1, natural(combat.round));
  records.roundsTotal += rounds;
  records.roundsRecorded += 1;
  if (!records.fastestRound || rounds < records.fastestRound) records.fastestRound = rounds;
  if (rounds > records.longestRound) {
    records.longestRound = rounds;
    records.longestEnemyKeys = [...(combat.recordOpeningEnemyKeys ?? (combat.enemies ?? [])
      .filter((enemy) => !enemy.isSummoned && !enemy.gateSummonOrdinal)
      .map((enemy) => enemy.displayNameKey ?? enemy.nameKey).filter(Boolean))];
  }
  if (outcome === "victory" && combat.pursuit) records.pursuersDefeated += 1;
  if (outcome === "escape") records.escapes += 1;
}

// Older pending Qingyi loot had no recovery marker, but its explicit drop
// returns the encounter's stolen total. New encounters mark it when dropped.
export function recoveredVictoryStones(combat) {
  const marked = combat?.loot?.recoveredStones;
  const fallback = (combat?.enemies ?? []).some((enemy) => enemy.enemyId === "qingyiCultivator")
    ? natural(combat?.stolenStonesTotal) : 0;
  return Math.min(natural(combat?.stolenStonesTotal), natural(combat?.loot?.stones), natural(marked ?? fallback));
}

export function recordEscapeFailure(state) {
  if (state?.combat?.debugEncounter || !state?.combat?.runRecordStarted) return;
  const records = ensureRunRecords(state);
  if (records) records.escapeFailures += 1;
}

export function recordDeath(state) {
  const records = ensureRunRecords(state);
  if (records) records.deaths += 1;
}

export function recordPlayerCardUse(state, card) {
  if (state?.combat?.debugEncounter || !state?.combat?.runRecordStarted || !card?.cardId) return;
  const records = ensureRunRecords(state);
  if (!records) return;
  const key = `${card.cardId}:${card.upgraded ? "upgraded" : "base"}`;
  records.cardPlays[key] = natural(records.cardPlays[key]) + 1;
}

// A round includes the player's card phase and every following enemy action.
// Finalize it both at the normal enemy-phase boundary and at early battle exits.
export function finishRoundDamage(state) {
  const combat = state?.combat;
  if (!combat?.runRecordStarted || combat.debugEncounter || combat.recordRoundDamageClosed) return;
  const records = ensureRunRecords(state);
  if (!records) return;
  records.highestRoundDamage = Math.max(records.highestRoundDamage, natural(combat.recordRoundDamage));
  combat.recordRoundDamageClosed = true;
}

export function recordCombatDamage(state, target, beforeHp, afterHp, { source = null, playedCard = false } = {}) {
  const combat = state?.combat;
  if (!combat?.runRecordStarted || combat.debugEncounter || combat.runRecordOutcome) return;
  const damage = Math.max(0, natural(beforeHp) - natural(afterHp));
  if (!damage) return;
  const records = ensureRunRecords(state);
  if (!records) return;
  if (target?.kind === "player") records.damageTaken += damage;
  if (playedCard && combat.activePlayedCardUid && combat.phase === "player"
    && source?.kind === "player" && target?.kind === "enemy") {
    combat.recordPlayerTurnDamage = natural(combat.recordPlayerTurnDamage) + damage;
    combat.recordRoundDamage = natural(combat.recordRoundDamage) + damage;
    records.highestTurnDamage = Math.max(records.highestTurnDamage, combat.recordPlayerTurnDamage);
  }
  // During the enemy phase, all actual enemy HP loss belongs to the preceding
  // player turn: Burn, Heart Demon, Dark Force, counters and enemy self-damage.
  if (combat.phase === "enemy" && target?.kind === "enemy") {
    combat.recordRoundDamage = natural(combat.recordRoundDamage) + damage;
  }
}

export function completionRecord(state) {
  const records = ensureRunRecords(state) ?? createRunRecords();
  const player = state?.player ?? {};
  const order = ensureAdvancedSkillOrder(player);
  const advanced = baseAdvancedSkills(order.map((family) => ({ cardId: family })));
  const refineStats = state?.run?.refineStats ?? {};
  const restOutcomes = {
    manualStudy: { success: natural(refineStats.manualSuccess), failure: natural(refineStats.manualFailure) },
    refineBody: { success: natural(refineStats.bodySuccess), failure: natural(refineStats.bodyFailure) },
    refineSpirit: { success: natural(refineStats.success), failure: natural(refineStats.failure) },
    harmonize: { success: natural(refineStats.harmonizeSuccess), failure: natural(refineStats.harmonizeFailure) },
  };
  const mostUsed = Object.entries(records.cardPlays)
    .filter(([key, count]) => natural(count) > 0 && key !== "heartDemonCard:base")
    .sort((a, b) => natural(b[1]) - natural(a[1]))[0];
  const [mostUsedId, mostUsedVariant] = mostUsed?.[0]?.split(":") ?? [];
  const endedAt = natural(state?.run?.completedAt) || Date.now();
  const elapsedSeconds = Number.isFinite(state?.run?.activeForegroundMs)
    ? Math.floor(Math.max(0, state.run.activeForegroundMs) / 1000)
    : Math.max(0, Math.floor((endedAt - natural(state?.run?.startedAt)) / 1000));
  return {
    recordVersion: 4,
    styleId: state?.run?.styleId ?? player.styleId ?? "sword",
    elapsedSeconds,
    artifactIds: [...new Set(player.ownedArtifacts ?? [])].filter((id) => COMPLETION_ARTIFACT_IDS.includes(id)),
    artifactTotal: COMPLETION_ARTIFACT_IDS.length,
    mainArtifactId: mainArtifactId(state),
    cardCount: (player.deck ?? []).length,
    deckComposition: countDeckComposition(player.deck),
    advanced,
    advancedTotal: COMPLETION_ADVANCED_IDS.length,
    mostUsed: mostUsed && CARDS[mostUsedId] ? { cardId: mostUsedId, upgraded: mostUsedVariant === "upgraded", count: natural(mostUsed[1]) } : null,
    battles: records.battles, pursuitBattles: records.pursuitBattles, pursuersDefeated: records.pursuersDefeated,
    battleOutcomes: { wins: records.battleWins, escapes: records.battleEscapes, deaths: records.battleDeaths },
    pursuitOutcomes: { wins: records.pursuitWins, escapes: records.pursuitEscapes, deaths: records.pursuitDeaths },
    stonesGained: records.stonesGained, stonesSpent: records.stonesSpent,
    battleHistoryIncomplete: records.battleHistoryIncomplete, stoneHistoryIncomplete: records.stoneHistoryIncomplete,
    highestPursuit: records.highestPursuit, enemiesDefeated: records.enemiesDefeated,
    escapes: records.escapes, escapeFailures: records.escapeFailures, deaths: records.deaths,
    averageRounds: records.roundsRecorded ? (records.roundsTotal / records.roundsRecorded).toFixed(1) : "0.0",
    fastestRound: records.fastestRound, longestRound: records.longestRound,
    longestEnemyKeys: [...records.longestEnemyKeys], damageTaken: records.damageTaken,
    highestTurnDamage: records.highestTurnDamage, highestRoundDamage: records.highestRoundDamage,
    restOutcomes,
  };
}

export function completeRun(state, now = Date.now()) {
  if (!state?.run) return;
  state.run.completed = true;
  state.run.completedAt ??= now;
  if (!state.run.completionRecord) {
    state.run.completionRecord = completionRecord(state);
  } else if (!state.run.completionRecord.restOutcomes) {
    // Extend an older finished save without resetting its frozen time or battle statistics.
    const updated = completionRecord(state);
    state.run.completionRecord.advanced = updated.advanced;
    state.run.completionRecord.restOutcomes = updated.restOutcomes;
  }
  const saved = state.run.completionRecord;
  if (saved.recordVersion !== 4) {
    // Keep an older clear's frozen time and combat totals. Its past artifact
    // triggers were not recorded, so only available acquisition order can decide.
    saved.mainArtifactId = mainArtifactId(state);
    saved.advanced = baseAdvancedSkills(saved.advanced);
    // Older snapshots retain their recorded collection where available. The
    // deck's type split is reconstructed from the completed save's actual deck.
    saved.artifactIds = [...new Set(saved.artifactIds ?? state.player?.ownedArtifacts ?? [])]
      .filter((id) => COMPLETION_ARTIFACT_IDS.includes(id));
    saved.artifactTotal = COMPLETION_ARTIFACT_IDS.length;
    saved.advancedTotal = COMPLETION_ADVANCED_IDS.length;
    saved.deckComposition ??= countDeckComposition(state.player?.deck);
    const updated = completionRecord(state);
    saved.battleOutcomes ??= updated.battleOutcomes;
    saved.pursuitOutcomes ??= updated.pursuitOutcomes;
    saved.stonesGained ??= updated.stonesGained;
    saved.stonesSpent ??= updated.stonesSpent;
    saved.battleHistoryIncomplete ??= updated.battleHistoryIncomplete;
    saved.stoneHistoryIncomplete ??= updated.stoneHistoryIncomplete;
    saved.recordVersion = 4;
  }
}
