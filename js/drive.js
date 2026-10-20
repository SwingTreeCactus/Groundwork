/* RV app: Google Drive backup. One visible file in the user's own Drive, written with the drive.file permission
   (the app can only see files it made itself). Sign-in is a full-page redirect, which also works in an installed iPhone app. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const U = RV.util, ST = RV.store;
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FILE_NAME = 'Groundwork backup.json';
  const KEY = 'rvapp.drive';
  const STATE_KEY = 'rvapp.drive.state';
  const SAVE_DELAY = 15000;

  // ---------- pure helpers ----------
  function redirectUri(loc) {
    loc = loc || root.location;
    return loc.origin + loc.pathname.replace(/index\.html$/, '');
  }
  function buildAuthUrl(clientId, redirect, state) {
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'token', scope: SCOPE, state, include_granted_scopes: 'true' });
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + q.toString();
  }
  // returns null when the hash is not an OAuth reply (the app's own routes start with "#/")
  function parseAuthHash(hash) {
    if (!hash || hash.charAt(0) !== '#' || hash.charAt(1) === '/') return null;
    const p = new URLSearchParams(hash.slice(1));
    if (!p.has('access_token') && !p.has('error')) return null;
    return { token: p.get('access_token'), expiresIn: parseInt(p.get('expires_in') || '0', 10), state: p.get('state'), error: p.get('error') };
  }
  function multipartBody(meta, content, boundary) {
    return '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + content + '\r\n--' + boundary + '--';
  }

  // ---------- saved connection ----------
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } };
  let conn = read();
  const save = (patch) => { conn = Object.assign({}, conn, patch); write(conn); changed(); };

  const listeners = new Set();
  function changed() { listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); }
  const st = { busy: false, error: '' };

  const configured = () => !!(RV.config && RV.config.googleClientId);
  const connected = () => !!conn.connected;
  const tokenOk = () => !!(conn.token && conn.expires && conn.expires > Date.now() + 60000);
  const status = () => ({ configured: configured(), connected: connected(), tokenOk: tokenOk(), dirty: !!conn.dirty, lastSaved: conn.lastSaved || null, busy: st.busy, error: st.error });

  // ---------- sign in ----------
  function connect() {
    if (!configured()) return;
    const state = U.uuid();
    try { sessionStorage.setItem(STATE_KEY, state); localStorage.setItem(STATE_KEY, state); } catch (e) { /* ignore */ }
    root.location.assign(buildAuthUrl(RV.config.googleClientId, redirectUri(), state));
  }
  // call once at start, before the first render: picks up the sign-in reply in the address bar
  function handleRedirect() {
    const r = parseAuthHash(root.location.hash);
    if (!r) return null;
    let want = null;
    try { want = sessionStorage.getItem(STATE_KEY) || localStorage.getItem(STATE_KEY); } catch (e) { /* ignore */ }
    const base = redirectUri();
    history.replaceState(null, '', base + '#/settings/data');
    try { sessionStorage.removeItem(STATE_KEY); localStorage.removeItem(STATE_KEY); } catch (e) { /* ignore */ }
    if (r.error || !r.token || (want && r.state !== want)) {
      st.error = r.error === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in did not finish.';
      return { ok: false };
    }
    const fresh = !conn.connected;
    conn = Object.assign({}, conn, { connected: true, token: r.token, expires: Date.now() + r.expiresIn * 1000 });
    write(conn);
    return { ok: true, fresh };
  }
  async function disconnect() {
    const t = conn.token;
    clearTimeout(timer);
    conn = {}; write(conn); st.error = ''; changed();
    if (t) { try { await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST' }); } catch (e) { /* ignore */ } }
  }

  // ---------- Drive calls ----------
  async function call(url, opts) {
    if (!tokenOk()) throw Object.assign(new Error('Reconnect Google Drive.'), { code: 'auth' });
    const res = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + conn.token }, (opts && opts.headers) || {}) }));
    if (res.status === 401) { save({ expires: 0 }); throw Object.assign(new Error('Reconnect Google Drive.'), { code: 'auth' }); }
    if (res.status === 404) throw Object.assign(new Error('Not found'), { code: 'missing' });
    if (!res.ok) throw new Error('Google Drive said no (' + res.status + ').');
    return res;
  }
  async function findFile() {
    const q = "name='" + FILE_NAME + "' and trashed=false";
    const res = await call('https://www.googleapis.com/drive/v3/files?spaces=drive&orderBy=modifiedTime%20desc&fields=files(id,modifiedTime)&q=' + encodeURIComponent(q));
    const j = await res.json();
    return (j.files && j.files[0]) || null;
  }
  async function download(id) {
    const res = await call('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media');
    return res.json();
  }
  async function upload(content) {
    if (conn.fileId) {
      try {
        const res = await call('https://www.googleapis.com/upload/drive/v3/files/' + conn.fileId + '?uploadType=media&fields=id,modifiedTime', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content });
        return res.json();
      } catch (e) { if (e.code !== 'missing') throw e; save({ fileId: null }); }
    }
    const boundary = 'rvapp' + Date.now();
    const res = await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: multipartBody({ name: FILE_NAME, mimeType: 'application/json' }, content, boundary),
    });
    const j = await res.json();
    save({ fileId: j.id });
    return j;
  }

  // ---------- backup ----------
  let merging = false;
  let running = null;
  // Writes everything to Drive. If another device saved since we last did, its records are merged in first so nothing is lost.
  function backupNow() {
    if (running) return running;
    running = (async () => {
      st.busy = true; st.error = ''; changed();
      try {
        await ST.flush();
        let file = conn.fileId ? { id: conn.fileId } : await findFile();
        if (file && !conn.fileId) save({ fileId: file.id });
        if (file) {
          const meta = file.modifiedTime ? file : await (async () => { const r = await call('https://www.googleapis.com/drive/v3/files/' + file.id + '?fields=id,modifiedTime'); return r.json(); })();
          if (!conn.lastSaved || (meta.modifiedTime && new Date(meta.modifiedTime).getTime() > new Date(conn.lastSaved).getTime() + 2000)) {
            const data = await download(file.id);
            merging = true;
            try { await ST.restore(data, 'merge'); } finally { merging = false; }
          }
        }
        const out = await upload(JSON.stringify(ST.exportAll()));
        save({ lastSaved: out.modifiedTime || U.nowISO(), dirty: false });
        try { localStorage.setItem('rvapp.lastBackup', U.toDateStr(new Date())); } catch (e) { /* ignore */ }
        return true;
      } catch (e) {
        st.error = e.code === 'auth' ? '' : (e.message || 'Backup failed.');
        changed();
        return false;
      } finally { st.busy = false; running = null; changed(); }
    })();
    return running;
  }
  async function fetchBackup() {
    const file = conn.fileId ? { id: conn.fileId } : await findFile();
    if (!file) return null;
    save({ fileId: file.id });
    return download(file.id);
  }

  // ---------- autosave ----------
  let timer = null;
  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(() => { if (connected() && conn.dirty && tokenOk()) backupNow(); }, delay);
  }
  function start() {
    ST.subscribe(() => {
      if (!connected() || merging || !ST.S.ready) return;
      if (!conn.dirty) save({ dirty: true });
      schedule(SAVE_DELAY);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && connected() && conn.dirty && tokenOk()) { clearTimeout(timer); backupNow(); }
    });
    if (connected() && tokenOk() && (conn.dirty || !conn.lastSaved)) schedule(3000);
  }

  RV.drive = {
    status, configured, connected, connect, disconnect, handleRedirect, backupNow, fetchBackup, start,
    onChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
    clearError: () => { st.error = ''; changed(); },
    redirectUri, FILE_NAME, _pure: { redirectUri, buildAuthUrl, parseAuthHash, multipartBody },
  };
})(typeof window !== 'undefined' ? window : globalThis);
