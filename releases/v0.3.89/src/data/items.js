import { SKILL_SFX_BY_ITEM_ID } from "./skill-sfx.js?v=v0.3.89";

export const ITEMS = {
  spiritStone: { id: "spiritStone", type: "currency", actionType: "support", nameKey: "item.spiritStone.name", descKey: "item.spiritStone.desc", usable: ["map","combat"], useCost: 20, manaGain: 1, requiresMissingMana: true },
  highSpiritStone: { id: "highSpiritStone", itemNo: 46, rarity: 1, type: "material", actionType: "support",
    nameKey: "item.highSpiritStone.name", descKey: "item.highSpiritStone.desc", nameColorClass: "item-name-spirit-stone",
    sell: 5, usable: ["map","combat"], useCost: 4, requiresMissingMana: true,
    effects: [{ type: "gainMana", amount: 1, target: "self" }] },
  spiritJade: { id: "spiritJade", itemNo: 47, rarity: 2, type: "material", actionType: "support",
    nameKey: "item.spiritJade.name", descKey: "item.spiritJade.desc", nameColorClass: "item-name-spirit-stone",
    sell: 25, usable: ["map","combat"], useCost: 1,
    effects: [{ type: "gainMana", amount: 2, allowOverflow: true, target: "self" }] },
  highSpiritJade: { id: "highSpiritJade", itemNo: 48, rarity: 3, type: "material", actionType: "support",
    nameKey: "item.highSpiritJade.name", descKey: "item.highSpiritJade.desc", nameColorClass: "item-name-spirit-stone",
    sell: 100, usable: ["map","combat"], useCost: 1,
    effects: [{ type: "gainMana", amount: 8, allowOverflow: true, target: "self" }] },
  treasureToken: { id: "treasureToken", itemNo: 45, type: "tool", actionType: "support",
    nameKey: "item.treasureToken.name", descKey: "item.treasureToken.desc", usable: ["map"],
    iconPath: "./assets/icons/artifacts/treasureToken.svg", nameColorClass: "artifact-name-treasure-token" },

  // Pills. Great Derivation Pill is mechanically grade 4 but keeps its dedicated
  // purple-red animated name instead of the generic grade-4 purple.
  refiningPill: { id: "refiningPill", itemNo: 1, rarity: 4, type: "pill", actionType: "support", nameKey: "item.refiningPill.name", descKey: "item.refiningPill.desc", price: 80, shopSellable: true },
  bloodPill: { id: "bloodPill", itemNo: 2, rarity: 1, type: "pill", actionType: "support", nameKey: "item.bloodPill.name", descKey: "item.bloodPill.desc", price: 40, shopSellable: true, usable: ["map","combat"], effects: [{ type: "heal", amount: 15, target: "self" }] },
  qiPill: { id: "qiPill", itemNo: 3, rarity: 2, type: "pill", actionType: "support", nameKey: "item.qiPill.name", descKey: "item.qiPill.desc", price: 50, shopSellable: true, usable: ["map","combat"], effects: [{ type: "gainMana", amount: 4, allowOverflow: true, target: "self" }] },
  focusPill: { id: "focusPill", itemNo: 4, rarity: 3, type: "pill", actionType: "support", nameKey: "item.focusPill.name", descKey: "item.focusPill.desc", price: 60, shopSellable: true, usable: ["map","combat"], effects: [{ type: "gainSense", amount: 4, allowOverflow: true, target: "self" }] },
  soulGatheringPill: { id: "soulGatheringPill", itemNo: 5, rarity: 4, type: "pill", actionType: "support", nameKey: "item.soulGatheringPill.name", descKey: "item.soulGatheringPill.desc", price: 100, shopSellable: true, usable: ["combat"], effects: [{ type: "addStatus", status: "undying", stacks: 2, chance: 100, target: "self" }] },
  // Drop/event-only: it is resellable but deliberately has no shop price or
  // shopSellable flag, so shelf generation can never offer it for purchase.
  lifeLockPill: { id: "lifeLockPill", itemNo: 44, rarity: 4, type: "pill", actionType: "support", nameKey: "item.lifeLockPill.name", descKey: "item.lifeLockPill.desc", sell: 90, usable: ["map","combat"], effects: [{ type: "heal", amount: 30, target: "self" }, { type: "addStatus", status: "undying", stacks: 1, chance: 100, target: "self", combatOnly: true }] },

  // Talismans.
  swiftTalisman: { id: "swiftTalisman", itemNo: 5, rarity: 2, type: "talisman", actionType: "support", nameKey: "item.swiftTalisman.name", descKey: "item.swiftTalisman.desc", price: 50, shopSellable: true, usable: ["combat"], effects: [{ type: "draw", amount: 2, target: "self" }, { type: "increaseFleeChance", amount: 40, target: "self" }] },
  coolingTalisman: { id: "coolingTalisman", itemNo: 6, rarity: 2, type: "talisman", actionType: "support", nameKey: "item.coolingTalisman.name", descKey: "item.coolingTalisman.desc", price: 50, shopSellable: true, usable: ["combat"], effects: [{ type: "removeStatus", status: "burn", stacks: 10, target: "self" }] },
  diamondTalisman: { id: "diamondTalisman", itemNo: 7, rarity: 2, type: "talisman", actionType: "defense", nameKey: "item.diamondTalisman.name", descKey: "item.diamondTalisman.desc", price: 50, shopSellable: true, usable: ["combat"], effects: [{ type: "gainQi", amount: 12, target: "self" }, { type: "gainGuard", amount: 12, target: "self" }] },
  armorBreakTalisman: { id: "armorBreakTalisman", itemNo: 8, rarity: 2, type: "talisman", actionType: "attack", nameKey: "item.armorBreakTalisman.name", descKey: "item.armorBreakTalisman.desc", price: 50, shopSellable: true, usable: ["combat"], effects: [{ type: "addStatus", status: "armorBreak", stacks: 2, chance: 100, target: "allEnemies" }] },
  spiritHeartTalisman: { id: "spiritHeartTalisman", itemNo: 9, rarity: 2, type: "talisman", actionType: "support", nameKey: "item.spiritHeartTalisman.name", descKey: "item.spiritHeartTalisman.desc", price: 50, shopSellable: true, usable: ["map","combat"], effects: [{ type: "removeStatus", status: "heartDemon", stacks: 5, target: "self" }] },
  thunderTalisman: { id: "thunderTalisman", itemNo: 10, rarity: 3, type: "talisman", actionType: "attack", nameKey: "item.thunderTalisman.name", descKey: "item.thunderTalisman.desc", price: 70, shopSellable: true, usable: ["combat"], effects: [{ type: "damage", amount: 24, target: "allEnemies", ignoreGuard: true, statusOnHit: { status: "stun", stacks: 1, chance: 40, ignoreBarrierResistance: true } }] },
  fireTalisman: { id: "fireTalisman", itemNo: 11, rarity: 3, type: "talisman", actionType: "attack", nameKey: "item.fireTalisman.name", descKey: "item.fireTalisman.desc", price: 70, shopSellable: true, usable: ["combat"], effects: [{ type: "damage", amount: 8, target: "allEnemies", ignoreQi: true, statusOnHit: { status: "burn", stacksRange: [4, 6], chance: 100 } }] },
  swordTalisman: { id: "swordTalisman", itemNo: 12, rarity: 3, type: "talisman", actionType: "attack", nameKey: "item.swordTalisman.name", descKey: "item.swordTalisman.desc", price: 70, shopSellable: true, usable: ["combat"], effects: [{ type: "damage", amountRange: [24, 32], target: "allEnemies", targetCountRanges: { 1: [[28, 32]] } }] },
  heavenDemonTalisman: { id: "heavenDemonTalisman", itemNo: 19, rarity: 4, type: "talisman", actionType: "attack", nameKey: "item.heavenDemonTalisman.name", descKey: "item.heavenDemonTalisman.desc", price: 90, shopSellable: true, usable: ["combat"], effects: [{ type: "addStatus", status: "heartDemon", chance: 100, target: "allEnemies", stacksRange: [3, 4], nonHumanoidStacks: 2 }] },

  // Common spell manuals: grade 2 / green.
  goldLightManual: { id: "goldLightManual", itemNo: 13, rarity: 2, type: "manual", senseCost: 0, manualGroup: "common", actionType: "support", nameKey: "item.goldLightManual.name", descKey: "item.goldLightManual.desc", price: 100, shopSellable: true, usable: ["map"], learnCardId: "goldLight" },
  clearWindManual: { id: "clearWindManual", itemNo: 14, rarity: 2, type: "manual", senseCost: 0, manualGroup: "common", actionType: "support", nameKey: "item.clearWindManual.name", descKey: "item.clearWindManual.desc", price: 100, shopSellable: true, usable: ["map"], learnCardId: "clearWind" },
  frostSpellManual: { id: "frostSpellManual", itemNo: 15, rarity: 2, type: "manual", senseCost: 0, manualGroup: "common", actionType: "support", nameKey: "item.frostSpellManual.name", descKey: "item.frostSpellManual.desc", price: 100, shopSellable: true, usable: ["map"], learnCardId: "frostSpell" },
  fireballManual: { id: "fireballManual", itemNo: 16, rarity: 2, type: "manual", senseCost: 0, manualGroup: "common", actionType: "support", nameKey: "item.fireballManual.name", descKey: "item.fireballManual.desc", price: 100, shopSellable: true, usable: ["map"], learnCardId: "fireball" },
  earthEscapeManual: { id: "earthEscapeManual", itemNo: 17, rarity: 2, type: "manual", senseCost: 0, manualGroup: "common", actionType: "support", nameKey: "item.earthEscapeManual.name", descKey: "item.earthEscapeManual.desc", price: 100, shopSellable: true, usable: ["map"], learnCardId: "earthEscape" },
  qiEatingManual: { id: "qiEatingManual", itemNo: 18, rarity: 2, type: "manual", senseCost: 0, manualGroup: "common", actionType: "support", nameKey: "item.qiEatingManual.name", descKey: "item.qiEatingManual.desc", price: 100, shopSellable: true, usable: ["map"], learnCardId: "qiEating" },

  // Sect basic manuals: grade 3 / blue.
  swordControlManual: { id: "swordControlManual", itemNo: 20, rarity: 3, type: "manual", senseCost: 0, manualGroup: "sword", actionType: "support", nameKey: "item.swordControlManual.name", descKey: "item.swordControlManual.desc", sell: 90, usable: ["map"], learnCardId: "swordControl" },
  swordGuardManual: { id: "swordGuardManual", itemNo: 21, rarity: 3, type: "manual", senseCost: 0, manualGroup: "sword", actionType: "support", nameKey: "item.swordGuardManual.name", descKey: "item.swordGuardManual.desc", sell: 90, usable: ["map"], learnCardId: "swordGuard" },
  swordQiSlashManual: { id: "swordQiSlashManual", itemNo: 22, rarity: 3, type: "manual", senseCost: 0, manualGroup: "sword", actionType: "support", nameKey: "item.swordQiSlashManual.name", descKey: "item.swordQiSlashManual.desc", sell: 90, usable: ["map"], learnCardId: "swordQiSlash" },
  swordIntentManual: { id: "swordIntentManual", itemNo: 23, rarity: 3, type: "manual", senseCost: 0, manualGroup: "sword", actionType: "support", nameKey: "item.swordIntentManual.name", descKey: "item.swordIntentManual.desc", sell: 90, usable: ["map"], learnCardId: "swordIntent" },
  myriadSwordsManual: { id: "myriadSwordsManual", itemNo: 24, rarity: 3, type: "manual", senseCost: 0, manualGroup: "sword", actionType: "support", nameKey: "item.myriadSwordsManual.name", descKey: "item.myriadSwordsManual.desc", sell: 90, usable: ["map"], learnCardId: "myriadSwords" },
  palmThunderManual: { id: "palmThunderManual", itemNo: 26, rarity: 3, type: "manual", senseCost: 0, manualGroup: "law", actionType: "support", nameKey: "item.palmThunderManual.name", descKey: "item.palmThunderManual.desc", sell: 90, usable: ["map"], learnCardId: "palmThunder" },
  greenWoodManual: { id: "greenWoodManual", itemNo: 27, rarity: 3, type: "manual", senseCost: 0, manualGroup: "law", actionType: "support", nameKey: "item.greenWoodManual.name", descKey: "item.greenWoodManual.desc", sell: 90, usable: ["map"], learnCardId: "greenWood" },
  waterDragonManual: { id: "waterDragonManual", itemNo: 28, rarity: 3, type: "manual", senseCost: 0, manualGroup: "law", actionType: "support", nameKey: "item.waterDragonManual.name", descKey: "item.waterDragonManual.desc", sell: 90, usable: ["map"], learnCardId: "waterDragon" },
  karmaFireManual: { id: "karmaFireManual", itemNo: 29, rarity: 3, type: "manual", senseCost: 0, manualGroup: "law", actionType: "support", nameKey: "item.karmaFireManual.name", descKey: "item.karmaFireManual.desc", sell: 90, usable: ["map"], learnCardId: "karmaFire" },
  stoneScreenManual: { id: "stoneScreenManual", itemNo: 30, rarity: 3, type: "manual", senseCost: 0, manualGroup: "law", actionType: "support", nameKey: "item.stoneScreenManual.name", descKey: "item.stoneScreenManual.desc", sell: 90, usable: ["map"], learnCardId: "stoneScreen" },
  inchPunchManual: { id: "inchPunchManual", itemNo: 38, rarity: 3, type: "manual", senseCost: 0, manualGroup: "body", actionType: "support", nameKey: "item.inchPunchManual.name", descKey: "item.inchPunchManual.desc", sell: 90, usable: ["map"], learnCardId: "inchPunch" },
  shadowKickManual: { id: "shadowKickManual", itemNo: 39, rarity: 3, type: "manual", senseCost: 0, manualGroup: "body", actionType: "support", nameKey: "item.shadowKickManual.name", descKey: "item.shadowKickManual.desc", sell: 90, usable: ["map"], learnCardId: "shadowKick" },
  bodyTemperManual: { id: "bodyTemperManual", itemNo: 40, rarity: 3, type: "manual", senseCost: 0, manualGroup: "body", actionType: "support", nameKey: "item.bodyTemperManual.name", descKey: "item.bodyTemperManual.desc", sell: 90, usable: ["map"], learnCardId: "bodyTemper" },
  mountainForceManual: { id: "mountainForceManual", itemNo: 41, rarity: 3, type: "manual", senseCost: 0, manualGroup: "body", actionType: "support", nameKey: "item.mountainForceManual.name", descKey: "item.mountainForceManual.desc", sell: 90, usable: ["map"], learnCardId: "mountainForce" },

  // Special manuals: every grade-4 manual is a fragment. A fragment is consumed
  // only after a successful study; failure keeps the item in the bag.
  flameIgnitionManual: { id: "flameIgnitionManual", itemNo: 25, rarity: 4, type: "manual", senseCost: 0, manualGroup: "special", actionType: "support", nameKey: "item.flameIgnitionManual.name", descKey: "item.flameIgnitionManual.desc", sell: 150, usable: ["map"], learnCardId: "flameIgnitionArt" },
  diamondBodyManual: { id: "diamondBodyManual", itemNo: 35, rarity: 4, type: "manual", senseCost: 0, manualGroup: "special", actionType: "support", nameKey: "item.diamondBodyManual.name", descKey: "item.diamondBodyManual.desc", sell: 150, usable: ["map"], learnCardId: "diamondBody" },
  xuanpinQiManual: { id: "xuanpinQiManual", itemNo: 36, rarity: 4, type: "manual", senseCost: 0, manualGroup: "special", actionType: "support", nameKey: "item.xuanpinQiManual.name", descKey: "item.xuanpinQiManual.desc", sell: 150, usable: ["map"], learnCardId: "xuanpinQi" },
  valleyGodCurseManual: { id: "valleyGodCurseManual", itemNo: 37, rarity: 4, type: "manual", senseCost: 0, manualGroup: "special", actionType: "support", nameKey: "item.valleyGodCurseManual.name", descKey: "item.valleyGodCurseManual.desc", sell: 150, usable: ["map"], learnCardId: "valleyGodCurse" },

  // Grade-5 cultivation fragments grant permanent resource-cap growth instead of a card.
  // Like grade-4 fragments, failure keeps the fragment and success consumes one.
  spiritQuenchingManual: { id: "spiritQuenchingManual", itemNo: 42, rarity: 5, type: "manual", senseCost: 0, manualGroup: "special", actionType: "support", nameKey: "item.spiritQuenchingManual.name", descKey: "item.spiritQuenchingManual.desc", previewKey: "item.spiritQuenchingManual.preview", inventoryPreview: true, studySuccessKey: "item.spiritQuenchingManual.success", sell: 300, usable: ["map"], consumeOnStudySuccess: true, studyEffect: { type: "maxSense", amount: 1 } },
  mysticPassageManual: { id: "mysticPassageManual", itemNo: 43, rarity: 5, type: "manual", senseCost: 0, manualGroup: "special", actionType: "support", nameKey: "item.mysticPassageManual.name", descKey: "item.mysticPassageManual.desc", previewKey: "item.mysticPassageManual.preview", inventoryPreview: true, studySuccessKey: "item.mysticPassageManual.success", sell: 300, usable: ["map"], consumeOnStudySuccess: true, studyEffect: { type: "maxMana", amount: 1 } },

  // Demon pills are drop-only and never enter merchant stock.
  demonPill1: { id: "demonPill1", itemNo: 31, rarity: 1, type: "pill", actionType: "support", nameKey: "item.demonPill1.name", descKey: "item.demonPill1.desc", sell: 10, usable: ["map","combat"], effects: [{ type: "heal", amount: 5, target: "self" }] },
  demonPill2: { id: "demonPill2", itemNo: 32, rarity: 2, type: "pill", actionType: "support", nameKey: "item.demonPill2.name", descKey: "item.demonPill2.desc", sell: 30, usable: ["map","combat"], effects: [{ type: "heal", amount: 10, target: "self" }, { type: "gainMana", amount: 1, allowOverflow: true, target: "self" }] },
  demonPill3: { id: "demonPill3", itemNo: 33, rarity: 3, type: "pill", actionType: "support", nameKey: "item.demonPill3.name", descKey: "item.demonPill3.desc", sell: 70, usable: ["map","combat"], effects: [{ type: "heal", amount: 20, target: "self" }, { type: "gainMana", amount: 2, allowOverflow: true, target: "self" }] },
  demonPill4: { id: "demonPill4", itemNo: 34, rarity: 4, type: "pill", actionType: "support", nameKey: "item.demonPill4.name", descKey: "item.demonPill4.desc", sell: 150, usable: ["map","combat"], effects: [{ type: "heal", amount: 40, target: "self" }, { type: "gainMana", amount: 4, allowOverflow: true, target: "self" }] },

  // Materials.
  wolfFang: { id: "wolfFang", rarity: 1, type: "material", actionType: "support", nameKey: "item.wolfFang.name", descKey: "item.wolfFang.desc", sell: 25 },
  bigWolfFang: { id: "bigWolfFang", rarity: 1, type: "material", actionType: "support", nameKey: "item.bigWolfFang.name", descKey: "item.bigWolfFang.desc", sell: 35 },
  spiderSilk: { id: "spiderSilk", rarity: 1, type: "material", actionType: "support", nameKey: "item.spiderSilk.name", descKey: "item.spiderSilk.desc", sell: 15 },
  snakeSlough: { id: "snakeSlough", rarity: 1, type: "material", actionType: "support", nameKey: "item.snakeSlough.name", descKey: "item.snakeSlough.desc", sell: 45 },
  drugResidue: { id: "drugResidue", rarity: 2, type: "material", actionType: "support", nameKey: "item.drugResidue.name", descKey: "item.drugResidue.desc", sell: 55, usable: ["map","combat"], effects: [{ type: "heal", amount: 18, target: "self" }, { type: "addStatus", status: "heartDemon", stacks: 1, chance: 100, target: "self" }] },
  stoneHeart: { id: "stoneHeart", rarity: 3, type: "material", actionType: "defense", nameKey: "item.stoneHeart.name", descKey: "item.stoneHeart.desc", sell: 65, usable: ["combat"], effects: [
    { type: "clearQi", target: "allCombatants" },
    { type: "gainGuard", amount: 24, target: "allCombatants" },
  ] },
};

for (const item of Object.values(ITEMS)) {
  if (SKILL_SFX_BY_ITEM_ID[item.id]) item.skillSfxKey = SKILL_SFX_BY_ITEM_ID[item.id];
}
