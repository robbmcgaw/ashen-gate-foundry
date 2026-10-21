# Perks, items and modifiers: brief for ChatGPT (DRAFT)

**Status: DRAFT.** Nothing in this file is built until Robb approves it. Until then, write content only in the formats marked **built**. Ask Robb before using anything marked **draft**.

## 1. What the Ashen Gate suite is

Ashen Gate is a set of Foundry VTT modules for Robb's D&D campaign: Foundry V14 on The Forge, dnd5e 6.0.6, 2024 rules.

- **ChatGPT writes content.** That means JSON records, using the published schemas.
- **Claude builds the modules.** That means code, in the public repo.
- **Robb decides.** He is the GM and approves rules, numbers and formats.

| Module | Owns |
|---|---|
| General Manager (`ashen-gate-manager`) | Importing every content file; validation; shared appearance |
| Skill Trees (`ashen-gate-skill-trees`) | Profession and generic trees; grants `PERK-*` Items on unlock |
| Cinders (`ashen-gate-cinders`, being split out of Skill Trees) | Cinder instances, `POWER-*` powers, Push, Backfire, Strain, sockets (planned) |
| Character Hub (`ashen-gate-character-hub`) | Character view; mounts, pets and their items (display only) |
| Profession Ledger (`ashen-gate-profession-ledger`) | Professions, materials, recipes, crafting |
| Renown (`ashen-gate-factions`) | Factions, deities, standing, reward claims |
| Headquarters (`ashen-gate-headquarters`) | HQ, facilities, hirelings and hireling perks |
| Quest Log (`ashen-gate-quest-manager`) | Quests and objectives |
| Locations (`ashen-gate-locations`) | Locations and routes |

## 2. Rules that always apply

- **Stable ids.** Every record has a permanent id in UPPER-KEBAB form, for example `PERK-TEST-QUICK-HANDS`.
  - Never rename or reuse an id.
  - The prefix says what the record is: `PERK-`, `POWER-`, `MUT-`, `BF-`, `HPERK-`, `ITEM-`, `ITEM-MOUNT-`, `PERK-MOUNT-`, `ITEM-PET-`, `PERK-PET-`, `REC-`, `MAT-`, `PROF-`, `DEITY-`, `LOC-`, `QUEST-`, `FAC-`.
  - Every effect inside an Item has its own permanent `eff_id`.
- **Draft vs canon.**
  - `status: draft` means proposed.
  - `approved` means Robb has accepted it.
  - Only Robb promotes a record to `approved`.
- **Lore stays private.** Campaign names, setting text and GM secrets go only in the private repo `robbmcgaw/ashen-gate-supplement`. They never go in the public `robbmcgaw/ashen-gate-foundry`. Public examples use `[TEST]` names.
- **No invented rules.** Never invent mechanics, numbers or new fields. If a schema doesn't cover something, write it as text for the GM and ask Robb.

## 3. Which pattern to use

| You want… | Use | Status |
|---|---|---|
| A dnd5e number to change (AC, speed, saves, skills, resistances, a condition) | An **Active Effect** in `foundry.data.effects`, with an `eff_id` and an explicit `transfer` (`docs/item-effects-schema.md`) | built |
| A character perk from a tree | A `feat` Item, id `PERK-*`, with Active Effects for its numbers; `transfer: true` | built |
| A Cinder power or enhancement | A `POWER-*` record with a `power` block; numbers go in `power.modifiers` with the targets `push.cost`, `backfire.chance`, `backfire.severity`, `strain.recovery` (`docs/cinder-strain-schema.md`) | PR #155, open |
| Mount gear, mount perk, pet clothing, pet perk | `ITEM-MOUNT-` / `PERK-MOUNT-` / `ITEM-PET-` / `PERK-PET-` Items; Active Effects with **`transfer: false`** (`docs/companion-items-schema.md`) | built (display only) |
| A hireling perk | An `HPERK-*` record with `contexts`, `conditions`, `stacking`, `implementation` | built (display only) |
| A crafted item | An `ITEM-*` Item, plus a `REC-*` recipe whose `result_item_id` names it | built |
| A faction or deity reward | A reward entry on the faction or deity (`docs/renown-deity-schema.md`); GM-approved | built |
| A quest reward | Text in `outcomes.description`; the GM grants it | built |
| A module number on an ordinary item (for example a Cinder socket item that lowers Push cost) | A record-level `modifiers` block (`ag-modifiers/0.1`) and a `socketable` block (`docs/perks-and-modifiers-architecture.md` §3–4) | **draft: don't use yet** |

**Modifier entry** (Cinder today; all modules once approved):

```
{target, value, label, stack?, powers?, modes?}
```

- `value` is a whole number and never 0.
- `label` is shown to players.
- Modifiers that share a `stack` name don't add up.

## 4. Don'ts

- Don't use macro, script, DAE or Midi keys, or any `flags` on effects.
- Don't put `transfer: true` on mount, pet or socket items.
- Don't write a lethal Backfire effect, or HP changes in an `effect`.
- Don't link rewards by Foundry UUID when a canonical id would do. Name the `ITEM-*` / `PERK-*` id in `rules_summary` too.
- Don't create live play state: no bearers, points, Strain, attachments or claims. Import writes definitions only.
- Don't invent modifier targets, prefixes or blocks.
- Don't mark anything `approved` yourself.

## 5. Where things live

| What | Where |
|---|---|
| Entry point for GPT (start here, section 2b) | `robbmcgaw/ashen-gate-supplement` → `campaign/GPT_HANDOFF.md` |
| Cross-system standards (this brief, once placed) | `robbmcgaw/ashen-gate-supplement` → `systems/architecture/` (`README.md`, `PERKS_AND_MODIFIERS_FOR_GPT.md`) |
| Build reference, JSON Schemas, examples | `robbmcgaw/ashen-gate-supplement` → `systems/schemas/` (`GPT_BUILD_REFERENCE.md`) |
| Item Active Effects and flags (Manager 0.37.0+) | `robbmcgaw/ashen-gate-foundry` → `docs/item-effects-schema.md`: **built** |
| Mount and pet items (Hub 0.12.0+) | `docs/companion-items-schema.md`: **built** |
| Cinder, Power, Backfire, Strain content | `docs/cinder-strain-schema.md`: **open PR #155** (branch `manager-cinder-import`) |
| Cinder engine design | `docs/cinder-strain-design.md`: **approved lean design, built in Skill Trees 0.15–0.16**; the move to `ashen-gate-cinders` is in progress |
| Deities | `docs/renown-deity-schema.md`: **built** |
| Profession crosswalk | `docs/profession-crosswalk-schema.md`: **built** |
| Routes, NPC Codex, scene moods, organize rules | `docs/routes-schema.md`, `docs/npc-codex-schema.md`, `docs/scene-moods-schema.md`, `docs/organize-rules.md`: **built** |
| Perks/modifiers/sockets architecture | `docs/perks-and-modifiers-architecture.md`: **draft** (branch `design/perks-architecture`) |
| Check a file before handing it over | `node scripts/validate-content.mjs <file>` in the public repo |

## 6. When in doubt

Ask Robb, don't guess. Specifically:
- Don't invent a format, field, target, prefix or number.
- If a perk needs something no schema covers, write it as plain GM text in `rules_summary` / the description.
- Mark the record `draft`, and list the question for Robb.
