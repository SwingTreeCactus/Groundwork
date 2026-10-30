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
  // v2.28: grouped like the menu: Ministry (Topics, Campaigns), App, Customize; About as the foot line
  const MENU = () => {
    const cnt = (k) => ST.libItems(k).length;
    return [
      ['Prepare', [['lib/topic', lbl('topics'), cnt('topic') + ' saved', 'note'], ['campaigns', lbl('campaign') + 's', cnt('campaign') + ' saved', 'calendar']]],
      ['App', [['display', 'Display', 'Theme, text size, Home screen', 'sliders'], ['data', 'Backup and import', null, 'download'],
        ['ai', 'Note cleanup', RV.ai && RV.ai.available() ? 'Claude is on' : 'Off', 'sparkle'], ['security', 'Security', S.settings.lock.on ? 'PIN lock is on' : 'PIN lock is off', 'lock']]],
      [null, [['customize', 'Customize', 'Stages, archive reasons, fields, labels', 'edit']]],
    ];
  };
  const setRow = (href, title, sub, ic) =>
    h('a', { class: 'setrow', href }, icon(ic, 20), h('div', { class: 'main' }, h('div', null, title), sub ? h('div', { class: 'sub' }, sub) : null), icon('right', 18));
  function index() {
    return {
      title: 'Menu',
      el: h('div', null,
        MENU().map(([head, rows]) => h('section', { class: 'setgroup' }, head ? h('h2', { class: 'sethead' }, head) : null,
          rows.map(([path, title, sub, ic]) => setRow('#/settings/' + path, title, sub, ic)))),
        h('a', { class: 'setfoot', href: '#/settings/about' }, 'Groundwork ' + RV.VERSION)),
    };
  }
  // v2.28: one full page for the things set once (stages, reasons, fields, labels, when someone needs attention)
  function customize() {
    const nFields = (S.settings.customFields || []).length;
    return page('Customize', [
      setRow('#/settings/stages', 'Lead stages', S.settings.stages.filter((s) => !s.closed).map((s) => s.name).join(' › '), 'shuffle'),
      setRow('#/settings/reasons', 'Archive reasons', S.settings.archiveReasons.map((r) => r.name).join(', '), 'archive'),
      setRow('#/settings/fields', 'Lists and custom fields', nFields ? nFields + (nFields === 1 ? ' custom field' : ' custom fields') : null, 'users'),
      setRow('#/settings/labels', 'Labels', 'What the app calls ' + lbl('rvs') + ', ' + lbl('notHome') + ' and more', 'edit'),
      setRow('#/settings/attention', 'Needs attention', 'When someone counts as due', 'clock'),
    ]);
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
      h('div', { class: 'switchrow' }, h('div', { class: 'grow' }, h('div', null, 'Show ' + lbl('notHomeShort') + ' button on list rows')),
        UI.toggle(S.settings.nhRowButton, (v) => save((s) => { s.nhRowButton = v; }), 'Show Not Home button on list rows')),
      h('div', { class: 'switchrow' }, h('div', { class: 'grow' }, h('div', null, 'Garden'), h('div', { class: 'muted small' }, 'Plants show each ' + lbl('rv') + "'s stage and care. Off: plain rows.")),
        UI.toggle(S.settings.garden !== false, (v) => save((s) => { s.garden = v; }), 'Garden')),
    ], { noRerender: true });
  }

  // ---------- home cards ----------
  function homeCardsBox() {
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
    return box;
  }
  function homeSettings() { return page('Home screen', [homeCardsBox()], { noRerender: true }); }

  // ---------- topics ----------
  // v2.40: Topics: the workbook library and your own, in theme folders, each switched on or off (on = shown on
  // Today). A forgiving search over titles, questions and scriptures; a scripture index at the foot.
  const TOPICS_OPEN = 'rvapp.topicsOpen';
  const openSet = () => { try { return new Set(JSON.parse(localStorage.getItem(TOPICS_OPEN) || '[]')); } catch (e) { return new Set(); } };
  const saveOpen = (set) => { try { localStorage.setItem(TOPICS_OPEN, JSON.stringify(Array.from(set))); } catch (e) { /* ignore */ } };
  function themeSheet(t) {
    const name = h('input', { type: 'text', value: t.name, 'data-autofocus': true, autocomplete: 'off' });
    const list = ST.themes(), i = list.findIndex((x) => x.id === t.id);
    const to = list[i + 1] || list[i - 1];
    sheet('Theme', (close) => h('form', { onsubmit: (e) => { e.preventDefault(); const n = name.value.trim(); if (n) ST.renameTheme(t.id, n); close(); } },
      field('Name', name),
      h('div', { class: 'two' },
        h('button', { class: 'btn', type: 'button', disabled: i <= 0, onclick: () => { ST.moveTheme(t.id, -1); close(); } }, icon('up', 18), 'Move up'),
        h('button', { class: 'btn', type: 'button', disabled: i >= list.length - 1, onclick: () => { ST.moveTheme(t.id, 1); close(); } }, icon('down', 18), 'Move down')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmDialog({ title: 'Delete "' + t.name + '"?', message: to ? 'Its topics move to "' + to.name + '".' : 'Its topics stay, with no theme.', confirmText: 'Delete', danger: true })) { ST.deleteTheme(t.id); close(); }
        } }, 'Delete'),
        h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
  }
  function lib() {
    const SC = RV.screens, TP = RV.topics;
    let q = '';
    // v2.41: By theme or By series (remembered on this device)
    let mode = 'theme';
    try { mode = localStorage.getItem('rvapp.topicsMode') === 'series' ? 'series' : 'theme'; } catch (e) { /* ignore */ }
    const seg = h('div', { class: 'seg2 vseg' });
    const search = h('input', { type: 'search', class: 'tsearch', placeholder: 'Search topics or scriptures', 'aria-label': 'Search topics or scriptures', autocomplete: 'off' });
    const listBox = h('div', { class: 'tlib' });
    const indexBox = h('section', { class: 'tindex' });
    search.addEventListener('input', () => { q = search.value; paint(); });
    const row = (x, showTheme, part) => h('div', { class: 'row plain trow' },
      h('div', { class: 'main', role: 'button', tabindex: '0', onclick: () => SC.libSheet('topic', x) },
        h('div', { class: 'name' }, part ? h('span', { class: 'tpart' }, part) : null, x.title),
        x.question || x.text ? h('div', { class: 'line2' }, ...SC.linkify(x.question || x.text)) : null,
        h('div', { class: 'line3' }, [showTheme ? SC.themeName(x.theme) : null, x.scripture || null].filter(Boolean).join(' · '))),
      UI.toggle(!!x.showOnHome, (v) => ST.updateLib(x.id, { showOnHome: v }), 'Show on Today: ' + x.title));
    function paint() {
      const all = ST.libItems('topic');
      seg.replaceChildren(...[['theme', 'By theme'], ['series', 'By series']].map(([v, l]) => h('button', { type: 'button', class: v === mode ? 'on' : '', onclick: () => { mode = v; try { localStorage.setItem('rvapp.topicsMode', v); } catch (e) { /* ignore */ } paint(); } }, l)));
      if (q.trim()) {
        const hits = TP.search(all, q, SC.themeName);
        listBox.replaceChildren(hits.length ? h('div', { class: 'list' }, hits.map((x) => row(x, true))) : UI.emptyState('search', 'No topic matches that.'));
      } else {
        const open = openSet();
        let groups;
        if (mode === 'series') {
          const LIB = RV.library, used = new Set();
          groups = LIB.SERIES.map((sr) => {
            const items = sr.topics.map((id) => all.find((x) => x.builtin === id)).filter(Boolean);
            items.forEach((x) => used.add(x.id));
            const [y, m] = sr.ran.split('-');
            return { t: { id: 's:' + sr.id, name: sr.name, series: true, ran: U.MONTHS[+m - 1] + ' ' + y }, items, parts: (x) => 'Part ' + (sr.topics.indexOf(x.builtin) + 1) };
          }).filter((g) => g.items.length);
          const rest = all.filter((x) => !used.has(x.id));
          if (rest.length) groups.push({ t: { id: 's:', name: 'Not in a series', series: true }, items: rest });
        } else {
          groups = ST.themes().map((t) => ({ t, items: all.filter((x) => x.theme === t.id) }));
          const other = all.filter((x) => !ST.themes().some((t) => t.id === x.theme));
          if (other.length) groups.push({ t: { id: '', name: 'Other' }, items: other });
        }
        listBox.replaceChildren(...groups.map(({ t, items, parts }) => {
          const k = t.id || 'other', isOpen = open.has(k), nOn = items.filter((x) => x.showOnHome).length;
          const allOn = items.length && nOn === items.length;
          return h('section', { class: 'acard tfold' + (isOpen ? ' open' : '') },
            h('div', { class: 'ahead' },
              h('button', { class: 't', type: 'button', 'aria-expanded': String(isOpen), onclick: () => { const o = openSet(); if (isOpen) o.delete(k); else o.add(k); saveOpen(o); paint(); } },
                h('span', { class: 'nm' }, t.name), h('span', { class: 'sub' }, (items.length ? nOn + ' of ' + items.length + ' on' : 'Empty') + (t.ran ? ' \u00B7 first ran ' + t.ran : ''))),
              t.id && !t.series ? h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Edit theme ' + t.name, onclick: () => themeSheet(t) }, icon('more', 18)) : null,
              items.length ? UI.toggle(allOn, (v) => { for (const x of items) if (!!x.showOnHome !== v) ST.updateLib(x.id, { showOnHome: v }); }, 'Show all of ' + t.name + ' on Today') : null),
            isOpen ? h('div', { class: 'abody' },
              items.length ? h('div', { class: 'list' }, items.map((x) => row(x, false, parts ? parts(x) : ''))) : null,
              t.series ? null : h('button', { class: 'link-quiet tadd', type: 'button', onclick: () => SC.libSheet('topic', null, { theme: t.id }) }, icon('plus', 16), 'Add a topic here')) : null);
        }));
      }
      // every verse in the topics, Genesis to Revelation
      const idx = TP.index(all);
      indexBox.replaceChildren(h('h2', { class: 'sethead' }, 'Scriptures'),
        idx.length ? h('div', { class: 'list' }, idx.map(({ ref, topics }) => h('div', { class: 'row plain irow' },
          h('a', { class: 'vref', href: TP.linkFor(ref), target: '_blank', rel: 'noopener' }, icon('book', 14), ref.label),
          h('div', { class: 'itopics' }, topics.map((x) => h('button', { class: 'link-quiet', type: 'button', onclick: () => RV.screens.topicView(x) }, x.title)))))) : h('p', { class: 'muted small' }, 'Scriptures you add to topics are listed here.'));
    }
    paint();
    return page(lbl('topics'), [
      seg, search, listBox,
      h('div', { class: 'two', style: { marginTop: '14px' } },
        saveBtn('Add topic', () => RV.screens.libSheet('topic'), 'primary'),
        saveBtn('Add theme', async () => { const n = await UI.textPrompt({ title: 'New theme', placeholder: 'e.g. Science and creation' }); if (n && n.trim()) ST.addTheme(n.trim()); })),
      indexBox,
    ], { update: paint });
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
    // v2.41: the topics for this campaign (they lead Today's carousel while it runs); suggestions follow its name and topic
    let sel = ((c && c.topics) || []).slice();
    const pickBox = h('div', { class: 'pick' });
    const paintPick = () => {
      const all = ST.libItems('topic');
      const q = [title.value, topic.value].join(' ').trim();
      const sugg = q ? RV.topics.search(all, q, RV.screens.themeName).slice(0, 4) : [];
      const show = sel.map((id) => all.find((x) => x.id === id)).filter(Boolean);
      for (const x of sugg) if (!show.includes(x)) show.push(x);
      pickBox.replaceChildren(...show.map((x) => {
        const cb = h('input', { type: 'checkbox', checked: sel.includes(x.id), onchange: () => { sel = cb.checked ? sel.concat(x.id) : sel.filter((i) => i !== x.id); } });
        return h('label', { class: 'pk' }, cb, h('span', { class: 't' }, x.title), h('span', { class: 'th' }, RV.screens.themeName(x.theme)));
      }), h('button', { class: 'link pkmore', type: 'button', onclick: () => topicPicker(sel, (ids) => { sel = ids; paintPick(); }) }, icon('plus', 16), show.length ? 'Choose more topics' : 'Choose topics'));
    };
    title.addEventListener('input', paintPick); topic.addEventListener('input', paintPick);
    paintPick();
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
          const data = { title: t, topic: topic.value.trim(), text: text.value.trim(), publications: pubs.value.trim(), start: start.value, end: end.value, topics: sel };
          if (c) ST.updateLib(c.id, data); else ST.addLib('campaign', data);
          close();
        },
      },
        field('Name', title),
        field('Topic', topic),
        h('div', { class: 'two' }, field('Starts', start), field('Ends', end)),
        h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Topics for this ' + lbl('campaign').toLowerCase()), pickBox),
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
  // every topic with a checkbox and a search; Done hands back the chosen ids
  function topicPicker(selected, done) {
    let sel = selected.slice(), q = '';
    const list = h('div', { class: 'pick tall' });
    const search = h('input', { type: 'search', class: 'tsearch', placeholder: 'Search topics or scriptures', autocomplete: 'off' });
    const paint = () => {
      const all = ST.libItems('topic');
      const items = q.trim() ? RV.topics.search(all, q, RV.screens.themeName) : all;
      list.replaceChildren(...items.map((x) => {
        const cb = h('input', { type: 'checkbox', checked: sel.includes(x.id), onchange: () => { sel = cb.checked ? sel.concat(x.id) : sel.filter((i) => i !== x.id); } });
        return h('label', { class: 'pk' }, cb, h('span', { class: 't' }, x.title), h('span', { class: 'th' }, RV.screens.themeName(x.theme)));
      }));
    };
    search.addEventListener('input', () => { q = search.value; paint(); });
    paint();
    sheet('Choose topics', (close) => h('div', null, search, list,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { done(sel); close(); } }, 'Done'))));
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
        h('button', { class: 'row' + (key === 'active' ? ' camprow' : ''), type: 'button', style: { textAlign: 'left', width: '100%' }, onclick: () => campaignForm(c) },
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
        // garden: steps needed to grow into the next stage (none for the last active stage)
        const G = RV.garden;
        const growKind = st.closed ? 'none' : G.kindFor(S.settings, st.id);
        const grow = growKind === 'none' ? null : h('input', { type: 'number', min: '1', max: '20', inputmode: 'numeric', value: Number.isInteger(st.grow) ? String(st.grow) : '', placeholder: 'Default (' + (G.GROW_DEFAULTS[st.id] != null ? G.GROW_DEFAULTS[st.id] : 3) + ')', 'aria-label': 'Steps to grow' });
        if (grow) grow.addEventListener('change', () => { const n = grow.value.trim() === '' ? null : Math.max(1, num(grow.value) || 1); save((s) => { const x = s.stages.find((y) => y.id === st.id); if (n == null) delete x.grow; else x.grow = n; }); });
        const growLabel = growKind === 'study' ? 'Study sessions to grow' : growKind === 'first' ? 'Conversations to grow' : 'Conversations in a row to grow';
        box.appendChild(h('div', { class: 'card' },
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' } },
            h('div', { style: { flex: 1 } }, name),
            !st.closed ? h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move up', disabled: ai === 0, onclick: () => { save((s) => { const a = s.stages.findIndex((x) => x.id === st.id); const t = s.stages[a - 1]; s.stages[a - 1] = s.stages[a]; s.stages[a] = t; }); render(); } }, icon('up')) : null,
            !st.closed ? h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move down', disabled: ai === acts.length - 1, onclick: () => { save((s) => { const a = s.stages.findIndex((x) => x.id === st.id); const t = s.stages[a + 1]; s.stages[a + 1] = s.stages[a]; s.stages[a] = t; }); render(); } }, icon('down')) : null),
          st.closed
            ? h('div', { class: 'muted small' }, 'Closed stage')
            : h('div', null,
              h('div', { class: 'field', style: { marginBottom: '6px' } }, h('label', null, 'Days before flagged'), days),
              grow ? h('div', { class: 'field', style: { marginBottom: '6px' } }, h('label', null, growLabel), grow) : null,
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
    const names = { rv: 'Record (singular)', rvs: 'Record (plural)', notHome: 'Not home button', notHomeShort: 'Not home short form', recordVisit: 'Record visit button', campaign: 'Campaign', scriptures: 'Scriptures', topics: 'Topics', neighborhood: 'Area', archive: 'Archive', today: 'Today screen', bibleStudy: 'Bible study' };
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
      hint('An ' + lbl('rv') + ' is flagged by how long it has been since the last logged visit, unless it has a follow-up date.'),
      mk('defaultStaleDays', 'Default days before flagged', 'Used for stages with no number of their own.', 1, 365),
      mk('comingUpDays', 'Coming up window (days)', 'Planned visit dates within this many days are marked as coming up.', 1, 60),
      mk('soonDays', 'Heads-up before due (days)', 'Flag as coming up this many days before an ' + lbl('rv') + ' is due.', 0, 14),
      mk('dayTagForceFactor', 'Best-day safety net (times the usual timing)', 'A ' + lbl('rv') + ' with a best day is only marked due on that day. After this many times its usual timing, it is marked due on any day so nothing gets buried.', 1, 10),
      mk('stuckFactor', 'Stuck in stage (times the usual timing)', 'Insights lists ' + lbl('rvs') + ' that have stayed in one stage this many times the stage\'s timing.', 2, 20),
      h('div', { class: 'card' },
        h('div', { class: 'switchrow' }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, 'Not-home banner')),
          UI.toggle(S.settings.notHomeBanner.on, (v) => save((s) => { s.notHomeBanner.on = v; }), 'Not-home banner')),
        field('Tries needed before it shows', minTries)),
    ], { noRerender: true });
  }

  // ---------- note cleanup (Claude: Groundwork's shared helper, or the person's own key) ----------
  function ai() {
    const box = h('div');
    function render() {
      box.replaceChildren();
      const has = RV.ai.hasKey(), shared = RV.ai.shared(), on = RV.ai.available();
      const proxied = !!(RV.config && RV.config.aiProxy);
      const keyIn = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: has ? 'Key saved on this phone' : 'sk-ant-…' });
      const status = h('div', { class: 'muted small', style: { minHeight: '1.2em' } });
      const saveKey = async () => {
        const k = keyIn.value.trim();
        if (!k) { keyIn.focus(); return; }
        const prev = RV.ai.key();
        RV.ai.setKey(k);
        status.textContent = 'Checking the key…';
        try { await RV.ai.test(); toast('Your key is on'); render(); }
        catch (e) { RV.ai.setKey(prev); status.textContent = e.message || 'The key could not be checked.'; }
      };
      const seg = h('div', { class: 'seg', role: 'group' });
      RV.ai.MODELS.forEach((m) => seg.appendChild(h('button', {
        type: 'button', 'aria-pressed': String(m.value === RV.ai.model()),
        onclick: () => { RV.ai.setModel(m.value); seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(RV.ai.MODELS[i].value === m.value))); },
      }, m.label)));
      const keyBox = h('div', { class: 'stack' },
        field('Anthropic API key', keyIn),
        status,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn' + (proxied ? '' : ' primary'), type: 'button', onclick: saveKey }, has ? 'Replace key' : 'Save key'),
          has ? h('button', { class: 'btn danger', type: 'button', onclick: () => { RV.ai.setKey(''); toast('Key removed'); render(); } }, 'Remove key') : null),
        h('a', { class: 'muted small', href: 'https://platform.claude.com/', target: '_blank', rel: 'noopener' }, 'Get a key at platform.claude.com'));
      box.append(h('div', { class: 'card stack' },
        h('div', null, h('div', { style: { fontWeight: 600 } }, on ? 'Note cleanup is on' : 'Note cleanup is off'),
          h('div', { class: 'muted small' }, shared ? 'Included with Groundwork. A Clean up button under the visit note tidies dictated text.'
            : has ? 'Using your own API key. A Clean up button under the visit note tidies dictated text.'
              : 'A Clean up button under the visit note tidies dictated text with Claude.')),
        on ? h('div', { class: 'field', style: { marginBottom: 0 } }, h('div', { class: 'lbl' }, 'Model'), seg,
          shared ? h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Fast is plenty for most notes. Careful uses more of the daily allowance.') : null) : null,
        proxied ? null : keyBox),
        proxied ? h('details', { class: 'card', open: has || null },
          h('summary', { style: { fontWeight: 600, cursor: 'pointer' } }, 'Use your own API key'),
          h('div', { class: 'muted small', style: { margin: '8px 0 12px' } }, 'Optional. Your key is used instead, with no daily allowance.'),
          keyBox) : null,
        h('div', { class: 'banner warn' }, icon('alert'), h('div', { class: 'body' },
          shared ? 'Notes you clean up are sent to Anthropic through Groundwork’s helper, which keeps no note text.'
            : 'Notes you clean up are sent to Anthropic. The key stays on this phone and is not in backups.')));
    }
    render();
    return page('Note cleanup', [box], { noRerender: true });
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
    const defStage = F.select(F.importStageOptions(), (S.settings.stages.find((s) => s.id === 'initial') || S.settings.stages[0]).id);
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
    const defStage = F.select(F.importStageOptions(), (S.settings.stages.find((s) => s.id === 'initial') || S.settings.stages[0]).id);
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

  // v2.33: Backup and import. Status first (Todoist's Backups), one door each for importing and exporting with the
  // source or format chosen next (1Password's Import, Day One's Import/Export), and Erase set apart at the bottom.
  const lastFile = () => { try { return localStorage.getItem('rvapp.lastBackup'); } catch (e) { return null; } };
  function downloadBackup() {
    UI.download('rv-backup-' + stamp() + '.json', JSON.stringify(ST.exportAll(), null, 1), 'application/json');
    try { localStorage.setItem('rvapp.lastBackup', U.toDateStr(new Date())); } catch (e) { /* ignore */ }
    toast('Backup downloaded');
  }
  async function restoreMenu() {
    const D = RV.drive, st = D && D.status();
    if (!(st && st.connected && st.tokenOk)) return restoreFlow();
    let list;
    try { list = await D.listBackups(); } catch (e) { toast(e.message || 'Could not read Drive.'); return; }
    const latest = list[0] && !list[0].day ? list[0] : null, daily = list.filter((x) => x.day);
    const how = await UI.pick('Restore', [
      latest ? { value: 'latest', label: 'Latest Google Drive backup', sub: latest.modifiedTime ? U.fmtDateTime(latest.modifiedTime) : '' } : null,
      daily.length ? { value: 'daily', label: 'An earlier daily copy', sub: 'From the last ' + daily.length + (daily.length === 1 ? ' day' : ' days') } : null,
      { value: 'file', label: 'A backup file', sub: 'From this phone' },
    ].filter(Boolean));
    if (!how) return;
    if (how === 'file') return restoreFlow();
    let id = latest && latest.id;
    if (how === 'daily') {
      id = await UI.pick('Earlier daily copy', daily.map((b) => ({ value: b.id, label: U.fmtDate(b.day), sub: 'Daily copy' })));
      if (!id) return;
    }
    try { await restoreData(await D.fetchBackup(id)); } catch (e) { toast(e.message || 'Could not read Drive.'); }
  }
  function exportSheet() {
    const row = (ic, label, sub, fn) => h('button', { class: 'setrow', type: 'button', onclick: fn }, icon(ic, 20), h('div', { class: 'main' }, h('div', null, label), h('div', { class: 'sub' }, sub)), icon('right', 18));
    sheet('Export', (close) => h('div', null,
      row('users', lbl('rvs') === 'RVs' ? 'Contacts' : lbl('rvs'), 'A spreadsheet (CSV) for Excel or Google Sheets', () => { close(); UI.download('rvs-' + stamp() + '.csv', L.rvsToCsv(ST.items(), S.settings), 'text/csv'); }),
      row('calendar', 'Visit log', 'Every visit and ' + lbl('notHome').toLowerCase() + ', as a spreadsheet (CSV)', () => { close(); UI.download('visit-log-' + stamp() + '.csv', L.entriesToCsv(S.entries, S.rvs, S.settings), 'text/csv'); }),
      row('lock', 'Backup file', 'Everything, to restore on another phone', () => { close(); downloadBackup(); })));
  }

  // The backup card: what's backed up and when, then the one or two things to do about it. Refreshes itself.
  function backupCard() {
    const D = RV.drive;
    const box = h('div');
    function paint() {
      const s = D.status();
      const dot = (ok) => h('span', { class: 'bkdot ' + (ok ? 'ok' : 'warn'), 'aria-hidden': 'true' });
      const head = (ok, title, sub) => h('div', { class: 'bkrow' }, dot(ok), h('div', null, h('div', { class: 'bktitle' }, title), sub ? h('div', { class: 'muted small' }, sub) : null));
      const btn = (label, fn, cls, dis) => h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: fn, disabled: !!dis }, label);
      let kids;
      if (s.configured && s.connected) {
        const paused = !s.tokenOk && s.dirty;
        const title = s.busy ? 'Saving to Google Drive…' : s.error ? 'Google Drive: ' + s.error : paused ? 'Backup paused' : s.dirty ? 'Changes waiting to save' : s.lastSaved ? 'Backed up to Google Drive' : 'Google Drive connected';
        const sub = paused ? 'Reconnect to keep saving.' : s.lastSaved ? U.fmtDateTime(s.lastSaved) + ' · daily copies kept for a week' : 'Not saved yet';
        kids = [head(!s.error && !paused && !!s.lastSaved, title, sub),
          h('div', { class: 'btn-row' },
            s.tokenOk ? btn('Back up now', async () => { if (await D.backupNow()) toast('Saved to Google Drive'); }, 'primary', s.busy) : btn('Reconnect', () => D.connect(), 'primary'),
            btn('Restore…', restoreMenu, '', s.busy)),
          h('button', { class: 'link-quiet bkoff', type: 'button', onclick: async () => {
            if (await confirmDialog({ title: 'Disconnect Google Drive?', message: 'The Groundwork folder and its backups stay in your Drive.', confirmText: 'Disconnect' })) D.disconnect();
          } }, 'Disconnect Google Drive')];
      } else {
        const last = lastFile();
        kids = [head(false, last ? 'Last backup file: ' + U.fmtDate(last) : 'Not backed up yet', last ? 'Backing up to Google Drive keeps it current by itself.' : 'Everything lives only on this phone.'),
          s.configured ? btn('Back up to Google Drive', () => D.connect(), 'primary block') : null,
          h('div', { class: 'btn-row' }, btn('Download backup', downloadBackup, s.configured ? '' : 'primary'), btn('Restore…', restoreMenu))];
      }
      box.replaceChildren(h('div', { class: 'card bkcard' }, ...kids.filter(Boolean)));
    }
    paint();
    const off = D.onChange(() => { if (!box.isConnected) { off(); return; } paint(); });
    return box;
  }

  function data() {
    const live = S.rvs.filter((r) => !r.deletedAt).length;
    const visits = S.entries.filter((e) => !e.deletedAt && e.type === 'visit').length;
    const row = (ic, label, sub, fn, cls) => h('button', { class: 'setrow' + (cls ? ' ' + cls : ''), type: 'button', onclick: fn }, icon(ic, 20), h('div', { class: 'main' }, h('div', null, label), sub ? h('div', { class: 'sub' }, sub) : null), icon('right', 18));
    return page('Backup and import', [
      S.persistent ? null : h('div', { class: 'banner danger' }, icon('alert'), h('div', { class: 'body' }, 'This browser is blocking storage. Nothing will be kept.')),
      backupCard(),
      h('div', { class: 'bkcount' }, live + ' ' + lbl(live === 1 ? 'rv' : 'rvs') + ' and ' + visits + (visits === 1 ? ' visit' : ' visits') + ' on this phone.'),
      h('section', { class: 'setgroup' }, row('upload', 'Import contacts', 'Ministry Assistant, a notes app, or a spreadsheet', () => { location.hash = '#/settings/import'; })),
      h('section', { class: 'setgroup' }, row('download', 'Export', 'Contacts, visit log, or a backup file', exportSheet)),
      h('section', { class: 'setgroup bkerase' }, row('trash', 'Erase all data', null, async () => {
        if (!(await confirmDialog({ title: 'Erase everything?', message: 'All ' + lbl('rvs') + ', visits, libraries and settings on this device will be deleted. Download a backup first if you might want them.', confirmText: 'Erase everything', danger: true }))) return;
        await ST.eraseAll();
        RV.app.applyDisplay();
        toast('All data erased');
        location.hash = '#/home';
      })),
    ].filter(Boolean), { noRerender: true });
  }

  // Import contacts: one door, then where the contacts are now
  function importPage() {
    const src = (ic, t, sub, fn) => h('button', { class: 'setrow isrc', type: 'button', onclick: fn }, h('span', { class: 'isrcic' }, icon(ic, 22)), h('div', { class: 'main' }, h('div', null, t), h('div', { class: 'sub' }, sub)), icon('right', 18));
    return page('Import contacts', [
      h('div', { class: 'muted', style: { margin: '2px 4px 14px' } }, 'Where are your contacts now?'),
      src('download', 'Ministry Assistant', 'Its backup file, with visits', maImport),
      src('note', 'A notes app', 'Paste notes or upload screenshots', () => { location.hash = '#/settings/notes'; }),
      src('chart', 'A spreadsheet', 'A CSV from Excel or Google Sheets', importWizard),
      h('div', { class: 'muted small', style: { textAlign: 'center', marginTop: '8px' } }, 'Moving to a new phone? Use Restore instead.'),
    ], { back: '#/settings/data' });
  }

  // ---------- v2.31/v2.32: import from a notes app (paste, screenshots, text files), Claude finds the contacts ----------
  // Kept for the session, so leaving the page mid-review doesn't lose the work.
  const NI = { phase: 'pick', notes: [], shots: [], skipped: [], contacts: [], unread: [], unreadShots: [], progress: '', stop: false, stage: null, pasting: false, pasted: '', error: '' };
  const SHARE_CACHE = 'rvapp-share';
  function niReset() { Object.assign(NI, { phase: 'pick', notes: [], shots: [], skipped: [], contacts: [], unread: [], unreadShots: [], progress: '', stop: false, pasting: false, pasted: '', error: '' }); }
  function niAdd(res) {
    const have = new Set(NI.notes.map((n) => n.title + '\n' + n.text));
    res.notes.forEach((n) => { if (!have.has(n.title + '\n' + n.text)) { NI.notes.push(n); have.add(n.title + '\n' + n.text); } });
    NI.skipped = NI.skipped.concat(res.skipped);
  }
  const niPasteNote = (t) => niAdd({ notes: [{ title: 'Pasted note ' + (NI.notes.filter((n) => n.from === 'Pasted').length + 1), text: t, date: new Date().toISOString(), from: 'Pasted' }], skipped: [] });
  // Notes shared to Groundwork from another app (Android): the service worker leaves them in a cache.
  async function niTakeShared() {
    if (!root.caches) return 0;
    try {
      const c = await caches.open(SHARE_CACHE);
      const keys = await c.keys();
      if (!keys.length) return 0;
      const files = [];
      for (const k of keys) {
        const r = await c.match(k);
        const name = new URL(k.url).searchParams.get('name') || 'Shared note.txt';
        files.push({ name, bytes: new Uint8Array(await r.arrayBuffer()), lastModified: Date.now() });
        await c.delete(k);
      }
      const res = await RV.notesImport.readFiles(files);
      niAdd(res);
      return res.notes.length;
    } catch (e) { return 0; }
  }
  function pickFiles(accept) {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept, multiple: true, style: { display: 'none' } });
      inp.addEventListener('change', async () => {
        const list = Array.from(inp.files || []);
        inp.remove();
        resolve(await Promise.all(list.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), lastModified: f.lastModified }))));
      });
      inp.addEventListener('cancel', () => { inp.remove(); resolve([]); });
      document.body.appendChild(inp);
      inp.click();
    });
  }
  const niDup = (c) => {
    const hit = L.duplicateMatches({ address: c.address, phone: c.phone }, S.rvs);
    if (hit.length) return hit[0];
    const n = c.name.toLowerCase().trim();
    return n.split(/\s+/).length > 1 ? S.rvs.find((r) => !r.deletedAt && String(r.name || '').toLowerCase().trim() === n) : null;
  };
  const niPrep = (c) => { c.dup = niDup(c); c.on = !c.dup; c.neighborhood = c.neighborhood || ''; return c; };
  const shotLabel = (g) => {
    const t0 = new Date(g[0].taken), t1 = new Date(g[g.length - 1].taken);
    const tm = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return U.fmtDate(U.toDateStr(t0)) + ', ' + tm(t0) + (g.length > 1 && tm(t1) !== tm(t0) ? ' – ' + tm(t1) : '');
  };
  // Opened from quick add's Fill from a note when one note holds several people.
  RV.notesReview = {
    show(list) {
      niReset();
      NI.contacts = list.map((c) => Object.assign(niPrep(c), { from: c.from || 'Your note' }));
      NI.phase = 'review';
      location.hash = '#/settings/notes';
    },
  };

  async function niRead(paint) {
    const N = RV.notesImport;
    const queue = N.batches(NI.notes).map((b) => ({ notes: b }))
      .concat(N.shotBatches(NI.shots).map((b) => ({ shots: b })));
    const total = queue.length;
    let done = 0;
    NI.phase = 'reading'; NI.stop = false; NI.contacts = []; NI.unread = []; NI.unreadShots = []; NI.error = '';
    const titleOf = new Map();
    queue.forEach((q) => (q.notes || []).forEach((p) => titleOf.set(p.id, p.title)));
    const groups = N.groupShots(NI.shots);
    groups.forEach((g) => g.forEach((sh) => titleOf.set(sh.id, g.length > 1 ? 'Screenshots ' + shotLabel(g) : 'Screenshot ' + shotLabel(g))));
    const leave = (q) => { if (q.notes) NI.unread.push(...q.notes); else NI.unreadShots.push(...q.shots); };
    paint();
    while (queue.length) {
      if (NI.stop) { queue.forEach(leave); break; }
      NI.progress = 'Finding people in your notes… ' + Math.min(done + 1, total) + ' of ' + total;
      paint();
      const q = queue.shift();
      try {
        const raw = q.shots ? await RV.ai.readNotes(null, null, q.shots) : await RV.ai.readNotes(q.notes);
        N.cleanContacts(raw).forEach((c) => {
          const items = q.notes || q.shots;
          c.from = titleOf.get(c.source) || (items.length === 1 ? titleOf.get(items[0].id) : '') || '';
          NI.contacts.push(niPrep(c));
        });
        done++;
      } catch (e) {
        const msg = (e && e.message) || '';
        if (/tomorrow|not available|not set up|No connection|API key|too long/.test(msg)) { leave(q); queue.forEach(leave); NI.error = msg; break; }
        const items = q.notes || q.shots;
        if (items.length > 1) { const half = Math.ceil(items.length / 2); const k = q.notes ? 'notes' : 'shots'; queue.unshift({ [k]: items.slice(0, half) }, { [k]: items.slice(half) }); }
        else { leave(q); done++; }
      }
    }
    NI.phase = 'review';
    paint();
  }

  function notesImport() {
    const N = RV.notesImport;
    const box = h('div');
    if (!NI.stage) NI.stage = (S.settings.stages.find((x) => x.id === 'initial') || S.settings.stages[0]).id;
    const paint = () => { if (box.isConnected || !box.parentNode) render(); };
    const privacy = () => h('div', { class: 'banner warn' }, icon('alert'), h('div', { class: 'body' }, 'Your notes are sent to Anthropic so Claude can find the contacts in them. Nothing is added until you choose.'));
    function render() {
      box.replaceChildren();
      if (!RV.ai.available()) {
        box.append(h('div', { class: 'card' }, h('div', { style: { fontWeight: 600 } }, 'This needs Note cleanup'),
          h('div', { class: 'muted small' }, 'Turn on Note cleanup to make contacts from notes.'),
          h('a', { class: 'btn', href: '#/settings/ai', style: { marginTop: '10px' } }, 'Note cleanup')));
        return;
      }
      if (NI.phase === 'reading') {
        box.append(h('div', { class: 'card stack niread' },
          h('div', { style: { fontWeight: 600 } }, NI.progress || 'Finding people in your notes…'),
          h('div', { class: 'muted small' }, 'Keep this screen open.'),
          h('div', { class: 'nibar', 'aria-hidden': 'true' }, h('span')),
          h('button', { class: 'btn', type: 'button', onclick: () => { NI.stop = true; NI.progress = 'Stopping after this part…'; render(); } }, 'Stop')));
        return;
      }
      if (NI.phase === 'review') return renderReview();
      renderPick();
    }

    function renderPick() {
      const pasteBox = h('textarea', { placeholder: 'Paste the note here', value: NI.pasted, style: { minHeight: '110px' } });
      pasteBox.addEventListener('input', () => { NI.pasted = pasteBox.value; });
      const paste = async () => {
        if (NI.pasting) {
          const t = pasteBox.value.trim();
          if (!t) { pasteBox.focus(); return; }
          niPasteNote(t); NI.pasted = ''; render(); toast('Note added');
          return;
        }
        const t = await N.readClipboard();
        if (t && t.trim()) { niPasteNote(t.trim()); render(); toast('Note added'); return; }
        NI.pasting = true; render();
        const ta = box.querySelector('.nipaste textarea'); if (ta) ta.focus();
      };
      const shots = async () => {
        const files = await N.pickImages();
        if (!files.length) return;
        const got = await N.prepShots(files, NI.shots.length ? Math.max(...NI.shots.map((x) => +x.id.slice(1))) : 0);
        if (!got.length) { toast('Those weren’t images Groundwork can open.'); return; }
        NI.shots = NI.shots.concat(got); render();
      };
      const files = async () => {
        const fl = await pickFiles('.txt,.md,.json,.html,.htm,.zip,text/plain,text/html,application/json,application/zip');
        if (!fl.length) return;
        niAdd(await N.readFiles(fl));
        render();
      };
      const groups = N.groupShots(NI.shots);
      const count = NI.notes.length + NI.shots.length;
      const stageSel = F.select(F.importStageOptions(), NI.stage);
      stageSel.addEventListener('change', () => { NI.stage = stageSel.value; });
      const big = (cls, ic, t, sub, fn) => h('button', { class: 'nibig ' + cls, type: 'button', onclick: fn }, icon(ic, 22), h('div', null, h('div', { class: 't' }, t), h('div', { class: 's' }, sub)));
      box.append(...[
        h('div', { class: 'card stack nihero' },
          h('div', null, h('div', { style: { fontWeight: 600 } }, 'Bring in your notes'),
            h('div', { class: 'muted small' }, 'Add as many notes as you like, then turn them all into contacts at once.')),
          NI.pasting ? h('div', { class: 'nipaste stack' }, pasteBox,
            h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => { NI.pasting = false; NI.pasted = ''; render(); } }, 'Done pasting'),
              h('button', { class: 'btn primary', type: 'button', onclick: paste }, 'Add note')))
            : big('pri', 'clipboard', 'Paste a note', 'Copy a note, then tap here', paste),
          big('sec', 'image', 'Upload screenshots', 'Pick as many as you like', shots)),
        count ? h('div', { class: 'card stack' },
          h('div', { style: { fontWeight: 600 } }, count + (count === 1 ? ' note ready' : ' notes ready')),
          h('div', { class: 'nilist' },
            NI.notes.map((n, i) => h('div', { class: 'nirow' },
              h('div', { class: 'main' }, h('div', { class: 'nititle' }, n.title), h('div', { class: 'muted small nisnip' }, n.text.slice(0, 90))),
              h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove ' + n.title, onclick: () => { NI.notes.splice(i, 1); render(); } }, icon('x', 18)))),
            groups.map((g) => h('div', { class: 'nirow' },
              h('img', { class: 'nithumb', src: g[0].url, alt: '' }),
              h('div', { class: 'main' }, h('div', { class: 'nititle' }, g.length === 1 ? '1 screenshot' : g.length + ' screenshots'), h('div', { class: 'muted small nisnip' }, shotLabel(g))),
              h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove these screenshots', onclick: () => { const ids = new Set(g.map((x) => x.id)); NI.shots = NI.shots.filter((x) => !ids.has(x.id)); render(); } }, icon('x', 18))))),
          NI.skipped.length ? h('div', { class: 'muted small' }, 'Left out (not notes): ' + NI.skipped.slice(0, 5).join(', ') + (NI.skipped.length > 5 ? ' and ' + (NI.skipped.length - 5) + ' more' : '')) : null,
          field('Stage for new contacts', stageSel),
          h('button', { class: 'btn primary', type: 'button', onclick: () => niRead(paint) }, 'Make contacts from ' + (count === 1 ? 'this note' : count + ' notes')))
          : (NI.skipped.length ? h('div', { class: 'banner info' }, icon('note'), h('div', { class: 'body' }, 'No notes found in ' + NI.skipped.join(', ') + '.')) : null),
        h('button', { class: 'nilink', type: 'button', onclick: files }, 'Text files or a Google Keep export'),
        privacy()].filter(Boolean));
    }

    function renderReview() {
      const on = NI.contacts.filter((c) => c.on);
      const areas = () => ST.neighborhoods();
      const areaSel = (value, onPick, first) => {
        const sel = h('select', { class: 'niarea', 'aria-label': lbl('neighborhood') },
          h('option', { value: '' }, first), ...areas().map((n) => h('option', { value: n, selected: n === value }, n)));
        sel.value = value || '';
        sel.addEventListener('change', () => onPick(sel.value, sel));
        return sel;
      };
      const summary = (c) => [c.visits.length ? c.visits.length + (c.visits.length === 1 ? ' visit' : ' visits') : '', c.study || L.isStudyStage(S.settings, c.stage) ? 'Bible study' : '', c.phone || '', c.from ? 'From ' + c.from : ''].filter(Boolean).join(' · ');
      const edit = (c) => F.rvForm(null, {
        draft: Object.assign({ stage: c.stage || (c.study ? (S.settings.stages.find((x) => x.study && !x.closed) || {}).id : NI.stage) }, c.extra || {},
          { name: c.name, address: c.address, phone: c.phone, notes: c.notes, whatsNext: c.discussNext, neighborhood: c.neighborhood, visits: c.visits, nextVisit: c.nextVisit }),
        onDone: (d) => {
          Object.assign(c, { name: d.name, address: d.address, phone: d.phone, notes: d.notes, discussNext: d.whatsNext, neighborhood: d.neighborhood, stage: d.stage, edited: true });
          c.extra = { howMet: d.howMet, bestDays: d.bestDays, tags: d.tags, publication: d.publication, progress: d.progress, nextStart: d.nextStart, nhBannerOff: d.nhBannerOff, geo: d.geo, custom: d.custom };
          c.dup = niDup(c);
          render();
        },
      });
      const card = (c) => {
        const cb = h('input', { type: 'checkbox', checked: c.on, 'aria-label': 'Import ' + c.name });
        cb.addEventListener('change', () => { c.on = cb.checked; render(); });
        const meta = summary(c);
        return h('div', { class: 'card nicard' + (c.on ? '' : ' off') },
          h('div', { class: 'nihead' }, cb,
            h('div', { class: 'main' },
              h('div', { class: 'niname' }, c.name, c.edited ? h('span', { class: 'niedited' }, 'Edited') : null),
              h('div', { class: 'muted small' }, c.address || 'No address'),
              meta ? h('div', { class: 'muted small nimeta' }, meta) : null)),
          c.dup ? h('div', { class: 'nidup small' }, 'Looks like ' + (c.dup.name || 'someone') + ', already in Groundwork') : null,
          h('div', { class: 'niacts' },
            areaSel(c.neighborhood, (v) => { c.neighborhood = v; }, 'No ' + lbl('neighborhood').toLowerCase()),
            h('button', { class: 'nitog', type: 'button', onclick: () => edit(c) }, 'Edit details')));
      };
      const bulk = areaSel('', (v, sel) => {
        if (!v) return;
        const n = NI.contacts.filter((c) => c.on).length;
        NI.contacts.forEach((c) => { if (c.on) c.neighborhood = v; });
        render(); toast(lbl('neighborhood') + ' set for ' + n);
      }, 'Set ' + lbl('neighborhood').toLowerCase() + ' for ticked…');
      const unreadN = NI.unread.length + NI.unreadShots.length;
      box.append(...[
        h('div', { class: 'card stack' },
          h('div', { style: { fontWeight: 600 } }, NI.contacts.length ? NI.contacts.length + (NI.contacts.length === 1 ? ' person found' : ' people found') : 'No people found'),
          h('div', { class: 'muted small' }, NI.contacts.length ? 'Untick anyone you don’t want. Edit details to add more before importing.' : 'Claude didn’t find anyone to follow up in these notes.'),
          unreadN ? h('div', { class: 'small' }, (NI.error ? NI.error + ' ' : '') + unreadN + (unreadN === 1 ? ' note is' : ' notes are') + ' left for later. Import these now, then make contacts from the rest.') : null,
          NI.contacts.length > 1 ? h('div', { class: 'niselect' },
            h('button', { class: 'nitog', type: 'button', onclick: () => { NI.contacts.forEach((c) => { c.on = true; }); render(); } }, 'Select all'),
            h('button', { class: 'nitog', type: 'button', onclick: () => { NI.contacts.forEach((c) => { c.on = false; }); render(); } }, 'Select none')) : null,
          NI.contacts.length > 1 && on.length ? bulk : null),
        ...NI.contacts.map(card),
        h('div', { class: 'btn-row nisticky' },
          h('button', { class: 'btn', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Start over?', message: 'The people found here will be cleared.', confirmText: 'Start over' })) { niReset(); render(); } } }, 'Start over'),
          h('button', { class: 'btn primary', type: 'button', disabled: !on.length, onclick: () => {
            const studyStage = (S.settings.stages.find((x) => x.study && !x.closed) || {}).id;
            const rvs = [], entries = [];
            on.forEach((c) => {
              const r = N.toRecord(c, { uuid: U.uuid, stage: NI.stage, studyStage });
              rvs.push(ST.blankRv(r.rv)); entries.push(...r.entries);
            });
            ST.importRvs(rvs, entries);
            try { sessionStorage.setItem('rvapp.lastImport', JSON.stringify(rvs.map((r) => r.id))); } catch (e) { /* ignore */ }
            const leftNotes = NI.unread, leftShots = NI.unreadShots;
            niReset();
            NI.notes = leftNotes.map((p) => ({ title: p.title, text: p.text, date: p.date ? p.date + 'T12:00:00.000Z' : null, from: 'Left for later' }));
            NI.shots = leftShots;
            toast('Imported ' + rvs.length + ' ' + lbl(rvs.length === 1 ? 'rv' : 'rvs'));
            location.hash = '#/rvs/imported';
          } }, on.length ? 'Import ' + on.length : 'Import'))].filter(Boolean));
    }

    render();
    niTakeShared().then((n) => { if (n && NI.phase === 'pick') render(); });
    return page('Import from notes', [box], { noRerender: true, back: '#/settings/import' });
  }

  // v2.28: the import choices on Home's welcome card (Ministry Assistant, a spreadsheet, a Groundwork backup)
  async function restoreChoice() {
    const D = RV.drive, st = D && D.status();
    if (!(st && st.connected && st.tokenOk)) return restoreFlow();
    const how = await UI.pick('Restore a Groundwork backup', [{ value: 'file', label: 'From a file' }, { value: 'drive', label: 'From Google Drive' }]);
    if (how === 'file') return restoreFlow();
    if (how !== 'drive') return;
    try {
      const list = await D.listBackups();
      if (!list.length) { toast('No backup found in Drive.'); return; }
      await restoreData(await D.fetchBackup(list[0].id));
    } catch (e) { toast(e.message || 'Could not read Drive.'); }
  }
  RV.importers = { ministryAssistant: maImport, notes: () => { location.hash = '#/settings/notes'; }, spreadsheet: importWizard, restore: restoreChoice };

  function about() {
    return page('About', [
      h('div', { class: 'card stack' },
        h('div', { style: { fontWeight: 600 } }, 'Groundwork · version ' + RV.VERSION),
        h('div', { class: 'muted small' }, 'Android: Chrome menu > Install app. iPhone: Safari Share > Add to Home Screen.'),
        h('a', { class: 'muted small', href: 'privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy policy')),
    ], { noRerender: true });
  }

  RV.settingsScreens = { index, customize, display, home: homeSettings, lib, campaigns, campaignForm, stages, reasons, fields, labels, attention, ai, security, data, about, notes: notesImport, import: importPage };
})(window);
