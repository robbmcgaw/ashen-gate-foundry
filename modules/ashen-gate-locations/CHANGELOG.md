## 0.26.0 — 2026-10-28

New: **select several locations, then Archive or Delete them together** (GM only). Built for trimming the world after Manager brought in places you moved to the reserve pack.

- **Select** (toolbar) shows a tick box on every row. **Select all N shown** takes whatever the list shows now, so narrow it first with the **Region** filter, the other Filters, the search box, or the new **Id starts with** box (for example `LOC-FRONTIER-`; the only place an id is typed). The bar above the list counts *selected* and *shown*.
- **Archive…** shows exactly which locations it will archive, then takes them off the list and out of players' sight (as if Hidden). Nothing is lost: content, state, audience, Party Notes and map pins are kept; the pins stay on the scene for you and are closed to players. **Undo** appears for 30 seconds. **Archived (n)** (toolbar) lists them; tick some and **Restore…** them with the state they had (none becomes active).
- **Delete…** is permanent: a preview, a one-click **JSON backup** of exactly those locations (the same file Export writes; Import brings them back), then **Delete N locations** (red, Cancel is the default). A location with places inside it can only be deleted together with them; the window offers to add them. Map Notes this module placed are removed; Notes whose image or size you changed by hand are kept and listed. Party Notes stay stored and return if the same id is imported again.
- **Imports:** an archived location stays archived when it is imported again (an `update` import still refreshes its definition; a package can never archive or restore anything). Manager's refresh can restore with `importLocations(records, {mode, unarchive: true})`; nothing in Manager calls that today. A *deleted* location is created again by any pack Manager imports that still contains it, so use Archive for places you want to keep out.
- General Manager's sync can call `archiveLocations(ids, {source: 'ashen-gate-manager', reason})` → `{archived, alreadyArchived, skipped: [{id, reason}]}` and `restoreLocations(ids, {source})`. A call from a source other than the window skips a location whose places inside are not in the same list, with reason `has-children`; Party Notes, state and pins are kept.
- Unsaved edits: archiving or deleting the location open in the editor asks first (Keep editing is the default).
- API (GM only, refused for players in the API itself): `previewBulk`, `archiveLocations`, `restoreLocations`, `deleteLocations`, `idsWithPrefix`, `countArchived`, `listLocations({archived})`, `exportPackage({ids})`, `importLocations(…, {unarchive})`. Archived locations are left out of the default `listLocations`, `activeLocations`, `childrenOf`, `locationsForQuest`, `locationsWithMaterial` and `nodesForMaterial`. The one-at-a-time **Delete location** button in the editor is unchanged.
- Tests use mocked Foundry; they do not render the real window. Nothing saved is rewritten: existing records simply have no `archived` flag.

## 0.25.1 — 2026-10-28

Changed: the GM **Locations** button now sits in the **Scenes** sidebar instead of the Items sidebar.

- As GM, open the Scenes tab: **Locations** is in the Ashen Gate shelf above the search bar. The Items sidebar no longer shows it (General Manager's button stays there).
- Players are unaffected: the player-facing Locations button in the Actors sidebar (Player Access) is unchanged, and players never see a button in Scenes.
- Nothing saved changes. Tests use mocked Foundry; they do not render the real sidebar.

## 0.25.0 — 2026-10-28

New: **Default pin for places inside this one** (Region-level pin art).

- In the editor, **Visibility & map → Unidentified Marker & Pin**, any place has *Default pin image (revealed)*, *Default pin image (hidden / unidentified)* and *Default pin size*. Every place inside it, at any depth, uses them when it has none of its own. Order: the place's own value, then the nearest place above it that sets one (each of the three is looked up separately), then GM Setup's *Default unidentified pin image*, then Foundry's built-in icons. A place's own value is never changed.
- The empty boxes now show what the place would use (including what it inherits). Draft and **Save Changes** as before, with the usual *Unsaved changes* guard.
- Placed pins refresh when you save, like any other pin change. A Note whose image or size you changed by hand in Foundry's Note settings is left alone, as before.
- GM only: saved with the location, not published, never in a player view or page. Players still get just the pin image on the Note they already see. Old locations simply have no default (no migration, nothing rewritten). Export and import round-trip it; an update import that leaves it out keeps the world's value.
- API: GM `effectivePin(idOrPinKey)` returns the resolved image, hidden image and size and where each came from. A missing parent or a parent loop ends the lookup without hanging.
- Tests use mocked Foundry; they do not render the canvas or the editor in a real browser.

## 0.24.1 — 2026-10-28

New: **Name distance from the pin** (GM Setup → Map Pins), for the name under a map pin.

- Whole pixels, −40 to 40, default 0 (Foundry's own position, so nothing changes until you set it). **Negative numbers move the name closer to the pin.** Foundry leaves a 12 px gap between the pin's edge and the label's box, and the label box itself has room above the letters (line spacing plus the outline), so the visible gap is larger than 12 px; **−8 is a good starting value**, then adjust. The name never goes past the pin's edge.
- Works with Pin look *Image only*, any icon size and any text anchor, in both *Always shown* and *Only when hovering*. Display only: the Note's own text anchor and settings are never written, and the position is recalculated from Foundry's rule on every refresh, so it does not drift.
- Tests use mocked Foundry; they do not render the canvas.

## 0.24.0 — 2026-10-28

New: **Active locations**, where the party is now.

- **Editor head: Active / Not active** (GM). One click, applies at once: no Save, no Publish, and it never touches unsaved edits. Several locations can be active (a Region being active implies nothing for the places inside it). New and existing locations start Not active; an import never switches one on.
- **Players** see a *Here now* badge on an active place they can see, in their list (active places come first) and in the viewer, and get "The party is now at <name>." (an Unidentified place uses its unidentified label; a Selected-players place goes only to those players). Hidden places are never shown or counted.
- **A Hidden location** asks **Reveal and make active?** first; it is never revealed silently. Making a place Hidden again clears Active.
- **GM list:** an *Active* badge on rows and **Filters → Status → Active (n)**.
- **For other modules:** `setLocationActive(ref, bool)` (GM), `activeLocations()`, `isLocationActive(ref)` and the hook `ashen-gate-locations.activeChanged`, fired on every client with `{keys, added, removed}`. See the README API table. The Profession Ledger reads a place's gathering nodes with `resourcesAt(key)`.
- Active is live state like Revealed, stored on the location and carried in the player view, not part of the published content. No migration: locations without it read Not active. Tests use mocked Foundry.

## 0.23.0 — 2026-10-28

New: **Show to Players**. The GM opens a location in everyone else's Locations window.

- **Where:** the location editor's head, beside Place on Scene (GM only, shown for saved locations). Press **Show to Players**: every other connected client who may see that location gets its Locations window opened on it, like Foundry's own Show to Players for journals. You get "Shown to N players", or a note that nobody who can see it is connected.
- **Who sees what:** Revealed and Unidentified locations only (an unidentified one opens its unidentified card and label, never the name); a Selected-players location goes only to those players. A **Hidden** location asks **Reveal and show** first and is never revealed silently. Each player's client checks again with the module's own player view and opens nothing if it would not show them the location.
- **On the player's side:** the one window switches to the location (no second window) and comes to the front. It does not take keyboard focus from a field the player is typing in, and a player with unsaved Party Notes is not interrupted (they get "The GM is showing …"). The same location shown twice within a second opens once.
- **GM Setup → Show to Players:** "Players' windows open automatically when the GM shows a location" (on by default). Off: players get only the notification.
- Uses the module's existing socket (the same channel as Party Notes and Share with…); the message carries only the location's pin key. Only a GM's message is accepted. No world data is written, so there is no migration. New API: `showToPlayers(ref)` (GM).
- Tests use mocked Foundry; they do not prove the real socket or window.

## 0.22.2 — 2026-10-28

New: **Wrap the name after (characters)** for the name under a map pin.

- **GM Setup → Map Pins → Wrap the name after (characters):** a whole number, 6 to 60, or 0 for no wrapping (the default, so nothing changes until you set it). Longer names break between words, centred under the pin; a single word longer than the limit is cut. Saved with **Save Changes** and applied on every screen at once; set it back to 0 and the name is one line again.
- **Name under the pin** is now a choice, **Always shown** or **Only when hovering** (Foundry's own behaviour, the default for a fresh world), instead of a checkbox. A world that had the old box ticked reads as Always shown, and unticked as Only when hovering; the old saved value is kept, not rewritten. **Name size, outline and Wrap apply in both modes** whenever a pin's name is shown, so with *Only when hovering* the hover label is now also drawn at the Name size (default 14) rather than Foundry's 32; set the pin's own Font Size to override.
- Only the label drawn on the map is wrapped. The location's name and the Note's own text are never changed or written. The unidentified label wraps the same way, and a hidden pin still shows no name.
- Tests use mocked Foundry; they do not render the canvas.

## 0.22.1 — 2026-10-28

Player Preview shows only the card for the location's current state.

- **Before:** it always showed both Unidentified and Revealed, which read as noise. **Now:** one card, for the state the location is in (Hidden shows "Hidden: players see nothing.", and says its map pins are invisible to them when the location is placeable). Selected-players locations show the same view and the same list of who sees it, as before.
- **Also show the other states** (a checkbox at the bottom of the preview, off by default) shows the other states' cards as before, with **(current)** on the current one. It changes in place without reopening the dialog, and Locations remembers your choice on this computer.
- Display only: what players actually see is unchanged, and nothing is saved by previewing. Tests use mocked Foundry. Check in Forge: Locations > open a location > Player Preview.

## 0.22.0 — 2026-10-28

New: **Name size** for the name under a map pin.

- **GM Setup → Map Pins → Name size (pixels):** 8 to 48, default 14, saved with **Save Changes** and applied on every screen at once. It sets the pin name's size when *Show the name under the pin* is on; the outline and shadow scale with it so a small name stays readable. Before, the name used Foundry's Note default of 32.
- **Per pin:** activate the Notes layer, right-click or double-click the note, and set **Font Size** in its configuration. A Font Size other than Foundry's default 32 overrides the module setting for that pin.
- Display only: no Note is written and nothing needs migrating. Pin look and Show the name work as before.
- Tests use mocked Foundry; they do not render the canvas.

## 0.21.0 — 2026-10-28

New: **Pin look**. Map pins from Locations can be drawn as just their image, with the name under them.

- **GM Setup → Map Pins → Pin look:** *Framed (Foundry default)* (as before, and the default) or *Image only*, which hides Foundry's square and shaded backing around the pin image. While you hover or select an Image-only pin the frame comes back, so you can see what you are about to drag. Pins stay clickable and draggable, and double-click still opens the location.
- **Show the name under the pin:** keeps the pin's name visible instead of only on hover, with a heavier outline and a soft shadow so it reads on a busy map. A hidden pin never shows a name, an unidentified pin shows only its unidentified label, and a Selected-players pin shows its page name only to the players who can see it, exactly as before.
- Both are world settings saved with **Save Changes**, and apply on every player's screen at once. They touch only pins placed from Locations (Notes carrying a location pin key); other Map Notes are not changed.
- No change to saved data and no migration: nothing on the map is rewritten, a pin's own image, size and text anchor keep working, and switching back restores the framed look.
- Tests use mocked Foundry; they do not render the canvas. Check in Forge: see the click-steps in the pull request.

## 0.20.7 — 2026-10-26

Keyboard and narrow-window fixes (shared kit 2.4.0).

- **What players see** (Hidden / Unidentified / Revealed) is now a group of pressed buttons, not a radio group: each choice saves, asks and publishes, so the arrow keys must not step through it. Tab to a button and press Enter or Space, as before.
- **A narrow window no longer scrolls a list inside the page.** When the list and the editor stack, the list takes its natural height and the window scrolls once. Side by side (wider windows) the list and the editor keep their own scroll.
- **Stacked list and editor: picking a row brings the editor into view.** In a narrow window, picking a row (or creating a new one) scrolls to the editor and moves focus to its heading, and a **Back to list** button at its top (shown only while stacked) scrolls back to the selected row and focuses it. Wide windows are unchanged; scrolling is instant under reduced motion.
- **Tab rows that scroll sideways now show it.** When tabs are cut off at the edge of a narrow window, that edge fades out, and the selected tab is scrolled into view when the window opens (before, the last tabs, such as GM Setup, could be hidden with no sign that more existed). Arrow keys and Tab bring a hidden tab into view. Nothing animates.
- No change to saved data. Check in Forge: open Locations > a location. Make the window narrow (about 600 px or less): the place list is full length with no scroll box of its own, and one scroll bar moves the whole page. In GM Setup or Locations, narrow the window until a tab is cut off: its edge fades.

## 0.20.6 — 2026-10-26

Fix: in Tree view, places nested four or five levels deep had their names squeezed to a few letters per line.

- **Why:** each level indented 12px and the badge and counts stayed beside the name, so at depth four (Overworld › Frontier › Town › Muster › Guildhall) the name was 25 to 66px wide and broke mid-word ("[TEST] / Mus / ter"). From the third level down the indent is smaller, and the badge and counts drop under the name when the row is tight. Measured in a headless browser with that five-level example: every name is one line, 103 to 157px wide.
- Presentation only: no saved data changes. Check in Forge: Locations > Tree with places five levels deep; every name reads on one line.

## 0.20.5 — 2026-10-26

Internal: the **Ashen Gate / Locations** Journal folder is now found or created with the shared race-safe folder helper, so Locations and another Ashen Gate module starting at the same moment cannot make two **Ashen Gate** folders. Nothing moves and no saved data changes.

## 0.20.4 — 2026-10-26

Locations ignores Manager bulk writes (Sync, Import) while they run and redraws once when they finish. No change to saved data.

## 0.20.3 — 2026-10-24

- Shared UI kit 2.3.0 (id helpers and the record picker, used by Quest Log first). No change to how this module looks or works.
- Saved data: no change; no migration.

## 0.20.2 — 2026-10-24

**Canonical ids and machine tokens are no longer shown.** Nobody sees `LOC-*`, `MAT-*`, `NODE-*` or `QUEST-*` text in Locations any more, GM included. Status words from other modules (such as `reveal_gated`) are shown as plain words ("Reveal gated") in the GM's quest and material pickers; players never see them.

- The editor's ID line is now a **Details** fold under the place's name, with **Copy id**. It is the only place an id appears.
- A material on a gathering node is picked **by name** from a list (it was a text box that showed `MAT-*`). A saved material the world no longer has reads "Unknown material".
- A quest, place, scene, material or node template that can no longer be found reads "Unknown quest", "Deleted location", "Linked scene (missing)", "Unknown material" or "This node template no longer exists" instead of its id. Error and notice messages name places by their name (or say "No location found with that reference.").
- A node with no name and a material shows "Resource" to players instead of the material id. Search by id still matches; it just is not displayed.
- Saved data, ids, API calls and export files: unchanged. No migration.

## 0.20.1 — 2026-10-23

QA pass at sandbox volume (about 110 places across the main and sandbox packs, 100+ gathering entries).

- **Fixed:** gathering entries that refer to a Profession Ledger node template carry no skill or name of their own, so the GM list's **search**, **Profession** filter and **Group by Gathering profession** found none of them (every entry in the sandbox sites is such a reference). The list now reads the template's activity and name (a copy used for the list only; nothing is saved). Without the Ledger the list behaves as before.
- **Group by Reveal status** (Hidden, Unidentified, Revealed) in the list's Filters row, to see at a glance what is still hidden.
- **Checked, no change needed:** the S01 and S10 Location files import with no errors or skips (59 places, 106 gathering entries; with the main pack's L01 and L02 first, every parent resolves); the list, tree, search and filters stay fast at this size. Saved data: unchanged. No migration.

## 0.20.0 — 2026-10-22

**Routes retired.** Routes were finicky in play, so they are gone. A road, river or pass is now just a location whose **Type** is *Route*: a container for hazards, loot, gathering resources and roll tables. It is not linked to other locations (plain parent/child, no ends, nothing drawn on the map). When the party travels, the GM rules and rolls.

- **Removed:** the Routes tab (GM and players), the route editor and cards, legs and hazard chance, journeys (Start / Next leg / Pause / Resume / End journey), the Travel tracker window and its Token-controls button, Foraging/Navigation checks, night watches and pace, the journey-driven party marker, route map drawings, the journey strip in the Character Hub embed, and GM Setup's leg length. Their API calls are gone too (see the README).
- **New on every location** (*Content* sub-tab): **Hazards** (name, note, optional Roll Table; **Add hazard…**, **Edit…**, **Remove**, **Open table**, **Roll**) and **Roll Tables** (link or drop a table; **Roll** draws it to chat, GM only). Both are GM only until you show an entry with its 👁; players see a shown entry after **Publish**, while the place is revealed, and never a hazard's table. Enforced in the API as well as hidden in the window.
- **Type** suggests *Route* (and the types already in use); any text is still allowed.
- **What to do with old routes:** nothing is deleted. Your routes, route ids and journey stay in the world, untouched and unused. **GM Setup → Developer Tools → Convert routes to locations…** (shown only while the world has stored routes) previews, then makes one Hidden *Route* location per route, with a new `LOC-*` id, inside the start location's parent (or inside the start location at the top level), the old hazard table as a GM-only roll table and a GM-only hazard with the route's GM notes. It never converts a route twice and never changes the stored route. Leftovers you can delete by hand if you like: the *Locations (Routes)* Journal, the party marker Map Note (it now opens nothing) and any route drawing.
- **Import/export:** locations carry `hazards` and `rollTables` (ids kept; `roll_tables` is read too). A Route record no longer fails a file: it is skipped with "Routes are retired; make a location with type Route instead." and the file's locations still import. Export no longer writes Route records.
- Saved data: additive (`hazards`, `rollTables`, `convertedFromRoute`; older locations read with none). The route settings are no longer registered; their stored values stay. No migration.

## 0.19.0 — 2026-10-22

UI cleanup from the October UI audit (no new mechanics).

- **Location editor sub-tabs:** **Content** (type, region, threat, image and the blocks), **Visibility & map** (*Who Can See It*, *Place*, *Unidentified Marker & Pin*, *Linked Scenes*) and **Party Notes**, under one footer. Switching keeps unsaved edits and is remembered per user. The image is a thumbnail beside its field. **Place on Scene** moved from the footer to the editor head, next to **Move to…** and **Delete location**.
- **Applies now:** *Who Can See It* (locations and routes), *Map Drawing* and *Journey* carry an **Applies now** badge; everything else waits for **Save Changes**.
- **Save first, never silently:** Place on Scene, a location or route state change, Start journey, Link selected drawing and Draw for me now ask **Save and …** / **Keep editing** when there are unsaved edits. Discard questions use the shared guard (Keep editing is the default).
- **Toolbar:** one row (search · **Filters (n)** · **Tree** · count · Import… · Export · New location). The filters, Sort, Group by and *Show representative-only too* open in a second row from **Filters**; it remembers whether it was open. **Import…** is a real button.
- **Gathering nodes:** each node is one summary row (name, skill, tier, DC, status, Mark exhausted/Restore, tools); materials, availability, note and Exotic materials sit in an **Edit node** fold (open for a node you just added). **Add node…** asks *From template* or *Custom* (straight to Custom without the Profession Ledger).
- **Routes:** the route editor has **Route** and **Journey** sub-tabs; the journey banner's **Open** goes to Journey. The unknown-path switch reads "Show "Unknown path" from the visible end" with the rest as a hint.
- **Players** always see the **Routes** tab (an empty state until a route is revealed), so the tab bar no longer changes mid-session. Party Notes buttons read **Save Party Notes** / **Cancel notes edit**.
- **Keyboard and screen readers:** place, quest, document, crumb and route-end links are real buttons; status icons (state, Region, representative-only, selected players, unpublished, route state, broken endpoint) carry text; tab rows use arrow keys; repeated entry tools name their entry ("Remove [TEST] Faction A"); the Travel tracker strip names its hazard legs and marks them with an icon; hazard cards no longer re-announce as alerts; search waits for a pause in typing.
- **Confirmations:** Delete location, Delete route, Clear Party Notes and End journey default to Cancel; Hidden → Unidentified asks first (**Make unidentified**); hazard **Dismiss** says players never learn of it.
- **Smaller fixes:** long switch labels wrap instead of clipping; in-card empty text is a hint line; kit meter for the tracker's long-route bar and the Character Hub embed; kit search box and empty states in the embed; kit card heads and form grid; Travel tracker footer puts End journey on the left; Help is grouped by topic; the Items sidebar launcher is called **Locations**; "Quest Manager" reads "Quest Log" in Locations' messages; Developer Tools says it runs at once.
- Saved data: unchanged. No migration. Linked Scenes keeps its place in a location's stored block order (it is GM-only and never shown to players).

## 0.18.1 — 2026-10-22

- Shared UI kit 2.2 (no visible change).

## 0.18.0 — 2026-10-22

- Version renumbered from 1.18.0 to 0.18.0. Foundry will not offer this as an update because the number is lower: uninstall and reinstall Locations from its manifest URL (`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-locations/module.json`); your world data is kept (it lives in the world, not the module).
- No other change: 0.18.0 is the same code as 1.18.0. The entries below keep their old 1.x numbers.
- Other Ashen Gate modules detect Locations features by its API, not its version number, so they keep working with 0.18.0 (General Manager 0.45.1 stopped comparing Locations versions in its Pre-session check).
- Saved data: unchanged. No migration.

## 1.18.0 — 2026-10-22

- **Node templates (Profession Ledger 0.25.0+):** under *Gathering Resources*, choose a node template (grouped by activity) and click **Add node**. The entry stores only a reference (`nodeId: 'NODE-…'`) plus what belongs to the place: its name here, tier (inside the template's range), DC, whether players see the DC, finite, available and a note. Leave a field blank / on *Template* to use the template's value. The template's name, activity, tier range and materials are shown read only; **Gathering Nodes** / **Open in Ledger** opens the Ledger's Gathering Nodes tab to edit them.
- A template that has been deleted never breaks the Location: the entry shows "Node template NODE-… no longer exists" and keeps its data. Without the Ledger (or if it refuses the GM-only call) the editor shows the custom-node entry as before, with a note.
- **Players** see a referenced node in the Ledger's player shape (`templates.playerView`): name, activity, tier, the first common/rare material and quantity, finite and play state. Never chances, Exotic candidates, the template's note or a DC that is not shown. The player page is rebuilt from the template whenever Locations writes it (Save, Publish, exhaust).
- **Hunting:** "Skinning & Harvesting" and "Hunting/Skinning" read as *Hunting* everywhere in Locations (skill list, editor, cards, player pages). Stored values are migrated on read; a record is only rewritten when you next save it. Imports are not rewritten.
- Import/export and General Manager's hand-off carry `nodeId` entries unchanged; `scripts/validate-content.mjs` checks them (a NODE-* id, no inline materials on a reference).
- Saved data: additive. Entries without `nodeId` read exactly as before. No migration.

## 1.17.4 — 2026-10-21

- Character Hub level-up backups (the GM-only "<Name> - level X" copies) no longer appear in the night-watch list, with or without a Primary Party, and the API refuses one as a watch. Players never see a backup's name in the watch order.
- Saved data: no change. No migration.

## 1.17.3 — 2026-10-21

- **Loot & Rewards and Resources** use the shared item-drop helper (`ag-item-drop/1`, same file as Quest Log). A folder now says "Drop items one at a time.", a journal or Actor says "Drop an item.", and a missing item says so. Before, these drops did nothing.
- A dropped loot Item also stores its permanent id (`itemId`) when it has one. Loot is still only a link: nothing is created, copied or given.
- Notes, faction and detail drops still accept any document they did before, and now warn when the document is missing instead of doing nothing.
- No saved-data migration: `itemId` is optional; older loot entries read as `null`.

## 1.17.2 — 2026-10-21

- Repo check only: the Player Preview window (a custom dialog with the kit classes) is marked as allowed for the stricter UI lint.
- No behaviour or saved-data changes.

## 1.17.1 — 2026-10-21

- Shared UI kit 2.1.0 and dialog helper: choice dialogs follow the Ashen Gate look (Cancel on the left, the choices on the right); red buttons, badges and grey text on selected or striped rows are easier to read in every skin (at least 4.5:1); a hidden empty state stays hidden; disabled list rows keep readable text.
- Deleting a route that has a map drawing asks in the shared choice dialog: Cancel, **Delete route, keep drawing** or **Delete route and drawing** (both red). Same results as before.
- Screen-reader labels use the kit helper (no local copy).
- No behaviour or saved-data changes.

## 1.17.0 — 2026-10-21

- **UI standard look** (same layout): header reads *Ashen Gate | Locations* with the version and Help on the right; tabs scroll sideways on narrow windows, GM Setup last and marked GM.
- **Toolbar:** search, filters (inline), count, then Import / Export and a plain **New location** on the right. Tree is a toggle chip.
- **Lists:** compact kit rows (no double padding); groups still fold and show counts. Threat badges use the kit colours; Deadly is a solid red fill.
- **Editors:** Cancel bottom-left, Save Changes bottom-right (the only gold button). **Delete location** / **Delete route** moved to the top of the editor, away from Cancel. Marker state and route discovery are segmented controls.
- **GM Setup:** settings only, one **Save Changes** for Player Access, Unidentified Pins and the default leg length (Player Access no longer saves the moment you tick it). Cancel puts the fields back. Import/Export moved to the Locations toolbar; Developer Tools is a collapsed section at the end.
- **Travel tracker:** same header style; the night-watch table is a striped kit table; opacity slider unchanged. A disabled Roll button says why under it.
- Foundry tooltips replace native hover text; icon-only buttons have labels. Comfortable size (General Manager → My Appearance) opens the windows 1.2× larger. No saved-data, setting or flag changes.

## 1.16.1 — 2026-10-21

- Confirmations name the action (no more Yes/No), Help opens with a Close button, dialogs follow the Ashen Gate look; test wording removed from player views.
- Delete location, Delete route, Clear Party Notes and discarding unsaved changes show a red action button; Abort journey now reads End journey. Move to… and Share with… use the shared form dialog.

## 1.16.0 — 2026-10-21

- Shared UI kit 2.0.0: rounded compact look for shared parts, Comfortable size option (General Manager → My Appearance), shared dialog helper.

## 1.15.2 — 2026-10-21

- **Fix: routes can no longer end up with 0 km or endless legs.** Distances and leg lengths are kept to 0.01 km; a value that rounds to 0 (e.g. 0.004) is now refused with a clear message in the route editor, `saveRoute` and Route import (it used to be saved as 0, and a 0 leg gave Infinity legs). The GM Setup default leg length is checked the same way. Existing routes are unchanged.
- **Fix: night watches take only characters.** `travel.setBehaviours` refuses an NPC or any Actor that isn't one of the characters the GM can put on watch (the Primary Party's characters, else every character Actor). Someone already on a watch can stay or be taken off. The watch panel is unchanged.
- Docs: corrected API comments (`getJourney` player shape, `travel.state()`, behaviour panels now ship). No saved-data change, no migration.

## 1.15.1 — 2026-10-20

- Test fix only: a Travel tracker test could fail at random when a generated pin or route key contained "25". No change to the module's behaviour or saved data.

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
