# Sidebar folder convention

One rule for every Ashen Gate module that puts documents in a Foundry sidebar: **everything sits under one top-level
`Ashen Gate` folder, and nothing sits loose at the top level.** Foundry folders belong to one document type, so there is
one `Ashen Gate` folder per type (Journal, Item, Actor, ...). Each module files its own documents in a subfolder.

```
Journal sidebar                         Actor sidebar                Item sidebar
Ashen Gate                              Ashen Gate                   Ashen Gate
  Factions Data   (Renown)                Party   (Party Stash)        Backups
  Shops           (Utilities)              Backups                       Renown Rewards
  Locations       (Locations)                (level backups)             Quest Rewards
  Quests / Quest Log, Character Notes, GM Source, Archives, Assignments, Game Journal
  Professions     (Profession Ledger)
  Skill Trees  Cinders  Headquarters  Character Hub
  Backups         (snapshots; GM only, sorted last)
```

Manager's imported content already uses `Ashen Gate/...` paths (`Ashen Gate/Cinders/...`, `Ashen Gate/Professions/...`),
so those land in the same root, and a module that uses the same area name shares the folder.

## Rules

1. **Root.** `Ashen Gate`, per document type. Look it up by type + name + parent; create it only if missing. Never duplicate it.
2. **Area folder.** `Ashen Gate / <Area>` holds that module's documents: its player views and its GM-only state. Area names are
   plain words with no em dash (`Factions Data`, not `Ashen Gate — Factions Data`).
3. **Backups.** `Ashen Gate / Backups` holds safety copies only (import snapshots, refresh snapshots, level backups, held
   copies of rewards). Everything in it is GM-only. It is created with a manual sort position at the end of its parent.
4. **Players.** Foundry shows a folder to a player only when they can see something inside it (or below it). GM-only
   documents therefore never reveal their folder. Folder ownership is never set. Moving a document changes only its `folder`.
5. **Found by flag, never by name.** A module moves or looks up a document by its own flags. A document the GM filed somewhere
   else is left where it is.
6. **Nothing is deleted.** Old folders (`Ashen Gate — Factions Data`, `Ashen Gate Rewards (Renown)`, `Ashen Gate / Level backups`,
   `Ashen Gate Rewards (Quest Log)`) stay after their documents move. The GM can delete the empty ones.

## Shared helper

`ag-folders.mjs` is a small file with no imports. An identical copy ships in each module that creates world documents (like
`ag-dialogs.mjs`); `scripts/check.mjs` fails if the copies differ. A module still works without any other module, including Manager.

| Function | What it does |
|---|---|
| `ensureFolderPath(type, names)` | Finds or creates each level. GM only creates; anyone else gets a lookup (null when missing). Calls from several modules at once share one lock, and the result is re-checked after the create; if a second GM client created the same folder in the same moment, every client picks the lowest id. A loser is left as an empty folder (nothing is deleted). |
| `folderOrNull` / `folderIdOrNull` | Same, but never throws: a folder problem must not stop a module saving. The document is made loose and the next migration files it. |
| `findFolderPath(type, names)` | Lookup only. |
| `nestDocuments({type, docs, plan, legacyIds, update})` | Moves the module's own documents (`plan(doc)` returns a path, or null when the document is not the module's) that are loose or in the module's old default folder. Anything in another folder is left. Writes only `{_id, folder}`. |
| `isMigrationGM()` | True on the active GM client only. |
| `areaPath(area)`, `backupsPath(sub)` | `['Ashen Gate', area]`, `['Ashen Gate', 'Backups', sub]`. |

Each module has a `folder-nesting.mjs` with its own paths, its `plan` (by its flags) and `migrateFolders()`. The migration runs on
`ready` on the active GM client, once per world: the module's `folderNesting` world setting (`config: false`) records `'1'` when it
finishes, and a failure leaves it unset so the next login tries again. It is safe to run again: documents already in place are skipped.

## Audit (before this change)

"Players see it" means a player can open the document; the folder then shows for that player.

| Module | Document | Folder before | Folder made by | Players see it? | Folder after |
|---|---|---|---|---|---|
| Renown | Journals: faction and deity definitions, `Faction State`, `Factions GM Folder Catalog` | `Ashen Gate — Factions Data` (top level, flagged `storageFolder`) | Renown | No (ownership None) | Ashen Gate / Factions Data |
| Renown | Journal `Factions Player View <user>` | same | Renown | Yes, that player only | Ashen Gate / Factions Data |
| Renown | Journal `Renown Snapshot ...` | same | Renown | No | Ashen Gate / Backups |
| Renown | Items: held reward copies | `Ashen Gate Rewards (Renown)` (top level, Item) | Renown | No | Ashen Gate / Backups / Renown Rewards |
| Utilities | Journal `Utilities Shops (GM Data)` | none (loose) | n/a | No | Ashen Gate / Shops |
| Utilities | Journal `Utilities Shops (Player View)` | none (loose) | n/a | Yes (Observer) | Ashen Gate / Shops |
| Utilities | Actor `Party` (found by its flag; was `Ashen Gate | Party Stash` before 0.34.0) | none (loose) | n/a | Yes when the stash is on | Ashen Gate / Party (Actor) |
| Quest Log | Journals: `Quest Log`, `Quest Character Notes`, `Quest GM`, `Quest Notes Archive`, `Quest Assignment`, `Game Journal` | `Ashen Gate / Quests / <kind>` | Quest Log | Quest Log and notes: per audience. The rest: No | unchanged (lookup is now race-safe) |
| Quest Log | Items: held reward copies | `Ashen Gate Rewards (Quest Log)` (top level, Item) | Quest Log | No | Ashen Gate / Backups / Quest Rewards |
| Locations | Journals `Locations (GM Data)`, `(Party Notes)`, `(Player View)`, `(Shared Notes)` | `Ashen Gate / Locations` | Locations | GM Data and Party Notes: No. Player View and Shared Notes: Yes | unchanged (lookup is now race-safe) |
| Headquarters | Journal `Headquarters Private Campaign State` | none (loose) | n/a | No | Ashen Gate / Headquarters |
| Cinders | Journal `[AG] Cinders GM Records` | none (loose) | n/a | No | Ashen Gate / Cinders |
| Skill Trees | Journal `[AG] Skill Trees GM Definitions` | none (loose) | n/a | No | Ashen Gate / Skill Trees |
| Profession Ledger | Journal `Profession Ledger (GM Data)` | none (loose) | n/a | No | Ashen Gate / Professions |
| Profession Ledger | Journals `Profession Refresh: <name> (<time>)` | none (loose) | n/a | No | Ashen Gate / Backups |
| Character Hub | Journal `Ashen Gate Hub Journey (GM only)` | none (loose) | n/a | No | Ashen Gate / Character Hub |
| Character Hub | Actors `<name> - level X` (level backups) | `Ashen Gate / Level backups` (Actor) | Hub | No | Ashen Gate / Backups (Actor) |
| Manager | Anything imported with a `folder_path` | `Ashen Gate/...` as the package says | Manager | Per package | unchanged |
| Manager | Imports with no `folder_path` | `Ashen Gate — Imported Items / Journals / Actors / Roll Tables / Macros` (top level) | Manager | Per package | unchanged, see "Not changed" |
| Manager | Archived Items and Journals | `Ashen Gate — Archive Items / Journals` (top level) | Manager | Per package | unchanged, see "Not changed" |

Developer Tools fixtures (Utilities `AG TEST`, Skill Trees QA fixture, Headquarters test records) create temporary test documents
and remove them again; they are not part of the migration. Renown's fixture now files under the same Factions Data folder.

## Not changed

- **Manager's fallback folders.** `Ashen Gate — Imported ...` and `Ashen Gate — Archive ...` are still top level. Packages normally carry
  a `folder_path` under `Ashen Gate/`, so these are the exception. Moving them would change how Manager finds and restores documents,
  so it is a separate decision.
- **Sort order.** Backups gets a manual sort position at the end. If the sidebar is set to alphabetical order, Foundry sorts it by name.
