/** 0.65.0 Items → Assets: match file names before upload, per-file and bulk ticks, and the list of files that fit no record.
 *  Synthetic [TEST] records and mocked pickers. This proves the logic and the wiring in the source, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planAssetLinks, uploadFiles} from '../scripts/assets.js';
import {planCinderArt, cinderChoices, cinderCaps} from '../scripts/cinder-art.js';
import {classifyFiles, stageFiles, stageSummary, setFileUpload, setUnmatchedUpload, unmatchedTickState, uploadSelection, unmatchedInFolder, removalList, removalText,
  UPLOAD_UNMATCHED_BY_DEFAULT, STATUS} from '../scripts/asset-stage.js';

const GM = {isGM: true}, PLAYER = {isGM: false}, ROOT = 'worlds/test/art';
const npc = (id, name, extra = {}) => ({uuid: `Actor.${id}`, documentName: 'Actor', type: 'npc', name, sourceId: id, img: 'icons/svg/mystery-man.svg', tokenImg: 'icons/svg/mystery-man.svg', flags: {}, ...extra});
const mut = (id, name) => ({uuid: `Item.${id}`, documentName: 'Item', type: 'feat', name, sourceId: id, img: '', flags: {}});
const docs = [npc('NPC-TEST-ONE', '[TEST] Oren Vale'), npc('N2', 'Kira Dane'), npc('N3', 'Bo Vale'), npc('N4', 'Ila Vale'), mut('MUT-TEST-ECHO', 'Echo Cinder')];
const caps = {canDefinition: true};
const cinders = cinderChoices({docs, definitionOf: () => ({stages: null, world: null, bearers: 0})});
const file = name => ({name, size: 10});
/** What main.js does: plan the pseudo files, then classify them. */
const classify = (pseudo, world = docs, inUse = new Set()) => {
  const {rows: cinderRows, rest} = planCinderArt(pseudo, {user: GM, cinders, caps});
  const plan = planAssetLinks(world, rest);
  return classifyFiles(pseudo, {plan, cinderRows, inUse});
};
const stage = (names, opts = {}) => stageFiles(names.map(file), {user: GM, target: ROOT, classify: p => classify(p, opts.docs ?? docs), ...opts});
const statusOf = (out, name) => out.items.find(i => i.name === name)?.status;

test('classification: matched by id and by name, ambiguous for ties, unmatched for the rest, Cinder stage art matched', () => {
  const out = stage(['NPC-TEST-ONE.webp', 'kira_dane.png', 'vale.webp', 'Echo_Cinder_Stage_1.webp', 'Echo_Cinder_Stage_2.webp', 'random_holiday_photo.jpg', 'Echo_Cinder_Stage_9.webp']);
  assert.equal(statusOf(out, 'NPC-TEST-ONE.webp'), STATUS.matched);
  assert.equal(statusOf(out, 'kira_dane.png'), STATUS.matched);
  assert.equal(statusOf(out, 'vale.webp'), STATUS.ambiguous); // fits three Vales equally: needs a pick, not unmatched
  assert.equal(statusOf(out, 'Echo_Cinder_Stage_1.webp'), STATUS.matched);
  assert.equal(statusOf(out, 'Echo_Cinder_Stage_2.webp'), STATUS.matched);
  assert.equal(statusOf(out, 'random_holiday_photo.jpg'), STATUS.unmatched);
  assert.equal(statusOf(out, 'Echo_Cinder_Stage_9.webp'), STATUS.unmatched); // stage outside 1 to 5 is not used
  assert.match(out.items.find(i => i.name === 'Echo_Cinder_Stage_9.webp').reason, /outside 1 to 5/);
  assert.match(out.items.find(i => i.name === 'random_holiday_photo.jpg').reason, /No record fits/);
});

test('a file that fits a record only as a second choice, or is already a record image, is not unmatched', () => {
  const world = [npc('NPC-TEST-ONE', 'Oren Vale'), npc('N5', 'Mara Quill', {img: `${ROOT}/mara_quill.webp`, tokenImg: `${ROOT}/mara_quill.webp`})];
  const out = stage(['oren_vale.webp', 'oren.webp', 'mara_quill.webp'], {docs: world});
  assert.equal(statusOf(out, 'oren.webp'), STATUS.matched); // oren_vale.webp is the stronger fit for the same record; this one still fits it
  assert.equal(statusOf(out, 'mara_quill.webp'), STATUS.matched); // already Mara's image (linked counts as matched before upload)
  const files = ['oren_vale.webp', 'oren.webp', 'mara_quill.webp', 'zzz.webp'].map(n => ({name: n, path: `${ROOT}/${n}`}));
  const all = classify(files, world);
  assert.deepEqual(all.filter(f => f.status === STATUS.unmatched).map(f => f.name), ['zzz.webp']);
  assert.equal(all.find(f => f.name === 'mara_quill.webp').status, STATUS.linked); // already Mara's image: never listed for deleting
});

test('default: matched and ambiguous files are ticked, unmatched are NOT; the default is a single constant', () => {
  assert.equal(UPLOAD_UNMATCHED_BY_DEFAULT, false);
  const out = stage(['NPC-TEST-ONE.webp', 'vale.webp', 'nothing_like_it.png']);
  assert.deepEqual(out.items.map(i => [i.name, i.upload]), [['NPC-TEST-ONE.webp', true], ['vale.webp', true], ['nothing_like_it.png', false]]);
  const flipped = stage(['nothing_like_it.png'], {defaultUnmatched: true});
  assert.equal(flipped.items[0].upload, true); // the constant is only the default of this argument
  const src = fs.readFileSync(new URL('../scripts/asset-stage.js', import.meta.url), 'utf8');
  assert.equal((src.match(/UPLOAD_UNMATCHED_BY_DEFAULT = /g) ?? []).length, 1);
});

test('summary line: X files, Y matched, Z with no match; ambiguous shown as needing a pick', () => {
  const out = stage(['NPC-TEST-ONE.webp', 'kira_dane.png', 'vale.webp', 'a_nope.webp', 'b_nope.webp']);
  const sum = stageSummary(out.items);
  assert.equal(sum.line, '5 files: 2 matched, 1 needs a pick, 2 with no match.');
  assert.deepEqual([sum.total, sum.toUpload, sum.skipped, sum.unmatchedTicked], [5, 3, 2, 0]);
  assert.equal(stageSummary(stage(['NPC-TEST-ONE.webp']).items).line, '1 file: 1 matched, 0 with no match.');
});

test('per-file and bulk ticks; the bulk box reflects all / some / none', () => {
  const out = stage(['NPC-TEST-ONE.webp', 'a_nope.webp', 'b_nope.webp']);
  assert.equal(unmatchedTickState(out.items), 'none');
  const a = out.items.find(i => i.name === 'a_nope.webp');
  assert.equal(setFileUpload(out.items, a.id, true), true);
  assert.equal(setFileUpload(out.items, a.id, true), false); // no change
  assert.equal(unmatchedTickState(out.items), 'some');
  assert.equal(setUnmatchedUpload(out.items, true), 1); // only b changes
  assert.equal(unmatchedTickState(out.items), 'all');
  assert.equal(setUnmatchedUpload(out.items, false), 2);
  assert.equal(unmatchedTickState(out.items), 'none');
  assert.equal(out.items.find(i => i.name === 'NPC-TEST-ONE.webp').upload, true); // the bulk box never touches matched files
  assert.equal(setFileUpload(out.items, 'nope', true), false);
});

test('only the ticked files are sent; unticked unmatched files are skipped, not uploaded; nothing is sent when none is ticked', async () => {
  const out = stage(['NPC-TEST-ONE.webp', 'kira_dane.png', 'a_nope.webp']);
  const sel = uploadSelection(out.items, {user: GM});
  assert.deepEqual(sel.files.map(f => f.name), ['NPC-TEST-ONE.webp', 'kira_dane.png']);
  assert.deepEqual(sel.skipped, ['a_nope.webp']);
  const sent = [];
  const picker = {upload: async (source, target, f) => { sent.push(f.name); return {path: `${target}/${f.name}`}; }};
  const res = await uploadFiles(sel.files, {picker, source: 'data', target: ROOT, user: GM});
  assert.deepEqual(sent, ['NPC-TEST-ONE.webp', 'kira_dane.png']);
  assert.equal(res.results.filter(r => r.status === 'uploaded').length, 2);
  // none ticked
  for (const i of out.items) setFileUpload(out.items, i.id, false);
  const none = uploadSelection(out.items, {user: GM});
  assert.deepEqual(none.files, []);
  assert.equal(none.skipped.length, 3);
  // staging itself never touches the picker
  assert.equal(sent.length, 2);
  // ticking the unmatched file sends it as well
  const again = stage(['a_nope.webp']);
  setUnmatchedUpload(again.items, true);
  assert.deepEqual(uploadSelection(again.items, {user: GM}).files.map(f => f.name), ['a_nope.webp']);
});

test('staging: unusable files are rejected, existing names are flagged, and a player stages nothing', () => {
  const out = stageFiles([file('NPC-TEST-ONE.webp'), file('notes.txt'), file('.hidden.png'), file('NPC-TEST-ONE.webp')], {user: GM, target: ROOT, existing: ['npc-test-one.webp'], classify: p => classify(p)});
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].exists, true);
  assert.equal(out.rejected.length, 3);
  const denied = stageFiles([file('NPC-TEST-ONE.webp')], {user: PLAYER, target: ROOT, classify: p => classify(p)});
  assert.equal(denied.ok, false); assert.deepEqual(denied.items, []);
  assert.equal(uploadSelection(out.items, {user: PLAYER}).ok, false);
  assert.deepEqual(uploadSelection(out.items, {user: PLAYER}).files, []);
});

// ---------- files already in the library ----------
const lib = [
  {name: 'NPC-TEST-ONE.webp', path: `https://assets.test/u/${ROOT}/NPC-TEST-ONE.webp`, folder: ROOT},
  {name: 'old_photo.png', path: `https://assets.test/u/${ROOT}/old_photo.png`, folder: ROOT},
  {name: 'scene_backdrop.webp', path: `https://assets.test/u/${ROOT}/scene_backdrop.webp`, folder: ROOT},
  {name: 'kira_dane.webp', path: `https://assets.test/u/${ROOT}/kira_dane.webp`, folder: ROOT},
  {name: 'deep_unused.png', path: `https://assets.test/u/${ROOT}/sub/deep_unused.png`, folder: `${ROOT}/sub`},
  {name: 'Echo_Cinder_Stage_1.webp', path: `https://assets.test/u/${ROOT}/Echo_Cinder_Stage_1.webp`, folder: ROOT},
  {name: 'Echo_Cinder_Stage_2.webp', path: `https://assets.test/u/${ROOT}/Echo_Cinder_Stage_2.webp`, folder: ROOT}
];
const libClassified = (inUse = new Set(), world = docs) => classify(lib, world, inUse);

test('library: files that fit no record are listed for the folder being viewed only; matched, Cinder and in-use files are not', () => {
  const inUse = new Set([lib[2].path]); // a scene uses scene_backdrop
  const classified = libClassified(inUse);
  const byName = n => classified.find(f => f.name === n).status;
  assert.equal(byName('NPC-TEST-ONE.webp'), STATUS.matched);
  assert.equal(byName('kira_dane.webp'), STATUS.matched);
  assert.equal(byName('Echo_Cinder_Stage_1.webp'), STATUS.matched);
  assert.equal(byName('scene_backdrop.webp'), STATUS.linked);
  assert.equal(byName('old_photo.png'), STATUS.unmatched);
  const here = unmatchedInFolder(classified, {user: GM, target: ROOT});
  assert.deepEqual(here.files.map(f => f.name), ['old_photo.png']);
  assert.equal(here.below, 1); // deep_unused.png is counted, not listed
  assert.deepEqual(unmatchedInFolder(classified, {user: PLAYER, target: ROOT}), {files: [], below: 0});
});

test('a file that is already a record image is "linked" and never listed', () => {
  const world = [npc('NPC-TEST-ONE', 'Oren Vale', {img: lib[0].path, tokenImg: lib[0].path}), npc('N9', 'Zed Hound', {img: lib[1].path, tokenImg: 'x.webp'})];
  const classified = classify(lib, world);
  assert.equal(classified.find(f => f.name === 'NPC-TEST-ONE.webp').status, STATUS.linked);
  assert.equal(classified.find(f => f.name === 'old_photo.png').status, STATUS.linked); // Zed's portrait
  assert.ok(!unmatchedInFolder(classified, {user: GM, target: ROOT}).files.some(f => ['old_photo.png', 'NPC-TEST-ONE.webp'].includes(f.name)));
});

test('removal list: GM only, only unmatched files directly in the viewed folder; everything else is refused with a reason', () => {
  const classified = libClassified(new Set([lib[2].path]));
  const ask = [lib[1].path, lib[0].path, lib[2].path, lib[4].path, lib[5].path, 'https://assets.test/u/elsewhere/other.png', lib[1].path];
  const out = removalList(ask, classified, {user: GM, target: ROOT});
  assert.deepEqual(out.allowed.map(f => f.name), ['old_photo.png']);
  assert.equal(out.allowed[0].library, `${ROOT}/old_photo.png`);
  assert.equal(out.refused.length, 5); // duplicates collapse; matched, in use, below, Cinder, unknown
  const why = p => out.refused.find(r => r.path === p).why;
  assert.match(why(lib[0].path), /fits a record/i);
  assert.match(why(lib[5].path), /fits a record/i);
  assert.match(why(lib[2].path), /image of a record|used elsewhere/i);
  assert.match(why(lib[4].path), /outside the folder/i);
  assert.match(why('https://assets.test/u/elsewhere/other.png'), /Not one of the files/);
  // another folder is being viewed now: nothing from ROOT is allowed
  assert.deepEqual(removalList([lib[1].path], classified, {user: GM, target: 'worlds/test/other'}).allowed, []);
  // players get nothing
  const denied = removalList([lib[1].path], classified, {user: PLAYER, target: ROOT});
  assert.equal(denied.ok, false); assert.deepEqual(denied.allowed, []);
  assert.equal(removalText(out.allowed), `${ROOT}/old_photo.png`);
  assert.equal(removalText([]), '');
});

test('wiring: the drop and Choose files… stage instead of uploading; one primary; no delete call exists; Delete wording is honest', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  const tpl = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  assert.match(main, /if\(kind==='assets'\)return this\.#assetsStage\(files\)/);
  assert.match(main, /void this\.#assetsStage\(\[\.\.\.\(event\.dataTransfer/);
  assert.doesNotMatch(main, /#assetsUpload\(\[\.\.\.\(event\.dataTransfer/);
  assert.match(main, /uploadSelection\(st\.items,\{user:game\.user\}\)/); // the upload sends the ticked files only
  assert.match(tpl, /data-ag-assets-upload-go/);
  assert.match(tpl, /Upload unmatched files too/);
  assert.match(tpl, /Files with no match/);
  assert.match(tpl, /Unmatched files/);
  assert.match(tpl, /Keep in library/);
  assert.match(tpl, /ag-btn\{\{#unless assets\.hasStaged\}\} ag-btn--primary\{\{\/unless\}\}" data-ag-action="assets-link-apply"/); // one primary per view
  // Manager has no way to delete from the library, and says so rather than pretending
  for (const f of ['main.js', 'assets.js', 'asset-stage.js']) {
    const src = fs.readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\.(deleteFile|removeFile|deleteAsset|delete\()\s*\(?[^)]*(picker|FilePicker|assets)/i);
  }
  assert.doesNotMatch(tpl, /Delete from library/);
  assert.match(tpl, /do not let a module delete files/);
  // the classification helpers never call the network
  const stageSrc = fs.readFileSync(new URL('../scripts/asset-stage.js', import.meta.url), 'utf8');
  assert.doesNotMatch(stageSrc, /\bfetch\(|\.upload\(|\.browse\(/);
});
