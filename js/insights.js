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
      ? h('div', { class: 'list' }, stuck.slice(0, 8).map((x) => rowFor(x.item, x.days + ' days in ' + L.shownName(S.settings, x.stage.id))))
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
    const rw = h('div', { class: 'rw', role: 'img', 'aria-label': r.seen + ' of ' + r.due + ' ' + lbl('rvs') + ' due this week watered' }, h('div', { class: 'n' }, r.seen + '/' + r.due));
    rw.insertAdjacentHTML('afterbegin', svg);
    return h('section', { class: 'icard' },
      h('div', { class: 'ring' }, rw,
        h('div', null,
          h('div', { class: 't1' }, 'Due this week'),
          h('div', { class: 't2' }, r.left ? r.left + ' left to water' : 'All caught up'),
          h('div', { class: 't3' }, 'Only ' + lbl('rvs') + ' coming due by Saturday count.'))),
      h('div', { class: 'idiv' }),
      h('div', { class: 'streak' },
        h('div', { class: 'big' }, String(sk.streak)),
        h('div', null,
          h('div', { class: 't2' }, (sk.streak === 1 ? 'week' : 'weeks') + ', nobody past due'),
          h('div', { class: 't3' }, 'Best: ' + sk.best + (sk.freezes ? ' · ' + sk.freezes + (sk.freezes === 1 ? ' freeze' : ' freezes') + ' saved' : '')))),
      h('div', { class: 'wks', role: 'img', 'aria-label': 'Last 12 weeks' }, sk.weeks.map((w) => h('i', { class: w }))),
      h('div', { class: 'wkn' }, 'Last 12 weeks · pale dot = freeze used'));
  }
  // ---------- the garden scene ----------
  // One bed of soil per area, every plant standing in it, under a sky that follows the clock.
  // Butterflies visit lush plants; a bird sits on a lush study's tree. Tap a plant for its card.
  const svgEl = (html, cls, style) => { const d = document.createElement('div'); d.innerHTML = html; const el = d.firstChild; if (cls) el.setAttribute('class', cls); if (style) el.setAttribute('style', style); return el; };
  const FLY = '<svg aria-hidden="true" viewBox="0 0 16 14"><g class="w"><ellipse cx="4.5" cy="5" rx="4" ry="4.5" class="f1"/><ellipse cx="11.5" cy="5" rx="4" ry="4.5" class="f1"/><ellipse cx="5" cy="10.5" rx="3" ry="3" class="f2"/><ellipse cx="11" cy="10.5" rx="3" ry="3" class="f2"/></g><rect x="7.3" y="3" width="1.4" height="10" rx=".7" class="fb"/></svg>';
  const BIRD = '<svg aria-hidden="true" viewBox="0 0 22 16"><ellipse cx="10" cy="10" rx="8" ry="5.5" class="bb"/><circle cx="16" cy="6" r="4" class="bb"/><path d="M19.5 6 L22 7 L19.5 8 Z" fill="#E0A458"/><circle cx="17" cy="5" r="1" fill="#FFFFFF"/><path d="M2 9 L-1 6 L3 7 Z" class="bb"/></svg>';
  function skySvg(t) {
    const stars = t === 'night' ? '<g class="stars"><circle cx="40" cy="30" r="1.4"/><circle cx="96" cy="58" r="1.1"/><circle cx="150" cy="22" r="1.3"/><circle cx="214" cy="48" r="1"/><circle cx="248" cy="16" r="1.2"/><circle cx="120" cy="96" r="1"/></g>' : '';
    const sun = t === 'night' ? '<circle cx="304" cy="52" r="20" class="sun"/><circle cx="314" cy="46" r="18" class="skyf"/>' : '<circle cx="304" cy="52" r="22" class="sun"/>';
    const clouds = t === 'night' ? '' : '<g class="cloud"><ellipse cx="62" cy="62" rx="26" ry="9"/><ellipse cx="76" cy="55" rx="14" ry="9"/></g><g class="cloud c2"><ellipse cx="190" cy="92" rx="22" ry="7"/><ellipse cx="200" cy="86" rx="11" ry="7"/></g>';
    return '<svg class="gsky" aria-hidden="true" viewBox="0 0 366 170" preserveAspectRatio="xMidYMax slice"><rect width="366" height="170" class="skyf"/>' + stars + sun + clouds +
      '<path d="M0 150 C60 118 120 120 180 140 C240 160 300 116 366 132 L366 170 L0 170 Z" class="hill"/><path d="M0 162 C80 146 160 152 230 160 C290 166 330 154 366 156 L366 170 L0 170 Z" class="hill2"/></svg>';
  }
  // grass tufts and pebbles scattered over the ground (same spots every time)
  function tufts() {
    const box = h('div', { class: 'gdecor', 'aria-hidden': 'true' });
    let r = 7;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    for (let i = 0; i < 22; i++) {
      const x = (rnd() * 92 + 2).toFixed(1), y = (rnd() * 94 + 2).toFixed(1);
      const html = i % 4 === 3
        ? '<svg viewBox="0 0 14 8"><ellipse cx="5" cy="5" rx="4.5" ry="3" class="peb"/><ellipse cx="11" cy="6" rx="2.6" ry="2" class="peb"/></svg>'
        : '<svg viewBox="0 0 16 12"><path d="M3 12 C3 8 2 5 0 3 M7 12 C7 7 7 4 8 0 M11 12 C11 8 12 5 15 3" class="tuft"/></svg>';
      box.appendChild(svgEl(html, i % 4 === 3 ? 'gpeb' : 'gtuft', 'left:' + x + '%;top:' + y + '%'));
    }
    return box;
  }
  function gardenScene(plots, now, earned) {
    const t = G.skyOf(now);
    const card = h('div', { class: 'gcard', hidden: true });
    let selEl = null;
    const pick = (el, x) => {
      if (selEl) selEl.classList.remove('sel');
      if (selEl === el) { selEl = null; card.hidden = true; return; }
      selEl = el; el.classList.add('sel'); P.water(el);
      const word = x.st.word || L.shownName(S.settings, x.it.rv.stage);
      card.replaceChildren(
        h('div', { class: 'gct' }, h('b', null, x.it.rv.name),
          h('span', { class: x.st.word ? 'gword' : '' }, word)),
        h('a', { class: 'btn primary sm', href: '#/rv/' + x.it.rv.id }, 'Open'));
      card.hidden = false;
    };
    let seed = 0, flies = 0, birds = 0;
    const beds = plots.map((p) => {
      // fit the bed to the screen: up to 4 plants a row, a little closer together on narrow phones
      const avail = Math.min(root.innerWidth || 390, 640) - 24 - 20 - 4;
      const PER = 4, SP = Math.max(56, Math.min(80, Math.floor((avail - 12) / 4.5)));
      const cols = Math.min(p.plants.length, PER);
      const rows = Math.ceil(p.plants.length / PER);
      const bed = h('div', { class: 'gbed', style: { width: (cols * SP + 12 + (rows > 1 ? SP / 2 : 0)) + 'px', height: (rows * 40 + 26) + 'px' } });
      p.plants.forEach((x, i) => {
        const r = Math.floor(i / PER), c = i % PER;
        const el = SC.plantOf(x.st, 'lg', { seed: seed++, bare: true });
        el.classList.add('gp');
        el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.removeAttribute('aria-hidden');
        el.setAttribute('aria-label', x.it.rv.name + ', ' + (x.st.word || L.shownName(S.settings, x.it.rv.stage)));
        const left = 6 + c * SP + (r % 2 ? SP / 2 : 0), top = r * 40 - 78;
        el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.zIndex = String(10 + r);
        el.addEventListener('click', () => pick(el, x));
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(el, x); } });
        bed.appendChild(el);
        if (x.st.care === G.CARE.LUSH && flies < 6) bed.appendChild(svgEl(FLY, 'gfly', 'left:' + (left + 56) + 'px;top:' + (top + 14) + 'px;animation-delay:' + (-flies++ * 1.7) + 's'));
        if (x.st.form === 5 && x.st.care >= G.CARE.HEALTHY && birds < 2) { birds++; bed.appendChild(svgEl(BIRD, 'gbird', 'left:' + (left + 18) + 'px;top:' + (top + 2) + 'px')); }
      });
      const due = p.wilting + p.thirsty;
      return h('div', { class: 'gplot' + (cols <= 2 ? ' small' : '') },
        bed,
        h('a', { class: 'gsign', href: '#/insights/plot/' + areaKey(p.name) }, h('i', { class: due ? 'due' : '' }), p.name || 'No area'));
    });
    return h('section', { class: 'gscene', 'data-t': t, 'aria-label': 'Your garden' },
      svgEl(skySvg(t)),
      h('div', { class: 'gground' }, tufts(), svgEl('<svg class="gwalk" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M45 100 C45 80 30 70 55 55 C80 40 40 30 60 15 C70 7 80 3 82 0" /></svg>'), h('div', { class: 'gbeds' }, beds), exhibitSquare(earned || {})),
      card);
  }

  // ---------- exhibits: earned milestones stand in the garden as objects ----------
  const STONE = 'class="o1"', STONE2 = 'class="o2"', ACC = 'class="oa"', WATER = 'class="ow"';
  const EXH_ART = {
    'first-study': '<svg viewBox="0 0 30 64" aria-hidden="true"><rect x="13.5" y="22" width="3" height="40" rx="1.5" ' + STONE2 + '/><rect x="8" y="10" width="14" height="15" rx="4" ' + STONE + '/><rect x="11" y="13" width="8" height="9" rx="2" ' + ACC + '/><path d="M6 10 L15 3 L24 10 Z" ' + STONE2 + '/><rect x="9" y="60" width="12" height="3" rx="1.5" ' + STONE2 + '/></svg>',
    rv25: '<svg viewBox="0 0 64 36" aria-hidden="true"><rect x="4" y="8" width="56" height="5" rx="2.5" ' + STONE2 + '/><rect x="4" y="17" width="56" height="6" rx="3" ' + STONE + '/><rect x="9" y="23" width="4" height="11" rx="2" ' + STONE2 + '/><rect x="51" y="23" width="4" height="11" rx="2" ' + STONE2 + '/></svg>',
    area: '<svg viewBox="0 0 60 56" aria-hidden="true"><path d="M8 38 H52 L48 52 H12 Z" ' + STONE + '/><rect x="6" y="34" width="48" height="6" rx="3" ' + STONE2 + '/><rect x="27" y="14" width="6" height="22" rx="3" ' + STONE2 + '/><path d="M18 18 C22 10 38 10 42 18" stroke-width="4" fill="none" stroke-linecap="round" class="o2s"/><g ' + WATER + '><circle cx="30" cy="8" r="3"/><circle cx="22" cy="24" r="2"/><circle cx="38" cy="24" r="2"/><circle cx="30" cy="30" r="2"/></g></svg>',
    studies3: '<svg viewBox="0 0 50 50" aria-hidden="true"><ellipse cx="25" cy="14" rx="21" ry="6" ' + STONE + '/><ellipse cx="25" cy="13" rx="16" ry="3.6" ' + WATER + '/><path d="M20 18 H30 L28 44 H22 Z" ' + STONE2 + '/><rect x="14" y="44" width="22" height="5" rx="2.5" ' + STONE + '/><ellipse cx="34" cy="7" rx="4" ry="3" ' + ACC + '/><circle cx="37" cy="5" r="2" ' + ACC + '/></svg>',
    rv50: '<svg viewBox="0 0 60 70" aria-hidden="true"><path d="M8 68 V30 C8 12 52 12 52 30 V68" stroke-width="5" fill="none" class="o2s"/><path d="M8 40 C4 36 4 30 8 28 M52 40 C56 36 56 30 52 28 M14 18 C10 14 12 10 16 12 M46 18 C50 14 48 10 44 12 M30 12 C28 8 32 6 32 10" stroke-width="3" fill="none" stroke-linecap="round" class="oas"/><g ' + ACC + '><circle cx="12" cy="24" r="3"/><circle cx="48" cy="24" r="3"/><circle cx="30" cy="11" r="3"/><circle cx="21" cy="14" r="2.5"/><circle cx="39" cy="14" r="2.5"/></g></svg>',
    streak26: '<svg viewBox="0 0 50 50" aria-hidden="true"><rect x="19" y="20" width="12" height="26" rx="2" ' + STONE2 + '/><rect x="12" y="44" width="26" height="5" rx="2.5" ' + STONE + '/><ellipse cx="25" cy="18" rx="20" ry="7" ' + STONE + '/><path d="M25 18 L25 6 L33 18 Z" ' + ACC + '/></svg>',
    first10: '<svg viewBox="0 0 64 50" aria-hidden="true"><rect x="4" y="8" width="7" height="42" rx="2" ' + STONE2 + '/><rect x="53" y="8" width="7" height="42" rx="2" ' + STONE2 + '/><path d="M11 18 H53 M11 40 H53" stroke-width="3" class="o2s"/><path d="M17 16 V46 M24 15 V46 M32 14 V46 M40 15 V46 M47 16 V46" stroke-width="3" stroke-linecap="round" class="o1s"/><circle cx="7.5" cy="7" r="4" ' + ACC + '/><circle cx="56.5" cy="7" r="4" ' + ACC + '/></svg>',
    streak52: '<svg viewBox="0 0 70 84" aria-hidden="true"><rect x="31" y="44" width="8" height="38" rx="3" ' + STONE2 + '/><path d="M35 58 L22 46 M35 52 L48 42" stroke-width="4" stroke-linecap="round" class="o2s"/><g ' + ACC + '><circle cx="35" cy="22" r="18"/><circle cx="18" cy="36" r="14"/><circle cx="52" cy="34" r="14"/><circle cx="35" cy="40" r="12"/></g><g class="ofr"><circle cx="26" cy="26" r="2.6"/><circle cx="44" cy="20" r="2.6"/><circle cx="52" cy="38" r="2.6"/><circle cx="18" cy="40" r="2.6"/><circle cx="35" cy="34" r="2.6"/></g></svg>',
  };
  function exhibitObj(id, name, locked) {
    const d = h('div', { class: 'gobj o-' + id + (locked ? ' locked' : ''), role: 'img', 'aria-label': name + (locked ? ' (not yet)' : '') });
    d.innerHTML = EXH_ART[id] || '';
    return d;
  }
  // the earned ones, standing together at the foot of the garden
  function exhibitSquare(earned) {
    const got = G.EXHIBITS.filter(([id]) => earned[id]);
    if (!got.length) return null;
    return h('div', { class: 'gsquare' }, got.map(([id, , name]) => exhibitObj(id, name, false)));
  }
  function exhibitSheet(earned) {
    UI.sheet('Exhibits', (close) => h('div', null,
      h('div', { class: 'exgrid' }, G.EXHIBITS.map(([id, , name]) => h('div', { class: 'exitem' + (earned[id] ? '' : ' locked') },
        exhibitObj(id, name, !earned[id]),
        h('b', null, name),
        h('span', null, earned[id] ? U.fmtDate(new Date(earned[id])) : 'Not yet')))),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
  }
  function exhibitCard(earned) {
    const n = G.EXHIBITS.filter(([id]) => earned[id]).length;
    return h('button', { class: 'exrow', type: 'button', onclick: () => exhibitSheet(earned) },
      h('span', { class: 'n' }, n + ' of ' + G.EXHIBITS.length), h('span', { class: 't' }, 'Exhibits in the garden'), icon('right', 18));
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
    return { title: 'Insights', el: h('div', null, plots.length ? gardenScene(plots, now, earned) : null, ringCard(sk), exhibitCard(earned), goingCard(items, now), keep) };
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

  // ---------- week's-end recap ----------
  // Shown once, the first time the app is opened after the Sunday-to-Saturday week ends.
  function maybeRecap() {
    if (!SC.gardenOn() || document.querySelector('.overlay, .grow-ov, .recap')) return;
    const now = new Date();
    const r = G.recap(ST.items(), S.settings, now, S.settings.gardenSince, S.settings.recapSeen);
    if (!r) return;
    ST.saveSettings((s) => { s.recapSeen = r.key; });
    const close = () => ov.remove();
    const mk = (stageId, care, vid) => P.make(G.formOf(S.settings, stageId), care, { size: 'sm', still: true, vid });
    const fmt = (d) => U.MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
    const sat = U.addDays(r.ws, 6);
    const ring = r.ring.due
      ? (r.ring.perfect ? ['Ring closed', 'All ' + r.ring.due + ' ' + lbl('rvs') + ' that came due got a visit.'] : [r.ring.seen + ' of ' + r.ring.due + ' watered', r.ring.left + ' came due and still need a visit.'])
      : ['Nothing came due', 'Nobody reached their due date this week.'];
    const C = 2 * Math.PI * 42, frac = r.ring.due ? r.ring.seen / r.ring.due : 1;
    const ringSvg = '<svg aria-hidden="true" width="76" height="76" viewBox="0 0 104 104"><circle cx="52" cy="52" r="42" fill="none" stroke-width="12" class="rbg"/>' +
      (frac > 0 ? '<circle cx="52" cy="52" r="42" fill="none" stroke-width="12" stroke-linecap="round" class="rfg" stroke-dasharray="' + (C * frac).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 52 52)"/>' : '') +
      (r.ring.perfect ? '<path d="M36 53 L47 64 L69 41" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round" class="rck"/>' : '') + '</svg>';
    const ringBox = h('div', { class: 'rring' }); ringBox.innerHTML = ringSvg;
    const names = Object.fromEntries(G.EXHIBITS.map(([id, , n]) => [id, n]));
    const ov = h('div', { class: 'recap', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your week' },
      h('div', { class: 'rin' },
        h('div', { class: 'rdate' }, 'Week of ' + fmt(r.ws) + ' to ' + fmt(sat)),
        h('h1', null, 'Your week'),
        h('section', { class: 'rcard pop' }, ringBox, h('div', null, h('b', null, ring[0]), h('div', { class: 'muted' }, ring[1]))),
        r.grew.length ? h('section', { class: 'rcard col pop', style: { animationDelay: '.15s' } }, h('h2', null, 'Grew'),
          r.grew.slice(0, 4).map((g) => h('div', { class: 'rgrew' },
            h('div', { class: 'pair' }, mk(g.from, 4, g.rv.id), icon('right', 16), mk(g.to, 4, g.rv.id)),
            h('div', null, h('b', null, g.rv.name), h('div', { class: 'acc' }, G.growthName(S.settings, g.from, g.to))))),
          r.grew.length > 4 ? h('div', { class: 'muted small' }, '+' + (r.grew.length - 4) + ' more') : null) : null,
        h('div', { class: 'rtwo' },
          h('section', { class: 'rcard col pop', style: { animationDelay: '.3s' } }, svgEl(FLY, 'rfly'), h('div', { class: 'n' }, String(r.lush)), h('div', { class: 'small' }, r.lush === 1 ? 'lush plant drew visitors' : 'lush plants drew visitors')),
          h('section', { class: 'rcard col pop', style: { animationDelay: '.45s' } }, h('div', { class: 'n acc', style: { paddingTop: '30px' } }, String(r.streak)), h('div', { class: 'small' }, (r.streak === 1 ? 'week' : 'weeks') + ', nobody past due'))),
        r.exhibits.length ? h('section', { class: 'rcard col pop new', style: { animationDelay: '.6s' } }, h('div', { class: 'acc small' }, 'New exhibit'), r.exhibits.map((id) => h('b', null, names[id] || id))) : null,
        h('div', { class: 'grow1' }),
        h('div', { class: 'ract' },
          h('button', { class: 'btn', type: 'button', onclick: close }, 'Close'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => { close(); location.hash = '#/insights'; } }, 'See the garden'))));
    document.body.appendChild(ov);
  }
  RV.gardenRecap = { maybeShow: maybeRecap };

  function insights(sub, key) {
    if (!SC.gardenOn()) return classic();
    if (sub === 'plot') return plotScreen(key || '-');
    return garden();
  }
  RV.screens.insights = insights;
})(window);
