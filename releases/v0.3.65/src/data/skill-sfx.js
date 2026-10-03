// Sound semantics belong to a skill family, independent of upgrades, locale and owner.
// The same WAV can be assigned to additional families without changing the combat clock.
// Temporarily disabled in v0.3.47. Set enabled to true to restore every skill cue.
export const SKILL_SFX_SETTINGS = { enabled: false };

export const SKILL_SFX_FILES = Object.freeze({
  flyingSword: "flying-sword", greenSnakeSword: "green-snake-sword",
  swordQiSlash: "sword-qi-slash", swordWard: "sword-ward",
  swordIntent: "sword-intent", myriadSwords: "myriad-swords",
  swordDomain: "sword-domain", heartSword: "heart-sword",
  fiveElementsSword: "five-elements-sword", goldThunderSeal: "gold-thunder-seal",
  palmThunder: "palm-thunder", fiveThunder: "five-thunder",
  kuiThunder: "kui-thunder", yinWaterThunder: "yin-water-thunder",
  coldThunderSword: "cold-thunder-sword", fiveThunderPalm: "five-thunder-palm",
  greenWood: "green-wood", waterMagic: "water-magic",
  fireball: "fireball", greatFire: "great-fire", flameAura: "flame-aura",
  frost: "frost", wind: "wind", earthEscape: "earth-escape",
  stoneScreen: "stone-screen", mountTai: "mount-tai",
  stoneBurst: "stone-burst", absorbQi: "absorb-qi",
  xuanpinQi: "xuanpin-qi", bodyHardening: "body-hardening",
  mountainStance: "mountain-stance", inchPunch: "inch-punch",
  shadowKick: "shadow-kick", frenzyPalm: "frenzy-palm",
  ghostFlash: "ghost-flash", undyingBody: "undying-body",
  mindDemon: "mind-demon", beastCharge: "beast-charge",
  wolfHowl: "wolf-howl", spiderSilk: "spider-silk",
  bloodBurst: "blood-burst", snakeShed: "snake-shed",
  golemSmash: "golem-smash", petrify: "petrify",
  gateAwaken: "gate-awaken", tigerRoar: "tiger-roar",
  apothecaryCry: "apothecary-cry", pill: "pill",
  talisman: "talisman", brokenBottle: "broken-bottle",
  cloudHand: "cloud-hand",
});

// Grouped names make an upgraded card retain the sound of its base technique.
const CARD_FAMILIES = Object.freeze({
  flyingSword: "swordControl",
  swordWard: "swordGuard",
  swordQiSlash: "swordQiSlash",
  swordIntent: "swordIntent swordHeartClarity swordGod humanSwordUnity",
  myriadSwords: "myriadSwords myriadSwordsReturn myriadSwordsReturnPlus myriadSwordsReturnPlusPlus",
  swordDomain: "swordDomain swordDomainPlus swordDomainPlusPlus",
  heartSword: "heartSword heartSwordPlus heartSwordPlusPlus",
  fiveElementsSword: "fiveElementsSword",
  goldThunderSeal: "goldLight thunderSeal",
  palmThunder: "palmThunder",
  fiveThunder: "fiveThunder fiveThunderPlus fiveThunderPlusPlus",
  kuiThunder: "kuiThunder",
  yinWaterThunder: "yinWaterThunder",
  coldThunderSword: "coldThunderSword",
  fiveThunderPalm: "fiveThunderHeartPalm",
  greenWood: "greenWood evergreenTribulation evergreenTribulationPlus evergreenTribulationPlusPlus",
  waterMagic: "waterDragon fourSeasReturn fourSeasReturnPlus fourSeasReturnPlusPlus sweetRain",
  fireball: "fireball karmaFire",
  greatFire: "samadhiTrueFire samadhiTrueFirePlus samadhiTrueFirePlusPlus wildfire redDragonBreath",
  flameAura: "flameIgnitionArt nirvanaSpell",
  frost: "frostSpell",
  wind: "clearWind samadhiWind",
  earthEscape: "earthEscape",
  stoneScreen: "stoneScreen",
  mountTai: "mountTai mountTaiPlus mountTaiPlusPlus",
  stoneBurst: "metalStoneBurst rockFinger",
  absorbQi: "qiEating valleyGodCurse gatherQi devouringHeaven",
  xuanpinQi: "xuanpinQi qianKunOneQi",
  bodyHardening: "bodyTemper ironBone diamondBody",
  mountainStance: "mountainForce huntianGong huntianGongPlus huntianGongPlusPlus",
  inchPunch: "inchPunch",
  shadowKick: "shadowKick",
  frenzyPalm: "frenzyPalm frenzyPalmPlus frenzyPalmPlusPlus",
  ghostFlash: "ghostFlash ghostFlashPlus ghostFlashPlusPlus",
  undyingBody: "undyingBody undyingBodyPlus undyingBodyPlusPlus",
  mindDemon: "heartDemonCard",
});

export const SKILL_SFX_BY_CARD_ID = Object.freeze(Object.fromEntries(
  Object.entries(CARD_FAMILIES).flatMap(([sound, ids]) => ids.split(" ").map((id) => [id, sound])),
));

const ENEMY_FAMILIES = Object.freeze({
  flyingSword: "skill.rookieHiddenSword.swordControlPlus item.swordTalisman.name",
  greenSnakeSword: "skill.rookieHiddenSword.greenSnakeSword",
  swordQiSlash: "skill.pursuer.slash skill.pursuerElite.slashPlus",
  swordWard: "skill.pursuer.guard skill.pursuerElite.guardPlus",
  swordIntent: "skill.pursuer.swordIntent skill.pursuerElite.swordIntentPlus",
  myriadSwords: "skill.pursuer.myriadSwordPlus skill.pursuerElite.myriadReturn",
  heartSword: "skill.pursuerElite.heartSword",
  goldThunderSeal: "skill.evilAlchemist.goldLightPlus",
  palmThunder: "skill.rookieFiveElements.palmThunderPlus skill.qingyi.palmThunderPlus",
  greenWood: "skill.fiveElements.greenWoodPlus",
  waterMagic: "skill.rookieFiveElements.waterDragonPlus",
  fireball: "skill.fiveElements.karmaFirePlus skill.evilAlchemist.karmaFirePlus skill.lostMindApothecary.karmaFire",
  greatFire: "skill.evilAlchemist.samadhiFirePlus",
  flameAura: "skill.evilAlchemist.flameIgnition",
  earthEscape: "skill.qingyi.earthEscapePlus",
  stoneScreen: "skill.rookieFiveElements.stoneScreenPlus skill.spider.guard skill.wolf.guard skill.stoneGolem.superHarden",
  stoneBurst: "skill.qingyi.goldStoneBurst",
  absorbQi: "skill.gate.valleyGodCurse",
  xuanpinQi: "skill.gate.xuanpinQi",
  bodyHardening: "skill.zhengyang.bodyTemperPlus skill.zhengyang.ironBone skill.tiger.diamondBody skill.tiger.eightDirections",
  mountainStance: "skill.zhengyang.mountainForcePlus skill.zhengyang.huntianGong skill.zhengyang.huntianGongPlus",
  inchPunch: "skill.zhengyang.inchPunchPlus skill.zhengyang.leftInchPunch2 skill.lostMindApothecary.rapidKnock",
  shadowKick: "skill.zhengyang.shadowKickPlus",
  fiveThunderPalm: "skill.rookieZhengyang.fiveThunderHeartPalm",
  frenzyPalm: "skill.zhengyang.frenzyPalmPlus",
  wolfHowl: "skill.wolf.howl skill.berserkWolf.howl skill.berserkWolf.glare",
  beastCharge: "skill.wolf.bite skill.berserkWolf.bite skill.whiteJadePython.fullCharge skill.whiteJadePython.charge skill.tiger.claw skill.tiger.climb",
  spiderSilk: "skill.spider.web",
  bloodBurst: "skill.spider.drain skill.spider.bloodBurst",
  snakeShed: "skill.whiteJadePython.shed skill.whiteJadePython.harden",
  golemSmash: "skill.stoneGolem.slam skill.stoneGolem.rockfall skill.stoneGolem.fullSlam skill.stoneGolem.collapse",
  petrify: "skill.stoneGolem.petrify",
  gateAwaken: "skill.gate.awaken",
  tigerRoar: "skill.tiger.tigerRoar",
  apothecaryCry: "skill.lostMindApothecary.weep skill.lostMindApothecary.scream",
  pill: "item.lifeLockPill.name item.qiPill.name item.bloodPill.name skill.evilAlchemist.takeMedicine",
  talisman: "skill.qingyi.adaptiveTalisman",
  brokenBottle: "skill.rookieZhengyang.brokenGreenBottle",
  cloudHand: "skill.qingyi.cloudHand",
});
const ENEMY_BY_NAME_KEY = Object.freeze(Object.fromEntries(
  Object.entries(ENEMY_FAMILIES).flatMap(([sound, names]) => names.split(" ").map((name) => [name, sound])),
));

export const SKILL_SFX_BY_ITEM_ID = Object.freeze({
  swordTalisman: "flyingSword", coolingTalisman: "talisman",
  spiritHeartTalisman: "talisman", diamondTalisman: "talisman",
  swiftTalisman: "talisman", armorBreakTalisman: "talisman",
  thunderTalisman: "palmThunder", fireTalisman: "fireball",
  heavenDemonTalisman: "mindDemon",
  bloodPill: "pill", qiPill: "pill", focusPill: "pill",
  soulGatheringPill: "pill", lifeLockPill: "pill",
  demonPill1: "pill", demonPill2: "pill", demonPill3: "pill", demonPill4: "pill",
});

export function enemySkillSfxKey(skill) {
  if (skill.nameKey?.startsWith("card.")) {
    const cardId = skill.nameKey.split(".")[1];
    return SKILL_SFX_BY_CARD_ID[cardId];
  }
  return ENEMY_BY_NAME_KEY[skill.nameKey] ?? null;
}
