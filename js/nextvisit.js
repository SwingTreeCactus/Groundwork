/* Groundwork v2.57: the next visit. One date per contact (rv.snoozedUntil, the old follow-up date), with an optional
   time (rv.nextTime "HH:MM"), a reminder (rv.nextRemind) and a repeat (rv.nextRepeat). Set from a sheet that works
   like a calendar app's event sheet: Date, Time, Repeat, Reminder. A date that passes without a visit is shown
   quietly ("Was Sat, Nov 14"), never as overdue. Nothing about it says visit or phone: a next visit is a next visit,
   and the plan says "phone her" when that matters. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const U = RV.util;

  // ---------- pure ----------
  const REMIND = [
    { value: 'morning', label: 'Morning of', sub: 'With the morning follow-up list', untimed: true },
    { value: 'none', label: 'None', untimed: true },
    { value: 'at', label: 'At the time', mins: 0 },
    { value: '15', label: '15 minutes before', mins: 15 },
    { value: '30', label: '30 minutes before', mins: 30 },
    { value: '60', label: '1 hour before', mins: 60 },
    { value: '120', label: '2 hours before', mins: 120 },
    { value: 'daybefore', label: 'Day before (6:00 PM)', untimed: true },
  ];
  const REPEAT = [
    { value: null, label: 'Never' },
    { value: 'w1', label: 'Every week' },
    { value: 'w2', label: 'Every 2 weeks' },
    { value: 'm1', label: 'Every month' },
  ];
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt12 = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    if (!m) return '';
    const hh = +m[1];
    return (hh % 12 || 12) + ':' + m[2] + ' ' + (hh < 12 ? 'AM' : 'PM');
  };
  const remindOf = (rv) => {
    const r = (rv && rv.nextRemind) || 'morning';
    const opt = REMIND.find((x) => x.value === r) || REMIND[0];
    // a timed reminder without a time falls back to the morning list
    return !rv.nextTime && !opt.untimed ? REMIND[0] : opt;
  };
  const remindLabel = (rv) => remindOf(rv).label;
  const repeatLabel = (rv) => (REPEAT.find((x) => x.value === (rv.nextRepeat || null)) || REPEAT[0]).label;
  const repeatWord = (rv) => ({ w1: 'Every ' + U.DAYS[(U.parseDateStr(rv.snoozedUntil) || new Date()).getDay()], w2: 'Every 2 weeks', m1: 'Every month' })[rv.nextRepeat] || '';

  // The next one after a date: a week, two weeks or a month on.
  function step(ds, repeat) {
    const d = U.parseDateStr(ds);
    if (!d) return null;
    if (repeat === 'w1') return U.toDateStr(U.addDays(d, 7));
    if (repeat === 'w2') return U.toDateStr(U.addDays(d, 14));
    if (repeat === 'm1') { const day = d.getDate(); const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate())); return U.toDateStr(n); }
    return null;
  }
  // The first repeat date after today (for "Same time next week?").
  function following(rv, now) {
    if (!rv || !rv.nextRepeat || !rv.snoozedUntil) return null;
    const today = U.toDateStr(now || new Date());
    let ds = rv.snoozedUntil, guard = 0;
    do { ds = step(ds, rv.nextRepeat); } while (ds && ds <= today && ++guard < 600);
    return ds;
  }
  // Where the next visit stands: none, upcoming (today or later), or passed (the date went by with no visit since).
  function of(rv, entries, now) {
    if (!rv || !rv.snoozedUntil) return { state: 'none' };
    const today = U.toDateStr(now || new Date());
    const base = { date: rv.snoozedUntil, time: rv.nextTime || null };
    if (rv.snoozedUntil >= today) return Object.assign({ state: rv.snoozedUntil === today ? 'today' : 'upcoming' }, base);
    const t0 = U.parseDateStr(rv.snoozedUntil).getTime();
    const since = (entries || []).some((e) => !e.deletedAt && e.type === 'visit' && new Date(e.at).getTime() >= t0);
    return since ? { state: 'none' } : Object.assign({ state: 'passed' }, base);
  }
  // "Sat, Nov 14 · 10:30 AM" (Today / Tomorrow for the next two days)
  function whenText(ds, time, now) {
    now = now || new Date();
    const t = U.toDateStr(now), tm = U.toDateStr(U.addDays(now, 1));
    const day = ds === t ? 'Today' : ds === tm ? 'Tomorrow' : U.fmtDate(ds, now);
    return day + (time ? ' · ' + fmt12(time) : '');
  }
  // The moment a timed reminder fires, as local "YYYY-MM-DDTHH:MM", or null (none, or the morning list).
  function remindAt(rv) {
    if (!rv || !rv.snoozedUntil || rv.deletedAt || rv.archiveReason) return null;
    const r = remindOf(rv);
    const d = U.parseDateStr(rv.snoozedUntil);
    if (!d) return null;
    if (r.value === 'daybefore') { const p = U.addDays(d, -1); return U.toDateStr(p) + 'T18:00'; }
    if (r.untimed) return null;
    const m = /^(\d{2}):(\d{2})$/.exec(rv.nextTime || '');
    if (!m) return null;
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2] - (r.mins || 0));
    return U.toDateStr(at) + 'T' + pad2(at.getHours()) + ':' + pad2(at.getMinutes());
  }
  // Does this contact's reminder come with the morning list? (the old follow-up reminder)
  const inMorning = (rv) => remindOf(rv).value === 'morning';
  // A day with a likely-home weekday for "Try again …" after a Not Home: the next such day, else a week on.
  function tryAgain(it, now, items) {
    now = now || new Date();
    const best = RV.logic && RV.logic.bestHomeSlot ? RV.logic.bestHomeSlot(it, now, items) : null;
    const dow = best ? best.dow : now.getDay();
    let d = U.addDays(U.startOfDay(now), 1);
    while (d.getDay() !== dow) d = U.addDays(d, 1);
    return U.toDateStr(d);
  }
  const fields = (v) => ({ snoozedUntil: v.date || null, nextTime: v.date && v.time ? v.time : null,
    nextRemind: v.date && v.remind && v.remind !== 'morning' ? v.remind : null, nextRepeat: v.date && v.repeat ? v.repeat : null });

  const api = { REMIND, REPEAT, fmt12, step, following, of, whenText, remindAt, remindLabel, repeatLabel, repeatWord, inMorning, tryAgain, fields };

  // ---------- UI ----------
  if (typeof document !== 'undefined' && RV.dom) {
    const { h, icon } = RV.dom;
    const UI = () => RV.ui, ST = () => RV.store;
    const CLOCK = Array.from({ length: 96 }, (_, i) => { const v = pad2(Math.floor(i / 4)) + ':' + pad2((i % 4) * 15); return { value: v, label: fmt12(v) }; });

    function month(sel, onPick) {
      const today = U.toDateStr(new Date());
      let view = U.parseDateStr(sel || today) || new Date();
      view = new Date(view.getFullYear(), view.getMonth(), 1);
      const box = h('div', { class: 'nvcal' });
      const paint = () => {
        const y = view.getFullYear(), m = view.getMonth();
        const first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < first; i++) cells.push(h('span'));
        for (let d = 1; d <= n; d++) {
          const ds = U.toDateStr(new Date(y, m, d));
          cells.push(h('button', { type: 'button', class: 'nvd' + (ds === sel ? ' sel' : '') + (ds === today ? ' today' : '') + (ds < today ? ' past' : ''),
            disabled: ds < today, 'aria-label': U.fmtDate(ds), 'aria-pressed': String(ds === sel), onclick: () => { sel = ds; paint(); onPick(ds); } }, String(d)));
        }
        box.replaceChildren(
          h('div', { class: 'nvcalh' }, h('b', null, U.MONTHS[m] + ' ' + y),
            h('span', null,
              h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Previous month', onclick: () => { view = new Date(y, m - 1, 1); paint(); } }, icon('left', 18)),
              h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Next month', onclick: () => { view = new Date(y, m + 1, 1); paint(); } }, icon('right', 18)))),
          h('div', { class: 'nvgrid' }, ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => h('span', { class: 'nvdow' }, x)), cells));
      };
      paint();
      return box;
    }

    // The sheet. opts.draft: work on a copy and hand it back (Record a visit, New contact); otherwise it saves.
    function sheet(rvId, opts) {
      opts = opts || {};
      const rv = ST().rvById(rvId) || {};
      const src = opts.draft || { date: rv.snoozedUntil || null, time: rv.nextTime || null, remind: rv.nextRemind || 'morning', repeat: rv.nextRepeat || null };
      const v = { date: src.date || opts.date || null, time: src.time || null, remind: src.remind || 'morning', repeat: src.repeat || null };
      if (!v.date) v.date = opts.date || U.toDateStr(U.addDays(new Date(), 1));
      const had = !!(opts.draft ? opts.draft.date : rv.snoozedUntil);
      let open = opts.open || null; // which row is unfolded: date, time, repeat, remind
      const list = h('div', { class: 'nvlist' });
      const row = (key, label, value, extra) => h('button', { type: 'button', class: 'nvrow' + (open === key ? ' open' : ''), 'aria-expanded': String(open === key),
        onclick: () => { open = open === key ? null : key; paint(); } }, h('span', { class: 'nvk' }, label), h('span', { class: 'nvv' + (open === key ? ' on' : '') }, value), extra || icon(open === key ? 'up' : 'down', 16));
      const choices = (opts2, cur, onPick) => h('div', { class: 'nvopts', role: 'group' }, opts2.map((o) => h('button', { type: 'button', class: 'nvopt', 'aria-pressed': String(o.value === cur),
        onclick: () => { onPick(o.value); open = null; paint(); } }, h('span', { class: 'nvck' }, o.value === cur ? icon('check', 16) : null), h('span', null, o.label, o.sub ? h('small', null, o.sub) : null))));
      // the time wheel; a wheel taken off the page (the sheet redrawing) can report a scroll of 0, so only a wheel
      // still on the page changes the time
      function wheel() {
        if (!(RV.calendar && RV.calendar.vwheel)) return null;
        let w = null;
        w = RV.calendar.vwheel(CLOCK, v.time, (t) => { if (!w || !w.isConnected || !w.dataset.ready) return; v.time = t; const el = list.querySelector('.nvtime .nvv'); if (el) el.textContent = fmt12(t); }, 'Time');
        setTimeout(() => { if (w) w.dataset.ready = '1'; }, 300);
        return h('div', { class: 'nvwheel' }, h('div', { class: 'pk' }, h('div', { class: 'pkband', 'aria-hidden': 'true' }), w));
      }
      function paint() {
        const rem = remindOf({ snoozedUntil: v.date, nextTime: v.time, nextRemind: v.remind });
        const remOpts = REMIND.filter((r) => v.time || r.untimed);
        const timeSw = UI().toggle(!!v.time, (on) => { v.time = on ? v.time || '10:00' : null; open = on ? 'time' : null; if (!on && !rem.untimed) v.remind = 'morning'; paint(); }, 'Set a time');
        list.replaceChildren(...[
          row('date', 'Date', whenText(v.date, null).replace(/ · .*/, '')),
          open === 'date' ? month(v.date, (ds) => { v.date = ds; }) : null,
          h('div', { class: 'nvrow nvtime' }, h('span', { class: 'nvk' }, 'Time'),
            v.time ? h('button', { type: 'button', class: 'nvv' + (open === 'time' ? ' on' : ''), onclick: () => { open = open === 'time' ? null : 'time'; paint(); } }, fmt12(v.time)) : h('span', { class: 'muted' }, 'Any time'),
            timeSw),
          open === 'time' && v.time ? wheel() : null,
          row('repeat', 'Repeat', (REPEAT.find((x) => x.value === v.repeat) || REPEAT[0]).label),
          open === 'repeat' ? choices(REPEAT, v.repeat, (x) => { v.repeat = x; }) : null,
          row('remind', 'Reminder', rem.label),
          open === 'remind' ? choices(remOpts, rem.value, (x) => { v.remind = x; }) : null].filter(Boolean));
      }
      paint();
      UI().sheet(opts.title || 'Next visit', (close) => h('div', { class: 'nvsheet' },
        rv.name ? h('div', { class: 'muted small', style: { marginTop: '-6px', marginBottom: '10px' } }, rv.name) : null,
        list,
        had ? h('button', { type: 'button', class: 'btn nvclear', onclick: () => { done(null); close(); } }, 'Clear next visit') : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => { done(v); close(); } }, 'Save'))));
      function done(val) {
        if (opts.draft || opts.onDone) { if (opts.onDone) opts.onDone(val ? Object.assign({}, val) : null); return; }
        save(rvId, val);
      }
    }
    // Save to the contact, with Undo
    function save(rvId, val) {
      const rv = ST().rvById(rvId);
      if (!rv) return;
      const snap = JSON.parse(JSON.stringify(rv));
      ST().updateRv(rvId, fields(val || {}));
      UI().toast(val && val.date ? 'Next visit ' + whenText(val.date, val.time) : 'Next visit cleared',
        { seconds: 4, actions: [{ label: 'Undo', fn: () => ST().updateRv(rvId, { snoozedUntil: snap.snoozedUntil || null, nextTime: snap.nextTime || null, nextRemind: snap.nextRemind || null, nextRepeat: snap.nextRepeat || null }) }] });
    }
    // The Next visit row in a form (Record a visit, New contact): shows the draft, opens the sheet on it.
    function field(rvId, draft, onChange, label) {
      const box = h('div', { class: 'field' }, h('label', null, label || 'Next visit'));
      const btn = h('button', { type: 'button', class: 'nvfield' });
      const paint = () => {
        btn.replaceChildren(...(draft && draft.date
          ? [h('span', { class: 'grow' }, h('b', null, whenText(draft.date, draft.time)),
              h('small', { class: 'muted' }, [remindOf({ snoozedUntil: draft.date, nextTime: draft.time, nextRemind: draft.remind }).label,
                draft.repeat ? (REPEAT.find((x) => x.value === draft.repeat) || {}).label : null].filter(Boolean).join(' · '))), icon('right', 16)]
          : [h('span', { class: 'grow muted' }, 'Not scheduled'), h('span', { class: 'nvadd' }, '+ Schedule')]));
      };
      btn.onclick = () => sheet(rvId, { draft: draft || { date: null }, onDone: (v) => { draft = v; paint(); onChange(v); } });
      paint();
      box.appendChild(btn);
      box.set = (d) => { draft = d; paint(); };
      return box;
    }
    Object.assign(api, { sheet, save, field });
  }

  RV.next = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
