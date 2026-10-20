# Gap table: what cannot be imported yet

Copied from §15 of systems/schemas/GPT_BUILD_REFERENCE.md (checked against foundry main: Manager 0.35.0, Locations 1.15.1, Profession Ledger 0.21.0, Renown 0.11.1, Character Hub 0.9.0, 2026-10-20).

Do not invent formats for these; ask Robb. A Build chat will add support when he asks for it. (Refreshed 2026-10-20 against Manager 0.35.0, Locations 1.15.1, Ledger 0.21.0, Renown 0.11.1, Character Hub 0.9.0.)

| Object kind | Owning module | Import path today | Missing support |
|---|---|---|---|
| Deity favour, Renown standing, who discovered a faction/deity | Renown | `starting_state` on **new** factions/deities only | no way to set standing or discovery for an existing faction/deity by file |
| Changes to an existing faction or deity | Renown | import is additive (existing ids kept) | no update on re-import; edit in the Renown UI |
| NPC Codex reveals, "learned" text, GM notes | Manager (Codex) | set in play; restore from a Codex export (§10.4) | not importable from a package (only `codex.default_reveal` as a starting point) |
| NPC Codex text changes for an NPC already in the world | Manager | Update existing actors **and** a changed name/img/token/items | a text-only change (`role`, `wants`, `codex.links`…) is not applied to an existing NPC |
| Route journeys, travel behaviours, discovery after creation | Locations | Route records import definitions only (§4A) | play state, not importable |
| Travel rules driven by behaviours (pace changing distance, watches affecting hazards) | Locations | behaviours are tracking only | no rules engine; design decision for Robb |
| Companions | Character Hub (companion flags) | Actor (`npc`/`character`) via Manager, create-only | no companion record; companions are linked in play |
| Hireling roster / assignments | Headquarters | `Hireling` / `HirelingPerk` definitions as Items via Manager | personnel and assignments are campaign state, not importable |
| Scene mood stack and favourites on a scene | Manager | applied in play | play state; the moods file holds presets only and is not in ZIP bundles |
| Organize rules, crosswalk baseline, scene moods file | Manager / Ledger | their own Import buttons (§10.1–10.3) | not through the Import tab or a ZIP |
| Scenes, Playlists, Cards, Adventures | — | none | Manager imports only Item, JournalEntry, Actor, RollTable, Macro |
| Location pins on maps, route drawings | Locations | GM uses Place on Scene / draws the route | scene placement is world-local, not importable |
| Item Active Effects or other modules' Item flags | — | not allowed in Item `data` | cannot author item effects (Actors may carry `effects`) |
| Journal image/PDF/video pages; changed pages on re-import | Manager | text pages only; page changes blocked | no non-text pages, no page updates |
| Updated Facility definitions | Headquarters | import is additive (existing ids kept) | no update on re-import |
| Updated Roll Tables / Macros | Manager | create-only | no update on re-import |
| Starting quest state (Active, revealed objectives) | Quest Log | GM sets after import | cannot import status or reveals |
| Character profession levels, XP, known recipes; Skill Tree purchases | Ledger / Skill Trees | Ledger Assign tab adds Profession Items; XP by GM | no progression seeding |
| HQ layout, guild rank, stash, party purse | Headquarters / Utilities | none | campaign state |
| Re-importing a world export (`ag-world-export/0.1`) | Manager | export only | not an import format |
| `access.toolMustBePresent`, Profession `progression`, `starting_recipe_ids`, Recipe `starting` | Ledger | stored with the definition | not enforced or used yet |
| `folder_path` deeper than 4 levels | Manager | passes validation (limit 8) | fails at Apply when Foundry refuses the 5th level: keep ≤ 4 |
