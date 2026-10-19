// Repo-level check of the synthetic playtest data: every file loads in the module that reads it, ids are unique
// and permanent-prefixed, and every cross-reference resolves. Proves logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPack, buildQuests, buildSkillTrees, buildHqFacilities, buildFactions, packFileName, questsFileName, skillTreesFileName, hqFileName, factionsFileName, PACK_VERSION } from './build-test-pack.mjs';
import { validatePackage } from '../modules/ashen-gate-manager/scripts/core.js';
import { parseImport, importRecords } from '../modules/ashen-gate-locations/scripts/model.mjs';
import { normalizePackage } from '../modules/ashen-gate-quest-manager/scripts/core.mjs';
import { validatePackage as validateTrees } from '../modules/ashen-gate-skill-trees/scripts/engine.mjs';
import { validateDefinition, applyOperation, emptyState } from '../modules/ashen-gate-headquarters/js/logic.mjs';
import { createApi } from '../modules/ashen-gate-locations/scripts/api.mjs';
import { playerView } from '../modules/ashen-gate-locations/scripts/model.mjs';
import { planImport, runImport } from '../modules/ashen-gate-factions/scripts/import.mjs';
import { blankStanding, makeGroupRecord, makePersonalRecord, progressFor, upgradeFaction } from '../modules/ashen-gate-factions/scripts/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'test-fixtures/playtest');
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const pack = read(packFileName());
const quests = read(questsFileName());
const trees = read(skillTreesFileName());
const facilities = read(hqFileName());
const factions = read(factionsFileName());
const PERMANENT = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const ids = new Set(pack.records.map(r => r.id));
const byType = t => pack.records.filter(r => r.entity_type === t);
const AGREF = /\[\[AGREF:([A-Z0-9-]+)(?:\|[^\]]*)?\]\]/g;

test('committed files are up to date with scripts/build-test-pack.mjs', () => {
  assert.deepEqual(pack, buildPack());
  assert.deepEqual(quests, buildQuests());
  assert.deepEqual(trees, buildSkillTrees());
  assert.deepEqual(facilities, buildHqFacilities());
  assert.deepEqual(factions, buildFactions());
  assert.equal(pack.manifest.version, PACK_VERSION);
  assert.deepEqual(fs.readdirSync(dir).filter(f => /^AG_Playtest_/.test(f)).sort(),
    [factionsFileName(), hqFileName(), packFileName(), questsFileName(), skillTreesFileName()].sort(), 'no stale pack versions left behind');
});

test('Manager accepts the pack; ids are unique permanent ids; every name is [TEST]-marked', () => {
  assert.deepEqual(validatePackage(pack), []);
  assert.equal(ids.size, pack.records.length, 'duplicate record ids');
  for (const r of pack.records) {
    assert.match(r.id, PERMANENT, r.id);
    assert.match(r.foundry?.data.name ?? r.name, /\[TEST\]/, r.id);
  }
});

test('every ref, AGREF marker and embedded source id in the pack resolves to a pack record', () => {
  for (const r of pack.records) {
    for (const ref of r.refs) assert.ok(ids.has(ref.target_id), `${r.id} -> ${ref.target_id}`);
    const text = JSON.stringify(r.foundry?.data ?? {});
    for (const m of text.matchAll(AGREF)) assert.ok(ids.has(m[1]), `${r.id} marker ${m[1]}`);
  }
  for (const c of byType('PlayerCharacter')) {
    for (const item of c.foundry.data.items) {
      const id = item.flags?.['ashen-gate-manager']?.source?.sourceId;
      if (id) assert.ok(ids.has(id), `${c.id} item ${item.name} -> ${id}`);
    }
    const flags = c.foundry.data.flags['ashen-gate-profession-ledger'];
    for (const p of Object.keys(flags.professionProgress?.professions ?? {})) assert.ok(ids.has(p), `${c.id} progress ${p}`);
    for (const rec of flags.knownRecipes ?? []) assert.ok(ids.has(rec), `${c.id} knows ${rec}`);
  }
  for (const r of byType('Recipe')) for (const ing of r.ingredients) assert.ok(ids.has(ing.material_id), `${r.id} -> ${ing.material_id}`);
});

test('the pack carries the test characters, journals, table, perks and hireling the playtest steps need', () => {
  assert.deepEqual(byType('PlayerCharacter').map(r => r.foundry.data.name), ['[TEST] Belwar', '[TEST] Kessa', '[TEST] Orin']);
  for (const c of byType('PlayerCharacter')) {
    const items = c.foundry.data.items;
    assert.ok(items.some(i => i.type === 'tool'), `${c.id} carries a tool`);
    assert.ok(items.some(i => i.flags?.['ashen-gate-manager']?.source?.entityType === 'Profession'), `${c.id} has a profession`);
    assert.ok(items.filter(i => i.flags?.['ashen-gate-manager']?.source?.entityType === 'Item').length >= 2, `${c.id} has stash items`);
    assert.equal(c.foundry.data.type, 'character');
  }
  const belwar = byType('PlayerCharacter')[0].foundry.data.items;
  assert.ok(belwar.some(i => i.flags?.['ashen-gate-manager']?.source?.sourceId === 'REC-PT-EMBER-SALVE'), 'Belwar holds the Ember Salve recipe item');
  assert.ok(belwar.some(i => i.type === 'tool' && i.system.type.baseItem === 'alchemist'));
  assert.ok(byType('PlayerCharacter').some(c => c.foundry.data.effects.some(e => e.statuses.some(s => !['poisoned', 'prone'].includes(s)))), 'a custom status effect');
  assert.equal(byType('JournalEntry').length, 3);
  assert.equal(byType('RollTable').length, 1);
  assert.deepEqual(byType('HirelingPerk').map(r => r.id), ['HPERK-PT-WORKING']);
  assert.ok(byType('Hireling').length === 1 && byType('ProfessionPerk').length === 8 && byType('Item').length >= 12);
});

test('Locations import the whole point-crawl; nesting, states, loot, nodes and quest links all resolve', () => {
  const { created, skipped, errors } = parseImport(pack, []);
  assert.deepEqual([skipped, errors], [[], []]);
  const locIds = new Set(created.map(l => l.id));
  assert.equal(created.length, byType('Location').length);
  const mats = new Set(byType('Material').map(r => r.id));
  const questIds = new Set(quests.records.map(r => r.id));
  const by = Object.fromEntries(created.map(l => [l.id, l]));
  for (const l of created) {
    if (l.parentLocationId) assert.ok(locIds.has(l.parentLocationId), `${l.id} parent`);
    for (const rel of l.related) assert.ok(locIds.has(rel.locationId), `${l.id} related ${rel.locationId}`);
    for (const q of l.quests) assert.ok(questIds.has(q.questId), `${l.id} quest ${q.questId}`);
    for (const o of l.conditionOverrides) assert.ok(by[o.from]?.isRegion && by[o.from].conditions.some(c => c.key === o.conditionKey), `${l.id} override ${o.conditionKey}`);
    for (const n of l.resources) for (const m of [n.materialId, n.rareMaterialId].filter(Boolean)) assert.ok(mats.has(m), `${l.id} node ${n.key} -> ${m}`);
    for (const e of l.loot) {
      const itemId = /ITEM-PT-[A-Z-]+/.exec(e.text)?.[0];
      if (itemId) assert.ok(ids.has(itemId) && e.label === pack.records.find(r => r.id === itemId).foundry.data.name, `${l.id} loot ${e.key}`);
    }
  }
  // States and nesting
  assert.deepEqual(created.map(l => l.state).filter((s, i, a) => a.indexOf(s) === i).sort(), ['hidden', 'revealed', 'unidentified']);
  assert.equal(by['LOC-PT-HOLLOWMERE'].isRegion, true);
  assert.equal(by['LOC-PT-DROWNED-CHAPEL'].parentLocationId, 'LOC-PT-HOLLOWMERE');
  assert.equal(by['LOC-PT-CHAPEL-CRYPT'].parentLocationId, 'LOC-PT-DROWNED-CHAPEL');
  assert.equal(by['LOC-PT-SUNKEN-CACHE'].state, 'hidden');
  assert.equal(by['LOC-PT-LANTERN-MOUND'].state, 'unidentified');
  assert.ok(by['LOC-PT-LANTERN-MOUND'].unidentifiedLabel && by['LOC-PT-LANTERN-MOUND'].teaser);
  // One gathering node of each state at the chapel, loot of each status
  const nodes = Object.fromEntries(by['LOC-PT-DROWNED-CHAPEL'].resources.map(n => [n.key, n]));
  assert.deepEqual([nodes['pt-chapel-reeds'].finite, nodes['pt-chapel-roots'].exhausted, nodes['pt-chapel-bloom'].exhausted, nodes['pt-chapel-seam'].visible], [false, false, true, false]);
  assert.deepEqual([...new Set(created.flatMap(l => l.loot.map(e => e.status)))].sort(), ['available', 'discovered', 'taken']);
  // Re-importing keeps everything; updating works
  const again = importRecords(pack.records, created, { mode: 'update' });
  assert.deepEqual([again.created.length, again.updated.length], [0, created.length]);
});

test('Quest Manager, Skill Trees and Headquarters files load and reference pack ids', () => {
  const rows = normalizePackage(quests);
  assert.ok(rows.length >= 6);
  const locIds = new Set(byType('Location').map(r => r.id));
  for (const q of rows) {
    for (const l of q.locations) assert.ok(locIds.has(l.target_id), `${q.id} -> ${l.target_id}`);
    for (const r of q.refs) assert.ok(ids.has(r.target_id), `${q.id} ref ${r.target_id}`);
    if (q.parameters.recipe_id) assert.ok(ids.has(q.parameters.recipe_id), `${q.id} recipe`);
  }
  assert.ok(rows.some(q => q.objectives.some(o => o.visibility === 'gm')) && rows.some(q => q.objectives.some(o => o.visibility === 'reveal_gated')));
  assert.deepEqual(validateTrees(trees).errors, []);
  for (const t of trees.trees) {
    if (t.sourceRef) assert.ok(ids.has(t.sourceRef), `${t.id} sourceRef`);
    for (const n of t.nodes) {
      assert.match(n.perkId ?? '', /^PERK-PT-/, `${n.id} names a pack perk`);
      assert.ok(ids.has(n.perkId), `${n.id} -> ${n.perkId}`);
    }
  }
  assert.ok(trees.trees.some(t => t.provider.kind === 'profession' && t.sourceRef === 'PROF-PT-ALCHEMY'));
  const facIds = facilities.map(f => f.id);
  assert.equal(new Set(facIds).size, facIds.length);
  for (const f of facilities) { assert.equal(validateDefinition(f), true); assert.match(f.name, /\[TEST\]/); }
});

test('only the deliberate examples are gm-only or draft', () => {
  const exceptions = pack.records.filter(r => r.status !== 'approved' || r.visibility !== 'player').map(r => r.id).sort();
  assert.deepEqual(exceptions, ['ITEM-PT-DRAFT-DRAUGHT', 'JRN-PT-CHAPEL-GM-NOTES', 'MACRO-PT-LINK-TEST-DATA', 'MAT-PT-GM-ONLY-RESIN', 'PERK-PT-ALCH-MASTER-TOUCH', 'REC-PT-DRAFT-DRAUGHT']);
});

// ---- Factions import file ---------------------------------------------------------------------------
const worldIo = (world, { gm = true } = {}) => ({
  assertGM: () => { if (!gm) throw new Error('GM authorization required.'); },
  createFaction: async def => { world.factions.set(def.id, def); world.group.set(def.id, makeGroupRecord({ factionId: def.id })); },
  updateGroup: async (id, fn) => { world.group.set(id, fn(world.group.get(id))); },
  updatePersonal: async (id, actor, fn) => {
    const key = `${id}/${actor.id}`;
    world.personal.set(key, fn(world.personal.get(key) ?? makePersonalRecord({ factionId: id, actorId: actor.id })));
  },
  findActor: name => (world.actors.includes(name) ? { id: `ACT-${name}`, name } : null),
  finish: async () => {},
  eventId: () => `RENOWN-EVT-T${world.events++}`,
  now: () => '2026-10-19T00:00:00.000Z',
});
const newWorld = (actors = ['[TEST] Belwar', '[TEST] Kessa', '[TEST] Orin']) => ({ factions: new Map(), group: new Map(), personal: new Map(), actors, events: 1 });

test('Factions file: 3 [TEST] factions, one revealed, one hidden, one personal-only, linked to pack quests', () => {
  const plan = planImport(factions, new Set());
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.rows.map(r => r.action), ['new', 'new', 'new']);
  const questIds = new Set(quests.records.map(r => r.id));
  for (const row of plan.rows) {
    assert.match(row.name, /\[TEST\]/);
    const f = upgradeFaction(row.definition);
    assert.ok(f.refs.length >= 1);
    for (const r of f.refs) assert.ok(questIds.has(r.target_id), `${row.id} -> ${r.target_id}`);
  }
  const start = Object.fromEntries(factions.starting_state.map(s => [s.faction_id, s]));
  assert.equal(start['FACTION-PT-LANTERN-WARDENS'].party_discovered, true);
  assert.equal(start['FACTION-PT-ASH-BROKERS'].party_discovered, undefined, 'the hidden faction is not revealed');
  const charNames = new Set(byType('PlayerCharacter').map(r => r.foundry.data.name));
  for (const s of factions.starting_state) for (const a of s.actors ?? []) assert.ok(charNames.has(a.name), `${a.name} is a pack character`);
});

test('Factions import writes revealed/hidden/personal states and ranks, and is additive on a second run', async () => {
  const world = newWorld();
  const result = await runImport(planImport(factions, new Set()), worldIo(world));
  assert.equal(result.added.length, 3);
  assert.deepEqual(result.missingActors, []);
  const track = id => upgradeFaction(world.factions.get(id)).renown_track;
  const group = id => world.group.get(id);
  assert.equal(group('FACTION-PT-LANTERN-WARDENS').discovery.party, true);
  assert.equal(group('FACTION-PT-LANTERN-WARDENS').standing.score, 7);
  assert.equal(progressFor(track('FACTION-PT-LANTERN-WARDENS'), 7).rank.name, 'Trusted');
  assert.deepEqual(group('FACTION-PT-ASH-BROKERS').discovery, { party: false, actors: [] }, 'hidden faction is not revealed to anyone');
  assert.equal(group('FACTION-PT-ASH-BROKERS').standing.score, 2);
  assert.equal(group('FACTION-PT-MIRE-FERRYMEN').standing.score, 0);
  assert.deepEqual(group('FACTION-PT-MIRE-FERRYMEN').discovery, { party: false, actors: ['ACT-[TEST] Orin'] });
  const belwar = world.personal.get('FACTION-PT-LANTERN-WARDENS/ACT-[TEST] Belwar');
  assert.equal(belwar.standing.score, 4);
  assert.equal(progressFor(upgradeFaction(world.factions.get('FACTION-PT-LANTERN-WARDENS')).individual_track, 4).rank.name, 'Recognized');
  // Second run: everything exists, nothing is written.
  const before = structuredClone([...world.group]);
  const plan2 = planImport(factions, new Set(world.factions.keys()));
  assert.deepEqual(plan2.rows.map(r => r.action), ['skip', 'skip', 'skip']);
  const again = await runImport(plan2, worldIo(world));
  assert.deepEqual([again.added.length, again.skipped.length], [0, 3]);
  assert.deepEqual([...world.group], before);
});

test('Factions import never changes an existing faction, rejects players, and reports unknown characters', async () => {
  const world = newWorld(['[TEST] Belwar']);
  world.factions.set('FACTION-PT-LANTERN-WARDENS', { id: 'FACTION-PT-LANTERN-WARDENS' });
  const kept = { ...makeGroupRecord({ factionId: 'FACTION-PT-LANTERN-WARDENS' }), standing: { ...blankStanding(), score: 0 } };
  world.group.set('FACTION-PT-LANTERN-WARDENS', kept);
  const result = await runImport(planImport(factions, new Set(world.factions.keys())), worldIo(world));
  assert.deepEqual(result.skipped.map(s => s.id), ['FACTION-PT-LANTERN-WARDENS']);
  assert.equal(world.group.get('FACTION-PT-LANTERN-WARDENS'), kept, 'existing state object untouched');
  assert.equal(world.personal.size, 0, 'Belwar/Kessa renown belongs to the skipped faction');
  assert.deepEqual(result.missingActors, ['[TEST] Orin']);
  const player = newWorld();
  await assert.rejects(runImport(planImport(factions, new Set()), worldIo(player, { gm: false })), /GM authorization/);
  assert.equal(player.factions.size, 0);
  assert.ok(planImport({ ...factions, definitions: [{ ...factions.definitions[0], renown: 9 }] }).errors.length, 'unclassified fields are refused');
  assert.ok(planImport({ ...factions, starting_state: [{ faction_id: 'FACTION-NOPE' }] }).errors.length);
});

// ---- Link macro -------------------------------------------------------------------------------------
const macro = pack.records.find(r => r.id === 'MACRO-PT-LINK-TEST-DATA');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
function linkWorld({ gm = true, withLocations = true, extraTestItems = [] } = {}) {
  const doc = (kind, name, sourceId, i) => ({ name, img: 'x.webp', uuid: `${kind}.${sourceId ?? `local${i}`}`, getFlag: (ns, key) => (sourceId && ns === 'ashen-gate-manager' && key === 'source' ? { sourceId } : undefined) });
  const items = byType('Item').map((r, i) => doc('Item', r.foundry.data.name, r.id, i));
  const journals = byType('JournalEntry').map((r, i) => doc('JournalEntry', r.foundry.data.name, r.id, i));
  // Same name as a pack Item but a different Item the GM owns: must never be linked or touched.
  items.push(doc('Item', 'Test Dagger', null, 99), ...extraTestItems);
  const rt = byType('RollTable')[0].foundry.data;
  const table = {
    name: rt.name, formula: rt.formula, uuid: 'RollTable.t', getFlag: (ns, key) => (ns === 'ashen-gate-manager' && key === 'source' ? { sourceId: 'TABLE-PT-MARSH-FINDS' } : undefined),
    results: rt.results.map(r => ({ ...r, range: [...r.range], documentUuid: null })),
    async createEmbeddedDocuments(type, rows) { assert.equal(type, 'TableResult'); this.results.push(...rows.map(r => ({ ...r }))); },
    async update(patch) { Object.assign(this, patch); },
  };
  const stored = parseImport(pack, []).created;
  const locState = { stored };
  const api = createApi({
    version: '1.5.0', isGM: () => gm, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => structuredClone(locState.stored), writeAll: async list => { locState.stored = list; },
    readViews: () => locState.stored.map(l => playerView(l, locState.stored)).filter(Boolean), placeNote: async () => {}, open() {}, openLocation() {},
  });
  const messages = [];
  const g = {
    user: { id: 'gm1', isGM: gm }, items, journal: journals, tables: [table],
    modules: { get: id => (id === 'ashen-gate-locations' && withLocations ? { active: true, api } : undefined) },
  };
  const run = () => new AsyncFunction('game', 'ui', 'ChatMessage', 'foundry', 'console', macro.foundry.data.command)(
    g, { notifications: { warn: m => messages.push(`warn:${m}`) } }, { create: async d => messages.push(d.content) },
    { utils: { escapeHTML: s => s } }, { log() {}, error() {} });
  return { run, table, api, items, messages, locState };
}
const lootOf = (api, locId) => Object.fromEntries(api.getLocation(locId).loot.map(e => [e.key, e]));

test('Link macro: adds document results to the table and links loot and notes through the Locations API', async () => {
  const w = linkWorld();
  await w.run();
  const docs = w.table.results.filter(r => r.type === 'document');
  assert.deepEqual(docs.map(r => r.documentUuid), ['Item.ITEM-PT-TEST-DAGGER', 'Item.ITEM-PT-MISTVEIL-TONIC', 'Item.ITEM-PT-IRON-HINGE-SET', 'JournalEntry.JRN-PT-MARSH-HANDOUT']);
  assert.deepEqual(docs.map(r => r.range[0]), [7, 8, 9, 10]);
  assert.equal(w.table.formula, '1d10');
  const chapel = lootOf(w.api, 'LOC-PT-DROWNED-CHAPEL');
  assert.deepEqual([chapel.dagger.uuid, chapel.dagger.docType], ['Item.ITEM-PT-TEST-DAGGER', 'Item']);
  assert.equal(chapel.dagger.uuid.includes('local99'), false, 'a same-named Item with no pack id is not used');
  assert.equal(chapel.tonic.uuid, 'Item.ITEM-PT-MISTVEIL-TONIC');
  assert.equal(chapel.coin.uuid, '', 'plain rewards stay plain');
  assert.equal(lootOf(w.api, 'LOC-PT-CHAPEL-CRYPT').buckler.uuid, 'Item.ITEM-PT-ASHWOOD-BUCKLER');
  assert.equal(lootOf(w.api, 'LOC-PT-SUNKEN-CACHE').draught.uuid, 'Item.ITEM-PT-GLASSBLOOM-ELIXIR', 'hidden location is linked too');
  assert.equal(w.api.getLocation('LOC-PT-DROWNED-CHAPEL').notes[0].uuid, 'JournalEntry.JRN-PT-GREENHOLLOW-NOTES');
  // Already-published locations are republished so players see the links; the hidden one is not.
  const chapelRecord = w.locState.stored.find(l => l.id === 'LOC-PT-DROWNED-CHAPEL');
  assert.equal(chapelRecord.published.loot.find(e => e.label === '[TEST] Test Dagger').uuid, 'Item.ITEM-PT-TEST-DAGGER');
  assert.equal(w.locState.stored.find(l => l.id === 'LOC-PT-SUNKEN-CACHE').state, 'hidden');
  assert.match(w.messages.join('\n'), /linked loot "\[TEST\] Test Dagger"/);
});

test('Link macro is idempotent, keeps existing links and edits, and only touches [TEST] data', async () => {
  const w = linkWorld();
  await w.run();
  const snapshot = JSON.stringify([w.table.results, w.locState.stored, w.table.formula]);
  w.messages.length = 0;
  await w.run();
  assert.equal(JSON.stringify([w.table.results, w.locState.stored, w.table.formula]), snapshot, 'second run changes nothing');
  assert.match(w.messages.join('\n'), /already a result/);
  // A GM-set link and a GM-edited table formula are respected.
  const w2 = linkWorld();
  const loc = w2.locState.stored.find(l => l.id === 'LOC-PT-DROWNED-CHAPEL');
  loc.loot.find(e => e.key === 'dagger').uuid = 'Item.MyOwnDagger';
  w2.table.formula = '1d20';
  await w2.run();
  assert.equal(lootOf(w2.api, 'LOC-PT-DROWNED-CHAPEL').dagger.uuid, 'Item.MyOwnDagger');
  assert.equal(w2.table.formula, '1d20');
  assert.match(w2.messages.join('\n'), /formula "1d20" left as you set it/);
  // A second Item bound to the same pack id but not named [TEST] is ignored, not linked.
  const w3 = linkWorld();
  for (const i of w3.items) if (i.uuid === 'Item.ITEM-PT-TEST-DAGGER') i.name = 'Renamed dagger';
  await w3.run();
  assert.equal(lootOf(w3.api, 'LOC-PT-DROWNED-CHAPEL').dagger.uuid, '');
  assert.equal(w3.table.results.some(r => r.documentUuid === 'Item.ITEM-PT-TEST-DAGGER'), false);
});

test('Link macro: players do nothing, and missing Locations or missing documents are reported not fatal', async () => {
  const player = linkWorld({ gm: false });
  await player.run();
  assert.equal(player.table.results.length, 6);
  assert.deepEqual(player.messages.map(m => m.split(':')[0]), ['warn']);
  const noLoc = linkWorld({ withLocations: false });
  await noLoc.run();
  assert.equal(noLoc.table.results.length, 10, 'the table is still linked without Locations');
  assert.match(noLoc.messages.join('\n'), /Locations: module not active/);
  const empty = linkWorld();
  empty.items.length = 0;
  await empty.run();
  assert.equal(empty.table.results.length, 7, 'only the Journal result was available');
  assert.match(empty.messages.join('\n'), /ITEM-PT-TEST-DAGGER not found/);
});

// ---- Headquarters ------------------------------------------------------------------------------------
test('Headquarters activates with the documented ids and needs no HQ-* record in the pack', () => {
  assert.equal(pack.records.some(r => /^HQ-/.test(r.id)), false);
  const s = applyOperation(emptyState(), { isGM: true }, 'activate', { hq_ref: 'HQ-PT-GUILD', location_ref: 'LOC-PT-GREENHOLLOW', campaign_key: 'playtest', guild_key: 'primary' });
  assert.equal(s.active, true);
  assert.ok(byType('Location').some(r => r.id === 'LOC-PT-GREENHOLLOW'));
});
