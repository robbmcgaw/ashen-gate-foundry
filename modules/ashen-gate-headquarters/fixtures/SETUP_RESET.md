# Headquarters v0.6.0 — Live fixture setup/reset (GM only)

**Testing target:** Foundry V14 Stable 9, dnd5e 6.0.6, separate GM and player clients. **No live test has been performed for this build.** Use an exported/duplicated disposable world. Never activate test Guildhall IDs on a live campaign.

## Prepare

1. Back up or duplicate the **entire** Foundry test world (settings, Actors, Items, Journals). Keep an untouched snapshot; restoring it is the only supported **complete HQ campaign-state reset**.
2. Install the ZIP in the `Data/modules/` modules directory as `ashen-gate-headquarters`. GM logs in first to initialize/migrate the private Journal; players connect/reload afterwards. Retain the original `aghq-state/0.1` private Journal.
3. Open **Actors → Open Headquarters**. On an empty world, GM activates with existing `HQ-*`/`LOC-*` canonical source IDs; for an isolated synthetic fixture use `HQ-AGTEST-GUILD`, `LOC-AGTEST-GUILD` ONLY when the corresponding test source identities have been defined in the test pack. Never imply the module creates Location definitions.
4. Import real HQ catalog content from `fixtures/HQ_Test_Facility_Catalog_v0.6.0.json`: GM Setup → Facility Catalog → **Import Facility Definitions JSON** → select the extracted file. This persists validated `FAC-AGTEST-*` records in HQ's canonical domain-state catalog. Use **Unlock** → **Acquire +1** → Guildhall Builder → **Edit Guildhall** → drag copy.
5. To create **real native Item documents** for hosted HIRE/HPERK lookup, open the **GM browser F12 → Console** and run exactly:

```js
await import("/modules/ashen-gate-headquarters/fixtures/test-records.mjs").then(m => m.install())
```

The installer creates **two new test-labeled world Item documents** (HIRE-AGTEST-SMITH, HPERK-AGTEST-WORKING), with structured canonical `flags['ashen-gate-manager'].source` metadata and GM-only ownership. They are not fake preview rows and do not modify world campaign personnel or any Actor. They appear under typed Item folders `Ashen Gate / Headquarters / Test Fixtures`; installation fails if either source ID already exists (no overwrites).
6. As GM, open HQ → Hirelings, choose `TEST ONLY — Smith` in the imported source selector and **Add to roster**. Working and station state now live in Headquarters' GM-only private Journal, not on the Item definition. For two-client checks, create a personal room for a player and ensure they own at least one Foundry Actor.
7. For actual image fitting, GM Setup → Background asset path `modules/ashen-gate-headquarters/assets/hq-framing-test.png`. Its four labeled corners are intentionally conspicuous. Change `Image fit`, X/Y and opacity and click Save Changes. The image is a source-created 1600 × 1000 grid and not campaign art.

## Reset

On the **GM browser F12 → Console**, remove **only fixture-tagged native Item documents**:

```js
await import("/modules/ashen-gate-headquarters/fixtures/test-records.mjs").then(m => m.reset())
```

This is non-destructive to unrelated Items but **does not delete** HQ-owned catalog/inventory, activation, Guild Rank, layouts, Working/personnel history or room state. The script refuses to delete untagged Items. You must confirm before deletion. It intentionally leaves empty Item folders alone to preserve other authored content.

For a **full reset**, stop testing and **restore the original test-world backup**. Do not delete or manually reset the private HQ Journal in-place, clear world settings, or downgrade to v0.5.1; doing so risks save loss or exposure. Never treat fixture cleanup as permission to wipe gameplay data.

## Notes

- Fixture IDs use AGTEST and are drafts with provenance; **not approved Ashen Gate lore or mechanics**. Facility benefits are descriptive, not Actor bonuses.
- A `HIRE-*` world Item must have exact source ID/logical `entity_type` and owner permissions. This importer is for test fixtures only; production definitions remain under Manager/source packages.
- The fixture setup route is an actual GM-operated Foundry document-write action. It is not a runtime "Test Mode" that fabricates an empty UI or success messages.
- Player edit uses the existing authenticated Actor-update bridge; the added active-GM fallback needs live two-client evidence. If no GM receipt arrives, preserve logs; do not switch to a caller-claimed socket sender.
