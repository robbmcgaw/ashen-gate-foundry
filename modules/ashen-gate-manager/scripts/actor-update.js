import {MODULE_ID, planRecord, flatten, getPath, equal, isPlainObject} from './core.js';
import {canonicalDefinition} from './source-projection.mjs';
/**
 * Opt-in update of existing Actors on re-import (0.19.0).
 * An Actor is matched only by the canonical id in Manager's source flag, never by name.
 * Only definition fields the package owns are written: name, img (if the package gives one),
 * the prototypeToken values the package defines, and embedded Items the package put there.
 * system data (HP, XP, level, …), effects/conditions, player-added Items, folder, ownership and
 * every other module's flags are never touched.
 */
export const ITEM_FLAG = 'packageItem';      // on embedded Items Manager owns: the package item key
export const ACTOR_ITEMS_FLAG = 'actorItems'; // on Actors whose package Items are all marked
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Embedded Item values that are play state, never definition.
const ITEM_PLAY_STATE = new Set(['system.quantity', 'system.equipped', 'system.attuned', 'system.identified',
  'system.prepared', 'system.preparation.prepared', 'system.uses.spent', 'system.uses.value',
  'system.recharge.charged', 'system.hp.value', 'system.container']);
const ITEM_SKIP = new Set(['_id', 'flags', 'effects', 'sort', 'folder', 'ownership', '_stats']);

/** Stable key per package Item: type and name, with #2, #3… for repeats. */
export function itemKeys(defs = []) {
  const seen = new Map();
  return defs.map(def => {
    const base = `${def.type}:${def.name}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}
const keyOf = item => item?.flags?.[MODULE_ID]?.[ITEM_FLAG] ?? null;
const itemLeaves = def => flatten(Object.fromEntries(Object.entries(def).filter(([k]) => !ITEM_SKIP.has(k))));

/** Package-owned Actor leaf paths. */
export function ownedActorFields(data) {
  const owned = {name: data.name};
  if (own(data, 'img')) owned.img = data.img;
  if (isPlainObject(data.prototypeToken)) owned.prototypeToken = data.prototypeToken;
  return flatten(owned);
}

/** World Actors bound to this record's canonical id. Name is never used. */
export function matchActors(record, actors, read = a => a.toObject?.() ?? a) {
  return actors.filter(actor => read(actor)?.flags?.[MODULE_ID]?.source?.sourceId === record.id);
}

const show = value => {
  const text = JSON.stringify(value ?? null);
  return text.length > 120 ? '(long text)' : text;
};

/**
 * Preview decision for one Actor record. raws are the matched Actors' toObject() data.
 * Returns {action, reason, patch, changes}; patch is {fields, items:{create, update, adopt}, touched}.
 */
export function planActor(record, raws, {updateExisting = false, includeDrafts = false, sameNameUnmanaged = false, isBundled = () => false} = {}) {
  const base = planRecord(record, [], raws.length ? false : sameNameUnmanaged, includeDrafts);
  if (!raws.length || base.action !== 'create') return {...base, changes: []};
  if (raws.length > 1) return {action: 'blocked', reason: 'Two or more existing Actors share this permanent ID.', changes: []};
  if (!updateExisting) return {action: 'skipped', reason: 'Actor already exists; kept unchanged. Turn on "Update existing actors" to update its definition.', changes: []};
  const raw = raws[0], data = record.foundry.data;
  const baseline = raw.flags?.[MODULE_ID]?.source?.managedFields;
  if (!isPlainObject(baseline)) return {action: 'blocked', reason: 'No record of the last import on this Actor, so GM edits cannot be told apart from package changes. Update it by hand.', changes: []};
  if (raw.type !== data.type) return {action: 'blocked', reason: `Actor type differs (${raw.type} in the world, ${data.type} in the package).`, changes: []};

  const changes = [], notes = [], fields = {};
  for (const [path, incoming] of Object.entries(ownedActorFields(data))) {
    const live = getPath(raw, path);
    if (equal(live, incoming)) continue;
    if (own(baseline, path) && equal(baseline[path], incoming)) continue; // GM edit; package unchanged
    if (typeof incoming === 'string' && isBundled(incoming)) {notes.push(`${path} points to ZIP artwork; not changed on update`); continue;}
    fields[path] = incoming;
    const gmEdit = own(baseline, path) && !equal(live, baseline[path]);
    changes.push(`${path}: ${show(live)} → ${show(incoming)}${gmEdit ? ' (replaces a GM edit)' : ''}`);
  }

  const defs = data.items ?? [], keys = itemKeys(defs);
  const baseDefs = Array.isArray(baseline.items) ? baseline.items : [];
  const baseByKey = new Map(itemKeys(baseDefs).map((k, i) => [k, baseDefs[i]]));
  const liveItems = raw.items ?? [];
  const marked = new Map(liveItems.filter(keyOf).map(item => [keyOf(item), item]));
  const unmarked = (type, name) => liveItems.filter(item => !keyOf(item) && item.type === type && item.name === name);
  const legacy = !raw.flags?.[MODULE_ID]?.[ACTOR_ITEMS_FLAG];
  const items = {create: [], update: [], adopt: []}, touched = [];
  defs.forEach((def, i) => {
    const key = keys[i], baseDef = baseByKey.get(key);
    let live = marked.get(key);
    // Actors imported before 0.19.0 have unmarked Items: adopt the one Manager created, if unambiguous.
    if (!live && legacy && baseDef) {
      const found = unmarked(baseDef.type, baseDef.name);
      if (found.length > 1) {notes.push(`item "${def.name}": ${found.length} unmarked copies on the Actor; left alone`); return;}
      if (found.length === 1) {live = found[0]; items.adopt.push({_id: live._id, key});}
    }
    if (!live) {
      if (baseDef) {notes.push(`item "${def.name}" is no longer on this Actor; not re-added`); return;}
      if (unmarked(def.type, def.name).length) {notes.push(`item "${def.name}": the Actor already has its own item with this name; not added`); return;}
      const copy = structuredClone(def);
      copy.flags = {...(copy.flags ?? {}), [MODULE_ID]: {...(copy.flags?.[MODULE_ID] ?? {}), [ITEM_FLAG]: key}};
      items.create.push(copy); touched.push(key);
      changes.push(`add item "${def.name}"`);
      return;
    }
    const baseLeaves = baseDef ? itemLeaves(baseDef) : {};
    const patch = {};
    for (const [path, incoming] of Object.entries(itemLeaves(def))) {
      if (ITEM_PLAY_STATE.has(path)) continue;
      if (equal(getPath(live, path), incoming)) continue;
      if (own(baseLeaves, path) && equal(baseLeaves[path], incoming)) continue; // edited in Foundry; package unchanged
      patch[path] = incoming;
    }
    if (Object.keys(patch).length) {
      items.update.push({_id: live._id, ...patch}); touched.push(key);
      changes.push(`update item "${def.name}": ${Object.keys(patch).join(', ')}`);
    }
  });
  const kept = [...marked.keys()].filter(key => !keys.includes(key));
  if (kept.length) notes.push(`${kept.length} item(s) no longer in the package kept on the Actor`);

  // 0.41.2: record text the Actor projection does not hold (an NPC's role, wants, codex block, ...) lives in the stored
  // source definition, which the NPC Codex reads. A change there alone is still an update: only the source flag is rewritten.
  const stored = raw.flags?.[MODULE_ID]?.source?.definition;
  const incomingDef = canonicalDefinition(record);
  if (isPlainObject(stored)) {
    const textKeys = [...new Set([...Object.keys(stored), ...Object.keys(incomingDef)])].filter(k => !equal(stored[k], incomingDef[k])).sort();
    if (textKeys.length) changes.push(`record text: ${textKeys.join(', ')} (NPC Codex and other readers see the new text)`);
  }
  if (!changes.length) return {action: 'unchanged', reason: `Actor already matches the package.${notes.length ? ` ${notes.join('; ')}.` : ''}`, changes: []};
  return {action: 'update', reason: `Updates ${changes.length} definition change(s); HP, XP, level, conditions, player items, folder, ownership and other modules' data are kept.${notes.length ? ` ${notes.join('; ')}.` : ''}`,
    patch: {fields, items, touched}, changes};
}

/** Writes a planned update. GM only. Items first, so a failed run leaves the old baseline and can be re-run. */
export async function applyActorUpdate(doc, plan, {user, source}) {
  if (!user?.isGM) throw new Error('Only a GM can update Actors.');
  if (plan?.action !== 'update') throw new Error('Nothing to update.');
  const {fields, items} = plan.patch;
  const updates = [...items.adopt.map(a => ({_id: a._id, [`flags.${MODULE_ID}.${ITEM_FLAG}`]: a.key})), ...items.update];
  if (updates.length) await doc.updateEmbeddedDocuments('Item', updates);
  if (items.create.length) await doc.createEmbeddedDocuments('Item', items.create);
  await doc.update({...fields, [`flags.${MODULE_ID}.source`]: source, [`flags.${MODULE_ID}.${ACTOR_ITEMS_FLAG}`]: {version: 1}});
  return doc;
}
