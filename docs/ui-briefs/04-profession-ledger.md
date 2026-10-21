# Build brief 04: Profession Ledger

Self-contained brief for a build chat. Single module: **`modules/ashen-gate-profession-ledger` only**, so it can run in parallel with briefs 04–12.

## Read first
- `CLAUDE.md`.
- `docs/ui-standard.md` (final).
- The Profession Ledger section of `docs/ui-audit.md`. Line references there are from `b2cd06b`; re-locate them with grep.
- **Reference implementation:** Character Hub 0.22.0 on `main` (PR #177) is the finished pilot. Copy its patterns: header, kit rows, badges, empty states, `data-tooltip`, the `ag-dialogs.mjs` use, the `windowSize()` use, and the CSS token style.

## Branch, merge, version
- **Branch:** `ui/ledger` from `main`, after the shared kit (#174), the Hub pilot (#177) and the dialogs sweep (#176) are on `main`. If #176 isn't merged yet, wait for it or merge `main` again before you start the dialog items.
- **PR:** a normal PR. Merge when green. **Only this module's files** plus the lint baseline (below).
- **Version:** **minor** bump above the module's version on `main` when you open the PR. Today ashen-gate-profession-ledger is 0.23.0 on `main`, so the next would be 0.24.0; recompute after #176 and any other merges.
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
- **Header:** `<h1><span class="ag-header__brand">Ashen Gate</span> | Profession Ledger</h1>`. On the right: module controls, then `.ag-version` (from `module.json` at runtime), then Help (ghost, small, `infoDialog`). No Alpha/Beta.
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
| `css-raw-font-size` | 0 | **0** |
| `css-legacy-alias` | 0 | **0** |
| `css-viewport-media` | 2 | **0** |
| `css-kit-prefix-class` | 0 | **0** |
| `js-dialogv2-direct` | 7 | **0** |
| `header-brand-version` | 1 | **0** |
| `button-title-attr` | 4 | **0** |
| `css-raw-px-box` | 42 | as low as practical; report what remains |

## Scope (`modules/ashen-gate-profession-ledger`)
Most markup is built as strings in `scripts/main.js`; `templates/ledger.hbs` is only a host.
- **Header** (`main.js` about line 1700): today it is a plain div, "Ashen Gate | **Profession Ledger**", with a full-size Help button. Use the standard header.
- **Tabs:** already `.ag-tabs` with scroll. Add `--scroll`, `role` and `aria-selected`; GM-only tabs (Assign, GM Setup) last with `.ag-tab--gm`.
- **Help** is an in-window view with a Back button today. Make it `infoDialog` (D8). If the sweep (#176) already did this, check it and move on.
- **GM Setup** already has the reference footer (Cancel, status, Save Changes). Keep it.
  - **D4:** Player Access is a toggle plus badge that applies immediately today. Make it a checkbox field saved by the footer's Save Changes.
- **D6: quality uses item rarity colours.**
  - Common → `data-rarity="common"`, Rare → `rare`, Exotic → `veryRare`.
  - Show quality as `.ag-rarity-badge` with that `data-rarity` wherever a find, bundle or exotic material is shown: the gathering result (`"(rare bundle)"`, `<p class="agl-exotic-find">`, about lines 1023–1025), the exotic picker (about line 1585, which says "Rarity: Exotic"), and material rows.
  - Keep the word the data uses: label it **"Quality: Exotic"**, not "Rarity".
  - **Boss-tier Exotic → `artifact` is future only. There is no tier field; don't add one.**
- **Tables:** `.agl-map` becomes `.ag-table` (sticky head, stripes, `th scope`). Keep the group rows (`tr.agl-map-group`) as section rows. The Assign table's empty row (`<td colspan="4">No characters to check.</td>`, about line 1523) becomes an `.ag-empty` under the table.
- **Rows and pills:** `.agl-line` and `.agl-roster-row` become `.ag-rows`. `.agl-count` and `.agl-chip` become `.ag-badge`. The custom `.agl-segmented` becomes kit `.ag-segmented`.
- **Unstyled state:** `.agl-exotic-row.is-off` has no CSS. Use the kit disabled row look.
- **Consent and gathering dialogs** (custom DialogV2): keep them custom, with the `ag-app ag-dialog` classes (the sweep adds them). Restyle their contents with `.ag-field` and kit buttons.
- **CSS:** two viewport `@media` rules (`ledger.css` about lines 42 and 124) become container queries. Use px spacing tokens.
- **Tooltips:** 4 button `title=` become `data-tooltip`.

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
6. D6: renders show quality badges in the rarity colours (Common grey, Rare blue, Exotic purple) in all four skins.

## Forge click steps for Robb (after merge)
- Open the Profession Ledger as GM. Header is "Ashen Gate | Profession Ledger" with version and Help on the right. Help opens a dialog with Close.
- GM Setup: untick Player Access. Nothing changes until **Save Changes**; Cancel restores it.
- Run a gathering roll that finds a Rare and an Exotic material: their badges are blue (Rare) and purple (Exotic) and read "Quality: …".
- As a player: the Ledger tabs work and the tables are striped.
- Switch My Appearance to **Comfortable** and back: the window grows and nothing clips.
- Switch to **Tome Pages**: everything is readable.

## Only Robb can verify
- The material consent and gathering roll dialogs as a player, with a GM online.
- Foundry core CSS interplay and real window resizing on The Forge.
