# Build brief 13: Kit 2.0.1 (`choiceDialog`) and Character Hub leftovers

Self-contained brief for a build chat. Read `CLAUDE.md`, `docs/ui-standard.md` §3 "Confirmations and dialogs", and `docs/ui-briefs/01-kit-2.md` (how shared files are released).

**Run this after briefs 04–12 have merged.** It changes the shared `ag-dialogs.mjs`, which every module that ships it must carry byte-identical, so it bumps many modules at once. Run in parallel with 04–12, it would clash with their versions. It runs **before** brief 14, because the strict lint needs the Hub's last direct DialogV2 call gone.

## Branch, merge, version
- Branch `ui/kit-2.0.1` from `main`. A normal PR; merge when green. Single purpose: shared dialog helper follow-up plus the Hub items that depend on it.
- **Versions:** patch bump above `main` for **every module that ships `ag-dialogs.mjs`** (`find modules -name ag-dialogs.mjs`), and minor for Character Hub (it gains behaviour). Recompute from `main`.
- **CHANGELOG line** in each module: "Shared dialog helper 2.0.1: choice dialogs follow the Ashen Gate look." The Hub adds its own items.

## Scope
1. **`ag-dialogs.mjs`** (all copies identical): add `choiceDialog(title, html, choices, {cancel = 'Cancel'} = {})`.
   - `choices` is a list of `{action, label, icon?, default?, danger?}`.
   - It opens `DialogV2.wait` with `classes: ['ag-app', 'ag-dialog']` (plus `ag-dialog--danger` if any choice is `danger`). Cancel comes first, so it sits on the left.
   - It resolves the chosen `action`, or `null` on Cancel or close.
   - Without DialogV2 it falls back to a numbered `prompt()`, or `null`.
   - Add tests to every module's dialogs test that already exists (same cases in each).
   - Copy the new file into every module that ships `ag-dialogs.mjs`. `check.mjs` enforces identical copies.
2. **Character Hub attunement prompt** (`scripts/item-actions.mjs`, about line 103, today a direct `DialogV2` with one button per choice): use `choiceDialog`. The choices and their order stay the same. Existing item-action tests keep passing; add one checking `classes` and that Cancel resolves `null`.
3. **Locations "Delete route" with a linked drawing** (`scripts/routes-ui.mjs`, the direct 3-button `DialogV2.wait`, about line 306 at `b2cd06b`): use `choiceDialog`, with Cancel plus the two existing actions and the same labels and results. `danger` applies to the delete choices. This is a Locations file change inside this PR; Locations gets the bump with the rest. Its `js-dialogv2-direct` count must reach 0.
4. **Character Hub kit-prefix classes** (4 left in the lint baseline): rename them to `agch-`.
5. **Hub quick-slot Undo (only if Robb has said yes; ask Studio first):** right-click clearing a quick slot shows a 5-second `.ag-notice--info` "Quick slot 3 cleared. **Undo**" in the sheet (not a Foundry notification).
   - Undo restores the slot's previous content, using the same flag write as setting a slot.
   - No new flag; keep the previous value in memory only.
   - Add tests: clear then Undo restores the slot; after 5 seconds the notice goes and the clear stays.
   - If Robb said no, or hasn't answered, skip this item and say so in the PR.
6. **Kit fixes reported by briefs 04–12.** Known so far:
   - **a. Danger button contrast:** `.ag-btn--danger` text is 4.47:1 in Standard, just under 4.5. Darken the soft background or lighten the text a little (`color-mix` toward `--ag-text`) so it reaches at least 4.5:1 in every skin. Keep the hover fill.
   - **b. Muted meta on rows:** `.ag-row__meta` on a selected or striped `.ag-row` is about 3.9:1 in Parchment. Raise the meta colour on `.ag-row.is-selected` and striped rows (for example `color-mix(in srgb, var(--ag-muted) 70%, var(--ag-text))`), or soften the row tints, until it reaches at least 4.5:1 in all 7 skins.
   - **c. `[hidden]` lost:** `.ag-empty:has(> .ag-empty__title){display:flex}` beats the `hidden` attribute. Add `:where(.ag-app) [hidden]{display:none !important}` to the kit (or scope the `display` rule to `:not([hidden])`). Check every kit part that sets `display`.
   - **d. Visually-hidden helper:** add `.ag-sr-only` to the kit (the standard clip pattern). Remove the local `.agl-sr` from Locations here (a one-line markup rename in Locations' own files, which gets its patch bump with this PR anyway). Note `.ag-sr-only` in `docs/ui-standard.md` §5.
   - Anything else reported by 04–12 goes here too.
   - Each of these makes `ag-ui.css` **2.1.0**, copied to all ten modules (so every module gets at least a patch bump). List each fix in the PR, with a contrast table for a and b.
   - `ag-ui.css` becomes `2.1.0` (a new part is a minor kit version).
   - Copy it to all ten modules (then every module gets at least a patch bump).
   - List each fix in the PR. If there are none, leave `ag-ui.css` alone.

## Acceptance checks
1. `node scripts/check.mjs` is green, with identical copies of `ag-dialogs.mjs` (and `ag-ui.css` if touched).
2. In Character Hub: `js-dialogv2-direct` is 0 and `css-kit-prefix-class` is 0. In Locations: `js-dialogv2-direct` is 0. The contrast check passes for danger buttons and for row meta on selected and striped rows in all 7 skins. A `hidden` `.ag-empty` stays hidden. Update the baseline. The lint baseline is shared: merge `main` last, then run `node scripts/ui-lint.mjs --update-baseline` and check that only intended entries changed.
3. **Chromium render** of `choiceDialog` markup in Standard, Stone Tablet and Tome Pages, at Compact and Comfortable.
4. **Diff review:** only `ag-dialogs.mjs` copies, version and CHANGELOG lines in other modules, plus the Hub items above.

## Forge click steps for Robb (after merge)
- Character Hub: equip an item that needs attunement. The choice dialog matches the skin: Cancel on the left, the choices on the right. Cancel changes nothing.
- (If item 4 was built) Right-click a quick slot to clear it: a notice offers **Undo** for 5 seconds. Undo puts the item back.
- Open any module's confirmation once: still labelled and skinned.
- Locations: delete a route that has a drawing. The dialog matches the skin with Cancel and the two choices.
- Parchment skin: the grey meta text on a selected list row is readable.

## Only Robb can verify
- Attunement with real dnd5e items and the attunement limit.
- Quick-slot Undo timing feel.
