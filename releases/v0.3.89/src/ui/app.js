import { waitForZeroHpPause, isZeroHpPaused } from "../core/lethal.js?v=v0.3.89";
import { resetCombatVisualEpoch } from "../core/combat-visuals.js?v=v0.3.89";
import { cardContentOverlayOpacity } from "../core/card-visuals.js?v=v0.3.89";
import { I18n } from "../core/i18n.js?v=v0.3.89";
import { AudioManager, AUDIO_FILES, BGM_VOLUME } from "../core/audio.js?v=v0.3.89";
import { ResourceManager, resolveResourceHtml } from "../core/resources.js?v=v0.3.89";
import { SaveManager } from "../core/save.js?v=v0.3.89";
import { PursuitResults, recordPursuitRule } from "../core/pursuit-results.js?v=v0.3.89";
import { TutorialHints, COMBAT_TUTORIAL_IDS } from "../core/tutorials.js?v=v0.3.89";
import { GAME_VERSION } from "../core/version.js?v=v0.3.89";
import { RNG } from "../core/rng.js?v=v0.3.89";
import { createInitialState, ensureArtifactCollections, ensureInventoryOrder, ensureCardUseCounts, addInventoryItem, toggleArtifactEquip, isArtifactOwned, hasTreasureToken, reducePursuitValue, setCardSealed, removeSealedCardsFromCombat } from "../core/state.js?v=v0.3.89";
import { EffectEngine } from "../core/effects.js?v=v0.3.89";
import { EnemyAI } from "../core/enemy-ai.js?v=v0.3.89";
import { CombatEngine, isOpeningWolfCombat, OPENING_BATTLE_NODES } from "../core/combat.js?v=v0.3.89";
import { MapEngine } from "../core/map.js?v=v0.3.89";
import { ShopEngine } from "../core/shop.js?v=v0.3.89";
import { EventEngine } from "../core/events.js?v=v0.3.89";
import { RestEngine, ensureHarmonizeSenseProgress } from "../core/rest.js?v=v0.3.89";
import { addStatus, getStatus, removeStatus, setMana, orderedBuffKeys, POSITIVE_STATUSES } from "../core/status.js?v=v0.3.89";
import { ensureRunRecords, ensureAdvancedSkillOrder, completionRecord, completeRun, recordBattleStart, recordBattleOutcome, recordDeath, recordPursuitPeak, recordArtifactTrigger, recordStoneGain, recordStoneSpend, mergeRewindRecords } from "../core/run-records.js?v=v0.3.89";
import { ENCOUNTER_TABLES } from "../data/encounters.js?v=v0.3.89";
import { ENEMIES, SWORD_MANUAL_DROP_POOL, LAW_MANUAL_DROP_POOL, BODY_MANUAL_DROP_POOL } from "../data/enemies.js?v=v0.3.89";
import { STYLES } from "../data/styles.js?v=v0.3.89";
import { ARTIFACTS } from "../data/artifacts.js?v=v0.3.89";
import { CARDS } from "../data/cards.js?v=v0.3.89";
import { ITEMS } from "../data/items.js?v=v0.3.89";
import { buildGlobalInfoText, writeGlobalInfoClipboard } from "./global-info.js?v=v0.3.89";
import { MAP_NODES } from "../data/map-data.js?v=v0.3.89";
import { SKILL_SFX_SETTINGS } from "../data/skill-sfx.js?v=v0.3.89";
import { startView, loadingView, topbar, mapView, combatView, shopView, eventView, restView, spiritView, deathView, tutorialPromptHtml, tutorialResetPromptHtml, tutorialResetConfirmPromptHtml, pursuitResultPromptHtml, globalInfoPromptHtml, rewindResultPromptHtml } from "./templates.js?v=v0.3.89";

const DEBUG_MANUAL_INHERITANCE_POOLS = Object.freeze({
  "debug-sword-inheritance": SWORD_MANUAL_DROP_POOL,
  "debug-law-inheritance": LAW_MANUAL_DROP_POOL,
  "debug-body-inheritance": BODY_MANUAL_DROP_POOL,
});
const STATUS_FEEDBACK_BEAT_MS = 280;
const TUTORIAL_IDLE_MS = 10000;
const REVIVAL_HP_FEEDBACK_DELAY_MS = 150;

export class App {
  constructor(root) {
    this.root = root;
    this.save = new SaveManager();
    this.tutorials = new TutorialHints();
    this.tutorialPursuitResultId = null;
    this.pursuitResults = new PursuitResults();
    this.tutorialEntryCombatRef = null;
    this.tutorialAutoTurnRef = null;
    this.tutorialActionDepth = 0;
    this.tutorialIdleTurn = null;
    this.tutorialIdleTimer = null;
    this.tutorialResetNotice = false;
    this.tutorialResetConfirm = false;
    this.infoCopyNotice = null;
    this.infoCopyInFlight = false;
    this.timedNotice = null;
    this.rewindNotices = [];
    this.playerDeathPending = null;
    this.restartConfirm = false;
    this.newRunConfirm = null;
    this.startRunSelection = null;
    this.playedCardManaCost = null;
    this.locationCycleLayer = null;
    this.locationCycleEpoch = 0;
    this.audio = new AudioManager();
    this.resources = new ResourceManager(this.audio);
    this.resourceLoading = null;
    this.pendingEntry = null;
    this.entryInFlight = false;
    this.i18n = new I18n(localStorage.getItem("tianji.lang") || "zh-CN");
    this.state = null;
    this.rng = new RNG(Date.now());
    this.debug = false;
    this.debugAudioHoldTimer = null;
    this.debugAudioHoldPointerId = null;
    this.debugAudioHoldOrigin = null;
    this.suppressAudioClickUntil = 0;
    this.combatFeedback = null;
    this.combatFeedbackTimer = null;
    this.combatStatusInfo = null;
    this.enemyActionFx = null;
    this.playerCardActionFx = null;
    this.artifactActionFx = null;
    this.artifactInfoId = null;
    this.artifactInfoSlotIndex = null;
    this.artifactInfoExpiresAt = 0;
    this.artifactInfoScreen = null;
    this.artifactInfoCombatRef = null;
    this.artifactInfoTimer = null;
    this.artifactCapacityFeedback = null;
    this.artifactCapacityFeedbackTimer = null;
    this.damageTakenFx = new Map();
    this.enemyDeathFx = new Map();
    this.resourcePopups = new Map();
    this.resourceFlashes = new Map();
    this.revivalVisuals = new Map();
    this.statusPopups = new Map();
    this.statusPopupClocks = new Map();
    this.statusPopupRenderScheduled = false;
    this.statusPopupCombatRef = null;
    this.statusPopupSequence = 0;
    this.statusPopupAudioClocks = new Map();
    this.statusPopupAudioBursts = new Map();
    this.hpCriticalVisualEpoch = performance.now();
    // While an HP damage popup is animating, ordinary combat renders are deferred.
    // Rebuilding the same popup DOM restarts its CSS animation and makes one hit
    // look like two identical damage numbers. Damage popups force exactly one
    // render at their start and one after the last locked popup finishes.
    this.combatRenderLocks = 0;
    this.pendingCombatRender = false;
    this.damagePopupRenderScheduled = false;
    this.combatLogSnapTimer = null;
    this.combatLayoutRaf = 0;
    this.combatLayoutSettleTimer = null;
    this.mindSeaOpen = false;
    this.mindSeaFilter = "all";
    this.mindSeaSelectedCardUid = null;
    this.mindSeaSelectedAt = 0;
    this.mindSeaOpenedAt = 0;
    this.mindSeaSelectedOverlayOpacity = 0;
    this.mindSeaSealFailureAt = null;
    this.previewCardArtStartedAt = Date.now();
    this.mapInventoryExpanded = false;
    this.inventorySelectedId = null;
    this.inventoryUseInFlight = false;
    this.pendingInventoryScrollToId = null;
    this.pathFogClearingTarget = null;
    this.pathRayRevealStartedAt = null;
    // One real motion epoch for every route ray in this app lifetime. Because the
    // UI rebuilds with innerHTML, new ray DOM resumes the old animation phase by
    // receiving a negative delay derived from this timestamp instead of restarting.
    this.pathRayMotionStartedAt = performance.now();
    this.pathFogClearTimer = null;
    // During a battle-entry blur, keep rendering the source node's path choices so
    // the map background does not collapse after currentNodeId has already advanced.
    this.mapBattleTransitionSourceNodeId = null;
    this.mapInfoKey = null;
    this.manualUseConfirm = null;
    this.treasureTokenConfirm = false;
    this.refineBodyConfirm = false;
    this.refineSpiritPillSelection = 0;
    this.manualStudySelection = null;
    this.manualStudyConfirm = null;
    this.manualStudyFocusPillSelection = 0;
    this.harmonizeSelection = [];
    this.harmonizeConfirm = null;
    this.refineStatsOpen = false;
    this.completionRecordOpen = false;
    this.completionRecordPreview = null;
    this.activeRunClockStartedAt = null;
    this.runClockPageHidden = false;
    this.runClockWindowFocused = document.hasFocus?.() ?? true;
    this.deathReviewOpen = false;
    this.enemyBuffMarqueeStartedAt = new Map();
    this.merchantTextMarqueeStartedAt = new Map();
    this.verticalTextMarqueeStartedAt = new Map();
    // One low-resolution background-color scan per portrait source. Cached
    // promises also deduplicate simultaneous copies of the same enemy.
    this.enemyArtBottomCache = new Map();
    // Enemy-card geometry is intentionally stable for the lifetime of a visible
    // enemy-count state. Vertical geometry uses the mobile small viewport (100svh),
    // i.e. the address-bar-visible baseline, even if combat starts while browser
    // chrome is hidden. Live toolbar motion may only release the hand from bottom
    // pinning; it never enlarges the battlefield/cards.
    this.combatEnemyLayout = null;
    this.combatViewportSnapshot = null;
    // UI-only meditation progress endpoint. It survives result-modal renders so
    // the interrupted/full bar remains visibly frozen until the player dismisses
    // that result, then it is explicitly cleared by RestEngine.
    this.restProgressHold = null;
    // Refine-Body may show its success modal halfway through the 560ms HP popup.
    // Keep dismissal locked until that exact popup promise completes.
    this.restSuccessDismissLocked = false;
    // Opening-story transition is intentionally UI-only: five narration prompts
    // hide the game shell. Closing prompt five starts a 3500ms blackout with
    // footsteps at +200/+1200ms, then a dismissible 2s autosave notice and 2s
    // reveal. Map BGM enters 1.5s into the reveal and fades to normal over 2s.
    this.openingTransitionStage = null;
    this.openingRevealTimer = null;
    // Battle entry: battle-start at 0ms, sword-approach at 666ms; visual blur starts
    // at +50ms and finishes after 1500ms. Combat BGM enters at visual +1250ms.
    this.battleTransitionStage = null;

    this.effects = new EffectEngine(this);
    this.enemyAI = new EnemyAI(this);
    this.combat = new CombatEngine(this);
    this.map = new MapEngine(this);
    this.shop = new ShopEngine(this);
    this.events = new EventEngine(this);
    this.rest = new RestEngine(this);

    this.root.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.root.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.root.addEventListener("pointerup", (e) => this.onPointerEnd(e));
    this.root.addEventListener("pointercancel", (e) => this.onPointerEnd(e));
    this.root.addEventListener("selectstart", (e) => e.preventDefault());
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("change", (e) => this.onChange(e));
    this.root.addEventListener("contextmenu", (e) => this.onContextMenu(e));
    this.root.addEventListener("wheel", (e) => this.onCombatLogWheel(e), { passive: false });
    this.root.addEventListener("scroll", (e) => this.onCombatLogScroll(e), true);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.runClockWindowFocused = document.hasFocus?.() ?? true;
      this.onRunClockVisibilityChanged();
    });
    window.addEventListener("blur", () => {
      this.runClockWindowFocused = false;
      this.onRunClockVisibilityChanged();
    });
    window.addEventListener("focus", () => {
      this.runClockWindowFocused = true;
      this.onRunClockVisibilityChanged();
    });
    window.addEventListener("pagehide", () => {
      this.runClockPageHidden = true;
      this.onRunClockVisibilityChanged();
    });
    window.addEventListener("pageshow", () => {
      this.runClockPageHidden = false;
      this.runClockWindowFocused = document.hasFocus?.() ?? true;
      this.onRunClockVisibilityChanged();
    });
    // Hand overlap still follows ordinary viewport changes. Enemy vertical geometry
    // stays on the small-viewport baseline, so address-bar show/hide can only toggle
    // whether the hand is pinned or participates in document flow.
    window.addEventListener("resize", () => {
      this.scheduleCombatLayout();
    });
    // The player HUD can be fixed while the stage scrolls. Re-anchor its FX
    // without rebuilding cards or restarting their persistent animations.
    window.addEventListener("scroll", () => this.positionCombatFxLayer(), { passive: true, capture: true });
    // Rotation is a genuine screen-geometry change. Establish a fresh small-viewport
    // baseline for the new orientation.
    window.addEventListener("orientationchange", () => {
      if (this.state?.screen === "combat") {
        this.combatViewportSnapshot = null;
        this.combatEnemyLayout = null;
      }
      this.scheduleCombatLayout({ recalculateEnemy: true });
    });
  }

  start() { this.render(); this.resources.registerWorker(); }

  updateResourceLoading(progress) {
    if (!this.resourceLoading) return;
    this.resourceLoading = { ...this.resourceLoading, ...progress,
      percent: Math.max(this.resourceLoading.percent ?? 0, progress.percent ?? 0) };
    const bar = this.root.querySelector("[data-resource-progress]");
    const fill = this.root.querySelector("[data-resource-fill]");
    const detail = this.root.querySelector("[data-resource-detail]");
    if (!bar || !fill || !detail) return this.render();
    bar.setAttribute("aria-valuenow", String(this.resourceLoading.percent));
    if (this.resourceLoading.percent === 100) fill.style.transition = "none";
    fill.style.width = `${this.resourceLoading.percent}%`;
    detail.textContent = progress.total
      ? this.i18n.t("loading.resources", { resource: this.i18n.t(`loading.${progress.category}`),
        current: progress.completed, total: progress.total })
      : this.i18n.t("loading.check");
  }

  async enterWhenResourcesReady(request = this.pendingEntry) {
    if (!request || this.entryInFlight) return;
    this.entryInFlight = true;
    this.pendingEntry = request;
    this.audio.unlock();
    if (request.kind === "continue" && request.saved.language) this.i18n.setLanguage(request.saved.language);
    this.resourceLoading = { percent: this.resourceLoading?.percent ?? 0,
      category: "check", completed: 0, total: 0, error: null };
    this.render();
    try {
      await this.resources.ensureReady({ onProgress: (progress) => this.updateResourceLoading(progress) });
      // Prepare native media before gameplay, including already decoded SFX.
      this.audio.preload?.(Object.keys(AUDIO_FILES));
      this.resources.applyBackgrounds();
      // All bytes are verified, short files decode correctly, and media is warmed.
      // Keep the actual 100% frame visible for the requested half second.
      await this.wait(500);
    } catch (error) {
      this.resourceLoading = { ...this.resourceLoading, percent: Math.min(99, this.resourceLoading.percent),
        error: { category: error.category ?? "check" } };
      this.entryInFlight = false;
      this.render();
      return;
    }
    this.resourceLoading = null;
    this.pendingEntry = null;
    this.entryInFlight = false;
    // No save, RNG, opening story or run clock is changed until readiness.
    if (request.kind === "new") this.beginReadyRun(request);
    else this.resumeReadyRun(request.saved);
  }

  beginReadyRun({ styleId, seed }) {
    this.clearRevivalVisuals?.();
    this.pursuitResults?.reset();
    this.tutorialPursuitResultId = null;
    this.tutorialResetNotice = false;
    this.tutorialResetConfirm = false;
    this.restartConfirm = false;
    this.newRunConfirm = null;
    this.playedCardManaCost = null;
    this.locationCycleLayer = null;
    this.dismissTimedNotice?.({ updateUi: false });
    this.rewindNotices = [];
    this.infoCopyNotice = null;
    this.resetTutorialIdle?.();
    this.inventorySelectedId = null;
    this.pendingInventoryScrollToId = null;
    this.tutorials?.dismiss();
    this.tutorialEntryCombatRef = null;
    this.tutorialAutoTurnRef = null;
    this.clearArtifactInfo();
    this.clearArtifactCapacityFeedback();
    this.completionRecordOpen = false;
    this.completionRecordPreview = null;
    this.rng = new RNG(seed);
    this.activeRunClockStartedAt = null;
    const nextState = createInitialState({ styleId, artifactId: "tianji", language: this.i18n.language,
      seed, rngSnapshot: this.rng.snapshot() });
    // Readiness and the 100% hold have finished; a complete replacement state
    // already exists. Only now discard the old run, checkpoint and rewind nodes.
    this.save.clear();
    this.state = nextState;
    // Only a successfully created new run resets the saved user volume.
    // Continue/rewind and failed or canceled readiness keep the current step.
    this.audio.setVolumeLevel?.(.75);
    this.syncActiveRunClock();
    this.persist();
    this.map.resolveCurrent();
    // The first rewind node still starts after the final opening prompt.
    this.persist();
    this.render();
  }

  resumeReadyRun(saved) {
    this.suppressPursuitFeedback = true;
    try {
      this.loadState(saved);
      this.syncActiveRunClock();
      if (this.state.map.pursuitContinuation) return this.resumePursuitContinuation();
      this.state.map.pendingMoveTarget ??= null;
      if (this.state.screen === "map" && !this.state.map.resolved[this.state.map.currentNodeId]) return this.map.resolveCurrent();
      if (this.state.screen === "map" && !this.state.map.postBattlePrompt) {
        this.map.preparePathSelection();
        this.persist();
      }
      this.render();
    } finally {
      this.suppressPursuitFeedback = false;
      this.pursuitResults?.reset();
    }
  }

  isDebugPanelScreen() {
    return ["map", "shop", "event", "rest"].includes(this.state?.screen);
  }

  toggleDebugPanel() {
    if (!this.isDebugPanelScreen()) return false;
    this.debug = !this.debug;
    if (!this.debug) {
      this.refineStatsOpen = false;
      if (this.completionRecordPreview) {
        this.completionRecordOpen = false;
        this.completionRecordPreview = null;
      }
    }
    this.render();
    return true;
  }

  cancelDebugAudioHold() {
    if (this.debugAudioHoldTimer !== null) clearTimeout(this.debugAudioHoldTimer);
    this.debugAudioHoldTimer = null;
    this.debugAudioHoldPointerId = null;
    this.debugAudioHoldOrigin = null;
  }

  syncRng() { if (this.state) this.state.rng = this.rng.snapshot(); }

  isRunClockForeground() {
    if (this.runClockPageHidden || this.runClockWindowFocused === false) return false;
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden" && (document.hasFocus?.() ?? true);
  }

  syncActiveRunClock(now = performance.now()) {
    const run = this.state?.run;
    if (!run) { this.activeRunClockStartedAt = null; return; }
    if (this.activeRunClockStartedAt !== null) {
      run.activeForegroundMs = Math.max(0, Number(run.activeForegroundMs) || 0)
        + Math.max(0, now - this.activeRunClockStartedAt);
    }
    this.activeRunClockStartedAt = !run.completed && this.isRunClockForeground() ? now : null;
  }

  onRunClockVisibilityChanged() {
    this.syncTutorialIdleTimer();
    if (!this.state?.run || this.state.run.completed) return;
    this.persist(); // Flush the active interval before the browser suspends this tab.
  }

  finishRunClockAtGateVictory(now = performance.now()) {
    if (!this.state?.run || this.state.run.completed) return;
    this.syncActiveRunClock(now);
    this.activeRunClockStartedAt = null;
    completeRun(this.state);
  }

  persist(checkpoint = false) {
    if (!this.state) return;
    this.syncActiveRunClock();
    this.syncRng();
    this.save.saveRun(this.state);
    if (checkpoint) this.save.saveCheckpoint(this.state);
  }

  loadState(state) {
    this.clearRevivalVisuals?.();
    this.pursuitResults?.reset();
    this.tutorialPursuitResultId = null;
    this.tutorialResetNotice = false;
    this.tutorialResetConfirm = false;
    this.restartConfirm = false;
    this.newRunConfirm = null;
    this.playedCardManaCost = null;
    this.locationCycleLayer = null;
    this.dismissTimedNotice?.({ updateUi: false });
    this.rewindNotices = [];
    this.infoCopyNotice = null;
    this.resetTutorialIdle?.();
    this.inventorySelectedId = null;
    this.pendingInventoryScrollToId = null;
    // UI learning survives all loads and rewinds; only transient display/busy flags reset.
    this.tutorials?.dismiss();
    this.tutorialEntryCombatRef = null;
    this.tutorialAutoTurnRef = null;
    this.clearArtifactInfo?.();
    this.clearArtifactCapacityFeedback?.();
    this.activeRunClockStartedAt = null;
    this.state = state;
    resetCombatVisualEpoch(this.state.combat);
    this.clearMindSeaSelection?.();
    // Existing saves gain the correct style/enemy base rates once; explicit
    // (including zero) values remain intact for future modifiers and debugging.
    this.state.player.evasion ??= STYLES[this.state.player.styleId]?.evasion ?? 0;
    for (const enemy of this.state.combat?.enemies ?? []) enemy.evasion ??= ENEMIES[enemy.enemyId]?.evasion ?? 0;
    ensureCardUseCounts(this.state.player);
    removeSealedCardsFromCombat(this.state);
    this.state.map.revealedPaths ??= {};
    this.state.map.postBattlePrompt ??= this.state.map.postBattleRestPrompt ?? null;
    this.state.map.restContext ??= this.state.map.restPursuitAfter
      ? { type: "postBattle", nodeId: this.state.map.currentNodeId }
      : null;
    this.state.map.restHeartDemonResult ??= null;
    this.state.map.restSuccessResult ??= null;
    this.state.map.harmonyMilestoneResult ??= null;
    this.state.map.pendingRestCardUnlock ??= null;
    this.state.map.pendingRestCardUnlocks ??= [];
    this.state.map.restCardUnlockResult ??= null;
    this.state.map.manualLearnResult ??= null;
    this.state.run ??= {};
    if (!this.state.run.completed) {
      // Previous versions did not record foreground intervals. Past hidden time
      // cannot be reconstructed, so an unfinished older save starts at zero.
      this.state.run.activeForegroundMs = Math.max(0, Number(this.state.run.activeForegroundMs) || 0);
    }
    ensureRunRecords(this.state);
    if (typeof this.state.run.openingWolfDefeated !== "boolean") {
      const c = this.state.combat;
      // Legacy saves have no victory flag. A visible introductory victory is
      // direct evidence; otherwise use their completed node and recorded wins.
      this.state.run.openingWolfDefeated = Boolean(isOpeningWolfCombat(c)
        ? c.runRecordOutcome === "victory" || c.result?.type === "victory" || c.result?.type === "swiftKill"
        : [...OPENING_BATTLE_NODES].some((node) => this.state.map.resolved?.[node]) && this.state.run.records.battleWins > 0);
    }
    this.state.run.uniqueDropFlags ??= {};
    this.state.run.chapterIndex = Math.max(1, Math.min(4, Math.floor(Number(this.state.run.chapterIndex) || 1)));
    this.state.run.uniqueChapterDropFlags ??= {};
    this.state.world ??= { flags: {} };
    this.state.world.flags ??= {};
    this.state.world.flags.shopPurchasedArtifacts ??= [];
    if (hasTreasureToken(this.state.player)) this.state.world.flags.treasureTokenGranted = true;
    else this.state.world.flags.treasureTokenGranted ??= false;
    this.state.map.pursuitPrompt ??= null;
    this.state.map.zhengyangChiefPursuitHideRemaining = Math.max(0, Math.floor(this.state.map.zhengyangChiefPursuitHideRemaining ?? 0));
    this.state.map.rookieSquadPursuitStateByChapter ??= {};
    for (const [chapter, value] of Object.entries(this.state.map.rookieSquadPursuitStateByChapter)) {
      if (!["unseen", "escapedCooldown", "escaped", "defeated"].includes(value)) delete this.state.map.rookieSquadPursuitStateByChapter[chapter];
    }
    this.state.map.eventFlags ??= {};
    this.state.map.openingStoryDismissed ??= this.state.map.currentNodeId !== "0B";
    this.state.map.openingStoryStep ??= this.state.map.openingStoryDismissed ? 5 : 1;
    // Legacy migration: v0.2.48 expanded the five-prompt opening to six prompts. Preserve the nearest
    // semantic position for an unresolved v0.2.46 opening instead of replaying copy
    // the player has already passed: old 2/3/4/5 map to new 3/4/5/6.
    if (!this.state.map.eventFlags.openingStorySixStepV247) {
      if (this.state.map.currentNodeId === "0B" && !this.state.map.openingStoryDismissed) {
        const oldStep = Math.max(1, Math.min(5, Math.floor(this.state.map.openingStoryStep ?? 1)));
        this.state.map.openingStoryStep = oldStep >= 2 ? Math.min(6, oldStep + 1) : 1;
      }
      this.state.map.eventFlags.openingStorySixStepV247 = true;
    }
    if (!this.state.map.eventFlags.openingStorySevenStepV250) {
      if (this.state.map.currentNodeId === "0B" && !this.state.map.openingStoryDismissed) {
        const oldStep = Math.max(1, Math.min(6, Math.floor(this.state.map.openingStoryStep ?? 1)));
        this.state.map.openingStoryStep = oldStep >= 6 ? 7 : oldStep;
      }
      this.state.map.eventFlags.openingStorySevenStepV250 = true;
    }
    if (!this.state.map.eventFlags.openingStorySixStepV251) {
      if (this.state.map.currentNodeId === "0B" && !this.state.map.openingStoryDismissed) {
        const oldStep = Math.max(1, Math.min(7, Math.floor(this.state.map.openingStoryStep ?? 1)));
        this.state.map.openingStoryStep = Math.min(6, oldStep);
      }
      this.state.map.eventFlags.openingStorySixStepV251 = true;
    }
    if (!this.state.map.eventFlags.openingStoryFiveStepV289) {
      if (this.state.map.currentNodeId === "0B" && !this.state.map.openingStoryDismissed) {
        this.state.map.openingStoryStep = Math.max(1, Math.min(5, Math.floor(this.state.map.openingStoryStep ?? 1)));
      }
      this.state.map.eventFlags.openingStoryFiveStepV289 = true;
    }
    if (this.state.map.currentNodeId !== "0B" || this.state.map.openingStoryDismissed) this.state.map.openingStoryStep = 5;
    const loadedLayer = this.map?.currentNode?.()?.layer ?? 0;
    this.state.map.depthSevenWarningDismissed = loadedLayer >= 7 || Boolean(this.state.map.depthSevenWarningDismissed);
    this.state.map.depthSevenWarningPending = false;
    this.manualUseConfirm = null;
    this.treasureTokenConfirm = false;
    this.refineBodyConfirm = false;
    this.refineSpiritPillSelection = 0;
    this.manualStudySelection = null;
    this.manualStudyConfirm = null;
    this.manualStudyFocusPillSelection = 0;
    this.harmonizeSelection = [];
    this.harmonizeConfirm = null;
    this.state.map.randomEventPool ??= ["rift", "corpse", "tablet"];
    // v0.1.86 adds Tablet to the chapter pool. Older saves predate this event,
    // so add it exactly once without reviving any Ravine/Corpse already consumed.
    if (!this.state.map.eventFlags.randomEventPoolV186) {
      if (!this.state.map.randomEventPool.includes("tablet")) this.state.map.randomEventPool.push("tablet");
      this.state.map.eventFlags.randomEventPoolV186 = true;
    }
    // Opening-only legacy migration follows the current 60% Max HP (floor) rule.
    // Only migrate saves that are still at the unresolved opening node so progressed
    // runs keep their earned/lost HP untouched.
    if (!this.state.map.eventFlags.openingHpV187 && this.state.map.currentNodeId === "0B" && !this.state.map.resolved?.["0B"]) {
      this.state.player.hp = Math.max(0, Math.floor((this.state.player.maxHp ?? 0) * 0.60));
      this.state.map.eventFlags.openingHpV187 = true;
    }
    // v0.1.88 retires the legacy fixed-ravine event. Any old save paused in one
    // of the four fixed-opportunity nodes resumes at the new Blood Altar intro.
    if (this.state.screen === "event"
      && ["rift", "fixedRift"].includes(this.state.overlay?.eventId)
      && ["4C", "13A", "14C", "17B"].includes(this.state.overlay?.nodeId)) {
      this.state.overlay.eventId = "altar";
      this.state.overlay.stage = "intro";
      this.state.overlay.result = null;
      this.state.overlay.pendingDeath = false;
    }
    // v0.1.89 replaces the temporary Altar placeholders at 14C and 17B with
    // their dedicated fixed opportunities. Saves paused inside those old Altar
    // overlays resume at the new event intro instead of carrying stale choices.
    if (this.state.screen === "event" && this.state.overlay?.eventId === "altar") {
      if (this.state.overlay?.nodeId === "14C") {
        this.state.overlay.eventId = "firePit";
        this.state.overlay.stage = "intro";
        this.state.overlay.result = null;
        this.state.overlay.pendingDeath = false;
      } else if (this.state.overlay?.nodeId === "17B") {
        this.state.overlay.eventId = "alchemy";
        this.state.overlay.stage = "intro";
        this.state.overlay.result = null;
        this.state.overlay.pendingDeath = false;
      }
    }
    // v0.1.87 replaces the legacy Spirit Vein button screen with the same
    // modal choice/result flow used by scripted opportunities. Resume an older
    // save paused at 10B directly inside the new Spirit Vein intro.
    if (this.state.screen === "spirit" && MAP_NODES[this.state.map.currentNodeId]?.type === "spirit"
      && !this.state.map.resolved?.[this.state.map.currentNodeId]) {
      this.state.screen = "event";
      this.state.overlay = { eventId: "spiritVein", nodeId: this.state.map.currentNodeId, stage: "intro", result: null, pendingDeath: false };
    }
    this.state.map.shopStocks ??= {};
    this.state.map.shopUi ??= { nodeId: null, entered: false, tab: "buy" };
    this.state.map.shopUi.leavePrompt ??= false;
    this.state.map.shopUi.discountPrompt ??= false;
    this.state.map.shopUi.discountRollUsed ??= false;
    this.state.map.shopUi.discountActive ??= false;
    this.state.map.shopUi.retentionUsed ??= false;
    this.state.map.shopUi.debugSession ??= false;
    this.state.map.shopUi.portableSession ??= false;
    this.state.map.shopUi.returnScreen ??= null;
    this.state.map.shopUi.purchaseSpent ??= 0;
    this.state.map.shopUi.giftPrompt ??= false;
    this.state.map.pathRecoveryAtNode ??= null;
    this.state.map.pendingSenseRecoveryNode ??= null;
    this.state.map.pursuitStealth = Math.max(0, Math.min(3, Math.floor(this.state.map.pursuitStealth ?? 0)));
    this.state.map.pendingMoveHadPursuit = Boolean(this.state.map.pendingMoveHadPursuit);
    this.state.map.pendingMoveHadLongBattle = Boolean(this.state.map.pendingMoveHadLongBattle);
    this.state.run ??= {};
    this.rest.ensureRefineStats();
    this.refineStatsOpen = false;
    this.completionRecordOpen = false;
    this.completionRecordPreview = null;
    this.deathReviewOpen = false;
    if (this.state.run.openingManaExhausted && this.state.map.currentNodeId === "0B" && !this.state.map.resolved?.["0B"]) {
      // Migrate v0.1.66/67 opening saves into the v0.1.68 opening state.
      this.state.player.hp = Math.max(0, Math.floor(this.state.player.maxHp * 0.60));
      this.state.player.mana = 0;
      this.state.player.sense = 1;
      this.state.player.inventory ??= {};
      this.state.player.inventory.bloodPill = Math.max(1, this.state.player.inventory.bloodPill ?? 0);
      this.state.map.pathRecoveryAtNode = "0B";
    }
    delete this.state.run.openingManaExhausted;
    delete this.state.map.senseRecoveredLayers;
    // v0.2.52 removes the old rewind Heart-Demon escalation entirely.
    delete this.state.run.rewindsAtCheckpoint;
    delete this.state.run.rewindPenaltyCanIncrease;
    // Resource popups use the stable player unit key on every screen. Older saves
    // and pre-combat fresh runs may not yet carry the combat-time kind marker.
    this.state.player.kind = "player";
    // Legacy saves may still carry the retired Iron Body status.
    if (this.state.player.statuses) delete this.state.player.statuses.superArmor;
    this.state.player.buffOrder = (this.state.player.buffOrder ?? []).filter((key) => key !== "superArmor");
    this.state.player.harmonizeCount = Math.max(0, Math.floor(Number(this.state.player.harmonizeCount) || 0));
    ensureHarmonizeSenseProgress(this.state.player, {
      pendingMilestone: this.state.map.restSuccessResult?.type === "harmonize" && this.state.map.restSuccessResult.milestone,
    });
    this.state.player.buffOrder ??= [];
    ensureArtifactCollections(this.state.player);
    ensureInventoryOrder(this.state.player);
    if (this.state.run.completed) completeRun(this.state);
    if (this.state.combat?.log?.some((entry) => typeof entry === "string")) this.state.combat.log = [];
    if (this.state.combat) {
      // v0.1.67 awarded loot as soon as each enemy died. For a legacy mid-combat
      // save, discard the mirrored combat loot ledger so victory cannot grant the
      // same already-received drops a second time. New v0.1.68 combats carry an
      // explicit lootGranted flag and keep all drops pending until victory.
      if (this.state.combat.lootGranted == null) {
        this.state.combat.loot = { stones: 0, items: {} };
        this.state.combat.lootGranted = false;
      } else {
        this.state.combat.loot ??= { stones: 0, items: {} };
      }
      this.state.combat.result ??= null;
      if (!this.state.combat.result) recordBattleStart(this.state);
      this.state.combat.dealingCards = false;
      this.state.combat.lastDealtCardUid = null;
      this.state.combat.cardResolving = false;
      this.state.combat.cardPlayLockUntil = Math.max(0, Number(this.state.combat.cardPlayLockUntil ?? 0));
      for (const enemy of this.state.combat.enemies) {
        enemy.statuses ??= {};
        enemy.buffOrder ??= [];
        enemy.nonliving ??= Boolean(ENEMIES[enemy.enemyId]?.nonliving);
        if (["stoneGolem", "gate"].includes(enemy.enemyId)) {
          // Remove the retired opening Steadfast from old combats while retaining
          // buffs earned from skills (e.g. the Gate's Reflection/Undying).
          for (const key of ["steadfast", "stun", "darkForce"]) removeStatus(enemy, key, Infinity);
          delete enemy.combatFlags?.darkForceInstances;
        }
        delete enemy.statuses.superArmor;
        enemy.buffOrder = enemy.buffOrder.filter((key) => key !== "superArmor");
        // Update opening buffs in existing mid-battle saves as well as new spawns.
        const refreshedOpeningBuffs = new Set([
          "stoneGolem", "gate", "tiger", "zhengyangDisciple", "zhengyangElite",
          "zhengyangChief", "zhengyangLeftProtector",
        ]);
        if (refreshedOpeningBuffs.has(enemy.enemyId)) {
          if (enemy.enemyId.startsWith("zhengyang")) {
            delete enemy.statuses.heatResistance;
            enemy.buffOrder = enemy.buffOrder.filter((key) => key !== "heatResistance");
          }
          for (const key of ["steadfast", "coldResistance"]) {
            if ((ENEMIES[enemy.enemyId]?.startingStatuses?.[key] ?? 0) > 0 && !(enemy.statuses[key] > 0)) addStatus(enemy, key, 1);
          }
        }
        // v0.1.68 makes all enemy resistances explicit permanent opening buffs.
        // Legacy combat saves are normalized here so hidden raw resistance values
        // cannot survive the migration or disappear when the new status pipeline runs.
        enemy.resist = {};
        const resistanceBuff = enemy.enemyId === "spider" ? "heatResistance"
            : enemy.enemyId === "whiteJadePython" ? "hardness"
              : ["pursuerSword", "pursuerElite"].includes(enemy.enemyId) ? "swordIntentGourd"
                : enemy.enemyId === "fiveElementsDisciple" ? "fiveElementsSecret"
                  : null;
        if (resistanceBuff && !(enemy.statuses[resistanceBuff] > 0)) addStatus(enemy, resistanceBuff, 1);
      }
      this.state.combat.enemyTurnOrder ??= [...this.state.combat.enemies]
        .filter((enemy) => enemy.hp > 0)
        .sort((a, b) => b.speed - a.speed)
        .map((enemy) => enemy.uid);
      this.combat.ensureEnemyDuplicateLabels();
    }
    this.i18n.setLanguage(state.language || "zh-CN");
    this.rng = new RNG(state.rng?.seed ?? state.run.seed, state.rng?.state);
    // One-time v0.2.51 migration: old per-round rewind memories are intentionally
    // ignored. If an upgraded save is already sitting safely on a resolved map node,
    // use that current map state as its new baseline node so the feature is not empty
    // until another forward-node Sense recovery occurs. Mid-combat saves receive no
    // synthetic combat checkpoint and must reach the next real map recovery first.
    if ((this.save.availableRewindDepth?.() ?? 0) === 0
      && this.state.screen === "map" && !this.state.combat
      && this.state.map.openingStoryDismissed
      && this.state.map.resolved?.[this.state.map.currentNodeId]) {
      this.save.resetRewindHistory(this.state);
    }
  }

  bgmForCurrentScene() {
    if (!this.state) return null;
    const openingStoryActive = this.state.screen === "map"
      && this.state.map.currentNodeId === "0B"
      && !this.state.map.openingStoryDismissed;
    if (openingStoryActive || ["blackout", "reveal"].includes(this.openingTransitionStage)) return null;
    // Battle entry owns its own audio schedule. Map BGM is cut when blur begins,
    // and Combat BGM is started manually 1250ms into the 1500ms visual transition.
    if (this.battleTransitionStage) return null;
    if (this.state.screen === "combat") {
      if (this.state.combat?.result) return null;
      return this.state.combat?.enemies?.some((enemy) => enemy.enemyId === "gate") ? "gateCombat" : "combat";
    }
    if (this.state.screen === "rest") return "rest";
    if (this.state.screen === "shop") return "merchant";
    if (["map", "event", "spirit"].includes(this.state.screen)) return "map";
    // Start/death/result screens intentionally leave BGM silent so their short
    // confirmation/death cues remain clean and browser autoplay is never required.
    return null;
  }

  syncSceneBgm() {
    const bgmId = this.bgmForCurrentScene();
    // Do not stomp a deliberate half-volume fade when a reveal/transition has
    // already started the same BGM. The fade is allowed to continue after the
    // image becomes fully clear.
    if (bgmId && this.audio.currentBgmId === bgmId && this.audio.bgmFadeTimer) return;
    this.audio.setBgm(bgmId, BGM_VOLUME[bgmId] ?? .30);
  }

  async copyGlobalInfo() {
    if (this.infoCopyInFlight) return;
    this.infoCopyInFlight = true;
    const button = this.root.querySelector?.('[data-action="copy-global-info"]');
    if (button) button.disabled = true;
    let copyResult = "failed";
    try {
      this.syncActiveRunClock();
      const text = buildGlobalInfoText(this);
      await writeGlobalInfoClipboard(text);
      copyResult = "copied";
    } catch {
      copyResult = "failed";
    } finally {
      this.infoCopyInFlight = false;
      const current = this.root.querySelector?.('[data-action="copy-global-info"]');
      if (current) current.disabled = false;
      this.showTimedNotice("copy", 1000, copyResult);
    }
  }

  showTimedNotice(kind, duration, copyResult = null) {
    this.dismissTimedNotice({ updateUi: false });
    this.infoCopyNotice = kind === "copy" ? copyResult : null;
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const notice = { kind, promise, resolve, timer: null, closeTimer: null, createdAt: Date.now(), closingAt: null };
    this.timedNotice = notice;
    this.syncGlobalInfoNotice();
    notice.timer = setTimeout(() => {
      // A late callback from a dismissed notice cannot close a newer one.
      if (this.timedNotice === notice) this.dismissTimedNotice();
    }, duration);
    return promise;
  }

  dismissTimedNotice({ updateUi = true } = {}) {
    const notice = this.timedNotice;
    // Loads/new runs/replacements cancel immediately; a player click or the
    // normal deadline completes a 500ms fade before releasing the continuation.
    if (notice && updateUi) {
      if (notice.closingAt != null) return notice.promise;
      if (notice.timer != null) clearTimeout(notice.timer);
      notice.timer = null;
      const node = this.root.querySelector?.(".info-copy-backdrop");
      const opacity = node && globalThis.getComputedStyle ? Number(getComputedStyle(node).opacity) : NaN;
      notice.closingOpacity = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity))
        : Math.min(1, Math.max(0, (Date.now() - notice.createdAt) / 500));
      notice.closingAt = Date.now();
      this.syncGlobalInfoNotice();
      notice.closeTimer = setTimeout(() => {
        if (this.timedNotice === notice) this.finishTimedNotice(notice, true);
      }, 500);
      return notice.promise;
    }
    this.finishTimedNotice(notice, updateUi);
  }

  finishTimedNotice(notice, updateUi) {
    const hadNotice = Boolean(notice || this.infoCopyNotice);
    this.timedNotice = null;
    this.infoCopyNotice = null;
    if (notice?.timer != null) clearTimeout(notice.timer);
    if (notice?.closeTimer != null) clearTimeout(notice.closeTimer);
    if (hadNotice && updateUi) this.syncGlobalInfoNotice();
    notice?.resolve();
  }

  syncGlobalInfoNotice() {
    this.root.querySelector?.(".info-copy-backdrop")?.remove();
    const html = globalInfoPromptHtml(this);
    // Clipboard completion should not rebuild a live damage/card animation.
    if (this.root.insertAdjacentHTML) this.root.insertAdjacentHTML("beforeend", html);
    else this.render();
  }

  showTutorialOnce(id, bodyKey = `tutorial.${id}`) {
    return this.tutorials?.enqueue(id, bodyKey) ?? false;
  }

  resetTutorialIdle() {
    if (this.tutorialIdleTimer != null) clearTimeout(this.tutorialIdleTimer);
    this.tutorialIdleTimer = null;
    this.tutorialIdleTurn = null;
  }

  noteTutorialCardPlayed(combat) {
    if (!this.tutorials || this.tutorials.seen.has("firstTurnEnd") || !combat) return;
    this.resetTutorialIdle?.();
    const now = Date.now();
    this.tutorialIdleTurn = { combat, round: combat.round, lastPlayedAt: now,
      focusedSince: this.isRunClockForeground() ? now : null };
    this.syncTutorialIdleTimer();
  }

  hasTutorialTurnIdle() {
    const idle = this.tutorialIdleTurn;
    return Boolean(idle && idle.combat === this.state?.combat && idle.round === this.state.combat.round
      && this.state.screen === "combat" && this.state.combat.phase === "player" && this.isRunClockForeground()
      && idle.focusedSince != null && Date.now() - Math.max(idle.lastPlayedAt, idle.focusedSince) >= TUTORIAL_IDLE_MS);
  }

  syncTutorialIdleTimer() {
    if (this.tutorialIdleTimer != null) clearTimeout(this.tutorialIdleTimer);
    this.tutorialIdleTimer = null;
    if (this.infoCopyNotice || this.timedNotice || this.rewindNotices?.length || this.tutorialResetConfirm) return;
    const idle = this.tutorialIdleTurn;
    if (!this.tutorials || this.tutorials.seen.has("firstTurnEnd") || !idle) return;
    if (idle.combat !== this.state?.combat || idle.round !== this.state.combat.round) {
      this.tutorialIdleTurn = null;
      return;
    }
    if (this.state.screen !== "combat" || this.state.combat.phase !== "player"
      || this.state.combat.result || this.state.player.hp <= 0 || !this.isRunClockForeground()) {
      // A blur/hidden page breaks continuity; refocusing starts a fresh ten seconds.
      idle.focusedSince = null;
      return;
    }
    idle.focusedSince ??= Date.now();
    const remaining = Math.max(idle.lastPlayedAt, idle.focusedSince) + TUTORIAL_IDLE_MS - Date.now();
    if (remaining <= 0) { this.showTutorialOnce("firstTurnEnd"); return; }
    this.tutorialIdleTimer = setTimeout(() => {
      this.tutorialIdleTimer = null;
      if (this.tutorialIdleTurn !== idle) return;
      this.syncTutorialIdleTimer();
      this.render();
    }, remaining);
  }

  isInventoryItemPresent(id) {
    const player = this.state?.player;
    if (!player) return false;
    if (id === "spiritStone") return true;
    return ITEMS[id] ? (player.inventory?.[id] ?? 0) > 0
      : Boolean(ARTIFACTS[id] && isArtifactOwned(player, id));
  }

  clearInventorySelectionAfterUse(id) {
    if (this.inventorySelectedId !== id) return;
    const player = this.state?.player;
    const item = ITEMS[id];
    if (!player || !item) return;
    const selfEffects = (item.effects ?? []).filter((effect) =>
      !effect.target || effect.target === "self");
    const restoresHp = selfEffects.some((effect) => effect.type === "heal" && effect.amount > 0);
    const restoresMana = item.manaGain > 0 || selfEffects.some((effect) =>
      effect.type === "gainMana" && effect.amount > 0);
    const exhausted = id === "spiritStone" ? (player.stones ?? 0) <= 0
      : !App.prototype.isInventoryItemPresent.call(this, id);
    if (exhausted || restoresHp && player.hp >= player.maxHp
      || restoresMana && player.mana >= player.maxMana) {
      // Only selection ends. The map bag's expanded state, combat overlay and
      // scroll position remain intact, ready for another actively selected item.
      this.inventorySelectedId = null;
      this.pendingInventoryScrollToId = null;
    }
  }

  isTutorialCombatReady() {
    const combat = this.state?.combat;
    return this.state?.screen === "combat" && combat && combat.phase === "player"
      && !combat.result && !combat.dealingCards && !combat.cardResolving
      && Date.now() >= (combat.cardPlayLockUntil ?? 0) && !(this.combatRenderLocks > 0)
      && this.tutorialEntryCombatRef !== combat && this.tutorialAutoTurnRef !== combat
      && !(this.tutorialActionDepth > 0)
      && this.state.player.hp > 0 && !isZeroHpPaused(this, this.state.player)
      && combat.enemies.some((enemy) => enemy.hp > 0);
  }

  hasUnaffordableOrEmptyHand() {
    const combat = this.state?.combat;
    if (!combat) return false;
    const player = this.state.player;
    const remaining = (combat.hand ?? []).map((uid) => player.deck.find((card) => card.uid === uid))
      .filter((card) => card && !card.sealed && CARDS[card.cardId]);
    // Compare each live cost, including zero-cost cards, upgrades and round discounts.
    return !remaining.some((card) => this.combat.getCardManaCost(card) <= player.mana);
  }

  resetTutorialLearning({ notice = false, ids = null } = {}) {
    this.resetTutorialIdle();
    this.tutorials?.reset(ids);
    if (ids == null) {
      this.tutorialPursuitResultId = null;
      this.tutorialResetConfirm = false;
      this.tutorialResetNotice = notice;
    }
  }

  commitPursuitSettlement() {
    if (this.suppressPursuitFeedback) return null;
    const result = this.pursuitResults?.commit(this.state?.map?.pursuit);
    if (result?.tutorialEligible) {
      this.tutorialPursuitResultId = result.id;
      this.showTutorialOnce("firstPursuit");
    }
    return result;
  }

  canShowPursuitResult(body) {
    if (this.playerDeathPending?.state === this.state) return false;
    return this.pursuitResults?.hasResult && this.state && !this.tutorials?.active
      && !this.infoCopyNotice && !this.timedNotice && !this.rewindNotices?.length
      && !this.tutorialResetNotice && !this.tutorialResetConfirm && !this.resourceLoading && !this.entryInFlight
      && !(this.tutorialActionDepth > 0) && !this.openingTransitionStage && !this.battleTransitionStage
      && !this.restProgressHold && !this.restSuccessDismissLocked && !(this.combatRenderLocks > 0)
      && ["map", "death"].includes(this.state.screen) && !this.state.combat
      && !/class="[^"]*\bmodal-backdrop\b/.test(body);
  }

  deferPursuitContinuation(transition) {
    this.commitPursuitSettlement();
    if (!this.pursuitResults?.hasResult) return this.runPursuitContinuation(transition);
    // Only an already-decided next action is persisted. Reading/rewinding never
    // reconstructs a pursuit popup from numeric differences in saved values.
    this.state.map.pursuitContinuation = { ...transition };
    this.persist();
    this.render();
    return true;
  }

  resumePursuitContinuation() {
    const transition = this.state?.map?.pursuitContinuation;
    if (!transition) return;
    delete this.state.map.pursuitContinuation;
    this.persist();
    return this.runPursuitContinuation(transition);
  }

  runPursuitContinuation(transition) {
    if (transition?.type === "rest" && MAP_NODES[transition.nodeId]) {
      return this.openRest({ nodeId: transition.nodeId, remaining: Math.max(1, Math.floor(transition.remaining ?? 1)) });
    }
    if (transition?.type === "qingyiAmbush") return this.combat.startEncounter("qingyiShop", { pursuit: false, nodeId: null });
    return this.render();
  }

  hasTutorialStatusToken() {
    const units = [this.state?.player,
      ...(this.state?.combat?.enemies ?? []).filter((enemy) => enemy.hp > 0)].filter(Boolean);
    return units.some((unit) => orderedBuffKeys(unit).some((key) => key !== "mainCharacterHalo"));
  }

  checkTutorialTriggers() {
    if (!this.tutorials || !this.state || this.infoCopyNotice || this.timedNotice || this.rewindNotices?.length || this.tutorialResetNotice || this.tutorialResetConfirm) return;
    const { screen, player, combat, map } = this.state;
    if (screen === "combat" && combat && !combat.result && player.hp > 0) {
      this.showTutorialOnce("firstCombat");
      if (this.isTutorialCombatReady() && (this.hasUnaffordableOrEmptyHand() || this.hasTutorialTurnIdle())) this.showTutorialOnce("firstTurnEnd");
      if (this.hasTutorialStatusToken()) {
        this.showTutorialOnce("firstEnemyBuff");
      }
    }

    if (screen === "rest") this.showTutorialOnce("firstRest");
    if (["map", "rest"].includes(screen) && this.mindSeaOpen) this.showTutorialOnce("firstMindSea");
    if (screen === "death") this.showTutorialOnce("firstDeath");
  }

  canShowTutorial(hint, body) {
    if (this.playerDeathPending?.state === this.state) return false;
    if (!this.state || this.infoCopyNotice || this.timedNotice || this.rewindNotices?.length || this.tutorialResetNotice || this.tutorialResetConfirm || this.resourceLoading || this.entryInFlight || this.openingTransitionStage
      || this.tutorialActionDepth > 0
      || this.battleTransitionStage || this.restProgressHold || this.restSuccessDismissLocked
      || /class="[^"]*\bmodal-backdrop\b/.test(body)) return false;
    const screen = this.state.screen;
    if (screen === "combat" && !this.isTutorialCombatReady()) return false;
    if (COMBAT_TUTORIAL_IDS.includes(hint.id) && screen !== "combat") return false;
    if (hint.id === "firstEnemyBuff" && !this.hasTutorialStatusToken()) return false;
    if (hint.id === "firstTurnEnd" && !this.hasUnaffordableOrEmptyHand() && !this.hasTutorialTurnIdle()) return false;
    if (hint.id === "firstPursuit" && (!["map", "death"].includes(screen) || !this.pursuitResults?.queue.some((result) =>
      result.id === this.tutorialPursuitResultId && result.delta > 0 && result.tutorialEligible))) return false;
    if (hint.id === "firstRest" && screen !== "rest") return false;
    if (hint.id === "firstMindSea" && (!["map", "rest"].includes(screen) || !this.mindSeaOpen)) return false;
    if (hint.id === "firstDeath" && screen !== "death") return false;
    if (hint.id === "firstArtifact" && ["start", "death"].includes(screen)) return false;
    return true;
  }

  render({ force = false } = {}) {
    if (globalThis.document) document.title = `${this.i18n.t("app.title")} · ${GAME_VERSION}`;
    if (this.resourceLoading) {
      this.audio.setBgm(null);
      this.root.innerHTML = loadingView(this);
      return;
    }
    // UI previews must not survive a removed artifact or a screen/encounter
    // change. Ordinary combat rerenders keep the same ten-second deadline.
    if ((this.artifactInfoId && !this.getArtifactInfoId())
      || (this.artifactInfoSlotIndex != null && this.getArtifactSlotInfoIndex() == null)) this.clearArtifactInfo();
    if (this.artifactCapacityFeedback && !this.isArtifactCapacityFeedbackFlashing()) this.clearArtifactCapacityFeedback();
    if (!force && this.state?.screen === "combat" && this.combatRenderLocks > 0) {
      this.pendingCombatRender = true;
      return;
    }
    const visibleCombat = this.state?.combat ?? null;
    if (this.statusPopupCombatRef !== visibleCombat) {
      this.statusPopups?.clear();
      this.statusPopupClocks?.clear();
      this.statusPopupAudioClocks?.clear();
      this.statusPopupAudioBursts?.clear();
      this.statusPopupCombatRef = visibleCombat;
    }
    // Rendering replaces the whole app DOM. Preserve the bag's own scroll offset
    // so consuming an item never jumps the inventory back to its first row.
    const inventoryGridBefore = this.root.querySelector?.(".inventory-grid");
    const inventoryScroll = inventoryGridBefore ? {
      top: inventoryGridBefore.scrollTop,
      left: inventoryGridBefore.scrollLeft,
      combat: Boolean(inventoryGridBefore.closest?.(".combat-inventory-panel")),
    } : null;
    const priorMindSeaFilter = this.root.querySelector?.(".mind-sea-filter.active")?.dataset.filter;
    const mindSeaScrollTop = this.mindSeaOpen && priorMindSeaFilter === this.mindSeaFilter
      ? this.root.querySelector?.(".mind-sea-grid")?.scrollTop ?? null : null;
    // Rebuilding a sell confirmation also rebuilds the scrollable item list.
    // An actual buy/sell tab switch has no matching old grid and starts at top.
    const sellGridBefore = this.state?.screen === "shop" && this.state.map.shopUi?.tab === "sell"
      ? this.root.querySelector?.(".merchant-grid-frame.sell-grid") : null;
    const sellScrollTop = sellGridBefore?.scrollTop ?? null;
    const previousEnemyPositions = this.captureEnemyPositions();
    if (this.state?.screen !== "combat") this.combatStatusInfo = null;
    if (!["map", "rest"].includes(this.state?.screen)) {
      this.mindSeaOpen = false;
      this.mindSeaFilter = "all";
      this.clearMindSeaSelection?.();
    }
    if (this.state?.screen !== "map") {
      this.mapInfoKey = null;
      this.mapInventoryExpanded = false;
    }
    if (this.inventorySelectedId && !this.isInventoryItemPresent(this.inventorySelectedId)) this.inventorySelectedId = null;
    const body = this.state ? (() => {
      if (this.state.screen === "map") return mapView(this);
      if (this.state.screen === "combat") return combatView(this);
      if (this.state.screen === "shop") return shopView(this);
      if (this.state.screen === "event") return eventView(this);
      if (this.state.screen === "rest") return restView(this);
      if (this.state.screen === "spirit") return spiritView(this);
      if (this.state.screen === "death") return deathView(this);
      return mapView(this);
    })() : startView(this);
    this.syncTutorialIdleTimer();
    this.checkTutorialTriggers();
    this.tutorials?.activateNext((hint) => this.canShowTutorial(hint, body));
    if (this.tutorials?.active?.id === "firstTurnEnd" && this.tutorialIdleTimer != null) {
      clearTimeout(this.tutorialIdleTimer);
      this.tutorialIdleTimer = null;
    }
    const tutorial = this.rewindNotices?.length ? "" : this.tutorialResetConfirm ? tutorialResetConfirmPromptHtml(this)
      : tutorialPromptHtml(this) + tutorialResetPromptHtml(this);
    if (this.canShowPursuitResult(body)) this.pursuitResults.activate();
    const pursuitResult = this.canShowPursuitResult(body) ? pursuitResultPromptHtml(this) : "";
    const playerDamageActive = this.state?.screen === "combat" && this.isDamageTakenFlashing?.(this.state.player);
    const playerDamageClass = playerDamageActive ? " player-damage-taken" : "";
    const playerDamageDuration = playerDamageActive ? this.getDamageTakenDuration?.(this.state.player) ?? 100 : 100;
    const playerDamageStyle = playerDamageActive ? ` style="--damage-taken-duration:${playerDamageDuration}ms"` : "";
    const playerDamageCover = playerDamageActive && this.isDamageTakenRedFlashing?.(this.state.player)
      ? `<div class="player-damage-taken-screen-cover" aria-hidden="true" style="--damage-taken-duration:${playerDamageDuration}ms"></div>`
      : "";
    const openingStoryActive = this.state?.screen === "map"
      && this.state.map.currentNodeId === "0B"
      && !this.state.map.openingStoryDismissed;
    const openingTransitionCover = this.openingTransitionStage === "blackout"
      ? `<div class="opening-transition-blackout" aria-hidden="true"></div>`
      : ["reveal", "reveal-bgm"].includes(this.openingTransitionStage)
        ? `<div class="opening-transition-reveal" aria-hidden="true"></div>`
        : "";
    const openingStoryClass = openingStoryActive ? " opening-story-game-hidden" : "";
    const battleTransitionClass = this.battleTransitionStage === "prelude"
      ? " battle-transition-prelude"
      : this.battleTransitionStage === "blur-out"
        ? " battle-transition-blur-out"
        : ["focus-in", "focus-in-bgm"].includes(this.battleTransitionStage)
          ? " battle-transition-focus-in"
          : "";
    this.root.innerHTML = resolveResourceHtml(`<div class="game-shell${playerDamageClass}${openingStoryClass}${battleTransitionClass}"${playerDamageStyle}>${topbar(this)}${body}</div>${playerDamageCover}${openingTransitionCover}${tutorial}${pursuitResult}${globalInfoPromptHtml(this)}${rewindResultPromptHtml(this)}`);
    this.hoistModalBackdrops();
    if (mindSeaScrollTop !== null && this.mindSeaOpen) {
      const mindSeaGridAfter = this.root.querySelector?.(".mind-sea-grid");
      if (mindSeaGridAfter) mindSeaGridAfter.scrollTop = mindSeaScrollTop;
    }
    if (sellScrollTop !== null && this.state?.screen === "shop" && this.state.map.shopUi?.tab === "sell") {
      const sellGridAfter = this.root.querySelector?.(".merchant-grid-frame.sell-grid");
      if (sellGridAfter) sellGridAfter.scrollTop = sellScrollTop;
    }
    this.layoutHand();
    if (this.state?.screen === "combat") {
      const visibleEnemyCount = this.root.querySelectorAll?.(".enemy-card[data-enemy-uid]")?.length ?? 0;
      const needsEnemyLayout = !this.combatEnemyLayout
        || this.combatEnemyLayout.combatRef !== this.state.combat
        || this.combatEnemyLayout.enemyCount !== visibleEnemyCount;
      this.layoutEnemyStage({ recalculate: needsEnemyLayout });
      this.alignHumanoidEnemyArts();
    } else {
      this.combatEnemyLayout = null;
      this.combatViewportSnapshot = null;
    }
    // FLIP-reorder after the final cached/new enemy geometry is applied. This avoids
    // animating toward a temporary pre-layout size when the visible enemy count changes.
    this.animateEnemyReorder(previousEnemyPositions);
    this.positionCombatFxLayer();
    this.syncStatusPopupAudio();
    this.syncEnemyBuffMarquees();
    this.syncMerchantTextMarquees();
    this.syncVerticalTextMarquees();
    this.focusCombatLog();
    this.syncSceneBgm();
    if (inventoryScroll) {
      const selector = inventoryScroll.combat
        ? ".combat-inventory-panel .inventory-grid"
        : ".map-screen .inventory-grid";
      const inventoryGridAfter = this.root.querySelector?.(selector);
      if (inventoryGridAfter) {
        inventoryGridAfter.scrollTop = inventoryScroll.top;
        inventoryGridAfter.scrollLeft = inventoryScroll.left;
      }
    }
    // Enemy-stage geometry determines the bag viewport height. Center only
    // after its cached/fresh layout is restored, using the final visible box.
    this.scrollSelectedInventoryItemIntoView?.();
  }

  scrollSelectedInventoryItemIntoView() {
    const id = this.pendingInventoryScrollToId;
    if (!id) return;
    this.pendingInventoryScrollToId = null;
    const screen = this.state?.screen;
    if (!["map", "combat"].includes(screen) || this.inventorySelectedId !== id
      || (screen === "combat" && this.state.overlay !== "inventory")) return;
    const selector = screen === "combat"
      ? ".combat-inventory-panel .inventory-grid"
      : ".map-screen .inventory-grid";
    const grid = this.root.querySelector?.(selector);
    const item = [...(grid?.querySelectorAll?.('[data-action="inventory-entry"]') ?? [])]
      .find((entry) => entry.dataset.id === id);
    if (!item || !grid.clientHeight) return;
    const itemBox = item.getBoundingClientRect(), gridBox = grid.getBoundingClientRect();
    const desired = grid.scrollTop + itemBox.top - gridBox.top - (grid.clientTop ?? 0)
      - (grid.clientHeight - itemBox.height) / 2;
    const top = Math.max(0, Math.min(Math.max(0, grid.scrollHeight - grid.clientHeight), desired));
    const behavior = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    if (grid.scrollTo) grid.scrollTo({ top, behavior });
    else grid.scrollTop = top;
  }



  positionCombatFxLayer() {
    if (this.state?.screen !== "combat") return;
    const layer = this.root.querySelector?.(".combat-fx-layer");
    const popups = layer?.querySelectorAll?.("[data-combat-fx-target]");
    if (!popups?.length) return;
    const origin = layer.getBoundingClientRect();
    const scaleX = origin.width && layer.clientWidth ? origin.width / layer.clientWidth : 1;
    const scaleY = origin.height && layer.clientHeight ? origin.height / layer.clientHeight : 1;
    const anchors = new Map();
    this.root.querySelectorAll?.("[data-combat-resource]").forEach((bar) => {
      anchors.set(bar.dataset.combatResource, bar);
    });
    popups.forEach((popup) => {
      const bar = anchors.get(popup.dataset.combatFxTarget);
      if (!bar) {
        popup.style.setProperty("--combat-fx-visibility", "hidden");
        return;
      }
      const rect = bar.getBoundingClientRect();
      const x = Number(popup.dataset.combatFxX) === .5 ? .5 : .8;
      popup.style.setProperty("--combat-fx-left", `${((rect.left + rect.width * x - origin.left) / scaleX).toFixed(2)}px`);
      popup.style.setProperty("--combat-fx-top", `${((rect.top + rect.height * .5 - origin.top) / scaleY).toFixed(2)}px`);
      popup.style.setProperty("--combat-fx-visibility", "visible");
    });
  }

  syncEnemyBuffMarquees() {
    const activeKeys = new Set();
    this.root.querySelectorAll?.(".enemy-buffs").forEach((row) => {
      const track = row.querySelector(".enemy-buff-track");
      if (!track) return;
      const key = row.dataset.enemyBuffs || "";
      track.classList.remove("buff-marquee");
      track.style.removeProperty("--buff-overflow");
      track.style.removeProperty("--buff-marquee-duration");
      track.style.removeProperty("--buff-marquee-delay");
      if (row.classList.contains("empty")) {
        if (key) this.enemyBuffMarqueeStartedAt.delete(key);
        return;
      }
      const overflow = Math.max(0, Math.ceil(track.scrollWidth - row.clientWidth));
      if (overflow <= 1) {
        if (key) this.enemyBuffMarqueeStartedAt.delete(key);
        return;
      }
      if (key) activeKeys.add(key);
      // v0.1.51: roughly 50% faster than the previous patrol while retaining
      // a short dwell at each edge so the outermost buff can still be read.
      const duration = Math.max(5.3, Math.min(12, (7 + overflow / 12) / 1.5));
      const now = performance.now();
      let startedAt = key ? this.enemyBuffMarqueeStartedAt.get(key) : null;
      if (!Number.isFinite(startedAt)) {
        startedAt = now;
        if (key) this.enemyBuffMarqueeStartedAt.set(key, startedAt);
      }
      const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);
      const phaseSeconds = duration > 0 ? elapsedSeconds % duration : 0;
      track.style.setProperty("--buff-overflow", `-${overflow}px`);
      track.style.setProperty("--buff-marquee-duration", `${duration.toFixed(2)}s`);
      track.style.setProperty("--buff-marquee-delay", `${(-phaseSeconds).toFixed(3)}s`);
      track.classList.add("buff-marquee");
    });
    for (const key of this.enemyBuffMarqueeStartedAt.keys()) {
      if (!activeKeys.has(key)) this.enemyBuffMarqueeStartedAt.delete(key);
    }
  }

  syncMerchantTextMarquees() {
    const activeKeys = new Set();
    this.root.querySelectorAll?.(".merchant-text-window").forEach((windowEl) => {
      const track = windowEl.querySelector(".merchant-text-track");
      if (!track) return;
      const key = windowEl.dataset.merchantMarquee || "";
      track.classList.remove("merchant-text-marquee");
      track.style.removeProperty("--merchant-text-overflow");
      track.style.removeProperty("--merchant-text-duration");
      track.style.removeProperty("--merchant-text-delay");
      const overflow = Math.max(0, Math.ceil(track.scrollWidth - windowEl.clientWidth));
      if (overflow <= 1) {
        if (key) this.merchantTextMarqueeStartedAt.delete(key);
        return;
      }
      if (key) activeKeys.add(key);
      const duration = Math.max(5.3, Math.min(12, (7 + overflow / 12) / 1.5));
      const now = performance.now();
      let startedAt = key ? this.merchantTextMarqueeStartedAt.get(key) : null;
      if (!Number.isFinite(startedAt)) {
        startedAt = now;
        if (key) this.merchantTextMarqueeStartedAt.set(key, startedAt);
      }
      const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);
      const phaseSeconds = duration > 0 ? elapsedSeconds % duration : 0;
      track.style.setProperty("--merchant-text-overflow", `-${overflow}px`);
      track.style.setProperty("--merchant-text-duration", `${duration.toFixed(2)}s`);
      track.style.setProperty("--merchant-text-delay", `${(-phaseSeconds).toFixed(3)}s`);
      track.classList.add("merchant-text-marquee");
    });
    for (const key of this.merchantTextMarqueeStartedAt.keys()) {
      if (!activeKeys.has(key)) this.merchantTextMarqueeStartedAt.delete(key);
    }
  }

  syncVerticalTextMarquees() {
    const activeKeys = new Set();
    this.root.querySelectorAll?.("[data-vertical-marquee]").forEach((windowEl) => {
      const track = windowEl.querySelector(".vertical-text-track");
      if (!track) return;
      const key = windowEl.dataset.verticalMarquee || "";
      track.classList.remove("vertical-text-marquee");
      for (const name of ["--vertical-text-overflow", "--vertical-text-duration", "--vertical-text-delay"]) {
        track.style.removeProperty(name);
      }
      const overflow = Math.max(0, Math.ceil(track.scrollHeight - windowEl.clientHeight));
      if (overflow <= 1) {
        if (key) this.verticalTextMarqueeStartedAt.delete(key);
        return;
      }
      if (key) activeKeys.add(key);
      const duration = Math.max(7, Math.min(40, 8 + overflow / 14));
      const now = performance.now();
      let startedAt = this.verticalTextMarqueeStartedAt.get(key);
      if (!Number.isFinite(startedAt)) {
        startedAt = now;
        if (key) this.verticalTextMarqueeStartedAt.set(key, startedAt);
      }
      track.style.setProperty("--vertical-text-overflow", `-${overflow}px`);
      track.style.setProperty("--vertical-text-duration", `${duration.toFixed(2)}s`);
      track.style.setProperty("--vertical-text-delay", `${(-((now - startedAt) / 1000 % duration)).toFixed(3)}s`);
      track.classList.add("vertical-text-marquee");
    });
    for (const key of this.verticalTextMarqueeStartedAt.keys()) {
      if (!activeKeys.has(key)) this.verticalTextMarqueeStartedAt.delete(key);
    }
  }

  hoistModalBackdrops() {
    // .game-shell uses backdrop-filter, which can make fixed descendants use the
    // full scrolling shell as their containing block. Hoist every modal to #app
    // so path prompts, combat results and meditation results keep one viewport position.
    this.root.querySelectorAll?.(".game-shell .modal-backdrop").forEach((modal) => this.root.appendChild(modal));
  }

  captureEnemyPositions() {
    const positions = new Map();
    this.root.querySelectorAll?.(".enemy-card[data-enemy-uid]").forEach((card) => {
      positions.set(card.dataset.enemyUid, card.getBoundingClientRect());
    });
    return positions;
  }

  animateEnemyReorder(previousPositions) {
    if (!previousPositions?.size) return;
    const cards = [...this.root.querySelectorAll(".enemy-card[data-enemy-uid]")];
    const moved = [];
    for (const card of cards) {
      const before = previousPositions.get(card.dataset.enemyUid);
      if (!before) continue;
      const after = card.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      card.style.transition = "none";
      card.style.transform = `translate(${dx}px, ${dy}px)`;
      card.style.zIndex = "6";
      moved.push(card);
    }
    if (!moved.length) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const card of moved) {
        card.style.transition = "transform 360ms cubic-bezier(.2,.8,.2,1)";
        card.style.transform = "translate(0, 0)";
      }
      setTimeout(() => {
        for (const card of moved) {
          if (!card.isConnected) continue;
          card.style.transition = "";
          card.style.transform = "";
          card.style.zIndex = "";
        }
      }, 390);
    }));
  }

  scheduleCombatLayout({ recalculateEnemy = false } = {}) {
    if (this.combatLayoutRaf) cancelAnimationFrame(this.combatLayoutRaf);
    this.combatLayoutRaf = requestAnimationFrame(() => {
      this.combatLayoutRaf = 0;
      this.layoutHand();
      // Ordinary resize events keep cached small-viewport geometry. Browser-chrome
      // motion may only toggle the hand between fixed and document-flow placement;
      // an orientation change explicitly requests a fresh baseline.
      this.layoutEnemyStage({ recalculate: recalculateEnemy });
      this.alignHumanoidEnemyArts();
      this.positionCombatFxLayer();
      this.syncMerchantTextMarquees();
      this.syncVerticalTextMarquees();
    });
  }

  getCurrentCombatViewportHeight() {
    return Math.max(1,
      globalThis.visualViewport?.height
        ?? globalThis.document?.documentElement?.clientHeight
        ?? globalThis.innerHeight
        ?? 1);
  }

  getStableCombatViewportHeight() {
    const fallback = this.getCurrentCombatViewportHeight();
    const doc = globalThis.document;
    const host = doc?.body ?? doc?.documentElement;
    if (!doc?.createElement || !host?.appendChild) return fallback;

    // 100svh is the mobile viewport with browser chrome expanded. Measuring it
    // directly makes combat entered with Chrome/Edge's address bar already hidden
    // use the same enemy-region baseline as combat entered with the bar visible.
    const probe = doc.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:100svh;visibility:hidden;pointer-events:none;";
    host.appendChild(probe);
    const measured = probe.getBoundingClientRect?.().height;
    probe.remove?.();
    return Number.isFinite(measured) && measured > 0 ? measured : fallback;
  }

  async getEnemyArtBottomRatio(img) {
    const src = img?.currentSrc || img?.src || "";
    if (!src) return null;
    if (this.enemyArtBottomCache.has(src)) return this.enemyArtBottomCache.get(src);

    const scanPromise = (async () => {
      if (typeof img.decode === "function") {
        try { await img.decode(); } catch { /* fall through to the load checks */ }
      }
      if (!img.complete) {
        await new Promise((resolve) => {
          const finish = () => resolve();
          img.addEventListener?.("load", finish, { once: true });
          img.addEventListener?.("error", finish, { once: true });
        });
      }
      if (!img.naturalWidth || !img.naturalHeight) return null;

      const canvas = (img.ownerDocument ?? globalThis.document)?.createElement?.("canvas");
      const ctx = canvas?.getContext?.("2d", { willReadFrequently: true });
      if (!canvas || !ctx) return null;
      const size = 160;
      canvas.width = size;
      canvas.height = size;
      // Paint the known portrait background first so rounded transparent corners
      // cannot masquerade as foreground pixels.
      ctx.fillStyle = "#18212d";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);

      let pixels;
      try { pixels = ctx.getImageData(0, 0, size, size).data; }
      catch { return null; }
      const minRowPixels = Math.max(4, Math.ceil(size * .02));
      const differenceThresholdSquared = 30 * 30;
      for (let y = size - 1; y >= 0; y -= 1) {
        let rowPixels = 0;
        for (let x = 0; x < size; x += 1) {
          const index = (y * size + x) * 4;
          const dr = pixels[index] - 0x18;
          const dg = pixels[index + 1] - 0x21;
          const db = pixels[index + 2] - 0x2d;
          if (dr * dr + dg * dg + db * db <= differenceThresholdSquared) continue;
          rowPixels += 1;
          if (rowPixels >= minRowPixels) return (y + 1) / size;
        }
      }
      return null;
    })();

    this.enemyArtBottomCache.set(src, scanPromise);
    return scanPromise;
  }

  async alignHumanoidEnemyArt(img) {
    const bottomRatio = await this.getEnemyArtBottomRatio(img);
    if (!Number.isFinite(bottomRatio) || img?.isConnected === false) return;
    const card = img.closest?.(".enemy-card");
    const hpBar = card?.querySelector?.(".enemy-hp-bar");
    if (!hpBar) return;

    const imgRect = img.getBoundingClientRect?.();
    const barRect = hpBar.getBoundingClientRect?.();
    if (!imgRect || !barRect) return;
    const side = Math.min(imgRect.width, imgRect.height);
    if (!Number.isFinite(side) || side <= 0) return;

    // getBoundingClientRect() already includes artScale, including its centered
    // transform origin. Only the square contain-fit region needs to be located.
    const objectTop = (imgRect.height - side) / 2;
    const contentBottom = objectTop + side * bottomRatio;
    const targetBottom = barRect.top - imgRect.top;
    const previousShift = parseFloat(img.style.getPropertyValue("--enemy-art-shift-y")) || 0;
    const shiftY = previousShift + targetBottom - contentBottom;
    img.style.setProperty("--enemy-art-shift-y", `${shiftY.toFixed(2)}px`);
  }

  alignHumanoidEnemyArts() {
    this.root.querySelectorAll?.(".enemy-art-humanoid").forEach((img) => {
      void this.alignHumanoidEnemyArt(img);
    });
  }

  layoutEnemyStage({ recalculate = false } = {}) {
    if (this.state?.screen !== "combat") return;
    const stage = this.root.querySelector(".combat-stage");
    const grid = stage?.querySelector?.(".enemy-grid");
    const handWrap = this.root.querySelector(".hand-wrap");
    const combatScreen = this.root.querySelector?.(".combat-screen");
    if (!stage || !grid || !handWrap) return;
    const cards = [...grid.querySelectorAll(".enemy-card")];
    if (!cards.length) {
      // Victory/result renders remove the final enemy card from the DOM. Preserve the
      // cached battlefield geometry instead of falling back to the CSS default stage
      // height, which otherwise makes the combat region jump exactly as the result
      // prompt appears. The cache is cleared only when combat itself is exited.
      const cached = this.combatEnemyLayout;
      if (cached?.combatRef === this.state.combat) {
        const liveHeight = Math.max(1,
          typeof this.getCurrentCombatViewportHeight === "function"
            ? this.getCurrentCombatViewportHeight()
            : (globalThis.visualViewport?.height ?? globalThis.innerHeight ?? 1));
        const snapshot = this.combatViewportSnapshot;
        const chromeHidden = Boolean(snapshot?.combatRef === cached.combatRef
          && liveHeight > snapshot.viewportHeight + 8);
        const flowLayout = Boolean(cached.scrollLayout || chromeHidden);
        combatScreen?.classList?.toggle?.("combat-scroll-layout", flowLayout);
        handWrap?.classList?.toggle?.("combat-hand-flow", flowLayout);
        stage.style.setProperty("--combat-stage-height", `${cached.stageHeight}px`);
        stage.style.marginTop = `${cached.stageMarginTop}px`;
        stage.style.marginBottom = "0px";
        grid.style.setProperty("--enemy-card-width", `${cached.cardWidth}px`);
      }
      return;
    }

    const currentViewportHeight = () => typeof this.getCurrentCombatViewportHeight === "function"
      ? this.getCurrentCombatViewportHeight()
      : Math.max(1, globalThis.visualViewport?.height ?? globalThis.innerHeight ?? 1);
    const stableViewportHeight = () => typeof this.getStableCombatViewportHeight === "function"
      ? this.getStableCombatViewportHeight()
      : currentViewportHeight();

    const applyLayout = (layout) => {
      const snapshot = this.combatViewportSnapshot;
      // Geometry always belongs to the address-bar-visible small viewport. When
      // browser chrome is hidden, the live VisualViewport becomes taller; only then
      // release the hand from bottom pinning so the page can move naturally without
      // manufacturing a large blank gap beneath a small, already-fixed enemy stage.
      const chromeHidden = Boolean(snapshot?.combatRef === layout.combatRef
        && currentViewportHeight() > snapshot.viewportHeight + 8);
      const flowLayout = Boolean(layout.scrollLayout || chromeHidden);
      combatScreen?.classList?.toggle?.("combat-scroll-layout", flowLayout);
      handWrap?.classList?.toggle?.("combat-hand-flow", flowLayout);
      stage.style.setProperty("--combat-stage-height", `${layout.stageHeight}px`);
      stage.style.marginTop = `${layout.stageMarginTop}px`;
      stage.style.marginBottom = "0px";
      grid.style.setProperty("--enemy-card-width", `${layout.cardWidth}px`);
      cards.forEach((card, index) => {
        const left = layout.startLeft + layout.step * index;
        card.style.left = `${left.toFixed(2)}px`;
        card.style.top = `${layout.cardTop.toFixed(2)}px`;
        card.style.setProperty("--enemy-order", String(index + 1));
      });
    };

    const combatRef = this.state.combat;
    const enemyCount = cards.length;
    const cached = this.combatEnemyLayout;
    const canReuse = !recalculate
      && cached
      && cached.combatRef === combatRef
      && cached.enemyCount === enemyCount;

    if (canReuse) {
      applyLayout(cached);
      return;
    }

    // Build combat geometry from the address-bar-visible (small) viewport even if
    // the address bar is already hidden when combat begins. This intentionally
    // restores the stable-size principle of v0.2.78 while retaining the newer 150%
    // enemy-region minimum and 25% overlap limit.
    combatScreen?.classList?.remove?.("combat-scroll-layout");
    handWrap?.classList?.remove?.("combat-hand-flow");
    stage.style.removeProperty("--combat-stage-height");
    stage.style.marginTop = "0px";
    stage.style.marginBottom = "0px";
    grid.style.removeProperty("--enemy-card-width");

    let snapshot = this.combatViewportSnapshot;
    if (!snapshot || snapshot.combatRef !== combatRef) {
      const scrollTop = Math.max(0,
        globalThis.scrollY
          ?? globalThis.document?.documentElement?.scrollTop
          ?? globalThis.document?.body?.scrollTop
          ?? 0);
      const stageTop = stage.getBoundingClientRect().top + scrollTop;
      const artifactPanel = this.root.querySelector(".combat-artifacts");
      const artifactBottom = (artifactPanel?.getBoundingClientRect?.().bottom ?? (stageTop - scrollTop)) + scrollTop;
      const handRect = handWrap.getBoundingClientRect();
      const handHeight = Math.max(0, Number(handRect.height) || (Number(handRect.bottom) - Number(handRect.top)) || handWrap.offsetHeight || 0);
      const viewportHeight = Math.max(1, stableViewportHeight());
      const handTop = viewportHeight - handHeight + scrollTop;
      const safetyGap = 8;
      const visualHeight = Math.max(1, handTop - artifactBottom);
      const stageInsetTop = Math.max(0, stageTop - artifactBottom);
      const reservedVerticalGap = Math.max(safetyGap, stageInsetTop * 2);
      const availableHeight = Math.max(1, visualHeight - reservedVerticalGap);

      const playerCard = this.root.querySelector?.(".hand .card");
      const measuredPlayerCardHeight = Number(playerCard?.getBoundingClientRect?.().height) || 0;
      const viewportWidth = Math.max(1,
        globalThis.visualViewport?.width
          ?? globalThis.document?.documentElement?.clientWidth
          ?? globalThis.innerWidth
          ?? grid.clientWidth
          ?? 1);
      const fallbackPlayerCardWidth = Math.min(96, Math.max(90, viewportWidth * 0.24));
      const playerCardHeight = measuredPlayerCardHeight > 0
        ? measuredPlayerCardHeight
        : fallbackPlayerCardWidth * 16 / 9;
      const minimumEnemyRegionHeight = Math.ceil(playerCardHeight * 1.5);
      snapshot = {
        combatRef,
        viewportHeight,
        viewportWidth,
        visualHeight,
        stageInsetTop,
        reservedVerticalGap,
        availableHeight,
        playerCardHeight,
        minimumEnemyRegionHeight,
      };
      this.combatViewportSnapshot = snapshot;
    }

    const availableHeight = snapshot.availableHeight;
    const minimumEnemyRegionHeight = snapshot.minimumEnemyRegionHeight;
    const scrollLayout = availableHeight < minimumEnemyRegionHeight;
    const targetRegionHeight = Math.max(availableHeight, minimumEnemyRegionHeight);
    const gridWidth = Math.max(1, grid.clientWidth || stage.clientWidth);
    const naturalGap = parseFloat(getComputedStyle(grid).columnGap) || (globalThis.matchMedia?.("(max-width: 390px)")?.matches ? 4.48 : 6.72);

    const heightToWidth = 1.618;
    let cardHeight = targetRegionHeight;
    let cardWidth = cardHeight / heightToWidth;

    // Horizontal overlap may cover at most 25% of any preceding card, so the
    // compressed step can never be less than 75% of card width. Only shrink the
    // whole enemy row when that limit would otherwise be exceeded.
    const maxWidthAtOverlapLimit = gridWidth / (1 + 0.75 * Math.max(0, enemyCount - 1));
    if (cardWidth > maxWidthAtOverlapLimit) {
      cardWidth = maxWidthAtOverlapLimit;
      cardHeight = cardWidth * heightToWidth;
    }

    const naturalTotalWidth = cardWidth * enemyCount + naturalGap * Math.max(0, enemyCount - 1);
    const step = enemyCount <= 1
      ? 0
      : naturalTotalWidth <= gridWidth
        ? cardWidth + naturalGap
        : Math.max(0, (gridWidth - cardWidth) / (enemyCount - 1));
    const occupiedWidth = cardWidth + step * Math.max(0, enemyCount - 1);
    const startLeft = Math.max(0, (gridWidth - occupiedWidth) / 2);

    // Keep the v0.2.83 removal of the old post-sizing stage-compaction/hand-lift
    // pass. The stage is now derived from the stable small-viewport baseline; cards
    // remain vertically centered, and live browser-chrome changes never alter these
    // dimensions.
    const stageHeight = targetRegionHeight;
    const cardTop = Math.max(0, (stageHeight - cardHeight) / 2);
    const freeVisualSpace = Math.max(0, snapshot.visualHeight - stageHeight);
    const desiredVisualTopGap = freeVisualSpace / 2;
    const stageMarginTop = scrollLayout ? 0 : Math.max(0, desiredVisualTopGap - snapshot.stageInsetTop);

    const layout = {
      combatRef,
      enemyCount,
      cardWidth: Number(cardWidth.toFixed(2)),
      cardHeight: Number(cardHeight.toFixed(2)),
      stageHeight: Number(stageHeight.toFixed(2)),
      stageMarginTop: Number(stageMarginTop.toFixed(2)),
      cardTop: Number(cardTop.toFixed(2)),
      startLeft: Number(startLeft.toFixed(2)),
      step: Number(step.toFixed(2)),
      minimumEnemyRegionHeight,
      entryViewportHeight: Number(snapshot.viewportHeight.toFixed(2)),
      scrollLayout,
    };
    this.combatEnemyLayout = layout;
    applyLayout(layout);
  }

  layoutHand() {
    const hand = this.root.querySelector(".hand");
    if (!hand) return;
    const cards = [...hand.querySelectorAll(".card")];
    cards.forEach((card) => { card.style.left = ""; });
    if (!cards.length) return;

    const available = hand.clientWidth;
    const cardWidth = cards[0].getBoundingClientRect().width;
    const count = cards.length;
    const naturalGap = 5;
    const naturalStep = cardWidth + naturalGap;
    const naturalWidth = cardWidth + naturalStep * Math.max(0, count - 1);
    const step = count <= 1
      ? cardWidth
      : naturalWidth <= available
        ? naturalStep
        : Math.max(0, (available - cardWidth) / (count - 1));
    const totalWidth = cardWidth + step * (count - 1);
    const start = Math.max(0, (available - totalWidth) / 2);

    cards.forEach((card, index) => {
      card.style.left = `${start + index * step}px`;
    });
  }

  toast(message) { console.info(message); }

  wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  flashEndTurnUnlock(duration = 200) {
    const button = this.root?.querySelector?.(".end-turn-button:not(:disabled)");
    if (!button) return;
    button.style.setProperty("--turn-unlock-duration", `${Math.max(1, Math.floor(duration))}ms`);
    button.classList.remove("turn-button-unlock-flash");
    // Force a style flush so each genuine gray->enabled transition can replay the
    // animation even if the same DOM node survives an unusual partial update.
    void button.offsetWidth;
    button.classList.add("turn-button-unlock-flash");
    setTimeout(() => { if (button.isConnected) button.classList.remove("turn-button-unlock-flash"); }, duration + 30);
  }

  normalizeCombatActionType(type) {
    return ["attack", "defense", "support"].includes(type) ? type : "support";
  }

  queueSkillSfx(skillSfxKey, type) {
    if (!SKILL_SFX_SETTINGS.enabled || !skillSfxKey) return;
    const delay = { attack: 145, defense: 260, support: 280 }[type] ?? 280;
    const combatAtStart = this.state?.combat;
    setTimeout(() => {
      if (!SKILL_SFX_SETTINGS.enabled) return;
      if (combatAtStart && (this.state?.combat !== combatAtStart || combatAtStart.result)) return;
      this.audio.playSkill(skillSfxKey);
    }, delay);
  }

  async flashEnemyAction(enemyUid, type = "support", duration = 500, skillSfxKey = null) {
    const normalizedType = type === "heart-demon" ? type : this.normalizeCombatActionType(type);
    const token = `${Date.now()}-${Math.random()}`;
    this.enemyActionFx = { enemyUid, type: normalizedType, token };
    this.render();
    this.audio.play(normalizedType === "heart-demon" ? "fail" : normalizedType, normalizedType === "heart-demon" ? .45 : normalizedType === "support" ? .6 : .42);
    this.queueSkillSfx(skillSfxKey, normalizedType);
    await this.wait(duration);
    if (this.enemyActionFx?.token === token) this.enemyActionFx = null;
  }

  async flashPlayerCardAction(cardUid, type = "support", duration = 444, skillSfxKey = null) {
    const normalizedType = type === "artifact" ? "artifact" : this.normalizeCombatActionType(type);
    const token = `${Date.now()}-${Math.random()}`;
    this.playerCardActionFx = { cardUid, type: normalizedType, token };
    this.render();
    this.audio.play(normalizedType === "artifact" ? "support" : normalizedType, normalizedType === "support" || normalizedType === "artifact" ? .6 : .42);
    this.queueSkillSfx(skillSfxKey, normalizedType === "artifact" ? "support" : normalizedType);
    await this.wait(duration);
    if (this.playerCardActionFx?.token === token) this.playerCardActionFx = null;
  }

  clearArtifactInfo() {
    if (this.artifactInfoTimer != null) clearTimeout(this.artifactInfoTimer);
    this.artifactInfoTimer = null;
    this.artifactInfoId = null;
    this.artifactInfoSlotIndex = null;
    this.artifactInfoExpiresAt = 0;
    this.artifactInfoScreen = null;
    this.artifactInfoCombatRef = null;
  }

  getArtifactInfoId() {
    const id = this.artifactInfoId;
    if (!id || Date.now() >= this.artifactInfoExpiresAt
      || this.artifactInfoScreen !== this.state?.screen
      || (this.state?.screen === "combat" && this.artifactInfoCombatRef !== this.state.combat)
      || !(this.state?.player?.artifacts ?? []).includes(id)) return null;
    return id;
  }

  getArtifactSlotInfoIndex() {
    const index = this.artifactInfoSlotIndex;
    if (!Number.isInteger(index) || index < 0 || index >= 6
      || Date.now() >= this.artifactInfoExpiresAt
      || this.artifactInfoScreen !== this.state?.screen
      || (this.state?.screen === "combat" && this.artifactInfoCombatRef !== this.state.combat)) return null;
    const ids = (this.state?.player?.artifacts ?? []).filter((id) => ARTIFACTS[id] && !ARTIFACTS[id].hidden);
    return ids[index] ? null : index;
  }

  onArtifactSlotClick(index) {
    if (!["map", "combat"].includes(this.state?.screen) || !Number.isInteger(index) || index < 0 || index >= 6) return;
    const state = this.state;
    const ids = ensureArtifactCollections(state.player).equipped;
    if (ids[index]) return;
    this.clearArtifactCapacityFeedback();
    this.clearArtifactInfo();
    this.artifactInfoSlotIndex = index;
    this.artifactInfoScreen = state.screen;
    this.artifactInfoCombatRef = state.combat ?? null;
    const expiresAt = Date.now() + 10000;
    this.artifactInfoExpiresAt = expiresAt;
    this.artifactInfoTimer = setTimeout(() => {
      if (this.state !== state || this.artifactInfoSlotIndex !== index || this.artifactInfoExpiresAt !== expiresAt) return;
      this.clearArtifactInfo();
      this.render();
    }, 10000);
    this.audio.play("click", .70);
    this.render();
  }

  clearArtifactCapacityFeedback() {
    if (this.artifactCapacityFeedbackTimer != null) clearTimeout(this.artifactCapacityFeedbackTimer);
    this.artifactCapacityFeedbackTimer = null;
    this.artifactCapacityFeedback = null;
  }

  isArtifactCapacityFeedbackFlashing() {
    const feedback = this.artifactCapacityFeedback;
    return Boolean(feedback && feedback.state === this.state
      && feedback.screen === this.state?.screen && Date.now() < feedback.expiresAt);
  }

  showArtifactCapacityFeedback() {
    // As with insufficient-Mana feedback, a failed attempt is a short UI-only
    // warning. Restore the capacity line immediately, without changing the save.
    this.clearArtifactInfo();
    this.clearArtifactCapacityFeedback();
    const state = this.state;
    const feedback = { state, screen: state?.screen, expiresAt: Date.now() + 900 };
    this.artifactCapacityFeedback = feedback;
    this.render();
    this.artifactCapacityFeedbackTimer = setTimeout(() => {
      if (this.artifactCapacityFeedback !== feedback) return;
      this.clearArtifactCapacityFeedback();
      if (this.state === state && this.state?.screen === feedback.screen) this.render();
    }, 900);
  }

  async onArtifactIconClick(artifactId) {
    const state = this.state;
    if (!state?.player || !ensureArtifactCollections(state.player).equipped.includes(artifactId)) return;
    if (this.getArtifactInfoId() === artifactId) {
      // A second click delegates to the original engine, retaining targeting,
      // Sense cost, turn restrictions, scoring and active-artifact feedback.
      if (state.screen === "combat" && ARTIFACTS[artifactId]?.active) {
        return this.combat.useArtifact(artifactId, state.combat?.selectedEnemyId);
      }
      return;
    }
    this.clearArtifactCapacityFeedback();
    this.clearArtifactInfo();
    this.artifactInfoId = artifactId;
    this.artifactInfoScreen = state.screen;
    this.artifactInfoCombatRef = state.combat ?? null;
    const expiresAt = Date.now() + 10000;
    this.artifactInfoExpiresAt = expiresAt;
    this.artifactInfoTimer = setTimeout(() => {
      if (this.state !== state || this.artifactInfoId !== artifactId || this.artifactInfoExpiresAt !== expiresAt) return;
      this.clearArtifactInfo();
      this.render();
    }, 10000);
    this.render();
  }

  isArtifactActionFlashing(artifactId) {
    return this.artifactActionFx?.artifactId === artifactId;
  }

  async flashArtifactAction(artifactId, duration = 500) {
    const token = `${Date.now()}-${Math.random()}`;
    this.artifactActionFx = { artifactId, token };
    this.render();
    this.audio.play("artifact", .55);
    if (SKILL_SFX_SETTINGS.enabled && artifactId === "greenSnakeSword") {
      const combatAtStart = this.state?.combat;
      setTimeout(() => {
        if (this.state?.combat === combatAtStart && !combatAtStart?.result) this.audio.playSkill("greenSnakeSword");
      }, 340);
    }
    await this.wait(duration);
    if (this.artifactActionFx?.token === token) this.artifactActionFx = null;
  }

  getEnemyDeathFx(enemyUid) {
    const fx = this.enemyDeathFx.get(enemyUid);
    if (!fx || fx.waitingForZeroHp) return null;
    const elapsed = Math.max(0, Math.min(fx.duration, Date.now() - fx.startedAt));
    return {
      ...fx,
      elapsed,
      style: `--enemy-death-duration:${fx.duration}ms;--enemy-death-delay:-${elapsed}ms;`,
    };
  }

  isEnemyDeathAnimating(enemyUid) { return Boolean(this.enemyDeathFx.get(enemyUid)); }

  isZeroHpPaused(unit) { return isZeroHpPaused(this, unit); }

  spawnEnemyDeathShatter(enemyUid, { duration = 620 } = {}) {
    if (typeof document === "undefined" || !this.root?.querySelector) return [];
    const card = this.root.querySelector(`[data-enemy-uid="${String(enemyUid).replace(/["\\]/g, "\\$&")}"]`);
    if (!card) return [];
    const rect = card.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return [];

    // Keep the exact-card mosaic look, but avoid the old 72 full-DOM clones +
    // per-piece filters, which could cause a visible hitch on lower-end devices.
    // 48 irregular pieces still map one-to-one onto the source card, while one
    // sanitized template, one DocumentFragment insertion and transform/opacity-
    // only animations substantially reduce style/layout/paint pressure.
    const xs = [0, .08, .19, .32, .46, .61, .75, .88, 1];
    const ys = [0, .12, .27, .43, .60, .78, 1];
    const seedBase = [...String(enemyUid)].reduce((sum, ch) => (sum * 33 + ch.charCodeAt(0)) >>> 0, 5381);
    const pieces = [];
    const animationJobs = [];
    const batch = document.createDocumentFragment();

    const template = card.cloneNode(true);
    template.classList.remove(
      "enemy-death", "damage-taken", "selected", "enemy-action",
      "enemy-action-attack", "enemy-action-defense", "enemy-action-support", "enemy-action-heart-demon",
      "enemy-mountain-force-active", "enemy-huntian-active", "enemy-ghost-flash-active"
    );
    template.classList.add("enemy-death-pixel-clone");
    template.removeAttribute("data-action");
    template.removeAttribute("id");
    template.querySelectorAll?.("[id]").forEach((node) => node.removeAttribute("id"));
    template.querySelectorAll?.("[data-action]").forEach((node) => node.removeAttribute("data-action"));
    template.querySelectorAll?.(".resource-pop, .enemy-status-fx, .enemy-huntian-aura")
      .forEach((node) => node.remove());
    template.querySelectorAll?.("*").forEach((node) => {
      node.style.animation = "none";
      node.style.transition = "none";
    });

    let pieceIndex = 0;
    for (let row = 0; row < ys.length - 1; row += 1) {
      for (let col = 0; col < xs.length - 1; col += 1) {
        pieceIndex += 1;
        const clone = template.cloneNode(true);
        const left = xs[col], right = xs[col + 1], top = ys[row], bottom = ys[row + 1];
        Object.assign(clone.style, {
          left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
          margin: "0", position: "fixed", pointerEvents: "none", zIndex: "10040",
          clipPath: `inset(${(top * 100).toFixed(3)}% ${((1 - right) * 100).toFixed(3)}% ${((1 - bottom) * 100).toFixed(3)}% ${(left * 100).toFixed(3)}%)`,
        });
        clone.style.setProperty("--fragment-origin-x", `${(((left + right) / 2) * 100).toFixed(2)}%`);
        clone.style.setProperty("--fragment-origin-y", `${(((top + bottom) / 2) * 100).toFixed(2)}%`);
        batch.appendChild(clone);
        pieces.push(clone);

        const cx = (left + right) / 2 - .5;
        const cy = (top + bottom) / 2 - .5;
        const len = Math.hypot(cx, cy) || 1;
        const hash = (seedBase + pieceIndex * 2654435761) >>> 0;
        const jitterX = ((hash & 255) / 255 - .5) * 24;
        const jitterY = (((hash >>> 8) & 255) / 255 - .5) * 20;
        const distance = 28 + (((hash >>> 16) & 255) / 255) * 66;
        const dx = (cx / len) * distance + jitterX;
        const dy = (cy / len) * distance + jitterY + 7 + Math.abs(cy) * 16;
        const rotation = ((((hash >>> 24) & 255) / 255) - .5) * 155;
        const stagger = Math.floor(((hash >>> 12) & 63) / 63 * 28);
        const pieceDuration = Math.max(400, duration - stagger);
        animationJobs.push({ clone, dx, dy, rotation, stagger, pieceDuration });
      }
    }

    document.body.appendChild(batch);
    for (const { clone, dx, dy, rotation, stagger, pieceDuration } of animationJobs) {
      const anim = clone.animate([
        { transform: "translate3d(0,0,0) rotate(0deg) scale(1)", opacity: 1, offset: 0 },
        { transform: `translate3d(${(dx * .08).toFixed(1)}px, ${(dy * .06).toFixed(1)}px, 0) rotate(${(rotation * .04).toFixed(1)}deg) scale(.99)`, opacity: .98, offset: .06 },
        { transform: `translate3d(${(dx * .36).toFixed(1)}px, ${(dy * .28).toFixed(1)}px, 0) rotate(${(rotation * .30).toFixed(1)}deg) scale(.94)`, opacity: .88, offset: .48 },
        { transform: `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) rotate(${rotation.toFixed(1)}deg) scale(.62)`, opacity: 0, offset: 1 },
      ], { duration: pieceDuration, delay: stagger, easing: "cubic-bezier(.15,.7,.2,1)", fill: "forwards" });
      Promise.resolve(anim.finished).catch(() => {}).finally(() => clone.remove());
    }
    return pieces;
  }

  startEnemyDeathFx(enemy, { delay = 500, duration = 1120 } = {}) {
    if (!enemy?.uid || enemy.kind === "player") return null;
    const existing = this.enemyDeathFx.get(enemy.uid);
    if (existing?.promise) return existing.promise;

    const token = `${Date.now()}-${Math.random()}`;
    // Keep the zero-HP card in its current formation while its shared pause is
    // pending. No death class, shatter, selection hand-off or cue starts yet.
    const fx = { token, startedAt: null, delay, duration, waitingForZeroHp: true, promise: null };
    this.enemyDeathFx.set(enemy.uid, fx);
    fx.promise = (async () => {
      await waitForZeroHpPause(this, enemy);
      if (this.enemyDeathFx.get(enemy.uid)?.token !== token) return;
      if (enemy.hp > 0) { this.enemyDeathFx.delete(enemy.uid); return; }
      enemy.combatFlags ??= {};
      enemy.combatFlags.deathVisualComplete = false;
      fx.waitingForZeroHp = false;
      fx.startedAt = Date.now();
      this.combat?.normalizeSelectedEnemy?.();
      const mountedCard = this.root?.querySelector?.(`[data-enemy-uid="${String(enemy.uid).replace(/["\\]/g, "\\$&")}"]`);
      if (mountedCard) {
        mountedCard.classList.add("enemy-death");
        mountedCard.style.setProperty("--enemy-death-duration", `${duration}ms`);
        mountedCard.style.setProperty("--enemy-death-delay", "0ms");
      }
      await this.wait(delay);
      if (this.enemyDeathFx.get(enemy.uid)?.token !== token) return;
      // Native death playback and shatter share the original ~500ms hand-off. The
      // fragment clone is created exactly at that hand-off before CSS hides the
      // intact source card a few milliseconds later,
      // preventing the blank-frame flash that used to appear at the hand-off.
      this.audio.play("death", .82);
      this.spawnEnemyDeathShatter(enemy.uid, { duration: Math.max(0, duration - delay) });
      await this.wait(Math.max(0, duration - delay));
      if (this.enemyDeathFx.get(enemy.uid)?.token !== token) return;
      // A corpse stays in combat.enemies until the normal cleanup pass so loot and
      // turn-order bookkeeping remain deterministic. Mark its visual lifecycle as
      // finished, though, and clear any stale HP/damage feedback before dropping
      // the death-FX token. Otherwise an unrelated render (for example the next
      // enemy's AoE action) could briefly rebuild a 0-HP corpse as an intact card.
      enemy.combatFlags.deathVisualComplete = true;
      const resourceKey = this.resourcePopupKey?.(enemy, "hp");
      if (resourceKey) {
        this.resourcePopups?.delete?.(resourceKey);
        this.resourceFlashes?.delete?.(resourceKey);
      }
      const damageKey = this.damageTakenKey?.(enemy);
      if (damageKey) this.damageTakenFx?.delete?.(damageKey);
      this.enemyDeathFx.delete(enemy.uid);
      // Do not render per corpse here. Multi-kill effects await all death promises
      // and the combat caller performs one final render, so survivors transition
      // directly from the old formation to the final formation instead of briefly
      // visiting intermediate 2-card/1-card layouts.
    })();
    return fx.promise;
  }

  damageTakenKey(unit) {
    if (!unit) return null;
    return unit.kind === "player" ? "player" : unit.uid ?? null;
  }

  isDamageTakenFlashing(unit) {
    const key = this.damageTakenKey(unit);
    return Boolean(key && this.damageTakenFx.has(key));
  }

  getDamageTakenDuration(unit) {
    const key = this.damageTakenKey(unit);
    return Math.max(0, Math.floor(Number(key ? this.damageTakenFx.get(key)?.duration : 0) || 0));
  }

  isDamageTakenRedFlashing(unit) {
    const key = this.damageTakenKey(unit);
    return Boolean(key && this.damageTakenFx.get(key)?.red);
  }

  async flashDamageTaken(units, duration = 200, { red = true } = {}) {
    const list = (Array.isArray(units) ? units : [units]).filter(Boolean);
    if (!list.length) return;
    const token = `${Date.now()}-${Math.random()}`;
    const keys = [];
    for (const unit of list) {
      const key = this.damageTakenKey(unit);
      if (!key) continue;
      keys.push(key);
      this.damageTakenFx.set(key, { token, duration, red: Boolean(red) });
    }
    if (!keys.length) return;
    if (this.state) this.render();
    await this.wait(duration);
    let changed = false;
    for (const key of keys) {
      if (this.damageTakenFx.get(key)?.token !== token) continue;
      this.damageTakenFx.delete(key);
      changed = true;
    }
    if (changed && this.state) this.render();
  }

  async flashPlayerHeartDemon(duration = 500, { playSound = true, renderFirst = true } = {}) {
    // Render the current state first so an opening-turn flare-up is shown over
    // combat rather than over the map that launched the encounter. Meditation can
    // suppress this extra render/sound so its result prompt and failure cue appear
    // on the exact same beat after the frozen progress endpoint.
    if (renderFirst && this.state) this.render();
    const shell = this.root.querySelector(".game-shell");
    if (!shell) return;

    const cover = document.createElement("div");
    cover.className = "player-heart-demon-screen-cover";
    cover.setAttribute("aria-hidden", "true");
    cover.style.setProperty("--heart-demon-screen-duration", `${duration}ms`);
    shell.style.setProperty("--heart-demon-screen-duration", `${duration}ms`);
    // Restart cleanly if another flare somehow lands before a prior animation ends.
    shell.classList.remove("player-heart-demon-screen-shake");
    void shell.offsetWidth;
    shell.classList.add("player-heart-demon-screen-shake");
    this.root.appendChild(cover);
    if (playSound) this.audio.play("fail", .45);

    await this.wait(duration);
    cover.remove();
    if (shell.isConnected) {
      shell.classList.remove("player-heart-demon-screen-shake");
      shell.style.removeProperty("--heart-demon-screen-duration");
    }
  }

  async flashPlayerUndying(duration = 500) {
    // [Undying] mirrors the established full-screen Heart Demon beat, with its
    // own return-to-life veil. Effects play the cue before scheduling HP;
    // rendering here respects the presentation-only zero-HP hold.
    if (this.state) this.render();
    const shell = this.root.querySelector(".game-shell");
    if (!shell) return;

    const cover = document.createElement("div");
    cover.className = "player-undying-screen-cover";
    cover.setAttribute("aria-hidden", "true");
    cover.style.setProperty("--undying-screen-duration", `${duration}ms`);
    shell.style.setProperty("--undying-screen-duration", `${duration}ms`);
    shell.classList.remove("player-undying-screen-shake");
    void shell.offsetWidth;
    shell.classList.add("player-undying-screen-shake");
    this.root.appendChild(cover);

    await this.wait(duration);
    cover.remove();
    if (shell.isConnected) {
      shell.classList.remove("player-undying-screen-shake");
      shell.style.removeProperty("--undying-screen-duration");
    }
  }

  resourcePopupKey(unit, resource = "hp") {
    const unitKey = unit?.kind === "player" ? "player" : unit?.uid;
    return unitKey ? `${unitKey}:${resource}` : null;
  }

  clearRevivalVisuals() {
    for (const visual of this.revivalVisuals?.values() ?? []) clearTimeout(visual.timer);
    this.revivalVisuals?.clear();
  }

  holdRevivalHp(unit) {
    if (!unit || unit.hp <= 0) return null;
    this.revivalVisuals ??= new Map();
    clearTimeout(this.revivalVisuals.get(unit)?.timer);
    const visual = { state: this.state, combat: this.state?.combat ?? null, hp: 0, timer: null };
    this.revivalVisuals.set(unit, visual);
    // A second revival cannot inherit the first one's recovery highlight.
    this.resourceFlashes?.delete(this.resourcePopupKey(unit, "hp"));
    return visual;
  }

  isCurrentRevivalVisual(unit, visual) {
    if (!visual || this.revivalVisuals?.get(unit) !== visual || this.state !== visual.state
      || (this.state?.combat ?? null) !== visual.combat || unit.hp <= 0) return false;
    return unit.kind === "player" ? this.state?.player === unit
      : (this.state?.combat?.enemies ?? []).includes(unit);
  }

  getPresentedResourceValue(unit, resource, value) {
    const visual = resource === "hp" ? this.revivalVisuals?.get(unit) : null;
    if (!visual) return value;
    if (this.isCurrentRevivalVisual(unit, visual)) return Math.min(value, visual.hp);
    clearTimeout(visual.timer);
    this.revivalVisuals.delete(unit);
    return value;
  }

  getResourcePopup(unit, resource = "hp") {
    const key = this.resourcePopupKey(unit, resource);
    return key ? this.resourcePopups.get(key) ?? null : null;
  }

  hasResourcePopup(unit, resource = "hp") { return Boolean(this.getResourcePopup(unit, resource)); }

  clearResourcePopup(unit, resource = "hp") {
    const key = this.resourcePopupKey(unit, resource);
    if (!key) return;
    this.resourcePopups.delete(key);
    this.resourceFlashes.delete(key);
  }

  getStatusPopups(unit) {
    const key = unit?.kind === "player" ? "player" : unit?.uid;
    return key ? this.statusPopups?.get(String(key)) ?? [] : [];
  }

  showStatusPopup(unit, status, applied, stacks = 1, { duration = 560, synchronized = false } = {}) {
    if (this.state?.screen !== "combat" || !unit || !status) return;
    if (this.statusPopupCombatRef !== this.state.combat) {
      this.statusPopups.clear();
      this.statusPopupClocks?.clear();
      this.statusPopupAudioClocks?.clear();
      this.statusPopupAudioBursts?.clear();
      this.statusPopupCombatRef = this.state.combat;
    }
    const key = unit.kind === "player" ? "player" : unit.uid;
    if (!key) return;
    const id = String(key);
    const entries = this.statusPopups.get(id) ?? [];
    // Each successful application gets one label with its actual layer gain.
    // Every recent different-status start reserves a 280ms beat, even across frames.
    const numericStacks = Number(stacks);
    const layers = applied && Number.isFinite(numericStacks) ? Math.max(1, Math.floor(numericStacks)) : 1;
    const startedAt = Date.now();
    this.statusPopupClocks ??= new Map();
    const clock = this.statusPopupClocks.get(id) ?? new Map();
    let firstAt = startedAt;
    if (!synchronized) {
      for (const [previousStatus, previousStart] of clock) {
        if (previousStatus !== status) firstAt = Math.max(firstAt, previousStart + STATUS_FEEDBACK_BEAT_MS);
      }
    }
    clock.set(status, Math.max(clock.get(status) ?? startedAt, firstAt));
    this.statusPopupClocks.set(id, clock);
    const popup = { id: String(this.statusPopupSequence = (this.statusPopupSequence ?? 0) + 1), status, applied, stackCount: layers,
      requestedAt: startedAt, createdAt: firstAt, duration };
    entries.push(popup);
    this.statusPopups.set(id, entries);
    if (!this.statusPopupRenderScheduled) {
      this.statusPopupRenderScheduled = true;
      queueMicrotask(() => {
        this.statusPopupRenderScheduled = false;
        if (this.state?.screen === "combat") this.render();
      });
    }
    // Completed entries hold opacity 0 in their final animation frame.
    setTimeout(() => {
      const pending = this.statusPopups.get(id);
      if (!pending) return;
      const remaining = pending.filter((entry) => entry !== popup);
      if (remaining.length) this.statusPopups.set(id, remaining);
      else this.statusPopups.delete(id);
      if (this.state?.screen === "combat") this.render();
    }, duration + (firstAt - startedAt));
  }

  syncStatusPopupAudio() {
    const combat = this.state?.combat;
    if (this.state?.screen !== "combat" || !combat || this.statusPopupCombatRef !== combat) return;
    this.statusPopupAudioClocks ??= new Map();
    this.statusPopupAudioBursts ??= new Map();
    for (const [unitId, entries] of this.statusPopups ?? []) {
      for (const popup of entries) {
        // This hook only runs after the actual popup DOM is mounted. A deferred
        // damage render must not sound an invisible label; resistance stays silent.
        if (popup.applied !== true || popup.audioPlayed || popup.audioTimer != null) continue;
        const selector = `[data-status-popup-id="${popup.id}"]`;
        if (!this.root.querySelector?.(selector)) continue;
        const start = () => {
          popup.audioTimer = null;
          if (this.state?.screen !== "combat" || this.state.combat !== combat
            || this.statusPopupCombatRef !== combat || !this.statusPopups.get(unitId)?.includes(popup)) return;
          const node = this.root.querySelector?.(selector);
          if (!node || node.isConnected === false || node.style?.getPropertyValue?.("--combat-fx-visibility") === "hidden") return;
          const now = Date.now();
          if (now >= popup.createdAt + popup.duration) { popup.audioPlayed = true; return; }
          popup.audioPlayed = true;
          const key = `${unitId}:${popup.status}`;
          const previous = this.statusPopupAudioClocks.get(key);
          if (previous != null && now - previous < STATUS_FEEDBACK_BEAT_MS) return;
          this.statusPopupAudioClocks.set(key, now);
          // If a deferred render mounts several overdue labels together, retain
          // one cue for that unit's frame instead of layering both polarities.
          const unitBurstKey = `unit:${unitId}`;
          const unitBurst = this.statusPopupAudioBursts.get(unitBurstKey);
          if (unitBurst != null && now - unitBurst < 16) return;
          this.statusPopupAudioBursts.set(unitBurstKey, now);
          const positive = POSITIVE_STATUSES.has(popup.status);
          const sound = positive ? "statusPositive" : "statusNegative";
          // An AoE can mount the same sound on several units in one frame.
          // Share that audible cue instead of stacking identical voices.
          const burst = this.statusPopupAudioBursts.get(sound);
          if (burst != null && now - burst < 16) return;
          this.statusPopupAudioBursts.set(sound, now);
          this.audio?.play?.(sound, positive ? .24 : .42);
        };
        const delay = Math.max(0, popup.createdAt - Date.now());
        if (delay > 0) popup.audioTimer = setTimeout(start, delay);
        else start();
      }
    }
  }

  isResourceFlashing(unit, resource = "hp") {
    const key = this.resourcePopupKey(unit, resource);
    return Boolean(key && this.resourceFlashes.has(key));
  }

  scheduleLockedDamagePopupRender() {
    if (this.damagePopupRenderScheduled) return;
    this.damagePopupRenderScheduled = true;
    queueMicrotask(() => {
      this.damagePopupRenderScheduled = false;
      if (this.state?.screen === "combat" && this.combatRenderLocks > 0) this.render({ force: true });
    });
  }

  async showResourceChange(unit, resource, before, after, { duration = 560, wait = true, showZeroAsLoss = false, showZeroAsGain = false, lockCombatRender = false, textOverride = null, popupClass = "", revival = false } = {}) {
    const key = this.resourcePopupKey(unit, resource);
    if (!key) return;
    const delta = Math.floor((after ?? 0) - (before ?? 0));
    if (delta === 0 && !showZeroAsLoss && !showZeroAsGain && !textOverride) return;

    if (resource === "hp" && revival) {
      // Logical HP was already restored by the original recovery resolver.
      // Delay only its bar, popup and support cue; keep the caller's existing
      // duration wait, rather than adding 150ms to lethal/combo settlement.
      const visual = this.revivalVisuals?.get(unit) ?? this.holdRevivalHp(unit);
      if (!visual || !this.isCurrentRevivalVisual(unit, visual)) return;
      clearTimeout(visual.timer);
      visual.timer = setTimeout(() => {
        if (this.revivalVisuals?.get(unit) !== visual) return;
        const current = this.isCurrentRevivalVisual(unit, visual);
        this.revivalVisuals.delete(unit);
        if (!current) return;
        if (this.state?.screen !== "combat" && delta > 0) this.audio?.play?.("support", .6);
        void this.showResourceChange(unit, resource, before, after, { duration, wait: false,
          showZeroAsLoss, showZeroAsGain, lockCombatRender, textOverride, popupClass });
        // A different unit's ongoing damage beat must not hide this ready HP
        // presentation. Its damage timing and render-lock count stay unchanged.
        if (this.state?.screen === "combat" && this.combatRenderLocks > 0 && !lockCombatRender) this.render({ force: true });
      }, REVIVAL_HP_FEEDBACK_DELAY_MS);
      this.render();
      if (wait) await this.wait(duration);
      return;
    }

    const token = `${Date.now()}-${Math.random()}`;
    const text = textOverride ?? (delta === 0 && showZeroAsLoss ? "-0" : `${delta > 0 || showZeroAsGain ? "+" : ""}${delta}`);
    this.resourcePopups.set(key, { resource, delta, text, token, createdAt: Date.now(), duration, popupClass, showZeroAsGain });
    if (delta > 0) this.resourceFlashes.set(key, token);
    if (this.state?.screen === "combat" && resource === "hp" && (delta > 0 || showZeroAsGain)) this.audio?.play?.("support", .6);

    const combatLocked = Boolean(lockCombatRender && this.state?.screen === "combat");
    if (combatLocked) {
      this.combatRenderLocks += 1;
      // Batch same-wave AoE damage popups into one forced render. This guarantees
      // that each popup DOM node is created once and cannot replay during its life.
      this.scheduleLockedDamagePopupRender();
    } else {
      this.render();
    }

    const clear = async () => {
      await this.wait(duration);
      if (this.resourcePopups.get(key)?.token === token) this.resourcePopups.delete(key);
      if (this.resourceFlashes.get(key) === token) this.resourceFlashes.delete(key);
      if (combatLocked) {
        this.combatRenderLocks = Math.max(0, this.combatRenderLocks - 1);
        if (this.combatRenderLocks === 0) {
          this.pendingCombatRender = false;
          if (this.state) this.render({ force: true });
        }
      } else if (this.state) {
        // Do not rebuild the Rest screen merely to remove a finished resource
        // popup while a meditation bar is running/frozen. Deduction pays
        // Sense at start, and that popup's cleanup used to replace the animated
        // button around 560ms, causing the otherwise-linear fill to jump. The
        // popup CSS can finish visually without a rerender; the next result/dismiss
        // render naturally reflects the cleaned popup state.
        const mapRayRevealActive = this.state.screen === "map" && Boolean(this.pathFogClearingTarget);
        if (!(this.state.screen === "rest" && this.restProgressHold) && !mapRayRevealActive) this.render();
      }
    };
    if (wait) await clear();
    else void clear();
  }

  async showDamagePopup(unit, amount, { duration = 560, wait = true } = {}) {
    const actual = Math.max(0, Math.floor(amount ?? 0));
    const hp = Number(unit?.hp ?? 0);
    const pendingMisses = Math.max(0, Math.floor(unit?.combatFlags?.mainCharacterHaloMissPopups ?? 0));
    const missed = actual === 0 && pendingMisses > 0;
    if (missed) unit.combatFlags.mainCharacterHaloMissPopups = pendingMisses - 1;
    return this.showResourceChange(unit, "hp", hp + actual, hp, {
      duration, wait, showZeroAsLoss: actual === 0 && !missed, lockCombatRender: true,
      textOverride: missed ? this.i18n.t("combat.missPopup") : null,
      popupClass: missed ? "attack-miss-popup" : "",
    });
  }

  focusCombatLog() {
    const log = this.root.querySelector(".combat-review-log") ?? this.root.querySelector(".combat-log");
    if (!log) return;
    const lineHeight = parseFloat(getComputedStyle(log).lineHeight) || 16;
    const max = Math.max(0, log.scrollHeight - log.clientHeight);
    log.scrollTop = Math.round(max / lineHeight) * lineHeight;
  }

  combatLogLineHeight(log) { return parseFloat(getComputedStyle(log).lineHeight) || 16; }

  snapCombatLog(log) {
    if (!log?.isConnected) return;
    const lineHeight = this.combatLogLineHeight(log);
    const max = Math.max(0, log.scrollHeight - log.clientHeight);
    const snapped = Math.max(0, Math.min(max, Math.round(log.scrollTop / lineHeight) * lineHeight));
    if (Math.abs(log.scrollTop - snapped) > .5) log.scrollTop = snapped;
  }

  onCombatLogWheel(event) {
    const log = event.target.closest?.(".combat-log");
    if (!log || !event.deltaY) return;
    event.preventDefault();
    const lineHeight = this.combatLogLineHeight(log);
    const max = Math.max(0, log.scrollHeight - log.clientHeight);
    const current = Math.round(log.scrollTop / lineHeight) * lineHeight;
    log.scrollTop = Math.max(0, Math.min(max, current + Math.sign(event.deltaY) * lineHeight));
  }

  onCombatLogScroll(event) {
    const log = event.target?.classList?.contains("combat-log") ? event.target : null;
    if (!log) return;
    if (this.combatLogSnapTimer) clearTimeout(this.combatLogSnapTimer);
    this.combatLogSnapTimer = setTimeout(() => {
      this.combatLogSnapTimer = null;
      this.snapCombatLog(log);
    }, 90);
  }

  showCombatFeedback(key, { flashMana = false } = {}) {
    if (this.combatFeedbackTimer) clearTimeout(this.combatFeedbackTimer);
    const token = `${Date.now()}-${Math.random()}`;
    this.combatFeedback = { key, flashMana, token };
    this.render();
    this.combatFeedbackTimer = setTimeout(() => {
      if (this.combatFeedback?.token !== token) return;
      this.combatFeedback = null;
      this.combatFeedbackTimer = null;
      if (this.state?.screen === "combat") this.render();
    }, 900);
  }

  findEnemy(uid) { return this.state?.combat?.enemies.find((e) => e.uid === uid && e.hp > 0) ?? null; }
  getLivingEnemies() { return this.combat.getLivingEnemies(); }

  clearCardSelection({ render = false } = {}) {
    const combat = this.state?.combat;
    if (!combat?.selectedCardId) return false;
    combat.selectedCardId = null;
    combat.selectedCardAt = 0;
    if (render) this.render();
    return true;
  }

  clearMindSeaSelection() {
    this.mindSeaSelectedCardUid = null;
    this.mindSeaSelectedAt = 0;
    this.mindSeaSelectedOverlayOpacity = 0;
  }

  onContextMenu(event) {
    if (this.infoCopyNotice || this.timedNotice || this.rewindNotices?.length || this.tutorials?.active || this.tutorialResetNotice || this.tutorialResetConfirm || this.pursuitResults?.active) { event.preventDefault(); return; }
    if (event.target.closest?.('[data-action="toggle-audio"]')) { event.preventDefault(); return; }
    if (this.state?.screen !== "combat" || !this.state.combat?.selectedCardId) return;
    event.preventDefault();
    this.clearCardSelection({ render: true });
  }

  increasePursuit(amount = 1, { reason = null } = {}) {
    const map = this.state?.map;
    const delta = Math.max(0, Math.floor(amount ?? 0));
    if (!map || delta <= 0) return false;
    // An increase event still counts when already capped at 5: the displayed
    // value remains 5, but the pursuit roll must occur again at the current tier.
    recordPursuitRule(this, delta, { reason });
    map.pursuit = Math.min(5, Math.max(0, map.pursuit ?? 0) + delta);
    recordPursuitPeak(this.state);
    return this.maybeTriggerPursuit();
  }

  reducePursuit(amount = 1) {
    recordPursuitRule(this, -Math.max(0, Math.floor(amount ?? 0)));
    return reducePursuitValue(this.state?.map, amount);
  }

  maybeTriggerPursuit() {
    const map = this.state.map;
    if (map.pursuitPrompt) return true;
    const p = map.pursuit;
    const chance = [0,30,45,60,75,90][p] ?? 0;
    if (p >= 1 && this.rng.chance(chance)) {
      const hideChief = Math.max(0, Math.floor(map.zhengyangChiefPursuitHideRemaining ?? 0)) > 0;
      if (hideChief) map.zhengyangChiefPursuitHideRemaining = Math.max(0, Math.floor(map.zhengyangChiefPursuitHideRemaining ?? 0) - 1);
      map.pursuitPrompt = { pursuit: p, encounter: `pursuit${p}`, excludeEnemyIds: hideChief ? ["zhengyangChief"] : [] };

      // Rookie Squad is an independent special roll layered on top of the normal
      // P1-P4 pursuit pools. P5 never rolls it. "Unseen" uses the first-meeting
      // distribution; after an escape, later eligible rolls use the lower repeat
      // distribution. Defeat permanently disables the squad for this chapter.
      const chapter = Math.max(1, Math.min(4, Math.floor(Number(this.state.run?.chapterIndex) || 1)));
      map.rookieSquadPursuitStateByChapter ??= {};
      const rookieState = map.rookieSquadPursuitStateByChapter[chapter] ?? "unseen";
      const firstRates = [0, 40, 60, 80, 100, 0];
      const repeatRates = [0, 20, 30, 40, 50, 0];
      const rookieRate = p >= 1 && p <= 4 && rookieState !== "defeated" && rookieState !== "escapedCooldown"
        ? (rookieState === "unseen" ? firstRates[p] : repeatRates[p])
        : 0;
      const rookieSquad = rookieRate > 0 && this.rng.chance(rookieRate);
      if (rookieSquad) map.pursuitPrompt.encounter = "rookieSquad";
      map.pursuitPrompt.rookieSquad = rookieSquad;
      map.pursuitPrompt.rookieSquadRate = rookieRate;

      this.persist();
      this.render();
      return true;
    }
    return false;
  }

  dismissPursuitPrompt() {
    const prompt = this.state?.map?.pursuitPrompt;
    if (!prompt) return;
    const encounter = prompt.encounter ?? `pursuit${Math.max(1, Math.min(5, prompt.pursuit ?? this.state.map.pursuit ?? 1))}`;
    const excludeEnemyIds = Array.isArray(prompt.excludeEnemyIds) ? [...prompt.excludeEnemyIds] : [];
    this.state.map.pursuitPrompt = null;
    this.persist();
    return this.combat.startEncounter(encounter, {
      pursuit: true, nodeId: null, excludeEnemyIds,
      debugEncounter: Boolean(prompt.debugEncounter), returnScreen: prompt.returnScreen ?? null,
    });
  }

  canUseTreasureToken() {
    if (this.state?.screen !== "map") return false;
    const node = this.map.currentNode?.();
    if (!node || !this.state.map.resolved?.[node.id] || this.map.nextNodes(node).length <= 0) return false;
    if (this.state.map.pendingMoveTarget || this.state.map.postBattlePrompt || this.state.map.pursuitPrompt) return false;
    return (this.state.player.stones ?? 0) >= 60;
  }

  async presentRestResultWithSound(sound, gain) {
    const state = this.state;
    const result = state.map.restSuccessResult ?? state.map.restHeartDemonResult;
    this.render();
    // Fire at the prompt's presentation frame rather than after a heavy redraw
    // followed by a cold audio load. Do not play a stale/dismissed result.
    await new Promise((resolve) => {
      const present = () => {
        if (this.state === state && state.screen === "rest" && result
          && result === (state.map.restSuccessResult ?? state.map.restHeartDemonResult)) {
          this.audio?.play?.(sound, gain);
        }
        resolve();
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(present);
      else present();
    });
  }

  async animateRestProgress(type, { duration = 900, targetPercent = 100 } = {}) {
    const button = this.root.querySelector(`[data-rest-start="${type}"]`);
    if (!button) return;

    const percent = Math.max(0, Math.min(100, Number(targetPercent) || 0));
    const fill = percent / 100;
    const runDuration = percent >= 100 ? duration : Math.max(0, Math.round(duration * fill));
    this.restProgressHold = { type, targetPercent: percent };
    button.style.setProperty("--rest-progress-target", String(fill));
    button.style.setProperty("--rest-progress-duration", `${runDuration}ms`);
    button.classList.remove("rest-progress-stopped");
    button.classList.add("rest-progressing");
    button.setAttribute("aria-busy", "true");
    this.root.querySelectorAll(".rest-screen button, .rest-screen input").forEach((control) => {
      control.style.pointerEvents = "none";
    });

    if (runDuration > 0) await this.wait(runDuration);
    else await this.wait(30);

    if (button.isConnected) {
      // Freeze the exact painted endpoint. Both successful and Heart-Demon-
      // interrupted meditation now hold their endpoint for the same 300ms before
      // the result prompt appears. The bar itself fills at a strictly linear rate,
      // so a partial interruption naturally reaches its endpoint sooner than 100%.
      // The frozen endpoint remains visible beneath the result modal until dismissed.
      button.classList.remove("rest-progressing");
      button.classList.add("rest-progress-stopped");
      button.removeAttribute("aria-busy");
      button.style.setProperty("--rest-progress-target", String(fill));
      if (percent >= 100) button.style.setProperty("--rest-progress-target", "1");
      await this.wait(300);
    }
  }

  openRest({ nodeId, remaining = 1, debugSession = false, returnScreen = null }) {
    this.audio.preload?.(["win", "fail"]);
    this.restProgressHold = null;
    this.mindSeaOpen = false;
    this.mindSeaFilter = "all";
    this.clearMindSeaSelection();
    if (debugSession) {
      this.state.map.restContext = { type: "debug", nodeId, returnScreen: returnScreen ?? this.state.screen ?? "map" };
    }
    this.state.map.spiritRestRemaining = remaining;
    this.state.map.restHeartDemonResult = null;
    this.state.map.restSuccessResult = null;
    this.state.map.pendingRestCardUnlock = null;
    this.state.map.restCardUnlockResult = null;
    this.refineBodyConfirm = false;
    this.manualStudySelection = null;
    this.manualStudyConfirm = null;
    this.manualStudyFocusPillSelection = 0;
    this.harmonizeSelection = [];
    this.harmonizeConfirm = null;
    this.state.screen = "rest";
    this.persist();
    // Enter the meditation menu first. Heart Demon is rolled only after the player
    // confirms Refine Body / Deduction / Harmonize. Manual study instead folds
    // the same meditation-success pressure into its single composite success roll.
    return this.render();
  }

  async onPlayerDeath() {
    const stateAtZero = this.state;
    const player = stateAtZero?.player;
    if (!player || player.hp > 0) return;
    await waitForZeroHpPause(this, player);
    if (this.state !== stateAtZero || player.hp > 0) return;
    if (this.state?.screen === "death" && !this.state.combat) return;
    // Share the confirmed-death task: a second lethal caller cannot record or
    // display the same defeat twice while its result waits for presentation.
    if (this.playerDeathPending?.state === stateAtZero) return this.playerDeathPending.promise;
    const pending = { state: stateAtZero, promise: null };
    this.playerDeathPending = pending;
    pending.promise = this.finishPlayerDeath(stateAtZero, player);
    try { return await pending.promise; }
    finally { if (this.playerDeathPending === pending) this.playerDeathPending = null; }
  }

  async finishPlayerDeath(stateAtZero, player) {
    if (this.state?.player?.combatFlags?.nextSpellCostOne) delete this.state.player.combatFlags.nextSpellCostOne; // legacy
    if (this.state?.player?.combatFlags?.nextSpellCostCap != null) delete this.state.player.combatFlags.nextSpellCostCap;
    if (this.state?.player?.combatFlags?.nextSwordControlCostReduction) delete this.state.player.combatFlags.nextSwordControlCostReduction;
    if (this.state?.player?.combatFlags?.nextSwordSpellCostReduction) delete this.state.player.combatFlags.nextSwordSpellCostReduction;
    if (this.state?.player?.combatFlags?.swordControlCostReduction) delete this.state.player.combatFlags.swordControlCostReduction; // legacy
    if (this.state?.player?.combatFlags?.swordSpellCostReduction) delete this.state.player.combatFlags.swordSpellCostReduction;
    if (this.state?.player?.combatFlags?.swordGodActive) delete this.state.player.combatFlags.swordGodActive;
    if (this.state?.player?.combatFlags?.swordIntentAfterSwordSpell) delete this.state.player.combatFlags.swordIntentAfterSwordSpell;
    if (this.state?.screen === "combat" && this.state.combat) {
      const combat = this.state.combat;
      if (combat.result?.type === "defeat") return;
      if (isOpeningWolfCombat(combat)) this.resetTutorialLearning({ ids: COMBAT_TUTORIAL_IDS });

      recordBattleOutcome(this.state, "defeat");
      if (!combat.debugEncounter) recordDeath(this.state);
      // Death is confirmed only after the HP-zero hold; the defeat cue follows.
      this.audio.play("death", .55);
      combat.phase = "result";
      this.deathReviewOpen = false;
      combat.selectedCardId = null;
      combat.selectedCardAt = 0;
      this.combat.addLog("combat.log.playerDied");
      this.state.overlay = null;
      // Confirm and sound the death now, then hold its visual result for 500ms.
      // Ordinary renders still see result=null throughout the presentation hold.
      await this.wait(500);
      if (this.state !== stateAtZero || this.state.combat !== combat || player.hp > 0) return;
      if (this.playerDeathPending?.state === stateAtZero) this.playerDeathPending = null;
      this.audio.play("fail", .5);
      combat.result = { type: "defeat" };
      this.commitPursuitSettlement();
      this.state.overlay = null;
      this.persist();
      this.render();
      return;
    }
    recordDeath(this.state);
    this.audio.play("death", .55);
    await this.wait(500);
    if (this.state !== stateAtZero || player.hp > 0) return;
    if (this.playerDeathPending?.state === stateAtZero) this.playerDeathPending = null;
    this.audio.play("fail", .5);
    this.state.combat = null;
    this.state.overlay = null;
    this.state.screen = "death";
    this.commitPursuitSettlement();
    this.persist();
    this.render();
  }

  dismissCombatResult() {
    const result = this.state?.combat?.result;
    if (!result) return;
    if (result.type === "qingyiAftermath") return this.combat.completeQingyiAftermath();
    if (result.type === "zhengyangChiefAftermath") return this.combat.completeZhengyangChiefAftermath();
    if (result.type === "rookieSquadAftermath") return this.combat.completeRookieSquadAftermath();
    if (result.type === "victory") return this.combat.completeVictoryResult();
    if (result.type === "swiftKill") return this.combat.completeSwiftKillResult();
    if (result.type === "escape") return this.combat.completeEscapeResult();
    if (result.type === "escapeStolen") return this.combat.completeEscapeStolenResult();
    if (result.type === "enemyEscape") return this.combat.completeEnemyEscapeResult();
    if (result.type === "longBattle") return this.combat.completeLongBattleResult();
    this.deathReviewOpen = false;
    this.state.combat = null;
    this.state.overlay = null;
    this.state.screen = "death";
    this.persist();
    this.render();
  }


  onPointerDown(event) {
    if (this.infoCopyNotice || this.timedNotice || this.rewindNotices?.length || this.tutorials?.active || this.tutorialResetNotice || this.tutorialResetConfirm || this.pursuitResults?.active) return;
    if (event.target.closest?.('[data-action="toggle-audio"]')
      && event.isPrimary !== false && (event.button ?? 0) === 0 && this.isDebugPanelScreen()) {
      this.cancelDebugAudioHold();
      this.suppressAudioClickUntil = 0;
      const pointerId = event.pointerId;
      this.debugAudioHoldPointerId = pointerId;
      this.debugAudioHoldOrigin = { x: event.clientX, y: event.clientY };
      this.debugAudioHoldTimer = setTimeout(() => {
        this.debugAudioHoldTimer = null;
        if (this.debugAudioHoldPointerId !== pointerId) return;
        this.debugAudioHoldPointerId = null;
        this.debugAudioHoldOrigin = null;
        this.suppressAudioClickUntil = Date.now() + 1000;
        this.toggleDebugPanel();
      }, 2000);
      return;
    }
    if (this.state?.screen !== "combat" || !this.combat?.isCardInputLocked?.()) return;
    if (!event.target.closest?.(".hand")) return;
    // During the post-play lock, rapid clicks should be a true no-op. Preventing
    // the pointer default stops desktop double/triple-click text selection and
    // mobile long-press selection while the cards underneath are shifting.
    event.preventDefault();
    event.stopPropagation();
  }

  onPointerMove(event) {
    if (this.debugAudioHoldPointerId !== event.pointerId || !this.debugAudioHoldOrigin) return;
    if (Math.hypot(event.clientX - this.debugAudioHoldOrigin.x,
      event.clientY - this.debugAudioHoldOrigin.y) > 12) this.cancelDebugAudioHold();
  }

  onPointerEnd(event) {
    if (this.debugAudioHoldPointerId === event.pointerId) this.cancelDebugAudioHold();
  }

  async onClick(event) {
    if (this.resourceLoading) {
      if (this.resourceLoading.error && event.target.closest?.('[data-action="retry-resources"]')) {
        return this.enterWhenResourcesReady();
      }
      return;
    }
    const tutorialAction = event.target.closest?.("[data-action]")?.dataset.action;
    if (this.rewindNotices?.length) {
      this.rewindNotices.shift();
      this.audio.play("click", .70);
      this.render();
      return;
    }
    if (this.timedNotice || this.infoCopyNotice) {
      this.dismissTimedNotice();
      this.audio.play("click", .70);
      return;
    }
    if (tutorialAction === "dismiss-global-info") return;
    if (tutorialAction === "copy-global-info") {
      this.audio.play("click", .70);
      return this.copyGlobalInfo();
    }
    if (this.restartConfirm && !["cancel-restart", "confirm-restart", "restart-confirm-content"].includes(tutorialAction)) return;
    if (this.tutorialResetConfirm) {
      if (tutorialAction === "cancel-tutorial-reset") {
        this.tutorialResetConfirm = false;
        this.audio.play("click");
        this.render({ force: true });
      } else if (tutorialAction === "confirm-tutorial-reset") {
        this.resetTutorialLearning({ notice: true });
        this.audio.play("click");
        this.render({ force: true });
      }
      return;
    }
    if (["cancel-tutorial-reset", "confirm-tutorial-reset", "tutorial-reset-confirm-content"].includes(tutorialAction)) return;
    if (tutorialAction === "reset-tutorials") {
      if (this.tutorials?.hasSeenAny() && !this.tutorialResetNotice) {
        this.tutorialResetConfirm = true;
        this.audio.play("click");
        this.render({ force: true });
      }
      return;
    }
    if (this.tutorialResetNotice) {
      if (tutorialAction === "dismiss-tutorial-reset") {
        this.tutorialResetNotice = false;
        this.audio.play("click");
        this.render();
      }
      return;
    }
    if (tutorialAction === "dismiss-tutorial-reset") return;
    if (this.tutorials?.active) {
      if (tutorialAction === "dismiss-tutorial") {
        this.tutorials.dismiss();
        this.audio.play("click");
        this.render();
      }
      return;
    }
    if (tutorialAction === "dismiss-tutorial") return;
    if (this.pursuitResults?.active) {
      if (tutorialAction === "dismiss-pursuit-result") {
        this.pursuitResults.dismiss();
        this.audio.play("click");
        if (!this.pursuitResults.hasResult && this.state?.map?.pursuitContinuation) return this.resumePursuitContinuation();
        this.render();
      }
      return;
    }
    if (tutorialAction === "dismiss-pursuit-result") return;

    // A single barrier covers asynchronous card, item, artifact and map actions.
    // Showing a prompt waits for the action's final state, without pausing its effects.
    this.tutorialActionDepth = (this.tutorialActionDepth ?? 0) + 1;
    try {
      return await App.prototype.onGameClick.call(this, event);
    } finally {
      this.tutorialActionDepth--;
      if (this.tutorialActionDepth === 0 && this.state?.screen === "map" && !this.state.combat
        && !this.state.overlay && !this.state.map?.postBattlePrompt && !this.state.map?.restContext) this.commitPursuitSettlement?.();
      if (this.tutorials && this.tutorialActionDepth === 0 && !this.tutorials.active) {
        this.checkTutorialTriggers();
        if (this.tutorials.pending.some((hint) => this.canShowTutorial(hint, this.root.innerHTML))
          || this.pursuitResults?.hasResult) this.render();
      }
    }
  }

  async onGameClick(event) {
    if (this.playerDeathPending?.state === this.state) return;
    if (this.infoCopyNotice || this.timedNotice || this.rewindNotices?.length || this.tutorialResetConfirm) return;
    if (event.detail !== 0 && Date.now() < this.suppressAudioClickUntil
      && event.target.closest?.('[data-action="toggle-audio"]')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.state?.screen === "combat" && this.combat?.isCardInputLocked?.() && event.target.closest?.(".hand")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const inventoryWasOpen = this.state?.screen === "combat" && this.state.overlay === "inventory";
    const clickedInsideInventory = Boolean(event.target.closest(".combat-inventory-panel"));
    const el = event.target.closest("[data-action]");
    if (this.restartConfirm && !["cancel-restart", "confirm-restart", "restart-confirm-content"].includes(el?.dataset.action)) return;

    const mindSeaWasOpen = ["map", "rest"].includes(this.state?.screen) && this.mindSeaOpen;
    const clickedMindSeaToggle = el?.dataset.action === "toggle-mind-sea";
    const clickedMindSeaFilter = el?.dataset.action === "mind-sea-filter";
    const clickedMindSeaCard = el?.dataset.action === "select-mind-sea-card";
    const clickedInsideMindSea = Boolean(event.target.closest?.("[data-mind-sea-panel]"));
    if (mindSeaWasOpen && !clickedMindSeaToggle && !clickedMindSeaFilter && !clickedMindSeaCard && !clickedInsideMindSea) {
      this.mindSeaOpen = false;
      this.clearMindSeaSelection();
      this.render();
      return;
    }

    const treasureTokenAction = ["use-map-artifact", "use-treasure-token", "cancel-treasure-token", "confirm-treasure-token"].includes(el?.dataset.action);
    if (this.state?.screen === "map" && this.mapInventoryExpanded && !event.target.closest(".map-inventory-panel") && !treasureTokenAction) {
      // A preview sits above the open bag. Dismiss that top layer on the first
      // outside tap; the bag should close only on a later tap with no preview.
      if (this.manualUseConfirm) {
        this.manualUseConfirm = null;
        this.render();
        return;
      }
      if (this.treasureTokenConfirm) {
        this.treasureTokenConfirm = false;
        this.render();
        return;
      }
      this.mapInventoryExpanded = false;
      this.render();
      return;
    }

    if (inventoryWasOpen && !clickedInsideInventory) {
      this.state.overlay = null;
      this.inventorySelectedId = null;
      this.pendingInventoryScrollToId = null;
      if (!el || el.dataset.action === "toggle-inventory") {
        this.render();
        return;
      }
    }

    if (this.state?.screen === "map" && this.mapInfoKey && el?.dataset.action !== "map-info") {
      this.mapInfoKey = null;
      if (!el) {
        this.render();
        return;
      }
    }

    if (this.state?.screen === "combat") {
      const clickedStatus = el?.dataset.action === "status-info" ? el.dataset.status : null;
      if (clickedStatus) {
        const clickedUnitKey = el.dataset.unitKey || "player";
        const clickedInstanceIndex = el.dataset.statusInstance === undefined ? null : Math.max(0, Math.floor(Number(el.dataset.statusInstance) || 0));
        const sameStatus = this.combatStatusInfo?.key === clickedStatus
          && this.combatStatusInfo?.unitKey === clickedUnitKey
          && (clickedInstanceIndex === null || Number(this.combatStatusInfo?.instanceIndex) === clickedInstanceIndex);
        this.combatStatusInfo = sameStatus ? null : { key: clickedStatus, unitKey: clickedUnitKey, instanceIndex: clickedInstanceIndex };
        this.render();
        return;
      }
      if (this.combatStatusInfo) {
        this.combatStatusInfo = null;
        if (!el) {
          this.render();
          return;
        }
      }
    }

    if (!el) return;
    let action = el.dataset.action;
    if (action === "inventory-entry") {
      const id = el.dataset.id;
      if (this.inventoryUseInFlight || !this.isInventoryItemPresent(id)) return;
      if (this.inventorySelectedId !== id) {
        this.inventorySelectedId = id;
        if (["map", "combat"].includes(this.state.screen)) this.pendingInventoryScrollToId = id;
        this.audio.play("click", .70);
        return this.render();
      }
      if (ARTIFACTS[id]) action = "toggle-artifact";
      else if (id === "spiritStone") action = "use-stones";
      else if (id === "treasureToken") action = "use-treasure-token";
      else {
        const item = ITEMS[id];
        if (!(item.usable ?? []).includes(this.state.screen)
          || (id === "bloodPill" && this.state.player.hp >= this.state.player.maxHp)) return;
        action = "use-item";
      }
    }
    if (action === "dismiss-rest-success" && this.rest?.isSuccessDismissLocked?.()) return;
    if (action === "play-card" && this.state?.screen === "combat" && this.combat?.isCardInputLocked?.()) return;
    const isSecondCardClick = action === "play-card"
      && this.state?.screen === "combat"
      && this.state.combat?.selectedCardId === el.dataset.id;
    const actionOwnsSound = isSecondCardClick || ["artifact", "artifact-slot", "toggle-artifact", "use-item", "use-stones", "rewind", "dismiss-opening-story", "select-mind-sea-card"].includes(action);
    if (!actionOwnsSound) this.audio.play("click", .70);

    if (this.state?.screen === "combat" && this.state.combat?.selectedCardId && !["play-card", "select-enemy", "language", "status-info"].includes(action)) {
      this.clearCardSelection();
    }

    if (action === "new-run") {
      if (this.state) return;
      const styleId = this.root.querySelector("#styleSelect")?.value ?? "sword";
      const seed = this.root.querySelector("#seedInput")?.value || Date.now();
      const request = { kind: "new", styleId, seed };
      this.startRunSelection = { styleId, seed };
      if (this.save.loadRun()) {
        this.restartConfirm = true;
        this.newRunConfirm = request;
        return this.render();
      }
      return this.enterWhenResourcesReady(request);
    }
    if (action === "restart-confirm-content") return;
    if (action === "cancel-restart") {
      this.restartConfirm = false;
      this.newRunConfirm = null;
      return this.render();
    }
    if (action === "confirm-restart" && this.restartConfirm && this.newRunConfirm && !this.state) {
      const request = this.newRunConfirm;
      this.restartConfirm = false;
      this.newRunConfirm = null;
      return this.enterWhenResourcesReady(request);
    }
    if (action === "continue-run") {
      const saved = this.save.loadRun();
      if (saved) return this.enterWhenResourcesReady({ kind: "continue", saved });
      return;
    }
    if (action === "toggle-audio") { this.audio.toggle(); this.render(); return; }
    if (!this.state) return;

    if (action === "open-completion-record") {
      if (!this.state.run?.completed || this.state.screen !== "map") return;
      this.completionRecordPreview = null;
      this.completionRecordOpen = true;
      return this.render();
    }
    if (action === "close-completion-record") { this.completionRecordOpen = false; this.completionRecordPreview = null; return this.render(); }
    if (action === "completion-record-content") return;

    if (action === "open-death-review") {
      if (this.state?.combat?.result?.type !== "defeat") return;
      this.deathReviewOpen = true;
      return this.render();
    }
    if (action === "close-death-review") {
      this.deathReviewOpen = false;
      return this.render();
    }
    if (action === "dismiss-combat-result") return this.dismissCombatResult();
    if (action === "close-refine-stats") { this.refineStatsOpen = false; return this.render(); }
    if (action === "dismiss-rest-heart-fail") return this.rest.dismissHeartDemonFailure();
    if (action === "dismiss-rest-success") return this.rest.dismissSuccessResult();
    if (action === "dismiss-harmony-milestone") return this.rest.dismissHarmonyMilestone();
    if (action === "dismiss-rest-card-unlock") return this.rest.dismissCardUnlockResult();
    if (action === "dismiss-manual-learn") {
      this.state.map.manualLearnResult = null;
      this.persist();
      return this.render();
    }
    if (action === "abandon-rest") {
      this.refineBodyConfirm = false;
      this.refineSpiritConfirm = null;
      this.refineSpiritSelection = null;
      this.refineSpiritPillSelection = 0;
      this.manualStudySelection = null;
      this.manualStudyConfirm = null;
      this.harmonizeSelection = [];
      this.harmonizeConfirm = null;
      return this.rest.abandonCurrent();
    }
    if (action === "dismiss-pursuit-prompt") return this.dismissPursuitPrompt();
    if (action === "dismiss-left-protector-gift") return this.combat.dismissLeftProtectorGift();
    if (action === "dismiss-opening-story") {
      const storyStep = Math.max(1, Math.min(5, Math.floor(this.state.map.openingStoryStep ?? 1)));
      if (storyStep < 5) {
        this.state.map.openingStoryStep = storyStep + 1; this.persist();
        this.audio.play("click", .70);
        this.render(); return;
      }
      this.state.map.openingStoryStep = 5; this.state.map.openingStoryDismissed = true; this.persist();
      // Opening the map for the first time is rewind node #1. The UI-only blackout/reveal
      // is intentionally not part of the stored state, so a later rewind returns directly to map.
      this.syncRng(); this.save.resetRewindHistory(this.state);
      const openingState = this.state;
      this.openingTransitionStage = "blackout"; this.render();
      await this.wait(200); if (!this.state?.map?.openingStoryDismissed) return; this.audio.play("footsteps", .58);
      await this.wait(1000); if (!this.state?.map?.openingStoryDismissed) return; this.audio.play("footsteps", .58);
      await this.wait(2300); if (!this.state?.map?.openingStoryDismissed) return;
      await this.showTimedNotice("autosave", 2000);
      if (this.state !== openingState || this.openingTransitionStage !== "blackout") return;
      this.openingTransitionStage = "reveal"; this.render();
      if (this.openingRevealTimer) clearTimeout(this.openingRevealTimer);
      this.openingRevealTimer = setTimeout(() => {
        if (this.openingTransitionStage === "reveal") { this.openingTransitionStage = "reveal-bgm"; this.audio.setBgm("map", .15); this.audio.fadeBgmVolume?.(.30, 2000); }
      }, 1500);
      setTimeout(() => {
        if (["reveal", "reveal-bgm"].includes(this.openingTransitionStage)) { this.openingTransitionStage = null; this.render(); }
        this.openingRevealTimer = null;
      }, 2000);
      return;
    }
    if (action === "map-info") {
      const key = el.dataset.info;
      if (!["hp", "mana", "sense", "pursuit", "heartDemon"].includes(key)) return;
      this.mapInfoKey = this.mapInfoKey === key ? null : key;
      return this.render();
    }
    if (action === "resolve-node") return this.map.resolveCurrent();
    if (action === "toggle-mind-sea") {
      if (!["map", "rest"].includes(this.state?.screen)) return;
      const opening = !this.mindSeaOpen;
      this.mindSeaOpen = opening;
      this.clearMindSeaSelection();
      if (opening) {
        this.mindSeaOpenedAt = Date.now();
        this.mindSeaSelectedOverlayOpacity = 0;
        this.mindSeaSealFailureAt = null;
      }
      if (opening) this.mindSeaFilter = "all";
      if (opening) this.mapInventoryExpanded = false;
      return this.render();
    }
    if (action === "toggle-map-inventory") {
      if (this.state?.screen !== "map") return;
      this.inventorySelectedId = null;
      this.pendingInventoryScrollToId = null;
      this.mapInventoryExpanded = !this.mapInventoryExpanded;
      if (this.mapInventoryExpanded) {
        this.mindSeaOpen = false;
        this.clearMindSeaSelection();
      }
      return this.render();
    }
    if (action === "mind-sea-filter") {
      if (!["map", "rest"].includes(this.state?.screen) || !this.mindSeaOpen) return;
      const filter = el.dataset.filter;
      if (!["all", "martial", "spell", "secret"].includes(filter)) return;
      this.mindSeaFilter = filter;
      return this.render();
    }
    if (action === "select-mind-sea-card") {
      if (!["map", "rest"].includes(this.state?.screen) || !this.mindSeaOpen) return;
      const uid = el.dataset.id;
      const card = this.state.player.deck?.find((entry) => entry.uid === uid);
      if (!card) return;
      if (card.sealed === true) {
        setCardSealed(this.state.player, uid, false);
        this.clearMindSeaSelection();
        this.audio.play("click", .70);
        this.persist();
      } else if (this.mindSeaSelectedCardUid === uid) {
        const result = setCardSealed(this.state.player, uid);
        if (!result.ok) {
          this.mindSeaSealFailureAt = Date.now();
          this.audio.play("fail", .50);
        } else {
          this.clearMindSeaSelection();
          this.audio.play("cardSeal", .55);
          this.persist();
        }
      } else {
        this.audio.play("click", .70);
        this.mindSeaSelectedCardUid = uid;
        this.mindSeaSelectedAt = Date.now();
        const art = el.querySelector?.(".mind-sea-action-art");
        const opacity = art && globalThis.getComputedStyle?.(art)?.opacity;
        this.mindSeaSelectedOverlayOpacity = opacity != null && Number.isFinite(Number(opacity))
          ? Math.max(0, Math.min(1, Number(opacity)))
          : cardContentOverlayOpacity(this.mindSeaOpenedAt, this.mindSeaSelectedAt);
      }
      return this.render();
    }
    if (action === "request-move") return this.map.requestMove(el.dataset.node);
    if (action === "cancel-move") return this.map.cancelMove();
    if (action === "confirm-move") return this.map.confirmMove();
    if (action === "move") return this.map.moveTo(el.dataset.node);
    if (action === "explore-path") return this.map.revealPath(el.dataset.node);
    if (action === "post-battle-continue") return this.map.continueAfterBattle();
    if (action === "post-battle-rest") return this.map.restAfterBattle();
    if (action === "backtrack") return this.map.backtrack();
    if (action === "stay-rest") {
      this.state.map.canStayRest = false;
      const pursuitTriggered = this.increasePursuit(1);
      this.commitPursuitSettlement();
      if (!pursuitTriggered) return this.deferPursuitContinuation({ type: "rest", nodeId: this.state.map.currentNodeId, remaining: 1 });
      this.persist(); return this.render();
    }
    if (action === "select-enemy") { this.state.combat.selectedEnemyId = el.dataset.id; return this.render(); }
    if (action === "play-card") {
      const combat = this.state.combat;
      const cardUid = el.dataset.id;
      const now = Date.now();

      if (combat.selectedCardId !== cardUid) {
        combat.selectedCardId = cardUid;
        combat.selectedCardAt = now;
        return this.render();
      }

      // A card must already be visibly locked before a later click can cast it.
      // The tiny guard also prevents an accidental duplicate/synthetic click from
      // turning the initial selection into an immediate cast on some devices.
      if (now - (combat.selectedCardAt ?? 0) < 80) return;
      const errorKey = this.combat.getCardPlayError(cardUid, combat.selectedEnemyId);
      if (errorKey) {
        this.audio.play("fail", .45);
        this.showCombatFeedback(errorKey, { flashMana: errorKey === "combat.noMana" });
        return;
      }
      return this.combat.playCard(cardUid, combat.selectedEnemyId);
    }
    if (action === "end-turn") {
      const c = this.state?.combat;
      if (!c || c.phase !== "player" || c.dealingCards || this.combat.isCardInputLocked()
        || c.result || this.state.player.hp <= 0 || isZeroHpPaused(this, this.state.player)) return;
      // An accepted manual End Turn proves the player already knows this action.
      // Forced turn endings continue directly through CombatEngine and do not mark it.
      this.tutorials?.markSeen("firstTurnEnd");
      this.resetTutorialIdle();
      return this.combat.endPlayerTurn();
    }
    if (action === "flee") return this.combat.attemptFlee();
    if (action === "predict") { event.stopPropagation(); return this.combat.predict(el.dataset.id); }
    if (action === "artifact-slot") return this.onArtifactSlotClick(Number(el.dataset.slot));
    if (action === "artifact") return this.onArtifactIconClick(el.dataset.id);
    if (action === "toggle-inventory") {
      if (this.state.screen === "combat" && (this.state.combat?.phase !== "player" || this.state.combat?.dealingCards)) return;
      if (this.state.overlay === "inventory") {
        this.inventorySelectedId = null;
        this.pendingInventoryScrollToId = null;
      }
      this.state.overlay = this.state.overlay === "inventory" ? null : "inventory";
      return this.render();
    }
    if (action === "toggle-artifact") {
      if (this.state.screen === "combat") return;
      const result = toggleArtifactEquip(this.state.player, el.dataset.id);
      if (result.capacityFull) {
        this.audio.play("fail", .45);
        return this.showArtifactCapacityFeedback();
      }
      this.clearArtifactCapacityFeedback();
      this.audio.play("click", .70);
      this.persist();
      return this.render();
    }
    if (action === "use-treasure-token" || action === "use-map-artifact") {
      const artifactId = el.dataset.id;
      if (artifactId !== "treasureToken" || !hasTreasureToken(this.state.player) || !this.canUseTreasureToken()) return;
      this.treasureTokenConfirm = true;
      return this.render();
    }
    if (action === "cancel-treasure-token") {
      this.treasureTokenConfirm = false;
      return this.render();
    }
    if (action === "confirm-treasure-token") {
      if (!this.treasureTokenConfirm || !hasTreasureToken(this.state.player) || !this.canUseTreasureToken()) {
        this.treasureTokenConfirm = false;
        return this.render();
      }
      this.treasureTokenConfirm = false;
      this.mapInventoryExpanded = false;
      this.audio.play("artifact", .55);
      recordStoneSpend(this.state, 60);
      this.state.player.stones -= 60;
      this.persist();
      return this.shop.open("__treasure_token__", { portableSession: true, returnScreen: "map" });
    }
    if (action === "use-stones") {
      const p = this.state.player;
      const stone = ITEMS.spiritStone;
      const cost = Math.max(0, Math.floor(stone.useCost ?? 20));
      const gain = Math.max(0, Math.floor(stone.manaGain ?? 1));
      if (this.inventoryUseInFlight || !["map", "combat"].includes(this.state.screen)
        || (p.stones ?? 0) < cost || (p.mana ?? 0) >= (p.maxMana ?? 0)) return;
      // Player-targeted resource use keeps the bag open; nothing important is
      // hidden behind it and this makes repeated self-maintenance less cumbersome.
      this.inventoryUseInFlight = true;
      try {
        this.audio.play("support", .6);
        const beforeMana = p.mana;
        recordStoneSpend(this.state, cost);
        p.stones -= cost;
        setMana(p, Math.min(p.maxMana, p.mana + gain));
        App.prototype.clearInventorySelectionAfterUse.call(this, "spiritStone");
        if (this.state.combat) this.combat.addLog("combat.log.useSpiritStone", { cost, before: beforeMana, after: p.mana });
        await this.showResourceChange(p, "mana", beforeMana, p.mana, { duration: 280, wait: true });
        this.persist();
        return this.render();
      } finally {
        this.inventoryUseInFlight = false;
      }
    }
    if (action === "use-item") {
      if (this.inventoryUseInFlight) return;
      const item = ITEMS[el.dataset.id];
      if (this.state.screen === "map" && item?.type === "manual") {
        this.audio.play("click", .70);
        this.manualUseConfirm = el.dataset.id;
        this.previewCardArtStartedAt = Date.now();
        return this.render();
      }
      const playerOnly = Boolean(item?.effects?.length) && item.effects.every((effect) => !["enemy", "allEnemies", "allCombatants"].includes(effect.target));
      const combat = this.state.screen === "combat" ? this.state.combat : null;
      // Offensive / enemy-targeted bag effects close first so damage, status and
      // death feedback remains unobstructed. Self-targeted recovery/support items
      // deliberately leave the bag open.
      this.inventoryUseInFlight = true;
      try {
        if (combat && !playerOnly) {
          this.state.overlay = null;
          this.inventorySelectedId = null;
          this.pendingInventoryScrollToId = null;
          this.render();
          await this.wait(60);
        }
        const result = await this.effects.useItem(el.dataset.id, this.state.combat?.selectedEnemyId);
        this.combat.cleanupDeadEnemies();
        if (result?.ok) App.prototype.clearInventorySelectionAfterUse.call(this, el.dataset.id);
        if (this.state.combat && !this.getLivingEnemies().length) return this.combat.finishVictory();
        this.persist();
        return this.render();
      } finally {
        this.inventoryUseInFlight = false;
      }
    }
    if (action === "cancel-manual-use") {
      this.manualUseConfirm = null;
      return this.render();
    }
    if (action === "confirm-manual-use") {
      // Manuals can only be studied during meditation from v0.2.56 onward.
      this.manualUseConfirm = null;
      return this.render();
    }
    if (action === "merchant-enter") return this.shop.enter();
    if (action === "shop-tab") return this.shop.setTab(el.dataset.tab);
    if (action === "buy") return this.shop.buy(Number(el.dataset.index));
    if (action === "merchant-cancel-buy") return this.shop.cancelBuy();
    if (action === "merchant-confirm-buy") return this.shop.confirmBuy();
    if (action === "sell") return this.shop.requestSell(el.dataset.id, el.dataset.kind ?? "item");
    if (action === "merchant-cancel-sell") return this.shop.cancelSell();
    if (action === "merchant-cycle-sell-quantity") return this.shop.cycleSellQuantity();
    if (action === "merchant-confirm-sell") return this.shop.confirmSell();
    if (action === "leave-shop") return this.shop.requestLeave();
    if (action === "merchant-stay") return this.shop.cancelLeave();
    if (action === "merchant-confirm-leave") return this.shop.confirmLeave();
    if (action === "merchant-discount-continue") return this.shop.dismissDiscountPrompt();
    if (action === "merchant-gift-continue") return this.shop.dismissGiftPrompt();
    if (action === "event-choice") return this.events.choose(el.dataset.id);
    if (action === "event-result-continue") return this.events.finishEvent();
    if (action === "refine-body") {
      this.refineBodyConfirm = true;
      return this.render();
    }
    if (action === "confirm-refine-body") {
      if (!this.refineBodyConfirm) return;
      this.refineBodyConfirm = false;
      this.render();
      await this.wait(30);
      return this.rest.refineBody();
    }
    if (action === "cancel-refine-body") {
      this.refineBodyConfirm = false;
      return this.render();
    }
    if (action === "refine-card") {
      const id = this.root.querySelector("[data-refine-choice]:checked")?.dataset.refineChoice ?? this.refineSpiritSelection ?? null;
      const card = this.state.player.deck.find((entry) => entry.uid === id);
      if (!card || !this.rest.canUpgrade(card)) return;
      this.refineSpiritSelection = id;
      this.refineSpiritConfirm = id;
      this.refineSpiritPillSelection = 0;
      this.previewCardArtStartedAt = Date.now();
      return this.render();
    }
    if (action === "cycle-refine-pill") {
      if (!this.refineSpiritConfirm) return;
      const owned = Math.max(0, Math.floor(this.state.player.inventory?.refiningPill ?? 0));
      if (owned <= 0) { this.refineSpiritPillSelection = 0; return this.render(); }
      const current = Math.max(0, Math.min(owned, Math.floor(this.refineSpiritPillSelection ?? 0)));
      this.refineSpiritPillSelection = current >= owned ? 0 : current + 1;
      return this.render();
    }
    if (action === "confirm-refine-card") {
      const id = this.refineSpiritConfirm ?? this.refineSpiritSelection ?? null;
      const refiningPills = Math.max(0, Math.floor(this.refineSpiritPillSelection ?? 0));
      const card = this.state.player.deck.find((entry) => entry.uid === id);
      if (!card || this.rest.getRefineFinalChance(card, refiningPills) <= 0) return;
      this.refineSpiritConfirm = null;
      this.refineSpiritSelection = id;
      // Remove the confirmation overlay first, restore the ordinary selected/enabled
      // Refine-Spirit button, then allow one short paint beat before progress begins.
      // Clear only the UI memory after that paint; the progress class itself overrides
      // disabled opacity if resource payment makes the rebuilt button ineligible.
      this.render();
      await this.wait(30);
      this.refineSpiritSelection = null;
      this.refineSpiritPillSelection = 0;
      return this.rest.refineSpirit(id, refiningPills);
    }
    if (action === "cancel-refine-card") {
      this.refineSpiritSelection = this.refineSpiritConfirm ?? this.refineSpiritSelection ?? null;
      this.refineSpiritConfirm = null;
      this.refineSpiritPillSelection = 0;
      return this.render();
    }
    if (action === "study-manual") {
      const itemId = this.root.querySelector("[data-manual-study-choice]:checked")?.dataset.manualStudyChoice ?? this.manualStudySelection ?? null;
      if (!itemId || !this.rest.canStudyManual(itemId)) return;
      this.manualStudySelection = itemId;
      this.manualStudyConfirm = itemId;
      this.manualStudyFocusPillSelection = 0;
      this.previewCardArtStartedAt = Date.now();
      return this.render();
    }
    if (action === "cycle-study-focus-pill") {
      if (!this.manualStudyConfirm) return;
      const owned = Math.max(0, Math.floor(this.state.player.inventory?.focusPill ?? 0));
      if (owned <= 0) { this.manualStudyFocusPillSelection = 0; return this.render(); }
      const current = Math.max(0, Math.min(owned, Math.floor(this.manualStudyFocusPillSelection ?? 0)));
      this.manualStudyFocusPillSelection = current >= owned ? 0 : current + 1;
      return this.render();
    }
    if (action === "confirm-study-manual") {
      const itemId = this.manualStudyConfirm ?? this.manualStudySelection ?? null;
      const focusPills = Math.max(0, Math.floor(this.manualStudyFocusPillSelection ?? 0));
      if (!itemId || this.rest.getManualStudyFinalChance(itemId, focusPills) <= 0 || !this.rest.hasChoiceResources({ type: "studyManual", itemId, focusPills })) return;
      this.manualStudyConfirm = null;
      this.manualStudySelection = itemId;
      this.render();
      await this.wait(30);
      this.manualStudySelection = null;
      this.manualStudyFocusPillSelection = 0;
      return this.rest.studyManual(itemId, focusPills);
    }
    if (action === "cancel-study-manual") {
      this.manualStudySelection = this.manualStudyConfirm ?? this.manualStudySelection ?? null;
      this.manualStudyConfirm = null;
      this.manualStudyFocusPillSelection = 0;
      return this.render();
    }
    if (action === "harmonize") {
      const ids = [...this.root.querySelectorAll("[data-harmony]:checked")].map((n) => n.dataset.harmony).slice(0, 2);
      if (ids.length !== 2 || this.state.player.deck.length - ids.length < 15) return;
      this.harmonizeSelection = [...ids];
      this.harmonizeConfirm = [...ids];
      return this.render();
    }
    if (action === "confirm-harmonize") {
      const ids = Array.isArray(this.harmonizeConfirm) ? this.harmonizeConfirm.slice(0, 2) : [];
      if (ids.length !== 2 || !this.rest.validateChoice({ type: "harmonize", cardAUid: ids[0], cardBUid: ids[1] })) return;
      this.harmonizeConfirm = null;
      this.harmonizeSelection = [...ids];
      this.render();
      await this.wait(30);
      this.harmonizeSelection = [];
      return this.rest.harmonize(ids[0], ids[1]);
    }
    if (action === "cancel-harmonize") {
      this.harmonizeSelection = Array.isArray(this.harmonizeConfirm) ? [...this.harmonizeConfirm] : this.harmonizeSelection;
      this.harmonizeConfirm = null;
      return this.render();
    }
    if (action === "rewind") {
      const nodesBack = Math.max(1, Math.min(3, Math.floor(Number(el.dataset.nodes) || 1)));
      // Death rewind preserves the Heart-Demon burden from the death timeline,
      // then adds one extra stack per node rewound. The checkpoint's older Heart
      // Demon value must never erase or reduce what the player had at death.
      const deathHeartDemon = Math.max(0, Math.floor(getStatus(this.state?.player ?? {}, "heartDemon")));
      const runRecords = structuredClone(ensureRunRecords(this.state));
      const openingWolfDefeated = Boolean(this.state.run.openingWolfDefeated);
      const restStats = structuredClone(this.rest.getRefineStats());
      const advancedSkillOrder = [...ensureAdvancedSkillOrder(this.state.player)];
      const advancedSkillHistory = structuredClone(this.state.player.advancedSkillHistory);
      const cp = this.save.loadRewindSnapshot(nodesBack);
      if (cp) {
        this.audio.play("artifact", .55);
        for (let blink = 0; blink < nodesBack; blink += 1) {
          this.root.classList.add("rewind-screen-flash");
          void this.root.offsetWidth;
          await this.wait(500);
          this.root.classList.remove("rewind-screen-flash");
          if (blink + 1 < nodesBack) await this.wait(120);
        }
        this.syncActiveRunClock();
        const activeForegroundMs = this.state.run.activeForegroundMs;
        if (cp.map) delete cp.map.pursuitContinuation;
        this.loadState(cp);
        this.state.run.openingWolfDefeated ||= openingWolfDefeated;
        this.state.run.records = mergeRewindRecords(runRecords, ensureRunRecords(this.state));
        this.state.run.refineStats = restStats;
        this.state.player.advancedSkillOrder = advancedSkillOrder;
        this.state.player.advancedSkillHistory = advancedSkillHistory;
        this.state.run.activeForegroundMs = activeForegroundMs;
        this.syncActiveRunClock();
        removeStatus(this.state.player, "heartDemon", Infinity);
        addStatus(this.state.player, "heartDemon", deathHeartDemon + nodesBack);
        this.rewindNotices = [
          { titleKey: "death.awakenTitle", bodyKey: "death.awakenText" },
          { bodyKey: "death.heartDemonGain", params: { count: nodesBack } },
        ];
        this.persist();
        this.render();
        if (this.state.screen === "map" && !this.state.map.postBattlePrompt) {
          this.suppressPursuitFeedback = true;
          try { this.map.preparePathSelection(); } finally { this.suppressPursuitFeedback = false; this.pursuitResults?.reset(); }
          this.persist(); this.render();
        }
      }
      return;
    }
    if (action === "restart" && this.state?.screen === "death") {
      this.restartConfirm = true;
      return this.render();
    }
    if (action === "confirm-restart" && this.restartConfirm && this.state?.screen === "death") {
      this.restartConfirm = false;
      this.resetTutorialIdle();
      this.playedCardManaCost = null;
      this.locationCycleLayer = null;
      this.clearRevivalVisuals?.();
      this.save.clear();
      this.state = null;
      this.activeRunClockStartedAt = null;
      this.completionRecordOpen = false;
      this.completionRecordPreview = null;
      this.rng = new RNG(Date.now());
      return this.render();
    }

    if (action === "debug-stones") {
      this.state.player.stones += 500;
      addInventoryItem(this.state.player, "highSpiritStone", 100);
      addInventoryItem(this.state.player, "spiritJade", 10);
      addInventoryItem(this.state.player, "highSpiritJade", 1);
      this.persist();
      return this.render();
    }
    if (action === "debug-heal") { const before=this.state.player.hp; this.state.player.hp = this.state.player.maxHp; void this.showResourceChange(this.state.player,"hp",before,this.state.player.hp,{wait:false}); this.persist(); return this.render(); }
    if (action === "debug-sense") { const before=this.state.player.sense; this.state.player.sense = this.state.player.maxSense; void this.showResourceChange(this.state.player,"sense",before,this.state.player.sense,{wait:false}); this.persist(); return this.render(); }
    if (action === "debug-pursuit") {
      this.increasePursuit(2);
      this.commitPursuitSettlement();
      this.persist();
      return this.render();
    }
    if (action === "debug-pursuit-down") {
      this.reducePursuit(2);
      this.commitPursuitSettlement();
      this.persist();
      return this.render();
    }
    if (action === "debug-sword-talisman") { addInventoryItem(this.state.player, "swordTalisman", 10); this.persist(); return this.render(); }
    if (action === "debug-merchant") return this.shop.open("__debug_merchant__", { debugSession: true, returnScreen: this.state.screen });
    if (action === "debug-rest") {
      const returnScreen = this.state.screen;
      return this.openRest({ nodeId: this.state.map.currentNodeId, remaining: 1, debugSession: true, returnScreen });
    }
    if (action === "debug-qingyi") {
      const returnScreen = this.state.screen;
      return this.combat.startEncounter("qingyiShop", { pursuit: false, nodeId: null, debugEncounter: true, returnScreen });
    }
    if (action === "debug-rookie-squad") {
      const returnScreen = this.state.screen;
      return this.combat.startEncounter("rookieSquad", { pursuit: false, nodeId: null, debugEncounter: true, returnScreen });
    }
    if (action === "debug-zhengyang-chief") {
      const returnScreen = this.state.screen;
      return this.combat.startEncounter("zhengyangChiefDebug", { pursuit: false, nodeId: null, debugEncounter: true, returnScreen });
    }
    if (action === "debug-zhengyang-left-protector") {
      this.state.map.pursuitPrompt = { encounter: "zhengyangLeftProtector", pursuit: this.state.map.pursuit ?? 0,
        debugEncounter: true, returnScreen: this.state.screen };
      this.persist();
      return this.render();
    }
    const manualInheritancePool = DEBUG_MANUAL_INHERITANCE_POOLS[action];
    if (manualInheritancePool) {
      for (const itemId of manualInheritancePool) addInventoryItem(this.state.player, itemId, 1);
      this.persist();
      return this.render();
    }
    if (action === "debug-inheritance") {
      addInventoryItem(this.state.player, "xuanpinQiManual", 1);
      addInventoryItem(this.state.player, "valleyGodCurseManual", 1);
      addInventoryItem(this.state.player, "spiritQuenchingManual", 1);
      addInventoryItem(this.state.player, "mysticPassageManual", 1);
      this.persist();
      return this.render();
    }
    if (action === "debug-refine-stats") {
      this.refineStatsOpen = true;
      return this.render();
    }
    if (action === "debug-completion-record") {
      if (!this.debug || !this.isDebugPanelScreen()) return;
      this.syncActiveRunClock();
      this.completionRecordPreview = completionRecord(this.state);
      this.completionRecordOpen = true;
      return this.render();
    }
    if (action === "debug-jump") {
      const nodeId = el.dataset.node;
      if (!MAP_NODES[nodeId]) return;
      this.state.map.currentNodeId = nodeId;
      this.state.map.resolved[nodeId] = false;
      this.state.map.pendingMoveTarget = null;
      this.state.map.postBattlePrompt = null;
      this.state.map.pursuitPrompt = null;
      this.state.overlay = null;
      this.state.screen = "map";
      this.persist();
      return this.map.resolveCurrent();
    }
  }

  onChange(event) {
    if (this.infoCopyNotice || this.timedNotice || this.rewindNotices?.length || this.tutorialResetConfirm) return;
    const el = event.target;
    if ((this.tutorials?.active || this.tutorialResetNotice || this.pursuitResults?.active) && el.dataset.action !== "language") return;

    if (el.matches?.("[data-refine-choice]")) {
      const choices = [...this.root.querySelectorAll("[data-refine-choice]")];
      if (el.checked) {
        choices.forEach((node) => { if (node !== el) node.checked = false; });
        this.refineSpiritSelection = el.dataset.refineChoice ?? null;
      } else {
        this.refineSpiritSelection = null;
      }
      choices.forEach((node) => { node.disabled = node.dataset.refineEligible !== "1"; });
      const submit = this.root.querySelector('[data-action="refine-card"]');
      if (submit) submit.disabled = !this.refineSpiritSelection;
      return;
    }

    if (el.matches?.("[data-manual-study-choice]")) {
      const choices = [...this.root.querySelectorAll("[data-manual-study-choice]")];
      if (el.checked) {
        choices.forEach((node) => { if (node !== el) node.checked = false; });
        this.manualStudySelection = el.dataset.manualStudyChoice ?? null;
      } else {
        this.manualStudySelection = null;
      }
      const submit = this.root.querySelector('[data-action="study-manual"]');
      if (submit) submit.disabled = !this.manualStudySelection;
      return;
    }

    if (el.matches?.("[data-harmony]")) {
      const choices = [...this.root.querySelectorAll("[data-harmony]")];
      const checked = choices.filter((node) => node.checked);
      this.harmonizeSelection = checked.map((node) => node.dataset.harmony).filter(Boolean).slice(0, 2);
      const locked = checked.length >= 2;
      choices.forEach((node) => { if (!node.checked) node.disabled = locked; });
      const submit = this.root.querySelector('[data-action="harmonize"]');
      if (submit) submit.disabled = checked.length !== 2 || (this.state.player.deck.length - checked.length < 15);
      return;
    }

    if (el.dataset.action === "language") {
      const previousLanguage = this.i18n.language;
      this.i18n.setLanguage(el.value);
      if (this.i18n.language !== previousLanguage) {
        this.merchantTextMarqueeStartedAt?.clear();
        this.enemyBuffMarqueeStartedAt?.clear();
        this.verticalTextMarqueeStartedAt?.clear();
      }
      localStorage.setItem("tianji.lang", el.value);
      if (this.state) {
        this.clearCardSelection();
        this.state.language = el.value;
        this.persist();
      }
      this.render();
    }
  }
}
