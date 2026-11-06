/* Groundwork v2.53: service time. The calendar's logic: time profiles by month, recorded sessions (with overlaps
   counted once), month totals with leftover minutes carried forward, the plan from My schedule, pace, the days
   with visits but no time, the Bible study tally and the report text.
   Where things live:
   - settings.service: { setup, since, profiles: [{ from: 'YYYY-MM', kind: 'pioneer'|'caux'|'publisher'|'other',
     track, goal }], aux: { 'YYYY-MM': 15|30 }, pattern: { 0..6: [plan session] }, overrides: { date: [sessions] },
     cleared: { date: true }, seenMonth }
   - lib items kind 'time' (one per recorded session: date, mode 'total'|'range', mins, start, end, brk, credit)
   - lib items kind 'svmonth', id 'svm-YYYY-MM' (month adjustments, Sent, comments, history)
   Lib items merge record by record with Drive and backups. The pure part takes a data bundle D and runs in Node. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const U = RV.util;

  // ---------- small helpers ----------
  const pad2 = (n) => String(n).padStart(2, '0');
  const monthOf = (d) => String(d).slice(0, 7);
  const ym = (date) => date.getFullYear() + '-' + pad2(date.getMonth() + 1);
  const mParts = (m) => [+m.slice(0, 4), +m.slice(5, 7)];
  function addMonths(m, n) { const [y, mo] = mParts(m); const t = y * 12 + (mo - 1) + n; return Math.floor(t / 12) + '-' + pad2((t % 12) + 1); }
  const daysIn = (m) => { const [y, mo] = mParts(m); return new Date(y, mo, 0).getDate(); };
  const dayStr = (m, d) => m + '-' + pad2(d);
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = (m) => MONTHS_LONG[mParts(m)[1] - 1];
  const monthLabel = (m) => monthName(m) + ' ' + mParts(m)[0];
  const toMin = (hhmm) => { const x = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return x ? +x[1] * 60 + +x[2] : null; };
  const fromMin = (n) => pad2(Math.floor(n / 60) % 24) + ':' + pad2(n % 60);
  // "2 h 15 m", "45 m", "3 h"
  function fmtDur(mins) {
    mins = Math.max(0, Math.round(mins || 0));
    const hh = Math.floor(mins / 60), mm = mins % 60;
    if (!hh) return mm + ' m';
    return mm ? hh + ' h ' + mm + ' m' : hh + ' h';
  }
  // "9:30", "12:00" (the hour without AM/PM, like a watch)
  function fmtClock(hhmm) { const n = toMin(hhmm); if (n == null) return ''; const hh = Math.floor(n / 60) % 12 || 12; return hh + ':' + pad2(n % 60); }

  // ---------- profiles ----------
  const KIND = { pioneer: 'Regular pioneer', caux: 'Continuous auxiliary', publisher: 'Publisher', other: 'Other goal' };
  function defaultSvc() { return { setup: false, since: null, profiles: [], aux: {}, pattern: {}, overrides: {}, cleared: {}, seenMonth: null }; }
  const svcOf = (settings) => Object.assign(defaultSvc(), (settings && settings.service) || {});
  // The profile for a month: the newest one set on or before it; auxiliary months sit on top of a Publisher base.
  function profileFor(svc, m) {
    const list = (svc.profiles || []).slice().sort((a, b) => (a.from < b.from ? -1 : 1));
    let p = list[0] || null; // the first profile chosen also covers the months before it (they had none)
    for (const x of list) if (x.from <= m) p = x;
    p = Object.assign({ kind: 'publisher', track: false }, p || {});
    const aux = svc.aux && svc.aux[m];
    if (aux && p.kind === 'publisher') return { kind: 'aux', goal: +aux, track: true, base: p };
    return p;
  }
  const goalOf = (p) => (p.kind === 'pioneer' ? 50 : p.kind === 'caux' ? 30 : p.kind === 'aux' ? p.goal : p.kind === 'other' ? (+p.goal || null) : null);
  const tracks = (p) => p.kind !== 'publisher' || !!p.track;
  const hoursReported = (p) => p.kind !== 'publisher'; // publishers report only that they shared, and studies
  function badge(p, m) {
    if (p.kind === 'aux') return 'Auxiliary · ' + monthName(m).slice(0, 3);
    if (p.kind === 'other') return 'Other goal' + (goalOf(p) ? ' · ' + goalOf(p) + ' h' : '');
    return KIND[p.kind] || 'Publisher';
  }

  // ---------- sessions ----------
  const sessionMins = (s) => (s.mode === 'range' ? Math.max(0, (toMin(s.end) || 0) - (toMin(s.start) || 0) - (+s.brk || 0)) : Math.max(0, +s.mins || 0));
  // A day's totals. Range sessions that overlap count the shared minutes once; the earlier session (first in the
  // list) keeps them, so ministry and credit never both claim the same minutes. A day is capped at 24 hours.
  function dayTotals(sessions) {
    const covered = []; // [start, end] minutes already counted
    let ministry = 0, credit = 0, overlap = 0;
    const per = [];
    (sessions || []).forEach((s) => {
      let n = 0, ov = 0, ovFrom = null, ovTo = null;
      if (s.mode === 'range') {
        const a = toMin(s.start), b = toMin(s.end);
        if (a != null && b != null && b > a) {
          for (const [c, d] of covered) {
            const lo = Math.max(a, c), hi = Math.min(b, d);
            if (hi > lo) { ov += hi - lo; ovFrom = ovFrom == null ? lo : Math.min(ovFrom, lo); ovTo = ovTo == null ? hi : Math.max(ovTo, hi); }
          }
          n = Math.max(0, b - a - ov - (+s.brk || 0));
          covered.push([a, b]);
        }
      } else n = sessionMins(s);
      overlap += ov;
      if (s.credit) credit += n; else ministry += n;
      per.push({ mins: n, overlap: ov, overlapFrom: ovFrom == null ? null : fromMin(ovFrom), overlapTo: ovTo == null ? null : fromMin(ovTo) });
    });
    const cap = 24 * 60;
    if (ministry + credit > cap) { const over = ministry + credit - cap; const cut = Math.min(credit, over); credit -= cut; ministry -= over - cut; }
    return { ministry, credit, total: ministry + credit, overlap, per, tooLong: per.reduce((t, x) => t + x.mins, 0) > cap };
  }
  // The later session moved to start where the overlapping earlier one ends.
  function fixOverlap(sessions, i) {
    const s = sessions[i];
    if (!s || s.mode !== 'range') return null;
    let a = toMin(s.start); const b = toMin(s.end);
    for (let j = 0; j < i; j++) {
      const o = sessions[j];
      if (o.mode !== 'range') continue;
      const c = toMin(o.start), d = toMin(o.end);
      if (a < d && b > c) a = Math.max(a, d);
    }
    return a < b ? Object.assign({}, s, { start: fromMin(a) }) : null;
  }

  // ---------- the data bundle ----------
  // D = { settings, times: [time items], months: [svmonth items], entries, rvs }
  function dayMap(times) {
    const m = new Map();
    (times || []).filter((t) => !t.deletedAt).sort((a, b) => (a.seq || 0) - (b.seq || 0) || ((a.updatedAt || '') < (b.updatedAt || '') ? -1 : 1))
      .forEach((t) => { if (!m.has(t.date)) m.set(t.date, []); m.get(t.date).push(t); });
    return m;
  }
  const monthRec = (D, m) => (D.months || []).find((x) => x.month === m && !x.deletedAt) || null;
  const isStudy = (e) => e.type === 'visit' && (e.study === true || !!e.progress || !!e.nextStart);
  const localDay = (iso) => U.toDateStr(new Date(iso));

  // Recorded minutes in one month (ministry and credit), before carry; month adjustments included.
  function monthRaw(D, m, days) {
    days = days || dayMap(D.times);
    let svc = 0, cr = 0;
    for (const [d, list] of days) if (monthOf(d) === m) { const t = dayTotals(list); svc += t.ministry; cr += t.credit; }
    const r = monthRec(D, m);
    if (r) { svc += (+r.adjMins || 0); cr += (+r.adjCredit || 0); }
    return { svc: Math.max(0, svc), cr: Math.max(0, cr) };
  }
  function firstMonth(D, days) {
    let f = null;
    for (const d of days.keys()) { const m = monthOf(d); if (!f || m < f) f = m; }
    (D.months || []).forEach((r) => { if (!r.deletedAt && ((+r.adjMins || 0) || (+r.adjCredit || 0)) && (!f || r.month < f)) f = r.month; });
    return f;
  }
  // Month totals with carry: the report rounds down to the whole hour and the leftover minutes carry into the next
  // month. Service and credit carry separately. Worked out from the records each time, so a late entry fixes both.
  function monthStats(D, m) {
    const days = dayMap(D.times);
    const f = firstMonth(D, days);
    let cS = 0, cC = 0;
    if (f && f < m) {
      for (let x = f; x < m; x = addMonths(x, 1)) {
        const raw = monthRaw(D, x, days);
        cS = (raw.svc + cS) % 60; cC = (raw.cr + cC) % 60;
      }
    }
    const raw = monthRaw(D, m, days);
    const totS = raw.svc + cS, totC = raw.cr + cC;
    return { svcMins: raw.svc, crMins: raw.cr, carryS: cS, carryC: cC, totS, totC, shown: totS + totC,
      hours: Math.floor(totS / 60), credit: Math.floor(totC / 60), outS: totS % 60, outC: totC % 60 };
  }

  // ---------- the plan (My schedule) ----------
  function weekStart(d) { return U.addDays(d, -d.getDay()); }
  function patternMatches(s, date) {
    const r = s.repeat || 'every';
    if (r === 'other') {
      const a = U.parseDateStr(s.anchor || '') || date;
      return Math.abs(U.daysBetween(weekStart(date), weekStart(a)) / 7) % 2 === 0;
    }
    if (r === 'weeks') return (s.weeks || []).includes(Math.ceil(date.getDate() / 7));
    return true;
  }
  // The plan for a day: a day changed on the calendar keeps its own list; otherwise the weekly pattern.
  function plannedFor(svc, ds) {
    if (svc.overrides && Object.prototype.hasOwnProperty.call(svc.overrides, ds)) return (svc.overrides[ds] || []).slice();
    const d = U.parseDateStr(ds);
    return ((svc.pattern || {})[d.getDay()] || []).filter((s) => patternMatches(s, d));
  }
  const planMins = (svc, ds) => dayTotals(plannedFor(svc, ds)).total;
  // Pace: recorded so far plus what's planned for the rest of the month (today counts the larger of the two).
  function pace(D, m, now) {
    const svc = svcOf(D.settings), st = monthStats(D, m), today = U.toDateStr(now), cur = ym(now);
    if (m < cur) return st.shown;
    const days = dayMap(D.times);
    let p = m === cur ? st.shown : st.carryS + st.carryC;
    for (let d = 1; d <= daysIn(m); d++) {
      const ds = dayStr(m, d);
      if (ds < today) continue;
      const pl = planMins(svc, ds);
      if (ds === today) { const rec = dayTotals(days.get(ds) || []).total; p += Math.max(0, pl - rec); } else p += pl;
    }
    return p;
  }
  // A month a person hasn't reached yet, or the rest of this one: the plan alone.
  function plannedMonth(svc, m, fromDay) {
    let p = 0;
    for (let d = 1; d <= daysIn(m); d++) { const ds = dayStr(m, d); if (!fromDay || ds >= fromDay) p += planMins(svc, ds); }
    return p;
  }

  // ---------- activity (the safety net) ----------
  // What was recorded on each day: visits, Not Homes and new contacts. o.live: only what was recorded in Groundwork
  // (no imports or handoffs). Each item: { at, kind: 'visit'|'study'|'nh'|'new', rvId, name, text }.
  function activity(D, o) {
    o = o || {};
    const byDay = new Map();
    const names = new Map((D.rvs || []).map((r) => [r.id, r]));
    const add = (ds, it) => { if (!byDay.has(ds)) byDay.set(ds, []); byDay.get(ds).push(it); };
    const firstOf = new Map();
    (D.entries || []).forEach((e) => {
      if (e.deletedAt || (e.type !== 'visit' && e.type !== 'nh')) return;
      if (o.live && e.imported) return;
      const r = names.get(e.rvId);
      if (!r || r.deletedAt) return;
      const it = { at: e.at, kind: e.type === 'nh' ? 'nh' : isStudy(e) ? 'study' : 'visit', rvId: e.rvId, name: r.name || 'Someone', text: e.text || '', entryId: e.id };
      add(localDay(e.at), it);
      if (!firstOf.has(e.rvId) || e.at < firstOf.get(e.rvId).at) firstOf.set(e.rvId, it);
    });
    (D.rvs || []).forEach((r) => {
      if (r.deletedAt || r.imported || !r.createdAt) return;
      const f = firstOf.get(r.id);
      // a new contact's first conversation was recorded with it: one line, "New contact"
      if (f && Math.abs(new Date(f.at) - new Date(r.createdAt)) < 3 * 60000) { f.kind = 'new'; return; }
      add(localDay(r.createdAt), { at: r.createdAt, kind: 'new', rvId: r.id, name: r.name || 'Someone', text: '' });
    });
    for (const list of byDay.values()) list.sort((a, b) => (a.at < b.at ? -1 : 1));
    return byDay;
  }
  // Days with live activity and no time, not cleared, from the day tracking began: the current month, and the
  // previous one until its report is ticked Sent. Only in months the profile keeps time.
  function ringDays(D, m, now, live, days) {
    const svc = svcOf(D.settings), today = U.toDateStr(now), cur = ym(now);
    if (!tracks(profileFor(svc, m))) return [];
    if (m > cur) return [];
    if (m < cur) { if (m !== addMonths(cur, -1)) return []; const r = monthRec(D, m); if (r && r.sent) return []; }
    live = live || activity(D, { live: true });
    days = days || dayMap(D.times);
    const since = svc.since ? localDay(svc.since) : null;
    const out = [];
    for (let d = 1; d <= daysIn(m); d++) {
      const ds = dayStr(m, d);
      if (ds > today || (since && ds < since)) continue;
      if (live.has(ds) && !(days.get(ds) || []).length && !(svc.cleared || {})[ds]) out.push(ds);
    }
    return out;
  }
  // The dates for the morning reminder: the day after a day with live activity and no time (yesterday or today).
  function remindDates(D, now) {
    const today = U.toDateStr(now);
    const live = activity(D, { live: true }), days = dayMap(D.times), out = [];
    for (const back of [1, 0]) {
      const d = U.addDays(U.startOfDay(now), -back), ds = U.toDateStr(d);
      const rings = ringDays(D, monthOf(ds), now, live, days);
      if (rings.includes(ds)) { const nx = U.toDateStr(U.addDays(d, 1)); if (nx >= today) out.push(nx); }
    }
    return out;
  }

  // ---------- Bible studies ----------
  // Everyone with a study session that month; anyone with fewer than three study sessions in all (up to the end of
  // the month) shows which study it was. Imported study sessions count here (the report is about what happened).
  function studies(D, m) {
    const end = addMonths(m, 1);
    const byRv = new Map();
    (D.entries || []).forEach((e) => {
      if (e.deletedAt || !isStudy(e)) return;
      const ds = localDay(e.at), em = monthOf(ds);
      if (em >= end) return;
      if (!byRv.has(e.rvId)) byRv.set(e.rvId, { all: 0, month: 0 });
      const x = byRv.get(e.rvId); x.all++; if (em === m) x.month++;
    });
    const rvs = new Map((D.rvs || []).map((r) => [r.id, r]));
    const people = [];
    for (const [id, x] of byRv) {
      const r = rvs.get(id);
      if (!x.month || !r || r.deletedAt) continue;
      people.push({ rvId: id, name: r.name || 'Someone', month: x.month, all: x.all, nth: x.all < 3 ? x.all : null });
    }
    people.sort((a, b) => U.cmp(a.name, b.name));
    const rec = monthRec(D, m), adj = rec ? (+rec.adjStudies || 0) : 0;
    return { people, adj, count: Math.max(0, people.length + adj) };
  }
  const ordinal = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

  // ---------- the report ----------
  function shared(D, m) {
    const live = activity(D, {}), days = dayMap(D.times);
    for (const ds of live.keys()) if (monthOf(ds) === m) return true;
    for (const ds of days.keys()) if (monthOf(ds) === m) return true;
    const st = monthStats(D, m);
    return st.svcMins + st.crMins > 0;
  }
  function reportText(D, m) {
    const p = profileFor(svcOf(D.settings), m), st = monthStats(D, m), sd = studies(D, m), rec = monthRec(D, m);
    const lines = [monthLabel(m) + ' report'];
    if (hoursReported(p)) {
      lines.push('Hours: ' + st.hours);
      if (st.credit) lines.push('Credit: ' + st.credit);
    } else lines.push('Shared in the ministry: ' + (shared(D, m) ? 'Yes' : 'No'));
    lines.push('Bible studies: ' + sd.count);
    if (rec && rec.comments) lines.push('Comments: ' + rec.comments);
    return lines.join('\n');
  }

  // ---------- the service year (September to August) ----------
  function yearStart(m) { const [y, mo] = mParts(m); return (mo >= 9 ? y : y - 1) + '-09'; }
  function yearOf(D, m, now) {
    const svc = svcOf(D.settings), s0 = yearStart(m), cur = ym(now), today = U.toDateStr(now);
    const label = s0.slice(0, 4) + '–' + String(+s0.slice(0, 4) + 1).slice(2);
    let mins = 0, plan = 0, finished = 0, finishedMins = 0;
    for (let i = 0; i < 12; i++) {
      const x = addMonths(s0, i);
      if (x <= cur) { const r = monthRaw(D, x); mins += r.svc + r.cr; if (x < cur) { finished++; finishedMins += r.svc + r.cr; } }
      if (x === cur) plan += Math.max(0, pace(D, x, now) - monthStats(D, x).shown);
      if (x > cur) plan += plannedMonth(svc, x, today);
    }
    const p = profileFor(svc, cur);
    return { label, start: s0, mins, paceMins: mins + plan, avgMins: finished ? Math.round(finishedMins / finished) : null, goalH: p.kind === 'pioneer' ? 600 : null };
  }

  const pure = { pad2, monthOf, ym, addMonths, daysIn, dayStr, monthName, monthLabel, toMin, fromMin, fmtDur, fmtClock, KIND, defaultSvc, svcOf,
    profileFor, goalOf, tracks, hoursReported, badge, sessionMins, dayTotals, fixOverlap, dayMap, monthRec, isStudy, monthRaw, monthStats,
    plannedFor, planMins, pace, plannedMonth, activity, ringDays, remindDates, studies, ordinal, shared, reportText, yearStart, yearOf };

  // ---------- the store side (browser) ----------
  const ST = () => RV.store;
  const S = () => ST().S;
  function data() {
    const s = S();
    return { settings: s.settings, times: s.lib.filter((x) => x.kind === 'time' && !x.deletedAt), months: s.lib.filter((x) => x.kind === 'svmonth' && !x.deletedAt), entries: s.entries, rvs: s.rvs };
  }
  const svc = () => svcOf(S().settings);
  function saveSvc(fn) { ST().saveSettings((st) => { st.service = svcOf(st); fn(st.service); }); }
  // Set the profile from this month on (a later change replaces one set in the same month).
  function setProfile(p, now) {
    const m = ym(now || new Date());
    saveSvc((v) => {
      v.profiles = (v.profiles || []).filter((x) => x.from !== m).concat([Object.assign({ from: m }, p)]);
      v.setup = true;
      if (!v.since) v.since = U.nowISO();
    });
  }
  function setAux(months, goal) {
    saveSvc((v) => {
      const keep = {};
      Object.keys(v.aux || {}).forEach((k) => { if (k < ym(new Date())) keep[k] = v.aux[k]; }); // past months keep what they had
      months.forEach((k) => { keep[k] = goal; });
      v.aux = keep;
      v.setup = true; if (!v.since) v.since = U.nowISO();
    });
  }
  function times(date) { return (dayMap(data().times).get(date) || []); }
  // Save a day's sessions as a whole: changed ones updated, new ones added, removed ones deleted.
  function saveDay(date, sessions) {
    const old = times(date), keep = new Set();
    let seq = Date.now();
    sessions.forEach((s) => {
      const f = { date, mode: s.mode, mins: s.mode === 'total' ? (+s.mins || 0) : 0, start: s.mode === 'range' ? s.start : '', end: s.mode === 'range' ? s.end : '', brk: s.mode === 'range' ? (+s.brk || 0) : 0, credit: !!s.credit };
      if (s.id && old.some((o) => o.id === s.id)) { keep.add(s.id); ST().updateLib(s.id, f); } else ST().addLib('time', Object.assign({ title: '', seq: seq++ }, f));
    });
    old.forEach((o) => { if (!keep.has(o.id)) ST().deleteLib(o.id); });
    if (sessions.length) saveSvc((v) => { if (v.cleared && v.cleared[date]) delete v.cleared[date]; });
  }
  function clearDay(date, on) { saveSvc((v) => { v.cleared = Object.assign({}, v.cleared); if (on) v.cleared[date] = true; else delete v.cleared[date]; }); }
  function patchMonth(m, patch) {
    const id = 'svm-' + m, cur = S().lib.find((x) => x.id === id);
    if (cur) return ST().updateLib(id, Object.assign({ deletedAt: null }, patch));
    return ST().addLib('svmonth', Object.assign({ id, month: m, title: '', adjMins: 0, adjCredit: 0, adjStudies: 0, sent: false, sentAt: null, comments: '', history: [] }, patch));
  }
  function addHistory(m, text) {
    const r = monthRec(data(), m);
    patchMonth(m, { history: ((r && r.history) || []).concat([{ at: U.nowISO(), text }]) });
  }
  function summaryLine(m) { const D = data(), p = profileFor(svcOf(D.settings), m), st = monthStats(D, m), sd = studies(D, m);
    return (hoursReported(p) ? st.hours + ' h' + (st.credit ? ', ' + st.credit + ' h credit' : '') + ', ' : '') + sd.count + ' ' + (sd.count === 1 ? 'study' : 'studies'); }
  function setSent(m, on) {
    patchMonth(m, { sent: !!on, sentAt: on ? U.nowISO() : null });
    addHistory(m, (on ? 'Report marked sent · ' : 'Sent unticked · ') + summaryLine(m));
  }
  function setPattern(day, list) { saveSvc((v) => { v.pattern = Object.assign({}, v.pattern); v.pattern[day] = list; }); }
  function setOverride(date, list) { saveSvc((v) => { v.overrides = Object.assign({}, v.overrides); if (list == null) delete v.overrides[date]; else v.overrides[date] = list; }); }

  RV.service = Object.assign({}, pure, { data, svc, saveSvc, setProfile, setAux, times, saveDay, clearDay, patchMonth, addHistory, summaryLine, setSent, setPattern, setOverride });
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.service;
})(typeof window !== 'undefined' ? window : globalThis);
