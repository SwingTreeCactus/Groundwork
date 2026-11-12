"""Swiping in the browser (v2.55): contact rows (Archive and Delete, a long swipe archives, a swipe right only
bounces, archived rows offer Restore), toasts (new look, swipe away, three at most), sheets pulled down to close,
Today's list (Take off), the timeline (Delete with Undo), the backup card, campaigns, the menu and the Calendar's
months. Run: python3 tests/swipe_ui.py [shots dir]"""
import http.server, socketserver, threading, functools, sys, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8796
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
def drag(pg, loc, dx, dy=0, at=0.6, steps=12):
    loc.evaluate("e => e.scrollIntoView({ block: 'center' })"); pg.wait_for_timeout(150)
    b = loc.bounding_box()
    x, y = b['x'] + b['width'] * at, b['y'] + b['height'] / 2
    pg.mouse.move(x, y); pg.mouse.down()
    for i in range(1, steps + 1): pg.mouse.move(x + dx * i / steps, y + dy * i / steps)
    pg.mouse.up(); pg.wait_for_timeout(450)
INIT = "window.__RV_STATS = ''; window.__RV_SURPRISE = 0; window.__RV_STARTER = 'off'; window.RV_NO_SW = true; try { localStorage.setItem('rvapp.rvsView', 'list'); } catch (e) {}"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(INIT)
    ctx.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"version":8,"sources":{},"layers":[]}'))
    ctx.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', body='[]'))
    pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    ids = pg.evaluate("""() => { const names = ['Ana Ruiz', 'Ben Carter', 'Grace Kim', 'Luis Ortega', 'Maria Lopez', 'Sam Patel'];
      const out = {}; names.forEach((n, i) => { const r = RV.store.addRv({ name: n, stage: 'initial', address: (100 + i) + ' Maple Ave', neighborhood: 'Lakeview' }); out[n.split(' ')[0]] = r.id; });
      RV.store.addEntry(out.Ana, 'visit', { text: 'First talk' }, new Date(Date.now() - 9 * 864e5).toISOString());
      RV.store.addEntry(out.Ana, 'visit', { text: 'Second talk' }, new Date(Date.now() - 2 * 864e5).toISOString());
      RV.store.addEntry(out.Ana, 'visit', { text: 'Third talk' }, new Date(Date.now() - 1 * 864e5).toISOString());
      RV.store.flush(); return out; }""")
    # ---------- contact rows ----------
    pg.goto(URL + '#/rvs'); pg.wait_for_selector('.azlist .sw')
    row = pg.locator('.azlist .sw').filter(has_text='Ben Carter')
    check(pg.locator('.azlist .sw').count() == 6, 'every contact row in the List can swipe')
    drag(pg, row.locator('.sw-face'), -110)
    acts = row.locator('.sw-act')
    check(acts.count() == 2 and acts.nth(0).inner_text().strip() == 'Archive' and acts.nth(1).inner_text().strip() == 'Delete', 'a short swipe shows Archive and Delete')
    check(row.locator('.sw-face').evaluate("e => e.style.transform") == 'translateX(-152px)', 'the row stays open at the width of its two buttons')
    shot(pg, '01-open')
    check(pg.url.endswith('#/rvs'), 'the drag didn’t open the contact')
    row.locator('.sw-act').nth(1).click(); pg.wait_for_selector('.delask')
    check('Delete Ben Carter?' in pg.locator('.overlay').inner_text() and pg.locator('.delask .btn >> text=Archive instead').count() == 1, 'Delete asks first, offering Archive instead')
    shot(pg, '02-delete-ask')
    pg.click('.delask .link >> text=Cancel'); pg.wait_for_timeout(300)
    check(pg.locator('.overlay').count() == 0 and pg.evaluate("(id) => !RV.store.rvById(id).deletedAt", ids['Ben']), 'Cancel keeps them')
    # long swipe archives
    row = pg.locator('.azlist .sw').filter(has_text='Grace Kim')
    drag(pg, row.locator('.sw-face'), -330, steps=20); pg.wait_for_timeout(300)
    check(pg.evaluate("(id) => RV.logic.isClosed(RV.store.S.settings, RV.store.rvById(id))", ids['Grace']), 'a long swipe archives at once')
    check('Grace Kim archived' in pg.locator('.toasts').inner_text() and pg.locator('.toast button >> text=Undo').count() == 1, 'with an Undo toast')
    shot(pg, '03-archived-toast')
    pg.click('.toast button >> text=Undo'); pg.wait_for_timeout(300)
    check(not pg.evaluate("(id) => RV.logic.isClosed(RV.store.S.settings, RV.store.rvById(id))", ids['Grace']), 'Undo brings them back')
    # swipe right: a bounce, nothing else
    row = pg.locator('.azlist .sw').filter(has_text='Luis Ortega')
    face = row.locator('.sw-face')
    b0 = face.bounding_box(); x, y = b0['x'] + 120, b0['y'] + b0['height'] / 2
    pg.mouse.move(x, y); pg.mouse.down()
    for i in range(1, 11): pg.mouse.move(x + 20 * i, y)
    moved = face.evaluate("e => e.style.transform")
    pg.mouse.up(); pg.wait_for_timeout(500)
    px = float(moved.replace('translateX(', '').replace('px)', '') or 0) if moved else 0
    check(0 < px <= 28, 'a swipe right gives only a little (%s px)' % round(px))
    check(face.evaluate("e => e.style.transform") == '' and pg.url.endswith('#/rvs') and pg.locator('.overlay').count() == 0, 'then springs back and does nothing')
    # a tap still opens the contact
    pg.locator('.azlist .sw').filter(has_text='Sam Patel').locator('.sw-face').click(); pg.wait_for_timeout(300)
    check(pg.url.endswith('#/rv/' + ids['Sam']), 'a tap still opens the contact')
    # archived rows: Restore and Delete
    pg.evaluate("(id) => RV.forms.quickArchive(id)", ids['Maria']); pg.wait_for_timeout(200)
    face_html = pg.evaluate("(id) => { const it = RV.store.itemFor(id); const el = RV.screens.rvRow(it); return Array.from(el.querySelectorAll('.sw-act')).map((b) => b.textContent); }", ids['Maria'])
    check(face_html == ['Restore', 'Delete'], 'an archived contact offers Restore and Delete (%s)' % face_html)
    # ---------- the timeline ----------
    pg.goto(URL + '#/rv/' + ids['Ana']); pg.wait_for_selector('.tl .sw')
    n0 = pg.evaluate("(id) => RV.store.itemFor(id).entries.filter((e) => e.type === 'visit').length", ids['Ana'])
    drag(pg, pg.locator('.tl .sw').first.locator('.sw-face'), -330, steps=20); pg.wait_for_timeout(300)
    n1 = pg.evaluate("(id) => RV.store.itemFor(id).entries.filter((e) => e.type === 'visit').length", ids['Ana'])
    check(n1 == n0 - 1 and 'deleted' in pg.locator('.toasts').inner_text(), 'a timeline entry swipes away, with Undo')
    pg.click('.toast button >> text=Undo'); pg.wait_for_timeout(300)
    check(pg.evaluate("(id) => RV.store.itemFor(id).entries.filter((e) => e.type === 'visit').length", ids['Ana']) == n0, 'Undo puts it back')
    # ---------- toasts ----------
    pg.evaluate("document.querySelectorAll('.toast').forEach((t) => t.remove())"); pg.wait_for_timeout(4600)
    for n in ['One', 'Two', 'Three']: pg.evaluate("(n) => { RV.ui.toast(n); }", n)
    pg.evaluate("void RV.ui.toast('Four', { actions: [{ label: 'Undo', fn: () => {} }] })"); pg.wait_for_timeout(300)
    check(pg.locator('.toast').count() == 3, 'three toasts at most (%s; overlays %d)' % (pg.evaluate("[...document.querySelectorAll('.toast')].map((t) => t.textContent)"), pg.locator('.overlay').count()))
    front = pg.locator('.toast').last
    check('Four' in front.inner_text() and pg.evaluate("getComputedStyle(document.querySelector('.toast:last-child')).backgroundColor") == 'rgb(31, 29, 26)', 'the newest is in front, in ink')
    shot(pg, '04-toasts')
    drag(pg, front.locator('.msg'), 160, at=0.4); pg.wait_for_timeout(300)
    check(pg.locator('.toast:not(.out)').count() == 2 and 'Four' not in pg.locator('.toast:not(.out)').last.inner_text(), 'swiping the front one sideways dismisses it')
    drag(pg, pg.locator('.toast:not(.out)').last.locator('.msg'), 0, 80, at=0.4); pg.wait_for_timeout(300)
    check(pg.locator('.toast:not(.out)').count() == 1, 'and so does swiping down')
    pg.evaluate("document.querySelectorAll('.toast').forEach((t) => t.remove())")
    check(pg.evaluate("(() => { RV.ui.toast('Couldn’t save.'); return !!document.querySelector('.toast:last-child .tico.bad'); })()"), 'a problem shows a warning mark, not a tick')
    pg.evaluate("document.querySelectorAll('.toast').forEach((t) => t.remove())")
    # ---------- sheets pull down ----------
    pg.evaluate("void RV.ui.sheet('A test sheet', () => RV.dom.h('div', { style: { height: '420px' } }, 'Hello'))"); pg.wait_for_selector('.overlay')
    drag(pg, pg.locator('.sheet .sheet-head h2'), 0, 220, at=0.5); pg.wait_for_timeout(300)
    check(pg.locator('.overlay').count() == 0, 'a sheet pulled down by its head closes')
    pg.evaluate("void RV.ui.sheet('A test sheet', () => RV.dom.h('div', { style: { height: '420px' } }, 'Hello'))"); pg.wait_for_selector('.overlay')
    drag(pg, pg.locator('.sheet .sheet-head h2'), 0, 50, at=0.5); pg.wait_for_timeout(300)
    check(pg.locator('.overlay').count() == 1 and pg.evaluate("document.querySelector('.sheet').style.transform") == '', 'a small pull springs back')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # ---------- Today: list and backup card ----------
    pg.evaluate("(id) => RV.todayList.add(id)", ids['Ana']); pg.evaluate("(id) => RV.todayList.add(id)", ids['Luis'])
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tlcard:not(.could) .sw')
    drag(pg, pg.locator('.tlcard:not(.could) .sw').filter(has_text='Luis Ortega').locator('.sw-face'), -330, at=0.7, steps=20); pg.wait_for_timeout(300)
    check(not pg.evaluate("(id) => RV.todayList.has(RV.store.items(), RV.store.S.settings, id)", ids['Luis']) and "taken off today's list" in pg.locator('.toasts').inner_text(), "Today's list: a swipe takes them off, with Undo")
    card = pg.locator('.bknudge')
    if card.count():
        drag(pg, card, 260, at=0.3); pg.wait_for_timeout(300)
        check(pg.locator('.bknudge').count() == 0 and pg.evaluate("!!localStorage.getItem('rvapp.bkLater')"), 'the backup card swipes away, the same as Not now')
    else:
        check(False, 'the backup card should show with 6 contacts and no backup')
    # ---------- campaigns ----------
    pg.evaluate("void RV.store.addLib('campaign', { title: 'Memorial', start: '2027-03-01', end: '2027-03-31' })")
    pg.goto(URL + '#/settings/campaigns'); pg.wait_for_selector('.list .sw')
    drag(pg, pg.locator('.list .sw').first.locator('.sw-face'), -100)
    pg.locator('.list .sw').first.locator('.sw-act').click(); pg.wait_for_selector('.overlay')
    check('Delete this campaign?' in pg.locator('.overlay').inner_text(), 'a campaign swipes to Delete, which asks first')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # ---------- the menu ----------
    pg.goto(URL + '#/home'); pg.wait_for_selector('.tabbar .tab')
    pg.click('button[aria-label="Menu"]'); pg.wait_for_selector('.drawer-panel')
    drag(pg, pg.locator('.drawer-head h2'), 150, at=0.3); pg.wait_for_timeout(300)
    check(pg.locator('.drawer').count() == 0, 'the menu swipes closed toward its edge')
    # ---------- the Calendar's months ----------
    pg.evaluate("RV.service.setProfile({ kind: 'pioneer' })")
    pg.goto(URL + '#/calendar'); pg.wait_for_selector('.cgrid')
    nxt = pg.evaluate("RV.service.addMonths(RV.service.ym(new Date()), 1)")
    drag(pg, pg.locator('.cgrid'), -140, at=0.7); pg.wait_for_timeout(300)
    check(pg.url.endswith('#/calendar/' + nxt), 'a swipe left on the month goes to the next month')
    drag(pg, pg.locator('.cgrid'), 140, at=0.3); pg.wait_for_timeout(300)
    check(pg.url.endswith('#/calendar/' + pg.evaluate("RV.service.ym(new Date())")), 'and right comes back')
    check(not errs, 'no page errors (%s)' % errs[:2])
    b.close()
print('%d passed, %d failed' % (ok, bad))
sys.exit(1 if bad else 0)
