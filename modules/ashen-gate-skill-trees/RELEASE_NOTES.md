# Skill Trees v0.6.0 Alpha — AG-COORDINATED-BUILD-2026-10-17

**Source base:** live GitHub `main` `89da7ab854fa87e1b2b77dfdd19c4e16f0b5c5f8`; local, uncommitted implementation. **Module ID:** `ashen-gate-skill-trees`. **Foundry:** minimum 14; target user's reported Stable 9 build 367 / Forge / dnd5e 6.0.6; no actual V14 run.

**Feedback implemented:** FB-2026-10-16-001 (Skill Trees Actors button moved to the shared vertical shelf, rank 30 with common metadata); FB-2026-10-16-003 (Player Access row and toolbar/control density adjusted for content-fit); v1.7 real-data QA requirement (GM-only native Actor/Items plus private layout installation/reset, no demo-only Test Mode); window reopen and clearer unavailable `PERK-*` purchase controls. All module-specific state and public APIs remain versioned and independent; no Ledger code touched.

**Installable:** `AG_ashen-gate-skill-trees_v0.6.0_Alpha.zip`. Source and test kit archived separately. No persisted schema changes or implicit state migration. On upgrade, previous layouts and Actor wallets remain as-is. Running the fixture installer and the normal GM point controls explicitly changes only QA test-world records/progress.

**Automated evidence:** `node --test tests/*.test.mjs` **61 pass, 0 fail**; syntax/JSON/fixture schema/ZIP and source SHA verification passed. Launcher sibling-coexistence, QA cleanup guard, world-only source permissions, player access, Cinder/generic wallets and Ledger-only perk authority covered by source/mock tests. Actual GM/player Foundry V14 results: **NOT RUN**. Main/edit screenshots: **NOT CAPTURED**.

**Known limitations:** no direct compendium/provider read and no owner reveal policy for `reveal_gated`; no approval of real Cinder or Profession mechanics, no automatic Feature grant, no integration with Tim's forthcoming Ledger release yet, no multi-GM write transaction guarantee. QA Features are synthetic `draft` and GM-only and do not count as live Manager imports. See README for setup/reset. The earlier test-lab Manager `structuredClone(Window)` failure remains Borris-owned and has not been attributed to Skill Trees.

**Next gate:** Sally/Stu exact-pin integrated package after all module builds are available, including Tim's canonical source chain; user-run Forge Foundry V14 GM/player click-through and screenshots after assembly. **Do not publish this local module code until user authorizes it.**
