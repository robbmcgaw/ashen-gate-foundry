# Ashen Gate | Character Hub (alpha)

An alternative character sheet for dnd5e 6 on Foundry V14. It shows and changes the **real** Actor: there is no separate character data, so the standard dnd5e sheet and the Hub always agree. Rolls, item use, rests, advancement and item configuration go through dnd5e's own dialogs.

## Open it
Open a character → the sheet's title-bar menu (**Sheet** / gear) → choose **Ashen Gate Character Hub**. Switch back the same way. It is never the default unless you pick it. **Open native sheet** in the Hub's header opens the standard dnd5e sheet at any time.

## What it does (0.4.0)
- Header: portrait, name, species, class/subclass, level, HP (Damage/Heal, edit current/temp/max adj.), AC, initiative roll, speed, proficiency, inspiration, exhaustion, hit dice, resources, conditions.
- Character tab: abilities (check and save rolls), skills (rolls, proficiency markers, passive).
- Combat: initiative, death save at 0 HP, weapons and usable features with **Use** (dnd5e's `item.use()`).
- Inventory: categories, containers, quantity, equip/attune, currency, Use for consumables, and the **Equipment** paper doll (display only, no slot rules). Equipping an item that needs attunement asks first; at the limit it lists attuned items to unattune.
- Magic: spells by level with slots, **Cast** (dnd5e casting dialog), Prepare toggle where dnd5e allows.
- Features: class/species/background and features by type.
- Rest: Short/Long Rest through dnd5e's rest dialogs.
- Companions: one mount and GM-limited pets, each an Item on the character, with perk Items attached (display only).
- GM Setup (GM only): default pet limit and per-character limits.
- Ashen Gate: read-only panels from the other Ashen Gate modules, each with an Open button (see below).

## Ashen Gate panels
Each panel uses only that module's public API (`game.modules.get(id)?.api`) and shows only what that module lets the current user see. Missing, hidden or failing modules show "Not installed" or "Unavailable"; the sheet keeps working.

| Panel | Reads | Open goes to |
|---|---|---|
| Profession Ledger | `getProfessions(actor)` (Ledger 0.18.0+); else `getProfessionProgress` per profession id from Skill Trees' `listTrees`. Plus `getKnownRecipes` | `open({actorId, view: 'individual'})` |
| Skill Trees | `listTrees`, `actorProgress`, and `pointsSummary(actor)` (Skill Trees 0.13.0+) for points to spend / spent | `open({actorId})` |
| Factions & Renown | `getFactions` (the user's own filtered view) | `open()` |
| Quest Log | `listVisible`, `tracking.getState` | `openObjective(id)` / `open()` |
| Locations | `listLocations` (GM: revealed only) | `openLocation(id)` / `open()` |
| Headquarters | `playerView(actor)` (Headquarters 0.9.0+): Guildhall name and rank, visible facilities; else a pointer to Headquarters | `open()` |
| Utilities | `purse.totals`, and `stash.listItems()` (Utilities 0.11.0+) for the first 8 stash items | `stash.open()` |

Newer APIs are feature-detected. When a partner is older, the panel shows what it showed before (for example, profession levels then need Skill Trees to list the professions).

APIs that would make the panels fuller (to request from the owning modules):
- Locations: the party's current or recent location.
- Headquarters: hirelings stay GM-private in Headquarters, so the panel says so instead of listing them.

## Saved data
- `flags.ashen-gate-character-hub.slot` on an Item, when the owner moves it to another paper-doll box. It changes only where the item shows.
- `flags.ashen-gate-character-hub.companions` on a character: the ordered companion list `[{id, kind: 'mount'|'pet', itemId, perkItemIds}]`. The Items themselves are ordinary Items on the character.
- World settings `petCap` (default 2) and `petCapOverrides` (`{actorId: number | 'none' | 'unlimited'}`), GM only.

## Companions
One mount per character; pets up to the GM's limit (world default 2, per-character override). Limits are checked in the add function itself, not just the UI, and lowering a limit never removes pets. Perk Items attached to a companion only display their own text: the Hub does not apply bonuses or Active Effects.

## Permissions
Owners and the GM can change and roll. Observers can look only (the actions refuse them too, not just the buttons). Limited viewers see portrait and name.

## Public API
`game.modules.get('ashen-gate-character-hub')?.api`
- `open(actor)` → opens the Hub for a character (`{ok, error?}`).
- `openNativeSheet(actor)` → opens dnd5e's standard character sheet.
- `companions(actor)` → `{mount, pets, petCap}` (read only); `petCapFor(actor)`.
- `nativeSheetAvailable()`, `sheetClass`, `version`.

## Not yet
Full parity with the dnd5e sheet, spell preparation beyond a toggle, advancement/level-up screens (use the native sheet), drag-reorder, polished mobile layout, a GM "set as default" option, applying companion perk bonuses or effects, Tidy5e support.

## Tests
`node scripts/check.mjs ashen-gate-character-hub`. Tests use mocked Foundry: they prove logic and calls, not the live Foundry UI.
