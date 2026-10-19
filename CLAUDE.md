# Working on the Ashen Gate Foundry modules

## Target environment
Foundry VTT **V14** (Stable 9, build 367) hosted on **The Forge**, system **dnd5e 6.0.6**. Robb is the GM and the only tester; he tests in a live Forge world and reports back.

## The workflow
1. Robb describes a feature or bug in chat.
2. Work on a branch, keep the change focused on what was asked. Don't invent mechanics or rules content — ask.
3. Bump the module's version (see below), add a short CHANGELOG entry, run `node scripts/check.mjs <module-id>`.
4. Merge to `main` when Robb asks (or open a PR if he wants to review). The Release workflow publishes it; Robb clicks update in Forge and tests.
5. Iterate on his feedback.

No work queues, handoff docs, delivery receipts, evidence files, SHA files or per-version READMEs. Git history and GitHub Releases are the record.

## Versioning — a bump touches these places
- `module.json`: `version` **and** the `download` URL (`.../releases/download/<id>-v<version>/<id>.zip`). `scripts/check.mjs` fails if they disagree.
- Some modules also hard-code the version in code/tests (e.g. `const VERSION=` in scripts, header text in templates, `assert.equal(...version, 'x.y.z')` in tests). Search the module for the old version string and update them all.
- Patch for fixes, minor for features. Never re-release an existing version.

## Public repo
This repo is public (so Forge can read the manifest URLs). Never put setting spoilers, campaign notes or GM-secret content here — test data must be synthetic (`[TEST]`-style names). Design/setting material lives in the private `robbmcgaw/ashen-gate-supplement` repo (read it for rules/design context when needed; its `governance/` process docs are historical, don't follow them).

## Module rules worth keeping
- **Independent modules.** Each keeps its own id, settings/flag namespace and public API (`game.modules.get(id)?.api`). Missing optional partners (including General Manager) must never stop a module from opening. Feature-detect, don't reach into another module's internals.
- **Ownership.** General Manager owns source-definition import and shared appearance settings. Each specialist module owns its own mutable state (Actor progression, Renown, HQ, Locations, Quests). Don't duplicate another module's state.
- **Stable IDs.** Canonical ids (`LOC-*`, `REC-*`, `PERK-*`, `PROF-*`, `MAT-*`, …) are permanent; Foundry UUIDs are world-local bindings. Preserve ids and user edits on reimport.
- **Permissions are enforced, not just hidden.** GM-only data/actions must be rejected in the API/data layer, not only by hiding buttons. Player views/exports never leak `gm` or unrevealed records.
- **Don't break saved data.** Changes to persisted settings, Actor flags or world documents need a safe, re-runnable migration. Never rewrite campaign state on import.
- **Launchers.** Actors-sidebar launchers are player-facing (gated by each module's Player Access setting); Items-sidebar launchers for Manager and Locations are GM-only.

## UI conventions (shared shell)
- Header: `Ashen Gate | <Module>` on the left, version + Help on the right. Tabs directly below. Search/filter toolbar at top of content, create action on the right.
- Primary action (Save Changes / Apply) bottom-right, Cancel bottom-left. Destructive actions behind a labelled confirmation.
- GM configuration lives in a permission-gated **GM Setup** tab; demo/debug tools in a GM-only **Developer Tools** area.
- GM Setup holds settings only. Authoring and management of content (quests, locations, factions, etc.) lives in its own tab(s), not in GM Setup.
- Group long lists by a useful category; never clip or truncate actionable text. Controls sized to their content.
- Modules must render with a default theme when Manager's appearance controller is absent.

## Tests
`node scripts/check.mjs` runs everything (Node 22, `node --test`, mocked Foundry globals). Tests prove logic, not the live Foundry UI — say so when reporting, and tell Robb exactly what to click to verify a change in Forge.
