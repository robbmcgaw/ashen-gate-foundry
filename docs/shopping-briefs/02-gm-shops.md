# Shopping brief 2: Shops tab for the GM (Utilities 0.15.0)

Self-contained brief for a build chat. Read `CLAUDE.md`, then on branch `design/shopping` `docs/shopping-design.md` (final) §2–4 and §9, and on branch `design/ui-standard` `docs/ui-standard.md` (final). Mockup (behaviour and content, not styling): https://claude.ai/artifact/8danqfZAjEWaTi1o55rprj, GM view, Shops and Shop editor.

**Waits for:** brief 1 (0.14.0 shop rules) **and kit 2** (UI brief 1, branch `ui/kit-2`, shared `ag-ui.css` 2.0.0 and `ag-dialogs.mjs`) on `main`. Branch `utilities-0.15.0-gm-shops` from `main` after both. Never copy kit parts locally to get ahead.

## Goal
The GM can build, find and manage shops. Players see nothing new yet (the tab is GM only in this version).

## Storage
- Journal **Utilities Shops (GM Data)**, no player permission, found by `flags.ashen-gate-utilities.store = 'shops-gm'` (never by name), created on first save. One page per shop with the record in `flags.ashen-gate-utilities.shop`; one page for lists and `retiredIds`.
- Records through `normalizeShop` / `normalizeLine` from 0.14.0. Saving is GM only **in the API**, not just the button.
- Additive only; nothing existing changes. Creating the journal is re-runnable.

## UI (kit 2 only, direction D Rounded Compact, both sizes)
- New tab **Shops** between Party Inventory and Roll Tables, `.ag-tab--gm` for now. Sub-tabs (`.ag-segmented`): **Shops**, **Shop editor**.
- **Shops list:** `.ag-toolbar` with `.ag-search` (name, merchant, place, item names, id), sort select (Group by city (default), Name, Merchant, Recently changed), count, then **Import JSON** (disabled with a tooltip until 0.19.0, or left out) and **New shop** on the right. `.ag-rows` grouped under `.ag-eyebrow` city headings with counts; each row: art or initials, name, merchant, place, item count, `.ag-badge` for hidden items and cash ("Unlimited cash" / coins), row actions Edit, Duplicate (`--sm`). Empty and no-match states with `.ag-empty`.
- **Editor:** `.ag-form-grid`: shop name, merchant name, merchant art (file picker, initials fallback), linked location (select from Locations' `api.listLocations()` when Locations is active; otherwise hidden), flavour text, GM notes (`.ag-gm-flag`).
  - **Items for sale:** `.ag-table` with item (image, name, canonical id in mono for the GM), price (number + coin select from `coinChoices(electrum)`), stock (blank = unlimited), flavour, cost (GM), Hidden switch, Remove (`--icon`, confirm). Drop zone under it.
  - **Merchant's coins:** switch "This shop has its own coin purse" (default off); coin strip; **Add / Remove / Set…** (`formDialog`, reason, labelled confirm), **Restock cash**; switch "Show merchant's coins to players" (default on).
  - **Buys from players:** switch (default off), percent (default 50), item types (chips, default all). Saved now, used in 0.17.0.
  - **Restock** (stock back to `stockStart`).
  - `.ag-footer`: Cancel left, Save Changes right. **Delete shop** in a Danger zone at the end, `confirmDialog({danger: true})`, refused while presented (0.16.0).
- **Drops:** Items from a sheet, the Items sidebar, a compendium or a folder. Use the shared item-drop helper if `design/rewards-loot` has landed on main; otherwise a local helper with the same name and behaviour, flagged in the PR. A container comes with its contents (`containedItems`). The source is never changed. "Already in this shop" warning for a repeat.
- Electrum: follows `electrumEnabled()` and re-renders on `ashen-gate-utilities.electrumChanged`.

## API (`api.shops`, contract `ag-utilities-shops/1`; every call checks GM)
`list({search, sort})`, `get(id)`, `create(data)`, `save(record)`, `duplicate(id)`, `delete(id, {confirm: true})`, `addItems(id, uuids | dropData)` → `{added, skipped}`, `restock(id, lineIds?)`, `adjustPurse(id, {op, coin, amount, reason})`, `setPurse(id, coins | null)`, `restockCash(id)`. Players get `GM only.`.

## Tests
Storage create/find by flag, GM-only refusals in the API, drop handling (folder, container, non-Item skipped), duplicate keeps lines and drops `presented`, delete moves the id to `retiredIds`, purse adjust never below 0, ep hidden while off. Mock Foundry as the existing tests do.

## Done when
- `node scripts/check.mjs ashen-gate-utilities` green; version 0.15.0 (module.json version + download URL, `core.mjs`); CHANGELOG; README "Shops (GM)" section.
- Tell Robb what to click: Utilities → Shops → New shop; drop a few items from the Items sidebar and one backpack with contents; set prices, one stock, one hidden item; turn on the coin purse and add coins; Save; search and sort; Duplicate; Delete the copy. Check Compact and Comfortable sizes and one light skin.
