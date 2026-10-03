// Resource bytes only: never reads/writes the tianji.run/checkpoint save keys.
// CacheStorage on HTTPS/localhost; IndexedDB on ordinary HTTP LAN addresses.
export async function openResourceStore(cacheName, prefix) {
  if (globalThis.caches) {
    try {
      const current = await caches.open(cacheName);
      const olderNames = (await caches.keys()).filter((name) => name.startsWith(prefix) && name !== cacheName);
      const older = await Promise.all(olderNames.map((name) => caches.open(name)));
      const currentKeys = new Set();
      return {
        kind: "cache-storage",
        async get(key) {
          for (const cache of [current, ...older]) {
            const response = await cache.match(key);
            if (response) { if (cache === current) currentKeys.add(key); return response.arrayBuffer(); }
          }
          return null;
        },
        async put(key, buffer, mime) {
          await current.put(key, new Response(buffer, { headers: { "Content-Type": mime } }));
          currentKeys.add(key);
        },
        isCurrent(key) { return currentKeys.has(key); },
        async remove(key) { currentKeys.delete(key); await Promise.all([current, ...older].map((cache) => cache.delete(key))); },
      };
    } catch { /* Private modes may expose but deny CacheStorage. */ }
  }
  if (globalThis.indexedDB) {
    try {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("tianji-resource-bytes-v1", 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("bytes", { keyPath: "id" });
          store.createIndex("resourceKey", "resourceKey");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Resource database blocked"));
      });
      const requestValue = (request) => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const currentKeys = new Set();
      return {
        kind: "indexed-db",
        async get(key) {
          const store = db.transaction("bytes", "readonly").objectStore("bytes");
          const current = await requestValue(store.get(`${cacheName}|${key}`));
          if (current) { currentKeys.add(key); return current.buffer; }
          const record = await requestValue(db.transaction("bytes", "readonly").objectStore("bytes")
            .index("resourceKey").get(`${prefix}|${key}`));
          return record?.buffer ?? null;
        },
        async put(key, buffer, mime) {
          await new Promise((resolve, reject) => {
            const tx = db.transaction("bytes", "readwrite");
            tx.objectStore("bytes").put({ id: `${cacheName}|${key}`, resourceKey: `${prefix}|${key}`, buffer, mime });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error("Resource write aborted"));
          });
          currentKeys.add(key);
        },
        isCurrent(key) { return currentKeys.has(key); },
        async remove(key) {
          currentKeys.delete(key);
          await new Promise((resolve, reject) => {
            const tx = db.transaction("bytes", "readwrite");
            const store = tx.objectStore("bytes");
            const request = store.index("resourceKey").openCursor(`${prefix}|${key}`);
            request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
          });
        },
      };
    } catch { /* A denied database still allows an honest in-memory ready gate. */ }
  }
  const bytes = new Map();
  return {
    kind: "memory",
    async get(key) { return bytes.get(key)?.slice(0) ?? null; },
    async put(key, buffer) { bytes.set(key, buffer.slice(0)); },
    isCurrent(key) { return bytes.has(key); },
    async remove(key) { bytes.delete(key); },
  };
}
