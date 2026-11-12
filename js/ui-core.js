/* RV app: shared UI pieces (sheets, toasts, prompts, rows, badges, helpers). */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const { h, icon, clear } = RV.dom;
  const U = RV.util, L = RV.logic, ST = RV.store;

  const S = ST.S;
  const lbl = (k) => S.settings.labels[k] || k;

  // ---------- sheets ----------
  let openCount = 0;
  function sheet(title, content, opts) {
    opts = opts || {};
    const prevFocus = document.activeElement;
    const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (--openCount <= 0) { openCount = 0; document.body.style.overflow = ''; }
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      if (opts.onClose) opts.onClose(result);
    };
    const onKey = (e) => { if (e.key === 'Escape' && overlay === topOverlay()) close(); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const box = h('div', { class: 'sheet' },
      h('div', { class: 'sheet-head' },
        h('h2', null, title),
        h('button', { class: 'iconbtn', 'aria-label': 'Close', type: 'button', onclick: () => close() }, icon('x'))));
    const body = typeof content === 'function' ? content(close) : content;
    if (body) box.appendChild(body);
    overlay.appendChild(box);
    if (RV.swipe && !opts.noSwipe) RV.swipe.down(box, () => close(), box.firstChild); // v2.55: pull down to close
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    openCount++;
    document.addEventListener('keydown', onKey);
    if (!opts.noFocus) {
      // v2.49: no keyboard until a field is tapped (Mark: it shrinks the screen). Only a non-typing control marked
      // data-autofocus (a confirm button) takes focus on open; text fields wait for a tap. The exception is
      // data-autofocus="tap": the sheet was opened by tapping that very field's line (the Studying block).
      const first = [...box.querySelectorAll('[data-autofocus]')].find((el) => el.dataset.autofocus === 'tap' || !el.matches('textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), select, [contenteditable]'));
      // Focus it, unless the person has already tapped into the sheet.
      if (first) setTimeout(() => { if (box.contains(document.activeElement)) return; try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
    }
    return { close, el: box };
  }
  function topOverlay() {
    const all = document.querySelectorAll('.overlay');
    return all[all.length - 1];
  }

  function confirmDialog(o) {
    return new Promise((resolve) => {
      let answered = false;
      const done = (v, close) => { answered = true; resolve(v); close(); };
      sheet(o.title || 'Are you sure?', (close) =>
        h('div', null,
          o.message ? h('p', { class: 'muted', style: { marginTop: 0, whiteSpace: 'pre-wrap' } }, o.message) : null,
          h('div', { class: 'actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => done(false, close) }, o.cancelText || 'Cancel'),
            h('button', { class: 'btn ' + (o.danger ? 'danger' : 'primary'), type: 'button', 'data-autofocus': true, onclick: () => done(true, close) }, o.confirmText || 'OK'))),
      { onClose: () => { if (!answered) resolve(false); } });
    });
  }

  // options: [{value, label, sub}]. Resolves to value, or undefined if dismissed.
  function pick(title, options, current, extra) {
    return new Promise((resolve) => {
      let answered = false;
      sheet(title, (close) =>
        h('div', null,
          extra || null,
          options.map((o) =>
            h('button', {
              class: 'opt', type: 'button', 'aria-pressed': String(o.value === current),
              onclick: () => { answered = true; resolve(o.value); close(); },
            }, h('div', null, h('div', null, o.label), o.sub ? h('div', { class: 'sub' }, o.sub) : null)))),
      { noFocus: true, onClose: () => { if (!answered) resolve(undefined); } });
    });
  }

  // Resolves to the entered string, or null if cancelled.
  function textPrompt(o) {
    return new Promise((resolve) => {
      let answered = false;
      const input = o.multiline
        ? h('textarea', { value: o.value || '', placeholder: o.placeholder || '', 'data-autofocus': true })
        : h('input', { type: 'text', value: o.value || '', placeholder: o.placeholder || '', 'data-autofocus': true });
      sheet(o.title, (close) =>
        h('form', {
          onsubmit: (e) => { e.preventDefault(); answered = true; resolve(input.value); close(); },
        },
          o.label ? h('div', { class: 'field' }, h('label', null, o.label), input) : h('div', { class: 'field' }, input),
          o.cleanup && RV.forms && RV.forms.cleanupRow ? RV.forms.cleanupRow(input, null) : null, // v2.44
          h('div', { class: 'actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
            h('button', { class: 'btn primary', type: 'submit' }, o.okText || 'Save'))),
      { onClose: () => { if (!answered) resolve(null); } });
    });
  }

  // ---------- toasts ----------
  // v2.55: in the app's palette (ink and paper, the green for actions), at the bottom above the tabs. Up to three
  // stack, newest in front; swipe one sideways or down to dismiss it; touching one holds it until you let go.
  let toastBox = null;
  const toasts = [];
  const BAD = /^(couldn|could not|can't|cannot|not available|failed|no |nothing|.*did not|.*needs a connection)/i;
  function layoutToasts() {
    const n = toasts.length;
    toasts.forEach((t, i) => {
      const k = n - 1 - i; // 0 = newest, in front
      t.el.style.zIndex = String(10 - k);
      t.el.classList.toggle('back', k > 0);
      if (!t.dragging) t.el.style.transform = k ? 'translateY(' + (-10 * k) + 'px) scale(' + (1 - 0.04 * k) + ')' : '';
      t.el.style.opacity = k ? String(1 - 0.28 * k) : '';
    });
  }
  function toast(msg, o) {
    o = o || {};
    if (!toastBox) { toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
    const bad = o.icon === false ? null : (o.bad != null ? o.bad : BAD.test(String(msg)));
    const el = h('div', { class: 'toast', role: 'status' },
      o.icon === false ? null : h('span', { class: 'tico' + (bad ? ' bad' : ''), 'aria-hidden': 'true' }, icon(bad ? 'alert' : 'check', 16)),
      h('div', { class: 'msg' }, msg));
    const t = { el, dragging: false };
    let timer = null;
    const ms = (o.seconds || 4) * 1000;
    const arm = (d) => { clearTimeout(timer); timer = setTimeout(() => dismiss(), d); };
    const dismiss = (how) => {
      clearTimeout(timer);
      const i = toasts.indexOf(t);
      if (i < 0) return;
      toasts.splice(i, 1);
      el.classList.add('out');
      if (how) el.style.transform = how;
      setTimeout(() => el.remove(), 220);
      layoutToasts();
    };
    (o.actions || []).forEach((a) =>
      el.appendChild(h('button', { type: 'button', onclick: () => { dismiss(); a.fn(); } }, a.label)));
    // swipe sideways or down to dismiss; holding it pauses the timer
    let st = null;
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; st = { x: e.clientX, y: e.clientY, id: e.pointerId }; clearTimeout(timer); });
    el.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = Math.max(0, e.clientY - st.y);
      if (!t.dragging && Math.hypot(dx, dy) < 6) return;
      if (!t.dragging) { t.dragging = true; el.style.transition = 'none'; try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      el.style.opacity = String(Math.max(0, 1 - Math.max(Math.abs(dx) / 220, dy / 90)));
    });
    const up = (e) => {
      if (!st) return;
      const dx = e.clientX - st.x, dy = Math.max(0, e.clientY - st.y);
      st = null;
      const was = t.dragging; t.dragging = false; el.style.transition = '';
      if (was && (Math.abs(dx) > 80 || dy > 40)) { dismiss(Math.abs(dx) > 80 ? 'translateX(' + (dx < 0 ? -420 : 420) + 'px)' : 'translateY(120px)'); return; }
      el.style.opacity = '';
      layoutToasts();
      if (!was) { /* a tap on the message closes it, as before */ if (e.target.closest('.msg')) { dismiss(); return; } }
      arm(Math.min(ms, 3000));
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { st = null; t.dragging = false; el.style.transition = ''; el.style.opacity = ''; layoutToasts(); arm(3000); });
    toastBox.appendChild(el);
    toasts.push(t);
    while (toasts.length > 3) { const old = toasts.shift(); old.el.remove(); }
    layoutToasts();
    arm(ms);
    return () => dismiss();
  }

  // ---------- small renderers ----------
  function stageBadge(stageId) {
    const st = L.stageOf(S.settings, stageId);
    const shown = L.shownStages(S.settings);
    const sh = L.shownStage(S.settings, stageId);
    const i = shown.findIndex((x) => x.key === sh.key);
    return h('span', { class: 'badge', 'data-s': st.closed ? '0' : String((i % 5) + 1) }, st.closed ? null : h('i', { class: 'pips', 'aria-hidden': 'true', style: '--n:' + (i + 1) + ';--t:' + shown.length }), sh.name);
  }
  function attBadge(att) {
    if (att.state === 'overdue') return h('span', { class: 'badge flag-overdue' }, L.attentionText(att));
    if (att.state === 'soon') return h('span', { class: 'badge flag-soon' }, L.attentionText(att));
    if (att.state === 'snoozed') return h('span', { class: 'badge flag-snoozed' }, L.attentionText(att));
    return null;
  }
  const campaignName = (id) => { const c = id ? S.lib.find((x) => x.id === id && !x.deletedAt) : null; return c ? c.title : ''; };
  const subtitle = (rv) => [rv.address, rv.neighborhood].filter(Boolean).join(' · ');
  const lastText = (it) => (it.entries.length ? 'Last: ' + U.relTime(it.last) : 'Added ' + U.relTime(it.last));

  function toggle(checked, onchange, label) {
    return h('span', { class: 'switch' },
      h('input', { type: 'checkbox', role: 'switch', checked: !!checked, 'aria-label': label || 'toggle', onchange: (e) => onchange(e.target.checked) }),
      h('span', { class: 'track' }), h('span', { class: 'thumb' }));
  }

  function field(label, input, hint) {
    return h('div', { class: 'field' }, h('label', null, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
  }
  function emptyState(iconName, text, action) {
    return h('div', { class: 'empty' }, icon(iconName, 32), h('div', null, text), action || null);
  }

  // ---------- actions shared by several screens ----------
  function vibrate() { try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* ignore */ } }

  function doNotHome(rvId) {
    const rv = ST.rvById(rvId);
    if (!rv) return;
    if (L.isDNC(S.settings, rv)) { toast('This record is marked Do not call.'); return; }
    const res = ST.logNH(rvId);
    vibrate();
    // v2.57: an optional "Try again Sat" (their likely-home day) sets the next visit, unless one is already ahead
    const ahead = rv.snoozedUntil && rv.snoozedUntil > U.toDateStr(new Date());
    const it = !ahead && RV.next ? ST.itemFor(rvId) : null;
    const again = it ? RV.next.tryAgain(it, new Date(), ST.items()) : null;
    toast(lbl('notHome') + ' logged: ' + rv.name, {
      seconds: Math.max(S.settings.nhToastSeconds || 6, again ? 8 : 0),
      actions: [
        { label: 'Undo', fn: res.undo },
        again ? { label: 'Try again ' + U.DAYS3[U.parseDateStr(again).getDay()], fn: () => RV.next.save(rvId, { date: again, time: rv.nextTime, remind: rv.nextRemind, repeat: rv.nextRepeat }) } : null,
        { label: 'Add note', fn: () => editEntrySheet(res.entry.id) },
      ].filter(Boolean),
    });
  }

  function dateTimeLocal(iso) {
    const d = new Date(iso);
    return U.toDateStr(d) + 'T' + U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  }
  function parseLocalDT(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
  }

  function editEntrySheet(entryId) {
    const e = S.entries.find((x) => x.id === entryId);
    if (!e) return;
    const rv = S.rvs.find((r) => r.id === e.rvId) || {};
    const isStage = e.type === 'stage', isVisit = e.type === 'visit';
    const text = h('textarea', { value: e.text || '', placeholder: 'What happened?' });
    const when = h('input', { type: 'datetime-local', value: dateTimeLocal(e.at) });
    const typeName = { nh: lbl('notHome'), visit: 'Visit', note: 'Note', stage: 'Stage change' }[e.type] || e.type;
    const camp = e.campaignId ? S.lib.find((x) => x.id === e.campaignId) : null;
    const campOn = h('input', { type: 'checkbox', checked: true });
    // a visit can be turned into a study session (or back): Publication, Covered, Start next time
    const firstStage = (S.settings.stages.find((x) => !x.closed) || {}).id;
    const canStudy = isVisit && rv.stage !== firstStage;
    let study = isVisit && (e.study === true || !!(e.progress || e.nextStart));
    const pub = h('input', { type: 'text', value: e.publication || rv.publication || '', autocomplete: 'off', list: 'pub-list-e', placeholder: 'e.g. Enjoy Life Forever' });
    const pubList = h('datalist', { id: 'pub-list-e' }, ST.publications().map((n) => h('option', { value: n })));
    const prog = h('input', { type: 'text', value: e.progress || '', autocomplete: 'off', placeholder: 'e.g. Lesson 1' });
    const nxt = h('input', { type: 'text', value: e.nextStart || '', autocomplete: 'off', placeholder: 'e.g. Lesson 2' });
    const studyBox = h('div', null, field('Publication', pub), h('div', { class: 'two' }, field('Covered', prog), field('Start next time', nxt)));
    studyBox.hidden = !study;
    const studySw = canStudy ? h('div', { class: 'switchrow', style: { marginBottom: '8px' } }, h('div', { class: 'grow' }, 'Study session'),
      toggle(study, (v) => { study = v; studyBox.hidden = !v; }, 'Study session')) : null;
    sheet('Edit ' + typeName.toLowerCase(), (close) =>
      h('form', {
        onsubmit: (ev) => {
          ev.preventDefault();
          const d = parseLocalDT(when.value);
          const patch = { text: text.value.trim() };
          if (d) patch.at = d.toISOString();
          if (camp && !campOn.checked) patch.campaignId = null;
          if (canStudy) {
            if (study) Object.assign(patch, { study: true, publication: pub.value.trim(), progress: prog.value.trim(), nextStart: nxt.value.trim(), plan: !!nxt.value.trim() });
            else if (e.study || e.progress || e.nextStart) Object.assign(patch, { study: false, progress: '', nextStart: '' });
          }
          ST.updateEntry(e.id, patch);
          if (canStudy) {
            // the newest study session sets where the record's study stands
            const studies = S.entries.filter((x) => x.rvId === e.rvId && !x.deletedAt && x.type === 'visit' && (x.study === true || x.progress || x.nextStart)).sort((a, b) => (a.at < b.at ? 1 : -1));
            if (study && studies[0] && studies[0].id === e.id) ST.updateRv(e.rvId, { publication: pub.value.trim() || rv.publication || '', progress: prog.value.trim() || rv.progress || '', nextStart: nxt.value.trim() });
            // a study added this way can complete a growth step
            const grew = ST.growNow(e.rvId);
            close();
            if (grew && RV.forms && RV.forms.afterVisit) RV.forms.afterVisit(e.rvId, grew, 'Saved as a study');
            else toast(study ? 'Saved as a study' : 'Visit saved');
            return;
          }
          close();
        },
      },
        pubList,
        studySw,
        studyBox,
        field('Notes', text),
        !isStage && RV.forms && RV.forms.cleanupRow ? RV.forms.cleanupRow(text, null) : null, // v2.44
        isStage ? null : field('When', when),
        camp ? h('label', { class: 'check' }, campOn, 'Part of the ' + camp.title + ' campaign') : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save')),
        // v2.51: Delete lives here now; the timeline rows open this sheet
        isStage ? null : h('button', { class: 'link delentry', type: 'button', onclick: async () => {
          if (await confirmDialog({ title: 'Delete this entry?', confirmText: 'Delete', danger: true })) { RV.store.deleteEntry(entryId); close(); }
        } }, 'Delete this entry')));
  }

  // ---------- picker wheel ----------
  // A sideways, circular picker: the choice sits centred on a raised pill, neighbours fade at the edges.
  // Swipe to move (it snaps to the nearest option), tap a neighbour to jump to it, or use the arrow keys.
  // opts: [{ value, label }]. o.neutral: the value that means "no filter" (the wheel is marked when it is off it).
  function wheel(opts, value, onChange, o) {
    o = o || {};
    const n = opts.length, SLOT = 138;
    let idx = Math.max(0, opts.findIndex((x) => x.value === value));
    const strip = h('div', { class: 'wstrip' });
    const el = h('div', { class: 'wheel', role: 'listbox', tabindex: '0', 'aria-label': o.label || '' }, h('div', { class: 'wpad' }), strip);
    let dx = 0, startX = 0, startY = 0, dragging = false, moved = false, animating = false;
    const at = (d) => opts[((idx + d) % n + n) % n];
    function paint() {
      const near = Math.round(-dx / SLOT);
      strip.style.transition = 'none';
      strip.style.transform = 'translateX(' + dx + 'px)';
      strip.replaceChildren(...[-3, -2, -1, 0, 1, 2, 3].map((d) => {
        const x = d * SLOT;
        const dist = Math.abs(x + dx) / SLOT;
        return h('div', {
          class: 'wopt' + (d === near ? ' sel' : ''), role: 'option', 'aria-selected': String(d === 0),
          style: { transform: 'translateX(' + x + 'px)', opacity: String(Math.max(0, 1 - Math.max(0, dist - 0.4) * 0.75)) },
          onclick: () => { if (!moved && d) go(d); },
        }, h('span', null, at(d).label));
      }));
      el.classList.toggle('on', o.neutral !== undefined && opts[idx].value !== o.neutral);
      el.setAttribute('aria-valuetext', opts[idx].label);
    }
    function go(steps) {
      if (animating) return;
      animating = true;
      strip.style.transition = 'transform .18s ease-out';
      void strip.offsetWidth; // start the slide from where the strip is now
      strip.style.transform = 'translateX(' + (-steps * SLOT) + 'px)';
      const done = () => {
        if (!animating) return;
        animating = false; dx = 0;
        if (steps) idx = ((idx + steps) % n + n) % n;
        paint();
        if (steps) { vibrate(); onChange(opts[idx].value); }
      };
      strip.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 260);
    }
    el.addEventListener('pointerdown', (e) => { if (animating) return; dragging = true; moved = false; startX = e.clientX; startY = e.clientY; });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const mx = e.clientX - startX, my = e.clientY - startY;
      if (!moved && Math.abs(mx) > 6 && Math.abs(mx) > Math.abs(my)) { moved = true; try { el.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } }
      if (moved) { dx = mx; paint(); }
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (moved) { go(Math.round(-dx / SLOT)); setTimeout(() => { moved = false; }, 0); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });
    el.setValue = (v) => { const k = opts.findIndex((x) => x.value === v); if (k >= 0) { idx = k; dx = 0; paint(); } };
    paint();
    return el;
  }

  // ---------- directions (v2.60) ----------
  // settings.maps: unset until chosen on the first tap; 'google', 'apple' (Apple devices only), 'waze' or 'ask'
  const isApple = () => /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const MAPS = () => [['google', 'Google Maps'], isApple() ? ['apple', 'Apple Maps'] : null, ['waze', 'Waze']].filter(Boolean);
  function mapsUrl(app, a) {
    const q = encodeURIComponent(a), ll = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(a);
    if (app === 'apple') return 'https://maps.apple.com/?dirflg=d&daddr=' + q;
    if (app === 'waze') return 'https://waze.com/ul?navigate=yes&' + (ll ? 'll=' + a : 'q=' + q);
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + q;
  }
  // The app to open now: the saved choice, or null when the chooser should show (not chosen yet, or Ask each time)
  function mapsApp() {
    const m = S.settings.maps;
    if (m === 'apple' && !isApple()) return 'google'; // a backup from an iPhone restored elsewhere
    return m === 'google' || m === 'apple' || m === 'waze' ? m : null;
  }
  function openNav(a) {
    const app = mapsApp();
    if (app) { window.open(mapsUrl(app, a), '_blank', 'noopener'); return; }
    const first = S.settings.maps !== 'ask';
    // The maps app opens inside the tap on a choice, so the phone doesn't block it as a pop-up
    sheet('Open directions in', (close) => h('div', { class: 'mapspick' },
      first ? h('p', { class: 'muted small' }, 'Asked once. Change it any time in Settings › Directions.') : null,
      MAPS().map(([v, label]) => h('button', { class: 'opt', type: 'button', onclick: () => {
        if (first) ST.saveSettings((st) => { st.maps = v; });
        window.open(mapsUrl(v, a), '_blank', 'noopener'); close();
      } }, icon('navigation', 20), h('div', { class: 'grow' }, label), icon('right', 18)))), { noFocus: true });
  }

  RV.ui = {
    lbl, sheet, confirmDialog, pick, textPrompt, toast, stageBadge, attBadge, campaignName, subtitle, lastText, toggle, field, emptyState,
    doNotHome, editEntrySheet, dateTimeLocal, parseLocalDT, vibrate, wheel,
    download(name, text, mime) {
      const blob = new Blob([text], { type: mime || 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
    },
    openTel: (p) => { location.href = 'tel:' + String(p).replace(/[^\d+]/g, ''); },
    openSms: (p) => { location.href = 'sms:' + String(p).replace(/[^\d+]/g, ''); },
    // Directions go to the geotag when there is one (exact spot), else to the saved address.
    navTarget: (rv) => (rv.geo && typeof rv.geo.lat === 'number' && typeof rv.geo.lng === 'number' ? rv.geo.lat + ',' + rv.geo.lng : [rv.address, rv.neighborhood].filter(Boolean).join(', ')),
    // v2.60: the maps app is the user's choice (Settings › Directions), asked on the first Directions tap
    isApple, MAPS, mapsUrl, mapsApp, openNav,
    openMap: (a) => { window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a), '_blank', 'noopener'); },
  };
})(window);
