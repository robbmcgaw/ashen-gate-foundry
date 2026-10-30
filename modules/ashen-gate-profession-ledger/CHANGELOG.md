## 0.42.0 — 2026-10-30

Node templates never reward unreleased or missing materials.

- **What was wrong.** A node's Common, Rare and Exotic tables name `MAT-*` materials. A Location spot or template whose first Common material was draft, GM-only or not imported could not be started at all (the Start button was disabled and a player's request was refused), while a Rare material that was unreleased was dropped without a word. Sandbox node files whose materials are not in the core set therefore looked broken.
- **At roll time** (Reveal results) a saved node's tables keep only materials that are *released*: imported once, Manager status approved and player-visible. Unreleased, draft, GM-only, retired, duplicated and not-imported materials are left out of the pool, never rolled, never given. The gather itself now starts. The chances of what remains are scaled in proportion to add up to 100 again (50/30/20 with the 20 left out becomes 63/37, rounded by largest remainder, so the sum is exactly 100; one material left needs no chance; tables without chances stay equally likely). A GM note on the result says which materials were left out and how the chances changed. A success by 5+ whose Rare table is all unreleased gives the Common material, as it already did for a node with no Rare table.
- **Nothing releasable left.** If a table names materials but none can be rewarded, that success gives no reward, the row says so for the GM ("… every Common material this node lists is unreleased or not imported (…), so nothing was rewarded for it. Use Release materials… on the node in Gathering Nodes, then gather again."), it is not an error, and no hand-out is asked for. A node that lists no materials at all still means "the GM awards it by hand", as before. **Use draft materials anyway** (GM only, off by default) still lets one gather give draft or unreleased materials, never missing ones.
- **GM warning.** Each node in Gathering Nodes (list row and editor), the Gather form and a player's queued request show a visible warning naming the unreleased and not-imported materials by name (with the table each sits in, never raw ids) and the tables that have nothing releasable. The spot picker marks spots that have unreleased materials.
- **Release materials…** (GM only) on a node row, in the editor and in the warning: lists exactly the materials that node uses that are imported once but draft or not player-visible, asks "Release <n> materials?" and, on **Release materials**, sets each one's Manager source to approved and player-visible. Nothing is given to anyone, ownership is not changed, other materials are untouched, never automatic. Not-imported materials cannot be released (import them with General Manager); imported-twice or retired ones are reported. A GM-only chat note lists what was released. Because General Manager owns the record, a later import of a record that is still draft in its pack sets it back: approve it in the pack to make it permanent. API (GM only, enforced in the data layer): `gathering.templates.materials(id)`, `releasePreview(ids)` and `releaseMaterials(ids, {confirm: true})` (refused without `confirm`).
- **Import report.** Importing or previewing a node file (and `scripts/validate-content.mjs`) lists, as report lines and never errors, the materials the nodes name that this world has not imported and the imported ones that are not released. The nodes still import.
- **Players.** A template's published player view (`templates.playerView`) names only released materials.
- Gather requests are no longer held back by a material problem (the "Approve (use draft material)" button is gone; the request card shows the same warning). `docs/gathering-nodes-schema.md` and Help are updated. No saved data changes.

## 0.40.0 — 2026-10-30

GM Recipe Catalog: search, filter, group and sort like the Locations list.

- **Recipe Catalog (GM)** gets one toolbar row: search, **Filters (n)**, Expand all / Collapse all, a "Showing x of y" count and Open General Manager. **Filters** opens a second row: Profession, Discipline (Crafting, Gathering, Creative), Tier, Known (by someone, by nobody, by everyone in the party, recipe item held but not learned), Known by (a party character), Starting, Requires (tool, workstation, both, neither), Makes (item type), Type (crafting recipe, activity, enchantment) and Players (released or draft). Each shows counts that follow the other filters, then **Sort by** (Name, Profession then name, Tier, Characters who know it) with an ascending/descending button, **Group by** (Profession, Tier, Discipline, Known by character, None) and **Clear filters**.
- Search matches the name, profession, tier, what it makes, ingredients, tools, workstation, description and the names of the characters who know it. Each row's "Known by" shows the names and a count. A clear empty state with **Clear filters** shows when nothing matches.
- The choices (not the search text) are remembered per user on this device.
- Grouping by Profession keeps the profession folders with tier groups; the other groupings are plain folders that Expand all / Collapse all also open and close.
- Who knows a recipe is read from each party character's own known-recipes list. The Ledger has no group, workshop or HQ recipe knowledge, so there is no separate "known by the group" filter, and it does not record when or how a recipe was learned, so there is no "recently learned" sort or "how learned" filter.
- GM only: the list is built only for the GM. API: `api.catalogList({query, filters, sort, sortDesc, group})` returns it as plain data and refuses a player. Players' Recipe Catalog is unchanged. No saved world data changes.
## 0.39.0 — 2026-10-28

Favorite recipes and professions.

- A star on each profession card and each known recipe card marks it as a favorite for that character. Favorite professions come first in the Professions list and their folders come first under Known recipes; favorite recipes come first in their folder. Under Professions a **Favorite recipes** list shows the starred recipes (select a name to jump to its card; the star there removes it). **Favorites only (n)** above Known recipes hides the rest; it is remembered on this device.
- Stored on the character (`flags.ashen-gate-profession-ledger.favorites = {professions, recipes}`), so each character has its own. Only the character's owners and the GM can change them; the check is in the data layer (`api.setFavorite`), not only in the buttons. Only a recipe the character knows (and this user may read) and a profession the character holds can be starred, so favorites reveal nothing. Missing or malformed data is read as empty; ids that no longer exist are ignored and dropped the next time a favorite is changed. A change to favorites does not re-run the GM's recipe-preview rebuild.
- API: `api.getFavorites(actor)` (OBSERVER or GM) and `api.setFavorite(actor, {kind: 'recipe'|'profession', id, on})` (OWNER or GM). Also works on the sheet tab and the Character Hub embed (stars and ordering; the filter is in the window).
- Help: a paragraph on favorites. No other saved data changes.
## 0.38.0 — 2026-10-28

GM-applied enchantments: **Request enchanting…**.

- A Recipe with `kind: "activity"` and `gm_applied: true` (plus `bring`, `ingredients`, `effect_note`) adds an effect to an item the player already owns and makes nothing. Its card shows **Request enchanting…** instead of Craft or Complete activity, with the materials and what is on hand, **Bring: <text>**, the fee ("the GM collects it", still not deducted), the effect, and **Check: Arcana** (Enchanting's skill) even for a short recipe with no tool or station. The button is disabled with the reason when the character lacks the materials or has nothing to bring.
- **Request enchanting…** opens a dialog: the item to bring (items matching `bring` first; every other bringable item is offered under "Other items (the GM decides)" because the filter is only advisory; "None of these" settles it at the table), the effect, the materials (used only when the GM marks it done), the fee and the check roll. It posts one chat card whispered to the GMs and the character's owners. Nothing is used or made at request time.
- The card carries **Done** and **Decline…** for the GM. Done re-reads the recipe, the character's knowledge and inventory on the GM client, confirms, uses up the materials (all or nothing; restored if a write fails), marks the card and opens the usual XP award (suggested XP from tier and effort). Decline asks for an optional reason, uses nothing, and the player sees it on the card and in a whisper. Both are GM only in the API (`api.resolveEnchantRequest`), and a card whose author does not own the character, or whose recipe is no longer a GM-applied enchantment, is refused. The card prints the table rule for the GM only: one enchantment per item; not attuned by default; not magical unless the GM says so. Nothing enforces it, and the Ledger never renames or edits the player's item.
- `api.requestEnchanting(actor, recipeId, {confirm, itemId})` and `api.resolveEnchantRequest(message, outcome, {reason, confirm})`. `completeActivity` and `craft` now refuse a GM-applied recipe ("use Request enchanting").
- Help: a paragraph on enchantments. No saved data changes. The recipe pack that uses these fields must be imported only after this Ledger is installed (an older Ledger would show Complete activity and use nothing).
## 0.37.12 — 2026-10-28

Recipe previews that do not need the world Items to be readable, and a clearer requirement line.

- **Previews are kept on the character, not in a world setting.** The GM client copies what a player may see about each recipe the character knows (what it makes, the ingredients, the tools) onto the Actor's Ledger flags: player-facing fields only (name, picture, type, description with secret blocks removed, price). Only the character's owners and the GMs receive it; recipes the character doesn't know, unreleased recipes, GM notes and ids are never in it. This replaces the 0.37.10 world setting `resultPreviews`, which is no longer written or read.
- Makes and ingredient names on recipe cards are picture-and-name buttons that open a small read-only preview. Tools stay as text.
- **Crafting works with GM-only Items.** When the player's client cannot read the result Item, Craft goes to the GM client as an owner-authenticated request (the shared-materials request: the player must own the character, know the recipe and the recipe must be released); the GM client uses the same material checks and makes the item on the character. Nothing in the message carries item data.
- **Assign → Recipe previews** (GM): Rebuild recipe previews (also automatic when recipes, Items or a character's known recipes change), and a list of items players still can't open in Foundry. It is information only; nothing needs releasing for the Ledger to work.
- **Requirement line:** a recipe with no tool and no station, in a profession whose check is a skill (from GM Setup), now reads "Check: Arcana" instead of "Tool or station: None needed". "None needed" stays for professions with no tool, station or skill. Craft is not blocked either way.
- No saved data changes beyond the new Actor flag.

## 0.37.11 — 2026-10-28

Choose who is in a gather.

- **Gather** tab: every character who could roll has an **Included** checkbox (all ticked to start), plus **Include all** and **Include none**. Unticked characters stay listed as "Not included". The choice is remembered on this device.
- **Start gather** offers the roll pop-up only to the owners of included characters. A roll for a character who isn't included is refused by the Ledger (GM, the Gathering tab and `api.gathering.roll`): "The GM did not include <name> in this gather."
- While a gather is open the GM can tick or untick: ticking sends that player the pop-up, unticking an unrolled character withdraws it. Someone who already rolled stays recorded (cancel the gather to start again). The panel says "N of M included · R of N have rolled"; Reveal and the "Did not roll" list count only included characters.
- An approved player request always includes the requesting character. History lists the characters who rolled. An open gather is held in memory as before, so it does not survive a reload.
- API: `gathering.start({include: [actorIds]})`, `gathering.include(roundId, actorId, on)`, `gathering.includeAll(roundId, on)`.
- No saved data changes.

## 0.37.10 — 2026-10-28

Players can look at what a recipe makes.

- The Makes line of a recipe card now shows the result item's picture and name as a button for players; it opens a small read-only preview (picture, type, price, the item's description). No actions.
- It works without any permission on the world Item (Items are GM-only by default now): the GM client stores a snapshot of each released recipe's result in the world setting `resultPreviews`, refreshed at start-up and when Items change. Only player-facing fields; Foundry secret blocks, GM notes and ids are never copied. Recipes a player can't see, and unreleased results, are not in it.
- Without a snapshot the name stays plain text as before. GM view unchanged. Materials and tools keep their current behaviour.
- No saved data changes beyond the new setting.

## 0.37.9 — 2026-10-28

Players can only request gathering at active places.

- With Locations' Active places (`isLocationActive`, `activeLocations`), the player's **Request gather** picker offers only nodes at places set Active, refreshes when the Active set changes (`ashen-gate-locations.activeChanged`), and shows "No gathering spots are active. Ask your GM where the party is." instead of hiding the tab.
- The GM client refuses a request for an inactive place with that reason (so no entry point can bypass the picker). A request already waiting when the place stops being active stays in the queue with a note, and Approve still works. The GM can still open a gather at any node.
- Without Locations or with an older Locations, requests work exactly as before.

## 0.37.8 — 2026-10-28

Gather history, and clearing the last gather.

- **Gathering → History** (GM): the last 10 completed gathers, newest first, each collapsible (the latest open): spot, tier, DC, professions, a plain date ("Today, 9:42 PM"), and per character the total, outcome (Nothing / Common / Rare / Exotic), what they got, whether it was Given, and the XP awarded from the gather card. An entry is written at **Reveal results**, updated when loot is given, and removed if the gather is cancelled. Capped at 10 in the world setting `gatherHistory`; nothing existing is rewritten.
- Players have no History tab (it lists every character's result); they keep their own Last gather panel.
- **Clear history…** (confirmation "Clear gather history?", Cancel is the default) with a tick box "Also clear the last gather result" (ticked, because the banner would point at a removed entry). On the Last gather banner, **Clear last gather…** (confirmation "Clear the last gather?") with "Also remove it from History" (unticked). Players' Last gather panel clears too. Neither touches loot given, XP, materials, crafted items or Actors. GM only, also in the API.
- API: `gathering.history()`, `gathering.clearHistory({alsoLast})`, `gathering.clearLast({alsoHistory})`.

## 0.37.7 — 2026-10-28

A player who rolls a gather from the pop-up now lands in the Ledger.

- **Roll as <name>** (the small "Gather — roll your check" pop-up) rolls as before, then opens the Ledger on **Gathering** (or brings it to the front) where the character shows as rolled, the same as rolling from the tab.
- When the GM presses **Reveal results**, the Ledger opens on **Gathering** on each player's screen and the slot-machine reel plays there. The view is the same public one as before: no unreleased materials, Exotic odds, other IDs or GM notes. The GM's screen is unchanged. Nothing opens if Ledger Player Access is off.
- No saved data changes.

## 0.37.6 — 2026-10-28

Complete activity needs the tool.

- An Artistry composition that needs a tool (its own tool, the profession's tool, or a list such as any musical instrument) can't be completed by a character who carries none of them. **Complete activity** is a disabled button with the reason next to it ("Needs Calligrapher’s Supplies"), and the Ledger refuses it everywhere (Individual, Party, character sheet tab, API `completeActivity`), including for the GM. "Has the tool" is the same test as the "doesn’t have this" badge: an owned tool Item or tool proficiency.
- Compositions with a workstation (rehearsal stage, studio, writing desk) are unchanged: the station is confirmed with the GM and the tool is only a check choice.
- Craft is unchanged (a missing tool still only warns).
- No saved data changes.

## 0.37.5 — 2026-10-28

Refresh recipes shows a pack check, so a missing former-starter marker is visible.

- The Refresh recipes windows (one character, whole party, and the "No problems found" state) now start with a GM line: how many recipes in this world carry `former_starting`, and per profession how many are starting and how many former. If none carry it, the line says to sync or import the updated recipe packs in General Manager, then reopen the window.
- No planning rules changed: a recipe is only found as a replaced starter if it is recorded as granted or carries the marker (verified end to end with recipes stored exactly as Manager writes them).
- No saved data changes.

## 0.37.4 — 2026-10-28

Refresh recipes finds replaced starters even when they were never recorded as granted.

- New optional pack marker on recipes, `former_starting: true` (a recipe that was a starter and is not any more; never together with `starting`). Sync the packs so it reaches the world, then **Party → Refresh recipes for the whole party…**.
- A known recipe with the marker joins **Replaced starting recipes**, pre-ticked to remove, whether or not it is in the character's granted list. If the character crafted with it, it stays unticked with the reason and needs the typed name. The reason now reads "Replaced starting recipe: it is no longer a starter. Untick it if you want the character to keep it." (it may have been learned later).
- Recipes without the marker are never pre-ticked unless recorded as granted (as before). The marker is also counted in the party list, the Individual "N replaced starting recipes" note and `refreshRecipes` counts.replaced.
- Starting recipes Preview / Grant never re-add a former starter (it is not `starting`).
- No saved data changes.

## 0.37.3 — 2026-10-28

Refresh recipes handles starting recipes the pack has replaced.

- **Replaced starting recipes**: a recipe recorded as granted as a starter that is no longer a starter is its own group. It is pre-ticked to remove unless the character has crafted with it (then it stays, with the reason, and removing it keeps the typed-name rule). Learned recipes are never pre-ticked. Missing new starters are offered as before. Single character, whole party and `refreshRecipes` behave the same; Preview, then Apply with a snapshot Journal first; running it again changes nothing.
- **Party view fix**: characters whose only problem is a replaced starter are now listed (with their ticks) and counted; "No problems found" appears only when none remain. The Individual tab shows "N replaced starting recipes" to the GM.
- **Assign → Starting recipes**: new **Replace or remove starting recipes…** opens Refresh recipes for the whole party; a hint on "Already known" rows explains it. **Assign → Professions → Refresh…** is now **Refresh professions…** with a line pointing to Refresh recipes….
- Limit: only starters recorded in a character's granted list (since 0.33.0) are identified; older grants look like learned recipes and are never pre-ticked.
- No saved data changes.

## 0.37.2 — 2026-10-28

Recipe details fold on the Individual tab, like the Party tab's.

- Each recipe card on **Individual** (Known recipes and Recipes to learn) has a **Details** fold. The title, tier and effort badges, the Craft / Learn / Complete activity button, the **tool or station line with its warning** (for example a missing tool) and the status row stay visible when it is collapsed. Needs → Makes, the cost and the recipe text fold. Open by default, so the first view reads as before. Players and GMs both get it.
- **Expand all** and **Collapse all** in the Known recipes header. Each recipe's open or closed state is remembered per user on this device; it changes in place (no re-render, focus stays) and is written once per burst of clicks.
- **Search** now also matches words inside the details (ingredients, tool or station, the recipe text), and a match opens its collapsed details; clearing the search puts back what you had.
- No saved data changes.

## 0.37.1 — 2026-10-28

Fix: opening and closing folders in the Recipe Catalog was slow.

- Pressing a tier name, **Expand all** or **Collapse all** rebuilt the whole window (every recipe card) just to flip a panel. They now change the open state in place, with no re-render, so they are instant and focus never moves. Profession folders were already native and are unchanged.
- The remembered open state is kept in memory at once and written to the browser once per burst of clicks, not once per click (and once more when the window closes).
- Search, "big lists start shut", the remembered state and focus after a re-render behave as before. No saved data changes.

## 0.37.0 — 2026-10-27

The Recipe Catalog is a tree: profession folders with tier groups inside.

- **Recipe Catalog** (and **Party → By profession**, the same renderer): each profession folder now holds tier groups in ladder order (Apprentice, Journeyman, Expert, Artisan, Master), each with a count and only its recipes. Empty tiers are left out; recipes with no or an unknown tier go in **Other**, last. The tier is read the way the recipe card's chip reads it (its tier, else the minimum profession level it asks for).
- **Collapsible and remembered.** A profession is a folder; a tier is a header button (aria-expanded) that collapses its recipes, so there is no fold inside a fold. Open and closed state is remembered per user on this device and restored after every refresh, with focus staying on the same header. Professions start shut; tiers start open.
- **Search** still filters: it opens the folders and tiers that match, hides the rest and shows "n of total" in the headers; clearing it puts back what you had open. **Expand all** and **Collapse all** sit in the toolbar.
- **Gathering spots are in tier order too.** In Gathering → Gather the Location spot and Node template pickers, the Gathering nodes list and a player's request list sort spots by tier (lowest first; a range by its lowest then highest tier), then profession, then name; no tier goes last. Pickers group under tier headings and every option says its tier, profession and place (e.g. *Tier 1–2 · Herbalism · Reedbed Ford · Zeta Marsh*). The Gathering nodes list is now folders by tier instead of by activity (the Activity filter stays).
- No saved data changes.

## 0.36.0 — 2026-10-27

Refresh recipes.

- **Refresh recipes…** (GM): a button on the Individual tab's *Known recipes* for a player character, and *Refresh recipes for the whole party…* on the Party tab. It opens in place with every known recipe grouped as **Not in the catalog any more**, **Draft or unreleased**, **Profession no longer held**, **Starting recipes** and **Learned recipes**, plus **Missing starting recipes**. Each row says why and has a *Remove* (or *Add*) tick; a row never shows a raw recipe id (*Unrecognised recipe N*).
- **Defaults:** recipes that no longer exist (including legacy and non-text entries) are pre-ticked to remove, because they cannot work; missing starting recipes are pre-ticked to add; everything else is unticked. A learned, draft or lost-profession recipe that the character has crafted from, or has XP for, needs the character's name typed when ticked. Unreleased starting recipes are skipped with the reason.
- **Apply** saves the GM-only snapshot Journal first (nothing changes if it can't be saved), then updates the known-recipes flags and grants the missing starting recipes through the existing starting-recipe grant. Crafted items, materials, XP and gear are never touched; running it again changes nothing.
- The whole-party view lists only characters with a problem, each with its own ticks.
- The Individual tab shows **N recipes no longer exist** (everyone; players see no controls).
- API (GM only): `refreshRecipes({actorId, preview = true, remove, add, confirmName})` and `refreshRecipes({party: true, preview, selections})`. Shared helpers moved into `refresh.mjs`; Refresh (professions) is unchanged.

## 0.35.5 — 2026-10-27

Copy Location nodes can be undone, and asks first.

- **Copy Location nodes…** now opens a preview in place: how many node templates it would create, the breakdown by activity and how many have **no activity set**. Nothing is created until you press *Copy N nodes…* and confirm.
- **Undo last copy…** (next to the Copy button, and in the "copied into templates" banner). It lists what the last copy created, grouped by activity, and removes exactly those templates. Templates you **edited since the copy**, and templates a **Location points at**, are kept unless you tick them. Confirmation: *Undo the copy of N nodes?* with *Remove N nodes* (danger) and *Cancel* (default).
- Works for copies made before this version: the copy's record already lists the templates it created. A GM-only snapshot Journal of what is removed is saved first (the undo stops if it cannot be saved). Locations records and hand-made templates are never touched. A copy never overwrites an existing template, so only newly created templates are removed; an existing template the copy only matched forgets the Location entries it added. Removed ids are not retired, and those entries can be copied again later.
- The banner and the undo are gone until the next copy; a second press never undoes an older copy.
- API (GM only): `gathering.templates.copyPreview()` and `gathering.templates.undoCopy({preview = true, alsoRemove})`.

## 0.35.4 — 2026-10-27

Gathering shows who rolls with Advantage.

- **Who has Advantage, and why.** In Gathering → Gather the **Can roll** list now has one row per character with a text marker beside the name, e.g. *Advantage: Herbalism Kit* (a tool they carry or are proficient with from GM Setup → Tools and checks → Tool for Advantage, or an Advantage item, or the sheet). The same marker shows in the round's roll list, on the Reveal rows and in the Hand out pop-up, and in the player's roll popup. Characters with no advantage show nothing; advantage and disadvantage that cancel say so.
- **One function.** The marker, the roll prompt's preselected mode and the roll all come from the same check, so the list can never disagree with the dice. A character who holds several ticked professions rolls the first one in the order ticked (form order: Archaeology, Fishing, Herbalism, Hunting, Mining), and the marker is for that profession's check. The list updates as you tick professions.
- Fix: rolling from the popup or the API without choosing a roll mode used Normal and dropped a tool's Advantage; it now uses the preset the prompt shows.
- No saved data changes.

## 0.35.3 — 2026-10-26

Keyboard and narrow-window fixes (shared kit 2.4.0).

- **Arrow keys on the value switches.** In GM: XP (Award / Adjust), Sort recipes and Where, Left/Right (or Up/Down) pick the next choice, Home/End jump to the ends, and each group is one Tab stop. Works in the window, the Tidy5e tab and the Character Hub embed.
- **Tab rows that scroll sideways now show it.** When tabs are cut off at the edge of a narrow window, that edge fades out, and the selected tab is scrolled into view when the window opens (before, the last tabs, such as GM Setup, could be hidden with no sign that more existed). Arrow keys and Tab bring a hidden tab into view. Nothing animates.
- No change to saved data. Check in Forge: open a profession card > GM: XP, Tab to Award / Adjust and press the right arrow.

## 0.35.2 — 2026-10-27

- **Shared-material crafts no longer leave you waiting.** If the GM's client hit an error while coordinating a craft that uses another character's materials, the requester now gets a failure message straight away instead of waiting out the three-minute timeout. If the GM never answers, the message now reads "The GM did not respond. Check whether any items were used before trying again." (it used to say nothing was used, which could be untrue).
- **Smaller window.** The Ledger opens at 1000 x 760 (was 1180 x 800); the layout is fluid, so the same content fits.
- **Wording.** README and a code comment now state that the recipe catalog is a world setting readable from the browser console; fine for this table.

## 0.35.1 — 2026-10-27

Fixes for gathering found in a live Forge test.

- **Give… in the Hand out loot pop-up works.** The buttons did nothing; they now open the Add picker (materials of the right quality, matching professions and tiers first), give the item to that character, post a chat card and mark the row as given. They work however Foundry delivers a click to the dialog (its own actions, the render callback, or a click on the dialog window); one click is handled once.
- **Fewer rounds the Ledger cannot settle.** A released material is no longer skipped just because its world Item is not Observer for every player (including players who are offline). A Material imported with only the flag envelope (older or thinner imports) is still matched: its quality, tier and profession are read from the flag's gathered_by refs and the Item description's first line, whatever the capitalisation.
- **A specific reason when nothing can be picked.** Instead of the generic line, the row (and the pop-up) says why: nothing imported for those professions and tiers, matches that are draft/unreleased (tick Use draft materials anyway), imported more than once, or imports with no readable quality, tier or profession. Players never see this.
- No saved data changes.

## 0.35.0 — 2026-10-26

The Ledger files its journals under the **Ashen Gate** folder instead of loose at the top: *Profession Ledger (GM Data)* in **Ashen Gate / Professions** and the *Profession Refresh* snapshots in **Ashen Gate / Backups**. On the first GM login after updating, the Ledger moves its own loose journals there; anything you filed elsewhere stays. Nothing is deleted and no ownership or permission changes.

## 0.34.1 — 2026-10-26

Station-based activities no longer ask for a tool. When a recipe has a **workstation**, the tools in its `access.toolProficienciesAnyOf` list are only the choices for the roll: the card shows the **Station** chip and no **Uses** chip, nothing warns that a tool is missing, nothing blocks Complete activity or Craft, and the dialog shows "Workstation: X (confirm with your GM)" without a tool line. The roll still offers those tools (the profession's own tool first, then the listed ones). Tool-only activities, and access tools on a recipe with no workstation, are unchanged. Applies to Individual, Party, Recipe Catalog and the Craft/Complete dialogs. No change to recipe data or saved data.

## 0.34.0 — 2026-10-26

Gathering is simpler, and there is no lead gatherer any more.

- **One gather, everyone with the profession rolls.** Gathering → **Gather**: choose Ad-hoc, a Location spot or a Node template, tick the professions that can roll, the tier(s) and the DC, then **Start gather…**. Every party character who holds a chosen profession rolls once with their own check for it; others are not offered a roll.
- **The Ledger settles the loot.** **Reveal results** picks a material for each character who met the DC from the existing rules (Common on success, Rare on success by 5+, an Exotic by the usual chance), a different material for each while the pool allows. A saved spot uses its own material tables; an ad-hoc gather uses the imported Materials of the chosen professions and tiers.
- **Slot-machine reveal.** A reel of material pictures lands on each result. It is only a picture: the result is fixed before it starts, **Skip animation** and reduced motion show the plain list, and nothing is given until you press **Give loot**. Unreleased materials stay out of players' view.
- **Hand-out pop-up.** When a drop cannot be settled from the tier and DC, a pop-up lists who rolled, who met the DC and what each may receive, with **Give…** (Add per material).
- Removed: Lead gatherer, Helpers, the Active checks sub-tab and the ad-hoc material and Exotic pickers. Player requests remain (Approve opens the gather).
- API: `gathering.start` ignores `leadId` and `helperIds` and takes `professions`, `tiers`, `dc`; new `round`, `roll`, `reveal`, `give`, `giveByHand`; `resolve(roundId, {actorId, total})` records one roll. No saved data changes; an old remembered Active checks sub-tab opens Gather.

## 0.33.4 — 2026-10-26

Recipe cards no longer say things twice. The cause is in the recipe content: an activity's `description` starts with a generated sentence that repeats the tier and effort badges ("A Courtyard Jest is an apprentice performance composition made through short effort.") and then repeats the whole `effect_note`, which the card also showed under **Effect**. The card now leaves out the badge-restating sentence, and shows text that is the same as (or contained in) the effect only once, under **Effect**; distinct text stays as the italic summary. In **Party** and **Recipe Catalog** the card body folds under a **Details** control (badges and **Known by** stay visible); Individual cards stay open. "(the GM decides at the table)" now appears only on cards where a character can complete the activity. No change to recipe data or saved data.

**Open skill tree…** Each profession card (Individual tab, the Tidy5e sheet tab and the Character Hub embed) has an *Open skill tree…* button that opens that profession's tree in Skill Trees. It shows only when Skill Trees is enabled, for the character's owner and the GM; the owner check is also made when the button is pressed.

## 0.33.3 — 2026-10-26

Refresh… can now remove what it cannot identify. Every row under **Can't tell, left alone** has an *Also remove* tick box, unticked by default: known recipes the recipe catalog does not have (including old entries that are not recipe ids at all, or not text), signature perks with no grant record, and profession features with no grant record. **Select all that I can't identify** ticks the whole group (and **Clear all that I can't identify** undoes it). Ticked rows appear under *Will remove* with "Ticked by you: …", are counted in the confirmation, and are saved in the snapshot Journal (previous flags and removed Items) first. Removing an unrecognised recipe takes its entry out of the character's known recipes (and its granted-recipe record); removing a perk or profession feature deletes that Item. Unrecognised recipes show as "Unrecognised recipe 1, 2…", never as ids. Nothing unticked is ever removed. API: `refreshProfessions` takes `alsoRemoveRecipes` (the `optInRecipe` values of `cantTell` rows); `alsoRemove` also covers unidentified perks. No change to saved data.

## 0.33.2 — 2026-10-26

Fix: Assign (and the skill/tool proficiency badges) counted half proficiency as proficient, so a Bard with Jack of All Trades was given professions they did not qualify for. Only full proficiency (1) and Expertise (2) count now. No change to saved data; existing assignments are not touched (use Refresh… to correct a character).

## 0.33.1 — 2026-10-26

The Ledger window and embeds ignore Manager bulk writes (Sync, Import) while they run and refresh once when they finish; before, every updated Item redrew them. No change to saved data.

## 0.33.0 — 2026-10-26

- **Assign: Refresh… for one character.** After a player changes proficiencies (or swaps professions), pick the character in Assign → Professions and press **Refresh…**. The preview lists **Will add**, **Will keep**, **Will remove** and **Can't tell, left alone**. Refresh removes only profession features and signature perks the Ledger recorded giving the character, and starting recipes of the professions it removes, then adds what the character now qualifies for (profession features, starting recipes, signature perks) the same way Assign does. Crafted items, materials, gear and anything added by hand are never touched. A profession feature with no record of who added it (added before this version, or by hand) is listed under *Can't tell* and stays unless you tick *Also remove*.
- **Progress is protected.** A profession with XP, history, chosen perks, crafted items, learned recipes beyond the starting ones or signature perks is kept, with "This character has progress in <profession>", unless you tick *Also remove <profession> progress* and type the character's name.
- **Snapshot first.** Before anything is removed, a GM-only Journal ("Profession Refresh: <name>") is saved with the removed Items and the previous flags; if it can't be saved, nothing changes. Re-running changes nothing.
- API: `refreshProfessions({actorId, preview = true, removeProgress, alsoRemove, confirmName})` (GM only; player characters only, never NPCs, unowned characters or Character Hub level backups).
- Assign, Starting recipes and Signature perks now record what they grant (Item flag `grant`, Actor flag `grantedRecipes`) so Refresh can tell. Existing data is not rewritten; no migration.

## 0.32.4 — 2026-10-24

- **Gathering nodes: the id is made for you.** A new node no longer has an *Id (permanent)* box to fill in. Its id is made from the name when you save (`NODE-` plus the name, `-2`, `-3`... if taken) and never changes. A saved node shows it read-only under *Details*. *Advanced: set id (optional)* is still there for a new node and is still checked (NODE- prefix, upper-case letters and digits, not used or deleted before).
- Saved data: no change; existing nodes keep their ids. No migration.

## 0.32.3 — 2026-10-24

- Shared UI kit 2.3.0 (id helpers and the record picker, used by Quest Log first). No change to how this module looks or works.
- Saved data: no change; no migration.

## 0.32.2 — 2026-10-24

- **Fix: a recipe's tool is met by any tool GM Setup allows for its profession.** An Inscription recipe said "Calligrapher's Supplies: doesn't carry this" even when the character carried Cartographer's Tools or Painter's Supplies, because the card only looked for the profession's single check tool. Now a recipe that needs one tool of its profession lists them all (for example "Tool: Calligrapher's Supplies, Cartographer's Tools or Painter's Supplies"), shows which one is carried ("Cartographer's Tools: carried"), and otherwise says "Needs one of: …". This uses the same Tools list GM Setup shows (your edits, baseline file, imported content, then the built-in default). Individual, Party, Recipe Catalog, the Tidy5e Professions tab and the Character Hub embed all use the same check. A recipe that needs two or more tools still needs all of them, and professions with a single tool read as before.
- **Fix: tools imported from D&D Beyond (or made by hand) are recognised.** Carried tools are now matched by dnd5e base item, identifier or name ignoring case, apostrophe style, plural/singular and a source tag such as "(XGE)", so "Cartographer’s Tools" and "Cartographers Tool" are the same tool. Tools inside a bag or other container count, equipped or not. A quantity of 0 does not count, and tool proficiency alone still does not count as carrying the tool.
- **Not changed:** the Craft button is gated by materials and known recipes, not by tools; a missing tool is a warning on the card, as before. GM Setup data is untouched.
- **Saved data:** none changed; no migration.

## 0.32.1 — 2026-10-24

- **Fix: ids are no longer shown anywhere in the Ledger.** The GM's recipe rows showed the raw recipe id (for example `REC-ALCHEMY-FIELD-01`) under each recipe, and several GM screens and messages named materials, nodes and results by id. Rows, node cards, the node editor heading, the node import preview, the Node test list, option lists, notifications, confirmation text and error messages now use the item's name (or a neutral label such as "This material"). Search still finds things by id; it just doesn't display it.
- **No machine text either.** The Ledger does not print refs or relation names (such as `also_available_as_journal`), entity type names or raw status/visibility values; GM badges already use plain labels ("GM-only source", "Reveal gated"), and a test now checks every main view for this.
- **Where the GM can still reach an id:** only in the gathering node editor, in a closed **Details** fold (the id field, editable only while creating a node).
- **Saved data:** none changed; ids, flags, APIs and export formats are as before.

## 0.32.0 — 2026-10-24

- **Recipe cards are easier to read, everywhere recipes are listed** (Individual, Party, Recipe Catalog, the Tidy5e Professions tab and the Character Hub embed). Each card now reads: name with its tier and effort badges, then **Needs** (each material with its quantity) leading to **Makes** (the result), then the **Tool** or **Station** it needs, then the description and effect in a quieter style, then who knows it. Activities (no materials, no result) show **Uses**, **Station** and **Effect** in the same style. The GM-only line of internal recipe ids under each card is gone.
- **Items in a recipe open on click.** Every material and the result is a link that opens that item's sheet. Players can open an item only when it is released to them and they have at least Observer permission on it; otherwise the name is plain text with a tooltip. For the GM an item that is not imported yet shows as plain text with a short GM-only note. Permission is checked again when you click, not just when the link is drawn.
- **Tier colours.** Tier names (Apprentice, Journeyman, Artisan, Expert, Master) use the suite's item-rarity colours (common, uncommon, rare, very rare, legendary) on recipe cards, the Professions box and the Assign signature-perk preview. The tier name is always written out; colour is never the only signal.
- Not changed: chat cards, Help text and notifications still print tier names as plain text.
- **Saved data:** none changed; no migration.

## 0.31.4 — 2026-10-24

- **Fix: starting recipes no longer say "Not found by the party yet".** A character's own recipe list (Individual tab and the sheet tab) never told the GM who knew a recipe, so every recipe they knew, starting recipes included, was marked "Not found by the party yet". Those rows now show **Known by <name>**, and a recipe item the character holds shows as found by them. Party and Recipe Catalog already counted these correctly. Recipes nobody knows or holds still show "Not found by the party yet". Crafting availability is unchanged.
- **Saved data:** none changed; no migration.

## 0.31.3 — 2026-10-23

- **Fix: one question when both an edited node and an unapplied import preview are open.** Leaving Gathering nodes asked twice, and answering Discard to the first and Keep reviewing to the second left the editor on screen with its draft already gone. It now asks once (**Discard unsaved changes?**) and changes nothing until you choose **Discard changes**; **Keep editing** leaves the draft, the preview and the focus as they were.
- **Notification text goes through one helper.** Names in notifications are still escaped (the safe choice if Foundry shows them as HTML). If Foundry V14 shows them as plain text, a name with `&` would show as `&amp;`; the switch to turn escaping off is `ESCAPE_NOTIFICATIONS` at the top of `scripts/main.js`. Chat whispers stay escaped either way.
- **Saved data:** none changed; no migration.

## 0.31.2 — 2026-10-23

- **Fix: leaving Gathering nodes no longer drops unsaved work silently.** Clicking another tab, or another Gathering sub-tab (Requests, Active checks, Start gathering), while a node is being edited with unsaved changes now asks **Discard unsaved changes?** (Keep editing is the default and leaves everything as it was, including where the focus is). The same goes for a node file import preview you haven't applied: **Discard this import preview?** (Keep reviewing / Discard preview). Moving into Gathering nodes, or leaving with nothing pending, asks nothing.
- **Fix: names in notifications are escaped.** A character or file name containing HTML (for example in "reached Journeyman… no signature perk is imported", or an error message) is shown as text, not interpreted.
- **Saved data:** none changed; no migration.

## 0.31.1 — 2026-10-23

QA pass for big worlds (the sandbox content: about 700 recipes, 400 materials, 60 gathering nodes).

- **Faster with a lot of content.** Every recipe, material and result lookup used to scan every document in the world, so Recipe Catalog, Party, Individual, Gathering and GM Setup got slow as content grew (in a test world of 700 recipes, 400 materials and 250 items, lookups were most of the time of every render, and a Catalog render took about three times as long). Lookups now use an index built once per pass; a document that is added, removed, archived or replaced is still seen straight away. Nothing about who sees what changes.
- **Big lists start folded.** A list of more than 40 recipes or nodes (the GM's Recipe Catalog, Party recipes, Gathering nodes) opens with every profession or activity folder closed, each still showing its count; open the ones you want (the window remembers them). Searching still opens the folders that match. Short lists open as before.
- **Six top-level tabs for the GM.** **Gathering nodes** is now the fourth sub-tab of **Gathering** (Requests · Active checks · Start gathering · Gathering nodes) instead of a seventh top-level tab. It shows the same node list, editor and import, and Gathering stays the selected tab. Players are unaffected. `api.open({view: 'nodes'})` still works.
- **Node file import is readable.** The preview lists one node per line under a fold for each outcome (New, Updated, Kept, Unchanged, Skipped) instead of one long run of names; long lists start folded.
- **Select all / Clear selection** on the Assign **Starting recipes** and **Signature perks** previews, for when you want to grant only a few of many rows.
- **Material pickers say more.** In the node editor the Material list adds the material's quality and tier after its name (for example "Marsh Reed · Common Tier 2") so similar names can be told apart in a long list.
- Wording: the Assign help no longer shows the internal PROF-* id pattern; the node help says "permanent node id".
- **Checked, no change needed.** The 60 sandbox nodes (`S01_Frontier_Sites` and `S10_Blight_Sites` gathering-nodes files) import with no errors or warnings; all 85 materials they name (28 nodes carry a designated Exotic at 50%) exist in the sandbox and earlier content packs; the ten signature perks in S08 are valid for the five gathering professions.
- **Saved data:** none changed; no migration.

## 0.31.0 — 2026-10-23

- **Signature perks:** a Profession perk can be a *signature perk* (`signature: true` in the content, with `profession_id`, `tier` of `journeyman` or `expert`, and `point_cost: 0`). When a character's level in that profession reaches Journeyman (4) or Expert (7), the Ledger adds every signature perk of that profession and tier to the character as an Item, on the GM's screen, and posts one chat note per character and profession naming the perks (shown to the GM and the character's owners, like XP notes). A jump over several levels grants every tier it crosses. A perk the character already holds is never added twice, and re-running changes nothing.
- **Nothing is ever taken away.** Lowering XP or losing a level keeps every signature perk. The GM's **Adjust XP** confirmation now also lists signature perks held above the new level ("kept, not removed").
- **If the perks aren't imported:** nothing is granted and the GM is told once per profession and tier (a notice and a GM-only chat message). This applies to the gathering professions and to any profession that has some signature perks imported. A GM-only or reveal-gated signature perk is held back the same way. Draft perks are granted: you decide what is imported.
- **Grant signature perks (GM):** **Assign** has a third sub-tab, **Signature perks**, for characters who reached a tier before the perks were imported. Pick the whole party or one character and press **Preview**: each perk is **Will grant**, **Already held** or **Not granted** (with the reason). Nothing changes until you confirm with **Grant all new (n)…** or **Grant selected…**. A character that can't be updated is reported and the others still get theirs; pressing it again finishes the job.
- **For partner modules:** new GM-only `api.signaturePerks.preview({actorIds})` and `api.signaturePerks.grant({actorIds, rowIds})`; see the README. The grant itself listens to the existing `ashenGateLedger.progressionChanged` hook on the GM client that wrote the XP (the only client that fires it).
- **Saved data:** no new data and no migration. The perk Items on the character are the only record; the Ledger stores no copy. Signature perks are not part of any skill tree and cost no points.

## 0.30.1 — 2026-10-23

Code-read review fix.

- **Fix: a malformed `rowIds` no longer grants everything.** `api.grantStartingRecipes({preview: false, rowIds})` and `api.assign.apply({rowIds})` treated a `rowIds` that was not a list (a string, a number) as "no limit" and acted on every new row. They now reject a non-list and any id that is not in the current preview, before writing anything. Leaving `rowIds` out still means every row, and the Assign tab (which always sends a list from the preview) is unchanged.
- Saved data: unchanged. No migration.

## 0.30.0 — 2026-10-23

- **Grant starting recipes (GM):** **Assign** now has two sub-tabs, **Professions** (the profession assignment, unchanged) and **Starting recipes**. Pick the whole party or one character and press **Preview**: for each player character it lists the recipes marked as starting recipes (`starting: true` in the content) for the professions that character has, each as **Will grant**, **Already known** or **Not granted** (a draft, GM-only or otherwise unreleased recipe, with what to fix in General Manager). The header of each character says how many it gets; a character with no profession says so. Nothing changes until you confirm with **Grant all new (n)…** or **Grant selected…**; the window then lists what each character got.
- Granted recipes become known recipes exactly as if learned: no recipe item is needed or used up, nothing already known is removed or doubled, and pressing it again grants nothing new. A character who gains a profession later gets that profession's starting recipes the next time you press it. A recipe above the character's profession level is granted too; Craft shows its usual level reason until the level is reached. Only player-owned characters get them (never NPCs or Character Hub level backups). If one character can't be updated, the others are put back and nothing is granted.
- Unchanged: the GM still can't **Learn** a recipe item for a player-owned character; no chat card is posted.
- **For partner modules:** new GM-only `api.grantStartingRecipes({preview = true, actorIds, rowIds})`; see the README.
- **Saved data:** no new data and no migration; granted recipes go in the existing `knownRecipes` Actor flag.

## 0.29.2 — 2026-10-23

- Removed the Beta wording from the interface: the module description in Setup → Add-on Modules no longer ends in "(Beta)", and the note when Skill Trees is missing says "Skill Trees is not enabled." (before: "Skill Trees prototype is not enabled.").
- Saved data: no change; no migration.

## 0.29.1 — 2026-10-22

- **Fix: imported Profession content no longer wipes a default it says nothing about.** In **GM Setup → Tools and checks**, Archaeology's advantage tool showed *None · From content* once the profession content was imported, because the Archaeology record lists who qualifies but gives no advantage tool. It now stays **Calligrapher’s Supplies · Default**. Fishing's carried **Fishing Tackle** advantage stays **Default** the same way.
- The same rule now applies to the qualifying lists: a skill or tool list the content leaves out keeps the built-in one. For example, a Herbalism record that only lists Nature now keeps Herbalism Kit proficiency qualifying too (before, the kit stopped qualifying), and Fishing keeps Survival when its record lists only tools. A list the content gives empty (`[]`) still means "none".
- Unchanged: GM edits win over a baseline file, which wins over content, which wins over the built-in default; names that match no dnd5e tool or skill are still reported; carried items (`itemsAnyOf`) work as before.
- **Saved data:** nothing stored changes and nothing is migrated; only how imported content is read.

## 0.29.0 — 2026-10-22

- **Suggested XP for activities:** when a character completes an activity, the GM's XP award on the chat card starts at a suggested amount, worked out from the activity's tier and effort: tier (Apprentice 1, Journeyman 2, Expert 3, Artisan 4, Master 5) times effort (Short 1, Long 2, Extended 3), halved and rounded up, at least 1. So Apprentice and Short effort give 1 XP, Journeyman and Long 2, Master and Extended 8. A missing or unknown tier counts as Apprentice, a missing or unknown effort as Short. The card tells the GM how it was suggested, and the amount can still be changed before **Award**. Craft and gathering XP are unchanged.
- **Effect notes on activities:** an activity can say what boon or effect it can give (`effect_note` in the content, plain text up to 400 characters). It shows in the activity's details (Individual, Party, Recipe Catalog, the sheet tab) and on the Complete activity chat card. The GM decides it at the table; nothing is automated.
- **What each profession calls a recipe:** a profession can use its own word for recipes, for example Alchemy *formulas*. Its folders ("2 formulas"), messages (why Craft is unavailable, the Learn question, the craft card) use it; lists and headings that mix professions (Known recipes, Recipe Catalog) still say recipes. Imported Profession content can set it (`recipeLabel`, `recipeLabelPlural`), and the GM can change it in **GM Setup → Tools and checks → Recipe names** (saved with **Save Changes**; leave a box empty to use the default shown in grey).
- **Draft names, for Robb to approve:** until content or the GM sets one, Alchemy says **Formula**, Blacksmithing **Blueprint** and Artistry **Composition**. These are built-in drafts, not canon, and any imported name or GM edit replaces them; every other profession says Recipe.
- **For partner modules:** new `api.recipeLabel(professionNameOrId, {plural, capitalize})`, e.g. "Formulas"; the activity XP flag and the `ashenGateLedger.xpOpportunity` hook now carry `suggested` (and `suggestedBasis`).
- **Saved data:** one new world setting, `recipeLabels`, empty until the GM edits a name. Recipe types, `REC-` ids, imports and characters don't change; nothing is migrated.

## 0.28.0 — 2026-10-22

- **New profession: Artistry**, the first *creative* profession (id `PROF-ARTISTRY`). The 14 existing professions, their ids, XP and levels are unchanged; Artistry levels and earns XP the same way. Characters get it like any profession: import its Profession record with General Manager, then **Assign** or drag it onto the sheet.
- **Who qualifies for Artistry (default):** proficiency in **Performance**, **any musical instrument**, **Disguise Kit**, **Painter’s Supplies** or **Calligrapher’s Supplies**. Its check skill is Performance. All of it is in **GM Setup → Tools and checks**, shown as **Default** and changeable like every other row.
- **Tools and checks** has a third group, **Creative professions**, after crafting and gathering. Tool cells offer **Any musical instrument**, one choice that matches proficiency with any instrument (lute, flute, drum…). It qualifies a character but is never the tool a check rolls by itself.
- **Activities:** a recipe can now be an *activity* (a performance, a composition, artwork, writing, a commission, teaching). It has the usual tier and effort (Short, Long, Extended), is learned like a recipe, needs no ingredients and makes no item. In Known recipes it shows **Complete activity** instead of Craft: pick the check (as in the Craft window), roll, and a chat card is posted where the GM awards profession XP, exactly as from a craft card. Nothing is used up or created, and there is no other reward yet. An activity's tools are alternatives: any one of them will do.
- Crafting, gathering and existing recipes are unchanged. Recipes without a kind are crafts, as before.
- **For partner modules:** new `api.meetsProficiency(actor, access)` (Skill Trees can gate a tree on a tool), `api.completeActivity` and `api.professions()`; the profession's skill tree is found through Skill Trees' `listTreesForProfession` when it has it. Imported Profession records may say `profession_kind: "creative"` (or `category: "creative"`); a new creative profession imported that way also works without an update.
- **Saved data:** nothing new is stored and nothing is migrated. Existing `checkMapping`, baseline files and Actor flags keep their shape (an Artistry row appears in them only if you change it).

## 0.27.0 — 2026-10-22

- **Tools and checks (GM Setup): several tools per cell again.** Each cell (Skill to Access, Tool to Access, Tool for Advantage) shows all its values, for example "Alchemist’s Supplies, Herbalism Kit", and opens a tick-box list in the cell: tick as many as you like, **Clear (None)** empties it, **Done** or Escape closes it. The first tool to access is still the one the check rolls (it stays first while it stays ticked; untick it and the next one rolls). A list of several is no longer shown as "Several (n)". Saving still stores only what differs from the defaults; ticking back what the content gives stores nothing.
- **Defaults from the imported content are shown and used.** The table shows the values in effect, and under each cell where they come from: **Default**, **From content** (the imported Profession records), **From baseline file** or **Set by GM**. A line above the table lists the gathering professions whose checks start with advantage (with the shipped content: Herbalism, Hunting and Mining). Each changed row has **Reset to default**.
- **Fix — gathering advantage tools now apply.** The imported Profession records' "advantage tools" (Herbalism Kit for Herbalism, Leatherworker’s Tools for Hunting, Mason’s Tools for Mining) were never shown in GM Setup and never given to gathering checks: only tools set in GM Setup or a baseline file counted. Now a character proficient with, or carrying, that tool starts the gathering check with advantage. Your own GM Setup choices still win; crafting checks still never get advantage tools.
- **Names that match no dnd5e tool** (for example "Excavator’s Tools" for Archaeology, "Fishing Rod" for Fishing) are listed in their cell as "Not matched: …"; tick the tool it means to use it.
- **New defaults (GM decision):** Archaeology’s tool for advantage is **Calligrapher’s Supplies**. Fishing gets advantage while the character **carries Fishing Tackle** (the adventuring gear, not a tool proficiency): any inventory item named Fishing Tackle (any case) or with that dnd5e identifier, quantity above 0. The roll window says "Advantage: Fishing Tackle". Both show as **Default** and can be changed or cleared.
- **Carried gear for advantage:** the Tool for Advantage cell has a **Carried gear** part: untick to remove, type an item name and **Add** (or Enter). It works for gathering professions only, like advantage tools. Qualifying for a profession by a carried item (Assign) is unchanged.
- **Saved data:** `checkMapping` keeps its shape and gains one optional list, `advantageItems` (per profession, item names or core UUIDs), stored only when you change it. Baseline files may set `advantageItems` too. Nothing is migrated.

## 0.26.2 — 2026-10-22

- **Fix — Gathering Nodes editor:** leaving the editor (**Save Changes**, **Cancel**, or **All nodes**, also after **Discard changes**) now puts the list back where you were and the keyboard focus on that node's **Edit** button (**New node** after a new one). Before, the focus fell to the page: the "Discard changes?" window answers before it has finished closing, and Save renders the window twice (the node Journal update renders it again), so the first render used up the way back. The list also could get the editor's scroll position. Now the way back waits for the render that shows the list, and the focus is retried until the confirm window has closed. Any re-render keeps the focused control (and text you were typing).
- **Fix — Tools and checks (GM Setup):** saving now stores only the cells you changed; every other profession keeps following the built-in defaults, so a later default update reaches your world. Before, saving one cell wrote the whole table and froze today's defaults as if you had chosen them. Choosing the default again (or **Reset**) goes back to following it.
- **Saved data / migration:** setting `checkMapping` now holds only the differences from the defaults (same shape, nothing else changes). Once per world the active GM's client drops saved tool and check-skill cells that equal today's default (`checkMappingVersion` 1 → 2); every other saved value, the access and advantage lists, and an older alias beside its current name are kept. Nothing the checks use changes. Safe to re-run.
- **Craft button:** a known recipe that can't be crafted now shows **Craft** greyed out beside the reason (no ingredient list, the item it makes is not in the world, profession level too low), as missing materials already did. A recipe item you already learned says "Craft it under Known recipes", or that the GM hasn't released the recipe yet; the line about unreleased known recipes says they can't be crafted (GM: import them with General Manager). The Recipe Catalog says to craft from the Individual tab, and in Party (By player) a player gets **Open <name>'s view** for their own character. Crafting rules are unchanged.

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
