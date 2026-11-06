"""The service year in the browser (v2.54): the year view (folded summary, ring, month bars, the remembered fold),
a month before Groundwork on Hours and Credit wheels (stored as the month's total, the Sent warning), and the
year in review (cards with no names, tapping through, Share as an image, the music button, shown once).
Run: python3 tests/year_ui.py [shots dir]"""
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
def shot(pg, name):
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=False)
INIT = "window.__RV_SURPRISE = 0; window.__RV_STARTER = 'off'; window.RV_NO_SW = true;"
audio_hits = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(INIT)
    ctx.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"version":8,"sources":{},"layers":[]}'))
    ctx.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    def audio(r):
        audio_hits.append(r.request.url); r.continue_()
    ctx.route('**/audio/*.m4a', audio)
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    info = pg.evaluate("""() => { const V = RV.service, U = RV.util, cur = V.ym(new Date()), s0 = V.yearStart(cur), prev = V.addMonths(s0, -12);
      V.setProfile({ kind: 'pioneer' });
      V.saveSvc((v) => { v.since = new Date(+prev.slice(0, 4), 9, 1).toISOString(); v.seenMonth = cur; v.pattern = { 6: [{ mode: 'total', mins: 240 }] }; });
      // last service year: a few people, Saturdays out, studies, time
      const at = (m, d) => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, d, 10).toISOString();
      const z = RV.store.addRv({ name: 'Zelda Secretname', stage: 'initial', neighborhood: 'Lakeview', createdAt: at(V.addMonths(prev, 1), 2) });
      const q = RV.store.addRv({ name: 'Quentin Hiddenname', stage: 'initial', neighborhood: 'Lakeview', createdAt: at(V.addMonths(prev, 1), 2) });
      for (let i = 0; i < 6; i++) { const m = V.addMonths(prev, 1 + i); const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1); while (d.getDay() !== 6) d.setDate(d.getDate() + 1); d.setHours(10);
        RV.store.addEntry(i % 2 ? z.id : q.id, 'visit', { text: 'Talked', study: i > 3 }, d.toISOString()); }
      for (let i = 0; i < 12; i++) V.patchMonth(V.addMonths(prev, i), { adjMins: 52 * 60 });
      return { cur, s0, prev, label: V.yearLabel(s0), prevLabel: V.yearLabel(prev) }; }""")
    pg.evaluate("RV.store.flush()")
    pg.goto(URL + '#/calendar'); pg.wait_for_selector('.cyear')
    # the year view, folded
    check(pg.locator('.cyear').get_attribute('open') is None, 'the service year starts folded')
    check('null' not in pg.locator('.cal').inner_text(), 'no stray “null” where a card is missing')
    check(('Service year ' + info['label']) in pg.locator('.cyear summary').inner_text(), 'its summary names the service year')
    pg.click('.cyear summary'); pg.wait_for_timeout(200)
    check(pg.locator('.cyear .yring').count() == 1 and pg.locator('.cyear .yrc').inner_text().replace('\n', ' ').endswith('of 600'), 'unfolded: the ring with “of 600”')
    check(pg.locator('.cyear .ycol').count() == 12 and [x.strip() for x in pg.locator('.cyear .yml').all_inner_texts()][:2] == ['Sep', 'Oct'], 'twelve month bars, September first')
    check(pg.locator('.cyear .ycol .pl').count() >= 1, 'the months ahead show My schedule')
    check('Tap a month to open it.' in pg.locator('.cyear .ynote').inner_text(), 'the one line about tapping a month')
    check(pg.locator('.cyear .yrev').count() == 1 and info['prevLabel'] in pg.locator('.cyear .yrev').inner_text(), 'last year’s review can be opened from the year view')
    shot(pg, '01-year-view')
    pg.reload(); pg.wait_for_selector('.cyear')
    check(pg.locator('.cyear').get_attribute('open') is not None, 'the fold is remembered')
    # a month before Groundwork: wheels for its total
    first = info['s0']
    if first < info['cur']:
        pg.locator('.cyear .ycol').nth(0).click(); pg.wait_for_selector('.pastm')
        check(pg.locator('.pastm .vw').count() == 2 and 'No days recorded in Groundwork' in pg.locator('.pastm').inner_text(), 'a month with no days opens on Hours and Credit wheels')
        check(pg.locator('.pastm .vw').nth(0).locator('.vwi').count() == 151, 'the wheels go to 150 h')
        pg.evaluate("() => { const w = document.querySelector('.pastm .vw'); w.scrollTop = 60 * 34; w.dispatchEvent(new Event('scroll')); }"); pg.wait_for_timeout(150)
        shot(pg, '02-past-month')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check(pg.evaluate("(m) => RV.service.monthRec(RV.service.data(), m).adjMins", first) == 3600, 'closing keeps 60 h as the month’s total')
        check(pg.locator('.cyear .ycol').nth(0).locator('.yv').inner_text().strip() == '60', 'the bar shows 60')
        pg.evaluate("(m) => RV.service.setSent(m, true)", first); pg.wait_for_timeout(100)
        pg.locator('.cyear .ycol').nth(0).click(); pg.wait_for_selector('.pastm')
        pg.evaluate("() => { const w = document.querySelector('.pastm .vw'); w.scrollTop = 61 * 34; w.dispatchEvent(new Event('scroll')); }"); pg.wait_for_timeout(150)
        pg.keyboard.press('Escape'); pg.wait_for_selector('.sheet >> text=report is marked sent')
        pg.click('.sheet .btn >> text=Change anyway'); pg.wait_for_timeout(300)
        hist = pg.evaluate("(m) => RV.service.monthRec(RV.service.data(), m).history.map((x) => x.text)", first)
        check(pg.evaluate("(m) => RV.service.monthRec(RV.service.data(), m).adjMins", first) == 3660 and 'after the report was sent' in hist[-1], 'a sent month asks first and keeps a history line')
    else:
        check(True, 'September: no earlier month in this year to fill in (skipped)')
    pg.locator('.cyear .ycol').nth(11).click(); pg.wait_for_timeout(200)
    check(pg.url.endswith('#/calendar/' + pg.evaluate("(s) => RV.service.addMonths(s, 11)", info['s0'])), 'a month ahead opens the month')
    # the year in review
    pg.goto(URL + '#/calendar/review/' + info['prev']); pg.wait_for_selector('.yr')
    check(pg.url.endswith('#/calendar'), 'the review link goes back to the Calendar address')
    n = pg.locator('.yrsegs span').count()
    seen = []
    for i in range(n):
        seen.append(pg.locator('.yr').inner_text())
        if SHOTS: pg.wait_for_timeout(600); shot(pg, '03-review-%d' % i)
        if i < n - 1: pg.mouse.click(300, 420); pg.wait_for_timeout(120)
    allt = '\n'.join(seen)
    check(('Your ' + info['prevLabel'] + ' service year') in seen[0], 'the opening card')
    check('You gave' in allt and '624' in allt and 'full days, spent on other people' in allt, 'the hours card (12 × 52 h)')
    check('600 hours. You did it.' in allt, 'the goal appears because it was reached')
    check('Saturdays were your thing' in allt and 'You went out on' in allt, 'days out and the favourite weekday')
    check('You talked with' in allt and 'You studied with' in allt, 'people and studies')
    check('Lakeview saw you most' in allt, 'the area card')
    check('Zelda' not in allt and 'Quentin' not in allt, 'no names anywhere')
    check('Every hour counted.' in seen[-1] and pg.locator('.yrend .yrshare').count() == 1 and pg.locator('.yrend .yrdone').count() == 1, 'the close card with Share and Done')
    shot(pg, '04-review-close')
    size = pg.evaluate("async (s0) => { const R = RV.service.yearReview(RV.service.data(), s0); const c = RV.review.cards(R)[1]; const b = await RV.review.drawCard(c, R); return b ? b.size : 0; }", info['prev'])
    check(size > 20000, 'Share draws the card as an image (%d bytes)' % size)
    pg.mouse.click(40, 420); pg.wait_for_timeout(150)
    check(pg.locator('.yrsegs span.on').count() == n - 1, 'a tap on the left goes back a card')
    # the music: silent until the speaker is tapped; the track is fetched only then
    check(not audio_hits and pg.locator('.yrbtn[aria-label="Music"]').get_attribute('aria-pressed') == 'false', 'the music starts off and nothing is fetched')
    pg.click('.yrbtn[aria-label="Music"]'); pg.wait_for_timeout(1500)
    check(len(audio_hits) == 1, 'turning it on fetches the track once')
    st = pg.locator('.yrbtn[aria-label="Music"]').get_attribute('aria-pressed')
    toasts = pg.locator('.toasts').inner_text() if pg.locator('.toasts').count() else ''
    check(st == 'true' or 'Couldn’t play' in toasts, 'it plays, or says it couldn’t (this browser may lack AAC)')
    cached = pg.evaluate("caches.open('gw-audio').then((c) => c.match('audio/year-review-they-say.m4a')).then((r) => !!r)")
    check(cached, 'the track is kept in its own cache')
    pg.click('.yrbtn[aria-label="Close"]'); pg.wait_for_timeout(400)
    check(pg.locator('.yr').count() == 0, 'closing leaves the review')
    # shown once on the first open after the year ends
    pg.evaluate("RV.service.saveSvc((v) => { v.reviewSeen = null; }); window.__RV_SVCCARD = 1"); pg.wait_for_timeout(100)
    check(pg.evaluate("RV.review.maybe()") is True and pg.locator('.yr').count() == 1, 'the review shows by itself after the service year ends')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    check(pg.evaluate("RV.review.maybe()") is False, 'and only once')
    pg.evaluate("window.__RV_SVCCARD = 0")
    # a publisher without time: no year view
    pg.evaluate("RV.service.setProfile({ kind: 'publisher', track: false })"); pg.goto(URL + '#/calendar'); pg.wait_for_selector('.cmonth')
    check(pg.locator('.cyear').count() == 0, 'a publisher without time has no year view')
    pg.evaluate("RV.service.setProfile({ kind: 'caux' })"); pg.goto(URL + '#/calendar'); pg.wait_for_selector('.cyear')
    check(pg.locator('.cyear .yring').count() == 0 and pg.locator('.cyear .cbig').count() == 1, 'continuous auxiliary: total and bars, no ring')
    pg.evaluate("RV.store.saveSettings((s) => { s.theme = 'dark'; }); RV.service.setProfile({ kind: 'pioneer' })"); pg.goto(URL + '#/calendar'); pg.wait_for_selector('.cyear .yring')
    shot(pg, '05-year-dark')
    check(not errs, 'no page errors (%s)' % errs[:2])
    b.close()
print('%d passed, %d failed' % (ok, bad))
sys.exit(1 if bad else 0)
