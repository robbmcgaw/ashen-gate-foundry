# Build brief 2: Character Hub pilot (first module on the UI standard)

Self-contained brief for a build chat. Read `CLAUDE.md`, `docs/ui-standard.md` (final) and the Character Hub section of `docs/ui-audit.md` on branch `design/ui-standard`. The target look and feel is direction **D, Rounded Compact** in https://claude.ai/artifact/CzrqMiTA1VJ9Kiyahhi1At (try both sizes). That mockup shows only a **partial** Hub overview with a rearranged layout. Take its type, spacing, shapes, controls and icons, **not its arrangement**.

**Depends on brief 1.** Branch `ui/hub-pilot` from `main` once brief 1 has merged. If you build in parallel, branch from `ui/kit-2` and retarget to `main` later. Merge when green; keep it Hub-only. If you find a kit problem, open a separate small kit PR. Never patch kit parts locally in the Hub.

## Goal
The Hub sheet follows the standard end to end and proves the kit-2 parts in the biggest player window. No data, flag or setting changes. Same `data-action` names, so behaviour and tests stay the same.

## Layout stays exactly as it is (Robb, 2026-10-21)
Keep today's structure:
- the roughly 40/60 split;
- the **character art with the equipped-slot boxes around it** in the left column;
- the content column on the right;
- the **right icon rail**.

The pass changes only type, spacing, shapes (rounded controls, round slots), controls and icons, through tokens and CSS. Don't move, add or remove regions. Don't swap the art for a small portrait. Don't reorder the panels.

That rules out two mockup parts:
- **HP-ring portrait:** HP stays a bar in its current place, restyled with kit tokens.
- **Strain orb:** Strain stays a bar in its current place, restyled as a kit meter.

The kit still ships `.ag-portrait` and `.ag-orb` for other windows.

## Scope (`modules/ashen-gate-character-hub`)
Line references are from the audit (Hub 0.18.0). The Hub is now 0.20.x and has Journey and Cinder sockets; re-locate each item and include Journey and the sockets view in the pass.

### Shell
- **Header** (`scripts/views.mjs`): `<h1><span class="ag-header__brand">Ashen Gate</span> | Character Hub</h1>`. The right side reads: opacity slider, then Open native sheet, then `.ag-version` (from `module.json` at runtime), then Help (ghost, small).
  - Keep the header background following the opacity slider.
- **Right icon rail** stays (D3), built from kit `.ag-siderail`:
  - Each tab gets `role="tab"`, `aria-selected`, `aria-label`, `data-tooltip="<label>"` and `data-tooltip-direction="LEFT"`. Remove `title`.
  - The second rail (`.agch-agbar`) follows the same rules.
- **Sub-tabs** in the Ashen Gate tab (`.agch-seg`) become kit `.ag-segmented` with `role="radiogroup"`.
- **Window size:** open through `windowSize()` from `ag-html.mjs` (add the shared copy). Keep today's default at Compact.

### Character pane (direction D)
- **Character art and slots column:** same art, same slot positions around it, same art toggle and opacity.
- **HP:** stays a bar, in its current place, with its behaviour and colours kept exactly. See "HP bar" below. Only the frame around it (border, radius, the Damage/Heal row, the editor's buttons) takes kit tokens.
- **Stats and the other existing blocks** stay where they are; only their tokens change.
- **Equipment slots and quick bar:** same positions. They take the kit `.ag-slot` look (circles with a rarity ring), with `data-rarity`, `__key`, `__qty`, `.is-empty` and `.is-active`.
  - If a round slot no longer fits a position in the art column at either size, keep that slot square and note it in the PR. Layout wins over shape.
  - Remove the Hub's own slot box styles. Keep the attuned ✦ marker and the `⋯` touch buttons, restyled with tokens.
  - Every slot has an `aria-label` and a `data-tooltip`. dnd5e item tooltips (`data-tooltip-html`) stay as they are.
- **Rarity:** delete the Hub's scoped `--ag-rarity-*` block (`character-hub.css` about line 26). Use the kit tokens through the existing `data-rarity` attributes (they already use dnd5e keys, including `veryRare`).
- **Light-skin fixes:**
  - HP text: replace `#fff`, `#400` and `#000` with tokens.
  - Quick-slot number shadow: replace `#000`.
  - Strain label on the accent fill: use `--ag-accent-contrast`, or move the text beside the bar.

### HP bar: keep exactly, and show both adjustments at once (Robb, 2026-10-21)

What exists today (Hub 0.15–0.17; `scripts/character.mjs` `hpBar()` / `hpHtml()`, `styles/character-hub.css` `.agch-hp*` around lines 139–167, test `tests/polish.test.mjs` "HP bar: …"):
- **Fill:** current HP in one dark red, `color-mix(var(--ag-danger) 70%, #400)`. There is **no** colour change by health state today, so don't add one.
- **Temp HP:** a yellow striped overshield segment (`--agch-hp-temp: #f2c53d`) right after the fill, with "(+X TEMP)" text in yellow.
- **Max HP raised** (`tempmax > 0`): a translucent **blue** overlay with a blue left edge (`--agch-hp-boost: #4a90e2`) on the rightmost part of the bar. Today there is no text for it, only a `title`.
- **Max HP reduced** (`tempmax < 0`): a **sickly green** striped "lost" part at the right end (`--agch-hp-lost: #8fae3a`), with "(−X MAX)" text. The bar keeps the normal max as its length.
- **Text:** "X / Y HP", centred over the bar.
- **Editing:** double-click (or Enter) opens the Current / Temp / Max adj. editor with Cancel / Apply. Right-click opens dnd5e's Hit Points settings. Damage / amount / Heal sits under the bar, and damage uses temp HP first.

**Health colours (Robb, 2026-10-21, supersedes "no colour change"):** the fill colour shows health as a share of the **effective max** (`max + tempmax`, the "Y" in "X / Y HP"). Temp HP doesn't count.
- **Green** when `value * 100 >= 70 * eff`
- **Yellow** when `value * 100 >= 30 * eff` (and not green)
- **Red** otherwise, and also when `eff <= 0`
- Use integer maths (no rounded percent), so the boundaries are exact.
  - With max 100: 70 is green, 69 is yellow, 30 is yellow, 29 is red.
  - With max 45: 32 is green (71.1%), 31 is yellow (68.9%), 14 is yellow (31.1%), 13 is red (28.9%).
- Add `hpBand(value, effectiveMax)` → `'high' | 'mid' | 'low'` in `character.mjs`, and set `data-band` on `.agch-hp__bar`.

**Keeping every treatment distinct.** Each one differs by pattern and lightness as well as colour, so it reads for colour-blind players too. Preview of every combination: https://claude.ai/artifact/sgGZnPz8kP1uwFsgasf9mK

| Treatment | Look (new) | Why |
|---|---|---|
| Fill (current HP) | **Solid, no pattern**: green `#3a9d52`, yellow `#d9a21b`, red as today (`color-mix(var(--ag-danger) 70%, #400)`) | "Your HP" is the only solid colour |
| Temp HP | **Light silver diagonal stripes** (`#f3f6f9` / `#8fa3b4`, 4px/3px at 45°) inset 2px top and bottom, with a 1.5px near-black outline, layered **on top of** the fill | Today's yellow stripes would vanish into the yellow band; silver plus outline reads on green, yellow, red, dark and light tracks |
| Reduced max (`tempmax < 0`) | **Dark olive cross-hatch** (`#3c4520` / `#20250f` plus a dark diagonal) with a 3px sickly-green left edge (`#8fae3a`) | Stays "sickly", but dark and patterned, so it never looks like the green fill |
| Raised max (`tempmax > 0`) | **Blue frame**: 3px top and bottom bands plus a 2px left edge (`#4a90e2`), light blue tint inside, layered **above** temp | Stays blue and visible even when temp HP sits in the same range |
| Text | "X / Y HP", "(+T TEMP)" (light silver), "(+M MAX)" (light blue, new), "(−M MAX)" (light green), all white-ish with a dark halo (stacked `text-shadow`) | Reads on every fill and skin without hiding segments |

Layer order, bottom to top: track, fill, reduced max, temp, raised-max frame, text. The temp segment is capped at the start of the reduced-max part (`lostLeft`). These colours are game meaning, not skin colours: they stay literal values with an `ag-lint-allow` comment, the same in every skin.

Everything else stays exactly as today: segment positions from `hpBar()`, the editor, double-click and right-click, and Damage/Heal.

**New requirement: both adjustments visible together.** When a character has temp HP **and** an adjusted max HP, the yellow temp treatment and the blue or green max treatment must both be visible. Neither may hide the other.

What the current code does (checked against `hpBar()` on main, Hub 0.20.1):

| Case (max 20 unless noted) | Today | Must change? |
|---|---|---|
| Temp only: 12 HP, +5 temp, adj 0 | Yellow segment right after the fill | No |
| Max reduced only: 10 HP, adj −5 | Green lost part at the right (75–100%), "(−5 MAX)" | No |
| Max raised only: 25 HP, adj +5 | Blue overlay on the last 20% | No |
| Both, reduced max: 14 HP, +4 temp, adj −5 | Temp is pushed left to end at 75%, green part 75–100%. Both visible (existing test) | No. Add the full-HP variant below |
| Both, reduced max, full HP: 15 HP, +4 temp, adj −5 | Temp sits at 55–75%, over part of the fill; green part visible | No (fill still visible on the left) |
| **Both, raised max, near full: 24 HP, +4 temp, adj +5 (scale 25)** | Temp clamps to the right end (84–100%) and is drawn **after** the blue overlay at 90% opacity, so it **covers the blue part** (80–100%). Only a 2px blue edge may show | **Yes** |
| Both, raised max, low HP: 6 HP, +4 temp, adj +5 | Temp at 24–40%, blue at 80–100%. Both visible | No |
| Both, reduced max, low HP: 3 HP, +4 temp, adj −5 | Temp at 15–35%, green at 75–100%. Both visible | No |
| Edge: temp larger than effective max (adj −5, +20 temp) | Temp starts at 0 and runs into the green part, covering it | **Yes** (rare, but in scope) |

What the builder must change:
1. **Raised max:** draw the blue max-adjustment as a treatment that survives a temp segment on top of it. For example, a blue band along the top and bottom edges of its range plus its left edge line, layered **above** the temp stripes (`z-index`). The blue range then reads as "extra max" while the yellow stripes inside it read as temp.
   - Keep the blue colour and the range exactly as `hpBar()` computes it.
   - Also add "(+X MAX)" text in blue, next to "(+X TEMP)", the same way "(−X MAX)" works. That is a small addition; mention it in the CHANGELOG.
2. **Temp wider than the room left by a reduced max:** cap the temp segment at the start of the green part (`lostLeft`), and keep "(+X TEMP)" text showing the full amount. Layer the green part above the temp if they must touch.
3. **Don't change `hpBar()`'s existing numbers** for the cases the current test covers. Extend its return value only if needed (for example `boostText`).

Tests to add (`tests/polish.test.mjs` or a new `hp-states.test.mjs`):
- `hpBand` boundaries: (70,100) high, (69,100) mid, (30,100) mid, (29,100) low, (32,45) high, (31,45) mid, (14,45) mid, (13,45) low, (0,0) low.
- The full matrix: 3 bands × {no max change, max +6, max −6} × {no temp, +5 temp} (18 renders, max 30). Each render has the right `data-band` and the expected segment classes, and text with every label that applies.
- Both, raised max, near full (24 HP, +4 temp, adj +5): the rendered HTML contains both `agch-hp__temp` and `agch-hp__boost`, the boost layer sits above temp (by class or order, matching the CSS), and the text has "(+4 TEMP)" and "(+5 MAX)".
- Both, reduced max, full HP (15 HP, +4 temp, adj −5): temp ends at or before `lostLeft`, and both texts are present.
- Temp larger than the room (adj −5, +20 temp): the temp segment ends at `lostLeft`, and the text still says "(+20 TEMP)".
- Both at low HP, for both signs: the segments don't overlap each other.
- Keep the existing "HP bar: …" test passing unchanged.

### Cinders panel
- **Strain:** the existing bar, in its current place, becomes a kit `.ag-meter`.
  - The label sits beside the bar, not on the fill.
  - Tone follows the band: warn, then danger.
  - "+N over" is an `.ag-badge--danger`.
- **Powers:** `.ag-rows`, each with an `.ag-icon-chip`, title, meta and Use/Push as `--sm` buttons.
- **Sockets view:** kit rows and badges, read-only, as today.

### Lists and tabs
- **Item lists** (`.agch-cards`, the subgrid with stripes, header row and narrow fallback): keep the layout, because it is the reference for kit rows.
  - Switch to kit tokens: `--ag-row-h`, `--ag-row-alt`, rarity edge via `.ag-rarity-edge`.
  - Delete the duplicated selectors listed in the audit (the `.agch-cards`, `.agch-card__lead`, `.agch-chip`, `.agch-slotstrip`, `.agch-item__name`, `.agch-row__passive` and `.agch-companion__head` duplicates).
  - Delete the dead CSS (`.agch-item(s)`, `.agch-pane > .ag-tabs`, the undefined `agch-identity` reference).
- **Toolbar** (`.agch-toolbar`, `.agch-search`): kit `.ag-toolbar` + `.ag-search`. Death save sits in `__end`.
- **Badges and pills:** `.agch-pill`, `.agch-chip` and `.agch-filter` become `.ag-badge` (status) or `.ag-chip` (filters with `aria-pressed`).
- **Empty states:** `.ag-empty` with `__title` / `__text` everywhere. Wording per the standard, for example "No Cinder bound to this character yet." and "No powers unlocked yet. Unlock them in Skill Trees."
- **GM companion table:** `.ag-table` with `th scope="col"`.
- **Journey (new since the audit):** kit rows, badges and empty state. Hidden entries keep their GM-only marker (`.ag-gm-flag`).
- **Tooltips:** every remaining `title=` becomes `data-tooltip` (about 39 today). Disabled buttons get their reason as visible hint text, not only as a tooltip.

### Buttons and dialogs
- **Death save** becomes a plain `.ag-btn` with a d20 icon, not `--danger` (it's a roll).
- **Companion Remove** becomes `.ag-btn--danger --sm` plus `confirmDialog("Remove [name] from [character]'s companions? Their notes are deleted.", {title: 'Remove companion?', yes: 'Remove companion', danger: true})`.
- **Right-click unequip and right-click clear of a quick slot:** keep them as they are, but add a 5-second "Undo" notice (`.ag-notice`) for clearing a quick slot, or ask Robb which he prefers. Don't add a confirm to unequip without asking.
- **Push confirm** (`sheet.mjs`, `cinders.mjs`): `confirmDialog` with `yes: 'Push'` and `title: 'Push [power]?'`. No Yes/No.
- **Help** (`help.mjs`): `infoDialog` with Close.
- **Attunement:** keep the labelled `DialogV2.wait`, but open it through `ag-dialogs.mjs` (add a small `choiceDialog` if needed, in the shared file, on `ui/kit-2`).
- **Add the shared `ag-dialogs.mjs` copy** to the Hub.

### Tokens
- No hex in `character-hub.css` except window-opacity mixes that use tokens.
- No raw `font-size`; nothing under 11px (today 9px and 10px appear in about 6 places).
- Spacing and sizes through tokens, so Comfortable works everywhere in the sheet.
- The lint baseline for the Hub must go down. Update `scripts/ui-lint-baseline.json`.

## Versions
- Hub: **minor** above the version brief 1 sets. On 2026-10-21 that is 0.22.0, if brief 1 gives 0.21.0.
- Update `module.json` (version and download URL), the CHANGELOG and any hard-coded version string.
- CHANGELOG: "Sheet takes the Ashen Gate UI standard look (same layout): rounded controls, round slots, labelled confirmations, Foundry tooltips, Comfortable size supported. HP bar turns green, yellow or red with health; temp HP is now a silver striped shield, and temp HP and max-HP changes always show together."

## Acceptance checks
1. `node scripts/check.mjs ashen-gate-character-hub`, then the full `node scripts/check.mjs`: green. Existing tests keep passing. Add tests for:
   - the combined temp + max-adjustment cases (see "HP bar")
   - companion Remove asks first and does nothing on Cancel
   - Push uses labelled buttons
   - rail tabs carry `aria-label` and `data-tooltip`
2. **Layout unchanged:** art + slots column, content column, icon rail.
   - Before/after renders at the same window size show the same regions in the same places.
   - Diff review finds no change to the grid or region structure in `views.mjs` or `character.mjs`, and no change to the `.agch-split` / `.agch-char` / `.agch-railcol` grid rules apart from token values.
3. **HP bar unchanged and combined:**
   - Renders of the HP bar for each case in the "HP bar" table, in Standard, Stone Tablet, Parchment and Tome Pages, Compact and Comfortable.
   - Plus every cell of the 18-case matrix above, at Compact and Comfortable, in a dark skin (Standard) and a light skin (Parchment). Match the preview artifact.
   - Fill colour follows the band; temp, reduced max and raised max are each visible in every combination.
   - Double-click and right-click behaviour is unchanged (existing tests).
4. **Chromium renders** of the real Hub views (call the view functions in `scripts/views.mjs` and friends with the mocks in `tests/foundry-mock.mjs`):
   - Overview, Combat, Inventory, Cinders, Journey and companion GM table
   - 7 skins × Compact/Comfortable × widths 1240, 900, 640 and 420
   - Compare look and feel against the D mockup; attach before/after.
5. **Contrast:** HP numbers, Strain number and labels at least 4.5:1 in all skins, including Parchment and Tome Pages.
6. **Diff review:** no change to flags, settings, item data or `data-action` names.

## Forge click steps for Robb (after merge)
1. Open a character in the Hub as GM:
   - Same layout as before: art with the slots around it on the left, content on the right, icon rail on the far right.
   - The HP fill is green at 70% and up, yellow at 30–69%, red below 30%. Set HP to exactly 70% and 69%, and to 30% and 29%, of max to see the switches. Double-click still edits and right-click still opens dnd5e's settings.
   - Temp HP now shows as silver stripes with an outline (no longer yellow).
   - Give a character +5 temp HP and a max adjustment of +5: silver stripes and the blue frame both show, with "(+5 TEMP)" and "(+5 MAX)". Try at green, yellow and red HP.
   - Then set the max adjustment to −5: silver stripes and the dark green cross-hatch both show, with "(+5 TEMP)" and "(−5 MAX)".
   - Repeat once in Parchment and once with Comfortable.
2. Hover each icon on the right rail: a Foundry tooltip names the tab.
3. Equipped and quick bar: round slots with rarity colours. Hover one for the item card.
4. Cinders tab:
   - Strain is a slim bar with its number beside it.
   - Push a power: the dialog says "Push [power]?" with Cancel and Push.
5. Companions: Remove asks "Remove companion?" in red. Cancel keeps the companion.
6. Help: a dialog with a Close button.
7. My Appearance → Comfortable: the sheet gets larger and nothing clips. Back to Compact.
8. Tome Pages skin: HP numbers and the quick-bar numbers are readable.
9. Log in as a player: same checks on their own character. GM-only Journey entries stay hidden.

## Only Robb can verify
- dnd5e item tooltips on round slots.
- Drag and drop onto slots.
- Window opacity over the map.
- Real HP updates from combat.
- Touch behaviour on a tablet.
