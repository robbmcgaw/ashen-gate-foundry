# Build brief 11: Skill Trees

Self-contained brief for a build chat. Single module: **`modules/ashen-gate-skill-trees` only**, so it can run in parallel with briefs 04–12.

## Read first
- `CLAUDE.md`.
- `docs/ui-standard.md` (final).
- The Skill Trees section of `docs/ui-audit.md`. Line references there are from `b2cd06b`; re-locate them with grep.
- **Reference implementation:** Character Hub 0.22.0 on `main` (PR #177) is the finished pilot. Copy its patterns: header, kit rows, badges, empty states, `data-tooltip`, the `ag-dialogs.mjs` use, the `windowSize()` use, and the CSS token style.

## Branch, merge, version
- **Branch:** `ui/skill-trees` from `main`, after the shared kit (#174), the Hub pilot (#177) and the dialogs sweep (#176) are on `main`. If #176 isn't merged yet, wait for it or merge `main` again before you start the dialog items.
- **PR:** a normal PR. Merge when green. **Only this module's files** plus the lint baseline (below).
- **Version:** **minor** bump above the module's version on `main` when you open the PR. Today ashen-gate-skill-trees is 0.18.0 on `main`, so the next would be 0.19.0; recompute after #176 and any other merges.
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
- **Header:** `<h1><span class="ag-header__brand">Ashen Gate</span> | Skill Trees</h1>`. On the right: module controls, then `.ag-version` (from `module.json` at runtime), then Help (ghost, small, `infoDialog`). No Alpha/Beta.
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
| `css-raw-font-size` | 33 | **0** |
| `css-legacy-alias` | 0 | **0** |
| `css-viewport-media` | 0 | **0** |
| `css-kit-prefix-class` | 0 | **0** |
| `js-dialogv2-direct` | 2 | **0** |
| `header-brand-version` | 1 | **0** |
| `button-title-attr` | 15 | **0** |
| `css-raw-px-box` | 110 | as low as practical; report what remains |

## Scope (`modules/ashen-gate-skill-trees`)
Keep the board and node graph as they are (canvas-like). The pass changes the chrome and the node text.
- **Header** (`templates/tree.hbs` lines 2–5): today it's an icon plus a 16px `strong`, with an accent-coloured version. Use the standard header; the version is muted `.ag-version`.
- **Tabs:** `agst-tab agst-active` becomes the kit active state with `aria-selected`. Tree Library and GM Setup are GM-only, last.
- **Tree Library:** add an `.ag-toolbar`: search, count, and `__end` **New tree** (plain +; it's on the left today).
- **Nodes:**
  - **Full names** (no line clamp, no ellipsis on the status). The node box grows in height instead (`trees.css` about lines 71–80); keep the width.
  - **One tooltip:** remove `title="{{name}} · {{reason}}"` (`tree.hbs` about line 149) and keep the corner `.agst-tip`. The tip's state badges become `.ag-badge--ok` / `--accent` (not `.agst-tip-*` recolours).
- **Stat labels:** typed in capitals in the markup ("LEVEL", "TO CHOOSE"). Make them sentence case, with uppercase through `.ag-eyebrow`.
- **Setup cards:** `.agst-setup-card` and `.agst-dev-tools` become `.ag-card` / `.ag-devtools`.
- **Developer Tools split:**
  - Real migrations ("Import Ledger perk choices", legacy review, backup & clear) leave Developer Tools and become their own labelled GM Setup card ("Data tools"), with confirms.
  - QA install and reset stay in `.ag-devtools`.
  - The dev-tools copy names no setting content.
- **D4:** the Player Access toggle (applies immediately today) saves with a GM Setup **Save Changes** footer.
- **Dialog forms:** `.agst-form` becomes `.ag-field` / `.ag-form-grid`. `.agst-resolve-table` (no CSS today) becomes `.ag-table`.
- **Empty states:** `.agst-no-tree`, `.agst-board-hint`, `.agst-empty`, `.agst-no-selection` and `.agst-start` become `.ag-empty` (keep the board hint as an `.ag-notice--info` if it's guidance).
- **Icons:** the ⟲ reset-zoom glyph becomes `fa-rotate-left` in an icon button. The 2 `fa-regular` icons are fine only if they are outline/filled pairs.
- **Buttons:** remove the duplicate focus ring and disabled rules (`trees.css` about lines 5–6). "Review" stays `--sm` (not `--sm --primary`) unless it's the pane's commit action.
- **CSS:**
  - 33 raw font sizes and 110 raw px values go to tokens. Remove the `--agst-*` token re-aliases.
  - Keep the container queries (good already).
  - The SVG link styles keep their meaning (All / Any dashed / Exclude dotted / Linked); colours come from tokens.
  - 6 inline `style=` stay only for positions.
- **Tooltips:** 15 button `title=` become `data-tooltip`.

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
6. Node check: a tree with long perk names (60+ characters) shows the whole name in compact and normal node sizes, at Compact and Comfortable. One tooltip per node.

## Forge click steps for Robb (after merge)
- Open Skill Trees as a player. Long perk names show in full; hovering a node shows one tooltip.
- Ctrl+wheel zoom and the reset-zoom button (a ↺ icon) work.
- As GM → Tree Library: **New tree** is on the right of a toolbar with search.
- GM Setup: Player Access saves with Save Changes. "Data tools" is its own card; Developer Tools at the bottom has only the QA items.
- Switch My Appearance to **Comfortable** and back: the window grows and nothing clips.
- Switch to **Tome Pages**: everything is readable.

## Only Robb can verify
- Perk unlock and refund flows with real trees.
- The board's pan and zoom feel.
- Foundry core CSS interplay and real window resizing on The Forge.
