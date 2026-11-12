/* Groundwork v2.53: the Calendar tab. The month (time recorded, days with visits but no time, planned hours,
   follow-ups), the day sheets, recording time with wheels, My schedule, the time profile, the Bible study tally,
   the report with Copy and Sent, the look back when a month turns, and the card that introduces it all.
   Logic lives in js/service.js (RV.service). */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const { h, icon } = RV.dom;
  const U = RV.util, ST = RV.store, UI = RV.ui, V = RV.service;
  const S = ST.S;
  const DAYS_LONG = U.DAYS;

  const now = () => new Date();
  const todayStr = () => U.toDateStr(now());
  const curMonth = () => V.ym(now());
  const dayTitle = (ds) => { const d = U.parseDateStr(ds); return DAYS_LONG[d.getDay()] + ', ' + U.MONTHS[d.getMonth()] + ' ' + d.getDate(); };
  const shortDay = (ds) => U.fmtDate(ds);
  const hrs = (mins) => { const x = Math.round(mins / 6) / 10; return (x % 1 ? x.toFixed(1) : String(x)) + 'h'; };
  const quietSurprises = () => root.__RV_SURPRISE !== undefined && root.__RV_SVCCARD !== 1; // browser tests set __RV_SURPRISE; they ask for these cards with __RV_SVCCARD = 1
  let filled = null; // a day whose ring just became a dot (the fill plays once)

  // ---------- wheels ----------
  // A vertical wheel: five values showing, fading toward the edges, the chosen one on the band in the middle.
  // Scrolls with momentum and snaps; a tap on a value moves to it; arrow keys work too. Android ticks lightly.
  const ITEM = 34;
  function vwheel(vals, value, onChange, label) {
    let idx = Math.max(0, vals.findIndex((v) => v.value === value));
    const list = h('div', { class: 'vw', role: 'listbox', tabindex: '0', 'aria-label': label });
    vals.forEach((v, i) => list.appendChild(h('div', { class: 'vwi', role: 'option', onclick: () => list.scrollTo({ top: i * ITEM, behavior: 'smooth' }) }, h('span', null, v.label))));
    const paint = () => Array.from(list.children).forEach((c, i) => { const d = Math.abs(i - idx); c.className = 'vwi ' + (d === 0 ? 'r0' : d === 1 ? 'r1' : 'r2'); c.setAttribute('aria-selected', String(d === 0)); });
    const tick = () => { try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) { /* ignore */ } };
    list.addEventListener('scroll', () => {
      const i = Math.max(0, Math.min(vals.length - 1, Math.round(list.scrollTop / ITEM)));
      if (i !== idx) { idx = i; paint(); tick(); onChange(vals[i].value); }
    }, { passive: true });
    list.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const i = Math.max(0, Math.min(vals.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1))); list.scrollTo({ top: i * ITEM }); }
    });
    const place = () => { if (!list.isConnected) { requestAnimationFrame(place); return; } list.scrollTop = idx * ITEM; paint(); };
    requestAnimationFrame(place);
    paint();
    list.value = () => vals[idx].value;
    list.set = (v) => { const i = vals.findIndex((x) => x.value === v); if (i >= 0) { idx = i; list.scrollTop = i * ITEM; paint(); } };
    return list;
  }
  function picker(labels, wheels) {
    return h('div', { class: 'pkg' }, h('div', { class: 'pkl' }, labels.map((l) => h('span', null, l))),
      h('div', { class: 'pk' }, h('div', { class: 'pkband', 'aria-hidden': 'true' }), wheels));
  }
  const fmt12 = (hhmm) => { const n = V.toMin(hhmm); const hh = Math.floor(n / 60); return (hh % 12 || 12) + ':' + V.pad2(n % 60) + ' ' + (hh < 12 ? 'AM' : 'PM'); };
  const CLOCK = Array.from({ length: 96 }, (_, i) => { const v = V.fromMin(i * 15); return { value: v, label: fmt12(v) }; });
  const BREAKS = Array.from({ length: 17 }, (_, i) => ({ value: i * 15, label: V.fmtDur(i * 15) }));
  const HOURS = Array.from({ length: 25 }, (_, i) => ({ value: i, label: i + ' h' }));
  const QUARTERS = [0, 15, 30, 45].map((m) => ({ value: m, label: m + ' m' }));
  const lastMode = () => { try { return localStorage.getItem('rvapp.timeMode') || 'total'; } catch (e) { return 'total'; } };
  const rememberMode = (m) => { try { localStorage.setItem('rvapp.timeMode', m); } catch (e) { /* ignore */ } };
  const blankSession = (mode) => ({ mode: mode || lastMode(), mins: 60, start: '09:00', end: '10:00', brk: 0, credit: false });
  const rangeText = (s) => fmt12(s.start) + '–' + fmt12(s.end);
  const sessionSub = (s) => (s.credit ? 'Credit' : 'Ministry') + (s.mode === 'range' && s.brk ? ' · ' + V.fmtDur(s.brk) + ' break' : '');
  const seg = (opts, cur, onPick, label) => h('div', { class: 'seg cseg', role: 'group', 'aria-label': label },
    opts.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(v === cur), onclick: (e) => { e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); onPick(v); } }, l)));

  // ---------- recording (or planning) a day's time ----------
  // sessions: the day's list (copies). o.plan: editing the plan for that day, not what was recorded.
  function sessionEditor(sessions, onChange, o) {
    o = o || {};
    const box = h('div', { class: 'sessions' });
    const foot = h('div', { class: 'stotal' });
    function totals() { return V.dayTotals(sessions); }
    function refresh() {
      const t = totals();
      Array.from(box.querySelectorAll('.scard')).forEach((card, i) => {
        const s = sessions[i], per = t.per[i] || { mins: 0, overlap: 0 };
        card.querySelector('.ssum').replaceChildren(h('span', { class: 'muted' }, s.mode === 'range' ? rangeText(s) + (s.brk ? ', ' + V.fmtDur(s.brk) + ' break' : '') : (s.credit ? 'Credit' : 'Ministry')), h('b', null, V.fmtDur(per.mins)));
        const warn = card.querySelector('.sovl');
        if (per.overlap) {
          warn.hidden = false;
          warn.replaceChildren(h('span', null, 'Overlaps ' + fmt12(per.overlapFrom) + '–' + fmt12(per.overlapTo) + ' with an earlier session'),
            h('button', { class: 'btn sm', type: 'button', onclick: () => { const f = V.fixOverlap(sessions, i); if (f) { sessions[i] = f; paint(); } } }, 'Fix'));
        } else warn.hidden = true;
      });
      foot.replaceChildren(h('span', null, o.plan ? 'Planned' : 'Day total'),
        h('span', { class: 'r' }, h('b', null, V.fmtDur(t.total)), t.overlap ? h('span', { class: 'muted small' }, V.fmtDur(t.overlap) + ' overlap counted once') : null,
          t.tooLong ? h('span', { class: 'small', style: { color: 'var(--red)' } }, 'A day can’t be more than 24 hours') : null));
      onChange(t);
    }
    function card(s, i) {
      const wheels = s.mode === 'range'
        ? picker(['Start', 'Finish', 'Break'], [
          vwheel(CLOCK, s.start, (v) => { s.start = v; refresh(); }, 'Start'),
          vwheel(CLOCK, s.end, (v) => { s.end = v; refresh(); }, 'Finish'),
          vwheel(BREAKS, +s.brk || 0, (v) => { s.brk = v; refresh(); }, 'Break')])
        : picker(['Hours', 'Minutes'], [
          vwheel(HOURS, Math.floor((+s.mins || 0) / 60), (v) => { s.mins = v * 60 + ((+s.mins || 0) % 60); refresh(); }, 'Hours'),
          vwheel(QUARTERS, Math.round(((+s.mins || 0) % 60) / 15) * 15 % 60, (v) => { s.mins = Math.floor((+s.mins || 0) / 60) * 60 + v; refresh(); }, 'Minutes')]);
      const removable = sessions.length > 1 || o.removable;
      const card = h('div', { class: 'scard' },
        h('div', { class: 'srow' }, seg([['total', 'Total'], ['range', 'Start–finish']], s.mode, (v) => { s.mode = v; rememberMode(v); if (v === 'range' && !s.start) Object.assign(s, { start: '09:00', end: '10:00' }); paint(); }, 'How to enter the time'),
          sessions.length > 1 || o.removable ? h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove session', onclick: () => { sessions.splice(i, 1); paint(); } }, icon('x', 18)) : null),
        seg([[false, 'Ministry'], [true, 'Credit']], !!s.credit, (v) => { s.credit = v; refresh(); }, 'Ministry or credit'),
        wheels,
        h('div', { class: 'ssum' }),
        h('div', { class: 'sovl', hidden: true }));
      // v2.55: a session swipes left to Remove, like its ×
      return removable && RV.swipe ? RV.swipe.row(card, { actions: [{ label: 'Remove', icon: 'x', kind: 'danger', fn: () => { sessions.splice(i, 1); paint(); } }] }) : card;
    }
    function paint() {
      box.replaceChildren(...sessions.map(card),
        h('button', { class: 'link sadd', type: 'button', onclick: () => { sessions.push(blankSession()); paint(); } }, icon('plus', 16), 'Add session'));
      refresh();
    }
    paint();
    return { el: h('div', null, box, foot), totals };
  }

  // Changing a month whose report is marked Sent: say so once, then keep a quiet line in that month's history.
  async function guardSent(m, fn) {
    const r = V.monthRec(V.data(), m);
    if (!r || !r.sent) { fn(); return true; }
    const ok = await UI.confirmDialog({ title: V.monthName(m) + '’s report is marked sent', message: 'Changing it may not match your publisher record card.', confirmText: 'Change anyway' });
    if (!ok) return false;
    const before = V.summaryLine(m);
    fn();
    const after = V.summaryLine(m);
    if (after !== before) V.addHistory(m, before + ' → ' + after + ', after the report was sent');
    return true;
  }

  // v2.59: save a day's sessions (the sheet and the day card)
  async function saveTime(ds, sessions, t, wasRing) {
    if (t && t.tooLong) { UI.toast('A day can’t be more than 24 hours.'); return false; }
    const list = sessions.filter((s) => V.sessionMins(s) > 0).map((s) => ({ id: s.id, mode: s.mode, mins: s.mins, start: s.start, end: s.end, brk: s.brk, credit: !!s.credit }));
    const done = await guardSent(V.monthOf(ds), () => { if (wasRing && list.length) filled = ds; V.saveDay(ds, list); });
    if (!done) { filled = null; return false; }
    UI.toast(list.length ? V.fmtDur(V.dayTotals(list).total) + ' recorded for ' + shortDay(ds) : 'Time removed for ' + shortDay(ds));
    return true;
  }
  function timeSheet(ds, o) {
    o = o || {};
    const plan = !!o.plan, svc = V.svc();
    const sessions = (plan ? V.plannedFor(svc, ds) : V.times(ds)).map((s) => Object.assign({}, s));
    const had = sessions.length > 0;
    if (!sessions.length || o.add) sessions.push(blankSession());
    const wasRing = !plan && V.ringDays(V.data(), V.monthOf(ds), now()).includes(ds);
    let t = null;
    const ed = sessionEditor(sessions, (x) => { t = x; }, { plan, removable: had });
    UI.sheet((plan ? 'Plan · ' : 'Time · ') + shortDay(ds), (close) => h('div', { class: 'timesheet' }, ed.el,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          if (t && t.tooLong) { UI.toast('A day can’t be more than 24 hours.'); return; }
          const list = sessions.filter((s) => V.sessionMins(s) > 0).map((s) => ({ id: s.id, mode: s.mode, mins: s.mins, start: s.start, end: s.end, brk: s.brk, credit: !!s.credit }));
          if (plan) { V.setOverride(ds, list.map((s) => { const c = Object.assign({}, s); delete c.id; return c; })); close(); UI.toast('Plan changed for ' + shortDay(ds)); return; }
          if (!(await saveTime(ds, sessions, t, wasRing))) return;
          close();
          if (o.after) o.after();
        } }, 'Save'))));
  }

  // ---------- picking a contact (Plan a visit) ----------
  function contactPicker(title, onPick) {
    const items = ST.items().filter((it) => it.att.state !== 'closed').sort((a, b) => U.cmp(a.rv.name, b.rv.name));
    const q = h('input', { type: 'search', placeholder: 'Search name, address…', 'aria-label': 'Search contacts', autocomplete: 'off' });
    const box = h('div', { class: 'tlpick' });
    let closeIt = null;
    const paint = () => {
      const t = q.value.trim().toLowerCase();
      const hits = t ? items.filter((it) => [it.rv.name, it.rv.address, it.rv.neighborhood].some((x) => String(x || '').toLowerCase().includes(t))) : items;
      box.replaceChildren(...hits.map((it) => h('button', { class: 'tlpk', type: 'button', onclick: () => { onPick(it.rv); if (closeIt) closeIt(); } },
        h('span', { class: 'm' }, h('span', null, it.rv.name), h('span', { class: 'muted small' }, [it.rv.address, it.rv.neighborhood].filter(Boolean).join(' · '))))));
      if (!hits.length) box.appendChild(h('div', { class: 'muted small', style: { padding: '12px 4px' } }, t ? 'Nobody matches that search.' : 'No contacts yet.'));
    };
    q.addEventListener('input', paint);
    paint();
    UI.sheet(title, (close) => { closeIt = close; return h('div', { class: 'tladdsheet' }, q, box); });
  }
  function planVisit(ds) {
    if (ds === todayStr()) { RV.screens.todayAddSheet(); return; }
    contactPicker('Plan a visit · ' + shortDay(ds), (rv) => {
      const res = ST.snooze(rv.id, ds);
      UI.toast('Follow up with ' + String(rv.name || '').split(' ')[0] + ' on ' + shortDay(ds), { actions: [{ label: 'Undo', fn: res.undo }], seconds: 4 });
    });
  }

  // ---------- the day card (v2.59: under the month, like a calendar app; was a bottom sheet) ----------
  const KIND_WORD = { visit: 'Visit', study: 'Study', nh: 'Not home', new: 'New contact' };
  let sel = null; // the day the card shows; the Calendar opens on today
  // Kept for callers (the ring card, tests): show that day's card
  function daySheet(ds) {
    sel = ds;
    const m = V.monthOf(ds), want = m === curMonth() ? '#/calendar' : '#/calendar/' + m;
    if (location.hash !== want) location.hash = want;
    else if (RV.app && RV.app.render) RV.app.render();
    else window.dispatchEvent(new HashChangeEvent('hashchange'));
    setTimeout(() => { const c = document.querySelector('.daycard'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60);
  }
  function dayCard(D, ds, step) {
    const svc = V.svcOf(D.settings), m = V.monthOf(ds), p = V.profileFor(svc, m), keeps = V.tracks(p);
    const today = todayStr(), future = ds > today;
    const recs = V.activity(D, {}).get(ds) || [];
    const sess = V.times(ds);
    const live = (V.activity(D, { live: true }).get(ds) || []).length > 0;
    const cleared = !!(svc.cleared || {})[ds];
    const ring = !future && keeps && V.ringDays(D, m, now()).includes(ds);
    const lab = (t) => h('div', { class: 'dlab' }, t);
    const rowBtn = (main, sub, right, fn, href) => h(href ? 'a' : 'button', Object.assign({ class: 'drow' }, href ? { href } : { type: 'button', onclick: fn }),
      h('span', { class: 'dm' }, h('span', null, main), sub ? h('span', { class: 'muted small' }, sub) : null), right || null);
    const addRow = (label, fn) => h('button', { class: 'dadd', type: 'button', onclick: fn }, icon('plus', 16), label);
    const inDays = Math.round((U.parseDateStr(ds) - U.parseDateStr(today)) / 864e5);
    const sub = ds === today ? 'Today' : ring ? 'Visits recorded, no time added' : inDays === 1 ? 'Tomorrow' : inDays === -1 ? 'Yesterday' : future ? 'In ' + inDays + ' days' : '';
    const kids = [h('div', { class: 'dchead' },
      h('div', { class: 'dct' }, h('b', null, dayTitle(ds)), sub ? h('span', { class: 'muted small' }, sub) : null),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Previous day', onclick: () => step(-1) }, icon('left', 18)),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Next day', onclick: () => step(1) }, icon('right', 18)))];
    if (!future) {
      // Time: the editor right here when nothing is recorded; the sessions as rows once there are
      if (keeps) {
        kids.push(lab(sess.length ? 'Time · ' + V.fmtDur(V.dayTotals(sess).total) : 'Time'));
        if (sess.length) {
          kids.push(...sess.map((s) => rowBtn(s.mode === 'range' ? rangeText(s) : 'Total', sessionSub(s), h('b', null, V.fmtDur(V.sessionMins(s))), () => timeSheet(ds))),
            addRow('Add session', () => timeSheet(ds, { add: true })));
        } else if (cleared) {
          kids.push(h('button', { class: 'link dclear', type: 'button', onclick: () => { V.clearDay(ds, false); UI.toast('Marked as a service day again'); } }, 'Marked no service · Undo'));
        } else {
          const sessions = [blankSession()];
          let t = null;
          const ed = sessionEditor(sessions, (x) => { t = x; }, {});
          kids.push(h('div', { class: 'timesheet dtime' }, ed.el,
            h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => saveTime(ds, sessions, t, ring) }, 'Save'))),
            live ? h('button', { class: 'link dclear', type: 'button', onclick: () => { V.clearDay(ds, true); UI.toast('Marked: no service this day', { actions: [{ label: 'Undo', fn: () => V.clearDay(ds, false) }] }); } }, 'No service this day') : null);
        }
      }
      // Visits: what was recorded that day (visits and Not homes); + Record a visit records one for this day
      kids.push(lab('Visits'), ...recs.map((r) => h('a', { class: 'drow', href: '#/rv/' + r.rvId },
        h('span', { class: 'dt' }, U.fmtTime(new Date(r.at)).replace(/ (AM|PM)$/, '')),
        h('span', { class: 'dpip ' + (r.kind === 'nh' ? 'nh' : ''), 'aria-hidden': 'true' }),
        h('span', { class: 'dm' }, h('span', null, r.name), h('span', { class: 'muted small' }, KIND_WORD[r.kind] + (r.text ? ' · ' + r.text.slice(0, 48) + (r.text.length > 48 ? '…' : '') : ''))))),
        addRow('Record a visit', () => contactPicker('Record a visit · ' + shortDay(ds), (rv) => {
          const at = ds === today ? new Date() : new Date(U.parseDateStr(ds).getTime() + 12 * 36e5);
          setTimeout(() => RV.forms.visitDialog(rv.id, { at: at.toISOString() }), 50);
        })));
    } else if (keeps) {
      const plan = V.plannedFor(svc, ds);
      kids.push(lab('Planned time' + (plan.length ? ' · ' + V.fmtDur(V.dayTotals(plan).total) : '')));
      kids.push(...(plan.length ? plan.map((s) => rowBtn(s.mode === 'range' ? rangeText(s) : 'Planned', (s.credit ? 'Credit' : 'Ministry') + (svc.overrides && svc.overrides[ds] ? ' · this day only' : s.repeat === 'other' ? ' · every other week' : s.repeat === 'weeks' ? ' · ' + (s.weeks || []).map(V.ordinal).join(' and ') + ' ' + DAYS_LONG[U.parseDateStr(ds).getDay()] : ' · every week') + ' · tap to change this day', h('b', null, V.fmtDur(V.sessionMins(s))), () => timeSheet(ds, { plan: true })))
        : [h('div', { class: 'muted small dhint' }, 'Nothing planned.'), addRow('Plan time for this day', () => timeSheet(ds, { plan: true }))]));
    }
    // Scheduled: next visits on this day, by time (any time last)
    const fus = ST.items().filter((it) => it.att.state !== 'closed' && it.rv.snoozedUntil === ds)
      .sort((a, b) => (a.rv.nextTime || '99') < (b.rv.nextTime || '99') ? -1 : (a.rv.nextTime || '99') > (b.rv.nextTime || '99') ? 1 : U.cmp(a.rv.name, b.rv.name));
    kids.push(lab('Scheduled'), ...fus.map((it) => h('a', { class: 'drow', href: '#/rv/' + it.rv.id },
      h('span', { class: 'dt' + (it.rv.nextTime ? '' : ' any') }, it.rv.nextTime && RV.next ? RV.next.fmt12(it.rv.nextTime) : 'Any time'),
      h('span', { class: 'dm' }, h('span', null, it.rv.name), h('span', { class: 'muted small' }, it.rv.nextStart && RV.logic.isStudyStage(S.settings, it.rv.stage) ? 'Next lesson: ' + it.rv.nextStart : it.rv.whatsNext ? 'Bring up: ' + it.rv.whatsNext : '')),
      icon('right', 16))),
      ds >= today ? addRow('Schedule a visit', () => contactPicker('Schedule a visit · ' + shortDay(ds), (rv) => setTimeout(() => RV.next.sheet(rv.id, { date: ds }), 50))) : null);
    const card = h('section', { class: 'ccard daycard daysheet' }, kids.filter(Boolean));
    // swipe the card for the next or previous day (the month grid keeps its own swipe for months)
    if (RV.swipe) RV.swipe.pager(card, { left: () => step(1), right: () => step(-1),
      drag: (dx, done) => { card.style.transition = done ? 'transform .2s ease' : 'none'; card.style.transform = dx ? 'translateX(' + Math.max(-60, Math.min(60, dx / 2)) + 'px)' : ''; } });
    return card;
  }

  // ---------- report ----------
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back */ }
    try { const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } }); document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
  }
  async function copyReport(m) {
    const ok = await copyText(V.reportText(V.data(), m));
    UI.toast(ok ? V.monthName(m) + ' report copied' : 'Couldn’t copy. Try again.');
  }
  function sentBox(m) {
    const r = V.monthRec(V.data(), m);
    return h('label', { class: 'sentbox' }, h('input', { type: 'checkbox', checked: !!(r && r.sent), onchange: (e) => V.setSent(m, e.target.checked) }), 'Sent');
  }
  async function editComments(m) {
    const r = V.monthRec(V.data(), m);
    const v = await UI.textPrompt({ title: 'Comments for ' + V.monthName(m), value: (r && r.comments) || '', placeholder: 'e.g. Circuit assembly weekend', multiline: true, okText: 'Save' });
    if (v != null) V.patchMonth(m, { comments: v.trim() });
  }
  function reportCard(m) {
    const D = V.data(), p = V.profileFor(V.svcOf(D.settings), m), st = V.monthStats(D, m), sd = V.studies(D, m), r = V.monthRec(D, m);
    const sub = (V.hoursReported(p) ? st.hours + ' h' + (st.credit ? ' · ' + st.credit + ' h credit' : '') : V.shared(D, m) ? 'Shared in the ministry' : 'No activity recorded') + ' · ' + sd.count + (sd.count === 1 ? ' study' : ' studies');
    return h('section', { class: 'ccard crep' },
      h('div', { class: 'crow' }, h('div', { class: 'cm' }, h('b', null, V.monthName(m) + ' report'), h('span', { class: 'muted small' }, sub)),
        h('div', { class: 'crepb' }, h('button', { class: 'btn sm', type: 'button', onclick: () => copyReport(m) }, 'Copy'), sentBox(m))),
      h('button', { class: 'link ccom', type: 'button', onclick: () => editComments(m) }, r && r.comments ? 'Comments: ' + r.comments : 'Add comments'),
      r && (r.history || []).length ? h('details', { class: 'chist' }, h('summary', null, 'History'), (r.history || []).slice().reverse().map((x) => h('div', { class: 'muted small' }, U.fmtDate(x.at) + ' · ' + x.text))) : null);
  }

  // ---------- the month ----------
  const leaf = () => { const t = document.createElement('template'); t.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 13c0-5-3.5-8-9-8 0 5 3.5 8 9 8z" fill="currentColor"/><path d="M12 15c0-4.5 3-7 8-7 0 4.5-3 7-8 7z" fill="currentColor" opacity=".7"/></svg>'; return t.content.firstChild; };
  function paceCard(D, m, p) {
    const st = V.monthStats(D, m), goal = V.goalOf(p), pc = V.pace(D, m, now());
    const reached = goal && st.shown >= goal * 60;
    const parts = [];
    if (st.crMins) parts.push(V.fmtDur(st.crMins) + ' credit');
    if (st.carryS || st.carryC) parts.push(V.fmtDur(st.carryS + st.carryC) + ' carried from ' + V.monthName(V.addMonths(m, -1)));
    const max = goal ? goal * 60 : Math.max(pc, st.shown, 1);
    const w1 = Math.min(100, st.shown / max * 100), w2 = Math.max(0, Math.min(100 - w1, (pc - st.shown) / max * 100));
    return h('section', { class: 'ccard cpace' + (reached ? ' reached' : '') },
      h('div', { class: 'cbig' }, h('b', null, V.fmtDur(st.shown)), h('span', { class: 'muted' }, m === curMonth() ? 'this month' : 'in ' + V.monthName(m))),
      h('div', { class: 'cbar', role: 'img', 'aria-label': V.fmtDur(st.shown) + ' recorded' + (goal ? ' of ' + goal + ' hours' : '') }, h('i', { class: 'rec', style: { width: (reached ? 100 : w1) + '%' } }), reached ? null : h('i', { class: 'pl', style: { width: w2 + '%' } })),
      h('div', { class: 'crow small' },
        reached ? h('span', { class: 'cgood' }, leaf(), 'Goal reached')
          : m >= curMonth() && pc > st.shown ? h('span', { class: 'cgood' }, 'On pace for ' + Math.floor(pc / 60) + ' h') : h('span'),
        goal ? h('span', { class: 'muted' }, 'Goal ' + goal + ' h') : null),
      parts.length ? h('div', { class: 'muted small' }, 'Includes ' + parts.join(' and ') + '.') : null);
  }
  function ringCard(D, m) {
    const cur = curMonth(), today = todayStr();
    if (m !== cur) return null;
    const days = V.ringDays(D, V.addMonths(cur, -1), now()).concat(V.ringDays(D, cur, now())).filter((d) => d < today);
    if (!days.length) return null;
    const el = h('section', { class: 'ccard cring' },
      h('div', { class: 'crow' }, h('span', { class: 'cringt' }, h('i', { class: 'ringi', 'aria-hidden': 'true' }), 'Visits recorded, no time added'),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Hide for now', onclick: () => el.remove() }, icon('x', 16))),
      h('div', { class: 'cchips' }, days.map((d) => h('button', { class: 'cchip', type: 'button', onclick: () => daySheet(d) }, shortDay(d)))));
    if (RV.swipe) RV.swipe.dismiss(el, () => el.remove()); // v2.55: same as ×
    return el;
  }
  function monthCard(D, m, selDs, onPick) {
    const svc = V.svcOf(D.settings), p = V.profileFor(svc, m), keeps = V.tracks(p);
    const today = todayStr(), [y, mo] = [+m.slice(0, 4), +m.slice(5, 7)];
    const days = V.dayMap(D.times), all = V.activity(D, {}), rings = new Set(V.ringDays(D, m, now()));
    const fu = new Map();
    ST.items().forEach((it) => { if (it.att.state !== 'closed' && it.rv.snoozedUntil && V.monthOf(it.rv.snoozedUntil) === m) fu.set(it.rv.snoozedUntil, (fu.get(it.rv.snoozedUntil) || 0) + 1); });
    const r = V.monthRec(D, m);
    const first = new Date(y, mo - 1, 1).getDay();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(h('span', { class: 'cday blank', 'aria-hidden': 'true' }));
    for (let d = 1; d <= V.daysIn(m); d++) {
      const ds = V.dayStr(m, d);
      const t = V.dayTotals(days.get(ds) || []).total;
      const act = (all.get(ds) || []).length;
      let mark = null, what = [];
      if (keeps && t) { mark = h('span', { class: 'cdot' + (filled === ds ? ' fillin' : '') }); what.push(V.fmtDur(t) + ' recorded'); }
      else if (rings.has(ds)) { mark = h('span', { class: 'cringm' }); what.push('visits recorded, no time'); }
      else if (!keeps && act) { mark = h('span', { class: 'cdot' }); what.push('visits recorded'); }
      else if (act && (svc.cleared || {})[ds]) { mark = h('span', { class: 'cdot grey' }); what.push('no service this day'); }
      else if (keeps && ds >= today && !t) { const pl = V.planMins(svc, ds); if (pl) { mark = h('span', { class: 'cplan' }, hrs(pl)); what.push(V.fmtDur(pl) + ' planned'); } }
      const n = fu.get(ds);
      if (n) what.push(n + (n === 1 ? ' follow-up' : ' follow-ups'));
      cells.push(h('button', { class: 'cday' + (ds === today ? ' today' : '') + (ds === selDs ? ' sel' : ''), type: 'button', 'data-day': ds, 'aria-pressed': String(ds === selDs), 'aria-label': dayTitle(ds) + (what.length ? ': ' + what.join(', ') : ''), onclick: () => (onPick ? onPick(ds) : daySheet(ds)) },
        h('span', { class: 'cn' }, String(d)), mark,
        n ? h('span', { class: 'cfu', 'aria-hidden': 'true' }, icon('user1', 9), n > 1 ? String(n) : null) : null));
    }
    if (filled) setTimeout(() => { filled = null; }, 0);
    const grid = h('div', { class: 'cgrid' }, cells);
    // v2.55: swipe the month left or right to change month
    if (RV.swipe) RV.swipe.pager(grid, { left: () => { location.hash = '#/calendar/' + V.addMonths(m, 1); }, right: () => { location.hash = '#/calendar/' + V.addMonths(m, -1); },
      drag: (dx, done) => { grid.style.transition = done ? 'transform .2s ease' : 'none'; grid.style.transform = dx ? 'translateX(' + Math.max(-60, Math.min(60, dx / 2)) + 'px)' : ''; } });
    return h('section', { class: 'ccard cmonth' },
      h('div', { class: 'cmhead' },
        h('a', { class: 'iconbtn cnav', href: '#/calendar/' + V.addMonths(m, -1), 'aria-label': 'Previous month' }, icon('left', 18)),
        h('div', { class: 'cmt' }, h('b', null, V.monthLabel(m)), r && r.sent ? h('span', { class: 'cstamp' }, icon('check', 12), 'Sent ' + U.MONTHS[new Date(r.sentAt || Date.now()).getMonth()] + ' ' + new Date(r.sentAt || Date.now()).getDate()) : null),
        h('a', { class: 'iconbtn cnav', href: '#/calendar/' + V.addMonths(m, 1), 'aria-label': 'Next month' }, icon('right', 18))),
      h('div', { class: 'cwk', 'aria-hidden': 'true' }, ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => h('span', null, x))),
      grid,
      m !== curMonth() ? h('a', { class: 'link ctoday', href: '#/calendar' }, 'Back to this month') : null);
  }
  function studiesCard(D, m) {
    const sd = V.studies(D, m);
    if (!sd.people.length && !sd.adj && m > curMonth()) return null;
    const adj = (d) => guardSent(m, () => { const r = V.monthRec(V.data(), m); V.patchMonth(m, { adjStudies: Math.max(-sd.people.length, ((r && +r.adjStudies) || 0) + d) }); });
    return h('section', { class: 'ccard cstudy' },
      h('div', { class: 'crow' }, h('div', { class: 'cm' }, h('b', null, 'Bible studies'), sd.adj ? h('span', { class: 'muted small' }, 'Includes ' + Math.abs(sd.adj) + (sd.adj > 0 ? ' added' : ' taken off') + ' by hand') : null),
        h('div', { class: 'cpm' }, h('button', { class: 'pm', type: 'button', 'aria-label': 'One fewer study', disabled: sd.count <= 0, onclick: () => adj(-1) }, '−'), h('b', null, String(sd.count)), h('button', { class: 'pm', type: 'button', 'aria-label': 'One more study', onclick: () => adj(1) }, '+'))),
      sd.people.map((x) => h('a', { class: 'crow cperson', href: '#/rv/' + x.rvId }, h('span', null, x.name),
        x.nth ? h('span', { class: 'cnth' }, V.ordinal(x.nth) + ' study') : h('span', { class: 'muted small' }, x.month + ' this month'))));
  }
  // ---------- the service year (v2.54) ----------
  // A ring: recorded solid green, the plan light green behind it, on the track.
  function yearRing(recMins, paceMins, goalH) {
    const r = 70, c = 2 * Math.PI * r, g = goalH * 60;
    const a = Math.min(1, recMins / g) * c, b = Math.min(1, Math.max(recMins, paceMins) / g) * c;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 168 168'); svg.setAttribute('class', 'yring'); svg.setAttribute('aria-hidden', 'true');
    const arc = (cls, len) => { const e = document.createElementNS(NS, 'circle'); e.setAttribute('cx', '84'); e.setAttribute('cy', '84'); e.setAttribute('r', String(r)); e.setAttribute('class', cls);
      if (len != null) { e.setAttribute('stroke-dasharray', len.toFixed(1) + ' ' + c.toFixed(1)); e.setAttribute('transform', 'rotate(-90 84 84)'); if (len < 0.5) e.style.display = 'none'; } svg.appendChild(e); };
    arc('trk'); arc('pl', b); arc('rec', a);
    return h('div', { class: 'yringw', role: 'img', 'aria-label': Math.floor(recMins / 60) + ' of ' + goalH + ' hours recorded' + (paceMins > recMins ? ', on pace for ' + Math.floor(paceMins / 60) : '') }, svg,
      h('div', { class: 'yrc' }, h('b', null, Math.floor(recMins / 60) + ' h'), h('span', { class: 'muted' }, 'of ' + goalH)));
  }
  function openMonth(x) {
    const cur = curMonth();
    const hasDays = V.dayMap(V.data().times); let any = false; for (const d of hasDays.keys()) if (V.monthOf(d) === x) { any = true; break; }
    if (x < cur && !any) { pastMonthSheet(x); return; }
    location.hash = '#/calendar/' + x;
  }
  // A month before Groundwork: its total on two wheels, stored as the month's adjustment (no days to conflict with).
  const BIG = Array.from({ length: 151 }, (_, i) => ({ value: i, label: i + ' h' }));
  function pastMonthSheet(x) {
    const D = V.data(), r = V.monthRec(D, x);
    const h0 = Math.floor(((r && +r.adjMins) || 0) / 60), c0 = Math.floor(((r && +r.adjCredit) || 0) / 60);
    let hv = h0, cv = c0, saved = false;
    const commit = async () => {
      if (saved || (hv === h0 && cv === c0)) return true;
      const ok = await guardSent(x, () => V.patchMonth(x, { adjMins: hv * 60, adjCredit: cv * 60 }));
      if (ok) saved = true;
      return ok;
    };
    const sent = h('input', { type: 'checkbox', checked: !!(r && r.sent), onchange: async (e) => { const on = e.target.checked; if (on) await commit(); V.setSent(x, on); } });
    UI.sheet(V.monthLabel(x), () => h('div', { class: 'pastm' },
      h('div', { class: 'muted small dsub' }, 'No days recorded in Groundwork'),
      picker(['Hours', 'Credit'], [vwheel(BIG, h0, (v) => { hv = v; }, 'Hours'), vwheel(BIG, c0, (v) => { cv = v; }, 'Credit')]),
      h('div', { class: 'crow pastrep' }, h('b', null, V.monthName(x) + ' report'), h('label', { class: 'sentbox' }, sent, 'Sent'))),
    { noFocus: true, onClose: () => { commit(); } });
  }
  function yearCard(D, m, p) {
    if (p.kind === 'publisher' || p.kind === 'aux') return null;
    const y = V.yearOf(D, m, now()), ym1 = V.yearMonths(D, m, now()), cur = curMonth();
    const goalH = y.goalH;
    const inYear = cur >= y.start && cur <= V.addMonths(y.start, 11);
    const det = h('section', { class: 'ccard cyear' });
    const goalMonth = V.goalOf(p) ? V.goalOf(p) * 60 : 0;
    const top = Math.max(goalMonth * 1.25, ...ym1.months.map((x) => x.rec + x.plan), 60);
    const bars = h('div', { class: 'ybars' }, ym1.months.map((x) => {
      const rh = x.rec / top * 100, ph = x.plan / top * 100;
      return h('button', { class: 'ycol' + (x.cur ? ' cur' : ''), type: 'button', 'aria-label': V.monthLabel(x.m) + ': ' + V.fmtDur(x.rec) + ' recorded' + (x.plan ? ', ' + V.fmtDur(x.plan) + ' expected' : ''), onclick: () => openMonth(x.m) },
        h('span', { class: 'yv' }, x.rec ? String(Math.floor(x.rec / 60)) : ''),
        h('span', { class: 'ybar' }, ph > 0.5 ? h('i', { class: 'pl', style: { height: ph + '%' } }) : null, rh > 0.5 ? h('i', { class: 'rec', style: { height: rh + '%' } }) : null),
        h('span', { class: 'yml' }, V.monthName(x.m).slice(0, 3)));
    }));
    const li = (a, b) => h('div', { class: 'yli' }, h('span', { class: 'muted' }, a), h('b', null, b));
    const ry = V.reviewYear(D, now()); // v2.54.1: from August's Sent until September's
    det.append(
      h('h3', { class: 'yhead' }, 'Service year ' + y.label),
      h('div', { class: 'ybody' },
        goalH ? h('div', { class: 'yhero' }, yearRing(y.mins, inYear ? y.paceMins : y.mins, goalH), inYear && y.paceMins > y.mins ? h('span', { class: 'cgood' }, 'On pace for ' + Math.floor(y.paceMins / 60) + ' h') : y.mins >= goalH * 60 ? h('span', { class: 'cgood' }, leaf(), 'Goal reached') : null)
          : h('div', { class: 'cbig' }, h('b', null, Math.floor(y.mins / 60) + ' h'), h('span', { class: 'muted' }, 'this service year')),
        bars,
        h('div', { class: 'ykey' }, h('span', null, h('i', { class: 'rec' }), 'Recorded'), h('span', null, h('i', { class: 'pl' }), 'Expected')),
        h('div', { class: 'ylist' },
          y.avgMins != null ? li('Monthly average', Math.round(y.avgMins / 60) + ' h') : null,
          ym1.credit ? li('Credit', Math.floor(ym1.credit / 60) + ' h') : null,
          inYear && ym1.carry ? li('Carried into ' + V.monthName(cur), V.fmtDur(ym1.carry)) : null),
        h('p', { class: 'muted small ynote' }, 'Tap a month to open it. This month uses My schedule; later months use your monthly average.'),
        ry && RV.review ? h('button', { class: 'yrev', type: 'button', onclick: () => RV.review.open(ry) },
          h('span', { class: 'yrevpot', 'aria-hidden': 'true' }, RV.review.pot(40)), h('b', null, 'Your ' + V.yearLabel(ry) + ' in review'), icon('right', 18)) : null));
    return det;
  }

  // ---------- profile ----------
  const PICKS = [['pioneer', 'Regular pioneer'], ['caux', 'Continuous auxiliary'], ['publisher', 'Publisher'], ['other', 'Other goal']];
  function choose(kind) {
    if (kind === 'other') { V.setProfile({ kind: 'publisher', track: false }); location.hash = '#/calendar/profile'; return; }
    V.setProfile(kind === 'publisher' ? { kind, track: false } : { kind });
  }
  function setupCard() {
    return h('section', { class: 'ccard csetup' },
      h('h2', null, 'How do you report?'),
      PICKS.map(([k, l]) => h('button', { class: 'btn block', type: 'button', onclick: () => choose(k) }, l)),
      h('div', { class: 'muted small' }, 'Auxiliary pioneering? Add your months from the badge once you’ve chosen.'));
  }
  function profileSheet() {
    const D = V.data(), m = curMonth(), p = V.profileFor(V.svcOf(D.settings), m), y = V.yearOf(D, m, now()), goal = V.goalOf(p);
    let credit = 0; for (let i = 0; i < 12; i++) { const x = V.addMonths(y.start, i); if (x <= m) credit += V.monthRaw(D, x).cr; }
    const row = (a, b) => h('div', { class: 'drow static' }, h('span', { class: 'muted' }, a), h('b', null, b));
    UI.sheet(V.badge(p, m), (close) => h('div', { class: 'daysheet' },
      goal ? row('Goal', goal + ' h a month' + (p.kind === 'pioneer' ? ' · 600 h a year' : '')) : row('Time', V.tracks(p) ? 'Kept, no goal' : 'Not kept'),
      V.tracks(p) ? row('This service year', Math.floor(y.mins / 60) + ' h') : null,
      V.tracks(p) && credit ? row('Credit this year', Math.floor(credit / 60) + ' h') : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { close(); location.hash = '#/calendar/profile'; } }, 'Edit'))), { noFocus: true });
  }
  function profilePage() {
    const svc = V.svc(), m = curMonth(), cur = V.profileFor(svc, m), base = cur.kind === 'aux' ? cur.base : cur;
    let kind = base.kind || 'publisher', track = !!base.track, goal = +base.goal || 60;
    const s0 = V.yearStart(m);
    const auxSel = new Set(Object.keys(svc.aux || {}).filter((k) => k >= m));
    let auxGoal = +((svc.aux || {})[[...auxSel][0]] || 30);
    const box = h('div', { class: 'cprof' });
    function paint() {
      const opt = (k, label, sub, extra) => h('div', { class: 'ccard popt' + (kind === k ? ' on' : '') },
        h('button', { class: 'poptb', type: 'button', 'aria-pressed': String(kind === k), onclick: () => { kind = k; paint(); } }, h('span', { class: 'rad', 'aria-hidden': 'true' }), h('b', null, label), sub ? h('span', { class: 'muted small' }, sub) : null),
        kind === k && extra ? extra : null);
      const months = h('div', { class: 'amonths' }, Array.from({ length: 12 }, (_, i) => V.addMonths(s0, i)).concat(Array.from({ length: 12 }, (_, i) => V.addMonths(s0, 12 + i))).filter((x) => x >= m).slice(0, 12).map((x) =>
        h('button', { class: 'amo' + (auxSel.has(x) ? ' on' : ''), type: 'button', 'aria-pressed': String(auxSel.has(x)), onclick: () => { if (auxSel.has(x)) auxSel.delete(x); else auxSel.add(x); paint(); } }, V.monthName(x).slice(0, 3))));
      box.replaceChildren(
        opt('pioneer', 'Regular pioneer', '50 h a month'),
        opt('caux', 'Continuous auxiliary', '30 h a month'),
        opt('publisher', 'Publisher', null, h('div', { class: 'switchrow' }, h('div', { class: 'grow' }, 'Keep track of my time'), UI.toggle(track, (v) => { track = v; }, 'Keep track of my time'))),
        opt('other', 'Other goal', 'Its own monthly goal', picker(['Hours a month'], [vwheel(Array.from({ length: 150 }, (_, i) => ({ value: i + 1, label: (i + 1) + ' h' })), goal, (v) => { goal = v; }, 'Hours a month')])),
        kind === 'publisher' ? h('section', { class: 'ccard' },
          h('div', { class: 'crow' }, h('b', null, 'Auxiliary pioneer months'), h('span', { class: 'muted small' }, 'Next 12 months')),
          months,
          h('div', { class: 'crow' }, h('span', null, 'Hours a month'), seg([[15, '15'], [30, '30']], auxGoal, (v) => { auxGoal = v; }, 'Hours a month')),
          h('div', { class: 'muted small' }, 'Only these months. Time is always kept in auxiliary months, even with time tracking off.')) : null,
        h('button', { class: 'btn primary block', type: 'button', onclick: () => {
          V.setProfile(kind === 'publisher' ? { kind, track } : kind === 'other' ? { kind, goal } : { kind });
          V.setAux(kind === 'publisher' ? [...auxSel] : [], auxGoal);
          location.hash = '#/calendar';
        } }, 'Done'));
    }
    paint();
    return { title: 'How do you report?', back: '#/calendar', el: box, noRerender: true };
  }

  // ---------- My schedule ----------
  function planSessionSheet(day, i) {
    const svc = V.svc(), list = ((svc.pattern || {})[day] || []).map((s) => Object.assign({}, s));
    const editing = i != null && list[i];
    const s = editing ? list[i] : Object.assign(blankSession(), { repeat: 'every' });
    const one = [s];
    const ed = sessionEditor(one, () => {}, { plan: true });
    const thisWeek = U.toDateStr(U.addDays(U.startOfDay(now()), (day - now().getDay() + 7) % 7));
    const nextWeek = U.toDateStr(U.addDays(U.parseDateStr(thisWeek), 7));
    const weeksBox = h('div', { class: 'wkchips' });
    const otherBox = h('div', { class: 'wkchips' });
    const paintRep = () => {
      weeksBox.hidden = s.repeat !== 'weeks'; otherBox.hidden = s.repeat !== 'other';
      weeksBox.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', { class: 'amo' + ((s.weeks || []).includes(n) ? ' on' : ''), type: 'button', 'aria-pressed': String((s.weeks || []).includes(n)), onclick: () => { s.weeks = (s.weeks || []).includes(n) ? s.weeks.filter((x) => x !== n) : (s.weeks || []).concat(n).sort(); paintRep(); } }, V.ordinal(n))));
      if (!s.anchor) s.anchor = thisWeek;
      otherBox.replaceChildren(seg([[thisWeek, 'From ' + shortDay(thisWeek)], [nextWeek, 'From ' + shortDay(nextWeek)]], s.anchor <= thisWeek ? thisWeek : nextWeek, (v) => { s.anchor = v; }, 'Starting'));
    };
    paintRep();
    UI.sheet(DAYS_LONG[day] + (editing ? '' : ' · new session'), (close) => h('div', { class: 'timesheet' },
      h('div', { class: 'dlab' }, 'Repeats'),
      seg([['every', 'Every week'], ['other', 'Every other week'], ['weeks', 'Chosen weeks']], s.repeat || 'every', (v) => { s.repeat = v; if (v === 'weeks' && !(s.weeks || []).length) s.weeks = [1, 3]; paintRep(); }, 'Repeats'),
      otherBox, weeksBox,
      ed.el,
      h('div', { class: 'actions' },
        editing ? h('button', { class: 'btn', type: 'button', onclick: () => { list.splice(i, 1); V.setPattern(day, list); close(); } }, 'Delete') : h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => {
          const kept = one.filter((x) => V.sessionMins(x) > 0).map((x) => Object.assign({}, x, { repeat: s.repeat || 'every', weeks: s.weeks, anchor: s.anchor }));
          if (editing) list.splice(i, 1, ...kept); else list.push(...kept);
          V.setPattern(day, list.map((x) => { const c = Object.assign({}, x); delete c.id; return c; }));
          close();
        } }, 'Save'))));
  }
  function schedulePage() {
    const box = h('div', { class: 'csched' });
    function paint() {
      const svc = V.svc();
      const repWord = (s) => (s.repeat === 'other' ? 'every other week' : s.repeat === 'weeks' ? (s.weeks || []).map(V.ordinal).join(' and ') : 'every week');
      // about how much a month: the next eight weeks of the pattern
      let tot = 0; const weeks = [];
      const d0 = U.startOfDay(now());
      for (let w = 0; w < 8; w++) { let wk = 0; for (let k = 0; k < 7; k++) { const ds = U.toDateStr(U.addDays(d0, w * 7 + k)); const o = Object.assign({}, svc, { overrides: {} }); wk += V.planMins(o, ds); } weeks.push(wk); tot += wk; }
      const lo = Math.min(...weeks), hi = Math.max(...weeks);
      box.replaceChildren(
        h('p', { class: 'muted small', style: { margin: '0 4px 10px' } }, 'Your usual week. Change a single day on the calendar.'),
        h('section', { class: 'ccard sched' }, [0, 1, 2, 3, 4, 5, 6].map((day) => {
          const list = (svc.pattern || {})[day] || [];
          return h('div', { class: 'sday' }, h('span', { class: 'sdn' }, U.DAYS3[day]),
            h('div', { class: 'sss' }, list.map((s, i) => { const b = h('button', { class: 'sss1', type: 'button', onclick: () => planSessionSheet(day, i) },
              h('span', null, s.mode === 'range' ? rangeText(s) : V.fmtDur(V.sessionMins(s)), h('small', null, (s.credit ? 'Credit' : 'Ministry') + ' · ' + repWord(s))), h('b', null, V.fmtDur(V.sessionMins(s))));
              // v2.55: swipe left to Remove from the pattern
              return RV.swipe ? RV.swipe.row(b, { actions: [{ label: 'Remove', icon: 'x', kind: 'danger', fn: () => { const prev = list.slice(); V.setPattern(day, list.filter((x, k) => k !== i)); UI.toast('Session removed', { seconds: 4, actions: [{ label: 'Undo', fn: () => V.setPattern(day, prev) }] }); } }] }) : b; }),
            h('button', { class: 'link sadd', type: 'button', onclick: () => planSessionSheet(day, null) }, list.length ? '+ Add session' : '+ Add')));
        })),
        tot ? h('div', { class: 'crow sfoot' }, h('b', null, 'About ' + Math.round(tot / 8 * 4.35 / 60) + ' h a month'), h('span', { class: 'muted small' }, lo === hi ? V.fmtDur(lo) + ' a week' : Math.floor(lo / 60) + '–' + Math.ceil(hi / 60) + ' h a week')) : null);
    }
    paint();
    const unsub = ST.subscribe(paint);
    return { title: 'My schedule', back: '#/calendar', el: box, noRerender: true, destroy: unsub };
  }

  // ---------- the Calendar screen ----------
  function screen(sub, sub2) {
    if (sub === 'profile') return profilePage();
    if (sub === 'schedule') return schedulePage();
    // #/calendar/review/2026-09 opens that service year's review (handy before September comes round)
    if (sub === 'review') { const y = /^\d{4}-09$/.test(sub2 || '') ? sub2 : V.addMonths(V.yearStart(curMonth()), -12); history.replaceState(null, '', '#/calendar'); if (RV.review) setTimeout(() => RV.review.open(y), 0); sub = ''; }
    const D = V.data(), svc = V.svcOf(D.settings);
    const m = /^\d{4}-\d{2}$/.test(sub || '') ? sub : curMonth();
    const p = V.profileFor(svc, m), keeps = V.tracks(p);
    const el = h('div', { class: 'cal' });
    // v2.59: the selected day's card sits under the month; the Calendar opens on today
    const selDs = sel && V.monthOf(sel) === m ? sel : m === curMonth() ? todayStr() : V.dayStr(m, 1);
    sel = selDs;
    const dayBox = h('div', { class: 'daybox' });
    const paintDay = () => { dayBox.replaceChildren(dayCard(V.data(), sel, stepDay)); };
    function select(ds) {
      sel = ds;
      el.querySelectorAll('.cday.sel').forEach((c) => { c.classList.remove('sel'); c.setAttribute('aria-pressed', 'false'); });
      const c = el.querySelector('.cday[data-day="' + ds + '"]'); if (c) { c.classList.add('sel'); c.setAttribute('aria-pressed', 'true'); }
      paintDay();
    }
    function pick(ds) { select(ds); reveal(); }
    // A tap on a day brings the card's top into view, leaving some of the month above it
    function reveal() {
      const c = dayBox.firstChild; if (!c || !c.getBoundingClientRect) return;
      const top = c.getBoundingClientRect().top, vh = window.innerHeight || 800, want = vh * 0.42;
      if (top > want) window.scrollBy({ top: top - want, behavior: 'smooth' });
    }
    function stepDay(n) {
      const ds = U.toDateStr(U.addDays(U.parseDateStr(sel), n));
      if (V.monthOf(ds) === m) select(ds); else daySheet(ds);
    }
    paintDay();
    if (!svc.setup) {
      el.append(setupCard(), monthCard(D, m, selDs, pick), dayBox);
      return { title: 'Calendar', el };
    }
    el.append(...[
      h('div', { class: 'cbadges' },
        h('button', { class: 'cbadge', type: 'button', onclick: profileSheet }, V.badge(p, m), icon('right', 14)),
        keeps ? h('a', { class: 'cschedb', href: '#/calendar/schedule' }, icon('calendar', 16), 'My schedule') : null),
      keeps ? paceCard(D, m, p) : null,
      ringCard(D, m),
      monthCard(D, m, selDs, pick),
      dayBox,
      studiesCard(D, m),
      m === curMonth() ? reportCard(V.addMonths(m, -1)) : m < curMonth() ? reportCard(m) : null,
      keeps ? yearCard(D, m, p) : null].filter(Boolean)); // append() would write "null" for a missing card
    return { title: 'Calendar', el };
  }

  // ---------- the month look back and the update card ----------
  function lookBack(m) {
    const D = V.data(), p = V.profileFor(V.svcOf(D.settings), m), st = V.monthStats(D, m), sd = V.studies(D, m);
    const act = V.activity(D, {}), days = V.dayMap(D.times);
    const out = new Set(), people = new Set();
    for (const [ds, list] of act) if (V.monthOf(ds) === m) { out.add(ds); list.forEach((x) => { if (x.kind !== 'new') people.add(x.rvId); }); }
    for (const ds of days.keys()) if (V.monthOf(ds) === m) out.add(ds);
    const r = V.monthRec(D, m);
    const com = h('textarea', { rows: 2, placeholder: 'Optional', value: (r && r.comments) || '', onchange: (e) => V.patchMonth(m, { comments: e.target.value.trim() }) });
    const stat = (n, l) => h('div', { class: 'lbst' }, h('b', null, String(n)), h('span', null, l));
    UI.sheet('Your ' + V.monthName(m), (close) => h('div', { class: 'lookback' },
      h('div', { class: 'lbhero' }, V.hoursReported(p) || V.tracks(p)
        ? [h('b', null, (V.hoursReported(p) ? st.hours : Math.floor(st.shown / 60)) + ' h'), st.credit ? h('span', null, 'including ' + st.credit + ' h credit') : null]
        : [h('b', { class: 'sm' }, 'You shared in the ministry')], h('span', { class: 'lbleaf' }, leaf())),
      h('div', { class: 'lbstats' }, stat(out.size, out.size === 1 ? 'day out' : 'days out'), stat(sd.count, sd.count === 1 ? 'study' : 'studies'), stat(people.size, 'people visited')),
      h('label', { class: 'field' }, h('span', { class: 'dlab' }, 'Comments for your report'), com),
      h('div', { class: 'lbbtns' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { V.patchMonth(m, { comments: com.value.trim() }); copyReport(m); } }, 'Copy report'), sentBox(m)),
      h('button', { class: 'link', type: 'button', onclick: () => close() }, 'Later')), { noFocus: true });
  }
  function maybeLookBack() {
    if (quietSurprises() || document.querySelector('.overlay') || !S.ready) return;
    const svc = V.svc(), cur = curMonth(), prev = V.addMonths(cur, -1);
    if (!svc.setup || svc.seenMonth === cur) return;
    const D = V.data();
    V.saveSvc((v) => { v.seenMonth = cur; });
    const r = V.monthRec(D, prev);
    if (r && r.sent) return;
    if (!V.shared(D, prev) || (svc.since && V.monthOf(U.toDateStr(new Date(svc.since))) > prev)) return;
    lookBack(prev);
  }
  function newsCard() {
    const line = (ic, text) => h('div', { class: 'nwl' }, h('span', { class: 'nwi' }, ic), h('span', null, text));
    const ring = h('span', { class: 'ringi big', 'aria-hidden': 'true' });
    UI.sheet('New: Calendar', (close) => h('div', { class: 'news' },
      line(ring, 'Days you recorded visits are marked, so no time gets missed.'),
      line(icon('chart', 20), 'Plan your week and see what your month and year are on pace for.'),
      line(icon('book', 20), 'Your Bible studies are counted each month.'),
      h('div', { class: 'nwq' }, h('b', null, 'How do you report?'),
        PICKS.map(([k, l]) => h('button', { class: 'btn block', type: 'button', onclick: () => { close(); choose(k); if (k !== 'other') location.hash = '#/calendar'; } }, l)),
        h('div', { class: 'muted small' }, 'Auxiliary pioneering? Add your months from the badge on the Calendar tab.')),
      h('button', { class: 'link', type: 'button', onclick: () => { close(); V.setProfile({ kind: 'publisher', track: false }); } }, 'Not now')),
    { noFocus: true, onClose: () => { if (!V.svc().setup) V.setProfile({ kind: 'publisher', track: false }); } });
  }
  function maybeNews() {
    if (quietSurprises() || document.querySelector('.overlay') || !S.ready) return false;
    if (V.svc().setup || !S.rvs.some((r) => !r.deletedAt)) return false;
    newsCard();
    return true;
  }

  RV.calendar = { screen, daySheet, dayCard, timeSheet, lookBack, maybeLookBack, newsCard, maybeNews, vwheel, pastMonthSheet, openMonth, quietSurprises, leaf };
})(window);
