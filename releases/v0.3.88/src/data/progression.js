/**
 * Advanced card progression data shared by every cultivation school.
 *
 * Keep progression declarations here so RestEngine only owns the refinement
 * workflow (resource costs, queues, popups and card mutation). New schools can
 * add unlock/upgrade data without expanding rest.js with school-specific names.
 */

export function harmonizeSenseRequirement(maxSense) {
  const maximum = Math.max(0, Math.floor(Number(maxSense) || 0));
  return maximum < 9 ? 2 : maximum < 12 ? 3 : maximum < 15 ? 4 : maximum < 18 ? 5 : null;
}

const BASE_SWORD_REFINEMENT_IDS = Object.freeze([
  "swordControl", "swordGuard", "swordQiSlash", "swordIntent", "myriadSwords",
]);

const BASE_LAW_REFINEMENT_IDS = Object.freeze([
  "palmThunder", "greenWood", "waterDragon", "karmaFire", "stoneScreen",
]);

const BASE_BODY_REFINEMENT_IDS = Object.freeze([
  "inchPunch", "shadowKick", "bodyTemper", "mountainForce",
]);

// Five-Elements refinement bookkeeping is derived from the cards currently
// retained in Mind Sea. Harmonize/discard therefore immediately changes the
// opposing-element penalty without any historical counter to migrate.
export const FIVE_ELEMENT_OVERCOMES = Object.freeze({
  metal: "wood",
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal",
});

const ELEMENTAL_REFINEMENT_INFO = Object.freeze({
  palmThunder: { element: "metal", basic: true },
  fiveThunder: { element: "metal", level: 0 },
  fiveThunderPlus: { element: "metal", level: 1 },
  fiveThunderPlusPlus: { element: "metal", level: 2 },

  waterDragon: { element: "water", basic: true },
  fourSeasReturn: { element: "water", level: 0 },
  fourSeasReturnPlus: { element: "water", level: 1 },
  fourSeasReturnPlusPlus: { element: "water", level: 2 },

  greenWood: { element: "wood", basic: true },
  evergreenTribulation: { element: "wood", level: 0 },
  evergreenTribulationPlus: { element: "wood", level: 1 },
  evergreenTribulationPlusPlus: { element: "wood", level: 2 },

  karmaFire: { element: "fire", basic: true },
  samadhiTrueFire: { element: "fire", level: 0 },
  samadhiTrueFirePlus: { element: "fire", level: 1 },
  samadhiTrueFirePlusPlus: { element: "fire", level: 2 },

  stoneScreen: { element: "earth", basic: true },
  mountTai: { element: "earth", level: 0 },
  mountTaiPlus: { element: "earth", level: 1 },
  mountTaiPlusPlus: { element: "earth", level: 2 },
});

export function getRefinementElement(card) {
  return ELEMENTAL_REFINEMENT_INFO[card?.cardId]?.element ?? null;
}

export function getElementalRefinementLevel(card) {
  const info = ELEMENTAL_REFINEMENT_INFO[card?.cardId];
  if (!info) return 0;
  if (info.basic) return card?.upgraded ? 1 : 0;
  return Math.max(0, Math.floor(Number(info.level) || 0));
}

export function getElementalRefinementCounts(player) {
  const counts = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
  for (const card of player?.deck ?? []) {
    const element = getRefinementElement(card);
    if (!element) continue;
    counts[element] += getElementalRefinementLevel(card);
  }
  return counts;
}

export function getElementalRefinementPenalty(player, targetCard) {
  const targetElement = getRefinementElement(targetCard);
  if (!targetElement) return 0;
  const overcomingElement = Object.entries(FIVE_ELEMENT_OVERCOMES).find(([, overcome]) => overcome === targetElement)?.[0];
  if (!overcomingElement) return 0;
  return getElementalRefinementCounts(player)[overcomingElement] * 15;
}

export const ADVANCED_UPGRADE_CHAINS = Object.freeze({
  myriadSwordsReturn: "myriadSwordsReturnPlus",
  myriadSwordsReturnPlus: "myriadSwordsReturnPlusPlus",
  swordDomain: "swordDomainPlus",
  swordDomainPlus: "swordDomainPlusPlus",
  heartSword: "heartSwordPlus",
  heartSwordPlus: "heartSwordPlusPlus",
  fiveThunder: "fiveThunderPlus",
  fiveThunderPlus: "fiveThunderPlusPlus",
  evergreenTribulation: "evergreenTribulationPlus",
  evergreenTribulationPlus: "evergreenTribulationPlusPlus",
  mountTai: "mountTaiPlus",
  mountTaiPlus: "mountTaiPlusPlus",
  fourSeasReturn: "fourSeasReturnPlus",
  fourSeasReturnPlus: "fourSeasReturnPlusPlus",
  samadhiTrueFire: "samadhiTrueFirePlus",
  samadhiTrueFirePlus: "samadhiTrueFirePlusPlus",
  frenzyPalm: "frenzyPalmPlus",
  frenzyPalmPlus: "frenzyPalmPlusPlus",
  ghostFlash: "ghostFlashPlus",
  ghostFlashPlus: "ghostFlashPlusPlus",
  undyingBody: "undyingBodyPlus",
  undyingBodyPlus: "undyingBodyPlusPlus",
  huntianGong: "huntianGongPlus",
  huntianGongPlus: "huntianGongPlusPlus",
});

// Order is presentation-sensitive when one refinement satisfies several rules.
// Existing Sword/Law unlock ordering remains stable; the Body advanced arts follow
// Qian Kun One Qi in their own deterministic order.
export const ADVANCED_UNLOCK_ORDER = Object.freeze([
  "myriadSwordsReturn",
  "swordGod",
  "swordDomain",
  "heartSword",
  "fiveThunder",
  "evergreenTribulation",
  "mountTai",
  "fourSeasReturn",
  "samadhiTrueFire",
  "kuiThunder",
  "yinWaterThunder",
  "sweetRain",
  "wildfire",
  "nirvanaSpell",
  "metalStoneBurst",
  "qianKunOneQi",
  "frenzyPalm",
  "ghostFlash",
  "undyingBody",
  "huntianGong",
  "ironBone",
  "humanSwordUnity",
  "fiveElementsSword",
  "fiveThunderHeartPalm",
  // Hidden cross-school techniques always appear after every previous unlock.
  "coldThunderSword",
  "thunderSeal",
  "samadhiWind",
  "redDragonBreath",
  "rockFinger",
  "devouringHeaven",
]);


export const ADVANCED_UNLOCK_RULES = Object.freeze({
  myriadSwordsReturn: {
    school: "sword",
    flag: "myriadSwordsReturnUnlocked",
    variants: ["myriadSwordsReturn", "myriadSwordsReturnPlus", "myriadSwordsReturnPlusPlus"],
    requirements: { upgradedAll: ["myriadSwords"], upgradedCopies: { cardId: "swordControl", count: 2 } },
  },
  swordGod: {
    school: "sword",
    flag: "swordGodUnlocked",
    variants: ["swordGod"],
    previewHidden: true,
    requirements: { upgradedCopies: { cardId: "swordControl", count: 4 } },
  },
  swordDomain: {
    school: "sword",
    flag: "swordDomainUnlocked",
    variants: ["swordDomain", "swordDomainPlus", "swordDomainPlusPlus"],
    requirements: { upgradedAll: ["swordGuard", "swordIntent"] },
  },
  heartSword: {
    school: "sword",
    flag: "heartSwordUnlocked",
    variants: ["heartSword", "heartSwordPlus", "heartSwordPlusPlus"],
    requirements: { upgradedCopies: { cardId: "swordQiSlash", count: 2 } },
  },
  fiveThunder: {
    school: "law",
    flag: "fiveThunderUnlocked",
    variants: ["fiveThunder", "fiveThunderPlus", "fiveThunderPlusPlus"],
    requirements: { upgradedCopies: { cardId: "palmThunder", count: 2 } },
  },
  evergreenTribulation: {
    school: "law",
    flag: "evergreenTribulationUnlocked",
    variants: ["evergreenTribulation", "evergreenTribulationPlus", "evergreenTribulationPlusPlus"],
    requirements: { upgradedCopies: { cardId: "greenWood", count: 2 } },
  },
  mountTai: {
    school: "law",
    flag: "mountTaiUnlocked",
    variants: ["mountTai", "mountTaiPlus", "mountTaiPlusPlus"],
    requirements: { upgradedCopies: { cardId: "stoneScreen", count: 2 } },
  },
  fourSeasReturn: {
    school: "law",
    flag: "fourSeasReturnUnlocked",
    variants: ["fourSeasReturn", "fourSeasReturnPlus", "fourSeasReturnPlusPlus"],
    requirements: { upgradedCopies: { cardId: "waterDragon", count: 2 } },
  },
  samadhiTrueFire: {
    school: "law",
    flag: "samadhiTrueFireUnlocked",
    variants: ["samadhiTrueFire", "samadhiTrueFirePlus", "samadhiTrueFirePlusPlus"],
    requirements: { upgradedCopies: { cardId: "karmaFire", count: 2 } },
  },
  kuiThunder: {
    school: "sword",
    flag: "kuiThunderUnlocked",
    variants: ["kuiThunder"],
    previewHidden: true,
    requirements: { upgradedDistinct: { cardIds: BASE_SWORD_REFINEMENT_IDS, count: 3 } },
  },
  yinWaterThunder: {
    school: "law",
    flag: "yinWaterThunderUnlocked",
    variants: ["yinWaterThunder"],
    previewHidden: true,
    requirements: {
      upgradedAll: ["palmThunder", "waterDragon"],
      ownedAny: ["fiveThunderPlus", "fiveThunderPlusPlus", "fourSeasReturnPlus", "fourSeasReturnPlusPlus"],
    },
  },
  sweetRain: {
    school: "law",
    flag: "sweetRainUnlocked",
    variants: ["sweetRain"],
    previewHidden: true,
    requirements: {
      upgradedAll: ["waterDragon", "greenWood"],
      ownedAny: ["fourSeasReturnPlus", "fourSeasReturnPlusPlus", "evergreenTribulationPlus", "evergreenTribulationPlusPlus"],
    },
  },
  wildfire: {
    school: "law",
    flag: "wildfireUnlocked",
    variants: ["wildfire"],
    previewHidden: true,
    requirements: {
      upgradedAll: ["greenWood", "karmaFire"],
      ownedAny: ["evergreenTribulationPlus", "evergreenTribulationPlusPlus", "samadhiTrueFirePlus", "samadhiTrueFirePlusPlus"],
    },
  },
  nirvanaSpell: {
    school: "law",
    flag: "nirvanaSpellUnlocked",
    variants: ["nirvanaSpell"],
    previewHidden: true,
    requirements: {
      upgradedAll: ["karmaFire", "stoneScreen"],
      ownedAny: ["samadhiTrueFirePlus", "samadhiTrueFirePlusPlus", "mountTaiPlus", "mountTaiPlusPlus"],
    },
  },
  metalStoneBurst: {
    school: "law",
    flag: "metalStoneBurstUnlocked",
    variants: ["metalStoneBurst"],
    previewHidden: true,
    requirements: {
      upgradedAll: ["stoneScreen", "palmThunder"],
      ownedAny: ["mountTaiPlus", "mountTaiPlusPlus", "fiveThunderPlus", "fiveThunderPlusPlus"],
    },
  },
  qianKunOneQi: {
    school: "law",
    flag: "qianKunOneQiUnlocked",
    variants: ["qianKunOneQi"],
    previewHidden: true,
    requirements: { upgradedDistinct: { cardIds: BASE_LAW_REFINEMENT_IDS, count: 3 } },
  },
  frenzyPalm: { school: "body", flag: "frenzyPalmUnlocked", variants: ["frenzyPalm", "frenzyPalmPlus", "frenzyPalmPlusPlus"], requirements: { upgradedCopies: { cardId: "inchPunch", count: 3 } } },
  ghostFlash: { school: "body", flag: "ghostFlashUnlocked", variants: ["ghostFlash", "ghostFlashPlus", "ghostFlashPlusPlus"], requirements: { upgradedCopies: { cardId: "shadowKick", count: 3 } } },
  undyingBody: { school: "body", flag: "undyingBodyUnlocked", variants: ["undyingBody", "undyingBodyPlus", "undyingBodyPlusPlus"], requirements: { upgradedCopies: { cardId: "bodyTemper", count: 3 } } },
  huntianGong: { school: "body", flag: "huntianGongUnlocked", variants: ["huntianGong", "huntianGongPlus", "huntianGongPlusPlus"], requirements: { upgradedCopies: { cardId: "mountainForce", count: 2 } } },
  ironBone: { school: "body", flag: "ironBoneUnlocked", variants: ["ironBone"], requirements: { upgradedDistinct: { cardIds: BASE_BODY_REFINEMENT_IDS, count: 3 } } },
  humanSwordUnity: {
    school: "sword", flag: "humanSwordUnityUnlocked", variants: ["humanSwordUnity"], previewHidden: true,
    requirements: { upgradedCopiesAll: [
      { cardId: "swordGuard", count: 2 },
      { cardId: "swordIntent", count: 2 },
      { cardId: "bodyTemper", count: 1 },
    ] },
  },
  fiveElementsSword: {
    school: "law", flag: "fiveElementsSwordUnlocked", variants: ["fiveElementsSword"], previewHidden: true,
    requirements: { upgradedAll: ["palmThunder", "greenWood", "waterDragon", "karmaFire", "stoneScreen", "swordControl"] },
  },
  fiveThunderHeartPalm: {
    school: "body", flag: "fiveThunderHeartPalmUnlocked", variants: ["fiveThunderHeartPalm"], previewHidden: true,
    requirements: { upgradedAll: ["palmThunder"], upgradedCopies: { cardId: "inchPunch", count: 4 } },
  },
  coldThunderSword: {
    school: "sword", flag: "coldThunderSwordUnlocked", variants: ["coldThunderSword"], previewHidden: true,
    requirements: { upgradedCopies: { cardId: "frostSpell", count: 2 }, ownedAny: ["kuiThunder"] },
  },
  thunderSeal: {
    school: "law", flag: "thunderSealUnlocked", variants: ["thunderSeal"], previewHidden: true,
    requirements: { upgradedCopies: { cardId: "goldLight", count: 3 } },
  },
  samadhiWind: {
    school: "law", flag: "samadhiWindUnlocked", variants: ["samadhiWind"], previewHidden: true,
    requirements: { upgradedCopies: { cardId: "clearWind", count: 3 } },
  },
  redDragonBreath: {
    school: "law", flag: "redDragonBreathUnlocked", variants: ["redDragonBreath"], previewHidden: true,
    requirements: { upgradedCopies: { cardId: "fireball", count: 3 } },
  },
  rockFinger: {
    school: "body", flag: "rockFingerUnlocked", variants: ["rockFinger"], previewHidden: true,
    requirements: { upgradedCopies: { cardId: "earthEscape", count: 2 }, ownedAny: ["ironBone"] },
  },
  devouringHeaven: {
    school: "law", flag: "devouringHeavenUnlocked", variants: ["devouringHeaven"], previewHidden: true,
    requirements: { upgradedCopies: { cardId: "qiEating", count: 2 }, ownedAny: ["qianKunOneQi"] },
  },
});

export const ADVANCED_TERMINAL_CARD_IDS = Object.freeze([
  ...Object.values(ADVANCED_UPGRADE_CHAINS).filter((cardId) => !(cardId in ADVANCED_UPGRADE_CHAINS)),
  "swordGod",
  "kuiThunder",
  "yinWaterThunder",
  "sweetRain",
  "wildfire",
  "nirvanaSpell",
  "metalStoneBurst",
  "qianKunOneQi",
  "ironBone",
  "humanSwordUnity",
  "fiveElementsSword",
  "fiveThunderHeartPalm",
  "coldThunderSword",
  "thunderSeal",
  "samadhiWind",
  "redDragonBreath",
  "rockFinger",
  "devouringHeaven",
]);

export function isAdvancedUnlockEligible(player, rule) {
  if (!player || !rule?.requirements) return false;
  const deck = Array.isArray(player.deck) ? player.deck : [];
  const { upgradedAll, upgradedCopies, upgradedCopiesAll, upgradedDistinct, ownedAny } = rule.requirements;

  if (Array.isArray(upgradedAll) && !upgradedAll.every((cardId) =>
    deck.some((card) => card.cardId === cardId && card.upgraded)
  )) return false;

  if (upgradedCopies) {
    const needed = Math.max(0, Math.floor(upgradedCopies.count ?? 0));
    const actual = deck.filter((card) => card.cardId === upgradedCopies.cardId && card.upgraded).length;
    if (actual < needed) return false;
  }

  if (Array.isArray(upgradedCopiesAll) && !upgradedCopiesAll.every((spec) => {
    const needed = Math.max(0, Math.floor(spec?.count ?? 0));
    const actual = deck.filter((card) => card.cardId === spec?.cardId && card.upgraded).length;
    return actual >= needed;
  })) return false;

  if (upgradedDistinct) {
    const ids = Array.isArray(upgradedDistinct.cardIds) ? upgradedDistinct.cardIds : [];
    const needed = Math.max(0, Math.floor(upgradedDistinct.count ?? 0));
    const actual = ids.filter((cardId) => deck.some((card) => card.cardId === cardId && card.upgraded)).length;
    if (actual < needed) return false;
  }

  if (Array.isArray(ownedAny) && ownedAny.length > 0 && !ownedAny.some((cardId) =>
    deck.some((card) => card.cardId === cardId)
  )) return false;

  return true;
}
