/** 0.54.2: canonical ids (REC-, MAT-, NPC-, DEITY-, ...) are not shown in Manager's views. Proves logic with mocked Foundry, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertNoIds, findId} from '../../../scripts/test-helpers/no-ids.mjs';
import {createBrowse, searchIndex} from '../scripts/browse.js';
import {bodyHtml, DEFAULT_STATE} from '../scripts/browse-view.js';
import {gmEntry, playerEntry, renderPlayerCodexHtml} from '../scripts/codex.js';
import {buildImportReport} from '../scripts/import-result.js';
import {summaryText} from '../scripts/world-export.js';

const M = 'ashen-gate-manager';
const R = 'ashen-gate-factions';
const coll = list => ({contents: list});
const doc = (documentName, id, name, sourceId, entityType, definition = {}) => ({documentName, id, uuid: `${documentName}.${id}`, name, type: documentName === 'Actor' ? 'npc' : 'loot',
  system: {}, folder: null, _stats: {modifiedTime: 5}, sheet: {render: () => Promise.resolve()},
  flags: {[M]: {source: {sourceId, entityType, status: 'approved', visibility: 'gm', packageId: 'PKG-TEST', refs: [{id: 'MAT-TEST-HERB', mode: 'required'}], definition: {id: sourceId, entity_type: entityType, name, ...definition}}}}});

function world() {
  const warden = doc('Actor', 'a1', '[TEST] Warden Pell', 'NPC-TEST-WARDEN', 'NPC');
  const recipe = doc('Item', 'i1', '[TEST] Field Salve', 'REC-TEST-SALVE', 'Recipe', {effort: 'short', tier: 1});
  const herb = doc('Item', 'i2', '[TEST] Pale Herb', 'MAT-TEST-HERB', 'Material');
  const codexApi = {list: () => [gmEntry({def: {...warden.flags[M].source.definition, role: 'Gatekeeper', codex: {links: ['LOC-TEST-TOWN', 'FACTION-TEST-GUILD', 'DEITY-TEST-SUN']}},
    state: {discovery: {party: true, actors: []}, fields: {role: {party: true}}}, uuid: warden.uuid, name: warden.name}, {nameOf: id => id === 'FACTION-TEST-GUILD' ? '[TEST] Guild' : null})]};
  const renown = {getFactions: () => [{id: 'FACTION-TEST-GUILD', name: '[TEST] Guild', visibility: 'player'}],
    getDeities: () => [{id: 'DEITY-TEST-SUN', entity_type: 'Deity', status: 'approved', visibility: 'reveal_gated', name: '[TEST] Sun Father', tags: [],
      discovery: {placeholder: false, sharing_enabled: true}, deity: {tier: 'major', domain: 'Light', relations: []}}]};
  const modules = new Map([[M, {id: M, active: true, api: {codex: codexApi}}], [R, {id: R, active: true, version: '0.11.1', api: renown}]]);
  return {user: {isGM: true}, items: coll([recipe, herb]), actors: coll([warden]), journal: coll([]), packs: coll([]), modules: {get: id => modules.get(id), values: () => modules.values()}};
}

test('Browse rows and detail show names, not ids, and keep ids only in the GM Details fold', () => {
  const svc = createBrowse({game: world()});
  const idx = svc.getIndex();
  const recipe = idx.find(e => e.id === 'REC-TEST-SALVE');
  assert.ok(recipe, 'sample recipe is indexed');
  const strip = html => html.replace(/<details class="agm-tech" data-ag-technical>[\s\S]*?<\/details>/g, '');
  for (const key of [null, recipe.key, idx.find(e => e.id === 'NPC-TEST-WARDEN').key, idx.find(e => e.id === 'DEITY-TEST-SUN').key]) {
    const state = {...DEFAULT_STATE, detailKey: key};
    const html = bodyHtml(state, svc.search({}), key ? svc.detail(key) : null);
    assertNoIds(strip(html), `Browse results${key ? ' and detail' : ''}`);
    if (key) assert.match(html, /data-ag-technical/, 'the id stays available to the GM in a Details fold');
  }
  // Search by id still matches for the GM.
  assert.deepEqual(searchIndex(idx, {query: 'id:REC-TEST', group: 'none'}).groups.flatMap(g => g.rows.map(r => r.id)), ['REC-TEST-SALVE']);
  // Copy buttons label the record by name.
  assertNoIds(bodyHtml(DEFAULT_STATE, svc.search({}), null).replace(/<details class="agm-tech"[\s\S]*?<\/details>/g, ''), 'Copy id labels');
});

test('Browse messages name the record, not its id', async () => {
  const svc = createBrowse({game: world(), openCodex: null});
  const npc = svc.getIndex().find(e => e.id === 'NPC-TEST-WARDEN');
  const out = await svc.open(npc.key);
  if (out.message) assertNoIds(out.message, 'Browse open message');
});

test('NPC Codex: GM links and player cards never fall back to an id', () => {
  const def = {id: 'NPC-TEST-WARDEN', entity_type: 'NPC', codex: {links: ['LOC-TEST-TOWN', 'DEITY-TEST-SUN']}};
  const gm = gmEntry({def, state: {discovery: {party: true, actors: []}, fields: {}}});
  assert.equal(gm.name, 'Unnamed NPC');
  for (const l of gm.links) assertNoIds(l.name, 'GM codex link');
  const player = playerEntry({def, state: {discovery: {party: true, actors: []}, fields: {links: {party: true}}}}, []);
  assertNoIds(renderPlayerCodexHtml([player]), 'player codex');
});

test('Import results and the world-export summary use names', () => {
  const report = buildImportReport({file: 'test.json', names: new Map([['REC-TEST-SALVE', '[TEST] Field Salve']]),
    results: [{id: 'REC-TEST-SALVE', kind: 'Item', action: 'create', status: 'error', message: 'REC-TEST-SALVE: invalid link to MAT-TEST-HERB'},
      {id: 'MAT-TEST-HERB', kind: 'Item', action: 'create', status: 'error', message: 'MAT-TEST-HERB failed'}]});
  const lines = report.sections.flatMap(s => s.lines);
  assert.equal(lines[0].message, '[TEST] Field Salve: invalid link to MAT-TEST-HERB', 'only the failing record id is swapped for its name');
  assert.equal(lines[1].message, 'this record failed');
  assert.equal(lines[1].id, 'MAT-TEST-HERB', 'the id stays on the line for the GM Details fold');
  const text = summaryText({mode: 'changed', date: '2026-10-24', world: {title: 'W'}}, {firstRun: false, new: ['world/Item/REC-TEST-SALVE'], changed: ['world/Item/MAT-TEST-HERB'], removed: ['world/Item/REC-GONE']},
    {world: {total: 2, new: 1, changed: 1, removed: 1}}, new Map([['world/Item/REC-TEST-SALVE', '[TEST] Field Salve']]));
  assertNoIds(text, 'world export summary');
});

test('manager.hbs: record ids appear only inside GM Details folds or as wiring attributes', () => {
  const tpl = readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  const visible = tpl.replace(/<details class="agm-tech" data-ag-technical>[\s\S]*?<\/details>/g, '');
  // Module ids (ashen-gate-*) and compendium pack ids are not record ids; those two lines are the only other id shown.
  const lines = visible.split('\n').filter(l => !/agmanager-module-card__info|data-ag-setup-pack/.test(l));
  const readable = lines.join('\n');
  const bad = [...readable.matchAll(/\{\{\{?\s*([\w.@/]*(?:sourceId|targetId|effId|captureId|uuid|\bid))\s*\}?\}\}/g)]
    .filter(m => {
      // wiring: inside data-*, value, href, name, for, id attributes, <option value>, aria-controls/labelledby
      const before = readable.slice(Math.max(0, m.index - 80), m.index);
      return !/(data-[\w-]+|value|href|name|for|id|aria-controls|aria-labelledby|aria-describedby)="[^"<>]*$/.test(before);
    }).map(m => m[0]);
  assert.deepEqual(bad, [], 'ids rendered as visible text');
  assert.equal(findId(readable), null);
  // Every Details fold has a Copy id button or sits next to one.
  assert.match(tpl, /data-ag-copy-id/);
});
