# Perks, items and modifiers — shared architecture

Status: **Approved by Robb, 2026-10-21** (all 12 decisions; see §8). Built in steps, one module per release: the first is General Manager 0.41.0 (the `modifiers` block and `implementation` field, [modifiers-schema.md](modifiers-schema.md)). Sections 1–7 are the original proposal; where §8 differs, §8 wins.

Target: Foundry V14 on The Forge, dnd5e 6.0.6 (2024 rules). Examples use synthetic `[TEST]` data. **No mechanics or numbers here are rules.** They show shape only.

Assumed context:
- Cinders are being split out of Skill Trees into a new module, **`ashen-gate-cinders`**. This doc takes that split as given. Wherever it says "Cinders", read "Cinders, or Skill Trees until the split ships".
- The Cinder content format is the one in [cinder-strain-schema.md](cinder-strain-schema.md), on open PR #155, and [cinder-strain-design.md](cinder-strain-design.md). This doc does not change that format.

Module versions read: Manager 0.38.1, Skill Trees 0.16.0, Character Hub 0.17.0, Headquarters 0.10.0, Profession Ledger 0.22.0, Renown (factions) 0.11.1, Quest Log 0.8.0.

---

## 1. Inventory: how each system does "perks" today

### 1.1 Skill Trees: profession, generic and Cinder trees
- **Definition.**
  - A tree node's `perkId` names a canonical record. Allowed prefixes depend on the provider (`allowedSourceForProvider`, `modules/ashen-gate-skill-trees/scripts/engine.mjs:10-15`):
    - `profession` → `PERK-*`
    - `cinder_milestone` → `POWER-*`
    - `generic_points` → `PERK-*` or `POWER-*`
    - `HPERK-*` is refused.
  - The perk is a world **`feat` Item** imported by Manager. `safePublicSource` (`scripts/main.js:97-103`) accepts it only if it is approved, public, has entityType `ProfessionPerk` or `Power`, and has no "placeholder" in its name.
  - `perkDoc` (`main.js:93`) looks the id up through Manager's binding. Only world Items are used; there is no compendium lookup.
- **Apply.**
  - On unlock, `givePerk` (`main.js:161-172`) copies the world Item's `toObject()`, effects included, onto the Actor.
  - It tags the copy with `flags.ashen-gate-skill-trees.grant = {perkId, treeId, nodeId, wallet, perkUuid}` (`grantTag`, `engine.mjs:331`).
  - Refund deletes every Item tagged for that node (`removeGrants`, `main.js:430-435`).
  - So **mechanics come from whatever the Item carries**: dnd5e activities, uses and Active Effects. Skill Trees adds no numbers of its own.
- **State.** Actor flag `progressV2`. Profession trees also have level gating from Ledger and the history/keep/undo tools.

### 1.2 Cinder powers and enhancements (Cinders)
- **Definition.**
  - `POWER-*` records with a typed `power` block (`ag-power/0.1`).
  - `kind` is `power` (has `push_modes`) or `enhancement` (modifiers only, or used as a requirement).
  - `power.modifiers[]` = `{target, value, powers?, modes?, stack?, label}`.
  - `target` is one of `push.cost`, `backfire.chance`, `backfire.severity`, `strain.recovery` (`MODIFIER_TARGETS`, `scripts/cinder.mjs:13`).
  - `value` is a whole number from −100 to 100, never 0 (`modifierProblems`, `cinder.mjs:44-58`).
  - A Push mode's `requires.powers` makes the mode appear only when those powers are unlocked. This is how a perk *adds an option*, with no modifier involved.
- **Apply.**
  - `collectModifiers` (`cinder.mjs:141-153`) adds up the modifiers of the powers unlocked on the Cinder. Within one `stack` name, only the one with the **largest absolute value** counts.
  - `planPush` (`cinder.mjs:166-176`) uses cost, chance and severity. `recoveryBonus` (`cinder-runtime.mjs:353`) uses recovery.
  - Backfire `effect` creates a status-only Active Effect with a duration (`applyEffect`, `cinder-runtime.mjs:225-230`).
  - Everything else is chat text for the GM.
- **State.** A Cinder instance in a GM-only Journal (bearer, points, unlocks). Strain is in `flags.ashen-gate-strain.state` on the Actor.

### 1.3 Headquarters hireling perks (`HPERK-*`)
- **Definition.**
  - The schema check is in Manager (`modules/ashen-gate-manager/scripts/contract.js:35-54`):
    - `contexts` ⊂ `headquarters | field | passive`
    - `conditions` = `{requires_working, requires_presence, eligible_facility_refs: FAC-*[], required_capability_keys}`
    - `stacking` = `{overlap_group, allow_overlap}`
    - `implementation` ∈ `automatic | informational | gm_resolved | hybrid`
    - When the perk becomes an Item, it must be a `feat`.
  - Hirelings link perks with the `has_hireling_perk` relation.
- **Apply.**
  - `derivePerkStatuses` (`modules/ashen-gate-headquarters/js/hirelings.mjs:102-125`) marks each perk `eligible`, `inactive` (with reasons) or `unverified`.
  - Stacking (`markNonStacking`, `hirelings.mjs:127-134`, repeated in `js/main.mjs:269-281`): within an `overlap_group` the **first** eligible perk wins, unless `allow_overlap` is set.
  - **Display only.** HQ never reads `implementation`. `automatic` changes nothing.
- **State.** World setting `ashen-gate-headquarters.state` holds the public part. A GM-only Journal holds the private state.

### 1.4 Character Hub companion items and perks
- **Definition.**
  - Ordinary dnd5e Items:
    - `ITEM-MOUNT-*` → `mount-gear`
    - `PERK-MOUNT-*` → `mount-perk`
    - `ITEM-PET-*` → `pet-clothing`
    - `PERK-PET-*` → `pet-perk`
  - The role comes from the id prefix, or from `flags.ashen-gate-character-hub.companion.role` (`ID_PREFIXES`, `modules/ashen-gate-character-hub/scripts/companion-items.mjs:19`). See [companion-items-schema.md](companion-items-schema.md).
- **Apply.**
  - `companionStats` / `itemGives` (`companion-items.mjs:99-122`) **read** Active Effect changes and `system.armor.value`, and show them in plain words.
  - Nothing is applied, either to the mount Actor or to the character.
  - Effects must be `transfer: false`, because the Items sit on the character.
- **State.** `flags.ashen-gate-character-hub.companions[]` on the character: `gearItemIds`, `perkItemIds`, and `clothing` (3 slots for a pet). These are effectively **slots on a host**.

### 1.5 Profession Ledger recipes, materials and crafting
- **Definition.**
  - `MAT-*`, `REC-*`, `PROF-*`, and `PERK-*` (ProfessionPerk). They are classified by the entityType flag first, then by id prefix (`modules/ashen-gate-profession-ledger/scripts/core.mjs:19-31`).
  - A recipe has `result_item_id` → an `ITEM-*` world Item, plus `ingredients`, `tools`, `tier` and `effort` (`normalizeRecipe`, `core.mjs:43-74`).
- **Apply.**
  - A craft copies the result Item's `toObject()`, or its linked core item when `awardCoreItems` is on (`craftResultData`, `scripts/crafting.mjs:110-121`). The **source Item's effects and flags travel with the copy**. No effects are added.
  - The copy is tagged with `flags.ashen-gate-profession-ledger = {entityType, sourceId, craftedFrom, coreItem?}`.
  - `executeCraft` (`crafting.mjs:131-178`) uses up ingredients and rolls back if anything fails.
  - Profession perks are only ids in `professionProgress.selectedPerkIds`. Skill Trees grants the Items.
- **State.** Actor flags `professionProgress` and `knownRecipes`.

### 1.6 Renown: faction and deity rewards
- **Definition.**
  - A reward is `{id, key, audience: group|individual, milestone_id, name, teaser, description, kind: custom|uuid, uuid?, tags, behavior, usage_limit}`.
  - `behavior` ∈ `one_time | repeatable_service | passive` (`modules/ashen-gate-factions/scripts/core.mjs:7,69,121`).
  - Milestones have `selection_mode: all | choose_one`.
  - Deity rewards use the same shape, `individual` only ([renown-deity-schema.md](renown-deity-schema.md)).
- **Apply.**
  - **GM-resolved.** The player sends a claim, the GM approves, and only for `kind: uuid` does `grantItem` (`scripts/module.mjs:269`) copy the Item to the Actor.
  - A `custom` reward is a status change only.
  - Passive rewards cannot be claimed and have no mechanical effect.
- **State.** Journal flags `groupClaims` and `individual`.

### 1.7 Quest Log rewards
- **Definition.**
  - `outcomes.description` is free text (the suggested-rewards text; coin, XP and Renown stay GM-handled).
  - **Item rewards** (0.11.0): rows on the quest, `{quantity, visibility: on_complete|shown|gm, recipient: chosen|each|split}`. The GM drops Items onto the quest editor's *Rewards* section; an Item dropped from a sheet is copied into the GM-only Items folder *Ashen Gate Rewards (Quest Log)* (`modules/ashen-gate-quest-manager/scripts/rewards.mjs:8,59`). Individual quests always give to their character.
  - **Quest files** (0.13.0): `outcomes.item_rewards[]`, at most 50, each `{item_id: ITEM-*, quantity?, visibility?, recipient?, note?}` (never a Foundry uuid; validated in `core.mjs:73-80`). The Item is imported separately and resolved by its canonical id; reimport keeps the GM's changes and every grant.
- **Apply.**
  - **GM-confirmed, automatic grant** (0.12.0, **Give rewards**): when a quest is saved as Completed, the GM picks what to give and to whom; Quest Log copies each Item onto the characters (`actor.createEmbeddedDocuments`, all or nothing per character, contents included, no stacking; `rewards.mjs:184,199`). Nothing is ever taken from anyone; a reward is never given twice in one round (**Grant again** asks first). Dragging a reward row onto a character sheet also grants it (GM only, recorded).
  - Level backups are refused. A whispered chat card goes to the GMs and the recipients' owners; with Character Hub 0.25.0 or later the character's Journey records it.
  - The checkbox `rewardRecorded` ("Rewards handled outside Quest Log", `main.mjs:106`) still marks rewards the GM handled by hand. Quest Log makes no XP or Renown calls.
  - API (GM only, contract `ag-quest-rewards/1`): `api.rewards.list`, `addFromDrop`, `update`, `remove`, `grantable`, `grant`, `grantAgain`.
- **State.** The quest's private state flag `rewards` (GM rows and the `grants` record, `rewards.mjs:228`); granted Items are tagged with the quest and reward so a crash between creating Items and saving the record is repaired. Players see only the rewards their row allows (name, picture, quantity), never who got what.

### 1.8 Summary table

| System | What a "perk" is | Owner of definition / of state | What it can change | Stacking | Applied how |
|---|---|---|---|---|---|
| Skill Trees (profession, generic) | `PERK-*` feat Item, granted on unlock | Manager imports / Skill Trees (`progressV2`) | Anything the Item carries (dnd5e activities, uses, AEs) | dnd5e/Foundry AE rules only | **Automatic** (Item copy); numbers via the Item's AEs |
| Cinder powers | `POWER-*` feat Item + `power` block | Manager imports, Cinders validates / Cinders (instance) | Push cost, Backfire chance and severity, Strain recovery; opens Push modes | Same `stack` name → largest \|value\| only | **Automatic** in the Push/rest engine; Backfire status AE; rest is text |
| HQ hireling perks | `HPERK-*` record | Manager imports / HQ | Nothing yet | `overlap_group`: first eligible wins unless `allow_overlap` | **Informational** (status list); `implementation` ignored |
| Hub companions | `ITEM-/PERK-MOUNT/PET-*` Items | Manager imports / Hub (`companions`) | Nothing applied; shows AE changes and armour | Same-key additions summed for display | **Display only** |
| Ledger crafting | Recipe → `ITEM-*` copy | Manager imports / Ledger (Actor flags) | Whatever the result Item carries | n/a | **Automatic** Item creation |
| Renown rewards | Reward entry on a faction/deity | Renown | An Item copy (`kind: uuid`) or nothing | `choose_one`, `usage_limit` | **GM-resolved** claim; Item copy or text |
| Quest rewards | Item reward rows (`ITEM-*` or a dropped Item) plus free text | Quest Log / Quest Log (quest state, `grants`) | Whatever the granted Item carries | n/a (one grant per reward per round) | **GM-confirmed automatic** Item copy (Give rewards); the rest is text |

---

## 2. What is shared, what diverges, and the pain points

### Shared already (keep it)
- **Canonical id plus a world Item.** Every system ends up as a Manager-imported world Item found by its permanent id (`flags.ashen-gate-manager.source.sourceId`).
- **Grant by copy.** Skill Trees, Ledger, Renown and the Hub all `toObject()` the world Item onto the Actor and tag it with their own flag. Effects and flags travel with the copy.
- **dnd5e data does the stat work.** Where a number changes, it is a dnd5e field or an Active Effect on the Item. Manager 0.37.0+ imports those effects with a stable `eff_id` ([item-effects-schema.md](item-effects-schema.md)).
- **Typed blocks checked by the owner.** Manager stores a record's block in `source.definition` and asks the owning module to check it, feature-detected. This is done today for `power`, `cinder` and `backfire` via `api.cinder.validateDefinition` (PR #155).

### Divergent
1. **Three stacking rules:**
   - Cinder: largest absolute value per `stack`.
   - HQ: first eligible per `overlap_group`.
   - Hub: sums additions.
   - Foundry AEs: mode and priority.
2. **"Automatic" means different things.** HQ declares `implementation: automatic` but nothing applies it. Cinder modifiers are automatic with no flag to say so. Quest and Renown rewards are GM-resolved with no field saying so.
3. **Rewards bind by UUID.** A Renown `kind: uuid` reward points at a world-local UUID, not a canonical id. That breaks the stable-id rule across worlds and reimports.
4. **One module's modifiers can't sit on another module's Item.** Cinder modifiers live only on `POWER-*` records. Manager's Item flag allow-list has a single path (`ashen-gate-character-hub.companion.role`, `modules/ashen-gate-manager/scripts/item-effects.js:24-26`). An `ITEM-*` crafted socket item has nowhere to declare "Push cost −1".
5. **The host of an effect is implicit.**
   - A Foundry AE with `transfer: true` always applies to the Actor holding the Item.
   - Companion and socket items are carried by the character but meant to affect something else (a mount, a pet, a Cinder).
   - Today that is solved with "transfer off, display only".
6. **`PERK-` is overloaded.** Ledger classifies a bare `PERK-` id as a ProfessionPerk when there is no entityType. Hub uses `PERK-MOUNT-` / `PERK-PET-`. Generic trees also use `PERK-`. This works only because entity types are set.

### Pain points for cross-system integration
- **Copies drift.** Reimport updates the world Item, but copies already on characters keep the old effects and blocks. Each module re-reads definitions differently: Cinders reads the copy's `source.definition`, and Hub reads the copy's AEs.
- **Content authors can't tell** from a record whether something is applied, shown, or left to the GM.
- **No shared "attach item to a host" contract.** Hub companion slots and the planned Cinder sockets would be built twice.
- **No shared prerequisite format:** `requires.powers`, HQ `conditions`, Renown milestones and Ledger levels are all different.

---

## 3. Proposed common pattern

Two layers, plus a shared contract for every module-specific number. **No existing id, flag or block is renamed.**

### 3.1 Layer A: dnd5e stats → Active Effects (unchanged)
- Anything dnd5e already models goes on the Item as an Active Effect, imported through `foundry.data.effects` with a permanent `eff_id`. Examples: AC, speed, saves, skills, damage resistances, conditions.
- `transfer: true` means "applies to whoever holds the Item". Use it for character perks and equipment.
- `transfer: false` means "stays on the Item". Use it for companion and socket items. Their host module reads the effects, or later applies them (see §4.6).
- Never use DAE/Midi/macro keys. Manager already refuses them.

### 3.2 Layer B: module mechanics → one typed modifier shape
Some numbers only a module understands: Push cost, Backfire chance, Strain recovery, socket count, or later a hireling bonus. They all use **one** shape, `ag-modifier/1`, which is a superset of today's Cinder modifier:

```json
{
  "target": "push.cost",
  "value": -1,
  "label": "[TEST] Steady Grip",
  "scope": "cinder",
  "op": "add",
  "applies": {"powers": ["POWER-TEST-SPARK"], "modes": ["amplify"]},
  "stack": "grip",
  "requires": {"powers": ["POWER-TEST-FOCUS"]}
}
```

| Field | Required | Meaning |
|---|---|---|
| `target` | yes | A key from the **owning module's** published list (Cinders: `push.cost`, `backfire.chance`, `backfire.severity`, `strain.recovery`; any new key is added by that module's PR). |
| `value` | yes | A whole number; the owning module sets the range (Cinders: −100…100, not 0). |
| `label` | yes | Shown to players wherever the modifier is used. |
| `scope` | no | Which module interprets it: `cinder`, `companion`, `hq`, … **Default: the scope of the block it sits in**, so every existing `power.modifiers[]` entry is already valid as `scope: cinder`. |
| `op` | no | `add` only for now (default). Other operations are reserved, not built. |
| `applies` | no | Narrows the target within the host, with keys the owner defines. Cinders keeps its top-level `powers` / `modes` as aliases, so existing files keep working. |
| `stack` | no | Group name. The rule for the group is owned by the scope (see below). |
| `requires` | no | Prerequisites, keyed by id kind (`powers`, `perks`, `items`, …); the owner checks them. Same idea as Cinder Push modes' `requires.powers`. |

**Stacking.** Each owning module documents one rule per scope. The format does not force one rule on every module.
- Cinders keeps "largest absolute value per `stack`".
- HQ keeps "first eligible per `overlap_group`". In this format that is `stack` = `overlap_group`, and `allow_overlap: true` means "no stack".
- Modifiers with no `stack` always add.

**Interpretation.**
- Each module reads and applies **only its own scope**. A modifier with an unknown scope is ignored and shown as "not applied (module missing)". It never causes an error at runtime.
- Modules reach each other only through `game.modules.get(id)?.api`, feature-detected.

### 3.3 Where the modifier list lives on a record
- On the **record**, in a typed block that Manager stores in `source.definition`. That is exactly how `power.modifiers` works today, so no flag allow-list change is needed.
- A new optional record-level block, usable on any `ITEM-*` / `PERK-*` record:

```json
"modifiers": {"schema": "ag-modifiers/0.1", "list": [ { "...": "ag-modifier/1 entries" } ]}
```

- `power.modifiers` stays where it is. Both are read by the same collector.
- Manager hands each entry to the owning module's validator, feature-detected and grouped by `scope`. It does this the way PR #155 already does with `api.cinder.validateDefinition`.
  - If the owner is missing, Manager warns ("not checked") and still imports.

### 3.4 Declaring how it is applied
- Add an optional record-level field `implementation`: `automatic | informational | gm_resolved` (HQ's `HPERK-*` keeps its own enum, which also has `hybrid`).
- It tells authors, and the UI badge, what to expect.
- The default is worked out from the record: a record with AEs or modifiers is `automatic`; anything else is `informational`.
- HQ keeps validating its own `implementation` as it does now.

### 3.5 Rewards point at canonical ids
- Renown rewards and Quest outcomes gain an optional `grant: {item_id: "ITEM-…" | "PERK-…"}`.
- It is resolved through Manager's binding at grant time, the same lookup Skill Trees uses.
- The existing `kind: uuid` / `uuid` and `outcomes.description` keep working unchanged.
- Quest Log may simply show the referenced Item for the GM to drag. Automatic grants stay a separate decision (§7).

### 3.6 How it covers every example

| Example | Layer A (AE) | Layer B (modifier) | Applied by |
|---|---|---|---|
| Profession / generic perk | Item AEs, `transfer: true` | none, or `scope` of the owning system | dnd5e (copy granted by Skill Trees) |
| Cinder enhancement | optional | `power.modifiers`, scope `cinder` (existing) | Cinders |
| HQ hireling perk | n/a (not an Actor stat) | later, scope `hq` with HQ-owned targets; today `implementation: informational` | HQ (display until HQ adds targets) |
| Mount gear / pet clothing | AEs `transfer: false` | later, scope `companion` | Hub (display; §4.6 for applying) |
| Crafted item | AEs as authored on `ITEM-*` | `modifiers` block, any scope | dnd5e, plus the scope owner once socketed or equipped |
| Cinder socket item | optional, see §4.6 | `modifiers` block, scope `cinder` | Cinders, only while attached |
| Renown / quest reward | carried by the granted Item | carried by the granted Item | GM-resolved claim, then grant by copy |

### 3.7 Compatibility and migration
- **No id, flag or saved-data change.** Existing `power.modifiers`, HQ `stacking` / `implementation`, Hub `companion.role` and Renown `uuid` all read exactly as before.
- New fields are optional, and older modules ignore them.
  - Exception: Manager rejects unknown keys in `foundry.data`, but the new blocks sit at record level, beside `power`. The plan is to confirm in the Manager PR that record-level unknown blocks pass through, as `power` does.
- **Copy drift.** Collectors read modifiers from the copy's `source.definition`, which is how Cinders works today. Each module's existing "Saved data check / Give Missing Perks" style tool refreshes copies on the GM's request. Import never rewrites character copies.
- If an owner ever needs to move a field, it writes a re-runnable migration (dry run first) in GM Setup → Developer Tools, per CLAUDE.md.

---

## 4. Sockets: items that modify a host

A **host** is a thing a module owns that can take attached items:
- a Cinder instance (Cinders);
- a mount or pet companion entry (Hub, whose gear, perk and clothing slots already are this).

Sockets only make sense as a shared contract. Each host module owns its own registry.

### 4.1 Socket item (content)
An ordinary `ITEM-*` record, usually `equipment` or `loot`, that a profession recipe can produce. It gains an optional block:

```json
"socketable": {
  "schema": "ag-socketable/0.1",
  "hosts": ["cinder"],
  "slot_types": [],
  "unique": false
}
```

Its effect on the host is its `modifiers` block (§3.3), with the host's scope. For example:

```json
"modifiers": {"schema": "ag-modifiers/0.1", "list": [
  {"scope": "cinder", "target": "push.cost", "value": -1, "label": "[TEST] Ember Lens"}]}
```

- `hosts` lists host kinds: `cinder`, `mount`, `pet`, … Each kind is published by the module that owns it.
- `slot_types` (optional) restricts which sockets the item fits. Empty means any socket.
- `unique: true` means at most one copy of this `ITEM-*` per host.
- The modifier targets are the ones Robb named: Push cost, Backfire chance, effect severity and rest recovery map to today's four Cinder targets. **No new numbers are proposed.**

### 4.2 Socket count and socket effects
- Base count is a host-module setting. For Cinders: **3 by default, GM-configurable** (Robb's figure). It can be overridden per Cinder definition (`cinder.sockets`, optional).
- Perks or items can change it with a modifier: `{"scope": "cinder", "target": "sockets.count", "value": 1, ...}`. `sockets.count` would be a new Cinders target, added when the socket PR ships.
- **Count going down never deletes anything.** Extra attached items are flagged "over capacity: inactive" until the GM or owner detaches one. This is an open decision.
- A modifier that changes *what a socket does* (`sockets.effect`) is listed as an open decision. It is not designed until Robb gives an example.

### 4.3 Registry and storage (per host instance)
The owner stores attachments **on the host instance**, never on the item:

```json
"sockets": {
  "slots": [
    {"slot": 0, "itemId": "<embedded Item id on the bearer>", "sourceId": "ITEM-TEST-EMBER-LENS",
     "by": "userId", "at": 0, "opId": "op_…"},
    {"slot": 1, "itemId": null},
    {"slot": 2, "itemId": null}
  ],
  "revision": 1
}
```

- **Cinders:** inside the Cinder instance record (the GM-only Journal). The bearer gets a player-safe view, the same as unlocks.
- **Hub:** the existing companion entry (`gearItemIds`, `perkItemIds`, `clothing`) is already a socket list. Hub can expose it through the same API without changing saved data.
- The item stays an embedded Item **in the bearer's inventory**, the way companion gear does. The host keeps only a reference. One item can be attached to one host at a time; attaching it elsewhere detaches it first.
- The item gets a small marker so other modules and sheets can show "attached": `flags.<host-module>.attachedTo = {hostKind, hostId, slot}`. The host module writes it, on its own flag scope, and the registry stays the source of truth.

### 4.4 Attach, detach, swap: validation
All writes run on the active GM client. A player's click is relayed over the host module's socket, as Skill Trees unlocks and Pushes are today. The GM client checks, in order:
1. The user owns the bearer Actor, or is GM. The module's Player Access setting allows it.
2. The item is on the bearer, `socketable.hosts` includes this host kind, and the slot type fits.
3. The slot exists (`count` after modifiers) and is free. For a swap, the old item is detached in the same write.
4. `unique` and any `requires` are met.
5. One write to the registry, carrying an `opId` so a repeated click does nothing. Then the item marker is set. If the marker write fails, the registry is the truth and a "Saved data check" repairs it.

Detach never deletes the item. It goes back to plain inventory. If the item is deleted from the Actor, its slot reads as empty and the entry is cleaned up on the next write.

### 4.5 Permissions
- **Default (open decision):** the bearer's owner can attach, detach and swap on their own host when the module's Player Access allows it. The GM can always do it.
- Optional GM lock per host: "sockets locked". It is enforced in the API, not only by hiding the button.
- A GM-only (`visibility: gm`) socket item, or a Cinder the player can't see, is never listed to players. The API rejects it for non-GMs.

### 4.6 Interaction with Active Effects
- **Layer B modifiers** on an attached item apply only while it is attached. The host's collector reads the registry, then each item's `source.definition.modifiers` for that scope, and combines them with the host's own modifiers using the same stacking rule.
- **Layer A (dnd5e AEs) on a socket item.** The problem: a `transfer: true` effect applies to the bearer whenever the item is in inventory, attached or not. Options:
  - **(a) Recommended for v1:** socket items carry modifiers only, and AEs are `transfer: false` and display-only, the same rule as companion items.
  - **(b) Later:** the host module marks the item equipped when it is attached and unequipped when it is detached, and relies on dnd5e suppressing effects on unequipped items. This needs a Forge check on dnd5e 6.0.6, because suppression depends on item type and settings.
  - **(c)** The host toggles `disabled` on its own effects. Not recommended: a toggle on a Manager-made effect looks like a GM edit to reimport.
- Mount or pet AEs applied to a **linked mount Actor** follow the same choice later. Today Hub applies nothing.

### 4.7 Hooks and API (shape only)
Each host module exposes the same sub-API, contract `ag-sockets/1`:
- `hosts(actor)`
- `slots(hostRef)`
- `canAttach(hostRef, item, slot)` → `{ok, reasons}`
- `attach(...)`, `detach(...)`, `swap(...)`
- the hook `ashenGateSockets.changed`

The Hub shows Cinder sockets through `api.sockets` of Cinders, feature-detected, as it does today for Strain and Cinder panels.

### 4.8 Getting socket items: professions
A recipe's `result_item_id` → a socketable `ITEM-*`. Ledger's craft copies the Item with its blocks, so the crafted copy is socketable with no Ledger change. Ledger never interprets `socketable` or `modifiers`.

---

## 5. Ownership summary

| Concern | Owner |
|---|---|
| Import, file validation, `eff_id`, routing typed blocks to owners | General Manager |
| The `ag-modifier/1` and `ag-socketable/0.1` shapes (this doc, then a schema doc) | Shared contract; each scope's targets owned by its module |
| Cinder modifiers, Cinder sockets registry, socket count | Cinders |
| Companion slots (mount, pet) | Character Hub |
| Hireling perk evaluation | Headquarters |
| Producing items | Profession Ledger (copies; never interprets blocks) |
| Granting perk Items from trees | Skill Trees |
| Reward claims | Renown; Quest Log stays text unless Robb decides otherwise |

---

## 6. For ChatGPT

The self-contained brief is [perks-and-modifiers-for-gpt.md](perks-and-modifiers-for-gpt.md). Studio places a copy in the private supplement repo.

---

## 7. Open decisions for Robb (ask one at a time)

| # | Question | Recommended default |
|---|---|---|
| 1 | Adopt the two layers (AE for dnd5e stats, `ag-modifier/1` for module numbers) as the suite standard? | Yes |
| 2 | Stacking: keep each module's own rule (Cinder largest, HQ first-eligible), or one rule everywhere? | Keep per module, documented per scope |
| 3 | Add the record-level `modifiers` block to `ITEM-*` / `PERK-*` records (Manager validates by delegating)? | Yes, starting with scope `cinder` only |
| 4 | Cinder socket count: 3 default, GM setting, per-Cinder override? | Yes |
| 5 | Who can attach/detach/swap: owner when Player Access allows, or GM only? | Owner + GM, with a GM lock per Cinder |
| 6 | When a Cinder is transferred, do attached items go with the Cinder or stay with the old bearer? | Stay with the old bearer (detached); matches "item stays in inventory" |
| 7 | When the socket count drops, what happens to the extra items? | Stay attached but inactive until one is removed; nothing deleted |
| 8 | Can socket items carry dnd5e AEs that affect the bearer? | Not in v1 (modifiers only); revisit with the equip-gating option |
| 9 | "Perks/items modify socket effects": what is an example? | Don't design until Robb gives one |
| 10 | Should mount/pet items ever apply AEs to a linked mount Actor? | Not now; display only |
| 11 | Renown/Quest rewards: add `grant.item_id` (canonical id) next to `uuid`? Should Quest Log ever grant automatically? | Add the id; Quest Log stays GM-granted |
| 12 | Add the optional `implementation` field to all perk-like records for author clarity? | Yes, optional, display only |
| 13 | Which socket items exist, which professions make them, and their numbers? | Content for the private repo, written by GPT from the schema once 1–8 are settled |

Build order once agreed:
1. Schema doc `docs/modifiers-schema.md`, plus Manager validation that delegates by scope.
2. Cinders reads `modifiers` blocks from items (no sockets yet).
3. Cinders sockets.
4. Hub shows sockets, and exposes `ag-sockets/1` for its companion slots.

---

## 8. Robb's decisions (2026-10-21)

1. **Two layers are the suite standard.** Layer A: dnd5e Active Effects for dnd5e stats (Manager 0.37.0+, with `eff_id`; `transfer` always explicit, `false` on companion and socket items). Layer B: one typed `ag-modifier/1` shape, a superset of Cinders' modifier (optional `scope` defaulting to its block, add-only `op`, `applies`, `requires`). Each module interprets only its own scope.
2. **Stacking stays per module**, documented per scope: Cinders largest per `stack`, HQ first eligible, Hub sums.
3. **Record-level `modifiers` block** on `ITEM-*` / `PERK-*` records. Manager checks the shape and delegates entries to the owner by scope, starting with `cinder` only.
4. **Cinder sockets:** 3 by default as a GM setting, optional per-Cinder override, swappable; a perk modifier can add a socket.
5. **Who attaches, detaches and swaps:** the Cinder's owner (while Cinders Player Access allows) and the GM, with a GM lock per Cinder.
6. **On a Cinder transfer** the attached socket items stay with the old owner, detached from the Cinder.
7. **If the socket count drops,** the extra attached items stay attached but **inactive** until one is removed. Nothing is deleted.
8. **v1:** socket items change the Cinder only through modifiers (Push cost, Backfire chance, effect severity, rest recovery, socket count). No dnd5e Active Effects reach the bearer from sockets.
9. **"Perks modify sockets"** means a perk adds a socket. Nothing else is designed.
10. **Mount and pet items** stay display-only.
11. **Renown and Quest rewards** carry the canonical item id next to the uuid (a separate build: rewards and loot).
12. **`implementation`** is an optional, display-only field on perk-like records: `automatic`, `informational` or `gm_resolved`.

Build order: (1) the schema and Manager's check (Manager 0.41.0); (2) Cinders reads `modifiers` blocks from attached items and perks; (3) Cinders sockets (`ag-sockets/1`); (4) Character Hub shows sockets read-only. Skill Trees never depends on Cinders.

As built (Cinders 0.3.0): there is no `socketable` block (§4.1). An `ITEM-*` with at least one `cinder` modifier fits a Cinder socket. The per-Cinder socket count is set by the GM on the Cinder (Manage), not in content (§4.2). There is no `slot_types` or `unique` yet.
