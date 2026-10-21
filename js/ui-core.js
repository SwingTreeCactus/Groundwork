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
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    openCount++;
    document.addEventListener('keydown', onKey);
    if (!opts.noFocus) {
      const first = box.querySelector('[data-autofocus]') || box.querySelector('textarea, input[type=text], input[type=search], input[type=tel], input[type=number], input[type=password]');
      // Focus the first field, unless the person has already tapped into the sheet.
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
          h('div', { class: 'actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
            h('button', { class: 'btn primary', type: 'submit' }, o.okText || 'Save'))),
      { onClose: () => { if (!answered) resolve(null); } });
    });
  }

  // ---------- toasts ----------
  let toastBox = null;
  function toast(msg, o) {
    o = o || {};
    if (!toastBox) { toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
    const el = h('div', { class: 'toast', role: 'status' }, h('div', { class: 'msg', onclick: () => dismiss() }, msg));
    const dismiss = () => { clearTimeout(t); el.remove(); };
    (o.actions || []).forEach((a) =>
      el.appendChild(h('button', { type: 'button', onclick: () => { dismiss(); a.fn(); } }, a.label)));
    toastBox.appendChild(el);
    const t = setTimeout(dismiss, (o.seconds || 4) * 1000);
    while (toastBox.children.length > 3) toastBox.firstChild.remove();
    return dismiss;
  }

  // ---------- small renderers ----------
  function stageBadge(stageId) {
    const st = L.stageOf(S.settings, stageId);
    const actives = S.settings.stages.filter((s) => !s.closed);
    const i = actives.findIndex((s) => s.id === st.id);
    return h('span', { class: 'badge', 'data-s': st.closed ? '0' : String((i % 5) + 1) }, st.closed ? null : h('i', { class: 'pips', 'aria-hidden': 'true', style: '--n:' + (i + 1) + ';--t:' + actives.length }), st.name);
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
    toast(lbl('notHome') + ' logged: ' + rv.name, {
      seconds: S.settings.nhToastSeconds || 6,
      actions: [
        { label: 'Undo', fn: res.undo },
        { label: 'Add note', fn: () => editEntrySheet(res.entry.id) },
      ],
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
    const isStage = e.type === 'stage';
    const text = h('textarea', { value: e.text || '', placeholder: 'What happened?', 'data-autofocus': true });
    const when = h('input', { type: 'datetime-local', value: dateTimeLocal(e.at) });
    const typeName = { nh: lbl('notHome'), visit: 'Visit', note: 'Note', stage: 'Stage change' }[e.type] || e.type;
    const prog = e.progress !== undefined ? h('input', { type: 'text', value: e.progress || '', autocomplete: 'off' }) : null;
    const camp = e.campaignId ? S.lib.find((x) => x.id === e.campaignId) : null;
    const campOn = h('input', { type: 'checkbox', checked: true });
    sheet('Edit ' + typeName.toLowerCase(), (close) =>
      h('form', {
        onsubmit: (ev) => {
          ev.preventDefault();
          const d = parseLocalDT(when.value);
          const patch = { text: text.value.trim() };
          if (prog) patch.progress = prog.value.trim();
          if (d) patch.at = d.toISOString();
          if (camp && !campOn.checked) patch.campaignId = null;
          ST.updateEntry(e.id, patch);
          close();
        },
      },
        prog ? field('Where you stopped', prog) : null,
        field('Notes', text),
        isStage ? null : field('When', when),
        camp ? h('label', { class: 'check' }, campOn, 'Part of the ' + camp.title + ' campaign') : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
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
    openNav: (a) => {
      const q = encodeURIComponent(a);
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const url = ios ? 'https://maps.apple.com/?dirflg=d&daddr=' + q : 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + q;
      window.open(url, '_blank', 'noopener');
    },
    openMap: (a) => { window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a), '_blank', 'noopener'); },
  };
})(window);
