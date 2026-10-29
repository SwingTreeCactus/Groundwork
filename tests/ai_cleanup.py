"""Note cleanup (Claude) test. Run: python3 -I tests/ai_cleanup.py   (needs playwright + chromium)
The Anthropic API is faked with a Playwright route, so no key or network is needed."""
import http.server, socketserver, threading, os, sys, json, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp/out/ai-shots'
os.makedirs(SHOTS, exist_ok=True)
PORT = 8767

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/'

fails, passes = [], 0
def check(cond, msg):
    global passes
    if cond: passes += 1; print('  ok  ' + msg)
    else: fails.append(msg); print('FAIL  ' + msg)

KEY = 'sk-ant-test-key-123'
mode = {'status': 200, 'reply': None}
seen = []

def api(route):
    req = route.request
    if req.method == 'OPTIONS':
        return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST'})
    body = json.loads(req.post_data or '{}')
    seen.append({'headers': req.headers, 'body': body})
    cors = {'access-control-allow-origin': '*', 'content-type': 'application/json'}
    if mode['status'] != 200:
        return route.fulfill(status=mode['status'], headers=cors, body=json.dumps({'type': 'error', 'error': {'type': 'x', 'message': 'nope'}}))
    text = mode['reply'] if mode['reply'] is not None else 'OK'
    return route.fulfill(status=200, headers=cors, body=json.dumps({'content': [{'type': 'text', 'text': text}]}))

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        locale='en-US', timezone_id='America/Los_Angeles', service_workers='block')
    ctx.route('https://api.anthropic.com/**', api)
    ctx.add_init_script('window.__RV_SURPRISE = 0; window.__RV_STARTER = "off"; window.__RV_AI_PROXY = ""') # own-key mode first; no surprise visitors unless a test asks
    ctx.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body='{"version":8,"sources":{},"layers":[]}'))  # v2.38: Contacts opens on the map
    ctx.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body='[]'))
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'api.anthropic.com' not in m.text and 'status of' not in m.text else None)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    ev = page.evaluate
    shot = lambda n: page.screenshot(path=f'{SHOTS}/{n}.png')

    page.goto(URL); page.wait_for_selector('.tabbar .tab')
    rid = ev('''() => { const r = RV.store.addRv({name:'Ana Ruiz', address:'12 Elm St', stage:'return'}); return r.id; }''')
    ev('RV.store.flush()')

    print('without a key')
    ev(f'RV.forms.visitDialog("{rid}")'); page.wait_for_selector('.sheet')
    check(page.locator('.sheet .btn.cleanup').count() == 0, 'no Clean up button without a key')
    page.click('.sheet button:has-text("Cancel")'); time.sleep(0.3)

    print('settings page')
    page.goto(URL + '#/settings/ai'); page.wait_for_selector('text=Note cleanup is off')
    check(page.locator('.banner .body', has_text='sent to Anthropic').count() == 1, 'privacy line shown')
    shot('01-settings-off')
    mode.update(status=401)
    page.fill('input[type=password]', 'bad-key'); page.click('button:has-text("Save key")')
    page.wait_for_selector('text=The API key was not accepted.')
    check(ev('RV.ai.hasKey()') is False, 'rejected key is not kept')
    mode.update(status=200, reply='OK')
    page.fill('input[type=password]', KEY); page.click('button:has-text("Save key")')
    page.wait_for_selector('text=Note cleanup is on')
    check(ev('RV.ai.key()') == KEY, 'key saved on this device')
    h = seen[-1]['headers']
    check(h.get('x-api-key') == KEY and h.get('anthropic-dangerous-direct-browser-access') == 'true' and h.get('anthropic-version'), 'request headers set for direct browser access')
    check(seen[-1]['body']['model'] == 'claude-haiku-5-5', 'default model is Haiku')
    page.click('.seg button:has-text("Careful")')
    check(ev('RV.ai.model()') == 'claude-sonnet-5-5', 'model choice saved')
    page.click('.seg button:has-text("Fast")')
    shot('02-settings-on')
    check(KEY not in json.dumps(ev('RV.store.exportAll()')), 'key is not in the backup')

    print('clean up a visit note')
    page.goto(URL + '#/rv/' + rid); page.wait_for_selector('h1')
    ev(f'RV.forms.visitDialog("{rid}")'); page.wait_for_selector('.sheet .btn.cleanup')
    raw = 'um so she said uh her husband is back from fresno we read john three sixteen next time bring the brochure about family'
    page.locator('.sheet textarea').first.fill(raw)
    shot('03-writing-view')
    clean = 'So she said her husband is back from Fresno. We read John 3:16. Next time, bring the brochure about family.'
    mode['reply'] = json.dumps({'note': clean, 'discussNext': 'Bring the brochure about family.'})
    page.click('.sheet .btn.cleanup'); page.wait_for_selector('.toast:has-text("Added to Discuss next time")')
    sent = json.loads(seen[-1]['body']['messages'][0]['content'])
    check(sent['note'] == raw and sent['discussNext'] == '', 'only the note and Discuss next time are sent')
    tas = page.locator('.sheet textarea')
    check(tas.nth(0).input_value() == clean, 'note replaced with cleaned text, next-time item still in it')
    check(tas.nth(1).input_value() == 'Bring the brochure about family.', 'next-time item copied to Discuss next time')
    check('Never delete' in seen[-1]['body']['system'] and 'It is a copy' in seen[-1]['body']['system'], 'light-touch, copy-not-move instructions sent')
    shot('04-cleaned')
    page.click('.toast button:has-text("Undo")')
    check(tas.nth(0).input_value() == raw and tas.nth(1).input_value() == '', 'Undo restores both fields')

    print('keeps existing Discuss next time')
    page.click('.sheet .show-fields')
    tas.nth(1).fill('Ask about the convention')
    tas.nth(0).fill('tidy note')
    mode['reply'] = 'Sure! ' + json.dumps({'note': 'Tidy note.', 'discussNext': 'Bring the brochure.'})
    page.click('.sheet .btn.cleanup'); page.wait_for_selector('.toast:has-text("Cleaned up")')
    check(tas.nth(1).input_value().startswith('Ask about the convention'), 'existing next-time text is never dropped')
    check(tas.nth(0).input_value() == 'Tidy note.', 'JSON found even with extra words around it')

    print('too much cut keeps the note')
    long = 'she has three kids and works nights at the hospital her mother lives with them and she likes gardening on weekends'
    tas.nth(0).fill(long)
    mode['reply'] = json.dumps({'note': 'She has three kids and likes gardening.', 'discussNext': ''})
    page.click('.sheet .btn.cleanup'); page.wait_for_selector('.toast:has-text("changed too much")')
    check(tas.nth(0).input_value() == long, 'note kept when Claude cut details')
    check(ev("RV.ai.cutTooMuch('um uh john three sixteen we read it', 'John 3:16 we read it.')") is False, 'filler and scripture numbers are not counted as cuts')

    print('errors keep the note')
    tas.nth(0).fill('keep me')
    mode.update(status=529)
    page.click('.sheet .btn.cleanup'); page.wait_for_selector('.toast:has-text("busy")')
    check(tas.nth(0).input_value() == 'keep me', 'note kept when Claude is busy')
    mode.update(status=200, reply='not json at all')
    page.click('.sheet .btn.cleanup'); page.wait_for_selector('.toast:has-text("unexpected")')
    check(tas.nth(0).input_value() == 'keep me', 'note kept on a bad reply')
    ctx.set_offline(True)
    page.click('.sheet .btn.cleanup'); page.wait_for_selector('.toast:has-text("No connection")')
    check(tas.nth(0).input_value() == 'keep me', 'note kept offline')
    ctx.set_offline(False)
    page.click('.sheet button:has-text("Save visit")')
    page.wait_for_selector('.toast:has-text("Visit saved"), .grow-ov, .evo-ov')
    for ov in ['.grow-ov', '.evo-ov']:
        if page.locator(ov).count(): page.wait_for_timeout(300); page.click(ov)  # v2.37: growth moments wait for a tap
    page.wait_for_selector('.toast:has-text("Visit saved")')
    check(ev(f'RV.store.S.entries.filter(e=>e.rvId=="{rid}" && e.type=="visit").length') == 1, 'visit still saves normally')

    print('new RV form')
    page.goto(URL + '#/home'); page.wait_for_selector('.tabbar .tab')
    ev('RV.forms.quickAdd()'); page.wait_for_selector('.sheet .btn.cleanup')
    mode.update(status=200, reply=json.dumps({'note': 'Met at the door. Likes gardening.', 'discussNext': ''}))
    page.locator('.sheet textarea').first.fill('met at the door uh likes gardening')
    page.click('.sheet .btn.cleanup'); page.wait_for_selector('.toast:has-text("Cleaned up")')
    check(page.locator('.sheet textarea').first.input_value() == 'Met at the door. Likes gardening.', 'New RV note cleaned')
    shot('05-new-rv')

    print('study log has Clean up too (v2.36.2), proofreading only')
    page.keyboard.press('Escape'); time.sleep(0.3)
    sid = ev('''() => RV.store.addRv({name:'Ben Carter', stage:'study'}).id''')
    ev(f'RV.forms.visitDialog("{sid}")'); page.wait_for_selector('.sheet')
    check(page.locator('.sheet .btn.cleanup').count() == 1, 'Clean up on Log study')
    page.locator('.sheet textarea').first.fill('we talked about um prayer')
    mode['reply'] = json.dumps({'note': 'We talked about prayer.', 'discussNext': 'Ask about prayer.'})
    page.click('.sheet .btn.cleanup'); page.wait_for_selector('.toast:has-text("Cleaned up")')
    sent = json.loads(seen[-1]['body']['messages'][0]['content'])
    check(page.locator('.sheet textarea').first.input_value() == 'We talked about prayer.' and sent['discussNext'] == '', 'study note cleaned; nothing moved to Discuss next time')
    print('meaning check (v2.37): unclear phrases are listed, not guessed')
    page.locator('.sheet textarea').first.fill('she was surprised he would ask the question that he did')
    mode['reply'] = json.dumps({'note': 'She was surprised he would ask the question that he did.', 'discussNext': '', 'unsure': ['he would ask the question that he did', 'not in the note']})
    page.click('.sheet .btn.cleanup'); page.wait_for_selector('.sheet .unsure .chip')
    check(page.locator('.sheet .unsure .chip').count() == 1, 'only phrases really in the note are listed')
    page.click('.sheet .unsure .chip')
    sel = ev('''() => { const t = document.querySelector('.sheet textarea'); return t.value.slice(t.selectionStart, t.selectionEnd); }''')
    check(sel == 'he would ask the question that he did', 'tapping it selects those words in the note')
    check('Meaning check' in seen[-1]['body']['system'] and 'what happens when we die' in seen[-1]['body']['system'], 'meaning-check rules and the worked example are sent')
    page.locator('.sheet textarea').first.type(' ok')
    check(page.locator('.sheet .unsure').count() == 0, 'the list goes away once the note is edited')

    print('remove key')
    page.keyboard.press('Escape'); time.sleep(0.3)
    page.goto(URL + '#/settings/ai'); page.wait_for_selector('button:has-text("Remove key")')
    page.click('button:has-text("Remove key")'); page.wait_for_selector('text=Note cleanup is off')
    check(ev('RV.ai.hasKey()') is False, 'key removed')

    print('shared helper (everyone, no key)')
    pseen = []
    pmode = {'status': 200, 'body': None}
    def helper(route):
        req = route.request
        cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST', 'content-type': 'application/json'}
        if req.method == 'OPTIONS': return route.fulfill(status=204, headers=cors)
        pseen.append({'url': req.url, 'headers': req.headers, 'body': json.loads(req.post_data or '{}')})
        body = pmode['body'] or {'content': [{'type': 'text', 'text': json.dumps({'note': 'Shared tidy.', 'discussNext': ''})}]}
        return route.fulfill(status=pmode['status'], headers=cors, body=json.dumps(body))
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, service_workers='block')
    ctx2.route('https://ai.test/**', helper)
    ctx2.route('https://api.anthropic.com/**', api)
    ctx2.add_init_script('window.__RV_SURPRISE = 0; window.__RV_STARTER = "off"; window.__RV_AI_PROXY = "https://ai.test"')
    ctx2.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body='{"version":8,"sources":{},"layers":[]}'))  # v2.38: Contacts opens on the map
    ctx2.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body='[]'))
    p2 = ctx2.new_page()
    p2.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    p2.goto(URL); p2.wait_for_selector('.tabbar .tab')
    r2 = p2.evaluate('''() => RV.store.addRv({name:'Cara Lee', stage:'return'}).id''')
    p2.goto(URL + '#/settings/ai'); p2.wait_for_selector('text=Note cleanup is on')
    check(p2.locator('text=Included with Groundwork').count() == 1, 'settings: on for everyone without a key')
    check(p2.locator('details summary', has_text='Use your own API key').count() == 1, 'own key tucked under a details row')
    p2.screenshot(path=f'{SHOTS}/06-shared-settings.png')
    p2.evaluate(f'RV.forms.visitDialog("{r2}")'); p2.wait_for_selector('.sheet .btn.cleanup')
    p2.locator('.sheet textarea').first.fill('uh shared note')
    n_direct = len(seen)
    p2.click('.sheet .btn.cleanup'); p2.wait_for_selector('.toast:has-text("Cleaned up")')
    check(p2.locator('.sheet textarea').first.input_value() == 'Shared tidy.', 'cleaned through the helper')
    hq = pseen[-1]
    check(hq['url'] == 'https://ai.test/v1/messages' and 'x-api-key' not in hq['headers'], 'helper called, no key sent from the browser')
    iid = hq['headers'].get('x-groundwork-install', '')
    check(len(iid) == 32 and iid == p2.evaluate('RV.ai.installId()'), 'anonymous install ID sent and kept')
    check(len(seen) == n_direct, 'Anthropic not called directly')
    check(iid not in json.dumps(p2.evaluate('RV.store.exportAll()')), 'install ID not in the backup')
    pmode.update(status=429, body={'error': 'daily_limit'})
    p2.locator('.sheet textarea').first.fill('another')
    p2.click('.sheet .btn.cleanup'); p2.wait_for_selector('.toast:has-text("More tomorrow")')
    check(p2.locator('.sheet textarea').first.input_value() == 'another', 'daily limit: note kept, calm message')
    pmode.update(status=200, body=None)
    p2.keyboard.press('Escape'); time.sleep(0.3)
    print('own key wins over the helper')
    p2.evaluate(f'RV.ai.setKey("{KEY}")')
    check(p2.evaluate('RV.ai.shared()') is False, 'own key used when set')
    p2.evaluate(f'RV.forms.visitDialog("{r2}")'); p2.wait_for_selector('.sheet .btn.cleanup')
    mode.update(status=200, reply=json.dumps({'note': 'Own.', 'discussNext': ''}))
    p2.locator('.sheet textarea').first.fill('own')
    n_helper = len(pseen)
    p2.click('.sheet .btn.cleanup'); p2.wait_for_selector('.toast:has-text("Cleaned up")')
    check(len(pseen) == n_helper and seen[-1]['headers'].get('x-api-key') == KEY, 'went direct with own key')
    ctx2.close()

    check(not errors, 'no console errors' + ('' if not errors else ': ' + '; '.join(errors[:3])))
    b.close()

httpd.shutdown()
print(f'\n{passes} passed, {len(fails)} failed')
sys.exit(1 if fails else 0)
