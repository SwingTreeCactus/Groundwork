"""Area shapes (v2.50): Edit areas on the Contacts map, drawing by tapping and with the crosshair, snapping,
trimming, changing a shape, naming, sorting contacts in, renames carrying the shape, and auto-assigning.
Run: python3 -I tests/areas_ui.py . <screenshot folder>"""
import http.server, socketserver, threading, functools, sys, json, time
from playwright.sync_api import sync_playwright
ROOT, OUT = sys.argv[1], sys.argv[2]; PORT = 8793
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
s = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT)); threading.Thread(target=s.serve_forever, daemon=True).start()
ok = 0; bad = 0
def check(c, label):
    global ok, bad
    print(('  ok   ' if c else '  FAIL ') + label)
    if c: ok += 1
    else: bad += 1
import os; os.makedirs(OUT, exist_ok=True)
H = {'Access-Control-Allow-Origin': '*'}
STYLE = json.dumps({'version': 8, 'sources': {}, 'layers': [{'id': 'background', 'type': 'background', 'paint': {'background-color': '#ffffff'}}]})
with sync_playwright() as p:
    b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, service_workers='block')
    c.add_init_script('window.__RV_SURPRISE = 0; window.__RV_STARTER = "off"')
    c.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', headers=H, body=STYLE))
    c.route('https://nominatim.openstreetmap.org/search**', lambda r: r.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps([{'lat': '37.968', 'lon': '-121.307'}])))
    c.route('https://nominatim.openstreetmap.org/reverse**', lambda r: r.fulfill(status=200, content_type='application/json', headers=H, body='{}'))
    pg = c.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    base = f'http://127.0.0.1:{PORT}/'
    ev = pg.evaluate
    pg.goto(base + '#/home'); pg.wait_for_selector('.tabbar .tab')
    ev("""() => {
      const ST = RV.store;
      ST.saveSettings(s => { s.lists.neighborhoods = ['Oak Park', 'Lakeview']; s.areaShapes = [{ id: 'lv', area: 'Lakeview', pts: [[-121.300, 37.960], [-121.290, 37.960], [-121.290, 37.970], [-121.300, 37.970]] }]; });
      window.__ids = {
        a: ST.addRv({ name: 'Ana Ruiz', stage: 'initial', geo: { lat: 37.965, lng: -121.305 } }).id,
        b: ST.addRv({ name: 'Ben Lee', stage: 'initial', neighborhood: 'Lakeview', geo: { lat: 37.966, lng: -121.308 } }).id,
        d: ST.addRv({ name: 'Dee Walker', stage: 'initial', neighborhood: 'Oak Park' }).id,
        e: ST.addRv({ name: 'Eli Grant', stage: 'initial', neighborhood: 'Lakeview', geo: { lat: 37.965, lng: -121.295 } }).id,
      };
    }""")
    ev("localStorage.setItem('rvapp.rvsView', 'map')")
    pg.goto(base + '#/rvs'); pg.wait_for_selector('.gmap')
    pg.wait_for_function("document.querySelector('.gmap').gmapMap && document.querySelector('.gmap').gmapMap() && document.querySelector('.gmap').gmapMap().loaded()", timeout=20000)
    check(pg.locator('.gmap-areas').inner_text().strip() == 'Edit areas', 'the Contacts map has an Edit areas button')
    check(ev("!document.querySelector('.gmap').gmapMap().getLayer('ae-areas-fill')"), 'shapes do not show on the Contacts map')
    ev("document.querySelector('.gmap').gmapMap().jumpTo({ center: [-121.302, 37.965], zoom: 14 })"); time.sleep(0.3)
    pg.click('.gmap-areas'); pg.wait_for_selector('.aedit')
    pg.wait_for_function("document.querySelector('.aedit').aeditApi.map() && document.querySelector('.aedit').aeditApi.map().getSource('ae-areas')", timeout=20000)
    api = "document.querySelector('.aedit').aeditApi"
    check(pg.locator('.ae-head h1').inner_text() == 'Edit areas' and pg.locator('.ae-head button:has-text("Done")').count() == 1, 'the editor opens full screen: Edit areas, Done')
    rows = pg.locator('.ae-row').all_inner_texts()
    check(any('Lakeview' in r and '2 people' in r and 'no shape' not in r for r in rows) and any('Oak Park' in r and 'no shape' in r for r in rows), 'areas listed, with and without a shape (%s)' % rows)
    check('null' not in pg.locator('.ae-panel').inner_text(), 'nothing stray in the panel')
    check(pg.locator('.ae-label:has-text("Lakeview")').count() == 1 and ev(api + ".map().getSource('ae-areas').serialize().data.features.length") == 1, 'Lakeview’s shape shows, with its name')
    pg.screenshot(path=f'{OUT}/a1-list.png')

    # ---- draw by tapping ----
    pg.click('.ae-new'); pg.wait_for_selector('.ae-how')
    check(pg.locator('.ae-how button[aria-pressed="true"]').inner_text() == 'Tap' and pg.locator('.ae-cross').is_hidden(), 'New area: Tap is the default, no crosshair')
    ev(api + ".map().jumpTo({ center: [-121.302, 37.964], zoom: 13 })"); time.sleep(0.3)
    def tap(lng, lat, dx=0, dy=0):
        pt = ev(f"(() => {{ const m = {api}.map(), q = m.project([{lng}, {lat}]), r = m.getCanvas().getBoundingClientRect(); return [r.left + q.x, r.top + q.y]; }})()")
        pg.mouse.click(pt[0] + dx, pt[1] + dy); time.sleep(0.15)
    tap(-121.312, 37.970)
    tap(-121.300, 37.970, 6, -5)  # near Lakeview's corner: snaps onto it
    d = ev(api + "._draft()")
    check(len(d['pts']) == 2 and d['pts'][1] == [-121.3, 37.97] and d['snaps'][1], 'a corner tapped near a neighbour’s corner snaps exactly onto it (%s)' % d['pts'][1:])
    check('Snapped to a corner of Lakeview' in pg.locator('.ae-msg').inner_text(), 'and says so')
    tap(-121.296, 37.963)  # inside Lakeview
    tap(-121.312, 37.958)
    check(pg.locator('.ae-h.first').count() == 1 and 'Tap the first corner' in pg.locator('.ae-msg').inner_text(), 'with three corners the first one offers to close')
    pg.locator('.ae-h.first').click(); time.sleep(0.6)
    d = ev(api + "._draft()")
    check(d['closed'] and 'Trimmed where it crossed Lakeview' in pg.locator('.ae-msg').inner_text(), 'closing trims the part that crossed Lakeview (%s)' % pg.locator('.ae-msg').inner_text())
    check(all(p[0] <= -121.3 + 1e-6 for p in d['pts']), 'nothing of the shape is left inside Lakeview')
    pg.screenshot(path=f'{OUT}/a2-closed.png')
    n0 = len(d['pts'])
    check(pg.locator('.ae-mid').count() == n0, 'a small dot sits in the middle of each side')
    # drag a side's dot: a new corner
    bb = pg.locator('.ae-mid').first.bounding_box()
    pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); pg.mouse.down(); pg.mouse.move(bb['x'] + 30, bb['y'] - 30, steps=6); pg.mouse.up(); time.sleep(0.5)
    check(len(ev(api + "._draft().pts")) == n0 + 1, 'dragging a side’s dot adds a corner')
    # drag a corner
    before = ev(api + "._draft().pts")
    bb = pg.locator('.ae-h').nth(0).bounding_box()
    pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); pg.mouse.down(); pg.mouse.move(bb['x'] - 25, bb['y'] - 10, steps=6); pg.mouse.up(); time.sleep(0.5)
    after = ev(api + "._draft().pts")
    check(len(after) == len(before) and after[0] != before[0], 'dragging a corner moves it')
    # tap a corner: removed
    pg.locator('.ae-h').nth(2).click(); time.sleep(0.3)
    check(len(ev(api + "._draft().pts")) == len(after) - 1 and 'Corner removed' in pg.locator('.ae-msg').inner_text(), 'tapping a corner removes it')
    pg.click('.ae-btns button:has-text("Undo")'); time.sleep(0.3)
    check(len(ev(api + "._draft().pts")) == len(after), 'Undo brings it back')

    # ---- name it ----
    pg.click('.ae-btns button:has-text("Name it")'); pg.wait_for_selector('.ae-names')
    picks = pg.locator('.ae-pick .n').all_inner_texts()
    check('Oak Park' in picks and 'Lakeview' not in picks, 'naming offers areas with no shape, not ones that have one (%s)' % picks)
    check(ev("document.activeElement.matches('input[type=text]')") is False, 'no keyboard on open')
    pg.locator('.ae-names input[type=text]').fill(' lakeview '); pg.click('.ae-names button[type=submit]'); time.sleep(0.2)
    check('Lakeview already has a shape' in pg.locator('.ae-err').inner_text(), 'a new name matching an area with a shape is refused')
    pg.locator('.ae-pick:has-text("Oak Park") input').check(); pg.click('.ae-names button[type=submit]')
    pg.wait_for_selector('.ae-sort', timeout=8000)
    sh = ev("RV.areas.list(RV.store.S.settings).map(s => s.area)")
    check(sorted(sh) == ['Lakeview', 'Oak Park'], 'Oak Park’s shape is saved (%s)' % sh)
    over = ev("""(() => { const L = RV.areas.list(RV.store.S.settings), r = (s) => [s.pts.concat([s.pts[0]])];
      const x = polygonClipping.intersection(r(L[0]), r(L[1])); return x.reduce((a, poly) => a + RV.areas.ringArea(poly[0]), 0); })()""")
    check(over < 1e-9, 'the two shapes do not overlap (%g)' % over)
    # ---- sort ----
    mv = pg.locator('.ae-move:has(input)').all_inner_texts()
    check(len(mv) == 2 and any('Ana Ruiz' in m and 'No area' in m for m in mv) and any('Ben Lee' in m and 'Lakeview' in m for m in mv), 'Sort lists who is inside Oak Park and where they move from (%s)' % mv)
    check('Dee Walker' in pg.locator('.ae-left').inner_text() and 'Not on the map yet' in pg.locator('.ae-left').inner_text(), 'contacts not on the map are left as they are')
    pg.screenshot(path=f'{OUT}/a3-sort.png')
    pg.locator('.ae-move:has-text("Ben Lee") input').uncheck()
    check(pg.locator('.ae-sort button[type=submit]').inner_text() == 'Move 1', 'unticking updates the count')
    pg.click('.ae-sort button[type=submit]'); time.sleep(0.3)
    r = ev("({ a: RV.store.rvById(window.__ids.a).neighborhood, b: RV.store.rvById(window.__ids.b).neighborhood })")
    check(r == {'a': 'Oak Park', 'b': 'Lakeview'}, 'only the ticked contact moved (%s)' % r)
    check(pg.locator('.ae-sortall').count() == 1 and 'Sort 1 contact' in pg.locator('.ae-sortall').inner_text(), 'the list offers to sort the one left over')

    # ---- crosshair ----
    pg.click('.ae-new'); pg.click('.ae-how button:has-text("Crosshair")'); time.sleep(0.2)
    check(pg.locator('.ae-cross').is_visible() and pg.locator('.ae-btns button:has-text("Add corner")').count() == 1, 'Crosshair: a fixed crosshair and Add corner')
    ev(api + ".map().jumpTo({ center: [-121.2899, 37.9701], zoom: 14 })"); time.sleep(0.3)
    check(pg.locator('.ae-snaptag').is_visible() and 'Snaps to a corner of Lakeview' in pg.locator('.ae-snaptag').inner_text(), 'over a neighbour’s corner it says it will snap')
    pg.click('.ae-btns button:has-text("Add corner")')
    for c2 in ([-121.280, 37.970], [-121.280, 37.960]):
        ev(api + ".map().jumpTo({ center: %s })" % json.dumps(c2)); time.sleep(0.2); pg.click('.ae-btns button:has-text("Add corner")')
    ev(api + ".map().jumpTo({ center: [-121.2901, 37.9599] })"); time.sleep(0.2); pg.click('.ae-btns button:has-text("Add corner")')
    d = ev(api + "._draft()")
    check(len(d['pts']) == 4 and d['pts'][0] == [-121.29, 37.97] and d['pts'][3] == [-121.29, 37.96], 'corners go where the crosshair is, snapped (%s)' % d['pts'])
    pg.screenshot(path=f'{OUT}/a4-cross.png')
    pg.click('.ae-btns button:has-text("Close shape")'); time.sleep(0.6)
    check(ev(api + "._draft().closed") and pg.locator('.ae-cross').is_hidden(), 'Close shape closes it')
    pg.click('.ae-head button:has-text("Cancel")'); time.sleep(0.2)
    check(ev(api + "._mode()") == 'list' and len(ev("RV.areas.list(RV.store.S.settings)")) == 2, 'Cancel keeps nothing')

    # ---- an existing shape ----
    pg.click('.ae-row:has-text("Lakeview")'); time.sleep(0.3)
    check(ev(api + "._mode()") == 'shape' and pg.locator('.ae-head h1').inner_text() == 'Lakeview' and pg.locator('.ae-btns button').all_inner_texts() == ['Rename', 'Redraw', 'Remove shape'], 'tapping an area opens its shape: Rename, Redraw, Remove shape')
    check(pg.locator('.ae-h').count() == 4 and pg.locator('.ae-mid').count() == 4, 'its corners and side dots are draggable')
    pg.click('.ae-btns button:has-text("Rename")'); pg.wait_for_selector('.overlay input[type=text]')
    pg.fill('.overlay input[type=text]', 'Oak park'); pg.click('.overlay button[type=submit]'); time.sleep(0.3)
    check(pg.locator('.toast:has-text("Oak Park already has a shape")').count() >= 1, 'renaming onto an area with a shape is refused')
    pg.click('.ae-btns button:has-text("Rename")'); pg.wait_for_selector('.overlay input[type=text]')
    pg.fill('.overlay input[type=text]', 'Lake View'); pg.click('.overlay button[type=submit]'); time.sleep(0.3)
    r = ev("({ shape: !!RV.areas.shapeOf(RV.store.S.settings, 'Lake View'), eli: RV.store.rvById(window.__ids.e).neighborhood, list: RV.store.S.settings.lists.neighborhoods })")
    check(r['shape'] and r['eli'] == 'Lake View' and 'Lakeview' not in r['list'], 'Rename carries the shape and the contacts (%s)' % r)
    pg.click('.ae-btns button:has-text("Remove shape")'); pg.wait_for_selector('.overlay button:has-text("Remove shape")')
    pg.click('.overlay button:has-text("Remove shape")'); time.sleep(0.3)
    check(ev("RV.areas.list(RV.store.S.settings).map(s => s.area)") == ['Oak Park'] and ev("RV.store.rvById(window.__ids.e).neighborhood") == 'Lake View', 'Remove shape leaves the area and its contacts')
    pg.click('.ae-head button:has-text("Done")'); time.sleep(0.3)
    check(pg.locator('.aedit').count() == 0 and pg.locator('.gmap').count() == 1, 'Done closes the editor')

    # ---- Settings rename carries the shape ----
    pg.goto(base + '#/settings/fields'); pg.wait_for_selector('.area-row')
    pg.click('.area-row:has-text("Oak Park")'); pg.click('.sheet .opt:has-text("Rename or merge")')
    pg.wait_for_selector('.overlay input[type=text]'); pg.fill('.overlay input[type=text]', 'Oak Park North'); pg.click('.overlay button[type=submit]'); time.sleep(0.3)
    check(ev("RV.areas.list(RV.store.S.settings).map(s => s.area)") == ['Oak Park North'], 'renaming an area in Lists carries its shape')

    # ---- auto-assign: an address-only contact placed on the map joins the area its point falls in ----
    cid = ev("RV.store.addRv({ name: 'Cal Moss', stage: 'initial', address: '12 Pine Ave' }).id")
    pg.goto(base + '#/rvs'); pg.wait_for_selector('.gmap')
    pg.wait_for_function(f"RV.store.rvById('{cid}').approx", timeout=20000)
    check(ev(f"RV.store.rvById('{cid}').neighborhood") == 'Oak Park North', 'a contact placed from its address joins the area whose shape holds it')
    # ---- New contact: a geotag inside a shape fills Area ----
    c.grant_permissions(['geolocation'], origin=base.rstrip('/')); c.set_geolocation({'latitude': 37.966, 'longitude': -121.308})
    pg.click('.fab'); pg.wait_for_selector('.sheet')
    pg.locator('.sheet input[type=text]').nth(1).fill('9 Elm St')
    pg.click('.sheet .georow button'); pg.wait_for_function("document.querySelector('.sheet .georow button') && document.querySelector('.sheet .georow button').textContent.includes('Geotagged')", timeout=10000)
    area = ev("document.querySelector('.sheet select[aria-label=Area]').value")
    check(area == 'Oak Park North', 'New contact: geotagging inside a shape fills in Area (%s)' % area)
    check(not errs, 'no page errors (%s)' % errs[:3])
    b.close()
print('%d passed, %d failed' % (ok, bad))
sys.exit(1 if bad else 0)
