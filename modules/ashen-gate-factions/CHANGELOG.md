# Renown change history (formerly Factions & Renown)

## 0.10.0 — 2026-10-20

- **New API `embed.mount(element, {actorId, mode: 'character'})`** so a partner module (Character Hub) can show a compact, read-only standing list: per organization the user may see, the party's and this character's rank and score, the next milestone, and Open. Returns `{unmount, refresh}`; it refreshes itself on changes. See the README.
- `api.open()` can now take `{factionId, actorId, tab}` to open on one organization (and the Player view for one character). `open()` with no options is unchanged.
- Same data and visibility as the Renown window (players: their own filtered view only). Claims and awards stay in the window. No saved data changes.

## 0.9.0 — 2026-10-20

- Renamed to **Renown** (was *Factions & Renown*): window header `Ashen Gate | Renown`, launcher tooltip, Help, notifications, the Player Access setting and the module title in Forge.
- Unchanged: module id `ashen-gate-factions`, settings and flags, API, socket, import/export schema and file name, and saved world data. Organizations are still called factions inside Renown.

## 0.8.3 — 2026-10-19

- Faction actions that used the browser's `prompt`/`confirm` (rename folder, edit information, edit reward, remove entry/reward/reference, reset charges, clear a milestone choice, share with party, add example guilds) now use Foundry dialogs, so they work in the desktop app. Destructive confirms have a labelled action button. Editing a reward is now one form instead of six prompts; the same checks apply.
- New header (`Ashen Gate | Factions`, version, **Help**). The Help text is a draft.
- No saved-data, permission or API changes.

## 0.8.2 — 2026-10-19

- Export file name no longer has a hard-coded version: it is now `AG_Factions_Definitions.json`.

## 0.8.1 — 2026-10-19

- Faster GM login: the startup check of each faction's group state now writes only when a missing field actually needs filling, instead of rewriting every faction's state journal on every load (which also re-rendered open Factions windows each time). Saved data is unchanged.

## 0.8.0 — 2026-10-19

- New GM-only **Organizations** tab: every faction (hidden, character-only and revealed) in a searchable list with visibility, group Renown, folder and linked-objective chips; filter by visibility, sort, group by visibility or folder. Creating, editing, revealing, folders, rewards, claims, information entries, linked quests, Import and Export all live here, unchanged.
- **GM Setup** now holds settings only: Player Access and the custom group display name.
- No saved-data changes. Player views, import APIs and permissions are unchanged.

## 0.7.2 — 2026-10-19

- Import through General Manager reports a failing faction with its reason and still lists the factions that were added, instead of failing the whole file. No change to saved data.

## 0.7.1 — 2026-10-19

- Actors sidebar launcher is now a two-column grid in the shared Ashen Gate group, button label "Renown" (tooltip "Factions & Renown"). Fixed order (Quests, Renown, Professions, Skill Trees, Locations, Headquarters, Utilities) whatever the module load order. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.7.0 — 2026-10-19

- **Import JSON** (GM Setup → Organizations and folders). Loads factions from a definitions file (the same `ag-factions-source-export/0.3` file that **Export definitions only** writes). A preview lists each faction as NEW or SKIP before anything is written.
- **Additive and safe.** A faction whose id already exists is skipped whole: its definition, discovery and Renown are never changed. Nothing is deleted. No migration of saved data.
- **Optional `starting_state`** in the file (new factions only): reveal to the party, group Renown events, and per-character discovery and Renown by character name. A name that is not in the world is skipped and reported.
- GM-only in the data layer: `api.importFactions(data)` and `api.previewFactionsImport(data)` refuse players, as does the button.
- The playtest data pack now includes `AG_Playtest_Factions_0.5.1.json` for this.

## 0.6.6 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- The Actors-sidebar launcher buttons now match the Manager and Location Builder buttons in the Items sidebar, with padding inside the sidebar edges.
- Tabs sit in a full-width strip at the top of the main pane. Headings use the UI font instead of Georgia.

## 0.6.5 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

## 0.6.4 — 2026-10-18

- Fix: opening the Factions window failed in Foundry V14 with "Cannot add property minWidth, object is not extensible". ApplicationV2 window position doesn't accept `minWidth`/`minHeight`; the minimum size is now set in CSS.

## 0.6.3 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## 0.6.2 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## 0.6.0 Beta — 2026-10-17 (local, unpublished)

- Add Foundry module `socket: true` to enable the existing player-to-GM request/share channel and correlated player receipt messaging (`FB-025/027/028`).
- Add optional campaign-owned selective field disclosure for Name, Leader, and Description; prior worlds use legacy behavior unchanged. Never project private disclosure configuration, Objective source refs, or unauthorized linked UUIDs to player Journals (`FB-026`).
- Surface the granted copy of Item rewards on the authorized Actor; do not change original source document ownership (`FB-027`, access-persistence request remains limited to owned Actor copies).
- Link newly dropped accessible Journals by default, with explicit guidance when a linked source is restricted; do not bypass Journal permissions (`FB-029`).
- Compact GM Setup into named collapsible sections, preserve scroll/section state after in-place actions, improve selected character spacing, explain organizational tags and declare minimum app dimensions (`FB-030`, `FB-2026-10-16-003`).
- Supply real-world synthetic fixtures with explicit setup/reset and 22 exact-format cases; keep linked Quest flow Not Run until Eli's iteration is accepted (`FB-031`).
- Keep `ag-player-access/1`, the prior Renown/reward logic, legacy data, and optional Manager/Quest consumer boundaries.

Changelog

## 0.5.2 Beta — 2026-10-16

- Added optional, GM-only validation of faction `QUEST-*` / `ORDER-*` / `CONTRACT-*` references against the **actual** Quest Manager `ag-objective-consumer/0.2-alpha` API. Verifies `entityType:Objective`, source ID, and owner-reported status; does not infer Objective existence by display name, UUID, or local faction state.
- GM Setup shows resolved/unverified/unavailable/conflict statuses, without ever publishing Objective refs to a player projection. Added GM-only `api.auditObjectiveRefs(factionId)` for focused integrated testing; preserved `api.getObjectiveRefs` and all existing APIs.
- Missing/disabled/unsupported Quest Manager leaves the Factions module usable, with references marked `unverified`. No automatic Quest grant, discovery or state mutation.
- Added focused negative tests for source/type mismatch, optional partner absence, and player leakage. No data migration.

## 0.5.1 Beta — 2026-10-16

- GM-only canonical Objective reference editing and portable typed refs; standalone theme token fallbacks.
- Earlier release history and functionality retained from the v0.5.1 package.
