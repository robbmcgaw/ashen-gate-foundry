# Playtest data (0.6.1)

Synthetic data for testing every shipped feature from imports. Everything is `[TEST]`-named placeholder content with no rules effects. Not canon.

Five generated files (`node scripts/build-test-pack.mjs`; never hand-edit them). Raw links: `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/test-fixtures/playtest/<file>` (Save As).

| File | Imported by |
|---|---|
| `AG_Playtest_Pack_0.6.1.json` | General Manager → Import (also Locations → GM Setup → Import JSON, Locations only) |
| `AG_Playtest_Quests_0.6.1.json` | Quest Log → GM Setup → Advanced → **Import JSON** |
| `AG_Playtest_SkillTrees_0.6.1.json` | General Manager → Import (hands it to Skill Trees; needs Skill Trees 0.8.0) |
| `AG_Playtest_HQ_Facilities_0.6.1.json` | Headquarters → GM Setup → Facility Catalog → **Import Facility Definitions JSON** |
| `AG_Playtest_Factions_0.6.1.json` | Factions & Renown → GM Setup → Organizations and folders → **Import JSON** (needs Factions 0.7.0) |

## Import order

1. **Manager pack first.** Turn "Include drafts" off for a player-facing test (on to also get the draft recipe/item). Apply. Items, Journals, Actors, the Roll Table and the **`[TEST] Link test data` macro** are created; the 8 `LOC-PT-*` locations go to Locations in the same run (Locations must be active). Re-import keeps existing locations (tick "Update existing locations" to replace them).
2. **Quests**, **Skill Trees**, **HQ facilities**: any order, after step 1.
3. **Factions**: after step 1 (the three test characters must exist for personal Renown). In the preview each faction reads NEW or SKIP; Import. Re-running is safe: factions already in the world are skipped whole and their Renown is never changed.
4. **Run the macro**: open the Macros directory (Macro Directory button by the hotbar) → folder `Ashen Gate/Playtest/Macros` → `[TEST] Link test data` → click it (GM only). It whispers a report to you. Safe to run again.

## What is covered

| Feature | Arrives by | Left for you |
|---|---|---|
| Professions, materials, recipes, crafted items, give-away recipe items, perks, stash items | Manager pack | none |
| Test characters (tools, professions, XP, recipes, statuses) | Manager pack | give your test player Owner (hand step 1) |
| Journals, hireling + perk | Manager pack | none |
| Locations: Region point-crawl, nesting, states, conditions, gathering nodes, loot statuses, details | Manager pack | none |
| **Roll Table** `[TEST] Marsh Finds` (text results) | Manager pack | none |
| **Roll Table document results** (3 Items + the Marsh handout Journal) | **Link macro** adds results 7-10, formula becomes `1d10` | none |
| **Location loot links** (5 loot entries → pack Items) and the chapel's note link (→ Journal) | **Link macro**, through the Locations API | none |
| Quest Log: quests, work order, contract, objectives (player / reveal-gated / GM-only) | Quests file | statuses and reveals (hand step 2) |
| Skill Trees: profession tree + generic tree, every node a pack perk | Skill Trees file (after the pack) | award points, publish (hand step 6) |
| Headquarters facility catalog | HQ file | activation, unlock, acquire (hand step 5) |
| **Factions**: revealed, hidden and personal-only factions with Renown and ranks; links to pack quests | Factions file | none |
| Party Notes, Party Stash, Group Check | not importable (campaign state) | hand steps 3, 4 |

## What is in the Manager pack

- **4 professions, 10 materials, 12 recipes + crafted items, 4 give-away recipe items** (Glassbloom Elixir needs the *[TEST] Alchemy Laboratory* workstation; Draft Draught is a draft; GM-only Resin is GM-only; Mistveil Tonic uses the profession default tool). **`[TEST] Enchanting`** (`PROF-PT-ENCHANTING`) is the Enchanting profession: its default check is the Arcana *skill* (Ledger GM Setup), nothing is gated behind a skill proficiency. Its recipes: Warding Charm (no tool: rolls Arcana), Jeweled Ward Ring and Gemset Pendant (need Jeweler's Tools), Carved Ward Totem (needs Woodcarver's Tools; a give-away recipe item).
- **8 perks**: `PERK-PT-ALCH-*` (one GM-only) for the Alchemy profession tree, and `PERK-PT-GEN-*` (Foundation, Left Path, Right Path, Final Step; Final Step costs 2 points) for the generic points tree.
- **4 ordinary stash items** (`ITEM-PT-STASH-*`) in `Ashen Gate/Playtest/Items/Stash`.
- **3 test characters** in `Ashen Gate/Playtest/Characters`:
  - `[TEST] Belwar`: Alchemist's Supplies, **Jeweler's Tools, Enchanting (0 XP)**, knows Warding Charm and Jeweled Ward Ring, holds a Carved Ward Totem recipe item (not learned; no Woodcarver's Tools, so it shows the missing-tool warning), Arcane Dust/Gem Chips/Ashwood Planks, Alchemy (10 XP = level 2), Ember Salve recipe item (not learned), Emberroot/Palemoss/Glassbloom, Poisoned + a custom status, 2 stash items.
  - `[TEST] Kessa`: Smith's Tools, Blacksmithing (5 XP), already knows Iron Hinge Set, holds a Test Dagger recipe item ×2, ore/coal/leather, Prone + a custom status, 2 stash items.
  - `[TEST] Orin`: Herbalism Kit, Herbalism, few materials (shows missing-ingredient states), 3 stash items.
- **3 Journals**: `[TEST] Greenhollow — Field Notes` (the chapel's note links to it), `[TEST] Marsh Crossing — Handout` (becomes a table result), and a GM-only chapel note.
- **1 Roll Table** `[TEST] Marsh Finds` (6 text results) and **1 macro** `[TEST] Link test data` (GM-only).
- **1 hireling + perk** (`HIRE-PT-SMITH`, `HPERK-PT-WORKING`) as world Items for Headquarters.
- **8 locations**: Greenhollow, Cinder Quarry, Ash Hollow (unrevealed), plus the Hollowmere point-crawl: a Region with conditions (one GM-only) > Drowned Chapel (overrides two Region conditions; gathering nodes: renewable, finite, exhausted, GM-only; loot: available/discovered/taken/plain/GM-only) > Chapel Crypt (grandchild room, loot, custom detail block). Also a **Hidden** Sunken Cache (inside the chapel) and an **Unidentified** Lantern Mound (inside the Region, label + teaser).

## What is in the Factions file

Three factions (`FACTION-PT-*`), each linked to pack quests (Factions links to Quest Log objectives; it has no link to Locations):

| Faction | State after import | Why |
|---|---|---|
| `[TEST] Lantern Wardens` | **Revealed to the party.** Group Renown 7 = **Trusted**. Belwar: personal 4 = Recognized; Kessa: personal 1. Two info entries (one unlocks at group Renown 3), group + personal rewards (one-time, repeatable service, passive). Links `QUEST-PT-MARSH-LIGHTS`, `QUEST-PT-GREENHOLLOW-HERBS`. | Revealed with ranks and rewards |
| `[TEST] Ash Brokers` | **Hidden** (not revealed, no placeholder). Group Renown 2. Links `ORDER-PT-HINGE-ORDER`. | Players must not see it |
| `[TEST] Mire Ferrymen` | Party sees an **"Undiscovered Faction"** placeholder; only Orin has discovered it, personal Renown 3 = Recognized. Links `CONTRACT-PT-ESCORT`. | Personal-only discovery |

Rank names come from the standard ladder: 0 Unproven, 3 Recognized, 6 Trusted, 10 Proven, 15 Esteemed.

## What the Factions import does (and never does)

- Adds only factions whose id is **not** in the world. An existing id is skipped whole: definition, discovery and Renown stay as they are. There is no overwrite option.
- `starting_state` in the file (party discovery, group Renown events, per-character discovery and Renown matched by character **name**) is applied to the new factions only. A character name that is not in the world is skipped and named in the result message; import the Manager pack and run the import again to get them (the factions already added are then skipped, so add the missing Renown by hand or delete the `[TEST]` factions first).
- GM only; the button, `api.importFactions` and `api.previewFactionsImport` all reject players.
- To retest, delete the three `[TEST]` factions in Factions (or their Journals in the folder `Ashen Gate — Factions Data`) and import again.

## What the Link macro does (and never does)

- Finds the pack's Items and Journals by their permanent ids (Manager's binding) or, if unbound, by their exact `[TEST]` name. Anything not named `[TEST] …` is ignored; two matches means skipped and reported.
- **Roll table:** adds document results for `ITEM-PT-TEST-DAGGER`, `ITEM-PT-MISTVEIL-TONIC`, `ITEM-PT-IRON-HINGE-SET` and `JRN-PT-MARSH-HANDOUT` as results 7-10, and changes the formula from `1d6` to `1d10` only if it still reads `1d6`. A result already there is not added twice.
- **Locations:** uses the Locations public API (`listLocations`, `saveLocation`, `publishLocation`; no new API was needed). For each `LOC-PT-*` location it links a loot entry (or note) that names a pack id and has no link yet. A link you set yourself is never replaced. A location that was published with nothing waiting is published again so players see the links; a Hidden location (Sunken Cache) or one with other unpublished edits is saved only, and the report says so.
- **Ledger party:** if Profession Ledger is active and its party is empty, sets the party to `[TEST] Belwar`, `[TEST] Kessa` and `[TEST] Orin` (the same world setting as Ledger > GM Setup > tick the characters). A party you already chose is left alone. Gathering cannot start without a party.
- Needs Locations active for the Locations half; without it the table half still runs.

## What you still do by hand

0. **Gathering needs, in this order:** the Manager pack imported (materials must be world Items: approved, player-visible), a Ledger party (the link macro sets it, or Ledger > GM Setup > tick the characters > Save Changes), Locations active, a location revealed to players, and Owner on a character for the player. Every missing piece shows as a one-line reason with its fix in the Ledger Gathering tab.

1. **Player accounts:** Actors directory → each `[TEST]` character → Ownership → give your test player Owner. Import cannot assign users.
2. **Quest states:** quests import as Hidden. In Quest Log → GM Setup set statuses/reveal, and mark `[TEST] Smoke at Cinder Quarry` **Completed** (status is campaign state, not importable): Quest Log → **GM** tab → select that quest → *Campaign status* = **Completed** → tick *Reveal Quest to selected audience* → **Save Progress & Reveal**. Objective reveal and progress are set in the same panel.
3. **Party Notes** are campaign state: open a visible location as a player → Party Notes → Edit.
4. **Party Stash:** Utilities → Party Inventory → Create Party Stash → Turn On for Players → drag stash items in. **Group Check:** Utilities → Group Checks (use the three characters).
5. **Headquarters activation.** It does **not** need an `HQ-*` record: activation only checks the id formats, and the pack has none. Open Headquarters (not activated) → fill the form: **Guildhall HQ ID** `HQ-PT-GUILD`, **Location ID** `LOC-PT-GREENHOLLOW`, **Campaign key** `playtest`, **Guild key** `primary` → **Activate Guildhall**. Then Facility Catalog → Unlock → Acquire; Hirelings → add `[TEST] Hireling Smith` from imported definitions.
6. **Skill Trees:** import the pack first (the trees name its `PERK-PT-*` perks). Skill Trees → GM Setup → **Publish Player View**. Skill Trees tab → tree `[TEST] Generic Points` → pick a character → **Award Points** (e.g. 4). As that character's player: select `[TEST] Foundation` → **Unlock**; the perk appears on the sheet's Features. GM: select it → **Refund** removes it again. Profession-tree perk picks are the Ledger's job (Skill Trees shows them read-only).
7. **Unsafe Document Result case** (Utilities): its own console fixture (`modules/ashen-gate-utilities/fixtures/SETUP_AND_RESET.md`) creates that table.

## Regenerating

Edit `scripts/build-test-pack.mjs` (and `scripts/playtest-link-macro.js` for the macro), bump `PACK_VERSION`, run `node scripts/build-test-pack.mjs`, commit the new files and delete the old ones. `node scripts/check.mjs` fails if a file is out of date, an id is duplicated, or a reference does not resolve.
