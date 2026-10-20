# Changelog

## 0.9.0 — 2026-10-20

- **New read-only API `playerView(actor)`** for partner modules (Character Hub): `{active, guildhall: {name, rank}, facilities: [{key, facilityId, name, category, stage, room, roomOwner, benefits}], hirelings: [], hirelingsPublished: false}`. Facilities are the shared Guildhall's plus the character's owners' personal rooms.
- Hirelings stay GM-private (as in the Hirelings tab), so `hirelings` is always empty. The view is always built from the public projection: no personnel, staffing or lease data, even for the GM.
- GM or the Actor's owner only; anyone else is refused (`Actor access denied`), and players are refused while Headquarters Player Access is off. Additive only: no saved data changes.

## 0.8.1 — 2026-10-19

- Uninstall / Return facility and Mark hireling departed now use Foundry dialogs instead of the browser's `confirm` (the desktop app has none), with a labelled action button and Cancel on the left. The fixture-delete prompt does the same.
- No saved-data, permission or API changes.

## 0.8.0 — 2026-10-19

- New GM-only **Facilities** tab: every imported or seeded facility definition with Locked / Unlocked / Acquired chips, copies owned and installed, search, status and placement filters, sort and group. Unlock, Acquire +1, Import Facility Definitions JSON, Decorations and the test-record seeder moved here from GM Setup and work the same. It also opens before the Guildhall is activated (browse and import; unlock/acquire wait for activation).
- **GM Setup** now holds settings only: Player Access, Guild / Canvas settings, Five-Rank configuration, Create Missing Player Rooms. Guildhall activation stays on the not-activated screen because it is a one-time setup step.
- No saved-data changes. Player views and the import APIs are unchanged.

## 0.7.1 — 2026-10-19

- Facility definitions now import **before the Guildhall is activated** (Manager's single import and the catalog's own Import). They are library data: nothing is unlocked or acquired by importing. Before activation, the GM sees an Imported facility library list on the "Guildhall not activated" screen; after activation they are in GM Setup > Facility Catalog.
- If Headquarters refuses the facility import, Manager now gets the real reason instead of only a pop-up. Saved data format unchanged.

## 0.7.0 — 2026-10-19

- New GM-only `api.previewFacilityImport(payload)` and `api.importFacilities(payload)` so General Manager's single importer can hand facility files over (a list, or an object with `records`). New facilities are added to the catalog; facilities already there are kept as they are. The catalog's own Import button is unchanged.

## 0.6.5 — 2026-10-19

- Actors sidebar launcher: shared two-column grid layout and fixed order. No change to Player Access or saved data. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.6.4 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- The Actors-sidebar launcher buttons now match the Manager and Location Builder buttons in the Items sidebar, with padding inside the sidebar edges.

## 0.6.3 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

## 0.6.2 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## 0.6.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## 0.6.0 Alpha — local candidate (2026-10-17)

- Fixed shared open/close lifecycle, provided new canvas image fit/opacity/position control, compact GM controls and catalog scroll/search retention.
- Added narrow active-GM fallback in authenticated Actor-update player bridge.
- Added exact-format live cases and real-data fixtures with cautious reset.
- Maintained v0.5.2 private Journal storage and DEC-0076 ownership; not live-verified; no commit authorized.

## 0.5.3 — Alpha · 2026-10-16 · Launcher startup repair
- Register Headquarters `api.open`, Player Access and Actors render hooks in Foundry init, *before* the asynchronous private Journal migration. A vault failure no longer causes both Manager and sidebar launchers to disappear.
- Prefer V14 `foundry.documents.JournalEntry` (with legacy fallback), mount from the actual `ui.actors` directory, and retry after ready.
- Register a GM-only Foundry Settings Open fallback. Protect optional keybinding/menu registrations so failure of one cannot disable the others.
- Keep GM storage unavailable without a valid private vault; no relaxed personnel permissions, save-format change, Des bridge or Quest ASSIGN state.
- Mock-browser regressions: namespaced Journal class without a global alias, API and Settings fallback before ready, and simulated vault initialization failure with launcher remaining visible. All 53 existing Node tests pass.


## 0.5.2 — Alpha · 2026-10-16 · AG-WORK-0005
- Move authoritative Headquarters+Hirelings state from a player-synced world setting to a Foundry GM-only JournalEntry flag; `aghq-state/0.1` and existing IDs/ownership remain unchanged.
- Write only a redacted public projection to the world setting: no roster membership, Working state, personnel/departure history, occupant HIRE IDs or player request receipts.
- GM-first non-destructive migration from existing saves, private-first writes, restart recovery, and fail-closed unsafe/missing vault checks.
- Keep `getState`, `getPersonnel` and new `exportState` GM-only; player roster/staffing views withhold private data.
- Eight new targeted regressions; source and fake-browser tests; live Foundry V14 verification still pending.

## 0.5.1 — Alpha · 2026-10-16

- Reject Manager-tagged campaign-state documents as reusable HIRE/HPERK definitions.
- Reject structured source records with a mismatched canonical ID, logical type, or campaign-state scope.
- Mask restricted Hireling occupancy counts and remove player-facing GM staffing instructions.
- Preserve all existing personnel, guild, facility, room and Player Access state; no migration.
- Pin the release package for coordinated test assembly.


## 0.5.0 — Alpha · 2026-10-16

- Add Hirelings roster tab hosted in Headquarters (Des AG-WORK-0004 v1 handoff).
- Add independent mutable `personnel` section (`aghq-personnel/0.1`) in existing Guildhall world state; additive migration for 0.4.0 saves.
- GM Working ON/OFF, permanent departure (dismissed/retired/departed/deceased) with retained history and atomic HQ vacancy.
- GM station/transfer/unassign and drag Hireling card onto installed facility; no Assignment records.
- Read native Manager-tagged world Hireling/HirelingPerk sources, respecting archived-source filtering and user-facing document visibility; avoid guessing missing source fields.
- Display derived informational HPERK condition and non-stacking signals; update installed facility informational benefit activation.
- Add dedicated tests and mocked browser Hireling UI smoke checks.
- No v0.4.0 data destruction; no Foundry V14 live runtime verification.

## 0.4.0 — Alpha

Previous builder and candidate authenticated Actor-update editing transport retained. See earlier release ZIP for original release notes.
