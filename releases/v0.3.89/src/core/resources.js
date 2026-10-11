import { GAME_VERSION } from "./version.js?v=v0.3.89";
import { sha256 } from "./resource-hash.js?v=v0.3.89";
import { openResourceStore } from "./resource-store.js?v=v0.3.89";

export class ResourceLoadError extends Error {
  constructor(category, url, cause) {
    super(`Required ${category} resource failed: ${url}`, { cause });
    this.category = category; this.resourceUrl = url;
  }
}

const CATEGORIES = ["scripts", "styles", "images", "audio"];
const TIMEOUT_MS = 30000;
const ASSET_URLS = new Map();
const canonicalJson = (value) => JSON.stringify(value, function (key, entry) {
  return entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map((name) => [name, entry[name]])) : entry;
});

export function resourceUrl(path) { return ASSET_URLS.get(path) ?? path; }

// Called before innerHTML is assigned, so image elements use cached blobs from
// their very first request, including portraits and opportunity-scene SVGs.
export function resolveResourceHtml(html) {
  return html.replace(/\bsrc="(\.\/assets\/[^"?#]+)(?:\?[^"#]*)?"/g,
    (attribute, path) => ASSET_URLS.has(path) ? `src="${ASSET_URLS.get(path)}"` : attribute);
}

function mimeFor(entry) {
  if (entry.category === "audio") return "audio/wav";
  if (entry.url.endsWith(".svg")) return "image/svg+xml";
  if (entry.url.endsWith(".webp")) return "image/webp";
  if (entry.url.endsWith(".png")) return "image/png";
  if (entry.category === "styles") return "text/css";
  if (entry.url.endsWith(".html")) return "text/html";
  return "text/javascript";
}

async function prepareImage(url) {
  await new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.src = ""; reject(new Error("Image decode timed out")); }, TIMEOUT_MS);
    const finish = (error) => { clearTimeout(timer); image.onload = image.onerror = null; error ? reject(error) : resolve(); };
    image.onload = () => finish();
    image.onerror = () => finish(new Error("Image decode failed"));
    image.src = url;
  });
}

export class ResourceManager {
  constructor(audio, options = {}) {
    this.audio = audio;
    this.baseUrl = options.baseUrl ?? new URL("../../", import.meta.url).href;
    this.fetch = options.fetch ?? globalThis.fetch?.bind(globalThis);
    this.openStore = options.openStore ?? openResourceStore;
    this.prepareImage = options.prepareImage ?? prepareImage;
    this.version = options.version ?? GAME_VERSION;
    this.ready = false; this.inFlight = null;
    this.preparedHashes = new Map(); this.objectUrls = new Map();
    this.stores = new Map();
    this.cachePrefix = `tianji.resources.${encodeURIComponent(new URL(this.baseUrl).pathname)}.`;
  }

  async fetchBytes(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok || response.type === "opaque") throw new Error(`HTTP ${response.status}`);
      return await response.arrayBuffer();
    } finally { clearTimeout(timer); }
  }

  async loadManifest() {
    const url = new URL("./resource-manifest.json", this.baseUrl);
    url.searchParams.set("v", this.version);
    const metaStore = await this.getStore(`${this.cachePrefix}manifest.${this.version}`);
    const validate = async (bytes) => {
      const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      const payload = { schema: manifest.schema, version: manifest.version, resources: manifest.resources };
      const revision = await sha256(new TextEncoder().encode(canonicalJson(payload)).buffer);
      if (manifest.revision !== revision) throw new Error("Manifest checksum mismatch");
      if (manifest.schema !== 1 || manifest.version !== this.version || !/^[a-f0-9]{64}$/.test(manifest.revision)
        || !Array.isArray(manifest.resources) || !manifest.resources.length) throw new Error("Manifest version/schema mismatch");
      const paths = new Set();
      for (const entry of manifest.resources) {
        const url = new URL(entry.url, this.baseUrl);
        if (!entry.url.startsWith("./") || url.origin !== new URL(this.baseUrl).origin
          || !url.pathname.startsWith(new URL(this.baseUrl).pathname) || paths.has(url.pathname)
          || !CATEGORIES.includes(entry.category) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0
          || !/^[a-f0-9]{64}$/.test(entry.sha256)
          || (entry.category === "audio" && (!["sfx", "bgm"].includes(entry.audioKind) || !Array.isArray(entry.audioIds) || !entry.audioIds.length))) {
          throw new Error("Invalid required resource entry");
        }
        paths.add(url.pathname);
      }
      return manifest;
    };
    try {
      let bytes, manifest;
      try {
        bytes = await metaStore.get(url.href);
        if (bytes) manifest = await validate(bytes);
        if (manifest && manifest.version !== this.version) manifest = null;
      } catch { manifest = null; }
      if (bytes && !manifest) { try { await metaStore.remove(url.href); } catch { /* Fetch repairs runtime metadata. */ } }
      if (!manifest) {
        bytes = await this.fetchBytes(url.href);
        manifest = await validate(bytes);
      }
      if (!metaStore.isCurrent?.(url.href)) {
        try { await metaStore.put(url.href, bytes, "application/json"); } catch { this.persistenceLimited = true; }
      }
      return manifest;
    } catch (cause) { throw new ResourceLoadError("check", "resource-manifest.json", cause); }
  }

  async getStore(name) {
    if (!this.stores.has(name)) this.stores.set(name, await this.openStore(name, this.cachePrefix));
    return this.stores.get(name);
  }

  keyFor(entry) {
    const url = new URL(entry.url, this.baseUrl);
    // Content hash is the reuse key across versions; the containing cache is
    // versioned. Identical old images/audio can be reused after full validation.
    url.search = ""; url.searchParams.set("tj_hash", entry.sha256);
    return url.href;
  }

  async isValid(entry, bytes) {
    return bytes?.byteLength === entry.bytes && await sha256(bytes) === entry.sha256;
  }

  async prepareEntry(entry, bytes) {
    if (this.preparedHashes.get(entry.url) === entry.sha256) return;
    if (entry.category === "audio" && entry.audioKind === "sfx") {
      // Decode remains mandatory validation, even though native media plays SFX.
      await this.audio.prepareSfx(entry.audioIds, bytes, entry.sha256);
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeFor(entry) }));
      try { this.audio.prepareSfxMedia?.(entry.audioIds, url); }
      catch (error) { URL.revokeObjectURL(url); throw error; }
      const old = this.objectUrls.get(entry.url);
      if (old) URL.revokeObjectURL(old);
      this.objectUrls.set(entry.url, url);
    } else if (entry.category === "images" || entry.audioKind === "bgm") {
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeFor(entry) }));
      try {
        if (entry.category === "images") await this.prepareImage(url);
        else this.audio.prepareBgm(entry.audioIds, url);
      } catch (error) { URL.revokeObjectURL(url); throw error; }
      const old = this.objectUrls.get(entry.url);
      if (old) URL.revokeObjectURL(old);
      this.objectUrls.set(entry.url, url);
      if (entry.category === "images") ASSET_URLS.set(entry.url, url);
    }
    this.preparedHashes.set(entry.url, entry.sha256);
  }

  async loadEntry(entry) {
    const key = this.keyFor(entry);
    try {
      let bytes;
      try { bytes = await this.store.get(key); } catch { bytes = null; }
      if (bytes && !await this.isValid(entry, bytes)) {
        try { await this.store.remove(key); } catch { /* The network can still repair the runtime bytes. */ }
        bytes = null;
      }
      if (!bytes) {
        bytes = await this.fetchBytes(key);
        if (!await this.isValid(entry, bytes)) throw new Error("Resource size/hash mismatch");
      }
      await this.prepareEntry(entry, bytes);
      // Cache write refusal never substitutes a success marker for resource
      // readiness: validated/decoded bytes remain usable for this page lifetime.
      if (!this.store.isCurrent?.(key)) {
        try { await this.store.put(key, bytes, mimeFor(entry)); } catch { this.persistenceLimited = true; }
      }
    } catch (cause) { throw new ResourceLoadError(entry.category, entry.url, cause); }
  }

  ensureReady({ onProgress = () => {} } = {}) {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.loadAll(onProgress).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  async loadAll(onProgress) {
    this.ready = false;
    onProgress({ percent: 0, category: "check", completed: 0, total: 0 });
    const manifest = await this.loadManifest();
    this.manifest = manifest;
    this.cacheName = `${this.cachePrefix}${manifest.version}.${manifest.revision}`;
    this.store = await this.getStore(this.cacheName);
    let finished = 0;
    for (const category of CATEGORIES) {
      const entries = manifest.resources.filter((entry) => entry.category === category);
      if (!entries.length) continue;
      let completed = 0, next = 0, failure = null;
      const report = () => onProgress({ category, completed, total: entries.length,
        percent: Math.min(99, Math.floor(100 * finished / manifest.resources.length)) });
      report();
      const worker = async () => {
        while (!failure && next < entries.length) {
          const entry = entries[next++];
          try { await this.loadEntry(entry); finished++; completed++; report(); }
          catch (error) { failure ??= error; }
        }
      };
      // Wait for all workers to settle before exposing Retry, so a failed
      // attempt cannot race a newer attempt or overwrite its progress.
      await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
      if (failure) throw failure;
    }
    // No saved boolean can bypass verification of every manifest member.
    this.ready = true;
    onProgress({ percent: 100, category: "audio",
      completed: manifest.resources.filter((entry) => entry.category === "audio").length,
      total: manifest.resources.filter((entry) => entry.category === "audio").length });
    return manifest;
  }

  applyBackgrounds() {
    if (!globalThis.document?.documentElement?.style) return;
    for (const [name, path] of [["--cave-bg-image", "./assets/images/cave-bg.svg"], ["--path-cave-image", "./assets/images/path-cave.svg"]]) {
      const url = ASSET_URLS.get(path);
      if (url) document.documentElement.style.setProperty(name, `url("${url}")`);
    }
  }

  registerWorker() {
    // IndexedDB/decoded buffers/blob URLs provide the same gate on HTTP LAN.
    // A worker is only an additional route for code/CSS on secure origins.
    if (!globalThis.navigator?.serviceWorker || !globalThis.isSecureContext) return;
    const url = new URL("./service-worker.js", this.baseUrl);
    url.searchParams.set("v", this.version);
    void navigator.serviceWorker.register(url.href, { scope: this.baseUrl, updateViaCache: "none" }).catch(() => {});
  }
}
