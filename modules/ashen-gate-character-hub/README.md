# Ashen Gate | Character Hub (alpha)

An alternative character sheet for dnd5e 6 on Foundry V14. It shows and changes the **real** Actor: there is no separate character data, so the standard dnd5e sheet and the Hub always agree. Rolls, item use, rests, advancement and item configuration go through dnd5e's own dialogs.

## Open it
Open a character → the sheet's title-bar menu (**Sheet** / gear) → choose **Ashen Gate Character Hub**. Switch back the same way. It is never the default unless you pick it. **Open native sheet** in the Hub's header opens the standard dnd5e sheet at any time.

## What it does (0.1.0)
- Header: portrait, name, species, class/subclass, level, HP (Damage/Heal, edit current/temp/max adj.), AC, initiative roll, speed, proficiency, inspiration, exhaustion, hit dice, resources, conditions.
- Character tab: abilities (check and save rolls), skills (rolls, proficiency markers, passive).

## Permissions
Owners and the GM can change and roll. Observers can look only (the actions refuse them too, not just the buttons). Limited viewers see portrait and name.

## Public API
`game.modules.get('ashen-gate-character-hub')?.api`
- `open(actor)` → opens the Hub for a character (`{ok, error?}`).
- `openNativeSheet(actor)` → opens dnd5e's standard character sheet.
- `nativeSheetAvailable()`, `sheetClass`, `version`.

## Not yet
Full parity with the dnd5e sheet, spell preparation beyond a toggle, advancement/level-up screens (use the native sheet), drag-reorder, polished mobile layout, a GM "set as default" option.

## Tests
`node scripts/check.mjs ashen-gate-character-hub`. Tests use mocked Foundry: they prove logic and calls, not the live Foundry UI.
