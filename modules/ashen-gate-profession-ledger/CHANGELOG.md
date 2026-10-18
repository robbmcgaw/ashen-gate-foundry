## 0.8.1 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

## 0.8.0 — 2026-10-18

- Players: **Recipes** and **Recipe Learning** are now one **Recipes** tab (#5). *Known by the party* lists every recipe learned by a roster character, who knows it and its ingredients; only those characters can craft it. *Found, not yet learned* lists recipe items in party inventories and who holds them; the holder's owner gets the Learn button.
- "Party" here means roster characters the player can see in the Actors sidebar (at least Limited permission); only their names, known recipes and held recipe items are shown. A recipe's details are shown to players only when it is approved and player-visible.
- Players no longer browse the full recipe catalog, and the Crafting Planner only lists recipes the party knows.
- GM: new GM-only **Recipe Catalog** tab (the old Recipes browser) with drafts marked "Draft — hidden from players" and a count of hidden recipes. Recipe Learning stays as a GM tab.
- Empty states explain themselves: "No recipe items in Belwar's inventory", unreleased (draft) recipe items a player holds are named, and the GM sees how many recipes/items are hidden from players.
- Recipe items are marked with a scroll icon and a "Recipe item" badge so they aren't confused with the crafted item.
- Learning still consumes the Actor-owned recipe item and requires OWNER; it now also refuses an unreleased (draft) recipe item for players in the data layer. No Actor flag format changes.

## 0.7.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.
- Fix: v0.7.0 shipped with `scripts/main.js` cut off after 68 lines (and a corrupt zip), so the module could not load. Restored the complete file.

## 0.7.2 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## v0.7.0 Alpha — coordinated build (2026-10-17)

- Removed fictional demonstration UI/API. Ledger views use actual Foundry Actors and native definition data.
- Preserved Actor XP, known Recipe, selected PERK ownership, and existing progression/recipe-learning semantics; no migration or Skill Trees changes.
- Added the pinned nine-record Profession source/import fixture, reversible real-data setup/reset notes, exact-format Foundry acceptance cases, and source-chain regression tests.
- Node/mock tests: **78 passed, 0 failed**. Live Foundry V14, multi-client, and Forge installation remain **NOT RUN**.

# Profession Ledger alpha changelog

## v0.6.2 — AG-WORK-0013 consumer permission hardening (2026-10-16)

- Ignore caller-supplied viewer in world-native definition lookups; use Foundry `game.user`. Opaque `not_found` for non-GM duplicate/type/version/lifecycle failures.
- Permit `publicForAll` only for the real GM; Observer callback errors fail closed; exact `expectedVersion` supported for GM diagnostics.
- 5 targeted local consumer regressions; 75/75 existing-plus-new tests pass. No mutable state change, compendium adapter not yet integrated, no live Foundry test.


## v0.6.1 — AG-WORK-0011 pinned definition read repair (2026-10-16)

- Read Manager v0.11.1 `flags["ashen-gate-manager"].source.definition` as the immutable, complete Recipe/Material/Item definition from an authorized native Item binding, preserving IDs, entity types, custom fields and every typed ref.
- Carry canonical Recipe `ingredients`, `profession_id`, `result_item_id`, tier and effort through the read-only catalog adapter; preserve all Material fields including `tierId`, `quality`, `priceGp`, `weightLb` and refs.
- Prefer current world source documents to stale catalog summaries; retain a nonfabricating fallback for older world Items that lack `.definition`. Unmatched IDs, duplicates, archived records, restricted draft player records and corrupted identity/ref flags cannot provide a canonical binding.
- Add Tim's pinned immutable source snapshot and Manager v0.11.1 projection helper as test-only fixtures. 70/70 Node tests; mock Foundry only, no real-world import. Two `PROF-*` required targets remain outside pinned three-record fixture.
- Do not migrate Actor flags, XP, known recipes, Item inventories, perk selections, worlds or compendiums. Optional Manager remains nonmandatory.

## v0.6.0 — AG-WORK-0011 / 0016 implementation (2026-10-16)

**Scope:** AG-WORK-0011 (Foundry Tooling) and AG-WORK-0016 (shared UI reference).

**Verified source baseline:** the actual prior ZIP in this conversation; Work Queue compatibility-report version numbers were not installable source releases.

**New:** temporary read-only canonical source-ID lookup of active native world documents; strict duplicate/archive and player access handling; a provenance-preserving, fail-closed check for imported materials and perks; Actors launcher rank cooperation; baseline --ag-* CSS token fallbacks.

**Specific authority safeguard:** Skill Trees cannot purchase Profession PERK-* using Cinder/generic tree points; Profession selection remains Ledger-owned until the Tim source contract is tested.

**Missing in this Alpha:** live Foundry 14 tests; Tim/Manager round-trip for structured Recipe/Perk data; compendium lookup; approved resolver provider version; full live Manager skin subscription. These are NOT claimed implemented.

**State migration:** none; existing settings and Actor flags are unchanged. No automatic grants or source reimports.

**Versioning:** first actual installable successor to the confirmed release, not a repackage of a claimed nonexistent 0.6.0/0.5.0 checkpoint.




## v0.5.0 — Player Access contract (DEC-0072; 2026-10-15)

- Adds independently registered GM-restricted world Boolean setting `playerAccessEnabled` and optional interoperability API `game.modules.get('ashen-gate-profession-ledger').api.playerAccess`: `contract: ag-player-access/1`, `getState()`, `setEnabled(boolean)`.
- **Existing-player-interface upgrade default: Visible**. The setting begins `true` if it did not previously exist; a GM may switch to Hidden locally in GM Setup / Module Settings or centrally from a Manager supporting the contract.
- Hidden removes the Actors launcher for non-GMs, closes rendered player windows on setting sync, and rejects public opening paths (including macro/API and direct app renders); re-enabling restores the button. GMs remain able to open and administer the module. Player permissions, record visibility and role controls still apply when Visible.
- Does not remove, migrate, reset, regrant or disable stored progression, owned Features, Items, recipes, tree layouts, gathering awards or ordinary Foundry effects. No gameplay balance or canonical schemas altered.
- Local UI enhancement: real GM Setup Player Access status + Hide/Show button, independent of Manager. Sensitive tool buttons remain separately GM-only.
- Implements approved DEC-0072 with `foundry/integration/PLAYER_ACCESS_CONTRACT.md` and Foundry development standard AG-FOUNDRY-DEV/1.4 at GitHub `7cc5895eef480e0f6e3b62db4ab07d9e91616b5e`; `foundry.folder_path` remains Manager/content-author responsibility.
- Automated tests: **43 passed; zero failed**. No live Foundry V14 or multi-client test, no UI screenshots. The manager's centralized panel is a **separate build** and must be tested after Borris releases it.
## v0.4.0 — Actor Profession progression, Recipe Learning and Gathering (2026-10-15)

- Tim handoff: Actor-owned Profession XP in Ledger; 1–16 levels, 5/8/.../47 per-level XP costs, 1 perk selection per level, tier gates at 1/4/7/10/13. GM XP award; no independent Skill Trees XP or premature Perk purchases.
- New Recipe Learning tab with Actor permission checks, consumable tagged `REC-*` Item quantity updates/deletion, permanent known ID tracking, duplicate prevention and best-effort transaction rollback. Learning may precede tier eligibility.
- Crafting permission requests now require the selected Actor to know the Recipe and satisfy any tracked tier requirement; planning remains read-only.
- New Gathering tab: player request, GM-configured temporary scene/eligible Profession/DC/tier/`MAT-*` reward, owner chat roll prompt, reported check preview, cosmetic GM reward spinner with reduced-motion support, explicit GM item award. No automatic XP, resource depletion, or invented profession check formula.
- Expose source-checked `getProfessionProgress`, GM-only `awardProfessionXP`, `getKnownRecipes` APIs; no `getAvailablePerkSelections` or `selectProfessionPerk` until Tim's full Perk eligibility source is verified.
- Preserve v0.3 module identity, roster/catalog setting keys, optional Manager interoperability and role-separated navigation. New Actor flags are only written on explicit confirm; no startup migration.
- Automated Node tests for progression boundary, recipe learning duplicate/rollback/delete, source visibility, gathering award/check validation, player/GM access and Planner knowledge gating. No live Foundry V14 claims.


## v0.3.0 — Foundry standard 1.3 interface pass (2026-10-15)

- Migrate GM-specific roster/import/integration controls out of player header into a dedicated, permission-restricted **GM Setup** tab; segregate demonstration under **Developer Tools**.
- Use standard `Ashen Gate | Profession Ledger` title, header version/Help, tab row and persistent bottom-right roster Save/Cancel actions.
- Add explicit unsaved roster editing guard on tab/Cancel navigation, with stable world roster state and no startup migration.
- Preserve the existing player-facing Actors launcher, recipe groups, Manager v0.2 catalog adapter, source visibility filters, and all prior stable source IDs.
- Align with DEC-0068–0071 and `AG-FOUNDRY-DEV/1.3`; Manager continues to own typed `foundry.folder_path` import placement.
- No new Profession level/XP rules, learned Recipe grants, automatic crafting or Actor writes.
- New offline GM/player/roster-navigation tests; no live Foundry claims or GitHub commit.

## v0.2.3 — Manager v0.4 compatibility + source-safety pass (2026-10-15)

- Read `ag-foundry-import/0.2` public Recipe and Material definitions directly, with typed refs and stable ID validation; retain Ledger /0.1 and Manager /0.1 compatibility. No Actor/world Item writes or automatic data migration.
- Exclude GM-only/reveal-gated/retired definitions and those depending on restricted records from public world-setting catalog imports. Filter Manager source-visibility flags when players browse World Items and Actor material inventories. Add GM badges for actual source restrictions.
- Require immutable `MAT-*` identity for already-tagged material ingredient matching; do not count mismatched tagged Items by name. Invalid/empty ingredient arrays remain unmapped and noncraftable.
- Refuse Profession-only or fully restricted Manager JSON catalog replacements. Preserve existing roster, catalog, and launch paths across module update.
- Show newly Manager-tagged `PROF-*` Actor Items without inventing XP, levels or canonical display-name mappings.
- Add synthetic Manager v0.2 fixture, 13 new Node subtests, cross-check with actual Manager v0.4 package validator. Foundry runtime test still pending.
- No game-rule revisions, no learned-recipe Item consumption, no GitHub publishing.

## v0.2.2 — Player UI and indexed-recipe navigation (2026-10-15)

- Hide Explore Demo and Manager launcher from players; reject direct player attempts to trigger those actions, including forcing demo through the public API. Keep both controls available to the GM.
- Group recipes in both Library and Planner by the existing Profession metadata. Display unmapped records under Unassigned profession; never infer missing associations.
- Add collapsible groups with per-Profession counts, Expand all, Collapse all, and live search by recipe name, Profession, tier or ID.
- Preserve recipe definitions and Actor state; no data migration. Keep Profession levels/XP unchanged while awaiting Tim’s updated package.
- New offline regression suite verifies category grouping, UI markup, player-facing restrictions and GM controls. Not yet live-tested in Foundry V14.

## v0.2.1 — Critical startup fix (2026-10-15)

- Stop calling Foundry `getFlag()` on optional / unregistered module scopes while indexing Items. Use read-only document `flags` instead, including Manager and `ashen-gate` compatibility.
- Read optional Skill Tree progress from `actor.flags` without requiring its plugin namespace to be registered.
- Try attaching the Actors sidebar launcher when Foundry is ready, as well as during directory renders.
- No migrations or world-content changes. Roster and recipe catalog are preserved as settings.
- Regression test now explicitly throws for all `getFlag` calls to reproduce the reported Foundry V14 error.

## v0.2.0 — GM roster, launch access, visibility

- GM-managed world-persistent party roster, with Save, Clear, and Select player-owned character shortcuts. Only rostered Actors contribute to non-demo party calculations; each client remains bounded by Foundry Observer access.
- Actors-sidebar **Profession Ledger** launcher for GM and players using Foundry render hooks; Module Settings and macro open methods remain.
- GM-only permission badges on roster characters, Individual selection/details, profession holders, material sources, recipe definitions, crafting contributions; tooltips list which player accounts have or lack Observer access. A shared recipe catalog is labeled separately from learned recipes.
- Individual view now uses an upper character row and 75/25 Professions/Materials columns, stacking responsively. Selection cards wrap text instead of clipping.
- Read-only compatibility resolver recognizes `flags.ashen-gate.entityId` for typed material/recipe/profession IDs alongside older Manager and Ledger tags.
- Added regression tests for roster selection, GM/player permission boundaries, launcher idempotence, and typed ID compatibility.

### Known limits

- Foundry v14 live test for this version is pending. The tests are simulated/node tests, not a guarantee that the launcher appears in every Foundry/Forge build.
- Crafting is a read-only plan and whisper request. Recipe ownership/consumable learning and full profession-tier/tool gating are **not yet implemented**.
- Imported Ledger catalog definitions are player-readable regardless of character learned status; do not import GM secrets there.
- Old description-only Material Items are not auto-migrated or assumed to be recognized.
