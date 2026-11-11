"""v2.56.3 in the browser: "See it in your garden" scrolls to the visitor once (a redraw part way no longer jumps
back to the top), and the visitor announcement, the weekly recap and the round swipe away sideways or down
(RV.swipe.away; up for a notice at the top). Run: python3 -I tests/away_ui.py [shots dir]"""
import http.server, socketserver, threading, functools, sys, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8797
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/'
ok = bad = 0
def check(c, label):
    global ok, bad
    print(('  ok  ' if c else 'FAIL  ') + label)
    if c: ok += 1
    else: bad += 1
def shot(pg, name):
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, name + '.png'))
def drag(pg, x, y, dx, dy, steps=12):
    pg.mouse.move(x, y); pg.mouse.down()
    for i in range(1, steps + 1): pg.mouse.move(x + dx * i / steps, y + dy * i / steps)
    pg.mouse.up(); pg.wait_for_timeout(450)
INIT = "window.__RV_SURPRISE = 0; window.__RV_STARTER = 'off'; window.RV_NO_SW = true;"
def announce(pg):
    pg.evaluate("document.querySelectorAll('.vann, .recap').forEach(e => e.remove())")
    pg.evaluate("window.__RV_SURPRISE = 1"); pg.evaluate("RV.store.saveSettings(s => { s.visitorsHere = {}; s.visitors = {}; })"); pg.wait_for_timeout(250)
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    pg.evaluate('RV.gardenRecap.visitor()')  # it may already have shown on opening Today
    pg.wait_for_selector('.vann'); pg.wait_for_timeout(500)
    return pg.locator('.vann').count() == 1
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(INIT)
    ctx.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"version":8,"sources":{},"layers":[]}'))
    ctx.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    # a garden tall enough to scroll: many contacts across a few areas
    pg.evaluate("""() => { const areas = ['Lakeview', 'Oak Park', 'Hillside', 'Riverbend'];
      for (let i = 0; i < 24; i++) { const r = RV.store.addRv({ name: 'Person ' + i, stage: i % 3 ? 'initial' : 'rv', address: (100 + i) + ' Maple Ave', neighborhood: areas[i % 4] });
        RV.store.addEntry(r.id, 'visit', { text: 'Talk' }, new Date(Date.now() - (i % 9 + 1) * 864e5).toISOString()); }
      RV.store.flush(); }""")
    # ---------- the bounce ----------
    # open the garden once first, so its one-off saves (milestones, settling visitors) are done, as on a real phone:
    # then the first redraw after "See it in your garden" is the one that marks the visitor seen, seconds in
    pg.goto(URL + '#/insights'); pg.wait_for_selector('.gscene'); pg.wait_for_timeout(3600)
    check(announce(pg) is True, 'a visitor is announced')
    pg.set_viewport_size({'width': 390, 'height': 360})  # a short screen, so the visitor starts below the fold
    pg.evaluate("""() => { window.__ys = []; const t0 = Date.now(); 
      const tick = () => { __ys.push(scrollY); if (Date.now() - t0 < 4200) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }""")
    pg.click('.vann button:has-text("See it in your garden")'); pg.wait_for_selector('.gscene')
    pg.wait_for_timeout(4400)
    ys = pg.evaluate('__ys')
    peak = max(ys) if ys else 0
    after = ys[ys.index(peak):] if ys else []
    # the save that marks the visitor seen redraws the garden while it's down there: it must not jump back up
    went = [y for y in ys if y > 40]
    first = ys.index(went[0]) if went else 0
    dips = [y for y in ys[first:] if y < 20]
    check(peak > 40, 'See it in your garden scrolls down to the visitor (%d px)' % peak)
    check(not dips, 'a redraw part way through doesn’t bounce back to the top (%d samples near 0)' % len(dips))
    check(pg.evaluate('location.hash') == '#/insights', 'the address settles on the garden')
    try:
        pg.wait_for_selector('.gcard:not([hidden])', timeout=5000); opened = True
    except Exception:
        opened = False
    check(opened, 'and the visitor’s card still opens')
    shot(pg, '01-focused')
    pg.keyboard.press('Escape'); pg.set_viewport_size({'width': 390, 'height': 844})
    # ---------- the announcement swipes away ----------
    announce(pg)
    drag(pg, 120, 300, 260, 10)
    check(pg.locator('.vann').count() == 0, 'the visitor announcement swipes away sideways (= Later)')
    check(pg.evaluate('location.hash') == '#/home', 'and stays where you were')
    announce(pg)
    drag(pg, 300, 300, -260, -6)
    check(pg.locator('.vann').count() == 0, 'to the left too')
    announce(pg)
    drag(pg, 195, 250, 0, 220)
    check(pg.locator('.vann').count() == 0, 'or pulled down')
    announce(pg)
    drag(pg, 195, 500, 0, -220)
    check(pg.locator('.vann').count() == 1, 'but not pushed up (it fills the screen, so it goes down)')
    drag(pg, 120, 300, 60, 0)
    check(pg.locator('.vann').count() == 1 and pg.evaluate("document.querySelector('.vann').style.transform") == '', 'a short swipe springs back')
    shot(pg, '02-announcement')
    pg.click('.vann button:has-text("Later")'); pg.wait_for_timeout(200)
    check(pg.locator('.vann').count() == 0, 'Later still works')
    # ---------- the weekly recap ----------
    pg.evaluate("RV.store.saveSettings(s => { s.gardenSince = new Date(Date.now() - 30*864e5).toISOString(); s.recapSeen = null; })")
    shown = pg.evaluate('RV.gardenRecap.maybeShow()')
    pg.wait_for_timeout(300)
    if pg.locator('.vann').count(): pg.evaluate("document.querySelectorAll('.vann').forEach(e => e.remove())"); pg.evaluate("RV.store.saveSettings(s => { s.recapSeen = null; })"); pg.evaluate('RV.gardenRecap.maybeShow()')
    try:
        pg.wait_for_selector('.recap', timeout=3000); rc = True
    except Exception:
        rc = False
    check(rc, 'the weekly recap shows')
    if rc:
        pg.wait_for_timeout(700); shot(pg, '03-recap')
        drag(pg, 300, 200, -260, 0)
        check(pg.locator('.recap').count() == 0, 'the weekly recap swipes away sideways (= Close)')
    # ---------- the round ----------
    pg.evaluate("""() => { const items = RV.store.items(); const now = Date.now();
      items.slice(0, 4).forEach((it, i) => RV.store.addEntry(it.rv.id, 'visit', { text: 'Round talk' }, new Date(now - (120 - i * 20) * 60e3).toISOString()));
      RV.store.saveSettings(s => { s.roundSeen = null; }); }""")
    pg.wait_for_timeout(300)
    pg.evaluate("document.querySelectorAll('.recap, .vann').forEach(e => e.remove())")
    shown = pg.evaluate('RV.gardenRecap.round(true)')
    check(shown is True and pg.locator('.recap[aria-label="Your round"]').count() == 1, 'the round shows')
    if shown:
        pg.wait_for_timeout(500)
        drag(pg, 195, 120, 0, 240)
        check(pg.locator('.recap').count() == 0, 'the round pulls down to close')
    # ---------- a notice at the top goes up ----------
    pg.evaluate("""() => { const n = document.createElement('div'); n.className = 'tnote'; n.textContent = 'Top notice';
      Object.assign(n.style, { position: 'fixed', top: '10px', left: '20px', right: '20px', height: '80px', background: '#fff', zIndex: 99 });
      document.body.appendChild(n); RV.swipe.away(n, () => n.remove(), { up: true }); }""")
    drag(pg, 195, 50, 0, 120)
    check(pg.locator('.tnote').count() == 1, 'a notice at the top doesn’t pull down')
    drag(pg, 195, 60, 0, -45, steps=3)
    check(pg.locator('.tnote').count() == 0, 'it flicks up to close')
    # ---------- touch (the phone path) ----------
    tctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    tctx.add_init_script(INIT)
    tctx.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"version":8,"sources":{},"layers":[]}'))
    tctx.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    tp = tctx.new_page(); tp.on('pageerror', lambda e: errs.append(str(e)))
    tp.goto(URL + '#/home'); tp.wait_for_selector('.tabbar .tab')
    tp.evaluate("void RV.store.addRv({ name: 'Touch Test', stage: 'initial', address: '1 Elm St', neighborhood: 'Lakeview' })")
    announce(tp)
    cdp = tctx.new_cdp_session(tp)
    def touch(kind, x, y):
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': x, 'y': y}]})
    touch('touchStart', 120, 300)
    for i in range(1, 13): touch('touchMove', 120 + 22 * i, 302); tp.wait_for_timeout(16)
    touch('touchEnd', 0, 0); tp.wait_for_timeout(450)
    check(tp.locator('.vann').count() == 0, 'with a finger: the announcement swipes away sideways')
    announce(tp)
    touch('touchStart', 195, 260)
    for i in range(1, 13): touch('touchMove', 196, 260 + 20 * i); tp.wait_for_timeout(16)
    touch('touchEnd', 0, 0); tp.wait_for_timeout(450)
    check(tp.locator('.vann').count() == 0, 'with a finger: pulled down')
    check(not errs, 'no page errors (%s)' % errs[:2])
    b.close()
print('%d passed, %d failed' % (ok, bad))
sys.exit(1 if bad else 0)
