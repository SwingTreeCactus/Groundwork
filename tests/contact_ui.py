"""The contact page in three parts (v2.58): who (name, stage, address, Phone · Text · Directions, household notes, the
growth path), Next time, History, About; typing in place with Undo; Add phone; a passed date; archived said once; Not
Home and Record a visit pinned; no Edit button. Run: python3 tests/contact_ui.py [shots dir]"""
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
def shot(pg, n, full=True):
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, n + '.png'), full_page=full)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script("window.__RV_SURPRISE = 0; window.__RV_STARTER = 'off'; window.RV_NO_SW = true;")
    ctx.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"version":8,"sources":{},"layers":[]}'))
    ctx.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    ids = pg.evaluate("""() => { const S = RV.store, d = (n) => new Date(Date.now() - n * 864e5).toISOString();
      const m = S.addRv({ name: 'Maria Lopez', stage: 'return', address: '1418 Pine St, Stockton 95204', neighborhood: 'Lakeview', phone: '(209) 555-0142', notes: 'Lives with her mother. Two cats.', whatsNext: 'Psalm 37:29' });
      for (let i = 0; i < 6; i++) S.addEntry(m.id, 'visit', { text: 'An earlier visit, number ' + i + ', with a few words about it.' }, d(40 + i));
      S.addEntry(m.id, 'visit', { text: 'Left the Happy family tract.' }, d(20)); S.addEntry(m.id, 'nh', {}, d(13)); S.addEntry(m.id, 'visit', { text: 'Talked about Psalm 37.' }, d(1));
      S.updateRv(m.id, { snoozedUntil: RV.util.toDateStr(RV.util.addDays(new Date(), 3)), nextTime: '10:30', nextRemind: '30' });
      const p = S.addRv({ name: 'Diane Park', stage: 'yet', address: '1422 Pine St' });
      const a = S.addRv({ name: 'Ana Ruiz', stage: 'study', publication: 'Enjoy Life Forever!', nextStart: 'Lesson 4' });
      S.updateRv(a.id, { snoozedUntil: RV.util.toDateStr(RV.util.addDays(new Date(), -2)) });
      const t = S.addRv({ name: 'Tom Reyes', address: '90 Oak Ave' }); S.setStage(t.id, 'archived'); S.updateRv(t.id, { archiveReason: 'moved' });
      S.flush(); return { m: m.id, p: p.id, a: a.id, t: t.id }; }""")

    pg.goto(URL + '#/rv/' + ids['m']); pg.wait_for_selector('.nextcard')
    shot(pg, 'c1-rv')
    check(pg.locator('.topbar button[aria-label="Edit"]').count() == 0 and pg.locator('.topbar .plancal').count() == 0, 'no Edit button and no calendar icon in the top bar')
    check(pg.locator('.actrow button').all_inner_texts() == ['Phone', 'Text', 'Directions'], 'one action row: Phone · Text · Directions')
    check('Sat' in pg.locator('.nextcard .nxd').inner_text() or '10:30 AM' in pg.locator('.nextcard .nxd').inner_text(), 'Next time shows the day and time (%s)' % pg.locator('.nextcard .nxd').inner_text().replace('\n', ' '))
    check('30 minutes before' in pg.locator('.nextcard').inner_text() and 'Psalm 37:29' in pg.locator('.nextcard').inner_text(), 'with the reminder and the plan')
    check('Talked about Psalm 37.' in pg.locator('.tl li >> nth=0').inner_text() and pg.locator('.lastv').count() == 0, 'History leads with the last visit (no separate Last visit row)')
    check(pg.locator('.gprog').count() == 1 and pg.locator('.gbar').count() == 0, 'a plain progress bar, no growth card')
    check(pg.locator('.rvdock .nhsm').count() == 1 and pg.locator('.rvdock .btn.primary').inner_text().strip() == 'Record a visit', 'Not Home (small) and Record a visit stay pinned')
    dock = pg.locator('.rvdock').bounding_box()
    check(dock and dock['y'] + dock['height'] <= 844 - 50 and dock['height'] <= 72, 'the dock sits above the tabs, one line high (%d)' % dock['height'])
    # v2.61: compact: no bar above the name, street only, area in About, tabs away on scroll
    check(pg.locator('.whohead button[aria-label="Back"]').count() == 1 and pg.locator('.whohead button[aria-label="More actions"]').count() == 1, 'back and ⋯ sit beside the name')
    pg.wait_for_timeout(400); tb = pg.locator('.topbar').bounding_box()
    check(tb['y'] + tb['height'] <= 1, 'no bar above the name at the top (%s)' % tb)
    check(pg.locator('.gaddr').inner_text().strip() == '1418 Pine St', 'the address shows the street only (%s)' % pg.locator('.gaddr').inner_text().strip())
    ab = pg.evaluate("[...document.querySelectorAll('details.about .abrow')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim())")
    check(any(x.startswith('Area') and 'Lakeview' in x for x in ab), 'the area is in About (%s)' % ab[:3])
    for i in range(6): pg.mouse.wheel(0, 120); pg.wait_for_timeout(80)
    pg.wait_for_timeout(450)
    tb = pg.locator('.topbar').bounding_box()
    check(pg.evaluate("document.body.classList.contains('tabs-away')") and pg.locator('.tabbar').bounding_box()['y'] >= 844 - 2, 'scrolling down slides the tabs away')
    check(tb['y'] >= -1 and 'Maria Lopez' in pg.locator('.topbar').inner_text(), 'the slim bar with back and the name comes in once the name scrolls away')
    dock = pg.locator('.rvdock').bounding_box()
    check(dock['y'] + dock['height'] >= 844 - 4, 'the dock drops to the bottom edge')
    pg.mouse.wheel(0, -120); pg.wait_for_timeout(450)
    check(not pg.evaluate("document.body.classList.contains('tabs-away')"), 'any scroll up brings the tabs back')
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(400)
    # the address: the whole of it while editing
    pg.click('.gaddr'); pg.wait_for_selector('.inl input')
    check(pg.locator('.inl input').input_value() == '1418 Pine St, Stockton 95204', 'editing shows the whole address')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # the name, typed in place
    pg.click('.gperson'); pg.wait_for_selector('.inl.big input')
    shot(pg, 'c2-name', False)
    pg.fill('.inl input', 'Maria L. Lopez'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    check(pg.evaluate("(id) => RV.store.rvById(id).name", ids['m']) == 'Maria L. Lopez' and pg.locator('.gperson').inner_text() == 'Maria L. Lopez', 'tapping the name types it in place; Enter saves')
    pg.click('.toast button:has-text("Undo")'); pg.wait_for_timeout(300)
    check(pg.evaluate("(id) => RV.store.rvById(id).name", ids['m']) == 'Maria Lopez', 'Undo puts it back')
    pg.click('.gperson'); pg.wait_for_selector('.inl input'); pg.fill('.inl input', 'Nope'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    check(pg.evaluate("(id) => RV.store.rvById(id).name", ids['m']) == 'Maria Lopez', 'Escape cancels')
    # household notes, in place
    pg.click('button.household'); pg.wait_for_selector('.inl.multi textarea')
    pg.fill('.inl textarea', 'Lives with her mother.\nTwo cats.'); pg.click('.inlbar .link'); pg.wait_for_timeout(300)
    check(pg.evaluate("(id) => RV.store.rvById(id).notes", ids['m']) == 'Lives with her mother.\nTwo cats.', 'household notes edit in place; Done saves')
    # the address, with the area under it
    pg.click('.gaddr'); pg.wait_for_selector('.inl input')
    check(pg.locator('.inlx select').count() == 1 and pg.locator('.inlx button:has-text("Pin")').count() == 1, 'the address brings the area and Pin here')
    shot(pg, 'c3-address', False)
    pg.keyboard.press('Escape')
    # About
    pg.click('details.about summary'); pg.wait_for_timeout(200)
    rows = pg.locator('.abrow .abk').all_inner_texts()
    check(rows[:2] == ['Phone', 'How we met'] and 'Added' in rows and 'Tags' not in rows and 'Best days' not in rows, 'About: Phone, How we met … Added; no tags or best days (%s)' % rows)
    shot(pg, 'c4-about')
    pg.click('.abrow:has-text("Phone")'); pg.wait_for_selector('.abrow .inl input')
    pg.fill('.abrow .inl input', '(209) 555-0199'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    check(pg.evaluate("(id) => RV.store.rvById(id).phone", ids['m']) == '(209) 555-0199', 'the phone row edits in place')
    # ⋯
    pg.click('.whohead button[aria-label="More actions"]'); pg.wait_for_selector('.sheet .opt')
    acts = [x.split('\n')[0] for x in pg.locator('.sheet .opt').all_inner_texts()]
    check(acts == ['Archive…', 'Hand over…', 'Delete contact…'], '⋯ holds Archive, Hand over and Delete (%s)' % acts)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    # no phone: one Add phone button
    pg.goto(URL + '#/rv/' + ids['p']); pg.wait_for_selector('.nextcard')
    shot(pg, 'c5-potential')
    check(pg.locator('.actrow button').all_inner_texts() == ['Add phone', 'Directions'] and pg.locator('.addline:has-text("Household notes")').count() == 1, 'no phone: Add phone; no notes: + Household notes')
    pg.click('.actrow .addphone'); pg.wait_for_selector('.abrow .inl input')
    pg.fill('.abrow .inl input', '(209) 555-0100'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    check(pg.evaluate("(id) => RV.store.rvById(id).phone", ids['p']) == '(209) 555-0100' and pg.locator('.actrow button:has-text("Phone")').count() == 1, 'Add phone opens the Phone row in About; then Phone and Text appear')

    # a study whose date went by
    pg.goto(URL + '#/rv/' + ids['a']); pg.wait_for_selector('.nextcard')
    shot(pg, 'c6-study')
    nt = pg.locator('.nextcard').inner_text()
    check('NEXT STUDY' in nt.upper() and 'Was ' in nt and 'Reschedule' in nt and 'Enjoy Life Forever!' in nt and 'Next: Lesson 4' in nt and 'overdue' not in nt.lower(), 'Next study: "Was …" with Reschedule, the publication and lesson; never overdue')
    check(pg.locator('.rvdock .btn.primary').inner_text().strip() == 'Log study', 'the wide button says Log study')

    # archived: said once
    pg.goto(URL + '#/rv/' + ids['t']); pg.wait_for_selector('.archbar')
    shot(pg, 'c7-archived')
    check(pg.locator('.card.who').inner_text().count('Archived') == 0 and pg.locator('.archbar').count() == 1 and pg.locator('.archbar button:has-text("Restore")').count() == 1 and pg.locator('.rvdock').count() == 0 and pg.locator('.nextcard').count() == 0, 'archived: one banner with Restore; no Next time and no dock')
    check(not errs, 'no page errors %s' % errs[:3])
    b.close()
print('%d passed, %d failed' % (ok, bad))
sys.exit(1 if bad else 0)
