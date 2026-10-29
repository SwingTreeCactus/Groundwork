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
          )),
      h('div', { class: 'idiv' }),
      h('div', { class: 'streak' },
        h('div', { class: 'big' }, String(sk.streak)),
        h('div', null,
          h('div', { class: 't2' }, (sk.streak === 1 ? 'week' : 'weeks') + ', nobody past due'),
          h('div', { class: 't3' }, 'Best: ' + sk.best + (sk.freezes ? ' · ' + sk.freezes + (sk.freezes === 1 ? ' freeze' : ' freezes') + ' saved' : '')))),
      h('div', { class: 'wks', role: 'img', 'aria-label': 'Last 12 weeks' }, sk.weeks.map((w) => h('i', { class: w }))));
  }
  // ---------- the garden scene ----------
  // One bed of soil per area, every plant standing in it, under a sky that follows the clock.
  // Butterflies visit lush plants; a bird sits on a lush study's tree. Tap a plant for its card.
  const svgEl = (html, cls, style) => { const d = document.createElement('div'); d.innerHTML = html; const el = d.firstChild; if (cls) el.setAttribute('class', cls); if (style) el.setAttribute('style', style); return el; };
  const FLY = '<svg aria-hidden="true" viewBox="0 0 16 14"><g class="w"><ellipse cx="4.5" cy="5" rx="4" ry="4.5" class="f1"/><ellipse cx="11.5" cy="5" rx="4" ry="4.5" class="f1"/><ellipse cx="5" cy="10.5" rx="3" ry="3" class="f2"/><ellipse cx="11" cy="10.5" rx="3" ry="3" class="f2"/></g><rect x="7.3" y="3" width="1.4" height="10" rx=".7" class="fb"/></svg>';
  // v2.23 rare visitors: by chance, only when the garden is doing well. Purely decorative.
  const BIRD = '<svg aria-hidden="true" viewBox="0 0 22 16"><ellipse cx="10" cy="10" rx="8" ry="5.5" class="bb"/><circle cx="16" cy="6" r="4" class="bb"/><path d="M19.5 6 L22 7 L19.5 8 Z" fill="#E0A458"/><circle cx="17" cy="5" r="1" fill="#FFFFFF"/><path d="M2 9 L-1 6 L3 7 Z" class="bb"/></svg>';
  // v2.36: a layered landscape behind the page title: sky, sun or moon, clouds, far hills, a tree line, near hills and a
  // picket fence with a gate. Colours come from CSS variables per time of day and season.
  function skySvg(t) {
    let r = 5; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    const f = (v) => String(Math.round(v * 10) / 10);
    const night = t === 'night';
    let o = '<defs><linearGradient id="gskyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0"/><stop offset=".55" class="s1"/><stop offset="1" class="s2"/></linearGradient></defs>';
    o += '<rect width="390" height="260" fill="url(#gskyg)"/>';
    if (night) { o += '<g class="stars">'; for (let k = 0; k < 40; k++) o += '<circle cx="' + f(rnd() * 390) + '" cy="' + f(rnd() * 170) + '" r="' + f(.5 + rnd() * 1.1) + '"/>'; o += '</g>'; }
    const sx = t === 'dusk' ? 92 : t === 'morning' ? 70 : 304, sy = t === 'dusk' ? 196 : t === 'morning' ? 150 : 86, sr = t === 'dusk' ? 32 : night ? 20 : 24;
    o += '<circle cx="' + sx + '" cy="' + sy + '" r="' + (sr + 26) + '" class="ring2"/><circle cx="' + sx + '" cy="' + sy + '" r="' + (sr + 12) + '" class="ring1"/><circle cx="' + sx + '" cy="' + sy + '" r="' + sr + '" class="sun"/>';
    if (night) o += '<circle cx="' + (sx - 6) + '" cy="' + (sy - 4) + '" r="4" class="crater"/><circle cx="' + (sx + 6) + '" cy="' + (sy + 6) + '" r="3" class="crater"/><circle cx="' + (sx + 7) + '" cy="' + (sy - 8) + '" r="2" class="crater"/>';
    const cloud = (x, y, k, c) => '<g class="cloud' + (c || '') + '" transform="translate(' + x + ' ' + y + ') scale(' + k + ')"><ellipse cx="0" cy="0" rx="26" ry="9"/><circle cx="-8" cy="-6" r="10"/><circle cx="8" cy="-9" r="12"/><circle cx="22" cy="-3" r="8"/></g>';
    o += cloud(86, 74, 1.1) + cloud(214, 128, .8, ' c2') + cloud(352, 158, .7);
    o += '<path d="M0 196 Q60 158 130 178 Q200 196 260 166 Q320 138 390 172 L390 260 L0 260 Z" class="far"/>';
    o += '<path d="M0 220 Q80 192 160 212 Q240 230 310 204 Q350 192 390 202 L390 260 L0 260 Z" class="far2"/>';
    for (let x = -6; x < 400; x += 15 + rnd() * 12) {
      const y = 232 + rnd() * 10, k = .8 + rnd() * .35;
      o += rnd() < .3
        ? '<g transform="translate(' + f(x) + ' ' + f(y) + ') scale(' + f(k) + ')"><rect x="-1.2" y="-3" width="2.4" height="8" class="trunk"/><ellipse cx="0" cy="-16" rx="6" ry="15" class="t0"/><ellipse cx="-1.5" cy="-19" rx="2.5" ry="9" class="t1"/></g>'
        : '<g transform="translate(' + f(x) + ' ' + f(y) + ') scale(' + f(k) + ')"><rect x="-1.5" y="-4" width="3" height="10" class="trunk"/><circle cx="-7" cy="-10" r="9" class="t2"/><circle cx="6" cy="-12" r="10" class="t0"/><circle cx="-1" cy="-19" r="9" class="t1"/></g>';
    }
    o += '<path d="M0 246 Q100 228 200 240 Q300 252 390 236 L390 260 L0 260 Z" class="mid"/>';
    o += '<path d="M0 260 V252 Q120 244 240 254 Q320 258 390 250 V260 Z" class="lip"/>';
    // the fence, with a gate in the middle
    o += '<rect x="0" y="240" width="390" height="3" class="fsh"/><rect x="0" y="250" width="390" height="3" class="fsh"/>';
    for (let x = 6; x < 390; x += 13) { if (x > 172 && x < 218) continue; o += '<path d="M' + x + ' 260 V236 L' + (x + 3) + ' 232 L' + (x + 6) + ' 236 V260 Z" class="pk"/>'; }
    o += '<rect x="170" y="228" width="6" height="32" class="pk"/><rect x="214" y="228" width="6" height="32" class="pk"/><circle cx="173" cy="226" r="3.5" class="pk"/><circle cx="217" cy="226" r="3.5" class="pk"/>';
    return '<svg class="gsky" aria-hidden="true" viewBox="0 0 390 260" preserveAspectRatio="xMidYMax slice">' + o + '</svg>';
  }
  // v2.36: a stepping-stone path winding down from the gate (stones placed in %, so it fits any height)
  function stonePath() {
    const box = h('div', { class: 'gpath', 'aria-hidden': 'true' });
    for (let k = 0; k < 46; k++) {
      const t = k / 45, x = 50 + Math.sin(t * 7.2) * 30 * (0.4 + t * 0.6) + (k % 2 ? 2.4 : -2.4), y = t * 100;
      box.appendChild(h('i', { style: { left: x.toFixed(1) + '%', top: y.toFixed(1) + '%', width: (24 + t * 8).toFixed(0) + 'px', height: (11 + t * 3).toFixed(0) + 'px' } }));
    }
    return box;
  }
  // grass tufts and pebbles scattered over the ground (same spots every time)
  // v2.29: season details in the grass (fallen leaves in autumn, blossoms in spring, frost in winter)
  const LEAF = '<svg viewBox="0 0 14 10"><path d="M1 8 C3 2 9 0 13 1 C12 5 8 9 1 8Z" class="lf"/><path d="M2 7.6 L11 2" class="lfv"/></svg>';
  const BLOSSOM = '<svg viewBox="0 0 12 12"><g class="bl"><circle cx="6" cy="3" r="2.4"/><circle cx="9" cy="5.6" r="2.4"/><circle cx="7.8" cy="9" r="2.4"/><circle cx="4.2" cy="9" r="2.4"/><circle cx="3" cy="5.6" r="2.4"/></g><circle cx="6" cy="6.6" r="1.4" class="blc"/></svg>';
  function seasonFall(season) {
    if (season !== 'autumn' && season !== 'winter') return null;
    const n = season === 'autumn' ? 7 : 16;
    const box = h('div', { class: 'gfall ' + season, 'aria-hidden': 'true' });
    let r = 11;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    for (let i = 0; i < n; i++) {
      const dur = season === 'autumn' ? 16 + rnd() * 10 : 18 + rnd() * 12;
      const el = season === 'autumn' ? svgEl(LEAF, 'fl') : h('i', { class: 'fs' });
      el.setAttribute('style', 'left:' + (rnd() * 96).toFixed(1) + '%;animation-duration:' + dur.toFixed(1) + 's,' + (3 + rnd() * 3).toFixed(1) + 's;animation-delay:-' + (rnd() * dur).toFixed(1) + 's,0s' + (season === 'winter' ? ';width:' + (3 + rnd() * 3).toFixed(1) + 'px;height:auto' : ''));
      box.appendChild(el);
    }
    return box;
  }
  function tufts(season) {
    const box = h('div', { class: 'gdecor', 'aria-hidden': 'true' });
    let r = 7;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    // v2.36: a meadow: grass tufts and small wildflowers (season details mixed in)
    const FLW = '<svg viewBox="0 0 8 8"><g class="pt"><circle cx="4" cy="1.8" r="1.6"/><circle cx="6.1" cy="3.4" r="1.6"/><circle cx="5.3" cy="5.9" r="1.6"/><circle cx="2.7" cy="5.9" r="1.6"/><circle cx="1.9" cy="3.4" r="1.6"/></g><circle cx="4" cy="4" r="1.1" class="pc"/></svg>';
    for (let i = 0; i < 70; i++) {
      const x = (rnd() * 96 + 1).toFixed(1), y = (rnd() * 97 + 1).toFixed(1);
      const extra = (season === 'autumn' || season === 'spring') && i % 4 === 1;
      const fl = !extra && i % 5 >= 3 && season !== 'winter';
      const html = extra ? (season === 'autumn' ? LEAF : BLOSSOM) : fl ? FLW
        : '<svg viewBox="0 0 16 12"><path d="M3 12 C3 8 2 5 0 3 M7 12 C7 7 7 4 8 0 M11 12 C11 8 12 5 15 3" class="tuft"/></svg>';
      box.appendChild(svgEl(html, extra ? (season === 'autumn' ? 'gleaf' : 'gbloss') : fl ? 'gwf w' + (i % 3) : 'gtuft', 'left:' + x + '%;top:' + y + '%' + (extra ? ';transform:rotate(' + Math.round(rnd() * 360) + 'deg)' : '')));
    }
    return box;
  }
  // v2.38: flowering shrubs along the edges of the meadow
  function edgeShrubs(t) {
    const box = h('div', { class: 'gshrubs', 'aria-hidden': 'true' });
    const spots = [[3, 3], [95, 34], [3, 58], [94, 80], [4, 92]];
    spots.forEach(([x, y], k) => {
      const fc = ['#FFFFFF', '#F2C94C', '#F2A7B8'][k % 3];
      box.appendChild(svgEl('<svg viewBox="-20 -24 40 32"><ellipse cx="0" cy="6" rx="18" ry="4" class="bsh"/><circle cx="-9" cy="-2" r="10" class="b0"/><circle cx="8" cy="-3" r="11" class="b0"/><circle cx="0" cy="-10" r="11" class="b1"/>' +
        [[-12, -8], [-4, -16], [6, -12], [10, -4], [-7, -1], [2, -4]].map(([a, b]) => '<circle cx="' + a + '" cy="' + b + '" r="1.9" fill="' + fc + '" class="bf"/>').join('') + '</svg>', 'gshrub', 'left:' + x + '%;top:' + y + '%'));
    });
    return box;
  }
  // v2.36: fireflies over the grass after dark (and a few at dusk)
  function fireflies(t) {
    if (t !== 'night' && t !== 'dusk') return null;
    const box = h('div', { class: 'gff', 'aria-hidden': 'true' });
    let r = 3; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    for (let i = 0; i < (t === 'night' ? 22 : 8); i++) box.appendChild(h('i', { style: { left: (rnd() * 96 + 2).toFixed(1) + '%', top: (rnd() * 92 + 4).toFixed(1) + '%', animationDelay: (-rnd() * 4).toFixed(2) + 's', animationDuration: (3 + rnd() * 3).toFixed(1) + 's' } }));
    return box;
  }
  // v2.38: the game lives in the scene. At the gate: bunting on the fence (the streak), a watering can (this week),
  // a chalk slate (today's tending) and a signpost (how it works). Numbers only show when one is tapped.
  const PENN = ['#C8473A', '#E5BF45', '#5C8C55', '#3D6B63', '#D9773E', '#EEB4C3'];
  function gateObjects(opt) {
    const sk = opt.sk, tend = opt.tend;
    const objBtn = (cls, label, html, on) => { const b = h('button', { class: 'gobt ' + cls, type: 'button', 'aria-label': label, onclick: (e) => { e.stopPropagation(); on(); } }); b.innerHTML = html; return b; };
    const els = [];
    if (sk) {
      // one pennant per week (the last twelve): coloured for a good week, pale blue for a freeze, none for a miss
      const wk = sk.weeks.slice(-12);
      let bunt = '<svg viewBox="0 0 390 34" preserveAspectRatio="none" aria-hidden="true"><path d="M0 4 Q195 30 390 4" stroke="#8E5B34" stroke-width="1.4" fill="none" vector-effect="non-scaling-stroke"/>';
      wk.forEach((w, i) => {
        if (w !== 'ok' && w !== 'frz') return;
        const x = 390 - 51 - (wk.length - 1 - i) * 29, y = 4 + 26 * (1 - Math.pow((x - 195) / 195, 2)) * 0.5;
        bunt += '<path d="M' + (x - 8) + ' ' + y.toFixed(1) + ' L' + (x + 8) + ' ' + y.toFixed(1) + ' L' + x + ' ' + (y + 15).toFixed(1) + ' Z" fill="' + (w === 'frz' ? '#9DC3D8' : PENN[i % PENN.length]) + '"/>';
      });
      // this week's pennant, still to earn, hangs as an outline at the end of the string
      { const x = 370, y = 4 + 26 * (1 - Math.pow((x - 195) / 195, 2)) * 0.5;
        bunt += '<path class="pnext" d="M' + (x - 8) + ' ' + y.toFixed(1) + ' L' + (x + 8) + ' ' + y.toFixed(1) + ' L' + x + ' ' + (y + 15).toFixed(1) + ' Z" fill="#FFFFFF" fill-opacity=".35" stroke="#8E5B34" stroke-width="1" stroke-dasharray="2 2"/>'; }
      els.push(objBtn('o-bunt', 'Streak: ' + sk.streak + (sk.streak === 1 ? ' week' : ' weeks') + ', nobody past due', bunt + '</svg>', () => UI.sheet('Streak', () => streakPart(sk))));
      // the watering can: full at the start of the week, emptier as due plants are watered
      const r = sk.ring, left = r.due ? Math.max(0, r.due - r.seen) / r.due : 0, wh = Math.round(14 * left);
      els.push(objBtn('o-can', 'This week: ' + r.seen + ' of ' + r.due + ' watered',
        '<svg viewBox="0 0 72 60" aria-hidden="true"><ellipse cx="30" cy="54" rx="22" ry="4" class="osh"/><path d="M14 22 H44 L42 52 H16 Z" fill="#7C98A6"/><rect x="12" y="18" width="34" height="6" rx="3" fill="#5F7C8A"/><path d="M44 30 L60 18" stroke="#5F7C8A" stroke-width="5" stroke-linecap="round"/><ellipse cx="61" cy="17" rx="5" ry="3" fill="#5F7C8A" transform="rotate(-35 61 17)"/><path d="M18 18 C18 6 40 6 40 18" stroke="#5F7C8A" stroke-width="4" fill="none"/><rect x="18" y="34" width="22" height="14" rx="2" fill="#6D8A98"/>' +
        (wh ? '<rect x="19" y="' + (48 - wh) + '" width="20" height="' + wh + '" fill="#8FC6E3"/>' : '') + '</svg>', () => UI.sheet('This week', () => ringPart(sk))));
    }
    if (tend) {
      const done = tend.goals.filter((g) => g.done).length;
      let sl = '<svg viewBox="0 0 56 64" aria-hidden="true"><rect x="4" y="44" width="5" height="20" fill="#8E5B34"/><rect x="47" y="44" width="5" height="20" fill="#8E5B34"/><rect x="0" y="4" width="56" height="44" rx="5" fill="#A9733F"/><rect x="5" y="9" width="46" height="34" rx="3" fill="#3B4540"/>';
      tend.goals.slice(0, 3).forEach((g, k) => {
        const y = 19 + k * 10;
        sl += g.done ? '<path d="M11 ' + y + ' l3 3 6-6" stroke="#F2EEE5" stroke-width="2" fill="none" stroke-linecap="round"/>' : '<rect x="11" y="' + (y - 3) + '" width="7" height="5" rx="1" stroke="#C9CDC5" stroke-width="1.4" fill="none"/>';
        sl += '<path d="M24 ' + y + ' H' + (44 - k * 3) + '" stroke="#C9CDC5" stroke-width="1.6" stroke-linecap="round"/>';
      });
      els.push(objBtn('o-slate', "Today's tending: " + done + ' of ' + tend.goals.length + ' done', sl + '</svg>', () => UI.sheet("Today's tending", () => bare(tendCard(tend)))));
    }
    els.push(objBtn('o-sign', 'How your garden works', '<svg viewBox="0 0 42 62" aria-hidden="true"><rect x="15" y="20" width="5" height="40" fill="#8E5B34"/><path d="M2 6 H34 L40 14 L34 22 H2 Z" fill="#E9CBA3"/><text x="18" y="19" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="13" font-weight="700" fill="#2A1D12">?</text></svg>', guideSheet));
    return h('div', { class: 'ggate' }, els);
  }
  // the field guide on the bench and the next milestone as a faint sketch, with the earned objects
  function footObjects(opt, earned) {
    const out = [];
    const book = h('button', { class: 'gobt o-guide', type: 'button', 'aria-label': 'Field guide: visitors and milestones', onclick: (e) => { e.stopPropagation(); UI.sheet('Field guide', (close) => collectTiles(earned, close)); } });
    book.innerHTML = '<svg viewBox="0 0 40 32" aria-hidden="true"><rect x="2" y="6" width="34" height="24" rx="3" fill="#8E3F25"/><rect x="6" y="6" width="30" height="20" rx="2" fill="#B4583A"/><rect x="10" y="11" width="18" height="2.4" rx="1.2" fill="#F2D3A8"/><rect x="10" y="16" width="12" height="2" rx="1" fill="#F2D3A8"/><path d="M30 6 V20 L33 17 L36 20 V6" fill="#E5BF45"/></svg>';
    out.push(book);
    if (opt.items && opt.sk) {
      const c = G.milestoneCounts(opt.items, S.settings, opt.now || new Date(), S.settings.gardenSince, opt.sk.best);
      const next = G.nextMilestones(c, earned, 1)[0];
      if (next) {
        const b = h('button', { class: 'gobt o-sketch', type: 'button', 'aria-label': 'Coming next: ' + next.name, onclick: (e) => { e.stopPropagation(); const card = nextCard(opt.items, earned, opt.sk, opt.now || new Date()); UI.sheet('Coming next', () => bare(card) || h('p', null, 'All milestones found.')); } }, exhibitObj(next.fam, next.name, true));
        out.push(b);
      }
    }
    return out;
  }
  const sheetNote = (t) => h('p', { class: 'muted small onote' }, t);
  function ringPart(sk) { const c = ringCard(sk); return h('div', { class: 'osheet' }, c.querySelector('.ring'), sheetNote('The can empties as you water the plants that are due this week.')); }
  function streakPart(sk) { const c = ringCard(sk); return h('div', { class: 'osheet' }, c.querySelector('.streak'), c.querySelector('.wks'), sheetNote('A pennant for every week nobody went past due. A pale blue one is a week a freeze kept your streak.')); }
  // a card shown in a sheet drops its own heading (the sheet has one)
  const bare = (el) => { if (el) { const t = el.querySelector('.ih, h2'); if (t) t.remove(); el.classList.add('osheet'); } return el; };
  function gardenScene(plots, now, earned, opt) {
    opt = opt || {};
    const t = G.skyOf(now);
    const card = h('div', { class: 'gcard', hidden: true });
    let selEl = null;
    const unpick = () => { if (selEl) selEl.classList.remove('sel'); selEl = null; card.hidden = true; };
    const closeBtn = () => h('button', { class: 'gx', type: 'button', 'aria-label': 'Close', onclick: unpick }, icon('x', 18));
    const pick = (el, x) => {
      if (selEl) selEl.classList.remove('sel');
      if (selEl === el) { selEl = null; card.hidden = true; return; }
      selEl = el; el.classList.add('sel'); P.water(el);
      const word = L.shownName(S.settings, x.it.rv.stage);
      card.replaceChildren(
        h('div', { class: 'gct' }, h('b', null, x.it.rv.name),
          h('span', null, word)),
        h('a', { class: 'btn primary sm', href: '#/rv/' + x.it.rv.id }, 'Open'), closeBtn());
      card.hidden = false; y0 = root.scrollY; // a scroll closes the card, counted from where it opened
    };
    // v2.24 visitors: rolled once a day; they arrive the first time they are seen that day; tap to learn why they came
    // v2.27: the visitors staying in the garden (settings.visitorsHere); one that has not played its arrival waits,
    // hidden, until it scrolls into view, then arrives; only then does it count as seen (or once announced)
    const here = opt.here || S.settings.visitorsHere || {};
    const vis = opt.visitors || G.hereAsVis(here);
    const fresh = new Set(opt.visitors ? [] : G.VISITORS.map(([k]) => k).filter((k) => here[k] && !here[k].played));
    const placed = new Set();
    const VINFO = Object.fromEntries(G.VISITORS.map(([k, n, why, , mood]) => [k, { n, why, mood }]));
    const COATN = Object.fromEntries(G.COATS.map(([c, n]) => [c, n]));
    // v2.26: each visitor drawn by RV.critters at its garden size; it arrives in its own way the first time each day
    const VSIZE = { hum: 40, rabbit: 46, fox: 58, bluebird: 40, squirrel: 44, frog: 40, owl: 54, deer: 66, ladybug: 26, snake: 54, snail: 32, robin: 42, geese: 70, bees: 44, quail: 62 };
    const ARRIVE = { hum: 'fly', bluebird: 'fly', owl: 'fly', rabbit: 'hop', squirrel: 'hop', frog: 'hop', fox: 'trot', deer: 'trot', ladybug: 'crawl', snake: 'crawl', snail: 'crawl', robin: 'hop', geese: 'fly', bees: 'fly', quail: 'trot' };
    const visEl = (k, style, where) => {
      const kind = G.visitorKey(vis, k), name = COATN[kind] || VINFO[k].n;
      const rest = G.resting(k, now);
      const el = h('span', { class: 'gvis gv-' + k + (fresh.has(k) ? ' waiting' : ''), style, role: 'button', tabindex: '0', 'aria-label': 'Visitor: ' + name + (rest ? ', resting' : '') });
      el.appendChild(RV.critters.make(kind, { size: VSIZE[k], still: rest, cls: rest ? 'asleep' : '' }));
      el.dataset.v = k; placed.add(k);
      const show = (e) => {
        e.stopPropagation();
        if (selEl === el) return unpick();
        if (selEl) selEl.classList.remove('sel');
        selEl = el;
        card.replaceChildren(h('div', { class: 'gct' }, h('span', { class: 'gvk' }, COATN[kind] ? 'Rare coat' : VINFO[k].mood), h('b', null, name + (where ? ' in ' + where : '')), h('span', null, VINFO[k].why)),
          h('a', { class: 'btn sm', href: '#/insights/visitors/' + kind }, 'See'), closeBtn());
        card.hidden = false; y0 = root.scrollY;
      };
      el.addEventListener('click', show);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(e); } });
      return el;
    };
    let seed = 0, flies = 0, birds = 0, hums = 0, rabbits = 0, bi = 0;
    const ROW = 58; // depth between rows of a bed (v2.36: bigger plants)
    const beds = plots.map((p) => {
      // fit the bed to the screen: up to 4 plants a row, a little closer together on narrow phones
      const avail = Math.min(root.innerWidth || 390, 640) - 24 - 20 - 4;
      // three a row on phones (four on wider screens), spaced so each plant reads on its own
      const PER = avail >= 380 ? 4 : 3, SP = Math.max(72, Math.min(104, Math.floor((avail - 12) / (PER + 0.5))));
      // tallest forms in the back rows, so nothing hides behind a tree; same height: thirstiest first
      p.plants = p.plants.slice().sort((a, b) => b.st.form - a.st.form || a.st.care - b.st.care || U.cmp(a.it.rv.name, b.it.rv.name));
      const cols = Math.min(p.plants.length, PER);
      const rows = Math.ceil(p.plants.length / PER);
      const bed = h('div', { class: 'gbed', style: { width: (cols * SP + 12 + (rows > 1 ? SP / 2 : 0)) + 'px', height: (rows * ROW + 4) + 'px' } });
      p.plants.forEach((x, i) => {
        const r = Math.floor(i / PER), c = i % PER;
        const el = SC.plantOf(x.st, 'xl', { seed: seed++, bare: true });
        el.classList.add('gp');
        el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.removeAttribute('aria-hidden');
        el.setAttribute('aria-label', x.it.rv.name + ', ' + (x.st.word || L.shownName(S.settings, x.it.rv.stage)));
        const left = 6 + c * SP + (r % 2 ? SP / 2 : 0) - 10, top = r * ROW - 102;
        el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.zIndex = String(10 + r);
        el.addEventListener('click', () => pick(el, x));
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(el, x); } });
        bed.appendChild(el);
        if (x.st.care === G.CARE.LUSH && flies < 6) bed.appendChild(svgEl(FLY, 'gfly', 'left:' + (left + 72) + 'px;top:' + (top + 24) + 'px;animation-delay:' + (-flies++ * 1.7) + 's'));
        if (x.st.form === 5 && x.st.care >= G.CARE.HEALTHY && birds < 2) { birds++; bed.appendChild(svgEl(BIRD, 'gbird', 'left:' + (left + 26) + 'px;top:' + (top + 12) + 'px')); }
        // a hummingbird, now and then, by a flowering shrub that is doing well
        if (vis.hum === x.it.rv.id && !hums) { hums++; bed.appendChild(visEl('hum', 'left:' + (left + 62) + 'px;top:' + (top + 14) + 'px')); }
        // a squirrel by the plant that grew today; a ladybug on a lush plant
        if (vis.squirrel === x.it.rv.id) bed.appendChild(visEl('squirrel', 'left:' + (left - 16) + 'px;top:' + (top + 76) + 'px'));
        if (vis.ladybug === x.it.rv.id) bed.appendChild(visEl('ladybug', 'left:' + (left + 42) + 'px;top:' + (top + 58) + 'px'));
        // v2.28: a snail low on the stem of someone kept up for months; a snake on a stone at the bed's left end
        if (vis.snail === x.it.rv.id) bed.appendChild(visEl('snail', 'left:' + (left + 12) + 'px;top:' + (top + 92) + 'px'));
        if (vis.snake === x.it.rv.id && !placed.has('snake')) bed.appendChild(visEl('snake', 'left:-30px;top:2px'));
      });
      const due = p.wilting + p.thirsty;
      // a rabbit, sometimes, at the front of a bed where nobody is thirsty
      if (vis.bees && vis.bees === p.name && !placed.has('bees')) bed.appendChild(visEl('bees', 'left:34%;top:-64px', p.name));
      if (vis.rabbit && vis.rabbit === p.name && !rabbits) { rabbits++; bed.appendChild(visEl('rabbit', 'right:' + (rows > 1 ? 4 : -22) + 'px;bottom:2px', p.name)); }
      // the first bed: a bluebird on its lip, a frog at its foot
      if (bi++ === 0) {
        if (vis.bluebird) bed.appendChild(visEl('bluebird', 'right:10px;top:-30px'));
        if (vis.frog) bed.appendChild(visEl('frog', 'left:-12px;bottom:-14px'));
        if (vis.robin) bed.appendChild(visEl('robin', 'left:40%;bottom:-44px'));
        if (vis.quail) bed.appendChild(visEl('quail', 'right:2%;bottom:-52px'));
      }
      return h('div', { class: 'gplot' + (cols <= 2 ? ' small' : '') },
        bed,
        h('a', { class: 'gsign', href: '#/insights/plot/' + areaKey(p.name) }, h('i', { class: due ? 'due' : '' }), p.name || 'No area'));
    });
    // a visitor whose plant or area is gone waits by the first bed
    const firstBed = beds.length ? beds[0].firstChild : null;
    if (firstBed) {
      if (vis.hum && !placed.has('hum')) firstBed.appendChild(visEl('hum', 'left:40%;top:-70px'));
      if (vis.squirrel && !placed.has('squirrel')) firstBed.appendChild(visEl('squirrel', 'left:24%;bottom:6px'));
      if (vis.ladybug && !placed.has('ladybug')) firstBed.appendChild(visEl('ladybug', 'left:60%;bottom:14px'));
      if (vis.rabbit && !placed.has('rabbit')) firstBed.appendChild(visEl('rabbit', 'right:-22px;bottom:2px'));
      if (vis.snake && !placed.has('snake')) firstBed.appendChild(visEl('snake', 'left:-30px;top:2px'));
      if (vis.snail && !placed.has('snail')) firstBed.appendChild(visEl('snail', 'left:70%;bottom:10px'));
      if (vis.bees && !placed.has('bees')) firstBed.appendChild(visEl('bees', 'left:34%;top:-64px'));
    }
    const season = opt.season || G.seasonOf(now);
    const scene = h('section', { class: 'gscene', 'data-t': t, 'data-season': season, 'aria-label': 'Your garden' },
      svgEl(skySvg(t)),
      h('div', { class: 'gground' }, tufts(season),
        // bunting over the path while a campaign is running; a fox at dusk after a week with the ring closed
        opt.campaign ? svgEl('<svg class="gbunt" aria-hidden="true" viewBox="0 0 200 24" preserveAspectRatio="none"><path d="M0 4 Q100 22 200 4" class="bl"/>' +
          Array.from({ length: 11 }, (_, i) => { const x = 10 + i * 18, y = 4 + 18 * (1 - Math.pow((x - 100) / 100, 2)) * 0.5; return '<path d="M' + (x - 5) + ' ' + y.toFixed(1) + ' L' + (x + 5) + ' ' + y.toFixed(1) + ' L' + x + ' ' + (y + 10).toFixed(1) + ' Z" class="b' + (i % 3) + '"/>'; }).join('') + '</svg>') : null,
        vis.fox ? visEl('fox', 'right:12%;top:-50px') : null,
        vis.deer ? visEl('deer', 'left:10%;top:-58px') : null,
        vis.owl ? visEl('owl', 'left:44%;top:-62px') : null,
        vis.geese ? visEl('geese', 'left:22%;top:-128px') : null, stonePath(), edgeShrubs(t), fireflies(t), gateObjects(opt), h('div', { class: 'gbeds' }, beds), exhibitSquare(earned || {}, opt.sets, footObjects(opt, earned || {}))),
      card, seasonFall(season),
      // v2.25: a light rain over the beds when today's tending is all done (once a day)
      opt.rain ? h('div', { class: 'grain', 'aria-hidden': 'true' }, Array.from({ length: 28 }, (_, i) => h('i', { style: { left: ((i * 37) % 100) + '%', animationDelay: (-(i * 0.23) % 1.4).toFixed(2) + 's', animationDuration: (0.9 + (i % 5) * 0.12).toFixed(2) + 's' } }))) : null);
    // v2.27: arrivals play when the visitor is on screen; the sighting is saved after the animation, so the redraw
    // that follows the save never cuts it short
    const waiting = Array.from(scene.querySelectorAll('.gvis.waiting'));
    const played = [];
    let saveT = null;
    const flush = () => { const ks = played.splice(0); if (!ks.length) return; ST.saveSettings((s) => { for (const k of ks) { G.markVisitorSeen(s, k, now); if (s.visitorsHere && s.visitorsHere[k]) s.visitorsHere[k] = Object.assign({}, s.visitorsHere[k], { played: true }); } }); };
    const arrive = (el) => {
      if (!el.classList.contains('waiting')) return;
      const k = el.dataset.v;
      el.classList.remove('waiting'); el.classList.add('arrive', ARRIVE[k]);
      played.push(k); clearTimeout(saveT); saveT = setTimeout(flush, 2200);
    };
    if (waiting.length) {
      if (root.IntersectionObserver) {
        const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); arrive(e.target); } }), { threshold: 0.6 });
        setTimeout(() => waiting.forEach((el) => io.observe(el)), 60);
      } else waiting.forEach(arrive);
    }
    // v2.27: "See it in your garden": scroll to the visitor, let it arrive, ring it, then open its card
    // the request survives redraws (a save redraws the garden) until the card has opened
    if (opt.focus) setTimeout(() => {
      const el = scene.querySelector('.gv-' + opt.focus);
      if (!scene.isConnected) return;
      if (!el) { focusReq = null; return; }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => {
        if (!el.isConnected) return;
        arrive(el); el.classList.add('spot');
        setTimeout(() => { if (!el.isConnected) return; el.click(); el.classList.remove('spot'); focusReq = null; }, 2200);
      }, 600);
    }, 120);
    // v2.24: the card closes on a tap anywhere else in the garden, or when the page scrolls
    scene.addEventListener('click', (e) => { if (!card.hidden && !e.target.closest('.gp, .gvis, .gcard')) unpick(); });
    let y0 = null;
    const onScroll = () => {
      if (!scene.isConnected) { root.removeEventListener('scroll', onScroll); return; }
      if (card.hidden) { y0 = null; return; }
      if (y0 == null) y0 = root.scrollY;
      else if (Math.abs(root.scrollY - y0) > 40) { y0 = null; unpick(); }
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return scene;
  }

  // ---------- the empty garden (v2.27): what it will be, with a few bubbles ----------
  function emptyGarden(now) {
    const t = G.skyOf(now);
    const bed = h('div', { class: 'gbed gempty', style: { width: '300px', height: '40px' } });
    [0, 1, 2].forEach((i) => {
      const el = P.make(1, 4, { size: 'lg', ghost: true, still: true, bare: true, seed: i });
      el.classList.add('gp'); el.style.left = (18 + i * 92) + 'px'; el.style.top = '-78px';
      bed.appendChild(el);
    });
    const bub = (cls, text) => h('div', { class: 'gbub ' + cls }, text);
    const season = G.seasonOf(now);
    return h('section', { class: 'gscene gscene-empty', 'data-t': t, 'data-season': season, 'aria-label': 'Your garden, empty for now' },
      svgEl(skySvg(t)), seasonFall(season),
      h('div', { class: 'gground' }, tufts(season),
        stonePath(),
        bub('b1', 'Everyone you add grows here as a plant.'),
        h('div', { class: 'gbeds' }, h('div', { class: 'gplot' }, bed)),
        bub('b2', 'Have conversations and it grows. Leave a plan and it thrives.'),
        bub('b3', 'Animals visit when you have been out in service.'),
        h('div', { class: 'gstart' }, h('button', { class: 'btn primary', type: 'button', onclick: () => RV.forms.quickAdd() }, icon('plus', 18), 'Add your first contact'))));
  }

  // ---------- exhibits: earned milestones stand in the garden as objects ----------
  const STONE = 'class="o1"', STONE2 = 'class="o2"', ACC = 'class="oa"', WATER = 'class="ow"';
  // One object per family (v2.23); tiers add a pot of flowers, a second pot, a sparkle, then a ring of blooms.
  const EXH_ART = {
    study: '<svg viewBox="0 0 30 64" aria-hidden="true"><rect x="13.5" y="22" width="3" height="40" rx="1.5" ' + STONE2 + '/><rect x="8" y="10" width="14" height="15" rx="4" ' + STONE + '/><rect x="11" y="13" width="8" height="9" rx="2" ' + ACC + '/><path d="M6 10 L15 3 L24 10 Z" ' + STONE2 + '/><rect x="9" y="60" width="12" height="3" rx="1.5" ' + STONE2 + '/></svg>',
    rv: '<svg viewBox="0 0 64 36" aria-hidden="true"><rect x="4" y="8" width="56" height="5" rx="2.5" ' + STONE2 + '/><rect x="4" y="17" width="56" height="6" rx="3" ' + STONE + '/><rect x="9" y="23" width="4" height="11" rx="2" ' + STONE2 + '/><rect x="51" y="23" width="4" height="11" rx="2" ' + STONE2 + '/></svg>',
    area: '<svg viewBox="0 0 60 56" aria-hidden="true"><path d="M8 38 H52 L48 52 H12 Z" ' + STONE + '/><rect x="6" y="34" width="48" height="6" rx="3" ' + STONE2 + '/><rect x="27" y="14" width="6" height="22" rx="3" ' + STONE2 + '/><path d="M18 18 C22 10 38 10 42 18" stroke-width="4" fill="none" stroke-linecap="round" class="o2s"/><g ' + WATER + '><circle cx="30" cy="8" r="3"/><circle cx="22" cy="24" r="2"/><circle cx="38" cy="24" r="2"/><circle cx="30" cy="30" r="2"/></g></svg>',
    revive: '<svg viewBox="0 0 50 50" aria-hidden="true"><ellipse cx="25" cy="14" rx="21" ry="6" ' + STONE + '/><ellipse cx="25" cy="13" rx="16" ry="3.6" ' + WATER + '/><path d="M20 18 H30 L28 44 H22 Z" ' + STONE2 + '/><rect x="14" y="44" width="22" height="5" rx="2.5" ' + STONE + '/><ellipse cx="34" cy="7" rx="4" ry="3" ' + ACC + '/><circle cx="37" cy="5" r="2" ' + ACC + '/></svg>',
    plan: '<svg viewBox="0 0 60 70" aria-hidden="true"><path d="M8 68 V30 C8 12 52 12 52 30 V68" stroke-width="5" fill="none" class="o2s"/><path d="M8 40 C4 36 4 30 8 28 M52 40 C56 36 56 30 52 28 M14 18 C10 14 12 10 16 12 M46 18 C50 14 48 10 44 12 M30 12 C28 8 32 6 32 10" stroke-width="3" fill="none" stroke-linecap="round" class="oas"/><g ' + ACC + '><circle cx="12" cy="24" r="3"/><circle cx="48" cy="24" r="3"/><circle cx="30" cy="11" r="3"/><circle cx="21" cy="14" r="2.5"/><circle cx="39" cy="14" r="2.5"/></g></svg>',
    streak: '<svg viewBox="0 0 50 50" aria-hidden="true"><rect x="19" y="20" width="12" height="26" rx="2" ' + STONE2 + '/><rect x="12" y="44" width="26" height="5" rx="2.5" ' + STONE + '/><ellipse cx="25" cy="18" rx="20" ry="7" ' + STONE + '/><path d="M25 18 L25 6 L33 18 Z" ' + ACC + '/></svg>',
    first: '<svg viewBox="0 0 64 50" aria-hidden="true"><rect x="4" y="8" width="7" height="42" rx="2" ' + STONE2 + '/><rect x="53" y="8" width="7" height="42" rx="2" ' + STONE2 + '/><path d="M11 18 H53 M11 40 H53" stroke-width="3" class="o2s"/><path d="M17 16 V46 M24 15 V46 M32 14 V46 M40 15 V46 M47 16 V46" stroke-width="3" stroke-linecap="round" class="o1s"/><circle cx="7.5" cy="7" r="4" ' + ACC + '/><circle cx="56.5" cy="7" r="4" ' + ACC + '/></svg>',
    round: '<svg viewBox="0 0 60 46" aria-hidden="true"><path d="M14 18 H42 L40 44 H16 Z" ' + STONE + '/><path d="M20 18 C20 6 36 6 36 18" stroke-width="4" fill="none" stroke-linecap="round" class="o2s"/><path d="M40 26 L54 14" stroke-width="4" stroke-linecap="round" class="o2s"/><rect x="50" y="9" width="8" height="5" rx="2" transform="rotate(-40 54 11)" ' + STONE2 + '/><g ' + WATER + '><circle cx="57" cy="20" r="1.6"/><circle cx="55" cy="25" r="1.4"/><circle cx="59" cy="26" r="1.2"/></g><rect x="14" y="26" width="28" height="4" ' + ACC + '/></svg>',
  };
  const POT = '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M3 11 H13 L11.5 19 H4.5 Z" class="o2"/><path d="M8 11 V6" stroke-width="1.4" class="oas"/><g class="oa"><circle cx="8" cy="3.6" r="2.4"/><circle cx="4.6" cy="6.4" r="2"/><circle cx="11.4" cy="6.4" r="2"/></g></svg>';
  const SPARK = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0 L8.4 5.6 14 7 8.4 8.4 7 14 5.6 8.4 0 7 5.6 5.6Z" class="oa"/></svg>';
  function exhibitObj(fam, name, locked, tier) {
    const d = h('div', { class: 'gobj o-' + fam + (locked ? ' locked' : ''), role: 'img', 'aria-label': name + (locked ? ' (not yet)' : '') });
    d.innerHTML = EXH_ART[fam] || '';
    if (!tier || tier < 2) return d;
    const deco = (cls, art) => { const x = h('span', { class: cls, 'aria-hidden': 'true' }); x.innerHTML = art; return x; };
    return h('div', { class: 'gfam t' + tier },
      deco('gpot l', POT), d, tier >= 3 ? deco('gpot r', POT) : null,
      tier >= 4 ? deco('gspark', SPARK) : null,
      tier >= 5 ? h('span', { class: 'gbloom', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')) : null);
  }
  // the earned ones, standing together at the foot of the garden: one object per family at its highest tier
  // v2.29: what a completed visitor set leaves in the garden
  const SET_ART = {
    times: '<svg viewBox="0 0 40 70" aria-hidden="true"><rect x="18" y="30" width="4" height="40" rx="1.5" class="o2"/><path d="M8 14 L20 4 L32 14 Z" class="oa"/><rect x="10" y="13" width="20" height="20" rx="2" class="o1"/><circle cx="20" cy="22" r="4.4" class="o2"/><rect x="18.6" y="28" width="2.8" height="4" class="o2"/></svg>',
    birds: '<svg viewBox="0 0 50 70" aria-hidden="true"><rect x="8" y="10" width="4" height="60" rx="1.5" class="o2"/><rect x="8" y="10" width="28" height="3.4" rx="1.5" class="o2"/><path d="M33 13 v6" stroke-width="1.4" class="o2s"/><path d="M24 26 L33 19 L42 26 Z" class="oa"/><rect x="26" y="26" width="14" height="12" class="o1"/><rect x="23" y="38" width="20" height="3" rx="1.5" class="o2"/><circle cx="29" cy="37" r="1.2" class="ofr"/><circle cx="35" cy="37" r="1.2" class="ofr"/></svg>',
    ground: '<svg viewBox="0 0 60 40" aria-hidden="true"><rect x="6" y="24" width="48" height="12" rx="6" class="o2"/><rect x="12" y="13" width="40" height="12" rx="6" class="o2"/><circle cx="9" cy="30" r="6" class="o1"/><circle cx="15" cy="19" r="6" class="o1"/><circle cx="9" cy="30" r="2.6" class="o2"/><circle cx="15" cy="19" r="2.6" class="o2"/><path d="M40 12 C42 6 48 6 50 9" stroke-width="2" fill="none" class="oas"/></svg>',
    small: '<svg viewBox="0 0 70 30" aria-hidden="true"><ellipse cx="35" cy="17" rx="33" ry="12" class="o1"/><ellipse cx="35" cy="16" rx="27" ry="8.4" class="ow"/><path d="M48 16 a6 3.6 0 1 1 -0.1 0.4 L44 16 Z" class="oa"/><path d="M18 13 q4 -2 8 0" stroke-width="1.2" fill="none" class="o1s"/></svg>',
    seasons: '<svg viewBox="0 0 44 50" aria-hidden="true"><rect x="4" y="44" width="36" height="5" rx="2" class="o2"/><path d="M8 44 C6 22 14 8 22 8 C30 8 38 22 36 44 Z" class="o1"/><path d="M9 36 H35 M8 28 H36 M11 20 H33 M15 13 H29" stroke-width="1.6" class="o2s"/><path d="M19 44 a3 3.4 0 0 1 6 0 Z" class="o2"/></svg>',
    all: '<svg viewBox="0 0 64 50" aria-hidden="true"><rect x="29" y="22" width="5" height="28" rx="1.5" class="o2"/><rect x="3" y="5" width="58" height="20" rx="3" class="o1"/><text x="32" y="18.6" text-anchor="middle" class="osign">Wildlife garden</text></svg>',
  };
  function setObj(id, name, fresh) {
    const d = h('div', { class: 'gobj o-set-' + id + (fresh ? ' arrive' : ''), role: 'img', 'aria-label': name });
    d.innerHTML = SET_ART[id] || '';
    return d;
  }
  function exhibitSquare(earned, sets, extra) {
    const top = new Map();
    for (const [id, , name, fam, tier] of G.EXHIBITS) if (earned[id] && (!top.has(fam) || top.get(fam).tier < tier)) top.set(fam, { name, tier });
    const done = sets ? G.SETS.filter(([id]) => sets.done[id]).map(([id, n, , what]) => setObj(id, what + ' (' + n + ' set)', sets.fresh.includes(id))) : [];
    if (sets && sets.done.all) done.push(setObj('all', 'Wildlife garden sign', sets.fresh.includes('all')));
    if (!top.size && !done.length && !(extra && extra.length)) return null;
    return h('div', { class: 'gsquare' }, Array.from(top, ([fam, x]) => exhibitObj(fam, x.name, false, x.tier)), done, extra || null);
  }
  // v2.25: Milestones (formerly Exhibits)
  function exhibitSheet(earned) {
    UI.sheet('Milestones', (close) => h('div', null,
      h('div', { class: 'exgrid' }, G.EXHIBITS.map(([id, , name, fam]) => h('div', { class: 'exitem' + (earned[id] ? '' : ' locked') },
        exhibitObj(fam, name, !earned[id]),
        h('b', null, name),
        h('span', null, earned[id] ? U.fmtDate(new Date(earned[id])) : 'Not yet')))),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
  }
  // ---------- visitors page (v2.26): found ones in colour, the rest as outlines; tap for the portrait ----------
  const SCENES = {
    day: { sky: '#24474D', hill: '#2F5A5E', ground: '#3B6B5A', shadow: '#2F5A4B' },
    dusk: { sky: '#4A3530', hill: '#5A4038', ground: '#5A4A3E', shadow: '#4A3C32' },
    night: { sky: '#1C1F2E', hill: '#262A3D', ground: '#34394D', shadow: '#2A2E40', stars: true },
    dawn: { sky: '#B98235', hill: '#9E6E2E', ground: '#6E7A4A', shadow: '#5D683D' },
  };
  const seenLine = (o) => !o ? '' : (o.days || 1) > 1 ? 'Seen on ' + o.days + ' days' : 'Seen once';
  function visitorsScreen() {
    const seen = S.settings.visitors || {};
    const card = (kind, name) => {
      const o = seen[kind], got = !!(o && o.first);
      return h('a', { class: 'vcard' + (got ? '' : ' unfound'), href: '#/insights/visitors/' + kind, 'aria-label': got ? name : 'Not found yet' },
        RV.critters.make(kind, { size: 72, sil: !got }), got ? h('b', null, name) : null, got ? h('span', null, seenLine(o)) : null);
    };
    const found = G.VISITORS.filter(([k]) => seen[k] && seen[k].first).length, coats = G.COATS.filter(([c]) => seen[c] && seen[c].first).length;
    const name = Object.fromEntries(G.VISITORS.map(([k, n]) => [k, n]));
    const comp = G.setsComplete(S.settings);
    // v2.29: grouped by set, each with how many are found and what completing it leaves in the garden
    return {
      title: 'Visitors', back: '#/insights',
      el: h('div', { class: 'vpage' },
        h('p', { class: 'vsum' }, found + ' of ' + G.VISITORS.length + ' found · ' + coats + ' of ' + G.COATS.length + ' rare coats'),
        comp.all ? h('div', { class: 'vstamp' }, svgEl('<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" class="vs1"/><circle cx="20" cy="20" r="13" class="vs2"/><path d="M13 21 L18 26 L28 15" class="vs3"/></svg>'), h('div', null, h('b', null, 'Field guide complete'), h('span', null, 'Every visitor found'))) : null,
        G.SETS.map(([id, title, ks, what]) => {
          const n = ks.filter((k) => seen[k] && seen[k].first).length;
          return h('section', { class: 'vset' + (comp[id] ? ' done' : '') },
            h('div', { class: 'vsethead' }, h('h2', { class: 'vhead' }, title), h('span', { class: 'vsetn' }, comp[id] ? what + ' in your garden' : n + ' of ' + ks.length)),
            h('div', { class: 'vgrid' }, ks.map((k) => card(k, name[k]))));
        }),
        h('section', { class: 'vset' }, h('div', { class: 'vsethead' }, h('h2', { class: 'vhead' }, 'Rare coats'), h('span', { class: 'vsetn' }, coats + ' of ' + G.COATS.length)),
          h('div', { class: 'vgrid' }, G.COATS.map(([c, n]) => card(c, n))))),
    };
  }
  function visitorScreen(kind) {
    const seen = S.settings.visitors || {}, o = seen[kind], got = !!(o && o.first);
    const coat = G.COATS.find(([c]) => c === kind), base = coat ? coat[2] : kind;
    const v = G.VISITORS.find(([k]) => k === base);
    if (!v) return { title: 'Visitors', back: '#/insights/visitors', el: UI.emptyState('alert', 'No such visitor.') };
    const [, name, why, hint, mood, scene] = v;
    const sc = SCENES[scene] || SCENES.day;
    const stage = h('div', { class: 'vstage', style: { background: sc.sky } });
    stage.innerHTML = (sc.stars ? '<svg class="vstars" viewBox="0 0 390 430" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="#F2F0F5"><circle cx="48" cy="60" r="1.6"/><circle cx="120" cy="34" r="1.2"/><circle cx="300" cy="52" r="1.6"/><circle cx="350" cy="110" r="1.1"/><circle cx="210" cy="80" r="1.3"/><circle cx="80" cy="140" r="1"/></g></svg>' : '') +
      '<svg class="vland" viewBox="0 0 390 430" preserveAspectRatio="none" aria-hidden="true"><path d="M0 300 C80 270 150 280 210 292 C280 306 330 286 390 276 L390 430 L0 430 Z" fill="' + sc.hill + '"/><path d="M0 340 C90 324 170 330 240 338 C300 344 350 336 390 330 L390 430 L0 430 Z" fill="' + sc.ground + '"/><ellipse cx="195" cy="388" rx="92" ry="12" fill="' + sc.shadow + '"/></svg>';
    const big = RV.critters.make(kind, { size: 250, sil: !got }); big.classList.add('vbig');
    stage.appendChild(big);
    const title = got ? (coat ? coat[1] : name) : 'Not found yet';
    return {
      title: got ? title : 'Visitor', back: '#/insights/visitors', titleWatch: '.vinfo h1',
      el: h('div', { class: 'vdetail' }, stage,
        h('div', { class: 'vinfo' },
          coat ? h('span', { class: 'vcoat' }, 'Rare coat') : null,
          h('h1', null, title),
          got ? h('div', { class: 'vmood' }, mood) : null,
          got ? h('div', { class: 'vsub' }, 'First seen ' + U.fmtDate(new Date(o.first)) + ' · ' + seenLine(o)) : null,
          h('section', { class: 'vwhy' }, h('div', { class: 'vk' }, got ? 'Why it came' : 'How to find it'),
            h('div', null, got ? (coat ? 'About 1 ' + name.toLowerCase() + ' sighting in 20.' : why) : (coat ? 'Sometimes comes instead of the ' + name.toLowerCase() + '.' : hint))))),
    };
  }
  // the two collection tiles under the garden
  function collectTiles(earned, close) {
    const n = G.EXHIBITS.filter(([id]) => earned[id]).length;
    const seen = S.settings.visitors || {}, v = G.VISITORS.filter(([k]) => seen[k] && seen[k].first).length;
    const tile = (cls, title, count, art, on) => {
      const a = h('div', { class: 'ctart', 'aria-hidden': 'true' }); a.innerHTML = art;
      return h('button', { class: 'ctile ' + cls, type: 'button', onclick: on }, a, h('b', null, title), h('span', null, count));
    };
    return h('div', { class: 'ctiles' },
      tile('ms', 'Milestones', n + ' of ' + G.EXHIBITS.length, EXH_ART.rv, () => { if (close) close(); exhibitSheet(earned); }),
      tile('vs', 'Visitors', v + ' of ' + G.VISITORS.length, RV.critters.html('fox', { size: 40, still: true }), () => { if (close) close(); location.hash = '#/insights/visitors'; }));
  }
  // the nearest milestones, with how close they are
  function nextCard(items, earned, sk, now) {
    const c = G.milestoneCounts(items, S.settings, now, S.settings.gardenSince, sk.best);
    const next = G.nextMilestones(c, earned, 3);
    if (!next.length) return null;
    return h('section', { class: 'icard nextm' }, h('h2', null, 'Next milestones'),
      next.map((m) => h('div', { class: 'nm' }, exhibitObj(m.fam, m.name, true),
        h('div', { class: 'nmt' }, h('b', null, m.name),
          m.need > 1 ? h('span', { class: 'mbar' }, h('i', { class: 'on', style: { width: Math.round((m.have / m.need) * 100) + '%' } })) : null,
          h('span', { class: 'muted small' }, m.need > 1 ? m.have + ' of ' + m.need : m.fam === 'area' ? 'An area with 3 or more plants, none thirsty' : 'Not yet')))));
  }
  // today's three small goals
  function tendCard(t) {
    return h('section', { class: 'icard tend' + (t.all ? ' all' : '') },
      h('div', { class: 'ih' }, h('h2', null, "Today's tending"), t.all ? h('span', { class: 'acc small' }, 'All done') : null),
      t.goals.map((g) => {
        const row = h(g.rvId ? 'a' : 'div', { class: 'tg' + (g.done ? ' done' : ''), href: g.rvId ? '#/rv/' + g.rvId : null },
          h('span', { class: 'tck', 'aria-hidden': 'true' }, g.done ? icon('check', 14) : null),
          h('div', { class: 'tgt' }, h('span', null, g.label),
            g.need > 1 ? h('span', { class: 'tgb' }, Array.from({ length: g.need }, (_, i) => h('i', { class: i < g.have ? 'on' : '' }))) : null),
          g.need > 1 ? h('span', { class: 'muted small' }, g.have + '/' + g.need) : null);
        row.setAttribute('aria-label', g.label + (g.done ? ', done' : ', ' + g.have + ' of ' + g.need));
        return row;
      }));
  }
  // How the garden works: one screen, mostly pictures.
  function guideSheet() {
    const pl = (f, c, label, sub) => h('div', { class: 'gdp' }, P.make(f, c, { size: 'sm', still: true, vid: 'guide' }), h('b', null, label), sub ? h('span', null, sub) : null);
    const line = (ic, text) => h('div', { class: 'gdl' }, h('span', { class: 'gdi' }, icon(ic, 18)), h('span', null, text));
    UI.sheet('How your garden works', (close) => h('div', { class: 'guide' },
      h('p', { class: 'gdlead' }, 'Everyone you visit is a plant. Your visits grow it.'),
      h('h3', null, 'It grows'),
      h('div', { class: 'gdrow' }, pl(1, 4, L.shownName(S.settings, (S.settings.stages.find((x) => !x.closed) || {}).id) || 'Potential'), pl(2, 4, 'Sprout'), pl(3, 4, 'Leafy'), pl(4, 4, 'Shrub'), pl(5, 4, 'Study')),
      h('p', { class: 'muted small' }, 'Each conversation grows it. Keep them less than a month apart. A study grows a tree.'),
      h('h3', null, 'It shows how it is doing'),
      h('div', { class: 'gdrow four' }, pl(3, 5, 'Lush'), pl(3, 4, 'Healthy'), pl(3, 2, 'Thirsty'), pl(3, 1, 'Wilting')),
      line('sparkle', 'Leave a plan (Discuss next time) on each visit and it grows lush.'),
      line('clock', 'It goes thirsty when a visit is due. A conversation revives it; a knock keeps it from wilting.'),
      line('check', 'Nothing ever dies, and nothing you have grown is lost.'),
      h('h3', null, 'Your week and your garden'),
      line('calendar', 'Visit or knock on everyone who comes due each week to keep your streak.'),
      line('flag', 'Milestones stand in your garden as you reach them.'),
      line('sun', 'Rare visitors come when you have been out. Tap one to learn why it came.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Got it'))));
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

  let focusReq = null; // "See it in your garden": the visitor to go to
  function garden(focus) {
    const items = ST.items();
    const now = new Date();
    // v2.27: settle who is staying (new arrivals, leavers) before drawing
    const settled = G.settleVisitors(items, S.settings, now);
    if (settled.changed) setTimeout(() => ST.saveSettings((s) => { s.visitorsHere = G.settleVisitors(ST.items(), s, new Date()).here; }), 0);
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
    const tend = G.tending(items, S.settings, now);
    // v2.29: completed visitor sets, dated once and kept
    const setsDone = Object.assign({}, S.settings.setsDone || {}), comp = G.setsComplete(S.settings);
    const freshSets = Object.keys(comp).filter((id) => comp[id] && !setsDone[id]);
    if (freshSets.length) { const at = U.nowISO(); freshSets.forEach((id) => { setsDone[id] = at; }); setTimeout(() => ST.saveSettings((s) => { s.setsDone = Object.assign({}, s.setsDone || {}, setsDone); }), 0); }
    const opt = Object.assign({ campaign: !!ST.activeCampaign(now), rain: tend.all && S.settings.tendDone !== U.toDateStr(now), here: settled.here, focus, sets: { done: setsDone, fresh: freshSets }, sk, tend, items, now }, root.__RV_GARDEN_OPT || {}); // the hook is for tests
    if (opt.rain && !(root.__RV_GARDEN_OPT && root.__RV_GARDEN_OPT.rain)) setTimeout(() => ST.saveSettings((s) => { s.tendDone = U.toDateStr(now); }), 3200);
    // v2.25: the game first (how it works, this week, today, next, collections); field stats folded at the foot
    const stats = h('details', { class: 'fstats' }, h('summary', null, icon('down', 18), 'Field stats'), goingCard(items, now), keep);
    // v2.29: Getting started: seeing the garden is a step; its card replaces Today's tending until done
    const starter = G.starterOn(S.settings);
    if (starter && !(S.settings.starter || {}).garden) setTimeout(() => ST.saveSettings((s) => { s.starter = Object.assign({}, s.starter, { garden: true }); }), 0);
    const gardenTip = SC.coach('garden', 'Each plant is someone you visit. Tap the watering can, the slate, the bunting or the signpost by the gate to see how you are doing.');
    // v2.27: nobody yet: an empty garden that explains itself
    if (!plots.length) return { title: 'My garden', immersive: G.skyOf(now), el: h('div', null, emptyGarden(now), h('button', { class: 'howbtn', type: 'button', onclick: guideSheet }, icon('help', 16), 'How your garden works'), gardenTip, starter ? SC.starterCard() : null) };
    // v2.38: the weekly ring, streak, tending, next milestones and collections are objects in the scene now
    return { title: 'My garden', immersive: G.skyOf(now), el: h('div', null,
      gardenScene(plots, now, earned, opt), gardenTip,
      starter ? SC.starterCard() : null, stats) };
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
    if (!SC.gardenOn() || document.querySelector('.overlay, .grow-ov, .recap')) return false;
    const now = new Date();
    const r = G.recap(ST.items(), S.settings, now, S.settings.gardenSince, S.settings.recapSeen);
    if (!r) return false;
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
        r.revived ? h('section', { class: 'rcard pop', style: { animationDelay: '.1s' } }, h('div', { class: 'n acc' }, String(r.revived)),
          h('div', null, h('b', null, 'Revived'), h('div', { class: 'muted' }, (r.revived === 1 ? 'A plant' : 'Plants') + ' brought back from thirsty.'))) : null,
        r.grew.length ? h('section', { class: 'rcard col pop', style: { animationDelay: '.15s' } }, h('h2', null, 'Grew'),
          r.grew.slice(0, 4).map((g) => h('div', { class: 'rgrew' },
            h('div', { class: 'pair' }, mk(g.from, 4, g.rv.id), icon('right', 16), mk(g.to, 4, g.rv.id)),
            h('div', null, h('b', null, g.rv.name), h('div', { class: 'acc' }, G.growthName(S.settings, g.from, g.to))))),
          r.grew.length > 4 ? h('div', { class: 'muted small' }, '+' + (r.grew.length - 4) + ' more') : null) : null,
        h('div', { class: 'rtwo' },
          h('section', { class: 'rcard col pop', style: { animationDelay: '.3s' } }, svgEl(FLY, 'rfly'), h('div', { class: 'n' }, String(r.lush)), h('div', { class: 'small' }, r.lush === 1 ? 'lush plant drew visitors' : 'lush plants drew visitors')),
          h('section', { class: 'rcard col pop', style: { animationDelay: '.45s' } }, h('div', { class: 'n acc', style: { paddingTop: '30px' } }, String(r.streak)), h('div', { class: 'small' }, (r.streak === 1 ? 'week' : 'weeks') + ', nobody past due'))),
        r.exhibits.length ? h('section', { class: 'rcard col pop new', style: { animationDelay: '.6s' } }, h('div', { class: 'acc small' }, 'New milestone'), r.exhibits.map((id) => h('b', null, names[id] || id))) : null,
        (r.sets || []).length ? h('section', { class: 'rcard col pop new', style: { animationDelay: '.7s' } }, h('div', { class: 'acc small' }, 'Set complete'),
          r.sets.map((id) => { const st = G.SETS.find(([x]) => x === id); return h('b', null, st ? st[1] + ': ' + st[3].toLowerCase() + ' in your garden' : 'Every visitor found'); })) : null,
        h('div', { class: 'grow1' }),
        h('div', { class: 'ract' },
          h('button', { class: 'btn', type: 'button', onclick: close }, 'Close'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => { close(); location.hash = '#/insights'; } }, 'See the garden'))));
    document.body.appendChild(ov);
    return true;
  }

  // ---------- round recap (v2.22) ----------
  // After a stretch of field service (three or more logs, each within 90 minutes of the last), shown once
  // the next time the app is opened or returned to at least 30 minutes after the last log.
  function maybeRound(force) {
    if (!SC.gardenOn() || document.querySelector('.overlay, .grow-ov, .recap')) return false;
    const now = new Date();
    const r = G.round(ST.items(), S.settings, now, S.settings.roundSeen, force);
    if (!r) return false;
    ST.saveSettings((s) => { s.roundSeen = r.key; });
    const close = () => ov.remove();
    const hm = (d) => { const x = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, '0'); return x + ':' + m; };
    const part = (d) => { const hr = d.getHours(); return hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening'; };
    const day = U.toDateStr(r.start) === U.toDateStr(now) ? 'This ' + part(r.start) : 'Yesterday ' + part(r.start);
    const mk = (stageId, care, vid) => P.make(G.formOf(S.settings, stageId), care, { size: 'sm', still: true, vid });
    const stat = (n, label) => h('div', { class: 'rst' }, h('div', { class: 'n' }, String(n)), h('div', { class: 'small' }, label));
    const talked = r.talked.slice(0, 8).map((it) => ({ it, st: G.forItem(it, S.settings, now) })).filter((x) => x.st.form);
    const ov = h('div', { class: 'recap', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your round' },
      h('div', { class: 'rin' },
        h('div', { class: 'rdate' }, day + ' · ' + (hm(r.start) === hm(r.end) ? hm(r.start) : hm(r.start) + '–' + hm(r.end))),
        h('h1', null, 'Your round'),
        h('section', { class: 'rcard pop rstats' }, stat(r.tried, r.tried === 1 ? 'door' : 'doors'), stat(r.talks, r.talks === 1 ? 'conversation' : 'conversations'), stat(r.plans, r.plans === 1 ? 'plan left' : 'plans left')),
        talked.length ? h('section', { class: 'rcard col pop', style: { animationDelay: '.15s' } }, h('h2', null, 'Conversations with'),
          h('div', { class: 'rppl' }, talked.map((x) => h('a', { href: '#/rv/' + x.it.rv.id, onclick: close },
            SC.plantOf(x.st, 'sm', { still: true }), h('span', null, x.it.rv.name.split(' ')[0]))))) : null,
        r.revived ? h('section', { class: 'rcard pop', style: { animationDelay: '.3s' } }, h('div', { class: 'n acc' }, String(r.revived)),
          h('div', null, h('b', null, 'Revived'), h('div', { class: 'muted' }, (r.revived === 1 ? 'A plant' : 'Plants') + ' brought back from thirsty.'))) : null,
        r.grew.length ? h('section', { class: 'rcard col pop', style: { animationDelay: '.45s' } }, h('h2', null, 'Grew'),
          r.grew.slice(0, 4).map((g) => h('div', { class: 'rgrew' },
            h('div', { class: 'pair' }, mk(g.from, 4, g.rv.id), icon('right', 16), mk(g.to, 4, g.rv.id)),
            h('div', null, h('b', null, g.rv.name), h('div', { class: 'acc' }, G.growthName(S.settings, g.from, g.to)))))) : null,
        r.added ? h('section', { class: 'rcard pop', style: { animationDelay: '.6s' } }, h('div', { class: 'n acc' }, String(r.added)),
          h('div', null, h('b', null, r.added === 1 ? 'New contact' : 'New contacts'))) : null,
        h('div', { class: 'grow1' }),
        h('div', { class: 'ract' }, h('button', { class: 'btn primary', type: 'button', onclick: close }, 'Close'))));
    document.body.appendChild(ov);
    return true;
  }
  // ---------- a visitor arrives (v2.27) ----------
  // The first time the app is opened or returned to after a visitor arrives: a short full-screen moment, the animal
  // coming in on its own scene, with its name and mood. Counts as seen. "See it in your garden" goes to it.
  const ARRIVE_BIG = { hum: 'fly', bluebird: 'fly', owl: 'fly', rabbit: 'hop', squirrel: 'hop', frog: 'hop', fox: 'trot', deer: 'trot', ladybug: 'crawl', snake: 'crawl', snail: 'crawl', robin: 'hop', geese: 'fly', bees: 'fly', quail: 'trot' };
  function maybeVisitor() {
    if (!SC.gardenOn() || document.querySelector('.overlay, .grow-ov, .recap, .vann')) return false;
    const now = new Date();
    const st = G.settleVisitors(ST.items(), S.settings, now);
    const k = G.VISITORS.map(([x]) => x).find((x) => st.here[x] && !st.here[x].told && !st.here[x].seen);
    if (!st.changed && !k) return false;
    ST.saveSettings((s) => {
      s.visitorsHere = st.here;
      if (k) { G.markVisitorSeen(s, k, now); s.visitorsHere[k] = Object.assign({}, s.visitorsHere[k], { told: true }); }
    });
    if (!k) return false;
    const e = st.here[k], v = G.VISITORS.find(([x]) => x === k), coat = G.COATS.find(([c]) => c === e.kind);
    arrivalMoment(k, e.kind, coat ? 'A rare visitor' : 'A visitor', coat ? coat[1] : v[1], v[4]);
    return true;
  }
  // The full-screen arrival: the animal comes in on its own scene, a kicker, a title and a quiet line.
  function arrivalMoment(k, kind, kicker, title, line) {
    const v = G.VISITORS.find(([x]) => x === k);
    const e = { kind };
    const coat = null;
    const sc = SCENES[v[5]] || SCENES.day;
    const stage = h('div', { class: 'vstage', style: { background: sc.sky } });
    stage.innerHTML = (sc.stars ? '<svg class="vstars" viewBox="0 0 390 430" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="#F2F0F5"><circle cx="48" cy="60" r="1.6"/><circle cx="120" cy="34" r="1.2"/><circle cx="300" cy="52" r="1.6"/><circle cx="350" cy="110" r="1.1"/><circle cx="210" cy="80" r="1.3"/><circle cx="80" cy="140" r="1"/></g></svg>' : '') +
      '<svg class="vland" viewBox="0 0 390 430" preserveAspectRatio="none" aria-hidden="true"><path d="M0 300 C80 270 150 280 210 292 C280 306 330 286 390 276 L390 430 L0 430 Z" fill="' + sc.hill + '"/><path d="M0 340 C90 324 170 330 240 338 C300 344 350 336 390 330 L390 430 L0 430 Z" fill="' + sc.ground + '"/><ellipse cx="195" cy="388" rx="92" ry="12" fill="' + sc.shadow + '"/></svg>';
    const big = h('div', { class: 'vbigw arrive ' + ARRIVE_BIG[k] }, RV.critters.make(e.kind, { size: 240 }));
    stage.appendChild(big);
    const close = () => ov.remove();
    const ov = h('div', { class: 'vann', role: 'dialog', 'aria-modal': 'true', 'aria-label': kicker + ': ' + title },
      h('div', { class: 'vann-in' }, stage,
        h('div', { class: 'vinfo' },
          h('div', { class: 'vk' }, kicker),
          h('h1', null, title),
          h('div', { class: 'vmood' }, line)),
        h('div', { class: 'grow1' }),
        h('div', { class: 'ract' },
          h('button', { class: 'btn', type: 'button', onclick: close }, 'Later'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => { close(); location.hash = '#/insights/focus/' + k; } }, 'See it in your garden'))));
    document.body.appendChild(ov);
    try { if (navigator.vibrate) navigator.vibrate(20); } catch (err) { /* ignore */ }
  }
  // v2.29: all five Getting started steps done: "Your garden is ready", and a bluebird comes to see it
  function maybeStarterDone() {
    if (!SC.gardenOn() || !G.starterOn(S.settings) || document.querySelector('.overlay, .grow-ov, .recap, .vann')) return false;
    const r = G.starterSteps(ST.items(), S.settings, !!(RV.drive && RV.drive.status().connected));
    if (!r.all) return false;
    const now = new Date(), day = U.toDateStr(now);
    ST.saveSettings((s) => {
      s.starter = Object.assign({}, s.starter, { state: 'done', at: now.toISOString() });
      s.visitorsHere = Object.assign({}, s.visitorsHere || {});
      s.visitorsHere.bluebird = { kind: 'bluebird', day, until: U.toDateStr(U.addDays(U.startOfDay(now), 1)), ref: null, seen: false, told: true, played: false };
      G.markVisitorSeen(s, 'bluebird', now);
    });
    arrivalMoment('bluebird', 'bluebird', 'Getting started', 'Your garden is ready', 'A bluebird came to see it.');
    return true;
  }
  RV.gardenRecap = { maybeShow: () => maybeStarterDone() || maybeRecap() || maybeRound() || maybeVisitor(), round: maybeRound, visitor: maybeVisitor, starterDone: maybeStarterDone };

  function insights(sub, key) {
    if (!SC.gardenOn()) return classic();
    if (sub === 'plot') return plotScreen(key || '-');
    if (sub === 'visitors') return key ? visitorScreen(key) : visitorsScreen();
    if (sub === 'focus') {
      focusReq = key;
      try { history.replaceState(null, '', '#/insights'); } catch (err) { /* ignore */ }
      return garden(key);
    }
    if (focusReq) return garden(focusReq);
    return garden();
  }
  RV.screens.insights = insights;
})(window);
