## 0.4.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

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
