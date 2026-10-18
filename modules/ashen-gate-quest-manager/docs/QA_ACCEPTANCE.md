# Quest Manager v0.3.0 Alpha — source-level QA

**Automated local result:** 87/87 Node tests passed on 2026-10-16; all five module JavaScript files passed Node syntax checks. Tests run with synthetic records and mocked Foundry journal/module/role APIs. No live Foundry V14 GM/player acceptance claimed. See `TEST_RESULTS_v0.3.0.txt` for the captured output and `V14_HANDOFF.md` for user-run acceptance.

**Covered by automated tests:**
- Exact source ID + logical type, no display-name fallback, Manager on/off native world lookup, archived records, duplicate conflicts, source lifecycle and type mismatch.
- Player-safe Objective publication; Hidden/status/reveal-gated and GM-only objective filtering; Party and Individual Actor ownership and GM permission bypass; explicit per-Objective reveal, permissions for notes.
- Both historical v0.2 permission regressions: deleting an Individual record removes stale notes access and converting Individual→Party replaces restrictive ownership.
- Quest-owned GM-only ASSIGN records, typed required target, independent execution status/results, GM-only API, deletion guard and ambiguous duplicates.
- Mock module bootstrap; Player Access denial even through direct API; a second user with no Journal permission gets an opaque unavailable result.
- Source definition `status` does not change as any of five campaign status values changes; reimport/edit does not reset campaign reward/progress state.

**Not validated:** Actual Foundry V14 module installation, UI click behavior, network synchronization, player/GMs connected simultaneously, multiuser Journal backend permission enforcement, appearance skin refresh, Manager package v0.11.x runtime API, world/compendium resolver cross-talk, `ag-foundry-import/0.2` Manager import of Objective source content, production data migration.

Original v0.1.0 source ZIP was not available in a verified editable form; v0.3 is a standalone **fresh-world alpha candidate**, not a validated in-place migration. Back up worlds before any experiment.
