/* RV app: small pure helpers (dates, ids, CSV, text). Works in the browser and in Node tests. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  const uuid = () =>
    root.crypto && root.crypto.randomUUID
      ? root.crypto.randomUUID()
      : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

  const pad2 = (n) => String(n).padStart(2, '0');

  // ---- dates (all local time) ----
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const toDateStr = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  function parseDateStr(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  // whole days from b to a (a - b), by calendar day
  const daysBetween = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 864e5);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const nowISO = () => new Date().toISOString();

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAYS3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function fmtTime(d) {
    let h = d.getHours();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + pad2(d.getMinutes()) + ' ' + ap;
  }
  function fmtDateTime(iso, now) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    now = now || new Date();
    const diff = daysBetween(now, d);
    let day;
    if (diff === 0) day = 'Today';
    else if (diff === 1) day = 'Yesterday';
    else day = DAYS3[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== now.getFullYear() ? ', ' + d.getFullYear() : '');
    return day + ' · ' + fmtTime(d);
  }
  function fmtDate(s, now) {
    const d = typeof s === 'string' ? parseDateStr(s) : s;
    if (!d) return '';
    now = now || new Date();
    return DAYS3[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== now.getFullYear() ? ', ' + d.getFullYear() : '');
  }
  function relDays(n) {
    if (n === 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 14) return n + ' days ago';
    if (n < 60) return Math.round(n / 7) + ' weeks ago';
    if (n < 700) return Math.round(n / 30) + ' months ago';
    return Math.round(n / 365) + ' years ago';
  }
  function relTime(iso, now) {
    const d = new Date(iso);
    now = now || new Date();
    const mins = Math.round((now - d) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    const days = daysBetween(now, d);
    if (days === 0) return Math.round(mins / 60) + ' h ago';
    return relDays(days);
  }
  function inDaysText(n) {
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    return 'in ' + n + ' days';
  }

  // ---- text ----
  const collator = typeof Intl !== 'undefined' ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }) : null;
  const cmp = (a, b) => (collator ? collator.compare(a || '', b || '') : String(a || '').localeCompare(String(b || '')));

  const ABBR = {
    street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', lane: 'ln', court: 'ct', boulevard: 'blvd',
    place: 'pl', circle: 'cir', terrace: 'ter', highway: 'hwy', apartment: 'apt', north: 'n', south: 's', east: 'e', west: 'w',
  };
  function normAddress(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[.,#]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ABBR[w] || w)
      .join(' ');
  }
  function digits(s) {
    return String(s || '').replace(/\D/g, '');
  }
  // "123 Oak St" -> {num:'123', street:'Oak St'}
  function parseAddress(a) {
    const m = /^\s*(\d+)\s*([A-Za-z]?)\s+(.+)$/.exec(a || '');
    return m ? { num: m[1], street: m[3].trim() } : { num: '', street: String(a || '').trim() };
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uniq = (arr) => Array.from(new Set(arr));
  const splitList = (s) => uniq(String(s || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean));

  // ---- CSV ----
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let q = false;
    for (const ch of firstLine) {
      if (ch === '"') q = !q;
      else if (!q && counts[ch] !== undefined) counts[ch]++;
    }
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const sep = counts[delim] ? delim : ',';
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === sep) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
  }
  function stringifyCSV(rows) {
    return rows
      .map((r) =>
        r
          .map((v) => {
            const s = v == null ? '' : String(v);
            return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(',')
      )
      .join('\r\n');
  }

  // ---- hashing (PIN) ----
  async function sha256hex(str) {
    if (root.crypto && root.crypto.subtle) {
      const buf = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // weak fallback for non-secure contexts (still keeps the PIN out of plain text)
    let h1 = 0x811c9dc5, h2 = 0x1b873593;
    for (let i = 0; i < str.length; i++) {
      h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619);
      h2 = Math.imul(h2 + str.charCodeAt(i), 2654435761);
    }
    return 'f' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }

  function debounce(fn, ms) {
    let t;
    return function (...a) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, a), ms);
    };
  }

  RV.util = {
    uuid, pad2, startOfDay, toDateStr, parseDateStr, daysBetween, addDays, nowISO,
    MONTHS, DAYS, DAYS3, fmtTime, fmtDateTime, fmtDate, relDays, relTime, inDaysText,
    cmp, normAddress, digits, parseAddress, esc, uniq, splitList, parseCSV, stringifyCSV, sha256hex, debounce,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.util;
})(typeof window !== 'undefined' ? window : globalThis);
