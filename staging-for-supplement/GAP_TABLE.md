# Gap table: what Manager cannot import yet

Copied from §15 of systems/schemas/GPT_BUILD_REFERENCE.md (checked against foundry main, 2026-10-20).


Do not invent formats for these; ask Robb. A Build chat will add support when he asks for it.

| Object kind | Owning module | Import path today | Missing support |
|---|---|---|---|
| Point-crawl routes (legs between locations: distance, travel time, danger, hidden routes) | Locations (being built in a separate chat) | none; only `parentLocationId` nesting and `related` links | no route record |
| Pantheon standing / deity favour | none | can be approximated as a Faction with Renown | no deity or pantheon record, no standing type distinct from Renown |
| NPC codex (what the party knows about an NPC, revealed field by field) | none | NPC Actor + Journal via Manager | no codex record; per-field reveals exist only for Factions |
| Companions | none | Actor (`npc`/`character`) via Manager, create-only | no companion record, ownership or progression |
| Hireling roster / assignments | Headquarters | `Hireling` / `HirelingPerk` definitions as Items via Manager | personnel and assignments are campaign state, not importable |
| Scene mood presets | Manager | Scenes tab or `api.scenes.savePreset` | no file import, not in ZIP bundles |
| Organize rules | Manager | Organize tab → Import (JSON) | not through the Import tab or a ZIP |
| Scenes, Playlists, Cards, Adventures | — | none | Manager imports only Item, JournalEntry, Actor, RollTable, Macro |
| Location pins on maps | Locations | GM uses Place on Scene | scene placement is world-local, not importable |
| Item Active Effects or other modules' Item flags | — | not allowed in Item `data` | cannot author item effects (Actors may carry `effects`) |
| Journal image/PDF/video pages; changed pages on re-import | Manager | text pages only; page changes blocked | no non-text pages, no page updates |
| Updated Facility / Faction definitions | Headquarters / Factions | import is additive (existing ids kept) | no update on re-import |
| Updated Roll Tables / Macros | Manager | create-only | no update on re-import |
| Starting quest state (Active, revealed objectives) | Quest Log | GM sets after import | cannot import status or reveals |
| Character profession levels, XP, known recipes; Skill Tree purchases | Ledger / Skill Trees | Ledger Assign tab adds Profession Items; XP by GM | no progression seeding |
| HQ layout, guild rank, stash, party purse | Headquarters / Utilities | none | campaign state |
| Re-importing a world export (`ag-world-export/0.1`) | Manager | export only | not an import format |
| `access.toolMustBePresent`, Profession `progression`, `starting_recipe_ids`, Recipe `starting` | Ledger | stored with the definition | not enforced or used yet |
| `folder_path` deeper than 4 levels | Manager | passes validation (limit 8) | fails at Apply when Foundry refuses the 5th level: keep ≤ 4 |
