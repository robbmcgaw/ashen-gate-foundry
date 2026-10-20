## 1.15.0 — 2026-10-20

- **Travel behaviours in the Travel tracker, tracking only.** Three collapsible panels for the current journey, each with a **Track on this journey** switch (all on by default). Nothing is automated: no effect on rolls, the hazard chance, legs, supplies or rest.
  - **Pace:** Slow / Normal / Fast, chosen by the GM; players see the current pace.
  - **Night watches:** the GM ticks characters for the first, second and third watch; players see the watch order.
  - **Foraging and navigation** (GM only): a skill for each (Survival by default, the GM can change it) and **Foraging check** / **Navigation check** buttons that open **Utilities → Rolls** with the check filled in (Group result, the party ticked; change anything, then Start Rolls). Needs Ashen Gate Utilities 0.13.0+ (`api.rolls.open`); without it the panel is hidden.
- **API (`travel`, GM only):** `getBehaviours()`, `setBehaviours(patch)`, `openCheck('forage'|'navigate')`, plus `checksAvailable()`. Players' `travel.state()` may carry `behaviours: {pace?, watch?}`. Every write is rejected for players in the API.
- **Extension point:** behaviour panels can now handle their own controls (`act(action, {isGM, el})` with `data-travel` / `data-travel-change="bh:<id>:<action>"`); a `'gm'` panel's actions are refused for players.
- Saved data: additive only (`behaviours` on the journey; pace and watch names on the players' progress page). Old journeys read with the defaults. No migration. Stored shape: `docs/routes-schema.md`.

## 1.14.0 — 2026-10-20

- **Travel tracker:** a small pop-out window (about 320 × 420, resizable) to keep open over the map while travelling. Open it from the new **person-hiking** button in the Token controls (left of the map) or **Travel tracker** on a journey in Locations → Routes.
  - **GM:** route name, From → To, a progress strip with a marker per leg (current leg highlighted, hazard legs outlined), "Leg 3 of 8, 15 of 40 km", the hazard chance and safe legs in a row, a big **Roll next leg**, the hazard card (**Reroll / Dismiss / Share to players**), **Pause / Resume**, **End journey** (asks first), **Open route** in Locations, and the latest legs. Same rules and API as the Routes tab; the tracker keeps no state of its own.
  - **Players** (with Player Access): route name, strip and "Leg 3 of 8", plus only the hazards the GM shared (and turning back). Never the chance, rolls or table results. It updates for everyone when the GM rolls.
  - **Fade slider** for the window background (per user, default opaque), and the window remembers its position and size per user (client settings).
- **Pause journey** (new): a paused journey refuses Next leg until **Resume**; players see "Paused". API: `pauseJourney()`, `resumeJourney()`.
- **New API `travel`:** `travel.open()`, `travel.state()` (read-only, player-safe), `travel.behaviours.register(...)`: an extension point for optional per-journey panels (no travel behaviours ship yet). See the README.
- Saved data: additive only (`paused` on the journey; the players' progress page may carry `paused` and `log` with the shared lines). No migration.

## 1.13.1 — 2026-10-20

- **Route defaults are now 5 km per leg and a 5% base hazard chance** (were 10 km and 10%). Only the shipped defaults change: a leg length saved in GM Setup → *Routes*, and the leg length and base chance saved on each route, stay as they are. New routes and imported routes without `leg_km` / `hazard_base_percent` get the new defaults. `docs/routes-schema.md` updated.
- No saved data changes.

## 1.13.0 — 2026-10-20

- **New API `embed.mount(element, {actorId, mode: 'character'})`** so a partner module (Character Hub) can show a compact, read-only Locations view: the party's journey progress and the revealed places the user can see, grouped by region, with search and Open. Returns `{unmount, refresh}`; it refreshes itself on changes. See the README.
- Built from the same player views as the window (no GM fields, no hazard chances). The Locations window is unchanged. No saved data changes.

# Changelog

## 1.12.0 — 2026-10-20

- **Routes on the map.** A route's new **Map Drawing** card:
  - **Link selected drawing:** select one of your own Foundry drawings on the canvas (Drawing tools), then click it. The drawing is marked with the route (`flags['ashen-gate-locations'].routeId`) and the route remembers the drawing.
  - **Draw for me:** adds a straight line between the two locations' pins on the scene you are viewing, already linked. Reshape it with Foundry's Drawing tools.
  - **Unlink:** the drawing stays on the map as it is.
- **Visibility:** Locations shows a linked drawing only while every player can see the whole route (discovered, both ends visible to each of them, nobody left out), and hides it otherwise. A drawing is shown to everyone or no one, so one player left out hides it. Locations only ever changes the drawing's *hidden* setting, never its line or text (the card warns when a drawing has text). Foundry still sends hidden drawings' data to every client, like any hidden document, so a drawing must hold nothing secret.
- **Party marker** follows the linked line (when it is a simple, unrotated line on the marker's scene) instead of going straight between the pins.
- **Deleting a route** with a drawing asks: *Delete Route, Keep Drawing* or *Delete Route and Drawing*. Nothing else ever deletes a drawing.
- Saved data: additive (`drawingUuid` on routes; world-local, never exported, kept by re-import). API: new `routeDrawing`, `linkRouteDrawing`, `unlinkRouteDrawing`, `drawRoute`; `deleteRoute(id, {deleteDrawing})`.

## 1.11.0 — 2026-10-20

- **Journeys (GM).** On a saved route, **Start journey** (From → To, or To → From unless the route is one-way). The party marker sits on the start pin. **Next leg** travels one leg and rolls d100 against the current hazard chance:
  - no hazard: the chance doubles for the next leg (at most 100%);
  - hazard: the route's hazard table is rolled (or the result is just "Hazard!" when it has none or the table is missing), whispered to the GM and shown in the Journey card with **Reroll**, **Dismiss** and **Share with players** (posts the result to chat with no route or place names). The chance goes back to the route's base chance. The next leg waits until the hazard is dismissed or shared.
  - Every journey starts at the base chance. Example with 25%: 25, 50, 100 (so leg 3 is certain), then back to 25 after the hazard.
- **Arrival:** after the last leg the marker moves to the destination pin and the trip ("Travel: From → To, N km, N legs, N hazards.") is added to the destination's **Party Notes** through the existing GM Party Notes path. A place the readers of those notes cannot see is written as "an unknown place". If someone is editing those notes, the journey says so and **Retry log** adds it later.
- **Turn back** (the legs travelled become the legs back; not on one-way routes) and **Abort journey** (asks first; writes nothing to Party Notes).
- **Party marker:** a Map Note ("Party") on the scene you are viewing if it holds both route pins, otherwise the first scene that does, placed between the pins in proportion to the legs travelled. Double-clicking it opens the Routes tab.
- **Players** see the marker and "The party is travelling from A to B: leg 3 of 4" (an end they may not all see is left out). Never the hazard chance, the rolls or a hazard the GM has not shared. Enforced in the data layer: the progress page carries nothing else.
- Saved data: additive (`travel` on the GM Data Journal: the journey, the party's location and the last 20 journeys; a "Party" page in the Routes Journal). Route re-import never touches a journey. API: new `getJourney`, `startJourney`, `nextLeg`, `rerollHazard`, `dismissHazard`, `shareHazard`, `reverseJourney`, `abortJourney`, `retryTravelLog`. Hooks for later (not used yet): `ashenGateLocations.journeyStart`, `.journeyLeg`, `.journeyArrived` (GM client), e.g. for a campaign clock or a per-leg group check.
- Not in this version yet: linking routes to map drawings (the marker moves in a straight line between pins).

## 1.10.0 — 2026-10-20

- **Routes between locations (point-crawl, GM).** New **Routes** tab: join two locations, pick From and To by name, set the distance in km and, optionally, this route's own leg length (otherwise the world default from GM Setup → *Routes*, 10 km to start). Legs = distance ÷ leg length, rounded up. Optional name, one-way, terrain, hazard table (a world Roll Table; a missing one falls back to "Hazard!") and base hazard chance (10% to start), and GM notes. Search, grouped by discovery; Delete asks first.
- **Stable route ids.** Each route gets an `RTE-*` id from its two ends on first save. It never changes and is never reused, even after a delete (import refuses a deleted route's id too).
- **Discovery and visibility.** Unknown (new routes; players get nothing), Rumoured, Known, Explored. A player sees a discovered route only while both ends are visible to them and they are in the route's **Who Can See It** (Everyone or Selected players). Optional per route: show an unnamed "Unknown path" from the one end a player can see. Players never get the hazard chance, table, GM notes, the route id, or anything of a place they cannot see. Enforced in the data layer: route pages are readable only by the players each version is for; every route write is GM-only in the API.
- **Players** get a read-only **Routes** tab once a route is visible to them (ends, km, legs, terrain).
- **Import / export.** Route records (`entity_type: "Route"`) go in the same `ag-foundry-import/0.2` package, after the locations they join; per-record problems (missing endpoint, duplicate id, bad numbers) are reported. Re-import keeps existing routes; update mode keeps discovery state and audience. Schema: `docs/routes-schema.md`.
- Saved data: additive (`routes` and `routeIds` on the GM Data Journal, a new *Locations (Routes)* Journal). No migration. API: new `listRoutes`, `getRoute`, `saveRoute`, `setRouteState`, `setRouteAudience`, `deleteRoute`, `importRoutes`, `ROUTE_STATES`; `importPackage` also reports `routes`, `exportPackage` includes routes. Existing calls keep their shapes.
- Not in this version yet: journeys (Next leg, hazard rolls), the party marker, and linking routes to map drawings.

## 1.9.0 — 2026-10-19

- **Exotic materials on gathering nodes (optional, GM only).** Each node in *Gathering Resources* has an *Exotic materials* row. Pick an Exotic from the imported catalog by name (no ids to type), then choose its rule:
  - **Random discovery:** the Profession Ledger may find it on a successful check, at its discovery chance (default 2%).
  - **Designated source:** its own chance (required) and condition (any success, or success by 5+ only), used instead of the discovery roll.
  - Adding one makes it eligible, not a sure award; the Ledger (0.15.0+) decides when gathering.
  - Draft or GM-only Exotics are listed but disabled, with the fix (e.g. "Draft: approve it in General Manager first"). The Ledger awards only approved, player-visible materials.
  - With the Ledger active, the list shows only Exotics gathered by the node's profession with a tier not above the node's, and each entry shows whether it is eligible. Without the Ledger, every imported Exotic-quality material is listed.
- **Players never see Exotic candidates:** they are not in the player view, the published Journal page, or `resourcesAt` for players.
- **Tier DC defaults are now 10 / 12 / 15 / 18 / 20**, the same as the Ledger (a test keeps them equal).
  - DCs already saved on nodes are not changed.
  - Changing a node's tier moves its DC when it was a tier default (old or new table); a custom DC stays.
- Saved data: nodes gain an additive `exotics` list (empty for existing nodes). It goes through export/import. `resourcesAt` for the GM gains `exotics`; nothing else in the API changed. No migration needed.

## 1.8.1 — 2026-10-19

- **Faster Save and Publish with many locations.** Building the player views no longer re-reads the whole list for every location, so saving 500 locations drops from about 1.4 s to about 0.1 s of module work (measured with the mocked Foundry layer), and a save that changes nothing no longer rewrites the GM data record.
- **Deadly-threat badge** text is now dark on the red fill instead of white, so it is readable.
- **Saved data:** no changes. No API changes. Benchmark: `node tests/bench/locations-bench.mjs`.

## 1.8.0 — 2026-10-19

- **Region inheritance is now off by default.** A Region passes its Conditions to the places inside it only when you tick **Pass conditions to places inside** (shown under *This is a Region*). A place's inherited-conditions list appears only when a Region above it has this on. **Existing worlds:** on the GM's first login, every Region that was already passing conditions (it has conditions and places inside it) is switched on, so nothing changes, and a notice lists them; all others are off. Re-running changes nothing.
- **Tree (folders).** A **Tree** button beside *Group by* shows locations inside their Regions as folders to any depth (e.g. Overworld › Frontier › Town › Muster › Guildhall), with counts (directly · in total), Expand all / Collapse all, open folders remembered while the game is open, **+** on a folder to create a place inside it, drag onto a folder to move (loops refused) with **Undo**, **Move to…** on the card for the keyboard, and a breadcrumb path on the card. Filters and search still apply and keep the folders leading to each match. Players' list nests the places they can see under the visible places they are in; a place they cannot see is never named (unidentified ones show their label).
- **Who Can See It: Everyone or Selected players.** Only the ticked players get the card, its pins (Foundry's own Note permissions, through per-player page ownership), its Party Notes and its quest links; for everyone else it is exactly like Hidden. Players who can see it can **Share with…** other players (adds only, needs a GM connected); the card shows "shared by" and you untick to undo. Sharing can be turned off per location. Existing locations stay *Everyone*.
- **Placeable on a map.** New checkbox (on for places, off for Regions). Place on Scene and dragging onto the map offer only placeable locations unless you tick **Show representative-only too**; a place that already has a pin always shows it on its card. New **Placeable** filter.
- **Saved data:** additive (`passConditions`, `placeable`, `audience`), plus the re-runnable inheritance migration above. Player pages now name each player in their ownership. Export/import carry the new fields. API: new `moveLocation`, `getAudience`, `setAudience`, `shareLocation`, `pinsOf`, and `listLocations({placeableOnly})`; existing calls keep their shapes.

## 1.7.0 — 2026-10-19

- **Party Notes save without a GM connected.** Players can now Edit and Save Party Notes when no GM is logged in. The same rules apply: one editor at a time (the lock lapses after 2 minutes idle), and a save based on an older copy is refused with your text kept in the box. If two players hit Edit or Save at the very same moment, one wins and the other is told so.
- **How:** a new *Locations (Shared Notes)* Journal holds one generic "Party Notes" page per location players can see (Revealed or Unidentified), keyed by pin key only: no LOC ids, names or GM data. Players own those pages, so they can write them directly. A Hidden location's page is blanked and closed to players (its notes are kept in the GM-only *Locations (Party Notes)* Journal first), so players can neither read nor write it.
- **When a GM connects** (and whenever a player saves while a GM is on) the GM's client reconciles: players' saves move into the GM store. If both sides changed, the newer text wins and the older one is kept below it under a "----- Earlier version …" divider; nothing is dropped. With a GM online, saves still go through the GM's client as before, and the GM can still Take Over and Clear.
- Trade-off (agreed): a player who knows the browser console could edit the Party Notes of a location they can already see.
- **Saved data:** additive. On the GM's first login after updating, the shared Journal is created and existing notes are copied into it; nothing is deleted. Re-running changes nothing. No API changes.

## 1.6.1 — 2026-10-19

- **Location Builder list: real filters, sort and search (GM).**
  - **Filters** (all combine): Threat, Region, Profession (a location matches any of its professions), Quest (any / has linked quest / no quest / a specific quest) and Status (Hidden / Unidentified / Revealed / Unpublished edits). Each dropdown shows counts. **Clear filters** resets them and the search; **Showing N of M** is always visible.
  - **Sort by** Name, Threat, Region then name, Gathering nodes or Status, with a direction button.
  - **Group by** None, Region, Threat, Gathering profession or Quest. Groups still fold and show counts.
  - **Search** now also matches threat, gathering skills and node names, material names and linked quest names (several words must all match), so "Herbalism" finds locations with Herbalism nodes.
  - Removed the "Show only one group" toggle (filters replace it). When nothing matches the list says so with a Clear filters button, and the open location stays selected.
- Players' list is unchanged. No saved-data changes.

## 1.6.0 — 2026-10-19

- **New threat levels: Settled and Light.** The list now runs Settled, Light, Normal, Hot, Deadly (safest to most dangerous). Existing locations keep their value.
- **Location Builder list (GM):** every group shows how many locations it holds and folds with a click. **Group by** Region, Threat level or Gathering profession (a location with nodes for several professions appears under each). Locations are sorted by name inside each group.
- **Show only one group:** turn it on, then click a group heading to hide everything else; click it again to show all.
- Players' list is unchanged (revealed places, grouped by region).
- No saved-data changes.

## 1.5.2 — 2026-10-19

- **Fixed: the window going blank.** Pressing Tab out of a new detail's title, or clicking an eye (reveal) icon, scrolled the whole window out of view (the hidden checkbox behind each eye was not anchored to its label). Closing and reopening only brought it back. Fixed in the stylesheet.
- If the window ever fails to draw, it now shows the error inside the window with a **Retry** button (and logs it to the console) instead of an empty window. Your unsaved edits stay in memory.
- **Fixed: Link a quest picker.** The GM's picker lists every Quest, Order and Contract from Quest Log whatever its reveal status, marking Hidden and draft ones, e.g. "Hidden · draft". If Quest Log's full list can't be read, it falls back to visible quests and logs why to the console instead of showing an empty picker. Players still see only what Quest Log lets them see. (Quest Log 0.6.1 adds the draft label.)
- No saved-data changes.

## 1.5.1 — 2026-10-19

- Actors launcher joins the shared two-column grid in the fixed order. GM-only Location Builder button in the Items sidebar now sits beside General Manager (Manager first, Locations second) in a tidy grid. No saved-data changes. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 1.5.0 — 2026-10-19

Nested point-crawl, part 3 of 3: shared Party Notes.

- **Party Notes.** Every location players can see (Revealed, or Unidentified by its label) has a **Party Notes** card that the whole party reads and edits together. It is separate from your own *Notes* section and clearly labelled.
- **One editor at a time.** **Edit** takes a lock; everyone else sees "*name* is editing" and can still read. **Save Notes** or **Cancel** releases it, and it lapses after 2 minutes without typing or when that player disconnects. Each save carries the version it started from, so a save based on an older copy is refused with a message and the text stays in the box. Everyone's window updates live.
- **GM:** sees Party Notes on every location (hidden ones too), can edit, **Take Over** from a player, and **Clear** (with a confirmation).
- **Secure write path.** Players get no new permissions on any document. They ask the primary GM's client over the module socket (`"socket": true`), which checks the sender, Player Access, that the location is visible to players, the lock and the version before writing. Hidden, unknown and made-up locations all get the same refusal. A GM must be connected for players to save; reading works without one.
- **Campaign state, not definition.** Stored in a new *Locations (Party Notes)* Journal (no player permission) keyed by `LOC-*` id; each visible location's player page carries a copy keyed by pin key only. Save Changes, Publish, reveal changes, imports (Manager or Import JSON), Map Note changes and deleting + re-importing a location never lose them. Hiding a location removes the copy from its player page; the notes come back when it is visible again. Exports leave them out.
- Additive only: no change to location records, pages' existing flags or exports, and no migration. Plain text, capped at 20,000 characters, always escaped on display.
- API: `getPartyNotes`, `editPartyNotes`, `savePartyNotes`, `releasePartyNotes`, GM-only `clearPartyNotes`, `PARTY_NOTES`. Existing calls are unchanged.

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
