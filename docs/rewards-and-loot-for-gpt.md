# Rewards and loot: brief for ChatGPT (FINAL format, build in progress)

**Status:** Robb has approved the format, and the modules are being built.
- Write `outcomes.item_rewards` only once Robb says **Quest Log has shipped quest item rewards** (build brief Q3).
- Until then, write quest rewards as **text** in `outcomes.description` and name each item's `ITEM-*` id there.

## 1. Context

Ashen Gate is a set of Foundry VTT modules for Robb's D&D campaign. Foundry V14 on The Forge, dnd5e 6.0.6, 2024 rules.

- **ChatGPT** writes content: JSON records in the published formats.
- **Claude** builds the modules in the public repo.
- **Robb** is the GM and decides rules, numbers and formats.

| Module | What it does with rewards |
|---|---|
| Quest Log (`ashen-gate-quest-manager`) | Item rewards on a quest. When the GM marks the quest complete, the GM confirms, and the items are copied to the chosen characters. |
| Renown (`ashen-gate-factions`) | Faction and deity rewards: players claim, the GM approves, and an item is copied to the character. |
| Character Hub (`ashen-gate-character-hub`) | The character's **Journey** tab records what each quest gave them. |
| Utilities (`ashen-gate-utilities`) | Party stash; GM **Award Gold**. |
| General Manager (`ashen-gate-manager`) | Imports every content file and hands quest files to Quest Log. |

## 2. How it works in play (so the content makes sense)

- The GM can drag any item onto a quest's reward list, from:
  - a character sheet;
  - an NPC or monster sheet (the NPC keeps its item);
  - a compendium;
  - the Items sidebar.
- Imported rewards (section 3) appear in the same list.
- A reward remembers the item's **permanent id** (`ITEM-*`), so it still works after a reimport.
- When the GM marks the quest **Completed**, a panel lists the rewards and who gets them, and the GM confirms.
  - Each character gets all their items or none.
  - Nothing is ever given twice.
- Players see a reward only after the quest is complete, unless the content says otherwise (`visibility`).
- Coins, XP and Renown are **not** automatic. They stay text, and the GM hands them out.

## 3. Writing quest item rewards

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

| Field | Required | Values |
|---|---|---|
| `item_id` | yes | The permanent id of an Item record (`ITEM-*`, `ITEM-MOUNT-*`, `ITEM-PET-*`). The Item must be defined in an import file. Each id appears at most once per quest. |
| `quantity` | no | A whole number, 1 or more. Default 1. |
| `visibility` | no | `on_complete` (default: players see it once the quest is complete), `shown` (players see it while the quest is visible), `gm` (players never see it in the quest). |
| `recipient` | no | `chosen` (default: the GM picks one character), `each` (every character gets the full quantity), `split` (the quantity is shared out by the GM). Ignored on individual quests. |
| `note` | no | GM-only text shown when granting, at most 300 characters. |

- A quest has at most 50 item rewards.
- The rest of the quest record is unchanged (`ag-quest-source/0.1` or `ag-source-records/0.1`).
- Check every file with `node scripts/validate-content.mjs <file>`. It **notes** item ids that aren't in the same file; that's fine when the item comes from another file.

## 4. Don'ts

- **Don't** put Foundry uuids (`Item.abc…`, `Compendium.…`) in content. Use `item_id`.
- **Don't** write coin, XP or Renown amounts as fields. They stay text in `outcomes.description`. Don't invent amounts; ask Robb.
- **Don't** write live state: who received what, granted flags, Actor ids, claims.
- **Don't** reference an item that has no `ITEM-*` record. Write the record first, or describe the reward as text.
- **Don't** add other keys to an `item_rewards` entry. Unknown keys are refused.
- **Don't** put campaign lore in the public repo. Public examples use `[TEST]` names.
- **Don't** mark anything `approved`. Only Robb does.

**Faction and deity rewards** keep their current format (`docs/renown-deity-schema.md`). An `item_id` next to the `uuid` is coming with the Renown build. Don't write it until Robb says it shipped.

## 5. Where things live

| What | Where |
|---|---|
| Entry point for GPT (start here, section 2b) | `robbmcgaw/ashen-gate-supplement` → `campaign/GPT_HANDOFF.md` |
| Cross-system standards (this brief, once placed) | `robbmcgaw/ashen-gate-supplement` → `systems/architecture/` |
| Build reference, JSON Schemas, examples | `robbmcgaw/ashen-gate-supplement` → `systems/schemas/` |
| Robb's decisions on rewards | `robbmcgaw/ashen-gate-supplement` → `working/PRODUCT_QUESTIONS.md`, "Rewards and loot design" |
| Full design (inventory, drop standard, completion flow, migration, build plan) | `robbmcgaw/ashen-gate-foundry` → `docs/rewards-and-loot-design.md`: **final** (branch `design/rewards-loot` until merged) |
| Build briefs (for Claude, not for content) | `docs/rewards-briefs/` |
| Item records, Active Effects and flags | `docs/item-effects-schema.md`: **built** |
| Mount and pet items | `docs/companion-items-schema.md`: **built** |
| Faction and deity rewards | `docs/renown-deity-schema.md`: **built** |
| Perks, modifiers, sockets | `docs/perks-and-modifiers-architecture.md` |
| Check a file before handing it over | `node scripts/validate-content.mjs <file>` in the public repo |

## 6. When in doubt

Ask Robb, don't guess. If a reward doesn't fit `item_rewards` (coin, XP, standing, a favour, a clue), write it as text in `outcomes.description`. Mark the quest `draft`, and list the question for Robb.
