"""Plant kinds (v2.34): the reveal at leafy, the shuffle bag, imports below the reveal, kinds in rows.
Run: python3 tests/kinds.py . <screenshot folder>"""
import http.server, socketserver, threading, functools, sys
from playwright.sync_api import sync_playwright
ROOT, OUT = sys.argv[1], sys.argv[2]; PORT = 8791
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
with sync_playwright() as p:
    b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, service_workers='block')
    c.add_init_script('window.__RV_SURPRISE = 0; window.__RV_STARTER = "off"'); pg = c.new_page()
    # v2.38: Contacts opens on the map; keep its tiles off the network
    pg.route('https://tiles.openfreemap.org/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body='{"version":8,"sources":{},"layers":[]}'))
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    base = f'http://127.0.0.1:{PORT}/'
    pg.goto(base + '#/home'); pg.wait_for_selector('.tabbar .tab')

    # a leafy plant with no kind reveals at the next live conversation
    r = pg.evaluate("""() => {
      window.__RV_KIND = 'olive';
      const rv = RV.store.addRv({ name: 'Dee Harper', stage: 'cultivating', neighborhood: 'Oak Park' });
      const bag0 = (RV.store.S.settings.kindBag || []).length;
      const res = RV.store.logVisit(rv.id, { text: 'Talked about prayer' });
      window.__res = res; window.__dee = rv.id;
      return { kind: RV.store.rvById(rv.id).kind, revealed: res.revealed, bag0 };
    }""")
    check(r['kind'] == 'olive' and r['revealed'] and r['revealed']['kind'] == 'olive' and r['revealed']['toForm'] == 3, 'a live visit at leafy reveals the kind')
    pg.evaluate("() => { RV.forms.afterVisit(window.__dee, window.__res, 'Saved'); }")
    # v2.38: the evolution-style moment
    pg.wait_for_selector('.evo-ov'); pg.wait_for_timeout(300)
    check('Something’s happening' in pg.locator('.evo-top').inner_text(), 'the garden dims: "Something’s happening…"')
    pg.wait_for_timeout(1200)
    check(pg.locator('.evo-ov.gather').count() == 1 and pg.locator('.evo-lay.sil').count() == 2, 'the plant turns to a white silhouette while light gathers')
    seen = set()
    for _ in range(12):
        seen.add(pg.evaluate("[...document.querySelectorAll('.evo-lay')].map(e => e.classList.contains('hide') ? 0 : 1).join('')")); pg.wait_for_timeout(120)
    check('10' in seen and '01' in seen, 'it flickers between the old and new silhouettes (%s)' % sorted(seen))
    pg.wait_for_selector('.evo-ov .evo-chip span', timeout=4000)
    chip = pg.locator('.evo-ov .evo-chip span').inner_text(); sub = pg.locator('.evo-ov .evo-chip .gsub').inner_text()
    check(chip == 'It’s an olive tree!', 'the reveal says "It’s an olive tree!" (%s)' % chip)
    check(sub == 'Dee Harper', 'with the person’s name under it')
    check(pg.locator('.evo-lay:not(.hide):not(.sil) .pl.k-olive').count() == 1 and pg.locator('.evo-lay:not(.hide)').count() == 1, 'the olive stands in colour')
    pg.screenshot(path=f'{OUT}/k-reveal.png')
    pg.click('.evo-ov'); pg.wait_for_timeout(200)
    check(pg.locator('.evo-ov').count() == 0, 'a tap closes the moment')

    # undo takes the kind back
    r = pg.evaluate("""() => { window.__res.undo(); return RV.store.rvById(window.__dee).kind || null; }""")
    check(r is None, 'Undo takes the kind back')
    r = pg.evaluate("""() => { window.__RV_KIND = ''; const res = RV.store.logVisit(window.__dee, { text: 'Again' });
      const k = RV.store.rvById(window.__dee).kind; const res2 = RV.store.logVisit(window.__dee, { text: 'Third', at: new Date(Date.now() + 864e5).toISOString() });
      return { k, first: !!res.revealed, second: !!res2.revealed, bag: (RV.store.S.settings.kindBag || []).length }; }""")
    check(r['first'] and not r['second'], 'revealed once, never again')
    check(r['k'] in ['apple', 'lemon', 'olive', 'fig', 'pomegranate', 'date', 'grape', 'sunflower', 'pricklypear', 'cherry'], 'drawn from the ten kinds (%s)' % r['k'])

    # a Not Home and an import never reveal; a sprout that grows to leafy reveals in the same moment
    r = pg.evaluate("""() => {
      const a = RV.store.addRv({ name: 'Kenji Sato', stage: 'cultivating' });
      RV.store.logNH(a.id);
      const b = RV.store.addRv({ name: 'Ana Ruiz', stage: 'initial', createdAt: new Date(Date.now() - 10 * 864e5).toISOString(), stageChangedAt: new Date(Date.now() - 10 * 864e5).toISOString() });
      RV.store.logVisit(b.id, { text: 'First', at: new Date(Date.now() - 5 * 864e5).toISOString() });
      const res = RV.store.logVisit(b.id, { text: 'Second' });
      const imp = RV.store.blankRv({ name: 'Gina Park', stage: 'return', kind: 'fig' });
      RV.store.importRvs([imp], []);
      const st = RV.store.blankRv({ name: 'Rosa Alvarez', stage: 'study' });
      RV.store.importRvs([st], []);
      return { nh: RV.store.rvById(a.id).kind || null, grew: !!res.grew, rev: res.revealed && res.revealed.fromForm + '>' + res.revealed.toForm,
        impStage: RV.store.rvById(imp.id).stage, impKind: RV.store.rvById(imp.id).kind || null, study: RV.store.rvById(st.id).stage };
    }""")
    check(r['nh'] is None, 'a Not Home does not reveal')
    check(r['grew'] and r['rev'] == '2>3', 'a sprout growing to leafy reveals in the same moment')
    check(r['impStage'] == 'initial' and r['impKind'] is None, 'imports land below the reveal, with no kind')
    check(r['study'] == 'study', 'an imported study stays a study')

    # v2.37 the study track: a study at leafy puts it on track; the third study grows it straight into the tree,
    # and the moment waits for a tap
    r = pg.evaluate("""() => {
      window.__RV_KIND = 'fig';
      const d = (n) => new Date(Date.now() - n * 864e5).toISOString();
      const m = RV.store.addRv({ name: 'Mario', stage: 'cultivating', createdAt: d(200), stageChangedAt: d(200) });
      RV.store.logVisit(m.id, { text: 'Lesson 1', study: true, progress: 'Lesson 1', nextStart: 'Lesson 2', at: d(120) });
      RV.store.logVisit(m.id, { text: 'Lesson 2', study: true, progress: 'Lesson 2', nextStart: 'Lesson 3', at: d(60) });
      const it = RV.store.itemFor(m.id), st = RV.garden.forItem(it, RV.store.S.settings, new Date());
      const res = RV.store.logVisit(m.id, { text: 'Lesson 3', study: true, progress: 'Lesson 3', nextStart: 'Lesson 4' });
      window.__mres = res; window.__mid = m.id;
      return { before: RV.store.rvById(m.id).stage, kindBefore: st.kind, haveBefore: st.have };
    }""")
    after = pg.evaluate("RV.store.rvById(window.__mid).stage")
    check(after == 'study', 'three studies, months apart, grow a plant straight into the tree (%s)' % after)
    pg.evaluate("() => { RV.forms.afterVisit(window.__mid, window.__mres, 'Study saved'); }")
    pg.wait_for_selector('.evo-ov .evo-chip span', timeout=6000); pg.wait_for_timeout(1500)
    check(pg.locator('.evo-ov').count() == 1 and pg.locator('.evo-ov .ghint.on').count() == 1, 'growing into the tree gets the evolution moment, and it stays with Tap to continue')
    check(pg.locator('.evo-lay:not(.hide) .pl.s5').count() == 1, 'and ends on the tree')
    pg.click('.evo-ov'); pg.wait_for_timeout(200)
    check(pg.locator('.evo-ov').count() == 0, 'a tap closes it')
    pg.evaluate("window.__RV_KIND = ''")
    sid = pg.evaluate("() => { const x = RV.store.addRv({ name: 'Lena', stage: 'initial' }); RV.store.logVisit(x.id, { text: 'L1', study: true, progress: 'L1' }); return x.id; }")
    pg.goto(base + '#/rv/' + sid); pg.wait_for_selector('.ghero')
    check('2 more studies' in pg.locator('.gbar').inner_text(), 'a sprout with one study: 2 more studies')
    pg.evaluate("RV.forms.visitDialog('%s')" % sid); pg.wait_for_selector('.sheet')
    check(pg.locator('.sheet button:has-text("Save study")').count() == 1, 'the visit sheet opens as a study for someone who has studied')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)

    # the import pickers offer the three stages people see
    pg.goto(base + '#/settings/notes'); pg.wait_for_timeout(300)

    # rows draw each person's kind; dark mode too
    pg.goto(base + '#/rvs'); pg.wait_for_timeout(400)
    pg.evaluate("localStorage.setItem('rvapp.rvsView', 'folders')"); pg.reload(); pg.wait_for_timeout(500)
    for el in pg.locator('.ahead').all()[:3]:
        try: el.click(); pg.wait_for_timeout(100)
        except Exception: pass
    check(pg.locator('.pl[class*="k-"]').count() >= 1 and pg.locator('.pl.s3:not([class*="k-"])').count() >= 1, 'rows draw revealed kinds, and unrevealed plants as before')
    pg.screenshot(path=f'{OUT}/k-rows.png', full_page=True)
    pg.evaluate("RV.store.saveSettings((s) => { s.theme = 'dark'; })"); pg.reload(); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/k-rows-dark.png', full_page=True)
    check(not errs, 'no page errors' + ('' if not errs else ': ' + '; '.join(errs[:3])))
    b.close()
print(f'{ok} passed {bad} failed')
sys.exit(1 if bad else 0)
