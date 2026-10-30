# Groundwork handover (2026-10-30, after v2.43.0)

Read this first in a new chat, then claude/design-doc.md (the full design history, sections 1–54) for detail. This file is the current state; it is rewritten whenever anything changes.

## The project
- Groundwork: Mark's private, mobile-first PWA for door-to-door return visits (field service follow-up). Live at https://mygroundwork.app.
- Repo: SwingTreeCactus/groundwork (redirects to SwingTreeCactus/Groundwork). Push to main deploys. Clone it in the new session (add_repo, then clone to /home/claude/groundwork).
- Current release: v2.37.1 (`RV.VERSION` in js/app.js), service-worker cache `rvapp-v87` (sw.js).
- Servers (Cloudflare Workers, Mark's account, edited in the dashboard, not connected to GitHub): `groundwork-auth` (Drive sign-in, worker/token-helper.js) and `groundwork-ai` (shared Claude key, worker/ai-proxy.js). Never ask Mark to paste a secret or API key into chat; secrets go into Cloudflare as the Secret type.

## Working rules (Mark's standing preferences)
- Every release: bump `RV.VERSION` and the sw.js `CACHE` (next: 2.37.2 / rvapp-v88), run all tests, commit and push, add a design-doc entry to docs/DESIGN.md and project_write the whole file to claude/design-doc.md, and send the zip `Groundwork-v<VERSION>.zip` (made with `git archive`).
- Keep the project docs current: after any release, setup step or decision, project_write docs/HANDOVER.md to claude/handover.md (and DESIGN.md to claude/design-doc.md after a release). Durable decisions and plans also go in project docs, not only in chat.
- Planning or diagnosis requests: no code until Mark says to build. Mockups are not builds: don't touch the app or repo while mocking up.
- Gamification stays calm: no confetti, sounds, countdowns, red badges or loss; slow quiet motion.
- Commit messages end with the Co-Authored-By and Claude-Session lines from the session's attribution reminder.
- Answers: concise, direct, plain prose. Minimal on-screen text in the app.
- Colour (v2.35): one palette, no brand colour. Warm paper and ink, the garden's natural colours, and a single clay accent (#B4583A, dark #E39271) from the terracotta pots, used sparingly. Mark found purple overwhelming and didn't like it as an accent; don't bring it back. No colour choice in Display. He dislikes transparency in the plant art.

## Architecture
- Vanilla JS on a global `RV` namespace: util, logic, store, garden, geo, plant, forms, screens, ui (ui-core.js), insights, gmap, drive, settings, app. Data in IndexedDB. index.html loads the scripts; sw.js lists ASSETS.
- Stages: internally Potential, Initial Call, Cultivating, Return Visit, Bible Study. Users see only Potential, RV (the three middle stages) and Bible Study (`L.shownStages / shownStage / shownName`). Growth moves people through the hidden stages.
- Garden (js/garden.js): care levels shown are Lush 5, Healthy 4, Thirsty 2, Wilting 1 (3 is never returned). `G.forItem` is memoised. Exhibits, streaks, weekly recap.
- Plants (js/plant.js, js/kinds.js): drawn procedurally by `plantSvg`; `P.make(form, care, opts)`. Seed and sprout (and plants not yet revealed) use today's drawings in green with a per-person variant from the record ID. From leafy up, a revealed plant draws as its kind (`rv.kind`, `opts.kind`, `st.pkind`): ten kinds in `RV.kinds`, natural palette. The kind is drawn at the first live conversation at leafy or above (`G.needsReveal`, `G.drawPlantKind`: shuffle bag of 8 in `settings.kindBag`, 2 rares at 4%); the reveal moment is `P.reveal` ("It’s an olive tree!" with the name).
- Colour: warm neutral UI, natural garden, clay accent on UI marks only (v2.35). Pots are terracotta. Tokens: css/app.css v2.35 block; plant tokens `--pl-*` in js/plant.js.
- Tabs: Home (campaign banner and topics, then Today with three stage tiles and Almost growing, then Up next), Contacts (Tiles / Folders / Map switch, remembered in localStorage `rvapp.rvsView`), My garden (the garden; Insights when the garden is off).
- Record screen: Record NH, Record a visit, and Log study for every RV (not Potential). Last visit block and timeline Edit open the visit edit sheet, which has a Study session toggle (`ST.growNow`).
- Map (js/gmap.js): bundled MapLibre 5.24.0 (vendor/maplibre), OpenFreeMap positron restyled by `restyle()`, potted-plant pins, missing coordinates from Nominatim (one per second), All / Today toggle, Locate button, card with Open / Directions. v2.20: a fresh open zooms to the user's location (zoom 15, You dot; falls back to all pins); returning from a contact restores the last view (module-level `lastView`, kept for the session).
- Drive backup (js/drive.js): drive.file scope, Groundwork folder, current backup and 7 dated daily copies. Connection kept in localStorage `rvapp.drive` (not in backups).

## Drive reconnect fix (v2.20.0) and what is pending
- Cause: the browser-only sign-in gives one hour of access and no renewal.
- Live now: Reconnect first tries `prompt=none` silently, and falls back to normal sign-in on interaction_required, login_required or consent_required.
- Live since v2.28.1: worker/token-helper.js runs as the Cloudflare Worker groundwork-auth (https://groundwork-auth.swingtreecactus.workers.dev), holding the client secret.
  - `/exchange` swaps a code for access plus a refresh token. `/refresh` gets a new hour. `/revoke` is optional.
  - It only answers `ALLOWED_ORIGIN`, and it stores and logs nothing.
- With `RV.config.tokenHelper` set (js/config.js, currently ''):
  - Sign-in uses the code flow (`?code=` comes back and is cleared from the address).
  - The refresh token is saved as `conn.refresh` on the device.
  - The token is renewed before Drive calls, and a call is retried once on a 401.
  - When the key is refused (`invalid_grant`), it is forgotten and Reconnect shows.
  - Disconnect revokes the key.
- **Mark's steps (sent as a step card):**
  1. In Google Cloud, open Credentials, then the Web client starting 819898356569. Copy the client secret, and confirm the redirect URI `https://mygroundwork.app/`.
  2. On the consent screen, confirm the app is In production.
  3. In Cloudflare, create the Worker `groundwork-auth` and paste in worker/token-helper.js.
  4. Add the variables: GOOGLE_CLIENT_ID (text), GOOGLE_CLIENT_SECRET (secret), ALLOWED_ORIGIN = https://mygroundwork.app.
  5. Send the Worker URL.
  6. After the update, Reconnect once in Settings → Data. Every user does this once.
- **Next action when Mark sends the URL:** set `tokenHelper` in js/config.js to that URL, release v2.28.1 (cache rvapp-v73), and send the zip and design-doc line.
  - Optional first check: a curl OPTIONS request with the Origin header should return 204.

## Shared note cleanup (v2.30.0) — live since 2026-10-28
- Live: Mark deployed `groundwork-ai` at https://groundwork-ai.swingtreecactus.workers.dev with a new never-expiring key; console check returned content. Credit is $5 prepaid, no auto reload (that is the hard cap). The deployed copy may predate the commit that returns `upstream`/`type` on errors; paste the current file if debugging.
- worker/ai-proxy.js is a second Cloudflare Worker, `groundwork-ai`, holding Mark's Anthropic key so everyone can use Note cleanup (and later the notes import) without a key.
  - Only `POST /v1/messages`, only from `ALLOWED_ORIGIN`, only Haiku (1 unit) or Sonnet (4 units), max_tokens capped at 4000, body capped at 60k characters; only model, max_tokens, system and messages go through; only text comes back. Anthropic error details are never passed back.
  - Daily soft limits in KV (`LIMITS` binding): per install `DAILY_PER_INSTALL` (default 60 units), for everyone `DAILY_TOTAL` (default 600). Keys `d:<date>:<install>` and `t:<date>`, 48 h expiry. Failed calls don't count. The Console spend limit is the hard backstop.
  - The app sends `X-Groundwork-Install`, a random 32-hex ID in localStorage `rvapp.installId` (not in backups).
- App: `RV.config.aiProxy` = https://groundwork-ai.swingtreecactus.workers.dev (shipped before the Worker exists; until it's deployed, Clean up says "not available right now"). `RV.ai.available()` = own key or proxy; own key wins (`RV.ai.shared()` false). Settings › Note cleanup shows "Included with Groundwork", model choice, and the own key under a "Use your own API key" details row.
- **Mark's steps:** Cloudflare › Workers › Create `groundwork-ai`, paste worker/ai-proxy.js, Deploy; Storage › KV › create `groundwork-ai-limits`; Worker › Bindings › KV namespace, variable name `LIMITS`; Variables: `ANTHROPIC_API_KEY` (Secret), `ALLOWED_ORIGIN` (Text) = https://mygroundwork.app; Deploy; set a monthly spend limit in the Claude Console. Then a console check from mygroundwork.app: `fetch('https://groundwork-ai.swingtreecactus.workers.dev/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-groundwork-install':'test0000test0000'},body:JSON.stringify({model:'claude-haiku-5-5',max_tokens:20,messages:[{role:'user',content:'Reply with OK.'}]})}).then(r=>r.json()).then(console.log)`.
  - If his workers.dev subdomain differs, change `aiProxy` and release.

## Tests (all passing at v2.43.0)
- `timeout 900 python3 -I tests/smoke.py /tmp/out/shots` (326; needs /tmp/out to exist)
- `python3 -I tests/screens.py . /tmp/out/scr` (60)
- `python3 -I tests/drive_folder.py` (37; occasionally flaky, rerun), `python3 -I tests/ai_cleanup.py` (44)
- `python3 -I tests/kinds.py . /tmp/out/k` (23)
- `node tests/garden.test.js` (49), `node tests/logic.test.js` (53), `node tests/worker.test.mjs` (6), `node tests/ai-proxy.test.mjs` (8), `node tests/notes.test.js` (7), `node tests/topics.test.js` (6), `python3 -I tests/notes_import.py` (39)
- Gotchas:
  - Growth and reveal moments wait for a tap (v2.37); browser tests use `through_moment` (smoke) or click `.grow-ov` / `.evo-ov` (the evolution reveal, v2.38).
  - Contacts opens on the map (v2.38): every browser test stubs openfreemap tiles and nominatim at context level, or the run logs network errors.
  - The bunting animates, so tests click gate objects with `force=True`.
  - `replaceChildren(null)` renders "null", so filter out nulls first.
  - A shell pipe can hide a failing `&&` chain, so check every suite's output.
  - The map test hook is `document.querySelector('.gmap').gmapMap()`.
  - `RV.gmap._view()` and `RV.gmap._forget()` are there for tests.
  - smoke's "map shows plants as pins" can fail once on timing; rerun before digging in.
  - Topic chips resize the note with a 'cleaned' event, not 'input' (input opens the full-screen writing view and hides the chips).

## Recent history
- v2.21–v2.29: garden game (flowers, rounds, tending, milestones, 15 visitors with rare coats, visitor sets, seasons, Getting started quests), visitor announcements, empty-garden tutorial, menu regrouped with a Customize page, "conversations" wording, address tap edits the address. Details in design-doc sections 33–41.
- v2.28.1: Drive stays signed in (groundwork-auth live).
- v2.30.0: Note cleanup for everyone through groundwork-ai ($5 prepaid credit, no auto reload).
- v2.30.1: cleanup is a light proofread; next-time items copied, not moved; app keeps the note if too much was cut.
- v2.31.0: import from a notes app (files, zips, paste, Android share), read by Claude, review before import.
- v2.32.0: paste first, screenshots, Edit details and neighborhoods before import, Just imported view, Fill from a note in quick add.
- v2.33.0: Backup and import reorganized: backup status card, Import contacts (pick a source), Export sheet, Erase apart.
- v2.34.0: plant kinds revealed at leafy (ten kinds, "It’s an olive tree!"), natural plant palette, warm neutral UI, accent pots become accent rims, imports stop below the reveal.
- v2.34.1: garden world, objects and map moved off lavender to natural colours.
- v2.35.0: one palette with a clay accent and terracotta pots; Purple / Blue choice removed.
- v2.36.0: a more beautiful garden: edge-to-edge landscape under a see-through title bar, meadow, stone path, wooden raised beds, bigger plants, fireflies at night.
- v2.36.1: lighter, softer meadow so plants contrast with the grass (keep the grass lighter in value than the plants).
- v2.36.2: study notes get Clean up and the full-screen writing view; the newest note ("Last study") shows at the top of a study record.
- v2.37.0: study track (three studies in all grow any RV straight into the tree), growth and reveal moments slower and held until tapped, cleanup meaning check with "Worth a look" phrases.
- v2.37.1: Dark mode switch at the top of the menu.
- v2.43.0: dot-matrix font (Doto) retired; titles and big numbers in Space Grotesk bold.
- v2.42.0: new app icon, the happy pot (terracotta pot, sprout, content face) on garden green; brand guide section 3 rewritten.
- v2.41.1: View all doesn't pop the keyboard; "Schedule a campaign" (campaigns come from the organization).
- v2.41.0: Today carousel (big topic cards, ×, View all, linking question jumps to the next part), all 60 topics in 27 series (Topics page By theme / By series), campaign topics, topic chips on New contact and Record a visit (topic last used + next part on the record), Contacts List view A–Z, Neighborhood → Area, garden-green buttons, warm dark mode.
- v2.40.1: links in topic text are tappable (short "jw.org/…"), plain in the edit sheet.
- v2.40.0: Today for getting ready: Conversations from the 54-topic library (themes as folders, switched on per topic or theme), If you see them, one line to Contacts; Topics page with forgiving search, editing with Reset to original, theme editing and a scripture index.
- v2.39.1: campaign banner and topics back on top of Today.
- v2.39.0: layout release 2: Home is Today (one list by area, likely home first), Prepare leads the menu, Plan a campaign, two record buttons, no "due" in the garden, the likely-home estimate and availability from note cleanup.
- v2.38.0: layout release 1: Contacts (Map default, Areas, pin icon, thirsty plants), the game as objects in the garden (bunting, can, slate, signpost, field guide, next-milestone sketch), the evolution-style reveal.

## Pending
- Plant kinds (v2.34.0, built 2026-10-28): watch for look-alike pairs in real gardens (apple and cherry trees share a round crown; lemon and cherry leafy share a column shape; colour separates them). The canvas "Groundwork plant kinds" holds the mockups; claude/plant-kinds-draft.js is the pre-build draft (js/kinds.js is the live code).
- Notes import: v2.31.0, reworked in v2.32.0 (design-doc 44–45). **Mark must paste the new worker/ai-proxy.js into groundwork-ai** (body cap raised for screenshots). Then: test with real notes (likely his wife's Samsung Notes) and tune `RV.ai.IMPORT_SYSTEM`. Android share target: Groundwork wasn't in Keep's share menu; Mark to check it was installed from Chrome and reinstall to pick up the manifest.
- Garden scene redesign built in v2.36.0 (design-doc 49). The draft generator claude/garden-scene-draft.js is now history; the live scene is in js/insights.js (`skySvg`, `stonePath`, `fireflies`, `gardenScene`) and the v2.36 block of css/app.css.
- New icon shipped in v2.42.0. To check on Mark's phone: remove and re-add Groundwork on iPhone to see it; Android updates on its own.
- v2.37.0 shipped the study track, held growth/reveal moments and the cleanup meaning check. To watch: whether Fast catches dictation swaps well enough on real notes (Careful is the fallback default); Mario's plant should grow at his next study if he has three study sessions logged.
- Big layout update: release 1 built as v2.38.0 (design-doc 51), release 2 as v2.39.0 (design-doc 52). Next: the 15-second text tutorial, four cards (Home/Today, Contacts, My garden, record screen), drafted with Mark before building. To watch: whether the likely-home estimate feels right on real data (thresholds LIKELY_P 0.6, LIKELY_N 0.3 in js/logic.js) and whether cleanup's availability suggestion fires sensibly on real notes (untested against the live model).
- Today redesign built as v2.40.0 (design-doc 53), carousel and series in v2.41.0 (design-doc 54). To check on Mark's phone: verse links (jw.org finder `bible=` codes) open JW Library at the right verse; workbook video links (`pub-mwbv_...`) open the right video (59 of 60 found; patterns verified on 31 weekly pages, not every link opened). Library data: js/library.js, source list in claude/sample-conversations-library.json.
- Known, not fixing (Mark, 2026-10-30): an app update reloads the page when the app comes back to the foreground, which can wipe an in-progress notes import (held in memory). Rare; the fixes (hold the reload during an import, save import progress, lighter screenshot memory) are on file if it comes up again.
- Future ideas, do NOT build until Mark explicitly agrees (noted 2026-10-29):
  - Adding a phone number should be a rewarded action in the garden (getting someone's number is a good step).
  - A button to create a phone contact from a Groundwork contact (mapping name, phone, address). Mark: hold off on this for sure for now.
- Optional later: anonymous user count (Worker ping or Cloudflare Web Analytics, plus privacy page); act from the garden (long-press a bed); visitors using garden objects, keepsakes; monthly personal challenge; push reminders; rotate the Google client secret (Mark chose not to); refresh the Garden visitors design canvas.

## Related project docs
- claude/design-doc.md: full design log (every release).
- claude/gamification-review.md: the game review and the comparison with model games.
- claude/garden-plan.md: garden spec (section 12: plant kinds and palette, built in v2.34.0).
- claude/brand-guide.md: brand.
- Design canvas "Garden visitors": https://claude.ai/artifact/EX832JVcy4GSFeaRhha6yC
- Design canvas "Groundwork plant kinds": https://claude.ai/artifact/7TX6CxTZr17EUpTGSAzyeL
