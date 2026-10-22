/* RV app: the garden (v2.16). Pure functions: a record's plant form (stage), care level (health),
   conversation chain toward the next form, and the Follow up on hold. No DOM, no storage.
   Spec: claude/garden-plan.md. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const U = RV.util || (typeof require !== 'undefined' ? require('./util.js') : null);
  const L = RV.logic || (typeof require !== 'undefined' ? require('./logic.js') : null);

  // Care levels, wilted to lush. 0 = no plant (archived / Do not call). Four are shown (v2.19): Lush,
  // Healthy, Thirsty, Wilting; the old Steady folded into Healthy, so care() never returns 3.
  const CARE = { WILTED: 1, DRY: 2, STEADY: 3, HEALTHY: 4, LUSH: 5 };
  const CARE_NAMES = { 1: 'Wilting', 2: 'Thirsty', 3: 'Steady', 4: 'Healthy', 5: 'Lush' };
  const FORM_NAMES = { 1: 'seed', 2: 'sprout', 3: 'leafy plant', 4: 'flowering shrub', 5: 'fruit tree' };
  // How many qualifying steps each stage needs before the plant grows into the next form.
  const GROW_DEFAULTS = { yet: 1, initial: 2, cultivating: 3, return: 3 };
  const LUSH_RUN = 3;

  const activeStages = (settings) => settings.stages.filter((s) => !s.closed);
  const dayOf = (iso) => U.startOfDay(new Date(iso));
  const ms = (iso) => new Date(iso).getTime();

  // Plant form 1..5 from the stage's place among the active stages; 0 when closed.
  function formOf(settings, stageId) {
    const act = activeStages(settings);
    const i = act.findIndex((s) => s.id === stageId);
    if (i < 0) return 0;
    if (act[i].study || i === act.length - 1) return 5;
    return Math.min(i + 1, 4);
  }
  const nextStageOf = (settings, stageId) => {
    const act = activeStages(settings);
    const i = act.findIndex((s) => s.id === stageId);
    return i >= 0 && i < act.length - 1 ? act[i + 1] : null;
  };
  // Steps needed to leave a stage (editable as stage.grow in Settings > Stages). 0 = never grows from here.
  function needFor(settings, stageId) {
    const st = settings.stages.find((s) => s.id === stageId);
    if (!st || st.closed || !nextStageOf(settings, stageId)) return 0;
    if (Number.isInteger(st.grow) && st.grow > 0) return st.grow;
    if (GROW_DEFAULTS[st.id] != null) return GROW_DEFAULTS[st.id];
    return 3;
  }
  // The stage just before the study stage grows by study sessions; the first stage by one conversation; others by chains.
  function kindFor(settings, stageId) {
    const nx = nextStageOf(settings, stageId);
    if (!nx) return 'none';
    if (nx.study) return 'study';
    if (activeStages(settings)[0].id === stageId) return 'first';
    return 'chain';
  }

  const live = (entries) => (entries || []).filter((e) => !e.deletedAt);
  const isConversation = (e) => e.type === 'visit';
  const isStudySession = (e) => e.type === 'visit' && (e.study === true || !!(e.progress || e.nextStart));
  // Conversations oldest first, one per local day (the first of the day counts).
  function conversations(entries, opts) {
    const seen = new Set();
    return live(entries).filter(isConversation).filter((e) => !(opts && opts.liveOnly && e.imported))
      .sort((a, b) => ms(a.at) - ms(b.at))
      .filter((e) => { const k = U.toDateStr(new Date(e.at)); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  // When the plant reached its current stage: a stored garden mark, else the last stage change, else creation.
  const sinceOf = (rv) => (rv.garden && rv.garden.since) || rv.stageChangedAt || rv.createdAt;

  // Chain gap = the stage's own due window (default 30 days). null = no window (never breaks).
  const gapFor = (settings, rv) => L.thresholdFor(settings, rv);

  // Follow up on <date>: quiet until that date, hold the chain through the end of that day plus the
  // heads-up window (grace).
  function followUp(rv, settings, now) {
    const d = rv.snoozedUntil ? U.parseDateStr(rv.snoozedUntil) : null;
    if (!d) return null;
    const grace = Math.max(0, settings.soonDays || 0);
    return { date: d, holdsUntil: U.addDays(d, grace), active: d >= U.startOfDay(now) };
  }

  // The conversation chain for the current stage.
  // count: links in the current run (each within the gap of the one before; the first within the gap of
  // the moment the stage was reached); broken: the gap has passed with no conversation (bar empties);
  // fading: inside the last heads-up days before it would break; held: a follow-up date is holding it.
  function chain(rv, entries, settings, now) {
    now = now || new Date();
    const gap = gapFor(settings, rv);
    const since = sinceOf(rv);
    const convs = conversations(entries, { liveOnly: true }).filter((e) => ms(e.at) > ms(since));
    let count = 0, prev = dayOf(since);
    for (const e of convs) {
      const d = dayOf(e.at);
      const within = gap == null || U.daysBetween(d, prev) <= gap || e.chainHeld === true;
      count = within ? count + 1 : 1;
      prev = d;
    }
    const out = { count, gap, lastLink: prev, broken: false, fading: false, held: false, deadline: null, daysLeft: null };
    if (gap == null) return out;
    let deadline = U.addDays(prev, gap);
    const fu = followUp(rv, settings, now);
    if (fu && fu.holdsUntil > deadline) { deadline = fu.holdsUntil; out.held = fu.active || U.startOfDay(now) <= fu.holdsUntil; }
    out.deadline = deadline;
    const left = U.daysBetween(deadline, now);
    out.daysLeft = left;
    if (left < 0) { out.broken = true; out.count = 0; out.held = false; return out; }
    if (!out.held && count > 0 && left <= Math.max(0, settings.soonDays || 0)) out.fading = true;
    return out;
  }
  // Whether a conversation logged at `at` should count as a held link (a follow-up date carried it past the gap).
  // logVisit stores the answer on the entry, because the follow-up date is cleared once the visit is saved.
  function heldLink(rv, entries, settings, at) {
    const gap = gapFor(settings, rv);
    if (gap == null) return false;
    const since = sinceOf(rv);
    const prevs = conversations(entries, { liveOnly: true }).filter((e) => ms(e.at) > ms(since) && ms(e.at) < ms(at));
    const prev = prevs.length ? dayOf(prevs[prevs.length - 1].at) : dayOf(since);
    const d = dayOf(at);
    if (U.daysBetween(d, prev) <= gap) return false;
    const fu = followUp(rv, settings, d);
    return !!fu && d <= fu.holdsUntil;
  }
  // Study sessions logged, ever (live ones; imports never count toward growth).
  const studyCount = (entries) => conversations(entries, { liveOnly: true }).filter(isStudySession).length;

  // Shrub flowers (v2.23): at the shrub (form 4), each completed chain of FLOWER_RUN conversations sets one
  // flower, up to FLOWER_MAX; a break empties the run toward the next one. Counted from when the plant became a
  // shrub and from the day flowers arrived (settings.flowersSince; nothing earlier counts), live talks only.
  // Flowers never fall off; they close while the plant is Thirsty or Wilting (drawn by plant.js).
  const FLOWER_RUN = 3, FLOWER_MAX = 5;
  function flowers(rv, entries, settings) {
    if (formOf(settings, rv.stage) !== 4 || !settings.flowersSince) return 0;
    const gap = gapFor(settings, rv);
    const start = Math.max(ms(sinceOf(rv)), ms(settings.flowersSince));
    const convs = conversations(entries, { liveOnly: true }).filter((e) => ms(e.at) > start);
    let n = 0, run = 0, prev = U.startOfDay(new Date(start));
    for (const e of convs) {
      const d = dayOf(e.at);
      const within = gap == null || U.daysBetween(d, prev) <= gap || e.chainHeld === true;
      run = within ? run + 1 : 1;
      prev = d;
      if (run >= FLOWER_RUN) { n++; run = 0; if (n >= FLOWER_MAX) break; }
    }
    return n;
  }

  // Progress toward the next form.
  function progress(rv, entries, settings, now) {
    const form = formOf(settings, rv.stage);
    const need = needFor(settings, rv.stage);
    const kind = kindFor(settings, rv.stage);
    const nx = nextStageOf(settings, rv.stage);
    // nextName: what the plant grows into, as people see it (a stage name across shown stages, else the next form)
    const out = { form, need, have: 0, kind, next: nx ? nx.id : null, nextName: nx ? growthName(settings, rv.stage, nx.id) : '', fading: false, held: false, broken: false };
    if (!form || !need) return out;
    if (kind === 'study') { out.have = Math.min(need, studyCount(entries)); return out; }
    if (kind === 'first') {
      out.have = conversations(entries, { liveOnly: true }).some((e) => ms(e.at) > ms(sinceOf(rv))) ? 1 : 0;
      return out;
    }
    const c = chain(rv, entries, settings, now);
    Object.assign(out, { have: Math.min(need, c.count), fading: c.fading, held: c.held, broken: c.broken });
    return out;
  }
  // After a live log: the stage to grow into, or null. One stage at a time, forward only.
  function growth(rv, entries, settings, now) {
    const p = progress(rv, entries, settings, now);
    return p.need && p.have >= p.need && p.next ? p.next : null;
  }

  // A conversation "left a plan": a study session records where to start next time; any other visit has
  // Discuss next time set (stored on the entry from v2.16; for older entries, the newest one reads the record).
  function planned(e, rv, isNewest) {
    if (isStudySession(e)) return !!e.nextStart;
    if (e.plan === true) return true;
    if (e.plan === false) return false;
    return !!isNewest && !!String(rv.whatsNext || '').trim();
  }

  const NH_HOLD = 14;
  function nhHolds(entries, ref, window, now) {
    const t0 = U.addDays(U.startOfDay(now), -NH_HOLD);
    return live(entries).some((e) => e.type === 'nh' && ms(e.at) > ms(ref) && new Date(e.at) >= t0 &&
      U.daysBetween(new Date(e.at), new Date(ref)) < 2 * window);
  }
  // Care level 1..5 (0 = no plant). Recency sets the ceiling, quality fills up to it.
  function care(rv, entries, settings, now) {
    now = now || new Date();
    if (!formOf(settings, rv.stage)) return 0;
    const all = conversations(entries); // imported visits count toward care
    const lastConv = all[all.length - 1] || null;
    const ref = lastConv ? lastConv.at : rv.createdAt;
    const window = gapFor(settings, rv);
    const fu = followUp(rv, settings, now);
    if (window != null && !(fu && fu.active)) {
      const days = U.daysBetween(now, new Date(ref));
      // A Not Home within the last NH_HOLD days, made while the plant was still only Thirsty, keeps it from
      // wilting: going counts, though only a conversation revives it.
      if (days >= 2 * window && !nhHolds(entries, ref, window, now)) return CARE.WILTED;
      if (days >= window) return CARE.DRY;
    }
    if (!lastConv) return CARE.HEALTHY;
    const touches = live(entries).filter((e) => e.type === 'visit' || e.type === 'nh').sort((a, b) => ms(b.at) - ms(a.at));
    // a Not Home or a visit with no plan still counts as healthy; only a run of planned visits makes it lush
    if (touches[0] && touches[0].type === 'nh') return CARE.HEALTHY;
    if (!planned(lastConv, rv, true)) return CARE.HEALTHY;
    // Seeds and sprouts (Potential, Initial Call) top out at Healthy: too early to flourish.
    if (formOf(settings, rv.stage) <= 2) return CARE.HEALTHY;
    // Lush: a run of consistent visits, each leaving a plan (studies: each recording covered and next).
    const study = L.isStudyStage(settings, rv.stage);
    const run = (study ? all.filter(isStudySession) : all).slice(-LUSH_RUN);
    if (run.length < LUSH_RUN) return CARE.HEALTHY;
    for (let i = 0; i < run.length; i++) {
      const e = run[i];
      const ok = study ? !!(e.progress && e.nextStart) : planned(e, rv, i === run.length - 1);
      if (!ok) return CARE.HEALTHY;
      if (i && window != null && U.daysBetween(dayOf(e.at), dayOf(run[i - 1].at)) > window) return CARE.HEALTHY;
    }
    return CARE.LUSH;
  }

  // Everything a screen needs for one record.
  function stateOf(rv, entries, settings, now) {
    const form = formOf(settings, rv.stage);
    if (!form) return { form: 0, care: 0 };
    const c = care(rv, entries, settings, now);
    const p = progress(rv, entries, settings, now);
    const word = c === CARE.WILTED ? CARE_NAMES[1] : c === CARE.DRY ? CARE_NAMES[2] : '';
    return Object.assign({ vid: rv.id, care: c, word, buds: form === 4 ? Math.min(p.need || 3, studyCount(entries)) : 0, flowers: form === 4 ? flowers(rv, entries, settings) : 0, studied: studyCount(entries) > 0 }, p);
  }

  // State for a list item ({rv, entries}), memoised on the item (store items are rebuilt each minute or edit).
  function forItem(it, settings, now) {
    if (!it._g) it._g = L.isDNC(settings, it.rv) ? { form: 0, care: 0 } : stateOf(it.rv, it.entries, settings, now);
    return it._g;
  }
  // "Almost growing": one qualifying visit from the next form.
  function almost(items, settings, now) {
    return items.map((it) => ({ it, st: forItem(it, settings, now) }))
      .filter((x) => x.st.form && x.st.need && x.st.next && !x.st.broken && x.st.need - x.st.have === 1)
      .sort((a, b) => (b.st.fading - a.st.fading) || U.cmp(a.it.rv.name, b.it.rv.name));
  }

  // ---------- Insights ----------
  const weekStart = (d) => U.addDays(U.startOfDay(d), -d.getDay()); // Sunday
  // Due during the week [ws, ws+7): its window ran out by Saturday, counted from the last conversation
  // before the week (or creation). A follow-up date after Saturday means it is not due this week.
  function weekCheck(it, settings, ws, now) {
    const rv = it.rv;
    const we = U.addDays(ws, 7);
    if (L.isClosed(settings, rv) || L.isDNC(settings, rv) || new Date(rv.createdAt) >= we) return null;
    const gap = L.thresholdFor(settings, rv);
    if (gap == null) return null;
    const convs = conversations(it.entries);
    const before = convs.filter((e) => new Date(e.at) < ws);
    const ref = before.length ? before[before.length - 1].at : rv.createdAt;
    const due = U.addDays(dayOf(ref), gap);
    if (due >= we) return null;
    const isNow = ws <= now && now < we;
    if (isNow && rv.snoozedUntil) { const f = U.parseDateStr(rv.snoozedUntil); if (f && f >= we) return null; }
    // a conversation or a Not Home in the week counts: going is what the ring measures
    const inWeek = (e) => { const t = new Date(e.at); return t >= ws && t < we; };
    const seen = convs.some(inWeek) || live(it.entries).some((e) => e.type === 'nh' && !e.imported && inWeek(e));
    return { seen };
  }
  function weekRing(items, settings, ws, now) {
    let due = 0, seen = 0;
    for (const it of items) { const c = weekCheck(it, settings, ws, now); if (c) { due++; if (c.seen) seen++; } }
    return { due, seen, left: due - seen, perfect: seen === due };
  }
  // Weeks in a row with every due RV seen, counted from the garden's start (never backfilled).
  // A perfect calendar month earns a freeze, which covers one missed week later.
  function streak(items, settings, now, since) {
    now = now || new Date();
    const start = weekStart(since ? new Date(since) : now);
    const cur = weekStart(now);
    const weeks = [];
    let run = 0, best = 0, freezes = 0, monthOk = true, monthWeeks = 0;
    for (let ws = start; ws < cur; ws = U.addDays(ws, 7)) {
      const r = weekRing(items, settings, ws, now);
      let state = r.perfect ? 'ok' : 'miss';
      if (state === 'miss' && freezes > 0) { freezes--; state = 'frz'; }
      run = state === 'miss' ? 0 : run + 1;
      best = Math.max(best, run);
      weeks.push(state);
      // a week belongs to the month its Saturday falls in
      const sat = U.addDays(ws, 6), nextSat = U.addDays(ws, 13);
      monthWeeks++; if (!r.perfect) monthOk = false;
      if (nextSat.getMonth() !== sat.getMonth()) {
        if (monthOk && monthWeeks >= 4) freezes++;
        monthOk = true; monthWeeks = 0;
      }
    }
    const pad = Math.max(0, 12 - weeks.length);
    return { weeks: Array(pad).fill('none').concat(weeks.slice(-12)), streak: run, best, freezes, ring: weekRing(items, settings, cur, now) };
  }
  // Found home (conversations vs Not Homes) and prepared visits (left a plan), over the last 90 days.
  function rates(items, now) {
    now = now || new Date();
    const from = U.addDays(U.startOfDay(now), -90);
    let v = 0, n = 0, planOk = 0, planAll = 0;
    const byDay = Array.from({ length: 7 }, () => ({ v: 0, n: 0 }));
    for (const it of items) for (const e of it.entries) {
      if (new Date(e.at) < from || e.imported) continue;
      const d = new Date(e.at).getDay();
      if (e.type === 'visit') { v++; byDay[d].v++; if (typeof e.plan === 'boolean') { planAll++; if (e.plan) planOk++; } }
      else if (e.type === 'nh') { n++; byDay[d].n++; }
    }
    let bestDay = null;
    byDay.forEach((x, i) => { const t = x.v + x.n; if (t >= 3) { const p = x.v / t; if (!bestDay || p > bestDay.pct) bestDay = { day: i, pct: p }; } });
    return { found: v + n ? v / (v + n) : null, bestDay, prepared: planAll ? planOk / planAll : null };
  }
  // Conversations per day for the last 12 weeks (84 days ending today), as levels 0..3.
  function activityGrid(items, now) {
    now = now || new Date();
    const end = U.startOfDay(now), start = U.addDays(end, -83);
    const counts = new Array(84).fill(0);
    for (const it of items) for (const e of it.entries) {
      if (e.type !== 'visit') continue;
      const i = U.daysBetween(new Date(e.at), start);
      if (i >= 0 && i < 84) counts[i]++;
    }
    return counts.map((c) => (c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : 3));
  }
  // Garden plots: one per area, each plant with its form and care.
  function plots(items, settings, now) {
    const map = new Map();
    for (const it of items) {
      const st = forItem(it, settings, now);
      if (!st.form) continue;
      const k = (it.rv.neighborhood || '').trim();
      if (!map.has(k)) map.set(k, []);
      map.get(k).push({ it, st });
    }
    return Array.from(map, ([name, plants]) => ({
      name, plants: plants.sort((a, b) => a.st.care - b.st.care || U.cmp(a.it.rv.name, b.it.rv.name)),
      wilting: plants.filter((p) => p.st.care === CARE.WILTED).length,
      thirsty: plants.filter((p) => p.st.care === CARE.DRY).length,
    })).sort((a, b) => (!a.name) - (!b.name) || (b.wilting + b.thirsty) - (a.wilting + a.thirsty) || U.cmp(a.name, b.name));
  }
  // Exhibits: one-time milestones, from live activity since the garden started (nothing backfilled).
  // v2.23: twenty milestones in families; each family is one object in the garden that grows richer by tier.
  // [id, short, name, family, tier]. Ids from v2.16 are kept so earned dates carry over.
  const EXHIBITS = [
    ['first-plan', '1st', 'First plan left', 'plan', 1],
    ['round1', '1st', 'First round', 'round', 1],
    ['ring1', '1st', 'First full week', 'streak', 1], ['streak4', '4', '4-week streak', 'streak', 2], ['streak12', '12', '12-week streak', 'streak', 3],
    ['streak26', '26', '6-month streak', 'streak', 4], ['streak52', '1y', 'One-year streak', 'streak', 5],
    ['revive1', '1st', 'First revival', 'revive', 1], ['revive5', '5', '5 revivals', 'revive', 2], ['revive25', '25', '25 revivals', 'revive', 3],
    ['rv10', '10', '10 return visits', 'rv', 1], ['rv25', '25', '25 return visits', 'rv', 2], ['rv50', '50', '50 return visits', 'rv', 3], ['rv100', '100', '100 return visits', 'rv', 4],
    ['first10', '10', '10 first talks', 'first', 1], ['first25', '25', '25 first talks', 'first', 2],
    ['first-study', '1st', 'First study', 'study', 1], ['studies3', '3', 'Three studies', 'study', 2], ['studies5', '5', 'Five studies', 'study', 3],
    ['area', 'All', 'Area all watered', 'area', 1],
  ];
  function exhibitsEarned(items, settings, now, since, best) {
    const t0 = since ? new Date(since) : new Date(0);
    const after = (e) => !e.imported && !e.deletedAt && new Date(e.at) >= t0;
    let visits = 0, firsts = 0, plans = 0, revived = 0;
    const studied = new Set();
    for (const it of items) {
      const live = it.entries.filter((e) => e.type === 'visit' && !e.imported);
      visits += live.filter(after).length;
      plans += live.filter((e) => after(e) && (e.plan === true || (e.study && e.nextStart))).length;
      revived += live.filter((e) => after(e) && e.revived).length;
      if (live.some(isStudySession) && live.filter(isStudySession).some(after)) studied.add(it.rv.id);
      const firstConv = live.reduce((m, e) => (!m || e.at < m.at ? e : m), null);
      if (firstConv && after(firstConv)) firsts++;
    }
    const pl = plots(items, settings, now);
    return {
      'first-plan': plans >= 1, round1: !!settings.roundSeen,
      ring1: best >= 1, streak4: best >= 4, streak12: best >= 12, streak26: best >= 26, streak52: best >= 52,
      revive1: revived >= 1, revive5: revived >= 5, revive25: revived >= 25,
      rv10: visits >= 10, rv25: visits >= 25, rv50: visits >= 50, rv100: visits >= 100,
      first10: firsts >= 10, first25: firsts >= 25,
      'first-study': studied.size >= 1, studies3: studied.size >= 3, studies5: studied.size >= 5,
      area: pl.some((p) => p.name && p.plants.length >= 3 && !p.wilting && !p.thirsty),
    };
  }

  // Week's-end recap: the Sunday-to-Saturday week that just ended, once (seen = that week's start as
  // YYYY-MM-DD). Null when already seen or when the garden started after that week.
  function recap(items, settings, now, since, seen) {
    now = now || new Date();
    const ws = U.addDays(weekStart(now), -7), we = U.addDays(ws, 7);
    const key = U.toDateStr(ws);
    if (seen === key) return null;
    if (!since || new Date(since) >= we) return null;
    const ring = weekRing(items, settings, ws, now);
    const grew = [];
    for (const it of items) for (const e of it.entries) {
      if (e.type !== 'stage' || !e.grew || e.deletedAt) continue;
      const t = new Date(e.at);
      if (t >= ws && t < we) grew.push({ rv: it.rv, from: e.from, to: e.to, at: e.at });
    }
    grew.sort((a, b) => (a.at < b.at ? -1 : 1));
    let revived = 0;
    for (const it of items) for (const e of it.entries) {
      if (e.type === 'visit' && e.revived && !e.deletedAt) { const t = new Date(e.at); if (t >= ws && t < we) revived++; }
    }
    const lush = items.filter((it) => forItem(it, settings, now).care === CARE.LUSH).length;
    const sk = streak(items, settings, now, since);
    const earned = Object.keys(settings.exhibits || {}).filter((id) => { const t = new Date(settings.exhibits[id]); return t >= ws && t < we; });
    return { key, ws, we, ring, grew, revived, lush, streak: sk.streak, exhibits: earned };
  }
  // A field-service round: the latest run of live logs (Not Homes, visits, new contacts) no more than
  // ROUND_GAP minutes apart. Shown once (seen = the round's key, its last log time) when it has at least
  // ROUND_MIN logs, ended at least ROUND_REST minutes ago (force skips that) and within the last 18 hours.
  const ROUND_GAP = 90, ROUND_MIN = 3, ROUND_REST = 30;
  function round(items, settings, now, seen, force) {
    now = now || new Date();
    const ev = [];
    for (const it of items) {
      if (it.rv.deletedAt) continue;
      if (!it.rv.imported) ev.push({ t: ms(it.rv.createdAt), kind: 'new', it });
      for (const e of it.entries) {
        if (e.deletedAt || e.imported) continue;
        if (e.type === 'nh' || e.type === 'visit') ev.push({ t: ms(e.at), kind: e.type, e, it });
        else if (e.type === 'stage' && e.grew) ev.push({ t: ms(e.at), kind: 'grew', e, it });
      }
    }
    const nowMs = now.getTime();
    const past = ev.filter((x) => x.t <= nowMs).sort((a, b) => a.t - b.t);
    if (!past.length) return null;
    let i = past.length - 1;
    while (i > 0 && past[i].t - past[i - 1].t <= ROUND_GAP * 60000) i--;
    const run = past.slice(i);
    const end = run[run.length - 1].t;
    const key = new Date(end).toISOString();
    if (seen && seen >= key) return null;
    if (nowMs - end > 18 * 3600000) return null;
    if (!force && nowMs - end < ROUND_REST * 60000) return null;
    const logs = run.filter((x) => x.kind !== 'grew');
    if (logs.length < ROUND_MIN) return null;
    const tried = new Set(logs.filter((x) => x.kind === 'nh' || x.kind === 'visit').map((x) => x.it.rv.id));
    const talks = logs.filter((x) => x.kind === 'visit');
    const talked = []; const seenIds = new Set();
    for (const x of talks) if (!seenIds.has(x.it.rv.id)) { seenIds.add(x.it.rv.id); talked.push(x.it); }
    return {
      key, start: new Date(run[0].t), end: new Date(end),
      tried: tried.size, talks: talks.length, nh: logs.filter((x) => x.kind === 'nh').length,
      plans: talks.filter((x) => x.e.plan === true || (x.e.study && x.e.nextStart)).length,
      revived: talks.filter((x) => x.e.revived).length,
      grew: run.filter((x) => x.kind === 'grew').map((x) => ({ rv: x.it.rv, from: x.e.from, to: x.e.to })),
      added: logs.filter((x) => x.kind === 'new').length,
      talked,
    };
  }
  // How many planned conversations in a row this record has toward Lush (0..LUSH_RUN), counting back from
  // the newest while each came within the gap of the one before and the newest is within the gap of now.
  function lushRun(rv, entries, settings, now) {
    now = now || new Date();
    const gap = gapFor(settings, rv);
    const all = conversations(entries);
    let n = 0, next = now;
    for (let i = all.length - 1; i >= 0 && n < LUSH_RUN; i--) {
      const e = all[i];
      if (gap != null && U.daysBetween(U.startOfDay(next), dayOf(e.at)) > gap) break;
      if (!planned(e, rv, i === all.length - 1)) break;
      n++; next = new Date(e.at);
    }
    return n;
  }

  // Time of day for the garden sky.
  const skyOf = (d) => { const h = d.getHours(); return h < 6 || h >= 20 ? 'night' : h < 9 ? 'morning' : h < 17 ? 'day' : 'dusk'; };

  // What to call a growth step: a new shown stage by its name (Potential -> RV, RV -> Bible Study); a step
  // inside RV by the plant's new form ("Leafy plant").
  function growthName(settings, from, to) {
    const a = L.shownStage(settings, from), b = L.shownStage(settings, to);
    if (a.key !== b.key) return b.name;
    const n = FORM_NAMES[formOf(settings, to)] || '';
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  const api = {
    CARE, CARE_NAMES, FORM_NAMES, GROW_DEFAULTS, LUSH_RUN, NH_HOLD, EXHIBITS, round, lushRun, flowers, FLOWER_RUN, FLOWER_MAX, ROUND_GAP, ROUND_MIN, ROUND_REST,
    formOf, needFor, kindFor, nextStageOf, conversations, isStudySession, sinceOf, followUp,
    chain, heldLink, studyCount, progress, growth, planned, care, stateOf,
    forItem, almost, weekStart, weekRing, streak, rates, activityGrid, plots, exhibitsEarned, recap, skyOf, growthName,
  };
  RV.garden = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
