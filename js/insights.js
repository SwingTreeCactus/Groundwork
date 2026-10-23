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
      card.hidden = false;
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
    const VSIZE = { hum: 40, rabbit: 46, fox: 58, bluebird: 40, squirrel: 44, frog: 40, owl: 54, deer: 66, ladybug: 26 };
    const ARRIVE = { hum: 'fly', bluebird: 'fly', owl: 'fly', rabbit: 'hop', squirrel: 'hop', frog: 'hop', fox: 'trot', deer: 'trot', ladybug: 'crawl' };
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
        card.hidden = false;
      };
      el.addEventListener('click', show);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(e); } });
      return el;
    };
    let seed = 0, flies = 0, birds = 0, hums = 0, rabbits = 0, bi = 0;
    const ROW = 52; // depth between rows of a bed
    const beds = plots.map((p) => {
      // fit the bed to the screen: up to 4 plants a row, a little closer together on narrow phones
      const avail = Math.min(root.innerWidth || 390, 640) - 24 - 20 - 4;
      // three a row on phones (four on wider screens), spaced so each plant reads on its own
      const PER = avail >= 380 ? 4 : 3, SP = Math.max(64, Math.min(96, Math.floor((avail - 12) / (PER + 0.5))));
      // tallest forms in the back rows, so nothing hides behind a tree; same height: thirstiest first
      p.plants = p.plants.slice().sort((a, b) => b.st.form - a.st.form || a.st.care - b.st.care || U.cmp(a.it.rv.name, b.it.rv.name));
      const cols = Math.min(p.plants.length, PER);
      const rows = Math.ceil(p.plants.length / PER);
      const bed = h('div', { class: 'gbed', style: { width: (cols * SP + 12 + (rows > 1 ? SP / 2 : 0)) + 'px', height: (rows * ROW + 26) + 'px' } });
      p.plants.forEach((x, i) => {
        const r = Math.floor(i / PER), c = i % PER;
        const el = SC.plantOf(x.st, 'lg', { seed: seed++, bare: true });
        el.classList.add('gp');
        el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.removeAttribute('aria-hidden');
        el.setAttribute('aria-label', x.it.rv.name + ', ' + (x.st.word || L.shownName(S.settings, x.it.rv.stage)));
        const left = 6 + c * SP + (r % 2 ? SP / 2 : 0), top = r * ROW - 78;
        el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.zIndex = String(10 + r);
        el.addEventListener('click', () => pick(el, x));
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(el, x); } });
        bed.appendChild(el);
        if (x.st.care === G.CARE.LUSH && flies < 6) bed.appendChild(svgEl(FLY, 'gfly', 'left:' + (left + 56) + 'px;top:' + (top + 14) + 'px;animation-delay:' + (-flies++ * 1.7) + 's'));
        if (x.st.form === 5 && x.st.care >= G.CARE.HEALTHY && birds < 2) { birds++; bed.appendChild(svgEl(BIRD, 'gbird', 'left:' + (left + 18) + 'px;top:' + (top + 2) + 'px')); }
        // a hummingbird, now and then, by a flowering shrub that is doing well
        if (vis.hum === x.it.rv.id && !hums) { hums++; bed.appendChild(visEl('hum', 'left:' + (left + 46) + 'px;top:' + (top - 2) + 'px')); }
        // a squirrel by the plant that grew today; a ladybug on a lush plant
        if (vis.squirrel === x.it.rv.id) bed.appendChild(visEl('squirrel', 'left:' + (left - 22) + 'px;top:' + (top + 50) + 'px'));
        if (vis.ladybug === x.it.rv.id) bed.appendChild(visEl('ladybug', 'left:' + (left + 30) + 'px;top:' + (top + 34) + 'px'));
      });
      const due = p.wilting + p.thirsty;
      // a rabbit, sometimes, at the front of a bed where nobody is thirsty
      if (vis.rabbit && vis.rabbit === p.name && !rabbits) { rabbits++; bed.appendChild(visEl('rabbit', 'right:' + (rows > 1 ? 4 : -22) + 'px;bottom:2px', p.name)); }
      // the first bed: a bluebird on its lip, a frog at its foot
      if (bi++ === 0) {
        if (vis.bluebird) bed.appendChild(visEl('bluebird', 'right:10px;top:-30px'));
        if (vis.frog) bed.appendChild(visEl('frog', 'left:-12px;bottom:-14px'));
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
    }
    const scene = h('section', { class: 'gscene', 'data-t': t, 'aria-label': 'Your garden' },
      svgEl(skySvg(t)),
      h('div', { class: 'gground' }, tufts(),
        // bunting over the path while a campaign is running; a fox at dusk after a week with the ring closed
        opt.campaign ? svgEl('<svg class="gbunt" aria-hidden="true" viewBox="0 0 200 24" preserveAspectRatio="none"><path d="M0 4 Q100 22 200 4" class="bl"/>' +
          Array.from({ length: 11 }, (_, i) => { const x = 10 + i * 18, y = 4 + 18 * (1 - Math.pow((x - 100) / 100, 2)) * 0.5; return '<path d="M' + (x - 5) + ' ' + y.toFixed(1) + ' L' + (x + 5) + ' ' + y.toFixed(1) + ' L' + x + ' ' + (y + 10).toFixed(1) + ' Z" class="b' + (i % 3) + '"/>'; }).join('') + '</svg>') : null,
        vis.fox ? visEl('fox', 'right:12%;top:-50px') : null,
        vis.deer ? visEl('deer', 'left:10%;top:-58px') : null,
        vis.owl ? visEl('owl', 'left:44%;top:-62px') : null, svgEl('<svg class="gwalk" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M45 100 C45 80 30 70 55 55 C80 40 40 30 60 15 C70 7 80 3 82 0" /></svg>'), h('div', { class: 'gbeds' }, beds), exhibitSquare(earned || {})),
      card,
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
    const bed = h('div', { class: 'gbed gempty', style: { width: '300px', height: '86px' } });
    [0, 1, 2].forEach((i) => {
      const el = P.make(1, 4, { size: 'lg', ghost: true, still: true, bare: true, seed: i });
      el.classList.add('gp'); el.style.left = (18 + i * 92) + 'px'; el.style.top = '-78px';
      bed.appendChild(el);
    });
    const bub = (cls, text) => h('div', { class: 'gbub ' + cls }, text);
    return h('section', { class: 'gscene gscene-empty', 'data-t': t, 'aria-label': 'Your garden, empty for now' },
      svgEl(skySvg(t)),
      h('div', { class: 'gground' }, tufts(),
        svgEl('<svg class="gwalk" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M45 100 C45 80 30 70 55 55 C80 40 40 30 60 15 C70 7 80 3 82 0" /></svg>'),
        bub('b1', 'Everyone you add grows here as a plant.'),
        h('div', { class: 'gbeds' }, h('div', { class: 'gplot' }, bed)),
        bub('b2', 'Talk with them and it grows. Leave a plan and it thrives.'),
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
  function exhibitSquare(earned) {
    const top = new Map();
    for (const [id, , name, fam, tier] of G.EXHIBITS) if (earned[id] && (!top.has(fam) || top.get(fam).tier < tier)) top.set(fam, { name, tier });
    if (!top.size) return null;
    return h('div', { class: 'gsquare' }, Array.from(top, ([fam, x]) => exhibitObj(fam, x.name, false, x.tier)));
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
    dusk: { sky: '#3A2B45', hill: '#4A3858', ground: '#5A4A3E', shadow: '#4A3C32' },
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
    return {
      title: 'Visitors', back: '#/insights',
      el: h('div', { class: 'vpage' },
        h('p', { class: 'vsum' }, found + ' of ' + G.VISITORS.length + ' found · ' + coats + ' of ' + G.COATS.length + ' rare coats'),
        h('div', { class: 'vgrid' }, G.VISITORS.map(([k, n]) => card(k, n))),
        h('h2', { class: 'vhead' }, 'Rare coats'),
        h('div', { class: 'vgrid' }, G.COATS.map(([c, n]) => card(c, n)))),
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
  function collectTiles(earned) {
    const n = G.EXHIBITS.filter(([id]) => earned[id]).length;
    const seen = S.settings.visitors || {}, v = G.VISITORS.filter(([k]) => seen[k] && seen[k].first).length;
    const tile = (cls, title, count, art, on) => {
      const a = h('div', { class: 'ctart', 'aria-hidden': 'true' }); a.innerHTML = art;
      return h('button', { class: 'ctile ' + cls, type: 'button', onclick: on }, a, h('b', null, title), h('span', null, count));
    };
    return h('div', { class: 'ctiles' },
      tile('ms', 'Milestones', n + ' of ' + G.EXHIBITS.length, EXH_ART.rv, () => exhibitSheet(earned)),
      tile('vs', 'Visitors', v + ' of ' + G.VISITORS.length, RV.critters.html('fox', { size: 40, still: true }), () => { location.hash = '#/insights/visitors'; }));
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
      h('p', { class: 'muted small' }, 'Each talk grows it. Keep talks less than a month apart. A study grows a tree.'),
      h('h3', null, 'It shows how it is doing'),
      h('div', { class: 'gdrow four' }, pl(3, 5, 'Lush'), pl(3, 4, 'Healthy'), pl(3, 2, 'Thirsty'), pl(3, 1, 'Wilting')),
      line('sparkle', 'Leave a plan (Discuss next time) on each visit and it grows lush.'),
      line('clock', 'It goes thirsty when a visit is due. A talk revives it; a knock keeps it from wilting.'),
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
    const opt = Object.assign({ campaign: !!ST.activeCampaign(now), rain: tend.all && S.settings.tendDone !== U.toDateStr(now), here: settled.here, focus }, root.__RV_GARDEN_OPT || {}); // the hook is for tests
    if (opt.rain && !(root.__RV_GARDEN_OPT && root.__RV_GARDEN_OPT.rain)) setTimeout(() => ST.saveSettings((s) => { s.tendDone = U.toDateStr(now); }), 3200);
    // v2.25: the game first (how it works, this week, today, next, collections); field stats folded at the foot
    const stats = h('details', { class: 'fstats' }, h('summary', null, icon('down', 18), 'Field stats'), goingCard(items, now), keep);
    // v2.27: nobody yet: an empty garden that explains itself
    if (!plots.length) return { title: 'My garden', el: h('div', null, emptyGarden(now), h('button', { class: 'howbtn', type: 'button', onclick: guideSheet }, icon('help', 16), 'How your garden works')) };
    return { title: 'My garden', el: h('div', null,
      gardenScene(plots, now, earned, opt),
      h('button', { class: 'howbtn', type: 'button', onclick: guideSheet }, icon('help', 16), 'How your garden works'),
      ringCard(sk), tendCard(tend), nextCard(items, earned, sk, now), collectTiles(earned), stats) };
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
        h('section', { class: 'rcard pop rstats' }, stat(r.tried, r.tried === 1 ? 'door' : 'doors'), stat(r.talks, r.talks === 1 ? 'talk' : 'talks'), stat(r.plans, r.plans === 1 ? 'plan left' : 'plans left')),
        talked.length ? h('section', { class: 'rcard col pop', style: { animationDelay: '.15s' } }, h('h2', null, 'Talked with'),
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
  const ARRIVE_BIG = { hum: 'fly', bluebird: 'fly', owl: 'fly', rabbit: 'hop', squirrel: 'hop', frog: 'hop', fox: 'trot', deer: 'trot', ladybug: 'crawl' };
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
    const sc = SCENES[v[5]] || SCENES.day;
    const stage = h('div', { class: 'vstage', style: { background: sc.sky } });
    stage.innerHTML = (sc.stars ? '<svg class="vstars" viewBox="0 0 390 430" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="#F2F0F5"><circle cx="48" cy="60" r="1.6"/><circle cx="120" cy="34" r="1.2"/><circle cx="300" cy="52" r="1.6"/><circle cx="350" cy="110" r="1.1"/><circle cx="210" cy="80" r="1.3"/><circle cx="80" cy="140" r="1"/></g></svg>' : '') +
      '<svg class="vland" viewBox="0 0 390 430" preserveAspectRatio="none" aria-hidden="true"><path d="M0 300 C80 270 150 280 210 292 C280 306 330 286 390 276 L390 430 L0 430 Z" fill="' + sc.hill + '"/><path d="M0 340 C90 324 170 330 240 338 C300 344 350 336 390 330 L390 430 L0 430 Z" fill="' + sc.ground + '"/><ellipse cx="195" cy="388" rx="92" ry="12" fill="' + sc.shadow + '"/></svg>';
    const big = h('div', { class: 'vbigw arrive ' + ARRIVE_BIG[k] }, RV.critters.make(e.kind, { size: 240 }));
    stage.appendChild(big);
    const close = () => ov.remove();
    const ov = h('div', { class: 'vann', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'A visitor: ' + (coat ? coat[1] : v[1]) },
      h('div', { class: 'vann-in' }, stage,
        h('div', { class: 'vinfo' },
          h('div', { class: 'vk' }, coat ? 'A rare visitor' : 'A visitor'),
          h('h1', null, coat ? coat[1] : v[1]),
          h('div', { class: 'vmood' }, v[4])),
        h('div', { class: 'grow1' }),
        h('div', { class: 'ract' },
          h('button', { class: 'btn', type: 'button', onclick: close }, 'Later'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => { close(); location.hash = '#/insights/focus/' + k; } }, 'See it in your garden'))));
    document.body.appendChild(ov);
    try { if (navigator.vibrate) navigator.vibrate(20); } catch (err) { /* ignore */ }
    return true;
  }
  RV.gardenRecap = { maybeShow: () => maybeRecap() || maybeRound() || maybeVisitor(), round: maybeRound, visitor: maybeVisitor };

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
