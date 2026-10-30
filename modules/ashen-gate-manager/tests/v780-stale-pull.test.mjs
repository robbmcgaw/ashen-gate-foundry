/** 0.78.0: Sync warns when it holds an older GitHub pull. Mocked data only; proves logic and markup, not the live Foundry window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {staleAfterPull, activeStale, staleNotice, STALE_PULL_HINT, STALE_REFUSAL} from '../scripts/sync-stale.js';
import {syncView} from '../scripts/sync-view.js';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const gh = {name: '[TEST] a.json', github: true}, hand = {name: '[TEST] hand.json'};
const held = {commit: 'abc1234def', where: 'test/repo@main', files: 1};

test('stale when GitHub inputs are held from a different commit', () => {
  assert.deepEqual(staleAfterPull([gh], held, 'def5678aaa'), {heldCommit: 'abc1234def', newCommit: 'def5678aaa'});
  assert.deepEqual(staleAfterPull([hand, gh], held, 'def5678aaa').newCommit, 'def5678aaa');
});
test('not stale for the same commit, no GitHub inputs, hand-chosen files only, or no new commit', () => {
  assert.equal(staleAfterPull([gh], held, 'abc1234def'), null);
  assert.equal(staleAfterPull([], held, 'def5678aaa'), null);
  assert.equal(staleAfterPull([hand], held, 'def5678aaa'), null);
  assert.equal(staleAfterPull([hand], null, 'def5678aaa'), null);
  assert.equal(staleAfterPull([gh], held, null), null);
});
test('activeStale ignores a stale record once no GitHub input is held', () => {
  const stale = {heldCommit: 'a', newCommit: 'b'};
  assert.equal(activeStale({githubStale: stale, inputs: [gh]}), stale);
  assert.equal(activeStale({githubStale: stale, inputs: [hand]}), null);
  assert.equal(activeStale({githubStale: null, inputs: [gh]}), null);
});
test('notice uses short commit ids and no other ids or timestamps', () => {
  const text = staleNotice({heldCommit: 'abc1234def9999', newCommit: 'def5678abc0000'});
  assert.equal(text, 'Sync is still holding files from an older pull (commit abc1234). Press Preview in Sync from package under Pull from GitHub to load the new pull (commit def5678).');
  assert.equal(staleNotice(null), '');
  assert.match(STALE_PULL_HINT, /Preview in Sync from package/);
});

const base = {inputs: [{name: 'a.json', imports: [{filename: 'a.json', label: 'Manager package', records: 1, packageId: 'PKG-TEST'}]}], skipped: [], fileButton: '', deleteUnscoped: false, overwriteEdited: false, replaceArt: false, isGM: true, plan: null, phrase: '', busy: false, progress: null, stopping: false, github: {where: 'test/repo@main', commit: 'abc1234def', files: 1}};
test('stale Sync shows the notice and the commit it holds, and disables Preview sync with a reason', () => {
  const html = syncView({...base, githubStale: {heldCommit: 'abc1234def', newCommit: 'def5678abc'}, githubStaleNotice: staleNotice({heldCommit: 'abc1234def', newCommit: 'def5678abc'})});
  assert.match(html, /data-ag-sync-stale/); assert.match(html, /older pull \(commit abc1234\)/);
  assert.match(html, /Pulled from GitHub:<\/strong> test\/repo@main at commit <code>abc1234<\/code>/);
  assert.match(html, /data-ag-action="sync-preview" disabled aria-describedby="agm-stale-why"/);
  assert.match(html, /id="agm-stale-why"/);
});
test('fresh Sync has no notice and an enabled Preview sync; hand-chosen files are never marked', () => {
  const html = syncView({...base, github: null});
  assert.ok(!html.includes('data-ag-sync-stale')); assert.match(html, /data-ag-action="sync-preview" >/);
});
test('Apply is disabled while stale', () => {
  const plan = {ok: true, errors: [], notes: [], rows: [], scope: {lines: [], files: []}, characterCount: 0, records: 1, counts: {create: 1, overwrite: 0, rebind: 0, delete: 0, archive: 0, restore: 0, untouched: 0, refused: 0, notRemoved: 0, metadataRefreshes: 0, supersedeFiles: 0, rename: 0}, buttonLabel: 'Apply sync', destructive: false, metadataOnly: false};
  const html = syncView({...base, plan, githubStale: {heldCommit: 'a', newCommit: 'b'}, githubStaleNotice: 'x'});
  assert.match(html, /data-ag-sync-run disabled aria-describedby="agm-stale-why"/);
  assert.doesNotMatch(syncView({...base, plan}), /data-ag-sync-run[^>]*agm-stale-why/);
});

test('main.js wiring: set after a different-commit pull, cleared by Preview in Sync from package, clear inputs and a failed pull; preview and run refuse', () => {
  const m = read('../scripts/main.js');
  assert.match(m, /this\.sync\.githubStale=staleAfterPull\(this\.sync\.inputs,this\.sync\.github,r\.commit\)/);
  const send = m.slice(m.indexOf('async #ghSendSync()'), m.indexOf('async #ghSendImport()'));
  assert.match(send, /this\.sync\.githubStale=null/);
  const pull = m.slice(m.indexOf('async #ghPull()'), m.indexOf('async #ghSyncInputs()'));
  assert.match(pull, /if\(!r\.ok\)[\s\S]*this\.sync\.githubStale=null[\s\S]*return;/);
  assert.match(m, /Object\.assign\(this\.sync,\{inputs:\[\],githubStale:null/);
  assert.match(m, /async #syncPreview\(\) \{\n    if\(activeStale\(this\.sync\)\) \{ this\.sync\.message=STALE_REFUSAL/);
  assert.match(m, /async #syncRun\(\) \{[\s\S]{0,120}activeStale\(this\.sync\)\) \{ toast\(STALE_REFUSAL,true\)/);
  assert.ok(STALE_REFUSAL.includes('Nothing in your world changed'));
});
test('Help describes it; version is 0.83.0', () => {
  assert.match(read('../scripts/main.js'), /Pulling again does not replace the files Sync already holds/);
  const man = JSON.parse(read('../module.json'));
  assert.equal(man.version, '0.85.0'); assert.ok(man.download.endsWith('/ashen-gate-manager-v0.85.0/ashen-gate-manager.zip'));
});
