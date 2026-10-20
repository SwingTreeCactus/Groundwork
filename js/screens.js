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
      }, 'Map')
      : null;
    const study = L.isStudyStage(S.settings, rv.stage) && (rv.publication || rv.nextStart)
      ? [rv.publication, rv.nextStart ? 'Next: ' + rv.nextStart : null].filter(Boolean).join(' · ') : '';
    const area = o.hideArea ? '' : (rv.neighborhood || '');
    const stage = it.att.state !== 'closed'
      ? h('span', { class: 'stagebtn', role: 'button', tabindex: '0', 'aria-label': 'Change stage for ' + rv.name, onclick: (e) => { e.preventDefault(); e.stopPropagation(); F.stageFlow(rv.id); } }, stageBadge(rv.stage))
      : stageBadge(rv.stage);
    return h('a', { class: 'row rv2', href: '#/rv/' + rv.id },
      h('div', { class: 'main' },
        h('div', { class: 'name' }, rv.name),
        h('div', { class: 'line2' }, area ? h('span', { class: 'area' }, area) : null, area ? h('span', { class: 'sep' }, '·') : null, stage,
          dnc ? h('span', { class: 'badge flag-overdue' }, 'Do not call') : null),
        o.hit ? h('div', { class: 'line2 hit' }, o.hit) : null,
        study ? h('div', { class: 'line2' }, study) : null,
        h('div', { class: 'line3' + (it.att.state === 'overdue' ? ' due' : '') }, UI.lastText(it))),
      (navBtn || nhBtn) ? h('div', { class: 'row-acts' }, nhBtn, navBtn) : null);
  }
  // Highlights the first place a search token appears in text: returns a node, or null if none matches.
  function hitLine(text, q) {
    const t = String(text || ''), tokens = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      const i = t.toLowerCase().indexOf(tok);
      if (i >= 0) return h('span', null, t.slice(0, i), h('mark', null, t.slice(i, i + tok.length)), t.slice(i + tok.length));
    }
    return null;
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
  // Home is for planning: the live campaign and topics to review. Adding someone is the + button;
  // who to see lives on Today.
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
      title: 'Groundwork', sub: U.DAYS[d.getDay()] + ', ' + U.MONTHS[d.getMonth()] + ' ' + d.getDate(), fab: true,
      el: h('div', { class: 'home' }, campaignBar(), welcome, homeSections(items),
        h('div', { style: { textAlign: 'center' } }, h('a', { class: 'link-quiet', href: '#/settings/home' }, 'Edit Home screen'))),
    };
  }

  // ---------- Today ----------
  // A dashboard: one circle per stage with how many people are in it, for today or for everyone.
  // Today = best day is today, usually home on this weekday, or no best day set (not visited today, not snoozed).
  const TODAY_KEY = 'rvapp.today';
  const todayScope = () => { try { return localStorage.getItem(TODAY_KEY) === 'all' ? 'all' : 'today'; } catch (e) { return 'today'; } };
  const setTodayScope = (v) => { try { localStorage.setItem(TODAY_KEY, v); } catch (e) { /* ignore */ } };
  function todayPool(scope, now) {
    const items = ST.items();
    return scope === 'all' ? items.filter((i) => i.att.state !== 'closed') : L.todaySet(items, now);
  }
  function seg(options, value, onPick) {
    return h('div', { class: 'seg2', role: 'tablist' }, options.map(([v, label]) =>
      h('button', { type: 'button', role: 'tab', class: v === value ? 'on' : '', 'aria-selected': String(v === value), onclick: () => onPick(v) }, label)));
  }
  function today(stageId) {
    if (stageId) return todayStage(stageId);
    const box = h('div', { class: 'dash' });
    function paint() {
      const now = new Date(), scope = todayScope();
      const pool = todayPool(scope, now);
      const stages = S.settings.stages.filter((x) => !x.closed);
      const day = U.DAYS[now.getDay()];
      box.replaceChildren(
        seg([['today', 'Today'], ['all', 'All']], scope, (v) => { setTodayScope(v); paint(); }),
        h('div', { class: 'dsum' }, h('b', null, String(pool.length)), scope === 'all' ? ' ' + (pool.length === 1 ? lbl('rv') : lbl('rvs')) : ' to see on ' + day),
        h('div', { class: 'cgrid' }, stages.map((x, k) => {
          const n = pool.filter((i) => i.rv.stage === x.id).length;
          const wide = k === stages.length - 1 && stages.length % 2 === 1;
          return h('a', { class: 'cell' + (wide ? ' wide' : ''), href: '#/today/' + encodeURIComponent(x.id), 'aria-label': x.name + ': ' + n },
            h('span', { class: 'circ' + (n ? '' : ' zero') + (n && L.isStudyStage(S.settings, x.id) ? ' study' : '') }, h('span', { class: 'num' }, String(n))),
            h('span', { class: 'clab' }, x.name));
        })));
    }
    paint();
    return { title: lbl('today'), fab: true, el: box, update: paint };
  }
  function todayStage(stageId) {
    const st = L.stageOf(S.settings, stageId);
    const box = h('div');
    function paint() {
      const now = new Date(), scope = todayScope();
      const rows = todayPool(scope, now).filter((i) => i.rv.stage === stageId).sort(L.SORTS.oldest);
      box.replaceChildren(
        seg([['today', 'Today'], ['all', 'All']], scope, (v) => { setTodayScope(v); paint(); }),
        h('div', { class: 'dsum' }, h('b', null, String(rows.length)), scope === 'all' ? ' in ' + st.name : ' to see on ' + U.DAYS[now.getDay()]),
        rows.length ? listOf(rows) : UI.emptyState('check', scope === 'all' ? 'Nobody in this stage.' : 'Nobody in this stage today.'));
    }
    paint();
    return { title: st.name, back: '#/today', fab: true, el: box, update: paint };
  }

  // ---------- RV list ----------
  // Search plus one filter button. Filters live on a separate page, one picker wheel per category.
  // Default order: longest since the last visit first, so nobody falls through the cracks.
  const LS_KEY = 'rvapp.list';
  const LIST_SORTS = [['oldest', 'Longest since visit'], ['neighborhood', 'Area'], ['name', 'Name'], ['newest', 'Newest']];
  function loadListState() {
    let st = {};
    try { st = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { st = {}; }
    const stage = typeof st.stage === 'string' ? st.stage : (Array.isArray(st.stages) && st.stages.length === 1 ? st.stages[0] : '');
    return {
      sort: LIST_SORTS.some(([k]) => k === st.sort) ? st.sort : 'oldest',
      stage: S.settings.stages.some((x) => x.id === stage && !x.closed) ? stage : '',
      neighborhood: st.neighborhood || '', bestDay: st.bestDay || '', q: '',
    };
  }
  function saveListState(st) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ sort: st.sort, stage: st.stage, neighborhood: st.neighborhood, bestDay: st.bestDay })); } catch (e) { /* ignore */ }
  }
  const DAY_OPTS = () => [{ value: '', label: 'Any day' }, { value: 'today', label: 'Today' }]
    .concat(U.DAYS.map((d, i) => ({ value: String(i), label: d }))).concat([{ value: 'none', label: 'None set' }]);
  function listFilterFor(st) {
    const active = S.settings.stages.filter((x) => !x.closed).map((x) => x.id);
    return { stages: new Set(st.stage ? [st.stage] : active), neighborhood: st.neighborhood, bestDay: st.bestDay };
  }

  const NO_AREA = '-';
  function areaGroups(live) {
    const map = new Map();
    for (const it of live) {
      const k = it.rv.neighborhood || NO_AREA;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({ key, name: key === NO_AREA ? 'No ' + lbl('neighborhood').toLowerCase() : key, items }))
      .sort((a, b) => (a.key === NO_AREA) - (b.key === NO_AREA) || U.cmp(a.name, b.name));
  }
  // One area: likely home today first, everyone else underneath, each longest since a visit first.
  function areaScreen(key) {
    const name = key === NO_AREA ? 'No ' + lbl('neighborhood').toLowerCase() : key;
    const box = h('div');
    function paint() {
      const now = new Date();
      const all = ST.items();
      const inArea = (i) => (i.rv.neighborhood || NO_AREA) === key;
      const live = all.filter((i) => i.att.state !== 'closed' && inArea(i)).sort(L.SORTS.oldest);
      const home = new Set(L.likelyHomeToday(all, now).filter(inArea).map((i) => i.rv.id));
      const top = live.filter((i) => home.has(i.rv.id)), rest = live.filter((i) => !home.has(i.rv.id));
      const sec = (title, arr) => arr.length ? [h('div', { class: 'ghead' }, h('span', null, title), h('span', null, String(arr.length))), listOf(arr, { hideArea: true })] : [];
      box.replaceChildren(...(live.length
        ? sec('Likely home ' + U.DAYS[now.getDay()], top).concat(sec(top.length ? 'Others' : 'Everyone here', rest))
        : [UI.emptyState('users', 'Nobody here yet.')]));
    }
    paint();
    return { title: name, back: '#/rvs', fab: true, el: box, update: paint };
  }

  function list(sub, key) {
    if (sub === 'area' && key) return areaScreen(key);
    const st = loadListState();
    let shown = 100;
    const search = h('input', { type: 'search', placeholder: 'Search name, address, notes…', value: '', autocomplete: 'off', 'aria-label': 'Search' });
    const onSearch = U.debounce(() => { if (st.q === search.value) return; st.q = search.value; shown = 100; refresh(); }, 120);
    ['input', 'search', 'change', 'compositionend', 'keyup'].forEach((ev) => search.addEventListener(ev, onSearch));
    const filterBtn = h('button', { class: 'fbtn', type: 'button', 'aria-label': 'Filter and sort', onclick: () => filterSheet() }, icon('sliders', 22));
    const chipsBox = h('div', { class: 'achips' });
    const metaEl = h('div', { class: 'lmeta' });
    const listBox = h('div');

    const activeCount = () => (st.stage ? 1 : 0) + (st.neighborhood ? 1 : 0) + (st.bestDay ? 1 : 0);
    const dayLabel = (v) => (DAY_OPTS().find((x) => x.value === v) || {}).label || v;
    function clearAll() { st.stage = ''; st.neighborhood = ''; st.bestDay = ''; saveListState(st); shown = 100; refresh(); }

    function filterSheet() {
      const all = ST.items();
      sheet('Filter and sort', (close) => {
        const go = h('button', { class: 'btn primary block', type: 'button', onclick: () => close() });
        const wheels = {};
        const upd = () => {
          const n = L.filterItems(all, listFilterFor(st), S.settings).length;
          go.textContent = 'Show ' + n + ' ' + (n === 1 ? lbl('rv') : lbl('rvs'));
          saveListState(st); shown = 100; refresh();
        };
        const sec = (label, w) => h('div', { class: 'wsec' }, h('div', { class: 'wlab' }, label), w);
        wheels.sort = UI.wheel(LIST_SORTS.map(([value, label]) => ({ value, label })), st.sort, (v) => { st.sort = v; upd(); }, { label: 'Sort' });
        wheels.stage = UI.wheel([{ value: '', label: 'Any stage' }].concat(S.settings.stages.filter((x) => !x.closed).map((x) => ({ value: x.id, label: x.name }))), st.stage, (v) => { st.stage = v; upd(); }, { label: 'Stage', neutral: '' });
        wheels.area = UI.wheel([{ value: '', label: 'Any ' + lbl('neighborhood').toLowerCase() }].concat(ST.neighborhoods().map((x) => ({ value: x, label: x }))), st.neighborhood, (v) => { st.neighborhood = v; upd(); }, { label: lbl('neighborhood'), neutral: '' });
        wheels.day = UI.wheel(DAY_OPTS(), st.bestDay, (v) => { st.bestDay = v; upd(); }, { label: 'Best day', neutral: '' });
        const reset = h('button', { class: 'link-quiet', type: 'button', onclick: () => {
          st.sort = 'oldest'; st.stage = ''; st.neighborhood = ''; st.bestDay = '';
          wheels.sort.setValue('oldest'); wheels.stage.setValue(''); wheels.area.setValue(''); wheels.day.setValue('');
          upd();
        } }, 'Reset');
        upd();
        return h('div', { class: 'fsheet' },
          h('div', { class: 'fsheet-top' }, reset),
          sec('Sort', wheels.sort), sec('Stage', wheels.stage), sec(lbl('neighborhood'), wheels.area), sec('Best day', wheels.day),
          h('div', { class: 'actions' }, go),
          h('button', { class: 'link-quiet saved', type: 'button', onclick: () => { close(); viewsSheet(); } }, 'Saved views'));
      }, { noFocus: true });
    }

    function applyView(v) {
      st.sort = LIST_SORTS.some(([k]) => k === v.sort) ? v.sort : 'oldest';
      st.stage = v.stage || (Array.isArray(v.stages) && v.stages.length === 1 ? v.stages[0] : '');
      st.neighborhood = v.neighborhood || ''; st.bestDay = v.bestDay || '';
      saveListState(st);
      shown = 100; refresh();
    }
    function viewsSheet() {
      sheet('Saved views', (close) => {
        const box = h('div');
        const views = S.settings.savedViews;
        if (!views.length) box.appendChild(h('p', { class: 'muted', style: { marginTop: 0 } }, 'Save the current filters and sort as a one-tap view.'));
        views.forEach((v) => box.appendChild(h('div', { class: 'row plain' },
          h('div', { class: 'main', style: { cursor: 'pointer' }, onclick: () => { close(); applyView(v); } },
            h('div', { class: 'name' }, v.name),
            h('div', { class: 'line2' }, [(LIST_SORTS.find(([k]) => k === v.sort) || [0, 'Longest since visit'])[1], v.stage ? L.stageOf(S.settings, v.stage).name : null, v.neighborhood, v.bestDay ? dayLabel(v.bestDay) : null].filter(Boolean).join(' · '))),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Delete view ' + v.name, onclick: () => { ST.saveSettings((s) => { s.savedViews = s.savedViews.filter((x) => x.id !== v.id); }); close(); viewsSheet(); } }, icon('trash')))));
        box.appendChild(h('div', { class: 'actions' }, h('button', {
          class: 'btn primary', type: 'button',
          onclick: async () => {
            close();
            const name = await UI.textPrompt({ title: 'Save current view', label: 'Name', placeholder: 'e.g. Oak Park studies' });
            if (name && name.trim()) ST.saveSettings((s) => { s.savedViews.push({ id: U.uuid(), name: name.trim(), sort: st.sort, stage: st.stage, stages: st.stage ? [st.stage] : null, neighborhood: st.neighborhood, bestDay: st.bestDay }); });
          },
        }, 'Save current view')));
        return box;
      });
    }

    // No search and no filters: one tile per area, then the few people who have gone longest without a visit.
    function paintTiles(all) {
      const live = all.filter((i) => i.att.state !== 'closed');
      const groups = areaGroups(live);
      const word = (k) => (k === 1 ? lbl('rv') : lbl('rvs'));
      metaEl.replaceChildren(h('span', null, live.length + ' ' + word(live.length) + (groups.length ? ' in ' + groups.length + ' ' + (groups.length === 1 ? 'area' : 'areas') : '')));
      if (!live.length) {
        listBox.replaceChildren(UI.emptyState('users', 'No ' + lbl('rvs') + ' yet.'));
        return;
      }
      const next = live.slice().sort(L.SORTS.oldest).slice(0, 3);
      listBox.replaceChildren(
        h('div', { class: 'tgrid' }, groups.map((g) => {
          const due = g.items.filter((i) => i.att.state === 'overdue').length;
          return h('a', { class: 'atile', href: '#/rvs/area/' + encodeURIComponent(g.key) },
            h('span', { class: 'n' }, String(g.items.length)),
            h('span', { class: 'nm' }, g.name),
            h('span', { class: 'sub' + (due ? '' : ' calm') }, due ? due + ' due' : 'All recent'));
        })),
        h('div', { class: 'upn' }, h('span', null, 'Up next'), h('span', { class: 'muted' }, 'longest since a visit')),
        listOf(next));
    }

    function refresh() {
      const all = ST.items();
      if (st.neighborhood && !ST.neighborhoods().includes(st.neighborhood)) st.neighborhood = '';
      const searching = !!String(st.q || '').trim();
      const n = activeCount();
      filterBtn.classList.toggle('on', n > 0);
      filterBtn.replaceChildren(...[icon('sliders', 22), n ? h('span', { class: 'b' }, String(n)) : null].filter(Boolean));
      // a search looks through everyone; the filters only apply when not searching
      chipsBox.replaceChildren(...(searching ? [] : [
        st.stage ? ['stage', L.stageOf(S.settings, st.stage).name] : null,
        st.neighborhood ? ['neighborhood', st.neighborhood] : null,
        st.bestDay ? ['bestDay', 'Best day: ' + dayLabel(st.bestDay)] : null,
      ].filter(Boolean).map(([k, label]) => h('button', { class: 'achip', type: 'button', 'aria-label': 'Remove ' + label, onclick: () => { st[k] = ''; saveListState(st); shown = 100; refresh(); } }, label, icon('x', 14)))));
      chipsBox.hidden = !chipsBox.firstChild;
      if (!searching && !n) { paintTiles(all); return; }
      const filter = searching ? { stages: new Set(S.settings.stages.filter((x) => !x.closed).map((x) => x.id)), q: st.q } : Object.assign(listFilterFor(st), { q: '' });
      const rows = L.filterItems(all, filter, S.settings).sort(L.SORTS[st.sort] || L.SORTS.oldest);
      const total = all.filter((i) => i.att.state !== 'closed').length;
      const word = (k) => (k === 1 ? lbl('rv') : lbl('rvs'));
      metaEl.replaceChildren(...[
        h('span', null, searching ? rows.length + ' found' : n ? rows.length + ' of ' + total + ' ' + word(total) : rows.length + ' ' + word(rows.length)),
        !searching && n ? h('button', { class: 'link-quiet', type: 'button', onclick: clearAll }, 'Clear all') : null].filter(Boolean));
      listBox.replaceChildren();
      if (!rows.length) {
        const none = !S.rvs.some((r) => !r.deletedAt);
        listBox.appendChild(UI.emptyState('users', none ? 'No ' + lbl('rvs') + ' yet.' : searching ? 'Nobody matches that search.' : 'Nobody matches these filters.',
          none ? null : !searching ? h('button', { class: 'btn', type: 'button', onclick: clearAll }, 'Clear filters') : null));
        return;
      }
      const grouped = st.sort === 'neighborhood' && !searching;
      const rowOf = (it) => {
        // the address is not on the row, so show it when that is what the search matched
        const hit = searching && it.rv.address && !String(it.rv.name).toLowerCase().includes(String(st.q).trim().toLowerCase()) ? hitLine(it.rv.address, st.q) : null;
        return rvRow(it, { hideArea: grouped, hit });
      };
      const slice = rows.slice(0, shown);
      if (grouped) {
        let i = 0;
        while (i < slice.length) {
          const g = slice[i].rv.neighborhood || 'No ' + lbl('neighborhood').toLowerCase();
          const members = [];
          while (i < slice.length && (slice[i].rv.neighborhood || 'No ' + lbl('neighborhood').toLowerCase()) === g) members.push(slice[i++]);
          const count = rows.filter((r) => (r.rv.neighborhood || 'No ' + lbl('neighborhood').toLowerCase()) === g).length;
          listBox.appendChild(h('div', { class: 'ghead' }, h('span', null, g), h('span', null, String(count))));
          listBox.appendChild(h('div', { class: 'list' }, members.map(rowOf)));
        }
      } else {
        listBox.appendChild(h('div', { class: 'list' }, slice.map(rowOf)));
      }
      if (rows.length > shown) {
        listBox.appendChild(h('div', { style: { textAlign: 'center', marginTop: '12px' } },
          h('button', { class: 'btn', type: 'button', onclick: () => { shown += 100; refresh(); } }, 'Show ' + Math.min(100, rows.length - shown) + ' more')));
      }
    }

    const el = h('div', null,
      h('div', { class: 'sticky-filters' },
        h('div', { class: 'sbar2' }, h('div', { class: 'searchbox' }, icon('search', 18), search), filterBtn),
        chipsBox),
      metaEl, listBox);
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
    if (e.type === 'visit') return e.progress || e.nextStart ? 'Study' : 'Visit';
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
            h('div', { class: 'study-line' }, h('span', { class: 'snap-k' }, 'Next'), h('span', { class: 'snap-v' + (rv.nextStart ? '' : ' empty') }, rv.nextStart || 'Tap to set')),
            h('div', { class: 'study-line' }, h('span', { class: 'snap-k' }, 'Last covered'), h('span', { class: 'snap-v' + (rv.progress ? '' : ' empty') }, rv.progress ? rv.progress + (lastStudy ? ' · ' + U.fmtDate(lastStudy.at) : '') : '—')))
          : null,
        (!closed && !study) || rv.whatsNext
          ? h(closed ? 'div' : 'button', { class: 'snap-row next', type: closed ? null : 'button', onclick: closed ? null : editNext },
            h('div', { class: 'snap-k' }, 'Discuss next time'),
            h('div', { class: 'snap-v' + (rv.whatsNext ? '' : ' empty') }, rv.whatsNext || 'Tap to add'))
          : null,
        lastVisit
          ? h('div', { class: 'snap-row' },
            h('div', { class: 'snap-k' }, 'Last visit · ' + U.fmtDateTime(lastVisit.at)),
            h('div', { class: 'snap-v' }, lastVisit.text))
          : null)
      : null;
    const head = h('section', { class: 'card' },
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } }, stageBadge(rv.stage), it.att.state === 'snoozed' ? attBadge(it.att) : null),
      rv.address ? h('div', null, rv.address + (rv.neighborhood ? ' · ' + rv.neighborhood : '')) : (rv.neighborhood ? h('div', null, rv.neighborhood) : null),
      rv.phone ? h('div', { class: 'muted' }, rv.phone) : null,
      rv.notes ? h('div', { class: 'household' }, rv.notes) : null,
      snapshot,
      !closed
        ? h('div', { class: 'stack', style: { marginTop: '12px' } },
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn big', type: 'button', onclick: () => UI.doNotHome(rv.id) }, icon('door', 22), 'Record ' + lbl('notHomeShort')),
            h('button', { class: 'btn big primary', type: 'button', onclick: () => F.visitDialog(rv.id) }, icon('note', 22), study ? lbl('logStudy') : lbl('recordVisit'))),
          study ? null : h('div', { class: 'quicklog' },
            h('span', { class: 'ql-label' }, 'One-tap log'),
            ['Brief chat', 'Left literature'].map((t) => h('button', { class: 'btn sm ql', type: 'button', onclick: () => { const res = ST.logVisit(rv.id, { text: t }); toast(t + ' logged', { seconds: 4, actions: [{ label: 'Undo', fn: res.undo }] }); } }, icon('plus', 16), t))),
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
      rv.snoozedUntil && U.parseDateStr(rv.snoozedUntil) >= U.startOfDay(new Date()) ? ['Snoozed until', U.fmtDate(rv.snoozedUntil)] : null,
      L.dayTagsOf(rv).length || rv.bestNote ? ['Best days', [L.tagsLabel(rv), rv.bestNote].filter(Boolean).join('\n')] : null,
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
          e.progress || e.nextStart ? h('div', { class: 'txt', style: { fontWeight: 500 } }, [e.publication, e.progress ? 'Covered ' + e.progress : null, e.nextStart ? 'next: ' + e.nextStart : null].filter(Boolean).join(' · ')) : null,
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
          !closed ? act('Snooze', () => F.snoozeSheet(rv.id)) : null,
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
