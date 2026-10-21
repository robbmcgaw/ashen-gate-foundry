## 0.10.0 — 2026-10-21

Sheet polish from Robb's alpha feedback (part 1):
- **See-through window:** the opacity slider now fades the whole Hub window background, not only the character pane. Text and controls stay solid.
- **Fold sections:** every section heading (Overview, Combat, Inventory, Magic, Features, Companions, GM Setup cards) and each inventory container folds open/closed. Remembered per user on this computer (new client setting `collapsedSections`); a missing value just means everything is open.
- **Overview:** skills on the left, saves / passives & senses / proficiencies on the right, striped rows and a column header for skills.
- **Right-click to configure:** AC, initiative, speed, HP, hit dice, death saves, abilities, skills, saves, senses and proficiencies open dnd5e's own configuration window (same as the standard sheet). Owner or GM only, like the standard sheet; the Hub stores nothing.
- **HP block:** the HP / Temp / Max adj. boxes are gone. The bar reads "X / X HP" with "(+X TEMP)" and a yellow overshield for temp HP, a blue overlay for a max HP adjustment above normal max, and a sickly-green "lost" part with "(−X MAX)" for a negative max adjustment. Double-click the bar to set current, temp and max adjustment; right-click for dnd5e's Hit Points settings. Damage/Heal is now − / amount / + (damage still uses temp HP first). Hit dice, rests and exhaustion sit right under the bar.
- **Paper doll:** a Bracers slot where the old Other slot was, two more trinket slots (three in all), icons for empty slots where one fits. All empty-slot placeholders are one table, `SLOT_PLACEHOLDERS` in `scripts/constants.mjs`: each slot is a Font Awesome class, a Foundry image path (e.g. `icons/equipment/...`) or a short word, so changing one is a one-line edit. **Other equipped** is now a folding list under the rings and trinkets with every equipped item not in a slot (click opens, right-click unequips, ⋯ for the menu). Items named bracers/bracelet/vambrace now go to the Bracers slot instead of Hands. Still display only, no slot limits.
- **Rarity colours:** equipped items get a border by dnd5e rarity: common white, uncommon green, rare blue, very rare purple, legendary orange, artifact red (CSS variables `--ag-rarity-common` … `--ag-rarity-artifact`, on the Hub window).
- **Speed:** reads dnd5e 6's `movement.speeds` (jump included) and shows hover; right-click opens dnd5e's movement settings (walk, burrow, climb, fly, jump, swim, hover, units).
- **Ashen Gate quick bar** under the section rail: Professions, Skill Trees, Renown, Quests (show that module's view in the Ashen Gate tab) and Headquarters, Locations (open the module's own window). Players only get buttons for parts shown to them; the GM sees missing modules greyed.
- **Art of any shape:** player art that is very wide or very tall is never stretched. Slot, item, condition, companion and portrait images crop to fill their box with the focus at the top (faces stay in view); the paper-doll art pane (Portrait / Token art) shows the whole image over a blurred fill.
- Saved data: one new client setting (`collapsedSections`). Equipment slot choices made with "Move to…" are unchanged. No migration needed.

## 0.9.0 — 2026-10-20

- **Player visibility** (GM Setup): a switch per Hub part so the GM can bring systems in one at a time: Overview, Combat, Inventory character items, Party stash, Magic, Features, Rest buttons, Equipment slots, Companions, and each Ashen Gate sub-tab (Professions, Perks, Renown including Pantheon, Quests, Locations, Base). **Everything** and **Core only** buttons just set the switches. Default: all on, so nothing changes until you turn something off.
- **Players no longer see empty "hidden" placeholders.** A part that is off, or whose module is not active or has its own Player Access off, is removed for players (the tab or sub-tab disappears). The GM still sees it with a badge saying why, e.g. "Hidden from players: Renown Player Access is off". Partner state is read only through each module's public `api.playerAccess.getState()` (and Utilities' `api.stash.isEnabled()` for the party stash).
- **Enforced:** while a part is hidden, players' Hub actions for it are refused in the action layer too (companion changes, equipment slot overrides and swaps, rests, moves to the party stash).
- **Live:** open Hub sheets re-draw when the GM changes a switch or a module's Player Access.
- API: `api.playerVisibility` (`parts`, `presets`, `get`, `isShown`, `canSee`, `hiddenReason`, GM-only `set` and `applyPreset`).
- Saved data: one new world setting `playerVisibility` (`{partKey: boolean}`, default `{}` = everything shown). Nothing else changes; no migration needed.

## 0.8.1 — 2026-10-20

- **Pets start at 0.** The shipped world default pet limit is now 0: characters have no pet slots until the GM raises the world default (Settings or GM Setup) or a character's own limit. One mount is still always allowed. A world that already saved a limit keeps it; a world that never changed it now reads 0, and any pets already listed stay (shown as over the limit, never removed).
- The Companions tab says "No pet slots yet" when a character's limit is 0.
- API hook for a later companion skill tree: `registerPetSlotSource(id, fn)` adds extra slots on top of the GM's limit. Nothing uses it yet.
- No saved data changes.

## 0.8.0 — 2026-10-20

- **Every Ashen Gate section now shows its module's own view** once that module is updated: Perks (Skill Trees 0.14.0: Unlock works here), Renown (0.10.0: party and character standing), Quests (Quest Log 0.8.0: Track and Character notes), Locations (1.13.0: journey and revealed places), Base (Headquarters 0.10.0: this character's facilities). Professions (Ledger 0.19.0) and the Party stash (Utilities 0.12.0) already did. Each module keeps its own records and permissions; an older module still shows the summary with an Open button.
- "Factions & Renown" is now **Renown** in the Hub (the module was renamed; its id is unchanged). The sub-tab is Renown.
- An embedded view no longer sits inside a second card frame.
- No saved data changes.

## 0.7.0 — 2026-10-20

From Robb's 0.6.0 test:
- **Tabs are an icon rail down the right edge** (hover for the name; the current section's name heads the middle pane). Rest is no longer a tab: Short and Long Rest are the cup and tent buttons beside Hit Dice on the left. Under about 900 px wide the rail sits above the content.
- **Equipment slots:** click opens the item sheet; right-click unequips it. The small ⋯ on a filled slot opens its menu (Use, Unequip, Attune, Swap, Move to party stash, Move to…). Click an empty slot to equip a carried item that fits. Attuned items still glow; attunement prompts are unchanged.
- **Party stash:** Inventory → Party stash now shows the Utilities stash itself (Utilities 0.12.0+): search, Take into this character (with the party vote when the GM has it on), coin Deposit/Take, drop items in. Character items have a carry-box button (and the slot menu has an entry) to move an item into the stash through Utilities' own deposit. Older Utilities: the read-only list as before.
- **Conditions:** a small box on the left lists only active conditions (click to remove); + shows the others inline to add one. No menu.
- **See-through window:** a slider in the header fades the window background (100 % to 20 %) so the map shows through; text, slots and controls stay solid. Saved per user on this computer (client setting `windowOpacity`, default opaque). The CSS uses `--ag-window-opacity`, so other Ashen Gate windows can adopt the same name later.
- **Professions** (Ashen Gate tab) shows the Profession Ledger's own Individual panel when the Ledger offers it (0.19.0+): Learn, Craft and perk choices work there with the Ledger's own permissions. Other sections switch to their module's own view automatically once that module offers one.
- Item names in slot tooltips are plain text (browser tooltip), never HTML.
- Saved data: one new client setting (`windowOpacity`). Nothing else changes.

## 0.6.0 — 2026-10-20

- **New layout, like a game character screen.** The character is on the left (about 37% of the window); everything else is in tabs on the right, and only the tab content scrolls. The window opens at 1200 × 800 and is resizable; below about 900 px wide the character stacks above the tabs.
- **Left side:** name and inspiration star; the portrait with **AC** on a shield; equipment slots around it (head, neck, back, body, hands on the left; main hand, off hand, waist, feet, other on the right; ring, ring, trinket underneath); Initiative (click to roll), Speed, Proficiency; an HP bar with HP, Temp, Max adj. and Damage/Heal; six ability tiles (click for a check, the Save line for a save); hit dice, exhaustion, resources and active conditions as small icons. The heart button lists every condition to turn on or off.
- **Equipment slots** are small icons. Hover shows the item name; a glow and ✦ mean attuned; empty slots are faint outlines. Click or right-click a slot for a small menu: Open item, Use, Unequip, Attune/Unattune, **Swap** (main hand ↔ off hand, ring ↔ ring), Move to…. An empty slot lists carried items that fit (**Equip…**). **Other** holds equipped items that fit no slot. Attunement prompts are unchanged. Slots are still display only.
- **Tabs:** Overview (skills, saving throws, passives, senses, proficiencies), Combat, Inventory, Magic, Features, Ashen Gate, Companions, Rest, GM Setup (GM only).
- **Inventory:** a search box and a **Character / Party stash** toggle. Party stash shows the Utilities purse and every stash item you may see, with Open party stash.
- **Ashen Gate:** one sub-tab per module (Professions, Perks, Standing, Quests, Locations, Base) instead of one long page. Same read-only summaries and Open buttons as 0.5.0. Embedded module views come in later releases.
- New saved data: none. Swap and Move to… use the existing `flags.ashen-gate-character-hub.slot` item flag.

## 0.5.0 — 2026-10-20

- **Ashen Gate tab uses the new partner read APIs when they are installed.** It falls back to the 0.4.0 behaviour when a partner is older.
  - Profession Ledger (0.18.0+, `getProfessions`): every profession the character has, with level, XP and XP to the next level. Skill Trees is no longer needed for this.
  - Skill Trees (0.13.0+, `pointsSummary`): points to spend and points spent per tree, profession trees included.
  - Headquarters (0.9.0+, `playerView`): Guildhall name and rank and the facilities this character may see. Hirelings are GM-private in Headquarters, so the panel says so.
  - Utilities (0.11.0+, `stash.listItems`): the first 8 party stash items under the purse.
- Read-only, same as before: no saved data, no writes to partner modules. A partner that refuses (permissions, Player Access) still shows "Not available to you right now".

## 0.4.0 — 2026-10-20

- New **Companions** tab (mounts and pets). A companion is an Item on the character: drop one from the sidebar or a compendium (a copy is added to the character), or pick one of the character's items. Each shows its art, name and description, with **Perks** under it: drop or pick perk Items to attach. Reorder pets with the arrows. Remove takes it off the list and keeps the Item.
- One mount per character. Pets up to a limit: the world default is **2** (Module Settings → *Character Hub: pets per character*), and the GM can set a per-character limit (No pets, Unlimited or a number) in the Companions tab or in the new GM-only **GM Setup** tab, which lists every character's mount, pets and limit. The limit is checked when adding; lowering it never removes pets.
- Perk Items only show their own text. The Hub does not apply or transfer bonuses or Active Effects.
- New saved data, additive only: `flags.ashen-gate-character-hub.companions` on the character Actor (ordered `{id, kind, itemId, perkItemIds}`), and two world settings (`petCap`, `petCapOverrides`) that only the GM can change. No migration needed.
- API: `companions(actor)` (read only) and `petCapFor(actor)`.

## 0.3.0 — 2026-10-20

- New **Ashen Gate** tab with one panel per Ashen Gate module. Each panel reads only that module's public API, has an **Open** button that deep-links to the character or record, and shows "Not installed" or "Unavailable" instead of breaking when the module is missing, hidden or fails.
  - Profession Ledger: this character's professions (level, XP, perks to choose) and number of known recipes.
  - Skill Trees: perks owned per tree, and points awarded on non-profession trees.
  - Factions & Renown: revealed factions with party standing and this character's standing (from your own player view).
  - Quest Log: active party quests and this character's personal quests, tracked first, with open objectives. Click one to open it.
  - Locations: revealed locations (click to open).
  - Headquarters: Open button only (no player-safe read API yet).
  - Utilities: party purse totals and an Open party stash button.
- The Hub refreshes when the Profession Ledger reports a progression change.
- No saved-data changes. Nothing from other modules is copied or stored.

## 0.2.0 — 2026-10-20

- **Combat** tab: initiative roll, death save at 0 HP, weapons (equipped first) and other usable items/features grouped as Actions, Bonus Actions, Reactions and Other. **Use** calls dnd5e's `item.use()`, so its usage dialog, attacks, damage and resource use apply.
- **Inventory** tab: items by category with container contents nested. Quantity −/+ or typed, Equip/Unequip, Attune/Unattune, Use for consumables, currency edit, and the item name opens its sheet. Shows an "Attuned 2 / 3" count and an Attuned badge.
- **Equipment** paper doll at the top of Inventory: the portrait (or token art) with boxes for head, neck, back, body armor, main hand, off hand, hands, waist, feet, two rings and trinket, plus an "Other equipped" strip. Armor, shields, weapons and rings are placed from their dnd5e type; other wearables are placed by name or by the owner ("Move to…", saved as an item flag). An empty box offers "Equip…" with the carried items that fit. **Display only**: nothing limits what can be worn.
- **Attunement when equipping** an item that requires it: with a free slot it asks *Attune and equip / Equip without attuning / Cancel*; at the limit it explains, lists your attuned items with an *Unattune* button each, and still offers *Equip without attuning*. Unequipping never changes attunement. Optional-attunement items do not ask.
- **Magic** tab: spells by level with slots left (and Pact Magic), **Cast** via `item.use()`, Prepare toggle where dnd5e allows it ("Always" shown for always-prepared).
- **Features** tab: class, species and background, and features by type, with Use where they have activities.
- **Rest** tab: Short Rest and Long Rest open dnd5e's own rest dialogs.
- Every write checks ownership in the action layer and changes one document per update. Observers can still open item sheets to read them.
- Saved data: only the optional `flags.ashen-gate-character-hub.slot` on an Item when the owner moves it on the paper doll. Nothing else is stored.

## 0.1.0 — 2026-10-20

- New module, **alpha**. Registers *Ashen Gate Character Hub* as an alternative sheet for dnd5e characters (not the default: choose it from the sheet menu per character).
- Shared header: portrait, name, species, class/subclass and level, HP with Damage/Heal and direct edit, AC, initiative roll, speed, proficiency, inspiration, exhaustion, hit dice, resources and condition toggles.
- **Character** tab: abilities with check and save rolls, skills with proficiency markers and rolls. All rolls use dnd5e's own roll methods and dialogs.
- **Open native sheet** always opens the standard dnd5e character sheet.
- Owners edit and roll; observers view only (refused in the action layer too); limited viewers see portrait and name.
- No saved data of its own. Everything reads and writes the real Actor.
