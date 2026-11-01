# World backup to GitHub (General Manager 0.97.0)

General Manager, Items > Export > **Back up world now…** (GM only). It writes the GM's current state to a branch of a **private** repository (default branch `world-backup`) in one commit, so it can be read from GitHub without pasting exports. Settings (repository, branch, write token) are in GM Setup > General > World backup; the token stays on the GM's browser. A public repository or the repository's default branch is refused before anything is sent. Unticked types are not written and their earlier file stays on the branch.

## Files (all under `world-backup/`)

| Tick box | File | Schema | Kind |
|---|---|---|---|
| Edited Items, Journals, Actors, Roll Tables, Macros | `manager-edits.json` | `ag-world-edits/0.1` (see `docs/world-edits-export.md`) | content |
| Locations | `locations.json` | Locations export package | content |
| Quests, Orders and Contracts | `quests.json` | `ag-quest-source/0.1` (Quest Log `api.exportSource()`) | content |
| Factions and deities | `factions.json` | `ag-factions-source-export/0.4` (Renown `api.exportDefinitions()`), definitions only | content |
| Shops | `shops.json` | Utilities shop export | content |
| Renown standings and claims | `standings.json` | `ag-factions-state-export/0.1` (Renown `api.exportState()`, Renown 0.27.0+) | **play state** |
| Party characters | `party.json` | `ag-party-sheets-export/0.1` (built by Manager from world Actors; Manager 0.93.0+) | **play state** |
| Skill Trees layouts and progress | `skill-trees.json` | `ag-skill-trees-state-export/0.1` (Skill Trees `api.exportState()`, Skill Trees 0.25.0+; shape in "Skill Trees state" below) | **play state** |
| Cinders instances and Strain | `cinders.json` | `ag-cinders-state-export/0.1` (Cinders `api.exportState()`, Cinders 0.17.0+; shape in "Cinders state" below) | **play state** |
| Profession Ledger state | `ledger.json` | `ag-ledger-state-export/0.1` (Profession Ledger `api.exportState()`, Ledger 0.44.0+; shape in "Profession Ledger state" below) | **play state** |
| Headquarters state | `headquarters.json` | `ag-headquarters-state-export/0.1` (Headquarters `api.exportState()`, Headquarters 0.16.0+; shape in "Headquarters state" above) | **play state** |

## Headquarters state (`ag-headquarters-state-export/0.1`, Headquarters 0.16.0)

GM-only, read-only play state from Headquarters `api.exportState()` (optional: feature-detect it). General Manager 0.97.0 writes it as `world-backup/headquarters.json` (the **Headquarters state** tick box, ticked by default) exactly as returned; it is never imported. It is not the module's own `aghq-state/0.1` save.

```json
{
  "schema_version": "ag-headquarters-state-export/0.1",
  "format": "aghq-state/0.1", "active": true, "state_revision": 12,
  "guild": {"campaign_key": "test", "guild_key": "primary", "rank": 1, "shared_defaults": {"orders_per_downtime": 2, "shared_facility_slots": 2}, "unlocked_facility_refs": ["FAC-TEST-FORGE"]},
  "config": {"name": "Guildhall", "bounds": {"width": 24, "height": 18}, "cell_px": 44, "background": "", "rank_rules": [], "manual_unlock_refs": [], "decoration_art": []},
  "headquarters": [
    {
      "hq_ref": "HQ-TEST-001", "location_ref": "LOC-TEST-001", "shared_revision": 3,
      "rooms": [{"key": "room_p1", "kind": "personal", "owner_user_id": "(world-local id)", "owner_user_name": "[TEST] Player", "revision": 0}],
      "installations": [{"key": "forge_copy", "facility_ref": "FAC-TEST-FORGE", "room_key": "common", "placement": {"x": 1, "y": 1, "rotation": 0, "width": 4, "height": 3}}],
      "staffing_slots": [{"key": "forge_copy_slot_1", "room_key": "common", "installation_key": "forge_copy", "occupant_hireling_ref": "HIRE-TEST-A"}]
    }
  ],
  "inventory": [{"key": "forge_copy", "facility_ref": "FAC-TEST-FORGE", "stage_key": "base"}],
  "personal_layouts": [{"room_key": "room_p1", "bounds": {"width": 12, "height": 9}, "background": "", "decorations": []}],
  "facilities": [{"id": "FAC-TEST-FORGE", "name": "[TEST] Forge", "category": "Profession", "status": "draft", "version": "0.1.0"}],
  "hirelings": [{"hireling_ref": "HIRE-TEST-A", "working": true, "employment_status": "active", "history": []}]
}
```

- Before Headquarters 0.16.0 `exportState` returned a raw copy of the private save (no schema name, stored order, editing lease and request nonces included, full facility definitions). It now sorts every list by key, names its schema, and leaves out the lease and nonces. `facilities` carries no definition text (the content pack holds it). `hirelings` keeps the GM's notes and history as stored.
- Room owners are world-local user ids; the name sits beside each. Facility, Hireling, location and HQ refs are permanent. No timestamps of its own.

The edits file also carries, from Manager 0.96.0, an additive top-level `npc_codex` array (written with the Edited Actors tick): the NPC Codex layer per NPC with saved state, `{id, name, pack_name, status, edits, learned, notes, links, discovery, reveals, actor_names}` (see `docs/npc-codex-schema.md`). The schema string stays `ag-world-edits/0.1`; the layer is world-local play and edit state, so a reader that merges content should ignore `npc_codex` unless it knows it.

The content files are formats the content pack's reconcile script reads. **`standings.json`, `party.json`, `skill-trees.json`, `cinders.json`, `ledger.json` and `headquarters.json` are play state** and deliberately use their own schema strings: the reconcile lists unknown formats and skips them, so they are never merged into content. Skipped with the reason "update Renown" when Renown is missing, off or older than 0.27.0. The four partner files (0.97.0) are skipped the same way, with a plain reason ("update Skill Trees", "update Cinders", "update Profession Ledger", "update Headquarters") when that module is missing, off or too old to offer `exportState`; a module that is present but throws (not a GM, say) is skipped as "it could not be read just now". The partner shapes are described once, in their own sections below; they are not repeated here.

## Profession Ledger state (`ag-ledger-state-export/0.1`, Profession Ledger 0.44.0)

GM-only, read-only play state from Profession Ledger `api.exportState()` (optional: feature-detect it). General Manager 0.97.0 writes it as `world-backup/ledger.json` (the **Profession Ledger state** tick box, ticked by default) exactly as returned; it is never imported. It is not the node file format (`ag-gathering-nodes/1`).

```json
{
  "schema_version": "ag-ledger-state-export/0.1",
  "roster": [{"actor_id": "(world-local id)", "actor_name": "[TEST] Hero"}],
  "characters": [
    {
      "actor_id": "(world-local id)", "actor_name": "[TEST] Hero",
      "professions": [{"profession_id": "PROF-TEST", "name": "[TEST] Profession", "level": 2, "xp": 5, "tier": "Apprentice", "tracked": true, "selected_perk_ids": ["PERK-TEST"], "unspent_perk_choices": 1, "history_length": 2}],
      "known_recipe_ids": ["REC-TEST"],
      "favorites": {"professions": ["PROF-TEST"], "recipes": ["REC-TEST"]}
    }
  ],
  "gathering_nodes": {
    "templates": [{"id": "NODE-TEST-REEDS", "name": "[TEST] River Reeds", "activity": "herbalism", "professions": ["herbalism"], "tier": {"min": 1, "max": 2}, "dcVisible": false, "finite": true, "materials": {"common": [{"materialId": "MAT-TEST", "quantity": 2, "chance": null}], "rare": [], "exotic": []}, "origin": "gm", "edited": true}],
    "retired_ids": ["NODE-TEST-OLD"]
  }
}
```

- `characters` lists characters (not NPCs or level-backup copies) with a profession, a known recipe or a favourite. `tracked` is false for a profession on the sheet with no XP stored yet (shown as level 1). XP history keeps its last 50 entries on the character; only the count is exported.
- `gathering_nodes.templates` are the GM-edited node templates held in the Ledger's GM-only journal (the data that otherwise only leaves the world through the Nodes tab's Export). Template fields are those of the node file; `origin` is `gm`, `import` or `migration`, and `edited` is true once the GM has changed it.
- Actor ids are world-local; the name sits beside each. Profession, perk, recipe, material and node ids are permanent. Rows are sorted. No timestamps and no recipe or profession text.

## `standings.json` (`ag-factions-state-export/0.1`)

```json
{
  "schema_version": "ag-factions-state-export/0.1",
  "factions": [
    {
      "id": "FACTION-TEST-A", "kind": "faction", "name": "[TEST] Guild A",
      "renown_track_id": "RENOWN-TEST-A", "individual_track_id": "RENOWN-TEST-A-IND",
      "group": {
        "standing": {"opening_score": 0, "score": 4, "events": []},
        "progress": {"rank_id": "RENOWN-TEST-A-M2", "rank": "Recognized", "rank_index": 1, "rank_threshold": 3, "next_rank_id": "RENOWN-TEST-A-M3", "next_rank": "Trusted", "next_threshold": 6, "remaining": 2},
        "claims": {}, "requests": {}, "uses": {}, "choices": {},
        "membership": {"party": true, "actors": []}, "discovery": {"party": true, "actors": []},
        "knowledge": {}, "field_reveals": {"mode": "legacy", "fields": {}},
        "actor_names": {}
      }
    }
  ],
  "personal": [
    {
      "actor_id": "(world-local id)", "actor_name": "[TEST] Hero",
      "vow": {"deity_id": "DEITY-TEST-A", "sworn_at": null, "deity_name": "[TEST] God A"}, "vow_log": [],
      "factions": [{"faction_id": "FACTION-TEST-A", "kind": "faction", "faction_name": "[TEST] Guild A", "standing": {}, "progress": {}, "claims": {}, "requests": {}, "uses": {}, "choices": {}}]
    }
  ]
}
```

- `factions` has one row per faction and deity (`kind` is `faction` or `deity`), with the party's `group` state: standing and event history, rank position, claims, requests, uses, choices, who has discovered it, entry and field reveals, recruited members. `group` is `null` until the module has stored state for it. A deity's `group.progress` is `null` (its group track is never scored).
- `personal` has one row per character that has a stored standing or a Vow: the character's `factions` rows carry that character's own standing (a deity's score is piety), rank position, claims, requests, uses and choices.
- Actor ids are world-local; the name sits beside every one (`actor_name`, and `actor_names` inside `group`). Faction, deity, rank and reward ids are the permanent canonical ids. No timestamps of its own and no definition text (that is `factions.json`). Rows are sorted so a re-run changes only what changed.
- Never write this file by hand and never import it. It is for reading.

## Skill Trees state (`ag-skill-trees-state-export/0.1`, Skill Trees 0.25.0)

GM-only, read-only play state from Skill Trees `api.exportState()` (optional: feature-detect it). General Manager 0.97.0 writes it as `world-backup/skill-trees.json` (the **Skill Trees layouts and progress** tick box, ticked by default) exactly as returned; it is never imported.

```json
{
  "schema_version": "ag-skill-trees-state-export/0.1",
  "trees": [
    {
      "tree_id": "TREE-TEST", "name": "[TEST] Tree", "kind": "generic_points", "status": "draft", "visibility": "gm", "source_ref": null,
      "provider": {"kind": "generic_points", "maxPoints": 10}, "access": null,
      "appearance": {"node_size": "compact", "background": null, "tiers": []},
      "nodes": [{"id": "NODE-TEST-1", "perk_id": "PERK-TEST", "x": 10, "y": 20, "cost": 1, "requires_all": [], "requires_any": [["NODE-TEST-2", "NODE-TEST-3"]], "excludes": [], "status": "draft", "visibility": "gm", "display": "hidden", "content_ref": null, "lane": null}]
    }
  ],
  "progress": [
    {"actor_id": "(world-local id)", "actor_name": "[TEST] Hero", "trees": [{"tree_id": "TREE-TEST", "wallet": "tree:TREE-TEST", "unlocked_node_ids": ["NODE-TEST-1"], "kept_node_ids": [], "awarded": 5, "history_length": 2, "points": {"level": null, "earned": 5, "spent": 1, "available": 4}}]}
  ]
}
```

- `trees` are the GM layouts as the GM has them in the world (the GM may edit layouts there). Perk text is never exported (the content pack holds it): a perk node carries `perk_id`; only a custom node (no perk) adds its own `name`. Rows and nodes are sorted by id.
- `progress` has one row per character that has unlocked, kept or been awarded anything; level-backup copies and NPCs are left out. `points.earned`/`available` are `null` when a profession tree's Ledger level is unavailable. Actor ids are world-local; the name sits beside each.
- No timestamps of its own. The window's Export and Back up progress downloads are separate and unchanged.

## `party.json` (`ag-party-sheets-export/0.1`, Manager 0.93.0)

Read-only play state: a slim, plain-JSON copy of the players' character sheets (the old hand-made party export was about 5 MB of full Actors). **Never import it and never write records in this schema.** GM only. Ticked by default.

Included: world Actors of type `character` that a non-GM user owns, sorted by name. GM-owned characters, NPCs and characters no player owns are left out. Excluded: biography, notes, player-private text, Active Effects, Actor flags, item descriptions of inventory, timestamps.

```json
{
  "schema_version": "ag-party-sheets-export/0.1",
  "note": "Play state, read only. Never import this file. ...",
  "characters": [
    {
      "actor_id": "(world-local id)", "name": "[TEST] Hero", "owner": "[TEST] Player", "level": 3,
      "classes": [{"name": "[TEST] Class", "identifier": "test-class", "levels": 3, "subclass": "[TEST] Subclass"}],
      "species": "[TEST] Species", "background": "[TEST] Background",
      "abilities": {"str": {"score": 10, "modifier": 0, "save_proficient": false, "save_bonus": 0}},
      "skills": {"acr": {"proficiency": 1, "ability": "dex"}},
      "hp": {"max": 24, "temp_max": 0}, "ac": 15, "speed": {"walk": 30, "units": "ft"}, "initiative_bonus": 2,
      "proficiencies": {"armor": ["lgt"], "weapons": ["sim"], "tools": ["thief"], "languages": ["common"]},
      "currency": {"pp": 0, "gp": 12, "ep": 0, "sp": 0, "cp": 0},
      "features": [{"name": "[TEST] Feature", "identifier": "test-feature", "source": {"book": "", "custom": "Ashen Gate"}, "activation": "action", "description": "Plain text, at most 600 characters."}],
      "spells": [{"name": "[TEST] Spell", "level": 1, "prepared": true, "preparation": "spell", "school": "evo"}],
      "inventory": [{"name": "[TEST] Sword", "type": "weapon", "quantity": 1, "equipped": true, "attuned": false, "rarity": "common"}],
      "ashen_gate": {
        "professions": [{"profession_id": "PROF-TEST", "name": "[TEST] Profession", "level": 2, "xp": 10, "tier": "apprentice", "unspent_perk_choices": 0, "selected_perk_ids": ["PERK-TEST"]}],
        "cinders": [{"instance_id": "(world-local id)", "definition_id": "(Cinder record id)", "name": "[TEST] Cinder", "unlocked_powers": [{"power_id": "POWER-TEST", "name": "[TEST] Power"}], "enhancements": []}],
        "skill_trees": [{"tree_id": "TREE-TEST", "name": "[TEST] Tree", "kind": "generic_points", "level": null, "earned": 2, "spent": 1, "available": 1}]
      }
    }
  ]
}
```

- Keys inside `abilities` and `skills` are dnd5e's short keys, sorted. Proficiency lists are dnd5e trait keys followed by any custom text. `skills.*.proficiency` is 0 (none), 0.5 (half), 1 or 2 (expertise).
- `description` is the feature's text with HTML and enrichers stripped, at most 600 characters (ends with `…` when cut).
- Under `ashen_gate`, each of `professions`, `cinders` and `skill_trees` is either the list shown or `{"skipped": "<reason>"}` when that module is not installed, not active, too old to have the call, or the read failed for that character. The reads use only public module APIs (Profession Ledger `getProfessions` and `getProfessionProgress`, Cinders `cinder.list`, Skill Trees `pointsSummary`).
- Actor ids and Cinder instance ids are world-local; ids with a canonical prefix (`PROF-`, `PERK-`, tree and Cinder definition ids) are permanent.

## Cinders state (`ag-cinders-state-export/0.1`, Cinders 0.17.0)

GM-only, read-only play state from Cinders `api.exportState()` (optional: feature-detect it). General Manager 0.97.0 writes it as `world-backup/cinders.json` (the **Cinders instances and Strain** tick box, ticked by default) exactly as returned; it is never imported.

```json
{
  "schema_version": "ag-cinders-state-export/0.1",
  "config": {"cinders_per_character": 1, "starting_points": 1, "sockets_per_cinder": 3, "strain": {"schema": "ag-strain-config/0.1", "backfire_schedule": [0, 5, 10], "guarantee_at": 10}},
  "cinders": [
    {
      "instance_id": "(world-local id)", "definition_id": "MUT-TEST-EMBER", "name": "[TEST] Ember Cinder", "status": "bound",
      "bearer": {"actor_id": "(world-local id)", "actor_name": "[TEST] Hero"}, "last_bearer": null,
      "points": {"awarded": 4, "unspent": 2, "grants": [{"key": "initial", "amount": 1}]},
      "unlocked_node_ids": ["NODE-TEST-A"], "powers": [{"power_id": "POWER-TEST", "node_id": "NODE-TEST-A"}], "enhancements": [],
      "art": {"own": null, "own_stages": null, "stage_hold": null, "stage": {"number": 1, "held": false}},
      "sockets": {"count": 2, "locked": false, "attached": [{"slot": 0, "item_id": "(world-local id)", "source_id": "ITEM-TEST-GEM", "item_name": "[TEST] Gem"}]}
    }
  ],
  "stage_art": [{"definition_id": "MUT-TEST-EMBER", "stages": [{"art": "art/ember-1.webp", "at": 0}, {"art": "art/ember-2.webp", "at": 3}]}],
  "strain": [{"actor_id": "(world-local id)", "actor_name": "[TEST] Hero", "value": 3, "band": {"label": "Band 2", "from": 3, "to": 4}, "history_length": 1}]
}
```

- `status` is `bound`, `unbound` or `lost` (a lost Cinder has no `bearer`). `powers`, `enhancements` and `points.unspent` are read from the bearer's character, so they are empty or `null` for a Cinder nobody bears. Strain history keeps its last 30 entries on the character; only the count is exported. `strain` lists only characters with Strain above 0 or a history.
- `config.strain` is the full Strain config in force (band names, Backfire schedule, rest recovery). Actor and instance ids are world-local; `definition_id` and the ids of powers, nodes and items are permanent.
- Rows are sorted. No timestamps (registry and socket times, user ids and operation ids are left out) and no definition text.
