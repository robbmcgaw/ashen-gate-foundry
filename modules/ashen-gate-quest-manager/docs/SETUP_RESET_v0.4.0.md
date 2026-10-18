# Quest Manager v0.4.0 Alpha — real-record Foundry test setup & reset

**Environment target (not certified):** Foundry V14 Stable 9, Build 367, The Forge, dnd5e 6.0.6. Test on a DISPOSABLE backed-up world. No live user/GM acceptance has been run by the developer.

## Install / prepare

1. Back up your disposable test world. Install `AG_ashen-gate-quest-manager_v0.4.0_Alpha.zip` as the standalone `ashen-gate-quest-manager` module (one folder with `module.json` at its root) and enable it under Manage Modules. Do not overwrite the v0.3.1 backup ZIP.
2. Make a GM account, Player A, Player B, and at least one Actor owned by Player A but not Player B. Do not give players Owner permissions to Quest Manager GM Source/ASSIGN Journals.
3. GM → **Actors** → **Quest Log** → **GM Setup**. Toggle **Show Quest Log to players** only when the test asks you to; new worlds default Hidden, upgrades preserve the stored `playerAccessEnabled` value.
4. Expand **Advanced import and source libraries**, click **Import JSON**, choose `docs/fixtures/quest-v0.4.0-representative.json` (6 canonical Objective definitions: QUEST/ORDER/CONTRACT). This uses the real Quest Manager importer and creates Foundry Journal records; it is **not** a fake empty test mode.
5. All imported Objectives begin at campaign **Hidden**. For each test, select its record and change campaign status, audience, and **Reveal Quest** as specified. Definition visibility `gm` is never published; `reveal_gated` requires an additional check; `player` is visible once status is non-Hidden and the interface gate allows it.
6. The separate `docs/fixtures/quest-v0.4.0-assignment.json` is a real GM-owned ASSIGN record that you paste into the **Advanced Delegated Assignments → Assignment JSON** field for its target Objective. Never import campaign Assignment state through General Manager.
7. Open a second browser session as a player, not a second GM, to observe actual permission enforcement. Record version, role, step, expected, actual, Pass/Fail and any console errors in `QA_TEST_CASES_v0.4.0.csv` or the spreadsheet.

## Understanding the controls

- **Player Interface** toggle in GM Setup gates player access to the Quest Log *window*. It does **not** reveal any quest and does not duplicate state.
- **Definition visibility** sets whether the source is GM-only, player-publishable, or reveal-gated.
- **Campaign status** tracks Hidden / Available / Active / Completed / Failed independently from source lifecycle `draft` / `approved`.
- **Reveal Quest** is only needed for reveal-gated source records. Individual quests additionally require the viewer to own the selected Actor.
- **Track** is a player-owned preference. **Show Objectives Overlay** controls the floating overlay; it displays only already-authorized objectives. It never writes quest progress.
- **Compendium pack IDs** is an optional GM-only advanced source-library configuration; leave empty unless testing configured source compendiums. Changes require reloading the world.

## Exact console commands (copy all of each line)

GM version and visibility:
```js
const q = game.modules.get('ashen-gate-quest-manager')?.api; console.log(q?.version, q?.playerAccess.getState());
```

GM source vs campaign state:
```js
const q = game.modules.get('ashen-gate-quest-manager')?.api; console.log(q.getGMSource('QUEST-QA-REVEAL'), q.getGMState('QUEST-QA-REVEAL'));
```

Player overlay preferences (requires GM Player Interface enabled and published quest):
```js
const q = game.modules.get('ashen-gate-quest-manager')?.api; await q.tracking.set({ids:['QUEST-QA-PATH','QUEST-QA-REVEAL'],visible:true}); console.log(q.tracking.get());
```

Player GM-only source denial:
```js
const q = game.modules.get('ashen-gate-quest-manager')?.api; try { console.log(q.getGMSource('QUEST-QA-PRIVATE')); } catch(e) { console.log(e.message); }
```

## Reset

**Preferred:** Restore the disposable world's backup. This is safest because a Quest can own GM source Journals, player projection Journals, Actor note Journals, archival notes, and delegated ASSIGN Journals; deleting only source Items/Journals is not a complete reset.

**Manual cleanup only if necessary:** As GM, remove all `ASSIGN-QA-*` records first in the Advanced Assignment panel, then delete the six `QUEST-QA-*`, `ORDER-QA-*` and `CONTRACT-QA-*` Objectives through GM Setup; confirm there are no remaining Quest-owned Journals or note archives you wish to retain. Restore the backup to reset Player Access, per-user tracking flags and pack config; a module disable/re-enable does not erase those saved values.

## Known limitations

- Browser UI behavior, cross-client hook synchronization, Forge hosting, native Foundry permissions and migration from older worlds **not yet tested**.
- GM/player reveal failure reported on v0.3.1; v0.4.0 addresses the confusing source visibility + player interface gates in code but **does not claim the original live defect is resolved** until retested.
- Player Quest Log overlay is intentionally read-only. Quest acceptance, reward grants and cross-module completion automation are not added.
- No finalized status-transition vocabulary is imposed on GM-only ASSIGN execution. Old Quest/Assignment flags remain unchanged.
