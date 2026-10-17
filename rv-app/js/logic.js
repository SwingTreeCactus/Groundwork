/* RV app: pure business logic (attention, not-home pattern, search, duplicates, CSV import/export).
   No DOM and no storage in here, so it can be unit tested in Node. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const U = RV.util;

  // ---------- stages and reasons ----------
  const stageOf = (settings, id) => settings.stages.find((s) => s.id === id) || settings.stages[0];
  const isClosed = (settings, rv) => !!(settings.stages.find((s) => s.id === rv.stage) || {}).closed;
  const reasonOf = (settings, id) => settings.archiveReasons.find((r) => r.id === id) || null;
  const isDNC = (settings, rv) => isClosed(settings, rv) && !!(reasonOf(settings, rv.archiveReason) || {}).dnc;

  // days before an RV in this stage is flagged; null = never
  function thresholdFor(settings, rv) {
    const st = settings.stages.find((s) => s.id === rv.stage);
    if (!st || st.closed) return null;
    if (st.days === 0) return null;
    if (st.days == null || st.days === '') return settings.defaultStaleDays;
    return st.days;
  }

  // ---------- activity and attention ----------
  function lastTouched(rv, entries) {
    let best = null;
    for (const e of entries) {
      if (e.deletedAt) continue;
      const d = new Date(e.at);
      if (!isNaN(d) && (!best || d > best)) best = d;
    }
    return best || new Date(rv.createdAt);
  }

  function attention(rv, last, settings, now) {
    now = now || new Date();
    if (isClosed(settings, rv)) return { state: 'closed' };
    const today = U.startOfDay(now);
    const daysSince = U.daysBetween(today, last);
    const sn = rv.snoozedUntil ? U.parseDateStr(rv.snoozedUntil) : null;
    if (sn && sn >= today) return { state: 'snoozed', until: rv.snoozedUntil, daysSince };
    if (rv.nextVisit) {
      const due = U.parseDateStr(rv.nextVisit);
      if (due) {
        const d = U.daysBetween(due, today);
        if (d < 0) return { state: 'overdue', reason: 'visit', overdueBy: -d, dueDate: rv.nextVisit, daysSince };
        if (d <= settings.comingUpDays) return { state: 'soon', reason: 'visit', inDays: d, dueDate: rv.nextVisit, daysSince };
        return { state: 'ok', reason: 'visit', inDays: d, dueDate: rv.nextVisit, daysSince };
      }
    }
    const t = thresholdFor(settings, rv);
    if (t == null) return { state: 'ok', reason: 'none', daysSince };
    if (daysSince >= t) return { state: 'overdue', reason: 'stale', overdueBy: daysSince - t, threshold: t, daysSince };
    const left = t - daysSince;
    if (left <= settings.soonDays) return { state: 'soon', reason: 'stale', inDays: left, threshold: t, daysSince };
    return { state: 'ok', reason: 'stale', inDays: left, threshold: t, daysSince };
  }

  // One decorated item per live RV: {rv, entries (newest first), last, att, nh, visits}
  function buildItems(rvs, entries, settings, now) {
    const byRv = new Map();
    for (const e of entries) {
      if (e.deletedAt) continue;
      if (!byRv.has(e.rvId)) byRv.set(e.rvId, []);
      byRv.get(e.rvId).push(e);
    }
    const items = [];
    for (const rv of rvs) {
      if (rv.deletedAt) continue;
      const es = (byRv.get(rv.id) || []).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
      const last = lastTouched(rv, es);
      items.push({
        rv, entries: es, last,
        att: attention(rv, last, settings, now),
        nh: es.filter((e) => e.type === 'nh').length,
        visits: es.filter((e) => e.type === 'visit').length,
      });
    }
    return items;
  }

  // ---------- sorting and filtering ----------
  const RANK = { overdue: 0, soon: 1, ok: 2, snoozed: 3, closed: 4 };
  const byName = (a, b) => U.cmp(a.rv.name, b.rv.name);
  const SORTS = {
    attention(a, b) {
      const r = RANK[a.att.state] - RANK[b.att.state];
      if (r) return r;
      if (a.att.state === 'overdue') return b.att.overdueBy - a.att.overdueBy || byName(a, b);
      if (a.att.state === 'soon') return a.att.inDays - b.att.inDays || byName(a, b);
      return a.last - b.last || byName(a, b);
    },
    oldest: (a, b) => a.last - b.last || byName(a, b),
    neighborhood(a, b) {
      const na = a.rv.neighborhood || '', nb = b.rv.neighborhood || '';
      if (!na !== !nb) return na ? -1 : 1; // blanks last
      const c = U.cmp(na, nb);
      if (c) return c;
      const pa = U.parseAddress(a.rv.address), pb = U.parseAddress(b.rv.address);
      return U.cmp(pa.street, pb.street) || U.cmp(pa.num, pb.num) || byName(a, b);
    },
    name: byName,
    newest: (a, b) => (a.rv.createdAt < b.rv.createdAt ? 1 : a.rv.createdAt > b.rv.createdAt ? -1 : byName(a, b)),
  };
  const SORT_NAMES = {
    attention: 'Needs attention first',
    oldest: 'Longest since last visit',
    neighborhood: 'Neighborhood and street',
    name: 'Name',
    newest: 'Newest first',
  };

  function haystack(item) {
    if (item._hay) return item._hay;
    const r = item.rv;
    const parts = [r.name, r.address, r.neighborhood, r.phone, r.howMet, r.notes, r.interests, r.bestNote, (r.tags || []).join(' '), (r.scriptures || []).join(' ')];
    for (const f of Object.keys(r.custom || {})) parts.push(r.custom[f]);
    for (const e of item.entries) parts.push(e.text, (e.scriptures || []).join(' '));
    item._hay = parts.filter(Boolean).join(' ').toLowerCase() + ' ' + U.digits(r.phone);
    return item._hay;
  }

  // f: {stages: Set|null, neighborhood: '', q: ''}
  function filterItems(items, f, settings) {
    const tokens = String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((it) => {
      const closed = it.att.state === 'closed';
      if (f.stages && !f.stages.has(it.rv.stage)) {
        // closed records whose reason is not "hidden" still show up when searching
        const reason = reasonOf(settings, it.rv.archiveReason);
        if (!(closed && tokens.length && reason && !reason.hidden)) return false;
      }
      if (f.neighborhood && (it.rv.neighborhood || '') !== f.neighborhood) return false;
      if (tokens.length) {
        const h = haystack(it);
        for (const t of tokens) if (!h.includes(t)) return false;
      }
      return true;
    });
  }

  // ---------- best times and the not-home pattern ----------
  const toMin = (s) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
    return m ? +m[1] * 60 + +m[2] : null;
  };
  function inBestWindow(rv, now) {
    const wins = rv.bestTimes || [];
    const mins = now.getHours() * 60 + now.getMinutes();
    for (const w of wins) {
      if (w.days && w.days.length && !w.days.includes(now.getDay())) continue;
      const a = toMin(w.from), b = toMin(w.to);
      if (a == null || b == null) continue;
      if (a <= b ? mins >= a && mins <= b : mins >= a || mins <= b) return true;
    }
    return false;
  }
  function partOf(d) {
    const h = d.getHours();
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'evening';
    return 'night';
  }
  const dayType = (dow) => (dow === 0 || dow === 6 ? 'weekend' : 'weekday');

  function tally(entries, pred) {
    let nh = 0, home = 0;
    for (const e of entries) {
      if (e.type !== 'nh' && e.type !== 'visit') continue;
      const d = new Date(e.at);
      if (isNaN(d) || !pred(d)) continue;
      if (e.type === 'nh') nh++;
      else home++;
    }
    return { nh, home };
  }

  function notHomePattern(item, settings, now) {
    now = now || new Date();
    const cfg = settings.notHomeBanner;
    if (!cfg || !cfg.on) return null;
    const rv = item.rv;
    if (rv.nhBannerOff || item.att.state === 'closed') return null;
    if (inBestWindow(rv, now)) return null;
    const dow = now.getDay(), part = partOf(now);
    const min = Math.max(1, cfg.minAttempts || 2);
    const day = tally(item.entries, (d) => d.getDay() === dow && partOf(d) === part);
    if (day.home === 0 && day.nh >= min) {
      return { scope: 'day', nh: day.nh, home: day.home, label: U.DAYS[dow] + ' ' + part + 's' };
    }
    const dt = dayType(dow);
    const grp = tally(item.entries, (d) => dayType(d.getDay()) === dt && partOf(d) === part);
    if (grp.home === 0 && grp.nh >= min + 1) {
      return { scope: 'daytype', nh: grp.nh, home: grp.home, label: dt + ' ' + part + 's' };
    }
    return null;
  }

  function likelyHomeNow(items, now) {
    now = now || new Date();
    const dow = now.getDay(), part = partOf(now);
    const out = [];
    for (const it of items) {
      if (it.att.state === 'closed') continue;
      if (inBestWindow(it.rv, now)) {
        out.push({ item: it, score: 3, why: 'In their best time window' });
        continue;
      }
      const t = tally(it.entries, (d) => d.getDay() === dow && partOf(d) === part);
      const n = t.nh + t.home;
      if (t.home >= 1 && t.home / n >= 0.5) {
        out.push({ item: it, score: 1 + t.home / n, why: 'Home ' + t.home + ' of ' + n + ' tries at this time' });
      }
    }
    return out.sort((a, b) => b.score - a.score || byName(a.item, b.item));
  }

  function describeWindows(wins) {
    return (wins || [])
      .map((w) => {
        const d = w.days || [];
        let dl = 'Every day';
        if (d.length && d.length < 7) {
          const s = d.slice().sort();
          dl = s.join(',') === '1,2,3,4,5' ? 'Mon-Fri' : s.join(',') === '0,6' ? 'Sat-Sun' : s.map((x) => U.DAYS3[x]).join(', ');
        }
        return dl + ' ' + (w.from || '?') + '-' + (w.to || '?');
      })
      .join('; ');
  }

  // ---------- duplicates ----------
  function duplicateMatches(cand, rvs, selfId) {
    const addr = U.normAddress(cand.address);
    const ph = U.digits(cand.phone).slice(-10);
    return rvs.filter((r) => {
      if (r.deletedAt || r.id === selfId) return false;
      if (addr && U.normAddress(r.address) === addr) return true;
      if (ph.length >= 7 && U.digits(r.phone).slice(-10) === ph) return true;
      return false;
    });
  }

  // ---------- coming up / recent ----------
  function attentionLists(items) {
    const overdue = items.filter((i) => i.att.state === 'overdue').sort(SORTS.attention);
    const soon = items.filter((i) => i.att.state === 'soon').sort(SORTS.attention);
    return { overdue, soon };
  }
  function recentlyAdded(items, now, days) {
    now = now || new Date();
    return items
      .filter((i) => i.att.state !== 'closed' && U.daysBetween(now, new Date(i.rv.createdAt)) <= (days || 14))
      .sort(SORTS.newest);
  }

  function attentionText(att) {
    if (att.state === 'overdue') {
      return att.reason === 'visit'
        ? 'Visit was due ' + (att.overdueBy === 1 ? 'yesterday' : att.overdueBy + ' days ago')
        : att.overdueBy === 0 ? 'Due for a visit today' : 'Overdue by ' + att.overdueBy + (att.overdueBy === 1 ? ' day' : ' days');
    }
    if (att.state === 'soon') {
      return att.reason === 'visit' ? 'Visit planned ' + U.inDaysText(att.inDays) : 'Due ' + U.inDaysText(att.inDays);
    }
    if (att.state === 'snoozed') return 'Snoozed until ' + U.fmtDate(att.until);
    return '';
  }

  // ---------- CSV export ----------
  function rvsToCsv(items, settings) {
    const custom = settings.customFields || [];
    const head = ['Name', 'Address', 'Neighborhood', 'Phone', 'How met', 'Stage', 'Archive reason', 'Next visit', 'Last touched', 'Best times', 'Best times note', 'Household notes', 'Interests', 'Scriptures', 'Tags', 'Created']
      .concat(custom.map((c) => c.name));
    const rows = [head];
    for (const it of items) {
      const r = it.rv;
      rows.push([
        r.name, r.address, r.neighborhood, r.phone, r.howMet, stageOf(settings, r.stage).name,
        (reasonOf(settings, r.archiveReason) || {}).name || '', r.nextVisit || '', U.toDateStr(it.last),
        describeWindows(r.bestTimes), r.bestNote, r.notes, r.interests, (r.scriptures || []).join('; '), (r.tags || []).join('; '),
        U.toDateStr(new Date(r.createdAt)),
      ].concat(custom.map((c) => (r.custom || {})[c.id] || '')));
    }
    return U.stringifyCSV(rows);
  }
  function entriesToCsv(entries, rvs, settings) {
    const names = new Map(rvs.map((r) => [r.id, r.name]));
    const rows = [['Date', 'Time', 'RV', 'Type', 'Notes', 'Scriptures', 'From stage', 'To stage']];
    const sorted = entries.filter((e) => !e.deletedAt).sort((a, b) => (a.at < b.at ? 1 : -1));
    const typeName = { nh: 'Not home', visit: 'Visit', note: 'Note', stage: 'Stage change' };
    for (const e of sorted) {
      const d = new Date(e.at);
      rows.push([
        U.toDateStr(d), U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes()), names.get(e.rvId) || '', typeName[e.type] || e.type,
        e.text || '', (e.scriptures || []).join('; '),
        e.from ? stageOf(settings, e.from).name : '', e.to ? stageOf(settings, e.to).name : '',
      ]);
    }
    return U.stringifyCSV(rows);
  }

  // ---------- CSV import ----------
  const IMPORT_FIELDS = [
    { key: 'name', label: 'Name', aliases: ['name', 'full name', 'person', 'contact', 'householder', 'rv'], required: true },
    { key: 'address', label: 'Address', aliases: ['address', 'street address', 'street', 'addr'] },
    { key: 'neighborhood', label: 'Neighborhood', aliases: ['neighborhood', 'area', 'territory', 'route', 'city'] },
    { key: 'phone', label: 'Phone', aliases: ['phone', 'mobile', 'cell', 'telephone', 'phone number'] },
    { key: 'howMet', label: 'How met', aliases: ['how met', 'source', 'met'] },
    { key: 'stage', label: 'Stage', aliases: ['stage', 'status'] },
    { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'household notes', 'details', 'remarks'] },
    { key: 'interests', label: 'Interests', aliases: ['interests', 'interest', 'questions'] },
    { key: 'tags', label: 'Tags', aliases: ['tags', 'tag', 'labels'] },
    { key: 'nextVisit', label: 'Next visit date', aliases: ['next visit', 'next visit date', 'follow up', 'followup', 'due', 'due date'] },
    { key: 'lastVisit', label: 'Last visit date', aliases: ['last visit', 'last contact', 'last called', 'last call', 'last touched', 'last date'] },
    { key: 'created', label: 'Date first met', aliases: ['created', 'date added', 'date first met', 'first met', 'added'] },
  ];
  const normHead = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  function guessMapping(headers) {
    const map = {};
    const used = new Set();
    const heads = headers.map(normHead);
    for (const f of IMPORT_FIELDS) {
      let idx = heads.findIndex((h, i) => !used.has(i) && f.aliases.includes(h));
      if (idx < 0) idx = heads.findIndex((h, i) => !used.has(i) && h && f.aliases.some((a) => a.length > 3 && h.includes(a)));
      if (idx >= 0) { map[f.key] = idx; used.add(idx); }
    }
    return map;
  }

  function parseLooseDate(s) {
    s = String(s || '').trim();
    if (!s) return null;
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
    if (m) {
      let y = +m[3];
      if (y < 100) y += 2000;
      let mo = +m[1], d = +m[2];
      if (mo > 12 && d <= 12) { const t = mo; mo = d; d = t; } // day-first
      return new Date(y, mo - 1, d);
    }
    const d = new Date(s);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // rows: array of arrays without the header row. Returns {rvs, entries, skipped, warnings}
  function importRows(rows, mapping, settings, defaultStage) {
    const rvs = [], entries = [], skipped = [];
    const stageByName = new Map(settings.stages.map((s) => [s.name.toLowerCase(), s.id]));
    const get = (row, key) => (mapping[key] == null || mapping[key] < 0 ? '' : String(row[mapping[key]] == null ? '' : row[mapping[key]]).trim());
    const nowIso = new Date().toISOString();
    rows.forEach((row, i) => {
      const name = get(row, 'name');
      if (!name) { skipped.push({ line: i + 2, why: 'No name' }); return; }
      let stage = stageByName.get(get(row, 'stage').toLowerCase()) || defaultStage;
      const created = parseLooseDate(get(row, 'created'));
      const rv = {
        id: U.uuid(), name,
        address: get(row, 'address'), neighborhood: get(row, 'neighborhood'), phone: get(row, 'phone'), howMet: get(row, 'howMet'),
        bestTimes: [], bestNote: '', notes: get(row, 'notes'), interests: get(row, 'interests'),
        scriptures: [], tags: U.splitList(get(row, 'tags')), custom: {},
        stage, archiveReason: null, prevStage: null,
        nextVisit: (() => { const d = parseLooseDate(get(row, 'nextVisit')); return d ? U.toDateStr(d) : null; })(),
        snoozedUntil: null, nhBannerOff: false,
        createdAt: (created || new Date()).toISOString(), stageChangedAt: nowIso, updatedAt: nowIso, deletedAt: null,
      };
      if ((stageOf(settings, stage) || {}).closed) { rv.archiveReason = 'other'; }
      const last = parseLooseDate(get(row, 'lastVisit'));
      if (last) {
        last.setHours(12, 0, 0, 0);
        entries.push({ id: U.uuid(), rvId: rv.id, type: 'visit', at: last.toISOString(), text: 'Imported last visit date', scriptures: [], updatedAt: nowIso, deletedAt: null });
      }
      rvs.push(rv);
    });
    return { rvs, entries, skipped };
  }

  RV.logic = {
    stageOf, isClosed, reasonOf, isDNC, thresholdFor, lastTouched, attention, buildItems,
    SORTS, SORT_NAMES, filterItems, inBestWindow, partOf, dayType, notHomePattern, likelyHomeNow, describeWindows,
    duplicateMatches, attentionLists, recentlyAdded, attentionText, rvsToCsv, entriesToCsv,
    IMPORT_FIELDS, guessMapping, parseLooseDate, importRows,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.logic;
})(typeof window !== 'undefined' ? window : globalThis);
