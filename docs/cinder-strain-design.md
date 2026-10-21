# Cinder instances, Strain, Push and Backfire — design (DRAFT)

Status: **Phase 0 draft, not built.** Revision 2: Robb's answers to decisions a–g folded in (section 9); points still to confirm are marked **Confirm**. Nothing here is approved rules content. Every number and name below that is a campaign rule is a *configurable default* or an *open decision* (section 9). Campaign names (Cinder types, band names, power names) arrive through content import, never through engine code. Examples use synthetic `[TEST]` data.

Target: Foundry V14 on The Forge, dnd5e 6.0.6 (2024 rules).

## 1. Who owns what

| Capability | Owner | Why |
|---|---|---|
| Strain value, history, band/Backfire-schedule config, modifier aggregation, Backfire probability, Strain API and change hook | **new module `ashen-gate-strain` ("Ashen Gate \| Strain")** | Strain is a character-wide resource used by Cinders, crafting, hazards, exploration and encounters. Putting it in Skill Trees would make the Profession Ledger or Locations depend on a progression module to add a hazard point; putting it in Character Hub would put state in a presentation module; Utilities is party/table tools. A small dedicated module is the only home that every writer can feature-detect without pulling in an unrelated module. It owns exactly one piece of Actor state. |
| Cinder instances (id, definition, bearer, progression, bound state, push log), assign/remove/transfer, POWER-* Item grants, Push definitions read from POWER-* sources, Push resolution, the `cinder` modifier provider | **Skill Trees** (`ashen-gate-skill-trees`) | It already owns `cinder_milestone` trees, POWER-* nodes, the 13-point Cinder wallet, perk-Item grants with tags, GM-client unlock relay and per-actor locks. Instances are the existing Cinder wallet moved off the Actor onto an instance record. |
| Display of Strain (value, band, Backfire chance, modifiers), Cinder panel with Push button, GM controls entry points | **Character Hub** | Presentation only. The Hub has no registration API (its `PANELS` list in `partners.mjs` is fixed), so the Hub PR adds two entries that mount `strain.embed` (mode `character`) and Skill Trees `embed` (mode `cinder`), detected through `api.embed.modes`, plus `strain`/`cinder` parts in its Player Visibility (`visibility.mjs`). It stores nothing. |
| Import + validation of MUT-* / POWER-* definitions and the Strain config file | **General Manager** (+ `scripts/validate-content.mjs`) | Manager already owns source-definition import. It delegates the typed `cinder`/`power` blocks to Skill Trees' validator and the Strain config to the Strain module's validator, both feature-detected. |
| Writers of non-Cinder Strain (crafting mishap, hazard, exploration, encounter) | each specialist module | They call `strain.add(...)` with their own `source`. No module keeps its own Strain pool. |

Rules kept: independent modules, each owns its own state; partners are feature-detected through `game.modules.get(id)?.api` with a `contract` string; GM-only operations are rejected in the API layer (not only hidden); import never writes live state; every migration is safe to run again.

Missing-partner behaviour:
- Strain without Skill Trees: works (other sources can still add Strain).
- Skill Trees without Strain: Cinder instances, transfer and unlocks work; **Push is refused** ("Install/enable Ashen Gate | Strain") because every Push must gain Strain.
- Hub without either: the panels say the module is not active.
- Manager absent: worlds keep working; definitions just can't be (re)imported.

## 2. Definitions (imported content, read-only at runtime)

### 2.1 Cinder definition — `MUT-*` (`entity_type: "Mutation"`)

"Cinder" is the setting skin of the generic Mutation entity. A definition is reusable; many instances can be made from it. It carries an optional typed block:

```json
{
  "id": "MUT-TEST-EMBER",
  "entity_type": "Mutation",
  "status": "test",
  "visibility": "player",
  "cinder": {
    "schema": "ag-cinder/0.1",
    "tree_id": "TEST-EMBER-TREE",
    "starting_powers": ["POWER-TEST-EMBER-SPARK"],
    "gm_notes": "GM only; never projected to players."
  },
  "foundry": {"document_type": "Item", "data": {"name": "[TEST] Ember Cinder", "type": "feat"}}
}
```

Nine (or any number of) definitions are just nine records; there is no list in code.

### 2.2 Power definition — `POWER-*` (`entity_type: "Power"`)

Every node on a Cinder tree is a POWER-* record. A node is either a **power** (a usable ability) or an **enhancement** (a mastery/control perk that only carries modifiers). Typed block:

```json
{
  "id": "POWER-TEST-EMBER-SPARK",
  "entity_type": "Power",
  "power": {
    "schema": "ag-power/0.1",
    "kind": "power",
    "cinder": "MUT-TEST-EMBER",
    "standard": {"summary": "[TEST] Normal use text.", "uses": {"max": 2, "recovery": "long_rest"}},
    "requires": {"powers": []},
    "push_modes": [
      {"id": "amplify", "label": "[TEST] Amplify", "category": "amplify",
       "strain_cost": 2, "effect": {"summary": "[TEST] Bigger effect.", "refs": []},
       "requires": {"powers": []}, "limit": null,
       "backfire": {"table": "BF-TEST-GENERIC"}},
      {"id": "overreach", "label": "[TEST] Overreach", "category": "exceed_limit",
       "strain_cost": 3, "effect": {"summary": "[TEST] Use beyond normal uses."},
       "backfire": {"table": "BF-TEST-GENERIC"}}
    ],
    "modifiers": []
  },
  "foundry": {"document_type": "Item", "data": {"name": "[TEST] Spark", "type": "feat"}}
}
```

- `category`: `amplify` | `alter` | `exceed_limit` (the three Push kinds in the spec). Several modes per power.
- `standard.uses` reuses dnd5e Item uses on the granted Item (no parallel counter). Normal use never rolls Backfire unless decision (g) says so.
- `effect` is recorded and shown; the engine does **not** auto-apply damage/healing in v1 (GM/dnd5e applies them). Only the typed effects in 4.3 are automated.
- Enhancement nodes: `"kind": "enhancement"`, no `push_modes`, non-empty `modifiers`.

### 2.3 Backfire consequence table — `BF-*` (`entity_type: "BackfireTable"`)

```json
{"id": "BF-TEST-GENERIC", "entity_type": "BackfireTable",
 "backfire": {"schema": "ag-backfire/0.1",
  "entries": [
   {"id": "jolt", "severity": 1, "type": "condition", "status": "poisoned", "duration": {"rounds": 1}, "summary": "[TEST]"},
   {"id": "fizzle", "severity": 1, "type": "power_disruption", "duration": {"until": "short_rest"}, "summary": "[TEST]"},
   {"id": "drain", "severity": 2, "type": "resource", "resource": "hit_dice", "amount": 1, "summary": "[TEST]"},
   {"id": "omen", "severity": 3, "type": "narrative", "summary": "[TEST] GM adjudicates."}
  ]}}
```

Each entry has a `severity` (integer ≥ 1) and an optional `weight` (default 1) used by the consequence roll (4.1 step 5).

Allowed consequence `type`s (closed list, validator-enforced): `condition` (a dnd5e status as a temporary ActiveEffect; **duration required**; `dead`, `unconscious` and exhaustion are not allowed), `power_disruption` (a power of the instance cannot be used/pushed for a duration), `resource` (spend dnd5e uses/hit dice/slots, floored at 0, never HP), `strain` (extra Strain, never triggers another roll), `narrative` (recorded; the GM adjudicates). **There is no type that kills, deletes, consumes or erases a character, an instance or its progression**, and the engine has no code path that does — see 4.4.

## 3. Live state (never written by import)

### 3.1 Strain — on the Actor, owned by `ashen-gate-strain`

`actor.flags['ashen-gate-strain'].state`:

```json
{"schema": "ag-strain-state/1", "value": 4, "revision": 17,
 "history": [
  {"id": "h_…", "at": 0, "by": "userId", "delta": 2, "from": 2, "to": 4, "overflow": 0,
   "source": {"module": "ashen-gate-skill-trees", "kind": "cinder_push", "ref": "POWER-TEST-EMBER-SPARK"},
   "reason": "[TEST] Amplify", "opId": "op_…", "visibility": "player"}
 ]}
```

- One number per Actor. Raw Strain only changes through `add` / `remove` / `set`; nothing else writes it. Perks never touch it.
- History keeps the last 100 entries (`visibility: gm` entries are hidden from players).
- `opId` makes writes idempotent: a write whose `opId` is already in history returns the earlier result and changes nothing (safe retries and recovery).
- Modifiers are **not stored here**. They are computed on read from registered providers (3.3), so no module duplicates another's state.

World config (`ashen-gate-strain` world setting, GM-editable, importable as `ag-strain-config/0.1`):

```json
{"schema": "ag-strain-config/0.1", "min": 0, "max": 10,
 "backfire_schedule": [0,5,10,20,25,35,50,60,75,90,100],
 "bands": [{"from":0,"to":0,"label":"Band 0"},{"from":1,"to":2,"label":"Band 1"}, "…", {"from":10,"to":null,"label":"Band 6"}],
 "hard_max": null,
 "guarantee_from": 10,
 "normal_use_backfire_at": 10,
 "allow_prevention_at_guarantee": false,
 "rest_recovery": {"long": 1, "short": 0},
 "severity_roll": {"enabled": true, "die": "1d4"},
 "initial_cinder_points": 1}
```

- `min` is the floor (0). There is **no cap at 10**: raw Strain can go above it. `hard_max` is an optional sanity ceiling (`null` = none); gain beyond it is recorded as `overflow` in history, never lost silently.
- `backfire_schedule[i]` is the chance at Strain `i`; any Strain above the last index uses the last entry. At or above `guarantee_from` every Push backfires.
- At or above `normal_use_backfire_at` (default 10) every normal (non-Push) use of a Cinder power also backfires automatically (4.5). So at 10+ any use of the power backfires; below 10 only a Push can.
- `allow_prevention_at_guarantee` (default off): when off, modifiers still change gain, severity and consequences at or above the guarantee but cannot bring the chance below 100.
- The shipped defaults are the schedule from the spec and neutral labels `Band 0…Band 6` (the last band is open-ended); the campaign's band names come in through this file from the private content repo.

### 3.2 Cinder instance — owned by Skill Trees

Authoritative registry: a GM-only Journal `[AG] Skill Trees — Cinder Instances` (no player ownership), flag `instances`:

```json
{"instanceId": "cinst_Ab12Cd34Ef56Gh78", "definitionId": "MUT-TEST-EMBER", "treeId": "TEST-EMBER-TREE",
 "label": "", "status": "bound",
 "bearer": {"actorId": "…", "since": 0},
 "progression": {"awarded": 3, "unlocks": ["n1","n2"], "grants": [{"key":"milestone-1","amount":1}], "revision": 5, "history": []},
 "bound": {"since": 0, "by": "gmUserId"},
 "usage": {"POWER-TEST-EMBER-SPARK": {"disruptedUntil": null}},
 "pushLog": [], "pending": null, "revision": 9, "createdAt": 0, "migratedFrom": null}
```

- `instanceId` is world-local, random, permanent; distinct from `definitionId` (MUT-*).
- `progression` reuses the existing account shape (`cleanAccount`), so trees, prerequisites, refunds and undo keep working unchanged — only the storage location moves.
- `status`: `unbound` | `bound` | `lost` (bearer Actor deleted; progression kept) | `retired` (GM).
- **Bound** means bound: a bearer cannot release a Cinder. There is no player unbind action, no mechanical attunement step and no waiting state; only the GM can unassign or transfer, when the story allows it. A newly bound bearer can use and Push at once.
- Bearer mirror on the Actor: `flags['ashen-gate-skill-trees'].cinders = [{instanceId, definitionId, revision}]` — a pointer the owner's client can read; the registry wins on any disagreement and the GM-client reconcile repairs the mirror.
- Player view: the published projection of the bearer's instance (definition name, unlocked public nodes, points, push modes they can use) is written to the mirror by the GM client. `gm_notes`, hidden nodes and other bearers' instances never reach players.

Invariants (checked on every write and by the Saved-data check):
1. An instance has at most one bearer.
2. An Actor bears at most `maxCindersPerActor` instances (setting, default 1).
3. Each unlocked POWER node of a bound instance has exactly one granted Item on the bearer, tagged `{instanceId, treeId, nodeId, perkId}`; no other Actor has an Item with that `instanceId`.

### 3.3 Typed modifier contract

A modifier is data on a POWER (enhancement or power) definition, contributed while that node is unlocked on the instance the Actor bears. Skill Trees registers a provider with the Strain module: `strain.registerModifierProvider('ashen-gate-skill-trees', actor => [...modifiers])`. Other modules may register providers too (e.g. a future item).

```json
{"id": "MOD-TEST-STEADY-1", "target": "backfire.chance", "op": "add", "value": -10,
 "scope": {"powers": ["POWER-TEST-EMBER-SPARK"], "push_modes": ["amplify"], "sources": ["cinder_push"]},
 "stack": "steadiness", "stack_rule": "best",
 "requires": {"powers": [], "strain_at_least": null, "strain_at_most": null},
 "label": "[TEST] Steady Hands"}
```

Targets (closed list):

| target | meaning | value |
|---|---|---|
| `push.cost` | Strain cost of a Push before gain modifiers | integer |
| `strain.gain` | any Strain gain matching `scope.sources` | integer |
| `backfire.chance` | percentage points on the scheduled chance | integer |
| `backfire.severity` | shift severity of the selected entry (min 1) | integer |
| `backfire.table` | use another BF-* table for matching pushes | BF-* id (op `set`) |
| `strain.recovery` | amount removed by a recovery matching `scope.sources` (rest, item, spell, …) | integer |
| `push.mode.grant` | adds a Push mode to a power | push mode object (op `grant`) |
| `push.mode.revoke` | removes a Push mode (tradeoffs) | mode id (op `revoke`) |
| `power.uses.max` | adjusts standard uses of a power | integer |

`op`: `add` | `multiply` (rounded toward zero, applied after adds) | `set` | `min` | `max` | `grant` | `revoke`.

Stacking and order (deterministic):
1. Collect modifiers whose `scope` and `requires` match the Push (or the Strain gain).
2. Within one `stack` group apply `stack_rule`: `sum` (default), `best` (largest benefit only), `worst`. Modifiers without `stack` each form their own group.
3. Apply in phases: `set` → `add` → `multiply` → `min`/`max`, ties by `id`.
4. Clamp: `push.cost` and the final gain are **at least 1** (every Push gains Strain); chance to 0–100; severity ≥ 1.
5. Every applied and skipped modifier is returned by `strain.explain()` / the Push preview with its label and why — nothing silent.

A modifier can change cost, gain, chance or consequences. **No target can lower raw Strain**: recovery is a separate, explicit `remove` event governed by decision (a).

## 4. Push

### 4.1 Resolution order

Runs on the active GM client (`game.users.activeGM`; player Pushes are relayed by the Skill Trees socket exactly as unlocks are today, and the GM client re-checks ownership, Player Access and bearer), inside the actor lock and the instance lock. Strain writes from other modules follow the same rule: `add/remove/set` throw `GM only` on a player client, so each module relays its own player actions to its GM client, as the Ledger and Utilities already do.

1. **Select**: the Actor bears the instance; the power is unlocked; the mode is available (base modes + `grant` − `revoke`); `requires` met; power not disrupted; mode `limit` not exhausted; Strain module present.
2. **Cost**: `cost = clamp≥1( mods(push.cost, mode.strain_cost) )`.
3. **Gain** (always): `gain = clamp≥1( mods(strain.gain, cost) )`; `post = apply overflow rule (decision b) to value + gain`.
4. **Chance** from **post-gain** Strain: `chance = mods(backfire.chance, schedule[min(post, last)])`; if `post ≥ guarantee_from` and `allow_prevention_at_guarantee` is off, `chance = 100`.
5. **Resolve Backfire**: `chance === 100` → automatic; `chance === 0` → none; otherwise roll 1d100 with Foundry `Roll`; `roll ≤ chance` is a Backfire. On a Backfire:
   - **Severity roll** (when `severity_roll.enabled`): roll `severity_roll.die`, add `backfire.severity` modifiers, clamp to the table's severity range.
   - **Consequence roll**: roll on the power's BF table (the table named by `backfire.table` modifiers, else the mode's table), among entries of that severity (all entries when the severity roll is off), weighted by `weight` (default 1).
   - Both rolls are shown on the chat card. The GM can always override or void the consequence afterwards (4.2).
6. **Outcome** (fixed order): (a) Strain gain; (b) Push effect recorded; (c) Backfire consequence applied (condition/disruption/resource/strain) or recorded (narrative); (d) usage counters.
7. **Persist and record**: commit the op, append to `pushLog` and Strain history, post one chat card (player-safe; GM-only notes whispered).

Steps 1–5 are pure and write nothing. `api.cinder.previewPush(...)` returns the plan (cost, gain, post, chance, modifiers with reasons) so the UI shows it before the player confirms.

### 4.2 Transaction and error behaviour (all or nothing)

Each Push has an `opId`. Writes happen only after steps 1–5 succeed:

1. Write `pending = {opId, plan, roll, consequence, step: 'started'}` on the instance (one Journal update).
2. `strain.add(actor, gain, {opId, source})` — idempotent by opId.
3. Apply consequence writes, each tagged with `opId` (ActiveEffect flag, disruption entry, resource change recorded with before/after).
4. Clear `pending`, append the committed entry to `pushLog`, post the chat card.

If any step 2–3 throws: compensate in reverse — delete effects tagged `opId`, restore recorded resources, `strain.remove(actor, gain, {opId: opId+':rollback'})` — then clear `pending`, log `{opId, status: 'rolled_back', error}` to `pushLog`, whisper the GM, and tell the player the Push did not happen. No chat card for a rolled-back Push, so no result was "seen".

**GM override** after commit is its own op: it compensates the original consequence (by its opId tags) and applies the GM's chosen one (or none), all or nothing, logged with the GM's reason. It never changes the Strain gained by the Push.

If the GM client dies mid-op (`pending` still set): on the next GM `ready`, recovery rolls the op **back** with the same opId-tagged compensation and logs `rolled_back: interrupted`. Because every step is idempotent by opId, running recovery twice is harmless. Rejections at step 1 write nothing except a `rejected` log line with the reason.

### 4.3 Automated consequence effects

Only `condition` (temporary ActiveEffect with duration, origin = the instance, flag `opId`), `power_disruption` (instance `usage` entry), `resource` (floored at 0, before/after recorded) and `strain` (via `strain.add`, source `backfire`, no further roll). `narrative` is recorded and shown to the GM to adjudicate.

### 4.4 Never kill or consume (hard rule, tested)

- The consequence type list has no death/delete/consume type; the validator rejects `dead`, `unconscious`, exhaustion and HP effects.
- Backfire code never deletes or edits an Actor's HP, death saves, or exhaustion, never deletes an Item other than its own opId-tagged effects, and never changes instance `status`/`bearer`/`progression`.
- Strain at the guarantee point (10 by default), or any amount above it, guarantees a Backfire, not death. Tests assert this at max Strain with every consequence type.

### 4.5 Normal (non-Push) use

Normal use spends dnd5e uses on the granted POWER Item; it does not gain Strain by default (**Confirm**). Skill Trees watches dnd5e activity use (`dnd5e.postUseActivity`) on Items tagged with an `instanceId`:
- Strain below `normal_use_backfire_at` (10): nothing happens; no roll.
- Strain at or above it (the Strain the character has when using the power): a guaranteed Backfire, resolved with the same severity and consequence rolls and the same transaction as 4.2, source `cinder_use`. It never blocks or undoes the use itself.
- Confirmed by Robb: at 10 a normal use backfires automatically, just as a Push does.
- Enhancement (passive) nodes have no use, so they never trigger this.

### 4.6 Recovery

Recovery is a validated `strain.remove` with a typed `source.kind`: `rest_long`, `rest_short`, `item`, `consumable`, `spell`, `blessing`, `gm`, `other`. Every recovery records source and reason in history. `strain.recovery` modifiers (scoped by kind) adjust the amount; a recovery never goes below `min`.
- **Rest:** the Strain module listens to dnd5e's rest-completed hook and removes `rest_recovery.long` (default 1) on a long rest and `rest_recovery.short` (default 0) on a short rest; the rest runs on the owner's client, so it relays to the GM client, idempotent by the rest's id.
- **Items, spells, consumables, blessings:** any module or macro calls `strain.remove(actor, n, {source: {kind: 'consumable', module, ref: 'ITEM-…'}, reason})` on the GM client. A typed `strain_recovery` block on item content (in Manager's item effects) is a later step, not in these PRs (**Confirm** whether it is wanted now).

## 5. Ownership operations (GM only, API-enforced)

`assign(instanceId, actor)`, `unassign(instanceId)`, `transfer(instanceId, toActor)`, `create(definitionId)`, `retire(instanceId)`. Non-GM callers get `Error('GM only')`.

Transfer uses the same pending-op pattern: record intent → remove the instance's tagged Items from A (snapshots kept) → set bearer B → grant Items to B (reusing an existing tagged Item) → update mirrors → commit. Failure or interruption rolls back to A. Rejected up front if B already bears `maxCindersPerActor` instances or the instance is mid-op.

- **Strain stays with A.** Transfer never reads or writes Strain. A's Backfire conditions stay on A (proposed, to confirm).
- Points and unlocks move with the instance; nothing is regranted, so no duplicate POWER Items or points.
- The new bearer is bound at once (no attunement step). Players cannot unassign, transfer or release.
- **Starting point:** when an instance is first bound, it receives `initial_cinder_points` (default 1) as a grant keyed `initial`; transfers never award it again because the grant key is already used.
- **Lost Actor**: `deleteActor` → instance becomes `lost` with `lastBearer`; GM is notified; progression kept; `assign` rebinds it.
- **Ownership validation**: Tree Library → Saved data check gains a Cinder section (invariants 1–3, pending ops, mirrors out of date, definitions missing) with Repair actions that only fix mirrors/Items, never progression.

## 6. Migration (Skill Trees, re-runnable)

Today Cinder progress is per Actor: `flags['ashen-gate-skill-trees'].progressV2['cinder:MUT-*']`.

GM Setup → Developer Tools → **Move Cinder progress to instances** (dry run first):
- For each Actor with a non-empty `cinder:MUT-*` account and no instance already migrated from it: create one instance (`migratedFrom: {actorId, wallet}`), bearer = that Actor, progression = the account; retag the existing granted Items with the `instanceId` (no Items created or deleted).
- The old Actor record is left in place, marked `migrated: instanceId`, and ignored afterwards. Running again finds nothing to do.
- An Actor with more Cinders than `maxCindersPerActor` is migrated but flagged in the Saved data check; nothing is removed.
- Until the GM runs it, Cinder trees keep reading the old per-Actor record (no behaviour change on update).

The Strain module is new: no migration. A future config schema change will migrate the setting in place with a version stamp.

## 7. Import and reimport

- MUT-*, POWER-*, BF-* are ordinary records in a Manager package (`ag-foundry-import/0.2`) and import as Items/Journals as today (ids and GM edits preserved). Manager's contract check calls `skillTrees.api.cinder.validateDefinition(record)` for `entity_type` Mutation/Power/BackfireTable when Skill Trees is active; without it the document imports and the result warns that the typed block was not checked.
- The Strain config is a separate specialist file (`{schema: 'ag-strain-config/0.1', ...}`), added to Manager's `SPECIALISTS` table (`kind: 'Strain config'`, `previewConfigImport` / `importConfig`, `canUpdate: true`) and to the ZIP `BUNDLE_ORDER` after Manager packages. It only changes the world config setting, never Actor Strain.
- Import never creates, deletes, rebinds or edits instances, never writes Strain, and never resets progression. Tree reimport (`update` mode) already refuses changes that break purchased nodes; that check will include instance accounts.
- An instance whose definition is missing after a reimport stays intact and shows "definition missing".
- `scripts/validate-content.mjs` gains checks for the `cinder`, `power`, `backfire` blocks and `ag-strain-config/0.1` (closed lists, refs resolve, ids unique, no forbidden consequence types, schedule length = max − min + 1, non-decreasing, ends at 100 unless decision c says otherwise).

## 8. Public APIs (contract strings for feature detection)

`game.modules.get('ashen-gate-strain').api` — `contract: 'ag-strain/1'`
- `get(actor)` → `{value, min, max, band:{label,from,to}, revision}` (owner or GM)
- `explain(actor, {source, context})` → `{value, band, chance, modifiers:[{label, target, value, applied, reason}]}`
- `backfireChance(actor, {value, context})` → number
- `add(actor, n, {source, reason, opId, visibility})`, `remove(...)`, `set(actor, n, {...})` — **GM client only**; validated (integer, within rules); return `{from, to, overflow, entryId}`
- `history(actor)` (players: player-visible entries only), `bands()`, `config()` (GM full / players labels only)
- `registerModifierProvider(moduleId, fn)`, `validateConfig(obj)`, `previewConfigImport(obj)`, `importConfig(obj)` (GM)
- `playerAccess` (`ag-player-access/1`, same as the other modules)
- `embed = {contract: 'ag-strain-embed/1', modes: ['character'], mount(element, {actorId, mode})}` → `{refresh, unmount}`
- Hook `ashenGateStrain.changed` `{actorId, from, to, delta, source, opId}` on every client.

`game.modules.get('ashen-gate-skill-trees').api.cinder` — `contract: 'ag-cinder/1'`
- `list({actor})`, `get(instanceId)` (players: their own bearer projection only)
- `previewPush(actor, instanceId, powerId, modeId)`; `push(...)` (players relay to GM client)
- GM: `create`, `assign`, `unassign`, `transfer`, `retire`, `migrate({dryRun})`, `validateDefinition(record)`
- `embed.modes` gains `'cinder'` (instance, points, powers, Push modes with a live preview, Push button)
- Hook `ashenGateCinder.changed` `{instanceId, actorId, kind}`.

## 9. Open decisions (each a GM setting; default "unset" = GM decides)

Robb's answers (via Studio), and how the design takes them:

| | Decision | Answer | Design |
|---|---|---|---|
| a | Strain recovery | Slowly with rest, like exhaustion, or through items, spells, consumables, blessings | 4.6: `rest_recovery` (long 1 — confirmed; short 0) + typed recovery sources through the shared API |
| b | Strain past 10 | Past 10 you backfire every time you use your Cinder | No cap at 10; optional `hard_max` (default none); guarantee from 10 |
| c | Modifiers at/past 10 | May modify backlash/strain past 10, probably not prevent it | Modifiers apply; `allow_prevention_at_guarantee` default off |
| d | Consequence selection | Rolled when pushing; severity maybe a second roll | Consequence roll always; severity roll on by default (**unconfirmed**), die configurable; GM override |
| e | Starting points | 1 point when a character gets the Cinder | `initial_cinder_points: 1`, once per instance |
| f | Attunement | Bind to it; can't unbind until an in-game reason allows; not mechanical | Bound state, GM-only unassign/transfer, no attunement step |
| g | Normal use | At 10 Strain, using the power rolls a Backfire consequence automatically (confirmed) | 4.5: at 10 or above every use (Push or normal) backfires; below 10 normal uses never do |
| — | Transfer copies Strain/conditions | Still proposed | No |

Points to confirm:
1. ~~At exactly 10~~ Confirmed: at 10 or above any use backfires.
2. Normal use gains no Strain.
3. Severity roll: on by default, die `1d4` (= severity tiers 1–4), consequence then rolled within that tier. Or should severity scale with Strain or band?
4. The starting point is once per Cinder instance (not again for each new bearer), and it counts inside the 13-point wallet.
5. `hard_max`: none, or a number?
6. Item/consumable recovery content (a typed block on items) now, or API only for now?
7. Transfer leaves Strain and Backfire conditions with the old bearer.

## 10. Build plan (one module per PR)

1. **Strain 0.1.0** (new module): state, config + import, API, history, hook, embed, GM Setup, tests.
2. **Skill Trees 0.15.0**: Cinder instances, assign/transfer/lost/validation, migration, mirrors, tests.
3. **Skill Trees 0.16.0**: POWER `power` block, modifier provider, Push preview + transaction + Backfire, chat card, tests.
4. **Manager**: route/validate `cinder`/`power`/`backfire` blocks and Strain config; `validate-content.mjs`; docs for GPT.
5. **Character Hub**: Strain and Cinder panels, Push button.

Automated tests run with mocked Foundry globals; they prove logic, not the live UI. Each PR lists the Forge click steps.
