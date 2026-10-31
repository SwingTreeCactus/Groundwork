/* Groundwork: handing a contact to another publisher (v2.47). One contact becomes a small JSON file the sender shares
   however they like (Messages, WhatsApp, email); the other person opens it in Groundwork and reviews it before it is
   added. No accounts and no server: the file goes straight from one phone to the other.
   pack() builds the file from a record and its timeline; unpack() turns a file into a new record and entries. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const KIND = 'groundwork-handoff';
  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  // include: { notes, visits, next, phone } (all default on); o: { from, message, stageKey, now }
  function pack(rv, entries, include, o) {
    include = Object.assign({ notes: true, visits: true, next: true, phone: true }, include || {});
    o = o || {};
    const contact = {
      name: str(rv.name), address: str(rv.address), area: str(rv.neighborhood),
      phone: include.phone ? str(rv.phone) : '',
      notes: include.notes ? str(rv.notes) : '',
      discussNext: include.next ? str(rv.whatsNext) : '',
      bestDays: Array.isArray(rv.bestDays) ? rv.bestDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
      bestNote: str(rv.bestNote),
      publication: str(rv.publication), progress: str(rv.progress), nextStart: str(rv.nextStart),
      geo: rv.geo && typeof rv.geo.lat === 'number' ? { lat: rv.geo.lat, lng: rv.geo.lng } : null,
      stage: o.stageKey || '',
    };
    const visits = include.visits ? (entries || [])
      .filter((e) => !e.deletedAt && (e.type === 'visit' || e.type === 'nh' || e.type === 'note'))
      .sort((a, b) => (a.at < b.at ? -1 : 1))
      .map((e) => Object.assign({ type: e.type, at: e.at, text: str(e.text) },
        e.study || e.progress || e.nextStart ? { study: true, publication: str(e.publication), progress: str(e.progress), nextStart: str(e.nextStart) } : {})) : [];
    return { app: KIND, version: 1, sentAt: (o.now || new Date()).toISOString(), from: str(o.from), message: str(o.message), contact, visits };
  }

  const isHandoff = (d) => !!(d && d.app === KIND && d.contact && typeof d.contact.name === 'string');

  // A file name that names the person, safe on every phone
  const fileName = (name) => 'Groundwork handoff - ' + (String(name || 'contact').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'contact') + '.json';

  // o: { uuid, stageId, now, howMet }. The visits come in as imported (they never grow the plant); a line at the top
  // of the household notes says who handed it over, when, and their message.
  function unpack(d, o) {
    if (!isHandoff(d)) throw new Error('Not a Groundwork handoff');
    const c = d.contact, now = (o.now || new Date()).toISOString(), id = o.uuid();
    const when = d.sentAt ? String(d.sentAt).slice(0, 10) : now.slice(0, 10);
    const head = 'Handed over' + (str(d.from) ? ' by ' + str(d.from) : '') + ' on ' + when + (str(d.message) ? ': ' + str(d.message) : '') + '.';
    const visits = (Array.isArray(d.visits) ? d.visits : []).filter((v) => v && (v.type === 'visit' || v.type === 'nh' || v.type === 'note') && v.at && !isNaN(new Date(v.at)));
    const entries = visits.map((v) => Object.assign({ id: o.uuid(), rvId: id, type: v.type, at: v.at, text: str(v.text), scriptures: [], imported: true, updatedAt: now, deletedAt: null },
      v.study ? { study: true, publication: str(v.publication), progress: str(v.progress), nextStart: str(v.nextStart) } : {}));
    const last = entries.length ? entries[entries.length - 1].at : now;
    const rv = {
      id, name: str(c.name) || 'Unnamed', address: str(c.address), neighborhood: str(c.area), phone: str(c.phone),
      notes: [head, str(c.notes)].filter(Boolean).join('\n'), whatsNext: str(c.discussNext),
      bestDays: Array.isArray(c.bestDays) ? c.bestDays.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : [],
      bestNote: str(c.bestNote), publication: str(c.publication), progress: str(c.progress), nextStart: str(c.nextStart),
      geo: c.geo && typeof c.geo.lat === 'number' && typeof c.geo.lng === 'number' ? { lat: c.geo.lat, lng: c.geo.lng, acc: null, at: now } : null,
      howMet: o.howMet || '', stage: o.stageId, imported: true,
      createdAt: now, stageChangedAt: last, updatedAt: now, deletedAt: null,
    };
    return { rv, entries };
  }

  const api = { KIND, pack, unpack, isHandoff, fileName };
  RV.handoff = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
