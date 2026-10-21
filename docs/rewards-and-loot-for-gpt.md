# Rewards and loot: brief for ChatGPT (DRAFT)

**Status: DRAFT. Not built.** Until Robb approves it and the Quest Log release ships it, write quest rewards **only as text** in `outcomes.description`. Anything marked **draft** below needs Robb's go-ahead first.

## 1. Context

Ashen Gate is a set of Foundry VTT modules for Robb's D&D campaign. Foundry V14 on The Forge, dnd5e 6.0.6, 2024 rules.

- **ChatGPT** writes content: JSON records in the published formats.
- **Claude** builds the modules in the public repo.
- **Robb** is the GM and decides rules, numbers and formats.

| Module | What it does with rewards |
|---|---|
| Quest Log (`ashen-gate-quest-manager`) | Today: reward text + a "handled" tick box. **Draft:** item rewards granted when the GM completes a quest. |
| Renown (`ashen-gate-factions`) | Faction and deity rewards; players claim, the GM approves, and an Item is copied to the character. |
| Utilities (`ashen-gate-utilities`) | Party stash; GM **Award Gold**. |
| Character Hub (`ashen-gate-character-hub`) | Character view. **Draft:** a "Rewards received" list. |
| General Manager (`ashen-gate-manager`) | Imports every content file and hands quest files to Quest Log. |

## 2. The idea (what Robb asked for)

- Any item can be dragged from anywhere onto anything in the suite that accepts items, and every module handles it the same way. "Anywhere" means a character sheet, an NPC or monster sheet, a compendium, the Items sidebar, or an Ashen Gate list.
- A reward remembers the item's **permanent id** (`ITEM-*`) next to its Foundry link. That way it still works after a reimport or in a new world.
- When the GM marks a quest **Completed**, a confirmation dialog lists the item rewards and who gets them. The GM can untick any reward, then clicks **Grant**.
  - Each character gets everything or nothing.
  - Nothing is ever granted twice.
- Players see a reward only when its visibility allows it.

Your part is the **content format** only (section 3). The GM does the dragging, granting and choosing recipients in Foundry.

## 3. Writing quest item rewards (**draft**)

Add `item_rewards` inside a quest record's `outcomes`:

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
| `item_id` | yes | The permanent id of an Item record (`ITEM-*`, `ITEM-MOUNT-*`, `ITEM-PET-*`). It must be defined in some import file. It is unique within the quest. |
| `quantity` | no | A whole number, 1 or more. Default 1. |
| `visibility` | no | `gm` (players never see it), `on_complete` (shown after completion), `shown` (teased while the quest is visible). The default is set by Robb. |
| `recipient` | no | `chosen` (GM picks one character), `each` (every character gets the full quantity), `split` (shared out), `stash` (party stash). The default is set by Robb. It is ignored on individual quests. |
| `note` | no | GM-only text shown in the grant dialog. |

The full record shape is unchanged (`ag-quest-source/0.1` or `ag-source-records/0.1`). See the synthetic example in `docs/rewards-and-loot-design.md` §8.3.

## 4. Don'ts

- **Don't** put Foundry uuids (`Item.abc…`, `Compendium.…`) in content. Use `item_id`.
- **Don't** write coin, XP or Renown amounts as fields. They stay **text** in `outcomes.description`, and the GM handles them. Don't invent amounts. Ask Robb.
- **Don't** write live state: who received what, granted flags, Actor ids, claims.
- **Don't** reference an item that has no `ITEM-*` record. Write the record first, or describe the reward as text.
- **Don't** use `item_rewards` until Robb says the draft is approved and Quest Log supports it. Until then, describe the item in `outcomes.description` and name its `ITEM-*` id there.
- **Don't** put campaign lore in the public repo. Public examples use `[TEST]` names.
- **Don't** mark anything `approved`. Only Robb does.

**Faction and deity rewards** keep their current format (`docs/renown-deity-schema.md`). A **draft** `item_id` field next to `uuid` is planned. Don't use it until it is built.

## 5. Where things live

| What | Where |
|---|---|
| Entry point for GPT (start here, section 2b) | `robbmcgaw/ashen-gate-supplement` → `campaign/GPT_HANDOFF.md` |
| Cross-system standards (this brief, once placed) | `robbmcgaw/ashen-gate-supplement` → `systems/architecture/` |
| Build reference, JSON Schemas, examples | `robbmcgaw/ashen-gate-supplement` → `systems/schemas/` |
| Full design (inventory, drop standard, completion flow, migration, build plan, open decisions) | `robbmcgaw/ashen-gate-foundry` → `docs/rewards-and-loot-design.md`: **draft**, branch `design/rewards-loot` |
| Perks, modifiers, sockets (decision 11: rewards carry the permanent item id) | `docs/perks-and-modifiers-architecture.md`: **draft**, branch `design/perks-architecture` |
| Item records, Active Effects and flags | `docs/item-effects-schema.md`: **built** |
| Mount and pet items | `docs/companion-items-schema.md`: **built** |
| Faction and deity rewards | `docs/renown-deity-schema.md`: **built** |
| Check a file before handing it over | `node scripts/validate-content.mjs <file>` in the public repo |

## 6. When in doubt

Ask Robb, don't guess. If a reward doesn't fit `item_rewards` (coin, XP, standing, a favour, a clue), write it as text in `outcomes.description`. Mark the quest `draft` and list the question for Robb.
