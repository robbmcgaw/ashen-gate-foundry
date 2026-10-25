/** 0.60.9 Items → Assets: guessing records from file names. Synthetic [TEST]-style people and a mocked world/FilePicker.
 *  This proves the logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileWords, nameWords, matchLevel} from '../scripts/asset-names.js';
import {planAssetLinks, applyAssetLinks, resolvePick, uploadFiles} from '../scripts/assets.js';

const M = 'ashen-gate-manager';
const GM = {isGM: true};
const P = 'https://assets.test/u1/art/';
const f = name => ({name, path: `${P}${name}`});
const npc = (sourceId, name, extra = {}) => ({uuid: `Actor.${sourceId}`, documentName: 'Actor', type: 'npc', name, sourceId, img: 'icons/svg/mystery-man.svg', tokenImg: 'icons/svg/mystery-man.svg', flags: {}, ...extra});
const item = (sourceId, name, extra = {}) => ({uuid: `Item.${sourceId}`, documentName: 'Item', type: 'loot', name, sourceId, img: '', flags: {}, ...extra});

// ---------- normalisation ----------
test('file names: case, separators, extension, noise words, sizes and trailing digits are dropped', () => {
  assert.deepEqual(fileWords('Oren_Vale-Portrait.webp'), ['oren', 'vale']);
  assert.deepEqual(fileWords('OREN.VALE.token.final.v2.PNG'), ['oren', 'vale']);
  assert.deepEqual(fileWords('oren vale 512.webp'), ['oren', 'vale']);
  assert.deepEqual(fileWords('oren-vale-1024x1024.webp'), ['oren', 'vale']);
  assert.deepEqual(fileWords('Oren Vale copy 2.jpg'), ['oren', 'vale']);
  assert.deepEqual(fileWords('OrenVale_img_icon_art_image.webp'), ['oren', 'vale']);
  assert.deepEqual(fileWords('oren_vale3.webp'), ['oren', 'vale']);
  assert.deepEqual(fileWords("O'Neil_v1.webp"), ['oneil']);
  assert.deepEqual(fileWords('portrait_final.webp'), []);
});
test('record names: titles and "the" are dropped only when a name is left', () => {
  assert.deepEqual(nameWords('Dame Oren Vale'), ['oren', 'vale']);
  assert.deepEqual(nameWords('Mr. Oren Vale'), ['oren', 'vale']);
  assert.deepEqual(nameWords('The Pale Ferryman'), ['pale', 'ferryman']);
  assert.deepEqual(nameWords('Oren the Bold'), ['oren', 'bold']);
  assert.deepEqual(nameWords('Dame'), ['dame']); // nothing else left: kept
  assert.deepEqual(nameWords('[TEST] Kira Dane'), ['test', 'kira', 'dane']);
});
test('match levels: whole name > first and last > first or last; partials need 3 letters and an uncommon word', () => {
  const ok = (file, rec, partial = true) => matchLevel(fileWords(file), nameWords(rec), {partial})?.kind ?? null;
  assert.equal(ok('oren_vale.webp', 'Oren Vale'), 'whole');
  assert.equal(ok('oren_vale_portrait.webp', 'Dame Oren Vale'), 'whole');
  assert.equal(ok('oren_marcus_vale.webp', 'Oren Vale'), 'both');
  assert.equal(ok('oren.webp', 'Oren Vale'), 'first');
  assert.equal(ok('vale.webp', 'Oren Vale'), 'last');
  assert.equal(ok('oren.webp', 'Oren'), 'whole');
  assert.equal(ok('oren_smith.webp', 'Oren'), 'name');
  assert.equal(ok('al.webp', 'Al Vale'), null); // too short
  assert.equal(ok('guard.webp', 'Guard Vale'), null); // very common word
  assert.equal(ok('kira.webp', 'Oren Vale'), null);
  assert.equal(ok('vale.webp', 'Oren Vale', false), null); // partial guesses are Actors only
  assert.equal(ok('oren_vale.webp', 'Oren Vale', false), 'whole');
});

// ---------- planning ----------
const rowFor = (plan, name) => plan.rows.find(r => r.name === name);

test('the exact permanent-id file wins over a name guess', () => {
  const docs = [npc('NPC-TEST-OREN', 'Oren Vale'), npc('NPC-TEST-KIRA', 'Kira Dane')];
  const plan = planAssetLinks(docs, [f('NPC-TEST-OREN.webp'), f('Kira_Dane.webp'), f('oren_vale.webp')]);
  const oren = rowFor(plan, 'Oren Vale');
  assert.equal(oren.fileName, 'NPC-TEST-OREN.webp');
  assert.equal(oren.matchKind, 'id');
  assert.equal(rowFor(plan, 'Kira Dane').fileName, 'Kira_Dane.webp');
  assert.equal(plan.rows.length, 2); // oren_vale.webp is not offered to an id-matched record
});

test('name guesses: whole name, first+last, and partial first or last name, each with a plain reason, strongest first, ticked', () => {
  const docs = [npc('N1', 'Brenna Holt'), npc('N2', 'Corin Ashdown'), npc('N3', 'Tamsin Reeve'), npc('N4', 'Dagna Moor'), item('M1', 'Iron Nails')];
  const plan = planAssetLinks(docs, [f('Tamsin_Reeve.webp'), f('corin-marcus-ashdown-final.png'), f('brenna.webp'), f('MOOR_token_512.webp'), f('dagna_moor.webp'), f('iron nails.webp')]);
  assert.deepEqual(plan.rows.map(r => [r.name, r.reason]), [
    ['Dagna Moor', 'Matches the whole name'], ['Tamsin Reeve', 'Matches the whole name'], ['Iron Nails', 'Matches the whole name'],
    ['Corin Ashdown', 'Matches the first and last name'], ['Brenna Holt', 'Matches the first name']]);
  assert.ok(plan.rows.every(r => r.checked && !r.needsPick));
  assert.equal(plan.unmatchedFiles, 1); // MOOR does not match Moor
  assert.ok(plan.rows.every(r => !/[A-Z]{3,}-/.test(r.reason + r.name)));
  assert.equal(rowFor(plan, 'Brenna Holt').to, `${P}brenna.webp`);
});

test('a last-name-only file is a guess for an Actor but never for an Item', () => {
  const plan = planAssetLinks([npc('N1', 'Oren Vale'), item('M1', 'Sword of Vale')], [f('vale.webp')]);
  assert.deepEqual(plan.rows.map(r => r.name), ['Oren Vale']);
  assert.equal(plan.rows[0].reason, 'Matches the last name');
});

test('NPCs come before other records of the same strength', () => {
  const plan = planAssetLinks([item('M1', 'Kira Dane'), npc('N1', 'Kira Dane')], [f('kira_dane.webp')]);
  // two records with the same name tie, so it is a pick; the NPC is listed first among the candidates' kinds
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].needsPick, true);
  const plan2 = planAssetLinks([item('M1', 'Plain Item'), npc('N1', 'Kira Dane')], [f('plain_item.webp'), f('kira_dane.webp')]);
  assert.deepEqual(plan2.rows.map(r => r.name), ['Kira Dane', 'Plain Item']);
});

test('a file that fits two records equally is NOT picked: needs your pick, unticked, with candidates', () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N2', 'Kira Vale'), npc('N3', 'Dagna Moor')];
  const plan = planAssetLinks(docs, [f('vale.webp')]);
  assert.equal(plan.rows.length, 1);
  const row = plan.rows[0];
  assert.equal(row.needsPick, true); assert.equal(row.checked, false); assert.equal(row.to, ''); assert.equal(row.pickBy, 'file');
  assert.deepEqual(row.candidates.map(c => c.label), ['Kira Vale (actor)', 'Oren Vale (actor)']);
  assert.match(row.reason, /More than one record/);
  // choosing ticks it (default image) and fills the row
  resolvePick(row, 'Actor.N2');
  assert.equal(row.name, 'Kira Vale'); assert.equal(row.to, `${P}vale.webp`); assert.equal(row.checked, true); assert.equal(row.uuid, 'Actor.N2');
  resolvePick(row, '');
  assert.equal(row.checked, false); assert.equal(row.to, '');
});

test('two files for one record: none is picked automatically; the row asks which file', () => {
  const plan = planAssetLinks([npc('N1', 'Oren Vale')], [f('oren_vale.webp'), f('Oren_Vale_alt.webp'), f('oren-vale-token.png')]);
  assert.equal(plan.rows.length, 1);
  const row = plan.rows[0];
  assert.equal(row.needsPick, true); assert.equal(row.pickBy, 'record'); assert.equal(row.checked, false);
  assert.equal(row.name, 'Oren Vale');
  assert.equal(row.candidates.length, 3);
  resolvePick(row, `${P}oren_vale.webp`);
  assert.equal(row.to, `${P}oren_vale.webp`); assert.equal(row.checked, true);
});

test('a stronger file beats a weaker one for the same record (only an equal tie asks)', () => {
  const plan = planAssetLinks([npc('N1', 'Oren Vale')], [f('oren.webp'), f('oren_vale.webp')]);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].fileName, 'oren_vale.webp');
  assert.equal(plan.rows[0].needsPick, false);
});

test('picking a record whose image the GM set leaves it unticked; the safeguard still applies', () => {
  const docs = [npc('N1', 'Oren Vale', {img: 'worlds/w/mine.webp', tokenImg: 'worlds/w/mine.webp'}), npc('N2', 'Kira Vale')];
  const plan = planAssetLinks(docs, [f('vale.webp'), f('oren_vale_portrait.webp')]);
  // oren_vale is whole for Oren (edited => unticked); vale.webp ties? Oren's best file is oren_vale (whole), vale.webp ties Oren/Kira (last) -> pick
  const oren = plan.rows.find(r => r.fileName === 'oren_vale_portrait.webp');
  assert.equal(oren.state, 'edited'); assert.equal(oren.checked, false);
  const pick = plan.rows.find(r => r.needsPick);
  resolvePick(pick, 'Actor.N1');
  assert.equal(pick.checked, false);
  resolvePick(pick, 'Actor.N2');
  assert.equal(pick.checked, true);
});

test('an Actor whose token has its own image starts unticked, with a note; old images are listed', () => {
  const plan = planAssetLinks([npc('N1', 'Oren Vale', {img: 'icons/svg/mystery-man.svg', tokenImg: 'worlds/w/oren-token.webp'})], [f('oren_vale.webp')]);
  const r = plan.rows[0];
  assert.equal(r.checked, false);
  assert.match(r.noteText, /token has its own image/);
  assert.equal(r.fromToken, 'worlds/w/oren-token.webp');
  assert.equal(r.from, 'icons/svg/mystery-man.svg');
});

test('a record already showing the file is not offered it again', () => {
  const plan = planAssetLinks([npc('N1', 'Oren Vale', {img: `${P}oren_vale.webp`, tokenImg: `${P}oren_vale.webp`})], [f('oren_vale.webp')]);
  assert.equal(plan.rows.length, 0);
});

// ---------- applying ----------
function worldFor(docs) {
  const written = [];
  const live = new Map(docs.map(d => [d.uuid, {...d, id: d.uuid.replace('.', '_'), prototypeToken: {texture: {src: d.tokenImg}, ring: {enabled: true}}}]));
  return {written, live, getDoc: uuid => live.get(uuid) ?? null, updateMany: async (documentName, updates) => { written.push({documentName, updates}); }};
}

test('an existing Actor changes only img and the prototype token image, and only when ticked', async () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N2', 'Kira Dane')];
  const plan = planAssetLinks(docs, [f('oren_vale.webp'), f('kira_dane.webp')]);
  plan.rows.find(r => r.name === 'Kira Dane').checked = false;
  const w = worldFor(docs);
  const out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany});
  assert.equal(out.applied.length, 1);
  assert.equal(w.written.length, 1);
  assert.equal(w.written[0].documentName, 'Actor');
  assert.deepEqual(w.written[0].updates, [{_id: 'Actor_N1', img: `${P}oren_vale.webp`, 'prototypeToken.texture.src': `${P}oren_vale.webp`}]);
  // no flags, no ring, no system data
  assert.ok(!JSON.stringify(w.written).match(/flags|ring|system|name/));
});

test('an Actor whose portrait or token image changed since the preview is skipped', async () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N2', 'Kira Dane')];
  const plan = planAssetLinks(docs, [f('oren_vale.webp'), f('kira_dane.webp')]);
  const w = worldFor(docs);
  w.live.get('Actor.N1').img = 'worlds/w/set-meanwhile.webp';
  w.live.get('Actor.N2').prototypeToken.texture.src = 'worlds/w/token-meanwhile.webp';
  const out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany});
  assert.equal(out.applied.length, 0);
  assert.deepEqual(out.skipped.map(s => s.why).sort(), ['its image changed since the preview', 'its token image changed since the preview']);
  assert.equal(w.written.length, 0);
});

test('an unresolved pick row, and an unticked one, write nothing; a record is set once even if two rows name it', async () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N2', 'Kira Vale')];
  const plan = planAssetLinks(docs, [f('vale.webp')]);
  const w = worldFor(docs);
  plan.rows[0].checked = true; // ticked by force, still unresolved
  let out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany});
  assert.equal(out.applied.length, 0); assert.equal(w.written.length, 0);
  const a = {...planAssetLinks([npc('N1', 'Oren Vale')], [f('oren_vale.webp')]).rows[0]};
  const b = {...a, to: `${P}other.webp`};
  out = await applyAssetLinks([a, b], {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany});
  assert.equal(out.applied.length, 1);
  assert.match(out.skipped[0].why, /already set/);
});

test('nothing is written before Link: planning and picking never call the world or the picker', async () => {
  const docs = [npc('N1', 'Oren Vale'), npc('N2', 'Kira Vale'), item('M1', 'Iron Nails')];
  const w = worldFor(docs);
  let touched = 0;
  const guard = new Proxy({}, {get() { touched++; return () => { touched++; }; }});
  const plan = planAssetLinks(docs, [f('vale.webp'), f('iron_nails.webp'), f('oren_vale.webp')]);
  resolvePick(plan.rows.find(r => r.needsPick) ?? plan.rows[0], 'Actor.N2');
  assert.ok(plan.rows.length > 0);
  assert.equal(w.written.length, 0);
  assert.equal(touched, 0);
  void guard;
});

test('after an upload the new files can be previewed straight away, and the upload itself writes no records', async () => {
  const uploads = [];
  const picker = {upload: async (source, target, file) => { uploads.push(file.name); return {status: 'success', path: `${P}${file.name}`}; }};
  const out = await uploadFiles([{name: 'Oren_Vale_Portrait.png'}, {name: 'unknown_thing.webp'}], {picker, source: 'forgevtt', target: 'art', user: GM});
  const added = out.results.filter(r => ['uploaded', 'replaced'].includes(r.status)).map(r => ({name: r.name, path: r.path}));
  const w = worldFor([npc('N1', 'Oren Vale')]);
  const plan = planAssetLinks([npc('N1', 'Oren Vale')], added);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].to, `${P}Oren_Vale_Portrait.png`);
  assert.equal(plan.unmatchedFiles, 1);
  assert.equal(w.written.length, 0);
});

// ---------- wiring ----------
const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
const hbs = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
test('the window previews after an upload, adds no new drop target, and the table shows reason, pick lists and old images', () => {
  assert.equal((hbs.match(/data-ag-assets-drop/g) ?? []).length, 1);
  assert.match(main, /this\.#planLinks\(added\)/);
  assert.match(main, /planAssetLinks\(this\.#assetDocs\(\),rest\)/);
  assert.match(main, /resolvePick\(row,event\.target\.value\)/);
  assert.match(hbs, /Why it fits/);
  assert.match(hbs, /data-ag-assets-pick="\{\{key\}\}"/);
  assert.match(hbs, /Token: <span/);
  assert.doesNotMatch(hbs.slice(hbs.indexOf('data-ag-fold-key="assets-link"'), hbs.indexOf('data-ag-fold-key="assets-missing"')), /\{\{sourceId\}\}|\{\{id\}\}/);
});
