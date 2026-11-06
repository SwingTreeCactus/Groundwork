/* Groundwork v2.54: the service year in review. Full-screen cards tapped through like stories, one big number or
   fact each, always positive, no names. Shows once on the first open after the service year ends (September),
   and reopens from the year view. Share saves a card as an image. Music ("They Say" by Pipo & Wowa, Unminus
   License) starts silent behind the speaker button, is fetched the first time it's turned on and kept in its own
   cache, fades in and out and loops with a crossfade. Numbers come from RV.service.yearReview. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const { h, icon } = RV.dom;
  const U = RV.util, ST = RV.store, UI = RV.ui, V = RV.service;
  const S = ST.S;

  const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const word = (n) => (n <= 10 ? WORDS[n] : String(n));
  const Cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const DAYS = U.DAYS;

  // ---------- the cards ----------
  const POT = '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M60 58V36" stroke="#9CCB95" stroke-width="4" stroke-linecap="round"/><path d="M60 42c0-10-7-16-18-16 0 10 7 16 18 16z" fill="#9CCB95"/><path d="M60 46c0-9 6-14 16-14 0 9-6 14-16 14z" fill="#6E9A5E"/><path d="M30 58h60l-8 46H38z" fill="#C77F5A"/><rect x="26" y="54" width="68" height="12" rx="4" fill="#B0653F"/><path d="M47 80q4 4 8 0M65 80q4 4 8 0" stroke="#3A2A1F" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M54 90q6 5 12 0" stroke="#3A2A1F" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="44" cy="88" r="3.5" fill="#E39271"/><circle cx="76" cy="88" r="3.5" fill="#E39271"/></svg>';
  const SUN = (a, b) => '<svg class="yrdeco sun" viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="100" fill="' + a + '"/><circle cx="110" cy="110" r="66" fill="' + b + '"/></svg>';
  const LEAVES = (a, b) => '<svg class="yrdeco leaves" viewBox="0 0 260 200" aria-hidden="true"><path d="M40 180c0-60 40-100 110-100 0 60-40 100-110 100z" fill="' + a + '"/><path d="M120 170c0-45 30-75 85-75 0 45-30 75-85 75z" fill="' + b + '"/></svg>';
  const DOORS = (a) => '<svg class="yrdeco doors" viewBox="0 0 240 200" aria-hidden="true"><rect x="20" y="40" width="60" height="150" rx="30" fill="' + a + '"/><rect x="100" y="70" width="60" height="120" rx="30" fill="' + a + '" opacity=".7"/><rect x="180" y="100" width="60" height="90" rx="30" fill="' + a + '" opacity=".45"/></svg>';
  const DOTS = (a) => '<svg class="yrdeco dots" viewBox="0 0 240 200" aria-hidden="true">' + [[40, 60, 26], [110, 40, 18], [170, 90, 30], [70, 140, 20], [150, 160, 14], [210, 30, 10]].map(([x, y, r]) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + a + '"/>').join('') + '</svg>';
  const SPROUTS = (a, b) => '<svg class="yrdeco sprouts" viewBox="0 0 240 200" aria-hidden="true">' + [30, 100, 170].map((x, i) => '<path d="M' + (x + 20) + ' 190V' + (120 - i * 20) + '" stroke="' + a + '" stroke-width="6" stroke-linecap="round"/><path d="M' + (x + 20) + ' ' + (130 - i * 20) + 'c0-22-14-34-36-34 0 22 14 34 36 34z" fill="' + a + '"/><path d="M' + (x + 20) + ' ' + (140 - i * 20) + 'c0-20 13-30 32-30 0 20-13 30-32 30z" fill="' + b + '"/>').join('') + '</svg>';
  const FIREFLIES = (() => { let s = 7; const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    return '<svg class="yrdeco flies" viewBox="0 0 390 560" aria-hidden="true">' + Array.from({ length: 24 }, () => '<circle cx="' + Math.round(r() * 380) + '" cy="' + Math.round(r() * 540) + '" r="' + (1.5 + r() * 2).toFixed(1) + '" fill="#F3D77A"/>').join('') + '</svg>'; })();

  function topicTitle(id) {
    const own = (S.lib || []).find((x) => x.id === id && !x.deletedAt);
    if (own && own.title) return own.title;
    const t = RV.library && RV.library.byId(id);
    return t ? t.title : null;
  }

  // Each card: { key, bg, fg, soft, kicker, big, unit, text, line, deco, close }
  function cards(R) {
    const out = [];
    out.push({ key: 'open', bg: '#2F5236', fg: '#F2EEE5', soft: '#CFE0C4', bar: '#4D6E53', pot: true, title: 'Your ' + R.label + ' service year', line: 'A year of doors, conversations and people. Let’s look back.' });
    if (R.tracked && R.hours > 0) {
      const d = Math.floor(R.hours / 24);
      const line = d >= 2 ? 'That’s more than ' + d + ' full days, spent on other people.' : d === 1 ? 'That’s more than a full day, spent on other people.' : 'Every one of them spent on other people.';
      out.push({ key: 'hours', bg: '#DCD39A', fg: '#1F1D1A', soft: '#4A4630', bar: '#BDB47C', kicker: 'You gave', big: R.hours, unit: R.hours === 1 ? 'hour' : 'hours', line, note: R.goalReached ? R.goalReached + ' hours. You did it.' : null, deco: SUN('#E6C873', '#F0D78F') });
    }
    if (R.daysOut > 0) {
      out.push({ key: 'days', bg: '#BFD6DA', fg: '#1F1D1A', soft: '#3D5257', bar: '#9DB7BC', kicker: 'You went out on', big: R.daysOut, unit: R.daysOut === 1 ? 'day' : 'days',
        line: R.topDay ? DAYS[R.topDay.day] + 's were your thing.' : 'Every one of them counted.', deco: DOORS('#A9C6CB') });
    }
    if (R.people > 0) {
      const f = Math.min(R.fresh, R.people);
      out.push({ key: 'people', bg: '#E9CFA9', fg: '#1F1D1A', soft: '#5C4A2E', bar: '#CDB389', kicker: 'You talked with', big: R.people, unit: R.people === 1 ? 'person' : 'people',
        line: !f ? 'Conversation by conversation.' : f === R.people && f > 1 ? 'Every one of them was new.' : R.people === 1 ? 'And they were new.' : Cap(word(f)) + ' of them ' + (f === 1 ? 'was' : 'were') + ' new.', deco: DOTS('#DDBF93') });
    }
    if (R.studies > 0) {
      const f = R.firstStudies;
      out.push({ key: 'studies', bg: '#B4583A', fg: '#FFFDF9', soft: '#FBE3D6', bar: '#C97A5F', kicker: 'You studied with', big: R.studies, unit: R.studies === 1 ? 'person' : 'people',
        line: !f ? 'Week after week, page after page.' : R.studies === 1 ? 'It was their very first study.' : f === R.studies ? 'Every one of them had their very first study this year.' : Cap(word(f)) + ' of them had their very first study this year.', deco: LEAVES('#C8694A', '#D27C5C') });
    }
    const tt = R.topic && topicTitle(R.topic.key);
    if (tt) out.push({ key: 'topic', bg: '#CBDDB8', fg: '#1F1D1A', soft: '#3F5538', bar: '#AFC59A', kicker: 'Your go-to conversation', title: tt, line: 'You brought it up ' + R.topic.n + ' times.', deco: LEAVES('#B9CFA3', '#A9C292') });
    if (R.area) out.push({ key: 'area', bg: '#4F6E57', fg: '#F2EEE5', soft: '#D3E2CF', bar: '#6C8A72', kicker: 'Your area', title: R.area.key + ' saw you most', line: R.area.n + ' visits there this year.', deco: DOORS('#5E7E66') });
    if (S.settings.garden !== false && R.grew > 0) out.push({ key: 'garden', bg: '#9CCB95', fg: '#1F1D1A', soft: '#2F4A2C', bar: '#83B27C', kicker: 'In your garden', big: R.grew, unit: R.grew === 1 ? 'plant grew' : 'plants grew', line: 'One conversation at a time.', deco: SPROUTS('#7FB277', '#6E9A5E') });
    out.push({ key: 'close', bg: '#1E2C24', fg: '#F2EEE5', soft: '#B9CBB8', bar: '#3E5546', title: R.tracked && R.hours > 0 ? 'Every hour counted.' : 'Every conversation counted.', line: 'Here’s to the year ahead.', deco: FIREFLIES, close: true });
    return out;
  }

  // ---------- music ----------
  const MUSIC = 'audio/year-review-they-say.m4a', AUDIO_CACHE = 'gw-audio';
  const TAIL = 1.1, XF = 2.5, LEVEL = 0.7; // seconds of silence at the end; crossfade; volume
  const musicOn = () => { try { return localStorage.getItem('rvapp.reviewMusic') === '1'; } catch (e) { return false; } };
  const setMusicOn = (on) => { try { localStorage.setItem('rvapp.reviewMusic', on ? '1' : '0'); } catch (e) { /* ignore */ } };
  let buf = null;
  async function loadTrack(ctx) {
    if (buf) return buf;
    let res = null;
    try {
      const c = await caches.open(AUDIO_CACHE);
      res = await c.match(MUSIC);
      if (!res) { res = await fetch(MUSIC); if (res.ok) await c.put(MUSIC, res.clone()); }
    } catch (e) { res = await fetch(MUSIC); }
    if (!res || !res.ok) throw new Error('no track');
    const ab = await res.arrayBuffer();
    buf = await new Promise((ok, no) => { const p = ctx.decodeAudioData(ab, ok, no); if (p && p.then) p.then(ok, no); });
    return buf;
  }
  function player() {
    let ctx = null, master = null, timer = null, live = [], playing = false, starting = null;
    function loopFrom(t0) {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; src.connect(g); g.connect(master);
      const len = buf.duration - TAIL;
      g.gain.setValueAtTime(live.length ? 0 : 1, t0);
      if (live.length) g.gain.linearRampToValueAtTime(1, t0 + XF);
      src.start(t0);
      const next = t0 + len - XF;
      g.gain.setValueAtTime(1, next); g.gain.linearRampToValueAtTime(0, next + XF);
      src.stop(next + XF + 0.05);
      live.push(src); src.onended = () => { live = live.filter((x) => x !== src); };
      timer = setTimeout(() => { if (playing) loopFrom(next); }, Math.max(0, (next - ctx.currentTime - 1) * 1000));
    }
    async function start() {
      if (playing) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
      if (starting) return starting;
      starting = (async () => {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) throw new Error('no audio');
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari: the ringer switch mutes it */ }
        if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); }
        if (ctx.state === 'suspended') ctx.resume();
        await loadTrack(ctx);
        playing = true;
        const t = ctx.currentTime + 0.05;
        master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(LEVEL, t + 1.8);
        loopFrom(t);
      })();
      try { await starting; } finally { starting = null; }
    }
    function stop(fade) {
      if (!ctx) return;
      playing = false; clearTimeout(timer);
      const t = ctx.currentTime, f = fade == null ? 1.2 : fade;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + f);
      const old = live; live = [];
      setTimeout(() => { old.forEach((s) => { try { s.stop(); } catch (e) { /* ended */ } }); }, f * 1000 + 60);
    }
    function wake() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
    function end() { stop(0.9); const c = ctx; ctx = null; setTimeout(() => { try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch (e) { /* ignore */ } }, 1000); setTimeout(() => { try { c && c.close(); } catch (e) { /* ignore */ } }, 1100); }
    return { start, stop, wake, end, get playing() { return playing; } };
  }

  // ---------- share as an image ----------
  async function drawCard(c, R) {
    const W = 1080, H = 1920, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    try { await Promise.all(['700 120px "Space Grotesk"', '500 60px "Space Grotesk"'].map((f) => document.fonts.load(f))); } catch (e) { /* system font */ }
    const F = (w, px) => w + ' ' + px + 'px "Space Grotesk", system-ui, sans-serif';
    g.fillStyle = c.bg; g.fillRect(0, 0, W, H);
    // a little of the card's shape, kept simple
    g.globalAlpha = 0.5; g.fillStyle = c.bar;
    g.beginPath(); g.arc(W - 60, 520, 300, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    const wrap = (text, x, y, maxW, lh) => {
      const words = String(text).split(' '); let line = '';
      for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t; }
      if (line) { g.fillText(line, x, y); y += lh; }
      return y;
    };
    const X = 84, MW = W - 2 * X;
    g.fillStyle = c.fg; g.font = F(700, 40); g.fillText('Groundwork · ' + R.label, X, 150);
    g.textBaseline = 'alphabetic';
    let y = 1060;
    if (c.big != null) {
      g.font = F(600, 64); g.fillText(c.kicker, X, y); y += 330;
      g.font = F(700, 360); g.fillText(String(c.big), X - 12, y); y += 120;
      g.font = F(700, 92); g.fillText(c.unit, X, y); y += 110;
      if (c.note) { g.font = F(700, 60); g.fillText(c.note, X, y + 20); y += 90; }
    } else {
      if (c.kicker) { g.font = F(600, 64); g.fillText(c.kicker, X, y); y += 140; } else y += 60;
      g.font = F(700, 124); y = wrap(c.title, X, y, MW, 132) + 20;
    }
    g.fillStyle = c.soft; g.font = F(500, 56); wrap(c.line, X, y + 40, MW, 76);
    return new Promise((ok) => cv.toBlob((b) => ok(b), 'image/png'));
  }
  function summaryCard(R) {
    const bits = [];
    if (R.tracked && R.hours) bits.push(R.hours + ' hours');
    if (R.daysOut) bits.push(R.daysOut + ' days out');
    if (R.people) bits.push(R.people + ' people');
    if (R.studies) bits.push(R.studies + (R.studies === 1 ? ' study' : ' studies'));
    return { bg: '#2F5236', fg: '#F2EEE5', soft: '#CFE0C4', bar: '#4D6E53', kicker: 'My service year', title: R.label, line: bits.join(' · ') || 'A year in the ministry.' };
  }
  async function share(c, R) {
    const blob = await drawCard(c, R);
    if (!blob) { UI.toast('Couldn’t make the image.'); return; }
    const name = 'Groundwork ' + R.label + '.png';
    try {
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    UI.toast('Image saved');
  }

  // ---------- the viewer ----------
  let openNow = null;
  function open(s0) {
    if (openNow) return;
    const R = V.yearReview(V.data(), s0);
    const list = cards(R);
    let i = 0;
    const music = player();
    const segs = h('div', { class: 'yrsegs' }, list.map(() => h('span')));
    const lab = h('span', { class: 'yrlab' }, 'Groundwork · ' + R.label);
    const snd = h('button', { class: 'yrbtn', type: 'button', 'aria-label': 'Music', 'aria-pressed': 'false' });
    const shr = h('button', { class: 'yrbtn', type: 'button', 'aria-label': 'Share this card' }, icon('share', 20));
    const x = h('button', { class: 'yrbtn', type: 'button', 'aria-label': 'Close' }, icon('x', 20));
    const stage = h('div', { class: 'yrstage', 'aria-live': 'polite' });
    const foot = h('div', { class: 'yrfoot' });
    const el = h('div', { class: 'yr', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your ' + R.label + ' service year in review' },
      h('div', { class: 'yrtop' }, segs, h('div', { class: 'yrhead' }, lab, h('div', { class: 'yrbtns' }, snd, shr, x))), stage, foot);
    const paintSnd = () => { const on = musicOn(); snd.setAttribute('aria-pressed', String(on)); snd.replaceChildren(icon(on ? 'sound' : 'mute', 20)); };
    function paint() {
      const c = list[i];
      el.style.setProperty('--yr-bg', c.bg); el.style.setProperty('--yr-fg', c.fg); el.style.setProperty('--yr-soft', c.soft); el.style.setProperty('--yr-bar', c.bar);
      Array.from(segs.children).forEach((s, k) => s.classList.toggle('on', k <= i));
      shr.hidden = c.key === 'open' || !!c.close;
      const deco = c.deco ? (() => { const t = document.createElement('template'); t.innerHTML = c.deco; return t.content.firstChild; })() : null;
      const body = c.pot
        ? h('div', { class: 'yrbody mid' }, (() => { const t = document.createElement('template'); t.innerHTML = POT; const s = t.content.firstChild; s.setAttribute('class', 'yrpot'); return s; })(), h('h1', null, c.title), h('p', null, c.line))
        : c.big != null
          ? h('div', { class: 'yrbody' }, h('span', { class: 'yrk' }, c.kicker), h('span', { class: 'yrbig' }, String(c.big)), h('span', { class: 'yru' }, c.unit), c.note ? h('span', { class: 'yrnote' }, c.note) : null, h('p', null, c.line))
          : h('div', { class: 'yrbody' }, c.kicker ? h('span', { class: 'yrk' }, c.kicker) : null, h('h1', { class: c.close ? 'yrclose' : 'yrtitle' }, c.title), h('p', null, c.line));
      stage.replaceChildren(...[deco, body].filter(Boolean));
      foot.replaceChildren(c.close
        ? h('div', { class: 'yrend' },
          h('button', { class: 'yrshare', type: 'button', onclick: (e) => { e.stopPropagation(); share(summaryCard(R), R); } }, icon('share', 18), 'Share'),
          h('button', { class: 'yrdone', type: 'button', onclick: (e) => { e.stopPropagation(); close(); } }, 'Done'))
        : h('span', { class: 'yrtap' }, 'Tap to continue'));
    }
    const go = (d) => { const n = Math.max(0, Math.min(list.length - 1, i + d)); if (n !== i) { i = n; paint(); } };
    async function toggleMusic(e) {
      e.stopPropagation();
      const on = !musicOn(); setMusicOn(on); paintSnd();
      if (on) { try { await music.start(); } catch (err) { setMusicOn(false); paintSnd(); UI.toast(navigator.onLine === false ? 'The music needs a connection the first time.' : 'Couldn’t play the music.'); } } else music.stop();
    }
    snd.addEventListener('click', toggleMusic);
    shr.addEventListener('click', (e) => { e.stopPropagation(); share(list[i], R); });
    x.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    el.addEventListener('pointerdown', () => { music.wake(); if (musicOn() && !music.playing) music.start().catch(() => {}); });
    el.addEventListener('click', (e) => { if (e.target.closest('button')) return; const r = el.getBoundingClientRect(); go(e.clientX - r.left < r.width * 0.3 ? -1 : 1); });
    const onKey = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') go(-1); };
    function close() {
      if (!openNow) return;
      openNow = null;
      music.end();
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    paintSnd(); paint();
    document.body.appendChild(el);
    openNow = { el, close };
    try { x.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    if (musicOn()) music.start().catch(() => {}); // plays now if the browser allows, else on the first tap
    return openNow;
  }

  // Once, on the first open after the service year ends, for a year Groundwork's calendar was in use.
  function maybe() {
    const C = RV.calendar;
    if (!C || C.quietSurprises() || document.querySelector('.overlay, .yr') || !S.ready) return false;
    const svc = V.svc();
    if (!svc.setup || !svc.since) return false;
    const prev = V.addMonths(V.yearStart(V.ym(new Date())), -12);
    if (svc.reviewSeen && svc.reviewSeen >= prev) return false;
    if (V.monthOf(U.toDateStr(new Date(svc.since))) > V.addMonths(prev, 11)) return false;
    const R = V.yearReview(V.data(), prev);
    V.saveSvc((v) => { v.reviewSeen = prev; });
    if (!R.any) return false;
    open(prev);
    return true;
  }

  RV.review = { open, maybe, cards, drawCard, summaryCard, get isOpen() { return !!openNow; } };
})(window);
