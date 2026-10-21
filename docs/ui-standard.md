# Ashen Gate UI standard (draft)

Status: draft for Robb's approval. Builds on the current kit (`styles/ag-ui.css`) and Manager's skins; nothing here changes saved data.
Companion files: `docs/ui-audit.md` (what is wrong today), `docs/ui-pass-plan.md` (how we get there), `docs/ui-kit-next/` (draft CSS for the kit additions, used by the style guide).

## 1. Principles

1. **Kit first.** If the kit has a part, use it. If it doesn't, add it to the kit (in the coordinated release), not to one module.
2. **Tokens only.** Module CSS uses `var(--ag-…)` for colour, size, space, radius, shadow and motion. No hex, no `rgb()`, no raw `font-size` in module CSS (rarity hues are the one exception and they live in the kit).
3. **Skins come free.** A module that only uses kit classes and tokens looks right in all seven skins with no extra work. Local re-builds of kit parts are drift.
4. **One way per job.** One header, one toolbar, one footer, one confirm helper, one empty state, one badge, one table.
5. **Plain words.** Labels say what happens. Players never see ids, debug numbers or test wording.

## 2. Design tokens

Base tokens are what a skin sets; scale tokens never change; derived tokens are recomputed inside each `.ag-app` so they follow the skin.

### Colour (skin sets these)
| Token | Use |
|---|---|
| `--ag-surface` | Window background |
| `--ag-surface-sunken` | Inputs, wells, table head, track of a meter |
| `--ag-surface-raised` | Header, tabs, cards, toolbars, footers |
| `--ag-text` / `--ag-muted` | Body text / secondary text, hints, column heads |
| `--ag-border` | Hairlines and control borders |
| `--ag-accent` / `--ag-accent-contrast` | Brand and primary action / text on an accent fill |
| `--ag-ok` `--ag-warn` `--ag-danger` | Status only, never decoration |
| `--ag-focus` | Focus ring; also the info tone |

Derived (do not set in modules): `--ag-surface-hover`, `--ag-border-strong`, `--ag-accent-soft`, `--ag-accent-hover`, `--ag-ok-soft`, `--ag-warn-soft`, `--ag-danger-soft`, `--ag-shadow`. New in kit 2: `--ag-row-alt` (stripe), `--ag-row-selected`, `--ag-info`, `--ag-info-soft`, `--ag-shadow-sm`, `--ag-rarity-ink-*`.

Legacy aliases `--ag-bg` and `--ag-panel` stay working but are not used in new CSS; passes replace them with `--ag-surface` and `--ag-surface-raised`.

### Rarity (kit 2, scale tokens)
One set for every module, keyed by dnd5e rarity keys on a `data-rarity` attribute:

| dnd5e key | Hue token | Readable text token |
|---|---|---|
| `common` | `--ag-rarity-common` | `--ag-rarity-ink-common` (= muted) |
| `uncommon` | `--ag-rarity-uncommon` | `--ag-rarity-ink-uncommon` |
| `rare` | `--ag-rarity-rare` | `--ag-rarity-ink-rare` |
| `veryRare` | `--ag-rarity-very-rare` | `--ag-rarity-ink-very-rare` |
| `legendary` | `--ag-rarity-legendary` | `--ag-rarity-ink-legendary` |
| `artifact` | `--ag-rarity-artifact` | `--ag-rarity-ink-artifact` |

Hues are used for edges, dots and fills; text uses the ink token (the hue mixed toward the skin's text colour), so it reads on light and dark skins. Common is a grey, not white. Ledger "quality" (Common / Rare / Exotic) is not dnd5e rarity and does not use these tokens (decision D6).

### Type scale
`--ag-text-xs` 11 · `--ag-text-sm` 12 · `--ag-text-md` 14 (body) · `--ag-text-lg` 16 · `--ag-text-xl` 19 (header title). Nothing smaller than 11px. Fonts: `--ag-font-body`, `--ag-font-display` (skins change these), `--ag-font-mono` (version, ids in GM tools).

Weights: 400 body, 600 labels and row titles, 650 headings and primary buttons. Uppercase only through the `.ag-eyebrow` style or table heads (never typed in capitals in markup).

### Spacing
`--ag-space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 24 · `-6` 32. Window gutter is `--ag-space-4`; gaps inside a group `--ag-space-2`; between sections `--ag-space-4`.

### Size, radius, elevation, motion
- Controls: `--ag-control-h` 34, `--ag-control-h-sm` 28, `--ag-icon-btn` 30, `--ag-slot` 46. Every control in a row has the same height.
- Radii: `--ag-radius-sm` 4 (chips in tables, slots), `--ag-radius` 6 (controls), `--ag-radius-lg` 10 (cards, windows). Pills use 999px. Skins change the radii; modules never hard-code them.
- Elevation: flat by default. `--ag-shadow-sm` for a selected segment; `--ag-shadow` for windows and popovers only. Cards are separated by border, not shadow.
- Motion: `--ag-dur-fast` 120ms (hover), `--ag-dur` 180ms (meters, open/close), `--ag-ease`. Only colour, opacity and width transition. Every transition is removed under `prefers-reduced-motion`.

## 3. Components

Markup patterns below are the contract. Visual specimens in all skins: the style guide artifact.

### Window header
```html
<header class="ag-header">
  <div class="ag-header__title">
    <h1><span class="ag-header__brand">Ashen Gate</span> | Renown</h1>
    <p>Known allies, rivals and reputations</p>            <!-- optional one-line subtitle -->
  </div>
  <div class="ag-header__meta">
    <span class="ag-version">v0.12.0</span>
    <button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="help">
      <i class="fa-solid fa-circle-question" aria-hidden="true"></i> Help</button>
  </div>
</header>
```
Rules: always `h1`; module name only (never a record name, never "Alpha" or "Beta" in the title). Right side order: module-specific controls (opacity, Appearance), then version, then Help last. Version comes from `module.json` at runtime, never typed into templates. Help opens the shared info dialog with one **Close** button.

### Tabs
`<nav class="ag-tabs ag-tabs--scroll" role="tablist">` with `<button type="button" role="tab" aria-selected="true" class="active">`. Icon optional, always `aria-hidden`. GM-only tabs go last and carry `.ag-tab--gm`. Order: player tabs, content-management tabs (GM), **GM Setup** last. On narrow windows the strip scrolls sideways instead of wrapping to two rows.

Character Hub keeps its side rail (`.ag-siderail`) because it is a sheet, not a manager window (decision D3); every rail tab needs `aria-label` and `data-tooltip`.

### Toolbar
```html
<div class="ag-toolbar">
  <label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
    <input type="search" placeholder="Search organizations" aria-label="Search organizations"></label>
  <div class="ag-toolbar__filters">
    <select aria-label="Visibility">…</select>
    <div class="ag-chip-group"><button type="button" class="ag-chip" aria-pressed="true">Revealed</button>…</div>
  </div>
  <span class="ag-toolbar__count">12 of 40</span>
  <div class="ag-toolbar__end">
    <button type="button" class="ag-btn"><i class="fa-solid fa-plus" aria-hidden="true"></i> New faction</button>
  </div>
</div>
```
Order is fixed: search (grows), filters, count, then create on the right. Search filters as you type. Filters are selects (many options) or chips (2–5 toggles). Import/Export sit in `__end` as `--sm` buttons or in a "More" menu; seed/demo actions go to Developer Tools.

### Buttons
| Class | Use | Example |
|---|---|---|
| `.ag-btn--primary` | The one commit action of a view or dialog | Save Changes, Apply, Award, Unlock |
| `.ag-btn` | Everything else, including create | New faction, Import, Roll |
| `.ag-btn--ghost` | Low-weight or header actions | Help, Cancel, Clear filters |
| `.ag-btn--danger` | Removes or resets something | Delete faction, Unbind, Reset tree |
| `--sm` | Row actions, table cells, header | Edit, Reveal |
| `--icon` | Icon-only; needs `aria-label` + `data-tooltip` | ✕ remove, zoom |

At most one primary visible per pane. Button text is a verb + noun ("Delete faction"), not "OK" or "Yes". Rolls are never danger-styled. Unicode glyphs (× ✎ ⟲ ⚒) are replaced by Font Awesome icons.

### Footer (forms and editors)
`<footer class="ag-footer"><button class="ag-btn ag-btn--ghost">Cancel</button><span class="ag-footer__status" role="status"></span><button class="ag-btn ag-btn--primary">Save Changes</button></footer>`. Cancel bottom-left, primary bottom-right, status text between. Delete is never next to Cancel: it goes in the editor's own header or a "Danger zone" section at the end of the form. Views that save immediately (sheets, toggles) have no footer.

### Confirmations and dialogs
All dialogs use one shared helper file, `ag-dialogs.mjs` (promoted from today's byte-identical `dialogs.mjs`), which always opens DialogV2 with `classes: ['ag-app', 'ag-dialog']`:

| Helper | Buttons | Use |
|---|---|---|
| `confirmAction({title, body, action, danger})` | Cancel (left) · action (right) | Anything that changes or removes data |
| `infoDialog({title, body})` | Close | Help, read-only details |
| `formDialog({title, fields, action})` | Cancel · action | Small forms (name a folder, set a value) |

Wording: title is a question in sentence case ("Delete this faction?"); body says what happens and what is not undone, using names, never ids; action label repeats the verb ("Delete faction"). `danger: true` adds `.ag-dialog--danger` (red action). Confirm every destructive action, including removes that look small (companion, decoration, hireling, request deny).

### Badges and chips
- `.ag-badge` = status, not clickable: Revealed (`--ok`), Hidden (plain), Characters only (`--accent`), GM only (plain with `fa-eye-slash`), Error (`--danger`), Needs review (`--warn`).
- `.ag-chip` = toggleable filter (`aria-pressed`). Never use a badge as a button or a chip as a label.
- `.ag-rarity-badge[data-rarity]` for item rarity; `.ag-rarity-edge` for a row or card edge.
- Badges never hold sentences (they don't wrap). Errors go in `.ag-notice--danger`.

### Tables and rows
- `.ag-table` inside `.ag-table-wrap`: real `<table>`, sticky head, `th scope="col"`, even-row stripes, numbers right-aligned (`.is-num`), actions column `.is-actions`. Use for data with 3+ comparable columns.
- `.ag-rows` with `.ag-row` (`__icon`, `__main` → `__title` + `__meta`, `__end`): record lists (factions, quests, locations, rooms). Optional `.ag-rows__head`. Selected row: `.is-selected` + `aria-current="true"`. Stripes on.
- `.ag-list` stays for short plain stacks (settings, notes). Don't put buttons with their own padding inside `.ag-list` items.
- Group long lists under `.ag-eyebrow` headings with counts. Never truncate a name; wrap it.

### Cards
`.ag-card` with optional `__head` (`__title`, `__meta`), body, `__actions`. Use cards for things that stand alone (a deity, a Cinder, a facility). Use `.ag-card-grid` for galleries. Don't nest a card in a panel or a card in a card; sections inside a pane use `.ag-section` headings, not boxes.

### Forms
`.ag-field` (label above control, hint below), `.ag-field--inline` for checkboxes and short selects. Lay out with `.ag-form-grid` or the card grid. Labels in sentence case, no colon. Required fields say so in the hint. Inline validation errors use `.ag-field__hint` in danger colour plus `aria-invalid`.

### Notices
`.ag-notice--info|ok|warn|danger` with a leading icon: "Player view: hidden fields are not shown", "General Manager is not active, so the default look is used", "Saved", errors. One line where possible.

### Empty states
```html
<div class="ag-empty"><i class="fa-solid fa-landmark" aria-hidden="true"></i>
  <p class="ag-empty__title">No organizations yet</p>
  <p class="ag-empty__text">Create one with New faction, or import a file.</p>
  <button type="button" class="ag-btn ag-btn--sm">New faction</button></div>
```
Title: "No X yet" (or "Nothing matches" when filters hide everything, with a Clear filters button). Text: the next step, using names of real buttons and tabs. Player-facing version never mentions GM tools; it says what will appear and who reveals it ("Your GM hasn't revealed any organizations yet.").

### Meters and pips
`.ag-meter` (label, value, track, fill via `--ag-meter: 40%`) with `role="progressbar"` and `aria-valuenow/min/max`. Tones: default accent, `--ok`, `--warn`, `--danger`. Text never sits on the fill. `.ag-pips` for small counts (Strain points, clocks). Strain uses the same component in Hub and Cinders.

### Slots and hotbars
`.ag-hotbar` of `.ag-slot` buttons (46px): image, optional `__key` (number) and `__qty`, `.is-empty` dashed, `data-rarity` coloured border, `.is-active` ring. Each slot has `aria-label` and `data-tooltip`. Right-click clear needs an undo or a confirm.

### Tooltips
Foundry `data-tooltip="…"` with `data-tooltip-class="ag-tooltip"` (skinned), `data-tooltip-direction` where needed. Not `title` (it is slow, unstyled and shows twice with custom tips). Never put the only copy of important text in a tooltip; tooltips explain, they don't hold actions.

### Icons
Font Awesome 6, `fa-solid` only (`fa-regular` allowed for an outline/filled pair). Decorative icons `aria-hidden="true"`. One icon per concept across modules (keep a short table in the standard as modules adopt it: Help `fa-circle-question`, New `fa-plus`, Delete `fa-trash`, Import `fa-file-import`, Export `fa-file-export`, GM only `fa-eye-slash`, Search `fa-magnifying-glass`, Settings `fa-gears`).

## 4. Window layouts

| Pattern | Markup | Use |
|---|---|---|
| Tabs + single pane | `.ag-window` → header, tabs, `.ag-scroll` pane, optional footer | Most windows (Cinders, Utilities, Quest Log, Ledger) |
| List + detail | `.ag-split` → `.ag-split__list` (`.ag-rows`) + `.ag-split__detail` | Renown, Locations, Quest Log editor, Manager Items |
| Side rail | `.ag-siderail` + pane | Character Hub sheet only |
| Card gallery | `.ag-card-grid` in the pane | Pantheon, Facilities, Cinders list |
| Canvas | own layout inside the pane, kit toolbar above | Skill Trees board, HQ builder |

Rules:
- Header and tabs never scroll away. Exactly one scroll region per pane (`.ag-scroll`); the list column of a split scrolls on its own.
- The header spans the full window width, including above a list column.
- No fixed-height nested scrollers inside a scrolling pane.
- Developer Tools: a GM-only `<details class="ag-devtools">` at the bottom of GM Setup, titled "Developer Tools". Seeders, QA resets and demo loaders live only there. Real data migrations are not dev tools (they get a labelled card with a confirm).
- GM Setup holds settings only and ends with the standard footer (Cancel / Save Changes). Player Access is a setting: it saves with the footer like every other setting (decision D4).

## 5. Accessibility basics

- Focus: the kit ring (`--ag-focus`, 2px, offset 2px) on every focusable thing; never remove it. Module CSS doesn't add its own ring.
- Keyboard: tabs are buttons with `role="tab"`; segmented and skin pickers are radio groups with arrow keys (pattern in Manager `skin-picker.js`); every action reachable without a mouse; Escape closes dialogs and popovers.
- Labels: icon-only buttons get `aria-label`; inputs have a visible label or `aria-label`; tables use `th scope`.
- Contrast: body text 4.5:1, large text and icons 3:1, in every skin. Text on an accent fill uses `--ag-accent-contrast`, text on a danger fill uses `--ag-surface`. The style guide checks the pairs.
- Reduced motion: no transitions or spinners loop under `prefers-reduced-motion` (kit rule extends to animations in kit 2).
- Status messages use `role="status"`; errors `role="alert"`.

## 6. Responsive rules

- Use **container queries on the window content**, not viewport `@media` (Foundry windows resize independently of the screen). Each window sets `container-type: inline-size` on its content; kit 2 does this for `.ag-split`.
- Breakpoints (window width): **40rem** (640px) list+detail stacks, tables show labelled stacked rows, toolbar filters wrap below search; **60rem** (960px) three-column layouts drop to two.
- Default window sizes fit a 1280×720 laptop. Minimum size declared once in `DEFAULT_OPTIONS`, not in CSS.
- Tabs scroll sideways; toolbars wrap; cards reflow by `auto-fill`. Text wraps, never clips.

## 7. Copy and tone

- Sentence case for titles, tabs, buttons, headings ("Save changes" is fine; "SAVE CHANGES" is not). Exception: proper names and the "Ashen Gate | Module" header.
- Buttons: verb + noun. Dialogs: question title, consequence body, verb button.
- Name things the way the table does: characters, not actors; factions, not records; "GM Setup", not "Management".
- No ids, revision numbers, build notes, "Alpha", "test default", "pending confirmation" or people's names in any player view. GM views show canonical ids only in GM tools (mono font, copy button).
- Empty states: "No X yet." + next step. Errors: what failed + what to do ("Import failed: the file is not Renown JSON. Export from Renown 0.9 or later.").
- Don't prefix every heading with "GM ·" inside GM-only tabs; mark a GM-only *section* inside a player tab with `.ag-gm-flag`.

## 8. How a module gets it for free

Shared files, byte-identical in every module that ships them (`scripts/check.mjs` enforces):

| File | Today | Kit 2 |
|---|---|---|
| `styles/ag-ui.css` | yes, all modules | + additions from `docs/ui-kit-next/ag-ui-next.draft.css` |
| `ag-launchers.mjs` | yes, player-facing modules | unchanged |
| `ag-dialogs.mjs` | four identical `dialogs.mjs` copies (Utilities, HQ, Quest Log, Renown) | promoted, renamed, `ag-app ag-dialog` classes, added to the check |
| `ag-html.mjs` (new, optional) | — | tiny string helpers used by modules that build HTML in JS: `header({module, version})`, `btn({label, icon, kind})`, `empty({title, text})`, `badge()`, `esc()` |

A new module: copy the shared files, list `styles/ag-ui.css` first in `module.json`, add `ag-app` to its window classes, build the shell from §3, keep its own CSS to layout only. Template snippet for a new window lives in the style guide ("New module starter").

## 9. Evolving shared files safely

1. **Kit version line.** `ag-ui.css` gets a first-line comment `/* ag-ui kit 2.0.0 */`. `check.mjs` already fails if copies differ; it will also print the kit version per module.
2. **Additive first.** A kit release only adds classes and tokens or fixes a rule without changing its markup contract. Renames and removals happen in a later release, after every module has moved off the old class.
3. **One coordinated release.** The shared-file PR touches every module: copies the kit, bumps each module's patch version, adds the same one-line CHANGELOG entry ("Shared UI kit 2.0.0"), and runs `node scripts/check.mjs`. It merges as one commit so Forge updates all modules together.
4. **Skins in the same release.** Manager's structural skins get rules for every new kit component in that same PR (draft: `docs/ui-kit-next/skins-next.draft.css`). The drift check (pass plan) verifies each kit component is mentioned in both structural skin files.
5. **Order with module passes.** Module passes that use new classes merge after the kit release. A pass may never copy a kit addition locally to get ahead.
6. **Mixed versions in a world.** A GM may update one module and not another. Every kit copy is the same file and loads the same rules, so the newest copy loaded wins harmlessly; older modules keep working because nothing was removed.
