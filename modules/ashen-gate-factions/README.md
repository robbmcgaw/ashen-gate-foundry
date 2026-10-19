# Ashen Gate | Factions & Renown 0.6.1 — published Beta

**Current recommended test build:** `foundry/releases/AG_ashen-gate-factions_v0.6.1_Beta.zip` (published on GitHub `main`; SHA-256 `1fa17435133cfd01968552f12860598bb47abc10e526952692639a4f5702f045`)  
**Module ID:** `ashen-gate-factions` · Foundry V14 Build 367 / dnd5e 6.0.6 is the *target*, not a verified live result.

**Key update (AG-COORDINATED-BUILD-2026-10-17):** declares the required `socket: true` for the previously broken Share with Party, claim, and service request workflows; adds per-user request acknowledgments; additive optional field-level Name/Leader/Description disclosure without resetting legacy factions; opens granted Actor-owned Items without widening GM source permissions; links accessible Journals with permission-aware UI; and makes GM Setup sections compact, collapsible, and scroll-preserving.

**Install/test:** Back up a disposable world, replace the `ashen-gate-factions` folder, enable v0.6.1, log in as GM and two players. Read `fixtures/README.md` and import the real Foundry QA records with its one-line browser-console setup command. Run `TEST_CASES.tsv`, noting any browser-console errors, and reset with the matching command. The fixture is synthetic and not canon. Preserve the published v0.6.0 ZIP for rollback; v0.5.2 remains an older historical fallback.

**State/privacy:** No destructive migration, no automatic secret-sharing, and no source Item/Journal permission changes. Existing discoveries stay in legacy all-fields-visible mode until a GM explicitly opts into selective field disclosure. Source-definition exports omit player/user disclosure flags, Renown, claims, service usage and history. Manager is optional. Quest links remain GM-only diagnostics and must wait for Eli's accepted Quest iteration before live acceptance.

**Changes:** see `CHANGELOG.md`. Local Node and mocked tests do not prove Forge multiuser behavior.

**Release provenance:** Published release commit `e5de9a7dc76b5aa8ff46a0192eef6480b545f5a6`; package source commit `0c8ea5f12947a49c2df501fec9268e754f680bda`. Receipt: `foundry/releases/AG_ashen-gate-factions_v0.6.1_RELEASE.json`; checksum: `foundry/releases/AG_ashen-gate-factions_v0.6.1_SHA256SUMS.txt`. The immutable published v0.6.1 ZIP contains the earlier v0.6.0-recommending README; this repository README corrects that guidance only and does not alter the ZIP. Live Foundry GM/player testing remains **NOT RUN**.

## Historical release notes

### Historical v0.4.0 release notes below

## What's new: Player Access (DEC-0072)

- Registered the GM-restricted, world-scoped setting `ashen-gate-factions.playerAccessEnabled` (defaults **Enabled** for backward compatibility with v0.3.3 player-facing worlds).
- Added the `ag-player-access/1` API at `game.modules.get('ashen-gate-factions')?.api?.playerAccess` with `getState()` and GM-only `setEnabled(boolean)`.
- Added **GM Setup → Player Access** and **Configure Settings → Module Settings** controls; Manager can optionally call the public API when it supports the contract.
- Hiding the interface removes its Actors sidebar launcher for players, blocks public `api.open()` and other player-facing operations, closes currently open player windows, and denies new player reward/share requests. The GM always retains access.
- Revealing the interface restores the launcher and opens existing faction progress without resetting Renown, discoveries, rewards, claims, requests, history, or changing the Journal/Actor permission model.
- Minor polish: consistent `Ashen Gate | Factions & Renown` window title and cleanup of the empty launcher shelf when hidden.

## Upgrade and first test

1. **Back up the world**, disable the current Factions module, and replace the contents of `Data/modules/ashen-gate-factions` with the single `ashen-gate-factions` folder in this ZIP. Restart and hard-refresh clients.
2. Verify as GM that **Actors → Factions & Renown** still opens Group, Player and GM Setup, and existing Renown/discovery/claims are unchanged.
3. In **GM Setup → Player Access**, turn the player interface **off**. While a player is connected, verify its Actors button disappears, its open window closes, and `game.modules.get('ashen-gate-factions').api.open()` rejects for that player. GM opening still works.
4. In Manager → Player Access (once Borris' supporting version is installed), confirm Manager reads the Factions API and can restore access; otherwise use the standalone GM Setup switch. Verify the launcher returns and all saved progress remains.
5. Test after reload with Manager disabled, and with both a GM and a player. The actual Foundry V14 runtime is **not yet verified** for this release.

**Rollback:** restore the previous module ZIP (`0.3.3`) and world backup. No persistent data schema migration is introduced by this version; the new Boolean world setting is independent of campaign progression and only affects UI access. A downgrade to 0.3.3 will not enforce the Player Access switch, so do not rely on downgrade as a security feature.

**No new gameplay rules**, no Manager hard dependency, no permission or journal state reset, and no GitHub commit. Existing v0.3 faction/claim/discovery migrations are preserved for worlds upgrading from older builds.

**Known limitations:** Live GM/player V14/dnd5e permission tests and screenshots remain outstanding. Core player-view projection remains backed by per-player Journals; hiding the Factions UI does not change document permissions. The complete standard v1.4 search/footer/window-shell refactor and Manager `ag-foundry-import/0.2` definition adapter are separate future improvements.

## v0.3.2 — Foundry V14 navigation fix

- Replaced conflicting generic `data-tab` buttons with isolated Group / Player / GM Setup navigation.
- Uses a stable, delegated click listener so nested button icons also switch pages.
- No faction definition, standing, discovery, claim, request, or migration format changes from v0.3.1.
- GM Setup remains unavailable to player accounts; only GMs can edit settings.

# Ashen Gate — Factions & Renown v0.3.2 (previous)

**Experimental Foundry V14 module. NOT verified in a live Foundry V14 client. No GitHub commit.**

## v0.3.2 — Foundry Journal organization

- A GM session creates **Ashen Gate — Factions Data**, a real Foundry **JournalEntry** folder, and moves all existing **module-owned** faction definition, group-state, personal-state, folder-catalog and player-view Journals into it. Unrelated Journals and linked lore Journals are not moved.
- All newly generated module-owned Journals go directly into this folder. The folder is meant to stay collapsed in the Journal directory; it is **not** the same as faction-category folders inside the Factions dashboard.
- Faction definitions, history and state remain GM-only in their Journal permissions. The **per-player filtered view Journal** must retain Observer access for that player so their dashboard works. Such views may still be visible in that player's Journal sidebar under the folder. A future storage backend could remove these entirely from the Journal sidebar, but this maintenance update deliberately does not change the working security architecture.
- No scores, awards, claims, document flags, identities or imported faction contents are reset or rewritten as part of the folder move. Migration still runs as GM first. If the module-owned folder is deleted while the module is active, a later GM start will recreate it and refile the module-owned Journals.

## Upgrade safely

1. **Back up your Foundry world before installing.** This release migrates private permissions and Renown storage. Optionally export v0.2.1 factions before updating; a JSON definition export by itself is **not** a backup of campaign state.
2. Disable Factions & Renown. Replace the existing `Data/modules/ashen-gate-factions` folder with the same-named folder from the ZIP. Keep the module ID unchanged; do not install both releases simultaneously.
3. Restart Foundry and enable the module. Log in as a **GM first** and let migration finish. Hard-refresh player browsers (`Ctrl+Shift+R`).
4. Launch from **Actors → Factions**. Macro alternative: `game.modules.get('ashen-gate-factions').api.open();`.
5. Use a disposable test world or copy of your campaign for the first verification. If you encounter an error, retain the backup and report the browser console stack.

## New gameplay and interface

- **Group / Player / GM Setup tabs** remain, with GM Renown adjustments on both progress pages and a player-character dropdown.
- **Folders** are organizational only. GMs create/rename them, drag faction cards between folders, or use the folder selector. Optional tags are stored on factions.
- **Discovery** supports party-wide and personal discovery. Optional unknown placeholders can show anonymous undiscovered factions; folder names stay "Unknown Organization" until any faction in that folder becomes known to the viewer. Fully hidden factions are invisible.
- **Share with Party** copies that player's known faction information to the group, **not** their personal Renown or claims. A GM can disable the action per faction. Sharing requires an online GM to process the authorized request.
- **Information entries** can be written inline or linked by dragging an existing Foundry Actor/Journal/other document. Entry unlock conditions can be manual, Group Renown or Individual Renown. Discoveries are retained even if Renown later falls. Linked previews reveal the GM-authored text; opening an original linked document still requires Foundry permissions.
- **Rewards** are faction-specific, with no mandatory benefit taxonomy: **one-time claim**, **repeatable service request**, or **passive privilege**. Locked rewards show teasers; claimed one-time rewards stay claimed; privileges require current Renown. GMs can set a usage limit for each service and reset it manually. A use is counted **on fulfillment**, not submission or approval.
- **Milestones** support All Rewards or Choose One, default All. Group selections are player-requested and GM-confirmed. A GM can clear a selection without deleting already granted Items.
- **GM requests** are queued and approved/denied while a GM is online. Non-Item rewards are manually delivered. Linked Foundry Item rewards can be granted to an authorized player Actor, with duplicate-grant markers.
- **Private history** is visible in Group form to everyone who has discovered the faction, and personal history only to the relevant character's owner and GM. If Renown changes before discovery, its prior history becomes visible on discovery.

## Migration / state ownership

- The first GM session migrates v0.2.1 party scores and history from faction flags into a GM-only campaign state Journal. Existing claim Journals and personal state are preserved and made GM-only.
- Player information is served through one **filtered, owner-visible view Journal per player**. GM-only faction definitions and campaign ledgers are not readable by players. This design is a change from v0.2.1; validate permissions with two real player logins.
- Campaign discovery/knowledge flags live in Factions-owned campaign state rather than exported reusable definitions. Exporting through GM Setup excludes Renown scores, history, requests, usage, claims and discoveries.
- Faction identities retain `FACTION-*` and Renown IDs retain `RENOWN-*`; milestone and reward IDs are preserved on migration. The shared ownership and ID directions in GitHub `DEC-0038/0041/0050/0060/0065/0067` informed this build. This is not a guarantee that the prototype's internal Journal flags are a fully verified `renown-state.schema.json` wire adapter.

## Recommended first tests in Foundry V14

1. Upgrade a backed-up world with a faction at nonzero Group Renown. Confirm original standings, personal standings, history and claims remain.
2. Create a folder, move a faction into it, mark another faction as an undiscovered placeholder, and compare GM versus **two** player views. Reveal one faction personally, then Share with Party.
3. Award Renown for a **hidden** faction. Confirm the player cannot see it or its history. Reveal the faction; confirm the earlier activity appears.
4. Add a manual/threshold-based information entry and a linked Journal. Check the limited preview versus original document permission behavior.
5. Add a one-time Item reward, a repeatable service with **one use**, and a passive benefit. Claim or request through a player, approve as GM, mark fulfilled, reset service use, and verify no second Item grant.
6. Check Choose One on a Group milestone. Have a player propose a reward, GM approve, then exercise the GM override.

## Remaining integrations and known limits

- Not yet verified in live Foundry V14. The local tests use Node model assertions and an in-memory Foundry-shaped harness, not a renderer, socket server, or real dnd5e sheet.
- **General Manager** remains the intended canonical definition importer; Manager imports/ZIP round-trips and `ag-foundry-import/0.2` adapter support are **not** implemented in this module. `Export definitions` is an experimental authoring export, not a Manager package.
- Only Foundry `Item` documents are auto-delivered. Profession Recipes/Perks and Objectives remain linked or manually fulfilled pending their owning modules' APIs. Headquarters remains a separate module.
- The generic faction benefit/category tags are for filtering and authoring, not mechanical behavior.
- Revealed information entries link to external documents only when their original Foundry permissions permit opening. The module does not bypass Actor or Journal permissions.
- New requests and Share with Party require an **online GM** (as agreed). The runtime validates an owner-view capability and Actor ownership before GM processing; this is an experimental security approach requiring a multiplayer audit.
- Module-owned Journals are organized under the Foundry Journal folder **Ashen Gate — Factions Data**. Private records remain GM-only; the per-player filtered Journal remains visible to its owner as required by the v0.3 projection design.
- The four seeded guilds and numerical five-rank thresholds are still **draft content**, not approved canon.

## Local checks (Node 22)

```bash
node tests/v03.test.mjs
node tests/runtime-v03-smoke.mjs
node tests/sidebar-smoke.test.mjs
node --check scripts/core.mjs
node --check scripts/module.mjs
```

Old v0.2.1 test sources are archived under `tests/legacy/` for provenance and are intentionally **not** run against the changed private-data architecture.

## Unreleased source-only correction (AG-WORK-0021 / 0024; 2026-10-17)
GitHub `main` now contains a strict `sourceDefinition` export/save guard and regression tests for unknown top-level and nested reward-claim campaign fields, plus a pinned Quest v0.4.0 source harness. **No new build or module release exists.** The published `0.6.0 Beta` ZIP predates this correction and is still the exact recommended test pin. Do not repackage the changed source as v0.6.0; the next installable release requires its own bumped version, checksum and authorization. See `systems/factions/source-state/v0.1/SOURCE_CORRECTION_EVIDENCE.md` and Work Queue.

**Verified source-only tests:** GitHub Actions run `39050959673` passed 40/40 Factions Node and 9/9 Quest pinned tests on source commit `beacfc48043908c761921cea587edaff12ce5838`; strict schema Python 5/5. No revised ZIP exists and the v0.6.0 artifact is not equivalent to post-release checkout source.
