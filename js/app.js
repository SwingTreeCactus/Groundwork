/* RV app: shell, router, lock screen, display settings, service worker. Loaded last. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});
  RV.VERSION = '2.34.1';
  const { h, icon } = RV.dom;
  const U = RV.util, L = RV.logic, ST = RV.store, UI = RV.ui;
  const S = ST.S;

  const appEl = document.getElementById('app');
  const topbar = h('header', { class: 'topbar' });
  const statusBar = h('div', { style: { maxWidth: '640px', margin: '0 auto', width: '100%', padding: '10px 16px 0' } });
  const view = h('main', { class: 'view', id: 'view', tabindex: '-1' });
  const fab = h('button', { class: 'fab', type: 'button', 'aria-label': 'New ' + RV.ui.lbl('rv'), onclick: () => RV.forms.rvForm() }, icon('plus', 26));
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, h('div', { class: 'inner' }));
  let current = null;
  let lastHash = null;
  const scrollPos = {};

  // ---------- display ----------
  function applyDisplay() {
    const html = document.documentElement;
    if (S.settings.theme === 'light' || S.settings.theme === 'dark') html.setAttribute('data-theme', S.settings.theme);
    else html.removeAttribute('data-theme');
    html.style.setProperty('--scale', String(S.settings.textScale || 1));
    html.setAttribute('data-accent', S.settings.accent === 'blue' ? 'blue' : 'purple');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const dark = S.settings.theme === 'dark' || (S.settings.theme === 'system' && root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
      meta.setAttribute('content', dark ? '#12110f' : '#f2f0ea');
    }
  }

  // ---------- routing ----------
  function parts() { return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent); }
  function buildScreen() {
    const p = parts();
    const SC = RV.screens, SS = RV.settingsScreens;
    switch (p[0]) {
      case undefined: case 'home': return SC.home();
      case 'today': if (!p[1]) { location.replace('#/home'); return SC.home(); } return SC.today(p[1]);
      case 'insights': return SC.insights(p[1], p[2]);
      case 'rvs': return SC.list(p[1], p[2]);
      case 'rv': return SC.detail(p[1]);
      case 'settings':
        if (!p[1]) return SS.index();
        if (p[1] === 'lib') return p[2] === 'campaign' ? SS.campaigns() : SS.lib(p[2]);
        return (SS[p[1]] || SS.index)();
      default: return SC.home();
    }
  }
  function activeTab() {
    const p = parts()[0];
    return { undefined: 'home', home: 'home', today: 'home', insights: 'insights', rvs: 'rvs', rv: 'rvs', settings: 'settings' }[p] || 'home';
  }

  function renderTabs() {
    const due = ST.items().filter((i) => i.att.state === 'overdue').length;
    // three tabs (v2.19.4): Home holds who to see today; the due count sits on Home
    // v2.24: the third tab is My garden (Insights when the garden is off), with a dot when a rare visitor came today
    const gOn = S.settings.garden !== false && RV.garden;
    let fresh = 0;
    if (gOn) { try { fresh = RV.garden.unseenHere(S.settings.visitorsHere).length; } catch (e) { fresh = 0; } }
    const tabs = [['home', '#/home', 'home', 'Home'], ['rvs', '#/rvs', 'users', 'Contacts'], ['insights', '#/insights', gOn ? 'sprout' : 'chart', gOn ? 'My garden' : 'Insights']];
    const cur = activeTab();
    tabbar.firstChild.replaceChildren(...tabs.map(([id, href, ic, label]) =>
      h('button', { class: 'tab', type: 'button', 'aria-current': id === cur ? 'page' : null, onclick: () => { if (location.hash !== href) location.hash = href; else window.scrollTo(0, 0); } },
        icon(ic, 22), label, id === 'home' && due ? h('span', { class: 'dot', 'aria-label': due + ' due for a visit' }, due > 99 ? '99+' : String(due)) : null,
        id === 'insights' && fresh ? h('span', { class: 'vdot', 'aria-label': 'A visitor is waiting in your garden' }) : null)));
  }


  // ---------- menu (settings) ----------
  function openMenu() {
    if (document.querySelector('.drawer')) return;
    const lbl = UI.lbl;
    // v2.28: three groups and a foot line, instead of thirteen items
    const groups = [
      ['Ministry', [['lib/topic', lbl('topics'), 'note'], ['campaigns', lbl('campaign') + 's', 'calendar']]],
      ['App', [['display', 'Display', 'sliders'], ['data', 'Backup and import', 'download'], ['ai', 'Note cleanup', 'sparkle'], ['security', 'Security', 'lock']]],
      [null, [['customize', 'Customize', 'edit']]],
    ];
    const close = () => { scrim.remove(); document.body.classList.remove('no-scroll'); };
    const scrim = h('div', { class: 'drawer', onclick: (e) => { if (e.target === scrim) close(); } },
      h('nav', { class: 'drawer-panel', 'aria-label': 'Settings menu' },
        h('div', { class: 'drawer-head' }, h('h2', null, 'Menu'), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('x'))),
        ...groups.map(([head, rows]) => h('div', { class: 'drawer-group' }, head ? h('div', { class: 'drawer-sub' }, head) : null,
          rows.map(([path, label, ic]) => h('a', { class: 'drawer-item', href: '#/settings/' + path, onclick: close }, icon(ic, 20), label)))),
        h('a', { class: 'drawer-foot', href: '#/settings/about', onclick: close }, 'Groundwork ' + RV.VERSION)));
    document.body.appendChild(scrim);
    document.body.classList.add('no-scroll');
  }

  function renderStatus() {
    statusBar.replaceChildren();
    if (S.error) {
      statusBar.appendChild(h('div', { class: 'banner danger', role: 'alert' }, icon('alert'),
        h('div', { class: 'body' }, S.error, h('div', null, h('button', { class: 'link', type: 'button', onclick: () => ST.clearError() }, 'Dismiss')))));
    } else if (S.ready && !S.persistent) {
      statusBar.appendChild(h('div', { class: 'banner danger', role: 'alert' }, icon('alert'),
        h('div', { class: 'body' }, 'This browser is blocking storage. Records will be lost when you close the app.')));
    }
    const ds = RV.drive.status();
    if (ds.connected && ds.configured && !ds.tokenOk && ds.dirty) {
      statusBar.appendChild(h('div', { class: 'banner info' }, icon('upload'),
        h('div', { class: 'body' }, 'Drive backup paused', h('div', null, h('button', { class: 'link', type: 'button', onclick: () => RV.drive.connect() }, 'Reconnect')))));
    }
    statusBar.hidden = !statusBar.firstChild;
  }

  function render() {
    const hash = location.hash || '#/home';
    const y = lastHash === hash ? root.scrollY : (scrollPos[hash] || 0);
    let screen;
    if (current && current.destroy) { try { current.destroy(); } catch (e) { /* ignore */ } }
    try {
      screen = buildScreen();
    } catch (e) {
      console.error(e);
      screen = { title: 'Something went wrong', el: h('div', { class: 'card' }, h('p', null, 'This screen could not open.'), h('pre', { class: 'small', style: { whiteSpace: 'pre-wrap' } }, String(e && e.message || e)), h('a', { class: 'btn', href: '#/home' }, 'Go Home')) };
    }
    current = screen;
    topbar.replaceChildren();
    topbar.classList.toggle('sub-page', !!screen.back);
    if (screen.back) {
      topbar.appendChild(h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Back', onclick: () => { if (history.length > 1) history.back(); else location.hash = screen.back; } }, icon('left')));
    }
    const h1 = h('h1', null, screen.title, screen.sub ? h('span', { class: 'sub' }, screen.sub) : null);
    topbar.appendChild(h1);
    // a screen that shows its title large in the page (a person's name by their plant) hides the bar's copy until it scrolls away
    if (screen.titleWatch) {
      h1.classList.add('watch', 'hide');
      const check = () => {
        if (!h1.isConnected) { root.removeEventListener('scroll', check); return; }
        const big = view.querySelector(screen.titleWatch); // looked up each time: the screen may repaint its parts
        const bar = topbar.getBoundingClientRect().bottom;
        h1.classList.toggle('hide', !!big && big.getBoundingClientRect().bottom > bar);
      };
      root.addEventListener('scroll', check, { passive: true });
      requestAnimationFrame(check);
    }
    (screen.actions || []).forEach((a) => topbar.appendChild(a));
    if (!screen.back) topbar.appendChild(h('button', { class: 'iconbtn menubtn', type: 'button', 'aria-label': 'Menu', onclick: openMenu }, icon('menu', 24)));
    view.replaceChildren(screen.el);
    fab.hidden = !screen.fab;
    document.body.classList.toggle('has-fab', !!screen.fab);
    document.title = screen.title && screen.title !== 'Groundwork' ? screen.title + ' · Groundwork' : 'Groundwork';
    renderTabs();
    renderStatus();
    lastHash = hash;
    root.scrollTo(0, y);
  }

  root.addEventListener('scroll', () => { if (lastHash) scrollPos[lastHash] = root.scrollY; }, { passive: true });
  root.addEventListener('hashchange', () => { if (!location.hash) location.replace('#/home'); render(); });

  RV.drive.onChange(() => { if (S.ready) renderStatus(); });
  ST.subscribe(() => {
    if (!S.ready) return;
    // v2.29: the moment Getting started is finished, say so
    if (RV.garden && RV.garden.starterOn(S.settings)) setTimeout(() => RV.gardenRecap && RV.gardenRecap.starterDone && RV.gardenRecap.starterDone(), 900);
    applyDisplay();
    renderTabs();
    renderStatus();
    if (current && current.update) current.update();
    else if (!(current && current.noRerender)) render();
  });

  // ---------- PIN lock ----------
  async function verifyPin(pin) {
    const lk = S.settings.lock;
    if (!lk.on) return true;
    return (await U.sha256hex(lk.salt + ':' + pin)) === lk.hash;
  }
  function showLock() {
    if (!S.settings.lock.on || document.querySelector('.lock')) return;
    let pin = '';
    const dots = h('div', { class: 'pindots', 'aria-hidden': 'true' });
    const msg = h('div', { class: 'small', style: { color: 'var(--danger)', minHeight: '1.3em' }, role: 'alert' });
    const overlay = h('div', { class: 'lock', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Locked' });
    const paint = () => dots.replaceChildren(...Array.from({ length: Math.max(4, pin.length) }, (_, i) => h('i', { class: i < pin.length ? 'on' : '' })));
    async function attempt(final) {
      if (pin.length < 4) return;
      if (await verifyPin(pin)) { overlay.remove(); root.removeEventListener('keydown', onKey); return; }
      if (final || pin.length >= 8) { msg.textContent = 'Wrong PIN'; pin = ''; paint(); }
    }
    const press = (d) => { if (pin.length < 8) { pin += d; msg.textContent = ''; paint(); attempt(false); } };
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') { pin = pin.slice(0, -1); paint(); }
      else if (e.key === 'Enter') attempt(true);
    };
    root.addEventListener('keydown', onKey);
    const key = (label, fn, aria) => h('button', { type: 'button', onclick: fn, 'aria-label': aria || label }, label);
    overlay.append(
      icon('lock', 34), h('h2', null, 'Enter PIN'), dots, msg,
      h('div', { class: 'keypad' },
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => press(d))),
        key('⌫', () => { pin = pin.slice(0, -1); paint(); }, 'Delete'), key('0', () => press('0')), key('OK', () => attempt(true))));
    paint();
    document.body.appendChild(overlay);
  }
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (S.settings.lock.on && hiddenAt && Date.now() - hiddenAt >= (S.settings.lock.timeoutMin || 0) * 60000) showLock();
  });

  RV.app = { render, applyDisplay, verifyPin, lockNow: showLock };

  // keyboard-aware height for full-screen writing views; --kb lifts bottom sheets above the keyboard
  const vv = root.visualViewport;
  const setVV = () => { const de = document.documentElement; de.style.setProperty('--vvh', (vv ? vv.height : root.innerHeight) + 'px'); de.style.setProperty('--vvt', (vv ? vv.offsetTop : 0) + 'px'); de.style.setProperty('--kb', (vv ? Math.max(0, Math.round(root.innerHeight - vv.height - vv.offsetTop)) : 0) + 'px'); };
  setVV();
  if (vv) { vv.addEventListener('resize', setVV); vv.addEventListener('scroll', setVV); } else root.addEventListener('resize', setVV);

  // ---------- start ----------
  async function start() {
    appEl.append(topbar, statusBar, view, fab, tabbar);
    view.appendChild(h('div', { class: 'empty' }, 'Loading…'));
    fab.hidden = true;
    await ST.load();
    applyDisplay();
    const signIn = RV.drive.handleRedirect();
    if (!location.hash) history.replaceState(null, '', '#/home');
    render();
    showLock();
    // v2.31: notes shared from another app wait in a cache; open the notes import to take them
    if (root.caches && !/^#\/settings\/notes/.test(location.hash)) caches.has('rvapp-share').then((has) => has && caches.open('rvapp-share')).then((c) => c && c.keys()).then((k) => { if (k && k.length) location.hash = '#/settings/notes'; }).catch(() => {});
    // the week's-end recap, once, after the Sunday-to-Saturday week ends (also when the app comes back on Sunday)
    setTimeout(() => RV.gardenRecap && RV.gardenRecap.maybeShow(), 600);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => RV.gardenRecap && RV.gardenRecap.maybeShow(), 600); });
    registerSW();
    RV.drive.start();
    if (signIn && signIn.retrying) {
      // the silent reconnect needs Google to ask: already on the way there
    } else if (signIn && signIn.ok) {
      Promise.resolve(signIn.wait === undefined ? true : signIn.wait).then((ok) => {
        if (!ok) { UI.toast(RV.drive.status().error || 'Google sign-in did not finish.'); RV.drive.clearError(); return; }
        UI.toast('Google Drive connected');
        RV.drive.backupNow().then((done) => { if (done) UI.toast('Saved to Google Drive'); });
      });
    } else if (signIn) {
      UI.toast(RV.drive.status().error || 'Google sign-in did not finish.');
      RV.drive.clearError();
    }
  }

  function registerSW() {
    if (root.RV_NO_SW || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const had = !!navigator.serviceWorker.controller;
    // Look for a new version every time the app is opened or brought back, and switch to it on its own.
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      const check = () => { reg.update().catch(() => {}); };
      check();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }).catch((e) => console.warn('Service worker not registered', e));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had || reloading) return;
      // reload straight away unless a form is open; then offer it so nothing typed is lost
      if (!document.querySelector('.overlay')) { reloading = true; location.reload(); return; }
      UI.toast('New version ready.', { seconds: 30, actions: [{ label: 'Reload', fn: () => location.reload() }] });
    });
  }

  start().catch((e) => {
    console.error(e);
    view.replaceChildren(h('div', { class: 'card' }, h('h2', null, 'The app could not start'), h('p', { class: 'muted' }, String(e && e.message || e))));
  });
})(window);
