/* RV app: default settings and settings merging. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  // Home is for planning, not for work lists. The active campaign banner is automatic (not a card).
  const HOME_CARD_NAMES = {
    topics: 'Topics',
    recent: 'Recently added', // v2.39: Likely home right now is gone (Today leads with who is likely home)
  };

  // Conversation starters and scriptures were folded into Topics in version 2.
  const LIB_KINDS = {
    topic: { card: 'topics', labelKey: 'topics', single: 'topic' },
    campaign: { card: 'campaign', labelKey: 'campaign', single: 'campaign' },
  };

  function defaultSettings() {
    return {
      version: 2,
      labels: {
        rv: 'RV', rvs: 'RVs',
        notHome: 'Not Home', notHomeShort: 'NH',
        recordVisit: 'Record a visit', logStudy: 'Log study',
        campaign: 'Campaign',
        scriptures: 'Scriptures',
        topics: 'Topics',
        neighborhood: 'Area',
        archive: 'Archive',
        today: 'Today',
        bibleStudy: 'Bible study',
      },
      stages: [
        { id: 'yet', name: 'Potential', days: null, closed: false },
        { id: 'initial', name: 'Initial Call', days: 30, closed: false },
        { id: 'cultivating', name: 'Cultivating Interest', days: 30, closed: false },
        { id: 'return', name: 'Return Visit', days: 30, closed: false },
        { id: 'study', name: 'Bible Study', days: 30, closed: false, study: true },
        { id: 'archived', name: 'Archived', days: 0, closed: true },
      ],
      archiveReasons: [
        { id: 'moved', name: 'Moved away', restorable: true, hidden: true, dnc: false },
        { id: 'notint', name: 'Not interested', restorable: true, hidden: true, dnc: false },
        { id: 'dnc', name: 'Do not call', restorable: false, hidden: true, dnc: true },
        { id: 'dup', name: 'Duplicate record', restorable: false, hidden: true, dnc: false },
        { id: 'other', name: 'Other', restorable: true, hidden: true, dnc: false },
      ],
      defaultStaleDays: 30,
      overdue30: true,
      comingUpDays: 7,
      soonDays: 2,
      // An RV with a best-day tag is not flagged overdue on other days until it is this many times past its threshold.
      dayTagForceFactor: 2,
      // "Stuck in stage" starts at this many times the stage's threshold.
      stuckFactor: 3,
      // Effort points (Insights). Every logged action earns something, including Not Home.
      points: { nh: 1, visit: 3, advance: 5, newRv: 2 },
      homeCards: [
        { id: 'topics', on: true },
        { id: 'recent', on: false },
      ],
      // v2.40: conversation topic themes (folders in Topics); the seeded library uses the first eleven
      themes: (typeof RV !== 'undefined' && RV.library ? RV.library.THEMES : []).map((t) => Object.assign({}, t)),
      theme: 'system',
      accent: 'purple',
      textScale: 1,
      nhRowButton: true,
      // v2.16 garden: plants in rows and screens (off = plain rows); when it started (nothing before
      // counts toward streaks or exhibits); exhibits earned {id: ISO date}.
      garden: true,
      gardenSince: null,
      flowersSince: null,
      exhibits: {},
      recapSeen: null,
      roundSeen: null,
      nhToastSeconds: 6,
      notHomeBanner: { on: true, minAttempts: 2 },
      lists: {
        neighborhoods: [],
        howMet: ['House to house', 'Street', 'Referral', 'Phone or letter', 'Other'],
      },
      customFields: [],
      savedViews: [],
      lock: { on: false, salt: '', hash: '', timeoutMin: 1 },
    };
  }

  // Merge saved settings over defaults so new settings appear after an update.
  function mergeSettings(saved) {
    const d = defaultSettings();
    if (!saved || typeof saved !== 'object') return d;
    const out = Object.assign({}, d, saved);
    for (const k of ['labels', 'notHomeBanner', 'lists', 'lock', 'points']) out[k] = Object.assign({}, d[k], saved[k] || {});
    if (out.labels.recordVisit === 'Record visit') out.labels.recordVisit = d.labels.recordVisit; // old default, renamed in 2.7
    const cards = Array.isArray(saved.homeCards) ? saved.homeCards.filter((c) => HOME_CARD_NAMES[c.id]) : d.homeCards;
    for (const c of d.homeCards) if (!cards.some((x) => x.id === c.id)) cards.push(c);
    out.homeCards = cards;
    out.version = d.version;
    if (!Array.isArray(out.stages) || !out.stages.length) out.stages = d.stages;
    if (!out.stages.some((s) => s.closed)) out.stages.push(d.stages[d.stages.length - 1]);
    // 2.12: the first stage "Yet to Contact" became "Potential" (a name set by hand stays)
    out.stages = out.stages.map((st) => (st.id === 'yet' && st.name === 'Yet to Contact' ? Object.assign({}, st, { name: 'Potential' }) : st));
    // 2.9: "Door" became "House to house" (the default for new contacts)
    if (out.lists && Array.isArray(out.lists.howMet)) out.lists.howMet = out.lists.howMet.map((x) => (x === 'Door' ? 'House to house' : x));
    // 2.7.2: overdue after 30 days by default. Move old untouched defaults (7, 7, 14, 14) once; values set by hand stay.
    if (!saved.overdue30) {
      const old = { initial: 7, cultivating: 7, return: 14 };
      out.stages = out.stages.map((st) => (old[st.id] != null && st.days === old[st.id] ? Object.assign({}, st, { days: 30 }) : st));
      if (out.defaultStaleDays === 14) out.defaultStaleDays = 30;
      out.overdue30 = true;
    }
    if (!Array.isArray(out.archiveReasons) || !out.archiveReasons.length) out.archiveReasons = d.archiveReasons;
    return out;
  }

  RV.defaults = { defaultSettings, mergeSettings, HOME_CARD_NAMES, LIB_KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.defaults;
})(typeof window !== 'undefined' ? window : globalThis);
