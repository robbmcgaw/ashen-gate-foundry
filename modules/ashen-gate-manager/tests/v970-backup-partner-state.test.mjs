// 0.97.0: Back up world: skill-trees.json, cinders.json, ledger.json, headquarters.json (partner play state, each module's own api.exportState()).
// Mocked Foundry globals and a mocked GitHub (fetch); synthetic [TEST] data only. Proves logic, not the live Forge dialog or a real commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as bk from '../scripts/github-backup.js';
import {confirmFields, confirmHint, exportView} from '../scripts/backup-view.js';

const TOKEN = 'github_pat_TESTBACKUP0123456789abcdef';
const sha = n => String(n).padStart(40, '0');
const H = {commit: sha(1), tree: sha(2), newTree: sha(3), newCommit: sha(4)};
const GM = {isGM: true};
const mkStore = (init = {}) => { const data = {backupToken: TOKEN, backupConfig: {repo: 'owner/priv', branch: 'world-backup'}, backupLast: {}, ...init}; return {data, get: k => data[k], set: async (k, v) => { data[k] = v; }}; };

const TYPES = [
  {id: 'skilltrees', module: 'ashen-gate-skill-trees', file: 'skill-trees.json', schema: 'ag-skill-trees-state-export/0.1', name: 'Skill Trees', label: /Skill Trees layouts and progress/},
  {id: 'cinders', module: 'ashen-gate-cinders', file: 'cinders.json', schema: 'ag-cinders-state-export/0.1', name: 'Cinders', label: /Cinders instances and Strain/},
  {id: 'ledger', module: 'ashen-gate-profession-ledger', file: 'ledger.json', schema: 'ag-ledger-state-export/0.1', name: 'Profession Ledger', label: /Profession Ledger state/},
  {id: 'headquarters', module: 'ashen-gate-headquarters', file: 'headquarters.json', schema: 'ag-headquarters-state-export/0.1', name: 'Headquarters', label: /Headquarters state/}
];
const stateOf = t => ({schema_version: t.schema, note: `[TEST] ${t.name}`, zebra: 1, alpha: [{k: 'b'}, {k: 'a'}]});
function mkGame(only = TYPES, overrides = {}) {
  const list = contents => ({contents, [Symbol.iterator]: () => contents[Symbol.iterator]()});
  const modules = {};
  for (const t of only) modules[t.module] = {active: true, api: {exportState: () => stateOf(t)}};
  Object.assign(modules, overrides);
  for (const k of Object.keys(modules)) if (modules[k] === undefined) delete modules[k];
  return {user: GM, world: {id: 'w'}, modules: new Map(Object.entries(modules)), items: list([]), journal: list([]), actors: list([]), tables: list([]), macros: list([])};
}
function fakeGithub({isPrivate = true, defaultBranch = 'main'} = {}) {
  const calls = [];
  const res = (status, body) => ({ok: status < 300, status, headers: {get: () => null}, text: async () => JSON.stringify(body), json: async () => body});
  const fetch = async (url, opts = {}) => {
    const p = decodeURIComponent(new URL(url).pathname), method = opts.method ?? 'GET';
    calls.push({method, p, auth: opts.headers?.Authorization, body: opts.body ? JSON.parse(opts.body) : null});
    if (method === 'GET' && p === '/repos/owner/priv') return res(200, {private: isPrivate, default_branch: defaultBranch});
    if (method === 'GET' && p.includes('/git/ref/heads/world-backup')) return res(200, {object: {sha: H.commit}});
    if (method === 'GET' && p.includes('/git/commits/')) return res(200, {tree: {sha: H.tree}});
    if (method === 'POST' && p.endsWith('/git/trees')) return res(201, {sha: H.newTree});
    if (method === 'POST' && p.endsWith('/git/commits')) return res(201, {sha: H.newCommit});
    if (method === 'PATCH') return res(200, {});
    return res(404, {});
  };
  return {fetch, calls, writes: () => calls.filter(c => c.method !== 'GET')};
}

for (const t of TYPES) {
  test(`${t.id}: ${t.file} is ${t.name}'s exportState byte for byte, in its own play-state schema`, () => {
    const p = bk.collectBackup(mkGame(), {selection: [t.id]});
    assert.equal(p.ok, true);
    assert.deepEqual(p.files.map(f => f.path), [`world-backup/${t.file}`]);
    assert.equal(p.files[0].text, `${JSON.stringify(stateOf(t), null, 2)}\n`);
    assert.equal(JSON.parse(p.files[0].text).schema_version, t.schema);
    assert.deepEqual(p.files[0].types, [t.id]);
    assert.match(p.files[0].note, /Play state/);
    assert.ok(bk.ALL_TYPE_IDS.includes(t.id));
  });

  test(`${t.id}: a ${t.name} without exportState, or missing, or off, is skipped with a plain reason; the rest is still written`, () => {
    const others = TYPES.filter(o => o !== t);
    const old = mkGame(others, {[t.module]: {active: true, api: {somethingElse() {}}}});
    const p = bk.collectBackup(old);
    assert.equal(p.ok, true);
    assert.ok(!p.files.some(f => f.path.endsWith(`/${t.file}`)));
    assert.ok(others.every(o => p.files.some(f => f.path.endsWith(`/${o.file}`))));
    const row = p.types.find(x => x.id === t.id);
    assert.equal(row.available, false); assert.match(row.reason, new RegExp(`no state export; update ${t.name}`));
    assert.match(p.skipped.find(s => s.reason.includes(`update ${t.name}`)).reason, /no state export/);
    const only = bk.collectBackup(old, {selection: [t.id]});
    assert.equal(only.ok, false); assert.match(only.skipped[0].reason, /update/);
    assert.match(bk.collectBackup(mkGame(others), {selection: [t.id]}).skipped[0].reason, /not installed/);
    assert.match(bk.collectBackup(mkGame(others, {[t.module]: {active: false, api: {exportState() {}}}}), {selection: [t.id]}).skipped[0].reason, /not active/);
    assert.match(bk.collectBackup(mkGame(others, {[t.module]: {active: true}}), {selection: [t.id]}).skipped[0].reason, /no export/);
  });

  test(`${t.id}: exportState that throws (not a GM, say) is skipped without leaking its message`, () => {
    const g = mkGame(TYPES.filter(o => o !== t), {[t.module]: {active: true, api: {exportState() { throw new Error('GM authorization required. secret-detail'); }}}});
    const p = bk.collectBackup(g, {selection: [t.id]});
    assert.equal(p.ok, false);
    assert.equal(p.skipped[0].reason, 'it could not be read just now');
    assert.doesNotMatch(JSON.stringify(p), /secret-detail/);
  });

  test(`${t.id}: the dialog and the Help say it is play state`, () => {
    const plan = bk.collectBackup(mkGame());
    const [field] = confirmFields(plan, {repo: 'owner/priv', branch: 'world-backup'}, bk.ALL_TYPE_IDS);
    const opt = field.options.find(o => o.value === t.id);
    assert.match(opt.label, t.label); assert.match(opt.label, new RegExp(t.file.replace('.', '\\.'))); assert.equal(opt.checked, true);
    const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
    assert.match(main, new RegExp(`${t.file.replace('.', '\\.')}</code>`));
    assert.match(main, new RegExp(t.schema.replace(/[/.]/g, '\\$&')));
  });
}

test('the hint and the section text name the four partner types as play state', () => {
  const plan = bk.collectBackup(mkGame());
  const hint = confirmHint(plan, {repo: 'owner/priv', branch: 'world-backup'});
  assert.match(hint, /Skill Trees, Cinders, Profession Ledger and Headquarters types hold each module/); assert.match(hint, /play state/);
  const view = exportView({target: {branch: 'world-backup'}});
  for (const w of ['Skill Trees', 'Cinders', 'Profession Ledger', 'Headquarters']) assert.match(view, new RegExp(w));
  const old = bk.collectBackup(mkGame([]));
  assert.match(confirmHint(old, {repo: 'owner/priv', branch: 'world-backup'}), /Cinders instances and Strain \(the module is not installed\)/);
});

test('unticked means untouched: a run without the four writes none of their paths and removes nothing', async () => {
  const g = mkGame(), gh = fakeGithub();
  const plan = bk.collectBackup(g, {selection: ['skilltrees']});
  const r = await bk.runBackup(g, {store: mkStore(), fetch: gh.fetch, plan});
  assert.equal(r.ok, true);
  const tree = gh.writes().find(c => /git\/trees$/.test(c.p));
  assert.equal(tree.body.base_tree, H.tree);
  assert.deepEqual(tree.body.tree.map(t => t.path), ['world-backup/skill-trees.json']);
  assert.ok(tree.body.tree.every(t => t.content && t.sha !== null), 'nothing is deleted');
  // The plan for everything but the four lists none of them and reads none of them.
  let read = 0;
  const spy = mkGame(TYPES.map(t => ({...t})), {});
  for (const t of TYPES) spy.modules.get(t.module).api.exportState = () => { read++; return stateOf(t); };
  const rest = bk.collectBackup(spy, {selection: ['quests', 'party']});
  assert.equal(read, 0);
  assert.ok(!JSON.stringify(rest.files.map(f => f.path)).match(/skill-trees|cinders|ledger|headquarters/));
});

test('all four go through the same write path: one commit, private-repo and default-branch checks first, GM only', async () => {
  const g = mkGame(), gh = fakeGithub();
  const plan = bk.collectBackup(g, {selection: TYPES.map(t => t.id)});
  const r = await bk.runBackup(g, {store: mkStore(), fetch: gh.fetch, plan});
  assert.equal(r.ok, true);
  const trees = gh.writes().filter(c => /git\/trees$/.test(c.p));
  assert.equal(trees.length, 1); assert.equal(gh.writes().filter(c => /git\/commits$/.test(c.p)).length, 1);
  assert.deepEqual(trees[0].body.tree.map(t => t.path), TYPES.map(t => `world-backup/${t.file}`));
  assert.equal(gh.calls[0].p, '/repos/owner/priv', 'the repository is read before any write');
  const pub = fakeGithub({isPrivate: false});
  const refused = await bk.runBackup(g, {store: mkStore(), fetch: pub.fetch, plan});
  assert.equal(refused.ok, false); assert.equal(refused.kind, 'public'); assert.equal(pub.writes().length, 0);
  const dflt = fakeGithub({defaultBranch: 'world-backup'});
  const refusedBranch = await bk.runBackup(g, {store: mkStore(), fetch: dflt.fetch, plan});
  assert.equal(refusedBranch.ok, false); assert.equal(refusedBranch.kind, 'default-branch'); assert.equal(dflt.writes().length, 0);
  assert.equal(bk.collectBackup({...g, user: {isGM: false}}, {selection: TYPES.map(t => t.id)}).ok, false);
});

test('the token is never in the plan, the result, the saved selection or any message', async () => {
  const g = mkGame(), gh = fakeGithub(), store = mkStore();
  const plan = bk.collectBackup(g, {selection: TYPES.map(t => t.id)});
  const r = await bk.runBackup(g, {store, fetch: gh.fetch, plan});
  assert.doesNotMatch(JSON.stringify({plan, r, selection: store.data.backupTypes, fields: confirmFields(plan, {repo: 'owner/priv', branch: 'world-backup'}, TYPES.map(t => t.id))}), new RegExp(TOKEN));
  assert.ok(gh.calls.every(c => !c.body || !JSON.stringify(c.body).includes(TOKEN)), 'the token travels only in the Authorization header');
  const failing = await bk.runBackup(g, {store, plan, fetch: async () => ({ok: false, status: 401, headers: {get: () => null}, text: async () => `bad ${TOKEN}`, json: async () => ({})})});
  assert.equal(failing.ok, false); assert.doesNotMatch(JSON.stringify(failing), new RegExp(TOKEN));
});

test('the new boxes start ticked: no saved choice, a choice saved before 0.97.0, and an explicit untick', async () => {
  const ids = TYPES.map(t => t.id);
  for (const id of ids) assert.ok(bk.loadBackupSelection(GM, {store: mkStore()}).selection.includes(id));
  // Saved by 0.90-0.96 (seen without the four): the old ticks stay, the four are ticked.
  const older = mkStore({backupTypes: {types: ['Item', 'party'], seen: ['Item', 'JournalEntry', 'Actor', 'RollTable', 'Macro', 'locations', 'quests', 'factions', 'shops', 'standings', 'party']}});
  assert.deepEqual(bk.loadBackupSelection(GM, {store: older}).selection, ['Item', 'party', ...ids]);
  // Saved by this version with one unticked: it stays unticked.
  const store = mkStore();
  await bk.saveBackupSelection(GM, {store, selection: ['Item', 'cinders']});
  assert.deepEqual(bk.loadBackupSelection(GM, {store}).selection, ['Item', 'cinders']);
  assert.equal(bk.loadBackupSelection({isGM: false}, {store}).ok, false);
});

test('version 0.97.0, 0.x only, download URL, changelog, README and the GPT docs mention the four files', () => {
  const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const m = JSON.parse(read('../module.json'));
  assert.equal(m.version, '0.99.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.99.0/ashen-gate-manager.zip')); assert.match(m.version, /^0\./);
  assert.match(read('../CHANGELOG.md'), /^## 0\.99\.0 /);
  const docs = read('../../../docs/world-backup.md'), gpt = read('../../../docs/perks-and-modifiers-for-gpt.md'), readme = read('../README.md');
  for (const t of TYPES) {
    assert.match(docs, new RegExp(`\\| \`${t.file.replace('.', '\\.')}\` \\| \`${t.schema.replace(/[/.]/g, '\\$&')}\``));
    assert.match(gpt, new RegExp(`${t.file.replace('.', '\\.')}\``));
    assert.match(readme, new RegExp(t.file.replace('.', '\\.')));
  }
  assert.match(gpt, /read-only play state/);
});
