import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindFileButtons} from '../scripts/ag-html.mjs';
import {buildSyncSet, planSync, makeSnapshot, equivalentValue, markerTextMatches} from '../scripts/sync.js';
import {exportedFields} from '../scripts/core.js';
import {planAssetLinks} from '../scripts/assets.js';

// Mocked Foundry data ([TEST] records) and a mocked DOM: proves the logic, not the live Forge UI.
const main = readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');

// ---------- D3: the Sync picker under a real browser's event ordering ----------
/** A wrapper/button/input trio whose change event runs its listeners one after another with a microtask turn between them. */
function pickerDom() {
  const listeners = [];
  let files = [];
  const input = {
    get files() { return files; },
    set value(v) { if (v === '') files = []; },
    addEventListener: (type, fn) => { if (type === 'change') listeners.push(fn); },
    removeEventListener() {}, click() {}, disabled: false
  };
  const button = {addEventListener() {}, removeEventListener() {}, disabled: false};
  const wrap = {dataset: {agFileKind: 'sync'}, querySelector: sel => (sel === 'input[type="file"]' ? input : sel === '[data-ag-file-button]' ? button : null)};
  const root = {querySelectorAll: sel => (sel === '.ag-file' ? [wrap] : [])};
  /** The browser: pick files, then fire the listeners in order, letting the microtask queue run between them. */
  const browserPick = async picked => {
    files = [...picked];
    for (const fn of [...listeners]) { fn(); await Promise.resolve(); await Promise.resolve(); }
  };
  return {root, browserPick, count: () => listeners.length};
}

test('model check: two bindings on one input lose the files (the 0.60.11 bug)', async () => {
  const dom = pickerDom();
  const seen = [];
  bindFileButtons(dom.root, files => { /* the shared binding: #pickFile returned at once for 'sync' */ void files; });
  bindFileButtons(dom.root, files => { seen.push(files.length); });
  assert.equal(dom.count(), 2);
  await dom.browserPick(['a.zip', 'b.zip']);
  assert.deepEqual(seen, [], 'the second listener sees an emptied input, which is what the live run showed');
});

test('one binding that sends the sync picker to the sync handler receives every chosen file', async () => {
  const dom = pickerDom();
  const seen = [];
  const pickFile = (kind, files) => { if (kind === 'sync') seen.push(files.length); };
  bindFileButtons(dom.root, (files, wrap) => pickFile(wrap.dataset.agFileKind, files));
  assert.equal(dom.count(), 1);
  await dom.browserPick(['a.zip', 'b.zip']);
  assert.deepEqual(seen, [2]);
});

test('main.js binds the sync picker once and #pickFile routes it to #syncPick', () => {
  assert.equal((main.match(/bindFileButtons\(/g) ?? []).length, 1, 'only the shared binding (plus the import)');
  assert.match(main, /if\(kind==='sync'\)return this\.#syncPick\(files\)/);
  assert.doesNotMatch(main, /bindFileButtons\(section/);
});

// ---------- D4: a freshly imported record is Untouched, a real edit is not ----------
const M = 'ashen-gate-manager';
const pkg = records => ({manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'TEST-D4', version: '1.0.0'}, records});
const item = (id, system, refs = []) => ({id, entity_type: 'Material', status: 'approved', version: '1', visibility: 'player', scope: 'setting_adapter', provenance: {sources: ['test']}, refs,
  foundry: {document_type: 'Item', data: {name: `[TEST] ${id}`, type: 'loot', system}}});
const flagFor = record => ({sourceId: record.id, entityType: record.entity_type, packageId: 'TEST-D4', packageVersion: '1.0.0', managedFields: exportedFields(record), refs: record.refs});
function liveDoc(record, system, uuid, baselineSystem = null) {
  const flag = flagFor(record);
  // The baseline is what the import stored: the package's own values, with rich text as resolved.
  if (baselineSystem) for (const [k, v] of Object.entries(baselineSystem)) flag.managedFields[k] = v;
  const data = {_id: uuid.split('.')[1], name: record.foundry.data.name, type: 'loot', system, flags: {[M]: {source: flag}}};
  return {documentName: 'Item', id: data._id, uuid, name: data.name, type: 'loot', getFlag: (s, k) => data.flags?.[s]?.[k], toObject: () => data};
}
const plan = (records, docs, ctx = {}) => planSync(buildSyncSet([{filename: 'a.json', origin: 'a.json', kind: 'manager', payload: pkg(records)}]), {docs: docs.map(d => makeSnapshot(d, {})), characterCount: 0}, {includeDrafts: true, ...ctx});

const target = item('MAT-TEST-TARGET', {weight: 1, rarity: 'common'});
const withLink = item('MAT-TEST-LINKED', {
  weight: 0.1, rarity: 'Very Rare',
  description: {value: '<p>Made with [[AGREF:MAT-TEST-TARGET|Target Bits]] and [[AGREF:MAT-TEST-TARGET]].</p>'}
}, [{relation: 'uses', target_id: 'MAT-TEST-TARGET', mode: 'required'}]);
const resolved = '<p>Made with @UUID[Item.TGT]{Target Bits} and @UUID[Item.TGT]{[TEST] MAT-TEST-TARGET}.</p>';
const liveTarget = () => liveDoc(target, {weight: {value: 1, units: 'lb'}, rarity: 'common'}, 'Item.TGT');
const liveLinked = (over = {}) => liveDoc(withLink, {weight: {value: 0.1, units: 'lb'}, rarity: 'veryRare', description: {value: resolved}, ...over}, 'Item.LNK',
  {'system.description.value': resolved});

test('replay: unedited records after an import (dnd5e weight and rarity shapes, resolved links) are Untouched', () => {
  const p = plan([target, withLink], [liveTarget(), liveLinked()]);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.rows.map(r => [r.id, r.group, r.reason]).filter(r => r[1] !== 'untouched'), [], 'nothing to overwrite or keep');
  assert.equal(p.counts.overwrite, 0);
  assert.equal(p.counts.keptEdited, 0);
});

test('replay: the old comparison would have flagged them (the numbers are different shapes)', () => {
  assert.notDeepEqual(liveTarget().toObject().system.weight, target.foundry.data.system.weight);
});

test('a real weight edit is still found and kept', () => {
  const p = plan([target, withLink], [liveTarget(), liveLinked({weight: {value: 5, units: 'lb'}})]);
  const row = p.rows.find(r => r.id === 'MAT-TEST-LINKED');
  assert.equal(row.group, 'untouched');
  assert.equal(row.keptEdited, true);
  assert.ok(row.editedFields.includes('system.weight'));
  const forced = plan([target, withLink], [liveTarget(), liveLinked({weight: {value: 5, units: 'lb'}})], {overwriteEdited: true});
  assert.equal(forced.rows.find(r => r.id === 'MAT-TEST-LINKED').group, 'overwrite');
});

test('a different unit, another valid rarity and a retargeted link are real differences', () => {
  assert.equal(equivalentValue('system.weight', {value: 0.1, units: 'kg'}, 0.1), false);
  assert.equal(equivalentValue('system.weight', {value: 0.2, units: 'lb'}, 0.1), false);
  assert.equal(equivalentValue('system.weight', {value: 0.1, units: 'lb'}, 0.1), true);
  assert.equal(equivalentValue('system.rarity', 'rare', 'Very Rare'), false);
  assert.equal(equivalentValue('system.rarity', 'veryRare', 'Very Rare'), true);
  assert.equal(equivalentValue('system.rarity', 'veryRare', 'very-rare'), true);
  assert.equal(equivalentValue('system.rarity', '', 'Exotic'), true, 'dnd5e has no such rarity and left it blank');
  assert.equal(equivalentValue('system.rarity', '', 'Rare'), false, 'a valid rarity somebody blanked is an edit');
  assert.equal(equivalentValue('system.price.value', 3, '3'), false, 'other paths are compared exactly');
  const ids = new Map([['Item.TGT', 'MAT-TEST-TARGET'], ['Item.OTHER', 'MAT-TEST-OTHER']]);
  const incoming = 'See [[AGREF:MAT-TEST-TARGET|Target Bits]] now.';
  assert.equal(markerTextMatches('See @UUID[Item.TGT]{Target Bits} now.', incoming, ids), true);
  assert.equal(markerTextMatches('See @UUID[Item.OTHER]{Target Bits} now.', incoming, ids), false, 'link retargeted');
  assert.equal(markerTextMatches('See @UUID[Item.UNKNOWN]{Target Bits} now.', incoming, ids), false, 'link to something Sync cannot identify');
  assert.equal(markerTextMatches('See @UUID[Item.TGT]{Renamed} now.', incoming, ids), false, 'label changed');
  assert.equal(markerTextMatches('See @UUID[Item.TGT]{Target Bits} later.', incoming, ids), false, 'surrounding text edited');
  assert.equal(markerTextMatches('See plain text now.', incoming, ids), false, 'link removed');
});

test('edited description text in the world is still detected next to resolved links', () => {
  const p = plan([target, withLink], [liveTarget(), liveLinked({description: {value: `${resolved}<p>My note</p>`}})]);
  const row = p.rows.find(r => r.id === 'MAT-TEST-LINKED');
  assert.equal(row.keptEdited, true);
  assert.ok(row.editedFields.includes('system.description.value'));
});

// ---------- D9: Assets ----------
const f = (name, dir = 'assets/npc/') => ({name, path: `${dir}${name}`});
const npc = (sourceId, name, extra = {}) => ({uuid: `Actor.${sourceId}`, documentName: 'Actor', type: 'npc', name, sourceId, flags: {}, ...extra,
  img: extra.img ?? 'modules/ashen-gate-manager/assets/icons/actor.svg', tokenImg: extra.tokenImg ?? 'modules/ashen-gate-manager/assets/icons/actor.svg'});

test('an Actor on Manager\'s default portrait whose token is the imported art starts as Default image, on Yes', () => {
  const doc = npc('NPC-A', 'Bren Halvek', {tokenImg: 'art/NPC-A.png', baselineTokenImg: 'art/NPC-A.png'});
  const [row] = planAssetLinks([doc], [f('Bren_Halvek.webp')]).rows;
  assert.equal(row.state, 'default');
  assert.equal(row.stateLabel, 'Default image');
  assert.equal(row.checked, true);
});

test('the imported token still counts when the import moved it into the world (same file name)', () => {
  const doc = npc('NPC-A', 'Bren Halvek', {tokenImg: 'worlds/w/art/NPC-A.png', baselineTokenImg: 'art/NPC-A.png'});
  assert.equal(planAssetLinks([doc], [f('Bren_Halvek.webp')]).rows[0].state, 'default');
});

test('a token the GM changed, or with no import record, is still set apart and unticked', () => {
  const changed = npc('NPC-A', 'Bren Halvek', {tokenImg: 'worlds/w/mine.webp', baselineTokenImg: 'art/NPC-A.png'});
  const unknown = npc('NPC-B', 'Dorran Vale', {tokenImg: 'art/NPC-B.png'});
  const rows = planAssetLinks([changed, unknown], [f('Bren_Halvek.webp'), f('Dorran_Vale.webp')]).rows;
  for (const r of rows) { assert.equal(r.state, 'edited'); assert.equal(r.checked, false); }
});

test('a weaker file for a record that has a better one is listed on the row, not silently dropped', () => {
  const docs = [npc('NPC-T', 'Tobin Marsh')];
  const plan = planAssetLinks(docs, [f('Tobin.webp'), f('Marsh.webp')]);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].fileName, 'Tobin.webp');
  assert.deepEqual(plan.rows[0].alsoFits, ['Marsh.webp']);
});

test('a weaker file next to a tie is listed on the pick row', () => {
  const docs = [npc('NPC-P', 'Oren Pell')];
  const plan = planAssetLinks(docs, [f('Oren_Pell_portrait_512.webp'), f('Oren_Pell_token_256.webp'), f('Pell.webp')]);
  const row = plan.rows[0];
  assert.equal(row.needsPick, true);
  assert.deepEqual(row.alsoFits, ['Pell.webp']);
});
