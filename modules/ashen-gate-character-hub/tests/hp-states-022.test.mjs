/** 0.22.0 UI standard pass: HP health bands and every temp / max-change combination, labelled confirms, rail tooltips (mocked Foundry; logic and markup only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {hpBand, hpBar, hpBarHtml} from '../scripts/character.mjs';
import {createHubSheetClass, removeCompanionAsk, cinderConfirm, segmentStep} from '../scripts/sheet.mjs';
import {tabsHtml} from '../scripts/views.mjs';
import {showHelp} from '../scripts/help.mjs';

const hp = (value, temp, tempmax, max = 20) => ({value, temp, max, tempmax, effectiveMax: max + tempmax});
/** Region kinds in DOM order, from the rendered bar (0.39.0: side by side). */
const kinds = html => [...html.matchAll(/class="agch-hp__seg agch-hp__(\w+)"/g)].map(m => m[1]);

test('hpBand: green at 70% of effective max and up, yellow from 30%, red below (integer maths, exact edges)', () => {
  for (const [v, eff, band] of [[70, 100, 'high'], [69, 100, 'mid'], [30, 100, 'mid'], [29, 100, 'low'], [32, 45, 'high'], [31, 45, 'mid'], [14, 45, 'mid'], [13, 45, 'low'], [0, 0, 'low'], [5, 0, 'low'], [100, 100, 'high']]) {
    assert.equal(hpBand(v, eff), band, `${v} / ${eff}`);
  }
  assert.equal(hpBar(hp(11, 4, -5)).band, 'high', 'the band uses the effective max (11 of 15 = 73%), not normal max (55%)');
  assert.equal(hpBar({value: 21, temp: 30, max: 30, tempmax: 0, effectiveMax: 30}).band, 'high', 'temp HP does not count');
});

test('matrix: 3 bands x {no max change, +6, -6} x {no temp, +5 temp} at max 30: band, segments and every label', () => {
  const values = {high: eff => eff, mid: eff => Math.floor(eff / 2), low: eff => Math.floor(eff / 10)};
  let n = 0;
  for (const [band, valueFor] of Object.entries(values)) for (const adj of [0, 6, -6]) for (const temp of [0, 5]) {
    const h = hp(valueFor(30 + adj), temp, adj, 30), html = hpBarHtml(h), name = `${band} adj ${adj} temp ${temp}`;
    assert.match(html, new RegExp(`data-band="${band}"`), name);
    const k = kinds(html);
    assert.ok(k.includes('hp'), name);
    assert.equal(k.includes('temp'), temp > 0, `${name}: temp region`);
    assert.equal(k.includes('boost'), adj > 0, `${name}: blue region`);
    assert.equal(k.includes('lost'), adj < 0, `${name}: olive region`);
    assert.deepEqual(k, ['hp', 'temp', 'empty', 'lost', 'boost'].filter(x => k.includes(x)), `${name}: left to right`);
    assert.match(html, new RegExp(`${h.value} / ${30 + adj} HP`), name);
    assert.equal(html.includes(`(+${temp} TEMP)`), temp > 0, `${name}: temp text`);
    assert.equal(html.includes(`(+${adj} MAX)`), adj > 0, `${name}: raised max text`);
    assert.equal(html.includes(`(−${-adj} MAX)`), adj < 0, `${name}: reduced max text`);
    n++;
  }
  assert.equal(n, 18);
});

test('companion Remove asks first ("Remove <name>?", danger, Cancel is the default) and Cancel changes nothing', async () => {
  installGlobals({user: users.owner});
  const actor = makeActor({items: [{id: 'horse', name: '[TEST] Horse', type: 'equipment'}]});
  actor.flags['ashen-gate-character-hub'] = {companions: [{id: 'c1', kind: 'mount', itemId: 'horse', name: '[TEST] Bramble'}]};
  actor.getFlag = (s, k) => actor.flags[s]?.[k];
  actor.setFlag = async (s, k, v) => { actor.calls.push(['setFlag', s, k, v]); actor.flags[s][k] = v; return actor; };
  const asked = [];
  const r = await removeCompanionAsk({document: actor}, 'c1', async (msg, opts) => { asked.push([msg, opts]); return false; });
  assert.deepEqual(r, {ok: true, result: null});
  assert.deepEqual(asked, [["[TEST] Bramble is taken off [TEST] Hero's companions and their notes are deleted. The Actor or Item itself is kept.", {title: 'Remove [TEST] Bramble?', yes: 'Remove companion', danger: true}]]);
  assert.equal(actor.calls.length, 0, 'Cancel: nothing written');
  assert.equal((await removeCompanionAsk({document: actor}, 'gone', async () => true)).ok, false);
});

test('Push and Help use the shared dialog: "Push [power]?" with Cancel and Push; Help has one Close button', async () => {
  let opened = null;
  globalThis.foundry = {applications: {api: {DialogV2: {wait: async o => { opened = o; return true; }, prompt: async o => { opened = o; return true; }}}}};
  assert.equal(await cinderConfirm('[TEST] Spark: Amplify\nStrain 4 → 5', {power: '[TEST] Spark'}), true);
  assert.equal(opened.window.title, 'Push [TEST] Spark?');
  assert.deepEqual(opened.buttons.map(b => b.label), ['Cancel', 'Push'], 'no Yes/No');
  assert.deepEqual(opened.classes, ['ag-app', 'ag-dialog']);
  assert.match(opened.content, /<p>\[TEST\] Spark: Amplify<\/p><p>Strain 4 → 5<\/p>/);
  // 0.33.0 (CH-22): a guaranteed Backfire asks as a danger confirmation: red Push, Cancel is the default.
  assert.equal(await cinderConfirm('[TEST] Spark: Amplify', {power: '[TEST] Spark', guaranteed: true}), true);
  assert.ok(opened.classes.includes('ag-dialog--danger'));
  assert.deepEqual(opened.buttons.map(b => [b.label, b.default]), [['Cancel', true], ['Push', false]]);
  await showHelp();
  assert.equal(opened.window.title, 'Character Hub Help'); assert.equal(opened.ok.label, 'Close');
  delete globalThis.foundry;
});

test('rail tabs: role tab, aria-selected, aria-label and a Foundry tooltip on the left; no title', () => {
  installGlobals({user: users.owner});
  const html = tabsHtml('overview');
  const tabs = html.match(/<button[^>]*data-action="hub-tab"[^>]*>/g);
  assert.ok(tabs.length >= 5);
  for (const t of tabs) {
    assert.match(t, /role="tab"/); assert.match(t, /aria-selected="(true|false)"/);
    assert.match(t, /aria-label="[^"]+" data-tooltip="[^"]+" data-tooltip-direction="LEFT"/);
    assert.doesNotMatch(t, /\stitle=/);
  }
  assert.match(html, /<nav class="ag-siderail agch-rail" role="tablist"/);
});

test('header follows the standard: brand span, Compact, the ⋯ menu, version, then Help; Compact, Appearance, Level up (0.46.0) then ⋯', async () => {
  installGlobals({user: users.owner, modules: {'ashen-gate-character-hub': {active: true, version: '0.34.0'}}});
  const html = await new (createHubSheetClass(FakeActorSheetV2))({document: makeActor()})._renderHTML();
  const head = html.slice(0, html.indexOf('</header>'));
  assert.match(head, /<h1 class="agch-head__name">\[TEST\] Hero<\/h1>/, '0.37.0: the name; the brand is the window title');
  const at = s => head.indexOf(s);
  assert.ok(at('data-action="compact-toggle"') > 0 && at('data-action="compact-toggle"') < at('data-action="look-menu"') && at('data-action="look-menu"') < at('data-action="level-up"') && at('data-action="level-up"') < at('data-action="more-menu"') && at('data-action="more-menu"') < at('ag-version') && at('ag-version') < at('data-action="help"'));
  assert.equal((head.slice(at('ag-header__actions')).match(/data-action="/g) ?? []).length, 5, '0.46.0: Compact, Appearance, Level up, ⋯ and Help in the header (Pop out where Foundry can detach)');
  assert.match(head, /<span class="ag-version">v0\.34\.0<\/span>/);
  assert.doesNotMatch(html, /agch-ident__actions/, 'not under the name any more');
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: makeActor()});
  await sheet.dispatch('more-menu', {dataset: {}}, {});
  const menu = (await sheet._renderHTML()).match(/<div class="agch-menu agch-moremenu"[\s\S]*?<\/div>/)[0];
  assert.match(menu, /data-action="configure"[\s\S]*data-action="open-native"/, 'Configure… then Open native sheet');
  assert.doesNotMatch(menu, /level-up|look-menu|pop-out|name-edit|hotbar-link|<hr/, '0.46.0: only Configure…, NPC Codex, Open native sheet (and the GM\'s Restore backup…)');
});

test('segmented controls: radiogroup with radios; arrow keys move to the next choice and pick it', () => {
  const clicked = [];
  const mk = id => ({id, focus() {}, click() { clicked.push(id); }});
  const a = mk('a'), b = mk('b'), c = mk('c'), parent = {querySelectorAll: () => [a, b, c]};
  for (const x of [a, b, c]) x.parentElement = parent;
  assert.equal(segmentStep(a, 1), b); assert.equal(segmentStep(a, -1), c, 'wraps around');
  assert.deepEqual(clicked, ['b', 'c']);
});
