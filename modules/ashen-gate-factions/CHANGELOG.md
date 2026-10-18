# Factions & Renown change history

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
