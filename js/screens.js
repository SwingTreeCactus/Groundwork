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
    const addr = [rv.address, rv.neighborhood].filter(Boolean).join(', ');
    const navBtn = o.nh !== false && rv.address && it.att.state !== 'closed'
      ? h('button', {
        class: 'navbtn', type: 'button', 'aria-label': 'Directions to ' + rv.name,
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); UI.openNav(addr); },
      }, icon('navigation', 20))
      : null;
    const sub = L.isStudyStage(S.settings, rv.stage) && (rv.publication || rv.progress) ? [rv.publication, rv.progress].filter(Boolean).join(' · ') : UI.subtitle(rv);
    return h('a', { class: 'row', href: '#/rv/' + rv.id },
      h('div', { class: 'main' },
        h('div', { class: 'name' }, rv.name),
        sub ? h('div', { class: 'line2' }, sub) : null,
        h('div', { class: 'line3' },
          it.att.state !== 'closed'
            ? h('span', { class: 'stagebtn', role: 'button', tabindex: '0', 'aria-label': 'Change stage for ' + rv.name, onclick: (e) => { e.preventDefault(); e.stopPropagation(); F.stageFlow(rv.id); } }, stageBadge(rv.stage))
            : stageBadge(rv.stage),
          dnc ? h('span', { class: 'badge flag-overdue' }, 'Do not call') : null,
          attBadge(it.att),
          o.why ? h('span', { class: 'muted' }, o.why) : h('span', { class: 'muted' }, UI.lastText(it)))),
      (navBtn || nhBtn) ? h('div', { class: 'row-acts' }, navBtn, nhBtn) : null);
  }
  function listOf(items, o) {
    return h('div', { class: 'list' }, items.map((it) => rvRow(it, o)));
  }
  function card(title, body, headExtra) {
    return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title), headExtra || null), body);
  }

  // ---------- topics and campaigns (shared sheets) ----------
  function libSheet(kind, item) {
    // kind is always 'topic' now; scriptures and conversation starters live inside topics
    const title = h('input', { type: 'text', value: item ? item.title : '', 'data-autofocus': true, autocomplete: 'off', placeholder: 'e.g. Hope for the future' });
    const text = h('textarea', { value: item ? item.text : '', placeholder: 'Scriptures, questions, key points', style: { minHeight: '120px' } });
    const tags = h('input', { type: 'text', value: item ? (item.tags || []).join(', ') : '', placeholder: 'Optional, separated by commas' });
    const on = h('input', { type: 'checkbox', checked: item ? item.showOnHome : true });
    sheet(item ? 'Edit topic' : 'New topic', (close) =>
      h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          const t = title.value.trim();
          if (!t) { title.focus(); return; }
          const data = { title: t, text: text.value.trim(), tags: U.splitList(tags.value), showOnHome: on.checked };
          if (item) ST.updateLib(item.id, data); else ST.addLib('topic', data);
          close();
        },
      },
        field('Topic', title), field('Details', text), field('Tags', tags),
        h('label', { class: 'check' }, on, 'Feature on Home and in Record visit'),
        h('div', { class: 'actions' },
          item ? h('button', {
            class: 'btn danger', type: 'button',
            onclick: async () => { if (await confirmDialog({ title: 'Delete?', message: '"' + item.title + '" will be removed.', confirmText: 'Delete', danger: true })) { ST.deleteLib(item.id); close(); } },
          }, 'Delete') : null,
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
  }
  // read-only view for use at the door
  function topicView(x) {
    sheet(x.title, (close) =>
      h('div', null,
        x.text ? h('div', { class: 'readtext' }, x.text) : h('div', { class: 'muted' }, 'No details yet.'),
        (x.tags || []).length ? h('div', { style: { marginTop: '10px' } }, x.tags.map((t) => h('span', { class: 'tag' }, t))) : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => { close(); libSheet('topic', x); } }, 'Edit'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
  }
  const campRange = (c) => (c.start && c.end ? U.fmtDate(c.start) + ' to ' + U.fmtDate(c.end) : 'No dates set');
  function campaignSheet(c) {
    const pubs = String(c.publications || '').split('\n').map((x) => x.trim()).filter(Boolean);
    sheet(c.title, (close) =>
      h('div', null,
        h('div', { class: 'muted', style: { marginBottom: '10px' } }, campRange(c)),
        c.topic ? h('div', { class: 'kvline' }, h('div', { class: 'k' }, 'Topic'), h('div', null, c.topic)) : null,
        c.text ? h('div', { class: 'kvline' }, h('div', { class: 'k' }, 'About'), h('div', { class: 'readtext' }, c.text)) : null,
        pubs.length ? h('div', { class: 'kvline' }, h('div', { class: 'k' }, 'Featured publications'), h('ul', { class: 'plainul' }, pubs.map((x) => h('li', null, x)))) : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => { close(); RV.settingsScreens.campaignForm(c); } }, 'Edit'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
  }

  // ---------- Home ----------
  // Home is for planning: the live campaign, topics to review, and a way to add someone.
  // The work lists (overdue, scheduled, tagged) live on Today.
  function section(title, body, extra) {
    return h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h2', null, title), extra || null), body);
  }
  function campaignBar() {
    const camps = ST.campaigns();
    const now = new Date();
    const c = L.activeCampaign(camps, now);
    if (c) {
      return h('button', { class: 'campaign-bar', type: 'button', onclick: () => campaignSheet(c) },
        h('div', { class: 'cb-text' },
          h('div', { class: 'cb-label' }, lbl('campaign') + ' now'),
          h('div', { class: 'cb-title' }, c.title),
          h('div', { class: 'cb-sub' }, [c.topic, 'until ' + U.fmtDate(c.end)].filter(Boolean).join(' · '))),
        icon('right', 22));
    }
    const nx = L.nextCampaign(camps, now);
    if (nx && U.daysBetween(U.parseDateStr(nx.start), now) <= 21) {
      return h('button', { class: 'campaign-soon', type: 'button', onclick: () => campaignSheet(nx) },
        icon('calendar', 16), 'Next ' + lbl('campaign').toLowerCase() + ': ' + nx.title + ' starts ' + U.fmtDate(nx.start));
    }
    return null;
  }
  function homeSections(items) {
    const now = new Date();
    const builders = {
      topics() {
        const all = ST.featuredTopics();
        const shown = all.slice(0, 6);
        const body = all.length
          ? h('div', { class: 'plainlist' }, shown.map((x) =>
            h('button', { class: 'prow', type: 'button', onclick: () => topicView(x) },
              h('div', { class: 'pt' }, x.title),
              x.text ? h('div', { class: 'pd' }, x.text) : null)))
          : h('div', { class: 'muted small' }, 'No featured topics yet.');
        return section(lbl('topics'), body, h('span', { class: 'sec-actions' },
          h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Add topic', onclick: () => libSheet('topic') }, icon('plus', 18)),
          h('a', { class: 'link-quiet', href: '#/settings/lib/topic' }, all.length > shown.length ? 'All ' + all.length : 'Manage')));
      },
      quickAdd() {
        return section('Add', h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => F.quickAdd() }, icon('plus', 18), 'New ' + lbl('rv')),
          h('button', { class: 'btn', type: 'button', onclick: () => F.rvForm(null) }, 'Full form')));
      },
      recent() {
        const top = L.recentlyAdded(items, now).slice(0, 5);
        return section('Recently added', top.length ? listOf(top) : h('div', { class: 'muted small' }, 'None'));
      },
      likelyHome() {
        const out = L.likelyHomeNow(items, now).slice(0, 8);
        return section('Likely home right now', out.length
          ? h('div', { class: 'list' }, out.map((o) => rvRow(o.item, { why: o.why })))
          : h('div', { class: 'muted small' }, 'Nobody stands out yet.'));
      },
    };
    return S.settings.homeCards.filter((c) => c.on && builders[c.id]).map((c) => builders[c.id]());
  }

  function home() {
    const items = ST.items();
    const welcome = !S.rvs.some((r) => !r.deletedAt)
      ? card('Welcome', h('div', { class: 'stack' },
        h('div', { class: 'muted' }, 'Add your first ' + lbl('rv') + ', or import a spreadsheet.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => F.quickAdd() }, icon('plus', 18), 'Add ' + lbl('rv')),
          h('a', { class: 'btn', href: '#/settings/data' }, 'Import CSV'))))
      : null;
    const d = new Date();
    return {
      title: 'Home', sub: U.DAYS[d.getDay()] + ', ' + U.MONTHS[d.getMonth()] + ' ' + d.getDate(), fab: true,
      el: h('div', { class: 'home' }, campaignBar(), welcome, homeSections(items),
        h('div', { style: { textAlign: 'center' } }, h('a', { class: 'link-quiet', href: '#/settings/home' }, 'Edit Home screen'))),
    };
  }

  // ---------- Today ----------
  // Today = what you missed + what is scheduled for today + RVs tagged for today's weekday.
  // Anything further out is in the 7-day forecast at the bottom.
  function today() {
    const items = ST.items();
    const now = new Date();
    const plan = L.todayPlan(items, now);
    const fc = L.forecast(items, now, 7);
    const els = [];
    const count = (n) => h('span', { class: 'count' }, String(n));
    if (plan.overdue.length) els.push(h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h2', null, 'Overdue'), count(plan.overdue.length)), listOf(plan.overdue)));
    if (plan.scheduled.length) els.push(h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h2', null, 'Scheduled today'), count(plan.scheduled.length)), listOf(plan.scheduled)));
    if (plan.tagged.length) {
      const box = h('div');
      let last = null;
      plan.tagged.forEach((t) => {
        const part = t.tag.part || '';
        if (part !== last) { box.appendChild(h('div', { class: 'subhead' }, part ? part[0].toUpperCase() + part.slice(1) : 'Any time')); last = part; }
        box.appendChild(h('div', { class: 'list', style: { marginBottom: '8px' } }, rvRow(t.item, {
          why: [t.nhToday ? lbl('notHome') + ' earlier today' : null, UI.lastText(t.item)].filter(Boolean).join(' · '),
        })));
      });
      els.push(h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h2', null, 'Tagged for today'), count(plan.tagged.length)), box));
    }
    if (!els.length) {
      els.push(UI.emptyState('check', 'Nothing on your list today.',
        h('div', { class: 'small', style: { marginTop: '6px' } }, 'RVs show up here when they are overdue, scheduled for today, or tagged with today\'s day of the week.')));
    }
    // 7-day forecast
    const fbox = h('div');
    if (!fc.length) fbox.appendChild(h('div', { class: 'muted small' }, 'Nothing coming up.'));
    fc.forEach((day, i) => {
      const rows = day.scheduled.map((it) => ({ it, why: 'Planned visit' })).concat(day.tagged.map((t) => ({ it: t.item, why: L.tagLabel(t.tag) })));
      let shown = 5;
      const list = h('div', { class: 'list' });
      const paint = () => {
        list.replaceChildren(...rows.slice(0, shown).map((r) => rvRow(r.it, { nh: false, why: r.why })));
        if (rows.length > shown) list.appendChild(h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { shown = rows.length; paint(); } }, 'Show ' + (rows.length - shown) + ' more'));
      };
      paint();
      const d = day.date;
      fbox.appendChild(h('div', { class: 'daygroup' },
        h('div', { class: 'subhead' }, (day.dateStr === U.toDateStr(U.addDays(now, 1)) ? 'Tomorrow · ' : '') + U.DAYS3[d.getDay()] + ', ' + U.MONTHS[d.getMonth()] + ' ' + d.getDate()),
        list));
    });
    els.push(h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h2', null, 'Next 7 days')), fbox));
    return { title: lbl('today'), fab: true, el: h('div', null, els) };
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
    if (e.type === 'visit') return e.progress ? 'Study' : 'Visit';
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

    // header card: who they are and what to bring up, then the actions
    const study = !closed && L.isStudyStage(S.settings, rv.stage);
    const lastStudy = it.entries.find((e) => e.type === 'visit' && e.progress);
    const lastVisit = study ? null : it.entries.find((e) => e.type === 'visit' && e.text);
    const editNext = async () => {
      const t = await UI.textPrompt({ title: 'Discuss next time', multiline: true, value: rv.whatsNext || '', placeholder: 'Bring next time' });
      if (t !== null) ST.updateRv(rv.id, { whatsNext: t.trim() });
    };
    const snapshot = !closed || rv.whatsNext || lastVisit
      ? h('div', { class: 'snap' },
        study
          ? h('button', { class: 'snap-row study', type: 'button', onclick: () => F.studyEdit(rv.id) },
            h('div', { class: 'snap-k' }, 'Studying'),
            h('div', { class: 'snap-v study-pub' + (rv.publication ? '' : ' empty') }, rv.publication || 'Choose a publication'),
            h('div', { class: 'snap-v' + (rv.progress ? '' : ' empty') }, rv.progress ? 'Stopped at ' + rv.progress + (lastStudy ? ' · ' + U.fmtDate(lastStudy.at) : '') : 'Add where you are'))
          : null,
        !closed || rv.whatsNext
          ? h(closed ? 'div' : 'button', { class: 'snap-row next', type: closed ? null : 'button', onclick: closed ? null : editNext },
            h('div', { class: 'snap-k' }, 'Discuss next time'),
            h('div', { class: 'snap-v' + (rv.whatsNext ? '' : ' empty') }, rv.whatsNext || 'Tap to add'))
          : null,
        lastVisit
          ? h('div', { class: 'snap-row' },
            h('div', { class: 'snap-k' }, 'Last visit · ' + U.fmtDateTime(lastVisit.at)),
            h('div', { class: 'snap-v clamp' }, lastVisit.text))
          : null)
      : null;
    const head = h('section', { class: 'card' },
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } }, stageBadge(rv.stage), attBadge(it.att)),
      rv.address ? h('div', null, rv.address + (rv.neighborhood ? ' · ' + rv.neighborhood : '')) : (rv.neighborhood ? h('div', null, rv.neighborhood) : null),
      rv.phone ? h('div', { class: 'muted' }, rv.phone) : null,
      rv.notes ? h('div', { class: 'household' }, rv.notes) : null,
      snapshot,
      !closed
        ? h('div', { class: 'stack', style: { marginTop: '12px' } },
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn big', type: 'button', onclick: () => UI.doNotHome(rv.id) }, icon('door', 22), lbl('notHome')),
            h('button', { class: 'btn big primary', type: 'button', onclick: () => F.visitDialog(rv.id) }, icon('note', 22), study ? lbl('logStudy') : lbl('recordVisit'))),
          study ? null : h('div', { class: 'chips quicklog' },
            ['Brief chat', 'Left literature'].map((t) => h('button', { class: 'chip', type: 'button', onclick: () => { const res = ST.logVisit(rv.id, { text: t }); toast(t + ' logged', { seconds: 6, actions: [{ label: 'Undo', fn: res.undo }] }); } }, '+ ' + t))),
          h('div', { class: 'btn-row' },
            rv.phone ? h('button', { class: 'btn sm', type: 'button', onclick: () => UI.openTel(rv.phone) }, icon('phone', 16), 'Call') : null,
            rv.phone ? h('button', { class: 'btn sm', type: 'button', onclick: () => UI.openSms(rv.phone) }, icon('message', 16), 'Text') : null,
            rv.address ? h('button', { class: 'btn sm', type: 'button', onclick: () => UI.openNav([rv.address, rv.neighborhood].filter(Boolean).join(', ')) }, icon('navigation', 16), 'Directions') : null,
            h('button', { class: 'btn sm', type: 'button', onclick: () => F.stageFlow(rv.id) }, icon('shuffle', 16), 'Stage')))
        : null);
    els.push(head);

    // details card
    const custom = (S.settings.customFields || []).map((c) => ((rv.custom || {})[c.id] ? [c.name, rv.custom[c.id]] : null));
    const rows = [
      rv.howMet ? ['How we met', rv.howMet] : null,
      UI.campaignName(rv.campaignId) ? ['Met during', UI.campaignName(rv.campaignId)] : null,
      rv.nextVisit ? ['Next visit', U.fmtDate(rv.nextVisit)] : null,
      rv.snoozedUntil && U.parseDateStr(rv.snoozedUntil) >= U.startOfDay(new Date()) ? ['Snoozed until', U.fmtDate(rv.snoozedUntil)] : null,
      L.dayTagsOf(rv).length ? ['Best days', L.dayTagsOf(rv).map(L.tagLabel).join('\n')] : null,
      (rv.bestTimes && rv.bestTimes.length) || rv.bestNote ? ['Best times', [L.describeWindows(rv.bestTimes), rv.bestNote].filter(Boolean).join('\n')] : null,
      rv.interests ? ['Interests', rv.interests] : null,
      (rv.scriptures || []).length ? [lbl('scriptures'), rv.scriptures.join(', ')] : null,
    ].concat(custom).concat([
      ['Activity', it.visits + ' visits · ' + it.nh + ' ' + lbl('notHome').toLowerCase()],
      ['Added', U.fmtDate(new Date(rv.createdAt))],
    ]);
    const tagsEl = (rv.tags || []).length ? h('div', { style: { marginTop: '10px' } }, rv.tags.map((t) => h('span', { class: 'tag' }, t))) : null;
    els.push(h('details', { class: 'card fold' },
      h('summary', null, h('h2', null, 'Details'), icon('down', 18)),
      h('div', { style: { margin: '10px 0' } }, h('button', { class: 'btn sm', type: 'button', onclick: () => F.rvForm(rv) }, icon('edit', 16), 'Edit')),
      kvList(rows), tagsEl));

    // timeline
    let tlShown = 30;
    const tlBox = h('div');
    const renderTl = () => {
      tlBox.replaceChildren();
      if (!it.entries.length) { tlBox.appendChild(h('div', { class: 'muted small' }, 'No activity yet.')); return; }
      const ul = h('ul', { class: 'tl' });
      it.entries.slice(0, tlShown).forEach((e) => {
        ul.appendChild(h('li', { class: e.type },
          h('div', { class: 'what' }, entryLabel(e)),
          h('div', { class: 'when' }, U.fmtDateTime(e.at)),
          e.progress ? h('div', { class: 'txt', style: { fontWeight: 500 } }, (e.publication ? e.publication + ' · ' : '') + e.progress) : null,
          e.text ? h('div', { class: 'txt' }, e.text) : null,
          (e.scriptures || []).length ? h('div', { class: 'small muted' }, lbl('scriptures') + ': ' + e.scriptures.join(', ')) : null,
          UI.campaignName(e.campaignId) ? h('div', { class: 'small muted' }, lbl('campaign') + ': ' + UI.campaignName(e.campaignId)) : null,
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
      h('div', { class: 'card-head' }, h('h2', null, 'Timeline')),
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

  RV.screens = { home, today, list, detail, libSheet, topicView, campaignSheet, rvRow };
})(window);
