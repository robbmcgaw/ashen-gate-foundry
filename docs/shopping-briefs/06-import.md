# Shopping brief 6: Import and export (Utilities 0.19.0, then General Manager)

Self-contained brief for a build chat. Read `CLAUDE.md`, then on branch `design/shopping` `docs/shopping-design.md` (final) §8 and `docs/shopping-for-gpt.md` (final; it is what ChatGPT writes to). Look at how Locations and Routes import (`docs/routes-schema.md`, Locations README "Import") and copy their shape.

**Waits for:** 0.18.0 on main (services and lists must exist). Two PRs: Utilities first (`utilities-0.19.0-shop-import`), then Manager (`manager-shop-import`), which feature-detects `api.shops.importShops`.

## Utilities 0.19.0
- `api.shops.importShops(records, {mode: 'create' | 'update'})` (GM only) for `entity_type` `Shop`, `Service`, `MerchantList` in an `ag-foundry-import/0.2` package; returns per-record `{id, result: 'created' | 'updated' | 'kept' | 'skipped', reason?}`.
- Rules from §8: existing ids are kept unless `update`; update replaces name, merchant, flavour and lines from the file but keeps stock left, presentation, sales, the current shop purse and GM-added lines; `purse` / `show_purse` / `buys` apply on create (`buys` only once Robb confirms the sell details); `presented` always null; lists import hidden; retired ids refused.
- Lines resolve `item_id` through `flags.ashen-gate-manager.source.sourceId`, then `item_uuid`; unresolved lines are skipped and reported, the rest of the shop imports. Prices `{value, denomination}` → copper; `ep` refused while *Use electrum* is off.
- **Import JSON** on the Shops toolbar (kit `--sm` button): preview with `.ag-badge` per record (create / kept / skipped with reason), switch "Update shops that already exist", **Import N** primary. `exportShops(ids?)` and **Export** produce the same format.
- `docs/shop-schema.md` (field tables from the GPT doc, synthetic example) and a check in `scripts/validate-content.mjs` for Shop, Service and MerchantList records.

## General Manager (separate PR)
Route `Shop`, `Service`, `MerchantList` records to Utilities after the package's Items are created, in the same run, when `api.shops.importShops` exists; otherwise report them as "Needs Utilities 0.19.0". Preview lists them like Routes.

## Tests
Create / keep / update rules; GM edits survive update; unresolved item lines; ep refused while off; retired ids; validator accepts the synthetic example in `docs/shopping-for-gpt.md` and refuses broken copies.

## Done when
- Check green; Utilities 0.19.0 and the Manager minor bump; CHANGELOGs; READMEs. GPT sync: the GPT doc and the supplement copy say the import is built.
- Tell Robb what to click: General Manager → Import the synthetic package from the GPT doc (Items first); check the shop, the Bank and the list arrive, the list hidden; import again (kept); import with Update after editing a price by hand (the hand-added line survives).
