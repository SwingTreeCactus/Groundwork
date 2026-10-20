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
  const hint = () => null;
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
        row('#/settings/home', 'Home screen', null, 'home'),
        row('#/settings/lib/topic', lbl('topics'), cnt('topic') + ' saved', 'note'),
        row('#/settings/campaigns', lbl('campaign') + 's', cnt('campaign') + ' saved', 'calendar'),
        row('#/settings/stages', 'Lead stages', S.settings.stages.filter((s) => !s.closed).map((s) => s.name).join(' › '), 'shuffle'),
        row('#/settings/reasons', 'Archive reasons', S.settings.archiveReasons.map((r) => r.name).join(', '), 'archive'),
        row('#/settings/fields', 'Lists and custom fields', null, 'users'),
        row('#/settings/labels', 'Labels', null, 'edit'),
        row('#/settings/attention', 'Needs attention', null, 'clock'),
        row('#/settings/security', 'Security', S.settings.lock.on ? 'PIN lock is on' : 'PIN lock is off', 'lock'),
        row('#/settings/data', 'Data and backup', null, 'download'),
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
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Accent color'),
        seg([{ value: 'purple', label: 'Purple' }, { value: 'blue', label: 'Blue' }], S.settings.accent || 'purple',
          (v) => { save((s) => { s.accent = v; }); RV.app.applyDisplay(); })),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Text size'),
        seg([{ value: 0.9, label: 'Small' }, { value: 1, label: 'Default' }, { value: 1.15, label: 'Large' }, { value: 1.3, label: 'Extra large' }], S.settings.textScale,
          (v) => { save((s) => { s.textScale = v; }); RV.app.applyDisplay(); })),
      h('div', { class: 'switchrow' }, h('div', { class: 'grow' }, h('div', null, 'Show ' + lbl('notHomeShort') + ' button on list rows')),
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
    return page('Home screen', [box], { noRerender: true });
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
    const topic = h('input', { type: 'text', value: c ? c.topic || '' : '', autocomplete: 'off', placeholder: 'Topic' });
    const start = h('input', { type: 'date', value: c ? c.start || '' : U.toDateStr(new Date()) });
    const end = h('input', { type: 'date', value: c ? c.end || '' : '' });
    const text = h('textarea', { value: c ? c.text || '' : '', placeholder: 'Details', style: { minHeight: '84px' } });
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
            ? h('div', { class: 'muted small' }, 'Closed stage')
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
      h('p', { class: 'muted small', style: { margin: '0 0 12px' } }, 'Days before flagged. Blank = default (' + S.settings.defaultStaleDays + '), 0 = never.'),
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
          sw('Hidden from normal lists', 'hidden', null),
          sw('Do not call', 'dnc', null),
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
    // areas: one list, with how many records use each; rename merges into an existing name
    const areaKey = (x) => String(x || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const abox = h('div');
    const live = () => S.rvs.filter((r) => !r.deletedAt);
    function renderAreas() {
      const names = ST.neighborhoods();
      abox.replaceChildren(h('div', { class: 'list' }, names.length ? names.map((n) => {
        const used = live().filter((r) => r.neighborhood === n).length;
        return h('button', { class: 'row area-row', type: 'button', onclick: () => areaSheet(n, used) },
          h('div', { class: 'main' }, h('div', { class: 'name' }, n), h('div', { class: 'line2' }, used + ' ' + (used === 1 ? lbl('rv') : lbl('rvs')),
            names.some((x) => x !== n && areaKey(x) === areaKey(n)) ? h('span', { class: 'dup-hint' }, ' · Looks like a duplicate. Tap to merge') : null)), icon('right', 18));
      }) : h('div', { class: 'muted small', style: { padding: '14px 16px' } }, 'None yet.')),
      saveBtn('Add ' + lbl('neighborhood').toLowerCase(), async () => {
        const v = String(await UI.textPrompt({ title: 'New ' + lbl('neighborhood').toLowerCase(), placeholder: 'Name' }) || '').trim().replace(/\s+/g, ' ');
        if (!v) return;
        if (ST.neighborhoods().some((n) => areaKey(n) === areaKey(v))) { toast('Already on the list'); return; }
        save((s) => { s.lists.neighborhoods = U.uniq(s.lists.neighborhoods.concat(v)); }); renderAreas();
      }, 'sm'));
    }
    function areaSheet(name, used) {
      sheet(name, (close) => h('div', null,
        h('button', { class: 'opt', type: 'button', onclick: async () => {
          close();
          const v = String(await UI.textPrompt({ title: 'Rename ' + name, value: name, placeholder: 'Name' }) || '').trim().replace(/\s+/g, ' ');
          if (!v || v === name) return;
          const other = ST.neighborhoods().find((n) => n !== name && areaKey(n) === areaKey(v));
          const target = other || v;
          live().filter((r) => r.neighborhood === name).forEach((r) => ST.updateRv(r.id, { neighborhood: target }));
          save((s) => { s.lists.neighborhoods = U.uniq(s.lists.neighborhoods.filter((n) => n !== name).concat(target)); });
          toast(other ? 'Merged into ' + other : 'Renamed to ' + target);
          renderAreas();
        } }, h('div', null, h('div', null, 'Rename or merge'), h('div', { class: 'sub' }, 'Type an existing name to merge them'))),
        h('button', { class: 'opt', type: 'button', onclick: async () => {
          close();
          if (used && !(await confirmDialog({ title: 'Remove ' + name + '?', message: used + ' ' + (used === 1 ? lbl('rv') : lbl('rvs')) + ' will have no ' + lbl('neighborhood').toLowerCase() + '.', confirmText: 'Remove', danger: true }))) return;
          live().filter((r) => r.neighborhood === name).forEach((r) => ST.updateRv(r.id, { neighborhood: '' }));
          save((s) => { s.lists.neighborhoods = s.lists.neighborhoods.filter((n) => n !== name); });
          renderAreas();
        } }, h('div', null, h('div', null, 'Remove'), h('div', { class: 'sub' }, used ? 'Clears it from ' + used + ' ' + (used === 1 ? lbl('rv') : lbl('rvs')) : 'Not used on any record')))));
    }
    renderAreas();
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
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, lbl('neighborhood') + 's'), abox),
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
        h('div', { class: 'switchrow' }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, 'Not-home banner')),
          UI.toggle(S.settings.notHomeBanner.on, (v) => save((s) => { s.notHomeBanner.on = v; }), 'Not-home banner')),
        field('Tries needed before it shows', minTries)),
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
          h('div', { class: 'muted small' }, 'Records are not encrypted.')),
        on
          ? h('div', { class: 'btn-row' },
            h('button', { class: 'btn', type: 'button', onclick: () => askPin('Change PIN', () => pinSheet('New PIN', setPin)) }, 'Change PIN'),
            h('button', { class: 'btn danger', type: 'button', onclick: () => askPin('Remove PIN', () => { save((s) => { s.lock = { on: false, salt: '', hash: '', timeoutMin: s.lock.timeoutMin }; }); toast('PIN lock removed'); render(); }) }, 'Remove PIN'))
          : h('button', { class: 'btn primary', type: 'button', onclick: () => pinSheet('Set a PIN', setPin) }, 'Set a PIN'),
        on ? h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', null, 'Lock after leaving the app for'),
          F.select([{ value: 0, label: 'Right away' }, { value: 1, label: '1 minute' }, { value: 5, label: '5 minutes' }, { value: 15, label: '15 minutes' }], S.settings.lock.timeoutMin,
            { onchange: (e) => save((s) => { s.lock.timeoutMin = parseInt(e.target.value, 10); }) })) : null,
        on ? h('button', { class: 'btn', type: 'button', onclick: () => RV.app.lockNow() }, icon('lock', 18), 'Lock now') : null),
        h('div', { class: 'banner warn' }, icon('alert'), h('div', { class: 'body' }, 'Forget the PIN and the only way in is erasing app data. Keep a backup.')));
    }
    render();
    return page('Security', [box], { noRerender: true });
  }

  // ---------- data ----------
  function pickFile(accept, binary) {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
      inp.addEventListener('change', async () => { const f = inp.files && inp.files[0]; inp.remove(); resolve(f ? (binary ? { name: f.name, buffer: await f.arrayBuffer() } : { name: f.name, text: await f.text() }) : null); });
      inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
      document.body.appendChild(inp);
      inp.click();
    });
  }
  const stamp = () => U.toDateStr(new Date());

  async function maImport() {
    const file = await pickFile('', true);
    if (!file) return;
    let parsed;
    try {
      const bytes = await RV.smile.gunzipIfNeeded(file.buffer);
      const pairs = RV.smile.decode(bytes, { pairs: true });
      const closed = S.settings.stages.find((s) => s.closed);
      parsed = (stageId, skipDup, bestFromLast) => {
        const res = RV.ma.convert(pairs, { uuid: U.uuid, stageId, closedStageId: closed && closed.id, closedReason: 'other', bestFromLast, howMet: S.settings.lists.howMet.includes('House to house') ? 'House to house' : '' });
        res.rvs = res.rvs.map((r) => ST.blankRv(r));
        let dups = 0;
        const seen = [];
        // imported addresses carry city and zip, so also match on the bare street of records saved without one
        const streetKey = (a) => U.normAddress(String(a || '').split(',')[0]);
        const matchesOf = (r, pool) => {
          const hit = L.duplicateMatches(r, pool);
          if (hit.length) return hit;
          const k = streetKey(r.address);
          return k ? pool.filter((x) => !x.deletedAt && x.address && x.address.indexOf(',') < 0 && U.normAddress(x.address) === k) : [];
        };
        const updates = []; // existing people who have no best day yet get one from the backup
        const keep = res.rvs.filter((r) => {
          const hit = matchesOf(r, S.rvs.concat(seen));
          if (hit.length) dups++;
          const drop = skipDup && hit.length;
          if (drop && bestFromLast && r.bestDays.length) {
            const ex = hit.find((x) => S.rvs.includes(x) && !L.dayTagsOf(x).length);
            if (ex && !updates.some((u) => u.id === ex.id)) updates.push({ id: ex.id, bestDays: r.bestDays });
          }
          if (!drop) seen.push(r);
          return !drop;
        });
        return { res, keep, dups, updates };
      };
      parsed(S.settings.stages[0].id, false, false);
    } catch (e) {
      toast('Could not read that file as a Ministry Assistant backup.');
      return;
    }
    const defStage = F.select(F.stageOptions(), (S.settings.stages.find((s) => s.id === 'initial') || S.settings.stages[0]).id);
    const skipDup = h('input', { type: 'checkbox', checked: true });
    const bestDay = h('input', { type: 'checkbox', checked: true });
    const summary = h('div', { class: 'banner info' });
    const refresh = () => {
      const { res, keep, dups, updates } = parsed(defStage.value, skipDup.checked, bestDay.checked);
      summary.replaceChildren(icon('note'), h('div', { class: 'body' },
        keep.length + ' ' + lbl('rvs') + ' and ' + res.entries.filter((e) => keep.some((r) => r.id === e.rvId)).length + ' notes will be added.' +
        (updates.length ? ' ' + updates.length + ' already here will get a best day.' : '') +
        (dups ? ' ' + dups + (skipDup.checked ? ' skipped as possible duplicates.' : ' look like duplicates.') : '') +
        (res.skipped ? ' ' + res.skipped + ' without a name skipped.' : '')));
    };
    sheet('Import from Ministry Assistant', (close) => {
      defStage.addEventListener('change', refresh);
      skipDup.addEventListener('change', refresh);
      bestDay.addEventListener('change', refresh);
      const form = h('div', null,
        field('Stage for imported people', defStage),
        h('label', { class: 'check' }, skipDup, 'Skip people who match an existing address'),
        h('label', { class: 'check' }, bestDay, 'Set best day from their last visit'),
        summary,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', {
            class: 'btn primary', type: 'button',
            onclick: () => {
              const { res, keep, updates } = parsed(defStage.value, skipDup.checked, bestDay.checked);
              const ids = new Set(keep.map((r) => r.id));
              ST.importRvs(keep, res.entries.filter((e) => ids.has(e.rvId)));
              updates.forEach((u) => ST.updateRv(u.id, { bestDays: u.bestDays, dayPrimary: null, daySecondary: null }));
              close();
              toast(keep.length ? 'Imported ' + keep.length + ' ' + lbl('rvs') + (updates.length ? ', updated ' + updates.length : '') : 'Updated ' + updates.length + ' ' + lbl('rvs'));
              location.hash = '#/rvs';
            },
          }, 'Import')));
      refresh();
      return form;
    });
  }

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
        h('p', { class: 'muted small', style: { marginTop: 0 } }, file.name + ': ' + body.length + ' rows'));
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
    await restoreData(data);
  }
  async function restoreData(data) {
    if (!data || data.app !== 'rv-app' || !Array.isArray(data.rvs)) { toast('This is not an RV app backup.'); return; }
    const live = data.rvs.filter((r) => !r.deletedAt).length;
    const choice = await UI.pick('Restore backup (' + live + ' ' + lbl('rvs') + ')', [
      { value: 'merge', label: 'Merge', sub: 'Keep what is here, add and update from the backup' },
      { value: 'replace', label: 'Replace everything', sub: 'Erase this device\'s data first' },
    ]);
    if (!choice) return;
    if (choice === 'replace' && !(await confirmDialog({ title: 'Replace everything?', message: 'All records on this device will be replaced by the backup.', confirmText: 'Replace', danger: true }))) return;
    try { await ST.restore(data, choice); toast('Backup restored'); RV.app.applyDisplay(); } catch (e) { toast(e.message || 'Restore failed.'); }
  }

  // Google Drive panel: refreshes itself while it is on screen
  function drivePanel() {
    const D = RV.drive;
    const box = h('div', { style: { marginBottom: '12px' } });
    const row = (ic, label, sub, fn, cls) => h('button', { class: 'setrow' + (cls ? ' ' + cls : ''), type: 'button', onclick: fn }, icon(ic, 20), h('div', { class: 'main' }, h('div', null, label), sub ? h('div', { class: 'sub' }, sub) : null));
    function paint() {
      const s = D.status();
      const kids = [];
      if (!s.configured) {
        kids.push(h('div', { class: 'card muted small' }, 'Google Drive backup is not set up in this copy of the app.'));
      } else if (!s.connected) {
        kids.push(row('upload', 'Connect Google Drive', 'Backs up to your own Drive', () => D.connect()));
      } else {
        const when = s.lastSaved ? 'Saved ' + U.fmtDateTime(s.lastSaved) : 'Not saved yet';
        const state = s.busy ? 'Saving…' : s.error ? s.error : !s.tokenOk && s.dirty ? 'Paused. Reconnect to save.' : s.dirty ? 'Changes waiting' : when;
        kids.push(h('div', { class: 'card stack' },
          h('div', null, h('div', { style: { fontWeight: 500 } }, 'Google Drive'), h('div', { class: 'muted small' }, state)),
          h('div', { class: 'btn-row' },
            s.tokenOk ? h('button', { class: 'btn primary', type: 'button', disabled: s.busy, onclick: async () => { if (await D.backupNow()) toast('Saved to Google Drive'); } }, 'Back up now')
              : h('button', { class: 'btn primary', type: 'button', onclick: () => D.connect() }, 'Reconnect'),
            h('button', { class: 'btn', type: 'button', disabled: s.busy || !s.tokenOk, onclick: async () => {
              try { const data = await D.fetchBackup(); if (!data) { toast('No backup found in Drive.'); return; } await restoreData(data); } catch (e) { toast(e.message || 'Could not read Drive.'); }
            } }, 'Restore')),
          h('button', { class: 'link-quiet', type: 'button', style: { alignSelf: 'flex-start', background: 'none', border: 0, cursor: 'pointer' }, onclick: async () => {
            if (await confirmDialog({ title: 'Disconnect Google Drive?', message: 'The backup file stays in your Drive.', confirmText: 'Disconnect' })) D.disconnect();
          } }, 'Disconnect')));
      }
      box.replaceChildren(...kids);
    }
    paint();
    const off = D.onChange(() => { if (!box.isConnected) { off(); return; } paint(); });
    return box;
  }

  function data() {
    const last = (() => { try { return localStorage.getItem('rvapp.lastBackup'); } catch (e) { return null; } })();
    const live = S.rvs.filter((r) => !r.deletedAt).length;
    const btn = (ic, label, sub, fn) => h('button', { class: 'setrow', type: 'button', onclick: fn }, icon(ic, 20), h('div', { class: 'main' }, h('div', null, label), sub ? h('div', { class: 'sub' }, sub) : null));
    return page('Data and backup', [
      drivePanel(),
      h('div', { class: 'banner ' + (S.persistent ? 'info' : 'danger') }, icon(S.persistent ? 'lock' : 'alert'), h('div', { class: 'body' },
        S.persistent ? live + ' ' + lbl('rvs') + ' on this device. ' + (last ? 'Last backup: ' + U.fmtDate(last) + '.' : 'No backup yet.') : 'This browser is blocking storage. Nothing will be kept.')),
      btn('download', 'Download backup', null, () => {
        UI.download('rv-backup-' + stamp() + '.json', JSON.stringify(ST.exportAll(), null, 1), 'application/json');
        try { localStorage.setItem('rvapp.lastBackup', U.toDateStr(new Date())); } catch (e) { /* ignore */ }
        toast('Backup downloaded');
      }),
      btn('upload', 'Restore from backup', null, restoreFlow),
      btn('download', 'Export ' + lbl('rvs') + ' as CSV', null, () => UI.download('rvs-' + stamp() + '.csv', L.rvsToCsv(ST.items(), S.settings), 'text/csv')),
      btn('download', 'Export visit log as CSV', null, () => UI.download('visit-log-' + stamp() + '.csv', L.entriesToCsv(S.entries, S.rvs, S.settings), 'text/csv')),
      btn('upload', 'Import from CSV', null, importWizard),
      btn('upload', 'Import from Ministry Assistant', null, maImport),
      h('div', { style: { height: '12px' } }),
      btn('trash', 'Erase all data', null, async () => {
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
        h('div', { style: { fontWeight: 600 } }, 'Groundwork · version ' + RV.VERSION),
        h('div', { class: 'muted small' }, 'Android: Chrome menu > Install app. iPhone: Safari Share > Add to Home Screen.'),
        h('a', { class: 'muted small', href: 'privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy policy')),
    ], { noRerender: true });
  }

  RV.settingsScreens = { index, display, home: homeSettings, lib, campaigns, campaignForm, stages, reasons, fields, labels, attention, security, data, about };
})(window);
