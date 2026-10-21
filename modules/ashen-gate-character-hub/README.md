# Ashen Gate | Character Hub (alpha)

An alternative character sheet for dnd5e 6 on Foundry V14. It shows and changes the **real** Actor: there is no separate character data, so the standard dnd5e sheet and the Hub always agree. Rolls, item use, rests, advancement and item configuration go through dnd5e's own dialogs.

## Open it
Open a character → the sheet's title-bar menu (**Sheet** / gear) → choose **Ashen Gate Character Hub**. Switch back the same way. It is never the default unless you pick it. **Open native sheet** in the Hub's header opens the standard dnd5e sheet at any time.

## What it does
Layout: the character on the left, the chosen section in the middle (only it scrolls), and an icon rail of sections down the right edge (hover for names). Opens at 1240 × 800; under about 900 px wide everything stacks. A header slider fades the whole window background (per user, 100-20 %) so the map shows through; text and controls stay solid. Every section heading (and each inventory container) folds open and closed; which ones are folded is remembered per user on that computer (client setting `collapsedSections`).
- Left: portrait with AC, equipment slots around it, initiative roll, speed, proficiency, HP bar, six abilities (check and save rolls), inspiration, conditions box (active ones; + to add), resources.
- HP bar: "X / X HP", "(+X TEMP)" and a yellow overshield when there is temp HP, a blue overlay for a max HP adjustment above normal max, a sickly-green lost part and "(−X MAX)" for a negative one. Double-click the bar to set current, temp and max adjustment; right-click opens dnd5e's Hit Points settings. The − / amount / + controls damage (temp HP first) or heal. Hit dice with Short/Long Rest and exhaustion sit right under the bar.
- **Right-click to configure:** AC, initiative, speed, HP, hit dice, death saves, each ability, skill and save, senses and proficiencies (armor, weapons, tools, languages) open dnd5e's own configuration window for that value, the same one the standard sheet opens. Only for users who can edit the character (owner or GM), as on the standard sheet. Speed's window has walk, burrow, climb, fly, jump, swim, hover and units (dnd5e 6 movement data); non-zero speeds and hover show on the Speed tile.
- Equipment slots (display only, no slot rules): head, neck, back, body, hands; main hand, off hand, waist, feet, bracers; ring, ring and three trinkets. Empty slots show an icon (or a word where no icon fits), set per slot in the `SLOT_PLACEHOLDERS` table in `scripts/constants.mjs` (Font Awesome class, Foundry image path such as `icons/equipment/...`, or text). Equipped items show a coloured border by dnd5e rarity (common white, uncommon green, rare blue, very rare purple, legendary orange, artifact red; CSS variables `--ag-rarity-<key>`). Click opens the item, right-click unequips, ⋯ opens Use, Attune, Swap (hands, rings), Move to party stash, Move to…; an empty slot offers Equip… with carried items that fit. **Other equipped** (folding list under the rings and trinkets) shows every equipped item not in a slot. Equipping an item that needs attunement asks first; at the limit it lists attuned items to unattune.
- Overview: skills (rolls, proficiency markers, passive) on the left; saving throws, passives and senses, proficiencies on the right; striped rows.
- Ashen Gate quick bar (under the section rail): Professions, Skill Trees, Renown and Quests show that module's view in the Ashen Gate tab; Headquarters and Locations open their module's own window. Players only get buttons for parts shown to them; the GM sees missing modules greyed out.
- Item lists (Combat, Inventory, Magic, Features, 0.11.0): each row is a small card with stripes, the item's image, name, a short summary of its description (**More** shows the full text in place, as plain text), a rarity edge (`--ag-rarity-*`) and key facts in columns under column headers. Facts are dnd5e's own prepared labels and item data, nothing worked out by the Hub: weapons Damage / To hit / Range / Properties; actions Range / Damage / Uses / Recovery; gear Qty / Weight / Value / Uses; spells School / Casting time / Range / Duration (C = concentration, R = ritual) / Components; features Use time / Uses / Recovery. Each tab has a search box (kept per tab while the sheet is open). Narrow windows show each fact with its own label.
- Combat: weapons and usable features with **Use** (dnd5e's `item.use()`), death save at 0 HP. Initiative is on the left (no longer in the tab).
- Inventory: search, Character / Party stash toggle, categories, containers (fold), quantity, equip/attune, currency, Use for consumables, Move to party stash. Party stash is Utilities' own stash view (0.12.0+) or a read-only list.
- Magic: **Group** by spell level, school, prepared, ritual, action type or none; **Sort** by name, level, school, prepared first, ritual first or action type. Spell-slot buttons at the top filter to one level. Toggles: Prepared only, Ritual only, Castable only (cantrips, or prepared with a dnd5e slot of that level or higher left). **Cast** opens dnd5e's casting dialog; Prepare toggles where dnd5e allows.
- Features: Favourites first. **Group** by feature type, action type, source (the granting item, dnd5e advancement origin), uses or none; **Sort** by name, type, has-uses first or action type. Filters: action type, has uses, uses left. Class, species and background are a card at the top of the character.
- Favourites (Magic, Features): the star is dnd5e's own character favourite (`system.favorites`, the same list as the standard sheet's Favorites); starred items also show in a Favourites group at the top. Owner or GM only; no star on a dnd5e version without favourites. Group/sort choices are remembered per user on that computer (client setting `listSort`).
- Ashen Gate: sub-tabs Professions, Perks, Renown, Quests, Locations, Base. Each shows that module's own view when it offers an embed (see below), else a read-only summary with an Open button.
- Companions (0.12.0):
  - One mount and GM-limited pets. Each is a world Actor (dropped from the Actors sidebar, linked by UUID) or an Item on the character.
  - The mount card has art, the player's name and description, a stats box and gear/perk rows. The stats box shows what gear and perks give, from their own Active Effects and armour value; it's display only and nothing is applied.
  - Pets have three clothing slots and perks.
  - What an item is for comes from its id prefix or a Hub flag: see `docs/companion-items-schema.md`.
- GM Setup (GM only): Player visibility (which parts players see), default pet limit and per-character limits.

## Combat helpers (0.13.0)
Tracking only: nothing is automated.
- **Mastery & marks** (bottom of the Hub): buttons for the marks this character may place, read from dnd5e data: equipped weapons' `system.masteryOptions` and owned spells by `system.identifier`.
  - A button toggles the mark on the user's targeted tokens.
  - A mark is an ActiveEffect with status `agch-<id>`, no changes, and the rules link in its description.
  - Tokens the player doesn't own are changed by the coordinating GM client after it checks the request (socket; a GM must be connected).
  - The table is `MARKS` in `scripts/marks.mjs`.
- **Quick bar:** 10 slots per character (flag `hotbar`) for the character's own items or world macros. Click to use; right-click to clear.

## Player visibility (0.9.0)
The GM chooses which parts of the Hub players see, so systems can be introduced one at a time: **GM Setup → Player visibility**, one switch per part, plus quick **Everything** and **Core only** buttons (they just set the switches). Default: everything on, so nothing changes until the GM turns something off.

Parts: Overview (skills, saves, senses), Combat, Inventory: character items, Inventory: party stash, Magic, Features, Short and Long Rest buttons, Equipment slots (paper doll), Companions, and each Ashen Gate sub-tab (Professions, Perks, Renown including Pantheon, Quests, Locations, Base). "Core only" keeps Overview, Combat, Inventory items, Magic, Features, Rests and the paper doll on and turns the rest off. The character column (HP, abilities, conditions, hit dice) always shows.

- **Players** (anyone who is not a GM) don't get a part that is off: its tab, sub-tab, segment or buttons are removed, no placeholder. A tab whose parts are all off disappears from the rail. With the paper doll off, AC shows as a tile.
- **Auto-hide:** a part backed by another module is also removed for players while that module is not active, or its own Player Access is off (read through its public `api.playerAccess.getState()`, contract `ag-player-access/1`; for the party stash also Utilities' `api.stash.isEnabled()`). A player whose summary that module refuses also gets no sub-tab for it. The Hub never reads another module's settings or flags.
- **The GM** always sees everything; a part players can't see carries a badge saying why: "Hidden from players: turned off in GM Setup", "… Renown Player Access is off", "… Quest Log is not active", "… the party stash is off in Utilities". Hidden rail icons are dimmed with an eye-slash.
- **Enforced, not just hidden:** while a part is hidden from players, the Hub's own actions for it refuse players: Companions add/remove/reorder/attach/detach, equipment slot overrides (Move to…, Swap, equip into a chosen slot), Short/Long Rest, and Move to party stash. Parts backed by other modules keep relying on those modules' own checks. Hiding a part never changes character data.
- **Live:** changing a switch, or a partner module's Player Access (or the Utilities stash switch), re-draws open Hub sheets on every client (the Hub's setting `onChange` and Foundry's `createSetting`/`updateSetting`/`deleteSetting` hooks for partner module ids; only the key is looked at). Activating or deactivating a module needs Foundry's usual reload.

Stored shape (world setting `ashen-gate-character-hub.playerVisibility`, GM only): `{partKey: boolean}`. A missing key means shown, so the default `{}` shows everything and parts added later start shown. Part keys: `overview`, `combat`, `inventory`, `partyStash`, `magic`, `features`, `rest`, `equipment`, `companions`, `professions`, `perks`, `renown`, `quests`, `locations`, `base`. Synthetic example (Combat and Renown hidden from players, everything else shown):

```json
{"overview": true, "combat": false, "inventory": true, "partyStash": true, "magic": true, "features": true, "rest": true,
 "equipment": true, "companions": true, "professions": true, "perks": true, "renown": false, "quests": true, "locations": true, "base": true}
```

## Embedded module views
When a partner module offers `api.embed.mount(element, {actorId, mode})` (returning `{unmount, refresh}`), the Hub shows that module's own view in place of its summary. The partner draws it, handles its buttons and checks its own permissions; the Hub only provides the element and keeps the view alive across re-renders. Modes the Hub asks for: Utilities `stash` (Inventory → Party stash), Profession Ledger `individual`, Skill Trees, Factions, Quest Log, Locations and Headquarters `character`. A partner without the API, or that throws, falls back to the summary or a short note.

| Where in the Hub | Module (version with the embed) | What it shows |
|---|---|---|
| Inventory → Party stash | Utilities 0.12.0 | Its stash view: purse, items, Take, Deposit |
| Ashen Gate → Professions | Profession Ledger 0.19.0 | Its Individual panel: professions, recipes, Learn, Craft |
| Ashen Gate → Perks | Skill Trees 0.14.0 | Points, perks available now with Unlock, unlocked and locked perks, Open tree |
| Ashen Gate → Renown | Renown 0.10.0 | Party and character standing per organization, next milestone, Open |
| Ashen Gate → Quests | Quest Log 0.8.0 | Party and character quests, Track, objectives, Character notes |
| Ashen Gate → Locations | Locations 1.13.0 | Journey progress, revealed places by region, Open |
| Ashen Gate → Base | Headquarters 0.10.0 | Guildhall, rank, this character's facilities and benefits, Open |

## Ashen Gate panels
Each panel uses only that module's public API (`game.modules.get(id)?.api`) and shows only what that module lets the current user see. Players don't get a panel for a missing or hidden module at all (see Player visibility); the GM sees "Not installed" or "Unavailable" with a badge, and the sheet keeps working.

| Panel | Reads | Open goes to |
|---|---|---|
| Profession Ledger | `getProfessions(actor)` (Ledger 0.18.0+); else `getProfessionProgress` per profession id from Skill Trees' `listTrees`. Plus `getKnownRecipes` | `open({actorId, view: 'individual'})` |
| Skill Trees | `listTrees`, `actorProgress`, and `pointsSummary(actor)` (Skill Trees 0.13.0+) for points to spend / spent | `open({actorId})` |
| Renown (ashen-gate-factions) | `getFactions` (the user's own filtered view) | `open()` |
| Quest Log | `listVisible`, `tracking.getState` | `openObjective(id)` / `open()` |
| Locations | `listLocations` (GM: revealed only) | `openLocation(id)` / `open()` |
| Headquarters | `playerView(actor)` (Headquarters 0.9.0+): Guildhall name and rank, visible facilities; else a pointer to Headquarters | `open()` |
| Utilities (Inventory → Party stash) | `purse.totals`, and `stash.listItems()` (Utilities 0.11.0+) for the stash items | `stash.open()` |

Newer APIs are feature-detected. When a partner is older, the panel shows what it showed before (for example, profession levels then need Skill Trees to list the professions).

APIs that would make the panels fuller (to request from the owning modules):
- Locations: the party's current or recent location.
- Headquarters: hirelings stay GM-private in Headquarters, so the panel says so instead of listing them.

## Saved data
- `flags.ashen-gate-character-hub.slot` on an Item, when the owner moves or swaps it to another equipment slot. It changes only where the item shows.
- `flags.ashen-gate-character-hub.companions` on a character: the ordered companion list `[{id, kind: 'mount'|'pet', itemId, perkItemIds}]`. The Items themselves are ordinary Items on the character.
- World setting `playerVisibility` (`{partKey: boolean}`, default `{}` = everything shown), GM only. See Player visibility.
- World settings `petCap` (default 0) and `petCapOverrides` (`{actorId: number | 'none' | 'unlimited'}`), GM only.
- Client setting `windowOpacity` (20-100, default 100): this user's window background opacity.

## Companions
One mount per character; pets up to the GM's limit (world default 0, so no pets until the GM raises it; per-character override). A world that already saved a limit keeps it. Limits are checked in the add function itself, not just the UI, and lowering a limit never removes pets. Perk Items attached to a companion only display their own text: the Hub does not apply bonuses or Active Effects.

## Permissions
Owners and the GM can change and roll. Observers can look only (the actions refuse them too, not just the buttons). Limited viewers see portrait and name. Parts the GM hides from players are refused to players in the Hub's actions too (see Player visibility).

## Public API
`game.modules.get('ashen-gate-character-hub')?.api`
- `open(actor)` → opens the Hub for a character (`{ok, error?}`).
- `openNativeSheet(actor)` → opens dnd5e's standard character sheet.
- `companions(actor)` → `{mount, pets, petCap}` (read only); `petCapFor(actor)`.
- `registerPetSlotSource(id, fn)` / `unregisterPetSlotSource(id)`: reserved for a later companion skill tree. `fn(actor)` returns extra pet slots added to the GM's limit ('No pets' and 'Unlimited' overrides still win). Nothing registers one yet.
- `playerVisibility` (0.9.0):
  - `parts()` → `[{key, label, partner}]` (`partner` is the backing module id or null); `presets()` → `[{id, label}]` (`everything`, `core`).
  - `get()` → the stored switches as `{partKey: boolean}` (every part, missing = true).
  - `isShown(key)` → `true` when players see that part (the GM's switch and the partner's Player Access); `hiddenReason(key)` → the reason string, or `null`.
  - `canSee(key)` → `true` for the current user (always for the GM).
  - `set({partKey: boolean})` and `applyPreset(id)` → GM only, resolve to `{ok, result | error}`; unknown keys and non-booleans are refused.
- `nativeSheetAvailable()`, `sheetClass`, `version`.

## Not yet
Full parity with the dnd5e sheet, spell preparation beyond a toggle, advancement/level-up screens (use the native sheet), drag-reorder, polished mobile layout, a GM "set as default" option, applying companion perk bonuses or effects, Tidy5e support.

## Tests
`node scripts/check.mjs ashen-gate-character-hub`. Tests use mocked Foundry: they prove logic and calls, not the live Foundry UI.
