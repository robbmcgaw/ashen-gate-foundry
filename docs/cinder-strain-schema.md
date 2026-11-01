# Cinder, Power, Backfire table and Strain config schema (Ashen Gate | Cinders 0.1.0+, Skill Trees 0.17.0+, General Manager 0.39.0+; perk modifiers: Cinders 0.2.0+, Manager 0.41.0+; Cinder art: Cinders 0.6.0+, default art on the definition: Cinders 0.9.0+, art stages: Cinders 0.12.0+, signature ability and passive: Cinders 0.10.0+)

This is the reference for writing Cinder content. It is generic: there is no setting content here, and every example uses synthetic `[TEST]` data. The campaign's Cinder names, powers, Backfire tables and Strain band names are written from this schema and kept in the private content repo.

A complete working set is in [`test-fixtures/cinder/`](../test-fixtures/cinder/):
- `AG_Test_Cinder_Pack.json`: a Manager package with 1 Cinder, its signature ability and passive, 3 tree powers and 2 Backfire tables.
- `AG_Test_Cinder_Tree.json`: the Cinder's tree.
- `AG_Test_Strain.json`: a Strain config.
- `invalid/`: common mistakes, each rejected with the message it names.

Check your own files with `node scripts/validate-content.mjs <file-or-folder>`.

## What goes where

| File | Holds | Imported by |
|---|---|---|
| Manager package (`ag-foundry-import/0.2`) | Cinder definitions (`MUT-*`), powers (`POWER-*`) and Backfire tables (`BF-*`) as ordinary records with a typed block | General Manager → Import. Ashen Gate \| Cinders checks the typed blocks; an error there blocks the import like any other. If Cinders is not active, the blocks are not checked: the records still import as documents, with a warning. |
| Skill Trees file (`ag-skill-trees/0.3`) | One `cinder_milestone` tree per Cinder; its nodes name the `POWER-*` ids | General Manager → Import (to Skill Trees) |
| Strain config (`ag-strain-config/0.1`) | Band names, Backfire schedule, rest recovery and the effect-roll bonus | General Manager → Import (to Ashen Gate \| Cinders), or Cinders → GM Setup → Strain |

Import order (a ZIP bundle does this automatically): Manager package → tree file → Strain config.

Who uses what:
- **Skill Trees** (`ashen-gate-skill-trees`) holds the Cinder trees: points, unlocks and perk Items.
- **Ashen Gate | Cinders** (`ashen-gate-cinders`) reads the `cinder`, `power` and `backfire` blocks and the Strain config, and runs Cinder instances, Push, Backfire and Strain (`api.strain`).
- Cinders reaches the trees only through Skill Trees' public `api.accounts` (`ag-tree-accounts/1`). Content files don't depend on that boundary: the same records and tree file work either way.

**Importing never touches live play state.** It never creates, moves or deletes a Cinder instance, never changes a bearer, points, unlocks or a character's Strain, and never applies a Backfire. Re-importing updates the definitions only; GM edits and live state are kept. Cinder instances are made and bound by the GM in Ashen Gate | Cinders → Manage.

## Cinder definition — `MUT-*`, `entity_type: "Mutation"`

An ordinary Manager record (usually `foundry.document_type: "Item"`, `type: "feat"`) with this block:

| Field | Type | Required | Rules |
|---|---|---|---|
| `cinder.schema` | string | yes | `"ag-cinder/0.2"` (Cinders 0.10.0+) or `"ag-cinder/0.1"`. 0.1 files stay valid; `bearer_items` needs 0.2. |
| `cinder.backfire_categories` | list of `BF-*` ids | recommended | The Backfire categories for this Cinder's powers. A power or Push mode can override the list. |
| `cinder.art` | string | no | Cinders 0.9.0+. Default orb image for every Cinder of this kind: an Assets Library or module path (e.g. `ashen-gate/cinders/test-ember.webp`) or an http(s) address, up to 1024 characters, no quotes, angle brackets or backslashes, no other `scheme:`. Best as a square transparent PNG/WebP. See Cinder art below. |
| `cinder.artStages` | list | no | Cinders 0.12.0+. 2 to 5 stage images that change as the bearer advances: `[{"art": "…", "at": 0}, {"art": "…", "at": 3}, …]`. `art` follows the same rule as `cinder.art`. `at` is "Unlocks needed": a whole number from 0 to 999 of Skill Tree nodes unlocked on this Cinder's tree. The first stage must have `at: 0` (it applies from the bind) and every later `at` must be higher than the one before. Only `art` and `at` are allowed. Suggested thresholds: 0, 3, 6, 10, 14. `cinder.art` stays the fallback (and the image for Cinders without stages). Each error names the stage (e.g. `cinder.artStages[2].at: stage 3 needs more unlocks than stage 2 (3)`). See Art stages below. |
| `cinder.bearer_items` | object | no | Cinders 0.10.0+, `ag-cinder/0.2` only. `{"active": "POWER-…", "passive": "POWER-…"}` (either can be left out; no other keys; two different ids). The bearer's signature ability (a `signature_active` Power) and always-on passive (a `signature_passive` Power). See Signature ability and passive below. |

A `Mutation` record without a `cinder` block is not checked by Cinders. The tree for this Cinder is the `cinder_milestone` tree whose `sourceRef` is this `MUT-*` id (see the tree file below).

## Power — `POWER-*`, `entity_type: "Power"`

There is one record per node of the Cinder tree: `foundry.document_type: "Item"`, `type: "feat"`, `visibility: "player"` and `status: "approved"` once released. `point_cost` (1–100) is the node's cost in Cinder points; it defaults to 1. A value outside 1–100 is ignored (the node's own cost, else 1, is used). A `Power` record with a `power` block must have a `POWER-*` id.

| Field | Type | Required | Rules |
|---|---|---|---|
| `power.schema` | string | yes | `"ag-power/0.1"` |
| `power.kind` | string | yes | `"power"`: usable, and can be pushed. `"enhancement"`: a perk with modifiers only, or one that opens a Push mode by being its requirement. An enhancement has no `push_modes`. `"signature_active"` / `"signature_passive"` (Cinders 0.10.0+): a Cinder's bearer items, not tree nodes (see below). |
| `power.standard.summary` | string | no | What a normal use does (shown with the power). Normal use spends the dnd5e uses on the Item. |
| `power.push_modes` | list | no | The ways this power can be pushed (several allowed). Not required: a `power` without any simply can't be pushed. |
| `power.backfire_categories` | list of `BF-*` | no | Overrides the Cinder's list for this power. |
| `power.modifiers` | list | no | The perk effects this node gives while it is unlocked on the Cinder (see Modifiers). |

### Push mode

| Field | Type | Required | Rules |
|---|---|---|---|
| `id` | string | yes | Short lower-case name (a lower-case letter, then up to 40 lower-case letters, digits, `-` or `_`), unique within the power, e.g. `amplify`. |
| `label` | string | yes | 1–80 characters, shown to players. |
| `strain_cost` | whole number | yes | 1–100. **Every Push gains Strain**, so 0 is refused. |
| `effect` | string | no | Not blank, up to 2000 characters, shown on the chat card. The engine does not apply damage or healing; the table does. |
| `requires.powers` | list of `POWER-*` | no | `requires` must be an object `{powers: [...]}`. The mode appears only when all of these are unlocked on the Cinder. This is how a perk adds a new Push option. |
| `backfire_categories` | list of `BF-*` | no | Overrides the power's and the Cinder's list for this mode. |

### Modifiers

| Field | Type | Required | Rules |
|---|---|---|---|
| `target` | string | yes | `push.cost` (Strain cost of a Push) · `backfire.chance` (percentage points) · `backfire.severity` (added to the Backfire effect roll; higher is worse) · `strain.recovery` (added to a rest that already recovers Strain) · `sockets.count` (sockets on the Cinder, 0.3.0+; see Sockets) |
| `value` | whole number | yes | −100 to 100, not 0. Negative lowers the cost or chance; positive raises it. |
| `applies.powers` (or `powers`) | list of `POWER-*` | no | Only for these powers (empty or missing means all of this Cinder's powers). Give it once: in `applies` or at the top level. |
| `applies.modes` (or `modes`) | list of mode ids | no | Only for these Push modes (empty or missing means all). |
| `requires.powers` | list of `POWER-*` | no | Counts only while all of these powers are unlocked on the Cinder (0.2.0+). |
| `stack` | string | no | A short lower-case name (a lower-case letter, then up to 40 lower-case letters, digits, `-` or `_`). Modifiers with the same `stack` name don't add up: only the largest in size (ignoring sign) counts. |
| `label` | string | yes | 1–80 characters, shown to players in the Push preview and on the chat card. |
| `scope` | string | no | Always `"cinder"` here (it can be left out). |
| `op` | string | no | `"add"` (the only operation; it can be left out). |

This is the shared `ag-modifier/1` shape ([modifiers-schema.md](modifiers-schema.md)).

**Perks (Cinders 0.2.0+).** A `PERK-*` record can carry the same modifiers in a record-level `modifiers` block with scope `cinder` ([modifiers-schema.md](modifiers-schema.md)). While the character has that perk Item, its modifiers count for every Cinder they bear, narrowed by `applies` and `requires` like a power's; a perk shares `stack` groups with the powers. Two copies of one perk count once. For rest recovery, a perk counts once per character (its `requires` is met when any Cinder they bear has those powers unlocked). An `ITEM-*`'s modifiers count only while it is in an active socket of that Cinder (0.3.0+, see Sockets).

All modifier values are added together. They never change a character's raw Strain: cost and chance change, but recovery happens only through a rest or the GM. The final cost is never below 1.

## Signature ability and passive (Cinders 0.10.0+)

Every Cinder can give its bearer **one active ability and one always-on passive from the moment it is bound**. They cost no points and are not tree nodes; the tree then modifies and extends them.

- **Cinder:** `cinder.bearer_items: {"active": "POWER-…", "passive": "POWER-…"}` on the `MUT-*` record (`cinder.schema: "ag-cinder/0.2"`). The ids can be in the same import or already in the world.
- **The two records** are ordinary Manager `Power` records (`foundry.document_type: "Item"`, usually `type: "feat"`, `visibility: "player"`), with a `power` block. No `point_cost`; don't put them on a tree.

| Kind | `power` block | Item (`foundry.data`) |
|---|---|---|
| `signature_active` | `schema`, `kind`, `standard.summary`, `push_modes` exactly as for a `power` (with `requires.powers` a tree node can open a new Push mode), `backfire_categories` | The dnd5e use button: `system.activities` with the activation, and `system.uses` (`max`, `recovery`) for uses and recovery. Without activities there is no use button, so no Push is offered (the validator warns). |
| `signature_passive` | `schema`, `kind`, `standard.summary`. **No `push_modes`** (an error). | One or more Active Effects with `transfer: true` ([item-effects-schema.md](item-effects-schema.md)): they apply to the bearer while they carry the item. Without one it changes nothing (the validator warns). |

`power.modifiers` on either kind are not counted (a warning): put modifiers on a tree power or a perk. The tree's unlocked powers, perks and socket items modify the signature ability's Push like any other power's (`push.cost`, `backfire.chance`, `backfire.severity`; `applies.powers` can name the signature ability).

**What happens in play**
- **Bind:** the bearer gets a copy of each item (copied from the world Item, like Skill Trees' perk copies), tagged `flags.ashen-gate-cinders.bearerItem = {instanceId, definitionId, slot: "active"|"passive", sourceId}`. Never duplicated. If a record is missing from the world, or is the wrong kind, the bind still happens and the GM is told; Manage → Check names it and Repair gives it once it is imported.
- **Transfer / unbind:** the items leave the old bearer and (transfer) are created on the new one. A deleted bearer (Cinder Lost) needs nothing. Skill Trees' tagged perk copies are never touched.
- **Use:** using the signature ability from the character sheet (its dnd5e use button) offers a Push: one mode asks "Push [mode]?" with the Strain cost and Backfire chance; several modes show one button each. A mode runs the normal Push (Strain, Backfire roll, chat card; a player's Push is rolled on the GM's client). **Use without Push** keeps the plain use. At the normal-use Backfire point, a use without a Push still backfires automatically; the use itself is never blocked. GM Setup has a world switch for the offer (default on), and each user can turn it off on their own device in the Cinders tab.
- **Who can change them:** players use the items (uses are spent and recovered as normal) but cannot change their mechanics, effects, delete or copy them; the GM can.
- **Check / Repair:** Manage → Check lists missing and extra copies; Repair gives missing ones and removes duplicates and copies on characters that don't bear the Cinder (re-runnable; it is also how Cinders bound before 0.10.0 get theirs). Character Hub's level-backup Restore puts them back through `api.cinder.rehook`.
- **API:** `api.cinder.list(actor)` adds `signature: {active: {powerId, name, itemId, summary, modes} | null, passive: {powerId, name, itemId, summary} | null}` per Cinder (`modes` in the same shape as `powers[].modes`).
- Importing never gives, removes or changes a character's copy. A re-import that changes the record changes new copies only; Repair replaces a copy only when `bearer_items` names another power.

```json
{"id": "POWER-TEST-WARD", "entity_type": "Power", "status": "approved", "version": "1.0.0",
 "provenance": {"sources": ["Synthetic test data (not canon)"]}, "visibility": "player", "refs": [],
 "power": {"schema": "ag-power/0.1", "kind": "signature_passive", "standard": {"summary": "[TEST] Always on: +1 AC while bearing the Cinder."}},
 "foundry": {"document_type": "Item", "folder_path": "Ashen Gate/Test/Cinders", "data": {"name": "[TEST] Ward", "type": "feat",
   "effects": [{"eff_id": "ward", "name": "[TEST] Ward", "transfer": true, "changes": [{"key": "system.attributes.ac.bonus", "mode": "add", "value": 1}]}]}}}
```

The signature ability (`POWER-TEST-FLARE`, with `system.activities` and `system.uses`) is in `test-fixtures/cinder/AG_Test_Cinder_Pack.json`.

## Sockets (Cinders 0.3.0+)

A Cinder has sockets that hold items. There is no new content block: **an item fits a socket when it is an `ITEM-*` record with a `modifiers` block that has at least one `cinder` modifier** ([modifiers-schema.md](modifiers-schema.md)). Those modifiers change that Cinder while the item is in an active socket. Socket items don't change the character's dnd5e stats: give any Active Effects on them `transfer: false`.

- **How many:** the GM's world setting **Sockets per Cinder** (default 3), or a number the GM sets on one Cinder (Manage → Sockets → Socket count). A `sockets.count` modifier adds (or removes) sockets. It can come from the Cinder's unlocked powers, the character's perks or a socket item. A socket item's `sockets.count` counts only while that item is active without it, so an item never keeps itself active. Use it without `applies`.
- **Fewer sockets than items:** nothing is deleted or detached. Items are active in socket order up to the number of sockets; the rest stay attached but **inactive** until one is removed.
- **Who changes them:** the GM, and the Cinder's bearer's owner while Cinders Player Access is on and the GM has not locked that Cinder's sockets. Every change is checked and recorded on the GM's client.
- **The item stays in the bearer's inventory**, marked `flags.ashen-gate-cinders.attachedTo = {instanceId, slot}`. On a **transfer** or **unbind** the items stay with the old bearer, detached. An item that leaves the inventory leaves its socket empty.
- Importing never attaches, detaches or deletes anything.

## Cinder art (Cinders 0.6.0+)

The Cinders window shows each Cinder as an orb. The definition Item's image is never used for the orb; the only art field in content is the optional `cinder.art` (0.9.0+). There is no `img`, `element` or `tint` field.

- **Default orb:** one shared orb drawn by the module. Its colour follows the bearer's Strain only.
- **Per kind (0.9.0+):** `cinder.art` on the `MUT-*` record. `api.cinder.create(definitionId)` copies it to the new Cinder's own `art` (`create(definitionId, {art})` with another path or `null` overrides it). A Cinder with no art of its own (made before 0.9.0, or after **Reset to default orb**) draws its definition's art. The definition art is also copied to the bearer's pointer as `defaultArt` (left out when there is none), so a player who cannot open the `MUT-*` record still sees it; Manage → Check / Repair cover that copy. Changing `cinder.art` on reimport does not change Cinders that already have their own art.
- **Glow:** when art is shown, the Strain-toned orb (calm, warm, ember, hot) stays as a soft glow behind the image and the image gets a halo in the same tone; the whole image shows (no cropping), so transparent art keeps its shape.
- **Per Cinder:** the GM can give one Cinder instance its own image: double-click the orb (Forge file picker; keep the files in the Assets Library under `ashen-gate/cinders/`), or **Reset to default orb**. It is saved as `art` (an image path or `null`) on that Cinder's record in the GM Records Journal and copied to the bearer's Cinder pointer (`flags.ashen-gate-cinders.cinders[].art`) so the bearer's owner can see it. It moves with the Cinder on a transfer.
- Order: the Cinder's own `art`, then (0.12.0) the art stage in use, then its definition's `cinder.art`, then the default orb. Records saved before read as no art of their own; nothing is migrated.
- API: `game.modules.get('ashen-gate-cinders').api.cinder.setArt(instanceId, path | null)`, GM only (rejected for players in the API); `null` means "use the default" (definition art, then the default orb). It fires `ashenGateCinder.changed` with `{kind: 'art', instanceId, definitionId, actorId, art}`. `api.cinder.list(actor)` returns for each Cinder `art` (what to draw, already resolved; `null` = default orb), `ownArt`, `defaultArt` and `artSource` (`'cinder'`, `'definition'` or `null`).
- Importing never sets or clears a Cinder's own art.

```json
{"id": "MUT-TEST-EMBER", "entity_type": "Mutation", "status": "approved", "version": "1.0.0",
 "provenance": {"sources": ["Synthetic test data (not canon)"]}, "visibility": "player", "refs": [],
 "cinder": {"schema": "ag-cinder/0.1", "backfire_categories": ["BF-TEST-BODY"], "art": "ashen-gate/cinders/test-ember.webp"},
 "foundry": {"document_type": "Item", "folder_path": "Ashen Gate/Test/Cinders", "data": {"name": "[TEST] Ember Cinder", "type": "feat"}}}
```

### Art stages (Cinders 0.12.0+)

- **Which stage:** the highest stage whose `at` is at most the number of nodes the bearer has unlocked on the Cinder's tree (`unlocks` of the Cinder's account). Stage 1 applies from the bind. The orb updates when the bearer unlocks or loses a node, in the Cinders tab and the Character Hub.
- **Per Cinder:** the GM can give one Cinder its own stages (**Stages…** in the Binding card, saved as `artStages` on the Cinder's record); they replace the definition's for that Cinder. **Hold this stage**, **Set stage…** and **Auto again** set `stageHold` (a stage number, or `null` for automatic).
- **Precedence on the orb:** a picture the GM chose with **Change art…** (pinned), then the stage in use, then `cinder.art`, then the default orb.
- **Players** see only the current stage. The bearer's pointer copy (`flags.ashen-gate-cinders.cinders[]`) gets `stageArt` (the image in use), `stage` (its number) and `stageHeld`; the other stages and their numbers stay in the GM-only records. `api.cinder.list(actor)` returns `art` already resolved, plus `stage: {number, held}` or `null`.
- **API (GM only, refused for everyone else in the data layer):** `api.cinder.stages(instanceId)` → `{own, definition, stages, unlocked, hold, state}`; `api.cinder.setArtStages(instanceId, stages | null)` (`null` = use the definition's); `api.cinder.setStageHold(instanceId, stage | null)`. They fire `ashenGateCinder.changed` with `kind: 'stages'` or `'stage'`.
- Importing never changes a Cinder's own stages or hold; re-importing changes the definition's stages for Cinders that have none of their own. Manage → Check / Repair update the bearer copies.

## Backfire table — `BF-*`, `entity_type: "BackfireTable"`

This is one Backfire **category**, usually a GM-only (`visibility: "gm"`) JournalEntry record.

| Field | Type | Required | Rules |
|---|---|---|---|
| `backfire.schema` | string | yes | `"ag-backfire/0.1"` |
| `backfire.label` | string | yes | The category name shown on the chat card, 1–80 characters. |
| `backfire.weight` | whole number | no | 1–100, default 1. A category with weight 2 is twice as likely to be picked. |
| `backfire.entries` | list | yes | 1–100 effects, **ordered mildest first**. |

Each entry:

| Field | Type | Required | Rules |
|---|---|---|---|
| `id` | string | yes | Short lower-case name (a lower-case letter, then up to 40 lower-case letters, digits, `-` or `_`), unique in the table. |
| `text` | string | yes | Shown on the chat card, not blank, up to 2000 characters. |
| `effect` | object | no | `{"status": "<dnd5e status id>", "rounds": 1–100}` or `{"status": "…", "minutes": 1–1440}`. `status` is a status id (a letter, then up to 40 letters, digits, `-` or `_`). If both durations are valid, `rounds` is used. It is applied to the character as a temporary condition. Leave it out for anything the GM adjudicates. |

**Never lethal.** A Backfire must never kill a character, take them out of play or permanently erase them. These are refused:
- the statuses `dead`, `dying`, `unconscious`, `exhaustion`, `petrified`, `sleeping`, `stable` and `transformed`
- an effect without a duration
- any other key in `effect` (no HP or stat changes)

Write anything heavier as text for the GM to adjudicate.

## How a Push and a Backfire resolve (for writing tables that read well)

1. **Cost** = the mode's `strain_cost` + `push.cost` modifiers, at least 1. The Strain is always gained.
2. **Chance** = the Strain config's `backfire_schedule` at the Strain **after** the gain, + `backfire.chance` modifiers, kept within 0–100. From `guarantee_at` (10) it is 100%, and modifiers cannot lower it.
3. **d100** ≤ chance is a Backfire (100% is automatic, with no roll).
4. **Category roll**: one of the power's Backfire tables, by `weight` (tables with no entries are skipped; with only one table there is no roll). If there is no table, the card says the GM decides what happens.
5. **Effect roll**: `1d(entries)` + Strain bonus + `backfire.severity` modifiers, kept within the table. The default Strain bonus is +1 at Strain 5–6, +2 at 7–8, +3 at 9–10 and +4 at 11–12 (`effect_roll.strain_bonus` in the Strain config). So at high Strain the bottom of a table comes up more often: put the mildest entries first.
6. One chat card shows the whole result. The entry's `effect` (if any) is applied; anything else is adjudicated by the GM.

At Strain 10 or more, a **normal** (non-Push) use of a power, or of a signature ability used without a Push, also backfires automatically, using steps 4–6. A normal use never adds Strain.

## Cinder tree — `ag-skill-trees/0.3`

These fields go in the existing Skill Trees file:
- `provider.kind`: `"cinder_milestone"`
- `provider.maxPoints`: `16` (the Cinder point cap). Files that still say `13` import fine and are treated as 16.
- `sourceRef`: the Cinder's `MUT-*` id

Each node's `perkId` is a `POWER-*` id, and a node costs its power's `point_cost`. There is one tree per Cinder; two trees cannot share a `sourceRef`.

Optional tree field, `reveal` (Skill Trees 0.28.0): `"progressive"`, or leave it out for the old behaviour (every released node is shown). Any other value is ignored with a warning. With `"progressive"` a player sees, for their own character: the nodes they have unlocked, the nodes with no prerequisites, and the nodes available now (shown); one step beyond those as nameless "Undiscovered" silhouettes; and nothing further. Use it on Cinder trees so a bearer sees the first power before unlocking anything while later tiers stay hidden until reached. Because the rule decides what players see, give every node of a progressive tree `visibility: "player"` and `display: "shown"` (a stored `hidden` or `teaser` node is simply not published). The GM sees the whole tree. The GM can set this on every Cinder tree at once with Skill Trees > Tree Library > Checks & maintenance > Show Cinder trees to their bearers… (or `api.showCinderTrees()`).

## Strain config — `ag-strain-config/0.1`

Every field except `schema` is optional; missing fields use the defaults shown. An unknown field is ignored with a warning. Importing a config replaces the whole current config (fields left out go back to the defaults, not to the current values); character Strain is not changed.

| Field | Default | Rules |
|---|---|---|
| `schema` | | `"ag-strain-config/0.1"` |
| `backfire_schedule` | `[0,5,10,20,25,35,50,60,75,90,100]` | Backfire % at Strain 0, 1, 2…: 1 to 1000 whole numbers 0–100 that never go down. Strain above the last entry uses the last entry. |
| `guarantee_at` | `10` | Whole number, 0 or more. From this Strain every Push backfires. |
| `normal_use_backfire_at` | `10` | Whole number, 0 or more. From this Strain every normal use of a Cinder power backfires. |
| `allow_prevention_at_guarantee` | `false` | `true` lets modifiers lower the chance below 100% at the guarantee. |
| `bands` | `Band 0`…`Band 6` (0, 1–2, 3–4, 5–6, 7–8, 9, 10+) | `[{from, to, label}]`: 1 to 50 bands, starting at 0, with no gaps or overlaps. Only the last band can be open-ended (`"to": null`), and it must be, unless its `to` reaches `hard_max`. Labels are 1 to 60 characters and shown to players with their Strain. |
| `hard_max` | `null` | `null` (no maximum, so Strain can go past 10) or a whole number of 1 or more. Strain above it is recorded as overflow. |
| `rest_recovery` | `{"long": 1, "short": 0}` | Strain removed by a long or short rest (dnd5e rest). If given, both `long` and `short` are required, whole numbers 0–100. |
| `effect_roll.strain_bonus` | `{"enabled": true, "from": 5, "per": 2}` | Bonus to the Backfire effect roll: +1 at `from`, then +1 more every `per` Strain. If `effect_roll` is given, all three are required: `enabled` true/false, `from` 0 or more, `per` 1–100. |

## Synthetic example (short)

```json
{"manifest": {"schema_version": "ag-foundry-import/0.2", "package_id": "AG-TEST-CINDER", "version": "1.0.0"},
 "records": [
  {"id": "POWER-TEST-SPARK", "entity_type": "Power", "status": "approved", "version": "1.0.0",
   "provenance": {"sources": ["Synthetic test data (not canon)"]}, "visibility": "player", "refs": [], "point_cost": 1,
   "power": {"schema": "ag-power/0.1", "kind": "power", "standard": {"summary": "[TEST] A small spark."},
     "push_modes": [{"id": "amplify", "label": "[TEST] Amplify", "strain_cost": 2, "effect": "[TEST] A bright flare."}]},
   "foundry": {"document_type": "Item", "folder_path": "Ashen Gate/Test/Cinders", "data": {"name": "[TEST] Spark", "type": "feat"}}},
  {"id": "BF-TEST-BODY", "entity_type": "BackfireTable", "status": "approved", "version": "1.0.0",
   "provenance": {"sources": ["Synthetic test data (not canon)"]}, "visibility": "gm", "refs": [],
   "backfire": {"schema": "ag-backfire/0.1", "label": "[TEST] Body", "entries": [
     {"id": "jolt", "text": "[TEST] A brief jolt.", "effect": {"status": "poisoned", "rounds": 1}},
     {"id": "ache", "text": "[TEST] A lasting ache. The GM adjudicates."}]},
   "foundry": {"document_type": "JournalEntry", "folder_path": "Ashen Gate/Test/Cinders", "data": {"name": "[TEST] Backfire: Body", "pages": []}}}
 ]}
```

The full set, including the Cinder, the enhancements, the tree and the Strain config, is in `test-fixtures/cinder/`.
