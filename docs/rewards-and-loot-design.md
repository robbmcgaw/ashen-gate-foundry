# Rewards and loot distribution — shared design (FINAL)

Status: **Final.** Robb took every decision on 2026-10-21; the authoritative list is `working/PRODUCT_QUESTIONS.md` → "Rewards and loot design" in the private repo, and §10 repeats it. Build briefs are in [`docs/rewards-briefs/`](rewards-briefs/README.md). This doc changes no code, version or saved data by itself.

Backlog item: **F13 Rewards and loot distribution.**
Target: Foundry V14 on The Forge, dnd5e 6.0.6 (2024 rules). Examples use synthetic `[TEST]` data. **No mechanics, amounts or numbers in this doc are rules.**

Module versions read (main `35ce7d0`):
- Quest Log 0.10.1, Renown (factions) 0.13.1, Utilities 0.16.1, Character Hub 0.23.0
- Skill Trees 0.19.1, Profession Ledger 0.24.1, Locations 1.17.1, Manager 0.43.1
- Headquarters 0.12.1, Cinders 0.5.1
- Shared UI kit 2.1.0 ([ui-standard.md](ui-standard.md), branch `design/ui-standard`)

Builds on [perks-and-modifiers-architecture.md](perks-and-modifiers-architecture.md), approved decision 11:
- A reward carries the **permanent item id** next to the Foundry uuid.
- The id is filled in automatically from the Item's `flags.ashen-gate-manager.source.sourceId` when that flag is present.
- When it is absent, the reward shows a note.

Quest Log stays **GM-granted**: every grant is started and confirmed by the GM. "Automatic" here only means the GM no longer copies items by hand.

---

## 0. Goal in one paragraph

Adding and moving items works the same way in every module. You drag an item from a character sheet, an NPC or monster sheet, a compendium, the Items sidebar or any Ashen Gate list, and drop it on anything that accepts items.

Robb's example:
1. Drag a sword off a beast NPC into a quest's rewards. The NPC keeps its sword.
2. When the GM marks the quest Completed, a confirmation lists the rewards and who gets them.
3. The GM clicks Grant, and the sword lands on the chosen character.
4. Or the GM drags the sword out of the quest onto a sheet, which counts as granted too.

The character's Journey (Character Hub) records what the quest gave them.

---

## 1. Inventory: every drop zone and reward mechanism today

Line numbers point at whole (often one-line) functions on main `35ce7d0`. Re-locate them with grep before editing.

### 1.1 Drop zones that accept Foundry documents

**Utilities: Party Inventory tab** (`.agu-main`)
- File: `modules/ashen-gate-utilities/scripts/main.mjs:990-996`.
- Accepts: `type:'Item'` + `uuid`.
- Parsing: `dragData` `main.mjs:895-898` (`TextEditor.getDragEventData`, JSON fallback).
- Result: moves an owned Item into the stash Actor; copies a world or compendium Item (GM only).
- Missing document: warns.

**Utilities: `api.embed.mount`** (Hub's Inventory tab)
- File: `mountEmbed` `main.mjs:1018-1067` (drop at 1061-1063).
- Same as the Party Inventory tab.

**Utilities: native actor-sheet drop** (`dropActorSheetData`)
- File: `onSheetDrop` `main.mjs:901-907`, hook at :1136.
- Accepts: Item.
- Result: stash → sheet withdraws; sheet → stash deposits.

**Renown: `[data-reward-drop]`** (faction group/personal, deity)
- File: `modules/ashen-gate-factions/scripts/module.mjs:389-391`; one zone in the `agfRewardLevel` partial, `templates/dashboard.hbs:39`, used at :172, :173 and :280.
- Accepts: **any document type** (not checked).
- Parsing: `getDragEventData`, or builds `type.id`.
- Stores: reward `{kind:'uuid', uuid, name, teaser}`; **no img, no quantity, no permanent id**.
- Missing document: throws "Document not found."

**Renown: `[data-entry-drop]`** (info entries)
- File: same handler; `dashboard.hbs:168, 285`.
- Accepts: any document. Parsing: same.
- Stores: info link `{uuid, link_mode:'document'}`.
- Missing document: same.

**Character Hub: companion slots** (`[data-drop-companion]`)
- File: `_onCompanionDrop` `modules/ashen-gate-character-hub/scripts/sheet.mjs:428-441`; zones in `companion-views.mjs:61,72,83,90`.
- Accepts: Item (mount and pet slots also take Actors).
- Parsing: `droppedItem` `sheet.mjs:211-218` (`getDragEventData` + `fromDropData`).
- Result: copies the Item onto the character (`embedDropped` `companions.mjs:157-164`).
- Missing document: `fromDropData` returns null.

**Character Hub: quick bar** (`[data-hotbar-slot]`)
- File: `_onHotbarDrop` `sheet.mjs:419`; slots in `hotbar-views.mjs:26-27`.
- Accepts: an Item already on this Actor, or a world Macro.
- Parsing: same as companion slots.
- Stores: a `{type:'Item', id}` reference only.
- Missing document: refused.

**Skill Trees: tree board** (GM edit mode)
- File: `_dropped` `modules/ashen-gate-skill-trees/scripts/main.js:1266-1280`; `_addPerkNode` :953.
- Accepts: a `feat` Item whose source id is `PERK-*`/`POWER-*` and that is the canonical world document.
- Parsing: **raw `JSON.parse`** of `text/plain`.
- Stores: `perkId` only.
- Missing document: refused.

**Cinders: Manage → Sockets** (GM)
- File: `_drop` `modules/ashen-gate-cinders/scripts/main.mjs:270-280`; `attachDropped` `cinder-runtime.mjs:483-495`.
- Accepts: an Item with a uuid that is a Manager-imported `ITEM-*` with cinder modifiers.
- Parsing: **raw `JSON.parse`**.
- Result: a world Item is copied onto the bearer, then attached. An Item already on the bearer is attached. An Item on another Actor is refused.
- Missing document: refused.

**Locations: `[data-drop]` sections** (resources, **loot**, details, factions, notes)
- File: `onDrop` `modules/ashen-gate-locations/scripts/app.mjs:935-966`.
- Accepts: Item (resources, loot); any document for links.
- Parsing: `dragData` `app.mjs:86-89`.
- Stores, for loot: `{label, img, uuid, docType:'Item', status}`, a link only (comment at :947).
- Missing document: **silently ignored**.

Not item drops, and out of scope:
- Renown faction folders (`module.mjs:388-390`).
- Locations folders, reorder and canvas placement (`app.mjs:823-870`, `main.mjs:179`).
- The Headquarters board (`js/main.mjs:379-381, 457, 467`, raw `JSON.parse` of its own `{kind, key}`).

No drop zones today: Quest Log, Profession Ledger, Manager (Manager is a drag source only).

**Coming: Utilities shops.** The rules are already in `utilities/scripts/core.mjs`: `normalizeLine` stores `itemId` + `itemUuid` + a snapshot + `contents`. The shop editor drop zone is planned in `design/shopping` (brief 02). It accepts **folders**, and it is written to use this standard's helper once it is on main.

### 1.2 Drag sources

| Module | Source | Payload |
|---|---|---|
| Utilities | Stash rows `[data-stash-item]` (`rowHTML` `main.mjs:923`; dragstart :989/:1058) | `{type:'Item', uuid}` |
| Character Hub | Item cards `[data-drag-uuid]` (`cards.mjs:111`, `onItemDragStart` `sheet.mjs:220-225`) | `{type:'Item', uuid}` |
| Skill Trees | Perk list `.agst-feature` (`main.js:725`, `templates/tree.hbs:113`) | `{type:'Item', uuid}` |
| Manager | Browse rows (`main.js:2079-2083`, `dragDataOf` `browse.js:340`) | `doc.toDragData()`, else `{type, uuid}`; includes compendium index entries |
| Foundry / dnd5e | Actor sheets (PC and NPC, linked and token), Items sidebar, compendiums | `{type:'Item', uuid}`; a sidebar folder sends `{type:'Folder', uuid}` |

### 1.3 Functions that put Items on Actors

**Utilities**: `executeDeposit` `main.mjs:793-813`, `moveItem` :777-792, `containedItems` / `moveBundle` `core.mjs:294-318`
- Copy or move: **moves** an owned Item (all or nothing); **copies** a world or compendium Item.
- Permissions: socket to the GM; the user must be the owner or the GM.
- Containers: contents travel with the container. *Gap:* a compendium container looks up its contents in `game.items`, so it arrives empty.
- Quantity: no merge.
- Retry safety: `takingItems` lock, and the vote.

**Renown**: `grantItem` `module.mjs:271`, from GM `resolveRequest` :496-512
- Copy or move: copy.
- Permissions: the player claims over the socket; the GM approves.
- Containers: no. Quantity: no.
- Retry safety: skips if an Item flagged with this `claimId` exists. *Gap:* a missing source leaves the claim silently `approved`.

**Character Hub**: `embedDropped` `companions.mjs:157-164`
- Copy or move: copy.
- Permissions: the GM or the owner.
- Containers: no. Quantity: no. Retry safety: none.

**Cinders**: `attachDropped` `cinder-runtime.mjs:483-495`
- Copy or move: copies a world Item onto the bearer, and deletes the copy if attaching fails.
- Permissions: GM.
- Containers: no. Quantity: no.
- Retry safety: socket registry `opId`.

**Skill Trees**: `givePerk` `main.js:165-176`
- Copy or move: copy of the canonical perk.
- Permissions: the GM, under a per-Actor lock.
- Containers and quantity: not applicable.
- Retry safety: reuses the tagged copy.

**Ledger**: `executeCraft` `crafting.mjs:131-181`, `stackMaterial` `gathering.mjs:104-121`, `assignProfessions` `main.js:465-488`
- Copy or move: copy.
- Permissions: the GM, with locks.
- Containers: no.
- Quantity: **stacks by `sourceId`**.
- Retry safety: rollback.

Locations and Quest Log put no Items on Actors.

### 1.4 Reward mechanisms today

**Quest Log**
- Free text in `source.outcomes.description`, labelled "Suggested rewards / outcomes" (`quest-manager/scripts/main.mjs:72`, written :92).
- A tick box `state.rewardRecorded`, "Reward handled by GM (no automatic grants)" (`main.mjs:125`, saved :234). It is copied to the player view (`core.mjs:55`).
- No item, coin, XP or Renown fields.

**Renown**
- Reward entries `{id, key, audience, milestone_id, name, teaser, description, kind: custom|uuid, uuid?, tags, behavior, usage_limit}` (`source-allowlist.mjs:14,37`; `core.mjs:69,121`).
- Claims are in the journal flags `groupClaims` and `individual`.
- No item id. `migrate()` (`module.mjs:184-194`) does no reward work.

**Utilities**
- `api.awardGold` (GM, each/split, Undo) (`README.md:17,28`) is the only coin grant.

**Ledger**
- Profession XP only, awarded by the GM. No module awards character XP.

**Character Hub Journey** (0.20.0+)
- A per-character log: `recordReward(actor, {questId, questName, coins, text})` (`character-hub/scripts/journey.mjs:160`, `api.journey.recordReward`).
- GM only, idempotent per quest and character (entry id `reward-<questId>`).
- Its stated purpose is to be called by this rewards build.

**Locations**
- `loot` entries with status available/discovered/taken, as links.

### 1.5 What differs (the problem F13 fixes)

1. **Five drop parsers:**
   - `getDragEventData` (Utilities, Renown, Locations)
   - plus `fromDropData` (Hub)
   - raw `JSON.parse` (Skill Trees, Cinders, HQ)
2. **Type checks differ:** Renown takes any document as an item reward.
3. **A missing document is handled three ways:** silent (Locations), throw (Renown), warning (Utilities).
4. **Only Utilities carries container contents,** and even there compendium containers arrive empty.
5. **Rewards keep only a world-local uuid.** An item dragged off an unlinked token (`Scene.…Token.…Actor.…Item.…`) disappears with the token: Robb's "sword off a beast" case.
6. **Retry safety exists in some flows only** (Renown `claimId`, Skill Trees grant tag, Cinders `opId`).

---

## 2. Shared item-drop standard (`ag-item-drop/1`)

### 2.1 What a dropped item becomes: the **item reference**

```json
{
  "schema": "ag-item-ref/1",
  "uuid": "Compendium.world.test-gear.Item.abc123",
  "itemId": "ITEM-TEST-RUSTED-BLADE",
  "name": "[TEST] Rusted Blade",
  "img": "icons/weapons/swords/sword-guard-brown.webp",
  "type": "weapon",
  "quantity": 1,
  "sourceKind": "compendium",
  "packId": "world.test-gear",
  "parentUuid": null,
  "contents": 0
}
```

| Field | Meaning |
|---|---|
| `uuid` | Where the item was dropped from. A world-local **hint**, not identity. |
| `itemId` | The permanent id. It is looked up in `flags.ashen-gate-manager.source.sourceId`, then the Ledger's `sourceId`, then `flags.ashen-gate.sourceId`: the same order as Locations' `materialIdOf` (`locations/scripts/model.mjs:630`). `null` when there is none, and the GM sees the note "No permanent id: this reward is tied to this world". |
| `name`, `img`, `type` | A snapshot taken at drop time, so a row still reads properly if the item vanishes. |
| `quantity` | Integer ≥ 1. Defaults to the item's `system.quantity`, else 1. |
| `sourceKind` | `world`, `compendium`, `embedded` (on any Actor: PC, NPC, token, stash) or `holding` (§2.4). |
| `packId`, `parentUuid` | Set for compendium and embedded items. |
| `contents` | Number of items inside it (dnd5e container); 0 otherwise. Display only. |

This is the same idea as Utilities' shop lines (`itemId` + `itemUuid` + snapshot), so shops fit it unchanged.

### 2.2 Validation when the item is dropped

| Drop | Rule |
|---|---|
| `type:'Item'` with a uuid | Resolve it (`fromDropData`, then `fromUuid`) and check `documentName === 'Item'`. Anything else is refused: "Drop an item." Nothing is stored. |
| World Item | Accepted. |
| Compendium Item | Accepted. Read through the pack; nothing is imported (§6.3). |
| Embedded Item (any Actor) | Accepted. **The source is never changed** (decision D1: copy; NPCs stay as they are). |
| `type:'Folder'` | **Refused on reward zones** (D6): "Drop items one at a time." The helper can expand a folder of Items when a zone opts in (`{folders: true}`). Utilities' shop editor does. |
| Actor, Journal, Macro, … | Refused, unless the zone documents another use (Hub mount slots take Actors; Renown info entries take Journals). **Renown reward zones take Items only** (D13). |
| Not found or not readable | "That item no longer exists or you can't see it." Never silent. |
| Dropped from this same zone | A reorder; nothing is created. |

### 2.3 Items that no longer exist later

A stored ref is looked up again when it is used: granted, opened or dragged out.
1. **The permanent id**: the one active world Item whose `flags.ashen-gate-manager.source.sourceId` equals it. It is skipped when the source is retired or superseded, or when two Items claim the id. These are the same rules as `lookupWorldDefinition` in Skill Trees, Ledger and Cinders (`scripts/definition-lookup.mjs`); the helper carries its own small copy of the rule, because Quest Log and Renown don't ship that file. The id wins over the uuid, so a fresh world or a reimport still works.
2. **The uuid**: world, compendium, embedded or holding.
3. **Not found.** The row keeps its snapshot, gets a "Missing" badge (`.ag-badge--danger`), can't be dragged, and is **unticked** in the grant dialog with the reason. It is never skipped silently.

### 2.4 Holding copies (D2)

A reward that points at `Actor.<npc>.Item.<x>` breaks when the NPC or token is deleted. When an **embedded** item is dropped on a zone that stores it for later (Quest Log rewards, Renown rewards):
- The module creates a **holding copy**. It is a world Item, ownership `NONE` for everyone but the GM, in a folder found by `flags.<module>.store = 'reward-holding'` (named `Ashen Gate Rewards (<Module>)` and created on first use).
- The copy is flagged `flags.<module>.holding = {from: parentUuid, at}`.
- Container contents are copied with it (`grantBundle`, §2.5).
- The ref stores the holding copy's uuid, `sourceKind:'holding'`, and the original's `itemId`.

World and compendium drops need no holding copy. Zones that act at once (stash, Hub slots, Cinder sockets) need none either.

### 2.5 The helper: one shared file, byte-identical

**One shared file, `ag-item-drop.mjs`, byte-identical in every module that accepts item drops.**
- `scripts/check.mjs` adds it to its shared list: today `ag-launchers.mjs`, `ag-ui.css`, `ag-dialogs.mjs`, `ag-html.mjs` (`check.mjs:105-113`).
- A module without item drops doesn't ship it.
- It is **pure**: `game` and `foundry` are read at call time. It imports nothing from any module, holds no state or settings, **never writes documents**, and has no UI. Writing stays in each module, under that module's own permission checks.

Contract `ag-item-drop/1` (exports):

```js
export const ITEM_DROP_CONTRACT = 'ag-item-drop/1';
// Parse the drag event. Never throws; {} when unreadable.
readDrop(event)                                            // -> raw drag data
// Resolve + validate. Refuses non-Items, folders (unless opted in) and missing docs, with player-safe text.
await resolveItemDrop(raw, {folders = false, maxFolder = 100})
                                                           // -> {ok, items:[Item], reason}
// The permanent id of an Item (lookup order in §2.1), or null.
itemIdOf(item)                                             // -> 'ITEM-…' | null
// Build the ag-item-ref/1 snapshot.
itemRef(item, {quantity})                                  // -> ref
// Find a stored ref again: id first, then uuid.
await resolveRef(ref)                                      // -> {status:'ok'|'missing'|'conflict', item}
// The one active world Item bound to a permanent id (rules in §2.3), or null.
worldItemById(itemId)                                      // -> Item | null
// The item and every nested item inside it (dnd5e system.container), reading contents from the
// same place as the item: an Actor, the world, or the item's own compendium pack.
await bundleOf(item)                                       // -> [Item, ...contents]
// Create-data for one recipient: toObject() of the bundle, fresh _ids, system.container remapped,
// root container cleared, root quantity set, strips _id/folder/sort/ownership/_stats, adds `tag`
// under the caller's flag scope on every document.
await grantBundle(item, {quantity, scope, tag})            // -> {data:[...], contents}
// Payload for dragging a stored ref out of a list.
dragPayload(ref, extra = {})                               // -> {type:'Item', uuid, agItemRef: ref, ...extra}
```

Notes:
- `resolveRef` never shows a player anything: the modules call it on the GM client, or for display only. `conflict` (two world Items claim the id) is shown to the GM as "Two items use this id".
- `bundleOf` + `grantBundle` generalise Utilities' `containedItems` / `moveBundle`, and fix the compendium-container gap: contents are read from the container's own pack.
  - Before relying on dnd5e 6.0.6's own helpers (`system.contents`, `Item5e.createWithContents`), the S1 build checks them in Forge.
  - Otherwise it walks `system.container` as `containedItems` does.
- `dragPayload` keeps the plain Foundry `{type:'Item', uuid}`, so every sheet accepts it, and adds `agItemRef`. Foundry ignores the extra key.
- **Between modules, feature detection stays the rule.** A module never imports another module's copy. It uses the other module's public API (`game.modules.get(id)?.api`) and leaves the option out when that API is absent.

### 2.6 Who writes

- Reading and validating happens on the client that dropped.
- Writing (holding copy, grant, storing a reward) goes through the owning module's GM path:
  - Quest Log: GM client only. All reward editing is GM-only, so no socket is needed.
  - Renown, Utilities, Hub, Cinders: their existing sockets and checks.

---

## 3. Quest item rewards (Quest Log)

### 3.1 Where rewards come from

1. **Imported** rewards: `outcomes.item_rewards[]` in the quest definition (§8), keyed by `item_id`.
2. **GM-added** rewards: dropped on the quest in the GM editor. These are stored in quest **state**, never in the definition, so **reimport never removes them**. In update mode, `importQuests` replaces the definition and keeps the state.

The GM sees one merged list.

### 3.2 The reward list (GM editor)

A section **Item rewards** sits under the outcomes text, in the editor's state area (the same panel as status and "Reward handled").
- **Drop zone:** `.agq-reward-drop` with the hint "Drop items here: from a sheet, an NPC, a compendium or the Items sidebar." It refuses folders (D6).
- **Rows:** an `.ag-table` with these columns:
  - Item: image, name, `itemId` in `--ag-font-mono`, or the `.ag-badge` "No permanent id".
  - Qty: a number input.
  - Shown to players: a select of `on_complete` (default, D3), `shown`, `gm`.
  - Goes to: `chosen` (default, D4), `each`, `split`.
  - Status: `.ag-badge` Granted / Missing / Not yet.
  - Actions: Remove, an `--icon` button with `aria-label`, behind `confirmDialog(…, {danger: true})`.
- Removing an imported row stores `removed: true` in state. The definition is untouched, so a reimport doesn't bring it back.
- **Drag-out (D8).** Each row is draggable (GM only), with `dragPayload(ref, {agQuestReward: {questId, rewardKey}})`.
  - Quest Log's `dropActorSheetData` hook sees `agQuestReward`, returns `false` (Foundry's own copy is skipped), and runs the **same grant function** for that row and that Actor.
  - The grant is recorded and can't be given twice: a second drop on the same character warns "Already given to <name>."
  - Dropped on another Ashen Gate zone, the payload acts as a normal Item drag of the source.
- **Grant again (D5),** kept minimal: a granted row shows **Grant again** (`--sm`). After `confirmDialog('Give this reward again?', {danger: false, yes: 'Grant again'})` it raises the row's `round` by 1, so the row becomes grantable again.

### 3.3 Visibility to players (D3)

- `visibility` per row: `gm` (never shown), `on_complete` (shown once Completed; the **default**), `shown` (teased while the quest is visible).
- `publicView` (`quest-manager/scripts/core.mjs:47-56`) gains `rewards: [{name, img, quantity}]`, holding only rows the player may see.
  - It never carries uuids, item ids, holding info or recipients.
  - Filtering happens in the projection, not in CSS.
- Players see these rows in the quest detail, and in the Hub's embedded Quest Log, under "Rewards" (`.ag-rows`). An empty list shows nothing.

### 3.4 Who receives (D4)

| Rule | Meaning |
|---|---|
| `chosen` | One character, picked by the GM in the dialog. **Default on party quests.** |
| `each` | Every ticked party character gets the full quantity. |
| `split` | Quantity shared out in whole units. The dialog shows who gets what; the GM picks who gets any remainder (no automatic rule). |

- **Individual quests:** the recipient is the quest's `actorId`, and the rule is fixed.
- **Party characters:** the Actors the quest is projected to (the same set `projectionOwnership` uses); the GM can untick anyone.
- *Later, not built:* "to the party stash". It needs a Utilities API that takes create-data (`api.stash.receive`), and today's `deposit(uuid)` can't set a quantity.

### 3.5 Completion flow

1. The GM sets status **Completed** and saves. If any row is grantable (not removed, not granted in its current round, and not Missing), the editor opens the **Give rewards** panel (`.agq-grant`) under the reward list. Otherwise it just saves. The shared `formDialog` is flat (no images, no live summary), so the per-row choices live in the panel, and the confirmation is a dialog.
2. The panel has one `.ag-table` row per reward:
   - a tick box (default ticked unless Missing);
   - image, name and quantity;
   - the recipient control (`chosen`: character select; `each`: character ticks; `split`: per-character whole counts that must add up);
   - a "Will receive" summary per character under the table.

   Its own `.ag-footer` has **Not now** (ghost, left; the status is already saved and the rewards stay pending) and **Grant rewards** (primary, right). The reward section also has a **Give rewards** button, so the panel can be opened later.
3. **Grant rewards** asks `confirmDialog('Give these rewards?', {yes: 'Grant rewards'})`. The body lists each character and their items by name, never ids.
4. On confirm, on the GM client, under a per-quest lock:
   1. Re-resolve every ticked row (§2.3). Rows that went missing stop **that character's** grant, with the reason.
   2. Group the rows by character. For each character, **all or nothing**:
      - build every `grantBundle`;
      - create them in **one** `createEmbeddedDocuments` call;
      - verify that every one arrived;
      - on any failure, delete the copies just made.
      - Nothing is ever deleted from a source.
   3. Tag each created item `flags.ashen-gate-quest-manager.reward = {questId, rewardKey, round, grantId}`.
   4. Write the grant record into quest state (§3.6), then republish the player view.
   5. **Journey** (Hub, feature-detected): for each character granted, call `api.journey.recordReward(actor, {questId, questName, grantId, items: [{name, img, quantity, itemId}]})` (§5.2). If the Hub is absent or older, skip it silently.
   6. **Chat card (D9):** whispered to the GM users and the owners of each recipient, listing names and quantities only.
5. Show the results per character (granted / failed + reason) in an `infoDialog`.

`rewardRecorded` (the existing checkbox) stays and keeps its meaning: "handled outside Quest Log".
- The player view's `rewardRecorded` becomes `rewardRecorded || every visible row granted`.
- Older readers still get a boolean.

### 3.6 State and idempotency

New optional quest-state block. It is additive; `validState` (`core.mjs:38-46`) gains checks for it.

```json
"rewards": {
  "v": 1,
  "added": [
    {"key": "rw-k3j9x", "ref": {"schema": "ag-item-ref/1", "itemId": "ITEM-TEST-RUSTED-BLADE", "uuid": "Item.h0ld1ng", "sourceKind": "holding", "name": "[TEST] Rusted Blade", "img": "…", "quantity": 1},
     "visibility": "on_complete", "recipient": "chosen"}
  ],
  "overrides": {"def:ITEM-TEST-HEALING-DRAUGHT": {"quantity": 2, "visibility": "shown", "recipient": "each", "removed": false, "round": 1}},
  "grants": [
    {"grantId": "g-7f2a", "at": 0, "by": "userId", "lines": [
      {"rewardKey": "def:ITEM-TEST-HEALING-DRAUGHT", "round": 1, "actorId": "abc", "quantity": 2, "itemIds": ["…"], "status": "granted"},
      {"rewardKey": "rw-k3j9x", "round": 1, "actorId": "def", "quantity": 1, "itemIds": [], "status": "failed", "reason": "Missing"}]}
  ]
}
```

- **Reward keys:** `def:<item_id>` for imported rows (stable across reimports), `rw-<random>` for rows the GM added. `round` defaults to 1.
- **Granted** for a character means a `grants` line says `granted` for `(rewardKey, round, actorId)`, **or** the Actor holds an Item tagged with that triple (the Renown `claimId` lesson).

What this guarantees:
- **Completing twice never gives twice.** The dialog offers only rows not yet granted in their current round. If none are left, it doesn't open.
- **A crash between creating items and writing the record** is safe: the next attempt finds the tags, repairs the record, and creates nothing again.
- **Re-opening and re-completing a quest** offers only what wasn't granted. Giving the same reward again happens only through **Grant again** (D5).
- **Reimport keeps it all:** grants and overrides live in state, which import keeps. A definition row that disappears on reimport keeps its history, and shows as "No longer in the quest" if it was granted.
- `grants` is capped at the newest 200 entries. This is a storage guard, not a rule.

### 3.7 Coins, XP, Renown (D10)

| Reward | Now | Later (separate decision) |
|---|---|---|
| Items | **This design** | — |
| Coins | Text in `outcomes.description`; the GM uses Utilities' Award Gold | A button that opens Award Gold pre-filled with the characters, if Robb asks |
| Character XP | Text | Nothing proposed (no module awards it) |
| Profession XP | Text | Nothing proposed |
| Renown standing | Text | Needs a Renown API first; nothing proposed |

No amounts are stored, authored or suggested by this design. The Journey's existing `coins` field stays for a later coin build.

---

## 4. Loot from NPCs and creatures

**Now (D1):** dragging from an NPC or monster sheet into a reward **copies** the item, and the NPC keeps it. Quest Log and Renown store a holding copy (§2.4).

**Future** (listed only, not designed):
- **Loot an NPC:** a GM-only Loot window listing a defeated NPC's or token's items, given to chosen characters with the same all-or-nothing grant and record. Moving rather than copying would be a new decision.
- **Locations loot that grants:** the `loot` entries could call the same grant and set `taken`.
- **Loot to the party stash:** needs `api.stash.receive` (§3.4).
- **Roll-table loot.**

---

## 5. Other modules

### 5.1 Drop zones

| Module | Change |
|---|---|
| **Renown** | Adopt the standard (R1). The reward zone takes **Items only** (D13); journals still go to info entries. Store `item_id` + `img`; holding copy for embedded drops; a missing source is reported (the claim no longer sits silently `approved`); `grantItem` uses `grantBundle` (containers carry contents). Claim flow unchanged. |
| **Utilities** stash | Adopt the parser and `bundleOf` (U1). Compendium containers bring their contents. Movement rules unchanged. The shop editor (shopping brief 02) uses the helper with `{folders: true}`. |
| **Character Hub** companions | Adopt the parser and the missing-item message (H1). Behaviour unchanged (copy onto the character). |
| **Locations** | Adopt the parser and the "missing" message instead of silence (L1). Loot stays a link. |
| **Skill Trees** board | `readDrop` instead of the raw `JSON.parse` (T1). Perk-node rules unchanged. |
| **Cinders** sockets | Fits the standard: a socket drop is an Item, copied to the bearer or already on it. Optional later: `readDrop` for its raw `JSON.parse`, plus `grantBundle`. No brief now. |
| **Profession Ledger** | **No drop zone** (D11). |
| **Headquarters** | None: HQ stores no Foundry Items. |
| **Manager** | Drag source only; already compatible. |

### 5.2 Character Hub: rewards appear in the Journey

There is **no separate "Rewards received" panel.** The Journey tab is where a character sees what they got. H1 extends the existing hook:
- `recordReward(actor, {questId, questName, coins, text, items, grantId})`. The new fields are optional:
  - `items: [{name, img?, quantity, itemId?}]`, max 50, names trimmed;
  - `grantId: string`.
- **Entry id:** `reward-<questId>` when there is no `grantId` (today's behaviour, unchanged). With a `grantId`, it is `reward-<questId>-<grantId>`, so a later grant or a Grant again adds its own entry, and re-firing the same grant still adds nothing.
- **Text:** `Reward for "<quest>": 2 × [TEST] Healing Draught, [TEST] Rusted Blade` (coins appended when given). `data` keeps `{questId, grantId, coins, items}`. The list can show item images.
- Still GM only, and still refused for players in the API. Players read it only on their own character, as today.
- Quest Log calls it feature-detected. A Hub older than H1 ignores `items`/`grantId` and writes its usual entry: harmless.

---

## 6. Permissions and safety

### 6.1 Enforced in the API and data layer
- Quest Log reward edits and grants run inside `assertGM` functions (`updateState`, `store.mjs:87`). The new API (`api.rewards.*`) answers non-GMs with "GM only.", whatever the UI shows.
- The `dropActorSheetData` grant path checks `game.user.isGM` before anything else.
- Renown keeps its socket model: players request, the GM grants (`incoming`, `module.mjs:239`).
- Journey `recordReward` is GM only (already true).

### 6.2 What players never see
- `gm` rows, and `on_complete` rows before completion, are removed in `publicView`. The player journal never holds them.
- Holding copies: ownership `NONE` for players.
- Player payloads carry no uuids or ids of rewards. A granted item is a normal item on their sheet.

### 6.3 Compendium items
- Grants copy straight from the compendium document (`fromUuid` → `toObject`). **Nothing is imported first.**
- This also works for packs the player can't see, because the grant runs on the GM client.
- Containers bring their contents from the pack (`bundleOf`).

### 6.4 Stacks and containers
- **Containers carry their contents** on every grant, nested ones too, through `grantBundle`. This is the Utilities 0.13.1 lesson. The root item arrives loose.
- **Quantity:** the root copy's `system.quantity` = the row quantity.
- **No stacking in v1 (D7):** each grant is a new item.

### 6.5 Never delete, never duplicate
- **Rewards never delete their source.** The only mover in the suite stays the Utilities stash, with its own all-or-nothing rule.
- **Removing a reward row** asks first (`confirmDialog`, danger).
  - Its holding copy is deleted only when no grant line points at it; otherwise the copy is kept.
  - A holding copy is never deleted by import.
- **No duplicates on retry:** reward tags, grant records, the per-quest lock, and Renown's `claimId`.

---

## 7. Migration

No breaking change; nothing is rewritten on import.

| Data | Today | Change |
|---|---|---|
| Quest state | `rewardRecorded` | Kept as is. New optional `rewards` block. A quest without it behaves exactly as today. No write is needed. |
| Quest definition | `outcomes.description` | Kept. New optional `outcomes.item_rewards[]`. Validation already allows extra keys in `outcomes` (`core.mjs:30`), so older Quest Log versions ignore it. |
| Quest player journal | `rewardRecorded` | + optional `rewards` list. Older readers ignore it. |
| Renown rewards | `{kind:'uuid', uuid}` | + optional `item_id`, `img` (allow-list `source-allowlist.mjs:14`, export and import). The uuid stays and still works. |
| Journey entries | `reward-<questId>` | Unchanged. New entries may have a `grantId` suffix and `data.items`. |

**Permanent-id backfill (Renown):**
- A labelled card in Renown GM Setup: **Fill in permanent item ids** (a real migration, not a dev tool).
  - **Dry run first:** it lists what would change, then applies after `confirmDialog`.
  - It is re-runnable.
- For each `kind:'uuid'` reward without `item_id`: resolve the uuid. If the Item has `flags.ashen-gate-manager.source.sourceId`, write it.
- It never overwrites an existing `item_id`, never changes the uuid, and never touches claims. Anything it can't resolve is listed as "No permanent id" and left alone.
- Lazy too: saving a reward fills its own `item_id` the same way.
- Quest Log needs no backfill: refs get their id when they are dropped.

---

## 8. Import and content (for ChatGPT)

### 8.1 Quest item rewards in a quest file

```json
"outcomes": {
  "description": "[TEST] Coin reward is GM-handled.",
  "item_rewards": [
    {"item_id": "ITEM-TEST-HEALING-DRAUGHT", "quantity": 2, "recipient": "each"},
    {"item_id": "ITEM-TEST-RUSTED-BLADE", "visibility": "gm", "note": "[TEST] Only if the beast was slain."}
  ]
}
```

| Field | Required | Rule |
|---|---|---|
| `item_id` | yes | The canonical id of an Item record (`ITEM-*`, including `ITEM-MOUNT-`/`ITEM-PET-`). Never a uuid. Unique within the quest. |
| `quantity` | no | Integer ≥ 1; default 1. No upper limit is invented. |
| `visibility` | no | `on_complete` (default) \| `shown` \| `gm`. |
| `recipient` | no | `chosen` (default) \| `each` \| `split`. Ignored on individual quests. |
| `note` | no | GM-only text shown in the grant dialog; max 300 characters. |

**Not allowed:** `uuid`, any live state (granted flags, recipients, Actor ids), coin/XP/Renown amounts (those stay text, §3.7), and unknown keys.

### 8.2 Validation

- **Quest Log** `validSource` / `planQuestImport` (`core.mjs:12-32, 73`):
  - shape checks for the table above;
  - unknown keys → error;
  - duplicate `item_id` → error;
  - a list of at most 50 entries (a storage guard).
- **`scripts/validate-content.mjs`** already runs `planQuestImport(data).errors` (:220), so it picks those checks up. It also adds a **note** (not a failure) when an `item_id` isn't defined in the same file or bundle, like the AGREF note (:108).
- **Manager delegation** is unchanged: quest files go through `specialist-handoff.js` → `previewQuestImport` / `importQuests`. Quest Log's preview warns about item ids that have **no world binding yet** ("Import the item first"), and still imports.
- **Tests:** a valid fixture plus `*.invalid.json` cases (uuid present, quantity 0, unknown visibility, duplicate id, unknown key).

### 8.3 Synthetic example (complete record)

This passes today's `node scripts/validate-content.mjs` (checked); today's Quest Log ignores `item_rewards`. PR Q3 makes §8.2 real.

```json
{
  "schema_version": "ag-quest-source/0.1",
  "records": [{
    "id": "QUEST-TEST-BEAST-OF-THE-FEN",
    "entity_type": "Objective",
    "objective_kind": "quest",
    "status": "draft",
    "version": "0.1.0",
    "visibility": "player",
    "provenance": {"sources": ["[TEST] synthetic example"]},
    "refs": [],
    "name": "[TEST] Beast of the Fen",
    "objectives": [{"key": "slay", "goal": "[TEST] Deal with the beast."}],
    "source": {},
    "locations": [],
    "parameters": {},
    "outcomes": {
      "description": "[TEST] Coin reward is GM-handled.",
      "item_rewards": [
        {"item_id": "ITEM-TEST-HEALING-DRAUGHT", "quantity": 2, "recipient": "each"},
        {"item_id": "ITEM-TEST-RUSTED-BLADE", "visibility": "gm", "note": "[TEST] If slain."}
      ]
    }
  }]
}
```

### 8.4 Gap-table updates (for the private repo)

There is no gap table in this public repo. These rows are for the one Studio keeps.

| Gap | Status |
|---|---|
| Quest item rewards | Format final (`outcomes.item_rewards[]`); usable once Quest Log Q3 ships. Until then, write them as text in `outcomes.description` |
| Quest coin / XP / Renown rewards | Text only, GM-handled (D10) |
| Faction/deity reward by canonical id | `item_id` next to `uuid`; usable once Renown R1 ships |
| Loot from NPCs | GM drag-and-drop only; no content format |
| Location loot that grants | Future; links only |

---

## 9. Build plan

Nine PRs, briefs in [`docs/rewards-briefs/`](rewards-briefs/README.md).
- **S1 goes first.** It is the only PR that creates the shared file and touches `scripts/check.mjs`.
- After S1 merges, every other PR is **single-module**. They can run in parallel, except that Quest Log's three PRs (Q1 → Q2 → Q3) run in order.

| # | Brief | Module | Bump | Depends on |
|---|---|---|---|---|
| S1 | `01-shared-item-drop.md` | Quest Log carries the first copy + `scripts/check.mjs` | patch | — |
| Q1 | `02-quest-rewards-list.md` | Quest Log | minor | S1 |
| Q2 | `03-quest-grant-on-complete.md` | Quest Log | minor | Q1 (and works with or without H1) |
| Q3 | `04-quest-reward-import.md` | Quest Log (+ validator test fixtures) | minor | Q1 |
| R1 | `05-renown-rewards.md` | Renown | minor | S1 |
| U1 | `06-utilities-drops.md` | Utilities | patch | S1 |
| H1 | `07-hub-journey-items.md` | Character Hub | minor | S1 |
| L1 | `08-locations-drops.md` | Locations | patch | S1 |
| T1 | `09-skill-trees-drop.md` | Skill Trees | patch | S1 |

---

## 10. Decisions (Robb, 2026-10-21)

| # | Question | Answer |
|---|---|---|
| D1 | Dragging an item off an NPC into a reward: copy or move? | **Copy.** NPCs stay as they are. |
| D2 | GM-only holding copy for embedded drops? | **Yes.** |
| D3 | Default visibility of a quest item reward | **`on_complete`** (shown once the quest is complete) |
| D4 | Default recipient on a party quest | **One chosen character**, picked in the completion dialog |
| D5 | "Grant again" | **Yes**, GM only, behind a confirmation, kept minimal |
| D6 | Dropping a whole folder on a reward zone | **Refuse in v1** |
| D7 | Stack onto a matching item | **No**; always a new item |
| D8 | Drag-out onto a sheet counts as a grant | **Yes**, recorded, never twice |
| D9 | Chat card on grant | **Whisper** to the recipients' owners and the GM |
| D10 | Coins on quests | **Text for now**; no coin transfer |
| D11 | Ledger drop zone | **No** |
| D12 | Hub "Rewards received" panel | **Replaced** by the Journey hook (§5.2) |
| D13 | Renown reward zones | **Items only** |
| (11) | Rewards carry the permanent item id next to the uuid | **Yes** (perks architecture, decision 11) |
