// Runs authored content files through the modules' own import validators, exactly as General Manager would see them.
// Proves file shape and data-layer rules, not the live Foundry UI. Reads files only; writes nothing.
//
// Usage: node scripts/validate-content.mjs <file-or-folder> [...]
//   - every .json file is checked (folders recursively); a file is expected to be accepted...
//   - ...unless it sits in a folder named "invalid" or is named *.invalid.json: then it must be REJECTED
//     (used for "common mistakes" examples). Each such file may name the error it expects in a top-level
//     "_expect_error" string (a substring of one validator message); it is removed before validating.
//   - *.scene-moods.json (array of presets) and *.organize-rules.json (array of rules) are reference shapes:
//     checked with the same validators the Manager UI uses, although Manager has no file import for them yet.
//   - each folder's accepted import files are also zipped together and read as a Manager ZIP bundle.
// Exit code 1 when any file does not behave as expected.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import '../modules/ashen-gate-manager/scripts/vendor/jszip.min.js';
import { validatePackage } from '../modules/ashen-gate-manager/scripts/core.js';
import { compilePackage } from '../modules/ashen-gate-manager/scripts/workflows.js';
import { classifyDelivery } from '../modules/ashen-gate-manager/scripts/delivery.js';
import { markerTargets } from '../modules/ashen-gate-manager/scripts/import-fidelity.js';
import { detectSpecialistFile, describeUnrecognized } from '../modules/ashen-gate-manager/scripts/specialist-handoff.js';
import { readImportBundle } from '../modules/ashen-gate-manager/scripts/zip-import.js';
import { validatePreset } from '../modules/ashen-gate-manager/scripts/scene-moods.js';
import { importRecords, normalizeExotics as locationExotics } from '../modules/ashen-gate-locations/scripts/model.mjs';
import { planQuestImport } from '../modules/ashen-gate-quest-manager/scripts/core.mjs';
import { validatePackage as validateTrees } from '../modules/ashen-gate-skill-trees/scripts/engine.mjs';
import { planImport as planFactions } from '../modules/ashen-gate-factions/scripts/import.mjs';
import { planFacilityImport } from '../modules/ashen-gate-headquarters/js/logic.mjs';
import { normalizeRecipe } from '../modules/ashen-gate-profession-ledger/scripts/core.mjs';
import { materialMeta } from '../modules/ashen-gate-profession-ledger/scripts/exotic.mjs';
import { catalogCrosswalk, PROFESSION_KEYS } from '../modules/ashen-gate-profession-ledger/scripts/assign.mjs';
import { professionKey } from '../modules/ashen-gate-profession-ledger/scripts/checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSZip = globalThis.JSZip;

/** Manager's own Organize rules validator, when this checkout has it (Manager 0.25.0+). */
async function organizeValidator() {
  const file = path.join(root, 'modules/ashen-gate-manager/scripts/organize.js');
  if (!fs.existsSync(file)) return null;
  return (await import(pathToFileURL(file))).validateRules;
}

/** Extra checks on a valid Manager package: what the owning modules would make of its domain records. */
function domainChecks(pkg) {
  const errors = [], notes = [];
  const ids = new Set(pkg.records.map(r => r.id));
  for (const rec of pkg.records) {
    // Apply refuses a marker whose target is neither in the package nor already in the world.
    for (const id of markerTargets(rec)) if (!ids.has(id)) notes.push(`${rec.id}: AGREF ${id} must already exist in the world (not in this package).`);
    if (rec.entity_type === 'Recipe') {
      const recipe = normalizeRecipe({flags: {'ashen-gate-manager': {source: {definition: rec}}}});
      if (!recipe.hasStructuredIngredients) errors.push(`${rec.id}: Ledger cannot craft it: ingredients must be a non-empty list of {material_id, quantity (whole number > 0)}.`);
    }
    if (rec.entity_type === 'Profession') {
      // The Ledger matches a profession by name (tags like [TEST] ignored) and its access lists by dnd5e skill/tool name.
      if (!PROFESSION_KEYS.includes(professionKey(rec.name))) notes.push(`${rec.id}: name ${JSON.stringify(rec.name)} is not one of the Ledger's 14 professions, so Assign and the tools table ignore it.`);
      else for (const u of catalogCrosswalk([{sourceId: rec.id, name: rec.name, access: rec.access}]).unresolved)
        errors.push(`${rec.id}: access.${u.field} "${u.name}" matches no dnd5e ${u.field === 'skillProficienciesAnyOf' ? 'skill' : 'tool'} (the Ledger ignores it).`);
    }
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
  return {errors, notes};
}

/** Validates one parsed file. Returns {kind, errors, notes}. */
export async function checkContent(data, filename = '') {
  if (/\.scene-moods\.json$/i.test(filename)) {
    if (!Array.isArray(data) || !data.length) return {kind: 'scene-moods', errors: ['Expected a non-empty array of presets.'], notes: []};
    const seen = new Set(), errors = [];
    data.forEach((p, i) => { for (const e of validatePreset(p)) errors.push(`presets[${i}] ${p?.id ?? '?'}: ${e}`); if (seen.has(p?.id)) errors.push(`presets[${i}]: id ${p.id} is used twice.`); seen.add(p?.id); });
    return {kind: 'scene-moods', errors, notes: ['Reference shape: Manager has no file import for scene moods (add them in Manager > Scenes).']};
  }
  if (/\.organize-rules\.json$/i.test(filename)) {
    const validate = await organizeValidator();
    if (!validate) return {kind: 'organize-rules', errors: [], notes: ['Not checked: Organize (Manager 0.25.0) is not in this checkout.']};
    return {kind: 'organize-rules', errors: validate(Array.isArray(data) ? data : data?.rules), notes: []};
  }
  const specialist = detectSpecialistFile(data);
  if (specialist === 'quests') return {kind: 'quests', errors: planQuestImport(data).errors, notes: []};
  if (specialist === 'skill-trees') { const v = validateTrees(data); return {kind: 'skill-trees', errors: v.errors, notes: v.warnings}; }
  if (specialist === 'factions') return {kind: 'factions', errors: planFactions(data).errors, notes: []};
  if (specialist === 'headquarters') return {kind: 'headquarters', errors: planFacilityImport(data).errors, notes: []};
  const delivery = data && typeof data === 'object' && !Array.isArray(data) ? classifyDelivery(data) : null;
  if (delivery) return {kind: delivery.kind, errors: [delivery.notice], notes: []};
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.records)) return {kind: null, errors: [describeUnrecognized(data)], notes: []};
  let pkg;
  try { pkg = compilePackage(data); } catch (e) { return {kind: 'manager', errors: [e.message], notes: []}; }
  const errors = validatePackage(pkg, new Map());
  if (errors.length) return {kind: 'manager', errors, notes: []};
  const extra = domainChecks(pkg);
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
  const lines = [], byFolder = new Map();
  let ok = true;
  for (const file of targets.flatMap(t => jsonFiles(path.resolve(t)))) {
    const rel = path.relative(process.cwd(), file);
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { ok = false; lines.push(`FAIL ${rel}: not valid JSON (${e.message})`); continue; }
    const reject = expectsRejection(file);
    const expected = reject && data && typeof data === 'object' && !Array.isArray(data) ? data._expect_error : undefined;
    if (expected !== undefined) delete data._expect_error;
    const {kind, errors, notes} = await checkContent(data, file);
    if (reject) {
      const matched = !expected || errors.some(e => e.includes(expected));
      if (errors.length && matched) lines.push(`ok   ${rel} rejected as expected: ${errors[0]}`);
      else { ok = false; lines.push(`FAIL ${rel}: expected rejection${expected ? ` with "${expected}"` : ''}; got ${errors.length ? errors.join(' | ') : 'accepted'}`); }
      continue;
    }
    if (errors.length) { ok = false; lines.push(`FAIL ${rel} (${kind ?? 'unrecognised'}):\n  - ${errors.join('\n  - ')}`); continue; }
    lines.push(`ok   ${rel} (${kind})${notes.length ? `\n  note: ${notes.join('\n  note: ')}` : ''}`);
    if (!['scene-moods', 'organize-rules'].includes(kind)) {
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
