# Ashen Gate | Profession Ledger v0.7.0 Alpha — coordinated build release

**AG-COORDINATED-BUILD-2026-10-17 / AG-WORK-0020.** Built from the verified v0.6.2 module source, matching its published main.js SHA-256 (`6499e8e593b7d4dbf22f3f8b1bcfc3df9d987379986bcf45ac1b0ce46ae1d4c5`). GitHub main reviewed: `89da7ab854fa87e1b2b77dfdd19c4e16f0b5c5f8`. **Published on GitHub main; see the matching release receipt and Work Queue pin.**

## Changes

- Removed the GM-facing fictional demonstration mode and its public API option. No in-memory 'Demo' actors, recipes or material cards may be selected as live data.
- Ledger continues to use actual Foundry Actor roster and native Manager-tagged world definition Items; source names/typed references and Actor-owned progression rules are unchanged.
- Updated registration and UI tests for real-only views and current version.
- Added self-contained nine-record, unmodified Professions source + Foundry import fixture, reversible real-world setup/reset, exact-format cases and local test receipt.

## Verification and limits

- `node --test tests/*.test.mjs`: **78 passing, 0 failing** (Node/mock).
- No live Foundry V14 execution, multi-client check, or deployed Forge installation performed by Tim.
- World-only native resolver fallback; full Archie resolver compendium/provider/refresh remains a named integration gate. No player reveal-gate policy is inferred.
- No Actor state schema change, migration, or intentional existing XP/learned Recipe/selected Perk alteration. No Skill Trees modifications.
- Reference data package is draft; import in the disposable test world only.

**Compatibility target:** Foundry V14 Stable 9 build 367, dnd5e 6.0.6 (user-reported), **not runtime-verified**. Existing module ID retained; v0.6.2 remains rollback candidate.
