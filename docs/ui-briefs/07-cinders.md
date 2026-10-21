# Build brief 07: Ashen Gate | Cinders

Self-contained brief for a build chat. Single module: **`modules/ashen-gate-cinders` only**, so it can run in parallel with briefs 04–12.

## Read first
- `CLAUDE.md`.
- `docs/ui-standard.md` (final).
- The Ashen Gate | Cinders section of `docs/ui-audit.md`. Line references there are from `b2cd06b`; re-locate them with grep.
- **Reference implementation:** Character Hub 0.22.0 on `main` (PR #177) is the finished pilot. Copy its patterns: header, kit rows, badges, empty states, `data-tooltip`, the `ag-dialogs.mjs` use, the `windowSize()` use, and the CSS token style.

## Branch, merge, version
- **Branch:** `ui/cinders` from `main`, after the shared kit (#174), the Hub pilot (#177) and the dialogs sweep (#176) are on `main`. If #176 isn't merged yet, wait for it or merge `main` again before you start the dialog items.
- **PR:** a normal PR. Merge when green. **Only this module's files** plus the lint baseline (below).
- **Version:** **minor** bump above the module's version on `main` when you open the PR. Today ashen-gate-cinders is 0.4.0 on `main`, so the next would be 0.5.0; recompute after #176 and any other merges.
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
- **Header:** `<h1><span class="ag-header__brand">Ashen Gate</span> | Cinders</h1>`. On the right: module controls, then `.ag-version` (from `module.json` at runtime), then Help (ghost, small, `infoDialog`). No Alpha/Beta.
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
| `css-raw-font-size` | 4 | **0** |
| `css-legacy-alias` | 0 | **0** |
| `css-viewport-media` | 0 | **0** |
| `css-kit-prefix-class` | 0 | **0** |
| `js-dialogv2-direct` | 1 | **0** |
| `header-brand-version` | 1 | **0** |
| `button-title-attr` | 1 | **0** |
| `css-raw-px-box` | 33 | as low as practical; report what remains |

## Scope (`modules/ashen-gate-cinders`)
- **Header** (`templates/cinders.hbs` lines 2–5): today it's an icon plus a 14px `<strong>`. Use the standard header with `h1` and brand. Help: ghost small, `infoDialog` (the sweep fixes the confirm; check it). The title still appears in the window bar; that's fine.
- **Tabs:** remove the local `.agc-active`. Use the kit active state with `aria-selected`.
- **Toolbar:** `.agc-toolbar` becomes `.ag-toolbar`, with the Character field inline. **New Cinder** moves to `__end` as a plain + button. When disabled, its reason shows as visible hint text, not only as a title.
- **Cards:** `.agc-card` becomes `.ag-card` (kit padding, radius and border). The loose Player Access row (`cinders.hbs` about lines 76–77) moves inside GM Setup.
- **Strain:** the same component as the Hub. The Hub pilot made Strain a slim `.ag-meter` with its number beside it, the band tone (warn, then danger) and a "+N over" `.ag-badge--danger`. Use the identical markup and classes, so Strain looks the same in both windows. The bar's absolute-positioned label clipping goes away.
- **Tables:** `.agc-table` becomes `.ag-table` (`th scope` kept, stripes). Give the 4-column Manage table a narrow fallback (stacked rows under 40rem).
- **Empty states:** `.ag-empty`, with the same wording as the Hub for the same state:
  - "No Cinder bound to this character yet."
  - "No powers unlocked yet. Unlock them in Skill Trees."
  - "No Cinders yet. Create one with New Cinder, then bind it."
- **Badges:** band name, "+N over" and "moved from older data" become `.ag-badge` variants.
- **D4:** the Player Access row saves with GM Setup's Save Changes (add a GM Setup footer if there isn't one).
- **Chat cards** (`.agc-chat`, `.agc-backfire`, outside any window): token colours only. They rely on `:root` tokens, so check them with and without Manager.
- **CSS:** 4 raw font sizes (including an off-scale 15px) and 33 raw px values go to tokens.

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
6. Side-by-side render of Strain in Cinders and in Character Hub with the same values: identical markup and look.

## Forge click steps for Robb (after merge)
- Open Cinders as GM. Standard header with Help on the right; Help has Close.
- Pick a character: Strain looks exactly like the Hub's Strain bar. Push it over the top: a red "+N over" badge.
- Manage: **New Cinder** is on the right. Unbind asks "Unbind Cinder" in red.
- GM Setup: Player Access saves with Save Changes.
- Post a Backfire to chat: it's readable in Standard and Tome Pages.
- Switch My Appearance to **Comfortable** and back: the window grows and nothing clips.
- Switch to **Tome Pages**: everything is readable.

## Only Robb can verify
- Push and Backfire rolls from a player client with the GM online.
- Chat card look in the Foundry chat log.
- Foundry core CSS interplay and real window resizing on The Forge.
