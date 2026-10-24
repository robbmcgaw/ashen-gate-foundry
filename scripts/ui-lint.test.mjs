// The UI drift lint's rules on small synthetic inputs (scripts/ui-lint.mjs). Text checks only, no Foundry.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {idsInTemplate, RULES, STRICT_EXCEPTIONS, statusWords, kitBlocks, lintModule, judgeModule, checkExceptions, checkSizeSets, checkSkinCoverage, contrast} from './ui-lint.mjs';

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
.z { color: #000; } /* ag-lint-allow: HP bar game colour */
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
});

test('header brand: only the Character Hub\'s name heading stands in for the brand, and it still needs the version', () => {
  const hub = '<header class="ag-header agch-head"><h1 class="agch-head__name">[TEST] Hero</h1><span class="ag-version">v0</span></header>';
  const lint = files => lintModule(fakeModule(files), kitBlocks(kitCss));
  assert.equal(lint({'scripts/views.mjs': hub}).counts['header-brand-version'], 0);
  assert.equal(lint({'scripts/views.mjs': hub.replace('<span class="ag-version">v0</span>', '')}).counts['header-brand-version'], 1, 'no version');
  assert.equal(lint({'scripts/views.mjs': hub.replace('agch-head__name', 'agx-name')}).counts['header-brand-version'], 1, 'any other name heading needs the brand');
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

// ---------- Every rule strict (brief 14) ----------
const PLANTED = {
  'css-colour-literal': {'styles/mod.css': '.agx-a { color: #c0ffee; }'},
  'css-raw-font-size': {'styles/mod.css': '.agx-a { font-size: 9px; }'},
  'css-legacy-alias': {'styles/mod.css': '.agx-a { background: var(--ag-panel); }'},
  'css-viewport-media': {'styles/mod.css': '@media (max-width: 700px) { .agx-a { display: none; } }'},
  'css-raw-px-box': {'styles/mod.css': '.agx-a { padding: 4px; }'},
  'css-kit-prefix-class': {'styles/mod.css': '.ag-homemade { display: none; }'},
  'js-dialogv2-direct': {'scripts/a.mjs': 'await foundry.applications.api.DialogV2.confirm({});'},
  'fa-legacy-prefix': {'templates/t.hbs': '<i class="fas fa-trash"></i>'},
  'header-brand-version': {'templates/t.hbs': '<header class="ag-header"><h1>Ashen Gate</h1></header>'},
  'button-title-attr': {'templates/t.hbs': '<button type="button" title="Delete">x</button>'},
  'template-id-text': {'templates/t.hbs': '<small class="x">{{recipe.sourceId}}</small>'},
  'lint-allow-reason': {'styles/mod.css': '.agx-a { display: none; } /* ag-lint-allow: why */'},
  'status-wording': {'scripts/a.mjs': "game.settings.register('agx', 'mode', {name: 'Fast mode (Beta)', hint: 'Speeds things up.'});"},
};
const lint = files => lintModule(fakeModule(files), kitBlocks(kitCss));

test('every rule has a planted violation below', () => {
  assert.deepEqual(Object.keys(PLANTED).sort(), Object.keys(RULES).sort());
});

for (const rule of Object.keys(PLANTED)) {
  test(`strict rule ${rule} fails on a planted violation`, () => {
    const result = lint(PLANTED[rule]);
    assert.equal(result.counts[rule], 1, `planted ${rule} is counted once`);
    for (const [k, n] of Object.entries(result.counts)) if (k !== rule) assert.equal(n, 0, `${k} is not hit by the ${rule} plant`);
    const {failures} = judgeModule('ag-fixture', result, {});
    assert.equal(failures.length, 1);
    assert.match(failures[0], new RegExp(`^ag-fixture: ${rule} must be 0, found 1`));
  });
}

test('DialogV2.wait and new DialogV2 are counted unless allowed with the ag-dialog classes', () => {
  assert.equal(lint({'scripts/a.mjs': 'await DialogV2.wait({content});\nconst d = new foundry.applications.api.DialogV2({});\nnew DialogV2({})'}).counts['js-dialogv2-direct'], 3);
  const ok = "const d = new DialogV2({id: 'x', // ag-lint-allow: custom dialog, has ag-dialog classes\n  classes: ['ag-app', 'ag-dialog'], content});\n"
    + "await DialogV2.wait({classes: ['ag-app','ag-dialog'], content}); // ag-lint-allow: custom dialog, has ag-dialog classes";
  assert.equal(lint({'scripts/a.mjs': ok}).counts['js-dialogv2-direct'], 0);
  const noClasses = "await DialogV2.wait({classes: ['agx-own'], content}); // ag-lint-allow: custom dialog, has ag-dialog classes";
  assert.equal(lint({'scripts/a.mjs': noClasses}).counts['js-dialogv2-direct'], 1, 'allow without ag-dialog in the options still fails');
  assert.equal(lint({'scripts/a.mjs': "await DialogV2.wait({classes: ['ag-dialog']}); // ag-lint-allow"}).counts['js-dialogv2-direct'], 1, 'allow without a reason does not count');
  assert.equal(lint({'scripts/ag-dialogs.mjs': 'new DialogV2({}); DialogV2.wait({});'}).counts['js-dialogv2-direct'], 0, 'the shared helper is exempt');
});

test('a bare ag-lint-allow (no reason, or under three words) fails and exempts nothing', () => {
  for (const comment of ['/* ag-lint-allow */', '/* ag-lint-allow: */', '/* ag-lint-allow: board geometry */']) {
    const {counts} = lint({'styles/mod.css': `.agx-a { color: #111; } ${comment}`});
    assert.equal(counts['lint-allow-reason'], 1, comment);
    assert.equal(counts['css-colour-literal'], 1, `${comment} does not exempt the colour`);
  }
  assert.equal(lint({'scripts/a.mjs': 'x(); // ag-lint-allow'}).counts['lint-allow-reason'], 1, 'checked in scripts too');
});

test('ag-lint-allow with a reason exempts a colour line (and px boxes), but not a raw font size', () => {
  const {counts} = lint({'styles/mod.css': '.agx-hp { color: #b33; width: 24px; } /* ag-lint-allow: HP bar game colour */\n.agx-t { font-size: 9px; } /* ag-lint-allow: tiny print on purpose */'});
  assert.equal(counts['css-colour-literal'], 0);
  assert.equal(counts['css-raw-px-box'], 0);
  assert.equal(counts['lint-allow-reason'], 0);
  assert.equal(counts['css-raw-font-size'], 1);
});

test('the per-module exception list keeps a rule as a ratchet for that module only', () => {
  const two = lint({'styles/mod.css': '.agx-a { color: #111; }\n.agx-b { color: #222; }'});
  const exceptions = {'ag-old': {'css-colour-literal': 2}};
  assert.deepEqual(judgeModule('ag-old', two, exceptions), {failures: [], notes: []}, 'at its count: passes');
  assert.match(judgeModule('ag-other', two, exceptions).failures.join(), /ag-other: css-colour-literal must be 0, found 2/);
  const three = lint({'styles/mod.css': '.agx-a { color: #111; }\n.agx-b { color: #222; }\n.agx-c { color: #333; }'});
  assert.match(judgeModule('ag-old', three, exceptions).failures.join(), /ag-old: css-colour-literal went up from 2 to 3/);
  assert.match(judgeModule('ag-old', lint({'styles/mod.css': '.agx-a { color: #111; }'}), exceptions).notes.join(), /went down from 2 to 1/);
  assert.match(judgeModule('ag-old', lint({'styles/mod.css': '.agx-a { font-size: 9px; }'}), exceptions).failures.join(), /css-raw-font-size must be 0/, 'other rules stay strict');
});

test('a new module starts strict on every rule; the exception list only names real modules and rules', () => {
  const result = lint({'styles/mod.css': '.agx-a { padding: 4px; }'});
  assert.match(judgeModule('ag-brand-new', result).failures.join(), /ag-brand-new: css-raw-px-box must be 0, found 1/);
  assert.deepEqual(checkExceptions(['ag-a'], {'ag-a': {'css-raw-px-box': 1}}), []);
  assert.deepEqual(checkExceptions(['ag-a'], {'ag-gone': {'css-raw-px-box': 1}, 'ag-a': {'no-such-rule': 1}}), [
    'STRICT_EXCEPTIONS lists ag-gone, which is not a module; remove it',
    'STRICT_EXCEPTIONS lists unknown rule no-such-rule for ag-a',
  ]);
  const modules = fs.readdirSync(new URL('../modules/', import.meta.url));
  assert.deepEqual(checkExceptions(modules, STRICT_EXCEPTIONS), [], 'the real list is valid');
});

test('status wording: module.json description, settings names and hints, templates and Help fail; the message says why', () => {
  const bad = lint({
    'module.json': JSON.stringify({id: 'agx', title: 'Ashen Gate | X', description: 'Standalone builder Alpha. Beta; Foundry V14 runtime unverified.'}),
    'scripts/main.mjs': "game.settings.registerMenu('agx', 'menu', {name: 'Experimental tools', hint: 'Coming soon.'});\nconst HELP = '<p>Party view (WIP)</p>';",
    'templates/t.hbs': '<span class="ag-badge">Preview build</span><p>Work in progress</p>',
  });
  assert.equal(bad.counts['status-wording'], 8);
  assert.deepEqual(bad.where['status-wording'], ['module.json (3)', 'scripts/main.mjs (3)', 'templates/t.hbs (2)']);
  const {failures} = judgeModule('agx', bad, {});
  assert.match(failures[0], /status-wording must be 0, found 8.*Status words don't belong in the UI; discuss them in chat\./);
});

test('status wording: contract ids, identifiers, comments, preview as a feature and other senses pass', () => {
  const ok = lint({
    'module.json': JSON.stringify({id: 'agx', description: 'Builds facilities and previews imports, sorted alphabetically.'}),
    'scripts/main.mjs': [
      "const api = {contract: 'ag-utilities/0.2-alpha', quests: 'ag-objectives/0.1-alpha', look: 'ag-appearance/0.1-beta'};",
      "el.style.setProperty('--agu-ov-alpha', '60%'); const alpha_v = 1; obj.beta = 2;",
      '/** Headquarters alpha pure state logic. */',
      '// Beta flag kept for old saves',
      "const help = '<p><strong>Player preview</strong> shows what players see. Validate &amp; Preview first.</p>';",
      "bundle.outcome.set(name, 'In preview');",
    ].join('\n'),
    'templates/t.hbs': '{{!-- alpha layout --}}<!-- beta --><button type="button" data-act="player-preview">Player preview</button>',
    'tests/a.test.mjs': "assert.match(x, /Alpha/);",
  });
  assert.equal(ok.counts['status-wording'], 0, ok.where['status-wording'].join(', '));
  assert.equal(statusWords("throw Error('Only player-visible facility definitions can be stored.')"), 0);
  assert.equal(statusWords("throw Error('Alpha stores only player-visible facility definitions.')"), 1);
});

test('template-id-text flags ids in text, titles and labels but not wiring or GM Details folds', () => {
  assert.equal(idsInTemplate('<small>{{id}}</small>'), 1);
  assert.equal(idsInTemplate('<li>{{recipe.sourceId}} {{name}}</li>'), 1);
  assert.equal(idsInTemplate('<button title="Open {{treeId}}" aria-label="x">Open</button>'), 1);
  assert.equal(idsInTemplate('<li data-id="{{id}}" data-tooltip="{{name}}">{{name}}{{#if id}}!{{/if}}</li>'), 0);
  assert.equal(idsInTemplate('<details><summary>Details</summary><code>{{id}}</code></details>'), 0);
  assert.equal(idsInTemplate('<dd>{{libraryDetail.packageId}}</dd>'), 0);
  assert.equal(idsInTemplate('{{! {{id}} }}<p>ok</p>'), 0);
});
