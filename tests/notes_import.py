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
    content = body['messages'][0]['content']
    if isinstance(content, list):
        user = json.loads(content[0]['text']); user['notes'] = []
        user['images'] = [c for c in content if c.get('type') == 'image']
        seen.append({'system': body.get('system', ''), 'user': user, 'model': body.get('model')})
        out = [{'name': 'Cara Diaz', 'address': '7 Birch Ln', 'notes': 'From a screenshot.', 'visits': [{'date': '2026-10-20', 'type': 'visit', 'text': 'Talked about Daniel 2.'}], 'source': user['screenshots'][0]['id']}]
        if mode.get('multi'):
            out.append({'name': 'Dan Diaz', 'address': '9 Birch Ln', 'notes': 'Neighbor.', 'visits': [], 'source': user['screenshots'][0]['id']})
        return route.fulfill(status=200, headers=cors, body=json.dumps({'content': [{'type': 'text', 'text': json.dumps({'contacts': out})}]}))
    user = json.loads(content)
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
    ev("() => { RV.store.saveSettings(s => { s.lists.neighborhoods = ['Elm Park', 'Oak Hill'] }); }")
    ev('RV.store.flush()')

    print('entry points')
    page.goto(URL + '#/settings/data'); page.click('.setrow:has-text("Import contacts")')
    page.click('.setrow:has-text("A notes app")'); page.wait_for_selector('text=Bring in your notes')
    check('#/settings/notes' in page.url, 'Import contacts › A notes app opens the notes import')
    check(page.locator('text=How to get notes out').count() == 0, 'no how-to section')
    order = ev("[...document.querySelectorAll('.nihero .nibig .t, .nilink')].map(e => e.textContent)")
    check(order[:2] == ['Paste a note', 'Upload screenshots'] and page.locator('.nilink', has_text='Text files or a Google Keep export').count() == 1, 'paste first, screenshots second, text files as a small link')
    check(page.locator('text=Add as many notes as you like, then turn them all into contacts at once.').count() == 1, 'helper line')
    check('null' not in page.inner_text('#app'), 'no stray null text')
    shot('01-pick-empty')

    print('paste from the clipboard, then the paste box when it is blocked')
    ev("() => { navigator.clipboard.readText = async () => 'Ana 12 elm st two kids likes gardening\\n10/3 read ps 37 29\\n10/10 nh\\nnext time bring family brochure'; }")
    page.click('.nibig:has-text("Paste a note")'); page.wait_for_selector('text=1 note ready')
    ev("() => { navigator.clipboard.readText = async () => { throw new Error('denied') }; }")
    page.click('.nibig:has-text("Paste a note")'); page.wait_for_selector('.nipaste textarea')
    page.fill('.nipaste textarea', 'Ben Carter 4 oak ave 209-555-0100 studies tuesdays'); page.click('.nipaste button:has-text("Add note")')
    page.wait_for_selector('text=2 notes ready')
    page.fill('.nipaste textarea', 'Old Friend 99 pine st'); page.click('.nipaste button:has-text("Add note")')
    page.wait_for_selector('text=3 notes ready')
    page.click('button:has-text("Done pasting")'); page.wait_for_selector('.nibig:has-text("Paste a note")')

    print('text files still work (small link)')
    with page.expect_file_chooser() as fc:
        page.click('.nilink')
    check(fc.value.is_multiple(), 'file picker allows many files')
    fc.value.set_files([{'name': 'photo.jpg', 'mimeType': 'image/jpeg', 'buffer': b'\xff\xd8\x00'}])
    page.wait_for_selector('text=Left out (not notes): photo.jpg')

    print('screenshots')
    import io
    from PIL import Image as PImage
    def png(color):
        buf = io.BytesIO(); PImage.new('RGB', (1080, 2400), color).save(buf, 'PNG'); return buf.getvalue()
    with page.expect_file_chooser() as fc:
        page.click('.nibig:has-text("Upload screenshots")')
    check(fc.value.is_multiple(), 'screenshot picker allows many')
    fc.value.set_files([{'name': 'Screenshot_1.png', 'mimeType': 'image/png', 'buffer': png('white')}, {'name': 'Screenshot_2.png', 'mimeType': 'image/png', 'buffer': png('#eee')}])
    page.wait_for_selector('text=5 notes ready')
    check(page.locator('.nirow .nititle', has_text='2 screenshots').count() == 1, 'screenshots taken together show as one group')
    sizes = ev("(() => { const i = document.querySelector('.nithumb'); return [i.naturalWidth, i.naturalHeight]; })()")
    check(max(sizes) <= 1500, 'screenshots shrunk before sending')
    shot('02-pick-ready')

    print('make contacts (one bad batch is split and retried)')
    mode['fail_big'] = True
    page.click('button:has-text("Make contacts from 5 notes")')
    page.wait_for_selector('text=people found', timeout=20000)
    s0 = seen[0]
    check('one contact per person' in s0['system'].lower() and 'never summarize' in s0['system'].lower() and 'screenshots' in s0['system'].lower(), 'mapping rules sent, with screenshot rules')
    check(s0['user']['notes'][0]['title'] == 'Pasted note 1', 'notes sent with titles')
    img = next((x for x in seen if x['user'].get('images')), None)
    check(img is not None and len(img['user']['images']) == 2 and img['user']['images'][0]['source']['media_type'] == 'image/jpeg', 'both screenshots sent together as JPEG')
    check(page.locator('.nicard').count() == 4, 'four people found')
    dup = page.locator('.nicard', has=page.locator('text=already in Groundwork'))
    check(dup.count() == 1 and not dup.locator('input[type=checkbox]').is_checked(), 'possible duplicate flagged and unticked')
    check(page.locator('button:has-text("Import 3")').count() == 1, 'import count follows the ticks')
    check(page.locator('.nicard', has_text='Cara Diaz').locator('text=From Screenshots').count() == 1, 'screenshot source shown')
    shot('03-review')

    print('select all / none, neighborhoods')
    page.click('.niselect button:has-text("Select none")'); page.wait_for_selector('button:has-text("Import"):disabled')
    page.click('.niselect button:has-text("Select all")'); page.wait_for_selector('button:has-text("Import 4")')
    page.locator('.nicard', has_text='Old Friend').locator('input[type=checkbox]').uncheck(); page.wait_for_selector('button:has-text("Import 3")')
    page.select_option('.card .niarea >> nth=0', 'Elm Park'); time.sleep(0.2)
    check(ev("RV.store.S.rvs.length") == 1 and page.locator('.nicard select.niarea').evaluate_all("els => els.filter(e => e.closest('.nicard') && !e.closest('.nicard').classList.contains('off')).every(e => e.value === 'Elm Park')"), 'Set neighborhood for ticked applies to everyone ticked')
    page.locator('.nicard', has_text='Ben Carter').locator('select.niarea').select_option('Oak Hill')

    print('edit details')
    page.locator('.nicard', has_text='Ana Ruiz').locator('button:has-text("Edit details")').click()
    page.wait_for_selector('.sheet h2:has-text("Edit details")')
    sh = page.locator('.sheet')
    check(sh.locator('text=From the note, added on import').count() == 1 and sh.locator('text=Read Psalm 37:29.').count() == 1, 'the form shows the visits from the note')
    check(sh.locator('textarea').evaluate_all("t => t.some(x => x.value === 'Bring the family brochure')"), 'Discuss next time filled')
    shot('04-edit-details')
    sh.locator('input[type=text]').first.fill('Ana Ruiz-Lopez')
    sh.locator('button:has-text("Done")').click(); page.wait_for_selector('.niedited')
    check(page.locator('.nicard', has_text='Ana Ruiz-Lopez').locator('.niedited').count() == 1, 'edited card marked')
    check(ev("RV.store.S.rvs.length") == 1, 'nothing saved before Import')
    shot('05-review-edited')

    print('import')
    page.click('button:has-text("Import 3")'); page.wait_for_selector('.toast:has-text("Imported 3")')
    page.wait_for_selector('text=Just imported')
    check('#/rvs/imported' in page.url and page.locator('text=Ana Ruiz-Lopez').count() >= 1, 'lands on the people just imported')
    rvs = ev('RV.store.S.rvs.filter(r => !r.deletedAt).map(r => ({name: r.name, stage: r.stage, next: r.whatsNext, nv: r.nextVisit, imp: r.imported, area: r.neighborhood}))')
    names = sorted(r['name'] for r in rvs)
    check(names == ['Ana Ruiz-Lopez', 'Ben Carter', 'Cara Diaz', 'Old Friend'], 'three added, duplicate left out, edited name kept')
    by = {r['name']: r for r in rvs}
    check(by['Ben Carter']['stage'] == 'study' and by['Ana Ruiz-Lopez']['stage'] == 'initial', 'Bible study goes to Bible Study, others to the chosen stage')
    check(by['Ana Ruiz-Lopez']['area'] == 'Elm Park' and by['Ben Carter']['area'] == 'Oak Hill' and by['Cara Diaz']['area'] == 'Elm Park', 'neighborhoods kept')
    check(by['Ana Ruiz-Lopez']['next'] == 'Bring the family brochure' and by['Ben Carter']['nv'] == '2026-11-03', 'Discuss next time and next visit date kept')
    ents = ev("""() => { const a = RV.store.S.rvs.find(r => r.name === 'Ana Ruiz-Lopez'); return RV.store.S.entries.filter(e => e.rvId === a.id).map(e => e.type + ' ' + e.at.slice(0,10) + ' ' + e.text).sort(); }""")
    check(ents == ['nh 2026-10-10 ', 'visit 2026-10-03 Read Psalm 37:29.'], 'dated visits and not-at-homes on the timeline')
    shot('06-just-imported')

    print('daily limit: what was found can still be imported')
    mode.update(status=429, fail_big=False)
    page.goto(URL + '#/settings/notes'); page.wait_for_selector('text=Bring in your notes')
    ev("() => { navigator.clipboard.readText = async () => 'Ana again'; }")
    page.click('.nibig:has-text("Paste a note")'); page.wait_for_selector('text=1 note ready')
    page.click('button:has-text("Make contacts from this note")'); page.wait_for_selector('text=left for later')
    check(page.locator('text=More tomorrow').count() == 1, 'calm limit message shown')
    page.click('button:has-text("Start over")'); page.click('.dialog button:has-text("Start over"), .sheet button:has-text("Start over"), [role=dialog] button:has-text("Start over")')
    page.wait_for_selector('text=Bring in your notes')
    mode['status'] = 200

    print('quick add: fill from a note')
    page.goto(URL + '#/home'); page.wait_for_selector('.tabbar .tab')
    ev('RV.forms.quickAdd()'); page.wait_for_selector('.sheet .fillbox')
    check('null' not in page.locator('.sheet').inner_text(), 'no stray null text in quick add')
    shot('07-quickadd')
    ev("() => { navigator.clipboard.readText = async () => 'Ana 12 elm st two kids likes gardening 10/3 read ps 37 29 10/10 nh next time bring family brochure'; }")
    store_before = ev('RV.store.S.rvs.length')
    page.click('.fillchip:has-text("Paste")'); page.wait_for_selector('text=Filled from your note')
    sh = page.locator('.sheet')
    check(sh.locator('input[type=text]').first.input_value() == 'Ana Ruiz' and sh.locator('text=From the note, added when you add').count() == 1, 'form filled, visits listed')
    check(ev('RV.store.S.rvs.length') == store_before, 'nothing saved until Add')
    shot('08-quickadd-filled')
    sh.locator('button:has-text("Add")').last.click()
    page.wait_for_selector('text=Possible duplicate'); page.click('button:has-text("Save anyway")')
    page.wait_for_selector('.toast:has-text("Added Ana Ruiz")')
    ents = ev("""() => { const a = RV.store.S.rvs.filter(r => r.name === 'Ana Ruiz').pop(); return RV.store.S.entries.filter(e => e.rvId === a.id).map(e => e.type + ' ' + e.at.slice(0,10)).sort(); }""")
    check(ents == ['nh 2026-10-10', 'visit 2026-10-03'], 'note visits on the timeline, no made-up visit today')

    print('quick add: a screenshot with several people goes to the review list')
    mode['multi'] = True
    ev('RV.forms.quickAdd()'); page.wait_for_selector('.sheet .fillbox')
    with page.expect_file_chooser() as fc:
        page.click('.fillchip:has-text("Screenshots")')
    fc.value.set_files([{'name': 'Screenshot_9.png', 'mimeType': 'image/png', 'buffer': png('white')}])
    page.wait_for_selector('text=This note has 2 people')
    page.click('button:has-text("See all 2")'); page.wait_for_selector('text=2 people found')
    check('#/settings/notes' in page.url and page.locator('.nicard').count() == 2, 'several people open in the review list')
    mode['multi'] = False
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
