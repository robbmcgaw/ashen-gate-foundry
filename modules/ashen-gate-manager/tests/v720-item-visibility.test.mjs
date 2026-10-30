/** 0.72.0: Items are GM-only by default; hide/release by folder. Mocked Foundry data only: proves the rules, not the live UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialOwnership, releasable, playerVisible, setItemsPolicy, getItemsPolicy, previewRelease, LEVEL, BASELINE_FLAG, MODULE_ID} from '../scripts/release.js';
import {planVisibility, applyVisibility, hideable, releasableByChoice, visibilityUpdate, folderPathOf} from '../scripts/item-visibility.js';
import {readGmSetupForm, saveGmSetup} from '../scripts/gm-setup.js';

const GM = {isGM: true}, PLAYER = {isGM: false};
const approved = (entityType = 'Item', over = {}) => ({status: 'approved', visibility: 'player', entityType, sourceId: `${entityType.toUpperCase()}-X`, ...over});
const folder = (name, parent = null) => ({name, folder: parent});
const item = (id, name, src, {def = 2, f = null, flags = {}, own = {}} = {}) => ({documentName: 'Item', id, uuid: `Item.${id}`, name, folder: f, ownership: {default: def, ...own}, flags, src});
const sourceOf = d => d.src;

test('default policy gm: new Items are created hidden; Journals, Actors and handout Items keep the 0.55.0 rule', () => {
  setItemsPolicy('gm');
  assert.equal(getItemsPolicy(), 'gm');
  assert.equal(initialOwnership({status: 'approved', visibility: 'player', entityType: 'Recipe'}, 'Item', LEVEL), LEVEL.NONE);
  assert.equal(initialOwnership({status: 'approved', visibility: 'player', entityType: 'Item'}, 'Item', LEVEL), LEVEL.NONE);
  assert.equal(initialOwnership({status: 'approved', visibility: 'player', entityType: 'HandoutItem'}, 'Item', LEVEL), LEVEL.OBSERVER);
  assert.equal(initialOwnership({status: 'approved', visibility: 'player', entityType: 'Handout'}, 'JournalEntry', LEVEL), LEVEL.OBSERVER);
  assert.equal(initialOwnership({status: 'approved', visibility: 'player', entityType: 'NPC'}, 'Actor', LEVEL), LEVEL.OBSERVER);
  assert.equal(initialOwnership({status: 'draft', visibility: 'player', entityType: 'HandoutItem'}, 'Item', LEVEL), LEVEL.NONE);
});

test('policy player is exactly the 0.55.0 rule', () => {
  setItemsPolicy('player');
  assert.equal(initialOwnership({status: 'approved', visibility: 'player', entityType: 'Recipe'}, 'Item', LEVEL), LEVEL.OBSERVER);
  assert.equal(initialOwnership({status: 'approved', visibility: 'gm', entityType: 'Recipe'}, 'Item', LEVEL), LEVEL.NONE);
});

test('an update never raises an Item under the gm policy, but still raises a handout Item', () => {
  setItemsPolicy('gm');
  const doc = o => ({documentName: 'Item', ownership: {default: 0}, flags: {}, ...o});
  assert.equal(releasable(doc(), approved('Recipe'), LEVEL), false);
  assert.equal(releasable(doc(), approved('HandoutItem'), LEVEL), true);
  assert.equal(releasable({documentName: 'JournalEntry', ownership: {default: 0}, flags: {}}, approved('Handout'), LEVEL), true);
  setItemsPolicy('player');
  assert.equal(releasable(doc(), approved('Recipe'), LEVEL), true);
});

test('the Release tool and Pre-session check do not count GM-only Items as hidden player records', () => {
  setItemsPolicy('gm');
  const docs = [item('a', 'Rope', approved('Item'), {def: 0}), {documentName: 'JournalEntry', id: 'j', name: 'J', ownership: {default: 0}, flags: {}, src: approved('Handout')}];
  const p = previewRelease(docs, sourceOf, LEVEL);
  assert.equal(p.total, 1); assert.equal(p.targets[0].documentName, 'JournalEntry');
  assert.equal(playerVisible(approved('Item'), 'Item'), false);
});

test('Hide: groups by folder, skips handouts and hidden Items, keeps the rest ticked; update shape touches only the default and the baseline', () => {
  const ag = folder('Ashen Gate'), prof = folder('Professions', ag), sand = folder('Sandbox', ag);
  const docs = [
    item('1', 'Recipe: Bead', approved('Recipe'), {f: prof}), item('2', 'Rope', approved('Item'), {f: prof}),
    item('3', 'Stag Pelt', approved('Item'), {f: sand}), item('4', 'Already hidden', approved('Item'), {def: 0, f: sand}),
    item('5', 'Handout twin', approved('HandoutItem'), {f: sand}), item('6', 'Loose', approved('Item'), {f: null}),
    {documentName: 'Actor', id: 'z', uuid: 'Actor.z', name: 'Orc', ownership: {default: 2}, flags: {}, src: approved('NPC')}
  ];
  const plan = planVisibility('hide', docs, sourceOf, LEVEL);
  assert.equal(plan.total, 4); assert.equal(plan.keptHandouts, 1);
  assert.deepEqual(plan.groups.map(g => [g.label, g.items.length]), [['(no folder)', 1], ['Ashen Gate / Professions', 2], ['Ashen Gate / Sandbox', 1]]);
  assert.deepEqual(visibilityUpdate('hide', docs[0], LEVEL), {_id: '1', 'ownership.default': 0, [`flags.${MODULE_ID}.${BASELINE_FLAG}`]: 0});
  assert.equal(folderPathOf(prof), 'Ashen Gate / Professions');
});

test('Hide applies only the ticked Items, only for a GM, in chunks, and a second run changes nothing', async () => {
  setItemsPolicy('gm');
  const docs = Array.from({length: 120}, (_, i) => item(`i${i}`, `Item ${i}`, approved('Item'), {own: i === 3 ? {USER1: 3} : {}}));
  const plan = planVisibility('hide', docs, sourceOf, LEVEL);
  const selected = new Set(plan.groups.flatMap(g => g.items).filter(i => i.id !== 'i0').map(i => i.uuid));
  const writes = [];
  const write = async updates => { writes.push(updates.length); for (const u of updates) { const d = docs.find(x => x.id === u._id); d.ownership.default = u['ownership.default']; d.flags[MODULE_ID] = {[BASELINE_FLAG]: u[`flags.${MODULE_ID}.${BASELINE_FLAG}`]}; } };
  await assert.rejects(applyVisibility(plan, selected, {user: PLAYER, sourceOf, write}), /Only a GM/);
  const out = await applyVisibility(plan, selected, {user: GM, sourceOf, write, yieldToUI: async () => {}});
  assert.equal(out.changed, 119); assert.deepEqual(writes, [50, 50, 19]);
  assert.equal(docs[0].ownership.default, 2, 'the unticked Item is untouched');
  assert.equal(docs[3].ownership.USER1, 3, 'a per-player permission is untouched'); assert.equal(docs[3].ownership.default, 0);
  assert.equal(docs[1].flags[MODULE_ID][BASELINE_FLAG], 0, 'the baseline follows, so Manager does not read it as a GM edit');
  const again = await applyVisibility(plan, selected, {user: GM, sourceOf, write, yieldToUI: async () => {}});
  assert.equal(again.changed, 0); assert.match(again.message, /changed since the preview|Nothing/);
});

test('Hide skips an Item the GM changed after the preview, and stops between chunks when aborted', async () => {
  const docs = Array.from({length: 120}, (_, i) => item(`i${i}`, `Item ${i}`, approved('Item')));
  const plan = planVisibility('hide', docs, sourceOf, LEVEL);
  docs[5].ownership.default = 0;
  const ctl = new AbortController(); let n = 0;
  const out = await applyVisibility(plan, new Set(plan.groups.flatMap(g => g.items).map(i => i.uuid)), {user: GM, sourceOf, yieldToUI: async () => {}, signal: ctl.signal,
    write: async u => { n++; for (const x of u) docs.find(d => d.id === x._id).ownership.default = 0; ctl.abort(); }});
  assert.equal(out.cancelled, true); assert.equal(n, 1); assert.equal(out.skipped, 1); assert.match(out.message, /Stopped after 50/);
});

test('Release by choice: approved player-visible hidden Items only; ignores a "hidden on purpose" baseline; never drafts, GM-only or archived', async () => {
  setItemsPolicy('gm');
  const f = folder('Recipes');
  const docs = [
    item('1', 'Recipe: A', approved('Recipe'), {def: 0, f}),
    item('2', 'Recipe: B', approved('Recipe'), {def: 0, f, flags: {[MODULE_ID]: {[BASELINE_FLAG]: 2}}}),
    item('3', 'Draft', approved('Recipe', {status: 'draft'}), {def: 0, f}), item('4', 'GM only', approved('Recipe', {visibility: 'gm'}), {def: 0, f}),
    item('5', 'Archived', approved('Recipe'), {def: 0, f, flags: {[MODULE_ID]: {lifecycle: {archived: true}}}}), item('6', 'Visible', approved('Recipe'), {def: 2, f})];
  const plan = planVisibility('release', docs, sourceOf, LEVEL);
  assert.deepEqual(plan.groups[0].items.map(i => i.id), ['1', '2']);
  const write = async updates => { for (const u of updates) { const d = docs.find(x => x.id === u._id); d.ownership.default = u['ownership.default']; } };
  const out = await applyVisibility(plan, new Set(['Item.1']), {user: GM, sourceOf, write, yieldToUI: async () => {}});
  assert.equal(out.changed, 1); assert.equal(docs[0].ownership.default, 2); assert.equal(docs[1].ownership.default, 0);
  assert.equal(hideable(docs[0], sourceOf(docs[0]), LEVEL), true); assert.equal(releasableByChoice(docs[0], sourceOf(docs[0]), LEVEL), false);
});

test('GM Setup: the setting is read from the form, saved only when changed, GM only', async () => {
  const sel = {value: 'player'};
  const form = readGmSetupForm({querySelector: s => s === '[data-ag-setup-items]' ? sel : null, querySelectorAll: () => []});
  assert.equal(form.itemsReadable, 'player');
  const store = {itemsReadable: 'gm'}, saved = [];
  const game = {user: GM, settings: {get: (m, k) => store[k], set: async (m, k, v) => { store[k] = v; saved.push(v); }}};
  const out = await saveGmSetup({itemsReadable: 'player'}, {game, moduleId: MODULE_ID, codexAccessKey: 'codex', itemsKey: 'itemsReadable'});
  assert.deepEqual(saved, ['player']); assert.match(out.message, /readable by players/);
  await saveGmSetup({itemsReadable: 'player'}, {game, moduleId: MODULE_ID, codexAccessKey: 'codex', itemsKey: 'itemsReadable'});
  assert.equal(saved.length, 1);
  await assert.rejects(saveGmSetup({itemsReadable: 'gm'}, {game: {...game, user: PLAYER}, moduleId: MODULE_ID, codexAccessKey: 'codex', itemsKey: 'itemsReadable'}), /Only the GM/);
});

test('wiring and version', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(main, /register\(MODULE_ID,ITEMS_READABLE_SETTING,\{[^}]*scope:"world"[^}]*default:"gm"/);
  assert.match(main, /entityType:record\.entity_type/);
  assert.match(main, /applyVisibility\(v,v\.selected/);
  assert.match(main, /confirmDanger\(`Hide \$\{n\} items from players\?/);
  const tpl = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  assert.match(tpl, /data-ag-setup-items/); assert.match(tpl, /Hide items from players…/); assert.match(tpl, /Release items to players…/);
  const m = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
  assert.equal(m.version, '0.85.4'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.85.4/ashen-gate-manager.zip'));
  assert.match(fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), /^## 0\.72\.0 /m);
});
