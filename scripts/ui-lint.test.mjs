// The UI drift lint's rules on small synthetic inputs (scripts/ui-lint.mjs). Text checks only, no Foundry.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RULES, kitBlocks, lintModule, checkSizeSets, checkSkinCoverage, contrast} from './ui-lint.mjs';

const kitCss = `/* ag-ui kit 2.0.0 */
:root { --ag-text-md: 13px; --ag-space-1: 3px; --ag-control-h: 28px; --ag-radius: 8px; }
html[data-ag-size="comfortable"] { --ag-text-md: 14px; --ag-space-1: 4px; --ag-control-h: 36px; }
.ag-btn { } .ag-btn--primary { } .ag-card__head { } .ag-chip-group { }`;

function fakeModule(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-lint-'));
  for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true}); fs.writeFileSync(path.join(dir, rel), text); }
  return dir;
}

test('kit blocks drop __part and --modifier', () => {
  assert.deepEqual([...kitBlocks(kitCss)].sort(), ['ag-btn', 'ag-card', 'ag-chip-group']);
});

test('module CSS counts colours, raw font sizes, aliases, viewport media and px boxes; ag-lint-allow skips a line', () => {
  const dir = fakeModule({
    'styles/mod.css': `.x { color: #fff; background: rgb(0 0 0); font-size: 12px; padding: 4px 8px; }
.y { color: var(--ag-bg); gap: var(--ag-space-1); }
.z { color: #000; } /* ag-lint-allow: game colour */
@media (max-width: 600px) { .x { width: 10px; } }`,
    'styles/ag-ui.css': '.x { color: #123456; font-size: 99px; }',
    'tests/a.test.mjs': 'DialogV2.confirm(',
  });
  const {counts} = lintModule(dir, kitBlocks(kitCss));
  assert.equal(counts['css-colour-literal'], 2);
  assert.equal(counts['css-raw-font-size'], 1);
  assert.equal(counts['css-legacy-alias'], 1);
  assert.equal(counts['css-viewport-media'], 1);
  assert.equal(counts['css-raw-px-box'], 2);
  assert.equal(counts['js-dialogv2-direct'], 0, 'tests are not linted');
});

test('module classes with the kit prefix are counted; kit classes and module prefixes are not', () => {
  const dir = fakeModule({'styles/mod.css': '.ag-btn.agx-big { } .agx-root .ag-checkbar { } .ag-card__head, .ag-mine:hover { } .agx-row:where(.ag-btn) { }'});
  const {counts, where} = lintModule(dir, kitBlocks(kitCss));
  assert.equal(counts['css-kit-prefix-class'], 2);
  assert.deepEqual(where['css-kit-prefix-class'].map(w => w.split(': ')[1]), ['.ag-checkbar', '.ag-mine']);
});

test('scripts and templates: direct DialogV2 calls, legacy FA prefixes, header brand/version, button title', () => {
  const dir = fakeModule({
    'scripts/a.mjs': "await DialogV2.confirm({}); DialogV2.prompt({}); const i = `<i class=\"fas fa-x\"></i>`;",
    'scripts/ag-dialogs.mjs': 'DialogV2.confirm(',
    'templates/t.hbs': '<header class="ag-header"><h1><span class="ag-header__brand">Ashen Gate</span></h1></header><button type="button" title="x">',
    'templates/ok.hbs': '<header class="ag-header"><span class="ag-header__brand"></span><span class="ag-version">v1</span></header>',
  });
  const {counts} = lintModule(dir, kitBlocks(kitCss));
  assert.equal(counts['js-dialogv2-direct'], 2, 'the shared helper itself is exempt');
  assert.equal(counts['fa-legacy-prefix'], 1);
  assert.equal(counts['header-brand-version'], 1);
  assert.equal(counts['button-title-attr'], 1);
  assert.equal(RULES['fa-legacy-prefix'].mode, 'strict');
});

test('size sets must list the same tokens and keep radius out', () => {
  assert.deepEqual(checkSizeSets(kitCss), []);
  assert.match(checkSizeSets(kitCss.replace(' --ag-control-h: 36px;', '')).join(), /--ag-control-h is in :root/);
  assert.match(checkSizeSets(kitCss.replace('--ag-control-h: 36px;', '--ag-control-h: 36px; --ag-radius: 9px;')).join(), /radius tokens are shape/);
});

test('every kit block must be mentioned in each structural skin', () => {
  const ok = '.ag-btn {} .ag-card__head {} /* keep: .ag-chip-group */';
  assert.deepEqual(checkSkinCoverage(kitCss, {'stone.css': ok, 'tome.css': ok}), []);
  assert.deepEqual(checkSkinCoverage(kitCss, {'stone.css': '.ag-btn {} .ag-chip-group {}'}), ['stone.css does not mention kit part .ag-card']);
  assert.deepEqual(checkSkinCoverage(kitCss, {'stone.css': '.ag-btn-group {} .ag-card {} .ag-chip-group {}'}), ['stone.css does not mention kit part .ag-btn']);
});

test('contrast ratio matches WCAG', () => {
  assert.equal(Math.round(contrast([0, 0, 0], [1, 1, 1])), 21);
  assert.equal(contrast([1, 1, 1], [1, 1, 1]), 1);
});
