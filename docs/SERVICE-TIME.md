# Groundwork: Calendar and service time (release 1 built as v2.53.0; releases 2 and 3 to come)

Agreed with Mark 2026-11-06. Build nothing until Mark says build; mockups first. Reverses design-doc section 10's "Not planned: service time and monthly report tracking."
Mockups (design canvas "Groundwork Calendar"): https://claude.ai/artifact/Ugp6FJpyAg6QPXNFjfiKdg

## Purpose
- A Calendar tab (fourth tab, after Today, Contacts, My garden) for scheduled visits, service time and the monthly report.
- The records are a safety net: a day with live activity but no time is marked, so nobody forgets they went out. The app never guesses how long you were out (no suggested spans); the day's records only remind you that you went and what you did.
- Service time stays out of the garden entirely.
- Two principles for the feel (Mark 2026-11-06): motivating and satisfying, without becoming a game. No streaks, ahead/behind lines, month-to-month comparisons, plan-vs-actual per day or days-in-a-row counts.

## Profiles (time counting)
- Base profile: Regular pioneer (50 h a month, 600 h a service year, September to August), Continuous auxiliary (30 h every month until switched off; month to month, no yearly goal), Publisher (time tracking on or off), or Other goal (its own monthly goal, for special pioneers and other assignments, without naming each role).
- Auxiliary pioneer months (for occasional months) sit on top of a Publisher base: chosen months of the service year (past months greyed), 15 or 30 h; only those months. Auxiliary months always keep time, even with time tracking off. (Confirmed by Mark 2026-11-06, mockup 7.)
- Publisher with time off hides everything about time (no rings, no header line, no hours, no My schedule); activity dots, follow-ups, the study tally and the report row stay. No "You shared in the ministry" card (Mark: distracting).
- A profile applies to a whole month; past months keep the profile they had.
- Started partway through a service year: no nudges; the year view shows a monthly average. Earlier months are filled in from the year view (see Year view); no special button.
- Profile badge at the top of the Calendar tab ("Regular pioneer", "Auxiliary · Nov", "Publisher"); tap for a short sheet (goal, this year's total, credit this year, Edit).

## Month view
- Week runs Sunday to Saturday, matching the garden's week (or follows the phone's region; decide at build).
- Grid: green dot = time recorded (for time-off publishers: visits recorded); clay hollow ring = live activity, no time; grey dot = activity, day cleared ("No service this day"); small green person icon (with a count when 2+) = follow-ups that day; faint hours on future days = planned from My schedule. Today is a solid ink tile.
- Rings only for live records (no imports, no handoffs), only from the day time tracking was turned on, and only in the current month plus the previous month until its report is ticked Sent (Mark: yes, 2026-11-06).
- Ring to dot: adding time to a ring day fills the clay ring into a green dot with a small, slow fill. The net closing is the feature's most satisfying moment.
- Header card: "Visits recorded, no time added" with a chip per date (opens that day) and ×. Clearing a day: "No service this day" in the day sheet (swipe-to-dismiss app-wide saved for later).
- Pace card: "11 h 15 m this month", a fill (recorded solid, planned light), "On pace for 41 h" · "Goal 50 h", and "Includes 3 h credit and 45 min carried from October." Pace = recorded + planned for the rest of the month; today counts the larger of recorded and planned. No hours-to-go, no "behind".
- The month closes quietly: when the goal is reached the fill becomes a full bar with a small leaf mark and "Goal reached". No confetti or sound; nothing happens when it isn't reached.
- Credit counts toward the monthly fill and the year, and is shown as its own total.
- Under the grid: Bible studies, then the previous month's report (Copy, Sent checkbox) and the folded service year.
- No dot or count on the Calendar tab; the header card appears only on the calendar.

## Day sheet
- Past day: "What you recorded" (time, pip, name, kind and a few words), then Time: Add session and "No service this day".
- Today: as a past day, plus Plan a visit (adds the person to Today's list).
- Future day: Planned (from My schedule; tap a session to change it for that day only), Follow-ups (Bring up / Next lesson), and Session / Plan a visit buttons (Plan a visit picks a contact and sets their follow-up date to that day).

## Recording time
- Sessions: "+ Add session"; each session is its own card with a Total / Start–finish switch, a Ministry / Credit choice and ×. More than one session a day is allowed.
- Wheels only, no typing, 15-minute steps. Pickers show five values fading toward the edges, the chosen one on a band in the middle. Start–finish: Start, Finish and Break side by side, with "9:30–12:00, 15 m break · 2 h 15 m" underneath. Total mode: hours and minutes. The mode last used is remembered. Wheels open on a neutral value (no suggestion). Android gets a light vibration tick per step (iPhone web apps can't vibrate).
- Overlaps: the later session shows "Overlaps 11:45–12:00 with your first session" with Fix (moves its start); left alone, the day total says "15 m overlap counted once" (ministry vs credit: the earlier session keeps them). Total-mode sessions can't overlap; a day over 24 h is refused.

## My schedule (the time pattern)
- Opened from a My schedule button on the Calendar tab (beside the badge), not the menu.
- One weekly pattern: each weekday lists its planned sessions (amount or time range, Ministry or Credit, same sheet as recording). Repeats: Every week, Every other week (from a chosen week) or Chosen weeks of the month (1st and 3rd). + Add on empty days, + Add session under filled ones. Foot: "About 34 h a month · 7–9 h a week". No separate monthly template.
- Tweak any future day in the month view without changing the pattern. Plans never show on past days.

## Rounding and carry-forward
- A month's reported hours round down to the whole hour; leftover minutes carry into the next month ("45 min carried from October"). Service and credit carry separately.
- Carry is computed from the records, so a late entry fixes both months.

## Report
- Each month's report row: Copy (copies the text) and a Sent checkbox the user ticks (Mark 2026-11-06). Ticking Sent puts a small Sent stamp on that month's header.
- Optional Comments field on the report (e.g. "assembly week"), included in the copied text.
- Publisher: shared in the ministry, Bible studies. Pioneers: hours (rounded), credit, studies.
- Changing a month marked Sent (a day's time, the month's total or the study count): a dialog, "October's report is marked sent. Changing it may not match your publisher record card." Change anyway / Cancel. Nothing is flagged afterwards (Mark: a flag is annoying). The change is written to that month's History ("Nov 6 · 62 h → 64 h, after the report was sent"; "Nov 2 · Report marked sent · 62 h, 4 h credit"), so a mismatch with the record card can be traced later.

## Look back when the month turns
- The first open in a new month shows one calm card: "October · 62 h · 18 days out · 3 studies · 41 people visited", with Comments, Copy report and Sent on the same card. Celebrates what was done and leads into the month's one job. Once per month.

## Studies tally
- Everyone with a study session that month; people with three or more show "N this month", anyone with fewer than three in all shows "1st study" / "2nd study" in green. Imported study sessions count here (the garden still ignores them). Archived or handed-over contacts count for months they studied.
- A +/- adjustment beside the count for studies that aren't Groundwork contacts or households with more than one student; stored as a month adjustment, shown as "Includes 1 added by hand".

## Year view (folded, pioneers)
- Continuous auxiliary (no yearly goal): the year view shows the year's total, monthly average and month bars, with no ring and no year pace.
- Unfolded: a progress ring (recorded solid green, planned light green, track; "131 h · of 600" in the middle) with "On pace for 467 h" under it; no "where you should be today" marker. Then a bar per month Sep–Aug (recorded solid, My schedule light), Monthly average (finished months), Credit, Carried into this month, and one line: tap a month to open it; the pace uses My schedule, so change days for assemblies or time away. No "hours needed per month".
- Tapping a month opens it. A month with no days recorded in Groundwork (before you started using it) opens straight onto Hours and Credit wheels for the month's total (no tap-to-edit, no hint line), each 0–150 h (day sessions stay capped at 24 h). A typed total is stored as a month adjustment on top of any day sessions, so the two never conflict.
- Why the ring: budgeting apps use monthly amounts needed (YNAB) or ahead/behind a straight line (Strava, Goodreads); both read as pressure under the no-guilt rule. Done next to planned fits.

## Service year in review (approved 2026-11-06, Wrapped-style; mockups 14–17)
- Celebratory, with personality, like Spotify Wrapped; always positive. Shows once on the first open after September 1; reopen from the year view. Full-screen cards tapped through like stories (segment bar at the top, ×), one big number or fact each, garden-palette colours.
- Cards: opening (happy pot, "Your 2025–26 service year"); hours ("You gave 612 hours. That's more than 25 full days, spent on other people."; publishers without time get days first); days out ("Saturdays were your thing"); people ("31 of them were new"); studies ("You studied with 7 people. Two of them had their very first study this year."); go-to tract or topic; your area ("Lakeview saw you most"); the garden (only with the garden on); close ("Every hour counted. Here's to the year ahead." with Share and Done).
- The goal is never mentioned unless reached ("600 hours. You did it." appears only then). Nothing compares the year with the one before.
- No names anywhere in the year in review (Mark 2026-11-06). Share saves a card as an image (Mark: yes).
- Music (Mark 2026-11-06; the one exception to "no sounds", since it's once a year and opened by choice): starts silent behind a speaker button; tapping fades it in; the choice is remembered. Fades in and out, loops under the cards, never in shared images. Fetched only the first time the recap opens, then cached; not part of the app download. Moods (Calm, Warm, Bright, chosen from the speaker button and the close card) wait until there are three tracks; with one track the button is just on/off.
- Track chosen: "They Say" by Pipo & Wowa (Unminus, Unminus License: free, commercial use, no attribution; genre Acoustic, mood Relaxed, 93 BPM). Original 2:37, 6.4 MB, 329 kbps MP3; phone copy AAC 96 kbps, 1.9 MB (audio/year-review-they-say.m4a at build). Loudness -17.2 LUFS; no silence at the start, about 1.1 s at the end, so the loop crossfades over the last couple of seconds. Record its source and license in the repo with the file.

## Morning reminder
- Opt-in, its own switch in Menu › Notifications: the morning after a day with live activity and no time ("Any time from yesterday to add?"); tap opens yesterday's day sheet. Shares one notification with follow-ups on the same morning.
- The rule is the day's state, not each record: a date is on the reminder list only while that day has live activity and no time and isn't marked "No service this day". Notes recorded after time was entered never bring it back.
- Uses the reminders helper (worker/reminders.js, not deployed yet); still only dates are sent.
- No other push about time.

## Update card (existing users)
- One card, shown once on the first open after the update, to anyone with records. Not a slideshow. Mockup 18. Copy (Mark 2026-11-06): "New: Calendar"; "Days you recorded visits are marked, so no time gets missed."; "Plan your week and see what your month and year are on pace for."; "Your Bible studies are counted each month."; "How do you report?" with Regular pioneer, Continuous auxiliary, Publisher, Other goal; "Auxiliary pioneering? Add your months from the badge on the Calendar tab."; Not now (Publisher, time off). No subtitle. New users get the same question in the Calendar tab's empty state.

## Housekeeping
- Time entries aren't tied to a contact; they go in Drive backup, CSV export and Erase all data, never in a handoff. Privacy page line. Witness Work import can now bring in service time. Design-doc section 10 updated when built.
- Screen-reader alternatives for the wheels: not a priority (Mark: too few users for now).

## Separate small release (not part of the calendar)
- Game toggles on one page, Display › Garden (Mark 2026-11-06: toggles per game feature):
  - Garden (master): the garden scene and plants everywhere; off hides everything below (no garden means no plants; adjust later if needed).
  - Visitors: animals, announcements, the tab dot.
  - Milestones: objects in the garden and the field guide's milestone list.
  - Growth moments: full-screen growth and reveal animations; off = the plant still grows and is revealed, with a short toast.
  - Thirsty and wilting: off = plants always look healthy.
  - Everything keeps counting quietly while off; turning a feature back on shows what was earned. Scenery (seasons, fireflies) has no switch.
- An "Ideas for next time" switch on the Note cleanup page (on by default); off removes the Ideas button. It's the only AI feature that picks something for you; Clean up, the notes import and Fill from a note work on your own words and stay.

## Status
- Release 1 built as v2.53.0 (2026-11-06, design-doc 68): the Calendar tab, day sheets, sessions and wheels, My schedule, profiles, pace, studies, report with Sent and comments, month look back, update card, service time reminder (off until the reminders helper is deployed). The year row on the Calendar is a one-line summary for now.
- Release 2 built as v2.54.0 (2026-11-06, design-doc 69): the year view (ring, month bars, tapping a month, Hours and Credit wheels for months with no days, 0–150 h), the service year in review with music ("They Say", Unminus; audio/year-review-they-say.m4a). Before September, `#/calendar/review/YYYY-09` opens a year's review.
- Release 3 (next): game toggles (Display › Garden) and the Ideas for next time switch.
- Not yet: importing service time from Witness Work.
