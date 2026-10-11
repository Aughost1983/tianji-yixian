import { combatAnimationStyle } from "../core/combat-visuals.js?v=v0.3.89";
import { cardContentCycleElapsed } from "../core/card-visuals.js?v=v0.3.89";
import { CARDS, CARD_UPGRADES } from "../data/cards.js?v=v0.3.89";
import { STYLES } from "../data/styles.js?v=v0.3.89";
import { ARTIFACTS } from "../data/artifacts.js?v=v0.3.89";
import { ITEMS } from "../data/items.js?v=v0.3.89";
import { ENEMIES } from "../data/enemies.js?v=v0.3.89";
import { TRANSLATIONS } from "../data/translations.js?v=v0.3.89";
import { intentDetailForName } from "../data/intent-details.js?v=v0.3.89";
import { EVENTS, eventSceneForOverlay } from "../data/events-data.js?v=v0.3.89";
import { MAP_NODES } from "../data/map-data.js?v=v0.3.89";
import { burnTurnEndChances, entangleSkipChance, getStatus, getDarkForceInstances, heartDemonTriggerChance, orderedBuffKeys, gatherQiHpGain, POSITIVE_STATUSES } from "../core/status.js?v=v0.3.89";
import { ensureArtifactCollections, ensureInventoryOrder, isArtifactEquipped, senseCapacityLimits, sealedCardCount, artifactSlotUnlockSense } from "../core/state.js?v=v0.3.89";
import { harmonizeSenseRemaining } from "../core/rest.js?v=v0.3.89";
import { completionRecord, highestAdvancedSkills, countDeckComposition, COMPLETION_ADVANCED_IDS, COMPLETION_ARTIFACT_IDS } from "../core/run-records.js?v=v0.3.89";

import { GAME_VERSION } from "../core/version.js?v=v0.3.89";

export function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

function multilineEsc(value) {
  return esc(value).replace(/\n/g, "<br>");
}

function openingStoryHtml(value) {
  let html = esc(value);
  for (const word of ["某样", "狭缝", "something", "narrow cleft", "何か", "狭い裂け目"]) html = html.split(word).join(`<span class="opening-story-highlight">${word}</span>`);
  return html.split(/\n\n/g).map((paragraph) => paragraph.replace(/\n/g, "<br>")).join('<span class="opening-story-blank" aria-hidden="true"></span>');
}

const OPENING_SCENE_FILES = Object.freeze([
  "opening-01-pursuit.svg", "opening-02-mountain.svg", "opening-03-cleft.svg",
  "opening-04-mark.svg", "opening-05-found.svg",
]);

function spiritStoneNameHtml(app) {
  return `<span class="item-name-spirit-stone">${esc(app.i18n.t(ITEMS.spiritStone.nameKey))}</span>`;
}

function itemNameColorClass(itemId, item = ITEMS[itemId]) {
  if (!item) return "";
  if (item?.nameColorClass) return item.nameColorClass;
  const rarity = Math.max(0, Math.floor(Number(item.rarity) || 0));
  return rarity >= 1 && rarity <= 5 ? `item-name-rarity-${rarity}` : "";
}

function itemNameHtml(app, itemId) {
  const item = ITEMS[itemId];
  const name = esc(app.i18n.t(item?.nameKey ?? ""));
  if (itemId === "spiritStone") return `<span class="item-name-spirit-stone">${name}</span>`;
  if (itemId === "refiningPill") return `<span class="item-name-refining-pill">${name}</span>`;
  const colorClass = itemNameColorClass(itemId, item);
  if (colorClass?.startsWith("artifact-name-")) {
    return `<span class="artifact-name ${colorClass}">${name}</span>`;
  }
  return colorClass ? `<span class="${colorClass}">${name}</span>` : name;
}

function artifactNameHtml(app, artifactId) {
  const artifact = ARTIFACTS[artifactId];
  if (!artifact) return "";
  return `<span class="artifact-name ${artifact.colorClass ?? "artifact-name-default"}">${esc(app.i18n.t(artifact.nameKey))}</span>`;
}

function catalogIconHtml(kind, id, className = "catalog-entry-icon") {
  const folder = kind === "artifact" ? "artifacts" : "items";
  const src = kind === "item" && ITEMS[id]?.iconPath ? ITEMS[id].iconPath : `./assets/icons/${folder}/${id}.svg`;
  return `<img class="${className}" src="${esc(src)}" alt="" aria-hidden="true" />`;
}

function catalogEntryContent(kind, id, titleHtml, descriptionHtml, iconClassName = "catalog-entry-icon", descriptionClassName = "") {
  const smallClass = descriptionClassName ? ` class="${descriptionClassName}"` : "";
  return `${catalogIconHtml(kind, id, iconClassName)}<span class="catalog-entry-copy"><strong>${titleHtml}</strong><small${smallClass}>${descriptionHtml}</small></span>`;
}

function merchantEntryContent(kind, id, titleHtml, descriptionHtml, marqueeKey) {
  return `${catalogIconHtml(kind, id)}<span class="catalog-entry-copy merchant-entry-copy">
    <span class="merchant-text-window merchant-name-window" data-merchant-marquee="${esc(`${marqueeKey}:name`)}"><strong class="merchant-text-track">${titleHtml}</strong></span>
    <span class="merchant-text-window merchant-desc-window" data-merchant-marquee="${esc(`${marqueeKey}:desc`)}"><small class="merchant-text-track">${descriptionHtml}</small></span>
  </span>`;
}

function inventoryEntryContent(kind, id, titleHtml, descriptionHtml, marqueeKey) {
  return `${catalogIconHtml(kind, id)}<span class="catalog-entry-copy inventory-entry-copy">
    <span class="merchant-text-window inventory-name-window" data-merchant-marquee="${esc(`${marqueeKey}:name`)}"><strong class="merchant-text-track">${titleHtml}</strong></span>
    <span class="merchant-text-window inventory-desc-window" data-merchant-marquee="${esc(`${marqueeKey}:desc`)}"><small class="merchant-text-track">${descriptionHtml}</small></span>
  </span>`;
}

function merchantTradePromptHtml(app, mode, kind, id, price) {
  const currencyToken = "__MERCHANT_CURRENCY__";
  const itemToken = "__MERCHANT_ITEM__";
  const priceToken = "__MERCHANT_PRICE__";
  const def = kind === "artifact" ? ARTIFACTS[id] : ITEMS[id];
  const plainName = app.i18n.t(def?.nameKey ?? "");
  const localized = app.i18n.t(`shop.${mode}ConfirmPrompt`, {
    currency: currencyToken,
    price: priceToken,
    item: itemToken,
  });
  const nameHtml = kind === "artifact" ? artifactNameHtml(app, id) : itemNameHtml(app, id);
  return esc(localized)
    .replace(currencyToken, spiritStoneNameHtml(app))
    .replace(priceToken, `<span class="merchant-confirm-price">${esc(price)}</span>`)
    .replace(itemToken, nameHtml || esc(plainName));
}

function merchantSellQuantityButtonHtml(app, itemId, used, remaining) {
  const itemToken = "__MERCHANT_SELL_ITEM__";
  const localized = app.i18n.t("shop.sellQuantityButton", { item: itemToken, used, remaining });
  return esc(localized).replace(itemToken, itemNameHtml(app, itemId));
}

function previewArtCycleStyle(app) {
  // Keep the six-second cycle's phase through full confirmation rerenders.
  const elapsed = cardContentCycleElapsed(app.previewCardArtStartedAt);
  return ` style="--mind-sea-art-delay:-${elapsed}ms"`;
}

function merchantManualPreviewHtml(app, itemId) {
  const item = ITEMS[itemId];
  if (!item) return "";
  if (item.learnCardId && CARDS[item.learnCardId]) {
    return `<div class="merchant-manual-preview">
      ${catalogIconHtml("item", itemId, "merchant-confirm-icon")}
      <div class="merchant-confirm-card">${restRefinePreviewCardHtml(app, { uid: `merchant-${itemId}`, cardId: item.learnCardId, upgraded: false }, "after")}</div>
    </div>`;
  }
  const preview = item.previewKey ? app.i18n.t(item.previewKey) : app.i18n.t(item.descKey ?? "");
  return `<div class="merchant-manual-preview">
    ${catalogIconHtml("item", itemId, "merchant-confirm-icon")}
    <div class="merchant-confirm-card"><article class="card mind-sea-card rest-refine-preview-card merchant-manual-preview-card"${previewArtCycleStyle(app)} aria-label="${esc(app.i18n.t(item.nameKey))}">
      <span class="type">${esc(app.i18n.t("shop.manualPreviewType"))}</span>
      <img class="card-action-art preview-action-art" src="./assets/icons/items/${esc(itemId)}.svg" alt="" draggable="false" aria-hidden="true">
      <strong class="card-name">${itemNameHtml(app, itemId)}</strong>
      ${cardDescriptionWindowHtml(esc(preview), `card:preview:merchant-special:${itemId}:desc`)}
    </article></div>
  </div>`;
}

function merchantTradePreviewHtml(app, kind, id) {
  const item = kind === "item" ? ITEMS[id] : null;
  // Grade-5 cultivation fragments have no card face. Their trade confirmation
  // follows ordinary items: one large icon plus the item's own small description.
  if (item?.type === "manual" && item.rarity !== 5) return merchantManualPreviewHtml(app, id);
  return `<div class="merchant-confirm-icon-wrap">${catalogIconHtml(kind, id, "merchant-confirm-icon")}</div>`;
}

function merchantTradeDescriptionHtml(app, kind, id) {
  const def = kind === "artifact" ? ARTIFACTS[id] : ITEMS[id];
  if (!def || (kind === "item" && def.type === "manual" && def.rarity !== 5)) return "";
  const descriptionKey = def.shopDescKey ?? def.descKey ?? "";
  const description = descriptionKey ? app.i18n.t(descriptionKey) : "";
  if (!description) return "";
  return `<div class="merchant-trade-confirm-description">
    <span>${esc(description)}</span>
    <span class="merchant-trade-confirm-description-gap" aria-hidden="true">&nbsp;</span>
  </div>`;
}

const SPECIAL_SKILL_FLASH_BY_CARD_ID = Object.freeze({
  "swordHeartClarity": "pale-gold",
  "kuiThunder": "lightning",
  "swordGod": "pale-gold",
  "yinWaterThunder": "lightning",
  "sweetRain": "grass",
  "wildfire": "fire",
  "nirvanaSpell": "fire",
  "metalStoneBurst": "pale-gold",
  "qianKunOneQi": "prismatic",
  "gatherQi": "cyan",
  "ironBone": "cyan",
  "fiveThunderHeartPalm": "lightning",
  "humanSwordUnity": "gold",
  "fiveElementsSword": "prismatic",
  "flameIgnitionArt": "fire",
  "diamondBody": "pale-gold",
  "coldThunderSword": "lightning",
  "thunderSeal": "pale-gold",
  "samadhiWind": "grass",
  "redDragonBreath": "fire",
  "rockFinger": "gold",
  "devouringHeaven": "cyan",
});

function skillNameColorClass(displayName, cardId = "") {
  const flashTheme = SPECIAL_SKILL_FLASH_BY_CARD_ID[cardId];
  if (flashTheme) return `skill-name-special skill-name-flash-${flashTheme}`;
  const name = String(displayName ?? "");
  if (name.endsWith("++")) return "skill-name-plus-plus";
  if (name.endsWith("+")) return "skill-name-plus";
  return "skill-name-base";
}

export function cardDisplayName(app, card, upgraded = false) {
  if (!card) return "";
  return `${app.i18n.t(card.nameKey)}${upgraded ? "+" : ""}`;
}

function cardNameHtml(app, card, upgraded = false) {
  const displayName = cardDisplayName(app, card, upgraded);
  if (!displayName) return "";
  if (card?.id === "heartDemonCard") return esc(displayName);
  const colorClass = skillNameColorClass(displayName, card.id);
  const glintText = colorClass.includes("skill-name-special") ? ` data-skill-name="${esc(displayName)}"` : "";
  return `<span class="skill-name ${colorClass}"${glintText}>${esc(displayName)}</span>`;
}

function cardNameWindowHtml(app, card, inst, marqueeKey) {
  return `<span class="merchant-text-window card-name-window" data-merchant-marquee="${esc(marqueeKey)}"><strong class="card-name merchant-text-track">${cardNameHtml(app, card, inst?.upgraded)}</strong></span>`;
}

function cardDescriptionWindowHtml(description, marqueeKey) {
  return `<span class="desc" data-vertical-marquee="${esc(marqueeKey)}"><span class="desc-track vertical-text-track">${description}</span></span>`;
}

function richSkillPromptHtml(app, value) {
  let html = esc(value);
  const names = [];
  for (const card of Object.values(CARDS)) {
    if (!card || card.id === "heartDemonCard") continue;
    const base = app.i18n.t(card.nameKey);
    if (base) names.push({ name: base, cardId: card.id });
    if (card.upgradeDescKey && base) names.push({ name: `${base}+`, cardId: card.id });
  }
  const uniqueNames = [...new Map(names.map((entry) => [entry.name, entry])).values()].sort((a, b) => b.name.length - a.name.length);
  const replacements = [];
  for (const { name, cardId } of uniqueNames) {
    const escapedName = esc(name);
    if (!escapedName || !html.includes(escapedName)) continue;
    const token = `__SKILL_NAME_${replacements.length}__`;
    html = html.split(escapedName).join(token);
    const colorClass = skillNameColorClass(name, cardId);
    const glintText = colorClass.includes("skill-name-special") ? ` data-skill-name="${escapedName}"` : "";
    replacements.push([token, `<span class="skill-name ${colorClass}"${glintText}>${escapedName}</span>`]);
  }
  for (const [token, replacement] of replacements) html = html.split(token).join(replacement);
  return html.replace(/\n/g, "<br>");
}

function richPromptHtml(app, value) {
  let html = esc(value);
  const entities = [
    ...Object.keys(ARTIFACTS).map((id) => ({ name: esc(app.i18n.t(ARTIFACTS[id].nameKey)), html: artifactNameHtml(app, id) })),
    ...Object.keys(ITEMS).map((id) => ({ name: esc(app.i18n.t(ITEMS[id].nameKey)), html: itemNameHtml(app, id) })),
  ].filter((entry) => entry.name).sort((a, b) => b.name.length - a.name.length);
  // Match original text once: a short name must not recolor the HTML
  // already inserted for Superior Spirit Stone / Superior Spirit Jade.
  const byName = new Map(entities.map((entry) => [entry.name, entry.html]));
  const pattern = new RegExp(entities.map((entry) => entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  if (entities.length) html = html.replace(pattern, (name) => byName.get(name));
  return html.replace(/\n/g, "<br>");
}

function resolveLogParam(app, value) {
  if (value && typeof value === "object" && value.i18nKey) {
    const suffix = value.suffixKey ? app.i18n.t(value.suffixKey) : (value.suffix ?? "");
    return `${app.i18n.t(value.i18nKey)}${suffix}`;
  }
  return value;
}

function combatLogLine(app, entry) {
  if (typeof entry === "string") return esc(entry);
  if (!entry?.key) return "";
  const params = Object.fromEntries(Object.entries(entry.params ?? {}).map(([key, value]) => [key, resolveLogParam(app, value)]));
  const text = esc(app.i18n.t(entry.key, params));
  return entry.key === "combat.log.roundStart" ? `<strong class="combat-log-round">${text}</strong>` : text;
}

const SINGLE_STATE_POPUP_STATUSES = new Set([
  "eightDirectionsWard", "hardness", "clearMind", "coldResistance", "steadfast", "heatResistance", "swordDomain",
  "swordIntentGourd", "fiveElementsSecret", "windRaccoonBody",
  "tianGangArmor", "mainCharacterHalo", "lostMind",
]);

function combatUnitInfoKey(unit) {
  if (!unit) return "";
  return unit.kind === "player" ? "player" : String(unit.uid ?? "");
}

function buffTokenHtml(app, { key, labelKey, value, polarity, interactive = false, unitKey = "", instanceIndex = null }) {
  const selected = interactive
    && app.combatStatusInfo?.key === key
    && app.combatStatusInfo?.unitKey === unitKey
    && (instanceIndex === null || Number(app.combatStatusInfo?.instanceIndex) === Number(instanceIndex))
    ? " status-open"
    : "";
  const content = value === null || value === undefined
    ? esc(app.i18n.t(labelKey))
    : `${esc(app.i18n.t(labelKey))} ${value}`;
  if (!interactive) return `<span class="buff-token ${polarity}">${content}</span>`;
  const instanceAttr = instanceIndex === null ? "" : ` data-status-instance="${instanceIndex}"`;
  return `<button type="button" class="buff-token ${polarity}${selected}" data-action="status-info" data-status="${esc(key)}" data-unit-key="${esc(unitKey)}"${instanceAttr} aria-pressed="${selected ? "true" : "false"}">${content}</button>`;
}

function buffTokensHtml(app, unit, { interactive = false, mapInfoInteractive = false } = {}) {
  const unitKey = combatUnitInfoKey(unit);
  return orderedBuffKeys(unit).filter((key) => key !== "mainCharacterHalo").map((key) => {
    if (key === "qi" || key === "guard") {
      return buffTokenHtml(app, { key, labelKey: `ui.${key}`, value: unit[key] ?? 0, polarity: "positive", interactive, unitKey });
    }
    if (key === "darkForce") {
      return getDarkForceInstances(unit).map((instance, instanceIndex) => buffTokenHtml(app, {
        key, labelKey: "status.darkForce", value: instance.stacks, polarity: "negative", interactive, unitKey, instanceIndex,
      })).join("");
    }
    const value = ["swordIntentGourd", "swordDomain", "eightDirectionsWard", "clearMind", "coldResistance", "steadfast", "heatResistance", "hardness", "lostMind", "fiveElementsSecret", "windRaccoonBody", "tianGangArmor"].includes(key) ? null : getStatus(unit, key);
    const polarity = key === "freeze" ? "ice" : (POSITIVE_STATUSES.has(key) ? "positive" : "negative");
    if (mapInfoInteractive && key === "heartDemon") {
      const selected = app.mapInfoKey === "heartDemon" ? " status-open" : "";
      const content = value === null || value === undefined
        ? esc(app.i18n.t(`status.${key}`))
        : `${esc(app.i18n.t(`status.${key}`))} ${value}`;
      return `<button type="button" class="buff-token ${polarity} map-info-trigger${selected}" data-action="map-info" data-info="heartDemon" aria-pressed="${selected ? "true" : "false"}">${content}</button>`;
    }
    return buffTokenHtml(app, { key, labelKey: `status.${key}`, value, polarity, interactive, unitKey });
  }).join("");
}

function combatStatusInfoUnit(app, unitKey) {
  if (unitKey === "player") return app.state?.player ?? null;
  return app.state?.combat?.enemies?.find((enemy) => String(enemy.uid) === String(unitKey)) ?? null;
}

function combatStatusInfoHtml(app, info) {
  const key = typeof info === "string" ? info : info?.key;
  if (!key) return "";
  const unitKey = typeof info === "string" ? "player" : info?.unitKey;
  const unit = combatStatusInfoUnit(app, unitKey) ?? app.state?.player ?? {};
  const labelKey = key === "qi" || key === "guard" ? `ui.${key}` : `status.${key}`;
  let line1 = app.i18n.t(`status.info.${key}.line1`);
  let line2 = app.i18n.t(`status.info.${key}.line2`);
  if (key === "swordDomain") {
    const profile = unit?.combatFlags?.swordDomainProfile ?? { damage: 2, qi: 4, swordIntent: 1 };
    line1 = app.i18n.t("status.info.swordDomain.line1", {
      damage: localizedStatPhrase(app, profile.damage, "domainHp"),
      qi: localizedStatPhrase(app, profile.qi, "domainQi"),
      intent: localizedStatPhrase(app, profile.swordIntent, "domainIntent"),
    });
    line2 = app.i18n.t("status.info.swordDomain.line2");
  }
  if (key === "burn") {
    const { downChance, upChance } = burnTurnEndChances(unit);
    line1 = app.i18n.t("status.info.burn.line1");
    line2 = app.i18n.t("status.info.burn.line2", { downChance, upChance });
  }
  if (key === "undying") {
    const stacks = Math.max(0, Math.floor(getStatus(unit, "undying")));
    const hp = Math.floor((unit?.maxHp ?? 0) * stacks * 0.04);
    const qi = stacks * 4;
    line1 = app.i18n.t("status.info.undying.line1", { hp, qi });
    line2 = "";
  }
  if (key === "darkForce") {
    const index = Math.max(0, Math.floor(Number(info?.instanceIndex) || 0));
    const instance = getDarkForceInstances(unit)[index] ?? getDarkForceInstances(unit)[0] ?? { damage: 0 };
    line1 = app.i18n.t("status.info.darkForce.line1");
    line2 = app.i18n.t("status.info.darkForce.line2", { damage: Math.max(0, Math.floor(instance.damage ?? 0)) });
  }
  if (key === "nirvana") {
    line1 = app.i18n.t("status.info.nirvana.line1");
    line2 = app.i18n.t("status.info.nirvana.line2");
  }
  if (key === "barrier") {
    const stacks = Math.max(0, Math.floor(getStatus(unit, "barrier")));
    line1 = app.i18n.t("status.info.barrier.line1", { guard: stacks * 18 });
    line2 = app.i18n.t("status.info.barrier.line2");
  }
  if (key === "healing") {
    const stacks = Math.max(0, Math.floor(getStatus(unit, "healing")));
    const hp = Math.ceil(Math.max(0, Math.floor(unit?.maxHp ?? 0)) * stacks * 0.04);
    line1 = app.i18n.t("status.info.healing.line1", { hp });
    line2 = app.i18n.t("status.info.healing.line2");
  }
  if (key === "reflection") {
    const stacks = Math.max(0, Math.floor(getStatus(unit, "reflection")));
    line1 = app.i18n.t("status.info.reflection.line1", { percent: stacks * 5 });
    line2 = app.i18n.t("status.info.reflection.line2");
  }
  if (key === "concentration") {
    const stacks = Math.max(0, Math.floor(getStatus(unit, "concentration")));
    line1 = app.i18n.t("status.info.concentration.line1", { sense: stacks });
    line2 = app.i18n.t("status.info.concentration.line2");
  }
  if (key === "windRaccoonBody") {
    const hp = Math.max(0, Math.floor(unit?.mana ?? 0)) * 5;
    line1 = app.i18n.t("status.info.windRaccoonBody.line1", { hp });
    line2 = app.i18n.t("status.info.windRaccoonBody.line2");
  }
  if (key === "tianGangArmor") {
    const qi = 1 + Math.ceil(Math.max(0, Math.floor(unit?.sense ?? 0)) * 0.5);
    line1 = app.i18n.t("status.info.tianGangArmor.line1", { qi });
    line2 = app.i18n.t("status.info.tianGangArmor.line2");
  }
  if (key === "entangle") {
    const stacks = Math.max(0, Math.floor(getStatus(unit, "entangle")));
    line1 = app.i18n.t("status.info.entangle.line1", { skipChance: entangleSkipChance(stacks) });
    line2 = app.i18n.t("status.info.entangle.line2");
  }
  if (key === "petrify") {
    const stacks = Math.max(0, Math.floor(getStatus(unit, "petrify")));
    line1 = app.i18n.t("status.info.petrify.line1", { guard: stacks * 4 });
    line2 = app.i18n.t("status.info.petrify.line2");
  }
  return `<div class="combat-status-info">
    <strong>【${esc(app.i18n.t(labelKey))}】</strong>
    <span>${esc(line1)}</span>
    ${line2 ? `<span>${esc(line2)}</span>` : ""}
  </div>`;
}

function resourcePopupHtml(app, unit, resource, extraClass = "", fxTarget = "") {
  const popup = app.getResourcePopup?.(unit, resource);
  if (!popup) return "";
  const tone = resource === "hp" && (popup.delta > 0 || popup.showZeroAsGain) ? "gain" : popup.delta === 0 ? "zero" : resource;
  // Combat renders may legitimately rebuild the HUD while a Mana/Sense popup is
  // still alive. Resume the CSS animation from its real elapsed time instead of
  // restarting at frame 0, which previously made one +/-Mana event look like it
  // happened multiple times (especially around Mixed Orb artifact flashes).
  const duration = Math.max(1, Math.floor(popup.duration ?? 560));
  const elapsed = Math.max(0, Math.min(duration, Date.now() - (popup.createdAt ?? Date.now())));
  const style = `animation-duration:${duration}ms;animation-delay:-${elapsed}ms;`;
  const popupClass = popup.popupClass ? ` ${esc(popup.popupClass)}` : "";
  const anchor = fxTarget ? ` data-combat-fx-target="${esc(fxTarget)}" data-combat-fx-x="0.8" data-combat-fx-kind="resource"` : "";
  return `<span class="resource-pop ${tone} ${extraClass}${popupClass}" style="${style}"${anchor} aria-hidden="true">${esc(popup.text)}</span>`;
}

function statusPopupHtml(app, unit, fxTarget = "") {
  // Passive / binary statuses never communicate a meaningful numeric layer.
  return (app.getStatusPopups?.(unit) ?? []).map((popup) => {
    const tone = !popup.applied ? "resisted"
      : popup.status === "freeze" ? "ice"
        : POSITIVE_STATUSES.has(popup.status) ? "positive" : "negative";
    const duration = Math.max(1, Math.floor(popup.duration ?? 560));
    const delay = Math.max(-duration, popup.createdAt - Date.now());
    const labelKey = popup.status === "qi" || popup.status === "guard" ? `ui.${popup.status}` : `status.${popup.status}`;
    const text = popup.applied
      ? `${app.i18n.t(labelKey)}${SINGLE_STATE_POPUP_STATUSES.has(popup.status) ? "" : `+${Math.max(1, Math.floor(popup.stackCount ?? 1))}`}`
      : app.i18n.t("combat.statusResistPopup");
    const anchor = fxTarget ? ` data-combat-fx-target="${esc(fxTarget)}" data-combat-fx-x="0.5" data-combat-fx-kind="status"` : "";
    const audioId = popup.id != null ? ` data-status-popup-id="${esc(popup.id)}"` : "";
    return `<span class="resource-pop status-effect-popup ${tone}" style="animation-duration:${duration}ms;animation-delay:${delay}ms;"${anchor}${audioId} aria-hidden="true">${esc(text)}</span>`;
  }).join("");
}

// Combat popups are direct children of one stage-level layer. Resource bars
// supply stable anchors only; their owning cards never change stacking order.
export function combatFxLayerHtml(app, enemies = app.state?.combat?.enemies ?? []) {
  const units = [app.state.player, ...enemies];
  const popups = units.map((unit) => {
    const unitKey = unit.kind === "player" ? "player" : unit.uid;
    const resources = unit.kind === "player" ? ["hp", "mana", "sense"] : ["hp"];
    return resources.map((resource) => resourcePopupHtml(app, unit, resource,
      unit.kind === "player" ? "player-resource-pop" : "enemy-resource-pop", `${unitKey}:${resource}`)).join("")
      + statusPopupHtml(app, unit, `${unitKey}:hp`);
  }).join("");
  return `<div class="combat-fx-layer" aria-hidden="true">${popups}</div>`;
}

function resourceBarHtml(app, { key, value, max, unit = null, extraClass = "", popupClass = "", infoKey = null }) {
  const safeMax = Math.max(1, Number(max) || 1);
  const safeValue = Math.max(0, Number(app.getPresentedResourceValue?.(unit, key, value) ?? value) || 0);
  const percent = Math.max(0, Math.min(100, (safeValue / safeMax) * 100));
  const flashClass = unit && app.isResourceFlashing?.(unit, key) ? "resource-recover-flash" : "";
  const infoAttrs = infoKey ? ` data-action="map-info" data-info="${esc(infoKey)}"` : "";
  const infoClass = infoKey ? " map-info-trigger" : "";
  const inCombat = app.state?.screen === "combat";
  const unitKey = unit?.kind === "player" ? "player" : unit?.uid;
  const anchor = inCombat && unitKey ? ` data-combat-resource="${esc(`${unitKey}:${key}`)}"` : "";
  const critical = key === "hp" && Number(max) > 0 && safeValue < safeMax * .20;
  // A zero-HP bar keeps its cracks, but no longer advertises a living low-HP pulse.
  const criticalClass = critical ? ` hp-critical${safeValue === 0 ? " hp-zero" : ""}` : "";
  const criticalPhase = critical ? ` style="--hp-critical-delay:-${((Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - (app.hpCriticalVisualEpoch ?? 0))) % 3200).toFixed(3)}ms;"` : "";
  return `<div class="resource-bar ${key} ${extraClass} ${flashClass}${infoClass}${criticalClass}"${infoAttrs} role="progressbar" aria-valuemin="0" aria-valuemax="${safeMax}" aria-valuenow="${safeValue}"${anchor}${criticalPhase}>
    <span class="resource-track" aria-hidden="true"><span class="resource-fill" style="width:${percent.toFixed(2)}%"></span></span>
    <span class="resource-text">${esc(app.i18n.t(`ui.${key}`))} ${safeValue}/${safeMax}</span>
    ${unit && !inCombat ? resourcePopupHtml(app, unit, key, popupClass) : ""}
  </div>`;
}

export function playerResourceTrackWeights(player) {
  const hpWeight = Math.max(0, Number(player?.maxHp) || 0);
  const manaWeight = Math.max(0, Number(player?.maxMana) || 0) * 10;
  const senseWeight = Math.max(0, Number(player?.maxSense) || 0) * 5;
  const totalWeight = hpWeight + manaWeight + senseWeight;
  return totalWeight > 0
    ? { hp: hpWeight, mana: manaWeight, sense: senseWeight, total: totalWeight }
    : { hp: 2, mana: 1, sense: 1, total: 4 };
}

function playerResourceGridStyle(player) {
  const weights = playerResourceTrackWeights(player);
  return `--player-hp-track:${weights.hp}fr;--player-mana-track:${weights.mana}fr;--player-sense-track:${weights.sense}fr`;
}

export function toChineseNormalNumber(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  const digits = ["零","一","二","三","四","五","六","七","八","九"];
  if (n < 10) return digits[n];
  if (n < 20) return `十${n % 10 ? digits[n % 10] : ""}`;
  if (n < 100) return `${digits[Math.floor(n / 10)]}十${n % 10 ? digits[n % 10] : ""}`;
  return String(n);
}


function pathRayRand(pathSeed, index, salt) {
  // Stable FNV-1a-style hash: same path/index/salt => same 0..1 value across
  // full DOM rebuilds, while different paths get genuinely different layouts.
  const input = `${pathSeed}|${index}|${salt}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function eventBackdropNodeId(app) {
  const map = app.state?.map;
  const destination = MAP_NODES[map?.currentNodeId];
  if (app.state?.screen !== "event" || !["event", "fixedEvent", "spirit"].includes(destination?.type)) return null;
  const sourceId = map.history?.at(-1);
  const source = MAP_NODES[sourceId];
  // Keep the previous layer visible only for a real forward move into this event.
  return source && app.map?.nextNodes?.(source).includes(destination.id) ? sourceId : null;
}

function currentLocationNode(app) {
  if (!app.state) return null;
  const visualNodeId = app.battleTransitionStage && app.mapBattleTransitionSourceNodeId
    ? app.mapBattleTransitionSourceNodeId
    : eventBackdropNodeId(app) ?? app.state.map?.currentNodeId;
  return MAP_NODES[visualNodeId] ?? null;
}

function currentLocationLabel(app) {
  const node = currentLocationNode(app);
  if (!node) return app.i18n.t("app.title");
  if (node.layer === 0) return app.i18n.t("location.caveOutside");
  const layer = app.i18n.language === "zh-CN" ? toChineseNormalNumber(node.layer) : node.layer;
  return app.i18n.t("location.caveLayer", { layer });
}

function currentLocationHtml(app) {
  const node = currentLocationNode(app);
  if (!node || node.layer <= 0) {
    app.locationCycleLayer = null;
    return `<div class="brand">${esc(currentLocationLabel(app))}</div>`;
  }
  if (app.locationCycleLayer !== node.layer) {
    app.locationCycleLayer = node.layer;
    app.locationCycleEpoch = Date.now();
  }
  const delay = -((Date.now() - app.locationCycleEpoch) % 10000);
  const layer = app.i18n.language === "zh-CN" ? toChineseNormalNumber(node.layer) : node.layer;
  return `<div class="brand location-cycle" aria-label="${esc(currentLocationLabel(app))}" style="--location-cycle-delay:${delay}ms">
    <span class="location-cycle-name" aria-hidden="true">${esc(app.i18n.t("location.caveOutside"))}</span>
    <span class="location-cycle-layer" aria-hidden="true">${esc(app.i18n.t("location.layerOnly", { layer }))}</span>
    <span class="location-cycle-static" aria-hidden="true">${esc(app.i18n.t("location.caveOutside"))} · ${esc(app.i18n.t("location.layerOnly", { layer }))}</span>
  </div>`;
}

export function topbar(app) {
  const state = app.state;
  return `<header class="topbar">
    ${currentLocationHtml(app)}
    <div class="top-actions">
      <select data-action="language" aria-label="${esc(app.i18n.t("ui.language"))}">
        ${["zh-CN","en","ja"].map((l) => `<option value="${l}" ${(state?.language ?? app.i18n.language)===l?"selected":""}>${l}</option>`).join("")}
      </select>
      <button class="icon-btn tutorial-reset" data-action="reset-tutorials" ${app.tutorials?.hasSeenAny?.() ? "" : "disabled"} aria-label="${esc(app.i18n.t("tutorial.reset"))}" title="${esc(app.i18n.t("tutorial.reset"))}">?</button>
      <button type="button" class="icon-btn info-copy" data-action="copy-global-info" ${app.infoCopyInFlight ? "disabled" : ""} aria-label="${esc(app.i18n.t("info.copy"))}" title="${esc(app.i18n.t("info.copy"))}"><img class="info-copy-icon" src="./assets/icons/ui/copy.svg" alt="" draggable="false" aria-hidden="true"></button>
      <button class="icon-btn audio-toggle ${app.audio.volumeLevel === 1 ? "active" : ""}" data-action="toggle-audio" data-volume="${Math.round(app.audio.volumeLevel * 100)}" aria-pressed="${app.audio.enabled ? "true" : "false"}" aria-label="${esc(app.i18n.t("ui.mute"))} ${Math.round(app.audio.volumeLevel * 100)}%" title="${esc(app.i18n.t("ui.mute"))} ${Math.round(app.audio.volumeLevel * 100)}%">♫</button>
    </div>
  </header>`;
}

export function playerPanel(app, { mindSeaButton = false, mapInfoInteractive = false, hideSecondaryRow = false } = {}) {
  const p = app.state.player;
  const info = mapInfoInteractive ? (key) => key : () => null;
  return `<section class="panel player-panel ${hideSecondaryRow ? "compact-player-panel" : ""}">
    <div class="player-resource-row" style="${playerResourceGridStyle(p)}">
      ${resourceBarHtml(app, { key: "hp", value: p.hp, max: p.maxHp, unit: p, popupClass: "player-resource-pop", infoKey: info("hp") })}
      ${resourceBarHtml(app, { key: "mana", value: p.mana, max: p.maxMana, unit: p, popupClass: "player-resource-pop", infoKey: info("mana") })}
      ${resourceBarHtml(app, { key: "sense", value: p.sense, max: p.maxSense, unit: p, popupClass: "player-resource-pop", infoKey: info("sense") })}
    </div>
    ${hideSecondaryRow ? "" : `<div class="resource-row">
      ${buffTokensHtml(app,p, { mapInfoInteractive })}
      <span class="chip pursuit ${mapInfoInteractive ? "map-info-trigger" : ""}" ${mapInfoInteractive ? `data-action="map-info" data-info="pursuit"` : ""}>${app.i18n.t("ui.pursuit")}: ${app.state.map.pursuit}/5</span>
      ${mindSeaButton ? `<button type="button" class="chip mind-sea-toggle ${app.mindSeaOpen ? "active" : ""}" data-action="toggle-mind-sea" aria-pressed="${app.mindSeaOpen ? "true" : "false"}">${esc(app.i18n.t("ui.mindSea"))}</button>` : ""}
    </div>`}
  </section>`;
}

function combatPlayerHud(app) {
  const p = app.state.player;
  const tokens = buffTokensHtml(app, p, { interactive: true });
  const feedback = app.combatFeedback;
  return `<section class="combat-player-hud" aria-label="${esc(app.i18n.t("ui.hp"))}">
    <div class="hud-core" style="${playerResourceGridStyle(p)}">
      ${resourceBarHtml(app, { key: "hp", value: p.hp, max: p.maxHp, unit: p, popupClass: "player-resource-pop" })}
      ${resourceBarHtml(app, { key: "mana", value: p.mana, max: p.maxMana, unit: p, popupClass: "player-resource-pop", extraClass: feedback?.flashMana ? "feedback-flash" : "" })}
      ${resourceBarHtml(app, { key: "sense", value: p.sense, max: p.maxSense, unit: p, popupClass: "player-resource-pop" })}
    </div>
    <div class="hud-tokens ${tokens ? "" : "empty"}" aria-label="buffs">
      ${tokens || `<span class="buff-slot-placeholder" aria-hidden="true"></span>`}
      ${feedback ? `<span class="combat-feedback" role="status">${esc(app.i18n.t(feedback.key))}</span>` : ""}
    </div>
  </section>`;
}

export function tutorialPromptHtml(app) {
  const hint = app.tutorials?.active;
  if (!hint) return "";
  return `<div class="modal-backdrop combat-result-backdrop tutorial-backdrop" data-action="dismiss-tutorial" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <h3 class="modal-title" id="tutorial-title">${esc(app.i18n.t("proper.tianjiPrecepts"))}</h3>
      <div class="combat-loot-title modal-body">${esc(app.i18n.t(hint.bodyKey))}</div>
      <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
    </section>
  </div>`;
}

export function tutorialResetPromptHtml(app) {
  if (!app.tutorialResetNotice) return "";
  return `<div class="modal-backdrop combat-result-backdrop tutorial-backdrop" data-action="dismiss-tutorial-reset" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog tutorial-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-reset-title">
      <h3 class="modal-title" id="tutorial-reset-title">${esc(app.i18n.t("proper.tianjiPrecepts"))}</h3>
      <div class="combat-loot-title modal-body">${esc(app.i18n.t("tutorial.resetDone"))}</div>
      <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
    </section>
  </div>`;
}

export function globalInfoPromptHtml(app) {
  const autosave = app.timedNotice?.kind === "autosave";
  if (!app.infoCopyNotice && !autosave) return "";
  const key = autosave ? "ui.autosaveNotice" : app.infoCopyNotice === "copied" ? "info.copied" : "info.copyFailed";
  const notice = app.timedNotice;
  const closing = notice?.closingAt != null;
  const elapsed = Math.max(0, Date.now() - (closing ? notice.closingAt : notice?.createdAt ?? Date.now()));
  const fade = `animation-delay:-${Math.min(500, elapsed)}ms;${closing ? `--notice-exit-opacity:${notice.closingOpacity ?? 1};` : ""}`;
  return `<div class="modal-backdrop combat-result-backdrop info-copy-backdrop${closing ? " notice-fading-out" : ""}" style="${fade}" data-action="dismiss-global-info" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog info-copy-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t(key))}">
      <div class="combat-loot-title modal-body">${esc(app.i18n.t(key))}</div>
    </section>
  </div>`;
}

export function rewindResultPromptHtml(app) {
  const notice = app.rewindNotices?.[0];
  if (!notice) return "";
  return `<div class="modal-backdrop combat-result-backdrop rewind-result-backdrop" data-action="dismiss-rewind-result" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t(notice.titleKey ?? notice.bodyKey, notice.params))}">
      ${notice.titleKey ? `<h3 class="modal-title">${esc(app.i18n.t(notice.titleKey))}</h3>` : ""}
      <div class="combat-loot-title modal-body">${richPromptHtml(app, app.i18n.t(notice.bodyKey, notice.params))}</div>
      <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
    </section>
  </div>`;
}

export function pursuitResultPromptHtml(app) {
  const result = app.pursuitResults?.active;
  if (!result) return "";
  const delta = result.delta > 0 ? `+${result.delta}` : String(result.delta);
  return `<div class="modal-backdrop combat-result-backdrop merchant-welcome-backdrop merchant-choice-backdrop" data-action="dismiss-pursuit-result" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog merchant-welcome-dialog merchant-choice-dialog event-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("pursuit.result", { delta }))}">
      <p class="modal-body">${richPromptHtml(app, app.i18n.t("pursuit.result", { delta }))}</p>
      <p class="event-result-continue modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
    </section>
  </div>`;
}

export function startView(app) {
  const saved = app.save.loadRun();
  const styleDifficulty = { sword: "★★", body: "★★★", law: "★★★★", scatter: "★★★★★" };
  const difficultyLabel = app.i18n.t("ui.difficulty");
  return `<main class="screen">
    <section class="panel">
      <h1>${esc(app.i18n.t("app.title"))}</h1>
      <p class="muted">${esc(app.i18n.t("app.subtitle"))} · ${GAME_VERSION}</p>
      <label>${esc(app.i18n.t("ui.style"))}<select id="styleSelect">
        ${[STYLES.sword, STYLES.body, STYLES.law, STYLES.scatter].map((s) => `<option value="${s.id}"${app.startRunSelection?.styleId === s.id ? " selected" : ""}>${esc(app.i18n.t(s.nameKey))}（${esc(difficultyLabel)}：${styleDifficulty[s.id] ?? ""}）</option>`).join("")}
      </select></label>
      <br><br>
      <label>${esc(app.i18n.t("ui.seed"))}<input id="seedInput" value="${esc(app.startRunSelection?.seed ?? Date.now().toString().slice(-8))}" /></label>
      <div class="stack" style="margin-top:.8rem">
        <button class="primary" data-action="new-run">${esc(app.i18n.t("ui.newRun"))}</button>
        ${saved ? `<button data-action="continue-run">${esc(app.i18n.t("ui.continue"))}</button>` : ""}
      </div>
    </section>
  </main>${app.restartConfirm && app.newRunConfirm ? restartConfirmPromptHtml(app) : ""}`;
}

export function loadingView(app) {
  const progress = app.resourceLoading;
  const t = (key, params) => app.i18n.t(key, params);
  const detail = progress.total
    ? t("loading.resources", { resource: t(`loading.${progress.category}`), current: progress.completed, total: progress.total })
    : t("loading.check");
  return `<main class="resource-loading-screen" aria-label="${esc(t("loading.title"))}">
    <section class="resource-loading-content">
      <div class="resource-loading-title">${esc(t("loading.title"))}<span class="resource-loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></div>
      <div class="resource-loading-bar" data-resource-progress role="progressbar" aria-label="${esc(t("loading.title"))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}">
        <span class="resource-loading-fill" data-resource-fill style="width:${progress.percent}%"></span>
      </div>
      <div class="resource-loading-detail" data-resource-detail role="status" aria-live="polite">${esc(detail)}</div>
      ${progress.error ? `<div class="resource-loading-error" role="alert">${esc(t("loading.error", { resource: t(`loading.${progress.error.category}`) }))}</div><button type="button" class="resource-loading-retry" data-action="retry-resources">${esc(t("loading.retry"))}</button>` : ""}
    </section>
  </main>`;
}

function artifactDescription(app, id, { combat = false } = {}) {
  const artifact = ARTIFACTS[id];
  if (!artifact) return "";
  if (id === "greenSnakeSword") {
    const cost = combat ? app.combat.getArtifactSenseCost(id) : 1;
    return app.i18n.t(artifact.descKey, { cost });
  }
  return app.i18n.t(artifact.descKey);
}

function artifactPanelDescriptionHtml(app, id, { combat = false } = {}) {
  const description = String(artifactDescription(app, id, { combat }));
  const punctuationPair = /([，。！？；：、,.!?;:])([\u3400-\u9fff]{2})/gu;
  let html = "";
  let cursor = 0;
  for (const match of description.matchAll(punctuationPair)) {
    html += esc(description.slice(cursor, match.index));
    html += `${esc(match[1])}<span class="artifact-post-punctuation-pair">${esc(match[2])}</span>`;
    cursor = match.index + match[0].length;
  }
  return `${html}${esc(description.slice(cursor))}`;
}

function artifactPanel(app, { combat = false } = {}) {
  const p = app.state.player;
  ensureArtifactCollections(p);
  const artifactIds = (p.artifacts ?? []).filter((id) => ARTIFACTS[id] && !ARTIFACTS[id].hidden);
  const keepEmptyPanel = ["map", "combat"].includes(app.state?.screen);
  if (!artifactIds.length && !keepEmptyPanel) return "";
  const selectedId = app.getArtifactInfoId?.();
  const capacityFeedback = app.isArtifactCapacityFeedbackFlashing?.();
  const infoId = !capacityFeedback && artifactIds.includes(selectedId) ? selectedId : null;
  const capacity = senseCapacityLimits(p.maxSense).artifacts;
  const selectedSlot = !capacityFeedback ? app.getArtifactSlotInfoIndex?.() : null;
  const slotSelected = Number.isInteger(selectedSlot) && !artifactIds[selectedSlot];
  const slotInfoText = (index) => index < capacity ? app.i18n.t("artifact.emptySlot")
    : app.i18n.t("artifact.lockedSlot", { sense: artifactSlotUnlockSense(index) });
  const equippedText = app.i18n.t("artifact.equippedCount", { count: artifactIds.length });

  return `<section class="panel artifact-panel ${combat ? "combat-artifact-panel" : "noncombat-artifact-panel"}">
    <div class="artifact-row${artifactIds.length ? "" : " artifact-row-empty"}">
      ${Array.from({ length: 6 }, (_, index) => {
        const id = artifactIds[index];
        if (!id) return `<button type="button" class="artifact artifact-slot-empty${index >= capacity ? " artifact-slot-locked" : ""}${slotSelected && selectedSlot === index ? " artifact-selected" : ""}" data-action="artifact-slot" data-slot="${index}" aria-label="${esc(slotInfoText(index))}" aria-pressed="${slotSelected && selectedSlot === index ? "true" : "false"}">${index >= capacity ? '<span class="artifact-identity"><img class="artifact-icon artifact-lock-icon" src="./assets/icons/ui/artifactLock.svg" alt="" draggable="false" aria-hidden="true"></span>' : ""}</button>`;
        const artifact = ARTIFACTS[id];
        const senseCost = combat ? app.combat.getArtifactSenseCost(id) : (artifact.senseCost ?? 0);
        const enoughSense = (p.sense ?? 0) >= senseCost;
        const canActivate = combat && app.state.combat?.phase === "player" && artifact.active && enoughSense;
        const content = `<span class="artifact-identity">${catalogIconHtml("artifact", id, "artifact-icon")}</span>`;
        const artifactFx = combat && app.isArtifactActionFlashing?.(id) ? " artifact-action" : "";
        return `<button type="button" class="artifact ${canActivate ? "interactive-gold" : ""}${infoId === id ? " artifact-selected" : ""}${artifactFx}" data-artifact-id="${id}" data-action="artifact" data-id="${id}" aria-label="${esc(app.i18n.t(artifact.nameKey))}" aria-pressed="${infoId === id ? "true" : "false"}">${content}</button>`;
      }).join("")}
    </div>
    <div class="artifact-panel-info${infoId ? " artifact-panel-info-description" : ""}" aria-live="polite">
      ${infoId
        ? `<small class="artifact-desc"><span class="artifact-desc-name">${artifactNameHtml(app, infoId)}</span><span class="enemy-buffs artifact-desc-body" data-enemy-buffs="artifact:${esc(app.state?.screen ?? "map")}:${esc(infoId)}"><span class="enemy-buff-track"><span class="artifact-desc-text">${artifactPanelDescriptionHtml(app, infoId, { combat })}</span></span></span></small>`
        : slotSelected ? `<span class="artifact-slot-info">${esc(slotInfoText(selectedSlot))}</span>`
        : `<span class="artifact-capacity-line${capacityFeedback ? " artifact-capacity-feedback" : ""}">${esc(equippedText)}/${capacity}</span>`}
    </div>
  </section>`;
}

function completionRecordOverlay(app) {
  if (!app.completionRecordOpen || (!app.state?.run?.completed && !app.completionRecordPreview)) return "";
  const data = app.completionRecordPreview ?? app.state.run.completionRecord ?? completionRecord(app.state);
  const t = (key, params) => app.i18n.t(key, params);
  const none = esc(t("record.none"));
  const names = (html) => html.length ? html.join(esc(t("record.separator"))) : none;
  // Collection rows share the buff marquee and fixed two-line geometry. The
  // trigger-score winner stays in telemetry solely for future artifact refining.
  const artifactIds = [...new Set(data.artifactIds ?? [])].filter((id) => COMPLETION_ARTIFACT_IDS.includes(id));
  const artifacts = names(artifactIds.map((id) => artifactNameHtml(app, id)));
  const advancedSkills = highestAdvancedSkills(data.advanced);
  const advanced = names(advancedSkills.map(({ cardId, upgraded }) => cardNameHtml(app, CARDS[cardId], upgraded)));
  const deckComposition = data.deckComposition ?? countDeckComposition(app.state.player.deck);
  const collections = {
    artifacts: { ids: artifactIds, total: COMPLETION_ARTIFACT_IDS.length },
    advanced: { ids: advancedSkills.map(({ cardId }) => cardId), total: COMPLETION_ADVANCED_IDS.length },
  };
  const mostUsedList = (Array.isArray(data.mostUsedSkills) ? data.mostUsedSkills
    : data.mostUsed ? [data.mostUsed] : []).filter((skill) => CARDS[skill.cardId]);
  const mostUsed = names(mostUsedList.map((skill) =>
    esc(t("record.skillUses", { name: "__SKILL__", count: skill.count }))
      .replace("__SKILL__", cardNameHtml(app, CARDS[skill.cardId], skill.upgraded))));
  const enemyNames = (data.longestEnemyKeys ?? []).map((key) => esc(t(key))).join(esc(t("record.separator")));
  const longest = data.longestRound
    ? esc(t("record.longestValue", { rounds: data.longestRound, enemies: "__ENEMIES__" })).replace("__ENEMIES__", enemyNames)
    : none;
  const minutes = Math.floor(data.elapsedSeconds / 60);
  const duration = `${String(minutes).padStart(2, "0")}:${String(data.elapsedSeconds % 60).padStart(2, "0")}`;
  const outcome = (key) => esc(t("record.restOutcome", data.restOutcomes?.[key] ?? { success: 0, failure: 0 }));
  const battles = (values) => esc(t("record.battleOutcome", values ?? { wins: 0, escapes: 0, deaths: 0 }));
  const recordTitle = `${t("record.title")} · ${GAME_VERSION}`;
  const rows = [
    ["time", esc(duration)],
    ["style", esc(t(STYLES[data.styleId]?.nameKey ?? STYLES.sword.nameKey))],
    ["cards", esc(t("record.cardsValue", deckComposition))],
    ["artifacts", artifacts],
    ["advanced", advanced],
    ["mostUsed", mostUsed],
    ["battles", battles(data.battleOutcomes)],
    ["pursuitBattles", battles(data.pursuitOutcomes)],
    ["highestPursuit", esc(`${data.highestPursuit}/5`)],
    ["enemiesDefeated", esc(data.enemiesDefeated)],
    ["averageRounds", esc(t("record.averageValue", { rounds: data.averageRounds }))],
    ["fastest", data.fastestRound ? esc(t("record.roundValue", { rounds: data.fastestRound })) : none],
    ["longest", longest],
    ["highestTurnDamage", esc(data.highestTurnDamage)],
    ["highestRoundDamage", esc(data.highestRoundDamage)],
    ["damageTaken", esc(data.damageTaken)],
    ["deaths", esc(t("record.countValue", { count: data.deaths }))],
    ["stones", esc(t("record.stonesValue", { gained: data.stonesGained ?? 50, spent: data.stonesSpent ?? 0 }))],
    ["manualStudy", outcome("manualStudy")],
    ["refineBody", outcome("refineBody")],
    ["refineSpirit", outcome("refineSpirit")],
    ["harmonize", outcome("harmonize")],
  ];
  return `<div class="modal-backdrop combat-result-backdrop completion-record-backdrop" data-action="close-completion-record" role="presentation">
    <section class="path-confirm-dialog completion-record-dialog" data-action="completion-record-content" role="dialog" aria-modal="true" aria-label="${esc(recordTitle)}">
      <div class="node-title"><h3 class="modal-title">${esc(recordTitle)}</h3><button type="button" data-action="close-completion-record">${esc(t("ui.close"))}</button></div>
      <div class="completion-record-list">${rows.map(([key, value]) => collections[key]
        ? `<div class="debug-refine-stat-row completion-record-row" data-record-key="${key}">
            <div class="completion-record-advanced-header"><span>${esc(t(`record.${key}`))}</span><strong>${esc(t("record.advancedValue", { count: collections[key].ids.length, total: collections[key].total }))}</strong></div>
            <div class="enemy-buffs completion-record-advanced-names" data-enemy-buffs="record:${key}:${esc(collections[key].ids.join(":"))}"><span class="enemy-buff-track"><span class="completion-record-skill-names">${value}</span></span></div>
          </div>`
        : key === "mostUsed"
          ? `<div class="debug-refine-stat-row completion-record-row" data-record-key="mostUsed"><span>${esc(t("record.mostUsed"))}</span><strong class="enemy-buffs completion-record-most-used-value" data-enemy-buffs="record:mostUsed:${esc(mostUsedList.map((skill) => `${skill.cardId}:${skill.upgraded}:${skill.count}`).join(":"))}"><span class="enemy-buff-track"><span class="completion-record-skill-names">${mostUsed}</span></span></strong></div>`
        : key === "longest"
          ? `<div class="debug-refine-stat-row completion-record-row" data-record-key="longest"><span>${esc(t("record.longest"))}</span><strong class="enemy-buffs completion-record-longest-value" data-enemy-buffs="record:longest:${esc((data.longestEnemyKeys ?? []).join(":"))}"><span class="enemy-buff-track"><span>${value}</span></span></strong></div>`
          : `<div class="debug-refine-stat-row completion-record-row" data-record-key="${key}"><span>${esc(t(`record.${key}`))}</span><strong>${value}</strong></div>`).join("")}</div>
    </section>
  </div>`;
}

export function mapView(app, eventOverlay = "") {
  const s = app.state;
  const transitionSourceId = app.battleTransitionStage && app.mapBattleTransitionSourceNodeId
    ? app.mapBattleTransitionSourceNodeId
    : eventBackdropNodeId(app);
  const node = MAP_NODES[transitionSourceId] ?? MAP_NODES[s.map.currentNodeId];
  const resolved = s.map.resolved[node.id];
  const next = app.map.nextNodes(node);
  const pathEntries = node.directions
    .filter((direction) => direction !== "down")
    .map((direction) => ({ direction, id: app.map.nodeIdFromDirection(node, direction) }))
    .filter(({ id }) => id && MAP_NODES[id] && !s.map.blockedNodes.includes(id));
  const pendingId = s.map.pendingMoveTarget ?? null;
  const pendingNode = pendingId ? MAP_NODES[pendingId] : null;
  const pendingRevealed = pendingNode ? app.map.isPathRevealed(pendingId, node) : false;
  const pendingLabel = pendingNode
    ? (pendingRevealed ? app.i18n.t(`map.type.${pendingNode.type}`) : app.i18n.t("ui.unknown"))
    : "";
  const pendingHintBase = pendingNode && pendingRevealed
    ? app.i18n.t(pendingId === "19B" ? "map.pathHint.gate" : `map.pathHint.${pendingNode.type}`)
    : app.i18n.t("ui.pathConfirmTargetHidden", { type: pendingLabel });
  const pendingNeedsBacktrack = pendingRevealed && (pendingNode?.type === "spirit" || pendingNode?.event === "altar");
  const pendingHint = pendingNeedsBacktrack
    ? `${pendingHintBase.endsWith("……") ? pendingHintBase.slice(0, -1) : pendingHintBase}${app.i18n.t("map.pathHint.backtrackRequired")}`
    : pendingHintBase;
  const pendingTargetText = pendingNode
    ? (app.debug ? `${pendingId} · ${pendingHint}` : pendingHint)
    : "";
  const postBattlePrompt = s.map.postBattlePrompt;
  const pursuitPrompt = app.pursuitResults?.hasWork ? null : s.map.pursuitPrompt;
  const pathRayMotionStartedAt = Number(app.pathRayMotionStartedAt);
  const rayMotionElapsed = Number.isFinite(pathRayMotionStartedAt)
    ? Math.max(0, (performance.now() - pathRayMotionStartedAt) / 1000)
    : 0;

  const mindSeaOpen = Boolean(app.mindSeaOpen);
  const inventoryExpanded = Boolean(app.mapInventoryExpanded);
  const defaultMapInfoKey = (node.layer ?? 0) >= 7 ? "deepDefault" : "default";
  const mapInfoKey = app.mapInfoKey ?? defaultMapInfoKey;
  const manualConfirmItem = app.manualUseConfirm ? ITEMS[app.manualUseConfirm] : null;
  const manualConfirmCard = manualConfirmItem?.type === "manual" ? CARDS[manualConfirmItem.learnCardId] : null;
  const manualPreview = manualConfirmCard ? { uid: "manual-confirm-preview", cardId: manualConfirmItem.learnCardId, upgraded: false } : null;
  const manualSpecialPreview = manualConfirmItem?.type === "manual" && manualConfirmItem.inventoryPreview !== false && manualConfirmItem.previewKey ? app.i18n.t(manualConfirmItem.previewKey) : "";
  const manualInspectable = manualConfirmItem?.type === "manual";
  const manualPrompt = manualConfirmItem?.type === "manual" ? app.i18n.t("manual.confirmPrompt") : "";

  return `<main class="screen map-screen">
    ${artifactPanel(app)}
    ${playerPanel(app, { mindSeaButton: true, mapInfoInteractive: true })}
    ${mindSeaOpen ? mindSeaPanel(app) : inventoryExpanded ? inventoryPanel(app, false, true) : `<section class="panel combat-artifacts">
      ${app.debug ? `<div class="node-title"><h2>${esc(app.i18n.t("ui.layer", {layer:node.layer,col:node.col}))}</h2></div>` : ""}
      <div class="map-info-window" role="status"><div class="map-info-window-text">${multilineEsc(app.i18n.t(`map.info.${mapInfoKey}`))}</div></div>
      ${resolved && node.directions.includes("down") ? `<button class="danger" data-action="backtrack">${esc(app.i18n.t("ui.backtrack"))}</button>` : ""}
      ${resolved && next.length ? `
        <div class="path-grid" style="margin-top:.7rem">
          ${pathEntries.map(({ id, direction }) => {
            const n = MAP_NODES[id];
            const slot = n.col === "A" ? 1 : n.col === "C" ? 3 : 2;
            const revealed = app.map.isPathRevealed(id, node);
            const rayTransition = revealed && app.pathFogClearingTarget === id;
            const rayRevealDuration = 1650;
            const rayRevealStartedAt = Number(app.pathRayRevealStartedAt);
            const rayRevealElapsed = rayTransition && Number.isFinite(rayRevealStartedAt)
              ? Math.max(0, Math.min(rayRevealDuration, Date.now() - rayRevealStartedAt))
              : 0;
            const rayRevealStyle = rayTransition ? ` style="--ray-reveal-delay:-${rayRevealElapsed}ms"` : "";
            const rayType = !revealed
              ? "unknown"
              : ["battle", "boss"].includes(n.type)
                ? "battle"
                : ["event", "fixedEvent"].includes(n.type)
                  ? "event"
                  : ["rest", "spirit"].includes(n.type)
                    ? "vein"
                    : n.type === "shop"
                      ? "shop"
                      : "unknown";
            const raySeed = `${node.id}>${id}`;
            const rayMarkup = `<span class="path-ray-field" aria-hidden="true"${rayRevealStyle}>${Array.from({ length: 36 }, (_, index) => {
              const randAngle = pathRayRand(raySeed, index, "angle");
              const randWidth = pathRayRand(raySeed, index, "width");
              const randOriginX = pathRayRand(raySeed, index, "originX");
              const randOriginY = pathRayRand(raySeed, index, "originY");
              const randOpacity = pathRayRand(raySeed, index, "opacity");
              const randThickness = pathRayRand(raySeed, index, "thickness");
              const randMotion = pathRayRand(raySeed, index, "motion");
              const randDirection = pathRayRand(raySeed, index, "direction");
              const randDuration = pathRayRand(raySeed, index, "duration");
              const randDelay = pathRayRand(raySeed, index, "delay");
              const angle = (-175 + index * 10 + (randAngle - 0.5) * 8).toFixed(2);
              const duration = 3.6 + randDuration * 2.0;
              const initialDelay = 0.02 + randDelay * 0.78;
              const delay = initialDelay - rayMotionElapsed;
              const width = (42 + randWidth * 34).toFixed(2);
              const originX = (-4 + randOriginX * 8).toFixed(2);
              const originY = (-3 + randOriginY * 6).toFixed(2);
              const opacity = 0.20 + randOpacity * 0.27;
              const oLow = Math.max(0.12, opacity * 0.68).toFixed(2);
              const oSoft = Math.max(0.16, opacity * 0.84).toFixed(2);
              const oMid = opacity.toFixed(2);
              const oHigh = Math.min(0.54, opacity * 1.14).toFixed(2);
              const thickness = (1.4 + randThickness * 1.6).toFixed(2);
              const motionIndex = Math.min(3, Math.floor(randMotion * 4));
              const motion = ["path-ray-reach-a", "path-ray-reach-b", "path-ray-reach-c", "path-ray-reach-d"][motionIndex];
              const direction = randDirection < 0.5 ? "alternate" : "alternate-reverse";
              return `<span class="path-ray" style="--ray-angle:${angle}deg;--ray-duration:${duration.toFixed(2)}s;--ray-delay:${delay.toFixed(3)}s;--ray-width:${width}%;--ray-origin-x:${originX}px;--ray-origin-y:${originY}px;--ray-o-low:${oLow};--ray-o-soft:${oSoft};--ray-o-mid:${oMid};--ray-o-high:${oHigh};--ray-thickness:${thickness}px;--ray-motion:${motion};--ray-direction:${direction}"></span>`;
            }).join("")}</span>`;
            return `<div class="path-slot" style="grid-column:${slot}">
              <button class="path-choice path-ray-${rayType} ${rayTransition ? "path-ray-transition" : ""} ${pendingId===id?"selected":""}" data-direction="${direction}" data-action="request-move" data-node="${id}">
                ${rayMarkup}
                ${app.debug ? `<b>${id}</b>` : ""}<span>${revealed ? esc(app.i18n.t(`map.type.${n.type}`)) : esc(app.i18n.t("ui.unknown"))}</span>
              </button>
              <button class="path-scout" data-action="explore-path" data-node="${id}" ${revealed || s.player.sense < app.map.scoutCost(node) ? "disabled" : ""}>
                ${esc(revealed ? app.i18n.t("ui.pathScouted") : app.i18n.t("ui.pathScout", { cost: app.map.scoutCost(node) }))}
              </button>
            </div>`;
          }).join("")}
        </div>
      ` : ""}
      ${s.run.completed ? `<div class="panel completion-panel" style="margin-top:.8rem"><h1>${esc(app.i18n.t("game.clearTitle"))}</h1><p>${esc(app.i18n.t("game.clearBody"))}</p><button type="button" class="primary completion-record-open" data-action="open-completion-record">${esc(app.i18n.t("record.open"))}</button></div>` : ""}
    </section>
    ${inventoryPanel(app)}`}
    ${!mindSeaOpen && !inventoryExpanded ? debugPanel(app) : ""}
    ${node.id === "0B" && !s.map.openingStoryDismissed ? (() => {
      const openingStoryStep = Math.max(1, Math.min(5, Math.floor(s.map.openingStoryStep ?? 1)));
      const openingStoryText = app.i18n.t(`map.story${openingStoryStep}`);
      return `<div class="modal-backdrop combat-result-backdrop merchant-welcome-backdrop opening-story-backdrop" data-action="dismiss-opening-story" role="presentation">
        <section class="path-confirm-dialog combat-result-dialog merchant-welcome-dialog opening-story-dialog" role="dialog" aria-modal="true" aria-label="${esc(openingStoryText)}">
          <img class="merchant-welcome-image event-scene-image opening-scene-image" src="./assets/opening-scenes/${OPENING_SCENE_FILES[openingStoryStep - 1]}" alt="" aria-hidden="true" />
          <div class="opening-story-text">${openingStoryHtml(openingStoryText)}</div>
        </section>
      </div>`;
    })() : ""}
    ${manualInspectable ? `<div class="modal-backdrop rest-refine-confirm-backdrop" data-action="cancel-manual-use" role="presentation">
      <section class="path-confirm-dialog rest-refine-confirm-dialog item-confirm-dialog" role="dialog" aria-modal="true" aria-label="${esc(manualPrompt)}">
        ${manualPreview ? merchantManualPreviewHtml(app, app.manualUseConfirm) : manualSpecialPreview ? `<div class="manual-effect-preview">${esc(manualSpecialPreview)}</div>` : ""}
        <p class="item-confirm-prompt">${esc(manualPrompt)}</p>
      </section>
    </div>` : ""}
    ${app.treasureTokenConfirm ? `<div class="modal-backdrop rest-refine-confirm-backdrop" role="presentation">
      <section class="path-confirm-dialog rest-refine-confirm-dialog item-confirm-dialog treasure-token-confirm-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("item.treasureToken.confirmPrompt"))}">
        <p class="item-confirm-prompt treasure-token-confirm-prompt">${esc(app.i18n.t("item.treasureToken.confirmPrompt"))}</p>
        <div class="confirm-actions rest-refine-confirm-actions">
          <button type="button" data-action="cancel-treasure-token">${esc(app.i18n.t("item.treasureToken.confirmCancel"))}</button>
          <button type="button" class="interactive-gold" data-action="confirm-treasure-token">${esc(app.i18n.t("item.treasureToken.confirmStart"))}</button>
        </div>
      </section>
    </div>` : ""}
    ${pendingNode && !postBattlePrompt && !pursuitPrompt ? `<div class="modal-backdrop" role="presentation">
      <section class="path-confirm-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("ui.pathConfirmTitle"))}">
        <h3 class="modal-title">${esc(app.i18n.t("ui.pathConfirmTitle"))}</h3>
        <p class="path-confirm-target-text">${esc(pendingTargetText)}</p>
        <div class="confirm-actions">
          <button data-action="cancel-move">${esc(app.i18n.t("ui.pathWait"))}</button>
          <button class="primary" data-action="confirm-move">${esc(app.i18n.t("ui.pathForward"))}</button>
        </div>
      </section>
    </div>` : ""}
    ${postBattlePrompt && !pursuitPrompt ? `<div class="modal-backdrop" role="presentation">
      <section class="path-confirm-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("ui.postBattleRestPrompt"))}">
        <h3 class="modal-title">${esc(app.i18n.t("ui.postBattleRestPrompt"))}</h3>
        <div class="confirm-actions">
          <button data-action="post-battle-continue">${esc(app.i18n.t("ui.postBattleContinue"))}</button>
          <button class="primary" data-action="post-battle-rest">${esc(app.i18n.t("ui.postBattleRest"))}</button>
        </div>
      </section>
    </div>` : ""}
    ${pursuitPrompt ? `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-pursuit-prompt" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("pursuit.promptTitle"))}">
        <h3 class="modal-title">${esc(app.i18n.t("pursuit.promptTitle"))}</h3>
        <div class="combat-loot-title modal-body">${esc(app.i18n.t(pursuitPrompt.rookieSquad || pursuitPrompt.encounter === "rookieSquad" ? "pursuit.rookieSquadPromptBody" : "pursuit.promptBody"))}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>` : ""}
    ${s.map.manualLearnResult ? `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-manual-learn" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("manual.learnTitle"))}">
        <h3 class="modal-title">${esc(app.i18n.t("manual.learnTitle"))}</h3>
        <div class="combat-loot-title">${richSkillPromptHtml(app, app.i18n.t("manual.learnBody", {
          type: app.i18n.t(`card.type.${CARDS[s.map.manualLearnResult.cardId]?.type ?? "none"}`),
          card: app.i18n.t(CARDS[s.map.manualLearnResult.cardId]?.nameKey ?? s.map.manualLearnResult.cardId),
        }))}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>` : ""}
    ${eventOverlay}
    ${completionRecordOverlay(app)}
  </main>`;
}

export function displayCombatEnemies(app) {
  const c = app.state?.combat;
  if (!c) return [];
  const turnOrderIndex = new Map((c.enemyTurnOrder ?? []).map((uid, index) => [uid, index]));
  return c.enemies
    .filter((e) => {
      if (e.hp > 0) return true;
      if (app.isEnemyDeathAnimating?.(e.uid)) return true;
      // Dead units remain in combat.enemies until cleanup grants their pending
      // drops. Once their shatter has finished, never let a leftover HP popup or
      // a later combat render make the intact corpse card visible again.
      if (e.combatFlags?.deathVisualComplete) return false;
      return Boolean(app.isZeroHpPaused?.(e) || app.hasResourcePopup?.(e, "hp"));
    })
    .sort((a, b) => (turnOrderIndex.get(a.uid) ?? 999) - (turnOrderIndex.get(b.uid) ?? 999));
}

export function combatStatusLabels(app, unit) {
  const gap = app.i18n.language === "zh-CN" || app.i18n.language === "ja" ? "" : " ";
  return orderedBuffKeys(unit).filter((key) => key !== "mainCharacterHalo").flatMap((key) => {
    if (key === "qi" || key === "guard") return [`${app.i18n.t(`ui.${key}`)}${gap}${unit[key] ?? 0}`];
    if (key === "darkForce") return getDarkForceInstances(unit).map((entry) => `${app.i18n.t("status.darkForce")}${gap}${entry.stacks}`);
    const name = app.i18n.t(`status.${key}`);
    return [SINGLE_STATE_POPUP_STATUSES.has(key) ? name : `${name}${gap}${getStatus(unit, key)}`];
  });
}

export function combatView(app) {
  const s = app.state, c = s.combat;
  const animationStyle = combatAnimationStyle(c);
  const displayEnemies = displayCombatEnemies(app);
  const logLines = c.log.map((entry) => `<div class="combat-log-line">${combatLogLine(app, entry)}</div>`).join("");
  const logContent = app.combatStatusInfo
    ? combatStatusInfoHtml(app, app.combatStatusInfo)
    : (logLines || `<div class="combat-log-line muted">${esc(app.i18n.t("combat.log.waiting"))}</div>`);
  const turnControlsDisabled = c.phase !== "player" || c.dealingCards;
  const inventoryDisabled = turnControlsDisabled;
  return `<main class="screen combat-screen">
    ${artifactPanel(app, { combat: true })}
    <div class="combat-stage" style="${animationStyle}">
      <section class="enemy-grid enemy-count-${Math.min(3, Math.max(1, displayEnemies.length))}">
        ${displayEnemies.map((enemy) => enemyHtml(app, enemy)).join("")}
      </section>
      ${combatFxLayerHtml(app, displayEnemies)}
      ${s.overlay === "inventory" && !inventoryDisabled ? `<div class="combat-stage-overlay">${inventoryPanel(app, true)}</div>` : ""}
    </div>
    <div class="hand-wrap">
      <section class="combat-control-zone">
        <div class="combat-actions">
          <button class="primary end-turn-button ${turnControlsDisabled ? "turn-button-disabled" : ""}" data-action="end-turn" ${turnControlsDisabled ? "disabled" : ""}>${esc(app.i18n.t("ui.endTurn"))}</button>
          <button class="inventory-button ${inventoryDisabled ? "turn-button-disabled" : ""}" data-action="toggle-inventory" ${inventoryDisabled ? "disabled" : ""}>${esc(app.i18n.t("ui.inventory"))}</button>
          <button class="flee-button interactive-gold ${turnControlsDisabled ? "turn-button-disabled" : ""}" data-action="flee" ${turnControlsDisabled ? "disabled" : ""}>${esc(app.i18n.t("ui.flee", { chance: app.combat.getFleeChance() }))}</button>
        </div>
        <div class="combat-log ${app.combatStatusInfo ? "showing-status-info" : ""}" aria-live="polite">${logContent}</div>
      </section>
      ${combatPlayerHud(app)}
      <div class="hand-area">
        <div class="pile-marker pile-marker-left" aria-label="${esc(app.i18n.t("combat.deckRemaining", { count: c.draw.length }))}"><span class="pile-label">${esc(app.i18n.t("combat.deckRemainingLabel"))}</span><strong class="pile-count">${c.draw.length}</strong></div>
        <div class="hand ${c.selectedCardId ? "has-selected" : ""} ${app.combat.isCardInputLocked?.() ? "card-input-locked" : ""}">${c.hand.map((uid, index) => cardHtml(app, uid, index)).join("")}</div>
        <div class="pile-marker pile-marker-right" aria-label="${esc(app.i18n.t("combat.cardsUsed", { count: c.discard.length }))}"><span class="pile-label">${esc(app.i18n.t("combat.cardsUsedLabel"))}</span><strong class="pile-count">${c.discard.length}</strong></div>
      </div>
    </div>
    ${combatResultOverlay(app, c)}
    ${c.leftProtectorGiftPrompt && !c.result ? `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-left-protector-gift" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("combat.leftProtectorGiftLine"))}">
        <div class="combat-loot-title modal-body">${esc(app.i18n.t("combat.leftProtectorGiftLine"))}</div>
        <div class="combat-loot-list"><div class="combat-loot-row"><span class="combat-loot-item">${catalogIconHtml("item", "bloodPill", "combat-loot-icon")}${itemNameHtml(app, "bloodPill")}</span><strong>×${esc(c.leftProtectorGiftCount ?? app.combat.leftProtectorGiftCount(app.state.player))}</strong></div></div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>` : ""}
  </main>`;
}

function combatResultOverlay(app, combat) {
  const result = combat?.result;
  if (!result) return "";
  if (result.type === "defeat") {
    const reviewLines = (combat.log ?? []).map((entry) => `<div class="combat-log-line">${combatLogLine(app, entry)}</div>`).join("")
      || `<div class="combat-log-line muted">${esc(app.i18n.t("combat.log.waiting"))}</div>`;
    const reviewOverlay = app.deathReviewOpen ? `<div class="modal-backdrop combat-review-backdrop" role="presentation">
      <section class="path-confirm-dialog combat-review-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("combat.result.reviewTitle"))}">
        <div class="node-title"><h3 class="modal-title">${esc(app.i18n.t("combat.result.reviewTitle"))}</h3><button type="button" class="combat-review-close" data-action="close-death-review">${esc(app.i18n.t("ui.close"))}</button></div>
        <div class="combat-log combat-review-log" aria-live="polite">${reviewLines}</div>
      </section>
    </div>` : "";
    return `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-combat-result" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("combat.result.defeatTitle"))}">
        <h3 class="modal-title">${esc(app.i18n.t("combat.result.defeatTitle"))}</h3>
        <button type="button" class="primary combat-review-button" data-action="open-death-review">${esc(app.i18n.t("combat.result.review"))}</button>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>${reviewOverlay}`;
  }

  if (result.type === "qingyiAftermath") {
    const body = app.i18n.t("combat.result.qingyiAftermathBody");
    return `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-combat-result" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(body)}">
        <div class="combat-loot-title modal-body">${esc(body)}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>`;
  }
  if (result.type === "zhengyangChiefAftermath") {
    const line1 = app.i18n.t("combat.result.zhengyangChiefAftermathLine1");
    const line2 = app.i18n.t("combat.result.zhengyangChiefAftermathLine2");
    return `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-combat-result" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(`${line1} ${line2}`)}">
        <div class="combat-loot-title modal-body">${esc(line1)}<br>${esc(line2)}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>`;
  }
  if (result.type === "rookieSquadAftermath") {
    const chapterOne = Math.max(1, Math.floor(Number(app.state.run?.chapterIndex) || 1)) === 1;
    const line1 = app.i18n.t(chapterOne ? "combat.result.rookieSquadAftermathLine1" : "combat.result.rookieSquadLaterAftermathLine1");
    const line2 = app.i18n.t("combat.result.rookieSquadAftermathLine2");
    const line3 = app.i18n.t(chapterOne ? "combat.result.rookieSquadAftermathLine3" : "combat.result.rookieSquadLaterAftermathLine3");
    return `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-combat-result" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(`${line1} ${line2} ${line3}`)}">
        <div class="combat-loot-title modal-body">${esc(line1)}<br>${esc(line2)}<br>${esc(line3)}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>`;
  }
  if (result.type === "escape") {
    const bodyKey = result.swift ? "combat.result.swiftEscapeBody" : "combat.result.escapeBody";
    return `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-combat-result" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("combat.result.escapeTitle"))}">
        <h3 class="modal-title">${esc(app.i18n.t("combat.result.escapeTitle"))}</h3>
        <div class="combat-loot-title modal-body">${esc(app.i18n.t(bodyKey))}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>`;
  }

  if (result.type === "swiftKill") {
    return `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-combat-result" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("combat.result.swiftKillTitle"))}">
        <h3 class="modal-title">${esc(app.i18n.t("combat.result.swiftKillTitle"))}</h3>
        <div class="combat-loot-title modal-body">${esc(app.i18n.t("combat.result.swiftKillBody"))}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>`;
  }

  if (result.type === "enemyEscape") {
    return `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-combat-result" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("combat.result.enemyEscapeTitle"))}">
        <h3 class="modal-title">${esc(app.i18n.t("combat.result.enemyEscapeTitle"))}</h3>
        <div class="combat-loot-title modal-body">${richPromptHtml(app, app.i18n.t("combat.result.enemyEscapeBody", { amount: Math.max(0, Math.floor(result.stolenStones ?? 0)) }))}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>`;
  }

  if (result.type === "escapeStolen") {
    return `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-combat-result" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("combat.result.enemyEscapeBody", { amount: Math.max(0, Math.floor(result.stolenStones ?? 0)) }))}">
        <div class="combat-loot-title modal-body">${richPromptHtml(app, app.i18n.t("combat.result.enemyEscapeBody", { amount: Math.max(0, Math.floor(result.stolenStones ?? 0)) }))}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>`;
  }

  if (result.type === "longBattle") {
    return `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-combat-result" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("combat.result.longBattleTitle"))}">
        <h3 class="modal-title">${esc(app.i18n.t("combat.result.longBattleTitle"))}</h3>
        <div class="combat-loot-title modal-body">${esc(app.i18n.t("combat.result.longBattleBody"))}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>`;
  }

  const loot = result.loot ?? { stones: 0, items: {} };
  const lootRows = [
    ...((loot.stones ?? 0) > 0 ? [`<div class="combat-loot-row"><span class="combat-loot-item">${catalogIconHtml("item", "spiritStone", "combat-loot-icon")}${spiritStoneNameHtml(app)}</span><strong>×${loot.stones}</strong></div>`] : []),
    ...Object.entries(loot.items ?? {})
      .filter(([, count]) => count > 0)
      .map(([itemId, count]) => {
        const item = ITEMS[itemId];
        const itemLabel = item
          ? `${catalogIconHtml("item", itemId, "combat-loot-icon")}${itemNameHtml(app, itemId)}`
          : esc(itemId);
        return `<div class="combat-loot-row"><span class="combat-loot-item">${itemLabel}</span><strong>×${count}</strong></div>`;
      }),
    ...Object.entries(loot.artifacts ?? {})
      .filter(([artifactId, count]) => count > 0 && ARTIFACTS[artifactId])
      .map(([artifactId, count]) => `<div class="combat-loot-row"><span class="combat-loot-item">${catalogIconHtml("artifact", artifactId, "combat-loot-icon")}${artifactNameHtml(app, artifactId)}</span><strong>×${count}</strong></div>`),
  ];
  return `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-combat-result" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("combat.result.victoryTitle"))}">
      <h3 class="modal-title">${esc(app.i18n.t("combat.result.victoryTitle"))}</h3>
      <div class="combat-loot-title">${esc(app.i18n.t("combat.result.lootTitle"))}</div>
      <div class="combat-loot-list">${lootRows.length ? lootRows.join("") : `<div class="combat-loot-empty">${esc(app.i18n.t("combat.result.none"))}</div>`}</div>
      <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
    </section>
  </div>`;
}

function enemyEntangleStrandsHtml(stacks) {
  const entangleLevel = Math.min(20, Math.max(1, Math.floor(stacks)));
  const strandCount = 3 + Math.round((entangleLevel - 1) * 27 / 19);
  const entangleReach = 30 + (entangleLevel - 1) * 60 / 19;
  const strands = Array.from({ length: strandCount }, (_, index) => {
    const y = 99 - index * (entangleReach - 1) / (strandCount - 1);
    const bend = ((index * 7) % 5 - 2) * 1.15;
    const wave = ((index * 11) % 7 - 3) * .65;
    const point = (value) => value.toFixed(1);
    return `<path d="M -4 ${point(y)} C 18 ${point(y + bend)} 29 ${point(y - bend)} 48 ${point(y + wave)} S 78 ${point(y - wave)} 104 ${point(y + bend * .6)}"/>`;
  }).join("");
  return `<svg class="enemy-entangle-vines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">${strands}</svg>`;
}

function enemyHtml(app, enemy) {
  const def = ENEMIES[enemy.enemyId];
  const selected = app.state.combat?.phase === "player" && app.state.combat.selectedEnemyId === enemy.uid;
  const intent = enemy.intent;
  const buffs = buffTokensHtml(app, enemy, { interactive: true });
  const skill = def.skills.find((s)=>s.id===intent?.skillId);
  const intentHidden = Boolean(intent?.hidden && !intent.revealed);
  const skillName = intentHidden ? app.i18n.t("combat.intent.unknown") : app.i18n.t(intent?.displayNameKey ?? skill?.intentNameKey ?? skill?.nameKey ?? "");
  const isActingEnemy = app.state.combat?.phase === "enemy" && app.state.combat?.actingEnemyId === enemy.uid;
  const isHealingEnemy = app.state.combat?.healingEnemyId === enemy.uid;
  const keepCurrentIntentTitle = Boolean(enemy.combatFlags?.intentTitleCurrent);
  const intentLineText = (isActingEnemy || keepCurrentIntentTitle) && !intentHidden
    ? skillName
    : app.i18n.t("combat.intent.next", { intent: skillName });
  const intentPreview = app.enemyAI?.liveIntentPreview(enemy, skill) ?? intent?.preview;
  const canonicalName = TRANSLATIONS["zh-CN"][intent?.displayNameKey ?? skill?.intentNameKey ?? skill?.nameKey ?? ""];
  const namedDetail = intentDetailForName(canonicalName, app.i18n.language);
  let intentDetail = "";
  if (!intentHidden && namedDetail && skill?.type !== "attack") {
    intentDetail = namedDetail;
  } else if (!intentHidden && intentPreview?.type === "attack") {
    const preview = intentPreview;
    const ignoreKey = preview.ignoreGuard && preview.ignoreQi
      ? "combat.intent.ignoreBoth"
      : preview.ignoreGuard
        ? "combat.intent.ignoreGuard"
        : preview.ignoreQi
          ? "combat.intent.ignoreQi"
          : null;
    intentDetail = `${ignoreKey ? app.i18n.t(ignoreKey) : ""}${app.i18n.t("combat.intent.attack", preview)}`;
  } else if (!intentHidden && intentPreview?.type === "attackUnknown") {
    intentDetail = app.i18n.t("combat.intent.attackUnknown");
  } else if (!intentHidden && intentPreview?.type === "defense") {
    const key = intentPreview.resource === "qi"
      ? "combat.intent.defenseQi"
      : intentPreview.allEnemies
        ? "combat.intent.defenseGuardAll"
        : "combat.intent.defenseGuard";
    intentDetail = app.i18n.t(key, { amount: intentPreview.amount });
  }
  const actionFx = app.enemyActionFx?.enemyUid === enemy.uid ? `enemy-action enemy-action-${app.enemyActionFx.type || "support"}` : "";
  const damageFx = app.isDamageTakenFlashing?.(enemy) ? "damage-taken" : "";
  const damageRedFx = damageFx && app.isDamageTakenRedFlashing?.(enemy) ? " damage-taken-red" : "";
  const damageFxDuration = damageFx ? app.getDamageTakenDuration?.(enemy) ?? 200 : 200;
  const damageFxStyle = damageFx ? `--damage-taken-duration:${damageFxDuration}ms;` : "";
  const deathFx = app.getEnemyDeathFx?.(enemy.uid);
  const deathClass = deathFx ? "enemy-death" : "";
  const deathFxStyle = deathFx?.style ?? "";
  // Persistent body-cultivator tells are driven by the same combat flags that
  // own the mechanics, so the visuals end on the exact render where the effect
  // itself expires (Mountain Force when Stance reaches zero; Huntian before the
  // user's next actual action). The motion layer isolates the motor-like shake
  // from short action/damage/death animations on the outer card.
  const mountainForceActive = Boolean(enemy.combatFlags?.enemyMountainCounter && (enemy.guard ?? 0) > 0);
  const huntianActive = Boolean(enemy.combatFlags?.enemyHuntian);
  const ghostFlashActive = Boolean(enemy.combatFlags?.enemyGhostFlash);
  const burnStacks = Math.max(0, Math.floor(getStatus(enemy, "burn")));
  const burnActive = burnStacks > 0;
  const freezeActive = getStatus(enemy, "freeze") > 0;
  const stunActive = getStatus(enemy, "stun") > 0;
  const entangleStacks = Math.max(0, Math.floor(getStatus(enemy, "entangle")));
  const entangleActive = entangleStacks > 0;
  const burnLevel = Math.min(20, burnStacks);
  const burnStyle = burnActive
    ? ` style="--burn-reach:${(30 + (burnLevel - 1) * 42 / 19).toFixed(1)}%;--burn-intensity:${(.68 + (burnLevel - 1) * .32 / 19).toFixed(2)}"`
    : "";
  const statusFx = [
    burnActive ? `<span class="enemy-status-fx burn"${burnStyle} aria-hidden="true"></span>` : "",
    freezeActive ? '<span class="enemy-status-fx freeze" aria-hidden="true"></span>' : "",
    stunActive ? '<span class="enemy-status-fx stun" aria-hidden="true"><i></i><i></i><i></i></span>' : "",
    entangleActive ? `<span class="enemy-status-fx entangle" aria-hidden="true">${enemyEntangleStrandsHtml(entangleStacks)}</span>` : "",
  ].join("");
  const persistentFxClass = `${mountainForceActive ? " enemy-mountain-force-active" : ""}${huntianActive ? " enemy-huntian-active" : ""}${ghostFlashActive ? " enemy-ghost-flash-active" : ""}`;
  const suffixKey = app.combat.duplicateSuffixKey(enemy);
  const displayNameKey = enemy.displayNameKey ?? def.nameKey;
  const displayName = `${app.i18n.t(displayNameKey)}${suffixKey ? app.i18n.t(suffixKey) : ""}`;
  const artScale = Number(def.artScale ?? 1);
  const nativeArtScale = Math.abs(artScale - 1) < 0.0001;
  // The Gate shares the portrait-grounding path with humanoids even though its
  // combat data correctly remains nonliving/non-humanoid.
  const humanoidArtClass = enemy.humanoid || enemy.enemyId === "gate" ? " enemy-art-humanoid" : "";
  return `<article class="enemy-card ${selected?"selected":""} ${isActingEnemy?"acting":""} ${isHealingEnemy?"healing-focus":""} ${actionFx} ${damageFx}${damageRedFx} ${deathClass}${persistentFxClass}" style="${damageFxStyle}${deathFxStyle}" ${enemy.hp > 0 ? `data-action="select-enemy" data-id="${enemy.uid}"` : ""} data-enemy-uid="${enemy.uid}">
    <div class="enemy-card-motion">
    <div class="enemy-head">
      <div class="enemy-art-frame">
        <img class="enemy-art ${nativeArtScale ? "enemy-art-native" : ""}${humanoidArtClass}" src="${def.art}" alt="" style="--enemy-art-scale:${artScale};" />
        ${statusFx}
        <h3 class="enemy-name-overlay"><span class="merchant-text-window enemy-marquee-window" data-merchant-marquee="enemy:${esc(enemy.uid)}:name"><span class="merchant-text-track">${esc(displayName)}</span></span></h3>
      </div>
      ${resourceBarHtml(app, { key: "hp", value: enemy.hp, max: enemy.maxHp, unit: enemy, extraClass: "enemy-hp-bar", popupClass: "enemy-resource-pop" })}
      <div class="enemy-buffs ${buffs ? "" : "empty"}" data-enemy-buffs="${esc(enemy.uid)}"><div class="enemy-buff-track">${buffs || `<span class="buff-slot-placeholder" aria-hidden="true"></span>`}</div></div>
    </div>
    <div class="intent ${intentHidden?"hidden":""}">
      <span class="intent-line"><span class="merchant-text-window enemy-marquee-window" data-merchant-marquee="enemy:${esc(enemy.uid)}:intent"><span class="merchant-text-track">${esc(intentLineText)}</span></span></span>
      ${intentDetail ? `<span class="intent-detail"><span class="merchant-text-window enemy-marquee-window" data-merchant-marquee="enemy:${esc(enemy.uid)}:detail"><span class="merchant-text-track">${esc(intentDetail)}</span></span></span>` : ""}
      ${intentHidden?`<button class="predict-btn" data-action="predict" data-id="${enemy.uid}">${esc(app.i18n.t("ui.predict"))}</button>`:""}
    </div>
    </div>
    ${huntianActive ? `<span class="enemy-huntian-aura" aria-hidden="true"></span>` : ""}
  </article>`;
}

function localizedStatPhrase(app, value, kind) {
  const lang = app.i18n.language;
  if (kind === "domainHp") return lang === "en" ? `${value} HP` : lang === "ja" ? `精血${value}` : `${value}点精血`;
  if (kind === "domainQi") return lang === "en" ? `${value} [Qi]` : lang === "ja" ? `【罡気】${value}` : `${value}点【罡气】`;
  if (kind === "domainIntent") return lang === "en" ? `${value} [Sword Intent]` : lang === "ja" ? `【剣意】${value}層` : `${value}层【剑意】`;
  if (kind === "damage") return lang === "en" ? `${value} damage` : lang === "ja" ? `${value}ダメージ` : `${value}伤害`;
  if (kind === "qi") return lang === "en" ? `${value} Qi` : lang === "ja" ? `${value}罡気` : `${value}罡气`;
  if (kind === "intent") return lang === "en" ? `${value} Sword Intent` : lang === "ja" ? `剣意${value}` : `${value}层剑意`;
  return String(value);
}

function highlightStaticCardValues(app, text, { negative = false } = {}) {
  const valueClass = negative ? "card-value-negative" : "card-value-positive";
  // Card emphasis is semantic, not phrase-wide: only numeric tokens and their
  // attached math symbols are colored. Units/words such as “damage”, “罡气” or
  // “伤害” keep the normal description color.
  return esc(text).replace(/\n/g, "<br>").replace(/(?:[+\-]?\d+(?:\.\d+)?%?)|[×]|等量|双倍|same amount|equal|double|同量|同じ|2倍/g, (match) => `<span class="${valueClass}">${match}</span>`);
}

function localizedStatPhraseHtml(app, value, kind, { negative = false } = {}) {
  const phrase = localizedStatPhrase(app, value, kind);
  const numeric = String(value);
  const index = phrase.indexOf(numeric);
  if (index < 0) return highlightStaticCardValues(app, phrase, { negative });
  const valueClass = negative ? "card-value-negative" : "card-value-positive";
  return `${esc(phrase.slice(0, index))}<span class="${valueClass}">${esc(numeric)}</span>${esc(phrase.slice(index + numeric.length))}`;
}

function replaceDynamicMarker(app, descKey, params, marker, value, kind, { negative = false } = {}) {
  const token = `__DYNAMIC_${marker.toUpperCase()}__`;
  const text = app.i18n.t(descKey, { ...params, [marker]: token });
  return highlightStaticCardValues(app, text, { negative })
    .replace(token, localizedStatPhraseHtml(app, value, kind, { negative }));
}

function heartDemonCardDescriptionHtml(app, card, descKey) {
  const effect = card.effects?.find((entry) => entry.type === "loseMaxHpPercent");
  const percent = Math.max(0, Number(effect?.percent ?? 0));
  const amount = Math.floor((app.state.player.maxHp ?? 0) * percent / 100);
  return replaceDynamicMarker(app, descKey, {}, "damage", amount, "damage", { negative: true });
}

function goldLightDescriptionHtml(app, inst, card, descKey) {
  const base = card.effects?.find((entry) => entry.type === "gainQi");
  const effect = base ? app.effects.applyUpgrade(inst, base) : null;
  const amount = effect ? app.effects.resolveAmount(effect.amount, app.state.player) : Math.max(0, Math.floor(app.state.player.sense ?? 0));
  return replaceDynamicMarker(app, descKey, {}, "qi", amount, "qi");
}

function swordDamageDescriptionHtml(app, inst, descKey) {
  const preview = app.effects.previewCardDamage(inst);
  const damage = preview?.firstHit ?? 0;
  return replaceDynamicMarker(app, descKey, {}, "damage", damage, "damage");
}

function palmThunderDescriptionHtml(app, inst, descKey) {
  const preview = app.effects.previewCardDamage(inst);
  const damage = preview?.firstHit ?? 0;
  return replaceDynamicMarker(app, descKey, {}, "damage", damage, "damage");
}

function fiveThunderDescriptionHtml(app, inst, descKey) {
  const preview = app.effects.previewCardDamage(inst);
  const damage = preview?.firstHit ?? 0;
  return replaceDynamicMarker(app, descKey, {}, "damage", damage, "damage");
}

function heartSwordDescriptionHtml(app, inst, descKey) {
  const card = CARDS[inst.cardId];
  const preview = app.effects.previewCardDamage(inst);
  const damage = preview?.firstHit ?? 0;
  const baseEffect = card?.effects?.find((entry) => entry.type === "damage");
  const effect = baseEffect ? app.effects.applyUpgrade(inst, baseEffect) : null;
  const chance = app.effects.resolveChance(effect?.statusOnHit?.chance ?? 0, app.state.player);
  const damageToken = "__HEART_SWORD_DAMAGE__";
  const chanceToken = "__HEART_SWORD_CHANCE__";
  const translated = app.i18n.t(descKey, { damage: damageToken, chance: chanceToken });
  return highlightStaticCardValues(app, translated)
    .replace(damageToken, localizedStatPhraseHtml(app, damage, "damage"))
    .replace(`${chanceToken}%`, `<span class="card-value-positive">${esc(chance)}%</span>`);
}

function stoneScreenDescriptionHtml(app, inst, card, descKey) {
  return highlightStaticCardValues(app, app.i18n.t(descKey));
}

function kuiThunderDescriptionHtml(app, inst, descKey) {
  const preview = app.effects.previewCardDamage(inst);
  const damage = preview?.firstHit ?? CARDS.kuiThunder.effects[0].baseDamage;
  return replaceDynamicMarker(app, descKey, {}, "damage", damage, "damage");
}

function yinWaterThunderDescriptionHtml(app, inst, descKey) {
  const preview = app.effects.previewCardDamage(inst);
  const damage = preview?.firstHit ?? 12;
  return replaceDynamicMarker(app, descKey, {}, "damage", damage, "damage");
}


function xuanpinQiDescriptionHtml(app, inst, card, descKey) {
  const base = card.effects?.find((entry) => entry.type === "xuanpinQi");
  const effect = base ? app.effects.applyUpgrade(inst, base) : null;
  const round = Math.max(1, Math.floor(app.state?.combat?.round ?? 1));
  const chance = Math.max(0, Math.min(100, Math.floor(effect?.statusChance ?? 40)));
  const qi = Math.max(0, Math.floor(round * Math.max(0, Number(effect?.qiPerRound ?? 2))));
  const reflection = Math.max(0, Math.floor(round * Math.max(0, Number(effect?.reflectionPerRound ?? 2))));
  return highlightStaticCardValues(app, app.i18n.t(descKey, { chance, qi, reflection }));
}

function earthEscapeDescriptionHtml(app, inst, descKey, { combatHand = false } = {}) {
  const base = highlightStaticCardValues(app, app.i18n.t(descKey));
  // Both the Mind Sea and the refinement preview can share a live combat
  // state: only the actual hand card should display a changing chance.
  if (!combatHand || app.state?.screen !== "combat" || !app.state?.combat) return base;
  const token = "__EARTH_ESCAPE_CHANCE__";
  const chance = app.combat.getEarthEscapeChance(inst.uid);
  const extra = app.i18n.t("card.earthEscape.combatChance", { chance: token });
  const spacer = app.i18n.language === "en" ? " " : "";
  return highlightStaticCardValues(app, app.i18n.t(descKey).replace("5%", `5%${spacer}${extra}`))
    .replace(`${token}%`, `<span class="card-value-positive">${esc(chance)}%</span>`);
}

function samadhiWindDescriptionHtml(app, { combatHand = false } = {}) {
  const handCount = combatHand && app.state?.screen === "combat"
    ? Math.max(0, (app.state.combat?.hand?.length ?? 0) - 1)
    : 0;
  return replaceDynamicMarker(app, "card.samadhiWind.desc", {}, "damage", 24 + handCount * 12, "damage");
}

function swordDomainDescriptionHtml(app, inst, card) {
  const effect = card.effects?.find((entry) => entry.type === "activateSwordDomain") ?? {};
  const active = getStatus(app.state.player, "swordDomain") > 0;
  const descKey = active ? (card.activeDescKey ?? card.descKey) : card.descKey;
  const damageToken = "__DOMAIN_DAMAGE__";
  const qiToken = "__DOMAIN_QI__";
  const intentToken = "__DOMAIN_INTENT__";
  const translated = app.i18n.t(descKey, { damage: damageToken, qi: qiToken, intent: intentToken });
  return highlightStaticCardValues(app, translated)
    .replace(damageToken, localizedStatPhraseHtml(app, effect.damage ?? 0, "domainHp", { negative: true }))
    .replace(qiToken, localizedStatPhraseHtml(app, effect.qi ?? 0, "domainQi"))
    .replace(intentToken, localizedStatPhraseHtml(app, effect.swordIntent ?? 0, "domainIntent"));
}

function bodyDamageDescriptionHtml(app, inst, descKey) {
  const preview = app.effects.previewCardDamage(inst); const damage = preview?.firstHit ?? 0;
  // Inch Punch's localized template includes its damage unit explicitly.
  if (inst.cardId === "inchPunch") return highlightStaticCardValues(app, app.i18n.t(descKey, { damage }));
  return replaceDynamicMarker(app, descKey, {}, "damage", damage, "damage");
}

function dynamicCardDescriptionHtml(app, inst, card, descKey, options = {}) {
  if (inst.cardId === "gatherQi") return highlightStaticCardValues(app, app.i18n.t(descKey, { qi: gatherQiHpGain(app.state.player) }));
  if (inst.cardId === "heartDemonCard") return heartDemonCardDescriptionHtml(app, card, descKey);
  if (inst.cardId === "goldLight") return goldLightDescriptionHtml(app, inst, card, descKey);
  if (inst.cardId === "palmThunder") return palmThunderDescriptionHtml(app, inst, descKey);
  if (["fiveThunder", "fiveThunderPlus", "fiveThunderPlusPlus"].includes(inst.cardId)) return fiveThunderDescriptionHtml(app, inst, descKey);
  if (["heartSword", "heartSwordPlus", "heartSwordPlusPlus"].includes(inst.cardId)) return heartSwordDescriptionHtml(app, inst, descKey);
  if (inst.cardId === "stoneScreen") return stoneScreenDescriptionHtml(app, inst, card, descKey);
  if (inst.cardId === "kuiThunder") return kuiThunderDescriptionHtml(app, inst, descKey);
  if (inst.cardId === "yinWaterThunder") return yinWaterThunderDescriptionHtml(app, inst, descKey);
  if (inst.cardId === "earthEscape") return earthEscapeDescriptionHtml(app, inst, descKey, options);
  if (inst.cardId === "samadhiWind") return samadhiWindDescriptionHtml(app, options);
  if (inst.cardId === "xuanpinQi") return xuanpinQiDescriptionHtml(app, inst, card, descKey);
  if (["inchPunch", "shadowKick", "frenzyPalm", "frenzyPalmPlus", "frenzyPalmPlusPlus", "rockFinger"].includes(inst.cardId)) return bodyDamageDescriptionHtml(app, inst, descKey);
  if (["swordDomain", "swordDomainPlus", "swordDomainPlusPlus"].includes(inst.cardId)) return swordDomainDescriptionHtml(app, inst, card);
  if (card.school === "sword" && card.tags?.includes("attack") && card.effects?.some((effect) => effect.type === "damage")) {
    return swordDamageDescriptionHtml(app, inst, descKey);
  }
  return highlightStaticCardValues(app, app.i18n.t(descKey));
}

function cardHtml(app, uid, index = 0) {
  const inst = app.state.player.deck.find((c)=>c.uid===uid);
  const card = CARDS[inst.cardId];
  const selected = app.state.combat?.selectedCardId === uid;
  const isHeartDemon = inst.cardId === "heartDemonCard";
  const descKey = inst.upgraded && card.upgradeDescKey ? card.upgradeDescKey : card.descKey;
  const actionFx = app.playerCardActionFx?.cardUid === uid ? ` card-action card-action-${app.playerCardActionFx.type || "support"}` : "";
  const dealFx = app.state.combat?.lastDealtCardUid === uid ? " card-deal-in" : "";
  const artFamily = inst.cardId.replace(/Plus(?:Plus)?$/, "");
  return `<button class="card ${isHeartDemon ? "heart-demon-card" : ""} ${selected?"selected":""}${actionFx}${dealFx}" style="--card-order:${index + 1}" data-action="play-card" data-id="${uid}" aria-pressed="${selected?"true":"false"}">
    <span class="cost">${app.combat?.getDisplayedCardManaCost?.(inst) ?? app.combat?.getCardManaCost?.(inst) ?? card.cost}</span>
    ${isHeartDemon ? "" : `<span class="type">${esc(app.i18n.t(`card.type.${card.type}`))}</span>`}
    ${actionFx ? `<img class="card-action-art" src="./assets/skill-art/${esc(artFamily)}.svg" alt="" draggable="false" aria-hidden="true">` : ""}
    ${cardNameWindowHtml(app, card, inst, `card:combat:${uid}`)}
    ${cardDescriptionWindowHtml(dynamicCardDescriptionHtml(app, inst, card, descKey, { combatHand: true }), `card:combat:${uid}:desc`)}
  </button>`;
}

function mindSeaCardHtml(app, inst, index = 0) {
  const card = CARDS[inst.cardId];
  if (!card) return "";
  const isHeartDemon = inst.cardId === "heartDemonCard";
  const descKey = inst.upgraded && card.upgradeDescKey ? card.upgradeDescKey : card.descKey;
  const sealed = inst.sealed === true;
  const selected = !sealed && app.mindSeaSelectedCardUid === inst.uid;
  const cycleElapsed = cardContentCycleElapsed(app.mindSeaOpenedAt);
  const selectionElapsed = selected ? Math.max(0, Math.min(500, Date.now() - (app.mindSeaSelectedAt ?? 0))) : 0;
  const selectionOpacity = Math.max(0, Math.min(1, Number(app.mindSeaSelectedOverlayOpacity) || 0));
  const selectionStyle = selected
    ? `;--mind-sea-selection-overlay:${selectionOpacity};--mind-sea-selection-text:${1 - selectionOpacity};--mind-sea-selection-delay:-${selectionElapsed}ms` : "";
  const sealCount = sealedCardCount(app.state.player);
  const sealCapacity = senseCapacityLimits(app.state.player.maxSense).seals;
  const failureElapsed = app.mindSeaSealFailureAt == null ? Infinity : Math.max(0, Date.now() - app.mindSeaSealFailureAt);
  const sealFailure = sealed && failureElapsed < 500;
  const artFamily = inst.cardId.replace(/Plus(?:Plus)?$/, "");
  return `<button type="button" class="card mind-sea-card ${isHeartDemon ? "heart-demon-card" : ""}${selected ? " selected" : ""}${sealed ? " is-sealed" : ""}${sealFailure ? " seal-capacity-flash" : ""}" style="--card-order:${index + 1};--mind-sea-art-delay:-${cycleElapsed}ms${selectionStyle}${sealFailure ? `;--seal-failure-delay:-${failureElapsed}ms` : ""}" data-action="select-mind-sea-card" data-id="${esc(inst.uid)}" data-card-uid="${esc(inst.uid)}" aria-pressed="${selected || sealed ? "true" : "false"}">
    <span class="cost">${app.combat?.getCardManaCost?.(inst, { includeTurnDiscount: false }) ?? card.cost}</span>
    ${isHeartDemon ? "" : `<span class="type">${esc(app.i18n.t(`card.type.${card.type}`))}</span>`}
    ${!sealed ? `<img class="card-action-art mind-sea-action-art" src="./assets/skill-art/${esc(artFamily)}.svg" alt="" draggable="false" aria-hidden="true">` : ""}
    ${sealed ? `<span class="card-seal-label${sealCount >= sealCapacity ? " at-capacity" : ""}">${esc(app.i18n.t("ui.cardSealed", { count: sealCount, max: sealCapacity }))}</span>` : ""}
    ${cardNameWindowHtml(app, card, inst, `card:mind-sea:${inst.uid}`)}
    ${cardDescriptionWindowHtml(dynamicCardDescriptionHtml(app, inst, card, descKey), `card:mind-sea:${inst.uid}:desc`)}
  </button>`;
}

function mindSeaPanel(app) {
  const deck = app.state.player.deck ?? [];
  // v0.1.58: all card-management views follow true acquisition order. New
  // cards are appended when learned/created; refinement mutates the selected
  // instance in place, so an upgraded card keeps its original slot. Heart
  // Demon cards therefore appear exactly where each pollution card was gained.
  const orderedDeck = deck.filter((inst) => CARDS[inst.cardId]);
  const filters = [
    { id: "all", labelKey: "ui.mindSeaAll" },
    { id: "martial", labelKey: "card.type.martial" },
    { id: "spell", labelKey: "card.type.spell" },
    { id: "secret", labelKey: "card.type.secret" },
  ];
  const activeFilter = filters.some((entry) => entry.id === app.mindSeaFilter) ? app.mindSeaFilter : "all";
  const countFor = (filter) => filter === "all"
    ? orderedDeck.length
    : deck.filter((inst) => CARDS[inst.cardId]?.type === filter).length;
  const visibleDeck = activeFilter === "all"
    ? orderedDeck
    : orderedDeck.filter((inst) => CARDS[inst.cardId]?.type === activeFilter);

  return `<section class="panel mind-sea-panel" data-mind-sea-panel aria-label="${esc(app.i18n.t("ui.mindSea"))}">
    <div class="mind-sea-filters" role="tablist" aria-label="${esc(app.i18n.t("ui.mindSea"))}">
      ${filters.map(({ id, labelKey }) => {
        const count = countFor(id);
        const active = activeFilter === id;
        return `<button type="button" class="mind-sea-filter ${active ? "active" : ""}" data-action="mind-sea-filter" data-filter="${id}" role="tab" aria-selected="${active ? "true" : "false"}">${esc(app.i18n.t(labelKey))}${count}/${count}</button>`;
      }).join("")}
    </div>
    <div class="mind-sea-grid">
      ${visibleDeck.map((inst, index) => mindSeaCardHtml(app, inst, index)).join("")}
    </div>
  </section>`;
}

export function inventoryPanel(app, combatOverlay = false, expanded = false) {
  const p = app.state.player;
  ensureArtifactCollections(p);
  const orderedIds = ensureInventoryOrder(p);
  const inCombat = app.state.screen === "combat";
  const stoneCost = Math.max(0, Math.floor(ITEMS.spiritStone.useCost ?? 20));
  const stoneUsable = ["map", "combat"].includes(app.state.screen) && (p.stones ?? 0) >= stoneCost
    && (!ITEMS.spiritStone.requiresMissingMana || (p.mana ?? 0) < (p.maxMana ?? 0));
  const marqueePrefix = `inventory:${inCombat ? "combat" : "map"}`;
  const selectionAttrs = (id) => `data-action="inventory-entry" data-id="${esc(id)}" aria-pressed="${app.inventorySelectedId === id ? "true" : "false"}"`;
  const selectedClass = (id) => app.inventorySelectedId === id ? "inventory-selected" : "";
  const stoneTile = `<button type="button" class="inventory-item inventory-stones ${stoneUsable ? "interactive-gold" : "inventory-unavailable"} ${selectedClass("spiritStone")}" ${selectionAttrs("spiritStone")}>
        ${inventoryEntryContent("item", "spiritStone", `${spiritStoneNameHtml(app)} <span class="item-name-count">×${p.stones ?? 0}</span>`, esc(app.i18n.t(ITEMS.spiritStone.descKey)), `${marqueePrefix}:spiritStone`)}
      </button>`;

  const orderedTiles = orderedIds.map((id) => {
    const artifact = ARTIFACTS[id];
    if (artifact && !artifact.hidden && (p.ownedArtifacts ?? []).includes(id)) {
      if (inCombat) return "";
      const equipped = isArtifactEquipped(p, id);
      const name = esc(app.i18n.t(artifact.nameKey));
      const displayName = `<span class="artifact-name ${artifact.colorClass ?? "artifact-name-default"}">${name}</span>${equipped ? esc(app.i18n.t("artifact.equippedSuffix")) : ""}`;
      const content = inventoryEntryContent("artifact", id, displayName, esc(artifactDescription(app, id, { combat: false })), `${marqueePrefix}:artifact:${id}`);
      return `<button type="button" class="inventory-item artifact-inventory-item interactive-gold ${selectedClass(id)}" ${selectionAttrs(id)}>${content}</button>`;
    }

    const item = ITEMS[id];
    if (!item || (p.inventory[id] ?? 0) <= 0) return "";
    const allowedHere = (item.usable ?? []).includes(inCombat ? "combat" : "map");
    if (inCombat && !allowedHere) return "";
    const resourceReady = id === "bloodPill"
      ? (p.hp ?? 0) < (p.maxHp ?? 0)
      : id === "treasureToken" ? (app.canUseTreasureToken?.() ?? false) : true;
    const enoughItems = (p.inventory[id] ?? 0) >= Math.max(1, Math.floor(Number(item.useCost) || 1));
    const manaReady = !item.requiresMissingMana || (p.mana ?? 0) < (p.maxMana ?? 0);
    const canUse = allowedHere && resourceReady && enoughItems && manaReady;
    const content = inventoryEntryContent("item", id, `${itemNameHtml(app, id)} <span class="item-name-count">×${p.inventory[id]}</span>`, esc(app.i18n.t(item.descKey ?? "")), `${marqueePrefix}:item:${id}`);
    return `<button type="button" class="inventory-item ${canUse ? "interactive-gold" : "inventory-unavailable"} ${selectedClass(id)}" ${selectionAttrs(id)}>${content}</button>`;
  }).join("");

  const mapToggle = !combatOverlay && app.state.screen === "map"
    ? `<button type="button" class="chip inventory-expand-toggle" data-action="toggle-map-inventory" aria-pressed="${expanded ? "true" : "false"}">${esc(app.i18n.t(expanded ? "ui.inventoryCollapse" : "ui.inventoryExpand"))}</button>`
    : "";
  return `<section class="panel ${combatOverlay ? "combat-inventory-panel" : `map-inventory-panel${expanded ? " expanded" : ""}`}"><div class="node-title"><h3>${esc(app.i18n.t("ui.inventory"))}</h3>${combatOverlay ? `<button data-action="toggle-inventory">${esc(app.i18n.t("ui.close"))}</button>` : mapToggle}</div>
    <div class="inventory-grid">
      ${stoneTile}
      ${orderedTiles}
    </div>
  </section>`;
}

export function shopView(app) {
  const s = app.state;
  const ui = s.map.shopUi ?? { entered: false, tab: "buy" };
  const shelf = app.shop.getShelf();
  const tab = ui.tab === "sell" ? "sell" : "buy";
  const currencyName = app.i18n.t(ITEMS.spiritStone.nameKey);
  const currencyNameHtml = spiritStoneNameHtml(app);

  const buyCells = shelf.entries.map((entry, i) => {
    if (!entry) return `<div class="merchant-grid-empty" aria-hidden="true"></div>`;
    const def = entry.kind === "item" ? ITEMS[entry.id] : ARTIFACTS[entry.id];
    const artifactUnavailable = entry.kind === "artifact"
      && (s.player.ownedArtifacts ?? []).includes(entry.id);
    const soldOut = entry.soldOut || artifactUnavailable;
    const price = app.shop.priceFor(entry);
    const insufficient = !soldOut && s.player.stones < price;
    const name = esc(app.i18n.t(def.nameKey));
    const displayName = entry.kind === "artifact"
      ? `<span class="artifact-name ${def.colorClass ?? "artifact-name-default"}">${name}</span>`
      : itemNameHtml(app, entry.id);
    const title = soldOut
      ? `${displayName}（${esc(app.i18n.t("shop.soldOut"))}）`
      : `${displayName} - ${price}`;
    const descKey = def.shopDescKey ?? def.descKey ?? "";
    return `<button type="button" class="merchant-item buy-item ${soldOut ? "sold-out" : ""}" data-action="buy" data-index="${i}" ${(soldOut || insufficient) ? "disabled" : ""}>
      ${merchantEntryContent(entry.kind, entry.id, title, esc(app.i18n.t(descKey)), `buy:${i}:${entry.id}`)}
    </button>`;
  }).join("");

  ensureArtifactCollections(s.player);
  // The sell page mirrors the storage bag's true acquisition order, but lists
  // ordinary items only. Owned artifacts remain entirely outside resale UI.
  const sellOrder = ensureInventoryOrder(s.player);
  const sellIds = sellOrder.filter((id) => {
    const item = ITEMS[id];
    return Boolean(item) && (s.player.inventory?.[id] ?? 0) > 0 && app.shop.itemSellPrice(id) != null;
  });
  const sellCells = sellIds.map((id) => {
    const item = ITEMS[id];
    const count = s.player.inventory?.[id] ?? 0;
    const price = app.shop.itemSellPrice(id);
    return `<button type="button" class="merchant-item sell-item" data-action="sell" data-kind="item" data-id="${id}">
      ${merchantEntryContent("item", id, `${itemNameHtml(app, id)} - ${price}`, esc(app.i18n.t("shop.remaining", { count })), `sell:${id}`)}
    </button>`;
  });
  while (sellCells.length < 10) sellCells.push(`<div class="merchant-grid-empty" aria-hidden="true"></div>`);

  const tabs = `<div class="merchant-tabs" role="tablist">
    <button type="button" class="merchant-tab ${tab === "buy" ? "active" : ""}" data-action="shop-tab" data-tab="buy" role="tab" aria-selected="${tab === "buy"}">${esc(app.i18n.t("shop.buy"))}</button>
    <button type="button" class="merchant-tab ${tab === "sell" ? "active" : ""}" data-action="shop-tab" data-tab="sell" role="tab" aria-selected="${tab === "sell"}">${esc(app.i18n.t("shop.sell"))}</button>
    <button type="button" class="merchant-tab merchant-leave interactive-gold" data-action="leave-shop">${esc(app.i18n.t("ui.leave"))}</button>
  </div>`;

  const content = tab === "buy"
    ? `<div class="merchant-grid-frame buy-grid" aria-label="${esc(app.i18n.t("shop.buy"))}">${buyCells}</div>`
    : `<div class="merchant-grid-frame sell-grid" aria-label="${esc(app.i18n.t("shop.sell"))}">${sellCells.join("")}</div>`;

  const stonesLine = `<div class="merchant-stones-line"><strong>${currencyNameHtml} <span class="item-name-count">×${s.player.stones ?? 0}</span></strong></div>`;

  const welcome = !ui.entered ? `<div class="modal-backdrop combat-result-backdrop merchant-welcome-backdrop" data-action="merchant-enter" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog merchant-welcome-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("shop.welcome"))}">
      <img class="merchant-welcome-image" src="./assets/images/merchant.svg" alt="" aria-hidden="true" />
      <h3 class="modal-title">${esc(app.i18n.t("shop.welcome"))}</h3>
      <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
    </section>
  </div>` : "";

  const leavePrompt = ui.entered && ui.leavePrompt ? `<div class="modal-backdrop combat-result-backdrop merchant-welcome-backdrop merchant-choice-backdrop" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog merchant-welcome-dialog merchant-choice-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("shop.leavePrompt"))}">
      <img class="merchant-welcome-image" src="./assets/images/merchant.svg" alt="" aria-hidden="true" />
      <h3 class="modal-title">${esc(app.i18n.t("shop.leavePrompt"))}</h3>
      <div class="merchant-prompt-actions">
        <button type="button" data-action="merchant-stay">${esc(app.i18n.t("shop.stay"))}</button>
        <button type="button" class="interactive-gold" data-action="merchant-confirm-leave">${esc(app.i18n.t("ui.leave"))}</button>
      </div>
    </section>
  </div>` : "";

  const discountPrompt = ui.entered && ui.discountPrompt ? `<div class="modal-backdrop combat-result-backdrop merchant-welcome-backdrop" data-action="merchant-discount-continue" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog merchant-welcome-dialog merchant-discount-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("shop.discountOffer"))}">
      <img class="merchant-welcome-image" src="./assets/images/merchant.svg" alt="" aria-hidden="true" />
      <h3 class="modal-title merchant-discount-lines"><span>${esc(app.i18n.t("shop.discountOfferLine1"))}</span><span>${esc(app.i18n.t("shop.discountOfferLine2"))}</span></h3>
      <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
    </section>
  </div>` : "";

  const giftPrompt = ui.entered && ui.giftPrompt ? `<div class="modal-backdrop combat-result-backdrop merchant-welcome-backdrop" data-action="merchant-gift-continue" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog merchant-welcome-dialog merchant-discount-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("shop.tokenGiftTitle"))}">
      <img class="merchant-welcome-image" src="./assets/images/merchant.svg" alt="" aria-hidden="true" />
      <h3 class="modal-title">${esc(app.i18n.t("shop.tokenGiftTitle"))}</h3>
      <div class="combat-loot-title modal-body">${richPromptHtml(app, app.i18n.t("shop.tokenGiftBody"))}</div>
      <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
    </section>
  </div>` : "";

  const buyConfirmEntry = Number.isInteger(ui.buyConfirm?.index) ? shelf.entries[ui.buyConfirm.index] : null;
  const buyConfirmDef = buyConfirmEntry && buyConfirmEntry.id === ui.buyConfirm?.id && buyConfirmEntry.kind === ui.buyConfirm?.kind
    ? (buyConfirmEntry.kind === "artifact" ? ARTIFACTS[buyConfirmEntry.id] : ITEMS[buyConfirmEntry.id])
    : null;
  const buyConfirmPrice = buyConfirmEntry ? app.shop.priceFor(buyConfirmEntry) : 0;
  const buyConfirmPlain = buyConfirmDef ? app.i18n.t("shop.buyConfirmPrompt", {
    currency: currencyName,
    price: buyConfirmPrice,
    item: app.i18n.t(buyConfirmDef.nameKey),
  }) : "";
  const buyConfirm = ui.entered && buyConfirmEntry && buyConfirmDef ? `<div class="modal-backdrop combat-result-backdrop merchant-choice-backdrop" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog merchant-choice-dialog merchant-trade-confirm-dialog" role="dialog" aria-modal="true" aria-label="${esc(buyConfirmPlain)}">
      ${merchantTradePreviewHtml(app, buyConfirmEntry.kind, buyConfirmEntry.id)}
      ${merchantTradeDescriptionHtml(app, buyConfirmEntry.kind, buyConfirmEntry.id)}
      <h3 class="modal-title merchant-trade-confirm-title">${merchantTradePromptHtml(app, "buy", buyConfirmEntry.kind, buyConfirmEntry.id, buyConfirmPrice)}</h3>
      <div class="merchant-prompt-actions">
        <button type="button" data-action="merchant-cancel-buy">${esc(app.i18n.t("shop.buyConfirmCancel"))}</button>
        <button type="button" class="primary" data-action="merchant-confirm-buy">${esc(app.i18n.t("shop.buyConfirmStart"))}</button>
      </div>
    </section>
  </div>` : "";

  const sellConfirmItem = ui.sellConfirm?.itemId ? ITEMS[ui.sellConfirm.itemId] : null;
  const sellConfirmOwned = sellConfirmItem ? Math.max(0, Math.floor(s.player.inventory?.[sellConfirmItem.id] ?? 0)) : 0;
  const sellConfirmLimit = sellConfirmItem ? app.shop.sellQuantityLimit(sellConfirmItem.id) : 1;
  const sellConfirmQuantity = Math.max(1, Math.min(sellConfirmLimit, Math.floor(ui.sellConfirm?.quantity ?? 1)));
  const sellConfirmRemaining = Math.max(0, sellConfirmOwned - sellConfirmQuantity);
  const sellConfirmUnitPrice = sellConfirmItem ? app.shop.itemSellPrice(sellConfirmItem.id) : 0;
  const sellConfirmPrice = sellConfirmUnitPrice * sellConfirmQuantity;
  const sellConfirmBulk = sellConfirmItem && sellConfirmOwned > 1;
  const sellConfirmPlain = sellConfirmItem ? app.i18n.t("shop.sellConfirmPrompt", {
    currency: currencyName,
    price: sellConfirmPrice,
    item: app.i18n.t(sellConfirmItem.nameKey),
  }) : "";
  const sellConfirm = ui.entered && sellConfirmItem ? `<div class="modal-backdrop combat-result-backdrop merchant-choice-backdrop" role="presentation">
    <section class="path-confirm-dialog combat-result-dialog merchant-choice-dialog merchant-trade-confirm-dialog merchant-sell-confirm-dialog" role="dialog" aria-modal="true" aria-label="${esc(sellConfirmPlain)}">
      ${merchantTradePreviewHtml(app, "item", sellConfirmItem.id)}
      ${merchantTradeDescriptionHtml(app, "item", sellConfirmItem.id)}
      ${sellConfirmBulk ? `<button type="button" class="merchant-sell-quantity-button" data-action="merchant-cycle-sell-quantity">${merchantSellQuantityButtonHtml(app, sellConfirmItem.id, sellConfirmQuantity, sellConfirmRemaining)}</button>` : ""}
      <h3 class="modal-title merchant-trade-confirm-title">${merchantTradePromptHtml(app, "sell", "item", sellConfirmItem.id, sellConfirmPrice)}</h3>
      <div class="merchant-prompt-actions">
        <button type="button" data-action="merchant-cancel-sell">${esc(app.i18n.t("shop.sellConfirmCancel"))}</button>
        <button type="button" class="primary" data-action="merchant-confirm-sell">${esc(app.i18n.t("shop.sellConfirmStart"))}</button>
      </div>
    </section>
  </div>` : "";

  return `<main class="screen shop-screen">${playerPanel(app)}
    <section class="panel merchant-panel">
      <h2>${esc(app.i18n.t("shop.title"))}</h2>
      ${ui.entered ? `${tabs}${stonesLine}${content}` : ""}
    </section>${debugPanel(app)}${welcome}${leavePrompt}${discountPrompt}${giftPrompt}${buyConfirm}${sellConfirm}</main>`;
}

export function eventView(app) {
  const overlay = app.state.overlay ?? {};
  const event = EVENTS[overlay.eventId];
  if (!event) return mapView(app);

  if (event.random || event.scripted) {
    const title = esc(app.i18n.t(event.nameKey));
    const scene = eventSceneForOverlay(overlay);
    const stage = overlay.stage ?? "intro";
    const showTitle = !(stage === "result" && overlay.result?.hideTitle);
    const eventDescParams = overlay.eventId === "corpse" ? { sect: app.i18n.t("event.sect.sword") } : {};
    let body = richPromptHtml(app, app.i18n.t(event.descKey, eventDescParams));
    let actions = "";
    let tapToContinue = false;

    if (stage === "result" && overlay.result?.key) {
      body = richPromptHtml(app, app.i18n.t(overlay.result.key, app.events.resultTextParams(overlay.result)));
      tapToContinue = true;
    } else if (overlay.eventId === "rift") {
      const chance = app.events.riftSuccessChance();
      actions = `<div class="merchant-prompt-actions">
        <button type="button" class="interactive-gold" data-action="event-choice" data-id="risk">${multilineEsc(app.i18n.t("event.rift.try", { chance }))}</button>
        <button type="button" data-action="event-choice" data-id="leave">${esc(app.i18n.t("ui.leave"))}</button>
      </div>`;
    } else if (overlay.eventId === "corpse" && stage === "method") {
      const canProbe = (app.state.player.sense ?? 0) >= 2;
      actions = `<div class="merchant-prompt-actions">
        <button type="button" class="${canProbe ? "interactive-gold" : ""}" data-action="event-choice" data-id="probe" ${canProbe ? "" : "disabled"}>${esc(app.i18n.t("event.corpse.probe"))}</button>
        <button type="button" data-action="event-choice" data-id="grab">${esc(app.i18n.t("event.corpse.grab"))}</button>
      </div>`;
    } else if (overlay.eventId === "corpse") {
      actions = `<div class="merchant-prompt-actions">
        <button type="button" class="interactive-gold" data-action="event-choice" data-id="inspect">${esc(app.i18n.t("event.corpse.inspect"))}</button>
        <button type="button" data-action="event-choice" data-id="leave">${esc(app.i18n.t("ui.leave"))}</button>
      </div>`;
    } else if (overlay.eventId === "tablet") {
      const chance = app.events.tabletSuccessChance();
      const canStudy = (app.state.player.sense ?? 0) >= 1;
      actions = `<div class="merchant-prompt-actions">
        <button type="button" class="${canStudy ? "interactive-gold" : ""}" data-action="event-choice" data-id="study" ${canStudy ? "" : "disabled"}>${multilineEsc(app.i18n.t("event.tablet.study", { chance }))}</button>
        <button type="button" data-action="event-choice" data-id="leave">${esc(app.i18n.t("ui.leave"))}</button>
      </div>`;
    } else if (overlay.eventId === "altar") {
      const useChoice = event.choices.find((choice) => choice.id === "use");
      const canUse = app.events.hasRequirements(useChoice);
      actions = `<div class="merchant-prompt-actions">
        <button type="button" class="${canUse ? "interactive-gold" : ""}" data-action="event-choice" data-id="use" ${canUse ? "" : "disabled"}>${esc(app.i18n.t("event.altar.use"))}</button>
        <button type="button" data-action="event-choice" data-id="rest">${multilineEsc(app.i18n.t("event.altar.rest"))}</button>
      </div>`;
    } else if (overlay.eventId === "firePit") {
      const useChoice = event.choices.find((choice) => choice.id === "useTool");
      const canUse = app.events.hasRequirements(useChoice);
      const knowsFrost = app.events.knowsFrostSpell();
      const chance = app.events.firePitSuccessChance();
      actions = `<div class="merchant-prompt-actions event-three-actions">
        <button type="button" class="${canUse ? "interactive-gold" : ""}" data-action="event-choice" data-id="useTool" ${canUse ? "" : "disabled"}>${multilineEsc(app.i18n.t(knowsFrost ? "event.firePit.useFrost" : "event.firePit.useSilk"))}</button>
        <button type="button" class="interactive-gold" data-action="event-choice" data-id="force">${multilineEsc(app.i18n.t("event.firePit.force", { chance }))}</button>
        <button type="button" class="event-leave-row" data-action="event-choice" data-id="leave">${esc(app.i18n.t("ui.leave"))}</button>
      </div>`;
    } else if (overlay.eventId === "alchemy") {
      const giveChoice = event.choices.find((choice) => choice.id === "give");
      const canGive = app.events.hasRequirements(giveChoice);
      actions = `<div class="merchant-prompt-actions">
        <button type="button" class="${canGive ? "interactive-gold" : ""}" data-action="event-choice" data-id="give" ${canGive ? "" : "disabled"}>${multilineEsc(app.i18n.t("event.alchemy.give"))}</button>
        <button type="button" data-action="event-choice" data-id="leave">${esc(app.i18n.t("ui.leave"))}</button>
      </div>`;
    } else if (overlay.eventId === "spiritVein") {
      actions = `<div class="merchant-prompt-actions">
        <button type="button" class="interactive-gold" data-action="event-choice" data-id="mine">${esc(app.i18n.t("event.spiritVein.mine"))}</button>
        <button type="button" data-action="event-choice" data-id="rest">${multilineEsc(app.i18n.t("event.spiritVein.rest"))}</button>
      </div>`;
    }

    const backdropAction = tapToContinue ? `data-action="event-result-continue"` : "";
    const continueLine = tapToContinue ? `<p class="event-result-continue modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>` : "";
    return mapView(app, `<div class="modal-backdrop combat-result-backdrop merchant-welcome-backdrop merchant-choice-backdrop" ${backdropAction} role="presentation">
        <section class="path-confirm-dialog combat-result-dialog merchant-welcome-dialog merchant-choice-dialog event-dialog" role="dialog" aria-modal="true" aria-label="${title}">
          ${scene ? `<img class="merchant-welcome-image event-scene-image" src="./assets/event-scenes/${scene}.svg" alt="" aria-hidden="true" />` : ""}
          ${showTitle ? `<h3 class="modal-title">${title}</h3>` : ""}
          <p class="modal-body">${body}</p>
          ${actions}
          ${continueLine}
        </section>
      </div>`);
  }

  return `<main class="screen">${artifactPanel(app)}${playerPanel(app)}<section class="panel"><h2>${esc(app.i18n.t(event.nameKey))}</h2><p>${esc(app.i18n.t(event.descKey))}</p><div class="stack">
    ${event.choices.map((choice)=>`<button class="event-choice" data-action="event-choice" data-id="${choice.id}" ${app.events.hasRequirements(choice)?"":"disabled"}>${esc(app.i18n.t(choice.labelKey))}</button>`).join("")}
  </div></section>${debugPanel(app)}</main>`;
}

function restRefinePreviewCardHtml(app, inst, side) {
  const card = CARDS[inst?.cardId];
  if (!card) return "";
  const descKey = inst.upgraded && card.upgradeDescKey ? card.upgradeDescKey : card.descKey;
  const cost = app.combat?.getCardManaCost?.(inst, { includeTurnDiscount: false }) ?? card.cost ?? 0;
  const rewardClass = side === "after" || String(side).startsWith("unlock-") ? " rest-refine-preview-reward" : "";
  const artFamily = inst.cardId.replace(/Plus(?:Plus)?$/, "");
  return `<article class="card mind-sea-card rest-refine-preview-card rest-refine-preview-${esc(side)}${rewardClass}"${previewArtCycleStyle(app)} aria-label="${esc(app.i18n.t(card.nameKey))}">
    <span class="cost">${esc(cost)}</span>
    <span class="type">${esc(app.i18n.t(`card.type.${card.type}`))}</span>
    <img class="card-action-art preview-action-art" src="./assets/skill-art/${esc(artFamily)}.svg" alt="" draggable="false" aria-hidden="true">
    ${cardNameWindowHtml(app, card, inst, `card:preview:${side}:${inst.uid ?? inst.cardId}`)}
    ${cardDescriptionWindowHtml(dynamicCardDescriptionHtml(app, inst, card, descKey), `card:preview:${side}:${inst.uid ?? inst.cardId}:desc`)}
  </article>`;
}

export function restView(app) {
  const p = app.state.player;
  const remainingSenseSuccesses = harmonizeSenseRemaining(p);
  const harmonyProgressDesc = remainingSenseSuccesses == null
    ? ""
    : app.i18n.t("rest.harmonySenseRemaining", { count: remainingSenseSuccesses });
  const heart = getStatus(p, "heartDemon");
  const heartTriggerChance = heart > 0 ? heartDemonTriggerChance(p) : 0;
  const refineCards = p.deck.filter((c) => app.rest.shouldListForRefineSpirit(c));
  const harmonyCards = p.deck;
  const canRefineBody = true;
  const canRefineSpirit = true;
  const canHarmonize = p.deck.length >= 17;
  const heartFail = app.state.map.restHeartDemonResult;
  const success = app.state.map.restSuccessResult;
  const harmonyMilestone = app.state.map.harmonyMilestoneResult;
  const cardUnlock = app.state.map.restCardUnlockResult;
  const progressButtonState = (type) => {
    const hold = app.restProgressHold?.type === type ? app.restProgressHold : null;
    if (!hold) return { className: "", style: "" };
    const fill = Math.max(0, Math.min(1, Number(hold.targetPercent ?? 0) / 100));
    return { className: " rest-progress-stopped", style: ` style="--rest-progress-target:${fill}"` };
  };
  const bodyProgress = progressButtonState("refineBody");
  const spiritProgress = progressButtonState("refineSpirit");
  const harmonyProgress = progressButtonState("harmonize");
  const manualProgress = progressButtonState("studyManual");
  const manualOrder = ensureInventoryOrder(p).filter((id) => ITEMS[id]?.type === "manual" && (p.inventory?.[id] ?? 0) > 0);
  const manualGridClass = manualOrder.length > 0 && manualOrder.length <= 3 ? " rest-manual-grid-one-row" : "";
  const rememberedManualId = app.manualStudyConfirm ?? app.manualStudySelection ?? null;
  const manualSelectedId = rememberedManualId && manualOrder.includes(rememberedManualId) ? rememberedManualId : null;
  const manualConfirmItemRest = app.manualStudyConfirm ? ITEMS[app.manualStudyConfirm] : null;
  const manualConfirmCardRest = manualConfirmItemRest?.type === "manual" ? CARDS[manualConfirmItemRest.learnCardId] : null;
  const manualConfirmPreview = manualConfirmCardRest ? { uid: `study-manual:${app.manualStudyConfirm}`, cardId: manualConfirmItemRest.learnCardId, upgraded: false } : null;
  const manualConfirmSpecialPreview = manualConfirmItemRest?.type === "manual" && manualConfirmItemRest.previewKey ? app.i18n.t(manualConfirmItemRest.previewKey) : "";
  const focusPillOwned = Math.max(0, Math.floor(p.inventory?.focusPill ?? 0));
  const manualFocusPillSelected = Math.max(0, Math.min(focusPillOwned, Math.floor(app.manualStudyFocusPillSelection ?? 0)));
  const manualFocusPillRemaining = Math.max(0, focusPillOwned - manualFocusPillSelected);
  const manualStudyFinalChance = app.manualStudyConfirm ? app.rest.getManualStudyFinalChance(app.manualStudyConfirm, manualFocusPillSelected) : 0;
  const manualStudyCanPay = app.manualStudyConfirm ? app.rest.hasChoiceResources({ type: "studyManual", itemId: app.manualStudyConfirm, focusPills: manualFocusPillSelected }) : false;
  const refineBodyConfirm = Boolean(app.refineBodyConfirm);
  const meditationSuccessChance = app.rest.getSuccessChance();
  const harmonizeConfirmUids = Array.isArray(app.harmonizeConfirm) ? app.harmonizeConfirm.slice(0, 2) : null;
  const rememberedHarmonyUids = harmonizeConfirmUids ?? (Array.isArray(app.harmonizeSelection) ? app.harmonizeSelection.slice(0, 2) : []);
  const validHarmonyUids = rememberedHarmonyUids.filter((uid) => p.deck.some((card) => card.uid === uid));
  const harmonySelectedSet = new Set(validHarmonyUids);
  const harmonySelectionReady = validHarmonyUids.length === 2 && p.deck.length - 2 >= 15;
  const refineConfirmUid = app.refineSpiritConfirm ?? null;
  const rememberedRefineUid = refineConfirmUid ?? app.refineSpiritSelection ?? null;
  const rememberedRefineCard = rememberedRefineUid ? p.deck.find((card) => card.uid === rememberedRefineUid) : null;
  const refineSelectedUid = rememberedRefineCard && app.rest.canUpgrade(rememberedRefineCard) ? rememberedRefineUid : null;
  const refineConfirmBefore = refineConfirmUid ? p.deck.find((card) => card.uid === refineConfirmUid) : null;
  const refineConfirmTarget = refineConfirmBefore ? app.rest.getUpgradeTarget(refineConfirmBefore) : null;
  const refineConfirmAfter = refineConfirmTarget ? { uid: `${refineConfirmUid}:preview`, ...refineConfirmTarget } : null;
  const refineConfirmUnlocks = refineConfirmBefore
    ? app.rest.getRefinePreviewUnlocks(refineConfirmBefore).map((cardId, index) => ({ uid: `${refineConfirmUid}:unlock:${index}`, cardId, upgraded: false }))
    : [];
  const refiningPillOwned = Math.max(0, Math.floor(p.inventory?.refiningPill ?? 0));
  const refiningPillSelected = Math.max(0, Math.min(refiningPillOwned, Math.floor(app.refineSpiritPillSelection ?? 0)));
  const refiningPillRemaining = Math.max(0, refiningPillOwned - refiningPillSelected);
  const refineFinalChance = refineConfirmBefore ? app.rest.getRefineFinalChance(refineConfirmBefore, refiningPillSelected) : 0;
  let successTitle = "";
  let successBody = "";
  if (success?.type === "refineBody") {
    successTitle = app.i18n.t("rest.refineBodySuccessTitle");
    successBody = app.i18n.t("rest.refineBodySuccessBody", { hp: success.hpRecovered, maxHp: success.maxHpGain });
  } else if (success?.type === "refineSpiritFailure") {
    successTitle = app.i18n.t("rest.refineSpiritFailureTitle");
    successBody = app.i18n.t("rest.refineSpiritFailureBody");
  } else if (success?.type === "refineSpirit") {
    const beforeCard = CARDS[success.beforeCardId ?? success.cardId];
    const afterCard = CARDS[success.afterCardId ?? success.cardId];
    const beforeName = `${app.i18n.t(beforeCard?.nameKey ?? "card.swordControl.name")}${success.beforeUpgraded ? "+" : ""}`;
    const afterName = `${app.i18n.t(afterCard?.nameKey ?? "card.swordControl.name")}${success.afterUpgraded ? "+" : ""}`;
    successTitle = app.i18n.t("rest.refineSpiritSuccessTitle");
    successBody = app.i18n.t("rest.refineSpiritSuccessBody", { before: beforeName, after: afterName });
  } else if (success?.type === "studyManualFailure") {
    successTitle = app.i18n.t("rest.studyManualFailureTitle");
    successBody = app.i18n.t("rest.studyManualFailureBody");
  } else if (success?.type === "studyManual") {
    const studiedItem = ITEMS[success.itemId];
    const learnedCard = CARDS[success.cardId];
    successTitle = app.i18n.t("rest.studyManualSuccessTitle");
    successBody = studiedItem?.studySuccessKey
      ? app.i18n.t(studiedItem.studySuccessKey)
      : app.i18n.t("manual.learnBody", {
          type: app.i18n.t(`card.type.${learnedCard?.type ?? "none"}`),
          card: app.i18n.t(learnedCard?.nameKey ?? success.cardId),
        });
  } else if (success?.type === "harmonize") {
    const firstCard = CARDS[success.first?.cardId];
    const secondCard = CARDS[success.second?.cardId];
    const firstName = `${app.i18n.t(firstCard?.nameKey ?? success.first?.cardId ?? "")}${success.first?.upgraded ? "+" : ""}`;
    const secondName = `${app.i18n.t(secondCard?.nameKey ?? success.second?.cardId ?? "")}${success.second?.upgraded ? "+" : ""}`;
    successTitle = app.i18n.t("rest.harmonySuccessTitle");
    successBody = app.i18n.t("rest.harmonySuccessBody", { first: firstName, second: secondName, remaining: success.remaining });
  }

  return `<main class="screen rest-screen">${playerPanel(app, { mindSeaButton: true })}${app.mindSeaOpen ? mindSeaPanel(app) : `<section class="panel rest-main-panel">
    <div class="rest-title-row">
      <div class="rest-title-copy"><h2>${esc(app.i18n.t("rest.title"))}</h2></div>
      <button type="button" class="rest-abandon-button interactive-gold" data-action="abandon-rest">${esc(app.i18n.t("rest.abandon"))}</button>
    </div>
    <div class="stack rest-stack">
      ${manualOrder.length ? `<div class="panel rest-subpanel rest-study-manual-panel">
        <strong>${esc(app.i18n.t("rest.studyManualTitle"))}</strong>
        <small class="rest-desc">${esc(app.i18n.t("rest.studyManualDesc"))}</small>
        <div class="rest-choice-grid rest-refine-grid rest-manual-grid${manualGridClass}">
          ${manualOrder.map((id) => {
            const selected = id === manualSelectedId;
            return `<label class="rest-harmony-choice rest-refine-choice"><span>${itemNameHtml(app, id)}</span><input type="checkbox" data-manual-study-choice="${id}" ${selected ? "checked" : ""} /></label>`;
          }).join("")}
        </div>
        <button class="rest-start-button rest-refine-submit${manualProgress.className}"${manualProgress.style} data-action="study-manual" data-rest-start="studyManual" ${manualSelectedId ? "" : "disabled"}><span>${esc(app.i18n.t("rest.startStudyManual"))}</span></button>
      </div>` : ""}


      <div class="panel rest-subpanel rest-refine-body-panel">
        <strong>${esc(app.i18n.t("ui.restRefineBody"))}</strong>
        <small class="rest-desc">${esc(app.i18n.t("rest.refineBodyDesc"))}</small>
        <button class="rest-start-button rest-refine-submit${bodyProgress.className}"${bodyProgress.style} data-action="refine-body" data-rest-start="refineBody" ${canRefineBody ? "" : "disabled"}><span>${esc(app.i18n.t("rest.startRefineBody"))}</span></button>
      </div>

      <div class="panel rest-subpanel">
        <strong>${esc(app.i18n.t("ui.restRefineSpirit"))}</strong>
        <small class="rest-desc">${esc(app.i18n.t("rest.refineSpiritDesc"))}</small>
        <div class="rest-choice-grid rest-refine-grid">
          ${refineCards.map((c) => {
            const eligible = canRefineSpirit && app.rest.canUpgrade(c);
            const selected = eligible && c.uid === refineSelectedUid;
            const selectable = eligible;
            const suffix = c.upgraded ? "+" : "";
            const checked = selected ? "checked" : "";
            const unlockReady = app.rest.canUpgrade(c) && (app.rest.getRefinePreviewUnlocks?.(c) ?? []).length > 0;
            const glow = unlockReady ? ` advanced-unlock-ready` : "";
            const glowStyle = unlockReady ? ` style="--refine-unlock-delay:-${Date.now() % 3200}ms"` : "";
            return `<label class="rest-harmony-choice rest-refine-choice ${selectable ? "" : "disabled"}${glow}"${glowStyle}><span>${cardNameHtml(app, CARDS[c.cardId], c.upgraded)}</span><input type="checkbox" data-refine-choice="${c.uid}" data-refine-eligible="${app.rest.canUpgrade(c) ? "1" : "0"}" ${checked} ${selectable ? "" : "disabled"} /></label>`;
          }).join("") || `<div class="rest-empty">—</div>`}
        </div>
        <button class="rest-start-button rest-refine-submit${spiritProgress.className}"${spiritProgress.style} data-action="refine-card" data-rest-start="refineSpirit" ${refineSelectedUid ? "" : "disabled"}><span>${esc(app.i18n.t("rest.startRefineSpirit"))}</span></button>
      </div>

      <div class="panel rest-subpanel">
        <strong>${esc(app.i18n.t("ui.restHarmony"))}</strong>
        <small class="rest-desc">${esc(app.i18n.t("rest.harmonyDesc", { count: p.deck.length }))}${esc(harmonyProgressDesc)}</small>
        <div class="rest-choice-grid rest-harmony-grid">
          ${harmonyCards.map((c) => {
            const selected = harmonySelectedSet.has(c.uid);
            const locked = validHarmonyUids.length >= 2 && !selected;
            const disabled = !canHarmonize || locked;
            return `<label class="rest-harmony-choice"><span>${cardNameHtml(app, CARDS[c.cardId], c.upgraded)}</span><input type="checkbox" data-harmony="${c.uid}" ${selected ? "checked" : ""} ${disabled ? "disabled" : ""} /></label>`;
          }).join("")}
        </div>
        <button class="rest-start-button rest-harmony-submit${harmonyProgress.className}"${harmonyProgress.style} data-action="harmonize" data-rest-start="harmonize" ${harmonySelectionReady ? "" : "disabled"}><span>${esc(app.i18n.t("rest.startHarmony"))}</span></button>
      </div>    </div></section>`}${debugPanel(app)}
    ${refineBodyConfirm ? `<div class="modal-backdrop rest-refine-confirm-backdrop" role="presentation">
      <section class="path-confirm-dialog rest-refine-confirm-dialog rest-simple-confirm-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("ui.restRefineBody"))}">
        <div class="rest-refine-success-rate">${esc(app.i18n.t("rest.refineBodyFinalChance", { chance: meditationSuccessChance }))}</div>
        <div class="rest-refine-confirm-row rest-refine-confirm-start-row">
          <button type="button" data-action="cancel-refine-body">${esc(app.i18n.t("rest.refineBodyConfirmCancel"))}</button>
          <button type="button" class="${meditationSuccessChance > 0 ? "interactive-gold" : ""}" data-action="confirm-refine-body" ${meditationSuccessChance > 0 ? "" : "disabled"}>${esc(app.i18n.t("rest.refineBodyConfirmStart"))}</button>
        </div>
      </section>
    </div>` : ""}
    ${harmonizeConfirmUids && harmonySelectionReady ? `<div class="modal-backdrop rest-refine-confirm-backdrop" role="presentation">
      <section class="path-confirm-dialog rest-refine-confirm-dialog rest-simple-confirm-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("ui.restHarmony"))}">
        <div class="rest-refine-success-rate">${esc(app.i18n.t("rest.harmonyFinalChance", { chance: meditationSuccessChance }))}</div>
        <div class="rest-refine-confirm-row rest-refine-confirm-start-row">
          <button type="button" data-action="cancel-harmonize">${esc(app.i18n.t("rest.harmonyConfirmCancel"))}</button>
          <button type="button" class="${meditationSuccessChance > 0 ? "interactive-gold" : ""}" data-action="confirm-harmonize" ${meditationSuccessChance > 0 ? "" : "disabled"}>${esc(app.i18n.t("rest.harmonyConfirmStart"))}</button>
        </div>
      </section>
    </div>` : ""}
    ${refineConfirmBefore && refineConfirmAfter ? `<div class="modal-backdrop rest-refine-confirm-backdrop" role="presentation">
      <section class="path-confirm-dialog rest-refine-confirm-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("rest.refineSpiritConfirmTitle"))}">
        <div class="rest-refine-confirm-cards${refineConfirmUnlocks.length ? " has-unlock-preview" : ""}">
          ${restRefinePreviewCardHtml(app, refineConfirmBefore, "before")}
          <div class="rest-refine-arrow" aria-hidden="true">→</div>
          <div class="rest-refine-preview-result">
            ${restRefinePreviewCardHtml(app, refineConfirmAfter, "after")}
            ${refineConfirmUnlocks.map((unlockInst, index) => `<div class="rest-refine-unlock-addition"><span class="rest-refine-plus" aria-hidden="true">+</span>${restRefinePreviewCardHtml(app, unlockInst, `unlock-${index}`)}</div>`).join("")}
          </div>
        </div>
        <div class="rest-refine-success-rate">${esc(app.i18n.t("rest.refineSpiritFinalChance", { chance: refineFinalChance }))}</div>
        <div class="rest-refine-confirm-actions rest-refine-confirm-actions-grid">
          <div class="rest-refine-confirm-row rest-refine-confirm-start-row">
            <button type="button" data-action="cancel-refine-card">${esc(app.i18n.t("rest.refineSpiritConfirmCancel"))}</button>
            <button type="button" class="${refineFinalChance > 0 ? "interactive-gold" : ""}" data-action="confirm-refine-card" ${refineFinalChance > 0 ? "" : "disabled"}>${esc(app.i18n.t("rest.refineSpiritConfirmStart"))}</button>
          </div>
          <div class="rest-refine-confirm-row rest-refine-confirm-pill-row">
            <button type="button" data-action="cycle-refine-pill" ${refiningPillOwned > 0 ? "" : "disabled"}>${esc(app.i18n.t("rest.refineSpiritPillButton", { used: refiningPillSelected, remaining: refiningPillRemaining }))}</button>
          </div>
        </div>
      </section>
    </div>` : ""}
    ${(manualConfirmPreview || manualConfirmSpecialPreview) ? `<div class="modal-backdrop rest-refine-confirm-backdrop" role="presentation">
      <section class="path-confirm-dialog rest-refine-confirm-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("rest.studyManualTitle"))}">
        ${manualConfirmPreview ? `<div class="rest-study-manual-confirm-card">${merchantManualPreviewHtml(app, app.manualStudyConfirm)}</div>` : `<div class="manual-effect-preview">${esc(manualConfirmSpecialPreview)}</div>`}
        <div class="rest-refine-success-rate">${esc(app.i18n.t("rest.studyManualFinalChance", { chance: manualStudyFinalChance }))}</div>
        <div class="rest-refine-confirm-actions rest-refine-confirm-actions-grid">
          <div class="rest-refine-confirm-row rest-refine-confirm-start-row">
            <button type="button" data-action="cancel-study-manual">${esc(app.i18n.t("rest.studyManualConfirmCancel"))}</button>
            <button type="button" class="${manualStudyFinalChance > 0 && manualStudyCanPay ? "interactive-gold" : ""}" data-action="confirm-study-manual" ${manualStudyFinalChance > 0 && manualStudyCanPay ? "" : "disabled"}>${esc(app.i18n.t("rest.studyManualConfirmStart"))}</button>
          </div>
          <div class="rest-refine-confirm-row rest-refine-confirm-pill-row">
            <button type="button" data-action="cycle-study-focus-pill" ${focusPillOwned > 0 ? "" : "disabled"}>${esc(app.i18n.t("rest.studyManualFocusPillButton", { used: manualFocusPillSelected, remaining: manualFocusPillRemaining }))}</button>
          </div>
        </div>
      </section>
    </div>` : ""}
    ${heartFail ? `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-rest-heart-fail" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("rest.heartFailTitle"))}">
        <h3 class="modal-title">${esc(app.i18n.t("rest.heartFailTitle"))}</h3>
        <div class="combat-loot-title modal-body">${esc(app.i18n.t("rest.heartFailBody"))}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>` : ""}
    ${success ? `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-rest-success" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(successTitle)}">
        <h3 class="modal-title">${esc(successTitle)}</h3>
        <div class="combat-loot-title">${richSkillPromptHtml(app, successBody)}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>` : ""}
    ${harmonyMilestone ? `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-harmony-milestone" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("rest.harmonyMilestoneTitle"))}">
        <h3 class="modal-title">${esc(app.i18n.t("rest.harmonyMilestoneTitle"))}</h3>
        <div class="combat-loot-title modal-body">${esc(app.i18n.t("rest.harmonyMilestoneBody"))}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>` : ""}
    ${cardUnlock ? `<div class="modal-backdrop combat-result-backdrop" data-action="dismiss-rest-card-unlock" role="presentation">
      <section class="path-confirm-dialog combat-result-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("rest.cardUnlockTitle"))}">
        <h3 class="modal-title">${esc(app.i18n.t("rest.cardUnlockTitle"))}</h3>
        <div class="combat-loot-title">${richSkillPromptHtml(app, app.i18n.t("rest.cardUnlockBody", {
          type: app.i18n.t(`card.type.${CARDS[cardUnlock.cardId]?.type ?? "none"}`),
          card: app.i18n.t(CARDS[cardUnlock.cardId]?.nameKey ?? cardUnlock.cardId),
        }))}</div>
        <p class="modal-continue-hint">${esc(app.i18n.t("combat.result.tapContinue"))}</p>
      </section>
    </div>` : ""}
  </main>`;
}

export function spiritView(app) {
  return `<main class="screen">${artifactPanel(app)}${playerPanel(app)}<section class="panel"><h2>${esc(app.i18n.t("spirit.title"))}</h2><div class="stack"><button data-action="spirit-rest">${esc(app.i18n.t("ui.spiritRest"))}</button><button data-action="spirit-mine">${esc(app.i18n.t("ui.spiritMine"))}</button></div></section></main>`;
}

export function restartConfirmPromptHtml(app, {
  questionKey = "death.restartConfirm", cancelAction = "cancel-restart",
  confirmAction = "confirm-restart", contentAction = "restart-confirm-content",
} = {}) {
  return `<div class="modal-backdrop combat-result-backdrop" role="presentation" data-action="${esc(cancelAction)}">
    <section class="path-confirm-dialog combat-result-dialog death-restart-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t(questionKey))}" data-action="${esc(contentAction)}">
      <div class="death-restart-question">${esc(app.i18n.t(questionKey))}</div>
      <div class="death-restart-confirm-actions">
        <button data-action="${esc(cancelAction)}">${esc(app.i18n.t("ui.no"))}</button>
        <button class="primary" data-action="${esc(confirmAction)}">${esc(app.i18n.t("ui.yes"))}</button>
      </div>
    </section>
  </div>`;
}

export function tutorialResetConfirmPromptHtml(app) {
  if (!app.tutorialResetConfirm) return "";
  return restartConfirmPromptHtml(app, {
    questionKey: "tutorial.resetConfirm", cancelAction: "cancel-tutorial-reset",
    confirmAction: "confirm-tutorial-reset", contentAction: "tutorial-reset-confirm-content",
  });
}

export function deathView(app) {
  const restartPrompt = app.restartConfirm ? restartConfirmPromptHtml(app) : "";
  const depth = app.save.availableRewindDepth?.() ?? 0;
  const history = app.save.loadRewindHistory?.() ?? [];
  const rewindButtons = [1, 2, 3].map((nodes) => {
    const enabled = depth >= nodes;
    const snapshot = history.at(-nodes)?.snapshot;
    const layer = MAP_NODES[snapshot?.map?.currentNodeId]?.layer ?? "—";
    return `<button class="${enabled ? "primary" : ""}" data-action="rewind" data-nodes="${nodes}" ${enabled ? "" : "disabled"}>${esc(app.i18n.t(`ui.rewind${nodes}`, { layer }))}</button>`;
  }).join("");
  return `<main class="screen"><section class="panel"><h1>${esc(app.i18n.t("ui.defeat"))}</h1><p>${esc(app.i18n.t("death.text"))}</p><div class="death-rewind-actions">${rewindButtons}</div><div class="stack" style="margin-top:.65rem"><button data-action="restart">${esc(app.i18n.t("ui.restart"))}</button></div></section></main>${restartPrompt}`;
}

export function debugPanel(app) {
  if (!app.debug) return "";
  const jumpButton = (nodeId) => `<button data-action="debug-jump" data-node="${nodeId}">${esc(app.i18n.t("debug.jumpNode", { node: nodeId }))}</button>`;
  const manualInheritanceButtons = [
    ["debug-sword-inheritance", "debug.swordInheritance"],
    ["debug-law-inheritance", "debug.lawInheritance"],
    ["debug-body-inheritance", "debug.bodyInheritance"],
  ].map(([action, key]) => `<button data-action="${action}">${esc(app.i18n.t(key))}</button>`).join("");
  const stats = app.rest.getRefineStats();
  const statsRows = [
    ["debug.refineStatsSuccess", stats.success],
    ["debug.refineStatsFailure", stats.failure],
    ["debug.refineStatsPills", stats.pillsConsumed],
    ["debug.refineStatsBasic", stats.basicUpgrades],
    ["debug.refineStatsUnlocks", stats.advancedUnlocks],
    ["debug.refineStatsAdvancedFirst", stats.advancedFirstUpgrades],
    ["debug.refineStatsAdvancedSecond", stats.advancedSecondUpgrades],
  ].map(([key, value]) => `<div class="debug-refine-stat-row"><span>${esc(app.i18n.t(key))}</span><strong>${value}</strong></div>`).join("");
  const statsOverlay = app.refineStatsOpen ? `<div class="modal-backdrop combat-result-backdrop debug-refine-stats-backdrop" data-action="close-refine-stats" role="presentation">
    <section class="path-confirm-dialog debug-refine-stats-dialog" role="dialog" aria-modal="true" aria-label="${esc(app.i18n.t("debug.refineStats"))}">
      <h3 class="modal-title">${esc(app.i18n.t("debug.refineStats"))}</h3>
      <div class="debug-refine-stats-list">${statsRows}</div>
      <p class="modal-continue-hint">${esc(app.i18n.t("debug.refineStatsCloseHint"))}</p>
    </section>
  </div>` : "";
  return `<section class="panel debug"><h3>${esc(app.i18n.t("ui.debug"))}</h3><div class="debug-actions"><button data-action="debug-stones">${esc(app.i18n.t("debug.addStones"))}</button><button data-action="debug-heal">${esc(app.i18n.t("debug.fullHeal"))}</button><button data-action="debug-sense">${esc(app.i18n.t("debug.fullSense"))}</button><button data-action="debug-pursuit">${esc(app.i18n.t("debug.addPursuit"))}</button><button data-action="debug-pursuit-down">${esc(app.i18n.t("debug.reducePursuit"))}</button><button data-action="debug-sword-talisman">${esc(app.i18n.t("debug.addSwordTalisman"))}</button><button data-action="debug-merchant">${esc(app.i18n.t("shop.title"))}</button><button data-action="debug-rest">${esc(app.i18n.t("debug.rest"))}</button>${["2A","4C","13A","14C","17B","18B","19B"].map(jumpButton).join("")}<button data-action="debug-qingyi">${esc(app.i18n.t("debug.qingyi"))}</button><button data-action="debug-rookie-squad">${esc(app.i18n.t("debug.rookieSquad"))}</button><button data-action="debug-zhengyang-chief">${esc(app.i18n.t("debug.zhengyangChief"))}</button><button data-action="debug-zhengyang-left-protector">${esc(app.i18n.t("debug.zhengyangLeftProtector"))}</button>${manualInheritanceButtons}<button data-action="debug-inheritance">${esc(app.i18n.t("debug.inheritance"))}</button><button data-action="debug-refine-stats">${esc(app.i18n.t("debug.refineStats"))}</button><button data-action="debug-completion-record">${esc(app.i18n.t("debug.completionRecord"))}</button></div><small>${esc(app.i18n.t("ui.seed"))}: ${esc(app.state?.run?.seed??"")} · ${esc(app.i18n.t("debug.rng"))}: ${app.rng?.state??"-"}</small></section>${statsOverlay}${app.state?.screen === "map" ? "" : completionRecordOverlay(app)}`;
}
