/** Read-only view models for the Actor's embedded Items (inventory, combat, spells, features). */
import {MODULE_ID, dnd5eConfig, labelOf, num} from './constants.mjs';

const bySortThenName = (a, b) => (num(a.sort) - num(b.sort)) || String(a.name).localeCompare(String(b.name));
/** dnd5e keeps activities in a Collection; tests may pass an array. */
export const activitiesOf = item => { const a = item.system?.activities; return a ? [...(a.values?.() ?? a)] : []; };

export function itemRow(item) {
  const s = item.system ?? {}, uses = s.uses ?? {};
  return {
    id: item.id, name: item.name, img: item.img, type: item.type, quantity: num(s.quantity, 1),
    equippable: 'equipped' in s, equipped: !!s.equipped,
    canAttune: s.attunement === 'required' || s.attunement === 'optional', attunement: s.attunement ?? '', attuned: !!s.attuned,
    uses: num(uses.max) > 0 ? {value: num(uses.value, num(uses.max) - num(uses.spent)), max: num(uses.max)} : null,
    usable: activitiesOf(item).length > 0, container: s.container ?? null
  };
}

export const INVENTORY_TYPES = [['weapon', 'Weapons'], ['equipment', 'Equipment'], ['consumable', 'Consumables'], ['tool', 'Tools'], ['container', 'Containers'], ['loot', 'Loot']];
export const isInventory = item => INVENTORY_TYPES.some(([t]) => t === item.type);

/** Items by category. Items inside a container are listed under it, not at the top level. */
export function inventoryData(actor) {
  const items = [...(actor.items ?? [])].filter(isInventory).sort(bySortThenName);
  const ids = new Set(items.map(i => i.id));
  const inside = id => items.filter(i => i.system?.container === id).map(itemRow);
  const groups = INVENTORY_TYPES.map(([type, label]) => ({type, label, items: items
    .filter(i => i.type === type && !(i.system?.container && ids.has(i.system.container)))
    .map(i => ({...itemRow(i), contents: i.type === 'container' ? inside(i.id) : []}))})).filter(g => g.items.length);
  return {groups, attunement: attunementData(actor), currency: currencyData(actor)};
}

/** dnd5e derives attunement.value from attuned items; max is the actor's setting (3 by default). */
export function attunementData(actor) {
  const a = actor.system?.attributes?.attunement ?? {};
  const counted = [...(actor.items ?? [])].filter(i => i.system?.attuned).length;
  return {value: num(a.value, counted), max: num(a.max, 3)};
}

export function currencyData(actor) {
  const cfg = dnd5eConfig().currencies ?? {}, cur = actor.system?.currency ?? {};
  const keys = Object.keys(cfg).length ? Object.keys(cfg) : ['pp', 'gp', 'ep', 'sp', 'cp'];
  return keys.filter(k => k in cur || cfg[k]).map(k => ({key: k, label: labelOf(cfg[k]) || k.toUpperCase(), abbr: cfg[k]?.abbreviation ?? k, value: num(cur[k])}));
}

// ---------- Combat ----------

const ACTIVATION_GROUPS = [['action', 'Actions'], ['bonus', 'Bonus Actions'], ['reaction', 'Reactions']];
/** Weapons (equipped first), then other usable items and features grouped by their first activity's activation. */
export function combatData(actor) {
  const items = [...(actor.items ?? [])].sort(bySortThenName);
  const weapons = items.filter(i => i.type === 'weapon').map(itemRow).sort((a, b) => Number(b.equipped) - Number(a.equipped));
  const usable = items.filter(i => i.type !== 'weapon' && i.type !== 'spell' && activitiesOf(i).length);
  const groupOf = i => activitiesOf(i)[0]?.activation?.type;
  const groups = ACTIVATION_GROUPS.map(([key, label]) => ({key, label, items: usable.filter(i => groupOf(i) === key).map(itemRow)}));
  groups.push({key: 'other', label: 'Other', items: usable.filter(i => !ACTIVATION_GROUPS.some(([k]) => k === groupOf(i))).map(itemRow)});
  return {weapons, groups: groups.filter(g => g.items.length)};
}

// ---------- Spells ----------

export function spellsData(actor) {
  const cfg = dnd5eConfig(), slots = actor.system?.spells ?? {};
  const spells = [...(actor.items ?? [])].filter(i => i.type === 'spell').sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const levels = new Map();
  for (const sp of spells) {
    const level = num(sp.system?.level);
    if (!levels.has(level)) levels.set(level, []);
    const prepared = num(sp.system?.prepared);
    levels.get(level).push({...itemRow(sp), level, prepared, always: prepared === 2, canPrepare: sp.system?.canPrepare === true && level > 0});
  }
  const slotOf = level => { const s = slots[`spell${level}`]; return s && num(s.max) > 0 ? {value: num(s.value), max: num(s.max)} : null; };
  const out = [...levels.keys()].sort((a, b) => a - b).map(level => ({level, label: labelOf(cfg.spellLevels?.[level]) || (level ? `Level ${level}` : 'Cantrips'), slots: level ? slotOf(level) : null, spells: levels.get(level)}));
  for (let level = 1; level <= 9; level++) if (!levels.has(level) && slotOf(level)) out.push({level, label: labelOf(cfg.spellLevels?.[level]) || `Level ${level}`, slots: slotOf(level), spells: []});
  out.sort((a, b) => a.level - b.level);
  const p = slots.pact;
  const pact = p && num(p.max) > 0 ? {level: num(p.level), value: num(p.value), max: num(p.max)} : null;
  return {levels: out, pact};
}

// ---------- Features ----------

export function featuresData(actor) {
  const cfg = dnd5eConfig().featureTypes ?? {};
  const items = [...(actor.items ?? [])].sort(bySortThenName);
  const identity = items.filter(i => ['class', 'subclass', 'background', 'race'].includes(i.type)).map(i => ({...itemRow(i), detail: i.type === 'class' ? `Level ${num(i.system?.levels)}` : i.type === 'race' ? 'Species' : i.type[0].toUpperCase() + i.type.slice(1)}));
  const groups = new Map();
  for (const f of items.filter(i => i.type === 'feat')) {
    const key = f.system?.type?.value || 'other';
    if (!groups.has(key)) groups.set(key, {key, label: labelOf(cfg[key]) || (key === 'other' ? 'Other Features' : key), items: []});
    groups.get(key).items.push(itemRow(f));
  }
  return {identity, groups: [...groups.values()]};
}

// ---------- Equipment paper doll (display only: dnd5e has no worn-slot rules) ----------

export const SLOTS = [
  {id: 'head', label: 'Head'}, {id: 'neck', label: 'Neck'}, {id: 'back', label: 'Back'}, {id: 'body', label: 'Body armor'},
  {id: 'mainhand', label: 'Main hand'}, {id: 'offhand', label: 'Off hand'}, {id: 'hands', label: 'Hands'}, {id: 'waist', label: 'Waist'},
  {id: 'feet', label: 'Feet'}, {id: 'ring1', label: 'Ring'}, {id: 'ring2', label: 'Ring'}, {id: 'trinket', label: 'Trinket'}
];
const SLOT_IDS = new Set(SLOTS.map(s => s.id));
export const WORN_SLOTS = new Set(['head', 'neck', 'back', 'hands', 'waist', 'feet', 'trinket']);
/** Name hints for worn items the system does not classify; the owner can always reassign. */
const NAME_HINTS = [['head', /\b(helm|helmet|hat|hood|circlet|crown|cap|diadem|headband)\b/i], ['neck', /\b(amulet|necklace|periapt|medallion|pendant|torc|scarab)\b/i],
  ['back', /\b(cloak|cape|mantle|wings)\b/i], ['hands', /\b(gloves|gauntlets?|bracers)\b/i], ['waist', /\b(belt|girdle|sash)\b/i], ['feet', /\b(boots|shoes|slippers|sandals)\b/i]];

export const slotFlag = item => { const s = item.flags?.[MODULE_ID]?.slot; return SLOT_IDS.has(s) ? s : null; };
/** Where an item would naturally sit: 'hand', 'ring', a slot id, or null (shown under "Other equipped"). */
export function naturalSlot(item) {
  if (item.type === 'weapon') return 'hand';
  if (item.type !== 'equipment') return null;
  const t = item.system?.type?.value;
  if (['light', 'medium', 'heavy', 'natural'].includes(t)) return 'body';
  if (t === 'shield') return 'offhand';
  if (t === 'ring') return 'ring';
  for (const [slot, re] of NAME_HINTS) if (re.test(item.name ?? '')) return slot;
  if (t === 'trinket') return 'trinket';
  return null;
}
const fits = (natural, slot) => natural === slot || (natural === 'hand' && (slot === 'mainhand' || slot === 'offhand')) || (natural === 'ring' && (slot === 'ring1' || slot === 'ring2'));

/** Equipped items placed into boxes: owner-assigned slot first, then the natural slot; anything left goes to "Other". */
export function equipmentLayout(actor) {
  const equipped = [...(actor.items ?? [])].filter(i => i.system?.equipped && ['weapon', 'equipment', 'tool'].includes(i.type)).sort(bySortThenName);
  const boxes = Object.fromEntries(SLOTS.map(s => [s.id, null])), other = [];
  const rest = [];
  for (const item of equipped) { const f = slotFlag(item); if (f && !boxes[f]) boxes[f] = item; else rest.push(item); }
  for (const item of rest) {
    const n = naturalSlot(item);
    const target = SLOTS.find(s => !boxes[s.id] && n && fits(n, s.id));
    if (target) boxes[target.id] = item; else other.push(item);
  }
  return {slots: SLOTS.map(s => ({...s, item: boxes[s.id] ? itemRow(boxes[s.id]) : null})), other: other.map(itemRow)};
}

/** Carried, unequipped items that could go in an empty box. Worn boxes also offer unclassified wearables. */
export function equipChoices(actor, slot) {
  return [...(actor.items ?? [])]
    .filter(i => ['weapon', 'equipment'].includes(i.type) && 'equipped' in (i.system ?? {}) && !i.system.equipped)
    .filter(i => { const n = naturalSlot(i); return fits(n, slot) || (WORN_SLOTS.has(slot) && n === null && i.type === 'equipment'); })
    .sort(bySortThenName).map(itemRow);
}
