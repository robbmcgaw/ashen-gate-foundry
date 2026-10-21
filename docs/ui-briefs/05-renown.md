# Build brief 05: Renown (Factions)

Self-contained brief for a build chat. Single module: **`modules/ashen-gate-factions` only**, so it can run in parallel with briefs 04–12.

## Read first
- `CLAUDE.md`.
- `docs/ui-standard.md` (final).
- The Renown (Factions) section of `docs/ui-audit.md`. Line references there are from `b2cd06b`; re-locate them with grep.
- **Reference implementation:** Character Hub 0.22.0 on `main` (PR #177) is the finished pilot. Copy its patterns: header, kit rows, badges, empty states, `data-tooltip`, the `ag-dialogs.mjs` use, the `windowSize()` use, and the CSS token style.

## Branch, merge, version
- **Branch:** `ui/renown` from `main`, after the shared kit (#174), the Hub pilot (#177) and the dialogs sweep (#176) are on `main`. If #176 isn't merged yet, wait for it or merge `main` again before you start the dialog items.
- **PR:** a normal PR. Merge when green. **Only this module's files** plus the lint baseline (below).
- **Version:** **minor** bump above the module's version on `main` when you open the PR. Today ashen-gate-factions is 0.12.0 on `main`, so the next would be 0.13.0; recompute after #176 and any other merges.
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
- **Header:** `<h1><span class="ag-header__brand">Ashen Gate</span> | Renown</h1>`. On the right: module controls, then `.ag-version` (from `module.json` at runtime), then Help (ghost, small, `infoDialog`). No Alpha/Beta.
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
| `css-raw-font-size` | 77 | **0** |
| `css-legacy-alias` | 5 | **0** |
| `css-viewport-media` | 10 | **0** |
| `css-kit-prefix-class` | 0 | **0** |
| `js-dialogv2-direct` | 1 | **0** |
| `header-brand-version` | 1 | **0** |
| `button-title-attr` | 2 | **0** |
| `css-raw-px-box` | 214 | as low as practical; report what remains |

## Scope (`modules/ashen-gate-factions`, shown as **Renown**)
This pass includes the **parked toolbar polish**. It is the one pass that changes structure, as decided (D10): the header spans the window and the folder list becomes the list column. Detailed plan: `docs/ui-pass-plan.md` → "Renown pass". Mockup of the target: style guide artifact, Renown pilot → Proposed (https://claude.ai/artifact/HwcmV3nQffwY7WmqggrVo4), in the D look.

### Shell
- **Window:** column layout: `.ag-header` (full width), then `.ag-tabs`, then the body.
- **Remove:** the negative tab margins (`module.css` about lines 72–74; tabs are drawn over the header today), the sidebar brand eyebrow and `<h2>Organizations</h2>`, and the duplicate min-size rules (about lines 181 and 203). Set the minimum once, in `DEFAULT_OPTIONS`.
- **Body (D10):** `.ag-split` with the folder list as `.ag-split__list` on Group, Player and Organizations; Pantheon full width as a card gallery (`.ag-card-grid`).
- **Header and scrolling:** the header and tabs no longer scroll away; only the detail pane scrolls.

### Toolbars (the parked polish)
- **Organizations:** one `.ag-toolbar`.
  - `.ag-search` that filters as you type (debounce about 200ms; today it filters on `change`).
  - Visibility, Sort and Group-by selects with `aria-label`.
  - `.ag-toolbar__count` ("6 of 12").
  - `__end`: Import and Export as `--sm`, and **New faction** (plain + button, opens `promptText`).
  - The collapsed "Organizations and folders" `<details>` no longer hides the create action.
  - "Load four draft guilds" moves to Developer Tools at the end of GM Setup.
- **Pantheon:** `.ag-toolbar` with a ghost "All deities" back button (only when a deity is open), the character select (`.ag-field--inline`), and `__end` **New deity** (dialog, not the inline input).
- **One character-picker partial,** identical in Player, Pantheon and Organizations. "Current character" shows the **name**, not `{{actorId}}` (`dashboard.hbs` about line 209).

### Content
- **Rows:** organizations become `.ag-rows`.
  - Visibility badge: Revealed (`--ok`), Hidden (plain), Characters only (`--accent`). Today Hidden and Characters only look the same.
  - Renown score and rank on the right.
  - Request, objective and resonance rows become `.ag-rows` too.
- **Standing:** `.ag-meter` (`role="progressbar"`). The milestone ladder becomes `.ag-steps` (rank dots) with `aria-current="step"`. The current milestone highlight works (today `.is-active` is never applied).
- **Editors** (faction profile, deity, field visibility, GM Setup): each ends with `.ag-footer` (Cancel / Save …). The Save buttons move there from mid-panel.
- **Buttons:**
  - Delete the `.agf-shell button{…}` override, the input `!important` overrides (19) and the select height override, so every control is the kit height.
  - Remove → `.ag-btn--danger` with `confirmDialog(danger)`.
  - "×" → `.ag-btn--icon` with `aria-label`.
  - **Deny request → confirm first** (today it doesn't).
  - `.agf-small` (undefined) → `--sm`.
  - `.agf-primary` (soft fill with an unreadable hover) → kit primary.
- **GM headings:** remove the "GM ·" prefixes inside GM-only tabs. Use `.ag-gm-flag` only on GM-only sections inside player tabs.
- **Empty states:** `.ag-empty` everywhere. The Pantheon GM hint must point at a visible Import.
- **D4:** "Save Player Access" becomes part of GM Setup's single Save Changes footer, together with damping and group name.
- **Help:** `infoDialog` (already true via `ag-dialogs.mjs`; check it).
- **CSS:**
  - All px font sizes go to tokens (77 today, including 9–10px text).
  - Radii go to tokens.
  - Replace `--agf-*` re-aliases and the legacy `--ag-bg` / `--ag-panel` with kit tokens.
  - Viewport `@media` (10) becomes container queries.
  - Delete the about 13 dead selector groups listed in the audit.
  - The holy-symbol plate colours are game art: keep them with `ag-lint-allow`.

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
6. The parked toolbar items above are each visible in the renders. The Organizations create action is visible without opening anything. Typing in search filters immediately.
7. Layout check: the header spans the full width over the folder list, the tabs sit under the header (no overlap), and Pantheon is full width.

## Forge click steps for Robb (after merge)
- Open Renown as GM. The header spans the whole window, with tabs below it (no overlap), the folder list on the left and details on the right.
- Organizations: type in Search and the list filters as you type. Change Sort and Group by. **New faction** is on the right of the toolbar.
- Remove a reward: the dialog says "Remove reward" in red. Cancel does nothing.
- Deny a request: it asks first.
- Pantheon: open a deity, use **All deities** to go back, and press **New deity**.
- GM Setup: change Player Access, damping and group name, then press **Save Changes** once. Developer Tools at the bottom holds "Load four draft guilds".
- As a player: Group, Player and Pantheon look right. Hidden factions show as locked rows.
- Switch My Appearance to **Comfortable** and back: the window grows and nothing clips.
- Switch to **Tome Pages**: everything is readable.

## Only Robb can verify
- Drag a faction onto a folder in the list column.
- Sharing with the party as a player.
- Scroll position is kept between tabs.
- Foundry core CSS interplay and real window resizing on The Forge.
