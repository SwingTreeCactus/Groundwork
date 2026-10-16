/* RV app: Insights screen (funnel snapshot, effort points, 60-day activity, patterns worth a look). */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const { h, icon } = RV.dom;
  const U = RV.util, L = RV.logic, ST = RV.store, UI = RV.ui;
  const S = ST.S;
  const { lbl } = UI;

  const sec = (title, body, note, noteAfter) => {
    const n = note ? h('p', { class: 'muted small', style: { margin: noteAfter ? '12px 0 0' : '0 0 10px' } }, note) : null;
    return h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h2', null, title)), noteAfter ? null : n, body, noteAfter ? n : null);
  };

  // open the RV list showing only one stage
  function openStage(id) {
    try {
      const cur = JSON.parse(localStorage.getItem('rvapp.list') || '{}') || {};
      localStorage.setItem('rvapp.list', JSON.stringify({ stages: [id], sort: cur.sort || 'attention', neighborhood: '' }));
    } catch (e) { /* ignore */ }
    location.hash = '#/rvs';
  }

  function insights() {
    const items = ST.items();
    const now = new Date();
    const fun = L.funnel(items, S.settings);
    const eff = L.effortSummary(items, S.settings, now);
    // Pattern lists are additive: skip anyone already shown on Today.
    const plan = L.todayPlan(items, now);
    const shownOnToday = new Set(plan.overdue.concat(plan.scheduled, plan.tagged.map((t) => t.item)).map((i) => i.rv.id));
    const recon = L.reconsider(items, S.settings, now, shownOnToday);
    const stuck = L.stuckInStage(items, S.settings, now, new Set(Array.from(shownOnToday).concat(recon.map((r) => r.item.rv.id))));

    // funnel
    const max = Math.max(1, ...fun.rows.map((r) => r.count));
    const funnelBox = h('div', { class: 'funnel' }, fun.rows.map((r, i) =>
      h('button', { class: 'frow', type: 'button', onclick: () => openStage(r.stage.id), 'aria-label': r.stage.name + ': ' + r.count },
        h('div', { class: 'fname' }, r.stage.name),
        h('div', { class: 'fbar' }, h('i', { class: 'f' + ((i % 5) + 1), style: { width: Math.max(r.count ? 4 : 0, Math.round((r.count / max) * 100)) + '%' } })),
        h('div', { class: 'fcount' }, String(r.count)))));
    if (fun.archived) funnelBox.appendChild(h('div', { class: 'muted small', style: { marginTop: '6px' } }, fun.archived + ' archived'));

    // effort
    const delta = eff.last7 - eff.prev7;
    const effortBox = h('div', { class: 'effort' },
      h('div', { class: 'big' }, h('span', { class: 'num' }, String(eff.last7)), h('span', { class: 'unit' }, ' points in the last 7 days')),
      h('div', { class: 'muted small' }, eff.prev7 || eff.last7 ? (delta > 0 ? delta + ' more' : delta < 0 ? Math.abs(delta) + ' fewer' : 'The same') + ' than the 7 days before' : ''),
      h('div', { class: 'level' },
        h('div', { class: 'lvl-row' }, h('strong', null, 'Level ' + eff.level), h('span', { class: 'muted small' }, eff.lifetime + ' / ' + eff.levelNext + ' points')),
        h('div', { class: 'bar' }, h('i', { style: { width: eff.levelPct + '%' } }))));

    // 60 days
    const c = eff.counts60;
    const tile = (n, label) => h('div', { class: 'tile' }, h('div', { class: 'tn' }, String(n)), h('div', { class: 'tl' }, label));
    const tiles = h('div', { class: 'tiles' },
      tile(c.newRvs, 'New ' + lbl('rvs')), tile(c.visits, 'Visits'), tile(c.nh, lbl('notHome')), tile(c.advances, 'Moved forward'), tile(c.studies, 'Studies started'));

    const rowFor = (it, line2, line3) =>
      h('a', { class: 'row', href: '#/rv/' + it.rv.id },
        h('div', { class: 'main' }, h('div', { class: 'name' }, it.rv.name), h('div', { class: 'line2', style: { whiteSpace: 'normal' } }, line2),
          line3 ? h('div', { class: 'line3 hint-line' }, line3) : null),
        icon('right', 18));

    const reconBox = recon.length
      ? h('div', { class: 'list' }, recon.slice(0, 8).map((r) => rowFor(r.item, lbl('notHome') + ' ' + r.nh + ' times on ' + r.label, r.suggest)))
      : h('div', { class: 'muted small' }, 'Nothing right now');
    const stuckBox = stuck.length
      ? h('div', { class: 'list' }, stuck.slice(0, 8).map((x) => rowFor(x.item, x.days + ' days in ' + x.stage.name)))
      : h('div', { class: 'muted small' }, 'Nobody right now');

    return {
      title: 'Insights',
      el: h('div', null,
        sec('Funnel', funnelBox),
        sec('Effort', effortBox),
        sec('Last 60 days', tiles),
        sec('Worth reconsidering', reconBox),
        sec('Stuck in stage', stuckBox)),
    };
  }

  RV.screens.insights = insights;
})(window);
