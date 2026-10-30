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
    if (!saved || (saved.version || 1) < S.settings.version) await DB.setMeta('settings', S.settings);
    await migrateLib();
    await seedTopics();
    await migrateBestDays();
    await migrateNotes();
    // 2.16: the garden starts today. Care and chains are read from the timeline silently; streaks and
    // exhibits only count from here.
    if (!S.settings.gardenSince) { S.settings.gardenSince = U.nowISO(); await DB.setMeta('settings', S.settings); }
    // v2.23: shrub flowers count only conversations from the day they arrived (no retroactive flowers)
    if (!S.settings.flowersSince) { S.settings.flowersSince = U.nowISO(); await DB.setMeta('settings', S.settings); }
    // v2.29: Getting started is for new users only; anyone who already has records skips it
    if (!S.settings.starter) {
      const forced = typeof root !== 'undefined' && root.__RV_STARTER;
      S.settings.starter = { state: forced || (S.rvs.some((r) => !r.deletedAt) ? 'off' : 'on') };
      await DB.setMeta('settings', S.settings);
    }
    S.ready = true;
    emit();
  }

  // 2.9: three note fields. Interests and record-level scriptures fold into household notes once; "Door" became "House to house".
  async function migrateNotes() {
    const changed = [];
    for (const r of S.rvs) {
      let hit = false;
      const add = [];
      if (r.interests && String(r.interests).trim()) { add.push('Interests: ' + String(r.interests).trim()); r.interests = ''; hit = true; }
      if (Array.isArray(r.scriptures) && r.scriptures.length) { add.push(lbl0('scriptures') + ': ' + r.scriptures.join(', ')); r.scriptures = []; hit = true; }
      if (add.length) r.notes = [String(r.notes || '').trim()].concat(add).filter(Boolean).join('\n');
      if (r.howMet === 'Door') { r.howMet = 'House to house'; hit = true; }
      if (hit) { touch(r); changed.push(r); }
    }
    if (changed.length) await DB.putMany('rvs', changed);
  }
  const lbl0 = (k) => (S.settings.labels && S.settings.labels[k]) || 'Scriptures';

  // 2.8: best days are a set of weekdays. Older records had a primary/secondary day with a part of day.
  async function migrateBestDays() {
    const changed = [];
    for (const r of S.rvs) {
      if (Array.isArray(r.bestDays)) continue;
      r.bestDays = L.bestDaysOf(r);
      changed.push(r);
    }
    if (changed.length) await DB.putMany('rvs', changed);
  }

  // Version 2: starters and scriptures became topics; campaigns got start/end dates.
  async function migrateLib() {
    const changed = [];
    const today = new Date();
    for (const x of S.lib) {
      if (x.deletedAt) continue;
      if (x.kind === 'starter' || x.kind === 'scripture') {
        x.tags = U.uniq((x.tags || []).concat([x.kind === 'scripture' ? 'scripture' : 'starter']));
        x.kind = 'topic';
        touch(x); changed.push(x);
      } else if (x.kind === 'campaign' && !('start' in x)) {
        // a campaign that was switched on keeps running for 30 days; others wait for dates
        x.topic = x.topic || '';
        x.publications = x.publications || '';
        x.start = x.active ? U.toDateStr(today) : '';
        x.end = x.active ? U.toDateStr(U.addDays(today, 30)) : '';
        touch(x); changed.push(x);
      }
    }
    if (changed.length) await DB.putMany('lib', changed);
  }

  // v2.40: the conversation topic library (RV.library) seeded as ordinary topics, switched off. Ids are fixed
  // ("lib-<id>") so backups merge without duplicates; a deleted one stays deleted; edits keep the original in
  // RV.library for Reset to original.
  async function seedTopics() {
    if (!RV.library) return;
    const have = new Set(S.lib.map((x) => x.id));
    const add = [];
    RV.library.TOPICS.forEach((t, i) => {
      const id = 'lib-' + t.id;
      if (have.has(id)) return;
      add.push({ id, kind: 'topic', builtin: t.id, title: t.title, question: t.question, scripture: t.scripture, next: t.next, video: t.video, source: t.source,
        theme: t.theme, text: '', tags: [], showOnHome: false, active: false, order: i + 1, updatedAt: U.nowISO(), deletedAt: null });
    });
    if (!add.length) return;
    S.lib.push(...add);
    await DB.putMany('lib', add);
  }
  function resetTopic(id) {
    const o = S.lib.find((x) => x.id === id);
    const t = o && o.builtin && RV.library ? RV.library.byId(o.builtin) : null;
    if (!t) return null;
    return updateLib(id, { title: t.title, question: t.question, scripture: t.scripture, next: t.next, video: t.video, source: t.source, text: '' });
  }
  // themes: an ordered list in settings; deleting one moves its topics to the next (or the one before)
  const themes = () => (S.settings.themes || []).slice();
  function saveThemes(list) { saveSettings((s) => { s.themes = list; }); }
  function addTheme(name) { const t = { id: 't' + Date.now().toString(36), name }; saveThemes(themes().concat(t)); return t; }
  function renameTheme(id, name) { saveThemes(themes().map((t) => (t.id === id ? Object.assign({}, t, { name }) : t))); }
  function moveTheme(id, dir) {
    const list = themes(), i = list.findIndex((t) => t.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    saveThemes(list);
  }
  function deleteTheme(id) {
    const list = themes(), i = list.findIndex((t) => t.id === id);
    if (i < 0) return;
    const to = (list[i + 1] || list[i - 1] || { id: '' }).id;
    for (const x of S.lib) if (x.kind === 'topic' && x.theme === id) { x.theme = to; touch(x); persist('lib', x); }
    list.splice(i, 1);
    saveThemes(list);
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
      bestDays: [], dayPrimary: null, daySecondary: null, whatsNext: '', campaignId: null, publication: '', progress: '', nextStart: '',
      notes: '', interests: '', scriptures: [], tags: [], custom: {},
      stage: first.id, archiveReason: null, prevStage: null, nextVisit: null, snoozedUntil: null, nhBannerOff: false, geo: null,
      createdAt: now, stageChangedAt: now, updatedAt: now, deletedAt: null,
    }, f || {});
  }
  function addRv(fields) {
    const rv = blankRv(fields);
    if (!fields || !Array.isArray(fields.bestDays)) rv.bestDays = L.bestDaysOf(Object.assign({}, rv, { bestDays: undefined }));
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
    const entry = mkEntry(rvId, 'stage', Object.assign({ from, to, reason: opts.reason || null, text: opts.text || '' }, opts.grew ? { grew: true } : {}), at);
    S.entries.push(entry);
    persist('entries', entry);
    rv.stage = to;
    rv.stageChangedAt = at;
    if (rv.garden) rv.garden = Object.assign({}, rv.garden, { since: at }); // the next bar starts empty
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
    const entry = mkEntry(rvId, 'visit', Object.assign({ text: (o.text || '').trim(), scriptures: o.scriptures || [], campaignId: o.campaignId || null }, o.progress || o.nextStart || o.study ? { study: true, progress: (o.progress || '').trim(), nextStart: (o.nextStart || '').trim(), publication: (o.publication || rv.publication || '').trim() } : {}), o.at);
    // garden: did this visit leave a plan, and did a follow-up date carry the chain past its gap?
    const G = RV.garden;
    const before = S.entries.filter((e) => e.rvId === rvId);
    const careBefore = G && !o.imported ? G.care(rv, before, S.settings, new Date()) : 0;
    if (G && G.heldLink(rv, before, S.settings, entry.at)) entry.chainHeld = true;
    entry.plan = entry.study ? !!entry.nextStart : !!String(typeof o.whatsNext === 'string' ? o.whatsNext : rv.whatsNext || '').trim();
    // revived: this conversation lifted a Thirsty or Wilting plant back to health
    if (G && careBefore && careBefore <= G.CARE.DRY && G.care(rv, before.concat([entry]), S.settings, new Date()) >= G.CARE.HEALTHY) entry.revived = true;
    S.entries.push(entry);
    persist('entries', entry);
    rv.nextVisit = o.nextVisit || null;
    rv.snoozedUntil = o.snoozedUntil || null;
    if (typeof o.whatsNext === 'string') rv.whatsNext = o.whatsNext.trim();
    if (typeof o.publication === 'string') rv.publication = o.publication.trim();
    if (typeof o.progress === 'string' && o.progress.trim()) rv.progress = o.progress.trim();
    if (typeof o.nextStart === 'string') rv.nextStart = o.nextStart.trim();
    if (o.tags && o.tags.length) rv.tags = U.uniq(rv.tags.concat(o.tags));
    touch(rv);
    persist('rvs', rv);
    let stageRes = null, grew = null, revealed = null;
    const formBefore = G ? G.formOf(S.settings, rv.stage) : 0;
    if (o.stage && o.stage !== rv.stage) stageRes = setStage(rvId, o.stage); // a manual move earns no growth
    else if (G && !o.imported) {
      // grows one stage at a time when this live visit completes the step
      const from = rv.stage;
      const to = G.growth(rv, S.entries.filter((e) => e.rvId === rvId), S.settings, new Date(entry.at) > new Date() ? new Date(entry.at) : new Date());
      if (to) { stageRes = setStage(rvId, to, { grew: true, at: entry.at }); grew = { from, to }; }
    }
    // v2.34: a live conversation that finds the plant at leafy or above with no kind reveals its kind
    const bagBefore = (S.settings.kindBag || []).slice();
    if (G && !o.imported && G.needsReveal(rv, S.settings)) {
      const forced = typeof window !== 'undefined' && window.__RV_KIND;
      const d = forced ? { kind: forced, bag: bagBefore } : G.drawPlantKind(bagBefore);
      rv.kind = d.kind;
      touch(rv);
      persist('rvs', rv);
      S.settings.kindBag = d.bag;
      persist('meta', S.settings);
      revealed = { kind: d.kind, fromForm: formBefore, toForm: G.formOf(S.settings, rv.stage) };
    }
    emit();
    return {
      entry, stageEntry: stageRes && stageRes.entry, grew,
      revived: entry.revived ? { form: G.formOf(S.settings, rv.stage), from: careBefore } : null,
      revealed, careBefore,
      undo: () => {
        if (stageRes) purgeEntry(stageRes.entry.id); purgeEntry(entry.id); restoreRvSnapshot(snap);
        if (revealed) { S.settings.kindBag = bagBefore; persist('meta', S.settings); }
        emit();
      },
    };
  }

  // Grow one step if the record's timeline now completes one (used after a visit is edited into a study).
  // Returns {grew: {from, to}, undo} or null.
  function growNow(rvId) {
    const G = RV.garden, rv = rvById(rvId);
    if (!G || !rv) return null;
    const from = rv.stage;
    const to = G.growth(rv, S.entries.filter((e) => e.rvId === rvId), S.settings, new Date());
    if (!to) return null;
    const res = setStage(rvId, to, { grew: true });
    return res ? { grew: { from, to }, undo: res.undo } : null;
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
  const campaigns = () => S.lib.filter((x) => x.kind === 'campaign' && !x.deletedAt).sort((a, b) => ((a.start || '9') < (b.start || '9') ? -1 : 1));
  const activeCampaign = (now) => L.activeCampaign(campaigns(), now);
  const featuredTopics = () => libItems('topic').filter((x) => x.showOnHome);

  // ---------- backup, restore, import, erase ----------
  function exportAll() {
    return {
      app: 'rv-app', version: 2, exportedAt: U.nowISO(),
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
    await migrateLib();
    await seedTopics();
    emit();
  }
  function importRvs(rvs, entries) {
    // v2.34: imports stop short of the leafy stage (where a plant's kind is revealed), unless a study
    const rvBand = L.shownStages(S.settings).find((x) => x.key === 'rv');
    for (const r of rvs) { if (rvBand && rvBand.ids.indexOf(r.stage) > 0) r.stage = rvBand.ids[0]; delete r.kind; }
    for (const r of rvs) { S.rvs.push(r); persist('rvs', r); }
    for (const e of entries) { S.entries.push(e); persist('entries', e); }
    emit();
  }
  async function eraseAll() {
    await pending;
    for (const st of ['rvs', 'entries', 'lib', 'meta']) await DB.clear(st);
    S.rvs = []; S.entries = []; S.lib = []; S.settings = D.defaultSettings();
    await DB.setMeta('settings', S.settings);
    await seedTopics();
    emit();
  }

  // neighborhoods offered in forms: saved list plus whatever is already used
  const neighborhoods = () =>
    U.uniq(S.settings.lists.neighborhoods.concat(S.rvs.filter((r) => !r.deletedAt).map((r) => r.neighborhood).filter(Boolean))).sort(U.cmp);
  const publications = () => U.uniq(S.rvs.filter((r) => !r.deletedAt).map((r) => r.publication).filter(Boolean)).sort(U.cmp);
  const allTags = () => U.uniq([].concat(...S.rvs.filter((r) => !r.deletedAt).map((r) => r.tags || []))).sort(U.cmp);

  RV.store = {
    S, subscribe: (f) => { listeners.add(f); return () => listeners.delete(f); },
    load, items, itemFor, rvById, saveSettings, persistRv: (rv) => { touch(rv); persist('rvs', rv); }, blankRv, addRv, updateRv, deleteRv, restoreRvSnapshot,
    addEntry, updateEntry, deleteEntry, purgeEntry, logNH, setStage, logVisit, snooze, growNow,
    libItems, addLib, updateLib, deleteLib, resetTopic, themes, addTheme, renameTheme, moveTheme, deleteTheme, campaigns, activeCampaign, featuredTopics, exportAll, restore, importRvs, eraseAll, neighborhoods, allTags, publications,
    flush: () => pending, clearError: () => { S.error = ''; emit(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
