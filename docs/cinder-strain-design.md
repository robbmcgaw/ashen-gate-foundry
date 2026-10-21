# Cinder instances, Strain, Push and Backfire — design (DRAFT, lean)

Status: **Approved lean design.** Revision 7: **Strain, Cinder instances, Push and Backfire live in their own module, Ashen Gate | Cinders (`ashen-gate-cinders` 0.1.0)**, split out of Skill Trees (where 0.15.0–0.16.0 first built them). Skill Trees 0.17.0 keeps the Cinder trees and offers a generic `api.accounts`. Data shapes and rules below are unchanged by the move; where this document says Skill Trees owns Strain or Cinder records, read Cinders.

Target: Foundry V14 on The Forge, dnd5e 6.0.6 (2024 rules).

## 1. Who owns what

| Capability | Owner |
|---|---|
| Strain value + `api.strain` (contract `ag-strain/1`), band/Backfire config, rest recovery | **Ashen Gate \| Cinders** (`ashen-gate-cinders`); data under its own flag scope `flags.ashen-gate-strain` (unchanged since Skill Trees 0.15.0) |
| Cinder instances (bearer, points, unlocks), bind/transfer/unbind, Push and Backfire, `api.cinder` (`ag-cinder/1`) | **Ashen Gate \| Cinders**: records in its own GM-only Journal; a bearer's progress written to their Cinder tree through Skill Trees' `api.accounts` |
| Cinder trees (`cinder_milestone`, POWER-* nodes, 16-point wallet, unlocks, perk Items) | **Skill Trees**, which offers the generic `api.accounts` (`ag-tree-accounts/1`) and the hooks `progressChanged` / `checkProgress`; it names no partner and never depends on Cinders |
| Import + validation of MUT-* / POWER-* / BF-* and the Strain config; `scripts/validate-content.mjs` | **General Manager** (delegates the typed blocks and the Strain config to Cinders when present) |
| Strain bar, Cinder panel, Push button | **Character Hub** (display only, through `api.strain` / `api.cinder` of `ashen-gate-cinders`) |
| Other Strain writers (crafting, hazards, items, spells) | each module, through `game.modules.get('ashen-gate-cinders')?.api?.strain` (feature-detected) |

Missing partners never stop a module opening: without Skill Trees there is no Strain or Cinder panel; without Manager definitions can't be (re)imported; without the Hub everything works from the Skill Trees window.

## 2. Content (imported, read-only at runtime)

**Cinder definition** — `MUT-*` (`entity_type: "Mutation"`; Cinder is the setting's name for it). Optional block:

```json
"cinder": {"schema": "ag-cinder/0.1", "tree_id": "TEST-EMBER-TREE"}
```

Any number of definitions; nothing listed in code.

**Power** — `POWER-*` (`entity_type: "Power"`), one per Cinder tree node. A node is a `power` (usable) or an `enhancement` (a perk that only carries modifiers or opens a Push mode).

```json
"power": {
  "schema": "ag-power/0.1",
  "kind": "power",
  "standard": {"summary": "[TEST] Normal use.", "uses": {"max": 2, "recovery": "long_rest"}},
  "push_modes": [
    {"id": "amplify", "label": "[TEST] Amplify", "strain_cost": 2,
     "effect": "[TEST] What the Push does.", "requires": {"powers": []}},
    {"id": "overreach", "label": "[TEST] Overreach", "strain_cost": 3,
     "effect": "[TEST] Use beyond normal limits.", "backfire_categories": ["BF-TEST-BODY"],
     "requires": {"powers": ["POWER-TEST-EMBER-REACH"]}}
  ],
  "modifiers": []
}
```

- Standard uses are dnd5e uses on the granted Item (no separate counter).
- A Push mode with `requires.powers` appears once those nodes are unlocked on the Cinder — that is how a perk adds a Push option, without a modifier.
- `effect` text is shown in chat; the engine does not auto-apply damage or healing.

**Backfire category** — `BF-*` (`entity_type: "BackfireTable"`), a table ordered mildest first. Categories are listed on the Cinder (`cinder.backfire_categories`), and a power or Push mode can override the list:

```json
"backfire": {"schema": "ag-backfire/0.1", "label": "[TEST] Body", "weight": 1, "entries": [
  {"id": "jolt",  "text": "[TEST] A brief shock.", "effect": {"status": "poisoned", "rounds": 1}},
  {"id": "drain", "text": "[TEST] Lose a use of this power until a rest."},
  {"id": "omen",  "text": "[TEST] Something notices. GM adjudicates."}
]}
```

`effect` is optional: a dnd5e status with a duration, applied as a temporary ActiveEffect. **Not allowed** (validator and engine both refuse): `dead`, `unconscious`, exhaustion, HP changes, or no duration. Everything else is chat text for the GM.

**Strain config** — `ag-strain-config/0.1` (imported through Manager; GM-editable; Skill Trees world setting):

```json
{"schema": "ag-strain-config/0.1",
 "backfire_schedule": [0,5,10,20,25,35,50,60,75,90,100],
 "guarantee_at": 10,
 "normal_use_backfire_at": 10,
 "allow_prevention_at_guarantee": false,
 "bands": [{"from":0,"to":0,"label":"Band 0"}, {"from":1,"to":2,"label":"Band 1"}, "…", {"from":10,"to":null,"label":"Band 6"}],
 "hard_max": null,
 "rest_recovery": {"long": 1, "short": 0},
 "effect_roll": {"strain_bonus": {"enabled": true, "from": 5, "per": 2}}}
```

Shipped defaults: the schedule above and neutral labels `Band 0…Band 6`; the campaign band names come in this file from the private content repo. Strain above the last schedule entry uses the last entry. No cap at 10; `hard_max` optional.

## 3. Saved data

### 3.1 Strain (on the Actor)

`actor.flags['ashen-gate-strain'].state`:

```json
{"value": 4, "history": [
  {"at": 0, "by": "userId", "delta": 2, "to": 4,
   "source": {"module": "ashen-gate-skill-trees", "kind": "push", "ref": "POWER-TEST-EMBER-SPARK"},
   "reason": "[TEST] Amplify", "opId": "op_…"}]}
```

- Last 30 changes kept. (Built in 0.15.0 without a per-entry GM-only flag: Actor flags reach every client, so reasons must not hold secrets.) Raw Strain only changes through `add` / `remove` / `set`; modifiers never touch it.
- A write carrying an `opId` already in history does nothing (a double click or a relayed retry can't charge twice).
- Written with `actor.update({'flags.ashen-gate-strain.state': …})`, because `setFlag` only accepts active module ids. **Forge check in PR 1:** confirm V14 keeps a flag scope that is not an installed module (fallback: `flags.ashen-gate-skill-trees.strain`, with a one-time copy if it is ever split out).

### 3.2 Cinder instance (Cinders, its own GM-only Journal)

```json
{"instanceId": "cinst_Ab12Cd34Ef56Gh78", "definitionId": "MUT-TEST-EMBER", "treeId": "TEST-EMBER-TREE",
 "status": "bound", "bearer": {"actorId": "…", "since": 0},
 "progression": {"awarded": 1, "unlocks": [], "grants": [{"key": "initial", "amount": 1}], "revision": 1, "history": []}}
```

- `instanceId` is world-local and permanent, separate from the MUT-* definition id.
- `progression` is the existing tree account shape, so prerequisites, refunds and the 16-point wallet work unchanged; it just lives on the Cinder instead of the Actor.
- `status`: `unbound` | `bound` | `lost` (bearer deleted; progress kept).
- The bearer's Actor gets a pointer `flags['ashen-gate-cinders'].cinders = [{instanceId, definitionId, name}]` and the player-safe view of their own Cinder; other Cinders and GM-only nodes never reach players.
- Rules: one bearer per Cinder; at most `maxCindersPerActor` (setting, default 1) per Actor.

## 4. Modifiers (few, typed, simple)

On a POWER definition, active while that node is unlocked on the Cinder the character bears:

```json
{"target": "backfire.chance", "value": -10, "powers": ["POWER-TEST-EMBER-SPARK"], "modes": ["amplify"], "stack": "steady", "label": "[TEST] Steady Hands"}
```

| target | changes | clamp |
|---|---|---|
| `push.cost` | Strain cost of matching Push modes | final cost ≥ 1 |
| `backfire.chance` | percentage points on the scheduled chance | 0–100; never below 100 at `guarantee_at` unless `allow_prevention_at_guarantee` |
| `backfire.severity` | added to the Backfire effect roll | result within the table |
| `strain.recovery` | added to rest recovery | ≥ 0 |

All values are added. Modifiers with the same `stack` name don't add up; only the strongest counts. Empty `powers`/`modes` means every power/mode of that Cinder. The Push preview lists each modifier used. Nothing lowers raw Strain except a recovery or a GM `remove`.

## 5. Push and use

All on the active GM client (players' clicks are relayed by the Skill Trees socket, as unlocks are today; the GM client re-checks ownership and that the character is the bearer).

**Push:**
1. Check: bearer, power unlocked, mode available, Strain part enabled.
2. `cost = max(1, mode.strain_cost + push.cost mods)`; `after = value + cost` (capped at `hard_max` when set, excess noted).
3. `chance = schedule[after] + backfire.chance mods`; at `after ≥ guarantee_at` the chance is 100 (unless prevention is allowed).
4. Roll everything: d100 (`≤ chance` = Backfire; 100% is automatic). On a Backfire: the **category roll** picks one of the power's Backfire tables (weighted), then the **effect roll** `1d(entries) + Strain bonus + backfire.severity mods`, kept within the table (higher = more severe). Default Strain bonus: +1 at Strain 5, +1 more every 2 Strain (`effect_roll.strain_bonus`).
5. Write Strain once (`add`, with the Push's `opId`). If this fails, nothing else happens and the player is told the Push did not go through.
6. Post one chat card: power, mode, effect text, Strain before → after and band, chance, the rolls, the consequence text.
7. If the consequence has an `effect`, apply it to the character. If that fails, Strain stays (the Push happened) and the card tells the GM to apply it by hand.

**Normal use** (dnd5e activity use on an Item granted by a Cinder): no Strain is added. At Strain ≥ `normal_use_backfire_at` (10) it backfires automatically — severity and consequence rolls, chat card, optional effect, same as steps 4, 6, 7. Below that, nothing happens. The use itself is never blocked or undone.

**Never lethal:** no consequence can kill, knock out, exhaust, damage, delete, or remove the Cinder or its progress; Backfire code has no path that does. At 10+ a Backfire is guaranteed, not death. Tests cover this.

**Recovery:** `api.strain` is the single door for every change — crafting, hazards, items, spells, consumables, blessings and rests. Item/consumable recovery is API only for now (no item content field). A long rest removes `rest_recovery.long` (1, + `strain.recovery` mods), a short rest `rest_recovery.short` (0). Items, spells, consumables and blessings call `api.strain.remove(actor, n, {source, reason})`.

## 6. GM operations (rejected for non-GMs in the API)

`cinder.create(definitionId)`, `assign(instanceId, actor)`, `transfer(instanceId, toActor)`, `unbind(instanceId)`.
- A Cinder is **bound**: players cannot release it; only the GM unbinds or transfers it when the story allows. No attunement step.
- First binding awards **Starting Cinder points** (Skill Trees setting, default 1) once per Cinder (grant key `initial`, inside the 16-point wallet). A transferred Cinder keeps its points and unlocks and gets none. **Cinders per character** (setting, default 1).
- Transfer: give the Cinder's POWER Items to the new bearer (reusing any already tagged), save the new bearer, then remove them from the old one. If something fails part-way, the GM sees which step; Tree Library → Saved data check lists missing or orphan POWER Items and **Give Missing Perks** fixes them. Strain is never read or written by a transfer.
- Deleted bearer → the Cinder becomes `lost` with its progress; the GM can assign it again.

## 7. Import, reimport, migration

- Import creates/updates definitions only. It never creates or moves Cinders, never writes Strain and never resets progress. Tree reimport already protects purchased nodes; that check will also read Cinder instances.
- Migration (Cinders → Manage → Move existing Cinder progress, dry run first, safe to run again). Also a one-time, re-runnable **take-over** of anything Skill Trees 0.15/0.16 saved (Strain config, Cinder records, bearer pointers), read through `api.accounts.legacyData()`. each Actor's existing `progressV2['cinder:MUT-*']` becomes one bound instance with that Actor as bearer; existing POWER Items are re-tagged, none created or deleted; the old record is left in place, marked migrated.

## 8. API

`game.modules.get('ashen-gate-cinders').api.strain` — `contract: 'ag-strain/1'`
- `get(actor)` → `{value, band, chance}` (GM or owner)
- `add(actor, n, {source, reason, opId})`, `remove(...)`, `set(...)` — GM client only; integers; returns `{from, to}`
- `history(actor)`, `config()`; GM: `previewConfigImport(file)`, `importConfig(file)`
- Hook `ashenGateStrain.changed` `{actorId, from, to, source}`

`api.cinder` — `contract: 'ag-cinder/1'`
- `list(actor)`, `previewPush(actor, instanceId, powerId, modeId)`, `push(...)` (players relay to the GM)
- GM: `create`, `assign`, `transfer`, `unbind`, `migrate({dryRun})`, `validateDefinition(record)`
- `embed.modes` gains `strain` and `cinder` for the Hub

## 9. Decisions

| | Decision | Answer (Robb, via Studio) |
|---|---|---|
| a | Recovery | 1 per long rest (confirmed), 0 per short rest; items, spells etc. through the API |
| b | Past 10 | No cap at 10; every use backfires from 10 |
| c | Modifiers at 10+ | Apply, but don't prevent (config flag, default off) |
| d | Consequence | Two rolls: category, then effect on that table (mildest first); higher Strain pushes the effect roll worse (on by default); GM adjudicates text |
| e | Starting points | 1 when the Cinder is gained |
| f | Binding | Bound; GM-only unbind/transfer; no attunement step |
| g | Normal use | At 10 or above, any use backfires automatically; only a Push adds Strain |
| — | Module | No separate module: Strain is a separate part of Skill Trees with its own flag scope |
| — | Hard maximum | None by default (config `hard_max`; excess recorded) |
| — | Item recovery | API only for now |
| — | Hub | A Strain bar near HP / hit dice / exhaustion, showing over-10 clearly, band name and Backfire %; GM adjusts |

Confirmed since: starting point once per Cinder at first bind; transfer leaves Strain and conditions with the previous bearer; transfer is in PR 2 (cost: one GM operation on top of bind/unbind, about 150 lines plus tests).

## 10. Build plan

1. **Skill Trees 0.15.0** — Strain part: value, API, history, config + import, bands, rest recovery, tests.
2. **Skill Trees 0.16.0** — Cinder instances, GM assign/transfer/unbind, migration, Push and normal-use Backfire, chat card, effects, tests.
2a. **Split (Robb):** Skill Trees 0.17.0 removes Strain and Cinders and adds `api.accounts`; **Ashen Gate | Cinders 0.1.0** takes them over (own window, Manage tab, GM Setup → Strain, launcher, take-over of 0.15/0.16 data). Merged back to back.
3. **General Manager** — import routing and validation of the `cinder`/`power`/`backfire` blocks and the Strain config (to `ashen-gate-cinders`); `validate-content.mjs`; schema doc for GPT.
4. **Character Hub** — through `ashen-gate-cinders`' API: a **Strain bar** next to HP / hit dice / exhaustion: value with a 0–10 scale that clearly shows over-10 (the bar fills to 10, then an overflow segment and the number, e.g. "13 / 10+"), band name and current Backfire %. Read-only for players (Strain changes only through allowed actions such as a Push); the GM gets add / remove / set with a reason (through `api.strain`). Plus the Cinder panel with Push.

Automated tests use mocked Foundry globals; they prove logic, not the live UI. Each PR lists the Forge click steps.
