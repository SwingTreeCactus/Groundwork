/* RV app: in-memory state backed by IndexedDB, plus every mutation the UI can make.
   Memory is updated immediately (fast UI); writes are queued to the database in order. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const U = RV.util, L = RV.logic, D = RV.defaults, DB = RV.db;

  const S = { settings: D.defaultSettings(), rvs: [], entries: [], lib: [], ready: false, error: '', persistent: true };
  const listeners = new Set();
  let version = 0, cache = null, pending = Promise.resolve();

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const emit = () => { version++; cache = null; listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); };
  function persist(store, obj) {
    pending = pending
      .then(() => (store === 'meta' ? DB.setMeta('settings', obj) : DB.put(store, obj)))
      .catch((err) => { S.error = 'Could not save: ' + (err && err.message ? err.message : err); emit(); });
    return pending;
  }
  const touch = (o) => { o.updatedAt = U.nowISO(); return o; };

  const rvById = (id) => S.rvs.find((r) => r.id === id && !r.deletedAt) || null;

  function items(now) {
    const minute = Math.floor((now ? +now : Date.now()) / 60000);
    if (cache && cache.version === version && cache.minute === minute) return cache.items;
    const it = L.buildItems(S.rvs, S.entries, S.settings, now);
    cache = { version, minute, items: it };
    return it;
  }
  const itemFor = (id, now) => items(now).find((i) => i.rv.id === id) || null;

  // ---------- lifecycle ----------
  async function load() {
    S.persistent = await DB.init();
    S.rvs = await DB.getAll('rvs');
    S.entries = await DB.getAll('entries');
    S.lib = await DB.getAll('lib');
    const saved = await DB.getMeta('settings');
    S.settings = D.mergeSettings(saved);
    if (!saved) await DB.setMeta('settings', S.settings);
    S.ready = true;
    emit();
  }

  function saveSettings(mutator) {
    mutator(S.settings);
    persist('meta', S.settings);
    emit();
  }

  // ---------- RVs ----------
  function blankRv(f) {
    const now = U.nowISO();
    const first = S.settings.stages.find((s) => s.id === 'initial') || S.settings.stages.find((s) => !s.closed);
    return Object.assign({
      id: U.uuid(), name: '', address: '', neighborhood: '', phone: '', howMet: '', bestTimes: [], bestNote: '',
      notes: '', interests: '', scriptures: [], tags: [], custom: {},
      stage: first.id, archiveReason: null, prevStage: null, nextVisit: null, snoozedUntil: null, nhBannerOff: false,
      createdAt: now, stageChangedAt: now, updatedAt: now, deletedAt: null,
    }, f || {});
  }
  function addRv(fields) {
    const rv = blankRv(fields);
    S.rvs.push(rv);
    persist('rvs', rv);
    emit();
    return rv;
  }
  function updateRv(id, patch) {
    const rv = rvById(id);
    if (!rv) return null;
    Object.assign(rv, patch);
    touch(rv);
    persist('rvs', rv);
    emit();
    return rv;
  }
  function restoreRvSnapshot(snap) {
    const i = S.rvs.findIndex((r) => r.id === snap.id);
    if (i >= 0) S.rvs[i] = snap; else S.rvs.push(snap);
    persist('rvs', snap);
  }
  function deleteRv(id) {
    const rv = rvById(id);
    if (!rv) return;
    rv.deletedAt = U.nowISO();
    touch(rv);
    persist('rvs', rv);
    emit();
  }

  // ---------- timeline entries ----------
  function mkEntry(rvId, type, f, at) {
    const now = U.nowISO();
    return Object.assign({ id: U.uuid(), rvId, type, at: at || now, text: '', scriptures: [], updatedAt: now, deletedAt: null }, f || {});
  }
  function addEntry(rvId, type, f, at) {
    const e = mkEntry(rvId, type, f, at);
    S.entries.push(e);
    persist('entries', e);
    emit();
    return e;
  }
  function updateEntry(id, patch) {
    const e = S.entries.find((x) => x.id === id);
    if (!e) return null;
    Object.assign(e, patch);
    touch(e);
    persist('entries', e);
    emit();
    return e;
  }
  function deleteEntry(id) { return updateEntry(id, { deletedAt: U.nowISO() }); }
  function purgeEntry(id) { // used only by Undo of something created seconds ago
    const i = S.entries.findIndex((x) => x.id === id);
    if (i >= 0) S.entries.splice(i, 1);
    pending = pending.then(() => DB.del('entries', id)).catch(() => {});
    emit();
  }

  // One-tap Not Home. Returns {entry, undo}.
  function logNH(rvId) {
    const e = addEntry(rvId, 'nh', {});
    return { entry: e, undo: () => purgeEntry(e.id) };
  }

  // Stage change. Writes a stage entry. Returns {entry, undo} or null if nothing changed.
  function setStage(rvId, to, opts) {
    opts = opts || {};
    const rv = rvById(rvId);
    if (!rv) return null;
    if (rv.stage === to && !opts.reason) return null;
    const snap = clone(rv);
    const from = rv.stage;
    const target = L.stageOf(S.settings, to);
    const at = opts.at || U.nowISO();
    const entry = mkEntry(rvId, 'stage', { from, to, reason: opts.reason || null, text: opts.text || '' }, at);
    S.entries.push(entry);
    persist('entries', entry);
    rv.stage = to;
    rv.stageChangedAt = at;
    if (target.closed) {
      rv.archiveReason = opts.reason || 'other';
      rv.prevStage = L.stageOf(S.settings, from).closed ? snap.prevStage : from;
    } else {
      rv.archiveReason = null;
      rv.prevStage = null;
    }
    touch(rv);
    persist('rvs', rv);
    emit();
    return { entry, undo: () => { purgeEntry(entry.id); restoreRvSnapshot(snap); emit(); } };
  }

  // Record visit: always writes a visit entry; clears any old schedule/snooze unless new ones are given.
  function logVisit(rvId, o) {
    const rv = rvById(rvId);
    if (!rv) return null;
    const snap = clone(rv);
    const entry = mkEntry(rvId, 'visit', { text: (o.text || '').trim(), scriptures: o.scriptures || [] }, o.at);
    S.entries.push(entry);
    persist('entries', entry);
    rv.nextVisit = o.nextVisit || null;
    rv.snoozedUntil = o.snoozedUntil || null;
    if (o.tags && o.tags.length) rv.tags = U.uniq(rv.tags.concat(o.tags));
    if (o.scriptures && o.scriptures.length) rv.scriptures = U.uniq((rv.scriptures || []).concat(o.scriptures));
    touch(rv);
    persist('rvs', rv);
    let stageRes = null;
    if (o.stage && o.stage !== rv.stage) stageRes = setStage(rvId, o.stage);
    emit();
    return {
      entry, stageEntry: stageRes && stageRes.entry,
      undo: () => { if (stageRes) purgeEntry(stageRes.entry.id); purgeEntry(entry.id); restoreRvSnapshot(snap); emit(); },
    };
  }

  function snooze(rvId, dateStr) {
    const rv = rvById(rvId);
    if (!rv) return null;
    const snap = clone(rv);
    updateRv(rvId, { snoozedUntil: dateStr || null });
    return { undo: () => { restoreRvSnapshot(snap); emit(); } };
  }

  // ---------- libraries (starters, scriptures, topics, campaigns) ----------
  const libItems = (kind) =>
    S.lib.filter((x) => x.kind === kind && !x.deletedAt).sort((a, b) => (a.order || 0) - (b.order || 0) || U.cmp(a.title, b.title));
  function addLib(kind, f) {
    const order = libItems(kind).reduce((m, x) => Math.max(m, x.order || 0), 0) + 1;
    const o = Object.assign({ id: U.uuid(), kind, title: '', text: '', tags: [], showOnHome: true, active: false, order, updatedAt: U.nowISO(), deletedAt: null }, f || {});
    S.lib.push(o);
    persist('lib', o);
    emit();
    return o;
  }
  function updateLib(id, patch) {
    const o = S.lib.find((x) => x.id === id);
    if (!o) return null;
    Object.assign(o, patch);
    touch(o);
    persist('lib', o);
    emit();
    return o;
  }
  const deleteLib = (id) => updateLib(id, { deletedAt: U.nowISO() });

  // ---------- backup, restore, import, erase ----------
  function exportAll() {
    return {
      app: 'rv-app', version: 1, exportedAt: U.nowISO(),
      settings: S.settings, rvs: S.rvs, entries: S.entries, lib: S.lib,
    };
  }
  async function restore(data, mode) {
    if (!data || data.app !== 'rv-app' || !Array.isArray(data.rvs) || !Array.isArray(data.entries)) throw new Error('This file is not an RV app backup.');
    await pending;
    if (mode === 'replace') {
      S.rvs = data.rvs; S.entries = data.entries; S.lib = data.lib || [];
      S.settings = D.mergeSettings(data.settings);
      for (const st of ['rvs', 'entries', 'lib']) await DB.clear(st);
      await DB.putMany('rvs', S.rvs); await DB.putMany('entries', S.entries); await DB.putMany('lib', S.lib);
      await DB.setMeta('settings', S.settings);
    } else {
      const mergeInto = async (store, local, incoming) => {
        const map = new Map(local.map((x) => [x.id, x]));
        const changed = [];
        for (const r of incoming) {
          const cur = map.get(r.id);
          if (!cur || (r.updatedAt || '') > (cur.updatedAt || '')) { map.set(r.id, r); changed.push(r); }
        }
        await DB.putMany(store, changed);
        return Array.from(map.values());
      };
      S.rvs = await mergeInto('rvs', S.rvs, data.rvs);
      S.entries = await mergeInto('entries', S.entries, data.entries);
      S.lib = await mergeInto('lib', S.lib, data.lib || []);
    }
    emit();
  }
  function importRvs(rvs, entries) {
    for (const r of rvs) { S.rvs.push(r); persist('rvs', r); }
    for (const e of entries) { S.entries.push(e); persist('entries', e); }
    emit();
  }
  async function eraseAll() {
    await pending;
    for (const st of ['rvs', 'entries', 'lib', 'meta']) await DB.clear(st);
    S.rvs = []; S.entries = []; S.lib = []; S.settings = D.defaultSettings();
    await DB.setMeta('settings', S.settings);
    emit();
  }

  // neighborhoods offered in forms: saved list plus whatever is already used
  const neighborhoods = () =>
    U.uniq(S.settings.lists.neighborhoods.concat(S.rvs.filter((r) => !r.deletedAt).map((r) => r.neighborhood).filter(Boolean))).sort(U.cmp);
  const allTags = () => U.uniq([].concat(...S.rvs.filter((r) => !r.deletedAt).map((r) => r.tags || []))).sort(U.cmp);

  RV.store = {
    S, subscribe: (f) => { listeners.add(f); return () => listeners.delete(f); },
    load, items, itemFor, rvById, saveSettings, addRv, updateRv, deleteRv, restoreRvSnapshot,
    addEntry, updateEntry, deleteEntry, purgeEntry, logNH, setStage, logVisit, snooze,
    libItems, addLib, updateLib, deleteLib, exportAll, restore, importRvs, eraseAll, neighborhoods, allTags,
    flush: () => pending, clearError: () => { S.error = ''; emit(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
