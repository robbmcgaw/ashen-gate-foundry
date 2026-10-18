# Skill Trees v0.6.0 — user-run Foundry beta plan

Use `AG_Skill_Trees_v0.6.0_Test_Cases.csv` (or provided XLSX) for exact numbered steps, roles, Pass/Fail and Test Notes on the same row. Begin with clean QA fixture install and verify native Actor and Feature records; test the shared Actors shelf at rank 30, Player Access on/off and source visibility, generic/Cinder point wallets and prerequisite/exclusion behavior, Profession read-only ownership, GM publishing, close/reopen, optional Manager-disabled behavior, responsive GM/player views, safe reset and private journal protection.

The source-level Node suite passed 61/61. **All live Foundry V14 tests remain NOT RUN.** Record actual Foundry Build, dnd5e version, browser, GM and player client type, screenshot and console errors. Testing on a disposable world is mandatory for any QA Actor / point changes. Do not create or change production Actor XP/Perks/Recipes. The imported QA Feature Items are synthetic GM-only drafts, never approved source.

---
## Historical checklist (v0.5.1 and earlier)

# Skill Trees v0.6.0 — user-run Foundry beta plan

Use `AG_Skill_Trees_v0.6.0_Test_Cases.csv` (or provided XLSX) for exact numbered steps, roles, Pass/Fail and Test Notes on the same row. Begin with clean QA fixture install and verify native Actor and Feature records; test the shared Actors shelf at rank 30, Player Access on/off and source visibility, generic/Cinder point wallets and prerequisite/exclusion behavior, Profession read-only ownership, GM publishing, close/reopen, optional Manager-disabled behavior, responsive GM/player views, safe reset and private journal protection.

The source-level Node suite passed 61/61. **All live Foundry V14 tests remain NOT RUN.** Record actual Foundry Build, dnd5e version, browser, GM and player client type, screenshot and console errors. Testing on a disposable world is mandatory for any QA Actor / point changes. Do not create or change production Actor XP/Perks/Recipes. The imported QA Feature Items are synthetic GM-only drafts, never approved source.

---
## Historical checklist (v0.5.1 and earlier)

# Player Access v1 — DEC-0072 release checks (not yet live-run)

- [ ] PA-01: Existing player launcher remains enabled by default on upgrade.
- [ ] PA-02: While two player clients are connected, GM hides interface; launcher removed and pre-opened window closed.
- [ ] PA-03: Saved macro, direct API.open, settings menu, or `new Application().render()` cannot open it while Hidden.
- [ ] PA-04: Show again; authorized player can open from Actors and original permissions remain.
- [ ] PA-08/09: Manager disabled, world reload, reconnect and second player sync preserve the gate.
- [ ] PA-10: Non-GM `api.playerAccess.setEnabled(true)` rejected.
- [ ] PA-12: GM-only Setup and source-restricted content remain protected when Visible.
- [ ] PA-13/14: Import content while hidden; no XP, known recipe, node unlock or Item progress reset/duplicate.
- [ ] GM and player console traces, main/edit view screenshots, responsive layout and button click-through recorded as ACTUAL Foundry observations only.

---

# Skill Trees v0.3.0 — Foundry V14 GM/player beta checklist

Mark each PASS / FAIL and paste error console screenshots. Do this on a disposable world or on **disposable Actors**.

| Test | Action | Expected |
| --- | --- | --- |
| ST-01 | Forge import over v0.1; enable; open Actors launcher and Game Settings | Both open v0.3.0 without console errors |
| ST-02 | GM Setup → Initialize Storage; Developer Tools → Add Demo Trees | Two marked demo trees appear; GM Journal has default ownership None |
| ST-03 | As player, open Ledger/Skill Trees | Player sees public demo trees, not GM editor or Manager buttons |
| ST-04 | GM award 3 generic points; select/buy nodes | Balance goes down; purchase checks AND/OR and mutual exclusion; survives re-open |
| ST-05 | GM Cinder award 1 + 12 with unique labels; try extra | Lifetime cap 13; generic wallet unaffected; repeated milestone rejected |
| ST-06 | GM edit layout: drag node, Connect, set OR and exclusions | Positions/edges persist; cycle/self-link rejected; Undo and Redo work |
| ST-07 | Drop imported PERK-/POWER- Feature Item from palette | Source ID is linked; stays hidden draft until intentionally published; no duplicate Item |
| ST-08 | Temporarily hide a demo node as GM-only and put a hidden prerequisite on a visible child | Player cannot see hidden name, text or source ID; visible child has generic lock reason |
| ST-09 | GM Player Preview and real player login | Both public projections match; no hidden Journal content accessible to player |
| ST-10 | Player Request Unlock | Private GM ChatMessage appears; no Actor progress changes until GM approves |
| ST-11 | Create Profession source tree, e.g. PROF-EXAMPLE | Read-only, no invented XP/level or grant XP UI |
| ST-12 | Disable Manager/Ledger while Skill Trees remains active | Generic demo works; source-bound imported perks fail closed, not crash |
| ST-13 | Review Legacy preview (if v0.1 had trees) | Old layouts copied as GM-only drafts; old Actor flags unchanged; legacy not silently erased |
| ST-14 | GM Setup → Export/Import Layout JSON, backup Actor flags, close/reopen | Layout stable ID retained, purchased nodes protected; no automatic Item rewards |

Record: Forge module version, Foundry build, dnd5e system version, browser, whether GM and separate player clients were present. This is an actual-user beta suite; no result is claimed here.

### v0.2.1 contract smoke tests
- [ ] Open **Profession** tree and drag a Manager-tagged `PERK-*` `feat`: accepted as a hidden draft; `POWER-*` should not appear in the palette and cross-domain drop is rejected.
- [ ] Open **Cinder** tree and drag a Manager-tagged `POWER-*` `feat`: accepted as a hidden draft; `PERK-*` rejected.
- [ ] Manager-tagged `HPERK-*` Hireling `feat` cannot be linked by this alpha.
- [ ] Try the canonical source manifest `ag-source-package/0.1` and Manager import `ag-foundry-import/0.2` via Skill Trees Import Layout: clear error and unchanged layouts; use Manager for actual content import.
- [ ] Reload Foundry and verify existing v0.2 demo layouts, GM storage Journal, player public projection, and any sandbox Actor points are preserved.
- [ ] Test actual player account; no unreleased node description, ID or Manager Feature leaked.

### v0.3.0 standard and role smoke checks (Archie DEC-0068–0071)
- [ ] ST-15: `module.json`, Manage Modules and visible header all say **0.3.0**; ZIP upgrades rather than creating a second installed module.
- [ ] ST-16: GM and a real non-GM see an enabled, correctly sized **Skill Trees** button **above Actors**. GM can select `Skill Trees | GM Setup`; player sees only `Skill Trees` and cannot invoke GM actions through direct API/macros.
- [ ] ST-17: All **GM Setup** buttons click through: New Tree, Import Layout, Export Selected/All, Publish Player View, Backup Actor Progress. `Developer Tools` expands and demo/legacy controls are GM-only, marked experimental.
- [ ] ST-18: Manager imported `PERK-*` and `POWER-*` Features link by stable ID, independent of Item folder; Skill Trees **never** creates `foundry.folder_path` folders. Any Item/Journal folder test belongs to Borris Manager.
- [ ] ST-19: Narrow + expanded window, long names/notes, Actor/tree select changes, view switching and canvas drag/zoom have no critical overlap/clipping. Collect GM Tree View and GM Setup screenshots for comparing with other Ashen Gate modules.
- [ ] ST-20: Disable Manager while keeping Skill Trees active; the Actors launcher still opens and demo tree view works. Re-enable Manager and verify its optional launcher tile correctly opens the same module.
- [ ] ST-21: Reload the same test Actor after upgrade; v0.2 points, unlocks and private layout edits remain; no migration or duplicate items occurred.
