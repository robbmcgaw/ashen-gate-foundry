// scripts/validate-content.mjs: authored files go through the real module validators. Proves logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContent, validateTargets } from './validate-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playtest = path.join(root, 'test-fixtures/playtest');
const pack = records => ({manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'AG-TEST-CONTENT', version: '1.0.0'}, records});
const item = (over = {}) => ({id: 'ITEM-TEST-LANTERN', entity_type: 'Item', status: 'approved', version: '1.0.0',
  provenance: {sources: ['[TEST] synthetic']}, visibility: 'player', refs: [],
  foundry: {document_type: 'Item', folder_path: 'Ashen Gate/Test', data: {name: '[TEST] Lantern', type: 'loot'}}, ...over});
const location = node => ({id: 'LOC-TEST-FIELD', entity_type: 'Location', status: 'approved', version: '1.0.0',
  provenance: {sources: ['[TEST] synthetic']}, visibility: 'player', refs: [],
  location: {name: '[TEST] Field', threat: 'hot', state: 'revealed', resources: [node]}});
const node = (over = {}) => ({id: 'n1', label: '[TEST] Herbs', skill: 'Herbalism', tier: 2, dc: 12, materialId: 'MAT-TEST-HERB', ...over});

test('the committed playtest files are accepted, and their ZIP bundle imports Manager first', async () => {
  const {ok, lines} = await validateTargets([playtest]);
  assert.ok(ok, lines.join('\n'));
  assert.match(lines.at(-1), /ZIP of .*AG_Playtest_Pack_[\d.]+\.json \(Manager package, \d+\) -> .*Quest Log/);
});

test('a valid package passes; the documented common mistakes are rejected with the validator message', async () => {
  assert.deepEqual((await checkContent(pack([item()]))).errors, []);
  const cases = [
    [pack([item({provenance: {source: '[TEST] notes'}})]), 'provenance.sources: array of source identifiers required'],
    [pack([item({visibility: 'reveal-gated'})]), 'visibility: expected player/gm/reveal_gated'],
    [pack([item({refs: [{relation: 'x', target_id: 'MAT-TEST-A', mode: 'hard_requirement'}]})]), 'mode:required|optional'],
    [pack([item({foundry: {document_type: 'Item', folder_path: 'Test', data: {name: 'x', type: 'loot'}}})]), 'must begin with "Ashen Gate/"'],
    [pack([location(node({exotics: [{materialId: 'MAT-TEST-STAR', mode: 'random'}]}))]), 'exotics normalised differently'],
    [pack([location(node({tier: 9}))]), 'tier 9 was changed to 1'],
    [pack([item({id: 'REC-TEST-BREW', entity_type: 'Recipe', ingredients: ['2 herbs']})]), 'Ledger cannot craft it'],
    [{records: [item()]}, 'manifest: an object is required']
  ];
  for (const [data, message] of cases) {
    const {errors} = await checkContent(data);
    assert.ok(errors.some(e => e.includes(message)), `expected "${message}", got ${JSON.stringify(errors)}`);
  }
});

test('the exotic and gathering fields Locations keeps are accepted unchanged', async () => {
  const exotics = [{materialId: 'MAT-TEST-STAR', mode: 'designated', chance: 15, condition: 'rare'}, {materialId: 'MAT-TEST-MOON', mode: 'discovery'}];
  assert.deepEqual((await checkContent(pack([location(node({exotics, quantity: 2, rareMaterialId: 'MAT-TEST-RARE', rareQuantity: 1}))]))).errors, []);
});

test('files in an "invalid" folder must be rejected, with the error they name', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-content-'));
  try {
    fs.mkdirSync(path.join(dir, 'invalid'));
    const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
    write('invalid/bad.json', {_expect_error: 'provenance.sources', ...pack([item({provenance: {source: 'x'}})])});
    assert.ok((await validateTargets([dir])).ok);
    write('invalid/wrong-reason.json', {_expect_error: 'some other message', ...pack([item({provenance: {source: 'x'}})])});
    write('invalid/actually-fine.json', pack([item()]));
    const {ok, lines} = await validateTargets([dir]);
    assert.equal(ok, false);
    assert.equal(lines.filter(l => l.startsWith('FAIL')).length, 2, lines.join('\n'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('moods files are checked with the Scenes import preview', async () => {
  const file = presets => ({format: 'ashen-gate.scene-moods', formatVersion: 1, presets});
  const good = file([{id: 'test-fog', label: '[TEST] Fog', kind: 'layer', set: {weather: 'fog'}}, {id: 'test-dusk', label: '[TEST] Dusk', set: {'environment.darknessLevel': 0.5}, transitionMs: 3000}]);
  assert.deepEqual((await checkContent(good, 'x.scene-moods.json')).errors, []);
  assert.match((await checkContent([good.presets[0]], 'x.scene-moods.json')).errors[0], /not an Ashen Gate moods file/);
  const bad = await checkContent(file([{id: 'Test Fog', label: '', set: {'environment.darknessLevel': 2, 'lighting.colour': 'red'}}, {id: 'test-ash', label: '[TEST] Ash', kind: 'layer', set: {weather: 'ashfall'}}]), 'x.scene-moods.json');
  assert.match(bad.errors.join(' | '), /Id must be.*Label is required.*Darkness must be a number from 0 to 1.*lighting.colour is not a supported mood field.*weather "ashfall" is not a core weather id/);
});

test('Route records are reported as skipped (Locations 0.20.0 retired routes); the locations in the file still check', async () => {
  const route = {id: 'RTE-TEST-FIELD-MILL', entity_type: 'Route', status: 'approved', version: '1.0.0', provenance: {sources: ['[TEST] synthetic']},
    visibility: 'gm', refs: [], name: '[TEST] Road', route: {from_location_id: 'LOC-TEST-FIELD', to_location_id: 'LOC-TEST-MILL', distance_km: 12}};
  const r = await checkContent(pack([location(node()), route]), 'routes.json');
  assert.deepEqual(r.errors, ['RTE-TEST-FIELD-MILL: Locations skips it: Routes are retired; make a location with type Route instead.']);
});

test('NPC Codex fields: what the Codex would drop or turn into other text is reported', async () => {
  const npc = over => ({id: 'NPC-TEST-CLERK', entity_type: 'NPC', status: 'approved', version: '1.0.0', provenance: {sources: ['[TEST] synthetic']},
    visibility: 'gm', refs: [], name: '[TEST] Clerk', role: '[TEST] Clerk', gm_notes: ['[TEST] note'],
    codex: {links: ['LOC-TEST-FIELD', 'QUEST-TEST-ONE', 'DEITY-TEST-SUN'], default_reveal: {discovery: 'hidden', fields: {role: 'party'}}},
    foundry: {document_type: 'Actor', data: {name: '[TEST] Clerk', type: 'npc'}}, ...over});
  assert.deepEqual((await checkContent(pack([npc()]))).errors, []);
  const bad = await checkContent(pack([npc({wants: ['a', 'b'], codex: {links: ['ITEM-TEST-X'], default_reveal: {discovery: 'everyone', fields: {portrayal: 'party'}}}})]));
  assert.match(bad.errors.join(' | '), /wants must be text.*codex.links "ITEM-TEST-X" is not a linkable id \(LOC, FAC, FACTION, RENOWN, DEITY, .*discovery "everyone" must be "hidden" or "party".*fields.portrayal is not revealable/);
  assert.match((await checkContent(pack([item({codex: {links: []}})]))).notes.join(' '), /codex is only read on entity_type NPC/);
});

test('crosswalk baseline files go through the Ledger parser; unknown names are reported', async () => {
  const good = {professions: {fishing: {qualifySkills: ['Survival'], items: ['Fishing Tackle']}, herbalism: {qualifyTools: ['Herbalism Kit'], advantageTools: ['herb']}}};
  const ok = await checkContent(good, 'x.crosswalk.json');
  assert.equal(ok.kind, 'crosswalk');
  assert.deepEqual(ok.errors, []);
  assert.deepEqual((await checkContent({professions: []}, 'x.crosswalk.json')).errors, ['The file needs a "professions" object.']);
  const bad = await checkContent({professions: {Skinning: {qualifySkills: ['sur']}, 'Hunting/Skinning': {}, herbalism: {qualifyTools: ['[TEST] Press'], items: ['']}, Dancing: {}}}, 'x.crosswalk.json');
  assert.match(bad.errors.join(' | '), /listed twice.*"Dancing" is not one of the Ledger's 14 professions.*"\[TEST\] Press" matches no dnd5e tool.*empty or over 200 characters/);
});

test('gathering node files (Ledger 0.25.0) go through the Ledger parser, by name or schema, and stay out of the ZIP', async () => {
  const nodeFile = (nodes) => ({schema: 'ag-gathering-nodes/1', nodes});
  const reeds = (over = {}) => ({id: 'NODE-TEST-REEDS', name: '[TEST] Reeds', activity: 'herbalism', tier: {min: 1, max: 2},
    materials: {common: [{materialId: 'MAT-TEST-HERB', quantity: 2}], rare: [], exotic: [{materialId: 'MAT-TEST-STAR', mode: 'designated', chance: 5, condition: 'rare'}]}, ...over});
  const ok = await checkContent(nodeFile([reeds()]), 'x.gathering-nodes.json');
  assert.equal(ok.kind, 'gathering-nodes');
  assert.deepEqual(ok.errors, []);
  assert.match(ok.notes.join(' '), /Materials not defined in this folder.*MAT-TEST-HERB, MAT-TEST-STAR.*Gathering Nodes > Import nodes/);
  assert.deepEqual((await checkContent(nodeFile([reeds()]), 'x.gathering-nodes.json', {knownIds: new Set(['MAT-TEST-HERB', 'MAT-TEST-STAR'])})).notes,
    ['Imported in Profession Ledger > Gathering Nodes > Import nodes (not through Manager Import).']);
  assert.equal((await checkContent(nodeFile([reeds({activity: 'Skinning & Harvesting'})]), 'any-name.json')).kind, 'gathering-nodes', 'recognised by its schema');
  const bad = await checkContent(nodeFile([reeds({id: 'reeds'}), reeds({activity: 'dancing', tier: {min: 3, max: 1}}), reeds({name: '[TEST] Twice',
    materials: {common: [{materialId: 'MAT-TEST-A', chance: 50}, {materialId: 'MAT-TEST-B', chance: 40}]}})]), 'x.gathering-nodes.json');
  assert.match(bad.errors.join(' | '), /permanent NODE-\* id.*activity "dancing".*tier min 3 is above max 1.*add up to 90, not 100.*used twice in this file/);
  assert.deepEqual((await checkContent({schema: 'ag-gathering-nodes/1'}, 'x.gathering-nodes.json')).errors, ['The file needs a "nodes" list.']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-content-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(pack([item()])));
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(pack([item({id: 'ITEM-TEST-ROPE'})])));
    fs.writeFileSync(path.join(dir, 'c.gathering-nodes.json'), JSON.stringify(nodeFile([reeds()])));
    const {ok: good, lines} = await validateTargets([dir]);
    assert.ok(good, lines.join('\n'));
    assert.doesNotMatch(lines.at(-1), /gathering-nodes/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('NPC Codex export files are checked with the restore planner and kept out of the ZIP', async () => {
  const file = {schema_version: 'ag-npc-codex-export/0.1', visibility: 'gm', definitions: [], reveals: {'NPC-TEST-CLERK': {discovery: {party: true, actors: []}}}};
  assert.deepEqual((await checkContent(file, 'x.npc-codex.json')).errors, []);
  assert.deepEqual((await checkContent({...file, schema_version: 'x', reveals: []}, 'x.npc-codex.json')).errors,
    ['schema_version must be ag-npc-codex-export/0.1.', 'reveals must be an object keyed by NPC id.']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-content-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(pack([item()])));
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(pack([item({id: 'ITEM-TEST-ROPE'})])));
    fs.writeFileSync(path.join(dir, 'c.npc-codex.json'), JSON.stringify(file));
    fs.writeFileSync(path.join(dir, 'd.crosswalk.json'), JSON.stringify({professions: {mining: {}}}));
    const {ok, lines} = await validateTargets([dir]);
    assert.ok(ok, lines.join('\n'));
    assert.match(lines.at(-1), /ZIP of .*a\.json .*-> b\.json/);
    assert.doesNotMatch(lines.at(-1), /npc-codex|crosswalk/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('Item effects (Manager 0.37.0): valid effects pass, bad ones fail with the validator message, dropped flags are notes', async () => {
  const effect = (over = {}) => ({eff_id: 'walk', name: '[TEST] Walk speed', transfer: false, changes: [{key: 'system.attributes.movement.speeds.walk', mode: 'add', value: 10}], ...over});
  const gear = (effects, flags) => item({id: 'ITEM-MOUNT-TEST-SADDLE', foundry: {document_type: 'Item', folder_path: 'Ashen Gate/Test',
    data: {name: '[TEST] Saddle', type: 'equipment', effects, ...(flags ? {flags} : {})}}});
  assert.deepEqual(await checkContent(pack([gear([effect()], {'ashen-gate-character-hub': {companion: {role: 'mount-gear'}}})])), {kind: 'manager', errors: [], notes: []});
  for (const [effects, message] of [
    [[effect({changes: [{key: 'system.attributes.ac.bonus', mode: 'plus', value: 1}]})], 'is not a mode'],
    [[effect({changes: [{key: '', mode: 'add', value: 1}]})], 'key is required'],
    [[effect({changes: [{key: 'macro.execute', mode: 'custom', value: 'x'}]})], 'may not run macros'],
    [[effect({changes: [{key: 'system.attributes.ac.bonus', mode: 2, value: [1]}]})], 'must be a string or a number'],
    [[effect({eff_id: ''})], 'eff_id is required'],
    [[effect({transfer: 'no'})], 'transfer is required']
  ]) {
    const {errors} = await checkContent(pack([gear(effects)]));
    assert.ok(errors.some(e => e.includes(message)), `expected "${message}", got ${JSON.stringify(errors)}`);
  }
  const {errors, notes} = await checkContent(pack([gear([effect({transfer: true})], {core: {statusId: 'dead'}})]));
  assert.deepEqual(errors, []);
  assert.ok(notes.some(n => /flags not imported .*core\.statusId/.test(n)), JSON.stringify(notes));
  assert.ok(notes.some(n => /transfer on/.test(n)), JSON.stringify(notes));
});

test('Cinder examples: the package, tree and Strain config pass; the documented mistakes are rejected; import order Manager → trees → Strain', async () => {
  const {ok, lines} = await validateTargets([path.join(root, 'test-fixtures/cinder')]);
  assert.ok(ok, lines.join('\n'));
  assert.match(lines.at(-1), /AG_Test_Cinder_Pack\.json \(Manager package, 8\) -> AG_Test_Cinder_Tree\.json \(Skill Trees, 1\) -> AG_Test_Strain\.json \(Strain \(Cinders\), 1\)/);
  const power = JSON.parse(fs.readFileSync(path.join(root, 'test-fixtures/cinder/AG_Test_Cinder_Pack.json'), 'utf8')).records.find(r => r.id === 'POWER-TEST-SPARK');
  const alone = await checkContent(pack([power]));
  assert.deepEqual(alone.errors, []);
  assert.ok(alone.notes.some(n => n.includes('POWER-TEST-REACH is not in this file')), 'a reference outside the file is a note');
  // Cinders 0.10.0: a Cinder's bearer items outside the file are a note; in the file they must be the right signature kind.
  const records = JSON.parse(fs.readFileSync(path.join(root, 'test-fixtures/cinder/AG_Test_Cinder_Pack.json'), 'utf8')).records;
  const ember = records.find(r => r.id === 'MUT-TEST-EMBER');
  const lone = await checkContent(pack([ember]));
  assert.deepEqual(lone.errors, []);
  assert.ok(lone.notes.some(n => n.includes('bearer_items.active POWER-TEST-FLARE is not in this file')), lone.notes.join('\n'));
  assert.ok(lone.notes.some(n => n.includes('bearer_items.passive POWER-TEST-WARD is not in this file')), lone.notes.join('\n'));
  const swapped = await checkContent(pack([{...ember, cinder: {...ember.cinder, bearer_items: {active: 'POWER-TEST-SPARK'}}}, records.find(r => r.id === 'POWER-TEST-SPARK')]));
  assert.ok(swapped.errors.some(e => e.includes('must be a signature_active Power (it is a power)')), swapped.errors.join('\n'));
  const strain = await checkContent({schema: 'ag-strain-config/0.1', bands: [{from: 0, to: 3, label: '[TEST] A'}]});
  assert.ok(strain.errors.some(e => e.includes('open-ended')));
});

test('Modifier examples: the package passes (a note until the scope owner checks modifiers); the documented mistakes are rejected', async () => {
  const {ok, lines} = await validateTargets([path.join(root, 'test-fixtures/modifiers')]);
  assert.ok(ok, lines.join('\n'));
  const file = JSON.parse(fs.readFileSync(path.join(root, 'test-fixtures/modifiers/AG_Test_Modifier_Items.json'), 'utf8'));
  const r = await checkContent(file);
  assert.deepEqual(r.errors, []);
  const lens = file.records[0];
  const bad = await checkContent(pack([{...lens, modifiers: {...lens.modifiers, list: [{target: 'push.cost', value: 1, label: 'x', op: 'multiply'}]}}]));
  assert.ok(bad.errors.some(e => e.includes('op must be "add"')), bad.errors.join('\n'));
});

test('quest item rewards: the valid example passes with a note; the note goes when the item is beside it; mistakes are rejected', async () => {
  const fixtures = path.join(root, 'modules/ashen-gate-quest-manager/docs/fixtures/item-rewards');
  const {ok, lines} = await validateTargets([fixtures]);
  assert.ok(ok, lines.join('\n'));
  const example = lines.join('\n');
  assert.match(example, /quest-item-rewards\.json \(quests\)\n  note: QUEST-TEST-BEAST-OF-THE-FEN: item reward ITEM-TEST-HEALING-DRAUGHT must be imported as an Item/);
  for (const name of ['uuid', 'quantity-zero', 'unknown-visibility', 'duplicate-id', 'unknown-key']) assert.match(example, new RegExp(`${name}\\.invalid\\.json rejected as expected`));
  const quests = JSON.parse(fs.readFileSync(path.join(fixtures, 'quest-item-rewards.json'), 'utf8'));
  const {notes} = await checkContent(quests, 'quest-item-rewards.json', {knownIds: new Set(['ITEM-TEST-HEALING-DRAUGHT'])});
  assert.deepEqual(notes, ['QUEST-TEST-BEAST-OF-THE-FEN: item reward ITEM-TEST-RUSTED-BLADE must be imported as an Item (in this file or already in the world).']);
  // Same folder bundle: a Manager package defining both items silences both notes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-quest-items-'));
  try {
    fs.writeFileSync(path.join(dir, 'quests.json'), JSON.stringify(quests));
    fs.writeFileSync(path.join(dir, 'items.json'), JSON.stringify(pack([item({id: 'ITEM-TEST-HEALING-DRAUGHT'}), item({id: 'ITEM-TEST-RUSTED-BLADE', foundry: {document_type: 'Item', folder_path: 'Ashen Gate/Test', data: {name: '[TEST] Rusted Blade', type: 'weapon'}}})])));
    const res = await validateTargets([dir]);
    assert.ok(res.ok, res.lines.join('\n'));
    assert.doesNotMatch(res.lines.join('\n'), /item reward/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('Shop, Service and MerchantList records (Utilities 0.21.0): the synthetic package passes, the documented mistakes are rejected naming the record', async () => {
  const {ok, lines} = await validateTargets([path.join(root, 'test-fixtures/shops')]);
  assert.ok(ok, lines.join('\n'));
  assert.ok(lines.filter(l => /rejected as expected: (SHOP|SVC|MLIST|STORE)-TEST-/.test(l)).length >= 7, lines.join('\n'));
  // The GPT brief's example (docs/shopping-for-gpt.md §4) with the package keys Manager requires.
  const env = {provenance: {sources: ['[TEST] synthetic']}, visibility: 'gm', refs: []};
  const gpt = pack([
    {...env, id: 'SHOP-TEST-TANNER', entity_type: 'Shop', status: 'draft', version: '1.0.0', name: "[TEST] Tanner's Stall",
      refs: [{relation: 'located_at', target_id: 'LOC-TEST-MARKET', mode: 'optional'}],
      shop: {merchant_name: '[TEST] Hollis Reed', flavour: 'Smells of oak bark and fresh leather.', location_id: 'LOC-TEST-MARKET', purse: {cp: 50, sp: 30, gp: 20, pp: 0},
        lines: [{item_id: 'ITEM-TEST-LEATHER-ARMOR', price: {value: 10, denomination: 'gp'}, stock: 2, flavour: 'Supple and well stitched.'},
          {item_id: 'ITEM-TEST-WATERSKIN', price: {value: 2, denomination: 'sp'}},
          {item_id: 'ITEM-TEST-HIDE-BUNDLE', price: {value: 3, denomination: 'gp'}, hidden: true, cost: {value: 1, denomination: 'gp'}}]}},
    {...env, id: 'SVC-TEST-COUNTING-HOUSE', entity_type: 'Service', status: 'draft', version: '1.0.0', name: '[TEST] Counting House',
      service: {type: 'bank', merchant_name: '[TEST] Clerk Ames', location_id: 'LOC-TEST-MARKET', settings: {fee_percent: 0}}},
    {...env, id: 'MLIST-TEST-TESTFORD', entity_type: 'MerchantList', status: 'draft', version: '1.0.0', name: '[TEST] Testford merchants',
      merchant_list: {location_id: 'LOC-TEST-TESTFORD', shop_ids: ['SHOP-TEST-TANNER', 'SVC-TEST-COUNTING-HOUSE']}}]);
  const r = await checkContent(gpt);
  assert.deepEqual(r.errors, []);
  assert.ok(r.notes.includes('SHOP-TEST-TANNER: line 1 item ITEM-TEST-LEATHER-ARMOR is not in this file; it must already be in the world (imported earlier).'), r.notes.join('\n'));
  const broken = (mut) => { const c = structuredClone(gpt); mut(c.records); return c; };
  for (const [data, message] of [
    [broken(rs => { rs[0].shop.lines[0].price.denomination = 'ep'; }), 'SHOP-TEST-TANNER: Utilities skips it: line 1 price: ep is refused while Use electrum is off.'],
    [broken(rs => { rs[0].shop.lines[1].stock = 1.5; }), 'SHOP-TEST-TANNER: Utilities skips it: line 2: stock must be a whole number'],
    [broken(rs => { rs[0].shop.purse.ep = 2; }), 'SHOP-TEST-TANNER: Utilities skips it: shop.purse: Electrum is turned off'],
    [broken(rs => { delete rs[0].shop.merchant_name; }), 'SHOP-TEST-TANNER: Utilities skips it: shop.merchant_name is required.'],
    [broken(rs => { rs[1].service.settings.fee_percent = 75; }), 'SVC-TEST-COUNTING-HOUSE: Utilities skips it: The bank fee must be a whole number from 0 to 50.'],
    [broken(rs => { rs[2].merchant_list.shop_ids = 'SHOP-TEST-TANNER'; }), 'MLIST-TEST-TESTFORD: Utilities skips it: merchant_list.shop_ids must be a list.'],
    [broken(rs => { rs.push(structuredClone(rs[1])); }), 'duplicate ID SVC-TEST-COUNTING-HOUSE']
  ]) {
    const {errors} = await checkContent(data);
    assert.ok(errors.some(e => e.includes(message)), `${message}\n${errors.join('\n')}`);
  }
});
