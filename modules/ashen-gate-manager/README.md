# Ashen Gate | General Manager

Module ID `ashen-gate-manager` · Foundry V14 · dnd5e. The GM hub: one importer for Ashen Gate data, a library of what was imported, shared appearance settings and a Player Access overview. It is GM-only; the other modules work without it. Open it from **Items sidebar → General Manager** (GM only).

## Tabs

- **Import:** load an `ag-foundry-import` JSON package, preview every record as create, update or skip, pick what to apply and apply it. It creates world Items, Journals, Actors, Roll Tables and Macros (imported Macros are never run), matched by permanent id, never by name. Quest, Skill Tree, Headquarters facility, Factions and Location records are recognised by shape and handed to those modules when they are active (otherwise skipped with a reason). Route records (0.27.0, Locations 1.10.0+; schema in `docs/routes-schema.md`) go to Locations after the locations they join; re-import never changes a route's discovery state. Updates are field-wise and respect local edits. An opt-in **Update existing Actors** option changes only the package's own definition (name, image, defined token settings, package items) after a separate confirmation and a downloaded backup. A results panel keeps what was created, updated, kept or failed, and where to find it. Sample files are under Import → Advanced / sample files. A **ZIP** can hold one Manager package (imported as before) or several import files — Manager packages plus Quest, Skill Tree, Headquarters and Factions files: a **ZIP contents** list shows each file's type, record count and status; untick what you don't want, then each file goes through the same preview and Apply in turn (Manager packages first), with its own result. Ids already in an earlier file of the ZIP are reported and left out, never overwritten.
- **Library:** browse managed world documents, check the library, export local edits, archive / restore, copy to a staging compendium and adopt existing world Items. **Export Ashen Gate data** saves one JSON file (everything, or only what changed since the last export) of tagged world documents plus the definitions the other modules expose.
- **Modules:** which Ashen Gate modules are installed and active, with shortcuts to open them.
- **Appearance:** the world default skin, **Open My Appearance** for per-user choice, and a **Player Access** list that turns player access on or off for modules that support it.
- **Organize:** files world (or unlocked world-compendium) Items, Actors and Journals into a rule-based folder tree; Preview, Apply, Undo; protected folders and Keep here; read-only housekeeping report. Default rules (0.30.0): Ashen Gate records go under `Ashen Gate/…`; non-Ashen-Gate Items that are **source-tagged** (imported by Plutonium, or `system.source` rules/book set to 2024: PHB'24, DMG'24, MM'24, SRD 5.2, or, since 0.31.0, to 2014 core: rules `2014`, PHB, DMG, MM, SRD 5.1) go under `Core 5.5e/…`; non-Ashen-Gate Items with no source, or a third-party or homebrew source, go under `Homebrew/…` with the same sub-folders (spells by level, magic items by rarity, weapons, armor, …). Saved custom rules are kept as they are. Rule format: [`docs/organize-rules.md`](../../docs/organize-rules.md).
- **Core Links:** links Ashen Gate world Items that carry `core_ref` to 2024 (5.5e) core items (world Items imported by Plutonium or marked 2024, a narrower test than Organize's, which also counts 2014 core as Core; world compendiums; GM core sources; dnd5e 2024 packs; never 2014 content) and, for exact matches, adopts the core item's image and data while keeping the Ashen Gate name and id. See *Core references* below.
- **GM Setup:** which compendiums and folders count as core sources for Core Links.
- **History:** recent import operations and downloadable snapshots taken before updates, archives and deletes. There is no automatic undo; a snapshot is not a world backup.

## Core references (`core_ref`)

An Ashen Gate Item or Material record that should become a 2024 core item carries `core_ref` in its source record (next to `id`, `entity_type` and the other definition fields, not inside `foundry.data`):

```json
"core_ref": {"name": "Potion of Healing", "source": "DMG'24", "type": "consumable", "rarity": "common"}
```

- `name` (required): the core item's name as it appears in the 2024 books / Plutonium / dnd5e packs. A plain string (`"core_ref": "Potion of Healing"`) also works.
- `source` (optional): the book, e.g. `PHB'24`, `DMG'24`, `MM'24` (`XPHB`, `XDMG`, `XMM` and `SRD 5.2` are understood too). When given, a different book makes the match MEDIUM.
- `type` (optional): the Foundry Item type (`weapon`, `equipment`, `consumable`, `tool`, `loot`, `container`, …). Defaults to the record's own Foundry type.
- `rarity` (optional): dnd5e rarity (`common`, `uncommon`, `rare`, `veryRare`, `legendary`, `artifact`).

Records without `core_ref` are never linked. Linking keeps the Ashen Gate name and id; the link is stored in `flags.ashen-gate-manager.coreLink`.

## Relation to other modules

Manager owns source-definition import and shared appearance. Each specialist module owns its own state (Actor progression, Renown, Headquarters, Locations, Quests) and keeps working when Manager is missing or disabled; Manager feature-detects partners through their public APIs and never writes their state directly. Modules fall back to a default theme without Manager's appearance controller.

## Public API

`game.modules.get('ashen-gate-manager').api`: `open`, `appearance` (`listSkins`, `getState`, `applyTo`, `subscribe`, `refresh`, `setWorldDefault`, `setUserOverride`, `openMyAppearance`), `definitions` (read-only definition reader: `readSource`, `resolve`, `list`, `audit`, `validateReferences`, `registerProvider`, `loadCompendiums`, `refreshCompendiums`, …), `resolverBridge` and `playerAccess` (GM-only, not configurable).

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-manager/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-manager-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
