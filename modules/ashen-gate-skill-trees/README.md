# Ashen Gate | Skill Trees

## How it works (0.8.0)

- **Every node is a perk.** A node names a world perk by its permanent `PERK-*` id (Cinder trees: `POWER-*`); the world Item's UUID is only the local binding. Name, text, picture and point cost come from the perk (`point_cost` on the perk's source definition; 1 when absent). Add a perk to a tree by dragging it from the Items sidebar or the Perks list, or with its **Add** button. Position, required prerequisites, OR groups and exclusions are kept on the node.
- **Unlocking adds the perk to the sheet.** The unlock spends the character's points and creates an embedded copy of the perk, tagged `flags['ashen-gate-skill-trees'].grant = {perkId, treeId, nodeId, wallet, perkUuid}`. A player's unlock is checked and written by the active GM's client (a GM must be logged in). Refund and Reset (GM only) give the points back and remove the tagged Item. Profession trees stay read-only: the Profession Ledger owns profession perk choices.
- **Graph.** Arrows point from a prerequisite to the perk it opens. Dashed arrows marked OR: any one of the group. Red dotted ✕ lines: cannot take both. A legend sits under the canvas; the inspector and **Tree as a list** give the same information as text.
- **Import / export.** Tree files `{schema:'ag-skill-trees/0.3', trees:[…]}` (0.2 files still read) are imported through General Manager, which calls the GM-only `api.previewTreeImport(pack,{mode})` / `api.importTrees(pack,{mode})`. GM Setup keeps **Export Selected Tree** / **Export All Trees** for backups.
- **Saved data.** Older 0.2 nodes linked through `contentRef` read as perk nodes without being rewritten. Older custom nodes (no perk) still work, give no Item, and are listed under **GM Setup → Saved data check**; **Give Missing Perks** adds the Item for unlocks made before 0.8.0 (re-runnable, removes nothing).
- API: `unlock(actor, treeId, nodeId)`, `refund(actor, treeId, nodeId)` (GM), `resetTree(actor, treeId)` (GM), `giveMissingPerks()` (GM).

## History (0.6.0 alpha notes)

**Status:** installable Foundry V14 test candidate. Not live Foundry-certified.  **Module ID:** `ashen-gate-skill-trees`.  **Canonical source review:** GitHub `main` `89da7ab854fa87e1b2b77dfdd19c4e16f0b5c5f8` (AG-COORDINATED-BUILD-2026-10-17).  **Owner:** Zeke — Skill Trees only; Tim owns Profession Ledger.

## Scope and changes since v0.5.1

- One shared **Actors** launcher shelf (Skill Trees rank 30), coexisting with Profession Ledger, Factions, Headquarters, Quest Log, and Utilities. 36px full-width buttons with 5px separation; only our own launcher is removed when Player Access is Hidden.
- Compact GM Setup Player Access row, reduced button/section bulk, and window-width-responsive graph/inspector layout.
- **Install QA Fixture Records / Reset QA Fixture** replaces the old developer-only Add Demo Trees control. It creates a **real disposable Foundry character Actor**, **two native GM-only draft `feat` Items**, and **three private Journal-backed Skill Tree layouts**. Source records and layouts are synthetic, unmistakably `[AG QA]`, and never approved D&D content. No fake UI rows or automatic XP/Perk grants.
- Profession-tree spending remains **read-only**; linked `PERK-*` does not present a misleading enabled Record Unlock button. Generic/Cinder test wallets work independently.
- Closing the window invalidates its cached instance for a fresh reopen. No automatic migration of older layouts, Actor flags, or historical demo records.

## Install and setup (disposable world recommended)

1. Back up your Foundry world and install `AG_ashen-gate-skill-trees_v0.6.0_Alpha.zip` (one `ashen-gate-skill-trees/` folder); enable **Ashen Gate | Skill Trees**. Target reported environment: Foundry V14 Stable 9 build 367 on Forge, dnd5e 6.0.6; **not independently runtime tested**.
2. Open **Actors → Skill Trees** (or **Game Settings → Module Settings → Open Skill Trees**). As GM, select **GM Setup → Initialize GM Storage** if no private Journal exists. Do not give players access to `[AG] Skill Trees — GM Definitions`.
3. GM: expand **Developer Tools → Install QA Fixture Records**, read the confirmation, and confirm. The action creates `[AG QA] Skill Tree Test Character` (native character Actor), `[AG QA] Profession Perk Source` and `[AG QA] Cinder Power Source` (native draft GM-only `feat` Items), and three actual GM Journal layouts: `[AG QA] Generic Progression`, `[AG QA] Cinder Milestones`, `[AG QA] Profession Reference` (read-only).
4. In the native **Actors** directory, open `[AG QA] Skill Tree Test Character` and configure its **Ownership/Permissions** to give your test player **Owner**. Leave both QA source Feature Items GM-only; their `draft` state is deliberate. Join with a separate player account to verify the sanitized view.
5. Test the normal **Skill Trees** tab: award points, select nodes, record generic/Cinder unlocks, drag QA source Features into a tree while editing, publish player projection, and verify GM-only nodes are not visible to the player. The QA fixture is also serialized as `data/qa-fixture-v060.json` for exact data inspection, **not for import into Manager or Skill Trees**.
6. Complete the **Test Cases** sheet (`tests/AG_Skill_Trees_v0.6.0_Test_Cases.csv` or the separate Excel tracker). Actual GM/player observations remain NOT RUN until you perform them.

## Reset / safe cleanup

1. Export evidence and optional Actor/tree backups first. GM → **Actors → Skill Trees → GM Setup → Developer Tools → Reset QA Fixture**.
2. Confirm only after inspecting the list. Reset removes the three *known QA layout IDs* and deletes **only native Actor/Items tagged** `flags['ashen-gate-skill-trees'].qaFixture === 'ag-skill-trees-qa/0.1'`. It leaves untagged world documents, the private storage Journal and prior Demo layouts intact.
3. If another Actor has QA-tree points or unlocks, reset **refuses** to delete those layouts. Clear that progression only on a disposable character or back it up and resolve the conflict before retrying; never change live-campaign Actor state just to make reset succeed.
4. A partial native deletion failure is reported by document name and remaining tagged records can be retried with Reset; do not manually delete other module state.
5. Deleting the ZIP or disabling the module **does not** roll back any prior Actor modifications. Restore a test-world backup for a complete rollback.

## Progression and data boundaries

- **Tim's Profession Ledger** is the sole Actor Profession XP/level, profession `PERK-*` selection and known `REC-*` authority. Profession tree layouts remain read-only in Skill Trees.
- Skill Trees owns GM-private tree layouts (`ag-skill-trees/0.3`), sanitized published projection (`publicTreesV2`), and GM-awarded **generic** and **experimental Cinder** point wallets (`progressV2`). Since 0.8.0 an unlock adds the node's perk Item to the sheet (see the top of this file).
- General Manager is **optional** and owns canonical import; Skill Trees merely binds native world `feat` Items by stable `PERK-*`/`POWER-*` IDs. World-only source lookup: pack-only compendium/provider reads and reveal-gated owner policy are **not** wired yet. Do not assert support for either.
- Manager's own Admin window never becomes available to players from Skill Trees. Player Access (`ag-player-access/1`) gates window/launcher opening only; Foundry document ownership and GM Source visibility are separate. GM-only QA source Items are not player-facing.
- Existing historical Demo layouts, legacy settings, Actor state and source Items are preserved without migration, rewrite or deletion on install. The former Add Demo Trees button is removed; preexisting Demo layouts remain available until their GM reviews them.

## Test commands (source checkout, **not** browser console)

From the extracted installable ZIP folder `ashen-gate-skill-trees/` in a terminal with Node 22+ installed:

```sh
node --test tests/*.test.mjs
```

Expected result in this build: **61 tests passed, 0 failed** (local Node/mock source-level checks). This is not a live Foundry V14 acceptance result.

## Known limits

- User-run live Foundry V14 / Forge / dnd5e GM and player UI test, screenshot evidence, exact launcher combination and theme-controller callbacks: **NOT RUN**.
- Native QA Item creation uses test-only `ashen-gate-manager.source` metadata to exercise the read-only world source lookup. Those items are *not* Manager-imported canonical definitions; their source status is `draft` and visibility `gm`. Never ship them as real content.
- All Feature grants, Cinder manifestations/Strain, real Profession perks, respecs, distributed multi-GM spend locking and player self-spend remain outside this Alpha.
- Current world-only ID reader does not implement an explicit compendium snapshot/provider or player `reveal_gated` policy; do not use it to advertise those capabilities.
- The window requires visual confirmation of canvas scrolling/dragging and long-text wrapping on the user's installed Foundry build; source-level CSS tests do not certify its appearance.

See `RELEASE_NOTES.md`, `QA_REPORT.json`, `tests/FOUNDRY_BETA_CHECKLIST.md` and `tests/AG_Skill_Trees_v0.6.0_Test_Cases.csv`.
