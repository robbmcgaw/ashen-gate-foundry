# Ashen Gate | Profession Ledger

Module ID `ashen-gate-profession-ledger` · Foundry V14 · dnd5e. Owns each character's profession progression (XP, level) and known recipes, stored on Actor flags. Open it from **Actors sidebar → Professions** (players when **GM Setup → Player Access** is on).

## Tabs

- **Individual:** a character's crafting bench: professions with level and XP, materials, recipe items to **Learn**, and known recipes to **Craft**. If a craft needs a party member's materials, that character's owner gets an Allow/Decline popup (the GM's client coordinates; any decline cancels). Each profession card has a GM-only **GM: XP** section: **Award** or **Adjust** (add, subtract or set, with a reason), and the XP history.
- **Party:** all party members' materials and recipes, by player or by profession.
- **Recipe Catalog:** recipes in folders by profession. Players see only recipes the party has found or learned; the GM sees all, with drafts marked. The GM gets **Open General Manager** at the end of the toolbar and the visibility guide in the GM notice. General Manager is the import path; the older Ledger JSON import is in a closed **Advanced: import here, or use General Manager** section at the end of the tab.
- **Gathering:** one lead and one check per gathering node (from Locations, a Ledger node template, or ad-hoc). The GM's material lists show draft/unreleased materials too, marked; **Use draft materials anyway** (GM only) awards them for that check. Players only see released materials. The GM starts it (**Send gathering check to <player>**: the lead's owner gets the roll prompt), or a player uses **Request gather** on a node they can see, for a character they own. The GM's Gathering tab has three sub-tabs: **Requests (n)**, **Active checks (n)** (open checks and the last result) and **Start gathering**; it opens on Requests when one is waiting. Requests wait there. **Approve** starts the check the same way; **Decline** (optional reason) tells the player. Each character can have one waiting request, with a 30 s cooldown between requests. Requests are cleared when handled, and when the GM reloads (players are told). Players can only request; starting, approving and declining are GM-only in the API. Helpers with tools give advantage. Common bundle on success, rare on success by 5+, failure exhausts the node. Chat card for everyone.
- **Gathering Nodes** (GM, 0.25.0): node templates with a permanent `NODE-*` id, activity, gathering profession(s), tier range, check skill/tool, DC and common/rare/exotic material tables. Create, edit (the editor opens in place of the list, with **All nodes** to go back), duplicate, delete, import and export them; **Copy Location nodes** copies the gathering nodes Locations already has (Locations is never changed; the originals are backed up). Stored in the GM-only Journal *Profession Ledger (GM Data)*. Schema: [`docs/gathering-nodes-schema.md`](../../docs/gathering-nodes-schema.md).
- **Assign** (GM): previews which profession features each party character qualifies for, then adds the missing ones. A character qualifies by proficiency in the profession's **Skill to Access** or **Tool to Access** (either one). Fishing uses Survival by default (access and gather check). A carried-items list (0.20.0) from older GM edits, the Profession catalog or a baseline file still counts, but has no UI since 0.22.0.
- **GM Setup** (GM): sub-tabs **Party**, **Tools and checks**, **Gathering & crafting** (Exotic discovery, crafted items) and **Player Access**, all saved together with **Save Changes** (Cancel discards and stays). **Tools and checks**: one row per profession, crafting then gathering, with **Skill to Access**, **Tool to Access** and (gathering only) **Tool for Advantage**: `advantageTools` applies to gathering professions only and is ignored for crafting. Each cell is a multi-select (0.27.0): it shows every value in effect and where it comes from (Default, From content, From baseline file, Set by GM); click it to tick values, **Clear (None)** empties it, **Done** or Escape closes it. The first skill and tool to access are also the profession's checks (the craft tool when a recipe names none; the gather tool and skill). Content names that match no dnd5e tool show as *Not matched: …*. Gathering checks use the advantage tools in effect, including the imported content's. The Tool for Advantage cell also lists **carried gear** (`advantageItems`, 0.27.0): carrying a matching item (inventory name in any case, a core UUID, or the dnd5e identifier; quantity above 0) gives advantage. Built-in: Archaeology = Calligrapher's Supplies; Fishing = carrying Fishing Tackle. **Reset to default** puts a row back to the default (a legacy carried-items list is kept). Under **Baseline file**, **Import baseline file…** reads a crosswalk file, shows which rows change, and applies it on **Apply baseline**. **Export current table** downloads the table in the same shape; only lists you or a baseline file set are written as overrides (0.22.1), the rest is shown under `inEffect`, which import ignores. Layers, lowest first: built in < Profession catalog `access` < baseline file < GM edits (GM edits always win). Catalog definitions are matched by their PROF id first, then by name (0.22.1); names are matched ignoring `[TAG]`-style tags, case and punctuation, with a few aliases (e.g. `Arcana` → Enchanting, `Skinning` → Hunting). File schema: [`docs/profession-crosswalk-schema.md`](../../docs/profession-crosswalk-schema.md).

XP is never automatic: the GM awards it from the Individual tab (**GM: XP**) or from the **Award XP** control on gather and craft chat cards (with **Undo award**). The `ashenGateLedger.xpOpportunity` hook fires for each card.

A *Professions* tab is added to the character sheet when Tidy5e Sheet is active.

## Relation to other modules

Independent: it opens without any other Ashen Gate module. General Manager imports recipes (`REC-*`), materials (`MAT-*`), professions (`PROF-*`) and crafted items (`ITEM-*`); a craft copies the recipe's `result_item_id` world Item. A recipe may set `tool` (dnd5e tool key, tool Item UUID or name) or `workstation`; otherwise it needs its profession's tool, and crafting rolls a tool check shown on the card. Gathering nodes come from Locations when it is active. Skill Trees reads but never changes profession progress; profession perk choices stay here.

## Public API

`game.modules.get('ashen-gate-profession-ledger').api`: `open`, `playerAccess` (`ag-player-access/1`), `getProfessions`, `getProfessionProgress`, `getKnownRecipes`, `inspectProfessionPerkChoices`, `learnRecipe`, `craft`, `completeActivity` (0.28.0), `meetsProficiency` (0.28.0), `professions` (0.28.0), `awardProfessionXP` / `adjustProfessionXP` / `getProfessionXPHistory` (GM), `gathering.{nodes, start, resolve, cancel, request, requests, approve, decline}` (all but nodes/request are GM-only; 0.25.0: `start({templateId, tier, allowDraft})`, `approve(id, {allowDraft})`), `gathering.templates.{list, get, check, create, update, duplicate, remove, references, resolve, playerView, preview, import, export, copyFromLocations}` (GM only, contract `ag-gathering-nodes/1`), `assign.{preview, apply}` and `crosswalk.{previewBaseline, applyBaseline, exportTable, baseline}` (GM only), and `embed.mount`.

### Professions, activities and `meetsProficiency` (0.28.0)

- `professions()` → `[{name, key, id, category}]`: the 14 original professions, then **Artistry** (`PROF-ARTISTRY`, category `creative`), then any other profession imported with category `creative`. `category` is `'crafting'`, `'gathering'` or `'creative'`. An imported Profession record declares it with `profession_kind` (`crafting` | `gathering` | `creative`) or `category: "creative"`.
- A Recipe record with `kind: "activity"` is a creative activity: no ingredients and no `result_item_id` needed. `completeActivity(actor, recipeId, {confirm})` (Owner or GM; same known-recipe and tier rules as `craft`) rolls the check and posts a chat card whose XP award works like a craft card's (flag `kind: 'activity'`; the `xpOpportunity` hook also gets `effort`). Nothing is created or used up. An activity's `required_tools` and optional `access` lists (`toolProficienciesAnyOf`, `skillProficienciesAnyOf`) are alternatives offered as checks.
- `meetsProficiency(actorIdOrActor, {toolProficienciesAnyOf?, skillProficienciesAnyOf?})` → `{ok, matched}`: whether the character is proficient in any listed tool or skill, resolved like Tools and checks (tool names or dnd5e keys, the group `Any musical instrument`, skill names or ids). `matched` lists the entries that matched, as written; an empty list is met. **Permission:** GM, or anyone with Observer on the Actor (like `progression.level`); not tied to Player Access.

### `getProfessions(actor)` (0.18.0)

Read-only list of every profession the character has, for partner modules such as Character Hub. Works without Skill Trees.

```js
game.modules.get('ashen-gate-profession-ledger').api.getProfessions(actor)
// → [{professionId: 'PROF-HERBALISM', name: 'Herbalism', level: 2, xp: 5, xpToNext: 8, maxLevel: 16,
//     tier: 'Apprentice', unspentPerkChoices: 1}, ...]   sorted by name
```

- One row per `PROF-*` Profession Item on the Actor. A profession with no XP yet is level 1, 0 XP. `xpToNext` is XP still needed for the next level, `null` at `maxLevel` (16). `unspentPerkChoices` is 0 until the Ledger has tracked XP for that profession.
- No professions → `[]`. Never returns XP history or chosen perk ids.
- **Permission:** the GM, or a user with **Owner** permission on the Actor. Anyone else gets `Error('Actor access denied')`. Players also get an error while the GM has turned off the Ledger's Player Access. Players never see GM-only or reveal-gated Profession Items (same rule as the Ledger window).

### `embed.mount(element, options)` (0.19.0)

Shows one character's **Individual** panel (professions with XP and perk choices, materials, recipes to learn, known recipes with Craft) inside another module's window, for example Character Hub's Ashen Gate → Professions. The Ledger draws it and handles its buttons through the same code as its own window and the Tidy5e tab.

```js
const api = game.modules.get('ashen-gate-profession-ledger')?.api;
if (api?.embed?.mount) {
  const view = api.embed.mount(element, {actorId: actor.id, mode: 'individual'});
  // later: view.refresh();  view.unmount();
}
```

- `element`: a DOM element the caller owns. The Ledger replaces its contents and adds the class `agl-embed`.
- `options.actorId`: the character to show. `options.mode`: `'individual'` (the only mode; `api.embed.modes` lists them). An unknown mode or a missing element throws.
- Returns `{unmount(), refresh()}`. It refreshes itself when the character's Items or flags change or Player Access changes, and unmounts itself if the element has left the page.
- **Permission:** the GM, or the Actor's **Owner** (same as `getProfessions`). Anyone else sees "Only <name>'s owner and the GM can see this." Players see "The GM has hidden the Profession Ledger." while Player Access is off. Every button is checked again when clicked (learning needs Owner; XP awards and adjustments stay GM-only). Players never see GM-only or reveal-gated records.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-profession-ledger/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-profession-ledger-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
