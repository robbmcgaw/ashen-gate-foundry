## 0.32.0 — 2026-10-20

- **Library layout.** Library is now a list beside a detail pane, with an icon rail (like the Character Hub) for **Records**, **Check library**, **Export and backup** and **Adopt and tag**, so these no longer stack down one long page.
- **Records:** one search box, system chips with counts, and *More filters* (status, package, show archived). Rows are grouped by system (Unclassified / Shared last) and show name, ID, status, version and edit count at one height. Click a row for its details on the right; nothing is clipped, numbers line up.
- The seven command buttons are one **Actions** menu that appears when records are ticked. Archive, Restore and Delete confirmations now name the action on their button; the final Delete dialog lists the records it will delete.
- Narrow windows: the detail pane moves under the list, and the rail goes across the top.
- Layout only: every Library action, setting and API works as before. No saved-data changes.

## 0.31.0 — 2026-10-20

- **Organize: 2014 and SRD 5.1 count as Core.** A non-Ashen-Gate Item now goes under **Core 5.5e** when it was imported by Plutonium, or its `system.source` says 2024 (as before) **or 2014 core**: rules `2014`, book PHB / DMG / MM (legacy codes, `PHB'14` too) or SRD 5.1. Items with no source, or a third-party or homebrew source, still go under **Homebrew**. Run Organize → Preview: 2014 / SRD 5.1 items an earlier run filed under Homebrew show as moves back to Core 5.5e.
- **Core Links is unchanged:** it still only links and adopts 2024 content; 2014 and SRD 5.1 items are never candidates. The two tests are now separate in code (`isCoreSource` for Organize, `isSource2024` for Core Links; `isSourceTagged` is gone).
- The `sourceTagged` match key keeps its name so saved custom rules still work; it now means *core source*. `docs/organize-rules.md` updated. No saved-data changes.

## 0.30.0 — 2026-10-20

- **Organize: Homebrew folder.** In the default rules, a non-Ashen-Gate Item goes under **Core 5.5e** only when it is *source-tagged*: imported by Plutonium (`flags.plutonium`) or marked 2024 in `system.source` (rules `2024`, or book PHB'24 / DMG'24 / MM'24 / SRD 5.2, `XPHB`-style names too). Every other non-Ashen-Gate Item goes under a new top-level **Homebrew** tree with the same sub-folders (`Homebrew/Spells/Level 3`, `Homebrew/Items/Rare Magic`, `Homebrew/Items/Weapons`, …). Ashen Gate records and Actor/Journal rules are unchanged.
- New rule match key `sourceTagged` (true/false) for custom rules. **Saved custom rules are untouched**; *Reset rules to defaults* picks up the new ones. Items an earlier run filed under Core 5.5e that are not source-tagged show in Preview as moves to Homebrew.
- The Organize card says which items go to Core 5.5e and which to Homebrew.
- **Core Links** uses the same source-tagged test for world Items and world compendiums, so a Plutonium item whose book Manager doesn't recognise is now a candidate too. 2014 content is still never a candidate.
- Rule format documented in `docs/organize-rules.md`. No saved-data changes.

## 0.29.0 — 2026-10-20

- **Renown deities** (Renown 0.11.0 or later). A Renown file with `schema_version` `ag-factions-source-export/0.4` (factions and deities in `definitions[]`) is recognised and handed to Renown unchanged, as 0.3 files are.
- **Import preview:** each row of a Renown file shows *Deity* or *Faction*, as Renown reports it. An older Renown that does not report it shows *Faction*, as before.
- **World export** has a new `deities` section with each deity's definition, read from Renown's `getDeities()`. With an older Renown it is listed as not available. The `factions` section is unchanged.
- No saved-data changes.

## 0.28.0 — 2026-10-20

- **Renown naming.** The Factions module is now shown as **Renown** (Ashen Gate | Renown), so Manager's text follows: import results (*Renown > GM Setup (Actors sidebar launcher)*), Browse source labels and "Open it in Renown", the specialist-file handoff, the campaign-standing notice, Pre-session check rows (*Renown*, *Renown definitions*), Player access and the Browse help. Module id `ashen-gate-factions`, its API, flags, the `ag-factions-` file schema and "faction" entries are unchanged. No saved-data changes.

## 0.27.0 — 2026-10-20

- **Route records import** (needs Locations 1.10.0 or later). A Manager package can carry `entity_type: "Route"` records (point-crawl routes between locations; schema in `docs/routes-schema.md`). In the same run they go to Locations **after** the locations they join, whatever their order in the file.
- **Preview** lists each route: *create*, *update* (with *Update existing locations and routes*), *skipped* (already exists, a draft, or Locations missing/too old) or *blocked* with the reason: an endpoint that is neither in Locations nor created by this import, the same location twice, or a bad `distance_km`. Locations checks every other field on Apply; its reason for any refusal (e.g. a bad `leg_km`) is shown per record in the **Import results** panel.
- **Re-import never touches play state:** a route's discovery state, who can see it, its map drawing and any journey stay as they are, like a location's marker state.
- A record that requires a location living only in Locations (a route's endpoint) no longer fails validation as an unresolved reference.
- **ZIP bundles:** a Manager file holding only Route records is imported after the other Manager files in the ZIP, so its locations exist first.
- **Browse** and **World export** list routes (export without play state). An older Locations shows them as not available.
- The *Update existing locations* switch is now *Update existing locations and routes*. `scripts/validate-content.mjs` runs Route records through Locations' own checks. No saved-data changes.

## 0.26.0 — 2026-10-20

- **Core Links** (new GM-only tab). **Scan** checks every Ashen Gate world Item whose source data has `core_ref` against 2024 (5.5e) core items. It looks in this order: world items imported by Plutonium or marked 2024, 2024 entries in world compendiums, the GM's core sources, then the dnd5e 2024 packs. Legacy 2014 content is never used. Items without `core_ref` are never touched.
- Matches are HIGH (same name, type, and the `core_ref` book/rarity when given), MEDIUM (same name, something else differs) or LOW (similar name). Only HIGH is ticked; MEDIUM and LOW need your tick. Each row shows the source (e.g. "Plutonium world item", "dnd5e 2024 pack: …"), other candidates and a field diff.
- **Apply** (with confirmation) always stores the link (`flags.ashen-gate-manager.coreLink`: uuid, source, name, type, matched on, confidence, date) and, by default, **adopts** the core item's image and data (description included). Name, Ashen Gate id, Manager source data, folder and ownership stay. Adopt falls back to **link only** (with the reason shown) when it would change the item type or lose the stack quantity the Ledger and Utilities use; any row can be set to Link only. **Download backup** and **Undo last core link** (last 5 runs). Re-running changes nothing; a link whose core item is gone shows as **Re-link**.
- **Re-import:** an adopted item's image and data are a known local edit. The preview says "Core-linked to …: keeps the adopted core image and data" and does not overwrite, conflict or block on them; other fields (e.g. name) still update. Library's "replace from source" refuses core-adopted items until the link is undone.
- **GM Setup** tab (new): **Core sources**: automatic detection on/off, plus extra compendiums and world Item folders to treat as core sources.
- World Items only: copies in player inventories or on Actors are never touched. GM only, enforced in the API (`api.coreLinks.preview / apply / undoLast / describeSources / saveSources`). New world settings `coreSources` and `coreLinkHistory`. No migration.

## 0.25.0 — 2026-10-20

- **Organize folders** (new GM-only **Organize** tab). Files world Items, Actors and Journals (or one unlocked world compendium) into a structured folder tree, e.g. `Core 5.5e/Items/Uncommon Magic`, `Core 5.5e/Spells/Level 3`, `Ashen Gate/Professions/Apprentice/Materials`. Re-run any time: anything already in place is left alone, so a second run changes nothing.
- **Preview** shows every move grouped by destination folder with counts, the folders that would be created, and what is skipped and why (protected, keep-here, player character, your own folder, no rule). **Apply** (with confirmation) re-plans, creates missing folders and changes **only the folder** of each document; nothing is renamed, edited or deleted and no folder is ever deleted (empty folders are listed). **Download backup** saves the current folders first; **Undo last organize** puts documents back (last 5 runs kept; anything you moved by hand since is left alone).
- Two modes: **Only unfiled and misfiled** (default: unfiled documents and ones already under `Ashen Gate…`/`Core 5.5e`) or **Refile everything** (also from your own folders). **Protect folder** (inherited by sub-folders) and per-document **Keep here** are always skipped. Player characters and player-owned actors stay where they are. Locked, module and system compendiums are inspect-only.
- **Rules** are an editable first-match list (Edit as JSON, Export, Import, Reset to defaults). Ashen Gate records match on Manager's source data (kind, tier, visibility, status, id prefix); other content on dnd5e fields (item type, rarity, armor/consumable type, spell level, creature type, CR).
- **Housekeeping report** (read-only): Ashen Gate ids found more than once across the world and compendiums, and likely temporary records ([TEST] names, example_only). Nothing is changed.
- GM only, enforced in the API (`api.organize.preview / apply / undoLast / saveSchema / setFolderProtected / setKeepFolder / housekeeping`). New world settings `organizeSchema` (empty = defaults) and `organizeHistory`; new flags `organizeProtected` (Folder) and `keepFolder` (document), written only when the GM sets them. No migration.

## 0.24.0 — 2026-10-20

- **Browse** (new GM-only tab). One searchable list across world Actors, Items, Journals and Journal pages, the Ashen Gate records partner modules expose through their public APIs (Locations, Quest Log, Factions, Skill Trees with their perk nodes, Headquarters facilities, Profession Ledger materials), and compendium entries. Compendiums are read from pack indexes only (no full documents) and load when you press **Load compendiums**, then stay cached until Refresh.
- **Ashen Gate / Non-Ashen Gate / All** selector at the top. Ashen Gate = Manager-imported documents (source flag) or partner-module records; everything else (core, system, other modules) is Non-Ashen Gate.
- Search is instant, ignores case and accents, and matches name, id, tags and description text; every word must match. Prefixes: `id:MAT-HERB`, `tag:`, `type:`, `status:`, `tier:`, `pack:`, `owner:`. Filters with counts that combine: kind, AG type, owner/module, category, profession, tier, rarity/quality, status, visibility, pack/folder, **Only imported by Manager**, **Unlinked** (record with no world document); **Clear** resets them. Sort by name, type or recently changed; group by kind, category, owner, pack/folder, AG type, profession or tier. 100 rows per page.
- Each row shows name, id, kind/type chips, status and visibility chips, tier/profession/quality when known, and where it was found (World, compendium name, or module). **Open** shows the world or compendium sheet, or the owning module at that record (Locations card, Quest Log quest, Skill Trees tree); a module with no open-at-record API opens its window with a hint. **Copy id**. Name opens a **details** panel with the key fields and related records by id (both directions). World and compendium rows drag like sidebar entries (`text/plain` drag data) onto sheets, the canvas or journals.
- The same record never appears twice: rows with the same canonical id or uuid merge (world document first) and list every place they were found.
- The index rebuilds after Actor/Item/Journal/page create/update/delete (debounced) and on **Refresh**. Strictly read-only: nothing here edits a record, setting or flag. GM only, also checked in the API (`api.browse.search / getIndex / detail / open / dragData / refresh / loadCompendiums / status`). No saved-data change, no migration. Saved searches are not in this version.

## 0.23.0 — 2026-10-20

- **ZIP bundles with several import files.** A ZIP may now hold Manager packages plus Quest, Skill Tree, Headquarters and Factions files (the same files Manager already recognises one at a time). Import shows a **ZIP contents** list: file, type, record count and status, with a checkbox per file (all ticked except files with errors). Other JSON is listed as skipped with the reason.
- **Import selected files** runs the ticked files one at a time through the normal preview and Apply, Manager packages first, then Quests, Skill Trees, Headquarters, Factions (Locations stay inside Manager packages and go to Locations after their documents, as before). Each file gets its own entry in the Import results panel; a file that fails to load or validate gets a "Needs attention" result and the rest continue. **Skip this file** and **Stop ZIP import** are available. Nothing writes until you confirm each Apply.
- Ids that appear in an earlier file of the same ZIP are reported and left out of the later file (never overwritten). Artwork with the same file name in two folders is reported and not uploaded. Over 50 import files in one ZIP is refused with a clear message before anything loads. Same safety limits as before (60 MB, 500 files, unsafe paths, 25 MB/100 MB expanded, 10 MB JSON); nothing in a ZIP is executed. GM only (`planBundleImport` refuses non-GMs).
- A ZIP with exactly one Manager package and no other import file behaves exactly as before. No saved-data change, no migration.

## 0.22.0 — 2026-10-20

- **Scene moods** (new GM-only **Scenes** tab). Shows the current scene (viewed, else active; or pick any scene) and its mood. One click applies **Day, Twilight, Windy (leaves), Storm** or **Night**; **Back to normal** puts the scene back exactly as it was. Optional 3-second darkness fade.
- A mood is a small preset listing only the scene fields it sets: darkness, global illumination, day/night tint (hue, intensity, luminosity, saturation, shadows) and core weather (or **No weather**). Edit, add and remove presets (saved per world); the shipped five are marked **Default**; **Reset moods to defaults** asks first.
- Core Foundry only, no other module needed. Each field and weather id is checked on the live scene first; if one is missing, nothing changes and the GM gets a message naming it.
- Before a scene's first mood, its original values are kept in a scene flag (`moodBase`, never overwritten) and the mood id in `mood`; Back to normal clears both. GM only, also checked in the API (`api.scenes.applyMood / restore / listMoods / savePreset / removePreset`). Existing scenes are untouched until a mood is applied. No migration.

## 0.21.2 — 2026-10-19

- **Appearance cards are the selector.** In My Appearance and Manager → Appearance, the dropdown is gone: click a skin card to choose it (the chosen card is highlighted). My Appearance has an **Inherit world default** card for what the dropdown's "Use GM default" did. Cards are a keyboard radio group (Tab in, arrow keys move and choose, Space/Enter activate) and wrap at narrow widths. Save buttons, status lines and what gets saved are unchanged; nothing applies until you Save. Pure UI change, no saved-data change.

## 0.21.1 — 2026-10-19

- **Parchment contrast.** Parchment's accent (links, accent badges), danger, ok and warn colours were 3.1–4.0:1 on the parchment surfaces and on their own badge tints, below WCAG AA. They are now darker bronze/brick/green/amber (accent #734e21, danger #94352e, ok #25603b, warn #734f0c), all at least 4.5:1; the light-parchment-with-ink-and-bronze look stays.
- Stone Tablet's danger text was 4.43:1 on the danger badge/button tint; lightened a few steps (#f9b3aa). Parchment's focus ring is slightly darker (#a5772b) to hold 3:1. Standard's danger is 4.48:1 on its tint and is left alone because it is the kit default shared by every module. No other skin changed.
- Contrast test now covers every skin against the kit's real pairs (links, status text, badges, danger button, focus ring). No saved-data change.

## 0.21.0 — 2026-10-19

- **Pre-session check** (Modules tab, GM only). **Run pre-session check** lists PASS / WARN / FAIL / N-A lines for: Ashen Gate module versions (inactive or too old for Manager's hand-offs warns), each module's GM data (Locations GM Data, Quest GM sources, Skill Trees definitions, Factions definitions, Headquarters vault), Player Access per module (a hidden player launcher warns), [TEST] records players can see, hidden names in player views, the Locations 1.8.0 migration and pending GM notice, and Foundry / dnd5e versions. A summary line ends the list. **Copy report** copies it as plain text; **Download report** saves a .txt.
- Leak scan uses the modules' own player views (Locations player previews, Quest Log's visible quests) and reports hits by record id, never by name. Factions, Skill Trees and Headquarters have no player view Manager can call, so they show "could not check". A gm-visibility Item that players can open is a FAIL.
- Strictly read-only: it never creates, changes or deletes a document, flag or setting. Missing modules show "not installed". GM only, checked inside the function too (`api.preSessionCheck()`).
- **Back up before play** (Library tab, next to Export). Saves all Ashen Gate data in one file, `AG_Backup_<date>.json`, using the same code as **Export everything**. It does not change the "changed since last export" baseline: a backup is not an export. GM only, checked inside the function too (`api.backup()`). Nothing in the world changes.

## 0.20.0 — 2026-10-19

- **Two new structural skins** in Appearance (GM world default) and My Appearance (per player): **Ashen Gate — Stone Tablet** (carved stone slabs, chiselled bevels, engraved uppercase headings, inset carved tabs, lichen-green primary actions, ember focus ring) and **Ashen Gate — Tome Pages** (vellum pages with paper grain, leather-bound title bar, gutter and corner shading, small-capital headings with ornamental rules, ribbon bookmark on the open tab, rubric-red primary actions). They reshape every Ashen Gate window and the sidebar launchers, not just colours.
- Each skin's stylesheet is loaded only while it is the effective skin and only matches when it is active; the five colour skins are unchanged. No web fonts (uses Foundry's own Modesto Condensed/Amiri with system serif fallbacks) and no images beyond inline noise. Text keeps WCAG AA contrast; focus rings stay visible; no animation.
- Saved appearance settings are untouched; an unknown skin still falls back to Standard. My Appearance now shows each skin's description.

## 0.19.0 — 2026-10-19

- **Update existing actors** (Import tab, opt-in, off by default). Re-importing a file can now update Actors Manager created earlier. Actors are matched only by their permanent id, never by name. The preview marks each Actor CREATE, UPDATE or SKIPPED and lists every field that would change.
- Only the package's own definition changes: name, image (if the file gives one), the token settings the file defines, and the package's embedded items (new ones added, changed descriptions and rules updated). Kept as they are: HP and other system values, XP and level, conditions/effects, items players added, quantities, uses and equipped state, biography/notes, ownership, folder, and every other module's flags. A field the GM edited and the package did not change is kept.
- Applying asks for a separate **Update existing Actors** confirmation listing each change, and a JSON backup of those Actors downloads before anything is written. **Download backup of N actor(s)** under the preview downloads it on its own. GM only, also checked where the write happens. Running the same import again changes nothing.
- Actors imported before 0.19.0 work: their package items are recognised on the first update (an item with duplicate copies is left alone and listed). Items removed from the package stay on the Actor.

## 0.18.1 — 2026-10-19

- World export no longer stores record names in the saved snapshot (a world setting players could read), so hidden record names cannot leak. It keeps only content hashes. "Removed since last export" now lists ids and sections, not names. An older snapshot that still has names loads fine and is rewritten without them on the next export.

## 0.18.0 — 2026-10-19

- **Export Ashen Gate data** (Library tab). One button group: **Export everything**, **Export changed since last export**, and **Copy summary**. Each Export saves ONE JSON file (`AG_World_Export_<date>.json`) of every Ashen Gate tagged world document plus the definitions Locations, Quest Log, Factions, Skill Trees and Headquarters expose; a module that is off or too old is listed as "not available". Definitions only: no actor progress, stash, party notes, quest status or other play state. GM only. "Changed" compares content hashes with a snapshot saved (new world setting, additive) after the last export; the first run exports everything. Format is documented in the README.

## 0.17.0 — 2026-10-19

- **Import results panel.** After every Apply, the Import tab keeps a plain result panel (newest first, until you press Clear results): per module and file what was created, updated, kept and what failed, with the reason, what to do about it, and where to find it afterwards (for example Quest Log > GM Setup). Applies that cannot start (module off, nothing selected, file not loaded) are listed there too, not only as a pop-up. The History tab entry is unchanged.
- Player Access now lists **Locations** as player-capable with its own toggle, like the others (only Manager and a separate Location Builder stay GM only). Locations is also listed when not installed.
- Skill Trees warnings and notes from the owning module now show in the result rows.

## 0.16.0 — 2026-10-19

- The **Macros** tab is gone for now (install, export and custom macro JSON). Macros already installed in a world stay as they are, and nothing stored changed.
- Importing Macro documents inside an import package works as before (for example the `[TEST] Link test data` macro). Imported Macros are still never executed.

## 0.15.0 — 2026-10-19

- The **Templates** tab is gone. The three sample downloads (template package, Import JSON starter, source manifest) are under **Import → Advanced / sample files**. Packages that use templates still compile as before.
- The **Audit** tab is gone. **Library → Check library** shows the same results inline.
- The two bundled legacy experimental macros (14-tree generator, tree access sync) are removed from the Macros tab. Macros already installed in a world are not touched. Custom macro JSON still works.

## 0.14.0 — 2026-10-19

- **One import for everything.** Manager now recognises Quest, Skill Tree, Headquarters facility and Factions files by their shape and hands them to that module (Quest Log 0.6.0+, Skill Trees 0.7.0+, Headquarters 0.7.0+, Factions 0.7.0+). The preview shows each record as new or kept, and you pick what to import. Records already in the world are kept; tick **Update existing** to replace Quests and Skill Trees (their status and purchases are protected). Headquarters and Factions only add new ones. If a module is off, its rows say so.
- A file Manager cannot use now says what it looks like (top-level keys, record types) and which module's import similar files belong to.
- Fix: a failed load no longer leaves the previous file shown as "loaded". The banner and file name clear on every new attempt, and you can pick the same file again.
- The row of module buttons under the header is gone; the **Modules** tab opens and manages modules.
- **Export** is no longer a tab. Adopting and exporting world Items now lives in **Library**, next to export of selected records.
- **Player Access** moved under **Appearance** as a compact list below the skin selector.
- Fix (appearance for players): a player's screen could keep the previous world default after the GM changed it, because the setting was re-read before Foundry had stored it. Manager now uses the value Foundry sends with the change. Players who picked their own look in My Appearance keep it; anyone who has not reloaded since a module update needs one refresh.

## 0.13.0 — 2026-10-18

- **One import for everything.** Location records in an `ag-foundry-import/0.2` package are now imported by Manager's normal run when Locations (1.2.0+) is active: Items and other documents first, then the Locations are passed to `api.importLocations` in the same Apply, so Material references resolve. You no longer import the same file a second time in Location Builder.
- Location rows appear in the normal preview (create, or skipped with a reason) and in the import message and History (imported count, skipped count with reasons). Existing location ids are kept as they are unless you tick the new **Update existing locations** option.
- If Locations is not active the rows are skipped and the preview says "N location records skipped: enable Locations".
- Draft locations follow **Include drafts** like every other record.

## 0.13.1 — 2026-10-19

- GM-only Items sidebar launcher moved to `scripts/items-launcher.js`: General Manager always first, Locations second, in one shared two-column group whichever module renders first. Still GM-only (checked on render and on click). No saved-data changes. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.12.2 — 2026-10-18

- Header is one line: title and version on the left, Help and the "GM only" chip on the right. The empty emblem box (non-existent `fa-gate` icon) is replaced by a `fa-dungeon` icon.
- Module launchers moved to one compact row under the header with short labels and icons (Professions, Skill Trees, Quests, Factions, Headquarters, Locations, Utilities), in the same order as the Actors-sidebar launchers. Full name and state stay in the tooltip; inactive modules stay disabled. Wraps only at narrow widths. (#3)

## 0.12.3 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- Appearance now themes the whole page: Manager writes the effective skin (GM world default or your own override) to the document, so every Ashen Gate window and sidebar launcher follows it, not only Manager's own windows.
- Two new skins: **Verdigris** (dark teal with brass) and **Parchment** (light). Standard, Slate and Ember are refreshed.
- My Appearance has a new layout with a colour preview of each skin.
- New `api.appearance.openMyAppearance()`, so other modules (Utilities) can open the player-safe My Appearance window.
- The General Manager button in the Items sidebar is styled by the shared kit, so it matches the Location Builder button and the Actors-sidebar launchers.

## 0.12.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## v0.12.0 Beta — AG-WORK-0018 (2026-10-17)

- Fix Library local-edit scanning to compare serialized Foundry document data, avoiding render failures when live accessors expose non-cloneable document values.
- Reject invalid RollTable result types and malformed ranges/weights during whole-package preflight, before any documents are written. Update the prior synthetic fixture to V14's string result types.
- Route JSON/template/source exports through Foundry's file-save utility so actions save a file instead of navigating the browser to raw JSON; keep the browser fallback for unsupported runtimes.
- Add current-version header, compact direct Ashen Gate module buttons, and remove the redundant workflow subtitle.
- Normalize macro line endings when checking bundled macro re-imports; preserve edit conflict detection.
- Added reproducible valid/blocked RollTable fixtures and setup/reset notes. Node/mock only; live Foundry V14 acceptance remains separate.

## v0.11.2 Beta - 2026-10-16

- Reject `campaign_state` and unsupported scopes in the native definition reader; preserve unscoped Manager projections as valid.
- Add a regression covering a campaign-state Recipe incorrectly resolving as a reusable definition.
- 156 Node tests pass. No migration or campaign/Actor progression writes; live Foundry V14 remains untested.

## v0.11.1 Beta - 2026-10-16

- Pass the injected reveal policy into native definition visibility checks. Revealed records remain subject to current-user Foundry document permission; unrevealed, unreadable, and reveal-policy errors fail closed.
- Add a focused regression test; no data migration.
- 155 Node tests pass. Live Foundry V14 remains untested.

## v0.11.0 Beta — AG-WORK-0014; DEC-0077–0081 (2026-10-16)

- Built from the complete v0.10.0 Beta baseline; retained Items, Journals, Actors, RollTables, Macros, JSON/ZIP import, nested folders, icon fallbacks, Library, archive/restore, macro safety, Player Access, module launchers, and GM/player Appearance.
- Aligned Manager's read-only `ag-definition-resolver/0.1-prototype` consumer to Archie handoff b196dd7 (world unique active precedence over matching pack source, no world fallthrough, typed lookup, duplicate conflict, archived exclusion, permission-safe source read, GM reference validation, provider and explicit pack adapters).
- Preserved full reusable non-Foundry source definition in Manager projection source flags, including MAT/REC/PERK structured properties, provenance, version, and required/optional typed refs. Metadata-only reimport remains non-destructive to native Actor progress and campaign state.
- Explicit canonical NPC logical `entity_type: NPC` vs Foundry `document_type: Actor`; reject `entity_type: Actor` instead of silently rewriting IDs.
- Fixed CI-only test harness dependency: the v0.7.0 ZIP tests now import Manager’s bundled JSZip rather than a machine-specific global installation.
- Added synthetic end-to-end lifecycle/reader tests. Live Foundry V14 GM/player tests still outstanding.

## 0.10.0 Beta — 2026-10-16
- AG-WORK-0013/0014: preserve missing optional canonical source refs and expose authorized read-only native-definition reader using Archie resolver v0.1 baseline semantics.
- Add resolved/unresolved source-ref diagnostics; test five document kinds, archive, player access, explicit packs and event refresh.
- 142 Node local tests passed; Foundry V14 runtime test pending; no campaign migrations or gameplay changes.

## v0.8.0 — Player Access Controller Beta
- DEC-0072 / `ag-player-access/1` GM-only dashboard, per-owner API read/write, honest unsupported and missing statuses, Hide All with partial failure reports.
- Added status refresh and module-tile access labels; Manager advertises its own GM-only read-only capability.
- Preserved v0.7.0 import pipeline and existing specialist campaign/Actor state.
- See README-v0.8.0.md for GM/player runtime tests still outstanding.

## v0.7.0 — Actor & Document Import Beta
- Actor, RollTable, Macro create-only import support; ZIP package selection and opt-in bundled art upload.
- Expanded typed folders, UUID bindings, fallbacks, importer type counts and simplified Import UI.
- Stu 8-Actor JSON validated locally; live Foundry/dnd5e runtime remains unverified. See README-v0.7.0.md.

# Changelog

## 0.6.0 — Import Fidelity Beta (2026-10-15)
- New optional nested `foundry.folder_path` for Items/Journals; create/reuse typed folders on first import.
- Bundled category fallback icons with preservation of authored art, plus detected-404 fallback.
- Final world UUID binding pass for typed refs and provisional `[[AGREF:ID|Label]]` rich-text placeholders; missing and ambiguous targets reported.
- GM-only General Manager Items directory launcher; header and help improvements; compatibility with `ag-foundry-import/0.2` retained.
- Synthetic three-record clean-import fixture; local automated tests and release notes.

Earlier 0.5.1 changes are documented in `README-v0.5.1.md`.

## v0.9.1 — GM/player Appearance & Resolver Handoff Beta
- From exact v0.8.0 baseline: GM Appearance world default, separate player-safe per-user My Appearance screen, three scoped semantic token palettes.
- Optional `ag-appearance/0.1-beta` GM/player-safe setting API and specialist fallback/cleanup example. No gameplay or Player Access state copied or mutated.
- GM-only read-only helper to audit typed AG source IDs via Archie `ag-definition-resolver/0.1-prototype`, without mandating an SDK or choosing world-vs-compendium precedence.
- Existing JSON/ZIP document importing and Library untouched. Source-reviewed, local tests only. See README-v0.9.1.md.
