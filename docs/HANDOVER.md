# Groundwork handover (2026-11-06, after v2.56.1)

Read this first in a new chat, then claude/design-doc.md (the design log's current part, sections 68 on) for detail; earlier sections are in claude/design-doc-1.md (1–27, the original spec), claude/design-doc-2.md (28–50) and claude/design-doc-3.md (51–67). Repo: docs/DESIGN.md, DESIGN-1.md, DESIGN-2.md, DESIGN-3.md. This file is the current state; it is rewritten whenever anything changes.

## The project
- Groundwork: Mark's private, mobile-first PWA for door-to-door return visits (field service follow-up). Live at https://mygroundwork.app.
- Repo: SwingTreeCactus/groundwork (redirects to SwingTreeCactus/Groundwork). Push to main deploys. Clone it in the new session (add_repo, then clone to /home/claude/groundwork).
- Current release: v2.56.1 (`RV.VERSION` in js/app.js), service-worker cache `rvapp-v120` (sw.js).
- Servers (Cloudflare Workers, Mark's account, edited in the dashboard, not connected to GitHub): `groundwork-auth` (Drive sign-in, worker/token-helper.js) and `groundwork-ai` (shared Claude key, worker/ai-proxy.js). Never ask Mark to paste a secret or API key into chat; secrets go into Cloudflare as the Secret type.

## Working rules (Mark's standing preferences)
- Every release: bump `RV.VERSION` and the sw.js `CACHE` (next: 2.56.2 / rvapp-v121; Calendar release 3 would be 2.57.0), run all tests, commit and push, add a design-doc entry to docs/DESIGN.md (the current part; start a new part past about 60 KB, since a file over about 25,000 tokens can't be read whole for the upload) and project_write the whole file to claude/design-doc.md, and send the zip `Groundwork-v<VERSION>.zip` (made with `git archive`).
- Keep the project docs current: after any release, setup step or decision, project_write docs/HANDOVER.md to claude/handover.md (and DESIGN.md to claude/design-doc.md after a release). Durable decisions and plans also go in project docs, not only in chat.
- Planning or diagnosis requests: no code until Mark says to build. Mockups are not builds: don't touch the app or repo while mocking up.
- Wording: groups of topics are "categories" (never "theme", which means light/dark); creating things on the Topics page is "New", since "Add" there reads as putting something on Today.
- Motivation (Mark, 2026-11-03): show what was accomplished, never what is left; no guilt. Habit apps that last (Apple Fitness, Finch, Headspace) count what you did, keep it, and welcome you back.
- No "need to water" pressure (Mark, 2026-11-03): no lists of who to water, no to-water counts or lines on Today or in Areas, no reminders about thirsty plants. Seeing who's thirsty in the garden is the goal; you can't always reach everyone in a week.
- Gamification stays calm: no confetti, sounds, countdowns, red badges or loss; slow quiet motion.
- Commit messages end with the Co-Authored-By and Claude-Session lines from the session's attribution reminder.
- Answers: concise, direct, plain prose. Minimal on-screen text in the app.
- Colour (v2.35): one palette, no brand colour. Warm paper and ink, the garden's natural colours, and a single clay accent (#B4583A, dark #E39271) from the terracotta pots, used sparingly. Mark found purple overwhelming and didn't like it as an accent; don't bring it back. No colour choice in Display. He dislikes transparency in the plant art.

## Architecture
- Vanilla JS on a global `RV` namespace: util, logic, service (v2.53), store, garden, geo, plant, forms, screens, calendar (v2.53), review (v2.54, the year in review), ui (ui-core.js), insights, gmap, drive, settings, app. Data in IndexedDB. index.html loads the scripts; sw.js lists ASSETS.
- Stages: internally Potential, Initial Call, Cultivating, Return Visit, Bible Study. Users see only Potential, RV (the three middle stages) and Bible Study (`L.shownStages / shownStage / shownName`). Growth moves people through the hidden stages.
- Garden (js/garden.js): care levels shown are Lush 5, Healthy 4, Thirsty 2, Wilting 1 (3 is never returned). `G.forItem` is memoised. Exhibits, streaks, weekly recap.
- Plants (js/plant.js, js/kinds.js): drawn procedurally by `plantSvg`; `P.make(form, care, opts)`. Seed and sprout (and plants not yet revealed) use today's drawings in green with a per-person variant from the record ID. From leafy up, a revealed plant draws as its kind (`rv.kind`, `opts.kind`, `st.pkind`): ten kinds in `RV.kinds`, natural palette. The kind is drawn at the first live conversation at leafy or above (`G.needsReveal`, `G.drawPlantKind`: shuffle bag of 8 in `settings.kindBag`, 2 rares at 4%); the reveal moment is `P.reveal` ("It’s an olive tree!" with the name).
- Colour: warm neutral UI, natural garden, clay accent on UI marks only (v2.35). Pots are terracotta. Tokens: css/app.css v2.35 block; plant tokens `--pl-*` in js/plant.js.
- Tabs: Today, Contacts (Map / Areas / List, remembered in localStorage `rvapp.rvsView`), My garden (Insights when the garden is off), Calendar (v2.53: service time, the report, scheduled visits; design in docs/SERVICE-TIME.md).
- Service time (v2.53): profile, schedule, cleared days and look-back month in `settings.service`; recorded sessions are lib items kind `time`; month records (adjustments, Sent, comments, history) lib items kind `svmonth`, id `svm-YYYY-MM`. Pure logic in js/service.js. v2.54: the year view (`yearMonths`) and the year in review (`yearReview`, js/review.js; music audio/year-review-they-say.m4a, kept in the `gw-audio` cache, which sw.js never deletes).
- Record screen: Record NH, Record a visit, and Log study for every RV (not Potential). Last visit block and timeline Edit open the visit edit sheet, which has a Study session toggle (`ST.growNow`).
- Map (js/gmap.js): bundled MapLibre 5.24.0 (vendor/maplibre), OpenFreeMap positron restyled by `restyle()`, potted-plant pins, missing coordinates from Nominatim (one per second), All / Today toggle, Locate button, card with Open / Directions. v2.20: a fresh open zooms to the user's location (zoom 15, You dot; falls back to all pins); returning from a contact restores the last view (module-level `lastView`, kept for the session).
- Drive backup (js/drive.js): drive.file scope, Groundwork folder, current backup and 7 dated daily copies. Connection kept in localStorage `rvapp.drive` (not in backups).

## Drive sign-in (live since v2.28.1)
- Cause of the old drop-outs: the browser-only sign-in gives one hour of access and no renewal.
- Reconnect first tries `prompt=none` silently, and falls back to normal sign-in on interaction_required, login_required or consent_required.
- worker/token-helper.js runs as the Cloudflare Worker groundwork-auth (https://groundwork-auth.swingtreecactus.workers.dev), holding the client secret; `RV.config.tokenHelper` points to it.
  - `/exchange` swaps a code for access plus a refresh token. `/refresh` gets a new hour. `/revoke` is optional.
  - It only answers `ALLOWED_ORIGIN`, and it stores and logs nothing.
- Sign-in uses the code flow (`?code=` comes back and is cleared from the address). The refresh token is saved as `conn.refresh` on the device; the token is renewed before Drive calls, and a call is retried once on a 401. When the key is refused (`invalid_grant`), it is forgotten and Reconnect shows. Disconnect revokes the key.
- Debug check: a curl OPTIONS request with the Origin header should return 204.

## Shared note cleanup (v2.30.0) — live since 2026-10-28
- Mark deployed `groundwork-ai` at https://groundwork-ai.swingtreecactus.workers.dev with a never-expiring key. Credit is $5 prepaid, no auto reload (that is the hard cap). The deployed copy may predate the commit that returns `upstream`/`type` on errors; paste the current file if debugging.
- worker/ai-proxy.js holds Mark's Anthropic key so everyone can use Note cleanup (and the notes import) without a key.
  - Only `POST /v1/messages`, only from `ALLOWED_ORIGIN`, only Haiku (1 unit) or Sonnet (4 units), max_tokens capped at 4000, body capped at 60k characters; only model, max_tokens, system and messages go through; only text comes back. Anthropic error details are never passed back.
  - Daily soft limits in KV (`LIMITS` binding, namespace `groundwork-ai-limits`): per install `DAILY_PER_INSTALL` (default 60 units), for everyone `DAILY_TOTAL` (default 600). Keys `d:<date>:<install>` and `t:<date>`, 48 h expiry. Failed calls don't count. The Console spend limit is the hard backstop.
  - The app sends `X-Groundwork-Install`, a random 32-hex ID in localStorage `rvapp.installId` (not in backups).
- App: `RV.config.aiProxy` = https://groundwork-ai.swingtreecactus.workers.dev. `RV.ai.available()` = own key or proxy; own key wins (`RV.ai.shared()` false). Settings › Note cleanup shows "Included with Groundwork", model choice, and the own key under a "Use your own API key" details row.
- Console check from mygroundwork.app: `fetch('https://groundwork-ai.swingtreecactus.workers.dev/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-groundwork-install':'test0000test0000'},body:JSON.stringify({model:'claude-haiku-5-5',max_tokens:20,messages:[{role:'user',content:'Reply with OK.'}]})}).then(r=>r.json()).then(console.log)`.

## Tests (all passing at v2.56.1)
- `timeout 900 python3 -I tests/smoke.py /tmp/out/shots` (383; needs /tmp/out to exist)
- `python3 -I tests/screens.py . /tmp/out/scr` (60)
- `python3 -I tests/drive_folder.py` (37; occasionally flaky, rerun), `python3 -I tests/ai_cleanup.py` (60)
- `python3 -I tests/kinds.py . /tmp/out/k` (23), `python3 -I tests/areas_ui.py . /tmp/out/ar` (42)
- `node tests/reminders.test.mjs` (6), `node tests/reminders-app.test.js` (4), `python3 -I tests/reminders_ui.py` (16)
- `node tests/service.test.js` (20), `python3 -I tests/calendar_ui.py [shots dir]` (41), `python3 -I tests/year_ui.py [shots dir]` (48), `python3 -I tests/swipe_ui.py [shots dir]` (29), `node tests/stats.test.mjs` (7; uses Node's built-in SQLite), `python3 -I tests/stats_ui.py` (14)
- `node tests/garden.test.js` (45), `node tests/logic.test.js` (53), `node tests/worker.test.mjs` (6), `node tests/ai-proxy.test.mjs` (8), `node tests/notes.test.js` (7), `node tests/topics.test.js` (7), `node tests/handoff.test.js` (8), `node tests/ww.test.js` (7), `node tests/areas.test.js` (7), `python3 -I tests/notes_import.py` (39)
- Gotchas:
  - Growth and reveal moments wait for a tap (v2.37); browser tests use `through_moment` (smoke) or click `.grow-ov` / `.evo-ov` (the evolution reveal, v2.38).
  - Contacts opens on the map (v2.38): every browser test stubs openfreemap tiles and nominatim at context level, or the run logs network errors.
  - The bunting animates, so tests click gate objects with `force=True`.
  - `replaceChildren(null)` renders "null", so filter out nulls first.
  - A shell pipe can hide a failing `&&` chain, so check every suite's output.
  - The map test hook is `document.querySelector('.gmap').gmapMap()`.
  - `RV.gmap._view()` and `RV.gmap._forget()` are there for tests.
  - smoke's "map shows plants as pins" can fail once on timing; rerun before digging in. It also fails every time if an earlier step opened the Contacts map while nominatim was stubbed empty (every address gets remembered as not found); the Witness Work step clears `rv.approx` for that reason.
  - Contacts in the study stage bring the owl at night, whose arrival redraws the garden and can close a sheet a later step opened; test-added contacts are deleted again after their checks.
  - v2.51: the gate has only the can and signpost; Today's list rows are `.tlcard:not(.could) .tlrow`; the plan field is `textarea[aria-label="Discuss next time"]` (its placeholder is "Last time: …" when there was a plan).
  - Getting started (v2.50.1): the smoke context sets `__RV_STARTER = "off"`, so an empty install shows the unfoldable intro and the Welcome card; the Getting started block uses its own context with "on".
  - Sheets don't focus text fields on open (v2.49): tests that type after opening a sheet must click or fill the field.
  - Area editor tests (areas_ui): MapLibre's zoom uses 512 px tiles, so zoom 13 fits a ~0.02° square on a 390 px phone; `.aedit.aeditApi` exposes map(), _draft(), _mode().
  - Topic chips resize the note with a 'cleaned' event, not 'input' (input opens the full-screen writing view and hides the chips).
  - v2.55: in Playwright, `pg.evaluate("RV.ui.toast(...)")` calls the returned dismiss function (a function result is invoked): use `void RV.ui.toast(...)`. Drags must stay inside the viewport and start off the tab bar (scroll the element to the centre first).

## Recent history
- v2.56.1: the year pace (design-doc 72): this month from My schedule, later months at the monthly average (earlier months of the year plus this month's projection; months before tracking left out; credit counts). `RV.service.ahead`. The year view looks the same; key reads Expected.
- v2.56.0: anonymous usage counts (design-doc 71): a daily check-in (install code, version, device, installed or browser, feature flags) to worker/stats.js with a D1 database and an admin-key stats page; switch in About; press and hold the version line to open the stats page. Off until `RV.config.stats` is set.
- v2.55.0: swiping (design-doc 70, js/swipe.js): contact rows swipe left for Archive and Delete (long swipe archives, Delete asks, archived rows Restore/Delete, swipe right bounces); Today's list Take off, Could visit today Not today, timeline Delete, campaigns, your topics, saved views, sessions, notes import; cards swipe away; sheets pull down to close; the menu, the year in review and the Calendar's months swipe; toasts in ink and paper, stacked, swipe to dismiss.
- v2.54.1: finishing the service year (design-doc 69): the review is available from August's report Sent until September's; a celebration when August is ticked Sent (See your year in review / Later), an ask on opening the app once a day until watched or dismissed (Watch now / Watch later / Dismiss), one push the morning after; the year view is always open with the review button at its foot.
- v2.54.0: Calendar release 2 (design-doc 69): the year view (folded summary; ring for pioneers, month bars with My schedule, average, credit, carry; tap a month), past months with no days on Hours and Credit wheels (0–150 h), and the service year in review (story cards, no names, Share as an image, music "They Say" off until tapped). The review shows once after the year ends; `#/calendar/review/YYYY-09` opens any year's. Also fixed a stray "null" on the Calendar when a card was missing.
- v2.53.0: the Calendar tab, release 1 of 3 (design-doc 68, docs/SERVICE-TIME.md): profiles by month, days with visits but no time ringed (No service this day, ring to dot), sessions on wheels with overlaps counted once, carry-forward, pace, My schedule, follow-ups on the calendar, Bible study tally with adjustment, report with Copy and Sent (a change after Sent asks once and goes to the month's history), month look back, update card, service time reminder switch. Browser tests see the update card and look back only with `__RV_SVCCARD = 1`.
- v2.52.2: Ideas for next time stops coming back empty: topics go to Claude numbered (ids were copied back wrong, so every pick was dropped), one quiet retry, and an empty result is never saved on the contact (an old saved one is ignored). Design-doc 67. Confirmed working on Mark's phone 2026-11-05.
- v2.52.1: Today's list adds only from + Add in its heading (the empty list's Add people button is gone).
- v2.52.0: follow-up reminders: Menu › Notifications, the app sends only dates/time/time zone under an anonymous ID, the service worker writes the names, and worker/reminders.js (not deployed yet; config empty). Design-doc 66.
- v2.51.0: motivation without guilt (no streak, no chalkboard, the can fills, sundials count weeks with visits recorded, growth kept through gaps, a plan counts only when written), Today's list (day note, follow-ups join on the day, Plan a visit calendar on a contact, Could visit today), and the audit decisions (study plan, timeline, empty Contacts, backup card, Today tab, Not home 3+ in areas). Design-doc 65.
- v2.50.3: audit cleanups: "contact" for the person everywhere (RV only as the stage), local dates for evening entries, carousel cards sized to content, menu closes on Back/Escape, test screenshots and /rv-app/ removed from the site, privacy page updated, Areas' last visit, bigger A to Z and bed-sign targets. Design-doc 64.
- v2.50.2: topic groups are "categories", not "themes" (Theme means light/dark in Display); creating on the Topics page says New (New topic, New category). Stored field names unchanged.
- v2.50.1: first view says what Groundwork is (intro on Today, folds to one row, gone once any step is done; also on About); Getting started is three setup steps, each tappable in any order; imports are two rows (Import from another app, Restore); visit and Not Home tips on the contact outlive the checklist. Design-doc 63.
- v2.50.0: area shapes: Edit areas on the Contacts map opens a full-screen editor (js/areaedit.js; geometry js/areas.js; polygon-clipping in vendor/). Draw by Tap or Crosshair, snapping, overlaps trimmed, one shape per area, sort contacts in, auto-assign from geotag or address. Design-doc 62.
- v2.49.0: New contact has a Potential / RV quick stage (two buttons) and no Clean up under the note; sheets don't pop the keyboard until a field is tapped (`data-autofocus="tap"` keeps it for the Studying sheet). Design-doc 61.
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
- v2.48.3: tract links go through jw.org's finder by docid (`https://www.jw.org/finder?wtlocale=E&docid=…`) so JW Library opens them; a plain jw.org page address opened the browser instead. To check on Mark's phone: the Happy family tract (docid 1102024303 inferred from the run, not read from its page).
- v2.48.2: a tract's scripture buttons open the tract on jw.org (`url` on each of RV.library.TRACTS), not the verse.
- v2.48.1: Topics page: categories read as headers, topics as items under them.
- v2.48.0: the nine 2025 tracts lead (main scripture + Enjoy Life lesson); hand over by link (contact in the # part), iPhone steps, paste in Import, Android share pickup.
- v2.47.0: Hand over a contact as a file (⋯ › Hand over…; receiver: Import contacts › From another publisher); the sender's copy archives as Handed over.
- v2.46.1: growth path stages drawn the same for everyone (not this person's health or kind).
- v2.46.0: growth path fixed (class clash with the garden's stones) with silhouettes that fill in after growth; Archive as a stage choice in Edit; Ideas for next time (AI topic suggestions, only when tapped).
- v2.45.0: import from Witness Work, so its users can migrate to Groundwork (its witness-work-backup.json; built from one sample file a user gave Mark as a reference, not Mark's data, and not kept in the repo): Import contacts › Witness Work, Home's import choices, and Restore › A backup file hands such a file to the import. Contacts with addresses and map coordinates, conversations as visits (studies flagged, not-at-homes as NH), the newest follow-up topic as Discuss next time; studies to Bible Study, nobody talked with to Potential, deleted contacts optional as archived. Service time, plans and settings are not brought in. Design-doc 58.
- v2.44.0: Clean up on every field that records a visit or the person: Edit contact (household notes, Discuss next time), timeline entry edits, Discuss next time on the record.
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
- Calendar release 3 (next, docs/SERVICE-TIME.md): game toggles in Display › Garden (Garden, Visitors, Milestones, Growth moments, Thirsty and wilting) and the Ideas for next time switch on the Note cleanup page. To watch on Mark's phone: v2.53.0's wheels (scroll-snap feel), the update card on first open, the ring card; v2.54.0's year view and the review (preview this year's: https://mygroundwork.app/#/calendar/review/2026-09; the real one appears when August 2027 is ticked Sent), the music on iPhone (Web Audio starts on the speaker tap; it asks iOS for playback audio, so it should play with the ringer switch on silent (Safari 16.4+)) and Share on iPhone and Android.
- Swipe and toasts: built in v2.55.0 (design-doc 70). To watch on Mark's phone: the feel of row swipes and the right-swipe bounce, pulling sheets down (sheets with wheels pull only from the head), the menu swipe, toasts stacking. Archive by swipe uses the reason Other.
- UX audit (2026-11-03, claude/ux-audit.md): easy items shipped in v2.50.3; the decisions and Today's list in v2.51.0 (design-doc 65). To watch on Mark's phone: dragging rows on Today's list by the grip; whether "Could visit today" suggests sensible people; the backup card's timing.
- Usage stats: built in v2.56.0 (design-doc 71), shipped switched off (`RV.config.stats` empty). **Mark's steps:**
  1. Cloudflare › Storage & Databases › D1 › Create database: `groundwork-stats`.
  2. Workers › Create › `groundwork-stats`, paste worker/stats.js, Deploy.
  3. Its Bindings › D1 database, variable name `DB`, the database above.
  4. Variables and Secrets: `ALLOWED_ORIGIN` (Text) = https://mygroundwork.app; `ADMIN_KEY` (Secret) = a long password only Mark knows (never sent to Claude). Settings › Triggers › Cron Triggers: once a day. Deploy.
  5. Send Claude the Worker URL (e.g. https://groundwork-stats.swingtreecactus.workers.dev).
  - **Next action when Mark sends it:** set `stats` in js/config.js, release 2.56.2. Then Mark opens the Worker URL (or presses and holds the version line in Menu › About) and enters the admin key once.
- Follow-up reminders: built in v2.52.0 (design-doc 66), shipped switched off (`RV.config.reminders` and `vapidPublic` empty). **Mark's steps:**
  1. Make the VAPID keys: on a computer, open https://mygroundwork.app, open the browser console, and run:
     `crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']).then(async k=>{const j=await crypto.subtle.exportKey('jwk',k.privateKey),r=new Uint8Array(await crypto.subtle.exportKey('raw',k.publicKey)),b=x=>btoa(String.fromCharCode(...x)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');console.log('PUBLIC:',b(r));console.log('PRIVATE:',j.d)})`
     The public key is safe to share; the private one goes only into Cloudflare as a Secret.
  2. Cloudflare › Storage › KV › create `groundwork-reminders`.
  3. Workers › Create `groundwork-reminders`, paste worker/reminders.js, Deploy.
  4. Its Bindings › KV namespace, variable name `REMINDERS`. Variables: `VAPID_PUBLIC_KEY` (Text), `VAPID_PRIVATE_KEY` (Secret), `ALLOWED_ORIGIN` (Text) = https://mygroundwork.app. Settings › Triggers › Cron Triggers: every 15 minutes. Deploy.
  5. Send Claude the Worker URL and the PUBLIC key.
  - **Next action when Mark sends them:** set `reminders` and `vapidPublic` in js/config.js, release the next version (2.56.2), then Mark turns it on in Menu › Notifications (both the follow-up and the service time reminders use it) (iPhone: from the home-screen app).
- Witness Work import (v2.45.0): built from a single sample backup. Watch for fields the sample didn't use (phone, email, custom fields, contact `customFieldDefs`, conversation field defs, non-US addresses) once more users' files come in.
- Plant kinds (v2.34.0, built 2026-10-28): watch for look-alike pairs in real gardens (apple and cherry trees share a round crown; lemon and cherry leafy share a column shape; colour separates them). The canvas "Groundwork plant kinds" holds the mockups; claude/plant-kinds-draft.js is the pre-build draft (js/kinds.js is the live code).
- Notes import: v2.31.0, reworked in v2.32.0 (design-doc 44–45). **Mark must paste the new worker/ai-proxy.js into groundwork-ai** (body cap raised for screenshots). Then: test with real notes (likely his wife's Samsung Notes) and tune `RV.ai.IMPORT_SYSTEM`. Android share target: Groundwork wasn't in Keep's share menu; Mark to check it was installed from Chrome and reinstall to pick up the manifest.
- Garden scene redesign built in v2.36.0 (design-doc 49). The draft generator claude/garden-scene-draft.js is now history; the live scene is in js/insights.js (`skySvg`, `stonePath`, `fireflies`, `gardenScene`) and the v2.36 block of css/app.css.
- New icon shipped in v2.42.0. To check on Mark's phone: remove and re-add Groundwork on iPhone to see it; Android updates on its own.
- v2.37.0 shipped the study track, held growth/reveal moments and the cleanup meaning check. To watch: whether Fast catches dictation swaps well enough on real notes (Careful is the fallback default); Mario's plant should grow at his next study if he has three study sessions logged.
- Big layout update: release 1 built as v2.38.0 (design-doc 51), release 2 as v2.39.0 (design-doc 52). Replaced (2026-11-03): no tutorial or slideshow; built as v2.50.1 instead (design-doc 63): a first-view intro that folds, and Getting started cut to three setup steps (Add your contacts, Choose your conversation topics, Back up to Google Drive). Mockup: https://claude.ai/artifact/9dWPQDmRaZHQF4tgJXbeGP. Copy rules: don't call it a game in the opener; no campaign line until central campaign publishing ships; tracts and topics are one thing; Today has no per-person plan. To watch: whether the likely-home estimate feels right on real data (thresholds LIKELY_P 0.6, LIKELY_N 0.3 in js/logic.js) and whether cleanup's availability suggestion fires sensibly on real notes (untested against the live model).
- Today redesign built as v2.40.0 (design-doc 53), carousel and series in v2.41.0 (design-doc 54). To check on Mark's phone: verse links (jw.org finder `bible=` codes) open JW Library at the right verse; workbook video links (`pub-mwbv_...`) open the right video (59 of 60 found; patterns verified on 31 weekly pages, not every link opened). Library data: js/library.js, source list in claude/sample-conversations-library.json.
- Known, not fixing (Mark, 2026-10-30): an app update reloads the page when the app comes back to the foreground, which can wipe an in-progress notes import (held in memory). Rare; the fixes (hold the reload during an import, save import progress, lighter screenshot memory) are on file if it comes up again.
- Handing a call to someone: built in v2.47.0 as a file (design-doc 59). Problem found 2026-10-31: on Mark's phone the received .json said "unsupported" and offered JW Library (a home-screen web app can't register to open files). Workaround meanwhile: save the file, then Import contacts › From another publisher.
  - Built in v2.48.0: link as the main way (contact in the # part), iPhone steps with Copy link, paste in Import, Android share pickup, helper text (design-doc 60).
  - Later, if wanted: friends/accounts.
- 2025 tracts: built in v2.48.0 (design-doc 60, data in js/library.js TRACTS). When new tracts come out, add them to TRACTS (main scripture only, lff lesson from the WOL Research Guide, and its docid from its jw.org page, linked through the finder so JW Library opens it).
- Pinned future concept (Mark, 2026-10-31): XP, a gardener avatar, items board, shop and a companion pet are scrapped for now. Keep them as an idea if we look for ways to improve the game later (mockups and the XP table are in the 2026-10-30 chat). Naming visitors (name a visitor on its first visit; later announcements use the name) is the one piece Mark wants in a future rollout, since it doesn't complicate the game.
- Future ideas, do NOT build until Mark explicitly agrees (noted 2026-10-29):
  - Adding a phone number should be a rewarded action in the garden (getting someone's number is a good step).
  - A button to create a phone contact from a Groundwork contact (mapping name, phone, address). Mark: hold off on this for sure for now.
- Area shapes: built in v2.50.0 (design-doc 62, docs/AREA-SHAPES.md). Mark didn't pick Tap or Crosshair, so both ship behind a switch (Tap first). To watch on his phone: snapping distances (22 px corner, 16 px edge) and that marker dragging feels right on touch; the editor needs a connection (map tiles).
- Central campaign publishing (Mark, 2026-11-01): design written, not built: docs/CAMPAIGN-PUBLISHING.md (project claude/campaign-publishing.md). Mark publishes from his own app with an admin key (a Cloudflare Secret he sets himself); every app fetches, caches and merges the list. Updated with Mark's answers: published campaigns are title, dates and explanation only (no topics); users can hide a whole campaign or attach their own topics to it; key behind press-and-hold on the version line in About. Two decisions still open (overlap rule, default on). Build nothing until Mark says build.
- Optional later: act from the garden (long-press a bed); visitors using garden objects, keepsakes; monthly personal challenge; rotate the Google client secret (Mark chose not to); refresh the Garden visitors design canvas.

## Related project docs
- claude/service-time.md (docs/SERVICE-TIME.md): the Calendar and service time design, releases 1–3.
- Design canvas "Groundwork Calendar": https://claude.ai/artifact/Ugp6FJpyAg6QPXNFjfiKdg
- claude/ux-audit.md (docs/UX-AUDIT-2026-11-03.md): UX and workflow audit at v2.50.2 against the mission and the model games; shipped in v2.50.3 and v2.51.0. Mark declined the to-water list, the Today line and the Areas count (no pressure).
- claude/area-shapes.md (docs/AREA-SHAPES.md): design for drawing areas on the map, built in v2.50.0.
- claude/campaign-publishing.md (docs/CAMPAIGN-PUBLISHING.md): design for publishing campaigns to every user, not built.
- claude/app-audit.md (docs/AUDIT-2026-10-31.md): full app audit at v2.45.0, issues ranked; many have since been addressed by later releases, so check an item against the current app before acting on it.
- claude/design-doc.md: the design log's current part (sections 68 on); claude/design-doc-1.md (1–27), claude/design-doc-2.md (28–50) and claude/design-doc-3.md (51–67) hold the earlier ones.
- claude/gamification-review.md: the game review and the comparison with model games.
- claude/garden-plan.md: garden spec (section 12: plant kinds and palette, built in v2.34.0).
- claude/brand-guide.md: brand.
- Design canvas "Garden visitors": https://claude.ai/artifact/EX832JVcy4GSFeaRhha6yC
- Design canvas "Groundwork area shapes": https://claude.ai/artifact/5TjAXi36dQkTsju3gfJqE7
- Design canvas "Groundwork plant kinds": https://claude.ai/artifact/7TX6CxTZr17EUpTGSAzyeL
