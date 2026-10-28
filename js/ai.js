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
        if (code === 'too_long') throw new AiError('This is too long to send in one go.');
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

  // ---------- notes import: turn free-form notes into contacts ----------
  const IMPORT_SYSTEM = [
    'You turn someone\'s personal notes into contact records for a private follow-up app used in door-to-door Bible-based ministry.',
    'The notes come from a phone notes app (Samsung Notes, Google Keep, Apple Notes). They were written by the person who made the visits.',
    'People write them many ways: one note per person, or one long note covering a street or a whole territory; dated logs; lists; shorthand.',
    '',
    'Make one contact per person or household being followed up.',
    '- A note may describe one person or many; split many into separate contacts. The same person in several notes in this batch is one contact.',
    '- A note title is often the person\'s name or the street. Use it when it helps.',
    '- Skip notes or lines that are not about someone to follow up (shopping lists, meeting parts, personal reminders). Leave out nothing about a person.',
    '',
    'Fields:',
    '- name: as written (a first name is fine). A couple or household: "Maria and José". No name given: a short description from the note,',
    '  like "Older man, blue house" or "Woman at 412 Oak". Never empty.',
    '- address: street address with apartment or unit, and city or zip if given. Only a vague place (corner store, the park): leave address empty',
    '  and keep the place in notes.',
    '- phone: as written.',
    '- visits: for each dated entry about this person (a date followed by what happened), {"date": "YYYY-MM-DD", "type": "visit", "text": ...}.',
    '  A dated not-at-home ("NH", "not home", "no answer") is {"date": ..., "type": "nh", "text": ""}.',
    '  A date without a year: the most recent such date on or before the note\'s date (or today if the note has no date). Never invent a date.',
    '- notes: everything else about the person: family, work, interests, beliefs, best time to call, what was placed or read, background,',
    '  undated conversations.',
    '- discussNext: short lines for what to bring, show, ask or talk about next time. Copy them; they also stay in notes or the visit text.',
    '- nextVisit: "YYYY-MM-DD" only when a specific next date is stated, else "".',
    '- study: true only if the note says a Bible study is being held with them.',
    '- source: the id of the note or screenshot it came from.',
    '',
    'Screenshots: some notes come as screenshots of a notes app. Read the note text in them; ignore the phone\'s status bar,',
    'app buttons and keyboard. Screenshots in one request were taken close together, in order, and may continue the same note.',
    'A screenshot\'s date is when it was taken.',
    '',
    'Wording: keep the writer\'s own words. Fix only spelling, capitalization and punctuation, and write scripture references in standard form',
    '(John 3:16). Never summarize, shorten, reword or drop details. Every word about a person ends up in that contact\'s notes, visits or discussNext.',
    '',
    'Reply with only a JSON object: {"contacts": [{"name": "", "address": "", "phone": "", "notes": "", "discussNext": "", "nextVisit": "",',
    '"study": false, "visits": [], "source": ""}]}. If nothing is about a person, {"contacts": []}. No other text.',
  ].join('\n');

  // notes: [{id, title, date, text}] (one batch), or shots: [{id, taken (ms), data (JPEG base64)}].
  // Returns the raw contact list from Claude.
  async function readNotes(notes, today, shots) {
    const day = today || new Date().toISOString().slice(0, 10);
    let content;
    if (shots && shots.length) {
      content = [{ type: 'text', text: JSON.stringify({ today: day, screenshots: shots.map((s) => ({ id: s.id, taken: new Date(s.taken).toISOString().slice(0, 16) })) }) }];
      shots.forEach((s) => content.push({ type: 'text', text: 'Screenshot ' + s.id }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: s.data } }));
    } else content = JSON.stringify({ today: day, notes });
    const out = await call({ system: IMPORT_SYSTEM, messages: [{ role: 'user', content }] }, 120000);
    const j = parseJson(out);
    if (!j || !Array.isArray(j.contacts)) throw new AiError('Claude sent back something unexpected.');
    return j.contacts;
  }

  // A tiny request to check the key works.
  async function test() {
    await call({ max_tokens: 20, messages: [{ role: 'user', content: 'Reply with OK.' }] }, 20000);
    return true;
  }

  RV.ai = {
    MODELS, key, hasKey, shared, available, installId, model, cleanUp, test, AiError, parseJson, cutTooMuch, readNotes, IMPORT_SYSTEM,
    setKey: (k) => set(KEY, String(k || '').trim()),
    setModel: (m) => set(MODEL, m),
  };
})(window);
