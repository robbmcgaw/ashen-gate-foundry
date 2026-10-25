/**
 * Item Active Effects from a package (0.37.0). An Item record may carry `foundry.data.effects`; each effect has its own
 * permanent `eff_id`, stored on the created ActiveEffect as flags.ashen-gate-manager.effect.effId so a re-import finds it
 * again. Effects are never matched by name. Re-import creates new effects, updates Manager-made effects field-wise
 * (fields the GM edited in Foundry are kept), never deletes one, and never touches an effect Manager did not create.
 * Also: the item-level `flags` allow-list. Pure logic; the only writes are in applyItemEffects (GM only).
 */
export const MODULE_ID = 'ashen-gate-manager';
export const EFFECT_FLAG = 'effect';
export const LIMITS = Object.freeze({effects: 20, changes: 30, name: 120, description: 5000, img: 500, key: 200, value: 500, statuses: 10});
/** Foundry CONST.ACTIVE_EFFECT_MODES. */
export const MODES = Object.freeze({custom: 0, multiply: 1, add: 2, downgrade: 3, upgrade: 4, override: 5});
const MODE_NAMES = Object.fromEntries(Object.entries(MODES).map(([k, v]) => [v, k]));
export const EFFECT_KEYS = Object.freeze(['eff_id', 'name', 'img', 'description', 'disabled', 'transfer', 'duration', 'statuses', 'changes', 'flags']);
const CHANGE_KEYS = ['key', 'mode', 'type', 'value', 'priority'];
const DURATION_KEYS = ['seconds', 'rounds', 'turns'];
export const EFF_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CHANGE_KEY = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/;
const STATUS_ID = /^[a-z][a-zA-Z0-9_-]{0,40}$/;
// Nothing in an imported effect may run code: no macro keys (DAE / Midi-QOL / Item Macro), no core flags, no scripts.
const UNSAFE_KEY = /macro|script|^flags\.core\.|^(?:_id|_stats|ownership|folder|sort|items|effects|flags)$/i;
const UNSAFE_TEXT = /<\s*script|javascript:|@macro\[|\bon[a-z]+\s*=/i;
/** Item flags a package may set: dotted path -> allowed values. Everything else in `flags` is dropped with a warning. */
export const ITEM_FLAG_ALLOW = Object.freeze({
  'ashen-gate-character-hub.companion.role': ['mount-gear', 'mount-perk', 'pet-clothing', 'pet-perk'],
  'ashen-gate-character-hub.companion.slot': ['saddle', 'tack', 'head', 'body']
});
const ROLE_PATH = 'ashen-gate-character-hub.companion.role';
const SLOT_PATH = 'ashen-gate-character-hub.companion.slot';
/** The one role each slot value may go with (the slot only says which Hub sockets the item fits). */
export const SLOT_ROLE = Object.freeze({saddle: 'mount-gear', tack: 'mount-gear', head: 'pet-clothing', body: 'pet-clothing'});
/** Why a slot value would not be imported, or '' when it is fine. `role` is the item's own companion.role flag. */
function slotProblem(slot, role) {
  if (!ITEM_FLAG_ALLOW[SLOT_PATH].includes(slot)) return `${JSON.stringify(slot)} is not a slot (use ${ITEM_FLAG_ALLOW[SLOT_PATH].join(', ')})`;
  if (SLOT_ROLE[slot] !== role) return `slot ${slot} goes only with companion.role ${SLOT_ROLE[slot]}, but this item's role flag is ${role === undefined ? 'missing' : JSON.stringify(role)}`;
  return '';
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const leaves = (value, prefix = '', out = {}) => {
  if (isObj(value) && Object.keys(value).length) for (const [k, v] of Object.entries(value)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  else if (prefix) out[prefix] = value;
  return out;
};
const getPath = (o, path) => path.split('.').reduce((v, k) => v == null ? undefined : v[k], o);
const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
const same = (a, b) => JSON.stringify(sortKeys(a ?? null)) === JSON.stringify(sortKeys(b ?? null));
const asList = c => c ? [...(c.contents ?? c.values?.() ?? c)] : [];

/** Numeric mode from a Foundry number (0-5) or a readable name (add, multiply, override, upgrade, downgrade, custom). */
export function normalizeMode(mode) {
  if (Number.isInteger(mode) && MODE_NAMES[mode] !== undefined) return mode;
  if (typeof mode === 'string' && own(MODES, mode.trim().toLowerCase())) return MODES[mode.trim().toLowerCase()];
  return null;
}

/**
 * V14 stores an ActiveEffect change's operation as the string `type` (add, multiply, override, upgrade, downgrade, custom);
 * the numeric `mode` is a deprecated shim removed in V15. Packages may still say `mode` (a number or a name) or `type`.
 * Returns the V14 type name, or null when it is not one.
 */
export function normalizeType(value) {
  const n = normalizeMode(value);
  return n === null ? null : MODE_NAMES[n];
}
/** A package change's operation: `type` when given, else the older `mode`. Reads package JSON only, never a live document. */
const packageOperation = c => normalizeType(own(c, 'type') ? c.type : c.mode);
/** A stored (older) baseline definition with its changes' numeric/named `mode` mapped to V14 `type`. Safe on null. */
export function upgradeBaseline(def) {
  if (!isObj(def) || !Array.isArray(def.changes)) return def;
  return {...def, changes: def.changes.map(c => {
    if (!isObj(c)) return c;
    const {mode, type, ...rest} = c;
    return {key: rest.key, type: normalizeType(type !== undefined ? type : mode) ?? type ?? null, value: rest.value, priority: rest.priority ?? null};
  })};
}

/** Embedded effect data from a package (an Actor's Items) with every change's `mode` mapped to V14 `type`. Other fields untouched. */
export function upgradeEffectChanges(effects) {
  return (Array.isArray(effects) ? effects : []).map(e => isObj(e) && Array.isArray(e.changes) ? {...e, changes: upgradeBaseline({changes: e.changes}).changes} : e);
}

/** Errors for one Item's `effects` (label is e.g. records[3].foundry.data). */
export function validateItemEffects(effects, label = 'foundry.data') {
  if (effects === undefined) return [];
  const at = `${label}.effects`;
  if (!Array.isArray(effects)) return [`${at} must be an array.`];
  const errors = [];
  if (effects.length > LIMITS.effects) errors.push(`${at}: at most ${LIMITS.effects} effects per Item.`);
  const ids = new Set();
  effects.slice(0, LIMITS.effects).forEach((e, i) => {
    const l = `${at}[${i}]`;
    if (!isObj(e)) { errors.push(`${l} must be an object.`); return; }
    const unknown = Object.keys(e).filter(k => !EFFECT_KEYS.includes(k));
    if (unknown.length) errors.push(`${l} includes unsupported keys: ${unknown.join(', ')} (allowed: ${EFFECT_KEYS.join(', ')}).`);
    if (typeof e.eff_id !== 'string' || !EFF_ID.test(e.eff_id)) errors.push(`${l}.eff_id is required: a permanent id unique in this Item (letters, digits, - or _, up to 64).`);
    else if (ids.has(e.eff_id)) errors.push(`${l}.eff_id: duplicate ${e.eff_id} in this Item.`);
    else ids.add(e.eff_id);
    if (typeof e.name !== 'string' || !e.name.trim() || e.name.length > LIMITS.name) errors.push(`${l}.name is required (text up to ${LIMITS.name} characters).`);
    if (own(e, 'img') && (typeof e.img !== 'string' || e.img.length > LIMITS.img || UNSAFE_TEXT.test(e.img))) errors.push(`${l}.img must be an image path (up to ${LIMITS.img} characters).`);
    if (own(e, 'description') && (typeof e.description !== 'string' || e.description.length > LIMITS.description)) errors.push(`${l}.description must be text/HTML up to ${LIMITS.description} characters.`);
    else if (typeof e.description === 'string' && UNSAFE_TEXT.test(e.description)) errors.push(`${l}.description: scripts, event attributes and @Macro links are not allowed.`);
    if (own(e, 'disabled') && typeof e.disabled !== 'boolean') errors.push(`${l}.disabled must be true or false.`);
    if (typeof e.transfer !== 'boolean') errors.push(`${l}.transfer is required: true applies the effect to the Actor holding the Item, false keeps it on the Item.`);
    if (own(e, 'duration')) {
      if (!isObj(e.duration)) errors.push(`${l}.duration must be an object {seconds?, rounds?, turns?}.`);
      else for (const [k, v] of Object.entries(e.duration)) {
        if (!DURATION_KEYS.includes(k)) errors.push(`${l}.duration.${k} is not supported (use ${DURATION_KEYS.join(', ')}).`);
        else if (!Number.isInteger(v) || v < 0 || v > 1e7) errors.push(`${l}.duration.${k} must be a whole number from 0.`);
      }
    }
    if (own(e, 'statuses') && (!Array.isArray(e.statuses) || e.statuses.length > LIMITS.statuses || e.statuses.some(s => typeof s !== 'string' || !STATUS_ID.test(s)) || new Set(e.statuses).size !== e.statuses.length))
      errors.push(`${l}.statuses must be up to ${LIMITS.statuses} unique status ids (e.g. "prone").`);
    if (own(e, 'flags') && !isObj(e.flags)) errors.push(`${l}.flags must be an object (effect flags are not imported).`);
    if (!Array.isArray(e.changes)) { errors.push(`${l}.changes must be an array (may be empty).`); return; }
    if (e.changes.length > LIMITS.changes) errors.push(`${l}.changes: at most ${LIMITS.changes} changes per effect.`);
    e.changes.slice(0, LIMITS.changes).forEach((c, ci) => {
      const cl = `${l}.changes[${ci}]`;
      if (!isObj(c)) { errors.push(`${cl} must be {key, type (or mode), value, priority?}.`); return; }
      const extra = Object.keys(c).filter(k => !CHANGE_KEYS.includes(k));
      if (extra.length) errors.push(`${cl} includes unsupported keys: ${extra.join(', ')}.`);
      if (typeof c.key !== 'string' || !c.key.trim()) errors.push(`${cl}.key is required (e.g. system.attributes.movement.speeds.walk).`);
      else if (c.key.length > LIMITS.key || !CHANGE_KEY.test(c.key)) errors.push(`${cl}.key "${c.key.slice(0, 60)}" is not a dotted data path.`);
      else if (UNSAFE_KEY.test(c.key) || c.key.split('.').some(p => ['__proto__', 'prototype', 'constructor'].includes(p))) errors.push(`${cl}.key "${c.key}" is not allowed: imported effects may not run macros or scripts or change core flags.`);
      if (packageOperation(c) === null) errors.push(`${cl}.mode ${JSON.stringify(own(c, 'type') ? c.type : c.mode)} is not a mode: use add, multiply, override, upgrade, downgrade, custom or 0-5.`);
      if (typeof c.value === 'number' ? !Number.isFinite(c.value) : typeof c.value !== 'string') errors.push(`${cl}.value must be a string or a number.`);
      else if (String(c.value).length > LIMITS.value) errors.push(`${cl}.value: at most ${LIMITS.value} characters.`);
      else if (typeof c.value === 'string' && /macro|<\s*script|javascript:/i.test(c.value)) errors.push(`${cl}.value: macros and scripts are not allowed.`);
      if (own(c, 'priority') && c.priority !== null && !Number.isFinite(c.priority)) errors.push(`${cl}.priority must be a number.`);
    });
  });
  return errors;
}

/** Errors for allowed item flags with a bad value. Paths outside the allow-list are not errors (see flagWarnings). */
export function validateItemFlags(flags, label = 'foundry.data') {
  if (flags === undefined) return [];
  if (!isObj(flags)) return [`${label}.flags must be an object.`];
  const errors = [];
  // companion.slot is never an error: a bad or mismatched slot is dropped with a preview warning (flagWarnings).
  for (const [path, value] of Object.entries(leaves(flags)))
    if (path !== SLOT_PATH && ITEM_FLAG_ALLOW[path] && !ITEM_FLAG_ALLOW[path].includes(value)) errors.push(`${label}.flags.${path} must be one of ${ITEM_FLAG_ALLOW[path].join(', ')}.`);
  return errors;
}

/** Only allow-listed item flags, as a nested object ({} when none). */
export function allowedItemFlags(flags) {
  const out = {};
  if (!isObj(flags)) return out;
  const all = leaves(flags);
  for (const [path, value] of Object.entries(all)) {
    if (!ITEM_FLAG_ALLOW[path]?.includes(value)) continue;
    if (path === SLOT_PATH && slotProblem(value, all[ROLE_PATH]) ) continue;
    const keys = path.split('.');
    let o = out;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    o[keys.at(-1)] = value;
  }
  return out;
}

/** Plain-language warnings for what an Item record's flags/effect flags lose on import (nothing is rejected for these). */
export function flagWarnings(record) {
  const data = record?.foundry?.document_type === 'Item' ? record.foundry.data : null;
  if (!isObj(data)) return [];
  const warnings = [];
  if (isObj(data.flags)) {
    const all = leaves(data.flags);
    const dropped = Object.keys(all).filter(p => !ITEM_FLAG_ALLOW[p]);
    if (SLOT_PATH in all) {
      const why = slotProblem(all[SLOT_PATH], ROLE_PATH in all && ITEM_FLAG_ALLOW[ROLE_PATH].includes(all[ROLE_PATH]) ? all[ROLE_PATH] : undefined);
      if (why) warnings.push(`${record.id}: companion.slot not imported: ${why}.`);
    }
    if (dropped.length) warnings.push(`${record.id}: flags not imported (only ${Object.keys(ITEM_FLAG_ALLOW).join(', ')} are): ${dropped.slice(0, 5).join(', ')}${dropped.length > 5 ? ', …' : ''}.`);
  }
  for (const e of Array.isArray(data.effects) ? data.effects : [])
    if (isObj(e?.flags) && Object.keys(e.flags).length) warnings.push(`${record.id}: effect ${e.eff_id ?? '?'} flags are not imported (Manager writes its own effect id).`);
  return warnings;
}

/** The managed definition of one effect, normalized (mode numbers, value strings). What Manager writes and compares. */
export function effectDefinition(e) {
  const def = {name: e.name, disabled: e.disabled === true, transfer: e.transfer === true,
    changes: e.changes.map(c => ({key: c.key.trim(), type: packageOperation(c), value: String(c.value), priority: Number.isFinite(c.priority) ? c.priority : null}))};
  if (own(e, 'img')) def.img = e.img;
  if (own(e, 'description')) def.description = e.description;
  if (own(e, 'statuses')) def.statuses = [...e.statuses];
  if (isObj(e.duration) && Object.keys(e.duration).length) def.duration = {...e.duration};
  return def;
}
/** Comparable leaf values; arrays (changes, statuses) are compared whole, normalized the same way as live data. */
const fieldsOf = def => leaves(def);
const liveValue = (raw, path) => {
  const v = getPath(raw, path);
  if (path === 'changes') return (Array.isArray(v) ? v : []).map(c => ({key: String(c?.key ?? ''), type: typeof c?.type === 'string' ? c.type : '', value: String(c?.value ?? ''), priority: Number.isFinite(c?.priority) ? c.priority : null}));
  if (path === 'statuses') return [...(v ?? [])].sort();
  return v;
};
/** Sync from package (0.55.0): the comparable leaves of an effect definition, and one live leaf normalized the same way. */
export const effectFields = fieldsOf;
export const liveEffectValue = liveValue;
const blank = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const fileValue = (path, v) => path === 'statuses' ? [...v].sort() : v;

/** Data for createEmbeddedDocuments('ActiveEffect') / Item creation, with Manager's id and baseline flag. */
export function effectCreateData(e) {
  const def = effectDefinition(e);
  return {...structuredClone(def), flags: {[MODULE_ID]: {[EFFECT_FLAG]: {effId: e.eff_id, baseline: JSON.stringify(def)}}}};
}
const flagOf = raw => raw?.flags?.[MODULE_ID]?.[EFFECT_FLAG] ?? null;
export const effectFlagOf = flagOf;
const baselineOf = raw => { try { return upgradeBaseline(JSON.parse(flagOf(raw)?.baseline ?? 'null')); } catch { return null; } };

/**
 * Plan an Item's effects against its live ActiveEffects (toObject() data or plain objects).
 * Returns {create: [data], update: [{_id, ...fields}], rows: [{effId, name, action, reason}], counts}.
 * action: create | update | kept (local edits / conflict / not in file / unchanged) | handmade (not Manager's; untouched).
 */
export function planItemEffects(defs = [], liveEffects = []) {
  const live = liveEffects.map(e => e?.toObject?.() ?? e);
  const rows = [], create = [], update = [];
  const ours = live.filter(e => flagOf(e)?.effId);
  for (const e of defs) {
    const matches = ours.filter(x => flagOf(x).effId === e.eff_id);
    if (!matches.length) { create.push(effectCreateData(e)); rows.push({effId: e.eff_id, name: e.name, action: 'create', reason: 'New effect.'}); continue; }
    if (matches.length > 1) { rows.push({effId: e.eff_id, name: e.name, action: 'kept', reason: `Two effects on this Item share ${e.eff_id}; nothing changed. Delete one in Foundry.`}); continue; }
    const raw = matches[0], def = effectDefinition(e), base = baselineOf(raw);
    if (!base) { rows.push({effId: e.eff_id, name: e.name, action: 'kept', reason: 'Its import record is unreadable; kept as it is.'}); continue; }
    const incoming = fieldsOf(def), old = fieldsOf(base);
    const patch = {}, local = [], conflict = [];
    for (const [path, value] of Object.entries(incoming)) {
      const cur = liveValue(raw, path), want = fileValue(path, value);
      if (!own(old, path)) { if (blank(cur) || same(cur, want)) { if (!same(cur, want)) patch[path] = value; } else local.push(path); continue; }
      const was = fileValue(path, old[path]);
      const fileChanged = !same(want, was), localChanged = !same(cur, was);
      if (fileChanged && localChanged && !same(cur, want)) conflict.push(path);
      else if (fileChanged && !same(cur, want)) patch[path] = value;
      else if (localChanged && !fileChanged) local.push(path);
    }
    if (conflict.length) { rows.push({effId: e.eff_id, name: e.name, action: 'kept', reason: `Edited in Foundry and changed in the file (${conflict.join(', ')}); kept as it is.`}); continue; }
    const baselineChanged = !same(base, def);
    if (Object.keys(patch).length || baselineChanged) {
      const entry = {_id: raw._id, ...patch, [`flags.${MODULE_ID}.${EFFECT_FLAG}.baseline`]: JSON.stringify(def)};
      if (Object.keys(patch).length) {
        update.push(entry);
        rows.push({effId: e.eff_id, name: e.name, action: 'update', reason: `${Object.keys(patch).join(', ')} from the file${local.length ? `; keeps your edits to ${local.join(', ')}` : ''}.`});
        continue;
      }
      // Only fields the GM already changed differ: record the new file values, change nothing visible.
      update.push(entry);
      rows.push({effId: e.eff_id, name: e.name, action: 'kept', reason: `Keeps your edits to ${local.join(', ') || 'this effect'}.`, quiet: true});
      continue;
    }
    rows.push({effId: e.eff_id, name: e.name, action: 'kept', reason: local.length ? `Keeps your edits to ${local.join(', ')}.` : 'Already matches the file.'});
  }
  const inFile = new Set(defs.map(e => e.eff_id));
  for (const raw of ours) if (!inFile.has(flagOf(raw).effId))
    rows.push({effId: flagOf(raw).effId, name: raw.name, action: 'kept', reason: 'Not in this file; kept (import never deletes effects).'});
  for (const raw of live) if (!flagOf(raw)?.effId) rows.push({effId: null, name: raw.name, action: 'handmade', reason: 'Made in Foundry; untouched.'});
  const counts = {create: create.length, update: rows.filter(r => r.action === 'update').length, kept: rows.filter(r => r.action === 'kept').length, handmade: rows.filter(r => r.action === 'handmade').length};
  return {create, update, rows, counts, writes: create.length + update.length};
}

/** One line for the preview, e.g. "Effects: 1 new, 1 updated, 2 kept, 1 made in Foundry (untouched)." */
export function effectSummary(plan) {
  if (!plan?.rows?.length) return '';
  const c = plan.counts, parts = [];
  if (c.create) parts.push(`${c.create} new`);
  if (c.update) parts.push(`${c.update} updated`);
  if (c.kept) parts.push(`${c.kept} kept`);
  if (c.handmade) parts.push(`${c.handmade} made in Foundry (untouched)`);
  return `Effects: ${parts.join(', ')}.`;
}

/** Writes an effect plan on a world Item. GM only, refused in this layer for anyone else. */
export async function applyItemEffects(item, plan, {user = globalThis.game?.user} = {}) {
  if (!user?.isGM) throw new Error('Only the GM can import Item effects.');
  if (!plan?.writes) return {created: 0, updated: 0};
  if (plan.create.length) await item.createEmbeddedDocuments('ActiveEffect', structuredClone(plan.create));
  if (plan.update.length) await item.updateEmbeddedDocuments('ActiveEffect', structuredClone(plan.update));
  return {created: plan.create.length, updated: plan.update.length};
}

/** Live effects of a Foundry Item (embedded collection) as plain data. */
export const liveEffects = item => asList(item?.effects).map(e => e?.toObject?.() ?? e);
