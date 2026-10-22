/* RV app: the garden map (v2.18). Every RV's plant standing where they live, on OpenStreetMap data
   (OpenFreeMap vector tiles) drawn by MapLibre in Groundwork colours. Geotagged records sit at their exact
   spot; the rest are placed once from their saved address (dashed ring). Directions hand off to Google
   or Apple Maps. Needs a connection for the streets; MapLibre itself is bundled in vendor/maplibre. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
  const LIB_JS = 'vendor/maplibre/maplibre-gl.js', LIB_CSS = 'vendor/maplibre/maplibre-gl.css';

  // Groundwork colours for the base map. Light and dark.
  const THEMES = {
    light: { bg: '#EFEAE0', water: '#CFE0F2', park: '#D9E7CF', land: '#ECE6DA', building: '#E5DED2', road: '#FFFFFF', roadCase: '#D9D0E6', minor: '#F8F6F1', rail: '#D6D0DF', text: '#6A5E86', halo: '#EFEAE0', boundary: '#C9C2D3', plot: '#E4DAF2', plotLine: '#B9A7DA' },
    dark: { bg: '#1C1A22', water: '#22304A', park: '#1F2A1E', land: '#201E26', building: '#26232D', road: '#3A3644', roadCase: '#2B2833', minor: '#302D38', rail: '#34303E', text: '#B7ADCF', halo: '#1C1A22', boundary: '#3E3A48', plot: '#2E2740', plotLine: '#5C4E80' },
  };
  // Restyle any OpenMapTiles-schema style: our colours, shops and bus stops hidden, street names kept.
  function restyle(style, dark) {
    const c = THEMES[dark ? 'dark' : 'light'];
    const out = JSON.parse(JSON.stringify(style));
    out.layers = (out.layers || []).filter((l) => !/^(poi|aerodrome|airport|building)/.test(l['source-layer'] || '') && !/poi|housenumber|aeroway|building/i.test(l.id));
    for (const l of out.layers) {
      const id = l.id.toLowerCase(), sl = (l['source-layer'] || '').toLowerCase();
      l.paint = l.paint || {};
      if (l.type === 'background') { l.paint['background-color'] = c.bg; continue; }
      if (l.type === 'fill' || l.type === 'fill-extrusion') {
        const key = l.type === 'fill' ? 'fill-color' : 'fill-extrusion-color';
        if (sl === 'water' || id.includes('water')) l.paint[key] = c.water;
        else if (/park|wood|grass|landcover|green|forest|scrub|cemetery/.test(id + sl)) l.paint[key] = c.park;
        else if (sl === 'building' || id.includes('building')) l.paint[key] = c.building;
        else l.paint[key] = c.land;
        if (l.type === 'fill') delete l.paint['fill-outline-color'];
        if (l.type === 'fill-extrusion') { l.type = 'fill'; l.paint = { 'fill-color': c.building }; }
        continue;
      }
      if (l.type === 'line') {
        if (sl === 'water' || sl === 'waterway' || id.includes('water')) l.paint['line-color'] = c.water;
        else if (sl === 'transportation') {
          if (/rail|transit/.test(id)) l.paint['line-color'] = c.rail;
          else if (/casing|outline/.test(id)) l.paint['line-color'] = c.roadCase;
          else if (/minor|service|path|track|pedestrian/.test(id)) l.paint['line-color'] = c.minor;
          else l.paint['line-color'] = c.road;
        } else if (sl === 'boundary') l.paint['line-color'] = c.boundary;
        else l.paint['line-color'] = c.roadCase;
        continue;
      }
      if (l.type === 'symbol') {
        l.paint['text-color'] = c.text; l.paint['text-halo-color'] = c.halo; l.paint['text-halo-width'] = 1.2;
        delete l.paint['icon-color'];
      }
    }
    return out;
  }

  // Load MapLibre once, on first use.
  let libP = null;
  function loadLib() {
    if (root.maplibregl) return Promise.resolve(root.maplibregl);
    if (libP) return libP;
    libP = new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LIB_CSS; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = LIB_JS; s.async = true;
      s.onload = () => (root.maplibregl ? resolve(root.maplibregl) : reject(new Error('Map library missing')));
      s.onerror = () => { libP = null; reject(new Error('Map library could not load')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  let styleCache = null;
  async function baseStyle() {
    if (styleCache) return styleCache;
    const r = await fetch(STYLE_URL, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Map style unavailable');
    styleCache = await r.json();
    return styleCache;
  }
  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t === 'dark' || (t !== 'light' && root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
  };

  // Look up addresses for records that have no geotag, one a second (OpenStreetMap's limit), while the map is open.
  let queueRunning = false;
  async function placeMissing(onPlaced, isOpen) {
    if (queueRunning) return;
    queueRunning = true;
    try {
      const ST = RV.store, GEO = RV.geo;
      const live = () => ST.S.rvs.filter((r) => !r.deletedAt && !RV.logic.isClosed(ST.S.settings, r));
      const near = GEO.centerOf(live());
      for (const rv of live().filter(GEO.needsLookup)) {
        if (!isOpen()) break;
        const pt = await GEO.forward(rv.address, near);
        if (pt === undefined) break; // offline or service trouble: try again next time
        const cur = ST.rvById(rv.id);
        if (!cur || GEO.addrKey(cur) !== GEO.addrKey(rv)) continue;
        cur.approx = pt ? { q: GEO.addrKey(rv), lat: pt.lat, lng: pt.lng } : { q: GEO.addrKey(rv), fail: true };
        ST.persistRv(cur);
        if (pt) onPlaced(cur);
        await new Promise((r) => setTimeout(r, 1100));
      }
    } finally { queueRunning = false; }
  }

  // The map view for Insights. items: store items; returns {el, destroy}.
  function view(items) {
    const { h, icon } = RV.dom;
    const UI = RV.ui, L = RV.logic, G = RV.garden, P = RV.plant, S = RV.store.S;
    const box = h('div', { class: 'gmap', role: 'region', 'aria-label': 'Map of your ' + UI.lbl('rvs') });
    const msg = h('div', { class: 'gmap-msg', hidden: true });
    const card = h('div', { class: 'gcard', hidden: true });
    let dryOnly = false, map = null, open = true, markers = new Map(), you = null, sel = null;
    const live = () => RV.store.items().filter((i) => i.att.state !== 'closed').map((it) => ({ it, st: G.forItem(it, S.settings, new Date()) })).filter((x) => x.st.form);
    const chip = h('button', { class: 'gmap-chip', type: 'button', 'aria-pressed': 'false', onclick: () => { dryOnly = !dryOnly; paintChip(); paintMarkers(); } });
    const locate = h('button', { class: 'gmap-loc', type: 'button', 'aria-label': 'Show where I am', onclick: () => findMe() }, icon('navigation', 18));
    function paintChip() {
      const n = live().filter((x) => x.st.care <= G.CARE.DRY).length;
      chip.textContent = dryOnly ? 'Thirsty only · ' + n : 'All · ' + live().filter((x) => RV.geo.pointOf(x.it.rv)).length;
      chip.setAttribute('aria-pressed', String(dryOnly)); chip.classList.toggle('on', dryOnly);
    }
    function pick(x) {
      if (sel) sel.classList.remove('sel');
      const m = markers.get(x.it.rv.id); sel = m ? m.getElement() : null; if (sel) sel.classList.add('sel');
      const word = x.st.word || L.stageOf(S.settings, x.it.rv.stage).name;
      card.replaceChildren(
        h('div', { class: 'gct' }, h('b', null, x.it.rv.name), h('span', { class: x.st.word ? 'gword' : '' }, word)),
        h('a', { class: 'btn sm', href: '#/rv/' + x.it.rv.id }, 'Open'),
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => UI.openNav(UI.navTarget(x.it.rv)) }, 'Directions'));
      card.hidden = false;
    }
    function markerEl(x, pt) {
      const b = h('button', { class: 'gpin' + (pt.approx ? ' approx' : ''), type: 'button', 'aria-label': x.it.rv.name + ', ' + (x.st.word || L.stageOf(S.settings, x.it.rv.stage).name) + (pt.approx ? ', placed from the address' : '') });
      b.appendChild(P.make(x.st.form, x.st.care, { size: 'rw', buds: x.st.buds, still: false, vid: x.it.rv.id }));
      b.addEventListener('click', (e) => { e.stopPropagation(); pick(x); });
      return b;
    }
    function paintMarkers(fit) {
      if (!map) return;
      const lib = root.maplibregl;
      const want = new Set();
      const pts = [];
      for (const x of live()) {
        const pt = RV.geo.pointOf(x.it.rv);
        if (!pt || (dryOnly && x.st.care > G.CARE.DRY)) continue;
        want.add(x.it.rv.id); pts.push(pt);
        const old = markers.get(x.it.rv.id);
        if (old) { old.setLngLat([pt.lng, pt.lat]); continue; }
        markers.set(x.it.rv.id, new lib.Marker({ element: markerEl(x, pt), anchor: 'bottom' }).setLngLat([pt.lng, pt.lat]).addTo(map));
      }
      for (const [id, m] of markers) if (!want.has(id)) { m.remove(); markers.delete(id); }
      paintChip();
      if (fit && pts.length) {
        if (pts.length === 1) map.jumpTo({ center: [pts[0].lng, pts[0].lat], zoom: 15 });
        else {
          const lngs = pts.map((p) => p.lng), lats = pts.map((p) => p.lat);
          map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 90, bottom: 120, left: 40, right: 40 }, maxZoom: 16, duration: 0 });
        }
      }
      if (!pts.length && !dryOnly) { msg.textContent = 'Geotag an ' + UI.lbl('rv') + ' or add addresses to see them here.'; msg.hidden = false; } else msg.hidden = true;
    }
    function findMe() {
      if (!navigator.geolocation || !map) return;
      navigator.geolocation.getCurrentPosition((p) => {
        const ll = [p.coords.longitude, p.coords.latitude];
        if (!you) { const d = h('div', { class: 'gyou', 'aria-label': 'You are here' }, h('i')); you = new root.maplibregl.Marker({ element: d }).setLngLat(ll).addTo(map); } else you.setLngLat(ll);
        map.easeTo({ center: ll, zoom: Math.max(map.getZoom(), 15) });
      }, () => UI.toast('Could not get your location.'), { enableHighAccuracy: true, timeout: 15000 });
    }
    const mapEl = h('div', { class: 'gmap-canvas' });
    box.append(mapEl, chip, locate, msg, card);
    paintChip();
    (async () => {
      if (navigator.onLine === false) { msg.textContent = 'The map needs a connection.'; msg.hidden = false; return; }
      try {
        const lib = await loadLib();
        const style = restyle(await baseStyle(), isDark());
        if (!open) return;
        const start = live().map((x) => RV.geo.pointOf(x.it.rv)).find(Boolean);
        map = new lib.Map({ container: mapEl, style, center: start ? [start.lng, start.lat] : [-121.29, 37.96], zoom: start ? 13 : 11, attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false });
        map.touchZoomRotate.disableRotation();
        map.on('click', () => { if (sel) sel.classList.remove('sel'); sel = null; card.hidden = true; });
        map.on('load', () => { paintMarkers(true); placeMissing(() => paintMarkers(markers.size === 0), () => open); });
      } catch (e) {
        msg.textContent = 'The map could not load. Check your connection and try again.'; msg.hidden = false;
      }
    })();
    return { el: box, refresh() { paintMarkers(false); }, destroy() { open = false; if (map) { map.remove(); map = null; } } };
  }

  RV.gmap = { view, restyle, THEMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.gmap;
})(typeof window !== 'undefined' ? window : globalThis);
