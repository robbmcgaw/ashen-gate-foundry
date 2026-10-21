import {CONTRACT_ID, isContractImport, checkContractRecord, checkContractGraph, checkLegacyCrosswalk, ownerModuleFor} from "./contract.js";
import {domainHandoff} from './delivery.js';
import {validateLogicalProjection} from './source-projection.mjs';
import {validateImportPresentation} from './import-fidelity.js';
import {validateItemEffects, validateItemFlags, allowedItemFlags} from './item-effects.js';
import {modifierRecordProblems} from './modifier-definitions.js';
/** Ashen Gate Manager — pure, side-effect-free import planning tools. v0.1.0 */
export const MODULE_ID = "ashen-gate-manager";
export const MANAGED_TYPES = ["Item", "JournalEntry", "Actor", "RollTable", "Macro"];
export const ACTIVE_STATUSES = new Set(["approved", "draft", "proposed", "example_only"]);
export const BLOCKED_STATUSES = new Set(["superseded", "retired", "rejected", "deprecated"]);
export const VISIBILITIES = new Set(["player", "gm", "reveal-gated"]);
export const SOURCE_ID_PATTERN = /^[A-Z][A-Z0-9]*-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export const isPlainObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (isPlainObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
  return value;
}
export const canonical = value => JSON.stringify(normalize(value));
export const equal = (a, b) => canonical(a) === canonical(b);
export function getPath(object, path) {
  return path.split(".").reduce((v, k) => v == null ? undefined : v[k], object);
}
/** Flat leaf paths. Array values are atomic; no document-managed flags, ownership or embedded Items. */
export function flatten(value, prefix = "", result = {}) {
  if (isPlainObject(value) && Object.keys(value).length) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, result);
  } else if (prefix) result[prefix] = value;
  return result;
}
export function exportedFields(record) {
  const data = record?.foundry?.data ?? {};
  if (record?.foundry?.document_type === "Item") {
    const keys = {name: data.name};
    if (own(data, "img")) keys.img = data.img;
    if (own(data, "system")) keys.system = data.system;
    // Only allow-listed flags are managed fields (0.37.0); effects are matched and compared per effect (item-effects.js).
    const flags = allowedItemFlags(data.flags);
    if (Object.keys(flags).length) keys.flags = flags;
    return flatten(keys);
  }
  if (record?.foundry?.document_type === 'Actor' || record?.foundry?.document_type === 'RollTable' || record?.foundry?.document_type === 'Macro') {
    // Creation-only projections. Never use these fields to update a live Actor, roll result or script.
    return flatten(data);
  }
  const keys = {name: data.name};
  if (own(data, "img")) keys.img = data.img;
  return flatten(keys);
}
function refsFor(record) {
  return record.refs.map(r => typeof r === "string" ? {id:r,optional:false} : typeof r?.target_id === "string" ? {id:r.target_id,optional:!["hard_requirement","required"].includes(r.mode)} : r);
}
function badKeys(object, whitelist) { return Object.keys(object).filter(key => !whitelist.includes(key)); }
function containsUnsafeKeys(value) {
  if (Array.isArray(value)) return value.some(containsUnsafeKeys);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key,val]) => ['__proto__','prototype','constructor'].includes(key) || containsUnsafeKeys(val));
}

export function validatePackage(input, existingIds = new Set()) {
  const errors = [];
  if (!isPlainObject(input)) return ["Root: must be a JSON object."];
  if (!isPlainObject(input.manifest)) errors.push("manifest: an object is required.");
  if (!Array.isArray(input.records)) errors.push("records: an array is required.");
  if (errors.length) return errors;
  const manifest = input.manifest;
  const strict = isContractImport(input);
  if (!["ag-foundry-import/0.1", "ag-foundry-import/0.2"].includes(manifest.schema_version)) errors.push("manifest.schema_version must equal ag-foundry-import/0.1 or /0.2.");
  if (typeof manifest.package_id !== "string" || !manifest.package_id.trim()) errors.push("manifest.package_id is required.");
  if (typeof manifest.version !== "string" || !manifest.version.trim()) errors.push("manifest.version is required.");
  if (input.records.length > 2000) errors.push("Manager import limit: 2000 records per package (split larger bundles).");
  const ids = new Set();
  input.records.forEach((record, index) => {
    const label = `records[${index}]`;
    if (!isPlainObject(record)) {errors.push(`${label} must be an object.`); return;}
    if (containsUnsafeKeys(record)) {errors.push(`${label}: unsafe prototype property names are forbidden.`); return;}
    errors.push(...validateImportPresentation(record));
    if (strict) errors.push(...validateLogicalProjection(record));
    if (strict) errors.push(...checkContractRecord(record,label));
    // Record-level modifiers block and implementation field (0.41.0); scope owners check targets and values.
    errors.push(...modifierRecordProblems(record, typeof record.id === 'string' && record.id ? record.id : label));
    const id = record.id;
    if (typeof id !== "string" || !(strict ? CONTRACT_ID : SOURCE_ID_PATTERN).test(id)) errors.push(`${label}.id: invalid permanent ID.`);
    if (ids.has(id)) errors.push(`${label}.id: duplicate ID ${id}.`);
    ids.add(id);
    if (typeof record.entity_type !== "string" || !record.entity_type.trim()) errors.push(`${label}.entity_type is required.`);
    if (!ACTIVE_STATUSES.has(record.status) && !BLOCKED_STATUSES.has(record.status)) errors.push(`${label}.status: unrecognized lifecycle status.`);
    if (typeof record.version !== "string" || !record.version.trim()) errors.push(`${label}.version is required.`);
    if (!isPlainObject(record.provenance) || Object.keys(record.provenance).length === 0) errors.push(`${label}.provenance must be a nonempty object.`);
    if (!(strict ? ["player","gm","reveal_gated"].includes(record.visibility) : VISIBILITIES.has(record.visibility))) errors.push(`${label}.visibility must be player, gm or ${strict ? "reveal_gated" : "reveal-gated"}.`);
    if (!Array.isArray(record.refs)) errors.push(`${label}.refs must be an array (may be empty).`);
    if (!isPlainObject(record.foundry)) {if (!strict) errors.push(`${label}.foundry must be an object.`); return;}
    const {document_type, data} = record.foundry;
    if (!MANAGED_TYPES.includes(document_type)) errors.push(`${label}.foundry.document_type: unsupported document type ${document_type}. Allowed: ${MANAGED_TYPES.join(", ")}.`);
    if (!isPlainObject(data)) {errors.push(`${label}.foundry.data must be an object.`); return;}
    if (typeof data.name !== "string" || !data.name.trim()) errors.push(`${label}.foundry.data.name is required.`);
    const allowed = {
      Item: ["name", "type", "img", "system", "effects", "flags"],
      JournalEntry: ["name", "img", "pages"],
      Actor: ["name", "type", "img", "system", "prototypeToken", "items", "effects", "flags"],
      RollTable: ["name", "img", "description", "formula", "replacement", "displayRoll", "results"],
      Macro: ["name", "img", "type", "scope", "command"]
    }[document_type] ?? [];
    const unknown = badKeys(data, allowed);
    if (unknown.length) errors.push(`${label}.foundry.data includes unsupported keys: ${unknown.join(", ")}.`);
    if (document_type === "Item") {
      if (typeof data.type !== "string" || !data.type.trim()) errors.push(`${label}.foundry.data.type is required for Items.`);
      if (own(data, "system") && !isPlainObject(data.system)) errors.push(`${label}.foundry.data.system must be an object.`);
      errors.push(...validateItemEffects(data.effects, `${label}.foundry.data`), ...validateItemFlags(data.flags, `${label}.foundry.data`));
    }
    if (document_type === 'Actor') {
      if (!['npc', 'character'].includes(data.type)) errors.push(`${label}.foundry.data.type: only npc or character Actors may be created.`);
      if (own(data,'system')&&!isPlainObject(data.system)) errors.push(`${label}: Actor system must be an object.`);
      if (own(data,'prototypeToken')&&!isPlainObject(data.prototypeToken)) errors.push(`${label}: Actor prototypeToken must be an object.`);
      if (own(data,'items')&&(!Array.isArray(data.items)||data.items.some(item=>!isPlainObject(item)||typeof item.name!=='string'||!item.type)))
        errors.push(`${label}: Actor items must be an array of embedded Foundry Item definitions with name and type.`);
      if (own(data,'effects')&&!Array.isArray(data.effects)) errors.push(`${label}: Actor effects must be an array.`);
      if (own(data,'flags')&&!isPlainObject(data.flags)) errors.push(`${label}: Actor flags must be an object.`);
    }
    if (document_type === 'RollTable') {
      if (own(data,'results')&&(!Array.isArray(data.results)||data.results.some(entry=>!isPlainObject(entry))))
        errors.push(`${label}: RollTable results must be an array of Foundry result objects.`);
      if (Array.isArray(data.results)) data.results.forEach((entry,ri)=>{
        if (own(entry,'type')&&!['document','text'].includes(entry.type))
          errors.push(`${label}.foundry.data.results[${ri}].type must be "document" or "text".`);
        if (own(entry,'range')&&(!Array.isArray(entry.range)||entry.range.length!==2||entry.range.some(n=>!Number.isFinite(n))||entry.range[0]>entry.range[1]))
          errors.push(`${label}.foundry.data.results[${ri}].range must be an ascending pair of finite numbers.`);
        if (own(entry,'weight')&&(!Number.isFinite(entry.weight)||entry.weight<=0))
          errors.push(`${label}.foundry.data.results[${ri}].weight must be a positive finite number.`);
      });
      if (own(data,'formula')&&typeof data.formula!=='string') errors.push(`${label}: RollTable formula must be a string.`);
    }
    if (document_type === 'Macro') {
      if (!['script','chat'].includes(data.type)) errors.push(`${label}: Macro type must be script or chat.`);
      if (typeof data.command !== 'string') errors.push(`${label}: Macro command is required as a string.`);
      if (own(data,'scope')&&!['global'].includes(data.scope)) errors.push(`${label}: unsupported Macro scope.`);
    }
    if (document_type === "JournalEntry" && own(data, "pages")) {
      if (!Array.isArray(data.pages)) errors.push(`${label}.foundry.data.pages must be an array.`);
      else data.pages.forEach((page, pi) => {
        if (!isPlainObject(page) || badKeys(page, ["name","type","text"]).length || typeof page.name !== "string" || page.type !== "text" || !isPlainObject(page.text) || typeof page.text.content !== "string" || badKeys(page.text,["content","format"]).length) errors.push(`${label}.pages[${pi}]: use {name, type:"text", text:{content, format?}}.`);
      });
    }
    if (Array.isArray(record.refs)) {
      record.refs.forEach((r, ri) => {
        const typed = isPlainObject(r) && own(r,"target_id");
        const ref = typeof r === "string" ? {id:r} : typed ? {id:r.target_id, optional:!["hard_requirement","required"].includes(r.mode)} : r;
        if (typed && (typeof r.relation !== "string" || !r.relation.trim() || !(strict ? ["required","optional"] : ["hard_requirement","coupled","optional_integration","required","optional"]).includes(r.mode) || badKeys(r,["relation","target_id","mode"]).length))
          errors.push(`${label}.refs[${ri}]: invalid typed reference {relation,target_id,mode}.`);
        if (!isPlainObject(ref) || typeof ref.id !== "string" || !(strict ? CONTRACT_ID : SOURCE_ID_PATTERN).test(ref.id) || (own(ref,"optional") && typeof ref.optional !== "boolean") || (!typed && badKeys(ref,["id","optional","type"]).length)) errors.push(`${label}.refs[${ri}]: invalid reference.`);
      });
    }
  });
  if (errors.length) return errors;
  if (strict) {
    const graph=checkContractGraph(input.records, existingIds);
    return [...graph.errors,...checkLegacyCrosswalk(input.legacy_crosswalk)];
  }
  for (const record of input.records) {
    for (const ref of refsFor(record)) {
      if (!ref.optional && !ids.has(ref.id) && !existingIds.has(ref.id)) {const owner=ownerModuleFor(ref.id);errors.push(`${record.id}: unresolved required reference ${ref.id}.${owner?` It is a ${owner.label} record (imported separately): import it in ${owner.label} first, or make the link optional.`:''}`);}
    }
  }
  return errors;
}

/**
 * A matched document is represented by its current readable fields and our flag.
 * A source-owned field changed both locally and in the package becomes a conflict.
 */
export function planRecord(record, matches = [], sameNameUnmanaged = false, includeDrafts = false) {
  if (record.scope === 'campaign_state') return {action:'blocked',reason:'Campaign state belongs to the owning gameplay system; Manager does not import mutable state.'};
  const handoff=domainHandoff(record);
  if(handoff) return {action:'blocked',reason:handoff};
  if (!record.foundry?.data) return {action:'blocked',reason:'No Foundry Item/Journal projection. Supply an explicit system adapter; source record remains view-only.'};
  const data = record.foundry.data;
  const kind = record.foundry.document_type;
  if (BLOCKED_STATUSES.has(record.status)) return {action:"blocked", reason:`${record.status} records cannot be imported.`};
  if (record.status !== "approved" && !includeDrafts) return {action:"skipped", reason:"Unapproved record; enable Include drafts to test."};
  if (matches.length > 1) return {action:"blocked", reason:"Two or more existing documents share this permanent ID."};
  // Source imports cannot update Actor character/monster state, rolls, or executable macros.
  if (matches.length && ['Actor','RollTable','Macro'].includes(kind))
    return {action:'blocked',reason:`Existing ${kind} is never overwritten by a generic Manager import; use the owning Foundry interface.`};
  if (matches.length === 0) {
    if (sameNameUnmanaged) return {action:"blocked", reason:"Unmanaged existing document has same name; rename or resolve manually."};
    return {action:"create", reason:"New source ID."};
  }
  const doc = matches[0];
  if (doc.documentName !== kind) return {action:"blocked", reason:"Existing source ID uses a different Foundry document type."};
  if (kind === "Item" && doc.type !== data.type) return {action:"blocked", reason:"Existing Item subtype differs; no subtype migration in v0.1."};
  const flag = doc.flag;
  if (!flag || !isPlainObject(flag.managedFields)) return {action:"blocked", reason:"Missing previous managed-field baseline; manual repair required."};
  if (kind === "JournalEntry" && !equal(flag.pagesDefinition ?? [], data.pages ?? [])) return {action:"blocked", reason:"Journal page changes require a later page-aware updater; v0.1 preserves pages."};
  const fields = exportedFields(record);
  // Core links (0.26.0): fields adopted from a 2024 core item belong to that item now. Re-import keeps them
  // and reports them as a known local edit instead of updating, conflicting or blocking on them.
  const link = doc.coreLink?.adopted ? doc.coreLink : null;
  const coreOwned = path => Boolean(link) && (link.adoptedPaths ?? []).some(p => path === p || path.startsWith(`${p}.`));
  const coreKept = [];
  for (const key of Object.keys(flag.managedFields)) {
    if (!own(fields, key) && !coreOwned(key)) return {action:"blocked", reason:`Source removed ${key}; v0.1 requires manual review of removed fields.`};
  }
  const patch = {};
  const locallyEdited = [];
  const conflicting = [];
  for (const [path, incoming] of Object.entries(fields)) {
    const old = flag.managedFields[path];
    if (coreOwned(path)) {if (!equal(incoming, old)) coreKept.push(path); continue;}
    if (!own(flag.managedFields, path)) {
      if (doc.get(path) === undefined) {patch[path] = incoming; continue;}
      // Already the same live value (e.g. a Hub role flag the GM set by hand): adopt it, nothing to write.
      if (equal(doc.get(path), incoming)) continue;
      return {action:"blocked", reason:`New managed field ${path} already has a live value; review before adopting.`};
    }
    const live = doc.get(path);
    const sourceChanged = !equal(incoming, old);
    const localChanged = !equal(live, old);
    if (sourceChanged && localChanged && !equal(live, incoming)) conflicting.push(path);
    else if (sourceChanged && !equal(live, incoming)) patch[path] = incoming;
    else if (localChanged && !sourceChanged) locallyEdited.push(path);
  }
  const coreNote = link ? ` Core-linked to ${link.name ?? 'a 2024 core item'}: keeps the adopted core image and data${coreKept.length ? ` (${coreKept.length} source change(s) to those fields not applied)` : ''}.` : '';
  if (conflicting.length) return {action:"conflict", reason:`Both source and Foundry edited: ${conflicting.join(", ")}.${coreNote}`, conflicting};
  if (Object.keys(patch).length) return {action:"update", reason:(locallyEdited.length ? `Safely update ${Object.keys(patch).length} fields; preserve local edits to ${locallyEdited.join(", ")}.` : `${Object.keys(patch).length} source field(s) changed.`)+coreNote, patch};
  if (locallyEdited.length) return {action:"local", reason:`No new source changes; preserves local edits to ${locallyEdited.join(", ")}.${coreNote}`};
  if (link) return {action:"local", reason:coreNote.trim(), coreKept};
  return {action:"unchanged", reason:"Already matches last imported source."};
}
