# Ashen Gate | Locations

Places in your campaign, each with a threat level, gathering resources, factions, quests, related locations and notes. You decide which parts players can see.

Module ID `ashen-gate-locations` · Foundry V14, dnd5e. Works on its own; Quest Manager, Profession Ledger and General Manager are optional partners and are feature-detected. General Manager hands location records to `importLocations`.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-locations/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).

## Using it

- **GM:** Items sidebar → **Location Builder**. Click **New location**, type a name, and click **Save Changes**. The `LOC-*` ID is made from the name the first time you save and never changes after that.
- **Gathering nodes:** each *Gathering Resources* entry is a node with a skill, tier (1–5) and DC (10/12/15/18/20 by tier unless you change it), a common material and an optional rare one (success by 5+), quantities, *Finite* and *Available* switches, and a note. A finite node can be marked exhausted (shown struck through) and restored. Players see the DC only if you turn on its 👁. Optional *Exotic materials* (1.9.0, GM only) list Exotics the Profession Ledger may find there: random discovery, or a designated source with its own chance and condition.
- **Fill it in:** drop material Items on *Gathering Resources*, Actors or Journals on *Factions*, and any Actor, Item, Journal or Roll Table on *Notes*. Or type a custom entry. Link quests from Quest Manager and other locations from the dropdowns.
- **Marker state:** each location is **Hidden** (players see nothing; its pins are invisible to them), **Unidentified** (players see only its unidentified label and teaser) or **Revealed**. New locations start hidden.
- **Save vs Publish:** **Save Changes** is private. Players see your edits only after **Publish** (Reveal and Unidentified publish too). **Player Preview** shows what they would see. Marking a node exhausted shows at once.
- **Reorder, Add Detail, Loot, Regions (1.4.0):** drag a block's grip (or use ▲▼, or Alt+Up/Down on the grip) to reorder the card and the entries in it; players see published blocks in that order after **Publish**. **Add Detail** makes a custom block on this location. **Loot & Rewards** takes Items dragged from the sidebar or a compendium (a link only; no Actor ever gets the item) or plain rewards, with a status you set. Tick **This is a Region** to make it a folder; since 1.8.0 it passes its Conditions to every place inside it only when you also tick **Pass conditions to places inside** (off by default). A place can turn an inherited condition off or change it for itself.
- **Visibility once revealed:** each field has an 👁 toggle, each section has a *Show section to players* switch, and each entry has its own 👁 toggle.
- **Map:** **Place on Scene** adds a Map Note at the centre of your view, or drag a location from the list onto the canvas. Double-clicking the note opens the location. Hidden pins are invisible to players; unidentified pins show the label and the unidentified image. Set pin art under *Unidentified Marker & Pin* (default images are Foundry icons). Change one placed pin's image or size in Foundry's own Note settings and that pin keeps it.
- **Tree (1.8.0):** the **Tree** button beside *Group by* shows places inside their Regions as folders, to any depth, with counts (directly inside · in total), **Expand all / Collapse all**, and a **+** on each folder to make a place inside it. Drag a place onto a folder (or *Drop here for top level*) to move it, with **Undo**; **Move to…** on the card does the same from the keyboard. The card shows its path (Overworld › … › this). Filters and search keep the folders leading to each match.
- **Placeable on a map (1.8.0):** on by default for places, off for Regions. Representative-only places are left out of *Place on Scene* and dragging onto the map unless you tick **Show representative-only too**; a place that already has a pin always shows it (and Place on Scene) on its card. The *Placeable* filter finds either kind.
- **Who Can See It (1.8.0):** **Everyone** (default) or **Selected players**. Only the ticked players get the card, its pins, its Party Notes and its quest links; everyone else gets exactly what they would for a Hidden place. Players who can see it may **Share with…** other players (adds only; the GM can turn sharing off per location). The card lists who shared with whom; untick a player to undo.
- **Nesting & Scenes:** put a location inside another (any depth, no loops); any place can sit inside another, only Regions show as folders. Players see the places inside a revealed location once each is revealed (unidentified ones by label). Link scenes and open them with one click; only your view moves.
- **Party Notes (1.5.0):** every location players can see (Revealed or Unidentified) has a shared **Party Notes** card that the whole party edits. One person edits at a time: **Edit** takes the lock, everyone else sees "*name* is editing", and **Save Notes** or **Cancel** lets it go (it also lapses after 2 minutes without typing, or when that player disconnects). A save based on an older copy is refused and the text stays in the box. The GM can edit any location's Party Notes, **Take Over** from a player, and **Clear** them. They are not your *Notes* section: Save Changes, Publish, imports and exports never touch them. Hiding a location hides its Party Notes from players until it is visible again. Since 1.7.0 players can save with no GM connected.
- **Routes (1.10.0):** the **Routes** tab joins two locations. **New route**, pick **From** and **To** by name, set the **Distance (km)** and, if this route's legs differ from the world default (GM Setup → *Routes*), its **Leg length (km)**; legs = distance ÷ leg length, rounded up. Shipped defaults: 5 km legs and a 5% base hazard chance (1.13.1; were 10 km and 10%). Values already saved on a route or in GM Setup stay. Optional: a name, *One-way*, terrain, a **Hazard table** (a world Roll Table; a missing table falls back to "Hazard!") and a **Base hazard chance**, GM notes. The `RTE-*` ID is made from the two ends on first save, never changes and is never reused, even after a delete. **Discovery:** *Unknown* (new routes; players see nothing), *Rumoured*, *Known*, *Explored*. A player sees a discovered route only while **both ends are visible to them** (not Hidden, and allowed to see that place) and they are in the route's own **Who Can See It** (Everyone or Selected players). Tick *show "Unknown path"* to let a player who can see only one end see an unnamed path from that end instead of nothing. Players never see the hazard chance, table, GM notes or ID. **Delete route** (top of the editor) asks first.
- **Journeys (1.11.0):** on a saved route, **Start journey** in either direction (one-way routes: From → To only). **Next leg** rolls d100 against the hazard chance: it starts at the route's base chance, doubles after each leg without a hazard (max 100%) and goes back to the base chance after a hazard. A hazard rolls the route's table (or says "Hazard!"), is whispered to you and waits for **Reroll**, **Dismiss** or **Share with players** (chat, no route or place names). After the last leg the party marker moves to the destination and the trip is added to that place's Party Notes. **Turn back** and **Abort journey** are there too. The party marker is a Map Note between the two route pins. Players see only the marker and "leg N of M".
- **Route drawings (1.12.0):** on a route's *Map Drawing* card, **Link selected drawing** binds a drawing you selected on the canvas, **Draw for me** adds a straight line between the two pins (reshape it as you like), **Unlink** leaves it on the map. Locations only toggles the drawing's *hidden*: shown while every player can see the whole route, hidden otherwise. The party marker follows the line. Foundry still sends hidden drawings to every client, so never write secrets in a drawing's text.
- **Travel tracker (1.14.0):** a small pop-out window to keep open over the map while travelling. Open it from the **person-hiking** button in the Token controls (left of the map), or **Travel tracker** on a journey in Locations → Routes. GM: the route, From → To, a strip with one marker per leg (current leg highlighted, hazard legs outlined), "Leg 3 of 8, 15 of 40 km", the hazard chance and safe legs in a row, **Roll next leg** (the same rules as *Next leg*), the hazard card with **Reroll / Dismiss / Share to players**, **Pause / Resume**, **End journey** (asks first), **Open route**, and the latest legs. Players (with Player Access): route name, strip, "Leg 3 of 8" and only what the GM shared; never chances, rolls or table results. It updates for everyone when the GM rolls. The slider fades the window background (saved per browser); the window remembers its place and size per browser.
- **Travel behaviours (1.15.0), tracking only:** collapsible panels in the tracker for the current journey. Nothing is rolled or changed automatically: no effect on the hazard chance, legs, supplies or rest. Each has a per-journey **Track on this journey** switch (all on by default).
  - **Pace:** Slow / Normal / Fast, set by the GM. Players see the current pace.
  - **Night watches:** the GM ticks characters for the first, second and third watch (the dnd5e Primary Party's characters, else every character), up to 8 on each watch; ticking a ninth is refused with a message. Players see the watch order once someone is on watch.
  - **Foraging and navigation** (GM only): a skill for each (Survival unless the GM changes it) and **Foraging check** / **Navigation check** buttons that open **Utilities → Rolls** with the check filled in (Group result, the party ticked). The GM can change anything there, including *Individual rolls*, then clicks **Start Rolls**. Needs Ashen Gate Utilities 0.13.0 or later; without it this panel is hidden.
- **Players:** Actors sidebar → **Locations** (when *Player Access* is on in GM Setup; it saves with GM Setup's **Save Changes**, like the other settings there). Players get a read-only view of revealed locations. Clicking a quest opens the Quest Log; in the Quest Log, a quest's *Locations* list opens the location.

## Storage

- **Locations (GM Data)** Journal (no player permission) holds every record.
- **Locations (Player View)** Journal holds one page per location. A page contains only what players may see. Hidden locations get an empty page with no player permission, unidentified ones a page with just the label and teaser, and Map Notes point at these pages. Since 1.8.0 each page names every player in its ownership: a *Selected players* page gives only those players access (and NONE to the rest), so Foundry itself hides the page and its Map Notes from everyone else. Its pins carry no label of their own; Foundry labels them from the page for the players who may open it. Links on a card (parent, places inside, related, inherited conditions) appear only when everyone who can read that card can also see their target. As with the GM Data Journal, Foundry sends every document to every client; the permission is what keeps it out of each player's view.
- Pages and Map Notes are bound to a location by a random **pin key**, never by the `LOC-*` id (an id is made from a name, so it could give an unidentified place away).
- **Locations (Party Notes)** Journal (no player permission) holds every location's Party Notes, by `LOC-*` id. Each visible location's player page carries a copy (no id); a hidden one's page carries none. With a GM connected, players send a request over the module socket and the primary GM's client checks it (sender, Player Access, the location is visible to players, the lock and the stamp) before writing. Notes of a deleted location are kept and come back if the same id is imported again.
- **Locations (Shared Notes)** Journal (1.7.0; players OBSERVER on the entry) holds one generic page per location visible to players, keyed by pin key, carrying only the notes copy. Players OWN those pages, so with no GM connected they save there directly (same lock and stamp rules). A Hidden location's page is blank with no player permission. The GM's client reconciles it with the GM store on login and after any player write: one-sided changes are taken; if both changed, the newer wins and the older text is kept under a divider. A player could console-edit the notes of a location they can already see (accepted trade-off).
- Foundry sends every world document to every client, so a player who digs in the browser console could read the GM Data journal. Nothing in the normal Foundry UI shows it.

- **Routes (1.10.0):** full route records sit in the GM Data Journal (`routes`, plus `routeIds`: every route id ever used). A **Locations (Routes)** Journal holds one page named just "Route" per version of a route that some player may see, with only the player-safe view and a random key, readable only by those players (everyone else NONE). An Unknown route has no page.

All these Journals live in *Ashen Gate / Locations*. Don't edit them by hand.

Journals from Locations 0.8.x are ignored (a one-line console note says how many). Delete them when you no longer need them.

## API

`game.modules.get('ashen-gate-locations').api`. For players, every read returns only revealed and visible data, and only while Player Access is on.

| Call | Returns |
|---|---|
| `listLocations({revealedOnly, includeUnidentified, placeableOnly})` | locations (GM: full records; `placeableOnly` keeps those marked Placeable on a map; players: revealed only, plus unidentified `{key, state, name, teaser?}` with `includeUnidentified`). A player view of a *Selected players* location also has `share: {userIds, canShare}` |
| `getLocation(idOrPinKey)` | one location, or `null`. Players get unidentified ones only by pin key |
| `childrenOf(idOrPinKey)` | GM: child records. Players: `[{id?, key, name}]` of revealed/unidentified children |
| `resourcesAt(id)` | gathering nodes: `[{id, label, skill, tier, dc, materialId, quantity, rareMaterialId, rareQuantity, finite, exhausted, available, note, uuid}]`. GM also gets `visible`, `dcVisible` and `exotics` (`[{materialId, mode: 'discovery'|'designated', chance?, condition?}]`); players never get `dc` unless shown, and never `exotics` |
| `nodesForMaterial('MAT-…')` | `[{locationId, locationName, matches: 'common'\|'rare'\|'both', ...node}]` |
| `locationsWithMaterial('MAT-…')` | `[{id, name, available}]` |
| GM only: `markNodeExhausted(locationId, nodeId, exhausted = true)` | the updated node; `false` restores it |
| `GATHERING` | `{skills: [...], dcByTier: {1: 10, 2: 12, 3: 15, 4: 18, 5: 20}, legacyDcByTier: {1: 10, 2: 12, 3: 13, 4: 14, 5: 15}}` (`legacyDcByTier`: the pre-1.9.0 table, still treated as the tier default) |
| `locationsForQuest('QUEST-…')` | `[{id, name}]` (used by Quest Manager) |
| `open()`, `openLocation(idOrPinKey)` | opens the window |
| GM only: `setLocationState(id, 'hidden'\|'unidentified'\|'revealed')`, `publishLocation(id)` | change what players see (the only calls that do) |
| GM only: `previewLocation(draft, state?)`, `hasUnpublishedChanges(id)` | the player view after Publish; whether players see an older version |
| `STATES` | `['hidden', 'unidentified', 'revealed']` |
| GM only: `createLocation(name)`, `saveLocation(data)` (private; never changes state), `deleteLocation(id)`, `importPackage(pkg)`, `importLocations(records, {mode})`, `exportPackage()`, `placeOnScene(id, {scene, x, y})` | |
| `getPartyNotes(idOrPinKey)` | `{key, text, rev, updatedAt, updatedBy: {id, name}\|null, editing: {id, name, until}\|null, mine, canEdit}`, or `null`. Players: only for locations they can see (unidentified ones by pin key); the GM: any |
| `editPartyNotes(idOrPinKey, {takeover})` | takes the edit lock and returns the current notes to edit from; `takeover` is GM only |
| `savePartyNotes(idOrPinKey, text, rev)`, `releasePartyNotes(idOrPinKey)` | save (refused if someone else holds the lock or `rev` is stale) / let go of the lock |
| GM only: `clearPartyNotes(idOrPinKey)` | empties a location's Party Notes |
| `PARTY_NOTES` | `{maxLength: 20000, lockMs: 120000, renewMs: 30000}` |
| GM only: `moveLocation(id, parentId)` | moves it inside another (`''` = top level); refuses loops; returns `{id, from, to}` for undo |
| GM only: `getAudience(id)`, `setAudience(id, {mode, userIds, sharing})` | who may see it: `{mode: 'everyone'\|'selected', userIds, sharedBy: {userId: sharer}, sharing}`; applies at once |
| `shareLocation(idOrPinKey, userIds)` | players: add players to a *Selected players* location they can see (a GM must be connected); `{added}` |
| GM only: `pinsOf(id)` | scenes holding its Map Notes: `[{uuid, name, count}]` |
| `listRoutes({locationId})` | GM: route records plus `legs`, `legKmInEffect`. Players: the routes they may see, `{key, variant: 'full'\|'from'\|'to', state, name, from, to, directed, distanceKm, legs, legKm, terrain?}` (an *Unknown path* has `state: 'unknown-path'`, `name: 'Unknown path'` and only its visible end); never an `RTE-*` id or hazard data |
| `getRoute(id \| key)` | GM: by `RTE-*` id. Players: a visible route by its key, else `null` |
| GM only: `saveRoute(data)`, `setRouteState(id, 'unknown'\|'rumoured'\|'known'\|'explored')`, `setRouteAudience(id, {mode, userIds})`, `deleteRoute(id)`, `importRoutes(records, {mode})` | Save keeps discovery and audience; a new route starts Unknown |
| `ROUTE_STATES` | `['unknown', 'rumoured', 'known', 'explored']` |
| GM only: `routeDrawing(id)`, `linkRouteDrawing(id, drawingUuid)`, `unlinkRouteDrawing(id)`, `drawRoute(id, {scene})`, `deleteRoute(id, {deleteDrawing})` | map drawing link (`routeDrawing` → `{status: 'none'\|'linked'\|'missing'\|'elsewhere', sceneName?, sceneUuid?, hidden?, hasText?, path?}`: `'linked'` has them all, `'elsewhere'` only `sceneName`) |
| `getJourney()` | GM: `{journey, partyLocationId, history}` (`{journey: null, partyLocationId: '', history: []}` when journeys are unavailable). `journey` is `null` or `{journeyId, routeId, direction: 'forward'\|'reverse', fromId, toId, distanceKm, legs, legIndex, baseChance, currentChance, hazardCount, startedAt, endedAt, status: 'active'\|'arrived'\|'aborted', log, pending, paused, travelLog: ''\|'ok'\|'failed', travelLogError, behaviours}`: `log` is the last 200 entries, each `{leg, roll, chance, hazard, at, result?, outcome?: 'pending'\|'dismissed'\|'shared'}` or `{leg, reversed: true, at}`; `pending` is the hazard waiting for the GM, `{leg, roll, chance, result, fromTable, tableMissing}`, or `null`; `behaviours` (1.15.0) as `travel.getBehaviours()`. `partyLocationId` is `''` while the party is between places. `history`: the last 20 arrived or aborted journeys, same shape. Players: `{status, leg, legs, paused?, log?, from?, to?, routeKey?, behaviours?}` or `null` (`leg`: legs travelled; `paused: true` only while an active journey is paused; `log`: the last 20 lines the GM shared, `[{leg, text}]`, 1.14.0; `from`/`to`: `{id?, key, name}`, only when every player can see that place; `routeKey` only when every player can see the whole route; `behaviours` (1.15.0) as in `travel.state()`) |
| GM only: `startJourney(routeId, {direction: 'forward'\|'reverse'})`, `nextLeg()` → `{journey, roll, chance, hazard, result, arrived}`, `rerollHazard()`, `dismissHazard()`, `shareHazard()`, `reverseJourney()`, `abortJourney()`, `retryTravelLog()` | one journey at a time |
| GM only: `pauseJourney()`, `resumeJourney()` (1.14.0) | a paused journey refuses `nextLeg` until resumed; players' progress shows `paused: true` |
| `travel.open()` (1.14.0) | opens the Travel tracker (GM controls or the player view); refused for players while Player Access is off |
| `travel.state()` (1.14.0) | read-only, player-safe: see below |
| `travel.behaviours.register(def)`, `.unregister(id)`, `.list()` (1.14.0) | optional tracker panels: see below |
| GM only: `travel.getBehaviours()`, `travel.setBehaviours(patch)`, `travel.openCheck('forage'\|'navigate')`; `travel.checksAvailable()` (1.15.0) | travel behaviours (tracking only): see below |
| `playerAccess` | `ag-player-access/1` capability |

### `embed.mount(element, options)` (1.13.0)

Shows a compact, **read-only** Locations view inside another module's window, for example Character Hub's Ashen Gate → Locations: the party's journey progress (from → to, leg of legs) and the revealed places the user can see, grouped by region, with search. Each place opens in the Locations window; **Open Locations** opens the window.

```js
const api = game.modules.get('ashen-gate-locations')?.api;
if (api?.embed?.mount) {
  const view = api.embed.mount(element, {actorId: actor.id, mode: 'character'});
  // later: view.refresh();  view.unmount();
}
```

- `element`: a DOM element the caller owns. Locations replaces its contents and adds the class `agl-embed`.
- `options.actorId` is accepted (places are party-wide); `options.mode`: `'character'` (the only mode; `api.embed.modes` lists them). An unknown mode or a missing element throws.
- Returns `{unmount(), refresh()}`. It refreshes itself when Locations' journals or Player Access change and unmounts itself if the element has left the page.
- **Permission:** it reads the same player views the window shows players, so players see only revealed places they may read (never hidden, unidentified details or GM fields) and the journey's progress only (never hazard chances or rolls). The GM sees the same list (what the party knows). Players see "The GM has hidden Locations." while Player Access is off; Open checks Player Access again. Nothing can be edited from the embed.

### `travel` (1.14.0): the Travel tracker

`api.travel.contract` is `'ag-locations-travel/1'`.

- `await api.travel.open()`: opens the pop-out tracker (or brings it forward). Anyone who may open Locations.
- `api.travel.state()`: the party's journey as players see it, for everyone (the GM gets the same), or `null`:
  `{status: 'active'|'arrived'|'aborted', leg, legs, paused, routeName, routeKey, from: {name, key}|null, to: {name, key}|null, log: [{leg, text}], behaviours?}`.
  1.15.0: `behaviours` is present while travelling and the GM has pace or watches switched on: `{pace?: 'slow'|'normal'|'fast', watch?: [{watch: 'first'|'second'|'third', names: [characterName]}]}` (`watch` once someone is on watch). Never the check skills.
  It is read from the players' progress page, so it never holds a hazard chance, roll, table, GM note or a hazard the GM has not shared. `routeName` is set only while every player can see the whole route; `from`/`to` only when every player can see that place. Read-only: change the journey with the GM calls above.
- `api.travel.behaviours.register({id, label, icon?, audience: 'gm'|'everyone', appliesTo?(ctx), render(ctx), act?(action, ctx)})` → `unregister()`: an optional panel in the tracker (Locations' own pace, watch and checks panels use it, 1.15.0). 1.15.0: a control in the panel with `data-travel="bh:<id>:<action>"` (click) or `data-travel-change="bh:<id>:<action>"` (change) calls `act(action, {isGM, el})`; `'gm'` behaviours' actions are refused for players, and writes should go through a GM-only API. `ctx` is `{isGM, state, journey}` (`journey` is the full GM record on the GM's client, `null` for players). `render` returns HTML; `appliesTo` decides per journey whether it shows. `'gm'` panels are never drawn for players; a panel keeps its own data and is responsible for not sending GM-only data to players. The tracker redraws when the journey changes.

```js
const travel = game.modules.get('ashen-gate-locations')?.api?.travel;
const s = travel?.state();          // e.g. {status: 'active', leg: 3, legs: 8, routeName: '[TEST] Old Road', ...}
await travel?.open();
```

#### Travel behaviours (1.15.0, tracking only)

Stored per journey in the additive `journey.behaviours` field (shape in [`docs/routes-schema.md`](../../docs/routes-schema.md#journey-behaviours-locations-1150)). A journey saved before 1.15.0 reads with the defaults; nothing is migrated.

- `travel.getBehaviours()` (GM): `{pace: {enabled, value}, watch: {enabled, first, second, third}, checks: {enabled, forage, navigate}}` for the current journey, or `null`.
- `await travel.setBehaviours(patch)` (GM, journey under way): changes only what the patch names and returns the new behaviours. Examples: `{pace: {value: 'fast'}}`, `{watch: {first: [actorId, ...]}}`, `{checks: {navigate: 'nat', enabled: true}}`. Throws on an unknown behaviour, setting, pace, watch or skill id, a non-boolean `enabled`, a watch list that is not Actor ids, or more than 8 different characters on one watch (nothing is saved). 1.15.2: a watch takes only the characters the GM can put on watch (the dnd5e Primary Party's characters, else every character Actor); any other Actor id is refused, though someone already on a watch may stay. It never touches the hazard chance, legs, log or anything else.
- `travel.checksAvailable()`: true for the GM when Utilities' `api.rolls.open` exists (Utilities 0.13.0+).
- `await travel.openCheck('forage'|'navigate')` (GM, journey under way, checks on): calls Utilities' `api.rolls.open({skills: [skill], mode: 'group', title: 'Foraging'|'Navigation'})`. Starts nothing; the GM clicks Start Rolls in Utilities.
- Players get `travel.state().behaviours` (above) and can change nothing: every write is rejected in the API.

## Import format

Location records go in an `ag-foundry-import/0.2` package with `entity_type: "Location"`, so one test data pack can carry them. **General Manager imports them for you:** when Locations is active, its normal import creates the Items first and then passes the Location records to `api.importLocations` in the same run. Without Manager (or for a Locations-only file) use **Import** on the Locations tab toolbar, which reads the same records and skips other types. Either way a location whose ID already exists is kept as it is; Manager can also be told to update existing locations (`importLocations(records, {mode: 'update'})` replaces the definition but keeps its marker state, what players currently see, its pin key and exhausted nodes; publish to show the update). Imports never touch Map Notes.

**Route records (1.10.0)** travel in the same package with `entity_type: "Route"` and a `route` block (`from_location_id`, `to_location_id`, `distance_km`, optional `leg_km`, `hazard_base_percent`, `hazard_table`, `terrain`, `discovery_state`, `directed`, `name`, `notes`). They are read after the package's locations, whatever their order in the file. The full schema, defaults and an example are in [`docs/routes-schema.md`](../../docs/routes-schema.md). A route whose id already exists is kept; `importRoutes(records, {mode: 'update'})` replaces its definition but never its discovery state, audience or *Unknown path* choice.

```json
{
  "manifest": {"schema_version": "ag-foundry-import/0.2", "package_id": "AG-TEST-PACK", "version": "1.0.0"},
  "records": [{
    "id": "LOC-TEST-MILLBROOK", "entity_type": "Location", "status": "draft", "version": "1.0.0",
    "provenance": {"sources": ["synthetic test data"]}, "visibility": "player", "refs": [],
    "name": "[TEST] Millbrook",
    "location": {
      "type": "Village", "region": "[TEST] Green Vale", "threat": "normal", "state": "revealed",
      "parentLocationId": "LOC-TEST-REGION", "unidentifiedLabel": "[TEST] Mill smoke", "teaser": "…",
      "pin": {"img": "path/to/pin.webp", "unidentifiedImg": "path/to/unknown.webp", "size": 48}, "sceneUuids": ["Scene.abc123"],
      "description": "…", "img": "path/to/image.webp",
      "show": {"description": true},
      "sections": {"resources": true, "factions": true, "quests": false, "related": true, "notes": true, "conditions": true, "loot": true},
      "isRegion": false, "layout": ["description", "loot", "detail:cellar"],
      "conditions": [{"key": "fog", "label": "Dense fog", "text": "…", "visible": true}],
      "loot": [{"key": "blade", "label": "[TEST] Blade", "text": "…", "img": "path/to/img.webp", "uuid": "Item.abc123", "docType": "Item", "status": "available", "visible": true}],
      "details": [{"key": "cellar", "title": "[TEST] Cellar", "text": "…", "uuid": "", "visible": false}],
      "conditionOverrides": [{"from": "LOC-TEST-REGION", "conditionKey": "fog", "disabled": true}],
      "resources": [{"id": "reed-bed", "label": "[TEST] Reed Bundle", "skill": "Herbalism", "tier": 2, "dc": 12, "dcVisible": false,
                     "materialId": "MAT-REED", "quantity": 1, "rareMaterialId": "MAT-SILVER-REED", "rareQuantity": 1,
                     "finite": true, "exhausted": false, "available": true, "visible": true, "note": "One patch"}],
      "factions":  [{"label": "[TEST] Millers' Guild", "uuid": "Actor.abc123"}],
      "quests":    [{"questId": "QUEST-TEST-ONE"}],
      "related":   [{"locationId": "LOC-TEST-OLD-QUARRY"}],
      "notes":     [{"title": "Rumour", "text": "…", "visible": false}]
    }
  }]
}
```

- `threat` is `normal`, `hot` or `deadly`.
- Gathering nodes: every field except a name or material is optional. Defaults: `tier` 1, `dc` from the tier, `quantity`/`rareQuantity` 1, `finite` true, `exhausted` false, `dcVisible` false. Keep `id` stable; 1.0.x entries without node fields still import.
- `show` (per field: `type`, `region`, `description`, `img`, `threat`) and every entry's `visible` default to `true`.
- `sections` default to `false`. `state` is `hidden` (default), `unidentified` or `revealed`; older files with `revealed: true/false` still import. A visible location's content is published on import.
- `parentLocationId` is an exact `LOC-*` id (a loop is refused); `type` and `region` stay free text. `pin.size` 0 or missing means 48.
- 1.4.0 fields, all optional: `layout` (block keys in order: `description`, `conditions`, `children`, `resources`, `factions`, `quests`, `related`, `loot`, `notes`, `scenes`, `detail:<key>`; unknown keys are dropped and missing ones appended), `details`, `conditions`, `loot` (`status` is `available`, `discovered` or `taken`), `isRegion`, `conditionOverrides` (`from` is the Region's `LOC-*` id, `conditionKey` one of its condition keys). Loot `uuid` is a link only. An update import that leaves any of them (or the `conditions`/`loot` section switches) out keeps the world's value.
- 1.8.0 fields, all optional: `passConditions` (Regions only; a record without it is settled on import like the migration: on if it is a Region with conditions and something inside it), `placeable` (`null`/missing = on unless a Region), `audience` (`{mode: 'everyone'|'selected', userIds, sharedBy, sharing}`; user ids are world-local). An update import keeps the world's `audience` (play state, like the marker state) and keeps `passConditions`/`placeable` when left out.
- Exports also carry `pinKey` and `published` (what players currently see). An update import that leaves out `parentLocationId`, `unidentifiedLabel`, `teaser`, `pin` or `sceneUuids` keeps the world's value (see also the 1.4.0 fields above).
- Party Notes are campaign state, not definition: exports leave them out and imports never read or change them.
- **Export** (Locations tab toolbar) writes the same format. [`examples/test-locations.json`](examples/test-locations.json) is a synthetic sample; **GM Setup → Developer Tools** imports it.
