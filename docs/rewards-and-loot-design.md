# Rewards and loot distribution — shared design (DRAFT)

Status: **Draft for Robb's review. Not built.** Docs only: nothing here changes code, versions or saved data. Section 10 lists the open decisions. Each one needs Robb's answer before it is built.

Backlog item: **F13 Rewards and loot distribution.**
Target: Foundry V14 on The Forge, dnd5e 6.0.6 (2024 rules). Examples use synthetic `[TEST]` data. **No mechanics, amounts or numbers in this doc are rules.**

Module versions read: Quest Log 0.8.0, Renown (factions) 0.11.1, Utilities 0.13.1, Character Hub 0.18.0, Skill Trees 0.17.0, Profession Ledger 0.22.0, Locations 1.15.1, Manager 0.39.0, Headquarters 0.10.0, Cinders 0.1.0.

Builds on [perks-and-modifiers-architecture.md](perks-and-modifiers-architecture.md) (branch `design/perks-architecture`). Its approved **decision 11** applies throughout:
- A reward carries the **permanent item id** next to the Foundry uuid.
- The id is filled in automatically from the Item's `flags.ashen-gate-manager.source.sourceId` when that flag is present.
- When it is absent, the reward shows a note.

That doc also says Quest Log stays GM-granted. This doc keeps that: every grant is started and confirmed by the GM. "Automatic" here only means the GM no longer copies items by hand.

---

## 0. Goal in one paragraph

Adding and moving items works the same way in every module. You drag an item from a character sheet, an NPC or monster sheet, a compendium, the Items sidebar or any Ashen Gate list, and drop it on anything that accepts items.

Robb's example:
1. Drag a sword off a beast NPC into a quest's rewards.
2. When the GM marks the quest Completed, a confirmation lists the rewards and who gets them.
3. The GM clicks Grant, and the same sword lands on the chosen character.
4. Instead, the GM can drag the sword out of the quest onto any sheet. That counts as granted too.

---

## 1. Inventory: every drop zone and reward mechanism today

Line numbers point at whole (often one-line) functions.

### 1.1 Drop zones that accept Foundry documents

| Module | Zone | File | Accepts | Parsing | Stores | Missing doc |
|---|---|---|---|---|---|---|
| Utilities | Party Inventory tab (`.agu-main`) | `modules/ashen-gate-utilities/scripts/main.mjs:896-903` | `type:'Item'` + `uuid` | `dragData` :812 (`TextEditor.getDragEventData`, JSON fallback) | Moves the Item into the stash Actor | Warns |
| Utilities | `api.embed.mount` (Hub's Inventory tab) | `main.mjs:931-968` | same | same | same | same |
| Utilities | Native actor-sheet drop (`dropActorSheetData`) | `onSheetDrop` `main.mjs:819-825`, hook :1040 | Item | same | Stash → sheet: withdraw; sheet → stash: deposit | — |
| Renown | `[data-reward-drop]` (group / individual / milestone) | `modules/ashen-gate-factions/scripts/module.mjs:377-378`, `templates/dashboard.hbs:174,243,244` | **Any document type** (not checked) | `getDragEventData`, or builds `type.id` | Reward `{kind:'uuid', uuid, name, teaser}`; **no img, no quantity, no permanent id** | Throws "Document not found." |
| Renown | `[data-entry-drop]` (info entries) | `module.mjs:377-378`, `dashboard.hbs:178,239` | any | same | Info link `{uuid, link_mode:'document'}` | same |
| Character Hub | Companion slots `[data-drop-companion]` | `_onCompanionDrop` `modules/ashen-gate-character-hub/scripts/sheet.mjs:370-383`, `companions.mjs:185,250,281` | Item (mount/pet slots also accept Actor) | `droppedItem` `sheet.mjs:167-174` (`getDragEventData` + `fromDropData`) | Copies the Item onto the character; stores the embedded id | `fromDropData` returns null |
| Character Hub | Quick bar `[data-hotbar-slot]` | `_onHotbarDrop` `sheet.mjs:361`, `scripts/hotbar.mjs` | Item already on this Actor, or a world Macro | same | `{type:'Item', id}` reference only | Refused |
| Skill Trees | Tree board (GM edit mode) | `_dropped` `modules/ashen-gate-skill-trees/scripts/main.js:1187-1201`, `_addPerkNode` :879 | `feat` Item whose source id is `PERK-*`/`POWER-*` and is the canonical world doc | **Raw `JSON.parse`** of `text/plain` | `perkId` only (uuid not kept) | Refused |
| Locations | `[data-drop]` sections: resources, **loot**, details, factions, notes | `onDrop` `modules/ashen-gate-locations/scripts/app.mjs:895-926` | Item (resources, loot); any doc for links | `dragData` `app.mjs:79-82` | Loot `{label, img, uuid, docType:'Item', status: available\|discovered\|taken}`. Code comment: *"A link only. Nothing is created, copied or given to any Actor."* | **Silently ignored** |

Drop zones that take only Ashen Gate's own payloads (not Foundry documents):
- Renown faction folders (`text/ashen-gate-faction`, `module.mjs:375-377`).
- Locations folders, reorder handles and canvas placement (`app.mjs:785-815`, `main.mjs:178`).
- Headquarters board (`{kind, key}`, raw `JSON.parse`, `modules/ashen-gate-headquarters/js/main.mjs:331-333, 395-416`).

These are out of scope, because they never carry Items.

**No drop zones at all:**
- Quest Log
- Profession Ledger
- Cinders
- Manager (Manager is a drag source only)

### 1.2 Drag sources

| Module | Source | Payload |
|---|---|---|
| Utilities | Stash rows `[data-stash-item]` (`main.mjs:840`, dragstart :896/:965) | `{type:'Item', uuid}` |
| Character Hub | Item cards `[data-drag-uuid]` (`cards.mjs:111`, `onItemDragStart` `sheet.mjs:176-181`) | `{type:'Item', uuid}` |
| Skill Trees | Perk list `.agst-feature` (`main.js:703`) | `{type:'Item', uuid}` |
| Manager | Browse rows (`main.js:2077-2081`, `dragDataOf` `browse.js:339-344`) | `doc.toDragData()`, else `{type, uuid}`. Includes compendium index entries. |
| Locations | Location rows (`app.mjs:785-787`) | `{type:'AshenGateLocation', id}` (not an Item) |
| Foundry / dnd5e | Actor sheets (PC and NPC), Items sidebar, compendiums | `{type:'Item', uuid}` (sidebar folders: `{type:'Folder', uuid}`) |

### 1.3 Functions that put Items on Actors

| Module | Function | Copy / move | Permissions | Containers | Quantity / stacking | Retry safety |
|---|---|---|---|---|---|---|
| Utilities | `executeDeposit` `main.mjs:710-729`, `moveItem` :694, `moveBundle` `core.mjs:300-312` | **Moves** an actor-owned Item (all-or-nothing: create, verify, then delete). **Copies** a world or compendium Item (GM only). | Socket to the active GM; owner or GM | **Yes** (0.13.1): contents travel. *Gap:* compendium containers look up contents in `game.items`, so they arrive empty. | No merge | `takingItems` lock; vote |
| Renown | `grantItem` `factions/scripts/module.mjs:269` (from GM `resolveRequest` :474-488) | Copy | Player claim over socket; GM approves | No | No | Skips if the Actor already has an Item flagged with this `claimId`. *Gap:* if the source is missing, the claim silently stays `approved`. |
| Character Hub | `embedDropped` `companions.mjs:158-165` | Copy (even from another Actor) | GM or owner, plus Hub part toggle | No | No | None |
| Skill Trees | `givePerk` `skill-trees/scripts/main.js:162-173` | Copy of the canonical world perk | GM, under a per-Actor lock; players via socket | n/a | n/a | Reuses the tagged copy |
| Ledger | `executeCraft` `profession-ledger/scripts/crafting.mjs:129-180`; `stackMaterial` `gathering.mjs:105-122`; `assignProfessions` `main.js:451-473` | Copy of the world `ITEM-*` / `MAT-*` | GM (socket); per-Actor locks | No | **Stacks by `sourceId`** | Rollback on failure |
| Locations | none (loot is a link) | — | — | — | — | — |
| Quest Log | none | — | — | — | — | — |

### 1.4 Reward mechanisms today

**Quest Log**
- Text in `source.outcomes.description`, labelled "Suggested rewards / outcomes (informational; GM grants separately)" (`modules/ashen-gate-quest-manager/scripts/main.mjs:61`, written :81).
- A tick box, `state.rewardRecorded`: "Reward handled by GM (no automatic grants)" (`main.mjs:113`, saved :198). It is copied into the player view (`core.mjs:55`).
- No item, gold, XP or Renown fields.

**Renown**
- Faction and deity reward entries `{id, key, audience, milestone_id, name, teaser, description, kind: custom|uuid, uuid?, tags, behavior, usage_limit}` (`factions/scripts/source-allowlist.mjs:14,37`, `core.mjs:69,121`).
- Claim state is kept in the journal flags `groupClaims` and `individual`.
- `kind:'uuid'` rewards are granted by `grantItem`.
- There is no item-id field and no migration of reward uuids (`migrate()` `module.mjs:182-192` does other things).

**Utilities**
- `api.awardGold({amount, mode: each|split, actorIds, reason, public})`, GM only, with Undo (`README.md:16,26`).
- This is the only existing currency grant.

**Ledger**
- `awardProfessionXP`: profession XP only, GM awarded, never automatic.
- No module awards character (dnd5e) XP.

**Locations**
- `loot` entries with status available/discovered/taken.
- Display and link only.

### 1.5 What differs (the problem F13 fixes)

1. **Four drop parsers:**
   - `getDragEventData` (Utilities, Renown, Locations)
   - plus `fromDropData` (Hub)
   - raw `JSON.parse` (Skill Trees, HQ)
2. **Type checks differ:**
   - Renown accepts any document as an "item" reward.
   - Utilities accepts only Items.
3. **A missing document is handled three ways:** silent (Locations), throw (Renown), warning (Utilities).
4. **Only Utilities handles containers.** Even there, compendium containers lose their contents.
5. **A dropped reward keeps only a world-local uuid.** An item dragged off an **unlinked token** NPC (uuid `Scene.…Token.…Actor.…Item.…`) disappears when the token is deleted. That is exactly Robb's "sword off a beast" case.
6. **Retry safety exists in some flows only:**
   - Renown has a claim id.
   - Skill Trees has a grant tag.
   - Hub has nothing.

---

## 2. Shared item-drop standard (`ag-item-drop/1`)

### 2.1 What a dropped item becomes: the **item reference**

Every module normalises an Item drop into the same small object before it stores or uses it:

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
  "contents": 0,
  "capturedAt": 0
}
```

| Field | Meaning |
|---|---|
| `uuid` | Where the item was dropped from. A world-local **hint**, not identity. |
| `itemId` | The permanent id from `flags.ashen-gate-manager.source.sourceId`. If that is absent, the Ledger's `sourceId`, then the legacy `flags.ashen-gate.sourceId`, in the same order as Locations' `materialIdOf` (`locations/scripts/model.mjs:630`). `null` when none exists, and the UI then shows "No permanent id: this reward is tied to this world" (decision 11). |
| `name`, `img`, `type` | A **snapshot** taken at drop time, so a row still reads properly if the item later vanishes. |
| `quantity` | Integer ≥ 1. Defaults to the dropped item's `system.quantity`, else 1. The receiving UI may change it. |
| `sourceKind` | `world` (Items sidebar), `compendium`, `embedded` (on an Actor: PC, NPC, token actor or the stash) or `holding` (see §2.4). |
| `packId`, `parentUuid` | Set for compendium and embedded items. |
| `contents` | How many items are inside it (dnd5e container), 0 otherwise. Display only. |

### 2.2 Validation when the item is dropped

| Drop | Rule |
|---|---|
| `type:'Item'` with a uuid | Resolve it (`fromDropData` / `fromUuid`) and check `documentName === 'Item'`. Anything else: "Drop an item." **Nothing is stored.** |
| A world Item | Accepted. |
| A compendium Item | Accepted. Read through the pack; nothing is imported at drop time (§6.3). |
| An embedded Item (PC, NPC, token) | Accepted. **The source is never changed.** The zone decides whether it needs a holding copy (§2.4). |
| `type:'Folder'` | Rejected in v1: "Drop items one at a time." See open decision D6. |
| `type:'Actor'`, Journal, Macro, etc. | Rejected, unless the zone documents another use (for example, Hub mount slots take Actors and Renown info entries take Journals). |
| Doc not found or not readable by the user | "That item no longer exists or you can't see it." Never silent, never thrown to the console only. |
| The drop came from this same zone | Treated as a reorder; nothing is created (the stash rule today). |

### 2.3 Items that no longer exist later

Lookups happen when the item is used (granted, opened or dragged out), in this order:
1. **The permanent id** through the world binding: `lookupWorldDefinition(game, itemId)`, the same reader Skill Trees, Ledger and Cinders ship (`scripts/definition-lookup.mjs`). The id wins over the uuid, so a reimport into a fresh world still works.
2. **The uuid**, which can be a world, compendium, embedded or holding item.
3. **Not found.** The row keeps its snapshot name and image, gets a red "Missing" badge, can't be dragged, and is **unticked by default** at grant time with the reason. It is never silently skipped.

### 2.4 Holding copies (embedded drops that must outlive their Actor)

A reward that points at `Actor.<npc>.Item.<x>` breaks when the NPC or token is deleted. Two zones store rewards for later: Quest Log and Renown. For those, an embedded drop:
- creates a **holding copy**: a world Item in the GM-only folder `Ashen Gate/Rewards/<module>`, ownership `NONE`, flagged `flags.<module>.holding = {ref, from: parentUuid}`;
- keeps container contents through `system.container` remapping, like `moveBundle`;
- stores the holding copy's uuid. `sourceKind` becomes `holding`, and `itemId` is copied from the original's flags.

The NPC keeps its sword (copy, never move; see decision D1). World and compendium drops don't need a holding copy.

Zones that act at once don't need holding copies either: the stash deposit, Hub slots, Cinder sockets.

### 2.5 The helper: one shared file, byte-identical

**Recommendation: a shared snippet, not a re-implementation in each module.** There is a precedent: `scripts/ag-launchers.mjs` is copied into every player-facing module, and `scripts/check.mjs:97-104` fails when the copies drift. `ag-item-drop.mjs` would be added to that list.

- **Pure and Foundry-light.** It takes `game` and `foundry` as arguments and imports nothing from another module.
- Each module that accepts item drops ships its own copy. A module without item drops doesn't ship it.
- It holds **no state and no settings**, and it never writes documents. Writing stays inside each module's own functions, under that module's own permission checks.

Contract `ag-item-drop/1` (shape only):

```js
// Parse. Never throws; returns null for non-JSON.
readDrop(event)                                   // -> raw drag data
// Resolve + validate. Rejects non-Items, folders and missing docs with a player-safe reason.
resolveItemDrop(raw, {accept})                    // -> {ok, item, ref, reason}
// Build the ag-item-ref/1 snapshot (itemId lookup order from §2.1).
itemRef(item, {quantity})                         // -> ref
// Resolve a stored ref at use time: id first, then uuid (§2.3).
resolveRef(ref)                                   // -> {status:'ok'|'missing'|'not_readable', item}
// Build create-data for one recipient: toObject() of the item and every nested content,
// fresh _ids, system.container remapped, root container cleared, quantity set,
// strips _id/folder/sort/ownership/_stats, adds the caller's flag tag.
grantBundle(item, {quantity, tag})                // -> {data:[...], contents}
// Payload for dragging a ref OUT of a module list (onto a sheet or another zone).
dragPayload(ref, extra)                           // -> {type:'Item', uuid, agItemRef: ref, ...extra}
```

Notes:
- `grantBundle` generalises Utilities' `moveBundle` (`utilities/scripts/core.mjs:300-312`). Utilities can switch to it later without changing behaviour.
- For **compendium containers**, the contents live in the pack. `grantBundle` must read them from the container's own pack, not `game.items`. That fixes the current Utilities gap. dnd5e 6.0.6 has container helpers (`system.allContainedItems`, `Item5e.createWithContents`), but their exact behaviour **needs a Forge check** before the helper relies on them. Otherwise it walks `system.container` the way `moveBundle` does.
- `dragPayload` keeps the standard Foundry `{type:'Item', uuid}`, so any sheet accepts it, and adds an `agItemRef` field that other Ashen Gate zones can read. Foundry ignores unknown keys.

**Feature detection stays the rule between modules.** A module never imports another module's copy. When one module needs another's behaviour (for example Quest Log granting into the stash), it calls that module's public API (`game.modules.get(id)?.api`), and skips the option if the API is absent.

### 2.6 Writing on drop: who does it

- **Reading and validating** happens on the client that dropped.
- **Writing** (create a holding copy, grant, store a reward) goes through the owning module's existing GM path:
  - Quest Log: GM client only; it has no socket and needs none, because all reward editing is GM-only.
  - Renown, Utilities, Hub: their existing sockets and checks.

---

## 3. Quest item rewards (Quest Log)

### 3.1 Where rewards come from

1. **Imported** rewards: in the quest definition, `outcomes.item_rewards[]` (§8). They are keyed by `item_id`.
2. **GM-added** rewards: dropped on the quest in the GM view. They are stored in quest **state**, not in the definition, so **reimport never removes them**. Reimport replaces the definition and keeps the state (`importQuests` update mode).

The GM sees one merged list.

### 3.2 The reward list (GM view, quest detail)

The section is **Item Rewards**, under the existing outcomes text.
- **Drop zone:** "Drop items here (sheet, NPC, compendium, Items sidebar)".
- **Row:** image, name, ×quantity (editable), visibility, recipient rule, Missing / No permanent id badges, and a remove button.
- Removing an imported row hides it (a state override). It doesn't edit the definition, so a reimport doesn't bring it back.
- **Drag-out:** each row is draggable with `dragPayload`. Dropping it on a character sheet is caught by Quest Log's `dropActorSheetData` hook, like Utilities' `onSheetDrop`:
  1. The hook cancels Foundry's default copy.
  2. It runs the **same grant function** for that one row and recipient.
  3. The grant is recorded and can't double up.
  4. Non-GMs never get draggable rows.

Dropped anywhere that isn't a sheet (another module's zone), the payload behaves as a normal Item drag of the source item.

### 3.3 Visibility to players

Per reward, `visibility`:
- `gm`: never shown to players.
- `on_complete`: shown once the quest is Completed.
- `shown`: name and image teased while the quest is visible.

**Recommended default: `on_complete`** (decision D3).

`publicView` (`quest-manager/scripts/core.mjs:47-56`) gains a `rewards` list built only from rows the player may see. It carries name, img and quantity, and **never the uuid**, item id or holding info. GM-only rows are filtered out in the projection, not hidden by CSS.

### 3.4 Who receives (recipient rule)

Set per reward row, and adjustable in the completion dialog:

| Rule | Meaning |
|---|---|
| `chosen` | One character, picked by the GM in the dialog. **Recommended default for party quests.** |
| `each` | Every party recipient gets the full quantity. |
| `split` | Quantity is shared out in whole units. The dialog shows who gets what; the GM resolves any remainder by picking (no automatic rule). |
| `stash` | Goes to the Utilities party stash through `api.stash`. Shown only when Utilities is present and the stash exists (feature-detected). |

- **Individual quests:** the recipient is the quest's `actorId`, and the rule is fixed.
- **Party recipients:** the list is the characters the quest is projected to (the same Actors used for `projectionOwnership`), and the GM can untick anyone.

### 3.5 Completion flow

1. The GM sets status **Completed** and saves. If the quest has at least one grantable, ungranted reward row, Quest Log opens **Grant quest rewards** (Foundry dialog). Otherwise it saves as today.
2. The dialog lists every row:
   - tick box (default ticked unless Missing);
   - image, name and quantity;
   - recipient picker per the rule;
   - a "will receive" summary per character.
   Buttons: **Cancel** (bottom-left; status is still saved, rewards stay pending), **Grant later**, **Grant** (bottom-right).
3. On **Grant**, on the GM client:
   1. Re-resolve every ticked row (§2.3). A row that has gone missing since the dialog opened stops the grant **for that recipient** and is reported.
   2. Group the rows by recipient. For each recipient, **all or nothing**: build every `grantBundle`, create them in one `createEmbeddedDocuments` call, verify that every item arrived, and if any part fails, delete the copies just made. Nothing is ever deleted from a source.
   3. Each created item is tagged `flags.ashen-gate-quest-manager.grant = {questId, rewardKey, grantId}`.
   4. Write the grant record into quest state (§3.6), then republish the player view.
4. Results are shown per recipient (granted / failed + reason), along with an optional chat card (decision D9).

`rewardRecorded` becomes derived:
- **true** when every non-removed row is granted, or when the GM ticks "Handled outside Quest Log". That manual tick keeps today's meaning for quests with text-only rewards.
- The player view keeps the same boolean, so older readers still work.

### 3.6 State and idempotency

The new optional quest-state fields are all additive. `validState` (`core.mjs:38-46`) ignores unknown keys today; the PR adds validation for them.

```json
"rewards": {
  "schema": "ag-quest-rewards/1",
  "added": [
    {"key": "rw-k3j9x", "ref": {"schema": "ag-item-ref/1", "itemId": "ITEM-TEST-RUSTED-BLADE", "uuid": "Item.h0ld1ng", "sourceKind": "holding", "name": "[TEST] Rusted Blade", "img": "…", "quantity": 1},
     "visibility": "on_complete", "recipient": "chosen"}
  ],
  "overrides": {"def:ITEM-TEST-HEALING-DRAUGHT": {"quantity": 2, "visibility": "shown", "removed": false}},
  "grants": {
    "g-7f2a": {"at": 0, "by": "userId", "lines": [
      {"rewardKey": "def:ITEM-TEST-HEALING-DRAUGHT", "actorId": "abc", "quantity": 2, "itemIds": ["…"], "status": "granted"},
      {"rewardKey": "rw-k3j9x", "actorId": "def", "quantity": 1, "itemIds": [], "status": "failed", "reason": "Missing"}]}
  },
  "handledManually": false
}
```

Reward keys:
- `def:<item_id>` for imported rows. Stable across reimports.
- `rw-<random>` for GM-added rows.

**A row counts as granted** to an Actor when a `grants` line says `granted` for that `rewardKey`, **or** the Actor holds an Item tagged with that `rewardKey`. The second check is the Renown `claimId` lesson.

So:
- **Completing twice never double-grants.** The dialog only offers rows not yet granted to that recipient. If nothing is left, it doesn't open.
- **A crash between creating items and writing the record** is safe. On the next attempt the tags are found, the record is repaired, and nothing is created again.
- **Re-opening and re-completing** a quest offers only what wasn't granted. Granting the same row again on purpose is a separate GM action, **Grant again**, behind a labelled confirmation (decision D5).
- **The grant lock:** one grant at a time per quest (an in-memory lock on the GM client), like Skill Trees' `withActorLock`.
- **Reimport:** grants and overrides live in state, which import keeps. A definition row that disappears on reimport keeps its grant history, and shows as "no longer in the quest" if it was granted.

### 3.7 Gold, XP, Renown

Item rewards are in scope now. For the rest:

| Reward | v1 | Later (each its own decision) |
|---|---|---|
| Items | **In scope** (this design) | — |
| Coins | Text in `outcomes.description`, GM-handled | Quest Log could open Utilities' **Award Gold** pre-filled with the ticked characters. The **GM types the amount**; Quest Log stores no coin number. Feature-detected `api.awardGold`. (D10) |
| Character XP (dnd5e) | Text, GM-handled | No module awards character XP today; nothing is proposed. |
| Profession XP | Text, GM-handled | Could open Ledger's Adjust XP, the same way. Not proposed until asked. |
| Renown standing | Text, GM-handled | Renown has no public "adjust standing" API. Renown would have to publish one first. Not proposed until asked. |

No amounts are stored, authored or suggested by this design.

---

## 4. Loot from NPCs and creatures

**Now**, by the standard: dragging from an NPC or monster sheet into a reward **copies** the item. The NPC keeps it. Quest Log and Renown store a holding copy (§2.4). Default: copy (decision D1).

**Future**, listed only and not designed:
- **Loot a corpse/NPC.** A GM-only "Loot" window for a defeated NPC or token that lists its carried items and gives them to chosen characters, moving or copying per D1, with the same all-or-nothing grant and record.
- **Locations loot that grants.** The Locations `loot` entries (`available|discovered|taken`) could call the same grant function, and set `taken` when granted.
- **Loot to stash.** A "send all to party stash" button through `api.stash`.
- **Roll tables.** Rewards from a Foundry RollTable result. Not designed.

---

## 5. Other modules

| Module | Drop zone? | What |
|---|---|---|
| **Renown** | Already has one | Adopt the standard (PR R1): Item-only for `kind:'uuid'`; store `item_id` + snapshot; holding copy for embedded drops; missing source reported (not silently left `approved`); `grantItem` uses `grantBundle` (container contents travel). The claim flow stays as is. |
| **Utilities** stash | Already has one | Adopt the standard (PR U1): use `resolveItemDrop` and the shared container walk, which fixes compendium containers arriving empty. Movement rules unchanged (moves from actors, copies from world/compendium). |
| **Character Hub** companions | Already has one | Adopt the standard parser and missing-item messages (PR H1). Companion behaviour is unchanged (copy onto the character). Optional: bring container contents. |
| **Character Hub** "Rewards received" | New (display) | A read-only list on the character: items the character got from Quest Log and Renown, with quest/faction name and date. It reads each module's **public** API (`questApi.rewards.receivedBy(actorId)`, and a matching Renown call), both player-safe and feature-detected. It never reads their journals. Hidden rows stay hidden, because the API filters them. (PR H2) |
| **Skill Trees** board | Already has one | Only swap the raw `JSON.parse` for `readDrop` (fixes drops from Foundry sources that don't send `text/plain` JSON the same way). Perk-node rules unchanged. Low priority. |
| **Profession Ledger** | **Not now** | Recipe outputs are imported `REC-*` → `result_item_id`, which is content, not a drop. A drop zone would only make sense if Ledger gets a GM recipe editor. Recommend no zone (D11). |
| **Headquarters** | **Not now** | HQ stores no Foundry Items (`inventory` is facility copies, `js/logic.mjs:36`). Any HQ storeroom would just be the Utilities stash. |
| **Cinders sockets** | Designed elsewhere | It fits the standard. A socket drop is `sourceKind:'embedded'` with `parentUuid` = the bearer. The socket design (perks doc §4.4) requires the item to already be on the bearer, so a drop from anywhere else is refused, or first granted to the bearer by the GM. Socket items get the same `itemId` lookup. |
| **Locations** loot | Already links | Use the standard parser and its "missing" message instead of failing silently. Granting from Locations is future (§4). |
| **Manager** | Drag source only | Its browse rows already send `toDragData()`, so they work with every zone. Nothing to change. |

---

## 6. Permissions and safety

### 6.1 Enforced in the API and data layer
- Quest Log reward edits and grants run inside `assertGM` functions (`updateState` already does, `store.mjs:171`). The new API functions refuse non-GMs with "GM only.", whatever the UI shows.
- Renown keeps its socket model: players request, the GM grants (`incoming`, `module.mjs:237`).
- The Hub "rewards received" API returns only rows for Actors the caller owns, and only rows that are visible to players.

### 6.2 What players never see
- `gm`-visibility rows and not-yet-revealed `on_complete` rows are removed in `publicView`. The player journal never contains them.
- Holding copies sit in a GM-only folder with ownership `NONE`.
- Player payloads never carry uuids or item ids of hidden rewards. A granted item is a normal item on the player's sheet.

### 6.3 Compendium items
- Granting copies straight from the compendium document (`fromUuid` → `toObject`). **Nothing is imported into the world first.**
- This also works for a pack the player can't see, because the grant runs on the GM client.
- Containers bring their pack contents (§2.5).

### 6.4 Stacks and containers
- **Containers carry their contents** on every grant: the Utilities 0.13.1 lesson, through `grantBundle`. Nested containers too. The root arrives loose (not inside another container).
- **Quantity:** each grant sets `system.quantity` on the root copy to the row's quantity.
- **Stacking onto an item the character already has** (as Ledger does by `sourceId`): **not in v1**. Each grant creates its own item, which keeps the "already granted?" check simple. (D7)

### 6.5 Never delete, never duplicate
- **Rewards never delete their source.** Copy from world, compendium, NPC or holding copy. The only module that moves is the Utilities stash, which keeps its own all-or-nothing rule.
- **Removing a reward row** deletes its holding copy only after a labelled confirmation, and only when no grant line points at it. Otherwise the copy is kept.
- **No duplicates on retry:** grant tags plus grant records (§3.6), Renown's `claimId`, and a per-quest grant lock.

---

## 7. Migration

No breaking change, and nothing is rewritten on import.

| Data | Today | Change |
|---|---|---|
| Quest state | `rewardRecorded` boolean | Kept. New optional `rewards` block (§3.6). An existing `rewardRecorded: true` maps to `handledManually: true` **when read** (no write needed). A quest with no `rewards` block behaves exactly as today. |
| Quest definition | `outcomes.description` text | Kept. New optional `outcomes.item_rewards[]`. Older Quest Log versions ignore it. Validation already allows extra keys in `outcomes` (`core.mjs:30`). |
| Quest player journal | `rewardRecorded` | Gains an optional `rewards` list. Older readers ignore it. |
| Renown rewards | `{kind:'uuid', uuid}` | New optional `item_id` and `img` (allow-list update in `source-allowlist.mjs`). The uuid stays and still works. |

**Permanent-id backfill (Renown, and any Quest row without one):**
- A GM-only **Developer Tools → Backfill reward ids** in each module. It has a **dry run first**, lists what would change, then applies. It is re-runnable.
- For each reward with a uuid and no `item_id`: resolve the uuid. If the item has `flags.ashen-gate-manager.source.sourceId`, write that id.
- It never overwrites an existing `item_id`, never changes the uuid, and never touches claims.
- Unresolvable or id-less rewards are listed as "No permanent id" and left alone.
- Also done lazily: a reward that is edited or re-saved fills its own `item_id` the same way.

---

## 8. Import and content (for ChatGPT)

### 8.1 Quest item rewards in a quest file

Quest records (`ag-quest-source/0.1` or `ag-source-records/0.1`) may add:

```json
"outcomes": {
  "description": "[TEST] The party is thanked; the GM hands out any coin.",
  "item_rewards": [
    {"item_id": "ITEM-TEST-HEALING-DRAUGHT", "quantity": 2, "visibility": "on_complete", "recipient": "each"},
    {"item_id": "ITEM-TEST-RUSTED-BLADE", "quantity": 1, "visibility": "gm", "note": "[TEST] Only if the beast was slain."}
  ]
}
```

| Field | Required | Rule |
|---|---|---|
| `item_id` | yes | A canonical id of an Item record (`ITEM-*`, including `ITEM-MOUNT-`/`ITEM-PET-`). Never a Foundry uuid. Unique within the quest. |
| `quantity` | no | Integer ≥ 1; default 1. No upper limit invented here. |
| `visibility` | no | `gm` \| `on_complete` \| `shown`; default per D3. |
| `recipient` | no | `chosen` \| `each` \| `split` \| `stash`; default per D4. Ignored for individual quests. |
| `note` | no | GM-only text shown in the dialog. |

**Not allowed:** `uuid`, live state (granted, recipients, actor ids), coin/XP/Renown amounts (those stay in `description` text, §3.7).

### 8.2 Validation

- **Quest Log** `planQuestImport` / `validSource` (`core.mjs:12-32, 73`):
  - shape checks for the table above;
  - unknown keys in an entry → error;
  - duplicate `item_id` → error.
- **`scripts/validate-content.mjs`** already runs `planQuestImport(data).errors` (line 209), so it picks those checks up automatically. It also adds a **note** (not a failure) when an `item_id` isn't defined in the same file or bundle. That's the same pattern as the AGREF note at line 97, because items are often imported from a different file.
- **Manager delegation** is unchanged: quest files keep going through `specialist-handoff.js` → `previewQuestImport` / `importQuests`. In its preview, Quest Log reports item rewards whose id has **no world binding yet** as warnings ("import the item first"). It still imports.
- **Tests:** a valid fixture plus `*.invalid.json` cases (uuid present, quantity 0, unknown visibility, duplicate id) under the existing `invalid/` convention.

### 8.3 Synthetic example (complete record)

This passes today's `node scripts/validate-content.mjs` (checked). Today's Quest Log ignores `item_rewards`; PR Q3 makes the checks in §8.2 real.

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

### 8.4 Gap-table updates

There is no gap table in this public repo (checked `docs/` and `scripts/`). The rows below are for the gap table in the private supplement repo, which Studio maintains.

| Gap | Status after this design |
|---|---|
| Quest item rewards | **Draft** format `outcomes.item_rewards[]`; until built, write them as text in `outcomes.description` |
| Quest coin / XP / Renown rewards | Text only, GM-handled (no field) |
| Faction/deity reward by canonical id | **Draft** `item_id` next to `uuid` (decision 11 approved; not built) |
| Loot from NPCs | GM drag-and-drop only; no content format |
| Location loot that grants | Future; links only |

---

## 9. Build plan (small PRs, one module each)

| # | PR | Module | Contents |
|---|---|---|---|
| 1 | **S1** | shared + check | Add `ag-item-drop.mjs` (contract §2.5) with unit tests to the first module that uses it (Quest Log). Add it to the identical-copies list in `scripts/check.mjs`. This doc becomes `docs/item-drop-standard.md`. |
| 2 | **Q1** | Quest Log (minor) | Item Rewards section: drop zone, holding copies, quantity, visibility, removal, player projection. **No grants yet.** State `rewards.added/overrides`. |
| 3 | **Q2** | Quest Log (minor) | Completion dialog, all-or-nothing grant per recipient, tags, grant records, idempotency, drag-out via `dropActorSheetData`, derived `rewardRecorded`, chat card (per D9), `api.rewards.receivedBy`. |
| 4 | **Q3** | Quest Log (minor) | Import `outcomes.item_rewards[]`, validation, preview warnings, fixtures. (The validator picks it up automatically.) |
| 5 | **R1** | Renown (minor) | Standard drop (Item-only for item rewards), `item_id` + `img`, holding copies, missing-source error, `grantBundle` for containers, backfill tool, `receivedBy` API. |
| 6 | **U1** | Utilities (patch) | Switch to the shared parser and container walk; fix compendium containers. |
| 7 | **H1** | Character Hub (minor) | Standard parser and messages on companion slots; "Rewards received" panel (feature-detected Quest Log and Renown). |
| 8 | **L1** | Locations (patch) | Standard parser and missing-item message on resources and loot. |
| 9 | **T1** | Skill Trees (patch) | `readDrop` on the board. Optional. |
| — | later | Quest Log / Utilities | Award Gold hand-off (D10); loot window (§4). Only if Robb asks. |

Each PR bumps its own module version, adds a CHANGELOG entry, and passes `node scripts/check.mjs <id>`. Tests prove logic only. Every PR lists what Robb clicks in Forge to check it.

---

## 10. Open decisions for Robb (ask one at a time)

| # | Question | Recommended default |
|---|---|---|
| D1 | Dragging an item off an NPC or monster into a reward: copy it (NPC keeps it) or move it (NPC loses it)? | **Copy** |
| D2 | For embedded drops, keep a GM-only holding copy in `Ashen Gate/Rewards` so the reward survives the NPC or token being deleted? | **Yes** |
| D3 | Default visibility of a quest item reward to players: hidden (`gm`), shown after completion (`on_complete`), or teased while active (`shown`)? | **`on_complete`** |
| D4 | Default recipient on a party quest: one chosen character, each character, split, or party stash? | **One chosen character**, picked in the dialog |
| D5 | Re-completing a quest offers only ungranted rewards; allow a deliberate "Grant again" behind a confirmation? | **Yes**, GM only |
| D6 | Dropping a whole Items folder onto a reward zone: reject, or add every item in it (with a confirm)? | **Reject in v1** |
| D7 | Should a granted item stack onto a matching item the character already has (by permanent id), like Ledger does? | **No in v1**; always a new item |
| D8 | Drag-out of a quest reward onto a sheet: counts as granting that row (recorded, never twice)? | **Yes** |
| D9 | Post a chat card when rewards are granted? Public, whisper to recipients, or none? | **Whisper to recipients and GM** |
| D10 | Coins on quests: stay text, or a button that opens Utilities' Award Gold pre-filled with the characters (GM types the amount)? | **Text for now**; button later if wanted |
| D11 | Profession Ledger: any drop zone (e.g. recipe outputs)? | **No** |
| D12 | Hub "Rewards received" panel: show it to players? | **Yes**, own characters only, visible rows only |
| D13 | Renown: keep accepting non-Item documents (journals) on the item-reward zone, or only Items there (journals still go to info entries)? | **Items only** on reward zones |

Not decided here: any amounts, which items are rewards in the campaign, or loot rules. Those are content for the private repo, written by GPT from the format once D1–D4 are settled.
