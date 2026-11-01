// 0.87.0: Back up world to GitHub. Mocked Foundry globals and a mocked GitHub (fetch); synthetic [TEST] data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as bk from '../scripts/github-backup.js';
import {settingsView, exportView, confirmFields} from '../scripts/backup-view.js';
import {readGmSetupForm, saveGmSetup} from '../scripts/gm-setup.js';

const TOKEN = 'github_pat_TESTBACKUP0123456789abcdef';
const sha = n => String(n).padStart(40, '0');
const H = {commit: sha(1), tree: sha(2), newTree: sha(3), newCommit: sha(4), def: sha(5)};
const mkStore = (init = {}) => { const data = {backupToken: TOKEN, backupConfig: {repo: 'owner/priv', branch: 'world-backup'}, backupLast: {}, ...init}; return {data, get: k => data[k], set: async (k, v) => { data[k] = v; }}; };

function mkGame({gm = true, modules} = {}) {
  const mods = modules ?? {
    'ashen-gate-locations': {active: true, version: '0.0.0', api: {exportPackage: () => ({manifest: {package_id: 'PKG-TEST'}, records: [{id: 'LOC-TEST', name: '[TEST] Place'}]})}},
    'ashen-gate-quest-manager': {active: true, api: {exportSource: () => ({schema_version: 'ag-quest-source/0.1', domain: 'quests_orders', version: '0.4.0', records: [{id: 'QUEST-TEST', name: '[TEST] Quest'}]})}},
    'ashen-gate-factions': {active: true, api: {exportDefinitions: () => ({schema_version: 'ag-factions-source-export/0.4', definitions: [{id: 'FAC-TEST'}], note: 'Excludes all mutable campaign state and user discovery state.'})}},
    'ashen-gate-utilities': {active: true, api: {shops: {exportShops() { return {shops: [{id: 'SHOP-TEST'}]}; }}}}
  };
  return {user: {isGM: gm}, world: {id: 'w'}, modules: new Map(Object.entries(mods)), items: {contents: []}, journal: {contents: []}, actors: {contents: []}, tables: {contents: []}, macros: {contents: []}};
}

/** A fake GitHub for the Git Data API. opts: {private, defaultBranch, branchExists, fail:{fragment:[status, body]}, sameTree} */
function fakeGithub({priv = true, defaultBranch = 'main', branchExists = true, fail = {}, sameTree = false, permissions} = {}) {
  const calls = [];
  const res = (status, body, headers = {}) => ({ok: status < 300, status, headers: {get: k => headers[k.toLowerCase()] ?? null}, text: async () => JSON.stringify(body), json: async () => body});
  const fetch = async (url, opts = {}) => {
    const p = decodeURIComponent(new URL(url).pathname), method = opts.method ?? 'GET';
    calls.push({url, method, p, body: opts.body ? JSON.parse(opts.body) : null, opts});
    for (const [frag, r] of Object.entries(fail)) if (`${method} ${p}`.includes(frag)) return res(...r);
    if (method === 'GET' && p === '/repos/owner/priv') return res(200, {private: priv, default_branch: defaultBranch, ...(permissions ? {permissions} : {})});
    if (method === 'GET' && p === '/repos/owner/priv/git/ref/heads/world-backup') return branchExists ? res(200, {object: {sha: H.commit}}) : res(404, {});
    if (method === 'GET' && p === `/repos/owner/priv/git/ref/heads/${defaultBranch}`) return res(200, {object: {sha: H.def}});
    if (method === 'GET' && p.startsWith('/repos/owner/priv/git/commits/')) return res(200, {tree: {sha: H.tree}});
    if (method === 'POST' && p.endsWith('/git/trees')) return res(201, {sha: sameTree ? H.tree : H.newTree});
    if (method === 'POST' && p.endsWith('/git/commits')) return res(201, {sha: H.newCommit, html_url: `https://github.com/owner/priv/commit/${H.newCommit}`});
    if (method === 'POST' && p.endsWith('/git/refs')) return res(201, {});
    if (method === 'PATCH') return res(200, {});
    return res(404, {});
  };
  return {fetch, calls, writes: () => calls.filter(c => c.method !== 'GET')};
}
const plan = game => bk.collectBackup(game);

test('collects the five files from public apis, pretty JSON under world-backup/', () => {
  const p = plan(mkGame());
  assert.equal(p.ok, true);
  assert.deepEqual(p.files.map(f => f.path), ['manager-edits', 'locations', 'quests', 'factions', 'shops', 'party'].map(n => `world-backup/${n === 'manager-edits' ? n : n}.json`));
  assert.match(p.files[1].text, /\n  "manifest"/);
  assert.ok(p.files.every(f => f.bytes === new TextEncoder().encode(f.text).length));
  assert.equal(JSON.parse(p.files[2].text).schema_version, 'ag-quest-source/0.1');
  assert.equal(JSON.parse(p.files[3].text).schema_version, 'ag-factions-source-export/0.4');
  assert.match(p.files[3].note, /standings/);
  assert.equal(JSON.parse(p.files[0].text).schema, 'ag-world-edits/0.1');
});

test('a missing, inactive or export-less module is skipped with a reason', () => {
  const g = mkGame({modules: {'ashen-gate-locations': {active: false, api: {}}, 'ashen-gate-quest-manager': {active: true, api: {}}, 'ashen-gate-factions': {active: true}}});
  const p = plan(g);
  assert.deepEqual(p.files.map(f => f.path), ['world-backup/manager-edits.json', 'world-backup/party.json']);
  const why = Object.fromEntries(p.skipped.map(s => [s.label.split(/\W/)[0], s.reason]));
  assert.match(why.Locations, /not active/);
  assert.match(why.Quests, /no source export/);
  assert.match(why.Factions, /no export/);
  assert.match(why.Shops, /not installed/);
  const field = confirmFields(p, {repo: 'owner/priv', branch: 'world-backup'}, bk.ALL_TYPE_IDS)[0];
  assert.match(field.hint, /not installed/);
  assert.match(field.hint, /private/);
  assert.deepEqual(field.options.map(o => o.value), ['Item', 'JournalEntry', 'Actor', 'RollTable', 'Macro', 'party']);
  assert.match(field.options[0].label, /manager-edits\.json/);
});

test('a non-GM is refused everywhere, before any request', async () => {
  const g = mkGame({gm: false}), gh = fakeGithub(), store = mkStore(), before = JSON.stringify(store.data);
  const P = {isGM: false};
  assert.equal(plan(g).ok, false);
  assert.equal((await bk.runBackup(g, {store, fetch: gh.fetch, plan: plan(mkGame())})).message, bk.GM_ONLY);
  for (const r of [bk.loadBackupConfig(P, {store}), bk.backupTokenStatus(P, {store}), bk.backupTarget(P, {store}), await bk.saveBackupSettings(P, {store, input: {repo: 'o/r', token: TOKEN}}), await bk.clearBackupToken(P, {store})])
    assert.equal(r.ok, false);
  assert.equal(bk.lastBackup(P, {store}), null);
  assert.equal(gh.calls.length, 0);
  assert.equal(JSON.stringify(store.data), before);
});

test('a public repository is refused and nothing is written', async () => {
  const g = mkGame(), gh = fakeGithub({priv: false});
  const r = await bk.runBackup(g, {store: mkStore(), fetch: gh.fetch, plan: plan(g)});
  assert.equal(r.ok, false); assert.equal(r.kind, 'public'); assert.match(r.message, /not a private repository/);
  assert.equal(gh.writes().length, 0);
});

test('the default branch (and main/master) is refused', async () => {
  const g = mkGame();
  const gh = fakeGithub({defaultBranch: 'world-backup'});
  const r = await bk.runBackup(g, {store: mkStore(), fetch: gh.fetch, plan: plan(g)});
  assert.equal(r.kind, 'default-branch'); assert.equal(gh.writes().length, 0);
  const store = mkStore({backupConfig: {repo: 'owner/priv', branch: 'main'}}), gh2 = fakeGithub();
  const r2 = await bk.runBackup(g, {store, fetch: gh2.fetch, plan: plan(g)});
  assert.equal(r2.ok, false); assert.equal(gh2.calls.length, 0);
  assert.equal((await bk.saveBackupSettings({isGM: true}, {store, input: {repo: 'owner/priv', branch: 'master'}})).ok, false);
});

test('an existing branch is updated in one commit on top of its tree', async () => {
  const g = mkGame(), gh = fakeGithub(), store = mkStore();
  const r = await bk.runBackup(g, {store, fetch: gh.fetch, plan: plan(g), now: new Date(2026, 9, 30, 14, 5)});
  assert.equal(r.ok, true); assert.equal(r.created, false);
  assert.equal(r.commitUrl, `https://github.com/owner/priv/commit/${H.newCommit}`);
  const [tree, commit, ref] = gh.writes();
  assert.equal(tree.body.base_tree, H.tree);
  assert.deepEqual(tree.body.tree.map(t => t.path).sort(), plan(g).files.map(f => f.path).sort());
  assert.ok(tree.body.tree.every(t => t.mode === '100644' && typeof t.content === 'string'));
  assert.equal(commit.body.message, 'World backup 2026-10-30 14:05');
  assert.deepEqual(commit.body.parents, [H.commit]);
  assert.equal(ref.method, 'PATCH'); assert.equal(ref.body.sha, H.newCommit); assert.equal(ref.body.force, false);
  assert.ok(bk.lastBackup({isGM: true}, {store}));
});

test('a missing branch is created from the default branch, after the commit exists', async () => {
  const g = mkGame(), gh = fakeGithub({branchExists: false});
  const r = await bk.runBackup(g, {store: mkStore(), fetch: gh.fetch, plan: plan(g)});
  assert.equal(r.ok, true); assert.equal(r.created, true);
  const w = gh.writes();
  assert.equal(w.at(-1).method, 'POST'); assert.match(w.at(-1).p, /git\/refs$/);
  assert.deepEqual(w.at(-1).body, {ref: 'refs/heads/world-backup', sha: H.newCommit});
  assert.deepEqual(w.find(c => /commits$/.test(c.p)).body.parents, [H.def]);
});

test('nothing changed since the last backup sends no commit', async () => {
  const g = mkGame(), gh = fakeGithub({sameTree: true});
  const r = await bk.runBackup(g, {store: mkStore(), fetch: gh.fetch, plan: plan(g)});
  assert.equal(r.ok, true); assert.equal(r.unchanged, true);
  assert.equal(gh.writes().length, 1);
});

test('failures are told in plain words, with no token in them', async () => {
  const g = mkGame(), P = plan(g);
  const cases = [
    [{'GET /repos/owner/priv': [401, {}]}, /did not accept the backup token/],
    [{'GET /repos/owner/priv': [404, {}]}, /cannot find owner\/priv, or the token was not granted/],
    [{'POST /repos/owner/priv/git/trees': [403, {message: 'Resource not accessible by personal access token'}]}, /Contents set to Read and write/],
    [{'POST /repos/owner/priv/git/trees': [404, {}]}, /lack Contents Read and write/],
    [{'POST /repos/owner/priv/git/commits': [422, {}]}, /refused the backup/],
    [{'PATCH': [409, {}]}, /changed while the backup ran/],
    [{'GET /repos/owner/priv': [403, {message: 'API rate limit exceeded'}]}, /limiting requests/],
    [{'GET /repos/owner/priv': [502, {}]}, /GitHub had a problem/]
  ];
  for (const [fail, re] of cases) {
    const gh = fakeGithub({fail}), store = mkStore();
    const r = await bk.runBackup(g, {store, fetch: gh.fetch, plan: P});
    assert.equal(r.ok, false); assert.match(r.message, re); assert.ok(!r.message.includes(TOKEN));
    assert.equal(bk.lastBackup({isGM: true}, {store}), null);
  }
  const net = await bk.runBackup(g, {store: mkStore(), fetch: async () => { throw new TypeError(`boom ${TOKEN}`); }, plan: P});
  assert.match(net.message, /Could not reach GitHub/); assert.ok(!net.message.includes(TOKEN));
  const noPush = await bk.runBackup(g, {store: mkStore(), fetch: fakeGithub({permissions: {push: false}}).fetch, plan: P});
  assert.equal(noPush.kind, 'access');
  assert.equal((await bk.runBackup(g, {store: mkStore({backupToken: ''}), fetch: fakeGithub().fetch, plan: P})).kind, 'token');
});

test('the token stays out of console, notifications and thrown errors; it is sent only to api.github.com', async () => {
  const seen = [], orig = {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) { orig[k] = console[k]; console[k] = (...a) => seen.push(a.join(' ')); }
  const g = mkGame(), gh = fakeGithub({fail: {'POST /repos/owner/priv/git/commits': [500, {message: TOKEN}]}});
  let out;
  try { out = await bk.runBackup(g, {store: mkStore(), fetch: gh.fetch, plan: plan(g)}); } finally { Object.assign(console, orig); }
  assert.ok(!JSON.stringify(out).includes(TOKEN));
  assert.ok(!seen.join('\n').includes(TOKEN));
  assert.ok(gh.calls.every(c => c.url.startsWith('https://api.github.com/') && c.opts.credentials === 'omit'));
  assert.doesNotMatch(fs.readFileSync(new URL('../scripts/github-backup.js', import.meta.url), 'utf8'), /console\./);
  // The settings view never carries the token, only its mask.
  const html = settingsView({repo: 'owner/priv', branch: 'world-backup', token: {saved: true, masked: '••••••••cdef'}});
  assert.ok(!html.includes(TOKEN)); assert.match(html, /value=""/); assert.match(html, /Clear token…/); assert.match(html, /Contents to Read and write/);
});

test('settings: defaults, validation, token kept when the box is empty, token cleared', async () => {
  const GM = {isGM: true}, store = mkStore({backupToken: '', backupConfig: {}});
  assert.deepEqual(bk.loadBackupConfig(GM, {store}).config, {repo: bk.DEFAULT_REPO, branch: 'world-backup'});
  assert.equal((await bk.saveBackupSettings(GM, {store, input: {repo: 'not a repo', branch: ''}})).ok, false);
  assert.equal((await bk.saveBackupSettings(GM, {store, input: {repo: 'owner/priv', branch: '', token: 'short'}})).ok, false);
  assert.equal(store.data.backupToken, '');
  const ok = await bk.saveBackupSettings(GM, {store, input: {repo: 'owner/priv', branch: 'bk', token: ` ${TOKEN}\n`}});
  assert.equal(ok.ok, true); assert.equal(store.data.backupToken, TOKEN);
  assert.ok(!ok.message.includes(TOKEN));
  await bk.saveBackupSettings(GM, {store, input: {repo: 'owner/priv', branch: 'bk', token: ''}});
  assert.equal(store.data.backupToken, TOKEN);
  const st = bk.backupTokenStatus(GM, {store});
  assert.equal(st.saved, true); assert.ok(!JSON.stringify(st).includes(TOKEN));
  await bk.clearBackupToken(GM, {store});
  assert.equal(store.data.backupToken, '');
  assert.equal(bk.relativeLabel(1000, 1000 + 5 * 60000), '5 minutes ago');
  assert.equal(bk.relativeLabel(0, 30 * 3600000), 'yesterday');
});

test('GM Setup form reads the backup fields and saves them through the injected saver', async () => {
  const els = {'[data-ag-setup-backup-repo]': {value: 'owner/priv'}, '[data-ag-setup-backup-branch]': {value: 'bk'}, '[data-ag-setup-backup-token]': {value: TOKEN}};
  const root = {querySelector: s => els[s] ?? null, querySelectorAll: () => []};
  const values = readGmSetupForm(root);
  assert.deepEqual(values.backup, {repo: 'owner/priv', branch: 'bk', token: TOKEN});
  let got;
  const out = await saveGmSetup({backup: values.backup}, {game: {user: {isGM: true}, settings: {get() {}}}, moduleId: 'm', codexAccessKey: 'k', backup: {save: async i => { got = i; return {ok: true, saved: ['backup token'], message: 'x'}; }}});
  assert.equal(out.ok, true); assert.deepEqual(got, values.backup);
  assert.ok(!out.message.includes(TOKEN));
  await assert.rejects(saveGmSetup({backup: values.backup}, {game: {user: {isGM: false}}, moduleId: 'm', codexAccessKey: 'k', backup: {save: async () => ({ok: true, saved: []})}}));
});

test('the action lives in the Export area and the settings in GM Setup; help explains it', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  const hbs = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  assert.match(hbs, /\{\{\{backupSettingsHtml\}\}\}/); assert.match(hbs, /\{\{\{backupExportHtml\}\}\}/);
  assert.ok(hbs.indexOf('backupSettingsHtml') < hbs.indexOf('setupPanels.screen'));
  assert.match(main, /case "backup-run"/); assert.match(main, /case "backup-token-clear"/);
  assert.match(main, /Back up world to GitHub<\/strong>/);
  const view = exportView({target: {branch: 'world-backup'}, lastLabel: '2 hours ago', message: {tone: 'ok', text: 'Done.', url: 'https://github.com/o/r/commit/x'}});
  assert.match(view, /Back up world now…/); assert.match(view, /2 hours ago/); assert.match(view, /rel="noopener/);
  assert.doesNotMatch(settingsView({}) + view + JSON.stringify(confirmFields({types: []}, {repo: 'a/b', branch: 'c'})), /\b(Alpha|Beta|Preview)\b/);
  assert.equal(JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8')).version, '0.97.0');
});
