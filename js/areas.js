/* RV app: area shapes (v2.50). Each area can have one shape drawn on the map; a contact whose map point
   (geotag, else the point looked up from its address) falls inside a shape belongs to that area.
   Shapes never overlap: corners snap onto neighbours while drawing, and anything still crossing a
   neighbour is trimmed off the shape being saved (polygon-clipping, vendor/polygon-clipping, loaded on use).
   Stored in settings.areaShapes = [{ id, area, pts: [[lng, lat], ...], holes: [[[lng, lat], ...]], at }]
   so they travel with backups. Pure functions here; the editor is js/areaedit.js. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  const COLORS = ['#3F6B48', '#4F6D8A', '#B4583A', '#B08A2E', '#7A5C8C', '#4E8580'];
  const key = (x) => String(x || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const list = (settings) => ((settings && settings.areaShapes) || []).filter((s) => s && s.area && Array.isArray(s.pts) && s.pts.length >= 3);
  const shapeOf = (settings, area) => list(settings).find((s) => key(s.area) === key(area)) || null;
  const colorOf = (settings, area) => {
    const i = list(settings).findIndex((s) => key(s.area) === key(area));
    return COLORS[(i < 0 ? 0 : i) % COLORS.length];
  };

  // Ray casting in lng/lat (fine at street scale). ring: [[lng, lat], ...], not closed.
  function inRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const inside = (pt, shape) => !!pt && inRing(pt.lng, pt.lat, shape.pts) && !(shape.holes || []).some((h) => inRing(pt.lng, pt.lat, h));
  // The area whose shape holds this point ({lat, lng}), or ''.
  function areaAt(settings, pt) {
    if (!pt) return '';
    const s = list(settings).find((x) => inside(pt, x));
    return s ? s.area : '';
  }

  // Snapping, in screen pixels. p: [x, y]; others: [{ name, px: [[x, y], ...] }]. A corner within cornerR wins,
  // else the nearest point on an edge within edgeR. Returns { x, y, snap: 'corner'|'edge'|'', of }.
  function snap(p, others, cornerR, edgeR) {
    cornerR = cornerR == null ? 22 : cornerR; edgeR = edgeR == null ? 16 : edgeR;
    let best = null, bd = cornerR;
    for (const o of others) for (const c of o.px) {
      const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
      if (d < bd) { bd = d; best = { x: c[0], y: c[1], snap: 'corner', of: o.name }; }
    }
    if (best) return best;
    bd = edgeR;
    for (const o of others) for (let i = 0; i < o.px.length; i++) {
      const a = o.px[i], b = o.px[(i + 1) % o.px.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
      if (!len) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
      const x = a[0] + t * dx, y = a[1] + t * dy, d = Math.hypot(x - p[0], y - p[1]);
      if (d < bd) { bd = d; best = { x, y, snap: 'edge', of: o.name }; }
    }
    return best || { x: p[0], y: p[1], snap: '', of: '' };
  }

  // Shoelace area of a ring (for picking the biggest piece).
  const ringArea = (r) => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const open = (r) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r.slice());
  const close = (r) => r.concat([r[0]]);
  // Cut every other shape out of pts. pc: the polygon-clipping library. Returns
  // { pts, holes, trimmed: [names it crossed], pieces } or null when nothing is left.
  function trim(pts, others, pc) {
    const subject = [close(pts)];
    const crossed = [];
    let result = [subject];
    for (const o of others) {
      const clip = [close(o.pts)].concat((o.holes || []).map(close));
      const next = pc.difference(result, [clip]);
      if (Math.abs(sumArea(next) - sumArea(result)) > 1e-12) crossed.push(o.area);
      result = next;
      if (!result.length) return null;
    }
    // keep the largest piece; its holes are areas it surrounds
    let best = null, ba = -1;
    for (const poly of result) { const a = ringArea(open(poly[0])); if (a > ba) { ba = a; best = poly; } }
    if (!best) return null;
    const outer = open(best[0]);
    if (outer.length < 3) return null;
    return { pts: outer, holes: best.slice(1).map(open), trimmed: crossed, pieces: result.length };
  }
  const sumArea = (mp) => mp.reduce((a, poly) => a + ringArea(open(poly[0])) - poly.slice(1).reduce((b, h) => b + ringArea(open(h)), 0), 0);

  // Who moves when sorting into areas. names: the areas to sort (default every shaped area).
  // rvs: active records. pointOf: rv -> {lat, lng} | null. Returns { move: [{ rv, from, to }], already, outside: [rv], unplaced: [rv] }.
  function moves(settings, rvs, pointOf, names) {
    const shapes = list(settings).filter((s) => !names || names.some((n) => key(n) === key(s.area)));
    const out = { move: [], already: 0, outside: [], unplaced: [] };
    for (const rv of rvs) {
      const pt = pointOf(rv);
      const mine = shapes.find((s) => key(s.area) === key(rv.neighborhood));
      if (!pt) { if (mine) out.unplaced.push(rv); continue; }
      const s = shapes.find((x) => inside(pt, x));
      if (s) {
        if (key(s.area) === key(rv.neighborhood)) out.already++;
        else out.move.push({ rv, from: rv.neighborhood || '', to: s.area });
      } else if (mine && !list(settings).some((x) => inside(pt, x))) out.outside.push(rv);
    }
    return out;
  }

  // Renaming or merging an area carries its shape; merging into an area that has a shape keeps that one.
  function renamed(shapes, from, to) {
    const src = shapes.find((s) => key(s.area) === key(from));
    if (!src) return shapes;
    const dst = shapes.find((s) => s !== src && key(s.area) === key(to));
    if (dst) return shapes.filter((s) => s !== src);
    return shapes.map((s) => (s === src ? Object.assign({}, s, { area: to }) : s));
  }
  const removed = (shapes, area) => shapes.filter((s) => key(s.area) !== key(area));

  // polygon-clipping, loaded once on first use
  let pcP = null;
  function loadClip() {
    if (root.polygonClipping) return Promise.resolve(root.polygonClipping);
    if (pcP) return pcP;
    pcP = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = 'vendor/polygon-clipping/polygon-clipping.umd.min.js'; s.async = true;
      s.onload = () => (root.polygonClipping ? resolve(root.polygonClipping) : reject(new Error('Clipping library missing')));
      s.onerror = () => { pcP = null; reject(new Error('Clipping library could not load')); };
      document.head.appendChild(s);
    });
    return pcP;
  }

  RV.areas = { COLORS, key, list, shapeOf, colorOf, inRing, inside, areaAt, snap, trim, moves, renamed, removed, loadClip, ringArea };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.areas;
})(typeof window !== 'undefined' ? window : globalThis);
