# Ashen Gate | Cinders

Module ID `ashen-gate-cinders` · Foundry V14 · dnd5e. Cinders that keep their own powers and points and move between bearers, Push and Backfire, and the shared **Strain** resource. Open it from **Actors sidebar → Cinders** (players when **GM Setup → Player Access** is on).

**Sidebar folders.** The GM-only records journal files under **Ashen Gate / Cinders**; see docs/folder-convention.md.

Needs **Ashen Gate | Skill Trees 0.17.0 or later** for Cinder trees (the powers a Cinder can unlock, its points and unlocks). Without Skill Trees, Strain still works and the Cinder parts say what is missing. Next to an older Skill Trees (0.15/0.16, which had Strain and Cinders built in), this module stays off until Skill Trees is updated.

## How it works

- **Strain** is one number per character, shared by everything that adds or removes it: Pushes, crafting, hazards, items, spells, consumables, blessings and rests. A long rest removes 1 (config). The **band name** and **Backfire chance** come from the Strain config (GM Setup → Strain; importable).
- **Strain chip** (0.8.0): a character with Strain above 0 shows a status for its Strain band on its token ("Strain 6/10 (Band 3)"), seen by everyone who sees the token and listed in Utilities' Conditions. Display only, kept in step by the active GM's client; only Cinders adds, changes or removes it (Strain changes through `api.strain`). Setting **Show Strain chip on tokens** (default on); no chips while Character Hub hides the Strain bar from players. Status ids `ag-strain-<band index>`; the placeholder icons are the `STRAIN_CHIP_ICONS` table in `scripts/strain-chip.mjs`, one per band in order (bands past the end use the last).
- **A Cinder** is made from a Cinder definition (`MUT-*`, imported through General Manager). It has its own id, a bearer and its own points and unlocks, which move with it.
  - Only the GM binds, transfers, unbinds or deletes a Cinder (**Manage** tab); a bearer cannot release one.
  - **Delete Cinder…** (0.14.0, GM, Manage → Cinders): shows what would be removed (the Cinder's record, plus any bearer links, signature-ability / passive copies and "attached" marks that name it), then asks. A Cinder that still has a bearer is refused until you Unbind… it. The imported definition, the kind's stage art and every item on a character are kept. `api.cinder.planDeleteCinder(idOrName)` and `deleteCinder(idOrName, {confirm: true})` (GM only).
  - One bearer per Cinder. Up to **Cinders per character** (setting, default 1), never two of the same kind.
  - The first time a Cinder is bound it gets **Starting Cinder points** (setting, default 1), once per Cinder.
  - A transfer keeps the points and powers. Strain and Backfire conditions stay with the previous bearer.
  - A deleted bearer leaves the Cinder **Lost**, with its progress.
- **Signature ability and passive** (0.10.0): a Cinder whose definition names them (`cinder.bearer_items`, `ag-cinder/0.2`) gives its bearer one active ability and one always-on passive as Items from the moment it is bound (no points, not tree nodes; the tree's powers and perks still modify the ability's Push). They move on a transfer, leave on unbind, and are given again by Check / Repair and `rehook`. Using the signature ability from the character sheet offers a Push (or **Use without Push**). Players use them but only the GM can change them. See [docs/cinder-strain-schema.md](../../docs/cinder-strain-schema.md).
- **Unlock powers** in the Skill Trees window as before; only the Cinder's bearer can.
- **Push** (Cinders tab): pick a power and a Push mode.
  - Every Push gains Strain, and the Backfire chance uses the Strain after the gain. From Strain 10 every Push backfires.
  - A Backfire rolls a **category**, then an **effect** on that table (mildest first). Higher Strain pushes the effect roll toward the severe end.
  - One chat card shows the result. A temporary status is applied when the effect names one; otherwise the GM adjudicates.
  - A player's Push is rolled and recorded by the GM client (a GM must be logged in).
- **Normal use at Strain 10+**: using a Cinder power (or the signature ability without a Push) from the sheet backfires automatically. It adds no Strain and never blocks the use.
- **Never lethal**: a Backfire cannot kill, knock out, exhaust or remove a character, delete a Cinder or take its progress.

## Tabs

- **Cinders** (the Cinder sheet, 0.6.0): the Cinder as an orb ringed by the bearer's Strain (10 segments, then one pip per point over 10, with a "+N over 10" badge), its sockets on an orbit around it, and beside it (under it on a narrow window): bearer, **Unspent** points with **Open skill tree**, the Strain bar with band and Backfire %, each power's Push modes (cost, Strain after, Backfire % with perk and socket modifiers), and the perks and socket items that count. The GM gets Add / Remove / Set Strain with a reason, and a GM-only **Binding** card (current bearer and since when).
  - **Sockets on the orbit** follow attach order (no reordering). Items are active up to the number of sockets; a socket added by a perk, power or item shows **+1**; an item over capacity sits under the orb, dimmed, as inactive. Tap an empty socket to attach, a filled one to swap (the GM can also detach; players cannot); or drag an item from **Items that fit** (or the bearer's sheet) onto a socket. The bearer's owner can attach and swap while Player Access is on and the GM has not locked the Cinder; the GM always can, and can also drop an Item from the Items sidebar (it is copied to the bearer).
  - **Art:** a shared default orb whose colour follows Strain, the Cinder's own image, or (0.9.0) its definition's `cinder.art`, drawn on a Strain-toned glow. Only the GM changes it: double-click the orb (or **Change art…** on the Binding card) to pick a file, best kept in the Assets Library under `ashen-gate/cinders/`; **Reset to default orb** goes back. Players see it but cannot change it.
  - **Push** asks first (Cancel on the left, Push on the right; red when the Backfire is guaranteed).
  - **Signature ability / Passive** (0.10.0; first rows of **Powers** since 0.11.0, badged *Signature* / *Passive*): their names and summaries, and the signature ability's Push modes (no Push button: the Push is offered when it is used from the character sheet).
  - **Art stages** (0.12.0, GM, in the Binding card): **Stages…** edits the Cinder's 2 to 5 images and their *Unlocks needed*; **Hold this stage**, **Set stage…** and **Auto again** override the automatic stage. Players see only the current stage on the orb.
  - **Stage art on the Cinder itself** (0.13.0, GM, Manage → Cinders → Stage art): set the stages for a whole Cinder (Ember, Echo, …) with nobody bearing it; every bearer follows it unless their own Cinder has Stages…. Kept in a world setting keyed by the permanent id, so a re-import keeps it. Order: the bearer's own Stages…, this stage art, the imported `cinder.artStages`, then `cinder.art`. API: `api.cinder.setDefinitionArtStages(idOrName, stages | null)` / `getDefinitionArtStages(idOrName)` (GM only).
  - **On this device** (0.11.0, a fold at the bottom of the orb column): **Rotate the art on this device** and **Offer a Push when I use the signature ability on this device**. They save at once and affect only your browser.
  - Sockets on the orbit show a gem and their number (0.11.0); the filled ones are listed by name under the orb, and **Items that fit** are buttons (choose one to attach it, or drag it).
- **Manage** (GM), three sub-tabs (0.11.0): **Cinders** (one line per Cinder, 0.15.0: bearer, then Points from 30rem and Powers from 40rem of window width, with the buttons pinned at the right, as icons with a name and tooltip and as words from 52rem; New Cinder; Bind / Transfer / Unbind; Move existing Cinder progress; Take over from Skill Trees), **Sockets** (one fold per bound Cinder: Attach…, Lock for players, Socket count…, Swap… / Detach…) and **Check** (the report, with a count on the tab; **Repair…** asks first).
- **GM Setup** (GM), two sub-tabs under one **Save Changes** footer (0.11.0): **General** (Player Access, Cinders per character, Starting Cinder points, Sockets per Cinder, Show Strain chip on tokens, Rotate Cinder art, Offer a Push when a signature ability is used) and **Strain** (the Strain config file row with Import / Export / Reset, then the **Strain editor** in folds: Bands, Backfire chance, Rules, Backfire effect roll bonus). Everything is a draft with inline checks until Save Changes; leaving the tab or closing the window with unsaved changes asks first. Players see no Cinders settings in Configure Settings.

## Public API

`game.modules.get('ashen-gate-cinders').api`: `open`, `playerAccess` (`ag-player-access/1`), `status()`, `strain`, `cinder`, `adoptLegacy()`, and GM-only `exportState()` (0.17.0, optional: feature-detect it).

`api.exportState()` (GM only, read-only, writes nothing) returns the Cinders' play state as plain JSON, schema `ag-cinders-state-export/0.1`: `{schema_version, config, cinders, stage_art, strain}`. `config` holds the rule settings (Cinders per character, starting points, sockets per Cinder, the Strain config). `cinders` has every instance (ids, definition id, name, bearer id and name or none, points, unlocked node ids, powers and enhancements, art and stage state, sockets and attached items). `stage_art` is the GM's world stage art keyed by definition id. `strain` has each character with Strain: value, band and history length. Rows are sorted, no timestamps, no definition text. General Manager's world backup uses it; see `docs/world-backup.md`.

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

- `list(actor)`: the Cinders the character bears, with each power's Push modes, cost and chance, and (0.6.0) `art` (image path or null), `treeId` and `unspent` (from Skill Trees' `listTrees` and `pointsSummary`; null when not available), and (0.10.0) `signature: {active: {powerId, name, itemId, summary, modes} | null, passive: {powerId, name, itemId, summary} | null}`. For the GM only, `bearerSince`. Allowed for the GM or the owner (players only while Player Access is on).
- `previewPush(actor, instanceId, powerId, modeId)`. `push(actor, powerId, modeId)`: the GM does it directly; an owner's Push is relayed to the active GM client. `powerId` can be a Cinder's signature ability (0.10.0).
- GM only: `setArt(instanceId, path | null)` (0.6.0; rejected for players; null = the default orb), `instances()`, `create(definitionId)`, `bind(instanceId, actor)`, `transfer(instanceId, actor)`, `unbind(instanceId)`, `rehook(actor)` (0.7.0: rewrites the bearer links, Cinder tree progress and item socket markers on one character from the records, e.g. after Character Hub restores a level backup onto it; never changes a record; resolves `{instances, done}`; 0.10.0: also gives missing bearer items and removes extra ones), `migrate({dryRun})`, `adoptLegacy()`, `report()`, `repair()`.
- `validateDefinition(record)` → `{errors, warnings}` for Mutation / Power / BackfireTable records (used by General Manager and `scripts/validate-content.mjs`).
- Hook `ashenGateCinder.changed` `{kind, instanceId, definitionId, actorId, fromActorId?, art?}` (kind `art` from 0.6.0).

### `api.modifiers` (contract `ag-modifier/1`, scope `cinder`; 0.2.0+)

- `validate(entries, {recordId})` → `{errors, warnings}`: the check General Manager (0.41.0+) runs on `cinder` entries of a record-level `modifiers` block. Pure, no permission needed. Also exported as `validateModifiers` from `scripts/cinder.mjs` for `scripts/validate-content.mjs`.
- `targets`: `push.cost`, `backfire.chance`, `backfire.severity`, `strain.recovery`.
- `forActor(actor)`: the cinder modifiers the character's `PERK-*` Items carry, `[{sourceId, name, itemId, target, value, label, stack, powers, modes, requires}]`. GM or owner (players only while Player Access is on).

### `api.sockets` (contract `ag-sockets/1`, host kind `cinder`; 0.3.0+)

- `hosts(actor)`: the character's Cinders with `{instanceId, name, capacity, base, free, locked, canEdit, slots: [{slot, itemId, sourceId, name, active, modifiers}]}`. `slots(actor, instanceId)` returns one of them. `socketable(actor)` lists the items that fit, with `attachedTo`. `canAttach(actor, instanceId, itemId)` returns `{ok, reasons}`. All of these are GM or owner, players only while Player Access is on.
- `attach(actor, instanceId, itemId, {slot?, opId?})`, `detach(actor, instanceId, slot, {opId?})` (GM only: anyone else is refused with "Only the GM can detach an item from a Cinder."), `swap(actor, instanceId, slot, itemId, {opId?})`: attach and swap by the GM directly, or by the owner while Player Access is on and the Cinder is not locked. Every request is re-checked on the active GM client, and a repeated `opId` does nothing.
- GM only: `setLocked(instanceId, locked)`, `setCount(instanceId, n | null)`, `attachDropped(instanceId, itemDocument, {slot?})` (a world Item is copied to the bearer first).
- Hook `ashenGateSockets.changed` `{kind, hostKind, instanceId, definitionId, actorId, slot?}`.

Content schema (Cinder, Power and Backfire-table blocks, Strain config): [`docs/cinder-strain-schema.md`](../../docs/cinder-strain-schema.md).
Modifiers on perks and items: [`docs/modifiers-schema.md`](../../docs/modifiers-schema.md).

## Relation to other modules

Independent module with its own id, settings and flags. It uses Skill Trees only through its public `api.accounts` (`ag-tree-accounts/1`: `treeBySource`, `account`, `setAccount`, `grants`, `legacyData`) and its hooks:
- `ashenGateSkillTrees.progressChanged` keeps the Cinder record in step.
- `ashenGateSkillTrees.checkProgress` refuses progress by a character who doesn't bear the Cinder.

Skill Trees does not depend on this module. General Manager imports the definitions; Character Hub can show the Strain bar and Cinders through this API.

Records: a GM-only Journal `[AG] Cinders — GM Records` (flag `registry`; each Cinder may have an `art` path, 0.6.0+). Bearers carry `flags.ashen-gate-cinders.cinders` pointers (with a copy of `sockets` and `art`). Backfire statuses carry `flags.ashen-gate-cinders.backfire`.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-cinders/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-cinders-v<version>`). Change history is in [CHANGELOG.md](CHANGELOG.md).
