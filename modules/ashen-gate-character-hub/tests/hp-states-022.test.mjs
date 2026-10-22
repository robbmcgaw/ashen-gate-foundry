/** 0.22.0 UI standard pass: HP health bands and every temp / max-change combination, labelled confirms, rail tooltips (mocked Foundry; logic and markup only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {hpBand, hpBar, hpBarHtml} from '../scripts/character.mjs';
import {createHubSheetClass, removeCompanionAsk, cinderConfirm, segmentStep} from '../scripts/sheet.mjs';
import {tabsHtml} from '../scripts/views.mjs';
import {showHelp} from '../scripts/help.mjs';

const hp = (value, temp, tempmax, max = 20) => ({value, temp, max, tempmax, effectiveMax: max + tempmax});
/** Segment [left, right] in percent from the rendered style, or null when the segment is not drawn. */
const seg = (html, cls) => { const m = html.match(new RegExp(`class="agch-hp__${cls}" style="(?:left:([\\d.]+)%;)?width:([\\d.]+)%"`)); return m ? [Number(m[1] ?? 0), Number(m[1] ?? 0) + Number(m[2])] : null; };
const near = (a, b) => Math.abs(a - b) < 0.11;

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
    assert.match(html, /class="agch-hp__fill"/, name);
    assert.equal(html.includes('agch-hp__temp"'), temp > 0, `${name}: temp segment`);
    assert.equal(html.includes('agch-hp__boost"'), adj > 0, `${name}: blue frame`);
    assert.equal(html.includes('agch-hp__lost"'), adj < 0, `${name}: olive part`);
    assert.match(html, new RegExp(`${h.value} / ${30 + adj} HP`), name);
    assert.equal(html.includes(`(+${temp} TEMP)`), temp > 0, `${name}: temp text`);
    assert.equal(html.includes(`(+${adj} MAX)`), adj > 0, `${name}: raised max text`);
    assert.equal(html.includes(`(−${-adj} MAX)`), adj < 0, `${name}: reduced max text`);
    const lost = seg(html, 'lost'), t = seg(html, 'temp');
    if (lost && t) assert.ok(t[1] <= lost[0] + 0.05, `${name}: temp never runs into the reduced max`);
    n++;
  }
  assert.equal(n, 18);
});

test('raised max near full (24 HP, +4 temp, adj +5, scale 25): temp and the blue frame both show, frame layered above temp', () => {
  const html = hpBarHtml(hp(24, 4, 5));
  assert.ok(html.includes('agch-hp__temp"') && html.includes('agch-hp__boost"'));
  assert.ok(html.indexOf('agch-hp__boost"') > html.indexOf('agch-hp__temp"'), 'DOM order matches the CSS z-index: boost after temp');
  assert.ok(near(seg(html, 'boost')[0], 80) && near(seg(html, 'temp')[0], 84), 'ranges as hpBar computes them');
  assert.match(html, /\(\+4 TEMP\)<\/span> <span class="agch-hp__boosttext">\(\+5 MAX\)<\/span>/);
});

test('reduced max at full HP (15 HP, +4 temp, adj -5): temp ends at or before the olive part; both texts show', () => {
  const b = hpBar(hp(15, 4, -5));
  assert.ok(b.tempLeft + b.temp <= b.lostLeft + 1e-9);
  assert.equal(b.tempText, '(+4 TEMP)'); assert.equal(b.lostText, '(−5 MAX)');
});

test('temp larger than the room left (adj -5, +20 temp): the temp segment stops at the olive part, text keeps the full amount', () => {
  const b = hpBar(hp(5, 20, -5)), html = hpBarHtml(hp(5, 20, -5));
  assert.equal(b.tempLeft, 0); assert.equal(b.tempLeft + b.temp, b.lostLeft);
  assert.match(html, /\(\+20 TEMP\)/);
  assert.ok(html.indexOf('agch-hp__lost"') < html.indexOf('agch-hp__temp"'), 'layer order: lost, then temp');
});

test('low HP, both signs: fill, temp and the max change do not overlap', () => {
  for (const adj of [5, -5]) {
    const h = hp(adj > 0 ? 6 : 3, 4, adj), html = hpBarHtml(h);
    const fill = seg(html, 'fill'), t = seg(html, 'temp'), other = seg(html, adj > 0 ? 'boost' : 'lost');
    assert.ok(fill[1] <= t[0] + 0.05, `adj ${adj}: temp after the fill`);
    assert.ok(t[1] <= other[0] + 0.05, `adj ${adj}: temp before the max change`);
  }
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

test('header follows the standard: brand span, Compact, the ⋯ menu, version, then Help; Level up is in the ⋯ menu (0.34.0)', async () => {
  installGlobals({user: users.owner, modules: {'ashen-gate-character-hub': {active: true, version: '0.34.0'}}});
  const html = await new (createHubSheetClass(FakeActorSheetV2))({document: makeActor()})._renderHTML();
  const head = html.slice(0, html.indexOf('</header>'));
  assert.match(head, /<h1><span class="ag-header__brand">Ashen Gate<\/span> \| Character Hub<\/h1>/);
  const at = s => head.indexOf(s);
  assert.ok(at('data-action="compact-toggle"') > 0 && at('data-action="compact-toggle"') < at('data-action="more-menu"') && at('data-action="more-menu"') < at('ag-version') && at('ag-version') < at('data-action="help"'));
  assert.equal((head.match(/data-action="/g) ?? []).length, 3, 'CH-03: only Compact, ⋯ and Help in the header');
  assert.match(head, /<span class="ag-version">v0\.34\.0<\/span>/);
  assert.doesNotMatch(html, /data-action="level-up"|agch-ident__actions/, 'not under the name any more');
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: makeActor()});
  await sheet.dispatch('more-menu', {dataset: {}}, {});
  const menu = (await sheet._renderHTML()).match(/<div class="agch-menu agch-moremenu"[\s\S]*?<\/div>/)[0];
  assert.match(menu, /data-action="level-up"[\s\S]*data-action="configure"[\s\S]*<hr class="agch-menu__sep">[\s\S]*data-action="look-menu"[\s\S]*data-action="open-native"/, 'Level up and Configure… first, then the window items');
});

test('segmented controls: radiogroup with radios; arrow keys move to the next choice and pick it', () => {
  const clicked = [];
  const mk = id => ({id, focus() {}, click() { clicked.push(id); }});
  const a = mk('a'), b = mk('b'), c = mk('c'), parent = {querySelectorAll: () => [a, b, c]};
  for (const x of [a, b, c]) x.parentElement = parent;
  assert.equal(segmentStep(a, 1), b); assert.equal(segmentStep(a, -1), c, 'wraps around');
  assert.deepEqual(clicked, ['b', 'c']);
});
