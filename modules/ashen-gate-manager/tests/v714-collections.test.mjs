/** 0.72.2: Foundry V14 collections are Maps (no flatMap). Mocked world only: proves the logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RING_KINDS, listOf, sceneTokenRefs, sceneImagePaths, applyRingRepair, ringRepairPlan} from '../scripts/token-ring.js';
import {planAssetLinks, applyAssetLinks} from '../scripts/assets.js';
import {liveEffectValue} from '../scripts/item-effects.js';

const M = 'ashen-gate-manager', GM = {isGM: true}, P = 'https://assets.test/u1/art/';
// A Foundry-like collection: a Map with `contents`, iterable by value, and deliberately NO flatMap/filter/map.
class Coll extends Map {
  constructor(docs) { super(docs.map(d => [d.id, d])); }
  get contents() { return [...this.values()]; }
  [Symbol.iterator]() { return this.values(); }
}
const mkScene = (id, tokens, extra = {}) => ({id, tokens: new Coll(tokens), ...extra});
const tok = (id, actorId, ring) => ({id, actorId, _source: {ring}});
const doc = (sourceId, name) => ({uuid: `Actor.${sourceId}`, documentName: 'Actor', type: 'npc', name, sourceId, img: '', tokenImg: '', flags: {}});

test('the collection stand-in really has no flatMap', () => { assert.equal(new Coll([]).flatMap, undefined); assert.equal([].flatMap.name, 'flatMap'); });

test('listOf / sceneTokenRefs read Map-like scenes and tokens', () => {
  const scenes = new Coll([mkScene('s1', [tok('t1', 'A1', {enabled: false}), tok('t2', 'A2', {enabled: true}), {id: 't3', actorId: null}]), mkScene('s2', [tok('t4', 'A1')])]);
  assert.deepEqual(sceneTokenRefs(scenes, 'A1').map(t => `${t.sceneId}:${t.id}`), ['s1:t1', 's2:t4']);
  assert.equal(sceneTokenRefs(scenes).length, 3);
  assert.deepEqual(listOf(null), []); assert.deepEqual(listOf(undefined), []); assert.deepEqual(listOf([1]), [1]);
  assert.deepEqual(listOf(new Map([['a', 1]])), [1]); assert.deepEqual(listOf(new Set([2])), [2]);
});

test('Link + token ring + tokens on scenes works with collections, and the ring scan works', async () => {
  const scenes = new Coll([mkScene('s1', [tok('t1', 'A1', {enabled: false})])]);
  const docs = [doc('NPC-TEST-ONE', 'Test Person')];
  const plan = planAssetLinks(docs, [{name: 'NPC-TEST-ONE.webp', path: `${P}NPC-TEST-ONE.webp`}]);
  const written = [], tokenWrites = [];
  const live = new Map([['Actor.NPC-TEST-ONE', {...docs[0], id: 'A1', prototypeToken: {texture: {src: ''}, ring: {enabled: false, colors: {ring: null, background: null}}}}]]);
  const out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: u => live.get(u), updateMany: async (n, u) => { written.push(...u); },
    tokenRing: true, sceneTokens: true, getTokens: a => sceneTokenRefs(scenes, a.id), updateTokens: async (s, u) => { tokenWrites.push({s, u}); }});
  assert.match(out.message, /^1 image\(s\) linked/); assert.equal(written.length, 1);
  assert.equal(tokenWrites.length, 1); assert.equal(tokenWrites[0].s, 's1'); assert.equal(tokenWrites[0].u[0]._id, 't1');
  assert.match(out.message, /1 token\(s\) already on scenes updated/);
  // ring scan: actors whose ring sits at subject scale 1, with their scene tokens
  const actors = [{uuid: 'Actor.X', id: 'X', name: 'X', documentName: 'Actor', type: 'npc', sourceId: 'NPC-TEST-ONE', ring: {enabled: true, subject: {scale: 1}, colors: {ring: RING_KINDS.person.ring, background: RING_KINDS.person.background}}}];
  const rp = ringRepairPlan(actors, sceneTokenRefs(new Coll([mkScene('s9', [tok('tx', 'X', {enabled: true, subject: {scale: 1}, colors: {ring: RING_KINDS.person.ring, background: RING_KINDS.person.background}})])])));
  assert.equal(rp.length, 1); assert.equal(rp[0].tokens.length, 1);
});

test('two-step safety: if reading the scenes throws, the Actor image still links and the toast says what was skipped', async () => {
  const docs = [doc('NPC-TEST-ONE', 'Test Person')];
  const plan = planAssetLinks(docs, [{name: 'NPC-TEST-ONE.webp', path: `${P}NPC-TEST-ONE.webp`}]);
  const written = [];
  const live = new Map([['Actor.NPC-TEST-ONE', {...docs[0], id: 'A1', prototypeToken: {texture: {src: ''}, ring: {enabled: false, colors: {}}}}]]);
  const out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: u => live.get(u), updateMany: async (n, u) => { written.push(...u); },
    tokenRing: true, sceneTokens: true, getTokens: () => { throw new TypeError('(game.scenes ?? []).flatMap is not a function'); }});
  assert.equal(written.length, 1, 'the Actor write still lands');
  assert.match(out.message, /^1 image\(s\) linked/); assert.doesNotMatch(out.message, /^0 image/);
  assert.match(out.message, /scenes could not be read/); assert.equal(out.ok, true); assert.equal(out.skipped.length, 0);
});

test('ring repair: a getTokens failure is reported, the Actor ring is still fixed', async () => {
  const plan = [{uuid: 'Actor.X', name: 'X', sourceId: 'NPC-TEST-ONE', tokens: [{id: 't', sceneId: 's'}]}];
  const wrote = [];
  const out = await applyRingRepair(plan, {user: GM, getDoc: () => ({id: 'X', type: 'npc', prototypeToken: {ring: {enabled: true, subject: {scale: 1}, colors: {ring: RING_KINDS.person.ring, background: RING_KINDS.person.background}}}}), updateMany: async u => wrote.push(...u),
    getTokens: () => { throw new Error('boom'); }});
  assert.equal(out.actors, 1); assert.equal(out.errors.length, 1); assert.equal(out.ok, true);
});

test('scene images: levels when present (Scene#background never read), Scene#background on older cores', () => {
  let touched = false;
  const v14 = {levels: new Coll([{id: 'l1', background: {src: 'a.webp'}, textures: [{src: 'b.webp'}, 'c.webp']}, {id: 'l2', background: {}, textures: {x: {src: 'd.webp'}}}])};
  Object.defineProperty(v14, 'background', {get() { touched = true; return {src: 'old.webp'}; }});
  assert.deepEqual(sceneImagePaths(v14), ['a.webp', 'b.webp', 'c.webp', 'd.webp']); assert.equal(touched, false);
  assert.deepEqual(sceneImagePaths({background: {src: 'old.webp'}}), ['old.webp']);
  assert.deepEqual(sceneImagePaths({levels: new Coll([]), background: {src: 'old.webp'}}), ['old.webp']);
  assert.deepEqual(sceneImagePaths({}), []);
});

test('effect duration: the deprecated shim is never read on V14-shaped data; plain data still works', () => {
  let warned = 0;
  const v14 = {duration: {value: 60, units: 'seconds'}};
  Object.defineProperty(v14.duration, 'seconds', {get() { warned++; return 60; }, enumerable: false});
  Object.defineProperty(v14.duration, 'rounds', {get() { warned++; return 0; }, enumerable: false});
  assert.equal(liveEffectValue(v14, 'duration.seconds'), 60); assert.equal(liveEffectValue(v14, 'duration.rounds'), undefined);
  assert.equal(warned, 0);
  assert.equal(liveEffectValue({duration: {seconds: 30, rounds: 2}}, 'duration.seconds'), 30);
  assert.equal(liveEffectValue({duration: {seconds: 30}}, 'duration.turns'), undefined);
  assert.equal(liveEffectValue({name: 'x'}, 'name'), 'x');
});

test('wiring: no Array methods on game collections remain in main.js; version', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /\(game\.scenes\s*\?\?\s*\[\]\)\.flatMap|game\.scenes\?\?\[\]\)\.flatMap/);
  assert.doesNotMatch(main, /scene\.tokens\s*\?\?\s*\[\]\)\.filter/);
  assert.doesNotMatch(main, /d\.background\?\.src/);
  assert.equal(JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8')).version, '0.94.0');
});

import {githubView, OTHER_FOLDERS_TITLE, NO_MANIFEST_NOTE} from '../scripts/github-view.js';
const pack = (id, noManifest) => ({id, label: id, source: noManifest ? `Folder ${id}, files in name order` : `${id}.json`, noManifest, fileCount: 3, ledgerCount: 0, missing: 0});
const view = selected => githubView({packs: [pack('main', false), pack('Archive', true), pack('Sandbox', true)], selected, draft: {}, token: {}});
test('GitHub pack list: manifests as rows, folders without a manifest in one closed fold with the note once', () => {
  const html = view(['main']);
  assert.match(html, new RegExp(`${OTHER_FOLDERS_TITLE} \\(2\\)`));
  assert.equal(html.split(NO_MANIFEST_NOTE).length - 1, 1, 'the explanation appears once');
  const fold = html.match(/<details class="ag-fold" data-ag-gh-other[^>]*>[\s\S]*?<\/details>/)[0];
  assert.doesNotMatch(fold.split('>')[0], /\bopen\b/);
  assert.ok(fold.includes('data-ag-gh-pack="Archive"') && fold.includes('data-ag-gh-pack="Sandbox"') && !fold.includes('data-ag-gh-pack="main"'));
  assert.ok(html.indexOf('data-ag-gh-pack="main"') < html.indexOf('data-ag-gh-other'), 'manifests come first');
  assert.match(fold, /for="agm-gh-pack-1"/, 'ids and input order are unchanged');
});
test('GitHub pack list: a ticked folder keeps the fold open and is counted; all-manifest lists have no fold', () => {
  const fold = view(['main', 'Sandbox']).match(/<details class="ag-fold" data-ag-gh-other[^>]*>[\s\S]*?<\/details>/)[0];
  assert.match(fold.split('>')[0], /\bopen\b/); assert.match(fold, /1 ticked/); assert.match(fold, /checked/);
  assert.doesNotMatch(githubView({packs: [pack('main', false)], selected: ['main'], draft: {}, token: {}}), /data-ag-gh-other/);
});
