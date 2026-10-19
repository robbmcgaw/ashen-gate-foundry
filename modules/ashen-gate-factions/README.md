# Ashen Gate | Factions & Renown

Module ID `ashen-gate-factions` · Foundry V14 · dnd5e. Factions with group Renown, per-character Renown, discovery, rewards and service requests. Open it from **Actors sidebar → Renown** (players when **GM Setup → Player Access** is on).

## Tabs

- **Group:** each faction the party knows, with group Renown score and rank. The group's display name can be customized in GM Setup.
- **Player:** the same factions for one character, with that character's personal Renown. Players can **Share with Party** what they have discovered, claim rewards and send service requests (the GM is notified and acknowledgments are tracked per user).
- **Organizations** (GM): every faction (hidden, character-only and revealed) in a searchable list with visibility, group Renown, folder and linked-objective chips. Filter, sort and group by visibility or folder. Creating, editing, revealing, folders, rewards, claims, information entries, linked quests, Import and Export live here.
- **GM Setup** (GM): settings only: Player Access and the custom group display name.

Discovery can be all-or-nothing per faction, or field by field (Name, Leader, Description). Existing factions stay in all-fields-visible mode until the GM opts in. Source-definition exports (`AG_Factions_Definitions.json`) omit player disclosure, Renown, claims, service usage and history.

## Relation to other modules

Independent. General Manager hands faction files to `api.previewFactionsImport` / `api.importFactions` (GM only): new factions are added, existing ones are never changed. A faction can hold typed Objective references; with Quest Manager active the GM-only `getObjectiveRefs` and `auditObjectiveRefs` report on them, and Factions never resolves or reveals Quest state itself.

## Public API

`game.modules.get('ashen-gate-factions').api`: `open`, `getFactions` (players get only their filtered view), `validateFaction`, `playerAccess` (`ag-player-access/1`), and GM-only `previewFactionsImport`, `importFactions`, `refreshPlayerViews`, `getObjectiveRefs`, `auditObjectiveRefs`.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-factions/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-factions-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
