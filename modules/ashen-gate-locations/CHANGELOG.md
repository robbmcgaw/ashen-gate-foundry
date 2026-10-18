# Changelog

## 1.0.2 — 2026-10-18

- Removed the stand-in copies of the shared classes from `locations.css`; the kit now provides them, so Locations matches the other modules exactly.

## 1.0.1 — 2026-10-18

- Loads the shared Ashen Gate UI kit (`styles/ag-ui.css`) first, so the window, its kit classes and the Location Builder button in the Items sidebar get the shared look and follow the appearance chosen in General Manager, live.
- Dropdowns no longer cut off the bottom of their text.

## 1.0.0 — 2026-10-18

Rebuilt from scratch (#12). Simpler, and players can now see what you reveal.

- Locations have a name, type, region, description, image and threat level (**Normal / Hot / Deadly** badge). The `LOC-*` ID is made from the name; you never type it.
- Sections: gathering resources (drop material Items or type one; each has an *Available* switch), factions (drop Actors/Journals or type), Quest Manager quests, related locations, and notes (free text, or drop an Actor, Item, Journal or Roll Table to link it).
- Player visibility per location (*Revealed*), per section and per field/entry. It is enforced in the stored data: the player-readable Journal only ever contains what players may see.
- Place a location on the current scene as a Map Note (button, or drag from the list onto the canvas). The note opens the location, and players only see notes for revealed locations.
- Player viewer in the shared Actors-sidebar launcher group, with a *Player Access* switch in GM Setup. The GM builder stays in the Items sidebar.
- Quests link to Quest Manager (0.5.0+ lists every quest for the GM); clicking one opens the Quest Log.
- Import/export as Location records in an `ag-foundry-import/0.2` package; synthetic `[TEST]` sample included.
- API for Profession Ledger: `getLocation`, `listLocations({revealedOnly})`, `resourcesAt`, `locationsWithMaterial`.
- Removed: regions hierarchy, map registry and scene management, publish step and resolver adapters. Data from 0.8.x (test-only) is ignored, not deleted.

## 0.8.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
