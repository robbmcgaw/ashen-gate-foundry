// 0.90.0: Back up world: standings.json (Renown play state). Mocked Foundry globals and a mocked GitHub (fetch); synthetic [TEST] data only.
// Proves logic, not the live Forge dialog or a real commit.
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
const STATE = {schema_version: 'ag-factions-state-export/0.1', factions: [{id: 'FACTION-TEST-A', kind: 'faction', name: '[TEST] Guild A', group: {standing: {score: 4}}}], personal: [{actor_id: 'A1', actor_name: '[TEST] Hero', vow: null, vow_log: [], factions: []}]};
const DEFS = {schema_version: 'ag-factions-source-export/0.4', definitions: [], note: 'x'};
function mkGame(renown = {exportDefinitions: () => DEFS, exportState: () => STATE}, extra = {}) {
  const list = contents => ({contents, [Symbol.iterator]: () => contents[Symbol.iterator]()});
  const modules = {'ashen-gate-factions': renown === null ? undefined : {active: true, api: renown}, ...extra};
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

test('standings.json is Renown\'s exportState byte for byte, in the play-state schema, not a content schema', () => {
  const p = bk.collectBackup(mkGame(), {selection: ['standings']});
  assert.equal(p.ok, true);
  assert.deepEqual(p.files.map(f => f.path), ['world-backup/standings.json']);
  assert.equal(p.files[0].text, `${JSON.stringify(STATE, null, 2)}\n`);
  assert.equal(JSON.parse(p.files[0].text).schema_version, 'ag-factions-state-export/0.1');
  assert.deepEqual(p.files[0].types, ['standings']);
  // The two Renown files stay distinct: definitions are content, standings are play state.
  const both = bk.collectBackup(mkGame(), {selection: ['factions', 'standings']});
  assert.deepEqual(both.files.map(f => JSON.parse(f.text).schema_version), ['ag-factions-source-export/0.4', 'ag-factions-state-export/0.1']);
  assert.ok(bk.ALL_TYPE_IDS.includes('standings'));
});

test('an old Renown (no exportState) skips standings with "update Renown"; the other types are still written', () => {
  const g = mkGame({exportDefinitions: () => DEFS});
  const p = bk.collectBackup(g);
  assert.equal(p.ok, true);
  assert.ok(p.files.some(f => f.path.endsWith('/factions.json')));
  assert.ok(!p.files.some(f => f.path.endsWith('/standings.json')));
  const s = p.skipped.find(x => /standings/i.test(x.label));
  assert.match(s.reason, /no standings export; update Renown/);
  const row = p.types.find(t => t.id === 'standings');
  assert.equal(row.available, false); assert.match(row.reason, /update Renown/);
  // Only standings ticked on an old Renown: a plain refusal, not an empty commit.
  const only = bk.collectBackup(g, {selection: ['standings']});
  assert.equal(only.ok, false);
  assert.match(only.skipped[0].reason, /update Renown/);
  // Missing or inactive Renown.
  assert.match(bk.collectBackup(mkGame(null), {selection: ['standings', 'quests']}).skipped[0].reason, /not installed/);
  assert.match(bk.collectBackup(mkGame(null, {'ashen-gate-factions': {active: false, api: {}}}), {selection: ['standings']}).skipped[0].reason, /not active/);
});

test('exportState that throws (not a GM, say) is skipped without leaking its message', () => {
  const p = bk.collectBackup(mkGame({exportState() { throw new Error('GM authorization required. secret-detail'); }}), {selection: ['standings']});
  assert.equal(p.ok, false);
  assert.equal(p.skipped[0].reason, 'it could not be read just now');
  assert.doesNotMatch(JSON.stringify(p), /secret-detail/);
});

test('unticked means untouched: a run without standings writes no standings path and removes nothing', async () => {
  const g = mkGame(), gh = fakeGithub();
  const plan = bk.collectBackup(g, {selection: ['factions']});
  const r = await bk.runBackup(g, {store: mkStore(), fetch: gh.fetch, plan});
  assert.equal(r.ok, true);
  const tree = gh.writes().find(c => /git\/trees$/.test(c.p));
  assert.equal(tree.body.base_tree, H.tree);
  assert.deepEqual(tree.body.tree.map(t => t.path), ['world-backup/factions.json']);
  assert.ok(tree.body.tree.every(t => t.content && t.sha !== null));
});

test('standings go through the same write path: one commit with the standings content, private-repo and default-branch checks first', async () => {
  const g = mkGame(), gh = fakeGithub();
  const plan = bk.collectBackup(g, {selection: ['standings']});
  const r = await bk.runBackup(g, {store: mkStore(), fetch: gh.fetch, plan});
  assert.equal(r.ok, true);
  const tree = gh.writes().find(c => /git\/trees$/.test(c.p));
  assert.deepEqual(tree.body.tree.map(t => t.path), ['world-backup/standings.json']);
  assert.equal(JSON.parse(tree.body.tree[0].content).schema_version, 'ag-factions-state-export/0.1');
  assert.equal(gh.calls[0].p, '/repos/owner/priv', 'the repository is read before any write');
  // A public repository: nothing is sent.
  const pub = fakeGithub({isPrivate: false});
  const refused = await bk.runBackup(g, {store: mkStore(), fetch: pub.fetch, plan});
  assert.equal(refused.ok, false); assert.equal(refused.kind, 'public'); assert.equal(pub.writes().length, 0);
  // The default branch: nothing is sent.
  const dflt = fakeGithub({defaultBranch: 'world-backup'});
  const refusedBranch = await bk.runBackup(g, {store: mkStore(), fetch: dflt.fetch, plan});
  assert.equal(refusedBranch.ok, false); assert.equal(refusedBranch.kind, 'default-branch'); assert.equal(dflt.writes().length, 0);
  // Players cannot back up at all.
  assert.equal(bk.collectBackup({...g, user: {isGM: false}}, {selection: ['standings']}).ok, false);
});

test('the token is never in the plan, the result, the saved selection or any message', async () => {
  const g = mkGame(), gh = fakeGithub(), store = mkStore();
  const plan = bk.collectBackup(g, {selection: ['standings']});
  const r = await bk.runBackup(g, {store, fetch: gh.fetch, plan});
  assert.doesNotMatch(JSON.stringify({plan, r, selection: store.data.backupTypes, fields: confirmFields(plan, {repo: 'owner/priv', branch: 'world-backup'}, ['standings'])}), new RegExp(TOKEN));
  assert.ok(gh.calls.every(c => !c.body || !JSON.stringify(c.body).includes(TOKEN)), 'the token travels only in the Authorization header');
  const failing = await bk.runBackup(g, {store, plan, fetch: async () => ({ok: false, status: 401, headers: {get: () => null}, text: async () => `bad ${TOKEN}`, json: async () => ({})})});
  assert.equal(failing.ok, false); assert.doesNotMatch(JSON.stringify(failing), new RegExp(TOKEN));
});

test('the new box starts ticked: no saved choice, a choice saved before 0.90.0, and an explicit untick are all handled', async () => {
  assert.ok(bk.loadBackupSelection(GM, {store: mkStore()}).selection.includes('standings'));
  // Saved by 0.87-0.89 (no `seen`): the old ticks stay as they were and the new type is ticked.
  const old = mkStore({backupTypes: {types: ['Item', 'quests']}});
  assert.deepEqual(bk.loadBackupSelection(GM, {store: old}).selection, ['Item', 'quests', 'standings', 'party']);
  // Saved by this version with standings unticked: it stays unticked.
  const store = mkStore({backupTypes: {types: ['Item', 'quests']}});
  await bk.saveBackupSelection(GM, {store, selection: ['Item', 'quests']});
  assert.deepEqual(bk.loadBackupSelection(GM, {store}).selection, ['Item', 'quests']);
  await bk.saveBackupSelection(GM, {store, selection: ['standings']});
  assert.deepEqual(bk.loadBackupSelection(GM, {store}).selection, ['standings']);
  // Players neither read nor write it.
  assert.equal(bk.loadBackupSelection({isGM: false}, {store}).ok, false);
});

test('the dialog and Help say standings are play state', () => {
  const plan = bk.collectBackup(mkGame());
  const [field] = confirmFields(plan, {repo: 'owner/priv', branch: 'world-backup'}, bk.ALL_TYPE_IDS);
  const opt = field.options.find(o => o.value === 'standings');
  assert.match(opt.label, /Renown standings and claims/); assert.match(opt.label, /standings\.json/);
  assert.equal(opt.checked, true);
  assert.match(confirmHint(plan, {repo: 'owner/priv', branch: 'world-backup'}), /play state/);
  assert.match(exportView({target: {branch: 'world-backup'}}), /Renown standings and claims/);
  const old = bk.collectBackup(mkGame({exportDefinitions: () => DEFS}));
  assert.match(confirmHint(old, {repo: 'owner/priv', branch: 'world-backup'}), /Renown standings and claims \(this version of Renown has no standings export; update Renown\)/);
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(main, /standings\.json<\/code>[^]*play state/);
  assert.match(main, /ag-factions-state-export\/0\.1/);
  assert.equal(JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8')).version, '0.96.0');
});
