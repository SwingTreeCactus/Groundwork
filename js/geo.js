/* RV app: geotag (v2.16.1). The phone's position for a record, and a suggested street address from
   OpenStreetMap (Nominatim reverse geocoding) when online. Coordinates are shown only in the RV form. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  // Resolves {lat, lng, acc, at}; rejects with a short message.
  function here() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Location is not available on this device.')); return; }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy || 0), at: new Date().toISOString() }),
        (e) => reject(new Error(e && e.code === 1 ? 'Location permission is off for this app.' : 'Could not get your location. Try again outside.')),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }

  // "123 Main St" from a Nominatim address. Pure, so it can be tested.
  function streetOf(a) {
    if (!a) return '';
    const road = a.road || a.pedestrian || a.residential || a.footway || a.path || '';
    return [a.house_number, road].filter(Boolean).join(' ').trim();
  }
  const cityOf = (a) => (a && (a.city || a.town || a.village || a.hamlet || a.municipality)) || '';
  const stateOf = (a) => { const iso = a && a['ISO3166-2-lvl4']; return iso && /^US-[A-Z]{2}$/.test(iso) ? iso.slice(3) : ''; };
  const zipOf = (a) => { const m = String((a && a.postcode) || '').match(/^\d{5}/); return m ? m[0] : ''; };
  // "123 Main St, Stockton, CA 95205" (parts it has).
  function fullOf(a) {
    const street = streetOf(a), city = cityOf(a), tail = [stateOf(a), zipOf(a)].filter(Boolean).join(' ');
    return [street, city, tail].filter(Boolean).join(', ');
  }
  // Adds the city and ZIP from the lookup to a typed street address when they are missing; the
  // street part is never changed. Returns the address unchanged when nothing is missing.
  function completeAddress(addr, a) {
    let s = String(addr || '').trim();
    if (!s || !a) return s;
    const city = cityOf(a), st = stateOf(a), zip = zipOf(a);
    const zipRe = /\b\d{5}(-\d{4})?\s*$/;
    const hasZip = zipRe.test(s);
    const hasCity = !city || s.toLowerCase().includes(city.toLowerCase());
    if (hasZip && hasCity) return s;
    if (!hasCity) {
      if (hasZip) { const z = s.match(zipRe)[0].trim(); return s.replace(zipRe, '').replace(/[\s,]+$/, '') + ', ' + city + ', ' + (st ? st + ' ' : '') + z; }
      s = s.replace(/[\s,]+$/, '') + ', ' + city;
    }
    if (!hasZip && zip) {
      const hasState = st && new RegExp('(^|[\\s,])' + st + '\\s*$', 'i').test(s);
      s = s.replace(/[\s,]+$/, '') + (hasState ? ' ' : ', ' + (st ? st + ' ' : '')) + zip;
    }
    return s;
  }
  // The lookup's address parts for a point, or null (offline, nothing found, slow service).
  async function lookup(pt) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
    try {
      const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=' + pt.lat + '&lon=' + pt.lng;
      const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined });
      if (!r.ok) return null;
      const j = await r.json();
      return (j && j.address) || null;
    } catch (e) { return null; } finally { if (t) clearTimeout(t); }
  }
  // Suggested full address for a point, or ''.
  const suggest = async (pt) => fullOf(await lookup(pt));
  // Map placement for a record: its geotag, else a point looked up once from its saved address
  // (rv.approx, kept with the address it was found for, so a changed address is looked up again).
  const addrKey = (rv) => String(rv.address || '').trim().toLowerCase();
  function pointOf(rv) {
    if (rv.geo && typeof rv.geo.lat === 'number') return { lat: rv.geo.lat, lng: rv.geo.lng, approx: false };
    const a = rv.approx;
    if (a && !a.fail && a.q === addrKey(rv) && typeof a.lat === 'number') return { lat: a.lat, lng: a.lng, approx: true };
    return null;
  }
  const needsLookup = (rv) => !!addrKey(rv) && !(rv.geo && typeof rv.geo.lat === 'number') && !(rv.approx && rv.approx.q === addrKey(rv));
  // Address to point (OpenStreetMap Nominatim), kept near `near` ({lat, lng}) when given so a street name
  // shared by many towns lands in the right one. Resolves {lat, lng} or null.
  async function forward(address, near) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    let url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(address);
    if (near) {
      const d = 0.35;
      url += '&bounded=1&viewbox=' + [near.lng - d, near.lat + d, near.lng + d, near.lat - d].map((v) => v.toFixed(4)).join(',');
    }
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined });
      if (!r.ok) return undefined; // service trouble: try again another time
      const j = await r.json();
      const hit = Array.isArray(j) && j[0];
      return hit ? { lat: +(+hit.lat).toFixed(6), lng: +(+hit.lon).toFixed(6) } : null;
    } catch (e) { return undefined; } finally { if (t) clearTimeout(t); }
  }
  // Middle of the geotagged records, to keep address lookups local.
  function centerOf(rvs) {
    const pts = rvs.filter((r) => r.geo && typeof r.geo.lat === 'number');
    if (!pts.length) return null;
    return { lat: pts.reduce((s, r) => s + r.geo.lat, 0) / pts.length, lng: pts.reduce((s, r) => s + r.geo.lng, 0) / pts.length };
  }
  // v2.62: metres between two {lat, lng} points (haversine), and how it reads: "500 ft" under a tenth of a mile, else "0.4 mi"
  function dist(a, b) {
    if (!a || !b) return 0;
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  const distText = (m) => { const mi = m / 1609.344; return mi < 0.1 ? Math.max(50, Math.round(m * 3.28084 / 50) * 50) + ' ft' : (mi < 10 ? mi.toFixed(1) : String(Math.round(mi))) + ' mi'; };
  // Farther apart than this, a pin and its address are worth asking about. Loose on purpose: OpenStreetMap often places an
  // address somewhere along its block, and a phone's position can be 30–50 m off.
  const FAR_M = 150;
  const label = (g) => (g ? g.lat.toFixed(5) + ', ' + g.lng.toFixed(5) + (g.acc ? ' (±' + g.acc + ' m)' : '') : '');

  const api = { here, lookup, suggest, streetOf, fullOf, completeAddress, label, addrKey, pointOf, needsLookup, forward, centerOf, dist, distText, FAR_M };
  RV.geo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
