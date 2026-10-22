# Ashen Gate | Character Hub (alpha)

An alternative character sheet for dnd5e 6 on Foundry V14. It shows and changes the **real** Actor: there is no separate character data, so the standard dnd5e sheet and the Hub always agree. Rolls, item use, rests, advancement and item configuration go through dnd5e's own dialogs.

## Open it
Open a character → the sheet's title-bar menu (**Sheet** / gear) → choose **Ashen Gate Character Hub**. Switch back the same way. It is never the default unless you pick it. **Open native sheet** in the header's **⋯** menu opens the standard dnd5e sheet at any time. **Level up** under the character's name starts dnd5e's own level-up, or adds a class through dnd5e's class browser (it adds no rules of its own). Each level-up keeps a GM-only copy of the character as it was, named `<name> - level X`, in the Actor folder Ashen Gate / Level backups.

## What it does
Layout: the character on the left, the chosen section in the middle (only it scrolls), a rail of sections down the right edge (icon and name; icons only between about 900 and 1000 px wide; arrow keys move between them), and the Ashen Gate quick bar along the bottom edge. Opens at 1240 × 800; under about 900 px wide the tabs come first and the character folds to its name, HP and AC (**Show character** opens it; remembered per user in the browser, kit `uiState`). The header holds only **Compact** / **Full**, the **⋯** menu (Appearance…, Pop out, NPC Codex, Open native sheet) and the version with Help (0.33.0). The window is always opaque (the 0.10.0-0.28.x opacity slider was removed in 0.29.0). **Compact** in the header shrinks it to one narrow column (per user, client setting `compactMode`): the art with its equipment slots, initiative / speed / proficiency on one line, HP with hit dice, rests, exhaustion and Strain, the six abilities with their saves and the conditions (0.32.0; the column scrolls inside itself), with Mastery & marks and the quick bar frozen at the bottom, with an optional, experimental see-through background (60-100 %) in its **⋯ → Appearance…** menu; **Pop out** (in the ⋯ menu) moves it into its own browser window with Foundry V14's own ApplicationV2 detach. Every section heading (and each inventory container) folds open and closed; which ones are folded is remembered per user on that computer (client setting `collapsedSections`).
- Left: portrait with AC, equipment slots around it, initiative roll, speed, proficiency, HP bar, six abilities (check and save rolls), inspiration, conditions box (active ones; + to add), resources.
- HP bar: "X / X HP"; the fill is green at 70% of max HP and up, yellow from 30%, red below. Temp HP is a silver striped shield with "(+X TEMP)", a max HP adjustment above normal max is a blue frame with "(+X MAX)", a negative one a dark green cross-hatched part with "(−X MAX)"; temp HP and a max change always show together. Double-click the bar to set current, temp and max adjustment; right-click opens dnd5e's Hit Points settings. The − / amount / + controls damage (temp HP first) or heal. Hit dice with Short/Long Rest and exhaustion sit right under the bar.
- **Right-click to configure:** AC, initiative, speed, HP, hit dice, death saves, each ability, skill and save, senses and proficiencies (armor, weapons, tools, languages) open dnd5e's own configuration window for that value, the same one the standard sheet opens. Only for users who can edit the character (owner or GM), as on the standard sheet. **Configure…** under the name (0.33.0) lists the same windows for keyboard users; saving throws are rolled from the ability tiles (the Overview's separate Saving Throws list was removed in 0.33.0). Speed's window has walk, burrow, climb, fly, jump, swim, hover and units (dnd5e 6 movement data); non-zero speeds and hover show on the Speed tile.
- Equipment slots (display only, no slot rules): head, neck, back, body, hands; main hand, off hand, waist, feet, bracers; ring, ring and three trinkets. Empty slots show an icon (or a word where no icon fits), set per slot in the `SLOT_PLACEHOLDERS` table in `scripts/constants.mjs` (Font Awesome class, Foundry image path such as `icons/equipment/...`, or text). Equipped items show a coloured border by dnd5e rarity (common white, uncommon green, rare blue, very rare purple, legendary orange, artifact red; CSS variables `--ag-rarity-<key>`). Click opens the item, right-click unequips, ⋯ opens Use, Attune, Swap (hands, rings), Move to party stash, Move to…; an empty slot offers Equip… with carried items that fit. **Other equipped** (folding list under the rings and trinkets) shows every equipped item not in a slot. Equipping an item that needs attunement asks first; at the limit it lists attuned items to unattune.
- Overview: skills (rolls, proficiency markers, passive) on the left; saving throws, passives and senses, proficiencies on the right; striped rows. **Professions** (0.30.0) under Proficiencies: each profession the character knows with its level, from the Profession Ledger's `getProfessions(actor)` (feature-detected); click the box to show Ashen Gate → Professions. No box without the Ledger (or one without `getProfessions`), when Professions is hidden from players (the GM's switch, or the Ledger's Player Access off), or when the Ledger refuses the user.
- Ashen Gate quick bar (a thin bar along the bottom edge since 0.29.0; hidden in Compact): one button per Ashen Gate sub-tab, with the same name and icon (Professions, Skill Trees, Cinders, Renown, Quest Log, Locations, Headquarters); each shows that module's view in the Ashen Gate tab (0.33.0; Headquarters and Locations opened their window before), whose Open button opens the module's own window. Players only get buttons for parts shown to them; the GM sees missing modules greyed out.
- Item lists (Combat, Inventory, Magic, Features, 0.11.0): each row is a small card with stripes, the item's image, name, a short summary of its description (**More** shows the full text in place, as plain text), a rarity edge (`--ag-rarity-*`) and key facts in columns under column headers. Facts are dnd5e's own prepared labels and item data, nothing worked out by the Hub: weapons Damage / To hit / Range / Properties; actions Range / Damage / Uses / Recovery; gear Qty / Weight / Value / Uses; spells Casting time / Range / Duration (C = concentration, R = ritual) / Components, with the level and school beside the name (0.33.0); features Use time / Uses / Recovery. Each tab has a search box (kept per tab while the sheet is open); in Combat, Magic and Features **Filters (n)** beside it opens Group, Sort and the filter chips (0.33.0), and only that one row stays frozen at the top (Magic adds its spell levels; Inventory's purse and weight bar scroll with the list). Narrow windows show each fact with its own label.
- Frozen bands (0.30.0): the search box, Group / Sort, the filter buttons (Magic: the spell-level strip too) and, in Inventory, the attunement counter, coin purse and weight bar stay at the top while the list scrolls (`position: sticky` inside the scrolling list). Search, filters, open "More" texts and open menus last while the Hub is open and start fresh when it is opened again.
- Weapon mastery (0.30.0): weapon cards (Combat and Inventory) show the weapon's mastery from dnd5e (`system.mastery`, name from `CONFIG.DND5E.weaponMasteries`); hovering shows dnd5e's own rules page for it (its `reference`, as a dnd5e rich tooltip). Dimmed when dnd5e's `system.masteryOptions` says the character can't use it.
- Combat: weapons and usable features with **Use** (dnd5e's `item.use()`), death save at 0 HP. Initiative is on the left (no longer in the tab). 0.31.0: grouped by main category (Combat: weapons, armor, shields; Professions: tools and `PROF-`/`REC-`/`MAT-` records; Consumables; Features; Trinkets: everything else), or by action type, or not at all; sort by name, equipped first, action type or has uses first (client setting `listSort.combat`); filter chips per action type, **Hide unequipped**, **Has uses**, **Uses left**; favourites at the top. The search, selects and chips stay at the top while the list scrolls (0.30.0's frozen band).
- Appearance (0.31.0; in the header's ⋯ menu since 0.33.0): only for the user who changes it. With General Manager (`api.appearance`, contract `ag-appearance/0.1-beta`) it sets the user's own skin (`setUserOverride`, '' = the GM's world default) and this device's size (`setSize`), and links to My Appearance; Manager stores them. Without Manager: Dark / Light and the size Compact / Comfortable in the user-scope setting `look` (`{theme, density}`, 'world' = the GM's default); the GM's default is the world setting `lookDefault`, set in GM Setup → Hub appearance.
- NPC Codex (0.31.0; in the header's ⋯ menu since 0.33.0): opens General Manager's read-only Codex window (`api.codex.openPlayerView`). The GM always gets it; players only while Manager's NPC Codex player access is on (`api.codex.playerAccessEnabled()`). No Codex data is kept in the Hub.
- Cinders in the header (0.31.0): under the name, a small orb and the name of each Cinder the character bears (`cinder.list`); a click opens Ashen Gate → Cinders. The Cinders button on the Ashen Gate quick bar stays.
- Inventory: search, Character / Party stash toggle, categories, containers (fold), quantity, equip/attune, currency, Use for consumables, Move to party stash. Beside the coin purse a small bar fills with dnd5e's carried weight against its carrying capacity (`system.attributes.encumbrance` value / max, dnd5e's weight unit; red over capacity); no bar when dnd5e gives no capacity. Party stash is Utilities' own stash view (0.12.0+) or a read-only list.
- Magic: **Group** by spell level, school, prepared, ritual, action type or none; **Sort** by name, level, school, prepared first, ritual first or action type. Spell-slot buttons at the top filter to one level. Toggles: Prepared only, Ritual only, Castable only (cantrips, or prepared with a dnd5e slot of that level or higher left). **Cast** opens dnd5e's casting dialog; Prepare toggles where dnd5e allows.
- Features: Favourites first. **Group** by feature type, action type, source (the granting item, dnd5e advancement origin), uses or none; **Sort** by name, type, has-uses first or action type. Filters: action type, has uses, uses left. Class, species and background are a card at the top of the character.
- Favourites (Magic, Features): the star is dnd5e's own character favourite (`system.favorites`, the same list as the standard sheet's Favorites); starred items also show in a Favourites group at the top. Owner or GM only; no star on a dnd5e version without favourites. Group/sort choices are remembered per user on that computer (client setting `listSort`).
- Ashen Gate: sub-tabs (kit `.ag-tabs--sub`, arrow keys) Professions, Skill Trees, Cinders, Renown, Quest Log, Locations, Headquarters (0.33.0: the same names as the quick bar; they were Perks, Quests and Base). Each shows that module's own view when it offers an embed (see below), else a read-only summary with an Open button.
- Companions (0.12.0):
  - One mount and GM-limited pets. Each is a world Actor (dropped from the Actors sidebar, linked by UUID) or an Item on the character.
  - The mount card has art, the player's name and description, a stats box and gear/perk rows. The stats box shows what gear and perks give, from their own Active Effects and armour value; it's display only and nothing is applied.
  - Pets have three clothing slots and perks.
  - What an item is for comes from its id prefix or a Hub flag: see `docs/companion-items-schema.md`.
- GM Setup (GM only): Player visibility (which parts players see), default pet limit and per-character limits.

## Journey (0.20.0, alpha)
A per-character log of accomplishments, newest first, in the **Journey** tab (alpha). It records **from now on**; nothing earlier is back-filled.
- **Automatic entries**, only from existing events and public APIs:
  - **Level-ups:** dnd5e's character level (`system.details.level`) rising.
  - **Renown tier changes:** a character's personal rank and the party's rank with each faction, and its rank with each deity. Read through Renown's public `getFactions()` / `getPantheon()` as the owning player sees them, so they are recorded while that player is online and Renown's Player Access is on. The GM's view has no standings.
  - **Quests completed:** Quest Log's GM `listQuests()` / `getGMState()`. A personal quest is logged for its character; a party quest for every player character.
  - **Quest rewards (items and coins, 0.25.0):** recorded when Quest Log grants a reward, through `api.journey.recordReward(actor, {questId, questName, coins, text, items, grantId})` (GM only; refused for players in the API). `items` is optional, up to 50 of `{name, img, quantity, itemId}` (anything else is dropped); `grantId` is optional (`A-Z a-z 0-9 _ -`, up to 40). The text reads `Reward for "<quest>": 2 × [TEST] Healing Draught, [TEST] Rusted Blade, 10 gp`, and the row shows small pictures of the items (name and quantity on hover; no ids). There is no separate Rewards panel. The older call `{questId, questName, coins}` works exactly as before.
- **Idempotent:** every automatic entry has a stable id per event (`level-5`, `quest-<id>`, `renown-<faction>:<scope>-<rank>-<event>`, `reward-<questId>`, or `reward-<questId>-<grantId>` so a later grant gets its own entry), so a re-fire never duplicates. At most 300 entries per character are kept.
- **Players** see their own characters' visible entries. Observers and other players see nothing.
- **The GM** sees every character's journey (a character picker) and can:
  - add notes (text and an optional date, optionally hidden);
  - edit any entry;
  - hide or show any entry;
  - delete GM notes (automatic entries can only be hidden).
  All of these are refused for players in the data layer.
- **Storage:**
  - Visible entries: `flags.ashen-gate-character-hub.journey` on the Actor (`{v, entries, seen}`).
  - Hidden entries: a GM-only JournalEntry ("Ashen Gate Hub • Journey (GM only)", no player permission), flag `journeyHidden`, so players never receive them with their Actor.
  - Quest statuses last seen: world setting `journeyQuestSeen`.
- **Writers:** one client writes for each character, the first active GM, else the character's first active owner. Renown entries are written by the owner's client.

## Combat helpers (0.13.0)
Tracking only: nothing is automated.
- **Mastery & marks** (bottom of the Hub; 0.30.0: one strip that does not fold, with the target count, Strain and its title in the right corner and the marks wrapping to the left of them): buttons for the marks this character may place, read from dnd5e data: equipped weapons' `system.masteryOptions` and owned spells by `system.identifier`.
  - A button toggles the mark on the user's targeted tokens.
  - A mark is an ActiveEffect with status `agch-<id>`, no changes, and the rules link in its description.
  - Tokens the player doesn't own are changed by the coordinating GM client after it checks the request (socket; a GM must be connected).
  - The table is `MARKS` in `scripts/marks.mjs`. Spell marks: Hunter's Mark, Hex, Bane, Faerie Fire, Guiding Bolt, Vicious Mockery, Ensnaring Strike; 0.28.0 added Bless, Searing Smite, Wrathful Smite and Shining Smite (also offered by a spell with identifier `branding-smite`).
  - **Strain** (0.28.0): with Ashen Gate | Cinders active, the character's own Strain shows read-only at the end of the row (value, band; the tooltip has the Push Backfire chance), from `api.strain.get`. Hidden when Cinders is missing or the GM hides the Strain bar from players. It is not a mark and is never put on targets.
- **Quick bar:** 10 slots per character (flag `hotbar`) for the character's own items or world macros. Click to use, or press **1-9 / 0** (0.29.4: Foundry keybindings, Configure Controls → Ashen Gate | Character Hub) to use a slot of the Hub in front, also in a popped-out Hub; never while typing in a field, and with no Hub open the keys stay Foundry's macro bar. Right-click to clear. After a clear, an **Undo** notice shows for 5 seconds (0.26.0): Undo puts that slot back as it was, unless the item or macro is gone or something else was put in the slot meanwhile (it says so); otherwise the clear stands.

## Player visibility (0.9.0)
The GM chooses which parts of the Hub players see, so systems can be introduced one at a time: **GM Setup → Player visibility**, one switch per part, plus quick **Everything** and **Core only** buttons (they just set the switches). Default: everything on, so nothing changes until the GM turns something off.

Parts: Overview (skills, senses, proficiencies), Combat, Inventory: character items, Inventory: party stash, Magic, Features, Short and Long Rest buttons, Equipment slots (paper doll), Companions, Strain bar, and each Ashen Gate sub-tab (Professions, Skill Trees, Cinders, Renown including Pantheon, Quest Log, Locations, Headquarters; the setting keys stay `perks`, `quests`, `base`). "Core only" keeps Overview, Combat, Inventory items, Magic, Features, Rests and the paper doll on and turns the rest off. The character column (HP, abilities, conditions, hit dice) always shows.

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
When a partner module offers `api.embed.mount(element, {actorId, mode})` (returning `{unmount, refresh}`), the Hub shows that module's own view in place of its summary. The partner draws it, handles its buttons and checks its own permissions; the Hub only provides the element and keeps the view alive across re-renders. Modes the Hub asks for: Utilities `stash` (Inventory → Party stash), Profession Ledger `individual`, Skill Trees, Factions, Quest Log, Locations and Headquarters `character`. A partner without the API, or that throws, falls back to the summary or a short note. The Hub checks for the API, never a partner's version number.

| Where in the Hub | Module (version with the embed) | What it shows |
|---|---|---|
| Inventory → Party stash | Utilities 0.12.0 | Its stash view: purse, items, Take, Deposit |
| Ashen Gate → Professions | Profession Ledger 0.19.0 | Its Individual panel: professions, recipes, Learn, Craft |
| Ashen Gate → Skill Trees | Skill Trees 0.14.0 | Points, perks available now with Unlock, unlocked and locked perks, Open tree |
| Ashen Gate → Renown | Renown 0.10.0 | Party and character standing per organization, next milestone, Open |
| Ashen Gate → Quests | Quest Log 0.8.0 | Party and character quests, Track, objectives, Character notes |
| Ashen Gate → Locations | Locations 1.13.0 under the old numbering; every 0.18.0+ (renumbered from 1.18.0) | Journey progress, revealed places by region, Open |
| Ashen Gate → Headquarters | Headquarters 0.10.0 | Guildhall, rank, this character's facilities and benefits, Open |

## Ashen Gate panels
Each panel uses only that module's public API (`game.modules.get(id)?.api`) and shows only what that module lets the current user see. Players don't get a panel for a missing or hidden module at all (see Player visibility); the GM sees "Not installed" or "Unavailable" with a badge, and the sheet keeps working.

| Panel | Reads | Open goes to |
|---|---|---|
| Profession Ledger | `getProfessions(actor)` (Ledger 0.18.0+); else `getProfessionProgress` per profession id from Skill Trees' `listTrees`. Plus `getKnownRecipes` | `open({actorId, view: 'individual'})` |
| Skill Trees | `listTrees`, `actorProgress`, and `pointsSummary(actor)` (Skill Trees 0.13.0+) for points to spend / spent | `open({actorId})` |
| Cinders (ashen-gate-cinders, 0.18.0) | `cinder.list(actor)`: the character's Cinders, powers and Push modes with cost and Backfire chance. **Push** uses `cinder.previewPush` for the confirmation, then `cinder.push` (a player's Push is rolled by the GM client). Each Cinder is a compact orb (0.24.0): Strain ring, socket dots, and `cinder.list` `art` (Cinders 0.6.0+) or the default orb whose colour follows Strain; 0.31.0: art sits on the Strain-toned orb as a glow and turns slowly (Cinders 0.9.0's markup; off when Cinders' `rotateArt` or `rotateArtLocal` setting is off, and under reduced motion). **Open skill tree** next to the Cinders title opens Skill Trees' `api.open({actorId, treeId})` (players: while Perks is shown). **Sockets** (Cinders 0.3.0+, contract `ag-sockets/1`): `sockets.hosts(actor)` rows with **Attach / Swap / Detach** and drop-on-a-row through `canAttach`, `attach`, `swap`, `detach` (GM: `attachDropped` for a sidebar Item), and an Items that fit tray from `socketable`. Owner while Cinders' Player Access is on and the Cinder isn't locked; GM always; Cinders checks again | `open({actorId})` |
| Renown (ashen-gate-factions) | `getFactions` (the user's own filtered view) | `open()` |
| Quest Log | `listVisible`, `tracking.getState` | `openObjective(id)` / `open()` |
| Locations | `listLocations` (GM: revealed only) | `openLocation(id)` / `open()` |
| Headquarters | `playerView(actor)` (Headquarters 0.9.0+): Guildhall name and rank, visible facilities; else a pointer to Headquarters | `open()` |
| Utilities (Inventory → Party stash) | `purse.totals`, and `stash.listItems()` (Utilities 0.11.0+) for the stash items | `stash.open()` |

Newer APIs are feature-detected. When a partner is older, the panel shows what it showed before (for example, profession levels then need Skill Trees to list the professions).

APIs that would make the panels fuller (to request from the owning modules):
- Locations: the party's current or recent location.
- Headquarters: hirelings stay GM-private in Headquarters, so the panel says so instead of listing them.

## Strain bar (0.18.0)
Under hit points (with hit dice, rests and exhaustion), from Ashen Gate | Cinders' `api.strain.get(actor)` (contract `ag-strain/1`): a bar that fills to 10 and then reads e.g. **13 / 10+** with a **+3 over** badge, the band name and the Backfire chance on a Push from there. The bar turns red past 10, and the tooltip says when every use of a Cinder power backfires.
- Players see it read-only; their Strain changes only through allowed actions (a Push). 0.30.0: for players it is a compact pill in the HP block, beside hit dice and exhaustion (small bar, value, band; hover for the Backfire chance).
- The GM gets **−** and **+** (one step each), in the row under hit points as before. Cinders records each with the reason "GM adjustment (Character Hub)".
- Hidden with the Hub's own **Strain bar** toggle in Player visibility. Cinders' Player Access hides the Cinders panel, not the bar.
- No Cinders module, or Cinders refuses, means no bar. Nothing is stored in the Hub.

## Saved data
- `flags.ashen-gate-character-hub.slot` on an Item, when the owner moves or swaps it to another equipment slot. It changes only where the item shows.
- `flags.ashen-gate-character-hub.companions` on a character: the ordered companion list `[{id, kind: 'mount'|'pet', itemId, perkItemIds}]`. The Items themselves are ordinary Items on the character.
- World setting `playerVisibility` (`{partKey: boolean}`, default `{}` = everything shown), GM only. See Player visibility.
- World settings `petCap` (default 0) and `petCapOverrides` (`{actorId: number | 'none' | 'unlimited'}`), GM only.
- Client setting `compactOpacity` (60-100, default 100): Compact-only window background opacity (experimental).
- Client setting `compactMode` (default false): this user's Compact / Full choice (0.29.0), used when a Hub opens. The old `windowOpacity` client setting (0.10.0-0.28.x) is no longer registered or read.

## Companions
One mount per character; pets up to the GM's limit (world default 0, so no pets until the GM raises it; per-character override). A world that already saved a limit keeps it. Limits are checked in the add function itself, not just the UI, and lowering a limit never removes pets. Perk Items attached to a companion only display their own text: the Hub does not apply bonuses or Active Effects.

**Drops (0.25.0)** follow the shared item-drop standard (`scripts/ag-item-drop.mjs`, `docs/item-drop-standard.md`). An Item from the sidebar, a compendium or another sheet is copied onto the character (the source never changes), and a container brings its contents. Mount and pet slots still take a world Actor. A folder ("Drop items one at a time."), something that isn't an Item ("Drop an item.") or an item that no longer exists shows a warning. The quick bar reads drops the same way; its rules are unchanged.

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

## Level backups (0.27.0)
Each Hub level-up keeps a GM-only copy of the character as it was before, named `<name> - level X`, in the Actor folder **Ashen Gate / Level backups**. Delete old copies by hand. The copy keeps dnd5e data, items and effects; its live Ashen Gate flag scopes are removed (all `ashen-gate-*` except `ashen-gate-manager` source ids) so it is never a second bearer or progression. Cinder instance records stay in Cinders and are not touched. The removed flags are kept (0.28.0 Restore uses them):

```
flags['ashen-gate-character-hub'].levelBackup = {
  sourceId,        // the character's Actor id
  sourceName,      // its name at the time
  levelBefore,     // character level before the level-up
  classesBefore,   // [{id, name, identifier, levels}] before the level-up
  date,            // YYYY-MM-DD
  opId, by,        // request id (one copy per id) and the user who levelled
  archivedFlags: {
    actor:       {scope: flags},                     // the Actor's removed scopes
    items:       {itemId: {scope: flags}},           // each item's removed scopes
    effects:     {effectId: {scope: flags}},         // the Actor's effects
    itemEffects: {itemId: {effectId: {scope: flags}}} // effects on items
  }                // each key present only when something was removed; ids are the copy's (= the source's) ids
}
```
To restore, put each archived scope back on the document its id names and remove `levelBackup`.

### Restore (0.28.0, GM only)
**Restore backup…** under the character's name (GM only; in the header before 0.33.0; shown when the character has copies; on a copy itself it reads **Restore this backup…**) picks a copy, newest first, then asks in a red confirmation that says what will happen. Restore:
1. saves the character as it is now as another copy, `<name> - level X` by the same rule (`levelBackup.reason = 'restore'`); if that fails nothing changes;
2. replaces the character's `system` (class levels come with the class items; HP, abilities, everything dnd5e keeps), items, effects and flags with the copy's, with `archivedFlags` put back on each document;
3. keeps the character's id, name, portrait, ownership, prototype token, folder, `core` flags (sheet choice), its Journey (the Journey does not revert) and any queued level backups;
4. with Ashen Gate | Cinders 0.7.0+, calls `api.cinder.rehook(actor)` so the character is re-linked to the Cinders the Cinder records say it bears (the records are the truth; the copy's old links are not used). Older Cinders: the restore happens and warns to run Cinders → Manage → Check. The safety copy is inert and has a new id, so it never holds a bearer link;
5. is all or nothing: if a step fails (the Cinders re-link included), the character is put back as it was just before and re-linked again (the safety copy stays).

Items and effects on both sides are replaced in place by id; the rest are created with their ids or deleted. The live character records `flags['ashen-gate-character-hub'].levelRestore = {opId, backupId, backupName, levelBefore, levelAfter, safetyId, date, by}`; the same opId again does nothing. The copy is not changed. Players are refused in the data layer (`api.levelBackups.restore`), not only by the hidden button. There is no cleanup tool: delete old copies by hand.

API: `api.levelBackups.list(actor)` (copies' ids, names and markers, newest first) and `api.levelBackups.restore(backupActor, {opId})`.
