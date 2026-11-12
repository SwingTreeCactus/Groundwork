"""The next visit in the browser (v2.57): the sheet from a contact's top bar (Date, Time, Repeat, Reminder, Clear),
the Next visit row in Record a visit, "Same time next week?" for a repeating one, Try again after a Not Home,
and the service worker's timed reminder with Tomorrow and Directions. Run: python3 tests/next_ui.py [shots dir]"""
import http.server, socketserver, threading, functools, json, sys, os
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
def shot(pg, n):
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, n + '.png'))
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script("window.__RV_SURPRISE = 0; window.__RV_STARTER = 'off'; window.RV_NO_SW = true;")
    ctx.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"version":8,"sources":{},"layers":[]}'))
    ctx.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    ids = pg.evaluate("""() => { const S = RV.store;
      const m = S.addRv({ name: 'Maria Lopez', stage: 'return', address: '1418 Pine St' });
      S.logVisit(m.id, { text: 'Talked about Psalm 37.' });
      const a = S.addRv({ name: 'Ana Ruiz', stage: 'study', publication: 'Enjoy Life Forever!' });
      S.updateRv(a.id, { snoozedUntil: RV.util.toDateStr(RV.util.addDays(new Date(), -1)), nextTime: '18:00', nextRepeat: 'w1' });
      const o = S.addRv({ name: 'Old Import', nextVisit: RV.util.toDateStr(RV.util.addDays(new Date(), 4)) });
      S.flush(); return { m: m.id, a: a.id, o: o.id }; }""")
    check(pg.evaluate("(id) => RV.store.rvById(id).snoozedUntil === RV.store.rvById(id).nextVisit", ids['o']), "an imported next visit date becomes the next visit")

    # the sheet from the top bar
    pg.goto(URL + '#/rv/' + ids['m']); pg.wait_for_timeout(700)
    pg.click('.nextcard .add1v:has-text("Schedule")'); pg.wait_for_selector('.nvsheet')
    check(pg.locator('.nvrow').count() >= 3 and 'Tomorrow' in pg.locator('.nvlist').inner_text(), 'the sheet opens on tomorrow with Date, Time, Repeat, Reminder')
    pg.click('.nvrow:has-text("Date")'); pg.wait_for_selector('.nvcal')
    later = pg.evaluate("RV.util.toDateStr(RV.util.addDays(new Date(), 3))")
    pg.evaluate("(ds) => { const b = [...document.querySelectorAll('.nvd')].find((x) => x.getAttribute('aria-label') === RV.util.fmtDate(ds)); if (b) b.click(); else { document.querySelector('.nvcalh button[aria-label=\"Next month\"]').click(); [...document.querySelectorAll('.nvd')].find((x) => x.getAttribute('aria-label') === RV.util.fmtDate(ds)).click(); } }", later)
    pg.click('.nvtime .switch'); pg.wait_for_selector('.nvwheel .vw')
    shot(pg, 'next-sheet-time')
    pg.click('.nvrow:has-text("Reminder")'); pg.wait_for_selector('.nvopts')
    labels = pg.locator('.nvopt').all_inner_texts()
    check(any('30 minutes before' in x for x in labels) and any('Day before' in x for x in labels), 'with a time, the reminder offers minutes before (%d choices)' % len(labels))
    pg.click('.nvopt:has-text("30 minutes before")')
    pg.click('.nvrow:has-text("Repeat")'); pg.click('.nvopt:has-text("Every week")')
    shot(pg, 'next-sheet')
    pg.click('.nvsheet .btn.primary'); pg.wait_for_timeout(400)
    rv = pg.evaluate("(id) => RV.store.rvById(id)", ids['m'])
    check(rv['snoozedUntil'] == later and rv['nextTime'] == '10:00' and rv['nextRemind'] == '30' and rv['nextRepeat'] == 'w1', 'Save stores the date, time, reminder and repeat (%s %s %s %s)' % (rv['snoozedUntil'], rv['nextTime'], rv['nextRemind'], rv['nextRepeat']))
    check(pg.evaluate("RV.reminders.atsToSend(RV.store.items(), new Date())") == [later + 'T09:30'], 'the timed reminder is half an hour before')
    pg.click('.nextcard button.nxw'); pg.wait_for_selector('.nvclear')
    pg.click('.nvclear'); pg.wait_for_timeout(300)
    check(pg.evaluate("(id) => RV.store.rvById(id).snoozedUntil", ids['m']) is None, 'Clear next visit clears it')

    # Record a visit: the Next visit row, scheduled from inside the form
    pg.click('.rvdock .btn.primary'); pg.wait_for_selector('.nvfield')
    check('Not scheduled' in pg.locator('.nvfield').inner_text() and pg.locator('text=Follow up on').count() == 0, 'Record a visit has a Next visit row (no Follow up on)')
    pg.click('.nvfield'); pg.wait_for_selector('.nvsheet')
    pg.click('.nvsheet .btn.primary'); pg.wait_for_timeout(300)
    check('Tomorrow' in pg.locator('.nvfield').inner_text(), 'the row shows what was picked')
    pg.fill('textarea[aria-label="What did you discuss?"], .note-field textarea', 'Left the tract.')
    pg.click('button[type=submit]:has-text("Save visit")'); pg.wait_for_timeout(600)
    pg.evaluate("document.querySelectorAll('.grow-ov, .evo-ov').forEach((x) => x.click())"); pg.wait_for_timeout(300)
    tom = pg.evaluate("RV.util.toDateStr(RV.util.addDays(new Date(), 1))")
    check(pg.evaluate("(id) => RV.store.rvById(id).snoozedUntil", ids['m']) == tom, 'saving the visit sets the next visit')

    # a repeating study asks first
    pg.goto(URL + '#/rv/' + ids['a']); pg.wait_for_timeout(700)
    pg.click('.rvdock .btn.primary'); pg.wait_for_selector('.nvask')
    week = pg.evaluate("RV.util.toDateStr(RV.util.addDays(RV.util.parseDateStr(RV.util.toDateStr(RV.util.addDays(new Date(), -1))), 7))")
    check('Same time next week?' in pg.locator('.nvask').inner_text() and 'Not scheduled' in pg.locator('.nvfield').inner_text(), 'a weekly study asks "Same time next week?" and sets nothing yet')
    shot(pg, 'next-ask')
    pg.click('.nvask .btn:has-text("Yes")')
    check(pg.locator('.nvask').is_hidden() and '6:00 PM' in pg.locator('.nvfield').inner_text(), 'Yes fills in the same time a week on')
    pg.click('.sheet .actions .btn:has-text("Cancel")'); pg.wait_for_timeout(300)
    check(pg.evaluate("(id) => RV.store.rvById(id).nextRepeat", ids['a']) == 'w1', 'Cancel leaves it as it was')

    # Not Home: Try again
    pg.goto(URL + '#/rv/' + ids['m']); pg.wait_for_timeout(700)
    pg.evaluate("(id) => RV.store.updateRv(id, { snoozedUntil: null })", ids['m'])
    pg.evaluate("(id) => RV.ui.doNotHome(id)", ids['m']); pg.wait_for_timeout(300)
    btn = pg.locator('.toast button:has-text("Try again")')
    check(btn.count() == 1, 'the Not Home message offers Try again (%s)' % (btn.first.inner_text() if btn.count() else ''))
    if btn.count(): btn.first.click(); pg.wait_for_timeout(300)
    check(pg.evaluate("(id) => !!RV.store.rvById(id).snoozedUntil", ids['m']), 'Try again sets the next visit')

    # passed: the date went by with no visit
    pg.evaluate("(id) => RV.store.updateRv(id, { snoozedUntil: RV.util.toDateStr(RV.util.addDays(new Date(), -3)) })", ids['a'])
    st = pg.evaluate("(id) => { const it = RV.store.itemFor(id); return RV.next.of(it.rv, it.entries, new Date()).state; }", ids['a'])
    check(st == 'passed', 'a date gone by with no visit since reads as passed, not overdue (%s)' % st)
    check(not errs, 'no page errors %s' % errs[:3])
    b.close()
print('%d passed, %d failed' % (ok, bad))
sys.exit(1 if bad else 0)
