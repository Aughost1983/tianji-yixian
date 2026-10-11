import { ITEMS } from "../data/items.js?v=v0.3.89";
import { ARTIFACTS } from "../data/artifacts.js?v=v0.3.89";
import { addInventoryItem, isArtifactOwned, hasTreasureToken } from "./state.js?v=v0.3.89";
import { grantArtifactWithTutorial } from "./tutorials.js?v=v0.3.89";
import { recordStoneGain, recordStoneSpend } from "./run-records.js?v=v0.3.89";

const SHELF_SIZE = 10;
const PILL_SLOTS = 4;
const TALISMAN_SLOTS = 4;
const MANUAL_SLOTS = 1;
const SHOP_STOCK_VERSION = 15;
const DISCOUNT_RATE = 0.8;

function sortShelfGroup(entries) {
  return entries.sort((a, b) => {
    const defA = a?.kind === "artifact" ? ARTIFACTS[a.id] : ITEMS[a?.id];
    const defB = b?.kind === "artifact" ? ARTIFACTS[b.id] : ITEMS[b?.id];
    const priceDelta = Number(a?.price ?? defA?.price ?? 0) - Number(b?.price ?? defB?.price ?? 0);
    if (priceDelta !== 0) return priceDelta;
    return Number(defA?.itemNo ?? Number.MAX_SAFE_INTEGER) - Number(defB?.itemNo ?? Number.MAX_SAFE_INTEGER);
  });
}

function saleableItemIds(type = null) {
  return Object.values(ITEMS)
    .filter((item) => item.shopSellable && Number.isFinite(item.price) && (!type || item.type === type))
    .map((item) => item.id);
}

function saleableArtifactIds() {
  return Object.values(ARTIFACTS).filter((artifact) => artifact.shopSellable && Number.isFinite(artifact.price)).map((artifact) => artifact.id);
}

function shelfGroupTotal(entries) {
  return entries.reduce((sum, entry) => sum + Math.max(0, Number(entry?.price ?? 0)), 0);
}

function shelfSignature(shelf) {
  return (shelf?.entries ?? []).map((entry) => entry ? `${entry.kind}:${entry.id}` : "-").join("|");
}

export class ShopEngine {
  constructor(app) { this.app = app; }

  ensureShopState() {
    const state = this.app.state;
    state.map.shopStocks ??= {};
    state.map.shopUi ??= { nodeId: null, entered: false, tab: "buy" };
    state.map.shopUi.leavePrompt ??= false;
    state.map.shopUi.buyConfirm ??= null;
    state.map.shopUi.sellConfirm ??= null;
    state.map.shopUi.discountPrompt ??= false;
    state.map.shopUi.discountRollUsed ??= false;
    state.map.shopUi.discountActive ??= false;
    state.map.shopUi.retentionUsed ??= false;
    state.map.shopUi.debugSession ??= false;
    state.map.shopUi.returnScreen ??= null;
    state.world ??= { flags: {} };
    state.world.flags ??= {};
    state.world.flags.shopPurchasedArtifacts ??= [];
    if (!Array.isArray(state.world.flags.shopPurchasedArtifacts)) state.world.flags.shopPurchasedArtifacts = [];
    state.world.flags.lastShopShelfSignature ??= null;
    if (hasTreasureToken(state.player)) state.world.flags.treasureTokenGranted = true;
    else state.world.flags.treasureTokenGranted ??= false;
    state.map.shopUi.purchaseSpent ??= 0;
    state.map.shopUi.giftPrompt ??= false;
    state.map.shopUi.portableSession ??= false;
  }

  artifactUnavailable(id) {
    return isArtifactOwned(this.app.state.player, id);
  }

  generateShelf() {
    this.ensureShopState();
    const entries = [];
    const pillIds = saleableItemIds("pill");
    const talismanIds = saleableItemIds("talisman");
    const manualIds = saleableItemIds("manual");
    const availableArtifacts = saleableArtifactIds().filter((id) => !this.artifactUnavailable(id));

    const makeEntry = (id) => id ? ({ kind: "item", id, price: ITEMS[id].price, soldOut: false }) : null;
    const pickRepeatableId = (ids) => ids.length ? ids[this.app.rng.int(0, ids.length - 1)] : null;
    const pickRepeatable = (ids) => makeEntry(pickRepeatableId(ids));
    const pickDistinctIds = (ids, count) => {
      const pool = [...ids];
      const out = [];
      while (pool.length && out.length < count) {
        const index = this.app.rng.int(0, pool.length - 1);
        out.push(pool.splice(index, 1)[0]);
      }
      return out;
    };

    // Slots 1-4: two repeatable low-grade pills (grade 1-2), followed by two
    // distinct high-grade pills (grade 3-4). If the bag has zero Great Derivation
    // Pills, one high-grade slot is guaranteed to be that pill. The completed
    // four-slot block is then sorted by price, then item number.
    const lowPillIds = pillIds.filter((id) => [1, 2].includes(ITEMS[id]?.rarity));
    const highPillIds = pillIds.filter((id) => [3, 4].includes(ITEMS[id]?.rarity));
    const pills = [pickRepeatable(lowPillIds), pickRepeatable(lowPillIds)];
    const ownedRefining = Math.max(0, Math.floor(this.app.state.player.inventory?.refiningPill ?? 0));
    let highPicks = [];
    if (ownedRefining <= 0 && highPillIds.includes("refiningPill")) {
      const others = highPillIds.filter((id) => id !== "refiningPill");
      highPicks = ["refiningPill", ...pickDistinctIds(others, 1)];
    } else {
      highPicks = pickDistinctIds(highPillIds, 2);
    }
    pills.push(...highPicks.map(makeEntry));
    sortShelfGroup(pills);

    // Slots 5-8: three repeatable grade 1-2 talismans and one grade 3-4 talisman,
    // then sort the whole four-slot talisman block by price/item number.
    const lowTalismanIds = talismanIds.filter((id) => [1, 2].includes(ITEMS[id]?.rarity));
    const highTalismanIds = talismanIds.filter((id) => [3, 4].includes(ITEMS[id]?.rarity));
    const talismans = [
      pickRepeatable(lowTalismanIds),
      pickRepeatable(lowTalismanIds),
      pickRepeatable(lowTalismanIds),
      pickRepeatable(highTalismanIds),
    ];
    sortShelfGroup(talismans);

    // Slot 9 remains one common spell manual.
    const manuals = sortShelfGroup(Array.from({ length: MANUAL_SLOTS }, () => pickRepeatable(manualIds)));
    entries.push(...pills, ...talismans, ...manuals);

    // Slot 10 remains one available artifact. Once every merchant artifact has
    // been acquired, fall back to another common manual.
    if (availableArtifacts.length) {
      const id = availableArtifacts[this.app.rng.int(0, availableArtifacts.length - 1)];
      entries.push({ kind: "artifact", id, price: ARTIFACTS[id].price, soldOut: false });
    } else {
      entries.push(pickRepeatable(manualIds));
    }

    while (entries.length < SHELF_SIZE) entries.push(null);
    return { version: SHOP_STOCK_VERSION, entries };
  }

  ensureShelf(nodeId = this.app.state.map.currentNodeId) {
    this.ensureShopState();
    const current = this.app.state.map.shopStocks[nodeId];
    if (!current || current.version !== SHOP_STOCK_VERSION || !Array.isArray(current.entries) || current.entries.length !== SHELF_SIZE) {
      this.app.state.map.shopStocks[nodeId] = this.generateShelf();
    }
    return this.app.state.map.shopStocks[nodeId];
  }

  getShelf() {
    const nodeId = this.app.state.map.shopUi?.nodeId ?? this.app.state.map.currentNodeId;
    return this.ensureShelf(nodeId);
  }

  priceFor(entry) {
    if (!entry) return 0;
    const rate = this.app.state.map.shopUi?.discountActive ? DISCOUNT_RATE : 1;
    return Math.max(0, Math.floor(Number(entry.price ?? 0) * rate));
  }

  discountChance() {
    return Math.max(0, Math.min(100, Math.floor((this.app.state.player.stones ?? 0) / 10)));
  }

  open(nodeId, { debugSession = false, portableSession = false, returnScreen = null } = {}) {
    const state = this.app.state;
    this.ensureShopState();
    // Every genuine shop entry gets a fresh shelf, regardless of whether the
    // caller is a map node or the debug doorway. It must also differ from the
    // immediately previous visit even in the rare case RNG reproduces the same
    // ten-item layout. The stock then stays stable for this shopping visit.
    const previousSignature = state.world.flags.lastShopShelfSignature ?? null;
    delete state.map.shopStocks[nodeId];
    let freshShelf = this.generateShelf();
    for (let attempt = 0; previousSignature && shelfSignature(freshShelf) === previousSignature && attempt < 63; attempt += 1) {
      freshShelf = this.generateShelf();
    }
    if (previousSignature && shelfSignature(freshShelf) === previousSignature) {
      // Deterministic-RNG safety fallback: change the unrestricted common-manual
      // slot to another manual, guaranteeing a visibly different next shelf.
      const manualIds = saleableItemIds("manual");
      const currentManualId = freshShelf.entries[8]?.id;
      const currentIndex = Math.max(0, manualIds.indexOf(currentManualId));
      const alternateId = manualIds[(currentIndex + 1) % manualIds.length];
      if (alternateId && alternateId !== currentManualId) {
        freshShelf.entries[8] = { kind: "item", id: alternateId, price: ITEMS[alternateId].price, soldOut: false };
      }
    }
    state.map.shopStocks[nodeId] = freshShelf;
    state.world.flags.lastShopShelfSignature = shelfSignature(freshShelf);
    state.map.shopUi = {
      nodeId,
      entered: false,
      tab: "buy",
      leavePrompt: false,
      buyConfirm: null,
      sellConfirm: null,
      discountPrompt: false,
      discountRollUsed: false,
      discountActive: false,
      retentionUsed: false,
      debugSession,
      portableSession,
      returnScreen: (debugSession || portableSession) ? (returnScreen ?? state.screen ?? "map") : null,
      purchaseSpent: 0,
      giftPrompt: false,
    };
    state.screen = "shop";
    this.app.persist();
    this.app.render();
  }

  enter() {
    this.ensureShopState();
    const ui = this.app.state.map.shopUi;
    ui.nodeId ??= this.app.state.map.currentNodeId;
    ui.entered = true;
    ui.tab = "buy";
    ui.leavePrompt = false;
    ui.discountPrompt = false;
    this.app.persist();
    this.app.render();
  }

  setTab(tab) {
    if (!["buy", "sell"].includes(tab)) return;
    this.ensureShopState();
    this.app.state.map.shopUi.entered = true;
    this.app.state.map.shopUi.tab = tab;
    this.app.state.map.shopUi.buyConfirm = null;
    this.app.state.map.shopUi.sellConfirm = null;
    this.app.persist();
    this.app.render();
  }

  buy(index) {
    this.ensureShopState();
    const state = this.app.state;
    const shelf = this.getShelf();
    const entry = shelf.entries[index];
    const price = this.priceFor(entry);
    if (!entry || entry.soldOut || state.player.stones < price) return;
    if (entry.kind === "artifact" && this.artifactUnavailable(entry.id)) {
      entry.soldOut = true;
      this.app.persist();
      return this.app.render();
    }

    state.map.shopUi.buyConfirm = { index, kind: entry.kind, id: entry.id };
    this.app.previewCardArtStartedAt = Date.now();
    this.app.persist();
    this.app.render();
  }

  cancelBuy() {
    this.ensureShopState();
    this.app.state.map.shopUi.buyConfirm = null;
    this.app.persist();
    this.app.render();
  }

  confirmBuy() {
    this.ensureShopState();
    const state = this.app.state;
    const pending = state.map.shopUi.buyConfirm;
    state.map.shopUi.buyConfirm = null;
    const shelf = this.getShelf();
    const entry = Number.isInteger(pending?.index) ? shelf.entries[pending.index] : null;
    const price = this.priceFor(entry);
    if (!entry || entry.id !== pending?.id || entry.kind !== pending?.kind || entry.soldOut || state.player.stones < price) {
      this.app.persist();
      return this.app.render();
    }
    if (entry.kind === "artifact" && this.artifactUnavailable(entry.id)) {
      entry.soldOut = true;
      this.app.persist();
      return this.app.render();
    }

    recordStoneSpend(state, price);
    state.player.stones -= price;
    state.map.shopUi.purchaseSpent = Math.max(0, Math.floor(state.map.shopUi.purchaseSpent ?? 0)) + price;
    if (entry.kind === "item") addInventoryItem(state.player, entry.id, 1);
    if (entry.kind === "artifact") {
      grantArtifactWithTutorial(this.app, entry.id, { autoEquip: true });
      if (!state.world.flags.shopPurchasedArtifacts.includes(entry.id)) state.world.flags.shopPurchasedArtifacts.push(entry.id);
    }
    entry.soldOut = true;
    this.app.persist();
    this.app.render();
  }

  itemSellPrice(itemId) {
    const item = ITEMS[itemId];
    if (!item) return null;
    if (Number.isFinite(item.sell)) return Math.max(0, Math.floor(item.sell));
    if (Number.isFinite(item.price)) return Math.max(0, Math.floor(item.price * 0.60));
    return null;
  }

  artifactSellPrice(artifactId) {
    const artifact = ARTIFACTS[artifactId];
    if (!artifact || artifact.hidden || ["tianji", "heartMace"].includes(artifactId)) return null;
    if (Number.isFinite(artifact.sell)) return Math.max(0, Math.floor(artifact.sell));
    if (Number.isFinite(artifact.price)) return Math.max(0, Math.floor(artifact.price * 0.80));
    return null;
  }

  requestSell(entryId, kind = "item") {
    this.ensureShopState();
    const state = this.app.state;
    if (kind !== "item") return this.sell(entryId, kind);
    const item = ITEMS[entryId];
    const price = this.itemSellPrice(entryId);
    if (!item || price == null || (state.player.inventory?.[entryId] ?? 0) <= 0) return;
    state.map.shopUi.sellConfirm = { itemId: entryId, quantity: 1 };
    this.app.previewCardArtStartedAt = Date.now();
    this.app.persist();
    this.app.render();
  }

  cancelSell() {
    this.ensureShopState();
    this.app.state.map.shopUi.sellConfirm = null;
    this.app.persist();
    this.app.render();
  }

  sellQuantityLimit(itemId) {
    const owned = Math.max(0, Math.floor(this.app.state.player.inventory?.[itemId] ?? 0));
    return ITEMS[itemId] && owned > 1 ? owned : 1;
  }

  cycleSellQuantity() {
    this.ensureShopState();
    const pending = this.app.state.map.shopUi.sellConfirm;
    if (!pending?.itemId) return;
    const limit = this.sellQuantityLimit(pending.itemId);
    const current = Math.max(1, Math.min(limit, Math.floor(pending.quantity ?? 1)));
    pending.quantity = current >= limit ? 1 : current + 1;
    this.app.persist();
    this.app.render();
  }

  confirmSell() {
    this.ensureShopState();
    const pending = this.app.state.map.shopUi.sellConfirm;
    this.app.state.map.shopUi.sellConfirm = null;
    if (!pending?.itemId) {
      this.app.persist();
      return this.app.render();
    }
    const quantity = Math.max(1, Math.min(this.sellQuantityLimit(pending.itemId), Math.floor(pending.quantity ?? 1)));
    return this.sell(pending.itemId, "item", quantity);
  }

  sell(entryId, kind = "item", quantity = 1) {
    const state = this.app.state;
    if (kind === "artifact") {
      // Artifacts are no longer merchant-sellable. Keep the legacy price helper
      // for old data/tests, but reject any stale or manually forged sell action.
      return;
    } else {
      const price = this.itemSellPrice(entryId);
      const owned = Math.max(0, Math.floor(state.player.inventory?.[entryId] ?? 0));
      if (price == null || owned <= 0) return;
      const sold = Math.max(1, Math.min(owned, Math.floor(quantity ?? 1)));
      state.player.inventory[entryId] -= sold;
      recordStoneGain(state, price * sold);
      state.player.stones += price * sold;
    }
    this.app.persist();
    this.app.render();
  }

  requestLeave() {
    this.ensureShopState();
    const ui = this.app.state.map.shopUi;
    // The merchant gets exactly one retention attempt per visit. Once the
    // prompt has appeared, any later Leave click exits immediately whether the
    // discount was offered, declined, or never rolled because the player stayed.
    if (ui.retentionUsed || ui.discountActive) {
      ui.leavePrompt = false;
      ui.discountPrompt = false;
      return this.finishLeave();
    }
    ui.retentionUsed = true;
    ui.leavePrompt = true;
    ui.discountPrompt = false;
    this.app.persist();
    this.app.render();
  }

  cancelLeave() {
    this.ensureShopState();
    this.app.state.map.shopUi.leavePrompt = false;
    this.app.persist();
    this.app.render();
  }

  confirmLeave() {
    this.ensureShopState();
    const ui = this.app.state.map.shopUi;
    ui.leavePrompt = false;
    if (!ui.discountRollUsed) {
      ui.discountRollUsed = true;
      const chance = this.discountChance();
      if (this.app.rng.chance(chance)) {
        ui.discountActive = true;
        ui.discountPrompt = true;
        ui.tab = "buy";
        this.app.persist();
        return this.app.render();
      }
    }
    return this.finishLeave();
  }

  dismissDiscountPrompt() {
    this.ensureShopState();
    const ui = this.app.state.map.shopUi;
    ui.discountPrompt = false;
    ui.entered = true;
    ui.tab = "buy";
    this.app.persist();
    this.app.render();
  }

  finishLeave() {
    this.ensureShopState();
    const state = this.app.state;
    const ui = state.map.shopUi;
    const debugSession = Boolean(ui.debugSession);
    const portableSession = Boolean(ui.portableSession);
    const returnScreen = ui.returnScreen ?? "map";
    const nodeId = ui.nodeId;

    // A genuine single visit that spends at least 120 Spirit Stones earns the
    // one-time Treasure Token only on the player's actual final departure (after
    // the normal retention/discount interaction has fully ended).
    const qualifiesForToken = !debugSession
      && !state.world.flags.treasureTokenGranted
      && !hasTreasureToken(state.player)
      && Math.max(0, Math.floor(ui.purchaseSpent ?? 0)) >= 120;
    if (qualifiesForToken) {
      addInventoryItem(state.player, "treasureToken", 1);
      state.world.flags.treasureTokenGranted = true;
      ui.leavePrompt = false;
      ui.discountPrompt = false;
      ui.giftPrompt = true;
      this.app.persist();
      return this.app.render();
    }

    if (!debugSession && !portableSession) this.app.map.completeCurrentNodeIfNeeded();
    if (nodeId) delete state.map.shopStocks[nodeId];
    state.map.shopUi = { nodeId: null, entered: false, tab: "buy", retentionUsed: false, buyConfirm: null, sellConfirm: null };
    state.screen = (debugSession || portableSession) ? returnScreen : "map";
    if (!debugSession && !portableSession) this.app.map.preparePathSelection();

    // Every real Treasure Pavilion departure (map node or Treasure Token summon)
    // rolls once. Each complete 50 Spirit Stones carried adds 20 percentage points,
    // capped at 100% from 250 stones onward. Debug exits never generate live content.
    const carriedStones = Math.max(0, Math.floor(state.player.stones ?? 0));
    const qingyiChance = Math.min(100, Math.floor(carriedStones / 50) * 20);
    const qingyiAmbush = !debugSession
      && state.screen === "map"
      && qingyiChance > 0
      && this.app.rng.chance(qingyiChance);
    this.app.commitPursuitSettlement?.();
    this.app.persist();
    this.app.render();
    if (qingyiAmbush) {
      if (this.app.deferPursuitContinuation) return this.app.deferPursuitContinuation({ type: "qingyiAmbush" });
      return this.app.combat.startEncounter("qingyiShop", { pursuit: false, nodeId: null });
    }
  }

  dismissGiftPrompt() {
    this.ensureShopState();
    if (!this.app.state.map.shopUi.giftPrompt) return;
    this.app.state.map.shopUi.giftPrompt = false;
    return this.finishLeave();
  }
}
