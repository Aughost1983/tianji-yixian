import { GAME_VERSION } from "../core/version.js?v=v0.3.90";
import { completionRecord, highestAdvancedSkills } from "../core/run-records.js?v=v0.3.90";
import { ensureArtifactCollections, senseCapacityLimits, sealedCardCount } from "../core/state.js?v=v0.3.90";
import { MAP_NODES } from "../data/map-data.js?v=v0.3.90";
import { STYLES } from "../data/styles.js?v=v0.3.90";
import { CARDS } from "../data/cards.js?v=v0.3.90";
import { ARTIFACTS } from "../data/artifacts.js?v=v0.3.90";
import { ITEMS } from "../data/items.js?v=v0.3.90";
import { cardDisplayName, toChineseNormalNumber, combatStatusLabels, displayCombatEnemies } from "./templates.js?v=v0.3.90";

export function browserSummary(userAgent = "") {
  const browsers = [
    [/(?:EdgA|EdgiOS|Edg)\/(\d+)/, "Edge"], [/OPR\/(\d+)/, "Opera"],
    [/(?:Chrome|CriOS)\/(\d+)/, "Chrome"], [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
    [/Version\/(\d+).*Safari\//, "Safari"], [/MSIE (\d+)|rv:(\d+).*Trident/, "IE"],
  ];
  const found = browsers.map(([pattern, name]) => [name, userAgent.match(pattern)])
    .find(([, match]) => match);
  const browser = found ? `${found[0]} ${found[1][1] ?? found[1][2]}` : "Unknown";
  const platform = /Android/i.test(userAgent) ? "Android" : /iPhone|iPad|iPod/i.test(userAgent) ? "iOS"
    : /Windows/i.test(userAgent) ? "Windows" : /Macintosh|Mac OS X/i.test(userAgent) ? "macOS"
      : /Linux/i.test(userAgent) ? "Linux" : "Unknown";
  return `${browser} / ${platform}`;
}

// A single click-time snapshot. Every shared run total is obtained from the
// completion record source (or its frozen completed snapshot), never recounted.
export function buildGlobalInfoText(app, environment = {}) {
  const state = app.state, p = state?.player, t = (key, params) => app.i18n.t(key, params);
  const record = state ? (state.run?.completed && state.run.completionRecord
    ? state.run.completionRecord : completionRecord(state)) : null;
  const nodeId = state?.map?.currentNodeId, node = MAP_NODES[nodeId];
  const screen = t(`info.screen.${state?.screen ?? "start"}`);
  const style = p ? t(STYLES[record?.styleId ?? p.styleId]?.nameKey ?? STYLES.sword.nameKey) : t("record.none");
  const layer = node?.layer ?? 0;
  const layerShort = layer > 0 ? t("info.layerShort", { layer }) : t("location.caveOutside");
  const layerName = layer > 0 ? t("location.caveLayer", {
    layer: app.i18n.language === "zh-CN" ? toChineseNormalNumber(layer) : layer,
  }) : t("location.caveOutside");
  const now = environment.now instanceof Date ? environment.now : new Date(environment.now ?? Date.now());
  const pad = (value) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const separator = t("record.separator"), none = t("record.none");
  const names = (values) => values.filter(Boolean).join(separator) || none;
  const advanced = names(highestAdvancedSkills(record?.advanced).map((card) => cardDisplayName(app, CARDS[card.cardId], card.upgraded)));
  const equipped = p ? ensureArtifactCollections(p).equipped : [];
  const capacity = senseCapacityLimits(p?.maxSense);
  const elapsed = Math.max(0, Math.floor(Number(record?.elapsedSeconds) || 0));
  const duration = `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`;
  const line = (key, value) => `${t(`info.${key}`)}${t("info.colon")}${value}`;
  const section = (key) => `【${t(`info.section.${key}`)}】`;
  const outcome = (values) => t("info.outcomes", { wins: values?.wins ?? 0, escapes: values?.escapes ?? 0, deaths: values?.deaths ?? 0 });
  const rest = (key) => `${record?.restOutcomes?.[key]?.success ?? 0}/${record?.restOutcomes?.[key]?.failure ?? 0}`;
  const lines = [
    `【${t("app.title")} ${GAME_VERSION}｜${style}｜${layerShort}｜${screen}】`, "",
    section("test"), line("version", GAME_VERSION), line("timestamp", date), line("seed", state?.run?.seed ?? none), "",
    section("progress"), line("style", style), line("location", `${layerName}${nodeId ? ` / ${nodeId}` : ""}`),
    line("screen", screen), line("pursuit", `${state?.map?.pursuit ?? 0}/5`),
    ...["hp", "mana", "sense"].map((key) => `${t(`ui.${key}`)}${t("info.colon")}${p?.[key] ?? 0}/${p?.[`max${key[0].toUpperCase()}${key.slice(1)}`] ?? 0}`), "",
    section("build"), line("deck", t("info.deckValue", { count: record?.cardCount ?? 0,
      types: t("record.cardsValue", record?.deckComposition ?? { martial: 0, spell: 0, secret: 0 }) })),
    line("sealed", `${sealedCardCount(p)}/${capacity.seals}`), line("advanced", advanced),
    line("artifacts", t("info.artifactsValue", { count: equipped.length, capacity: capacity.artifacts })),
    names(equipped.map((id) => t(ARTIFACTS[id].nameKey))),
    ...["spiritStone", "highSpiritStone", "spiritJade", "highSpiritJade"].map((id) =>
      `${t(ITEMS[id].nameKey)}${t("info.colon")}${id === "spiritStone" ? p?.stones ?? 0 : p?.inventory?.[id] ?? 0}`), "",
    section("statistics"), line("battles", outcome(record?.battleOutcomes)), line("pursuitBattles", outcome(record?.pursuitOutcomes)),
    line("enemiesDefeated", record?.enemiesDefeated ?? 0), line("averageRounds", t("info.roundsValue", { rounds: record?.averageRounds ?? "0.0" })),
    line("highestTurnDamage", record?.highestTurnDamage ?? 0), line("damageTaken", record?.damageTaken ?? 0),
    line("manualStudy", rest("manualStudy")), line("refineBody", rest("refineBody")),
    line("refineSpirit", rest("refineSpirit")), line("harmonize", rest("harmonize")), line("elapsed", duration),
  ];
  const combat = state?.screen === "combat" ? state.combat : null;
  if (combat) {
    lines.push("", section("combat"), line("round", combat.round ?? 0), line("playerStatuses", names(combatStatusLabels(app, p))), `${t("info.enemies")}${t("info.colon")}`);
    const enemies = displayCombatEnemies(app);
    if (!enemies.length) lines.push(none);
    for (const enemy of enemies) {
      const ref = app.combat?.unitRef?.(enemy);
      const name = `${t(ref?.i18nKey ?? enemy.displayNameKey ?? enemy.nameKey ?? "combat.actor.unknown")}${ref?.suffixKey ? t(ref.suffixKey) : ""}`;
      lines.push(`${name} ${enemy.hp}/${enemy.maxHp}｜${names(combatStatusLabels(app, enemy))}`);
    }
    const hand = (combat.hand ?? []).map((uid) => app.combat?.findCardInstance?.(uid) ?? p.deck.find((card) => card.uid === uid));
    lines.push(line("hand", names(hand.map((card) => card ? cardDisplayName(app, CARDS[card.cardId], card.upgraded) : ""))),
      line("draw", combat.draw?.length ?? 0), line("discard", combat.discard?.length ?? 0));
  }
  const width = Math.round(environment.width ?? globalThis.innerWidth ?? 0);
  const height = Math.round(environment.height ?? globalThis.innerHeight ?? 0);
  lines.push("", section("environment"), line("language", app.i18n.language), line("viewport", `${width}×${height}`),
    line("browser", browserSummary(environment.userAgent ?? globalThis.navigator?.userAgent ?? "")));
  return lines.join("\n");
}

// HTTPS/localhost uses the native clipboard API. The synchronous textarea
// fallback also works for the local BAT server/LAN and older browsers.
export async function writeGlobalInfoClipboard(text, { navigator = globalThis.navigator, document = globalThis.document } = {}) {
  if (navigator?.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Try local compatibility path. */ }
  }
  if (!document?.body || !document.createElement || !document.execCommand) throw new Error("Clipboard unavailable");
  const active = document.activeElement, selection = document.getSelection?.();
  const ranges = Array.from({ length: selection?.rangeCount ?? 0 }, (_, i) => selection.getRangeAt(i).cloneRange());
  const inputSelection = Number.isInteger(active?.selectionStart)
    ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
  const field = document.createElement("textarea");
  field.value = text; field.readOnly = true; field.tabIndex = -1;
  field.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;font-size:16px;opacity:0;";
  try {
    document.body.appendChild(field); field.focus({ preventScroll: true }); field.select();
    field.setSelectionRange(0, text.length);
    if (!document.execCommand("copy")) throw new Error("Clipboard copy refused");
  } finally {
    field.remove();
    if (active?.isConnected !== false) active?.focus?.({ preventScroll: true });
    if (inputSelection) active?.setSelectionRange?.(inputSelection.start, inputSelection.end, inputSelection.direction);
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) { try { selection.addRange(range); } catch { /* A rebuilt DOM may retire a range. */ } }
    }
  }
}
