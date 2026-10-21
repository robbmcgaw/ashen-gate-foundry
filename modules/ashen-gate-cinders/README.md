# Ashen Gate | Cinders

Module ID `ashen-gate-cinders` · Foundry V14 · dnd5e. Cinders that keep their own powers and points and move between bearers, Push and Backfire, and the shared **Strain** resource. Open it from **Actors sidebar → Cinders** (players when **GM Setup → Player Access** is on).

Needs **Ashen Gate | Skill Trees 0.17.0 or later** for Cinder trees (the powers a Cinder can unlock, its points and unlocks). Without Skill Trees, Strain still works and the Cinder parts say what is missing. Next to an older Skill Trees (0.15/0.16, which had Strain and Cinders built in), this module stays off until Skill Trees is updated.

## How it works

- **Strain** is one number per character, shared by everything that adds or removes it: Pushes, crafting, hazards, items, spells, consumables, blessings and rests. A long rest removes 1 (config). The **band name** and **Backfire chance** come from the Strain config (GM Setup → Strain; importable).
- **A Cinder** is made from a Cinder definition (`MUT-*`, imported through General Manager). It has its own id, a bearer and its own points and unlocks, which move with it.
  - Only the GM binds, transfers or unbinds a Cinder (**Manage** tab); a bearer cannot release one.
  - One bearer per Cinder. Up to **Cinders per character** (setting, default 1), never two of the same kind.
  - The first time a Cinder is bound it gets **Starting Cinder points** (setting, default 1), once per Cinder.
  - A transfer keeps the points and powers. Strain and Backfire conditions stay with the previous bearer.
  - A deleted bearer leaves the Cinder **Lost**, with its progress.
- **Unlock powers** in the Skill Trees window as before; only the Cinder's bearer can.
- **Push** (Cinders tab): pick a power and a Push mode.
  - Every Push gains Strain, and the Backfire chance uses the Strain after the gain. From Strain 10 every Push backfires.
  - A Backfire rolls a **category**, then an **effect** on that table (mildest first). Higher Strain pushes the effect roll toward the severe end.
  - One chat card shows the result. A temporary status is applied when the effect names one; otherwise the GM adjudicates.
  - A player's Push is rolled and recorded by the GM client (a GM must be logged in).
- **Normal use at Strain 10+**: using a Cinder power from the sheet backfires automatically. It adds no Strain and never blocks the use.
- **Never lethal**: a Backfire cannot kill, knock out, exhaust or remove a character, delete a Cinder or take its progress.

## Tabs

- **Cinders**: a character's Strain bar (fills to 10, then shows how far past it), band and Backfire %, and their Cinders with each power's Push modes, cost and chance. The GM gets Add / Remove / Set Strain with a reason.
- **Manage** (GM): New Cinder; Bind / Transfer / Unbind; Move existing Cinder progress (characters with Cinder tree progress but no Cinder); Take over from Skill Trees (data saved by Skill Trees 0.15/0.16); Check and Repair.
- **GM Setup** (GM): Player Access; Strain bands, chances and rules with Import / Export / Reset; Cinder limits.

## Public API

`game.modules.get('ashen-gate-cinders').api`: `open`, `playerAccess` (`ag-player-access/1`), `status()`, `strain`, `cinder`, `adoptLegacy()`.

### `api.strain` (contract `ag-strain/1`)

```js
const strain = game.modules.get('ashen-gate-cinders')?.api?.strain;
if (strain?.contract === 'ag-strain/1') {
  strain.get(actor);   // → {value, band:{label,from,to}, chance, guaranteed, normalUseBackfires, guaranteeAt, hardMax}
  await strain.add(actor, 2, {source: {module: 'my-module', kind: 'hazard', ref: 'LOC-…'}, reason: 'Fell into the pit', opId: 'my-unique-id'});
}
```

- `add(actor, n, options)` and `remove(actor, n, options)`: n is a whole number from 1 to 1000. `set(actor, n, options)`: 0 or more. Remove stops at 0. There is no cap at 10; above `hard_max` (when set) the excess is recorded as `overflow`. Returns `{from, to, delta, overflow, duplicate, changed}`.
- `options.source` `{module, kind, ref?}` and `options.reason` are required. A change whose `opId` is already in the history does nothing.
- `history(actor)`: the last 30 changes. They are on the Actor, so don't put secrets in reasons.
- `config()`. GM only: `previewConfigImport`, `importConfig`, `resetConfig`. Also `validateConfig(file)`.
- Hook `ashenGateStrain.changed` `{actorId, from, to, source, opId}` on every client.
- **Permission:** reads (`get`, `history`) by the GM or the Actor's owner; they are not hidden by Player Access, because Strain is a character resource. Writes run on a GM client only; a module whose players trigger Strain relays the request to its own GM client.
- Data: `flags.ashen-gate-strain.state` `{value, history}` on the Actor (the same flag Skill Trees 0.15.0 used).

### `api.cinder` (contract `ag-cinder/1`)

- `list(actor)`: the Cinders the character bears, with each power's Push modes, cost and chance. Allowed for the GM or the owner (players only while Player Access is on).
- `previewPush(actor, instanceId, powerId, modeId)`. `push(actor, powerId, modeId)`: the GM does it directly; an owner's Push is relayed to the active GM client.
- GM only: `instances()`, `create(definitionId)`, `bind(instanceId, actor)`, `transfer(instanceId, actor)`, `unbind(instanceId)`, `migrate({dryRun})`, `adoptLegacy()`, `report()`, `repair()`.
- `validateDefinition(record)` → `{errors, warnings}` for Mutation / Power / BackfireTable records (used by General Manager and `scripts/validate-content.mjs`).
- Hook `ashenGateCinder.changed` `{kind, instanceId, definitionId, actorId, fromActorId?}`.

### `api.modifiers` (contract `ag-modifier/1`, scope `cinder`; 0.2.0+)

- `validate(entries, {recordId})` → `{errors, warnings}`: the check General Manager (0.41.0+) runs on `cinder` entries of a record-level `modifiers` block. Pure, no permission needed. Also exported as `validateModifiers` from `scripts/cinder.mjs` for `scripts/validate-content.mjs`.
- `targets`: `push.cost`, `backfire.chance`, `backfire.severity`, `strain.recovery`.
- `forActor(actor)`: the cinder modifiers the character's `PERK-*` Items carry, `[{sourceId, name, itemId, target, value, label, stack, powers, modes, requires}]`. GM or owner (players only while Player Access is on).

Content schema (Cinder, Power and Backfire-table blocks, Strain config): [`docs/cinder-strain-schema.md`](../../docs/cinder-strain-schema.md).
Modifiers on perks and items: [`docs/modifiers-schema.md`](../../docs/modifiers-schema.md).

## Relation to other modules

Independent module with its own id, settings and flags. It uses Skill Trees only through its public `api.accounts` (`ag-tree-accounts/1`: `treeBySource`, `account`, `setAccount`, `grants`, `legacyData`) and its hooks:
- `ashenGateSkillTrees.progressChanged` keeps the Cinder record in step.
- `ashenGateSkillTrees.checkProgress` refuses progress by a character who doesn't bear the Cinder.

Skill Trees does not depend on this module. General Manager imports the definitions; Character Hub can show the Strain bar and Cinders through this API.

Records: a GM-only Journal `[AG] Cinders — GM Records` (flag `registry`). Bearers carry `flags.ashen-gate-cinders.cinders` pointers. Backfire statuses carry `flags.ashen-gate-cinders.backfire`.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-cinders/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-cinders-v<version>`). Change history is in [CHANGELOG.md](CHANGELOG.md).
