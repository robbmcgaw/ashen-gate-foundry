# World backup to GitHub (General Manager 0.93.0)

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

The edits file also carries, from Manager 0.96.0, an additive top-level `npc_codex` array (written with the Edited Actors tick): the NPC Codex layer per NPC with saved state, `{id, name, pack_name, status, edits, learned, notes, links, discovery, reveals, actor_names}` (see `docs/npc-codex-schema.md`). The schema string stays `ag-world-edits/0.1`; the layer is world-local play and edit state, so a reader that merges content should ignore `npc_codex` unless it knows it.

The content files are formats the content pack's reconcile script reads. **`standings.json` and `party.json` are play state** and deliberately use their own schema strings: the reconcile lists unknown formats and skips them, so they are never merged into content. Skipped with the reason "update Renown" when Renown is missing, off or older than 0.27.0.

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
