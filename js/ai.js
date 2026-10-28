/* Groundwork: note cleanup with Claude.
   Two ways in: the shared helper (worker/ai-proxy.js, set in RV.config.aiProxy) that holds Groundwork's key,
   or the person's own Anthropic API key, which wins when set. The own key, model choice and the anonymous
   install ID live in this browser's localStorage only, never in a backup, Drive copy or export.
   Only the note text being cleaned (and Discuss next time) is sent. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const KEY = 'rvapp.aiKey', MODEL = 'rvapp.aiModel', INSTALL = 'rvapp.installId';
  const MODELS = [
    { value: 'claude-haiku-5-5', label: 'Fast' },
    { value: 'claude-sonnet-5-5', label: 'Careful' },
  ];
  const get = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const set = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* ignore */ } };

  const key = () => get(KEY).trim();
  const hasKey = () => !!key();
  const proxy = () => String((RV.config && RV.config.aiProxy) || '').replace(/\/+$/, '');
  const shared = () => !hasKey() && !!proxy();
  const available = () => hasKey() || !!proxy();
  // an anonymous random ID for this install, only used to count today's cleanups on the helper
  function installId() {
    let id = get(INSTALL);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      const a = new Uint8Array(16); (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; });
      id = Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
      set(INSTALL, id);
    }
    return id;
  }
  const model = () => { const m = get(MODEL); return MODELS.some((x) => x.value === m) ? m : MODELS[0].value; };

  const SYSTEM = [
    'You proofread notes for a private follow-up app used in door-to-door Bible-based ministry.',
    'The note was usually dictated with a phone keyboard microphone, so it may lack punctuation or have misheard words.',
    'This is a light proofread, not an edit. The person wants their own words back, corrected.',
    '',
    'Rules for "note":',
    '- Fix spelling, punctuation, capitalization and clearly misheard words. Add sentence breaks and line breaks where they help.',
    '- Write scripture references in standard form (e.g. "john three sixteen" -> "John 3:16", "psalm eighty three eighteen" -> "Psalm 83:18").',
    '- Remove only filler sounds (um, uh, er, hmm) and a word repeated by accident ("the the").',
    '- Never delete, shorten, merge, summarize, reorder or reword anything else. Every detail, name, number, date, aside and opinion stays,',
    '  in the same order, in the person\'s own words, even if it seems minor or repetitive.',
    '- Do not add anything that was not said. No headings, no bullet points unless the speaker listed items.',
    '',
    'Rules for "discussNext":',
    '- Start with the existing "discussNext" text exactly as given (it may be empty).',
    '- If the note says what to bring, show, ask or talk about next time, add that item here as a short line.',
    '  It is a copy: the same words also stay in the note.',
    '- If there is nothing new, return the existing text unchanged.',
    '',
    'Reply with only a JSON object: {"note": "...", "discussNext": "..."}. No other text.',
  ].join('\n');

  // Safety net: a proofread barely changes the word count. Filler and accidental repeats may go, and spoken numbers
  // shrink ("john three sixteen" -> "John 3:16"), so allow a little; more than that means Claude cut content.
  const FILLER = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'mm']);
  const words = (t) => String(t || '').toLowerCase().split(/[^a-z0-9':]+/).filter(Boolean);
  function cutTooMuch(before, after) {
    const w = words(before);
    const kept = w.filter((x, i) => !FILLER.has(x) && x !== w[i - 1]).length;
    const lost = kept - words(after).length;
    return lost > Math.max(3, Math.round(kept * 0.15));
  }

  class AiError extends Error {}

  function parseJson(text) {
    const s = String(text || '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  }

  async function call(body, timeoutMs) {
    if (!available()) throw new AiError('Note cleanup is not set up.');
    if (root.navigator && root.navigator.onLine === false) throw new AiError('No connection. The note is kept as is.');
    const viaProxy = shared();
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs || 45000);
    let res;
    try {
      res = await fetch(viaProxy ? proxy() + '/v1/messages' : 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctl.signal,
        headers: viaProxy ? { 'content-type': 'application/json', 'x-groundwork-install': installId() } : {
          'content-type': 'application/json',
          'x-api-key': key(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(Object.assign({ model: model(), max_tokens: 4000 }, body)),
      });
    } catch (e) {
      throw new AiError(e && e.name === 'AbortError' ? 'Claude took too long. The note is kept as is.' : 'Could not reach Claude. The note is kept as is.');
    } finally { clearTimeout(t); }
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      const code = data && typeof data.error === 'string' ? data.error : '';
      if (viaProxy) {
        if (code === 'daily_limit') throw new AiError('That’s all the cleanups for today. More tomorrow.');
        if (code === 'daily_total') throw new AiError('Note cleanup is resting for today. Try again tomorrow.');
        if (code === 'too_long') throw new AiError('This note is too long to clean up in one go.');
        if (res.status === 503 || res.status === 502) throw new AiError('Claude is busy. Try again in a moment.');
        throw new AiError('Note cleanup is not available right now. The note is kept as is.');
      }
      const msg = data && data.error && data.error.message ? data.error.message : 'HTTP ' + res.status;
      if (res.status === 401 || res.status === 403) throw new AiError('The API key was not accepted.');
      if (res.status === 429 || res.status === 529 || res.status >= 500) throw new AiError('Claude is busy. Try again in a moment.');
      throw new AiError('Claude could not clean this note (' + msg + ').');
    }
    return (data && data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  }

  // Returns { note, discussNext }. discussNext is only meaningful when the caller passed one in (or wants one).
  async function cleanUp(input) {
    const note = String(input.note || '').trim();
    const discussNext = String(input.discussNext || '').trim();
    if (!note) return { note: '', discussNext };
    const out = await call({
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify({ note, discussNext }) }],
    });
    const j = parseJson(out);
    if (!j || typeof j.note !== 'string') throw new AiError('Claude sent back something unexpected. The note is kept as is.');
    const nn = j.note.trim();
    if (!nn) throw new AiError('Claude returned an empty note. The note is kept as is.');
    if (cutTooMuch(note, nn)) throw new AiError('Cleanup changed too much, so your note was kept as is.');
    let dn = typeof j.discussNext === 'string' ? j.discussNext.trim() : discussNext;
    // never lose what was already in Discuss next time
    if (discussNext && !dn.includes(discussNext)) dn = discussNext + (dn ? '\n' + dn : '');
    return { note: nn, discussNext: dn };
  }

  // A tiny request to check the key works.
  async function test() {
    await call({ max_tokens: 20, messages: [{ role: 'user', content: 'Reply with OK.' }] }, 20000);
    return true;
  }

  RV.ai = {
    MODELS, key, hasKey, shared, available, installId, model, cleanUp, test, AiError, parseJson, cutTooMuch,
    setKey: (k) => set(KEY, String(k || '').trim()),
    setModel: (m) => set(MODEL, m),
  };
})(window);
