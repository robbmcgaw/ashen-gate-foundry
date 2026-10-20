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
