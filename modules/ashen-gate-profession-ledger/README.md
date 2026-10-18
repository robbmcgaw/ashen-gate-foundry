# Ashen Gate | Profession Ledger

Module ID `ashen-gate-profession-ledger` · Foundry V14 · dnd5e. Owns each character's profession progression (XP, level) and known recipes, stored on Actor flags.

- **Individual:** a character's crafting bench: professions with level and XP, materials, recipe items to **Learn**, and known recipes to **Craft**. If a craft needs a party member's materials, that character's owner gets an Allow/Decline popup (the GM's client coordinates; any decline cancels).
- **Party:** all party members' materials and recipes, by player or by profession.
- **Recipe Catalog:** recipes in folders by profession. Players see only recipes the party has found or learned; the GM sees all, with drafts marked.
- **Gathering:** player requests and GM-confirmed material awards.
- **GM Setup:** party roster, Player Access, catalog import.
- **Tidy5e:** a *Professions* tab on the character sheet (registered only when Tidy5e Sheet is active).

General Manager imports recipes (`REC-*`), materials (`MAT-*`), professions (`PROF-*`) and crafted items (`ITEM-*`); a craft copies the recipe's `result_item_id` world Item. Manager is optional; the Ledger opens without it. See `CHANGELOG.md` for changes.
