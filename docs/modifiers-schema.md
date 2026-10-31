# Modifiers and implementation schema (General Manager 0.41.0+)

This is the reference for giving an ordinary item or perk a **module number**: something only one Ashen Gate module understands, such as the Strain cost of a Push. It is generic: there is no setting content here, and every example uses synthetic `[TEST]` data. **No number in this file is a rule**; the examples show shape only.

The design behind it is [perks-and-modifiers-architecture.md](perks-and-modifiers-architecture.md). A complete working set is in [`test-fixtures/modifiers/`](../test-fixtures/modifiers/), with common mistakes in `invalid/`. Check your own files with `node scripts/validate-content.mjs <file-or-folder>`.

## Two layers

| You want to change… | Use | Applied by |
|---|---|---|
| A dnd5e number: AC, speed, saves, skills, resistances, a condition | An **Active Effect** in `foundry.data.effects`, with an `eff_id` and an explicit `transfer` ([item-effects-schema.md](item-effects-schema.md)) | dnd5e |
| A number only an Ashen Gate module knows: Push cost, Backfire chance, … | A **modifier** in the record's `modifiers` block (this file) | The module that owns the modifier's `scope` |

`transfer` is always written out. Use `false` on companion items and Cinder socket items, which sit on the character but are meant for something else.

## The `modifiers` block (`ag-modifiers/0.1`)

An optional block at record level (beside `foundry`, not inside it), allowed on **`ITEM-*` and `PERK-*` records**. A `POWER-*` record keeps its modifiers in `power.modifiers` ([cinder-strain-schema.md](cinder-strain-schema.md)).

| Field | Type | Required | Rules |
|---|---|---|---|
| `schema` | string | yes | `"ag-modifiers/0.1"` |
| `scope` | string | no | The default scope for every entry in `list`. |
| `list` | list | yes | 1 to 20 modifiers (`ag-modifier/1`, below). |

### A modifier (`ag-modifier/1`)

| Field | Type | Required | Rules |
|---|---|---|---|
| `target` | string | yes | A key from the scope's published list (below), e.g. `push.cost`. |
| `value` | whole number | yes | Not 0. The scope sets the range. |
| `label` | string | yes | 1–80 characters, shown to players wherever the modifier is used. |
| `scope` | string | yes, unless the block has one | Which module interprets it: `cinder` or `travel`. |
| `op` | string | no | `"add"`, the only operation (and the default). |
| `applies` | object | no | Narrows the target. Its keys are defined by the scope. |
| `stack` | string | no | A short lower-case group name. What a group does is set by the scope. |
| `requires` | object | no | Prerequisites as lists of canonical ids, keyed by kind (e.g. `{"powers": ["POWER-…"]}`). The scope says which kinds it reads. |

Any other field is refused. A scope may allow a few aliases (Cinders: `powers`, `modes`).

### Scopes

| Scope | Owner | Targets | `applies` / aliases | `requires` | Stacking |
|---|---|---|---|---|---|
| `cinder` | Ashen Gate \| Cinders | `push.cost`, `backfire.chance`, `backfire.severity`, `strain.recovery`, `sockets.count` (0.3.0+) (see [cinder-strain-schema.md](cinder-strain-schema.md) → Modifiers); value −100 to 100 | `applies.powers` (`POWER-*` ids), `applies.modes` (Push mode ids); `powers` / `modes` at the top level mean the same | `powers` | Same `stack` name: only the largest size counts. No `stack`: always adds. |
| `travel` | Ashen Gate \| Locations (0.37.0+) | `travel.actions`, `travel.efficiency`, `scout.precision`, `explore.range`, `condition.mitigation` ([below](#the-travel-scope)); whole numbers, all positive | `applies.terrain`, `applies.condition`, `applies.when` | none (`requires` is refused) | Same `stack` name: only the highest value counts. No `stack`: the same target and `applies` form one group. Different groups add, up to a per-target cap |

A new scope, or a new target in a scope, is added by the owning module's own release and then listed here. Don't write one before it is listed.

For reference, the other rules already in the suite (these are not `modifiers` scopes yet): Headquarters hireling perks use "first eligible perk per `overlap_group` wins, unless `allow_overlap`"; Character Hub adds up companion item Active Effects for display.

**When a modifier counts** is the scope owner's call, documented in its own schema. For `cinder` (Cinders 0.2.0+): a `PERK-*`'s modifiers count while the character has the perk Item, for every Cinder they bear; an `ITEM-*`'s count only while it is in an active socket of a Cinder (Cinders 0.3.0+; an `ITEM-*` with cinder modifiers is what fits a socket). Details: [cinder-strain-schema.md](cinder-strain-schema.md) → Modifiers.

## The `travel` scope

Light travel, owned by Ashen Gate | Locations (0.37.0+). The GM adjudicates at the table; Locations only adds up what the party carries and shows it in the **Travel** tab, in a GM-only section (players never see the totals, conditions or sources). The party shares 3 actions a day (Travel, Scout, Explore).

| Target | Value (one entry) | Total cap | Meaning | `applies` |
|---|---|---|---|---|
| `travel.actions` | 1 or 2 | +2 | Bonus daily actions | `when` |
| `travel.efficiency` | 1 | +2 per terrain | Steps of terrain cost removed for Travel | `terrain` (optional): a list from `difficult-terrain`, `marsh`, `forest`, `hills`, `grassland`, `road`. Left out: every terrain |
| `scout.precision` | 1 or 2 | +2 | Precision steps for Scout. A guide, not a rule: 0 direction only, 1 a named region or quadrant, 2 a named landmark or route; anything finer is the GM's call | `when` |
| `explore.range` | 1 | +2 | Extra rings of tiles surveyed by Explore | `when` |
| `condition.mitigation` | 1 to 3 | +3 per condition | Steps a **named** condition is reduced. No blanket immunity | `condition` (**required**, one id of the six, see [Conditions](#conditions-the-six)): `harsh-weather`, `hard-ground`, `poor-visibility`, `warped-paths`, `blight-taint`, `ashen-menace`. Any other id is an error that says to update the pack and re-import |

Every entry is a whole number, not 0, and positive; a value outside its range is refused. `applies.when` is optional on every target and is a list from a closed set: `mounted`, `familiar_terrain` (all listed must hold). Any other `applies` key or value, `applies.terrain` on a target other than `travel.efficiency`, `applies.condition` on a target other than `condition.mitigation`, a missing `applies.condition`, `requires`, or an unknown target is an error. `op` is `add`; `stack` is a short lower-case group name; `label` is 1 to 80 characters.

**Stacking.** A *stacking group* is the entry's `stack` name (within its target) or, with none, its target plus its `applies`. Within one group only the **highest** value counts, and that includes the whole party: if three characters carry the same group, the best source counts once. Different groups add. Then the per-target cap above is applied (for `travel.efficiency`, per terrain: an entry with no `applies.terrain` counts toward every terrain; for `condition.mitigation`, per named condition: the party total for one `applies.condition` stops at +3, applied after stacking, and a different condition has its own +3). The Travel tab's Party modifiers table (GM only) and `api.overland.partyModifiers()` rows carry `cap` and `capped` (true when the uncapped sum is above the cap; a sum of exactly the cap is not flagged).

**When an entry counts.** The module reads the imported definition. An `ITEM-*` or `PERK-*` counts while it is on a party character (a player-owned `character` Actor); wearable equipment (an `equipment` Item) also has to be equipped. An entry with `when: mounted` counts only while the GM's **Mounted** switch is on. If Character Hub is active and shows an item assigned to a character's mount (its `api.companions`), that item counts only while Mounted is on; without the Hub every item simply counts when it is on the character. `familiar_terrain` is the GM's call: the entry is listed but never added to the totals. Nothing is applied to a roll or a speed; the numbers inform the GM.

### Conditions: the six

There are exactly six conditions, fixed, in one list called **Conditions** (0.39.0: there is no separate hazard class). Each influences travel in its own way, and each can be mitigated by items, perks, spells, mounts and so on through `condition.mitigation`. Nothing else is accepted in `applies.condition`: the old ids (`cold`, `heat`, `rain-and-wind`, `dust-and-ash`, `darkness`, `difficult-terrain` and the region ids such as `mist-and-soft-ground`, `rising-water`) are errors, so update the pack and re-import.

| id | Label | Covers | What the action calculator does with it (GM only; nothing is rolled or applied) |
|---|---|---|---|
| `harsh-weather` | Harsh Weather | rain, wind, storm, cold, heat | Severity 2+: exposed Travel costs one more action. Severity 3: Explore range -1. |
| `hard-ground` | Difficult Terrain | marsh, scree, undergrowth, snow, mud | Severity 2+: Travel into the area costs one more action. |
| `poor-visibility` | Poor Visibility | mist, haze, dimness, night, dust | Severity 2+: Explore range -1 (-2 at 3) and Scout precision -1. |
| `warped-paths` | Warped Paths | false trailmarks, misleading lights and sounds | 1+: Travel flags possible displacement. 2: Scout navigation uncertain, precision at most 1. 3: anomalous. |
| `blight-taint` | Blight Taint | Blight-touched ground and weather | The GM's call (spoilage, Strain exposure); no action penalty. 2+ raises encounter pressure. |
| `ashen-menace` | Ashen Menace | Ashen creatures abroad | No action penalty; sets the encounter pressure label. |

(`hard-ground` is the permanent id; its label has been **Difficult Terrain** since 0.39.0. It is a different thing from the terrain id `difficult-terrain` used by `applies.terrain`.)

Content authors never author conditions: only these six exist, and no record defines, renames or adds one. Severity is 0 (absent), 1 (present), 2 (severe) or 3 (extreme). Records only carry `condition.mitigation` entries that *name* one of the six.

**Where severities come from (0.40.0).** *Persistent* conditions live on Locations and Regions as the GM-only `overlandConditions` field (a sparse `{conditionId: 0..3}`; omitted = not set here; see the Locations README). The nearest level that sets a condition wins (an explicit 0 clears an inherited value) and severities never add across levels. *Daily* conditions (weather and temporary effects) are an overlay for the whole day, set in the Travel tab for all areas or the current area; **New day…** clears only these. For an action the effective severity of each condition is **max(place, daily)**, never the sum. A GM override (one condition and a severity, for one preview) replaces the computed severity for that condition.

**The action calculator (GM only; plain words).** Every action costs 1 to start. Conditions add at most **+1 in total** to Travel's cost: Harsh Weather 2+ (exposed travel) or Difficult Terrain 2+ (into the destination), both together still +1. Then the party's mitigation against the condition that caused it and its `travel.efficiency` for the destination terrain take it back down; the cost is never below 1 or above 2. Explore's survey range is 1 ring plus the party's `explore.range` (cap +2), minus 1 for Poor Visibility 2+ (minus 2 at 3) and minus 1 for Harsh Weather 3, never below 0 (0 is the current tile, which still reveals useful local information). Scout's precision is 0 plus `scout.precision` (cap +2), minus 1 for Poor Visibility 2+, held to 0 to 2; Warped Paths 2+ makes navigation uncertain and holds precision to at most 1, and 3 makes it anomalous. Travel with Warped Paths 1+ flags possible displacement for the GM to resolve. Range, precision and navigation read the severity **after** the party's mitigation (severity minus mitigation, at least 0). **Encounter pressure** reads the effective severities only: *elevated* with Ashen Menace 1 or Blight Taint 2+, *high* with Ashen Menace 2 or (Ashen Menace 1 and Blight Taint 2+), *dominant* with Ashen Menace 3; mitigation never changes it.

**Mitigation protects the party only.** It is applied after the condition is determined and never lowers a condition on a Location or Region. Blight Taint and Ashen Menace have no default action penalty; mitigating them only changes the GM's guidance line to say the party is protected from them. The calculator returns GM-only guidance (effect types per condition, shown only when relevant to the action) and never rolls, spawns an encounter or touches a character. `api.overland.previewAction()` and `resolveAction()` (GM only) expose it; the Locations README has the result shapes. Players never see severities, mitigation, guidance, pressure or modifiers; the Journal card for a resolved action carries only the action, the area name and the cost.

```json
"modifiers": {"schema": "ag-modifiers/0.1", "scope": "travel", "list": [
  {"target": "travel.efficiency", "value": 1, "label": "[TEST] Trail Boots", "applies": {"terrain": ["forest", "hills"]}},
  {"target": "condition.mitigation", "value": 2, "label": "[TEST] Trail Boots (damp)", "applies": {"condition": "poor-visibility"}, "stack": "footwear"},
  {"target": "travel.actions", "value": 1, "label": "[TEST] Saddle Flask", "applies": {"when": ["mounted"]}}]}
```

A complete package: [`test-fixtures/modifiers/AG_Test_Travel_Items.json`](../test-fixtures/modifiers/AG_Test_Travel_Items.json); mistakes in `invalid/travel-*.json`. Locations' owner check is `api.modifiers` (same contract as below) and is exported as `validateModifiers` from `modules/ashen-gate-locations/scripts/travel-modifiers.mjs`.

## The `implementation` field

An optional, **display-only** field on any perk-like record (`PERK-*`, `POWER-*`, `ITEM-*`, …). It tells the GM, players and authors what to expect. Nothing reads it to decide what happens.

| Value | Meaning |
|---|---|
| `automatic` | A module or dnd5e applies it (Active Effects or modifiers). |
| `informational` | Shown only; it changes nothing. |
| `gm_resolved` | The GM decides when and how it applies. |

`HPERK-*` hireling perks keep Headquarters' own required `implementation`, which also allows `hybrid`.

## What General Manager does

- **Import.** The blocks are stored with the record's definition (`flags.ashen-gate-manager.source.definition`), exactly as written. Manager never applies a modifier.
- **Checks the shape** above (schema, list size, known scope, fields, `op`, whole-number value not 0, label, stack, `applies`, `requires`). A mistake blocks the import.
- **Asks the scope owner** to check each entry's target, range, `applies` and `requires`, through the owner's public API, in the Import preview and again just before Apply. If the owner is not active, or is a version that does not check modifiers yet, the records **still import** with one warning ("not checked").
- **Never touches live play state**: no Cinder, socket, bearer or Strain changes. A re-import updates the definition only.

Ashen Gate | Cinders 0.2.0+ checks `cinder` modifiers (with 0.1.0 they import with the "not checked" warning). Ashen Gate | Locations 0.37.0+ checks `travel` modifiers (General Manager 0.88.0+ asks it; without Locations, or with an older one, they import with the same warning). An `ITEM-*` with cinder modifiers gets a preview note that it counts only while attached to a Cinder socket.

### For module builders: the owner check

A scope owner exposes, on its module API:

```js
game.modules.get('<owner-id>').api.modifiers = {
  contract: 'ag-modifier/1',
  validate(entries, {recordId, record}) { return {errors: [], warnings: []}; }
};
```

- `entries` is `[{index, scope, modifier}]`: the record's entries for that scope, with `scope` filled in from the block when the entry left it out, and `index` the position in `list`.
- Errors block the import; warnings show in the preview. Start messages with the record id.
- The same function, exported from the module's engine file as `validateModifiers`, is what `scripts/validate-content.mjs` calls.

## Synthetic example

```json
{"manifest": {"schema_version": "ag-foundry-import/0.2", "package_id": "AG-TEST-MODIFIERS", "version": "1.0.0"},
 "records": [
  {"id": "ITEM-TEST-EMBER-LENS", "entity_type": "Item", "status": "approved", "version": "1.0.0",
   "provenance": {"sources": ["Synthetic test data (not canon)"]}, "visibility": "player", "refs": [],
   "implementation": "automatic",
   "modifiers": {"schema": "ag-modifiers/0.1", "scope": "cinder", "list": [
     {"target": "push.cost", "value": -1, "label": "[TEST] Ember Lens"},
     {"target": "backfire.chance", "value": -5, "label": "[TEST] Ember Lens (steady)", "stack": "lens",
      "applies": {"powers": ["POWER-TEST-SPARK"], "modes": ["amplify"]}}]},
   "foundry": {"document_type": "Item", "folder_path": "Ashen Gate/Test/Items", "data": {"name": "[TEST] Ember Lens", "type": "loot"}}},
  {"id": "PERK-TEST-QUIET-WORD", "entity_type": "ProfessionPerk", "status": "approved", "version": "1.0.0",
   "provenance": {"sources": ["Synthetic test data (not canon)"]}, "visibility": "player", "refs": [],
   "implementation": "gm_resolved",
   "foundry": {"document_type": "Item", "folder_path": "Ashen Gate/Test/Perks", "data": {"name": "[TEST] Quiet Word", "type": "feat"}}}
 ]}
```

Common mistakes (each in `test-fixtures/modifiers/invalid/`):
- a scope that isn't listed (`"scope": "hq"`);
- no scope on the entry or the block;
- an `implementation` outside the three values.
