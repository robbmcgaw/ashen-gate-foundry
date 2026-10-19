// Generates the synthetic playtest data: a Manager-importable ag-foundry-import/0.2 package plus the four
// module-specific import files (Quest Manager, Skill Trees, Headquarters facilities, Factions).
//   node scripts/build-test-pack.mjs        -> test-fixtures/playtest/AG_Playtest_*_<version>.json
// All names are [TEST]-style placeholders with no rules effects and no setting material (public repo).
// Bump PACK_VERSION when the content changes, then regenerate. The output is deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFaction, sourceDefinition } from '../modules/ashen-gate-factions/scripts/core.mjs';

export const PACK_VERSION = '0.6.1';
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
  // Enchanting is the profession; Arcana is only the skill it checks by default (Ledger GM Setup). It is not gated
  // behind a skill proficiency, and a recipe may name its own tool (Jeweler's or Woodcarver's Tools).
  { id: 'PROF-PT-ENCHANTING', name: '[TEST] Enchanting', kind: 'crafting', workstation: null,
    access: {},
    starting: ['REC-PT-WARDING-CHARM'] },
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
  { id: 'MAT-PT-ARCANE-DUST', name: '[TEST] Arcane Dust', tier: 'apprentice', quality: 'Common', unit: 'Pinch', gp: 6, lb: 0.1, flavor: 'Glittering placeholder dust.' },
  { id: 'MAT-PT-GEM-CHIPS', name: '[TEST] Gem Chips', tier: 'apprentice', quality: 'Common', unit: 'Pouch', gp: 8, lb: 0.2, flavor: 'Placeholder gem fragments.' },
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
  // Enchanting: no tool of its own (rolls the Arcana skill), or a per-recipe tool rolled beside Arcana.
  { id: 'REC-PT-WARDING-CHARM', item: 'ITEM-PT-WARDING-CHARM', name: '[TEST] Warding Charm', prof: 'PROF-PT-ENCHANTING', tier: 'apprentice', effort: 'short',
    ing: [['MAT-PT-ARCANE-DUST', 2]] },
  { id: 'REC-PT-JEWELED-WARD-RING', item: 'ITEM-PT-JEWELED-WARD-RING', name: '[TEST] Jeweled Ward Ring', prof: 'PROF-PT-ENCHANTING', tier: 'apprentice', effort: 'short', tool: 'jeweler',
    ing: [['MAT-PT-GEM-CHIPS', 2], ['MAT-PT-ARCANE-DUST', 1]] },
  { id: 'REC-PT-GEMSET-PENDANT', item: 'ITEM-PT-GEMSET-PENDANT', name: '[TEST] Gemset Pendant', prof: 'PROF-PT-ENCHANTING', tier: 'journeyman', effort: 'long', tool: 'jeweler',
    ing: [['MAT-PT-GEM-CHIPS', 3], ['MAT-PT-ARCANE-DUST', 2]] },
  { id: 'REC-PT-CARVED-WARD-TOTEM', item: 'ITEM-PT-CARVED-WARD-TOTEM', name: '[TEST] Carved Ward Totem', prof: 'PROF-PT-ENCHANTING', tier: 'apprentice', effort: 'short', giveItem: true, tool: 'woodcarver',
    ing: [['MAT-PT-ASHWOOD-PLANKS', 2], ['MAT-PT-ARCANE-DUST', 1]] },
];

const TOOL_NAMES = { alchemist: 'Alchemist’s Supplies', smith: 'Smith’s Tools', jeweler: 'Jeweler’s Tools', woodcarver: 'Woodcarver’s Tools' };
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
    sections: { resources: true, factions: true, related: true, notes: true, quests: true },
    quests: [{ questId: 'QUEST-PT-GREENHOLLOW-HERBS' }],
    nodes: [['pt-greenhollow-roots', 'Herbalism', 1, 'MAT-PT-EMBERROOT', 'MAT-PT-GLASSBLOOM', { dcVisible: true, note: '[TEST] One meadow patch.' }],
      ['pt-greenhollow-moss', 'Herbalism', 1, 'MAT-PT-PALEMOSS', null, { available: false, note: '[TEST] Under snow until spring.' }]],
    factions: [{ label: '[TEST] Herbalists\' Circle' }],
    related: ['LOC-PT-CINDER-QUARRY', 'LOC-PT-ASH-HOLLOW'],
    notes: [{ title: 'Rumour', text: 'Smoke rises from the quarry at night.' }, { title: 'GM note', text: '[TEST] Hidden note players must not see.', visible: false }] },
  { id: 'LOC-PT-CINDER-QUARRY', name: '[TEST] Cinder Quarry', type: 'Quarry', region: '[TEST] Playtest Vale', threat: 'hot', revealed: true,
    description: '[TEST] Hidden description players must not see.', show: { description: false },
    sections: { resources: true, related: true, quests: true },
    quests: [{ questId: 'QUEST-PT-QUARRY-SMOKE' }],
    nodes: [['pt-cinder-seam', 'Mining', 1, 'MAT-PT-IRON-ORE', null, { dc: 13, note: '[TEST] One exposed seam.' }],
      ['pt-cinder-coal', 'Mining', 2, 'MAT-PT-COAL', null, { visible: false }]],
    related: ['LOC-PT-GREENHOLLOW'] },
  { id: 'LOC-PT-ASH-HOLLOW', name: '[TEST] Ash Hollow', type: 'Cave', region: '[TEST] Playtest Vale', threat: 'deadly', revealed: false,
    description: '[TEST] Unrevealed location players must not see.',
    sections: { resources: true },
    nodes: [['pt-ash-hollow-resin', 'Herbalism', 5, 'MAT-PT-GM-ONLY-RESIN', null, {}]] },

  // ---- Point-crawl: Region > site > room, plus a Hidden and an Unidentified place nested in it. ----
  // Loot entries name pack Items by label and ITEM id in their text: a native link needs a world UUID, which an import
  // cannot know. The pack's "[TEST] Link test data" macro reads that id and links the entry (see the README).
  { id: 'LOC-PT-HOLLOWMERE', name: '[TEST] Hollowmere Marsh', type: 'Region', region: '[TEST] Playtest Vale', threat: 'hot', state: 'revealed', isRegion: true,
    description: 'Placeholder drowned marsh. A Region: its conditions pass to every place inside it.',
    sections: { conditions: true, related: true, quests: true, notes: true },
    conditions: [
      { key: 'fog', label: '[TEST] Dense fog', text: 'Placeholder condition text, no rules effect.', visible: true },
      { key: 'mire', label: '[TEST] Sucking mire', text: 'Placeholder condition text, no rules effect.', visible: true },
      { key: 'omen', label: '[TEST] Whispering omen', text: '[TEST] GM-only condition players must not see.', visible: false },
    ],
    quests: [{ questId: 'QUEST-PT-MARSH-LIGHTS' }],
    related: ['LOC-PT-GREENHOLLOW'],
    notes: [{ title: 'Marsh rumour', text: '[TEST] Pale lights drift near the old chapel.' }] },
  { id: 'LOC-PT-DROWNED-CHAPEL', name: '[TEST] Drowned Chapel', type: 'Ruin', region: '[TEST] Playtest Vale', threat: 'hot', state: 'revealed',
    parentLocationId: 'LOC-PT-HOLLOWMERE',
    description: 'Placeholder flooded chapel on a mound. A child of Hollowmere Marsh.',
    sections: { conditions: true, resources: true, loot: true, notes: true, quests: true },
    conditionOverrides: [
      { from: 'LOC-PT-HOLLOWMERE', conditionKey: 'fog', disabled: true },
      { from: 'LOC-PT-HOLLOWMERE', conditionKey: 'mire', label: '[TEST] Flooded floor', text: 'Placeholder override text, no rules effect.' },
    ],
    conditions: [{ key: 'echo', label: '[TEST] Echoing nave', text: 'Placeholder condition text, no rules effect.', visible: true }],
    quests: [{ questId: 'QUEST-PT-MARSH-LIGHTS' }],
    // One node per state: renewable (not finite), finite and available, finite and exhausted, GM-only.
    nodes: [
      ['pt-chapel-reeds', 'Herbalism', 1, 'MAT-PT-PALEMOSS', null, { finite: false, note: '[TEST] Renewable: never runs out.' }],
      ['pt-chapel-roots', 'Herbalism', 1, 'MAT-PT-EMBERROOT', 'MAT-PT-GLASSBLOOM', { note: '[TEST] Finite, still available.' }],
      ['pt-chapel-bloom', 'Herbalism', 2, 'MAT-PT-GLASSBLOOM', null, { exhausted: true, note: '[TEST] Finite and already exhausted.' }],
      ['pt-chapel-seam', 'Mining', 1, 'MAT-PT-IRON-ORE', null, { visible: false, note: '[TEST] GM-only node.' }],
    ],
    loot: [
      { key: 'dagger', label: '[TEST] Test Dagger', text: 'Pack Item ITEM-PT-TEST-DAGGER.', status: 'available', visible: true },
      { key: 'tonic', label: '[TEST] Mistveil Tonic', text: 'Pack Item ITEM-PT-MISTVEIL-TONIC.', status: 'discovered', visible: true },
      { key: 'hinges', label: '[TEST] Iron Hinge Set', text: 'Pack Item ITEM-PT-IRON-HINGE-SET.', status: 'taken', visible: true },
      { key: 'coin', label: '[TEST] 25 gp in a rotted purse', text: 'Plain-text reward, no item.', status: 'available', visible: true },
      { key: 'secret', label: '[TEST] GM-only stash', text: '[TEST] Hidden loot players must not see.', status: 'available', visible: false },
    ],
    notes: [{ title: 'Location note', text: '[TEST] Pack Journal JRN-PT-GREENHOLLOW-NOTES.' }] },
  { id: 'LOC-PT-CHAPEL-CRYPT', name: '[TEST] Chapel Crypt', type: 'Room', region: '[TEST] Playtest Vale', threat: 'deadly', state: 'revealed',
    parentLocationId: 'LOC-PT-DROWNED-CHAPEL',
    description: 'Placeholder crypt room. A grandchild: it inherits Hollowmere\'s conditions through the chapel.',
    sections: { resources: true, loot: true },
    nodes: [['pt-crypt-ore', 'Mining', 2, 'MAT-PT-IRON-ORE', 'MAT-PT-COAL', {}]],
    loot: [
      { key: 'buckler', label: '[TEST] Ashwood Buckler', text: 'Pack Item ITEM-PT-ASHWOOD-BUCKLER.', status: 'available', visible: true },
      { key: 'pouch', label: '[TEST] Rivet Pouch', text: 'Pack Item ITEM-PT-RIVET-POUCH.', status: 'available', visible: true },
    ],
    details: [{ key: 'inscription', title: '[TEST] Worn inscription', text: '[TEST] A custom Add Detail block.', visible: true }] },
  { id: 'LOC-PT-SUNKEN-CACHE', name: '[TEST] Sunken Cache', type: 'Cache', region: '[TEST] Playtest Vale', threat: 'normal', state: 'hidden',
    parentLocationId: 'LOC-PT-DROWNED-CHAPEL',
    description: '[TEST] Hidden location players must not see.',
    sections: { loot: true },
    loot: [{ key: 'draught', label: '[TEST] Glassbloom Elixir', text: 'Pack Item ITEM-PT-GLASSBLOOM-ELIXIR.', status: 'available', visible: true }] },
  { id: 'LOC-PT-LANTERN-MOUND', name: '[TEST] Lantern Mound', type: 'Mound', region: '[TEST] Playtest Vale', threat: 'hot', state: 'unidentified',
    parentLocationId: 'LOC-PT-HOLLOWMERE',
    unidentifiedLabel: '[TEST] A distant light', teaser: '[TEST] Something glimmers between the reeds. Players see only this.',
    description: '[TEST] True description players must not see until revealed.',
    sections: { resources: true },
    nodes: [['pt-mound-roots', 'Herbalism', 3, 'MAT-PT-GLASSBLOOM', null, {}]] },
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
          materialId: mat, quantity: 1, rareMaterialId: rare ?? '', rareQuantity: 1, finite: opts.finite ?? true, exhausted: opts.exhausted ?? false,
          available: opts.available ?? true, visible: opts.visible ?? true, note: opts.note ?? '',
        })),
        related: related.map(locationId => ({ locationId })),
      },
    };
  });
}

// ---- Perks (Skill Tree nodes name these by PERK-* id). Alchemy perks: the Ledger owns who has chosen them.
// The PERK-PT-GEN-* perks sit on the generic points tree; unlocking one there adds it to the character sheet.
// point_cost is the Skill Trees point cost (it lives on the perk; 1 when absent).
const PERKS = [
  { id: 'PERK-PT-ALCH-STEADY-HANDS', name: '[TEST] Steady Hands', prof: 'PROF-PT-ALCHEMY' },
  { id: 'PERK-PT-ALCH-FRUGAL-BREW', name: '[TEST] Frugal Brew', prof: 'PROF-PT-ALCHEMY' },
  { id: 'PERK-PT-ALCH-QUICK-BREW', name: '[TEST] Quick Brew', prof: 'PROF-PT-ALCHEMY' },
  { id: 'PERK-PT-ALCH-MASTER-TOUCH', name: '[TEST] Master’s Touch', prof: 'PROF-PT-ALCHEMY', visibility: 'gm' },
  { id: 'PERK-PT-GEN-FOUNDATION', name: '[TEST] Foundation', prof: 'PROF-PT-HERBALISM', cost: 1 },
  { id: 'PERK-PT-GEN-LEFT-PATH', name: '[TEST] Left Path', prof: 'PROF-PT-HERBALISM', cost: 1 },
  { id: 'PERK-PT-GEN-RIGHT-PATH', name: '[TEST] Right Path', prof: 'PROF-PT-HERBALISM', cost: 1 },
  { id: 'PERK-PT-GEN-FINAL', name: '[TEST] Final Step', prof: 'PROF-PT-HERBALISM', cost: 2 },
];
function perkRecord(p) {
  return common(p.id, 'ProfessionPerk', {
    ...(p.visibility ? { visibility: p.visibility } : {}),
    refs: [ref('perk_of', p.prof)], name: p.name, profession_id: p.prof, ...(p.cost ? { point_cost: p.cost } : {}),
    foundry: project('Perks', p.name, 'feat', ICONS.prof,
      `<h2>${p.name}</h2><p>Synthetic playtest perk of ${marker(p.prof, profById.get(p.prof).name)}; no rules effect.</p>`),
  });
}

// ---- Ordinary items (party stash and Actor inventories) --------------------------------------------
const STASH = [
  { id: 'ITEM-PT-STASH-ROPE', name: '[TEST] Rope (50 ft)', type: 'loot', lb: 10 },
  { id: 'ITEM-PT-STASH-RATIONS', name: '[TEST] Trail Rations', type: 'consumable', lb: 2 },
  { id: 'ITEM-PT-STASH-LANTERN', name: '[TEST] Hooded Lantern', type: 'loot', lb: 2 },
  { id: 'ITEM-PT-STASH-LEDGER', name: '[TEST] Sealed Travel Ledger', type: 'loot', lb: 1 },
];
const stashById = new Map(STASH.map(i => [i.id, i]));
function stashRecord(i) {
  return common(i.id, 'Item', {
    refs: [], name: i.name, origin: 'original', rules_summary: 'Ordinary placeholder item for the party stash; no rules effect.',
    foundry: { ...project('Items/Stash', i.name, i.type, ICONS.item, `<h2>${i.name}</h2><p>Ordinary placeholder item; no rules effect.</p>`),
      data: { name: i.name, type: i.type, img: ICONS.item, system: { quantity: 1, weight: { value: i.lb, units: 'lb' }, description: { value: `<h2>${i.name}</h2><p>Ordinary placeholder item; no rules effect.</p>` } } } },
  });
}

// ---- Test characters --------------------------------------------------------------------------------
// New Actors only: Manager never updates an existing Actor. Profession progress, known recipes, materials and
// tools are seeded on these brand-new synthetic characters so the Ledger has something to show; the modules
// still own that state afterwards. Ownership cannot be imported (Manager sets it to None); the GM assigns it.
const sourceFlag = (id, entityType, extra = {}) => ({ 'ashen-gate-manager': { source: { sourceId: id, entityType, status: 'approved', visibility: 'player', scope: 'generic_rules', version: PACK_VERSION, sourceVersion: PACK_VERSION, packageId: PACK_ID, packageVersion: PACK_VERSION, ...extra } } });
const owned = (id, entityType, type, name, img, quantity, system = {}) => ({
  name, type, img, system: { quantity, description: { value: `<p>${name}. Synthetic playtest item.</p>` }, ...system }, flags: sourceFlag(id, entityType),
});
const TOOLS = {
  alchemist: { name: 'Alchemist’s Supplies', key: 'alchemist' },
  smith: { name: 'Smith’s Tools', key: 'smith' },
  herb: { name: 'Herbalism Kit', key: 'herb' },
  jeweler: { name: 'Jeweler’s Tools', key: 'jeweler' },
};
const toolItem = key => ({ name: TOOLS[key].name, type: 'tool', img: ICONS.item, system: { quantity: 1, type: { value: 'art', baseItem: TOOLS[key].key } } });
const material = (id, qty) => owned(id, 'Material', 'loot', matById.get(id).name, ICONS.mat, qty);
const profItem = id => owned(id, 'Profession', 'feat', `${profById.get(id).name} — Profession`, ICONS.prof, 1);
const recipeItem = (recId, qty) => {
  const r = RECIPES.find(x => x.id === recId);
  return owned(recId, 'Recipe', 'consumable', `Recipe: ${r.name}`, ICONS.recipe, qty);
};
const stashItem = id => owned(id, 'Item', stashById.get(id).type, stashById.get(id).name, ICONS.item, 1);
const progress = professions => ({ schema: 'ag-profession-actor-progress/0.1', professions });
const effect = (name, statuses) => ({ name, img: 'icons/svg/aura.svg', statuses, disabled: false, transfer: false });

const CHARACTERS = [
  { id: 'PC-PT-BELWAR', name: '[TEST] Belwar', prof: 'PROF-PT-ALCHEMY', tool: 'alchemist', skills: ['arc'],
    bio: 'Test alchemist and enchanter. Carries the Ember Salve recipe item (not yet learned) and the materials to brew it. Also holds Enchanting and Jeweler’s Tools, and knows two Enchanting recipes (the Carved Ward Totem needs Woodcarver’s Tools, which Belwar lacks).',
    items: [toolItem('alchemist'), profItem('PROF-PT-ALCHEMY'), recipeItem('REC-PT-EMBER-SALVE', 1),
      toolItem('jeweler'), profItem('PROF-PT-ENCHANTING'), recipeItem('REC-PT-CARVED-WARD-TOTEM', 1),
      material('MAT-PT-ARCANE-DUST', 4), material('MAT-PT-GEM-CHIPS', 3), material('MAT-PT-ASHWOOD-PLANKS', 2),
      material('MAT-PT-EMBERROOT', 4), material('MAT-PT-PALEMOSS', 2), material('MAT-PT-GLASSBLOOM', 1),
      stashItem('ITEM-PT-STASH-ROPE'), stashItem('ITEM-PT-STASH-RATIONS')],
    flags: { progress: progress({ 'PROF-PT-ALCHEMY': { xp: 10, selectedPerkIds: [] }, 'PROF-PT-ENCHANTING': { xp: 0, selectedPerkIds: [] } }),
      knownRecipes: ['REC-PT-WARDING-CHARM', 'REC-PT-JEWELED-WARD-RING'] },
    effects: [effect('[TEST] Poisoned', ['poisoned']), effect('[TEST] Stonefast (custom)', ['pt-stonefast'])] },
  { id: 'PC-PT-KESSA', name: '[TEST] Kessa', prof: 'PROF-PT-BLACKSMITHING', tool: 'smith', skills: ['ath'],
    bio: 'Test smith. Already knows the Iron Hinge Set recipe; carries a Test Dagger recipe item with quantity 2.',
    items: [toolItem('smith'), profItem('PROF-PT-BLACKSMITHING'), recipeItem('REC-PT-TEST-DAGGER', 2),
      material('MAT-PT-IRON-ORE', 5), material('MAT-PT-COAL', 2), material('MAT-PT-LEATHER-STRIPS', 1),
      stashItem('ITEM-PT-STASH-LANTERN'), stashItem('ITEM-PT-STASH-LEDGER')],
    flags: { progress: progress({ 'PROF-PT-BLACKSMITHING': { xp: 5, selectedPerkIds: [] } }), knownRecipes: ['REC-PT-IRON-HINGE-SET'] },
    effects: [effect('[TEST] Prone', ['prone']), effect('[TEST] Hexed (custom)', ['pt-hexed'])] },
  { id: 'PC-PT-ORIN', name: '[TEST] Orin', prof: 'PROF-PT-HERBALISM', tool: 'herb', skills: ['nat'],
    bio: 'Test herbalist (gathering). Short on materials on purpose, to show missing-ingredient states.',
    items: [toolItem('herb'), profItem('PROF-PT-HERBALISM'),
      material('MAT-PT-EMBERROOT', 1), material('MAT-PT-ASHWOOD-PLANKS', 2), material('MAT-PT-IRON-ORE', 1),
      stashItem('ITEM-PT-STASH-ROPE'), stashItem('ITEM-PT-STASH-RATIONS'), stashItem('ITEM-PT-STASH-LEDGER')],
    flags: { progress: progress({ 'PROF-PT-HERBALISM': { xp: 0, selectedPerkIds: [] } }) },
    effects: [] },
];
function characterRecord(c) {
  const bio = `<h2>${c.name}</h2><p>${c.bio}</p><p>Profession: ${marker(c.prof, profById.get(c.prof).name)}.</p>`;
  const abilities = Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map(a => [a, { value: 10 }]));
  const flags = {};
  if (c.flags.progress) flags.professionProgress = c.flags.progress;
  if (c.flags.knownRecipes) flags.knownRecipes = c.flags.knownRecipes;
  return common(c.id, 'PlayerCharacter', {
    refs: [ref('has_profession', c.prof)], name: c.name,
    foundry: {
      document_type: 'Actor', folder_path: `${FOLDER}/Characters`,
      data: {
        name: c.name, type: 'character', img: 'icons/svg/mystery-man.svg',
        system: { abilities, tools: { [TOOLS[c.tool].key]: { value: 1 } }, skills: Object.fromEntries(c.skills.map(k => [k, { value: 1 }])), details: { biography: { value: bio } } },
        items: c.items, effects: c.effects,
        flags: { 'ashen-gate-profession-ledger': flags },
      },
    },
  });
}

// ---- Journals ---------------------------------------------------------------------------------------
const JOURNALS = [
  { id: 'JRN-PT-GREENHOLLOW-NOTES', name: '[TEST] Greenhollow — Field Notes', visibility: 'player',
    pages: [['Overview', '<p>Synthetic location note. Drag this Journal onto a Location’s Notes entry to link it.</p><p>Herbs here: ' + marker('MAT-PT-EMBERROOT', 'Emberroot') + ', ' + marker('MAT-PT-PALEMOSS', 'Palemoss') + '.</p>'],
      ['Rumours', '<p>[TEST] Smoke rises from the quarry at night.</p>']] },
  { id: 'JRN-PT-MARSH-HANDOUT', name: '[TEST] Marsh Crossing — Handout', visibility: 'player',
    pages: [['Handout', '<p>[TEST] A hand-drawn crossing sketch. Player-facing handout.</p>']] },
  { id: 'JRN-PT-CHAPEL-GM-NOTES', name: '[TEST] Drowned Chapel — GM Notes', visibility: 'gm',
    pages: [['GM only', '<p>[TEST] GM-only note. Players must never see this Journal.</p>']] },
];
function journalRecord(j) {
  return common(j.id, 'JournalEntry', {
    visibility: j.visibility, refs: [], name: j.name,
    foundry: { document_type: 'JournalEntry', folder_path: `${FOLDER}/Journals`, data: { name: j.name, pages: j.pages.map(([name, content]) => ({ name, type: 'text', text: { content, format: 1 } })) } },
  });
}

// ---- Roll table -------------------------------------------------------------------------------------
// Text results only: a document result needs a world UUID, which an import cannot know. The "[TEST] Link test data"
// macro adds the document results below (TABLE_LINKS) once the Items and Journal exist in the world.
const TABLE_LINKS = ['ITEM-PT-TEST-DAGGER', 'ITEM-PT-MISTVEIL-TONIC', 'ITEM-PT-IRON-HINGE-SET', 'JRN-PT-MARSH-HANDOUT'];
const TABLES = [{ id: 'TABLE-PT-MARSH-FINDS', name: '[TEST] Marsh Finds',
  results: [['Reed bundle', 'You find a [TEST] reed bundle.'], ['Rusted hinge', 'You find a [TEST] rusted hinge.'], ['Pale lantern', 'A [TEST] pale lantern bobs away.'],
    ['Ash-streaked stone', 'A [TEST] ash-streaked stone.'], ['Nothing', 'Only mud.'], ['Whisper', 'A [TEST] whisper from the fog.']] }];
function tableRecord(t) {
  return common(t.id, 'RollTable', {
    refs: [], name: t.name,
    foundry: { document_type: 'RollTable', folder_path: `${FOLDER}/Tables`, data: {
      name: t.name, img: ICONS.item, description: `<p>Synthetic table for the Group Check / Roll Table steps. Run the [TEST] Link test data macro to add Item and Journal results.</p>`,
      formula: `1d${t.results.length}`, replacement: true, displayRoll: true,
      results: t.results.map(([name, description], i) => ({ type: 'text', name, description, weight: 1, range: [i + 1, i + 1] })),
    } },
  });
}

// ---- Hirelings (Headquarters reads these from Manager-imported world Items) -------------------------------
function hirelingRecords() {
  const hire = common('HIRE-PT-SMITH', 'Hireling', {
    scope: 'setting_adapter', refs: [ref('has_hireling_perk', 'HPERK-PT-WORKING', 'optional')],
    name: '[TEST] Hireling Smith', role: 'Blacksmith', capabilities: [{ key: 'smith', label: 'Test Smithing', description: 'Test capability, no gameplay bonus' }],
    foundry: project('Hirelings', '[TEST] Hireling Smith', 'feat', ICONS.prof, '<h2>[TEST] Hireling Smith</h2><p>Synthetic hireling definition; no rules effect.</p>'),
  });
  const perk = common('HPERK-PT-WORKING', 'HirelingPerk', {
    refs: [], name: '[TEST] Working Hands', contexts: ['headquarters'],
    conditions: { requires_working: true, requires_presence: true },
    stacking: { overlap_group: 'test_hq_benefit', allow_overlap: false }, implementation: 'informational',
    foundry: project('Hirelings', '[TEST] Working Hands', 'feat', ICONS.prof, '<h2>[TEST] Working Hands</h2><p>Synthetic hireling perk; informational only.</p>'),
  });
  return [hire, perk];
}

// ---- Module import files (not read by Manager) ------------------------------------------------------------
const questSource = 'Synthetic playtest data (not canon)';
const questBase = (id, kind, extra) => ({
  id, entity_type: 'Objective', objective_kind: kind, status: 'approved', version: PACK_VERSION,
  provenance: { sources: [questSource] }, visibility: 'player', refs: [], source: { description: 'Synthetic playtest issuer' },
  locations: [], parameters: {}, outcomes: {}, ...extra,
});
const locRefs = ids => ids.map(target_id => ({ relation: 'targets_location', target_id, mode: 'optional' }));
export function buildQuests() {
  const quest = (id, name, summary, locations, objectives, extra = {}) =>
    questBase(id, 'quest', { name, public_summary: summary, refs: locRefs(locations), locations: locations.map(target_id => ({ target_id })), objectives, ...extra });
  return {
    schema_version: 'ag-quest-source/0.1', domain: 'quests_orders', version: PACK_VERSION,
    records: [
      quest('QUEST-PT-GREENHOLLOW-HERBS', '[TEST] Herbs for Greenhollow', 'Gather herbs from the meadows around Greenhollow.', ['LOC-PT-GREENHOLLOW'], [
        { key: 'gather', goal: 'Gather two bundles of Emberroot', visibility: 'player' },
        { key: 'deliver', goal: 'Bring them to the herbalists’ circle', visibility: 'reveal_gated', reveal_on_create: false },
        { key: 'secret', goal: '[TEST] GM-only objective: players must not see this', visibility: 'gm' }]),
      quest('QUEST-PT-MARSH-LIGHTS', '[TEST] Lights over Hollowmere', 'Find the source of the pale lights in the marsh.',
        ['LOC-PT-HOLLOWMERE', 'LOC-PT-DROWNED-CHAPEL', 'LOC-PT-CHAPEL-CRYPT', 'LOC-PT-LANTERN-MOUND'], [
          { key: 'cross', goal: 'Cross the marsh', visibility: 'player' },
          { key: 'chapel', goal: 'Search the drowned chapel', visibility: 'player' },
          { key: 'crypt', goal: 'Open the crypt', visibility: 'reveal_gated', reveal_on_create: false },
          { key: 'mound', goal: 'Follow the distant light', visibility: 'reveal_gated', reveal_on_create: false }]),
      quest('QUEST-PT-QUARRY-SMOKE', '[TEST] Smoke at Cinder Quarry', 'Find out why the quarry smokes at night. Mark this one Completed by hand to test a finished quest.',
        ['LOC-PT-CINDER-QUARRY'], [
          { key: 'watch', goal: 'Watch the quarry at night', visibility: 'player' },
          { key: 'seam', goal: 'Inspect the exposed seam', visibility: 'player' }]),
      quest('QUEST-PT-GM-SECRET', '[TEST] GM Secret: Ash Hollow', 'This record must never appear in a player account.',
        ['LOC-PT-ASH-HOLLOW'], [{ key: 'secret', goal: '[TEST] GM-only concealed objective', visibility: 'gm' }], { visibility: 'gm' }),
      questBase('ORDER-PT-HINGE-ORDER', 'work_order', {
        work_order_domain: 'crafting', name: '[TEST] Hinge Order', public_summary: 'Craft two Iron Hinge Sets for the village.',
        objectives: [{ key: 'craft', goal: 'Craft two Iron Hinge Sets', visibility: 'player' }],
        parameters: { recipe_id: 'REC-PT-IRON-HINGE-SET', quantity: 2 } }),
      questBase('CONTRACT-PT-ESCORT', 'contract', {
        visibility: 'reveal_gated', name: '[TEST] Marsh Escort', public_summary: 'Reveal-gated contract: escort a merchant across the marsh.',
        refs: locRefs(['LOC-PT-HOLLOWMERE']), locations: [{ target_id: 'LOC-PT-HOLLOWMERE' }],
        objectives: [{ key: 'escort', goal: 'Escort the merchant to Greenhollow', visibility: 'player' }] }),
    ],
  };
}

// Skill Trees 0.8 format: each node names a perk; name, text, picture and point cost come from that perk.
const stNode = (id, perkId, x, y, extra = {}) => ({
  id, perkId, x, y, requiresAll: [], requiresAny: [], excludes: [], status: 'test', visibility: 'player', display: 'shown', ...extra,
});
export function buildSkillTrees() {
  return {
    schema: 'ag-skill-trees/0.3',
    trees: [
      { id: 'PT-TREE-ALCHEMY', name: '[TEST] Alchemy Perks', description: 'Profession tree tied to PROF-PT-ALCHEMY. Read-only in Skill Trees; the Ledger owns perk selection.',
        status: 'test', visibility: 'player', sourceRef: 'PROF-PT-ALCHEMY', provider: { kind: 'profession', maxPoints: null },
        nodes: [
          stNode('PT-ALC-STEADY', 'PERK-PT-ALCH-STEADY-HANDS', 120, 120),
          stNode('PT-ALC-FRUGAL', 'PERK-PT-ALCH-FRUGAL-BREW', 420, 50, { requiresAll: ['PT-ALC-STEADY'] }),
          stNode('PT-ALC-QUICK', 'PERK-PT-ALCH-QUICK-BREW', 420, 225, { requiresAll: ['PT-ALC-STEADY'] }),
          stNode('PT-ALC-MASTER', 'PERK-PT-ALCH-MASTER-TOUCH', 750, 145, { requiresAny: [['PT-ALC-FRUGAL', 'PT-ALC-QUICK']], visibility: 'gm', display: 'hidden' }),
        ] },
      { id: 'PT-TREE-GENERIC', name: '[TEST] Generic Points', description: 'Generic point wallet with a prerequisite, an exclusion and an OR group. Unlocking adds the perk to the sheet.',
        status: 'test', visibility: 'player', sourceRef: null, provider: { kind: 'generic_points', maxPoints: 6 },
        nodes: [
          stNode('PT-GEN-BASE', 'PERK-PT-GEN-FOUNDATION', 120, 120),
          stNode('PT-GEN-LEFT', 'PERK-PT-GEN-LEFT-PATH', 420, 50, { requiresAll: ['PT-GEN-BASE'], excludes: ['PT-GEN-RIGHT'] }),
          stNode('PT-GEN-RIGHT', 'PERK-PT-GEN-RIGHT-PATH', 420, 225, { requiresAll: ['PT-GEN-BASE'], excludes: ['PT-GEN-LEFT'] }),
          stNode('PT-GEN-FINAL', 'PERK-PT-GEN-FINAL', 750, 145, { requiresAny: [['PT-GEN-LEFT', 'PT-GEN-RIGHT']] }),
        ] },
    ],
  };
}

export function buildHqFacilities() {
  const fac = (id, name, category, placements, stages) => ({
    id, entity_type: 'Facility', status: 'approved', version: PACK_VERSION, scope: 'generic_rules',
    provenance: { sources: [SOURCE] }, visibility: 'player', refs: [], name, category, placements, stages,
  });
  const stage = (key, label, width, height, staffing_slots, benefits = []) => ({ key, label, width, height, staffing_slots, art: '', benefits });
  return [
    fac('FAC-PT-FIELD-FORGE', '[TEST] Field Forge', 'Profession', ['shared'], [
      stage('base', 'Unimproved', 4, 3, 1, [{ name: '[TEST] Workshop Access', description: 'Descriptive only. No automatic bonus.', recipient: 'guild' }]),
      stage('expanded', 'Expanded', 5, 4, 2)]),
    fac('FAC-PT-MAP-ROOM', '[TEST] Map Room', 'Administrative', ['shared', 'personal'], [stage('base', 'Standard', 3, 3, 0)]),
    fac('FAC-PT-HERB-GARDEN', '[TEST] Herb Garden', 'Profession', ['shared', 'personal'], [
      stage('base', 'Plot', 3, 2, 1, [{ name: '[TEST] Garden Produce', description: 'Descriptive only. No automatic bonus.', recipient: 'room_owner' }]),
      stage('grown', 'Grown', 4, 3, 1)]),
  ];
}

// ---- Link macro -------------------------------------------------------------------------------------
// scripts/playtest-link-macro.js with its PACK constant filled in from this file's own data, so the ids it looks for
// cannot drift from the records the pack creates.
const LOOT_MARKER = /(?:ITEM|JRN)-PT-[A-Z0-9-]+/g;
function linkMacro(locations, records) {
  const wanted = new Set(TABLE_LINKS);
  for (const l of locations) for (const e of [...(l.loot ?? []), ...(l.notes ?? [])]) for (const m of (e.text ?? '').matchAll(LOOT_MARKER)) wanted.add(m[0]);
  const names = Object.fromEntries([...wanted].sort().map(id => [id, records.find(r => r.id === id)?.foundry?.data.name]));
  const characters = records.filter(r => r.entity_type === 'PlayerCharacter').map(r => r.foundry.data.name);
  const pack = { names, characters, table: { id: TABLES[0].id, name: TABLES[0].name, add: TABLE_LINKS }, locations: locations.map(l => l.id) };
  const source = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'playtest-link-macro.js'), 'utf8');
  return common('MACRO-PT-LINK-TEST-DATA', 'Macro', {
    visibility: 'gm', refs: [], name: '[TEST] Link test data',
    foundry: { document_type: 'Macro', folder_path: `${FOLDER}/Macros`, data: {
      name: '[TEST] Link test data', img: ICONS.item, type: 'script', scope: 'global',
      command: source.replace('/*PACK*/ {}', JSON.stringify(pack, null, 2)),
    } },
  });
}

// ---- Factions ---------------------------------------------------------------------------------------
// Imported by Factions -> GM Setup -> Import JSON. The definitions use Factions' own export format; `starting_state`
// is applied to new factions only: party discovery, group Renown events and per-character discovery/Renown by character name.
export function buildFactions() {
  const faction = (key, name, leader, role, { placeholder = false, refs = [], entries = [], rewards = [] } = {}) => {
    const f = makeFaction({ id: `FACTION-PT-${key}`, trackId: `RENOWN-PT-${key}`, name, leader, public_role: role, source: SOURCE });
    f.discovery = { party: false, actors: [], placeholder, sharing_enabled: true };
    f.refs = refs.map(([relation, target_id]) => ({ relation, target_id, mode: 'optional' }));
    f.entries = entries.map(([id, entryName, text, unlock, threshold]) => ({ id, name: entryName, text, link_mode: 'preview', unlock, threshold }));
    const group = f.renown_track.milestones, personal = f.individual_track.milestones;
    f.rewards = rewards.map(([n, audience, rank, behavior, usage_limit, description]) => ({
      id: `rw-pt-${key.toLowerCase()}-${n}`, key: `rw_pt_${n.replace(/-/g, '_')}`, audience, milestone_id: (audience === 'group' ? group : personal)[rank].id,
      name: `[TEST] ${description.name}`, teaser: `[TEST] ${description.name}`, description: description.text, kind: 'custom', tags: [], behavior, usage_limit,
    }));
    return sourceDefinition(f);
  };
  const entry = (id, name, text, unlock = 'manual', threshold = 0) => [id, name, text, unlock, threshold];
  const reward = (n, audience, rank, behavior, usage, name, text) => [n, audience, rank, behavior, usage, { name, text }];
  return {
    schema_version: 'ag-factions-source-export/0.3',
    note: 'Synthetic playtest factions (not canon). starting_state is applied to new factions only; existing factions are never changed.',
    definitions: [
      faction('LANTERN-WARDENS', '[TEST] Lantern Wardens', '[TEST] Warden Ilse', 'Revealed to the party: marsh patrols with a rank ladder in use.', {
        refs: [['offers_objective', 'QUEST-PT-MARSH-LIGHTS'], ['associated_objective', 'QUEST-PT-GREENHOLLOW-HERBS']],
        entries: [entry('pt-signal-lamps', '[TEST] Signal lamps', 'Placeholder text: patrols flash lamps from the chapel mound.'),
          entry('pt-patrol-routes', '[TEST] Patrol routes', 'Placeholder text: unlocks at group Renown 3.', 'group_renown', 3)],
        rewards: [reward('token', 'group', 1, 'one_time', 0, 'Warden token', 'A one-time placeholder reward at Recognized.'),
          reward('lamp-loan', 'group', 2, 'repeatable_service', 2, 'Lamp loan', 'A repeatable service, two uses, at Trusted.'),
          reward('familiar-face', 'individual', 1, 'passive', 0, 'Familiar face', 'A passive personal privilege at Recognized.')] }),
      faction('ASH-BROKERS', '[TEST] Ash Brokers', '[TEST] Broker Tamsin', 'Hidden: no player can see this faction until it is revealed.', {
        refs: [['associated_objective', 'ORDER-PT-HINGE-ORDER']],
        entries: [entry('pt-ledger-rumour', '[TEST] Ledger rumour', 'Placeholder text, shown only after discovery.')],
        rewards: [reward('discount', 'group', 1, 'passive', 0, 'Trade discount', 'A passive placeholder privilege.')] }),
      faction('MIRE-FERRYMEN', '[TEST] Mire Ferrymen', '[TEST] Ferryman Oss', 'Undiscovered placeholder for the party; one character has met them.', {
        placeholder: true, refs: [['offers_objective', 'CONTRACT-PT-ESCORT']],
        entries: [entry('pt-crossing-song', '[TEST] Crossing song', 'Placeholder text, known to the character who met them.')],
        rewards: [reward('crossing', 'individual', 1, 'one_time', 0, 'Free crossing', 'A one-time personal placeholder reward.')] }),
    ],
    starting_state: [
      { faction_id: 'FACTION-PT-LANTERN-WARDENS', party_discovered: true,
        group_renown: [{ delta: 4, reason: '[TEST] Escorted a patrol' }, { delta: 3, reason: '[TEST] Cleared the road' }],
        actors: [{ name: '[TEST] Belwar', discovered: true, renown: [{ delta: 4, reason: '[TEST] Carried the signal lamp' }] },
          { name: '[TEST] Kessa', discovered: true, renown: [{ delta: 1, reason: '[TEST] Repaired a gate hinge' }] }] },
      { faction_id: 'FACTION-PT-ASH-BROKERS', group_renown: [{ delta: 2, reason: '[TEST] Paid an old debt' }] },
      { faction_id: 'FACTION-PT-MIRE-FERRYMEN', actors: [{ name: '[TEST] Orin', discovered: true, renown: [{ delta: 3, reason: '[TEST] Paid the ferry toll' }] }] },
    ],
  };
}

export function buildPack() {
  const materialIds = MATERIALS.map(m => m.id);
  const records = [
    ...PROFESSIONS.map(professionRecord),
    ...MATERIALS.map(materialRecord),
    ...RECIPES.map(recipeRecord),
    ...RECIPES.map(itemRecord),
    ...PERKS.map(perkRecord),
    ...STASH.map(stashRecord),
    ...CHARACTERS.map(characterRecord),
    ...JOURNALS.map(journalRecord),
    ...TABLES.map(tableRecord),
    ...hirelingRecords(),
    ...buildLocations(materialIds),
  ];
  return {
    manifest: {
      schema_version: 'ag-foundry-import/0.2',
      package_id: PACK_ID,
      version: PACK_VERSION,
      description: 'Synthetic playtest pack: 3 professions, 8 materials, 8 recipes with crafted items, 3 give-to-player recipe items, 8 perks, 4 stash items, ' +
        '3 test characters, 3 journals, 1 roll table, 1 hireling and perk, 1 GM-only link macro. 8 locations (a Region point-crawl plus Normal/Hot/Deadly sites) with gathering nodes for the Locations module. ' +
        'Includes one GM-only material, one draft recipe/item and hidden location content as deliberate visibility examples. Not canon.',
    },
    records: [...records, linkMacro(LOCATIONS, records)],
  };
}

export const packFileName = () => `AG_Playtest_Pack_${PACK_VERSION}.json`;
export const questsFileName = () => `AG_Playtest_Quests_${PACK_VERSION}.json`;
export const skillTreesFileName = () => `AG_Playtest_SkillTrees_${PACK_VERSION}.json`;
export const hqFileName = () => `AG_Playtest_HQ_Facilities_${PACK_VERSION}.json`;
export const factionsFileName = () => `AG_Playtest_Factions_${PACK_VERSION}.json`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures', 'playtest');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, data] of [[packFileName(), buildPack()], [questsFileName(), buildQuests()], [skillTreesFileName(), buildSkillTrees()], [hqFileName(), buildHqFacilities()], [factionsFileName(), buildFactions()]]) {
    const out = path.join(outDir, name);
    fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
    console.log(`Wrote ${path.relative(process.cwd(), out)}`);
  }
}
