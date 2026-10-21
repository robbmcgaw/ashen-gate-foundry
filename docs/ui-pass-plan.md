# Ashen Gate UI pass plan (final)

Status: final, 2026-10-21. Small PRs in this order. Each follows the normal workflow: branch, version bump, CHANGELOG line, `node scripts/check.mjs`. No pass changes saved data, settings keys or flags, except the new Manager `uiSize` client setting in PR 1. Any pass that would change saved data must stop and ask.

Read with `docs/ui-audit.md` (the problems, with file references) and `docs/ui-standard.md` (the target). Build briefs for PRs 1–3 are in `docs/ui-briefs/`.

## Verification without live Foundry

Every pass is checked the same way before Robb sees it:

1. **Unit tests** for any logic touched (confirm helper wiring, labels, filters). `node scripts/check.mjs <module>`.
2. **Chromium renders** (Playwright is preinstalled in the cloud container, `/opt/pw-browsers`). A throwaway preview script, as in the earlier Hub passes:
   - builds the real window HTML with mocked data (call the module's view functions, or compile its `.hbs` with Handlebars);
   - wraps it in a minimal Foundry window shell, loads `ag-ui.css`, the module CSS and, for structural skins, Manager's skin CSS;
   - sets `html[data-ag-skin]` and the token values from `manager/scripts/appearance.js` for each of the seven skins;
   - screenshots at window widths 1180, 760 and 420px, in Compact and Comfortable, plus one with Manager absent (kit defaults).
   Compare before/after screenshots side by side and attach the set to the PR. The style-guide build (`docs/ui-kit-next/build-style-guide.mjs`) already does the skin plumbing and can be reused.
3. **Contrast check** of the token pairs per skin (text/surface, muted/raised, accent-contrast/accent, rarity ink/raised), computed from the skin tables in `appearance.js`. Fails under 4.5:1 for text.

**Only Robb can verify live:** real Foundry core CSS interaction (`themed` light/dark classes, core button and input rules), DialogV2 rendering and button order, `data-tooltip` behaviour, drag-and-drop, window resize and scroll restoration, The Forge asset paths, player vs GM permissions on a second login, and dnd5e item tooltips.

## Base look and size (decided 2026-10-21)

Robb chose **direction D, Rounded Compact**, as the base, keeping the dark gold skins. He also wants a per-user **Comfortable** size for accessibility, using direction C's larger scale. Mockups: https://claude.ai/artifact/CzrqMiTA1VJ9Kiyahhi1At (direction D has the Compact/Comfortable switch). Final token values: `docs/ui-standard.md` §2.

### What D means for the kit
- **Shape** is the same in both sizes: pill buttons, tabs and inputs (a new `--ag-radius-control: 999px`; `--ag-radius` stays a box radius, 8px, because module CSS already uses it for panels), round icon chips, circle portraits and slots, an HP ring around the portrait, a Strain orb, rank dots, and cards with 14px corners. Text areas get 10px corners.
- **Font:** Signika, which ships with Foundry, so nothing needs bundling. Nunito stays optional (about 60 KB of woff2) and is not in the plan.
- **Shape is not size.** Radius tokens stay out of the size sets, so the structural skins (Stone Tablet, Tome Pages) keep overriding corners as they do today.

### Two size sets, one switch

The kit's size tokens get two value sets. Everything that has a size reads a token.

| Token group | Compact (default = D) | Comfortable (= C scale) |
|---|---|---|
| Type `--ag-text-xs/sm/md/lg/xl` | 11 · 11.5 · 13 · 14 · 17 | 11 · 12.5 · 14 · 17 · 21 |
| Spacing `--ag-space-1…6` | 3 · 6 · 8 · 12 · 16 · 24 | 4 · 8 · 12 · 16 · 24 · 32 |
| Controls `--ag-control-h / -h-sm / --ag-icon-btn` | 28 · 24 · 26 | 36 · 30 · 32 |
| Icons `--ag-icon` / chip `--ag-icon-chip` (new) | 12 · 24 | 14 · 32 |
| Slots `--ag-slot` | 38 | 48 |
| Portrait `--ag-portrait` (new) | 56 | 84 |
| Row height `--ag-row-h` (new) | 32 | 44 |

- **Where the values live:** in `ag-ui.css`, as `:root { …compact… }` and `html[data-ag-size="comfortable"] { …comfortable… }`. This is the same mechanism the skins use with `html[data-ag-skin]`.
- **Who sets it:** General Manager owns shared appearance, so it registers a client-scope setting, `uiSize`, with the values `compact` and `comfortable`. Client scope means per device: Robb can use Comfortable on the phone or tablet and Compact on the laptop. The choice goes in **My Appearance** and the GM Appearance popover, next to the skin. Manager writes `data-ag-size` on `<html>`, the way it writes `data-ag-skin` today.
  - User scope instead would make the choice follow the person across devices. That is a one-word change if Robb prefers it.
- **Without Manager:** no attribute is set, so modules render Compact and still open. No module reads the setting itself.
- **Window sizes:** Comfortable needs bigger windows, about 1.2× the default width and height.
  - The shared helper `ag-html.mjs` gets `windowSize({width, height})`, which reads `document.documentElement.dataset.agSize` and scales the defaults.
  - Each module calls it in `DEFAULT_OPTIONS.position`. Windows the user has already resized keep their size.
- **Canvases:** the Skill Trees board and the HQ builder keep their own zoom and are not resized by the size set. Their toolbars and side panels follow it.

### Cost: build it in now vs. retrofit later

**Built in from the start (recommended):**
- **Kit release (PR 1):** two token blocks (about 40 lines) plus about 5 new tokens.
- **Manager:**
  - the setting plus the controller writing `data-ag-size` (about 40 lines);
  - the switch in My Appearance and the GM popover;
  - unit tests on the controller (`appearance.js`) and `syncSkinStylesheet`-style attribute handling.
  - About half a day of work in that PR.
- **Each module pass:**
  - Almost no extra code, because every pass already replaces raw px with tokens (the drift lint enforces it).
  - The real extra cost is checking: the preview script renders Compact and Comfortable, so the screenshot set doubles (2 sizes × 7 skins × 3 widths). It is automated, so the cost is review time.
- **Robb's live check per pass:** one extra step, switching to Comfortable in My Appearance and opening the window.

**Retrofitted after the module passes:**
- Every module gets a second pass to find sizes that were tokenised to the wrong token or left as px in JS. Examples: inline `style="width:…"`, Hub slot sizes in script, Skill Trees node boxes, the HQ grid columns, Manager's fixed-height scrollers.
- Windows get re-tested at the bigger scale for overflow.
- Estimate: about one extra small PR per module (10 PRs), plus fixing layouts that only worked at one size. Roughly 2–3× the built-in cost, and every module is touched twice.

### Shared files touched
| File | Change |
|---|---|
| `styles/ag-ui.css` (all modules, byte-identical) | Two size sets plus the new size tokens. Kit components read only tokens. |
| Manager `scripts/appearance.js` | `uiSize` setting registration; controller applies and syncs `data-ag-size` |
| Manager `templates/my-appearance.hbs`, `templates/manager.hbs` (Appearance popover), `scripts/main.js` | Size switch UI and wiring |
| Manager `styles/skins/*.css` | Set `--ag-radius-control` and `--ag-radius-window` (Stone Tablet about 0, Tome Pages about 3px) and style the new parts. Sizes need no change: they only use relative sizes like `calc(var(--ag-text-xl) + 3px)`. |
| `ag-html.mjs` (new shared helper) | `windowSize()` |
| `ag-launchers.mjs` | No change; launchers already use kit tokens |
| `scripts/check.mjs` / `ui-lint.mjs` | Lint: both size sets define the same token list; no raw px for font-size, padding, gap or height in module CSS (allowlist for canvases) |

## Order (final)

Builds are prepared now and held as draft PRs until after **Friday 2026-10-23** (see "Holding PRs" below). Versions shown are the next ones above `main` on 2026-10-21; recompute them on merge day.

| # | PR | Version (as of today's main) | Scope | Risk | What users notice |
|---|---|---|---|---|---|
| 1 | **Shared kit 2 release**, brief `docs/ui-briefs/01-kit-2.md` | minor for every module | D shape and size tokens, both size sets, new kit parts, `ag-dialogs.mjs` superset, Manager size setting, skins cover new parts, rarity tokens in the kit, lint in ratchet mode | Medium: the look changes everywhere | Rounded compact kit parts in every window; Comfortable in My Appearance |
| 2 | **Character Hub pilot**, brief `docs/ui-briefs/02-hub-pilot.md` | Hub minor | Hub fully on the standard: HP ring portrait, round slots, Strain orb, rail tooltips, kit rows, confirms, light-skin fixes | Medium (biggest player window) | The sheet looks like the mockup |
| 3 | **Dialogs and words sweep**, brief `docs/ui-briefs/03-dialogs-sweep.md` | patch for each touched module | Help as an info dialog, labelled and danger confirms through `ag-dialogs.mjs`, player-visible debug text removed (not Hub, not Renown) | Low | No more Yes/No; no "acceptance pending" |
| 4 | Profession Ledger | minor | Header, badges, table, quality uses rarity colours (D6), container queries | Low–medium | Ledger matches the Hub |
| 5 | Renown | minor | See "Renown pass" below (includes the parked toolbar polish) | Medium | Renown matches; toolbar fixed |
| 6 | Manager | minor | Remove panel button override; header; footers; pills to badges; Items toolbar merge; dead CSS | Medium | Buttons right in Import, Modules, Scenes |
| 7 | Cinders | minor | Strain orb/meter shared with Hub; cards; header; empty states | Low | Same Strain as the Hub |
| 8 | Quest Log | minor | Header order; toolbar (create right); `.ag-rows`; footers; badges | Low | Quest list and editor match |
| 9 | Locations | minor | Footer (Delete away from Cancel); row padding; GM Setup scope; tooltips | Low | Small tidy |
| 10 | Headquarters | minor | Header; buttons; tabs; glyph icons to Font Awesome; layout | Medium | HQ looks like the rest |
| 11 | Skill Trees | minor | Header; setup cards; tooltips; full node names; Developer Tools split | Medium (board) | Full node names; one tooltip |
| 12 | Utilities | minor | Header order; button classes; pills; rename `.ag-` local classes | Low | Small tidy |
| 13 | Lint to strict | — | Flip ratchet rules to zero | None | Nothing |

PRs 2 and 3 both stack on PR 1 and don't depend on each other. From PR 4 on, passes can run in parallel chats, one module each, once PR 1 is merged. Each module pass also brings that module's remaining dialogs to `ag-dialogs.mjs` if PR 3 didn't.

## Holding PRs until after Friday without drifting

1. **Draft PRs.** Open each one as a draft, titled `[HOLD → after 2026-10-23] …`, so the merge button stays disabled. Merging to `main` triggers the Release workflow, so a draft can't release by accident. Pushes to branches only run the Check workflow.
2. **Stack:**
   - `ui/kit-2` branches from `main`.
   - `ui/hub-pilot` and `ui/dialogs-sweep` branch from `ui/kit-2`, and their PRs target `ui/kit-2`, so each diff shows only its own work.
   - When PR 1 merges and its branch is deleted, GitHub retargets the other two PRs to `main` automatically.
3. **Keep up with `main`:**
   - Whenever `main` gets a release (it moved 15 commits on 2026-10-21 alone), merge `main` into `ui/kit-2`, then `ui/kit-2` into the two child branches.
   - Use merge commits, no rebase and no force-push, so review comments and the build chats' checkouts stay valid.
   - Run `node scripts/check.mjs` after each sync.
4. **Version conflicts are expected.** If `main` released a module that a held PR also bumps:
   - keep `main`'s version and CHANGELOG section;
   - re-bump the PR to the next version above it and move the PR's CHANGELOG entry on top;
   - update every hard-coded copy of the version (`module.json` version and download URL, `VERSION` constants, header text such as Manager's `manager.hbs` and window title).
   - `check.mjs` catches mismatches. Never reuse a released version.
5. **Shared files.** If `main` changes `ag-ui.css`, `ag-launchers.mjs` or a `dialogs.mjs` copy while PRs are held, merge it into `ui/kit-2` first, so the copies stay byte-identical across all modules in every branch.
6. **Merge day (Saturday 2026-10-24 or later, when Robb says):**
   - Sync all three branches one last time.
   - Merge PR 1 and let it release. Robb updates in Forge and opens each window once in Standard, Stone Tablet and Comfortable.
   - Then merge PR 2, and Robb checks the Hub.
   - Then merge PR 3, and Robb checks the dialogs.
   - Leave one Forge check between merges, so a problem points at one PR.
7. **No new feature work on these branches.** Fixes found while holding go on the branch they belong to (kit issues on `ui/kit-2`, then merged down).

## Decisions (all taken by Robb, 2026-10-21)

| # | Decision |
|---|---|
| D1 | Base look: direction D, Rounded Compact, keeping the dark gold skins. A per-device Comfortable size uses direction C's scale. |
| D2 | "New …" create buttons are plain with a + icon; gold is only for Save/Apply (one per view). |
| D3 | Character Hub keeps its icon rail on the right; every rail tab gets a Foundry tooltip and an `aria-label`. |
| D4 | Player Access saves with GM Setup's Save Changes, like other settings. |
| D5 | Rarity uses Hub's hues, with Common turned grey; one token set in the kit. |
| D6 | Ledger quality uses the item rarity colours: Common → common, Rare → rare, Exotic → very rare. A future boss-tier Exotic would use the artifact colour. There is no tier field today; don't invent one. |
| D7 | On narrow windows the tabs scroll sideways. |
| D8 | Help is a dialog with a Close button everywhere. |
| D9 | No Alpha/Beta in window headers. |
| D10 | Renown keeps the folder list beside Group, Player and Organizations; Pantheon is full width. |
| D11 | Foundry tooltips (`data-tooltip`) replace native `title` hover text, module by module. |
| Order | Character Hub is the pilot, after the shared kit release; then Profession Ledger, then Renown, then the rest. |

GPT sync: none needed. This work is UI only and changes no content schema GPT authors against.

## Renown pass (PR 5, detail)

Includes the parked Renown toolbar polish. It runs after the kit, so it uses kit-2 parts directly.

Scope (from audit §2 #4, #11 and the Renown section):
- **Shell:** column layout `ag-header` (brand span, version, ghost Help) → `ag-tabs` → body. Header spans the full window. Remove the negative tab margin (`module.css:72-74`), the sidebar brand eyebrow, and duplicate min-size rules.
- **Body:** `.ag-split` with the folder list as the list column on Group, Player and Organizations; Pantheon is a card gallery.
- **Organizations toolbar:** search (filters as you type, debounced), Visibility / Sort / Group selects, count, `New faction` on the right (opens a small form dialog). Import, Export as `--sm` in the end slot. "Load four draft guilds" moves to a GM-only Developer Tools area at the bottom of GM Setup.
- **Pantheon toolbar:** back link (ghost) when a deity is open, character select, `New deity` on the right.
- **One character picker** partial, same in Player, Pantheon and Organizations.
- **Rows:** organizations as `.ag-rows` with visibility badge (Revealed ok / Hidden plain / Characters only accent), Renown and rank on the right.
- **Editors:** each ends with `.ag-footer` (Cancel / Save …). Remove is `.ag-btn--danger` with `confirmDialog`; "×" becomes an icon button with a label; Deny gets a confirm.
- **Controls:** drop `.agf-shell button`, input `!important` and select height overrides so all controls are 34px (28px for row actions).
- **Copy:** remove "GM ·" prefixes inside GM-only tabs; "Current character" shows the name; empty states per standard.
- **Meters:** faction standing gets `.ag-meter`; the milestone ladder becomes `.ag-steps` (rank dots) with the current rank marked.
- **Tokens:** all `font-size`, radius and spacing through tokens; delete dead selectors listed in the audit.

Risk: template is 45KB and GM/player branches are many. Mitigation: no data or action changes (same `data-action` names), screenshots of all five tabs as GM and as player in all seven skins, `node scripts/check.mjs ashen-gate-factions`.

Robb checks live: open Renown as GM and as a player; Organizations: type in search, change Sort/Group, New faction, Remove a reward (confirm says "Remove reward"), Deny a request (now confirms); Pantheon: open a deity and go back; switch to Stone Tablet and Parchment in Appearance; resize the window narrow and wide.

## Drift check (added to `scripts/check.mjs`)

New `scripts/ui-lint.mjs`, run by `check.mjs` for each module. Starts in **ratchet mode**: `scripts/ui-lint-baseline.json` stores today's counts per module and rule; a count may go down, never up. The last PR flips it to zero for the rules marked strict.

| Rule | Where | Mode |
|---|---|---|
| No hex, `rgb()`, `hsl()` colour literals | module CSS (not `ag-ui.css`, not skin files) | ratchet → strict; allow with `/* ag-lint-allow: reason */` on the line |
| No raw `font-size: Npx/rem/em` | module CSS | ratchet → strict |
| No `var(--ag-bg)` / `var(--ag-panel)` | module CSS | ratchet → strict |
| No viewport `@media (max-width…)`/`(min-width…)` | module CSS | ratchet (container queries instead) |
| No class selectors starting `.ag-` defined outside the kit | module CSS | strict from PR 1 (module prefix only) |
| No `DialogV2.confirm(` / `.prompt(` outside `ag-dialogs.mjs` | scripts | ratchet → strict |
| No `class="fas ` / `far ` legacy prefixes | scripts, templates | strict |
| Header markup contains `ag-header__brand` and `ag-version` | scripts, templates | ratchet → strict |
| `title=` on `<button>` (use `data-tooltip`) | scripts, templates | ratchet |
| Every kit component class appears in both structural skin files | Manager skins | strict from PR 1 |
| Token contrast pairs ≥ 4.5:1 in every skin | `appearance.js` | strict from PR 1 |
| Both size sets (`:root` and `html[data-ag-size="comfortable"]`) define the same token names | `ag-ui.css` | strict from PR 1 |
| No raw px for `padding`, `gap`, `margin`, `height`, `width` of controls in module CSS (allowlist canvases with `ag-lint-allow`) | module CSS | ratchet → strict |

The lint reads files as text with regexes (no new dependencies), like the rest of `check.mjs`.

## Upgrade readiness (future Foundry / dnd5e)

- **Keep the surface small.** The kit touches only `.application`, `.window-header`, `.window-title`, `.window-content`, `.header-control` and DialogV2's `.form-footer`. Everything else is our own classes. On a Foundry major, check those six names first.
- **Low specificity is the defence.** Kit generics use `:where()`, components one class. If core moves its CSS into cascade layers, our unlayered rules win without changes; if core raises specificity on buttons or inputs, only elements without kit classes are affected, so "kit class on every control" is also upgrade insurance.
- **Theme variables.** AG windows follow the AG skin, not Foundry's light/dark theme. If core light-theme rules leak into our windows after an update, map the core theme variables to ours inside `.ag-app` in the kit (one block), rather than patching modules.
- **ApplicationV2 only.** No new `Application` (V1) or `Dialog` (V1) use; dialogs only through `ag-dialogs.mjs`, so a DialogV2 API change is fixed in one shared file.
- **dnd5e.** Read rarity keys from `CONFIG.DND5E.itemRarity` at runtime with the six keys as fallback; keep using dnd5e's own `data-tooltip-html` item cards; never style dnd5e sheet internals from the kit.
- **Font Awesome.** Use free `fa-solid` names only, so a Foundry FA version change or a Pro→Free switch doesn't blank icons.
- **Per-upgrade checklist.** Run the preview renders on the new version's core CSS (download it to the scratch folder), then Robb opens each window once in Standard and Tome Pages.
