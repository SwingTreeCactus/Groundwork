/* RV app: plant kinds (v2.34). Ten kinds, each revealed at the leafy stage: leafy (form 3), shrub (4) and
   fruiting tree (5) in four care levels (5 lush, 4 healthy, 2 thirsty, 1 wilting). Drawn, not stored, in a natural
   palette with no transparency. viewBox 0 0 60 92 like js/plant.js: soil top at y 69.5, plant base at (30, 70).
   Canvas: "Groundwork plant kinds". Seed and sprout stay shared and are drawn by js/plant.js. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const f = (v) => String(Math.round(v * 100) / 100);
  const rad = (d) => (d * Math.PI) / 180;

  // ---------- palette ----------
  const PAL = {
    forest: '#3E6B4B', leaf: '#5C8C55', spring: '#86A64C', sage: '#93A88C', teal: '#3D6B63', bronze: '#8E6A45',
    pad: '#6E9A5C', palm: '#7F9C4C', vine: '#6A9650', fig: '#46744F', pomleaf: '#6A9448',
    bark: '#6E5242', wood: '#A88262', palmwood: '#A9865C', redstem: '#94503E', cherrybark: '#5E4440',
    apple: '#C8473A', blossom: '#F3D6DA', lemon: '#E5BF45', white: '#F7F2E6', olive: '#4E3B5A', cream: '#E9DFC0',
    figfruit: '#7B4767', pom: '#B9372E', pomflower: '#E0612F', date: '#D8892E', grape: '#5D4A8C',
    petal: '#E8B634', disc: '#5B4030', ppflower: '#EFC23B', ppfruit: '#C23A6E', sakura: '#EEB4C3', sakura2: '#DC8FA6', cherry: '#B4263A',
    fallen: '#A88F6A',
  };
  const STRAW = '#CDBB8C', WILT = '#9E8E79';
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  let DARK = false;
  // care tone: lush as drawn, healthy a touch softer, thirsty yellows and fades, wilting goes brown-grey
  function tone(name, c) {
    let h = PAL[name] || name;
    if (c === 4) h = mix(h, '#EFE8D8', 0.06);
    else if (c === 2) h = mix(h, STRAW, 0.5);
    else if (c === 1) h = mix(h, WILT, 0.7);
    if (DARK) h = mix(h, '#FFFFFF', 0.1);
    return h;
  }

  // ---------- geometry helpers ----------
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
  const stroke = (pts, w, col) => '<path d="' + pathD(pts) + '" stroke="' + col + '" stroke-width="' + w + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  const line = (x1, y1, x2, y2, w, col) => '<path d="M' + f(x1) + ' ' + f(y1) + ' L' + f(x2) + ' ' + f(y2) + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"/>';
  const circ = (x, y, r, col) => '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="' + col + '"/>';
  const ell = (x, y, rx, ry, col, rot) => '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="' + col + '"' + (rot ? ' transform="rotate(' + f(rot) + ' ' + f(x) + ' ' + f(y) + ')"' : '') + '/>';
  const cp = (W, L, a, b, c, d, e) => 'M0 0 C' + f(W * a) + ' ' + f(-L * b) + ' ' + f(W * c) + ' ' + f(-L * d) + ' 0 ' + f(-L * e) + ' C' + f(-W * c) + ' ' + f(-L * d) + ' ' + f(-W * a) + ' ' + f(-L * b) + ' 0 0Z';
  function leafPath(shape, L, W) {
    switch (shape) {
      case 'narrow': return cp(W, L, 0.8, 0.3, 0.6, 0.75, 1);
      case 'point': return cp(W, L, 1.05, 0.25, 0.4, 0.72, 1.05);
      case 'heart': return 'M0 0 C' + f(W * 1.2) + ' ' + f(-L * 0.05) + ' ' + f(W * 1.05) + ' ' + f(-L * 0.75) + ' 0 ' + f(-L) + ' C' + f(-W * 1.05) + ' ' + f(-L * 0.75) + ' ' + f(-W * 1.2) + ' ' + f(-L * 0.05) + ' 0 0Z';
      case 'droop': return cp(W, L, 0.9, 0.2, 0.5, 0.65, 1.1);
      default: return cp(W, L, 0.9, 0.3, 0.6, 0.8, 1);
    }
  }
  function leaf(x, y, ang, L, W, shape, col, vein) {
    let o = '<path d="' + leafPath(shape, L, W) + '" fill="' + col + '"/>';
    if (vein) o += '<path d="M0 -1 L0 ' + f(-L * 0.8) + '" stroke="' + vein + '" stroke-width=".6" fill="none"/>';
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(ang) + ')">' + o + '</g>';
  }
  // fig: three deep lobes; grape: five shallow lobes
  function lobed(x, y, ang, s, col, n) {
    let o = '';
    const lobes = n === 5 ? [[-70, .62], [-35, .85], [0, 1], [35, .85], [70, .62]] : [[-48, .86], [0, 1], [48, .86]];
    lobes.forEach(([a, k]) => { o += '<g transform="rotate(' + a + ')"><path d="' + cp(s * (n === 5 ? .34 : .42), s * k, 1, .3, .7, .8, 1) + '" fill="' + col + '"/></g>'; });
    o += circ(0, -s * 0.25, s * (n === 5 ? .32 : .3), col);
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(ang) + ')">' + o + '</g>';
  }
  // a frond: a tapered arching blade along a curve
  function frond(x, y, ang, L, curl, w, col) {
    const N = 10, pts = []; let a = ang, px = x, py = y;
    for (let i = 0; i <= N; i++) { pts.push([px, py, a]); px += Math.sin(rad(a)) * L / N; py -= Math.cos(rad(a)) * L / N; a += curl / N; }
    const left = [], right = [];
    pts.forEach(([px2, py2, a2], i) => { const t = i / N, hw = w * Math.sin(Math.PI * Math.min(1, t * 1.15 + .05)) * (1 - t * .55); const nx = Math.cos(rad(a2)), ny = Math.sin(rad(a2)); left.push([px2 - nx * hw, py2 - ny * hw]); right.push([px2 + nx * hw, py2 + ny * hw]); });
    const poly = left.concat(right.reverse());
    return '<path d="M' + poly.map((p) => f(p[0]) + ' ' + f(p[1])).join(' L') + 'Z" fill="' + col + '"/>';
  }
  const fiveFlower = (x, y, r, petal, mid) => { let o = ''; for (let p = 0; p < 5; p++) o += circ(x + Math.sin(rad(p * 72)) * r, y - Math.cos(rad(p * 72)) * r, r * .82, petal); return o + circ(x, y, r * .6, mid); };
  const starFlower = (x, y, r, col) => { let o = ''; for (let p = 0; p < 5; p++) o += ell(x + Math.sin(rad(p * 72)) * r * .6, y - Math.cos(rad(p * 72)) * r * .6, r * .35, r * .7, col, p * 72); return o; };
  const fallen = (c) => (c === 1 ? [[8, 89.5], [52, 89.5], [12, 90.6]] : c === 2 ? [[8, 89.5]] : []).map(([x, y]) => ell(x, y, 3.4, 1.4, tone('fallen', 4))).join('');
  const keep = (arr, n) => arr.slice(0, Math.min(arr.length, n));
  const LEAN = { 5: 0, 4: 0, 2: 7, 1: 20 }, DROOP = { 5: -10, 4: 0, 2: 38, 1: 70 }, BEND = { 5: -2, 4: 0, 2: 30, 1: 75 };
  const N4 = (c, a) => a[{ 5: 0, 4: 1, 2: 2, 1: 3 }[c]];
  const wrapLean = (c, inner, k) => '<g transform="rotate(' + f(LEAN[c] * (k == null ? 1 : k)) + ' 30 70)">' + inner + '</g>';
  // a cloud crown: overlapping circles in two tones
  function crown(spots, dark, light) {
    let o = '';
    spots.forEach(([x, y, r]) => { o += circ(x, y + 1.2, r, dark); });
    spots.forEach(([x, y, r]) => { o += circ(x - r * .12, y - r * .12, r * .8, light); });
    return o;
  }
  function sag(spots, c, cx, cy) {
    const k = { 5: 1.08, 4: 1, 2: 0.88, 1: 0.74 }[c], dy = { 5: -1, 4: 0, 2: 4, 1: 9 }[c];
    return spots.map(([x, y, r]) => [cx + (x - cx) * k, cy + (y - cy) * k + dy + (c <= 2 ? Math.abs(x - cx) * 0.18 : 0), r * k]);
  }

  // ---------- the ten kinds ----------
  const K = {};

  // APPLE: rounded oval leaves alternating, round crown, red apples, pink-white blossom
  K.apple = {
    name: 'Apple', rare: false,
    3(c) {
      const k = { 5: 1.08, 4: 1, 2: .94, 1: .86 }[c];
      const sp = spine(24 * k, BEND[c] * .6);
      const [fx, fy] = at(sp, 1);
      const L = spine(16 * k, -34 + BEND[c] * .6, 8, fx, fy), R = spine(16 * k, 30 + BEND[c], 8, fx, fy);
      let o = stroke(sp.pts, 2.6, tone('bark', c)) + stroke(L.pts, 2, tone('bark', c)) + (c > 1 ? stroke(R.pts, 2, tone('bark', c)) : '');
      const lf = (spx, t, s) => { const [x, y, a] = at(spx, t); o += leaf(x, y, s * (55 + DROOP[c]) + a * .5, 8.5 * (c === 5 ? 1.15 : 1), 7.4, 'oval', tone('leaf', c), tone('forest', c)); };
      keep([[sp, .5, -1], [L, .55, -1], [L, 1, 1], [R, .55, 1], [R, 1, -1], [L, 1, -1], [sp, .7, 1]], N4(c, [7, 6, 3, 2])).forEach(([spx, t, s]) => { if (spx === R && c === 1) return; lf(spx, t, s); });
      if (c >= 4) { const [x, y] = at(L, 1); o += fiveFlower(x + 1, y - 3, 1.7, tone('blossom', c), tone('apple', c)); }
      return wrapLean(c, o) + fallen(c);
    },
    4(c) {
      let o = stroke(spine(22, BEND[c] * .2).pts, 3.4, tone('bark', c));
      const S = sag([[30, 34, 11], [19, 40, 9], [41, 40, 9], [23, 30, 8], [37, 30, 8], [30, 46, 8], [16, 47, 6], [44, 47, 6]], c, 30, 42);
      o += crown(keep(S, N4(c, [8, 7, 5, 3])), tone('forest', c), tone('leaf', c));
      const B = [[22, 32], [36, 28], [40, 42], [26, 44], [31, 37], [18, 41], [44, 34]];
      keep(B, N4(c, [7, 5, 0, 0])).forEach(([x, y]) => { o += fiveFlower(x, y, 1.7, tone('blossom', c), tone('apple', c)); });
      if (c === 2) [[24, 40], [37, 38]].forEach(([x, y]) => { o += ell(x, y + 4, 1.4, 2.2, tone('blossom', c)); });
      return wrapLean(c, o, .4) + fallen(c);
    },
    5(c) {
      let o = stroke(spine(34, c <= 2 ? 3 : 0).pts, 4.8, tone('bark', c)) + line(30, 44, 20, 32, 2.6, tone('bark', c)) + line(30, 42, 41, 31, 2.6, tone('bark', c));
      const S = sag([[30, 18, 13], [17, 26, 11], [43, 26, 11], [22, 14, 9], [38, 14, 9], [30, 30, 10], [11, 33, 7], [49, 33, 7]], c, 30, 24);
      o += crown(keep(S, N4(c, [8, 7, 5, 3])), tone('forest', c), tone('leaf', c));
      keep([[22, 22], [37, 20], [30, 31], [16, 31], [44, 30], [27, 13], [41, 11]], N4(c, [7, 5, 2, 0])).forEach(([x, y]) => { o += circ(x, y + (c <= 2 ? 5 : 0), 2.9, tone('apple', c)) + line(x, y - 2.6 + (c <= 2 ? 5 : 0), x + .8, y - 4 + (c <= 2 ? 5 : 0), .9, tone('bark', c)); });
      return o + fallen(c);
    },
  };

  // LEMON: long pointed glossy teal leaves, upright oval crown, yellow lemons, white star flowers
  K.lemon = {
    name: 'Lemon', rare: false,
    3(c) {
      const sp = spine(42 * { 5: 1.1, 4: 1, 2: .94, 1: .86 }[c], BEND[c]);
      let o = stroke(sp.pts, 2.2, tone('bark', c));
      keep([[.22, 1], [.32, -1], [.44, 1], [.56, -1], [.68, 1], [.8, -1], [.9, 1]], N4(c, [7, 6, 3, 2])).forEach(([t, s]) => { const [x, y, a] = at(sp, t); o += leaf(x, y, s * (26 + DROOP[c] * 1.2) + a * .6, 13 * (c === 5 ? 1.12 : 1), 4.2, 'point', tone('teal', c), mix(tone('teal', c), '#FFFFFF', .35)); });
      const [x, y, a] = at(sp, 1); o += leaf(x, y, a, 9, 3.4, 'point', tone('teal', c));
      if (c >= 4) { const [x2, y2] = at(sp, .62); o += starFlower(x2 - 4, y2 + 1, 3.2, tone('white', c)) + circ(x2 - 4, y2 + 1, 1, tone('lemon', c)); }
      return wrapLean(c, o) + fallen(c);
    },
    4(c) {
      let o = stroke(spine(20, BEND[c] * .2).pts, 3.2, tone('bark', c));
      const S = sag([[30, 50, 8], [30, 41, 9.5], [30, 31, 9], [30, 22, 7.5], [23, 45, 7], [37, 45, 7], [24, 34, 7], [36, 34, 7], [30, 15, 5.5]], c, 30, 38);
      o += crown(keep(S, N4(c, [9, 8, 6, 4])), mix(tone('teal', c), '#1E3A35', .25), tone('teal', c));
      keep([[26, 28], [34, 38], [27, 44], [35, 25], [30, 33]], N4(c, [5, 4, 0, 0])).forEach(([x, y]) => { o += starFlower(x, y, 3, tone('white', c)) + circ(x, y, .9, tone('lemon', c)); });
      return wrapLean(c, o, .4) + fallen(c);
    },
    5(c) {
      let o = stroke(spine(24, c <= 2 ? 3 : 0).pts, 4.4, tone('bark', c));
      const S = sag([[30, 46, 10], [30, 35, 12], [30, 23, 12], [30, 11, 9.5], [21, 40, 8.5], [39, 40, 8.5], [21, 27, 8.5], [39, 27, 8.5], [30, 2, 6]], c, 30, 26);
      o += crown(keep(S, N4(c, [9, 8, 6, 4])), mix(tone('teal', c), '#1E3A35', .25), tone('teal', c));
      keep([[23, 32], [37, 25], [31, 41], [24, 18], [38, 40], [32, 14], [26, 45]], N4(c, [7, 5, 2, 0])).forEach(([x, y]) => { o += ell(x, y + (c <= 2 ? 4 : 0), 2.6, 3.4, tone('lemon', c), 18); });
      return o + fallen(c);
    },
  };

  // OLIVE: narrow silver leaves in pairs, gnarled trunk, wide flat silvery crown, dark olives
  K.olive = {
    name: 'Olive', rare: false,
    3(c) {
      const sp = spine(42 * { 5: 1.1, 4: 1, 2: .94, 1: .86 }[c], BEND[c]);
      let o = stroke(sp.pts, 1.8, tone('bark', c));
      keep([.2, .34, .48, .62, .76, .88], N4(c, [6, 5, 3, 2])).forEach((t) => { const [x, y, a] = at(sp, t); [1, -1].forEach((s) => { o += leaf(x, y, s * (55 + DROOP[c]) + a * .6, 11 * (c === 5 ? 1.15 : 1), 2.6, 'narrow', tone('sage', c)); }); });
      const [x, y, a] = at(sp, 1); o += leaf(x, y, a, 8, 2.4, 'narrow', tone('sage', c));
      return wrapLean(c, o) + fallen(c);
    },
    4(c) {
      let o = '';
      [-22, -4, 16].forEach((bend, k) => { if (k === 2 && c === 1) return; const sp = spine(38 - k * 3, bend + BEND[c] * .5, 10); o += stroke(sp.pts, 1.8, tone('bark', c)); keep([.35, .5, .65, .8, .95], N4(c, [5, 4, 3, 2])).forEach((t, i) => { const [x, y, a] = at(sp, t); o += leaf(x, y, (i % 2 ? 1 : -1) * (60 + DROOP[c]) + a, 9.5, 2.4, 'narrow', tone('sage', c)); }); if (c >= 4) { const [x, y] = at(sp, .9); o += circ(x + 2, y - 2, 1.2, tone('cream', c)) + circ(x - 2, y + 1, 1, tone('cream', c)); } });
      return wrapLean(c, o, .4) + fallen(c);
    },
    5(c) {
      const bark = tone('bark', c);
      let o = '<path d="M27 70 C24 60 33 56 31 48 C29 42 24 40 26 34" stroke="' + bark + '" stroke-width="5.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M31 48 C36 44 40 40 42 33" stroke="' + bark + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M28 39 C22 37 17 34 14 30" stroke="' + bark + '" stroke-width="2.8" fill="none" stroke-linecap="round"/>';
      const sil = tone('sage', c), dk = mix(sil, '#3A4A3A', .3);
      const S = sag([[30, 24, 14, 7], [16, 29, 11, 6], [44, 29, 11, 6], [24, 17, 10, 5.5], [38, 18, 10, 5.5], [30, 31, 9, 4.5]], c, 30, 25);
      keep(S, N4(c, [6, 5, 4, 2])).forEach(([x, y, rx], i) => { o += ell(x, y + 1.3, rx, rx * .5, dk) + ell(x - .6, y - .4, rx * .9, rx * .42, sil); });
      keep([[22, 28], [36, 26], [29, 32], [18, 33], [42, 33], [33, 20], [25, 21]], N4(c, [7, 5, 2, 0])).forEach(([x, y]) => { o += ell(x, y + (c <= 2 ? 4 : 1.5), 1.5, 2.1, tone('olive', c)); });
      return o + fallen(c);
    },
  };

  // FIG: big three-lobed leaves, broad low spreading crown, purple teardrop figs
  K.fig = {
    name: 'Fig', rare: false,
    3(c) {
      const sp = spine(28 * { 5: 1.1, 4: 1, 2: .94, 1: .86 }[c], BEND[c]);
      let o = stroke(sp.pts, 3, tone('bark', c));
      const [x, y, a] = at(sp, 1);
      keep([[-42, 13], [42, 13], [0, 15], [-75, 10]], N4(c, [4, 3, 2, 1])).forEach(([ang, s], i) => { o += lobed(x, y + (i === 3 ? 10 : 0), a + ang + (ang <= 0 ? -1 : 1) * DROOP[c] * .7, s * (c === 5 ? 1.15 : 1), tone('fig', c), 3); });
      return wrapLean(c, o) + fallen(c);
    },
    4(c) {
      let o = '';
      [-30, 0, 30].forEach((b) => { o += stroke(spine(26, b * .9 + BEND[c] * .3, 8).pts, 2.6, tone('bark', c)); });
      keep([[12, 46, -55, 13], [48, 46, 55, 13], [20, 35, -25, 13], [40, 35, 25, 13], [30, 30, 0, 14], [8, 56, -80, 10], [52, 56, 80, 10]], N4(c, [7, 6, 4, 2])).forEach(([x, y, ang, s]) => { o += lobed(x, y + (c <= 2 ? 6 : 0), ang + (ang <= 0 ? -1 : 1) * DROOP[c] * .6, s * (c === 5 ? 1.12 : 1), tone('fig', c), 3); });
      if (c >= 4) [[25, 44], [36, 44]].forEach(([x, y]) => { o += ell(x, y, 2, 2.6, tone('spring', c)); });
      return wrapLean(c, o, .3) + fallen(c);
    },
    5(c) {
      const bark = tone('bark', c);
      let o = stroke(spine(22, 0).pts, 5, bark) + line(30, 50, 12, 36, 3, bark) + line(30, 50, 48, 36, 3, bark) + line(30, 50, 30, 30, 3, bark);
      const L = keep([[6, 34, -70, 12], [54, 34, 70, 12], [15, 26, -40, 13], [45, 26, 40, 13], [30, 20, 0, 14], [22, 34, -15, 12], [38, 34, 15, 12], [2, 44, -95, 9], [58, 44, 95, 9]], N4(c, [9, 8, 6, 3]));
      L.forEach(([x, y, ang, s]) => { o += lobed(x, y + (c <= 2 ? 5 : 0), ang + (ang <= 0 ? -1 : 1) * DROOP[c] * .4, s * (c === 5 ? 1.12 : 1), tone('fig', c), 3); });
      keep([[17, 36], [43, 36], [30, 32], [24, 40], [37, 41], [10, 40]], N4(c, [6, 4, 2, 0])).forEach(([x, y]) => { o += '<path d="M0 -3.6 C1.4 -3.6 1.4 -1.4 2.6 .4 C3.4 2 2.2 3.4 0 3.4 C-2.2 3.4 -3.4 2 -2.6 .4 C-1.4 -1.4 -1.4 -3.6 0 -3.6Z" fill="' + tone('figfruit', c) + '" transform="translate(' + f(x) + ' ' + f(y + (c <= 2 ? 5 : 0)) + ')"/>'; });
      return o + fallen(c);
    },
  };

  // POMEGRANATE: red-brown stems, many small leaves, vase shape, orange trumpet flowers, crowned red fruit
  K.pomegranate = {
    name: 'Pomegranate', rare: false,
    3(c) {
      const sp = spine(40 * { 5: 1.1, 4: 1, 2: .94, 1: .86 }[c], BEND[c]);
      const tws = [[.35, -46], [.55, 42], [.72, -38]].map(([t, b]) => { const [x, y] = at(sp, t); return spine(14, b + BEND[c] * .5, 6, x, y); });
      let o = stroke(sp.pts, 2, tone('redstem', c));
      const sm = (spx, ts) => ts.forEach((t, i) => { const [x, y, a] = at(spx, t); o += leaf(x, y, (i % 2 ? 1 : -1) * (50 + DROOP[c]) + a, 5.5, 2.4, 'narrow', tone('pomleaf', c)); });
      keep(tws, N4(c, [3, 3, 2, 1])).forEach((tw) => { o += stroke(tw.pts, 1.5, tone('redstem', c)); sm(tw, keep([.5, .75, 1, 1], N4(c, [4, 3, 2, 1]))); });
      sm(sp, keep([.2, .45, .62, .85, .95], N4(c, [5, 4, 3, 2])));
      if (c >= 4) { const [x, y, a] = at(sp, 1); o += '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(a) + ')"><path d="M-1.8 1 L-3 -4.4 L-1 -3.2 L0 -5.4 L1 -3.2 L3 -4.4 L1.8 1Z" fill="' + tone('pomflower', c) + '"/></g>'; }
      return wrapLean(c, o) + fallen(c);
    },
    4(c) {
      let o = '';
      [-24, -8, 8, 24].forEach((b, k) => { if (c === 1 && k % 2) return; const sp = spine(40 - Math.abs(b) * .3, b + BEND[c] * .5, 10); o += stroke(sp.pts, 1.7, tone('redstem', c)); keep([.35, .45, .55, .65, .75, .85], N4(c, [6, 5, 3, 2])).forEach((t, i) => { const [x, y, a] = at(sp, t); o += leaf(x, y, (i % 2 ? 1 : -1) * (55 + DROOP[c]) + a, 6, 2.4, 'narrow', tone('pomleaf', c)); });
        const [x, y, a] = at(sp, 1);
        if (c >= 4) o += '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(a) + ')"><path d="M-2 1 L-3.4 -5 L-1.2 -3.6 L0 -6 L1.2 -3.6 L3.4 -5 L2 1Z" fill="' + tone('pomflower', c) + '"/></g>';
        else o += ell(x, y, 1.4, 2.2, tone('pomflower', c), a + 180); });
      return wrapLean(c, o, .4) + fallen(c);
    },
    5(c) {
      let o = '';
      const bk = tone('redstem', c);
      const tops = [[-58, 40], [-20, 46], [20, 44], [58, 40]].map(([b, L]) => { const sp = spine(L, b * .9 + BEND[c] * .2, 8); o += stroke(sp.pts, 2.2, bk); return at(sp, 1); });
      const S = [];
      tops.forEach(([x, y]) => { S.push([x, y, 6.5], [x - 4, y + 5, 4.8], [x + 4, y + 5, 4.8]); });
      keep(sag(S, c, 30, 30), N4(c, [12, 12, 8, 4])).forEach(([x, y, r]) => { o += circ(x, y + 1, r, mix(tone('pomleaf', c), '#2C4A2A', .3)) + circ(x - .7, y - .6, r * .76, tone('pomleaf', c)); });
      keep([[tops[0][0] + 1, tops[0][1] + 9], [tops[3][0] - 1, tops[3][1] + 9], [tops[1][0] + 3, tops[1][1] + 8], [tops[2][0] - 3, tops[2][1] + 9], [tops[1][0] - 5, tops[1][1] + 2]], N4(c, [5, 4, 2, 0])).forEach(([x, y]) => { const yy = y + (c <= 2 ? 5 : 0); o += circ(x, yy, 3.6, tone('pom', c)) + '<path d="M' + f(x - 1.7) + ' ' + f(yy - 2.8) + ' L' + f(x - 1.3) + ' ' + f(yy - 4.8) + ' L' + f(x) + ' ' + f(yy - 3.2) + ' L' + f(x + 1.3) + ' ' + f(yy - 4.8) + ' L' + f(x + 1.7) + ' ' + f(yy - 2.8) + 'Z" fill="' + tone('pom', c) + '"/>'; });
      if (c >= 4) { const [x, y] = tops[2]; o += '<g transform="translate(' + f(x + 3) + ' ' + f(y - 6) + ')"><path d="M-1.8 1 L-3 -4.4 L-1 -3.2 L0 -5.4 L1 -3.2 L3 -4.4 L1.8 1Z" fill="' + tone('pomflower', c) + '"/></g>'; }
      return o + fallen(c);
    },
  };

  // DATE PALM: long arching blades from the base, a fat trunk, a tall diamond trunk with a frond crown and date clusters
  K.date = {
    name: 'Date palm', rare: false,
    3(c) {
      let o = '';
      keep([[-30, -26], [26, 24], [-8, -14], [10, 16], [-48, -30]], N4(c, [5, 4, 3, 2])).forEach(([a, curl]) => { o += frond(30, 70, a + Math.sign(a || 1) * DROOP[c] * .5, 36 * (c === 5 ? 1.12 : 1) * (c <= 2 ? .88 : 1), curl - Math.sign(a || 1) * DROOP[c] * .4 + (c <= 2 ? Math.sign(a || 1) * 40 : 0), 3, tone('palm', c)); });
      return wrapLean(c, o, .5) + fallen(c);
    },
    4(c) {
      const wd = tone('palmwood', c);
      let o = ell(30, 62, 6.5, 9, wd);
      [[26, 57], [33, 60], [28, 66], [32, 54]].forEach(([x, y]) => { o += '<path d="M' + (x - 2) + ' ' + y + ' L' + x + ' ' + (y - 2) + ' L' + (x + 2) + ' ' + y + '" stroke="' + mix(wd, '#5A4330', .4) + '" stroke-width=".8" fill="none"/>'; });
      keep([[-62, -30], [62, 30], [-34, -34], [34, 34], [-10, -24], [12, 26], [-85, -20], [85, 20]], N4(c, [8, 7, 5, 3])).forEach(([a, curl]) => { const s = Math.sign(a); o += frond(30, 54, a + s * DROOP[c] * .6, 30 * (c === 5 ? 1.12 : 1), curl + s * (c <= 2 ? 60 : 0), 3.6, tone('palm', c)); });
      return wrapLean(c, o, .3) + fallen(c);
    },
    5(c) {
      const wd = tone('palmwood', c);
      const sp = spine(54, 6, 12);
      let o = stroke(sp.pts, 5.6, wd);
      for (let t = .1; t < .95; t += .12) { const [x, y] = at(sp, t); o += '<path d="M' + f(x - 2.6) + ' ' + f(y) + ' L' + f(x) + ' ' + f(y - 2) + ' L' + f(x + 2.6) + ' ' + f(y) + '" stroke="' + mix(wd, '#5A4330', .45) + '" stroke-width=".9" fill="none"/>'; }
      const [hx, hy] = at(sp, 1);
      keep([[-70, -36], [70, 36], [-40, -40], [40, 40], [-12, -30], [14, 30], [-100, -24], [100, 24]], N4(c, [8, 7, 5, 3])).forEach(([a, curl]) => { const s = Math.sign(a); o += frond(hx, hy, a + s * DROOP[c] * .5, 26 * (c === 5 ? 1.1 : 1), curl + s * (c <= 2 ? 55 : 0), 3.2, tone('palm', c)); });
      keep([[-6, 6], [6, 6], [0, 9]], N4(c, [3, 2, 1, 0])).forEach(([dx, dy]) => { for (let k = 0; k < 6; k++) o += circ(hx + dx + (k % 3 - 1) * 1.6, hy + dy + Math.floor(k / 3) * 1.8, 1.1, tone('date', c)); });
      return o + fallen(c);
    },
  };

  // GRAPEVINE: a vine on a stake (leafy), on a small arch (shrub), over a pergola with purple clusters (tree)
  K.grape = {
    name: 'Grapevine', rare: false,
    3(c) {
      const wd = tone('wood', 4);
      let o = line(36, 70, 36, 28, 2.2, wd);
      const vine = [[30, 70], [34, 62], [38, 55], [34, 48], [37, 40], [35, 33]];
      o += stroke(vine.slice(0, c >= 4 ? 6 : c === 2 ? 5 : 4), 1.8, tone('bark', c));
      keep([[34, 62, -60], [38, 55, 60], [34, 48, -55], [37, 40, 55], [35, 33, 0]], N4(c, [5, 4, 3, 2])).forEach(([x, y, a]) => { o += lobed(x, y, a + Math.sign(a || 1) * DROOP[c] * .8, 8.5 * (c === 5 ? 1.15 : 1), tone('vine', c), 5); });
      if (c >= 4) o += '<path d="M37 40 C42 38 43 33 40 32 C38 31.5 38 34 40 34" stroke="' + tone('vine', c) + '" stroke-width=".9" fill="none"/>';
      return wrapLean(c, o, .3) + fallen(c);
    },
    4(c) {
      const wd = tone('wood', 4);
      let o = line(14, 70, 14, 34, 2.4, wd) + line(46, 70, 46, 34, 2.4, wd) + '<path d="M14 34 C14 22 46 22 46 34" stroke="' + wd + '" stroke-width="2.4" fill="none"/>';
      o += stroke([[30, 70], [22, 58], [16, 46], [17, 32], [24, 25], [33, 24], [41, 28], [45, 38], [44, 48]], 1.8, tone('bark', c));
      keep([[16, 50, -70], [17, 38, -40], [21, 28, -20], [30, 24, 0], [39, 27, 25], [45, 36, 50], [44, 46, 75], [26, 23, -10]], N4(c, [8, 7, 5, 3])).forEach(([x, y, a]) => { o += lobed(x, y + (c <= 2 ? 3 : 0), a + Math.sign(a || 1) * DROOP[c] * .7, 7.5 * (c === 5 ? 1.12 : 1), tone('vine', c), 5); });
      if (c >= 4) [[24, 32], [36, 31]].forEach(([x, y]) => { for (let k = 0; k < 3; k++) o += circ(x + (k - 1) * 1.2, y + k * .8, .9, tone('spring', c)); });
      return o + fallen(c);
    },
    5(c) {
      const wd = tone('wood', 4);
      let o = line(8, 70, 8, 22, 2.8, wd) + line(52, 70, 52, 22, 2.8, wd) + line(0, 22, 60, 22, 3, wd);
      o += stroke([[30, 70], [28, 50], [30, 34], [26, 24]], 3.2, tone('bark', c)) + stroke([[30, 34], [38, 26], [46, 22]], 2.2, tone('bark', c));
      keep([[4, 18, -30], [13, 15, -10], [22, 13, 0], [31, 13, 0], [40, 14, 10], [49, 16, 25], [57, 19, 45], [26, 20, -40], [36, 20, 40], [-2, 22, -70], [62, 22, 70]], N4(c, [11, 10, 7, 4])).forEach(([x, y, a]) => { o += lobed(x, y + (c <= 2 ? 4 : 0), a + Math.sign(a || 1) * DROOP[c] * .4, 8 * (c === 5 ? 1.1 : 1), tone('vine', c), 5); });
      keep([[16, 26], [44, 26], [30, 27], [22, 25], [38, 25]], N4(c, [5, 4, 2, 0])).forEach(([x, y]) => { const yy = y + (c <= 2 ? 3 : 0); [[0, 0], [-1.5, 0], [1.5, 0], [-.75, 1.6], [.75, 1.6], [0, 3.2], [-1.5, -1.6], [1.5, -1.6]].slice(0, c === 5 ? 8 : 6).forEach(([dx, dy]) => { o += circ(x + dx, yy + dy + 1.6, 1.15, tone('grape', c)); }); });
      return o + fallen(c);
    },
  };

  // SUNFLOWER: thick stalk, big heart leaves, a yellow head that bows when thirsty
  function sunHead(x, y, r, c, ang) {
    let o = '';
    const n = { 5: 16, 4: 14, 2: 9, 1: 4 }[c];
    for (let k = 0; k < n; k++) o += ell(0, -r * 1.05, r * .26, r * .52, tone('petal', c), k * 360 / n);
    o += circ(0, 0, r * .62, tone('disc', c));
    if (r > 6) for (let k = 0; k < 9; k++) o += circ(Math.cos(k * 2.4) * r * .38 * Math.sqrt(k / 9), Math.sin(k * 2.4) * r * .38 * Math.sqrt(k / 9), .55, mix(tone('disc', c), '#E8D9A8', .35));
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(ang) + ') scale(1 ' + (c <= 2 ? .8 : 1) + ')">' + o + '</g>';
  }
  K.sunflower = {
    name: 'Sunflower', rare: false,
    3(c) {
      const sp = spine(38 * { 5: 1.1, 4: 1, 2: .94, 1: .86 }[c], BEND[c]);
      let o = stroke(sp.pts, 3.2, tone('spring', c));
      keep([[.25, 1], [.25, -1], [.5, 1], [.5, -1], [.74, 1], [.74, -1]], N4(c, [6, 5, 3, 2])).forEach(([t, s]) => { const [x, y, a] = at(sp, t); o += leaf(x, y, s * (70 + DROOP[c]) + a * .5, 12 * (c === 5 ? 1.15 : 1) * (1 - t * .25), 8.5 * (1 - t * .25), 'heart', tone('leaf', c), tone('forest', c)); });
      const [x, y, a] = at(sp, 1); o += circ(x, y - 1.5, 2.6, tone('spring', c)) + leaf(x, y, a - 30, 5, 3, 'point', tone('leaf', c)) + leaf(x, y, a + 30, 5, 3, 'point', tone('leaf', c));
      return wrapLean(c, o) + fallen(c);
    },
    4(c) {
      const sp = spine(52 * { 5: 1.05, 4: 1, 2: .94, 1: .86 }[c], BEND[c] * .8);
      let o = stroke(sp.pts, 3.4, tone('spring', c));
      keep([[.2, 1], [.2, -1], [.42, 1], [.42, -1], [.64, 1], [.64, -1]], N4(c, [6, 5, 3, 2])).forEach(([t, s]) => { const [x, y, a] = at(sp, t); o += leaf(x, y, s * (72 + DROOP[c]) + a * .5, 12 * (1 - t * .3), 9 * (1 - t * .3), 'heart', tone('leaf', c), tone('forest', c)); });
      const [x, y, a] = at(sp, 1); o += sunHead(x, y - 3, 6, c, a + { 5: -10, 4: 0, 2: 60, 1: 120 }[c]);
      return wrapLean(c, o, .5) + fallen(c);
    },
    5(c) {
      const sp = spine(62, { 5: 0, 4: 0, 2: 18, 1: 50 }[c]);
      const sp2 = spine(30, -30 + BEND[c] * .4, 8, at(sp, .4)[0], at(sp, .4)[1]);
      let o = stroke(sp.pts, 4, tone('spring', c)) + stroke(sp2.pts, 2.6, tone('spring', c));
      keep([[.14, 1], [.14, -1], [.3, 1], [.52, -1], [.68, 1], [.82, -1]], N4(c, [6, 5, 3, 2])).forEach(([t, s]) => { const [x, y, a] = at(sp, t); o += leaf(x, y, s * (74 + DROOP[c]) + a * .5, 13 * (1 - t * .3), 10 * (1 - t * .3), 'heart', tone('leaf', c), tone('forest', c)); });
      const [x2, y2, a2] = at(sp2, 1); o += sunHead(x2, y2 - 2, 6, c, a2 + { 5: -10, 4: 0, 2: 60, 1: 120 }[c]);
      const [x, y, a] = at(sp, 1); o += sunHead(x, y - 5, 11, c, a + { 5: 0, 4: 0, 2: 55, 1: 110 }[c]);
      return o + fallen(c);
    },
  };

  // PRICKLY PEAR (rare): paddle pads with spine dots, yellow flowers, magenta fruit
  function pad(x, y, rx, ry, ang, c, dots) {
    const col = tone('pad', c), w = c === 2 ? .82 : c === 1 ? .7 : 1;
    let o = '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(ang) + ')">' + ell(0, -ry, rx * w, ry, col);
    if (c <= 2) o += '<path d="M' + f(-rx * w * .4) + ' ' + f(-ry * 1.5) + ' Q0 ' + f(-ry * 1.2) + ' ' + f(rx * w * .3) + ' ' + f(-ry * .5) + '" stroke="' + mix(col, '#3A4A2A', .3) + '" stroke-width=".7" fill="none"/>';
    if (dots !== false) [[-.4, .5], [.35, .8], [-.2, 1.3], [.3, 1.5], [0, .9], [-.45, 1.05]].forEach(([dx, dy]) => { o += circ(dx * rx * w, -dy * ry, .5, mix(col, '#F4EEDC', .55)); });
    return o + '</g>';
  }
  K.pricklypear = {
    name: 'Prickly pear', rare: true,
    3(c) {
      const t = { 5: 0, 4: 0, 2: 12, 1: 40 }[c];
      let o = pad(30, 70, 7 * (c === 5 ? 1.1 : 1), 10, t * .5, c) + pad(30 + Math.sin(rad(t)) * 18, 70 - Math.cos(rad(t)) * 18, 5.5, 8, 18 + t * 1.6, c);
      if (c >= 4) o += pad(25, 57, 4.5, 6.5, -40, c, false);
      if (c === 1) o += pad(12, 90, 4, 6, -95, c, false);
      return o;
    },
    4(c) {
      const s = { 5: 1, 4: 1, 2: 1.5, 1: 3 }[c];
      let o = pad(30, 70, 7.5, 11, 0, c);
      const P = [[24, 52, -32, 6, 9], [36, 51, 30, 6, 9], [19, 40, -55, 5, 7.5], [41, 39, 52, 5, 7.5], [30, 48, 4, 5.5, 8.5]];
      keep(P, N4(c, [5, 5, 4, 3])).forEach(([x, y, a, rx, ry]) => { o += pad(30 + (x - 30) * (1 + (s - 1) * .25), y + (s - 1) * 4, rx, ry, a * s, c); });
      if (c >= 4) [[22, 34], [38, 34], [30, 31]].forEach(([x, y]) => { o += fiveFlower(x, y, 1.9, tone('ppflower', c), mix(tone('ppflower', c), '#B7791F', .5)); });
      if (c === 1) o += pad(10, 90, 4.5, 6.5, -95, c, false);
      return o;
    },
    5(c) {
      const s = { 5: 1, 4: 1, 2: 1.35, 1: 2.2 }[c];
      let o = line(30, 70, 30, 54, 6, tone('bark', c)) + pad(30, 56, 8, 11, 0, c);
      const P = [[22, 36, -34, 7, 10], [38, 36, 34, 7, 10], [30, 30, 0, 7, 10.5], [14, 24, -50, 6, 8.5], [46, 24, 50, 6, 8.5], [24, 14, -14, 6, 8.5], [36, 14, 14, 6, 8.5], [8, 14, -70, 5, 7]];
      keep(P, N4(c, [8, 8, 6, 4])).forEach(([x, y, a, rx, ry]) => { o += pad(30 + (x - 30) * (1 + (s - 1) * .3), y + (s - 1) * 6, rx, ry, a * s, c); });
      keep([[17, 6], [43, 6], [28, -3], [10, 4], [33, -2], [48, 16]], N4(c, [6, 4, 2, 0])).forEach(([x, y]) => { o += ell(30 + (x - 30) * (1 + (s - 1) * .3), y + (s - 1) * 8, 1.9, 2.8, tone('ppfruit', c)); });
      if (c === 1) o += pad(10, 90, 4.5, 6.5, -95, c, false);
      return o;
    },
  };

  // CHERRY BLOSSOM (rare): bronze young leaves, a pink blossom bush, a dark-barked umbrella tree with cherries
  K.cherry = {
    name: 'Cherry', rare: true,
    3(c) {
      const sp = spine(40 * { 5: 1.1, 4: 1, 2: .94, 1: .86 }[c], BEND[c]);
      let o = stroke(sp.pts, 2.1, tone('cherrybark', c));
      keep([[.24, 1], [.36, -1], [.48, 1], [.6, -1], [.72, 1], [.84, -1]], N4(c, [6, 5, 3, 2])).forEach(([t, s]) => { const [x, y, a] = at(sp, t); o += leaf(x, y, s * (95 + DROOP[c] * .6) + a * .5, 11.5 * (c === 5 ? 1.15 : 1), 4.4, 'droop', tone('bronze', c), mix(tone('bronze', c), '#F4E3D0', .35)); });
      const [x, y, a] = at(sp, 1); o += leaf(x, y, a, 7, 3, 'droop', tone('bronze', c));
      return wrapLean(c, o) + fallen(c);
    },
    4(c) {
      let o = stroke(spine(18, 0).pts, 3, tone('cherrybark', c)) + line(30, 56, 18, 46, 2, tone('cherrybark', c)) + line(30, 54, 43, 45, 2, tone('cherrybark', c));
      const S = sag([[30, 38, 9], [18, 43, 8], [42, 43, 8], [23, 33, 7], [37, 33, 7], [12, 48, 5.5], [48, 48, 5.5], [30, 46, 7]], c, 30, 41);
      const pk = tone('sakura', c), pk2 = tone('sakura2', c);
      keep(S, N4(c, [8, 7, 5, 3])).forEach(([x, y, r]) => { o += circ(x, y + 1, r, pk2) + circ(x - .6, y - .7, r * .78, pk); });
      if (c >= 4) [[24, 38], [35, 36], [30, 44], [19, 44], [41, 45]].forEach(([x, y]) => { o += circ(x, y, 1, tone('white', c)); });
      return wrapLean(c, o, .4) + fallen(c);
    },
    5(c) {
      const bk = tone('cherrybark', c);
      let o = stroke(spine(26, 0).pts, 4.6, bk) + '<path d="M30 46 C24 40 16 36 6 34" stroke="' + bk + '" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M30 46 C36 40 44 36 54 34" stroke="' + bk + '" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M30 46 L30 30" stroke="' + bk + '" stroke-width="2.6" stroke-linecap="round"/>';
      [[26, 61], [34, 56], [27, 51]].forEach(([x, y]) => { o += line(x, y, x + 2.4, y, .7, mix(bk, '#C9B6A8', .5)); });
      const S = sag([[30, 24, 10], [17, 28, 9.5], [43, 28, 9.5], [6, 32, 7], [54, 32, 7], [23, 19, 8], [37, 19, 8], [30, 31, 7], [11, 25, 6], [49, 25, 6]], c, 30, 26);
      const pk = tone('sakura', c), pk2 = tone('sakura2', c);
      keep(S, N4(c, [10, 9, 6, 3])).forEach(([x, y, r]) => { o += circ(x, y + 1, r, pk2) + circ(x - .6, y - .7, r * .8, pk); });
      keep([[16, 36], [44, 36], [30, 38], [23, 33], [37, 33], [8, 38]], N4(c, [6, 4, 2, 0])).forEach(([x, y]) => { const yy = y + (c <= 2 ? 5 : 0); o += '<path d="M' + f(x) + ' ' + f(yy - 4) + ' L' + f(x - 1.6) + ' ' + f(yy) + ' M' + f(x) + ' ' + f(yy - 4) + ' L' + f(x + 1.6) + ' ' + f(yy) + '" stroke="' + mix(bk, '#7A9A50', .5) + '" stroke-width=".6" fill="none"/>' + circ(x - 1.6, yy + 1.2, 1.6, tone('cherry', c)) + circ(x + 1.6, yy + 1.2, 1.6, tone('cherry', c)); });
      return o + fallen(c);
    },
  };

  const ORDER = ['apple', 'lemon', 'olive', 'fig', 'pomegranate', 'date', 'grape', 'sunflower', 'pricklypear', 'cherry'];
  // shrub flowers (one per chain of three conversations) and study fruit buds, in each kind's own colours
  const FLOWER = { apple: 'blossom', lemon: 'white', olive: 'cream', fig: 'spring', pomegranate: 'pomflower', date: 'date', grape: 'spring', sunflower: 'petal', pricklypear: 'ppflower', cherry: 'white' };
  const FRUIT = { apple: 'apple', lemon: 'lemon', olive: 'olive', fig: 'figfruit', pomegranate: 'pom', date: 'date', grape: 'grape', sunflower: 'disc', pricklypear: 'ppfruit', cherry: 'cherry' };
  const FPOS = [[19, 47], [41, 45], [25, 35], [36, 31], [30, 52]];
  const BPOS = [[24, 52], [37, 49], [30, 42]];
  function extras(kind, care, flowers, buds) {
    let o = '';
    for (let k = 0; k < Math.min(5, flowers || 0); k++) {
      const [x, y] = FPOS[k];
      o += care >= 4 ? fiveFlower(x, y, 1.6, tone(FLOWER[kind], care), tone(FRUIT[kind], care)) : ell(x, y + 1, 1.3, 2.1, tone(FLOWER[kind], care));
    }
    if (care >= 4) for (let k = 0; k < Math.min(3, buds || 0); k++) { const [x, y] = BPOS[k]; o += circ(x, y, 2.3, tone(FRUIT[kind], care)); }
    return o;
  }
  // one kind at one form (3..5) and care; o.dark uses the dark-mode set; o.sil paints everything one colour
  function svg(kind, form, care, o) {
    o = o || {};
    if (!K[kind] || !K[kind][form]) return '';
    DARK = !!o.dark;
    let body = K[kind][form](care) + (form === 4 ? extras(kind, care, o.flowers, o.buds) : '');
    DARK = false;
    if (o.sil) body = body.replace(/(fill|stroke)="#[0-9a-fA-F]{6}"/g, (m, k) => k + '="' + o.sil + '"');
    return body;
  }
  const NAMES = { apple: ['Apple', 'an apple tree'], lemon: ['Lemon', 'a lemon tree'], olive: ['Olive', 'an olive tree'], fig: ['Fig', 'a fig tree'],
    pomegranate: ['Pomegranate', 'a pomegranate'], date: ['Date palm', 'a date palm'], grape: ['Grapevine', 'a grapevine'], sunflower: ['Sunflower', 'a sunflower'],
    pricklypear: ['Prickly pear', 'a prickly pear'], cherry: ['Cherry', 'a cherry tree'] };
  const name = (kind) => (NAMES[kind] || [''])[0];
  const revealLine = (kind) => (NAMES[kind] ? 'It\u2019s ' + NAMES[kind][1] + '!' : '');
  RV.kinds = { K, ORDER, svg, tone, mix, name, line: revealLine, has: (kind) => !!K[kind] };
})(window);
