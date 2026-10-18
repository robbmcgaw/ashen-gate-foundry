# Utilities v0.2.0 Alpha — Work item AG-WORK-0019

| Field | Value |
| --- | --- |
| Build stage | Review candidate; uncommitted |
| Module ID | `ashen-gate-utilities` |
| Version | `0.2.0` (minor for new UI behaviors and session lifecycle) |
| Repository base | `main` `89da7ab854fa87e1b2b77dfdd19c4e16f0b5c5f8` |
| Coordinated pass | `AG-COORDINATED-BUILD-2026-10-17` |
| Test environment | The Forge / Foundry V14 Stable 9 Build 367 / dnd5e 6.0.6 (reported target only) |
| Source evidence | `docs/TEST_RESULTS_v0.2.0.txt`; archive SHA-256 in accompanying checksums JSON |
| Live GM/player V14 test | **NOT RUN** |
| Manager hard dependency | None |

## Feedback work implemented

- `FB-2026-10-16-004`, `FB-2026-10-17-017`: stale active session lifecycle, clear end/cancel, archived result, separate Group versus Request presentation, player prompt and prominent Roll Now.
- `FB-2026-10-17-019`: fail-closed document/table result preflight; text-only messages retained.
- `FB-2026-10-17-020`: refresh from Actor/ActiveEffect hooks and compact two-pane conditions.
- `FB-2026-10-17-021`: explicit GM-only stash contract even when native Observer exists; no player item API through Utilities.
- `FB-2026-10-17-022`: GM History with individuals, type, total and outcome/DC.
- `FB-2026-10-17-023`: minimum window dimensions.
- `FB-2026-10-17-024`: full copyable console commands in tester guide for player direct API tests; preserved role denial.
- `FB-2026-10-16-001`, `FB-2026-10-16-003`: shared ordered full-width Actors launcher and content-fit form controls.

## Not implemented / explicit boundaries

- `FB-2026-10-17-018`: no private/blind/GM-only roll audiences, ability checks or saves until real 6.0.6 native roll visibility, authority and transport are verified and exact audience policy resolved. Such a partial implementation would risk exposing private totals through synced world settings; supported public skill rolls still work.
- This build doesn't create a shared resolver or override other modules' records.
- World settings store public session metadata; no unrevealed secret text is accepted or sent by Utilities. A GM cannot authorize private messages merely by changing the public session visibility flag outside the supported interface.
- RollTable document result delivery is intentionally rejected rather than guessed. No automatic Time/Concentration logic.

## Persistence / migration / rollback

The session record schema remains `ag-utilities-session/0.1` and module-owned settings names stay unchanged. v0.1.0 History is read as-is. Previously completed sessions lingering in `activeSession` are no longer treated as active. Old **active** sessions can now be End & Recorded or Cancelled by the GM; they are archived with existing accepted rolls. Session closure writes History before clearing activeSession, and History entries are deduplicated by session ID.

For rollback, back up the world before upgrading, keep the v0.1.0 folder/ZIP, and restore the **entire test-world backup** if needed. v0.2.0 adds new session audit events (`resolve-now` and explicit skip entries), which older v0.1.0 versions do not display fully. Downgrading module files alone is not a certified rollback.

## Validation evidence and outstanding gates

- JavaScript syntax verified for module, core and fixture.
- Node test suite includes existing 37 source tests, 15 focused lifecycle/UI tests and 5 fixture tests = **57 tests**, all PASS. They are mocks/pure logic, **not real Foundry**.
- Fixture setup/reset is an explicit GM-only real-native-document script, **not executed against Forge**.
- 32 GM/player live acceptance cases start NOT RUN; any leakage, unauthorized mutation or duplicate accepted roll is release-blocking.
- Wait only for real Foundry GM/player acceptance and Stu's final integrated build pin, per Work Queue. No other specialist blocks standalone Utilities local implementation.
