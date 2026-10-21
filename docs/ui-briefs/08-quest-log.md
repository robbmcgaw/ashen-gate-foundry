# Build brief 08: Quest Log

Self-contained brief for a build chat. Single module: **`modules/ashen-gate-quest-manager` only**, so it can run in parallel with briefs 04–12.

## Read first
- `CLAUDE.md`.
- `docs/ui-standard.md` (final).
- The Quest Log section of `docs/ui-audit.md`. Line references there are from `b2cd06b`; re-locate them with grep.
- **Reference implementation:** Character Hub 0.22.0 on `main` (PR #177) is the finished pilot. Copy its patterns: header, kit rows, badges, empty states, `data-tooltip`, the `ag-dialogs.mjs` use, the `windowSize()` use, and the CSS token style.

## Branch, merge, version
- **Branch:** `ui/quest-log` from `main`, after the shared kit (#174), the Hub pilot (#177) and the dialogs sweep (#176) are on `main`. If #176 isn't merged yet, wait for it or merge `main` again before you start the dialog items.
- **PR:** a normal PR. Merge when green. **Only this module's files** plus the lint baseline (below).
- **Version:** **minor** bump above the module's version on `main` when you open the PR. Today ashen-gate-quest-manager is 0.9.0 on `main`, so the next would be 0.10.0; recompute after #176 and any other merges.
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
- **Header:** `<h1><span class="ag-header__brand">Ashen Gate</span> | Quest Log</h1>`. On the right: module controls, then `.ag-version` (from `module.json` at runtime), then Help (ghost, small, `infoDialog`). No Alpha/Beta.
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
| `css-colour-literal` | 1 | **0** (game-meaning colours allowed only with `/* ag-lint-allow: reason */`) |
| `css-raw-font-size` | 10 | **0** |
| `css-legacy-alias` | 3 | **0** |
| `css-viewport-media` | 3 | **0** |
| `css-kit-prefix-class` | 62 | **0** |
| `js-dialogv2-direct` | 0 | **0** |
| `header-brand-version` | 1 | **0** |
| `button-title-attr` | 1 | **0** |
| `css-raw-px-box` | 83 | as low as practical; report what remains |

## Scope (`modules/ashen-gate-quest-manager`)
- **Header:** already uses the brand. Reorder the right side: "Show/Hide Objectives Overlay" (module control), then version, then Help (ghost small). Today the version is last after the buttons. The tab buttons get `type="button"`.
- **Footer:** `.ag-footer` is an info strip of permission notes today. Make the notes an `.ag-notice--info` in the relevant tab, and keep `.ag-footer` for editors only.
- **Quests tab toolbar:** `.ag-quest-toolbar` (create on the left today) becomes `.ag-toolbar`: search, status chips (Active / Done / Failed), count, and `__end` with **New quest** (plain +), plus Import and Export as `--sm`.
- **Quest list:** `<button class="ag-quest-card">` (text probably centred today) becomes `.ag-rows` with `button.ag-row`:
  - title, giver and location meta (icons `aria-hidden`);
  - an objectives count (`2/4`), a thin progress bar and a status badge;
  - grouped under eyebrow headings with counts.
- **Editor:**
  - "Save Quest Definition" (mid-form today) and "Save Progress & Reveal" move to an `.ag-footer`: Cancel left, primary right.
  - "Delete Quest" and "Delete Assignment" move away from Save into the editor's header area, as `--danger` with the confirm.
  - Fields use `.ag-field` / `.ag-form-grid`.
- **Kit-prefix classes (62):** rename the module's own `.ag-quest-*` classes to an `agq-` prefix. Search other modules for the old names first; Character Hub embeds Quest Log content. If another module uses one, keep it as an alias for one release and note it.
- **Chips:** `.ag-quest-chip` becomes `.ag-badge` (status) or `.ag-chip` (filters).
- **Empty states:** `.ag-quest-empty` becomes `.ag-empty`.
- **Buttons:** `safeButton` stops emitting `title=""`. Map `primary|secondary|danger` to `ag-btn--primary`, `ag-btn` and `ag-btn--danger`.
- **Overlay tracker:** keep it as it is (fixed, outside `.ag-app`), but token colours only. Close "✕" becomes an icon button with `aria-label`.
- **Embed container query:** `@container (max-width:620px)` needs a `container-type`. Add it on the embed root.
- **D4:** "Save Player Access" becomes part of GM Setup's single Save Changes footer. Keep the test that checks a non-GM can't change it, and update the test that matches "Save Player Access" text.
- **CSS:** replace the legacy `--ag-panel` (3) with kit tokens; 10 raw font sizes and 83 raw px values go to tokens; viewport `@media` becomes container queries.

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
6. Embeds of Quest Log inside other modules (grep for the embed API) still render. Check one host render.

## Forge click steps for Robb (after merge)
- Open Quest Log as GM → Quests. **New quest** is on the right of the toolbar. The list shows titles left-aligned with objective counts and status badges.
- Edit a quest: Cancel bottom-left, Save bottom-right. Delete asks "Delete quest" in red, naming the quest.
- GM Setup: Player Access saves with Save Changes.
- Toggle the Objectives Overlay: it still works and closes with its round ✕.
- As a player: Party and Individual tabs read well.
- Switch My Appearance to **Comfortable** and back: the window grows and nothing clips.
- Switch to **Tome Pages**: everything is readable.

## Only Robb can verify
- Quest Log embedded in Character Hub and Headquarters.
- Overlay position over the canvas.
- Foundry core CSS interplay and real window resizing on The Forge.
