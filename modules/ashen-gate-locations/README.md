# Ashen Gate | Locations

Places in your campaign, each with a threat level, gathering resources, factions, quests, related locations and notes. You decide which parts players can see.

Foundry V14, dnd5e. Works on its own; Quest Manager and General Manager are optional.

## Using it

- **GM:** Items sidebar → **Location Builder**. Click **New Location**, type a name, and click **Save Changes**. The `LOC-*` ID is made from the name the first time you save and never changes after that.
- **Gathering nodes:** each *Gathering Resources* entry is a node with a skill, tier (1–5) and DC (10/12/13/14/15 by tier unless you change it), a common material and an optional rare one (success by 5+), quantities, *Finite* and *Available* switches, and a note. A finite node can be marked exhausted (shown struck through) and restored. Players see the DC only if you turn on its 👁.
- **Fill it in:** drop material Items on *Gathering Resources*, Actors or Journals on *Factions*, and any Actor, Item, Journal or Roll Table on *Notes*. Or type a custom entry. Link quests from Quest Manager and other locations from the dropdowns.
- **Marker state:** each location is **Hidden** (players see nothing; its pins are invisible to them), **Unidentified** (players see only its unidentified label and teaser) or **Revealed**. New locations start hidden.
- **Save vs Publish:** **Save Changes** is private. Players see your edits only after **Publish** (Reveal and Unidentified publish too). **Player Preview** shows what they would see. Marking a node exhausted shows at once.
- **Reorder, Add Detail, Loot, Regions (1.4.0):** drag a block's grip (or use ▲▼, or Alt+Up/Down on the grip) to reorder the card and the entries in it; players see published blocks in that order after **Publish**. **Add Detail** makes a custom block on this location. **Loot & Rewards** takes Items dragged from the sidebar or a compendium (a link only; no Actor ever gets the item) or plain rewards, with a status you set. Tick **This is a Region** and its Conditions pass to every place inside it; a place can turn one off or change it for itself.
- **Visibility once revealed:** each field has an 👁 toggle, each section has a *Show section to players* switch, and each entry has its own 👁 toggle.
- **Map:** **Place on Scene** adds a Map Note at the centre of your view, or drag a location from the list onto the canvas. Double-clicking the note opens the location. Hidden pins are invisible to players; unidentified pins show the label and the unidentified image. Set pin art under *Unidentified Marker & Pin* (default images are Foundry icons). Change one placed pin's image or size in Foundry's own Note settings and that pin keeps it.
- **Nesting & Scenes:** put a location inside another (any depth, no loops). Players see the places inside a revealed location once each is revealed (unidentified ones by label). Link scenes and open them with one click; only your view moves.
- **Party Notes (1.5.0):** every location players can see (Revealed or Unidentified) has a shared **Party Notes** card that the whole party edits. One person edits at a time: **Edit** takes the lock, everyone else sees "*name* is editing", and **Save Notes** or **Cancel** lets it go (it also lapses after 2 minutes without typing, or when that player disconnects). A save based on an older copy is refused and the text stays in the box. The GM can edit any location's Party Notes, **Take Over** from a player, and **Clear** them. They are not your *Notes* section: Save Changes, Publish, imports and exports never touch them. Hiding a location hides its Party Notes from players until it is visible again. Since 1.7.0 players can save with no GM connected.
- **Players:** Actors sidebar → **Locations** (when *Player Access* is on in GM Setup). Players get a read-only view of revealed locations. Clicking a quest opens the Quest Log; in the Quest Log, a quest's *Locations* list opens the location.

## Storage

- **Locations (GM Data)** Journal (no player permission) holds every record.
- **Locations (Player View)** Journal holds one page per location. A page contains only what players may see. Hidden locations get an empty page with no player permission, unidentified ones a page with just the label and teaser, and Map Notes point at these pages.
- Pages and Map Notes are bound to a location by a random **pin key**, never by the `LOC-*` id (an id is made from a name, so it could give an unidentified place away).
- **Locations (Party Notes)** Journal (no player permission) holds every location's Party Notes, by `LOC-*` id. Each visible location's player page carries a copy (no id); a hidden one's page carries none. With a GM connected, players send a request over the module socket and the primary GM's client checks it (sender, Player Access, the location is visible to players, the lock and the stamp) before writing. Notes of a deleted location are kept and come back if the same id is imported again.
- **Locations (Shared Notes)** Journal (1.7.0; players OBSERVER on the entry) holds one generic page per location visible to players, keyed by pin key, carrying only the notes copy. Players OWN those pages, so with no GM connected they save there directly (same lock and stamp rules). A Hidden location's page is blank with no player permission. The GM's client reconciles it with the GM store on login and after any player write: one-sided changes are taken; if both changed, the newer wins and the older text is kept under a divider. A player could console-edit the notes of a location they can already see (accepted trade-off).
- Foundry sends every world document to every client, so a player who digs in the browser console could read the GM Data journal. Nothing in the normal Foundry UI shows it.

All three Journals live in *Ashen Gate / Locations*. Don't edit them by hand.

Journals from Locations 0.8.x are ignored (a one-line console note says how many). Delete them when you no longer need them.

## API

`game.modules.get('ashen-gate-locations').api`. For players, every read returns only revealed and visible data, and only while Player Access is on.

| Call | Returns |
|---|---|
| `listLocations({revealedOnly, includeUnidentified})` | locations (GM: full records; players: revealed only, plus unidentified `{key, state, name, teaser?}` with `includeUnidentified`) |
| `getLocation(idOrPinKey)` | one location, or `null`. Players get unidentified ones only by pin key |
| `childrenOf(idOrPinKey)` | GM: child records. Players: `[{id?, key, name}]` of revealed/unidentified children |
| `resourcesAt(id)` | gathering nodes: `[{id, label, skill, tier, dc, materialId, quantity, rareMaterialId, rareQuantity, finite, exhausted, available, note, uuid}]`. GM also gets `visible`, `dcVisible`; players never get `dc` unless shown |
| `nodesForMaterial('MAT-…')` | `[{locationId, locationName, matches: 'common'\|'rare'\|'both', ...node}]` |
| `locationsWithMaterial('MAT-…')` | `[{id, name, available}]` |
| GM only: `markNodeExhausted(locationId, nodeId, exhausted = true)` | the updated node; `false` restores it |
| `GATHERING` | `{skills: [...], dcByTier: {1: 10, 2: 12, 3: 13, 4: 14, 5: 15}}` |
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
| `playerAccess` | `ag-player-access/1` capability |

## Import format

Location records go in an `ag-foundry-import/0.2` package with `entity_type: "Location"`, so one test data pack can carry them. **General Manager imports them for you:** when Locations is active, its normal import creates the Items first and then passes the Location records to `api.importLocations` in the same run. Without Manager (or for a Locations-only file) use **GM Setup → Import JSON**, which reads the same records and skips other types. Either way a location whose ID already exists is kept as it is; Manager can also be told to update existing locations (`importLocations(records, {mode: 'update'})` replaces the definition but keeps its marker state, what players currently see, its pin key and exhausted nodes; publish to show the update). Imports never touch Map Notes.

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
- Exports also carry `pinKey` and `published` (what players currently see). An update import that leaves out `parentLocationId`, `unidentifiedLabel`, `teaser`, `pin` or `sceneUuids` keeps the world's value (see also the 1.4.0 fields above).
- Party Notes are campaign state, not definition: exports leave them out and imports never read or change them.
- **Export JSON** writes the same format. [`examples/test-locations.json`](examples/test-locations.json) is a synthetic sample; **GM Setup → Developer Tools** imports it.

## Tests

`node scripts/check.mjs ashen-gate-locations` runs the model, storage, API and render tests against mocked Foundry, with an emphasis on what players can read. Party Notes tests run a GM and two player clients in one process over a fake socket. They prove logic, not the live Foundry UI or real multi-client timing.
