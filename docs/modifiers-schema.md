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
| `scope` | string | yes, unless the block has one | Which module interprets it. Today only `cinder`. |
| `op` | string | no | `"add"`, the only operation (and the default). |
| `applies` | object | no | Narrows the target. Its keys are defined by the scope. |
| `stack` | string | no | A short lower-case group name. What a group does is set by the scope. |
| `requires` | object | no | Prerequisites as lists of canonical ids, keyed by kind (e.g. `{"powers": ["POWER-…"]}`). The scope says which kinds it reads. |

Any other field is refused. A scope may allow a few aliases (Cinders: `powers`, `modes`).

### Scopes

| Scope | Owner | Targets | `applies` / aliases | `requires` | Stacking |
|---|---|---|---|---|---|
| `cinder` | Ashen Gate \| Cinders | `push.cost`, `backfire.chance`, `backfire.severity`, `strain.recovery` (see [cinder-strain-schema.md](cinder-strain-schema.md) → Modifiers); value −100 to 100 | `applies.powers` (`POWER-*` ids), `applies.modes` (Push mode ids); `powers` / `modes` at the top level mean the same | `powers` | Same `stack` name: only the largest size counts. No `stack`: always adds. |

A new scope, or a new target in a scope, is added by the owning module's own release and then listed here. Don't write one before it is listed.

For reference, the other rules already in the suite (these are not `modifiers` scopes yet): Headquarters hireling perks use "first eligible perk per `overlap_group` wins, unless `allow_overlap`"; Character Hub adds up companion item Active Effects for display.

**When a modifier counts** is the scope owner's call, documented in its own schema. For `cinder` (Cinders 0.2.0+): a `PERK-*`'s modifiers count while the character has the perk Item, for every Cinder they bear; an `ITEM-*`'s count only while it is attached to a Cinder socket (a later Cinders release). Details: [cinder-strain-schema.md](cinder-strain-schema.md) → Modifiers.

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

Ashen Gate | Cinders 0.2.0+ checks `cinder` modifiers (with 0.1.0 they import with the "not checked" warning). An `ITEM-*` with cinder modifiers gets a preview note that it counts only once attached to a Cinder socket.

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
