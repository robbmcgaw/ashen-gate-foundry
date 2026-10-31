import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as gh from '../scripts/github-pull.js';
import {updateSummary, resolveRelative, parseRepo, validateConfig, mapGithubError, maskToken} from '../scripts/github-paths.js';
import {readSyncInput, joinSyncInputs} from '../scripts/sync-load.js';
import {githubView} from '../scripts/github-view.js';

const GM = {isGM: true}, PLAYER = {isGM: false};
const TOKEN = 'github_pat_TESTTOKEN0123456789abcdef';
const C1 = 'a'.repeat(40), C2 = 'b'.repeat(40);
const sha = n => String(n).padStart(40, '0');
const mkStore = (init = {}) => { const data = {githubToken: TOKEN, githubConfig: {}, githubPullState: {}, ...init}; return {data, get: k => data[k], set: async (k, v) => { data[k] = v; }}; };
const item = id => JSON.stringify({manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'PKG-TEST'}, records: [{id, entity_type: 'Item', name: `[TEST] ${id}`}]});
const CFG = {repo: 'owner/repo', branch: 'main', paths: ['packs/main']};

/** A fake GitHub: files {path: body}, tree entries get sizes; records every call. */
function fakeGithub(files, {commit = C1, sizes = {}, fail = {}, truncated = false} = {}) {
  const calls = [];
  const blobs = new Map(), tree = [];
  let n = 1;
  for (const [path, body] of Object.entries(files)) { const s = sha(n++); blobs.set(s, body); tree.push({path, type: 'blob', sha: s, size: sizes[path] ?? body.length}); }
  const bySha = path => tree.find(t => t.path === path).sha;
  const res = (status, body, headers = {}) => ({ok: status < 300, status, headers: {get: k => headers[k.toLowerCase()] ?? null}, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body});
  const fetch = async (url, opts) => {
    calls.push({url, opts});
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname);
    for (const [frag, r] of Object.entries(fail)) if (p.includes(frag)) return res(...r);
    if (/\/commits\//.test(p)) return res(200, commit);
    if (/\/git\/trees\//.test(p)) return res(200, {truncated, tree});
    let m = /\/git\/blobs\/([0-9a-f]+)$/.exec(p);
    if (m) return res(200, blobs.get(m[1]));
    m = /\/contents\/(.+)$/.exec(p);
    if (m) { const path = m[1]; if (!(path in files)) return res(404, {}); if ((sizes[path] ?? 0) > 1_000_000) return res(403, {message: 'This file is too large to display; use the blobs API', errors: [{code: 'too_large'}]}); return res(200, files[path]); }
    return res(404, {});
  };
  return {fetch, calls, bySha};
}
const MANIFEST = JSON.stringify({schema: 'ag-alpha-manifest/1', name: 'Main pack', ordered_files: ['L02_b.json', './sub/L01_a.json', '../shared/L03_c.json']});
const PACK = () => ({
  'packs/main/pack-manifest.json': MANIFEST,
  'packs/main/L02_b.json': item('MAT-B'), 'packs/main/sub/L01_a.json': item('MAT-A'), 'packs/shared/L03_c.json': item('MAT-C')
});

test('relative paths resolve against the manifest folder and cannot leave the repository', () => {
  assert.equal(resolveRelative('packs/main', 'a.json'), 'packs/main/a.json');
  assert.equal(resolveRelative('packs/main', './sub/a.json'), 'packs/main/sub/a.json');
  assert.equal(resolveRelative('packs/main', '../x/a.json'), 'packs/x/a.json');
  assert.equal(resolveRelative('packs/main', '/top.json'), 'top.json');
  assert.equal(resolveRelative('packs', '../../x.json'), null);
  assert.equal(resolveRelative('packs', 'https://evil.example/x.json'), null);
  assert.equal(resolveRelative('packs', 'a\\b.json'), null);
});

test('repository, branch and paths are validated', () => {
  assert.ok(parseRepo('owner/repo').ok);
  for (const bad of ['', 'owner', 'https://github.com/o/r', 'o/r/extra', 'o/..', 'o r/x']) assert.equal(parseRepo(bad).ok, false, bad);
  assert.equal(validateConfig({repo: 'o/r', branch: 'a..b', paths: 'x'}).ok, false);
  assert.equal(validateConfig({repo: 'o/r', branch: '', paths: '../x'}).ok, false);
  assert.deepEqual(validateConfig({repo: 'o/r', branch: '', paths: 'a/b\n\n/a/b/'}).config, {repo: 'o/r', branch: 'main', paths: ['a/b']});
});

test('find packs: manifest discovery, ordering and relative resolution; token only goes to api.github.com', async () => {
  const g = fakeGithub(PACK());
  const r = await gh.findPacks(GM, {store: mkStore(), fetch: g.fetch, config: CFG});
  assert.ok(r.ok, r.message);
  assert.equal(r.commit, C1);
  assert.equal(r.packs.length, 1);
  assert.deepEqual(r.packs[0].files.map(f => f.path), ['packs/main/L02_b.json', 'packs/main/sub/L01_a.json', 'packs/shared/L03_c.json']);
  for (const c of g.calls) {
    assert.ok(c.url.startsWith('https://api.github.com/'), c.url);
    assert.equal(c.opts.headers.Authorization, `Bearer ${TOKEN}`);
  }
  assert.ok(g.calls.some(c => c.opts.headers.Accept === 'application/vnd.github.raw+json'));
});

test('pull reads files in manifest order, at one commit, and they reach Sync input unchanged', async () => {
  const files = PACK(), g = fakeGithub(files);
  const store = mkStore();
  const seen = [];
  const r = await gh.pullPacks(GM, {store, fetch: g.fetch, config: CFG, manifestPaths: ['packs/main/pack-manifest.json'], onProgress: e => seen.push(e)});
  assert.ok(r.ok, r.message);
  assert.deepEqual(r.files.map(f => f.path), ['packs/main/L02_b.json', 'packs/main/sub/L01_a.json', 'packs/shared/L03_c.json']);
  assert.ok(g.calls.filter(c => /\/contents\//.test(c.url)).every(c => c.url.includes(`ref=${C1}`)));
  assert.ok(seen.some(e => e.status === 'done'));
  const made = gh.syncFiles(GM, {files: r.files});
  const inputs = [];
  for (const f of made.files) {
    assert.equal(await f.text(), files[f.name]);
    inputs.push(await readSyncInput(f));
  }
  const joined = joinSyncInputs(inputs);
  assert.deepEqual(joined.sources.map(s => s.payload.records[0].id), ['MAT-B', 'MAT-A', 'MAT-C']);
  assert.deepEqual(joined.sources[0].payload, JSON.parse(files['packs/main/L02_b.json']));
});

test('files over 1 MB use the blobs API; a too-large answer from contents falls back to it', async () => {
  const files = PACK();
  const g = fakeGithub(files, {sizes: {'packs/main/L02_b.json': 2_000_000, 'packs/main/sub/L01_a.json': 500_000}});
  // the second is under the threshold in the tree but contents says too large
  const g2 = fakeGithub(files, {sizes: {'packs/main/sub/L01_a.json': 1_200_000}});
  const a = await gh.pullPacks(GM, {store: mkStore(), fetch: g.fetch, config: CFG, manifestPaths: ['packs/main/pack-manifest.json']});
  assert.ok(a.ok, a.message);
  assert.ok(g.calls.some(c => /\/git\/blobs\//.test(c.url) && c.opts.headers.Accept === 'application/vnd.github.raw+json'));
  assert.ok(!g.calls.some(c => /contents\/packs\/main\/L02_b/.test(c.url)));
  const b = await gh.pullPacks(GM, {store: mkStore(), fetch: g2.fetch, config: CFG, manifestPaths: ['packs/main/pack-manifest.json']});
  assert.ok(b.ok, b.message);
  assert.equal(b.files.find(f => f.path.endsWith('L01_a.json')).body, files['packs/main/sub/L01_a.json']);
});

test('concurrency never exceeds four', async () => {
  const names = Array.from({length: 12}, (_, i) => `f${i}.json`);
  const files = {'packs/main/pack-manifest.json': JSON.stringify({schema: 'ag-alpha-manifest/1', ordered_files: names})};
  for (const n of names) files[`packs/main/${n}`] = item(`MAT-${n}`);
  const g = fakeGithub(files);
  let live = 0, peak = 0;
  const wrapped = async (url, o) => { const contents = /\/contents\/packs\/main\/f/.test(url); if (contents) { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 5)); } try { return await g.fetch(url, o); } finally { if (contents) live--; } };
  const r = await gh.pullPacks(GM, {store: mkStore(), fetch: wrapped, config: CFG, manifestPaths: ['packs/main/pack-manifest.json'], concurrency: 99});
  assert.ok(r.ok);
  assert.ok(peak <= 4 && peak > 1, `peak ${peak}`);
});

test('errors are mapped to plain language and never contain the token', async () => {
  const cases = [[401, /did not accept the token/], [403, /cannot read that repository/], [404, /could not find/], [500, /GitHub had a problem/]];
  for (const [status, re] of cases) {
    const g = fakeGithub(PACK(), {fail: {'/commits/': [status, {message: `bad ${TOKEN}`}]}});
    const r = await gh.findPacks(GM, {store: mkStore(), fetch: g.fetch, config: CFG});
    assert.equal(r.ok, false);
    assert.match(r.message, re);
    assert.ok(!JSON.stringify(r).includes(TOKEN));
  }
  const limited = mapGithubError(403, {headers: {get: k => ({'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600)})[k] ?? null}});
  assert.equal(limited.kind, 'rate');
  assert.match(limited.message, /limiting requests/);
  const offline = await gh.findPacks(GM, {store: mkStore(), fetch: async () => { throw new TypeError('Failed to fetch'); }, config: CFG});
  assert.match(offline.message, /Could not reach GitHub/);
  const noToken = await gh.findPacks(GM, {store: mkStore({githubToken: ''}), fetch: async () => { throw new Error('should not be called'); }, config: CFG});
  assert.match(noToken.message, /token/i);
});

test('a missing file stops the pull and nothing is handed to Sync', async () => {
  const files = PACK(); delete files['packs/shared/L03_c.json'];
  const g = fakeGithub(files);
  const r = await gh.pullPacks(GM, {store: mkStore(), fetch: g.fetch, config: CFG, manifestPaths: ['packs/main/pack-manifest.json']});
  assert.equal(r.ok, false);
  assert.deepEqual(r.files, []);
  assert.match(r.message, /nothing was sent to Sync/);
  assert.match(r.failed[0].message, /not in the repository/);
});

test('a bad token mid-pull stops everything with one message', async () => {
  const g = fakeGithub(PACK(), {fail: {'/contents/packs/main/L02_b': [401, {}]}});
  const r = await gh.pullPacks(GM, {store: mkStore(), fetch: g.fetch, config: CFG, manifestPaths: ['packs/main/pack-manifest.json']});
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'token');
});

test('cancel stops the pull and sends nothing', async () => {
  const g = fakeGithub(PACK());
  const ac = new AbortController();
  const r = await gh.pullPacks(GM, {store: mkStore(), fetch: async (u, o) => { if (/contents\/packs\/main\/L/.test(u)) ac.abort(); return g.fetch(u, o); }, signal: ac.signal, config: CFG, manifestPaths: ['packs/main/pack-manifest.json']});
  assert.equal(r.ok, false);
  assert.ok(r.cancelled);
  assert.deepEqual(r.files, []);
});

test('gathering node files are listed for the Ledger and not sent to Sync', async () => {
  const files = PACK();
  files['packs/main/sub/L01_a.json'] = JSON.stringify({schema: 'ag-gathering-nodes/1', nodes: []});
  const r = await gh.pullPacks(GM, {store: mkStore(), fetch: fakeGithub(files).fetch, config: CFG, manifestPaths: ['packs/main/pack-manifest.json']});
  assert.ok(r.ok);
  const made = gh.syncFiles(GM, {files: r.files});
  assert.deepEqual(made.ledger, ['packs/main/sub/L01_a.json']);
  assert.deepEqual(made.files.map(f => f.name), ['packs/main/L02_b.json', 'packs/shared/L03_c.json']);
  assert.match(githubView({draft: {}, packs: [], pulled: {count: 2, ledger: made.ledger}, rows: [{path: 'x.json', status: 'ledger'}]}), /Handled by the Ledger/);
});

test('change detection: up to date, changed files per pack line, and no request without a click', async () => {
  const store = mkStore(), files = PACK();
  const g1 = fakeGithub(files);
  assert.equal(g1.calls.length, 0);
  const pulled = await gh.pullPacks(GM, {store, fetch: g1.fetch, config: CFG, manifestPaths: ['packs/main/pack-manifest.json']});
  await gh.recordPull(GM, {store, config: CFG, state: pulled.state});
  assert.ok(!JSON.stringify(store.data.githubPullState).includes(TOKEN));
  const same = await gh.checkForUpdates(GM, {store, fetch: g1.fetch, config: CFG});
  assert.ok(same.ok && same.upToDate);
  const edited = {...files, 'packs/main/L02_b.json': item('MAT-B2')};
  const g2 = fakeGithub(edited, {commit: C2});
  // same file contents keep SHAs only if the fake numbers them the same: only L02_b's body differs, so SHAs are identical by position;
  // force a difference by renumbering that file's sha
  const tree = edited;
  const r2 = await gh.checkForUpdates(GM, {store, fetch: async (u, o) => { const res = await g2.fetch(u, o); if (/git\/trees/.test(u)) { const body = await res.json(); body.tree = body.tree.map(t => t.path.endsWith('L02_b.json') ? {...t, sha: sha(99)} : t); return {...res, json: async () => body}; } return res; }, config: CFG});
  assert.ok(r2.ok);
  assert.equal(r2.upToDate, false);
  assert.equal(r2.changed, 1);
  assert.match(updateSummary(r2), /1 file changed/);
});

test('token, settings and pull state are client scope; the token is masked and removable', async () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  for (const key of ['token', 'config', 'state'])
    assert.match(main, new RegExp(`github\\.GITHUB_SETTINGS\\.${key},\\{[^}]*scope:"client"`));
  assert.doesNotMatch(main, /GITHUB_SETTINGS[^\n]*scope:"world"/);
  const store = mkStore({githubToken: ''});
  assert.equal((await gh.saveToken(GM, {store, token: 'short'})).ok, false);
  const saved = await gh.saveToken(GM, {store, token: TOKEN});
  assert.ok(saved.ok);
  assert.ok(!JSON.stringify(saved).includes(TOKEN));
  assert.ok(!JSON.stringify(gh.tokenStatus(GM, {store})).includes(TOKEN));
  assert.equal(maskToken(TOKEN).slice(-4), TOKEN.slice(-4));
  const html = githubView({draft: {}, token: gh.tokenStatus(GM, {store}), packs: []});
  assert.ok(!html.includes(TOKEN));
  assert.match(html, /Remove token…/);
  assert.match(html, /this device only/);
  assert.ok((await gh.removeToken(GM, {store})).ok);
  assert.equal(store.data.githubToken, '');
});

test('the token is never logged', async () => {
  const seen = [];
  const orig = {log: console.log, warn: console.warn, error: console.error};
  for (const k of Object.keys(orig)) console[k] = (...a) => seen.push(a.join(' '));
  try {
    await gh.findPacks(GM, {store: mkStore(), fetch: fakeGithub(PACK(), {fail: {'/trees/': [403, {}]}}).fetch, config: CFG});
    await gh.pullPacks(GM, {store: mkStore(), fetch: async () => { throw new TypeError('x'); }, config: CFG, manifestPaths: ['a.json']});
  } finally { Object.assign(console, orig); }
  assert.ok(!seen.join('\n').includes(TOKEN));
  assert.doesNotMatch(fs.readFileSync(new URL('../scripts/github-pull.js', import.meta.url), 'utf8'), /console\./);
});

test('every exported function refuses a non-GM before any request or write', async () => {
  const store = mkStore(), before = JSON.stringify(store.data);
  const g = fakeGithub(PACK());
  const opts = {store, fetch: g.fetch, config: CFG, manifestPaths: ['x.json'], token: TOKEN, input: CFG, state: {}, files: []};
  for (const [name, fn] of Object.entries(gh).filter(([, v]) => typeof v === 'function')) {
    for (const user of [PLAYER, null, undefined]) {
      const r = await fn(user, opts);
      assert.equal(r.ok, false, name);
      assert.equal(r.message, gh.GM_ONLY, name);
    }
  }
  assert.equal(g.calls.length, 0);
  assert.equal(JSON.stringify(store.data), before);
});

test('the section is wired into the Import tab without startup requests', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  const hbs = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  assert.match(hbs, /\{\{\{githubHtml\}\}\}/);
  assert.match(main, /case "gh-pull"/);
  assert.doesNotMatch(fs.readFileSync(new URL('../scripts/github-pull.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../scripts/github-paths.js', import.meta.url), 'utf8'), /\beval\(|new Function|robbmcgaw|ashen-gate-supplement/);
  assert.equal(JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8')).version, '0.92.0');
});
