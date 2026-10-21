# Build brief 10: Headquarters

Self-contained brief for a build chat. Single module: **`modules/ashen-gate-headquarters` only**, so it can run in parallel with briefs 04–12.

## Read first
- `CLAUDE.md`.
- `docs/ui-standard.md` (final).
- The Headquarters section of `docs/ui-audit.md`. Line references there are from `b2cd06b`; re-locate them with grep.
- **Reference implementation:** Character Hub 0.22.0 on `main` (PR #177) is the finished pilot. Copy its patterns: header, kit rows, badges, empty states, `data-tooltip`, the `ag-dialogs.mjs` use, the `windowSize()` use, and the CSS token style.

## Branch, merge, version
- **Branch:** `ui/headquarters` from `main`, after the shared kit (#174), the Hub pilot (#177) and the dialogs sweep (#176) are on `main`. If #176 isn't merged yet, wait for it or merge `main` again before you start the dialog items.
- **PR:** a normal PR. Merge when green. **Only this module's files** plus the lint baseline (below).
- **Version:** **minor** bump above the module's version on `main` when you open the PR. Today ashen-gate-headquarters is 0.11.0 on `main`, so the next would be 0.12.0; recompute after #176 and any other merges.
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
- **Header:** `<h1><span class="ag-header__brand">Ashen Gate</span> | Headquarters</h1>`. On the right: module controls, then `.ag-version` (from `module.json` at runtime), then Help (ghost, small, `infoDialog`). No Alpha/Beta.
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
| `css-raw-font-size` | 24 | **0** |
| `css-legacy-alias` | 2 | **0** |
| `css-viewport-media` | 3 | **0** |
| `css-kit-prefix-class` | 0 | **0** |
| `js-dialogv2-direct` | 0 | **0** |
| `header-brand-version` | 4 | **0** |
| `button-title-attr` | 0 | **0** |
| `css-raw-px-box` | 94 | as low as practical; report what remains |

## Scope (`modules/ashen-gate-headquarters`)
HTML is built in `js/main.mjs` and `js/facilities-tab.mjs`; `templates/main.hbs` is a host. Keep the builder layout (three columns, board in the middle).
- **Header** (`js/main.mjs` about lines 196–206):
  - The header always reads "Ashen Gate | Headquarters" with the brand, never the Guildhall's name. Show the Guildhall name as the subtitle `<p>`.
  - Version on the right, without "Alpha"; Help ghost small with `infoDialog` (the sweep did Help; check it).
- **Tabs:**
  - Delete `.aghq-content button.active{…}` (`headquarters.css` about line 5); it tints the active tab and every `.active` button.
  - Before activation, the "Activation" tab is fine as its own tab.
  - Room tabs (`.aghq-roomtabs`) become `.ag-segmented` if there are 2–4 rooms, otherwise an `.ag-tabs--scroll` sub-strip.
- **Buttons:**
  - Every bare `<button>` gets a kit class. "Save Changes" is primary.
  - Danger becomes `.ag-btn--danger` (not `.aghq-danger` with `!important`).
  - No stretched buttons: remove `flex:1` from `.aghq-toolrow button` and `.aghq-roster button`, and `min-width:130px` from the footer.
- **GM Setup (`manage`):**
  - One Save Changes footer for Player Access, config and the ranks table. Today there are two identical "Save Changes" buttons plus a separate Player Access save (**D4**).
  - "Create Missing Player Rooms" and Set Rank stay as actions in their own cards.
- **Developer Tools:** `<details class="aghq-dev">` moves out of Facilities into an `.ag-devtools` at the end of GM Setup.
- **Footer:** `.aghq-footer` becomes `.ag-footer`. Left: "Auto-saved · Editor/View only" (the sweep removed the revisions). Right: Edit Guildhall / Finish Editing on the Builder tab.
- **Icons:** Unicode glyphs become Font Awesome:
  - ⚒ ✎ ▣ on tiles become `fa-hammer`, `fa-pen` and `fa-square`;
  - ♙ for a missing photo becomes `fa-user`;
  - ✎ on room tabs becomes `fa-pen`.
  - The zoom − and + buttons become `.ag-btn--icon` with `aria-label` and a tooltip.
  - `fas fa-building` (settings menu, about line 481) becomes `fa-solid`.
- **Lists:** `.aghq-copy`, `.aghq-catalogrow`, `.aghq-benefit` and `.aghq-hire-card` become `.ag-rows` or `.ag-card` where they stand alone. `.aghq-chip` becomes `.ag-badge`. The ranks table becomes `.ag-table`.
- **Empty states:** `.aghq-empty`, the undefined `.aghq-emptycopy` and plain `<p>` become `.ag-empty`.
- **CSS:**
  - 24 raw font sizes (including `9px !important`) go to tokens; legacy `--ag-bg` / `--ag-panel` and the 2 hex shadows go.
  - Viewport `@media` becomes container queries. Replace the magic `calc(100% - 56px)`.
  - Keep the three-column builder grid, but use tokens for its column widths.
- **Test harness:** `tests/browser-harness.html` must load `ag-ui.css` too, and drop its hard-coded colours.

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
6. Builder layout check: same three columns, and the board zoom works in renders at 1180 and 760.

## Forge click steps for Robb (after merge)
- Open Headquarters as GM. The header says "Ashen Gate | Headquarters" with the Guildhall name underneath.
- Tabs: the active tab looks like other modules' (not tinted).
- Builder: tile icons are proper icons; zoom − and + have tooltips. The footer shows "Auto-saved · Editor".
- GM Setup: one Save Changes for Player Access, config and ranks. Developer Tools at the bottom.
- Facilities and hirelings: removing or unassigning asks first.
- As a player: Personal Quarters empty text points at the GM Setup tab, and there's no debug text.
- Switch My Appearance to **Comfortable** and back: the window grows and nothing clips.
- Switch to **Tome Pages**: everything is readable.

## Only Robb can verify
- Edit lease (two GMs or a GM and a player editing).
- Drag in the builder.
- The embedded Guildhall view (`api.embed.mount`) in other modules.
- Foundry core CSS interplay and real window resizing on The Forge.
