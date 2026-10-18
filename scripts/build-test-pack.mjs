// Generates the synthetic playtest data pack: a Manager-importable ag-foundry-import/0.2 package.
//   node scripts/build-test-pack.mjs        -> test-fixtures/playtest/AG_Playtest_Pack_<version>.json
// All names are [TEST]-style placeholders with no rules effects and no setting material (public repo).
// Bump PACK_VERSION when the content changes, then regenerate. The output is deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACK_VERSION = '0.4.0';
export const PACK_ID = 'AG-PLAYTEST-PACK';
const SOURCE = 'Synthetic playtest data (not canon)';
const FOLDER = 'Ashen Gate/Playtest';
const ICONS = {
  prof: 'icons/skills/trades/smithing-anvil-silver-red.webp',
  mat: 'icons/commodities/materials/bowl-powder-green.webp',
  recipe: 'icons/commodities/materials/parchment-secrets.webp',
  item: 'icons/commodities/treasure/token-brass-round.webp',
};

const common = (id, type, extra) => ({
  id, entity_type: type, status: 'approved', version: PACK_VERSION,
  provenance: { sources: [SOURCE] }, visibility: 'player', scope: 'generic_rules', ...extra,
});
const ref = (relation, target_id, mode = 'required') => ({ relation, target_id, mode });
// Manager's marker label may not contain ']', so drop the "[TEST] " prefix from labels.
const marker = (id, label) => `[[AGREF:${id}|${label.replace(/\[TEST\] /g, '')}]]`;
const project = (folder, name, type, img, html) => ({
  document_type: 'Item', folder_path: `${FOLDER}/${folder}`,
  data: { name, type, img, system: { description: { value: html } } },
});

const XP_COST = { 1: 5, 2: 8, 3: 11, 4: 14, 5: 17, 6: 20, 7: 23, 8: 26, 9: 29, 10: 32, 11: 35, 12: 38, 13: 41, 14: 44, 15: 47 };
const progression = () => {
  const cumulative = { 1: 0 };
  for (let l = 2; l <= 16; l++) cumulative[l] = cumulative[l - 1] + XP_COST[l - 1];
  return {
    professionLevels: 16,
    tiers: [
      { id: 'apprentice', startsAtLevel: 1, advancement: 'tool-access' },
      { id: 'journeyman', startsAtLevel: 4, advancement: 'automatic' },
      { id: 'expert', startsAtLevel: 7, advancement: 'automatic' },
      { id: 'artisan', startsAtLevel: 10, advancement: 'dm-feat-required' },
      { id: 'master', startsAtLevel: 13, advancement: 'dm-feat-required' },
    ],
    xpTable: {
      startingXP: 0, startingLevel: 1, costFormula: '5 + 3 * (currentLevel - 1)',
      costToNextByCurrentLevel: XP_COST, cumulativeXPToReachLevel: cumulative, cap: 16, status: 'confirmed',
    },
    gatheringBaseDC: [10, 12, 14, 16, 18], criticalMargin: 5, manualXP: true, manualLevelUp: true,
  };
};

// ---- Professions -----------------------------------------------------------------------------
const PROFESSIONS = [
  { id: 'PROF-PT-ALCHEMY', name: '[TEST] Alchemy', kind: 'crafting', workstation: 'Alchemy Laboratory',
    access: { toolProficienciesAnyOf: ["Alchemist's Supplies", 'Herbalism Kit'], toolMustBePresent: true },
    starting: ['REC-PT-EMBER-SALVE', 'REC-PT-MISTVEIL-TONIC'] },
  { id: 'PROF-PT-HERBALISM', name: '[TEST] Herbalism', kind: 'gathering', workstation: null,
    access: { skillProficienciesAnyOf: ['Nature'], advantageToolsAnyOf: ['Herbalism Kit'] },
    starting: [] },
  { id: 'PROF-PT-BLACKSMITHING', name: '[TEST] Blacksmithing', kind: 'crafting', workstation: 'Forge',
    access: { toolProficienciesAnyOf: ["Smith's Tools"], toolMustBePresent: true },
    starting: ['REC-PT-IRON-HINGE-SET', 'REC-PT-TEST-DAGGER'] },
];

// ---- Materials -------------------------------------------------------------------------------
// gatheredBy is optional: only herbs are gathered by a profession in this pack.
const MATERIALS = [
  { id: 'MAT-PT-EMBERROOT', name: '[TEST] Emberroot', tier: 'apprentice', quality: 'Common', unit: 'Bundle', gp: 5, lb: 0.5, gatheredBy: 'PROF-PT-HERBALISM', flavor: 'Warm red roots, placeholder herb.' },
  { id: 'MAT-PT-PALEMOSS', name: '[TEST] Palemoss', tier: 'apprentice', quality: 'Common', unit: 'Handful', gp: 4, lb: 0.25, gatheredBy: 'PROF-PT-HERBALISM', flavor: 'Pale damp moss, placeholder herb.' },
  { id: 'MAT-PT-GLASSBLOOM', name: '[TEST] Glassbloom', tier: 'journeyman', quality: 'Uncommon', unit: 'Bloom', gp: 12, lb: 0.1, gatheredBy: 'PROF-PT-HERBALISM', flavor: 'Translucent flower, placeholder herb.' },
  { id: 'MAT-PT-IRON-ORE', name: '[TEST] Iron Ore', tier: 'apprentice', quality: 'Common', unit: 'Chunk', gp: 3, lb: 2, flavor: 'Rough placeholder ore.' },
  { id: 'MAT-PT-COAL', name: '[TEST] Coal', tier: 'apprentice', quality: 'Common', unit: 'Sack', gp: 2, lb: 5, flavor: 'Placeholder fuel.' },
  { id: 'MAT-PT-LEATHER-STRIPS', name: '[TEST] Leather Strips', tier: 'apprentice', quality: 'Common', unit: 'Bundle', gp: 3, lb: 1, flavor: 'Placeholder binding.' },
  { id: 'MAT-PT-ASHWOOD-PLANKS', name: '[TEST] Ashwood Planks', tier: 'apprentice', quality: 'Common', unit: 'Plank', gp: 4, lb: 3, flavor: 'Placeholder timber.' },
  // Deliberate GM-only example: players must never see this in the Ledger catalog or exports.
  { id: 'MAT-PT-GM-ONLY-RESIN', name: '[TEST] GM-only Resin', tier: 'master', quality: 'Rare', unit: 'Vial', gp: 100, lb: 0.1, visibility: 'gm', flavor: 'GM-only example material. Players must not see this.' },
];

// ---- Recipes ---------------------------------------------------------------------------------
// giveItem: the REC-* "Recipe: ..." Item is a consumable meant to be handed to a player.
// draft: deliberate draft example (player visibility, status draft), not shown until approved.
// tool: a dnd5e tool key the recipe needs; workstation: a named workstation instead. Recipes with
// neither use their profession's tool (Profession Ledger GM Setup).
const RECIPES = [
  { id: 'REC-PT-EMBER-SALVE', item: 'ITEM-PT-EMBER-SALVE', name: '[TEST] Ember Salve', prof: 'PROF-PT-ALCHEMY', tier: 'apprentice', effort: 'short', giveItem: true, tool: 'alchemist',
    ing: [['MAT-PT-EMBERROOT', 2], ['MAT-PT-PALEMOSS', 1]] },
  { id: 'REC-PT-MISTVEIL-TONIC', item: 'ITEM-PT-MISTVEIL-TONIC', name: '[TEST] Mistveil Tonic', prof: 'PROF-PT-ALCHEMY', tier: 'apprentice', effort: 'short',
    ing: [['MAT-PT-PALEMOSS', 2], ['MAT-PT-GLASSBLOOM', 1]] },
  { id: 'REC-PT-GLASSBLOOM-ELIXIR', item: 'ITEM-PT-GLASSBLOOM-ELIXIR', name: '[TEST] Glassbloom Elixir', prof: 'PROF-PT-ALCHEMY', tier: 'journeyman', effort: 'long', workstation: '[TEST] Alchemy Laboratory',
    ing: [['MAT-PT-GLASSBLOOM', 2], ['MAT-PT-EMBERROOT', 1]] },
  { id: 'REC-PT-DRAFT-DRAUGHT', item: 'ITEM-PT-DRAFT-DRAUGHT', name: '[TEST] Draft Draught', prof: 'PROF-PT-ALCHEMY', tier: 'apprentice', effort: 'short', draft: true,
    ing: [['MAT-PT-EMBERROOT', 1]] },
  { id: 'REC-PT-IRON-HINGE-SET', item: 'ITEM-PT-IRON-HINGE-SET', name: '[TEST] Iron Hinge Set', prof: 'PROF-PT-BLACKSMITHING', tier: 'apprentice', effort: 'short', giveItem: true, tool: 'smith',
    ing: [['MAT-PT-IRON-ORE', 2], ['MAT-PT-COAL', 1]] },
  { id: 'REC-PT-TEST-DAGGER', item: 'ITEM-PT-TEST-DAGGER', name: '[TEST] Test Dagger', prof: 'PROF-PT-BLACKSMITHING', tier: 'apprentice', effort: 'long', giveItem: true, tool: 'smith',
    ing: [['MAT-PT-IRON-ORE', 3], ['MAT-PT-COAL', 1], ['MAT-PT-LEATHER-STRIPS', 1]] },
  { id: 'REC-PT-ASHWOOD-BUCKLER', item: 'ITEM-PT-ASHWOOD-BUCKLER', name: '[TEST] Ashwood Buckler', prof: 'PROF-PT-BLACKSMITHING', tier: 'journeyman', effort: 'long',
    ing: [['MAT-PT-IRON-ORE', 2], ['MAT-PT-ASHWOOD-PLANKS', 2]] },
  { id: 'REC-PT-RIVET-POUCH', item: 'ITEM-PT-RIVET-POUCH', name: '[TEST] Rivet Pouch', prof: 'PROF-PT-BLACKSMITHING', tier: 'apprentice', effort: 'short',
    ing: [['MAT-PT-IRON-ORE', 1], ['MAT-PT-COAL', 1], ['MAT-PT-LEATHER-STRIPS', 1]] },
];

const TOOL_NAMES = { alchemist: 'Alchemist’s Supplies', smith: 'Smith’s Tools' };
const matById = new Map(MATERIALS.map(m => [m.id, m]));
const profById = new Map(PROFESSIONS.map(p => [p.id, p]));
const cap = s => s[0].toUpperCase() + s.slice(1);

function professionRecord(p) {
  return common(p.id, 'Profession', {
    refs: p.starting.map(id => ref('starting_recipe', id)),
    name: p.name, profession_kind: p.kind, access: p.access, workstation: p.workstation,
    progression: progression(), starting_recipe_ids: p.starting,
    foundry: project('Professions', `${p.name} — Profession`, 'feat', ICONS.prof,
      `<h2>${p.name}</h2><p>Synthetic playtest profession; no rules text.</p>` +
      (p.starting.length ? `<p>Starting recipes: ${p.starting.map(id => marker(id, id)).join(', ')}</p>` : '')),
  });
}

function materialRecord(m) {
  const refs = m.gatheredBy ? [ref('gathered_by', m.gatheredBy)] : [];
  const flavorLine = `<p>${cap(m.tier)} · ${m.quality} · ${m.gp} gp · ${m.lb} lb · ${m.unit}</p><p>${m.flavor}</p>`;
  return common(m.id, 'Material', {
    ...(m.visibility ? { visibility: m.visibility } : {}),
    refs, name: m.name, tierId: m.tier, quality: m.quality, unit: m.unit, flavor: m.flavor,
    tags: ['standard', 'playtest'], priceGp: m.gp, weightLb: m.lb,
    ...(m.gatheredBy ? { source_profession_id: m.gatheredBy } : {}),
    foundry: project('Materials', m.name, 'loot', ICONS.mat,
      `<h2>${m.name}</h2>${flavorLine}` + (m.gatheredBy ? `<p>Gathered through ${marker(m.gatheredBy, profById.get(m.gatheredBy).name)}.</p>` : '')),
  });
}

function recipeRecord(r) {
  const gp = r.ing.reduce((sum, [id, qty]) => sum + matById.get(id).gp * qty, 0);
  const summary = `Placeholder recipe for playtesting; no rules effect. ${r.name} is crafted from the listed materials.`;
  const status = r.draft ? { status: 'draft' } : {};
  const ingredientsHtml = r.ing.map(([id, qty]) => `${qty} × ${marker(id, matById.get(id).name)}`).join(', ');
  return common(r.id, 'Recipe', {
    ...status,
    refs: [ref('crafted_by', r.prof), ref('produces', r.item), ...r.ing.map(([id]) => ref('requires_material', id))],
    name: r.name, tier: r.tier, starting: profById.get(r.prof).starting.includes(r.id), origin: 'original',
    effort: r.effort, price_class: 'common_consumable', market_gp: gp * 2, craft_gp: gp, additional_gp: 0,
    rules_summary: summary, profession_id: r.prof, result_item_id: r.item,
    ...(r.tool ? { tool: r.tool } : {}), ...(r.workstation ? { workstation: r.workstation } : {}),
    ingredients: r.ing.map(([material_id, quantity]) => ({ material_id, quantity, material_value_gp: matById.get(material_id).gp })),
    // Recipe Items that are handed to players are consumables; the rest are loot like the older fixtures.
    foundry: project('Recipes', `Recipe: ${r.name}`, r.giveItem ? 'consumable' : 'loot', ICONS.recipe,
      `<h2>Recipe: ${r.name}</h2><p>${marker(r.prof, profById.get(r.prof).name)} · ${cap(r.tier)} · ${r.effort} effort${r.draft ? ' · DRAFT example' : ''}</p>` +
      `<p>Requires ${ingredientsHtml}.</p>` +
      (r.tool ? `<p>Tool: ${TOOL_NAMES[r.tool]}.</p>` : r.workstation ? `<p>Workstation: ${r.workstation}.</p>` : '') +
      `<p>Produces ${marker(r.item, r.name)}.</p><p>${summary}</p>`),
  });
}

function itemRecord(r) {
  const gp = r.ing.reduce((sum, [id, qty]) => sum + matById.get(id).gp * qty, 0);
  const summary = 'Placeholder item for playtesting; no rules effect.';
  return common(r.item, 'Item', {
    ...(r.draft ? { status: 'draft' } : {}),
    refs: [ref('created_by', r.id)],
    name: r.name, origin: 'original', rarity_price_class: 'common_consumable', market_gp: gp * 2,
    rules_summary: summary, created_by_recipe_id: r.id,
    foundry: project('Items', r.name, 'loot', ICONS.item,
      `<h2>${r.name}</h2><p>${summary}</p><p>Crafted from ${marker(r.id, `Recipe: ${r.name}`)}.</p>`),
  });
}

// ---- Locations ---------------------------------------------------------------------------------
// Location records use the Locations module's import shape (see modules/ashen-gate-locations/README.md):
// Manager validates them and leaves them to Locations (GM Setup -> Import JSON imports the same file).
// One location per threat level, each with 1-2 finite gathering nodes (skill, tier, DC; common bundle on
// success, rare on success by 5+). Deliberate visibility examples: the Deadly location is unrevealed,
// Cinder Quarry hides its description and its Coal node, Greenhollow hides a note and shows one DC.
// Node: [id, skill, tier, common MAT, rare MAT or null, options]; DC defaults by tier (10/12/13/14/15).
const LOCATIONS = [
  { id: 'LOC-PT-GREENHOLLOW', name: '[TEST] Greenhollow', type: 'Village', region: '[TEST] Playtest Vale', threat: 'normal', revealed: true,
    description: 'Placeholder farming village surrounded by herb meadows.',
    sections: { resources: true, factions: true, related: true, notes: true },
    nodes: [['pt-greenhollow-roots', 'Herbalism', 1, 'MAT-PT-EMBERROOT', 'MAT-PT-GLASSBLOOM', { dcVisible: true, note: '[TEST] One meadow patch.' }],
      ['pt-greenhollow-moss', 'Herbalism', 1, 'MAT-PT-PALEMOSS', null, { available: false, note: '[TEST] Under snow until spring.' }]],
    factions: [{ label: '[TEST] Herbalists\' Circle' }],
    related: ['LOC-PT-CINDER-QUARRY', 'LOC-PT-ASH-HOLLOW'],
    notes: [{ title: 'Rumour', text: 'Smoke rises from the quarry at night.' }, { title: 'GM note', text: '[TEST] Hidden note players must not see.', visible: false }] },
  { id: 'LOC-PT-CINDER-QUARRY', name: '[TEST] Cinder Quarry', type: 'Quarry', region: '[TEST] Playtest Vale', threat: 'hot', revealed: true,
    description: '[TEST] Hidden description players must not see.', show: { description: false },
    sections: { resources: true, related: true },
    nodes: [['pt-cinder-seam', 'Mining', 1, 'MAT-PT-IRON-ORE', null, { dc: 13, note: '[TEST] One exposed seam.' }],
      ['pt-cinder-coal', 'Mining', 2, 'MAT-PT-COAL', null, { visible: false }]],
    related: ['LOC-PT-GREENHOLLOW'] },
  { id: 'LOC-PT-ASH-HOLLOW', name: '[TEST] Ash Hollow', type: 'Cave', region: '[TEST] Playtest Vale', threat: 'deadly', revealed: false,
    description: '[TEST] Unrevealed location players must not see.',
    sections: { resources: true },
    nodes: [['pt-ash-hollow-resin', 'Herbalism', 5, 'MAT-PT-GM-ONLY-RESIN', null, {}]] },
];

const DC_BY_TIER = { 1: 10, 2: 12, 3: 13, 4: 14, 5: 15 };

export function buildLocations(materialIds) {
  const known = new Set(materialIds);
  const name = id => MATERIALS.find(m => m.id === id).name;
  return LOCATIONS.map(({ id, name: locName, related = [], nodes = [], ...rest }) => {
    for (const [, , , mat, rare] of nodes) for (const m of [mat, rare].filter(Boolean)) if (!known.has(m)) throw new Error(`${id}: unknown material ${m}`);
    return {
      id, entity_type: 'Location', status: 'approved', version: PACK_VERSION,
      provenance: { sources: [SOURCE] }, visibility: 'player', refs: [], name: locName,
      location: {
        name: locName, ...rest,
        resources: nodes.map(([nodeId, skill, tier, mat, rare, opts]) => ({
          id: nodeId, label: name(mat), skill, tier, dc: opts.dc ?? DC_BY_TIER[tier], dcVisible: opts.dcVisible ?? false,
          materialId: mat, quantity: 1, rareMaterialId: rare ?? '', rareQuantity: 1, finite: true, exhausted: false,
          available: opts.available ?? true, visible: opts.visible ?? true, note: opts.note ?? '',
        })),
        related: related.map(locationId => ({ locationId })),
      },
    };
  });
}

export function buildPack() {
  const materialIds = MATERIALS.map(m => m.id);
  return {
    manifest: {
      schema_version: 'ag-foundry-import/0.2',
      package_id: PACK_ID,
      version: PACK_VERSION,
      description: 'Synthetic playtest pack: 3 professions, 8 materials, 8 recipes with crafted items, 3 give-to-player recipe items. ' +
        '3 locations (Normal/Hot/Deadly) with finite gathering nodes for the Locations module. ' +
        'Includes one GM-only material, one draft recipe/item and hidden location content as deliberate visibility examples. Not canon.',
    },
    records: [
      ...PROFESSIONS.map(professionRecord),
      ...MATERIALS.map(materialRecord),
      ...RECIPES.map(recipeRecord),
      ...RECIPES.map(itemRecord),
      ...buildLocations(materialIds),
    ],
  };
}

export const packFileName = () => `AG_Playtest_Pack_${PACK_VERSION}.json`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures', 'playtest');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, packFileName());
  fs.writeFileSync(out, JSON.stringify(buildPack(), null, 2) + '\n');
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
}
