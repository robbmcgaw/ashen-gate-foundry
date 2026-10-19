// Repo-level check of the synthetic playtest data: every file loads in the module that reads it, ids are unique
// and permanent-prefixed, and every cross-reference resolves. Proves logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPack, buildQuests, buildSkillTrees, buildHqFacilities, packFileName, questsFileName, skillTreesFileName, hqFileName, PACK_VERSION } from './build-test-pack.mjs';
import { validatePackage } from '../modules/ashen-gate-manager/scripts/core.js';
import { parseImport, importRecords } from '../modules/ashen-gate-locations/scripts/model.mjs';
import { normalizePackage } from '../modules/ashen-gate-quest-manager/scripts/core.mjs';
import { validatePackage as validateTrees } from '../modules/ashen-gate-skill-trees/scripts/engine.mjs';
import { validateDefinition } from '../modules/ashen-gate-headquarters/js/logic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'test-fixtures/playtest');
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const pack = read(packFileName());
const quests = read(questsFileName());
const trees = read(skillTreesFileName());
const facilities = read(hqFileName());
const PERMANENT = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const ids = new Set(pack.records.map(r => r.id));
const byType = t => pack.records.filter(r => r.entity_type === t);
const AGREF = /\[\[AGREF:([A-Z0-9-]+)(?:\|[^\]]*)?\]\]/g;

test('committed files are up to date with scripts/build-test-pack.mjs', () => {
  assert.deepEqual(pack, buildPack());
  assert.deepEqual(quests, buildQuests());
  assert.deepEqual(trees, buildSkillTrees());
  assert.deepEqual(facilities, buildHqFacilities());
  assert.equal(pack.manifest.version, PACK_VERSION);
  assert.deepEqual(fs.readdirSync(dir).filter(f => /^AG_Playtest_/.test(f)).sort(),
    [hqFileName(), packFileName(), questsFileName(), skillTreesFileName()].sort(), 'no stale pack versions left behind');
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
  assert.ok(byType('Hireling').length === 1 && byType('ProfessionPerk').length === 4 && byType('Item').length >= 12);
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
    for (const n of t.nodes) if (n.contentRef) assert.ok(ids.has(n.contentRef.target_id), `${n.id} -> ${n.contentRef.target_id}`);
  }
  assert.ok(trees.trees.some(t => t.provider.kind === 'profession' && t.sourceRef === 'PROF-PT-ALCHEMY'));
  const facIds = facilities.map(f => f.id);
  assert.equal(new Set(facIds).size, facIds.length);
  for (const f of facilities) { assert.equal(validateDefinition(f), true); assert.match(f.name, /\[TEST\]/); }
});

test('only the deliberate examples are gm-only or draft', () => {
  const exceptions = pack.records.filter(r => r.status !== 'approved' || r.visibility !== 'player').map(r => r.id).sort();
  assert.deepEqual(exceptions, ['ITEM-PT-DRAFT-DRAUGHT', 'JRN-PT-CHAPEL-GM-NOTES', 'MAT-PT-GM-ONLY-RESIN', 'PERK-PT-ALCH-MASTER-TOUCH', 'REC-PT-DRAFT-DRAUGHT']);
});
