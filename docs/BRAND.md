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

**Mark:** a house shaped like a speech bubble, with three dots inside (a conversation at
someone's home). The dots tie to the app's dot language (stage pips, Doto numerals).

**Primary version (shipped in v2.9.1):** accent background (#5B3E96, the app's purple),
off-white house, three ink dots.

**Alternate versions (not shipped, for dark or light contexts):**
- Ink: ink background, off-white house, dots ink, ink, accent (the accent dot = the next visit).
- Paper: off-white background, ink house, dots off-white, off-white, accent.

**Geometry (100 x 100 viewBox):**
- House path: `M50 21 L78 44 L78 72 L44 72 L29 85 L31.5 72 L22 72 L22 44 Z`, filled and
  stroked in the same color, stroke-width 7, round joins (this rounds the corners).
- Dots: r = 5 at (37, 55), (50, 55), (63, 55).
- Maskable version: the mark scaled to 0.86 around (50, 53), so it stays inside Android's
  80% safe circle.
- Favicon at 16 px: house only, no dots (the dots blur into a bar at that size).

**Files:** in the app's `icons/` folder since v2.9.1: icon.svg, icon-192/512.png,
icon-maskable.svg and icon-maskable-192/512.png, icon-180.png (apple-touch-icon), favicon.svg,
favicon-32/16.png. They were rebuilt from the geometry above, so the earlier `RV-app-icons.zip`
(made with #7B61FF) is superseded. To recolor, change the fill of the background rect in each
SVG and re-render the PNGs.

**Rules:**
- Do not add text, outlines, gradients or shadows to the icon.
- Do not recolor the house; only the accent changes.
- Do not place the mark on a busy photo. Use one of the three versions.
- iPhone: apple-touch-icon stays square and opaque (iOS rounds it).

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
