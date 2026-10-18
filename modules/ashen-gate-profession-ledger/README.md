# Ashen Gate | Profession Ledger

Module ID `ashen-gate-profession-ledger` · Foundry V14 · dnd5e. Owns each character's profession progression (XP, level) and known recipes, stored on Actor flags.

- **Individual:** a character's crafting bench: professions with level and XP, materials, recipe items to **Learn**, and known recipes to **Craft**. If a craft needs a party member's materials, that character's owner gets an Allow/Decline popup (the GM's client coordinates; any decline cancels).
- **Party:** all party members' materials and recipes, by player or by profession.
- **Recipe Catalog:** recipes in folders by profession. Players see only recipes the party has found or learned; the GM sees all, with drafts marked.
- **Gathering:** one lead and one check per gathering node (from Locations, or ad-hoc). The GM starts it, or a player requests a node and the GM approves. Helpers with tools give advantage. Common bundle on success, rare on success by 5+, failure exhausts the node. Chat card for everyone.
- **XP:** the GM awards profession XP from the Individual tab or from the **Award XP** control on gather and craft chat cards. Nothing is automatic; the `ashenGateLedger.xpOpportunity` hook fires for each card.
- **GM Setup:** party roster, tools and checks (profession → tool, gathering profession → skill), Player Access, catalog import.
- **Tidy5e:** a *Professions* tab on the character sheet (registered only when Tidy5e Sheet is active).

General Manager imports recipes (`REC-*`), materials (`MAT-*`), professions (`PROF-*`) and crafted items (`ITEM-*`); a craft copies the recipe's `result_item_id` world Item. A recipe may set `tool` (dnd5e tool key, tool Item UUID or name) or `workstation`; otherwise it needs its profession's tool, and crafting rolls a tool check shown on the card. API: `api.gathering.{nodes, start, resolve, cancel, request}` (start/resolve/cancel are GM-only). Manager is optional; the Ledger opens without it. See `CHANGELOG.md` for changes.
