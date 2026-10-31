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
- v2.13.1: tapping the Studying block opens only "Start next time" (the publication and last covered are changed in Edit). Log study pre-fills Covered today with what was set for next time (editable) and suggests the following lesson; its Publication field shows only while none is set. Cache rvapp-v34.
- v2.14.0: on RVs, the summary line ("N RVs in N areas") is replaced by a Tiles / Folders switch (remembered in rvapp.rvsView). Folders: one card per area with the area name, "N due · last visit there …", the count, and a chevron; tapping opens it in place to show likely home today first, then others (same lists as the area screen, `areaSections`). Several folders can be open. Tiles is unchanged. Cache rvapp-v35.
- v2.14.1: folder headings stand apart: area name larger (1.45rem) in the accent colour, count in the accent, and an open folder's header gets the soft accent background. Cache rvapp-v36.

## 26. v2.15.0 note cleanup with Claude

- Dictation stays with the phone keyboard microphone (Claude's API takes no audio). A "Clean up" button under the visit note (and under "What did you discuss?" on the New RV form) sends the note and Discuss next time to Claude, which fixes punctuation, misheard words and scripture references, drops filler, and moves next-time items into Discuss next time (existing text there is always kept). Undo toast restores both fields. Not on Log study.
- Settings > Note cleanup: the user's own Anthropic API key (checked with a tiny request before it is kept), model Fast (claude-haiku-5-5, default) or Careful (claude-sonnet-5-5). The button only appears when a key is saved.
- js/ai.js calls https://api.anthropic.com/v1/messages straight from the browser (anthropic-dangerous-direct-browser-access header). Key and model live in localStorage (rvapp.aiKey, rvapp.aiModel) so they never reach backups, Drive or exports. Offline, busy, bad key and odd replies all leave the note untouched with a toast.
- Privacy page has a "Note cleanup with Claude" section.
- Tests: tests/ai_cleanup.py (fake API via Playwright route, 22 checks). VERSION 2.15.0, cache rvapp-v37.

## 27. v2.16.0 the garden (built 2026-10-21)

Spec: `claude/garden-plan.md`. Art and motion ported from the "Groundwork garden insights" canvas.
- Code: `js/garden.js` (pure: form, care, chains, Follow up on hold, growth, Almost growing, week ring, streak, rates, activity grid, plots, exhibits; Node-testable) and `js/plant.js` (SVG characters, CSS tokens per accent and theme, sway/blink/bubble/shimmer, water bounce, lean on touch, growth moment, off-screen pause, reduced motion).
- Saving: `logVisit` stores `entry.plan` (Discuss next time set, or Start next time for a study), `entry.study`, and `entry.chainHeld` (a follow-up date carried it past the gap). When a live visit completes a step, the record moves one stage with a `grew` stage entry and the result returns `grew {from, to}`. A stage chosen by hand earns no growth. Imported entries are marked `imported` and never grow anything. New records created past Initial Call start that stage's chain empty (`rv.garden.since`).
- Rows: the plant replaces the stage pips; name, area · stage, then one status line: "Thirsty"/"Wilting" in the accent, else a mini bar (one segment per step), "Next: Lesson 6" for studies. A calendar mark shows while a follow-up date past the gap holds the chain; the bar fades in the heads-up days before it would break.
- Record screen: big plant and stage name (tap to change stage), "Grows into <next>" bar with "N more talks/studies", growth path of the five forms (future ones grey silhouettes). The Studying block shows from the first study session at any stage.
- Today: plant tiles per stage (Doto count, short name; empty stages as silhouettes) and an "Almost growing" card (up to four RVs one step from their next form, beside that form's silhouette).
- Visit sheet: "Study session" switch (on by default in the study stage) swaps in Publication, Covered today, Start next time; optional "Follow up on" date. After saving, the growth moment plays when the plant grew (tap to skip, then the Undo toast); otherwise the record's plant bounces.
- Snooze is now "Follow up on…" in the record menu (In 3 days, 1 week, 2 weeks, 1 month, or a date); the badge reads "Follow up on <date>".
- Insights: weekly ring (due RVs seen Sunday to Saturday; a follow-up after Saturday takes one out), streak in weeks with best and freezes and 12 week dots, "Your garden" plots per area (tap for the area plot screen `#/insights/plot/<area>`), Exhibits (8, earned once and kept in `settings.exhibits`), found-home and prepared-visit rates over 90 days with best weekday, 12-week conversation dot grid; then the funnel, Worth reconsidering and Stuck in stage. Effort points and 60-day tiles removed.
- Settings: Display > Garden switch (off = v2.15 rows, circles and Insights; progression keeps running). Stages > steps to grow per stage (`stage.grow`; blank = default 1/2/3/3).
- Upgrade day: `settings.gardenSince` is set on first load; streaks and exhibits count only from then. Care and chains are read silently from the timeline.

Interpretation decisions (check these):
- Care recency uses the last conversation (imports included); a Not Home after it makes the plant Steady but does not reset the clock. Healthy needs a plan on the last conversation.
- A follow-up date shows the hold mark only when it reaches past the chain gap; inside the gap it changes nothing visible.
- Streak: a week counts when every RV due by Saturday had a conversation that week (long-wilted ones included). A perfect calendar month (4+ weeks, a week belongs to the month of its Saturday) earns a freeze; freezes add up. Past weeks use current stages and ignore old follow-up dates (not stored).
- Exhibits: return visits = live visits since the upgrade; first talks = RVs whose first live conversation came after it; Three studies = three RVs with a study session after it; Area all watered = a named area with 3+ plants, none thirsty or wilting.
- Dark blue plant colours were chosen here (the canvas has light blue and dark purple only).
- Tests: tests/garden.test.js 28, logic 46, smoke 207, screens 35, drive_folder 23, ai_cleanup 22. VERSION 2.16.0, cache rvapp-v38.
- v2.16.1: Potential and Initial Call top out at Healthy (no Lush), and the seed and sprout drawings lose their lush parts; Mark agreed flourishing starts at Cultivating. Geotag: a Geotag button under Address in the New RV and Edit RV forms (not on the record screen). It asks the phone for its position, then, when online, asks OpenStreetMap Nominatim for the street address at that point and shows a popup with the coordinates and the suggested address to edit; Save puts the address in the form and keeps the coordinates (`rv.geo {lat, lng, acc, at}`), saved with the form. Offline it skips the suggestion. The form shows the coordinates with an x to delete them. Privacy page has a Geotag section. Code: js/geo.js. Cache rvapp-v39.
- v2.16.2: Geotag with an address already in the form just saves the coordinates (no lookup, no popup). The popup and suggested address appear only when the address is empty. Cache rvapp-v40.
- v2.16.3: Map (row button and the record's address line) navigates to the geotag coordinates when a record has them, else to the saved address (`UI.navTarget`). A record with coordinates but no address still gets the Map button. Cache rvapp-v41.
- v2.16.4: Geotag with a street address already typed also fills a missing city and ZIP from the lookup, with no popup ("1415 N Wilson Way" becomes "1415 N Wilson Way, Stockton, CA 95205"); the typed street part is never changed, and an address that already has both is left alone (`RV.geo.completeAddress`). The popup's suggestion for an empty address is now the full address with city, state and ZIP. Offline: coordinates only. Caveat: OpenStreetMap gives the municipal city; in unincorporated areas with a Stockton mailing address it may give a community name or none. Cache rvapp-v42.
- v2.16.5: the New RV form shows only the Geotag button (it turns into "Geotagged" with a check); coordinates and their delete x show only in Edit. The Geotag popup no longer focuses its field, so the keyboard does not cover the suggestion. All bottom sheets now sit above the on-screen keyboard (`--kb` from visualViewport pads the overlay; sheet height capped to the visible area). Cache rvapp-v43.

## 28. v2.17.0 the garden as a place (built 2026-10-21)

Mockups: canvas row "The garden as a place" (Garden, Map, Week's-end recap). Inspiration list from Mark: Stardew Valley, Animal Crossing, Viridi, Neko Atsume, Tamagotchi, Forest, Finch, Persona 5, Fire Emblem: Three Houses, Spiritfarer, Duolingo, Apple Fitness, Habitica, Pokémon GO / main series, console achievements, Civilization, Pikmin, Townscaper, Candy Crush, Peggle, Monument Valley.
- Cadence (Mark): nobody is expected weekly. A visit every week is very good; the bar is not going past a month. The weekly ring only counts RVs whose due window runs out by Saturday.
- Insights opens on the garden scene: a sky that follows the clock (morning 6–9, day 9–17, dusk 17–20, night; sun or moon, drifting clouds or stars, hills), then one bed of soil per area with every plant standing in it (up to 7 a row, more rows as an area grows, offset like a planting), a sign per area (accent dot when someone there is thirsty or wilting; tap opens the area plot), and a path winding behind. Butterflies hover by lush plants (up to 6); a bird sits on a healthy study's tree (up to 2). Tapping a plant gives it a little bounce and a card with name, area and stage or Thirsty/Wilting, and Open. Dark mode has its own ground and sky. The plot-list card is replaced by the scene.
- Ring wording: "Due this week", "N left to water", "Only RVs coming due by Saturday count."; streak "weeks, nobody past due".
- Week's-end recap (`G.recap`, `RV.gardenRecap.maybeShow`): the first open after the Sunday-to-Saturday week ends (on start and when the app comes back), once per week (`settings.recapSeen` = that week's Sunday, so it syncs with backups). Shows the ring for that week, who grew (old form → new form, up to 4), lush plants that drew visitors, the streak, and exhibits earned that week; Close or See the garden. Never for a week before the garden started.
- Next (second release): the themed map (MapLibre with OpenFreeMap vector data and a Groundwork style; all RVs, geotag exact, others placed once from their address with a dashed ring), and exhibits as objects in the garden (fountain, bench, lantern, birdbath, arbor, sundial, gate, big tree for the mockup's eight).
- Tests: garden 31, logic 48, smoke 226, screens 36. VERSION 2.17.0, cache rvapp-v44.
- v2.17.1: in the garden scene the plants are planted straight in the soil (no pot or eyes; a soft mound under each; the thirsty bubble and lush shimmer stay; `P.make(..., {bare: true})`). The plant card sits fixed just above the tab bar, so it is on screen wherever the plant is. Cache rvapp-v45.
- v2.17.2: the garden plant card shows just the name and the stage (or Thirsty/Wilting); the area is already on the bed's sign. Cache rvapp-v46.
- v2.17.3: the garden sky reads as the right time of day in both themes. Dark mode used one dark purple sky for every daytime; now morning is pale blue with a warm sun, day a clear blue, dusk purple, night dark with stars. Light mode morning is warm cream with a golden sun, day a clearer blue. Morning and day hills are soft sage instead of lavender (dusk keeps lavender). Cache rvapp-v47.
- v2.17.4: garden scene plants are about twice the size (lg, up to 4 a row, later rows offset in front), so the five forms are easy to tell apart. Raised beds with a darker lip, grass tufts and pebbles on the ground, bigger butterflies and bird. The thirsty bubble sits just above short plants (seed, sprout, leafy) instead of floating high. The card's Thirsty/Wilting is in the accent. Cache rvapp-v48.
- v2.17.5: garden beds fit the screen width (plant spacing shrinks a little on narrow phones, 56–80 px; only small beds are nudged left/right). Tested at 390 and 360 px. Cache rvapp-v49.
- v2.17.6: the water-drop speech bubble is gone. Thirst now shows in the plant and its soil: each pot (and each plant in the garden) has a soil top that is dark and moist when cared for, pale with a crack when thirsty, and pale with several cracks when wilting; thirsty plants droop further and shrink a little, wilting ones fold over (leaves on the ground as before). In the garden scene a small watering can sits beside every thirsty or wilting plant; tapping it opens Record a visit for that person. Rows still say Thirsty/Wilting in the accent. Cache rvapp-v50.
- v2.17.7: the watering can is removed from the garden scene (Mark: clunky). Thirst shows only in the plant: pale cracked soil and the droop. Cache rvapp-v51.

## 29. v2.18.0 the garden map and exhibits in the garden (built 2026-10-21)

- Insights has a Garden / Map switch at the top (remembered on the device, `rvapp.insView`).
- Map (js/gmap.js): MapLibre GL 5.24.0 bundled in vendor/maplibre (loaded on first use, cached by the service worker), streets from OpenFreeMap's positron style (OpenStreetMap data), restyled in the app to Groundwork colours, light and dark (`RV.gmap.restyle`: cream ground, white streets, pale water and parks, purple-grey labels; shops, bus stops, house numbers and airports hidden). Every active RV's potted plant stands at its spot as a marker: the geotag if there is one, else a point looked up once from the saved address (Nominatim, one a second while the map is open, kept near the geotagged records' middle; saved on the record as `rv.approx {q, lat, lng}` and looked up again only if the address changes; not found is remembered too). Address-placed pins have a dashed ring. A chip toggles All / Thirsty only (thirsty and wilting); a locate button shows where you are. Tapping a pin gives a card with Open and Directions. Offline: "The map needs a connection." Attribution shows in the corner.
- Exhibits: the grey-circle card is replaced by the earned exhibits standing together at the foot of the garden scene as objects: First study a lantern, 25 return visits a bench, Area all watered a fountain, Three studies a birdbath, 50 return visits a rose arbor, 6-month streak a sundial, 10 first talks a gate, One-year streak a big fruit tree. A row "N of 8 · Exhibits in the garden" opens a sheet of all eight (earned with the date, the rest greyed).
- Privacy page: Garden map section (map tiles from OpenFreeMap; street addresses without names sent once to Nominatim).
- Tests: garden 33 (restyle, placement), smoke 233 (map with a faked style and lookups, pins, card, filter, remembered view; exhibits), screens 42. VERSION 2.18.0, cache rvapp-v52.
- Next: the four care levels (Lush, Healthy, Thirsty, Wilting; Steady folds into Healthy) with the new postures, and plant variety per person (canvas boards "Care as posture" and "Variety").

## 30. v2.19.0 care as posture, a plant for each person, the map first (built 2026-10-21)

Mockups: canvas boards "Care as posture" and "Variety".
- Four care levels shown (Mark: five were too close to tell apart): Lush, Healthy, Thirsty, Wilting. Steady folds into Healthy (`G.care` never returns 3; a Not Home or a visit with no plan is Healthy). The time rules are unchanged.
- Plants are drawn from geometry in js/plant.js (`plantSvg`), no transparency: the stem is the spine, leaves are arms (each pivots where it joins the stem), the top is the head.
  - Lush: taller, arms up, leaves about a third longer and half again as wide, more of them, big open flower, full crown and fruit, small twinkling sparkles; bounces gently.
  - Healthy: upright, arms out level, modest foliage; easy sway.
  - Thirsty: slouched forward, head bowed, arms hanging, leaves narrow and curled (fold line), losing lower leaves, dry cracked soil, a leaf or two on the ground; barely moves.
  - Wilting: collapsed over the pot, one or two shrivelled leaves with dry brown tips, more fallen leaves; just breathes.
  - The fruit tree keeps its stance; its crown and fruit thin instead. Seed and sprout top out at Healthy.
- Variety: each person gets their own plant from their record ID (`P.variant`): leaf shape (round, pointed, paddle, long), arrangement (pairs or alternating), stem curve, flower (five petals, daisy, bell), crown (round, tall oval, wide umbrella), fruit (berries, pears) and shade (the accent or a neighbouring hue either side), in purple or blue, light or dark. Stage silhouette and posture stay readable.
- Map: Insights opens on the Map (the Garden scene is one tap away; the choice is remembered). The base map is restyled more strongly (cream ground, sage parks, blue water, white streets, purple-grey labels; buildings, shops, bus stops and house numbers hidden), and each area is drawn under the streets as a lavender plot with a dashed edge around its RVs, with the area's name on a pill (tap for the area plot).
- Tests: garden 33, smoke 235, screens 42. VERSION 2.19.0, cache rvapp-v53.
- v2.19.1: fix: tapping the Studying block on a record opened one field labelled with the publication (or 'Next time'), so a publication typed there was saved as Start next time. It now opens 'Studying' with two fields, Publication (with suggestions) and Start next time; it focuses Publication while none is set. Records already affected need the publication re-entered and Start next time corrected. Cache rvapp-v54.
- v2.19.2: the Studying block's two lines are separate taps: the publication line opens the Studying sheet with the cursor in Publication, the Next line with the cursor in Start next time. Cache rvapp-v55.
- v2.19.3: map: the area overlay (lavender patches and name pills) is removed; the branded base map stays. New / Edit contact offer three stages: Potential, RV and the study stage (RV keeps whichever of Initial Call, Cultivating or Return Visit the person is in; a new contact starts at Initial Call; the garden moves them along). Move to stage in the menu still lists every stage. The bottom tab RVs is now Contacts. Cache rvapp-v56.

## 31. v2.19.4 three stages on screen, map in Contacts, Today folded into Home (built 2026-10-21)

- Stages people see (Mark): Potential (no real conversation yet), RV (once there is one), and the study stage. Initial Call, Cultivating and Return Visit stay as the garden's backbone (growth steps, due windows, Settings > Lead stages) and show only as the plant's form. `L.shownStages / shownStage / shownName` ('rv' = the middle band). Used for rows, the record screen, Today tiles (three), list filter wheel and chips (older saved filters map across), funnel (three rows), Move to stage and Restore (Potential, RV, study, Archive), the visit sheet's stage, toasts. Growth inside RV is named by the new form: the bar reads "Grows into a leafy plant", "Becomes an RV" from Potential, "Grows into Bible Study" at the end; the growth moment chip and timeline say "Grew into Leafy plant" (or "RV" / "Bible Study") via `G.growthName`.
- Map moved from Insights to Contacts: the Tiles / Folders switch is now Tiles / Folders / Map (remembered; the map is kept while showing, pins refresh on edits). Insights is just the garden.
- Tabs: Home, Contacts, Insights. Home keeps the campaign banner and topics at the top, then who to see today (Today / All, the three stage tiles, Almost growing), then Up next (the three longest since a visit) at the foot; Up next left the Contacts tiles. The due count sits on the Home tab. #/today opens Home; #/today/<stage> lists remain (back goes to Home).
- Tests: smoke 245, screens 42, garden 33, logic 48. VERSION 2.19.4, cache rvapp-v57.
- v2.19.5: the map's toggle is All / Today (who to see today, the same people as Home's Today) instead of Thirsty only. Cache rvapp-v58.
- v2.19.6: every RV (Initial Call, Cultivating, Return Visit, even brand new) has a Log study button under Record NH / Record a visit, opening the visit sheet with Study session on. Potential has no Log study and no Study session switch (no conversation yet). Cache rvapp-v59.
- v2.19.7: the Last visit block on a record is tappable and opens that visit's edit sheet (as does Edit in the timeline). A visit can be switched to a study session there (Publication, Covered, Start next time) or back; the newest study session updates the record's Studying block, and if the change completes a growth step the plant grows with the usual moment (`ST.growNow`). Not offered for Potential. Cache rvapp-v60.

## 32. v2.20.0 Drive stays connected, the map opens on you (built 2026-10-22)

- Why Drive kept asking: the browser-only Google sign-in gives one hour of access and no way to renew it, so a save after the hour needed Reconnect.
- Sign-in helper (worker/token-helper.js): a Cloudflare Worker that holds the app's Google client secret and does two things: swaps a sign-in code for access plus a renewal key (`/exchange`), and swaps the renewal key for a fresh hour (`/refresh`). Answers only https://mygroundwork.app, checks the code returns to the app's own address, returns only the tokens, stores and logs nothing. Set its URL in `RV.config.tokenHelper` (js/config.js).
- With the helper set: Connect uses Google's code flow (`access_type=offline`, `prompt=consent`); the code comes back as `?code=` and is cleared from the address; the renewal key is kept on the device only (`rvapp.drive`, not in backups). Before each Drive call the app renews if the hour is up (one renewal shared by parallel calls), and retries once after a 401. If Google refuses the key (password change, access removed) the key is forgotten and Reconnect shows; one reconnect makes it last again. Disconnect revokes the renewal key. Existing connections reconnect once to switch over.
- Without the helper: Reconnect first tries Google with `prompt=none` (no screens if Google still knows you); if Google says it needs to ask, the app goes straight to the normal sign-in.
- Map: a fresh start (open, reload) zooms in on where you are (zoom 15, the You dot) and falls back to all pins if location is off or slow; back from a contact, the map returns to the view you left (kept for the session). Locate still recentres.
- Privacy page: the sign-in helper paragraph.
- Tests: drive_folder 36 (silent reconnect, helper sign-in, renewal, refused key), worker 6 (node tests/worker.test.mjs), smoke 253 (view kept after a contact, opens on you), screens 42. VERSION 2.20.0, cache rvapp-v61.

## 33. v2.21.0 going counts, reviving is a moment, a tidier garden (built 2026-10-22)

From the gamification review (claude/gamification-review.md), items 1, 2 and the garden layout.
- Weekly ring and streak: a Not Home in the week counts as seen, like a conversation (one try per person per week; `G.weekCheck`). Due dates still run from the last conversation, so someone not home stays due the next week. The streak is computed under the new rule for past weeks too (Mark: fine, single user).
- Care: a Not Home holds a Thirsty plant from sliding to Wilting for 14 days (`G.NH_HOLD`), if it was made while the plant was still only Thirsty. A Not Home never revives; only a conversation does.
- Revive moment: a live visit that lifts a Thirsty or Wilting plant to Healthy or better plays the growth-style moment with the same form (drooping plant to upright, chip "Revived"; `P.revive`). The visit is flagged `entry.revived`. Growth takes priority when both happen. The week's-end recap shows a Revived count.
- Garden scene: each bed is ordered by height (fruit tree, shrub, leafy, sprout, seed; then thirstiest first), so tall plants stand in the back rows; three plants a row on phones (four on wider screens), spacing 64–96 px, rows 52 px deep (was 40).
- Tests: garden 35, logic 48, smoke 256, screens 42, drive_folder 36, ai_cleanup 22, worker 6. VERSION 2.21.0, cache rvapp-v62.

## 34. v2.22.0 your round, and a nudge to leave a plan (built 2026-10-22)

From the gamification review, items 3 and 5.
- Round recap: the latest run of live logs (Not Homes, visits, new contacts; each within 90 minutes of the one before) with at least 3 logs is shown once, the next time the app is opened or returned to at least 30 minutes after the last log and within 18 hours (`G.round`, `RV.gardenRecap.round`; `settings.roundSeen` = the round's last log time, so it syncs). Card: "This morning · 9:10–11:40", Your round, doors tried (people with a Not Home or visit), talks, plans left; who you talked with as plants (tap to open); Revived, Grew and New contacts when there are any. The week's-end recap takes priority; the round waits for the next open. Garden off: no recap.
- Plan nudge: under Discuss next time in the visit sheet, "A plan each visit grows it lush" while empty (leafy plant and up), and "Plan set · N of 3 toward lush" in the accent once filled, with a small pop (`G.lushRun` counts the planned conversations in a row, within the gap). Seeds and sprouts just say "Plan set". Not shown for study sessions.
- Tests: garden 37, smoke 263, screens 42, logic 48, drive_folder 36, ai_cleanup 22, worker 6. VERSION 2.22.0, cache rvapp-v63.

## 35. v2.23.0 flowers, twenty exhibits, rare visitors, no care words (built 2026-10-22)

From the gamification review, items 4 and 6, plus Mark's request to drop care labels.
- No care words: "Thirsty" and "Wilting" are gone from rows (Home's Up next included), the record screen, the garden plant card and the map card; care shows only in the plant. Rows show the growth bar instead. Screen-reader labels still name the care level; the recap's "brought back from thirsty" stays.
- Shrub flowers (garden-plan section 11): at the shrub (internal Return Visit stage), each completed chain of 3 conversations sets one flower, up to 5 (`G.flowers`, `G.FLOWER_RUN`, `G.FLOWER_MAX`). Same chain rules as growth (within the RV gap, one per day, follow-up holds, a break empties the run). Counted only from when the plant became a shrub and from `settings.flowersSince` (set on first load of v2.23): no retroactive flowers (Mark). Live talks only. Drawn as small five-petal flowers along the stem; closed buds while Thirsty or Wilting; never fall off. Fruit buds per study session stay.
- Exhibits: 20 in families, earned once and kept (v2.16 ids kept): First plan left (arbor), First round (watering can), streak family (sundial: first full week, 4, 12, 26, 52 weeks), revivals (birdbath: 1, 5, 25), return visits (bench: 10, 25, 50, 100), first talks (gate: 10, 25), studies (lantern: 1, 3, 5), Area all watered (fountain). The garden shows one object per family at its highest tier: tier 2 adds a pot of flowers, tier 3 a second pot, tier 4 a sparkle, tier 5 a ring of blooms. The Exhibits sheet lists all twenty. The old big-tree art is retired.
- Rare visitors (decorative, by chance on each visit to the garden): a hummingbird by a flowering shrub doing well (35%), a rabbit at a bed where nobody is thirsty (30%), a fox on the hill at dusk after a week with the ring closed (50%). Bunting over the path while a campaign is running. Test hooks: `window.__RV_SURPRISE` (1 always, 0 never), `window.__RV_GARDEN_OPT`.
- Tests: garden 38, smoke 266, screens 44, logic 48, drive_folder 36, ai_cleanup 22, worker 6. VERSION 2.23.0, cache rvapp-v64.

## 36. v2.24.0 My garden, visitors that stay and are remembered (built 2026-10-22)

- The third tab is "My garden" with a sprout icon (Insights with the chart icon when the garden is off); the screen title too.
- Plant card fix: the name card in the garden closes on a tap anywhere else in the garden, when the page scrolls more than a little, or with its new close button (it used to close only by tapping the same plant again).
- Rare visitors are rolled once a day (`G.visitors`, a hash of the date), so a visitor stays all day and re-opening the garden cannot re-roll it. Same conditions as v2.23 (hummingbird by a flowering shrub doing well 35%, rabbit at a named bed with nobody thirsty 30%, fox at dusk after a closed ring 50%).
- The first time a visitor is seen that day it arrives (hummingbird darts in, rabbit hops in, fox trots on); `settings.visitors[k] = {first, seen}` records it (syncs). A dot on the My garden tab shows while a visitor came today and has not been seen yet (`G.newVisitors`).
- Tap a visitor: a card reads "Rare visitor", its name (and the area for the rabbit), and why it came, e.g. "Rabbits come to a bed where nobody is thirsty." Visitors are buttons for screen readers ("Rare visitor: Fox").
- Exhibits sheet: a Visitors section with each visitor's first-seen date and why it comes; unseen ones are grey silhouettes with "Not seen yet". No counts or points.
- Tests: garden 39, smoke 266, screens 48, logic 48, drive_folder 36, ai_cleanup 22, worker 6. VERSION 2.24.0, cache rvapp-v65.
- v2.24.1: record screen leads with the person's name, large and bold beside the plant (`.gperson`), with the stage under it in smaller grey text (still tap to change stage). The top bar's copy of the name stays hidden until the big name scrolls up under the bar (`screen.titleWatch`, checked on scroll). Screens 49. Cache rvapp-v66.
- v2.24.2: rare visitors rebalanced so they reward recent effort, not a perfect garden (Mark: the old conditions were too hard while catching up). Hummingbird: by any plant from leafy up that is Healthy or Lush, 15% a day. Rabbit: at an area where you talked with or knocked on someone in the last 3 days and most plants there are not thirsty, 15%. Fox: from 5 pm to midnight after a week (Sunday to Saturday) you went out on two or more days, 25%. The first time a visitor's condition is met it always comes (no `settings.visitors[k].first` yet), so everyone meets each one early. Card "why" lines updated. Garden 39. Cache rvapp-v67.

## 37. v2.25.0 the section under the garden: the game first, stats folded (built 2026-10-22)

Compared with Apple Fitness, Duolingo, Animal Crossing (Nook Miles+), Pokémon GO, Stardew Valley and Neko Atsume: each pairs the world with what is happening now, a few small goals for today, the nearest goals ahead, and a collection; analytics sit elsewhere, and how it works is one tap away.
- Order under the scene: "How your garden works" button, This week (ring and streak, unchanged), Today's tending, Next milestones, Milestones and Visitors tiles, then Field stats folded shut (found home, prepared visits, the 12-week dot grid, funnel, Worth reconsidering, Stuck in stage).
- How your garden works (sheet): everyone you visit is a plant; the five forms; the four care levels; plans make it lush; thirsty when due, a talk revives, a knock holds off wilting; nothing dies; the weekly streak; milestones; rare visitors.
- Today's tending (`G.tending`): three goals from the garden as it stood this morning. Water 2 thirsty plants (a talk or a knock on plants that were thirsty or wilting; 1 if only one; else Talk with 2 people); Leave a plan on a visit; Grow <first name>: one more talk/study (a plant one step from its next form; tap opens them; else Knock on 3 doors). Imports never count. When all three are done a light rain falls over the beds once that day (`settings.tendDone`). No points.
- Next milestones (`G.milestoneCounts`, `G.nextMilestones`, `G.MILESTONE_NEED`): the lowest open tier of each family, closest first, three shown, with "7 of 10" and a bar.
- Exhibits are now called Milestones everywhere (sheet, tiles, recap "New milestone"); ids unchanged. Visitors have their own page (first seen, days visited, why they come; unmet ones as silhouettes); `settings.visitors[k].days` counts visit days.
- Tests: garden 41, smoke 269, screens 49, logic 48, drive_folder 36, ai_cleanup 22, worker 6. VERSION 2.25.0, cache rvapp-v68.

## 38. v2.26.0 nine visitors, rare coats, a Visitors page with portraits (built 2026-10-22)

Design canvas "Garden visitors" (cast board, Visitors page board, shared art). Mark's direction: adult, not toddler; flat geometric wildlife-print style (Charley Harper), rich mid-century colour, little copy, personality through facial expression.
- Art (js/critters.js, generated from the canvas): `RV.critters.make(kind, {size, sil, still})`; SVG 120×120 per kind, coloured by CSS variables (rare coats swap them), idle motion in css/app.css (`.cr`): rabbit grooms, hummingbird hovers, fox looks round, bluebird preens, squirrel nibbles, frog's throat pulses, owl turns its head, deer grazes, ladybug wanders. Expressions: hummingbird driven, rabbit nervous, fox sly, bluebird content, squirrel frazzled, frog unbothered, owl skeptical, deer gentle, ladybug shy. Bees and geese are drawn but not used yet (seasonal, later).
- Visitors (`G.VISITORS` = [key, name, why, how to find, mood, scene]): hummingbird 15% (plant leafy+ Healthy/Lush), rabbit 15% (area visited or knocked in the last 3 days, most plants fine), fox 25% (evening after 2+ days out last week), bluebird (a round yesterday: 3+ logs within 90-minute gaps), squirrel (a plant grew today), frog (all three of today's tending goals), owl 50% (8 pm to 6 am with someone in the study stage), deer 50% (6 to 9 am after 3+ days out last week), ladybug 25% (March to August, on a lush plant). The first time each condition is met it always comes.
- Rare coats (`G.COATS`): white rabbit, golden hummingbird, silver fox, 1 sighting in 20 once the usual animal has been found; recorded under the coat key (`G.visitorKey`).
- Garden: each placed at its own spot (hummingbird by a plant, squirrel by the plant that grew, ladybug on a lush plant, rabbit at its bed, bluebird on the first bed's lip, frog at its foot, fox, deer and owl on the hill); arrives by flying, hopping, trotting or crawling the first time each day. Tap: a card with its mood (or "Rare coat"), name, why it came, and See.
- Visitors page (`#/insights/visitors`): nine visitors and three rare coats; found ones in colour with "Seen on N days", the rest as outlines with "Not found yet". Portrait (`#/insights/visitors/<kind>`): the animal large and moving on a dark scene for its time of day, name, mood, first seen, and Why it came / How to find it.
- Tests: garden 42, smoke 269, screens 50, logic 48, drive_folder 36, ai_cleanup 22, worker 6. VERSION 2.26.0, cache rvapp-v69.
- v2.26.1: less copy (Mark). Visitors page: unfound cards are just the outline (no "Not found yet" label; screen readers still hear it), no rare-coat explainer line; a portrait of an unfound visitor has no sub-line, only How to find it; a rare coat's reason is "About 1 rabbit sighting in 20." Ring card: dropped "Only RVs coming due by Saturday count." and the week-dots legend. Cache rvapp-v70.

## 39. v2.27.0 visitors that find you, and an empty garden that explains itself (built 2026-10-22)

Diagnosis (Mark missed the fox): the garden marked a visitor seen the moment the screen drew, even if it was scrolled off screen (the app restores the last scroll position); the save that followed redrew the garden 1.6 s in and cut the arrival short; the hill visitors are small; time-of-day visitors (fox, deer, owl) were only drawn inside their hours.
- Arrivals are kept (`settings.visitorsHere[k] = {kind, day, until, ref, seen, told, played}`; `G.settleVisitors`): a visitor stays the rest of the day it came and all of the next, and while unseen up to 3 days. Outside its own hours the fox, deer and owl rest (eyes closed, still; `G.resting`).
- Seen only when actually seen (`G.markVisitorSeen`): shown in the announcement, or on screen in the garden. In the garden a new visitor waits hidden until it scrolls into view (IntersectionObserver), then arrives; the sighting is saved after the animation, so the redraw cannot cut it.
- Announcement (`RV.gardenRecap.visitor`, after the week and round recaps): the first open or return after a visitor arrives shows a full-screen moment: the animal comes in on its own scene, "A visitor" (or "A rare visitor"), name, mood; Later, or See it in your garden. Once per visitor.
- See it in your garden (`#/insights/focus/<k>`, kept through redraws until done): scrolls to it, it arrives, a ring pulses around it, then its card opens.
- The My garden tab dot shows while a staying visitor is unseen (`G.unseenHere`).
- Empty garden (no contacts yet): the sky and ground with one empty bed of faint seed outlines, three bubbles ("Everyone you add grows here as a plant." "Talk with them and it grows. Leave a plan and it thrives." "Animals visit when you have been out in service."), an Add your first contact button, and How your garden works. Nothing else until the first contact.
- Tests now start with `window.__RV_SURPRISE = 0` (init script) so no surprise visitor interrupts them. Garden 43, smoke 274, screens 50, logic 48, drive_folder 36, ai_cleanup 22, worker 6. VERSION 2.27.0, cache rvapp-v71.

## 40. v2.28.0 conversations, a simpler menu, import choices, address editing, three new visitors (built 2026-10-23)

- Wording: "conversation", not "talk", wherever the app means time spent with someone: the growth bar ("2 more conversations"), Today's tending ("Have 2 conversations", "Grow Dee: one more conversation"), milestones ("10 first conversations"), the round recap ("conversations", "Conversations with"), How your garden works and the empty garden. "Talking points" (Topics) and the Note cleanup prompt are unchanged. "Conversation" is not in Labels (plain language; Labels is for terms people call different things).
- Home welcome card: Add your first RV, then "Or bring in what you have": From Ministry Assistant, From a spreadsheet, Restore a Groundwork backup (from a file, or Google Drive when connected). `RV.importers`.
- Menu (drawer titled Menu): Ministry (Topics, Campaigns), App (Display, Backup and import, Note cleanup, Security), Customize; "Groundwork <version>" at the foot opens About. The settings index (#/settings) uses the same groups. Customize (#/settings/customize) is a full page of rows showing current values: Lead stages, Archive reasons, Lists and custom fields, Labels, Needs attention. Home screen cards moved into Display under a Home screen heading (#/settings/home still works). "Data and backup" renamed "Backup and import".
- Record screen: tapping the address opens an Address sheet (address and area, Save, Undo in the toast); no address: "Add address". Directions only from the arrow button beside it.
- Visitors (now 12; checked against existing rules for duplicates and clashes): garter snake, Patient (a conversation today with someone after 3+ Not Homes in a row; on a stone at the left end of their bed; always that day), snail, Unhurried (someone first talked with 6+ months ago, still Healthy or Lush; low on their plant; 15%), robin, Cheerful (a contact added today, not imported; on the path by the first bed; always that day). Robin is tied to adding someone, not a first conversation, since a first conversation grows the plant and already brings the squirrel. Turtle dropped (overlapped lush and growth). California quail (Sociable, conversations in 3+ areas last week) drawn but held for later with bees and geese. Art from the Garden visitors canvas: chin-on-coil snake with one eye open, snail with a sprout on its shell, robin with an unimpressed worm.
- Tests: garden 44, smoke 278, screens 50, logic 48, drive_folder 36, ai_cleanup 22, worker 6. VERSION 2.28.0, cache rvapp-v72.
- v2.28.1: the sign-in helper is live. `RV.config.tokenHelper` = https://groundwork-auth.swingtreecactus.workers.dev (Cloudflare Worker groundwork-auth on Mark's account; GOOGLE_CLIENT_ID and ALLOWED_ORIGIN as Text, GOOGLE_CLIENT_SECRET as a Secret). Drive sign-in now uses the code flow and keeps a renewal key on the device; each user reconnects once (Menu › Backup and import › Reconnect). The no-helper Drive tests set `window.__RV_TOKEN_HELPER = ''`. Cache rvapp-v73.

## 41. v2.29.0 Getting started, visitor sets, seasons (built 2026-10-26)

Guiding rule (Mark): calm, never casino-like. No confetti, sounds, countdowns, red badges or "don't miss out"; slow quiet motion, one moment at a time; nothing earned is ever lost.
- Getting started (`G.starterSteps`, `G.starterOn`, `settings.starter = {state: on|off|done, garden}`): five steps, ticked from what has actually happened: Add your first contact (with the three import choices under it), Record a visit, Record a Not Home, See your garden, Connect Drive backup. One current step with a short line and Show me; Skip getting started. It replaces the Home welcome card and, in My garden, Today's tending. Set once on load: anyone with records already gets `off` (test hook `window.__RV_STARTER`). Gentle tips (`SC.coach`, `settings.tips`): inline, one at a time, gone for good with Got it: on the contact ("This is Nia's plant. After a conversation, tap Record a visit..."), for Not Home, and in My garden. Finishing all five: the arrival moment "Getting started · Your garden is ready · A bluebird came to see it.", the bluebird stays in the garden and is recorded as found.
- Visitor sets (`G.SETS`, `G.setsComplete`, `settings.setsDone`): Times of day (deer, fox, owl) → owl box; Garden birds (hummingbird, bluebird, robin) → bird feeder; Ground dwellers (rabbit, squirrel, snake) → log pile; Small things (ladybug, snail, frog) → small pond; Seasonal (geese, bees, quail) → beehive; all fifteen → "Wildlife garden" sign and a Field guide complete stamp on the Visitors page. Rare coats never count. Objects stand with the milestones and fade in the first time; the weekly recap says "Set complete". The Visitors page is grouped by set with "2 of 3" or what it left in the garden.
- Seasons (`G.seasonOf`, northern hemisphere by date): spring Mar–May (fresher ground, blossoms in the grass), summer Jun–Aug, autumn Sep–Nov (warm ground, fallen leaves, 7 leaves drifting down slowly), winter Dec–Feb (frosted ground and soil, pale grass, 16 slow snowflakes). Falling layer off with reduced motion. Nature only: no holiday decorations.
- Seasonal visitors now live: geese, Grumpy (autumn, weekly streak 4+, 25%, over the hill), bees, Focused (spring/summer, 2+ planned visits in one area this week, 50%, above that area's bed), California quail, Sociable (spring/summer, conversations in 3+ areas last week, 25%, crossing the path). 15 visitors.
- Tests: garden 45, smoke 285, screens 50, logic 48, drive_folder 36, ai_cleanup 22, worker 6. VERSION 2.29.0, cache rvapp-v74.

## 42. v2.30.0 note cleanup for everyone (built 2026-10-28)

Mark bought API credit and wants everyone using Groundwork to share it, so no one needs their own key.
- New Worker `worker/ai-proxy.js` (`groundwork-ai`): holds `ANTHROPIC_API_KEY` as a secret and forwards only Messages requests from the app's origin. Only the Fast (Haiku) and Careful (Sonnet) models, output capped at 4000 tokens, request size capped, extra fields dropped, only text returned, Anthropic error details hidden. No note text stored or logged.
- Fair use: an anonymous random install ID (localStorage, not in backups) and daily counts in Cloudflare KV, 60 units per install and 600 for everyone a day by default (Fast = 1, Careful = 4). Failed calls don't count. A Console spend limit is the hard stop, since the origin check stops other websites, not scripts.
- App: `RV.config.aiProxy`; Note cleanup is on for everyone. Your own key still works and wins when set, tucked under "Use your own API key". Calm messages at the limit ("That's all the cleanups for today. More tomorrow."). The privacy page explains the helper and the anonymous count.
- Tests: ai-proxy 8, ai_cleanup 32, smoke 285, screens 50, garden 45, logic 48, drive_folder 36, worker 6. VERSION 2.30.0, cache rvapp-v75.

## 43. v2.30.1 note cleanup proofreads instead of editing (built 2026-10-28)

Mark found cleanup removed details he had added. Cause: the instructions asked Claude to remove filler and false starts (read loosely, especially by Haiku) and to move next-time items out of the note.
- New instructions: a light proofread. Fix spelling, punctuation, capitalization, misheard words and scripture format; remove only filler sounds and accidental repeated words; never delete, shorten, merge, summarize, reorder or reword anything else.
- Next-time items are copied to Discuss next time and stay in the note (Mark likes the copy).
- Safety net in the app (`RV.ai.cutTooMuch`): if the cleaned note has more than max(3, 15%) fewer words than the original minus filler and repeats, the original is kept and the toast says "Cleanup changed too much, so your note was kept as is."
- Tests: ai_cleanup 35. VERSION 2.30.1, cache rvapp-v76.

## 44. v2.31.0 import from a notes app (built 2026-10-28)

For people whose return-visit notes live in their phone's notes app (Samsung Notes, Google Keep, Apple Notes). Mark had no samples, so the mapping rules come from how such notes are usually written; tune them once real notes come in.
- Screen `#/settings/notes` (Backup and import › Import from a notes app; also "From a notes app" in Home's and Getting started's import choices). Choose many files at once (.txt, .md, Keep Takeout .json/.html, zips of those; unzipped in the browser, Keep's .json preferred over its .html, trashed notes and archive_browser.html skipped), paste notes (Apple Notes), or share to Groundwork on Android (manifest `share_target` POST to ./share-target; sw.js keeps shared text and files in cache `rvapp-share`, which activate no longer deletes, and redirects to the import; the app also jumps there on launch while shares wait). Plain text only (Mark: Word/PDF never needed).
- Reading (`js/notes.js` `RV.notesImport` + `RV.ai.readNotes`): notes go in batches of about 6,000 characters (long notes cut at blank lines), each with an id, title and date, plus today's date. A reply that doesn't parse is retried with the batch split in half, down to one note. A daily-limit or connection error stops; what was read can still be imported and the rest stays queued.
- Mapping rules (`RV.ai.IMPORT_SYSTEM`): one contact per person or household; split a many-person note; merge the same person within a batch; skip non-ministry content but never drop anything about a person. name (household "Maria and José"; unnamed → a short description, never empty), address (vague places go to notes), phone, visits (dated entries → visit; dated NH → nh; yearless dates → the most recent such date on or before the note's date), notes (everything else), discussNext (copied, not moved), nextVisit (only an explicit date), study (only if a study is held), source. Own words kept; only spelling, capitalization, punctuation and scripture format fixed.
- Review: a card per person with a tick, editable name and address, a meta line (visits, Bible study, phone, which note), a snippet, Show all (notes, Discuss next time, visits). Possible duplicates (same address or phone, or the same full name) are flagged "Looks like X, already in Groundwork" and unticked. Sticky Start over / Import N. Import makes contacts (chosen stage; a Bible study goes to Bible Study), Discuss next time, next visit, and dated visit and NH entries; lands on Contacts. Work is kept for the session if you leave the screen.
- Privacy page: a paragraph on the import.
- Tests: notes 7 (node), notes_import 22 (browser, fake Claude, real service worker for the share target), smoke 285. VERSION 2.31.0, cache rvapp-v77.

## 45. v2.32.0 notes import: paste first, screenshots, edit before import, fill from a note (built 2026-10-28)

Mark's phone test: Groundwork didn't show in Keep's share menu (Android only lists web apps installed from Chrome, after they pick up the new manifest, which can take a day), and note files are hard to find (a web app can't choose where the file picker opens; Keep notes aren't files at all). So paste and screenshots lead.
- Import screen: helper "Add as many notes as you like, then turn them all into contacts at once." **Paste a note** (reads the clipboard; if the browser won't, a paste box with Add note / Done pasting) then **Upload screenshots** (many at once); "Text files or a Google Keep export" is a small link. How-to section removed. Wording: "Make contacts from N notes", "Finding people in your notes… 2 of 3", "left for later" (never "read").
- Screenshots (`RV.notesImport.prepShots`, `shrinkImage`): shrunk to 1500 px long side, JPEG 0.85, in memory only. Grouped when taken within 10 minutes (`groupShots`, shown as "2 screenshots, date, times" with a thumbnail); sent in order, up to 4 per request (`shotBatches`) as image blocks after a JSON header with ids and times; the prompt says to ignore phone chrome and that consecutive screenshots may continue a note. The Worker's body cap is now 3,000,000 characters (Mark must paste the new worker/ai-proxy.js; the old one answers too_long).
- Review: compact cards (tick, name, address, summary line, duplicate line), each with a quick neighborhood picker and **Edit details**, which opens the New RV form in draft mode (`F.rvForm(null, {draft, onDone})`: every field, plus the note's visits; Done saves nothing, the card gets an "Edited" mark). Select all / Select none; "Set neighborhood for ticked…". No neighborhood suggestions from Claude (Mark's call). Import lands on `#/rvs/imported` ("Just imported", ids in sessionStorage `rvapp.lastImport`).
- Quick add: **Fill from a note** box (Paste / Screenshots, first 4). One person fills the form (more fields opened, a "From the note, added when you add" box); on Add the note's dated visits and NHs go on the timeline, and with nothing typed for today no made-up visit is added. Several people: "This note has N people" › See all opens the import review with them (`RV.notesReview.show`), no second request.
- Icons: clipboard, image. Gotcha again: `append(null)` prints "null"; children are filtered.
- Tests: notes_import 39 (paste and blocked clipboard, screenshots, edit details, neighborhoods, select all/none, quick-add fill, several people from a screenshot, share target), ai-proxy 8, smoke 285. VERSION 2.32.0, cache rvapp-v78.

## 46. v2.33.0 Backup and import, reorganized (built 2026-10-28)

Nine flat rows became a status card and three rows, following Todoist (Backups: status and one action), Day One (one Import/Export door) and 1Password (one Import, then pick the source).
- Backup card first: a green or amber dot, what's backed up and when ("Backed up to Google Drive · <time> · daily copies kept for a week"; "Changes waiting", "Backup paused · Reconnect", "Not backed up yet · Everything lives only on this phone"), then Back up now / Reconnect or Back up to Google Drive, and Restore…. Disconnect is a quiet link. Without Drive: Download backup and Restore….
- Restore… (`restoreMenu`): Latest Google Drive backup, An earlier daily copy (then the 7 days), or A backup file; each then asks Merge or Replace. Without Drive it goes straight to the file.
- Under the card: "N RVs and N visits on this phone." Then Import contacts (`#/settings/import`: "Where are your contacts now?" Ministry Assistant, A notes app, A spreadsheet; "Moving to a new phone? Use Restore instead."), Export (sheet: Contacts CSV, Visit log CSV, Backup file), and Erase all data set apart at the bottom (not red; still confirms). No group labels (Mark).
- Notes import's back arrow goes to Import contacts. Home's import choices unchanged.
- Tests: smoke 287, drive_folder 37, notes_import 39. VERSION 2.33.0, cache rvapp-v79.

## 47. v2.34.0 plant kinds revealed at leafy, and a calmer palette (built 2026-10-28)

Spec: claude/garden-plan.md section 12. Mockups: design canvas "Groundwork plant kinds".
- Ten kinds (js/kinds.js, `RV.kinds`): apple, lemon, olive, fig, pomegranate, date palm, grapevine, sunflower, and two rare: prickly pear and cherry. Each has a leafy, shrub and fruiting tree form in the four care levels, drawn from geometry in a natural palette with no transparency (same 60×92 viewBox; lush, healthy, thirsty yellowing, wilting brown-grey). Shrub flowers (per chain of three) and study fruit buds draw in each kind's own colours.
- Seed and sprout look alike for everyone (today's drawings with their small per-person variants, now green, with a brown seed). Plants at leafy or above with no kind yet keep today's drawings, in green, until revealed.
- Reveal: the first live conversation or study session that finds a plant at leafy or above with no kind draws one (`G.drawPlantKind`, `G.needsReveal`) and stores it on the record (`rv.kind`). Eight common kinds come from a shuffle bag (`settings.kindBag`, each once before any repeat, synced with backups); prickly pear and cherry come up 4% each. Not Homes, imports and manual stage changes never reveal. A sprout that grows to leafy reveals in the same moment. Undo takes the kind back and restores the bag. Test hook `window.__RV_KIND`.
- The reveal moment reuses the growth moment: the old plant turns into its kind, then "It’s an olive tree!" (`RV.kinds.line`) with the person's name under it (`P.reveal`). Shown once; later growth stays wordless as before.
- After the reveal the kind alone sets the look (no per-person variants). The record's growth path, rows, Today tiles, the garden scene and map pins all draw the kind (`st.pkind` from `G.stateOf`).
- Imports stop below the reveal: anyone imported into Cultivating or Return Visit lands on Initial Call (RV), studies stay studies, and an imported kind is dropped (`ST.importRvs`). The Ministry Assistant, spreadsheet and notes import pickers offer the three stages people see (`F.importStageOptions`).
- Colour in three layers: a warm neutral interface (paper #F2F0EA, cards white, fill #F5F3EE, lines #E7E4DC, muted #6B6862; dark #12110F / #1C1B19 / #262522), the natural palette for the garden, and the accent kept to about a tenth (active tab, due marks, growth bars, selections, links). Pots are a warm neutral with an accent rim (`--pl-pot`, `--pl-rim`). Area tiles are white cards with the due line in the accent; folder headings are ink with a neutral open background. Browser bar colour follows the paper.
- Tests: garden 48 (shuffle bag, rares, reveal rule, every kind draws), kinds 14 (new: tests/kinds.py, the reveal moment and its words, undo, once only, Not Home, sprout to leafy, imports, rows, dark), smoke 287 (the spreadsheet import now lands a Return Visit status on RV), screens 50, logic 48, drive_folder 37, ai_cleanup 35, notes_import 39, notes 7, worker 6, ai-proxy 8. VERSION 2.34.0, cache rvapp-v80.
- v2.34.1: less purple in the garden world (Mark: still overwhelmingly purple). Garden scene skies and hills are natural (sage hills; dusk peach with a coral sun; night deep blue with green-grey hills; dark mode ground, soil, path and hills warm grey-green instead of purple-grey). Milestone and visitor-set objects are stone, wood and clay (no accent); flower pots in the families clay; blooms pink; butterflies yellow and orange; hummingbird throat magenta; campaign bunting red and green; lush sparkle gold; address-placed map pins get a grey dashed ring. The map's labels, road edges and borders move from purple-grey to warm grey (light and dark). The accent stays on the UI marks (tab dot, due marks, growth bars, the week ring, bed-sign dots, the growth-moment ring) and the pot rims. Cache rvapp-v81.

## 48. v2.35.0 one palette, no brand colour (built 2026-10-28)

Mark: purple as an accent still didn't look good; make the palette the most beautiful version of itself, without a brand colour. Taken from the cozy plant games (Kinder World, Viridi, Stardew Valley, Dorfromantik): warm, muted, earthy, one accent used sparingly.
- Interface: warm paper #F2EEE5, cards #FFFDF9, fill #F6F2EA, lines #E6E0D4, ink #1F1D1A (also the main action), muted #6E6A62. Dark: #141310, #1E1C18, #282521, ink #F2EEE5, muted #A39E94.
- One accent, clay #B4583A (dark #E39271), soft #F5E6DC (dark #3A261D), taken from the pots: due marks, growth bars, the week ring, the active tab dot, selections, links. Warnings keep the muted amber.
- Pots are terracotta (#C77F5A with a #B0653F rim; dark #9A6044 / #844E36), dark soil, dark brown eyes. The garden's natural palette is unchanged.
- The Purple / Blue choice is removed from Display (`settings.accent` is ignored; the CSS no longer depends on `data-accent`).
- Not changed: the installed app icon is still purple (#5B3E96); see the brand guide.
- Tests: smoke 287 (the accent check now looks for the single clay accent; Display has one fewer control), screens 50, kinds 14, garden 48, logic 48, drive_folder 37, ai_cleanup 35, notes_import 39. VERSION 2.35.0, cache rvapp-v82.

## 49. v2.36.0 a more beautiful garden (built 2026-10-28)

Mark: the app looked drab; the mockup "A more beautiful garden" (canvas "Groundwork plant kinds") approved.
- The garden screen draws edge to edge with its sky under a see-through title bar (`screen.immersive`, `body.immersive`, `data-gsky` for light title text at night); the bar fills in with paper once scrolled past the sky.
- Landscape (`skySvg`): sky gradient, sun with two soft rings (low and gold at dusk, a moon with craters at night, stars), clouds, two layers of far hills, a tree line of round trees and poplars, near hills, and a picket fence with a gate. All colours are CSS variables per time of day (morning, day, dusk as golden hour, night) and season (spring fresher grass, autumn golden grass and turning trees, winter frosted).
- Ground: a mown meadow in two greens, grass tufts and small wildflowers (`gwf`), autumn leaves and spring blossoms as before; a stepping-stone path winding down from the gate (`stonePath`, stones placed in %).
- Beds: wooden raised beds of dark speckled soil with a rim, a plank front and a shadow on the grass; signs are painted wooden plaques (due dot in clay). Plants are drawn larger (`xl`, about 1.3×), rows 58 px deep; each plant's tap area is its middle, so plants behind or beside never cover each other.
- Night: plants and visitors dim (brightness filter, no transparency); fireflies over the grass (a few at dusk); the lantern milestone is lit from dusk.
- The scene follows the time of day and season, not the app's dark mode (the old dark-mode ground and soil overrides are removed).
- Tests: screens 50, smoke 287, kinds 14, garden 48, logic 48, notes_import 39. VERSION 2.36.0, cache rvapp-v83.
- v2.36.1: plants stood out too little against the grass (Mark). The meadow is lighter and softer (day #C2D395 / #B9CB8B, morning #C6D598, golden hour #D2CC8E, spring and autumn to match, lighter tufts and bed shadows), so the deeper plant greens read against it; at night the meadow is darker (#26382F) and the plants a little brighter than before. Cache rvapp-v84.
- v2.36.2: study notes (Mark). A study session's note gets the same tools as a visit note: full-size box ("What did you talk about?"), the full-screen writing view and Clean up (proofread only: a study has Start next time, so nothing is copied to Discuss next time; `cleanupButton` takes the second field as a function read at tap time). The record screen shows the newest note at the top for everyone, labelled "Last study" when it came from a study session (it used to be hidden in the study stage); tapping it edits that entry. Tests: ai_cleanup 36. Cache rvapp-v85.

## 50. v2.37.0 study track, held moments, cleanup meaning check (built 2026-10-29)

Study track (garden-plan section 13, Mark):
- Any RV plant (sprout, leafy or shrub) with a study session logged is on the study track (`G.progress`: kind 'study', `track: true`). The bar reads "Grows into Bible Study · N more studies"; three study sessions in all, ever (no chain, no time limit; live entries only, imports never count), grow it straight into the tree in one growth moment, skipping forms in between, with the kind reveal if it has none yet.
- Studies logged before v2.37 count: plants that already have three grow at their next live visit or study, with the moment playing then.
- The visit sheet opens in Study session mode for anyone who has had a study session.

Moments (Mark: too fast, gone before you know what happened):
- Growth and reveal moments run about 2.5 s (was 1.6), the words show at 2.5 s, and the moment stays until tapped anywhere, with a quiet "Tap to continue" after about 3 s. The Undo toast shows after the tap. Revive stays short (1.6 s) and closes itself (`quick`). Reduced motion: no animation, the words and hint at once.

Note cleanup meaning check (Mark's Jonathan note: "it came" for "I came", "when he died" for "when we die", a dropped "back"):
- The instructions add a meaning check: reread each sentence for sense and fix dictation swaps (I/it, we/he/she, a/the, there/their, to/too, know/no, our/hour, here/hear) and dropped small words when context makes the intended word clear; garbled topic questions are fixed; a worked example (Mark's note) is included. Follow-ups ("follow up on") go to Discuss next time.
- Anything it can't resolve stays as said and comes back in `unsure`; up to four such phrases (only ones really in the cleaned note) show under the note as "Worth a look" chips, and a tap selects those words. The list goes when the note is edited or the cleanup is undone.
- Not tested against the live model from here (no network to the proxy); Fast stays the default.
- Tests: garden 49, kinds 19, ai_cleanup 40, smoke 287 (taps through held moments), screens 50, logic 48, notes_import 39, drive_folder 37, notes 7. VERSION 2.37.0, cache rvapp-v86.
- v2.37.1: a Dark mode switch at the top of the menu (Mark). On sets the theme to Dark, off to Light; System stays available in Display. The screen redraws so the plants pick up the new colours. Tests: smoke 289. Cache rvapp-v87.

## 51. v2.38.0 Contacts on the map, the game in the garden, the evolution reveal (built 2026-10-29)

Release 1 of the layout update Mark agreed on 2026-10-29 (mockups: canvas "Groundwork plant kinds", "The game in the garden, and Contacts" and "An evolution-style reveal").

Contacts:
- Titled "Contacts". It opens on the Map; Areas (the old Folders) is the only other view, and the choice is remembered (`rvapp.rvsView`). Tiles is gone. Without the garden or the map, Areas is all there is (no switch).
- An area shows "N people · last visit …" and up to three of its thirsty plants instead of "N due" ("N due" comes back only with the garden off).
- Rows have a map-pin icon (directions) beside NH, in one row, instead of a Map button.

The game in the garden (the cards under it are gone):
- At the gate: bunting on the fence is the streak (a pennant per good week in the last twelve, pale blue for a freeze, an outlined pennant for this week still to earn); a watering can is this week (its water drops as the plants due this week are watered); a chalk slate is today's tending (a tick per goal done); a "?" signpost is How your garden works.
- In the square with the milestones: a field guide (opens Milestones and Visitors) and the next milestone as a faint dashed sketch (opens Coming next).
- No numbers show in the scene; each object opens a sheet with them. Field stats stays folded at the foot.
- Plants stand in front of the gate objects; the empty space above the beds lets taps through. The bunting takes taps only on its pennants.
- Richer drawing: two-tone stepping stones, flowering shrubs at the meadow's edges, milestone objects in real materials (wooden bench, stone birdbath and fountain, iron lantern, slate-blue can).
- Fix: the scene was held 24 px short of the right edge (max-width); it is now edge to edge. A plant's card no longer closes when the page scrolls to reach the plant (the scroll counts from where the card opened).

Evolution reveal (`RV.plant.evolve`): for the kind reveal and for growing into a study tree only; other growth keeps the v2.37 moment and revive stays short.
- The screen dims, "Something's happening…" (0.7 s), the plant turns to a white silhouette and light gathers with drifting sparks, it flickers between the old and new silhouettes, each swap about 20% quicker (1.15–3.35 s), a soft white bloom (3.35 s), then the new plant in colour with its line ("It's an olive tree!", or the growth name for the tree) and the person's name (3.75 s). Held until tapped, "Tap to continue" a second later. Reduced motion shows the end at once.

Tests: screens 53, kinds 23, smoke 294, ai_cleanup 40, notes_import 39, drive_folder 37, garden 49, logic 48, notes 7, worker 6, ai-proxy 8. Browser tests stub the map tiles and address lookups (Contacts now opens on the map). VERSION 2.38.0, cache rvapp-v88.

## 52. v2.39.0 Today, Prepare, two record buttons, the likely-home estimate (built 2026-10-29)

Release 2 of the layout update (agreed with Mark 2026-10-29).

Today (Home):
- Titled "Today" with the date. One list, "Who to see", of everyone in the Today scope (best day today, likely home today, or no best day; not snoozed, not seen today), grouped by area. Areas with the most thirsty plants come first; in each, people likely home lead (with "Likely home now" / "Likely home this afternoon", or "Neighbours often home …"), then the thirstiest, then whoever has gone longest. Six per area, then "N more in <area>" to the area screen.
- Gone: the stage tiles and their pages (#/today links open Today), Today / All, Almost growing, Up next, the Likely home right now card, and the count on the Home tab.
- Under the list: the campaign card (the running or next campaign with a Plan link; "Plan a campaign" when nothing is scheduled, which opens the new-campaign form) and the topics card (+ and Manage). Getting started still shows while it is on.

Menu: "Prepare" (Topics, Campaigns) leads the menu, then the Dark mode switch, App and Customize. Settings uses the same name.

Record screen: two buttons, Not Home and Record a visit. A study is a visit with Study session on (the switch is there for anyone past Potential, and on by default for anyone who has studied); the Log study button is gone. The Details card shows "Likely home: Saturday afternoons" once there is enough history.

The word "due" is dropped from the garden: "To water this week", "every thirsty plant watered", "still thirsty", "Nobody went thirsty", and the guide lines. Plain rows (garden off) keep their words.

Display: it was already in the menu once (App); nothing to move.

Likely-home estimate (`L.homeOdds`, `L.likelyHomeNow`, `L.bestHomeSlot`):
- Sightings: each visit (home) and Not home (away), weighted by recency (half weight after 180 days). A contact added by hand adds its creation as one half-weight "found home" sighting; an imported contact does not (its creation time is the import). Imported visits have a date but no real time, so they count for the weekday only.
- For a weekday and part of day (morning, afternoon, evening): the same slot counts fully, the same weekday 0.5, the same part of a similar day (weekday / weekend) 0.3. The rate is blended with a prior of 0.5 (weight 1.5); for an imported contact the prior is its neighbourhood's rate for that slot when the neighbourhood has enough history.
- Likely home today: the best remaining part of today scores 0.6 or more, with at least 0.3 of evidence from that weekday (similar days alone never make someone likely), or from the neighbourhood for an imported contact.
- Note cleanup also returns `availability` when a note says when someone is home ("works weekdays, come Saturday evenings"): days, part of day and the exact phrase (kept only if the phrase is in the cleaned note). Under the note: "Likely home · Sun, Sat · evenings" with Set as best days (adds the days to best days; the phrase becomes the best-time note if there is none). In New contact it sets the best-day picker.

Tests: logic 53, screens 55, smoke 294, ai_cleanup 44, kinds 23, notes_import 39, drive_folder 37, garden 49, notes 7, worker 6, ai-proxy 8. VERSION 2.39.0, cache rvapp-v89.
- v2.39.1: the running campaign (or one starting within three weeks) and the topics card are back at the top of Today, above Who to see (Mark: they had dropped below the list). Plan a campaign, shown when nothing is scheduled, stays under the list. Cache rvapp-v90.

## 53. v2.40.0 Today for getting ready: the conversation topic library (built 2026-10-29)

Mark: the v2.39 Today list was overwhelming and repeated what the garden and Contacts show; Today should prepare you for the day, including door to door. Reviewed in the Docs artifact "Sample conversations library (draft)".

The library (js/library.js, `RV.library`):
- The workbook's sample conversations, January 2018 to November 2023 (147 entries; the series ended with the 2023 workbooks), merged to 60 and then to 54 by dropping near-duplicates that share a scripture. 11 themes: The Bible, God, Prayer, Jesus, God's purpose, The future, God's Kingdom, Suffering, Death and hope, Family, Happiness.
- Each topic: our own title and opening question (written fresh, not paraphrased), the scripture reference, a next-time topic in our words, the workbook's demonstration video (jw.org finder `pub-mwbv_YYYYMM_<track>_VIDEO`, from the weekly schedules; campaign months checked one by one) and the original workbook page on wol.jw.org. No jw.org text is copied and nothing is read from the site at run time (jw.org terms: no reproducing content in an app, no scraping; links are allowed).
- Seeded as ordinary topics (lib items, kind 'topic') with fixed ids `lib-<id>` and `builtin`, all switched off; backups merge by id, so no duplicates; a deleted one stays deleted; erasing data seeds them again. Edits are stored on the item; Reset to original restores from RV.library.

Topics page (Prepare › Topics):
- A search box, then the themes as folders (like Areas): name, "N of M on", a switch for the whole theme, ⋯ for the theme (rename, move up or down, delete; its topics move to the next theme). Open folders are remembered on the device. Topics with no theme sit in Other.
- Each topic: title, question, scriptures; its switch puts it on Today (and in Record a visit's topic chips). Tap to edit: Topic, Question, Scriptures, Next time, Notes, Video or article link, Theme, Show on Today; Reset to original for library topics. Add topic, Add theme.
- Search is forgiving (js/topics.js): typos (edit distance 1, or 2 for long words), partial words and loose verse references ("ps37", "psalms 37", "37 29", "1 jn 5 19"); title matches rank higher; with three or more words one may miss.
- Scriptures index at the foot: every verse used in the topics, Genesis to Revelation, each with the topics that use it.
- Verses are links (`https://www.jw.org/finder?wtlocale=E&pub=nwtsty&bible=BBCCCVVV[-BBCCCVVV]`) that open JW Library when installed, else jw.org.

Today (Home):
- The campaign (when one is running or starts within three weeks), then Conversations: the switched-on topics by theme; a theme with several topics is a folder (fold state remembered), a single topic stands alone. Each card: title, question, scripture chips, Video, Next time; tap for the full topic with Watch the video, Workbook page and Edit. With nothing switched on: a short note and Choose topics.
- If you see them: up to three people likely home now with what you planned to bring (Discuss next time) or their next lesson.
- One line, "N people to see today", to Contacts. Plan a campaign at the foot when nothing is scheduled. The v2.39 Who to see list is gone.

Tests: smoke 309, screens 55, topics 5 (new), kinds 23, ai_cleanup 44, notes_import 39, drive_folder 37, garden 49, logic 53, notes 7, worker 6, ai-proxy 8. VERSION 2.40.0, cache rvapp-v91.
- v2.40.1: web addresses in a topic's question, next time or notes show as short tappable links ("jw.org/…", opening in a new tab or JW Library) on Today's cards, in the topic view and in the Topics list; a tap on the link opens it, a tap elsewhere opens the topic. The edit sheet keeps the plain text to edit. Tests: smoke 311. Cache rvapp-v92.

## 54. v2.41.0 Today as a carousel, topic series, campaign topics, Contacts list, garden green and a warm dark mode (built 2026-10-30)

Mark approved the Today carousel mockup, the series view, campaign topics, the × on cards and the design pass ("garden green buttons", "keep Discuss next time"), then the warm dark palette, and said "Let's roll it out."

Library (js/library.js):
- All 60 topics again: the 6 dropped in v2.40 for sharing a scripture are back (seeded for existing users, switched off).
- 27 series (`RV.library.SERIES`: id, name, first ran YYYY-MM, topic ids in order), from the workbooks' runs of two to three conversations; `seriesOf(id)` gives series, part and of. "Memorial invitation" and "Living forever" are in no series.
- "Next time" is now "Linking question" everywhere on topics (field `next` unchanged).

Today:
- A slim campaign banner (clay left edge) when one is running or starts within three weeks; it opens the campaign, which lists its topics. Plan a campaign stays at the foot when nothing is scheduled.
- Conversations: one horizontal carousel of big cards (native momentum, `scroll-snap-type: x mandatory`), the next card peeking. Each card: a meadow band with the theme (or "Campaign" on a clay band) and "Part n of m", a sprout, an ×; the title, the question large, verse buttons (the first solid green) and Video; the linking question at the foot, which goes to the next part of the series when there is one. A counter "n/m" beside the heading and dots under the carousel; the card in view is remembered for the session.
- Order: the running campaign's topics first (even if switched off), then the switched-on topics kept together by series, in series order.
- × removes a topic from Today (switches it off) with Undo; on a campaign topic it hides it until the campaign ends (`settings.campHidden[campaignId]`).
- View all: a sheet listing the topics in play, By theme or By series (with the part), with the forgiving search; a tap closes it and goes to that card.
- If you see them: small cards in a row you can swipe. Then "N people to see today".
- Today always shows Conversations; the Home screen section in Display is gone (Recently added went with it).

Topics page: By theme / By series toggle (remembered on the device). Series folders show "N of M on · first ran Mon YYYY" and a switch for the whole series; rows show "Part n". Adding topics and the theme ⋯ stay in By theme.

Campaigns: the campaign form has "Topics for this campaign": the chosen topics with checkboxes, suggestions found from the campaign's name and topic, and "Choose more topics" (a searchable picker). Stored as `campaign.topics` (lib ids). The running campaign's row on the Campaigns page has a clay edge.

Forms:
- New contact (title was "New RV") and Record a visit show topic chips in Today's order, campaign topics outlined in clay. Picking one adds "Topic: X" to the note (once), fills Discuss next time with its linking question if that is empty, and stores the topic on the visit (`entry.topic`) and the record (`rv.lastTopic`).
- A blank note in New contact is filled with the campaign only ("Campaign: X"); topics are no longer added automatically.
- The record shows "Topic last used: X" with "Next: <next part>". An empty Discuss next time is one line with "+ Add".

Contacts: a third view, List: everyone A to Z under letter headings, a jump strip of letters on the right, rows with the plant, name and address · area. Map · Areas · List; the choice is remembered. "Neighborhood" is "Area" everywhere (default label and export header; a saved default label migrates, a custom one is kept).

Design: main buttons, switches, checkboxes and dates garden green (#3F6B48); progress text ("3 more conversations") green; Clean up meadow with green text; the round + stays ink. Timeline dots small: green for visits, grey for Not home. Dark mode is warm rather than black: paper #151412, surface #211F1C, surface2 #2B2925, ink #ECE7DD, muted #9E998F, line #33302B, button green #4E8A56, green text #9CCB95, meadow band #25332A, clay #E39271, campaign band #3A2820; the + is a light circle with a dark +.

Tests: smoke 325, screens 59, topics 6, kinds 23, ai_cleanup 44, notes_import 39, drive_folder 37, garden 49, logic 53, notes 7, worker 6, ai-proxy 8. VERSION 2.41.0, cache rvapp-v93.
- v2.41.1: View all opens without focusing its search, so no keyboard comes up until you tap the search. "Plan a campaign" is now "Schedule a campaign" (campaigns come from the organization; you schedule them, you don't plan them). Tests: smoke 326, screens 60. Cache rvapp-v94.

## 55. v2.42.0 New app icon: the happy pot (built 2026-10-30)

Mark asked for a new logo. After several rounds (recorded in docs/BRAND.md section 3) he chose the happy pot: a terracotta pot with a first sprout and a content face (closed smiling eyes, a gentle closed smile, a little blush) on garden green #3F6B48. It replaces the purple house-bubble everywhere: icon.svg, the PNGs (192, 512, 180 apple-touch), the maskable versions (mark scaled to the safe circle) and the favicons (pot and sprout without the face). No code changes. iPhone keeps the old icon until the app is removed from the home screen and added again; Android picks it up from the manifest.

Tests unchanged and passing (smoke 326, screens 60). VERSION 2.42.0, cache rvapp-v95.

## 56. v2.43.0 Titles and big numbers in Space Grotesk; the dot-matrix font is retired (built 2026-10-30)

Reviewed with a before/after mockup (Today, Contacts, the garden's This week card). The Doto dot-matrix face belonged to the earlier black-white-red look; beside the warm palette and the happy-pot icon it read faint and cold, and it was hard to read at a glance (the garden title nearly vanished against the night sky). Now `--font-dot` points at Space Grotesk, and titles and big numbers are Space Grotesk bold, tightened slightly (title 1.8rem, -0.02em; numbers -0.03em). The Doto font file is removed from fonts/ and from the service worker's precache; LICENSE-OFL.txt now credits Space Grotesk and Space Mono. Brand guide section 5 updated.

Tests unchanged and passing (smoke 326, screens 60). VERSION 2.43.0, cache rvapp-v96.

## 57. v2.44.0 Clean up everywhere a visit or the person is written about (built 2026-10-30)

Mark: Clean up wasn't everywhere he expected; it should be on every field that records a visit or details about the person (not on short fields), visible in every view.

Before, it was only under the note in New contact and in Record a visit / Log a study. Now also:
- Edit contact (and Edit details on an imported draft): under Household notes and under Discuss next time.
- Editing a timeline entry (visit, note, Not home): under its notes.
- Discuss next time opened from the record: under the text.
A shared `RV.forms.cleanupRow(text, next)` puts the button in a `.note-tools` row under the field; `UI.textPrompt({ cleanup: true })` adds it to a prompt. Where there is no separate Discuss next time field it proofreads the text only (next-time items are copied, never moved, so nothing is lost). Short fields (name, address, phone, publication, lesson, tags) have none. It shows whenever cleanup is available, which is always with the shared helper.

Tests: ai_cleanup 48 (new: Edit contact has two, household notes clean in place, entry edit, Discuss next time on the record); others unchanged. VERSION 2.44.0, cache rvapp-v97.

## 58. v2.45.0 Import from Witness Work (built 2026-10-30)

Mark asked for a restore option from a Witness Work backup (witness-work-backup.json, the app his records were in before). It is another app's file, so it goes through Import rather than Restore (which reads Groundwork backups), and Restore › A backup file recognises such a file and opens the import instead of refusing it.
- Where: Import contacts › Witness Work ("Its backup file, with conversations"), and From Witness Work in Home's and Getting started's import choices (`RV.importers.witnessWork`).
- Converter (js/ww.js, `RV.ww.convert`, pure): `contactStore.contacts` become contacts. Address from line1, line2, city, state, zip (state names shortened to CA etc., country dropped; a city typed in the state box, as in one real record, is used as the city). Coordinates become the geotag (`rv.geo`, no accuracy). Phone kept; email and custom fields go to household notes (email isn't a Groundwork field). How we met: House to house.
- `conversationStore.conversations` (minus `deletedConversations`) become timeline entries, marked imported: `notAtHome` → Not home (its note kept), otherwise a visit; `isBibleStudy` → a study session (`entry.study`). A follow-up topic is added to that entry as "Next time: …", and the newest one becomes Discuss next time.
- Stage: anyone with a Bible study conversation goes to the study stage; anyone with no conversation where they were home goes to Potential; the rest to the stage chosen in the sheet (default RV). Imports still stop below the reveal (`ST.importRvs`), and imported studies never count toward the study track.
- Sheet (same shape as Ministry Assistant): stage, a note on where studies and Potential go, Skip people who match an existing address, Set best day from their last visit, and "Also bring in N deleted, as archived" (off; `contactStore.deletedContacts`). The summary counts contacts and conversations. Import lands on Just imported.
- Not brought in: service time reports (not planned for Groundwork), day plans, preferences, badges, mileage.
- The duplicate check shared by both backup imports is now `dedupe()` in js/settings.js.
- Tests: ww 7 (new, node), smoke 336 (Witness Work import; Import contacts now offers four sources, Getting started five import choices). Others unchanged. VERSION 2.45.0, cache rvapp-v98.
