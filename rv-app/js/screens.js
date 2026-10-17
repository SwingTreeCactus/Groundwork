/* RV app: main screens (Home, Today, RV list, RV detail). Each returns {title, sub, el, ...}. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const { h, icon } = RV.dom;
  const U = RV.util, L = RV.logic, ST = RV.store, UI = RV.ui, F = RV.forms;
  const S = ST.S;
  const { lbl, field, toast, confirmDialog, sheet, stageBadge, attBadge } = UI;

  // ---------- shared row ----------
  function rvRow(it, o) {
    o = o || {};
    const rv = it.rv;
    const dnc = L.isDNC(S.settings, rv);
    const nhBtn = o.nh !== false && S.settings.nhRowButton && it.att.state !== 'closed'
      ? h('button', {
        class: 'nhbtn', type: 'button', 'aria-label': lbl('notHome') + ' for ' + rv.name,
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); UI.doNotHome(rv.id); },
      }, lbl('notHomeShort'))
      : null;
    const sub = UI.subtitle(rv);
    return h('a', { class: 'row', href: '#/rv/' + rv.id },
      h('div', { class: 'main' },
        h('div', { class: 'name' }, rv.name),
        sub ? h('div', { class: 'line2' }, sub) : null,
        h('div', { class: 'line3' },
          stageBadge(rv.stage),
          dnc ? h('span', { class: 'badge flag-overdue' }, 'Do not call') : null,
          attBadge(it.att),
          o.why ? h('span', { class: 'muted' }, o.why) : h('span', { class: 'muted' }, UI.lastText(it)))),
      nhBtn);
  }
  function listOf(items, o) {
    return h('div', { class: 'list' }, items.map((it) => rvRow(it, o)));
  }
  function card(title, body, headExtra) {
    return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title), headExtra || null), body);
  }

  // ---------- library items (starters, scriptures, topics, campaigns) ----------
  function libSheet(kind, item) {
    const K = RV.defaults.LIB_KINDS[kind];
    const isCamp = kind === 'campaign';
    const titleLabel = { starter: 'Conversation starter', scripture: 'Scripture reference', topic: 'Topic', campaign: 'Campaign name' }[kind];
    const textLabel = { starter: 'What to say or ask', scripture: 'Key point or notes', topic: 'Notes', campaign: 'Current campaign note' }[kind];
    const title = h('input', { type: 'text', value: item ? item.title : '', 'data-autofocus': true, autocomplete: 'off' });
    const text = h('textarea', { value: item ? item.text : '' });
    const tags = h('input', { type: 'text', value: item ? (item.tags || []).join(', ') : '', placeholder: 'Optional, separated by commas' });
    const on = h('input', { type: 'checkbox', checked: item ? (isCamp ? item.active : item.showOnHome) : (isCamp ? true : true) });
    sheet((item ? 'Edit ' : 'New ') + K.single, (close) =>
      h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          const t = title.value.trim();
          if (!t) { title.focus(); return; }
          const data = { title: t, text: text.value.trim(), tags: U.splitList(tags.value) };
          if (isCamp) data.active = on.checked; else data.showOnHome = on.checked;
          if (item) ST.updateLib(item.id, data); else ST.addLib(kind, data);
          close();
        },
      },
        field(titleLabel, title), field(textLabel, text), field('Tags', tags),
        h('label', { class: 'check' }, on, isCamp ? 'Active now' : 'Show on Home screen'),
        h('div', { class: 'actions' },
          item ? h('button', {
            class: 'btn danger', type: 'button',
            onclick: async () => { if (await confirmDialog({ title: 'Delete?', message: '"' + item.title + '" will be removed.', confirmText: 'Delete', danger: true })) { ST.deleteLib(item.id); close(); } },
          }, 'Delete') : null,
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
  }

  // ---------- Home ----------
  function homeCards(items) {
    const lists = L.attentionLists(items);
    const now = new Date();
    const more = (n, shown) => (n > shown ? h('a', { class: 'btn ghost sm', href: '#/today' }, 'See all ' + n) : null);
    const libCard = (kind, cardTitle) => {
      const all = ST.libItems(kind).filter((x) => x.showOnHome);
      const body = all.length
        ? h('div', { class: 'stack' }, all.map((x) =>
          h('div', { onclick: () => libSheet(kind, x), style: { cursor: 'pointer' } },
            h('div', { style: { fontWeight: 600 } }, x.title),
            x.text ? h('div', { class: 'muted small', style: { whiteSpace: 'pre-wrap' } }, x.text) : null)))
        : h('div', { class: 'muted small' }, 'Nothing here yet. Add items and choose what shows on Home.');
      return card(cardTitle, body, h('span', null,
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Add', onclick: () => libSheet(kind) }, icon('plus')),
        h('a', { class: 'btn ghost sm', href: '#/settings/lib/' + kind }, 'Manage')));
    };
    const builders = {
      campaign() {
        const camps = ST.libItems('campaign');
        const body = camps.length
          ? h('div', { class: 'stack' }, camps.map((c) =>
            h('div', { class: 'switchrow' },
              h('div', { class: 'grow', onclick: () => libSheet('campaign', c), style: { cursor: 'pointer' } },
                h('div', { style: { fontWeight: 600 } }, c.title),
                c.text ? h('div', { class: 'muted small', style: { whiteSpace: 'pre-wrap' } }, c.text) : null),
              UI.toggle(c.active, (v) => ST.updateLib(c.id, { active: v }), 'Active: ' + c.title))))
          : h('div', { class: 'muted small' }, 'No campaigns yet. Add one to keep the current focus in view.');
        return card(lbl('campaign') + 's', body, h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Add campaign', onclick: () => libSheet('campaign') }, icon('plus')));
      },
      starters: () => libCard('starter', lbl('starters')),
      scriptures: () => libCard('scripture', lbl('scriptures')),
      topics: () => libCard('topic', lbl('topics')),
      attention() {
        const top = lists.overdue.slice(0, 5);
        return card('Needs attention' + (lists.overdue.length ? ' (' + lists.overdue.length + ')' : ''),
          top.length ? listOf(top) : h('div', { class: 'muted small' }, 'All caught up.'), more(lists.overdue.length, 5));
      },
      comingUp() {
        const top = lists.soon.slice(0, 5);
        return card('Coming up' + (lists.soon.length ? ' (' + lists.soon.length + ')' : ''),
          top.length ? listOf(top) : h('div', { class: 'muted small' }, 'Nothing due soon.'), more(lists.soon.length, 5));
      },
      recent() {
        const top = L.recentlyAdded(items, now).slice(0, 5);
        return card('Recently added', top.length ? listOf(top) : h('div', { class: 'muted small' }, 'Nobody added in the last two weeks.'));
      },
      quickAdd() {
        return card('Quick add', h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => F.quickAdd() }, icon('plus', 18), 'New ' + lbl('rv')),
          h('button', { class: 'btn', type: 'button', onclick: () => F.rvForm(null) }, 'Full form')));
      },
      likelyHome() {
        const out = L.likelyHomeNow(items, now).slice(0, 8);
        return card('Likely home right now', out.length
          ? h('div', { class: 'list' }, out.map((o) => rvRow(o.item, { why: o.why })))
          : h('div', { class: 'muted small' }, 'Nobody stands out for this day and time yet. It improves as you log visits and best times.'));
      },
    };
    return S.settings.homeCards.filter((c) => c.on && builders[c.id]).map((c) => builders[c.id]());
  }

  function home() {
    const items = ST.items();
    const welcome = !S.rvs.some((r) => !r.deletedAt)
      ? card('Welcome', h('div', { class: 'stack' },
        h('div', { class: 'muted' }, 'Add your first ' + lbl('rv') + ', or bring records in from a spreadsheet. Everything stays on this device.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => F.quickAdd() }, icon('plus', 18), 'Add ' + lbl('rv')),
          h('a', { class: 'btn', href: '#/settings/data' }, 'Import CSV'))))
      : null;
    const d = new Date();
    return {
      title: 'Home', sub: U.DAYS[d.getDay()] + ', ' + U.MONTHS[d.getMonth()] + ' ' + d.getDate(), fab: true,
      el: h('div', null, welcome, homeCards(items),
        h('div', { style: { textAlign: 'center' } }, h('a', { class: 'btn ghost sm', href: '#/settings/home' }, 'Edit Home screen'))),
    };
  }

  // ---------- Today ----------
  function today() {
    const items = ST.items();
    const lists = L.attentionLists(items);
    const recent = L.recentlyAdded(items, new Date());
    const section = (title, arr, emptyText) =>
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, title + (arr.length ? ' (' + arr.length + ')' : ''))),
        arr.length ? listOf(arr) : h('div', { class: 'muted small' }, emptyText));
    return {
      title: lbl('today'), fab: true,
      el: h('div', null,
        section('Overdue', lists.overdue, 'Nothing overdue.'),
        section('Coming up', lists.soon, 'Nothing due soon.'),
        section('Recently added', recent, 'Nobody added in the last two weeks.')),
    };
  }

  // ---------- RV list ----------
  const LS_KEY = 'rvapp.list';
  function loadListState() {
    let st = {};
    try { st = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { st = {}; }
    return { stages: Array.isArray(st.stages) ? st.stages : null, sort: L.SORTS[st.sort] ? st.sort : 'attention', neighborhood: st.neighborhood || '', q: '' };
  }
  function saveListState(st) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ stages: st.stages, sort: st.sort, neighborhood: st.neighborhood })); } catch (e) { /* ignore */ }
  }

  function list() {
    const st = loadListState();
    let shown = 100;
    const stages = S.settings.stages;
    const activeIds = () => stages.filter((s) => !s.closed).map((s) => s.id);
    const selected = () => new Set(st.stages ? st.stages.filter((id) => stages.some((s) => s.id === id)) : activeIds());

    const search = h('input', { type: 'search', placeholder: 'Search name, address, notes…', value: '', autocomplete: 'off', 'aria-label': 'Search' });
    search.addEventListener('input', U.debounce(() => { st.q = search.value; shown = 100; refresh(); }, 120));
    const chipsBox = h('div', { class: 'chips scroll' });
    const sortSel = F.select(Object.keys(L.SORT_NAMES).map((k) => ({ value: k, label: L.SORT_NAMES[k] })), st.sort, { 'aria-label': 'Sort' });
    sortSel.addEventListener('change', () => { st.sort = sortSel.value; saveListState(st); refresh(); });
    const nbSel = h('select', { 'aria-label': lbl('neighborhood') });
    const rebuildNb = () => {
      nbSel.replaceChildren(h('option', { value: '' }, 'All ' + lbl('neighborhood').toLowerCase() + 's'));
      ST.neighborhoods().forEach((n) => nbSel.appendChild(h('option', { value: n, selected: n === st.neighborhood }, n)));
    };
    nbSel.addEventListener('change', () => { st.neighborhood = nbSel.value; saveListState(st); refresh(); });
    const viewsBtn = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Saved views', onclick: () => viewsSheet() }, icon('bookmark'));
    const countEl = h('div', { class: 'muted small', style: { margin: '2px 2px 8px' } });
    const listBox = h('div');

    function applyView(v) {
      st.stages = v.stages; st.sort = v.sort; st.neighborhood = v.neighborhood || '';
      saveListState(st);
      RV.app.render();
    }
    function viewsSheet() {
      sheet('Saved views', (close) => {
        const box = h('div');
        const views = S.settings.savedViews;
        if (!views.length) box.appendChild(h('p', { class: 'muted', style: { marginTop: 0 } }, 'Save the current stages, sort and ' + lbl('neighborhood').toLowerCase() + ' as a one-tap view.'));
        views.forEach((v) => box.appendChild(h('div', { class: 'row plain' },
          h('div', { class: 'main', style: { cursor: 'pointer' }, onclick: () => { close(); applyView(v); } },
            h('div', { class: 'name' }, v.name), h('div', { class: 'line2' }, L.SORT_NAMES[v.sort] + (v.neighborhood ? ' · ' + v.neighborhood : ''))),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Delete view ' + v.name, onclick: () => { ST.saveSettings((s) => { s.savedViews = s.savedViews.filter((x) => x.id !== v.id); }); close(); viewsSheet(); } }, icon('trash')))));
        box.appendChild(h('div', { class: 'actions' }, h('button', {
          class: 'btn primary', type: 'button',
          onclick: async () => {
            close();
            const name = await UI.textPrompt({ title: 'Save current view', label: 'Name', placeholder: 'e.g. Overdue return visits by street' });
            if (name && name.trim()) ST.saveSettings((s) => { s.savedViews.push({ id: U.uuid(), name: name.trim(), stages: st.stages ? st.stages.slice() : null, sort: st.sort, neighborhood: st.neighborhood }); });
          },
        }, 'Save current view')));
        return box;
      });
    }

    function groupKey(it) {
      if (st.sort === 'neighborhood') return it.rv.neighborhood || 'No ' + lbl('neighborhood').toLowerCase();
      if (st.sort === 'attention') return { overdue: 'Overdue', soon: 'Coming up', ok: 'Up to date', snoozed: 'Snoozed', closed: 'Archived' }[it.att.state];
      return '';
    }

    function refresh() {
      const all = ST.items();
      const sel = selected();
      // chips
      chipsBox.replaceChildren();
      stages.forEach((s) => {
        const n = all.filter((i) => i.rv.stage === s.id).length;
        chipsBox.appendChild(h('button', {
          class: 'chip', type: 'button', 'aria-pressed': String(sel.has(s.id)),
          onclick: () => {
            const cur = selected();
            if (cur.has(s.id)) cur.delete(s.id); else cur.add(s.id);
            st.stages = Array.from(cur); saveListState(st); shown = 100; refresh();
          },
        }, s.name, h('span', { class: 'n' }, n)));
      });
      if (st.neighborhood && !ST.neighborhoods().includes(st.neighborhood)) st.neighborhood = '';
      rebuildNb();
      sortSel.value = st.sort;
      const rows = L.filterItems(all, { stages: sel, neighborhood: st.neighborhood, q: st.q }, S.settings).sort(L.SORTS[st.sort]);
      countEl.textContent = rows.length + ' ' + (rows.length === 1 ? lbl('rv') : lbl('rvs'));
      listBox.replaceChildren();
      if (!rows.length) {
        const none = !S.rvs.some((r) => !r.deletedAt);
        listBox.appendChild(UI.emptyState('users', none ? 'No ' + lbl('rvs') + ' yet.' : 'No matches for these filters.',
          none ? h('button', { class: 'btn primary', type: 'button', onclick: () => F.quickAdd() }, 'Add ' + lbl('rv'))
            : h('button', { class: 'btn', type: 'button', onclick: () => { st.stages = null; st.neighborhood = ''; st.q = ''; search.value = ''; saveListState(st); refresh(); } }, 'Reset filters')));
        return;
      }
      let lastGroup = null;
      const frag = h('div', { class: 'list' });
      rows.slice(0, shown).forEach((it) => {
        const g = groupKey(it);
        if (g && g !== lastGroup) { frag.appendChild(h('div', { class: 'group-head' }, g)); lastGroup = g; }
        frag.appendChild(rvRow(it));
      });
      listBox.appendChild(frag);
      if (rows.length > shown) {
        listBox.appendChild(h('div', { style: { textAlign: 'center', marginTop: '12px' } },
          h('button', { class: 'btn', type: 'button', onclick: () => { shown += 100; refresh(); } }, 'Show ' + Math.min(100, rows.length - shown) + ' more')));
      }
    }

    const el = h('div', null,
      h('div', { class: 'sticky-filters' },
        h('div', { class: 'searchbox', style: { marginBottom: '8px' } }, icon('search', 18), search),
        chipsBox,
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' } },
          h('div', { style: { flex: 1, minWidth: 0 } }, sortSel), h('div', { style: { flex: 1, minWidth: 0 } }, nbSel), viewsBtn)),
      countEl, listBox);
    refresh();
    return { title: lbl('rvs'), el, fab: true, update: refresh };
  }

  // ---------- RV detail ----------
  function kvList(rows) {
    const dl = h('dl', { class: 'kv' });
    rows.filter(Boolean).forEach(([k, v]) => { dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, v)); });
    return dl;
  }

  function entryLabel(e) {
    if (e.type === 'nh') return lbl('notHome');
    if (e.type === 'visit') return 'Visit';
    if (e.type === 'note') return 'Note';
    if (e.type === 'stage') {
      const to = L.stageOf(S.settings, e.to), from = L.stageOf(S.settings, e.from);
      if (to.closed) return 'Archived' + (e.reason ? ': ' + ((L.reasonOf(S.settings, e.reason) || {}).name || '') : '');
      if (from.closed) return 'Restored to ' + to.name;
      return 'Moved from ' + from.name + ' to ' + to.name;
    }
    return e.type;
  }

  function detail(id) {
    const it = ST.itemFor(id);
    if (!it) {
      return { title: 'Not found', back: '#/rvs', el: UI.emptyState('alert', 'This record no longer exists.', h('a', { class: 'btn', href: '#/rvs' }, 'Back to ' + lbl('rvs'))) };
    }
    const rv = it.rv;
    const closed = it.att.state === 'closed';
    const dnc = L.isDNC(S.settings, rv);
    const reason = L.reasonOf(S.settings, rv.archiveReason);
    const els = [];

    if (dnc) {
      els.push(h('div', { class: 'banner danger', role: 'alert' }, icon('alert'), h('div', { class: 'body' }, h('strong', null, 'Do not call. '), 'Do not visit or contact this person. Visits cannot be logged on this record.')));
    } else if (closed) {
      els.push(h('div', { class: 'banner info' }, icon('archive'), h('div', { class: 'body' }, 'Archived' + (reason ? ': ' + reason.name : '') + '.',
        reason && reason.restorable ? h('div', null, h('button', { class: 'link', type: 'button', onclick: () => F.restoreFlow(rv.id) }, 'Restore')) : null)));
    }
    if (!closed && (it.att.state === 'overdue' || it.att.state === 'soon')) {
      const why = it.att.reason === 'visit' ? 'Based on the next visit date.' : 'Flagged after ' + it.att.threshold + ' days in ' + L.stageOf(S.settings, rv.stage).name + '.';
      els.push(h('div', { class: 'banner ' + (it.att.state === 'overdue' ? 'warn' : 'info') }, icon(it.att.state === 'overdue' ? 'alert' : 'clock'),
        h('div', { class: 'body' }, h('strong', null, L.attentionText(it.att) + '. '), UI.lastText(it) + '. ' + why,
          h('div', null, h('button', { class: 'link', type: 'button', onclick: () => F.snoozeSheet(rv.id) }, 'Snooze'), ' · ', h('button', { class: 'link', type: 'button', onclick: () => F.nextVisitSheet(rv.id) }, 'Set next visit')))));
    }
    const pattern = L.notHomePattern(it, S.settings, new Date());
    if (pattern) {
      els.push(h('div', { class: 'banner warn' }, icon('clock'),
        h('div', { class: 'body' },
          h('strong', null, 'Usually not home on ' + pattern.label + '. '),
          'Not home ' + pattern.nh + ' of ' + (pattern.nh + pattern.home) + ' tries at this time.',
          h('div', null, h('button', { class: 'link', type: 'button', onclick: () => ST.updateRv(rv.id, { nhBannerOff: true }) }, 'Hide for this ' + lbl('rv')),
            ' · Turn off for everyone in Settings > Needs attention.'))));
    }

    // header card
    const head = h('section', { class: 'card' },
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } }, stageBadge(rv.stage), attBadge(it.att)),
      rv.address ? h('div', null, rv.address + (rv.neighborhood ? ' · ' + rv.neighborhood : '')) : (rv.neighborhood ? h('div', null, rv.neighborhood) : null),
      rv.phone ? h('div', { class: 'muted' }, rv.phone) : null,
      !closed
        ? h('div', { class: 'stack', style: { marginTop: '12px' } },
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn big', type: 'button', onclick: () => UI.doNotHome(rv.id) }, icon('door', 22), lbl('notHome')),
            h('button', { class: 'btn big primary', type: 'button', onclick: () => F.visitDialog(rv.id) }, icon('note', 22), lbl('recordVisit'))),
          h('div', { class: 'btn-row' },
            rv.phone ? h('button', { class: 'btn sm', type: 'button', onclick: () => UI.openTel(rv.phone) }, icon('phone', 16), 'Call') : null,
            rv.phone ? h('button', { class: 'btn sm', type: 'button', onclick: () => UI.openSms(rv.phone) }, icon('message', 16), 'Text') : null,
            rv.address ? h('button', { class: 'btn sm', type: 'button', onclick: () => UI.openMap([rv.address, rv.neighborhood].filter(Boolean).join(', ')) }, icon('navigation', 16), 'Directions') : null,
            h('button', { class: 'btn sm', type: 'button', onclick: () => F.stageFlow(rv.id) }, icon('shuffle', 16), 'Stage')))
        : null);
    els.push(head);

    // details card
    const custom = (S.settings.customFields || []).map((c) => ((rv.custom || {})[c.id] ? [c.name, rv.custom[c.id]] : null));
    const rows = [
      rv.howMet ? ['How we met', rv.howMet] : null,
      rv.nextVisit ? ['Next visit', U.fmtDate(rv.nextVisit)] : null,
      rv.snoozedUntil && U.parseDateStr(rv.snoozedUntil) >= U.startOfDay(new Date()) ? ['Snoozed until', U.fmtDate(rv.snoozedUntil)] : null,
      (rv.bestTimes && rv.bestTimes.length) || rv.bestNote ? ['Best times', [L.describeWindows(rv.bestTimes), rv.bestNote].filter(Boolean).join('\n')] : null,
      rv.notes ? ['Household', rv.notes] : null,
      rv.interests ? ['Interests', rv.interests] : null,
      (rv.scriptures || []).length ? [lbl('scriptures'), rv.scriptures.join(', ')] : null,
    ].concat(custom).concat([
      ['Activity', it.visits + ' visits · ' + it.nh + ' ' + lbl('notHome').toLowerCase()],
      ['Added', U.fmtDate(new Date(rv.createdAt))],
    ]);
    const tagsEl = (rv.tags || []).length ? h('div', { style: { marginTop: '10px' } }, rv.tags.map((t) => h('span', { class: 'tag' }, t))) : null;
    els.push(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Details'), h('button', { class: 'btn sm', type: 'button', onclick: () => F.rvForm(rv) }, icon('edit', 16), 'Edit')),
      kvList(rows), tagsEl));

    // timeline
    let tlShown = 30;
    const tlBox = h('div');
    const renderTl = () => {
      tlBox.replaceChildren();
      if (!it.entries.length) { tlBox.appendChild(h('div', { class: 'muted small' }, 'No activity yet. Tap ' + lbl('notHome') + ' or ' + lbl('recordVisit') + ' above.')); return; }
      const ul = h('ul', { class: 'tl' });
      it.entries.slice(0, tlShown).forEach((e) => {
        ul.appendChild(h('li', { class: e.type },
          h('div', { class: 'what' }, entryLabel(e)),
          h('div', { class: 'when' }, U.fmtDateTime(e.at)),
          e.text ? h('div', { class: 'txt' }, e.text) : null,
          (e.scriptures || []).length ? h('div', { class: 'small muted' }, lbl('scriptures') + ': ' + e.scriptures.join(', ')) : null,
          e.type !== 'stage' || e.text ? h('div', { class: 'acts' },
            e.type !== 'stage' ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => UI.editEntrySheet(e.id) }, 'Edit') : null,
            e.type !== 'stage' ? h('button', {
              class: 'btn ghost sm', type: 'button',
              onclick: async () => { if (await confirmDialog({ title: 'Delete this entry?', confirmText: 'Delete', danger: true })) ST.deleteEntry(e.id); },
            }, 'Delete') : null) : null));
      });
      tlBox.appendChild(ul);
      if (it.entries.length > tlShown) tlBox.appendChild(h('button', { class: 'btn sm', type: 'button', style: { marginTop: '10px' }, onclick: () => { tlShown += 30; renderTl(); } }, 'Show more'));
    };
    renderTl();
    els.push(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Timeline'), !dnc ? h('button', { class: 'btn sm', type: 'button', onclick: () => F.addNoteFlow(rv.id) }, icon('plus', 16), 'Note') : null),
      tlBox));

    const more = h('button', {
      class: 'iconbtn', type: 'button', 'aria-label': 'More actions',
      onclick: () => sheet('Actions', (close) => {
        const act = (label, fn, sub) => h('button', { class: 'opt', type: 'button', onclick: () => { close(); fn(); } }, h('div', null, h('div', null, label), sub ? h('div', { class: 'sub' }, sub) : null));
        return h('div', null,
          !closed ? act('Move to stage', () => F.stageFlow(rv.id)) : null,
          !closed ? act(lbl('archive') + '…', () => F.archiveFlow(rv.id), 'Choose a reason') : (reason && reason.restorable ? act('Restore', () => F.restoreFlow(rv.id)) : null),
          !closed ? act('Set next visit date', () => F.nextVisitSheet(rv.id)) : null,
          !closed ? act('Snooze needs-attention', () => F.snoozeSheet(rv.id)) : null,
          act('Add note', () => F.addNoteFlow(rv.id)),
          act('Delete this ' + lbl('rv') + ' permanently', async () => {
            const ok = await confirmDialog({ title: 'Delete ' + rv.name + '?', message: 'This removes the record and its timeline. To keep a record of someone who should not be contacted, archive them instead.', confirmText: 'Delete', danger: true });
            if (ok) { ST.deleteRv(rv.id); location.hash = '#/rvs'; }
          }));
      }),
    }, icon('more'));
    return {
      title: rv.name, back: '#/rvs', actions: [h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Edit', onclick: () => F.rvForm(rv) }, icon('edit')), more],
      el: h('div', null, els),
    };
  }

  RV.screens = { home, today, list, detail, libSheet, rvRow };
})(window);
