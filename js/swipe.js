/* Groundwork v2.55: swiping. One file for every gesture in the app:
   - RV.swipe.row(face, {actions, full}): a list row that swipes left to show its actions (Archive, Delete, Take off…);
     a long swipe runs the first action when `full` is set; a swipe right only gives a little and springs back.
   - RV.swipe.dismiss(card, onDismiss): a card that swipes away sideways (same as its × or Not now).
   - RV.swipe.down(box, handle, close): a sheet or overlay that closes when pulled down.
   - RV.swipe.pager(el, {left, right, down}): a quick swipe in a direction (months, the year in review).
   - RV.swipe.away(box, close, {up, scroller}) (v2.56.3): a notice or full-screen moment that swipes away sideways, or
     toward the screen edge it sits nearest: down for anything full-screen, centred or low, up for a notice at the top.
   Every button stays: swiping is a shortcut, never the only way. Swipes starting at the screen's very edge are left
   to the phone (Android's back gesture). */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  const { h, icon } = RV.dom;

  const EDGE = 20, SLOP = 8, ACT_W = 76, OPEN_AT = 48;
  const reduce = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fromEdge = (x) => x < EDGE || x > (root.innerWidth || 1e4) - EDGE;
  const vib = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } };
  // After a drag, the click that follows the pointerup must not open the row.
  function eatClick(el) {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); el.removeEventListener('click', stop, true); };
    el.addEventListener('click', stop, true);
    setTimeout(() => el.removeEventListener('click', stop, true), 400);
  }
  // A horizontal drag tracker: decides direction after a few pixels and hands moves to the caller.
  function track(el, o) {
    let st = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || (o.skip && o.skip(e))) return;
      if (o.axis !== 'y' && fromEdge(e.clientX)) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: null, t: Date.now() };
    });
    el.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.mode) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        const horiz = Math.abs(dx) > Math.abs(dy);
        if ((o.axis === 'y') === horiz || (o.axis === 'y' && dy < 0)) { st = null; return; } // not ours: let it scroll
        st.mode = 'drag';
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (o.start) o.start();
      }
      e.preventDefault();
      o.move(dx, dy);
    });
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const was = st; st = null;
      if (was.mode !== 'drag') return;
      eatClick(el);
      const dt = Math.max(1, Date.now() - was.t);
      o.end(e.clientX - was.x, e.clientY - was.y, (e.clientX - was.x) / dt, (e.clientY - was.y) / dt);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', (e) => { if (st && e.pointerId === st.id) { const was = st; st = null; if (was.mode === 'drag' && o.cancel) o.cancel(); } });
  }

  // ---------- rows ----------
  let openRow = null;
  document.addEventListener('pointerdown', (e) => { if (openRow && !openRow.wrap.contains(e.target)) openRow.close(); }, true);

  // actions: [{ label, icon, kind: 'quiet'|'danger', fn }]; full: true = a long swipe runs actions[0]
  function row(face, o) {
    const acts = o.actions || [];
    face.classList.add('sw-face');
    // links and pictures inside must not start the browser's own drag (it cancels the swipe)
    [face].concat(Array.from(face.querySelectorAll('a, img, svg'))).forEach((n) => { if (n.setAttribute) n.setAttribute('draggable', 'false'); });
    const btns = acts.map((a) => h('button', { class: 'sw-act ' + (a.kind || 'quiet'), type: 'button', tabindex: '-1',
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); closeRow(); a.fn(); } }, icon(a.icon || 'right', 20), h('span', null, a.label)));
    const back = h('div', { class: 'sw-acts', 'aria-hidden': 'true' }, btns);
    const wrap = h('div', { class: 'sw' }, back, face);
    const openW = ACT_W * acts.length;
    let x = 0, armed = false;
    const set = (v, anim) => {
      x = v;
      face.style.transition = anim ? (anim === 'spring' ? 'transform .34s cubic-bezier(.2,.9,.3,1.35)' : 'transform .26s cubic-bezier(.2,.8,.2,1)') : 'none';
      face.style.transform = v ? 'translateX(' + v + 'px)' : '';
      back.style.visibility = v < 0 ? 'visible' : 'hidden';
      const long = o.full && v < -fullAt();
      if (long !== armed) { armed = long; wrap.classList.toggle('sw-long', long); if (long) vib(8); }
      if (btns[0]) btns[0].style.width = v < -openW ? (-v - ACT_W * (acts.length - 1)) + 'px' : '';
    };
    const fullAt = () => Math.max(openW + 70, wrap.offsetWidth * 0.62);
    const me = { wrap, close: () => { set(0, 'ease'); if (openRow === me) openRow = null; } };
    function closeRow() { me.close(); }
    let base = 0, dragAt = 0;
    track(face, {
      skip: (e) => !!e.target.closest('.grip, .tlgrip, input, textarea, select, .noswipe'),
      start: () => { base = x; if (openRow && openRow !== me) openRow.close(); },
      move: (dx) => {
        let v = base + dx;
        if (v > 0) v = 28 * (1 - Math.exp(-v / 60)); // swiping right gives a little, then stops
        if (!o.full) v = Math.max(v, -openW - 24 * (1 - Math.exp((v + openW) / 40)));
        set(Math.max(v, -wrap.offsetWidth), null);
      },
      end: (dx, dy, vx) => {
        dragAt = Date.now();
        if (x > 0) { set(0, 'spring'); return; }
        if (o.full && (x < -fullAt() || (vx < -1.2 && x < -openW))) {
          set(-wrap.offsetWidth, 'ease');
          wrap.style.maxHeight = wrap.offsetHeight + 'px'; void wrap.offsetHeight; wrap.classList.add('sw-gone');
          setTimeout(() => { if (openRow === me) openRow = null; acts[0].fn(); }, 220);
          return;
        }
        if (x < -OPEN_AT || vx < -0.6) { set(-openW, 'ease'); openRow = me; } else me.close();
      },
      cancel: () => me.close(),
    });
    // a tap on an open row closes it (the click right after a drag is the drag's own, and is swallowed)
    face.addEventListener('click', (e) => { if (Date.now() - dragAt < 400) return; if (x < 0) { e.preventDefault(); e.stopPropagation(); me.close(); } }, true);
    return wrap;
  }

  // ---------- cards ----------
  function dismiss(card, onDismiss) {
    card.classList.add('sw-card');
    let x = 0;
    const set = (v, anim) => {
      x = v;
      card.style.transition = anim ? 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s ease' : 'none';
      card.style.transform = v ? 'translateX(' + v + 'px) rotate(' + (v / 40) + 'deg)' : '';
      card.style.opacity = String(Math.max(0.2, 1 - Math.abs(v) / (card.offsetWidth || 300)));
    };
    track(card, {
      skip: (e) => !!e.target.closest('input, textarea, select, .noswipe, .sw-face'),
      move: (dx) => set(dx, null),
      end: (dx, dy, vx) => {
        const w = card.offsetWidth || 300;
        if (Math.abs(dx) > w * 0.35 || Math.abs(vx) > 0.8) {
          set((dx < 0 ? -1 : 1) * (w + 60), true);
          setTimeout(() => onDismiss(), reduce() ? 0 : 240);
        } else set(0, true);
      },
      cancel: () => set(0, true),
    });
    return card;
  }

  // ---------- sheets: pull down to close ----------
  // Starts on the handle (the sheet's head) at any time, or anywhere in the sheet while it's scrolled to the top
  // (not on fields, wheels, rows that swipe, or anything marked .noswipe).
  function down(box, close, handle) {
    let y = 0;
    const set = (v, anim) => {
      y = v;
      box.style.transition = anim ? 'transform .26s cubic-bezier(.2,.8,.2,1)' : 'none';
      box.style.transform = v ? 'translateY(' + v + 'px)' : '';
    };
    track(box, {
      axis: 'y',
      skip: (e) => {
        if (handle && handle.contains(e.target)) return false;
        if (e.target.closest('input, textarea, select, [contenteditable], .vw, .pk, .sw-face, .noswipe, .ybars, canvas')) return true;
        let n = e.target;
        while (n && n !== box) { if (n.scrollTop > 0) return true; n = n.parentElement; }
        return box.scrollTop > 0;
      },
      move: (dx, dy) => set(Math.max(0, dy), null),
      end: (dx, dy, vx, vy) => {
        if (dy > 110 || (vy > 0.7 && dy > 30)) { set(box.offsetHeight || 600, true); setTimeout(close, reduce() ? 0 : 200); }
        else set(0, true);
      },
      cancel: () => set(0, true),
    });
  }

  // ---------- quick swipes ----------
  function pager(el, o) {
    let cur = 0;
    track(el, {
      axis: o.down && !o.left && !o.right ? 'y' : 'x',
      skip: (e) => !!e.target.closest('input, textarea, select, .noswipe, .sw-face, .vw'),
      move: (dx) => { cur = dx; if (o.drag) o.drag(dx); },
      end: (dx, dy, vx) => {
        if (o.drag) o.drag(0, true);
        if (dx < -60 || vx < -0.5) { if (o.left) o.left(); } else if (dx > 60 || vx > 0.5) { if (o.right) o.right(); }
      },
      cancel: () => { if (o.drag) o.drag(0, true); },
    });
    void cur;
  }
  // Year in review: left / right / down on the same surface.
  function story(el, o) {
    let st = null;
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; st = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false }; });
    el.addEventListener('pointermove', (e) => {
      if (!st) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.moved && Math.hypot(dx, dy) > SLOP) st.moved = true;
      if (st.moved && dy > 0 && Math.abs(dy) > Math.abs(dx) && o.drag) o.drag(dy);
    });
    el.addEventListener('pointerup', (e) => {
      if (!st) return;
      const s = st; st = null;
      if (!s.moved) return;
      eatClick(el);
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (o.drag) o.drag(0);
      if (Math.abs(dy) > Math.abs(dx)) { if (dy > 90 && o.down) o.down(); return; }
      if (dx < -50 && o.left) o.left(); else if (dx > 50 && o.right) o.right();
    });
    el.addEventListener('pointercancel', () => { st = null; if (o.drag) o.drag(0); });
  }

  // ---------- notices and moments: swipe away (v2.56.3) ----------
  // Sideways either way, or vertically toward the nearest screen edge: down by default (full-screen moments, anything
  // centred or low), up with {up: true} (a notice pinned to the top). Vertical only once the scroller has reached that
  // end, so long content still scrolls. Touch goes through touch events so the drag can stop the page scrolling.
  function away(box, close, o) {
    o = o || {};
    const up = !!o.up, sc = o.scroller || box, dir = up ? -1 : 1;
    box.classList.add('sw-away');
    let st = null, gone = false;
    const set = (x, y, anim) => {
      box.style.transition = anim ? 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s ease' : 'none';
      box.style.transform = x || y ? 'translate(' + x + 'px, ' + y + 'px)' + (x ? ' rotate(' + (x / 60).toFixed(2) + 'deg)' : '') : '';
      const w = box.offsetWidth || 360, hh = box.offsetHeight || 700;
      box.style.opacity = x || y ? String(Math.max(0.25, 1 - Math.max(Math.abs(x) / w, Math.abs(y) / hh))) : '';
    };
    const atEnd = () => up ? sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2 : sc.scrollTop <= 0;
    const begin = (x, y, target) => {
      if (gone || fromEdge(x) || (target && target.closest && target.closest('input, textarea, select, [contenteditable], .noswipe'))) { st = null; return; }
      st = { x, y, mode: null, t: Date.now() };
    };
    // returns true while the drag is ours (the caller stops the page scrolling)
    const move = (x, y) => {
      if (!st) return false;
      const dx = x - st.x, dy = y - st.y;
      if (!st.mode) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return false;
        if (Math.abs(dx) > Math.abs(dy)) st.mode = 'x';
        else if (Math.sign(dy) === dir && atEnd()) st.mode = 'y';
        else { st = null; return false; } // scrolling, or the wrong way: not ours
      }
      if (st.mode === 'x') set(dx, 0, false);
      else set(0, dir * Math.max(0, dy * dir), false);
      return true;
    };
    const end = (x, y) => {
      if (!st) return;
      const was = st; st = null;
      if (!was.mode) return;
      eatClick(box);
      const dt = Math.max(1, Date.now() - was.t), dx = x - was.x, dy = y - was.y;
      const w = box.offsetWidth || 360, hh = box.offsetHeight || 700;
      let out = null;
      if (was.mode === 'x' && (Math.abs(dx) > w * 0.3 || (Math.abs(dx / dt) > 0.6 && Math.abs(dx) > 30))) out = [(dx < 0 ? -1 : 1) * (w + 80), 0];
      if (was.mode === 'y' && (dy * dir > 110 || (dy * dir / dt > 0.6 && dy * dir > 30))) out = [0, dir * (hh + 40)];
      if (!out) { set(0, 0, true); return; }
      gone = true; set(out[0], out[1], true);
      setTimeout(close, reduce() ? 0 : 220);
    };
    const cancel = () => { if (st && st.mode) set(0, 0, true); st = null; };
    box.addEventListener('touchstart', (e) => { if (e.touches.length !== 1) { cancel(); return; } const t = e.touches[0]; begin(t.clientX, t.clientY, e.target); }, { passive: true });
    box.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t && move(t.clientX, t.clientY) && e.cancelable) e.preventDefault(); }, { passive: false });
    box.addEventListener('touchend', (e) => { const t = e.changedTouches[0]; if (t) end(t.clientX, t.clientY); });
    box.addEventListener('touchcancel', cancel);
    // mouse (and pen) through pointer events
    box.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.button > 0) return; begin(e.clientX, e.clientY, e.target); if (st) st.id = e.pointerId; });
    box.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch' || !st || st.id !== e.pointerId) return; if (move(e.clientX, e.clientY)) { e.preventDefault(); try { box.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } } });
    box.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch' && st && st.id === e.pointerId) end(e.clientX, e.clientY); });
    box.addEventListener('pointercancel', (e) => { if (e.pointerType !== 'touch') cancel(); });
    return box;
  }

  RV.swipe = { row, dismiss, down, pager, story, away, closeOpen: () => { if (openRow) openRow.close(); } };
})(window);
