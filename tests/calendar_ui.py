"""The Calendar tab in the browser (v2.53): the update card and the setup question, the month (time, rings, plan,
follow-ups), the day sheets, recording time with wheels (sessions, overlaps, ring to dot), My schedule, the profile,
the study tally and its adjustment, the report (Copy, Sent, the warning when a sent month changes), the look back
and the service time reminder dates. Run: python3 tests/calendar_ui.py [shots dir]"""
import http.server, socketserver, threading, functools, json, time, sys, os
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
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=False)
INIT = "window.__RV_SURPRISE = 0; window.__RV_STARTER = 'off'; window.RV_NO_SW = true;"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(INIT)
    ctx.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"version":8,"sources":{},"layers":[]}'))
    ctx.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    check([t.split('\n')[0].strip() for t in pg.locator('.tab').all_inner_texts()] == ['Today', 'Contacts', 'My garden', 'Calendar'], 'four tabs, Calendar last')
    # people, visits on a few days, a study, a follow-up
    ids = pg.evaluate("""() => { const U = RV.util, d = (n, h) => { const x = U.addDays(U.startOfDay(new Date()), n); x.setHours(h || 10); return x.toISOString(); };
      const a = RV.store.addRv({ name: 'Maria Lopez', stage: 'initial', createdAt: d(-40), imported: true });
      const b = RV.store.addRv({ name: 'Ana Ruiz', stage: 'initial', createdAt: d(-40), imported: true });
      const c = RV.store.addRv({ name: 'Linda Park', stage: 'initial', createdAt: d(-40), imported: true, snoozedUntil: U.toDateStr(U.addDays(new Date(), 2)) });
      RV.store.addEntry(a.id, 'visit', { text: 'Talked about prayer' }, d(-2, 10));
      RV.store.addEntry(c.id, 'nh', {}, d(-2, 9));
      RV.store.addEntry(b.id, 'visit', { study: true, progress: 'Lesson 1', nextStart: 'Lesson 2' }, d(-1, 11));
      return { a: a.id, b: b.id, c: c.id, d2: U.toDateStr(U.addDays(new Date(), -2)), d1: U.toDateStr(U.addDays(new Date(), -1)), today: U.toDateStr(new Date()), fu: U.toDateStr(U.addDays(new Date(), 2)) }; }""")
    pg.evaluate("RV.store.flush()")
    # the update card (tests normally keep surprises off; this one asks for it)
    pg.evaluate("window.__RV_SVCCARD = 1; RV.calendar.maybeNews()")
    pg.wait_for_selector('.news')
    txt = pg.locator('.news').inner_text()
    check('Days you recorded visits are marked' in txt and 'month and year are on pace for' in txt and 'Your Bible studies are counted each month.' in txt, 'the update card says the three things')
    check([x.strip() for x in pg.locator('.news .nwq .btn').all_inner_texts()] == ['Regular pioneer', 'Continuous auxiliary', 'Publisher', 'Other goal'], 'four choices')
    shot(pg, '01-update-card')
    pg.click('.news .btn >> text=Regular pioneer'); pg.wait_for_selector('.cal .cbadge')
    check(pg.locator('.cbadge').inner_text().strip() == 'Regular pioneer' and '#/calendar' in pg.url, 'choosing opens the Calendar with the badge')
    check(pg.evaluate("RV.calendar.maybeNews()") is False, 'the card shows only once')
    pg.evaluate("window.__RV_SVCCARD = 0")
    # tracking starts now: the earlier days only ring because "since" is moved back for the test
    pg.evaluate("RV.service.saveSvc((v) => { v.since = RV.util.addDays(new Date(), -10).toISOString(); })"); pg.wait_for_timeout(200)
    shot(pg, '02-month')
    d2 = pg.locator('.cday[aria-label*="visits recorded, no time"]').count()
    check(d2 >= (1 if ids['d2'][:7] == ids['today'][:7] else 0), 'a day with visits and no time has a ring')
    chips = pg.locator('.cring .cchip').all_inner_texts()
    check(len(chips) == 2, 'the card lists both days with visits but no time (%s)' % chips)
    check(pg.locator('.cday .cfu').count() >= (1 if ids['fu'][:7] == ids['today'][:7] else 0), 'a follow-up shows as a small person')
    # the past day sheet
    pg.click('.cring .cchip >> nth=0'); pg.wait_for_selector('.daycard .timesheet .vw')
    dtxt = pg.locator('.daycard').inner_text()
    check('Maria Lopez' in dtxt and 'Linda Park' in dtxt and 'Not home' in dtxt and 'Record a visit' in dtxt and 'No service this day' in dtxt and pg.locator('.sheet').count() == 0, 'the day page lists the visits, Record a visit and No service this day')
    check('#/calendar/day/' + ids['d2'] in pg.url and pg.locator('.cmonth').count() == 0, 'v2.61: a day opens its own page, without the month')
    shot(pg, '03-day-sheet')
    pg.click('.topbar .dayarrows button[aria-label="Next day"]'); pg.wait_for_timeout(400)
    nxt = pg.evaluate("(d) => RV.util.toDateStr(RV.util.addDays(RV.util.parseDateStr(d), 1))", ids['d2'])
    check(pg.url.endswith('#/calendar/day/' + nxt), 'Next day moves to the following day')
    pg.click('.topbar button[aria-label="Back"]'); pg.wait_for_selector('.cmonth')
    check(pg.locator('.daycard').count() == 0, 'Back goes to the month (the arrows moved in place)')
    pg.click('.cday[data-day="%s"]' % ids['today']); pg.wait_for_selector('.daycard')
    check(pg.url.endswith('#/calendar/day/' + ids['today']) and 'Today' in pg.locator('.topbar').inner_text(), 'tapping a day in the month opens its page')
    shot(pg, '03b-day-tap')
    pg.goto(URL + '#/calendar'); pg.wait_for_selector('.cring')
    pg.click('.cring .cchip >> nth=0'); pg.wait_for_selector('.daycard .timesheet .vw'); pg.wait_for_timeout(300)
    check(pg.locator('.timesheet .scard').count() == 1 and pg.locator('.timesheet .vw').count() == 2, 'a new session opens with two wheels (hours, minutes)')
    # wheels: scroll the hours wheel to 2 h and the minutes to 30
    pg.evaluate("() => { const w = document.querySelectorAll('.timesheet .vw'); w[0].scrollTop = 2 * 34; w[0].dispatchEvent(new Event('scroll')); w[1].scrollTop = 2 * 34; w[1].dispatchEvent(new Event('scroll')); }")
    pg.wait_for_timeout(150)
    check('2 h 30 m' in pg.locator('.stotal').inner_text(), 'scrolling the wheels sets 2 h 30 m')
    # a second session in start-finish, overlapping nothing; then overlap
    pg.click('.timesheet .sadd'); pg.wait_for_timeout(100)
    pg.locator('.timesheet .scard >> nth=1').locator('.cseg >> nth=0').locator('button >> text=Start–finish').click(); pg.wait_for_timeout(150)
    check(pg.locator('.timesheet .scard >> nth=1').locator('.vw').count() == 3, 'start–finish has Start, Finish and Break wheels')
    pg.click('.timesheet .scard >> nth=0 >> .cseg >> nth=0 >> button >> text=Start–finish'); pg.wait_for_timeout(150)
    # session 1: 9:00 to 12:00 (start index 36, end 48); session 2: 11:30 to 13:00
    pg.evaluate("""() => { const c = document.querySelectorAll('.timesheet .scard'); const set = (w, i) => { w.scrollTop = i * 34; w.dispatchEvent(new Event('scroll')); };
      const w1 = c[0].querySelectorAll('.vw'), w2 = c[1].querySelectorAll('.vw'); set(w1[0], 36); set(w1[1], 48); set(w2[0], 46); set(w2[1], 52); }""")
    pg.wait_for_timeout(200)
    check(pg.locator('.sovl:not([hidden])').count() == 1 and 'Overlaps 11:30 AM–12:00 PM' in pg.locator('.sovl:not([hidden])').inner_text(), 'the later session says it overlaps')
    check('4 h' in pg.locator('.stotal').inner_text() and '30 m overlap counted once' in pg.locator('.stotal').inner_text(), 'the day total counts the overlap once (%s)' % pg.locator('.stotal').inner_text())
    shot(pg, '04-add-time')
    pg.click('.sovl .btn >> text=Fix'); pg.wait_for_timeout(150)
    check(pg.locator('.sovl:not([hidden])').count() == 0 and '4 h' in pg.locator('.stotal').inner_text(), 'Fix moves the start to where the first ends')
    pg.click('.timesheet .actions .btn.primary'); pg.wait_for_timeout(300)
    check(pg.evaluate("(d) => RV.service.times(d).length", ids['d2']) == 2 and pg.evaluate("(d) => RV.service.dayTotals(RV.service.times(d)).total", ids['d2']) == 240, 'saving keeps both sessions, 4 h in all')
    pg.wait_for_timeout(300); dt = pg.locator('.daycard').inner_text()
    check(pg.locator('.daycard .timesheet .vw').count() == 0 and 'Add session' in dt, 'the day page shows the saved sessions (%s)' % dt[:80].replace('\n', ' | '))
    pg.goto(URL + '#/calendar'); pg.wait_for_selector('.cmonth')
    check(pg.locator('.cring .cchip').count() == 1, 'the day drops off the card')
    if ids['d2'][:7] == ids['today'][:7]:
        check(pg.locator('.cdot.fillin').count() == 1, 'its ring fills into a dot')
    # No service this day on the other day
    pg.click('.cring .cchip'); pg.wait_for_selector('.daysheet')
    pg.click('.dclear'); pg.wait_for_timeout(300)
    pg.goto(URL + '#/calendar'); pg.wait_for_selector('.cmonth')
    check(pg.locator('.cring').count() == 0 and pg.evaluate("(d) => !!RV.service.svc().cleared[d]", ids['d1']), 'No service this day clears the day and the card goes')
    # pace and plan: My schedule
    pg.click('.cschedb'); pg.wait_for_selector('.csched')
    dow = pg.evaluate("new Date().getDay()")
    pg.locator('.csched .sday').nth((dow + 1) % 7).locator('.sadd').click(); pg.wait_for_selector('.timesheet .vw')
    pg.click('.timesheet .cseg button >> text=Every other week'); pg.wait_for_timeout(100)
    check(pg.locator('.wkchips:not([hidden]) .seg button').count() == 2, 'every other week asks which week it starts')
    pg.click('.timesheet .cseg button >> text=Every week')
    pg.click('.timesheet .scard .cseg button >> text=Total'); pg.wait_for_timeout(100)
    pg.evaluate("() => { const w = document.querySelectorAll('.timesheet .vw'); w[0].scrollTop = 3 * 34; w[0].dispatchEvent(new Event('scroll')); }"); pg.wait_for_timeout(100)
    pg.click('.timesheet .actions .btn.primary'); pg.wait_for_timeout(300)
    check('3 h' in pg.locator('.csched').inner_text() and 'every week' in pg.locator('.csched').inner_text() and 'h a month' in pg.locator('.csched').inner_text(), 'the schedule shows the session and about how much a month')
    shot(pg, '05-schedule')
    pg.goto(URL + '#/calendar'); pg.wait_for_selector('.cpace')
    check('On pace for' in pg.locator('.cpace').inner_text() and 'Goal 50 h' in pg.locator('.cpace').inner_text(), 'the pace card shows the pace and the goal')
    check(pg.locator('.cday .cplan').count() >= 1, 'planned hours show faintly on future days')
    # studies: Ana's first study, then one added by hand
    stxt = pg.locator('.cstudy').inner_text()
    check('Ana Ruiz' in stxt and '1st study' in stxt and pg.locator('.cstudy .cpm b').inner_text() == '1', 'the study tally: Ana, 1st study')
    pg.click('.cstudy .pm >> text=+'); pg.wait_for_timeout(200)
    check(pg.locator('.cstudy .cpm b').inner_text() == '2' and 'Includes 1 added by hand' in pg.locator('.cstudy').inner_text(), 'a study added by hand')
    # the profile sheet and edit page
    pg.click('.cbadge'); pg.wait_for_selector('.sheet .daysheet')
    check('50 h a month · 600 h a year' in pg.locator('.sheet .daysheet').inner_text(), 'the badge sheet shows the goal')
    pg.click('.sheet .daysheet .btn >> text=Edit'); pg.wait_for_selector('.cprof')
    check([x.strip().split('\n')[0] for x in pg.locator('.poptb b').all_inner_texts()] == ['Regular pioneer', 'Continuous auxiliary', 'Publisher', 'Other goal'], 'four profiles')
    pg.click('.poptb >> text=Publisher'); pg.wait_for_selector('.amonths')
    shot(pg, '06-profile')
    nxt = pg.evaluate("RV.service.addMonths(RV.service.ym(new Date()), 1)")
    pg.locator('.amonths .amo').nth(1).click(); pg.click('.cprof .btn.primary'); pg.wait_for_selector('.cal')
    check(pg.evaluate("(m) => RV.service.svc().aux[m]", nxt) == 30 and pg.locator('.cbadge').inner_text().strip() == 'Publisher', 'auxiliary next month on a Publisher base; this month is Publisher')
    check(pg.locator('.cpace').count() == 0 and pg.locator('.cschedb').count() == 0, 'a publisher without time tracking: no pace, no schedule')
    pg.goto(URL + '#/calendar/' + nxt); pg.wait_for_selector('.cbadge')
    check(pg.locator('.cbadge').inner_text().strip().startswith('Auxiliary'), 'the auxiliary month has its badge and keeps time')
    pg.evaluate("RV.service.setProfile({ kind: 'pioneer' })"); pg.goto(URL + '#/calendar'); pg.wait_for_selector('.cpace')
    # the report: last month gets a total, Copy and Sent; editing it after Sent warns and keeps a history line
    prev = pg.evaluate("RV.service.addMonths(RV.service.ym(new Date()), -1)")
    pg.evaluate("(m) => { RV.service.patchMonth(m, { adjMins: 62 * 60 + 20 }); }", prev); pg.wait_for_timeout(200)
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL[:-1])
    pg.click('.crep .btn >> text=Copy'); pg.wait_for_timeout(300)
    clip = pg.evaluate("navigator.clipboard.readText()")
    check(clip.startswith(pg.evaluate("(m) => RV.service.monthLabel(m)", prev) + ' report\nHours: 62'), 'Copy report puts the report text on the clipboard (%r)' % clip[:60])
    pg.check('.crep .sentbox input'); pg.wait_for_timeout(300)
    check(pg.evaluate("(m) => RV.service.monthRec(RV.service.data(), m).sent", prev) is True, 'ticking Sent marks the month')
    pg.goto(URL + '#/calendar/' + prev); pg.wait_for_selector('.cmonth')
    check(pg.locator('.cstamp').count() == 1, 'a sent month has its stamp')
    pg.locator('.cday:not(.blank)').nth(4).click(); pg.wait_for_selector('.daycard .timesheet .vw')
    pg.click('.timesheet .actions .btn.primary'); pg.wait_for_selector('.sheet >> text=report is marked sent')
    shot(pg, '07-sent-warning')
    pg.click('.sheet .btn >> text=Change anyway'); pg.wait_for_timeout(300)
    hist = pg.evaluate("(m) => RV.service.monthRec(RV.service.data(), m).history.map((x) => x.text)", prev)
    check(len(hist) == 2 and 'after the report was sent' in hist[-1] and '62 h' in hist[-1] and '63 h' in hist[-1], 'the change is written to the month history (%s)' % hist)
    # the look back when a month turns
    # (tracking must have started before last month, or there's nothing to look back on; "since" was 10 days ago,
    # which falls in this month after the 10th)
    pg.evaluate("(m) => { RV.service.setSent(m, false); RV.service.saveSvc((v) => { v.seenMonth = null; v.since = RV.util.addDays(new Date(), -45).toISOString(); }); }", prev)
    pg.goto(URL + '#/home'); pg.wait_for_selector('.home')
    pg.evaluate("window.__RV_SVCCARD = 1; RV.calendar.maybeLookBack()"); pg.wait_for_selector('.lookback')
    check('63 h' in pg.locator('.lbhero').inner_text() and 'Copy report' in pg.locator('.lookback').inner_text(), 'the look back shows last month with Copy report')
    shot(pg, '08-look-back')
    pg.click('.lookback .link >> text=Later')
    check(pg.evaluate("RV.calendar.maybeLookBack(), !!document.querySelector('.lookback')") is False, 'it shows once a month')
    pg.evaluate("window.__RV_SVCCARD = 0")
    # the reminder dates: today has a visit and no time, so tomorrow's date is sent (only with the switch on)
    pg.evaluate("(id) => RV.store.logNH(id)", ids['a']); pg.wait_for_timeout(100)
    tom = pg.evaluate("RV.util.toDateStr(RV.util.addDays(new Date(), 1))")
    check(tom in pg.evaluate("RV.service.remindDates(RV.service.data(), new Date())"), 'a day with visits and no time adds the next morning to the reminder dates')
    check(pg.evaluate("RV.reminders.dates({ fu: false, svc: false })") == [], 'nothing is sent with both reminders off')
    check(tom in pg.evaluate("RV.reminders.dates({ fu: false, svc: true })"), 'the service time switch sends that date')
    # the future day sheet: planned time and follow-ups, Plan a visit
    pg.goto(URL + '#/calendar'); pg.wait_for_selector('.cmonth')
    pg.evaluate("(d) => RV.calendar.daySheet(d)", ids['fu']); pg.wait_for_selector('.daycard:has-text("Scheduled")'); pg.wait_for_timeout(300)
    ftxt = pg.locator('.daycard').inner_text()
    check('scheduled' in ftxt.lower() and 'Linda Park' in ftxt and 'Schedule a visit' in ftxt, 'a future day lists who is scheduled and Schedule a visit')
    shot(pg, '09-future-day')
    # dark mode renders
    pg.keyboard.press('Escape')
    pg.evaluate("RV.store.saveSettings((s) => { s.theme = 'dark'; })"); pg.wait_for_timeout(200)
    shot(pg, '10-dark')
    check(not errs, 'no page errors (%s)' % errs[:2])
    b.close()
print('%d passed, %d failed' % (ok, bad))
sys.exit(1 if bad else 0)
