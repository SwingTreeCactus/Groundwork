/* RV app: Insights. v2.16 garden: weekly ring and streak, garden plots per area, exhibits, how it's going,
   then the funnel and patterns worth a look. Garden off: the v2.15 screen (effort points). */
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

  function classic() {
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

  // ---------- garden ----------
  const G = RV.garden, P = RV.plant, SC = RV.screens;
  const DAYS_PL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  const pct = (x) => (x == null ? '–' : Math.round(x * 100) + '%');
  const areaKey = (name) => encodeURIComponent(name || '-');

  function ringCard(sk) {
    const r = sk.ring, C = 2 * Math.PI * 42;
    const frac = r.due ? r.seen / r.due : 1;
    const svg = '<svg viewBox="0 0 104 104" width="104" height="104" aria-hidden="true"><circle class="bg" cx="52" cy="52" r="42" fill="none" stroke-width="12"/>' +
      (frac > 0 ? '<circle class="fg" cx="52" cy="52" r="42" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + (C * frac).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 52 52)"/>' : '') + '</svg>';
    const rw = h('div', { class: 'rw', role: 'img', 'aria-label': r.seen + ' of ' + r.due + ' due ' + lbl('rvs') + ' seen this week' }, h('div', { class: 'n' }, r.seen + '/' + r.due));
    rw.insertAdjacentHTML('afterbegin', svg);
    return h('section', { class: 'icard' },
      h('div', { class: 'ring' }, rw,
        h('div', null,
          h('div', { class: 't1' }, 'This week'),
          h('div', { class: 't2' }, r.left ? r.left + ' left to water' : 'All caught up'),
          r.left ? h('div', { class: 't3' }, 'Close the ring by Saturday to keep your streak.') : null)),
      h('div', { class: 'idiv' }),
      h('div', { class: 'streak' },
        h('div', { class: 'big' }, String(sk.streak)),
        h('div', null,
          h('div', { class: 't2' }, (sk.streak === 1 ? 'week' : 'weeks') + ', no follow-up missed'),
          h('div', { class: 't3' }, 'Best: ' + sk.best + (sk.freezes ? ' · ' + sk.freezes + (sk.freezes === 1 ? ' freeze' : ' freezes') + ' saved' : '')))),
      h('div', { class: 'wks', role: 'img', 'aria-label': 'Last 12 weeks' }, sk.weeks.map((w) => h('i', { class: w }))),
      h('div', { class: 'wkn' }, 'Last 12 weeks · pale dot = freeze used'));
  }
  function plotCard(plots) {
    let ok = 0, dry = 0, wilt = 0;
    plots.forEach((p) => p.plants.forEach((x) => { if (x.st.care >= 3) ok++; else if (x.st.care === 2) dry++; else wilt++; }));
    return h('section', { class: 'icard' },
      h('div', { class: 'ih' }, h('h2', null, 'Your garden'), h('span', { class: 'muted' }, (ok + dry + wilt) + ' ' + lbl('rvs'))),
      h('div', { class: 'legend' },
        h('span', null, h('i', { style: { background: 'var(--pl-4)' } }), ok + ' thriving'),
        h('span', null, h('i', { style: { background: 'var(--pl-2)' } }), dry + ' thirsty'),
        h('span', null, h('i', { style: { background: 'var(--pl-1)' } }), wilt + ' wilting')),
      plots.map((p) => {
        const note = p.wilting ? p.wilting + ' wilting' : p.thirsty ? p.thirsty + ' thirsty' : 'All watered';
        return h('a', { class: 'plot', href: '#/insights/plot/' + areaKey(p.name) },
          h('div', { class: 'pt' }, h('b', null, p.name || 'No area'), h('span', { class: p.wilting || p.thirsty ? 'due' : '' }, note)),
          h('div', { class: 'pp' }, p.plants.slice(0, 7).map((x, k) => SC.plantOf(x.st, 'sm', { seed: k }))),
          h('div', { class: 'soil' }));
      }));
  }
  function exhibitCard(earned) {
    const n = G.EXHIBITS.filter(([id]) => earned[id]).length;
    return h('section', { class: 'icard' },
      h('div', { class: 'ih' }, h('h2', null, 'Exhibits'), h('span', { class: 'muted' }, n + ' of ' + G.EXHIBITS.length)),
      h('div', { class: 'exh' }, G.EXHIBITS.map(([id, mark, name]) =>
        h('div', { class: earned[id] ? 'on' : '', title: earned[id] ? 'Earned ' + U.fmtDate(new Date(earned[id])) : 'Not yet' }, h('b', null, mark), name))));
  }
  function goingCard(items, now) {
    const r = G.rates(items, now);
    const grid = G.activityGrid(items, now);
    return h('section', { class: 'icard' },
      h('h2', null, "How it's going"),
      h('div', { class: 'rates' },
        h('div', null, h('div', { class: 'n' }, pct(r.found)), h('div', { class: 'l' }, 'Found home'),
          r.bestDay ? h('div', { class: 's acc' }, 'Best: ' + DAYS_PL[r.bestDay.day] + ' ' + pct(r.bestDay.pct)) : h('div', { class: 's' }, 'last 90 days')),
        h('div', null, h('div', { class: 'n' }, pct(r.prepared)), h('div', { class: 'l' }, 'Prepared visits'), h('div', { class: 's' }, 'had Discuss next time'))),
      h('div', { class: 'dgrid', role: 'img', 'aria-label': 'Conversations per day, last 12 weeks' }, grid.map((l) => h('i', { class: l ? 'l' + l : '' }))),
      h('div', { class: 'wkn', style: { marginTop: '-6px' } }, 'Last 12 weeks · darker = more conversations'));
  }

  function garden() {
    const items = ST.items();
    const now = new Date();
    const live = items.filter((i) => i.att.state !== 'closed');
    const sk = G.streak(items, S.settings, now, S.settings.gardenSince);
    const plots = G.plots(live, S.settings, now);
    // exhibits are earned once and kept
    const got = G.exhibitsEarned(items, S.settings, now, S.settings.gardenSince, sk.best);
    const earned = Object.assign({}, S.settings.exhibits || {});
    const fresh = G.EXHIBITS.map(([id]) => id).filter((id) => got[id] && !earned[id]);
    if (fresh.length) {
      const at = U.nowISO();
      fresh.forEach((id) => { earned[id] = at; });
      setTimeout(() => ST.saveSettings((s) => { s.exhibits = Object.assign({}, s.exhibits || {}, earned); }), 0);
    }
    const old = classic();
    const keep = Array.from(old.el.children).filter((x, i) => i === 0 || i >= 3); // funnel, worth reconsidering, stuck in stage
    return { title: 'Insights', el: h('div', null, ringCard(sk), plots.length ? plotCard(plots) : null, exhibitCard(earned), goingCard(items, now), keep) };
  }

  // One area's plot: every plant in a row of soil, then the list.
  function plotScreen(key) {
    const name = key === '-' ? '' : key;
    const now = new Date();
    const p = G.plots(ST.items().filter((i) => i.att.state !== 'closed'), S.settings, now).find((x) => x.name === name);
    if (!p) return { title: name || 'No area', back: '#/insights', el: UI.emptyState('check', 'Nobody here right now.') };
    const sum = p.wilting || p.thirsty ? [p.wilting ? p.wilting + ' wilting' : null, p.thirsty ? p.thirsty + ' thirsty' : null].filter(Boolean).join(', ') : 'All watered';
    return {
      title: name || 'No area', back: '#/insights',
      el: h('div', null,
        h('section', { class: 'plotbed' },
          h('div', { class: 'sum' }, sum),
          h('div', { class: 'pp' }, p.plants.map((x, k) => h('a', { href: '#/rv/' + x.it.rv.id, 'aria-label': x.it.rv.name },
            SC.plantOf(x.st, 'rw', { seed: k }), h('span', { class: 'nm' }, x.it.rv.name.split(' ')[0])))),
          h('div', { class: 'soil' })),
        h('div', { class: 'list' }, p.plants.map((x) => SC.rvRow(x.it, { hideArea: true })))),
    };
  }

  function insights(sub, key) {
    if (!SC.gardenOn()) return classic();
    if (sub === 'plot') return plotScreen(key || '-');
    return garden();
  }
  RV.screens.insights = insights;
})(window);
