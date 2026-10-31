# World backup to GitHub (General Manager 0.90.0)

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

The content files are formats the content pack's reconcile script reads. **`standings.json` is play state** and deliberately uses its own schema string: the reconcile lists unknown formats and skips them, so standings are never merged into content. Skipped with the reason "update Renown" when Renown is missing, off or older than 0.27.0.

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
