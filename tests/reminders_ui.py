"""Follow-up reminders in the browser (v2.52): the Notifications page, what is sent to the helper (dates, time,
time zone, an anonymous ID; never names), syncing after a change, and the service worker writing the names
when a push arrives. Run: python3 tests/reminders_ui.py"""
import http.server, socketserver, threading, functools, json, time, sys, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8793
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
VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
INIT = """window.__RV_STATS = ''; window.__RV_SURPRISE = 0; window.__RV_STARTER = 'off'; window.__RV_REMINDERS = 'https://rem.test'; window.__RV_VAPID = '%s';
  const fakeSub = { endpoint: 'https://push.example.com/send/xyz', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } }; }, unsubscribe: async () => { window.__unsub = true; return true; } };
  let has = false;
  if (window.PushManager) { PushManager.prototype.getSubscription = async function () { return has ? fakeSub : null; }; PushManager.prototype.subscribe = async function (o) { window.__subOpts = o; has = true; return fakeSub; }; }
""" % VAPID
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.grant_permissions(['notifications'], origin=URL[:-1])
    ctx.add_init_script(INIT)
    posts = []
    def helper(route):
        r = route.request
        if r.method == 'OPTIONS': return route.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST'})
        posts.append((r.url.split('rem.test')[1], json.loads(r.post_data or '{}')))
        route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body='{"ok":true}')
    ctx.route('https://rem.test/**', helper)
    ctx.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"version":8,"sources":{},"layers":[]}'))
    ctx.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    pg.evaluate("navigator.serviceWorker.ready")
    ids = pg.evaluate("""() => { const t = RV.util.toDateStr(new Date()), later = RV.util.toDateStr(RV.util.addDays(new Date(), 3));
      const a = RV.store.addRv({ name: 'Maria Lopez', stage: 'initial', snoozedUntil: t });
      const b = RV.store.addRv({ name: 'James Carter', stage: 'initial', snoozedUntil: later });
      RV.store.addRv({ name: 'Linda Nguyen', stage: 'initial' });
      return { a: a.id, b: b.id, t, later }; }""")
    pg.evaluate("RV.store.flush()")
    pg.goto(URL + '#/settings/notify'); pg.wait_for_selector('.switchrow')
    check(pg.locator('text=Follow-up reminders').count() == 1 and pg.locator('input[type=time]').input_value() == '08:00', 'the Notifications page: reminders off, 8:00')
    check('Names and notes stay on this phone' in pg.locator('.view').inner_text(), 'it says what is sent and what is not')
    pg.click('.switch'); pg.wait_for_timeout(int(1.2*1000))
    sub = [x for x in posts if x[0] == '/subscribe']
    check(len(sub) == 1 and pg.evaluate("RV.reminders.state().on") is True, 'turning on subscribes and sends once')
    body = sub[0][1] if sub else {}
    check(body.get('dates') == [ids['t'], ids['later']] and body.get('time') == '08:00' and body.get('tz') and len(body.get('id', '')) == 32, 'it sends the follow-up dates, the time, the time zone and an anonymous ID (%s)' % body.get('dates'))
    check('Maria' not in json.dumps(body) and 'James' not in json.dumps(body), 'never a name')
    check(pg.evaluate("window.__subOpts && window.__subOpts.userVisibleOnly === true && window.__subOpts.applicationServerKey.length === 65"), 'the subscription uses the public VAPID key')
    pg.fill('input[type=time]', '07:15'); pg.locator('input[type=time]').dispatch_event('change'); pg.wait_for_timeout(int(0.8*1000))
    check(posts[-1][0] == '/subscribe' and posts[-1][1]['time'] == '07:15', 'changing the time sends it')
    n = len(posts)
    pg.evaluate("(id) => RV.store.logNH(id)", ids['a']); pg.wait_for_timeout(int(5*1000))
    check(len(posts) > n and posts[-1][1]['dates'] == [ids['later']], "a Not Home for today's only follow-up takes today off, a few seconds later (%s)" % (posts[-1][1].get('dates') if len(posts) > n else 'nothing sent'))
    # a push arrives: the service worker writes the names from the phone's own records
    pg.evaluate("(id) => RV.store.updateRv(id, { snoozedUntil: RV.util.toDateStr(new Date()) })", ids['b']); pg.evaluate("RV.store.flush()"); pg.wait_for_timeout(int(0.5*1000))
    cdp = ctx.new_cdp_session(pg)
    regs = {}
    cdp.on('ServiceWorker.workerRegistrationUpdated', lambda e: [regs.__setitem__(r['scopeURL'], r['registrationId']) for r in e['registrations']])
    cdp.send("ServiceWorker.enable"); pg.wait_for_timeout(int(0.8*1000))
    rid = regs.get(URL)
    check(rid is not None, 'the service worker is registered')
    sw = ctx.service_workers[0] if ctx.service_workers else None
    if rid and sw:
        # headless Chromium can't show notifications, so the test catches what the service worker would show
        sw.evaluate("() => { self.registration.showNotification = (t, o) => { self.__shown = [t, o.body, o.data && o.data.url]; return Promise.resolve(); }; }")
        cdp.send('ServiceWorker.deliverPushMessage', {'origin': URL[:-1], 'registrationId': rid, 'data': '{"t":"followup"}'}); pg.wait_for_timeout(1500)
        shown = sw.evaluate("() => self.__shown || null")
        check(shown and shown[:2] == ['Follow-up today', 'James Carter'] and shown[2].endswith('#/home'), 'the push shows "Follow-up today: James Carter" (Maria already had a Not Home today), opening Today (%s)' % shown)
        # v2.54.1: August ticked Sent yesterday: the year in review joins the push, once
        aug = pg.evaluate("(() => { const V = RV.service, s0 = V.yearStart(V.ym(new Date())); const y = V.addMonths(s0, -12); const m = V.addMonths(y, 11); const d = new Date(); d.setDate(d.getDate() - 1); V.patchMonth(m, { sent: true, sentAt: d.toISOString() }); V.patchMonth(s0, { sent: false }); RV.store.flush(); return [y, V.yearLabel(y)]; })()")
        pg.wait_for_timeout(600)
        check(pg.evaluate("RV.service.reviewPushDate(RV.service.data(), new Date())") == pg.evaluate("RV.util.toDateStr(new Date())") and pg.evaluate("RV.reminders.dates(RV.reminders.state())").count(pg.evaluate("RV.util.toDateStr(new Date())")) == 1, 'the review’s morning is among the dates sent')
        cdp.send('ServiceWorker.deliverPushMessage', {'origin': URL[:-1], 'registrationId': rid, 'data': '{}'}); pg.wait_for_timeout(1500)
        shown = sw.evaluate("() => self.__shown || null")
        check(shown and shown[1] == 'James Carter · Your %s year in review is ready.' % aug[1], 'with a follow-up, the review is added to the push (%s)' % shown)
        pg.evaluate("(id) => RV.store.updateRv(id, { snoozedUntil: null })", ids['b']); pg.evaluate("RV.store.flush()"); pg.wait_for_timeout(500)
        cdp.send('ServiceWorker.deliverPushMessage', {'origin': URL[:-1], 'registrationId': rid, 'data': '{}'}); pg.wait_for_timeout(1500)
        shown = sw.evaluate("() => self.__shown || null")
        check(shown and shown[:2] == ['Groundwork', 'Your %s year in review is ready.' % aug[1]] and shown[2].endswith('#/calendar/review/' + aug[0]), 'alone it opens the review (%s)' % shown)
        pg.evaluate("(y) => RV.service.markReview(y, 'watched')", aug[0]); pg.evaluate("RV.store.flush()"); pg.wait_for_timeout(500)
        sw.evaluate("() => { self.__shown = null; }")
        cdp.send('ServiceWorker.deliverPushMessage', {'origin': URL[:-1], 'registrationId': rid, 'data': '{}'}); pg.wait_for_timeout(1500)
        shown = sw.evaluate("() => self.__shown || null")
        check(shown and 'year in review' not in shown[1], 'once watched, it isn’t mentioned')
    pg.goto(URL + '#/settings/notify'); pg.wait_for_selector('.switch')
    pg.click('.switch'); pg.wait_for_timeout(int(0.8*1000))
    check(pg.evaluate("RV.reminders.state().on") is False and posts[-1][0] == '/unsubscribe' and pg.evaluate("window.__unsub === true"), 'turning off unsubscribes and tells the helper')
    check(not errs, 'no page errors %s' % errs)
    b.close()
print(f'{ok} passed, {bad} failed')
sys.exit(1 if bad else 0)
