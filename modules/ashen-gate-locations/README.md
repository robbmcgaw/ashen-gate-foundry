# Ashen Gate | Locations — v0.8.0 Alpha (uncommitted coordinated-build candidate)

> **2026-10-17 coordinated build:** v0.8.0 updates the GM-only Items launcher to join one shared Items group (Manager 10, Locations 20) above directory search/filter; gives that group equal-width 36px buttons and 5px gaps; compacts resource, POI and Map Manager controls; adds six *real imported world Location records* as an optional disposable fixture and 32 exact-format Foundry cases. Existing Locations data and game rules do not change. The launcher consolidation requires another participating module to use/cooperate with the shared group; test with actual installed Manager build. All live Foundry tests remain **NOT RUN**. See [Release Notes](RELEASE_NOTES.md) and `docs/FOUNDRY_TEST_CASES.md`.

**Status:** Standalone Locations/Maps Foundry alpha built from the delivered **v0.5.0** ZIP. v0.7.0 added a GM-only read-only resolver provider and Eli Objective link checking while preserving v0.5.0 features. **Not tested inside a live Foundry client.**

- Module ID: `ashen-gate-locations`
- Foundry target: V14 (minimum 14; no unverified compatibility claims)
- Common UI/development standard: `AG-FOUNDRY-DEV/1.6` (GitHub `main`, checked 2026-10-16)
- Data preservation: Existing v0.2.0/v0.3.0 `LOC-*` source records, map registry, Tile bindings, campaign reveal state, published Journals and user folder choices are retained. No automatic migration or overwrite.
- **v0.8.0 is local and UNCOMMITTED.** Its base is published v0.7.0 on GitHub `main`; source/tests are in a separate matching source kit.

## Upgrade / install in a test world

1. Back up your Foundry world and existing `Data/modules/ashen-gate-locations` folder.
2. Disable the module and replace the old folder with this ZIP's `ashen-gate-locations` folder, so the manifest lives at `Data/modules/ashen-gate-locations/module.json`.
3. Enable **Ashen Gate | Locations** and reload Foundry.
4. As GM, open **Items → Location Builder**. The launcher remains GM-only (above Items, after the optional Manager launcher). The module works with Manager disabled.
5. Browse and open your existing v0.2 Locations and published Journals. They should remain unchanged.

## NEW in v0.7.0: pinned resolver and Quest link handoffs

- **Location owner provider:** `api.locationResolver.readEntries()` yields GM-only Location *definitions* with stable domain bindings, never mutable discovery/stock state. `registerWith(resolver)` optionally connects to Archie's pinned `ag-definition-resolver/0.1-prototype`. `unregisterAll()` and `refresh()` help integrated test worlds manage lifecycle; source saves/Journal hooks refresh registered indices.
- **Objective link check:** Library → More → **Check Objective Targets** uses Eli Quest Manager v0.3.1's permission-aware `ag-objective-consumer/0.2-alpha` API when installed/active. `api.checkObjectiveLinks('LOC-EXAMPLE')` is GM-only. An absent Quest module is reported as unavailable, not missing Objectives; links are not auto-revealed or progressed.
- **Privacy:** Player clients cannot read source records or register the GM-only provider, even if a reusable Location has source `visibility:player`. Player publication stays on separate permission-controlled Journals.
- **No migration:** world Locations, resources, reveal state, Journals, map/Tile bindings, access settings, custom pages and Module Manager disabled path all remain as before.
- **Version:** v0.6.0 was reserved by a separate Library candidate, not accepted or source-merged here. This additive v0.5-derived build uses v0.7.0 to avoid reusing that distinct module-version pair. See `RELEASE_NOTES.md` for exact provenance, tests and acceptance.

## Retained from v0.5.0: AG-WORK-0007 independent implementation pass

- **Typed-reference editing fix:** editing the comma-separated targets of an existing relation preserves each surviving target's `required` or `optional` mode; newly added targets start `optional`. Connections tab displays a mode selector for each saved link, enabling GM corrections without an import/export round trip. No mutation occurs until Save Changes.
- **Objective associations:** retains `associated_objective` for existing records and offers a separate `offers_objective` input for Objectives available at a Location. Both use stable `QUEST-*`, `ORDER-*`, or `CONTRACT-*` IDs; both are inert Location-side links and do **not** grant, accept, fulfill, or progress an Objective. Optional Eli Quest Manager integration awaits an approved read/permission contract. No legacy links are silently renamed.
- **Local link audit:** Location Library → More → **Check Location Links** checks local `LOC-*` links for absent/non-Region targets and Objective link ID formats. It does **not** report remote Faction/Objective/Facility/Material IDs as missing when their modules are inactive; this is not a cross-module resolver.
- **GM-owned read adapter:** `api.getLocationSource('LOC-*')` and `api.getLocationObjectiveRefs('LOC-*')` are guarded **GM-only**, returning copies. They read Location-owned world records and do not act as a competing shared resolver or Quest execution API. Names and contracts are alpha-local until the cross-module owner handoff is approved.
- **Theme-ready UI (DEC-0074/0075):** Locations app chrome and inputs consume semantic `--ag-bg`, `--ag-panel`, `--ag-text`, `--ag-muted`, `--ag-border`, `--ag-accent`, `--ag-danger` and `--ag-focus` tokens with built-in fallbacks. No duplicate theme settings, invented Manager theme API, mandatory Manager requirement, or automatic live skin switching.
- **Data safety:** old Location and Map registry records and published Journal pages require no migration. The source transport stays `ag-locations-source/0.1` and the existing `ag-player-access/1` GM-only capability remains unchanged.

## Retained from v0.4.0: GM-only Player Access contract (DEC-0072)

- The current Locations editor is a **GM-only administration interface**, not a player-facing browser. It stays on **Items → Location Builder**, available only to GMs.
- `game.modules.get('ashen-gate-locations')?.api.playerAccess.getState()` returns `{contract:'ag-player-access/1', moduleId:'ashen-gate-locations', audience:'gm-only', playerAccessEnabled:false, configurable:false}`. Manager can show **GM only**, not a toggle.
- This API is a **read-only capability/status report**, also safe to query as a player. There is intentionally **no `setEnabled` method or `playerAccessEnabled` setting**: the GM-only editor cannot be revealed to players.
- Opening or acting in the Location Library, Location Editor and Map Manager continues to require GM authorization; checks now also run when handling retained-window actions and when rendering.
- If a separate player exploration UI is implemented later, it will have its own proper access gate under this contract. Published player Journals still use native Foundry permissions and are **not** hidden/shown by module visibility settings.

## Retained from v0.4.0: minor improvements

- The Location library now has **Clear Filters**, which resets name search, Region, level and gathering tier without deleting or editing any Locations.
- **New** world Journals are placed under typed, nested Foundry Journal folders: `Ashen Gate/Locations/Source Records`, `Ashen Gate/Locations/Published Journals`, and `Ashen Gate/Locations/Map Registry`. Existing matching folders are reused; duplicate matching folders raise an error instead of silently choosing one. The module does **not** move or edit existing Journals/folder assignments.
- The map visibility toggle and Region hierarchy behavior remain as in v0.3.0; neither alters campaign discovery records.

## Retained from v0.3.0: Region hierarchy

- Regions are `entity_type: "Location"`, `kind: "region"`, with a stable `LOC-*` ID.
- Use the **Parent Region** dropdown for a Region; for an ordinary Location the same `belongs_to_region` relationship means **Primary Region**. No new ID prefix or incompatible source format.
- A Region can have **one optional parent Region**. Circular relationships, selecting a non-Region as parent, and nonexistent Region parents are blocked.
- Nested Region paths appear in the library's Region group and the Region selector. Filtering by a parent Region includes its descendant Regions and Locations.
- **No inheritance of gathering tiers, resources, faction control, accessibility, or discovery.** New Region IDs must be created by the GM; this package does not silently generate seven canonical `LOC-*` records.
- For backwards compatibility with v0.2, **ordinary draft Locations** may temporarily point at an as-yet-unsaved primary Region (but a new parent-Region relationship must point to a saved Region).

## Retained from v0.3.0: Map Manager and seven Frontier layers

This feature manages **existing Foundry Scenes and Tile overlays**. It does **not** create/import Scenes, install image assets, adjust image placement, or create a duplicate map backend.

1. Open **Location Builder → Maps → Open Map Manager**.
2. Click **+ Register Map**. Choose a `MAP-*` ID (example suggestion: `MAP-FOSSTRYN-FRONTIER`) and name. **The example is not automatically declared canon.**
3. In **Foundry Scene**, select the exact Scene where your Frontier overlays are already placed.
4. Click **Use 7 Frontier Overlays**. This adds seven local overlay entries with the already used filenames (no new canonical `LOC-*` IDs).
5. Optionally choose your parent Region record under **Associated parent Region**, and choose the matching seven Region records in the per-overlay **Linked Region** dropdowns if those Locations have been created.
6. Click **Save Changes** before showing/hiding Tiles.
7. Use **Show / Hide** per overlay or **Show All / Hide All**. Changes use the existing Scene's Tile `hidden` flags and are visible to players; native Foundry may show hidden Tiles translucently to GMs.
8. If a row says **Tile missing** or **Multiple Tiles match**, choose its **Foundry Tile** manually from the same Scene, save, and try again. The manager matches *exact PNG basenames*, not approximate names.

The seven recognized overlay files are: `fosstryn_approaches.png`, `western_grasslands.png`, `forest_verge.png`, `deepwood_fringe.png`, `eastern_foothills.png`, `riverlands.png`, and `outer_grass_sea.png`. **Map artwork is not included** here. The existing clean base map is left untouched.

A Map is visual metadata: ID, name, target Scene, optional parent Region, and overlay–Tile–Region bindings. The registry lives in a **GM-owned Foundry Journal** named `AG Data • Map Registry` with no player ownership; it is **not** stored in broadly readable world settings. Never manually share this Journal with players.

Map changes and map removal do not alter the underlying Scene/Tiles or any Location's resources, discoveries or Journals. Remove Map is available in the More menu and requires confirmation.

## Existing v0.2.0 features retained

- Standalone GM-only Location library, search + Region/level/tier filters, grouped records and five editor tabs: Overview, Resources, Connections, Maps & Scenes, Journal Preview.
- Source records persist in GM-only Foundry world Journals and use the canonical seven-field record envelope plus typed refs.
- Resource MAT/RES references, abundance, description, narrative POIs, map refs and Scene UUID links.
- Separate campaign reveal selection flags for resources, references and POIs. These **are not** affected by the Map Manager's visual toggles.
- Save → Preview → explicit GM Publish to player-facing Journal, with protection of hand-authored custom pages.
- `ag-locations-source/0.1` Location definitions JSON import/export, stable IDs and explicit revision conflicts; **map registry is not in that export**. This transport is still experimental, **not** the approved full `ag-source-package/0.1` manifest/Manager projection.
- The module API (with no Manager dependency):
  - `game.modules.get('ashen-gate-locations')?.api?.openLibrary()`
  - `.api.openEditor('LOC-...')`
  - `.api.openMaps()` or `.api.openMaps('MAP-...')`

## Boundaries and known limitations

- No automatic map-note placement, location pins, Fog/reveal automation, route discovery, travel event rules, stock/depletion, profession XP, or faction changes.
- Layer toggle visibility is **world Scene Tile visibility**, not character-specific Region discovery. Hiding an overlay does not hide the base map or every site in the Region.
- Registry entries and Tile bindings are stored only in this Foundry world, not included with the existing Location source JSON export. Back up the world before switching packages or worlds.
- No automatic ZIP importer or import of the map overlay PNGs; the seven existing placed Tiles must remain in your Scene.
- Region links to other systems use canonical IDs but are not yet live cross-module validated. Local link checks only verify Location-local targets and Objective ID shape, not external existence.
- A separate v0.6.0 candidate appears in the Work Queue, but is not installed/accepted by the GM. This v0.7.0 package descends directly from the provided v0.5.0 source; do not infer it contains independent v0.6.0 changes.
- Mixed Foundry/browser versions, CSS responsiveness, live player/GM permissions and interactive click-through behavior must be verified in your real Foundry V14 test world.
- The module does not alter v0.2.0 record storage or published Journals during installation. World revisions increase only on deliberate saves. An attempted multi-record import can still partially complete if Foundry fails mid-write; use a backed-up test world.
- Missing parents on historic ordinary Location drafts are tolerated, but must be reconciled before treating those definitions as final content.

## First beta test in Foundry

1. Upgrade in a backed-up world, and verify **Items → Location Builder** opens for a GM but not a player.
2. Create two `LOC-*` Region records, assign the second's Parent Region to the first, save both; verify nested filtering and a blocked circular assignment.
3. Open **Maps**, register your existing Fosstryn Frontier Scene and choose the seven-layer preset. Save.
4. Toggle one overlay and then Show All / Hide All, verifying seven Tiles change but the background does not; players should see the expected result.
5. Open an existing Location, save, preview, publish a Journal, and verify custom pages still survive.
6. Re-open Map Manager, verify persisted bindings. Turn Manager off and test the standalone Locations launcher.
7. **DEC-0072 test:** With Manager installed, open its Player Access panel and confirm Locations displays **GM only**, with no player toggle. Sign in as a player and verify Items lacks the Location Builder launcher; the player cannot run `.api.openLibrary()`, `.api.openMaps()` or `.api.openEditor('LOC-...')`. The harmless `.api.playerAccess.getState()` should return `gm-only`.
8. Create a fresh disposable Location in a backed-up world, then Save → Preview → Publish and verify source and published Journals appear in their respective new folders. The existing Journals must **not** move. Confirm a new Map registry Journal uses its folder when first created.
9. Use **Clear Filters** and check that all Library filters reset. Verify the old Map Manager still hides and shows the seven overlay Tiles without modifying the base image. Test Manager disabled.
10. Send the exact Foundry V14 and dnd5e versions, screenshot and console errors from any failure.

## Tests and source

Run `node --test tests/*.test.mjs` in `ashen-gate-locations/`; run `node --check` on all `scripts/*.js`.

Source files include `scripts/model.js` (Location rules/hierarchy), `scripts/maps-model.js` (pure map validation/matching), `scripts/main.js` (GM UI, world Journal persistence, Tile commands), `scripts/launcher.js`, `scripts/player-access.js`, `scripts/journal-folders.js`, and scoped `styles/locations.css`.

See `RELEASE_NOTES.md` for test evidence and migration limits; `CHANGELOG.md` for version lineage.
