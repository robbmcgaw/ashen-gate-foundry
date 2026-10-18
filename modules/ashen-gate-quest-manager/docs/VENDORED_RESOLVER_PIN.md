# Resolver source provenance

**Source:** `robbmcgaw/ashen-gate-supplement`, implementation commit `f535fe085cc3446dd3e82dd796df95118631b145`; source path `foundry/shared/resolver/src/`; `CONSUMER_HANDOFF_2026-10-16.md` on current main.

**Contract:** `ag-definition-resolver/0.1-prototype` (`0.1.4-alpha.1`). This module carries a separately packaged, locally adapted implementation of Archie’s candidate API in `scripts/vendor/archie-resolver/`, rather than installing a new shared module or importing Manager's reader. Source formatting/comments were adapted for this package. **The bundled files are not claimed to be byte-for-byte identical to the GitHub pinned source.** They are subject to the included local contract and focused regression tests; they are not a new approved resolver v1.

**Scope:** Derived read-only world/pack binding index; native projection and explicit configured compendium reading; GM-only readSource/audit; viewer permission checks, archive exclusions and world-over-pack selection, no writes or owner-state registry. Quest specifically inspects only the resolver-selected document's structured Objective kind, not arbitrary display text or a competing catalog. All Quest state and ASSIGN records remain owned by Quest Manager.

**Dependency:** None at runtime on Manager or external resolver module. No compendium packs scanned until listed by the GM in Quest module settings.
