# Groundwork handover (2026-10-22, after v2.20.0)

Read this first in a new chat, then read claude/design-doc.md (the full design history, sections 1–32) for detail.

## The project
- Groundwork: Mark's private, mobile-first PWA for door-to-door return visits (field service follow-up). Live at https://mygroundwork.app.
- Repo: SwingTreeCactus/groundwork (redirects to SwingTreeCactus/Groundwork). Push to main deploys. Clone it in the new session (add_repo, then clone to /home/claude/groundwork).
- Current release: v2.20.0 (`RV.VERSION` in js/app.js), service-worker cache `rvapp-v61` (sw.js). Last commit a2fdd3f.

## Working rules (Mark's standing preferences)
- Every release: bump `RV.VERSION` and the sw.js `CACHE` (next: 2.28.1 / rvapp-v73), run all tests, commit and push, add a design-doc entry to docs/DESIGN.md and project_write the whole file to claude/design-doc.md, and send the zip `Groundwork-v<VERSION>.zip` (made with `git archive`).
- Commit messages end with the Co-Authored-By and Claude-Session lines from the session's attribution reminder.
- Answers: concise, direct, plain prose. Minimal on-screen text in the app.
- Accent colour: purple is the default, blue is an option. Never red. He dislikes transparency in the plant art.

## Architecture
- Vanilla JS on a global `RV` namespace: util, logic, store, garden, geo, plant, forms, screens, ui (ui-core.js), insights, gmap, drive, settings, app. Data in IndexedDB. index.html loads the scripts; sw.js lists ASSETS.
- Stages: internally Potential, Initial Call, Cultivating, Return Visit, Bible Study. Users see only Potential, RV (the three middle stages) and Bible Study (`L.shownStages / shownStage / shownName`). Growth moves people through the hidden stages.
- Garden (js/garden.js): care levels shown are Lush 5, Healthy 4, Thirsty 2, Wilting 1 (3 is never returned). `G.forItem` is memoised. Exhibits, streaks, weekly recap.
- Plants (js/plant.js): drawn procedurally by `plantSvg`; each person gets a variant from a hash of the record ID; `P.make(form, care, opts)`.
- Tabs: Home (campaign banner and topics, then Today with three stage tiles and Almost growing, then Up next), Contacts (Tiles / Folders / Map switch, remembered in localStorage `rvapp.rvsView`), My garden (the garden; Insights when the garden is off).
- Record screen: Record NH, Record a visit, and Log study for every RV (not Potential). Last visit block and timeline Edit open the visit edit sheet, which has a Study session toggle (`ST.growNow`).
- Map (js/gmap.js): bundled MapLibre 5.24.0 (vendor/maplibre), OpenFreeMap positron restyled by `restyle()`, potted-plant pins, missing coordinates from Nominatim (one per second), All / Today toggle, Locate button, card with Open / Directions. v2.20: a fresh open zooms to the user's location (zoom 15, You dot; falls back to all pins); returning from a contact restores the last view (module-level `lastView`, kept for the session).
- Drive backup (js/drive.js): drive.file scope, Groundwork folder, current backup and 7 dated daily copies. Connection kept in localStorage `rvapp.drive` (not in backups).

## Drive reconnect fix (v2.20.0) and what is pending
- Cause: the browser-only sign-in gives one hour of access and no renewal.
- Live now: Reconnect first tries `prompt=none` silently, and falls back to normal sign-in on interaction_required, login_required or consent_required.
- Built, waiting on Mark: worker/token-helper.js, a Cloudflare Worker that holds the client secret.
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

## Tests (all passing at v2.20.0)
- `timeout 900 python3 -I tests/smoke.py /tmp/out/shots` (253)
- `python3 -I tests/screens.py . /tmp/out/scr` (42)
- `python3 -I tests/drive_folder.py` (36, fake Drive, silent reconnect, helper flow)
- `python3 -I tests/ai_cleanup.py` (22)
- `node tests/garden.test.js` (33), `node tests/logic.test.js` (48), `node tests/worker.test.mjs` (6)
- Gotchas:
  - `replaceChildren(null)` renders "null", so filter out nulls first.
  - A shell pipe can hide a failing `&&` chain, so check every suite's output.
  - The map test hook is `document.querySelector('.gmap').gmapMap()`.
  - `RV.gmap._view()` and `RV.gmap._forget()` are there for tests.

## Recent history (from Mark's feedback)
- v2.19.3: map area overlay removed, three visible stages, the RVs tab renamed Contacts.
- v2.19.4: map moved to Contacts, Today merged into Home, Insights is the garden only.
- v2.19.5: map toggle is All / Today.
- v2.19.6: Log study on every RV.
- v2.19.7: edit a past visit into a study.
- v2.20.0: Drive fix, and the map opens on you and keeps its view.

## Related project docs
- claude/design-doc.md: full design log.
- claude/garden-plan.md: garden spec.
- claude/brand-guide.md: brand.
