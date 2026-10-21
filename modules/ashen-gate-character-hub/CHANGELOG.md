## 0.28.1 — 2026-10-21

- **Fix: blank cloak, waist and bracers slots.** Their silhouettes were drawn from a relative path inside an inline CSS variable, which the browser resolved under the module's `styles/` folder and 404'd. Every image and silhouette placeholder now goes through Foundry's `foundry.utils.getRoute` (leading slash, route prefix and The Forge handled), so all empty-slot art loads. Paths in the `SLOT_PLACEHOLDERS` table are written the same way as before.
- **Fix: Speed with walk 0.** The Speed tile always shows the walk speed, 0 included (`0 ft`); before, a character with walk 0 showed dnd5e 6's derived jump speed there with no label. Other speeds (jump included) are listed under it with their labels, as before. With no walk value at all the tile shows `—`. Characters with a walk speed look exactly as before.
- No migration.

## 0.28.0 — 2026-10-21

- **Restore a level backup (GM only).** **Restore backup** in the Hub header (shown to the GM when the character has level backups; on a backup copy it reads **Restore this backup**). Pick a copy (newest first), then a red confirmation says exactly what happens. Players never see it, and the restore itself refuses anyone but a GM.
  - First the character as it is now is saved as another copy, `<name> - level X` in Ashen Gate / Level backups, so nothing is lost. If that copy can't be made, nothing changes.
  - Then the copy's class levels, HP, abilities and the rest of the dnd5e data, its items and effects, and the Ashen Gate flags the copy kept aside (`archivedFlags`) are put back onto the character. Its id, name, portrait, owners, token, folder, sheet choice, **Journey** (it does not revert) and any queued backups stay.
  - **Cinders:** the Cinder records stay the truth. With Ashen Gate | Cinders 0.7.0 the restored character is re-linked to the Cinders the records say it bears (bearer links, Cinder tree progress, socket markers) through Cinders' `api.cinder.rehook`, as part of the all-or-nothing restore. The safety copy never holds a bearer link. With an older Cinders the restore still happens and says to run Cinders → Manage → Check; without Cinders nothing is called.
  - All or nothing: if a step fails, the character is put back as it was and the GM is told. Each restore has an opId (recorded as `levelRestore` on the character); repeating it does nothing. The backup copy is not changed. No cleanup tool: delete old copies by hand.
  - API: `api.levelBackups.list(actor)` and `api.levelBackups.restore(backup, {opId})` (GM only).
- **Mastery & marks:** four more standard dnd5e spell marks, same tracking-only labels as Hunter's Mark: **Bless** (Blessed), **Searing Smite**, **Wrathful Smite**, **Shining Smite** (also from a spell with identifier `branding-smite`). They appear when the character has the spell.
- **Strain in the marks bar:** with Ashen Gate | Cinders active, the character's own Strain shows read-only at the end of the row (value and band; hover for the Push Backfire chance). Nothing shows without Cinders, or when the GM hides the Strain bar from players.
- No migration: existing backups, marks and flags read unchanged.

## 0.27.0 — 2026-10-21

- **Level up button** in the header, next to Open native sheet. It starts dnd5e's own level-up and adds no rules. A dialog lists each class to advance (dnd5e's advancement window, or just the new level when there is nothing to choose) and **Add a class**, which opens dnd5e's own class browser (classes the character has are left out) and its advancement. dnd5e 6.0.6 does not check multiclass ability-score prerequisites, and neither does the Hub.
- **Who:** the GM always. A player who owns the character any time in a milestone world (dnd5e levelling "No XP"); in an XP world once the XP reaches dnd5e's next-level amount. Never past level 20. When it isn't ready it looks greyed and clicking it says why.
- **Level backups:** after a level-up succeeds, a copy of the character as it was before is made, named `<name> - level X` (X = the level before; ` (2)` if the name is taken), in the Actor folder **Ashen Gate / Level backups**, GM-only. Cancelling dnd5e's window makes no copy. A player's copy is made by the GM's client; with no GM connected it waits on the character and is made when a GM is next on. Copies keep dnd5e data, items and effects but carry no Ashen Gate state (Cinders, Strain, Skill Trees, Ledger, Renown, Quest Log, Locations, Utilities, HQ and Hub flags are removed; Manager source ids are kept), are marked `flags.ashen-gate-character-hub.levelBackup` = {sourceId, sourceName, levelBefore, classesBefore, date, opId, by, archivedFlags}, and are ignored by the Journey. The removed flags are not lost: `archivedFlags` keeps them per document so a restore can be built later (shape in the README). Cinder instance records are never touched. Old copies are deleted by hand.
- Nothing extra is recorded: the Journey records the new level once, as before. The Hub layout is otherwise unchanged; no migration needed.

## 0.26.0 — 2026-10-21

- **Undo after clearing a quick-bar slot.** Right-clicking a quick slot still clears it, and now a short notice shows over the top-right of the sheet for about 5 seconds: "Cleared slot N: <item>" with an **Undo** button. Undo puts that slot back exactly as it was. When the notice goes away, the clear stands.
- Two clears in a row give two notices; each Undo restores its own slot. Clearing the same slot twice quickly shows one notice.
- Undo does nothing, and says so, if the item or macro was deleted meanwhile or something else was put in that slot. Other slots changed meanwhile are kept. Closing the sheet drops pending undos (the clears stand). Undo is checked in the data layer like any quick-bar change.
- The Hub layout is unchanged (the notice floats over the content). No saved-data change: the quick bar is stored where it was.

## 0.25.0 — 2026-10-21

- **Journey shows item rewards.** `api.journey.recordReward` (GM only) now also takes `items` (up to 50 of name, picture, quantity and permanent item id) and a `grantId`. The entry reads `Reward for "<quest>": 2 × Healing Draught, Rusted Blade` (coins added as before), with small item pictures after the text; hover shows the name and quantity. No ids are shown. There is no separate Rewards panel (D12).
- **One entry per grant:** with a `grantId` the entry id is `reward-<questId>-<grantId>`, so a second grant or Grant again adds its own entry and re-firing the same grant adds nothing. The old call (no items, no `grantId`) gives the same entry and text as before.
- **Companion drops use the shared item-drop standard** (`ag-item-drop/1`, copied from Quest Log). Dropping a folder, a non-item or a missing item now shows a warning instead of a vague message. A dropped container brings its contents. Mount and pet slots still take Actors; the quick bar reads drops the same way with unchanged rules.
- No migration: existing Journey entries and companion data read unchanged. New reward entries may carry `data.items` and `data.grantId`. Hidden entries still stay in the GM-only store.

## 0.24.0 — 2026-10-21

- **Cinders sub-tab: a compact Cinder orb** (Cinders 0.6.0's look, smaller). Each Cinder is a card: a mini orb on the left, ringed by the bearer's Strain (10 segments, then a pip per point over), with a dot for each socket; on the right the Push lines (cost, Strain after, Backfire %; the Push button is red when the Backfire is guaranteed) and the socket rows. In a narrow window the orb sits above the lines. The Hub layout (art and slots, content, icon rail) is unchanged.
- **Orb art:** the Cinder's own image when the GM set one in Cinders, else the default orb whose colour follows Strain only. The Hub can't change art.
- **Socket rows with Attach / Swap / Detach**, through Cinders' `api.sockets` (`canAttach`, `attach`, `swap`, `detach`). Who can: the bearer's owner while Cinders' Player Access is on and the GM has not locked the Cinder; the GM always. Detach asks first. A locked Cinder shows a **Locked** badge and no buttons for players.
  - Drag an item onto a socket row: an empty socket attaches it, a full one swaps it in. The GM can also drop an Item from the Items sidebar (Cinders copies it to the bearer).
  - **Items that fit:** this character's items that fit a socket, as chips to drag. Hidden when the player can't change the sockets.
  - A socket added by a perk, power or item shows **+1**. An item over capacity is dimmed with **inactive** (Detach still works).
  - The "change sockets in the Cinders window" note is gone.
- Works with an older Cinders: no art field means the default orb; without `ag-sockets/1` the card shows the orb and Push lines without socket rows.
- Internal: the last raw px box in the Hub CSS (card icon column) now uses a kit token, so the Hub has no UI-lint exception left.
- No saved data, flag or setting changes; the Hub stores nothing for Cinders.

## 0.23.0 — 2026-10-21

- Shared UI kit 2.1.0 and dialog helper: choice dialogs follow the Ashen Gate look (Cancel on the left, the choices on the right); red buttons, badges and grey text on selected or striped rows are easier to read in every skin (at least 4.5:1); a hidden empty state stays hidden; disabled list rows keep readable text.
- Equipping an item that needs attunement asks in the shared choice dialog: same choices in the same order, Cancel on the left changes nothing.
- Internal: the sheet window class is now `agch-app` (was `ag-character-hub`) and screen-reader labels use the kit helper. Same look.
- No saved-data changes.

## 0.22.0 — 2026-10-21

- Sheet takes the Ashen Gate UI standard look (same layout): rounded controls, round slots, labelled confirmations, Foundry tooltips, Comfortable size supported. HP bar turns green, yellow or red with health; temp HP is now a silver striped shield, and temp HP and max-HP changes always show together.
  - **HP bar:** green at 70% of effective max HP and up, yellow from 30%, red below. A raised max is a blue frame with new "(+X MAX)" text, drawn above temp HP; a lowered max is a dark green cross-hatch. Temp HP never runs into the lowered-max part, and its text always shows the full amount. Editing (double-click, right-click, damage/heal) is unchanged.
  - **Same layout:** art with the slots around it, content in the middle, icon rail on the right. Slots and the quick bar are kit circles with rarity rings.
  - **Header:** "Ashen Gate | Character Hub", then opacity, Open native sheet, version and Help.
  - **Icon rail:** every button names itself in a Foundry tooltip. All hover text in the sheet is now a Foundry tooltip.
  - **Dialogs:** Push asks "Push [power]?" with Cancel / Push; removing a companion now asks first ("Remove companion?"); deleting a Journey note uses the same red confirmation; Help is a dialog with Close.
  - **Kit parts:** sub-tabs are segmented controls, search boxes, filter chips, badges, empty states, Strain as a slim meter with its number beside it, Cinder powers and sockets as rows, the GM companion table, Journey rows. Death save is a plain roll button with a d20.
  - **Window size:** opens 1.2× larger when General Manager → My Appearance → Size is Comfortable.
- No saved data, flag or setting changes.

## 0.21.0 — 2026-10-21

- Shared UI kit 2.0.0: rounded compact look for shared parts, Comfortable size option (General Manager → My Appearance), shared dialog helper.

## 0.20.1 — 2026-10-21

- **Journey fix:** when a character went up several levels at once, the entries could come out in the wrong order if the clock ticked a millisecond between them. This also made a Journey test fail now and then on a busy machine. Each batch of automatic entries (level-ups, Renown ranks, completed quests) now shares one time, so the order is always the same: the highest level first. A new test makes the clock tick on every call to prove it.
- No saved data changes.

## 0.20.0 — 2026-10-21

- **Journey (new, alpha):** a per-character log of accomplishments in a new **Journey (alpha)** tab, newest first, recorded from now on (no back-fill).
  - **Automatic entries:**
    - level-ups (dnd5e character level);
    - Renown tier changes: the character's personal rank, the party's rank and deity ranks, through Renown's public API as the owning player sees it;
    - quests completed, through Quest Log's GM API: personal quests for their character, party quests for every player character.
  - **Currency** is only ever logged when a quest awards it. Quest Log doesn't award any itself yet, so a GM-only `api.journey.recordReward()` is ready for the rewards build.
  - **No duplicates:** every automatic entry has a stable id per event.
  - **Who sees what:**
    - Players see their own characters' visible entries.
    - The GM sees every character's journey and can add notes (text, optional date), edit, hide/show and delete GM notes.
    - All GM actions are refused for players in the data layer.
    - Hidden entries are moved to a GM-only journal, so players never receive them with their Actor.
- **Player visibility:** a new "Journey (alpha)" part (on by default) in GM Setup.
- **Saved data (new, additive; no migration):**
  - Actor flag `journey`;
  - a GM-only JournalEntry "Ashen Gate Hub • Journey (GM only)", created when the GM first hides an entry;
  - world setting `journeyQuestSeen`.
## 0.19.0 — 2026-10-21

- **Cinder sockets in the Cinders sub-tab (read only).** Under each Cinder the Hub shows its sockets from Ashen Gate | Cinders 0.3.0+ (`api.sockets.hosts`, contract `ag-sockets/1`):
  - how many are in use out of how many;
  - each attached item, with its modifiers in plain words (e.g. "Push cost −1");
  - items marked "inactive: over capacity" when the Cinder has fewer sockets than items;
  - empty sockets;
  - "locked by the GM" when the GM has locked them.
- Attaching, detaching and swapping stay in the Cinders window: the Hub has no socket buttons and stores nothing.
- Redraws when sockets change (`ashenGateSockets.changed`).
- With an older Cinders, or when Cinders refuses (Player Access hidden, not the owner), the panel shows as before, without sockets.
- No saved data changes; no migration.

## 0.18.1 — 2026-10-21

- **Electrum follows Utilities' "Use electrum"** (Utilities 0.13.2+, GM Setup; default off). The Hub reads it through Utilities' public `api.currency.electrumEnabled()` and redraws on its `ashen-gate-utilities.electrumChanged` hook.
  - **Inventory coin boxes:** while electrum is off, the ep box is gone (pp, gp, sp, cp only). If a character still has electrum it isn't hidden: the ep box shows dimmed with a note, and the GM converts it in Utilities (the Hub has no convert action).
  - **Coin changes:** while electrum is off, the Hub can lower a character's electrum but not add any. This is checked in the action itself.
  - **Party purse summary** (shown when Utilities has no stash view): ep is left out while off. Any leftover ep shows as a short note.
  - Utilities' own embedded stash view already follows its setting.
  - Without Utilities, or with an older one, everything works as before.
- No saved data changes.

## 0.18.0 — 2026-10-21

- **Strain bar** under hit points, next to hit dice, rests and exhaustion, from Ashen Gate | Cinders (`api.strain`). It fills to 10, then reads e.g. **13 / 10+** with a **+3 over** badge and turns red. It shows the band name and the Backfire chance on a Push from there. Players see it read-only; the GM gets − / + (each recorded by Cinders with a reason). A new Player visibility toggle, **Strain bar**, hides it from players.
- **Cinders** sub-tab in Ashen Gate (and on the quick bar). It shows the character's Cinders, unlocked powers and their Push modes with Strain cost and Backfire chance, plus perks. **Push** asks for confirmation with Cinders' own preview, then pushes; a player's Push is rolled and recorded by the GM client. **Open Cinders** opens its window at this character. Hidden from players with the **Ashen Gate: Cinders** toggle or when Cinders' Player Access is off.
- Everything goes through Ashen Gate | Cinders' public API; without that module there is no bar and the panel says "Not installed". The Hub re-draws on Cinders' `ashenGateCinder.changed` hook (Strain changes arrive as Actor updates).
- No saved data changes. The two new visibility toggles start shown.

## 0.17.0 — 2026-10-21

- **New empty-slot icons from Robb:** Back is a cloak, Waist a belt, Bracers a pair of bracers. They're white silhouettes in `assets/slots/`, which ship in the release zip, and `SLOT_PLACEHOLDERS` points to them by module path (`modules/ashen-gate-character-hub/assets/slots/…`).
- White silhouettes (files named `*-white.png`) are drawn as a mask in the theme's muted colour, the same size and faintness as the other slot icons. They stay visible on light skins too, instead of white on white.
- No saved data changes.

## 0.16.0 — 2026-10-21

- **Change the art from the Hub:** double-click the big art pane to change what it shows.
  - With Portrait shown it changes the character's portrait (`img`). With Token art shown it changes the prototype token's image (`prototypeToken.texture.src`).
  - It uses Foundry's own file picker the way the standard sheet does: it starts at the current image, falls back to the default artwork, and is The Forge's Assets Library picker on The Forge. Token art may be an image or a video, as on the dnd5e sheet.
  - A token set to random images opens its Prototype Token settings instead, as the dnd5e sheet does.
  - Cancelling, or picking the same file, changes nothing.
- **Permissions:** owner or GM only, checked in the action itself. Others get no hint, no pointer cursor and no picker.
- The Portrait / Token art button and the AC shield keep their own clicks. New art still never stretches.
- No saved data changes.

## 0.15.0 — 2026-10-21

- **Item tooltips:** hovering an item shows dnd5e's own rich tooltip, the same one the standard sheet shows (name, rarity, description, properties, uses). It works on:
  - the rows in Combat, Inventory, Magic and Features;
  - paper doll slots and Other equipped;
  - the class/species/background card;
  - the quick bar, and mastery & mark buttons (the weapon or spell they come from);
  - companion gear, perk rows and pet clothing.
  The Hub uses dnd5e's own tooltip markup (a loading section with the item's UUID, which dnd5e's tooltip handler fills in), so dnd5e decides what each user sees, e.g. unidentified items, and GM-only price and uses. Without dnd5e's tooltips the plain hover text stays.
- **Inventory banner** (display only, in a fantasy serif: dnd5e's Modesto Condensed or Foundry's Amiri, else Georgia):
  - If the character owns any item with "diamond" in its name, including items inside containers, any case (e.g. "Diamond Dust"), it reads "Your soul may be returned" in muted gold.
  - Otherwise it reads "You do not possess a resurrection diamond" in red.
  - The texts are constants in `scripts/constants.mjs`. Nothing is stored or automated.
- **Item icons in lists** (Combat, Inventory, Magic, Features, companion gear; Other equipped at 24 px) are now a fixed 32 px square that never shrinks or stretches. They show the whole icon (`object-fit: contain`, so nothing is cut off at the edges). In a narrow window the name and description column shrinks, never the icon. Portraits, slot art and the doll pane keep their own rules.
- No saved data changes.

## 0.14.0 — 2026-10-21

From Robb's feedback:
- **Class, species and background** are now one small card at the top of the character (class, subclass, species, background; click one to open it). They're no longer a group in Features, and the subtitle under the name just shows the level.
- **Features:** Favourites is the first group in the list.
- **Hit dice and exhaustion** are tidied into one line under the HP bar:
  - Hit dice: a d20 icon with dice left, plus the rest buttons.
  - Exhaustion: a skull icon (red when above 0) with − level +.
- **Combat:** the damage column is now **DMG/HEAL** (dnd5e's damage labels include healing).
- **Favourite star:** it has its own fixed column before the item image in every list tab, and never overlaps the image. Combat and Inventory rows get the star too (dnd5e's own favourites).
- **Magic:**
  - Group by spell level, school, **prepared**, **ritual** or **action type** (Action, Bonus Action, Reaction first, then dnd5e's other activation types).
  - Sort by name, level, school, prepared first, **ritual first** or **action type**.
  - The spell-slot buttons at the top (e.g. "Level 1 0 / 4") are clickable: one shows only that level; click again for all.
  - Toggles: **Prepared only**, **Ritual only**, **Castable only**. A spell counts as castable when it's a cantrip, or it's prepared (or its method needs no preparing) and the character has a dnd5e spell slot of its level or higher left (pact slots count). A spell that doesn't use slots needs uses left.
- **Features:**
  - Group by feature type, **action type**, **source** (the class, species or other item that granted it, from dnd5e's advancement origin) or **uses**.
  - Sort by name, type, has-uses first or **action type**.
  - Filters: one button per action type, **Has uses**, **Uses left**.
- Filters are kept while the sheet is open and aren't saved. A Features grouping saved as "Use time" now groups by action type.
- No saved data changes.

## 0.13.0 — 2026-10-21

Combat helpers (part 4 of Robb's alpha feedback). Tracking only: nothing is automated and no rules are worked out by the Hub.
- **Mastery & marks hotbar** (bottom of the Hub, folds away):
  - One button per mark the character may place, from dnd5e data only: each **equipped weapon's own mastery options** (dnd5e 6: the weapon's mastery when the character has mastery of that weapon type, plus bonus masteries), and **spells the character has** from the marks table.
  - A button puts the mark on every **targeted** token, or takes it off again.
  - The bar lists the marks this character has placed in the scene, each with ✕.
- **Marks are real ActiveEffects** on the target's Actor, with a status (`agch-<id>`, so the token shows the icon). They have **no changes**; the description says who placed it and links dnd5e's own rules page for masteries. For a token the player doesn't own, the coordinating GM client makes the change. Before doing so it checks:
  - the requester owns the character;
  - the mark is one that character may place;
  - the GM shows the hotbars to players.
  A GM must be connected for this. The module now declares `"socket": true`.
- **The marks table** is one constant (`MARKS` in `scripts/marks.mjs`), one line per mark:
  - the 8 weapon masteries: Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex;
  - Hunter's Mark, Hex, Bane, Faerie Fire, Guiding Bolt, Vicious Mockery and Ensnaring Strike, matched by dnd5e spell identifier.
- **Quick bar:**
  - 10 free slots per character (saved on the character in `flags.ashen-gate-character-hub.hotbar`).
  - Drag in the character's own weapons, spells, features or items (item rows in the Hub can now be dragged) or a world macro you can use.
  - Click uses it (dnd5e's `item.use()` / the macro); right-click clears the slot.
- **Player visibility:** new part "Hotbars" (on by default). While it is off, players don't see the hotbars and their hotbar and mark actions are refused.
- **Saved data:** one new character flag (`hotbar`), and mark ActiveEffects on target Actors (flag `mark`). No migration needed.

## 0.12.0 — 2026-10-21

Companions (part 3 of Robb's alpha feedback):
- **Mount:** two drop targets.
  - (a) The mount itself: drop a world **Actor** from the Actors sidebar (linked by UUID, never copied or changed) or an Item, as before.
  - (b) **Mount gear and mount perks** onto the mount card.
- **Mount card:** the Actor's art (cropped to fill, never stretched), a **name box** and a **description box** the player can edit, and a **stats box**. The stats box shows what gear and perks give, read only from their own dnd5e data: Active Effect changes and armour value. Plain additions are summed and nothing is applied. When the viewer can see the mount Actor, its own AC, HP and speed show for reference. A warning shows when an effect on a companion item would also apply to the character.
- **Pet card:** art, name box, description box, **three clothing slots** (drop pet clothing on a slot, or pick one; ✕ takes it off), and perks.
- Gear and perk lists use the 0.11.0 card rows (Kind, Gives, Detach).
- **What an item is for:** no new document types. Companion items are ordinary Items, marked by their permanent id prefix (`ITEM-MOUNT-`, `PERK-MOUNT-`, `ITEM-PET-`, `PERK-PET-`) or by `flags.ashen-gate-character-hub.companion.role`. Unmarked items go by type (feature = perk). An item marked for the other kind of companion is refused. See `docs/companion-items-schema.md`, with a synthetic example.
- **Permissions (action layer):**
  - Owner or GM only, and only while the GM shows Companions to players.
  - Linking an Actor needs Observer on it (the GM can link any). Compendium Actors must be imported first.
  - The pet limit from 0.9.0 still applies to Actor and Item pets.
- **Saved data:** companion entries gain `actorUuid`, `name`, `description`, `gearItemIds` and `clothing` (3 slots). Entries saved before 0.12.0 read unchanged with the new fields defaulted, and are written in the new shape on the next change. Reading never changes saved data, so there is no migration step.
- Known limit: Manager 0.36.0 imports Items with `name`, `type`, `img` and `system` only, so effects and flags can't come from a package yet. The GM adds an item's Active Effect in Foundry; re-import leaves it alone.

## 0.11.0 — 2026-10-21

Item lists redesign (part 2 of Robb's alpha feedback):
- **Card rows** in Combat, Inventory, Magic and Features: striped rows with the image, name, a short summary of the description (**More** shows the full text in place, as plain text), a rarity edge using the shared `--ag-rarity-*` colours, and **column headers** for the facts in each list. Facts are dnd5e's own prepared labels and item data: weapons Damage / To hit / Range / Properties; actions Range / Damage / Uses / Recovery; gear Qty / Weight / Value / Uses; spells School / Casting time / Range / Duration (C concentration, R ritual) / Components; features Use time / Uses / Recovery. Narrow windows show each fact with its own label. Every action is kept (Use, Cast, Prepare, Equip/Unequip, Attune, quantity, Move to party stash).
- **Combat:** the Roll initiative button is gone from the tab (initiative is on the left).
- **Search box** on Combat, Magic and Features too (Inventory already had one); the text is kept per tab while the sheet is open, and a group with no match is hidden.
- **Magic:** Group by spell level (with slots), school or none; Sort by name, level, school or prepared first. When not grouped by level, the slots show in a strip at the top.
- **Features:** Group by feature type, use time or none; Sort by name, type or has-uses first.
- **Favourites** (Magic, Features): a star per item uses dnd5e's own character favourites (the standard sheet's Favorites list), so nothing new is stored; starred items also show in a Favourites group at the top. Owner or GM only (refused in the action layer). No star on a dnd5e version without favourites.
- Groups fold as before (0.10.0 fold state; existing fold choices for spell levels and feature types are kept).
- Saved data: one new client setting (`listSort`, group/sort per tab). Favourites are dnd5e's own `system.favorites`. No migration needed.

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
