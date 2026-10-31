/* Groundwork: convert a Witness Work backup (witness-work-backup.json) into contacts and timeline entries. Pure. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  const str = (v) => (v == null ? '' : String(v).trim());
  const STATES = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
    florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY',
    louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
    montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
    'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
    'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
  };
  const ABBR = new Set(Object.values(STATES));

  function isBackup(data) {
    return !!(data && typeof data === 'object' && data.contactStore && Array.isArray(data.contactStore.contacts) && data.conversationStore);
  }

  // "2060 Tuxedo Ave S, Stockton, CA 95204-4850"; a city typed in the state box (seen in real backups) is treated as the city
  function address(a) {
    if (!a) return '';
    let city = str(a.city), state = str(a.state);
    const st = STATES[state.toLowerCase()] || (ABBR.has(state.toUpperCase()) ? state.toUpperCase() : '');
    if (state && !st && !city) { city = state; state = ''; } else state = st || state;
    const street = [str(a.line1), str(a.line2)].filter(Boolean).join(' ');
    const tail = [state, str(a.zip)].filter(Boolean).join(' ');
    return [street, city, tail].filter(Boolean).join(', ');
  }

  // data: parsed JSON. opts: { uuid, stageId, potentialStageId, studyStageId, closedStageId, closedReason, includeDeleted, bestFromLast, howMet }
  function convert(data, opts) {
    opts = opts || {};
    if (!isBackup(data)) throw new Error('Not a Witness Work backup');
    const uuid = opts.uuid || (() => Math.random().toString(36).slice(2));
    const result = { rvs: [], entries: [], skipped: 0, deletedCount: 0, notes: 0 };
    const cs = data.contactStore, conv = data.conversationStore;
    const deleted = new Set((conv.deletedConversations || []).map((c) => c.id));
    const byContact = new Map();
    (conv.conversations || []).forEach((c) => {
      if (!c || deleted.has(c.id) || !c.contact || !c.contact.id) return;
      if (!byContact.has(c.contact.id)) byContact.set(c.contact.id, []);
      byContact.get(c.contact.id).push(c);
    });
    const deletedContacts = cs.deletedContacts || [];
    result.deletedCount = deletedContacts.length;
    const people = cs.contacts.map((c) => ({ c, gone: false })).concat(opts.includeDeleted ? deletedContacts.map((c) => ({ c, gone: true })) : []);

    people.forEach(({ c, gone }) => {
      const name = str(c.name);
      if (!name) { result.skipped++; return; }
      const rvId = uuid();
      const talks = (byContact.get(c.id) || []).filter((t) => t.date).sort((a, b) => (a.date < b.date ? -1 : 1));
      const createdAt = [str(c.createdAt)].concat(talks.map((t) => t.date)).filter(Boolean).sort()[0] || new Date().toISOString();

      talks.forEach((t) => {
        const nh = !!t.notAtHome;
        const note = str(t.note);
        const topic = str(t.followUp && t.followUp.topic);
        const e = { id: uuid(), rvId, type: nh ? 'nh' : 'visit', at: t.date, text: note, scriptures: [], imported: true, updatedAt: t.date, deletedAt: null };
        if (topic && topic !== note) e.text = note ? note + '\n\nNext time: ' + topic : 'Next time: ' + topic;
        if (!nh && t.isBibleStudy) e.study = true;
        result.entries.push(e);
        result.notes++;
      });

      const live = talks.filter((t) => !t.notAtHome);
      const studied = live.some((t) => t.isBibleStudy);
      const last = live[live.length - 1];
      // Discuss next time: the newest follow-up topic left on a conversation
      const planned = talks.filter((t) => str(t.followUp && t.followUp.topic));
      const whatsNext = planned.length ? str(planned[planned.length - 1].followUp.topic) : '';

      const extra = [];
      if (str(c.email)) extra.push('Email: ' + str(c.email));
      Object.entries(c.customFields || {}).forEach(([k, v]) => { if (str(v)) extra.push(k + ': ' + str(v)); });

      let bestDays = [];
      if (opts.bestFromLast && last) bestDays = [new Date(last.date).getDay()];

      const co = c.coordinate;
      const geo = co && isFinite(co.latitude) && isFinite(co.longitude) ? { lat: Number(co.latitude), lng: Number(co.longitude), acc: null, at: createdAt } : null;
      const stage = gone && opts.closedStageId ? opts.closedStageId
        : studied && opts.studyStageId ? opts.studyStageId
        : !live.length && opts.potentialStageId ? opts.potentialStageId
        : opts.stageId;

      result.rvs.push({
        id: rvId, name, address: address(c.address), phone: str(c.phone), notes: extra.join('\n'), whatsNext, bestDays, geo,
        howMet: opts.howMet || '', imported: true,
        stage, archiveReason: gone && opts.closedStageId ? (opts.closedReason || 'other') : null,
        createdAt, stageChangedAt: talks.length ? talks[talks.length - 1].date : createdAt, updatedAt: createdAt, deletedAt: null,
      });
    });
    return result;
  }

  RV.ww = { isBackup, address, convert };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.ww;
})(typeof window !== 'undefined' ? window : globalThis);
