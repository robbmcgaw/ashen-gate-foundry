<!-- Drop-in replacement for the record-format / package-building section of campaign/GPT_HANDOFF.md.
     Keep the rest of GPT_HANDOFF.md as the Campaign chat wrote it. Checked against ashen-gate-foundry main
     (Manager 0.35.0, Locations 1.15.1, Profession Ledger 0.21.0, Renown 0.11.1, Quest Log 0.8.0, Skill Trees 0.14.0, Headquarters 0.10.0, Character Hub 0.9.0), 2026-10-20. -->

## Record formats and building import files

The full, validated reference is **`systems/schemas/GPT_BUILD_REFERENCE.md`** (JSON Schemas in `systems/schemas/json/`, working examples in `systems/schemas/examples/`). Start with its **§0 Prompt starter**, the step-by-step recipe for each kind of file. If anything below disagrees with the reference, the reference wins.

### Which file to write

| Content | File | Top level |
|---|---|---|
| Professions, Materials, Recipes, Items, Profession perks, Hireling perks, Journals, **NPCs**, Roll Tables, Macros, **Locations**, **Routes** | Manager package | `{"manifest": {"schema_version": "ag-foundry-import/0.2", "package_id": "AG-…", "version": "1.0.0"}, "records": [...]}` |
| Quests, Work Orders, Contracts | Quest Log file | `{"schema_version": "ag-quest-source/0.1", "records": [Objective, ...]}` |
| Skill trees | Skill Trees file | `{"schema": "ag-skill-trees/0.3", "trees": [...]}` |
| Factions **and deities** | Renown file | `{"schema_version": "ag-factions-source-export/0.4", "definitions": [Faction or Deity, ...], "starting_state"?: [...]}` |
| Headquarters facilities | Facility list | `[Facility, ...]` (a bare array) |
| Organize rules (`*.organize-rules.json`) | Manager → Organize → Import, not the Import tab | `[rule, ...]` |
| Scene moods and layers (`*.scene-moods.json`) | Manager → Scenes → Export & import, not the Import tab | `{"format": "ashen-gate.scene-moods", "formatVersion": 1, "presets": [{id, label, kind: mood|layer, set: {...}, transitionMs?}]}` |
| Profession crosswalk baseline (`*.crosswalk.json`) | Profession Ledger → GM Setup → Tools and checks → Import baseline file, not the Import tab | `{"professions": {"<profession>": {qualifySkills, qualifyTools, advantageTools, items}}}` |

Several Import-tab files can go in one ZIP; Manager imports Manager packages first, then Quests, Skill Trees, Headquarters, Renown. Max 2000 records per package, 50 import files per ZIP.

### Every Manager record

```json
{
  "id": "MAT-SET-NAME", "entity_type": "Material", "status": "approved", "version": "1.0.0",
  "provenance": {"sources": ["design note or source document id"]},
  "visibility": "player", "scope": "generic_rules", "refs": [],
  "foundry": {"document_type": "Item", "folder_path": "Ashen Gate/Materials", "data": {"name": "…", "type": "loot"}}
}
```

- `id`: `PREFIX-PART-PART`, capitals/digits/dashes, permanent, no spoilers. Prefixes: PROF MAT REC ITEM PERK HPERK HIRE JRN **NPC** (entity_type NPC; older ACTOR- ids also need entity_type NPC) TABLE MACRO LOC RTE; QUEST/ORDER/CONTRACT, FACTION/**DEITY**/RENOWN, FAC in their own files.
- `status`: `approved` for play (draft/proposed only import in the Development profile; superseded/retired never).
- `provenance.sources` is a **list of strings**. Never `"source": "…"`.
- `visibility`: `player`, `gm` or `reveal_gated` (underscore).
- `refs`: `[{"relation": "requires_material", "target_id": "MAT-…", "mode": "required" | "optional"}]`. A `required` target must be in the same package (or already in the world); use `optional` for links to other files.
- `foundry.document_type`: Item, JournalEntry, Actor (npc/character), RollTable, Macro only. `foundry.data` keys: Item `name type img system`; JournalEntry `name img pages[{name, type:"text", text:{content}}]`; Actor `name type img system prototypeToken items effects flags`; RollTable `name img description formula replacement displayRoll results`; Macro `name img type scope command`.
- `folder_path` starts with `Ashen Gate/`, at most 4 levels.
- Link inside text with `[[AGREF:ID|Label]]` (in text, never inside an HTML tag).
- Any other top-level field (ingredients, quality, tierId, access, exotics, NPC Codex fields…) is kept as the definition the modules read.
- Items may carry `core_ref: {"name": "Potion of Healing", "source": "DMG'24", "type": "consumable", "rarity": "common"}` to be linked to the 2024 core item later (Manager → Core Links).

### Domain fields in brief

- **Profession** `PROF-*`: `name` containing one of Alchemy, Blacksmithing, Cooking, Enchanting, Engineering, Inscription, Jewelcrafting, Leatherworking, Tailoring, Archaeology, Fishing, Herbalism, Hunting/Skinning, Mining; `profession_kind` crafting|gathering; `access: {toolProficienciesAnyOf, skillProficienciesAnyOf, advantageToolsAnyOf, itemsAnyOf, toolMustBePresent}` using dnd5e tool/skill names and Item names. Setting any one access list makes the unset skill/tool lists "none" for that profession: give them all, or use the crosswalk baseline file instead.
- **Material** `MAT-*`: `quality` Common|Rare|Exotic, `tierId` apprentice|journeyman|expert|artisan|master, `source_profession_id` (required for Exotic).
- **Recipe** `REC-*`: `profession_id`, `tier`, `ingredients: [{"material_id", "quantity": integer}]`, `result_item_id`, optional `tool`, `required_tools` (all required), `workstation`, `effort`, `additional_gp`, `starting`.
- **ProfessionPerk** `PERK-*`: `profession_id`, `tier`, optional `point_cost`.
- **NPC** `NPC-*` (Manager package, `entity_type: "NPC"`, `foundry` Actor `type: "npc"`, `visibility: "gm"`): revealable text `role`, `appearance`, `signature_line`, `wants`, `knows` (write them as players may read them once revealed); GM-only `portrayal`, `session_role`, `stat_block`, `gm_notes: []`; `codex: {"links": [LOC-/FACTION-/RENOWN-/QUEST-/ORDER-/CONTRACT-/NPC- ids], "default_reveal": {"discovery": "hidden"|"party", "fields": {"role": "party", …}}}`. Who knows what is set by the GM in Library → NPC Codex during play.
- **Location** `LOC-*` (in a Manager package, no `foundry` block): `{"entity_type": "Location", …, "location": {name, type, region, description, threat: settled|light|normal|hot|deadly, state: hidden|unidentified|revealed, parentLocationId, isRegion, passConditions, placeable, audience, sections: {resources: true, …}, conditions, resources, quests, related, loot, notes, details}}`. Gathering node: `{label, skill, tier 1–5, dc (default 10/12/15/18/20), materialId, quantity, rareMaterialId, rareQuantity, finite, exotics: [{materialId, mode: "discovery" | "designated", chance 1–100, condition: "success" | "rare"}]}`. Sections are hidden from players until switched on. Imported unidentified/revealed locations publish to players immediately.
- **Route** `RTE-*` (in a Manager package, no `foundry` block, imported after locations): `{"entity_type": "Route", "name": "label", "visibility": "gm", "refs": [route_from/route_to LOC refs], "route": {from_location_id, to_location_id, distance_km (number > 0), leg_km (default: world setting, 5 km), hazard_base_percent 0–100 (default 5), hazard_table (RollTable name or UUID), terrain (≤ 80), discovery_state: unknown|rumoured|known|explored (set on create only), directed (one-way), name (≤ 200), notes (GM only)}}`. Bad values skip the route with a reason. Never put a hidden place's name in `route.name` or `terrain`. Journeys and travel behaviours (pace, watches, check skills) are play state: never write them.
- **Objective** (Quest Log file): `objective_kind` quest|work_order|contract with matching QUEST-/ORDER-/CONTRACT- id, `name`, `public_summary`, `source: {}`, `objectives: [{key: lowercase_key, goal, visibility}]`, `locations: []`, `parameters: {}`, `outcomes: {}`, `work_order_domain` for work orders.
- **Skill tree**: `{id, name, status, visibility, provider: {kind: profession|generic_points|cinder_milestone}, sourceRef: PROF-*/MUT-*/null, nodes: [{id, perkId: PERK-*, x, y, requiresAll, requiresAny, excludes, status, visibility, display}]}`.
- **Faction** (Renown file): closed schema (no extra fields). `id FACTION-*`, `name`, `leader`, `public_role`, `renown_track` (RenownTrack `RENOWN-*`, five milestones from threshold 0), optional `individual_track`, `entries`, `rewards`, `discovery`.
- **Deity** (Renown file, 0.4 only): closed schema. `id DEITY-*`, `entity_type: "Deity"`, `name`, `discovery`, `individual_track` (RenownTrack `RENOWN-*`, `default_scope: "individual"`, five milestones = rank titles, first threshold 0), `entries` (unlock `manual`|`individual_renown`), `rewards` (audience `individual` only), `deity: {symbol, title, domain, tier: major|lesser, blurb, portfolio, teachings, followers, practices, saying: {text, attribution}, relations: [{deity_id: "DEITY-…", resonance: 0–1}]}`. No `leader`, `public_role`, `folder_key` or `renown_track`. Favour is per character; `starting_state` for a deity uses `actors[].renown` only (no `group_renown`). Resonance values come from Robb.
- **Facility** `FAC-*`: `visibility: "player"`, `scope` generic_rules|setting_adapter, `placements` shared/personal, `stages [{key, label, width, height, staffing_slots, art, benefits [{name, description, recipient}]}]`.
- **Crosswalk baseline** (`*.crosswalk.json`): `{"professions": {"herbalism": {"qualifySkills": ["nat"], "qualifyTools": ["Herbalism Kit"], "advantageTools": ["herb"], "items": ["…"]}}}`. A list left out is not set; `[]` means none; each profession once.

### What re-importing does

Same id = same record. Items/Journals update source-changed fields and keep the GM's edits (both changed = conflict, not written). Actors (NPCs included), Roll Tables and Macros are create-only (Actors update only with "Update existing actors", which never touches HP, XP, level, conditions or player items; an NPC's Codex text only follows the file when the name, image, token or items also changed). Locations, Routes, Quests and Skill Trees replace the definition only when the GM ticks the update option, keeping play state. Facilities, Factions and Deities are never updated by import. Campaign state (Renown and deity favour, quest status, Codex reveals, journeys, HQ layout, Ledger progress) is never imported.

### Not importable yet

Scenes applied moods and favourites (play state), route journeys and travel behaviours (play state), standing or discovery for factions/deities already in the world, Codex reveals beyond `default_reveal`, companions. Organize rules, the crosswalk baseline and the scene moods file are imported with their own buttons, not through Import. See the gap table in the reference.

### Never in the public foundry repo

Real campaign content of any kind: setting names, NPCs, places, plots, GM notes, `gm` or unrevealed records, deity or faction secrets, Codex or world exports. The foundry repo is public; examples there use `[EXAMPLE]`/`[TEST]` names only.

### Before handing a file to Robb

Ask him to run `node scripts/validate-content.mjs <file>` in the foundry repo, or have a Build chat do it; it uses the real import validators (crosswalk and Codex checks need the validator update from 2026-10-20).
