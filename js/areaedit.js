/* RV app: the area editor (v2.50). Full screen over Contacts, opened from the map's Edit areas button.
   Shapes show only here. Draw a new area by tapping corners or with a fixed crosshair; corners snap onto
   neighbouring shapes, and whatever still crosses a neighbour is trimmed off on close and on save, so
   shapes never overlap. Tap a shape to move corners (drag), add one (drag a side's middle dot), remove
   one (tap it), rename, redraw or remove it. After a save, contacts whose pin is inside can be sorted in.
   Pure geometry lives in js/areas.js; the map plumbing comes from js/gmap.js. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  let current = null; // the open editor, so a second open is ignored

  function open(at) {
    if (current) return current;
    const { h, icon } = RV.dom;
    const UI = RV.ui, ST = RV.store, A = RV.areas, GEO = RV.geo, GM = RV.gmap;
    const S = ST.S, lbl = UI.lbl;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { UI.toast('Drawing areas needs a connection.'); return null; }

    const head = h('div', { class: 'ae-head' });
    const mapEl = h('div', { class: 'ae-map' });
    const cross = h('div', { class: 'ae-cross', hidden: true, 'aria-hidden': 'true' }, h('i', { class: 'ring' }), h('i', { class: 'v1' }), h('i', { class: 'v2' }), h('i', { class: 'h1' }), h('i', { class: 'h2' }), h('i', { class: 'dot' }));
    const snapTag = h('div', { class: 'ae-snaptag', hidden: true });
    const panel = h('div', { class: 'ae-panel' });
    const box = h('div', { class: 'aedit', role: 'dialog', 'aria-label': 'Edit ' + lbl('neighborhood').toLowerCase() + 's' }, head, h('div', { class: 'ae-mapwrap' }, mapEl, cross, snapTag), panel);
    document.body.appendChild(box);
    document.body.classList.add('aedit-open');

    let map = null, alive = true, labels = [], handles = [], mode = 'list', how = 'tap';
    let draft = null; // { pts, holes, closed, editing (shape id), area (name or ''), note, hist: [] }
    let lastDragEnd = 0;
    const live = () => S.rvs.filter((r) => !r.deletedAt && !RV.logic.isClosed(S.settings, r));
    const shapes = () => A.list(S.settings);
    const others = () => shapes().filter((s) => !draft || s.id !== draft.editing);
    const countIn = (name) => live().filter((r) => A.key(r.neighborhood) === A.key(name)).length;
    const people = (n) => n + ' ' + (n === 1 ? 'person' : 'people');
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const uid = () => 'as' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const join = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

    function close() {
      if (!alive) return;
      alive = false; current = null;
      clearMarkers();
      if (map) { map.remove(); map = null; }
      box.remove();
      document.body.classList.remove('aedit-open');
      root.removeEventListener('hashchange', close);
      if (at && at.onClose) at.onClose();
    }
    root.addEventListener('hashchange', close);

    // ---------- map ----------
    const fc = (features) => ({ type: 'FeatureCollection', features });
    const ring = (pts) => pts.concat([pts[0]]);
    function areasData() {
      return fc(shapes().filter((s) => !(draft && s.id === draft.editing)).map((s) => ({
        type: 'Feature', properties: { id: s.id, name: s.area, color: A.colorOf(S.settings, s.area) },
        geometry: { type: 'Polygon', coordinates: [ring(s.pts)].concat((s.holes || []).map(ring)) } })));
    }
    function pinsData() {
      return fc(live().map((r) => GEO.pointOf(r)).filter(Boolean).map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })));
    }
    function draftData() {
      if (!draft || !draft.pts.length) return fc([]);
      const f = [];
      if (draft.closed && draft.pts.length >= 3) f.push({ type: 'Feature', properties: { k: 'poly' }, geometry: { type: 'Polygon', coordinates: [ring(draft.pts)] } });
      else if (draft.pts.length >= 2) f.push({ type: 'Feature', properties: { k: 'line' }, geometry: { type: 'LineString', coordinates: draft.pts } });
      if (!draft.closed && how === 'cross' && map) {
        const t = target();
        if (t && draft.pts.length) f.push({ type: 'Feature', properties: { k: 'ghost' }, geometry: { type: 'LineString', coordinates: [draft.pts[draft.pts.length - 1], t.ll] } });
      }
      return fc(f);
    }
    function paintMap() {
      if (!map || !map.getSource('ae-areas')) return;
      map.getSource('ae-areas').setData(areasData());
      map.getSource('ae-draft').setData(draftData());
      for (const m of labels) m.remove();
      labels = shapes().filter((s) => !(draft && s.id === draft.editing)).map((s) => {
        const c = s.pts.reduce((a, p) => [a[0] + p[0] / s.pts.length, a[1] + p[1] / s.pts.length], [0, 0]);
        const el = h('button', { class: 'ae-label', type: 'button', style: { color: A.colorOf(S.settings, s.area) }, onclick: (e) => { e.stopPropagation(); if (mode === 'list') editShape(s.id); } }, s.area);
        return new root.maplibregl.Marker({ element: el }).setLngLat(c).addTo(map);
      });
    }
    function paintDraft() { if (map && map.getSource('ae-draft')) map.getSource('ae-draft').setData(draftData()); }

    // snapping in screen pixels against the other shapes
    function snapLL(ll) {
      const p = map.project(ll);
      const os = others().map((s) => ({ name: s.area, px: s.pts.map((q) => { const v = map.project(q); return [v.x, v.y]; }) }));
      const s = A.snap([p.x, p.y], os);
      const u = s.snap ? map.unproject([s.x, s.y]) : (ll.lng != null ? ll : { lng: ll[0], lat: ll[1] });
      return { ll: [r6(u.lng), r6(u.lat)], snap: s.snap, of: s.of };
    }
    const target = () => (map ? snapLL(map.getCenter()) : null);
    const snapNote = (s) => (s.snap === 'corner' ? 'Snapped to a corner of ' + s.of + '.' : s.snap === 'edge' ? 'Snapped onto the edge of ' + s.of + '.' : '');

    // ---------- handles: corners (drag to move, tap to remove) and side dots (drag to add a corner) ----------
    function clearMarkers() { for (const m of handles) m.remove(); handles = []; }
    function renderHandles() {
      clearMarkers();
      if (!map || !draft || mode === 'list') return;
      const lib = root.maplibregl;
      draft.pts.forEach((p, i) => {
        const first = i === 0 && !draft.closed && draft.pts.length >= 3;
        const el = h('button', { class: 'ae-h' + (first ? ' first' : '') + (draft.snaps && draft.snaps[i] ? ' snapped' : ''), type: 'button',
          'aria-label': first ? 'First corner: tap to close the shape' : draft.closed ? 'Corner ' + (i + 1) + ': drag to move, tap to remove' : 'Corner ' + (i + 1) });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (Date.now() - lastDragEnd < 400) return;
          if (first) { closeShape(); return; }
          if (!draft.closed) return;
          if (draft.pts.length <= 3) { setNote('A shape needs at least three corners.'); return; }
          remember(); draft.pts.splice(i, 1); draft.snaps.splice(i, 1); draft.note = 'Corner removed.'; changed();
        });
        const m = new lib.Marker({ element: el, draggable: true }).setLngLat(p).addTo(map);
        m.on('dragstart', () => remember());
        m.on('drag', () => { const s = snapLL(m.getLngLat()); draft.pts[i] = s.ll; draft.snaps[i] = !!s.snap; draft.note = snapNote(s); paintDraft(); el.classList.toggle('snapped', !!s.snap); paintPanel(); });
        m.on('dragend', () => { lastDragEnd = Date.now(); changed(); });
        handles.push(m);
      });
      if (!draft.closed) return;
      draft.pts.forEach((p, i) => {
        const q = draft.pts[(i + 1) % draft.pts.length];
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const el = h('button', { class: 'ae-mid', type: 'button', 'aria-label': 'Drag to add a corner here' });
        const m = new lib.Marker({ element: el, draggable: true }).setLngLat(mid).addTo(map);
        let at = -1;
        m.on('dragstart', () => { remember(); at = i + 1; draft.pts.splice(at, 0, mid); draft.snaps.splice(at, 0, false); });
        m.on('drag', () => { if (at < 0) return; const s = snapLL(m.getLngLat()); draft.pts[at] = s.ll; draft.snaps[at] = !!s.snap; draft.note = s.snap ? snapNote(s) : 'New corner: drag it into place.'; paintDraft(); paintPanel(); });
        m.on('dragend', () => { lastDragEnd = Date.now(); changed(); });
        handles.push(m);
      });
    }
    function remember() { draft.hist.push({ pts: draft.pts.map((p) => p.slice()), snaps: draft.snaps.slice(), closed: draft.closed }); if (draft.hist.length > 50) draft.hist.shift(); }
    function undo() {
      const last = draft && draft.hist.pop();
      if (!last) return;
      draft.pts = last.pts; draft.snaps = last.snaps; draft.closed = last.closed; draft.note = ''; changed();
    }
    function setNote(t) { draft.note = t; paintPanel(); }
    function changed() { paintDraft(); renderHandles(); paintPanel(); paintCross(); }

    // ---------- drawing ----------
    function startDraw(o) {
      draft = { pts: [], snaps: [], closed: false, editing: o.editing || null, area: o.area || '', note: '', hist: [] };
      mode = 'draw'; paintAll();
    }
    function addCorner(s) {
      if (!draft || draft.closed) return;
      remember(); draft.pts.push(s.ll); draft.snaps.push(!!s.snap); draft.note = snapNote(s); changed();
    }
    async function closeShape() {
      if (!draft || draft.pts.length < 3) return;
      const t = await trimmed();
      if (t === undefined) return;
      remember();
      if (!t) { draft.note = 'That shape sits inside other areas. Draw it where no area is yet.'; paintPanel(); draft.hist.pop(); return; }
      draft.pts = t.pts; draft.snaps = t.pts.map(() => false); draft.holes = t.holes; draft.closed = true;
      draft.note = t.trimmed.length ? 'Trimmed where it crossed ' + join(t.trimmed) + '.' + (t.pieces > 1 ? ' Kept the biggest piece.' : '') : '';
      changed();
    }
    // the draft with every other shape cut out; undefined when the library couldn't load
    async function trimmed() {
      let pc;
      try { pc = await A.loadClip(); } catch (e) { UI.toast('Could not check for overlaps. Check your connection.'); return undefined; }
      const t = A.trim(draft.pts, others(), pc);
      return t && Object.assign(t, { pts: t.pts.map((p) => [r6(p[0]), r6(p[1])]), holes: t.holes.map((r) => r.map((p) => [r6(p[0]), r6(p[1])])) });
    }

    // ---------- saving ----------
    async function save(area) {
      const t = await trimmed();
      if (t === undefined) return false;
      if (!t) { UI.toast('That shape sits inside other areas.'); return false; }
      const list = (S.settings.areaShapes || []).filter((s) => s.id !== draft.editing && A.key(s.area) !== A.key(area));
      list.push({ id: draft.editing || uid(), area, pts: t.pts, holes: t.holes, at: new Date().toISOString() });
      ST.saveSettings((s) => {
        s.areaShapes = list;
        if (!ST.neighborhoods().some((n) => A.key(n) === A.key(area))) s.lists.neighborhoods = RV.util.uniq(s.lists.neighborhoods.concat(area));
      });
      UI.toast(t.trimmed.length ? 'Saved ' + area + ', trimmed where it crossed ' + join(t.trimmed) : 'Saved ' + area);
      draft = null; mode = 'list'; paintAll();
      const m = A.moves(S.settings, live(), GEO.pointOf, [area]);
      if (m.move.length) sortSheet([area]);
      return true;
    }
    function nameSheet() {
      const free = ST.neighborhoods().filter((n) => !A.shapeOf(S.settings, n));
      const NEW = '__new__';
      let pick = free[0] || NEW;
      const input = h('input', { type: 'text', placeholder: 'e.g. Cherry Hill', autocomplete: 'off', 'aria-label': 'New ' + lbl('neighborhood').toLowerCase() + ' name' });
      const err = h('div', { class: 'ae-err', role: 'alert' });
      const radio = (value, label, sub) => {
        const r = h('input', { type: 'radio', name: 'ae-area', value, checked: value === pick, onchange: () => { pick = value; err.textContent = ''; } });
        return h('label', { class: 'ae-pick' }, r, h('span', { class: 'n' }, label), sub ? h('span', { class: 'sub' }, sub) : null);
      };
      input.addEventListener('focus', () => { pick = NEW; const r = box.ownerDocument.querySelector('.ae-names input[value="' + NEW + '"]'); if (r) r.checked = true; });
      UI.sheet('Name this ' + lbl('neighborhood').toLowerCase(), (closeS) => h('form', { class: 'ae-names', onsubmit: (e) => {
        e.preventDefault();
        let name = pick;
        if (pick === NEW) {
          name = input.value.trim().replace(/\s+/g, ' ');
          if (!name) { err.textContent = 'Type a name.'; return; }
          const same = ST.neighborhoods().find((n) => A.key(n) === A.key(name));
          if (same && A.shapeOf(S.settings, same)) { err.textContent = same + ' already has a shape. Tap it on the map to change it.'; return; }
          if (same) name = same;
        }
        closeS(); save(name);
      } },
        free.length ? h('div', { class: 'muted small' }, 'An ' + lbl('neighborhood').toLowerCase() + ' you already have') : null,
        free.map((n) => radio(n, n, people(countIn(n)) + ' · no shape')),
        radio(NEW, 'A new ' + lbl('neighborhood').toLowerCase()),
        h('div', { class: 'field' }, input), err,
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => closeS() }, 'Back'), h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
    }

    // ---------- sorting contacts into areas ----------
    function sortSheet(names) {
      const m = A.moves(S.settings, live(), GEO.pointOf, names);
      if (!m.move.length) { UI.toast('Everyone is already in the right ' + lbl('neighborhood').toLowerCase() + '.'); return; }
      const ticks = new Map(m.move.map((x) => [x.rv.id, true]));
      const go = h('button', { class: 'btn primary', type: 'submit' });
      const paintGo = () => { const n = [...ticks.values()].filter(Boolean).length; go.textContent = 'Move ' + n; go.disabled = !n; };
      paintGo();
      const one = names && names.length === 1 ? names[0] : '';
      const inCount = m.move.length + m.already;
      UI.sheet(one ? 'Sort into ' + one : 'Sort into ' + lbl('neighborhood').toLowerCase() + 's', (closeS) => h('form', { class: 'ae-sort', onsubmit: (e) => {
        e.preventDefault();
        const chosen = m.move.filter((x) => ticks.get(x.rv.id));
        chosen.forEach((x) => ST.updateRv(x.rv.id, { neighborhood: x.to }));
        closeS(); paintAll();
        UI.toast('Moved ' + chosen.length + ' ' + (chosen.length === 1 ? lbl('rv') : lbl('rvs')));
      } },
        h('p', { class: 'muted' }, one ? inCount + ' ' + (inCount === 1 ? 'contact has its' : 'contacts have their') + ' pin inside ' + one + (m.already ? '. ' + m.already + ' ' + (m.already === 1 ? 'is' : 'are') + ' already there.' : '.') : m.move.length + ' ' + (m.move.length === 1 ? 'contact is' : 'contacts are') + ' inside a different ' + lbl('neighborhood').toLowerCase() + '’s shape.'),
        h('div', { class: 'group ae-moves' }, m.move.map((x) => h('label', { class: 'ae-move' },
          h('input', { type: 'checkbox', checked: true, onchange: (e) => { ticks.set(x.rv.id, e.target.checked); paintGo(); } }),
          h('span', { class: 'n' }, h('b', null, x.rv.name), h('span', null, (x.from || 'No ' + lbl('neighborhood').toLowerCase()) + ' → ', h('b', { class: 'to' }, x.to)))))),
        one && (m.outside.length || m.unplaced.length) ? h('div', { class: 'ae-left' }, h('div', { class: 'muted small' }, 'Left as they are'),
          h('div', { class: 'group' }, m.outside.map((r) => h('div', { class: 'ae-move' }, h('span', { class: 'n' }, h('b', null, r.name), h('span', null, one + ' · their pin is outside the shape')))),
            m.unplaced.map((r) => h('div', { class: 'ae-move' }, h('span', { class: 'n' }, h('b', null, r.name), h('span', null, 'Not on the map yet')))))) : null,
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => closeS() }, 'Not now'), go)));
    }

    // ---------- an existing shape ----------
    function editShape(id) {
      const s = shapes().find((x) => x.id === id);
      if (!s) return;
      draft = { pts: s.pts.map((p) => p.slice()), snaps: s.pts.map(() => false), holes: s.holes || [], closed: true, editing: s.id, area: s.area, note: '', hist: [] };
      mode = 'shape'; paintAll();
    }
    async function renameArea() {
      const from = draft.area;
      const v = String(await UI.textPrompt({ title: 'Rename ' + from, value: from, placeholder: 'Name' }) || '').trim().replace(/\s+/g, ' ');
      if (!v || v === from) return;
      const other = ST.neighborhoods().find((n) => A.key(n) !== A.key(from) && A.key(n) === A.key(v));
      if (other && A.shapeOf(S.settings, other)) { UI.toast(other + ' already has a shape.'); return; }
      const to = other || v;
      live().filter((r) => r.neighborhood === from).forEach((r) => ST.updateRv(r.id, { neighborhood: to }));
      ST.saveSettings((st) => {
        st.lists.neighborhoods = RV.util.uniq(st.lists.neighborhoods.filter((n) => n !== from).concat(to));
        st.areaShapes = A.renamed(st.areaShapes || [], from, to);
      });
      draft.area = to;
      UI.toast(other ? 'Merged into ' + other : 'Renamed to ' + to);
      paintAll();
    }
    async function removeShape() {
      const name = draft.area;
      if (!(await UI.confirmDialog({ title: 'Remove the shape for ' + name + '?', message: 'The ' + lbl('neighborhood').toLowerCase() + ' and its contacts stay as they are.', confirmText: 'Remove shape', danger: true }))) return;
      ST.saveSettings((st) => { st.areaShapes = A.removed(st.areaShapes || [], name); });
      draft = null; mode = 'list'; paintAll();
      UI.toast('Removed the shape for ' + name);
    }

    // ---------- header, panel, crosshair ----------
    function paintCross() {
      const on = mode === 'draw' && how === 'cross' && draft && !draft.closed;
      cross.hidden = !on;
      const t = on && map ? target() : null;
      cross.classList.toggle('snapping', !!(t && t.snap));
      snapTag.hidden = !(t && t.snap);
      if (t && t.snap) snapTag.textContent = (t.snap === 'corner' ? 'Snaps to a corner of ' : 'Snaps to the edge of ') + t.of;
    }
    function seg() {
      const b = (v, t) => h('button', { type: 'button', 'aria-pressed': String(how === v), onclick: () => { how = v; changed(); paintHead(); } }, t);
      return h('div', { class: 'seg ae-how', role: 'group', 'aria-label': 'How to place corners' }, b('tap', 'Tap'), b('cross', 'Crosshair'));
    }
    function paintHead() {
      if (mode === 'list') head.replaceChildren(h('h1', null, 'Edit ' + lbl('neighborhood').toLowerCase() + 's'), h('button', { class: 'btn primary sm', type: 'button', onclick: close }, 'Done'));
      else if (mode === 'draw') head.replaceChildren(
        h('button', { class: 'link-quiet', type: 'button', onclick: () => { const id = draft.editing; draft = null; if (id) editShape(id); else { mode = 'list'; paintAll(); } } }, 'Cancel'),
        h('h1', null, draft.editing ? 'Redraw ' + draft.area : draft.area || 'New ' + lbl('neighborhood').toLowerCase()), seg());
      else head.replaceChildren(
        h('button', { class: 'link-quiet', type: 'button', onclick: () => { draft = null; mode = 'list'; paintAll(); } }, 'Cancel'),
        h('h1', null, draft.area),
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => save(draft.area) }, 'Save'));
    }
    function paintPanel() {
      if (mode === 'list') {
        const names = ST.neighborhoods();
        const m = A.moves(S.settings, live(), GEO.pointOf);
        panel.replaceChildren(...[
          h('p', { class: 'muted' }, shapes().length ? 'Tap an ' + lbl('neighborhood').toLowerCase() + ' to change it.' : 'Draw each ' + lbl('neighborhood').toLowerCase() + ' on the map, and contacts inside it join it.'),
          h('div', { class: 'ae-rows' }, names.map((n) => {
            const s = A.shapeOf(S.settings, n);
            return h('button', { class: 'ae-row', type: 'button', onclick: () => (s ? editShape(s.id) : startDraw({ area: n })) },
              h('span', { class: 'sw' + (s ? '' : ' none'), style: s ? { background: A.colorOf(S.settings, n) } : null }),
              h('span', { class: 'n' }, n), h('span', { class: 'c' }, people(countIn(n)) + (s ? '' : ' · no shape')));
          })),
          m.move.length ? h('button', { class: 'btn ae-sortall', type: 'button', onclick: () => sortSheet(null) }, 'Sort ' + m.move.length + ' ' + (m.move.length === 1 ? 'contact' : 'contacts') + ' into ' + lbl('neighborhood').toLowerCase() + 's') : null,
          h('button', { class: 'btn primary ae-new', type: 'button', onclick: () => startDraw({}) }, icon('plus', 18), 'New ' + lbl('neighborhood').toLowerCase())].filter(Boolean));
        return;
      }
      const n = draft.pts.length, corners = n + (n === 1 ? ' corner' : ' corners');
      let msg, sub;
      if (mode === 'shape') { msg = draft.note || people(countIn(draft.area)); sub = 'Drag a corner to move it. Drag a small dot to add a corner. Tap a corner to remove it.'; }
      else if (draft.closed) { msg = draft.note || 'Shape closed · ' + corners; sub = 'Drag a corner to move it. Drag a small dot to add a corner. Tap a corner to remove it.'; }
      else if (how === 'cross') { msg = draft.note || (n ? (n >= 3 ? 'Add more corners, or close the shape.' : 'Move the map to the next corner, then Add corner.') : 'Move the map until the crosshair sits on a corner.'); sub = n ? corners : 'Press Add corner to drop one under the crosshair.'; }
      else { msg = draft.note || (!n ? 'Tap the map to drop the first corner.' : n < 3 ? 'Keep tapping to add corners.' : 'Tap the first corner to close the shape.'); sub = n ? corners : 'Corners snap onto the ' + lbl('neighborhood').toLowerCase() + 's next to it.'; }
      const btn = (t, fn, cls, dis) => h('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button', disabled: !!dis, onclick: fn }, t);
      let row;
      if (mode === 'shape') row = [btn('Rename', renameArea), btn('Redraw', () => startDraw({ editing: draft.editing, area: draft.area })), btn('Remove shape', removeShape, 'warn')];
      else if (draft.closed) row = [btn('Undo', undo, '', !draft.hist.length), btn('Start over', () => startDraw({ editing: draft.editing, area: draft.area })), btn(draft.area ? 'Save' : 'Name it', () => (draft.area ? save(draft.area) : nameSheet()), 'primary')];
      else if (how === 'cross') row = [btn('Undo', undo, '', !draft.hist.length), btn('Close shape', closeShape, '', n < 3), btn('Add corner', () => addCorner(target()), 'primary')];
      else row = [btn('Undo', undo, '', !draft.hist.length), btn('Start over', () => startDraw({ editing: draft.editing, area: draft.area }), '', !n)];
      panel.replaceChildren(h('p', { class: 'ae-msg', 'aria-live': 'polite' }, msg), h('p', { class: 'muted small' }, sub), h('div', { class: 'ae-btns' }, row));
    }
    function paintAll() { paintHead(); paintPanel(); paintMap(); renderHandles(); paintCross(); }

    paintHead(); paintPanel();
    (async () => {
      try {
        const lib = await GM.loadLib();
        const style = GM.restyle(await GM.baseStyle(), GM.isDark());
        if (!alive) return;
        map = new lib.Map({ container: mapEl, style, center: (at && at.center) || [-121.29, 37.96], zoom: (at && at.zoom) || 14, attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false });
        map.touchZoomRotate.disableRotation();
        map.on('load', () => {
          if (!map) return;
          map.addSource('ae-pins', { type: 'geojson', data: pinsData() });
          map.addSource('ae-areas', { type: 'geojson', data: areasData() });
          map.addSource('ae-draft', { type: 'geojson', data: fc([]) });
          map.addLayer({ id: 'ae-areas-fill', type: 'fill', source: 'ae-areas', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 } });
          map.addLayer({ id: 'ae-areas-line', type: 'line', source: 'ae-areas', paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 } });
          map.addLayer({ id: 'ae-pins', type: 'circle', source: 'ae-pins', paint: { 'circle-radius': 5, 'circle-color': '#C77F5A', 'circle-stroke-color': '#FFFDF9', 'circle-stroke-width': 1.5 } });
          map.addLayer({ id: 'ae-draft-fill', type: 'fill', source: 'ae-draft', filter: ['==', ['get', 'k'], 'poly'], paint: { 'fill-color': '#B08A2E', 'fill-opacity': 0.24 } });
          map.addLayer({ id: 'ae-draft-line', type: 'line', source: 'ae-draft', filter: ['!=', ['get', 'k'], 'ghost'], paint: { 'line-color': '#8C6A1C', 'line-width': 3 } });
          map.addLayer({ id: 'ae-draft-ghost', type: 'line', source: 'ae-draft', filter: ['==', ['get', 'k'], 'ghost'], paint: { 'line-color': '#8C6A1C', 'line-width': 2.5, 'line-dasharray': [2, 1.6] } });
          paintAll();
          // contacts with only an address get their map point now, so they can be sorted
          if (GM.placeMissing) GM.placeMissing(() => { if (map && map.getSource('ae-pins')) map.getSource('ae-pins').setData(pinsData()); if (mode === 'list') paintPanel(); }, () => alive);
        });
        map.on('click', (e) => {
          if (mode === 'draw' && how === 'tap' && draft && !draft.closed) { addCorner(snapLL(e.lngLat)); return; }
          if (mode === 'list') {
            const f = map.queryRenderedFeatures(e.point, { layers: ['ae-areas-fill'] })[0];
            if (f) editShape(f.properties.id);
          }
        });
        map.on('move', () => { if (mode === 'draw' && how === 'cross' && draft && !draft.closed) { paintCross(); paintDraft(); } });
      } catch (e) {
        panel.replaceChildren(h('p', { class: 'muted' }, 'The map could not load. Check your connection and try again.'), h('button', { class: 'btn', type: 'button', onclick: close }, 'Close'));
      }
    })();

    current = { close, el: box, map: () => map, _draft: () => draft, _mode: () => mode };
    box.aeditApi = current; // for tests
    return current;
  }

  RV.areaEdit = { open };
})(typeof window !== 'undefined' ? window : globalThis);
