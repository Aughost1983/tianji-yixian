import { SKILL_SFX_BY_CARD_ID } from "./skill-sfx.js";

export const CARDS = {
  swordControl: {
    id: "swordControl", order: 1, nameKey: "card.swordControl.name", descKey: "card.swordControl.desc", upgradeDescKey: "card.swordControl.upgradeDesc",
    school: "sword", type: "spell", cost: 1, target: "enemy", tags: ["sword", "attack"],
    // Sword God repeats the following self-Qi gain at each attack beat; the
    // one-shot discount still arms once after the complete card resolves.
    effects: [{ type: "damage", amount: 4, repeatSelfQiGain: true }, { type: "gainQi", amount: 2, target: "self" }, { type: "armNextSwordControlOrSpellDiscount", amount: 1 }],
  },
  swordGuard: {
    id: "swordGuard", order: 2, nameKey: "card.swordGuard.name", descKey: "card.swordGuard.desc", upgradeDescKey: "card.swordGuard.upgradeDesc",
    school: "sword", type: "spell", cost: 1, target: "self", tags: ["sword"],
    effects: [{ type: "gainQi", amount: 6 }],
  },
  swordQiSlash: {
    id: "swordQiSlash", order: 3, nameKey: "card.swordQiSlash.name", descKey: "card.swordQiSlash.desc", upgradeDescKey: "card.swordQiSlash.upgradeDesc",
    school: "sword", type: "spell", cost: 2, target: "enemy", tags: ["sword", "attack"],
    effects: [{ type: "damage", amount: 10, ignoreGuard: true, statusOnHit: { status: "armorBreak", stacks: 1, chance: 70 } }],
  },
  swordIntent: {
    id: "swordIntent", order: 4, nameKey: "card.swordIntent.name", descKey: "card.swordIntent.desc", upgradeDescKey: "card.swordIntent.upgradeDesc",
    school: "sword", type: "secret", cost: 0, target: "self",
    effects: [{ type: "addStatus", status: "swordIntent", stacks: 2, chance: 100 }],
  },
  myriadSwords: {
    id: "myriadSwords", order: 5, nameKey: "card.myriadSwords.name", descKey: "card.myriadSwords.desc", upgradeDescKey: "card.myriadSwords.upgradeDesc",
    school: "sword", type: "spell", cost: 3, target: "allEnemies", tags: ["sword", "attack"],
    effects: [{ type: "damage", amount: 2, repeatRange: [3, 4], target: "allEnemies" }],
  },
  myriadSwordsReturn: {
    id: "myriadSwordsReturn", order: 5.1, nameKey: "card.myriadSwordsReturn.name", descKey: "card.myriadSwordsReturn.desc",
    school: "sword", type: "spell", cost: 3, target: "allEnemies", tags: ["sword", "attack", "advanced"],
    effects: [{ type: "damage", amount: 2, repeatRange: [6, 8], target: "allEnemies" }],
  },
  myriadSwordsReturnPlus: {
    id: "myriadSwordsReturnPlus", order: 5.2, nameKey: "card.myriadSwordsReturnPlus.name", descKey: "card.myriadSwordsReturnPlus.desc",
    school: "sword", type: "spell", cost: 4, target: "allEnemies", tags: ["sword", "attack", "advanced"],
    effects: [{ type: "damage", amount: 3, repeatRange: [8, 10], target: "allEnemies" }],
  },
  myriadSwordsReturnPlusPlus: {
    id: "myriadSwordsReturnPlusPlus", order: 5.3, nameKey: "card.myriadSwordsReturnPlusPlus.name", descKey: "card.myriadSwordsReturnPlusPlus.desc",
    school: "sword", type: "spell", cost: 5, target: "allEnemies", tags: ["sword", "attack", "advanced"],
    effects: [{ type: "damage", amount: 4, repeatRange: [10, 12], target: "allEnemies" }],
  },
  swordDomain: {
    id: "swordDomain", order: 5.4, nameKey: "card.swordDomain.name", descKey: "card.swordDomain.desc", activeDescKey: "card.swordDomain.activeDesc",
    school: "sword", type: "secret", cost: 2, target: "self", tags: ["sword", "advanced"],
    effects: [{ type: "activateSwordDomain", damage: 2, qi: 4, swordIntent: 1 }],
  },
  swordDomainPlus: {
    id: "swordDomainPlus", order: 5.5, nameKey: "card.swordDomainPlus.name", descKey: "card.swordDomainPlus.desc", activeDescKey: "card.swordDomain.activeDesc",
    school: "sword", type: "secret", cost: 1, target: "self", tags: ["sword", "advanced"],
    effects: [{ type: "activateSwordDomain", damage: 3, qi: 8, swordIntent: 2 }],
  },
  swordDomainPlusPlus: {
    id: "swordDomainPlusPlus", order: 5.6, nameKey: "card.swordDomainPlusPlus.name", descKey: "card.swordDomainPlusPlus.desc", activeDescKey: "card.swordDomain.activeDesc",
    school: "sword", type: "secret", cost: 0, target: "self", tags: ["sword", "advanced"],
    effects: [{ type: "activateSwordDomain", damage: 4, qi: 12, swordIntent: 3 }],
  },
  heartSword: {
    id: "heartSword", order: 5.7, nameKey: "card.heartSword.name", descKey: "card.heartSword.desc",
    school: "sword", type: "secret", cost: 1, target: "enemy", tags: ["sword", "attack", "advanced"],
    effects: [{ type: "damage", amount: 15, ignoreQi: true, ignoreGuard: true, statusOnHit: { status: "heartDemon", stacks: 1, chance: { sourceStat: "sense", mult: 5, add: 30, min: 0, max: 100 } } }],
  },
  heartSwordPlus: {
    id: "heartSwordPlus", order: 5.8, nameKey: "card.heartSwordPlus.name", descKey: "card.heartSwordPlus.desc",
    school: "sword", type: "secret", cost: 1, target: "enemy", tags: ["sword", "attack", "advanced"],
    effects: [{ type: "damage", amount: 20, ignoreQi: true, ignoreGuard: true, statusOnHit: { status: "heartDemon", stacksRange: [1, 2], nonHumanoidStacks: 1, chance: { sourceStat: "sense", mult: 5, add: 40, min: 0, max: 100 } } }],
  },
  heartSwordPlusPlus: {
    id: "heartSwordPlusPlus", order: 5.9, nameKey: "card.heartSwordPlusPlus.name", descKey: "card.heartSwordPlusPlus.desc",
    school: "sword", type: "secret", cost: 1, target: "enemy", tags: ["sword", "attack", "advanced"],
    effects: [{ type: "damage", amount: 30, ignoreQi: true, ignoreGuard: true, statusOnHit: { status: "heartDemon", stacksRange: [2, 3], nonHumanoidStacks: 2, chance: { sourceStat: "sense", mult: 5, add: 50, min: 0, max: 100 } } }],
  },
  swordGod: {
    id: "swordGod", order: 5.94, nameKey: "card.swordGod.name", descKey: "card.swordGod.desc",
    school: "sword", type: "secret", cost: 0, target: "self", tags: ["sword", "advanced", "support"],
    effects: [{ type: "activateSwordGod" }],
  },
  kuiThunder: {
    id: "kuiThunder", order: 5.95, nameKey: "card.kuiThunder.name", descKey: "card.kuiThunder.desc",
    school: "sword", type: "spell", cost: 3, target: "enemy", tags: ["attack", "advanced", "thunder"],
    effects: [{ type: "kuiThunder", baseDamage: 5, qiMultiplier: 1, swordIntentMultiplier: 3, statusOnHit: { status: "stun", stacks: 1, chance: 100 } }],
  },
  swordHeartClarity: {
    id: "swordHeartClarity", order: 6, nameKey: "card.swordHeartClarity.name", descKey: "card.swordHeartClarity.desc",
    school: "sword", type: "secret", cost: 0, target: "self", tags: ["sword"],
    effects: [{ type: "reduceSwordSpellCost", amount: 1 }],
  },
  goldLight: {
    id: "goldLight", order: 7, nameKey: "card.goldLight.name", descKey: "card.goldLight.desc", upgradeDescKey: "card.goldLight.upgradeDesc",
    school: "common", type: "spell", cost: 1, target: "self", tags: ["thunder"],
    effects: [{ type: "gainQi", amount: { sourceStat: "sense", mult: 1.5, round: "ceil" } }],
  },
  clearWind: {
    id: "clearWind", order: 8, nameKey: "card.clearWind.name", descKey: "card.clearWind.desc", upgradeDescKey: "card.clearWind.upgradeDesc",
    school: "common", type: "spell", cost: 1, target: "self",
    effects: [{ type: "addNextTurnDraw", amount: 2 }, { type: "increaseFleeChance", amount: 0 }],
  },
  frostSpell: {
    id: "frostSpell", order: 9, nameKey: "card.frostSpell.name", descKey: "card.frostSpell.desc", upgradeDescKey: "card.frostSpell.upgradeDesc",
    school: "common", type: "spell", cost: 1, target: "allEnemies", tags: ["support"],
    effects: [{ type: "frostSpell", target: "allEnemies", freezeChance: 40, guardOnSuccess: 15 }],
  },
  earthEscape: {
    id: "earthEscape", order: 10, nameKey: "card.earthEscape.name", descKey: "card.earthEscape.desc", upgradeDescKey: "card.earthEscape.upgradeDesc",
    school: "common", type: "spell", cost: 1, target: "self", tags: ["support"],
    effects: [{ type: "earthEscape" }],
  },
  qiEating: {
    id: "qiEating", order: 11, nameKey: "card.qiEating.name", descKey: "card.qiEating.desc", upgradeDescKey: "card.qiEating.upgradeDesc",
    school: "common", type: "spell", cost: 0, target: "self", tags: ["support"],
    effects: [{ type: "gainMana", amount: 1, allowOverflow: true }],
  },
  diamondBody: {
    id: "diamondBody", order: 12, nameKey: "card.diamondBody.name", descKey: "card.diamondBody.desc",
    school: "common", type: "secret", cost: 2, target: "self", tags: ["support"],
    effects: [{ type: "gainQi", amount: 12, target: "self" }, { type: "scheduleNextTurnQi", amount: 12, target: "self" }],
  },
  xuanpinQi: {
    id: "xuanpinQi", order: 13, nameKey: "card.xuanpinQi.name", descKey: "card.xuanpinQi.desc", upgradeDescKey: "card.xuanpinQi.upgradeDesc",
    school: "common", type: "secret", cost: 0, target: "self", tags: ["support"],
    effects: [{ type: "xuanpinQi", statusChance: 40, reflectionPerRound: 2, qiPerRound: 2, defenseMode: "both", target: "self" }],
  },
  valleyGodCurse: {
    id: "valleyGodCurse", order: 14, nameKey: "card.valleyGodCurse.name", descKey: "card.valleyGodCurse.desc", upgradeDescKey: "card.valleyGodCurse.upgradeDesc",
    school: "common", type: "spell", cost: 1, target: "self", tags: ["support"],
    effects: [{ type: "valleyGodCurse", healMultiplier: 1, undyingStacks: 1, target: "self" }],
  },
  palmThunder: {
    id: "palmThunder", order: 20, nameKey: "card.palmThunder.name", descKey: "card.palmThunder.desc", upgradeDescKey: "card.palmThunder.upgradeDesc",
    school: "law", type: "spell", cost: 1, target: "enemy", tags: ["attack", "thunder"],
    effects: [{ type: "damage", amount: { sourceStat: "sense", mult: 1, add: 1 } }],
  },
  fiveThunder: {
    id: "fiveThunder", order: 20.1, nameKey: "card.fiveThunder.name", descKey: "card.fiveThunder.desc",
    school: "law", type: "spell", cost: 5, target: "allEnemies", tags: ["attack", "advanced", "thunder"],
    effects: [{ type: "damage", amount: { sourceStat: "sense", mult: 0.5, add: 1, round: "ceil" }, repeat: 5, target: "allEnemies", ignoreGuard: true, statusOnHit: { status: "stun", stacks: 1, chance: 25, ignoreBarrierResistance: true } }],
  },
  fiveThunderPlus: {
    id: "fiveThunderPlus", order: 20.2, nameKey: "card.fiveThunderPlus.name", descKey: "card.fiveThunderPlus.desc",
    school: "law", type: "spell", cost: 5, target: "allEnemies", tags: ["attack", "advanced", "thunder"],
    effects: [{ type: "damage", amount: { sourceStat: "sense", mult: 0.75, add: 2, round: "ceil" }, repeat: 5, target: "allEnemies", ignoreGuard: true, statusOnHit: { status: "stun", stacks: 1, chance: 35, ignoreBarrierResistance: true } }],
  },
  fiveThunderPlusPlus: {
    id: "fiveThunderPlusPlus", order: 20.3, nameKey: "card.fiveThunderPlusPlus.name", descKey: "card.fiveThunderPlusPlus.desc",
    school: "law", type: "spell", cost: 5, target: "allEnemies", tags: ["attack", "advanced", "thunder"],
    effects: [{ type: "damage", amount: { sourceStat: "sense", mult: 1.5, add: 3, round: "ceil" }, repeat: 5, target: "allEnemies", ignoreGuard: true, statusOnHit: { status: "stun", stacks: 1, chance: 45, ignoreBarrierResistance: true } }],
  },
  greenWood: {
    id: "greenWood", order: 21, nameKey: "card.greenWood.name", descKey: "card.greenWood.desc", upgradeDescKey: "card.greenWood.upgradeDesc",
    school: "law", type: "spell", cost: 2, target: "allEnemies", tags: ["attack"],
    effects: [{ type: "damage", amount: 1, repeat: 4, target: "allEnemies", ignoreGuard: true, healFromActualDamage: true, statusOnHit: { status: "entangle", stacks: 1, chance: 25 } }],
  },
  evergreenTribulation: {
    id: "evergreenTribulation", order: 21.1, nameKey: "card.evergreenTribulation.name", descKey: "card.evergreenTribulation.desc",
    school: "law", type: "spell", cost: 3, target: "self", tags: ["support", "advanced"],
    effects: [
      { type: "addStatus", status: "barrier", stacks: 2, chance: 100, target: "self" },
      { type: "addStatus", status: "healing", stacks: 2, chance: 100, target: "self" },
    ],
  },
  evergreenTribulationPlus: {
    id: "evergreenTribulationPlus", order: 21.2, nameKey: "card.evergreenTribulationPlus.name", descKey: "card.evergreenTribulationPlus.desc",
    school: "law", type: "spell", cost: 3, target: "self", tags: ["support", "advanced"],
    effects: [
      { type: "addStatus", status: "barrier", stacks: 3, chance: 100, target: "self" },
      { type: "addStatus", status: "healing", stacks: 3, chance: 100, target: "self" },
    ],
  },
  evergreenTribulationPlusPlus: {
    id: "evergreenTribulationPlusPlus", order: 21.3, nameKey: "card.evergreenTribulationPlusPlus.name", descKey: "card.evergreenTribulationPlusPlus.desc",
    school: "law", type: "spell", cost: 2, target: "self", tags: ["support", "advanced"],
    effects: [
      { type: "addStatus", status: "barrier", stacks: 4, chance: 100, target: "self" },
      { type: "addStatus", status: "healing", stacks: 4, chance: 100, target: "self" },
    ],
  },
  waterDragon: {
    id: "waterDragon", order: 22, nameKey: "card.waterDragon.name", descKey: "card.waterDragon.desc", upgradeDescKey: "card.waterDragon.upgradeDesc",
    school: "law", type: "spell", cost: 2, target: "enemy", tags: ["attack"],
    effects: [{
      type: "damage", amount: 12,
      intensifyEntangleOnActualDamage: true,
      statusOnHit: { status: "qiStagnation", stacks: 1, chance: 100, requireActualDamage: true },
    }],
  },
  fourSeasReturn: {
    id: "fourSeasReturn", order: 22.1, nameKey: "card.fourSeasReturn.name", descKey: "card.fourSeasReturn.desc",
    school: "law", type: "spell", cost: 3, target: "allEnemies", tags: ["attack", "advanced"],
    effects: [
      { type: "damage", amount: 15, target: "allEnemies", drainManaOnActualDamage: 1 },
      { type: "removeStatus", status: "burn", stacks: Infinity, target: "allCombatants" },
    ],
  },
  fourSeasReturnPlus: {
    id: "fourSeasReturnPlus", order: 22.2, nameKey: "card.fourSeasReturnPlus.name", descKey: "card.fourSeasReturnPlus.desc",
    school: "law", type: "spell", cost: 3, target: "allEnemies", tags: ["attack", "advanced"],
    effects: [
      { type: "damage", amount: 20, target: "allEnemies", drainManaOnActualDamage: 2 },
      { type: "removeStatus", status: "burn", stacks: Infinity, target: "allCombatants" },
    ],
  },
  fourSeasReturnPlusPlus: {
    id: "fourSeasReturnPlusPlus", order: 22.3, nameKey: "card.fourSeasReturnPlusPlus.name", descKey: "card.fourSeasReturnPlusPlus.desc",
    school: "law", type: "spell", cost: 3, target: "allEnemies", tags: ["attack", "advanced"],
    effects: [
      { type: "damage", amount: 25, target: "allEnemies", drainManaOnActualDamage: "all" },
      { type: "removeStatus", status: "burn", stacks: Infinity, target: "allCombatants" },
    ],
  },
  karmaFire: {
    id: "karmaFire", order: 23, nameKey: "card.karmaFire.name", descKey: "card.karmaFire.desc", upgradeDescKey: "card.karmaFire.upgradeDesc",
    school: "law", type: "spell", cost: 2, target: "enemy", tags: ["attack", "fire"],
    effects: [{ type: "damage", amount: 2, repeat: 3, ignoreQi: true, statusOnHit: { status: "burn", stacks: 2, chance: 40 } }],
  },
  samadhiTrueFire: {
    id: "samadhiTrueFire", order: 23.1, nameKey: "card.samadhiTrueFire.name", descKey: "card.samadhiTrueFire.desc",
    school: "law", type: "spell", cost: 4, target: "allEnemies", tags: ["attack", "fire", "advanced"],
    effects: [{ type: "damage", amount: 4, repeat: 3, target: "allEnemies", ignoreQi: true, statusOnHit: { status: "burn", stacks: 3, chance: 60 } }],
  },
  samadhiTrueFirePlus: {
    id: "samadhiTrueFirePlus", order: 23.2, nameKey: "card.samadhiTrueFirePlus.name", descKey: "card.samadhiTrueFirePlus.desc",
    school: "law", type: "spell", cost: 4, target: "allEnemies", tags: ["attack", "fire", "advanced"],
    effects: [{ type: "damage", amount: 5, repeat: 3, target: "allEnemies", ignoreQi: true, statusOnHit: { status: "burn", stacks: 4, chance: 70 } }],
  },
  samadhiTrueFirePlusPlus: {
    id: "samadhiTrueFirePlusPlus", order: 23.3, nameKey: "card.samadhiTrueFirePlusPlus.name", descKey: "card.samadhiTrueFirePlusPlus.desc",
    school: "law", type: "spell", cost: 4, target: "allEnemies", tags: ["attack", "fire", "advanced"],
    effects: [{ type: "damage", amount: 6, repeat: 3, target: "allEnemies", ignoreQi: true, statusOnHit: { status: "burn", stacks: 5, chance: 90 } }],
  },
  stoneScreen: {
    id: "stoneScreen", order: 24, nameKey: "card.stoneScreen.name", descKey: "card.stoneScreen.desc", upgradeDescKey: "card.stoneScreen.upgradeDesc",
    school: "law", type: "spell", cost: 1, target: "self",
    effects: [{ type: "gainGuard", amount: 18 }, { type: "endTurn" }],
  },
  mountTai: {
    id: "mountTai", order: 24.1, nameKey: "card.mountTai.name", descKey: "card.mountTai.desc",
    school: "law", type: "spell", cost: 4, target: "allEnemies", tags: ["attack", "advanced"],
    effects: [
      { type: "damage", amount: 30, target: "allEnemies", statusOnHit: { status: "armorBreak", stacks: 1, chance: 100 } },
      { type: "gainGuard", amount: 30, target: "self" },
      { type: "addStatus", status: "concentration", stacks: 1, chance: 100, target: "self" },
    ],
  },
  mountTaiPlus: {
    id: "mountTaiPlus", order: 24.2, nameKey: "card.mountTaiPlus.name", descKey: "card.mountTaiPlus.desc",
    school: "law", type: "spell", cost: 4, target: "allEnemies", tags: ["attack", "advanced"],
    effects: [
      { type: "damage", amount: 40, target: "allEnemies", statusOnHit: { status: "armorBreak", stacks: 2, chance: 100 } },
      { type: "gainGuard", amount: 40, target: "self" },
      { type: "addStatus", status: "concentration", stacks: 2, chance: 100, target: "self" },
    ],
  },
  mountTaiPlusPlus: {
    id: "mountTaiPlusPlus", order: 24.3, nameKey: "card.mountTaiPlusPlus.name", descKey: "card.mountTaiPlusPlus.desc",
    school: "law", type: "spell", cost: 4, target: "allEnemies", tags: ["attack", "advanced"],
    effects: [
      { type: "damage", amount: 50, target: "allEnemies", statusOnHit: { status: "armorBreak", stacks: 3, chance: 100 } },
      { type: "gainGuard", amount: 50, target: "self" },
      { type: "addStatus", status: "concentration", stacks: 3, chance: 100, target: "self" },
    ],
  },

  yinWaterThunder: {
    id: "yinWaterThunder", order: 24.4, nameKey: "card.yinWaterThunder.name", descKey: "card.yinWaterThunder.desc",
    school: "law", type: "spell", cost: 3, target: "enemy", tags: ["attack", "advanced", "thunder"],
    effects: [{
      type: "damage", amount: { sourceStat: "sense", mult: 2, add: 12 }, ignoreGuard: true,
      damageMultiplierIfTargetStatus: { status: "qiStagnation", multiplier: 2 },
      statusOnHit: { status: "qiStagnation", stacks: 1, chance: 50 },
    }],
  },
  sweetRain: {
    id: "sweetRain", order: 24.5, nameKey: "card.sweetRain.name", descKey: "card.sweetRain.desc",
    school: "law", type: "spell", cost: 1, target: "self", tags: ["support", "advanced"],
    effects: [
      { type: "halveStatus", status: "burn", target: "self" },
      { type: "addStatus", status: "healing", stacks: 2, chance: 100, target: "self" },
      { type: "addNextTurnDraw", amount: 1 },
    ],
  },
  wildfire: {
    id: "wildfire", order: 24.6, nameKey: "card.wildfire.name", descKey: "card.wildfire.desc",
    school: "law", type: "spell", cost: 3, target: "allEnemies", tags: ["attack", "advanced", "fire"],
    effects: [{
      type: "damage", amount: 12, target: "allEnemies", ignoreQi: true,
      ignoreGuardIfTargetStatus: { status: "entangle" },
      damageMultiplierIfTargetStatus: { status: "entangle", multiplier: 2 },
    }],
  },
  nirvanaSpell: {
    id: "nirvanaSpell", order: 24.7, nameKey: "card.nirvanaSpell.name", descKey: "card.nirvanaSpell.desc",
    school: "law", type: "spell", cost: 1, target: "self", tags: ["support", "advanced", "fire"],
    effects: [
      { type: "addStatus", status: "burn", stacks: 4, chance: 100, target: "self", ignoreResistance: true },
      { type: "addStatus", status: "nirvana", stacks: 1, chance: 100, target: "self", ignoreResistance: true },
    ],
  },
  metalStoneBurst: {
    id: "metalStoneBurst", order: 24.8, nameKey: "card.metalStoneBurst.name", descKey: "card.metalStoneBurst.desc",
    school: "law", type: "spell", cost: 2, target: "enemy", tags: ["attack", "advanced"],
    effects: [{ type: "shatterDefensesDamage" }],
  },
  qianKunOneQi: {
    id: "qianKunOneQi", order: 24.9, nameKey: "card.qianKunOneQi.name", descKey: "card.qianKunOneQi.desc",
    school: "law", type: "spell", cost: 0, target: "self", tags: ["support", "advanced"],
    effects: [{ type: "armNextSpellCostCap", cap: 1 }],
  },
  fireball: {
    id: "fireball", order: 25, nameKey: "card.fireball.name", descKey: "card.fireball.desc", upgradeDescKey: "card.fireball.upgradeDesc",
    school: "common", type: "spell", cost: 1, target: "enemy", tags: ["attack", "fire"],
    effects: [{ type: "damage", amount: 6, ignoreQi: true, statusOnHit: { status: "burn", stacks: 1, chance: 60 } }],
  },
  flameIgnitionArt: {
    id: "flameIgnitionArt", order: 26, nameKey: "card.flameIgnitionArt.name", descKey: "card.flameIgnitionArt.desc",
    school: "common", type: "secret", cost: 1, target: "enemy", tags: ["support", "fire"],
    effects: [{ type: "igniteBurn" }],
  },
  inchPunch: {
    id: "inchPunch", order: 30, nameKey: "card.inchPunch.name", descKey: "card.inchPunch.desc", upgradeDescKey: "card.inchPunch.upgradeDesc",
    school: "body", type: "martial", cost: 0, target: "enemy", tags: ["attack", "martial"],
    effects: [{ type: "damage", amount: 5, ignoreGuard: true, reduceGuardFromActualDamage: 1, statusOnHit: { status: "qiStagnation", stacks: 1, chance: 40 } }],
  },
  shadowKick: {
    id: "shadowKick", order: 31, nameKey: "card.shadowKick.name", descKey: "card.shadowKick.desc", upgradeDescKey: "card.shadowKick.upgradeDesc",
    school: "body", type: "martial", cost: 0, target: "enemy", tags: ["attack", "martial"],
    effects: [{ type: "damage", amount: 2, repeatRange: [2, 4], ignoreQi: true, retargetOnKill: "lowestHp" }],
  },
  bodyTemper: {
    id: "bodyTemper", order: 32, nameKey: "card.bodyTemper.name", descKey: "card.bodyTemper.desc", upgradeDescKey: "card.bodyTemper.upgradeDesc",
    school: "body", type: "secret", cost: 0, target: "self", tags: ["defense", "secret"],
    effects: [{ type: "gainQi", amount: 3 }, { type: "setEndTurnGuard", amount: 5 }],
  },
  mountainForce: {
    id: "mountainForce", order: 33, nameKey: "card.mountainForce.name", descKey: "card.mountainForce.desc", upgradeDescKey: "card.mountainForce.upgradeDesc",
    school: "body", type: "martial", cost: 0, target: "self", tags: ["defense", "martial"],
    effects: [{ type: "gainGuard", amount: 4, target: "self" }, { type: "armMountainCounter", multiplier: 1 }, { type: "endTurn" }],
  },
  gatherQi: {
    id: "gatherQi", order: 34, nameKey: "card.gatherQi.name", descKey: "card.gatherQi.desc",
    // Unplayed copies enter the ordinary discard/shuffle cycle with every card.
    school: "body", type: "secret", cost: 0, target: "self", tags: ["support", "secret"],
    effects: [{ type: "bodyGatherQi" }],
  },
  frenzyPalm: {
    id: "frenzyPalm", order: 35.1, nameKey: "card.frenzyPalm.name", descKey: "card.frenzyPalm.desc",
    school: "body", type: "martial", cost: 0, target: "enemy", tags: ["attack", "martial", "advanced"],
    effects: [
      { type: "damage", amount: { sourceStatus: "heartDemon", mult: 2, add: 5 }, ignoreGuard: true },
      { type: "addStatus", status: "heartDemon", stacks: 1, chance: 100, target: "self" },
    ],
  },
  frenzyPalmPlus: {
    id: "frenzyPalmPlus", order: 35.2, nameKey: "card.frenzyPalmPlus.name", descKey: "card.frenzyPalmPlus.desc",
    school: "body", type: "martial", cost: 0, target: "enemy", tags: ["attack", "martial", "advanced"],
    effects: [
      { type: "damage", amount: { sourceStatus: "heartDemon", mult: 3, add: 7 }, ignoreGuard: true },
      { type: "addStatus", status: "heartDemon", stacks: 1, chance: 100, target: "self" },
    ],
  },
  frenzyPalmPlusPlus: {
    id: "frenzyPalmPlusPlus", order: 35.3, nameKey: "card.frenzyPalmPlusPlus.name", descKey: "card.frenzyPalmPlusPlus.desc",
    school: "body", type: "martial", cost: 0, target: "enemy", tags: ["attack", "martial", "advanced"],
    effects: [
      { type: "damage", amount: { sourceStatus: "heartDemon", mult: 4, add: 9 }, ignoreGuard: true },
      { type: "addStatus", status: "heartDemon", stacks: 1, chance: 100, target: "self" },
    ],
  },
  ghostFlash: {
    id: "ghostFlash", order: 36.1, nameKey: "card.ghostFlash.name", descKey: "card.ghostFlash.desc",
    school: "body", type: "martial", cost: 0, target: "self", tags: ["defense", "martial", "advanced"],
    effects: [{ type: "armGhostFlash", shadowKickPlusUses: 0 }, { type: "endTurn" }],
  },
  ghostFlashPlus: {
    id: "ghostFlashPlus", order: 36.2, nameKey: "card.ghostFlashPlus.name", descKey: "card.ghostFlashPlus.desc",
    school: "body", type: "martial", cost: 0, target: "self", tags: ["defense", "martial", "advanced"],
    effects: [{ type: "armGhostFlash", shadowKickPlusUses: 1 }, { type: "endTurn" }],
  },
  ghostFlashPlusPlus: {
    id: "ghostFlashPlusPlus", order: 36.3, nameKey: "card.ghostFlashPlusPlus.name", descKey: "card.ghostFlashPlusPlus.desc",
    school: "body", type: "martial", cost: 0, target: "self", tags: ["defense", "martial", "advanced"],
    effects: [{ type: "armGhostFlash", shadowKickPlusUses: 2 }, { type: "endTurn" }],
  },
  undyingBody: {
    id: "undyingBody", order: 37.1, nameKey: "card.undyingBody.name", descKey: "card.undyingBody.desc",
    school: "body", type: "secret", cost: 2, target: "self", tags: ["support", "secret", "advanced"],
    effects: [{ type: "addStatus", status: "undying", stacks: 1, chance: 100, target: "self" }, { type: "addStatus", status: "healing", stacks: 1, chance: 100, target: "self" }],
  },
  undyingBodyPlus: {
    id: "undyingBodyPlus", order: 37.2, nameKey: "card.undyingBodyPlus.name", descKey: "card.undyingBodyPlus.desc",
    school: "body", type: "secret", cost: 2, target: "self", tags: ["support", "secret", "advanced"],
    effects: [{ type: "addStatus", status: "undying", stacks: 2, chance: 100, target: "self" }, { type: "addStatus", status: "healing", stacks: 2, chance: 100, target: "self" }],
  },
  undyingBodyPlusPlus: {
    id: "undyingBodyPlusPlus", order: 37.3, nameKey: "card.undyingBodyPlusPlus.name", descKey: "card.undyingBodyPlusPlus.desc",
    school: "body", type: "secret", cost: 1, target: "self", tags: ["support", "secret", "advanced"],
    effects: [{ type: "addStatus", status: "undying", stacks: 3, chance: 100, target: "self" }, { type: "addStatus", status: "healing", stacks: 3, chance: 100, target: "self" }],
  },
  huntianGong: {
    id: "huntianGong", order: 38.1, nameKey: "card.huntianGong.name", descKey: "card.huntianGong.desc",
    school: "body", type: "martial", cost: 0, target: "self", tags: ["support", "martial", "advanced"],
    effects: [{ type: "armHuntian", armorBreakStacks: 2 }],
  },
  huntianGongPlus: {
    id: "huntianGongPlus", order: 38.2, nameKey: "card.huntianGongPlus.name", descKey: "card.huntianGongPlus.desc",
    school: "body", type: "martial", cost: 0, target: "self", tags: ["support", "martial", "advanced"],
    effects: [{ type: "armHuntian", armorBreakStacks: 3 }, { type: "addStatus", status: "healing", stacks: 1, chance: 100, target: "self" }],
  },
  huntianGongPlusPlus: {
    id: "huntianGongPlusPlus", order: 38.3, nameKey: "card.huntianGongPlusPlus.name", descKey: "card.huntianGongPlusPlus.desc",
    school: "body", type: "martial", cost: 0, target: "self", tags: ["support", "martial", "advanced"],
    effects: [{ type: "armHuntian", armorBreakStacks: 4 }, { type: "addStatus", status: "healing", stacks: 2, chance: 100, target: "self" }],
  },
  ironBone: {
    id: "ironBone", order: 39, nameKey: "card.ironBone.name", descKey: "card.ironBone.desc",
    school: "body", type: "secret", cost: 1, target: "self", tags: ["defense", "secret", "advanced"],
    effects: [{ type: "activateIronBone" }],
  },
  humanSwordUnity: {
    id: "humanSwordUnity", order: 39.2, nameKey: "card.humanSwordUnity.name", descKey: "card.humanSwordUnity.desc",
    school: "sword", type: "secret", cost: 1, target: "self", tags: ["support", "secret", "advanced"],
    effects: [{ type: "qiToSwordIntent" }],
  },
  fiveElementsSword: {
    id: "fiveElementsSword", order: 39.4, nameKey: "card.fiveElementsSword.name", descKey: "card.fiveElementsSword.desc",
    school: "law", type: "spell", cost: 3, target: "enemy", tags: ["sword", "attack", "advanced"],
    effects: [{ type: "fiveElementsSword" }],
  },
  fiveThunderHeartPalm: {
    id: "fiveThunderHeartPalm", order: 39.5, nameKey: "card.fiveThunderHeartPalm.name", descKey: "card.fiveThunderHeartPalm.desc",
    school: "body", type: "martial", cost: 0, target: "enemy", tags: ["attack", "martial", "advanced"],
    effects: [{ type: "damage", amount: 1, repeat: 5, afterAllHitsStatus: { status: "darkForce", stacks: 5, chance: 100, requireEveryHitActualDamage: true } }],
  },
  coldThunderSword: {
    id: "coldThunderSword", order: 40.1, nameKey: "card.coldThunderSword.name", descKey: "card.coldThunderSword.desc",
    school: "sword", type: "spell", cost: 4, target: "allEnemies", tags: ["attack", "sword", "thunder", "advanced"],
    effects: [{ type: "damage", amount: 8, target: "allEnemies", repeat: 3, ignoreQi: true, ignoreGuard: true,
      statusOnHit: { status: "freeze", stacks: 1, chance: 60, guardOnSuccess: 15 } }],
  },
  thunderSeal: {
    id: "thunderSeal", order: 40.2, nameKey: "card.thunderSeal.name", descKey: "card.thunderSeal.desc",
    school: "law", type: "spell", cost: 2, target: "self", tags: ["support", "thunder", "advanced"],
    effects: [
      ...["burn", "qiStagnation", "armorBreak", "entangle"].map((status) => ({ type: "removeStatus", status, stacks: Infinity, target: "self" })),
      { type: "addStatus", status: "barrier", stacks: 2, chance: 100, target: "self" },
    ],
  },
  samadhiWind: {
    id: "samadhiWind", order: 40.3, nameKey: "card.samadhiWind.name", descKey: "card.samadhiWind.desc",
    school: "law", type: "spell", cost: 5, target: "allEnemies", tags: ["attack", "advanced"],
    effects: [{ type: "discardRemainingHand", damageBase: 24, damagePerCard: 12, target: "allEnemies", banishForCombat: true }],
  },
  redDragonBreath: {
    id: "redDragonBreath", order: 40.4, nameKey: "card.redDragonBreath.name", descKey: "card.redDragonBreath.desc",
    school: "law", type: "spell", cost: 3, target: "enemy", tags: ["attack", "fire", "advanced"],
    effects: [{ type: "damage", amount: 12, ignoreQi: true, repeatRange: [2, 3],
      statusOnHit: { status: "burn", stacks: 1, chance: 100 } }],
  },
  rockFinger: {
    id: "rockFinger", order: 40.5, nameKey: "card.rockFinger.name", descKey: "card.rockFinger.desc",
    school: "body", type: "martial", cost: 0, target: "enemy", tags: ["attack", "martial", "advanced"],
    effects: [{ type: "damage", amount: 6, ignoreGuard: true,
      statusOnHit: { status: "armorBreak", stacks: 1, chance: 90 } }],
  },
  devouringHeaven: {
    id: "devouringHeaven", order: 40.6, nameKey: "card.devouringHeaven.name", descKey: "card.devouringHeaven.desc",
    school: "law", type: "spell", cost: 1, target: "allEnemies", tags: ["support", "advanced"],
    effects: [{ type: "stealManaFromAllEnemies", min: 1, max: 2 }],
  },
  heartDemonCard: {
    id: "heartDemonCard", order: 999, nameKey: "card.heartDemon.name", descKey: "card.heartDemon.desc",
    school: "none", type: "none", cost: 0, target: "self", permanentDestroyOnUse: true,
    effects: [{ type: "loseMaxHpPercent", percent: 8, target: "self" }],
  },
};

for (const card of Object.values(CARDS)) card.skillSfxKey = SKILL_SFX_BY_CARD_ID[card.id];

export const CARD_UPGRADES = {
  goldLight: { qiMultiplierOverride: 2 },
  clearWind: { fleeChanceBonus: 15 },
  frostSpell: { freezeChanceOverride: 80, costDelta: 1 },
  fireball: { damageBonus: 3, burnChanceBonus: 40 },
  earthEscape: { guardOnFailure: 12 },
  qiEating: { manaBonus: 1 },
  swordControl: { damageBonus: 2, qiBonus: 2 },
  swordGuard: { qiBonus: 4, addSwordIntent: 1 },
  swordQiSlash: { damageBonus: 2, statusChance: 80, statusStacksBonus: 1, statusOnHitManaBonus: 1 },
  swordIntent: { statusBonus: 1, drawBonus: 1 },
  myriadSwords: { repeatRangeBonus: 1, costDelta: -1 },
  palmThunder: { damageMultiplier: 1.5, stunChance: 35 },
  greenWood: { damageBonus: 0, repeatBonus: 2, costDelta: 0, statusChance: 35 },
  waterDragon: { damageBonus: 3, statusStacksBonus: 1 },
  karmaFire: { damageBonus: 1, burnChanceBonus: 20 },
  stoneScreen: { costDelta: 0, guardBonus: 6 },
  inchPunch: { damageBonus: 2, guardReductionMultiplier: 2, statusChance: 60 },
  shadowKick: { repeatRangeOverride: [3, 5], drawIfRepeatBelowMax: 1 },
  bodyTemper: { qiBonus: 2, endTurnGuardBonus: 5 },
  mountainForce: { guardBonus: 4, counterMultiplier: 2, counterGuardRetention: 0.5 },
  xuanpinQi: { statusChanceOverride: 80, reflectionPerRoundOverride: 4, qiPerRoundOverride: 4, defenseModeOverride: "both" },
  valleyGodCurse: { costDelta: 1, healMultiplierOverride: 2, undyingStacksOverride: 2 },
};
