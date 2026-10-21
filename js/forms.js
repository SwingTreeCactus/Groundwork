/* RV app: forms and flows (add/edit RV, quick add, record visit, stage, archive, snooze). */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const { h, icon } = RV.dom;
  const U = RV.util, L = RV.logic, ST = RV.store, UI = RV.ui;
  const S = ST.S;
  const { sheet, field, toast, confirmDialog, pick, lbl } = UI;

  function select(options, current, props) {
    const sel = h('select', props || {});
    options.forEach((o) => sel.appendChild(h('option', { value: o.value, selected: o.value === current }, o.label)));
    return sel;
  }
  const activeStages = () => S.settings.stages.filter((s) => !s.closed);
  const stageOptions = () => activeStages().map((s) => ({ value: s.id, label: s.name }));

  // ---------- area pick list: choose a saved area, or add one (matched to an existing name ignoring case) ----------
  const areaKey = (x) => String(x || '').trim().replace(/\s+/g, ' ').toLowerCase();
  function areaPicker(current) {
    const sel = h('select', { 'aria-label': lbl('neighborhood') });
    const NEW = '__new__';
    let value = String(current || '').trim();
    const render = () => {
      const names = ST.neighborhoods();
      if (value && !names.some((n) => n === value)) names.push(value);
      sel.replaceChildren(h('option', { value: '' }, '(none)'),
        ...names.map((n) => h('option', { value: n, selected: n === value }, n)),
        h('option', { value: NEW }, '+ Add new ' + lbl('neighborhood').toLowerCase() + '…'));
      sel.value = value;
    };
    sel.addEventListener('change', async () => {
      if (sel.value !== NEW) { value = sel.value; return; }
      sel.value = value;
      const typed = await UI.textPrompt({ title: 'New ' + lbl('neighborhood').toLowerCase(), placeholder: 'Name' });
      const name = String(typed || '').trim().replace(/\s+/g, ' ');
      if (!name) return;
      const existing = ST.neighborhoods().find((n) => areaKey(n) === areaKey(name));
      if (existing) { value = existing; if (existing !== name) toast('Already on the list as ' + existing); }
      else { ST.saveSettings((st) => { st.lists.neighborhoods = U.uniq(st.lists.neighborhoods.concat(name)); }); value = name; }
      render();
    });
    render();
    return { el: sel, get: () => value };
  }

  // ---------- best days: tap any weekdays ----------
  function daysPicker(initial) {
    let days = (initial || []).slice();
    const box = h('div', { class: 'daypick', role: 'group', 'aria-label': 'Best days' });
    const render = () => box.replaceChildren(...U.DAYS3.map((d, i) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(days.includes(i)), 'aria-label': U.DAYS[i],
      onclick: () => { days = days.includes(i) ? days.filter((x) => x !== i) : days.concat(i); render(); },
    }, d)));
    render();
    return { el: box, get: () => days.slice().sort((a, b) => a - b) };
  }

  // ---------- note cleanup with Claude (only when a key is set in Settings > Note cleanup) ----------
  // Tidies a dictated note; things to bring up next time move into Discuss next time (when that field is given).
  function cleanupButton(text, next) {
    if (!RV.ai || !RV.ai.hasKey()) return null;
    const label = h('span', null, 'Clean up');
    const btn = h('button', { class: 'btn sm cleanup', type: 'button' }, icon('sparkle', 16), label);
    btn.addEventListener('click', async () => {
      const note = text.value.trim();
      if (!note) { toast('Nothing to clean up yet'); text.focus(); return; }
      const before = { note: text.value, next: next ? next.value : '' };
      btn.disabled = true; btn.classList.add('busy'); label.textContent = 'Cleaning up…';
      try {
        const r = await RV.ai.cleanUp({ note, discussNext: next ? next.value : '' });
        if (!text.isConnected) return;
        if (text.value !== before.note) { toast('The note changed while Claude worked, so it was left as is.'); return; }
        text.value = r.note;
        const moved = !!next && r.discussNext !== before.next.trim();
        if (next) next.value = r.discussNext;
        text.dispatchEvent(new CustomEvent('cleaned'));
        toast(moved ? 'Cleaned up. Added to Discuss next time.' : 'Cleaned up', {
          seconds: 6, actions: [{ label: 'Undo', fn: () => { text.value = before.note; if (next) next.value = before.next; text.dispatchEvent(new CustomEvent('cleaned')); } }],
        });
      } catch (e) {
        toast(RV.ai.AiError && e instanceof RV.ai.AiError ? e.message : 'Could not clean up the note.', { seconds: 5 });
      } finally {
        btn.disabled = false; btn.classList.remove('busy'); label.textContent = 'Clean up';
      }
    });
    return btn;
  }

  // ---------- add / edit RV ----------
  // One form. New: Name, Address, Area and "What did you discuss?", with More details expanding the rest in place.
  // Filled in for a new contact: Initial Call, House to house, today as a best day, the running campaign.
  // Edit: everything shown.
  const HOUSE = 'House to house';
  function rvForm(existing, opts) {
    opts = opts || {};
    const rv = existing || {};
    const isNew = !existing;
    const isClosed = !isNew && L.isClosed(S.settings, rv);
    const howMetDefault = isNew ? (S.settings.lists.howMet.includes(HOUSE) ? HOUSE : '') : (rv.howMet || '');
    const f = {
      name: h('input', { type: 'text', value: rv.name || opts.name || '', autocomplete: 'off', 'data-autofocus': true, required: true, placeholder: isNew ? 'Name or household' : '' }),
      address: h('input', { type: 'text', value: rv.address || '', autocomplete: 'off' }),
      neighborhood: areaPicker(rv.neighborhood),
      visit: h('textarea', { placeholder: 'Optional', 'aria-label': 'What did you discuss?', style: { minHeight: '96px' } }),
      phone: h('input', { type: 'tel', value: rv.phone || '', autocomplete: 'off' }),
      howMet: select([{ value: '', label: '(not set)' }].concat(
        S.settings.lists.howMet.concat(rv.howMet && !S.settings.lists.howMet.includes(rv.howMet) ? [rv.howMet] : []).map((x) => ({ value: x, label: x }))), howMetDefault),
      stage: select(stageOptions(), rv.stage || (S.settings.stages.find((s) => s.id === 'initial') || activeStages()[0]).id),
      publication: h('input', { type: 'text', value: rv.publication || '', list: 'pub-list', autocomplete: 'off', placeholder: 'Publication' }),
      progress: h('input', { type: 'text', value: rv.progress || '', autocomplete: 'off', placeholder: 'e.g. Lesson 3' }),
      nextStart: h('input', { type: 'text', value: rv.nextStart || '', autocomplete: 'off', placeholder: 'e.g. Lesson 4' }),
      notes: h('textarea', { value: rv.notes || '', placeholder: 'Family, work, pets' }),
      whatsNext: h('textarea', { value: rv.whatsNext || '', placeholder: 'Bring next time', style: { minHeight: '64px' } }),
      tags: h('input', { type: 'text', value: (rv.tags || []).join(', '), list: 'tag-list', placeholder: 'Separate with commas' }),
      nhOff: h('input', { type: 'checkbox', checked: !!rv.nhBannerOff }),
    };
    // Geotag: coordinates live only here, in the form. The popup suggests a street address to edit first.
    let geo = rv.geo || null;
    const geoRow = h('div', { class: 'georow' });
    function paintGeo() {
      geoRow.replaceChildren(...[
        h('button', { class: 'btn sm', type: 'button', onclick: geotag }, icon('navigation', 16), 'Geotag'),
        geo ? h('span', { class: 'geoval' }, RV.geo.label(geo)) : null,
        geo ? h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Delete coordinates', onclick: () => { geo = null; paintGeo(); } }, icon('x', 16)) : null,
      ].filter(Boolean));
    }
    async function geotag() {
      const btn = geoRow.querySelector('button');
      btn.disabled = true; btn.lastChild.textContent = 'Locating…';
      let pt;
      try { pt = await RV.geo.here(); } catch (e) { toast(e.message); paintGeo(); return; }
      btn.lastChild.textContent = 'Finding address…';
      const sug = await RV.geo.suggest(pt);
      paintGeo();
      const addr = h('input', { type: 'text', value: sug || f.address.value, autocomplete: 'off', 'data-autofocus': true, placeholder: 'Street address' });
      sheet('Geotag', (closeG) => h('form', { onsubmit: (e) => { e.preventDefault(); geo = pt; f.address.value = addr.value.trim(); paintGeo(); closeG(); } },
        h('div', { class: 'muted small', style: { marginBottom: '10px' } }, RV.geo.label(pt)),
        field(sug ? 'Suggested address' : 'Address', addr),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => closeG() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
    }
    paintGeo();
    const camp = isNew ? ST.activeCampaign() : null;
    const campOn = h('input', { type: 'checkbox', checked: true });
    const tagList = h('datalist', { id: 'tag-list' }, ST.allTags().map((t) => h('option', { value: t })));
    const pubList = h('datalist', { id: 'pub-list' }, ST.publications().map((n) => h('option', { value: n })));
    const studyBox = h('div', null, field('Publication', f.publication), h('div', { class: 'two' }, field('Last covered', f.progress), field('Start next time', f.nextStart)));
    const nextField = field('Discuss next time', f.whatsNext);
    const syncStudy = () => {
      const study = L.isStudyStage(S.settings, isClosed ? rv.stage : f.stage.value);
      studyBox.hidden = !study;
      nextField.hidden = study && !f.whatsNext.value.trim(); // studies use Start next time instead
    };
    f.stage.addEventListener('change', syncStudy);
    syncStudy();
    const bestDays = daysPicker(isNew ? [new Date().getDay()] : L.bestDaysOf(rv));
    const customInputs = (S.settings.customFields || []).map((c) => ({ c, input: h('input', { type: 'text', value: (rv.custom || {})[c.id] || '' }) }));

    return sheet(isNew ? 'New ' + lbl('rv') : 'Edit ' + lbl('rv'), (close) => {
      const more = h('div', { class: 'more-fields' },
        field('Phone', f.phone),
        h('div', { class: isClosed ? '' : 'two' }, isClosed ? null : field('Stage', f.stage), field('How we met', f.howMet)),
        studyBox,
        field('Household notes', f.notes),
        h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Best days to find them home'), bestDays.el),
        nextField,
        field('Tags', f.tags),
        customInputs.map((ci) => field(ci.c.name, ci.input)),
        camp ? h('label', { class: 'check' }, campOn, 'Part of the ' + camp.title + ' campaign') : null,
        h('label', { class: 'check' }, f.nhOff, 'Never show the not-home banner for this ' + lbl('rv')),
        isNew ? null : h('button', {
          class: 'btn danger', type: 'button', style: { width: '100%', marginTop: '8px' },
          onclick: async () => {
            const ok = await UI.confirmDialog({ title: 'Delete ' + rv.name + '?', message: 'This removes the record and its timeline. To keep a record of someone who should not be contacted, archive them instead.', confirmText: 'Delete', danger: true });
            if (!ok) return;
            close();
            ST.deleteRv(rv.id);
            location.hash = '#/rvs';
            toast('Deleted ' + rv.name);
          },
        }, icon('trash', 18), 'Delete this ' + lbl('rv')));
      more.hidden = isNew;
      const moreBtn = isNew ? h('button', { class: 'btn ghost more-btn', type: 'button', onclick: () => { more.hidden = false; moreBtn.hidden = true; } }, icon('down', 18), 'More details') : null;

      const form = h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          const name = f.name.value.trim();
          if (!name) { f.name.focus(); return; }
          const data = {
            name, address: f.address.value.trim(), neighborhood: f.neighborhood.get(), phone: f.phone.value.trim(),
            howMet: f.howMet.value, bestDays: bestDays.get(), dayPrimary: null, daySecondary: null, whatsNext: f.whatsNext.value.trim(),
            publication: f.publication.value.trim(), progress: f.progress.value.trim(), nextStart: f.nextStart.value.trim(),
            notes: f.notes.value.trim(), tags: U.splitList(f.tags.value),
            nhBannerOff: f.nhOff.checked,
            geo,
            custom: Object.assign({}, rv.custom || {}),
          };
          customInputs.forEach((ci) => { data.custom[ci.c.id] = ci.input.value.trim(); });
          const changedKey = isNew || data.address !== (rv.address || '') || data.phone !== (rv.phone || '');
          if (changedKey && (data.address || data.phone)) {
            const dups = L.duplicateMatches(data, S.rvs, rv.id);
            if (dups.length) {
              const dnc = dups.find((d) => L.isDNC(S.settings, d));
              const ok = await confirmDialog({
                title: dnc ? 'Do not call on file' : 'Possible duplicate',
                message: dups.slice(0, 3).map((d) => d.name + (d.address ? ' (' + d.address + ')' : '') + (L.isDNC(S.settings, d) ? ': Do not call' : '')).join('\n') +
                  (dnc ? '\n\nA record with the same address or phone is marked Do not call.' : '\n\nThe same address or phone is already saved.'),
                confirmText: 'Save anyway', danger: !!dnc,
              });
              if (!ok) return;
            }
          }
          let saved;
          if (isNew) {
            const tagged = camp && campOn.checked ? camp : null;
            let text = f.visit.value.trim();
            if (!text) text = L.quickAddFallback(tagged, ST.featuredTopics());
            const isFirstStage = S.settings.stages[0].id === f.stage.value;
            data.stage = f.stage.value;
            data.campaignId = tagged ? tagged.id : null;
            // the note from meeting them is the first visit; for someone not yet contacted it goes to household notes
            if (text && isFirstStage) data.notes = [data.notes, text].filter(Boolean).join('\n');
            // garden: created as Initial Call, this first conversation is link 1 of the chain; created at a
            // later stage, that stage's chain starts empty (no credit for the stage it was created in)
            const plantedAt = new Date(Date.now() - 1).toISOString();
            if (!isFirstStage && RV.garden && RV.garden.kindFor(S.settings, data.stage) !== 'first') data.garden = { since: plantedAt };
            saved = ST.addRv(data);
            if (!isFirstStage) {
              const first = ST.addEntry(saved.id, 'visit', { text, campaignId: tagged ? tagged.id : null, plan: !!data.whatsNext });
              const initialId = (S.settings.stages.filter((x) => !x.closed)[1] || {}).id;
              if (data.stage !== initialId) ST.updateRv(saved.id, { garden: { since: first.at } });
            }
            toast('Added ' + saved.name, { actions: [{ label: 'Open', fn: () => { location.hash = '#/rv/' + saved.id; } }] });
          } else {
            saved = ST.updateRv(rv.id, data);
            if (!isClosed && f.stage.value !== rv.stage) ST.setStage(rv.id, f.stage.value);
          }
          close();
          if (opts.onSaved) opts.onSaved(saved);
        },
      },
        tagList, pubList,
        field('Name', f.name),
        field('Address', f.address),
        geoRow,
        field(lbl('neighborhood'), f.neighborhood.el),
        isNew ? field('What did you discuss?', f.visit) : null,
        isNew ? (() => { const b = cleanupButton(f.visit, f.whatsNext); return b ? h('div', { class: 'note-tools' }, b) : null; })() : null,
        moreBtn,
        more,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, isNew ? 'Add' : 'Save')));
      return form;
    });
  }

  // Older name for the same form.
  const quickAdd = (opts) => rvForm(null, opts);

  // ---------- record visit ----------
  function presetDates(input) {
    const mk = (label, days) =>
      h('button', { type: 'button', class: 'chip', onclick: () => { input.value = U.toDateStr(U.addDays(new Date(), days)); } }, label);
    return h('div', { class: 'chips', style: { marginTop: '6px' } }, mk('+1 week', 7), mk('+2 weeks', 14), mk('+1 month', 30), mk('+3 months', 90),
      h('button', { type: 'button', class: 'chip', onclick: () => { input.value = ''; } }, 'Clear'));
  }

  // After a save: the growth moment when the plant grew, else a little water bounce on the record screen.
  async function afterVisit(rvId, res, msg) {
    const G = RV.garden, P = RV.plant;
    const on = S.settings.garden !== false && G && P;
    if (on && res.grew) {
      const to = L.stageOf(S.settings, res.grew.to);
      const it = ST.itemFor(rvId);
      const care = it ? G.forItem(it, S.settings, new Date()).care : 4;
      await P.grow(G.formOf(S.settings, res.grew.from), G.formOf(S.settings, res.grew.to), care || 4, to.name);
    } else if (on) P.pendingWater = rvId;
    toast(msg, { seconds: 4, actions: [{ label: 'Undo', fn: res.undo }] });
  }

  function visitDialog(rvId, opts) {
    const rv = ST.rvById(rvId);
    if (!rv) return;
    if (L.isDNC(S.settings, rv)) { toast('This record is marked Do not call.'); return; }
    const studyStage = L.isStudyStage(S.settings, rv.stage);
    // "Study session" swaps in Publication, Covered today and Start next time; on by default in the study stage
    let study = opts && typeof opts.study === 'boolean' ? opts.study : studyStage;
    const text = h('textarea', { placeholder: 'What did you discuss?', style: { minHeight: '120px' } });
    // Tapping or typing in the note opens a full-screen writing view; "Show other fields" returns.
    const grow = () => { if (text.closest('.writing')) { text.style.height = ''; return; } text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight + 4, Math.round(window.innerHeight * 0.5)) + 'px'; };
    const writing = () => { const sh = text.closest('.sheet'); if (sh && !study) { sh.classList.add('writing'); text.style.height = ''; } };
    text.addEventListener('pointerdown', writing);
    text.addEventListener('input', () => { writing(); grow(); });
    text.addEventListener('cleaned', grow);
    const pub = h('input', { type: 'text', value: rv.publication || '', list: 'pub-list-v', autocomplete: 'off', placeholder: 'Publication' });
    // study: what was covered today (starts as what was planned) and where to start next time (suggested, editable)
    const prog = h('input', { type: 'text', autocomplete: 'off', value: rv.nextStart || '', placeholder: rv.progress ? 'Last time: ' + rv.progress : 'e.g. Lesson 3' });
    const nextStart = h('input', { type: 'text', autocomplete: 'off', value: L.suggestNext(rv.nextStart || ''), placeholder: 'e.g. Lesson 4' });
    let nextTouched = false;
    nextStart.addEventListener('input', () => { nextTouched = true; });
    prog.addEventListener('input', () => { if (!nextTouched) nextStart.value = L.suggestNext(prog.value); });
    const pubList = h('datalist', { id: 'pub-list-v' }, ST.publications().map((n) => h('option', { value: n })));
    const when = h('input', { type: 'datetime-local', value: UI.dateTimeLocal(new Date().toISOString()) });
    // the stage is left alone unless changed here; the garden grows it on its own
    const stage = select(stageOptions(), rv.stage);
    const tags = h('input', { type: 'text', placeholder: 'Tags', list: 'tag-list-v' });
    const tagList = h('datalist', { id: 'tag-list-v' }, ST.allTags().map((t) => h('option', { value: t })));
    const whatsNext = h('textarea', { value: rv.whatsNext || '', placeholder: 'Discuss next time', style: { minHeight: '60px' } });
    // Follow up on <date>: optional; quiets the record until then and holds the chain
    const follow = h('input', { type: 'date', 'aria-label': 'Follow up on', min: U.toDateStr(U.addDays(new Date(), 1)) });
    const camp = ST.activeCampaign();
    const campOn = h('input', { type: 'checkbox', checked: true });
    const topics = ST.featuredTopics();
    const addTopic = (t) => {
      const tag = 'Topic: ' + t.title;
      if (text.value.includes(tag)) { text.focus(); return; }
      const cur = text.value.replace(/\s+$/, '');
      text.value = (cur ? cur + '\n' : '') + tag + '\n';
      text.focus();
      try { text.setSelectionRange(text.value.length, text.value.length); } catch (e) { /* ignore */ }
    };
    const stageNote = h('div', { class: 'progress-note' });
    const updateNote = () => {
      const cur = L.stageOf(S.settings, rv.stage).name, to = L.stageOf(S.settings, stage.value).name;
      stageNote.textContent = stage.value === rv.stage ? 'Stays in ' + cur : 'Will move from ' + cur + ' to ' + to;
    };
    stage.addEventListener('change', updateNote);
    updateNote();

    const studyBox = h('div', null,
      field('Publication', pub),
      h('div', { class: 'two' }, field('Covered today', prog), field('Start next time', nextStart)));
    const noteBox = h('div', { class: 'field note-field' }, text,
      h('div', { class: 'note-tools' },
        cleanupButton(text, whatsNext),
        h('button', { class: 'link show-fields', type: 'button', onclick: (e) => { const sh = e.target.closest('.sheet'); if (sh) sh.classList.remove('writing'); } }, 'Show other fields')));
    const noteTools = noteBox.lastChild;
    const topicBox = topics.length ? h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Tap to add a topic to the note'),
      h('div', { class: 'chips' }, topics.map((t) => h('button', { type: 'button', class: 'chip', onclick: () => addTopic(t) }, '+ ' + t.title)))) : null;
    const nextBox = field('Discuss next time', whatsNext);
    const campBox = camp ? h('label', { class: 'check', style: { marginBottom: '8px' } }, campOn, 'Part of the ' + camp.title + ' campaign') : null;
    const studySw = h('div', { class: 'switchrow', style: { marginBottom: '8px' } }, h('div', { class: 'grow' }, 'Study session'),
      UI.toggle(study, (v) => { study = v; paint(); }, 'Study session'));
    const title = h('span');
    const saveBtn = h('button', { class: 'btn primary', type: 'submit' });
    function paint() {
      const show = (el, on) => { if (el) el.hidden = !on; };
      // the publication is asked for only when none is set yet
      show(studyBox, study);
      show(studyBox.firstChild, study && !rv.publication);
      show(topicBox, !study); show(nextBox, !study); show(campBox, !study);
      // the AI clean-up and full-screen writing belong to a conversation note, not a study note
      if (study) noteTools.remove(); else if (!noteTools.isConnected) noteBox.appendChild(noteTools);
      text.placeholder = study ? 'Note (optional)' : 'What did you discuss?';
      text.style.minHeight = study ? '64px' : '120px';
      title.textContent = (study ? lbl('logStudy') : lbl('recordVisit')) + ': ' + rv.name;
      saveBtn.textContent = study ? 'Save study' : 'Save visit';
      (study ? prog : text).setAttribute('data-autofocus', '');
      (study ? text : prog).removeAttribute('data-autofocus');
    }
    paint();

    sheet(title.textContent, (close) => {
      const form = h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          const d = UI.parseLocalDT(when.value);
          const res = ST.logVisit(rvId, {
            text: text.value,
            whatsNext: study ? undefined : whatsNext.value,
            campaignId: !study && camp && campOn.checked ? camp.id : null,
            study: study || undefined,
            publication: study ? pub.value : undefined,
            progress: study ? prog.value : undefined,
            nextStart: study ? nextStart.value : undefined,
            snoozedUntil: follow.value || null,
            stage: stage.value !== rv.stage ? stage.value : undefined,
            tags: U.splitList(tags.value),
            at: d ? d.toISOString() : undefined,
          });
          close();
          afterVisit(rvId, res, study ? 'Study saved' : 'Visit saved');
        },
      },
        tagList, pubList,
        studySw,
        studyBox,
        noteBox,
        topicBox,
        nextBox,
        field('Follow up on', follow),
        campBox,
        stageNote,
        h('details', { class: 'more', style: { marginTop: '12px' } },
          h('summary', null, icon('down', 18), 'More details'),
          field('When', when),
          field('Stage', stage),
          field('Tags', tags)),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          saveBtn));
      // keep the sheet title in step with the switch
      setTimeout(() => { const t = form.closest('.sheet') && form.closest('.sheet').querySelector('h2, .sheet-title'); if (t) { t.textContent = ''; t.appendChild(title); } }, 0);
      return form;
    });
  }

  // ---------- stage, archive, restore, snooze, schedule ----------
  async function stageFlow(rvId) {
    const rv = ST.rvById(rvId);
    if (!rv) return;
    const closedStage = S.settings.stages.find((s) => s.closed);
    const opts = activeStages().map((s) => ({ value: s.id, label: s.name }));
    if (closedStage && !L.isClosed(S.settings, rv)) opts.push({ value: closedStage.id, label: lbl('archive') + '…', sub: 'Choose a reason' });
    const choice = await pick('Move to stage', opts, rv.stage);
    if (choice === undefined || choice === rv.stage) return;
    if (closedStage && choice === closedStage.id) return archiveFlow(rvId);
    const res = ST.setStage(rvId, choice);
    if (res) toast('Moved to ' + L.stageOf(S.settings, choice).name, { seconds: 4, actions: [{ label: 'Undo', fn: res.undo }] });
  }

  async function archiveFlow(rvId) {
    const rv = ST.rvById(rvId);
    if (!rv) return;
    const closedStage = S.settings.stages.find((s) => s.closed);
    if (!closedStage) return;
    const reason = await pick('Archive ' + rv.name + ': why?',
      S.settings.archiveReasons.map((r) => ({
        value: r.id, label: r.name,
        sub: r.dnc ? 'Blocks visits and warns about duplicates' : r.restorable ? 'Can be restored later' : 'Cannot be restored',
      })));
    if (!reason) return;
    const r = L.reasonOf(S.settings, reason);
    if (r && !r.restorable) {
      const ok = await confirmDialog({ title: 'Archive as "' + r.name + '"?', message: 'This record cannot be restored afterwards.', confirmText: 'Archive', danger: true });
      if (!ok) return;
    }
    const res = ST.setStage(rvId, closedStage.id, { reason });
    if (res) toast('Archived: ' + (r ? r.name : ''), { seconds: 4, actions: [{ label: 'Undo', fn: res.undo }] });
  }

  async function restoreFlow(rvId) {
    const rv = ST.rvById(rvId);
    if (!rv) return;
    const reason = L.reasonOf(S.settings, rv.archiveReason);
    if (reason && !reason.restorable) { toast('Records archived as "' + reason.name + '" cannot be restored.'); return; }
    const def = rv.prevStage && activeStages().some((s) => s.id === rv.prevStage) ? rv.prevStage : (S.settings.stages.find((s) => s.id === 'return') || activeStages()[0]).id;
    const choice = await pick('Restore to which stage?', stageOptions(), def);
    if (!choice) return;
    const res = ST.setStage(rvId, choice, { text: 'Restored' });
    if (res) toast('Restored to ' + L.stageOf(S.settings, choice).name, { seconds: 4, actions: [{ label: 'Undo', fn: res.undo }] });
  }

  // Follow up on <date>: one action for the old Snooze and next-visit date. Quiet until then; holds the chain.
  function snoozeSheet(rvId) {
    const rv = ST.rvById(rvId);
    if (!rv) return;
    const date = h('input', { type: 'date', value: rv.snoozedUntil || '', min: U.toDateStr(U.addDays(new Date(), 1)) });
    const apply = (val) => {
      const res = ST.snooze(rvId, val);
      toast(val ? 'Follow up on ' + U.fmtDate(val) : 'Follow-up date cleared', { actions: [{ label: 'Undo', fn: res.undo }], seconds: 4 });
    };
    sheet('Follow up on', (close) =>
      h('div', null,
        [['In 3 days', 3], ['In 1 week', 7], ['In 2 weeks', 14], ['In 1 month', 30]].map(([t, n]) =>
          h('button', { class: 'opt', type: 'button', onclick: () => { apply(U.toDateStr(U.addDays(new Date(), n))); close(); } }, t)),
        field('Or pick a date', date),
        h('div', { class: 'actions' },
          rv.snoozedUntil ? h('button', { class: 'btn', type: 'button', onclick: () => { apply(null); close(); } }, 'Clear') : null,
          h('button', { class: 'btn primary', type: 'button', onclick: () => { if (date.value) { apply(date.value); close(); } } }, 'Set date'))));
  }

  // quick edit of what they are studying and where they are
  // Tapping the Studying block only sets where to start next time; the publication is changed in Edit.
  function studyEdit(rvId) {
    const rv = ST.rvById(rvId);
    if (!rv) return;
    const nxt = h('input', { type: 'text', value: rv.nextStart || '', autocomplete: 'off', placeholder: 'e.g. Lesson 4', 'data-autofocus': true });
    sheet('Start next time', (close) =>
      h('form', { onsubmit: (e) => { e.preventDefault(); ST.updateRv(rvId, { nextStart: nxt.value.trim() }); close(); } },
        field(rv.publication || 'Next time', nxt),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
  }

  RV.forms = { cleanupButton, areaPicker, studyEdit, rvForm, quickAdd, visitDialog, stageFlow, archiveFlow, restoreFlow, snoozeSheet, select, stageOptions };
})(window);
