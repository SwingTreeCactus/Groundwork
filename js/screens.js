/* RV app: main screens (Home, Today, RV list, RV detail). Each returns {title, sub, el, ...}. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const { h, icon } = RV.dom;
  const U = RV.util, L = RV.logic, ST = RV.store, UI = RV.ui, F = RV.forms;
  const S = ST.S;
  const { lbl, field, toast, confirmDialog, sheet, stageBadge, attBadge } = UI;

  // ---------- garden helpers ----------
  const G = RV.garden, P = RV.plant;
  const gardenOn = () => S.settings.garden !== false;
  const gstate = (it) => G.forItem(it, S.settings, new Date());
  const plantOf = (st, size, o) => P.make(st.form, st.care, Object.assign({ size, buds: st.buds, flowers: st.flowers, vid: st.vid, kind: st.pkind }, o || {}));
  // One segment per step needed; faded when the chain is about to break; a calendar mark while a follow-up holds it.
  function miniBar(st) {
    const bar = h('span', { class: 'mbar' + (st.fading ? ' fade' : ''), role: 'img', 'aria-label': st.have + ' of ' + st.need + ' toward ' + st.nextName },
      Array.from({ length: st.need }, (_, i) => h('i', { class: i < st.have ? 'on' : '' })));
    return st.held ? [bar, h('span', { class: 'gcal', title: 'Follow-up date holds this' }, icon('calendar', 14))] : [bar];
  }
  // The row's one status line: the growth bar, or where a study starts next. Care shows in the plant itself
  // (v2.23: no Thirsty / Wilting words).
  function statusLine(it, st) {
    const rv = it.rv;
    if (st.need && st.next) return miniBar(st);
    if (rv.nextStart) return h('span', null, 'Next: ' + rv.nextStart);
    return h('span', null, UI.lastText(it));
  }
  const moreText = (st) => {
    const n = st.need - st.have;
    return st.kind === 'study' ? n + ' more ' + (n === 1 ? 'study' : 'studies') : n + ' more ' + (n === 1 ? 'conversation' : 'conversations');
  };

  // ---------- shared row ----------
  function rvRow(it, o) {
    o = o || {};
    const rv = it.rv;
    const dnc = L.isDNC(S.settings, rv);
    const nhBtn = o.nh !== false && S.settings.nhRowButton && it.att.state !== 'closed'
      ? h('button', {
        class: 'nhbtn', type: 'button', 'aria-label': lbl('notHome') + ' for ' + rv.name,
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); UI.doNotHome(rv.id); },
      }, lbl('notHomeShort'))
      : null;
    const navBtn = o.nh !== false && (rv.address || rv.geo) && it.att.state !== 'closed'
      ? h('button', {
        class: 'rowpin', type: 'button', 'aria-label': 'Directions to ' + rv.name,
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); UI.openNav(UI.navTarget(rv)); },
      }, icon('pin', 20))
      : null;
    const st = gardenOn() ? gstate(it) : null;
    const garden = !!(st && st.form);
    const study = !garden && L.isStudyStage(S.settings, rv.stage) && (rv.publication || rv.nextStart)
      ? [rv.publication, rv.nextStart ? 'Next: ' + rv.nextStart : null].filter(Boolean).join(' · ') : '';
    const area = o.hideArea ? '' : (rv.neighborhood || '');
    const stageName = garden ? h('span', { class: 'gstage' }, L.shownName(S.settings, rv.stage)) : null;
    const stage = garden ? stageName : it.att.state !== 'closed'
      ? h('span', { class: 'stagebtn', role: 'button', tabindex: '0', 'aria-label': 'Change stage for ' + rv.name, onclick: (e) => { e.preventDefault(); e.stopPropagation(); F.stageFlow(rv.id); } }, stageBadge(rv.stage))
      : stageBadge(rv.stage);
    let plant = null;
    if (garden) { plant = plantOf(st, 'rw'); P.leanOnTouch(plant); }
    return h('a', { class: 'row rv2' + (garden ? ' gd' : ''), href: '#/rv/' + rv.id, 'data-id': rv.id },
      plant,
      h('div', { class: 'main' },
        h('div', { class: 'name' }, rv.name),
        h('div', { class: 'line2' }, area ? h('span', { class: 'area' }, area) : null, area ? h('span', { class: 'sep' }, '·') : null, stage,
          dnc ? h('span', { class: 'badge flag-overdue' }, 'Do not call') : null),
        o.hit ? h('div', { class: 'line2 hit' }, o.hit) : null,
        o.why ? h('div', { class: 'line2 why' }, o.why) : null,
        study ? h('div', { class: 'line2' }, study) : null,
        garden
          ? h('div', { class: 'gstat' }, statusLine(it, st))
          : h('div', { class: 'line3' + (it.att.state === 'overdue' ? ' due' : '') }, UI.lastText(it))),
      (navBtn || nhBtn) ? h('div', { class: 'row-acts r2' }, navBtn, nhBtn) : null);
  }
  // Highlights the first place a search token appears in text: returns a node, or null if none matches.
  function hitLine(text, q) {
    const t = String(text || ''), tokens = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      const i = t.toLowerCase().indexOf(tok);
      if (i >= 0) return h('span', null, t.slice(0, i), h('mark', null, t.slice(i, i + tok.length)), t.slice(i + tok.length));
    }
    return null;
  }
  function listOf(items, o) {
    return h('div', { class: 'list' }, items.map((it) => rvRow(it, o)));
  }
  function card(title, body, headExtra) {
    return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title), headExtra || null), body);
  }

  // ---------- topics and campaigns (shared sheets) ----------
  // v2.40: a topic is a conversation: a question, its scriptures, what to raise next time, notes and a link.
  // Built-in ones come from the workbook library (RV.library) and keep the original for Reset to original.
  const TP = RV.topics;
  const themeName = (id) => { const t = ST.themes().find((x) => x.id === id); return t ? t.name : 'Other'; };
  const ext = (href, cls, kids) => h('a', { class: cls, href, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, kids);
  // v2.40.1: web addresses in a topic's text become short tappable links ("jw.org/…"); the edit sheet keeps the plain text
  const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"]+|(?:wol\.)?jw\.org\/[^\s<>"]*)/gi;
  const shortUrl = (u) => {
    const m = /^(?:https?:\/\/)?(?:www\.)?([^/?#]+)(.*)$/i.exec(u);
    if (!m) return u;
    return m[2] && m[2] !== '/' ? m[1] + '/…' : m[1];
  };
  function linkify(text) {
    const str = String(text || ''), out = [];
    let last = 0, m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(str))) {
      let u = m[1];
      const trail = /[.,;:!?)\]'"]+$/.exec(u);
      if (trail) u = u.slice(0, -trail[0].length);
      if (m.index > last) out.push(str.slice(last, m.index));
      out.push(ext(/^https?:/i.test(u) ? u : 'https://' + u, 'tlink', shortUrl(u)));
      last = m.index + u.length;
      URL_RE.lastIndex = last;
    }
    if (last < str.length) out.push(str.slice(last));
    return out;
  }
  // each verse a tap that opens it in JW Library (or jw.org); nothing of the Bible text is copied
  // v2.48.2: on a tract, the scripture opens the tract on jw.org instead of the verse
  function refChips(scripture, url) {
    const refs = TP ? TP.parseRefs(scripture) : [];
    if (!refs.length) return scripture ? h('span', { class: 'vrefs' }, url ? ext(url, 'vref', [icon('book', 14), scripture]) : h('span', { class: 'vref plain' }, scripture)) : null;
    return h('span', { class: 'vrefs' }, refs.map((r) => ext(url || TP.linkFor(r), 'vref', [icon('book', 14), r.label])));
  }
  // the jw.org page of a library tract (also for tracts saved before v2.48.2, found by their library id)
  const tractUrl = (x) => (x && x.tract && LIB ? (LIB.byId(x.builtin || String(x.id || '').replace(/^lib-/, '')) || {}).url || '' : '');
  function libSheet(kind, item, opts) {
    // kind is always 'topic'; scriptures and conversation starters live inside topics
    opts = opts || {};
    const title = h('input', { type: 'text', value: item ? item.title : '', 'data-autofocus': true, autocomplete: 'off', placeholder: 'e.g. Hope for the future' });
    const question = h('textarea', { value: item ? item.question || '' : '', placeholder: 'How you might open the conversation', style: { minHeight: '64px' } });
    const scripture = h('input', { type: 'text', value: item ? item.scripture || '' : '', autocomplete: 'off', placeholder: 'e.g. Ps 37:29; Re 21:4' });
    const next = h('input', { type: 'text', value: item ? item.next || '' : '', autocomplete: 'off', placeholder: 'A question to come back with next time' });
    const text = h('textarea', { value: item ? item.text || '' : '', placeholder: 'Notes, more scriptures, key points', style: { minHeight: '84px' } });
    const video = h('input', { type: 'url', value: item ? item.video || '' : '', autocomplete: 'off', placeholder: 'A jw.org link (optional)' });
    const theme = h('select', null, ST.themes().map((t) => h('option', { value: t.id }, t.name)).concat(h('option', { value: '' }, 'No category')));
    theme.value = item ? (ST.themes().some((t) => t.id === item.theme) ? item.theme : '') : (opts.theme != null ? opts.theme : (ST.themes()[0] || { id: '' }).id);
    const on = h('input', { type: 'checkbox', checked: item ? !!item.showOnHome : true });
    sheet(item ? 'Edit topic' : 'New topic', (close) =>
      h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          const t = title.value.trim();
          if (!t) { title.focus(); return; }
          const data = { title: t, question: question.value.trim(), scripture: scripture.value.trim(), next: next.value.trim(), text: text.value.trim(), video: video.value.trim(), theme: theme.value, showOnHome: on.checked };
          if (item) ST.updateLib(item.id, data); else ST.addLib('topic', data);
          close();
        },
      },
        field('Topic', title), field('Question', question), field('Scriptures', scripture), field('Linking question', next), field('Notes', text),
        field('Video or article link', video), field('Category', theme),
        h('label', { class: 'check' }, on, 'Show on Today and in Record a visit'),
        item && item.builtin ? h('button', { class: 'link-quiet treset', type: 'button', onclick: async () => {
          if (await confirmDialog({ title: 'Reset to original?', message: 'Your changes to "' + item.title + '" will be replaced with the library version.', confirmText: 'Reset' })) { ST.resetTopic(item.id); close(); }
        } }, 'Reset to original') : null,
        h('div', { class: 'actions' },
          item ? h('button', {
            class: 'btn danger', type: 'button',
            onclick: async () => { if (await confirmDialog({ title: 'Delete?', message: '"' + item.title + '" will be removed.', confirmText: 'Delete', danger: true })) { ST.deleteLib(item.id); close(); } },
          }, 'Delete') : null,
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
  }
  // v2.48: where a tract's scripture is taught in Enjoy Life Forever! (the book, not a link)
  const lffLine = (x, cls) => (x && x.lff && x.lff.lesson ? h('div', { class: 'tlff' + (cls ? ' ' + cls : '') },
    icon('book', 16), h('span', null, h('b', null, 'Enjoy Life, lesson ' + x.lff.lesson), x.lff.from ? ' \u00B7 from ' + x.lff.from + ' in the tract' : '')) : null);
  // read-only view for use at the door
  function topicView(x) {
    sheet(x.title, (close) =>
      h('div', { class: 'tview' },
        x.question ? h('p', { class: 'tq' }, '“', ...linkify(x.question), '”') : null,
        x.scripture ? h('div', { class: 'tline' }, refChips(x.scripture, tractUrl(x))) : null,
        lffLine(x, 'tline'),
        x.next ? h('div', { class: 'tline' }, h('span', { class: 'muted small' }, 'Linking question'), h('div', null, ...linkify(x.next))) : null,
        // v2.41: where it sits in its series, and a way on to the next part
        ...seriesOfItem(x).map((si) => h('div', { class: 'tline tser' }, h('span', { class: 'muted small' }, si.series.name + ' \u00B7 part ' + si.part + ' of ' + si.of),
          si.part < si.of && libItem(si.series.topics[si.part]) ? h('button', { class: 'link', type: 'button', onclick: () => { close(); topicView(libItem(si.series.topics[si.part])); } }, 'Next: ' + libItem(si.series.topics[si.part]).title) : null)),
        x.text ? h('div', { class: 'readtext' }, ...linkify(x.text)) : null,
        !x.question && !x.scripture && !x.text ? h('div', { class: 'muted' }, 'No details yet.') : null,
        (x.tags || []).length ? h('div', { style: { marginTop: '10px' } }, x.tags.map((t) => h('span', { class: 'tag' }, t))) : null,
        x.video || x.source ? h('div', { class: 'tlinks' },
          x.video ? ext(x.video, 'btn sm', [icon('play', 16), 'Watch the video']) : null,
          x.source ? ext(x.source, 'link-quiet', 'Workbook page') : null) : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => { close(); libSheet('topic', x); } }, 'Edit'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
  }
  const campRange = (c) => (c.start && c.end ? U.fmtDate(c.start) + ' to ' + U.fmtDate(c.end) : 'No dates set');
  function campaignSheet(c) {
    const pubs = String(c.publications || '').split('\n').map((x) => x.trim()).filter(Boolean);
    sheet(c.title, (close) =>
      h('div', null,
        h('div', { class: 'muted', style: { marginBottom: '10px' } }, campRange(c)),
        c.topic ? h('div', { class: 'kvline' }, h('div', { class: 'k' }, 'Topic'), h('div', null, c.topic)) : null,
        c.text ? h('div', { class: 'kvline' }, h('div', { class: 'k' }, 'About'), h('div', { class: 'readtext' }, c.text)) : null,
        pubs.length ? h('div', { class: 'kvline' }, h('div', { class: 'k' }, 'Featured publications'), h('ul', { class: 'plainul' }, pubs.map((x) => h('li', null, x)))) : null,
        (() => { const ts = (c.topics || []).map((id) => S.lib.find((y) => y.id === id && !y.deletedAt)).filter(Boolean);
          return ts.length ? h('div', { class: 'kvline' }, h('div', { class: 'k' }, 'Topics'), h('div', { class: 'ctopics' }, ts.map((x) => h('button', { class: 'link', type: 'button', onclick: () => { close(); topicView(x); } }, x.title)))) : null; })(),
        h('a', { class: 'link-quiet', href: '#/settings/campaigns', onclick: () => close(), style: { display: 'inline-block', marginTop: '6px' } }, 'All campaigns'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => { close(); RV.settingsScreens.campaignForm(c); } }, 'Edit'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
  }

  // ---------- Home ----------
  // Home is for planning: the live campaign and topics to review. Adding someone is the + button;
  // who to see lives on Today.
  function section(title, body, extra) {
    return h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h2', null, title), extra || null), body);
  }
  // v2.39: the campaign card always shows: the one running (or starting within three weeks) with a Plan link,
  // or Schedule a campaign when nothing is scheduled
  // v2.41: a slim banner while a campaign runs (or starts within three weeks); Schedule a campaign when nothing is scheduled
  function campaignBar() {
    const camps = ST.campaigns();
    const now = new Date();
    const c = L.activeCampaign(camps, now);
    if (c) {
      return h('button', { class: 'campbar', type: 'button', onclick: () => campaignSheet(c) },
        h('span', { class: 'cbt' }, h('b', null, c.title), ' · until ' + U.fmtDate(c.end)), icon('right', 18));
    }
    const nx = L.nextCampaign(camps, now);
    if (nx && U.daysBetween(U.parseDateStr(nx.start), now) <= 21) {
      return h('button', { class: 'campbar soon', type: 'button', onclick: () => campaignSheet(nx) },
        h('span', { class: 'cbt' }, h('b', null, nx.title), ' · starts ' + U.fmtDate(nx.start)), icon('right', 18));
    }
    return h('button', { class: 'plan-camp', type: 'button', onclick: () => RV.settingsScreens.campaignForm(null) }, icon('calendar', 18), 'Schedule a ' + lbl('campaign').toLowerCase());
  }
  // ---------- Getting started (v2.29) ----------
  // A one-time tip, shown inline while Getting started is on, until "Got it".
  function coach(id, text) {
    // v2.50.1: tips outlive the checklist (it can be finished in one sitting); not shown if it was skipped
    const sst = (S.settings.starter || {}).state;
    if (!RV.garden || !(sst === 'on' || sst === 'done') || (S.settings.tips || {})[id]) return null;
    const el = h('div', { class: 'coach', role: 'note' }, h('span', { class: 'coachdot', 'aria-hidden': 'true' }),
      h('div', { class: 'coachtx' }, text),
      h('button', { class: 'link', type: 'button', onclick: () => { el.remove(); ST.saveSettings((s) => { s.tips = Object.assign({}, s.tips || {}, { [id]: true }); }); } }, 'Got it'));
    return el;
  }
  // v2.50.1: two compact rows instead of five: another app (the Import contacts page) or a Groundwork backup
  const importRows = () => h('div', { class: 'imports bring2' },
    [['upload', 'Import from another app', 'Ministry Assistant, Witness Work, notes, a spreadsheet', () => { location.hash = '#/settings/import'; }],
      ['download', 'Restore a Groundwork backup', 'From Google Drive or a file', () => RV.importers && RV.importers.restore()]]
      .map(([ic, t, sub, fn]) => h('button', { class: 'bringrow', type: 'button', onclick: fn }, icon(ic, 20),
        h('span', { class: 'main' }, h('span', { class: 'bt' }, t), h('span', { class: 'bs' }, sub)), icon('right', 16))));
  // v2.50.1: what Groundwork is, for a new user. Folds to one row (remembered on this device);
  // gone for good once any Getting started step is done.
  const INTRO_KEY = 'rvapp.introFolded';
  const potSvg = () => { const t = document.createElement('template');
    t.innerHTML = '<svg class="ipot" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#3F6B48"/><g transform="translate(50 50) scale(0.92) translate(-50 -50)"><path d="M50 39 V22" stroke="#A9D08E" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M50 30 C39 30 32 24 31 14 C42 14 50 20 50 30 Z" fill="#A9D08E"/><path d="M50 25 C61 25 68 19 69 9 C58 9 50 15 50 25 Z" fill="#CFE6B4"/><rect x="20" y="37" width="60" height="13" rx="5.5" fill="#9C4A30"/><path d="M24.5 48 H75.5 L69.8 85 Q69 89.5 64.5 89.5 H35.5 Q31 89.5 30.2 85 Z" fill="#B4583A"/><path d="M35 64 Q38.5 59 42 64" stroke="#1F1D1A" stroke-width="3.6" stroke-linecap="round" fill="none"/><path d="M58 64 Q61.5 59 65 64" stroke="#1F1D1A" stroke-width="3.6" stroke-linecap="round" fill="none"/><path d="M43.5 72 Q50 78 56.5 72" stroke="#1F1D1A" stroke-width="3.6" stroke-linecap="round" fill="none"/><circle cx="32" cy="71" r="3.4" fill="#D9775B"/><circle cx="68" cy="71" r="3.4" fill="#D9775B"/></g></svg>';
    return t.content.firstChild; };
  const INTRO_LINES = [['sprout', 'Everyone you talk with grows as a plant. Your visits keep it watered.'],
    ['note', 'Your conversation topics are ready for the day.'],
    ['lock', 'Your records stay private on your phone, and can be backed up to your own Google Drive.']];
  const INTRO_HEAD = 'A garden that keeps your return visits from falling through the cracks.';
  function introCard(foldable) {
    let folded = false;
    if (foldable) { try { folded = localStorage.getItem(INTRO_KEY) === '1'; } catch (e) { /* ignore */ } }
    const el = h('section', { class: 'intro' });
    const draw = () => {
      el.classList.toggle('folded', folded);
      const tog = foldable ? h('button', { class: 'ifold', type: 'button', 'aria-expanded': String(!folded), 'aria-label': folded ? 'Show what Groundwork is' : 'Fold', onclick: (e) => { e.stopPropagation(); set(!folded); } }, icon(folded ? 'down' : 'up', 16)) : null;
      const brand = h('div', { class: 'ibrand' }, potSvg(), h('b', null, 'Groundwork'), tog);
      el.onclick = folded ? () => set(false) : null;
      el.replaceChildren(...(folded ? [brand] : [brand, h('p', { class: 'ihead' }, INTRO_HEAD),
        h('ul', { class: 'ipts' }, INTRO_LINES.map(([ic, t]) => h('li', null, icon(ic, 18), h('span', null, t))))]));
    };
    const set = (v) => { folded = v; try { localStorage.setItem(INTRO_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } draw(); };
    draw();
    return el;
  }
  function starterCard() {
    const G = RV.garden;
    const r = G.starterSteps(ST.items(), S.settings, !!(RV.drive && RV.drive.status().connected));
    const go = {
      contact: () => F.quickAdd(),
      topics: () => { location.hash = '#/settings/lib/topic'; },
      drive: () => { if (RV.drive && RV.drive.configured && RV.drive.configured()) RV.drive.connect(); else location.hash = '#/settings/data'; },
    };
    const hint = { contact: 'The people you’ll go back to. Add them one by one, or bring them in below.', topics: 'The nine tracts are on. Switch on any other topics you use.', drive: 'Your records live on this phone. A Drive backup keeps them safe.' };
    const btnText = { contact: 'Add a contact', topics: 'Choose topics', drive: 'Back up' };
    return h('section', { class: 'card starter' },
      h('div', { class: 'sthead' }, h('h2', null, 'Getting started'), h('span', { class: 'muted small' }, r.done + ' of ' + r.steps.length)),
      h('ol', { class: 'stlist' }, r.steps.map((x) => {
        const cur = r.current && r.current.key === x.key;
        const mark = h('span', { class: 'stck', 'aria-hidden': 'true' }, x.done ? icon('check', 14) : null);
        const label = h('div', { class: 'stl' }, x.label, x.done ? h('span', { class: 'sr-only' }, ', done') : null);
        // v2.50.1: every step opens its own workflow, in any order; it ticks only when it is actually done
        if (cur) return h('li', { class: 'st cur' }, mark, h('div', { class: 'stmain' }, label, h('div', { class: 'muted small' }, hint[x.key]),
          h('button', { class: 'btn primary sm', type: 'button', onclick: go[x.key] }, btnText[x.key])));
        return h('li', { class: 'st' + (x.done ? ' done' : '') }, h('button', { class: 'sttap', type: 'button', onclick: go[x.key] }, mark, h('div', { class: 'stmain' }, label), icon('right', 16)));
      })),
      !r.steps[0].done ? importRows() : null,
      h('button', { class: 'link stskip', type: 'button', onclick: () => ST.saveSettings((s) => { s.starter = Object.assign({}, s.starter, { state: 'off' }); }) }, 'Skip getting started'));
  }

  // v2.39: Home is Today: who to see, one list grouped by area. Areas with thirsty plants come first; in each,
  // the people likely home lead, then the thirstiest, then whoever has gone longest without a visit.
  // Topics and the campaign are prepared from their cards (Manage, Plan).
  // v2.40: Today is for getting ready. The topics switched on, by theme (a theme with several folds away),
  // then a few people likely home with what you planned to bring, then one line to everyone else.
  // ---------- v2.41: Today's conversations, a carousel ----------
  // The topics in play today: the running campaign's topics first (less any hidden with ×), then the ones
  // switched on, kept together by series in their order.
  const LIB = RV.library;
  const seriesOfItem = (x) => (x && x.builtin && LIB ? LIB.seriesOf(x.builtin) : []);
  const libItem = (builtinId) => S.lib.find((y) => y.id === 'lib-' + builtinId && !y.deletedAt) || null;
  function orderKey(x) {
    if (x.tract) return -1000 + (x.order || 0); // v2.48: the 2025 tracts lead
    const s = seriesOfItem(x)[0];
    if (s) return LIB.SERIES.indexOf(s.series) * 10 + s.part;
    return x.builtin ? 5000 + (x.order || 0) : 9000 + (x.order || 0);
  }
  function todayTopics() {
    const camp = ST.activeCampaign();
    const hidden = new Set(camp ? ((S.settings.campHidden || {})[camp.id] || []) : []);
    const campList = camp ? (camp.topics || []).map((id) => S.lib.find((y) => y.id === id && !y.deletedAt)).filter((x) => x && !hidden.has(x.id)) : [];
    const ids = new Set(campList.map((x) => x.id));
    const on = ST.featuredTopics().filter((x) => !ids.has(x.id)).sort((a, b) => orderKey(a) - orderKey(b));
    return campList.map((x) => Object.assign({}, x, { _camp: true })).concat(on);
  }
  // the next part of a topic's series (the library item), or null
  function nextInSeries(x) {
    const s = seriesOfItem(x)[0];
    if (!s || s.part >= s.of) return null;
    return libItem(s.series.topics[s.part]);
  }
  function topicCard(x, o) {
    o = o || {};
    const s = seriesOfItem(x)[0];
    const nxt = nextInSeries(x);
    const remove = (e) => {
      e.stopPropagation();
      const camp = ST.activeCampaign();
      if (x._camp && camp) {
        ST.saveSettings((st) => { st.campHidden = Object.assign({}, st.campHidden || {}); st.campHidden[camp.id] = (st.campHidden[camp.id] || []).concat(x.id); });
        toast('Hidden until the campaign ends', { seconds: 5, actions: [{ label: 'Undo', fn: () => ST.saveSettings((st) => { st.campHidden[camp.id] = (st.campHidden[camp.id] || []).filter((i) => i !== x.id); }) }] });
      } else {
        ST.updateLib(x.id, { showOnHome: false });
        toast('Removed from Today', { seconds: 5, actions: [{ label: 'Undo', fn: () => ST.updateLib(x.id, { showOnHome: true }) }] });
      }
    };
    return h('article', { class: 'tcard' + (x._camp ? ' camp' : ''), 'data-id': x.id, role: 'group', 'aria-label': x.title },
      h('div', { class: 'tband' },
        h('span', { class: 'tth' }, x._camp ? 'Campaign' : x.tract ? 'Tract' : themeName(x.theme)),
        s ? h('span', { class: 'tpart' }, 'Part ' + s.part + ' of ' + s.of) : null,
        h('span', { class: 'tsprout', 'aria-hidden': 'true' }),
        o.noX ? null : h('button', { class: 'tx', type: 'button', 'aria-label': 'Remove ' + x.title + ' from Today', onclick: remove }, icon('x', 16))),
      h('div', { class: 'tin', role: 'button', tabindex: '0', onclick: () => topicView(x), onkeydown: (e) => { if (e.key === 'Enter') topicView(x); } },
        h('div', { class: 'tt' }, x.title),
        x.question ? h('div', { class: 'tq' }, '“', ...linkify(x.question), '”') : x.text ? h('div', { class: 'tq plain' }, ...linkify(x.text)) : h('div', { class: 'tq' }),
        h('div', { class: 'tbtns' }, ...refButtons(x.scripture, tractUrl(x)), x.video ? ext(x.video, 'tbtn' + (x.scripture ? ' soft' : ''), [icon('play', 16), 'Video']) : null),
        lffLine(x),
        x.next ? h('button', { class: 'tlinkq', type: 'button', onclick: (e) => { e.stopPropagation(); if (nxt) goToTopic(nxt); else topicView(x); } },
          h('span', { class: 'k' }, 'Linking question'), h('span', { class: 'v' }, x.next, nxt ? icon('right', 16) : null)) : null));
  }
  // verse buttons for a card: the first is solid, the rest soft
  function refButtons(scripture, url) {
    const refs = TP ? TP.parseRefs(scripture) : [];
    return refs.map((r, i) => ext(url || TP.linkFor(r), 'tbtn' + (i ? ' soft' : ''), [icon('book', 16), longRef(r)]));
  }
  const longRef = (r) => (TP.BOOKS[r.book - 1][2]) + ' ' + r.label.replace(/^\S+\s/, '').replace(/^(\d+\s)?[A-Za-z]+\s/, '');
  // show a topic: on today's carousel scroll to it, otherwise open it
  function goToTopic(x) {
    const card = document.querySelector('.tcar .tcard[data-id="' + x.id + '"]');
    if (card) { card.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); return; }
    topicView(x);
  }
  const SPROUT = '<svg viewBox="0 0 64 64"><path d="M32 64V30" stroke="currentColor" stroke-width="3" fill="none"/><path d="M32 40c-14 0-20-10-20-20 12 0 20 8 20 20z" class="l1"/><path d="M32 34c12 0 18-9 18-18-11 0-18 7-18 18z" class="l2"/></svg>';
  function conversations() {
    const list = todayTopics();
    const view = h('button', { class: 'link-quiet', type: 'button', onclick: () => viewAll(list) }, 'View all');
    if (!list.length) {
      return h('section', { class: 'sec conv' }, h('div', { class: 'sec-head' }, h('h2', null, 'Conversations')),
        h('div', { class: 'tempty' },
          h('p', { class: 'muted' }, 'Switch on the topics you want to use and they show here: the question, its scriptures and the video.'),
          h('a', { class: 'btn sm', href: '#/settings/lib/topic' }, icon('note', 16), 'Choose topics')));
    }
    const count = h('span', { class: 'tcount' }, '1/' + list.length);
    const dots = h('div', { class: 'tdots', 'aria-hidden': 'true' }, list.slice(0, 12).map((_, i) => h('i', { class: i ? '' : 'on' })));
    const car = h('div', { class: 'tcar' }, list.map((x) => topicCard(x)));
    car.querySelectorAll('.tsprout').forEach((e) => { e.innerHTML = SPROUT; });
    // the counter and dots follow the card in view
    let raf = 0;
    car.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = car.firstElementChild ? car.firstElementChild.getBoundingClientRect().width + 12 : 1;
        const i = Math.max(0, Math.min(list.length - 1, Math.round(car.scrollLeft / w)));
        count.textContent = (i + 1) + '/' + list.length;
        dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === Math.min(i, 11)));
        try { sessionStorage.setItem('rvapp.carousel', String(i)); } catch (e) { /* ignore */ }
      });
    }, { passive: true });
    // come back to the card you were on
    let start = 0;
    try { start = +sessionStorage.getItem('rvapp.carousel') || 0; } catch (e) { start = 0; }
    if (start) requestAnimationFrame(() => { const c = car.children[Math.min(start, list.length - 1)]; if (c) car.scrollLeft = c.offsetLeft - car.firstElementChild.offsetLeft; });
    return h('section', { class: 'sec conv' },
      h('div', { class: 'sec-head' }, h('h2', null, 'Conversations', count), view),
      car, list.length > 1 ? dots : null);
  }
  // every topic in play, for a quick scan: by theme or by series, with search; a tap goes to it
  function viewAll(list) {
    let mode = 'theme', q = '';
    const body = h('div', { class: 'valist' });
    const search = h('input', { type: 'search', class: 'tsearch', placeholder: 'Search topics or scriptures', autocomplete: 'off' });
    const seg = h('div', { class: 'seg2 vseg' });
    sheet('Your topics · ' + list.length, (close) => {
      const row = (x, part) => h('button', { class: 'varow', type: 'button', onclick: () => { close(); setTimeout(() => goToTopic(x), 250); } },
        h('div', { class: 't' }, h('b', null, x.title), h('span', null, x.question || x.text || '')),
        part ? h('span', { class: 'tpart' }, part) : null,
        x.scripture ? h('span', { class: 'chip' }, TP.parseRefs(x.scripture).map((r) => r.label)[0] || x.scripture) : null);
      const paint = () => {
        seg.replaceChildren(...[['theme', 'By category'], ['series', 'By series']].map(([v, l]) => h('button', { type: 'button', class: v === mode ? 'on' : '', onclick: () => { mode = v; paint(); } }, l)));
        const items = q.trim() ? TP.search(list, q, themeName) : list;
        if (q.trim()) { body.replaceChildren(...items.map((x) => row(x))); return; }
        if (mode === 'theme') {
          body.replaceChildren(...groupByTheme(items).flatMap((g) => [h('div', { class: 'vag' }, g.name), ...g.items.map((x) => row(x))]));
        } else {
          const out = [], used = new Set();
          const tr = items.filter((x) => x.tract);
          if (tr.length) { out.push(h('div', { class: 'vag' }, '2025 tracts')); tr.forEach((x) => { used.add(x.id); out.push(row(x)); }); }
          for (const s of LIB.SERIES) {
            const inS = s.topics.map((id) => items.find((x) => x.builtin === id)).filter(Boolean);
            if (!inS.length) continue;
            out.push(h('div', { class: 'vag' }, s.name));
            inS.forEach((x) => { used.add(x.id); out.push(row(x, 'Part ' + (s.topics.indexOf(x.builtin) + 1) + ' of ' + s.topics.length)); });
          }
          const rest = items.filter((x) => !used.has(x.id));
          if (rest.length) out.push(h('div', { class: 'vag' }, 'Not in a series'), ...rest.map((x) => row(x)));
          body.replaceChildren(...out);
        }
      };
      search.addEventListener('input', () => { q = search.value; paint(); });
      paint();
      return h('div', null, seg, search, body);
    }, { noFocus: true }); // v2.41.1: a list to scan; no keyboard until the search is tapped
  }
  function groupByTheme(list) {
    const ths = ST.themes();
    const groups = ths.map((t) => ({ id: t.id, name: t.name, items: [] }));
    const camp = { id: '_camp', name: 'Campaign', items: [] };
    const other = { id: '', name: 'Other', items: [] };
    for (const x of list) (x._camp ? camp : groups.find((g) => g.id === x.theme) || other).items.push(x);
    return [camp].concat(groups, other).filter((g) => g.items.length);
  }
  // a few people likely home today, each with what you planned to bring (or the next lesson)
  // ---------- v2.51 a quiet backup card on Today ----------
  // When there's no backup and 5+ contacts, or the last backup (Drive or a downloaded file) is 14+ days old.
  // Not now hides it for 14 days.
  const BK_LATER = 'rvapp.bkLater';
  function backupCard(now) {
    const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const last = get('rvapp.lastBackup'), later = get(BK_LATER);
    const n = S.rvs.filter((r) => !r.deletedAt).length;
    const old = last ? U.daysBetween(U.startOfDay(now), U.parseDateStr(last)) >= 14 : n >= 5;
    if (!old || (later && U.daysBetween(U.startOfDay(now), U.parseDateStr(later)) < 14)) return null;
    const D = RV.drive, ds = D ? D.status() : {};
    const act = ds.connected ? (ds.tokenOk ? ['Back up now', () => D.backupNow().then((ok) => { if (ok) UI.toast('Saved to Google Drive'); })] : ['Reconnect', () => D.connect()])
      : ds.configured ? ['Back up to Google Drive', () => D.connect()] : ['Back up', () => { location.hash = '#/settings/data'; }];
    const el = h('section', { class: 'card bknudge' },
      h('div', { class: 'bkn' }, h('span', { class: 'bkni', 'aria-hidden': 'true' }, icon('download', 18)),
        h('div', null, h('b', null, last ? 'Last backup ' + U.fmtDate(last) : 'Your records are only on this phone'),
          h('div', { class: 'muted small' }, ds.configured ? 'A backup to your own Google Drive keeps them safe if the phone is lost or its browser is cleared.' : 'A backup keeps them safe if the phone is lost or its browser is cleared.'))),
      h('div', { class: 'bknb' }, h('button', { class: 'btn primary sm', type: 'button', onclick: act[1] }, act[0]),
        h('button', { class: 'link', type: 'button', onclick: () => { try { localStorage.setItem(BK_LATER, U.toDateStr(now)); } catch (e) { /* ignore */ } el.remove(); } }, 'Not now')));
    return el;
  }

  // ---------- v2.51 Today's list ----------
  // The people you mean to see today, in your order, with an optional note for the day. Follow-ups for today join
  // on their own. A visit or Not Home ticks someone off; the heading counts what's done. Clears overnight.
  const TL = () => RV.todayList;
  const smallPlant = (it) => { const st = gardenOn() ? gstate(it) : null; return h('span', { class: 'tlpl' }, st && st.form ? plantOf(st, 'sm', { still: true }) : null); };
  const hhmm = (iso) => U.fmtTime(new Date(iso));
  function todayCard(now) {
    const items = ST.items();
    const rows = TL().rows(items, S.settings, now);
    const st = TL().stateOf(S.settings, now);
    const seen = rows.filter((r) => r.done).length;
    const likely = new Map(L.likelyHomeNow(items, now).map((o) => [o.item.rv.id, o.why]));
    const note = h('button', { class: 'tlnote' + (st.note ? '' : ' empty'), type: 'button',
      onclick: async () => { const v = await UI.textPrompt({ title: 'Note for the day', value: st.note, placeholder: 'e.g. Car group at 9:30', okText: 'Save' }); if (v != null) TL().setNote(v); } },
      st.note || 'Add a note for the day');
    const body = h('div', { class: 'tlrows' });
    rows.forEach((r) => {
      const rv = r.it.rv;
      const doneLine = r.done ? (r.done.type === 'nh' ? 'Not home ' : 'Visited ') + hhmm(r.done.at) : null;
      const bring = rv.nextStart && L.isStudyStage(S.settings, rv.stage) ? 'Next: ' + rv.nextStart : rv.whatsNext ? 'Bring up: ' + rv.whatsNext : null;
      const row = h('div', { class: 'tlrow' + (r.done ? ' done' : ''), 'data-id': rv.id },
        h('span', { class: 'tltick', 'aria-hidden': 'true' }, r.done ? icon('check', 13) : null),
        smallPlant(r.it),
        h('a', { class: 'tlmain', href: '#/rv/' + rv.id },
          h('span', { class: 'tlname' }, rv.name, r.followUp ? h('span', { class: 'tlfu' }, 'Follow-up today') : null, r.done ? h('span', { class: 'sr-only' }, ', done') : null),
          h('span', { class: 'tlsub' }, doneLine || likely.get(rv.id) || rv.address || ''),
          !r.done && bring ? h('span', { class: 'tlbring' }, bring) : null),
        rows.length > 1 ? h('button', { class: 'tlgrip', type: 'button', 'aria-label': 'Move ' + rv.name }, icon('grip', 18)) : null);
      body.appendChild(row);
    });
    if (rows.length > 1) dragSort(body, (ids) => TL().reorder(ids));
    return h('section', { class: 'tlcard' },
      h('div', { class: 'tlhead' }, h('h2', null, "Today's list", seen ? h('span', { class: 'tlseen' }, ' · ' + seen + ' seen') : null),
        h('button', { class: 'tladd', type: 'button', onclick: () => todayAddSheet() }, icon('plus', 16), 'Add')),
      note,
      rows.length ? body : h('div', { class: 'tlempty' }, h('div', { class: 'muted small' }, 'Add people you want to see today.'),
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => todayAddSheet() }, icon('plus', 16), 'Add people')));
  }
  // Drag a row by its grip to reorder (touch and mouse). Calls done(ids) with the new order.
  function dragSort(box, done) {
    box.addEventListener('pointerdown', (e) => {
      const grip = e.target.closest('.tlgrip');
      if (!grip) return;
      e.preventDefault();
      const row = grip.closest('.tlrow');
      const startY = e.clientY;
      row.classList.add('drag');
      grip.setPointerCapture(e.pointerId);
      const move = (ev) => {
        row.style.transform = 'translateY(' + (ev.clientY - startY) + 'px)';
        const sibs = Array.from(box.children).filter((x) => x !== row);
        const r = row.getBoundingClientRect(), mid = r.top + r.height / 2;
        const before = sibs.find((x) => { const b = x.getBoundingClientRect(); return mid < b.top + b.height / 2; });
        const want = before || null;
        if (row.nextElementSibling !== want) { const top0 = row.getBoundingClientRect().top; box.insertBefore(row, want); const top1 = row.getBoundingClientRect().top; const cur = parseFloat((row.style.transform.match(/-?[\d.]+/) || [0])[0]); row.style.transform = 'translateY(' + (cur - (top1 - top0)) + 'px)'; }
      };
      const up = () => {
        grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
        row.classList.remove('drag'); row.style.transform = '';
        done(Array.from(box.children).map((x) => x.getAttribute('data-id')));
      };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
  }
  // Add people: everyone A to Z with a search; tap to add or take off. Nothing is sorted for you or pre-ticked.
  function todayAddSheet() {
    const now = new Date();
    const items = ST.items().filter((it) => it.att.state !== 'closed').sort((a, b) => U.cmp(a.rv.name, b.rv.name));
    const onList = new Set(TL().rows(ST.items(), S.settings, now).map((r) => r.it.rv.id));
    const q = h('input', { type: 'search', placeholder: 'Search name, address, notes…', 'aria-label': 'Search contacts', autocomplete: 'off' });
    const box = h('div', { class: 'tlpick' });
    const paint = () => {
      const t = q.value.trim().toLowerCase();
      const hits = t ? items.filter((it) => [it.rv.name, it.rv.address, it.rv.notes, it.rv.neighborhood].some((x) => String(x || '').toLowerCase().includes(t))) : items;
      box.replaceChildren(...hits.map((it) => {
        const on = onList.has(it.rv.id);
        const b = h('button', { class: 'tlpk' + (on ? ' on' : ''), type: 'button', 'aria-pressed': String(on), onclick: () => {
          if (onList.has(it.rv.id)) { TL().remove(it.rv.id); onList.delete(it.rv.id); } else { TL().add(it.rv.id); onList.add(it.rv.id); }
          paint();
        } }, smallPlant(it),
          h('span', { class: 'm' }, h('span', null, it.rv.name), h('span', { class: 'muted small' }, [it.rv.address, it.rv.neighborhood].filter(Boolean).join(' · '))),
          h('span', { class: 'tlcb', 'aria-hidden': 'true' }, on ? icon('check', 14) : null));
        return b;
      }));
      if (!hits.length) box.appendChild(h('div', { class: 'muted small', style: { padding: '12px 4px' } }, t ? 'Nobody matches that search.' : 'No contacts yet.'));
    };
    q.addEventListener('input', paint);
    paint();
    UI.sheet("Add to today's list", (close) => h('div', { class: 'tladdsheet' }, q, box,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
  }
  // Could visit today: up to three people likely home today or with today as their best day, not on the list and
  // not seen today. Only when they're likely home; nothing is added for you.
  function couldVisit(now) {
    const items = ST.items();
    const onList = new Set(TL().rows(items, S.settings, now).map((r) => r.it.rv.id));
    const why = new Map(L.likelyHomeNow(items, now).map((o) => [o.item.rv.id, o.why]));
    const dow = now.getDay();
    const pool = L.likelyHomeToday(items, now).filter((it) => !onList.has(it.rv.id));
    pool.sort((a, b) => (why.has(b.rv.id) - why.has(a.rv.id)) || U.cmp(a.rv.name, b.rv.name));
    const list = pool.slice(0, 3);
    if (!list.length) return null;
    return h('section', { class: 'tlcard could' },
      h('div', { class: 'tlhead' }, h('h2', null, 'Could visit today')),
      h('div', { class: 'tlrows' }, list.map((it) => h('div', { class: 'tlrow' },
        smallPlant(it),
        h('a', { class: 'tlmain', href: '#/rv/' + it.rv.id }, h('span', { class: 'tlname' }, it.rv.name),
          h('span', { class: 'tlsub' }, why.get(it.rv.id) || ((it.rv.bestDays || []).includes(dow) ? 'Best day ' + U.DAYS[dow] : 'Usually home ' + U.DAYS[dow] + 's'))),
        h('button', { class: 'tladd', type: 'button', 'aria-label': 'Add ' + it.rv.name + " to today's list", onclick: () => TL().add(it.rv.id) }, icon('plus', 16), 'Add')))));
  }
  // The calendar in a contact's top bar: Today puts them on today's list; Tomorrow or a date sets the follow-up date.
  function planSheet(rvId) {
    const rv = ST.rvById(rvId);
    if (!rv) return;
    const now = new Date();
    const on = TL().has(ST.items(), S.settings, rvId, now);
    const tomorrow = U.toDateStr(U.addDays(now, 1));
    const date = h('input', { type: 'date', value: rv.snoozedUntil && rv.snoozedUntil > U.toDateStr(now) ? rv.snoozedUntil : '', min: tomorrow, 'aria-label': 'Follow up on' });
    const follow = (val) => {
      const res = ST.snooze(rvId, val);
      UI.toast(val ? 'Follow up on ' + U.fmtDate(val) : 'Follow-up date cleared', { actions: [{ label: 'Undo', fn: res.undo }], seconds: 4 });
    };
    const opt = (label, sub, fn) => h('button', { class: 'planopt', type: 'button', onclick: fn }, h('b', null, label), h('span', { class: 'muted small' }, sub));
    UI.sheet('Plan a visit', (close) => h('div', { class: 'plansheet' },
      h('div', { class: 'muted small', style: { marginTop: '-6px' } }, rv.name),
      on ? opt("Take off today's list", '', () => { TL().remove(rvId); UI.toast("Taken off today's list", { actions: [{ label: 'Undo', fn: () => TL().add(rvId) }], seconds: 4 }); close(); })
        : opt('Today', "Adds " + String(rv.name || '').split(' ')[0] + " to today's list", () => { TL().add(rvId); UI.toast("Added to today's list", { actions: [{ label: 'Undo', fn: () => TL().remove(rvId) }], seconds: 4 }); close(); }),
      opt('Tomorrow', 'Follow up on ' + U.fmtDate(tomorrow), () => { follow(tomorrow); close(); }),
      h('div', { class: 'planpick' }, h('label', null, h('b', null, 'Pick a date'), date),
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => { if (date.value) { follow(date.value); close(); } } }, 'Set')),
      rv.snoozedUntil && rv.snoozedUntil > U.toDateStr(now) ? h('button', { class: 'link', type: 'button', onclick: () => { follow(null); close(); } }, 'Clear follow-up on ' + U.fmtDate(rv.snoozedUntil)) : null));
  }
  function home() {
    const items = ST.items();
    // v2.50.1: a new user first sees what Groundwork is, then Getting started (or, if that was skipped, Add and the import rows)
    const starter = RV.garden && RV.garden.starterOn(S.settings);
    const noPeople = !S.rvs.some((r) => !r.deletedAt);
    let intro = null;
    if (starter) {
      const sst = S.settings.starter || {};
      if (!sst.introGone) {
        if (RV.garden.starterSteps(ST.items(), S.settings, !!(RV.drive && RV.drive.status().connected)).done === 0) intro = introCard(true);
        else setTimeout(() => ST.saveSettings((s) => { s.starter = Object.assign({}, s.starter, { introGone: true }); }), 0);
      }
    } else if (noPeople) intro = introCard(false);
    const welcome = starter ? starterCard() : noPeople
      ? h('section', { class: 'card welcome' },
        h('button', { class: 'btn primary block', type: 'button', onclick: () => F.quickAdd() }, icon('plus', 18), 'Add your first contact'),
        importRows())
      : null;
    const d = new Date();
    const hasPeople = S.rvs.some((r) => !r.deletedAt);
    return {
      title: lbl('today'), sub: U.DAYS[d.getDay()] + ', ' + U.MONTHS[d.getMonth()] + ' ' + d.getDate(), fab: true,
      // v2.40: the campaign, then Conversations, If you see them and a line to Contacts; Schedule a campaign at the foot
      el: (() => { const camp = campaignBar(), planOnly = camp && camp.classList.contains('plan-camp');
        return h('div', { class: 'home' }, intro, planOnly ? null : camp, welcome, conversations(), hasPeople ? backupCard(d) : null, hasPeople ? todayCard(d) : null, hasPeople ? couldVisit(d) : null, planOnly ? camp : null); })(),
    };
  }

  // v2.39: the stage tiles are gone; #/today and its old stage links open Today (Home)
  function today() { return home(); }

  // ---------- RV list ----------
  // Search plus one filter button. Filters live on a separate page, one picker wheel per category.
  // Default order: longest since the last visit first, so nobody falls through the cracks.
  const LS_KEY = 'rvapp.list';
  const LIST_SORTS = [['oldest', 'Longest since visit'], ['neighborhood', 'Area'], ['name', 'Name'], ['newest', 'Newest']];
  function loadListState() {
    let st = {};
    try { st = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { st = {}; }
    const stage = typeof st.stage === 'string' ? st.stage : (Array.isArray(st.stages) && st.stages.length === 1 ? st.stages[0] : '');
    return {
      sort: LIST_SORTS.some(([k]) => k === st.sort) ? st.sort : 'oldest',
      stage: stage ? (L.shownStages(S.settings).some((x) => x.key === stage) ? stage : S.settings.stages.some((x) => x.id === stage && !x.closed) ? L.shownStage(S.settings, stage).key : '') : '',
      neighborhood: st.neighborhood || '', bestDay: st.bestDay || '', q: '',
    };
  }
  function saveListState(st) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ sort: st.sort, stage: st.stage, neighborhood: st.neighborhood, bestDay: st.bestDay })); } catch (e) { /* ignore */ }
  }
  const DAY_OPTS = () => [{ value: '', label: 'Any day' }, { value: 'today', label: 'Today' }]
    .concat(U.DAYS.map((d, i) => ({ value: String(i), label: d }))).concat([{ value: 'none', label: 'None set' }]);
  function listFilterFor(st) {
    const active = S.settings.stages.filter((x) => !x.closed).map((x) => x.id);
    const sh = st.stage ? L.shownStages(S.settings).find((x) => x.key === st.stage) : null;
    return { stages: new Set(sh ? sh.ids : active), neighborhood: st.neighborhood, bestDay: st.bestDay };
  }

  const NO_AREA = '-';
  function areaGroups(live) {
    const map = new Map();
    for (const it of live) {
      const k = it.rv.neighborhood || NO_AREA;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({ key, name: key === NO_AREA ? 'No ' + lbl('neighborhood').toLowerCase() : key, items }))
      .sort((a, b) => (a.key === NO_AREA) - (b.key === NO_AREA) || U.cmp(a.name, b.name));
  }
  // One area's people: likely home today first, everyone else underneath, each longest since a visit first.
  function areaSections(key, all, now) {
    const inArea = (i) => (i.rv.neighborhood || NO_AREA) === key;
    const live = all.filter((i) => i.att.state !== 'closed' && inArea(i)).sort(L.SORTS.oldest);
    const home = new Set(L.likelyHomeToday(all, now).filter(inArea).map((i) => i.rv.id));
    const top = live.filter((i) => home.has(i.rv.id)), rest = live.filter((i) => !home.has(i.rv.id));
    const sec = (title, arr) => arr.length ? [h('div', { class: 'ghead' }, h('span', null, title), h('span', null, String(arr.length))), listOf(arr, { hideArea: true })] : [];
    // v2.51: Worth reconsidering moved here from Insights: people often not home, with the days tried
    const recon = L.reconsider(all, S.settings, now, new Set()).filter((r) => inArea(r.item));
    const reconSec = recon.length ? [h('div', { class: 'ghead recon' }, h('span', null, 'Not home 3 or more times'), h('span', null, String(recon.length))),
      h('div', { class: 'list' }, recon.slice(0, 8).map((r) => h('a', { class: 'row', href: '#/rv/' + r.item.rv.id },
        h('div', { class: 'main' }, h('div', { class: 'name' }, r.item.rv.name), h('div', { class: 'line2', style: { whiteSpace: 'normal' } }, lbl('notHome') + ' ' + r.nh + ' times on ' + r.label)),
        icon('right', 18))))] : [];
    return live.length ? sec('Likely home ' + U.DAYS[now.getDay()], top).concat(sec(top.length ? 'Others' : 'Everyone here', rest), reconSec) : [];
  }
  function areaScreen(key) {
    const name = key === NO_AREA ? 'No ' + lbl('neighborhood').toLowerCase() : key;
    const box = h('div');
    function paint() {
      const nodes = areaSections(key, ST.items(), new Date());
      box.replaceChildren(...(nodes.length ? nodes : [UI.emptyState('users', 'Nobody here yet.')]));
    }
    paint();
    return { title: name, back: '#/rvs', fab: true, el: box, update: paint };
  }

  // v2.32: the people just imported from notes (kept for this session)
  function importedScreen() {
    const box = h('div');
    function paint() {
      let ids = [];
      try { ids = JSON.parse(sessionStorage.getItem('rvapp.lastImport') || '[]'); } catch (e) { ids = []; }
      const set = new Set(ids);
      const items = ST.items().filter((i) => set.has(i.rv.id)).sort((a, b) => U.cmp(a.rv.name, b.rv.name));
      box.replaceChildren(...(items.length ? [h('div', { class: 'ghead' }, h('span', null, 'Just imported'), h('span', null, String(items.length))), listOf(items, {})] : [UI.emptyState('users', 'Nobody imported just now.')]));
    }
    paint();
    return { title: 'Just imported', back: '#/rvs', fab: true, el: box, update: paint };
  }

  function list(sub, key) {
    if (sub === 'area' && key) return areaScreen(key);
    if (sub === 'imported') return importedScreen();
    const st = loadListState();
    let shown = 100;
    const search = h('input', { type: 'search', placeholder: 'Search name, address, notes…', value: '', autocomplete: 'off', 'aria-label': 'Search' });
    const onSearch = U.debounce(() => { if (st.q === search.value) return; st.q = search.value; shown = 100; refresh(); }, 120);
    ['input', 'search', 'change', 'compositionend', 'keyup'].forEach((ev) => search.addEventListener(ev, onSearch));
    const filterBtn = h('button', { class: 'fbtn', type: 'button', 'aria-label': 'Filter and sort', onclick: () => filterSheet() }, icon('sliders', 22));
    const chipsBox = h('div', { class: 'achips' });
    const metaEl = h('div', { class: 'lmeta' });
    const listBox = h('div');

    const activeCount = () => (st.stage ? 1 : 0) + (st.neighborhood ? 1 : 0) + (st.bestDay ? 1 : 0);
    const dayLabel = (v) => (DAY_OPTS().find((x) => x.value === v) || {}).label || v;
    function clearAll() { st.stage = ''; st.neighborhood = ''; st.bestDay = ''; saveListState(st); shown = 100; refresh(); }

    function filterSheet() {
      const all = ST.items();
      sheet('Filter and sort', (close) => {
        const go = h('button', { class: 'btn primary block', type: 'button', onclick: () => close() });
        const wheels = {};
        const upd = () => {
          const n = L.filterItems(all, listFilterFor(st), S.settings).length;
          go.textContent = 'Show ' + n + ' ' + (n === 1 ? 'contact' : 'contacts');
          saveListState(st); shown = 100; refresh();
        };
        const sec = (label, w) => h('div', { class: 'wsec' }, h('div', { class: 'wlab' }, label), w);
        wheels.sort = UI.wheel(LIST_SORTS.map(([value, label]) => ({ value, label })), st.sort, (v) => { st.sort = v; upd(); }, { label: 'Sort' });
        wheels.stage = UI.wheel([{ value: '', label: 'Any stage' }].concat(L.shownStages(S.settings).map((x) => ({ value: x.key, label: x.name }))), st.stage, (v) => { st.stage = v; upd(); }, { label: 'Stage', neutral: '' });
        wheels.area = UI.wheel([{ value: '', label: 'Any ' + lbl('neighborhood').toLowerCase() }].concat(ST.neighborhoods().map((x) => ({ value: x, label: x }))), st.neighborhood, (v) => { st.neighborhood = v; upd(); }, { label: lbl('neighborhood'), neutral: '' });
        wheels.day = UI.wheel(DAY_OPTS(), st.bestDay, (v) => { st.bestDay = v; upd(); }, { label: 'Best day', neutral: '' });
        const reset = h('button', { class: 'link-quiet', type: 'button', onclick: () => {
          st.sort = 'oldest'; st.stage = ''; st.neighborhood = ''; st.bestDay = '';
          wheels.sort.setValue('oldest'); wheels.stage.setValue(''); wheels.area.setValue(''); wheels.day.setValue('');
          upd();
        } }, 'Reset');
        upd();
        return h('div', { class: 'fsheet' },
          h('div', { class: 'fsheet-top' }, reset),
          sec('Sort', wheels.sort), sec('Stage', wheels.stage), sec(lbl('neighborhood'), wheels.area), sec('Best day', wheels.day),
          h('div', { class: 'actions' }, go),
          h('button', { class: 'link-quiet saved', type: 'button', onclick: () => { close(); viewsSheet(); } }, 'Saved views'));
      }, { noFocus: true });
    }

    function applyView(v) {
      st.sort = LIST_SORTS.some(([k]) => k === v.sort) ? v.sort : 'oldest';
      st.stage = v.stage || (Array.isArray(v.stages) && v.stages.length === 1 ? v.stages[0] : '');
      st.neighborhood = v.neighborhood || ''; st.bestDay = v.bestDay || '';
      saveListState(st);
      shown = 100; refresh();
    }
    function viewsSheet() {
      sheet('Saved views', (close) => {
        const box = h('div');
        const views = S.settings.savedViews;
        if (!views.length) box.appendChild(h('p', { class: 'muted', style: { marginTop: 0 } }, 'Save the current filters and sort as a one-tap view.'));
        views.forEach((v) => box.appendChild(h('div', { class: 'row plain' },
          h('div', { class: 'main', style: { cursor: 'pointer' }, onclick: () => { close(); applyView(v); } },
            h('div', { class: 'name' }, v.name),
            h('div', { class: 'line2' }, [(LIST_SORTS.find(([k]) => k === v.sort) || [0, 'Longest since visit'])[1], v.stage ? L.shownName(S.settings, v.stage) : null, v.neighborhood, v.bestDay ? dayLabel(v.bestDay) : null].filter(Boolean).join(' · '))),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Delete view ' + v.name, onclick: () => { ST.saveSettings((s) => { s.savedViews = s.savedViews.filter((x) => x.id !== v.id); }); close(); viewsSheet(); } }, icon('trash')))));
        box.appendChild(h('div', { class: 'actions' }, h('button', {
          class: 'btn primary', type: 'button',
          onclick: async () => {
            close();
            const name = await UI.textPrompt({ title: 'Save current view', label: 'Name', placeholder: 'e.g. Oak Park studies' });
            if (name && name.trim()) ST.saveSettings((s) => { s.savedViews.push({ id: U.uuid(), name: name.trim(), sort: st.sort, stage: st.stage, stages: st.stage ? [st.stage] : null, neighborhood: st.neighborhood, bestDay: st.bestDay }); });
          },
        }, 'Save current view')));
        return box;
      });
    }

    // No search and no filters (v2.38): Map by default, or Areas (folders); the old Tiles view is gone.
    const VIEW_KEY = 'rvapp.rvsView';
    const mapOk = () => !!(RV.gmap && gardenOn());
    let view = (() => { try { const v = localStorage.getItem(VIEW_KEY); return v === 'folders' || v === 'list' ? v : 'map'; } catch (e) { return 'map'; } })();
    let mapView = null; // the map is kept while it is showing, so edits refresh its pins instead of reloading it
    const dropMap = () => { if (mapView) { mapView.destroy(); mapView = null; } };
    const openFolders = new Set();
    function paintAreas(all) {
      const live = all.filter((i) => i.att.state !== 'closed');
      const groups = areaGroups(live);
      // v2.51: with nobody yet, open on List (Add and the import rows); nothing goes to the map service
      const showMap = view === 'map' && mapOk() && live.length > 0;
      const cur = !live.length ? 'list' : showMap ? 'map' : view === 'list' ? 'list' : 'folders';
      const opts = (mapOk() ? [['map', 'Map']] : []).concat([['folders', lbl('neighborhood') + 's'], ['list', 'List']]);
      metaEl.replaceChildren(h('div', { class: 'seg2 vswitch' }, opts.map(([v, label]) =>
        h('button', { type: 'button', class: v === cur ? 'on' : '', 'aria-pressed': String(v === cur), onclick: () => { if (v === cur) return; view = v; try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* ignore */ } refresh(); } }, label))));
      // Map: everyone's plant where they live
      if (showMap) {
        if (!mapView) { mapView = RV.gmap.view(all); listBox.replaceChildren(mapView.el); } else mapView.refresh();
        return;
      }
      dropMap();
      if (!live.length) {
        listBox.replaceChildren(h('section', { class: 'card welcome' }, h('b', null, 'No contacts yet'), h('div', { class: 'muted small' }, 'Everyone you add appears here, A to Z.'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => F.quickAdd() }, icon('plus', 18), 'Add a contact'), importRows()));
        return;
      }
      if (cur === 'list') { listBox.replaceChildren(azList(live)); return; }
      const now = new Date();
      // with the garden on, an area shows its thirsty plants instead of "N due"
      const thirsty = (g) => gardenOn() ? g.items.map((i) => ({ i, st: gstate(i) })).filter((x) => x.st.form && x.st.care && x.st.care <= G.CARE.DRY) : [];
      listBox.replaceChildren(...groups.map((g) => {
        const open = openFolders.has(g.key);
        const due = gardenOn() ? 0 : g.items.filter((i) => i.att.state === 'overdue').length;
        const dry = thirsty(g);
        // v2.50.3: the newest real visit or Not Home (adding someone isn't a visit)
        const newest = g.items.reduce((m, i) => i.entries.reduce((mm, e) => (!e.deletedAt && (e.type === 'visit' || e.type === 'nh') && Date.parse(e.at) > mm ? Date.parse(e.at) : mm), m), 0);
        return h('section', { class: 'acard' + (open ? ' open' : '') },
          h('button', { class: 'ahead', type: 'button', 'aria-expanded': String(open), onclick: () => { if (open) openFolders.delete(g.key); else openFolders.add(g.key); refresh(); } },
            h('span', { class: 't' }, h('span', { class: 'nm' }, g.name),
              h('span', { class: 'sub' }, due ? h('b', null, due + ' due') : null, due ? ' · ' : null, g.items.length + (g.items.length === 1 ? ' person' : ' people') + (newest ? ' · last visit ' + U.relTime(newest) : ''))),
            dry.length ? h('span', { class: 'athirst', 'aria-label': dry.length + ' thirsty' }, dry.slice(0, 3).map((x, k) => plantOf(x.st, 'sm', { still: true, seed: k }))) : null,
            icon(open ? 'up' : 'down', 20)),
          open ? h('div', { class: 'abody' }, areaSections(g.key, all, now)) : null);
      }));
    }

    // v2.41: everyone A to Z, with letter headings and a jump strip down the right
    function azList(live) {
      const key = (i) => { const c = String(i.rv.name || '').trim().charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
      const rows = live.slice().sort((a, b) => String(a.rv.name || '').localeCompare(String(b.rv.name || ''), undefined, { sensitivity: 'base' }));
      const letters = [];
      const body = h('div', { class: 'azbody' });
      let curL = null, list = null;
      for (const it of rows) {
        const k = key(it);
        if (k !== curL) {
          curL = k; letters.push(k);
          body.append(h('div', { class: 'azhead', 'data-l': k }, k));
          list = h('div', { class: 'list azlist' }); body.append(list);
        }
        const gs = gardenOn() ? gstate(it) : null;
        list.append(h('a', { class: 'row azrow', href: '#/rv/' + it.rv.id },
          gs && gs.form ? h('span', { class: 'azplant' }, plantOf(gs, 'sm', { still: true })) : h('span', { class: 'azplant' }),
          h('div', { class: 'main' }, h('div', { class: 'name' }, it.rv.name || 'Unnamed'),
            h('div', { class: 'line2' }, [it.rv.address, it.rv.neighborhood].filter(Boolean).join(' \u00B7 ')))));
      }
      const strip = h('nav', { class: 'azstrip', 'aria-label': 'Jump to letter' }, letters.map((l) => h('button', { type: 'button', onclick: () => {
        const el = body.querySelector('.azhead[data-l="' + l + '"]'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } }, l)));
      // v2.50.3: slide a finger down the strip to jump, as phone contact lists do (the letters are small targets)
      let lastL = '';
      strip.addEventListener('touchmove', (e) => {
        const t = e.touches[0], b = document.elementFromPoint(t.clientX, t.clientY);
        if (b && b.parentNode === strip && b.textContent !== lastL) { lastL = b.textContent; const el = body.querySelector('.azhead[data-l="' + lastL + '"]'); if (el) el.scrollIntoView({ block: 'start' }); }
        e.preventDefault();
      }, { passive: false });
      return h('div', { class: 'az' }, body, letters.length > 3 ? strip : null);
    }

    function refresh() {
      const all = ST.items();
      if (st.neighborhood && !ST.neighborhoods().includes(st.neighborhood)) st.neighborhood = '';
      const searching = !!String(st.q || '').trim();
      const n = activeCount();
      filterBtn.classList.toggle('on', n > 0);
      filterBtn.replaceChildren(...[icon('sliders', 22), n ? h('span', { class: 'b' }, String(n)) : null].filter(Boolean));
      // a search looks through everyone; the filters only apply when not searching
      chipsBox.replaceChildren(...(searching ? [] : [
        st.stage ? ['stage', (L.shownStages(S.settings).find((x) => x.key === st.stage) || L.shownStage(S.settings, st.stage)).name] : null,
        st.neighborhood ? ['neighborhood', st.neighborhood] : null,
        st.bestDay ? ['bestDay', 'Best day: ' + dayLabel(st.bestDay)] : null,
      ].filter(Boolean).map(([k, label]) => h('button', { class: 'achip', type: 'button', 'aria-label': 'Remove ' + label, onclick: () => { st[k] = ''; saveListState(st); shown = 100; refresh(); } }, label, icon('x', 14)))));
      chipsBox.hidden = !chipsBox.firstChild;
      if (!searching && !n) { paintAreas(all); return; }
      dropMap();
      const filter = searching ? { stages: new Set(S.settings.stages.filter((x) => !x.closed).map((x) => x.id)), q: st.q } : Object.assign(listFilterFor(st), { q: '' });
      const rows = L.filterItems(all, filter, S.settings).sort(L.SORTS[st.sort] || L.SORTS.oldest);
      const total = all.filter((i) => i.att.state !== 'closed').length;
      const word = (k) => (k === 1 ? 'contact' : 'contacts');
      metaEl.replaceChildren(...[
        h('span', null, searching ? rows.length + ' found' : n ? rows.length + ' of ' + total + ' ' + word(total) : rows.length + ' ' + word(rows.length)),
        !searching && n ? h('button', { class: 'link-quiet', type: 'button', onclick: clearAll }, 'Clear all') : null].filter(Boolean));
      listBox.replaceChildren();
      if (!rows.length) {
        const none = !S.rvs.some((r) => !r.deletedAt);
        listBox.appendChild(UI.emptyState('users', none ? 'No contacts yet.' : searching ? 'Nobody matches that search.' : 'Nobody matches these filters.',
          none ? null : !searching ? h('button', { class: 'btn', type: 'button', onclick: clearAll }, 'Clear filters') : null));
        return;
      }
      const grouped = st.sort === 'neighborhood' && !searching;
      const rowOf = (it) => {
        // the address is not on the row, so show it when that is what the search matched
        const hit = searching && it.rv.address && !String(it.rv.name).toLowerCase().includes(String(st.q).trim().toLowerCase()) ? hitLine(it.rv.address, st.q) : null;
        return rvRow(it, { hideArea: grouped, hit });
      };
      const slice = rows.slice(0, shown);
      if (grouped) {
        let i = 0;
        while (i < slice.length) {
          const g = slice[i].rv.neighborhood || 'No ' + lbl('neighborhood').toLowerCase();
          const members = [];
          while (i < slice.length && (slice[i].rv.neighborhood || 'No ' + lbl('neighborhood').toLowerCase()) === g) members.push(slice[i++]);
          const count = rows.filter((r) => (r.rv.neighborhood || 'No ' + lbl('neighborhood').toLowerCase()) === g).length;
          listBox.appendChild(h('div', { class: 'ghead' }, h('span', null, g), h('span', null, String(count))));
          listBox.appendChild(h('div', { class: 'list' }, members.map(rowOf)));
        }
      } else {
        listBox.appendChild(h('div', { class: 'list' }, slice.map(rowOf)));
      }
      if (rows.length > shown) {
        listBox.appendChild(h('div', { style: { textAlign: 'center', marginTop: '12px' } },
          h('button', { class: 'btn', type: 'button', onclick: () => { shown += 100; refresh(); } }, 'Show ' + Math.min(100, rows.length - shown) + ' more')));
      }
    }

    const el = h('div', null,
      h('div', { class: 'sticky-filters' },
        h('div', { class: 'sbar2' }, h('div', { class: 'searchbox' }, icon('search', 18), search), filterBtn),
        chipsBox),
      metaEl, listBox);
    refresh();
    return { title: 'Contacts', el, fab: true, update: refresh, destroy: dropMap };
  }

  // ---------- RV detail ----------
  function kvList(rows) {
    const dl = h('dl', { class: 'kv' });
    rows.filter(Boolean).forEach(([k, v]) => { dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, v)); });
    return dl;
  }

  function entryLabel(e) {
    if (e.type === 'nh') return lbl('notHome');
    if (e.type === 'visit') return e.progress || e.nextStart ? 'Study' : 'Visit';
    if (e.type === 'note') return 'Note';
    if (e.type === 'stage') {
      const to = L.stageOf(S.settings, e.to), from = L.stageOf(S.settings, e.from);
      if (to.closed) return 'Archived' + (e.reason ? ': ' + ((L.reasonOf(S.settings, e.reason) || {}).name || '') : '');
      if (from.closed) return 'Restored to ' + L.shownName(S.settings, to.id);
      // inside RV the steps are the garden's: say how the plant grew, not the hidden stage
      if (e.grew) return 'Grew into ' + G.growthName(S.settings, e.from, e.to);
      const a = L.shownName(S.settings, from.id), b = L.shownName(S.settings, to.id);
      return a === b ? 'Stage adjusted' : 'Moved from ' + a + ' to ' + b;
    }
    return e.type;
  }

  // "Grows into a leafy plant" inside RV; "Becomes an RV" from Potential; "Grows into Bible Study" at the end.
  function nextLabel(st, rv) {
    const nm = st.nextName || '';
    if (Object.values(G.FORM_NAMES).some((f) => f.toLowerCase() === nm.toLowerCase())) return 'Grows into a ' + nm.toLowerCase();
    if (st.next && L.shownStage(S.settings, st.next).key === 'rv') return 'Becomes an ' + nm;
    return 'Grows into ' + nm;
  }
  // Record screen: big plant and stage name, the bar toward the next form, the growth path of five forms.
  function gardenHero(it, st) {
    const rv = it.rv;
    const big = plantOf(st, 'xl');
    P.leanOnTouch(big);
    if (P.pendingWater === rv.id) { P.pendingWater = null; setTimeout(() => P.water(big), 60); }
    const stName = L.shownName(S.settings, rv.stage);
    const bar = st.need && st.next
      ? h('div', { class: 'gbar' },
        h('div', { class: 'gt' }, h('b', null, nextLabel(st, rv)),
          h('span', null, st.held ? icon('calendar', 14) : null, moreText(st))),
        h('span', { class: 'mbar' + (st.fading ? ' fade' : ''), role: 'img', 'aria-label': st.have + ' of ' + st.need },
          Array.from({ length: st.need }, (_, i) => h('i', { class: i < st.have ? 'on' : '' }))))
      : null;
    // v2.46: forms still ahead are solid silhouettes; a growth
    // fills the next one in (playFill)
    const path = h('div', { class: 'gpath', 'data-rv': rv.id },
      h('div', { class: 'gl' }, 'Growth path'),
      h('div', { class: 'gs' }, [1, 2, 3, 4, 5].map((f) => {
        // v2.46.1: each stage is drawn the same for everyone (healthy, no kind, no per-person variant); the plant above shows this person's
        const pl = P.make(f, 4, { size: 'sm', still: true, seed: f });
        if (f > st.form) pl.classList.add('sil');
        return h('span', { class: f === st.form ? 'cur' : '' }, pl);
      })));
    path.querySelectorAll('.pl').forEach((el, i) => { if (i + 1 < st.form) el.classList.add('nf'); });
    return h('div', null,
      // v2.24.1: the person's name leads, beside their plant; the stage sits under it (tap to change)
      h('div', { class: 'ghero' }, big,
        h('div', { class: 'gwho' },
          h('h2', { class: 'gperson' }, rv.name),
          h('button', { class: 'gname', type: 'button', 'aria-label': 'Change stage: ' + stName, onclick: () => F.stageFlow(rv.id) }, stName, icon('down', 16)))),
      bar, path);
  }

  // v2.46: after a growth moment, on the record: a quiet burst on the next pot, the highlight moves to it and its
  // silhouette fills in with colour from the soil up (about a second; skipped when reduced motion is on)
  function playFill(rvId, from, to) {
    const path = document.querySelector('.gpath[data-rv="' + rvId + '"]');
    if (!path || !(to > from)) return;
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const spans = path.querySelectorAll('.gs > span');
    const a = spans[from - 1], b = spans[to - 1];
    if (!a || !b || !b.firstChild) return;
    const sil = b.firstChild.cloneNode(true);
    sil.classList.add('sil');
    const ov = h('span', { class: 'silov', 'aria-hidden': 'true' }, sil);
    b.appendChild(ov);
    b.classList.remove('cur'); a.classList.add('cur');
    setTimeout(() => {
      a.classList.remove('cur'); b.classList.add('cur', 'pop');
      const fx = h('span', { class: 'fillfx', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5].map((k) => { const d = h('i'); d.style.setProperty('--a', (k * 60 + 30) + 'deg'); return d; }));
      b.appendChild(fx);
      requestAnimationFrame(() => ov.classList.add('go'));
      setTimeout(() => { ov.remove(); fx.remove(); b.classList.remove('pop'); }, 1100);
    }, 280);
  }

  function detail(id) {
    const it = ST.itemFor(id);
    if (!it) {
      return { title: 'Not found', back: '#/rvs', el: UI.emptyState('alert', 'This record no longer exists.', h('a', { class: 'btn', href: '#/rvs' }, 'Back to contacts')) };
    }
    const rv = it.rv;
    const closed = it.att.state === 'closed';
    const dnc = L.isDNC(S.settings, rv);
    const reason = L.reasonOf(S.settings, rv.archiveReason);
    const els = [];

    if (dnc) {
      els.push(h('div', { class: 'banner danger', role: 'alert' }, icon('alert'), h('div', { class: 'body' }, h('strong', null, 'Do not call. '), 'Do not visit or contact this person. Visits cannot be logged on this record.')));
    } else if (closed) {
      els.push(h('div', { class: 'banner info' }, icon('archive'), h('div', { class: 'body' }, 'Archived' + (reason ? ': ' + reason.name : '') + '.',
        reason && reason.restorable ? h('div', null, h('button', { class: 'link', type: 'button', onclick: () => F.restoreFlow(rv.id) }, 'Restore')) : null)));
    }
    const pattern = L.notHomePattern(it, S.settings, new Date());
    if (pattern) {
      els.push(h('div', { class: 'banner warn' }, icon('clock'),
        h('div', { class: 'body' },
          h('strong', null, 'Usually not home on ' + pattern.label + '. '),
          'Not home ' + pattern.nh + ' of ' + (pattern.nh + pattern.home) + ' tries at this time.',
          h('div', null, h('button', { class: 'link', type: 'button', onclick: () => ST.updateRv(rv.id, { nhBannerOff: true }) }, 'Hide for this contact'),
            ' · Turn off for everyone in Settings > Needs attention.'))));
    }

    // header card: who they are and what to bring up, then the actions
    const study = !closed && L.isStudyStage(S.settings, rv.stage);
    const gst = gardenOn() && !closed ? gstate(it) : null;
    // the Studying block shows from the first study session, whatever the stage
    const showStudy = !closed && (study || (gst && gst.studied));
    const lastStudy = it.entries.find((e) => e.type === 'visit' && e.progress);
    // v2.36.2: the newest note, a visit's or a study's, shows at the top for everyone (studies used to hide it)
    const lastVisit = it.entries.find((e) => e.type === 'visit' && e.text);
    const editNext = async () => {
      const t = await UI.textPrompt({ title: 'Discuss next time', multiline: true, cleanup: true, value: rv.whatsNext || '', placeholder: 'Bring next time' });
      if (t !== null) ST.updateRv(rv.id, { whatsNext: t.trim() });
    };
    // v2.46: topic ideas for next time, from what is known about them; fetched only when Ideas is tapped and kept on the
    // record until the next visit (never in the way of recording a visit)
    const latestVisit = it.entries.find((e) => e.type === 'visit');
    const ideasKey = latestVisit ? latestVisit.id : '';
    const ideasCached = rv.ideas && rv.ideas.after === ideasKey && Array.isArray(rv.ideas.picks) ? rv.ideas.picks : null;
    const topicsAll = ST.libItems('topic');
    const canIdeas = !closed && !study && !rv.whatsNext && topicsAll.length && RV.ai && RV.ai.available();
    const ideasBox = h('div', { class: 'ideas' });
    const paintIdeas = (picks) => {
      const rows = picks.map((p) => ({ p, t: topicsAll.find((x) => x.id === p.id) })).filter((x) => x.t);
      ideasBox.replaceChildren(...(rows.length ? [h('div', { class: 'ideas-k' }, 'Ideas for next time')].concat(rows.map(({ p, t }) =>
        h('button', { class: 'idea', type: 'button', onclick: () => {
          const before = rv.whatsNext || '';
          ST.updateRv(rv.id, { whatsNext: t.title + (t.question ? ': ' + t.question : '') });
          toast('Added to Discuss next time', { seconds: 5, actions: [{ label: 'Undo', fn: () => ST.updateRv(rv.id, { whatsNext: before }) }] });
        } }, h('b', null, t.title), p.why ? h('span', null, p.why) : null))) : [h('div', { class: 'muted small' }, 'No ideas this time.')]));
    };
    const ideasBtn = canIdeas ? h('button', { class: 'ideasbtn', type: 'button', onclick: async () => {
      if (ideasCached) { if (ideasBox.firstChild) ideasBox.replaceChildren(); else paintIdeas(ideasCached); return; }
      ideasBtn.disabled = true; ideasBtn.classList.add('busy'); ideasBtn.lastChild.textContent = 'Thinking…';
      try {
        const lt = rv.lastTopic ? topicsAll.find((y) => y.id === rv.lastTopic) : null;
        const nx = lt ? nextInSeries(lt) : null;
        const picks = await RV.ai.suggestTopics({
          stage: L.shownName(S.settings, rv.stage), notes: rv.notes || '',
          lastTopic: lt ? lt.title + (nx ? ' (next part: ' + nx.title + ')' : '') : '',
          visits: it.entries.filter((e) => e.type === 'visit' && e.text).slice(0, 5).map((e) => U.fmtDate(e.at) + ': ' + String(e.text).slice(0, 400)),
          topics: topicsAll.map((t) => ({ id: t.id, tract: !!t.tract, title: t.title, question: t.question || t.text || '', next: (nextInSeries(t) || {}).title || '' })),
        });
        ST.updateRv(rv.id, { ideas: { after: ideasKey, at: U.nowISO(), picks } });
        if (!picks.length) toast('No ideas this time.');
      } catch (e) {
        toast('Couldn\u2019t get ideas right now.', { seconds: 4 });
        ideasBtn.disabled = false; ideasBtn.classList.remove('busy'); ideasBtn.lastChild.textContent = 'Ideas';
      }
    } }, icon('sparkle', 14), h('span', null, 'Ideas')) : null;
    if (canIdeas && ideasCached) paintIdeas(ideasCached);
    // v2.41: the topic last used with them, and the next part of its series
    const lastTopic = rv.lastTopic ? S.lib.find((y) => y.id === rv.lastTopic && !y.deletedAt) || null : null;
    const nextTopic = lastTopic ? nextInSeries(lastTopic) : null;
    // v2.51: on a study record, a Discuss next time written before the first study session is left out (it stays in
    // the timeline); one written after studies began still shows
    const visitsLive = it.entries.filter((e) => !e.deletedAt && e.type === 'visit');
    const firstStudy = visitsLive.filter((e) => e.study || e.progress || e.nextStart).reduce((m, e) => (!m || e.at < m.at ? e : m), null);
    const lastPlan = visitsLive.filter((e) => e.plan === true && !(e.study || e.progress || e.nextStart)).reduce((m, e) => (!m || e.at > m.at ? e : m), null);
    const stalePlan = study && rv.whatsNext && firstStudy && lastPlan && lastPlan.at < firstStudy.at;
    const snapshot = !closed || rv.whatsNext || lastVisit
      ? h('div', { class: 'snap' },
        showStudy
          ? h('div', { class: 'snap-row study2' },
            h('div', { class: 'snap-k' }, 'Studying'),
            h('button', { class: 'snap-v sbtn' + (rv.publication ? ' pub' : ' empty'), type: 'button', 'aria-label': 'Publication: ' + (rv.publication || 'not set'), onclick: () => F.studyEdit(rv.id, 'pub') }, rv.publication || 'Choose a publication'),
            h('button', { class: 'study-sub sbtn', type: 'button', 'aria-label': 'Start next time: ' + (rv.nextStart || 'not set'), onclick: () => F.studyEdit(rv.id, 'next') }, 'Next: ' + (rv.nextStart || 'tap to set') + (rv.progress ? ' · last covered ' + rv.progress + (lastStudy ? ', ' + U.fmtDate(lastStudy.at) : '') : '')))
          : null,
        ((!closed && !study) || rv.whatsNext) && !stalePlan
          ? (rv.whatsNext || closed
            ? h(closed ? 'div' : 'button', { class: 'snap-row next', type: closed ? null : 'button', onclick: closed ? null : editNext },
              h('div', { class: 'snap-k' }, 'Discuss next time'), h('div', { class: 'snap-v' }, rv.whatsNext))
            // v2.46: empty: + Add, and Ideas (topic suggestions, only when asked for)
            : h('div', { class: 'snap-row next add1', onclick: (e) => { if (!e.target.closest('.ideasbtn, .add1v')) editNext(); } },
              h('div', { class: 'snap-k' }, 'Discuss next time'),
              h('div', { class: 'add1b' }, ideasBtn, h('button', { class: 'add1v', type: 'button', onclick: editNext }, '+ Add'))))
          : null,
        ideasBox,
        lastTopic ? h('div', { class: 'snap-row ltopic' },
          h('div', { class: 'snap-k' }, 'Topic last used'),
          h('div', { class: 'ltv' },
            h('button', { class: 'link-quiet', type: 'button', onclick: () => topicView(lastTopic) }, lastTopic.title),
            nextTopic ? h('button', { class: 'link-quiet ltnext', type: 'button', onclick: () => topicView(nextTopic) }, 'Next: ' + nextTopic.title) : null)) : null,
        lastVisit
          ? h('button', { class: 'snap-row lastv', type: 'button', 'aria-label': 'Edit the last visit', onclick: () => UI.editEntrySheet(lastVisit.id) },
            h('div', { class: 'snap-k' }, (lastVisit.study || lastVisit.progress ? 'Last study · ' : 'Last visit · ') + U.fmtDateTime(lastVisit.at)),
            h('div', { class: 'snap-v' }, lastVisit.text))
          : null)
      : null;
    const hero = gst && gst.form ? gardenHero(it, gst) : null;
    const head = h('section', { class: 'card' },
      hero,
      hero
        ? (it.att.state === 'snoozed' ? h('div', { style: { marginBottom: '8px' } }, attBadge(it.att)) : null)
        : h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } }, stageBadge(rv.stage), it.att.state === 'snoozed' ? attBadge(it.att) : null),
      // v2.28: the address edits; the arrow gives directions
      h('div', { class: 'addrline' },
        h('button', { class: 'linkline', type: 'button', 'aria-label': rv.address ? 'Edit address: ' + rv.address : 'Add address', onclick: () => F.addressSheet(rv.id) },
          h('span', { class: 'lt' + (rv.address ? '' : ' add') }, rv.address ? rv.address + (rv.neighborhood ? ' · ' + rv.neighborhood : '') : (rv.neighborhood ? rv.neighborhood + ' · ' : '') + 'Add address')),
        rv.address || rv.geo ? h('button', { class: 'iconbtn sm navbtn', type: 'button', 'aria-label': 'Directions to ' + (rv.address || rv.name), onclick: () => UI.openNav(UI.navTarget(rv)) }, icon('navigation', 18)) : null),
      rv.phone
        ? h('div', { class: 'phoneline' },
          h('button', { class: 'linkline', type: 'button', 'aria-label': 'Call ' + rv.phone, onclick: () => UI.openTel(rv.phone) }, h('span', { class: 'lt' }, rv.phone), icon('phone', 18)),
          h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Text ' + rv.phone, onclick: () => UI.openSms(rv.phone) }, icon('message', 18)))
        : null,
      rv.notes ? h('div', { class: 'household' }, rv.notes) : null,
      snapshot,
      !closed
        ? h('div', { class: 'stack', style: { marginTop: '12px' } },
          h('div', { class: 'btn-row' },
            // v2.39: two buttons; a study is a visit with Study session on (it opens on for anyone who has studied)
            h('button', { class: 'btn big', type: 'button', onclick: () => UI.doNotHome(rv.id) }, icon('door', 22), lbl('notHome')),
            h('button', { class: 'btn big primary', type: 'button', onclick: () => F.visitDialog(rv.id) }, icon('note', 22), lbl('recordVisit'))),
          // v2.29: Getting started tips
          (() => { const first = String(rv.name || '').split(' ')[0];
            // v2.50.1: taught here, on the contact, not as checklist steps; one tip at a time, each until Got it
            const t = S.settings.tips || {};
            if (!t.visit) return coach('visit', 'This is ' + first + '\u2019s plant. After a conversation, tap ' + lbl('recordVisit') + '. Add a plan under Discuss next time and it thrives.');
            if (!t.nh) return coach('nh', 'Nobody home? Tap ' + lbl('notHome') + '. Knocking counts toward your week.');
            return null; })())
        : null);
    els.push(head);

    // details card
    const custom = (S.settings.customFields || []).map((c) => ((rv.custom || {})[c.id] ? [c.name, rv.custom[c.id]] : null));
    const rows = [
      rv.howMet ? ['How we met', rv.howMet] : null,
      UI.campaignName(rv.campaignId) ? ['Met during', UI.campaignName(rv.campaignId)] : null,
      rv.snoozedUntil && U.parseDateStr(rv.snoozedUntil) >= U.startOfDay(new Date()) ? ['Snoozed until', U.fmtDate(rv.snoozedUntil)] : null,
      L.dayTagsOf(rv).length || rv.bestNote ? ['Best days', [L.tagsLabel(rv), rv.bestNote].filter(Boolean).join('\n')] : null,
      // v2.39: the estimate from visits and Not homes
      (() => { const b = !closed && L.bestHomeSlot(it, new Date(), ST.items()); return b ? ['Likely home', b.label] : null; })(),
    ].concat(custom).concat([
      ['Activity', it.visits + ' visits · ' + it.nh + ' ' + lbl('notHome').toLowerCase()],
      ['Added', U.fmtDate(new Date(rv.createdAt))],
    ]);
    const tagsEl = (rv.tags || []).length ? h('div', { style: { marginTop: '10px' } }, rv.tags.map((t) => h('span', { class: 'tag' }, t))) : null;
    els.push(h('details', { class: 'card fold' },
      h('summary', null, h('h2', null, 'Details'), icon('down', 18)),
      h('div', { style: { margin: '10px 0' } }, h('button', { class: 'btn sm', type: 'button', onclick: () => F.rvForm(rv) }, icon('edit', 16), 'Edit')),
      kvList(rows), tagsEl));

    // timeline
    let tlShown = 30;
    const tlBox = h('div');
    const renderTl = () => {
      tlBox.replaceChildren();
      if (!it.entries.length) { tlBox.appendChild(h('div', { class: 'muted small' }, 'No activity yet.')); return; }
      const ul = h('ul', { class: 'tl' });
      // v2.51: the newest visit is left out (Last visit above shows it); a row opens its edit sheet (Delete is inside)
      const shown = it.entries.filter((e) => !(lastVisit && e.id === lastVisit.id));
      if (!shown.length) { tlBox.appendChild(h('div', { class: 'muted small' }, 'Nothing earlier.')); return; }
      shown.slice(0, tlShown).forEach((e) => {
        const body = [h('div', { class: 'what' }, entryLabel(e)),
          h('div', { class: 'when' }, U.fmtDateTime(e.at)),
          e.progress || e.nextStart ? h('div', { class: 'txt', style: { fontWeight: 500 } }, [e.publication, e.progress ? 'Covered ' + e.progress : null, e.nextStart ? 'next: ' + e.nextStart : null].filter(Boolean).join(' · ')) :
          e.text ? h('div', { class: 'txt' }, e.text) : null,
          (e.scriptures || []).length ? h('div', { class: 'small muted' }, lbl('scriptures') + ': ' + e.scriptures.join(', ')) : null,
          UI.campaignName(e.campaignId) ? h('div', { class: 'small muted' }, lbl('campaign') + ': ' + UI.campaignName(e.campaignId)) : null];
        ul.appendChild(h('li', { class: e.type + (e.type !== 'stage' ? ' tap' : '') },
          e.type !== 'stage' ? h('button', { class: 'tlopen', type: 'button', 'aria-label': 'Edit this entry', onclick: () => UI.editEntrySheet(e.id) }, ...body, h('span', { class: 'tlchev', 'aria-hidden': 'true' }, icon('right', 16))) : body));
      });
      tlBox.appendChild(ul);
      if (shown.length > tlShown) tlBox.appendChild(h('button', { class: 'btn sm', type: 'button', style: { marginTop: '10px' }, onclick: () => { tlShown += 30; renderTl(); } }, 'Show more'));
    };
    renderTl();
    els.push(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Timeline')),
      tlBox));

    const more = h('button', {
      class: 'iconbtn', type: 'button', 'aria-label': 'More actions',
      onclick: () => sheet('Actions', (close) => {
        const act = (label, fn, sub) => h('button', { class: 'opt', type: 'button', onclick: () => { close(); fn(); } }, h('div', null, h('div', null, label), sub ? h('div', { class: 'sub' }, sub) : null));
        return h('div', null,
          !closed ? act('Move to stage', () => F.stageFlow(rv.id)) : null,
          !closed ? act(lbl('archive') + '…', () => F.archiveFlow(rv.id), 'Choose a reason') : (reason && reason.restorable ? act('Restore', () => F.restoreFlow(rv.id)) : null),
          !closed ? act('Plan a visit…', () => planSheet(rv.id), rv.snoozedUntil ? 'Follow up on ' + U.fmtDate(rv.snoozedUntil) : "Today's list or a date") : null,
          !closed ? act('Hand over…', () => F.handoverFlow(rv.id), 'Send to another publisher') : null,
          act('Delete this contact permanently', async () => {
            const ok = await confirmDialog({ title: 'Delete ' + rv.name + '?', message: 'This removes the record and its timeline. To keep a record of someone who should not be contacted, archive them instead.', confirmText: 'Delete', danger: true });
            if (ok) { ST.deleteRv(rv.id); location.hash = '#/rvs'; }
          }));
      }),
    }, icon('more'));
    return {
      title: rv.name, back: '#/rvs', titleWatch: hero ? '.gperson' : null, // the bar shows the name once the big one scrolls away
      // v2.51: the calendar plans a visit (today's list, or a follow-up date); it fills in while they're on today's list
      actions: [!closed ? (() => { const on = RV.todayList.has(ST.items(), S.settings, rv.id, new Date());
          return h('button', { class: 'iconbtn plancal' + (on ? ' on' : ''), type: 'button', 'aria-label': on ? "On today's list. Plan a visit" : 'Plan a visit', onclick: () => planSheet(rv.id) }, icon(on ? 'calcheck' : 'calplus')); })() : null,
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Edit', onclick: () => F.rvForm(rv) }, icon('edit')), more].filter(Boolean),
      el: h('div', null, els),
    };
  }

  RV.screens = { playFill, coach, starterCard, introCard, planSheet, todayAddSheet, home, today, list, detail, libSheet, topicView, refChips, themeName, linkify, todayTopics, nextInSeries, seriesOfItem, goToTopic, campaignSheet, rvRow, gardenOn, gstate, plantOf };
})(window);
