# Ashen Gate UI audit (draft)

Status: draft for Robb, 2026-10-21. Static read of every module's templates, scripts and CSS on `main` at `b2cd06b`.
Nothing here was rendered in Foundry. Items marked **(check live)** are inferred from CSS specificity and need a look in Forge.

Paths are relative to `modules/<module>/`. "Kit" means `styles/ag-ui.css` (identical in all ten modules; `scripts/check.mjs` enforces it).

## 1. Headline

The shared kit is good and every window loads it. Drift comes from three places:

1. **Modules re-build kit parts locally** (own card, pill, toolbar, footer, empty state, button sizes). Those local parts get no skin shaping from Stone Tablet or Tome Pages, which only reshape kit classes, so the more a module re-builds, the less the skins work in it.
2. **The kit is missing parts modules needed**: data table with stripes, record rows, toolbar search, filter chips, meters (Strain), rarity, notices, slots and hotbars, dialog styling, version text. Each module invented its own.
3. **Foundry dialogs are outside the kit.** 51 `DialogV2.confirm/prompt/wait` calls across six modules, none opened with the `ag-app` class, so every confirmation renders in Foundry's look whatever the skin. Three modules show Help inside a Yes/No confirm.

The look can be made consistent from the current base. No alternative visual direction is needed.

## 2. Most visible problems (ranked)

| # | What a GM or player sees | Where (evidence) |
|---|---|---|
| 1 | **Help opens with Yes / No buttons** | Manager `scripts/main.js:830`, Skill Trees `scripts/main.js:788`, Cinders `scripts/main.mjs:177-181` all call `DialogV2.confirm` for Help |
| 2 | **Confirmations say Yes / No instead of the action**, including destructive ones (Unbind, Reset tree, Refund, Undo XP, Remove node) | Cinders `main.mjs:68` helper; Skill Trees `main.js:79` helper; Ledger `main.js:1249,1278,1306,1899,1909`; Manager 9 calls (`main.js:974,1070,1159,1188,1203,1242,1503,1587,1604`); Hub Push `sheet.mjs:24`. Utilities, HQ, Quest Log and Renown use a labelled `confirmDialog` helper and are correct |
| 3 | **Dialogs ignore the skin** | 0 of 51 DialogV2 calls pass `classes:['ag-app']`. Ledger is inconsistent even internally (`main.js:663` without, `:1074` with) |
| 4 | **Renown tabs likely overlap the header** **(check live)** | `factions/styles/module.css:74` `.agf-tabs{margin:-23px -25px 18px}` was written when tabs were the first child; `templates/dashboard.hbs:18` now puts `.ag-header` first. Header is also inside the right pane, so it does not span the sidebar. A Chromium render with the shipped CSS (style guide, Renown pilot → Today) shows the tabs over the header and drawn as boxed buttons, because `.agf-shell button{…}` (`module.css:31`) beats the kit's `.ag-tabs > :where(button)` |
| 5 | **Manager: ghost, small and danger buttons all look like gold-bordered panel buttons** in Import, Folders, Core links, Modules, Scenes, GM Setup | `manager/styles/manager.css:13,136-138` (`.ashen-gate-manager .agmanager-panel button{…border-color:var(--ag-accent)}`, specificity 0,2,1) beats every `.ag-btn--*` modifier (0,1,0) |
| 6 | **Headers differ in every module** (title size, brand colour, version side, Help style) | See §3 table. Only Utilities, Quest Log, My Appearance and Codex player use `.ag-header__brand`. Cinders title is 14px `<strong>`, Hub 19px `h1`. Manager puts the version on the left inside the h2. HQ replaces the title with the Guildhall name (`headquarters/js/main.mjs:206`) |
| 7 | **Rarity colours disagree and break on light skins** | Hub `character-hub.css:26-27` vs Manager `manager.css:429`: 5 of 6 hex values differ, and `--ag-rarity-veryRare` vs `--ag-rarity-veryrare` are different variables. Common is `#f2f2f2`/`#f4f4f4`, near invisible on Parchment and Tome Pages |
| 8 | **Debug and test wording visible to players** | Utilities footer "…live acceptance pending" (`utilities/scripts/main.mjs:229`); HQ footer revision numbers and "(test default)" (`headquarters/js/main.mjs:206`); "Alpha" labels (HQ, Utilities, Skill Trees `tree.hbs:184`); Manager "(provisional, pending Tim confirmation)" (`manager.hbs:86`); Renown "Current character: {{actorId}}" prints a raw id (`dashboard.hbs:209`); HQ "Back to manage" (`main.mjs:208`) |
| 9 | **Strain looks different in Hub and Cinders**; Hub label low contrast | Cinders `.agc-bar` 14px, no label, accent only (`cinders.css:18-20`). Hub 16px, label inside, red when over (`character-hub.css:463-466`). Hub label uses `--ag-text` on the accent fill: 1.77:1 on Standard |
| 10 | **Destructive actions without confirmation or danger style** | Hub companion Remove (`companion-views.mjs:49`, writes immediately); HQ Remove decoration, Unassign hireling (`main.mjs:359,366`); Renown Deny request, "×" buttons with no label (`dashboard.hbs:174,243,244`) |
| 11 | **Primary / Cancel placement differs** | Only Ledger GM Setup and Manager mood-style footers follow Cancel left, primary right. Locations puts Delete next to Cancel (`app.mjs:585`); Quest Log puts Save next to Delete mid-panel (`main.mjs:114`); HQ has two identical "Save Changes" buttons (`main.mjs:312`); Renown primary is a soft fill with unreadable hover (`module.css:31`) |
| 12 | **Header and tabs scroll away on long tabs** | Manager `.window-content{overflow:auto}` (`manager.css:2`); Renown `.agf-main{overflow:auto}` contains header and tabs |
| 13 | **Quest cards probably centred** **(check live)** | `<button class="ag-quest-card">` gets the kit's `align-items:center` (`quest.css:11` does not override) |
| 14 | **Narrow windows do nothing** in most modules | Viewport `@media` in Renown (10), HQ, Locations, Quest Log, Ledger, Utilities, Manager. Only Hub, Skill Trees and parts of Manager use container queries, which react to window size |

## 3. Shell per module

| Module | Header markup | Brand span | Version / Help on right | Tabs | Toolbar | Footer for Save | Help opens as |
|---|---|---|---|---|---|---|---|
| Manager | `.ag-header` + own `h2` with `<small>v0.39.0 Beta</small>` (`manager.hbs:2-23`) | no | version left; Help `.agmanager-help`; "GM only" chip after Help | `.ag-tabs` | `.ag-toolbar` once; `.agmanager-row` elsewhere | `agmanager-mood-footer` reused 8×, `agmanager-footer` | confirm (Yes/No) |
| Character Hub | `.ag-header` + `h1` (`views.mjs:101`) | no | yes; opacity slider, undefined `.ag-version`, ghost buttons | **right icon rail**, no `.ag-tabs` (`views.mjs:60-62`) | `.agch-toolbar` | none (live edits) | prompt (Close) |
| Cinders | `.ag-header` + `<strong>` (`cinders.hbs:2-5`) | no | yes; Help `--sm` | `.ag-tabs` + own `.agc-active` | `.agc-toolbar` | none | confirm (Yes/No) |
| Renown | `.ag-header` + `h1` inside right pane (`dashboard.hbs:18`) | no | yes; unclassed Help | `.ag-tabs` pulled up by negative margin | none; `.agf-orgs-filters` grid | none; saves inline | infoDialog (Close) |
| Headquarters | `.ag-header aghq-top` + `h2`; shows Guildhall name | no | "v… · Alpha" + plain Help | `.ag-tabs` with accent-tinted active (`headquarters.css:5`) | none | `.aghq-footer` shows debug revisions | replaces body |
| Locations | `.ag-header` + `h1` (`app.mjs:227`) | no | yes; ghost Help | `.ag-tabs` | `.ag-toolbar` + `.agl-filters` | sticky `.agl-footer` | prompt |
| Profession Ledger | `.ag-header` + plain div text (`main.js:1700`) | no | yes; full-size Help, no icon | `.ag-tabs` (scroll, no wrap) | `.ag-toolbar` | `.ag-footer` Cancel/Save on GM Setup ✔ | in-window view |
| Quest Log | `.ag-header` + `h1` ✔ (`main.mjs:138`) | yes | Help + overlay toggle, then version | `.ag-tabs` (buttons lack `type`) | `.ag-quest-toolbar`, create on the left | `.ag-footer` info only | infoDialog |
| Skill Trees | `.ag-header agst-toolbar` + icon + 16px `strong` (`tree.hbs:2-5`) | no | accent-coloured version, Help `--sm` | `.ag-tabs` with `agst-active` | none; New Tree on the left | none | confirm (Yes/No) |
| Utilities | `.ag-header` + `h1` ✔ (`main.mjs:229`) | yes | Appearance, Help, then version | `.ag-tabs` ✔ | `.ag-toolbar` ✔ | in-card Save, no Cancel | infoDialog ✔ |

GM Setup rule (settings only) holds in Renown, Cinders, Quest Log. It is broken by Locations (Import/Export and Developer Tools in GM Setup), Manager (world appearance lives in a header popover; demo "Load example" and Pre-session check not in a Developer Tools area), HQ (Developer Tools inside Facilities), Skill Trees (real data migrations filed under "Developer Tools — Experimental").

Player Access saves three ways: immediately (Locations, Skill Trees), toggle + badge (Ledger), checkbox + Save (HQ, Quest Log, Utilities).

## 4. Components

### Buttons
- Kit classes used well: Locations (`btn()` helper), Ledger, Skill Trees, Cinders, Hub (`buttons.mjs:4`).
- Not used: Renown (0 of 81 buttons; `.agf-shell button{min-height:30px;border-radius:5px}` `module.css:31`), HQ (bare buttons; danger is a border, `headquarters.css:41`; buttons stretch `:40,109`), Quest Log (`primary|secondary|danger`; `secondary` has no style; every button gets `title=""`).
- Mixed: Utilities (`primary`, `primary ag-btn`, `ag-btn`, unclassed; "Award Gold" in three styles), Manager (67 of 127 template buttons use `.ag-btn`; `browse-view.js` none).
- Wrong meaning: Hub Death save uses `--danger` for a roll (`tabs.mjs:46`).
- Undefined classes: Renown `.agf-small` (5 uses).

### Confirmations and dialogs
- Labelled helper (Cancel left, action right): Utilities, HQ, Quest Log, Renown `scripts/dialogs.mjs` (byte-identical copies). Good pattern; should become shared.
- Raw `DialogV2.confirm` with default labels: Manager, Skill Trees, Cinders, Ledger, Hub.
- Locations uses `DialogV2.confirm` with custom decline labels that vary: "Keep Editing", "Keep", "Cancel".
- Titles in capitals: Manager "FINAL DELETE CONFIRMATION" (`main.js:1535`), "ARCHIVE managed content" (`:1527`).
- Raw ids in messages: Quest Log "Delete ${this.gmId}?" (`main.mjs:204`), HQ "Permanently mark ${id}…".
- Three dialog-form idioms: `ag-field` (Ledger), `.agst-form` (Skill Trees), Foundry `.form-group` (Utilities/HQ/Quest/Renown `formDialog`).

### Empty states
- `.ag-empty` used consistently only in Locations and Ledger.
- Elsewhere: `.agf-muted` + `.agf-welcome{padding:100px}` (Renown), `.aghq-empty` and undefined `.aghq-emptycopy` (HQ), `.ag-quest-empty` (Quest Log), five bespoke variants (Skill Trees), `.agc-note`/`<p>`/`<small>` (Cinders), `.agch-muted` (Hub, mixed with `.ag-empty`).
- Wording problems: HQ says "Management tab" (no such tab, `main.mjs:227`); Skill Trees "add demo trees" with no demo action (`tree.hbs:167`); Utilities "Create two disposable character Actors…" (`main.mjs:93`); Renown Pantheon points to an Import hidden in a collapsed `<details>`.

### Tables and record rows
- No kit table. Each module has one: `.agmanager-table` (stripes invisible inside panels: even rows and panel are both `--ag-surface-raised`, `manager.css:35`), `.agch-cards` subgrid with stripes and headers (best one, Hub `character-hub.css:327-363`), `.agch-table` (no stripes, no `scope`), `.agc-table`, `.agl-map` (Ledger), `.agst-resolve-table` (**no CSS at all**, Skill Trees `main.js:1093,1120`), Utilities ARIA grid, HQ ranks table.
- Record lists re-implemented: Renown request/objective/resonance rows (×3), HQ `.aghq-copy/-catalogrow/-benefit/-hire-card`, Ledger `.agl-line/.agl-roster-row`. Locations rows inside `.ag-list` get double padding (kit `li` padding plus button min-height) **(check live)**.

### Badges and chips
- `.ag-badge` used well in Hub, Locations, Ledger, Utilities.
- Parallel pill systems: Manager 5 (`agmanager-badge`, `-chip`, `-beta`, `aglib-pill`, `ag-rarity`), Renown `.agf-chip` (Hidden and Characters only look identical), HQ `.aghq-chip`, Quest `.ag-quest-chip` (copy of HQ's), Hub `.agch-pill/.agch-chip/.agch-filter`, Ledger `.agl-count/.agl-chip`, Utilities `.agu-pill` at 14px.
- Errors inside a nowrap badge: Manager `main.js:1995,2035`.
- Warn tone drawn with accent: Manager `manager.css:46,210`.

### Form controls
- `.ag-field` rare (Locations setup, Ledger, Cinders, Hub once, Manager Codex 3×).
- Renown forces inputs with 19 `!important` and gives three control heights in one row: input 34, select 32, button 30 (`module.css:31,51`).
- Manager search labels override to 32px on `--ag-surface` (`manager.css:53`).
- Hub hard-codes 26px and 28px controls (`character-hub.css:166,353`).

### Icons
- Font Awesome 6 `fa-solid` almost everywhere. Legacy `fas` in Manager `item-preview.js:115`, Hub `tooltips.mjs:17`, HQ settings menu `main.mjs:481`. Skill Trees has 2 `fa-regular`.
- Unicode glyphs instead of icons: HQ ⚒ ✎ ▣ ♙ (`main.mjs:219,287`), Skill Trees ⟲ (`tree.hbs:126`), Quest Log ✕ (`main.mjs:236`), Renown ×.
- Missing `aria-hidden`: Manager 45 of 85 template icons, Renown tab icons, Quest location icon. Icon-only buttons without a label: HQ zoom − + , Renown ×.
- Same feature, different icons: Manager header `fa-dungeon` vs window/launcher/Items `fa-boxes-stacked`.

### Tooltips
- No module uses Foundry's `data-tooltip` for plain text; native `title` everywhere (Hub ~39, Locations 26, Skill Trees 19). Skill Tree nodes show both `title` and a custom `.agst-tip` (`tree.hbs:149`).

### Meters and slots
- Strain bar ×2 (see §2 #9). Renown favour bar 6px without `role="progressbar"`; faction standing has no bar (`.agf-card-bar` unused); current milestone highlight `.is-active` never applied.
- Hotbar and slots exist only in Character Hub (`.agch-slot`, `.agch-quick__slot`, `.agch-hotbtn`). Quick-slot number uses `--ag-text` with a `#000` shadow (`character-hub.css:403`), poor on light skins. HP text is `#fff` (`:161`).

## 5. Tokens, spacing, typography

Counts from each module's own CSS (kit excluded):

| Module | Hex | rgb() | Raw font-size | Raw px total | `var(--ag-…)` | Legacy `--ag-bg/--ag-panel` | `@media` | `@container` |
|---|---|---|---|---|---|---|---|---|
| Manager | 6 (rarity) | 3 | 44 | 478 | 396 | 6 | 4 | 3 |
| Character Hub | 17 | 0 | 11 | 231 | 398 | 0 | 3 | 4 |
| Cinders | 0 | 0 | 4 | 47 | 23 | 0 | 0 | 0 |
| Renown | 2 | 1 | 65 (+12 shorthand) | 463 | 210 | 5 | 10 | 0 |
| Headquarters | 2 | 0 | 24 | 187 | 91 | 2 | 3 | 0 |
| Locations | 2 | 0 | 12 (rem) | 176 | 84 | 0 | 1 | 0 |
| Profession Ledger | 0 | 0 | 0 | 71 | 152 | 0 | 3 | 0 |
| Quest Log | 1 | 0 | 10 | 145 | 44 | 3 | 3 | 1 (no container-type) |
| Skill Trees | 0 | 0 | 33 | 232 | 166 | 0 | 0 | 2 |
| Utilities | 0 | 0 | 11 | 110 | 134 | 1 | 3 | 1 |

- Text below the scale (9–10px, kit minimum is 11px): Renown 12 places, Hub 6, HQ footer and `.aghq-coderef 9px !important`, Manager 3.
- Radii: Renown alone uses 4/5/6/7/8/9px; Manager 0/3/4/5/6/7/13/20px. Kit has three radius tokens.
- Module re-aliases of kit tokens: `--agf-*` (declared twice, `module.css:1,140`), `--agst-*` (`trees.css:2`), `--agch-*` (justified: window opacity).
- Utilities defines module classes with the kit prefix (`.ag-checkbar`, `.ag-result`), which can collide with future kit classes.
- Dead CSS worth deleting in the passes: Renown ~13 selector groups; Manager ~25 (including `.ag-my-appearance-swatches`, so `is-current` on skin cards is unstyled); Hub `.agch-item(s)`, `.agch-pane > .ag-tabs`; 11 duplicated selectors in Hub.

## 6. Skins, light and dark

- Seven skins (`manager/scripts/appearance.js`): Standard, Slate, Ember, Verdigris (dark colour skins), Parchment (light colour skin), Stone Tablet (dark, structural), Tome Pages (light, structural).
- Structural skins reshape only kit classes (`.ag-header/.ag-tabs/.ag-btn/.ag-card/.ag-list/.ag-badge/.ag-empty/.ag-footer`, inputs, tables). Every local re-build (Renown panels and chips, HQ rows, Quest cards, Cinders cards, Skill Trees setup cards, Manager pills) stays flat under them.
- Dark-only assumptions break the two light skins: rarity common, Hub HP `#fff` text and `#000` shadows, HQ shadows `#030507`/`#0c1013`, Quest `#0008` shadow, Manager rarity `<option>` colours.
- Foundry V14's own light/dark interface theme is ignored by design (the AG skin decides). Core component rules that are not `:where()` can still win over kit generics inside our windows; the kit only protects elements with kit classes.
- Without Manager, the kit's `:root` Standard defaults apply. All modules open without Manager.

## 7. Scrolling and narrow widths

- One scroller per window is the norm (Hub, Ledger, Locations, Utilities). Manager and Renown scroll the header and tabs away with the content.
- Manager has six fixed-height nested scrollers (310, 340, 370, 480px…), and `PARTS` has no `scrollable`, so nested scroll may reset on re-render **(check live)**.
- Fixed layouts: Renown sidebar 277px and 5-column milestone grid; HQ `195px | 1fr | 235px`; Skill Tree nodes 181×67 with clamped names (truncates actionable text, `trees.css:75-80`).
- Conflicting minimum sizes in Renown (`module.css:181` vs `:203`).

## 8. What is already good (keep)

- Kit tokens, `:where()` generics and one-class components; byte-identical copies enforced by `check.mjs`.
- Skin controller and structural skins scoped to `html[data-ag-skin]`, colours from tokens only.
- Labelled confirm helper (`dialogs.mjs` in Utilities/HQ/Quest/Renown).
- Hub item rows (subgrid, header row, stripes, rarity edge, narrow fallback) and Skill Trees container queries: use them as the pattern for the kit table and the narrow rules.
- Ledger GM Setup footer (Cancel left, Save Changes right) is the reference footer.
- Utilities header is the reference header (apart from version order).
