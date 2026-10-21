# Ashen Gate UI pass plan (draft)

Status: draft. Small PRs in this order. Each follows the normal workflow (branch, version bump, CHANGELOG line, `node scripts/check.mjs`). No pass changes saved data, settings keys or flags; any pass that would must stop and ask.

Read with `docs/ui-audit.md` (problems, with file references) and `docs/ui-standard.md` (the target).

## Verification without live Foundry

Every pass is checked the same way before Robb sees it:

1. **Unit tests** for any logic touched (confirm helper wiring, labels, filters). `node scripts/check.mjs <module>`.
2. **Chromium renders** (Playwright is preinstalled in the cloud container, `/opt/pw-browsers`). A throwaway preview script, as in the earlier Hub passes:
   - builds the real window HTML with mocked data (call the module's view functions, or compile its `.hbs` with Handlebars);
   - wraps it in a minimal Foundry window shell, loads `ag-ui.css`, the module CSS and, for structural skins, Manager's skin CSS;
   - sets `html[data-ag-skin]` and the token values from `manager/scripts/appearance.js` for each of the seven skins;
   - screenshots at window widths 1180, 760 and 420px, plus one with Manager absent (kit defaults).
   Compare before/after screenshots side by side and attach the set to the PR. The style-guide build (`docs/ui-kit-next/build-style-guide.mjs`) already does the skin plumbing and can be reused.
3. **Contrast check** of the token pairs per skin (text/surface, muted/raised, accent-contrast/accent, rarity ink/raised), computed from the skin tables in `appearance.js`. Fails under 4.5:1 for text.

**Only Robb can verify live:** real Foundry core CSS interaction (`themed` light/dark classes, core button and input rules), DialogV2 rendering and button order, `data-tooltip` behaviour, drag-and-drop, window resize and scroll restoration, The Forge asset paths, player vs GM permissions on a second login, and dnd5e item tooltips.

## Base look and size (decided 2026-10-21)

Robb chose **direction D, Rounded Compact**, as the base, keeping the dark gold skins. He also wants a per-user **Comfortable** size for accessibility, using direction C's larger scale. Mockups: https://claude.ai/artifact/CzrqMiTA1VJ9Kiyahhi1At (direction D has the Compact/Comfortable switch).

### What D means for the kit
- **Shape** is the same in both sizes: pill buttons, tabs and inputs (`--ag-radius: 999px`), round icon chips, circle portraits and slots, an HP ring around the portrait, a Strain orb, rank dots, and cards with 14px corners. Text areas get 10px corners.
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
- **Kit release (PR 2):** two token blocks (about 40 lines) plus about 5 new tokens.
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
| Manager `styles/skins/*.css` | No change expected (they only use relative sizes like `calc(var(--ag-text-xl) + 3px)`). Checked in PR 2. |
| `ag-html.mjs` (new shared helper) | `windowSize()` |
| `ag-launchers.mjs` | No change; launchers already use kit tokens |
| `scripts/check.mjs` / `ui-lint.mjs` | Lint: both size sets define the same token list; no raw px for font-size, padding, gap or height in module CSS (allowlist for canvases) |

### Effect on the plan
- **PR 1 (Renown pilot):** built in D at Compact, with only size tokens. It is also rendered at Comfortable before merging.
- **PR 2 (kit release):** it is no longer "almost nothing visible", because D becomes the default look everywhere.
  - Modules that already use kit parts turn rounded and compact at once.
  - Modules with local CSS keep their old shapes until their pass.
  - Risk moves from Low to Medium. Robb should open every window once after PR 2.
  - The size switch ships in the same PR.
- **PRs 3–11:** unchanged scope. The checks now include Comfortable.

## Order

| # | PR | Version | Scope | Risk | What users notice |
|---|---|---|---|---|---|
| 0 | **This design branch** (`design/ui-standard`) | — | Docs + draft CSS + style guide | None | Nothing |
| 1 | **Renown pilot** | factions 0.12.0 | Shell, toolbars, rows, buttons, footers, empty states, confirms; kit-2 classes defined *locally* in a marked block (see below) | Medium: large template | Renown looks like the standard; parked toolbar polish done |
| 2 | **Shared kit 2 release** | every module, patch bump; Manager minor | `ag-ui.css` additions with the D shape and the two size sets, Manager size setting, `ag-dialogs.mjs` promoted, Manager skins cover new parts, rarity tokens move to the kit, check rules | Medium (look changes everywhere) | Rounded compact look in every kit part; Comfortable size in My Appearance; dialogs in the four helper modules pick up the skin |
| 3 | **Dialogs and words sweep** | patch bumps in Manager, Skill Trees, Cinders, Ledger, Hub, Locations | Help opens as info (Close); every confirm labelled via `ag-dialogs.mjs`; danger confirms red; remove debug/test text from player views | Low | No more Yes/No; Help has a Close button; no "acceptance pending" |
| 4 | Manager | minor | Remove panel button override; header; footers; pills → badges; Items toolbar merge; dead CSS | Medium (big CSS) | Buttons look right in Import, Modules, Scenes; tidy header |
| 5 | Character Hub + Cinders | minor each | Strain meter shared; rarity tokens; header; `title` → `data-tooltip`; companion Remove confirm; light-skin fixes | Medium | Same Strain bar in both; readable on Parchment/Tome |
| 6 | Quest Log | minor | Header order; toolbar (create right); `.ag-rows`; footers; badges | Low | Quest list and editor match the others |
| 7 | Locations | patch | Footer (Delete away from Cancel); row padding; GM Setup scope; tooltips | Low | Small layout tidy |
| 8 | Headquarters | minor | Header; buttons; tabs active style; footer without debug text; glyph icons; confirms | Medium | HQ looks like the rest; no revision numbers |
| 9 | Profession Ledger | patch | Header; badges; table; exotic quality badge | Low | Small tidy |
| 10 | Skill Trees | minor | Header; setup cards; tooltips; node name no-truncate; Developer Tools split | Medium (board) | Full node names; single tooltip |
| 11 | Utilities | patch | Header order; button classes; pills; `.ag-` prefixed local classes renamed | Low | Small tidy |
| 12 | Lint to strict | — | Flip the drift lint from ratchet to zero-tolerance once 4–11 land | None | Nothing |

Passes 4–11 can run in parallel chats once 2 and 3 are merged; each touches one module.

## 1. Renown pilot (detail)

Why first: most drift, largest player-facing surface, and the parked toolbar polish.

Scope (from audit §2 #4, #11 and the Renown section):
- **Shell:** column layout `ag-header` (brand span, version, ghost Help) → `ag-tabs` → body. Header spans the full window. Remove the negative tab margin (`module.css:72-74`), the sidebar brand eyebrow, and duplicate min-size rules.
- **Body:** `.ag-split` with the folder list as the list column on Group, Player and Organizations; Pantheon is a card gallery.
- **Organizations toolbar:** search (filters as you type, debounced), Visibility / Sort / Group selects, count, `New faction` on the right (opens a small form dialog). Import, Export as `--sm` in the end slot. "Load four draft guilds" moves to a GM-only Developer Tools area at the bottom of GM Setup.
- **Pantheon toolbar:** back link (ghost) when a deity is open, character select, `New deity` on the right.
- **One character picker** partial, same in Player, Pantheon and Organizations.
- **Rows:** organizations as `.ag-rows` with visibility badge (Revealed ok / Hidden plain / Characters only accent), Renown and rank on the right.
- **Editors:** each ends with `.ag-footer` (Cancel / Save …). Remove is `.ag-btn--danger` with `confirmAction`; "×" becomes an icon button with a label; Deny gets a confirm.
- **Controls:** drop `.agf-shell button`, input `!important` and select height overrides so all controls are 34px (28px for row actions).
- **Copy:** remove "GM ·" prefixes inside GM-only tabs; "Current character" shows the name; empty states per standard.
- **Meters:** faction standing gets `.ag-meter`; the current milestone is highlighted.
- **Tokens:** all `font-size`, radius and spacing through tokens; delete dead selectors listed in the audit.

Kit-2 parts the pilot needs (`ag-search`, `ag-chip`, `ag-rows`, `ag-meter`, `ag-notice`, `ag-split`, `ag-version`, empty-state parts) are defined in Renown's CSS in one block marked `/* kit-2 candidates: move to ag-ui.css in the shared release */`, scoped under `.ashen-gate-factions` and using the final class names. PR 2 moves them to the kit and deletes the block. This is the only time a module may hold kit parts locally; it lets the components prove themselves in one real window before the kit freezes.

Risk: template is 45KB and GM/player branches are many. Mitigation: no data or action changes (same `data-action` names), screenshots of all five tabs as GM and as player in all seven skins, `node scripts/check.mjs ashen-gate-factions`.

Robb checks live: open Renown as GM and as a player; Organizations: type in search, change Sort/Group, New faction, Remove a reward (confirm says "Remove reward"), Deny a request (now confirms); Pantheon: open a deity and go back; switch to Stone Tablet and Parchment in Appearance; resize the window narrow and wide.

## 2. Shared kit 2 release (detail)

- Append the reviewed `docs/ui-kit-next/ag-ui-next.draft.css` to `styles/ag-ui.css` with a first-line version comment, copy to all ten modules.
- Small edits to existing kit rules: kit reduced-motion rule also stops animations; `.ag-list > *` no longer pads buttons that are rows.
- Manager: move rarity tokens out of `manager.css:429`; add new-component rules to both structural skins from `skins-next.draft.css`.
- Rename the four identical `dialogs.mjs` to `ag-dialogs.mjs`, add `classes: ['ag-app','ag-dialog']` and the `danger` option, add the file to the `check.mjs` identical-copies list.
- Remove Renown's kit-2 candidate block.
- Add the drift lint (below) in ratchet mode.
- Every module: patch bump + CHANGELOG "Shared UI kit 2.0.0 (no visible change on its own)". Manager minor.

Robb checks live: open every window once in Standard and one structural skin; nothing should look different except dialogs from Utilities, HQ, Quest Log and Renown now matching the skin.

## Drift check (added to `scripts/check.mjs`)

New `scripts/ui-lint.mjs`, run by `check.mjs` for each module. Starts in **ratchet mode**: `scripts/ui-lint-baseline.json` stores today's counts per module and rule; a count may go down, never up. PR 12 flips it to zero for the rules marked strict.

| Rule | Where | Mode |
|---|---|---|
| No hex, `rgb()`, `hsl()` colour literals | module CSS (not `ag-ui.css`, not skin files) | ratchet → strict; allow with `/* ag-lint-allow: reason */` on the line |
| No raw `font-size: Npx/rem/em` | module CSS | ratchet → strict |
| No `var(--ag-bg)` / `var(--ag-panel)` | module CSS | ratchet → strict |
| No viewport `@media (max-width…)`/`(min-width…)` | module CSS | ratchet (container queries instead) |
| No class selectors starting `.ag-` defined outside the kit | module CSS | strict from PR 2 (module prefix only) |
| No `DialogV2.confirm(` / `.prompt(` outside `ag-dialogs.mjs` | scripts | ratchet → strict |
| No `class="fas ` / `far ` legacy prefixes | scripts, templates | strict |
| Header markup contains `ag-header__brand` and `ag-version` | scripts, templates | ratchet → strict |
| `title=` on `<button>` (use `data-tooltip`) | scripts, templates | ratchet |
| Every kit component class appears in both structural skin files | Manager skins | strict from PR 2 |
| Token contrast pairs ≥ 4.5:1 in every skin | `appearance.js` | strict from PR 2 |

The lint reads files as text with regexes (no new dependencies), like the rest of `check.mjs`.

## Upgrade readiness (future Foundry / dnd5e)

- **Keep the surface small.** The kit touches only `.application`, `.window-header`, `.window-title`, `.window-content`, `.header-control` and DialogV2's `.form-footer`. Everything else is our own classes. On a Foundry major, check those six names first.
- **Low specificity is the defence.** Kit generics use `:where()`, components one class. If core moves its CSS into cascade layers, our unlayered rules win without changes; if core raises specificity on buttons or inputs, only elements without kit classes are affected, so "kit class on every control" is also upgrade insurance.
- **Theme variables.** AG windows follow the AG skin, not Foundry's light/dark theme. If core light-theme rules leak into our windows after an update, map the core theme variables to ours inside `.ag-app` in the kit (one block), rather than patching modules.
- **ApplicationV2 only.** No new `Application` (V1) or `Dialog` (V1) use; dialogs only through `ag-dialogs.mjs`, so a DialogV2 API change is fixed in one shared file.
- **dnd5e.** Read rarity keys from `CONFIG.DND5E.itemRarity` at runtime with the six keys as fallback; keep using dnd5e's own `data-tooltip-html` item cards; never style dnd5e sheet internals from the kit.
- **Font Awesome.** Use free `fa-solid` names only, so a Foundry FA version change or a Pro→Free switch doesn't blank icons.
- **Per-upgrade checklist.** Run the preview renders on the new version's core CSS (download it to the scratch folder), then Robb opens each window once in Standard and Tome Pages.

## Open decisions for Robb (ask one at a time; defaults in bold)

| # | Question | Recommended default |
|---|---|---|
| D1 | Base look? | **Decided:** direction D, Rounded Compact, dark gold kept; per-device Comfortable size (C scale). See "Base look and size" |
| D2 | Should "New …" create buttons be gold (primary) or plain? | **Plain with a + icon**; gold is kept for Save/Apply so there is one gold button per view |
| D3 | Character Hub keeps its icon rail on the right instead of top tabs? | **Yes**, it is a sheet; add labels as tooltips |
| D4 | Player Access: save immediately, or with GM Setup's Save Changes like other settings? | **With Save Changes** |
| D5 | Rarity colours: which set? | **Hub's hues** (closest to dnd5e), Common becomes grey so it shows on light skins; one token set in the kit |
| D6 | Ledger "Exotic/Rare" finds: style them like item rarity, or their own look? | **Own badge** (accent for Rare, warn for Exotic), not rarity colours |
| D7 | Tabs on a narrow window: scroll sideways or wrap to two rows? | **Scroll sideways** |
| D8 | Help: a dialog with Close, or a page inside the window (Ledger, HQ today)? | **Dialog with Close** everywhere |
| D9 | Show "Alpha"/"Beta" in window headers? | **No**; stage lives in the CHANGELOG |
| D10 | Renown: keep the folder list beside every tab? | **Yes** on Group, Player and Organizations; Pantheon full width (as today) |
| D11 | Replace native `title` hover text with Foundry tooltips everywhere? | **Yes**, per module pass |

GPT sync: none needed. This work is UI only and changes no content schema GPT authors against.
