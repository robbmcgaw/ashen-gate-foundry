# Build brief 12: Utilities

Self-contained brief for a build chat. Single module: **`modules/ashen-gate-utilities` only**, so it can run in parallel with briefs 04–12.

## Read first
- `CLAUDE.md`.
- `docs/ui-standard.md` (final).
- The Utilities section of `docs/ui-audit.md`. Line references there are from `b2cd06b`; re-locate them with grep.
- **Reference implementation:** Character Hub 0.22.0 on `main` (PR #177) is the finished pilot. Copy its patterns: header, kit rows, badges, empty states, `data-tooltip`, the `ag-dialogs.mjs` use, the `windowSize()` use, and the CSS token style.

## Branch, merge, version
- **Branch:** `ui/utilities` from `main`, after the shared kit (#174), the Hub pilot (#177) and the dialogs sweep (#176) are on `main`. If #176 isn't merged yet, wait for it or merge `main` again before you start the dialog items.
- **PR:** a normal PR. Merge when green. **Only this module's files** plus the lint baseline (below).
- **Version:** **minor** bump above the module's version on `main` when you open the PR. Today ashen-gate-utilities is 0.15.0 on `main`, so the next would be 0.16.0; recompute after #176 and any other merges.
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
- **Header:** `<h1><span class="ag-header__brand">Ashen Gate</span> | Utilities</h1>`. On the right: module controls, then `.ag-version` (from `module.json` at runtime), then Help (ghost, small, `infoDialog`). No Alpha/Beta.
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
| `css-colour-literal` | 0 | **0** (game-meaning colours allowed only with `/* ag-lint-allow: reason */`) |
| `css-raw-font-size` | 11 | **0** |
| `css-legacy-alias` | 1 | **0** |
| `css-viewport-media` | 2 | **0** |
| `css-kit-prefix-class` | 3 | **0** |
| `js-dialogv2-direct` | 0 | **0** |
| `header-brand-version` | 1 | **0** |
| `button-title-attr` | 3 | **0** |
| `css-raw-px-box` | 55 | as low as practical; report what remains |

## Scope (`modules/ashen-gate-utilities`)
HTML is built in `scripts/main.mjs`. Already close to the kit.
- **Header** (`main.mjs` about line 229): right side order is Appearance (when Manager is present), then version, then Help. Today the version comes after Help. Remove the header button shrink override (`utilities.css` about line 4).
- **Buttons:** normalise `btn()` (about line 34) so `kind` maps only to kit classes:
  - `primary` → `ag-btn--primary`, `danger` → `ag-btn--danger`, `sm` → `ag-btn--sm`, default → `ag-btn`.
  - Non-class kinds (`deposit`, `withdraw`, `purse-take`) move to `data-*`.
  - "Award Gold" looks the same everywhere.
  - The two conflicting `agu-roll-large` rules (`utilities.css` about lines 39 and 80) become one.
- **Badges:** `.ag-badge agu-pill` (14px pills) becomes plain `.ag-badge` variants. If the check result needs a big verdict, use a dedicated `.agu-verdict` style, not a badge.
- **Kit-prefix classes (3):** `.ag-checkbar`, `.ag-result` and `.ag-result-verdict` become `.agu-…` (the kit-2 PR may already have renamed some; check).
- **Labels:** delete the global `.ag-utilities label{display:block;…}` (about line 19). Use `.ag-field` / `--inline`.
- **GM Setup:** the checkboxes plus in-card "Save Changes" become an `.ag-footer` with Cancel / Save Changes (**D4**: Player Access saves there).
- **Empty states:** `agu-empty` (no CSS) and `.agu-ov-empty` become `.ag-empty` (`__title` + `__text`).
- **Stash table:** keep the ARIA grid and container query; add row stripes (`--ag-row-alt`).
- **Shop (new since the audit, Utilities 0.14–0.15):** its UI (if any) uses kit rows, badges and toolbar. It's rules-only today, so there may be nothing to do.
- **CSS:** 11 raw font sizes and 55 raw px values go to tokens; legacy `--ag-bg` (1) goes; 2 viewport `@media` become container queries; `.agu-participant` is defined twice (lines 12 and 59), keep one.
- **Tooltips:** 3 button `title=` become `data-tooltip`.

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
- Open Utilities as GM. Header right side: Appearance, version, Help.
- Group check: buttons look consistent, and the verdict is clear.
- Stash: rows are striped. Award Gold looks the same everywhere.
- GM Setup: Cancel bottom-left, Save Changes bottom-right; Player Access saves only on Save.
- Switch My Appearance to **Comfortable** and back: the window grows and nothing clips.
- Switch to **Tome Pages**: everything is readable.

## Only Robb can verify
- Party vote and roll flows with several players.
- The conditions overlay over the canvas.
- Foundry core CSS interplay and real window resizing on The Forge.
