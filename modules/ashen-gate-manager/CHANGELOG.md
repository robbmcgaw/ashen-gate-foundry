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
