# Build brief 2: Character Hub pilot (first module on the UI standard)

Self-contained brief for a build chat. Read `CLAUDE.md`, `docs/ui-standard.md` (final) and the Character Hub section of `docs/ui-audit.md` on branch `design/ui-standard`. The target look is direction **D, Rounded Compact**, Hub overview screen in https://claude.ai/artifact/CzrqMiTA1VJ9Kiyahhi1At. Try it at both sizes.

**Depends on brief 1.** Branch `ui/hub-pilot` from `ui/kit-2`. Open a **draft PR** targeting `ui/kit-2`, titled `[HOLD → after 2026-10-23] Character Hub …`. Do not merge; follow "Holding PRs" in `docs/ui-pass-plan.md`. If you find a kit problem, fix it on `ui/kit-2` (and its brief-1 PR), then merge `ui/kit-2` into this branch. Never patch kit parts locally in the Hub.

## Goal
The Hub sheet follows the standard end to end and proves the kit-2 parts in the biggest player window. No data, flag or setting changes. Same `data-action` names, so behaviour and tests stay the same.

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
- **Portrait:** `.ag-portrait` with `--ag-ring` set to HP percent. Class `is-warn` at or below 50%, `is-danger` at or below 25%.
  - HP numbers stay as text beside it (current / max / temp).
  - The HP bar track is hidden on the overview, like the mockup. The HP editor (Cancel / Apply footer) stays as is, restyled with kit buttons.
- **Stats** (AC, Init, Speed): compact tiles in one row, as in the mockup.
- **Equipment slots and quick bar:** kit `.ag-slot` (circles) inside `.ag-hotbar`, with `data-rarity`, `__key`, `__qty`, `.is-empty`, `.is-active`.
  - Remove the Hub's own slot box styles. Keep the attuned ✦ marker and the `⋯` touch buttons, restyled with tokens.
  - Every slot has an `aria-label` and a `data-tooltip`. dnd5e item tooltips (`data-tooltip-html`) stay as they are.
- **Rarity:** delete the Hub's scoped `--ag-rarity-*` block (`character-hub.css` about line 26). Use the kit tokens through the existing `data-rarity` attributes (they already use dnd5e keys, including `veryRare`).
- **Light-skin fixes:**
  - HP text: replace `#fff`, `#400` and `#000` with tokens.
  - Quick-slot number shadow: replace `#000`.
  - Strain label on the accent fill: use `--ag-accent-contrast`, or move the text beside the bar.

### Cinders panel
- **Strain:** an `.ag-orb` (number in the middle, ring = Strain over the band maximum) with `.ag-meter` text beside it.
  - Tone follows the band: warn, then danger. "+N over" is an `.ag-badge--danger`.
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
- CHANGELOG: "Sheet moves to the Ashen Gate UI standard: HP ring portrait, round slots, Strain orb, labelled confirmations, Foundry tooltips, larger Comfortable size supported."

## Acceptance checks
1. `node scripts/check.mjs ashen-gate-character-hub`, then the full `node scripts/check.mjs`: green. Existing tests keep passing. Add tests for:
   - the HP ring tone thresholds
   - companion Remove asks first and does nothing on Cancel
   - Push uses labelled buttons
   - rail tabs carry `aria-label` and `data-tooltip`
2. **Chromium renders** of the real Hub views (call the view functions in `scripts/views.mjs` and friends with the mocks in `tests/foundry-mock.mjs`):
   - Overview, Combat, Inventory, Cinders, Journey and companion GM table
   - 7 skins × Compact/Comfortable × widths 1240, 900, 640 and 420
   - Compare against the D mockup; attach before/after.
3. **Contrast:** HP numbers, Strain number and labels at least 4.5:1 in all skins, including Parchment and Tome Pages.
4. **Diff review:** no change to flags, settings, item data or `data-action` names.

## Forge click steps for Robb (after merge)
1. Open a character in the Hub as GM:
   - The portrait sits in a green ring.
   - Damage the character below half: the ring turns amber. Below a quarter: red.
2. Hover each icon on the right rail: a Foundry tooltip names the tab.
3. Equipped and quick bar: round slots with rarity colours. Hover one for the item card.
4. Cinders tab:
   - Strain shows as an orb with a number.
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
