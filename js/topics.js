// v2.40: conversation topics: scripture references (parse, link, index) and a forgiving search.
// Pure functions; the topics themselves are lib items (kind 'topic'), some seeded from RV.library.
(function (root) {
  const RV = (root.RV = root.RV || {});

  // The 66 books: [number, NWT abbreviation, full name, other spellings]
  const BOOKS = [
    [1, 'Ge', 'Genesis', 'gen gn'], [2, 'Ex', 'Exodus', 'exo exod'], [3, 'Le', 'Leviticus', 'lev lv'], [4, 'Nu', 'Numbers', 'num nm'],
    [5, 'De', 'Deuteronomy', 'deut dt'], [6, 'Jos', 'Joshua', 'josh'], [7, 'Jg', 'Judges', 'judg jdg'], [8, 'Ru', 'Ruth', 'rth'],
    [9, '1Sa', '1 Samuel', '1sam'], [10, '2Sa', '2 Samuel', '2sam'], [11, '1Ki', '1 Kings', '1kgs 1kin'], [12, '2Ki', '2 Kings', '2kgs 2kin'],
    [13, '1Ch', '1 Chronicles', '1chr 1chron'], [14, '2Ch', '2 Chronicles', '2chr 2chron'], [15, 'Ezr', 'Ezra', ''], [16, 'Ne', 'Nehemiah', 'neh'],
    [17, 'Es', 'Esther', 'est esth'], [18, 'Job', 'Job', 'jb'], [19, 'Ps', 'Psalms', 'psalm psa pss'], [20, 'Pr', 'Proverbs', 'prov pro prv'],
    [21, 'Ec', 'Ecclesiastes', 'eccl ecc qoh'], [22, 'Ca', 'Song of Solomon', 'song sos canticles'], [23, 'Isa', 'Isaiah', 'is'],
    [24, 'Jer', 'Jeremiah', 'je'], [25, 'La', 'Lamentations', 'lam'], [26, 'Eze', 'Ezekiel', 'ezek ezk'], [27, 'Da', 'Daniel', 'dan dn'],
    [28, 'Ho', 'Hosea', 'hos'], [29, 'Joe', 'Joel', 'jl'], [30, 'Am', 'Amos', 'amo'], [31, 'Ob', 'Obadiah', 'obad'], [32, 'Jon', 'Jonah', 'jnh'],
    [33, 'Mic', 'Micah', 'mi'], [34, 'Na', 'Nahum', 'nah'], [35, 'Hab', 'Habakkuk', ''], [36, 'Zep', 'Zephaniah', 'zeph'],
    [37, 'Hag', 'Haggai', 'hg'], [38, 'Zec', 'Zechariah', 'zech'], [39, 'Mal', 'Malachi', ''], [40, 'Mt', 'Matthew', 'matt mat'],
    [41, 'Mr', 'Mark', 'mk mar mrk'], [42, 'Lu', 'Luke', 'lk luk'], [43, 'Joh', 'John', 'jn jhn'], [44, 'Ac', 'Acts', 'act'],
    [45, 'Ro', 'Romans', 'rom rm'], [46, '1Co', '1 Corinthians', '1cor'], [47, '2Co', '2 Corinthians', '2cor'], [48, 'Ga', 'Galatians', 'gal'],
    [49, 'Eph', 'Ephesians', 'ephes'], [50, 'Php', 'Philippians', 'phil'], [51, 'Col', 'Colossians', ''], [52, '1Th', '1 Thessalonians', '1thess'],
    [53, '2Th', '2 Thessalonians', '2thess'], [54, '1Ti', '1 Timothy', '1tim'], [55, '2Ti', '2 Timothy', '2tim'], [56, 'Tit', 'Titus', ''],
    [57, 'Phm', 'Philemon', 'philem'], [58, 'Heb', 'Hebrews', ''], [59, 'Jas', 'James', 'jam jm'], [60, '1Pe', '1 Peter', '1pet'],
    [61, '2Pe', '2 Peter', '2pet'], [62, '1Jo', '1 John', '1jn 1joh'], [63, '2Jo', '2 John', '2jn 2joh'], [64, '3Jo', '3 John', '3jn 3joh'],
    [65, 'Jude', 'Jude', 'jud'], [66, 'Re', 'Revelation', 'rev rv apocalypse'],
  ];
  const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // every way of writing a book, squashed ("1 John" -> "1john"), longest first so "1john" wins over "john"
  const NAMES = [];
  for (const b of BOOKS) for (const n of [b[1], b[2]].concat(b[3] ? b[3].split(' ') : [])) NAMES.push([squash(n), b]);
  NAMES.sort((a, b) => b[0].length - a[0].length);
  const bookOf = (word) => { const w = squash(word); const hit = NAMES.find(([n]) => n === w); return hit ? hit[1] : null; };

  // "Ps 37:10, 11 or Isa 9:6, 7; Mt 24:6, 7, 14" -> [{book, ch, from, to, label}]
  function parseRefs(text) {
    const out = [];
    for (const part of String(text || '').split(/\s*(?:;|\bor\b|\band\b(?=\s+[1-3]?\s?[A-Za-z]))\s*/i)) {
      const m = /^\s*([1-3]?\s?[A-Za-z][A-Za-z.]*(?:\s(?:of\s)?[A-Za-z]+)?)\s*(\d+)(?::\s*([\d,\s\-–]+))?/.exec(part);
      if (!m) continue;
      const b = bookOf(m[1]);
      if (!b) continue;
      const ch = +m[2];
      const vs = (m[3] || '').split(/[,\s]+/).flatMap((x) => x.split(/[-–]/)).map(Number).filter((n) => n > 0);
      out.push({ book: b[0], abbr: b[1], name: b[2], ch, from: vs.length ? Math.min(...vs) : 0, to: vs.length ? Math.max(...vs) : 0, label: part.trim() });
    }
    return out;
  }
  const pad = (n, w) => String(n).padStart(w, '0');
  const code = (r, v) => pad(r.book, 2) + pad(r.ch, 3) + pad(v, 3);
  // a plain link: opens the verse in JW Library when it is installed, else on jw.org (no Bible text is copied)
  function linkFor(r) {
    const span = r.from ? code(r, r.from) + (r.to > r.from ? '-' + code(r, r.to) : '') : code(r, 1) + '-' + code(r, 999);
    return 'https://www.jw.org/finder?wtlocale=E&pub=nwtsty&bible=' + span;
  }
  // words a reference can be found by: "ps 37 29", "psalms 37 29", "psalm 37:29", "ps37"
  function refWords(r) {
    const b = BOOKS[r.book - 1];
    const names = [b[1], b[2]].concat(b[3] ? b[3].split(' ') : []).map((n) => n.toLowerCase());
    const vs = [];
    for (let v = r.from; v && v <= r.to && vs.length < 40; v++) vs.push(String(v));
    return names.join(' ') + ' ' + names.map((n) => squash(n) + r.ch).join(' ') + ' ' + r.ch + ' ' + vs.join(' ');
  }

  // ---------- forgiving search ----------
  // Typos, partial words and loose verse references all match; closer matches rank first.
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '')
    .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim();
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // how well one query word matches a list of words (0 = not at all)
  function wordScore(q, words) {
    let best = 0;
    const num = /^\d+$/.test(q);
    for (const w of words) {
      if (w === q) return 4;
      if (num) continue; // numbers match exactly (verse 3 is not verse 37)
      if (w.startsWith(q)) best = Math.max(best, q.length >= 2 ? 3 : 1);
      else if (q.length >= 4 && w.includes(q)) best = Math.max(best, 2);
      else if (q.length >= 4) {
        const d = dist(q, w.slice(0, q.length + 1), q.length >= 7 ? 2 : 1);
        if (d <= (q.length >= 7 ? 2 : 1)) best = Math.max(best, 1.5);
      }
    }
    return best;
  }
  function haystack(t, themeName) {
    const refs = parseRefs(t.scripture).map(refWords).join(' ');
    return { title: norm(t.title).split(' '), rest: norm([t.question, t.next, t.text, themeName, (t.tags || []).join(' '), refs].join(' ')).split(' ') };
  }
  // topics: [{...topic}], themeName(id) -> name. Returns topics ranked, best first.
  function search(topics, query, themeName) {
    const qs = norm(query).split(' ').filter(Boolean);
    if (!qs.length) return topics.slice();
    const out = [];
    for (const t of topics) {
      const hay = haystack(t, themeName ? themeName(t.theme) : '');
      let score = 0, missed = 0;
      for (const q of qs) {
        const s = Math.max(wordScore(q, hay.title) * 1.5, wordScore(q, hay.rest));
        if (s) score += s; else missed++;
      }
      // every word should match; with three or more words, one may miss
      if (missed > (qs.length >= 3 ? 1 : 0)) continue;
      out.push({ t, score: score - missed * 2 });
    }
    return out.sort((a, b) => b.score - a.score || String(a.t.title).localeCompare(String(b.t.title))).map((x) => x.t);
  }

  // ---------- scripture index ----------
  // Every verse used in the topics, in Bible order, with the topics that use it.
  function index(topics) {
    const map = new Map();
    for (const t of topics) for (const r of parseRefs(t.scripture)) {
      const key = code(r, r.from || 0) + '-' + code(r, r.to || 0);
      if (!map.has(key)) map.set(key, { ref: r, topics: [] });
      if (!map.get(key).topics.includes(t)) map.get(key).topics.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);
  }
  // "Ps 37:10, 11" as written, or rebuilt from the parts
  const refLabel = (r) => r.abbr + ' ' + r.ch + (r.from ? ':' + r.from + (r.to > r.from ? (r.to === r.from + 1 ? ', ' + r.to : '-' + r.to) : '') : '');

  RV.topics = { BOOKS, parseRefs, linkFor, refLabel, search, index, norm };
})(typeof window !== 'undefined' ? window : globalThis);
