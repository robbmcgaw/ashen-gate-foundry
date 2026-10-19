## 0.8.1 — 2026-10-19

- Importing trees through General Manager no longer needs a manual "Initialize GM Storage" first. The import creates the module's own GM-only definitions Journal (no player access) when it is missing and says so in the result. Nothing else about storage changed; the GM Setup button still works.

## 0.8.0 — 2026-10-19

- Every node is now a world perk (`PERK-*`, or `POWER-*` on Cinder trees). Name, text, picture and point cost come from the perk. Add perks by dragging them from the Items sidebar or the Perks list, or with **Add**. **Assign Perk** turns an older custom node into a perk node. No more custom nodes.
- Unlocking adds the perk to the character sheet (a tagged copy, never twice). Players unlock their own characters while a GM is logged in; the GM client checks and writes. GM **Refund** and **Reset Tree** give points back and remove the perk from the sheet. A perk missing from the world is reported and nothing is unlocked. Profession trees stay read-only (the Ledger owns them).
- Clearer graph: arrows from prerequisite to the perk it opens (they follow nodes while you drag), dashed OR arrows, red ✕ exclusion lines, a legend, and the same information as text in the inspector and **Tree as a list**. Prerequisites, OR groups and exclusions are set in a table in Edit Properties.
- Removed Skill Trees' own Import Tree Layout JSON button (it did nothing: the window re-rendered right after opening the file picker, which dropped the file listener). Import tree files through General Manager. Export buttons stay for backups. Tree files are now `ag-skill-trees/0.3`; 0.2 files still import.
- **GM Setup → Saved data check** lists custom nodes and perks missing from the world; **Give Missing Perks** adds Items for unlocks made earlier. Saved trees and Actor progress are read as they are; nothing is rewritten or dropped.

## 0.7.0 — 2026-10-19

- New GM-only, UI-less `api.previewTreeImport(pack, {mode})` and `api.importTrees(pack, {mode})` so General Manager's single importer can hand tree layouts over. New trees are created; existing ones are kept (or, with mode `update`, replaced; purchased nodes stay protected). Actor progress is never touched.

## 0.6.3 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

## 0.6.5 — 2026-10-19

- Actors sidebar launcher joins the shared two-column grid in the fixed order. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.6.4 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- The Actors-sidebar launcher buttons now match the Manager and Location Builder buttons in the Items sidebar, with padding inside the sidebar edges.

## 0.6.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## 0.6.2 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## v0.6.0 Alpha — 2026-10-17 (local, unpublished)

- AG-WORK-0011 + FB-2026-10-16-001: Actors launch button joins single shared launcher shelf, consistent direct-child module/order metadata (rank 30), with idempotent same-group sorting and Player Access protection.
- FB-2026-10-16-003 / AG-FOUNDRY-DEV/1.7: compact Player Access control and GM Setup actions, medium startup window and width-responsive canvas/inspector.
- Replace GM-only Add Demo Trees action with Install QA Fixture Records / Reset QA Fixture, creating tagged real Foundry Actor/Item/Journal-backed tree records and preventing cleanup of progress owned by unrelated Actors; existing demos and Actor data remain unchanged.
- Prevent disabled-perk-action confusion: `PERK-*` linked nodes cannot show an enabled generic-wallet Record Unlock button.
- Drop stale closed-window singleton for clean reopen. Release v0.6.0 because installable source/UI/features changed.
- 61/61 local Node tests passed; live Foundry not run; no GitHub commit.

## v0.6.0 Alpha — 2026-10-17 (local, unpublished)

- AG-WORK-0011 + FB-2026-10-16-001: Actors launch button joins single shared launcher shelf, consistent direct-child module/order metadata (rank 30), with idempotent same-group sorting and Player Access protection.
- FB-2026-10-16-003 / AG-FOUNDRY-DEV/1.7: compact Player Access control and GM Setup actions, medium startup window and width-responsive canvas/inspector.
- Replace GM-only Add Demo Trees action with Install QA Fixture Records / Reset QA Fixture, creating tagged real Foundry Actor/Item/Journal-backed tree records and preventing cleanup of progress owned by unrelated Actors; existing demos and Actor data remain unchanged.
- Prevent disabled-perk-action confusion: `PERK-*` linked nodes cannot show an enabled generic-wallet Record Unlock button.
- Drop stale closed-window singleton for clean reopen. Release v0.6.0 because installable source/UI/features changed.
- 61/61 local Node tests passed; live Foundry not run; no GitHub commit.

# Changelog

## v0.5.1 — AG-WORK-0013 consumer permission hardening (2026-10-16)

- Ignore caller-supplied viewer in world-native definition lookups; use Foundry `game.user`. Opaque `not_found` for non-GM duplicate/type/version/lifecycle failures.
- Permit `publicForAll` only for the real GM; Observer callback errors fail closed; exact `expectedVersion` supported for GM diagnostics.
- 5 targeted local consumer regressions; 52/52 existing-plus-new tests pass. No mutable state change, compendium adapter not yet integrated, no live Foundry test.


## v0.5.0 — AG-WORK-0011 / 0016 implementation (2026-10-16)

**Scope:** AG-WORK-0011 (Foundry Tooling) and AG-WORK-0016 (shared UI reference).

**Verified source baseline:** the actual prior ZIP in this conversation; Work Queue compatibility-report version numbers were not installable source releases.

**New:** temporary read-only canonical source-ID lookup of active native world documents; strict duplicate/archive and player access handling; a provenance-preserving, fail-closed check for imported materials and perks; Actors launcher rank cooperation; baseline --ag-* CSS token fallbacks.

**Specific authority safeguard:** Skill Trees cannot purchase Profession PERK-* using Cinder/generic tree points; Profession selection remains Ledger-owned until the Tim source contract is tested.

**Missing in this Alpha:** live Foundry 14 tests; Tim/Manager round-trip for structured Recipe/Perk data; compendium lookup; approved resolver provider version; full live Manager skin subscription. These are NOT claimed implemented.

**State migration:** none; existing settings and Actor flags are unchanged. No automatic grants or source reimports.

**Versioning:** first actual installable successor to the confirmed release, not a repackage of a claimed nonexistent 0.6.0/0.5.0 checkpoint.




## v0.4.0 — Player Access contract (DEC-0072; 2026-10-15)

- Adds independently registered GM-restricted world Boolean setting `playerAccessEnabled` and optional interoperability API `game.modules.get('ashen-gate-skill-trees').api.playerAccess`: `contract: ag-player-access/1`, `getState()`, `setEnabled(boolean)`.
- **Existing-player-interface upgrade default: Visible**. The setting begins `true` if it did not previously exist; a GM may switch to Hidden locally in GM Setup / Module Settings or centrally from a Manager supporting the contract.
- Hidden removes the Actors launcher for non-GMs, closes rendered player windows on setting sync, and rejects public opening paths (including macro/API and direct app renders); re-enabling restores the button. GMs remain able to open and administer the module. Player permissions, record visibility and role controls still apply when Visible.
- Does not remove, migrate, reset, regrant or disable stored progression, owned Features, Items, recipes, tree layouts, gathering awards or ordinary Foundry effects. No gameplay balance or canonical schemas altered.
- Local UI enhancement: real GM Setup Player Access status + Hide/Show button, independent of Manager. Sensitive tool buttons remain separately GM-only.
- Implements approved DEC-0072 with `foundry/integration/PLAYER_ACCESS_CONTRACT.md` and Foundry development standard AG-FOUNDRY-DEV/1.4 at GitHub `7cc5895eef480e0f6e3b62db4ab07d9e91616b5e`; `foundry.folder_path` remains Manager/content-author responsibility.
- Automated tests: **30 passed; zero failed**. No live Foundry V14 or multi-client test, no UI screenshots. The manager's centralized panel is a **separate build** and must be tested after Borris releases it.
## 0.3.0 — Shared UI/development-standard alignment (2026-10-15)

- Follow AG-FOUNDRY-DEV/1.3, DEC-0068–0071: versioned Ashen Gate window identity, fixed top-level `Skill Trees | GM Setup` navigation and clearer player/GM boundaries.
- Move import, export, public publication and backup actions to GM Setup; put demos and legacy migration in a GM-only, explicitly experimental Developer Tools area.
- Preserve accessible player Actors sidebar launcher, GM-guarded operations, canonical source namespace checks and Foundry's separate Item/Journal folder ownership.
- Keep layout wire format `ag-skill-trees/0.2`, private GM Journal and Actor `progressV2` unchanged. No migration, rewards, or Profession XP authority shift.
- Add version/audience/layout checks to local automated tests. Full Foundry V14 GM/player click-through and screenshots remain pending.

## 0.2.1 — Archie cross-contract safeguards (2026-10-15)

- Enforce Profession `PERK-*` and Cinder `POWER-*` Feature bindings; `HPERK-*` stays with Hirelings (DEC-0062/0063).
- Reject wrong-domain Feature drag/drop and layout JSON imports; preserve legacy POWER references using `unlocks_perk` with a warning.
- Keep canonical `ag-source-package/0.1` and generated Manager `ag-foundry-import/0.2` files separate from Skill Trees `ag-skill-trees/0.2` layouts (DEC-0067).
- Retain Actor progress flags and GM private layouts unchanged.

## 0.2.0 — Visual multi-system prototype (2026-10-15)

- Keep module ID `ashen-gate-skill-trees`; do not automatically modify v0.1 Actor flags or TheRipper Journals.
- Split private GM-owned graph definitions from redacted player world projections.
- Add GM tree editing (drop imported Features, drag nodes, connect prerequisites, OR/AND/exclusions, undo/redo, import/export).
- Replace old sequential-stage assumption with DAG-based prerequisite validation.
- Add capped (13 lifetime) Cinder milestone wallets and separate configurable generic wallets; GM-managed point awards and unlocks.
- Replace player purchase with private GM request pending an authoritative server-side authorization flow.
- Keep Profession trees read-only pending Tim/Ledger adapter; disable implicit Feature granting and experimental XP purchases.
- Add legacy v0.1 hidden-draft migration preview and GM backup+clear for legacy world settings.

**Not included:** real Cinder/Profession content, World Item grants, secure self-spend, battle-tested multiplayer permission or item rewards, automated actual Foundry V14 verification.
