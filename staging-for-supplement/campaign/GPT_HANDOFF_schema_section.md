<!-- Drop-in replacement for the record-format / package-building section of campaign/GPT_HANDOFF.md.
     Keep the rest of GPT_HANDOFF.md as the Campaign chat wrote it. Checked against ashen-gate-foundry main (Manager 0.27.0, Locations 1.11.0), 2026-10-20. -->

## Record formats and building import files

The full, validated reference is **`systems/schemas/GPT_BUILD_REFERENCE.md`** (with JSON Schemas in `systems/schemas/json/` and working examples in `systems/schemas/examples/`). Read it before writing any import file. If anything below disagrees with it, the reference wins.

### Which file to write

| Content | File | Top level |
|---|---|---|
| Professions, Materials, Recipes, Items, Profession perks, Hireling perks, Journals, NPCs, Roll Tables, Macros, **Locations**, **Routes** | Manager package | `{"manifest": {"schema_version": "ag-foundry-import/0.2", "package_id": "AG-…", "version": "1.0.0"}, "records": [...]}` |
| Quests, Work Orders, Contracts | Quest Log file | `{"schema_version": "ag-quest-source/0.1", "records": [Objective, ...]}` |
| Skill trees | Skill Trees file | `{"schema": "ag-skill-trees/0.3", "trees": [...]}` |
| Factions and Renown | Factions file | `{"schema_version": "ag-factions-source-export/0.3", "definitions": [...], "starting_state"?: [...]}` |
| Headquarters facilities | Facility list | `[Facility, ...]` (a bare array) |

Several files can go in one ZIP; Manager imports Manager packages first, then Quests, Skill Trees, Headquarters, Factions. Max 2000 records per package, 50 import files per ZIP.

### Every Manager record

```json
{
  "id": "MAT-SET-NAME", "entity_type": "Material", "status": "approved", "version": "1.0.0",
  "provenance": {"sources": ["design note or source document id"]},
  "visibility": "player", "scope": "generic_rules", "refs": [],
  "foundry": {"document_type": "Item", "folder_path": "Ashen Gate/Materials", "data": {"name": "…", "type": "loot"}}
}
```

- `id`: `PREFIX-PART-PART`, capitals/digits/dashes, permanent. Prefixes: PROF MAT REC ITEM PERK HPERK HIRE JRN ACTOR (entity_type NPC) TABLE MACRO LOC RTE; QUEST/ORDER/CONTRACT, FACTION/RENOWN, FAC in their own files.
- `status`: `approved` for play (draft/proposed only import in the Development profile; superseded/retired never).
- `provenance.sources` is a **list of strings**. Never `"source": "…"`.
- `visibility`: `player`, `gm` or `reveal_gated` (underscore).
- `refs`: `[{"relation": "requires_material", "target_id": "MAT-…", "mode": "required" | "optional"}]`. A `required` target must be in the same package (or already in the world); use `optional` for links to other files.
- `foundry.document_type`: Item, JournalEntry, Actor (npc/character), RollTable, Macro only. `foundry.data` keys: Item `name type img system`; JournalEntry `name img pages[{name, type:"text", text:{content}}]`; Actor `name type img system prototypeToken items effects flags`; RollTable `name img description formula replacement displayRoll results`; Macro `name img type scope command`.
- `folder_path` starts with `Ashen Gate/`, at most 4 levels.
- Link inside text with `[[AGREF:ID|Label]]` (in text, never inside an HTML tag).
- Any other top-level field (ingredients, quality, tierId, access, exotics…) is kept as the definition the modules read.
- Items may carry `core_ref: {"name": "Potion of Healing", "source": "DMG'24", "type": "consumable", "rarity": "common"}` to be linked to the 2024 core item later (Manager → Core Links).

### Domain fields in brief

- **Profession** `PROF-*`: `name` containing one of Alchemy, Blacksmithing, Cooking, Enchanting, Engineering, Inscription, Jewelcrafting, Leatherworking, Tailoring, Archaeology, Fishing, Herbalism, Hunting/Skinning, Mining; `profession_kind` crafting|gathering; `access: {toolProficienciesAnyOf, skillProficienciesAnyOf, advantageToolsAnyOf, toolMustBePresent}` using dnd5e tool/skill names.
- **Material** `MAT-*`: `quality` Common|Rare|Exotic, `tierId` apprentice|journeyman|expert|artisan|master, `source_profession_id` (required for Exotic).
- **Recipe** `REC-*`: `profession_id`, `tier`, `ingredients: [{"material_id", "quantity": integer}]`, `result_item_id`, optional `tool`, `required_tools` (all required), `workstation`, `effort`, `additional_gp`, `starting`.
- **ProfessionPerk** `PERK-*`: `profession_id`, `tier`, optional `point_cost`.
- **Location** `LOC-*` (in a Manager package, no `foundry` block): `{"entity_type": "Location", …, "location": {name, type, region, description, threat: settled|light|normal|hot|deadly, state: hidden|unidentified|revealed, parentLocationId, isRegion, passConditions, placeable, audience, sections: {resources: true, …}, conditions, resources, quests, related, loot, notes, details}}`. Gathering node: `{label, skill, tier 1–5, dc (default 10/12/15/18/20), materialId, quantity, rareMaterialId, rareQuantity, finite, exotics: [{materialId, mode: "discovery" | "designated", chance 1–100, condition: "success" | "rare"}]}`. Sections are hidden from players until switched on. Imported unidentified/revealed locations publish to players immediately.
- **Route** `RTE-*` (in a Manager package, no `foundry` block, imported after locations): `{"entity_type": "Route", "name": "label", "visibility": "gm", "refs": [route_from/route_to LOC refs], "route": {from_location_id, to_location_id, distance_km (number > 0), leg_km, hazard_base_percent 0–100 (default 10), hazard_table (RollTable name or UUID), terrain, discovery_state: unknown|rumoured|known|explored (set on create only), directed (one-way), name, notes (GM only)}}`. Bad values skip the route with a reason. Never put a hidden place's name in `route.name` or `terrain`.
- **Objective** (Quest Log file): `objective_kind` quest|work_order|contract with matching QUEST-/ORDER-/CONTRACT- id, `name`, `public_summary`, `source: {}`, `objectives: [{key: lowercase_key, goal, visibility}]`, `locations: []`, `parameters: {}`, `outcomes: {}`, `work_order_domain` for work orders.
- **Skill tree**: `{id, name, status, visibility, provider: {kind: profession|generic_points|cinder_milestone}, sourceRef: PROF-*/MUT-*/null, nodes: [{id, perkId: PERK-*, x, y, requiresAll, requiresAny, excludes, status, visibility, display}]}`.
- **Faction**: closed schema (no extra fields). `id FACTION-*`, `name`, `leader`, `public_role`, `renown_track` (RenownTrack `RENOWN-*`, five milestones from threshold 0), optional `individual_track`, `entries`, `rewards`, `discovery`.
- **Facility** `FAC-*`: `visibility: "player"`, `scope` generic_rules|setting_adapter, `placements` shared/personal, `stages [{key, label, width, height, staffing_slots, art, benefits [{name, description, recipient}]}]`.

### What re-importing does

Same id = same record. Items/Journals update source-changed fields and keep the GM's edits (both changed = conflict, not written). Actors, Roll Tables and Macros are create-only (Actors update only with "Update existing actors", which never touches HP, XP, level, conditions or player items). Locations, Routes, Quests and Skill Trees replace the definition only when the GM ticks the update option, keeping play state. Facilities and Factions are never updated by import. Campaign state (Renown, quest status, HQ layout, Ledger progress) is never imported.

### Not importable yet

Scene mood presets (GM adds them in Manager → Scenes), route journeys (play state), pantheon standing, NPC codex entries beyond Actors/Journals, companions. Organize rules are imported in Manager → Organize, not through Import. See the gap table in the reference.

### Before handing a file to Robb

Ask him to run `node scripts/validate-content.mjs <file>` in the foundry repo, or have a Build chat do it; it uses the real import validators.
