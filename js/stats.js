/* Groundwork v2.56: anonymous usage counts. At most once a day, when the app is open and online, it tells the stats
   helper (worker/stats.js, RV.config.stats) only: the install's random code (the one Note cleanup uses, kept across
   updates and Erase all data), the app version, iPhone / Android / computer, installed or in a browser, and which
   features are on. Never names, notes, addresses or how many contacts. Off with the switch in About
   (localStorage rvapp.statsOff = '1'), and nothing is sent until RV.config.stats is set. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const DAY = 'rvapp.statsDay', OFF = 'rvapp.statsOff', CLEAN = 'rvapp.cleanupUsed';
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const url = () => String((RV.config && RV.config.stats) || '').replace(/\/+$/, '');
  const configured = () => !!url();
  const on = () => get(OFF) !== '1';
  const setOn = (v) => set(OFF, v ? null : '1');
  const today = () => RV.util.toDateStr(new Date());

  function device() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
  }
  function mode() {
    try { if (navigator.standalone || root.matchMedia('(display-mode: standalone)').matches) return 'installed'; } catch (e) { /* ignore */ }
    return 'browser';
  }
  // which features are on (or were used this week); flags only, never the content
  function features() {
    const S = RV.store.S, f = [];
    const weekAgo = Date.now() - 7 * 864e5;
    if (S.settings.garden !== false) f.push('garden');
    const svc = S.settings.service || {};
    if (svc.setup) f.push('calendar');
    try { if (RV.drive && RV.drive.status().connected) f.push('drive'); } catch (e) { /* ignore */ }
    try { if (RV.reminders && RV.reminders.state().on) f.push('reminders'); } catch (e) { /* ignore */ }
    const c = get(CLEAN); if (c && Date.parse(c) >= weekAgo) f.push('cleanup');
    if (S.entries.some((e) => !e.deletedAt && !e.imported && (e.type === 'visit' || e.type === 'nh') && Date.parse(e.at) >= weekAgo)) f.push('visits');
    return f;
  }
  const payload = () => ({ id: RV.ai.installId(), v: RV.VERSION, device: device(), mode: mode(), f: features() });

  let busy = false;
  async function ping(force) {
    if (busy || !configured() || !on() || !RV.store.S.ready || (!force && get(DAY) === today())) return false;
    if (navigator.onLine === false) return false;
    busy = true;
    try {
      const r = await fetch(url() + '/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()), keepalive: true, credentials: 'omit' });
      if (r.ok) { set(DAY, today()); return true; }
      return false;
    } catch (e) { return false; } finally { busy = false; }
  }
  // called when the app opens and whenever it comes back to the foreground
  function start() {
    setTimeout(() => ping(), 4000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => ping(), 4000); });
  }
  const usedCleanup = () => set(CLEAN, new Date().toISOString());

  RV.stats = { configured, on, setOn, ping, start, payload, device, mode, features, usedCleanup, url };
})(window);
