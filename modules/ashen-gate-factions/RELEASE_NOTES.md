# Current published release: Factions & Renown v0.6.1 Beta

Published on GitHub `main` at `e5de9a7dc76b5aa8ff46a0192eef6480b545f5a6`. Install `foundry/releases/AG_ashen-gate-factions_v0.6.1_Beta.zip` (SHA-256 `1fa17435133cfd01968552f12860598bb47abc10e526952692639a4f5702f045`). Source-export allowlist fixes and pinned optional Quest Manager v0.4.0 compatibility are included. The original v0.6.1 ZIP contains historical v0.6.0 guidance in its bundled README and RELEASE_NOTES; do not infer the installed version from those documents—check `module.json` and the published release receipt. This correction is repository-only; the ZIP is immutable. Live Foundry acceptance **NOT RUN**.

## Historical v0.6.0 release notes (retained for rollback)

# Ashen Gate | Factions & Renown v0.6.0 Beta — local candidate

**Work order:** `AG-COORDINATED-BUILD-2026-10-17`, `AG-WORK-0009`  
**Module:** `ashen-gate-factions` · **stage:** Beta · **version:** `0.6.0`  
**Source baseline:** published GitHub `main` v0.5.2, implementation commit `11ca3fd98dafc07f58fa80c6a8fc23caf3a082a0`; baseline checked against GitHub `main` `89da7ab854fa87e1b2b77dfdd19c4e16f0b5c5f8` at start of pass.  
**Status:** local source/tests + installable ZIP only. **No GitHub publication** authorized or performed for 0.6.0.  
**Target:** Foundry V14 Stable 9 (Build 367), hosted on The Forge, dnd5e 6.0.6. **Not live verified.**

## Implemented and testable

- **Socket transport fix (FB-025/027/028):** `module.json.socket: true` requests Foundry's module event channel. Adds per-request ID receipts; GM continues authoritative checks for actor ownership, discovery, player-view capability, reward eligibility and Player Access. Requests now have both server-side persistence and a player response path. Offline GM submission is refused.
- **Selective field visibility (FB-026):** Existing factions continue showing discovered profile fields by default. When GM selects “Use selective field reveals,” Name, Leader and Description get distinct party and selected-character reveal flags in Factions-owned campaign state, not reusable source records. Names missing from a revealed profile become “Unknown Organization”; group folders with no revealed faction names are likewise masked. Discovery itself remains an independent rule; entries retain their existing reveal conditions. Party sharing transfers only fields known to the sharing character, not that Actor's Renown/claims.
- **Document handling (FB-027/029):** No silent source permission elevation. A claimed/granted Item can be opened from the receiving Actor's own embedded Item copy. Other players cannot follow that copy link. When a new Journal is dropped as information, its link mode defaults to “document”; the revealed information entry shows the GM-authored text and a link only for a reader with existing Foundry permission. Older preview-mode links retain their existing setting (GM can choose “Link: document”).
- **GM Setup usability (FB-030/FB-2026-10-16-003):** Compact collapsible profile, organizations, related Objectives, information and rewards sections; incoming requests start expanded; nested milestones start collapsed. GM selected-character field is more legible. App minimum width/height and stable scroll/open section state on same-page renders. Tags described as GM organizational metadata.
- **Repeatable test fixture:** Two player-owned test Actors, three setting-consistent synthetic factions, two linked real Journals with different permissions, a real Item, Group/Individual standings, prior history, rewards/services and typed Quest ref; `fixtures/README.md`, `fixtures/setup.mjs` and 22 five-column cases in `TEST_CASES.tsv`.

## Known limits and gates

- **FAN-21 / FA-33–34 NOT RUN:** The Quest-linked end-to-end flow remains gated on Eli's redesigned Quest Manager being user-accepted. Existing GM-only Objective diagnostics retain the pinned Quest consumer contract; no player Quest deep links are shipped, and no Faction action changes Quest progress/reveal.
- **Live multiplayer:** Foundry/Forge socket routing, simultaneous GM/player refresh, permission checks on native/embedded docs, and visual scroll/restyling require Robb's live run. Node harness is not a replacement. The request authentication is a per-player private Journal capability checked by the GM, not an attested server socket user identity; hostile multiuser security acceptance requires live inspection.
- **Reward access persistence:** A successfully granted Item remains on its owner's Actor sheet even after faction visibility changes. This build does not grant Observer permission on GM-owned original Items/Journals; blanket source-document permission persistence remains subject to a user decision.
- **Linked Journals:** Text from linked document pages is not copied into the player record (to avoid leaking GM secrets). The GM can author safe summary text and allow Foundry Observer permission separately. Existing link-mode `preview` records do not silently change.
- **Theme controller:** CSS uses scoped `--ag-*` tokens and standalone fallbacks. No new required Manager dependency or live theme subscription has been claimed.
- No automatic creation or import of Quest Objectives; fixture's `QUEST-PLAYTEST-SUPPLY-ROAD` is intentionally an unresolved optional typed reference until Eli publishes the test Quest.

## Migration and rollback

Back up the world. Upgrade by replacing only `Data/modules/ashen-gate-factions` contents with `v0.6.0`. Existing Group/Individual Renown standings, grants, claims, discoveries, histories, requests, and services retain their stored shape. New field disclosure flags are additive and stored in the existing GM-only Faction Group state when edited. No bulk rewrite or destructive data migration is required. **Rollback:** restore the v0.5.2 module and your world backup if required; v0.5.2 ignores the new field reveal controls and reverts to its older all-fields-known display behavior. Retain v0.5.2 as rollback package.

## Exact next test

With one GM and two players online, run the fixture setup from `fixtures/README.md`, use Player 1 to Share Gilt Compact — QA and claim a Far Lanterns Item, then use GM Setup to inspect and approve the request. Confirm Player 2 receives only shared faction knowledge and cannot view Player 1's private Renown or granted Item. Continue the 22-case sheet and record actual results. **Do not mark Quest acceptance as Pass.**
