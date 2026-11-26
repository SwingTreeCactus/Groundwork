/* Groundwork v2.62: an edited address re-checks the contact's area and its pin.
   - A changed address is looked up right away (online). When its spot is inside another area's shape, the contact
     moves there ("Moved to Oak Park", Undo). An area picked by hand in the same edit wins; outside every shape
     nothing changes. Only an address edit moves an area this way.
   - Geotagged contacts are placed by the pin, so a new address far from the pin (GEO.FAR_M) asks: Use the address
     (the pin goes, the area is checked) or Keep the pin. Pin here asks the same way when you're far from the address.
   - Offline, the contact keeps `addrCheck` (1, or 'hand' when the area was picked by hand) until a lookup can run:
     when its page is opened, or when the map places it. Asked later, the pin question is a card on the contact page
     (`pinFar`). `pinKeep` holds the address a kept pin was accepted for, so it isn't asked again. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const { h } = RV.dom;
  const GEO = RV.geo;
  const ST = () => RV.store;
  const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
  const running = new Set();

  const live = () => ST().S.rvs.filter((r) => !r.deletedAt);
  // the spot for an address: the one already found for it, else a lookup. {lat, lng}, null (not found) or undefined (couldn't look)
  async function spotFor(address, rv) {
    const q = String(address || '').trim().toLowerCase();
    if (!q) return null;
    if (rv && rv.approx && rv.approx.q === q) return rv.approx.fail ? null : { lat: rv.approx.lat, lng: rv.approx.lng };
    if (offline()) return undefined;
    const pt = await GEO.forward(address, GEO.centerOf(live()));
    return pt === null && offline() ? undefined : pt;
  }

  // A small drawing of two spots and the gap between them (not a real map: that needs tiles and a connection)
  function miniMap(a, b, la, lb) {
    const W = 320, H = 136, P = 40;
    const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
    let dx = (b.lng - a.lng) * k, dy = -(b.lat - a.lat);
    if (!dx && !dy) dx = 1e-6;
    const s = Math.min((W - 2 * P) / (Math.abs(dx) || 1e-9), (H - 2 * P) / (Math.abs(dy) || 1e-9));
    const cx = W / 2, cy = H / 2;
    const ax = cx - dx * s / 2, ay = cy - dy * s / 2, bx = cx + dx * s / 2, by = cy + dy * s / 2;
    const ns = 'http://www.w3.org/2000/svg';
    const el = (t, at) => { const e = document.createElementNS(ns, t); Object.keys(at).forEach((x) => e.setAttribute(x, at[x])); return e; };
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rcmap', role: 'img', 'aria-label': la + ' and ' + lb + ', ' + GEO.distText(GEO.dist(a, b)) + ' apart' });
    const roads = 'M0 34 H' + W + ' M0 104 H' + W + ' M74 0 V' + H + ' M200 0 V' + H + ' M276 0 V' + H;
    svg.appendChild(el('path', { d: roads, class: 'rcroad' }));
    svg.appendChild(el('path', { d: roads, class: 'rcroad2' }));
    svg.appendChild(el('path', { d: 'M' + ax + ' ' + ay + ' L' + bx + ' ' + by, class: 'rcgap' }));
    const mx = (ax + bx) / 2, my = (ay + by) / 2, txt = GEO.distText(GEO.dist(a, b)), tw = 12 + txt.length * 7;
    svg.appendChild(el('rect', { x: mx - tw / 2, y: my - 11, width: tw, height: 22, rx: 11, class: 'rcpill' }));
    const t = el('text', { x: mx, y: my + 4, 'text-anchor': 'middle', class: 'rcpilltx' }); t.textContent = txt; svg.appendChild(t);
    const lab = (x, y, s2) => { const e = el('text', { x, y, 'text-anchor': 'middle', class: 'rclbl' }); e.textContent = s2; svg.appendChild(e); };
    // a: you or the pin (filled), b: the address (ring)
    svg.appendChild(el('circle', { cx: ax, cy: ay, r: 8, class: 'rcpin' }));
    lab(ax, ay + (ay > cy ? -16 : 24), la);
    svg.appendChild(el('circle', { cx: bx, cy: by, r: 7, class: 'rcaddr' }));
    lab(bx, by + (by > cy ? -16 : 24), lb);
    return svg;
  }

  // Ask with two choices. Resolves true for the main one, false for the other, null when closed without an answer.
  function ask(title, sub, map, yes, no) {
    return new Promise((resolve) => {
      let answered = false;
      RV.ui.sheet(title, (close) => h('div', { class: 'rcask' },
        map,
        sub ? h('p', { class: 'muted', style: { margin: '12px 0 0' } }, sub) : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => { answered = true; resolve(false); close(); } }, no),
          h('button', { class: 'btn primary', type: 'button', onclick: () => { answered = true; resolve(true); close(); } }, yes))),
      { noFocus: true, onClose: () => { if (!answered) resolve(null); } });
    });
  }

  // Pin here with an address typed: far from it, ask first. Resolves true to pin.
  async function pinOk(address, here, rv) {
    if (!here || !String(address || '').trim()) return true;
    const spot = await spotFor(address, rv);
    if (!spot) return true; // offline or not found: pin; a later check can still ask
    const d = GEO.dist(here, spot);
    if (d <= GEO.FAR_M) return true;
    const street = String(address).split(',')[0].trim();
    return (await ask('You’re ' + GEO.distText(d) + ' from ' + street, 'Pin here anyway?', miniMap(here, spot, 'You', 'Address'), 'Pin anyway', 'Cancel')) === true;
  }

  // The area from a spot. Returns the new area when it moved.
  function areaFrom(id, spot, o) {
    o = o || {};
    const rv = ST().rvById(id);
    if (!rv || !spot || o.hand || !RV.areas) return '';
    const a = RV.areas.areaAt(ST().S.settings, spot);
    if (!a || a === (rv.neighborhood || '')) return '';
    const old = rv.neighborhood || '';
    ST().updateRv(id, { neighborhood: a });
    if (!o.silent) RV.ui.toast((o.named ? 'Moved ' + rv.name + ' to ' : 'Moved to ') + a, { seconds: 6, actions: [{ label: 'Undo', fn: () => ST().updateRv(id, { neighborhood: old }) }] });
    return a;
  }

  // The pin goes and the address decides (the far sheet's or card's Use the address, and Remove pin)
  function useAddress(id, o) {
    const rv = ST().rvById(id);
    if (!rv) return '';
    ST().updateRv(id, { geo: null, pinFar: null, pinKeep: null });
    const a = rv.approx;
    const spot = a && !a.fail && a.q === GEO.addrKey(rv) ? { lat: a.lat, lng: a.lng } : null;
    if (spot) return areaFrom(id, spot, o);
    if (GEO.addrKey(rv)) addressChanged(id, Object.assign({}, o, { ask: false }));
    return '';
  }
  const keepPin = (id) => { const rv = ST().rvById(id); if (rv) ST().updateRv(id, { pinFar: null, pinKeep: GEO.addrKey(rv) }); };

  // After the address changed. o.hand: the area was picked by hand in the same edit; o.ask: ask about a far pin now
  // (right after Done) rather than leaving the card; o.named: say whose area moved (when not on their page).
  async function addressChanged(id, o) {
    o = o || {};
    if (running.has(id)) return;
    let rv = ST().rvById(id);
    if (!rv) return;
    const key = GEO.addrKey(rv);
    const clear = () => { const c = ST().rvById(id); if (c && c.addrCheck) ST().updateRv(id, { addrCheck: null }); };
    if (!key) { clear(); return; }
    running.add(id);
    try {
      const spot = await spotFor(rv.address, rv);
      rv = ST().rvById(id);
      if (!rv || GEO.addrKey(rv) !== key) return; // changed again meanwhile; that edit checks itself
      if (spot === undefined) { ST().updateRv(id, { addrCheck: o.hand ? 'hand' : (rv.addrCheck === 'hand' ? 'hand' : 1) }); return; }
      if (!(rv.approx && rv.approx.q === key)) ST().updateRv(id, { approx: spot ? { q: key, lat: spot.lat, lng: spot.lng } : { q: key, fail: true } });
      const hand = o.hand || rv.addrCheck === 'hand';
      if (!spot) { clear(); return; }
      if (rv.geo && typeof rv.geo.lat === 'number') {
        const d = GEO.dist(rv.geo, spot);
        if (d > GEO.FAR_M && rv.pinKeep !== key) {
          if (o.ask) {
            ST().updateRv(id, { addrCheck: null, pinFar: null });
            const yes = await ask('The pin is ' + GEO.distText(d) + ' from this address', null, miniMap(rv.geo, spot, 'Pin', 'New address'), 'Use the address', 'Keep the pin');
            // closed without an answer: the card on their page asks again
            if (yes === true) useAddress(id, { hand }); else if (yes === false) keepPin(id); else ST().updateRv(id, { pinFar: { q: key, d: Math.round(d) } });
          } else ST().updateRv(id, { addrCheck: null, pinFar: { q: key, d: Math.round(d) } });
          return;
        }
        ST().updateRv(id, { addrCheck: null, pinFar: null });
        return;
      }
      ST().updateRv(id, { addrCheck: null, pinFar: null });
      areaFrom(id, spot, { hand, named: o.named });
    } finally { running.delete(id); }
  }

  // The card on the contact page when a far pin was found later. Null when there's nothing to ask.
  function card(rv) {
    const f = rv.pinFar;
    if (!f || !rv.geo || f.q !== GEO.addrKey(rv)) return null;
    return h('div', { class: 'rccard', role: 'group', 'aria-label': 'Pin and address' },
      h('div', { class: 'rccardt' }, 'The pin is ' + GEO.distText(f.d) + ' from the address'),
      h('div', { class: 'rccardb' },
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => useAddress(rv.id, {}) }, 'Use the address'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => keepPin(rv.id) }, 'Keep the pin')));
  }

  RV.recheck = { addressChanged, pinOk, useAddress, keepPin, areaFrom, card, miniMap, _running: running };
})(window);
