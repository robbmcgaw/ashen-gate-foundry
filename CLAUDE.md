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
- **The suite is pre-release: every module stays on 0.x.** Never introduce a 1.x version. Locations was renumbered from 1.18.0 to 0.18.0 (its 1.x tags stay as history; never reuse a tag). `scripts/check.mjs` fails on a non-0.x version, on a `module.json` relationship pinning an Ashen Gate module at 1.x, and on code that compares a Locations version: partners feature-detect its API instead.
- **Reinstalling Locations after the renumber** (Foundry won't offer a lower number as an update): Forge → Setup → Add-on Modules → uninstall *Ashen Gate | Locations* → Install Module → Manifest URL `https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-locations/module.json` → Install → launch the world and enable Locations in Manage Modules. World data (locations, routes, pins, Party Notes) lives in the world and is kept.

## Public repo
This repo is public (so Forge can read the manifest URLs). Never put setting spoilers, campaign notes or GM-secret content here — test data must be synthetic (`[TEST]`-style names). Design/setting material lives in the private `robbmcgaw/ashen-gate-supplement` repo (read it for rules/design context when needed; its `governance/` process docs are historical, don't follow them).

## Module rules worth keeping
- **Independent modules.** Each keeps its own id, settings/flag namespace and public API (`game.modules.get(id)?.api`). Missing optional partners (including General Manager) must never stop a module from opening. Feature-detect, don't reach into another module's internals.
- **Ownership.** General Manager owns source-definition import and shared appearance settings. Each specialist module owns its own mutable state (Actor progression, Renown, HQ, Locations, Quests). Don't duplicate another module's state.
- **Stable IDs.** Canonical ids (`LOC-*`, `REC-*`, `PERK-*`, `PROF-*`, `MAT-*`, …) are permanent; Foundry UUIDs are world-local bindings. Preserve ids and user edits on reimport.
- **Permissions are enforced, not just hidden.** GM-only data/actions must be rejected in the API/data layer, not only by hiding buttons. Player views/exports never leak `gm` or unrevealed records.
- **Don't break saved data.** Changes to persisted settings, Actor flags or world documents need a safe, re-runnable migration. Never rewrite campaign state on import.
- **Launchers.** Actors-sidebar launchers are player-facing (gated by each module's Player Access setting); Manager's GM launcher stays in the Items sidebar; Locations' GM launcher is in the Scenes sidebar (Foundry shows that tab to GMs only). Both are GM-only.

## UI conventions (shared shell)
Full rules and their sources: `docs/ui-ux-guidelines.md`. Latest audit and per-module cleanup briefs: `docs/ui-audit-2026-10.md`.
- Header: `Ashen Gate | <Module>` on the left, version + Help on the right. At most one other window-level control in the header; no subtitle. Tabs directly below. Search/filter toolbar at top of content, create action on the right.
- Tabs: at most 6 top-level, with visible text labels; GM-only tabs last and marked. At most one level of sub-tabs, using the kit's tabs (segmented controls pick values, they don't navigate). Same tabs every time for a role: show an empty state rather than hiding a tab mid-session.
- Primary action (Save Changes / Apply) bottom-right, Cancel bottom-left, in a footer pinned to the window or editor pane. One primary per view. Destructive actions behind a labelled confirmation ("Delete <thing>?" / "Delete <thing>", never OK/Yes), `danger: true`, never the default button.
- Never lose typed edits: show "Unsaved changes", and ask before a tab switch, selection change, close or re-render discards them. Controls that save at once stay out of draft forms (or carry an "Applies now" badge), and never save half-finished edits silently.
- GM configuration lives in a permission-gated **GM Setup** tab; demo/debug tools in a GM-only **Developer Tools** area.
- GM Setup holds settings only. Authoring and management of content (quests, locations, factions, etc.) lives in its own tab(s), not in GM Setup. One-off actions and maintenance (create, migrate, fill in, repair) go in their content tab, a Maintenance sub-tab, or Developer Tools.
- Crowding: an editor opens beside the list (`.ag-split`) or in place of it, never below the whole list. Split long editors and settings pages into sub-tabs under one footer; put optional sections in labelled collapsible folds (no fold inside a fold). Keep the toolbar to one row; extra filters go behind "Filters (n)".
- Group long lists by a useful category; never clip or truncate actionable text. Controls sized to their content. Cards for things picked by eye, rows/tables for records you scan or sort.
- Keyboard and accessibility: everything clickable is a `<button>` or an `<a href>`; icon-only buttons have `aria-label` + `data-tooltip`; status icons carry text; colour is never the only signal (use the kit's ink tokens on tinted fills); focus stays on the same control after a re-render; interacting with a UI element must not move the viewer's scroll position: preserve scrollTop of every scroll container (and focus) across re-renders, prefer updating in place over re-rendering the whole window, for ApplicationV2 declare scrollable regions in PARTS (`scrollable`) or restore scroll in `_onRender`, and add a test that a re-render keeps the scroll position where the code is testable; drag and drop has a keyboard alternative; respect reduced motion.
- Use the kit's components rather than module-local copies (skins only reshape kit classes). A kit change ships in every module in the same PR.
- Copy: one name per thing across launcher, header, tabs, Help and embeds; buttons start with a verb, end with "…" when they open a dialog; no raw ids, status tokens or timestamps in the UI.
- Production wording: modules are production-ready. Never put Alpha, Beta, Preview, New or similar status labels in the UI, Help, settings or module descriptions; talk about status in chat. Internal API contract ids keep their names.
- Modules must render with a default theme when Manager's appearance controller is absent; they don't ship their own theme or skin settings.

## Tests
`node scripts/check.mjs` runs everything (Node 22, `node --test`, mocked Foundry globals). Tests prove logic, not the live Foundry UI — say so when reporting, and tell Robb exactly what to click to verify a change in Forge.
