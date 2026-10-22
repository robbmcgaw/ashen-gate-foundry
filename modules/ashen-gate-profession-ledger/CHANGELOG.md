## 0.26.1 — 2026-10-22

- **Profession cards:** the name, **Level** and **Draft** badges stay on one row again, down to the narrow Character Hub embed (also in the Individual tab and the Tidy5e tab, Compact and Comfortable). The badges are slimmer and always stay together; a name that doesn't fit ends in "…" and shows in full on hover. On a very narrow card the badges move together to their own row, right-aligned, instead of wrapping one by one. The tier and XP line no longer overlap on a narrow card. Layout only: nothing shown changed.

## 0.26.0 — 2026-10-22

UI cleanup (October 2026 audit, PL-02 to PL-13). No setting, flag or id changes; nothing to migrate.

- **Gathering (GM):** sub-tabs **Requests (n)**, **Active checks (n)** and **Start gathering**. The tab opens on Requests when one is waiting; new requests and checks no longer push Start gathering down the page. The last result is in Active checks. Each request is a card with the reason above **Decline** (left) and **Approve** (right). The ad-hoc **Exotic candidates** picker is a closed section that counts the chosen ones; the gathering rules sit in a closed "How gathering works" section; the draft tick box reads **Use draft materials anyway**, with the explanation underneath.
- **Gathering Nodes:** **Edit** and **New node** open the editor in place of the list (**All nodes** goes back to where you were). The editor is grouped into Basics, Check, Materials and Node test (closed). **Cancel** and **Save Changes** (and **Cancel** / **Apply import** for a node file) are in the window footer, with "Unsaved changes"; Cancel or closing the window asks before dropping edits.
- **GM Setup:** sub-tabs **Party**, **Tools and checks**, **Gathering & crafting** and **Player Access**, all saved with the one **Save Changes**. **Cancel** now discards and stays on GM Setup. The baseline file import and export are in a "Baseline file" section; **Apply baseline** is the primary button of its preview and says it saves at once.
- **Recipe Catalog (GM):** the Catalog tools card is gone. **Open General Manager** is at the end of the toolbar, the visibility guide is in the GM notice, and the older Ledger JSON import moved to a closed **Advanced: import here, or use General Manager** section at the end.
- **Profession cards (GM):** one **GM: XP** section per card with an **Award** / **Adjust** switch and the XP history (also in the Tidy5e tab and the Character Hub embed). The XP bar is the kit meter and names the profession for screen readers.
- **Keyboard and accessibility:** the tabs and sub-tabs take the arrow keys, Home and End; file imports use real buttons; "Open <name>'s view" (Party) is no longer inside a folder header; delete and discard confirmations default to **Cancel** / **Keep editing**; an unavailable gathering spot is muted by colour, not faded.

## 0.25.2 — 2026-10-22

- Shared UI kit 2.2 (no visible change).

## 0.25.1 — 2026-10-22

- **Fix — Craft dialog check:** the check picked in the Craft dialog's *Check (bonus)* list is now the one rolled and named on the craft chat card (and sent with a party craft request). Before, the choice was dropped and the default check was always rolled. With nothing picked, or a recipe with only one check, the default is rolled as before. Other Ledger dialogs already passed their form values through; no other change.

## 0.25.0 — 2026-10-22

- **Gathering Nodes tab (GM only):** gathering node templates owned by the Ledger. Each has a permanent `NODE-*` id, a name, an activity (Mining, Herbalism, Hunting, Fishing, Archaeology), gathering profession(s), a tier range, an optional check skill/tool and DC, and common/rare/exotic material tables (weighted chances adding up to 100 when a table has several materials). New node, Edit, Duplicate and Delete (with a labelled confirmation that names any Location pointing to it; ids are never reused). Grouped by activity, with search and an activity filter. GM Setup stays settings-only.
- **Roll on a template from anywhere:** Gathering → *Node template*, with a tier inside its range. A Location entry may refer to a template by `nodeId`; a deleted template leaves the Location entry in place with "Node template NODE-… no longer exists".
- **Node files:** Import nodes (preview, then Apply import) and Export, schema `ag-gathering-nodes/1` (`docs/gathering-nodes-schema.md`). Import adds new ids and updates templates you have not edited; it never removes one or overwrites your edit. `scripts/validate-content.mjs` checks `*.gathering-nodes.json` files.
- **Draft materials (GM):** the ad-hoc dropdowns, the Exotic picker and the node editor list every imported material, drafts in their own group marked *Draft*/*Unreleased*. A blocked node now says whether its material is **not imported** or **draft/unreleased**. **Use draft materials anyway** (Gathering tab, GM only) awards draft common, rare and Exotic materials for that check; a player's request on such a node waits in Requests with **Approve (use draft material)**. Players still only see released materials.
- **Hunting:** gathering nodes stored as "Skinning & Harvesting" read *Hunting* in the Ledger (stored values and ids unchanged).
- **Settings:** the Ledger's settings menu is GM-only, so players no longer see a Profession Ledger section in Configure Settings (they open it from the Actors sidebar).
- API (additive; old calls unchanged): `gathering.templates.*`, `gathering.start({templateId, tier, allowDraft})`, `gathering.approve(id, {allowDraft})`.
- **Saved data / migration:** node templates live in the new GM-only Journal *Profession Ledger (GM Data)* (flag `gatheringNodes`). On first load with Locations active, the active GM's client copies every Location gathering entry into a template once (identical entries share one; existing `NODE-*` ids kept; "Skinning & Harvesting" becomes Hunting). Locations records are never changed. Each original entry is backed up in the same flag and the GM gets a whispered note. Safe to re-run (**Copy Location nodes**): entries already copied, or deleted afterwards, are not copied again.

## 0.24.3 — 2026-10-21

- Character Hub's level-up backup copies ("<Name> - level X") no longer appear in the Party Roster picker, party lists or the Assign view, and a backup id already saved in the roster is ignored.
- Backups are refused as targets everywhere (assign, XP award/adjust, learn, craft, gathering lead/request, character panel embed) with "That is a level backup copy, not a playable character."
- Saved data: no change. No migration.

## 0.24.2 — 2026-10-21

- Repo check only: the material consent, craft confirmation and gathering check windows (custom dialogs with the kit classes) are marked as allowed for the stricter UI lint.
- No behaviour or saved-data changes.

## 0.24.1 — 2026-10-21

- Shared UI kit 2.1.0 and dialog helper: choice dialogs follow the Ashen Gate look (Cancel on the left, the choices on the right); red buttons, badges and grey text on selected or striped rows are easier to read in every skin (at least 4.5:1); a hidden empty state stays hidden; disabled list rows keep readable text.
- Unavailable exotic materials use the kit's disabled row (no local override); screen-reader labels use the kit helper.
- No behaviour or saved-data changes.

## 0.24.0 — 2026-10-21

- **Ashen Gate look (UI standard):** header reads *Ashen Gate | Profession Ledger* with the version and a small Help button on the right; tabs scroll sideways when the window is narrow, with Assign and GM Setup last and marked GM.
- **Player Access saves with Save Changes.** In GM Setup it is now a tick box like the other settings: nothing changes until **Save Changes**; Cancel (or leaving GM Setup and choosing Discard changes) puts it back. Same setting, so nothing to migrate.
- **Quality uses the item rarity colours:** Common grey, Rare blue, Exotic purple, shown as a "Quality: …" badge on gathering chat cards, the GM's last-gather note, the Exotic picker and material lists.
- Tables (Tools and checks, baseline preview, Assign) use the shared striped table with a sticky head; lists of materials, party professions and the party roster use the shared rows; counts are badges; the sort and node-source switches use the shared segmented control; empty states say what's missing and what to do next.
- Hover text uses Foundry tooltips. The disabled *Open General Manager* button says why next to it.
- Narrow windows stack the two columns based on the window's own width (not the screen's). The **Comfortable** size (General Manager → My Appearance) opens the window 1.2× larger.
- No saved data, flags or setting keys change.

## 0.23.1 — 2026-10-21

- Help opens as a dialog with a Close button instead of replacing the window content.
- Confirmations name the action (no more Yes/No) and dialogs follow the Ashen Gate look.
- Buttons: Undo award (red), Learn [recipe], Adjust XP, Add features, Import catalog, Craft; leaving GM Setup with unsaved changes asks Discard changes / Keep editing. Cancel is always on the left.
- The material consent and gathering roll windows use the Ashen Gate dialog style. No behaviour or saved data changes.

## 0.23.0 — 2026-10-21

- Shared UI kit 2.0.0: rounded compact look for shared parts, Comfortable size option (General Manager → My Appearance), shared dialog helper.

## 0.22.1 — 2026-10-21

- **Fix: Export then re-import no longer turns catalog values into baseline ones.** Export writes a list only when you (GM Setup) or a baseline file set it. Built-in and catalog lists, including catalog advantage tools (which checks never use), stay where they were after a re-import. The full table in effect is still in the file, under `inEffect`, which import ignores.
- **Fix: catalog tools are checked against dnd5e.** A Profession definition's `access` tool (name or key) that dnd5e doesn't have is ignored and reported in GM Setup → Tools and checks and in the Assign preview, the same as a baseline file. Nothing is guessed.
- **Fix: the catalog finds a definition the same way Assign does**: by its PROF id first (`PROF-TG-HERBALISM` → Herbalism), then its name. A definition whose name doesn't match a profession now has its `access` block used. Definitions that matched before still match.
- No change to crafting (no advantage from advantage tools) or Fishing (Survival). Saved data: same shape, no migration.

## 0.22.0 — 2026-10-21

- **GM Setup → Tools and checks is simpler.** One row per profession, in two groups (*Crafting professions*, then *Gathering professions*), with three columns: **Skill to Access**, **Tool to Access** and **Tool for Advantage** (gathering rows only; crafting rows show a dash). Each cell is one dropdown with *None*. Either the skill or the tool qualifies a character in Assign, as before.
- The separate Tool / Check skill columns are gone. Picking a Tool to Access also sets the profession's check tool (the craft tool when a recipe names none, and the gather tool check). For gathering professions and Enchanting, picking a Skill to Access also sets the check skill. A list with several values (from a baseline file, the catalog or an older edit) shows as **Several (n)**, with the values on hover, and is kept until you pick something else in that cell.
- Removed: the Qualifying items column, the tick-box pickers, and the “set by you / from the check tool/skill / built in” notes. **Reset** puts a row back to the default.
- Names: the table, Assign and the gathering windows show **Hunting** (was Hunting/Skinning) and no “gathering” tag. Profession keys and ids are unchanged (`huntingskinning`).
- **Fishing uses the Survival skill** by default, both for access and as its gather check skill. Fishing Tackle is no longer a built-in qualifying item.
- Carried items (0.20.0) have no UI any more. An `items` list in saved GM edits, the catalog or a baseline file still qualifies, as before. Export writes `items` only where a profession has one.
- **Advantage tools apply to gathering professions only.** Crafting checks never get advantage from them. Any advantage tools saved or loaded (baseline file) for a crafting profession are kept but ignored.
- **Fix: the window no longer jumps to the top.** Every dropdown change or button click re-draws the window, which replaced the scrolling area and reset it to the top (Gathering, GM Setup and every other tab). The scroll position, and the Tools and checks table's sideways scroll, are now kept when the same tab re-draws; switching to another tab still starts at the top.
- Saved data: same shape. One migration, run once by the GM's client (world setting `checkMappingVersion` 0 → 1): a saved Fishing check skill of “none” (the old default, which every earlier Save wrote) becomes Survival. Any other saved Fishing skill, and everything else, is kept.

## 0.21.0 — 2026-10-20

- **Gathering requests wait in a queue.** A player's **Request gather** (on a node they can see, for a character they own) no longer opens a popup on the GM's screen. It appears under **Requests** at the top of the GM's Gathering tab, with the node, helpers, and a profession or level warning when there is one.
  - **Approve** starts the gather exactly as *Start gathering check* does: the lead's owner gets the roll prompt.
  - **Decline** takes an optional reason (plain text), which the player is shown.
  - The player is told the request is waiting, then told the answer.
- One waiting request per character and a 30 s cooldown per character, checked on the GM's side. Requests are cleared when handled. A request that is no longer valid when approved (node gone, character left the party) is removed, and the player is told. The queue lives on the GM's client: after a GM reload, players are told their waiting requests were cleared.
- The GM's start button now says **Send gathering check to <player>** when the lead's owner is online (or *Start gathering check (you roll)*).
- API: `gathering.requests()`, `gathering.approve(requestId)`, `gathering.decline(requestId, {reason})`, all GM only. `gathering.request` is for players only. Players still can't start, resolve or cancel.
- XP from gather cards is unchanged: the GM still confirms each award. No saved data changes.

## 0.20.0 — 2026-10-20

- **Crosswalk items.** Each profession can list core items that qualify a character just by being carried. Items are matched by name in any case, or by an Item/Compendium UUID: the item's own, its compendium source, or General Manager's core link. Fishing's built-in qualifying item is **Fishing Tackle** (core 5.5e gear, not a tool). Assign proposes Fishing for a character carrying it, with the reason *Fishing Tackle (carried) → Fishing*. A stack of 0 doesn't count.
- GM Setup → Tools and checks has a new **Qualifying items (carried)** column (comma separated). The Profession catalog may set `access.itemsAnyOf` (additive); a catalog row without it keeps the built-in items.
- **Baseline file.** Tools and checks → **Import baseline file…** (GM only) reads a `{professions:{<key>:{qualifySkills[], qualifyTools[], advantageTools[], items[]}}}` file. It shows a preview of which rows change and which unknown names are ignored, and nothing is saved until **Apply baseline**. Layers, lowest first: built in < Profession catalog < baseline file < your edits; your edits always win, and Reset falls back. **Export current table** downloads the effective table in the same shape, so it can be imported again. Schema: `docs/profession-crosswalk-schema.md`.
- Advantage tools from the baseline file count in gathering and crafting checks, like the ones you tick. The catalog's are still only suggestions.
- API (GM only, refused for players): `crosswalk.previewBaseline(data)`, `crosswalk.applyBaseline(data, {fileName})`, `crosswalk.exportTable()`, `crosswalk.baseline()`.
- Saved data, additive: a new world setting `crosswalkBaseline`, and an optional `items` list in `checkMapping`. Existing settings read as before, and no migration is needed.

## 0.19.0 — 2026-10-20

- **New API `embed.mount(element, {actorId, mode: 'individual'})`** so a partner module (Character Hub) can show this character's Individual panel inside its own window: professions with XP and perk choices, materials, recipes to learn (Learn) and known recipes (Craft). Returns `{unmount, refresh}` and refreshes itself on changes. See the README.
- Same panel and action route as the Tidy5e Professions tab. Permission: GM or the Actor's owner; Player Access off hides it from players; XP awards stay GM-only.
- The Ledger window is unchanged. No saved data changes.

## 0.18.0 — 2026-10-20

- **New read-only API `getProfessions(actor)`** for partner modules (Character Hub): `[{professionId, name, level, xp, xpToNext, maxLevel, tier, unspentPerkChoices}]`, one row per profession the character has, sorted by name; `[]` when none. `xpToNext` is `null` at level 16. Works without Skill Trees.
- GM or the Actor's owner only; anyone else is refused (`Actor access denied`), and players are refused while Ledger Player Access is off. Players never see GM-only or reveal-gated professions. Additive only: no saved data changes.

## 0.17.0 — 2026-10-20

- **Crafting awards the real 2024 core item when linked.** If General Manager (0.26.0+, Core Links) has linked a recipe's result Item to a 2024 core item, crafting gives a fresh copy of that core item: its image, description and rules data, with the Ashen Gate name, the `ITEM-*` id, Manager's source data and the Ledger flags kept, so it stacks with earlier crafts as before.
- Falls back to today's world item when the result is not linked, the core item can't be found, or it has no quantity to stack. Never fails a craft because of a link.
- New **GM Setup → Crafted items** setting, **Award the linked core item when crafting** (default on), saved with Save Changes. No migration; nothing changes until Manager links an item.

## 0.16.0 — 2026-10-20

Assign professions (AG-F01) and a configurable profession crosswalk.
- **Assign tab (GM only).** Pick the whole party (the Ledger party, else dnd5e's Primary Party) or one character, then **Preview**. Each row shows the character, profession, the reason (e.g. "Herbalism Kit + Nature → Herbalism") and the result: *Will add*, *Already has*, or why it can't be added (no imported Profession Item, or several). Tick rows and **Add selected**, or **Add all missing**; both confirm first.
  - Reads skill and tool **proficiencies** only (not class, not carried tools).
  - Adds the imported PROF-* Profession Item as-is (same Manager flags). Never adds a profession the character already has, never changes XP, levels, Skill Tree perks or existing Items. Re-running adds nothing.
  - GM-only in the API too: `api.assign.preview({actorIds})` and `api.assign.apply({actorIds, rowIds})` refuse players.
- **Tools and checks table** (GM Setup) gets three columns per profession: **Qualifying skills**, **Qualifying tools** (any one qualifies) and **Advantage tools**.
  - Until the GM ticks their own, qualifying lists come from the imported Profession definitions' `access` (skill/tool any-of), else from the profession's check tool and skill. A catalog name that matches no dnd5e skill or tool is listed and ignored, not guessed. **Reset** returns a row to those defaults.
  - **Advantage tools:** a character proficient with, or carrying, one starts that profession's gathering and crafting checks with advantage. Only tools the GM ticks count (a catalog suggestion is shown, not applied), so unconfigured professions roll exactly as before.
  - Saved settings keep working; the new lists are added beside the old tool/skill entries. An empty list means none.
- Fishing has no default skill or tool, so nobody is proposed for it until the GM sets one.

## 0.15.0 — 2026-10-19

Exotic gathering, new tier DCs, recipes that need several tools.
- **Exotic discovery.** A successful gathering check can also find one Exotic material, on top of its Common (or, by 5+, Rare) bundle. A failed check never does. Only Exotic candidates the GM put on the node can be found; a node with none rolls nothing, so existing nodes behave as before.
  - A candidate counts when its imported definition says quality **Exotic** (never guessed from the name), it is gathered by the node's gathering profession, and its tier is not above the node's tier.
  - **Random discovery:** one d100 per success; 01–02 finds one at the default 2%. The chance is in **GM Setup → Exotic discovery** (whole percent, 0–100; 0 turns it off). With several candidates, which one is found is picked after the roll.
  - **Designated source:** a candidate set to *Designated source* has its own chance (required) and condition (any success, or success by 5+ only). A node with one uses those rules instead of the discovery roll. Still one d100 per gathering action.
  - Location and ad-hoc nodes use the same reward resolver. Everything awarded goes on **one** chat card with one XP opportunity and stacks on the lead's inventory. The card names only what was awarded; candidates, chances and the d100 stay in the GM's Gathering tab. Exhaustion is unchanged.
  - **Ad-hoc node:** new *Exotic candidates* picker: search the imported catalog, filter by gathering profession and tier (defaults: this node's), rarity Exotic. Add or remove candidates and set each one's rule.
  - An Exotic must be an imported, approved, player-visible world material, the same rule as other gathering awards.
    - The picker still lists draft or GM-only Exotics, disabled, with the fix (e.g. "Draft: approve it in General Manager first").
    - At gather time, a candidate that can't be found is skipped and the normal bundle is still given. The GM gets a whispered note and a line in the Gathering tab, e.g. "Exotic candidate X skipped: Draft: approve it in General Manager first". Players see none of this.
- **Tier DC defaults are now 10 / 12 / 15 / 18 / 20** (were 10/12/13/14/15). A DC set on the node still wins.
- **`required_tools`:** a recipe listing several tools needs all of them. The recipe row and craft window name each missing tool; the craft check offers each tool (a carried one preselected) and the profession skill. Tool names such as "Carpenter's Tools" map to the dnd5e tool. Single `tool` / `required_tool` / `tool_key` recipes work as before. Like before, a missing tool is a warning, not a block. Enchanting still defaults to the Arcana skill.
- **API:** `api.gathering.exotic` (contract `ag-ledger-exotic/1`, GM only): `materials({query, profession, quality, tier, maxTier, includeUnavailable})`, `eligibility(node)`, `percent()`, `defaultDcByTier`. `resolve()` also returns `exotic`, `exoticAward` and `awards`. Gathering nodes accept an optional `exotics: [{materialId, mode, chance, condition}]`.
- New world setting `exoticChance` (default 2). No Actor flag or saved-data changes; no migration.

## 0.14.1 — 2026-10-19

- A Locations gathering node with no material (e.g. remains you award at the table) is now a clear **award by hand** node instead of a dead option. The GM can pick it in Gathering > Start gathering and reads "No material id set: award by hand. <the node's note>"; Start stays off. Players see "The GM handles this spot at the table: ask them." with no DC or setup hints.
- No saved-data, API or permission changes.

## 0.14.0 — 2026-10-19

Groundwork for Skill Trees to handle profession perks. No visible change on its own.
- **New read API for partner modules:** `api.progression.level(actor, profId)` returns `{profId, xp, level, tier}` (contract `ag-ledger-progression/1`). An owned profession with no XP yet is level 1. GM, or a player who can see the Actor; it works with Ledger Player Access off (that setting hides the Ledger window, not profession mechanics). Never returns history or perk choices.
- **New hook** `ashenGateLedger.progressionChanged` `{actorId, profId, previousLevel, level, xp}` after every XP award, adjust, set or undo, on the GM client. It only says "look again"; Skill Trees reads the level through the API.
- When XP is lowered and Skill Trees (0.11.0+) is active, the confirmation and chat note list the Skill Tree perks above the new level instead of Ledger perk choices. Nothing is removed.
- No saved-data changes. XP, levels, history and existing API calls are unchanged.

## 0.13.0 — 2026-10-19

- **GM Setup** now holds settings only: the party, Player Access, and the tool and check mapping.
- Recipe import (Ledger JSON), the Open General Manager shortcut and the draft visibility guide moved to a GM-only **Catalog tools** panel at the top of the **Recipe Catalog** tab. Nothing was removed.
- No saved-data changes. Player views, API and permissions are unchanged.

## 0.12.0 — 2026-10-19

Take XP back.
- **Adjust XP** (GM only, Individual tab → a profession → *Adjust XP*): change by a + or − amount, or *Set to* an exact value, with an optional reason. Never below 0 or above 390 (level 16). A confirmation shows the new XP and level first, and the character's owner gets a chat note.
- **Undo award** (GM only) on a gather/craft chat card whose XP was awarded: takes the XP back and turns **Award XP** on again. Safe to click twice; the second click does nothing.
- **Lowering XP never deletes anything.** Level, XP-to-next, the sheet's profession description and the Tidy5e tab recompute. Perks held beyond the new level are kept and listed in the confirmation and chat note; known recipes above the new level stay known, but crafting them is blocked until the level returns.
- **XP history** per profession (GM only): who, how much, when, why, and which chat card, last 50 changes, stored beside the XP in the existing progress flag (additive). Players never see it. New API: `adjustProfessionXP`, `getProfessionXPHistory` (GM only). `ashenGateLedger.xpOpportunity` and existing API shapes are unchanged; `progressOf` gains `perksBeyondLevel`.
- A character holding more perks than their level used to make their saved progress read as invalid; that check is gone.

## 0.11.0 — 2026-10-19

Enchanting, and clearer gathering errors.
- **Enchanting, not Arcana.** The profession is **Enchanting** everywhere it is shown (GM Setup, folders, tabs, recipes, perks, tree names). **Arcana** is the 5e *skill* Enchanting checks by default. Old data named "Arcana" (profession features, tree names, a saved Tools and checks setting) still resolves to Enchanting; nothing is rewritten, so there is no migration.
- **Crafting can roll a skill.** GM Setup → Tools and checks has a skill for Enchanting (default Arcana; change or clear it). A craft offers that skill and, when the recipe names a tool such as Jeweler's Tools, the tool too; the tool is preselected when the crafter carries it (or is proficient), otherwise the skill. A crafter without the recipe's tool still gets the "doesn't carry this" warning. No new gating.
- **Gathering says why it is blocked, and how to fix it.** No party set, party characters missing, no lead, node without a material / exhausted / unavailable / no DC, material not imported as an approved player-visible world Item, Locations inactive or hidden from players, no owned character, no revealed spots: each shows one plain line in the GM and player Gathering tabs (and as the error on start). A player request that cannot start because of setup is refused before the GM approval popup; the GM is told the exact fix and the player gets a line without ids. Gathering rules and the Locations API are unchanged.
- Playtest pack 0.6.1 (see `test-fixtures/playtest/README.md`): `[TEST] Enchanting` with four recipes, Jeweler's and Woodcarver's Tools, Belwar holds Enchanting; the link macro also sets the Ledger party.

## 0.10.0 — 2026-10-18

Gathering, tools and GM-coordinated XP (#23).
- **Gathering** tab, rebuilt around gathering nodes from Locations 1.1.0 (feature-detected; without Locations the GM can still use an ad-hoc node). One lead gatherer and one check per node for the party. Helpers who carry a suitable tool give advantage, not another attempt. Success gives one common bundle, success by 5+ one rare bundle instead (the common one if the node has no rare material). Failure exhausts the node. DC defaults by tier: 10/12/13/14/15.
  - **GM-initiated:** pick a Location node (or fill in an ad-hoc one), the lead and helpers, then **Start gathering check**. The lead's player gets a roll popup. The GM can also **Roll for them** or **Record total**.
  - **Player-requested:** a player picks an available node at a revealed location and sends a request. The GM gets an Approve/Decline popup. The GM client checks every request against the full Locations record: an unrevealed location, a hidden or exhausted node, or a character the player doesn't own is refused.
  - **Roll:** works like the Utilities Group Check. Each skill and the profession's tool are listed with their bonus, and advantage is preset from the sheet, effects and helpers (the roller can change it). The roll is the native dnd5e one.
  - **Result:** the material goes to the lead and stacks onto what they hold. Finite nodes are marked exhausted through `markNodeExhausted`. A failed renewable node can't be exhausted in Locations, so it is blocked until the GM reloads. A chat card is posted for everyone. It never names an unrevealed location or hidden node, and shows the DC only if Locations shows it.
- **XP from chat cards:** gather and craft cards show the GM an amount and an **Award XP** button for that character's profession, one award per card. Players see the award once it is made. Nothing is awarded automatically. The `ashenGateLedger.xpOpportunity` hook fires on the GM client for each card, so XP can be automated later.
- **Tools and workstations:** a recipe can name a `tool` (a dnd5e tool key, a tool Item UUID or a name) or a `workstation`. A recipe with neither needs its profession's tool. GM Setup → **Tools and checks** maps each profession to a tool (defaults: Alchemy → Alchemist's Supplies, Blacksmithing → Smith's Tools, Herbalism → Herbalism Kit, Cooking → Cook's Utensils, …; Arcana, Archaeology and Fishing are left blank) and each gathering profession to a check skill. Recipe rows show the requirement and warn when the character doesn't carry the tool. Crafting rolls a tool check (bonus and advantage shown in the confirm window) and puts the result on the craft card. It doesn't decide success yet. Gold cost is shown, not deducted.
- New world setting `checkMapping` (defaults apply until you save). The old manual gathering form (Preview result / Confirm material award) is gone. No Actor flag changes; no migration needed.
- Playtest pack 0.4.0: Ember Salve, Iron Hinge Set and Test Dagger name a tool; Glassbloom Elixir names a workstation.

## 0.10.1 — 2026-10-19

- Actors sidebar launcher label is now "Professions" (tooltip "Profession Ledger"), in the shared two-column grid with a fixed order. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.9.0 — 2026-10-18

Professions that work at the table (#14).
- **Crafting:** the new **Individual** tab is each character's crafting bench. Every known recipe shows what it needs (✓ on hand, ↔ in the party, ✗ missing) and what it makes, with a **Craft** button. Crafting checks the recipe is known, the profession tier (when XP is tracked) and the materials. It then uses up the materials, adds the recipe's result item (copied from the `ITEM-*` world Item that General Manager imported, stacking if you already have one) and posts a chat card. Every step is verified first, and a failed write puts the materials back.
- **Shared materials:** when a party member has what's missing, **Craft — ask the party** pops up an Allow/Decline window on that character's owner's screen (on the GM's if the owner is offline). Any decline or timeout cancels and nothing is used. The GM's client coordinates this, so the GM must be online for shared-material crafts.
- **Learning is player-facing:** recipe items in your inventory show a **Learn** button (Ledger and sheet tab). The GM can no longer learn recipes for player-owned characters, and the API enforces it.
- **XP is visible:** the GM awards XP from a control on each profession card in a character's Individual view. The card shows level, an XP bar, "+N XP" and XP to the next level; the player and GM get a whispered chat note. XP stays on Actor flags (unchanged format) and is also written into the profession feature's description on the character sheet.
- **Players see their own stuff:** a character's own materials and professions now show even when their source record is still a draft. Only GM-only or reveal-gated records stay hidden. Draft recipe items are hidden from players entirely, and the GM sees them marked "Draft — hidden from players".
- **Party** tab: all party materials (who holds what) and party recipes, by player or by profession. **Recipe Catalog**: folders by profession, the same recipe row as everywhere else. Players see what the party has found or learned; the GM sees everything, with drafts marked. Raw IDs are never shown to players.
- **Tidy5e sheet:** a **Professions** tab with the same professions, XP, Learn and Craft (registered only when Tidy5e Sheet is active).
- Removed the Materials, Recipes, Recipe Learning and Crafting Planner tabs (merged into the above; old `api.open({view})` names still work). Tab content now uses the shared UI kit (`ag-btn--primary`, `ag-card`, `ag-badge--*`, `ag-toolbar`, `ag-footer`, …) and kit tokens only, so it follows every General Manager skin, including light ones. The old hard-coded dark palette in `ledger.css` is gone.
- No changes to Actor flag formats or settings; no migration needed. New: crafted items carry `flags["ashen-gate-profession-ledger"].craftedFrom`; the module uses a socket (`"socket": true`).

## 0.8.1 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

## 0.8.2 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Window shell only in this release (header, tabs, buttons). Tab content styling is unchanged.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- The Actors-sidebar launcher buttons now match the Manager and Location Builder buttons in the Items sidebar, with padding inside the sidebar edges.

## 0.8.0 — 2026-10-18

- Players: **Recipes** and **Recipe Learning** are now one **Recipes** tab (#5). *Known by the party* lists every recipe learned by a roster character, who knows it and its ingredients; only those characters can craft it. *Found, not yet learned* lists recipe items in party inventories and who holds them; the holder's owner gets the Learn button.
- "Party" here means roster characters the player can see in the Actors sidebar (at least Limited permission); only their names, known recipes and held recipe items are shown. A recipe's details are shown to players only when it is approved and player-visible.
- Players no longer browse the full recipe catalog, and the Crafting Planner only lists recipes the party knows.
- GM: new GM-only **Recipe Catalog** tab (the old Recipes browser) with drafts marked "Draft — hidden from players" and a count of hidden recipes. Recipe Learning stays as a GM tab.
- Empty states explain themselves: "No recipe items in Belwar's inventory", unreleased (draft) recipe items a player holds are named, and the GM sees how many recipes/items are hidden from players.
- Recipe items are marked with a scroll icon and a "Recipe item" badge so they aren't confused with the crafted item.
- Learning still consumes the Actor-owned recipe item and requires OWNER; it now also refuses an unreleased (draft) recipe item for players in the data layer. No Actor flag format changes.

## 0.7.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.
- Fix: v0.7.0 shipped with `scripts/main.js` cut off after 68 lines (and a corrupt zip), so the module could not load. Restored the complete file.

## 0.7.2 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## v0.7.0 Alpha — coordinated build (2026-10-17)

- Removed fictional demonstration UI/API. Ledger views use actual Foundry Actors and native definition data.
- Preserved Actor XP, known Recipe, selected PERK ownership, and existing progression/recipe-learning semantics; no migration or Skill Trees changes.
- Added the pinned nine-record Profession source/import fixture, reversible real-data setup/reset notes, exact-format Foundry acceptance cases, and source-chain regression tests.
- Node/mock tests: **78 passed, 0 failed**. Live Foundry V14, multi-client, and Forge installation remain **NOT RUN**.

# Profession Ledger alpha changelog

## v0.6.2 — AG-WORK-0013 consumer permission hardening (2026-10-16)

- Ignore caller-supplied viewer in world-native definition lookups; use Foundry `game.user`. Opaque `not_found` for non-GM duplicate/type/version/lifecycle failures.
- Permit `publicForAll` only for the real GM; Observer callback errors fail closed; exact `expectedVersion` supported for GM diagnostics.
- 5 targeted local consumer regressions; 75/75 existing-plus-new tests pass. No mutable state change, compendium adapter not yet integrated, no live Foundry test.


## v0.6.1 — AG-WORK-0011 pinned definition read repair (2026-10-16)

- Read Manager v0.11.1 `flags["ashen-gate-manager"].source.definition` as the immutable, complete Recipe/Material/Item definition from an authorized native Item binding, preserving IDs, entity types, custom fields and every typed ref.
- Carry canonical Recipe `ingredients`, `profession_id`, `result_item_id`, tier and effort through the read-only catalog adapter; preserve all Material fields including `tierId`, `quality`, `priceGp`, `weightLb` and refs.
- Prefer current world source documents to stale catalog summaries; retain a nonfabricating fallback for older world Items that lack `.definition`. Unmatched IDs, duplicates, archived records, restricted draft player records and corrupted identity/ref flags cannot provide a canonical binding.
- Add Tim's pinned immutable source snapshot and Manager v0.11.1 projection helper as test-only fixtures. 70/70 Node tests; mock Foundry only, no real-world import. Two `PROF-*` required targets remain outside pinned three-record fixture.
- Do not migrate Actor flags, XP, known recipes, Item inventories, perk selections, worlds or compendiums. Optional Manager remains nonmandatory.

## v0.6.0 — AG-WORK-0011 / 0016 implementation (2026-10-16)

**Scope:** AG-WORK-0011 (Foundry Tooling) and AG-WORK-0016 (shared UI reference).

**Verified source baseline:** the actual prior ZIP in this conversation; Work Queue compatibility-report version numbers were not installable source releases.

**New:** temporary read-only canonical source-ID lookup of active native world documents; strict duplicate/archive and player access handling; a provenance-preserving, fail-closed check for imported materials and perks; Actors launcher rank cooperation; baseline --ag-* CSS token fallbacks.

**Specific authority safeguard:** Skill Trees cannot purchase Profession PERK-* using Cinder/generic tree points; Profession selection remains Ledger-owned until the Tim source contract is tested.

**Missing in this Alpha:** live Foundry 14 tests; Tim/Manager round-trip for structured Recipe/Perk data; compendium lookup; approved resolver provider version; full live Manager skin subscription. These are NOT claimed implemented.

**State migration:** none; existing settings and Actor flags are unchanged. No automatic grants or source reimports.

**Versioning:** first actual installable successor to the confirmed release, not a repackage of a claimed nonexistent 0.6.0/0.5.0 checkpoint.




## v0.5.0 — Player Access contract (DEC-0072; 2026-10-15)

- Adds independently registered GM-restricted world Boolean setting `playerAccessEnabled` and optional interoperability API `game.modules.get('ashen-gate-profession-ledger').api.playerAccess`: `contract: ag-player-access/1`, `getState()`, `setEnabled(boolean)`.
- **Existing-player-interface upgrade default: Visible**. The setting begins `true` if it did not previously exist; a GM may switch to Hidden locally in GM Setup / Module Settings or centrally from a Manager supporting the contract.
- Hidden removes the Actors launcher for non-GMs, closes rendered player windows on setting sync, and rejects public opening paths (including macro/API and direct app renders); re-enabling restores the button. GMs remain able to open and administer the module. Player permissions, record visibility and role controls still apply when Visible.
- Does not remove, migrate, reset, regrant or disable stored progression, owned Features, Items, recipes, tree layouts, gathering awards or ordinary Foundry effects. No gameplay balance or canonical schemas altered.
- Local UI enhancement: real GM Setup Player Access status + Hide/Show button, independent of Manager. Sensitive tool buttons remain separately GM-only.
- Implements approved DEC-0072 with `foundry/integration/PLAYER_ACCESS_CONTRACT.md` and Foundry development standard AG-FOUNDRY-DEV/1.4 at GitHub `7cc5895eef480e0f6e3b62db4ab07d9e91616b5e`; `foundry.folder_path` remains Manager/content-author responsibility.
- Automated tests: **43 passed; zero failed**. No live Foundry V14 or multi-client test, no UI screenshots. The manager's centralized panel is a **separate build** and must be tested after Borris releases it.
## v0.4.0 — Actor Profession progression, Recipe Learning and Gathering (2026-10-15)

- Tim handoff: Actor-owned Profession XP in Ledger; 1–16 levels, 5/8/.../47 per-level XP costs, 1 perk selection per level, tier gates at 1/4/7/10/13. GM XP award; no independent Skill Trees XP or premature Perk purchases.
- New Recipe Learning tab with Actor permission checks, consumable tagged `REC-*` Item quantity updates/deletion, permanent known ID tracking, duplicate prevention and best-effort transaction rollback. Learning may precede tier eligibility.
- Crafting permission requests now require the selected Actor to know the Recipe and satisfy any tracked tier requirement; planning remains read-only.
- New Gathering tab: player request, GM-configured temporary scene/eligible Profession/DC/tier/`MAT-*` reward, owner chat roll prompt, reported check preview, cosmetic GM reward spinner with reduced-motion support, explicit GM item award. No automatic XP, resource depletion, or invented profession check formula.
- Expose source-checked `getProfessionProgress`, GM-only `awardProfessionXP`, `getKnownRecipes` APIs; no `getAvailablePerkSelections` or `selectProfessionPerk` until Tim's full Perk eligibility source is verified.
- Preserve v0.3 module identity, roster/catalog setting keys, optional Manager interoperability and role-separated navigation. New Actor flags are only written on explicit confirm; no startup migration.
- Automated Node tests for progression boundary, recipe learning duplicate/rollback/delete, source visibility, gathering award/check validation, player/GM access and Planner knowledge gating. No live Foundry V14 claims.


## v0.3.0 — Foundry standard 1.3 interface pass (2026-10-15)

- Migrate GM-specific roster/import/integration controls out of player header into a dedicated, permission-restricted **GM Setup** tab; segregate demonstration under **Developer Tools**.
- Use standard `Ashen Gate | Profession Ledger` title, header version/Help, tab row and persistent bottom-right roster Save/Cancel actions.
- Add explicit unsaved roster editing guard on tab/Cancel navigation, with stable world roster state and no startup migration.
- Preserve the existing player-facing Actors launcher, recipe groups, Manager v0.2 catalog adapter, source visibility filters, and all prior stable source IDs.
- Align with DEC-0068–0071 and `AG-FOUNDRY-DEV/1.3`; Manager continues to own typed `foundry.folder_path` import placement.
- No new Profession level/XP rules, learned Recipe grants, automatic crafting or Actor writes.
- New offline GM/player/roster-navigation tests; no live Foundry claims or GitHub commit.

## v0.2.3 — Manager v0.4 compatibility + source-safety pass (2026-10-15)

- Read `ag-foundry-import/0.2` public Recipe and Material definitions directly, with typed refs and stable ID validation; retain Ledger /0.1 and Manager /0.1 compatibility. No Actor/world Item writes or automatic data migration.
- Exclude GM-only/reveal-gated/retired definitions and those depending on restricted records from public world-setting catalog imports. Filter Manager source-visibility flags when players browse World Items and Actor material inventories. Add GM badges for actual source restrictions.
- Require immutable `MAT-*` identity for already-tagged material ingredient matching; do not count mismatched tagged Items by name. Invalid/empty ingredient arrays remain unmapped and noncraftable.
- Refuse Profession-only or fully restricted Manager JSON catalog replacements. Preserve existing roster, catalog, and launch paths across module update.
- Show newly Manager-tagged `PROF-*` Actor Items without inventing XP, levels or canonical display-name mappings.
- Add synthetic Manager v0.2 fixture, 13 new Node subtests, cross-check with actual Manager v0.4 package validator. Foundry runtime test still pending.
- No game-rule revisions, no learned-recipe Item consumption, no GitHub publishing.

## v0.2.2 — Player UI and indexed-recipe navigation (2026-10-15)

- Hide Explore Demo and Manager launcher from players; reject direct player attempts to trigger those actions, including forcing demo through the public API. Keep both controls available to the GM.
- Group recipes in both Library and Planner by the existing Profession metadata. Display unmapped records under Unassigned profession; never infer missing associations.
- Add collapsible groups with per-Profession counts, Expand all, Collapse all, and live search by recipe name, Profession, tier or ID.
- Preserve recipe definitions and Actor state; no data migration. Keep Profession levels/XP unchanged while awaiting Tim’s updated package.
- New offline regression suite verifies category grouping, UI markup, player-facing restrictions and GM controls. Not yet live-tested in Foundry V14.

## v0.2.1 — Critical startup fix (2026-10-15)

- Stop calling Foundry `getFlag()` on optional / unregistered module scopes while indexing Items. Use read-only document `flags` instead, including Manager and `ashen-gate` compatibility.
- Read optional Skill Tree progress from `actor.flags` without requiring its plugin namespace to be registered.
- Try attaching the Actors sidebar launcher when Foundry is ready, as well as during directory renders.
- No migrations or world-content changes. Roster and recipe catalog are preserved as settings.
- Regression test now explicitly throws for all `getFlag` calls to reproduce the reported Foundry V14 error.

## v0.2.0 — GM roster, launch access, visibility

- GM-managed world-persistent party roster, with Save, Clear, and Select player-owned character shortcuts. Only rostered Actors contribute to non-demo party calculations; each client remains bounded by Foundry Observer access.
- Actors-sidebar **Profession Ledger** launcher for GM and players using Foundry render hooks; Module Settings and macro open methods remain.
- GM-only permission badges on roster characters, Individual selection/details, profession holders, material sources, recipe definitions, crafting contributions; tooltips list which player accounts have or lack Observer access. A shared recipe catalog is labeled separately from learned recipes.
- Individual view now uses an upper character row and 75/25 Professions/Materials columns, stacking responsively. Selection cards wrap text instead of clipping.
- Read-only compatibility resolver recognizes `flags.ashen-gate.entityId` for typed material/recipe/profession IDs alongside older Manager and Ledger tags.
- Added regression tests for roster selection, GM/player permission boundaries, launcher idempotence, and typed ID compatibility.

### Known limits

- Foundry v14 live test for this version is pending. The tests are simulated/node tests, not a guarantee that the launcher appears in every Foundry/Forge build.
- Crafting is a read-only plan and whisper request. Recipe ownership/consumable learning and full profession-tier/tool gating are **not yet implemented**.
- Imported Ledger catalog definitions are player-readable regardless of character learned status; do not import GM secrets there.
- Old description-only Material Items are not auto-migrated or assumed to be recognized.
