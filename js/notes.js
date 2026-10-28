/* Groundwork: notes import, the plain parts (no screen, no network).
   Reads notes from text files, Google Keep exports (Takeout .json/.html) and zips of those, packs them into
   batches for Claude, and turns Claude's answer into contacts and timeline entries for review. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  const BATCH_CHARS = 6000; // per request: small enough that Claude's reply (the same words back) fits

  // ---------- reading files ----------
  const ext = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const base = (name) => String(name || '').split('/').pop().replace(/\.[^.]+$/, '');
  const decodeText = (bytes) => new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');

  function htmlToText(html) {
    let s = String(html || '')
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '');
    const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
    s = s.replace(/&(#x?[0-9a-f]+|[a-z]+|#39);/gi, (m, e) => {
      if (ent[e.toLowerCase()] != null) return ent[e.toLowerCase()];
      if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n ? String.fromCodePoint(n) : m; }
      return m;
    });
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // A Google Keep note from Takeout (.json). Trashed notes are skipped.
  function fromKeepJson(j, name) {
    if (!j || typeof j !== 'object' || j.isTrashed) return null;
    const list = Array.isArray(j.listContent) ? j.listContent.map((x) => '- ' + (x.text || '')).join('\n') : '';
    const text = [j.textContent || '', list].filter(Boolean).join('\n').trim();
    const us = Number(j.userEditedTimestampUsec || j.createdTimestampUsec || 0);
    return text ? { title: String(j.title || '').trim() || base(name), text, date: us ? new Date(us / 1000).toISOString() : null } : null;
  }

  // Unzip in the browser (stored or deflated entries). Returns [{name, bytes}].
  async function unzip(buf) {
    const u = new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let eocd = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a zip');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = decodeText(u.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = u.subarray(start, start + csize);
      if (method === 0) out.push({ name, bytes: data });
      else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open zip files');
        const r = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
        out.push({ name, bytes: new Uint8Array(r) });
      }
    }
    return out;
  }

  // files: [{name, bytes (Uint8Array) | text, lastModified?}] -> { notes: [{title, text, date, from}], skipped: [names] }
  async function readFiles(files) {
    const notes = [], skipped = [];
    const flat = [];
    for (const f of files) {
      if (ext(f.name) === 'zip') {
        try { (await unzip(f.bytes)).forEach((x) => flat.push({ name: x.name, bytes: x.bytes, lastModified: f.lastModified, zip: f.name })); }
        catch (e) { skipped.push(f.name); }
      } else flat.push(f);
    }
    // Takeout has both .json and .html for each Keep note; use the .json
    const jsonBases = new Set(flat.filter((f) => ext(f.name) === 'json').map((f) => f.name.replace(/\.json$/i, '')));
    for (const f of flat) {
      const e = ext(f.name);
      const text = f.text != null ? String(f.text) : f.bytes ? decodeText(f.bytes) : '';
      const date = f.lastModified ? new Date(f.lastModified).toISOString() : null;
      let note = null;
      if (e === 'json') {
        let j = null; try { j = JSON.parse(text); } catch (err) { /* not JSON */ }
        note = j ? fromKeepJson(j, f.name) : null;
      } else if (e === 'html' || e === 'htm') {
        if (jsonBases.has(f.name.replace(/\.html?$/i, '')) || /archive_browser\.html$/i.test(f.name)) continue;
        const t = /<title>([^<]*)<\/title>/i.exec(text);
        const body = htmlToText(text.replace(/<title>[^<]*<\/title>/i, ''));
        note = body ? { title: (t && t[1].trim()) || base(f.name), text: body, date } : null;
      } else if (e === 'txt' || e === 'md' || e === 'text' || (!e && text && !/\u0000/.test(text))) {
        note = text.trim() ? { title: base(f.name), text: text.trim(), date } : null;
      } else { skipped.push(f.name); continue; }
      if (note) notes.push(Object.assign(note, { from: f.zip ? f.zip + ' › ' + f.name.split('/').pop() : f.name }));
      else if (!/(^|\/)(\.|__MACOSX)/.test(f.name) && e !== 'json') skipped.push(f.name);
    }
    return { notes, skipped };
  }

  // ---------- batches for Claude ----------
  // A long note is cut at blank lines; notes are packed together up to BATCH_CHARS.
  function batches(notes, limit) {
    const max = limit || BATCH_CHARS;
    const parts = [];
    notes.forEach((n, i) => {
      if (n.text.length <= max) { parts.push({ id: 'n' + (i + 1), title: n.title, date: n.date ? n.date.slice(0, 10) : '', text: n.text }); return; }
      const paras = n.text.split(/\n\s*\n/);
      let cur = '', k = 1;
      const push = () => { if (cur.trim()) parts.push({ id: 'n' + (i + 1) + '.' + k++, title: n.title, date: n.date ? n.date.slice(0, 10) : '', text: cur.trim() }); cur = ''; };
      paras.forEach((p) => {
        if (p.length > max) { push(); for (let s = 0; s < p.length; s += max) { cur = p.slice(s, s + max); push(); } return; }
        if (cur.length + p.length + 2 > max) push();
        cur += (cur ? '\n\n' : '') + p;
      });
      push();
    });
    const out = [];
    let b = [], size = 0;
    parts.forEach((p) => {
      if (b.length && size + p.text.length > max) { out.push(b); b = []; size = 0; }
      b.push(p); size += p.text.length;
    });
    if (b.length) out.push(b);
    return out;
  }

  // ---------- Claude's answer -> records ----------
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00'));
  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  // Keeps only well-formed contacts. Each gets a stable key for the review list.
  function cleanContacts(list) {
    return (Array.isArray(list) ? list : []).map((c, i) => {
      if (!c || typeof c !== 'object') return null;
      const visits = (Array.isArray(c.visits) ? c.visits : [])
        .map((v) => ({ date: isDate(v && v.date) ? v.date : '', text: str(v && v.text), type: v && v.type === 'nh' ? 'nh' : 'visit' }))
        .filter((v) => v.date && (v.text || v.type === 'nh'));
      const undated = (Array.isArray(c.visits) ? c.visits : []).filter((v) => v && !isDate(v.date) && str(v.text)).map((v) => str(v.text));
      const notes = [str(c.notes)].concat(undated).filter(Boolean).join('\n\n');
      const name = str(c.name);
      if (!name && !notes && !visits.length) return null;
      return {
        key: 'c' + i + '-' + Math.random().toString(36).slice(2, 7),
        name: name || 'Unnamed', address: str(c.address), phone: str(c.phone), notes,
        discussNext: str(c.discussNext), nextVisit: isDate(c.nextVisit) ? c.nextVisit : '',
        study: c.study === true, visits: visits.sort((a, b) => (a.date < b.date ? -1 : 1)), source: str(c.source),
      };
    }).filter(Boolean);
  }

  // contact -> { rv (fields for blankRv), entries }. uuid and stage come from the app.
  function toRecord(c, opts) {
    const now = new Date().toISOString();
    const noon = (d) => new Date(d + 'T12:00:00').toISOString();
    const first = c.visits.length ? noon(c.visits[0].date) : now;
    const rv = Object.assign({
      id: opts.uuid(), name: c.name, address: c.address, phone: c.phone, notes: c.notes, whatsNext: c.discussNext,
      neighborhood: c.neighborhood || '',
      nextVisit: c.nextVisit || null, stage: c.stage || (c.study && opts.studyStage ? opts.studyStage : opts.stage), imported: true,
      createdAt: first < now ? first : now, stageChangedAt: now, updatedAt: now,
    }, c.extra || {}); // fields set in Edit details (best days, tags, how met…)
    const entries = c.visits.map((v) => ({
      id: opts.uuid(), rvId: rv.id, type: v.type, at: noon(v.date), text: v.text, scriptures: [], imported: true, updatedAt: now, deletedAt: null,
    }));
    return { rv, entries };
  }

  // ---------- screenshots ----------
  // Screenshots taken within 10 minutes of each other are one group (often one long note, scrolled).
  const SHOT_GAP = 10 * 60 * 1000, SHOTS_PER_BATCH = 4;
  function groupShots(shots) {
    const sorted = shots.slice().sort((a, b) => a.taken - b.taken || (a.name < b.name ? -1 : 1));
    const groups = [];
    sorted.forEach((s) => {
      const g = groups[groups.length - 1];
      if (g && s.taken - g[g.length - 1].taken <= SHOT_GAP) g.push(s); else groups.push([s]);
    });
    return groups;
  }
  // Each group is read in order, up to 4 screenshots per request (so a group of 6 is 4 then 2).
  function shotBatches(shots) {
    const out = [];
    groupShots(shots).forEach((g) => { for (let i = 0; i < g.length; i += SHOTS_PER_BATCH) out.push(g.slice(i, i + SHOTS_PER_BATCH)); });
    return out;
  }
  // Browser only: a screenshot shrunk to 1500 px on its long side, as JPEG base64 (smaller upload, same reading).
  async function shrinkImage(file, max) {
    const m = max || 1500;
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, m / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), hgt = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = hgt;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, hgt);
    cx.drawImage(bmp, 0, 0, w, hgt);
    if (bmp.close) bmp.close();
    const url = cv.toDataURL('image/jpeg', 0.85);
    return { data: url.slice(url.indexOf(',') + 1), url, width: w, height: hgt };
  }
  // Browser only: picked image files -> screenshots ready to send [{id, name, taken, data, url}]
  async function prepShots(files, startAt) {
    const out = [];
    let n = startAt || 0;
    for (const f of files) {
      if (!/^image\//.test(f.type || '') && !/\.(png|jpe?g|webp|heic|gif)$/i.test(f.name || '')) continue;
      try { const im = await shrinkImage(f); out.push({ id: 's' + (++n), name: f.name, taken: f.lastModified || Date.now(), data: im.data, url: im.url }); }
      catch (e) { /* not an image the browser can open */ }
    }
    return out;
  }
  // Browser only: a file picker for images, many at once
  function pickImages() {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.style.display = 'none';
      inp.addEventListener('change', () => { const l = Array.from(inp.files || []); inp.remove(); resolve(l); });
      inp.addEventListener('cancel', () => { inp.remove(); resolve([]); });
      document.body.appendChild(inp);
      inp.click();
    });
  }
  // Browser only: the text on the clipboard, or null when the browser won't give it (then show a paste box).
  async function readClipboard() {
    try {
      if (!root.navigator || !navigator.clipboard || !navigator.clipboard.readText) return null;
      const t = await navigator.clipboard.readText();
      return typeof t === 'string' ? t : null;
    } catch (e) { return null; }
  }

  RV.notesImport = { BATCH_CHARS, htmlToText, fromKeepJson, unzip, readFiles, batches, cleanContacts, toRecord, groupShots, shotBatches, shrinkImage, readClipboard, prepShots, pickImages };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.notesImport;
})(typeof window !== 'undefined' ? window : globalThis);
