/* Groundwork v2.52: follow-up reminders. A morning push notification on days with a follow-up, sent by the
   reminders helper (worker/reminders.js). The helper only ever gets the dates that have a follow-up, the reminder
   time and the time zone, under an anonymous ID of its own (not the cleanup one); the service worker writes the
   names from this phone's own records when the push arrives. Off until turned on in Menu › Notifications. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const U = RV.util;
  const KEY = 'rvapp.remind', ID = 'rvapp.remindId';
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const cfg = () => RV.config || {};
  const helper = () => String(root.__RV_REMINDERS != null ? root.__RV_REMINDERS : cfg().reminders || '').replace(/\/$/, '');
  const vapid = () => String(root.__RV_VAPID != null ? root.__RV_VAPID : cfg().vapidPublic || '');

  // ---------- pure ----------
  // The dates to send: every follow-up date from today on, for contacts still open. Today drops off once everyone
  // with a follow-up today has had a visit or Not Home today (so nothing is sent for a day already done).
  function datesToSend(items, now) {
    now = now || new Date();
    const today = U.toDateStr(now), t0 = U.startOfDay(now).getTime();
    const open = items.filter((it) => !it.rv.deletedAt && it.att.state !== 'closed' && it.rv.snoozedUntil && it.rv.snoozedUntil >= today);
    const doneToday = (it) => it.entries.some((e) => !e.deletedAt && (e.type === 'visit' || e.type === 'nh') && new Date(e.at).getTime() >= t0);
    const dates = new Set(open.map((it) => it.rv.snoozedUntil));
    const todays = open.filter((it) => it.rv.snoozedUntil === today);
    if (todays.length && todays.every(doneToday)) dates.delete(today);
    return Array.from(dates).sort();
  }
  // The words of the notification, from names ("Follow-up today: Maria Lopez"; "3 follow-ups today: Maria, James
  // and Linda"). The service worker has its own copy of this (it can't load this file).
  function message(names) {
    const first = (n) => String(n || '').split(' ')[0];
    if (!names.length) return { title: 'Follow-ups today', body: 'Open Groundwork to see who.' };
    if (names.length === 1) return { title: 'Follow-up today', body: names[0] };
    if (names.length === 2) return { title: 'Follow-ups today', body: names[0] + ' and ' + names[1] };
    const f = names.map(first);
    return { title: names.length + ' follow-ups today', body: f.slice(0, -1).join(', ') + ' and ' + f[f.length - 1] };
  }

  // ---------- state ----------
  function state() {
    let s = null;
    try { s = JSON.parse(get(KEY) || 'null'); } catch (e) { s = null; }
    // on: subscribed; fu: follow-up reminders (the original switch); svc: the service time reminder (v2.53)
    return Object.assign({ on: false, time: '08:00', fu: true, svc: false }, s || {});
  }
  const save = (s) => set(KEY, JSON.stringify(s));
  function remindId() {
    let id = get(ID);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id || '')) {
      const a = new Uint8Array(16); root.crypto.getRandomValues(a);
      id = Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
      set(ID, id);
    }
    return id;
  }
  // Can this phone get reminders at all? ('ios-browser': an iPhone browser tab, which needs the home-screen app)
  function support() {
    if (!helper() || !vapid()) return 'off';
    const standalone = (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || root.navigator.standalone === true;
    if (/iPhone|iPad|iPod/.test(root.navigator.userAgent || '') && !standalone) return 'ios-browser';
    if (!('serviceWorker' in root.navigator) || !('PushManager' in root) || !('Notification' in root)) return 'unsupported';
    return 'ok';
  }
  const keyBytes = (b64) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  async function subscription(create) {
    const reg = await root.navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid()) });
    return sub;
  }
  async function post(path, body) {
    const r = await fetch(helper() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('helper ' + r.status);
  }
  // v2.53: the dates for whichever reminders are on: follow-ups, and the morning after a day with visits but no time
  function dates(s) {
    const now = new Date();
    const fu = s.fu !== false ? datesToSend(RV.store.items(), now) : [];
    const sv = s.svc && RV.service ? RV.service.remindDates(RV.service.data(), now) : [];
    const rv = RV.service ? [RV.service.reviewPushDate(RV.service.data(), now)].filter(Boolean) : []; // v2.54.1: once, either switch
    return Array.from(new Set(fu.concat(sv, rv))).sort();
  }
  // Send the current dates (and time) to the helper. Quietly does nothing when reminders are off.
  async function sync() {
    const s = state();
    if (!s.on || support() !== 'ok') return false;
    const sub = await subscription(false);
    if (!sub) return false;
    const j = sub.toJSON();
    await post('/subscribe', { id: remindId(), sub: { endpoint: j.endpoint, keys: j.keys }, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, time: s.time,
      dates: dates(s) });
    s.synced = U.nowISO(); save(s);
    return true;
  }
  // Turn on: ask for permission (once), subscribe, send the dates. Returns 'on', 'denied' or 'error'.
  async function enable(time) {
    const s = state();
    if (time) s.time = time;
    try {
      const p = root.Notification.permission === 'granted' ? 'granted' : await root.Notification.requestPermission();
      if (p !== 'granted') return 'denied';
      await subscription(true);
      s.on = true; save(s);
      await sync();
      return 'on';
    } catch (e) { return 'error'; }
  }
  async function disable() {
    const s = state(); s.on = false; save(s);
    try { const sub = await subscription(false); if (sub) await sub.unsubscribe(); } catch (e) { /* ignore */ }
    try { await post('/unsubscribe', { id: remindId() }); } catch (e) { /* the helper forgets it when the push service says it's gone */ }
  }
  async function setTime(t) { const s = state(); s.time = t; save(s); try { await sync(); } catch (e) { /* next change retries */ } }

  // Keep the helper's dates current: a few seconds after any change, while reminders are on.
  let timer = null, lastSent = '';
  function watch() {
    if (!RV.store || !RV.store.subscribe) return;
    RV.store.subscribe(() => {
      if (!state().on) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const key = dates(state()).join(',') + '|' + state().time;
        if (key === lastSent) return;
        sync().then((ok) => { if (ok) lastSent = key; }).catch(() => { /* next change retries */ });
      }, 4000);
    });
  }

  // v2.53: two switches share one subscription; it goes when both are off
  async function setKind(k, on, time) {
    const s = state();
    if (on && !s.on) { s.fu = k === 'fu'; s.svc = k === 'svc'; save(s); return enable(time); } // only the one switched on
    s[k] = !!on; save(s);
    const other = k === 'fu' ? !!s.svc : s.fu !== false;
    if (!on && !other) { await disable(); return 'off'; }
    try { await sync(); } catch (e) { /* next change retries */ }
    return 'on';
  }
  RV.reminders = { datesToSend, dates, message, state, support, enable, disable, setTime, setKind, sync, watch };
  if (typeof module !== 'undefined') module.exports = RV.reminders;
})(typeof window !== 'undefined' ? window : globalThis);
