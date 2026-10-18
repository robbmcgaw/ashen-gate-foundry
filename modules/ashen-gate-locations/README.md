# Ashen Gate | Locations

Places in your campaign, each with a threat level, gathering resources, factions, quests, related locations and notes. You decide which parts players can see.

Foundry V14, dnd5e. Works on its own; Quest Manager and General Manager are optional.

## Using it

- **GM:** Items sidebar → **Location Builder**. Click **New Location**, type a name, and click **Save Changes**. The `LOC-*` ID is made from the name the first time you save and never changes after that.
- **Gathering nodes:** each *Gathering Resources* entry is a node with a skill, tier (1–5) and DC (10/12/13/14/15 by tier unless you change it), a common material and an optional rare one (success by 5+), quantities, *Finite* and *Available* switches, and a note. A finite node can be marked exhausted (shown struck through) and restored. Players see the DC only if you turn on its 👁.
- **Fill it in:** drop material Items on *Gathering Resources*, Actors or Journals on *Factions*, and any Actor, Item, Journal or Roll Table on *Notes*. Or type a custom entry. Link quests from Quest Manager and other locations from the dropdowns.
- **Visibility:** nothing is visible to players until **Revealed to players** is on. Then each field has an 👁 toggle, each section has a *Show section to players* switch, and each entry has its own 👁 toggle.
- **Map:** **Place on Scene** adds a Map Note at the centre of your view, or drag a location from the list onto the canvas. Double-clicking the note opens the location. Players only see notes for revealed locations.
- **Players:** Actors sidebar → **Locations** (when *Player Access* is on in GM Setup). Players get a read-only view of revealed locations. Clicking a quest opens the Quest Log; in the Quest Log, a quest's *Locations* list opens the location.

## Storage

- **Locations (GM Data)** Journal (no player permission) holds every record.
- **Locations (Player View)** Journal holds one page per location. A page contains only what players may see. Unrevealed locations get an empty page with no player permission, and Map Notes point at these pages.

Both Journals live in *Ashen Gate / Locations*. Don't edit them by hand.

Journals from Locations 0.8.x are ignored (a one-line console note says how many). Delete them when you no longer need them.

## API

`game.modules.get('ashen-gate-locations').api`. For players, every read returns only revealed and visible data, and only while Player Access is on.

| Call | Returns |
|---|---|
| `listLocations({revealedOnly})` | locations (GM: full records; players: always revealed only) |
| `getLocation(id)` | one location, or `null` |
| `resourcesAt(id)` | gathering nodes: `[{id, label, skill, tier, dc, materialId, quantity, rareMaterialId, rareQuantity, finite, exhausted, available, note, uuid}]`. GM also gets `visible`, `dcVisible`; players never get `dc` unless shown |
| `nodesForMaterial('MAT-…')` | `[{locationId, locationName, matches: 'common'\|'rare'\|'both', ...node}]` |
| `locationsWithMaterial('MAT-…')` | `[{id, name, available}]` |
| GM only: `markNodeExhausted(locationId, nodeId, exhausted = true)` | the updated node; `false` restores it |
| `GATHERING` | `{skills: [...], dcByTier: {1: 10, 2: 12, 3: 13, 4: 14, 5: 15}}` |
| `locationsForQuest('QUEST-…')` | `[{id, name}]` (used by Quest Manager) |
| `open()`, `openLocation(id)` | opens the window |
| GM only: `createLocation(name)`, `saveLocation(data)`, `deleteLocation(id)`, `importPackage(pkg)`, `exportPackage()`, `placeOnScene(id, {scene, x, y})` | |
| `playerAccess` | `ag-player-access/1` capability |

## Import format

Location records go in an `ag-foundry-import/0.2` package with `entity_type: "Location"`, so one test data pack can carry them. Manager validates the pack and leaves Location records to this module; import them from **GM Setup → Import JSON**. Other record types are skipped. A location whose ID already exists is kept as it is.

```json
{
  "manifest": {"schema_version": "ag-foundry-import/0.2", "package_id": "AG-TEST-PACK", "version": "1.0.0"},
  "records": [{
    "id": "LOC-TEST-MILLBROOK", "entity_type": "Location", "status": "draft", "version": "1.0.0",
    "provenance": {"sources": ["synthetic test data"]}, "visibility": "player", "refs": [],
    "name": "[TEST] Millbrook",
    "location": {
      "type": "Village", "region": "[TEST] Green Vale", "threat": "normal", "revealed": true,
      "description": "…", "img": "path/to/image.webp",
      "show": {"description": true},
      "sections": {"resources": true, "factions": true, "quests": false, "related": true, "notes": true},
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
- `sections` and `revealed` default to `false`.
- **Export JSON** writes the same format. [`examples/test-locations.json`](examples/test-locations.json) is a synthetic sample; **GM Setup → Developer Tools** imports it.

## Tests

`node scripts/check.mjs ashen-gate-locations` runs the model, storage, API and render tests against mocked Foundry, with an emphasis on what players can read. They prove logic, not the live Foundry UI.
