/* RV app: garden characters (v2.16; drawn poses and variety v2.19). The potted plants, their care poses, eyes and motion, and the
   growth moment. Art and CSS ported from the "Groundwork garden insights" canvas (boards: Characters,
   Characters in lists, Growing up). viewBox 0 0 60 92 per plant, pot at the bottom. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  // ---------- art (v2.19: care as posture, a plant of their own for each person) ----------
  // Drawn, not stored: the stem is the spine, the leaves are the arms, the top is the head. Care levels:
  // 5 lush (arms up, big foliage, open flower, sparkle), 4 healthy (upright, arms level), 2 thirsty
  // (slouched, head bowed, curled leaves, losing some), 1 wilting (collapsed, few shrivelled leaves).
  // (3 = old "steady" draws as healthy.) The fruit tree keeps its stance: its crown and fruit thin instead.
  // Each person gets a variant from their ID: leaf shape, arrangement, stem curve, flower, crown, fruit, shade.
  const ARM = { 5: 46, 4: 86, 2: 132, 1: 168 };
  const BEND = { 5: -2, 4: 0, 2: 70, 1: 165 };
  const HEAD = { 5: -4, 4: 0, 2: 55, 1: 60 };
  const LEN = { 5: 1.12, 4: 0.98, 2: 0.92, 1: 0.86 };
  const LW = { 5: 1.5, 4: 0.95, 2: 0.62, 1: 0.42 };
  const f = (v) => String(Math.round(v * 100) / 100);
  const rad = (d) => (d * Math.PI) / 180;
  function variant(id) {
    let n = 0; const sid = String(id || '');
    for (let i = 0; i < sid.length; i++) n = (n * 31 + sid.charCodeAt(i)) >>> 0;
    return { leaf: ['round', 'point', 'paddle', 'long'][n % 4], arr: ['opp', 'alt'][(n >>> 2) % 2], curve: [0, 8, -7][(n >>> 3) % 3],
      flower: ['five', 'daisy', 'bell'][(n >>> 5) % 3], canopy: ['round', 'oval', 'umbrella'][(n >>> 7) % 3], fruit: ['berry', 'pear'][(n >>> 9) % 2], shade: (n >>> 10) % 3 };
  }
  function spine(L, bend, n, x0, y0) {
    n = n || 12; x0 = x0 == null ? 30 : x0; y0 = y0 == null ? 70 : y0;
    const pts = [[x0, y0]], angs = [0]; const seg = L / n; let x = x0, y = y0;
    for (let i = 1; i <= n; i++) { const a = bend * Math.pow(i / n, 1.8); x += Math.sin(rad(a)) * seg; y -= Math.cos(rad(a)) * seg; pts.push([x, y]); angs.push(a); }
    return { pts, angs };
  }
  const at = (sp, t) => { const i = Math.min(sp.pts.length - 1, Math.max(0, Math.round(t * (sp.pts.length - 1)))); return [sp.pts[i][0], sp.pts[i][1], sp.angs[i]]; };
  function pathD(pts) {
    let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) d += ' Q' + f(pts[i][0]) + ' ' + f(pts[i][1]) + ' ' + f((pts[i][0] + pts[i + 1][0]) / 2) + ' ' + f((pts[i][1] + pts[i + 1][1]) / 2);
    return d + ' L' + f(pts[pts.length - 1][0]) + ' ' + f(pts[pts.length - 1][1]);
  }
  const stemP = (sp, w) => '<path d="' + pathD(sp.pts) + '" stroke="currentColor" stroke-width="' + w + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  const cpath = (W, L, a, b, c, d2, e, g) => 'M0 0 C' + f(W * a) + ' ' + f(-L * b) + ' ' + f(W * c) + ' ' + f(-L * d2) + ' 0 ' + f(-L * e) + ' C' + f(-W * c) + ' ' + f(-L * d2) + ' ' + f(-W * a) + ' ' + f(-L * b) + ' 0 0Z';
  function leaf(ctx, x, y, ang, L, W, plain) {
    const c = ctx.care;
    if (!plain) W *= LW[c];
    const shape = plain ? 'round' : ctx.v.leaf;
    if (shape === 'long') { L *= 1.22; W *= 0.62; }
    const d = shape === 'point' ? cpath(W, L, 1.05, 0.25, 0.35, 0.7, 1.05, 0) : shape === 'paddle' ? cpath(W, L, 0.5, 0.1, 1.2, 1.0, 0.95, 0) : cpath(W, L, 0.9, 0.3, 0.6, 0.8, 1, 0);
    let out = '<path d="' + d + '" fill="currentColor"/>';
    if (!plain && c <= 2) {
      out += '<path d="M0 -1 L0 ' + f(-L * 0.85) + '" class="fold" stroke-width=".7"/>';
      if (c === 1) out += '<path d="M0 ' + f(-L * .62) + ' C' + f(W * .5) + ' ' + f(-L * .7) + ' ' + f(W * .4) + ' ' + f(-L * .9) + ' 0 ' + f(-L) + ' C' + f(-W * .4) + ' ' + f(-L * .9) + ' ' + f(-W * .5) + ' ' + f(-L * .7) + ' 0 ' + f(-L * .62) + 'Z" class="tip"/>';
    }
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(ang) + ')">' + out + '</g>';
  }
  const keep = (spec, care, counts) => { const n = counts[care]; return n < spec.length ? spec.slice(spec.length - n) : spec; };
  function arms(ctx, sp, spec) {
    const c = ctx.care; let out = '';
    for (let [t, side, L, W] of spec) {
      if (ctx.v.arr === 'alt' && side > 0) t = Math.min(0.9, t + 0.07);
      const [x, y, a] = at(sp, t);
      out += leaf(ctx, x, y, side * ARM[c] + a * (c >= 4 ? 0.6 : 0.25), L * (c <= 2 ? 0.92 : c === 5 ? 1.32 : 1), W);
    }
    return out;
  }
  const fallen = (n) => [[7, 89.5], [53, 89.5], [11, 90.6]].slice(0, n).map(([x, y]) => '<ellipse cx="' + x + '" cy="' + y + '" rx="3.4" ry="1.4" class="tip"/>').join('');
  const bendOf = (ctx) => BEND[ctx.care] + (ctx.care >= 4 ? ctx.v.curve : ctx.v.curve * 0.4);
  function seed(ctx) {
    const c = ctx.care, lift = { 5: 0, 4: 0, 2: 1, 1: 2 }[c], tilt = { 5: 0, 4: 0, 2: 14, 1: 34 }[c];
    let out = '<g transform="rotate(' + tilt + ' 30 69)"><ellipse cx="30" cy="' + (63 + lift) + '" rx="' + (c > 1 ? 5.5 : 5) + '" ry="' + (c > 1 ? 6.5 : 5.6) + '" class="seedc"/>';
    const sp = spine(9 * LEN[c], BEND[c] * 1.6 + 6, 6, 30, 57 + lift);
    out += stemP(sp, 2.2);
    const [x, y, a] = [sp.pts[6][0], sp.pts[6][1], sp.angs[6]];
    if (c >= 4) out += leaf(ctx, x, y, a + 40, 5.5, 3.2);
    return out + '</g>';
  }
  function sprout(ctx) {
    const c = ctx.care, sp = spine(24 * LEN[c], bendOf(ctx));
    let out = stemP(sp, 2.6) + arms(ctx, sp, keep([[0.55, -1, 12, 6.5], [0.55, 1, 12, 6.5]], c, { 5: 2, 4: 2, 2: 1, 1: 1 }));
    const e = sp.pts.length - 1, x = sp.pts[e][0], y = sp.pts[e][1], a = sp.angs[e], k = c === 5 ? 1.3 : 1;
    out += leaf(ctx, x, y, a + HEAD[c] * 0.5 - 8, 9 * k, 5) + leaf(ctx, x, y, a + HEAD[c] * 0.5 + 22, 7 * k, 4);
    return out + (c === 1 ? fallen(2) : c === 2 ? fallen(1) : '');
  }
  function leafy(ctx) {
    const c = ctx.care, sp = spine(44 * LEN[c], bendOf(ctx));
    let out = stemP(sp, 2.6) + arms(ctx, sp, keep([[0.12, 1, 12, 6.5], [0.18, -1, 13, 7], [0.3, 1, 13, 7], [0.45, -1, 12, 6.5], [0.58, 1, 12, 6.5], [0.74, -1, 10, 5.5], [0.84, 1, 10, 5.5]], c, { 5: 7, 4: 4, 2: 3, 1: 2 }));
    const e = sp.pts.length - 1, x = sp.pts[e][0], y = sp.pts[e][1], a = sp.angs[e], k = c === 5 ? 1.35 : 1;
    out += leaf(ctx, x, y, a + HEAD[c] * 0.5 - 14, 8 * k, 4.5) + leaf(ctx, x, y, a + HEAD[c] * 0.5 + 14, 8 * k, 4.5);
    return out + (c === 1 ? fallen(3) : c === 2 ? fallen(2) : '');
  }
  function shrub(ctx) {
    const c = ctx.care, sp = spine(48 * LEN[c], bendOf(ctx));
    let out = stemP(sp, 2.8) + arms(ctx, sp, keep([[0.1, 1, 12, 6.5], [0.15, -1, 13, 7], [0.28, 1, 13, 7], [0.5, -1, 11, 6], [0.62, 1, 11, 6]], c, { 5: 5, 4: 3, 2: 2, 1: 1 }));
    const e = sp.pts.length - 1, x = sp.pts[e][0], y = sp.pts[e][1], ha = sp.angs[e] + HEAD[c];
    const r = { 5: 7.6, 4: 4.4, 2: 3.6, 1: 3 }[c], spread = { 5: 9.4, 4: 5.2, 2: 3.8, 1: 3 }[c];
    const cx = x + Math.sin(rad(ha)) * 6, cy = y - Math.cos(rad(ha)) * 6;
    if (ctx.v.flower === 'daisy') {
      const n = { 5: 12, 4: 10, 2: 7, 1: 4 }[c];
      for (let k = 0; k < n; k++) out += '<ellipse cx="0" cy="' + f(-spread * .95) + '" rx="' + f(r * .42) + '" ry="' + f(spread * .62) + '" class="tint" transform="translate(' + f(cx) + ' ' + f(cy) + ') rotate(' + f(ha + k * 360 / n) + ')"/>';
      out += '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r * .62) + '" fill="currentColor"/>';
    } else if (ctx.v.flower === 'bell') {
      out += '<g transform="translate(' + f(cx) + ' ' + f(cy + 3) + ') rotate(' + f(c <= 2 ? ha + 180 : ha) + ') scale(' + f(r / 3.3) + ')"><path d="M-5 0 C-5 -7 -3 -9 0 -9 C3 -9 5 -7 5 0 L3 -1.6 1.5 .4 0 -1.4 -1.5 .4 -3 -1.6 Z" class="tint"/></g>';
    } else {
      for (let k = 0; k < (c > 1 ? 5 : 3); k++) out += '<circle cx="' + f(cx + Math.sin(rad(ha + k * 72)) * spread) + '" cy="' + f(cy - Math.cos(rad(ha + k * 72)) * spread) + '" r="' + f(r) + '" class="tint"/>';
      out += '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r * .72) + '" fill="currentColor"/>';
    }
    // v2.23: one small flower per completed chain of talks (up to five), open when cared for, closed buds when dry
    const FP = [[0.3, 1], [0.44, -1], [0.58, 1], [0.72, -1], [0.86, 1]];
    for (let k = 0; k < Math.min(5, ctx.flowers || 0); k++) {
      const [t, side] = FP[k], [fx0, fy0, fa] = at(sp, t);
      const ang = fa + side * (c >= 4 ? 62 : 110), d = c >= 4 ? 9 : 6;
      const fx = fx0 + Math.sin(rad(ang)) * d, fy = fy0 - Math.cos(rad(ang)) * d;
      if (c >= 4) {
        let fl = '';
        for (let p = 0; p < 5; p++) fl += '<circle cx="' + f(fx + Math.sin(rad(p * 72)) * 2.3) + '" cy="' + f(fy - Math.cos(rad(p * 72)) * 2.3) + '" r="' + (c === 5 ? 2 : 1.7) + '" class="tint"/>';
        out += '<g class="sfl">' + fl + '<circle cx="' + f(fx) + '" cy="' + f(fy) + '" r="1.3" fill="currentColor"/></g>';
      } else out += '<ellipse cx="' + f(fx) + '" cy="' + f(fy) + '" rx="1.4" ry="2.3" class="tint" transform="rotate(' + f(ang + 180) + ' ' + f(fx) + ' ' + f(fy) + ')"/>';
    }
    // one small fruit bud per study session logged (up to three), on the healthy stem
    for (let k = 0; k < Math.min(3, ctx.buds || 0) && c >= 4; k++) { const [bx, by] = at(sp, [0.35, 0.55, 0.72][k]); out += '<circle cx="' + f(bx + (k % 2 ? -5 : 5)) + '" cy="' + f(by) + '" r="2.4" fill="currentColor"/>'; }
    return out + (c === 1 ? fallen(2) : c === 2 ? fallen(1) : '');
  }
  function tree(ctx) {
    const c = ctx.care, sp = spine(30, { 5: 0, 4: 0, 2: 3, 1: 6 }[c]);
    let out = stemP(sp, 4.4), blobs = '';
    const e = sp.pts.length - 1, x = sp.pts[e][0], y = sp.pts[e][1], a = sp.angs[e];
    let arm = { 5: 56, 4: 60, 2: 70, 1: 76 }[c], spots;
    if (ctx.v.canopy === 'oval') { spots = [[0, 16, 9], [0, 26, 8], [-1, 8, 8], [1, 8, 8], [0, 6, 8], [-1, 14, 6], [1, 14, 6]]; arm *= 0.4; }
    else if (ctx.v.canopy === 'umbrella') { spots = [[0, 10, 9], [-1, 15, 9], [1, 15, 9], [-1, 24, 7.5], [1, 24, 7.5], [-1, 7, 7], [1, 7, 7]]; arm *= 1.35; }
    else spots = [[0, 14, 10], [-1, 16, 9], [1, 16, 9], [-1, 9, 8], [1, 9, 8], [-1, 22, 7], [1, 22, 7]];
    const n = { 5: 7, 4: 4, 2: 3, 1: 2 }[c], fruit = { 5: 6, 4: 2, 2: 1, 1: 0 }[c];
    spots.forEach(([side, L, r], k) => {
      const ang = a + side * arm * (L > 10 ? 1 : 0.6) + (L > 20 ? side * 8 : 0);
      const bx = x + Math.sin(rad(ang)) * L, by = y - Math.cos(rad(ang)) * L;
      if (k < n || L <= 16) out += '<path d="M' + f(x) + ' ' + f(y + 6) + ' L' + f(bx) + ' ' + f(by) + '" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>';
      if (k < n) {
        blobs += '<circle cx="' + f(bx) + '" cy="' + f(by) + '" r="' + f(r * (c === 5 ? 1.32 : 1)) + '" class="tint"/>';
        if (k < fruit) blobs += ctx.v.fruit === 'pear'
          ? '<path d="M0 -3.6 C1.4 -3.6 1.2 -1.4 2.4 .4 C3.2 2 2 3.4 0 3.4 C-2 3.4 -3.2 2 -2.4 .4 C-1.2 -1.4 -1.4 -3.6 0 -3.6Z" fill="currentColor" transform="translate(' + f(bx + 2) + ' ' + f(by + 3) + ')"/>'
          : '<circle cx="' + f(bx + 2) + '" cy="' + f(by + 2) + '" r="2.6" fill="currentColor"/>';
      }
    });
    return out + blobs + (c === 1 ? fallen(3) : c === 2 ? fallen(2) : '');
  }
  const DRAW = { 1: seed, 2: sprout, 3: leafy, 4: shrub, 5: tree };
  const STAR = (x, y, s) => '<path d="M0 -3.4 L.9 -.9 3.4 0 .9 .9 0 3.4 -.9 .9 -3.4 0 -.9 -.9Z" class="star" transform="translate(' + x + ' ' + y + ') scale(' + s + ')"/>';
  // care 3 (the old "steady") draws as healthy; seeds and sprouts top out at healthy
  const careOf = (form, care) => { let c = care === 3 ? 4 : care || 4; if (c === 5 && form <= 2) c = 4; return c; };
  // kind (v2.34): a revealed plant from leafy up draws as its kind (js/kinds.js); sil paints a kind in one colour
  function plantSvg(form, care, v, buds, flowers, kind, sil) {
    const ctx = { care: careOf(form, care), v, buds, flowers };
    const K = RV.kinds;
    const art = kind && form >= 3 && K && K.has(kind)
      ? K.svg(kind, form, ctx.care, { dark: isDark(), flowers, buds, sil })
      : DRAW[form](ctx);
    const stars = ctx.care === 5 && !sil ? '<g class="stars">' + STAR(8, 30, 1) + STAR(52, 22, 1.2) + STAR(14, 8, .8) + STAR(49, 52, .8) + '</g>' : '';
    return '<svg class="plant-svg" aria-hidden="true" viewBox="0 0 60 92"><g class="lean"><g class="body"><g class="sway">' + art + '</g></g></g>' + stars + '</svg>';
  }
  // Colours (v2.34: natural, no longer the accent): four care shades per theme for the shared seed and sprout and
  // for plants not yet revealed, and two neighbouring hues for variety. Revealed kinds draw their own colours (js/kinds.js).
  const PAL = {
    light: { c: { 5: '#4E7F4A', 4: '#5C8C55', 2: '#94A470', 1: '#8A8D6E' }, t: { 5: '#7FA04A', 4: '#86A64C', 2: '#B5B57E', 1: '#A3A285' } },
    dark: { c: { 5: '#8DBE82', 4: '#7FAE74', 2: '#A3AC80', 1: '#8E8F78' }, t: { 5: '#A9C470', 4: '#9AB766', 2: '#AEB28A', 1: '#96957F' } },
  };
  function hueShift(hex, deg) {
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s2 = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s2 = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    h = (h + deg / 360 + 1) % 1;
    const q = l < .5 ? l * (1 + s2) : l + s2 - l * s2, p = 2 * l - q;
    const tc = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return '#' + to(s2 ? tc(h + 1 / 3) : l) + to(s2 ? tc(h) : l) + to(s2 ? tc(h - 1 / 3) : l);
  }
  function isDark() {
    const de = typeof document !== 'undefined' ? document.documentElement : null;
    const t = de && de.getAttribute('data-theme');
    return t === 'dark' || (t !== 'light' && !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches));
  }
  function colours(care, shade) {
    const P = PAL[isDark() ? 'dark' : 'light'];
    const deg = [0, -14, 14][shade || 0];
    return { c: deg ? hueShift(P.c[care], deg) : P.c[care], t: deg ? hueShift(P.t[care], deg) : P.t[care] };
  }
  // The pot is the character: two dot eyes by care, a water-drop bubble when thirsty, shimmer when lush.
  // small = list/tile geometry (bigger eyes and bubble so they read at row size), else the large one.
  function potSvg(small) {
    const r = small ? 2.7 : 2.3, sw = small ? 2.1 : 1.8;
    const eyes = small
      ? '<g class="e-happy" stroke-width="2.1"><path d="M22.4 82.2 Q25 78 27.6 82.2"/><path d="M32.4 82.2 Q35 78 37.6 82.2"/></g>' +
        '<g class="e-drowsy"><path d="M22.3 81 A2.7 2.7 0 0 0 27.7 81 Z"/><path d="M32.3 81 A2.7 2.7 0 0 0 37.7 81 Z"/></g>' +
        '<g class="e-sleep" stroke-width="1.9"><path d="M22.8 81.5 H27.2"/><path d="M32.8 81.5 H37.2"/></g>'
      : '<g class="e-happy" stroke-width="' + sw + '"><path d="M22.6 82 Q25 78.4 27.4 82"/><path d="M32.6 82 Q35 78.4 37.4 82"/></g>' +
        '<g class="e-drowsy"><path d="M22.7 81 A2.3 2.3 0 0 0 27.3 81 Z"/><path d="M32.7 81 A2.3 2.3 0 0 0 37.3 81 Z"/></g>' +
        '<g class="e-sleep" stroke-width="1.6"><path d="M23 81.5 H27"/><path d="M33 81.5 H37"/></g>';
    // the soil at the top of the pot (and the mound when planted in the ground): dark and moist when
    // cared for; pale and cracked when thirsty (one crack) or wilting (more cracks)
    const soil = '<g class="soilg"><ellipse cx="30" cy="69.5" rx="15" ry="3.2" class="soil"/>' +
      '<g class="cracks"><path d="M24 68.6 l1.6 1.2 -1 1.3"/><path class="ck2" d="M33 68.3 l-1.2 1.4 1.4 1"/><path class="ck2" d="M38.5 69.4 l-1.6 .9"/><path class="ck2" d="M20 69.8 l1.8 .4"/></g></g>';
    return '<svg class="pot-svg" aria-hidden="true" viewBox="0 0 60 92">' +
      (small ? '' : '<ellipse cx="30" cy="91" rx="17" ry="1.6" class="shadow"/>') +
      '<rect x="11" y="68" width="38" height="6" rx="3" class="rim"/><path d="M14 74 H46 L43 90 H17 Z" class="pot"/>' + soil +
      '<g class="face"><g class="e-open"><circle cx="25" cy="81" r="' + r + '"/><circle cx="35" cy="81" r="' + r + '"/>' +
      '<g class="e-shine"><circle cx="' + (small ? 25.9 : 25.8) + '" cy="' + (small ? 80.1 : 80.2) + '" r="' + (small ? 0.9 : 0.8) + '"/><circle cx="' + (small ? 35.9 : 35.8) + '" cy="' + (small ? 80.1 : 80.2) + '" r="' + (small ? 0.9 : 0.8) + '"/></g></g>' +
      eyes + '</g>' +
      '<g class="spark"><circle cx="7" cy="34" r="1.5"/><circle cx="53" cy="44" r="1.3"/><circle cx="12" cy="12" r="1.1"/><circle cx="50" cy="60" r="1.1"/></g></svg>';
  }

  // ---------- CSS (ported from the boards; colours as tokens per accent and theme) ----------
  const CSS = `
:root{--pl-seed:#9A7454;--pl-soil:#6E5646;--pl-dry:#E2D3BC;--pl-crack:#A8937A;--pl-5:#8E3F25;--pl-4:#B4583A;--pl-3:#C9805F;--pl-2:#DDB39C;--pl-1:#C9BFB3;--pl-pot:#C77F5A;--pl-rim:#B0653F;--pl-eye:#2A1A12;--pl-acc:#B4583A;--pl-acc-ic:#FFFFFF;--pl-off:#E7E2D7}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--pl-soil:#4A3C32;--pl-dry:#9C8D7A;--pl-crack:#6E6152;--pl-5:#F2B49A;--pl-4:#E39271;--pl-3:#C47A5C;--pl-2:#8E5F4B;--pl-1:#6B645B;--pl-pot:#9A6044;--pl-rim:#844E36;--pl-eye:#1E140F;--pl-acc:#E39271;--pl-acc-ic:#141310;--pl-off:#38352F}}
:root[data-theme="dark"]{--pl-soil:#4A3C32;--pl-dry:#9C8D7A;--pl-crack:#6E6152;--pl-5:#F2B49A;--pl-4:#E39271;--pl-3:#C47A5C;--pl-2:#8E5F4B;--pl-1:#6B645B;--pl-pot:#9A6044;--pl-rim:#844E36;--pl-eye:#1E140F;--pl-acc:#E39271;--pl-acc-ic:#141310;--pl-off:#38352F}
.pl{position:relative;flex:none;color:var(--pl-4);transform-origin:50% 100%;display:inline-block}
.pl svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
.pl.xl{width:104px;height:159px}.pl.lg{width:80px;height:123px}.pl.md{width:56px;height:86px}.pl.rw{width:48px;height:74px}.pl.tl{width:44px;height:67px}.pl.sm{width:32px;height:49px}
.pl .rim{fill:var(--pl-rim)}.pl .pot{fill:var(--pl-pot)}.pl .shadow{fill:var(--pl-eye);opacity:.08}
.pl .e-open circle{fill:var(--pl-eye)}.pl .e-shine circle{fill:var(--pl-pot)}
.pl .e-happy,.pl .e-sleep{stroke:var(--pl-eye);fill:none;stroke-linecap:round}.pl .e-drowsy{fill:var(--pl-eye)}
.pl .soil{fill:var(--pl-soil)}.pl.h2 .soil,.pl.h1 .soil{fill:var(--pl-dry)}.pl .cracks path{fill:none;stroke:var(--pl-crack);stroke-width:.9;stroke-linecap:round;stroke-linejoin:round}.pl.rw .cracks path,.pl.tl .cracks path,.pl.sm .cracks path{stroke-width:1.3}
.pl .acc{fill:var(--pl-acc)}.pl .acc-ic{fill:var(--pl-acc-ic)}.pl .spark{fill:var(--pl-acc)}
.pl .body,.pl .sway,.pl .lean{transform-box:view-box;transform-origin:30px 70px;transition:transform .35s}
.pl .cracks,.pl .ck2,.pl .spark,.pl .e-happy,.pl .e-drowsy,.pl .e-sleep,.pl .e-shine{display:none}
.pl.h1 .cracks,.pl.h2 .cracks,.pl.h1 .ck2,.pl.h4 .e-shine{display:inline}
.pl .tint{fill:var(--pl-tint,#86A64C)}.pl .star{fill:#E8C35A}.pl .seedc{fill:var(--pl-seed)}.pl .tip{fill:#8C7A62}.pl .fold{stroke:var(--pl-pot);fill:none}
.pl.h5 .e-open,.pl.h2 .e-open,.pl.h1 .e-open{display:none}
.pl.h5 .e-happy,.pl.h2 .e-drowsy,.pl.h1 .e-sleep{display:inline}
.pl.joy .e-open,.pl.joy .e-drowsy,.pl.joy .e-sleep{display:none}.pl.joy .e-happy{display:inline}
/* bare: planted straight in the ground (garden scene): no pot or face, the bubble and shimmer stay */
.pl.bare .rim,.pl.bare .pot,.pl.bare .face,.pl.bare .shadow{display:none}
.pl.ghost{color:var(--pl-off)}.pl.ghost .tint,.pl.ghost .tip{fill:var(--pl-off)}.pl.ghost .face,.pl.ghost .soilg,.pl.ghost .stars{display:none}.pl.ghost .pot-svg{opacity:.6}.pl.ghost .sway,.pl.ghost .body{animation:none;transform:none}
/* the idle motion follows the mood: lush bounces, healthy sways, thirsty barely moves, wilting just breathes */
@keyframes pl-cheer{0%,100%{transform:rotate(-3deg) translateY(0)}25%{transform:rotate(0) translateY(-1.6px)}50%{transform:rotate(3deg) translateY(0)}75%{transform:rotate(0) translateY(-1.6px)}}
@keyframes pl-sway{0%,100%{transform:rotate(-2.4deg)}50%{transform:rotate(2.4deg)}}
@keyframes pl-droop{0%,100%{transform:rotate(-.5deg)}50%{transform:rotate(.6deg)}}
@keyframes pl-breathe{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.975)}}
.pl .sway{animation:pl-sway 3.6s ease-in-out infinite}
.pl.h5 .sway{animation:pl-cheer 2.6s ease-in-out infinite}.pl.h2 .sway{animation:pl-droop 7s ease-in-out infinite}.pl.h1 .sway{animation:pl-breathe 6s ease-in-out infinite}
.pl .stars path{animation:pl-twinkle 2.4s ease-in-out infinite}.pl .stars path:nth-child(2){animation-delay:-.8s}.pl .stars path:nth-child(3){animation-delay:-1.6s}
.pl.d1 .sway{animation-delay:-.7s}.pl.d2 .sway{animation-delay:-1.9s}.pl.d3 .sway{animation-delay:-2.6s}.pl.d4 .sway{animation-delay:-1.2s}.pl.d5 .sway{animation-delay:-3.1s}
@keyframes pl-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.12)}}
.pl .e-open{transform-box:fill-box;transform-origin:center;animation:pl-blink 5.4s infinite}
.pl.d2 .e-open{animation-delay:-2.1s}.pl.d3 .e-open{animation-delay:-3.7s}.pl.d4 .e-open{animation-delay:-1.3s}.pl.d5 .e-open{animation-delay:-4.4s}
@keyframes pl-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
@keyframes pl-twinkle{0%,100%{opacity:.25}50%{opacity:1}}
.pl .spark circle{animation:pl-twinkle 2.8s ease-in-out infinite}
.pl .spark circle:nth-child(2){animation-delay:-.9s}.pl .spark circle:nth-child(3){animation-delay:-1.7s}.pl .spark circle:nth-child(4){animation-delay:-2.3s}
@keyframes pl-pop{0%{transform:scale(1,1)}18%{transform:scale(1.1,.86)}42%{transform:scale(.93,1.12)}68%{transform:scale(1.03,.97)}100%{transform:scale(1,1)}}
.pl.pop{animation:pl-pop .75s cubic-bezier(.3,1.3,.5,1)}
.pl.leaning .lean{transform:rotate(4deg)}
.pl.off *{animation-play-state:paused!important}
/* growth moment */
.grow-ov{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:color-mix(in srgb,var(--bg) 88%,transparent);cursor:pointer}
.grow-ov .stagewrap{position:relative;width:176px;height:270px}
.grow-ov .lay,.grow-ov .potl{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 76%}
.grow-ov .potl{transform-origin:50% 98%}
.grow-ov .pl{position:absolute;left:0;top:0;width:100%;height:100%}
@keyframes pl-out{0%{transform:scale(1,1);opacity:1}20%{transform:scale(1.06,.86);opacity:1}46%{transform:scale(.5);opacity:0}100%{transform:scale(.5);opacity:0}}
@keyframes pl-in{0%,34%{transform:scale(.3);opacity:0}52%{opacity:1}70%{transform:scale(1.14,.92)}85%{transform:scale(.96,1.05)}100%{transform:scale(1,1);opacity:1}}
@keyframes pl-dip{0%,100%{transform:scale(1,1)}14%{transform:scale(1.07,.88)}30%{transform:scale(.97,1.04)}62%{transform:scale(1.04,.95)}78%{transform:scale(1,1)}}
.grow-ov .lay.out{animation:pl-out 2.5s cubic-bezier(.4,0,.3,1) forwards}
.grow-ov .lay.in{opacity:0;animation:pl-in 2.5s cubic-bezier(.3,1.2,.5,1) forwards}
.grow-ov .potl.dip{animation:pl-dip 2.5s ease-in-out}
@keyframes pl-burst{0%,28%{transform:translateY(0);opacity:0}36%{opacity:1}76%{transform:translateY(-36px);opacity:0}100%{transform:translateY(-36px);opacity:0}}
.grow-ov .bdot{fill:var(--pl-acc);animation:pl-burst 2.5s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes pl-ring{0%,24%{transform:scale(.2);opacity:0}34%{opacity:.8}72%{transform:scale(2.8);opacity:0}100%{transform:scale(2.8);opacity:0}}
.grow-ov .ring{fill:none;stroke:var(--pl-acc);stroke-width:1.2;transform-box:fill-box;transform-origin:center;animation:pl-ring 2.5s ease-out forwards}
@keyframes pl-chip{0%{transform:translateY(10px) scale(.9);opacity:0}60%{transform:translateY(-2px) scale(1.04);opacity:1}100%{transform:translateY(0) scale(1);opacity:1}}
.grow-ov.quick .lay.out,.grow-ov.quick .lay.in,.grow-ov.quick .potl.dip,.grow-ov.quick .bdot,.grow-ov.quick .ring{animation-duration:1.6s}
.evo-ov{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:rgba(18,20,17,0);transition:background .6s ease;cursor:pointer;color:#F4F1EA}
.evo-ov.in{background:rgba(18,20,17,.93)}
.evo-ov.named{background:color-mix(in srgb,var(--bg) 97%,transparent);color:var(--fg);transition:background .5s ease}
.evo-top{position:absolute;top:calc(22% - 40px);left:0;right:0;text-align:center;font-size:17px;font-weight:500;opacity:0;transition:opacity .5s .2s}
.evo-ov.in .evo-top{opacity:1}
.evo-stage{position:relative;width:176px;height:270px;transform:scale(1.3);margin:30px 0}
.evo-lay{position:absolute;inset:0}
.evo-lay .pl{position:absolute;left:0;top:0;width:100%;height:100%;transition:filter .45s ease}
.evo-lay.sil .pl{filter:brightness(0) invert(1) drop-shadow(0 0 10px rgba(255,255,255,.7))}
.evo-lay.hide{visibility:hidden}
.evo-glow{position:absolute;left:50%;top:46%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:radial-gradient(circle,rgba(255,250,225,.95),rgba(255,240,200,0) 70%);opacity:0;transform:scale(.6);transition:transform 2.6s cubic-bezier(.5,0,.8,.4),opacity 1s}
.evo-ov.gather .evo-glow{opacity:1;transform:scale(7)}
.evo-ov.named .evo-glow{opacity:0;transition:opacity .6s}
.evo-sparks{position:absolute;left:50%;top:46%;width:0;height:0}
.evo-sparks i{position:absolute;left:-2px;top:-2px;width:4px;height:4px;border-radius:50%;background:#FFF6D8;opacity:0}
.evo-ov.gather .evo-sparks i{animation:evo-spark 1.1s var(--d) ease-in infinite}
.evo-ov.named .evo-sparks i{animation:none;opacity:0}
@keyframes evo-spark{0%{opacity:0;transform:rotate(var(--a)) translateY(-120px)}30%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) translateY(-8px)}}
.evo-bloom{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 46%,#FFFFFF 0,#FFFDF5 45%,rgba(255,253,245,.9) 100%);opacity:0}
.evo-ov.flash .evo-bloom{animation:evo-bloom 1s ease-out forwards}
@keyframes evo-bloom{0%{opacity:0}30%{opacity:1}100%{opacity:0}}
.evo-chip{min-height:60px;display:flex;flex-direction:column;align-items:center;gap:8px}
.evo-chip span{font-size:24px;font-weight:700;animation:pl-chip .5s cubic-bezier(.3,1.4,.5,1) both}
.evo-chip .gsub{font-size:15px;font-weight:500;color:var(--muted);animation:pl-chip .5s .15s cubic-bezier(.3,1.4,.5,1) both}
.evo-ov.named .evo-stage .pl{animation:pl-chip .6s cubic-bezier(.3,1.3,.5,1) both}
.evo-ov .ghint{position:absolute;left:0;right:0;bottom:calc(48px + env(safe-area-inset-bottom,0px));text-align:center;font-size:14px;color:var(--muted);opacity:0;transition:opacity .6s}
.evo-ov .ghint.on{opacity:1}
.grow-ov .ghint{position:absolute;left:0;right:0;bottom:calc(48px + env(safe-area-inset-bottom,0px));text-align:center;font-size:14px;color:var(--muted);opacity:0;transition:opacity .6s}
.grow-ov .ghint.on{opacity:1}
.grow-ov .gchip{min-height:36px;display:flex;flex-direction:column;align-items:center;gap:8px}
.grow-ov .gchip .gsub{font-size:15px;font-weight:500;color:var(--muted);animation:pl-chip .5s .15s cubic-bezier(.3,1.4,.5,1) both}
.grow-ov .gchip span{background:var(--fg);color:var(--bg);border-radius:18px;padding:7px 16px;font-size:15px;font-weight:600;animation:pl-chip .5s cubic-bezier(.3,1.4,.5,1) forwards}
@media (prefers-reduced-motion:reduce){.pl .sway,.pl .e-open,.pl .spark circle,.pl .stars path,.pl.pop,.grow-ov .lay,.grow-ov .potl,.grow-ov .bdot,.grow-ov .ring,.grow-ov .gchip span{animation:none!important}.grow-ov .lay.out,.grow-ov .bdot,.grow-ov .ring{opacity:0}.grow-ov .lay.in{opacity:1}}
`;
  const h2 = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls; el.textContent = text; return el; };
  let styled = false;
  function ensureStyle() {
    if (styled || typeof document === 'undefined') return;
    styled = true;
    const st = document.createElement('style');
    st.id = 'plant-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // Animation is paused for plants scrolled off screen.
  let io = null;
  function watch(el) {
    if (typeof IntersectionObserver === 'undefined') return;
    if (!io) io = new IntersectionObserver((list) => list.forEach((en) => en.target.classList.toggle('off', !en.isIntersecting)), { rootMargin: '60px' });
    io.observe(el);
  }

  let seq = 0;
  // A potted plant. form 1..5, care 1..5 (1 wilted .. 5 lush), size: xl | lg | md | rw | tl | sm.
  function make(form, care, o) {
    o = o || {};
    ensureStyle();
    const size = o.size || 'rw';
    const small = size === 'rw' || size === 'tl' || size === 'sm';
    const el = document.createElement('span');
    const buds = form === 4 ? Math.max(0, Math.min(3, o.buds || 0)) : 0;
    const c = careOf(form, care);
    const v = variant(o.vid != null ? o.vid : 'base');
    const kind = form >= 3 && o.kind && RV.kinds && RV.kinds.has(o.kind) ? o.kind : null;
    el.className = 'pl ' + size + ' s' + form + ' h' + c + ' d' + ((o.seed != null ? o.seed : seq++) % 5 + 1) + (o.ghost ? ' ghost' : '') + (o.bare ? ' bare' : '') + (kind ? ' k-' + kind : '');
    el.setAttribute('aria-hidden', 'true');
    if (!o.ghost) { const col = colours(c, kind ? 0 : v.shade); el.style.color = col.c; el.style.setProperty('--pl-tint', col.t); }
    el.innerHTML = plantSvg(form, c, o.ghost || kind ? variant('base') : v, buds, form === 4 && !o.ghost ? o.flowers || 0 : 0, kind, o.ghost && kind ? 'currentColor' : null) + (o.potless ? '' : potSvg(small));
    if (!o.still) watch(el);
    return el;
  }
  // Squash-bounce with happy eyes, as when watered.
  function water(el) {
    if (!el) return;
    el.classList.remove('pop'); void el.offsetWidth;
    el.classList.add('pop', 'joy');
    setTimeout(() => el.classList.remove('pop', 'joy'), 1400);
  }
  // Lean toward a finger.
  function leanOnTouch(el) {
    if (!el) return;
    const on = () => el.classList.add('leaning'), off = () => el.classList.remove('leaning');
    el.addEventListener('pointerdown', on); ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, off));
  }
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // The growth moment: about 1.6 s, plays once, tap to skip, light haptic, then a chip naming the new stage.
  // o.fromCare: the old plant's care (for the revive moment); o.label: the overlay's spoken label.
  function grow(fromForm, toForm, care, stageName, vid, o) {
    o = o || {};
    ensureStyle();
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'grow-ov';
      ov.setAttribute('role', 'status');
      ov.setAttribute('aria-label', o.label || 'Grew into ' + stageName);
      const chip = document.createElement('div'); chip.className = 'gchip';
      const wrap = document.createElement('div'); wrap.className = 'stagewrap';
      const out = make(fromForm, o.fromCare || care, { size: 'xl', potless: true, still: true, seed: 0, vid, kind: o.fromKind }); if (!o.fromCare) out.classList.add('joy');
      const inn = make(toForm, care, { size: 'xl', potless: true, still: true, seed: 0, vid, kind: o.kind }); inn.classList.add('joy');
      const lo = document.createElement('div'); lo.className = 'lay out'; lo.appendChild(out);
      const li = document.createElement('div'); li.className = 'lay in'; li.appendChild(inn);
      const pot = make(toForm, care, { size: 'xl', still: true, seed: 0, vid }); pot.classList.add('joy');
      pot.querySelector('.plant-svg').remove();
      const pw = document.createElement('div'); pw.className = 'potl dip'; pw.appendChild(pot);
      const fx = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      fx.setAttribute('viewBox', '0 0 60 92'); fx.setAttribute('aria-hidden', 'true');
      fx.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible';
      let dots = '<circle class="ring" cx="30" cy="42" r="12"/>';
      for (let i = 0; i < 10; i++) dots += '<g transform="rotate(' + (i * 36) + ' 30 42)"><circle class="bdot" cx="30" cy="42" r="' + (i % 2 ? 1.5 : 1.9) + '"/></g>';
      fx.innerHTML = dots;
      wrap.append(lo, li, pw, fx);
      // v2.37: growth and reveal moments stay until tapped, with a quiet hint; revive stays short and closes itself
      const hold = !o.quick;
      if (!hold) ov.classList.add('quick');
      const hint = hold ? h2('div', 'ghint', 'Tap to continue') : null;
      ov.append(chip, wrap);
      if (hint) ov.append(hint);
      document.body.appendChild(ov);
      try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) { /* ignore */ }
      let done = false;
      const t1 = setTimeout(name, reduced() ? 0 : hold ? 2500 : 1600);
      const t2 = hold ? null : setTimeout(finish, reduced() ? 1200 : 2700);
      if (hint) setTimeout(() => hint.classList.add('on'), reduced() ? 300 : 3100);
      function name() {
        chip.innerHTML = ''; const s = document.createElement('span'); s.textContent = stageName; chip.appendChild(s);
        if (o.sub) { const b = document.createElement('b'); b.className = 'gsub'; b.textContent = o.sub; chip.appendChild(b); }
      }
      function finish() { if (done) return; done = true; clearTimeout(t1); if (t2) clearTimeout(t2); ov.remove(); resolve(); }
      ov.addEventListener('click', finish);
    });
  }

  // The revive moment: the same plant, drooping, perks back up to health (a visit after Thirsty or Wilting).
  function revive(form, fromCare, toCare, vid, kind) {
    return grow(form, form, toCare, 'Revived', vid, { fromCare, label: 'Revived', fromKind: kind, kind, quick: true });
  }
  // The reveal (v2.34): the growth moment from the unrevealed plant (or the sprout) to its kind, then
  // "It's an olive tree!" with the person's name under it.
  function reveal(fromForm, toForm, care, kind, vid, who, fromCare) {
    const lineText = RV.kinds ? RV.kinds.line(kind) : '';
    return evolve(fromForm, toForm, care, { kind, line: lineText, sub: who || '', fromCare, vid });
  }
  // v2.38: the evolution-style moment, for the kind reveal and for growing into a study tree. The garden dims,
  // "Something's happening…", the plant turns to a white silhouette and flickers with the new one, faster and
  // faster while light gathers, a soft white bloom, then the new plant in colour with its line. About 4 s, held
  // until tapped. Reduced motion goes straight to the new plant.
  function evolve(fromForm, toForm, care, o) {
    o = o || {};
    ensureStyle();
    const ev = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; };
    return new Promise((resolve) => {
      const ov = ev('div', 'evo-ov');
      ov.setAttribute('role', 'status'); ov.setAttribute('aria-label', o.line || 'It grew');
      const top = ev('div', 'evo-top', 'Something\u2019s happening\u2026');
      const wrap = ev('div', 'evo-stage');
      const glow = ev('div', 'evo-glow');
      const mk = (form, kind, c) => { const w = ev('div', 'evo-lay'); w.appendChild(make(form, c, { size: 'xl', potless: true, still: true, seed: 0, vid: o.vid, kind })); return w; };
      const a = mk(fromForm, o.fromKind, o.fromCare || care), b = mk(toForm, o.kind, care);
      b.classList.add('hide');
      let sparks = '';
      for (let i = 0; i < 12; i++) sparks += '<i style="--a:' + (i * 30) + 'deg;--d:' + (i % 3) * 0.12 + 's"></i>';
      const sp = ev('div', 'evo-sparks'); sp.innerHTML = sparks;
      wrap.append(glow, a, b, sp);
      const chip = ev('div', 'evo-chip');
      const bloom = ev('div', 'evo-bloom');
      const hint = ev('div', 'ghint', 'Tap to continue');
      ov.append(top, wrap, chip, bloom, hint);
      document.body.appendChild(ov);
      const timers = [];
      const at = (ms, fn) => timers.push(setTimeout(fn, ms));
      let done = false;
      function name() {
        a.classList.add('hide'); b.classList.remove('hide', 'sil'); ov.classList.add('named'); top.textContent = '';
        chip.replaceChildren(ev('span', null, o.line || ''));
        if (o.sub) chip.appendChild(ev('b', 'gsub', o.sub));
        try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) { /* ignore */ }
        at(reduced() ? 300 : 1000, () => hint.classList.add('on'));
      }
      function finish() { if (done) return; done = true; timers.forEach(clearTimeout); ov.remove(); resolve(); }
      ov.addEventListener('click', finish);
      if (reduced()) { name(); return; }
      requestAnimationFrame(() => ov.classList.add('in'));
      at(700, () => { a.classList.add('sil'); b.classList.add('sil'); ov.classList.add('gather'); });
      // the flicker: each swap a little quicker than the last
      let t = 1150, gap = 380, show = false;
      while (t < 3350) { const onA = show; at(t, () => { a.classList.toggle('hide', !onA); b.classList.toggle('hide', onA); }); show = !show; t += gap; gap = Math.max(45, gap * 0.8); }
      at(3350, () => { a.classList.add('hide'); b.classList.remove('hide'); ov.classList.add('flash'); });
      at(3750, name);
    });
  }

  ensureStyle(); // tokens (--pl-*) are also used by bars and dots in app.css
  RV.plant = { make, water, leanOnTouch, grow, revive, reveal, evolve, css: CSS, variant, plantSvg, careOf, isDark };
})(window);
