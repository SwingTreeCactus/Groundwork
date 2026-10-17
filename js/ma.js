/* RV app: convert a decoded Ministry Assistant backup (Smile pairs) into RV records and timeline entries. Pure. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  const isPairs = (v) => Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string');
  const first = (pairs, key) => { const p = (pairs || []).find((x) => x[0] === key); return p ? p[1] : undefined; };
  const all = (pairs, key) => (pairs || []).filter((x) => x[0] === key).map((x) => x[1]);
  const iso = (ms) => { const n = Number(ms); return n > 0 ? new Date(n).toISOString() : null; };
  const str = (v) => (v == null ? '' : String(v).trim());

  // text that records an attempt where nobody answered, not a conversation
  const NOT_HOME = /^\s*(n\/?h|not\s*home|no\s*one\s*(was\s*)?home|nobody\s*home|no\s*answer)\b/i;

  // pairs: output of RV.smile.decode(bytes, {pairs: true})
  // opts: { uuid: () => id, stageId, closedStageId, closedReason, bestFromLast: bool }
  function convert(pairs, opts) {
    opts = opts || {};
    const uuid = opts.uuid || (() => Math.random().toString(36).slice(2));
    const result = { rvs: [], entries: [], skipped: 0, notes: 0 };
    if (!isPairs(pairs)) throw new Error('Not a Ministry Assistant backup');
    const map = first(pairs, 'PersonMap');
    if (!isPairs(map)) throw new Error('This backup has no people in it');
    const cities = first(pairs, 'Cities');
    const onlyCity = Array.isArray(cities) && cities.length === 1 ? str(cities[0]) : '';

    map.forEach(([, wrapper]) => {
      const person = isPairs(wrapper) ? (first(wrapper, 'P') || wrapper) : null;
      if (!isPairs(person)) { result.skipped++; return; }
      const name = str(first(person, 'N'));
      if (!name) { result.skipped++; return; }
      const street = str(first(person, 'Add'));
      const city = str(first(person, 'City')) || (street ? onlyCity : '');
      const zip = str(first(person, 'Zip'));
      const address = street ? [street, [city, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
      const hidden = first(person, 'Hidden') === true;
      const rvId = uuid();

      const visits = [];
      all(person, 'Inf').forEach((inf) => {
        if (!isPairs(inf)) return;
        inf.forEach(([, pi]) => {
          if (!isPairs(pi)) return;
          const text = str(first(pi, 'I'));
          const sc = str(first(pi, 'Sc'));
          const at = iso(first(pi, 'D'));
          if (!text && !sc) return;
          visits.push({ text, scriptures: sc ? sc.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean) : [], at });
        });
      });
      const stamps = visits.map((v) => v.at).concat([iso(first(person, 'LstTry')), iso(first(person, 'Date'))]).filter(Boolean).sort();
      const createdAt = stamps[0] || new Date().toISOString();
      visits.forEach((v) => {
        result.entries.push({ id: uuid(), rvId, type: 'visit', at: v.at || createdAt, text: v.text, scriptures: v.scriptures, updatedAt: v.at || createdAt, deletedAt: null });
        result.notes++;
      });
      // best day: the weekday they were last actually home, from the newest note that is not a not-home
      let bestDays = [];
      if (opts.bestFromLast) {
        const home = visits.filter((v) => v.at && !NOT_HOME.test(v.text)).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
        if (home) bestDays = [new Date(home.at).getDay()];
      }
      const rv = {
        id: rvId, bestDays, name, address, phone: str(first(person, 'Ph') || first(person, 'Phone') || first(person, 'Tel')),
        neighborhood: str(first(person, 'Sub') || first(person, 'Suburb')),
        stage: hidden && opts.closedStageId ? opts.closedStageId : opts.stageId,
        archiveReason: hidden && opts.closedStageId ? (opts.closedReason || 'other') : null,
        createdAt, stageChangedAt: stamps.length ? stamps[stamps.length - 1] : createdAt, updatedAt: createdAt, deletedAt: null,
      };
      result.rvs.push(rv);
    });
    return result;
  }

  RV.ma = { convert };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.ma;
})(typeof window !== 'undefined' ? window : globalThis);
