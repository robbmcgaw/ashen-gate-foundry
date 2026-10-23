// Runs authored content files through the modules' own import validators, exactly as General Manager would see them.
// Proves file shape and data-layer rules, not the live Foundry UI. Reads files only; writes nothing.
//
// Usage: node scripts/validate-content.mjs <file-or-folder> [...]
//   - every .json file is checked (folders recursively); a file is expected to be accepted...
//   - ...unless it sits in a folder named "invalid" or is named *.invalid.json: then it must be REJECTED
//     (used for "common mistakes" examples). Each such file may name the error it expects in a top-level
//     "_expect_error" string (a substring of one validator message); it is removed before validating.
//   - files the Import tab does not take are recognised by name and checked with their owner's own validator:
//     *.scene-moods.json (moods file; Manager > Scenes > Export & import, 0.35.0+), *.organize-rules.json (array of rules
//     or {rules}; Manager > Organize > Import), *.crosswalk.json (Profession Ledger baseline file; Ledger > GM Setup >
//     Tools and checks > Import baseline file) and *.npc-codex.json (ag-npc-codex-export/0.1; Library > NPC Codex >
//     Restore reveals). They are left out of the folder's ZIP bundle.
//   - gathering node files (*.gathering-nodes.json, or any file with "schema": "ag-gathering-nodes/1"; Profession Ledger 0.25.0+,
//     imported in Ledger > Gathering Nodes > Import nodes) are checked with the Ledger's own parser; a MAT-* id not defined
//     in the same folder gets a note. Also left out of the ZIP bundle.
//   - ag-strain-config/0.1 files (Strain bands and Backfire schedule) are checked with Ashen Gate | Cinders' own validator;
//     Cinder / Power / BackfireTable records in a Manager package get Cinders' definition check (including a Cinder's
//     optional default art, cinder.art, from Cinders 0.9.0; a Cinder's bearer_items and the signature power kinds from Cinders 0.10.0).
//   - record-level modifiers blocks (ag-modifiers/0.1): Manager checks the shape, then each scope's owner checks its entries
//     (scope cinder: Cinders' exported validateModifiers, when that Cinders version has it).
//   - each folder's accepted import files are also zipped together and read as a Manager ZIP bundle.
//   - quest files: an item reward (outcomes.item_rewards) whose ITEM-*, REC-* or MAT-* id is not defined in the same file or folder gets a note.
//   - Shop / Service / MerchantList records: Utilities' own import rules (shop items named by id outside the file get a note).
// Exit code 1 when any file does not behave as expected.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import '../modules/ashen-gate-manager/scripts/vendor/jszip.min.js';
import { validatePackage } from '../modules/ashen-gate-manager/scripts/core.js';
import { compilePackage } from '../modules/ashen-gate-manager/scripts/workflows.js';
import { classifyDelivery } from '../modules/ashen-gate-manager/scripts/delivery.js';
import { markerTargets } from '../modules/ashen-gate-manager/scripts/import-fidelity.js';
import { flagWarnings } from '../modules/ashen-gate-manager/scripts/item-effects.js';
import { detectSpecialistFile, describeUnrecognized } from '../modules/ashen-gate-manager/scripts/specialist-handoff.js';
import { readImportBundle } from '../modules/ashen-gate-manager/scripts/zip-import.js';
import { createSceneMoods } from '../modules/ashen-gate-manager/scripts/scene-moods.js';
import { importRecords, normalizeExotics as locationExotics, NODE_ID as LOCATION_NODE_ID, ROUTES_RETIRED } from '../modules/ashen-gate-locations/scripts/model.mjs';
import { planQuestImport } from '../modules/ashen-gate-quest-manager/scripts/core.mjs';
import { validatePackage as validateTrees } from '../modules/ashen-gate-skill-trees/scripts/engine.mjs';
import { validateDefinition as validateCinderDefinition, categoriesFor } from '../modules/ashen-gate-cinders/scripts/cinder.mjs';
import * as cinderEngine from '../modules/ashen-gate-cinders/scripts/cinder.mjs';
import { modifierDefinitionChecks, MODIFIER_SCOPES } from '../modules/ashen-gate-manager/scripts/modifier-definitions.js';
import { validateConfig as validateStrainConfig } from '../modules/ashen-gate-cinders/scripts/strain.mjs';
import { planImport as planFactions } from '../modules/ashen-gate-factions/scripts/import.mjs';
import { planShopImport, importItemRefs, SHOP_IMPORT_TYPES } from '../modules/ashen-gate-utilities/scripts/core.mjs';
import { planFacilityImport } from '../modules/ashen-gate-headquarters/js/logic.mjs';
import { normalizeRecipe, EFFECT_NOTE_MAX } from '../modules/ashen-gate-profession-ledger/scripts/core.mjs';
import { cleanRecipeLabel, RECIPE_LABEL_MAX } from '../modules/ashen-gate-profession-ledger/scripts/recipe-labels.mjs';
import { materialMeta } from '../modules/ashen-gate-profession-ledger/scripts/exotic.mjs';
import { catalogCrosswalk, PROFESSION_KEYS } from '../modules/ashen-gate-profession-ledger/scripts/assign.mjs';
import { professionKey } from '../modules/ashen-gate-profession-ledger/scripts/checks.mjs';
import { parseBaselineFile } from '../modules/ashen-gate-profession-ledger/scripts/assign.mjs';
import { parseNodeFile, NODE_SCHEMA } from '../modules/ashen-gate-profession-ledger/scripts/nodes.mjs';
import { planRevealsImport, isLinkId, REVEAL_FIELDS, LINK_PREFIXES } from '../modules/ashen-gate-manager/scripts/codex.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Core V14 weather effect ids; a world may add more. */
const CORE_WEATHER = Object.fromEntries(['leaves', 'rain', 'rainStorm', 'fog', 'snow', 'blizzard'].map(id => [id, {}]));
const JSZip = globalThis.JSZip;

/** Manager's own Organize rules validator, when this checkout has it (Manager 0.25.0+). */
async function organizeValidator() {
  const file = path.join(root, 'modules/ashen-gate-manager/scripts/organize.js');
  if (!fs.existsSync(file)) return null;
  return (await import(pathToFileURL(file))).validateRules;
}

/** NPC Codex (Manager 0.33.0) reads these without rejecting anything: a value it would drop or turn into other text is an error here. */
function codexChecks(rec) {
  const errors = [], id = rec.id;
  for (const k of ['role', 'appearance', 'signature_line', 'wants', 'knows', 'portrayal', 'session_role', 'stat_block'])
    if (rec[k] !== undefined && rec[k] !== null && typeof rec[k] !== 'string') errors.push(`${id}: ${k} must be text (the Codex would show ${JSON.stringify(String(rec[k]))}).`);
  if (rec.gm_notes !== undefined && !(Array.isArray(rec.gm_notes) && rec.gm_notes.every(n => typeof n === 'string')) && typeof rec.gm_notes !== 'string')
    errors.push(`${id}: gm_notes must be a list of strings.`);
  if (rec.codex === undefined) return errors;
  const codex = rec.codex;
  if (!codex || typeof codex !== 'object' || Array.isArray(codex)) return [...errors, `${id}: codex must be an object {links?, default_reveal?}.`];
  if (codex.links !== undefined) {
    if (!Array.isArray(codex.links)) errors.push(`${id}: codex.links must be a list of ids.`);
    else for (const l of codex.links) if (!isLinkId(l)) errors.push(`${id}: codex.links ${JSON.stringify(l)} is not a linkable id (${LINK_PREFIXES.join(', ')}); the Codex drops it.`);
  }
  const dr = codex.default_reveal;
  if (dr !== undefined) {
    if (!dr || typeof dr !== 'object' || Array.isArray(dr)) errors.push(`${id}: codex.default_reveal must be an object {discovery?, fields?}.`);
    else {
      const rule = (path, v) => { if (v !== undefined && v !== 'hidden' && v !== 'party') errors.push(`${id}: ${path} ${JSON.stringify(v)} must be "hidden" or "party" (anything else reads as hidden).`); };
      rule('codex.default_reveal.discovery', dr.discovery);
      if (dr.fields !== undefined) {
        if (!dr.fields || typeof dr.fields !== 'object' || Array.isArray(dr.fields)) errors.push(`${id}: codex.default_reveal.fields must be an object.`);
        else for (const [k, v] of Object.entries(dr.fields)) {
          if (!REVEAL_FIELDS.includes(k)) errors.push(`${id}: codex.default_reveal.fields.${k} is not revealable (use ${REVEAL_FIELDS.join(', ')}); the Codex drops it.`);
          else rule(`codex.default_reveal.fields.${k}`, v);
        }
      }
      for (const k of Object.keys(dr)) if (!['discovery', 'fields'].includes(k)) errors.push(`${id}: codex.default_reveal.${k} is not read (use discovery and fields).`);
    }
  }
  for (const k of Object.keys(codex)) if (!['links', 'default_reveal'].includes(k)) errors.push(`${id}: codex.${k} is not read (use links and default_reveal).`);
  return errors;
}

/** Extra checks on a valid Manager package: what the owning modules would make of its domain records. */
// The scope owners as Manager would find them in a world: a module whose engine exports validateModifiers counts as active.
const ownerEngines = {[MODIFIER_SCOPES.cinder.moduleId]: cinderEngine};
const ownerGame = {modules: new Map(Object.entries(ownerEngines).map(([id, engine]) => [id,
  {active: true, api: typeof engine.validateModifiers === 'function' ? {modifiers: {validate: engine.validateModifiers}} : {}}]))};

function domainChecks(pkg, knownIds = new Set()) {
  const errors = [], notes = [];
  const ids = new Set(pkg.records.map(r => r.id));
  const owned = modifierDefinitionChecks(ownerGame, pkg.records);
  errors.push(...owned.errors); notes.push(...owned.warnings);
  for (const rec of pkg.records) {
    // Apply refuses a marker whose target is neither in the package nor already in the world.
    for (const id of markerTargets(rec)) if (!ids.has(id)) notes.push(`${rec.id}: AGREF ${id} must already exist in the world (not in this package).`);
    // Item effects are checked by validatePackage (Manager 0.37.0); flags outside the allow-list import as nothing.
    notes.push(...flagWarnings(rec));
    for (const e of rec.foundry?.document_type === 'Item' && Array.isArray(rec.foundry.data?.effects) ? rec.foundry.data.effects : [])
      if (e.transfer === true && /^(ITEM|PERK)-(MOUNT|PET)-/.test(rec.id)) notes.push(`${rec.id}: effect ${e.eff_id} has transfer on, so it would also change the character carrying this companion item (the Hub warns; use transfer false).`);
    if (rec.entity_type === 'Recipe') {
      const recipe = normalizeRecipe({flags: {'ashen-gate-manager': {source: {definition: rec}}}});
      // Ledger 0.28.0: an activity (kind "activity") has no ingredients and no result item, so only craft recipes need them.
      if (recipe.kind !== 'activity' && !recipe.hasStructuredIngredients) errors.push(`${rec.id}: Ledger cannot craft it: ingredients must be a non-empty list of {material_id, quantity (whole number > 0)}.`);
      // Ledger 0.29.0: an optional effect note (display only). Malformed is a note, not an error: the Ledger just ignores or shortens it.
      for (const key of ['effect_note', 'effectNote']) {
        const value = rec[key];
        if (value === undefined || value === null) continue;
        if (typeof value !== 'string') notes.push(`${rec.id}: ${key} must be text; the Ledger ignores it.`);
        else if (value.replace(/\s+/g, ' ').trim().length > EFFECT_NOTE_MAX) notes.push(`${rec.id}: ${key} is over ${EFFECT_NOTE_MAX} characters; the Ledger cuts it short.`);
        if (recipe.kind !== 'activity') notes.push(`${rec.id}: ${key} is only shown on activity recipes (kind "activity"); the Ledger ignores it on a craft recipe.`);
      }
    }
    if (rec.entity_type === 'Profession') {
      // The Ledger matches a profession by name (tags like [TEST] ignored) and its access lists by dnd5e skill/tool name.
      if (!PROFESSION_KEYS.includes(professionKey(rec.name))) notes.push(`${rec.id}: name ${JSON.stringify(rec.name)} is not one of the Ledger's professions, so Assign and the tools table ignore it.`);
      else for (const u of catalogCrosswalk([{sourceId: rec.id, name: rec.name, access: rec.access}]).unresolved)
        errors.push(`${rec.id}: access.${u.field} "${u.name}" matches no dnd5e ${u.field === 'skillProficienciesAnyOf' ? 'skill' : 'tool'} (the Ledger ignores it).`);
      // Ledger 0.29.0: what the profession calls a recipe (display only). Malformed is a note: the Ledger falls back to its default.
      for (const key of ['recipeLabel', 'recipeLabelPlural'])
        if (rec[key] !== undefined && rec[key] !== null && !cleanRecipeLabel(rec[key])) notes.push(`${rec.id}: ${key} must be text of 1-${RECIPE_LABEL_MAX} characters; the Ledger ignores it and uses its default.`);
    }
    // Cinder (MUT-*), Power (POWER-*) and Backfire table (BF-*) blocks: Ashen Gate | Cinders' own check (Manager runs the same at import).
    if (['Mutation', 'Power', 'BackfireTable'].includes(rec.entity_type)) {
      const v = validateCinderDefinition(rec);
      errors.push(...v.errors); notes.push(...v.warnings);
      const refs = [...categoriesFor(rec, rec, null), ...(rec.power?.push_modes ?? []).flatMap(m => [...(m?.backfire_categories ?? []), ...(m?.requires?.powers ?? [])])];
      for (const id of new Set(refs)) if (typeof id === 'string' && !ids.has(id)) notes.push(`${rec.id}: ${id} is not in this file; it must already be in the world (imported earlier).`);
      // Cinders 0.10.0: a Cinder's bearer items (cinder.bearer_items) name signature_active / signature_passive powers. One in this file
      // with another kind is an error (the bearer would get nothing); one outside the file is a note (the world must have it at bind time).
      for (const [slot, kind] of [['active', 'signature_active'], ['passive', 'signature_passive']]) {
        const ref = rec.cinder?.bearer_items?.[slot];
        if (typeof ref !== 'string') continue;
        const target = pkg.records.find(r => r.id === ref);
        if (!target) notes.push(`${rec.id}: bearer_items.${slot} ${ref} is not in this file; it must already be in the world as a ${kind} Power before the Cinder is bound.`);
        else if (target.power?.kind !== kind) errors.push(`${rec.id}: bearer_items.${slot} ${ref} must be a ${kind} Power (it is ${target.power?.kind ? `a ${target.power.kind}` : 'not a Power with a power block'}).`);
      }
      if (rec.entity_type === 'BackfireTable' && rec.visibility !== 'gm') notes.push(`${rec.id}: Backfire tables are usually visibility "gm" (players see the rolled effect in chat, not the whole table).`);
    }
    if (rec.entity_type === 'NPC') errors.push(...codexChecks(rec));
    else if (rec.codex !== undefined) notes.push(`${rec.id}: codex is only read on entity_type NPC records.`);
    if (rec.core_ref !== undefined && rec.foundry?.document_type !== 'Item') notes.push(`${rec.id}: core_ref is only read on Item records.`);
    if (rec.core_ref !== undefined && !(typeof rec.core_ref === 'string' ? rec.core_ref.trim() : rec.core_ref?.name))
      errors.push(`${rec.id}: core_ref must be a core item name or {name, source?, type?, rarity?}.`);
    if (rec.entity_type === 'Material') {
      const meta = materialMeta(rec);
      if (!meta) errors.push(`${rec.id}: Ledger does not read it as a Material (needs a MAT-* id).`);
      else {
        // Manager accepts any value; the Ledger only reads these, so anything else is a warning, not an error.
        if (rec.quality !== undefined && !meta.quality) notes.push(`${rec.id}: quality ${JSON.stringify(rec.quality)} is not read by the Ledger (use Common, Rare or Exotic).`);
        if ((rec.tierId ?? rec.tier) !== undefined && meta.tier == null) notes.push(`${rec.id}: tierId ${JSON.stringify(rec.tierId ?? rec.tier)} is not read by the Ledger (use apprentice, journeyman, expert, artisan or master).`);
        if (meta.exotic && !meta.professionIds.length) errors.push(`${rec.id}: an Exotic material needs source_profession_id (or a gathered_by ref) to be findable.`);
      }
    }
  }
  const locations = pkg.records.filter(r => r.entity_type === 'Location');
  if (locations.length) {
    const r = importRecords(locations, [], {mode: 'skip'});
    for (const s of r.skipped) errors.push(`${s.id}: Locations skips it: ${s.reason}`);
    for (const loc of r.created) {
      const src = locations.find(x => x.id === loc.id)?.location ?? {};
      // A value the normaliser silently drops or changes means the author wrote something Locations does not keep.
      for (const [i, node] of (src.resources ?? []).entries()) {
        // Locations 1.18.0: an entry with a nodeId refers to a Profession Ledger node template, which owns its check and materials.
        if (node && typeof node === 'object' && node.nodeId !== undefined) {
          const where = `${loc.id}: resources[${i}]`;
          if (!LOCATION_NODE_ID.test(String(node.nodeId))) { errors.push(`${where}.nodeId ${JSON.stringify(node.nodeId)} is not a NODE-* id (NODE- then capitals, digits and single hyphens, e.g. NODE-TEST-RIVER-REEDS).`); continue; }
          const kept = loc.resources.find(r => r.nodeId === node.nodeId && r.key === String(node.key ?? node.id ?? r.key));
          const inline = ['skill', 'materialId', 'quantity', 'rareMaterialId', 'rareQuantity', 'exotics', 'uuid'].filter(k => node[k] !== undefined);
          if (inline.length) errors.push(`${where} refers to ${node.nodeId}, so ${inline.join(', ')} belong${inline.length === 1 ? 's' : ''} to the node template in Profession Ledger; Locations drops ${inline.length === 1 ? 'it' : 'them'}.`);
          for (const k of ['tier', 'dc', 'dcVisible', 'finite', 'exhausted', 'available', 'visible'])
            if (node[k] !== undefined && node[k] !== null && node[k] !== kept?.[k]) errors.push(`${where}.${k} ${JSON.stringify(node[k])} was changed to ${JSON.stringify(kept?.[k] ?? null)}.`);
          if (!knownIds.has(node.nodeId)) notes.push(`${where} refers to node template ${node.nodeId}: it must exist in Profession Ledger > Gathering Nodes (0.25.0+), or the entry shows "no longer exists" and nothing can be gathered there.`);
          continue;
        }
        const kept = loc.resources[i];
        if (!kept) { errors.push(`${loc.id}: resources[${i}] dropped (needs a label, materialId, rareMaterialId or uuid).`); continue; }
        for (const k of ['tier', 'dc', 'quantity', 'rareQuantity', 'materialId', 'rareMaterialId'])
          if (node[k] !== undefined && node[k] !== kept[k]) errors.push(`${loc.id}: resources[${i}].${k} ${JSON.stringify(node[k])} was changed to ${JSON.stringify(kept[k])}.`);
        if (node.exotics !== undefined && JSON.stringify(locationExotics(node.exotics)) !== JSON.stringify(node.exotics))
          errors.push(`${loc.id}: resources[${i}].exotics normalised differently: ${JSON.stringify(locationExotics(node.exotics))}.`);
      }
      for (const k of ['threat', 'state', 'parentLocationId', 'placeable', 'passConditions'])
        if (src[k] !== undefined && src[k] !== loc[k]) errors.push(`${loc.id}: location.${k} ${JSON.stringify(src[k])} was changed to ${JSON.stringify(loc[k])}.`);
      if (src.audience?.mode !== undefined && src.audience.mode !== loc.audience.mode) errors.push(`${loc.id}: audience.mode ${JSON.stringify(src.audience.mode)} is not everyone/selected.`);
    }
  }
  // Route records: retired in Locations 0.20.0, which skips each one (the rest of the file still imports).
  for (const r of pkg.records.filter(x => x.entity_type === 'Route')) errors.push(`${r.id}: Locations skips it: ${ROUTES_RETIRED}`);
  // Shop, Service and MerchantList records (Utilities 0.21.0+): Utilities' own import rules, in an empty world with
  // electrum off. Items named by item_id outside this file must already be in the world, so they are notes.
  const shopRecs = pkg.records.filter(r => SHOP_IMPORT_TYPES.includes(r.entity_type));
  if (shopRecs.length) {
    const items = new Map(importItemRefs(shopRecs).map(k => [k, {data: {name: k, type: 'loot', system: {quantity: 1, price: {value: 0, denomination: 'gp'}}}, contents: []}]));
    let n = 0;
    const r = planShopImport(shopRecs, {items, randomId: () => `v${++n}`});
    for (const row of r.results) {
      if (row.result === 'skipped') errors.push(`${row.id}: Utilities skips it: ${row.reason}`);
      for (const note of row.notes ?? []) notes.push(`${row.id}: ${note}`);
    }
    for (const rec of shopRecs.filter(x => x.entity_type === 'Shop')) {
      const lines = Array.isArray(rec.shop?.lines) ? rec.shop.lines : [];
      if (!lines.length) errors.push(`${rec.id}: shop.lines needs at least one line.`);
      for (const [i, l] of lines.entries()) {
        if (typeof l?.item_id === 'string' && !ids.has(l.item_id)) notes.push(`${rec.id}: line ${i + 1} item ${l.item_id} is not in this file; it must already be in the world (imported earlier).`);
        if (typeof l?.item_uuid === 'string' && /^(Item|Actor)\./.test(l.item_uuid)) notes.push(`${rec.id}: line ${i + 1} item_uuid ${l.item_uuid} is a world UUID; it only works in the world it came from (use item_id).`);
      }
    }
  }
  return {errors, notes};
}

/** Record ids defined in a parsed import file ({records:[{id}]}). */
const recordIds = data => new Set((Array.isArray(data?.records) ? data.records : []).map(r => r?.id).filter(id => typeof id === 'string'));

/** Validates one parsed file. Returns {kind, errors, notes}. knownIds: ids defined elsewhere in the same folder bundle. */
export async function checkContent(data, filename = '', {knownIds = new Set()} = {}) {
  if (/\.scene-moods\.json$/i.test(filename)) {
    // Manager's own import preview, in a GM world with the shipped presets and core weather.
    const scenes = createSceneMoods({game: {user: {isGM: true}, settings: {get: () => []}}, getConfig: () => ({weatherEffects: CORE_WEATHER})});
    const preview = scenes.previewImport(data);
    if (!preview.ok) return {kind: 'scene-moods', errors: [preview.message], notes: []};
    const errors = [], notes = [], seen = new Set();
    for (const item of preview.items) {
      const label = `${item.kind} ${item.id || '?'}`;
      if (item.status === 'invalid') errors.push(`${label}: skipped on import: ${item.problems.join(' ')}`);
      if (seen.has(`${item.kind}:${item.id}`)) errors.push(`${label}: id is used twice in this file.`);
      seen.add(`${item.kind}:${item.id}`);
      if (item.unavailable) errors.push(`${label}: weather "${item.unavailable}" is not a core weather id (it imports but will not apply).`);
      if (item.status === 'conflict') notes.push(`${label}: same id as a shipped preset with different values (the GM chooses Keep mine / Replace mine / Keep both).`);
    }
    return {kind: 'scene-moods', errors, notes: [...notes, 'Imported in Manager > Scenes > Export & import (not through Manager Import).']};
  }
  if (/\.organize-rules\.json$/i.test(filename)) {
    const validate = await organizeValidator();
    if (!validate) return {kind: 'organize-rules', errors: [], notes: ['Not checked: Organize (Manager 0.25.0) is not in this checkout.']};
    return {kind: 'organize-rules', errors: validate(Array.isArray(data) ? data : data?.rules), notes: []};
  }
  if (/\.crosswalk\.json$/i.test(filename)) {
    const r = parseBaselineFile(data);
    const errors = [...r.errors,
      ...r.unknownProfessions.map(p => `"${p}" is not one of the Ledger's professions (ignored).`),
      ...r.unresolved.map(u => `${u.profession}: ${u.list} "${u.name}" matches no dnd5e ${u.list === 'qualifySkills' ? 'skill' : 'tool'} (ignored).`)];
    for (const [name, row] of Object.entries(data?.professions ?? {})) if (Array.isArray(row?.items))
      for (const v of row.items) if (typeof v === 'string' && (!v.trim() || v.trim().length > 200)) errors.push(`${name}: items entry ${JSON.stringify(v.slice(0, 40))} is empty or over 200 characters (dropped).`);
    return {kind: 'crosswalk', errors, notes: ['Imported in Profession Ledger > GM Setup > Tools and checks > Import baseline file (not through Manager Import).']};
  }
  if (/\.gathering-nodes\.json$/i.test(filename) || (data && typeof data === 'object' && !Array.isArray(data) && data.schema === NODE_SCHEMA)) {
    const r = parseNodeFile(data);
    const notes = [...r.warnings];
    const mats = [...new Set(r.nodes.flatMap(n => ['common', 'rare', 'exotic'].flatMap(t => n.materials[t].map(e => e.materialId))))];
    const missing = mats.filter(id => !knownIds.has(id));
    if (missing.length) notes.push(`Materials not defined in this folder (they must be imported with General Manager before they can be awarded): ${missing.join(', ')}.`);
    return {kind: 'gathering-nodes', errors: r.errors, notes: [...notes, 'Imported in Profession Ledger > Gathering Nodes > Import nodes (not through Manager Import).']};
  }
  if (/\.npc-codex\.json$/i.test(filename)) {
    const r = planRevealsImport(data, []);
    const errors = [...r.errors];
    for (const id of r.missing) if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(id)) errors.push(`reveals: ${JSON.stringify(id)} is not a permanent NPC id.`);
    return {kind: 'npc-codex', errors, notes: ['GM file: restored in Manager > Library > NPC Codex > Restore reveals (only NPCs already in the world). Not an Import-tab file.']};
  }
  const specialist = detectSpecialistFile(data);
  if (specialist === 'quests') {
    // Item reward notes are dropped when the item is defined in this file or in the same folder bundle.
    const plan = planQuestImport(data), here = recordIds(data);
    const notes = (plan.notes ?? []).filter(n => { const id = n.match(/item reward ((?:ITEM|REC|MAT)-[A-Z0-9-]+)/)?.[1]; return !here.has(id) && !knownIds.has(id); });
    return {kind: 'quests', errors: plan.errors, notes};
  }
  if (specialist === 'skill-trees') { const v = validateTrees(data); return {kind: 'skill-trees', errors: v.errors, notes: v.warnings}; }
  if (specialist === 'strain') { const v = validateStrainConfig(data); return {kind: 'strain', errors: v.errors, notes: [...v.warnings, 'Imported through Manager Import (to Ashen Gate | Cinders) or Cinders > GM Setup > Strain. Never changes a character\'s Strain.']}; }
  if (specialist === 'factions') return {kind: 'factions', errors: planFactions(data).errors, notes: []};
  if (specialist === 'headquarters') return {kind: 'headquarters', errors: planFacilityImport(data).errors, notes: []};
  const delivery = data && typeof data === 'object' && !Array.isArray(data) ? classifyDelivery(data) : null;
  if (delivery) return {kind: delivery.kind, errors: [delivery.notice], notes: []};
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.records)) return {kind: null, errors: [describeUnrecognized(data)], notes: []};
  let pkg;
  try { pkg = compilePackage(data); } catch (e) { return {kind: 'manager', errors: [e.message], notes: []}; }
  const errors = validatePackage(pkg, new Map());
  if (errors.length) return {kind: 'manager', errors, notes: []};
  const extra = domainChecks(pkg, knownIds);
  return {kind: 'manager', errors: extra.errors, notes: extra.notes};
}

function jsonFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return target.endsWith('.json') ? [target] : [];
  return fs.readdirSync(target, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(e => jsonFiles(path.join(target, e.name)));
}
const expectsRejection = file => /\.invalid\.json$/i.test(file) || file.split(path.sep).includes('invalid');

/** Checks every file and each folder's ZIP bundle. Returns {ok, lines}. */
export async function validateTargets(targets) {
  const lines = [], byFolder = new Map(), files = targets.flatMap(t => jsonFiles(path.resolve(t)));
  let ok = true;
  // Ids each folder's bundle defines (rejection examples left out), so a quest's item reward note can see items beside it.
  const folderIds = new Map();
  for (const file of files) {
    if (expectsRejection(file)) continue;
    let ids;
    try { ids = recordIds(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { continue; }
    const dir = path.dirname(file);
    folderIds.set(dir, new Set([...(folderIds.get(dir) ?? []), ...ids]));
  }
  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { ok = false; lines.push(`FAIL ${rel}: not valid JSON (${e.message})`); continue; }
    const reject = expectsRejection(file);
    const expected = reject && data && typeof data === 'object' && !Array.isArray(data) ? data._expect_error : undefined;
    if (expected !== undefined) delete data._expect_error;
    const {kind, errors, notes} = await checkContent(data, file, {knownIds: folderIds.get(path.dirname(file))});
    if (reject) {
      const matched = !expected || errors.some(e => e.includes(expected));
      if (errors.length && matched) lines.push(`ok   ${rel} rejected as expected: ${errors[0]}`);
      else { ok = false; lines.push(`FAIL ${rel}: expected rejection${expected ? ` with "${expected}"` : ''}; got ${errors.length ? errors.join(' | ') : 'accepted'}`); }
      continue;
    }
    if (errors.length) { ok = false; lines.push(`FAIL ${rel} (${kind ?? 'unrecognised'}):\n  - ${errors.join('\n  - ')}`); continue; }
    lines.push(`ok   ${rel} (${kind})${notes.length ? `\n  note: ${notes.join('\n  note: ')}` : ''}`);
    if (!['scene-moods', 'organize-rules', 'crosswalk', 'npc-codex', 'gathering-nodes'].includes(kind)) {
      const dir = path.dirname(file);
      if (!byFolder.has(dir)) byFolder.set(dir, []);
      byFolder.get(dir).push(file);
    }
  }
  for (const [dir, files] of byFolder) {
    if (files.length < 2) continue;
    const zip = new JSZip();
    for (const f of files) zip.file(path.basename(f), fs.readFileSync(f));
    const bundle = await readImportBundle(await zip.generateAsync({type: 'uint8array'}), JSZip);
    const bad = bundle.files.filter(f => f.status !== 'ok');
    const rel = path.relative(process.cwd(), dir) || '.';
    if (bad.length || bundle.skipped.length) {
      ok = false;
      lines.push(`FAIL ZIP of ${rel}: ${[...bad.map(f => `${f.filename}: ${f.notice}`), ...bundle.skipped.map(s => `${s.filename} skipped`)].join(' | ')}`);
    } else lines.push(`ok   ZIP of ${rel}: import order ${bundle.files.map(f => `${f.filename} (${f.label}, ${f.count})`).join(' -> ')}`);
  }
  return {ok, lines};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const targets = process.argv.slice(2);
  if (!targets.length) { console.error('Usage: node scripts/validate-content.mjs <file-or-folder> [...]'); process.exit(2); }
  const {ok, lines} = await validateTargets(targets);
  console.log(lines.join('\n'));
  console.log(ok ? '\nAll content files behaved as expected.' : '\nSome content files did not behave as expected.');
  process.exit(ok ? 0 : 1);
}
