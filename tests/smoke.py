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
    # the seeded lib items are the OLD format (starter / scripture / undated campaign): they must migrate on load
    check(ev('RV.store.S.lib.filter(x=>x.kind=="starter"||x.kind=="scripture").length') == 0, 'migration: starters and scriptures became topics')
    check(ev('RV.store.S.lib.filter(x=>x.kind=="topic"&&!x.deletedAt).length') == 3, 'migration: all three kept as topics')
    check(page.locator('.campaign-bar:has-text("Fall invitation")').count() == 1, 'active campaign shown as a banner on Home')
    check(page.locator('.prow').count() == 3, 'Home lists the three topics (%d)' % page.locator('.prow').count())
    check(page.locator('text=Conversation starters').count() == 0 and page.locator('.card-head:has-text("Needs attention")').count() == 0, 'no starters card, no work lists on Home')
    check(page.locator('.row').count() == 0, 'Home lists no RVs')

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

    print('v2: quick add, campaign tag, day tags, next time, topics')
    dow = ev('new Date().getDay()')
    campaign = ev('RV.store.activeCampaign()')
    page.goto(URL + '#/home'); page.wait_for_selector('.campaign-bar')
    page.click('button[aria-label="Quick add"]'); page.wait_for_selector('.sheet')
    check(page.locator('.sheet .check:has-text("Fall invitation")').count() == 1, 'quick add offers the active campaign')
    check(page.locator('.sheet .check input').is_checked(), 'campaign toggle defaults on')
    page.locator('.sheet input[type=text]').nth(0).fill('Blank Note Person')
    page.click('.sheet button[type=submit]'); page.wait_for_selector('.toast')
    bn = ev('RV.store.S.rvs.find(r=>r.name=="Blank Note Person")')
    check(bn['dayPrimary']['day'] == dow and bn['dayPrimary']['part'] in ('morning', 'afternoon', 'evening', 'night'), 'quick add stamps today as the primary best day: %s' % bn['dayPrimary'])
    check(bn['campaignId'] == campaign['id'], 'quick add tags the active campaign')
    be = ev('RV.store.S.entries.filter(e=>e.rvId=="%s")' % bn['id'])
    check(len(be) == 1 and be[0]['type'] == 'visit' and 'Campaign: Fall invitation' in be[0]['text'] and 'Topic: ' in be[0]['text'], 'blank note filled with the live campaign and topics: %r' % (be[0]['text'] if be else None))
    check(be[0]['campaignId'] == campaign['id'], 'first visit tagged with the campaign')
    page.click('button[aria-label="Quick add"]'); page.wait_for_selector('.sheet')
    page.locator('.sheet input[type=text]').nth(0).fill('Off Campaign')
    page.locator('.sheet .check input').uncheck()
    page.locator('.sheet textarea').fill('Met at the market')
    page.click('.sheet button[type=submit]'); page.wait_for_selector('.toast')
    oc = ev('RV.store.S.rvs.find(r=>r.name=="Off Campaign")')
    check(oc['campaignId'] is None, 'campaign toggle off: RV not tagged')
    ocv = ev('RV.store.S.entries.find(e=>e.rvId=="%s")' % oc['id'])
    check(ocv['campaignId'] is None and ocv['text'] == 'Met at the market', 'campaign toggle off: visit not tagged, own note kept')

    print('v2: RV page leads with household notes, next time, last visit')
    ben = ev('RV.store.S.rvs.find(r=>r.name=="Ben Carter").id')
    ev('(id) => RV.store.updateRv(id, {stage: "return", notes: "Works nights, has a dog", whatsNext: "Bring the brochure"})', ben)  # normal layout; study layout has its own tests
    page.goto(URL + '#/rv/' + ben); page.wait_for_selector('text=Timeline')
    check(page.locator('.household:has-text("Works nights")').count() == 1, 'household notes sit under the name and address')
    check(page.locator('.snap-row.next:has-text("Bring the brochure")').count() == 1, 'Discuss next time is pinned at the top')
    check(page.locator('.snap-row:has-text("Study on lesson 3")').count() == 1, 'last visit summary is pinned at the top')
    order = ev('''() => { const c = document.querySelector('.household'), s = document.querySelector('.snap'), b = document.querySelector('.btn.big');
      return [c.compareDocumentPosition(s) & 4 ? 1 : 0, s.compareDocumentPosition(b) & 4 ? 1 : 0]; }''')
    check(order == [1, 1], 'order is household notes, then snapshot, then the action buttons')
    check(page.locator('.card-head:has-text("Timeline") button').count() == 0, 'no manual Note button on the timeline')
    page.click('button[aria-label="More actions"]')
    check(page.locator('.sheet .opt:has-text("Add note")').count() == 0, 'no Add note in the actions menu')
    page.keyboard.press('Escape')

    print('v2: record visit with topic chips, next time and campaign toggle')
    page.click('button:has-text("Record visit")'); page.wait_for_selector('.sheet textarea')
    check(page.locator('.sheet .chip:has-text("Family worries")').count() == 1, 'featured topics appear as chips')
    page.click('.sheet .chip:has-text("Family worries")')
    check('Topic: Family worries' in page.locator('.sheet textarea').first.input_value(), 'tapping a topic inserts a tag into the note')
    page.click('.sheet .chip:has-text("Family worries")')
    check(page.locator('.sheet textarea').first.input_value().count('Topic: Family worries') == 1, 'tapping twice does not duplicate it')
    page.locator('.sheet textarea').nth(1).fill('Ask about his shift change')
    check(page.locator('.sheet .check:has-text("Fall invitation")').count() == 1, 'visit dialog has the campaign toggle')
    page.click('.sheet button:has-text("Save visit")'); page.wait_for_selector('.toast:has-text("Visit saved")')
    check(ev('RV.store.rvById("%s").whatsNext' % ben) == 'Ask about his shift change', 'next time replaced by what was entered')
    newest = ev('RV.store.itemFor("%s").entries[0]' % ben)
    check(newest['type'] == 'visit' and newest['campaignId'] == campaign['id'], 'visit tagged with the active campaign by default')
    check(page.locator('.tl:has-text("Campaign: Fall invitation")').count() == 1, 'campaign shown on the timeline entry')
    page.click('button:has-text("Record visit")'); page.wait_for_selector('.sheet textarea')
    page.locator('.sheet .check input').uncheck()
    page.locator('.sheet textarea').first.fill('Short follow up')
    page.click('.sheet button:has-text("Save visit")'); page.wait_for_selector('.toast:has-text("Visit saved")')
    follow = ev('RV.store.itemFor("%s").entries.find(e=>e.text=="Short follow up")' % ben)
    check(follow and follow['campaignId'] is None, 'campaign toggle off leaves the visit untagged')
    ev('(id) => RV.store.updateRv(id, {stage: "study"})', ben)

    print('v2: day-tag overdue rule in the browser')
    res = ev('''() => { const ST = RV.store, dow = new Date().getDay(); const d = n => new Date(Date.now() - n*864e5).toISOString();
      const other = (dow + 3) % 7;
      const r = ST.addRv({name: 'Tagtest', stage: 'initial', createdAt: d(30), dayPrimary: {day: other, part: 'evening'}});
      ST.addEntry(r.id, 'visit', {text: 'x'}, d(10));
      const a = ST.itemFor(r.id).att;
      ST.updateRv(r.id, {dayPrimary: {day: dow, part: 'evening'}});
      const b = ST.itemFor(r.id).att;
      const r2 = ST.addRv({name: 'Tagtest2', stage: 'initial', createdAt: d(40), dayPrimary: {day: other, part: 'evening'}});
      ST.addEntry(r2.id, 'visit', {text: 'x'}, d(20));
      const c = ST.itemFor(r2.id).att;
      ST.deleteRv(r.id); ST.deleteRv(r2.id);
      return [a.state, !!a.waiting, b.state, c.state]; }''')
    check(res == ['ok', True, 'overdue', 'overdue'], 'tagged: waits for its day; overdue on its day; safety net after 2x: %s' % res)

    print('v2: Today and the 7-day forecast')
    ev('''() => { const ST = RV.store, dow = new Date().getDay(); const find = n => ST.S.rvs.find(r => r.name === n).id;
      ST.updateRv(find('Ben Carter'), {dayPrimary: {day: dow, part: 'evening'}, daySecondary: {day: (dow + 1) % 7, part: 'morning'}, whatsNext: ''});
      ST.updateRv(find('Dee Alvarez'), {dayPrimary: {day: dow, part: 'morning'}});
      const e = ST.addRv({name: 'Evening Person', stage: 'return', createdAt: new Date(Date.now() - 20*864e5).toISOString(), dayPrimary: {day: dow, part: 'evening'}});
      ST.addEntry(e.id, 'visit', {text: 'Chatted'}, new Date(Date.now() - 3*864e5).toISOString()); }''')
    page.goto(URL + '#/today'); page.wait_for_selector('.sec')
    heads = [t.strip().lower() for t in page.locator('.sec-head h2').all_inner_texts()]
    check('overdue' in heads and 'tagged for today' in heads and 'next 7 days' in heads, 'Today sections: %s' % heads)
    check('coming up' not in heads and 'recently added' not in heads, 'Today no longer lists coming up or recently added')
    check(page.locator('.sec:has(h2:text-is("Overdue")) .row:has-text("Eli Moore")').count() == 1, 'untagged overdue shows under Overdue')
    subs = [t.strip().lower() for t in page.locator('.sec:has(h2:text-is("Tagged for today")) .subhead').all_inner_texts()]
    check(subs == ['morning', 'evening'], 'tagged RVs grouped in natural part-of-day order: %s' % subs)
    check(page.locator('.sec:has(h2:text-is("Tagged for today")) .row:has-text("Dee Alvarez")').count() == 1, 'Dee (tagged today morning) listed')
    check(page.locator('.sec:has(h2:text-is("Tagged for today")) .row:has-text("Ben Carter")').count() == 0, 'Ben (tagged today) is not listed again: already visited today')
    check(page.locator('.sec:has(h2:text-is("Next 7 days")) .row:has-text("Chen Family")').count() == 1, 'planned visit (Chen, in 2 days) is in the forecast')
    check(page.locator('.sec:has(h2:text-is("Next 7 days")) .row:has-text("Ben Carter")').count() >= 1, 'secondary day shows Ben in the forecast')
    check(page.locator('.sec:has(h2:text-is("Overdue")) .row:has-text("Chen Family")').count() == 0, 'future planned visit is not on the overdue list')
    shot('14-today-v2')

    print('v2: Home look')
    page.goto(URL + '#/home'); page.wait_for_selector('.campaign-bar'); shot('15-home-v2')

    print('v2: campaigns in Settings, one at a time')
    page.goto(URL + '#/settings/campaigns'); page.wait_for_selector('.group-head')
    check(page.locator('.group-head:has-text("Active now")').count() == 1 and page.locator('.row:has-text("Fall invitation")').count() == 1, 'campaigns page lists the active one')
    s0 = ev('RV.util.toDateStr(new Date())'); s5 = ev('RV.util.toDateStr(RV.util.addDays(new Date(), 5))')
    s40 = ev('RV.util.toDateStr(RV.util.addDays(new Date(), 40))'); s50 = ev('RV.util.toDateStr(RV.util.addDays(new Date(), 50))')
    page.click('button:has-text("Add campaign")'); page.wait_for_selector('.sheet form')
    page.locator('.sheet input[type=text]').nth(0).fill('Overlapping')
    page.locator('.sheet input[type=date]').nth(0).fill(s0); page.locator('.sheet input[type=date]').nth(1).fill(s5)
    page.click('.sheet button[type=submit]')
    check('overlap' in page.locator('.sheet [role=alert]').inner_text().lower(), 'overlapping dates are blocked with a message')
    check(ev('RV.store.campaigns().length') == 1, 'overlapping campaign was not saved')
    page.locator('.sheet input[type=date]').nth(0).fill(s40); page.locator('.sheet input[type=date]').nth(1).fill(s50)
    page.locator('.sheet input[type=text]').nth(1).fill('Peace of mind')
    page.locator('.sheet textarea').nth(1).fill('Awake! magazine\nTract about hope')
    page.click('.sheet button[type=submit]'); time.sleep(0.2)
    check(ev('RV.store.campaigns().length') == 2 and page.locator('.group-head:has-text("Coming up")').count() == 1, 'a future campaign can be added ahead of time')
    page.goto(URL + '#/home'); page.wait_for_selector('.campaign-bar')
    check(page.locator('.campaign-bar:has-text("Fall invitation")').count() == 1, 'only the current campaign is shown on Home')
    page.click('.campaign-bar'); page.wait_for_selector('.sheet')
    check(page.locator('.sheet:has-text("Fall invitation")').count() == 1, 'tapping the banner opens its details')
    page.keyboard.press('Escape')
    page.goto(URL + '#/settings/lib/campaign'); page.wait_for_selector('.group-head')
    check(page.locator('h1:has-text("Campaign")').count() == 1, 'old campaign link still works')

    print('v2: Insights')
    ev('''() => { const ST = RV.store; const d = n => new Date(Date.now() - n*864e5).toISOString();
      const fut = RV.util.toDateStr(RV.util.addDays(new Date(), 30));
      const r = ST.addRv({name: 'Neverhome', stage: 'initial', createdAt: d(30), nextVisit: fut});
      [7, 14, 21].forEach(n => ST.addEntry(r.id, 'nh', {}, d(n)));
      ST.addRv({name: 'Stuckguy', stage: 'initial', createdAt: d(60), stageChangedAt: d(60), nextVisit: fut}); }''')
    page.goto(URL + '#/insights'); page.wait_for_selector('.funnel')
    check(page.locator('.frow').count() == 5, 'funnel shows the five active stages')
    check(page.locator('.tile').count() == 5, 'five 60-day tiles')
    pts = int(page.locator('.effort .num').inner_text())
    check(pts > 0 and 'Level' in page.locator('.level').inner_text(), 'effort points and level shown (%d)' % pts)
    check(page.locator('.sec:has(h2:text-is("Worth reconsidering")) .row:has-text("Neverhome")').count() == 1, 'Worth reconsidering lists repeated not-homes')
    check('Try' in page.locator('.sec:has(h2:text-is("Worth reconsidering")) .row:has-text("Neverhome")').inner_text(), 'and suggests something else')
    check(page.locator('.sec:has(h2:text-is("Stuck in stage")) .row:has-text("Stuckguy")').count() == 1, 'Stuck in stage lists long-stalled records')
    check(page.locator('.sec:has(h2:text-is("Worth reconsidering")) .row:has-text("Eli Moore")').count() == 0, 'pattern lists skip people already on Today')
    shot('16-insights')
    page.click('.frow:has-text("Bible Study")'); page.wait_for_selector('.sticky-filters')
    on = page.locator('.chip[aria-pressed="true"]').all_inner_texts()
    check(len(on) == 1 and on[0].startswith('Bible Study'), 'tapping a funnel stage opens the list filtered to it: %s' % on)
    ev('() => { const ST = RV.store; ST.S.rvs.filter(r => ["Neverhome","Stuckguy"].includes(r.name)).forEach(r => ST.deleteRv(r.id)); localStorage.removeItem("rvapp.list"); }')

    print('study stage: publication, where you are, log study')
    sid = ev("() => RV.store.addRv({ name: 'Study Person', address: '1 Study Way', stage: 'study', whatsNext: 'Review paragraph 3' }).id")
    page.goto(URL + '#/rv/' + sid); page.wait_for_selector('.snap')
    check(page.locator('.snap-row.study').count() == 1 and 'Choose a publication' in page.locator('.snap-row.study').inner_text(), 'study RV leads with a Studying block')
    check(page.locator('.snap-row:has-text("Last visit")').count() == 0, 'study RV does not lead with the last visit note')
    check(page.locator('button.btn.big:has-text("Log study")').count() == 1, 'primary button says Log study')
    check('Review paragraph 3' in page.locator('.snap-row.next').inner_text(), 'discuss next time still shows')
    page.click('.snap-row.study'); page.wait_for_selector('.sheet input')
    page.fill('.sheet input[placeholder="Publication"]', 'Enjoy Life Forever')
    page.fill('.sheet input[placeholder="Lesson, paragraph, page"]', 'Lesson 5, paragraph 12')
    page.click('.sheet button:has-text("Save")'); page.wait_for_selector('.sheet', state='detached')
    check('Enjoy Life Forever' in page.locator('.snap-row.study').inner_text() and 'Lesson 5, paragraph 12' in page.locator('.snap-row.study').inner_text(), 'publication and place can be set from the detail screen')
    page.click('button.btn.big:has-text("Log study")'); page.wait_for_selector('.sheet')
    check(page.locator('.sheet input[placeholder="Publication"]').input_value() == 'Enjoy Life Forever', 'Log study form is pre-filled with the publication')
    check(page.locator('.sheet .chips:has-text("Hope for the future")').count() == 0, 'Log study form has no topic chips')
    page.fill('.sheet input[placeholder="Last: Lesson 5, paragraph 12"]', 'Lesson 6, paragraph 3')
    page.fill('.sheet textarea[placeholder="Discuss next time"]', 'Ask about the picture on page 48')
    page.click('.sheet button:has-text("Save study")'); page.wait_for_selector('.sheet', state='detached')
    check('Lesson 6, paragraph 3' in page.locator('.snap-row.study').inner_text(), 'saving a study updates where you are')
    check('Ask about the picture' in page.locator('.snap-row.next').inner_text(), 'discuss next time is updated')
    check(page.locator('.tl li:has-text("Study")').count() == 1 and page.locator('.tl:has-text("Enjoy Life Forever")').count() == 1, 'timeline shows the study with its publication and place')
    check(ev("RV.store.S.entries.filter(e => e.rvId === '%s' && e.type === 'visit')[0].progress" % sid) == 'Lesson 6, paragraph 3', 'the study entry keeps its own progress')
    page.goto(URL + '#/rvs'); page.wait_for_selector('.row')
    check('Enjoy Life Forever · Lesson 6, paragraph 3' in page.locator('.row:has-text("Study Person")').inner_text(), 'list row shows publication and place')
    page.goto(URL + '#/rv/' + sid); page.wait_for_selector('.snap')
    ev("() => RV.store.setStage('%s', 'return')" % sid)
    page.wait_for_selector('button.btn.big:has-text("Record visit")')
    check(page.locator('.snap-row.study').count() == 0, 'leaving the study stage returns to the normal layout')
    ev("() => RV.store.setStage('%s', 'study')" % sid)

    print('settings pages open without errors')
    for sec in ['', 'display', 'home', 'lib/topic', 'lib/campaign', 'campaigns', 'stages', 'reasons', 'fields', 'labels', 'attention', 'security', 'data', 'about']:
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
    page.wait_for_selector('.sheet:has-text("rows")')
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

    print('Google Drive backup (fake Google)')
    page.goto(URL + '#/settings/data'); page.wait_for_selector('.view')
    check('not set up' in page.locator('.view').inner_text(), 'no client ID: Drive says it is not set up')
    check(ev("RV.drive._pure.parseAuthHash('#/home')") is None and ev("RV.drive._pure.parseAuthHash('#access_token=a&expires_in=10&state=s').token") == 'a', 'sign-in reply parsing ignores app routes')

    from urllib.parse import urlparse, parse_qs
    import datetime
    fake = {'file': None, 'mod': None, 'writes': 0, 'revoked': 0, 'deny': False}
    def iso(offset=0):
        return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=offset)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    def google_auth(route):
        q = parse_qs(urlparse(route.request.url).query)
        ru, state = q['redirect_uri'][0], q['state'][0]
        frag = 'error=access_denied&state=' + state if fake['deny'] else 'access_token=tok123&token_type=Bearer&expires_in=3599&scope=x&state=' + state
        route.fulfill(status=302, headers={'location': ru + '#' + frag}, body='')
    def google_api(route):
        req = route.request; u = urlparse(req.url); q = parse_qs(u.query); m = req.method
        jr = lambda obj, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(obj))
        if u.hostname == 'oauth2.googleapis.com': fake['revoked'] += 1; return route.fulfill(status=200, body='{}')
        if req.headers.get('authorization') != 'Bearer tok123': return jr({'error': 'auth'}, 401)
        if u.path == '/drive/v3/files' and m == 'GET':
            return jr({'files': [{'id': 'F1', 'modifiedTime': fake['mod']}] if fake['file'] else []})
        if u.path == '/drive/v3/files/F1' and m == 'GET':
            if not fake['file']: return jr({}, 404)
            return route.fulfill(status=200, content_type='application/json', body=fake['file']) if q.get('alt') == ['media'] else jr({'id': 'F1', 'modifiedTime': fake['mod']})
        if u.path == '/upload/drive/v3/files' and m == 'POST':
            body = req.post_data or ''
            fake['file'] = body.split('Content-Type: application/json\r\n\r\n')[-1].rsplit('\r\n--', 1)[0]
            fake['mod'] = iso(); fake['writes'] += 1
            return jr({'id': 'F1', 'modifiedTime': fake['mod']})
        if u.path == '/upload/drive/v3/files/F1' and m == 'PATCH':
            fake['file'] = req.post_data; fake['mod'] = iso(); fake['writes'] += 1
            return jr({'id': 'F1', 'modifiedTime': fake['mod']})
        return jr({'error': 'unexpected ' + m + ' ' + u.path}, 500)
    ctx.route('https://accounts.google.com/**', google_auth)
    ctx.route('https://www.googleapis.com/**', google_api)
    ctx.route('https://oauth2.googleapis.com/**', google_api)
    ctx.add_init_script("window.__RV_CLIENT_ID = 'test-client.apps.googleusercontent.com'")
    wait_for = lambda fn, t=6: next((True for _ in range(int(t * 10)) if fn() or page.wait_for_timeout(100)), False)
    drive_rvs = lambda: json.loads(fake['file'])['rvs'] if fake['file'] else []

    page.goto(URL + '#/settings/data'); page.reload(); page.wait_for_selector('.view'); page.wait_for_selector('.setrow')
    check(page.locator('button:has-text("Connect Google Drive")').count() == 1, 'with a client ID, Connect is offered')

    fake['deny'] = True
    page.click('button:has-text("Connect Google Drive")'); page.wait_for_selector('.toast')
    check('cancelled' in page.locator('.toast').first.inner_text(), 'cancelling sign-in shows a short message')
    check(ev('RV.drive.status().connected') is False, 'cancelled sign-in stays disconnected')
    fake['deny'] = False

    n_local = len([r for r in ev('RV.store.S.rvs') if not r.get('deletedAt')])
    page.goto(URL + '#/settings/data'); page.wait_for_selector('button:has-text("Connect Google Drive")')
    page.click('button:has-text("Connect Google Drive")')
    check(wait_for(lambda: fake['file'] is not None), 'connecting saves a backup file to Drive')
    page.wait_for_selector('button:has-text("Back up now")')
    check(page.evaluate('location.hash') == '#/settings/data' and 'access_token' not in page.url, 'the token is removed from the address bar')
    check(len([r for r in drive_rvs() if not r.get('deletedAt')]) == n_local, 'Drive file holds the same records as the device')
    check(ev('RV.drive.status().connected') is True and 'Saved' in page.locator('.view').inner_text(), 'Data page shows connected and when it last saved')

    writes = fake['writes']
    ev("() => RV.store.addRv({ name: 'Drive Test Person', stage: 'initial' })")
    ev("() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }")
    check(wait_for(lambda: any(r['name'] == 'Drive Test Person' for r in drive_rvs())), 'a change is saved to Drive when the app is left')
    ev("() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); }")
    check(fake['writes'] > writes, 'the existing Drive file is updated, not duplicated')

    # another device saved something in the meantime: it is merged in, not overwritten
    other = json.loads(fake['file'])
    other['rvs'].append({'id': 'from-other-device', 'name': 'Other Device Person', 'stage': 'initial', 'createdAt': iso(), 'updatedAt': iso()})
    fake['file'] = json.dumps(other); fake['mod'] = iso(60)
    page.goto(URL + '#/settings/data'); page.wait_for_selector('button:has-text("Back up now")')
    page.click('button:has-text("Back up now")')
    check(wait_for(lambda: ev("RV.store.S.rvs.some(r => r.id === 'from-other-device')")), 'records saved by another device are merged in')
    check(wait_for(lambda: any(r['id'] == 'from-other-device' for r in drive_rvs()) and any(r['name'] == 'Drive Test Person' for r in drive_rvs())), 'the merged result is what ends up in Drive')

    back = ev('async () => { const d = await RV.drive.fetchBackup(); return d && d.app; }')
    check(back == 'rv-app', 'Restore can read the backup back from Drive')

    # sign-in expired: changes wait, and the app says so
    ev("() => { const o = JSON.parse(localStorage.getItem('rvapp.drive')); o.expires = 0; o.dirty = false; localStorage.setItem('rvapp.drive', JSON.stringify(o)); }")
    page.goto(URL + '#/home'); page.reload(); page.wait_for_selector('.tabbar .tab')
    ev("() => RV.store.addRv({ name: 'Offline Of Drive', stage: 'yet' })")
    page.wait_for_selector('.banner:has-text("Drive backup paused")', timeout=4000)
    check(True, 'expired sign-in with unsaved changes shows a reconnect banner')
    page.click('.banner button:has-text("Reconnect")')
    check(wait_for(lambda: any(r['name'] == 'Offline Of Drive' for r in drive_rvs()), 8), 'reconnecting saves the waiting changes')

    page.goto(URL + '#/settings/data'); page.wait_for_selector('button:has-text("Disconnect")')
    page.click('button:has-text("Disconnect")'); page.click('.sheet button:has-text("Disconnect")')
    check(wait_for(lambda: ev('RV.drive.status().connected') is False) and fake['revoked'] == 1, 'Disconnect signs out and revokes the token')
    check(fake['file'] is not None, 'disconnecting leaves the backup file in Drive')

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
