# Build brief 14: UI lint to strict

Self-contained brief for a build chat. Read `scripts/ui-lint.mjs` (its header explains ratchet and strict rules), `scripts/ui-lint-baseline.json`, and `docs/ui-pass-plan.md` → "Drift check".

**Run last**, after briefs 04–13 have merged (13 is kit 2.1.0, #187).

## Branch, merge, version
- Branch `ui/lint-strict` from `main`. A normal PR; merge when green.
- Mainly `scripts/ui-lint.mjs`, `scripts/ui-lint.test.mjs`, `scripts/ui-lint-baseline.json` and docs. A module file changes only for a one-line fix the new rules force; that module then gets a patch bump. The Release workflow publishes only modules, so nothing releases.

## Where things stand (checked 2026-10-21)
- **`scripts/ui-lint-baseline.json` on `main`** (after briefs 04–12): every module is at **0 on every rule**, except Character Hub: `css-raw-px-box=3`, `css-kit-prefix-class=4`.
- **On the kit 2.1.0 branch (`ui/kit-2-1`, #187):** Character Hub drops to `css-raw-px-box=1` and `css-kit-prefix-class=0`. Everything else is 0. Re-read the baseline on `main` after #187 merges.
- **Rules still `ratchet` in `scripts/ui-lint.mjs`:** `css-colour-literal`, `css-raw-font-size`, `css-legacy-alias`, `css-viewport-media`, `css-raw-px-box`, `css-kit-prefix-class` (commented "strict in the plan"), `js-dialogv2-direct`, `header-brand-version` and `button-title-attr`. Only `fa-legacy-prefix` and the kit-wide checks are strict.
- **`ag-lint-allow` lines** in module CSS on `ui/kit-2-1`: Character Hub 15 (HP bar game colours), Skill Trees 6, Renown 1 (symbol plate), Manager 1.
- **Gap:** `js-dialogv2-direct` counts only `DialogV2.confirm(` and `DialogV2.prompt(`. It misses `DialogV2.wait(` and `new DialogV2(`, which is how Hub attunement and Locations "Delete route" slipped past.

## Scope
1. **Make every module rule strict** (0 in every module): all nine rules above, including `css-raw-px-box`, because every module already reaches 0.
   - Character Hub's last `css-raw-px-box` (1 after #187): fix it with a token, or mark it `/* ag-lint-allow: reason */` if it is a true fixed size. Do that in this PR as a one-line CSS change with a Hub patch bump, or ask Studio to fold it into another Hub PR first.
   - Delete the per-module ratchet comparison. Keep `--update-baseline` only if a rule stays ratchet; otherwise remove the baseline file and its check, and say so.
2. **Widen `js-dialogv2-direct`** to also count `DialogV2.wait(` and `new DialogV2(` outside `ag-dialogs.mjs`.
   - Intentional custom dialogs (Ledger material consent, gathering roll) must sit on a line with `// ag-lint-allow: custom dialog, has ag-dialog classes`, and the check confirms `ag-dialog` appears in the same call's options (regex over the next few lines is enough).
   - Run it on `main`: anything it finds that isn't allowed is listed in the PR. Fix one-liners in place (with that module's patch bump); otherwise add a follow-up line to the pass plan.
3. **Make `ag-lint-allow` honest:** the comment must carry a reason (`ag-lint-allow: <at least 3 words>`). A bare `ag-lint-allow` fails. List every allow line in the PR description, so Robb can see what was exempted.
4. **New modules** (any folder under `modules/`) are checked strictly with no baseline.
5. **Update `docs/ui-pass-plan.md`:** mark the lint step done and list any exceptions or follow-ups.

## Acceptance checks
1. `node scripts/check.mjs` is green on the branch.
2. **`ui-lint.test.mjs` covers:**
   - each strict rule failing on a planted violation in a temp module fixture;
   - `DialogV2.wait(` and `new DialogV2(` counted, unless allowed with the `ag-dialog` classes present;
   - a bare `ag-lint-allow` (no reason) failing;
   - `ag-lint-allow` exempting a colour line;
   - the per-module exception list;
   - a new module starting strict.
3. Introducing a 9px `font-size` in any module's CSS makes `check.mjs` fail (show this in the PR, then revert it).

## Forge click steps for Robb
- None. This only changes the repository's checks; nothing in Foundry changes.

## Only Robb can verify
- Nothing in Foundry. It's a developer guard.
