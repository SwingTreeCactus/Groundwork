# Groundwork: Design Doc (formerly JW-CRM)

Status: spec filled in by Mark on 2026-10-15. Phase 1 (local-only) is the first build.
This file is the source of truth for later sessions, so keep it current when decisions change.

## 1. What it is

A private, mobile-first CRM for door-to-door ministry follow-up. It treats records as a funnel
that needs attention over time, not as an address book. Web app (PWA), installable on the
Android home screen, works with no signal, no server. Each person's data stays on their own
device (phase 1) and later in their own Google Drive (phase 2).

Principles:
- Local-first. IndexedDB is the working copy; sync is a background extra.
- Attention is computed from activity, so nothing relies on remembering to enter a date.
- Area/neighborhood is a sort, never the main structure.
- Never hard-delete people. Archive with a reason.
- Fast in the field: one-tap Not Home, quick add, big tap targets.

## 2. Vocabulary (all editable in Settings > Labels)

| Concept | Label | Short |
|---|---|---|
| Person/household record | RV / RVs | RV |
| Funnel | Lead stages | |
| One-tap no answer | Not Home | NH |
| Log a conversation | Record visit | |
| Seasonal focus | Campaign | |
| Saved openers | Conversation starters | |
| Saved scriptures | Scriptures | |
| Saved topics | Topics | |
| Area grouping | Neighborhood | |
| Study | Bible study | BS |
| Closed records | Archive | |
| Daily attention list | Today | |

Terms follow wording found in JW.org publications (initial call, return visit, cultivate interest,
not-at-home, Bible study).

## 3. Lead stages (default, editable)

| # | Stage | Days before flagged | Type |
|---|---|---|---|
| 1 | Yet to Contact | default (14) | Active |
| 2 | Initial Call | 7 | Active |
| 3 | Cultivating Interest | 7 | Active |
| 4 | Return Visit | 14 | Active |
| 5 | Bible Study | 30 | Active |
| 6 | Archived | never | Closed |

- Any RV can move to any stage, forward or back (sheet: "Yes" for all active stages).
- Blank threshold means "use the default" (14 days). 0 means "never flag". Closed stages never flag.
- Archiving requires a reason.

## 4. Archive reasons (default, editable)

| Reason | Restorable | Hidden from normal lists |
|---|---|---|
| Moved away | Yes | Yes |
| Not interested | Yes | Yes |
| Do not call | No | Yes (special: flagged DNC) |
| Duplicate record | No | Yes |
| Other | Yes | Yes |

"Do not call" archived records stay searchable in the Archived view and are matched by
duplicate detection, so a new RV with the same address or phone gets a strong warning. Their
detail screen has no Not Home / Record visit buttons, only a warning.

## 5. RV fields

Required: name, stage, date first met (auto). Everything else optional.
Included: address, neighborhood (list), phone, how we met (list), best times (structured, see 7),
household notes, interests/questions raised, scriptures discussed, tags, next visit date,
custom fields (user-defined, text). Excluded for now: email, language.

## 6. Attention logic (pure functions in js/logic.js)

lastTouched = newest non-deleted timeline entry (Not Home, visit, note, stage change), else the
date the RV was created. Editing fields does not count. A Not Home counts, since you went.

State for an active RV:
1. Snoozed: snoozedUntil is today or later. Not flagged.
2. Next visit date set: overdue if before today; "coming up" if within the coming-up window
   (default 7 days); otherwise ok. The date overrides recency.
3. Otherwise by recency: days since lastTouched against the stage threshold. Overdue when the
   threshold is reached; "coming up" when within the heads-up window (default 2 days).

Today screen: Overdue (most overdue first), Coming up (soonest first), then Recently added.
Home cards show the top few with "See all".

## 7. Not-home banner and best times

Best times are structured windows: days of the week plus a from/to time, several allowed per RV,
plus a free note. Entered by hand, and later joined by history.

Banner, shown on an RV's detail screen when all hold:
- Global setting on and not disabled on this RV.
- Now is not inside any of the RV's best-time windows.
- Day-level: at least N Not Homes (default 2) logged on the same weekday and same part of day
  (morning 5-12, afternoon 12-17, evening 17-21, night otherwise) and zero recorded visits there.
- Fallback: weekday-vs-weekend and same part of day, with N+1 Not Homes and zero visits.
It says plainly how many tries it is based on. A minimum sample keeps it from guessing.

"Likely home now" (card off by default): RVs whose best-time window contains now, then RVs with
home history in this slot (at least one visit and at least half of tries at home).

## 8. Screens

- Home: cards in user order, each toggleable. Campaign (switches + note), Conversation starters,
  Scriptures, Topics (items marked show-on-home), Needs attention, Coming up, Recently added,
  Quick add, Likely home now.
- Today: the full attention lists.
- RVs: stage chips (multi-select), sort (Needs attention, Longest since visit, Neighborhood,
  Name, Newest), neighborhood filter, search (name, address, phone, notes, tags, visit notes),
  saved views, NH button on each row (setting, default on).
- RV detail: banners, Not Home and Record visit, call/text/navigate, move stage, snooze, archive,
  fields, timeline (editable notes), stage history.
- Not Home: instant, timestamped. Toast with Undo and Add note for 6 seconds.
- Record visit: dialog every time. Notes field plus a "More details" section (stage, next visit
  date, scriptures discussed, tags, snooze). Dictation uses the phone keyboard microphone.
- Quick add: name, address, neighborhood, note, stage (default Initial Call). Duplicate check.
- Settings: Display, Home cards, Libraries (starters, scriptures, topics, campaigns), Stages,
  Archive reasons, Lists and custom fields, Labels, Needs attention, Security, Data.

## 9. Data model (IndexedDB "rvapp", version 1)

Stores: rvs, entries, lib, meta. Settings live in meta under key "settings".
Every record has a UUID id, updatedAt, and deletedAt for soft delete, so phase 2 can merge by
record rather than overwrite one big file.

- rv: id, name, address, neighborhood, phone, howMet, bestTimes[{days,from,to}], bestNote, notes,
  interests, scriptures[], tags[], custom{}, stage, archiveReason, prevStage, nextVisit (YYYY-MM-DD),
  snoozedUntil (YYYY-MM-DD), nhBannerOff, createdAt, stageChangedAt, updatedAt, deletedAt
- entry: id, rvId, type (nh | visit | note | stage), at, text, scriptures[], from, to, reason,
  updatedAt, deletedAt
- lib: id, kind (starter | scripture | topic | campaign), title, text, tags, showOnHome, active, order,
  updatedAt, deletedAt

## 10. Phases

1. Local-only app: everything above except items marked later. Includes app lock (PIN), CSV
   export, full backup/restore, CSV import with field matching, dark mode and text size.
2. Google sign-in and Drive sync (drive.file scope), merge by record. Import from Ministry Assistant
   once a sample export is available. Map pin, calendar reminder, tags on libraries.
3. Richer best-time statistics, optional AI note cleanup (user's own API key), monthly stats,
   shareable setup (libraries without RVs).

Not planned: service time and monthly report tracking.

## 11. Decisions made on ambiguous answers (check these)

- The Home Cards tab no longer listed Conversation starters and Scriptures; assumed deleted by
  accident and kept both on (orders 2 and 3).
- Lead Stages said blank means never flagged; Practical said default 14 days. Resolved as above:
  blank uses 14, 0 means never.
- The note "Needs an archive reason" sat on the Bible Study row; treated as belonging to Archived.
- Best time to contact became structured windows instead of free text, so it can drive the banner.
- App lock is a PIN screen, not encryption. A forgotten PIN means clearing the app's data, so
  keep a backup.
- Maybe items in My Guesses were left as in the sheet (phase 2 or 3).
- "JW-CRM" is a working name only. If the app is shared widely, pick a name that does not imply
  it is an official organization app.

## 12. Hosting and testing

Static files; host on GitHub Pages. All paths are relative so a repo subpath works. Service
worker caches the app shell (bump CACHE in sw.js on every release). Install on Android via
Chrome menu > Install app. iPhone: Safari > Share > Add to Home Screen.

Tests: `node tests/logic.test.js` for the pure logic. Browser smoke test: tests/smoke.py
(Playwright).

## 13. v2 release (current)
Changes bundled in v2 (version 2.0.0, service worker cache rvapp-v3):
- Manual timeline notes removed (timeline is automated; Not Home toast "Add note" still annotates an entry).
- Conversation starters and Scriptures merged into one Topics library (old items migrated as topics tagged starter/scripture). Per-RV Scriptures field stays.
- Home: campaign banner (tap for details), Topics, quick add. No work lists. Flat, calm style.
- Today: Overdue, Scheduled today, Tagged for today (by part of day), plus Next 7 days forecast.
- Day tags: primary (auto-set on Quick Add) and secondary best day + part of day. Overdue is held back on non-tagged days until 2x the stage threshold.
- RV detail: pinned "Discuss next time", last-visit summary, household notes.
- Insights tab: funnel (tap to filter), effort points (Not Home 1, visit 3, advance 5, new RV 2; level = 1+floor(sqrt(lifetime/20)); no streaks), 60-day activity, Worth reconsidering, Stuck in stage.
- Campaigns (Settings): name, topic, dates, details, featured publications; one at a time, auto-active by date; visits/new RVs tagged with per-save toggle (default on).
- Record Visit topic chips insert "Topic: Title"; Quick Add with blank note writes "Campaign: X. Topic: ...".
- Dropped: visiting-partner field.

### v2 interpretation decisions (check these)
- Forecast counts planned visits and RVs tagged for that weekday.
- Tagged for today excludes RVs visited today, snoozed, closed, or with a future planned date.
- Worth reconsidering: 3+ Not Homes in a weekday+part (or weekday) with no visit there.
- Stuck in stage: time in stage >= 3x its threshold.
- Legacy active campaign migrates to a 30-day run starting today; inactive ones need dates.
- Quick Add past the first stage always logs a first visit entry.
- Imported RVs earn no new-RV points.
- Home keeps optional, off-by-default Recently added and Likely home sections.

### Future (not built)
Google Drive sync, Ministry Assistant import (needs a sample export), AI note cleanup.

## 14. v2.0.1: less on-screen explanation
Removed explanatory hints and helper text across the app (settings page intros, field help lines, long placeholders, empty-state coaching, Insights section notes, sheet intros). Kept: destructive confirmations, the PIN-loss warning, and the stage "days before flagged" line.
Planned next: Google Drive auto backup (one visible backup file in the user's own Drive, drive.file scope, redirect sign-in for iPhone, needs a Google Cloud OAuth client ID).

## 15. v2.1.0: Nothing-style skin and Google Drive backup
Look: black/white (off-white and pure black in dark), one red accent, dot-matrix display type (Doto) for titles and numbers, Space Mono for small caps labels, Space Grotesk for body. Fonts are bundled in /fonts (SIL Open Font License) so the app still opens offline. Funnel and level bars are dot rows. Pill buttons, large rounded cards, no shadows. Stage badges are outlined mono; red is kept for overdue, live, and the active tab dot.
Drive backup (js/drive.js, js/config.js): one visible file "JW-CRM backup.json" in the user's own Drive, drive.file permission only (the app sees only files it made). Sign-in is a full-page redirect (implicit grant) so it works in an installed iPhone app; redirect URI = the app's own address. Saves ~15 s after a change, when the app is left, and on "Back up now". Before saving, if another device saved since, its records are merged in first (newest updatedAt wins). The sign-in lasts about an hour with no server; when it lapses and changes are waiting, a "Drive backup paused / Reconnect" banner shows. Restore reads the file back through the normal merge/replace choice. Disconnect revokes the token and leaves the file. Needs googleClientId in js/config.js.

## 16. v2.2.0: Study stage layout
Stages flagged study (the default Bible Study stage; older saved settings are matched by id "study") change how a record looks and logs:
- Detail leads with a Studying block (publication, "Stopped at ..." and the date of the last study), then Discuss next time. The last-visit note is not shown. The primary button reads "Log study" (label editable in Settings > Labels).
- Log study form: Publication (suggestions from ones already used), Where you stopped, Discuss next time, optional Note. No topic chips or campaign toggle. Stage is still under More details.
- Each study saves progress and publication on its own timeline entry (shown as "Study"); the record keeps the latest. Tapping the Studying block edits both. The full edit form shows the two fields only while the stage is a study stage.
- List and Today rows show "Publication · place" instead of the usual subtitle. Both fields are searchable and included in the CSV export.
Interpretation: progress is free text (lesson, paragraph, page), not a structured count. A study logged with an earlier date than the newest one still becomes the record's current place.

## 17. v2.3.0: comfort pass
Why: the Nothing-style skin felt clunky (outlines everywhere, mono caps labels, dot-matrix on names, nested outlined boxes).
- Type: Space Grotesk for everything, sentence-case labels at 13-14 px or larger. Doto (dot-matrix) only for the five tab titles and big numbers; record names and sub-screen titles use the plain face. Space Mono removed.
- Surfaces: no outlines. Lists are one white grouped surface with hairline dividers; cards, inputs, chips and secondary buttons are filled (soft grey inside white cards and sheets, white on the page). Black is kept for the one main action per screen.
- Stage: five pips show where a record is in the funnel (filled = current position) instead of an outlined badge. Overdue stays a small red pill.
- Record detail: Discuss next time and last visit are soft grey blocks; on a study record the Studying block is the solid black one.
- Navigation: sentence-case labels with a soft pill behind the active icon. Rows and buttons are at least 48 px tall.

## 18. v2.4.0 hamburger menu and compact layout

- Settings tab removed from the bottom bar (Home, Today, RVs, Insights). A hamburger button at the right of every top-level header opens a slide-in drawer listing the settings sections. The `#/settings` index page still exists as the back target for settings sub-pages.
- Header is one slim row (about 48 px); the Home date sits inline beside the title.
- RVs filters (search, stage chips, selects) and list rows are tighter; stage, overdue flag and last-visit text share a wrapping line.
- sw.js cache rvapp-v9.

## 19. v2.5.0 navigation and faster logging

Informed by research on top CRMs (Pipedrive, Badger Maps, Outfield, Less Annoying CRM): the phone is the main tool, the next action is one tap away, and unused detail is hidden.

- Directions button (arrow icon) on every list row and in the record detail. `UI.openNav(address)` opens Apple Maps on iOS and Google Maps driving directions elsewhere; the phone's maps app handles the rest.
- Tap a row's stage to change it without opening the record (`F.stageFlow`).
- Quick-log chips on the record detail ("Brief chat", "Left literature") log a visit in one tap with Undo. Hidden for study-stage records.
- Details card is folded by default. Header and list spacing tightened in v2.4.0.
- Not built yet: map view of all records (needs internet for tiles), configurable quick-log outcomes.
- VERSION 2.5.0, cache rvapp-v10.

## 20. v2.6.0 Ministry Assistant import

- Settings > Data and backup > "Import from Ministry Assistant" reads a `.mabackup` file. The file is gzip-compressed Smile (binary JSON) data.
- `js/smile.js`: small Smile decoder (shared key names, short/long strings, ints, floats, nested objects/arrays). `{pairs: true}` keeps repeated keys, which the backup relies on (every person sits under a repeated "Pe" key).
- `js/ma.js`: pure converter. Person fields used: N name, Add street, City (or the backup's single city), Zip, Hidden (archived), Inf > PI entries (I note, Sc scriptures, D date) become timeline visits; earliest timestamp becomes the created date.
- Unknown from the single small sample: the meaning of Type/TpI/PtI, Age, Prio, VTm, Pinned, Territories, Suburbs. Phone and suburb keys are guessed (Ph/Phone/Tel, Sub/Suburb). Ignored fields are not imported.
- Import sheet: choose the stage for imported people, skip duplicates (address match, also against saved street-only addresses). Re-importing the same file adds nothing new.
- Tests: Smile/convert unit test plus a synthetic .mabackup written by a tiny Smile writer in tests/smoke.py. VERSION 2.6.0, cache rvapp-v11.
- v2.6.1: optional checkbox "Set best day and time from their last visit" (on by default). The newest imported note that is not a not-home (text like "NH", "Not home", "No answer") sets `dayPrimary` to that visit's weekday and part of day (morning/afternoon/evening/night, local time). Not verified against a full real backup: how Ministry Assistant records not-home attempts is unknown (the first sample only held conversation notes), so attempts stored without a note are simply not imported.
- v2.6.2: the Edit form has a red "Delete this RV" button at the bottom (existing records only), with the same confirmation as the ... menu. Cache rvapp-v13.
- v2.6.3: re-importing a Ministry Assistant backup with the best-day box ticked fills dayPrimary on people already in the app who have none (matched by address); a best day already set is never changed, and no duplicates are added. The summary says how many will be updated. Cache rvapp-v14.

## 21. v2.7.0 who to see today, roomier screens, clearer buttons

- Today: "Overdue: good day today" comes first: overdue people whose best day is today, or who are usually home at this time (from visit history, `likelyHomeNow`), grouped by part of day with the current part marked Now. Then Scheduled today, "Also good today" (tagged today, not overdue), and "Overdue: other days" folded shut with a "No best day" hint. `L.todayPlan` returns goodToday, otherDays, nowPart.
- Rows show the best day as a short label ("Thu eve", `L.tagsShort`). RVs list has a best-day filter (Any day, Good today, a weekday, No best day), remembered with the other list filters.
- Visit sheet: typing or tapping in the note opens a full-screen writing view sized to the visible screen above the keyboard (visualViewport -> --vvh/--vvt); "Show other fields" returns. Note box auto-grows otherwise. No character limit.
- Detail: buttons read "Record NH" and "Record a visit" (old default label migrated, custom labels kept); one-tap log has a label and button styling. Note blocks sit on the card with dividers instead of nested boxes. Page margins 12px, card padding 14px, inputs 44px; list row side buttons 40px.
- VERSION 2.7.0, cache rvapp-v15.
- v2.7.1: the Last visit note on the record screen shows in full (3-line clamp removed); notes, timeline text and household notes keep line breaks. Cache rvapp-v16.
- v2.7.2: overdue after 30 days by default (all active stages and the fallback). One-time migration (`overdue30` flag) moves untouched old defaults (Initial 7, Cultivating 7, Return 14, fallback 14) to 30; hand-set values stay. Undo toasts last 4 s (was 6), are a small pill at the bottom left clear of the + button, and close on tap. The Not Home toast keeps its own setting. Cache rvapp-v17.
- v2.7.3: RVs search looks through everyone (all active stages; non-hidden archived as before) and ignores the remembered stage chips, best-day and neighborhood filters while a search is typed; the count line says so. Search listens to input, search, change, compositionend and keyup for Android keyboards. Today: the 7-day forecast is removed and Scheduled today moved to the top of Home, shown only when there is at least one (`L.forecast` kept but unused). Cache rvapp-v18.

## 22. v2.8.0 simpler scheduling, clearer studies, calmer color

- Best days are a set of weekdays (`rv.bestDays`, any number, picked in the edit form as seven day buttons). Part of day and best-time windows are gone from the app. Older records are migrated once on load (`migrateBestDays`, from dayPrimary/daySecondary days); `L.bestDaysOf` also reads the old fields when a record has no bestDays. Quick add stamps today; the Ministry Assistant import sets the weekday of the last real visit; re-import fills existing people with none.
- Today is two flat lists: "Overdue: good day today" (best day today, or usually home on this weekday from history: "Home 2 of 3 Thursdays") and "Also good today", then "Overdue: other days" folded. The not-home banner goes by weekday ("Not home on Thursdays").
- Next visit dates are removed: no field in the visit sheet or edit form, no "Set next visit" in the banner or menu, no Scheduled today on Home. `attention()` ignores rv.nextVisit unless `settings.useNextVisit` (off; kept for tests).
- Study logging: Publication, Covered today (starts as what was planned) and Start next time (free text; `L.suggestNext` offers the next number when the text ends in one, and stops once the person types their own). The detail block shows Studying / Next / Last covered; timeline says "Covered Lesson 5 ¶14 · next: Lesson 6"; list rows show "Publication · Next: Lesson 6". Studies have no separate Discuss next time (shown only if an old one exists). New fields: rv.nextStart, entry.nextStart.
- Row buttons: "Log NH" with "Map" under it in one column at the right edge.
- Accent is purple (default) or blue, chosen in Display; it replaces red everywhere (overdue badges, tab count, dots, underlines). Warnings (Do not call, delete) use a muted amber. Implemented by redefining the `--red` token per `data-accent`.
- VERSION 2.8.0, cache rvapp-v19. Tests: logic 44, smoke 191.
- Packaging: release zips are named JW-CRM-v<VERSION>.zip (from 2.8.0).
- v2.8.1: the neighborhood/area field (edit form and Quick add) is a pick list of saved and used areas with "+ Add new…" instead of free text. A new name that matches an existing one ignoring case and spacing picks the existing one. Settings > Lists and custom fields shows each area with its record count, flags near-duplicates, and offers Rename or merge (typing an existing name moves its records over) and Remove. Cache rvapp-v20.

## 23. v2.9.0 one New RV form, three note fields

- One form for new contacts (the + button and every Add RV spot; Quick add is gone, `F.quickAdd` now opens it). Short: Name, Address, Area, "What did you discuss?". Filled in: Initial Call, House to house, today as a best day, the running campaign. "More details" expands phone, stage, how we met, household notes, best days, discuss next time, tags, custom fields, campaign switch and the not-home banner switch in place, keeping what was typed. The note becomes the first visit (Last visit); for a Yet to Contact stage it goes to household notes. Editing opens the full form with no visit note.
- Note fields are Household notes, the visit note, and Discuss next time. Interests and questions and Scriptures discussed are removed from the forms and the visit sheet; on load, existing interests and record-level scriptures are appended once to household notes ("Interests: …", "Scriptures: …") and cleared. Entry-level scriptures already in the timeline stay.
- How we met: "Door" renamed "House to house" (list and records, migrated on load) and is the default for new contacts and Ministry Assistant imports.
- VERSION 2.9.0, cache rvapp-v21. Smoke tests 212.
- v2.9.1: new app icon (house-shaped speech bubble with three dots, on #5B3E96), favicons and maskable icons in icons/, rebuilt from the brand guide geometry; manifest, index.html and sw.js updated. See docs/BRAND.md. Cache rvapp-v22.
- v2.9.2: app renamed Groundwork (title, home-screen name, About, privacy page, Drive backup file name "Groundwork backup.json"). Repo and web address unchanged. Release zips are now named Groundwork-v<VERSION>.zip. Cache rvapp-v23.
- v2.9.3: Home's title reads Groundwork. Updates: the service worker now caches new versions with fetch cache 'reload' (it used to pick up stale copies from the browser's HTTP cache; GitHub Pages allows 10 minutes), registers with updateViaCache 'none', checks for an update on every open and return to the app, and reloads into the new version by itself (or offers Reload when a form is open). Tested: an open app switched from the old to a new version on returning to it. Cache rvapp-v24.

## 24. Hosting move and v2.10.0 Drive folder and daily copies

- Hosting (2026-10-20): the app is served at https://mygroundwork.app (domain at Cloudflare Registrar, DNS only, records point at GitHub Pages; CNAME file in the repo root must stay). Google OAuth client set in js/config.js (project jw-crm-511816, testing mode, drive.file scope; origin https://mygroundwork.app, redirect https://mygroundwork.app/). Cache rvapp-v25 shipped the client ID.
- v2.10.0: Drive backup lives in a "Groundwork" folder the app makes itself (a folder made by hand is invisible under drive.file). A backup saved by an older version at the top of My Drive is moved into it on the next save. Before the first save of a new day, the current file is copied (inside Drive, no upload) to "Groundwork backup YYYY-MM-DD.json", named for the day of the last save; the newest 7 copies are kept and older ones go to the Drive bin. Restore lists Latest backup, then the daily copies, newest first. If the folder or file is binned in Drive, the next save makes fresh ones.
- Tests: tests/drive_folder.py (fake Drive, 23 checks). Note: tests/logic.test.js and tests/smoke.py in the repo predate v2.7.2 and fail against the current code; refresh them from the latest release.
- VERSION 2.10.0, cache rvapp-v26.
- v2.10.1: Today's first two sections are headed by the weekday ("Tuesday: overdue", "Tuesday: also good") instead of "Overdue: good day today" and "Also good today". Cache rvapp-v27.
- About page (about.html): public description for Google's brand review, linked from the privacy policy; use https://mygroundwork.app/about.html as the consent screen home page.

## 25. v2.11.0: Today dashboard, simpler RVs page, calmer rows (built 2026-10-20)

Mockups were made in a session on 2026-10-20 (rendered with the real app styles and 14 sample people).
- Today tab becomes a dashboard: a Today / All switch (pill segmented control, remembers last choice, opens on Today), a one-line total ("11 to see on Tuesday" / "14 RVs"), and one large circle per active stage (Doto number, stage name under it; 2-2-1 grid; empty stages dimmed; the study stage circle is solid). No overdue line under the circles. Tapping a circle opens that stage's list with the same Today/All scope, most urgent first.
- Today scope: every active RV whose best day is today, or who is usually home on this weekday (visit history), or who has no best day set; snoozed and archived left out; anyone visited today drops off so the count goes down.
- RVs page: search bar (kept) with one filter button beside it. Default order is longest since last visit first (no group headings), so nobody falls through the cracks. Search looks through everyone; an address match shows the address line with the match highlighted.
- Filter and sort page (opened from the filter button): one horizontal picker wheel per category, iOS style: one continuous track, the choice centred on a raised pill, neighbours fading at the edges, wraps around, snaps on release. Sort (Longest since visit, Area, Name, Newest), Stage (Any stage + stages), Area (Any area + areas), Best day (Any day, Today, Mon..Sun, None set). A wheel off "Any" gets a purple outline. One choice per category (combinations go in Saved views). "Show N RVs" updates live; Reset; Saved views. On the list, the filter button turns solid with a count and removable chips show the active filters, with "N of M RVs · Clear all".
- Rows everywhere: larger bold name; area (not address) with stage pips and stage name; then "Last 6 wk ago", shown in the accent colour when the person is due. NH and Map stacked on the right. No "Overdue" wording anywhere: badges and headings removed, settings labels say "due". Study-stage rows keep publication and next lesson.
- Home: the New RV button card is removed (the + button covers it); the empty-state welcome card keeps its Add button.
- Built as v2.11.0, cache rvapp-v28. Code: `L.todaySet` (Today scope), `UI.wheel` (circular picker: swipe snaps, tap a neighbour, arrow keys, light vibration), `today(stageId)` with routes `#/today` and `#/today/<stageId>`, `list()` with the filter sheet. List state key rvapp.list now stores {sort, stage, neighborhood, bestDay}; older multi-stage state and saved views fall back to one stage or Any. Default sort `oldest`. The Today/All choice is kept in rvapp.today. The tab badge still counts people due (state overdue), labelled "due for a visit". The person screen no longer shows the due banner; Snooze stays in its menu. Insights still uses `L.todayPlan`.
- v2.11.1: Today circles are all white with a soft shadow and larger numbers (dark mode: lighter grey); empty stages show a faint 0. The first stage is named "Potential" (was "Yet to Contact"): anyone not yet in a real conversation, whether never contacted, a brief word at the door, or "busy, come back". Stage id stays 'yet'; saved settings still reading "Yet to Contact" are renamed once, a hand-set name stays.  Cache rvapp-v29.
- v2.12.0: Today circles are solid ink with a white number in light mode and white with an ink number in dark mode (var(--accent) / --accent-fg); empty stages are faded. RVs opens on area tiles (count in Doto, area name, "N due" in the accent or "All recent"), then "Up next": the three longest since a visit. A search or any filter switches to the plain list. Tapping a tile (#/rvs/area/<name>, "-" for no area) lists "Likely home <weekday>" first (`L.likelyHomeToday`: best day today or usually home this weekday, not visited today, not snoozed; people with no best day are not guessed), then "Others", each longest since a visit first. Cache rvapp-v30.
- v2.12.1: area tiles use the same colours as the Today circles (ink with white text in light mode, white with ink text in dark mode); the due line is bold in the tile's text colour, "All recent" is faded. Cache rvapp-v31.
- v2.12.2: the "Edit Home screen" link under Home is removed (Home screen settings stay in the menu). Cache rvapp-v32.
- v2.13.0: person screen trimmed. The one-tap log (Brief chat, Left literature), its label, and the small Call/Text/Directions/Stage buttons are gone; the actions are Record NH and Record a visit (Log study). The address line is tappable and opens directions (navigation icon beside it); the phone line calls, with a text icon beside it. Stage changes stay in Edit and the ··· menu. The study block is now a plain row: Studying, the publication, then one line "Next: … · last covered …". Cache rvapp-v33.
