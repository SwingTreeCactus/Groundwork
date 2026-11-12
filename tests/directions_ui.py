"""Directions (v2.60): the first Directions tap asks which maps app (Google Maps, Apple Maps on Apple devices, Waze),
saves it and opens it; later taps go straight there; Ask each time asks every time; Settings › Directions changes it.
Run: python3 tests/directions_ui.py [shots dir]"""
import http.server, socketserver, threading, functools, sys, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8798
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
def shot(pg, n):
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, n + '.png'))
IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
SPY = "window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; };"

def setup(b, ua):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, user_agent=ua)
    ctx.add_init_script("window.__RV_SURPRISE = 0; window.__RV_STARTER = 'off'; window.RV_NO_SW = true;" + SPY)
    ctx.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"version":8,"sources":{},"layers":[]}'))
    ctx.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    rid = pg.evaluate("""() => { const S = RV.store;
      const m = S.addRv({ name: 'Maria Lopez', stage: 'return', address: '1418 Pine St' });
      const g = S.addRv({ name: 'Geo Person', stage: 'return', address: '5 Elm St' }); S.updateRv(g.id, { geo: { lat: 37.95, lng: -121.29 } });
      S.flush(); return [m.id, g.id]; }""")
    return ctx, pg, errs, rid

def tap_dir(pg, rid):
    pg.goto(URL + '#/rv/' + rid); pg.wait_for_selector('.actrow')
    pg.click('.actrow button:has-text("Directions")'); pg.wait_for_timeout(250)

with sync_playwright() as p:
    b = p.chromium.launch()
    # iPhone: the first tap asks, with Apple Maps offered
    ctx, pg, errs, (m, g) = setup(b, IPHONE)
    tap_dir(pg, m)
    check(pg.locator('.sheet h2:has-text("Open directions in")').count() == 1 and pg.evaluate("window.__opened.length") == 0, 'the first Directions tap asks which maps app, opening nothing yet')
    opts = pg.locator('.mapspick .opt').all_inner_texts()
    check([o.strip() for o in opts] == ['Google Maps', 'Apple Maps', 'Waze'], 'iPhone: Google Maps, Apple Maps, Waze (%s)' % opts)
    check('Settings › Directions' in pg.locator('.mapspick').inner_text(), 'it says it asks once and where to change it')
    shot(pg, 'dir-1-chooser')
    pg.click('.mapspick .opt:has-text("Google Maps")'); pg.wait_for_timeout(250)
    op = pg.evaluate("window.__opened")
    check(len(op) == 1 and op[0].startswith('https://www.google.com/maps/dir/') and 'destination=1418%20Pine%20St' in op[0], 'choosing opens Google Maps to the address (%s)' % op)
    check(pg.evaluate("RV.store.S.settings.maps") == 'google' and pg.locator('.sheet').count() == 0, 'the choice is saved and the sheet closes')
    tap_dir(pg, g)
    op = pg.evaluate("window.__opened")
    check(pg.locator('.sheet').count() == 0 and len(op) == 2 and 'destination=37.95%2C-121.29' in op[1], 'the next tap goes straight to Google Maps, to the exact spot')
    # Settings › Directions
    pg.goto(URL + '#/settings'); pg.wait_for_selector('.setrow')
    check(pg.locator('.setrow:has-text("Directions")').inner_text().find('Google Maps') >= 0, 'the menu row shows Google Maps')
    pg.goto(URL + '#/settings/directions'); pg.wait_for_selector('.opt')
    check([x.split('\n')[0] for x in pg.locator('.opt').all_inner_texts()] == ['Google Maps', 'Apple Maps', 'Waze', 'Ask each time'], 'Settings › Directions lists the apps and Ask each time')
    check(pg.locator('.opt[aria-pressed="true"]').inner_text().startswith('Google Maps'), 'Google Maps is marked')
    shot(pg, 'dir-2-settings')
    pg.click('.opt:has-text("Apple Maps")'); pg.wait_for_timeout(200)
    check(pg.evaluate("RV.store.S.settings.maps") == 'apple' and pg.locator('.opt[aria-pressed="true"]').inner_text().startswith('Apple Maps'), 'choosing Apple Maps saves and marks it')
    tap_dir(pg, m)
    op = pg.evaluate("window.__opened")
    check(op[-1].startswith('https://maps.apple.com/?dirflg=d&daddr=1418%20Pine%20St'), 'Apple Maps opens to the address (%s)' % op[-1])
    pg.goto(URL + '#/settings/directions'); pg.wait_for_selector('.opt'); pg.click('.opt:has-text("Waze")'); pg.wait_for_timeout(200)
    tap_dir(pg, g)
    op = pg.evaluate("window.__opened")
    check(op[-1] == 'https://waze.com/ul?navigate=yes&ll=37.95,-121.29', 'Waze opens to the exact spot (%s)' % op[-1])
    pg.goto(URL + '#/settings/directions'); pg.wait_for_selector('.opt'); pg.click('.opt:has-text("Ask each time")'); pg.wait_for_timeout(200)
    n = pg.evaluate("window.__opened.length")
    tap_dir(pg, m)
    check(pg.locator('.mapspick').count() == 1 and 'Asked once' not in pg.locator('.mapspick').inner_text(), 'Ask each time: the chooser shows, without "Asked once"')
    pg.click('.mapspick .opt:has-text("Waze")'); pg.wait_for_timeout(200)
    check(pg.evaluate("window.__opened.length") == n + 1 and pg.evaluate("RV.store.S.settings.maps") == 'ask', 'it opens the app picked and keeps Ask each time')
    tap_dir(pg, m)
    check(pg.locator('.mapspick').count() == 1, 'and asks again next time')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # the map card's Directions goes the same way
    pg.evaluate("RV.store.saveSettings((s) => { s.maps = 'google'; })")
    n = pg.evaluate("window.__opened.length")
    pg.evaluate("(id) => RV.ui.openNav(RV.ui.navTarget(RV.store.rvById(id)))", m)
    check(pg.evaluate("window.__opened.length") == n + 1, 'every Directions button uses the saved choice')
    check(not errs, 'no page errors on iPhone (%s)' % errs[:2])
    ctx.close()
    # Android: no Apple Maps; an Apple Maps choice restored from a backup falls back to Google Maps
    ctx, pg, errs, (m, g) = setup(b, ANDROID)
    tap_dir(pg, m)
    opts = [o.strip() for o in pg.locator('.mapspick .opt').all_inner_texts()]
    check(opts == ['Google Maps', 'Waze'], 'Android: Google Maps and Waze only (%s)' % opts)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate("RV.store.saveSettings((s) => { s.maps = 'apple'; })")
    tap_dir(pg, m)
    op = pg.evaluate("window.__opened")
    check(len(op) == 1 and op[0].startswith('https://www.google.com/maps/dir/'), 'an Apple Maps choice from another phone opens Google Maps here')
    pg.goto(URL + '#/settings/directions'); pg.wait_for_selector('.opt')
    check('Apple Maps' not in pg.locator('.card').inner_text() and pg.locator('.opt[aria-pressed="true"]').inner_text().startswith('Google Maps'), 'Settings on Android: no Apple Maps, Google Maps marked')
    check(not errs, 'no page errors on Android (%s)' % errs[:2])
    ctx.close(); b.close()
print('%d passed, %d failed' % (ok, bad))
sys.exit(1 if bad else 0)
