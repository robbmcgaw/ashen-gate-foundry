/** 0.53.0 pre-session check: strictly read-only and GM-only, over a full run with every new check. Mocked Foundry globals. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreSessionCheck} from '../scripts/pre-session-check.js';
import {world, item, recorder, now} from './fixtures/pre-session-world.mjs';

test('read-only: a full run with problems in every new check calls no create/update/delete/setFlag/setting or API write', async () => {
  const rec = recorder();
  const items = [item(rec, 'Recipe', {sourceId: 'REC-TEST-X', definition: {entity_type: 'Recipe', result_item_id: 'ITEM-GONE', ingredients: [{material_id: 'MAT-GONE', quantity: 1}]}}),
    item(rec, 'Potion', {sourceId: 'ITEM-TEST-POTION', definition: {core_ref: 'Potion of Healing'}})];
  const {game} = world({rec, items, trees: [{id: 'T', nodes: [{id: 'n', perkId: 'PERK-GONE'}]}],
    unresolved: [{profession: 'Smithing', field: 'toolProficienciesAnyOf', name: 'X'}],
    rewards: {'QUEST-TEST-OPEN': [{key: 'def:ITEM-GONE', itemId: 'ITEM-GONE', status: 'missing'}]}});
  for (const k of ['Item', 'Actor', 'JournalEntry', 'Folder']) game[`${k}Class`] = {create: rec.trap(`${k}.create`), createDocuments: rec.trap(`${k}.createDocuments`)};
  const out = await runPreSessionCheck(game, {now});
  for (const check of ['Recipes', 'Skill trees', 'Core links', 'Profession Ledger', 'Quest rewards'])
    assert.equal(out.rows.find(r => r.check === check)?.status, 'WARN', check);
  assert.deepEqual(rec.writes, []);
  for (const h of ['8. Recipes', '9. Skill trees', '10. Core links', '11. Profession Ledger', '12. Quest rewards', '13. Imports']) assert.ok(out.text.includes(h), h);
});

test('read-only: the module source has no write call', async () => {
  const {readFile} = await import('node:fs/promises');
  const src = await readFile(new URL('../scripts/pre-session-check.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\.(update|delete|create|setFlag|unsetFlag|createDocuments|updateDocuments|deleteDocuments|createEmbeddedDocuments)\(|settings\.set\(|setEnabled\(|\.apply\(|\.grant\(/);
});

test('GM-only: a player is refused in the code path before any partner API is read', async () => {
  const {game, rec} = world({gm: false});
  let read = 0;
  for (const id of ['ashen-gate-skill-trees', 'ashen-gate-profession-ledger', 'ashen-gate-quest-manager']) {
    const api = game.modules.get(id).api;
    if (api.listTrees) api.listTrees = () => { read++; return []; };
    if (api.assign) api.assign.preview = () => { read++; return {unresolved: []}; };
    if (api.rewards) api.rewards.list = async () => { read++; return []; };
  }
  await assert.rejects(runPreSessionCheck(game, {now}), /Only the GM can run the pre-session check/);
  assert.equal(read, 0);
  assert.deepEqual(rec.writes, []);
});

test('isolation: one partner API throwing does not stop the other checks', async () => {
  const {game} = world();
  game.modules.get('ashen-gate-quest-manager').api.rewards.list = async () => { throw new Error('boom'); };
  const out = await runPreSessionCheck(game, {now});
  assert.equal(out.rows.find(r => r.check === 'Quest rewards').status, 'N-A');
  assert.equal(out.rows.find(r => r.check === 'Recipes').status, 'PASS');
});
