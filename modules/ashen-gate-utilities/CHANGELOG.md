## 0.27.0 — 2026-10-22

- **Keyboard and click alternatives to drag and drop** (UI audit UT-31). Each opens a small dialog (Cancel on the left, the labelled action on the right) and then does exactly what the drop does, through the same code, so the same rules and permissions apply. Dragging still works as before.
  - **Party Inventory → Items: Add to stash…** (toolbar, also in the Character Hub's party stash). Pick the character (skipped when you own only one), then the item. The whole stack moves and a container brings what is inside it, as when you drag it. Players see only their own characters; the GM can pick any character, or copy an item from the Items sidebar. Turned off for players while the stash is off.
  - **Take** on each stash row was already the keyboard way to take an item out (into the character in *Take into*); it still asks the party when the take-out vote is on. Focus now stays on the stash after a Take.
  - **Shops → shop editor → Items: Add item…** — from the Items sidebar, a whole Items folder, or any Actor's inventory. Same lines as a drop; saved with Save Changes. Compendium items still need a drag (or bring them into the Items sidebar first).
  - **Shop or service editor → Details: Choose Actor…** — the merchant's name and portrait from an Actor, as when you drop one.
  - Shop editing stays GM only, checked in the code, not just hidden. Focus goes back to the button after the dialog closes.
- No change to saved data, settings or the API; nothing to migrate.

## 0.26.1 — 2026-10-22

- **Conditions → Apply works again** (Foundry V14, dnd5e 6). Applying any condition from the *Native condition* list showed `Invalid status ID "…" provided to Actor#toggleStatusEffect`. Two causes: every option in the list was marked selected, so the list always showed its last entry and went back to it whenever the window re-rendered (any actor or effect change), and Apply sent that status instead of the one chosen; and V14 keys `CONFIG.statusEffects` by id where Utilities expected an array. The list now reads the status list in either shape, offers each native status once (the Strain chip stays out), keeps your pick across re-renders, and only ever passes Foundry an id it knows. Older ids from API callers (`blind`, `stun`, `restrain`, …) map to the dnd5e id; unknown ids are refused with "Unknown native status." before reaching Foundry. Who may apply or remove is unchanged.
- **Overlay background slider** works in the overlay window and when the overlay is popped out to its own browser window: the value is set on the window itself (inline) and applied again after popping out or back in. Still saved per user.
- No change to saved data or settings; nothing to migrate.

## 0.26.0 — 2026-10-22

- **UI cleanup** (UI audit 2026-10, Utilities). No change to saved data, settings, flags, ids or the API; nothing to migrate.
- **Tabs:** six for the GM (Rolls, Party Inventory, Shops, Conditions, Roll Tables, GM Setup; GM tabs last). Roll history is **Rolls → History**; players no longer get an empty Roll Tables tab. No header subtitle; no footer on tabs without a form. Every tab row (top tabs and sub-tabs) is one Tab stop with Left/Right/Home/End; focus and scroll stay put after a re-render.
- **Sub-tabs** use the kit's tabs everywhere: Rolls (Current / History), Party Inventory (Items / Party Fund / History), Shops (GM: **Shops & services** / **Merchant lists**; players: Open shops / **Merchant lists**).
- **Rolls:** **Start Rolls** is a fold, open while nothing is running or shown; skills are toggle chips. **End & Record** is the primary button, **Cancel Session** a quiet one.
- **Party Inventory:** the GM's stash card is one line (stash · items · On/Off badge · Award Gold). The stash's On/Off switch lives only in GM Setup; the badge links there. **Party Fund:** one **Character** picker drives **Deposit**, **Take** and **Change coins**, shown one at a time, each with its own primary button; the **Log** is a fold.
- **Shops (GM):** the Shop editor sub-tab is gone: **Edit** / **New shop** open the editor in place of the list with **All shops** to go back. The editor has tabs **Details**, **Items** and **Coins & buying** under one footer; the items table has five columns, with flavour and cost on a second line. Duplicate, Present… / Stop showing, Restock and the merchant's coin buttons sit under an **Applies now** badge (they change the saved shop at once). Rows keep Edit and Present… / Open / Stop showing, with the cash in the meta line. Import JSON… (a keyboard-reachable file button) and Export are grouped; **New Bank (deprecated)** is a small button. Sort has a visible label.
- **Merchant lists:** each card is a summary (shared with, "n of m open", Share…, Open all, Close all…, Edit, Delete…) with its stores in a **Stores** fold; the duplicate "Shown to" badges and the long hint are gone (now in Help). **Close all…** asks first and names stores also shown to players outside the list; closing one such store asks too. The list editor has **All merchant lists**, **Share…**, a Danger zone with **Delete list…**, the shop editor's Settlement select, and a labelled **Add** select.
- **Shop window:** one line "Paying as [character]" with that character's coins; the party purse and the merchant's coins are in a closed **Coins** fold. Ware cards use the kit card.
- **Vote prompt:** the title and buttons say what is approved (*Party purse: approve purchase?*, *Party purse: approve take-out?*, *Party stash: approve take-out?*; Deny / Allow …), and the seconds count down.
- **Confirmations:** every removal (delete shop, service or list, remove an item, clear history, undo, revoke, discard changes) uses the kit's danger confirmation: Cancel is the default. GM Setup asks before a tab switch or close drops unsaved edits; the window asks before closing over an unsaved shop or list.
- **Kit parts:** Rolls, roll History, Conditions, stash History and the Party Fund log are kit rows; the stash is a kit table per item type; one button helper, one empty state. The explanations that sat on working screens (stash, Conditions, merchant lists) moved into Help, now grouped by tab.

## 0.25.1 — 2026-10-22

- Shared UI kit 2.2 (no visible change).

## 0.25.0 — 2026-10-22

- **Merchant lists for any group:** a list (a settlement, a faction, a guild…) has a name, an optional settlement (Locations active) and its shops and services in order. **Share…** shares it with nobody (*Hidden*), the *Whole party* or chosen players; players see only the lists shared with them.
- **Open / Closed per entry:** a switch on each entry opens that store to the list's players (the same Present as the shop's own button, added to whoever already sees it) or closes it (Stop showing, for every player). **Open all** / **Close all** on each card; entries that can't open (missing, unknown service type) are skipped and named. Opening needs the list shared. Purchases, sales and services still need a presented (Open) store, checked in the API and on the GM client.
- Players: an Open entry shows **Open** and **Open shop**; any other shows **Closed** and **Look inside** (read only).
- **Party Fund** (Party Inventory → Party Fund) replaces the Bank for everyday use: the party purse (Deposit / Take, GM Adjust and Convert, as before), **Change coins** (your character's or the party purse's coins at the standard rates; no fee unless the GM sets **GM Setup → Party Fund → Coin exchange fee**, 0–50 %, default 0; electrum only while *Use electrum* is on; party purse: no vote), and a **Log** of the latest 20 coin movements (who, when, how much). Exchanges run on the GM client in the purse queue, are in stash History as `coin-exchange`, and post a card whispered to the player and the GM. Deposit and Take now post that card too. Items shows the purse in one line with a button to Party Fund; the embedded stash (Character Hub) keeps the full purse strip.
- **Bank deprecated:** existing and imported Bank services keep working (exchange only) and keep their logs; the editor, the type select, the New service tooltip and the import preview say it is deprecated.
- **API:** `api.shops.merchants.setAudience(id, {mode, userIds})`, `entries(id)`, `setOpen(id, entryId, bool)`, `setAllOpen(id, bool)`; `save` takes `audience`; `setVisible(id, bool)` still works (true = whole party). `api.purse.exchange(req)`, `quoteExchange(req)`, `exchangeFee()`. Socket `fund-exchange`.
- Saved data: merchant lists gain `audience` (`visible` kept, derived from it). A one-time GM migration on load writes it (*Show to players* on → whole party, off → hidden); it is re-runnable and writes nothing once done; a list it can't read is left as it is. New world setting `exchangeFeePercent` (default 0). Stash History gets `coin-exchange` entries. Import/export format unchanged; Bank logs untouched.

## 0.24.0 — 2026-10-22

- **Item tooltips and click-to-open** in the shop editor, the shop window (buy and sell), the Buy and Sell previews and the party stash: hover shows dnd5e's own item tooltip, click opens the item. A character's or the stash's Item uses its own sheet; a shop line opens a temporary, read-only copy (never created in the world). Players' tooltips come only from a trimmed copy in the player view: the name and description they may see, the shop's price, no flags, effects, cost or GM notes, never a hidden line. Without dnd5e's tooltips the plain name tooltip stays.
- **Shop cards:** wares (buy and sell) are cards grouped by category (item type) with the price as coins, the stock and the action; the editor's items table is grouped the same way. No clipped text.
- **Coins:** one shared style for every coin box and amount (shop and merchant purses, the party purse, the Bank, prices, previews, chat cards): the coin's icon, a soft glow in copper, silver, gold or platinum, text centred. Electrum only while *Use electrum* is on (dimmed while a purse still holds some, as before).
- **Settlement** replaces *Linked location* in the shop and service editors and *Group by city* in the list: only Locations' settlements are listed (Locations' `isSettlement` when present, else `settlement: true` / `kind` or `locationType` "settlement", else a Type of Settlement, City, Town, Village or Hamlet); a shop already linked to another place keeps it, marked. Without Locations it is a text field. The list groups by the nearest settlement.
- **Merchant from an Actor:** drop an Actor on a shop or service in the editor to fill the merchant name and portrait; both stay editable, **Clear** empties them. The Actor is kept only as a reference note, so a deleted Actor never breaks the shop; players never get it.
- Saved data: additive only. Optional `settlement` (text) and `merchant.actor` ({uuid, id, name}) on shops and services; the player view lines gain `tip`. No migration. Merchant lists and the Bank's rules are unchanged.

## 0.23.0 — 2026-10-22

- **Players change conditions on their own characters:** new GM Setup switch **Players apply and remove conditions on their own characters** (default off). On: owners get **Apply** and **Remove** for native conditions on every character they own. Off: as before, per character with **Unlock for Owner** in the Conditions tab — an unlocked character's owner can now also **apply** native conditions, not only remove them.
- **Condition controllers** (GM Setup, saved with Save Changes): ticked players apply and remove native conditions on every character, like the GM, and nothing else. The Conditions tab lists them for the GM with **Revoke** (asks to confirm, takes effect at once); a controller sees a *Condition controller* badge. They still need Player Access.
- Enforced on the GM client: a player's apply or remove is re-checked there (owner/switch/unlock or controller, Player Access, native status, sender) and refused otherwise; the player client never edits the Actor. Custom statuses stay GM only; the Cinders Strain chip stays read only for everyone.
- **Overlay background slider** (in the overlay, per user, 0–100 %, default 25 % as before): fades only the window background; the header (now solid), names, conditions and × stay opaque.
- **Fix:** Utilities no longer shows in Foundry's Configure Settings (players saw an empty entry). Player Access was its only listed setting and is in GM Setup.
- API `conditions`: `canApply`, `apply`, `ownersManage`, `setOwnersManage`, `isController`, `controllers`, `setController` (setters and `controllers` GM only).
- Saved data: additive only. New world settings `ownersManageConditions` (false) and `conditionControllers` ({}), client setting `overlayOpacity` (25). No migration.

## 0.22.2 — 2026-10-21

- **Fix: Character Hub level backups are not party characters.** A copy the Hub keeps on level-up ("<Name> - level X", in Ashen Gate / Level backups) no longer shows in Conditions, Rolls, Award Gold, the stash's take list or shop buyer lists, and is not ticked from the dnd5e Primary Party.
- A copy is refused as a target in the API too, for the GM as well: rolls, gold awards, purse deposit/take, stash withdraw and deposit from its sheet, condition locks, and shop buy/sell/services ("That is a level backup copy, not a playable character."). Detected by the Hub's `levelBackup` flag only; nothing is imported from the Hub, and nothing changes without it.
- Saved data: no change. No migration.

## 0.22.1 — 2026-10-21

- **Strain chip read only:** statuses whose id starts with `ag-strain-` (the Cinders 0.8.0 Strain chip) show in Conditions and the overlay with a **Read only** marker ("Changed in Ashen Gate | Cinders or the Character Hub Strain bar") and no Remove / ×, for the GM and for owners of unlocked characters. They are left out of the GM **Apply** list.
- `api.conditions.canRemove` is false for them and `api.conditions.remove` (and player removal requests on the GM client) refuses them with a message saying where to change Strain. Detected by status id only; nothing is imported from Cinders.
- **Fix:** Remove and Apply re-check the character afterwards. If the condition is still there (or wasn't applied) because another effect or module refused the change, you get an error instead of "Removed …".
- Saved data: no change. No migration.

## 0.22.0 — 2026-10-21

- **Chat cards:** every purchase, sale and Bank exchange posts a card whispered to the player who made it and the GM (no public card): who, character, item ×quantity (or coins given and got, with the fee), the total as the shop shows it, and the shop or bank name. The card is posted after the change is done; if chat fails, nothing is refused or put back (a console warning only).
- **Bank log** (GM): each bank keeps its own log of exchanges (who, whose coins, from → to, fee, time), the last 200, shown newest first in a **Log** section of the bank's editor. It lives on the bank's page in the GM Data journal (no player permission); `api.shops.services.log(id)` is GM only. Writing the log can't undo or refuse an exchange.
- Saved data: additive only. Exchanges are appended to the `log` on the bank's own GM Data page (created empty with the bank; a page without one reads as an empty log). Stash History is unchanged. No migration.

## 0.21.0 — 2026-10-21

- **Import JSON** and **Export** on the Shops toolbar (GM). Import reads `Shop`, `Service` and `MerchantList` records from an `ag-foundry-import/0.2` file, shows a preview (Create / Update / Kept / Skipped with the reason, item lines not found), then **Import N**. **Update shops that already exist** switches between keeping and updating existing ids.
- Lines find their Item by permanent id (`item_id`), then `item_uuid`; a line whose item isn't found is skipped and reported, the rest of the shop imports. Prices are stored as copper; ep is refused while *Use electrum* is off. Deleted ids are refused.
- Import writes definitions only: nothing is shown to players, merchant lists come in hidden, and an update keeps stock left, hand-added lines, the merchant's coins now, the location, GM notes, who it is shown to and the sales log.
- **API** (`api.shops`, GM only): `importShops(records, {mode})`, `previewImport(records, {mode})`, `exportShops(ids?)`.
- `scripts/validate-content.mjs` checks Shop, Service and MerchantList records with the same rules; field reference in `docs/shop-schema.md`.
- Saved data: additive only. Imported lines carry an `importKey` so a later update finds them again; existing shops are unchanged. No migration.

## 0.20.1 — 2026-10-21

- **Fix:** a container dropped from a compendium into the party stash now brings its contents (nested containers too, links kept).
- The party stash and the shop editor now read drops with the shared Ashen Gate item-drop helper (`ag-item-drop.mjs`, same file as Quest Log and the other modules). Refusals use its wording: "Drop an item.", "Drop items one at a time." (a folder on the stash list), "That item no longer exists or you can't see it." The shop editor still takes folders (up to 100 items per folder) and a compendium container dropped on a shop now lists its contents too.
- Unchanged: moving items between characters and the stash (all or nothing), the take-out vote, history, purse, gold and shops. Players still can only stash items from their own characters.
- Saved data: no change. No migration.

## 0.20.0 — 2026-10-21

- **Merchant lists** (GM: Shops → Merchant lists): group a city's shops and services in order, then **Show to players (read only)**. Players get Shops → **Merchant list**: each entry with **Look inside** (read only, Buy / Sell / Bank off with "Ask the GM to open this") and an **Open** badge when it is presented to them. A list never lets anyone buy, sell or use a service, also in the API and on the GM client.
- **Services:** **New service** on the Shops toolbar; the editor shows a service type and its settings instead of items and coins. Present / Stop showing / Duplicate / Delete as for shops. A service type this version doesn't know is kept, listed as "Unknown service type", and never shown to players.
- **Bank** (first service): whose coins (character or party purse, no vote), change from, into, how many to get, a preview, **Confirm exchange**. Standard rates, whole coins only ("Ask for a multiple of 10 sp"), optional per-bank fee (0–50 %, default 0, rounded up, in the coin given), no electrum while it is off, unlimited coins. One coin update on the GM client; stash History `bank-exchange`.
- **API** (`api.shops`): `services.*` (`list`, `get`, `create`, `save`, `duplicate`, `delete`, `types`, `quote`, `use`), `merchants.*` (`list`, `get`, `save`, `setVisible`, `delete`), `browse()`. Socket `service-use`.
- Saved data: additive only. Services are new pages in the GM Data journal, lists use its existing lists page, shown lists are new Player View pages, and stash History gets `bank-exchange` entries. No migration.

## 0.19.0 — 2026-10-21

- **Selling to a shop** (design §7c, S1–S9): a shown shop with **Buys from players** on gets a **Buy / Sell** switch in its window. Sell lists the character's items with what the shop pays, and greyed items with the reason they can't be sold (containers, equipped or attuned, wrong type, *Not for sale*, no value). **Coins go to** the character or the party purse.
- **Sell…** or a drag from your own character sheet onto the shop window opens the sale: how many (stacks), what the merchant pays, from where, where the coins go and before → after, then **Sell item**.
- Price: percent × the item's own price × quantity, rounded down to whole copper. Paid from the merchant's coins (largest first, never ep), or unlimited with no purse. Can't pay: "Sorry, the vendor can't afford that." to the player, **Top up shop purse** whispered to the GM.
- The item goes into the shop: stock raised on the same item, or a new hidden line marked **Bought from players** in the editor.
- All or nothing on the GM client (shop page, then coins, then the item, last), in the same queue as purchases; failures put earlier steps back. Party purse sales go to stash History (`shop-sale`); every sale is in the shop's log.
- An open shop editor follows sales and purchases on its shop, so Save Changes no longer puts back sold stock or drops a sold-in line.
- **API** (`api.shops`): `quoteSell`, `sell` (player or GM).
- Saved data: additive only (a `soldIn` mark on sold-in lines, the `buys` summary in the player view). No migration.

## 0.18.0 — 2026-10-21

- **Present a shop** to all players (also those who log in later) or to chosen players: **Present…** on a shop row or in the editor, **Stop showing** to end it, **Open** to see it as players do. Rows show "Shown to all players" / "Shown to N players".
- **Players buy:** the shop opens in its own window for the players it is shown to (and in a new player **Shops** tab → Open shops). **Buy…** asks how many, which of your characters gets it, and who pays (party purse or a character's coins), then shows the total, what you pay, the change and what is left before **Confirm purchase**. Refusals end "Nothing was charged."
- **All or nothing on the GM client:** every purchase is checked again (Player Access, shops on, shown to you, item still for sale and unchanged, stock, your characters), then items, coins and the shop's stock and coins change in that order; a failure puts the earlier steps back, and the GM is whispered what to fix by hand if that fails too. One purchase at a time per shop; a repeated request is never carried out twice; a late GM answer is whispered to the buyer.
- **Party purse purchases** use the party vote when *Party must accept when a player spends the party purse* is on (GM Setup → Shopping; follows the coin vote until saved), and are listed in stash History. The merchant can't make change: exact payment if possible, else refused, with a **Top up shop purse** button whispered to the GM.
- **GM Setup → Shopping:** *Shops on for players* (off by default) and the purse vote above, saved with Save Changes.
- **API** (`api.shops`): `present`, `stopShowing`, `presented` (GM); `open`, `forMe`, `quote`, `buy` (player or GM).
- Saved data: new and additive only. A Journal **Utilities Shops (Player View)** (one page per presented shop, Observer only for the players it is shown to), two new world settings, a new stash History kind `shop-purchase`. Players never read the GM Data journal. No migration.

## 0.17.0 — 2026-10-21

- **New Shops tab (GM only for now)**, between Party Inventory and Roll Tables, with two parts: **Shops** and **Shop editor**. Players see nothing new yet.
- **Shops list:** search (name, merchant, place, item names, id), sort (Group by city, Name, Merchant, Recently changed), count, **New shop**. Shops are grouped under their city (the top of the linked location in Locations) with counts; each row shows the merchant's art or initials, merchant, place, item count, hidden items and cash ("Unlimited cash" or the coins), with **Edit** and **Duplicate**.
- **Shop editor:** shop name, merchant name and art (file picker; initials when empty), linked location (only while Locations is active), flavour text, GM notes. **Items for sale** table: price (number + coin), stock (blank = unlimited), flavour, cost (GM), Hidden, Remove (asks first). Drop items from a sheet, the Items sidebar, a compendium or a folder; a container brings its contents; the source item is never changed; a repeat is marked "Already in this shop". **Restock** puts stock back to where it started.
- **Merchant's coins** (off by default): Add / Remove / Set… with a reason and a labelled confirmation, **Restock cash**, *Show merchant's coins to players* (on by default). **Buys from players**: switch (off), percent (50), item types; saved now, used in a later version.
- Cancel bottom-left, Save Changes bottom-right; **Delete shop** in a Danger zone, with a confirmation; refused while a shop is shown to players. A deleted shop's id is never reused.
- Electrum follows *Use electrum*: no ep in prices or coins while it is off.
- **API:** `api.shops` (`ag-utilities-shops/1`): `list`, `get`, `create`, `save`, `duplicate`, `delete(id, {confirm: true})`, `addItems`, `restock`, `adjustPurse`, `setPurse`, `restockCash`, `log`. Every call is GM only (`GM only.`).
- Saved data: new, additive only. A Journal **Utilities Shops (GM Data)** with no player permission, made on the first save and found by its flag. No existing setting, flag or document changes; no migration.

## 0.16.1 — 2026-10-21

- Shared UI kit 2.1.0 and dialog helper: choice dialogs follow the Ashen Gate look (Cancel on the left, the choices on the right); red buttons, badges and grey text on selected or striped rows are easier to read in every skin (at least 4.5:1); a hidden empty state stays hidden; disabled list rows keep readable text.
- No behaviour or saved-data changes.

## 0.16.0 — 2026-10-21

- UI standard look (same layout): header shows Appearance, then the version, then Help; tabs scroll sideways on narrow windows and History / GM Setup are marked GM-only; buttons, badges, fields, empty states and tooltips use the shared kit. Award Gold looks the same everywhere; a finished check shows a big Success / Failure verdict.
- **GM Setup:** Cancel bottom-left and Save Changes bottom-right in the window footer. Player Access saves only with Save Changes, like every other GM Setup setting (same setting); Cancel puts the boxes back to the saved values.
- Party stash rows are striped; the search box and item count sit in the stash toolbar. Window sizes follow General Manager's Comfortable size; narrow windows reflow by window width, not screen width.
- No saved-data, setting or flag changes.

## 0.15.1 — 2026-10-21

- Confirmations name the action (no more Yes/No), Help opens with a Close button, dialogs follow the Ashen Gate look; test wording removed from player views.
- Header shows just the version (no "Alpha · GM/Player"); the "live acceptance pending" footer text is gone; the no-characters hint now reads "Add at least two characters to start a check." Confirm titles are questions; clearing history and undoing an award, conversion, purse change or condition removal use a red action button.

## 0.15.0 — 2026-10-21

- Shop rules for the coming Shopping feature (no visible change yet): prices in whole copper, change-making with an optional shop purse (exact payment, else "The merchant can't make change"), purchase checks, selling to a shop (sell value, checks, the vendor's payout, stock), the Bank's exchange quote, the player view of a shop or service (no GM data) and History entries. Electrum stays out of all of it while *Use electrum* is off.
- No saved-data changes, no new settings, nothing to click in Forge.

## 0.14.0 — 2026-10-21

- Shared UI kit 2.0.0: rounded compact look for shared parts, Comfortable size option (General Manager → My Appearance), shared dialog helper.
- Dialogs now come from the shared `ag-dialogs.mjs` (same behaviour, now skinned). Local result/check-bar classes renamed from `.ag-` to `.agu-` (no visual change).

## 0.13.2 — 2026-10-21

- **New GM Setup setting: Use electrum** (world setting, default **off**). Off: electrum (ep) is left out of the party purse (cp/sp/gp/pp), Award Gold, coin Deposit/Take, Adjust Purse and the embedded stash (Character Hub); an item priced in ep shows the same value in gp/sp/cp. ep moves and awards are also refused in the API and on the GM client, so nothing new is ever made in electrum. On: everything as before.
- **Money is never hidden.** If the purse still holds electrum while the setting is off, its ep line stays (dimmed) with a note, and the GM gets **Convert electrum to silver/gold**: all of it to silver (1 ep = 5 sp) or to gold (2 ep = 1 gp, an odd one → 5 sp). An exact before → after preview and confirmation come first; it's one purse update, recorded in stash History with **Undo**. Nothing converts automatically. Past History rows keep the coins they recorded.
- **API:** `api.currency` (`ag-utilities-currency/1`): `electrumEnabled()`, `coins()` (the coins to offer), `setElectrumEnabled(bool)` (GM only), hook `ashen-gate-utilities.electrumChanged`. `api.purse` gains `convertElectrum({to, reason})`, `undoConvert(entryId)`, `openConvert()` (GM only). `purse.coins` and `purse.totals()` still list all five coins.
- Character sheets (dnd5e) are not touched.
- Saved data: one new world setting `electrumEnabled`, and History entries of a new kind `purse-convert`. The purse still stores ep; no migration.

## 0.13.1 — 2026-10-21

- **Fix: a container (backpack, pouch…) moved to or from the party stash now takes everything inside it.** dnd5e keeps a container's contents as separate items pointing at the container; until now only the container itself moved, so it arrived empty and its contents stayed behind on the old sheet, loose (no longer in any container). Now the container and all its contents (nested containers too) move together, both directions, on every path: Utilities window, drag and drop, the Character Hub (`api.stash.deposit` / `withdraw` and the embedded stash) and the take-out vote. Quantities and all item data are kept; equipped/attuned are kept as before (no reset).
- **All or nothing.** Every copy is created and checked on the receiving side before anything is removed from the giving side. If any part fails, the copies are removed again, nothing is deleted from the source, and the player is told.
- Stash History, the vote prompt and the move message say what moved with it, e.g. "put Backpack (with 3 items inside) in the stash". Older entries read as before.
- An item taken out of a container (e.g. a pouch inside a backpack) arrives loose, not inside a container.
- Saved data: history entries for containers gain an optional `contents` count. No migration; existing items are not changed.

## 0.13.0 — 2026-10-20

- **`api.rolls.open({skills, dc?, mode, actorIds?, title?})`** (GM only), for partner modules such as Locations' Travel tracker: opens Utilities on **Rolls** with the *Start Rolls* form filled in (mode *Group result* or *Individual rolls*, ticked skills, DC, characters, title). Nothing is sent to players until the GM clicks **Start Rolls**, and every field can still be changed. If a roll is already running, the Rolls tab shows it as usual and nothing is replaced. Players calling it get `GM only.`
- No saved-data changes.

## 0.12.0 — 2026-10-20

- **New API `embed.mount(element, {actorId, mode: 'stash'})`** so a partner module (Character Hub) can show the real party stash inside its own window: the purse strip and the Items list with search, open item, Take, drag in and out, coin Deposit / Take and the GM's Adjust Purse. Returns `{unmount, refresh}`; it refreshes itself on stash changes. See the README.
- Same permissions as the Utilities window, enforced in the same functions: GM always; players need Player Access and the stash on; take-outs keep the party vote.
- The Utilities window is unchanged. No saved data changes.

## 0.11.0 — 2026-10-20

- **New read-only API `stash.listItems()`** for partner modules (Character Hub): `[{id, uuid, img, name, quantity, weight, value, type, typeLabel}]`, sorted by type then name; `[]` when there is no stash or it is empty.
- Same gate as the stash tab: the GM always; players are refused while Player Access is off or the stash is off for players. Listing moves nothing; the take-out vote is unchanged. Additive only: no saved data changes.

## 0.10.1 — 2026-10-19

- **New: separate coin vote setting.** GM Setup has **Party must accept when a player takes coins out**, independent of the item take-out vote. Off: a player's Take from the purse applies at once (same bounds, ownership and one-update-per-document rules) and the History entry reads "No vote needed". On: the existing vote prompt, unchanged.
- Default keeps today's behaviour: until the GM saves GM Setup, the coin vote follows the item vote; once saved it is independent. GM-only to change (world setting, and the API refuses players).
- The GM sees "Coin vote: on/off" under the purse strip; players' purse note reflects it. Help and README updated.
- Saved data: one new world setting `purseVoteRequired` (blank = follow the item vote). No migration needed.
- API: `api.purse.isVoteRequired()`, `api.purse.setVoteRequired(bool)` (GM-only).

## 0.10.0 — 2026-10-19

- **Fix: Party Inventory → Items column headers line up with their rows.** The last column was sized `auto` per row (empty in the header, a Take button in rows), so every grid worked out different widths and headers drifted. Header and rows now render the same cells from one column list and share one CSS template (`--agu-stash-cols`, fixed widths, no `auto`); the narrow layout uses the same rule for both. The last column is now headed **Action** (over Take); **Type** sits over the type text. Text sizes unchanged.
- **New: Party purse** strip at the top of Party Inventory → Items: five labelled counters (Copper, Silver, Electrum, Gold, Platinum) read from the stash Actor's dnd5e `system.currency` (the stash is a dnd5e NPC, which has currency; no new storage).
  - Players: pick their character, a coin and an amount, then **Deposit** (no vote) or **Take** (same party vote as items when *Party must accept* is on). The GM client re-checks ownership and amounts; never more than the giver holds, nothing goes negative, one update per document, only `system.currency.<coin>` changes. If the second update fails the first is put back.
  - GM: **Adjust Purse** (Add / Remove / Set to, optional reason, labelled confirmation). GM-only in the API (`api.purse.adjust`), not just the button. The GM sees and manages the purse even when the stash is off for players.
  - Stash **History** logs every deposit, take (including denied / timed-out) and adjustment with who, coin, amount, purse before → after and reason. GM **Undo** on adjustments and completed takes, once; refused (and the reason shown) if it would take the purse or the character below 0. Players see purse rows without the character's own coin totals.
- **Award Gold** now has a **Coin** choice (cp/sp/ep/gp/pp, default gp) with the same each/split and Undo logic. Older gold awards (no coin recorded) still read as gp.
- Saved data: additive only. New history kinds `purse-deposit`, `purse-take`, `purse-adjust`; gold awards gain `coin`. Old entries render unchanged. No migration needed.
- API: new `api.purse` (`totals`, `deposit`, `take`, `adjust`, `undo`, `openAdjust`); `awardGold` accepts `coin`.
- Not included: currency conversion / making change (possible follow-up).

## 0.9.0 — 2026-10-19

- **Group Checks** and **Roll Requests** are now one **Rolls** tab with one start form. Pick characters (the dnd5e Primary Party is ticked by default, else characters owned by connected players), skills, an optional DC, and a **Result** choice (default **Group result**):
  - *Group result* is the old Group Check: characters choose from the ticked skills, rolls per character 1–5, the average is compared with the DC, tally whispered to the GM.
  - *Individual rolls* is the old Roll Request: tick exactly one skill, one roll per character, each result shown on its own (Success/Failure per roll when a DC is set).
- Unchanged: one active roll at a time across both modes, GM-only Start/Skip/End/Cancel, the GM-client roll check and "Roll not counted" whispers, the player prompt and Roll Now, finished-result card, History.
- Saved data: none changed. History still labels entries Group Check or Roll Request, so old entries show as before. The old `checks`/`rolls` window tab ids both open Rolls.
- No public API changes (there was no start-roll API to keep).

## 0.8.0 — 2026-10-19

- New GM-only **Award Gold** (Party Inventory: next to the stash on/off toggle and in stash **History**). Enter gp, choose *each character gets this* (default) or *split evenly*, an optional reason, and tick characters. Default ticks: members of the dnd5e Primary Party, or characters owned by connected players when no Primary Party is set. A confirmation lists each character's gp before → after; a split pays whole gp only and any remainder is **not handed out** (it stays with you) and is shown before you confirm.
- Each character gets one update to `system.currency.gp`; no other coins or fields change. A chat card goes to the GM (or to everyone if ticked). The award is written to stash History with amount, characters, before/after gp, reason, time and GM.
- **Undo** on a gold History row takes the gold back from each character who still has at least that much, refuses (and names) anyone who has spent it, and never undoes a character twice. Players see only public awards in History, without gp totals.
- API: `api.awardGold({amount, mode, actorIds, reason, public})`, `api.undoGoldAward(entryId)` (also under `api.gold`); GM-only inside the API.
- Saved data: adds a `gold-award` entry type to the existing stash History list (additive; old entries render unchanged). Needs dnd5e currency; refuses clearly if `system.currency.gp` is missing.

## 0.7.3 — 2026-10-19

- A Group Check / Roll Request roll the GM client cannot count (the check already ended, the character's slots are used up, the roll proof doesn't match) is no longer dropped silently: the player and the GM get a whispered "Roll not counted: <reason>" chat line. Before, the player only saw "awaiting GM acceptance" forever.
- No saved-data or permission changes.

## 0.7.2 — 2026-10-19

- Skip / End / Cancel on a check, Clear stash history and Remove a non-native condition now use Foundry dialogs instead of the browser's `confirm` (which the desktop app lacks). Each has a labelled action button, with Cancel on the left. The test-fixture reset prompts do the same.
- New **Help** button in the header (draft text).
- No saved-data or permission changes.

## 0.7.1 — 2026-10-19

- If a finished Group Check's tally can't be posted to GM chat, the GM now gets a warning notification instead of a console-only message. The result itself was already saved and still shows in Group Checks and History.
- No saved-data or permission changes.

# Changelog — Ashen Gate | Utilities

## 0.7.0 — 2026-10-19

The party stash now lives inside the Utilities window; there is no separate stash window any more.

- **Party Inventory** tab hosts the stash: item list with details, search, Take, and an **Items / History** sub-tab. The "Open Party Stash" button is gone.
- Drop an item from any character sheet (Tidy5e included) anywhere on the Party Inventory tab to stash it; the tab outlines and the drop strip lights up while you drag. Drag a row onto a character sheet to take it out.
- Rules unchanged: whole stacks, party vote (GM toggle, GM never voted on, 60 s timeout), History log (GM clears), GM-side writes, stash on/off for players. No saved-data changes; the `stash` API keeps its shape (`stash.open()` now opens Utilities on Party Inventory).
- Utilities can be resized narrower (min 360 px); the item list collapses to a compact layout when the window is narrow.

## 0.6.1 — 2026-10-19

- Actors sidebar launcher is the full-width row under the other launchers. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.6.0 — 2026-10-19

Party stash: optional take-out vote and a history log.

- New GM Setup checkbox **Party must accept when a player takes an item out**. On (the default, same as 0.5.x): any other player can deny, and no answer in 60 seconds cancels. Off: a player withdraws freely with no vote. The GM is never voted on. The primary GM client checks the setting when it runs the move, so a player client can't skip or force a vote.
- New **History** tab in the Party Stash window: every deposit and take-out with who (player and character), the item (icon, name, quantity), how it was approved (party accepted, party denied, no answer in time, no vote needed, GM), and real and world time. Denied and timed-out take-outs are listed too. Players can read it while the stash is on; only the GM can clear it (with a confirmation).
- The log is written only by the GM client, stored in the new hidden world setting `stashHistory`, and keeps the latest 500 entries (oldest trimmed). It shows 50 at a time with **Show more**.
- API (additive): `stash.isVoteRequired()`, `stash.setVoteRequired(bool)`, `stash.history()`, `stash.clearHistory()`. Existing calls are unchanged.
- New world settings `stashVoteRequired` (default on) and `stashHistory` (default empty). No migration needed.

## 0.5.0 — 2026-10-18

Party stash overhaul.

- The party stash has its own **Party Stash** window instead of opening the Actor's features tab. Each item shows its icon, name, quantity, weight, value and type, grouped by type, with a search box. Click a name to open the item's sheet.
- GM world toggle (GM Setup, or Party Inventory → **Turn On for Players**). Off by default; while off, players can't see the stash or move items. While on, players get Observer permission on the stash Actor so item sheets open read-only.
- **Drag in:** drag an item from your own character sheet onto the Party Stash window. The GM client moves it (no copy left behind).
- **Take out:** drag a row onto your character sheet, or use **Take**. Every other connected player gets an Accept/Deny popup. Any deny, or no answer within 60 seconds, cancels and the item stays. On approval the GM client moves it. Dragging a stash item onto a sheet never makes a native copy.
- The GM moves items freely: drag from any sheet into the stash, drag a row onto any sheet, or use Take with any character. No vote.
- Player actions are checked again by the primary GM client (stash on, Player Access on, you own the character); the player's own client never edits the stash.
- New world setting `stashEnabled` (hidden, default off). No migration needed: the existing stash Actor is reused.

## 0.4.0 — 2026-10-18

Conditions overhaul.

- Players now see the same Conditions view as the GM, for every party character they can see (Limited permission or better). The GM still sees every character.
- Per-character removal lock, set by the GM in the Conditions tab (**Unlock for Owner** / **Lock Removal**). Every character starts locked. When a character is unlocked, its owner can remove its conditions.
- The lock is enforced, not just hidden: a player's removal is sent to the primary GM client over the module socket, which checks ownership and the lock again before removing. A locked, unowned or forged request changes nothing, and the player is told why.
- New **Pop Out Overlay**: a mostly transparent window with each character's name in bold, then a bulleted list of their conditions, with a small × where you may remove one. It is a per-user toggle, remembers where you put it, and updates live.
- Custom statuses work as in 0.3.x: marked Custom, traced to their source effect, and the GM can always remove them. Players can't remove Custom statuses, even when unlocked.
- New settings: `conditionUnlocks` (world, hidden, starts empty, so everything is locked), `overlayOpen` and `overlayPosition` (per user). No migration needed. The module now uses a socket (`"socket": true`).

## 0.3.1 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- The Actors-sidebar launcher buttons now match the Manager and Location Builder buttons in the Items sidebar, with padding inside the sidebar edges.
- New **Appearance** button in the header, for players and the GM. It opens General Manager's My Appearance window, and it is hidden when Manager isn't active.

## 0.3.0 — 2026-10-18

Beta-feedback quick wins.

- Group Check: the finished result now stays on screen for everyone until the GM clicks **Clear Result** (or starts the next check). It is also still saved to History.
- Group Check: when a check finishes, the GM gets a whispered chat message tallying every character's roll, the average, the DC and the verdict.
- Group Check: bigger type, and a segmented check bar that lights up as each roll comes in.
- Group Check: the roll form shows each character's skill bonus, and pre-selects Advantage or Disadvantage from the character's sheet and active effects (dnd5e roll modes, plus Midi-QOL style effect flags). The player can change it before rolling. The GM sees each pending character's bonuses for the allowed skills.
- RollTables: tables with document or compendium results can now be rolled. Utilities uses Foundry's own `RollTable#draw`, lists the drawn documents with an Open button and sends them as `@UUID` links.
- Conditions: statuses Foundry does not list (for example "magical" or "thinking" on imported characters) are marked Custom, traced to the effect that grants them, and linked to its source when known. The GM can always remove them: effects on the Actor are deleted, effects inherited from an Item are disabled instead of editing the Item.
- New setting `lastResult` (world, hidden) holds the finished check; no migration needed, it starts empty.

## 0.2.4 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

## 0.2.3 — 2026-10-18

- Fix: opening the Utilities window failed in Foundry V14 with "Cannot add property minWidth, object is not extensible". ApplicationV2 window position doesn't accept `minWidth`/`minHeight`; the minimum size is now set in CSS.

## 0.2.2 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## 0.2.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## 0.2.0 Alpha — 2026-10-17 — Uncommitted review candidate

- Group Check resolve/archive/clear path, early end with audited skips; one active interaction without stale cross-tab mirroring.
- Dedicated Group Check and Public Roll Request surfaces; automatic pending-roll player prompt and larger Roll Now button.
- Detailed GM session History with individual DC comparison and group results.
- Party-native Condition overview, remote ActiveEffect refresh, native icon presentation.
- RollTable text-only preflight before rolling, including fail-closed document results.
- GM-only Observer-independent stash preview, minimum window size, compact controls and Actors launcher rank 60 group.
- GM-only real Foundry fixtures, 32 manual tests with outcome/notes on same row, and 57 passing source tests.

## 0.1.0 Alpha — 2026-10-16 — GitHub published prior release

- Initial Group Checks, public skill Roll Requests, text RollTable Messenger, native conditions, and GM-only Party Inventory preview.
