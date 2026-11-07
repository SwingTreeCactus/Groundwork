/* Groundwork v2.51: Today's list. The people you mean to see today, in the order you add them, with an optional
   note for the day. Follow-up dates for today join on their own. Visits and Not Homes tick people off; the list
   clears overnight and nobody is marked missed. Kept in settings.todayList = { day, ids, off, note } so it goes
   with backups. Pure parts take settings; the rest uses the store. */
(function (root) {
  const RV = (root.RV = root.RV || {});
  const U = RV.util;

  const dayStr = (now) => U.toDateStr(now || new Date());
  // today's saved list, or an empty one when the saved list is from another day
  function stateOf(settings, now) {
    const d = dayStr(now), t = settings.todayList || {};
    return t.day === d ? { day: d, ids: (t.ids || []).slice(), off: (t.off || []).slice(), note: t.note || '', skip: (t.skip || []).slice() } : { day: d, ids: [], off: [], note: '', skip: [] };
  }
  const followUpToday = (rv, now) => !rv.deletedAt && rv.snoozedUntil === dayStr(now);
  // the latest visit or Not Home today, or null
  function doneToday(it, now) {
    const t0 = U.startOfDay(now || new Date()).getTime();
    let best = null;
    for (const e of it.entries) {
      if (e.deletedAt || (e.type !== 'visit' && e.type !== 'nh')) continue;
      const t = new Date(e.at).getTime();
      if (t >= t0 && (!best || t > new Date(best.at).getTime())) best = e;
    }
    return best;
  }
  // The rows: follow-ups for today (unless taken off) and the people added, in the saved order; follow-ups not
  // yet placed come first. Closed (archived) contacts are left out.
  function rows(items, settings, now) {
    now = now || new Date();
    const st = stateOf(settings, now);
    const byId = new Map(items.map((it) => [it.rv.id, it]));
    const isOpen = (it) => it && !it.rv.deletedAt && it.att.state !== 'closed';
    const fus = items.filter((it) => isOpen(it) && followUpToday(it.rv, now) && !st.off.includes(it.rv.id) && !st.ids.includes(it.rv.id))
      .sort((a, b) => U.cmp(a.rv.name, b.rv.name)).map((it) => it.rv.id);
    return fus.concat(st.ids).map((id) => byId.get(id)).filter(isOpen).map((it) => ({ it, followUp: followUpToday(it.rv, now), done: doneToday(it, now) }));
  }
  const has = (items, settings, id, now) => rows(items, settings, now).some((r) => r.it.rv.id === id);

  // ---------- changes (through the store) ----------
  const ST = () => RV.store;
  function save(fn) {
    ST().saveSettings((s) => { const st = stateOf(s, new Date()); fn(st); s.todayList = st; });
  }
  function add(id) { save((st) => { st.off = st.off.filter((x) => x !== id); if (!st.ids.includes(id)) st.ids.push(id); }); }
  function remove(id) { save((st) => { st.ids = st.ids.filter((x) => x !== id); if (!st.off.includes(id)) st.off.push(id); }); }
  // v2.55: "Not today" on a Could visit today suggestion (until tomorrow)
  function notToday(id) { save((st) => { if (!st.skip.includes(id)) st.skip.push(id); }); }
  function unskip(id) { save((st) => { st.skip = st.skip.filter((x) => x !== id); }); }
  function setNote(text) { save((st) => { st.note = String(text || '').trim(); }); }
  // a full new order (ids as shown); follow-ups in it become placed
  function reorder(ids) { save((st) => { st.ids = ids.slice(); }); }

  RV.todayList = { stateOf, rows, has, doneToday, followUpToday, add, remove, notToday, unskip, setNote, reorder };
  if (typeof module !== 'undefined') module.exports = RV.todayList;
})(typeof window !== 'undefined' ? window : globalThis);
