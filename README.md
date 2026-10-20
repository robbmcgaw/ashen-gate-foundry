# Ashen Gate — Foundry VTT modules

Nine Foundry VTT (V14, dnd5e) modules for the Ashen Gate D&D 2024 supplement. Each module installs on its own and keeps its own id, settings and public API (`game.modules.get(id)?.api`). **General Manager** is the optional GM hub: it owns source-definition import and shared appearance. Every other module opens and works without it and feature-detects its partners. Each module's own state (Actor progression, Renown, Headquarters, Locations, Quests) belongs to that module.

| Module | What it does | Where it opens |
|---|---|---|
| Character Hub (alpha) | Alternative dnd5e character sheet on the real Actor, with the native sheet one click away | Character sheet menu → Ashen Gate Character Hub |
| Factions & Renown | Factions, group and personal Renown, discovery, rewards, service requests | Actors sidebar → Renown |
| Headquarters | Shared Guildhall layout, facilities, hirelings, personal quarters | Actors sidebar → Headquarters |
| Locations | Campaign places with threat, gathering nodes, party notes, map pins, per-player visibility | Actors sidebar → Locations; GM: Items sidebar → Location Builder |
| General Manager | GM-only importer, library, appearance and Player Access overview | GM: Items sidebar → General Manager |
| Profession Ledger | Crafting, recipes, gathering, Actor-owned profession XP | Actors sidebar → Professions |
| Quest Manager | Quests, orders and contracts with Party and Individual logs | Actors sidebar → Quests |
| Skill Trees | Perk-based progression trees | Actors sidebar → Skill Trees |
| Utilities | Group checks, roll requests, conditions, party stash, RollTable sharing | Actors sidebar → Utilities |

Actors-sidebar launchers are player-facing and gated by each module's Player Access setting. Each module's README has its tabs, public API and install steps.

## Install / update

In Foundry (or The Forge): **Add-on Modules → Install Module → Manifest URL**, paste a URL below, Install.
After that, updates show up through Foundry's normal **Check for Updates** / Forge's update button.

| Module | ID | Manifest URL |
|---|---|---|
| Character Hub | `ashen-gate-character-hub` | `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-character-hub/module.json` |
| Factions & Renown | `ashen-gate-factions` | `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-factions/module.json` |
| Headquarters | `ashen-gate-headquarters` | `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-headquarters/module.json` |
| Locations | `ashen-gate-locations` | `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-locations/module.json` |
| General Manager | `ashen-gate-manager` | `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-manager/module.json` |
| Profession Ledger | `ashen-gate-profession-ledger` | `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-profession-ledger/module.json` |
| Quest Manager | `ashen-gate-quest-manager` | `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-quest-manager/module.json` |
| Skill Trees | `ashen-gate-skill-trees` | `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-skill-trees/module.json` |
| Utilities | `ashen-gate-utilities` | `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-utilities/module.json` |

Every version is also on the [Releases page](https://github.com/robbmcgaw/ashen-gate-foundry/releases) for manual install or rollback. Each module's `CHANGELOG.md` and the Releases page are the change history.

## How releases work

1. Change a module and bump `version` (and the matching `download` URL) in its `module.json`, add a `CHANGELOG.md` entry.
2. Merge to `main`.
3. The **Release** workflow runs all checks, then builds `<id>.zip` and publishes a GitHub Release tagged `<id>-v<version>` for every module whose version isn't released yet.

## Checks

```bash
node scripts/check.mjs                  # all modules
node scripts/check.mjs ashen-gate-factions   # one module
```

Validates each `module.json` (id, version, manifest/download URLs, listed files), syntax-checks every script and runs the module's tests.

## Layout

```
modules/<module-id>/     module source, tests, README, CHANGELOG
test-fixtures/           shared test data used by more than one module
scripts/check.mjs        the one check script (CI runs this too)
.github/workflows/       check.yml (branches/PRs) and release.yml (main)
```

Design documents, setting content and campaign material live in the private `ashen-gate-supplement` repository. Keep this repository free of spoilers: it is public.
