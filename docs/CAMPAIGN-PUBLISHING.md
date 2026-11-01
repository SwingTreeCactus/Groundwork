# Groundwork: publishing campaigns to everyone (design, 2026-11-01)

Status: design only, nothing built. Mark asked for this on 2026-11-01 (option 2 of the two discussed).
Updated 2026-11-01 with Mark's answers: a published campaign is a title, dates and an explanation only (no linked
topics or scriptures); users can hide a whole campaign and attach their own topics to it; the publisher key is
hidden behind a long press.

## Why

Campaigns come from the organization, not from each publisher. Today every user has to type each campaign in
by hand, so most won't. Mark should be able to schedule a campaign once from his own app and have it appear on
every phone, with its dates and explanation, without a new release.

## In one paragraph

Mark's copy of Groundwork gets a "Publish to everyone" switch on the campaign form. It appears only after he
has entered an admin key once. Saving a published campaign sends it to a small list held by Groundwork's
Cloudflare Worker. Every copy of Groundwork reads that list when it opens (at most every few hours), keeps it on
the phone for offline use, and adds, updates or removes those campaigns. Users can't edit a published campaign,
but they can hide it or attach topics of their own choosing, and their own campaigns keep working as they do now. A published campaign is a concept,
not a topic list: a title, its dates and an explanation of what the campaign is.

## What each person sees

**Mark (publisher)**
- Getting to the key: Menu › Settings › About, then press and hold the version line (for example "Groundwork
  2.49.0") for about two seconds. A "Publisher key" sheet opens. He enters the key once; it stays on that phone.
  The same press-and-hold later shows "Forget key".
- Campaign form, with a key entered: a "Publish to everyone" switch at the top. Turned on, the form shows only
  what a published campaign carries: Title, Start, End and Explanation (the Topic, Topics and Publications fields
  are hidden). On save:
  - "Published. It reaches every phone within a few hours, sooner when the app is opened."
  - Errors are plain: "Couldn't publish: no connection" or "That key isn't right".
- His published campaigns show a small "Everyone" tag in the Campaigns list. Editing one republishes it.
  Delete becomes "Remove for everyone", with a confirm.

**Everyone else**
- The day it starts, Today shows the campaign banner with its title, and the explanation is one tap away (the
  banner opens it). New visits are tagged with it, as with their own campaigns. A published campaign brings no
  topics, so the carousel is unchanged unless the user attaches some.
- Published campaigns are listed in Campaigns under a "From Groundwork" heading. Opening one shows the title,
  dates and explanation read-only, then "Topics for this campaign" (the same picker their own campaigns use,
  empty to start) and "Hide this campaign". Topics they attach lead Today's carousel while the campaign runs,
  exactly as with their own campaigns. Any topic works, including ones they made. Hidden campaigns sit in a "Hidden" fold and can be
  shown again.
- Settings › Campaigns: "Get campaigns from Groundwork", on by default. Off stops the check and removes the
  published campaigns from that phone (their tagged visits keep their history).

## Rules

1. **One campaign at a time stays true.** A published campaign takes priority over a user's own campaign on the
   same dates: Today shows the published one, and the user's overlapping one is marked "Paused while X runs".
   When a user adds or edits their own campaign over a published one's dates, the form warns as it does now,
   but names the published campaign.
   (Alternative for Mark to choose: the user's own campaign wins. Recommended: published wins, because the
   point is that everyone is on the same campaign.)
2. **Stable ids.** A published campaign is stored as `central-<id>`; the id never changes, so visits tagged with
   it stay linked across updates.
3. **Updates.** If the server copy is newer (`rev` higher), the phone replaces its copy. Users can't edit a
   published campaign's title, dates or explanation; their hide choice and attached topics are kept separately
   and survive updates.
4. **Removal.** If a campaign disappears from the list, the phone marks it deleted. Visits tagged with it keep
   their history, as with a user deleting their own campaign.
5. **Offline and failures.** The last good list is kept on the phone. A failed check changes nothing and is
   retried next time. No error is ever shown to users for this.
6. **Content.** Mark writes the campaign title and details himself. Links to jw.org are fine; no copied jw.org
   text or images (standing rule).
7. **Regions.** One list for everyone, same dates worldwide. Regional dates would be a later change (a region
   field and a region setting).

## The server part

Add to the existing Worker `groundwork-ai` (one Worker to look after, already deployed by Mark), with its own
KV namespace so it never touches the cleanup counts.

- **Bindings:** KV namespace `CAMPAIGNS`. Secret `ADMIN_KEY`.
- **`GET /campaigns`** (no key). Returns `{ rev, campaigns: [...] }` from one KV entry.
  - Sends an ETag, so an unchanged list costs the phone almost nothing.
  - `Cache-Control: max-age=300`.
  - CORS for the app's origin.
- **`PUT /campaigns/<id>`** and **`DELETE /campaigns/<id>`** (admin only).
  - Requires `Authorization: Bearer <key>`, checked in constant time.
  - After 10 wrong keys in an hour from one address it refuses further tries for the hour.
  - Validates every field: title up to 80 characters, explanation up to 2,000, dates in `YYYY-MM-DD`, end not
    before start.
  - Rejects overlapping published campaigns.
  - Bumps `rev` on every change.
- **Campaign shape:** `{ id, rev, title, start, end, text, updatedAt }`. `text` is the explanation; it maps onto
  the existing campaign `text` field, so Today and the visit tagging need no new fields.
- **What it stores:** only the campaigns. The GET logs nothing and stores nothing about who asked. Cloudflare
  itself sees the request, as it does for every page load of the site.
- **Cost:** a KV read per uncached check; well inside Cloudflare's free allowance at any likely user count.

## The admin key: setting it up (Mark does this himself)

1. Make a long random key: about 32 characters from a password manager's generator.
2. Cloudflare dashboard › Workers › groundwork-ai › Settings › Variables and Secrets › Add.
   - Type: **Secret**
   - Name: `ADMIN_KEY`
   - Value: the key
3. Bindings › add a KV namespace named `CAMPAIGNS`. Create it first under Storage › KV.
4. Paste the updated `worker/ai-proxy.js` and deploy.
5. In Groundwork on his phone: long-press the version line in About, then enter the key.

The key never goes into chat, the repo or the app's code. To change it, Mark replaces the Secret in Cloudflare
and enters the new key on his phone; the old one stops working at once.

## The app part

- **New file `js/central.js`** (`RV.central`):
  - `fetchList()`: GET with `If-None-Match`; on success, saves the list and its ETag.
  - `merge(lib, list, hidden)`: a pure function, unit-tested. Returns the adds, updates and removals.
  - `publish(c)` and `unpublish(id)`: send with the key from localStorage `rvapp.publisherKey`.
- **When it checks:** on app open and on returning to the foreground.
  - At most every 3 hours.
  - Only when online.
  - Only when "Get campaigns from Groundwork" is on.
- **Storage:** published campaigns live in the existing `lib` store as `kind: 'campaign'`, with
  `central: true`, `id: 'central-<id>'` and `rev`. Per-user choices are kept apart from the server copy so updates never touch them:
  `centralPrefs: { <id>: { hidden, topics: [ids] } }` in settings. `todayTopics()` reads the attached topics
  for an active published campaign the same way it reads `topics` on an own campaign.
- **Logic:** `L.activeCampaign` prefers a central campaign over an overlapping own one. `L.campaignOverlap` keeps
  working, with the clash message naming "from Groundwork".
- **Settings › Campaigns:** the "From Groundwork" heading, the switch, and the "Hidden" fold.
- **Campaign form:** a read-only view for central campaigns, and the publish switch when a key is present.
- **Today banner:** tapping it opens the explanation (for published and own campaigns alike).
- **About:** press-and-hold on the version line opens the Publisher key sheet.
- **Service worker:** no change. The check is a normal network request; the list is stored in IndexedDB, not the
  service worker cache.
- **Backup and restore:** central campaigns are left out of backups (they come back from the server), but
  `centralPrefs` is kept.
- **Handoff:** unaffected.

## Privacy page

Add under "What leaves your phone":

> **Campaigns.** Groundwork checks its own server every few hours for campaigns everyone should see. The
> check sends nothing about you or your contacts; the server sees only that a phone asked, as any website
> does. You can turn this off in Settings › Campaigns.

## Tests

- Worker:
  - GET with no list, and with an ETag hit;
  - PUT and DELETE without a key, with a wrong key, and after the lockout;
  - field validation and overlap rejection;
  - `rev` bumps.
- `merge`:
  - add, update by rev, ignore an older rev, remove;
  - hidden and attached topics survive an update;
  - attached topics lead the carousel while the campaign runs;
  - a published campaign carries no topics;
  - a user's own campaign is untouched.
- `activeCampaign`: published beats an overlapping own one; the own one returns after the published one ends.
- Browser (smoke):
  - a stubbed list appears on Today and in Campaigns;
  - hide works;
  - the switch off removes them;
  - the publish switch appears only with a key, and hides the topic fields when on;
  - press-and-hold on the version opens the key sheet.

## Effort

About a day:
- the Worker and its tests: 2 hours;
- `central.js`, the merge and logic changes: 2 to 3 hours;
- settings and form UI: 2 hours;
- the privacy page, smoke tests and docs: 1 to 2 hours.

Then Mark's 10-minute Cloudflare setup, above.

## Decisions

Settled by Mark (2026-11-01):
- Users can hide a whole published campaign.
- The publisher key is hidden: press and hold the version line in Settings › About.
- A published campaign is a title, dates and an explanation; no linked topics or scriptures.
- Each user can attach topics of their own to a published campaign if they want to.

Still open (the recommendation is used unless Mark says otherwise):
1. When a published campaign and a user's own campaign overlap, which wins? (Recommended: published.)
2. "Get campaigns from Groundwork": on by default? (Recommended: yes.)
