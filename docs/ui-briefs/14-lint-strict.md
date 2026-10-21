# Build brief 14: UI lint to strict

Self-contained brief for a build chat. Read `scripts/ui-lint.mjs` (its header explains ratchet and strict rules), `scripts/ui-lint-baseline.json`, and `docs/ui-pass-plan.md` → "Drift check".

**Run last**, after briefs 04–13 have merged. (Studio's list numbered this 13. It moved to 14 because brief 13 must remove the Hub's last direct DialogV2 call first.)

## Branch, merge, version
- Branch `ui/lint-strict` from `main`. A normal PR; merge when green.
- Only `scripts/ui-lint.mjs`, `scripts/ui-lint.test.mjs`, `scripts/ui-lint-baseline.json` and docs change. **No module files, so no module version bumps.** The Release workflow publishes only modules, so nothing releases.

## Scope
1. **Run `node scripts/ui-lint.mjs` on `main`** and list each module's counts per rule in the PR description.
2. **Make these rules strict (must be 0 in every module):**
   - `css-colour-literal` (lines with `/* ag-lint-allow: reason */` stay allowed, such as Hub HP colours and the Renown symbol plate)
   - `css-raw-font-size`, `css-legacy-alias`, `css-viewport-media`, `css-kit-prefix-class`
   - `js-dialogv2-direct`, `header-brand-version`, `button-title-attr`
3. **`css-raw-px-box` stays a ratchet rule** (some fixed sizes are fine, such as canvases and icon boxes). Lock the current numbers.
4. **If a module isn't at 0 for a rule that should become strict:**
   - Don't fix it in this PR.
   - Keep that rule as a ratchet for that module only (a per-module exception list in `ui-lint.mjs`), and list it in the PR with the count and file.
   - The pass plan gets a one-line follow-up for it.
   - Never weaken a rule for modules that already pass.
5. **Add strict checks:**
   - new modules (any folder under `modules/` missing from the baseline) start strict on every rule;
   - the baseline file can't list a module that no longer exists.
6. **Update `docs/ui-pass-plan.md`:** mark the lint step done and list any exceptions.

## Acceptance checks
1. `node scripts/check.mjs` is green on the branch.
2. **`ui-lint.test.mjs` covers:**
   - each strict rule failing on a planted violation in a temp module fixture;
   - `ag-lint-allow` exempting a colour line;
   - the per-module exception list;
   - a new module starting strict.
3. Introducing a 9px `font-size` in any module's CSS makes `check.mjs` fail (show this in the PR, then revert it).

## Forge click steps for Robb
- None. This only changes the repository's checks; nothing in Foundry changes.

## Only Robb can verify
- Nothing in Foundry. It's a developer guard.
