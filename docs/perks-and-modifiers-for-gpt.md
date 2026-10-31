# Perks, items and modifiers: brief for ChatGPT

**Status:** the standard is approved by Robb (2026-10-21) and is being built in steps. Write content only in the formats marked **built**. Ask Robb before using anything marked **planned**.

## 1. What the Ashen Gate suite is

Ashen Gate is a set of Foundry VTT modules for Robb's D&D campaign: Foundry V14 on The Forge, dnd5e 6.0.6, 2024 rules.

- **ChatGPT writes content.** That means JSON records, using the published schemas.
- **Claude builds the modules.** That means code, in the public repo.
- **Robb decides.** He is the GM and approves rules, numbers and formats.

| Module | Owns |
|---|---|
| General Manager (`ashen-gate-manager`) | Importing every content file; validation; shared appearance |
| Skill Trees (`ashen-gate-skill-trees`) | Profession and generic trees; grants `PERK-*` Items on unlock |
| Cinders (`ashen-gate-cinders`) | Cinder instances, `POWER-*` powers, Push, Backfire, Strain, Cinder sockets |
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
| A Cinder power or enhancement | A `POWER-*` record with a `power` block; numbers go in `power.modifiers` with the targets `push.cost`, `backfire.chance`, `backfire.severity`, `strain.recovery` (`docs/cinder-strain-schema.md`) | built |
| A Cinder's tree | One `cinder_milestone` tree per Cinder (`sourceRef` = its `MUT-*` id), `provider.maxPoints: 16` (the Cinder point cap; was 13). Its nodes are `POWER-*` ids (`docs/cinder-strain-schema.md`) | built |
| Mount gear, mount perk, pet clothing, pet perk | `ITEM-MOUNT-` / `PERK-MOUNT-` / `ITEM-PET-` / `PERK-PET-` Items; Active Effects with **`transfer: false`** (`docs/companion-items-schema.md`) | built (display only) |
| A perk a character receives automatically at Journeyman or Expert in a profession (no points, no tree) | A `ProfessionPerk` with `signature: true`, `tier`, `profession_id` and `point_cost: 0` (§3b) | **built** (Profession Ledger 0.31.0) |
| A hireling perk | An `HPERK-*` record with `contexts`, `conditions`, `stacking`, `implementation` | built (display only) |
| A crafted item | An `ITEM-*` Item, plus a `REC-*` recipe whose `result_item_id` names it | built |
| Say what a recipe's extra gold pays for | Optional `additional_gp_flavor` on the `REC-*` recipe, e.g. `"ash and vials"`; only with `additional_gp` above 0; display only (`docs/recipe-gold-flavor-schema.md`) | **built** (Manager 0.89.0 validates and stores it) |
| A faction or deity reward | A reward entry on the faction or deity (`docs/renown-deity-schema.md`); GM-approved | built |
| A quest reward | Text in `outcomes.description`; the GM grants it | built |
| A module number on an `ITEM-*` or `PERK-*` record (for example a Cinder socket item that lowers Push cost) | A record-level `modifiers` block (`ag-modifiers/0.1`), scope `cinder` (`docs/modifiers-schema.md`) | **built**: Manager 0.41.0 imports it; Cinders checks it, applies a `PERK-*`'s modifiers (0.2.0) and an `ITEM-*`'s while it is in a Cinder socket (0.3.0) |
| A light travel bonus on an `ITEM-*` or `PERK-*` (bonus daily actions, terrain efficiency, scout precision, explore range, condition mitigation) | A record-level `modifiers` block, scope `travel` (`docs/modifiers-schema.md` → The `travel` scope) | **built**: Locations 0.37.0 checks it (condition mitigation is capped at +3 per condition from 0.37.1; from 0.38.0 `applies.condition` is one of six condition ids: `harsh-weather`, `hard-ground` (labelled Difficult Terrain from 0.39.0), `poor-visibility`, `warped-paths`, `blight-taint`, `ashen-menace`; there is one list of conditions and no hazard class, and the GM sets today's severity 0 to 3 in the GM-only section of the Travel tab) and shows the totals to the GM there, never to players; Manager 0.88.0 imports it |
| Say how a perk is applied | Optional `implementation`: `automatic`, `informational` or `gm_resolved` (display only; `docs/modifiers-schema.md`) | **built in Manager 0.41.0** |
| Make an item fit a Cinder socket | Nothing extra: an `ITEM-*` with at least one `cinder` modifier fits (`docs/cinder-strain-schema.md` → Sockets). Effects `transfer: false`. There is **no** `socketable` block | **built** (Cinders 0.3.0) |
| Add a socket to a Cinder | A `sockets.count` modifier (scope `cinder`) on a perk, power or socket item | **built** (Cinders 0.3.0) |
| A Cinder's picture | Nothing in content. The GM sets an image on one Cinder in Foundry (double-click the orb; `api.cinder.setArt`, GM only); it is saved as `art` on that Cinder's record, not on the `MUT-*`. Without it the module draws a default orb that follows Strain (`docs/cinder-strain-schema.md` → Cinder art) | **built** (Cinders 0.6.0) |

## 3b. Signature perks (built: Profession Ledger 0.31.0)

A *signature perk* belongs to one profession and one tier. The Profession Ledger gives it to a character by itself the moment the character reaches that tier, with a chat note. It is not bought, costs no points and sits in no skill tree.

Write it as a normal `ProfessionPerk` record plus these fields:

| Field | Value |
|---|---|
| `signature` | `true`. Exactly the boolean; leave the field out on every ordinary perk. |
| `profession_id` | The `PROF-*` id of the profession (required). |
| `tier` | `"journeyman"` (granted at profession level 4) or `"expert"` (level 7). Lowercase. No other tier is granted. |
| `point_cost` | `0`. |

- Id pattern: `PERK-<PROF>-SIGNATURE-<TIER>-0N`, for example `PERK-ARCHAEOLOGY-SIGNATURE-JOURNEYMAN-01`. Several perks may share a profession and tier; the character gets all of them.
- Folder: `Ashen Gate/Professions/<Profession>/Signature Perks`. `foundry.data.type` is `feat`, as for any perk.
- `visibility: "player"`. A GM-only or reveal-gated signature perk is not granted to players.
- Never removed: a character who loses XP keeps the perk. Write the text so it still makes sense at a lower level.
- Do not list a signature perk in a skill tree. Use `implementation` (`gm_resolved`, `informational`, `automatic`) as for any perk.
- Import the file with General Manager first. A character who reached the tier before the import is caught up by the GM in the Ledger: **Assign → Signature perks → Preview → Grant**.

```json
{"id": "PERK-TEST-MINING-SIGNATURE-JOURNEYMAN-01", "entity_type": "ProfessionPerk", "status": "draft", "version": "0.1.0",
 "provenance": {"sources": ["Synthetic test data (not canon)"]}, "visibility": "player", "scope": "generic_rules",
 "refs": [{"target_id": "PROF-TEST-MINING", "relation": "perk_of", "mode": "optional"}],
 "profession_id": "PROF-TEST-MINING", "tier": "journeyman", "signature": true, "point_cost": 0,
 "implementation": "gm_resolved", "rules_summary": "[TEST] Shape only, not a rule.",
 "name": "[TEST] Read Rock",
 "foundry": {"document_type": "Item", "folder_path": "Ashen Gate/Professions/Mining/Signature Perks", "data": {"name": "[TEST] Read Rock", "type": "feat"}}}
```

**Modifier entry** (`ag-modifier/1`, the same in `power.modifiers` and in a `modifiers` block):

```
{target, value, label, scope?, op?, applies?, stack?, requires?}
```

- `target` comes from the scope's published list. Today the only scope is `cinder`, with `push.cost`, `backfire.chance`, `backfire.severity`, `strain.recovery`, `sockets.count`.
- `value` is a whole number and never 0 (Cinders: −100 to 100).
- `label` is shown to players.
- `scope` is required in a `modifiers` block, on the entry or once on the block. In `power.modifiers` it is always `cinder`.
- `op` is `add` or left out.
- `applies` narrows it (Cinders: `{"powers": [POWER-* ids], "modes": [mode ids]}`; the old top-level `powers` / `modes` still work).
- `requires` lists ids that must be in place (Cinders: `{"powers": [POWER-* ids]}`, unlocked on the Cinder).
- Modifiers that share a `stack` name don't add up (Cinders: only the largest counts).

**Synthetic example** (a socket-style item and a GM-resolved perk; the numbers are shape only, not rules):

```json
{"id": "ITEM-TEST-EMBER-LENS", "entity_type": "Item", "status": "draft", "version": "1.0.0",
 "provenance": {"sources": ["Synthetic test data (not canon)"]}, "visibility": "player", "refs": [],
 "implementation": "automatic",
 "modifiers": {"schema": "ag-modifiers/0.1", "scope": "cinder", "list": [
   {"target": "push.cost", "value": -1, "label": "[TEST] Ember Lens"}]},
 "foundry": {"document_type": "Item", "folder_path": "Ashen Gate/Test/Items", "data": {"name": "[TEST] Ember Lens", "type": "loot"}}}
```

```json
{"id": "PERK-TEST-QUIET-WORD", "entity_type": "ProfessionPerk", "status": "draft", "version": "1.0.0",
 "provenance": {"sources": ["Synthetic test data (not canon)"]}, "visibility": "player", "refs": [],
 "implementation": "gm_resolved",
 "foundry": {"document_type": "Item", "folder_path": "Ashen Gate/Test/Perks", "data": {"name": "[TEST] Quiet Word", "type": "feat"}}}
```

## 4. Don'ts

- Don't use macro, script, DAE or Midi keys, or any `flags` on effects.
- Don't put `transfer: true` on mount, pet or socket items.
- Don't write a lethal Backfire effect, or HP changes in an `effect`.
- Don't link rewards by Foundry UUID when a canonical id would do. Name the `ITEM-*` / `PERK-*` id in `rules_summary` too.
- Don't create live play state: no bearers, points, Strain, socket attachments, Cinder art or claims. Import writes definitions only.
- Don't add `art`, `img`, `element` or `tint` fields to a `MUT-*` record for the orb: Cinder art is set per Cinder by the GM in Foundry.
- Don't invent modifier targets, scopes, prefixes or blocks. Only `cinder` is a scope today.
- Don't put a `modifiers` block on anything but `ITEM-*` / `PERK-*` records; a `POWER-*` uses `power.modifiers`.
- Don't mark anything `approved` yourself.

## 5. Where things live

| What | Where |
|---|---|
| Entry point for GPT (start here, section 2b) | `robbmcgaw/ashen-gate-supplement` → `campaign/GPT_HANDOFF.md` |
| Cross-system standards (this brief, once placed) | `robbmcgaw/ashen-gate-supplement` → `systems/architecture/` (`README.md`, `PERKS_AND_MODIFIERS_FOR_GPT.md`) |
| Build reference, JSON Schemas, examples | `robbmcgaw/ashen-gate-supplement` → `systems/schemas/` (`GPT_BUILD_REFERENCE.md`) |
| Item Active Effects and flags (Manager 0.37.0+) | `robbmcgaw/ashen-gate-foundry` → `docs/item-effects-schema.md`: **built** |
| Mount and pet items (Hub 0.12.0+) | `docs/companion-items-schema.md`: **built** |
| Cinder, Power, Backfire, Strain content | `docs/cinder-strain-schema.md`: **built** (Cinders 0.1.0+, Manager 0.39.0+; perk modifiers Cinders 0.2.0) |
| Modifiers block and `implementation` | `docs/modifiers-schema.md`: **built** (Manager 0.41.0); examples in `test-fixtures/modifiers/` |
| Cinder engine design | `docs/cinder-strain-design.md`: **built**, in `ashen-gate-cinders` 0.1.0 |
| Deities | `docs/renown-deity-schema.md`: **built** |
| Profession crosswalk | `docs/profession-crosswalk-schema.md`: **built** |
| Routes, NPC Codex, scene moods, organize rules | `docs/routes-schema.md`, `docs/npc-codex-schema.md`, `docs/scene-moods-schema.md`, `docs/organize-rules.md`: **built** |
| World backup files, incl. Renown standings (play state, `ag-factions-state-export/0.1`) | `docs/world-backup.md`: **built** (Manager 0.90.0, Renown 0.27.0) |
| Recipe gold flavour (`additional_gp_flavor`) | `docs/recipe-gold-flavor-schema.md`: **built** (Manager 0.89.0); examples in `test-fixtures/recipe-gold-flavor/` |
| Signature perks (this brief, §3b) | `docs/perks-and-modifiers-for-gpt.md`: **built** (Profession Ledger 0.31.0) |
| Perks/modifiers/sockets architecture | `docs/perks-and-modifiers-architecture.md`: **approved** (decisions in §8); Cinder sockets built in Cinders 0.3.0 without a `socketable` block |
| Check a file before handing it over | `node scripts/validate-content.mjs <file>` in the public repo |

## 6. When in doubt

Ask Robb, don't guess. Specifically:
- Don't invent a format, field, target, prefix or number.
- If a perk needs something no schema covers, write it as plain GM text in `rules_summary` / the description.
- Mark the record `draft`, and list the question for Robb.

## Travel conditions: what authors do and do not write (Locations 0.40.0)

- **Never author conditions.** Only the six exist (`harsh-weather`, `hard-ground`, `poor-visibility`, `warped-paths`, `blight-taint`, `ashen-menace`); a record cannot define, rename or add one. The only place a record names a condition is `applies.condition` on a `condition.mitigation` entry.
- **Mitigation protects the party only.** It never lowers a condition on a place and never changes encounter pressure; for Blight Taint and Ashen Menace it only changes the GM's guidance line. Do not write copy that says an item "reduces the weather" or "removes the Blight"; say it protects the wearer or the party.
- Severities on places are the GM's, set in the Locations editor (GM only, `overlandConditions` on a Location record, optional, ids limited to the six, values 0 to 3). Do not put them in player-facing text.

## World backup and Renown standings (Manager 0.90.0, Renown 0.27.0)

Robb's **Back up world now…** writes these files to a private repository branch under `world-backup/`: `manager-edits.json` (`ag-world-edits/0.1`), `locations.json`, `quests.json` (`ag-quest-source/0.1`), `factions.json` (`ag-factions-source-export/0.4`, definitions only), `shops.json`, and `standings.json`. **`standings.json` is play state** in schema `ag-factions-state-export/0.1` (standings and rank, claims, requests, reveals, membership and Vows, per faction, deity and character). It is for reading only: do not write records in that schema, do not import it, and do not treat it as content. The content reconcile skips it. Full shape: `docs/world-backup.md`.
