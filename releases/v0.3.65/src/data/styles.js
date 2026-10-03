export const STYLES = {
  sword: {
    id: "sword", nameKey: "style.sword.name", descKey: "style.sword.desc",
    hp: 80, mana: 3, sense: 8, evasion: 3,
    deck: [
      "swordControl","swordControl","swordControl","swordControl",
      "swordGuard","swordGuard","swordGuard",
      "swordQiSlash","swordQiSlash",
      "swordIntent","swordIntent",
      "myriadSwords","swordHeartClarity","goldLight","clearWind",
    ],
  },
  law: {
    id: "law", nameKey: "style.law.name", descKey: "style.law.desc",
    hp: 55, mana: 5, sense: 9, evasion: 1,
    deck: [
      "goldLight",
      "palmThunder","palmThunder",
      "clearWind",
      "greenWood","greenWood",
      "frostSpell",
      "waterDragon","waterDragon",
      "fireball",
      "karmaFire","karmaFire",
      "earthEscape",
      "stoneScreen","stoneScreen",
      "qiEating",
    ],
  },
  body: {
    id: "body", nameKey: "style.body.name", descKey: "style.body.desc",
    hp: 95, mana: 2, sense: 7, evasion: 7,
    deck: [
      "inchPunch","inchPunch","inchPunch","inchPunch",
      "shadowKick","shadowKick","shadowKick","shadowKick",
      "bodyTemper","bodyTemper","bodyTemper",
      "mountainForce","mountainForce",
      "gatherQi",
    ],
  },
  scatter: {
    id: "scatter", nameKey: "style.scatter.name", descKey: "style.scatter.desc",
    hp: 70, mana: 3, sense: 8, evasion: 5,
    randomStats: { mana: [3, 4], sense: [6, 9], budget: 290 },
    randomDeck: {
      swordPanels: [
        { weight: 50, cards: ["swordControl","swordControl","swordControl","swordGuard","swordGuard","swordQiSlash"] },
        { weight: 25, cards: ["swordControl","swordControl","swordControl","swordGuard","swordQiSlash","swordQiSlash"] },
        { weight: 25, cards: ["swordControl","swordControl","swordGuard","swordGuard","swordQiSlash","swordQiSlash"] },
      ],
      lawBasics: ["palmThunder","greenWood","waterDragon","karmaFire","stoneScreen"],
      commonSpells: ["goldLight","clearWind","frostSpell","fireball","earthEscape","qiEating"],
      bodyPanels: [
        { weight: 50, cards: ["inchPunch","inchPunch","shadowKick","shadowKick","bodyTemper","mountainForce"] },
        { weight: 25, cards: ["inchPunch","inchPunch","inchPunch","shadowKick","bodyTemper","mountainForce"] },
        { weight: 25, cards: ["inchPunch","shadowKick","shadowKick","shadowKick","bodyTemper","mountainForce"] },
      ],
    },
    // Fallback only; createInitialState builds the actual 17-card scatter deck from randomDeck.
    deck: [
      "swordControl","swordControl","swordControl","swordGuard","swordGuard","swordQiSlash",
      "goldLight","palmThunder","clearWind","greenWood","frostSpell",
      "inchPunch","inchPunch","shadowKick","shadowKick","bodyTemper","mountainForce",
    ],
  },
};
