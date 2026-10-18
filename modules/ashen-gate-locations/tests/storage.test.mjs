import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry, gm, player, Journal, Scene} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote, legacyJournalCount} from '../scripts/store.mjs';
import {parseImport} from '../scripts/model.mjs';

const sample = parseImport(JSON.parse(fs.readFileSync(new URL('../examples/test-locations.json', import.meta.url))), []).created;
const MOD = 'ashen-gate-locations';
const as = user => { game.user = user; };
const playerJournal = () => game.journal.find(j => j.getFlag(MOD, 'role') === 'player-view');
const gmJournal = () => game.journal.find(j => j.getFlag(MOD, 'role') === 'gm-data');
const SECRETS = /GM-only Herb|GM secret|smuggler|Hidden Cave|Ash Wastes|Players must not see|Cinder Moss|Abandoned stone/;

test('GM data journal is NONE; player journal holds only sanitized pages', async () => {
  installFoundry();
  await writeAll(sample);
  assert.equal(gmJournal().ownership.default, 0);
  assert.equal(gmJournal().getFlag(MOD, 'locations').length, 4);
  const pj = playerJournal();
  assert.equal(pj.ownership.default, 2);
  assert.equal(pj.pages.length, 4, 'one page per location, so every location can have a Map Note');
  // Everything a player client could read from the player journal, flags and HTML included:
  assert.doesNotMatch(JSON.stringify(pj), SECRETS);
  const hidden = pj.pages.filter(p => p.ownership.default === 0);
  assert.equal(hidden.length, 2);
  for (const p of hidden) { assert.equal(p.name, 'Unrevealed location'); assert.equal(p.getFlag(MOD, 'view'), ''); assert.equal(p.text.content, ''); }
});

test('players read only revealed views and cannot read GM data', async () => {
  installFoundry();
  await writeAll(sample);
  as(player);
  assert.deepEqual(readViews().map(v => v.name), ['[TEST] Millbrook', '[TEST] Old Quarry']);
  assert.throws(() => readAll(), /Only the GM/);
  await assert.rejects(() => writeAll([]), /Only the GM/);
  as(gm);
  assert.equal(readAll().length, 4);
});

test('hiding a field after it was shown removes it from the player page', async () => {
  installFoundry();
  const loc = {id: 'LOC-A', name: 'A', revealed: true, description: 'was public'};
  await writeAll([loc]);
  assert.match(JSON.stringify(playerJournal()), /was public/);
  await writeAll([{...loc, show: {description: false}}]);
  assert.doesNotMatch(JSON.stringify(playerJournal()), /was public/);
  await writeAll([{...loc, revealed: false}]);
  assert.doesNotMatch(JSON.stringify(playerJournal()), /was public|"A"/);
  as(player);
  assert.deepEqual(readViews(), []);
});

test('deleting a location removes its player page', async () => {
  installFoundry();
  await writeAll(sample);
  await writeAll(sample.slice(1));
  assert.equal(playerJournal().pages.length, 3);
});

test('Map Notes point at the location page and hide the label until revealed', async () => {
  installFoundry();
  const scene = new Scene();
  game.scenes.push(scene);
  await writeAll(sample);
  const cave = sample.find(l => l.id === 'LOC-TEST-HIDDEN-CAVE');
  const note = await placeNote(cave, {scene, x: 10.4, y: 20.6});
  const page = playerJournal().pages.find(p => p.id === note.pageId);
  assert.equal(note.entryId, playerJournal().id);
  assert.equal(page.getFlag(MOD, 'locationId'), cave.id);
  assert.equal(note.text, '', 'no name leak for an unrevealed location');
  assert.equal(note.getFlag(MOD, 'locationId'), cave.id);
  assert.deepEqual([note.x, note.y], [10, 21]);
  as(player);
  assert.equal(page.testUserPermission(player, 'LIMITED'), false, 'Foundry hides the note from players');
  as(gm);
  await writeAll(sample.map(l => l.id === cave.id ? {...l, revealed: true} : l));
  assert.equal(scene.notes[0].text, '[TEST] Hidden Cave');
  assert.equal(page.testUserPermission(player, 'OBSERVER'), true);
  as(player);
  await assert.rejects(() => placeNote(cave, {scene, x: 0, y: 0}), /Only the GM/);
});

test('0.8.x journals are counted, not touched', () => {
  installFoundry();
  game.journal.push(new Journal({flags: {[MOD]: {role: 'source'}}}), new Journal({flags: {[MOD]: {role: 'map_registry'}}}));
  assert.equal(legacyJournalCount(), 2);
  assert.deepEqual(readAll(), [], 'old data is ignored, no crash');
});
