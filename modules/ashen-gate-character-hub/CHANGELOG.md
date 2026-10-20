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
