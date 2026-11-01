// 0.87.0: Back up world: quests.json and factions.json are the modules' own exports, and the GM picks the types.
// Mocked Foundry globals and a mocked GitHub (fetch); synthetic [TEST] data only. Proves logic, not the live Forge dialog.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as bk from '../scripts/github-backup.js';
import {confirmFields, typeLabel} from '../scripts/backup-view.js';

const TOKEN = 'github_pat_TESTBACKUP0123456789abcdef';
const sha = n => String(n).padStart(40, '0');
const H = {commit: sha(1), tree: sha(2), newTree: sha(3), newCommit: sha(4)};
const GM = {isGM: true};
const mkStore = (init = {}) => { const data = {backupToken: TOKEN, backupConfig: {repo: 'owner/priv', branch: 'world-backup'}, backupLast: {}, ...init}; return {data, get: k => data[k], set: async (k, v) => { data[k] = v; }}; };
const doc = (id, name, extra = {}) => ({id, name, uuid: `X.${id}`, ...extra});
const QUEST_PKG = {schema_version: 'ag-quest-source/0.1', domain: 'quests_orders', version: '0.4.0', records: [{id: 'QUEST-TEST', name: '[TEST] Quest'}]};
const FAC_PKG = {schema_version: 'ag-factions-source-export/0.4', definitions: [{id: 'FAC-TEST'}], note: 'Excludes all mutable campaign state and user discovery state.'};
const STATE_PKG = {schema_version: 'ag-factions-state-export/0.1', factions: [], personal: []};
const LOC_PKG = {manifest: {package_id: 'PKG-TEST'}, records: [{id: 'LOC-TEST'}]};
const SHOP_PKG = {schema_version: 'ag-foundry-import/0.2', records: [{id: 'SHOP-TEST', record_type: 'Shop'}]};

function mkGame(mods = {}) {
  const modules = {
    'ashen-gate-locations': {active: true, api: {exportPackage: () => LOC_PKG}},
    'ashen-gate-quest-manager': {active: true, api: {exportSource: () => QUEST_PKG}},
    'ashen-gate-factions': {active: true, api: {exportDefinitions: () => FAC_PKG, exportState: () => STATE_PKG}},
    'ashen-gate-utilities': {active: true, api: {shops: {exportShops() { return SHOP_PKG; }}}},
    ...mods
  };
  const list = contents => ({contents, [Symbol.iterator]: () => contents[Symbol.iterator]()});
  return {user: GM, world: {id: 'w'}, modules: new Map(Object.entries(modules)), items: list([]), journal: list([]), actors: list([]), tables: list([]), macros: list([])};
}
function fakeGithub() {
  const calls = [];
  const res = (status, body) => ({ok: status < 300, status, headers: {get: () => null}, text: async () => JSON.stringify(body), json: async () => body});
  const fetch = async (url, opts = {}) => {
    const p = decodeURIComponent(new URL(url).pathname), method = opts.method ?? 'GET';
    calls.push({method, p, body: opts.body ? JSON.parse(opts.body) : null});
    if (method === 'GET' && p === '/repos/owner/priv') return res(200, {private: true, default_branch: 'main'});
    if (method === 'GET' && p.includes('/git/ref/heads/world-backup')) return res(200, {object: {sha: H.commit}});
    if (method === 'GET' && p.includes('/git/commits/')) return res(200, {tree: {sha: H.tree}});
    if (method === 'POST' && p.endsWith('/git/trees')) return res(201, {sha: H.newTree});
    if (method === 'POST' && p.endsWith('/git/commits')) return res(201, {sha: H.newCommit});
    if (method === 'PATCH') return res(200, {});
    return res(404, {});
  };
  return {fetch, calls, writes: () => calls.filter(c => c.method !== 'GET')};
}

test('quests.json and factions.json are byte-identical to the modules\' own exports, with the schema values the reconcile script reads', () => {
  const p = bk.collectBackup(mkGame());
  assert.equal(p.ok, true);
  const by = n => p.files.find(f => f.path === `world-backup/${n}.json`);
  assert.equal(by('quests').text, `${JSON.stringify(QUEST_PKG, null, 2)}\n`);
  assert.equal(by('factions').text, `${JSON.stringify(FAC_PKG, null, 2)}\n`);
  assert.equal(JSON.parse(by('quests').text).schema_version, 'ag-quest-source/0.1');
  assert.equal(JSON.parse(by('factions').text).schema_version, 'ag-factions-source-export/0.4');
  assert.equal(JSON.parse(by('manager-edits').text).schema, 'ag-world-edits/0.1');
  assert.deepEqual(Object.keys(JSON.parse(by('quests').text)).filter(k => k === 'states' || k === 'kind'), []);
  // No custom wrapper any more.
  assert.ok(!p.files.some(f => /ag-world-backup/.test(f.text)));
  assert.doesNotMatch(fs.readFileSync(new URL('../scripts/github-backup.js', import.meta.url), 'utf8'), /ag-world-backup|getGMSource|getGMState|listQuests|getFactions/);
});

test('Quest Log or Renown too old to export is skipped with a plain reason; the rest is still written', () => {
  const p = bk.collectBackup(mkGame({'ashen-gate-quest-manager': {active: true, api: {listQuests() {}}}, 'ashen-gate-factions': {active: true, api: {getFactions() {}}}}));
  assert.equal(p.ok, true);
  assert.deepEqual(p.files.map(f => f.path), ['manager-edits', 'locations', 'shops', 'party'].map(n => `world-backup/${n}.json`));
  const why = Object.fromEntries(p.skipped.map(s => [s.label.split(/\W/)[0], s.reason]));
  assert.match(why.Quests, /no source export; update Quest Log/);
  assert.match(why.Factions, /no definitions export; update Renown/);
  assert.deepEqual(p.types.filter(t => !t.available).map(t => t.id), ['quests', 'factions', 'standings', 'skilltrees', 'cinders', 'ledger', 'headquarters']);
});

test('an export that throws (a player, say) is skipped without leaking its message', () => {
  const p = bk.collectBackup(mkGame({'ashen-gate-quest-manager': {active: true, api: {exportSource() { throw new Error('GM permission required.'); }}}}));
  assert.equal(p.skipped.find(s => /Quests/.test(s.label)).reason, 'it could not be read just now');
});

test('only the ticked types are read and written; Manager gets exactly the ticked entity types', () => {
  const g = mkGame();
  g.items.contents.push(doc('I1', '[TEST] Hand-made item', {documentName: 'Item', flags: {}}));
  g.actors.contents.push(doc('A1', '[TEST] Hand-made NPC', {documentName: 'Actor', type: 'npc', flags: {}}));
  const p = bk.collectBackup(g, {selection: ['Item', 'quests']});
  assert.deepEqual(p.files.map(f => f.path), ['world-backup/manager-edits.json', 'world-backup/quests.json']);
  assert.deepEqual(p.files[0].types, ['Item']);
  assert.deepEqual(p.types.map(t => t.id), ['Item', 'quests']);
  const edits = JSON.parse(p.files[0].text);
  assert.equal(edits.schema, 'ag-world-edits/0.1');
  assert.deepEqual(edits.world_only.map(r => r.document_type), ['Item'], 'the hand-made Item only: no Actor, Journal, table or macro records');
  assert.deepEqual(JSON.parse(bk.collectBackup(g, {selection: ['Actor']}).files[0].text).world_only.map(r => r.document_type), ['Actor']);
  assert.ok(!p.files.some(f => /locations|factions|shops/.test(f.path)));
  // No Manager type ticked: no edits file at all.
  assert.deepEqual(bk.collectBackup(g, {selection: ['shops']}).files.map(f => f.path), ['world-backup/shops.json']);
  // Nothing ticked: a plain refusal, not an empty commit.
  const none = bk.collectBackup(g, {selection: []});
  assert.equal(none.ok, false); assert.match(none.message, /Tick at least one type/);
});

test('a type left unticked is not written and not removed from the branch', async () => {
  const g = mkGame(), gh = fakeGithub();
  const plan = bk.collectBackup(g, {selection: ['quests']});
  const r = await bk.runBackup(g, {store: mkStore(), fetch: gh.fetch, plan});
  assert.equal(r.ok, true); assert.equal(r.count, 1);
  const tree = gh.writes().find(c => /git\/trees$/.test(c.p));
  assert.equal(tree.body.base_tree, H.tree, 'built on top of the branch\'s tree, so earlier files stay');
  assert.deepEqual(tree.body.tree.map(t => t.path), ['world-backup/quests.json']);
  assert.ok(tree.body.tree.every(t => t.sha !== null && t.content), 'nothing is deleted');
});

test('the selection is remembered per device: all by default, saved, cleaned, GM only', async () => {
  const store = mkStore();
  assert.deepEqual(bk.loadBackupSelection(GM, {store}).selection, bk.ALL_TYPE_IDS);
  assert.equal(bk.ALL_TYPE_IDS.length, 15);
  const saved = await bk.saveBackupSelection(GM, {store, selection: ['shops', 'Item', 'bogus', 'Item']});
  assert.deepEqual(saved.selection, ['Item', 'shops']);
  assert.deepEqual(store.data.backupTypes, {types: ['Item', 'shops'], seen: bk.ALL_TYPE_IDS});
  assert.deepEqual(bk.loadBackupSelection(GM, {store}).selection, ['Item', 'shops']);
  assert.equal(bk.BACKUP_SETTINGS.types, 'backupTypes');
  // Garbage in the setting falls back to everything.
  assert.deepEqual(bk.loadBackupSelection(GM, {store: mkStore({backupTypes: 'x'})}).selection, bk.ALL_TYPE_IDS);
  const P = {isGM: false}, before = JSON.stringify(store.data);
  assert.equal((await bk.saveBackupSelection(P, {store, selection: ['Item']})).ok, false);
  assert.equal(bk.loadBackupSelection(P, {store}).ok, false);
  assert.equal(JSON.stringify(store.data), before);
  assert.equal(bk.collectBackup({user: P}, {selection: ['Item']}).ok, false);
});

test('the confirmation has one tick box per available type, remembered ones ticked, and the safety words', () => {
  const g = mkGame({'ashen-gate-utilities': {active: false, api: {}}});
  const plan = bk.collectBackup(g);
  const [field] = confirmFields(plan, {repo: 'owner/priv', branch: 'world-backup'}, ['Item', 'quests']);
  assert.equal(field.type, 'checklist'); assert.equal(field.name, 'types');
  assert.deepEqual(field.options.map(o => o.value), ['Item', 'JournalEntry', 'Actor', 'RollTable', 'Macro', 'locations', 'quests', 'factions', 'standings', 'party']);
  assert.deepEqual(field.options.filter(o => o.checked).map(o => o.value), ['Item', 'quests']);
  assert.match(field.hint, /unticked is not written/);
  assert.match(field.hint, /private/); assert.match(field.hint, /default branch/);
  assert.match(field.hint, /Shops \(the module is not active in this world\)/);
  assert.match(typeLabel(plan.types.find(t => t.id === 'quests')), /quests\.json/);
  assert.doesNotMatch(JSON.stringify(field), new RegExp(TOKEN));
});

test('wiring: dialog is a form dialog with Back up as the action, choice saved on confirm only, help and setting updated', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(main, /formDialog\('Back up world to GitHub',backupConfirmFields\(everything,target\.config,remembered\),\{ok:'Back up'\}\)/);
  assert.match(main, /BACKUP_SETTINGS\.types,\{[^}]*scope:"client"/);
  assert.ok(main.indexOf("if(!form)return;\n      const picked") > 0, 'cancel returns before anything is saved or sent');
  assert.match(main, /not written and not removed/);
  assert.match(main, /one tick box per type/);
  assert.doesNotMatch(main, /sends five files/);
  assert.equal(JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8')).version, '0.97.0');
});
