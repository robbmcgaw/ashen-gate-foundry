/** 0.47.0 smart icons: matching, determinism, placeholder rules, never overwriting authored or GM icons, the index
 *  builder (mocked FilePicker browse, caps, cache, failure) and Improve icons. Synthetic [TEST] data; mocked Foundry:
 *  proves the logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createIconIndex, resolveIcon, recordIconInput, documentIconInput, isPlaceholderIcon, isProtectedIcon, iconState,
  chooseImportIcon, pickRecordIcon, existingIconDecision, managerAssignedIcon, plannerIcon, iconFlagUpdate, browseIconFolders,
  createIconIndexer, filePickerClass, wantsSmartIcon, tokenize, wordForms, ICON_INDEX_KEY, ICON_INDEX_VERSION, packIndex, unpackIndex} from '../scripts/smart-icons.js';
import {ICON_CONCEPTS} from '../scripts/icon-keywords.js';
import {scanIconDocuments, applyIconChanges, undoIconChanges, iconBackup} from '../scripts/icon-improve.js';
import {localEdits} from '../scripts/workflows.js';
import {FAKE_ICONS, fakeTree} from './fixtures/smart-icons-fixture.mjs';

const M = 'ashen-gate-manager';
const item = (name, extra = {}) => ({id: `MAT-TEST-${name.replace(/[^A-Za-z]+/g, '-').toUpperCase()}`, entity_type: 'Material',
  foundry: {document_type: 'Item', data: {name, type: 'loot', ...extra}}});
const index = createIconIndex(FAKE_ICONS);

test('0.47.0: names find a logically fitting icon, with a reason and a confidence', () => {
  const cases = [
    ['[TEST] Iron Caltrops', /^icons\/environment\/traps\/caltrops/, 'trap'],
    ['[TEST] Healing Draught', /^icons\/consumables\/potions\//, 'potion'],
    ['[TEST] Moorland Herb Bundle', /^icons\/(consumables\/plants|commodities\/flowers)\//, 'herb'],
    ['[TEST] Oak Shield', /^icons\/equipment\/shield\//, 'shield'],
    ['[TEST] Brass Lantern', /^icons\/sundries\/lights\//, 'light'],
  ];
  for (const [name, path, concept] of cases) {
    const out = resolveIcon(recordIconInput(item(name)), index);
    assert.ok(out, name);
    assert.match(out.img, path, name);
    assert.equal(out.reason, `matched: ${concept}`, name);
    assert.ok(['high', 'medium', 'low'].includes(out.confidence));
  }
  // The head noun wins over a material word: an iron trap, not an ingot; an oak shield, not a log.
  assert.notEqual(resolveIcon(recordIconInput(item('[TEST] Iron Caltrops')), index).concept, 'metal');
  assert.equal(resolveIcon(recordIconInput(item('[TEST] Oak Shield')), index).concept, 'shield');
  // Prefers .webp and an un-numbered file over sword-guard-02 / .png duplicates.
  assert.equal(resolveIcon(recordIconInput(item('[TEST] Longsword', {type: 'weapon'})), index).img, 'icons/weapons/swords/sword-guard.webp');
  // Kind is the last resort; nothing at all gives null (the caller then uses the generic category icon).
  const byKind = resolveIcon(recordIconInput(item('[TEST] Zorblat', {type: 'weapon'})), index);
  assert.match(byKind.img, /^icons\/weapons\//); assert.equal(byKind.confidence, 'low'); assert.match(byKind.reason, /kind: sword/);
  assert.equal(resolveIcon(recordIconInput({id: 'X-TEST-1', entity_type: 'Thing', foundry: {document_type: 'JournalEntry', data: {name: '[TEST] Zorblat'}}}), index), null);
  assert.equal(resolveIcon(recordIconInput(item('[TEST] Healing Draught')), null), null, 'no index, no pick');
  // Never picks placeholder art from icons/svg.
  assert.ok(!index.files.some(f => /icons\/svg\//.test(f.path)));
});

test('0.47.0: words fold plurals and drop [TEST] tags and stop words', () => {
  assert.deepEqual(tokenize('[TEST] The Iron Caltrops x2'), ['iron', 'caltrops']);
  assert.ok(wordForms('caltrops').includes('caltrop'));
  assert.ok(wordForms('leaves').includes('leaf'));
  assert.ok(wordForms('berries').includes('berry'));
  assert.equal(new Set(ICON_CONCEPTS.map(c => c.id)).size, ICON_CONCEPTS.length, 'concept ids are unique');
  for (const c of ICON_CONCEPTS) for (const w of c.words) assert.equal(w, w.toLowerCase(), `${c.id}: ${w}`);
});

test('0.47.0: deterministic: the same record always gets the same icon, whatever order the files were listed in', () => {
  const record = item('[TEST] Healing Draught');
  const first = resolveIcon(recordIconInput(record), index).img;
  for (let i = 0; i < 5; i++) {
    const shuffled = [...FAKE_ICONS].sort(() => Math.random() - 0.5);
    assert.equal(resolveIcon(recordIconInput(record), createIconIndex(shuffled)).img, first);
  }
  // Equally good icons are shared out by permanent id, so a set of potions does not all get one icon.
  const picks = new Set(Array.from({length: 12}, (_, i) => resolveIcon(recordIconInput({...record, id: `MAT-TEST-POTION-${i}`}), index).img));
  assert.ok(picks.size > 1, 'tied icons are spread over records');
});

test('0.47.0: placeholder, protected and authored icons are told apart', () => {
  for (const p of [undefined, null, '', '  ', 'icons/svg/mystery-man.svg', 'icons/svg/item-bag.svg', 'icons/svg/mystery-man-black.svg',
    'icons/svg/d20-grey.svg', 'icons/svg/dice-target.svg', '/icons/svg/item-bag.svg', 'modules/ashen-gate-manager/assets/icons/material.svg',
    'systems/dnd5e/icons/svg/items/weapon.svg']) assert.equal(isPlaceholderIcon(p), true, String(p));
  for (const p of ['icons/sundries/scrolls/scroll-bound-brown.webp', 'icons/svg/fire.svg', 'icons/svg/book.svg', 'modules/other/assets/icons/x.svg',
    'systems/dnd5e/icons/skills/blood_09.jpg']) assert.equal(isPlaceholderIcon(p), false, p);
  for (const p of ['https://example.test/a.webp', '//cdn.test/a.png', 'data:image/png;base64,AAA', 'assets/art/x.webp', 'worlds/test/art/x.webp'])
    assert.equal(isProtectedIcon(p), true, p);
  assert.equal(iconState(''), 'missing');
  assert.equal(iconState('icons/svg/item-bag.svg'), 'placeholder');
  assert.equal(iconState('assets/x.webp'), 'protected');
  assert.equal(iconState('icons/sundries/scrolls/scroll-bound-brown.webp'), 'authored');
  assert.equal(wantsSmartIcon(item('[TEST] A')), true);
  assert.equal(wantsSmartIcon(item('[TEST] A', {img: 'icons/svg/item-bag.svg'})), true);
  assert.equal(wantsSmartIcon(item('[TEST] A', {img: 'icons/sundries/scrolls/scroll-bound-brown.webp'})), false);
});

test('0.47.0: on import an authored icon is kept exactly (repeated generic ones too); only missing, placeholder or 404 ones are chosen', async () => {
  const probe404 = async () => 404, probeOk = async () => 200;
  const brown = 'icons/sundries/scrolls/scroll-bound-brown.webp';
  assert.deepEqual(await chooseImportIcon(item('[TEST] Healing Draught', {img: brown}), {index, probe: probeOk}), {img: brown, reason: 'authored', source: 'authored'});
  assert.equal(pickRecordIcon(item('[TEST] Healing Draught', {img: brown}), {index}), null, 'the preview has nothing to pick');
  // Remote and world-owned paths are never probed or replaced.
  let probed = 0;
  const counting = async () => { probed++; return 404; };
  for (const img of ['https://example.test/missing.webp', 'assets/missing.webp', 'worlds/test/missing.webp']) {
    const out = await chooseImportIcon(item('[TEST] Healing Draught', {img}), {index, probe: counting});
    assert.equal(out.img, img); assert.equal(out.source, 'authored');
  }
  assert.equal(probed, 0);
  // A local authored file that answers 404 gets a smart pick, keeping the original for the report.
  const missing = await chooseImportIcon(item('[TEST] Healing Draught', {img: 'icons/gone/old.webp'}), {index, probe: probe404});
  assert.equal(missing.source, 'smart'); assert.match(missing.img, /potions/); assert.equal(missing.original, 'icons/gone/old.webp');
  // A probe that fails is not proof the file is missing.
  const unsure = await chooseImportIcon(item('[TEST] Healing Draught', {img: 'icons/maybe.webp'}), {index, probe: async () => { throw new Error('offline'); }});
  assert.equal(unsure.img, 'icons/maybe.webp');
  // Missing and placeholder icons are chosen.
  assert.equal((await chooseImportIcon(item('[TEST] Oak Shield'), {index})).source, 'smart');
  const bag = await chooseImportIcon(item('[TEST] Oak Shield', {img: 'icons/svg/item-bag.svg'}), {index});
  assert.equal(bag.source, 'smart'); assert.equal(bag.original, 'icons/svg/item-bag.svg');
  // Nothing fits: Manager's generic category icon, as before.
  assert.deepEqual(await chooseImportIcon(item('[TEST] Zorblat'), {index: createIconIndex([])}),
    {img: 'modules/ashen-gate-manager/assets/icons/material.svg', reason: 'fallback', source: 'fallback'});
  // Switched off: exactly the 0.46 behaviour (placeholder kept, missing → generic category icon, 404 → generic).
  assert.equal((await chooseImportIcon(item('[TEST] Oak Shield', {img: 'icons/svg/item-bag.svg'}), {index, smart: false})).img, 'icons/svg/item-bag.svg');
  assert.equal((await chooseImportIcon(item('[TEST] Oak Shield'), {index, smart: false})).img, 'modules/ashen-gate-manager/assets/icons/material.svg');
  assert.equal((await chooseImportIcon(item('[TEST] Oak Shield', {img: 'icons/gone.webp'}), {index, smart: false, probe: probe404})).reason, 'missing-authored');
});

test('0.47.0: the preview pick (and a Change… choice) is what Apply writes', async () => {
  const record = item('[TEST] Iron Caltrops');
  const planned = pickRecordIcon(record, {index});
  assert.equal((await chooseImportIcon(record, {index: createIconIndex(['icons/x/other.webp']), planned})).img, planned.img);
  const changed = pickRecordIcon(record, {index, override: 'icons/custom/my-caltrops.webp'});
  assert.deepEqual(changed, {img: 'icons/custom/my-caltrops.webp', reason: 'chosen in the preview', source: 'authored'});
  assert.equal((await chooseImportIcon(record, {index, planned: changed})).img, 'icons/custom/my-caltrops.webp');
});

test('0.47.0: re-import never overwrites an authored icon or a GM edit; fills placeholders; re-picks only on request', () => {
  const smartFlags = {iconSource: 'smart', iconPath: 'icons/consumables/potions/bottle-round-corked-red.webp'};
  // The record has its own icon: never Manager's call (the normal update rules apply).
  assert.equal(existingIconDecision({recordImg: 'icons/a.webp', docImg: 'icons/svg/item-bag.svg', flags: {}}).fill, false);
  // GM changed the icon in Foundry (flag says smart, but the path differs): never.
  assert.equal(existingIconDecision({recordImg: '', docImg: 'icons/gm/choice.webp', flags: smartFlags, repick: true}).fill, false);
  // Authored by flag (a Change… pick, or an earlier authored icon): never, even with Re-pick.
  assert.equal(existingIconDecision({recordImg: '', docImg: 'icons/a.webp', flags: {iconSource: 'authored', iconPath: 'icons/a.webp'}, repick: true}).fill, false);
  // Manager picked it: only with Re-pick.
  assert.deepEqual(existingIconDecision({recordImg: undefined, docImg: smartFlags.iconPath, flags: smartFlags}), {fill: false, why: 'Manager picked it earlier'});
  assert.deepEqual(existingIconDecision({recordImg: undefined, docImg: smartFlags.iconPath, flags: smartFlags, repick: true}), {fill: true, why: 'repick'});
  // A placeholder in the world is filled.
  assert.deepEqual(existingIconDecision({recordImg: 'icons/svg/item-bag.svg', docImg: 'icons/svg/item-bag.svg', flags: {}}), {fill: true, why: 'placeholder'});
  assert.equal(existingIconDecision({recordImg: '', docImg: 'modules/ashen-gate-manager/assets/icons/item.svg', flags: {}}).fill, true);
  // World and remote files are never touched; switched off fills nothing.
  assert.equal(existingIconDecision({recordImg: '', docImg: 'worlds/w/art.webp', flags: {}}).fill, false);
  assert.equal(existingIconDecision({recordImg: '', docImg: 'icons/svg/item-bag.svg', flags: {}, smart: false}).fill, false);
  // A Manager-picked icon reads as the last imported value to the planners, so it is never taken for a GM edit.
  assert.equal(managerAssignedIcon(smartFlags.iconPath, smartFlags), true);
  assert.equal(managerAssignedIcon('icons/gm.webp', smartFlags), false);
  assert.equal(plannerIcon(smartFlags.iconPath, smartFlags, 'icons/svg/item-bag.svg'), 'icons/svg/item-bag.svg');
  assert.equal(plannerIcon('icons/gm.webp', smartFlags, 'icons/svg/item-bag.svg'), 'icons/gm.webp');
  assert.deepEqual(iconFlagUpdate(M, {img: 'icons/a.webp', source: 'smart'}), {[`flags.${M}.iconSource`]: 'smart', [`flags.${M}.iconPath`]: 'icons/a.webp'});
  assert.equal(iconFlagUpdate(M, {img: 'x', source: 'bogus'})[`flags.${M}.iconSource`], 'authored');
});

test('0.47.0: Records does not report a Manager-picked icon as a local edit; a GM change still is', () => {
  const doc = img => ({img, flags: {[M]: {source: {managedFields: {name: '[TEST] A', img: 'icons/svg/item-bag.svg'}}, iconSource: 'smart', iconPath: 'icons/p.webp'}},
    name: '[TEST] A', getFlag(ns, key) { return this.flags[ns]?.[key]; }, toObject() { return structuredClone({img: this.img, name: this.name, flags: this.flags}); }});
  assert.deepEqual(localEdits(doc('icons/p.webp')), []);
  assert.deepEqual(localEdits(doc('icons/gm.webp')).map(e => e.path), ['img']);
});

test('0.47.0: the index is built from Foundry\'s file browser with caps, skipping icons/svg', async () => {
  const {browse, calls} = fakeTree(FAKE_ICONS);
  const out = await browseIconFolders(browse);
  assert.equal(out.complete, true, JSON.stringify(out.errors));
  assert.ok(!calls.some(c => /icons\/svg/.test(c)), 'placeholder folder is not browsed');
  assert.ok(out.files.includes('icons/environment/traps/caltrops-spiked.webp'));
  assert.ok(out.errors.some(e => e.target === 'systems/dnd5e/icons'), 'missing dnd5e icons are noted, not fatal');
  // Caps: a request budget, a depth limit and a per-folder timeout stop it, never hang.
  const capped = await browseIconFolders(browse, {maxRequests: 3});
  assert.equal(capped.complete, false); assert.ok(capped.folders <= 3);
  const shallow = await browseIconFolders(browse, {maxDepth: 1});
  assert.equal(shallow.complete, false);
  const slow = await browseIconFolders(() => new Promise(() => {}), {requestMs: 20});
  assert.equal(slow.files.length, 0); assert.equal(slow.complete, false); assert.match(slow.errors[0].message, /timed out/);
  // V14 namespaced FilePicker first.
  const FP = class {}; FP.implementation = class Impl {};
  assert.equal(filePickerClass({foundry: {applications: {apps: {FilePicker: FP}}}}), FP.implementation);
  assert.equal(filePickerClass({}), null);
});

function memoryStorage() {
  const map = new Map();
  return {map, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k)};
}
test('0.47.0: the indexer runs in the background, caches by Foundry/system version, and never throws', async () => {
  const storage = memoryStorage();
  const {browse, calls} = fakeTree(FAKE_ICONS);
  const states = [];
  const indexer = createIconIndexer({browse, storage, versionKey: '14.367|dnd5e@6.0.6', onChange: s => states.push(s.state)});
  assert.equal(indexer.index, null);
  const pending = indexer.ensure();
  assert.equal(indexer.status().state, 'indexing');
  assert.equal(indexer.ensure(), pending, 'one build at a time');
  const built = await pending;
  assert.ok(built.size > 10); assert.equal(indexer.status().state, 'ready');
  assert.deepEqual(states, ['indexing', 'ready']);
  const stored = JSON.parse(storage.getItem(ICON_INDEX_KEY));
  assert.equal(stored.v, ICON_INDEX_VERSION); assert.equal(stored.key, '14.367|dnd5e@6.0.6');
  // A second session reads the stored copy and never browses.
  const before = calls.length;
  const again = createIconIndexer({browse, storage, versionKey: '14.367|dnd5e@6.0.6'});
  assert.equal((await again.ensure()).size, built.size); assert.equal(calls.length, before);
  // A new Foundry or system version rebuilds; a corrupt or old stored copy is ignored.
  await createIconIndexer({browse, storage, versionKey: '14.368|dnd5e@6.0.7'}).ensure();
  assert.ok(calls.length > before);
  storage.setItem(ICON_INDEX_KEY, '{not json');
  assert.ok((await createIconIndexer({browse, storage}).ensure()).size > 0);
  assert.deepEqual(unpackIndex(packIndex(['a/b/c.webp', 'a/b/d.webp', 'a/e.webp'])).sort(), ['a/b/c.webp', 'a/b/d.webp', 'a/e.webp']);
  // Storage that throws (private mode, full) only loses the cache.
  const broken = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('denied'); }};
  const noStore = createIconIndexer({browse, storage: broken});
  assert.ok((await noStore.ensure()).size > 0); noStore.reset();
  assert.equal(noStore.status().state, 'idle');
});

test('0.47.0: when browsing fails (denied, slow or missing) Manager falls back to the generic icons', async () => {
  const denied = createIconIndexer({browse: async () => { throw new Error('403 denied'); }, storage: memoryStorage()});
  assert.equal(await denied.ensure(), null);
  assert.equal(denied.status().state, 'failed'); assert.match(denied.status().message, /generic icons are used/);
  const none = createIconIndexer({browse: null});
  assert.equal(await none.ensure(), null); assert.equal(none.status().state, 'failed');
  const slow = createIconIndexer({browse: () => new Promise(() => {}), browseOptions: {requestMs: 10}});
  assert.equal(await slow.ensure(), null);
  // With no index the import still gets the old generic category icon.
  const out = await chooseImportIcon(item('[TEST] Healing Draught'), {index: denied.index});
  assert.deepEqual(out, {img: 'modules/ashen-gate-manager/assets/icons/material.svg', reason: 'fallback', source: 'fallback'});
});

// ---------- Improve icons ----------
function worldDoc(documentName, id, name, img, extra = {}) {
  return {documentName, id, uuid: `${documentName}.${id}`, name, img, type: extra.type ?? (documentName === 'Actor' ? 'npc' : 'loot'),
    hasPlayerOwner: Boolean(extra.hasPlayerOwner), flags: extra.flags ?? {}, system: {}};
}
function worldOf(docs) {
  const byUuid = new Map(docs.map(d => [d.uuid, d]));
  const writes = [];
  const updateMany = async (documentName, updates) => {
    writes.push({documentName, count: updates.length});
    for (const u of updates) {
      const d = byUuid.get(`${documentName}.${u._id}`);
      for (const [k, v] of Object.entries(u)) {
        if (k === '_id') continue;
        if (k.startsWith('flags.')) { const [, ns, key] = k.split('.'); (d.flags[ns] ??= {})[key] = v; } else d[k] = v;
      }
    }
  };
  return {getDoc: uuid => byUuid.get(uuid) ?? null, updateMany, writes};
}

test('0.47.0: Improve icons lists only placeholder icons, never ones the GM set or authored real icons', () => {
  const docs = [
    worldDoc('Item', 'a', '[TEST] Healing Draught', 'icons/svg/item-bag.svg'),
    worldDoc('Item', 'b', '[TEST] Oak Shield', 'modules/ashen-gate-manager/assets/icons/item.svg'),
    worldDoc('Item', 'c', '[TEST] Brown Scroll', 'icons/sundries/scrolls/scroll-bound-brown.webp'),
    worldDoc('Item', 'd', '[TEST] Remote', 'https://example.test/x.webp'),
    worldDoc('Actor', 'e', '[TEST] Wolf', 'icons/svg/mystery-man.svg'),
    worldDoc('Actor', 'f', '[TEST] Player Hero', 'icons/svg/mystery-man.svg', {type: 'character', hasPlayerOwner: true}),
    worldDoc('Item', 'g', '[TEST] Zorblat', ''),
  ];
  const rows = scanIconDocuments(docs, index);
  assert.deepEqual(rows.map(r => r.id), ['f', 'e', 'a', 'b', 'g'], 'Actors then Items, by name');
  const by = id => rows.find(r => r.id === id);
  assert.match(by('a').img, /potions/); assert.equal(by('a').checked, true);
  assert.match(by('e').img, /creatures|people/);
  assert.equal(by('f').checked, false, 'player characters start unticked');
  assert.equal(by('g').img, null); assert.equal(by('g').checked, false);
  assert.equal(documentIconInput(docs[0]).name, '[TEST] Healing Draught');
});

test('0.47.0: Improve icons applies in cancellable chunks, GM only, and Undo puts back only untouched icons', async () => {
  const docs = Array.from({length: 7}, (_, i) => worldDoc('Item', `i${i}`, `[TEST] Healing Draught ${i}`, 'icons/svg/item-bag.svg'));
  const world = worldOf(docs);
  const rows = scanIconDocuments(docs, index);
  assert.equal((await applyIconChanges(rows, {user: {isGM: false}, moduleId: M, ...world})).ok, false);
  assert.equal(world.writes.length, 0, 'a player writes nothing');
  // Cancel after the first chunk: what was written stays (and is in undo), the rest is untouched.
  const abort = new AbortController();
  const out = await applyIconChanges(rows, {user: {isGM: true}, moduleId: M, ...world, chunk: 3, signal: abort.signal,
    onProgress: () => abort.abort(), yieldTurn: async () => {}});
  assert.equal(out.cancelled, true); assert.equal(out.applied.length, 3);
  assert.equal(docs.filter(d => d.img !== 'icons/svg/item-bag.svg').length, 3);
  assert.equal(docs[0].flags[M].iconSource, 'smart'); assert.equal(docs[0].flags[M].iconPath, docs[0].img);
  // The rest, with one changed by the GM since the scan (skipped) and one picked with Change… (authored).
  docs[5].img = 'icons/gm/own.webp';
  const rest = rows.slice(3).map(r => r.id === 'i6' ? {...r, img: 'icons/custom/pick.webp', source: 'authored'} : r);
  const out2 = await applyIconChanges(rest, {user: {isGM: true}, moduleId: M, ...world, yieldTurn: async () => {}});
  assert.equal(out2.applied.length, 3); assert.equal(out2.skipped.length, 1);
  assert.equal(docs[5].img, 'icons/gm/own.webp', 'a GM edit after the scan is kept');
  assert.equal(docs[6].flags[M].iconSource, 'authored');
  const backup = iconBackup(rows.slice(0, 2), world.getDoc, M);
  assert.equal(backup.documents.length, 2); assert.equal(backup.kind, 'ashen-gate-icon-backup');
  // Undo: the GM changes one of the applied icons again; that one is left alone.
  docs[0].img = 'icons/gm/later.webp';
  assert.equal((await undoIconChanges(out, {user: {isGM: false}, moduleId: M, ...world})).ok, false);
  const undone = await undoIconChanges(out, {user: {isGM: true}, moduleId: M, ...world, yieldTurn: async () => {}});
  assert.equal(undone.restored, 2); assert.equal(undone.kept, 1);
  assert.equal(docs[0].img, 'icons/gm/later.webp');
  assert.equal(docs[1].img, 'icons/svg/item-bag.svg'); assert.equal(docs[1].flags[M].iconSource, null);
});
