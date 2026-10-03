export const RANDOM_EVENT_IDS = Object.freeze(["rift", "corpse", "tablet"]);

// Illustration follows the displayed narrative; short settlement pages are text only.
export const EVENT_SCENES = Object.freeze({
  rift: {
    intro: "rift-intro",
    "event.rift.successNarrative": "rift-fruit",
    "event.rift.failureNarrative": "rift-fall",
  },
  corpse: {
    intro: "corpse-intro", method: "corpse-inspect",
    "event.corpse.probeTrap": "corpse-seal",
    "event.corpse.probeSafeNarrative": "corpse-loot",
    "event.corpse.grabSafeNarrative": "corpse-loot",
    "event.corpse.explosionNarrative": "corpse-blast",
  },
  tablet: {
    intro: "tablet-intro",
    "event.tablet.successNarrative": "tablet-insight",
    "event.tablet.failureNarrative": "tablet-illusion",
  },
  altar: {
    intro: "altar-intro",
    "event.altar.useNarrative": "altar-awaken",
    "event.altar.restResult": "altar-meditate",
  },
  firePit: {
    intro: "fire-pit-intro",
    "event.firePit.silkNarrative": "fire-pit-silk",
    "event.firePit.frostNarrative": "fire-pit-frost",
    "event.firePit.forceSuccessNarrative": "fire-pit-leap",
    "event.firePit.forceFailureNarrative": "fire-pit-fall",
  },
  alchemy: {
    intro: "alchemy-intro",
    "event.alchemy.giveNarrative": "alchemy-pills",
  },
  spiritVein: {
    intro: "vein-intro",
    "event.spiritVein.mineNarrative": "vein-mine",
    "event.spiritVein.restResult": "vein-meditate",
  },
});

export function eventSceneForOverlay(overlay) {
  const scenes = EVENT_SCENES[overlay?.eventId];
  if (!scenes) return null;
  if (overlay?.stage === "result") return scenes[overlay.result?.key] ?? null;
  return scenes[overlay?.stage ?? "intro"] ?? scenes.intro;
}

export const EVENTS = {
  // Random opportunities are one-use-per-chapter and are resolved by EventEngine
  // because their choices/results depend on live player state and RNG.
  rift: {
    id: "rift", random: true, nameKey: "event.rift.name", descKey: "event.rift.desc",
  },
  corpse: {
    id: "corpse", random: true, nameKey: "event.corpse.name", descKey: "event.corpse.desc",
  },
  tablet: {
    id: "tablet", random: true, nameKey: "event.tablet.name", descKey: "event.tablet.desc",
  },

  altar: {
    id: "altar", scripted: true, nameKey: "event.altar.name", descKey: "event.altar.desc",
    choices: [
      { id: "use", labelKey: "event.altar.use", requires: [{ itemId: "bigWolfFang", count: 1 }] },
      { id: "rest", labelKey: "event.altar.rest" },
    ],
  },
  firePit: {
    id: "firePit", scripted: true, nameKey: "event.firePit.name", descKey: "event.firePit.desc",
    choices: [
      { id: "useTool", labelKey: "event.firePit.useSilk" },
      { id: "force", labelKey: "event.firePit.force" },
      { id: "leave", labelKey: "ui.leave" },
    ],
  },
  alchemy: {
    id: "alchemy", scripted: true, nameKey: "event.alchemy.name", descKey: "event.alchemy.desc",
    choices: [
      { id: "give", labelKey: "event.alchemy.give", requires: [{ itemId: "snakeSlough", count: 2 }] },
      { id: "leave", labelKey: "ui.leave" },
    ],
  },
  spiritVein: {
    id: "spiritVein", scripted: true, nameKey: "event.spiritVein.name", descKey: "event.spiritVein.desc",
    choices: [
      { id: "mine", labelKey: "event.spiritVein.mine" },
      { id: "rest", labelKey: "event.spiritVein.rest" },
    ],
  },
};
