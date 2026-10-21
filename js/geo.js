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
  // Suggested address for a point, or '' (offline, nothing found, slow service).
  async function suggest(pt) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return '';
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
    try {
      const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=' + pt.lat + '&lon=' + pt.lng;
      const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined });
      if (!r.ok) return '';
      const j = await r.json();
      return streetOf(j && j.address);
    } catch (e) { return ''; } finally { if (t) clearTimeout(t); }
  }
  const label = (g) => (g ? g.lat.toFixed(5) + ', ' + g.lng.toFixed(5) + (g.acc ? ' (±' + g.acc + ' m)' : '') : '');

  const api = { here, suggest, streetOf, label };
  RV.geo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
