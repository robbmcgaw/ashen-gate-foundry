## 0.58.0 — 2026-10-26

Features tab: group by origin, and sort by uses remaining.

- **Group → Origin** (Features, Filters): sections for Class and Subclass, Species and Background, Feats, Professions (one section per profession, such as "Professions: Herbalism"), Cinder powers (one per Cinder) and Everything else. Empty sections are not shown. It is the starting Group for a character that has any profession or Cinder feature; everyone else keeps Feature type, and a Group you have picked is kept.
- **Sort → Uses remaining**: features with uses left first (most left first), then spent ones, then features without uses. Name, Type, Action type and Has uses first are as before.
- Origin is read from dnd5e (advancement origin, feature type) and, when active, from the public APIs and flags of Skill Trees (perk grants), the Profession Ledger (professions, its `grant` flag) and Cinders (signature ability and passive). Without them those Items stay in the dnd5e sections. Nothing is written to the character.
- Rows, columns and widths are unchanged.

## 0.57.2 — 2026-10-26

Fixes Combat, Inventory and Features rows falling apart when the Hub body is 640px wide or less.

- **Cause:** an older narrow-window rule (container width 640px or less) made every item list a plain block, which un-gridded the one-line rows: each cell landed on its own line. Magic was not affected because it states its own grid. The item lists now state `display: grid` too.
- Checked in a real browser at 13 widths (1100 down to 340px) for Combat (weapons, actions and mixed lists), Inventory (with a container and its nested list), Features and Magic: every row is one line at every width. A new test checks, for every step of every tab, that the visible cells match the grid template's track count.
- Presentation only; no data changes.

## 0.57.1 — 2026-10-26

Inventory: Uses is kept longer than Quantity as the Hub narrows.

- **New drop order:** Weight (615px or less), then Value (555px), then Quantity (490px). Uses stays on the line to the end, right before the pinned Use / Equip / Attune / stash actions, so the narrowest line is name, Uses and actions. The action labels still fold into icons at 775px.
- **Quantity in the open row.** When the Qty number leaves the line, the open row shows the number field beside the minus and plus buttons (the same quantity actions), so you can still type or step it. The minus and plus are there at every width, as in 0.57.0.
- The name floor (9rem) and the 26rem (416px) sideways-scroll minimum are unchanged; the narrowest line needs 404px at the name floor. Presentation only; no data changes.
- Tests use mocked Foundry and prove markup and CSS text, not the live layout.

## 0.57.0 — 2026-10-26

Inventory rows: the name is never clipped, Equip and Attune are toggle buttons, the quantity is just a number field.

- **The name keeps its room.** Nothing sits beside the item name now except the fold toggle, star, icon and chevron; the Equipped and Attuned badges are gone from Inventory rows. The name track is at least 9rem (planned at 11rem) and a long name still ends in an ellipsis with a tooltip.
- **Equip and Attune are toggles in the pinned actions**, like Magic's Prepare / Prepared: **Equip** (neutral) becomes **Equipped** (gold fill, same size), **Attune** becomes **Attuned**; each has aria-pressed, the word is the non-colour sign, same actions, the same attunement prompt and limits. Use and Move to party stash stay; a slot that does not apply is an empty placeholder so the buttons line up. At 775px or less the toggles are icon toggles (shield, sun) with aria-pressed, aria-label and tooltip.
- **Quantity** is a small number field (3rem; typing works as before). The minus and plus buttons are in the open row at every width. The open row also lists Attunement.
- **Priority:** Weight and Value are low priority and go first, then Uses; the Qty field, name and the toggles stay longest. Steps: labels to icons 775px, Weight 615px, Value 555px, Uses 490px; the list scrolls sideways below 26rem (416px). At the default list width (about 600px) Qty, Value and Uses show.
- **Magic:** the pinned Prepare / Cast cell now follows the row's striping and hover (`--agch-row-bg`), as in the other tabs. Nothing else in Magic changed; its markup is identical.
- Combat and Features are unchanged: Combat keeps the Equipped / Attuned badges beside the name, because the toggles would cost it To hit, Dice or Range.
- Presentation only: no data changes, no migration. Tests use mocked Foundry and prove markup and CSS text, not the live layout.

## 0.56.1 — 2026-10-26

The Hub ignores Manager bulk writes (Sync, Import) while they run and redraws once when they finish. Before, each updated Item woke the Journey recorder and the sheets. No change to saved data.

## 0.56.0 — 2026-10-26

Combat, Inventory and Features rows are exactly one line, at every width, like Magic's.

- **One line, always.** The item name never wraps: a long name is cut with an ellipsis (hover it for the full name and dnd5e's hover card). Only two small badges stay beside it, each an icon and a word: **Equipped** and **Attuned** (at 480px or less the word is hidden, the icon, tooltip and screen-reader text stay). The mastery, "Not equipped", Effect and rarity chips are in the open row now (the rarity edge on the icon stays); the Effect note was already in the open row's text.
- **Columns, by what players use.** Each tab has one ordered priority list and steps, shared with Magic's machinery (`compact-rows.mjs`). **Combat**: Use always; To hit, Dice, Range, Uses, Recovery, Properties drop in the reverse order, Properties first (575px or less), then Recovery (565px), Uses (535px), Range (475px), Dice (400px), To hit (390px). **Inventory**: the fold toggle, star, icon, name and the four action slots always; Uses drops first (605px), then Weight (555px), Value (495px); at 430px Quantity keeps only its number field and the minus and plus move into the open row. **Features**: Use always; Type drops first (590px), then Use time (490px), Recovery (400px), Uses (390px). A dropped column moves into the open row, which now always lists every column plus Equipped, Mastery and Rarity.
- **Inventory actions** (Use, Equip / Unequip, Attune, Move to party stash) have four fixed slots, so the buttons line up in every row (an action that does not apply leaves an empty slot). They are labelled while the Hub is wide and become an icon cluster at 755px or less; every button keeps its aria-label and tooltip ("Equip <item>"). Equip is a shield, Unequip a hand, Attune a sun, Unattune a moon; Equipped and Attuned also show as badges, so colour is never the only sign.
- **Aligned and pinned.** Fixed column widths from one grid template per list, so every row and the heading line up, with uniform row height. The actions are a fixed-width track pinned to the right with a gutter and right padding, its background following the row's striped / hovered state. Below 24rem wide the list scrolls sideways with the actions pinned. A container's contents list uses the same grid.
- **Dice.** The Combat heading is **Dice** (done in 0.55.0); nothing in Inventory or Features says Damage / Healing.
- Unchanged: the long rows (**Show item descriptions**), favourites, quantity, equip, attune, use, move to stash, container fold, Filters / View, grouping, sorting, pinned headings, Magic. The old 640px rule that hid Combat Properties / Recovery, Inventory Weight / Value and Features Use time / Recovery is replaced by the steps above.
- Presentation only: no item, character or world data changes, no migration.
- Tests use mocked Foundry and prove the markup, the constants and the CSS text, not the live layout. Please check in Forge as described in the pull request.

## 0.55.0 — 2026-10-26

Magic: every spell is exactly one line, at every window width.

- **One line, always.** The spell name never wraps: a long name is cut with an ellipsis (hover it for the full name and dnd5e's hover card). The school chip and the level chip no longer sit under or beside the name.
- **Columns, by what players use.** The row is Item (star, icon, chevron, name, and small **C** / **R** badges), **Dice**, **Range**, **Casting**, **Components** and the buttons. **Dice** is new: the spell's damage or healing dice at base value ("8d6 fire", "2d8+3 heal", several parts joined with " + ", full text in a tooltip, empty when there are none), from the same labels as Combat's column, which is now headed **Dice** instead of Damage / Healing. Duration and the school are off the line. "Casting time" is now **Casting** everywhere.
- **Aligned.** Fixed column widths, so every row and the heading line up, with a uniform height. The actions column (Prepare, Prepared or Always, and Cast) has a fixed width plus a small gutter and right padding, so the data columns never shift with the button text; the buttons are pinned to the right.
- **Prepare, Prepared, Always** are the same size; Prepared keeps the gold fill and its word, Always is a neutral pill. Cast has a fixed width. Nothing wraps.
- **Columns drop as the Hub narrows**, last-used first, each moving into the open row: Components (Hub body 680px wide or less), Casting (590px), Range (505px), Dice shrinks (455px) and goes (415px). Always shown: star, icon, chevron, name, C / R, the buttons. When Casting is hidden, a casting time that is not a plain Action keeps a short badge by the name (Bonus, Reaction, 1 min). Below 384px wide the list scrolls sideways with the buttons pinned. The row never wraps.
- **The open row** (click the name or chevron) now has Level, School, Casting, Range, Dice, Duration and Components, then the description and the Open button, at any width.
- Unchanged: group folds and slot badges, pinned headings, Prepare / Always, the preparation-limit prompt, the Prepared X/Y count, favourites, Cast, hover card, and **Show spell descriptions** (the long rows keep their chips and four fact columns; only the "Casting time" heading now reads "Casting"). Combat, Inventory and Features rows are unchanged.
- Presentation only: no spell, character or world data changes, no migration.
- Tests use mocked Foundry and prove the markup, logic and CSS text, not the live layout. Please check in Forge as described in the pull request.

## 0.54.1 — 2026-10-26

Fixes a Foundry deprecation warning in the console.

- Starring an item and the Favourites list asked Foundry for an item's relative id with `ClientDocument#getRelativeUUID`, which V14 deprecates (removal in V16) and logged a warning on every redraw. The Hub now uses `foundry.utils.buildRelativeUuid`, and falls back to the old call only on a Foundry that lacks the new one. The id is the same (".Item.<id>"), so existing favourites are unchanged.
- No change to saved data.

## 0.54.0 — 2026-10-26

The resurrection-diamond message moves to the window's title bar.

- It now sits in the empty strip of the title bar between "Ashen Gate | Character Hub — <name>" and the window buttons, on every tab, and is no longer shown in the Inventory panel. Same rule as before: "You do not possess a resurrection diamond" (red, italic) without a diamond; "Your soul may be returned" (green) when any item with "diamond" in its name is carried, containers included.
- One compact line with an ellipsis. The text takes no pointer events, so you can still drag the window by that strip; the window buttons do not move.
- It is the first thing hidden. When the window is under 900px wide, or in Compact, the words give way to a small gem button in the same place; its aria-label and tooltip carry the full message and a click shows it as a notification. Only one of the two is displayed at a time.
- If there are ever several notices, the first shows with "+N" and a tooltip for the rest.
- A deliberate exception to the header rule (no subtitle): a conditional status line Robb asked for, not a control.
- Saved data: no change; no migration.
- Tests use mocked Foundry and prove the logic and markup, not the live window. Please check in Forge as described in the pull request.

## 0.53.0 — 2026-10-26

Combat, Inventory and Features rows are one line each, like Magic's.

- **One line per item.** Each row keeps its icon, name and chips, fact columns and buttons on the one line. The description is no longer printed under the name: click the **name** or the **chevron** to open it in a row beneath (with an **Open <item>** button for the item sheet); click again to close. The open rows are remembered while the Hub is open, and focus stays where you clicked. Hovering the name still shows dnd5e's hover card.
- **Nothing was removed from the line.** Combat: star, icon, name with its chips (mastery, not equipped, attuned), Damage / Healing, To hit, Range, Properties (weapons) or Range, Damage / Healing, Uses, Recovery (actions), Use. Inventory: fold toggle, star, icon, name with chips, Qty (− / field / +), Weight, Value, Uses, Use, Equip / Unequip, Attune, Move to party stash. Features: star, icon, name, Type (unless grouped by it), Use time (unless grouped by it), Uses, Recovery, Use.
- **Narrow windows.** At 640 pixels wide or less the lower-priority columns move into the open row: Combat Properties or Recovery, Inventory Weight and Value, Features Use time and Recovery.
- **Show item descriptions** (only for you, off by default, applies at once): Combat and Features under **Filters**, Inventory under **View** beside the search box. On brings back the long rows (summary and **More**). It does not change Magic, which keeps its own **Show spell descriptions**.
- The column headings stay pinned under the toolbar in all three tabs (inside an open container they scroll with it).
- Presentation only: no item, character or world data changes, no migration. One new client setting (`showItemDescriptions`, default off).
- Tests use mocked Foundry and prove the markup and logic, not the live UI. Please check in Forge as described in the pull request.

## 0.52.0 — 2026-10-26

The compendium picker behind **Add spell…**, **Add item…** and **Add attack…** can be sorted.

- **Sort by** (a labelled select) and a **Descending** toggle (a pressed button; it reads "pressed" while the order is reversed) sit above the results in dnd5e's "Browse compendiums…" window. **Spells:** Name, Level, School, Casting time, Range, Concentration, Ritual, Source. **Items:** Name, Item type (weapon, equipment, consumable, tool, loot, container), Rarity (common, uncommon, rare, very rare, legendary, artifact, in that order), Price (copper, silver, electrum, gold and platinum all counted in gp), Weight (in pounds), Source. Ties are broken by the next key (level, then name; rarity, then price, then name), always A to Z. Items with no rarity, no price or no school sort last in both directions; a price of 0 counts as "no price". For Concentration and Ritual, ascending lists those spells first.
- **The whole list is sorted, not just what is on screen.** dnd5e loads every match and shows 50 rows at a time as you scroll; the sort is applied to the full set before that, so row 51 onward are in order too. Search and Filters work as before and the sort applies to what they leave. Changing the sort refreshes the results from the top, and focus stays on the control you used.
- Each row's second line now also shows what it is sorted on, for example "Spell · Level 3 · Evocation" or "Weapon · Rare · 500 gp".
- **Remembered per user** on this computer, spells and items separately (client setting `browserSort`). First time: spells by Level then Name, items by Name. Add feature… keeps dnd5e's plain picker; the class picker in Level up is unchanged.
- The results are a list, not a table, so there are no clickable column headings; the select and the toggle are the controls. No group-by headers (the picker loads rows in batches of 50).
- Saved data: no change; one new client setting with an empty default; no migration. If dnd5e's picker ever lacks what the sort needs, Add… opens dnd5e's own picker unsorted.
- Tests use mocked Foundry and prove the logic, not the live UI. Please check in Forge as described in the pull request.

## 0.51.0 — 2026-10-25

Magic gets compact rows, and spell preparation now has limits.

- **One line per spell.** Star, small icon, name, school, casting time, range, duration (with **C** concentration and **R** ritual badges that have text, a tooltip and a spoken name), components, Prepare / Always and Cast. The description is hidden: click the name or the chevron to open it in a row beneath (keyboard accessible, focus stays on the control, remembered across redraws). Hovering a name still shows the item hover card. The open row has an **Open <spell>** button for the item sheet, since the name no longer opens it in compact rows.
- **Show spell descriptions** (per user, default off; a switch in Magic → Filters, applies now) brings back the long rows with the description under the name.
- **Level groups** fold with remembered state and keep their slot counts; the **column headings stay pinned** under the toolbar while the list scrolls. In a narrow window duration and components move into the open row; nothing scrolls sideways.
- **Preparation limits.** Each class's limit comes from dnd5e (`system.spellcasting.preparation.max`). A player who tries to prepare past it gets "You can prepare N spells as a <Class>. Unprepare one first." with one-click **Unprepare <Spell> and prepare <New spell>** choices and Cancel (the default). The standard sheet's Prepare toggle is held to the same limit (`preUpdateItem`, only for the user who made the change). Always-prepared, cantrips, at-will, innate, ritual-only and unassigned spells are never counted or blocked; a wizard's spellbook is unlimited; a class with no limit from dnd5e is not blocked. The GM is never blocked and is told "Over the limit". New world setting **Enforce spell preparation limits** (GM Setup → Spell preparation, default on).
- **Prepared count** in the spell-level strip: "Prepared 4/6", or per class ("Wizard 4/6") when multiclassed, with a tooltip and aria-label; at the limit it reads "full" with a check icon. It sits inside the strip's existing row, so no spacing changes.
- Saved data: no change; two new settings (`showSpellDescriptions` per user, `enforcePrepLimits` world) with defaults; no migration.
- Tests use mocked Foundry and prove the logic, not the live UI. Please check in Forge as described in the pull request.

## 0.50.1 — 2026-10-25

- **A condition Foundry can't toggle is never offered.** The conditions list (and the recent-condition chips) offer only statuses Foundry can find, whether the list comes from this Hub or from Utilities, so Apply can no longer hit Foundry's "Invalid status ID" error. dnd5e's automatic effects (encumbrance) are left out, and a status is looked up by the name it is registered under.
- **A refused change reads as one plain line** naming the condition and the character, for example "Half Cover was not put on Quest: Foundry doesn't recognise that condition.", never Foundry's raw text.
- Every condition in the list has an icon: its own, or a generic one. With Ashen Gate | Utilities active, the icon is the one the GM picked there (Utilities → Conditions → Condition icons).
- Saved data: no change; no migration.

## 0.50.0 — 2026-10-25

The "Link quick bar to Foundry's hotbar?" question is gone: the two bars simply stay in sync.

- **No dialog.** Opening a character's Hub never asks which bar to keep. The first time a character's quick bar and your Foundry hotbar page 1 differ, they are merged silently and nothing is lost: every quick bar slot stays as it is, the quick bar's **empty** slots (1-10) are filled from the Foundry macros the Hub can hold (the character's own item macros and world macros), and Foundry's page 1 then shows the quick bar. If anything was filled, one quiet notice says so.
- **From then on** slots 1-10 stay the same in both directions, exactly as before: bringing a character's Hub to the front puts that character's quick bar on page 1, and changes on either side follow. Other hotbar pages are never touched.
- **Saved data.** Nothing to migrate. An answer stored on your User by the old question (`flags.ashen-gate-character-hub.hotbarLink`) is kept and simply counts as "already linked"; the first-link merge is remembered in the same flag as `merged`. There was no on/off option to keep: it was removed in 0.46.0 and stays removed.
- Tests use mocked Foundry and prove the logic, not the live UI. Please check in Forge as described in the pull request.

## 0.49.0 — 2026-10-25

Pets and mounts a player owns now appear in the dropdowns by themselves.

- **Auto-listing.** Each pet box and the mount box list the NPC Actors the character's player **owns** (Owner permission only; Observer and Limited are not enough), under **Yours to use**, next to the companions already linked. Choosing one links it to the character and makes it active in that box. Award a companion by giving the player Owner on its Actor. Never listed: the character itself, player characters or other non-NPC Actors, level backups, compendium Actors, Actors the player cannot see, or a pet already active in another box. A pet or mount is listed once.
- **Whose ownership counts.** An Actor is listed when at least one non-GM user who owns the character also owns it. A character with no player owner (GM-run) uses the viewing user's own permission; a GM viewing such a character gets no automatic list (a GM owns everything) and links by drop or find as before. A GM viewing a player's character sees what that player could use.
- **What kind an Actor is** (strongest first): the GM's **Companion type**; the import id (`CRE-MOUNT-` is a mount, `CRE-PET-` a pet; people, `NPC-`, are never listed); any other creature, and any Actor with no import id, by size: Tiny, Small and Medium are pets, Large, Huge and Gargantuan are mounts. **Either** lists in both, **None** in neither.
- **GM Setup → Companion types.** New card: a searchable list of NPC Actors with a select per row (Automatic, Pet, Mount, Either, None) and the effective kind in plain words, such as "Mount (set by GM)", "Mount (Large)" or "Pet (imported as a pet)". The setting is stored on the Actor as `flags.ashen-gate-character-hub.companionType` (optional, no migration) and only the GM can change it; the data layer refuses anyone else.
- **Data layer.** A player can link from the list only an Actor they own whose kind fits the box; anything else is refused with a plain message. Dropping or finding an Actor works as before (Observer is enough) and the GM can link anything. The Companions part visibility, level-backup and pet-slot rules still apply.
- **Nothing is removed automatically.** If the GM takes ownership away, a linked companion stays linked and shows "No longer owned" until its player clears it; it just stops being listed.
- **API.** New read-only `eligibleCompanions(actor, kind)` and `companionKind(actor)`. `companions(actor)` is unchanged.
- Tests use mocked Foundry and prove the logic, not the live UI. Please check in Forge: give a player Owner on an Ember Stag Actor and look under Mount; give Owner on a Small creature and look under Pets; mark an Actor Either in GM Setup → Companion types.

## 0.48.0 — 2026-10-25

Up to three pets, slot-aware gear, and your own names for companions.

- **Three pet boxes.** A character can have up to three active pets and one active mount. Each pet box has a small portrait, the name, a one-line stats strip, an **Active pet** dropdown, **Open sheet** and its own Head and Body sockets. The Mount box stays larger; on a narrow window the boxes stack, mount first. A character can link many pets; each dropdown lists the linked pets that are not active in another box (and an empty choice to clear the box). A pet is active in one box only.
- **Pet slots (GM Setup).** New **Pet slots** card: a default (0 to 3, starts at 3) and a per-character override. The limits are enforced in the data layer. Lowering the number never removes anything: empty extra boxes are hidden, and a pet already in an extra box stays shown until the player clears it. New world settings `petSlots` and `petSlotOverrides`; the old `petCap` and `petCapOverrides` stay saved and are ignored. `registerPetSlotSource` now adds extra slots (the total is never more than 3).
- **Slot-aware gear.** Items can say where they go with `flags.ashen-gate-character-hub.companion.slot`: `saddle` or `tack` for `mount-gear`, `head` or `body` for `pet-clothing` (a slot with the wrong role is ignored). A classified item only fits its own socket type and a wrong drop is refused with a plain message. Gear with no slot behaves as before and fits any socket of its kind. Dropping an item on a box uses the first free socket of its type.
- **Socket labels.** The mount's sockets are Saddle and four Tack (were Other 1 to 4); pets keep Head and Body.
- **Names and descriptions are back.** **Edit name…** on any companion box lets the owner or GM give it their own name (up to 60 characters) and a description (up to 500), stored on the character so the Actor is never changed. An empty name falls back to the Actor's own, which shows as small text when the names differ. The editor keeps your typing if the window redraws and asks before Cancel throws changes away.
- **Saved data.** `companionSlots` is now version 2: `activePets` (three entries) replaces `activePet`, and `labels` holds the names and descriptions. Version 1 is read as version 2 (activePet becomes `activePets[0]`, Other sockets become Tack) and written as version 2 by the GM client's startup migration or the next change. Names and descriptions typed before 0.47.0 in the old `companions` list are carried into `labels`. Safe to re-run; nothing is deleted and the old list is never changed.
- **API.** `companions(actor)` keeps its shape: `pets` lists every linked pet with `active`, `petCap` is now the number of pet slots, and each row also has `actorName` and `description` (`name` is the player's name, falling back to the Actor's). New `petSlotsFor(actor)`.
- Tests use mocked Foundry and prove the logic, not the live UI. Please check in Forge: GM Setup → Pet slots, three pet boxes, dropping classified and unclassified gear, **Edit name…**, and a narrow window.

## 0.47.0 — 2026-10-24

Companions are now two boxes: a larger **Mount** box and a smaller **Pet** box, each with sockets.

- **Pets and mounts are Actors, many of each, one active.** Link world Actors as before (drop one from the Actors sidebar, **Find an Actor by name…**, or **or link a world Actor…**; players need Observer permission, and the not-shared handling is unchanged). The **Active mount / Active pet** dropdown swaps between the character's linked ones. **Open sheet** opens the active Actor's sheet when you may observe it. Each box shows a small portrait (a neutral icon when there is no art), the name, and a one-line strip of the Actor's own AC, HP and speed when it has them.
- **Sockets.** The Pet has 2 (Head, Body); the Mount has 5 (Saddle, Other 1 to 4). Gear is an ordinary Item on the character (the existing `pet-clothing` and `mount-gear` roles): drop it on a socket (items from elsewhere are copied onto the character with the shared item-drop standard), drop it on the box for the first free socket, or use **Add gear…** on an empty socket (the keyboard route). **Remove** takes it out; the item stays on the character. A socket holds one item and an item sits in one socket. Each socket row lists every bonus the item gives, and the box's stats area totals them from the items' own Active Effects and armour value. Display only: nothing is applied.
- **Gear stays with its own pet or mount** when you switch the active one; switching back shows it still there. Perk rows (`mount-perk`, `pet-perk`) work as before for the active companion.
- **Slot fit.** The item data does not say which of Saddle, Head or Body an item fits, so any gear item of the right kind fits any socket.
- **Pet limit retired.** GM Setup → Companions (pet limit) is gone and nothing reads `petCap` or `petCapOverrides` any more; the saved values are kept, not deleted. The public API keeps `companions(actor)` (now also lists every linked pet with an `active` flag, plus `actorUuid` and `gearItemIds`; `petCap` is `null`, unlimited), `petCapFor` (always unlimited) and `registerPetSlotSource` (a harmless no-op).
- **Older Item companions** (pets or mounts saved as Items before the Actor link existed in 0.12.0) are kept, not deleted, and listed read-only under **Older companions**.
- **Saved data and migration.** New flag `flags.ashen-gate-character-hub.companionSlots` (version 1). Linked Actors in the old `companions` list are carried over (first mount and first pet become active; attached gear and clothing go into sockets in order; perks follow their companion). The GM's client runs this once at startup; it is safe to repeat, and the old flag is never changed or deleted. If a character has not been migrated yet, the tab reads the same result in memory and the first change saves it.
- Removed the editable name and description boxes on companion cards (the Actor's own name is shown). Tests are mocked Foundry; please check in Forge: link, swap, socket, Open sheet, and a narrow window.

## 0.46.6 — 2026-10-24

Two pop-out and marks fixes found in the live integration check.

- **Pop-out: the second step of a Hub dialog flow opens in the Hub's window again.** Since 0.46.2, **Restore backup…** showed its picker in the popped-out Hub but the "Restore <name>?" confirmation in the main window, and **Add → Create new…** showed its name form in the main window. Foundry resumes the Hub's code the moment you press a dialog's button, before the dialog has closed, and the pop-out hosting only came back on once the dialog had closed. It now counts a Hub dialog as finished when you press its button. A confirm, an actor delete or a rest opened from the main window while a Hub dialog (for example Help) is open still stays in the main window.
- **Expired Sap, Slow and Vex no longer show as marks.** When a combat turn ends one of these, Foundry leaves it on the target as an inactive, expired effect. The Hub kept listing it in "On targets", and pressing Sap again took that dead effect off instead of placing a new one. An expired mark is no longer listed, and placing a mark clears the expired Hub marks on that target.
- No change to saved data; no migration. Mocked tests plus headless Foundry runs; please check in Forge with a popped-out Hub (Restore backup…, Add → Create new…, Help left open then a delete or rest from the main window) and in a combat (Sap, end the turn, Sap again).

## 0.46.5 — 2026-10-24

- Shared UI kit 2.3.0 (id helpers and the record picker, used by Quest Log first). No change to how this module looks or works.
- Saved data: no change; no migration.

## 0.46.4 — 2026-10-24

The paper-doll art stays tall. In the Full Hub the character art had become a short, wide band (about 730 x 200 in a window of 870 x 670, the character small and the slot columns far to each side). Two things caused it: the doll gave way (shrank) before the character column scrolled, so a busy column squeezed the slots and the art; and in a narrow Full window (900 px or less) the art ran the whole window width.

- **Full Hub:** the doll keeps its full height (five slots at their usual size, the size from 0.44.1), so the art is no longer squeezed. When the window is too short for the whole column, the column scrolls instead of the art shrinking.
- **Narrow Full window:** the doll is centred and no wider than seven slots, so the art sits between its slots as a compact stage instead of a wide band. Slot size and arrangement are unchanged.
- **Compact:** unchanged (the doll still shrinks to keep the stats in view). Hide character / Show character: unchanged (shown until you hide it). Nothing else in the Overview moves.
- No change to saved data. Mocked tests plus headless Chromium measurements; please check in Forge (Overview at about 870 x 670, then wider and popped out).

## 0.46.3 — 2026-10-24

Ashen Gate ids no longer show in the Hub. Where a partner module gave a profession, skill tree or perk no name, the Hub used to fall back to its id (PROF-, tree or perk ids) in the Professions and Skill Trees tabs and the Overview's Professions box; it now shows a neutral word ("Profession", "Skill tree", "a perk"). Machine wording (snake_case kinds such as a quest's "side_quest" in the Journey) is shown as plain words too; the Hub prints no relation, status or entity-type tokens. Nothing else in the Hub displayed ids. Saved data, flags and APIs are untouched. (Mocked tests; please check the Professions and Skill Trees tabs in Forge.)

## 0.46.2 — 2026-10-24

Pop-out dialogs no longer pull in windows from the main window, and the roll dialogs follow the Hub.

- **Side effect fixed.** Hosting a Hub dialog in a popped-out Hub's window is now on only while a Hub action is waiting for its next window. While a hosted dialog is open (for example Help), a confirm, an actor delete or another actor's rest opened from the main window stays in the main window. It switches back on when that dialog closes only if the action still has more steps (picker, then config window; Use, then usage dialog, then roll dialogs), and off for good when the action ends, the Hub closes, or you Pop in/out.
- **Roll dialogs.** dnd5e's roll configuration dialogs (damage, attack, ability/skill/tool and the base roll dialog) opened by Cast Spell, Use and attack rolls from the Hub now open in the popped-out Hub's window too.
- Hub dialogs report their real class (DialogV2) again.
- Not popped out: nothing changes. No change to saved data. Mocked tests only; please check in Forge with a popped-out Hub.

## 0.46.1 — 2026-10-24

Conditions follow the GM's rule: **players and the GM can change conditions on every actor that is not a player's character, and players can change their own character; the GM can change everything.** (Needs Ashen Gate | Utilities 0.29.2 for anything a player does to a monster; Player Access still gates it.)

- **Monsters, NPCs, creatures:** with Target on, any player can put conditions on and take them off a targeted token, linked to a character or not. For an unlinked token the GM's client makes the change after asking Utilities' rule again for the player who asked (the earlier "condition controllers only" rule is gone).
- **Another player's character:** refused with "... is another player's character, so only the GM can change its conditions." (A condition controller named in Utilities still can.)
- **Player Access off:** refused with a message that names Player Access.
- **Exhaustion** is offered in the conditions list like the other conditions (the same list Utilities' tracker uses), and its chip shows the level. Put on and off exactly as Utilities does. Change levels with the − / + beside HP.
- No change to saved data.

## 0.46.0 — 2026-10-24

Inventory: the resurrection diamond reminder is now a medium-light red when the character has no diamond and a medium-light green when they have one (the skin's own danger and ok colours, so they stay readable in every skin).

Header navigation (Robb, after Session 0). Compact, Appearance, Pop out / Pop in and Level up are now icon buttons side by side at the top right (each has a name and a tooltip; Level up keeps its "why not" reason; Pop out is still hidden where Foundry can't detach; a popped-out Hub keeps Pop in; the group wraps in a narrow window instead of clipping). The ⋯ menu is now only Configure…, NPC Codex (when General Manager offers it) and Open native sheet, plus Restore backup… for the GM when there are level backups. "Edit name and title" is gone from the menu: the pencil beside the name stays. The Foundry hotbar link has no option any more: the Hub is always linked, the "Link quick bar to Foundry's hotbar" menu item and its setting are gone, and an old stored "off" value is ignored (nothing is rewritten; hotbar slots are untouched). Help and README updated.

Pop-out follow-through for the new windows: with the Hub popped out, dnd5e's compendium browser (Browse compendiums… under Add…) and its advancement window (after an Add or a drop) now open in the Hub's own window too, and a drop on a list is hosted like a button click. Level up from its header button already opens its class picker there. Not popped out, nothing changes. Mocked tests only; please check in Forge with a popped-out Hub.

## 0.45.2 — 2026-10-24

Conditions, fewer clicks and clearer feedback (builds on 0.45.1).

- **Feedback.** Apply and ✕ now say what happened: "Prone put on Goblin 1." / "Goblin 1 already has Prone." / "Prone taken off Goblin 1."
- **One click for the usual ones.** The last four conditions you put on show as buttons in the strip; click one to put it on Self or your targets (whichever the Self / Target switch is on). Remembered per browser.
- **One shared list.** With Ashen Gate | Utilities active, the strip offers the same conditions as the Utilities tracker (Utilities 0.29.1).
- **Monsters and other unlinked tokens.** A condition controller (Utilities → GM Setup) can now put conditions on and take them off a targeted token that is not linked to a character: the GM's client makes the change after checking again who asked, like marks. The GM can always; other players still see "Only the GM or a condition controller can change conditions on ...".
- **Fresh chips.** When someone else changes a condition on a creature you are targeting, your Hub's chips update.
- No change to saved data. One new per-browser setting remembers the recent conditions.

## 0.45.1 — 2026-10-24

Weapon masteries now act as their rules say, instead of only labelling the target. Uses dnd5e's own effect durations; spell marks (Hunter's Mark, Hex, ...) still only track.

- **Sap:** the target gets Disadvantage on its attack rolls (a real change dnd5e applies) until the start of your next turn, or until it makes its next attack roll.
- **Slow:** takes 10 ft off each of the target's speeds until the start of your next turn. A second Slow replaces the first, so it never adds up past 10 ft.
- **Vex:** marks the creature for your Advantage on your next attack roll against it (dnd5e cannot give you Advantage against one creature, so the Hub shows the rule when you place it). It ends at the end of your next turn, or after your next attack roll against it.
- **Topple:** no lingering mark. Asks for the Constitution save (DC 8 + your attack ability modifier + Proficiency Bonus, shown) and puts the real Prone condition on a target that fails.
- **Cleave, Graze, Nick, Push:** instant, so clicking shows the rule and puts nothing on anyone (no target needed).
- Sap, Slow and Vex end by combat turn when a combat is running. With no combat, dnd5e ends them when game time next advances; the ✕ on the chip always takes them off early.
- Help and tooltips updated. No change to saved data; marks already placed keep working (they have no duration, so remove them with the ✕).

## 0.45.0 — 2026-10-24

Add attacks, items, spells and features from the Hub (Robb: only the native dnd5e sheet could). Tests use mocked Foundry and dnd5e and cannot judge the real compendium browser or advancement window; please check each tab in Forge as a player and as the GM.

- **An Add button on four tabs**, at the right end of the toolbar: **Add attack…** (Combat), **Add item…** (Inventory, character view), **Add spell…** (Magic, also when the character has no spells yet) and **Add feature…** (Features). It asks **Browse compendiums…** or **Create new…**. Owner or GM only: anyone else sees it disabled with the reason, and the action refuses them too. A tab the GM has hidden from players refuses players as before.
- **Browse compendiums…** opens dnd5e's own compendium browser locked to the right types: Inventory weapon, equipment, consumable, tool, loot and container; Magic spell; Features feat; Combat weapon and feat (a feat with no attack activity is refused with a pointer to Features, as the browser cannot filter on activities). The pick is added as dnd5e's own drop does: Foundry's `fromCompendium`, dnd5e's per-type `onDropCreate` (spell method and preparation), and dnd5e's advancement window when the item has advancement. A container brings what is inside it.
- **Create new…** asks for a name (and a type where the tab has several), creates a blank item and opens its sheet beside the Hub, in the Hub's own window when it is popped out.
- **Drag and drop**: drop an Item from the sidebar, a compendium or another character onto the Combat, Inventory, Magic or Features list and it is added the same way (Inventory's Party stash view is not a drop target). Classes, subclasses, species and backgrounds are refused with a pointer to Level up (⋯ menu) or the native sheet; level-up itself is unchanged. The quick bar's slot drops work exactly as before.
- A quiet note says what was added; a refusal or failure says why. Focus returns to the Add button.
- Help and the README describe it. Saved data: nothing migrates; items are added to the character like any other.

## 0.44.4 — 2026-10-24

Fix: with the Hub popped out into its own browser window, the other windows a Hub button opens still appeared in the main Foundry window. These now open in the Hub's own window too: the Configure a stat picker, the Level up class picker, Restore backup and confirmation dialogs, Help, the spell / item Use dialog, the Short Rest and Long Rest dialogs, and the portrait / token art file picker. Not popped out, nothing changes. Saved data is untouched. (Mocked tests only; please check each in Forge with a popped-out Hub.)

## 0.44.3 — 2026-10-24

Fix: with the Hub popped out into its own browser window, item, spell and feature sheets (and the Configure… and token-art windows) opened in the main Foundry window, out of sight, so editing seemed impossible. They now open in the Hub's own window, as dnd5e's native sheet does with its child windows. Not popped out, nothing changes. Saved data is untouched. (Mocked tests; please check with a popped-out Hub in Forge.)

## 0.44.2 — 2026-10-23

Level up now says what happened when dnd5e shows no advancement window. If the class has no advancement steps for that level, or dnd5e's "Disable Advancements" world setting is on, the level still goes up as before and a notice says so, with what is left to do by hand (set Hit Points, add new features). Before, it looked as if nothing had happened. Nothing else changes; saved data is untouched.

## 0.44.1 — 2026-10-23

Puts the paper doll back to how it was before 0.43.0: slot sizes and arrangement as in 0.42.4 (Robb: 0.43.0 and 0.44.0 covered most of the art with the slots, the Token art button and the AC badge). Both slot changes are undone. Kept from 0.44.0: the character column opens shown (the one-time reset of a stored fold). Saved data: nothing changes.

## 0.44.0 — 2026-10-23

Paper doll slots in short windows; Show character opens by default. Tests use mocked Foundry and cannot judge layout; the sizes below were measured in headless Chromium with the shipped CSS.

- **Equipment slots are at least about 44 px.** The smallest slot used to be the icon-button size (about 26 to 32 px), which is where a short Compact window put them, so 0.43.0's growth never showed.
- **Short windows: two columns per side.** When the doll is short for its width, each side's five slots sit in two columns over the blurred margins of the art pane (outer column first, top to bottom, then the inner one; Tab order is unchanged, head to hands then main hand to bracer). The art stays centred, uncropped and contained, with a clear middle (about 0.7 x its height) for the subject; Change portrait / Token art stack in that middle. The slots grow with the height (about 58 px at the shortest Compact doll, up to about 74 px with room), the rings and trinkets row stays under the art, and the AC badge, rarity rings, attuned mark and Equip / Unequip menus follow the new size and column. Too narrow for that (a doll under 320 px wide, 410 px at the Comfortable size) or tall enough for full-size slots keeps the single column at the 44 px minimum.
- **Fix: Show character was closed on first open for some users.** 0.33.0 shipped the narrow Full column folded and remembered every click, so a stored "folded" from then could outlive 0.41.0's open default. This version drops a stored fold once per user and computer (stamped, so it never repeats); after that your Hide / Show choice is remembered as before. A new user with nothing stored gets it open in narrow Full and in Compact.
- Saved data: one browser-side setting (the character fold) is reset once; nothing in the world changes.

## 0.43.0 — 2026-10-23

Paper doll: bigger equipment slots. Tests use mocked Foundry and cannot judge layout; the live Hub is for Robb to look at.

- **Bigger equipment slots.** The slots beside the character art are about 28 % larger in Full and Compact, at both Sizes. The art pane gives up the width: it stays centred, uncropped (never stretched) and the same pane for wide, tall and square portraits and tokens. The rings and trinkets row sits under it at 85 % of the side-slot size, so five fit the art's width; the AC badge, Change portrait / token art and Portrait / Token art buttons, rarity rings, attuned mark, empty-slot placeholders and the Equip / Unequip menus all scale and position from the new size.
- Saved data: unchanged. No migration.

## 0.42.4 — 2026-10-23

Fixes from the 0.42.3 test run. Tests use mocked Foundry; the live Hub is for Robb to click through.

- **Fix: Find an Actor by name linked on blur.** Typing part of a name and clicking elsewhere linked the Actor if exactly one matched, because the box acted on the browser's change event. It now links only when you press **Enter** or pick one of the browser's name suggestions; leaving the box does nothing.
- **Fix: two open Hubs shared one suggestion list.** The suggestions list had the same id in every Hub window, so a second window's box used the first window's list. Each window now has its own.
- Saved data: unchanged. No migration.

## 0.42.3 — 2026-10-23

Follow-ups from the 0.42.2 test run. Tests use mocked Foundry; the live Hub is for Robb to click through.

- **Fix: Limited and Observer now agree for a linked Actor.** The companion card treated anything below Observer as "not shared", but the open-sheet button let a Limited viewer open the Actor's sheet. Opening now needs Observer too (the same rule as seeing the card), and a viewer below Observer is told the Actor is not shared with them, without its name.
- **Find any Actor by name.** The Mount and Pets boxes get **Find an Actor by name…**: type part of a name and press Enter. It searches every Actor you can observe (not only the first 150 the list shows, and not only the Companions folder), links the one that matches, and says so when none or several match ("Type more of the name"). An exact name wins over partial matches. The same permission, one-mount and pet-limit rules apply. Browsers also suggest names as you type.
- Help and README describe it. Saved data: unchanged. No migration.

## 0.42.2 — 2026-10-23

QA pass on Companions (world-Actor mounts and pets), the list tabs, Player visibility. Tests use mocked Foundry; the live Hub is for Robb to click through.

- **Fix: an unshared Actor companion leaked.** A mount or pet linked to a world Actor kept showing that Actor's name, art, biography and AC / HP / speed after the GM took the player's Observer permission away. It now stays listed as "Companion (not shared)" with a note, can still be removed, and shows nothing from the Actor (the Remove confirmation does not name it either). The GM is unaffected.
- **Link a mount or pet without dragging.** The Mount and Pets boxes get **or link a world Actor…**, a list of world Actors you can observe (never this character, a level backup or one already linked). If the world has a folder named Companions, the list is that folder (mount-named ones first for a mount); otherwise every non-character Actor, up to 150. Dragging from the Actors sidebar works as before. The same permission, one-mount and pet-limit rules apply.
- **Fix: search could hide real matches.** In Combat, Inventory, Magic and Features a section you had folded stayed shut while the search matched items in it, so it looked empty. A folded section (or container) now opens while it holds a match and folds back when the search is cleared (your saved folds are not changed). A search with no match anywhere now says "Nothing matches your search." instead of showing a blank list.
- **Fix: Player visibility text.** GM Setup claimed players can't use *any* hidden part's actions. It now says what is enforced (Rests, Equipment slots, Companions, Hotbars, the party stash); items, spells and features stay usable on dnd5e's own sheet.
- Help and README describe the above. Saved data: unchanged. No migration.

## 0.42.1 — 2026-10-23

Code-read review fixes for the quick bar ↔ Foundry hotbar link.

- **Security: unsafe item names are never copied to the hotbar.** dnd5e writes an item's name straight into the hotbar macro's script. An item named with a double quote, backslash, backtick, `${` or a line break could therefore run its own code as a script macro for whoever brought that Hub to the front (including the GM). The link now skips such items in both directions and shows one notice (it never repeats the name). Rename the item to link it. The macro command builder also escapes names defensively.
- **Fix: two items with the same name.** dnd5e finds the item by name, so the second item's hotbar slot rolled the first. The first item links as before; later items sharing its name are skipped with one notice. Their quick-bar slots still work.
- Saved data: unchanged. No migration.

## 0.42.0 — 2026-10-23

Robb's requests: connect the quick bar and Foundry's hotbar both ways; a roll from the quick bar stuck its dialog to the top of the screen; clicking an item's icon should use it.

- **Quick bar linked to Foundry's hotbar:** slots 1-10 of the Hub quick bar and page 1 of your Foundry hotbar (the page the number keys use) now hold the same things, for the character whose Hub is in front. Drag an item or macro onto either bar, clear it or move it, and the other follows. An item becomes dnd5e's usual item macro, exactly as if you had dragged it onto Foundry's hotbar (an existing one of yours is reused, never duplicated). Foundry macros the quick bar can't hold (another character's item, an activity macro) stay in Foundry and leave the quick bar slot alone. Other hotbar pages are never touched.
- **First link:** when a character's two bars differ, the Hub asks once per character: **Use the Hub quick bar**, **Use Foundry's hotbar** or **Keep both and fill empty slots** (Cancel links nothing and asks again next time you load). After that, bringing a character's Hub to the front puts that character's quick bar on Foundry's page 1, replacing what was there.
- **Turn it off:** **⋯ → Link quick bar to Foundry's hotbar** (only for you, applies at once). Off works exactly as before.
- **Keys:** 1-0 with a Hub in front still use the Hub slot once, never also Foundry's macro. With no Hub open they run Foundry's macro, now the same thing.
- **No script-macro permission:** the quick bar slot still works; a single notice says the Foundry copy could not be made.
- **Fix: roll dialog at the top of the screen.** dnd5e opens its attack and damage roll dialogs where you clicked. A key press (1-0), or pressing Enter on a slot, has no click position, so the dialog ended up at the top. The Hub now tells dnd5e the slot's position (or the middle of the screen), keeping Shift/Ctrl/Alt for fast-forward. Clicking with the mouse is unchanged.
- **Item icons use the item:** in Combat, Inventory, Magic and Features, clicking an item's icon uses it (cast, attack, drink, dnd5e's activity chooser when there are several), like a quick-bar slot; clicking the name still opens it. Items with nothing to use (plain loot) open from the icon too. Only for characters you own; observers see the plain icon. Dragging rows, More, right-click and the quick-bar drag work as before.
- **Magic: Group starts at Spell level** (checked; it already worked this way, now covered by tests). Pick another Group in Magic's **Filters** and the Hub keeps it for you on this computer: across redraws, tab switches, pop out, and closing and reopening the Hub. **Clear filters** leaves the Group alone. Combat and Features keep their own choices and defaults. If your Magic list opens grouped some other way, that is a choice saved earlier on this computer: set Group back to Spell level once and it stays.
- Saved data: a new per-user client setting (`linkFoundryHotbar`, default on) and the first-link answer on your User (`flags.ashen-gate-character-hub.hotbarLink`). The quick bar flag is unchanged. No migration.

## 0.41.0 — 2026-10-23

Robb's request: in a narrow Hub, show the character by default, make the tab row smaller, and keep the Ashen Gate buttons and the quick bar at the bottom.

- **Character shown by default:** when the Full Hub is narrow (about 900 px or less), the whole character column now shows under the tabs. **Hide character** folds it to the Cinders, the star and a short HP / AC line; **Show character** opens it again. The Hub still remembers your choice on this computer. Nothing is saved until you click the button (it never was), so anyone who folded it on purpose keeps it folded; everyone else now sees it open.
- **Smaller tab row:** in a narrow Hub the sections sit in one slim row: a small icon with the name beside it, at the kit's small button height (the row is about 32 px tall instead of 44 px). It stays at the top while you scroll. If all the tabs don't fit, the row scrolls sideways instead of wrapping; names are never cut off. Left / Right arrow keys move along the row (Up / Down still work), and the focus ring sits just inside the tab so it is never cut off.
- **Bottom stays put:** in a narrow Hub only the tabs, character and section scroll. Mastery & marks, the conditions strip, the Ashen Gate bar, the **Quick bar** button and the quick bar itself (when open) stay pinned along the bottom of the window. Before, the whole window scrolled and long sections pushed them off the bottom. The quick bar's keys 1-9 and 0 work as before, open or closed.
- The wide layout and Compact are unchanged.
- Saved data: no change. No migration.

## 0.40.0 — 2026-10-23

Robb's request: change the character's name in the Hub, and show a title beside it.

- **Name and title:** the header shows the character's title beside the name, smaller and in italics, in the muted text colour (for example "Velwin *Warden of the Ford*"). Everyone who can see the character sees it, also in the limited view. A long title ends in "…" only when the header has no room (hover it for the whole title); the Level badge always stays.
- **Edit name and title…:** the owner and the GM get a small pen button beside the name (also in the header's **⋯** menu). It opens a dialog with **Name** and **Title**: **Save** (bottom right) is greyed out while the name is empty; **Cancel** or Escape changes nothing. Only what you changed is saved. The name is the character's real name (the same as on the dnd5e sheet); the window title follows it, also in a popped-out Hub.
- **Who can:** owners and the GM only. Observers and limited viewers don't see the button, and a change from them is refused, not just hidden. Level backup copies ("<name> - level X") can't be renamed.
- The title is plain text, one line, up to 60 characters.
- Saved data: dnd5e 6.0.6 has no title field, so the title is stored on the character as a Hub flag (`flags.ashen-gate-character-hub.title`). New data only; no migration.
- Docs: `docs/perks-and-modifiers-architecture.md` §1.7 now describes Quest Log's item rewards and Give rewards.

## 0.39.0 — 2026-10-23

Robb's request: the HP bar's effects shouldn't stack on top of each other; each should show on its own part of the bar.

- **HP bar:** current HP, temp HP and a max change now sit side by side instead of on top of each other. Left to right: your current HP (green, yellow or red, as before), then the silver temp HP stripes, then the dark empty part for missing HP, then at the end either a blue outlined part for extra max HP or the dark green cross-hatching for max HP lost. The whole bar is your normal max plus any extra max plus your temp HP, so every part keeps its true size and you can see all of them at once. When your HP goes above your normal max, the blue part fills from the left.
- A thin dark line separates neighbouring parts, so they're easy to tell apart without relying on colour. A very small part is still at least a sliver wide. When there's room at either end of a wide bar, the temp, extra or lost part also shows its own number.
- The numbers in the middle are unchanged ("18 / 35 HP (+6 TEMP) (+5 MAX)"). The tooltip and screen readers now say it in words, for example "18 of 35 hit points; 6 temporary hit points; maximum raised by 5".
- Same in Compact and in the read-only view. Double-click to edit, damage / heal and right-click work as before.
- Saved data: no change. No migration.

## 0.38.0 — 2026-10-23

Robb's request: the character's Biography in the Hub, and no "alpha" style labels anywhere.

- **Journey → Biography:** the Journey tab now has two sub-tabs, **Journey** (the accomplishments, as before) and **Biography**. Biography shows the same things as the Biography page of the standard dnd5e sheet: **Backstory** (the biography and the public biography), **Personality** (traits, ideals, bonds, flaws) and **Appearance** (the appearance text, then age, height, weight, eyes, skin, hair, gender, faith and alignment). The Hub remembers which sub-tab you had open (for you, on this computer). The arrow keys move between the two sub-tabs.
- **Editing:** the owner and the GM can type in every box and press **Save Changes** (bottom right; **Cancel** bottom left throws the changes away). The footer says **Unsaved changes** while something isn't saved, and switching tab or sub-tab or closing the Hub asks first. Text you type survives the Hub redrawing. The two biography boxes use Foundry's own text editor, so bold, lists and links are kept; if that editor isn't available they show read-only with **Open native sheet to edit formatting**. Only the boxes you changed are saved; the others are never rewritten.
- **Who sees what:** other players who can see the character (observers) see only the public biography and the appearance; never the private biography or the personality. Someone with limited access still sees only the name. Saving is refused for anyone who doesn't own the character, not just hidden.
- **Labels:** the "New · alpha" badge on the Journey, "(alpha)" in Help, the "Experimental" badge on Compact's see-through background and "Alpha:" in the module description are gone.
- Saved data: no change. The Biography is dnd5e's own data on the character; the Hub stores only the remembered sub-tab in the browser. No migration.

## 0.37.1 — 2026-10-23

- **Window title:** now **Ashen Gate | Character Hub — <character name>** instead of the same title for every Hub, so several open, minimised or popped-out Hubs are easy to tell apart. It follows the character when they're renamed (the title updates when the Hub redraws), and a popped-out Hub's browser window shows the same title. A limited view uses the same title. The in-sheet header is unchanged. A very long name is cut with "…" by Foundry's own title bar.
- Saved data: no change. No migration.

## 0.37.0 — 2026-10-22

Robb's request: the character's name goes where "Ashen Gate | Character Hub" was, and the column below shifts up.

- **Header:** the character's name is the big heading at the top left, with a small **Level n** badge beside it. Under it, one line of muted text: species · class and subclass · background (for example "Elf · Fighter Champion · Sage"). Each part still opens its item when clicked; a multiclass character shows each class with its level ("Fighter 3 Champion / Wizard 2 Evoker") and the total in the badge. Compact, ⋯, version and Help stay where they were; in a narrow window they wrap under the name. A very long name ends in "…" only when nothing else fits, and hovering it shows the whole name.
- **Window title:** now says **Ashen Gate | Character Hub** instead of "Player Character: <name>", so the module is still easy to spot (also when popped out or minimised).
- **Character column:** the name and the class / species / background chips are gone from it (they're in the header now), so the Cinders, the inspiration star and the art sit higher. Compact gets the same header. The limited view shows the name in the header and keeps its portrait card, without repeating the name.
- Saved data: no change. No migration.

## 0.36.0 — 2026-10-22

For Profession Ledger 0.29.0 (each profession's own word for recipes, effect notes on activities). Display only; with an older Ledger the Hub looks as before.

- **Ashen Gate → Professions:** when the Ledger names a profession's recipes, each profession line also says how many it knows in that word, for example "20 XP · 5 XP to level 4 · 3 formulas" or "1 composition". The total under the list still says "known recipes", since it mixes professions. The Overview's Professions box is unchanged.
- **Effect notes:** a recipe item that is an activity (a performance, a composition…) and has an effect note shows an **Effect** badge in the item lists. Hover it for the note; the same text is in the row ("Effect (the GM decides): …", under **More** when the item also has a description). Up to 400 characters are shown. Craft recipes and other items never show it. Nothing is automated: the GM decides the effect at the table.
- **For partner modules:** `knownProfessions` rows also carry `recipeLabel` ({singular, plural}), `recipes` and `recipeCount` ("3 formulas") when the Ledger has `recipeLabel`.
- **Saved data:** nothing new is stored and nothing is migrated.

## 0.35.0 — 2026-10-22

For the new Artistry profession (Profession Ledger 0.28.0, Skill Trees 0.21.0).

- **Professions box:** Artistry shows like every other profession, "Artistry - Tier - Level n", with a palette icon. The Hub reads the Ledger's list as before, so any new profession (crafting, gathering or creative) appears without a Hub update.
- **Skill Trees:** a profession with several skill trees (Artistry: Music, Performance, Visual Arts, Literary Arts) is one entry with one shared points line ("1 point to spend, 3 of 4 points spent"), how many points each tree uses, and a tab per tree (arrow keys work; the tab you pick is kept while the Hub is open). With Skill Trees 0.21.0 the Ashen Gate → Skill Trees tab shows Skill Trees' own view, which already does this; the Hub's own summary (used when that view isn't offered) now matches it. With an older Skill Trees, trees that share points show the points once ("Shares points with …").
- **Locked perks:** the summary lists them with Skill Trees' own reason, word for word (for example "Needs Performance proficiency" or "Needs profession level 5 (now 4)"). The Hub doesn't check proficiencies itself.
- Repo check: `scripts/validate-content.mjs` accepts activity recipes (`kind: "activity"`) without ingredients or a result item; craft recipes still need their ingredient list.
- Saved data: no change. No migration.

## 0.34.0 — 2026-10-22

Robb's playtest feedback: less scrolling, conditions next to marks, the quick bar under the Hub.

- **Name row:** the character's name, then small chips for class and level (one per class when multiclassed, each subclass right after its class), species and background, each with the item's icon (click opens it; the tooltip names it), the Cinder chips, and the inspiration star last. Compact shows subclass, species and background as icons only. The four cards and the level line are gone.
- **Level up, Restore backup… and Configure…** moved into the header's **⋯** menu (Full and Compact); dnd5e's level-up flow and its advancement window are unchanged.
- **Art and slots** sit right under the name row; the rings and trinkets row sits directly under the art (no gap), and an empty *Other equipped* is left out in Full too. Full's doll gives way before the column scrolls, as Compact's does. At 1240 × 800 the whole character column (name to abilities and saves) fits without scrolling; Compact fits at 500 × 780 and 420 × 700.
- **Conditions** are a strip right under Mastery & marks (the Conditions box is gone): **Self** / **Target** (your targeted tokens, the same targets as marks), a condition (dnd5e's conditions that are Foundry status effects; never an id Foundry refuses), **Apply**. Conditions on the character and the current targets show as chips with ✕. Real status effects (Foundry's `toggleStatusEffect`), so the token and the Utilities Condition Manager show them. The GM can change anyone; players follow Utilities' condition rules (its `api.conditions`: controllers, owners manage, unlocks), or without Utilities only their own characters; tokens not linked to a character are left to the GM. Checked in the action, not only by hiding buttons.
- **Quick bar drawer:** the quick bar opens under the whole Hub, below the Ashen Gate buttons, with **Quick bar** at the end of that bar (Compact has the bar with just that button). Open, the window grows by its height; closed, it takes no room. Keys 1-9 / 0, drag onto slots, right-click / Delete with Undo and Escape work as before (the keys also work while it is closed).
- **Journey:** the GM's **Add entry** said "Write something for the entry" whatever was typed: the add and edit forms were `<form>`s inside the sheet's own form, which the browser drops, so the text could not be read. They are plain groups now, with a labelled **Entry** box and the date.
- **Professions** (Overview) list the tier too, with an icon per profession: *Archaeology - Apprentice - Level 1* (from the Ledger's `getProfessions`; any other profession gets a toolbox icon).
- **Coin icons** in the Inventory purse and the party purse summary: the same metal look as Utilities 0.24.0, from the Hub's own CSS.
- **Filters** opens aligned to its button's right edge and is moved back inside the window when it would run past an edge (all tabs, Full, Compact, popped out); the ⋯ and Appearance menus too.
- **Compact:** no Strain row (the Strain pill beside HP stays; the GM's pill has − / +) and no second Strain chip in the marks strip.
- Saved data: no change (no new flags or settings; the quick bar slots are the same flag). No migration.

## 0.33.1 — 2026-10-22

- **Compact fits its window again.** At the default Compact size the ability and save row sat half under the bottom edge (the column was about 120 px taller than its box). Now the rings and trinkets row sits under the art, the paper doll shrinks (down to small slots) before the column has to scroll, Cinders and **Configure…** share one row under the name, an empty **Other equipped** is left out (it shows as soon as something is in it), the marks strip says just "No marks" (where marks come from is in its **?** button) and the quick bar keeps its ten slots on one row. In a very small window the column still scrolls on its own; header and hotbars stay put.
- Full is unchanged. Saved data: no change. No migration.

## 0.33.0 — 2026-10-22

UI cleanup (audit `docs/ui-audit-2026-10.md`, decisions `docs/ui-audit-decisions-2026-10.md`). Same features, less crowding, better keyboard use.

- **Header:** only **Compact** / **Full**, a **⋯** menu (**Appearance…**, **Pop out** / **Pop in**, **NPC Codex**, **Open native sheet**) and the version with **Help**, in Full, Compact and the limited view. The Compact header no longer wraps; its see-through background (experimental) is now in **⋯ → Appearance…** (Compact only). **Level up** and **Restore backup…** moved under the character's name.
- **Tabs:** the rail on the right keeps its icons and now shows each tab's name under the icon (icons only between about 900 and 1000 px wide). **GM Setup** carries the GM marker. The rail and the Ashen Gate sub-tabs are one Tab stop each: the arrow keys move, Enter opens. The Journey tab is just "Journey".
- **One name per module:** the Ashen Gate sub-tabs are Professions, Skill Trees, Cinders, Renown, Quest Log, Locations, Headquarters (were Perks, Quests, Base), the same as the bottom quick bar; every quick-bar button now shows its sub-tab (Headquarters and Locations opened their window; their Open button is in the panel). Player visibility labels follow.
- **Lists:** Combat, Magic and Features keep one frozen row: search and **Filters (n)**, which opens Group, Sort and the filter chips; **Clear filters** sits beside it while any is on. Magic keeps its spell levels under it. Inventory's purse and weight bar scroll with the list. Magic shows four fact columns; the level and school sit beside the spell's name. Combat's column reads "Damage / Healing".
- **Keyboard and screen readers:** focus stays on the button you used after the Hub redraws (tabs, chips, Compact / Full, menus); a menu that opens takes the focus and gives it back to its button when it closes (also on Escape). **Configure…** under the name opens dnd5e's settings for any stat (as right-click does). **Change portrait…** / **Change token art…** on the art (double-click still works). **Delete** or **Backspace** on a quick-bar slot clears it (with Undo). Buttons are announced by their visible label. Fold toggles update their tooltip. The Mastery & marks help is a "?" button.
- **Narrow Full window** (under about 900 px): tabs first, and the character folds to its name, HP and AC until **Show character** (remembered for you in this browser).
- **Saving throws** roll from the ability tiles only (the Overview list was a duplicate); a proficient save shows a filled dot, not just colour.
- **Confirmations:** removing a companion, deleting a Journey note, restoring a backup, detaching a socketed item and a Push with guaranteed Backfire ask with **Cancel** as the default button. GM Setup's Player visibility **Quick set** now asks first.
- Clicking a Cinder under the name in Compact opens Full for that window only; your Compact choice stays saved.
- Ashen Gate summaries list every location and stash item (no "and N more"). Partner links are kit link buttons.
- The Inventory banner uses the kit display font; the "absent" line is muted, not red. Item icons follow the kit size tokens (larger in Comfortable). Help is grouped into folding sections.
- General Manager's skin is no longer copied onto the Hub on each redraw (it reaches the Hub through the page; a popped-out Hub still gets it).
- Saved data: no change. No migration. New per-browser UI memory only (`ag-ui:ashen-gate-character-hub:<user>`: the narrow-window fold). The `perks`, `quests` and `base` visibility keys are unchanged.

## 0.32.1 — 2026-10-22

- Shared UI kit 2.2 (no visible change).

## 0.32.0 — 2026-10-22

- **Compact keeps your stats.** Compact (the narrow view with the quick bar) now has, under the art and slots: **Initiative / Speed / Proficiency** on one slim line (click Initiative to roll; AC joins the line when the slots are hidden), the **hit dice, Short Rest and Long Rest** buttons and the **exhaustion** − / + next to the HP bar, **Strain** (players: the read-only pill beside exhaustion; GM: the row with − / +; same Player visibility switch, nothing without Cinders), the **six abilities** in one row (modifier, score, save underneath; proficient saves highlighted; click to roll a check or a save, right-click to configure) and the **conditions** as a slim chip line with +. Same actions and permissions as Full.
- **Mastery & marks in Compact** above the quick bar, as in Full: target count, Strain chip, and the marks wrapping to the left.
- When the column is longer than the window it scrolls inside itself; Mastery & marks and the quick bar stay at the bottom, and the scroll position survives live updates. Nothing scrolls sideways.
- The **Cinder chips** show under the name in Compact too; clicking one switches to the Full Hub at Ashen Gate → Cinders (Compact has no tabs).
- Full mode is unchanged.
- Saved data: no change. No migration.

## 0.31.1 — 2026-10-22

- **Locations 0.18.0.** Locations was renumbered from 1.18.0 to 0.18.0 (the suite is pre-release). The Hub already finds Locations' panel and embedded view by its API, never by version number, so nothing changes in play; the README's partner table now says so, and a test covers a Locations reporting 0.18.0.
- Saved data: unchanged. No migration.

## 0.31.0 — 2026-10-22

- **Combat lists like the others.** Combat now groups by main category: **Combat** (weapons, armor, shields), **Professions** (tools, and items whose Ashen Gate id starts with PROF-, REC- or MAT-), **Consumables**, **Features** and **Trinkets** (everything else, e.g. rings and wondrous items), each with a count. **Group** (Category, Action type, No groups) and **Sort** (Name, Equipped first, Action type, Has uses first) are remembered per user like Magic and Features. Filter chips: an action type, **Hide unequipped** (weapons and gear carried but not equipped), **Has uses**, **Uses left**, **Clear filters**. Favourites show at the top. The search, selects and chips stay at the top of the list while it scrolls.
- **Appearance, per player.** A new **Appearance** button in the Hub header changes how the Hub looks only for the user who changes it. With General Manager it lists Manager's skins (**GM default** follows the world default) and the size on this device, and links to My Appearance; Manager stores the choice. Without Manager: **Dark / Light** and **Compact / Comfortable**, saved for that user. The GM sets the starting look for everyone in **GM Setup → Hub appearance** (used while Manager's appearance is not active); with Manager the world default stays in General Manager.
- **NPC Codex from the Hub.** With General Manager, an **NPC Codex** button in the header opens Manager's Codex window (the NPCs revealed to you). The GM always gets it; players only while the GM shares the Codex in General Manager. Nothing from the Codex is kept in the Hub.
- **Cinders in the character header.** Under the name, each Cinder the character bears shows as a small orb with its name; click it to go to Ashen Gate → Cinders. The Cinders button on the bottom quick bar stays. The mini orbs (header and Cinders panel) use Cinders 0.9.0's look: the art sits on the Strain-coloured orb as a glow and turns slowly (one turn in about 90 s), unless Cinders' **Rotate Cinder art** (GM) or **Rotate the art on this device** is off, and never with reduced motion. A Cinder without art keeps the default orb, which does not turn.
- **Open skill tree** next to the Cinders title in Ashen Gate → Cinders opens Skill Trees for the character, at the Cinder's own tree when it bears one Cinder. Players need Perks shown to them.
- **Journey: first bind.** The first time a character is bound to a Cinder, the Journey gets "Bound to the <name> Cinder". Recorded by the GM's client when Cinders announces the bind (its `ashenGateCinder.changed` hook), once per Cinder: a reload, a level restore or a repeated announcement never adds a second entry, and an entry the GM hid stays hidden. A Cinder moved to another character (transfer) is not recorded.
- Saved data: new settings `look` (user scope) and `lookDefault` (world), `listSort.combat` in the existing client setting, and a new Journey entry type `cinder`. Nothing existing changes. No migration.
## 0.30.0 — 2026-10-22

- **Fix: Group and Sort did nothing after using the filters.** Three ways it could happen, all fixed: (1) with a slot or Other menu open, clicking the Group or Sort list redrew the Hub to close the menu, which replaced the list that had just opened, so the choice went nowhere; now the menu closes without a redraw from under a list or a box you click. (2) Foundry keeps one sheet per character, so the Magic and Features filters, search text and an open menu survived closing the Hub; they now start fresh each time the Hub is opened. (3) A redraw that failed part-way could leave a reopened Hub without its change listener (Group, Sort, GM Setup switches); it is now attached first.
- **Weapon mastery on weapon cards** (Combat and Inventory): the mastery name from dnd5e (e.g. Vex, Cleave). Hover shows dnd5e's own rules page for it; dimmed when dnd5e says the character can't use that mastery.
- **Professions** under Proficiencies (Overview): each profession the character knows and its level, from the Profession Ledger. Click it to show Ashen Gate → Professions. Not shown without the Ledger, or when Professions is hidden from players (GM Setup → Player visibility, or the Ledger's Player Access off).
- **Strain beside hit points:** players see a compact read-only pill next to hit dice and exhaustion (small bar, value, band; hover for the Push Backfire chance) instead of the separate row. The GM keeps the row with − / + under hit points. Same switch as before (Strain bar in Player visibility); nothing without Cinders.
- **Initiative and Proficiency** numbers are larger and centred in their boxes.
- **Mastery & marks is a strip, not a fold-away section:** the target count, Strain and the "Mastery & marks" title sit together in the right corner; the marks and the marks you placed wrap onto more lines to the left of them, never under or over them. The quick bar still folds.
- **Header:** version and Help stay together at the far right. **Help** ends with an About list: the Hub's version and each active Ashen Gate module's version.
- **Frozen search and filters:** Combat (search), Inventory (search, Character / Party stash, attunement counter, coin purse and a new weight bar), Magic (search, Group / Sort, spell levels, filters) and Features (search, Group / Sort, filters) stay at the top while the list scrolls.
- **Weight bar** beside the coin purse: dnd5e's carried weight against its carrying capacity, in dnd5e's weight unit; red when over capacity.
- Saved data: no change. No migration. The old fold state of Mastery & marks (client setting `collapsedSections`) is no longer read.

## 0.29.5 — 2026-10-22

- **Fix: Level up now opens dnd5e's advancement windows (hit points, features, subclass, ability scores) the way the dnd5e sheet does.** The Hub is a Foundry sheet, not a dnd5e one, so it opened dnd5e's window with a plain render, which always lands in the main Foundry window. It now asks Foundry to open it in the Hub's own window (as dnd5e's sheets do), so it also shows when the Hub is popped out. Same for **Add a class**.
- Unchanged: the class level only goes up when you finish dnd5e's window. Closing it, or an error opening it, leaves the character as it was and makes no backup copy. Finishing it makes the "<Name> - level X" backup for the GM.
- When dnd5e itself reports nothing to ask (or the world turns dnd5e advancements off), the class level goes up by one directly, as on the native sheet; the browser console notes "dnd5e has no advancement steps for …".
- Saved data: no change. No migration.

## 0.29.4 — 2026-10-22

- **Fix: the Hub jumped back to the top when it redrew.** Any change to the character (the GM changing Strain, say) redraws an open Hub, and each redraw put the lists back at the top. Now every scrolled area (the tab's list, the character column, embedded module views) keeps its place, remembered per tab: a live update never moves a player reading Inventory, Magic or Features, and switching back to a tab returns to where you were. The search text stays, and a field you are typing in keeps the focus, the caret and what you typed. A redraw that would show exactly the same thing is skipped.
- **Fix: the Compact see-through slider seemed to do nothing.** The slider did fade the window background, but the character column on top of it (most of the Compact window) kept an opaque background, so almost nothing changed on screen. That column now fades with the window; the art, HP box, slots, header and text stay solid. Still per user, and kept after a redraw or reopening.
- **Fix: quick bar keys did nothing.** The slots showed 1-9 and 0 but no key was ever bound, so the number keys went to Foundry's macro bar. Now **1-9 and 0** use the quick bar slot of the Hub in front while a Hub with its quick bar is open (also a popped-out Hub, from its own window or the main one). With no Hub open the keys work Foundry's macro bar as before. Never while typing in a field. Change the keys in **Configure Controls → Ashen Gate | Character Hub**. The Help lists them.
- Saved data: no change. No migration.

## 0.29.3 — 2026-10-22

- **Fix: GM Setup switches did nothing after the Hub had been closed and opened again.** Foundry builds a new window each time a closed Hub is opened, but the Hub attached its change, drop, right-click and double-click listeners only the first time per character. Now they are attached to each new window. Ticking a part in **GM Setup → Player visibility** saves at once; your Hub and any player's open Hub redraw without a reload. The pet limits, the Compact see-through slider and other in-Hub inputs (quantity, currency, companion fields), item and companion drops, right-click unequip and double-click on the art or HP bar work again after reopening too.
- If a visibility change is refused, a short notice says why and the checkbox goes back to the stored value.
- Saved data: no change. No migration.

## 0.29.2 — 2026-10-21

- **Fix: Escape closed the whole Hub when a menu was open.** With a slot menu open (click, right-click or the ⋯ button on an equipment slot, or an Other row's ⋯), pressing Escape now closes only the menu; the Hub stays open. This works wherever focus is (after a mouse click it is on the page, not the Hub) and in a popped-out Hub as well as the main window.
- The same goes for the Hub's other popovers and inline editors: the HP editor (closes without applying), the conditions **+** list and a Journey entry being edited (Cancel). With several open, Escape closes the innermost first. With nothing open, Escape closes the Hub as before. Foundry dialogs (level-up, restore and the like) keep their own Escape.
- A click outside a menu still closes it, in the main window and in a popped-out Hub.
- Saved data: no change. No migration.

## 0.29.1 — 2026-10-21

- **Fix: level backups no longer show as characters in Companions.** GM Setup → Companions lists only real characters; "<Name> - level X" backup copies are left out, and a backup's own Companions tab has no GM pet-limit control.
- The data layer refuses a backup copy as a pet-limit override target, as a linked companion, or as the character whose companions change ("That is a level backup copy, not a playable character."). Normal characters work as before; backup and restore are unchanged.
- Saved data: no change. No migration.

## 0.29.0 — 2026-10-21

- **Window opacity removed.** The see-through slider is gone and the Hub window is always opaque. An opacity a user saved before (client setting `windowOpacity`) is no longer read, so it changes nothing and can't cause an error. It just sits unused in that browser's local settings. Ashen Gate | Locations has its own, separate opacity, which is unchanged.
- **Compact mode.** The **Compact** button in the Hub header switches to one narrow column: the character's name, the art with its equipment slots around it (AC shield and Portrait/Token art toggle included), the HP bar with damage/heal, and the quick bar. No tab rail, no middle content, no marks bar, no hit dice, abilities or conditions. The button then reads **Full** and switches back. The window shrinks to a narrow size and gets back the size it had in Full (and the other way round) while it stays open. Comfortable size scales both.
  - Everything in the column works as in Full: double-click the art to change portrait/token art, slot clicks, right-click and the ⋯ menu, the HP editor (double-click or Enter on the bar), damage/heal and the quick bar (click to use, drop to fill, right-click to clear with Undo).
  - Remembered per user (client setting `compactMode`) and used when a Hub opens. The GM opening a player's Hub gets the GM's own choice. Player visibility still applies: hidden equipment slots or hotbars stay hidden in Compact.
- **Compact see-through (optional, experimental).** In Compact only, a small slider next to **Full** fades the window background from 100 % (opaque, the default) down to 60 %. Below 60 % the name and header text, which sit straight on the window background, lose too much contrast over a bright map. Only the window background fades: the HP box, equipment slots, quick bar slots, header and all text stay solid. Full is always opaque. It's per user (client setting `compactOpacity`) and kept separate (one setting, one CSS variable `--agch-compact-alpha`, `scripts/compact-opacity.mjs`), so it's easy to remove if it doesn't work out.
- **Ashen Gate quick bar moved to the bottom.** Professions, Skill Trees, Cinders, Renown, Quests (show that module's view in the Ashen Gate tab), Headquarters and Locations (open that module's window) are now a thin bar along the bottom edge of the Hub, under the hotbars. The right rail keeps only the main sections. Behaviour is the same: players only get buttons for parts shown to them, the GM sees missing modules greyed, labels are Foundry tooltips (shown above), and they're ordinary buttons for the keyboard. On narrow windows the bar wraps onto more lines. Hidden in Compact.
- **Pop out.** A **Pop out** button in the header uses Foundry V14's own ApplicationV2 detach (`detachWindow`) to move the Hub into its own browser window, e.g. a compact quick bar on a second screen. In the popped-out window the button reads **Pop in** and brings it back (`attachWindow`). Closing the Hub works as usual. If Foundry doesn't offer detaching for the window, the button isn't shown.
- Migration: none needed. The old opacity value is ignored, `compactMode` defaults to Full and `compactOpacity` to opaque.

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
