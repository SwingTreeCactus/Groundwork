/* RV app: the garden (v2.16). Pure functions: a record's plant form (stage), care level (health),
   conversation chain toward the next form, and the Follow up on hold. No DOM, no storage.
   Spec: claude/garden-plan.md. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const U = RV.util || (typeof require !== 'undefined' ? require('./util.js') : null);
  const L = RV.logic || (typeof require !== 'undefined' ? require('./logic.js') : null);

  // Care levels, wilted to lush. 0 = no plant (archived / Do not call).
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

  // Progress toward the next form.
  function progress(rv, entries, settings, now) {
    const form = formOf(settings, rv.stage);
    const need = needFor(settings, rv.stage);
    const kind = kindFor(settings, rv.stage);
    const nx = nextStageOf(settings, rv.stage);
    const out = { form, need, have: 0, kind, next: nx ? nx.id : null, nextName: nx ? nx.name : '', fading: false, held: false, broken: false };
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
      if (days >= 2 * window) return CARE.WILTED;
      if (days >= window) return CARE.DRY;
    }
    if (!lastConv) return CARE.STEADY;
    const touches = live(entries).filter((e) => e.type === 'visit' || e.type === 'nh').sort((a, b) => ms(b.at) - ms(a.at));
    if (touches[0] && touches[0].type === 'nh') return CARE.STEADY;
    if (!planned(lastConv, rv, true)) return CARE.STEADY;
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
    return Object.assign({ care: c, word, buds: form === 4 ? Math.min(p.need || 3, studyCount(entries)) : 0, studied: studyCount(entries) > 0 }, p);
  }

  const api = {
    CARE, CARE_NAMES, FORM_NAMES, GROW_DEFAULTS, LUSH_RUN,
    formOf, needFor, kindFor, nextStageOf, conversations, isStudySession, sinceOf, followUp,
    chain, heldLink, studyCount, progress, growth, planned, care, stateOf,
  };
  RV.garden = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
