# ID and link pickers audit (2026-10-24)

Robb: "IDs should be autopopulated for me, and if it's linking, like the location, it should also be a dropdown or something, not require me to go find IDs."

Rule applied (see `docs/ui-ux-guidelines.md` section 17b, kit 2.3.0):
- A record's **own id** is made from its name with the right prefix, unique (`-2`, `-3`), never changed after creation, shown only in a GM-only Details fold, read-only. "Advanced: set id" only when creating, checked for prefix, characters and uniqueness.
- A **reference to another record** is a searchable picker by name (kind hint, grouped, None), filtered to the valid kinds, GM-only records only for the GM, storing the id under the hood. A broken link reads `Missing: <last known name>` with Replace…, never an id.

Method: read every GM editor/form in the ten modules for inputs, textareas, selects, prompts and dialogs that take or show an id. "Done" means it already meets the rule; "Gap" is what this work changes. Mocked-Foundry reading of the source; not a click-through of the live UI.

## Findings

| Module | Screen | Field | Takes now | Should become | Status |
|---|---|---|---|---|---|
| Quest Log | Quests > editor > Details | Permanent ID (own) | Typed text box | Made from the title, read-only; Advanced: set ID on create | Done (0.23.0, #354) |
| Quest Log | Editor > Details | Related location IDs, Public location IDs | One id per line, typed | Locations pickers by name | Done (0.23.0) |
| Quest Log | Editor (did not exist) | Quest giver (NPC), Faction, Prerequisite quests | Only editable in the source JSON fold | Pickers in a new Links section (typed refs) | Done (0.23.0) |
| Quest Log | Editor > Rewards | Reward items | Drag and drop an Item (no id typed) | n/a | Already fine |
| Quest Log | GM Setup | Compendium pack IDs | Typed Foundry pack ids | Foundry pack ids, not Ashen Gate ids; left as is | Left (not a permanent id) |
| Locations | Editor > Place | Location id (own) | Made from the name (`makeLocationId`), never typed, never changed | n/a | Already fine |
| Locations | Editor > Place | Inside (parent) | `<select>` by name; a deleted parent reads "Deleted location (deleted)" | Keep; reword the missing case to the kit's `Missing: <name>` | Small gap |
| Locations | Editor > Links | Related locations, quests, scenes, roll tables, materials | `<select>` by name, id in the option value; unknown material reads "Unknown material" | Already name pickers (native select, no type-ahead) | Already fine |
| Locations | Routes | Route endpoints | Routes were retired in 0.20.0 (converted to locations) | n/a | n/a |
| Locations | Editor | Linked NPCs / shops | No such field exists | n/a | n/a |
| Utilities | Shops > editor | Shop id (own) | Made from the name (`shopIdFromName`, `-2`...), never typed | n/a | Already fine |
| Utilities | Merchant lists | List id (own) | Made from the name; Add is a name `<select>` | n/a | Already fine |
| Utilities | Shop / service / list editor | Settlement | Name `<select>` of Locations settlements; a place that is not a settlement or is gone falls back to the raw id when the name cannot be read | Show `Missing: <last known name>` with Replace…, never the id | Gap |
| Utilities | Shop lines | Items | Drag/drop and keyboard add by item name | n/a | Already fine |
| Renown (Factions) | Faction > Links | Quest, work order or contract id | Typed or pasted id ("Paste the id here") | Quest picker (all three kinds) by name, Replace… when gone | Gap |
| Renown | New faction / deity | Faction and deity id (own) | Made automatically but random (`FACTION-<random>`) and never shown | Leave: auto, permanent, hidden. Name-based ids would only help someone reading JSON | Left |
| Headquarters | Activation (GM, first run) | Guildhall record, Location record | Two "Paste the ... reference" text boxes | Pickers: Guildhall records from the source resolver, Locations from Locations | Gap |
| Headquarters | Activation | Campaign key, Guild key | Typed keys (`my-campaign`, `primary`) | Keys are internal labels: fill from the campaign/world name and offer Advanced | Gap (small) |
| Headquarters | Facilities, Hirelings | Facility, hireling, room, station | Pickers and drag/drop by name; ids only in a GM-only Details disclosure | n/a | Already fine |
| Skill Trees | Create tree | Linked profession or mutation | Typed or pasted source id ("Paste the source id from General Manager") | Picker over the imported Profession/Mutation records, filtered to the provider kind | Gap |
| Skill Trees | Tree id, node ids | Own ids | Generated (`LOCAL-NODE-<random>`), never typed | n/a | Already fine |
| Skill Trees | Node editor | Prerequisites, excludes, assign perk | Name selects/checkboxes | n/a | Already fine |
| Profession Ledger | GM Setup > Gathering nodes > new node | Id (permanent) | Optional typed text box beside the name ("Made from the name if left blank") | Not an input: made from the name, read-only in Details; Advanced: set id at creation | Gap |
| Profession Ledger | Nodes, recipes, materials | Material, professions, tools | Name selects/checkboxes | n/a | Already fine |
| Cinders | Strain / stage editors, GM Setup | n/a | No id or reference fields (numbers, names, art paths) | n/a | No gap |
| Character Hub | GM Setup / Configure | n/a | No id or reference fields | n/a | No gap |
| General Manager | Scenes > mood editor | Mood id (own) | Typed ("e.g. foggy-dawn") for a new mood | Made from the mood name, read-only | Gap |
| General Manager | Items, Browse, Records, Core links | Records by permanent id | Read-only views; ids only in GM Details | n/a | No gap |
| General Manager | Pull from GitHub | Repository, branch, token | Typed on purpose (not Ashen Gate ids) | n/a | n/a |

## Pull requests

One per real gap, in this order, each from `main` (not stacked): Renown, Headquarters, Skill Trees, Profession Ledger, Utilities, General Manager, Locations. Quest Log is done. Cinders and Character Hub have no gap, so there is no PR for them.

Not done here, on purpose: the Foundry compendium pack ids in Quest Log GM Setup (they are Foundry ids, not permanent Ashen Gate ids), and the random hidden ids of factions, deities and tree nodes (never typed, never shown).
