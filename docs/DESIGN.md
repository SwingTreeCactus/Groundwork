# Groundwork: Design Doc (current part, sections 51 on)

> Split into three parts on 2026-11-06 so each fits the project upload. Part 1: docs/DESIGN-1.md (project claude/design-doc-1.md), sections 1–27: the original spec and v2.0–v2.16. Part 2: docs/DESIGN-2.md (claude/design-doc-2.md), sections 28–50: v2.17–v2.37. This file holds v2.38 on; add new releases here. Start a part 4 when this one passes about 90 KB.

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

Mark asked for a restore option so people coming from Witness Work, another field-service app, can move over to Groundwork. The mapping was worked out from one sample backup (witness-work-backup.json) someone gave Mark as a reference; it is not Mark's own data, and none of it is in the repo (the tests use made-up records). It is another app's file, so it goes through Import rather than Restore (which reads Groundwork backups), and Restore › A backup file recognises such a file and opens the import instead of refusing it.
- Where: Import contacts › Witness Work ("Its backup file, with conversations"), and From Witness Work in Home's and Getting started's import choices (`RV.importers.witnessWork`).
- Converter (js/ww.js, `RV.ww.convert`, pure): `contactStore.contacts` become contacts. Address from line1, line2, city, state, zip (state names shortened to CA etc., country dropped; a city typed in the state box, as in the sample, is used as the city). Coordinates become the geotag (`rv.geo`, no accuracy). Phone kept; email and custom fields go to household notes (email isn't a Groundwork field). How we met: House to house.
- `conversationStore.conversations` (minus `deletedConversations`) become timeline entries, marked imported: `notAtHome` → Not home (its note kept), otherwise a visit; `isBibleStudy` → a study session (`entry.study`). A follow-up topic is added to that entry as "Next time: …", and the newest one becomes Discuss next time.
- Stage: anyone with a Bible study conversation goes to the study stage; anyone with no conversation where they were home goes to Potential; the rest to the stage chosen in the sheet (default RV). Imports still stop below the reveal (`ST.importRvs`), and imported studies never count toward the study track.
- Sheet (same shape as Ministry Assistant): stage, a note on where studies and Potential go, Skip people who match an existing address, Set best day from their last visit, and "Also bring in N deleted, as archived" (off; `contactStore.deletedContacts`). The summary counts contacts and conversations. Import lands on Just imported.
- Not brought in: service time reports (not planned for Groundwork), day plans, preferences, badges, mileage.
- The duplicate check shared by both backup imports is now `dedupe()` in js/settings.js.
- Tests: ww 7 (new, node), smoke 336 (Witness Work import; Import contacts now offers four sources, Getting started five import choices). Others unchanged. VERSION 2.45.0, cache rvapp-v98.

## 58. v2.46.0 Growth path fixed, silhouettes that fill in, Archive as a stage choice, Ideas for next time (built 2026-10-31)

From Mark's screenshot and the audit (claude/app-audit.md):
- **Growth path fixed.** The garden's stepping-stone layer (v2.36) had reused the class `.gpath`, so on the record the growth path was pinned to the top of the card under the title bar. The stones are now `.gstones`; the path sits in the flow under the progress bar.
- **Silhouettes.** Forms still ahead are solid single-colour silhouettes (CSS filter on the real drawing, so no transparency; the generic shape until the kind is revealed). The current form sits on a meadow highlight.
- **Fill-in moment.** After a growth or reveal moment, back on the record: the highlight starts on the old form, then moves to the new one with a quiet six-dot burst, a small pop, and the silhouette wiping away from the soil up to show the colour (about a second; skipped with reduced motion). `RV.screens.playFill(rvId, from, to)`, called from `afterVisit`.
- **Archive as a stage choice.** The Stage list in Edit ends with "Archive…"; saving with it asks for the reason (the same archive flow). The stage under the person's name now shows a chevron, since tapping it opens the stage picker (Archive included).
- **Ideas for next time.** When a record has nothing under Discuss next time, the row shows Ideas beside + Add. Only when tapped, the household notes, the five latest visit notes, the stage and the last topic (with its next part), never the name, address or phone, go with the topic library (id, title, question, next part) to Claude Haiku 5.5 (`RV.ai.suggestTopics`, max 600 tokens, about $0.0004 a call). Three picks come back with a few words on why; unknown ids are dropped. They are kept on the record (`rv.ideas = {after: latest visit id, picks}`) until the next visit, so reopening costs nothing. Tapping one fills Discuss next time with "Title: question" (Undo). Nothing changes in Record a visit or New contact, so recording stays fast. Privacy page updated.

Tests: smoke 342, ai_cleanup 54 (Ideas: nothing sent until tapped, name not sent, fast model, unknown ids dropped, kept after reopening, fills Discuss next time), others unchanged. VERSION 2.46.0, cache rvapp-v99.
- v2.46.1: the growth path draws each stage the same for everyone (healthy, no kind, no per-person variant, still); the big plant above it still shows this person's health and kind (Mark). Tests: smoke 343. Cache rvapp-v100.

## 59. v2.47.0 Hand over a contact (built 2026-10-31)

Agreed 2026-10-30 (file, no accounts) and 2026-10-31 (Mark: the file version; the sender's copy archives as Handed over).
- **Send.** A person's ⋯ menu has "Hand over…". The sheet asks for your name (remembered on the device, `rvapp.handoffFrom`) and an optional note, and lets you untick household notes, visit notes, Discuss next time and phone (name, address and area always go). Share file opens the phone's share sheet with `Groundwork handoff - <Name>.json`; once shared the contact is archived here with the new reason Handed over (Undo). Without a share sheet (most computers) the file downloads and the app asks before archiving.
- **File** (`js/handoff.js`, `RV.handoff`): `{app: "groundwork-handoff", version: 1, sentAt, from, message, contact: {name, address, area, phone, notes, discussNext, bestDays, bestNote, publication, progress, nextStart, geo, stage: first|rv|study}, visits: [{type, at, text, study fields}]}`. Nothing private to the sender goes (record ids, plant kind, last topic, ideas, tags). Not encrypted; the sheet and the privacy page say to send it only to the person it is for.
- **Receive.** Backup and import › Import contacts › From another publisher (and Restore recognises a handoff file too). "Handed to you" shows the name, address and area, how many visits, who sent it and their note, warns if the address or phone is already here, and offers the stage (mapped from first/RV/study onto the receiver's stages). Add contact imports it like any import: visits marked imported (no growth, plant stops before the reveal unless a study), a first line in household notes "Handed over by Mark on 2026-10-31: <note>.", then opens the record.
- **Archive reason** Handed over (restorable) is added for everyone, before Other.

Tests: handoff 4 (new unit suite), smoke 352 (send with choices, download fallback, archive as Handed over, receive with note and duplicate warning, imported visits, Import page source), others unchanged. VERSION 2.47.0, cache rvapp-v101.

## 60. v2.48.0 The 2025 tracts lead; handing over by link (built 2026-10-31)

**2025 tracts** (Mark: prioritize them; use only each tract's main scripture and the Enjoy Life Forever! lesson that cites it, from the full book, not the introductory brochure; for two tracts no lesson cites the main scripture, so a lesson from another scripture in the tract, marked as such; the older topics just go underneath).
- `RV.library.TRACTS` (9) and the theme "2025 tracts" (first; added for everyone). Each: a short name, the tract's own title as the question (it names the tract to hand over; no tract text is copied), its main scripture only, and `lff: {lesson, from}`:
  Can we enjoy life forever? Ps 37:29 → 25 · How can you have a happy family? Eph 5:33 → 49 · Who is the true God? Jer 10:10 → 4 (from Ps 83:18) · Is anyone listening to our prayers? Ps 65:2 → 9 · Does Jesus' advice work today? Mt 7:12 → 37 (from Mt 6:34) · How will God's Kingdom solve our problems? Ps 37:10, 11 → 33 · Is living without pain or sadness possible? Re 21:4 → 26 · Will you ever see your loved ones who have died? Joh 5:28, 29 → 30 · Do all religions please God? Mt 7:14 → 13. Researched in the WOL Research Guide and publication index (2026-10-31).
- Seeded switched on (the only topics that start on), for new and existing users; they lead Today's carousel (after any campaign topics), the topic chips, View all (By series: their own group first) and the Topics page (By theme and By series). Cards are banded "Tract" and show the scripture button and, in place of the video, "Enjoy Life, lesson N" (plus "from <scripture> in the tract" when it comes from another scripture). Ideas for next time is told to prefer tracts when one fits. Reset to original restores the lesson too.

**Hand over by link** (agreed 2026-10-31 for this update after a received .json opened as "unsupported" and offered JW Library: a home-screen web app can't register to open files).
- Send link is now the main button. The contact rides in the link after the `#` (deflate-raw, base64url: `#/handoff/z…`), which browsers never send to a server; no relay. It shares a short message with it ("Mark is handing Ana Ruiz over to you in Groundwork. Tap the link to add them: … No Groundwork yet? The link opens it in your browser, where you can add it to your home screen."). Without a share sheet the message is copied and the app asks before archiving. Very long handoffs (over 12,000 characters) go as a file. "Send as a file instead" keeps the v2.47 file, now with a message that says where to import it.
- Opening the link opens Handed to you (the address bar goes back to Home). On an iPhone browser (Safari keeps a separate copy from the home-screen app) it explains in three steps, with Copy link and "Add it here".
- Import contacts › From another publisher: paste the link or the whole message (or, if empty, Add reads the clipboard), or Choose a file.
- Android: anything shared to Groundwork now lands on `#/shared`; a handoff (file or link text) opens Handed to you, anything else goes to the notes import as before.
- Privacy page updated.

Tests: handoff 8 (link round trip, junk), topics 7 (tracts), smoke 360 (tract cards, Send link message and link, opening it, iPhone page, paste in Import, Android share pickup, file fallback), screens 60 (a new user starts with the nine tracts). VERSION 2.48.0, cache rvapp-v102.
- v2.48.1: the Topics page tells categories from topics (Mark: hard to tell apart). A category header is a meadow band with its name larger and green and a chevron that turns when it opens; its topics sit indented on a thin green line, with a lighter name and a smaller switch, so the header's switch reads as the one for the whole group. Same in By theme and By series, light and dark. CSS only. Tests unchanged (smoke 360, screens 60). Cache rvapp-v103.
- v2.48.2: a tract's scripture buttons open the tract itself on jw.org instead of the verse (Mark), on Today's cards and in the topic view. Each tract has its page (`url`, https://www.jw.org/en/library/tracts/<future|family|god|prayer|jesus|gods-kingdom|suffering|death|religion>/, from jw.org's Tracts and Invitations page, 2026-11-01); tracts saved before this are matched by their library id, so nothing is reseeded. The button still shows the scripture. The Scriptures index on the Topics page still opens verses. Tests: topics 7 (every tract has its own page), smoke 361. Cache rvapp-v104.
- v2.48.3: the tract links open in JW Library (Mark: v2.48.2 opened the browser inside Groundwork). The tract's jw.org page address isn't one JW Library claims; the finder address is, as with the verse and video links. Each tract now links `https://www.jw.org/finder?wtlocale=E&docid=<docid>`, by the docid on its jw.org page: future 1102024301, family 1102024303, god 1102024305, prayer 1102024307, jesus 1102024309, gods-kingdom 1102024311, suffering 1102024313, death 1102024315, religion 1102024317 (symbols T-ftr … T-rlg). Eight were read from their pages on 2026-11-01; family's page couldn't be reached from here and its docid follows the run (check it on the phone). Without JW Library the finder opens the tract on jw.org. Tests: topics 7, smoke 361. Cache rvapp-v105.

## 61. v2.49.0 Quick stage on New contact, no keyboard until a field is tapped (built 2026-11-01)

Mark: New contact doesn't need Clean up under the note but should give quick access to the stage (only two choices, so no pick list); and sheets shouldn't pop the keyboard on open, since it shrinks the screen.
- **Quick stage.** New contact shows Stage as two buttons, Potential and RV (a segmented control, `.qstage`), under the topic chips, with RV chosen. It drives the Stage list in More details (which still offers the study stage) and follows it back; Fill from a note marking a study leaves neither button pressed. Potential still sends the note to household notes, as before.
- **No Clean up under What did you discuss?** on New contact. Household notes keeps its Clean up under More details; Record a visit, Edit contact and the other v2.44 places are unchanged. The "Likely home" suggestion from cleanup is no longer offered on New contact (it still is in Record a visit).
- **Keyboard.** Sheets no longer focus a text field when they open (`UI.sheet`): the keyboard comes up only when a field is tapped. A non-typing control marked `data-autofocus` (a confirm dialog's button) still takes focus. The exception is `data-autofocus="tap"`, used by the Studying sheet, which is opened by tapping the very line to edit (v2.19.2), so its cursor still lands there. Fields focused after a tap (Paste a note, Worth a look, a required name left empty on save) are unchanged.
- Tests: smoke 365 (no field focused on open, quick stage both ways, no Clean up under the note), ai_cleanup 55 (New contact's cleanup checks replaced by the absence check and Household notes). Others unchanged. VERSION 2.49.0, cache rvapp-v106.

## 62. v2.50.0 Area shapes: draw areas on the map (built 2026-11-01)

Design: docs/AREA-SHAPES.md (project claude/area-shapes.md); mockup: design canvas "Groundwork area shapes". Mark: "Build it" (no choice between tap and crosshair, so both ship behind a switch, Tap first).
- **Edit areas** button on the Contacts map (beside Locate) opens a full-screen editor (js/areaedit.js, `RV.areaEdit.open`) at the map's current view. Shapes show only there; the Contacts map is unchanged. Done closes it; leaving the route closes it too.
- **List:** each shape tinted in its own colour (six muted colours by order) with its name on a pill; contact pins as small dots; a panel listing every area with its count, "no shape" for the rest. Tapping a shape (on the map or in the list) opens it; tapping an area with no shape starts drawing for it. "Sort N contacts into areas" shows when anyone's pin sits in another area's shape. New area.
- **Drawing:** Tap (tap the map for each corner, tap the first corner to close) or Crosshair (a fixed crosshair in the middle; move the map, Add corner, Close shape; a green ring and "Snaps to a corner of Lakeview" when it will snap; a dashed line to the next corner). Corners snap onto a neighbouring shape's corner (22 px) or edge (16 px), in screen pixels. Once closed, and when changing a saved shape: drag a corner to move it, drag the dot in the middle of a side to add a corner, tap a corner to remove it (three at least). Undo steps back through every change; Start over; Cancel.
- **No overlaps:** on close and again on save the shape has every other shape cut out of it (polygon-clipping 0.15.7, MIT, bundled in vendor/polygon-clipping and loaded on first use; precached for offline). "Trimmed where it crossed Lakeview." If it splits, the biggest piece is kept; a shape drawn around another keeps it as a hole; one entirely inside others is refused.
- **Naming:** "Name this area" offers only areas with no shape (with counts) and a new name. A new name matching an area that has a shape is refused ("Lakeview already has a shape. Tap it on the map to change it."); matching one without a shape uses that area. A new name is added to the area list.
- **A saved shape:** Rename (renames the area everywhere: contacts, the list and the shape; merging into an area without a shape is allowed, onto one with a shape refused), Redraw, Remove shape (the area and its contacts stay). Save trims again.
- **Sorting:** after a save, if anyone's pin is inside the shape but in another area (or none), "Sort into Oak Park" lists each move ("Lakeview → Oak Park") ticked; "Left as they are" lists that area's contacts whose pin is outside and those not on the map yet. Move N. Nothing moves without it.
- **Automatic:** a contact with no area joins the area whose shape holds its point: when a geotag is taken in New contact or Edit (the Area picker fills in; it can be changed), and when the map places a contact from its address (Contacts map, or the editor, which places missing addresses too). A contact that already has an area is never changed automatically.
- **Data:** `settings.areaShapes = [{ id, area, pts: [[lng, lat]…], holes, at }]` (6 decimals), so shapes go with backups. Renaming or removing an area in Customize › Lists carries or drops its shape (merging into an area that has a shape keeps that one). Pure geometry in js/areas.js (`RV.areas`: list, shapeOf, colorOf, areaAt, inside, snap, trim, moves, renamed, removed, loadClip). gmap exports loadLib, baseStyle, isDark, placeMissing for the editor.
- Tests: areas 7 (new, node), areas_ui 42 (new, browser: the button, list, tap drawing with snapping and trimming, side dots, corner drag/remove, Undo, naming rules, no overlap, sorting with an untick, crosshair snapping and close, Cancel, rename carrying the shape, Remove shape, Lists rename, auto-assign from an address and from a geotag), smoke 365 and the rest unchanged. VERSION 2.50.0, cache rvapp-v107.

## 63. v2.50.1 A first view that says what Groundwork is; Getting started as three setup steps (built 2026-11-03)

Mark: first-time users need to know what the app is. An auto-playing slideshow was considered and set aside (people skip tours, and the features are already taught where they are used); the planned four-card tutorial is dropped. Mockup: https://claude.ai/artifact/9dWPQDmRaZHQF4tgJXbeGP. Copy agreed with Mark after an audit: say plainly what it is and the problem it solves, lead with the garden, preparation second, privacy and backup last; no "game" in the opener; no campaign promise until central campaign publishing ships; tracts and topics are one thing; Today has no per-person plan.
- **Intro** (`RV.screens.introCard`): at the top of Today for a new user: the happy pot and "Groundwork", "A garden that keeps your return visits from falling through the cracks.", then three lines with icons: "Everyone you talk with grows as a plant. Your visits keep it watered." / "Your conversation topics are ready for the day." / "Your records stay private on your phone, and can be backed up to your own Google Drive."
  - A button in its corner folds it to one row (pot, name, chevron); tapping the row opens it again. Folded or not is kept on the device (`rvapp.introFolded`).
  - It goes for good once any Getting started step is done (`settings.starter.introGone`). If Getting started was skipped, an empty install shows it without the fold button. About shows the same intro.
- **Getting started** (`G.starterSteps`): three setup steps a new user can finish in one sitting at home: Add your contacts (adding, importing or restoring ticks it), Choose your conversation topics (opening Topics ticks it, `settings.starter.topics`; hint "The nine tracts are on. Switch on any other topics you use."), Back up to Google Drive (starts the Drive sign-in). Record a visit, Record a Not Home and See your garden are gone: New contact already records the first conversation, and a step that can't be done until you go back to someone left the list stuck for weeks.
  - Every step opens its own workflow in any order: the current one has its hint and button, the others (done ones too) are rows with a chevron. A step ticks only when it is actually done. Finishing all three still brings the bluebird.
  - The five import rows are two compact rows under the list while no contacts exist: Import from another app ("Ministry Assistant, Witness Work, notes, a spreadsheet", opens Import contacts) and Restore a Groundwork backup ("From Google Drive or a file"). The skipped-Getting-started Welcome card uses the same two rows under Add your first RV.
- **Tips on the contact**: the Record a visit tip, then the Not Home tip, show on a contact's screen one at a time until Got it, while Getting started is on or finished (not when it was skipped), so they outlive the checklist.
- Tests: smoke 375 (intro and its fold, steps out of order, intro gone after one step, rows until contacts are in, tips after the checklist). Others unchanged. VERSION 2.50.1, cache rvapp-v108.
- v2.50.2: on topics, "theme" is now "Category" (Mark: "theme" reads as light/dark, which Display still calls Theme): By category / By series on the Topics page and in View all, the topic editor's Category field and No category, the category ⋯ sheet, the delete message. Creating is "New" on the Topics page (New topic, New category, New topic in this category), since "Add" there read like putting something on Today. Wording only; stored fields (`theme`, `themes`) unchanged. Other pages keep "Add" (campaign, stage, reason, custom field). Tests: smoke 375. Cache rvapp-v109.

## 64. v2.50.3 Cleanups from the UX audit (built 2026-11-03)

The items from claude/ux-audit.md (and the 2026-10-31 audit) that needed no decision.
- **"Contact" everywhere it means the person**: New contact (the + button's label), Edit contact, Delete this contact, Hide for this contact, the not-home banner switch, empty states and the map's empty line, import summaries and toasts, "N contacts and N visits on this phone", Restore's count, the Lead stages and Lists counts, the visit-log CSV's Contact column, "not a Groundwork backup". RV stays as the stage name (and in Labels).
- **Local dates**: `U.fmtDate` shows a full timestamp on its local day; an evening study in California showed as the next day ("last covered Lesson 4, Tue" for a Monday study).
- **Today's carousel cards size to their content** (the 380 px minimum height is gone; cards in the row still match the tallest).
- **The menu closes on Escape and on any change of page**, including the phone's Back.
- **Removed from the site**: the 14 test screenshots at the root and the old v1 app at /rv-app/; `.gitignore` keeps root screenshots out.
- **Privacy page**: the map is in Contacts and when addresses are looked up, Clean up on every visit and person field, imports read on the device, jw.org links, the menu path to Erase.
- **Areas** show the last real visit or Not Home ("last visit" left out when there is none; adding someone isn't a visit).
- **Record screen**: wide kinds (the grapevine's arbour) stay inside the card.
- **Touch targets**: the A to Z strip's letters are bigger and a finger can slide along it to jump; the garden's bed signs are bigger.
- Not in this release: the can and streak changes (WIP branch wip/2.50.3, part of the motivation redesign that goes to mockup first).
- Tests: smoke 375 (wording), others unchanged. VERSION 2.50.3, cache rvapp-v110.

## 65. v2.51.0 Motivation without guilt, Today's list, and the audit decisions (built 2026-11-03)

Mark's rule from the UX audit (claude/ux-audit.md): show what was accomplished, never what is left; keep what was earned; no pressure. Habit apps that last (Apple Fitness, Finch, Headspace) count what you did, keep it, and welcome you back. Mockups: https://claude.ai/artifact/A3ttuVwYdcFdm8Ho12cK2q (panels 1–15).

**The game**
- **No streak.** The streak, its pennants on the fence, freezes and the Streak sheet are gone; bunting now only means a campaign is running. The five sundial milestones (ids unchanged, earned ones kept) count weeks with at least one live visit or Not Home recorded in Groundwork (`G.weeksOut`), a total that only grows: 1, 4, 12, 26, 52 weeks with visits recorded. Geese come in autumn after 4 such weeks that season.
- **The watering can** starts the week empty and fills a quarter for each thirsty plant watered (full at four). Its sheet says only what was done ("3 thirsty plants watered this week"; "Each thirsty plant you water this week shows here." before any). The weekly recap shows "Watered" and "weeks with visits recorded", no ring and nothing "still thirsty".
- **No chalkboard.** Today's tending (three daily goals, "Grow ___") is removed. The frog comes on a day with plans left on 2+ visits (`G.plansToday`); rain falls the first time you go out after 7+ days away, as a welcome back (`G.welcomeBack`; once a day, `settings.tendDone`).
- **Growth is kept.** A long gap no longer empties the steps toward the next form or the run toward the next shrub flower; only care fades, and the next conversation revives the plant and growth carries on (`G.chain` counts every conversation since the stage). No hold mark is needed. How your garden works: "Each conversation grows it, however far apart."
- **A plan counts only when written.** Record a visit's Discuss next time starts empty with last time's plan faintly inside it ("Last time: …"); only text written there (or a topic's linking question picked) counts as a plan (`entry.plan` from the sheet). Left empty, last time's plan stays on the record. The "Plan set · lush" nudge is gone; How your garden works still explains plans.

**Today's list** (js/todaylist.js, `RV.todayList`; `settings.todayList = { day, ids, off, note }`, so it goes with backups)
- On Today under the carousel: an optional note for the day, then the people you mean to see in the order you add them (drag the grip to reorder; nothing reorders for you). Each row: a tick, the plant, the name, likely-home timing (or address), and Bring up / Next lesson. A visit or Not Home ticks someone off ("Visited 10:40", "Not home 11:05"), and the heading counts what's done ("· 2 seen"). It clears overnight; nobody is marked missed.
- **+ Add** opens everyone A to Z with a search (area only as a detail); tap to add or take off.
- **Follow-ups for today join on their own**, marked "Follow-up today" (taking one off is remembered for the day). Fix: a follow-up date now stops counting as quiet on the day itself (it used to hide the person that day).
- **Plan a visit**: a calendar icon in the contact's top bar (filled while they're on today's list) opens a sheet: Today (adds to the list), Tomorrow, Pick a date (both set the follow-up date), Take off today's list, Clear follow-up. It replaces "Follow up on…" in the ⋯ menu (now "Plan a visit…"). The visit sheet keeps its optional Follow up on date.
- **Could visit today** replaces "If you see them" and "N people to see today": up to three people likely home today or with today as their best day, not on the list and not seen today, each with + Add; rows show only when they're likely home.

**Other decisions**
- A study record hides a Discuss next time written before its first study session (it stays in the timeline).
- Timeline: the newest visit isn't repeated (Last visit shows it); a row opens its edit sheet, where Delete now lives.
- Contacts with nobody yet opens on List with Add a contact and the two import rows; nothing is sent to the map service.
- A backup card on Today when there's no backup and 5+ contacts, or the last backup (Drive or a downloaded file) is 14+ days old; Not now hides it for 14 days. The menu foot shows "Backed up Nov 3" or "Not backed up".
- The first tab is named Today.
- Stuck in stage is dropped (its Customize setting too); Worth reconsidering moves to the foot of each area as "Not home 3 or more times", with the days tried.

Tests: smoke 383 (the gate, can sheet, recap, plan field, timeline, Today's list, Plan a visit, follow-up on the day, Could visit today, areas), garden 45 (kept growth, weeks recorded, plans today, welcome back), screens 60, others unchanged. VERSION 2.51.0, cache rvapp-v111.

## 66. v2.52.0 Follow-up reminders (built 2026-11-03)

Agreed with Mark 2026-11-03: a push notification on mornings when you have a follow-up, and never otherwise.
- **Menu › Notifications** (`#/settings/notify`): Follow-up reminders on/off and a time (default 8:00), with what is sent. On an iPhone browser tab it explains Add to Home Screen first. Off until turned on; the phone asks for notification permission once.
- **App** (js/reminders.js, `RV.reminders`): sends the helper only `{ id, sub, tz, time, dates }`: a separate anonymous ID (`rvapp.remindId`, not the cleanup one), the browser's push subscription, the time zone, the time, and the follow-up dates from today on (`datesToSend`: open contacts only; today drops off once everyone due today has had a visit or Not Home). It re-sends a few seconds after any change while on, and once when the app opens. Turning off unsubscribes and calls `/unsubscribe`. State in localStorage `rvapp.remind`.
- **Service worker**: on a push it reads the phone's own records (IndexedDB) and shows "Follow-up today: Maria Lopez", "Follow-ups today: Maria Lopez and James Carter" or "3 follow-ups today: Maria, James and Linda"; tapping opens Today.
- **Helper** (worker/reminders.js, Cloudflare Worker `groundwork-reminders`): `/subscribe` and `/unsubscribe` from ALLOWED_ORIGIN only, strict validation, KV `REMINDERS`. A Cron Trigger every 15 minutes sends each subscription its reminder when today is one of its dates, the local time has reached its time, and today's hasn't gone yet; a re-sync never re-sends. Pushes are encrypted (RFC 8291, aes128gcm) and signed with VAPID (RFC 8292) using Web Crypto; a 404/410 from the push service deletes the subscription. Nothing about contacts is stored or logged.
- `RV.config.reminders` and `RV.config.vapidPublic` ship empty, so the page says reminders aren't set up yet until Mark deploys the helper.
- Privacy page: a Follow-up reminders section.
- Tests: reminders 6 (node: validation, timing, encryption decrypted with the browser's keys, VAPID signature, cron once a day, gone subscriptions), reminders-app 4 (node: dates, words, the service worker's words match), reminders_ui 12 (browser: the page, what is sent and never names, time change, a Not Home taking today off, a push delivered to the service worker, turning off). Menu has Notifications (smoke 383). VERSION 2.52.0, cache rvapp-v112.
- v2.52.1: Today's list has one way to add, the + Add in its heading; the empty list no longer repeats it as an Add people button (Mark). Cache rvapp-v113.

## 67. v2.52.2 Ideas for next time stops coming back empty (built 2026-11-05)

Mark: Ideas often said "No ideas this time". The instructions weren't strict (always three picks, broad openers when the notes say little); the empty result came from matching. Topics were sent by their long ids (`lib-practical-guidance-for-everyday-life`, `[tract] lib-tract-life-forever`) and a pick was kept only if Claude copied its id back exactly. Haiku often dropped `lib-`, kept the `[tract]` marker or shortened a word, so all three picks were thrown away. An empty result was then saved on the contact until their next visit, so every later tap showed it again without asking.
- Topics go out numbered (`1 | [tract] Life forever | question | next part: …`); Claude replies `{"picks": [{"n": 12, "why": "…"}]}` and the app maps numbers back (`ideaTopic`). A title or the real id is still accepted as a fallback. The ids never leave the app.
- If the reply can't be read or nothing in it matches a topic, the app asks once more (`ideaPicks`, one quiet retry; worst case two calls, about $0.0008).
- An empty result is never saved: the toast says "No ideas this time. Tap Ideas to try again." and the button is ready again. An empty result saved by an earlier version is ignored.
- Test fix: ai_cleanup's household-notes check read the field while the previous step's "Cleaned up" toast was still showing; it now waits for the cleaned text.
- Tests: ai_cleanup 60 (numbered topics, retry on no usable picks and on unreadable replies, matching by number or title, empty results not kept, old empty results ignored). Others unchanged. VERSION 2.52.2, cache rvapp-v114.

## 68. v2.53.0 The Calendar: service time, the report, scheduled visits (built 2026-11-06)

Release 1 of 3 agreed with Mark on 2026-11-06 (design: docs/SERVICE-TIME.md, project claude/service-time.md; mockups: design canvas "Groundwork Calendar", https://claude.ai/artifact/Ugp6FJpyAg6QPXNFjfiKdg). Release 2 is the year (year view, past months, the year in review with music); release 3 the game toggles and the Ideas switch.
- **Fourth tab, Calendar** (`#/calendar`, `#/calendar/YYYY-MM`, `#/calendar/schedule`, `#/calendar/profile`; js/calendar.js, `RV.calendar`). Logic in js/service.js (`RV.service`, pure parts tested in Node).
- **Profiles by month** (`settings.service.profiles`, each `{from: 'YYYY-MM', kind}`): Regular pioneer (50 h, 600 h a service year Sep–Aug), Continuous auxiliary (30 h, month to month), Publisher (time tracking on or off), Other goal (its own hours). Auxiliary months (15 or 30 h) sit on a Publisher base (`settings.service.aux`) and always keep time. Past months keep their profile; the first profile chosen also covers the months before it. Badge at the top (sheet with the goal, the year's hours and credit, Edit).
- **The safety net:** a day with live visits, Not Homes or new contacts (no imports or handoffs) and no time has a clay ring, from the day tracking began, in this month and last month until its report is ticked Sent. A card lists those days (chips open them; × hides it). The day sheet lists what was recorded that day; Add session, or No service this day (grey dot, Undo). Adding time fills the ring into a green dot (`cring2dot`). No suggested spans; nothing on the tab or Today.
- **Recording time:** sessions (lib items kind `time`), each Total or Start–finish (with Break), Ministry or Credit, on vertical wheels in 15-minute steps (`vwheel`, scroll-snap, a light tick on Android); the mode last used is remembered (`rvapp.timeMode`). Overlapping sessions count the shared minutes once (the earlier session keeps them), with "Overlaps … · Fix"; a day can't pass 24 hours.
- **Totals:** a month's hours round down; leftover minutes carry into the next month, service and credit separately, worked out from the records each time. Credit counts toward the goal and shows on its own.
- **Pace card:** "11 h 15 m this month", recorded and planned fill, "On pace for 41 h" · "Goal 50 h", "Includes … credit and … carried from October." Pace = recorded + the plan for the rest of the month (today counts the larger). Goal reached: a full bar with a leaf. No hours-to-go, no behind.
- **My schedule:** one weekly pattern (`settings.service.pattern`), sessions repeating every week, every other week (from a chosen week) or chosen weeks of the month; any future day can be changed on the calendar (`overrides`). Planned hours show faintly on future days.
- **Follow-ups** (follow-up dates) show as a small person on their day; a future day's sheet lists them, with Plan a visit (picks a contact, sets the follow-up date; today's adds to Today's list).
- **Bible studies:** everyone with a study session that month; fewer than three in all shows "1st study" / "2nd study"; − and + adjust the count (studies not in Groundwork). Imported studies count here.
- **Report:** last month's row (or the month viewed): Copy (text to the clipboard), Sent checkbox (stamp on the month), comments, history. Changing a month marked Sent asks once ("…’s report is marked sent. Changing it may not match your publisher record card." Change anyway) and writes the change to the month's history; nothing is flagged. Month records are lib items kind `svmonth`, id `svm-YYYY-MM`.
- **Month look back:** the first open in a new month (after setup) shows last month: hours, days out, studies, people visited, comments, Copy report, Sent, Later.
- **Update card** for existing users, once: "New: Calendar", three lines, "How do you report?" (four choices), the auxiliary line, Not now (Publisher, time off). New users get the question on the Calendar tab. Browser tests that set `__RV_SURPRISE` never see these cards unless they set `__RV_SVCCARD = 1`.
- **Service time reminder** (Menu › Notifications, its own switch beside Follow-up reminders; one subscription, `RV.reminders.setKind`): the morning after a day with visits and no time; the service worker checks the phone's records and adds "Any time from yesterday to add?" (alone it opens the Calendar). Still only dates go to the helper. Works once the reminders helper is deployed.
- Export › Service time (CSV). Privacy page: a service time section. Service time goes in backups and exports, never in a handoff. Time and month records merge record by record; the profile and schedule live in settings.
- Not in this release: the year view and entering past months by total (release 2); importing service time from Witness Work.
- Tests: service 15 (new, node), calendar_ui 41 (new, browser), smoke 383 (four tabs), screens 60, kinds 23, areas_ui 42, reminders_ui 12, ai_cleanup 60, notes_import 39, drive_folder 37, garden 45, logic 53, others unchanged. VERSION 2.53.0, cache rvapp-v115.

## 69. v2.54.0 The service year and the year in review (built 2026-11-06)

Release 2 of the Calendar (design: docs/SERVICE-TIME.md; mockups 13–17 on the "Groundwork Calendar" canvas).
- **Year view** (Calendar, below the report; pioneers, continuous auxiliary and Other goal; not Publisher or auxiliary months): a folded card, "Service year 2026–27" with "131 h · on pace for 467 h". The fold is remembered (`rvapp.yearOpen`). Unfolded: for a regular pioneer, a ring (recorded solid green, the plan light green, on the track; "131 h · of 600") and "On pace for 467 h" (Goal reached with the leaf once 600 is passed); for others, the year's total. Then a bar for each month Sep–Aug (recorded solid with its hours over it, My schedule light; the current month's label darker), the key, Monthly average (finished months), Credit, Carried into this month, and one line: tap a month to open it; the pace uses My schedule. No hours-needed figures.
- **Tapping a month** opens it, except a past month with no days of time in Groundwork: that opens a sheet, "September 2026 · No days recorded in Groundwork", with Hours and Credit wheels (0–150 h) and the report's Sent box. The total is saved as the month's adjustment when the sheet closes (or before Sent is ticked), so it never conflicts with day sessions; a month marked Sent asks first and writes a history line (`pastMonthSheet`, `openMonth`).
- **Service year in review** (js/review.js, `RV.review`): full-screen story cards in garden colours, tap right for next and left for back (arrow keys and Escape too), segment bar, label "Groundwork · 2025–26", speaker, share and ×. Cards, each only when there's something to show: opening (the happy pot); hours ("You gave 612 hours", "That's more than 25 full days, spent on other people.", and "600 hours. You did it." only when a regular pioneer reached it); days out (with "Saturdays were your thing." when a weekday stands out); people talked with (and how many were new contacts); studies (and how many had their very first study that year); go-to conversation topic (used twice or more); area ("Lakeview saw you most", three or more visits); the garden (plants that grew, garden on only); close ("Every hour counted." or "Every conversation counted." without time; "Here's to the year ahead."; Share and Done). No names anywhere; nothing compares years; the goal only when reached. Numbers: `RV.service.yearReview(D, 'YYYY-09')`; the year view's months: `RV.service.yearMonths`.
- **When:** once, on the first open after the service year ends, if the Calendar was set up during that year and the year has anything in it (`settings.service.reviewSeen`; checked after the update card and before the month look back). Reopen from the year view ("Your 2025–26 in review", shown when last year has something). `#/calendar/review/YYYY-09` opens any year's review (used to look at this year's before September); the address goes back to `#/calendar`.
- **Share** draws the card on a 1080×1920 canvas (Space Grotesk, the card's colours, the big number, its line) and hands it to the phone's share sheet, or saves the image where sharing files isn't offered. The close card's Share makes a summary image ("My service year 2025–26", hours · days out · people · studies). The music is never in an image.
- **Music:** "They Say" by Pipo & Wowa (Unminus License), audio/year-review-they-say.m4a (AAC 96 kbps, 1.9 MB; source and license in audio/README.md). Off until the speaker is tapped; the choice is remembered (`rvapp.reviewMusic`). Fetched the first time it plays and kept in the `gw-audio` cache (not in the app download; the service worker keeps that cache across releases). Web Audio: fades in over about 2 s, loops with a 2.5 s crossfade before the 1.1 s of silence at the end, fades out on close. On iPhone it asks for playback audio (`navigator.audioSession`, Safari 16.4+), so the ringer switch doesn't mute it. If it can't load (offline the first time), it says so and switches off.
- Calendar fix: a missing card (no ring card, for instance) wrote "null" on the page; the screen now leaves missing cards out.
- Privacy page: a sentence on the year in review, Share and the music.
- Tests: service 18 (year months, the review's numbers, goal only when reached), year_ui 36 (new, browser: fold, ring, bars, the past-month wheels and the Sent warning, cards with no names, back and forward, Share image, the music fetched only when turned on and cached, shown once, profiles without a year view), calendar_ui 41, smoke 383, others unchanged. VERSION 2.54.0, cache rvapp-v116.
- v2.54.1: finishing the service year (Mark; mockups 19–22 on the "Groundwork Calendar" canvas). The review is available only from when August's report is ticked Sent until September's is (`RV.service.reviewStatus`, `reviewYear`; state in `settings.service.review[s0] = {done, watched, dismissed, asked}`, replacing `reviewSeen`). Ticking August Sent (anywhere) shows a celebration once per year (`RV.review.yearDone`): the pot over fireflies, "Service year complete", "You finished 2026–27!", "Your August report is in. Your year in review is ready.", See your year in review / Later. Until it's watched or dismissed (and September isn't Sent), opening the app asks once a day ("Your 2026–27 year in review is ready", Watch now / Watch later / Dismiss; not in the same session as Later). One push the morning after August was ticked Sent if still unwatched and not dismissed (`reviewPushDate`, joins the reminder dates whichever switch is on; the service worker adds "Your 2026–27 year in review is ready.", alone it opens the review at `#/calendar/review/YYYY-09`). The year view is always open under a plain heading (no fold, chevron or summary line); its foot has the review button (dark green, the pot) from August Sent until September Sent, watched or dismissed. Opening a review counts as watched only while it's available, so a preview doesn't. Tests: service 19, year_ui 48, reminders_ui 16 (the review in the push), others unchanged. Cache rvapp-v117.
