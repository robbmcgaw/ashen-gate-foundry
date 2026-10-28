/**
 * Mount and pet items (docs/companion-items-schema.md). They are ordinary dnd5e Items on the character (equipment,
 * loot or feat), skinned by the Hub as mount gear, mount perks, pet clothing and pet perks. What an item is for comes
 * from, in order:
 *   1. flags['ashen-gate-character-hub'].companion.role ('mount-gear' | 'mount-perk' | 'pet-clothing' | 'pet-perk')
 *   2. its permanent id prefix (flags['ashen-gate-manager'].source.sourceId): ITEM-MOUNT-, PERK-MOUNT-, ITEM-PET-, PERK-PET-
 *   3. nothing (an unmarked item): a feature is a perk, anything else is gear (mount) or clothing (pet).
 * Stats are only read for display: the item's own Active Effect changes and (for armour) its armour value. The Hub
 * applies nothing and works out no numbers of its own.
 */
import {MODULE_ID, num} from './constants.mjs';
import {effectKeyLabel} from './effect-keys.mjs';

export const COMPANION_ROLES = {
  'mount-gear': {kind: 'mount', list: 'gear', label: 'Mount gear'},
  'mount-perk': {kind: 'mount', list: 'perk', label: 'Mount perk'},
  'pet-clothing': {kind: 'pet', list: 'clothing', label: 'Pet clothing'},
  'pet-perk': {kind: 'pet', list: 'perk', label: 'Pet perk'}
};
export const ID_PREFIXES = [['ITEM-MOUNT-', 'mount-gear'], ['PERK-MOUNT-', 'mount-perk'], ['ITEM-PET-', 'pet-clothing'], ['PERK-PET-', 'pet-perk']];

/**
 * Slot classification (0.48.0): flags['ashen-gate-character-hub'].companion.slot. 'saddle' | 'tack' for mount-gear,
 * 'head' | 'body' for pet-clothing. It only decides which sockets an item can go into; it carries no other mechanics.
 */
export const SLOT_VALUES = {'mount-gear': ['saddle', 'tack'], 'pet-clothing': ['head', 'body']};
export const SLOT_LABELS = {saddle: 'Saddle', tack: 'Tack', head: 'Head', body: 'Body'};

/** The item's permanent id, when it has one (Manager import). */
export const sourceIdOf = item => item?.flags?.['ashen-gate-manager']?.source?.sourceId ?? null;

/** 'mount-gear' | 'mount-perk' | 'pet-clothing' | 'pet-perk' | null. */
export function companionRole(item) {
  const flagged = item?.flags?.[MODULE_ID]?.companion?.role;
  if (COMPANION_ROLES[flagged]) return flagged;
  const id = String(sourceIdOf(item) ?? '');
  return ID_PREFIXES.find(([prefix]) => id.startsWith(prefix))?.[1] ?? null;
}

/**
 * The item's valid slot ('saddle' | 'tack' | 'head' | 'body') or null (unclassified). A slot only counts with its matching
 * role; a mismatched or unknown value is ignored, so the item stays unclassified.
 */
export function companionSlot(item) {
  const role = companionRole(item), v = item?.flags?.[MODULE_ID]?.companion?.slot;
  return role && typeof v === 'string' && SLOT_VALUES[role]?.includes(v) ? v : null;
}

/** Whether a gear item may go into a socket of this type ('saddle' | 'tack' | 'head' | 'body'). Unclassified items fit any. */
export function slotFit(item, socket) {
  const slot = companionSlot(item);
  if (!slot || slot === socket.type) return {ok: true};
  return {ok: false, error: `${item.name} is a ${SLOT_LABELS[slot]} item, so it can't go in a ${socket.label} socket. Try a ${SLOT_LABELS[slot]} socket.`};
}

/**
 * Where an item goes on a companion of `kind`: {ok, list: 'gear' | 'perk' | 'clothing'} or a refusal. `want` (a list)
 * asks for one place only (a clothing slot, the perk drop zone).
 */
export function routeForRole(item, kind, want = null) {
  const role = companionRole(item);
  let list;
  if (role) {
    const r = COMPANION_ROLES[role];
    if (r.kind !== kind) return {ok: false, error: `${item.name} is ${r.label.toLowerCase()}, not for a ${kind}.`};
    list = r.list;
  } else list = item?.type === 'feat' ? 'perk' : kind === 'mount' ? 'gear' : 'clothing';
  if (want && want !== list) {
    const what = {perk: 'a perk', gear: 'mount gear', clothing: 'pet clothing'}[want];
    return {ok: false, error: `${item.name} is not ${what}.`};
  }
  return {ok: true, list};
}

// ---------- Stats (display only) ----------

/** Readable names for common dnd5e Active Effect keys. Anything else shows its key. */
const KEY_LABELS = [
  [/^system\.attributes\.ac\.(bonus|flat|value|base)$/, 'AC'],
  [/^system\.attributes\.ac\.armor$/, 'Armor AC'],
  [/^system\.attributes\.movement\.bonus$/, 'Speed (all)'],
  [/^system\.attributes\.movement\.hover$/, 'Hover'],
  [/^system\.attributes\.hp\.(bonuses\.overall|bonuses\.level|tempmax|max)$/, 'Max HP'],
  [/^system\.abilities\.(\w+)\.value$/, m => abil(m[1])],
  [/^system\.attributes\.senses\.(ranges\.)?(\w+)$/, m => cap(m[2])],
  [/^system\.traits\.(dr|di|dv|ci)\.value$/, m => ({dr: 'Resistance', di: 'Immunity', dv: 'Vulnerability', ci: 'Condition immunity'})[m[1]]]
];
const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const abil = k => globalThis.CONFIG?.DND5E?.abilities?.[k]?.label ?? k.toUpperCase();
/** 0.62.2: effect-keys.mjs labels the keys that moved in dnd5e 6.0 (old and new shape alike); the table above covers the rest. */
export function keyLabel(key) {
  const known = effectKeyLabel(key); if (known) return known;
  for (const [re, label] of KEY_LABELS) { const m = String(key).match(re); if (m) return typeof label === 'function' ? label(m) : label; }
  return humanKey(key);
}
/** 0.58.2: a key with no label is never shown raw (system.rolls.attack.mod.bonus): its words, without the data path ("Rolls attack"). */
const NOISE = new Set(['system', 'bonus', 'bonuses', 'mod', 'value', 'flags', 'data']);
function humanKey(key) {
  const words = String(key).split('.').filter(w => w && !NOISE.has(w)).map(w => w.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase());
  const text = words.join(' ').trim();
  if (/^rolls (attack|damage|save|check)/.test(text)) return `${cap(text.split(' ')[1])} rolls`;
  return text ? cap(text) : 'Bonus';
}
/** Foundry's change modes: 0 custom, 1 multiply, 2 add, 3 downgrade, 4 upgrade, 5 override. */
export function changeText(mode, value) {
  const v = String(value ?? '').trim(), n = Number(v), signed = Number.isFinite(n) && v !== '' ? (n >= 0 ? `+${n}` : `−${Math.abs(n)}`) : v;
  switch (Number(mode)) {
    case 1: return `×${v}`;
    case 2: return signed;
    case 3: return `at most ${v}`;
    case 4: return `at least ${v}`;
    case 5: return `= ${v}`;
    default: return v;
  }
}
const effectsOf = item => { const e = item?.effects; return e ? [...(e.values?.() ?? e)] : []; };

/**
 * What a companion's gear and perks give, from their own data: one line per change, grouped by what it changes.
 * Returns {lines: [{label, parts: [{text, source}], total}], warnings: [string]}. `total` is the sum when every part is
 * a plain number added (else null). Disabled effects are skipped. An effect with transfer on would also apply to the
 * character carrying the item, so it is reported as a warning (the Hub changes nothing).
 */
export function companionStats(items, {owner = null} = {}) {
  const groups = new Map(), warnings = [];
  const add = (label, text, source, n = null) => {
    if (!groups.has(label)) groups.set(label, {label, parts: [], nums: []});
    const g = groups.get(label); g.parts.push({text, source}); g.nums.push(n);
  };
  for (const item of items) {
    const s = item?.system ?? {};
    if (item?.type === 'equipment' && num(s.armor?.value) > 0) add('Armor AC', String(num(s.armor.value)), item.name);
    for (const effect of effectsOf(item)) {
      if (effect.disabled) continue;
      if (effect.transfer === true && owner) warnings.push(`${item.name}: "${effect.name}" also applies to ${owner.name} while the item is on the character (turn off "Apply effect to actor" on the effect if it is only for the companion).`);
      for (const c of effect.changes ?? []) {
        if (!c?.key) continue;
        const n = Number(c.value);
        add(keyLabel(c.key), changeText(c.mode, c.value), item.name, Number(c.mode) === 2 && Number.isFinite(n) && String(c.value).trim() !== '' ? n : null);
      }
    }
  }
  const lines = [...groups.values()].map(g => ({label: g.label, parts: g.parts, total: g.nums.length > 1 && g.nums.every(n => n !== null) ? g.nums.reduce((a, b) => a + b, 0) : null}));
  return {lines, warnings};
}
/** One line of text per item, e.g. "AC +1; Walk speed +10", for a card row. */
export function itemGives(item) {
  return companionStats([item]).lines.map(l => `${l.label} ${l.parts.map(p => p.text).join(', ')}`).join('; ');
}
