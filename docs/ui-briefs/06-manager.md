# Build brief 06: General Manager

Self-contained brief for a build chat. Single module: **`modules/ashen-gate-manager` only**, so it can run in parallel with briefs 04–12.

## Read first
- `CLAUDE.md`.
- `docs/ui-standard.md` (final).
- The General Manager section of `docs/ui-audit.md`. Line references there are from `b2cd06b`; re-locate them with grep.
- **Reference implementation:** Character Hub 0.22.0 on `main` (PR #177) is the finished pilot. Copy its patterns: header, kit rows, badges, empty states, `data-tooltip`, the `ag-dialogs.mjs` use, the `windowSize()` use, and the CSS token style.

## Branch, merge, version
- **Branch:** `ui/manager` from `main`, after the shared kit (#174), the Hub pilot (#177) and the dialogs sweep (#176) are on `main`. If #176 isn't merged yet, wait for it or merge `main` again before you start the dialog items.
- **PR:** a normal PR. Merge when green. **Only this module's files** plus the lint baseline (below).
- **Version:** **minor** bump above the module's version on `main` when you open the PR. Today ashen-gate-manager is 0.42.0 on `main`, so the next would be 0.43.0; recompute after #176 and any other merges.
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
- **Header:** `<h1><span class="ag-header__brand">Ashen Gate</span> | General Manager</h1>`. On the right: module controls, then `.ag-version` (from `module.json` at runtime), then Help (ghost, small, `infoDialog`). No Alpha/Beta.
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
| `css-colour-literal` | 3 | **0** (game-meaning colours allowed only with `/* ag-lint-allow: reason */`) |
| `css-raw-font-size` | 44 | **0** |
| `css-legacy-alias` | 6 | **0** |
| `css-viewport-media` | 4 | **0** |
| `css-kit-prefix-class` | 39 | **0** |
| `js-dialogv2-direct` | 24 | **0** |
| `header-brand-version` | 3 | **0** |
| `button-title-attr` | 9 | **0** |
| `css-raw-px-box` | 241 | as low as practical; report what remains |

## Scope (`modules/ashen-gate-manager`)
This pass covers the Manager window only. **Don't change** `scripts/appearance.js` behaviour or the skin files, except as listed. The size/skin controller is kit infrastructure.
- **Biggest visible bug:** delete the panel button override (`styles/manager.css` about lines 13 and 136–138, `.ashen-gate-manager .agmanager-row button, … .agmanager-panel button {…border-color:var(--ag-accent)}`). It beats every `.ag-btn--*` modifier: ghost Cancel buttons get gold borders, `--sm` stays tall, and `--danger` looks normal in Import, Folders, Core links, Modules, Scenes and GM Setup. Give every remaining unclassed button a kit class (`browse-view.js` has 12).
- **Appearance popover:** the selected skin card loses its highlight because of `manager.css` about line 184 (0,2,1 beats `.ag-skin-card.is-selected`). Fix the specificity. Also style `is-current`, or remove it.
- **Header** (`templates/manager.hbs` about lines 2–23):
  - Standard header, version on the right (not inside the h2).
  - "GM only" becomes `.ag-gm-flag` before the version, not after Help.
  - The emblem icon becomes `fa-boxes-stacked`, matching the window, launcher and Items tab (not `fa-dungeon`).
  - Remove the "v0.xx Beta" hard-coding in `manager.hbs` and the window title (`main.js`); read the version at runtime.
  - Settings menu label (`main.js` about line 2350): "Ashen Gate Manager / Open Import Manager" becomes "General Manager / Open General Manager".
- **Header and tabs stay put:** `.window-content` scrolls today, so the header and tabs scroll away. Use the `.ag-window` + `.ag-scroll` pattern. Remove the negative-margin hacks (`manager.css` about lines 161–162).
- **Footers:** replace `agmanager-mood-footer` (reused 8×) and `agmanager-footer` with `.ag-footer`. Cancel goes left wherever a form edits something (GM Setup, Import Apply, the Appearance popover).
- **Appearance:** the world-default skin is a GM setting. Keep the header popover (it's the quick switch), but GM Setup also gets a "World appearance" field saved by Save Changes. Both write the same setting.
- **Developer Tools:** "Load example" and the Pre-session check move to a GM-only `.ag-devtools` at the end of GM Setup. If the Pre-session check is a real GM tool, keep it as its own card instead; ask Robb if unsure.
- **Badges and pills:** `agmanager-badge`, `agmanager-chip`, `agmanager-beta` and `aglib-pill` become `.ag-badge` variants. Warn tone uses `--ag-warn`, not the accent. Error text in `.ag-badge` (`main.js` about lines 1995 and 2035) becomes `.ag-notice--danger` (check whether the sweep already did it).
- **Kit-prefix classes (39):** rename the module's own `.ag-*` classes to an `agm-` prefix (for example `.ag-skin-card`, `.ag-swatch`, `.ag-codex-card`, `.ag-rarity`). Keep old class names in markup only if another module uses them (grep all modules). `.ag-rarity--veryrare` now maps to the kit `data-rarity` badges.
- **Items tab:** merge the two stacked toolbars into one `.ag-toolbar`. One "Load compendiums", one Clear (filters) and one pager style (ghost-sm chevrons).
- **Tables:** `.agmanager-table` becomes `.ag-table` (stripes are invisible today because the even rows and the panel share a token). Wrap Organize and Clean tables in `.ag-table-wrap`. Give empty action headers an sr-only label.
- **Panels and cards:** remove the card-in-panel double boxes. A panel is an `.ag-section`; cards only for standalone items.
- **Empty states:** `.ag-empty` (History, Modules, Moods, Browse). Shorten the Core links empty text.
- **Fixed-height nested scrollers** (310, 340, 370, 480px): one scroll region per pane. Add `scrollable` to `PARTS` where needed so scroll is kept on re-render.
- **Words:** GM-visible internal notes are already removed by the sweep. Check the template for any left.
- **CSS:**
  - 44 raw font sizes and 241 raw px values go to tokens.
  - Mixed rem/px are unified.
  - Viewport `@media` becomes container queries.
  - Delete the ~25 dead selectors from the audit.
- **D4:** Manager's Player Access settings (if any are shown in GM Setup) save with Save Changes.

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
6. The Import, Modules, Scenes and GM Setup renders show ghost, small and danger buttons correctly (no gold borders). The Appearance popover shows the selected skin highlighted.

## Forge click steps for Robb (after merge)
- Open General Manager. On a long tab (Import or Organize), scroll down: the header and tabs stay visible.
- Import tab: Cancel is a plain ghost button (no gold border). "Remove…" is red.
- Header → Appearance: the current skin card is highlighted. Change the skin, then reopen: it's still marked.
- GM Setup: World appearance and the other settings save with Save Changes. Developer Tools at the bottom.
- Items tab: one toolbar, one pager.
- Switch My Appearance to **Comfortable** and back: the window grows and nothing clips.
- Switch to **Tome Pages**: everything is readable.

## Only Robb can verify
- Compendium browsing and the import flows with real packs.
- Scroll kept on re-render in Items and Organize.
- Foundry core CSS interplay and real window resizing on The Forge.
