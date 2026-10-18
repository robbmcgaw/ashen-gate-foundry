# Source fixture pin — AG-WORK-0002 / 0020

- **Authoritative pinned source chain (source snapshot):** `systems/professions/fixtures/AG_WORK_0002_Material_Recipe_Item.json`
- **Required-reference-closed Manager import:** `systems/professions/imports/AG_Professions_PinnedChain_v0.1.1_ManagerImport.json`
- **Source ZIP SHA-256 reported in the pinned fixture:** `c9b892e7ea369da39733d4a244e26383de1348f0e4d5ce23c5d5bfc6466c9deb`
- **Canonical source member SHA-256:** `b653111f72ff488210dd46752bac587a6ac286b81118f12636e3e2b6d54f0356`
- **Pinned three-record chain:** `MAT-HERBALISM-APPRENTICE-COMMON` → `REC-ALCHEMY-FIELD-MEDIC-S-SALVE` → `ITEM-ALCHEMY-FIELD-MEDIC-S-SALVE`.
- **Required PROF definitions:** `PROF-ALCHEMY`, `PROF-HERBALISM`; the nine-record import includes other required Alchemy starting Recipe + Item definitions to close refs.

The source fixture is a pinned **draft content snapshot**, not fabricated 'Test Mode' output and not proof of approved effects. Neither the module ZIP nor Ledger UI automatically seeds Actor experience, recipe learning, or inventory. No new Perk effect is invented.

## Self-contained v0.7.0 test files

- `qa/fixtures/AG_Professions_PinnedChain_v033_Source.json`: nine **unaltered** source definitions (plus extraction metadata).
- `qa/fixtures/AG_Professions_PinnedChain_v033_ManagerImport.json`: generated `ag-foundry-import/0.2` subset using the original v0.3.3 Foundry projections, with only the package wrapper changed.
- `tests/authoritative-source-chain-v070.test.mjs`: executable source-to-projection value/ref equality checks.

Use those files for setup/testing rather than fictional demo Actors.
