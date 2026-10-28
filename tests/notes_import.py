"""Notes import test. Run: python3 -I tests/notes_import.py   (needs playwright + chromium)
Claude (through the helper) is faked with a Playwright route, so no key or network is needed."""
import http.server, socketserver, threading, os, sys, json, functools, time, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp/out/notes-shots'
os.makedirs(SHOTS, exist_ok=True)
PORT = 8771

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/'

fails, passes = [], 0
def check(cond, msg):
    global passes
    if cond: passes += 1; print('  ok  ' + msg)
    else: fails.append(msg); print('FAIL  ' + msg)

seen = []
mode = {'status': 200, 'fail_big': False}
def reply_for(notes):
    out = []
    for n in notes:
        t = n['text']
        if 'Ana' in t:
            out.append({'name': 'Ana Ruiz', 'address': '12 Elm St', 'phone': '', 'notes': 'Two kids. Likes gardening.', 'discussNext': 'Bring the family brochure',
                        'nextVisit': '', 'study': False, 'visits': [{'date': '2026-10-03', 'type': 'visit', 'text': 'Read Psalm 37:29.'}, {'date': '2026-10-10', 'type': 'nh', 'text': ''}], 'source': n['id']})
        if 'Ben' in t:
            out.append({'name': 'Ben Carter', 'address': '4 Oak Ave', 'phone': '209-555-0100', 'notes': 'Studies Tuesdays.', 'discussNext': '', 'nextVisit': '2026-11-03', 'study': True, 'visits': [], 'source': n['id']})
        if 'Old Friend' in t:
            out.append({'name': 'Old Friend', 'address': '99 Pine St', 'notes': 'Already known.', 'visits': [], 'source': n['id']})
    return out

def helper(route):
    req = route.request
    cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST', 'content-type': 'application/json'}
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers=cors)
    body = json.loads(req.post_data or '{}')
    user = json.loads(body['messages'][0]['content'])
    seen.append({'system': body.get('system', ''), 'user': user, 'model': body.get('model')})
    if mode['status'] != 200:
        return route.fulfill(status=mode['status'], headers=cors, body=json.dumps({'error': 'daily_limit'}))
    if mode['fail_big'] and len(user['notes']) > 1:
        return route.fulfill(status=200, headers=cors, body=json.dumps({'content': [{'type': 'text', 'text': '{"contacts": [ {"name": "cut off'}]}))
    text = json.dumps({'contacts': reply_for(user['notes'])})
    return route.fulfill(status=200, headers=cors, body=json.dumps({'content': [{'type': 'text', 'text': text}]}))

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, service_workers='block')
    ctx.route('https://ai.test/**', helper)
    ctx.add_init_script('window.__RV_SURPRISE = 0; window.__RV_STARTER = "off"; window.__RV_AI_PROXY = "https://ai.test"')
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'status of' not in m.text else None)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    ev = page.evaluate
    shot = lambda n: page.screenshot(path=f'{SHOTS}/{n}.png', full_page=True)

    page.goto(URL); page.wait_for_selector('.tabbar .tab')
    ev('''() => RV.store.addRv({name:'Old Friend', address:'99 Pine St', stage:'return'})''')
    ev('RV.store.flush()')

    print('entry points')
    page.goto(URL + '#/settings/data'); page.wait_for_selector('text=Import from a notes app')
    page.click('text=Import from a notes app'); page.wait_for_selector('text=Bring in your notes')
    check('#/settings/notes' in page.url, 'Backup and import opens the notes import')
    shot('01-pick-empty')

    print('choose files and paste')
    with page.expect_file_chooser() as fc:
        page.click('button:has-text("Choose files")')
    chooser = fc.value
    check(chooser.is_multiple(), 'file picker allows many files')
    chooser.set_files([
        {'name': 'Ana.txt', 'mimeType': 'text/plain', 'buffer': 'Ana 12 elm st two kids likes gardening\n10/3 read ps 37 29\n10/10 nh\nnext time bring family brochure'.encode()},
        {'name': 'Ben.txt', 'mimeType': 'text/plain', 'buffer': b'Ben Carter 4 oak ave 209-555-0100 studies tuesdays'},
        {'name': 'photo.jpg', 'mimeType': 'image/jpeg', 'buffer': b'\xff\xd8\x00'},
    ])
    page.wait_for_selector('text=2 notes ready')
    check(page.locator('text=Not notes, left out: photo.jpg').count() == 1, 'non-text file listed as left out')
    page.fill('textarea', 'Old Friend 99 pine st')
    page.click('button:has-text("Add pasted note")'); page.wait_for_selector('text=3 notes ready')
    shot('02-pick-ready')

    print('read with Claude (one bad batch is split and retried)')
    mode['fail_big'] = True
    page.click('button:has-text("Read 3 notes with Claude")')
    page.wait_for_selector('text=people found', timeout=20000)
    check(len(seen) >= 3, 'a reply cut short is retried note by note')
    s0 = seen[0]
    check('one contact per person' in s0['system'].lower() and 'never summarize' in s0['system'].lower(), 'mapping rules sent')
    check(re.match(r'\d{4}-\d{2}-\d{2}$', s0['user']['today'] or '') is not None and s0['user']['notes'][0]['title'] == 'Ana', 'notes sent with titles and today')
    check(page.locator('.nicard').count() == 3, 'three people found')
    dup = page.locator('.nicard', has=page.locator('text=already in Groundwork'))
    check(dup.count() == 1 and not dup.locator('input[type=checkbox]').is_checked(), 'possible duplicate flagged and unticked')
    check(page.locator('button:has-text("Import 2")').count() == 1, 'import count follows the ticks')
    shot('03-review')
    card_of = lambda nm: page.locator('.nicard').nth(ev(f"[...document.querySelectorAll('.nicard .niname')].findIndex(i => i.value === '{nm}')"))
    ana = card_of('Ana Ruiz')
    ana.locator('button:has-text("Show all")').click()
    check(ana.locator('text=Bring the family brochure').count() == 1 and ana.locator('text=Not home').count() == 1, 'Show all lists notes, next time and visits')
    shot('04-review-open')
    bn = card_of('Ben Carter').locator('.niname'); bn.fill('Ben Carter Jr'); bn.dispatch_event('change')

    print('import')
    page.click('button:has-text("Import 2")'); page.wait_for_selector('.toast:has-text("Imported 2")')
    rvs = ev('RV.store.S.rvs.filter(r => !r.deletedAt).map(r => ({name: r.name, stage: r.stage, next: r.whatsNext, nv: r.nextVisit, imp: r.imported, addr: r.address}))')
    names = sorted(r['name'] for r in rvs)
    check(names == ['Ana Ruiz', 'Ben Carter Jr', 'Old Friend'], 'two added, duplicate left out, edited name kept')
    ben = next(r for r in rvs if r['name'] == 'Ben Carter Jr'); ana_r = next(r for r in rvs if r['name'] == 'Ana Ruiz')
    check(ben['stage'] == 'study' and ana_r['stage'] == 'initial', 'Bible study goes to Bible Study, others to the chosen stage')
    check(ana_r['next'] == 'Bring the family brochure' and ben['nv'] == '2026-11-03' and ana_r['imp'] is True, 'Discuss next time and next visit date kept')
    ents = ev('''() => { const a = RV.store.S.rvs.find(r => r.name === 'Ana Ruiz'); return RV.store.S.entries.filter(e => e.rvId === a.id).map(e => e.type + ' ' + e.at.slice(0,10) + ' ' + e.text).sort(); }''')
    check(ents == ['nh 2026-10-10 ', 'visit 2026-10-03 Read Psalm 37:29.'], 'dated visits and not-at-homes on the timeline')
    time.sleep(0.6); shot('05-after-import')
    check('#/rvs' in page.url, 'lands on Contacts')

    print('daily limit: what was read can still be imported')
    mode.update(status=429, fail_big=False)
    page.goto(URL + '#/settings/notes'); page.wait_for_selector('text=Bring in your notes')
    page.fill('textarea', 'Ana again'); page.click('button:has-text("Add pasted note")')
    page.click('button:has-text("Read note with Claude")'); page.wait_for_selector('text=wasn’t read')
    check(page.locator('text=More tomorrow').count() == 1, 'calm limit message shown')
    page.click('button:has-text("Start over")'); page.click('.dialog button:has-text("Start over"), .sheet button:has-text("Start over"), [role=dialog] button:has-text("Start over")')
    page.wait_for_selector('text=Bring in your notes')
    mode['status'] = 200
    check(not errors, 'no console errors' + ('' if not errors else ': ' + '; '.join(errors[:3])))
    ctx.close()

    print('shared from another app (Android share sheet, real service worker)')
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='allow')
    ctx2.route('https://ai.test/**', helper)
    ctx2.add_init_script('window.__RV_SURPRISE = 0; window.__RV_STARTER = "off"; window.__RV_AI_PROXY = "https://ai.test"')
    p2 = ctx2.new_page()
    p2.goto(URL); p2.wait_for_selector('.tabbar .tab')
    p2.evaluate('navigator.serviceWorker.ready.then(() => true)')
    p2.reload(); p2.wait_for_selector('.tabbar .tab')
    p2.wait_for_function('navigator.serviceWorker.controller !== null', timeout=20000)
    res = p2.evaluate('''async () => {
      const fd = new FormData();
      fd.append('title', 'Elm St'); fd.append('text', 'Ana 12 elm st likes gardening');
      fd.append('files', new File(['Ben Carter 4 oak'], 'Ben.txt', { type: 'text/plain' }));
      const r = await fetch('./share-target', { method: 'POST', body: fd });
      return { url: r.url, redirected: r.redirected, cached: (await (await caches.open('rvapp-share')).keys()).length };
    }''')
    print('   ', res); check(res['cached'] == 2 and res['url'].split('#')[0].rstrip('/') == URL.rstrip('/'), 'shared text and file kept for the import screen')
    p2.goto(URL + '#/home'); p2.reload(); p2.wait_for_selector('text=2 notes ready', timeout=10000)
    check('#/settings/notes' in p2.url, 'opening the app with shared notes waiting goes to the import')
    check(p2.locator('.nititle', has_text='Elm St').count() == 1 and p2.locator('.nititle', has_text='Ben').count() == 1, 'shared notes appear, titled')
    check(p2.evaluate("caches.open('rvapp-share').then(c => c.keys()).then(k => k.length)") == 0, 'share cache emptied')
    mf = json.load(open(os.path.join(ROOT, 'manifest.webmanifest')))
    check(mf.get('share_target', {}).get('action') == './share-target', 'manifest offers Groundwork in the share menu')
    ctx2.close()
    b.close()

httpd.shutdown()
print(f'\n{passes} passed, {len(fails)} failed')
sys.exit(1 if fails else 0)
