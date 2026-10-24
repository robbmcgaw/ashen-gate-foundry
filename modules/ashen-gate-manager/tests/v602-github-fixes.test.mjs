import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as gh from '../scripts/github-pull.js';
import {cleanToken, tokenProblem, readableName, readManifest} from '../scripts/github-paths.js';
import {githubView} from '../scripts/github-view.js';

const GM = {isGM: true};
const TOKEN = 'github_pat_TESTTOKEN0123456789abcdefABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_abcdefghijklmn';
const sha = n => String(n).padStart(40, '0');
const mkStore = (init = {}) => { const data = {githubToken: TOKEN, githubConfig: {}, githubPullState: {}, ...init}; return {data, get: k => data[k], set: async (k, v) => { data[k] = v; }}; };
const item = id => JSON.stringify({manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'PKG-TEST'}, records: [{id, entity_type: 'Item', name: `[TEST] ${id}`}]});
function fakeGithub(files, {fail = {}} = {}) {
  const calls = [], tree = [], blobs = new Map();
  let n = 1;
  for (const [path, body] of Object.entries(files)) { const s = sha(n++); blobs.set(s, body); tree.push({path, type: 'blob', sha: s, size: body.length}); }
  const res = (status, body) => ({ok: status < 300, status, headers: {get: () => null}, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body});
  const fetch = async (url, opts) => {
    calls.push({url, opts});
    const p = decodeURIComponent(new URL(url).pathname);
    for (const [frag, r] of Object.entries(fail)) if (p.includes(frag)) return res(...r);
    if (/\/commits\//.test(p)) return res(200, 'a'.repeat(40));
    if (/\/git\/trees\//.test(p)) return res(200, {truncated: false, tree});
    const m = /\/contents\/(.+)$/.exec(p);
    if (m) return m[1] in files ? res(200, files[m[1]]) : res(404, {});
    if (/\/repos\/[^/]+\/[^/]+$/.test(p)) return res(200, {full_name: 'owner/repo'});
    return res(404, {});
  };
  return {fetch, calls};
}

// Same shape as the real pack: a manifest in one folder listing REPO-ROOT paths into a sibling folder (synthetic names).
const ROOT = 'content/packs';
const MAIN_DIR = `${ROOT}/main-v1.0.0/files`;
const mainFiles = {};
for (const n of ['L01_a', 'L02_b', 'L03_c']) mainFiles[`${MAIN_DIR}/${n}.json`] = item(`MAT-${n}`);
const REPO = {
  [`${ROOT}/ALPHA_IMPORT_MANIFEST_2026-10-22.json`]: JSON.stringify({schema: 'ag-alpha-manifest/1', ordered_files: Object.keys(mainFiles).reverse()}),
  ...mainFiles,
  [`${ROOT}/sandbox-v0.1.0/README.md`]: 'readme',
  [`${ROOT}/sandbox-v0.1.0/S02_b.json`]: item('MAT-S2'),
  [`${ROOT}/sandbox-v0.1.0/S01_a.json`]: item('MAT-S1'),
  [`${ROOT}/sandbox-v0.1.0/S01.gathering-nodes.json`]: JSON.stringify({schema: 'ag-gathering-nodes/1', nodes: []})
};
const CFG = {repo: 'owner/repo', branch: 'main', paths: [ROOT]};

test('repo-root manifest entries are not doubled; order is the manifest order', async () => {
  const g = fakeGithub(REPO);
  const r = await gh.findPacks(GM, {store: mkStore(), fetch: g.fetch, config: CFG});
  assert.ok(r.ok, r.message);
  const main = r.packs.find(p => p.kind === 'manifest');
  assert.deepEqual(main.files.map(f => f.path), Object.keys(mainFiles).reverse());
  assert.ok(main.files.every(f => !f.missing));
  const pulled = await gh.pullPacks(GM, {store: mkStore(), fetch: g.fetch, config: CFG, manifestPaths: [main.id]});
  assert.ok(pulled.ok, pulled.message);
  assert.deepEqual(pulled.files.map(f => f.path), Object.keys(mainFiles).reverse());
});

test('Find packs on the parent folder lists the main pack and the sandbox folder, with readable names', async () => {
  const r = await gh.findPacks(GM, {store: mkStore(), fetch: fakeGithub(REPO).fetch, config: CFG});
  assert.deepEqual(r.packs.map(p => p.label), ['Alpha import', 'Sandbox v0.1.0']);
  const sandbox = r.packs[1];
  assert.equal(sandbox.kind, 'folder');
  assert.deepEqual(sandbox.files.map(f => f.path.split('/').at(-1)), ['S01_a.json', 'S02_b.json']);
  assert.deepEqual(sandbox.ledgerFiles.map(f => f.split('/').at(-1)), ['S01.gathering-nodes.json']);
  assert.ok(!r.packs.some(p => p.id.includes('main-v1.0.0')), 'the folder a manifest already lists is not a second pack');
});

test('a folder pack pulls its JSON files in name order and leaves gathering nodes out', async () => {
  const g = fakeGithub(REPO), store = mkStore();
  const found = await gh.findPacks(GM, {store, fetch: g.fetch, config: CFG});
  const r = await gh.pullPacks(GM, {store, fetch: g.fetch, config: CFG, manifestPaths: [found.packs[1].id]});
  assert.ok(r.ok, r.message);
  assert.deepEqual(r.files.map(f => f.path.split('/').at(-1)), ['S01_a.json', 'S02_b.json']);
  assert.equal(r.ledgerListed.length, 1);
  assert.ok(!g.calls.some(c => /gathering-nodes/.test(c.url)));
  await gh.recordPull(GM, {store, config: CFG, state: r.state});
  const same = await gh.checkForUpdates(GM, {store, fetch: g.fetch, config: CFG});
  assert.ok(same.ok && same.upToDate);
});

test('manifest entries may be root paths, folder-relative paths or bare names', () => {
  const tree = new Set(['p/m/manifest.json', 'p/m/a.json', 'p/m/sub/b.json', 'p/other/c.json']);
  const exists = path => tree.has(path);
  exists.under = (dir, name) => [...tree].filter(x => x.startsWith(`${dir}/`) && x.split('/').at(-1) === name);
  const body = entries => JSON.stringify({schema: 'ag-alpha-manifest/1', ordered_files: entries});
  const got = entries => readManifest(body(entries), 'p/m/manifest.json', exists).files.map(f => f.path);
  assert.deepEqual(got(['p/m/a.json', 'p/m/sub/b.json']), ['p/m/a.json', 'p/m/sub/b.json']);       // root-relative
  assert.deepEqual(got(['a.json', 'sub/b.json', '../other/c.json']), ['p/m/a.json', 'p/m/sub/b.json', 'p/other/c.json']); // folder-relative
  assert.deepEqual(got(['b.json']), ['p/m/sub/b.json']);                                           // bare name, ZIP style
  assert.equal(readManifest(body(['../../../x.json']), 'p/m/manifest.json', exists).invalid.length, 1);
});

test('pack names are readable', () => {
  assert.equal(readableName('campaign/content-packs/ALPHA_IMPORT_MANIFEST_2026-10-22.json'), 'Alpha import');
  assert.equal(readableName('x/sandbox-v0.1.0'), 'Sandbox v0.1.0');
  const m = readManifest(JSON.stringify({schema: 'ag-alpha-manifest/1', title: 'Fosstryn pack', version: '0.3.3', ordered_files: ['a.json']}), 'x/m.json');
  assert.equal(m.label, 'Fosstryn pack v0.3.3');
});

test('the progress table and pack rows show file names, not repository paths', () => {
  const html = githubView({draft: {}, packs: [{id: 'a/b.json', label: 'Alpha import', source: 'b.json', fileCount: 2, missing: 0}], selected: [], rows: [{path: 'deep/folder/L01.json', status: 'done'}]});
  assert.match(html, /<code>L01\.json<\/code>/);
  assert.doesNotMatch(html, /deep\/folder/);
  assert.match(html, /Alpha import/);
});

test('pasted tokens are cleaned: newline, zero-width characters, quotes and Bearer', () => {
  for (const messy of [`${TOKEN}\n`, `​${TOKEN}﻿`, `"${TOKEN}"`, `'${TOKEN}'`, `Bearer ${TOKEN}`, ` ${TOKEN.slice(0, 20)} ${TOKEN.slice(20)} `]) {
    assert.equal(cleanToken(messy), TOKEN);
    assert.equal(tokenProblem(messy), '');
  }
});

test('the 10 dots seen in Forge are told apart from a real refusal', () => {
  assert.match(tokenProblem('•'.repeat(10)), /does not look like a token: it contains characters/);
  assert.match(tokenProblem('hunter2hunt'), /only 11 characters/);
  assert.match(tokenProblem('   '), /box is empty/);
  assert.ok(!tokenProblem('hunter2hunt').includes('hunter2'));
});

test('saving a token checks it with GitHub first and reports saved only when accepted', async () => {
  const cfg = {repo: 'owner/repo', branch: 'main', paths: ['x']};
  const rejected = mkStore({githubToken: ''});
  const r401 = await gh.saveToken(GM, {store: rejected, token: TOKEN, config: cfg, fetch: fakeGithub(REPO, {fail: {'/repos/owner/repo': [401, {}]}}).fetch});
  assert.equal(r401.ok, false);
  assert.match(r401.message, /GitHub rejected the token \(401\)/);
  assert.match(r401.message, /was not saved/);
  assert.equal(rejected.data.githubToken, '');
  const r404 = await gh.saveToken(GM, {store: rejected, token: TOKEN, config: cfg, fetch: fakeGithub(REPO, {fail: {'/repos/owner/repo': [404, {}]}}).fetch});
  assert.match(r404.message, /well-formed token, but GitHub cannot see owner\/repo/);
  const offline = await gh.saveToken(GM, {store: rejected, token: TOKEN, config: cfg, fetch: async () => { throw new TypeError('x'); }});
  assert.match(offline.message, /Could not reach GitHub/);
  const text = await gh.saveToken(GM, {store: rejected, token: '•'.repeat(10), config: cfg, fetch: async () => { throw new Error('no request for non-tokens'); }});
  assert.equal(text.kind, 'text');
  const ok = fakeGithub(REPO);
  const good = await gh.saveToken(GM, {store: rejected, token: `"${TOKEN}"\n`, config: cfg, fetch: ok.fetch});
  assert.ok(good.ok);
  assert.equal(rejected.data.githubToken, TOKEN);
  assert.ok(ok.calls.every(c => c.url === 'https://api.github.com/repos/owner/repo'));
  for (const result of [r401, r404, offline, text, good]) assert.ok(!JSON.stringify(result).includes(TOKEN));
});

test('the token box is not a password field, so browsers and password managers do not fill it', () => {
  for (const saved of [false, true]) {
    const html = githubView({draft: {token: ''}, token: {saved, masked: '••••1234'}, packs: []});
    assert.doesNotMatch(html, /type="password"/);
    assert.match(html, /agm-secret/);
    assert.match(html, /data-1p-ignore/);
    assert.match(html, /data-lpignore/);
    assert.match(html, /name="agm-gh-secret-field"/);
  }
  assert.match(fs.readFileSync(new URL('../styles/manager.css', import.meta.url), 'utf8'), /\.agm-secret\{-webkit-text-security:disc/);
});
