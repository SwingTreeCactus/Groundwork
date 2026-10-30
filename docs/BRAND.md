# Groundwork: Brand Guide

Status: started 2026-10-20 when the app icon was chosen; icon shipped in v2.9.1. Companion to
`claude/design-doc.md` (the design doc covers features; this covers how the app looks and
presents itself). Keep it current when a brand decision changes.

## 1. Character

Calm, private, practical. A personal field tool, not an organization product. The look follows
the v2.3 "comfort pass": filled surfaces, no outlines, sentence-case labels, black for the one
main action per screen, a single accent color, generous tap targets.

## 2. Name

- The app is called **Groundwork** (chosen Oct 2026; domain mygroundwork.app). "JW-CRM" and
  "RV app" were working names and are retired from the app (v2.9.2).
- The name must never imply an official app of any organization.
- Never use "JW", "JW.ORG" or the jw.org logo in the name, icon or marketing. They are Watch
  Tower trademarks, and jw.org's terms do not allow its artwork or images in software apps.
- Do not use or imitate characters from jw.org videos (for example Caleb and Sophia).

## 3. App icon

**Current (v2.42.0, chosen 2026-10-30): the happy pot.** One of the garden's own terracotta pots with a first
sprout and a content face (closed smiling eyes, a gentle closed smile, a little blush), on garden green. It is the
app's character: every plant in the garden has this face. The icon does not try to tell the whole story (visits,
conversations); the app does.

- Colours: background garden green #3F6B48; rim #9C4A30; pot clay #B4583A; leaves #A9D08E and #CFE6B4 (stem
  #A9D08E); face ink #1F1D1A; blush #D9775B.
- Geometry (100 x 100 viewBox, before the per-file scale): stem `M50 39 V22` (stroke 5, round); leaves
  `M50 30 C39 30 32 24 31 14 C42 14 50 20 50 30 Z` and `M50 25 C61 25 68 19 69 9 C58 9 50 15 50 25 Z`; rim
  rect x 20 y 37 w 60 h 13 rx 5.5; body `M24.5 48 H75.5 L69.8 85 Q69 89.5 64.5 89.5 H35.5 Q31 89.5 30.2 85 Z`;
  eyes `M35 64 Q38.5 59 42 64` and `M58 64 Q61.5 59 65 64` (stroke 3.6, round); smile `M43.5 72 Q50 78 56.5 72`
  (stroke 3.6, round); blush circles r 3.4 at (32, 71) and (68, 71).
- Files (icons/): icon.svg (mark scaled 0.92), icon-192/512.png, icon-180.png (apple-touch-icon, square and
  opaque), icon-maskable.svg and -192/512.png (mark scaled 0.74 to sit inside Android's safe circle), favicon.svg
  and favicon-32/16.png (pot and sprout without the face, which blurs at that size).
- Rules: no text, outlines, gradients or shadows; no transparency; keep the face calm (the brand is calm, private,
  practical; a laughing face with tongue was tried and judged too loud).
- iPhone keeps the old icon until the app is removed from the home screen and added again (iOS caches it);
  Android updates it from the manifest on its own, sometimes after a day.

**Retired: the house-bubble (v2.9.1 to v2.41.1).** A house shaped like a speech bubble with three dots, on purple
#5B3E96. Replaced because the app moved off purple and the garden became its character.

**The search that led to the pot (2026-10-30), so it is not repeated:**
- Recoloured house-bubble, sprout in a speech bubble, sprout on three dots, plain pot: Mark didn't love any; he
  liked the pot but it "didn't tell a story".
- Pot with a story: leaf as a speech bubble, falling drops, pot in a doorway (fails in one colour), tree with a
  speech-bubble crown.
- Watering can pouring on a happy pot: the can's silhouette kept going wrong (a long thin spout with a rose read
  as phallic; a yellow can with a stream had an unwanted reading; dots as "…" read as weird dots). Audited
  against logo principles: three subjects (not simple), the standard plant-care picture (not distinctive), and a
  fragile silhouette. Dropped for the pot alone.
- Principles used: one subject; a meaning you can say in a sentence; reads in one colour; legible at 20 px;
  no trend effects; nothing that can be misread.

## 4. Color

| Token | Hex | Use |
|---|---|---|
| Accent: purple, light | #5B3E96 | App accent (default) and icon background |
| Accent: purple, dark | #B9A2EE | App accent in dark mode |
| Accent: blue, light | #2F5FA8 | App accent when Blue is chosen |
| Accent: blue, dark | #8DB2EE | Blue in dark mode |
| Accent soft, purple / blue | #ECE7F6 / #E3EBF7 (dark #272036 / #1B2535) | Overdue badge background |
| Warning (amber) | #8A5300 on #F8ECD9 (dark #F2BD69 on #30250F) | Do not call, delete |
| Ink | #0E0E10 | Icon dots, dark grounds |
| Paper | #F5F4F0 | Icon house, light marks |
| Paper ground | #F2F0EA | Light icon background |

- In the app, the accent is purple (default) or blue, chosen in Display, set by redefining the
  `--red` token per `data-accent` in css/app.css. Red is no longer used as an accent (it reads
  as alarming).
- The icon uses the light purple #5B3E96 so it matches the app (decided 2026-10-20). The
  earlier, brighter #7B61FF is retired.
- The installed icon stays purple when the app's accent is set to Blue (an installed icon
  cannot change with a setting).

- v2.34 (2026-10-28): colour in three layers. A warm neutral interface (paper #F2F0EA, card #FFFFFF, fill
  #F5F3EE, line #E7E4DC, muted #6B6862, ink #161616; dark #12110F, #1C1B19, #262522), a natural palette for the
  garden world (plants, scene, visitors: greens #3E6B4B #5C8C55 #86A64C #93A88C #3D6B63, bronze #8E6A45, bark
  #6E5242, fruit and flowers #C8473A #D8892E #E5BF45 #EEB4C3 #C23A6E #7B4767 #5D4A8C #4E3B5A; care yellows, then
  browns), and the accent at about a tenth (active tab, due marks, growth bars, selections, links). Plants no
  longer take the accent; pots are warm neutral with an accent rim.

- v2.35 (2026-10-28): one palette, no brand colour (Mark: purple did not look good as an accent). Warm paper
  #F2EEE5, cards #FFFDF9, ink #1F1D1A, muted #6E6A62 (dark #141310, #1E1C18, ink #F2EEE5); a single clay accent
  #B4583A (dark #E39271) taken from the terracotta pots, used sparingly; the garden keeps its natural palette.
  The Purple / Blue choice is gone. The table above is history. Open: the app icon is still purple #5B3E96;
  recolouring it (clay or ink background) is a separate decision.

## 5. Type

- Space Grotesk for everything in the UI.
- Doto (dot-matrix) only for the tab titles and large numbers.
- Fonts are bundled in /fonts (SIL Open Font License), so the app works offline.

## 6. Lessons from the icon search (so they are not repeated)

- Start from the app's meaning, not from objects in the scene (doors, bags and pins all read
  as generic clip art).
- Design in one color first; add the accent to one element at most.
- Dot-matrix works for type on a coarse, regular grid. It fails for drawing pictures.
- Build on a grid and render every candidate at real sizes (192, 64, 48, 32, 20 px, light and
  dark wallpaper, circle crop) before showing it.
- Rejected directions: door, door + dots, five pips, route with stops, bookbag (several
  styles), dot-matrix return arrow, "RV" monogram, rings of dots (read as loading spinners),
  doorbell, house in a return arrow, row of houses, and a dot-matrix "R." (legible but not
  tied to the app's purpose).
