## 0.7.1 — 2026-10-19

- Fewer pointless writes: re-publishing a quest whose player view hasn't changed no longer rewrites its Quest Log journal. This happens on every user or actor change, for every Individual quest, and each write made every open window re-render. Real changes publish exactly as before.
- No saved-data or permission changes.

## 0.7.0 — 2026-10-19

- New GM-only **Quests** tab: every quest, order and contract (Draft, Hidden, Available, Active, Completed, Failed) with search, filters (type, status, location, visible to players), sort, and group by status or type. Pick one to edit it in the same tab, or press **New quest** to draft. Import JSON and Export Sources are small buttons in its toolbar.
- **GM Setup** is now settings only: Player Access, objectives overlay, compendium pack IDs.
- "Draft" is a label for a quest still marked draft and never taken out of Hidden; drafts are never shown to players. Player view, API and saved data are unchanged.

## 0.6.0 — 2026-10-19

- New GM-only `api.previewQuestImport(payload, {mode})` and `api.importQuests(payload, {mode})` so General Manager's single importer can hand Quest files over. New quests are created; existing ones are kept (or, with mode `update`, get their definition replaced while status and notes stay). Quest Log's own Import JSON is unchanged.

## 0.6.1 — 2026-10-19

- `api.listQuests()` (GM-only) also returns each quest's `kind` (quest, order, contract) and `definitionStatus` (draft, approved...), so Locations can label draft and hidden quests in its picker. Nothing saved changes.

## 0.5.1 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- The Actors-sidebar launcher buttons now match the Manager and Location Builder buttons in the Items sidebar, with padding inside the sidebar edges.

## 0.5.2 — 2026-10-19

- Actors sidebar launcher label is now "Quests" (tooltip "Quest Log"), in the shared two-column grid with a fixed order. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.5.0 — 2026-10-18

- Quest details list the Locations linked to a quest (from Locations 1.0, or the Location IDs set on the quest); click one to open it. Shown only when the Locations module is active and the location is revealed to you.
- New GM-only `api.listQuests()` so Locations can offer every quest when linking.

## 0.4.3 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

## 0.4.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## 0.4.2 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## 0.4.0 Alpha — UI, reveal and tracking (2026-10-17)

- Normal GM source form and clearer per-quest publish/reveal flow; JSON behind Advanced.
- Player tracking for multiple quests and optional objectives overlay from authorized projections only.
- Player interface toggle moved into GM Setup, optional compendium settings explained, consistent title/launcher.
- Tracking/permissions tests, real Foundry import fixtures, setup/reset and five-column manual tests. No live V14 verification.

# Quest Manager change history

## 0.3.1 Alpha (2026-10-16, targeted local release; no commit)

- Strict Objective source and Manager native-projection envelope checks, including nonempty typed relations, legal scope, source provenance types and exact reference fields; campaign-state Objective definitions rejected.
- Standalone bundled Archie resolver 0.1-prototype contract aligned to the pinned `f535fe085cc3446dd3e82dd796df95118631b145` consumer handoff, with GM-only configured compendium pack loading and `refreshCompendiums`.
- Exact pack-only Objective resolution without Manager, world-over-pack DEC-0078 precedence, explicit conflicts and archived-copy exclusion. Type/kind validation inspects only the resolved native binding; no display-name fallback.
- Unchanged player-safe Quest projection/reveal gate, five campaign statuses, Party/Individual views and GM-only Quest-owned Assignment state.
- Focused source/mocked regression suite; no live Foundry V14 acceptance.

## 0.3.0 Alpha (2026-10-16, local candidate)

- Reconciled against GitHub main `d2e2820cb20f1691e166bbf762731cd3144c62bb` (initial build read), DEC-0077–0081, shared Objective/Assignment schemas and Archie/Borris `ag-definition-resolver/0.1-prototype` consumer handoff.
- Added exact-ID/type read-only Objective consumer, native Manager world document fallback when Manager is disabled, duplicate/archive checks and fail-closed player views. No display-name fallback.
- Added a separate GM-owned `ASSIGN-*` delegated execution Journal and GM Setup editor; validated typed target, participants/results; GM-only read/write API. Prevented Objective deletion while linked Assignment exists.
- Hardened duplicate native/domain bindings and private/public views. Explicit GM-only objectives cannot be published via per-objective reveal flags.
- Retained Party/Individual views, five campaign statuses, independent source lifecycle, GM review/reveal/progress, reward handling and character-authored notes.
- Added source-level and mocked tests for Manager enabled/disabled, opaque hidden results, and Assignment ownership; **no Foundry runtime test**.

## 0.2.0 Alpha (source package supplied locally)

- Previous independent Quest Log, GM source and campaign Journal state, public projections, Actor notes, and permission tests (39 tests passed).
- Previous source package and Foundry UI were implementation candidates, not canonical final Quest design artifacts or live Foundry-tested packages.
