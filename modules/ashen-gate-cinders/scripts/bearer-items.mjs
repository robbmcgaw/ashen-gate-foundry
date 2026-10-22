/** Ashen Gate | Cinders 0.10.0: the bearer's signature ability and passive. Pure rules, no Foundry globals.
 * A Cinder definition (MUT-*, ag-cinder/0.2) may name two Power records in cinder.bearer_items: {active?, passive?}. While a Cinder is
 * bound, its bearer has a copy of each as an Item, tagged flags.<module>.bearerItem = {instanceId, definitionId, slot, sourceId}.
 * They cost no points and are not tree nodes; Skill Trees' own tagged perk copies are never touched. */
export const BEARER_FLAG = 'bearerItem';
export const BEARER_SLOTS = ['active', 'passive'];
/** The power.kind each slot takes. */
export const SLOT_KIND = {active: 'signature_active', passive: 'signature_passive'};
export const SLOT_LABEL = {active: 'Signature ability', passive: 'Passive'};
const REF = /^POWER-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const plain = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** The usable bearer_items of a MUT-* definition: {active?, passive?} with POWER-* ids only. */
export function bearerItemsOf(definition) {
  const raw = plain(definition?.cinder) && plain(definition.cinder.bearer_items) ? definition.cinder.bearer_items : {};
  const out = {};
  for (const slot of BEARER_SLOTS) if (typeof raw[slot] === 'string' && REF.test(raw[slot])) out[slot] = raw[slot];
  return out;
}
/** This module's tag on an Item, or null. Skill Trees' tagged perk copies (flags.ashen-gate-skill-trees.grant) never count as ours. */
export function bearerTag(item, module) {
  const tag = item?.flags?.[module]?.[BEARER_FLAG];
  if (!plain(tag) || typeof tag.instanceId !== 'string' || !BEARER_SLOTS.includes(tag.slot)) return null;
  if (item?.flags?.['ashen-gate-skill-trees']?.grant) return null;
  return {instanceId: tag.instanceId, definitionId: typeof tag.definitionId === 'string' ? tag.definitionId : null, slot: tag.slot, sourceId: typeof tag.sourceId === 'string' ? tag.sourceId : null};
}
/**
 * What to do so that one character carries exactly the bearer items of the Cinders it bears.
 * items: [{id, tag}] (tag from bearerTag; untagged items are ignored). want: [{instanceId, definitionId, items: {active?, passive?} | null}];
 * items null means the definition could not be read right now: that Cinder's copies are left as they are.
 * Returns {keep: [{id, instanceId, slot}], remove: [{id, instanceId, slot, why}], create: [{instanceId, definitionId, slot, sourceId}]}.
 * Per Cinder and slot the first copy of the right power is kept; further copies (duplicates), copies of another power (the definition
 * changed) and copies for a Cinder the character does not bear are removed. Never touches an untagged item.
 */
export function planBearerItems(items, want) {
  const keep = [], remove = [], create = [];
  const tagged = (Array.isArray(items) ? items : []).filter(i => i?.tag);
  for (const w of Array.isArray(want) ? want : []) for (const slot of BEARER_SLOTS) {
    if (w.items == null) {for (const i of tagged) if (i.tag.instanceId === w.instanceId && i.tag.slot === slot) keep.push({id: i.id, instanceId: w.instanceId, slot}); continue;}
    const sourceId = w.items?.[slot];
    const mine = tagged.filter(i => i.tag.instanceId === w.instanceId && i.tag.slot === slot);
    const right = sourceId ? mine.filter(i => i.tag.sourceId === sourceId) : [];
    if (right.length) keep.push({id: right[0].id, instanceId: w.instanceId, slot});
    else if (sourceId) create.push({instanceId: w.instanceId, definitionId: w.definitionId, slot, sourceId});
    for (const i of mine) if (i !== right[0]) remove.push({id: i.id, instanceId: w.instanceId, slot, why: right.includes(i) ? 'duplicate' : sourceId ? 'replaced' : 'not on the Cinder'});
  }
  const borne = new Set((Array.isArray(want) ? want : []).map(w => w.instanceId));
  for (const i of tagged) if (!borne.has(i.tag.instanceId)) remove.push({id: i.id, instanceId: i.tag.instanceId, slot: i.tag.slot, why: 'not borne'});
  return {keep, remove, create};
}
/** Item data for the bearer's copy of a world Item (its toObject()): no id, folder, sort, ownership or stats, other modules' tags off, our tag on. */
export function bearerItemData(source, module, {instanceId, definitionId, slot, sourceId}) {
  const data = structuredClone(source ?? {});
  for (const key of ['_id', 'folder', 'sort', 'ownership', '_stats']) delete data[key];
  const flags = plain(data.flags) ? data.flags : {};
  delete flags['ashen-gate-skill-trees'];
  flags[module] = {[BEARER_FLAG]: {instanceId, definitionId, slot, sourceId}};
  data.flags = flags;
  return data;
}

// ---- What a player may change on a bearer item (the GM changes anything) ----
/** Paths of an update diff, flattened ("system.uses.spent"); keys already dotted stay as they are. */
export function changedPaths(changes, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(plain(changes) ? changes : {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (plain(v) && Object.keys(v).length) out.push(...changedPaths(v, p));
    else out.push(p);
  }
  return out;
}
/** Using the item (spending and recovering uses, dnd5e's own bookkeeping) is allowed; its mechanics are not. */
const PLAYER_PATHS = [/^_id$/, /^_stats\./, /^sort$/, /^system\.uses\.spent$/, /^system\.activities\.[A-Za-z0-9]+\.uses\.spent$/, /^system\.activities\.[A-Za-z0-9]+\._id$/,
  /^flags\.(?!ashen-gate-cinders\.|ashen-gate-manager\.|ashen-gate-skill-trees\.|-=)[A-Za-z0-9_-]+\./];
/** Null when a non-GM user may make this update to a bearer item, else the reason. */
export function playerUpdateProblem(changes) {
  const bad = changedPaths(changes).filter(p => !PLAYER_PATHS.some(re => re.test(p)));
  return bad.length ? `Only the GM can change a Cinder's signature ability or passive (${bad.slice(0, 3).join(', ')}).` : null;
}
