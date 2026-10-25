/** 0.60.13 Items → Assets: Yes / No / Different… on every match. Synthetic [TEST]-style records and a mocked world.
 *  This proves the logic and the wiring in the source, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planAssetLinks, applyAssetLinks, linkableRecords, filterRecords, linkCounts, linkConflicts, setRowChoice, setAllChoices, assignRecord, resolvePick} from '../scripts/assets.js';

const M = 'ashen-gate-manager', GM = {isGM: true}, P = 'https://assets.test/u1/art/';
const f = name => ({name, path: `${P}${name}`});
const npc = (id, name, extra = {}) => ({uuid: `Actor.${id}`, documentName: 'Actor', type: 'npc', name, sourceId: id, img: 'icons/svg/mystery-man.svg', tokenImg: 'icons/svg/mystery-man.svg', flags: {}, ...extra});
const item = (id, name, extra = {}) => ({uuid: `Item.${id}`, documentName: 'Item', type: 'loot', name, sourceId: id, img: '', flags: {}, ...extra});
const byName = (plan, n) => plan.rows.find(r => r.name === n);
const world = docs => {
  const written = [], live = new Map(docs.map(d => [d.uuid, {...d, id: d.uuid.replace('.', '_'), prototypeToken: {texture: {src: d.tokenImg}}}]));
  return {written, getDoc: u => live.get(u) ?? null, updateMany: async (documentName, updates) => { written.push({documentName, updates}); }};
};

test('guesses start on Yes; set-in-Foundry starts on No; tie rows have nothing chosen', () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N2', 'Kira Dane', {img: 'worlds/w/mine.webp', tokenImg: 'worlds/w/mine.webp'}), npc('N3', 'Bo Vale'), npc('N4', 'Ila Vale')];
  const plan = planAssetLinks(docs, [f('oren_vale.webp'), f('kira_dane.webp'), f('vale.webp')]);
  assert.equal(byName(plan, 'Oren Vale').checked, true);
  assert.equal(byName(plan, 'Kira Dane').checked, false);
  const tie = plan.rows.find(r => r.needsPick);
  assert.equal(tie.checked, false);
  assert.equal(setRowChoice(tie, 'yes'), false); // Yes needs a pick first
  assert.equal(tie.checked, false);
});

test('Yes and No change only the row; Yes on a set-in-Foundry image is allowed because it is explicit', () => {
  const plan = planAssetLinks([npc('N2', 'Kira Dane', {img: 'worlds/w/mine.webp', tokenImg: 'worlds/w/mine.webp'})], [f('kira_dane.webp')]);
  const r = plan.rows[0];
  assert.equal(linkCounts(plan.rows).willLink, 0);
  setRowChoice(r, 'yes');
  assert.deepEqual(linkCounts(plan.rows), {willLink: 1, skipped: 0, conflicts: 0, undecided: 0});
  setRowChoice(r, 'no');
  assert.equal(linkCounts(plan.rows).skipped, 1);
});

test('Different…: every linkable record is listed, NPCs first, with kind chips and no ids; filtering is by name', () => {
  const docs = [item('M1', 'Iron Nails'), npc('N1', 'Oren Vale'), {...npc('N2', 'Zed Hound'), type: 'character'}, {uuid: 'Macro.X', documentName: 'Macro', name: 'Roll It', sourceId: 'MAC-1', img: '', flags: {}}, {...item('U', 'Unbound'), sourceId: ''}];
  const list = linkableRecords(docs);
  assert.deepEqual(list.map(r => [r.name, r.kindLabel]), [['Oren Vale', 'NPC'], ['Zed Hound', 'Actor'], ['Iron Nails', 'Item'], ['Roll It', 'Macro']]);
  assert.ok(list.every(r => !Object.values(r).some(v => /NPC-|MAC-|^N1$/.test(String(v)))));
  assert.deepEqual(filterRecords(list, 'vale').map(r => r.name), ['Oren Vale']);
  assert.deepEqual(filterRecords(list, 'item nails').map(r => r.name), ['Iron Nails']);
  assert.equal(filterRecords(list, '').length, 4);
});

test('Different… gives the row\'s file to another record, not only the guessed candidates, and updates both image columns', () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N5', 'Mara Quill', {img: `${P}old.webp`, tokenImg: `${P}old-token.webp`}), item('M1', 'Iron Nails')];
  const plan = planAssetLinks(docs, [f('oren_vale.webp')]);
  const row = plan.rows[0];
  assert.equal(row.uuid, 'Actor.N1');
  assignRecord(row, docs[1]); // Mara: image set in Foundry
  assert.equal(row.uuid, 'Actor.N5'); assert.equal(row.name, 'Mara Quill');
  assert.equal(row.from, `${P}old.webp`); assert.equal(row.fromToken, `${P}old-token.webp`); assert.equal(row.to, `${P}oren_vale.webp`);
  assert.equal(row.checked, false); assert.match(row.noteText, /Choose Yes/); assert.equal(row.reassigned, true);
  assignRecord(row, docs[2]); // an Item with a blank image: Yes
  assert.equal(row.uuid, 'Item.M1'); assert.equal(row.checked, true); assert.equal(row.documentName, 'Item');
  assert.equal(assignRecord({fileName: 'x.webp'}, docs[0]), null); // no file yet
});

test('Different… on a tie row works with a record that was not a candidate', () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N2', 'Kira Vale'), item('M1', 'Plain Chest')];
  const plan = planAssetLinks(docs, [f('vale.webp')]);
  const row = plan.rows[0];
  assert.equal(row.needsPick, true);
  assignRecord(row, docs[2]);
  assert.equal(row.needsPick, false); assert.equal(row.uuid, 'Item.M1'); assert.equal(row.to, `${P}vale.webp`); assert.equal(row.checked, true);
  assert.equal(linkCounts(plan.rows).willLink, 1);
});

test('a record that already shows the file is not ticked when chosen', () => {
  const doc = npc('N9', 'Tess Rook', {img: `${P}a.webp`, tokenImg: `${P}a.webp`});
  const row = planAssetLinks([npc('N1', 'Oren Vale')], [f('oren_vale.webp')]).rows[0];
  row.to = `${P}a.webp`;
  assignRecord(row, doc);
  assert.equal(row.checked, false); assert.match(row.noteText, /already shows/);
});

test('two files for one record are flagged on both rows, counted as skipped, and not applied twice', async () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N2', 'Kira Dane')];
  const plan = planAssetLinks(docs, [f('oren_vale.webp'), f('kira_dane.webp')]);
  assignRecord(byName(plan, 'Kira Dane'), docs[0]); // Kira's file now also goes to Oren
  const keys = linkConflicts(plan.rows);
  assert.equal(keys.size, 2);
  assert.deepEqual(linkCounts(plan.rows), {willLink: 0, skipped: 2, conflicts: 2, undecided: 0});
  const row = plan.rows.find(r => r.key === 'Actor.N2');
  setRowChoice(row, 'no'); // choosing resolves it
  assert.equal(linkConflicts(plan.rows).size, 0);
  assert.deepEqual(linkCounts(plan.rows), {willLink: 1, skipped: 1, conflicts: 0, undecided: 0});
  // backstop in the writer even if the UI were bypassed
  const w = world(docs);
  const a = {...planAssetLinks([docs[0]], [f('oren_vale.webp')]).rows[0]};
  const out = await applyAssetLinks([a, {...a, to: `${P}other.webp`}], {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany});
  assert.equal(out.applied.length, 1); assert.match(out.skipped[0].why, /already set/);
});

test('bulk: Yes to all matches skips set-in-Foundry images and unresolved picks; No to all; Reset (re-plan) restores the guesses', () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N2', 'Kira Dane', {img: 'worlds/w/mine.webp', tokenImg: 'worlds/w/mine.webp'}), npc('N3', 'Bo Vale'), npc('N4', 'Ila Vale')];
  const files = [f('oren_vale.webp'), f('kira_dane.webp'), f('vale.webp')];
  const plan = planAssetLinks(docs, files);
  setAllChoices(plan.rows, 'no');
  assert.equal(linkCounts(plan.rows).willLink, 0);
  setAllChoices(plan.rows, 'yes');
  assert.equal(byName(plan, 'Oren Vale').checked, true);
  assert.equal(byName(plan, 'Kira Dane').checked, false);
  assert.equal(plan.rows.find(r => r.needsPick).checked, false);
  assert.equal(linkCounts(plan.rows).undecided, 1);
  setRowChoice(byName(plan, 'Oren Vale'), 'no');
  const reset = planAssetLinks(docs, files); // what "Reset to guesses" does
  assert.equal(byName(reset, 'Oren Vale').checked, true);
});

test('a row that becomes Yes through Different… is written; Actors write only img and the token image; nothing before Link', async () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N5', 'Mara Quill')];
  const w = world(docs);
  const plan = planAssetLinks(docs, [f('oren_vale.webp')]);
  assignRecord(plan.rows[0], docs[1]);
  assert.equal(w.written.length, 0);
  const out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany});
  assert.equal(out.applied.length, 1);
  assert.deepEqual(w.written[0].updates, [{_id: 'Actor_N5', img: `${P}oren_vale.webp`, 'prototypeToken.texture.src': `${P}oren_vale.webp`}]);
  // changed since the preview is still skipped
  const w2 = world(docs); w2.getDoc('Actor.N5').img = 'worlds/w/changed.webp';
  const p2 = planAssetLinks(docs, [f('oren_vale.webp')]); assignRecord(p2.rows[0], docs[1]);
  const o2 = await applyAssetLinks(p2.rows, {user: GM, moduleId: M, getDoc: w2.getDoc, updateMany: w2.updateMany});
  assert.equal(o2.applied.length, 0); assert.match(o2.skipped[0].why, /changed since/);
});

test('a record-pick row: choosing a file then Different… is possible; before that it is not', () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N6', 'Pip Marsh')];
  const row = planAssetLinks([docs[0]], [f('oren_vale.webp'), f('Oren_Vale_alt.webp')]).rows[0];
  assert.equal(row.pickBy, 'record');
  assert.equal(assignRecord(row, docs[1]), null);
  resolvePick(row, `${P}oren_vale.webp`);
  assert.ok(assignRecord(row, docs[1]));
  assert.equal(row.uuid, 'Actor.N6');
});

// ---------- wiring in the source (not the live UI) ----------
const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
const hbs = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles/manager.css', import.meta.url), 'utf8');
const fold = hbs.slice(hbs.indexOf('data-ag-fold-key="assets-link"'), hbs.indexOf('data-ag-fold-key="assets-missing"'));
test('the table has Yes / No / Different…, a searchable picker, bulk buttons, the count line, labels, and no raw ids', () => {
  assert.match(fold, /data-ag-assets-choice="\{\{key\}\}" data-value="yes"/);
  assert.match(fold, /data-value="no"/);
  assert.match(fold, /data-ag-assets-different="\{\{key\}\}"/);
  assert.match(fold, /type="search" data-ag-assets-picker-q/);
  assert.match(fold, /Yes to all matches[\s\S]*No to all[\s\S]*Reset to guesses/);
  assert.match(fold, /\{\{assets\.linkCountLine\}\}/);
  assert.match(fold, /role="radiogroup" aria-label=/);
  assert.match(fold, /data-label="Image now"/);
  // 0.63.0: the tick boxes are the batch-wide "Turn on token ring"; rows still choose with Yes / No, never a checkbox.
  // 0.65.0: the Files with no match list has its own delete-list ticks; they are not part of the Yes / No table.
  assert.deepEqual(fold.match(/<input type="checkbox"[^>]*>/g).filter(t => !/nomatch-toggle/.test(t)).map(t => t.match(/data-ag-assets-[a-z-]+/)[0]), ['data-ag-assets-token-ring', 'data-ag-assets-scene-tokens', 'data-ag-assets-repair-scene']);
  assert.doesNotMatch(fold, /\{\{sourceId\}\}|\{\{uuid\}\}<|\{\{id\}\}/);
  assert.match(main, /linkCountLine:`\$\{counts\.willLink\+cinderWill\} will be linked, /);
  assert.match(main, /linkCanApply:counts\.willLink\+cinderWill>0&&!counts\.conflicts/);
  assert.match(css, /@container \(max-width:40rem\)\{[^}]*\.aglink thead/);
});
test('focus is put back after each re-render, and Link refuses while two rows share a record', () => {
  for (const sel of ['data-ag-assets-choice=', 'data-ag-assets-different=', 'data-ag-assets-picker-q=', 'data-ag-assets-bulk=']) assert.ok(main.includes(`focusAfterRender=\`[${sel}`) || main.includes(`?\`[${sel}`), sel);
  assert.match(main, /if\(blocked\.size\|\|cinderConflicts\(cinderAll\)\.size\)return say\(/);
  assert.match(main, /Escape/);
});
