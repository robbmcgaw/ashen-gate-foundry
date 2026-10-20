# Ashen Gate | General Manager

Module ID `ashen-gate-manager` · Foundry V14 · dnd5e. The GM hub: one importer for Ashen Gate data, a library of what was imported, shared appearance settings and a Player Access overview. It is GM-only; the other modules work without it. Open it from **Items sidebar → General Manager** (GM only).

## Tabs

- **Import:** load an `ag-foundry-import` JSON package, preview every record as create, update or skip, pick what to apply and apply it. It creates world Items, Journals, Actors, Roll Tables and Macros (imported Macros are never run), matched by permanent id, never by name. Quest, Skill Tree, Headquarters facility, Factions and Location records are recognised by shape and handed to those modules when they are active (otherwise skipped with a reason). Updates are field-wise and respect local edits. An opt-in **Update existing Actors** option changes only the package's own definition (name, image, defined token settings, package items) after a separate confirmation and a downloaded backup. A results panel keeps what was created, updated, kept or failed, and where to find it. Sample files are under Import → Advanced / sample files. A **ZIP** can hold one Manager package (imported as before) or several import files — Manager packages plus Quest, Skill Tree, Headquarters and Factions files: a **ZIP contents** list shows each file's type, record count and status; untick what you don't want, then each file goes through the same preview and Apply in turn (Manager packages first), with its own result. Ids already in an earlier file of the ZIP are reported and left out, never overwritten.
- **Library:** browse managed world documents, check the library, export local edits, archive / restore, copy to a staging compendium and adopt existing world Items. **Export Ashen Gate data** saves one JSON file (everything, or only what changed since the last export) of tagged world documents plus the definitions the other modules expose.
- **Modules:** which Ashen Gate modules are installed and active, with shortcuts to open them.
- **Appearance:** the world default skin, **Open My Appearance** for per-user choice, and a **Player Access** list that turns player access on or off for modules that support it.
- **History:** recent import operations and downloadable snapshots taken before updates, archives and deletes. There is no automatic undo; a snapshot is not a world backup.

## Relation to other modules

Manager owns source-definition import and shared appearance. Each specialist module owns its own state (Actor progression, Renown, Headquarters, Locations, Quests) and keeps working when Manager is missing or disabled; Manager feature-detects partners through their public APIs and never writes their state directly. Modules fall back to a default theme without Manager's appearance controller.

## Public API

`game.modules.get('ashen-gate-manager').api`: `open`, `appearance` (`listSkins`, `getState`, `applyTo`, `subscribe`, `refresh`, `setWorldDefault`, `setUserOverride`, `openMyAppearance`), `definitions` (read-only definition reader: `readSource`, `resolve`, `list`, `audit`, `validateReferences`, `registerProvider`, `loadCompendiums`, `refreshCompendiums`, …), `resolverBridge` and `playerAccess` (GM-only, not configurable).

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-manager/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-manager-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
