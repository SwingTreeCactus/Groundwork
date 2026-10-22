"""Screen checks for Today and RVs with 14 sample people. Run: python3 tests/screens.py . <screenshot folder>"""
import http.server, socketserver, threading, functools, sys, json
from playwright.sync_api import sync_playwright
ROOT, OUT = sys.argv[1], sys.argv[2]; PORT=8786
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
s=socketserver.TCPServer(('127.0.0.1',PORT),functools.partial(Q,directory=ROOT)); threading.Thread(target=s.serve_forever,daemon=True).start()
SEED = """async () => {
  const D = 864e5, now = Date.now(), dow = new Date().getDay();
  const iso = (d) => new Date(now - d*D).toISOString();
  const ppl = [
    ['Maria Lopez','1412 Elm St','Oak Park','initial',40,[dow],'Asked about why God allows suffering'],
    ['James Carter','88 Birch Ave','Oak Park','cultivating',35,[dow,3],'Interested in the Bible\\'s view on family'],
    ['Linda Nguyen','230 Pine Rd','Riverside','return',12,[dow],'Left the brochure, wants to talk about prayer'],
    ['Robert Kim','17 Cedar Ct','Riverside','initial',55,[2],'Busy, said come back in a few weeks'],
    ['Patricia Brown','901 Maple Dr','Hillcrest','study',8,[dow],'Lesson 4'],
    ['Michael Davis','45 Walnut Ln','Hillcrest','initial',3,[],'Brief chat at the door'],
    ['Susan Wilson','312 Oak St','Oak Park','cultivating',31,[5],'Grandson was sick, follow up'],
    ['David Garcia','77 Spruce Way','Riverside','return',20,[dow],'Discussed Psalm 37:29'],
    ['Karen Martinez','5 Aspen Pl','Hillcrest','initial',70,[],'Not much time'],
    ['Thomas Anderson','620 Willow Rd','Oak Park','initial',2,[dow],'Took a tract'],
    ['Nancy Thomas','1001 Poplar St','Riverside','study',30,[4],'Lesson 9'],
    ['Daniel Moore','14 Hemlock Dr','Hillcrest','cultivating',9,[1],'Asked about the resurrection'],
    ['Betty Jackson','260 Fir Ave','Oak Park','initial',45,[dow],'Elderly, prefers mornings'],
    ['Mark White','39 Redwood Ct','Riverside','return',33,[],'Wants to read Daniel 2'],
  ];
  for (const [name,address,neighborhood,stage,days,bestDays,note] of ppl) {
    const rv = RV.store.addRv({ name, address, neighborhood, stage, bestDays, createdAt: iso(days+20) });
    RV.store.logVisit(rv.id, { text: note, at: iso(days) });
  }
  await RV.store.flush();
}"""
ok=0; bad=0
def check(c, label):
    global ok, bad
    print(('  ok   ' if c else '  FAIL ')+label); 
    if c: ok+=1
    else: bad+=1
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,service_workers='block', has_touch=False); pg=c.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    base=f'http://127.0.0.1:{PORT}/'
    shot=lambda n: pg.screenshot(path=f'{OUT}/b-{n}.png')
    pg.goto(base+'#/home'); pg.wait_for_selector('.tabbar .tab')
    pg.evaluate(SEED); pg.reload(); pg.wait_for_selector('.tabbar .tab'); pg.wait_for_timeout(300)
    shot('home')
    pg.screenshot(path=f'{OUT}/b-home-full.png', full_page=True)
    check(pg.locator('text=New RV').count()==0, 'Home has no New RV card')
    # Today dashboard
    pg.goto(base+'#/today'); pg.wait_for_selector('.cgrid'); shot('today')
    n_today = pg.evaluate("RV.logic.todaySet(RV.store.items(), new Date()).length")
    check(pg.locator('.dsum b').inner_text()==str(n_today), 'Today total matches the Today scope (%d)'%n_today)
    check(pg.locator('.gtile').count()==3, 'three tiles: Potential, RV, Bible Study')
    check('overdue' not in pg.locator('.view').inner_text().lower(), 'no "overdue" on the dashboard')
    check('null' not in pg.locator('.view').inner_text(), 'no stray text on the dashboard')
    almost = pg.evaluate("RV.garden.almost(RV.store.items(), RV.store.S.settings, new Date()).length")
    check((pg.locator('.almost').count()==1) == (almost>0) and pg.locator('.almost a').count()==min(4,almost), 'Almost growing shows the %d RVs one visit away'%almost)
    pg.evaluate("window.scrollTo(0, 2000)"); pg.wait_for_timeout(100); shot('today-almost'); pg.evaluate("window.scrollTo(0, 0)")
    pg.click('.seg2 button:has-text("All")'); pg.wait_for_timeout(100); shot('today-all')
    check(pg.locator('.dsum').inner_text().startswith('14'), 'All counts everyone (14)')
    pg.click('.seg2 button:has-text("Today")')
    pg.click('.gtile:has-text("RV")'); pg.wait_for_selector('.row.rv2'); shot('today-stage')
    rows = pg.locator('.row.rv2').count()
    exp = pg.evaluate("RV.logic.todaySet(RV.store.items(), new Date()).filter(i=>['initial','cultivating','return'].includes(i.rv.stage)).length")
    check(rows==exp, 'tapping RV lists its %d people for today'%exp)
    check(pg.locator('.topbar h1').inner_text().strip()=='RV' and pg.locator('.topbar button[aria-label="Back"]').count()==1, 'stage list has a title and a back button')
    # visited today drops off
    before = pg.evaluate("RV.logic.todaySet(RV.store.items(), new Date()).length")
    pg.evaluate("() => { const it = RV.logic.todaySet(RV.store.items(), new Date())[0]; RV.store.logVisit(it.rv.id, { text: 'x' }); }")
    pg.wait_for_timeout(200)
    after = pg.evaluate("RV.logic.todaySet(RV.store.items(), new Date()).length")
    check(after == before-1, 'someone visited today drops off the Today count')
    # RVs page: area tiles
    pg.goto(base+'#/rvs'); pg.wait_for_selector('.atile'); shot('rvs')
    check(pg.locator('.atile').count()==3, 'RVs opens on one tile per area')
    check(pg.locator('.atile:has-text("Oak Park") .n').inner_text()=='5', 'a tile shows how many people are in the area')
    check(pg.locator('.upn').count()==0 and pg.locator('.row.rv2').count()==0, 'Contacts tiles: just the areas (Up next moved to Home)')
    check('overdue' not in pg.locator('.view').inner_text().lower(), 'no "overdue" on the RVs page')
    check(pg.locator('.achips').is_hidden(), 'no filter chips row when nothing is filtered')
    pg.click('.atile:has-text("Oak Park")'); pg.wait_for_selector('.ghead'); shot('area')
    heads = pg.locator('.ghead span:first-child').all_inner_texts()
    exp_home = pg.evaluate("RV.logic.likelyHomeToday(RV.store.items(), new Date()).filter(i=>i.rv.neighborhood==='Oak Park').map(i=>i.rv.name).sort()")
    first = pg.locator('.list').nth(0).locator('.name').all_inner_texts()
    check(heads[0].startswith('Likely home') and sorted(first)==exp_home, 'an area opens with likely-home-today first (%s)'%', '.join(first))
    check(len(heads)==2 and heads[1]=='Others', 'everyone else in the area is listed underneath')
    check(pg.locator('.topbar h1').inner_text().strip()=='Oak Park', 'area screen is titled with the area')
    pg.goto(base+'#/rvs'); pg.wait_for_selector('.atile')
    # Tiles / Folders switch
    check(pg.locator('.vswitch button').all_inner_texts()==['Tiles','Folders','Map'], 'a Tiles / Folders / Map switch replaces the summary line')
    pg.click('.vswitch button:has-text("Folders")'); pg.wait_for_selector('.acard')
    check(pg.locator('.acard').count()==3 and pg.locator('.abody').count()==0, 'Folders shows one closed folder per area')
    pg.click('.acard:has-text("Oak Park") .ahead'); pg.wait_for_selector('.abody'); shot('folders')
    first = pg.locator('.abody .list').nth(0).locator('.name').all_inner_texts()
    check(sorted(first)==exp_home and pg.locator('.abody .ghead span:first-child').nth(0).inner_text().startswith('Likely home'), 'an open folder lists likely-home-today first')
    pg.reload(); pg.wait_for_selector('.acard')
    check(pg.locator('.atile').count()==0, 'the Folders choice is remembered')
    pg.click('.vswitch button:has-text("Tiles")'); pg.wait_for_selector('.atile')
    # filter sheet
    pg.click('.fbtn'); pg.wait_for_selector('.wheel'); pg.wait_for_timeout(200); shot('filters')
    check(pg.locator('.wheel').count()==4, 'four picker wheels')
    w = pg.locator('.wheel').nth(2); bb = w.bounding_box()
    # drag the Area wheel one step left (to the next area)
    pg.mouse.move(bb['x']+bb['width']/2+60, bb['y']+bb['height']/2); pg.mouse.down()
    for k in range(1,13): pg.mouse.move(bb['x']+bb['width']/2+60-k*11, bb['y']+bb['height']/2)
    pg.mouse.up(); pg.wait_for_timeout(400)
    area = pg.evaluate("JSON.parse(localStorage.getItem('rvapp.list')).neighborhood")
    check(area=='Hillcrest', 'swiping the Area wheel picks the next area (%s)'%area)
    check('on' in w.get_attribute('class'), 'a wheel off "Any" is marked')
    # tap the right neighbour on the Stage wheel
    sw = pg.locator('.wheel').nth(1); sb = sw.bounding_box()
    pg.mouse.click(sb['x']+sb['width']/2+132, sb['y']+sb['height']/2); pg.wait_for_timeout(400)
    stage = pg.evaluate("JSON.parse(localStorage.getItem('rvapp.list')).stage")
    check(stage=='yet', 'tapping a neighbour moves the wheel to it (%s)'%stage)
    # wrap around: Stage wheel left twice from Yet -> Any -> Bible Study
    for _ in range(2):
        sw.focus(); pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(350)
    stage = pg.evaluate("JSON.parse(localStorage.getItem('rvapp.list')).stage")
    check(stage=='study', 'the wheel wraps around from the start to the end (%s)'%stage)
    go = pg.locator('.fsheet .actions .btn').inner_text()
    exp = pg.evaluate("RV.store.items().filter(i=>i.rv.stage==='study'&&i.rv.neighborhood==='Hillcrest').length")
    check(go.startswith('Show %d'%exp), 'Show button counts the result (%s)'%go)
    shot('filters-set')
    pg.click('.fsheet .actions .btn'); pg.wait_for_timeout(200); shot('rvs-filtered')
    check(pg.locator('.achip').count()==2 and pg.locator('.fbtn .b').inner_text()=='2', 'two active filters show as chips and a count')
    check(pg.locator('.row.rv2').count()==exp, 'list shows the filtered people')
    pg.click('.lmeta button:has-text("Clear all")'); pg.wait_for_timeout(100)
    check(pg.locator('.achip').count()==0 and pg.locator('.atile').count()==3, 'Clear all brings back the area tiles')
    # search by street shows the address line
    pg.fill('input[type=search]','elm'); pg.wait_for_timeout(400); shot('search')
    check(pg.locator('.row.rv2').count()==1 and pg.locator('.row.rv2 .hit mark').inner_text().lower()=='elm', 'search by street finds Maria and shows the matched address')
    pg.fill('input[type=search]',''); pg.wait_for_timeout(300)
    # saved views still open
    pg.click('.fbtn'); pg.wait_for_selector('.fsheet'); pg.click('.fsheet .saved'); pg.wait_for_selector('.sheet h2:has-text("Saved views")')
    check(True, 'Saved views opens from the filter page')
    pg.keyboard.press('Escape')
    # detail screen
    rid = pg.evaluate("RV.store.items().find(i=>i.att.state==='overdue').rv.id")
    pg.goto(base+'#/rv/'+rid); pg.wait_for_timeout(300); shot('detail')
    op = lambda: pg.evaluate("getComputedStyle(document.querySelector('.topbar h1')).opacity")
    pg.wait_for_timeout(300); o1 = op()
    pg.evaluate("document.querySelector('.view').style.minHeight = '3000px'; window.scrollTo(0, 600)"); pg.wait_for_timeout(400); o2 = op()
    pg.evaluate("document.querySelector('.view').style.minHeight = ''")
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(300)
    check(pg.locator('.ghero .gperson').inner_text().strip() != '' and o1 == '0' and o2 == '1', 'record: the name sits large beside the plant; the bar shows it only once scrolled away (%s, %s)' % (o1, o2))
    check('overdue' not in pg.locator('.view').inner_text().lower(), 'no "overdue" on a person\'s screen')
    # dark
    pg.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    pg.goto(base+'#/today'); pg.wait_for_selector('.cgrid'); pg.wait_for_timeout(100); shot('today-dark')
    pg.goto(base+'#/rvs'); pg.wait_for_selector('.atile'); shot('rvs-dark')
    pg.goto(base+'#/rv/'+rid); pg.wait_for_selector('.ghero'); pg.wait_for_timeout(100); shot('detail-dark')
    pg.goto(base+'#/insights'); pg.wait_for_selector('.ring'); pg.wait_for_timeout(100); shot('insights-dark')
    pg.locator('.gscene').screenshot(path=f'{OUT}/b-scene-dark.png')
    for t in ['dusk', 'night']:
        pg.evaluate("t => document.querySelector('.gscene').setAttribute('data-t', t)", t)
        pg.locator('.gscene').screenshot(path=f'{OUT}/b-scene-dark-{t}.png')
    pg.evaluate("() => { const ST = RV.store; const a = ST.S.rvs.find(r => r.neighborhood); location.hash = '#/rvs/area/' + encodeURIComponent(a.neighborhood); }")
    pg.wait_for_timeout(300); shot('area-dark')
    # light blue
    pg.evaluate("document.documentElement.setAttribute('data-theme','light'); document.documentElement.setAttribute('data-accent','blue')")
    pg.goto(base+'#/today'); pg.wait_for_selector('.cgrid'); pg.wait_for_timeout(100); shot('today-blue')
    pg.evaluate("document.documentElement.setAttribute('data-accent','purple')")
    pg.evaluate("() => RV.store.saveSettings(s => { const t = new Date().toISOString(); s.exhibits = { 'first-study': t, rv25: t, area: t, studies3: t, rv50: t, streak26: t, first10: t, streak52: t }; })")
    pg.goto(base+'#/insights'); pg.wait_for_selector('.gscene'); pg.wait_for_timeout(200)
    pg.locator('.gsquare').screenshot(path=f'{OUT}/b-exhibits.png')
    pg.evaluate("() => RV.store.saveSettings(s => { const t = new Date().toISOString(); s.exhibits = { 'first-study': t, rv25: t, area: t }; })")
    pg.click('.ctile.ms'); pg.wait_for_selector('.exgrid'); pg.wait_for_timeout(200); shot('exhibit-sheet'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.wait_for_timeout(2000) # let the day's first visitor sighting save (one re-render)
    check(pg.locator('.gscene .gp').count() >= 10 and pg.locator('.gscene .gsign').count() >= 3, 'garden scene: plants in beds with area signs')
    for t in ['morning', 'day', 'dusk', 'night']:
        pg.evaluate("t => document.querySelector('.gscene').setAttribute('data-t', t)", t)
        pg.locator('.gscene').screenshot(path=f'{OUT}/b-scene-{t}.png')
    pg.locator('.gscene .gp').nth(2).click(); pg.wait_for_timeout(200); pg.locator('.gscene').screenshot(path=f'{OUT}/b-scene-sel.png')
    pg.locator('.gscene .gp').last.click(); pg.wait_for_timeout(200); shot('scene-card')
    cb = pg.evaluate("() => { const c = document.querySelector('.gcard').getBoundingClientRect(), t = document.querySelector('.tabbar').getBoundingClientRect(); return [c.top, c.bottom, t.top, innerHeight]; }")
    check(cb[0] > 0 and cb[1] <= cb[2] - 4, 'the plant card sits above the tab bar, on screen (%s)' % cb)
    check(pg.evaluate("getComputedStyle(document.querySelector('.gscene .gp .pot')).display") == 'none', 'scene plants are planted in the ground: no pot or face')
    over = pg.evaluate("() => { const s = document.querySelector('.gscene').getBoundingClientRect(); return [...document.querySelectorAll('.gscene .gbed')].map(b => b.getBoundingClientRect()).filter(r => r.right > s.right + 0.5 || r.left < s.left - 0.5).length; }")
    check(over == 0, 'every bed fits inside the scene at 390 px')
    dry = pg.evaluate("RV.store.items().filter(i => { const g = RV.garden.forItem(i, RV.store.S.settings, new Date()); return g.form && g.care && g.care <= 2; }).length")
    check(dry > 0 and pg.locator('.gscene .gcan, .gscene .need, .gscene .needpos').count() == 0, 'no watering cans or speech bubbles (%d thirsty or wilting)' % dry)
    check(pg.evaluate("getComputedStyle(document.querySelector('.gscene .pl.h2 .cracks, .gscene .pl.h1 .cracks')).display") != 'none', 'thirsty soil is pale and cracked')
    pg.set_viewport_size({'width': 360, 'height': 780}); pg.reload(); pg.wait_for_selector('.gscene'); pg.wait_for_timeout(200)
    over = pg.evaluate("() => { const s = document.querySelector('.gscene').getBoundingClientRect(); return [...document.querySelectorAll('.gscene .gbed, .gscene .gp')].map(b => b.getBoundingClientRect()).filter(r => r.right > s.right + 0.5).length; }")
    check(over == 0, 'and at 360 px')
    pg.locator('.gscene').screenshot(path=f'{OUT}/b-scene-360.png')
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.reload(); pg.wait_for_selector('.gscene')
    # v2.23: shrub flowers, tiered exhibits, rare visitors, bunting
    pg.evaluate("() => { window.__RV_SURPRISE = 1; window.__RV_GARDEN_OPT = { campaign: true }; RV.store.saveSettings(s => { const t = new Date().toISOString(); s.flowersSince = new Date(Date.now() - 400*864e5).toISOString(); s.exhibits = { 'first-study': t, studies3: t, rv10: t, rv25: t, rv50: t, rv100: t, area: t, ring1: t, streak4: t, streak12: t, streak26: t, streak52: t, revive1: t, round1: t, 'first-plan': t }; }); }")
    pg.evaluate("() => { const v = RV.garden.visitors(RV.store.items(), RV.store.S.settings, new Date()); v.fox = true; window.__RV_GARDEN_OPT.visitors = v; }")
    pg.goto(base+'#/rvs'); pg.goto(base+'#/insights'); pg.wait_for_selector('.gscene'); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('.gscene').setAttribute('data-t', 'dusk')")
    pg.locator('.gscene').screenshot(path=f'{OUT}/b-scene-surprise.png')
    check(pg.locator('.gscene .gbunt').count() == 1 and pg.locator('.gscene .gfox').count() == 1, 'bunting during a campaign; a fox at dusk after a closed ring')
    check(pg.locator('.gsquare .gfam.t5 .gbloom').count() == 1, 'a fifth-tier family wears a ring of blooms')
    # v2.24: tap a visitor for its card; the card closes on a tap elsewhere and has a close button
    pg.locator('.gscene .gvis').first.click(); pg.wait_for_timeout(200)
    check('Rare visitor' in pg.locator('.gcard').inner_text(), 'tapping a visitor shows a Rare visitor card')
    pg.locator('.gscene').screenshot(path=f'{OUT}/b-visitor-card.png'); shot('visitor-card')
    pg.locator('.gscene .gsign').first.evaluate("e => e.parentElement.click()"); pg.wait_for_timeout(150)
    check(pg.locator('.gcard').is_hidden(), 'a tap elsewhere in the garden closes the card')
    pg.locator('.gscene .gp').first.click(); pg.wait_for_timeout(150)
    pg.locator('.gcard .gx').click(); pg.wait_for_timeout(150)
    check(pg.locator('.gcard').is_hidden(), 'the close button closes the card')
    pg.click('.ctile.vs'); pg.wait_for_selector('.exgrid'); pg.wait_for_timeout(200)
    check(pg.locator('.sheet .vobj').count() == 3, 'the Visitors page lists all three')
    shot('visitors-sheet'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # v2.25: the section under the garden
    pg.evaluate("window.scrollTo(0, document.querySelector('.howbtn').getBoundingClientRect().top + scrollY - 70)"); pg.wait_for_timeout(200); shot('under-garden')
    pg.evaluate("window.scrollBy(0, 700)"); pg.wait_for_timeout(200); shot('under-garden-2')
    pg.click('.howbtn'); pg.wait_for_selector('.guide'); pg.wait_for_timeout(300); shot('guide'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate("() => { window.__RV_SURPRISE = 0; window.__RV_GARDEN_OPT = null; }")
    sh = pg.evaluate("() => RV.store.items().map(i => RV.garden.forItem(i, RV.store.S.settings, new Date())).filter(g => g.form === 4).map(g => g.flowers)")
    pg.goto(base+'#/rvs'); pg.wait_for_timeout(100)
    pg.evaluate("document.documentElement.setAttribute('data-accent','blue')")
    pg.goto(base+'#/insights'); pg.wait_for_selector('.ring'); pg.wait_for_timeout(100); shot('insights-blue')
    pg.evaluate("window.scrollTo(0, 1400)"); pg.wait_for_timeout(100); shot('insights-blue-2')
    pg.goto(base+'#/rv/'+rid); pg.wait_for_selector('.ghero'); pg.wait_for_timeout(100); shot('detail-blue')
    check(not errs, 'no page errors' + ('' if not errs else ': '+'; '.join(errs[:3])))
    print(ok, 'passed', bad, 'failed')
