"""Usage counts in the browser (v2.56): the app checks in once a day with only the install code, version, device,
mode and feature flags; never again the same day; nothing when switched off or when no helper is set; the About
page has the switch and the press-and-hold link to the stats page. Run: python3 tests/stats_ui.py"""
import http.server, socketserver, threading, functools, sys, os, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8791
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
pings = []
def route(r):
    if r.request.method == 'POST': pings.append(json.loads(r.request.post_data))
    r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body='{"ok":true}')
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script("window.__RV_STATS = ''; window.__RV_SURPRISE = 0; window.__RV_STARTER = 'off'; window.RV_NO_SW = true; window.__RV_STATS = 'https://stats.example.workers.dev';")
    ctx.route('https://stats.example.workers.dev/**', route)
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    pg.evaluate("(() => { const r = RV.store.addRv({ name: 'Zelda Secretname', stage: 'initial', address: '1 Hidden Way' }); RV.store.addEntry(r.id, 'visit', { text: 'Private note' }); RV.store.flush(); })()")
    pg.wait_for_timeout(4800)
    check(len(pings) == 1, 'one check-in a few seconds after opening (%d)' % len(pings))
    if pings:
        body = pings[0]
        check(set(body) == {'id', 'v', 'device', 'mode', 'f'}, 'it carries only the code, version, device, mode and features (%s)' % sorted(body))
        check(body['id'] == pg.evaluate("RV.ai.installId()") and body['v'] == pg.evaluate("RV.VERSION") and body['device'] == 'desktop' and body['mode'] == 'browser', 'the install code, version, device and mode are right')
        check('visits' in body['f'] and 'garden' in body['f'], 'features are flags only (%s)' % body['f'])
        raw = json.dumps(body)
        check('Zelda' not in raw and 'Hidden' not in raw and 'Private' not in raw, 'no names, addresses or notes')
    pg.reload(); pg.wait_for_selector('.tabbar .tab'); pg.wait_for_timeout(4800)
    check(len(pings) == 1, 'not again the same day')
    code = pg.evaluate("RV.ai.installId()")
    pg.evaluate("RV.store.eraseAll()"); pg.wait_for_timeout(300)
    check(pg.evaluate("RV.ai.installId()") == code, 'Erase all data keeps the install code, so it isn’t a new install')
    pg.evaluate("localStorage.removeItem('rvapp.statsDay')")
    pg.goto(URL + '#/settings/about'); pg.wait_for_selector('text=Share anonymous usage counts')
    check(pg.locator('.switchrow >> text=Never names, notes or addresses').count() == 1, 'About has the switch and says what is sent')
    pg.locator('.switchrow input[type=checkbox], .switchrow .switch').first.click(); pg.wait_for_timeout(200)
    check(pg.evaluate("RV.stats.on()") is False, 'the switch turns it off')
    n = len(pings); pg.evaluate("RV.stats.ping(true)"); pg.wait_for_timeout(500)
    check(len(pings) == n, 'nothing is sent while it is off')
    pg.evaluate("() => { RV.stats.setOn(true); window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; }")
    box = pg.locator('.aboutver').bounding_box()
    pg.mouse.move(box['x'] + 20, box['y'] + 8); pg.mouse.down(); pg.wait_for_timeout(900); pg.mouse.up()
    check(pg.evaluate("window.__opened") == ['https://stats.example.workers.dev/'], 'press and hold the version line opens the stats page')
    check(not errs, 'no page errors (%s)' % errs[:2])
    # no helper set: nothing at all
    ctx2 = b.new_context(); ctx2.add_init_script("window.__RV_STATS = ''; window.__RV_SURPRISE = 0; window.__RV_STARTER = 'off'; window.RV_NO_SW = true;")
    sent = []
    ctx2.route('https://**/ping', lambda r: (sent.append(1), r.fulfill(status=200, body='{}')))
    pg2 = ctx2.new_page(); pg2.goto(URL + '#/home'); pg2.wait_for_selector('.tabbar .tab'); pg2.wait_for_timeout(4800)
    check(not sent and pg2.evaluate("RV.stats.configured()") is False, 'with no helper set, nothing is sent')
    pg2.goto(URL + '#/settings/about'); pg2.wait_for_timeout(300)
    check(pg2.locator('text=Share anonymous usage counts').count() == 0, 'and About shows no switch')
    b.close()
print('%d passed, %d failed' % (ok, bad))
sys.exit(1 if bad else 0)
