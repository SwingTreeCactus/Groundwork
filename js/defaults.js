/* RV app: default settings and settings merging. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  // Home is for planning, not for work lists. The active campaign banner is automatic (not a card).
  const HOME_CARD_NAMES = {
    topics: 'Topics',
    quickAdd: 'Quick add',
    recent: 'Recently added',
    likelyHome: 'Likely home right now',
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
        recordVisit: 'Record visit',
        campaign: 'Campaign',
        scriptures: 'Scriptures',
        topics: 'Topics',
        neighborhood: 'Neighborhood',
        archive: 'Archive',
        today: 'Today',
        bibleStudy: 'Bible study',
      },
      stages: [
        { id: 'yet', name: 'Yet to Contact', days: null, closed: false },
        { id: 'initial', name: 'Initial Call', days: 7, closed: false },
        { id: 'cultivating', name: 'Cultivating Interest', days: 7, closed: false },
        { id: 'return', name: 'Return Visit', days: 14, closed: false },
        { id: 'study', name: 'Bible Study', days: 30, closed: false },
        { id: 'archived', name: 'Archived', days: 0, closed: true },
      ],
      archiveReasons: [
        { id: 'moved', name: 'Moved away', restorable: true, hidden: true, dnc: false },
        { id: 'notint', name: 'Not interested', restorable: true, hidden: true, dnc: false },
        { id: 'dnc', name: 'Do not call', restorable: false, hidden: true, dnc: true },
        { id: 'dup', name: 'Duplicate record', restorable: false, hidden: true, dnc: false },
        { id: 'other', name: 'Other', restorable: true, hidden: true, dnc: false },
      ],
      defaultStaleDays: 14,
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
        { id: 'quickAdd', on: true },
        { id: 'recent', on: false },
        { id: 'likelyHome', on: false },
      ],
      theme: 'system',
      textScale: 1,
      nhRowButton: true,
      nhToastSeconds: 6,
      notHomeBanner: { on: true, minAttempts: 2 },
      lists: {
        neighborhoods: [],
        howMet: ['Door', 'Street', 'Referral', 'Phone or letter', 'Other'],
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
    const cards = Array.isArray(saved.homeCards) ? saved.homeCards.filter((c) => HOME_CARD_NAMES[c.id]) : d.homeCards;
    for (const c of d.homeCards) if (!cards.some((x) => x.id === c.id)) cards.push(c);
    out.homeCards = cards;
    out.version = d.version;
    if (!Array.isArray(out.stages) || !out.stages.length) out.stages = d.stages;
    if (!out.stages.some((s) => s.closed)) out.stages.push(d.stages[d.stages.length - 1]);
    if (!Array.isArray(out.archiveReasons) || !out.archiveReasons.length) out.archiveReasons = d.archiveReasons;
    return out;
  }

  RV.defaults = { defaultSettings, mergeSettings, HOME_CARD_NAMES, LIB_KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.defaults;
})(typeof window !== 'undefined' ? window : globalThis);
