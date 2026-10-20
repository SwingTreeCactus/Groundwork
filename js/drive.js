/* Groundwork: Google Drive backup. A "Groundwork" folder in the user's own Drive holds the current backup file plus one
   dated copy per day (the last 7 days). Written with the drive.file permission, so the app can only see files and folders
   it made itself. Sign-in is a full-page redirect, which also works in an installed iPhone app. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const U = RV.util, ST = RV.store;
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FILE_NAME = 'Groundwork backup.json';
  const FOLDER_NAME = 'Groundwork';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const SNAP_RE = /^Groundwork backup (\d{4}-\d{2}-\d{2})\.json$/;
  const KEEP_SNAPSHOTS = 7;
  const API = 'https://www.googleapis.com/drive/v3/files';
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
  const snapName = (day) => 'Groundwork backup ' + day + '.json';
  // which dated copies to move to the bin: everything past the newest `keep`
  function snapshotsToTrim(files, keep) {
    return files.filter((f) => SNAP_RE.test(f.name)).sort((a, b) => (a.name < b.name ? 1 : -1)).slice(keep);
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
    const res = await call(API + '?spaces=drive&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime)&q=' + encodeURIComponent(q));
    const j = await res.json();
    return (j.files && j.files[0]) || null;
  }
  async function download(id) {
    const res = await call('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media');
    return res.json();
  }
  const jsonOpts = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  // The app's own "Groundwork" folder. It must be made by the app: with drive.file a folder made by hand is invisible to it.
  async function ensureFolder(verify) {
    if (conn.folderId && !verify) return conn.folderId;
    if (conn.folderId) {
      try { const j = await (await call(API + '/' + conn.folderId + '?fields=id,trashed')).json(); if (!j.trashed) return conn.folderId; } catch (e) { if (e.code !== 'missing') throw e; }
      save({ folderId: null, inFolder: null });
    }
    const q = "mimeType='" + FOLDER_MIME + "' and name='" + FOLDER_NAME + "' and trashed=false";
    const found = await (await call(API + '?spaces=drive&orderBy=createdTime&fields=files(id)&q=' + encodeURIComponent(q))).json();
    let id = found.files && found.files[0] && found.files[0].id;
    if (!id) id = (await (await call(API + '?fields=id', jsonOpts('POST', { name: FOLDER_NAME, mimeType: FOLDER_MIME }))).json()).id;
    save({ folderId: id });
    return id;
  }
  // Moves a backup saved before the folder existed into it (once per file).
  async function ensureInFolder(fileId, retried) {
    const folderId = await ensureFolder(!!retried);
    if (conn.inFolder === fileId + ':' + folderId) return;
    try {
      const j = await (await call(API + '/' + fileId + '?fields=parents')).json();
      const parents = j.parents || [];
      if (parents.indexOf(folderId) < 0) {
        const q = new URLSearchParams({ addParents: folderId, fields: 'id' });
        if (parents.length) q.set('removeParents', parents.join(','));
        await call(API + '/' + fileId + '?' + q.toString(), jsonOpts('PATCH', {}));
      }
    } catch (e) {
      // the folder was deleted: make a new one and try once more
      if (e.code !== 'missing' || retried) throw e;
      save({ folderId: null, inFolder: null });
      return ensureInFolder(fileId, true);
    }
    save({ inFolder: fileId + ':' + folderId });
  }
  async function listFolder() {
    const folderId = await ensureFolder();
    const q = "'" + folderId + "' in parents and trashed=false";
    const j = await (await call(API + '?spaces=drive&pageSize=100&fields=files(id,name,modifiedTime)&q=' + encodeURIComponent(q))).json();
    return j.files || [];
  }
  // Before the first save of a new day, keep a dated copy of the backup as it stood (copied inside Drive, no upload).
  async function snapshot(file) {
    const day = file.modifiedTime ? U.toDateStr(new Date(file.modifiedTime)) : null;
    if (!day || day === U.toDateStr(new Date()) || conn.snapDay === day) return;
    try {
      const folderId = await ensureFolder();
      const files = await listFolder();
      if (!files.some((f) => f.name === snapName(day))) {
        await call(API + '/' + file.id + '/copy?fields=id', jsonOpts('POST', { name: snapName(day), parents: [folderId] }));
        files.push({ name: snapName(day) });
      }
      save({ snapDay: day });
      for (const f of snapshotsToTrim(files, KEEP_SNAPSHOTS)) if (f.id) await call(API + '/' + f.id + '?fields=id', jsonOpts('PATCH', { trashed: true }));
    } catch (e) {
      if (e.code === 'auth') throw e;
      if (e.code === 'missing') save({ folderId: null, inFolder: null });
      console.warn('Daily copy skipped:', e.message);
    }
  }

  async function upload(content) {
    if (conn.fileId) {
      try {
        const res = await call('https://www.googleapis.com/upload/drive/v3/files/' + conn.fileId + '?uploadType=media&fields=id,modifiedTime', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content });
        return res.json();
      } catch (e) { if (e.code !== 'missing') throw e; save({ fileId: null }); }
    }
    const folderId = await ensureFolder(true);
    const boundary = 'rvapp' + Date.now();
    const res = await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: multipartBody({ name: FILE_NAME, mimeType: 'application/json', parents: [folderId] }, content, boundary),
    });
    const j = await res.json();
    save({ fileId: j.id, inFolder: j.id + ':' + folderId });
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
        let meta = null;
        if (conn.fileId) {
          try { meta = await (await call(API + '/' + conn.fileId + '?fields=id,modifiedTime,trashed')).json(); } catch (e) { if (e.code !== 'missing') throw e; }
          if (!meta || meta.trashed) { meta = null; save({ fileId: null, inFolder: null }); }
        }
        if (!meta) { meta = await findFile(); if (meta) save({ fileId: meta.id }); }
        if (meta) {
          await ensureInFolder(meta.id);
          await snapshot(meta);
          if (!conn.lastSaved || (meta.modifiedTime && new Date(meta.modifiedTime).getTime() > new Date(conn.lastSaved).getTime() + 2000)) {
            const data = await download(meta.id);
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
  // The backups Restore can offer: the current file first, then the dated copies, newest first.
  async function listBackups() {
    let current = null;
    if (conn.fileId) {
      try { current = await (await call(API + '/' + conn.fileId + '?fields=id,name,modifiedTime,trashed')).json(); } catch (e) { if (e.code !== 'missing') throw e; }
      if (current && current.trashed) current = null;
    }
    if (!current) { current = await findFile(); if (current) save({ fileId: current.id }); }
    const out = current ? [{ id: current.id, modifiedTime: current.modifiedTime || null, day: null }] : [];
    if (conn.folderId || current) {
      try {
        (await listFolder()).forEach((f) => { const m = SNAP_RE.exec(f.name); if (m) out.push({ id: f.id, modifiedTime: f.modifiedTime || null, day: m[1] }); });
      } catch (e) { if (e.code === 'auth') throw e; }
    }
    return [out[0]].filter(Boolean).concat(out.slice(1).sort((a, b) => (a.day < b.day ? 1 : -1)));
  }
  async function fetchBackup(id) {
    if (id) return download(id);
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
    status, configured, connected, connect, disconnect, handleRedirect, backupNow, listBackups, fetchBackup, start,
    onChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
    clearError: () => { st.error = ''; changed(); },
    redirectUri, FILE_NAME, FOLDER_NAME, _pure: { redirectUri, buildAuthUrl, parseAuthHash, multipartBody, snapName, snapshotsToTrim },
  };
})(typeof window !== 'undefined' ? window : globalThis);
