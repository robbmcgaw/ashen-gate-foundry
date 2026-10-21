# Shopping brief 5: Merchant lists, services and the Bank (Utilities 0.18.0)

Self-contained brief for a build chat. Read `CLAUDE.md`, then on branch `design/shopping` `docs/shopping-design.md` (final) §3 (Service record, Merchant list), §7b and §9 (D6, D13, D14), and `docs/ui-standard.md` (final). Mockup: https://claude.ai/artifact/8danqfZAjEWaTi1o55rprj (GM → Merchant lists, New Service; Player → Merchant list, Counting House).

**Waits for:** 0.16.0 on main. It can be built beside 0.17.0 (different files mostly); whichever merges second merges `main` in first. Branch `utilities-0.18.0-lists-services`.

## Goal
The GM shares a city's shops and services as a read-only list, and can add services. The first service type is a Bank that changes coins.

## Merchant lists
- GM sub-tab **Merchant lists**: `.ag-card-grid` of lists (name, linked city via Locations when active, shops and services in order, `.ag-badge` Players can browse / Hidden), **New merchant list**, an editor (`formDialog` or a small editor pane: name, city, ordered picks from saved shops and services), switch **Show to players (read only)**, Delete (confirm, danger).
- Stored on the GM Data journal's lists page; a shown list gets a Player View page readable by all players, holding the projections of its entries.
- Player sub-tab **Merchant list**: lists shown by the GM, entries as `.ag-rows` (name, merchant, place, item count or "Bank", `.ag-badge--ok` Open when presented to them), **Look inside** opens the read-only view. Buy, Sell and Bank actions are disabled with "Ask the GM to open this" unless that entry is presented to the user. Empty state: "Your GM hasn't shared a merchant list."

## Services
- Record per §3 (`SVC-*`, `kind: 'service'`, `service: {type, settings}`), stored like shops. **New service** on the Shops toolbar; the editor shows a service-type select and that type's settings block instead of item lines and the coin purse. Present / Stop showing work as for shops.
- A registry `SERVICE_TYPES` in Utilities: `{id, label, defaults, checkSettings, renderEditor, renderPlayer, quote, execute}` (§7b). `api.services` (`list`, `get`, CRUD, `types()`, `quote`, `use`), socket `service-use` on the same queue, gates and receipts as purchases. Unknown types: kept, listed for the GM as "Unknown service type", never projected.

## The Bank
- Settings: `feePercent` 0–50, default 0.
- Player window: Whose coins (`.ag-segmented` <character> / Party purse, "no vote needed"), Change from, Into (coin selects from `coinChoices(electrum)`), How many to get, preview from `bankQuote` (You give, You get, before → after), **Confirm exchange**. Refusals in `.ag-notice--danger`.
- GM client: re-run `bankQuote` on fresh coins, one currency update with both coins (all or nothing by itself), stash History `bank-exchange`, receipt. Party purse: no vote (D13). The bank has unlimited coins.

## Tests
List visibility and page ownership; read-only refusals in the API for buy/sell/use from a list; service projection; unknown type hidden; bank conversions both directions, multiple rule, fee, ep off, refusal when short, party purse path with no poll, History entry.

## Done when
- Check green; version 0.18.0; CHANGELOG; README "Merchant lists" and "Services: Bank".
- Tell Robb what to click: make a list for a test city with two shops and a Bank, show it to players; as a player browse it and check you can't buy; Present the Bank to one player and change 2 gp into silver, then party purse copper into gold; set a 10 % fee and try again; hide the list.
