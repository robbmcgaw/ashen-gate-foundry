/** 0.41.2: Manager bug fixes found by the docs review. Proves logic with mocked Foundry, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
import {readRulesFile, RULES_FILE_KIND, DEFAULT_RULES} from '../scripts/organize.js';
import {coreEvidence, isSource2024} from '../scripts/core-links.js';
import {planActor, applyActorUpdate} from '../scripts/actor-update.js';
import {canonicalDefinition} from '../scripts/source-projection.mjs';
import {setReveal, normalizeState} from '../scripts/codex.js';
import {createCodexService} from '../scripts/codex-service.js';
import {createSceneMoods, MOODS_SETTING, LAYERS_SETTING, FILE_FORMAT, FILE_VERSION} from '../scripts/scene-moods.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('(a) messages name the Items tab, not the old Library', () => {
  assert.match(read('../scripts/browse.js'), /Open the NPC Codex tab/);
  assert.doesNotMatch(read('../scripts/browse.js'), /Open Library/);
  assert.doesNotMatch(read('../scripts/codex-service.js'), /in the Library/);
});

test('(b) organize rules import checks the file before asking', () => {
  const rules = structuredClone(DEFAULT_RULES).slice(0, 2);
  assert.deepEqual(readRulesFile({kind: RULES_FILE_KIND, version: 1, rules}), {ok: true, rules});
  assert.equal(readRulesFile(rules).ok, true, 'a bare array still works');
  assert.equal(readRulesFile({rules}).ok, true, 'a missing kind is allowed');
  const backup = readRulesFile({kind: 'ashen-gate-organize-backup', documents: []});
  assert.equal(backup.ok, false);
  assert.match(backup.message, /not an organize rules file.*ashen-gate-organize-backup.*Organize backup/);
  assert.match(readRulesFile({kind: 'ashen-gate.scene-moods', presets: []}).message, /not an organize rules file/);
  assert.match(readRulesFile({hello: 1}).message, /no list of organize rules/);
  assert.match(readRulesFile([]).message, /no rules.*Reset rules to defaults/);
  assert.equal(readRulesFile([{nope: true}]).ok, false, 'invalid rules are refused before the question');
  // The UI asks only after readRulesFile says ok, and the count it shows comes from the checked list.
  const main = read('../scripts/main.js');
  // 0.46.0: the Import… file button (kit fileButton) calls #importRules.
  const at = main.indexOf('async #importRules(f) {');
  const block = main.slice(at, at + 1500);
  assert.ok(at > 0 && block.indexOf('readRulesFile(data)') < block.indexOf('confirmDanger('));
  assert.doesNotMatch(block, /Array\.isArray\(rules\)\?rules\.length:0/);
});

test('(c) a D&D Beyond import with no core book has no edition and is never a 2024 Core Links candidate', () => {
  const ddb = {flags: {ddbimporter: {id: 7}}, system: {source: {rules: '2024', revision: 1, book: ''}}};
  const e = coreEvidence(ddb);
  assert.deepEqual([e.core, e.strong, e.edition], [true, false, null]);
  assert.equal(isSource2024(ddb), false);
  const withBook = {flags: {ddbimporter: {id: 7}}, system: {source: {rules: '2024', book: 'XPHB'}}};
  assert.equal(coreEvidence(withBook).edition, '2024', 'a real 2024 book still counts');
  assert.equal(isSource2024(withBook), true);
});

test('(d) definitions.dispose and appearance.refresh refuse a player', async () => {
  const callbacks = new Map(), fakeModule = {};
  class ApplicationV2 {constructor(o) {this.options = o;} async render() {return this;}}
  globalThis.foundry = {applications: {api: {ApplicationV2, HandlebarsApplicationMixin: P => P, DialogV2: {confirm: async () => true}}}};
  globalThis.Hooks = {once: (e, fn) => callbacks.set(e, fn), on: () => {}};
  globalThis.game = {user: {isGM: true}, modules: new Map([[MODULE_ID, fakeModule]]),
    settings: {register: () => {}, registerMenu: () => {}}};
  await import('../scripts/main.js');
  callbacks.get('init')();
  callbacks.get('ready')();
  const api = fakeModule.api;
  globalThis.game.user = {isGM: false};
  assert.throws(() => api.appearance.refresh(), /Only a GM/);
  assert.throws(() => api.definitions.dispose(), /Only a GM/);
  globalThis.game.user = {id: 'gm', isGM: true};
  assert.doesNotThrow(() => api.definitions.dispose(), 'a GM still can');
});

test('(e) a re-import that changes only NPC record text refreshes the stored definition', async () => {
  const rec = (role = '[TEST] Ferry clerk') => ({id: 'NPC-TEST-MIRA', entity_type: 'NPC', status: 'approved', version: '1.0.0', visibility: 'gm', refs: [],
    provenance: {source: 'test'}, name: '[TEST] Mira', role, wants: '[TEST] Coin',
    foundry: {document_type: 'Actor', data: {name: '[TEST] Mira', type: 'npc', img: 'icons/test/mira.webp', items: []}}});
  const old = rec();
  const raw = {_id: 'a1', ...structuredClone(old.foundry.data), items: [],
    flags: {[MODULE_ID]: {source: {sourceId: old.id, managedFields: exportedFields(old), definition: canonicalDefinition(old)}, actorItems: {version: 1}}}};
  assert.equal(planActor(old, [raw], {updateExisting: true}).action, 'unchanged', 'nothing changed: still unchanged');
  const next = rec('[TEST] Toll keeper');
  const plan = planActor(next, [raw], {updateExisting: true});
  assert.equal(plan.action, 'update');
  assert.match(plan.changes.join(' '), /record text: role/);
  const calls = [];
  const doc = {update: async p => calls.push(p), updateEmbeddedDocuments: async () => {}, createEmbeddedDocuments: async () => {}};
  await applyActorUpdate(doc, plan, {user: {isGM: true}, source: {sourceId: next.id, definition: canonicalDefinition(next)}});
  assert.equal(calls[0][`flags.${MODULE_ID}.source`].definition.role, '[TEST] Toll keeper');
  assert.deepEqual(Object.keys(calls[0]).filter(k => !k.startsWith('flags.')), [], 'no Actor field is touched');
  assert.equal(planActor(next, [raw], {updateExisting: false}).action, 'skipped', 'still opt-in');
});

test('(f) Renown faction links no longer look among deities (deities are DEITY- links)', () => {
  const src = read('../scripts/codex-service.js');
  const nameOf = src.slice(src.indexOf('const nameOf'), src.indexOf('const deityNamer'));
  assert.equal((nameOf.match(/getDeities/g) ?? []).length, 1, 'only the deity branch asks for deities');
  const def = {id: 'NPC-TEST-P', entity_type: 'NPC', name: '[TEST] P', codex: {links: ['FAC-TEST-G', 'DEITY-TEST-SUN']}};
  const actor = {id: 'p', uuid: 'Actor.p', name: 'P', type: 'npc', getFlag: (m, k) => k === 'source' ? {definition: def} : null};
  const game = {user: {isGM: true}, actors: {contents: [actor]}, settings: {get: () => true},
    modules: new Map([['ashen-gate-factions', {active: true, api: {getFactions: () => [{id: 'FAC-TEST-G', name: '[TEST] Guild'}],
      getDeities: () => [{id: 'DEITY-TEST-SUN', name: '[TEST] Sun'}]}}]])};
  const links = createCodexService({game, moduleId: MODULE_ID}).list()[0].links;
  assert.deepEqual(links.map(l => l.name), ['[TEST] Guild', '[TEST] Sun']);
});

test('(g) an unknown reveal key says what is wrong', () => {
  const s = normalizeState(null);
  assert.throws(() => setReveal(s, 'rol', {mode: 'party'}), /"rol" is not a Codex field\. Reveal "discovery" or one of: role, status, appearance/);
  assert.throws(() => setReveal(s, 'gm_notes', {mode: 'party'}), /"gm_notes" is a GM-only field and cannot be revealed/);
});

function moodsWorld({failOn = null} = {}) {
  const store = {[MOODS_SETTING]: [], [LAYERS_SETTING]: []};
  let writes = 0;
  const game = {user: {isGM: true}, scenes: {contents: []},
    settings: {get: (ns, k) => structuredClone(store[k]), set: async (ns, k, v) => {
      writes++; if (k === failOn) throw new Error('disk full'); store[k] = structuredClone(v); return v;}}};
  return {api: createSceneMoods({game, getConfig: () => ({weatherEffects: {}}), getCanvas: () => null}), store, writes: () => writes};
}
const file = presets => ({format: FILE_FORMAT, formatVersion: FILE_VERSION, presets});
const preset = (id, kind, label = `[TEST] ${id}`) => ({id, label, ...(kind === undefined ? {} : {kind}), set: {'environment.darknessLevel': 0.5}});

test('(h) moods import: a bad kind is reported, duplicates show in the preview, and the write is all or nothing', async () => {
  const w = moodsWorld();
  const bad = w.api.previewImport(file([preset('odd', 'weather')]));
  assert.equal(bad.items[0].status, 'invalid');
  assert.match(bad.items[0].problems.join(' '), /Kind must be mood or layer/);
  assert.equal(w.api.previewImport(file([preset('plain')])).items[0].kind, 'mood', 'no kind still means mood');

  const dup = w.api.previewImport(file([preset('fog-test', 'mood'), preset('fog-test', 'mood', '[TEST] second')]));
  assert.deepEqual(dup.items.map(i => i.status), ['new', 'invalid']);
  assert.match(dup.items[1].problems[0], /used twice in this file/);
  const out = await w.api.importPresets(file([preset('fog-test', 'mood'), preset('fog-test', 'mood', '[TEST] second')]));
  assert.equal(out.ok, true);
  assert.equal(w.store[MOODS_SETTING].filter(p => p.id === 'fog-test').length, 1);
  assert.equal(w.store[MOODS_SETTING].find(p => p.id === 'fog-test').label, '[TEST] fog-test');

  // Second kind fails to save: the first one is put back, so nothing is partly written.
  const f = moodsWorld({failOn: LAYERS_SETTING});
  const before = structuredClone(f.store);
  const res = await f.api.importPresets(file([preset('m-new', 'mood'), preset('l-new', 'layer')]));
  assert.equal(res.ok, false);
  assert.match(res.message, /nothing was changed: disk full/);
  assert.deepEqual(f.store, before);
});

test('docs are consistent (version checks live in the newest test)', () => {
  assert.match(read('../CHANGELOG.md'), /## 0\.41\.2/);
  assert.match(read('../../../docs/organize-rules.md'), /ashen-gate-organize-backup/);
  assert.match(read('../../../docs/scene-moods-schema.md'), /used twice/);
  assert.doesNotMatch(read('../../../docs/npc-codex-schema.md'), /whether or not that record is revealed in its own module/);
});
