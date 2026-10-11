import { STYLES } from "../data/styles.js?v=v0.3.88";
import { ARTIFACTS } from "../data/artifacts.js?v=v0.3.88";
import { harmonizeSenseRequirement } from "../data/progression.js?v=v0.3.88";
import { hashSeed, RNG } from "./rng.js?v=v0.3.88";
import { createRunRecords, noteAdvancedSkill, ensureArtifactAcquisitionOrder } from "./run-records.js?v=v0.3.88";

function nextCardUid(deck = []) {
  const used = new Set(deck.map((card) => card.uid));
  let maxNumeric = 0;
  for (const uid of used) {
    const match = /^c(\d+)$/.exec(String(uid ?? ""));
    if (match) maxNumeric = Math.max(maxNumeric, Number(match[1]) || 0);
  }
  let value = maxNumeric + 1;
  while (used.has(`c${value}`)) value += 1;
  return `c${value}`;
}

// Capacity is derived from maximum Sense, never from the spendable current
// resource. Card seals use the same reserved tier table as artifact capacity.
export const SENSE_CAPACITY_TIERS = Object.freeze([
  { minSense: 16, artifacts: 6, seals: 5 },
  { minSense: 13, artifacts: 5, seals: 4 },
  { minSense: 10, artifacts: 4, seals: 3 },
  { minSense: 8, artifacts: 3, seals: 2 },
  { minSense: 6, artifacts: 2, seals: 1 },
].map((tier) => Object.freeze(tier)));

export function senseCapacityLimits(maxSense) {
  const sense = Math.max(0, Math.floor(Number(maxSense) || 0));
  const tier = SENSE_CAPACITY_TIERS.find((entry) => sense >= entry.minSense);
  return { artifacts: tier?.artifacts ?? 0, seals: tier?.seals ?? 0 };
}

export function artifactSlotUnlockSense(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 6) return null;
  return [...SENSE_CAPACITY_TIERS].reverse().find((tier) => tier.artifacts > index)?.minSense ?? null;
}

export function sealedCardCount(player) {
  return (player?.deck ?? []).filter((card) => card.sealed === true).length;
}

export function setCardSealed(player, cardUid, sealed = true) {
  const card = player?.deck?.find((entry) => entry.uid === cardUid);
  if (!card) return { ok: false, reason: "missing" };
  if (sealed && card.sealed !== true
    && sealedCardCount(player) >= senseCapacityLimits(player.maxSense).seals) {
    return { ok: false, reason: "capacity" };
  }
  if (sealed) card.sealed = true;
  else delete card.sealed;
  return { ok: true };
}

// Keep the owned deck intact for refinement, harmonization and records. Only
// combat pools exclude sealed instances, identified by their stable card UID.
export function combatDeckUids(player) {
  return (player?.deck ?? []).filter((card) => card.sealed !== true).map((card) => card.uid);
}

export function removeSealedCardsFromCombat(state) {
  const combat = state?.combat;
  if (!combat) return;
  const sealed = new Set((state.player?.deck ?? []).filter((card) => card.sealed === true).map((card) => card.uid));
  if (!sealed.size) return;
  for (const key of ["draw", "discard", "hand"]) {
    if (Array.isArray(combat[key])) combat[key] = combat[key].filter((uid) => !sealed.has(uid));
  }
  if (sealed.has(combat.selectedCardId)) {
    combat.selectedCardId = null;
    combat.selectedCardAt = 0;
  }
}

function uniqueIds(values = []) {
  const seen = new Set();
  return values.filter((id) => id && !seen.has(id) && seen.add(id));
}

export function migrateTreasureToken(player) {
  if (!player) return;
  const legacy = [player.ownedArtifacts, player.artifacts].some((ids) => Array.isArray(ids) && ids.includes("treasureToken"));
  if (legacy) {
    player.inventory ??= {};
    player.inventory.treasureToken = Math.max(1, Number(player.inventory.treasureToken) || 0);
  }
  for (const key of ["ownedArtifacts", "artifacts", "artifactAcquisitionOrder"]) {
    if (Array.isArray(player[key])) player[key] = player[key].filter((id) => id !== "treasureToken");
  }
}

export function hasTreasureToken(player) {
  migrateTreasureToken(player);
  return (player?.inventory?.treasureToken ?? 0) > 0;
}

export function ensureArtifactCollections(player) {
  if (!player) return { owned: [], equipped: [] };
  migrateTreasureToken(player);
  player.artifacts = uniqueIds(Array.isArray(player.artifacts) ? player.artifacts : []);
  const legacyVisible = player.artifacts.filter((id) => ARTIFACTS[id] && !ARTIFACTS[id].hidden);
  player.ownedArtifacts = uniqueIds([...(Array.isArray(player.ownedArtifacts) ? player.ownedArtifacts : []), ...legacyVisible])
    .filter((id) => ARTIFACTS[id] && !ARTIFACTS[id].hidden);

  const hidden = player.artifacts.filter((id) => ARTIFACTS[id]?.hidden);
  if (ARTIFACTS.reincarnation && !hidden.includes("reincarnation")) hidden.unshift("reincarnation");
  const equipped = player.artifacts
    .filter((id) => ARTIFACTS[id] && !ARTIFACTS[id].hidden && ARTIFACTS[id].equippable !== false && player.ownedArtifacts.includes(id))
    .slice(0, senseCapacityLimits(player.maxSense).artifacts);
  player.artifacts = uniqueIds([...hidden, ...equipped]);
  ensureArtifactAcquisitionOrder(player);
  return { owned: player.ownedArtifacts, equipped };
}

export function isArtifactOwned(player, artifactId) {
  return ensureArtifactCollections(player).owned.includes(artifactId);
}

export function isArtifactEquipped(player, artifactId) {
  return ensureArtifactCollections(player).equipped.includes(artifactId);
}

export function addOwnedArtifact(player, artifactId, { autoEquip = true } = {}) {
  if (!player || !ARTIFACTS[artifactId] || ARTIFACTS[artifactId].hidden) return false;
  const { owned, equipped } = ensureArtifactCollections(player);
  const firstAcquisition = !player.artifactAcquisitionOrder.includes(artifactId);
  if (!owned.includes(artifactId)) player.ownedArtifacts.push(artifactId);
  // Only a first acquisition auto-equips, and it never replaces a full loadout.
  // Existing, intentionally unequipped artifacts remain in the bag. The hidden
  // Reincarnation remains hidden; the Treasure Token is a separate inventory tool.
  if (autoEquip && firstAcquisition && ARTIFACTS[artifactId].equippable !== false
    && !equipped.includes(artifactId) && equipped.length < senseCapacityLimits(player.maxSense).artifacts) {
    player.artifacts.push(artifactId);
  }
  ensureArtifactCollections(player);
  ensureInventoryOrder(player);
  return true;
}

export function toggleArtifactEquip(player, artifactId) {
  if (!player || !isArtifactOwned(player, artifactId) || ARTIFACTS[artifactId]?.equippable === false) return { equipped: false, displaced: null };
  const { equipped } = ensureArtifactCollections(player);
  const capacity = senseCapacityLimits(player.maxSense).artifacts;
  if (equipped.includes(artifactId)) {
    player.artifacts = player.artifacts.filter((id) => id !== artifactId);
    ensureArtifactCollections(player);
    return { equipped: false, displaced: artifactId };
  }
  // A full loadout must be freed explicitly in the bag. This includes zero
  // capacity: reject the new artifact without moving any existing equipment.
  if (equipped.length >= capacity) return { equipped: false, displaced: null, capacityFull: true };
  player.artifacts.push(artifactId);
  ensureArtifactCollections(player);
  return { equipped: true, displaced: null };
}

export function removeOwnedArtifact(player, artifactId) {
  if (!player) return false;
  ensureArtifactCollections(player);
  const had = player.ownedArtifacts.includes(artifactId);
  player.ownedArtifacts = player.ownedArtifacts.filter((id) => id !== artifactId);
  player.artifacts = player.artifacts.filter((id) => id !== artifactId);
  ensureArtifactCollections(player);
  ensureInventoryOrder(player);
  return had;
}


export function cardUseCountKey(card) {
  if (!card?.cardId) return "";
  return `${card.cardId}${card.upgraded ? ":upgraded" : ":base"}`;
}

export function ensureCardUseCounts(player) {
  if (!player) return {};
  player.cardUseCounts ??= {};
  if (typeof player.cardUseCounts !== "object" || Array.isArray(player.cardUseCounts)) player.cardUseCounts = {};
  for (const card of Array.isArray(player.deck) ? player.deck : []) {
    const key = cardUseCountKey(card);
    if (!key) continue;
    const value = Math.max(0, Math.min(500, Math.floor(Number(player.cardUseCounts[key]) || 0)));
    player.cardUseCounts[key] = value;
  }
  return player.cardUseCounts;
}

export function getCardUseCount(player, card) {
  const key = cardUseCountKey(card);
  if (!key) return 0;
  const counts = ensureCardUseCounts(player);
  return Math.max(0, Math.min(500, Math.floor(Number(counts[key]) || 0)));
}

export function addCardUseCount(player, card, amount = 1) {
  const key = cardUseCountKey(card);
  if (!key) return 0;
  const counts = ensureCardUseCounts(player);
  counts[key] = Math.max(0, Math.min(500, Math.floor(Number(counts[key]) || 0) + Math.floor(Number(amount) || 0)));
  return counts[key];
}

export function makeCardInstance(cardId, { uid = null, upgraded = false } = {}) {
  return { uid: uid ?? `c1`, cardId, upgraded };
}

// New cards append to the live deck in true acquisition order. Refinement mutates
// an existing instance in place, so its uid/index remain stable while newly learned
// cards and Heart Demon pollution naturally appear at the moment they are gained.
export function appendCardInstance(player, cardId, { upgraded = false } = {}) {
  player.deck ??= [];
  const instance = makeCardInstance(cardId, { uid: nextCardUid(player.deck), upgraded });
  player.deck.push(instance);
  noteAdvancedSkill(player, cardId, upgraded);
  ensureCardUseCounts(player);
  return instance;
}


export function ensureInventoryOrder(player) {
  if (!player) return [];
  migrateTreasureToken(player);
  player.inventory ??= {};
  const ownedArtifacts = new Set(Array.isArray(player.ownedArtifacts) ? player.ownedArtifacts : []);
  const held = (id) => (player.inventory[id] ?? 0) > 0
    || Boolean(ARTIFACTS[id] && !ARTIFACTS[id].hidden && ownedArtifacts.has(id));
  const seen = new Set();
  const order = Array.isArray(player.inventoryOrder) ? player.inventoryOrder : [];
  player.inventoryOrder = order.filter((id) => {
    if (!id || id === "spiritStone" || seen.has(id) || !held(id)) return false;
    seen.add(id);
    return true;
  });
  for (const id of Object.keys(player.inventory)) {
    if (id !== "spiritStone" && (player.inventory[id] ?? 0) > 0 && !seen.has(id)) {
      player.inventoryOrder.push(id);
      seen.add(id);
    }
  }
  for (const id of Array.isArray(player.ownedArtifacts) ? player.ownedArtifacts : []) {
    if (ARTIFACTS[id] && !ARTIFACTS[id].hidden && !seen.has(id)) {
      player.inventoryOrder.push(id);
      seen.add(id);
    }
  }
  // The currency tile is rendered first separately; the special tool is always next.
  if ((player.inventory.treasureToken ?? 0) > 0) {
    player.inventoryOrder = ["treasureToken", ...player.inventoryOrder.filter((id) => id !== "treasureToken")];
  }
  return player.inventoryOrder;
}

export function addInventoryItem(player, itemId, count = 1) {
  if (!player || !itemId) return 0;
  player.inventory ??= {};
  ensureInventoryOrder(player);
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  if (amount <= 0) return player.inventory[itemId] ?? 0;
  if (!player.inventoryOrder.includes(itemId)) player.inventoryOrder.push(itemId);
  player.inventory[itemId] = (player.inventory[itemId] ?? 0) + amount;
  ensureInventoryOrder(player);
  return player.inventory[itemId];
}

function weightedScatterChoice(entries = [], rng) {
  const valid = entries.filter((entry) => Number(entry?.weight) > 0);
  const total = valid.reduce((sum, entry) => sum + Math.floor(Number(entry.weight) || 0), 0);
  if (total <= 0) return [...(valid[0]?.cards ?? [])];
  let roll = rng.int(1, total);
  for (const entry of valid) {
    roll -= Math.floor(Number(entry.weight) || 0);
    if (roll <= 0) return [...(entry.cards ?? [])];
  }
  return [...(valid.at(-1)?.cards ?? [])];
}

function buildScatterDeck(style, seed) {
  const config = style?.randomDeck;
  if (!config) return [...(style?.deck ?? [])];
  // Use a dedicated seeded generator so Scatter's starting build is reproducible
  // without consuming or shifting the run's formal combat/map RNG sequence.
  const rng = new RNG(`${seed}:scatter:startingDeck`);
  const sword = weightedScatterChoice(config.swordPanels, rng);
  const body = weightedScatterChoice(config.bodyPanels, rng);
  const lawBasics = [...(config.lawBasics ?? [])];
  const commonSpells = [...(config.commonSpells ?? [])];
  const lawDeckOrder = new Map((STYLES.law?.deck ?? []).map((id, index) => [id, index]));
  const basics = Array.from({ length: 2 }, () => rng.pick(lawBasics)).filter(Boolean);
  const commons = rng.shuffle(commonSpells).slice(0, 3);
  const spells = [...basics, ...commons].sort((a, b) =>
    (lawDeckOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (lawDeckOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
  );
  return [...sword, ...spells, ...body];
}

export function createInitialState({ styleId, artifactId = "tianji", language, seed, rngSnapshot }) {
  const style = STYLES[styleId] ?? STYLES.sword;
  const startingArtifactId = "tianji"; // v0.2.56: new runs always begin with Tianji Compass.
  const initialDeckIds = style.id === "scatter" ? buildScatterDeck(style, seed) : [...style.deck];
  const deck = initialDeckIds.map((cardId, index) => makeCardInstance(cardId, { uid: `c${index + 1}` }));
  let initialMaxHp = style.hp;
  let initialMaxMana = style.mana;
  let initialMaxSense = style.sense;
  if (style.randomStats) {
    const [manaMin, manaMax] = style.randomStats.mana ?? [style.mana, style.mana];
    const [senseMin, senseMax] = style.randomStats.sense ?? [style.sense, style.sense];
    const roll = (label, min, max) => min + (hashSeed(`${seed}:${style.id}:${label}`) % (max - min + 1));
    initialMaxMana = roll("mana", manaMin, manaMax);
    initialMaxSense = roll("sense", senseMin, senseMax);
    const budget = Math.max(0, Math.floor(style.randomStats.budget ?? 300));
    initialMaxHp = Math.floor((budget - 20 * initialMaxMana - 10 * initialMaxSense) / 2);
  }
  const inventory = {
    refiningPill: 1,
    bloodPill: 1,
    focusPill: 0,
    soulGatheringPill: 0,
    lifeLockPill: 0,
    qiPill: 0,
    swiftTalisman: 0,
    coolingTalisman: 0,
    diamondTalisman: 0,
    armorBreakTalisman: 0,
    spiritHeartTalisman: 0,
    thunderTalisman: 0,
    fireTalisman: 0,
    swordTalisman: 1,
    heavenDemonTalisman: 0,
    wolfFang: 0,
    bigWolfFang: 0,
    spiderSilk: 0,
    snakeSlough: 0,
    drugResidue: 0,
    stoneHeart: 0,
  };
  return {
    saveVersion: 1,
    screen: "map",
    language,
    rng: rngSnapshot,
    run: {
      seed: String(seed), styleId, startedAt: Date.now(), activeForegroundMs: 0, completed: false,
      openingWolfDefeated: false,
      refineStats: {
        success: 0, failure: 0, pillsConsumed: 0, basicUpgrades: 0,
        advancedUnlocks: 0, advancedFirstUpgrades: 0, advancedSecondUpgrades: 0,
        manualSuccess: 0, manualFailure: 0, bodySuccess: 0, bodyFailure: 0,
        harmonizeSuccess: 0, harmonizeFailure: 0,
      },
      records: createRunRecords(),
      uniqueDropFlags: {},
      chapterIndex: 1,
      uniqueChapterDropFlags: {},
    },
    player: {
      kind: "player",
      styleId,
      evasion: style.evasion ?? 0,
      hp: Math.max(0, Math.floor(initialMaxHp * 0.60)), maxHp: initialMaxHp,
      mana: 0, maxMana: initialMaxMana,
      sense: 1, maxSense: initialMaxSense,
      harmonizeCount: 0,
      harmonizeSenseProgress: 0,
      harmonizeSenseThreshold: harmonizeSenseRequirement(initialMaxSense),
      qi: 0, guard: 0,
      statuses: {}, buffOrder: [],
      stones: 50,
      deck,
      advancedSkillOrder: [],
      advancedSkillHistory: {},
      cardUseCounts: Object.fromEntries(deck.map((card) => [cardUseCountKey(card), 0])),
      inventory,
      inventoryOrder: [...Object.keys(inventory).filter((id) => (inventory[id] ?? 0) > 0), startingArtifactId],
      artifacts: ["reincarnation", startingArtifactId],
      ownedArtifacts: [startingArtifactId],
      artifactAcquisitionOrder: [startingArtifactId],
    },
    map: {
      currentNodeId: "0B",
      resolved: { "0B": false },
      history: [],
      blockedNodes: [],
      revealedFrom: {},
      shopStocks: {},
      shopUi: { nodeId: null, entered: false, tab: "buy", leavePrompt: false, buyConfirm: null, sellConfirm: null, discountPrompt: false, discountRollUsed: false, discountActive: false, retentionUsed: false, debugSession: false, returnScreen: null },
      eventFlags: { randomEventPoolV186: true, openingHpV187: true, openingStoryFiveStepV245: true, openingStorySixStepV247: true, openingStorySevenStepV250: true, openingStorySixStepV251: true, openingStoryFiveStepV289: true },
      randomEventPool: ["rift", "corpse", "tablet"],
      pursuit: 0,
      pursuitStealth: 0,
      zhengyangChiefPursuitHideRemaining: 0,
      rookieSquadPursuitStateByChapter: {},
      canStayRest: false,
      spiritRestRemaining: 0,
      pendingMoveTarget: null,
      revealedPaths: {},
      postBattlePrompt: null,
      restContext: null,
      restHeartDemonResult: null,
      restSuccessResult: null,
      harmonyMilestoneResult: null,
      pendingRestCardUnlock: null,
      pendingRestCardUnlocks: [],
      restCardUnlockResult: null,
      manualLearnResult: null,
      pursuitPrompt: null,
      openingStoryDismissed: false,
      openingStoryStep: 1,
      depthSevenWarningDismissed: false,
      depthSevenWarningPending: false,
      pathRecoveryAtNode: "0B",
      pendingSenseRecoveryNode: null,
      pendingMoveHadPursuit: false,
      pendingMoveHadLongBattle: false,
    },
    world: { flags: {} },
    combat: null,
    overlay: null,
  };
}
export function reducePursuitValue(map, amount = 1) {
  const delta = Math.max(0, Math.floor(amount ?? 0));
  if (!map || delta <= 0) return 0;
  const before = Math.max(0, Math.floor(map.pursuit ?? 0));
  map.pursuit = Math.max(0, before - delta);
  if (before >= 1 && map.pursuit === 0) map.pursuitStealth = 0;
  return before - map.pursuit;
}
