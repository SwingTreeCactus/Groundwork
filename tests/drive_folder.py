"""Google Drive folder and daily copies, against a fake Google Drive.
Run: python3 tests/drive_folder.py   (needs Playwright with Chromium)"""
import http.server, socketserver, threading, os, sys, json, functools, re, datetime
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8766

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/'

passed = failed = 0
def check(ok, label):
    global passed, failed
    if ok: passed += 1; print('  ok  ', label)
    else: failed += 1; print('  FAIL', label)

FOLDER = 'application/vnd.google-apps.folder'
def iso(days=0):
    t = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=days)
    return t.strftime('%Y-%m-%dT%H:%M:%S.000Z')
def local_day(days=0):
    return (datetime.datetime.now() + datetime.timedelta(days=days)).strftime('%Y-%m-%d')

class FakeDrive:
    def __init__(self): self.files = {}; self.n = 0
    def add(self, name, parents=('root',), mime='application/json', content='', mod=None):
        self.n += 1; fid = 'F%d' % self.n
        self.files[fid] = {'id': fid, 'name': name, 'mimeType': mime, 'parents': list(parents), 'trashed': False, 'modifiedTime': mod or iso(), 'content': content}
        return fid
    def live(self): return [f for f in self.files.values() if not f['trashed']]
    def folders(self): return [f for f in self.live() if f['mimeType'] == FOLDER and f['name'] == 'Groundwork']
    def by_name(self, name): return [f for f in self.live() if f['name'] == name]
    def query(self, q):
        out = [f for f in self.files.values() if not ('trashed=false' in q and f['trashed'])]
        m = re.search(r"name='([^']*)'", q)
        if m: out = [f for f in out if f['name'] == m.group(1)]
        m = re.search(r"mimeType='([^']*)'", q)
        if m: out = [f for f in out if f['mimeType'] == m.group(1)]
        m = re.search(r"'([^']*)' in parents", q)
        if m: out = [f for f in out if m.group(1) in f['parents']]
        return out

def run():
    D = FakeDrive()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block'); ctx.add_init_script('window.__RV_SURPRISE = 0')
        ctx.add_init_script("window.__RV_CLIENT_ID = 'test-client.apps.googleusercontent.com'")

        auths = []; bearer = []; silent_says = ['ok']
        def google_auth(route):
            q = parse_qs(urlparse(route.request.url).query); auths.append(q)
            back = q['redirect_uri'][0]; stt = q['state'][0]
            if q.get('response_type') == ['code']:
                return route.fulfill(status=302, headers={'location': back + '?code=C1&state=' + stt}, body='')
            if q.get('prompt') == ['none'] and silent_says[0] != 'ok':
                return route.fulfill(status=302, headers={'location': back + '#error=' + silent_says[0] + '&state=' + stt}, body='')
            route.fulfill(status=302, headers={'location': back + '#access_token=tok&expires_in=3599&state=' + stt}, body='')
        def api(route):
            req = route.request; u = urlparse(req.url); q = parse_qs(u.query); m = req.method
            if req.headers.get('authorization'): bearer.append(req.headers['authorization'])
            jr = lambda o, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
            pub = lambda f: {k: v for k, v in f.items() if k != 'content'}
            if u.hostname == 'oauth2.googleapis.com': return jr({})
            parts = u.path.split('/')
            if u.path == '/drive/v3/files' and m == 'GET':
                return jr({'files': [pub(f) for f in D.query(q.get('q', [''])[0])]})
            if u.path == '/drive/v3/files' and m == 'POST':
                b = json.loads(req.post_data); fid = D.add(b['name'], b.get('parents', ['root']), b.get('mimeType', 'application/json'))
                return jr({'id': fid})
            if u.path.startswith('/drive/v3/files/') and u.path.endswith('/copy') and m == 'POST':
                src = D.files.get(parts[4]); b = json.loads(req.post_data)
                if not src: return jr({}, 404)
                return jr({'id': D.add(b['name'], b.get('parents', src['parents']), content=src['content'])})
            if u.path.startswith('/drive/v3/files/'):
                f = D.files.get(parts[4])
                if not f: return jr({}, 404)
                if m == 'GET':
                    if q.get('alt') == ['media']: return route.fulfill(status=200, content_type='application/json', body=f['content'])
                    return jr(pub(f))
                if m == 'PATCH':
                    for a in q.get('addParents', [''])[0].split(','):
                        if a and a not in D.files: return jr({}, 404)
                    rm = q.get('removeParents', [''])[0].split(',')
                    f['parents'] = [x for x in f['parents'] if x not in rm] + [a for a in q.get('addParents', [''])[0].split(',') if a]
                    b = json.loads(req.post_data or '{}')
                    if 'trashed' in b: f['trashed'] = b['trashed']
                    return jr({'id': f['id']})
            if u.path == '/upload/drive/v3/files' and m == 'POST':
                body = req.post_data
                meta = json.loads(body.split('\r\n\r\n', 1)[1].split('\r\n--', 1)[0])
                content = body.split('Content-Type: application/json\r\n\r\n')[-1].rsplit('\r\n--', 1)[0]
                fid = D.add(meta['name'], meta.get('parents', ['root']), content=content)
                return jr({'id': fid, 'modifiedTime': D.files[fid]['modifiedTime']})
            if u.path.startswith('/upload/drive/v3/files/') and m == 'PATCH':
                f = D.files.get(parts[5])
                if not f: return jr({}, 404)
                f['content'] = req.post_data; f['modifiedTime'] = iso()
                return jr({'id': f['id'], 'modifiedTime': f['modifiedTime']})
            return jr({'error': 'unexpected ' + m + ' ' + u.path}, 500)
        ctx.route('https://accounts.google.com/**', google_auth)
        ctx.route('https://www.googleapis.com/**', api)
        ctx.route('https://oauth2.googleapis.com/**', api)

        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        ev = page.evaluate
        def backup(): return ev('() => RV.drive.backupNow()')

        print('existing backup at the top of My Drive (made by an older version)')
        page.goto(URL + '#/settings/data'); page.wait_for_selector('.setrow')
        ev("() => RV.store.addRv({ name: 'Folder Test Person', stage: 'initial' })")
        old = json.dumps({'app': 'rv-app', 'rvs': [], 'entries': [], 'lib': []})
        main = D.add('Groundwork backup.json', content=old, mod=iso(-1))
        page.click('button:has-text("Connect Google Drive")')
        page.wait_for_selector('button:has-text("Back up now")')
        page.wait_for_function('() => !RV.drive.status().busy && !!RV.drive.status().lastSaved', timeout=8000)
        folders = D.folders()
        check(len(folders) == 1, 'the app makes one Groundwork folder')
        fid = folders[0]['id'] if folders else None
        check(D.files[main]['parents'] == [fid], 'the existing backup is moved into the folder, not copied')
        check(len(D.by_name('Groundwork backup.json')) == 1, 'there is still only one current backup file')
        snap = D.by_name('Groundwork backup %s.json' % local_day(-1))
        check(len(snap) == 1 and snap[0]['parents'] == [fid], "yesterday's backup is kept as a dated copy in the folder")
        check(snap and snap[0]['content'] == old, 'the dated copy holds the backup as it stood, before today\'s save')
        check('Folder Test Person' in D.files[main]['content'], "today's records are saved to the current file")

        print('more saves the same day')
        n = len(D.files)
        ev("() => RV.store.addRv({ name: 'Second Person', stage: 'initial' })")
        check(backup() is True, 'a second save works')
        check(len(D.files) == n and len(D.folders()) == 1, 'no new folder or copy on later saves the same day')

        print('keeps the last 7 dated copies')
        for f in D.live():
            if re.match(r'Groundwork backup \d', f['name']): f['trashed'] = True
        for i in range(3, 11): D.add('Groundwork backup %s.json' % local_day(-i), parents=[fid], content=old)
        # pretend the last save was 2 days ago: 8 older copies plus today's new one makes 9
        D.files[main]['modifiedTime'] = iso(-2)
        ev("() => { const o = JSON.parse(localStorage.getItem('rvapp.drive')); o.snapDay = null; o.lastSaved = new Date(Date.now() - 3*864e5).toISOString(); localStorage.setItem('rvapp.drive', JSON.stringify(o)); }")
        page.reload(); page.wait_for_selector('button:has-text("Back up now")')
        check(backup() is True, 'save on a new day works')
        kept = sorted(f['name'] for f in D.live() if re.match(r'Groundwork backup \d{4}-\d\d-\d\d\.json', f['name']))
        check(len(kept) == 7, 'only 7 dated copies remain (got %d)' % len(kept))
        check(kept and kept[-1] == 'Groundwork backup %s.json' % local_day(-2) and kept[0] == 'Groundwork backup %s.json' % local_day(-8), 'the newest copy is kept (named for the day of the last save)')
        check(all(f['trashed'] for f in D.files.values() if f['name'] in ('Groundwork backup %s.json' % local_day(-9), 'Groundwork backup %s.json' % local_day(-10))), 'the two oldest copies go to the Drive bin, not deleted outright')

        print('restore')
        lst = ev('() => RV.drive.listBackups()')
        check(lst[0]['id'] == main and lst[0]['day'] is None, 'Restore lists the current backup first')
        days = [b['day'] for b in lst[1:]]
        check(len(days) == 7 and days == sorted(days, reverse=True), 'then the dated copies, newest first')
        data = ev('(id) => RV.drive.fetchBackup(id)', lst[-1]['id'])
        check(data and data.get('app') == 'rv-app', 'a dated copy can be read back')
        page.click('button:has-text("Restore")')
        page.wait_for_selector('.sheet .opt:has-text("Latest backup")')
        check(page.locator('.sheet .opt').count() == 8, 'the Restore sheet offers the latest backup and each daily copy')
        page.locator('.sheet .opt').nth(1).click()
        page.wait_for_selector('.sheet .opt:has-text("Merge")')
        check(True, 'picking a daily copy leads to the usual merge or replace choice')
        page.keyboard.press('Escape')

        print('folder thrown away in Drive')
        for f in D.files.values():
            if f['id'] == fid or fid in f['parents']: f['trashed'] = True
        ev("() => RV.store.addRv({ name: 'After Bin Person', stage: 'initial' })")
        check(backup() is True, 'saving still works after the folder was binned')
        nf = D.folders()
        cur = D.by_name('Groundwork backup.json')
        check(len(nf) == 1 and nf[0]['id'] != fid, 'a fresh Groundwork folder is made')
        check(len(cur) == 1 and cur[0]['parents'] == [nf[0]['id']] and 'After Bin Person' in cur[0]['content'], 'a fresh backup file is saved inside it')

        print('brand-new Drive')
        D2 = FakeDrive(); D.files, D.n = D2.files, 100
        ev("() => RV.drive.disconnect()")
        page.reload(); page.wait_for_selector('button:has-text("Connect Google Drive")')
        page.click('button:has-text("Connect Google Drive")')
        page.wait_for_selector('button:has-text("Back up now")')
        page.wait_for_function('() => !RV.drive.status().busy && !!RV.drive.status().lastSaved', timeout=8000)
        nf = D.folders(); cur = D.by_name('Groundwork backup.json')
        check(len(nf) == 1 and len(cur) == 1 and cur[0]['parents'] == [nf[0]['id']], 'first backup goes straight into a new Groundwork folder')
        check(not [f for f in D.live() if f['name'].startswith('Groundwork backup 2')], 'no dated copy on the very first save')

        print('reconnect without the helper: silent first')
        expire = "() => { const c = JSON.parse(localStorage.getItem('rvapp.drive')); c.expires = 0; localStorage.setItem('rvapp.drive', JSON.stringify(c)); }"
        ev(expire); page.reload(); page.wait_for_selector('button:has-text("Reconnect")')
        del auths[:]
        page.click('button:has-text("Reconnect")'); page.wait_for_selector('button:has-text("Back up now")')
        check(len(auths) == 1 and auths[0].get('prompt') == ['none'], 'Reconnect tries Google silently first (no account screens)')
        ev(expire); page.reload(); page.wait_for_selector('button:has-text("Reconnect")')
        del auths[:]; silent_says[0] = 'interaction_required'
        page.click('button:has-text("Reconnect")'); page.wait_for_selector('button:has-text("Back up now")', timeout=8000)
        check(len(auths) == 2 and auths[0].get('prompt') == ['none'] and 'prompt' not in auths[1], 'when Google needs to ask, it asks (second try is the normal sign-in)')
        silent_says[0] = 'ok'
        page.close()

        print('with the sign-in helper: stays connected')
        hctx = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block'); hctx.add_init_script('window.__RV_SURPRISE = 0')
        hctx.add_init_script("window.__RV_CLIENT_ID = 'test-client.apps.googleusercontent.com'; window.__RV_TOKEN_HELPER = 'https://helper.test/'")
        hctx.route('https://accounts.google.com/**', google_auth)
        hctx.route('https://www.googleapis.com/**', api)
        hctx.route('https://oauth2.googleapis.com/**', api)
        calls = []; refresh_says = ['ok']; n_at = [1]
        def helper(route):
            req = route.request; path = urlparse(req.url).path; b = json.loads(req.post_data or '{}'); calls.append((path, b))
            hdr = {'Access-Control-Allow-Origin': '*'}
            if req.method == 'OPTIONS': return route.fulfill(status=204, headers=dict(hdr, **{'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST'}))
            if path == '/exchange': return route.fulfill(status=200, headers=hdr, content_type='application/json', body=json.dumps({'access_token': 'AT1', 'expires_in': 3599, 'refresh_token': 'RT1'}))
            if path == '/refresh':
                if refresh_says[0] != 'ok': return route.fulfill(status=400, headers=hdr, content_type='application/json', body=json.dumps({'error': 'invalid_grant'}))
                n_at[0] += 1
                return route.fulfill(status=200, headers=hdr, content_type='application/json', body=json.dumps({'access_token': 'AT%d' % n_at[0], 'expires_in': 3599}))
            route.fulfill(status=404, headers=hdr, body='')
        hctx.route('https://helper.test/**', helper)
        page = hctx.new_page(); page.on('pageerror', lambda e: errors.append(str(e))); ev = page.evaluate
        page.goto(URL + '#/settings/data'); page.wait_for_selector('button:has-text("Connect Google Drive")')
        del auths[:]
        page.click('button:has-text("Connect Google Drive")')
        page.wait_for_selector('button:has-text("Back up now")', timeout=8000)
        page.wait_for_function('() => !RV.drive.status().busy && !!RV.drive.status().lastSaved', timeout=8000)
        a = auths[0] if auths else {}
        check(a.get('response_type') == ['code'] and a.get('access_type') == ['offline'], 'with a helper, sign-in asks Google for a lasting connection')
        ex = [c for c in calls if c[0] == '/exchange']
        check(len(ex) == 1 and ex[0][1].get('code') == 'C1' and ex[0][1].get('redirect_uri') == URL, 'the sign-in code is swapped through the helper')
        conn = ev("JSON.parse(localStorage.getItem('rvapp.drive'))")
        check(conn.get('refresh') == 'RT1' and conn.get('token') == 'AT1', 'the renewal key is kept on the device')
        check('?code' not in page.url and page.url.endswith('#/settings/data'), 'the code is cleared from the address')
        check(ev("RV.drive.status().lasting") is True, 'status says the connection lasts')
        # an hour later
        ev(expire); page.reload(); page.wait_for_selector('.setrow, .card')
        check(page.locator('button:has-text("Reconnect")').count() == 0 and page.locator('button:has-text("Back up now")').count() == 1, 'after the hour, no Reconnect: it renews itself')
        ev("() => RV.store.addRv({ name: 'Renewed Person', stage: 'initial' })")
        del bearer[:]
        check(ev('() => RV.drive.backupNow()') is True and bearer and all(b == 'Bearer AT2' for b in bearer), 'backup renews quietly and saves with the fresh access')
        check(len([c for c in calls if c[0] == '/refresh' and c[1].get('refresh_token') == 'RT1']) == 1, 'one renewal for several Drive calls')
        # Google stops accepting the key (password change, access removed)
        refresh_says[0] = 'bad'
        ev(expire); page.reload(); page.wait_for_selector('.setrow, .card')
        ev("() => RV.store.addRv({ name: 'After Revoke', stage: 'initial' })")
        check(ev('() => RV.drive.backupNow()') is False, 'a refused renewal key stops the save')
        page.reload(); page.wait_for_selector('button:has-text("Reconnect")')
        check(ev("JSON.parse(localStorage.getItem('rvapp.drive')).refresh") is None, 'the refused key is forgotten and Reconnect shows')
        refresh_says[0] = 'ok'
        page.click('button:has-text("Reconnect")'); page.wait_for_selector('button:has-text("Back up now")', timeout=8000)
        check(ev("JSON.parse(localStorage.getItem('rvapp.drive')).refresh") == 'RT1', 'reconnecting once makes it last again')

        check(not errors, 'no page errors' + (': ' + '; '.join(errors) if errors else ''))
        browser.close()

run()
print('\n%d passed, %d failed' % (passed, failed))
sys.exit(1 if failed else 0)
