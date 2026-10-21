# Build brief 09: Locations

Self-contained brief for a build chat. Single module: **`modules/ashen-gate-locations` only**, so it can run in parallel with briefs 04–12.

## Read first
- `CLAUDE.md`.
- `docs/ui-standard.md` (final).
- The Locations section of `docs/ui-audit.md`. Line references there are from `b2cd06b`; re-locate them with grep.
- **Reference implementation:** Character Hub 0.22.0 on `main` (PR #177) is the finished pilot. Copy its patterns: header, kit rows, badges, empty states, `data-tooltip`, the `ag-dialogs.mjs` use, the `windowSize()` use, and the CSS token style.

## Branch, merge, version
- **Branch:** `ui/locations` from `main`, after the shared kit (#174), the Hub pilot (#177) and the dialogs sweep (#176) are on `main`. If #176 isn't merged yet, wait for it or merge `main` again before you start the dialog items.
- **PR:** a normal PR. Merge when green. **Only this module's files** plus the lint baseline (below).
- **Version:** **minor** bump above the module's version on `main` when you open the PR. Today ashen-gate-locations is 1.16.0 on `main`, so the next would be 1.17.0; recompute after #176 and any other merges.
  - Update `module.json` (`version` **and** the `download` URL).
  - Add a CHANGELOG top section.
  - Update every hard-coded copy of the old version string (grep the module for it).

## Shared files (read carefully)
- **Never edit** `styles/ag-ui.css`, `ag-launchers.mjs`, `ag-dialogs.mjs` or `ag-html.mjs`. They are byte-identical across modules and `check.mjs` fails if one differs.
- If this module doesn't ship `ag-dialogs.mjs` or `ag-html.mjs` yet, you may **add a byte-identical copy** (copy it from Character Hub on `main`).
- If you find a kit bug, or need a kit part that doesn't exist: **stop and report it**. It goes into a separate kit PR. Don't add `.ag-*` classes or kit copies to this module.
- **`scripts/ui-lint-baseline.json` is shared, so every module PR touches it and they will conflict.**
  - Merge `main` into your branch **last**, just before merging.
  - On a conflict in that file, take `main`'s version, run `node scripts/ui-lint.mjs --update-baseline`, then check that `git diff origin/main -- scripts/ui-lint-baseline.json` changes **only this module's entry**. Commit that.
  - Never raise another module's numbers.

## Rules that apply to every module pass
- **Data:** no saved-data, flag or setting-key changes. The same `data-action` names. Behaviour stays the same unless listed below.
- **Layout:** keep the window's layout unless this brief says otherwise. Change only type, spacing, shapes, controls, icons and kit parts.
- **Header:** `<h1><span class="ag-header__brand">Ashen Gate</span> | Locations</h1>`. On the right: module controls, then `.ag-version` (from `module.json` at runtime), then Help (ghost, small, `infoDialog`). No Alpha/Beta.
- **Tabs:** `.ag-tabs.ag-tabs--scroll`, `role="tab"`, `aria-selected`, icons `aria-hidden`. GM-only tabs last with `.ag-tab--gm`, GM Setup at the end.
- **Toolbar:** `.ag-toolbar`: `.ag-search`, then filters, then `.ag-toolbar__count`, then `__end` with the create action (plain `.ag-btn` with a +; D2).
- **Buttons:** one gold primary per pane, for Save/Apply only. `--danger` only for removing or resetting, always with a `confirmDialog(..., {danger: true})`. Icon-only buttons need `aria-label` and `data-tooltip`. No Unicode glyph icons.
- **Footer:** editors and GM Setup end with `.ag-footer`: Cancel (ghost) bottom-left, `.ag-footer__status`, primary bottom-right. Delete never sits next to Cancel.
- **D4 (Player Access):** Player Access is a normal GM Setup setting saved by GM Setup's **Save Changes**, not on its own and not instantly. Same setting key.
- **GM Setup:**
  - Settings only.
  - Developer Tools (seeders, QA resets, demo loaders) go in a collapsed GM-only `<details class="ag-devtools">` at the end of GM Setup.
  - Real data migrations are not dev tools.
- **Lists:** `.ag-rows` / `.ag-row` for records, `.ag-table` for data with 3+ columns, `.ag-badge` for status, `.ag-chip` for filters, `.ag-empty` (`__title` + `__text` + optional action) for empty states. Wording: "No X yet." plus the next step. Players never see GM instructions.
- **Tooltips:** `data-tooltip` (with `data-tooltip-class="ag-tooltip"`) replaces every `title=`. Disabled buttons show their reason as visible hint text.
- **Icons:** Font Awesome `fa-solid`, decorative ones `aria-hidden="true"`.
- **CSS:**
  - Tokens only, for colour, size, space and radius. Nothing under 11px.
  - Container queries instead of viewport `@media`.
  - Module classes use the module prefix (never `.ag-`).
  - Delete dead CSS.
- **Windows** open through `windowSize()` from `ag-html.mjs`, so Comfortable gets a 1.2× window.

## Lint targets for this module
| Lint rule | Baseline today | Target after this PR |
|---|---|---|
| `css-colour-literal` | 2 | **0** (game-meaning colours allowed only with `/* ag-lint-allow: reason */`) |
| `css-raw-font-size` | 12 | **0** |
| `css-legacy-alias` | 0 | **0** |
| `css-viewport-media` | 1 | **0** |
| `css-kit-prefix-class` | 1 | **0** |
| `js-dialogv2-direct` | 15 | **0** |
| `header-brand-version` | 2 | **0** |
| `button-title-attr` | 7 | **0** |
| `css-raw-px-box` | 114 | as low as practical; report what remains |

## Scope (`modules/ashen-gate-locations`)
Locations is already closest to the kit, so this is a tidy pass.
- **Header** (`app.mjs` about line 227 and `travel-view.mjs` about lines 42–43): add the brand span.
- **Editor footer:** `.agl-footer` (sticky, `bottom:-12px`) becomes `.ag-footer`. Cancel goes bottom-left, with **Delete moved away from Cancel** into the editor's header area. Place on Scene and Save Changes go bottom-right (Save is the primary).
- **List rows** (`app.mjs` about lines 264–271): `.agl-row` buttons inside `ul.ag-list > li` are double-padded. Use `.ag-rows` with `button.ag-row`. Keep the collapsible groups with counts.
- **Filters:** `.agl-filters` moves into the `.ag-toolbar` filters slot (selects or chips).
- **Badges:** threat levels use `.ag-badge` variants. "Deadly" as a solid danger fill stays, using kit tokens (drop the local `--agl-on-danger:#1a1408`).
- **Fields:** `.agl-ctl` and `.agl-mini` become `.ag-field` / `--inline`.
- **GM Setup scope:**
  - Import/Export JSON is content management, so it moves to the Locations tab toolbar `__end` (as `--sm`).
  - Developer Tools stays at the end of GM Setup as `.ag-devtools`.
- **D4:** Player Access saves immediately on checkbox change today (`data-action-change`, `app.mjs` about line 730). Make it save with GM Setup's Save Changes, along with Unidentified Pins and leg length.
- **Scrolling:** `.agl-setup` needs `flex:1; min-height:0` to scroll on its own (audit).
- **Kit-prefix class (1):** rename it.
- **Tooltips:** 7 button `title=` (26 `title=` overall) become `data-tooltip`.
- **CSS:** 12 rem font sizes go to tokens; 2 hex values go (keep the `--ag-danger` fallback out); 114 raw px values go to tokens; one viewport `@media` becomes a container query.
- **Travel pop-out:** same header, kit table for the watch table, opacity slider kept.

## Acceptance checks
1. `node scripts/check.mjs` is green: module tests, identical shared copies, lint (targets above met) and the playtest pack.
2. Add or update tests for every behaviour item in Scope: confirmations ask first and do nothing on Cancel, D4 saves only with Save Changes, labels and tooltips are present.
3. **Chromium renders** (reuse the Hub pilot's render approach or `docs/ui-kit-next/build-style-guide.mjs` plumbing).
   - Every tab, as GM and as a player (where players can open it).
   - Skins Standard, Stone Tablet, Parchment and Tome Pages, each in Compact and Comfortable.
   - Window widths 1180, 760 and 420.
   - Attach before/after images to the PR.
4. **Contrast:** text pairs at least 4.5:1 in every skin.
5. **Diff review:** only this module (plus its baseline entry), no data or setting-key changes, `data-action` names unchanged.

## Forge click steps for Robb (after merge)
- Open Locations as GM. Edit a location: Cancel bottom-left, Save Changes bottom-right, Delete in the editor header (asks "Delete location" in red).
- The list rows are compact (no double padding), and groups collapse.
- GM Setup: Player Access, Unidentified Pins and leg length all save with **Save Changes**.
- Import/Export are on the Locations toolbar.
- Open Travel: same header style, and the watch table is striped.
- Switch My Appearance to **Comfortable** and back: the window grows and nothing clips.
- Switch to **Tome Pages**: everything is readable.

## Only Robb can verify
- Place on Scene, pins and the travel flow with real scenes.
- Party Notes sharing as a player.
- Foundry core CSS interplay and real window resizing on The Forge.
