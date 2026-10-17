# RV App: Design Doc (working name: JW-CRM)

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
