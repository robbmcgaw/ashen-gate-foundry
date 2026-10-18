# Changelog — Ashen Gate | Utilities

## 0.2.3 — 2026-10-18

- Fix: opening the Utilities window failed in Foundry V14 with "Cannot add property minWidth, object is not extensible". ApplicationV2 window position doesn't accept `minWidth`/`minHeight`; the minimum size is now set in CSS.

## 0.2.2 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## 0.2.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## 0.2.0 Alpha — 2026-10-17 — Uncommitted review candidate

- Group Check resolve/archive/clear path, early end with audited skips; one active interaction without stale cross-tab mirroring.
- Dedicated Group Check and Public Roll Request surfaces; automatic pending-roll player prompt and larger Roll Now button.
- Detailed GM session History with individual DC comparison and group results.
- Party-native Condition overview, remote ActiveEffect refresh, native icon presentation.
- RollTable text-only preflight before rolling, including fail-closed document results.
- GM-only Observer-independent stash preview, minimum window size, compact controls and Actors launcher rank 60 group.
- GM-only real Foundry fixtures, 32 manual tests with outcome/notes on same row, and 57 passing source tests.

## 0.1.0 Alpha — 2026-10-16 — GitHub published prior release

- Initial Group Checks, public skill Roll Requests, text RollTable Messenger, native conditions, and GM-only Party Inventory preview.
