# Changelog

## 1.4.0 — 2026-10-19

Nested point-crawl, part 2 of 3: a reorderable card, custom details, Loot & Rewards, Region conditions.

- **Reorder the card.** Every block (Description, Conditions, Places Inside, Gathering Resources, Factions, Quests, Related Locations, Loot & Rewards, Notes, Linked Scenes) and every entry inside a list has a grip to drag, ▲▼ buttons, and Alt+Up / Alt+Down on the grip for the keyboard. Only the order is stored (a `layout` list of block keys; entries keep their keys, so nothing is re-keyed). Players see published blocks in your order, and a block with nothing to show has no title or count. A reorder is a saved edit: it reaches players on **Publish**.
- **Add Detail.** A custom block on one location: a title, text and an optional linked Actor/Item/Journal/Roll Table. It has its own 👁 (new ones start unrevealed) and its own place in the order. No shared list of details, no new entity type.
- **Loot & Rewards.** Drag an Item (world or compendium) into the list, or type a plain reward (coins, a clue, a favour, a key). You choose the title, description and image players see, and set **Available / Discovered / Taken** yourself. It is a link only: nothing is ever created, moved or equipped on an Actor. Each entry has its own 👁. Players can open the linked Item only if Foundry's own permissions let them; otherwise they see just the title, description and image you wrote. One Item can be linked from many locations.
- **Regions.** Tick *This is a Region* and its **Conditions** apply to every place inside it, at any depth. Each place shows where a condition comes from and can *Turn off here* or change its label/text without touching the Region. Only conditions are inherited, never resources, factions, quests, loot, state or visibility. Players never see a Region's name through this. A player sees an inherited condition only when the Region isn't Hidden, its Conditions section is shown, that condition's 👁 is on, and the place's own Conditions section is shown too.
- Everything here is additive. 1.3.0 locations load unchanged with the default order and no false "unpublished" flag. Exports carry the new fields; an import that leaves them out keeps the world's, and imports still never change state, published content or exhausted nodes.
- API: no new calls and no changed shapes (`resourcesAt`, `nodesForMaterial` and the rest are as before). Location records and player views gain `layout`, `details`, `conditions`, `loot`, `isRegion` and `conditionOverrides` (views: `layout`, `details`, `conditions`, `loot`).

## 1.3.0 — 2026-10-19

Nested point-crawl, part 1 of 3: marker states, private Save, pin art, nesting.

- **Hidden / Unidentified / Revealed** replace the *Revealed to players* switch. Unidentified shows players only a label (per location, or the world default from GM Setup) and an optional teaser, on the pin and in their Locations list. Nothing else about it reaches players.
- **Save Changes is private.** Players see edits only after **Publish** (or Reveal / Unidentified). **Player Preview** shows what they would see. A dot in the list marks locations with unpublished edits. Marking a node exhausted still shows at once.
- **Pins no longer carry the `LOC-*` id.** Map Notes and player pages are bound by a random pin key, so an unidentified pin can't give the name away. `LOC-*` ids are unchanged everywhere else, including exports.
- **Pin art:** per-location image for revealed, a separate image for hidden/unidentified, and size. World default unidentified image in GM Setup. Built-in Foundry icons until set. If you change a placed pin's image or size in Foundry's Note settings, that pin keeps it. Native Notes are never touched.
- **Nesting:** a location can sit inside another (any depth; loops are refused). The card lists the places inside; players see each one only once it's revealed (unidentified ones by label). **Linked scenes** with an *Open scene* button that moves only you.
- Migration runs once on the GM's client and is safe to re-run: `revealed` becomes Revealed/Hidden (players keep seeing what they saw), and existing pins and pages switch to pin keys in place.
- Imports keep each location's state, what players currently see, its pin key and exhausted nodes; an *update* import's changes wait for Publish. New fields export and import; a package that leaves them out keeps the world's values.
- API: `setLocationState`, `publishLocation`, `previewLocation`, `hasUnpublishedChanges`, `childrenOf`, `STATES`; `getLocation`/`openLocation` also take a pin key; players' `listLocations({includeUnidentified: true})`. Existing calls return the same shapes as before (players' lists stay revealed-only).

## 1.2.0 — 2026-10-18

- New GM-only API `importLocations(records, {mode})` for General Manager's single import run. `mode: "skip"` (default) leaves any existing location id exactly as it is; `mode: "update"` replaces its definition but keeps whether it is revealed and which finite nodes are exhausted. Returns `{created, updated, skipped: [{id, reason}]}`.
- **Import JSON** in GM Setup stays as a secondary path for using Locations without General Manager. It still skips existing ids.

## 1.1.0 — 2026-10-18

- Gathering resources are now **gathering nodes** (#21): skill, tier 1–5, DC (defaults 10/12/13/14/15 by tier, editable), a common material and an optional rare one (success by 5+), quantities, *Finite* and *Available* switches, and a note. Edited inline in the GM builder.
- Finite nodes can be marked exhausted (struck through) and restored with one click.
- Players see the DC only when the GM turns on its 👁.
- API for the Profession Ledger: `resourcesAt` returns node fields, plus new `nodesForMaterial`, GM-only `markNodeExhausted` and `GATHERING` constants.
- 1.0.x data loads unchanged (old entries become tier-1, DC 10, finite nodes) and is saved in the new shape on your next save.
- Import format extended with the node fields. The playtest pack (0.3.0) gives each location 1–2 nodes.

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
