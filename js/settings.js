/* RV app: Settings screens. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const { h, icon } = RV.dom;
  const U = RV.util, L = RV.logic, ST = RV.store, UI = RV.ui, F = RV.forms;
  const S = ST.S;
  const { lbl, field, toast, confirmDialog, sheet } = UI;
  const HOME_CARD_NAMES = RV.defaults.HOME_CARD_NAMES;

  const page = (title, children, o) =>
    Object.assign({ title, back: '#/settings', el: h('div', null, children) }, o || {});
  const hint = (t) => h('p', { class: 'muted small', style: { margin: '0 0 12px' } }, t);
  const save = (fn) => ST.saveSettings(fn);
  const num = (v) => { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? null : n; };

  function saveBtn(label, fn, cls) {
    return h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: fn }, label);
  }

  // ---------- index ----------
  function index() {
    const row = (href, title, sub, ic) =>
      h('a', { class: 'setrow', href }, icon(ic, 20), h('div', { class: 'main' }, h('div', null, title), sub ? h('div', { class: 'sub' }, sub) : null), icon('right', 18));
    const K = RV.defaults.LIB_KINDS;
    const cnt = (k) => ST.libItems(k).length;
    return {
      title: 'Settings',
      el: h('div', null,
        row('#/settings/display', 'Display', 'Theme and text size', 'sliders'),
        row('#/settings/home', 'Home screen', 'Choose and order the sections', 'home'),
        row('#/settings/lib/topic', lbl('topics'), cnt('topic') + ' saved · scriptures, openers and talking points', 'note'),
        row('#/settings/campaigns', lbl('campaign') + 's', cnt('campaign') + ' saved · dates, topic, publications', 'calendar'),
        row('#/settings/stages', 'Lead stages', S.settings.stages.filter((s) => !s.closed).map((s) => s.name).join(' › '), 'shuffle'),
        row('#/settings/reasons', 'Archive reasons', S.settings.archiveReasons.map((r) => r.name).join(', '), 'archive'),
        row('#/settings/fields', 'Lists and custom fields', lbl('neighborhood') + 's, how we met, extra fields', 'users'),
        row('#/settings/labels', 'Labels', 'Rename RV, Not Home and other words', 'edit'),
        row('#/settings/attention', 'Needs attention', 'Timing and the not-home banner', 'clock'),
        row('#/settings/security', 'Security', S.settings.lock.on ? 'PIN lock is on' : 'PIN lock is off', 'lock'),
        row('#/settings/data', 'Data and backup', 'Backup, restore, CSV import and export', 'download'),
        row('#/settings/about', 'About', 'Version ' + RV.VERSION, 'alert')),
    };
  }

  // ---------- display ----------
  function display() {
    const seg = (opts, cur, onpick) => {
      const box = h('div', { class: 'seg', role: 'group' });
      opts.forEach((o) => box.appendChild(h('button', {
        type: 'button', 'aria-pressed': String(o.value === cur),
        onclick: () => { onpick(o.value); box.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i].value === o.value))); },
      }, o.label)));
      return box;
    };
    return page('Display', [
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Theme'),
        seg([{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], S.settings.theme,
          (v) => { save((s) => { s.theme = v; }); RV.app.applyDisplay(); })),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Text size'),
        seg([{ value: 0.9, label: 'Small' }, { value: 1, label: 'Default' }, { value: 1.15, label: 'Large' }, { value: 1.3, label: 'Extra large' }], S.settings.textScale,
          (v) => { save((s) => { s.textScale = v; }); RV.app.applyDisplay(); })),
      h('div', { class: 'switchrow' }, h('div', { class: 'grow' }, h('div', null, 'Show ' + lbl('notHomeShort') + ' button on list rows'), h('div', { class: 'muted small' }, 'One tap from the list. You can undo right after.')),
        UI.toggle(S.settings.nhRowButton, (v) => save((s) => { s.nhRowButton = v; }), 'Show Not Home button on list rows')),
    ], { noRerender: true });
  }

  // ---------- home cards ----------
  function homeSettings() {
    const box = h('div');
    function render() {
      box.replaceChildren();
      S.settings.homeCards.forEach((c, i, arr) => {
        box.appendChild(h('div', { class: 'row plain' },
          h('div', { class: 'main' }, HOME_CARD_NAMES[c.id]),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { save((s) => { const t = s.homeCards[i - 1]; s.homeCards[i - 1] = s.homeCards[i]; s.homeCards[i] = t; }); render(); } }, icon('up')),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move down', disabled: i === arr.length - 1, onclick: () => { save((s) => { const t = s.homeCards[i + 1]; s.homeCards[i + 1] = s.homeCards[i]; s.homeCards[i] = t; }); render(); } }, icon('down')),
          UI.toggle(c.on, (v) => save((s) => { s.homeCards[i].on = v; }), 'Show ' + HOME_CARD_NAMES[c.id])));
      });
    }
    render();
    return page('Home screen', [hint('Home always shows the current campaign when one is running. Choose and order the sections below it.'), box], { noRerender: true });
  }

  // ---------- topics ----------
  function lib() {
    const items = ST.libItems('topic');
    const box = h('div', { class: 'list' }, items.map((x) =>
      h('div', { class: 'row plain' },
        h('div', { class: 'main', style: { cursor: 'pointer' }, onclick: () => RV.screens.libSheet('topic', x) },
          h('div', { class: 'name' }, x.title), x.text ? h('div', { class: 'line2' }, x.text) : null,
          (x.tags || []).length ? h('div', { class: 'line3' }, x.tags.map((t) => h('span', { class: 'tag' }, t))) : null),
        UI.toggle(x.showOnHome, (v) => ST.updateLib(x.id, { showOnHome: v }), 'Feature: ' + x.title))));
    return page(lbl('topics'), [
      hint('Put scriptures, conversation openers and talking points here. The switch features a topic: it shows on Home and as a tap-to-add chip when you record a visit. Tap a topic to edit it.'),
      items.length ? box : UI.emptyState('note', 'Nothing saved yet.'),
      h('div', { style: { marginTop: '14px' } }, saveBtn('Add topic', () => RV.screens.libSheet('topic'), 'primary block')),
    ]);
  }

  // ---------- campaigns ----------
  const campRange = (c) => (c.start && c.end ? U.fmtDate(c.start) + ' to ' + U.fmtDate(c.end) : 'No dates yet');
  function campaignForm(c) {
    const title = h('input', { type: 'text', value: c ? c.title : '', 'data-autofocus': true, autocomplete: 'off', placeholder: 'e.g. Fall invitation' });
    const topic = h('input', { type: 'text', value: c ? c.topic || '' : '', autocomplete: 'off', placeholder: 'The general theme, e.g. Hope for the future' });
    const start = h('input', { type: 'date', value: c ? c.start || '' : U.toDateStr(new Date()) });
    const end = h('input', { type: 'date', value: c ? c.end || '' : '' });
    const text = h('textarea', { value: c ? c.text || '' : '', placeholder: 'A few basic details about the campaign', style: { minHeight: '84px' } });
    const pubs = h('textarea', { value: c ? c.publications || '' : '', placeholder: 'One per line', style: { minHeight: '70px' } });
    const err = h('div', { class: 'small', role: 'alert', style: { color: 'var(--danger)', minHeight: '1.3em', marginBottom: '6px' } });
    sheet(c ? 'Edit ' + lbl('campaign').toLowerCase() : 'New ' + lbl('campaign').toLowerCase(), (close) =>
      h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          const t = title.value.trim();
          if (!t) { err.textContent = 'Give it a name.'; title.focus(); return; }
          if (!start.value || !end.value) { err.textContent = 'Choose a start and an end date.'; return; }
          if (end.value < start.value) { err.textContent = 'The end date comes before the start date.'; return; }
          const clash = L.campaignOverlap(ST.campaigns(), { start: start.value, end: end.value }, c && c.id);
          if (clash) { err.textContent = 'These dates overlap "' + clash.title + '" (' + campRange(clash) + '). Only one campaign can run at a time.'; return; }
          const data = { title: t, topic: topic.value.trim(), text: text.value.trim(), publications: pubs.value.trim(), start: start.value, end: end.value };
          if (c) ST.updateLib(c.id, data); else ST.addLib('campaign', data);
          close();
        },
      },
        field('Name', title),
        field('Topic', topic),
        h('div', { class: 'two' }, field('Starts', start), field('Ends', end)),
        field('Details', text),
        field('Featured publications', pubs),
        err,
        h('div', { class: 'actions' },
          c ? h('button', {
            class: 'btn danger', type: 'button',
            onclick: async () => { if (await confirmDialog({ title: 'Delete this campaign?', message: 'Visits already tagged with it keep their history.', confirmText: 'Delete', danger: true })) { ST.deleteLib(c.id); close(); } },
          }, 'Delete') : null,
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
  }
  function campaigns() {
    const now = new Date();
    const all = ST.campaigns();
    const groups = [['Active now', 'active'], ['Coming up', 'upcoming'], ['Needs dates', 'undated'], ['Past', 'past']];
    const box = h('div');
    groups.forEach(([label, key]) => {
      const rows = all.filter((c) => L.campaignStatus(c, now) === key);
      if (key === 'past') rows.reverse();
      if (!rows.length) return;
      box.appendChild(h('div', { class: 'group-head' }, label));
      box.appendChild(h('div', { class: 'list' }, rows.map((c) =>
        h('button', { class: 'row', type: 'button', style: { textAlign: 'left', width: '100%' }, onclick: () => campaignForm(c) },
          h('div', { class: 'main' }, h('div', { class: 'name' }, c.title), h('div', { class: 'line2' }, campRange(c)),
            c.topic ? h('div', { class: 'line2' }, c.topic) : null),
          icon('right', 18)))));
    });
    return page(lbl('campaign') + 's', [
      hint('Add campaigns ahead of time. Each switches on by itself on its start date and off after its end date, and only one can run at a time. While one is running Home shows it, and new visits are tagged with it (you can switch that off per visit).'),
      all.length ? box : UI.emptyState('calendar', 'No campaigns yet.'),
      h('div', { style: { marginTop: '14px' } }, saveBtn('Add campaign', () => campaignForm(), 'primary block')),
    ]);
  }

  // ---------- stages ----------
  function stages() {
    const box = h('div');
    const closedLast = (s) => { s.stages.sort((a, b) => (a.closed ? 1 : 0) - (b.closed ? 1 : 0)); };
    const used = (id) => S.rvs.filter((r) => !r.deletedAt && r.stage === id).length;
    function render() {
      box.replaceChildren();
      const acts = S.settings.stages.filter((s) => !s.closed);
      S.settings.stages.forEach((st) => {
        const ai = acts.findIndex((x) => x.id === st.id);
        const name = h('input', { type: 'text', value: st.name, 'aria-label': 'Stage name' });
        name.addEventListener('change', () => { const v = name.value.trim(); if (v) save((s) => { s.stages.find((x) => x.id === st.id).name = v; }); else name.value = st.name; });
        const days = st.closed ? null : h('input', { type: 'number', min: '0', max: '365', inputmode: 'numeric', value: st.days == null ? '' : String(st.days), placeholder: 'Default (' + S.settings.defaultStaleDays + ')', 'aria-label': 'Days before flagged' });
        if (days) days.addEventListener('change', () => { const n = days.value.trim() === '' ? null : num(days.value); save((s) => { s.stages.find((x) => x.id === st.id).days = n; }); });
        box.appendChild(h('div', { class: 'card' },
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' } },
            h('div', { style: { flex: 1 } }, name),
            !st.closed ? h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move up', disabled: ai === 0, onclick: () => { save((s) => { const a = s.stages.findIndex((x) => x.id === st.id); const t = s.stages[a - 1]; s.stages[a - 1] = s.stages[a]; s.stages[a] = t; }); render(); } }, icon('up')) : null,
            !st.closed ? h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move down', disabled: ai === acts.length - 1, onclick: () => { save((s) => { const a = s.stages.findIndex((x) => x.id === st.id); const t = s.stages[a + 1]; s.stages[a + 1] = s.stages[a]; s.stages[a] = t; }); render(); } }, icon('down')) : null),
          st.closed
            ? h('div', { class: 'muted small' }, 'Closed stage. Records here are never flagged and need an archive reason.')
            : h('div', null,
              h('div', { class: 'field', style: { marginBottom: '6px' } }, h('label', null, 'Days before flagged'), days),
              h('div', { class: 'btn-row' }, h('button', {
                class: 'btn sm danger', type: 'button',
                onclick: async () => {
                  const n = used(st.id);
                  if (n) { toast(n + ' ' + lbl('rvs') + ' are in this stage. Move them first.'); return; }
                  if (acts.length <= 1) { toast('Keep at least one active stage.'); return; }
                  if (await confirmDialog({ title: 'Delete stage "' + st.name + '"?', confirmText: 'Delete', danger: true })) { save((s) => { s.stages = s.stages.filter((x) => x.id !== st.id); }); render(); }
                },
              }, icon('trash', 16), 'Delete stage')))));
      });
    }
    render();
    return page('Lead stages', [
      hint('Order is the funnel from first contact to study. "Days before flagged" is how long an ' + lbl('rv') + ' can go without a logged visit before it shows as needing attention. Leave blank to use the default (' + S.settings.defaultStaleDays + ' days). Enter 0 to never flag.'),
      box,
      saveBtn('Add stage', () => { save((s) => { s.stages.push({ id: 'st-' + U.uuid().slice(0, 8), name: 'New stage', days: null, closed: false }); closedLast(s); }); box.replaceChildren(); RV.app.render(); }, 'primary block'),
    ], { noRerender: true });
  }

  // ---------- archive reasons ----------
  function reasons() {
    const box = h('div');
    const used = (id) => S.rvs.filter((r) => !r.deletedAt && r.archiveReason === id && L.isClosed(S.settings, r)).length;
    function render() {
      box.replaceChildren();
      S.settings.archiveReasons.forEach((r, i) => {
        const name = h('input', { type: 'text', value: r.name, 'aria-label': 'Reason name' });
        name.addEventListener('change', () => { const v = name.value.trim(); if (v) save((s) => { s.archiveReasons[i].name = v; }); else name.value = r.name; });
        const sw = (label, key, sub) => h('div', { class: 'switchrow' }, h('div', { class: 'grow' }, h('div', null, label), sub ? h('div', { class: 'muted small' }, sub) : null), UI.toggle(r[key], (v) => save((s) => { s.archiveReasons[i][key] = v; }), label));
        box.appendChild(h('div', { class: 'card' },
          h('div', { class: 'field', style: { marginBottom: '4px' } }, name),
          sw('Can be restored', 'restorable'),
          sw('Hidden from normal lists', 'hidden', 'Off means it still appears in search results'),
          sw('Do not call', 'dnc', 'Blocks visits and warns about duplicates'),
          h('div', { class: 'btn-row', style: { marginTop: '6px' } }, h('button', {
            class: 'btn sm danger', type: 'button',
            onclick: async () => {
              const n = used(r.id);
              if (n) { toast(n + ' archived ' + lbl('rvs') + ' use this reason.'); return; }
              if (S.settings.archiveReasons.length <= 1) { toast('Keep at least one reason.'); return; }
              if (await confirmDialog({ title: 'Delete reason "' + r.name + '"?', confirmText: 'Delete', danger: true })) { save((s) => { s.archiveReasons.splice(i, 1); }); render(); }
            },
          }, icon('trash', 16), 'Delete'))));
      });
    }
    render();
    return page('Archive reasons', [hint('Archived records are never deleted. Each reason decides whether the record can come back.'), box,
      saveBtn('Add reason', () => { save((s) => { s.archiveReasons.push({ id: 'r-' + U.uuid().slice(0, 8), name: 'New reason', restorable: true, hidden: true, dnc: false }); }); render(); }, 'primary block')], { noRerender: true });
  }

  // ---------- lists and custom fields ----------
  function fields() {
    const nb = h('textarea', { value: S.settings.lists.neighborhoods.join('\n'), style: { minHeight: '110px' } });
    nb.addEventListener('change', () => save((s) => { s.lists.neighborhoods = U.uniq(nb.value.split('\n').map((x) => x.trim()).filter(Boolean)); }));
    const hm = h('textarea', { value: S.settings.lists.howMet.join('\n'), style: { minHeight: '110px' } });
    hm.addEventListener('change', () => save((s) => { s.lists.howMet = U.uniq(hm.value.split('\n').map((x) => x.trim()).filter(Boolean)); }));
    const cbox = h('div');
    function renderCustom() {
      cbox.replaceChildren();
      S.settings.customFields.forEach((c, i) => {
        const nm = h('input', { type: 'text', value: c.name, 'aria-label': 'Field name' });
        nm.addEventListener('change', () => { const v = nm.value.trim(); if (v) save((s) => { s.customFields[i].name = v; }); else nm.value = c.name; });
        cbox.appendChild(h('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } }, h('div', { style: { flex: 1 } }, nm),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Delete field', onclick: async () => { if (await confirmDialog({ title: 'Delete field "' + c.name + '"?', message: 'Values already saved on records stay in your backup but are no longer shown.', confirmText: 'Delete', danger: true })) { save((s) => { s.customFields.splice(i, 1); }); renderCustom(); } } }, icon('trash'))));
      });
    }
    renderCustom();
    return page('Lists and custom fields', [
      field(lbl('neighborhood') + 's', nb, 'One per line. Names already used on records are suggested automatically too.'),
      field('How we met options', hm, 'One per line.'),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Custom text fields'), cbox,
        saveBtn('Add custom field', () => { save((s) => { s.customFields.push({ id: 'cf-' + U.uuid().slice(0, 8), name: 'New field', type: 'text' }); }); renderCustom(); }, 'sm')),
    ], { noRerender: true });
  }

  // ---------- labels ----------
  function labels() {
    const def = RV.defaults.defaultSettings().labels;
    const names = { rv: 'Record (singular)', rvs: 'Record (plural)', notHome: 'Not home button', notHomeShort: 'Not home short form', recordVisit: 'Record visit button', campaign: 'Campaign', scriptures: 'Scriptures', topics: 'Topics', neighborhood: 'Neighborhood', archive: 'Archive', today: 'Today screen', bibleStudy: 'Bible study' };
    const box = h('div');
    Object.keys(def).forEach((k) => {
      const inp = h('input', { type: 'text', value: S.settings.labels[k] || '' });
      inp.addEventListener('change', () => { const v = inp.value.trim() || def[k]; inp.value = v; save((s) => { s.labels[k] = v; }); });
      box.appendChild(field(names[k] || k, inp));
    });
    return page('Labels', [hint('Change the words used across the app. Changes show the next time a screen opens.'), box,
      saveBtn('Reset to defaults', async () => { if (await confirmDialog({ title: 'Reset all labels?', confirmText: 'Reset' })) { save((s) => { s.labels = Object.assign({}, def); }); RV.app.render(); } }, 'block')], { noRerender: true });
  }

  // ---------- attention ----------
  function attention() {
    const mk = (key, label, hintText, min, max) => {
      const i = h('input', { type: 'number', min: String(min), max: String(max), inputmode: 'numeric', value: String(S.settings[key]) });
      i.addEventListener('change', () => { const n = num(i.value); if (n == null || n < min || n > max) { i.value = String(S.settings[key]); return; } save((s) => { s[key] = n; }); });
      return field(label, i, hintText);
    };
    const minTries = h('input', { type: 'number', min: '1', max: '10', inputmode: 'numeric', value: String(S.settings.notHomeBanner.minAttempts) });
    minTries.addEventListener('change', () => { const n = num(minTries.value); if (n == null || n < 1 || n > 10) { minTries.value = String(S.settings.notHomeBanner.minAttempts); return; } save((s) => { s.notHomeBanner.minAttempts = n; }); });
    return page('Needs attention', [
      hint('An ' + lbl('rv') + ' is flagged by how long it has been since the last logged visit, unless it has a next visit date or is snoozed.'),
      mk('defaultStaleDays', 'Default days before flagged', 'Used for stages with no number of their own.', 1, 365),
      mk('comingUpDays', 'Coming up window (days)', 'Planned visit dates within this many days are marked as coming up.', 1, 60),
      mk('soonDays', 'Heads-up before overdue (days)', 'Flag as coming up this many days before an ' + lbl('rv') + ' becomes overdue.', 0, 14),
      mk('dayTagForceFactor', 'Best-day safety net (times the usual timing)', 'A ' + lbl('rv') + ' with a best day is only flagged overdue on that day. After this many times its usual timing, it is flagged on any day so nothing gets buried.', 1, 10),
      mk('stuckFactor', 'Stuck in stage (times the usual timing)', 'Insights lists ' + lbl('rvs') + ' that have stayed in one stage this many times the stage\'s timing.', 2, 20),
      h('div', { class: 'card' },
        h('div', { class: 'switchrow' }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, 'Not-home banner'), h('div', { class: 'muted small' }, 'On a record, warn when it is a day and time you have mostly found them out. Hidden inside their best times.')),
          UI.toggle(S.settings.notHomeBanner.on, (v) => save((s) => { s.notHomeBanner.on = v; }), 'Not-home banner')),
        field('Tries needed before it shows', minTries, 'Counts ' + lbl('notHome').toLowerCase() + ' entries in the same weekday and part of day with no recorded visit.')),
    ], { noRerender: true });
  }

  // ---------- security ----------
  function security() {
    const box = h('div');
    function pinSheet(title, onDone) {
      const a = h('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '8', autocomplete: 'off', 'data-autofocus': true });
      const b = h('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '8', autocomplete: 'off' });
      const err = h('div', { class: 'small', style: { color: 'var(--danger)', minHeight: '1.2em' } });
      sheet(title, (close) => h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          if (!/^\d{4,8}$/.test(a.value)) { err.textContent = 'Use 4 to 8 digits.'; return; }
          if (a.value !== b.value) { err.textContent = 'The two PINs do not match.'; return; }
          await onDone(a.value); close();
        },
      }, field('New PIN', a, '4 to 8 digits'), field('Repeat PIN', b), err,
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save PIN'))));
    }
    async function setPin(pin) {
      const salt = U.uuid();
      const hash = await U.sha256hex(salt + ':' + pin);
      save((s) => { s.lock.on = true; s.lock.salt = salt; s.lock.hash = hash; });
      toast('PIN lock is on');
      render();
    }
    function askPin(title, onOk) {
      const a = h('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '8', autocomplete: 'off', 'data-autofocus': true });
      const err = h('div', { class: 'small', style: { color: 'var(--danger)', minHeight: '1.2em' } });
      sheet(title, (close) => h('form', {
        onsubmit: async (e) => { e.preventDefault(); if (await RV.app.verifyPin(a.value)) { close(); onOk(); } else { err.textContent = 'Wrong PIN.'; a.value = ''; } },
      }, field('Current PIN', a), err, h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Continue'))));
    }
    function render() {
      box.replaceChildren();
      const on = S.settings.lock.on;
      box.appendChild(h('div', { class: 'card stack' },
        h('div', null, h('div', { style: { fontWeight: 600 } }, on ? 'PIN lock is on' : 'PIN lock is off'),
          h('div', { class: 'muted small' }, 'The lock screen keeps casual snoopers out if your phone is picked up. Your records are not encrypted on the device.')),
        on
          ? h('div', { class: 'btn-row' },
            h('button', { class: 'btn', type: 'button', onclick: () => askPin('Change PIN', () => pinSheet('New PIN', setPin)) }, 'Change PIN'),
            h('button', { class: 'btn danger', type: 'button', onclick: () => askPin('Remove PIN', () => { save((s) => { s.lock = { on: false, salt: '', hash: '', timeoutMin: s.lock.timeoutMin }; }); toast('PIN lock removed'); render(); }) }, 'Remove PIN'))
          : h('button', { class: 'btn primary', type: 'button', onclick: () => pinSheet('Set a PIN', setPin) }, 'Set a PIN'),
        on ? h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', null, 'Lock after leaving the app for'),
          F.select([{ value: 0, label: 'Right away' }, { value: 1, label: '1 minute' }, { value: 5, label: '5 minutes' }, { value: 15, label: '15 minutes' }], S.settings.lock.timeoutMin,
            { onchange: (e) => save((s) => { s.lock.timeoutMin = parseInt(e.target.value, 10); }) })) : null,
        on ? h('button', { class: 'btn', type: 'button', onclick: () => RV.app.lockNow() }, icon('lock', 18), 'Lock now') : null),
        h('div', { class: 'banner warn' }, icon('alert'), h('div', { class: 'body' }, 'If you forget the PIN, the only way back in is to clear this app\'s data, which erases your records. Keep a backup (Settings > Data and backup).')));
    }
    render();
    return page('Security', [box], { noRerender: true });
  }

  // ---------- data ----------
  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
      inp.addEventListener('change', async () => { const f = inp.files && inp.files[0]; inp.remove(); resolve(f ? { name: f.name, text: await f.text() } : null); });
      inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
      document.body.appendChild(inp);
      inp.click();
    });
  }
  const stamp = () => U.toDateStr(new Date());

  async function importWizard() {
    const file = await pickFile('.csv,text/csv,text/plain');
    if (!file) return;
    const rows = U.parseCSV(file.text);
    if (rows.length < 2) { toast('That file has no data rows.'); return; }
    const headers = rows[0], body = rows.slice(1);
    const mapping = L.guessMapping(headers);
    const selects = {};
    const defStage = F.select(F.stageOptions(), (S.settings.stages.find((s) => s.id === 'initial') || S.settings.stages[0]).id);
    const skipDup = h('input', { type: 'checkbox', checked: true });
    const summary = h('div', { class: 'banner info' });
    const calc = () => {
      const map = {};
      Object.keys(selects).forEach((k) => { const v = parseInt(selects[k].value, 10); if (v >= 0) map[k] = v; });
      const res = L.importRows(body, map, S.settings, defStage.value);
      let dups = 0;
      const seen = [];
      const keep = res.rvs.filter((r) => {
        const d = L.duplicateMatches(r, S.rvs.concat(seen)).length;
        if (d) dups++;
        const drop = skipDup.checked && d;
        if (!drop) seen.push(r);
        return !drop;
      });
      return { res, keep, dups, map };
    };
    const refresh = () => {
      const { res, keep, dups, map } = calc();
      summary.replaceChildren(icon('note'), h('div', { class: 'body' },
        map.name == null ? 'Choose which column holds the name.' : keep.length + ' ' + lbl('rvs') + ' will be added.' +
          (res.skipped.length ? ' ' + res.skipped.length + ' rows skipped (no name).' : '') +
          (dups ? ' ' + dups + (skipDup.checked ? ' skipped as possible duplicates.' : ' look like duplicates.') : '')));
    };
    sheet('Import CSV', (close) => {
      const form = h('div', null,
        h('p', { class: 'muted small', style: { marginTop: 0 } }, file.name + ': ' + body.length + ' rows. Match your columns to the fields below.'));
      L.IMPORT_FIELDS.forEach((f) => {
        const sel = h('select');
        sel.appendChild(h('option', { value: '-1' }, '(skip)'));
        headers.forEach((hd, i) => sel.appendChild(h('option', { value: String(i), selected: mapping[f.key] === i }, hd || '(column ' + (i + 1) + ')')));
        sel.addEventListener('change', refresh);
        selects[f.key] = sel;
        form.appendChild(field(f.label + (f.required ? ' (required)' : ''), sel));
      });
      defStage.addEventListener('change', refresh);
      skipDup.addEventListener('change', refresh);
      form.appendChild(field('Stage for rows without a stage', defStage));
      form.appendChild(h('label', { class: 'check' }, skipDup, 'Skip rows that match an existing address or phone'));
      form.appendChild(summary);
      form.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
        h('button', {
          class: 'btn primary', type: 'button',
          onclick: () => {
            const { res, keep, map } = calc();
            if (map.name == null) { toast('Choose the name column first.'); return; }
            const ids = new Set(keep.map((r) => r.id));
            ST.importRvs(keep, res.entries.filter((e) => ids.has(e.rvId)));
            close();
            toast('Imported ' + keep.length + ' ' + lbl('rvs'));
            location.hash = '#/rvs';
          },
        }, 'Import')));
      refresh();
      return form;
    });
  }

  async function restoreFlow() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    let data;
    try { data = JSON.parse(file.text); } catch (e) { toast('Could not read that file.'); return; }
    if (!data || data.app !== 'rv-app') { toast('This is not an RV app backup.'); return; }
    const live = data.rvs.filter((r) => !r.deletedAt).length;
    const choice = await UI.pick('Restore backup (' + live + ' ' + lbl('rvs') + ')', [
      { value: 'merge', label: 'Merge', sub: 'Keep what is here, add and update from the backup' },
      { value: 'replace', label: 'Replace everything', sub: 'Erase this device\'s data first' },
    ]);
    if (!choice) return;
    if (choice === 'replace' && !(await confirmDialog({ title: 'Replace everything?', message: 'All records on this device will be replaced by the backup.', confirmText: 'Replace', danger: true }))) return;
    try { await ST.restore(data, choice); toast('Backup restored'); RV.app.applyDisplay(); } catch (e) { toast(e.message || 'Restore failed.'); }
  }

  function data() {
    const last = (() => { try { return localStorage.getItem('rvapp.lastBackup'); } catch (e) { return null; } })();
    const live = S.rvs.filter((r) => !r.deletedAt).length;
    const btn = (ic, label, sub, fn) => h('button', { class: 'setrow', type: 'button', onclick: fn }, icon(ic, 20), h('div', { class: 'main' }, h('div', null, label), sub ? h('div', { class: 'sub' }, sub) : null));
    return page('Data and backup', [
      h('div', { class: 'banner ' + (S.persistent ? 'info' : 'danger') }, icon(S.persistent ? 'lock' : 'alert'), h('div', { class: 'body' },
        S.persistent ? live + ' ' + lbl('rvs') + ' stored on this device. ' + (last ? 'Last backup: ' + U.fmtDate(last) + '.' : 'No backup yet.') : 'This browser is blocking storage, so nothing will be kept after you close the app.')),
      btn('download', 'Download backup', 'Everything, as one file. Keep a copy somewhere safe.', () => {
        UI.download('rv-backup-' + stamp() + '.json', JSON.stringify(ST.exportAll(), null, 1), 'application/json');
        try { localStorage.setItem('rvapp.lastBackup', U.toDateStr(new Date())); } catch (e) { /* ignore */ }
        toast('Backup downloaded');
      }),
      btn('upload', 'Restore from backup', 'Merge or replace from a backup file', restoreFlow),
      btn('download', 'Export ' + lbl('rvs') + ' as CSV', 'For spreadsheets', () => UI.download('rvs-' + stamp() + '.csv', L.rvsToCsv(ST.items(), S.settings), 'text/csv')),
      btn('download', 'Export visit log as CSV', 'Every visit, not-home and note', () => UI.download('visit-log-' + stamp() + '.csv', L.entriesToCsv(S.entries, S.rvs, S.settings), 'text/csv')),
      btn('upload', 'Import from CSV', 'Match your columns to ' + lbl('rv') + ' fields', importWizard),
      h('div', { style: { height: '12px' } }),
      btn('trash', 'Erase all data', 'Removes everything on this device', async () => {
        if (!(await confirmDialog({ title: 'Erase everything?', message: 'All ' + lbl('rvs') + ', visits, libraries and settings on this device will be deleted. Download a backup first if you might want them.', confirmText: 'Erase everything', danger: true }))) return;
        await ST.eraseAll();
        RV.app.applyDisplay();
        toast('All data erased');
        location.hash = '#/home';
      }),
    ], { noRerender: true });
  }

  function about() {
    return page('About', [
      h('div', { class: 'card stack' },
        h('div', { style: { fontWeight: 600 } }, 'JW-CRM (working name) · version ' + RV.VERSION),
        h('div', { class: 'muted small' }, 'A private follow-up tracker. Records stay on this device. Nothing is sent anywhere.'),
        h('div', { class: 'muted small' }, 'To install on Android: Chrome menu > Install app. On iPhone: Safari Share > Add to Home Screen. Once installed it opens without a signal.')),
    ], { noRerender: true });
  }

  RV.settingsScreens = { index, display, home: homeSettings, lib, campaigns, campaignForm, stages, reasons, fields, labels, attention, security, data, about };
})(window);
