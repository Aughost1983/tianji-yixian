import { enemySkillSfxKey } from "./skill-sfx.js";

export const ENEMY_ACTION_TYPES = Object.freeze(["attack", "defense", "support"]);

export const SWORD_MANUAL_DROP_POOL = Object.freeze([
  "swordControlManual", "swordGuardManual", "swordQiSlashManual", "swordIntentManual", "myriadSwordsManual",
]);

export const LAW_MANUAL_DROP_POOL = Object.freeze([
  "palmThunderManual", "greenWoodManual", "waterDragonManual", "karmaFireManual", "stoneScreenManual",
]);

export const BODY_MANUAL_DROP_POOL = Object.freeze([
  "inchPunchManual", "shadowKickManual", "bodyTemperManual", "mountainForceManual",
]);

export const ENEMIES = {
  wolf: {
    id: "wolf", nameKey: "enemy.wolf.name", descKey: "enemy.wolf.desc", art: "./assets/images/wolf.svg", artScale: 0.95,
    grade: "D", humanoid: false, maxHp: 30, hpRange: [30, 35], maxMana: 0, sense: 3, speed: 3, speedRange: [3, 4], evasion: 3, resist: {},
    drops: [{ itemId: "wolfFang", min: 1, max: 2 }, { itemId: "demonPill1", min: 1, max: 1 }],
    skills: [
      { id: "bite", nameKey: "skill.wolf.bite", type: "attack", chance: 60, packSkillOne: true, effects: [{ type: "damage", amount: 4 }] },
      { id: "guard", nameKey: "skill.wolf.guard", type: "defense", chance: 40, effects: [{ type: "gainGuard", amount: 4, target: "self" }] },
      { id: "howl", nameKey: "skill.wolf.howl", type: "support", chance: 100, effects: [{ type: "howlWolves" }] },
    ],
  },
  berserkWolf: {
    id: "berserkWolf", nameKey: "enemy.berserkWolf.name", descKey: "enemy.berserkWolf.desc", art: "./assets/images/berserk-wolf.svg", artScale: 1,
    grade: "C", humanoid: false, maxHp: 60, hpRange: [55, 65], maxMana: 0, sense: 4, speed: 4, speedRange: [4, 5], evasion: 0, resist: {},
    drops: [{ itemId: "bigWolfFang", min: 1, max: 2 }, { itemId: "demonPill2", min: 1, max: 1 }],
    skills: [
      { id: "frenzyBite", nameKey: "skill.berserkWolf.bite", type: "attack", chance: 70, packSkillOne: true, repeatFromFlag: "wolfRageStacks", effects: [{ type: "damage", amount: 4, repeat: 2 }] },
      { id: "howl", nameKey: "skill.berserkWolf.howl", type: "support", chance: 50, effects: [{ type: "howlWolves" }] },
      { id: "glare", nameKey: "skill.berserkWolf.glare", type: "support", chance: 100, effects: [{ type: "increaseCombatFlag", flag: "wolfRageStacks", amount: 1, target: "self" }] },
    ],
  },
  spider: {
    id: "spider", nameKey: "enemy.spider.name", descKey: "enemy.spider.desc", art: "./assets/images/spider.svg", artScale: 0.95,
    grade: "C", humanoid: false, maxHp: 70, hpRange: [65, 75], maxMana: 2, sense: 4, speed: 3, speedRange: [3, 4], evasion: 1, resist: {},
    startingStatuses: { heatResistance: 1 },
    drops: [{ itemId: "spiderSilk", countFromSkillUses: "web" }, { itemId: "demonPill2", min: 1, max: 1 }],
    skills: [
      {
        id: "web", nameKey: "skill.spider.web", type: "attack", chance: 50,
        chanceModifiers: [
          { source: "playerStatus", status: "entangle", perStack: -5 },
          { source: "selfSkillUseCount", skillId: "web", perUse: -5 },
        ],
        effects: [{ type: "damage", amount: 2, repeat: 3, statusOnHit: { status: "entangle", stacks: 1, chance: 75, requireActualDamage: true } }],
      },
      {
        id: "drain", nameKey: "skill.spider.drain", type: "attack", chance: 50,
        chanceModifiers: [{ source: "playerStatus", status: "entangle", perStack: 10 }],
        effects: [{ type: "damage", amount: 8, healFromActualDamage: true }],
      },
      {
        id: "bloodBurst", nameKey: "skill.spider.bloodBurst", type: "attack", chance: 50, manaCost: 2, tags: ["fire"],
        chanceModifiers: [{ source: "selfHpAtLeast", threshold: 35, amount: -25 }],
        effects: [
          { type: "damage", amount: 16, statusOnHit: { status: "burn", stacks: 4, chance: 100 } },
          { type: "damage", amount: 16, target: "self", ignoreQi: true, ignoreGuard: true, logSelfDamageCause: true },
        ],
      },
      { id: "webGuard", nameKey: "skill.spider.guard", type: "defense", chance: 100, effects: [{ type: "gainGuard", amount: 8, target: "self" }] },
    ],
  },
  whiteJadePython: {
    id: "whiteJadePython", nameKey: "enemy.whiteJadePython.name", descKey: "enemy.whiteJadePython.desc", art: "./assets/images/white-jade-python.svg", artScale: 0.95,
    grade: "C", humanoid: false, maxHp: 90, hpRange: [85, 95], maxMana: 2, sense: 5, speed: 2, speedRange: [2, 3], evasion: 0, resist: {},
    drops: [{ itemId: "snakeSlough", countFromSuccessfulSkillUses: "shed" }, { itemId: "demonPill2", min: 1, max: 1 }],
    skills: [
      {
        id: "fullCharge", nameKey: "skill.whiteJadePython.fullCharge", type: "attack", chance: 30, manaCost: 2,
        chanceModifiers: [{ source: "selfHpAtMost", threshold: 50, amount: -15 }],
        effects: [{ type: "damage", amount: 18, statusOnHit: { status: "stun", stacks: 1, chanceFromActualDamageMultiplier: 2, requireActualDamage: true } }],
      },
      {
        id: "charge", nameKey: "skill.whiteJadePython.charge", type: "attack", chance: 40,
        chanceModifiers: [{ source: "selfHpAtMost", threshold: 50, amount: -15 }],
        effects: [{ type: "damage", amount: 10, statusOnHit: { status: "stun", stacks: 1, chanceFromActualDamageMultiplier: 2, requireActualDamage: true } }],
      },
      {
        id: "shed", nameKey: "skill.whiteJadePython.shed", type: "support", chance: 50, manaCost: 2,
        chanceModifiers: [{ source: "selfHpAtMost", threshold: 50, amount: 35 }],
        effects: [{ type: "clearStatusesExcept", except: ["darkForce"], target: "self" }, { type: "gainMaxHpPercent", percent: 5, round: "ceil", target: "self" }, { type: "healMaxHpPercent", percent: 25, round: "ceil", target: "self" }],
      },
      { id: "harden", nameKey: "skill.whiteJadePython.harden", type: "defense", chance: 100, effects: [{ type: "gainGuard", amount: 12, target: "self" }, { type: "ensureStatus", status: "hardness", stacks: 1, target: "self" }] },
    ],
  },
  stoneGolem: {
    id: "stoneGolem", nameKey: "enemy.stoneGolem.name", descKey: "enemy.stoneGolem.desc", art: "./assets/images/stone-golem.svg", artScale: 1,
    grade: "D", humanoid: false, nonliving: true, maxHp: 150, hpRange: [140, 160], maxMana: 2, sense: 5, speed: 1, evasion: 0, resist: {},
    // v0.3.59: Stun/Dark Force immunity is intrinsic; only Hardness is an opening buff.
    startingStatuses: { hardness: 1 },
    drops: [{ itemId: "stoneHeart", min: 1, max: 2 }],
    skills: [
      { id: "slam", nameKey: "skill.stoneGolem.slam", type: "attack", chance: 50, effects: [{ type: "damage", amount: 15, statusOnHit: { status: "stun", stacks: 1, chanceFromActualDamageMultiplier: 3, requireActualDamage: true } }] },
      { id: "superHarden", nameKey: "skill.stoneGolem.superHarden", type: "defense", chance: 50, onlyLastInNextTurnOrder: true, chanceModifiers: [{ source: "selfStatus", status: "petrify", perStack: -5 }], effects: [{ type: "gainGuard", amount: 24, target: "allEnemies" }] },
      { id: "rockfall", nameKey: "skill.stoneGolem.rockfall", type: "attack", chance: 50, manaCost: 1, effects: [{ type: "damage", amount: 6, repeat: 4, statusOnHit: { status: "stun", stacks: 1, chance: 20, requireActualDamage: true } }] },
      { id: "fullSlam", nameKey: "skill.stoneGolem.fullSlam", type: "attack", chance: 90, manaCost: 0, cooldownRoundsAfterUse: 3, chanceModifiers: [{ source: "selfSkillUseCount", skillId: "fullSlam", perUse: -30 }], effects: [{ type: "damage", amount: 25, statusOnHit: { status: "stun", stacks: 1, chanceFromActualDamageMultiplier: 3, requireActualDamage: true } }] },
      {
        id: "collapse", nameKey: "skill.stoneGolem.collapse", type: "attack", chance: 0, manaCost: 0, decisionReplacementOnly: true,
        effects: [
          { type: "removeStatus", status: "hardness", stacks: Infinity, target: "self" },
          { type: "damage", amount: { sourceStatus: "petrify", mult: 8 }, target: "allCombatants", ignoreGuard: true,
            statusOnHit: { status: "armorBreak", stacks: 2, chance: 100, requireActualDamage: true } },
        ],
      },
      {
        id: "petrify", nameKey: "skill.stoneGolem.petrify", type: "support", chance: 100,
        randomReplacementSkillId: "collapse",
        randomReplacementChanceFromSelfStatus: { status: "petrify", perStack: 10 },
        effects: [
          { type: "addStatus", status: "petrify", stacks: 1, chance: 100, target: "self" },
          { type: "removeStatus", status: "armorBreak", stacks: Infinity, target: "self" },
          { type: "ensureStatus", status: "hardness", stacks: 1, target: "self" },
        ],
      },
    ],
  },
  gate: {
    id: "gate", nameKey: "enemy.gate.name", descKey: "enemy.gate.desc", art: "./assets/images/gate.svg", artScale: 1,
    grade: "D", humanoid: false, nonliving: true, maxHp: 500, maxMana: 999, sense: 0, speed: 0, evasion: 0, resist: {},
    // v0.3.59: no opening buffs; its own skills may still grant buffs during battle.
    startingStatuses: {},
    drops: [],
    skills: [
      {
        id: "valleyGodCurse", nameKey: "skill.gate.valleyGodCurse", type: "support", chance: 5, manaCost: 1,
        chanceModifiers: [{ source: "selfMissingHpPercentStep", step: 10, amount: 5 }],
        effects: [{ type: "valleyGodCurse", healMultiplier: 1, undyingStacks: 1, target: "self" }],
      },
      {
        id: "awaken", nameKey: "skill.gate.awaken", type: "support", chance: 50,
        forceZeroIfLivingEnemyCountAtLeast: { enemyId: "stoneGolem", count: 2 },
        chanceModifiers: [
          { source: "selfMissingHpPercentStep", step: 30, amount: 15 },
          { source: "selfCombatFlagValue", flag: "gateAwakenSuccessCount", perPoint: -15 },
        ],
        effects: [{ type: "awakenStoneGolem" }],
      },
      {
        id: "xuanpinQi", nameKey: "skill.gate.xuanpinQi", type: "support", chance: 100, dynamicManaCost: "xuanpinQiRound",
        effects: [{ type: "xuanpinQi", statusChance: 40, reflectionPerRound: 2, qiPerRound: 2, defenseMode: "both", target: "self" }],
      },
    ],
  },
  tiger: {
    id: "tiger", nameKey: "enemy.tiger.name", descKey: "enemy.tiger.desc", art: "./assets/images/tiger.svg", artScale: 1.05,
    grade: "A", humanoid: false, maxHp: 320, maxMana: 4, sense: 10, speed: 2, evasion: 5, resist: {},
    startingStatuses: { steadfast: 1, coldResistance: 1 },
    drops: [{ itemId: "demonPill4", min: 1, max: 1 }, { itemId: "diamondBodyManual", min: 1, max: 1 }],
    skills: [
      {
        id: "eightDirections", nameKey: "skill.tiger.eightDirections", type: "defense", chance: 100, manaCost: 4,
        chanceModifiers: [{ source: "selfSkillUseCount", skillId: "eightDirections", perUse: -100 }],
        effects: [{ type: "gainQi", amount: 24, target: "self" }, { type: "addStatus", status: "eightDirectionsWard", stacks: 1, chance: 100, target: "self" }],
      },
      {
        id: "claw", nameKey: "skill.tiger.claw", type: "attack", chance: 30,
        chanceModifiers: [{ source: "playerMissingHpPercentStep", step: 20, amount: 10 }],
        effects: [{ type: "damage", amount: 12, repeat: 3, statusOnHit: { status: "armorBreak", stacks: 1, chance: 40, requireActualDamage: true } }],
      },
      { id: "diamondBody", nameKey: "skill.tiger.diamondBody", type: "defense", chance: 50, manaCost: 2, effects: [{ type: "gainQi", amount: 12, target: "self" }, { type: "scheduleNextTurnQi", amount: 12, target: "self" }] },
      {
        id: "tigerRoar", nameKey: "skill.tiger.tigerRoar", type: "attack", chance: 30, manaCost: 4,
        chanceModifiers: [{ source: "playerQi", perPoint: 5 }],
        effects: [
          { type: "damage", amount: 16, ignoreQi: true },
          { type: "clearQi" },
        ],
      },
      { id: "climb", nameKey: "skill.tiger.climb", type: "attack", chance: 100, effects: [{ type: "damage", amount: 24, ignoreGuard: true }] },
    ],
  },
  lostMindApothecary: {
    id: "lostMindApothecary", nameKey: "enemy.lostMindApothecary.name", descKey: "enemy.lostMindApothecary.desc", art: "./assets/images/lost-mind-apothecary.svg", artScale: 1,
    grade: "C", humanoid: true, maxHp: 75, hpRange: [70, 80], maxMana: 2, sense: 4, speed: 4, speedRange: [4, 5], evasion: 0, resist: {},
    startingStatuses: { lostMind: 1 },
    drops: [{ itemId: "drugResidue", min: 1, max: 2 }],
    skills: [
      { id: "weep", nameKey: "skill.lostMindApothecary.weep", type: "support", chance: 0, chanceModifiers: [{ source: "selfStatus", status: "burn", perStack: 5 }], effects: [{ type: "clearStatusHealPerStack", status: "burn", healPerStack: 4, target: "self" }] },
      {
        id: "scream", nameKey: "skill.lostMindApothecary.scream", type: "support", chance: 30,
        chanceModifiers: [{ source: "selfStatus", status: "burn", perStack: 10 }],
        effects: [
          { type: "reduceGuard", amount: 15 },
          { type: "addStatus", status: "qiStagnation", stacks: 1, chance: 50 },
        ],
      },
      { id: "karmaFire", nameKey: "skill.lostMindApothecary.karmaFire", type: "attack", chance: 50, manaCost: 2, tags: ["fire"], effects: [{ type: "damage", amount: 2, repeat: 3, ignoreQi: true, statusOnHit: { status: "burn", stacks: 2, chance: 40 } }] },
      { id: "rapidKnock", nameKey: "skill.lostMindApothecary.rapidKnock", type: "attack", chance: 100, effects: [{ type: "damage", amount: 6, repeat: 2 }] },
    ],
  },
  evilAlchemist: {
    id: "evilAlchemist", nameKey: "enemy.evilAlchemist.name", descKey: "enemy.evilAlchemist.desc", art: "./assets/images/evil-alchemist.svg", artScale: 1,
    grade: "B", humanoid: true, maxHp: 105, hpRange: [100, 110], maxMana: 4, sense: 8, speed: 3, speedRange: [3, 4], evasion: 1, resist: {},
    startingStatuses: { heatResistance: 1 },
    drops: [
      { currency: "stones", min: 90, max: 120, chance: 100 },
      { itemId: "refiningPill", min: 1, max: 1, chance: 50 },
      { itemId: "flameIgnitionManual", min: 1, max: 1, chance: 50 },
      { itemId: "lifeLockPill", min: 1, max: 1, chance: 50, guaranteedIfSkillUnused: "takeMedicine" },
    ],
    skills: [
      { id: "flameIgnition", nameKey: "skill.evilAlchemist.flameIgnition", type: "support", chance: 0, manaCost: 1, chanceModifiers: [{ source: "playerStatus", status: "burn", perStack: 10 }], effects: [{ type: "igniteBurn" }] },
      { id: "karmaFirePlus", nameKey: "skill.evilAlchemist.karmaFirePlus", type: "attack", chance: 40, manaCost: 2, tags: ["fire"], effects: [{ type: "damage", amount: 3, repeat: 3, ignoreQi: true, statusOnHit: { status: "burn", stacks: 2, chance: 60 } }] },
      { id: "samadhiFirePlus", nameKey: "skill.evilAlchemist.samadhiFirePlus", type: "attack", chance: 40, manaCost: 4, tags: ["fire"], effects: [{ type: "damage", amount: 5, repeat: 3, target: "playerAndLostMindApothecaries", ignoreQi: true, statusOnHit: { status: "burn", stacks: 4, chance: 70 } }] },
      { id: "goldLight", nameKey: "skill.evilAlchemist.goldLightPlus", type: "defense", chance: 40, manaCost: 1,
        effects: [{ type: "gainQi", amount: { sourceStat: "sense", mult: 2 }, target: "self" }] },
      { id: "takeMedicine", nameKey: "skill.evilAlchemist.takeMedicine", type: "support", chance: 100, effects: [{ type: "heal", amount: 30, target: "self" }, { type: "addStatus", status: "undying", stacks: 1, chance: 100, target: "self" }] },
    ],
  },
  fiveElementsDisciple: {
    id: "fiveElementsDisciple", nameKey: "enemy.fiveElementsDisciple.name", descKey: "enemy.fiveElementsDisciple.desc", art: "./assets/images/five-elements-disciple.svg", artScale: 1,
    grade: "C", humanoid: true, maxHp: 45, hpRange: [40, 50], maxMana: 4, sense: 8, speed: 2, speedRange: [2, 3], evasion: 1, resist: {},
    startingStatuses: { fiveElementsSecret: 1 },
    drops: [
      { currency: "stones", min: 30, max: 40, chance: 100 },
      { itemId: "refiningPill", min: 1, max: 1, chance: 5 },
      { itemPool: LAW_MANUAL_DROP_POOL, min: 1, max: 1, chance: 15 },
      { itemId: "diamondTalisman", min: 1, max: 1, chance: 5 },
      { itemId: "armorBreakTalisman", min: 1, max: 1, chance: 5 },
      { itemId: "thunderTalisman", min: 1, max: 1, chance: 3 },
      { itemId: "fireTalisman", min: 1, max: 1, chance: 3 },
    ],
    skills: [
      {
        id: "stoneScreen", nameKey: "card.stoneScreen.name", type: "defense", chance: 30, manaCost: 1, onlyLastInNextTurnOrder: true,
        manaCostModifiers: [{ source: "selfStatus", status: "burn", amount: -1 }],
        effects: [{ type: "gainGuard", amount: 18, target: "allEnemies" }],
      },
      {
        id: "waterDragon", nameKey: "card.waterDragon.name", type: "attack", chance: 30, manaCost: 2,
        chanceModifiers: [
          { source: "playerStatus", status: "entangle", perStack: 5 },
          { source: "playerStatus", status: "qiStagnation", perStack: -10 },
          { source: "playerStatus", status: "stun", perStack: 70 },
        ],
        effects: [{
          type: "damage", amount: 12,
          intensifyEntangleOnActualDamage: true,
          statusOnHit: { status: "qiStagnation", stacks: 1, chance: 100, requireActualDamage: true },
        }],
      },
      {
        id: "karmaFirePlus", nameKey: "skill.fiveElements.karmaFirePlus", type: "attack", chance: 30, manaCost: 2, tags: ["fire"],
        chanceModifiers: [{ source: "playerStatus", status: "entangle", perStack: 10 }],
        effects: [{ type: "damage", amount: 3, repeat: 3, ignoreQi: true, statusOnHit: { status: "burn", stacks: 2, chance: 60 } }],
      },
      {
        id: "greenWoodPlus", nameKey: "skill.fiveElements.greenWoodPlus", type: "attack", chance: 50, manaCost: 2,
        chanceModifiers: [{ source: "playerQi", perPoint: -5 }],
        effects: [{ type: "damage", amount: 1, repeat: 6, ignoreGuard: true, healFromActualDamage: true, statusOnHit: { status: "entangle", stacks: 1, chance: 35, requireActualDamage: true } }],
      },
      { id: "palmThunder", nameKey: "card.palmThunder.name", type: "attack", chance: 100, manaCost: 1, noManaDecisionFallbackSkillId: "qiEating", effects: [{ type: "damage", amount: 9 }] },
      { id: "qiEating", nameKey: "card.qiEating.name", type: "support", chance: 100, manaCost: 0, decisionFallbackOnly: true, effects: [{ type: "gainMana", amount: 2, target: "self" }] },
    ],
  },
  hiddenSwordOuterDisciple: {
    id: "hiddenSwordOuterDisciple", nameKey: "enemy.hiddenSwordOuterDisciple.name", descKey: "enemy.hiddenSwordOuterDisciple.desc", art: "./assets/images/hidden-sword-outer-disciple.svg", artScale: 1,
    grade: "D", humanoid: true, maxHp: 50, maxMana: 2, sense: 8, speed: 3, evasion: 3, resist: {},
    startingStatuses: { tianGangArmor: 1 },
    drops: [
      { currency: "stones", min: 100, max: 150, chance: 100 },
      { itemId: "lifeLockPill", chance: 100, baseCountMinusSkillUses: { base: 1, skillId: "rookieLifeLockPill" } },
      { itemId: "qiPill", chance: 100, baseCountMinusSkillUses: { base: 1, skillId: "rookieQiPill" } },
      { itemId: "swordTalisman", chance: 100, baseCountMinusSkillUses: { base: 2, skillId: "rookieSwordTalisman" } },
      { artifactId: "greenSnakeSword", chance: 100, min: 1, max: 1 },
    ],
    skills: [
      {
        id: "rookieLifeLockPill", nameKey: "item.lifeLockPill.name", type: "support", chance: 0, manaCost: 0,
        rookieSkillOneLogic: "lifeLock", maxSuccessfulUses: 1,
        effects: [{ type: "heal", amount: 30, target: "self" }, { type: "addStatus", status: "undying", stacks: 1, chance: 100, target: "self" }],
      },
      {
        id: "rookieQiPill", nameKey: "item.qiPill.name", type: "support", chance: 0, manaCost: 0,
        rookieSkillOneLogic: "qiPill", maxSuccessfulUses: 1,
        effects: [{ type: "gainMana", amount: 4, allowOverflow: true, target: "self" }],
      },
      {
        id: "rookieSwordTalisman", nameKey: "item.swordTalisman.name", type: "attack", chance: 0, manaCost: 0,
        rookieSkillOneLogic: "swordTalisman", maxSuccessfulUses: 2, bypassPlayerReactions: true,
        effects: [{ type: "damage", amount: 32 }],
      },
      {
        id: "rookieSwordControl", nameKey: "card.swordControl.name", type: "attack", chance: 50, manaCost: 1,
        freeIfSelfCombatFlag: "rookieSwordControlFreeNext",
        effects: [{ type: "damage", amount: 4 }, { type: "gainQi", amount: 2, target: "self" }],
      },
      {
        id: "rookieSwordControlPlus", nameKey: "skill.rookieHiddenSword.swordControlPlus", type: "attack", chance: 50, manaCost: 1,
        freeIfSelfCombatFlag: "rookieSwordControlFreeNext",
        effects: [{ type: "damage", amount: 6 }, { type: "gainQi", amount: 4, target: "self" }],
      },
      {
        id: "rookieGreenSnakeSword", nameKey: "skill.rookieHiddenSword.greenSnakeSword", intentNameKey: "skill.rookieHiddenSword.greenSnakeSwordIntent", type: "attack", chance: 100, manaCost: 0,
        replaceIfSelfSenseBelow: 1, replacementSkillId: "rookieGreenSnakeSwordWeak",
        effects: [{ type: "damage", amount: 5, ignoreGuard: true, statusOnHit: { status: "entangle", stacksRange: [1, 3], chance: 100 } }, { type: "loseSense", amount: 1, target: "self" }],
      },
      {
        id: "rookieGreenSnakeSwordWeak", nameKey: "skill.rookieHiddenSword.greenSnakeSword", intentNameKey: "skill.rookieHiddenSword.greenSnakeSwordIntent", type: "attack", chance: 100, manaCost: 0,
        decisionReplacementOnly: true,
        effects: [{ type: "damage", amount: 1, ignoreGuard: true, statusOnHit: { status: "entangle", stacks: 1, chance: 100 } }, { type: "loseSense", amount: 1, target: "self" }],
      },
    ],
  },
  fiveElementsOuterDisciple: {
    id: "fiveElementsOuterDisciple", nameKey: "enemy.fiveElementsOuterDisciple.name", descKey: "enemy.fiveElementsOuterDisciple.desc", art: "./assets/images/five-elements-outer-disciple.svg", artScale: 1,
    grade: "D", humanoid: true, maxHp: 35, maxMana: 4, sense: 8, speed: 2, evasion: 10, resist: {},
    startingStatuses: { windRaccoonBody: 1 },
    drops: [
      { currency: "stones", min: 10, max: 15, chance: 100 },
      { itemId: "refiningPill", min: 1, max: 1, chance: 100 },
    ],
    skills: [
      {
        id: "rookieStoneScreenPlus", nameKey: "skill.rookieFiveElements.stoneScreenPlus", type: "defense", chance: 15, manaCost: 1, onlyLastInNextTurnOrder: true,
        manaCostModifiers: [{ source: "selfStatus", status: "burn", amount: -1 }],
        chanceModifiers: [{ source: "livingEnemiesTotalHpAtMost", threshold: 100, amount: 15 }],
        effects: [{ type: "gainGuard", amount: 24, target: "allEnemies" }],
      },
      {
        id: "rookieWaterDragonPlus", nameKey: "skill.rookieFiveElements.waterDragonPlus", type: "attack", chance: 30, manaCost: 2,
        chanceModifiers: [{ source: "playerStatus", status: "entangle", perStack: 5 }],
        effects: [{ type: "damage", amount: 15, intensifyEntangleOnActualDamage: true, statusOnHit: { status: "qiStagnation", stacks: 2, chance: 100, requireActualDamage: true } }],
      },
      {
        id: "rookieKarmaFirePlus", nameKey: "skill.fiveElements.karmaFirePlus", type: "attack", chance: 30, manaCost: 2, tags: ["fire"],
        chanceModifiers: [{ source: "playerStatus", status: "entangle", perStack: 10 }],
        effects: [{ type: "damage", amount: 3, repeat: 3, ignoreQi: true, statusOnHit: { status: "burn", stacks: 2, chance: 60 } }],
      },
      {
        id: "rookieGreenWoodPlus", nameKey: "skill.fiveElements.greenWoodPlus", type: "attack", chance: 50, manaCost: 2,
        chanceModifiers: [{ source: "playerQi", perPoint: -5 }],
        effects: [{ type: "damage", amount: 1, repeat: 6, ignoreGuard: true, healFromActualDamage: true, statusOnHit: { status: "entangle", stacks: 1, chance: 35, requireActualDamage: true } }],
      },
      {
        id: "rookiePalmThunderPlus", nameKey: "skill.rookieFiveElements.palmThunderPlus", type: "attack", chance: 100, manaCost: 1, noManaDecisionFallbackSkillId: "rookieQiEating",
        effects: [{ type: "damage", amount: 13, statusOnHit: { status: "stun", stacks: 1, chance: 35 } }],
      },
      { id: "rookieQiEating", nameKey: "card.qiEating.name", type: "support", chance: 100, manaCost: 0, decisionFallbackOnly: true, effects: [{ type: "gainMana", amount: 2, target: "self" }] },
    ],
  },
  zhengyangOuterDisciple: {
    id: "zhengyangOuterDisciple", nameKey: "enemy.zhengyangOuterDisciple.name", descKey: "enemy.zhengyangOuterDisciple.desc", art: "./assets/images/zhengyang-outer-disciple.svg", artScale: 1,
    grade: "D", humanoid: true, maxHp: 45, maxMana: 2, sense: 7, speed: 3, evasion: 5, resist: {},
    startingStatuses: { mainCharacterHalo: 1 },
    drops: [],
    skills: [
      {
        id: "rookieFiveThunderHeartPalm", nameKey: "card.fiveThunderHeartPalm.name", type: "attack", chance: 0, manaCost: 0,
        chanceModifiers: [{ source: "playerQiAtMost", threshold: 0, amount: 30 }, { source: "playerHasStatus", status: "stun", amount: 70 }],
        effects: [{ type: "damage", amount: 1, repeat: 5, afterAllHitsStatus: { status: "darkForce", stacks: 5, chance: 100, requireEveryHitActualDamage: true } }],
      },
      {
        id: "rookieInchPunchPlus", nameKey: "skill.zhengyang.inchPunchPlus", type: "attack", chance: 30, manaCost: 0,
        effects: [{ type: "damage", amount: 7, ignoreGuard: true, reduceGuardFromActualDamage: 2, statusOnHit: { status: "qiStagnation", stacks: 1, chance: 60 } }],
      },
      {
        id: "rookiePalmThunderPlus", nameKey: "skill.rookieFiveElements.palmThunderPlus", type: "attack", chance: 50, manaCost: 1,
        effects: [{ type: "damage", amount: { sourceStat: "sense", mult: 1.5, add: 1 }, statusOnHit: { status: "stun", stacks: 1, chance: 35 } }],
      },
      {
        id: "rookieBrokenGreenBottle", nameKey: "skill.rookieZhengyang.brokenGreenBottle", intentNameKey: "skill.rookieZhengyang.brokenGreenBottleIntent", type: "support", chance: 100, manaCost: 0,
        replaceIfSelfSenseBelow: 2, replacementSkillId: "rookieBodyTemper",
        effects: [{ type: "rookieBrokenGreenBottle" }],
      },
      {
        id: "rookieBodyTemper", nameKey: "card.bodyTemper.name", type: "defense", chance: 100, manaCost: 0, decisionReplacementOnly: true,
        effects: [{ type: "gainQi", amount: 3, target: "self" }, { type: "gainGuard", amount: 5, target: "self" }],
      },
    ],
  },
  zhengyangDisciple: {
    id: "zhengyangDisciple", nameKey: "enemy.zhengyangDisciple.name", descKey: "enemy.zhengyangDisciple.desc", art: "./assets/images/zhengyang-disciple.svg", artScale: 1,
    grade: "C", humanoid: true, maxHp: 85, hpRange: [80, 90], maxMana: 2, sense: 6, speed: 4, speedRange: [4, 5], evasion: 7, resist: {},
    startingBloodPillsRange: [1, 2],
    startingStatuses: { hardness: 1 },
    drops: [
      { currency: "stones", min: 5, max: 10, chance: 100 },
      { itemId: "refiningPill", min: 1, max: 1, chance: 5 },
      { itemPool: BODY_MANUAL_DROP_POOL, min: 1, max: 1, chance: 15 },
      { itemId: "swiftTalisman", min: 1, max: 1, chance: 5 },
      { itemId: "bloodPill", chance: 100, countFromCombatFlag: "bloodPillCarried" },
    ],
    skills: [
      {
        id: "mountainForcePlus", nameKey: "skill.zhengyang.mountainForcePlus", type: "defense", chance: 20, manaCost: 0,
        chanceModifiers: [{ source: "selfHasStatus", status: "barrier", amount: 40 }],
        effects: [{ type: "gainGuard", amount: 8, target: "self" }, { type: "armEnemyMountainCounter", multiplier: 2, guardRetention: 0.5 }],
      },
      {
        id: "inchPunchPlus", nameKey: "skill.zhengyang.inchPunchPlus", type: "attack", chance: 40, manaCost: 0, tags: ["martial"],
        chanceModifiers: [{ source: "playerMissingHpPercentStep", step: 20, amount: 15 }],
        effects: [{ type: "damage", amount: 7, ignoreGuard: true, reduceGuardFromActualDamage: 2, statusOnHit: { status: "qiStagnation", stacks: 1, chance: 60 } }],
      },
      {
        id: "bodyTemperPlus", nameKey: "skill.zhengyang.bodyTemperPlus", type: "defense", chance: 20, manaCost: 0,
        chanceModifiers: [{ source: "selfHpAtMost", threshold: 50, amount: 20 }],
        effects: [{ type: "gainQi", amount: 5, target: "self" }, { type: "gainGuard", amount: 10, target: "self" }],
      },
      {
        id: "bloodPill", nameKey: "item.bloodPill.name", type: "support", chance: 0, manaCost: 0,
        decisionReplacementOnly: true, effects: [{ type: "heal", amount: 15, target: "self" }],
      },
      {
        id: "huntianGong", nameKey: "skill.zhengyang.huntianGong", type: "support", chance: 100, manaCost: 0,
        selfMissingHpReplacement: { step: 20, chancePerStep: 25, skillId: "bloodPill" },
        effects: [{ type: "armEnemyHuntian", armorBreakStacks: 2 }],
      },
    ],
  },
  zhengyangElite: {
    id: "zhengyangElite", nameKey: "enemy.zhengyangElite.name", descKey: "enemy.zhengyangElite.desc", art: "./assets/images/zhengyang-elite.svg", artScale: 1,
    grade: "B", humanoid: true, maxHp: 105, hpRange: [100, 110], maxMana: 2, sense: 8, speed: 5, speedRange: [5, 6], evasion: 7, resist: {},
    startingBloodPillsRange: [1, 3],
    startingStatuses: { hardness: 1, steadfast: 1 },
    drops: [
      { currency: "stones", min: 10, max: 20, chance: 100 },
      { itemId: "refiningPill", min: 1, max: 1, chance: 10 },
      { itemPool: BODY_MANUAL_DROP_POOL, min: 1, max: 1, chance: 20 },
      { itemPool: BODY_MANUAL_DROP_POOL, min: 1, max: 1, chance: 10 },
      { itemId: "swiftTalisman", min: 1, max: 1, chance: 10 },
      { itemId: "bloodPill", chance: 100, countFromCombatFlag: "bloodPillCarried" },
    ],
    skills: [
      {
        id: "mountainForcePlus", nameKey: "skill.zhengyang.mountainForcePlus", type: "defense", chance: 10, manaCost: 0,
        forceZeroIfSelfCombatFlag: "enemyIronBoneDecisionLock",
        chanceModifiers: [{ source: "selfHasStatus", status: "barrier", amount: 20 }],
        effects: [{ type: "gainGuard", amount: 8, target: "self" }, { type: "armEnemyMountainCounter", multiplier: 2, guardRetention: 0.5 }],
      },
      {
        id: "shadowKickPlus", nameKey: "skill.zhengyang.shadowKickPlus", type: "attack", chance: 30, manaCost: 0, tags: ["martial"],
        chanceModifiers: [{ source: "playerQi", perPoint: 5 }],
        effects: [{ type: "damage", amount: 2, repeat: 5, ignoreQi: true }],
      },
      {
        id: "inchPunchPlus", nameKey: "skill.zhengyang.inchPunchPlus", type: "attack", chance: 50, manaCost: 0, tags: ["martial"],
        chanceModifiers: [{ source: "playerQi", perPoint: -5 }],
        effects: [{ type: "damage", amount: 7, ignoreGuard: true, reduceGuardFromActualDamage: 2, statusOnHit: { status: "qiStagnation", stacks: 1, chance: 60 } }],
      },
      {
        id: "ironBone", nameKey: "skill.zhengyang.ironBone", type: "support", chance: 70, manaCost: 1,
        forceZeroIfSelfCombatFlag: "enemyIronBoneDecisionLock",
        effects: [{ type: "activateEnemyIronBone" }],
      },
      {
        id: "bloodPill", nameKey: "item.bloodPill.name", type: "support", chance: 0, manaCost: 0,
        decisionReplacementOnly: true, effects: [{ type: "heal", amount: 15, target: "self" }],
      },
      {
        id: "huntianGongPlus", nameKey: "skill.zhengyang.huntianGongPlus", type: "support", chance: 100, manaCost: 0,
        replaceIfSelfCombatFlag: "enemyIronBoneDecisionLock", replacementSkillIds: ["shadowKickPlus", "inchPunchPlus"],
        selfMissingHpReplacement: { step: 20, chancePerStep: 25, skillId: "bloodPill" },
        effects: [{ type: "armEnemyHuntian", armorBreakStacks: 3, healingStacks: 1 }],
      },
    ],
  },
  zhengyangChief: {
    id: "zhengyangChief", nameKey: "enemy.zhengyangChief.name", descKey: "enemy.zhengyangChief.desc", art: "./assets/images/zhengyang-chief.svg", artScale: 1,
    grade: "A", humanoid: true, maxHp: 150, maxMana: 3, sense: 10, speed: 6, evasion: 7, resist: {},
    startingBloodPillsRange: [2, 3],
    startingStatuses: { hardness: 1, steadfast: 1, undying: 2, healing: 2 },
    drops: [
      { currency: "stones", min: 50, max: 100, chance: 100 },
      { itemId: "refiningPill", min: 1, max: 2, chance: 100 },
      { itemId: "bloodPill", chance: 100, countFromCombatFlag: "bloodPillCarried" },
    ],
    skills: [
      {
        id: "diamondBody", nameKey: "card.diamondBody.name", type: "defense", chance: 20, maxChance: 50, manaCost: 2,
        forceZeroIfSelfCombatFlag: "enemyIronBoneDecisionLock",
        chanceModifiers: [
          { source: "selfCombatFlagValue", flag: "enemyChiefDiamondBodyBonus", perPoint: 1 },
          { source: "selfCombatFlag", flag: "enemyChiefHuntianDecisionLock", amount: 10 },
        ],
        replaceIfSelfCombatFlag: "enemyChiefDiamondBodyGatherArmed", replacementSkillId: "gatherQi", replacementChance: 80, replacementMinSelfQiExclusive: 5,
        effects: [
          { type: "gainQi", amount: 12, target: "self" },
          { type: "scheduleNextTurnQi", amount: 12, target: "self" },
          { type: "advanceChiefDiamondBody" },
        ],
      },
      {
        id: "shadowKickPlus", nameKey: "skill.zhengyang.shadowKickPlus", type: "attack", chance: 40, maxChance: 70, manaCost: 0, tags: ["martial"],
        forceZeroIfSelfCombatFlag: "enemyChiefHuntianDecisionLock",
        chanceModifiers: [{ source: "playerQi", perPoint: 3 }],
        effects: [{ type: "damage", amount: 2, repeat: 5, ignoreQi: true }],
      },
      {
        id: "inchPunchPlus", nameKey: "skill.zhengyang.inchPunchPlus", type: "attack", chance: 40, manaCost: 0, tags: ["martial"],
        forceZeroIfSelfCombatFlag: "enemyChiefHuntianDecisionLock",
        chanceModifiers: [{ source: "playerQi", perPoint: -5 }],
        effects: [{ type: "damage", amount: 7, ignoreGuard: true, reduceGuardFromActualDamage: 2, statusOnHit: { status: "qiStagnation", stacks: 1, chance: 60 } }],
      },
      {
        id: "ironBone", nameKey: "skill.zhengyang.ironBone", type: "support", chance: 60, manaCost: 1,
        forceZeroIfSelfCombatFlag: "enemyIronBoneDecisionLock",
        chanceModifiers: [{ source: "selfCombatFlag", flag: "enemyChiefHuntianDecisionLock", amount: 30 }],
        selfMissingHpReplacement: { baseChance: 10, step: 20, chancePerStep: 10, skillId: "undyingBodyPlus", requireReplacementManaAvailable: true },
        effects: [{ type: "activateEnemyIronBone", restorePersistentHardnessIfMissing: true }],
      },
      {
        id: "undyingBodyPlus", nameKey: "card.undyingBodyPlus.name", type: "support", chance: 0, manaCost: 2,
        decisionReplacementOnly: true,
        effects: [{ type: "addStatus", status: "undying", stacks: 2, chance: 100, target: "self" }, { type: "addStatus", status: "healing", stacks: 2, chance: 100, target: "self" }],
      },
      {
        id: "gatherQi", nameKey: "card.gatherQi.name", type: "support", chance: 0, manaCost: 0,
        decisionReplacementOnly: true, effects: [{ type: "activateEnemyGatherQi" }],
      },
      {
        id: "bloodPill", nameKey: "item.bloodPill.name", type: "support", chance: 0, manaCost: 0,
        decisionReplacementOnly: true, effects: [{ type: "heal", amount: 15, target: "self" }],
      },
      {
        id: "huntianGongPlusPlus", nameKey: "card.huntianGongPlusPlus.name", type: "support", chance: 100, manaCost: 0,
        replaceIfSelfCombatFlag: "enemyChiefHuntianDecisionLock", replacementSkillId: "bloodPill",
        replaceIfSelfCombatFlags: ["enemyIronBoneDecisionLock"], replacementSkillIds: ["shadowKickPlus", "inchPunchPlus"],
        effects: [{ type: "armEnemyHuntian", armorBreakStacks: 4, healingStacks: 2, nextDecisionFlag: "enemyChiefHuntianDecisionLock" }],
      },
    ],
  },
  zhengyangLeftProtector: {
    id: "zhengyangLeftProtector", nameKey: "enemy.zhengyangLeftProtector.name", descKey: "enemy.zhengyangLeftProtector.desc",
    art: "./assets/images/zhengyang-left-protector.svg", artScale: 1,
    grade: "A", humanoid: true, maxHp: 240, maxMana: 3, sense: 12, speed: 6, evasion: 7, resist: {},
    startingStatuses: { hardness: 1, steadfast: 1 },
    drops: [
      { currency: "stones", min: 50, max: 100, chance: 100 },
      { itemId: "refiningPill", min: 1, max: 1, chance: 100 },
      { itemId: "lifeLockPill", min: 1, max: 1, chance: 100 },
      { itemId: "demonPill2", min: 3, max: 5, chance: 100 },
      { itemId: "stoneHeart", min: 1, max: 3, chance: 100 },
    ],
    skills: [
      { id: "frenzyPalmPlus", nameKey: "card.frenzyPalmPlus.name", type: "attack", chance: 40, manaCost: 0, tags: ["martial"],
        effects: [{ type: "damage", amount: { add: 7, sourceStatus: "heartDemon", mult: 3 }, ignoreGuard: true },
          { type: "addStatus", status: "heartDemon", stacks: 1, chance: 100, target: "self" }] },
      { id: "inchPunchPlus", nameKey: "skill.zhengyang.leftInchPunch2", type: "attack", chance: 40, manaCost: 0, tags: ["martial"],
        effects: [{ type: "damage", amount: 7, repeat: 2, ignoreGuard: true, reduceGuardFromActualDamage: 2,
          statusOnHit: { status: "qiStagnation", stacks: 1, chance: 60 } }] },
      { id: "ironBone", nameKey: "skill.zhengyang.ironBone", type: "support", chance: 60, manaCost: 1,
        forceZeroIfSelfCombatFlag: "enemyIronBoneDecisionLock", effects: [{ type: "activateEnemyIronBone", restorePersistentHardnessIfMissing: true }] },
      { id: "undyingBodyPlusPlus", nameKey: "card.undyingBodyPlusPlus.name", type: "support", chance: 60, manaCost: 1,
        forceZeroIfSelfCombatFlags: ["enemyIronBoneDecisionLock", "leftGhostDecisionLock"],
        effects: [{ type: "addStatus", status: "undying", stacks: 3, chance: 100, target: "self" },
          { type: "addStatus", status: "healing", stacks: 3, chance: 100, target: "self" }] },
      { id: "ghostFlash", nameKey: "card.ghostFlash.name", type: "defense", chance: 100, manaCost: 0,
        forceZeroIfSelfCombatFlag: "leftGhostDecisionLock",
        replaceIfSelfCombatFlag: "enemyIronBoneDecisionLock", replacementSkillIds: ["frenzyPalmPlus", "inchPunchPlus"],
        effects: [{ type: "armEnemyGhostFlash" }] },
    ],
  },
  fiveElementsElite: {
    id: "fiveElementsElite", nameKey: "enemy.fiveElementsElite.name", descKey: "enemy.fiveElementsElite.desc", art: "./assets/images/five-elements-elite.svg", artScale: 1,
    grade: "B", humanoid: true, maxHp: 65, hpRange: [60, 70], maxMana: 6, sense: 10, speed: 2, evasion: 1, resist: {},
    startingStatuses: { fiveElementsSecret: 1 },
    drops: [
      { currency: "stones", min: 60, max: 70, chance: 100 },
      { itemId: "refiningPill", min: 1, max: 1, chance: 10 },
      { itemPool: LAW_MANUAL_DROP_POOL, min: 1, max: 1, chance: 20 },
      { itemPool: LAW_MANUAL_DROP_POOL, min: 1, max: 1, chance: 10 },
      { itemId: "diamondTalisman", min: 1, max: 1, chance: 10 },
      { itemId: "armorBreakTalisman", min: 1, max: 1, chance: 10 },
      { itemId: "thunderTalisman", min: 1, max: 1, chance: 5 },
      { itemId: "fireTalisman", min: 1, max: 1, chance: 5 },
    ],
    skills: [
      {
        id: "evergreenTribulationPlus", nameKey: "card.evergreenTribulation.name", type: "support", chance: 20, manaCost: 3,
        chanceModifiers: [
          { source: "selfStatus", status: "barrier", perStack: -10 },
        ],
        effects: [
          { type: "addStatus", status: "barrier", stacks: 2, chance: 100, target: "allEnemies" },
          { type: "addStatus", status: "healing", stacks: 2, chance: 100, target: "allEnemies" },
        ],
      },
      {
        id: "yinWaterThunder", nameKey: "card.yinWaterThunder.name", type: "attack", chance: 20, manaCost: 3,
        chanceModifiers: [
          { source: "playerHasStatus", status: "qiStagnation", amount: 80 },
          { source: "selfStatusAtLeast", status: "burn", threshold: 8, amount: -20 },
        ],
        effects: [{
          type: "damage", amount: 32, ignoreGuard: true,
          damageMultiplierIfTargetStatus: { status: "qiStagnation", multiplier: 2 },
          statusOnHit: { status: "qiStagnation", stacks: 1, chance: 50 },
        }],
      },
      {
        id: "mountTai", nameKey: "card.mountTai.name", type: "attack", chance: 20, manaCost: 4, onlyLastInNextTurnOrder: true,
        chanceModifiers: [{ source: "selfStatusAtLeast", status: "burn", threshold: 8, amount: -20 }],
        effects: [
          { type: "damage", amount: 30, statusOnHit: { status: "armorBreak", stacks: 1, chance: 100 } },
          { type: "gainGuard", amount: 30, target: "allEnemies" },
        ],
      },
      {
        id: "samadhiTrueFire", nameKey: "card.samadhiTrueFire.name", type: "attack", chance: 40, manaCost: 4, tags: ["fire"],
        chanceModifiers: [
          { source: "playerStatus", status: "entangle", perStack: 10 },
          { source: "selfStatusAtLeast", status: "burn", threshold: 8, amount: -20 },
        ],
        effects: [{ type: "damage", amount: 4, repeat: 3, ignoreQi: true, statusOnHit: { status: "burn", stacks: 3, chance: 60 } }],
      },
      {
        id: "sweetRain", nameKey: "card.sweetRain.name", type: "support", chance: 100, manaCost: 1, noManaDecisionFallbackSkillId: "qiEating",
        effects: [
          { type: "halveStatus", status: "burn", target: "self" },
          { type: "addStatus", status: "healing", stacks: 2, chance: 100, target: "self" },
        ],
      },
      { id: "qiEating", nameKey: "card.qiEating.name", type: "support", chance: 100, manaCost: 0, decisionFallbackOnly: true, effects: [{ type: "gainMana", amount: 2, target: "self" }] },
    ],
  },
  qingyiCultivator: {
    id: "qingyiCultivator", nameKey: "enemy.qingyiCultivator.name", descKey: "enemy.qingyiCultivator.desc", art: "./assets/images/qingyi-cultivator.svg", artScale: 1,
    grade: "B", humanoid: true, maxHp: 100, hpRange: [95, 105], maxMana: 4, sense: 10, speed: 4, evasion: 10, resist: {},
    startingStatuses: { undying: 3 },
    drops: [
      { currency: "stones", countFromCombatTotalFlag: "stolenStonesTotal", bonusMin: 25, bonusMax: 50, chance: 100 },
      { itemId: "coolingTalisman", min: 1, max: 2, chance: 25 },
      { itemId: "spiritHeartTalisman", min: 1, max: 2, chance: 25 },
      { itemId: "diamondTalisman", min: 1, max: 2, chance: 25 },
      { itemId: "spiritQuenchingManual", min: 1, max: 1, chance: 15, oncePerChapterFlag: "qingyiSpiritQuenchingManual" },
      { itemId: "mysticPassageManual", min: 1, max: 1, chance: 5, oncePerChapterFlag: "qingyiMysticPassageManual" },
    ],
    skills: [
      {
        id: "cloudHand", nameKey: "skill.qingyi.cloudHand", type: "attack", chance: 40,
        forceZeroIfPlayerStonesAtMost: 10,
        chanceModifiers: [
          { source: "playerQi", perPoint: -10 },
          { source: "playerHasStatus", status: "stun", amount: 100 },
        ],
        effects: [{ type: "damage", amount: 1, repeat: 5, ignoreGuard: true, stealStonesOnActualDamage: { min: 5, max: 40 } }],
      },
      {
        id: "earthEscape", nameKey: "skill.qingyi.earthEscapePlus", type: "support", chance: 0, manaCost: 1,
        chanceModifiers: [
          { source: "selfHpAtMost", threshold: 50, amount: 75 },
          { source: "playerStonesBelow", threshold: 50, amount: 50 },
        ],
        effects: [{ type: "enemyEarthEscape", baseChance: 75, guardOnFailure: 12 }],
      },
      {
        id: "goldStoneBurst", nameKey: "skill.qingyi.goldStoneBurst", type: "attack", chance: 20, manaCost: 2, intentUnknownDamage: true,
        chanceModifiers: [{ source: "playerQi", perPoint: 4 }],
        effects: [{ type: "shatterDefensesDamage" }],
      },
      {
        id: "palmThunderPlus", nameKey: "skill.qingyi.palmThunderPlus", type: "attack", chance: 40, manaCost: 1,
        chanceModifiers: [{ source: "playerHasStatus", status: "stun", amount: -40 }],
        effects: [{ type: "damage", amount: 16, statusOnHit: { status: "stun", stacks: 1, chance: 35 } }],
      },
      { id: "adaptiveTalisman", nameKey: "skill.qingyi.adaptiveTalisman", type: "support", chance: 100, adaptiveTalismanIntent: true, effects: [{ type: "adaptiveSelfTalisman" }] },
    ],
  },
  pursuerSword: {
    id: "pursuerSword", nameKey: "enemy.pursuerSword.name", descKey: "enemy.pursuerSword.desc", art: "./assets/images/pursuer.svg", artScale: 1,
    grade: "C", humanoid: true, maxHp: 65, hpRange: [60, 70], maxMana: 2, sense: 7, speed: 3, speedRange: [3, 4], evasion: 3, resist: {},
    startingStatuses: { swordIntentGourd: 1 },
    drops: [
      { currency: "stones", min: 20, max: 30, chance: 100 },
      { itemId: "refiningPill", min: 1, max: 1, chance: 5 },
      { itemPool: SWORD_MANUAL_DROP_POOL, min: 1, max: 1, chance: 15 },
      { itemId: "swordTalisman", min: 1, max: 1, chance: 5 },
    ],
    skills: [
      { id: "guard", nameKey: "skill.pursuer.guard", type: "defense", chance: 50, manaCost: 1, chanceModifiers: [{ source: "selfStatus", status: "swordIntent", perStack: -5 }], effects: [{ type: "gainQi", amount: 10, target: "self" }, { type: "addStatus", status: "swordIntent", stacks: 1, chance: 100, target: "self" }] },
      { id: "slash", nameKey: "skill.pursuer.slash", type: "attack", chance: 50, manaCost: 2, swordIntentScaling: true, effects: [{ type: "damage", amount: 10, ignoreGuard: true, statusOnHit: { status: "armorBreak", stacks: 1, chance: 70 } }] },
      {
        id: "myriadSwordPlus", nameKey: "skill.pursuer.myriadSwordPlus", type: "attack", chance: 50, manaCost: 2, swordIntentScaling: true,
        chanceModifiers: [{ source: "selfStatus", status: "swordIntent", perStack: 10 }],
        effects: [{ type: "damage", amount: 2, repeat: 5 }],
      },
      { id: "swordIntent", nameKey: "skill.pursuer.swordIntent", type: "support", chance: 100, effects: [{ type: "addStatus", status: "swordIntent", stacks: 2, chance: 100, target: "self" }] },
    ],
  },
  pursuerElite: {
    id: "pursuerElite", nameKey: "enemy.pursuerElite.name", descKey: "enemy.pursuerElite.desc", art: "./assets/images/pursuer-elite.svg", artScale: 1,
    grade: "B", humanoid: true, maxHp: 95, hpRange: [90, 100], maxMana: 4, sense: 9, speed: 4, speedRange: [4, 5], evasion: 3, resist: {},
    startingStatuses: { swordIntentGourd: 1 },
    drops: [
      { currency: "stones", min: 40, max: 50, chance: 100 },
      { itemId: "refiningPill", min: 1, max: 1, chance: 10 },
      { itemPool: SWORD_MANUAL_DROP_POOL, min: 1, max: 1, chance: 20 },
      { itemPool: SWORD_MANUAL_DROP_POOL, min: 1, max: 1, chance: 10 },
      { itemId: "swordTalisman", min: 1, max: 1, chance: 10 },
    ],
    skills: [
      { id: "guardPlus", nameKey: "skill.pursuerElite.guardPlus", type: "defense", chance: 50, manaCost: 1, chanceModifiers: [{ source: "selfStatus", status: "swordIntent", perStack: -5 }], effects: [{ type: "gainQi", amount: 10, target: "self" }, { type: "addStatus", status: "swordIntent", stacks: 1, chance: 100, target: "self" }] },
      { id: "slashPlus", nameKey: "skill.pursuerElite.slashPlus", type: "attack", chance: 50, manaCost: 2, swordIntentScaling: true, effects: [{ type: "damage", amount: 12, ignoreGuard: true, statusOnHit: { status: "armorBreak", stacks: 2, chance: 80, manaOnSuccess: 1 } }] },
      {
        id: "myriadReturn", nameKey: "skill.pursuerElite.myriadReturn", type: "attack", chance: 30, manaCost: 3, swordIntentScaling: true,
        chanceModifiers: [{ source: "selfStatus", status: "swordIntent", perStack: 10 }],
        effects: [{ type: "damage", amount: 2, repeat: 8 }],
      },
      {
        id: "heartSword", nameKey: "skill.pursuerElite.heartSword", type: "attack", chance: 10, manaCost: 1, swordIntentScaling: true,
        chanceModifiers: [{ source: "selfStatus", status: "swordIntent", perStack: 15 }],
        effects: [{ type: "damage", amount: 15, ignoreQi: true, ignoreGuard: true, statusOnHit: { status: "heartDemon", stacks: 1, chance: 75 } }],
      },
      { id: "swordIntentPlus", nameKey: "skill.pursuerElite.swordIntentPlus", type: "support", chance: 100, effects: [{ type: "addStatus", status: "swordIntent", stacks: 3, chance: 100, target: "self" }] },
    ],
  },
};

for (const enemy of Object.values(ENEMIES)) {
  for (const skill of enemy.skills) skill.skillSfxKey = enemySkillSfxKey(skill);
}

// Select two to six hits from HP at intent decision time. Crossing exactly
// 80/60/40/20% does not upgrade the move until HP falls below the threshold.
export function leftProtectorInchPunchHits(enemy) {
  const maxHp = Math.max(1, Number(enemy?.maxHp) || 1);
  const hp = Math.max(0, Math.min(maxHp, Number(enemy?.hp ?? maxHp)));
  return 2 + [0.8, 0.6, 0.4, 0.2].filter((threshold) => hp < maxHp * threshold).length;
}

export const GRADE_RULES = {
  D: { hiddenIntent: 0, manaRegen: 0 },
  C: { hiddenIntent: 20, manaRegen: 1 },
  B: { hiddenIntent: 40, manaRegen: 2 },
  A: { hiddenIntent: 60, manaRegen: 3 },
};
