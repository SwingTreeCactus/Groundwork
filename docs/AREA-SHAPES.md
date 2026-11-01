# Area shapes (design, not built)

Agreed with Mark 2026-11-01. Build nothing until Mark says build; a mockup comes first.

## Idea
Draw each area as a shape on the Contacts map. A contact whose map point (geotag, else the point looked up once from its address, `rv.approx`) falls inside a shape gets that area.

## Agreed
- **Edit areas button on the Map view.** Shapes show only while editing (tinted, with the area name); Done hides them. The map otherwise stays as it is (the v2.19.3 overlay stays gone).
- **Make areas from the map.** In Edit areas: New area, draw the shape, name it (a new name, or an existing area from the list, which links the shape to it). Tap a shape to move corners, rename or delete it.
- **No overlaps.** Corners snap to a nearby corner or edge of a neighbouring shape, so shapes share borders. Anything that still overlaps is trimmed off the shape being drawn, so two shapes never cover the same ground. Clipping by a small bundled polygon library (works offline).

## Proposed, to confirm at the mockup
- Drawing works like Google My Maps' line/shape tool (Mark asked, 2026-11-01): tap to drop corners, tap the first corner to close; afterwards each corner has a handle to drag, and a small handle in the middle of each side adds a corner when dragged; tap a corner to remove it; Undo last corner while drawing. Differences from My Maps: corners snap to neighbouring shapes and overlaps are trimmed. Not freehand (a finger also pans the map). Option for precision at the mockup: a fixed crosshair at the centre of the screen and an Add corner button, so the finger doesn't hide the spot.
- New contacts: Area fills itself from the shape they land in; it can still be changed by hand.
- Existing contacts: a one-time "Sort N contacts into areas" that lists the moves before applying. Contacts outside every shape keep their area.
- Address-only contacts need a connection for the one-time lookup; one added offline gets its area once the map has signal. Geotagged contacts work offline.
- Shapes saved in settings, so they ride along in Drive backups.

## Mockup
Design canvas "Groundwork area shapes" (https://claude.ai/artifact/5TjAXi36dQkTsju3gfJqE7), 2026-11-01. Eight phone screens: the map with Edit areas; edit mode (shapes and names show, area list, New area); drawing by tapping (interactive: corners snap to neighbours' corners and edges, tap the first corner to close); drawing with a fixed crosshair and Add corner; a loosely drawn shape with the overlap trimmed; changing a shape (corner handles, side dots to add a corner, Rename, Redraw, Remove shape); naming it (an existing area without a shape, or a new name); sorting the contacts inside into the area (moves listed with ticks; contacts outside or not yet on the map left as they are).
