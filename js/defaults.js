/* RV app: default settings and settings merging. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  const HOME_CARD_NAMES = {
    campaign: 'Campaigns',
    starters: 'Conversation starters',
    scriptures: 'Scriptures',
    topics: 'Topics',
    attention: 'Needs attention',
    comingUp: 'Coming up',
    recent: 'Recently added',
    quickAdd: 'Quick add',
    likelyHome: 'Likely home right now',
  };

  const LIB_KINDS = {
    starter: { card: 'starters', labelKey: 'starters', single: 'conversation starter' },
    scripture: { card: 'scriptures', labelKey: 'scriptures', single: 'scripture' },
    topic: { card: 'topics', labelKey: 'topics', single: 'topic' },
    campaign: { card: 'campaign', labelKey: 'campaign', single: 'campaign' },
  };

  function defaultSettings() {
    return {
      version: 1,
      labels: {
        rv: 'RV', rvs: 'RVs',
        notHome: 'Not Home', notHomeShort: 'NH',
        recordVisit: 'Record visit',
        campaign: 'Campaign',
        starters: 'Conversation starters',
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
      homeCards: [
        { id: 'campaign', on: true },
        { id: 'starters', on: true },
        { id: 'scriptures', on: true },
        { id: 'topics', on: true },
        { id: 'attention', on: true },
        { id: 'comingUp', on: true },
        { id: 'recent', on: false },
        { id: 'quickAdd', on: true },
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
    for (const k of ['labels', 'notHomeBanner', 'lists', 'lock']) out[k] = Object.assign({}, d[k], saved[k] || {});
    const cards = Array.isArray(saved.homeCards) ? saved.homeCards.filter((c) => HOME_CARD_NAMES[c.id]) : d.homeCards;
    for (const c of d.homeCards) if (!cards.some((x) => x.id === c.id)) cards.push(c);
    out.homeCards = cards;
    if (!Array.isArray(out.stages) || !out.stages.length) out.stages = d.stages;
    if (!out.stages.some((s) => s.closed)) out.stages.push(d.stages[d.stages.length - 1]);
    if (!Array.isArray(out.archiveReasons) || !out.archiveReasons.length) out.archiveReasons = d.archiveReasons;
    return out;
  }

  RV.defaults = { defaultSettings, mergeSettings, HOME_CARD_NAMES, LIB_KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.defaults;
})(typeof window !== 'undefined' ? window : globalThis);
