# Changelog — Ashen Gate | Utilities

## 0.3.1 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- The Actors-sidebar launcher buttons now match the Manager and Location Builder buttons in the Items sidebar, with padding inside the sidebar edges.
- New **Appearance** button in the header, for players and the GM. It opens General Manager's My Appearance window, and it is hidden when Manager isn't active.

## 0.3.0 — 2026-10-18

Beta-feedback quick wins.

- Group Check: the finished result now stays on screen for everyone until the GM clicks **Clear Result** (or starts the next check). It is also still saved to History.
- Group Check: when a check finishes, the GM gets a whispered chat message tallying every character's roll, the average, the DC and the verdict.
- Group Check: bigger type, and a segmented check bar that lights up as each roll comes in.
- Group Check: the roll form shows each character's skill bonus, and pre-selects Advantage or Disadvantage from the character's sheet and active effects (dnd5e roll modes, plus Midi-QOL style effect flags). The player can change it before rolling. The GM sees each pending character's bonuses for the allowed skills.
- RollTables: tables with document or compendium results can now be rolled. Utilities uses Foundry's own `RollTable#draw`, lists the drawn documents with an Open button and sends them as `@UUID` links.
- Conditions: statuses Foundry does not list (for example "magical" or "thinking" on imported characters) are marked Custom, traced to the effect that grants them, and linked to its source when known. The GM can always remove them: effects on the Actor are deleted, effects inherited from an Item are disabled instead of editing the Item.
- New setting `lastResult` (world, hidden) holds the finished check; no migration needed, it starts empty.

## 0.2.4 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

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
