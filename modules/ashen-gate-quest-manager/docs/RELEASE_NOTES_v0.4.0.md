# Quest Manager v0.4.0 Alpha — unpublished candidate

**Work:** AG-WORK-0015, FB-2026-10-17-032/033, AG-FOUNDRY-DEV/1.7. **Base:** published v0.3.1 source at GitHub release commit `5c0a4b80571c966d770db8e51db53b1b702986d5`; working repository HEAD inspected `89da7ab854fa87e1b2b77dfdd19c4e16f0b5c5f8` on 2026-10-17. No changes published to GitHub.

## Changes since v0.3.1

- Normal GM Quest editor for type, ID, title, player summary, issuer description, definition visibility and per-objective goals/reveal setting; canonical JSON behind Advanced. Distinct GM campaign status/reveal control with publication guidance.
- Player Party/Individual Quest Log with search, status filter, persistent per-user **Track** checkboxes, and optional screen overlay displaying only sanitized already-published goals for one or more tracked Quests.
- Player Interface show/hide moved from Foundry Game Settings into GM Setup, still backed by original `playerAccessEnabled` world setting/API so optional Manager remains compatible. Companion `compendiumPackIds` setting explained and moved under Advanced GM Setup; existing values preserved.
- Shared Actors launcher shelf rank 50 and display title `Ashen Gate | Quest Manager`.
- Six actual Objective import records, one Quest-owned Assignment record, setup/reset instructions, exact console commands and copyable five-column manual tests.
- Added tracking and UI/API permission tests. Existing Quest/Assignment state storage, Objective resolver pin, campaign lifecycle, publication and owner permissions remain unchanged.

## Semantic limits

- This is a **candidate** implementation of requested UI, not new approved quest acceptance/reward rules, objective mechanics or setting canon. No automatic XP/Renown/loot grants, no hidden content leaks, no HQ/Hireling/Faction writes.
- Existing Objective source definition `status` stays independent of campaign progress; `ASSIGN-*` remains Quest-owned.
- The GM-only source default in older versions was a likely **explanation**, not independently proven root cause of the user-observed reveal failure. Privacy gates remain intentionally restrictive.

## Verification

- Node v22 source-level/mocked tests and syntax checks (test output in `docs/TEST_RESULTS_v0.4.0.txt`). ZIP checksums and source/runtime consistency recorded in adjacent release manifest.
- **No live Foundry V14/Forge GM/player test.** Target V14 Stable 9 Build 367/dnd5e 6.0.6 remains unverified for this version.
- This release is not committed. Review before a future authorized commit; keep 0.3.1 installable ZIP for rollback.
