// The UI drift lint's rules on small synthetic inputs (scripts/ui-lint.mjs). Text checks only, no Foundry.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RULES, kitBlocks, lintModule, judgeModule, modeFor, checkBaselineModules, readBaseline, checkSizeSets, checkSkinCoverage, contrast} from './ui-lint.mjs';

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

// ---------- Strict rules (brief 14) ----------
const STRICT = ['css-colour-literal', 'css-raw-font-size', 'css-legacy-alias', 'css-viewport-media', 'css-kit-prefix-class',
  'js-dialogv2-direct', 'header-brand-version', 'button-title-attr', 'fa-legacy-prefix'];
const PLANTED = {
  'css-colour-literal': {'styles/mod.css': '.agx-a { color: #c0ffee; }'},
  'css-raw-font-size': {'styles/mod.css': '.agx-a { font-size: 9px; }'},
  'css-legacy-alias': {'styles/mod.css': '.agx-a { background: var(--ag-panel); }'},
  'css-viewport-media': {'styles/mod.css': '@media (max-width: 700px) { .agx-a { display: none; } }'},
  'css-kit-prefix-class': {'styles/mod.css': '.ag-homemade { display: none; }'},
  'js-dialogv2-direct': {'scripts/a.mjs': 'await foundry.applications.api.DialogV2.confirm({});'},
  'header-brand-version': {'templates/t.hbs': '<header class="ag-header"><h1>Ashen Gate</h1></header>'},
  'button-title-attr': {'templates/t.hbs': '<button type="button" title="Delete">x</button>'},
  'fa-legacy-prefix': {'templates/t.hbs': '<i class="fas fa-trash"></i>'},
};
const zeroBaseline = id => ({[id]: {'css-raw-px-box': 0}});

test('rule modes: these rules are strict, css-raw-px-box stays a ratchet', () => {
  for (const rule of STRICT) assert.equal(RULES[rule].mode, 'strict', rule);
  assert.equal(RULES['css-raw-px-box'].mode, 'ratchet');
  assert.deepEqual(Object.keys(RULES).sort(), [...STRICT, 'css-raw-px-box'].sort(), 'every rule is either strict or the px ratchet');
});

for (const rule of STRICT) {
  test(`strict rule ${rule} fails on a planted violation`, () => {
    const id = 'ag-fixture';
    const result = lintModule(fakeModule(PLANTED[rule]), kitBlocks(kitCss));
    assert.equal(result.counts[rule], 1, `planted ${rule} is counted once`);
    for (const [k, n] of Object.entries(result.counts)) if (k !== rule) assert.equal(n, 0, `${k} is not hit by the ${rule} plant`);
    const {failures} = judgeModule(id, result, zeroBaseline(id));
    assert.equal(failures.length, 1);
    assert.match(failures[0], new RegExp(`^${id}: ${rule} must be 0, found 1`));
    // A baseline count does not loosen a strict rule.
    assert.equal(judgeModule(id, result, {[id]: {[rule]: 5}}).failures.length, 1);
  });
}

test('ag-lint-allow exempts a colour line, but not a raw font size', () => {
  const dir = fakeModule({'styles/mod.css': '.agx-hp { color: #b33; } /* ag-lint-allow: HP colour */\n.agx-t { font-size: 9px; } /* ag-lint-allow: nope */'});
  const result = lintModule(dir, kitBlocks(kitCss));
  assert.equal(result.counts['css-colour-literal'], 0);
  assert.equal(result.counts['css-raw-font-size'], 1);
  assert.deepEqual(judgeModule('ag-fixture', result, zeroBaseline('ag-fixture')).failures.map(f => f.split(':')[1].trim()), ['css-raw-font-size must be 0, found 1']);
});

test('the per-module exception list keeps a strict rule as a ratchet for that module only', () => {
  const kit = kitBlocks(kitCss);
  const result = lintModule(fakeModule({'styles/mod.css': '.agx-a { color: #111; }\n.agx-b { color: #222; }'}), kit);
  const baseline = {'ag-old': {'css-raw-px-box': 0, 'css-colour-literal': 2}, 'ag-other': {'css-raw-px-box': 0, 'css-colour-literal': 2}};
  const exceptions = {'ag-old': ['css-colour-literal']};
  assert.equal(modeFor('ag-old', 'css-colour-literal', baseline, exceptions), 'ratchet');
  assert.equal(modeFor('ag-other', 'css-colour-literal', baseline, exceptions), 'strict');
  assert.equal(modeFor('ag-old', 'css-raw-font-size', baseline, exceptions), 'strict');
  assert.deepEqual(judgeModule('ag-old', result, baseline, exceptions).failures, [], 'at the baseline: passes');
  assert.match(judgeModule('ag-other', result, baseline, exceptions).failures.join(), /ag-other: css-colour-literal must be 0, found 2/);
  const worse = lintModule(fakeModule({'styles/mod.css': '.agx-a { color: #111; }\n.agx-b { color: #222; }\n.agx-c { color: #333; }'}), kit);
  assert.match(judgeModule('ag-old', worse, baseline, exceptions).failures.join(), /ag-old: css-colour-literal went up from 2 to 3/);
  const better = lintModule(fakeModule({'styles/mod.css': '.agx-a { color: #111; }'}), kit);
  assert.match(judgeModule('ag-old', better, baseline, exceptions).notes.join(), /went down from 2 to 1/);
});

test('a module missing from the baseline starts strict on every rule, px boxes too', () => {
  const result = lintModule(fakeModule({'styles/mod.css': '.agx-a { padding: 4px; }'}), kitBlocks(kitCss));
  for (const rule of Object.keys(RULES)) assert.equal(modeFor('ag-new', rule, {}, {'ag-new': [rule]}), 'strict', rule);
  assert.match(judgeModule('ag-new', result, {}).failures.join(), /ag-new: css-raw-px-box must be 0 \(new module/);
  assert.deepEqual(judgeModule('ag-new', result, {'ag-new': {'css-raw-px-box': 1}}).failures, [], 'once baselined, px boxes ratchet');
});

test('the baseline and exception list cannot name a module that does not exist', () => {
  assert.deepEqual(checkBaselineModules(['ag-a'], {'ag-a': {}}, {}), []);
  assert.deepEqual(checkBaselineModules(['ag-a'], {'ag-a': {}, 'ag-gone': {}}, {'ag-gone2': ['css-colour-literal']}), [
    'ui-lint-baseline.json lists ag-gone, which is not a module; remove it',
    'STRICT_EXCEPTIONS lists ag-gone2, which is not a module; remove it',
  ]);
});

test('the real baseline holds only ratchet rules for real modules', () => {
  const baseline = readBaseline();
  const modules = fs.readdirSync(new URL('../modules/', import.meta.url)).filter(id => fs.existsSync(new URL(`../modules/${id}/module.json`, import.meta.url)));
  assert.deepEqual(checkBaselineModules(modules, baseline), []);
  for (const [id, rules] of Object.entries(baseline)) for (const rule of Object.keys(rules)) assert.equal(modeFor(id, rule, baseline), 'ratchet', `${id} ${rule}`);
});
