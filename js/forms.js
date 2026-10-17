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

  // ---------- add / edit RV ----------
  function rvForm(existing, opts) {
    opts = opts || {};
    const rv = existing || {};
    const isNew = !existing;
    const isClosed = !isNew && L.isClosed(S.settings, rv);
    const nbList = h('datalist', { id: 'nb-list' }, ST.neighborhoods().map((n) => h('option', { value: n })));
    const f = {
      name: h('input', { type: 'text', value: rv.name || opts.name || '', autocomplete: 'off', 'data-autofocus': true, required: true }),
      address: h('input', { type: 'text', value: rv.address || '', autocomplete: 'off' }),
      neighborhood: h('input', { type: 'text', value: rv.neighborhood || '', list: 'nb-list', autocomplete: 'off' }),
      phone: h('input', { type: 'tel', value: rv.phone || '', autocomplete: 'off' }),
      howMet: select([{ value: '', label: '(not set)' }].concat(
        S.settings.lists.howMet.concat(rv.howMet && !S.settings.lists.howMet.includes(rv.howMet) ? [rv.howMet] : []).map((x) => ({ value: x, label: x }))), rv.howMet || ''),
      stage: select(stageOptions(), rv.stage || (S.settings.stages.find((s) => s.id === 'initial') || activeStages()[0]).id),
      publication: h('input', { type: 'text', value: rv.publication || '', list: 'pub-list', autocomplete: 'off', placeholder: 'Publication' }),
      progress: h('input', { type: 'text', value: rv.progress || '', autocomplete: 'off', placeholder: 'e.g. Lesson 3' }),
      nextStart: h('input', { type: 'text', value: rv.nextStart || '', autocomplete: 'off', placeholder: 'e.g. Lesson 4' }),
      bestNote: h('input', { type: 'text', value: rv.bestNote || '', placeholder: 'e.g. works nights, text first' }),
      notes: h('textarea', { value: rv.notes || '', placeholder: 'Family, work, pets' }),
      whatsNext: h('textarea', { value: rv.whatsNext || '', placeholder: 'Bring next time', style: { minHeight: '64px' } }),
      interests: h('textarea', { value: rv.interests || '', placeholder: 'Interests, questions' }),
      scriptures: h('input', { type: 'text', value: (rv.scriptures || []).join(', '), placeholder: 'Separate with commas' }),
      tags: h('input', { type: 'text', value: (rv.tags || []).join(', '), list: 'tag-list', placeholder: 'Separate with commas' }),
      nhOff: h('input', { type: 'checkbox', checked: !!rv.nhBannerOff }),
    };
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
    const bestDays = daysPicker(L.bestDaysOf(rv));
    const customInputs = (S.settings.customFields || []).map((c) => ({ c, input: h('input', { type: 'text', value: (rv.custom || {})[c.id] || '' }) }));

    return sheet(isNew ? 'New ' + lbl('rv') : 'Edit ' + lbl('rv'), (close) => {
      const form = h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          const name = f.name.value.trim();
          if (!name) { f.name.focus(); return; }
          const data = {
            name, address: f.address.value.trim(), neighborhood: f.neighborhood.value.trim(), phone: f.phone.value.trim(),
            howMet: f.howMet.value, bestDays: bestDays.get(), dayPrimary: null, daySecondary: null, whatsNext: f.whatsNext.value.trim(),
            publication: f.publication.value.trim(), progress: f.progress.value.trim(), nextStart: f.nextStart.value.trim(),
            notes: f.notes.value.trim(), interests: f.interests.value.trim(), scriptures: U.splitList(f.scriptures.value), tags: U.splitList(f.tags.value),
            nhBannerOff: f.nhOff.checked,
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
            saved = ST.addRv(Object.assign(data, { stage: f.stage.value }));
          } else {
            saved = ST.updateRv(rv.id, data);
            if (!isClosed && f.stage.value !== rv.stage) ST.setStage(rv.id, f.stage.value);
          }
          close();
          if (opts.onSaved) opts.onSaved(saved);
        },
      },
        nbList, tagList, pubList,
        field('Name', f.name),
        field('Address', f.address),
        field(lbl('neighborhood'), f.neighborhood),
        field('Phone', f.phone),
        h('div', { class: isClosed ? '' : 'two' }, isClosed ? null : field('Stage', f.stage), field('How we met', f.howMet)),
        studyBox,
        nextField,
        field('Household notes', f.notes),
        h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Best days to find them home'), bestDays.el),
        field('Interests and questions', f.interests),
        field(lbl('scriptures') + ' discussed', f.scriptures),
        field('Tags', f.tags),
        customInputs.map((ci) => field(ci.c.name, ci.input)),
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
        }, icon('trash', 18), 'Delete this ' + lbl('rv')),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save')));
      return form;
    });
  }

  // ---------- quick add ----------
  // The field tool: stamps today's day and part of day as the primary best-day tag, tags the active
  // campaign (switch it off to skip), and if the note is blank records the live campaign and topics.
  function quickAdd(opts) {
    opts = opts || {};
    const name = h('input', { type: 'text', autocomplete: 'off', 'data-autofocus': true, placeholder: 'Name or household' });
    const address = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Optional' });
    const nbList = h('datalist', { id: 'nb-list-q' }, ST.neighborhoods().map((n) => h('option', { value: n })));
    const nb = h('input', { type: 'text', list: 'nb-list-q', autocomplete: 'off', placeholder: 'Optional' });
    const note = h('textarea', { placeholder: 'Note (optional)', style: { minHeight: '80px' } });
    const stage = select(stageOptions(), (S.settings.stages.find((s) => s.id === 'initial') || activeStages()[0]).id);
    const camp = ST.activeCampaign();
    const campOn = h('input', { type: 'checkbox', checked: true });
    sheet('Quick add ' + lbl('rv'), (close) =>
      h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          const nm = name.value.trim();
          if (!nm) { name.focus(); return; }
          const data = { name: nm, address: address.value.trim(), neighborhood: nb.value.trim(), stage: stage.value };
          if (data.address) {
            const dups = L.duplicateMatches(data, S.rvs);
            if (dups.length) {
              const dnc = dups.find((d) => L.isDNC(S.settings, d));
              const ok = await confirmDialog({
                title: dnc ? 'Do not call on file' : 'Possible duplicate',
                message: dups.slice(0, 3).map((d) => d.name + (d.address ? ' (' + d.address + ')' : '')).join('\n') + (dnc ? '\n\nThis address matches a Do not call record.' : '\n\nThis address is already saved.'),
                confirmText: 'Add anyway', danger: !!dnc,
              });
              if (!ok) return;
            }
          }
          const now = new Date();
          const tagged = camp && campOn.checked ? camp : null;
          let text = note.value.trim();
          if (!text) text = L.quickAddFallback(camp, ST.featuredTopics());
          const isFirstStage = S.settings.stages[0].id === stage.value;
          data.bestDays = [now.getDay()];
          data.campaignId = tagged ? tagged.id : null;
          if (text && isFirstStage) data.notes = text;
          const rv = ST.addRv(data);
          // meeting someone counts as a contact, so past the first stage it is recorded as the first visit
          if (!isFirstStage) ST.addEntry(rv.id, 'visit', { text, campaignId: tagged ? tagged.id : null });
          close();
          toast('Added ' + rv.name, { actions: [{ label: 'Open', fn: () => { location.hash = '#/rv/' + rv.id; } }] });
          if (opts.onSaved) opts.onSaved(rv);
        },
      },
        nbList,
        field('Name', name),
        field('Address', address),
        field(lbl('neighborhood'), nb),
        field('Note', note),
        field('Stage', stage),
        camp ? h('label', { class: 'check' }, campOn, 'Part of the ' + camp.title + ' campaign') : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Add'))));
  }

  // ---------- record visit ----------
  function presetDates(input) {
    const mk = (label, days) =>
      h('button', { type: 'button', class: 'chip', onclick: () => { input.value = U.toDateStr(U.addDays(new Date(), days)); } }, label);
    return h('div', { class: 'chips', style: { marginTop: '6px' } }, mk('+1 week', 7), mk('+2 weeks', 14), mk('+1 month', 30), mk('+3 months', 90),
      h('button', { type: 'button', class: 'chip', onclick: () => { input.value = ''; } }, 'Clear'));
  }

  function visitDialog(rvId) {
    const rv = ST.rvById(rvId);
    if (!rv) return;
    if (L.isDNC(S.settings, rv)) { toast('This record is marked Do not call.'); return; }
    const study = L.isStudyStage(S.settings, rv.stage);
    const text = h('textarea', study ? { placeholder: 'Note (optional)', style: { minHeight: '64px' } } : { placeholder: 'What did you discuss?', 'data-autofocus': true, style: { minHeight: '120px' } });
    // Tapping or typing in the note opens a full-screen writing view; "Show other fields" returns.
    const grow = () => { if (text.closest('.writing')) { text.style.height = ''; return; } text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight + 4, Math.round(window.innerHeight * 0.5)) + 'px'; };
    const writing = () => { const sh = text.closest('.sheet'); if (sh && !study) { sh.classList.add('writing'); text.style.height = ''; } };
    text.addEventListener('pointerdown', writing);
    text.addEventListener('input', () => { writing(); grow(); });
    const pub = h('input', { type: 'text', value: rv.publication || '', list: 'pub-list-v', autocomplete: 'off', placeholder: 'Publication' });
    // study: what was covered today (starts as what was planned) and where to start next time (suggested, editable)
    const prog = h('input', { type: 'text', autocomplete: 'off', 'data-autofocus': true, value: rv.nextStart || '', placeholder: rv.progress ? 'Last time: ' + rv.progress : 'e.g. Lesson 3' });
    const nextStart = h('input', { type: 'text', autocomplete: 'off', value: L.suggestNext(rv.nextStart || ''), placeholder: 'e.g. Lesson 4' });
    let nextTouched = false;
    nextStart.addEventListener('input', () => { nextTouched = true; });
    prog.addEventListener('input', () => { if (!nextTouched) nextStart.value = L.suggestNext(prog.value); });
    const pubList = h('datalist', { id: 'pub-list-v' }, ST.publications().map((n) => h('option', { value: n })));
    const when = h('input', { type: 'datetime-local', value: UI.dateTimeLocal(new Date().toISOString()) });
    const autoStage = rv.stage === 'yet' && S.settings.stages.some((s) => s.id === 'initial') ? 'initial' : rv.stage;
    const stage = select(stageOptions(), autoStage);
    const tags = h('input', { type: 'text', placeholder: 'Tags', list: 'tag-list-v' });
    const tagList = h('datalist', { id: 'tag-list-v' }, ST.allTags().map((t) => h('option', { value: t })));
    const extra = h('input', { type: 'text', placeholder: 'Scriptures' });
    const whatsNext = h('textarea', { value: rv.whatsNext || '', placeholder: 'Discuss next time', style: { minHeight: '60px' } });
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

    sheet((study ? lbl('logStudy') : lbl('recordVisit')) + ': ' + rv.name, (close) =>
      h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          const d = UI.parseLocalDT(when.value);
          const res = ST.logVisit(rvId, {
            text: text.value,
            scriptures: U.splitList(extra.value),
            whatsNext: study ? undefined : whatsNext.value,
            campaignId: !study && camp && campOn.checked ? camp.id : null,
            publication: study ? pub.value : undefined,
            progress: study ? prog.value : undefined,
            nextStart: study ? nextStart.value : undefined,
            stage: stage.value,
            tags: U.splitList(tags.value),
            at: d ? d.toISOString() : undefined,
          });
          close();
          toast(study ? 'Study saved' : 'Visit saved', { seconds: 4, actions: [{ label: 'Undo', fn: res.undo }] });
        },
      },
        tagList, pubList,
        study ? field('Publication', pub) : null,
        study ? h('div', { class: 'two' }, field('Covered today', prog), field('Start next time', nextStart)) : null,
        study ? null : h('div', { class: 'field note-field' }, text,
          h('button', { class: 'link show-fields', type: 'button', onclick: (e) => { const sh = e.target.closest('.sheet'); if (sh) sh.classList.remove('writing'); } }, 'Show other fields')),
        !study && topics.length ? h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Tap to add a topic to the note'),
          h('div', { class: 'chips' }, topics.map((t) => h('button', { type: 'button', class: 'chip', onclick: () => addTopic(t) }, '+ ' + t.title)))) : null,
        study ? null : field('Discuss next time', whatsNext),
        study ? field('Note', text) : null,
        !study && camp ? h('label', { class: 'check', style: { marginBottom: '8px' } }, campOn, 'Part of the ' + camp.title + ' campaign') : null,
        stageNote,
        h('details', { class: 'more', style: { marginTop: '12px' } },
          h('summary', null, icon('down', 18), 'More details'),
          field('When', when),
          field('Stage', stage),
          field(lbl('scriptures') + ' discussed', extra),
          field('Tags', tags)),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, study ? 'Save study' : 'Save visit'))));
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

  function snoozeSheet(rvId) {
    const rv = ST.rvById(rvId);
    if (!rv) return;
    const date = h('input', { type: 'date', value: rv.snoozedUntil || '' });
    const apply = (val) => {
      const res = ST.snooze(rvId, val);
      toast(val ? 'Snoozed until ' + U.fmtDate(val) : 'Snooze cleared', { actions: [{ label: 'Undo', fn: res.undo }], seconds: 4 });
    };
    sheet('Snooze needs-attention', (close) =>
      h('div', null,
        [['3 days', 3], ['1 week', 7], ['2 weeks', 14], ['1 month', 30]].map(([t, n]) =>
          h('button', { class: 'opt', type: 'button', onclick: () => { apply(U.toDateStr(U.addDays(new Date(), n))); close(); } }, t)),
        field('Or pick a date', date),
        h('div', { class: 'actions' },
          rv.snoozedUntil ? h('button', { class: 'btn', type: 'button', onclick: () => { apply(null); close(); } }, 'Clear snooze') : null,
          h('button', { class: 'btn primary', type: 'button', onclick: () => { if (date.value) { apply(date.value); close(); } } }, 'Set date'))));
  }



  // quick edit of what they are studying and where they are
  function studyEdit(rvId) {
    const rv = ST.rvById(rvId);
    if (!rv) return;
    const pub = h('input', { type: 'text', value: rv.publication || '', list: 'pub-list-e', autocomplete: 'off', placeholder: 'Publication', 'data-autofocus': true });
    const prog = h('input', { type: 'text', value: rv.progress || '', autocomplete: 'off', placeholder: 'e.g. Lesson 3' });
    const nxt = h('input', { type: 'text', value: rv.nextStart || '', autocomplete: 'off', placeholder: 'e.g. Lesson 4' });
    sheet('Studying', (close) =>
      h('form', { onsubmit: (e) => { e.preventDefault(); ST.updateRv(rvId, { publication: pub.value.trim(), progress: prog.value.trim(), nextStart: nxt.value.trim() }); close(); } },
        h('datalist', { id: 'pub-list-e' }, ST.publications().map((n) => h('option', { value: n }))),
        field('Publication', pub), field('Start next time', nxt), field('Last covered', prog),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
  }

  RV.forms = { studyEdit, rvForm, quickAdd, visitDialog, stageFlow, archiveFlow, restoreFlow, snoozeSheet, select, stageOptions };
})(window);
