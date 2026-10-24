## 0.13.2 — 2026-10-24

Canonical ids (FAC-, HIRE-, HQ-, LOC-…) no longer appear in the interface. No saved-data, setting-key, flag, API or export changes; no migration.
- **Facilities, Hirelings, Guildhall Builder, Activation:** rows and cards show names only. A GM-only **Details** fold on each facility, hireling and selected piece holds the id with **Copy ID**.
- **GM Setup:** auto-unlocked facilities per Guild Rank are named checkboxes instead of a typed list of ids. Activation fields are labelled Guildhall record and Location record and have neutral placeholders.
- **Machine tokens:** a stage, status, placement or benefit recipient without a friendly label shows plain words (for example "Room owner") instead of the stored token such as room_owner; an unsupported change says so without naming the internal operation.
- **Messages:** import, activation, hireling and facility errors name the facility or hireling (or a neutral label) instead of its id. A missing name shows "Unnamed facility", "Unnamed hireling" or "Unnamed perk".

## 0.13.1 — 2026-10-23

- Removed the Alpha wording from the interface. The module description in Setup → Add-on Modules now says what the module does: *Standalone Headquarters/Guildhall builder: facilities, decorations and hosted Hirelings on an adjustable canvas image, with compact GM controls and private Journal storage.* (before: "…Guildhall Alpha… Live GM/player acceptance pending.").
- The error for a GM-only facility definition now reads "Only player-visible facility definitions can be stored. Do not import GM secrets." (before: "Alpha stores only…").
- Saved data: no change; no migration.

## 0.13.0 — 2026-10-22

UI cleanup from the October 2026 audit (HQ-01 to HQ-15). No saved-data, setting-key, flag or API changes.
- **Keyboard:** placed facilities and decorations are buttons (Tab, then Enter selects); the inspector has Move left/up/right/down buttons; **Place** puts an acquired facility in the first free space; decoration art buttons add it to your room. Dragging still works. Tabs use the arrow keys, and focus stays on the control you used after the window refreshes.
- **GM Setup is settings only:** Guild Rank moved to a row at the top of the Facilities tab (**Set rank…** asks "Set Guild Rank to N?"); **Create missing player rooms** moved to the Personal Quarters toolbar. Switching tabs or closing the window with unsaved GM Setup changes asks first (Keep editing is the default).
- **Hirelings:** toolbar with search, a status filter, a count and **Add to roster**; cards grouped Active / Departed; Working is a labelled checkbox; permanent departure, perks and history are collapsible sections. Statuses, perk states and dates are plain words and local dates; stations show the facility name (with #2 only for duplicates). Players no longer get an always-empty Hirelings tab.
- **Facilities:** Facilities and Decorations sub-tabs; filters have visible labels. The direct importer is under **Advanced: import here, or use General Manager** (with Open General Manager when it is installed), uses a keyboard-reachable file button, and keeps facilities already in the catalog instead of cancelling the import.
- Activation fields start empty (example placeholders, no demo IDs). The header has no subtitle; the Guildhall name, rank and capacity are above the builder grid. Only Guildhall Builder shows the editing lease. Removals ask with Cancel as the default. "You can edit" is read out on room tabs; Help is rewritten in plain language; plurals fixed.

## 0.12.2 — 2026-10-22

- Shared UI kit 2.2 (no visible change).

## 0.12.1 — 2026-10-21

- Shared UI kit 2.1.0 and dialog helper: choice dialogs follow the Ashen Gate look (Cancel on the left, the choices on the right); red buttons, badges and grey text on selected or striped rows are easier to read in every skin (at least 4.5:1); a hidden empty state stays hidden; disabled list rows keep readable text.
- No behaviour or saved-data changes.

## 0.12.0 — 2026-10-21

- UI standard look, same three-column builder: header "Ashen Gate | Headquarters" with the Guildhall name, rank and capacity underneath; version and Help on the right. Tabs match the other modules (Facilities and GM Setup marked GM, last); the active-button tint is gone.
- **GM Setup has one Save Changes** (bottom right, Cancel bottom left) for Player Access, Guildhall and canvas settings, and the five-rank table. Player Access no longer saves on its own button; only the parts you changed are written. Set Rank and Create Missing Player Rooms stay as their own actions. Developer Tools (Seed Test Facility Records) moved from Facilities to a collapsed section at the end of GM Setup.
- Kit buttons everywhere; Uninstall, Remove decoration, Unassign and permanent departure are red and ask first. Tile, missing-portrait and room glyphs are Font Awesome icons; zoom − and + have labels and tooltips. Personal Quarters rooms use a segmented picker (2–4 rooms) or a tab strip.
- Facilities tab: kit toolbar (search, filters, count, Import on the right), grouped rows with status badges. Benefits are rows with Active/Inactive badges; hirelings are cards with status badges; the rank table is a kit table. Empty states use the kit. Facility and copy ids show for the GM only.
- Styles use kit tokens only (Compact and Comfortable sizes, all skins); narrow windows use container queries; the window opens 1.2× larger in Comfortable. No saved-data, setting-key or API changes.

## 0.11.1 — 2026-10-21

- Confirmations name the action (no more Yes/No), Help opens with a Close button, dialogs follow the Ashen Gate look; test wording removed from player views.
- Footer no longer shows shared/state revision numbers (and Personal Quarters no longer shows a room revision); "(test default)" and "Alpha" removed from the header. Help opens as a dialog with a Close button instead of replacing the tab; its "this Alpha" and test-world notes are gone, as is "in this Alpha" on the player Hirelings tab. Empty Personal Quarters text points to the GM Setup tab; the Facilities hint points to the Activation tab. Removing a decoration and unassigning a hireling now ask first; the departure confirm names the hireling instead of its HIRE id.

## 0.11.0 — 2026-10-21

- Shared UI kit 2.0.0: rounded compact look for shared parts, Comfortable size option (General Manager → My Appearance), shared dialog helper.
- Dialogs now come from the shared `ag-dialogs.mjs` (same behaviour, now skinned).

## 0.10.0 — 2026-10-20

- **New API `embed.mount(element, {actorId, mode: 'character'})`** so a partner module (Character Hub) can show a compact, read-only Guildhall view for one character: name and rank, the facilities that character may see with stage and benefits, and Open Headquarters. Returns `{unmount, refresh}`; it refreshes itself on changes. See the README.
- Same checks and data as `playerView` (no hirelings, no other players' rooms). The Headquarters window is unchanged. No saved data changes.

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
