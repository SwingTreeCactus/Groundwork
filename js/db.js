/* RV app: IndexedDB wrapper. Falls back to memory if the browser blocks storage. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const DB_NAME = 'rvapp';
  const VERSION = 1;
  const STORES = ['rvs', 'entries', 'lib', 'meta'];

  let db = null;
  const mem = { rvs: new Map(), entries: new Map(), lib: new Map(), meta: new Map() };
  const keyOf = (store) => (store === 'meta' ? 'key' : 'id');

  function open() {
    return new Promise((resolve) => {
      let req;
      try {
        if (!root.indexedDB) return resolve(false);
        req = root.indexedDB.open(DB_NAME, VERSION);
      } catch (e) {
        return resolve(false);
      }
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of STORES) {
          if (!d.objectStoreNames.contains(s)) {
            const os = d.createObjectStore(s, { keyPath: keyOf(s) });
            if (s === 'entries') os.createIndex('rvId', 'rvId');
          }
        }
      };
      req.onsuccess = () => { db = req.result; db.onversionchange = () => db.close(); resolve(true); };
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    });
  }

  function tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      let out;
      const os = t.objectStore(store);
      out = fn(os);
      t.oncomplete = () => resolve(out && typeof out === 'object' && 'result' in out ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    });
  }

  const api = {
    persistent: false,
    async init() {
      this.persistent = await open();
      if (this.persistent && root.navigator && navigator.storage && navigator.storage.persist) {
        try { navigator.storage.persist(); } catch (e) { /* ignore */ }
      }
      return this.persistent;
    },
    async getAll(store) {
      if (!db) return Array.from(mem[store].values());
      return tx(store, 'readonly', (os) => os.getAll());
    },
    async put(store, obj) {
      if (!db) { mem[store].set(obj[keyOf(store)], obj); return obj; }
      await tx(store, 'readwrite', (os) => os.put(obj));
      return obj;
    },
    async putMany(store, objs) {
      if (!objs.length) return;
      if (!db) { for (const o of objs) mem[store].set(o[keyOf(store)], o); return; }
      await tx(store, 'readwrite', (os) => { for (const o of objs) os.put(o); });
    },
    async del(store, id) {
      if (!db) { mem[store].delete(id); return; }
      await tx(store, 'readwrite', (os) => os.delete(id));
    },
    async clear(store) {
      if (!db) { mem[store].clear(); return; }
      await tx(store, 'readwrite', (os) => os.clear());
    },
    async getMeta(key) {
      if (!db) return (mem.meta.get(key) || {}).value;
      const r = await tx('meta', 'readonly', (os) => os.get(key));
      return r ? r.value : undefined;
    },
    async setMeta(key, value) {
      return this.put('meta', { key, value });
    },
  };

  RV.db = api;
})(typeof window !== 'undefined' ? window : globalThis);
