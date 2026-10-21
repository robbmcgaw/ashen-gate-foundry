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
3. **Character Hub kit-prefix classes** (4 left in the lint baseline): rename them to `agch-`.
4. **Hub quick-slot Undo (only if Robb has said yes; ask Studio first):** right-click clearing a quick slot shows a 5-second `.ag-notice--info` "Quick slot 3 cleared. **Undo**" in the sheet (not a Foundry notification).
   - Undo restores the slot's previous content, using the same flag write as setting a slot.
   - No new flag; keep the previous value in memory only.
   - Add tests: clear then Undo restores the slot; after 5 seconds the notice goes and the clear stays.
   - If Robb said no, or hasn't answered, skip this item and say so in the PR.
5. **Kit fixes reported by briefs 04–12:** if a module pass reported a missing kit part or a kit bug, it belongs here.
   - `ag-ui.css` becomes `2.1.0` (a new part is a minor kit version).
   - Copy it to all ten modules (then every module gets at least a patch bump).
   - List each fix in the PR. If there are none, leave `ag-ui.css` alone.

## Acceptance checks
1. `node scripts/check.mjs` is green, with identical copies of `ag-dialogs.mjs` (and `ag-ui.css` if touched).
2. In Character Hub: `js-dialogv2-direct` is 0 and `css-kit-prefix-class` is 0. Update the baseline. The lint baseline is shared: merge `main` last, then run `node scripts/ui-lint.mjs --update-baseline` and check that only intended entries changed.
3. **Chromium render** of `choiceDialog` markup in Standard, Stone Tablet and Tome Pages, at Compact and Comfortable.
4. **Diff review:** only `ag-dialogs.mjs` copies, version and CHANGELOG lines in other modules, plus the Hub items above.

## Forge click steps for Robb (after merge)
- Character Hub: equip an item that needs attunement. The choice dialog matches the skin: Cancel on the left, the choices on the right. Cancel changes nothing.
- (If item 4 was built) Right-click a quick slot to clear it: a notice offers **Undo** for 5 seconds. Undo puts the item back.
- Open any module's confirmation once: still labelled and skinned.

## Only Robb can verify
- Attunement with real dnd5e items and the attunement limit.
- Quick-slot Undo timing feel.
