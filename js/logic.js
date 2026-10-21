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

  // ---------- best days: a set of weekdays (rv.bestDays). Older records used dayPrimary/daySecondary with a part of day. ----------
  const PARTS = ['morning', 'afternoon', 'evening', 'night'];
  const validTag = (g) => !!g && Number.isInteger(g.day) && g.day >= 0 && g.day <= 6 && (!g.part || PARTS.includes(g.part));
  const validDay = (d) => Number.isInteger(d) && d >= 0 && d <= 6;
  // weekdays, in week order; reads the old primary/secondary tags when a record has no bestDays yet
  const bestDaysOf = (rv) => {
    const src = Array.isArray(rv.bestDays) ? rv.bestDays : [rv.dayPrimary, rv.daySecondary].filter(validTag).map((g) => g.day);
    return U.uniq(src.filter(validDay)).sort((a, b) => a - b);
  };
  const dayTagsOf = (rv) => bestDaysOf(rv).map((day) => ({ day, part: '' }));
  const partRank = (p) => { const i = PARTS.indexOf(p); return i < 0 ? PARTS.length : i; };
  const tagLabel = (g) => (validTag(g) ? U.DAYS[g.day] : '');
  const tagShort = (g) => (validTag(g) ? U.DAYS3[g.day] : '');
  const tagsShort = (rv) => dayTagsOf(rv).map(tagShort).join(' · ');
  const tagsLabel = (rv) => dayTagsOf(rv).map(tagLabel).join(', ');
  // the tag that matches this weekday (primary first), or null
  const tagForDay = (rv, dow) => dayTagsOf(rv).find((g) => g.day === dow) || null;

  function attention(rv, last, settings, now) {
    now = now || new Date();
    if (isClosed(settings, rv)) return { state: 'closed' };
    const today = U.startOfDay(now);
    const daysSince = U.daysBetween(today, last);
    const sn = rv.snoozedUntil ? U.parseDateStr(rv.snoozedUntil) : null;
    if (sn && sn >= today) return { state: 'snoozed', until: rv.snoozedUntil, daysSince };
    if (settings.useNextVisit && rv.nextVisit) {
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
    if (daysSince >= t) {
      // A day-tagged RV waits for its day, but never forever: past the force factor it is overdue on any day.
      const factor = settings.dayTagForceFactor || 2;
      if (dayTagsOf(rv).length && daysSince < t * factor && !tagForDay(rv, now.getDay())) {
        return { state: 'ok', reason: 'daytag', waiting: true, threshold: t, daysSince };
      }
      return { state: 'overdue', reason: 'stale', overdueBy: daysSince - t, threshold: t, daysSince };
    }
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
    oldest: 'Longest since visit',
    neighborhood: 'Area',
    name: 'Name',
    newest: 'Newest first',
  };

  function haystack(item) {
    if (item._hay) return item._hay;
    const r = item.rv;
    const parts = [r.name, r.address, r.neighborhood, r.phone, r.howMet, r.notes, r.whatsNext, r.interests, r.bestNote, r.publication, r.progress, r.nextStart, (r.tags || []).join(' '), (r.scriptures || []).join(' ')];
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
      if (f.bestDay != null && f.bestDay !== '') {
        const tags = dayTagsOf(it.rv);
        if (f.bestDay === 'none') { if (tags.length) return false; }
        else {
          const dow = f.bestDay === 'today' ? (f.now || new Date()).getDay() : Number(f.bestDay);
          if (!tags.some((g) => g.day === dow)) return false;
        }
      }
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
    const dow = now.getDay();
    const min = Math.max(1, cfg.minAttempts || 2);
    const day = tally(item.entries, (d) => d.getDay() === dow);
    if (day.home === 0 && day.nh >= min) {
      return { scope: 'day', nh: day.nh, home: day.home, label: U.DAYS[dow] + 's' };
    }
    return null;
  }

  function likelyHomeNow(items, now) {
    now = now || new Date();
    const dow = now.getDay();
    const out = [];
    for (const it of items) {
      if (it.att.state === 'closed') continue;
      const t = tally(it.entries, (d) => d.getDay() === dow);
      const n = t.nh + t.home;
      if (t.home >= 1 && t.home / n >= 0.5) {
        out.push({ item: it, score: 1 + t.home / n, why: 'Home ' + t.home + ' of ' + n + ' ' + U.DAYS[dow] + (n === 1 ? '' : 's') });
      }
    }
    return out.sort((a, b) => b.score - a.score || byName(a.item, b.item));
  }

  // "Lesson 3" -> "Lesson 4", "Ch. 5 ¶12" -> "Ch. 5 ¶13"; text without a trailing number gives ''
  function suggestNext(text) {
    const m = /^(.*?)(\d+)(\D{0,3})$/.exec(String(text || '').trim());
    if (!m) return '';
    return m[1] + (parseInt(m[2], 10) + 1) + m[3];
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

  // ---------- the Today plan and the week forecast ----------
  const sameDay = (iso, now) => daysBetweenSafe(now, new Date(iso)) === 0;
  function daysBetweenSafe(a, b) { return isNaN(b) ? NaN : U.daysBetween(a, b); }
  const hasFutureVisit = (it) => it.att.reason === 'visit' && it.att.inDays > 0;

  // Today = missed (overdue) + scheduled for today + RVs tagged for today's weekday (by part of day).
  function todayPlan(items, now) {
    now = now || new Date();
    const overdue = items.filter((i) => i.att.state === 'overdue').sort(SORTS.attention);
    const scheduled = items.filter((i) => i.att.state === 'soon' && i.att.reason === 'visit' && i.att.inDays === 0).sort(byName);
    const used = new Set(overdue.concat(scheduled).map((i) => i.rv.id));
    const tagged = [];
    for (const it of items) {
      if (used.has(it.rv.id) || it.att.state === 'closed' || it.att.state === 'snoozed' || hasFutureVisit(it)) continue;
      const tag = tagForDay(it.rv, now.getDay());
      if (!tag) continue;
      if (it.entries.some((e) => e.type === 'visit' && sameDay(e.at, now))) continue; // already visited today
      tagged.push({ item: it, tag, nhToday: it.entries.some((e) => e.type === 'nh' && sameDay(e.at, now)) });
    }
    tagged.sort((a, b) => byName(a.item, b.item));
    // overdue people split by whether today is a good day to find them: their best day is today,
    // or they are usually home at this time (from visit history). Grouped by part of day.
    const nowPart = partOf(now), dow = now.getDay();
    const likely = new Map(likelyHomeNow(overdue, now).map((x) => [x.item.rv.id, x.why]));
    const goodToday = [], otherDays = [];
    for (const it of overdue) {
      const tag = tagForDay(it.rv, dow);
      if (tag) goodToday.push({ item: it, part: '', why: 'Best: ' + tagsShort(it.rv) });
      else if (likely.has(it.rv.id)) goodToday.push({ item: it, part: '', why: likely.get(it.rv.id) });
      else otherDays.push(it);
    }
    goodToday.sort((a, b) => SORTS.attention(a.item, b.item));
    return { overdue, scheduled, tagged, goodToday, otherDays, nowPart };
  }

  // Everyone worth trying today (the Today dashboard): active, not snoozed, not visited today, and
  // either their best day is today, they are usually home on this weekday, or they have no best day set.
  function todaySet(items, now, opts) {
    now = now || new Date();
    const dow = now.getDay();
    const withNoBestDay = !(opts && opts.likelyOnly);
    const live = items.filter((i) => i.att.state !== 'closed' && i.att.state !== 'snoozed');
    const likely = new Set(likelyHomeNow(live, now).map((x) => x.item.rv.id));
    return live.filter((it) => {
      if (it.entries.some((e) => e.type === 'visit' && sameDay(e.at, now))) return false;
      return (withNoBestDay && !dayTagsOf(it.rv).length) || !!tagForDay(it.rv, dow) || likely.has(it.rv.id);
    });
  }
  // Likely home today: best day is today or usually home on this weekday (no guessing for people with no best day).
  const likelyHomeToday = (items, now) => todaySet(items, now, { likelyOnly: true });

  // The next `days` days (starting tomorrow): planned visit dates, plus RVs tagged for that weekday.
  function forecast(items, now, days) {
    now = now || new Date();
    const out = [];
    for (let k = 1; k <= (days || 7); k++) {
      const d = U.addDays(U.startOfDay(now), k);
      const ds = U.toDateStr(d);
      const scheduled = items.filter((i) => i.att.state !== 'closed' && i.rv.nextVisit === ds).sort(byName);
      const ids = new Set(scheduled.map((i) => i.rv.id));
      const tagged = [];
      for (const it of items) {
        if (ids.has(it.rv.id) || it.att.state === 'closed') continue;
        if (it.rv.nextVisit && it.rv.nextVisit !== ds) continue; // has its own date elsewhere
        if (it.rv.snoozedUntil && it.rv.snoozedUntil >= ds) continue;
        const tag = tagForDay(it.rv, d.getDay());
        if (tag) tagged.push({ item: it, tag });
      }
      tagged.sort((a, b) => partRank(a.tag.part) - partRank(b.tag.part) || byName(a.item, b.item));
      if (scheduled.length || tagged.length) out.push({ date: d, dateStr: ds, scheduled, tagged });
    }
    return out;
  }

  // ---------- campaigns (lib items of kind 'campaign': title, topic, text, publications, start, end) ----------
  function campaignStatus(c, now) {
    now = now || new Date();
    const s = U.parseDateStr(c.start), e = U.parseDateStr(c.end);
    if (!s || !e) return 'undated';
    const today = U.startOfDay(now);
    if (today < s) return 'upcoming';
    if (today > e) return 'past';
    return 'active';
  }
  const activeCampaign = (camps, now) => (camps || []).find((c) => !c.deletedAt && campaignStatus(c, now) === 'active') || null;
  // Returns the campaign that overlaps cand ({start,end}) or null. Only one campaign may be active at a time.
  function campaignOverlap(camps, cand, selfId) {
    const s = U.parseDateStr(cand.start), e = U.parseDateStr(cand.end);
    if (!s || !e) return null;
    return (camps || []).find((c) => {
      if (c.deletedAt || c.id === selfId) return false;
      const cs = U.parseDateStr(c.start), ce = U.parseDateStr(c.end);
      return cs && ce && s <= ce && cs <= e;
    }) || null;
  }
  function nextCampaign(camps, now) {
    return (camps || []).filter((c) => !c.deletedAt && campaignStatus(c, now) === 'upcoming')
      .sort((a, b) => (a.start < b.start ? -1 : 1))[0] || null;
  }
  // Quick add with an empty note: record which campaign and topics were live at that moment.
  function quickAddFallback(campaign, topics) {
    const parts = [];
    if (campaign) parts.push('Campaign: ' + campaign.title);
    if (topics && topics.length) parts.push('Topic: ' + topics.map((t) => t.title).join(', '));
    return parts.join('. ');
  }

  // ---------- Insights ----------
  function funnel(items, settings) {
    const rows = settings.stages.filter((s) => !s.closed).map((s) => ({ stage: s, count: items.filter((i) => i.rv.stage === s.id).length }));
    const archived = items.filter((i) => i.att.state === 'closed').length;
    return { rows, archived, total: rows.reduce((n, r) => n + r.count, 0) };
  }

  // Effort points. Derived from the log each time, so editing or deleting an entry updates them.
  function effortEvents(items, settings) {
    const pts = settings.points || {};
    const order = settings.stages.filter((s) => !s.closed).map((s) => s.id);
    const ev = [];
    for (const it of items) {
      if (!it.rv.imported) ev.push({ at: new Date(it.rv.createdAt), kind: 'newRv', pts: pts.newRv || 0 });
      for (const e of it.entries) {
        const at = new Date(e.at);
        if (isNaN(at)) continue;
        if (e.type === 'nh') ev.push({ at, kind: 'nh', pts: pts.nh || 0 });
        else if (e.type === 'visit') ev.push({ at, kind: 'visit', pts: pts.visit || 0 });
        else if (e.type === 'stage') {
          const a = order.indexOf(e.from), b = order.indexOf(e.to);
          if (a >= 0 && b > a) {
            ev.push({ at, kind: 'advance', pts: pts.advance || 0 });
            if (e.to === 'study') ev.push({ at, kind: 'study', pts: 0 });
          }
        }
      }
    }
    return ev;
  }
  function effortSummary(items, settings, now) {
    now = now || new Date();
    const ev = effortEvents(items, settings);
    const age = (e) => U.daysBetween(now, e.at);
    const sum = (f) => ev.filter(f).reduce((n, e) => n + e.pts, 0);
    const lifetime = sum(() => true);
    const level = 1 + Math.floor(Math.sqrt(lifetime / 20));
    const floor = 20 * (level - 1) * (level - 1), next = 20 * level * level;
    const count = (kind) => ev.filter((e) => e.kind === kind && age(e) >= 0 && age(e) < 60).length;
    return {
      lifetime, level, levelFloor: floor, levelNext: next, levelPct: Math.min(100, Math.round(((lifetime - floor) / (next - floor)) * 100)),
      last7: sum((e) => age(e) >= 0 && age(e) < 7), prev7: sum((e) => age(e) >= 7 && age(e) < 14), last60: sum((e) => age(e) >= 0 && age(e) < 60),
      counts60: { newRvs: count('newRv'), visits: count('visit'), nh: count('nh'), advances: count('advance'), studies: count('study') },
    };
  }

  // Candidate slots to suggest when someone is never home at the usual time.
  const SLOT_ORDER = [['weekday', 'evening'], ['weekend', 'morning'], ['weekend', 'afternoon'], ['weekday', 'morning'], ['weekday', 'afternoon'], ['weekend', 'evening']];
  // RVs with repeated not-homes in the same weekday+part with no visit there. `exclude` = ids already shown elsewhere.
  function reconsider(items, settings, now, exclude, minTries) {
    now = now || new Date();
    const min = minTries || 3;
    const out = [];
    for (const it of items) {
      if (it.att.state === 'closed' || (exclude && exclude.has(it.rv.id))) continue;
      const slots = new Map(), days = new Map(), tried = new Set(), homeSlots = new Map();
      for (const e of it.entries) {
        if (e.type !== 'nh' && e.type !== 'visit') continue;
        const d = new Date(e.at);
        if (isNaN(d)) continue;
        const key = d.getDay() + '|' + partOf(d);
        tried.add(dayType(d.getDay()) + '|' + partOf(d));
        const tally = (m, k) => { const v = m.get(k) || { nh: 0, home: 0 }; v[e.type === 'nh' ? 'nh' : 'home']++; m.set(k, v); };
        tally(slots, key); tally(days, String(d.getDay()));
        if (e.type === 'visit') homeSlots.set(key, (homeSlots.get(key) || 0) + 1);
      }
      let best = null;
      for (const [k, v] of slots) if (v.home === 0 && v.nh >= min && (!best || v.nh > best.nh)) { const [dow, part] = k.split('|'); best = { nh: v.nh, dow: +dow, part, label: U.DAYS[+dow] + ' ' + part + 's' }; }
      if (!best) for (const [k, v] of days) if (v.home === 0 && v.nh >= min && (!best || v.nh > best.nh)) best = { nh: v.nh, dow: +k, part: '', label: U.DAYS[+k] + 's' };
      if (!best) continue;
      // suggestion: where they were found home, else their other tagged day, else a slot never tried
      let suggest = '';
      const home = Array.from(homeSlots.entries()).sort((a, b) => b[1] - a[1])[0];
      const other = dayTagsOf(it.rv).find((g) => g.day !== best.dow);
      if (home) { const [dow, part] = home[0].split('|'); suggest = 'You found them home on ' + U.DAYS[+dow] + ' ' + part + 's.'; }
      else if (other) suggest = 'Try ' + tagLabel(other) + 's.';
      else {
        const slot = SLOT_ORDER.find(([t, p]) => !tried.has(t + '|' + p) && !(t === dayType(best.dow) && p === best.part));
        if (slot) suggest = 'Try a ' + slot[0] + ' ' + slot[1] + ', which you have not tried yet.';
      }
      out.push({ item: it, nh: best.nh, label: best.label, suggest });
    }
    return out.sort((a, b) => b.nh - a.nh || byName(a.item, b.item));
  }
  // RVs sitting in their stage far longer than the stage's usual timing.
  function stuckInStage(items, settings, now, exclude) {
    now = now || new Date();
    const factor = settings.stuckFactor || 3;
    const out = [];
    for (const it of items) {
      if (it.att.state === 'closed' || (exclude && exclude.has(it.rv.id))) continue;
      const t = thresholdFor(settings, it.rv);
      if (t == null) continue;
      const days = U.daysBetween(now, new Date(it.rv.stageChangedAt || it.rv.createdAt));
      if (days >= t * factor) out.push({ item: it, days, stage: stageOf(settings, it.rv.stage) });
    }
    return out.sort((a, b) => b.days - a.days || byName(a.item, b.item));
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
  const isStudyStage = (settings, stageId) => { const st = (settings.stages || []).find((s) => s.id === stageId); return !!(st && !st.closed && (st.study === true || st.id === 'study')); };
  function rvsToCsv(items, settings) {
    const custom = settings.customFields || [];
    const head = ['Name', 'Address', 'Neighborhood', 'Phone', 'How met', 'Stage', 'Archive reason', 'Next visit', 'Last touched', 'Best times', 'Best times note', 'Best days', 'Household notes', 'Discuss next time', 'Interests', 'Scriptures', 'Tags', 'Publication', 'Where we are', 'Created']
      .concat(custom.map((c) => c.name));
    const rows = [head];
    for (const it of items) {
      const r = it.rv;
      rows.push([
        r.name, r.address, r.neighborhood, r.phone, r.howMet, stageOf(settings, r.stage).name,
        (reasonOf(settings, r.archiveReason) || {}).name || '', r.nextVisit || '', U.toDateStr(it.last),
        describeWindows(r.bestTimes), r.bestNote, tagsLabel(r), r.notes, r.whatsNext || '', r.interests, (r.scriptures || []).join('; '), (r.tags || []).join('; '), r.publication || '', r.progress || '',
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
        bestTimes: [], bestNote: '', dayPrimary: null, daySecondary: null, whatsNext: '', campaignId: null, imported: true,
        notes: get(row, 'notes'), interests: get(row, 'interests'),
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
        entries.push({ id: U.uuid(), rvId: rv.id, type: 'visit', at: last.toISOString(), text: 'Imported last visit date', scriptures: [], imported: true, updatedAt: nowIso, deletedAt: null });
      }
      rvs.push(rv);
    });
    return { rvs, entries, skipped };
  }

  RV.logic = {
    isStudyStage, stageOf, isClosed, reasonOf, isDNC, thresholdFor, lastTouched, attention, buildItems,
    SORTS, SORT_NAMES, filterItems, inBestWindow, partOf, dayType, notHomePattern, likelyHomeNow, describeWindows,
    duplicateMatches, attentionLists, recentlyAdded, attentionText, rvsToCsv, entriesToCsv,
    suggestNext,
    PARTS, validTag, dayTagsOf, bestDaysOf, partRank, tagLabel, tagsLabel, tagShort, tagsShort, tagForDay, todayPlan, todaySet, likelyHomeToday, forecast,
    campaignStatus, activeCampaign, campaignOverlap, nextCampaign, quickAddFallback,
    funnel, effortEvents, effortSummary, reconsider, stuckInStage,
    IMPORT_FIELDS, guessMapping, parseLooseDate, importRows,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.logic;
})(typeof window !== 'undefined' ? window : globalThis);
