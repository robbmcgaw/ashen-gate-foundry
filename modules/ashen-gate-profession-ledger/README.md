# Ashen Gate | Profession Ledger

Module ID `ashen-gate-profession-ledger` · Foundry V14 · dnd5e. Owns each character's profession progression (XP, level) and known recipes, stored on Actor flags. Open it from **Actors sidebar → Professions** (players when **GM Setup → Player Access** is on).

## Tabs

- **Individual:** a character's crafting bench: professions with level and XP, materials, recipe items to **Learn**, and known recipes to **Craft**. If a craft needs a party member's materials, that character's owner gets an Allow/Decline popup (the GM's client coordinates; any decline cancels). The GM can **Adjust XP** (add, subtract or set, with a reason) and sees a per-profession XP history.
- **Party:** all party members' materials and recipes, by player or by profession.
- **Recipe Catalog:** recipes in folders by profession. Players see only recipes the party has found or learned; the GM sees all, with drafts marked. A GM-only **Catalog tools** panel holds recipe import (Ledger JSON), the Open General Manager shortcut and the draft visibility guide.
- **Gathering:** one lead and one check per gathering node (from Locations, or ad-hoc). The GM starts it, or a player requests a node and the GM approves. Helpers with tools give advantage. Common bundle on success, rare on success by 5+, failure exhausts the node. Chat card for everyone.
- **GM Setup** (GM): party roster, tool and check mapping (profession → tool, gathering profession → skill), Player Access.

XP is never automatic: the GM awards it from the Individual tab or from the **Award XP** control on gather and craft chat cards (with **Undo award**). The `ashenGateLedger.xpOpportunity` hook fires for each card.

A *Professions* tab is added to the character sheet when Tidy5e Sheet is active.

## Relation to other modules

Independent: it opens without any other Ashen Gate module. General Manager imports recipes (`REC-*`), materials (`MAT-*`), professions (`PROF-*`) and crafted items (`ITEM-*`); a craft copies the recipe's `result_item_id` world Item. A recipe may set `tool` (dnd5e tool key, tool Item UUID or name) or `workstation`; otherwise it needs its profession's tool, and crafting rolls a tool check shown on the card. Gathering nodes come from Locations when it is active. Skill Trees reads but never changes profession progress; profession perk choices stay here.

## Public API

`game.modules.get('ashen-gate-profession-ledger').api`: `open`, `playerAccess` (`ag-player-access/1`), `getProfessionProgress`, `getKnownRecipes`, `inspectProfessionPerkChoices`, `learnRecipe`, `craft`, `awardProfessionXP` / `adjustProfessionXP` / `getProfessionXPHistory` (GM), and `gathering.{nodes, start, resolve, cancel, request}` (start/resolve/cancel are GM-only).

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-profession-ledger/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-profession-ledger-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
