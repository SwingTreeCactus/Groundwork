"""Address edits re-check the area and the pin (v2.62, js/recheck.js): a changed address moves the contact to the area
its new spot is in (Undo; an area picked by hand wins; outside every shape no change); a geotagged contact whose new
address is far from the pin asks (Use the address / Keep the pin); Pin here asks when far from the typed address;
Remove pin; an edit made offline is checked later (a card on the contact page, or the map's lookup).
Run: python3 tests/recheck_ui.py [shots dir]"""
import http.server, socketserver, threading, functools, sys, os, json
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8803
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
def shot(pg, n, full=False):
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, n + '.png'), full_page=full)

LAKE = (37.945, -121.295)   # inside Lakeview
OAK = (37.965, -121.295)    # inside Oak Park, ~2.2 km north
SPOTS = {
    '1415 n wilson way': LAKE,
    '1415 n wilson way, stockton 95205': OAK,
    '77 elm st': LAKE, '77 elm st, stockton 95205': OAK,
    '5 nowhere rd': (37.900, -121.200),
    '220 e harding way': (37.9454, -121.2952),  # ~45 m from LAKE
    '9 far st': OAK,
    '12 birch ave': OAK,
    '40 cedar ct': LAKE, '40 cedar ct, stockton': OAK,
}
def nominatim(route):
    q = parse_qs(urlparse(route.request.url).query).get('q', [''])[0].strip().lower()
    s = SPOTS.get(q)
    route.fulfill(status=200, content_type='application/json', body=json.dumps([{'lat': str(s[0]), 'lon': str(s[1])}] if s else []))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, permissions=['geolocation'], geolocation={'latitude': LAKE[0], 'longitude': LAKE[1]})
    ctx.add_init_script("window.__RV_STATS = ''; window.__RV_SURPRISE = 0; window.__RV_STARTER = 'off'; window.RV_NO_SW = true;")
    ctx.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"version":8,"sources":{},"layers":[]}'))
    ctx.route('https://nominatim.openstreetmap.org/**', nominatim)
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    ids = pg.evaluate("""([lake]) => { const S = RV.store;
      S.saveSettings((s) => { s.lists.neighborhoods = ['Lakeview', 'Oak Park', 'Riverside']; s.areaShapes = [
        { id: 'lv', area: 'Lakeview', pts: [[-121.300, 37.940], [-121.290, 37.940], [-121.290, 37.950], [-121.300, 37.950]] },
        { id: 'op', area: 'Oak Park', pts: [[-121.300, 37.960], [-121.290, 37.960], [-121.290, 37.970], [-121.300, 37.970]] }]; });
      const ap = (a) => ({ q: a.toLowerCase(), lat: lake[0], lng: lake[1] });
      const geo = { lat: lake[0], lng: lake[1], acc: 10, at: new Date().toISOString() };
      const mk = (name, address, extra) => S.addRv(Object.assign({ name, stage: 'return', address, neighborhood: 'Lakeview', approx: ap(address) }, extra || {})).id;
      const r = { m: mk('Maria Lopez', '1415 N Wilson Way'), b: mk('Bea Cruz', '77 Elm St'), c: mk('Cal Diaz', '1415 N Wilson Way'),
        j: mk('James Carter', '1415 N Wilson Way', { geo }), d: mk('Dee Fox', '1415 N Wilson Way', { geo: Object.assign({}, geo) }),
        e: mk('Eve Hart', '1415 N Wilson Way', { geo: Object.assign({}, geo) }), f: mk('Fay Gold', '40 Cedar Ct') };
      S.flush(); return r; }""", [list(LAKE)])
    rv = lambda k: pg.evaluate("(id) => { const r = RV.store.rvById(id); return { address: r.address, area: r.neighborhood || '', geo: r.geo || null, addrCheck: r.addrCheck || null, pinFar: r.pinFar || null, pinKeep: r.pinKeep || null }; }", ids[k])
    def open_rv(k):
        pg.goto(URL + '#/rv/' + ids[k]); pg.wait_for_selector('.gaddr'); pg.wait_for_timeout(200)
    def edit_address(v, area=None):
        pg.click('.gaddr'); pg.wait_for_selector('.inl input')
        pg.fill('.inl input', v)
        if area: pg.select_option('.inlarea select', area)
        pg.click('.inlbar .link'); pg.wait_for_timeout(600)
    def clear_toasts(): pg.evaluate("document.querySelectorAll('.toast').forEach((t) => t.remove())")

    # 1 an incomplete address fixed: the area follows the new spot, with Undo
    open_rv('m')
    pg.click('.gaddr'); pg.wait_for_selector('.inl input')
    check(pg.locator('.inl button:has-text("Remove pin")').is_hidden(), 'no Remove pin without a pin')
    pg.fill('.inl input', '1415 N Wilson Way, Stockton 95205'); shot(pg, 'r1-edit')
    pg.click('.inlbar .link'); pg.wait_for_timeout(600)
    check(rv('m')['area'] == 'Oak Park', 'the fixed address moves the contact to Oak Park (%s)' % rv('m')['area'])
    check(pg.locator('.toast:has-text("Moved to Oak Park")').count() == 1, 'a "Moved to Oak Park" toast says so')
    shot(pg, 'r2-moved')
    pg.locator('.toast:has-text("Moved to Oak Park") button:has-text("Undo")').dispatch_event('click'); pg.wait_for_timeout(300)
    check(rv('m')['area'] == 'Lakeview' and rv('m')['address'] == '1415 N Wilson Way, Stockton 95205', 'its Undo puts the area back and keeps the address')
    clear_toasts()
    # the Saved toast's Undo puts back the area too
    edit_address('1415 N Wilson Way')
    edit_address('1415 N Wilson Way, Stockton 95205'); pg.wait_for_timeout(200)
    check(rv('m')['area'] == 'Oak Park', 'moved again')
    pg.locator('.toast:has-text("Saved") button:has-text("Undo")').last.dispatch_event('click'); pg.wait_for_timeout(400)
    r = rv('m'); check(r['address'] == '1415 N Wilson Way' and r['area'] == 'Lakeview', 'the Saved toast\'s Undo puts back the address and the area it moved (%s)' % r)
    clear_toasts()

    # 2 an area picked by hand in the same edit wins
    open_rv('b'); edit_address('77 Elm St, Stockton 95205', 'Riverside')
    check(rv('b')['area'] == 'Riverside' and pg.locator('.toast:has-text("Moved")').count() == 0, 'an area picked by hand stays (%s)' % rv('b')['area'])
    clear_toasts()

    # 3 outside every shape: no change
    open_rv('c'); edit_address('5 Nowhere Rd')
    check(rv('c')['area'] == 'Lakeview' and pg.locator('.toast:has-text("Moved")').count() == 0, 'a spot outside every shape keeps the area')
    clear_toasts()

    # 4 geotagged, new address close to the pin: nothing asked
    open_rv('j'); edit_address('220 E Harding Way')
    check(pg.locator('.overlay .rcmap').count() == 0 and rv('j')['geo'] is not None, 'a new address near the pin asks nothing and keeps it')
    clear_toasts()
    # far: the sheet asks; Use the address drops the pin and checks the area
    edit_address('9 Far St'); pg.wait_for_selector('.overlay .rcmap', timeout=3000)
    t = pg.locator('.overlay').inner_text()
    check('The pin is' in t and 'mi from this address' in t, 'a new address far from the pin asks (%s)' % t.split('\n')[0])
    check(pg.locator('.overlay button:has-text("Use the address")').count() == 1 and pg.locator('.overlay button:has-text("Keep the pin")').count() == 1, 'with Use the address and Keep the pin')
    shot(pg, 'r3-far')
    pg.click('.overlay button:has-text("Use the address")'); pg.wait_for_timeout(400)
    r = rv('j'); check(r['geo'] is None and r['area'] == 'Oak Park', 'Use the address drops the pin and moves the area (%s)' % r)
    clear_toasts()
    # Keep the pin: kept, and not asked again for that address
    open_rv('d'); edit_address('9 Far St'); pg.wait_for_selector('.overlay .rcmap', timeout=3000)
    pg.click('.overlay button:has-text("Keep the pin")'); pg.wait_for_timeout(400)
    r = rv('d'); check(r['geo'] is not None and r['area'] == 'Lakeview' and r['pinKeep'] == '9 far st', 'Keep the pin keeps it and the area')
    open_rv('d'); check(pg.locator('.rccard').count() == 0, 'and no card asks again')
    clear_toasts()

    # 5 Pin here far from the typed address asks first
    pg.context.set_geolocation({'latitude': LAKE[0], 'longitude': LAKE[1]})
    open_rv('m'); edit_address('1415 N Wilson Way, Stockton 95205'); clear_toasts()
    check(rv('m')['area'] == 'Oak Park', '(set up: Maria in Oak Park)')
    pg.click('.gaddr'); pg.wait_for_selector('.inl input')
    pg.click('.inl button:has-text("Pin here")'); pg.wait_for_selector('.overlay .rcmap', timeout=3000)
    t = pg.locator('.overlay').inner_text()
    check(t.startswith('You’re') and 'from 1415 N Wilson Way' in t and 'Pin here anyway?' in t, 'Pin here far away asks (%s)' % t.split('\n')[0])
    shot(pg, 'r4-pinfar')
    pg.click('.overlay button:has-text("Cancel")'); pg.wait_for_timeout(300)
    check(rv('m')['geo'] is None, 'Cancel pins nothing')
    pg.click('.inl button:has-text("Pin here")'); pg.wait_for_selector('.overlay .rcmap', timeout=3000)
    pg.click('.overlay button:has-text("Pin anyway")'); pg.wait_for_timeout(300)
    check(rv('m')['geo'] is not None and pg.locator('.inl button:has-text("Remove pin")').is_visible(), 'Pin anyway pins, and Remove pin shows')
    pg.click('.inl button:has-text("Remove pin")'); pg.wait_for_timeout(500)
    check(rv('m')['geo'] is None and pg.locator('.inl button:has-text("Pin here")').count() == 1, 'Remove pin takes it off, and the edit stays open')
    pg.locator('.inl input').press('Escape'); pg.wait_for_timeout(200); clear_toasts()
    # close by: no question
    pg.context.set_geolocation({'latitude': OAK[0] + 0.0003, 'longitude': OAK[1]})
    pg.click('.gaddr'); pg.wait_for_selector('.inl input')
    pg.click('.inl button:has-text("Pin here")'); pg.wait_for_timeout(600)
    check(pg.locator('.overlay .rcmap').count() == 0 and rv('m')['geo'] is not None, 'Pin here near the address pins without asking')
    pg.locator('.inl input').press('Escape'); pg.wait_for_timeout(200)

    # 6 edited offline: checked later
    open_rv('e'); pg.context.set_offline(True); pg.wait_for_timeout(100)
    edit_address('12 Birch Ave')
    check(pg.locator('.overlay .rcmap').count() == 0 and rv('e')['addrCheck'] == 1, 'offline, nothing is asked and the contact is marked for later (%s)' % rv('e')['addrCheck'])
    pg.context.set_offline(False); pg.wait_for_timeout(100)
    pg.goto(URL + '#/rvs'); pg.wait_for_timeout(300); open_rv('e'); pg.wait_for_timeout(600)
    pg.wait_for_selector('.rccard', timeout=3000)
    t = pg.locator('.rccard').inner_text()
    check('The pin is' in t and 'from the address' in t and rv('e')['addrCheck'] is None, 'back online, a card on the contact page asks (%s)' % t.split('\n')[0])
    shot(pg, 'r5-card')
    pg.click('.rccard button:has-text("Use the address")'); pg.wait_for_timeout(400)
    r = rv('e'); check(r['geo'] is None and r['area'] == 'Oak Park' and pg.locator('.rccard').count() == 0, 'its Use the address drops the pin, moves the area and the card goes (%s)' % r)
    clear_toasts()
    # no pin, edited offline: the map's lookup moves the area, naming the contact
    open_rv('f'); pg.context.set_offline(True); pg.wait_for_timeout(100)
    edit_address('40 Cedar Ct, Stockton')
    check(rv('f')['addrCheck'] == 1 and rv('f')['area'] == 'Lakeview', 'offline, the area waits')
    pg.context.set_offline(False); pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab'); clear_toasts()
    pg.evaluate("RV.gmap.placeMissing(() => {}, () => true)"); pg.wait_for_timeout(1500)
    r = rv('f'); check(r['area'] == 'Oak Park' and r['addrCheck'] is None, 'the map\'s lookup moves it once online (%s)' % r)
    check(pg.locator('.toast:has-text("Moved Fay Gold to Oak Park")').count() == 1, 'and says whose area moved')

    # New contact's Geotag with an address typed asks the same way
    pg.context.set_geolocation({'latitude': LAKE[0], 'longitude': LAKE[1]})
    pg.goto(URL + '#/rvs'); pg.wait_for_selector('.fab'); pg.click('.fab'); pg.wait_for_selector('.sheet')
    pg.locator('.sheet input[type=text]').nth(1).fill('9 Far St')
    pg.click('.sheet .georow button'); pg.wait_for_selector('.overlay .rcmap', timeout=5000)
    check('Pin here anyway?' in pg.locator('.overlay:has(.rcmap)').inner_text(), 'New contact: Geotag far from the typed address asks')
    pg.click('.overlay:has(.rcmap) button:has-text("Cancel")'); pg.wait_for_timeout(300)
    check('Geotagged' not in pg.locator('.sheet .georow button').inner_text(), 'and Cancel leaves it untagged')

    check(not errs, 'no page errors %s' % errs[:2])
    b.close()
srv.shutdown()
print(f'\n{ok} passed, {bad} failed')
sys.exit(1 if bad else 0)
