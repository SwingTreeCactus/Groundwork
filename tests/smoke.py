"""Browser smoke test. Run: python3 -I tests/smoke.py   (needs playwright + chromium)
Serves the app on localhost, drives it at phone size, checks the main flows and console errors.
Screenshots go to the folder given as the first argument (default /tmp/out/shots)."""
import http.server, socketserver, threading, os, sys, json, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp/out/shots'
os.makedirs(SHOTS, exist_ok=True)
PORT = 8765

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=ROOT)
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/'

fails, passes = [], 0
def check(cond, msg):
    global passes
    if cond: passes += 1; print('  ok  ' + msg)
    else: fails.append(msg); print('FAIL  ' + msg)

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        locale='en-US', timezone_id='America/Los_Angeles')
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    ev = page.evaluate
    shot = lambda n: page.screenshot(path=f'{SHOTS}/{n}.png')

    print('first load')
    page.goto(URL); page.wait_for_selector('.tabbar .tab')
    check(page.locator('h1').first.inner_text().startswith('Home'), 'home loads')
    check(page.locator('text=Welcome').count() == 1, 'welcome card on empty install')
    shot('01-home-empty')

    print('quick add through the UI')
    page.click('button[aria-label="Quick add"]')
    page.wait_for_selector('.sheet')
    inputs = page.locator('.sheet input[type=text]')
    inputs.nth(0).fill('Maria Lopez'); inputs.nth(1).fill('123 Oak St'); inputs.nth(2).fill('Oak Park')
    page.locator('.sheet textarea').fill('Said to come back after 5pm; asked about Bible prophecy')
    shot('02-quick-add')
    page.click('.sheet button[type=submit]')
    page.wait_for_selector('.toast')
    n = ev('RV.store.S.rvs.filter(r=>!r.deletedAt).length')
    check(n == 1, 'RV added')
    rv = ev('RV.store.S.rvs[0]')
    check(rv['stage'] == 'initial', 'default stage is Initial Call')
    check(ev('RV.store.S.entries.filter(e=>e.type=="visit").length') == 1, 'quick-add note became a visit entry')
    mid = rv['id']

    print('duplicate warning')
    page.click('button[aria-label="Quick add"]'); page.wait_for_selector('.sheet')
    page.locator('.sheet input[type=text]').nth(0).fill('Someone Else')
    page.locator('.sheet input[type=text]').nth(1).fill('123 oak street')
    page.click('.sheet button[type=submit]')
    page.wait_for_selector('text=Possible duplicate')
    check(True, 'duplicate address warned (normalised)')
    page.click('text=Cancel >> nth=-1')
    page.keyboard.press('Escape'); page.keyboard.press('Escape')
    time.sleep(0.2)
    check(ev('document.querySelectorAll(".overlay").length') == 0, 'dialogs closed with Escape/Cancel')
    check(ev('RV.store.S.rvs.filter(r=>!r.deletedAt).length') == 1, 'duplicate was not saved')

    print('seed a populated app')
    ev('''() => {
      const ST = RV.store; const d = n => new Date(Date.now() - n*864e5).toISOString();
      const mk = (f, es) => { const r = ST.addRv(Object.assign({createdAt: d(90)}, f)); (es||[]).forEach(([t, n, txt]) => ST.addEntry(r.id, t, {text: txt||''}, d(n))); return r; };
      mk({name:'Ana Ruiz', address:'12 Elm St', neighborhood:'Oak Park', phone:'209-555-0111', stage:'return', howMet:'Door', notes:'Has a small dog', bestTimes:[{days:[1,2,3,4,5],from:'17:00',to:'20:00'}]}, [['visit',45,'First chat'],['visit',20,'Talked about family and prayer']]);
      mk({name:'Ben Carter', address:'9 Oak St', neighborhood:'Oak Park', stage:'study'}, [['visit',6,'Study on lesson 3']]);
      mk({name:'Chen Family', address:'400 Pine Ave', neighborhood:'Lakeview', stage:'cultivating', nextVisit: new Date(Date.now()+2*864e5).toISOString().slice(0,10)}, [['visit',3,'Left a tract']]);
      mk({name:'Dee Alvarez', address:'77 Lake Rd', neighborhood:'Lakeview', stage:'initial'}, [['nh',9],['nh',2]]);
      mk({name:'Eli Moore', address:'5 Cedar Ct', neighborhood:'', stage:'yet'}, []);
      mk({name:'Fay Nguyen', address:'88 Birch Ln', neighborhood:'Oak Park', stage:'archived', archiveReason:'moved'}, [['visit',100,'Moved to Fresno']]);
      ST.addLib('starter',{title:'Ask about the news', text:'What do you think is behind so much trouble in the world?'});
      ST.addLib('scripture',{title:'Psalm 37:29', text:'Hope for the future'});
      ST.addLib('topic',{title:'Family worries', text:'Listen first'});
      ST.addLib('campaign',{title:'Fall invitation', text:'Offer the special talk invitation', active:true});
    }''')
    ev('RV.store.flush()')
    page.reload(); page.wait_for_selector('.tabbar .tab')
    check(ev('RV.store.S.rvs.length') == 7, 'data survives a reload (IndexedDB)')
    shot('03-home-populated')
    check(page.locator('text=Needs attention').count() >= 1, 'needs-attention card shows')
    check(page.locator('text=Fall invitation').count() >= 1, 'campaign shown on Home')

    print('today')
    page.click('.tab >> text=Today'); page.wait_for_selector('text=Overdue')
    check(page.locator('.row:has-text("Ana Ruiz")').count() >= 1, 'Ana is flagged (20 days, 14 allowed)')
    check(page.locator('.row:has-text("Ben Carter")').count() == 0, 'Ben (6 days, 30 allowed) not flagged')
    shot('04-today')

    print('list: search, chips, sort')
    page.click('.tab >> text=RVs'); page.wait_for_selector('.sticky-filters')
    rows = page.locator('.row').count()
    check(rows == 6, 'list shows 6 active RVs, archived hidden (got %d)' % rows)
    page.fill('input[type=search]', 'oak'); time.sleep(0.3)
    names = page.locator('.row .name').all_inner_texts()
    check(sorted(names) == ['Ana Ruiz', 'Ben Carter', 'Maria Lopez'], 'search matches address text: %s' % names)
    page.fill('input[type=search]', 'prophecy'); time.sleep(0.3)
    check(page.locator('.row .name').all_inner_texts() == ['Maria Lopez'], 'search matches visit notes')
    page.fill('input[type=search]', ''); time.sleep(0.3)
    page.click('.chips .chip:has-text("Archived")'); time.sleep(0.2)
    check(page.locator('.row:has-text("Fay Nguyen")').count() == 1, 'Archived chip reveals archived RV')
    page.click('.chips .chip:has-text("Archived")')
    page.select_option('select[aria-label="Sort"]', 'neighborhood'); time.sleep(0.2)
    heads = page.locator('.group-head').all_inner_texts()
    check(heads and heads[0].lower().startswith('lakeview'), 'neighborhood sort groups: %s' % heads)
    shot('05-list-neighborhood')
    page.select_option('select[aria-label="Sort"]', 'attention')

    print('NH button on a list row, with undo')
    before = ev('RV.store.S.entries.filter(e=>e.type=="nh").length')
    page.locator('.row:has-text("Eli Moore") .nhbtn').click()
    check(ev('RV.store.S.entries.filter(e=>e.type=="nh").length') == before + 1, 'row NH button logs a not-home')
    page.click('.toast button:has-text("Undo")')
    check(ev('RV.store.S.entries.filter(e=>e.type=="nh").length') == before, 'undo removes it')

    print('detail: not home, visit, stage, snooze')
    ana = ev('RV.store.S.rvs.find(r=>r.name=="Ana Ruiz").id')
    page.goto(URL + '#/rv/' + ana); page.wait_for_selector('text=Timeline')
    check(page.locator('.banner:has-text("Overdue")').count() == 1, 'overdue banner on detail')
    shot('06-detail')
    page.click('button:has-text("Not Home") >> nth=0')
    page.wait_for_selector('.toast')
    check(ev(f'RV.store.S.entries.filter(e=>e.rvId=="{ana}"&&e.type=="nh").length') == 1, 'Not Home logged on detail')
    page.click('.toast button:has-text("Add note")')
    page.wait_for_selector('.sheet textarea'); page.fill('.sheet textarea', 'Dog barking, nobody answered')
    page.click('.sheet button[type=submit]')
    check(ev(f'RV.store.S.entries.find(e=>e.rvId=="{ana}"&&e.type=="nh").text') == 'Dog barking, nobody answered', 'toast Add note saves text')
    page.click('button:has-text("Record visit")')
    page.wait_for_selector('.sheet textarea')
    page.fill('.sheet textarea', 'Studied John 17:3; she wants a weekly study')
    page.click('.sheet summary')
    shot('07-visit-dialog')
    page.click('.sheet .chip:has-text("+2 weeks")')
    page.select_option('.sheet select', 'study')
    page.click('.sheet button:has-text("Save visit")')
    page.wait_for_selector('.toast:has-text("Visit saved")')
    r = ev(f'RV.store.rvById("{ana}")')
    check(r['stage'] == 'study', 'visit moved stage to Bible Study')
    check(bool(r['nextVisit']), 'visit set next visit date')
    check(ev(f'RV.store.itemFor("{ana}").att.state') in ('ok', 'soon'), 'no longer overdue after a visit')
    check(page.locator('.tl li').count() >= 4, 'timeline shows entries (%d)' % page.locator('.tl li').count())

    print('archive as Do not call, then duplicates')
    page.click('button[aria-label="More actions"]'); page.click('.sheet .opt:has-text("Archive")')
    page.click('.sheet .opt:has-text("Do not call")')
    page.click('.sheet button:has-text("Archive")')
    page.wait_for_selector('.banner.danger')
    check(ev(f'RV.store.rvById("{ana}").stage') == 'archived', 'archived')
    check(page.locator('button:has-text("Not Home")').count() == 0, 'no visit buttons on a Do not call record')
    shot('08-dnc')
    page.click('.tab >> text=Today')
    page.click('button[aria-label="Quick add"]'); page.wait_for_selector('.sheet')
    page.locator('.sheet input[type=text]').nth(0).fill('Newcomer'); page.locator('.sheet input[type=text]').nth(1).fill('12 Elm Street')
    page.click('.sheet button[type=submit]')
    try:
        page.wait_for_selector('text=Do not call on file', timeout=4000)
    except Exception:
        print('DEBUG sheets:', [e.inner_text()[:60] for e in page.locator('.sheet').all()], 'rvs:', ev('RV.store.S.rvs.map(r=>[r.name,r.address,r.stage,r.archiveReason])'))
        shot('99-debug'); raise
    check(True, 'adding at a Do-not-call address shows a strong warning')
    page.keyboard.press('Escape'); page.keyboard.press('Escape')
    # restoring a non-restorable reason is refused
    page.goto(URL + '#/rv/' + ana); page.wait_for_selector('.banner.danger')
    check(page.locator('button:has-text("Restore")').count() == 0, 'DNC records cannot be restored')

    print('not-home banner')
    ev('''() => { const ST = RV.store; const r = ST.rvById("%s"); }''' % ana)
    ben = ev('RV.store.S.rvs.find(r=>r.name=="Ben Carter").id')
    ev('''(id) => { const ST = RV.store; const now = new Date();
      for (let w = 1; w <= 3; w++) { const d = new Date(now); d.setDate(d.getDate() - 7*w); ST.addEntry(id, 'nh', {}, d.toISOString()); } }''', ben)
    page.goto(URL + '#/rv/' + ben); page.wait_for_selector('text=Timeline')
    check(page.locator('.banner:has-text("Usually not home")').count() == 1, 'not-home banner appears for 3 same-slot misses')
    shot('09-nh-banner')
    page.click('button:has-text("Hide for this RV")')
    check(page.locator('.banner:has-text("Usually not home")').count() == 0, 'banner can be hidden per RV')

    print('settings pages open without errors')
    for sec in ['', 'display', 'home', 'lib/starter', 'lib/campaign', 'stages', 'reasons', 'fields', 'labels', 'attention', 'security', 'data', 'about']:
        page.goto(URL + '#/settings/' + sec if sec else URL + '#/settings'); page.wait_for_selector('.view')
        time.sleep(0.15)
        check(page.locator('.view').inner_text().strip() != '', 'settings/%s renders' % (sec or 'index'))
    page.goto(URL + '#/settings/stages'); page.wait_for_selector('.card')
    shot('10-settings-stages')

    print('stage rename and threshold persist')
    inp = page.locator('.card input[type=text]').nth(1)
    inp.fill('Initial Contact'); inp.blur()
    time.sleep(0.2)
    check(ev('RV.store.S.settings.stages[1].name') == 'Initial Contact', 'stage rename saved')
    days = page.locator('.card input[type=number]').nth(1)
    days.fill('10'); days.blur(); time.sleep(0.2)
    check(ev('RV.store.S.settings.stages[1].days') == 10, 'stage threshold saved')
    ev('RV.store.flush()')
    page.reload(); page.wait_for_selector('.view')
    check(ev('RV.store.S.settings.stages[1].name') == 'Initial Contact', 'settings survive reload')

    print('display: dark theme and large text')
    page.goto(URL + '#/settings/display'); page.wait_for_selector('.seg')
    page.click('.seg >> nth=0 >> button:has-text("Dark")')
    page.click('.seg >> nth=1 >> button:has-text("Large")')
    check(ev('document.documentElement.getAttribute("data-theme")') == 'dark', 'dark theme applied')
    check(ev('getComputedStyle(document.documentElement).fontSize') == '18.4px', 'text scale applied (%s)' % ev('getComputedStyle(document.documentElement).fontSize'))
    page.goto(URL + '#/rvs'); page.wait_for_selector('.row'); shot('11-list-dark')
    page.goto(URL + '#/settings/display'); page.wait_for_selector('.seg')
    page.click('.seg >> nth=0 >> button:has-text("System")'); page.click('.seg >> nth=1 >> button:has-text("Default")')

    print('backup and restore')
    backup = ev('RV.store.exportAll()')
    check(backup['app'] == 'rv-app' and len(backup['rvs']) >= 7, 'backup has everything')
    ev('(b) => RV.store.restore(b, "replace")', backup)
    check(ev('RV.store.S.rvs.length') == len(backup['rvs']), 'replace-restore keeps counts')
    ev('async () => { await RV.store.eraseAll(); }')
    check(ev('RV.store.S.rvs.length') == 0, 'erase all works')
    ev('(b) => RV.store.restore(b, "merge")', backup)
    check(ev('RV.store.S.rvs.length') == len(backup['rvs']), 'merge-restore brings records back')

    print('CSV import through the wizard')
    csv_path = '/tmp/out/test-import.csv'
    open(csv_path, 'w').write('Full Name,Street Address,Area,Cell,Status,Comments,Last Contact\n'
                              'Gina Park,31 Maple Dr,Lakeview,209-555-0199,Return Visit,"Likes hiking, asked about ""life""",03/04/2026\n'
                              ',missing name,,,,,\n'
                              'Hal Young,123 Oak Street,,,,,\n')
    page.goto(URL + '#/settings/data'); page.wait_for_selector('.setrow')
    with page.expect_file_chooser() as fc:
        page.click('.setrow:has-text("Import from CSV")')
    fc.value.set_files(csv_path)
    page.wait_for_selector('.sheet:has-text("Match your columns")')
    shot('12-import')
    summary = page.locator('.sheet .banner').inner_text()
    check('1 RV' in summary or '1 RVs' in summary, 'import summary: ' + summary.replace('\n', ' '))
    page.click('.sheet button:has-text("Import")')
    time.sleep(0.4)
    g = ev('RV.store.S.rvs.find(r=>r.name=="Gina Park")')
    check(g and g['stage'] == 'return' and g['neighborhood'] == 'Lakeview', 'imported with mapped stage and area')
    check('asked about "life"' in g['notes'], 'quoted CSV text kept')
    check(ev('RV.store.S.rvs.filter(r=>r.name=="Hal Young").length') == 0, 'duplicate of Maria Lopez address skipped')

    print('PIN lock')
    ev('''async () => { const salt='s'; const hash = await RV.util.sha256hex(salt+':1234');
       RV.store.saveSettings(s => { s.lock.on = true; s.lock.salt = salt; s.lock.hash = hash; }); RV.app.lockNow(); }''')
    page.wait_for_selector('.lock'); shot('13-lock')
    for d in '9999': page.click(f'.keypad button:text-is("{d}")')
    time.sleep(0.1)
    check(page.locator('.lock').count() == 1, 'wrong PIN keeps it locked')
    page.click('.keypad button[aria-label="Delete"]');
    for _ in range(4): page.click('.keypad button[aria-label="Delete"]')
    for d in '1234': page.click(f'.keypad button:text-is("{d}")')
    page.wait_for_selector('.lock', state='detached', timeout=3000)
    check(True, 'correct PIN unlocks')
    ev('RV.store.saveSettings(s => { s.lock.on = false; })')

    print('offline')
    page.goto(URL); page.wait_for_selector('.tabbar .tab')
    ev('async () => { await navigator.serviceWorker.ready; }')
    time.sleep(1.0)
    has_ctrl = ev('!!navigator.serviceWorker.controller') or True
    ctx.set_offline(True)
    page.reload(); page.wait_for_selector('.tabbar .tab', timeout=8000)
    check(page.locator('h1').first.inner_text().startswith('Home'), 'app opens with no network (service worker)')
    check(ev('RV.store.S.rvs.length') > 0, 'data still there offline')
    ctx.set_offline(False)

    print('console errors')
    check(not errors, 'no console errors: %s' % errors[:3])
    b.close()

httpd.shutdown()
print('\n%d passed, %d failed' % (passes, len(fails)))
if fails:
    print('FAILED:\n - ' + '\n - '.join(fails))
    sys.exit(1)
