/** Ashen Gate Locations: pure data model. No Foundry globals, so everything here is unit-tested. */
export const MODULE_ID = 'ashen-gate-locations';
export const IMPORT_SCHEMA = 'ag-foundry-import/0.2';
export const THREATS = Object.freeze([
  {value: 'settled', label: 'Settled'},
  {value: 'light', label: 'Light'},
  {value: 'normal', label: 'Normal'},
  {value: 'hot', label: 'Hot'},
  {value: 'deadly', label: 'Deadly'}
]);
/** Single-value fields with their own player-visibility toggle. Name is always shown once revealed. */
export const FIELDS = Object.freeze(['type', 'region', 'description', 'img', 'threat']);
/** List sections; each has a section toggle and a per-entry toggle. */
export const SECTIONS = Object.freeze([
  {key: 'conditions', label: 'Conditions'},
  {key: 'resources', label: 'Gathering Resources'},
  {key: 'factions', label: 'Factions'},
  {key: 'quests', label: 'Quests'},
  {key: 'related', label: 'Related Locations'},
  {key: 'loot', label: 'Loot & Rewards'},
  {key: 'notes', label: 'Notes'}
]);
/**
 * Every card block in its default order. Built-in keys are permanent; a custom block ("+ Add Detail")
 * is `detail:<its local key>`. `children` and `scenes` are derived from nesting, `scenes` is GM-only.
 * A location's `layout` is just this list in the GM's order.
 */
export const BLOCKS = Object.freeze([
  {key: 'description', label: 'Description'},
  {key: 'conditions', label: 'Conditions'},
  {key: 'children', label: 'Places Inside'},
  {key: 'resources', label: 'Gathering Resources'},
  {key: 'factions', label: 'Factions'},
  {key: 'quests', label: 'Quests'},
  {key: 'related', label: 'Related Locations'},
  {key: 'loot', label: 'Loot & Rewards'},
  {key: 'notes', label: 'Notes'},
  {key: 'scenes', label: 'Linked Scenes'}
]);
export const DETAIL_PREFIX = 'detail:';
export const LOOT_STATUSES = Object.freeze(['available', 'discovered', 'taken']);
export const LOOT_STATUS_LABELS = Object.freeze({available: 'Available', discovered: 'Discovered', taken: 'Taken'});
/** Gathering nodes (Session 1 runbook §3): skill, tier 1–5, DC defaulting by tier. Rules live in the Ledger. */
export const GATHERING = Object.freeze({
  skills: Object.freeze(['Herbalism', 'Mining', 'Fishing', 'Skinning & Harvesting', 'Archaeology']),
  dcByTier: Object.freeze({1: 10, 2: 12, 3: 13, 4: 14, 5: 15})
});
export const LOCATION_ID = /^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const QUEST_ID = /^(?:QUEST|ORDER|CONTRACT)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
/**
 * Marker states. Hidden: players get nothing. Unidentified: players get a generic label and an
 * optional teaser only. Revealed: the published card. 1.2.x `revealed: true/false` reads as revealed/hidden.
 */
export const STATES = Object.freeze(['hidden', 'unidentified', 'revealed']);
export const STATE_LABELS = Object.freeze({hidden: 'Hidden', unidentified: 'Unidentified', revealed: 'Revealed'});
export const DEFAULT_UNIDENTIFIED_LABEL = 'Unknown location';
/** Built-in Foundry icons until the GM sets pin art. */
export const PIN_DEFAULTS = Object.freeze({img: 'icons/svg/castle.svg', unidentifiedImg: 'icons/svg/mystery-man.svg', size: 48});
/** Opaque binding between a Location and its Map Notes / player pages. Random, never derived from the name. */
export const PIN_KEY = /^[a-z0-9]{12,32}$/;
export const NOTE_DOC_TYPES = Object.freeze(['Actor', 'Item', 'JournalEntry', 'JournalEntryPage', 'RollTable']);
export const FACTION_DOC_TYPES = Object.freeze(['Actor', 'JournalEntry']);

export const clone = value => structuredClone(value);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const text = (value, max = 20000) => String(value ?? '').slice(0, max);
const line = (value, max = 200) => text(value, max).replace(/[\r\n]+/g, ' ').trim();
const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
const int = (value, fallback, min, max) => {
  const n = Number(value);
  return value !== '' && value !== null && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const matId = value => /^MAT-[A-Z0-9-]+$/.test(value ?? '') ? value : '';
/** Foundry stores relative file paths; reject script/data schemes and markup characters. */
export const safePath = value => {
  const s = line(value, 500);
  return s && !/^(?:javascript|data|vbscript|file):/i.test(s) && !/[<>"'`]/.test(s) ? s : '';
};
const safeUuid = value => {
  const s = line(value, 300);
  return /^[A-Za-z0-9._-]+$/.test(s) ? s : '';
};
export const GROUP_MODES = Object.freeze([{value: 'region', label: 'Region'}, {value: 'threat', label: 'Threat level'}, {value: 'profession', label: 'Gathering profession'}]);
/**
 * The GM list as groups: by region, threat level (safest first) or gathering profession (a location appears under each
 * profession it has a node for). Rows sort by name inside a group. Returns [{key, label, rows}].
 */
export function groupLocations(rows, mode = 'region') {
  const groups = new Map();
  const put = (key, label, row) => { if (!groups.has(key)) groups.set(key, {key, label, rows: []}); groups.get(key).rows.push(row); };
  for (const l of rows) {
    if (mode === 'threat') put(l.threat || 'normal', threatLabel(l.threat), l);
    else if (mode === 'profession') {
      const skills = [...new Set((l.resources ?? []).map(r => String(r.skill ?? '').trim()).filter(Boolean))];
      if (skills.length) for (const k of skills) put(k, k, l); else put('', 'No gathering', l);
    } else put(l.region || '', l.region || 'No region', l);
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  const order = THREATS.map(t => t.value);
  const list = [...groups.values()].map(g => ({...g, rows: g.rows.sort(byName)}));
  return list.sort(mode === 'threat' ? (a, b) => order.indexOf(a.key) - order.indexOf(b.key)
    : (a, b) => (a.key === '') - (b.key === '') || a.label.localeCompare(b.label));
}
export const threatLabel = value => THREATS.find(t => t.value === value)?.label ?? 'Normal';
export const newKey = () => Math.random().toString(36).slice(2, 10);
export const newPinKey = () => [...globalThis.crypto.getRandomValues(new Uint8Array(16))].map(b => (b % 36).toString(36)).join('');

/** LOC-* id from a name, unique among existing ids. Generated once; renaming never changes it. */
export function makeLocationId(name, existingIds = []) {
  const taken = new Set(existingIds);
  const slug = String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'LOCATION';
  const base = `LOC-${slug}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

function entry(raw, extra) {
  const e = raw && typeof raw === 'object' ? raw : {};
  return {key: line(e.key ?? e.id, 40) || newKey(), visible: bool(e.visible, true), ...extra(e)};
}
const linked = e => ({uuid: safeUuid(e.uuid), docType: line(e.docType, 40)});
const ENTRY_SHAPES = {
  // A gathering node. 1.0.x entries (label/materialId/available only) get tier 1, DC 10, finite.
  resources: e => {
    const tier = int(e.tier, 1, 1, 5), finite = bool(e.finite, true);
    return {label: line(e.label), skill: line(e.skill, 80), tier, dc: int(e.dc, GATHERING.dcByTier[tier], 1, 40), dcVisible: bool(e.dcVisible, false),
      materialId: matId(e.materialId), quantity: int(e.quantity, 1, 1, 999),
      rareMaterialId: matId(e.rareMaterialId), rareQuantity: int(e.rareQuantity, 1, 1, 999),
      finite, exhausted: finite && bool(e.exhausted, false), available: bool(e.available, true),
      uuid: safeUuid(e.uuid), note: line(e.note, 500)};
  },
  conditions: e => ({label: line(e.label), text: text(e.text, 2000)}),
  factions: e => ({label: line(e.label), ...linked(e), note: line(e.note, 500)}),
  quests: e => ({questId: QUEST_ID.test(e.questId ?? '') ? e.questId : ''}),
  related: e => ({locationId: LOCATION_ID.test(e.locationId ?? '') ? e.locationId : ''}),
  // A loot entry is a plain-text reward (no uuid) or a link to a native Item. `label`, `text` and `img` are what
  // players see; nothing is ever read from the linked document into the view. A link creates no Actor item.
  loot: e => ({label: line(e.label), text: text(e.text, 2000), img: safePath(e.img), ...linked(e),
    status: LOOT_STATUSES.includes(e.status) ? e.status : 'available'}),
  notes: e => ({title: line(e.title), text: text(e.text), ...linked(e)})
};
const DETAIL_SHAPE = e => ({title: line(e.title), text: text(e.text), ...linked(e)});
const KEEP_ENTRY = {
  conditions: e => e.label || e.text,
  loot: e => e.label || e.text || e.uuid,
  resources: e => e.label || e.materialId || e.rareMaterialId || e.uuid,
  factions: e => e.label || e.uuid,
  quests: e => e.questId,
  related: e => e.locationId,
  notes: e => e.title || e.text || e.uuid
};

/**
 * The GM's block order: known keys only, each once, in the order given; anything missing is appended in
 * default order (custom blocks last, in the order they were added). Order metadata only.
 */
export function normalizeLayout(raw, details = []) {
  const valid = [...BLOCKS.map(b => b.key), ...details.map(d => DETAIL_PREFIX + d.key)];
  const known = new Set(valid), out = [];
  for (const k of Array.isArray(raw) ? raw : []) if (known.has(k) && !out.includes(k)) out.push(k);
  return [...out, ...valid.filter(k => !out.includes(k))];
}
/**
 * Moves one item of an ordered list and returns a new list (the input is untouched). `by` shifts it up (-1)
 * or down (+1); `before`/`after` drop it next to another item. Unknown keys and no-ops return the list as it was.
 */
export function reorder(list, keyOf, key, {by = 0, before = null, after = null} = {}) {
  const from = list.findIndex(x => keyOf(x) === key);
  if (from < 0) return list;
  const next = list.slice(), [item] = next.splice(from, 1);
  let to;
  if (before != null || after != null) {
    const at = next.findIndex(x => keyOf(x) === (before ?? after));
    if (at < 0) return list;
    to = before != null ? at : at + 1;
  } else to = Math.max(0, Math.min(next.length, from + by));
  next.splice(to, 0, item);
  return next.every((x, i) => x === list[i]) ? list : next;
}

/** The authored content of a location: everything a Publish copies. GM-only bindings and play state live outside it. */
function normalizeBody(r, id) {
  const body = {
    name: line(r.name) || 'New Location',
    type: line(r.type), region: line(r.region), description: text(r.description),
    img: safePath(r.img),
    threat: THREATS.some(t => t.value === r.threat) ? r.threat : 'normal',
    show: {}, sections: {}
  };
  for (const f of FIELDS) body.show[f] = bool(r.show?.[f], true);
  for (const {key} of SECTIONS) {
    body.sections[key] = bool(r.sections?.[key], false);
    const list = Array.isArray(r[key]) ? r[key] : [];
    body[key] = list.map(e => entry(e, ENTRY_SHAPES[key])).filter(KEEP_ENTRY[key]);
  }
  body.related = body.related.filter(e => e.locationId !== id);
  // Location-local custom blocks. `visible` is the block's own reveal toggle.
  body.details = (Array.isArray(r.details) ? r.details : []).map(e => entry(e, DETAIL_SHAPE)).filter(e => e.title || e.text || e.uuid);
  body.details = body.details.filter((e, i, all) => all.findIndex(x => x.key === e.key) === i);
  body.layout = normalizeLayout(r.layout, body.details);
  body.isRegion = bool(r.isRegion, false);
  // A child's changes to a conditions it inherits: {from: Region LOC id, conditionKey, disabled, label?, text?}.
  body.conditionOverrides = (Array.isArray(r.conditionOverrides) ? r.conditionOverrides : []).map(e => entry(e, o => ({
    from: LOCATION_ID.test(o.from ?? '') ? o.from : '', conditionKey: line(o.conditionKey, 40), disabled: bool(o.disabled, false),
    label: line(o.label), text: text(o.text, 2000)}))).filter(o => o.from && o.conditionKey && (o.disabled || o.label || o.text));
  body.parentLocationId = LOCATION_ID.test(r.parentLocationId ?? '') && r.parentLocationId !== id ? r.parentLocationId : '';
  body.unidentifiedLabel = line(r.unidentifiedLabel, 80);
  body.teaser = text(r.teaser, 2000);
  // size 0 = the default (PIN_DEFAULTS.size).
  body.pin = {img: safePath(r.pin?.img), unidentifiedImg: safePath(r.pin?.unidentifiedImg), size: int(r.pin?.size, 0, 16, 256)};
  return body;
}
const BODY_KEYS = Object.keys(normalizeBody({}, ''));
/** The part of a location that Publish copies for players. */
export const publishable = loc => clone(Object.fromEntries(BODY_KEYS.map(k => [k, loc[k]])));

/**
 * Fills defaults and drops anything malformed. Unknown keys are discarded. Re-runnable.
 * `state` is what players currently see; `published` is the content they see (Save never touches either).
 * Records without `state` (1.2.x and older imports) read `revealed`; a revealed one publishes its current content.
 */
export function normalizeLocation(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const id = LOCATION_ID.test(r.id ?? '') ? r.id : '';
  const loc = {id, pinKey: PIN_KEY.test(r.pinKey ?? '') ? r.pinKey : newPinKey(), ...normalizeBody(r, id)};
  loc.sceneUuids = [...new Set((Array.isArray(r.sceneUuids) ? r.sceneUuids : []).map(safeUuid).filter(Boolean))].slice(0, 20);
  loc.state = STATES.includes(r.state) ? r.state : r.revealed === true ? 'revealed' : 'hidden';
  loc.revealed = loc.state === 'revealed';
  loc.published = r.published && typeof r.published === 'object' ? normalizeBody(r.published, id)
    : r.published === undefined && loc.state !== 'hidden' ? publishable(loc) : null;
  return loc;
}

/** True when a visible location has saved edits players do not see yet. */
export function hasUnpublishedChanges(raw) {
  const loc = normalizeLocation(raw);
  return loc.state !== 'hidden' && JSON.stringify(publishable(loc)) !== JSON.stringify(loc.published);
}

/** Would giving `id` this parent create a loop? parentOf: Map(id -> parentLocationId). */
export function wouldCycle(id, parentId, parentOf) {
  const seen = new Set();
  for (let p = parentId; p; p = parentOf.get(p)) {
    if (p === id) return true;
    if (seen.has(p)) return false;
    seen.add(p);
  }
  return false;
}
export const parentMap = list => new Map(list.map(l => [l.id, l.parentLocationId ?? '']));

/** Gives any location whose pinKey is already taken a fresh one (first one keeps it). */
export function uniquePinKeys(list) {
  const seen = new Set();
  for (const loc of list) {
    while (seen.has(loc.pinKey)) loc.pinKey = newPinKey();
    seen.add(loc.pinKey);
  }
  return list;
}

/** A fresh gathering node with every default filled in (the editor's "add" path). */
export const newNode = (data = {}) => ({key: newKey(), visible: true, ...ENTRY_SHAPES.resources(data)});

export function newLocation(name, existingIds) {
  const loc = normalizeLocation({name});
  loc.id = makeLocationId(loc.name, existingIds);
  return loc;
}

/**
 * Conditions in effect at a location: those it inherits from Region ancestors, then its own. Only locations
 * marked `isRegion` pass conditions down, through any number of non-Region places in between; nothing else
 * (resources, factions, quests, loot, state, visibility) is inherited. A child's `conditionOverrides` can turn an
 * inherited condition off or replace its label/text; the Region is never edited.
 * GM (default): saved content, every condition, each with its source. `player: true`: only what the published
 * content allows (Region not hidden, shown section, visible entry); disabled ones are dropped and no source is named.
 */
export function effectiveConditions(raw, all = [], {player = false} = {}) {
  const loc = normalizeLocation(raw);
  const body = player ? loc.published : loc;
  if (!body) return [];
  const byId = new Map(all.map(normalizeLocation).filter(l => l.id).map(l => [l.id, l]));
  const overrides = new Map(body.conditionOverrides.map(o => [`${o.from}\n${o.conditionKey}`, o]));
  const chain = [], seen = new Set([loc.id]);
  for (let id = body.parentLocationId; id && !seen.has(id);) {
    seen.add(id);
    const a = byId.get(id);
    if (!a) break;
    chain.unshift(a);
    id = (player ? a.published : a)?.parentLocationId ?? a.parentLocationId;
  }
  const out = [];
  for (const a of chain) {
    const src = player ? (a.state !== 'hidden' ? a.published : null) : a;
    if (!src?.isRegion || (player && !src.sections.conditions)) continue;
    for (const c of src.conditions) {
      if (player && !c.visible) continue;
      const o = overrides.get(`${a.id}\n${c.key}`);
      if (player && o?.disabled) continue;
      out.push({key: c.key, label: o?.label || c.label, text: o?.text || c.text, original: {label: c.label, text: c.text}, visible: c.visible, inherited: true,
        source: {id: a.id, name: a.name}, disabled: !!o?.disabled, overridden: !!(o && (o.label || o.text))});
    }
  }
  for (const c of body.conditions) if (!player || c.visible) out.push({key: c.key, label: c.label, text: c.text, visible: c.visible, inherited: false, source: null, disabled: false, overridden: false});
  return out;
}

/**
 * The only data players ever receive, built from the published content only (Save is private).
 * Hidden: null. Unidentified: {key, state, name: the generic label, teaser?} and nothing else, so no
 * LOC id, true name, children or flags. Revealed: hidden fields, sections and entries are omitted (not
 * blanked); related links only point at other revealed locations; children/parent show revealed
 * ones by name and unidentified ones by their label. Quests carry ids only; Quest Manager decides
 * what a player sees. `label` is the world fallback for the unidentified label.
 */
export function playerView(raw, all = [], {label = ''} = {}) {
  const loc = normalizeLocation(raw);
  const pub = loc.published;
  if (!loc.id || loc.state === 'hidden' || !pub) return null;
  const fallback = line(label, 80) || DEFAULT_UNIDENTIFIED_LABEL;
  if (loc.state === 'unidentified') {
    const view = {key: loc.pinKey, state: 'unidentified', name: pub.unidentifiedLabel || fallback};
    if (pub.teaser) view.teaser = pub.teaser;
    return view;
  }
  const view = {id: loc.id, key: loc.pinKey, state: 'revealed', name: pub.name};
  for (const f of FIELDS) if (pub.show[f] && pub[f]) view[f] = pub[f];
  const on = key => pub.sections[key] ? pub[key].filter(e => e.visible) : [];
  const resources = on('resources').map(nodeForPlayer);
  const factions = on('factions').map(e => ({label: e.label, uuid: e.uuid, docType: e.docType, note: e.note}));
  const quests = on('quests').map(e => e.questId);
  const shown = new Map(all.map(normalizeLocation).filter(l => l.id && l.state !== 'hidden' && l.published).map(l => [l.id, l]));
  const ref = l => l.state === 'revealed' ? {id: l.id, key: l.pinKey, name: l.published.name} : {key: l.pinKey, name: l.published.unidentifiedLabel || fallback};
  const related = on('related').map(e => shown.get(e.locationId)).filter(l => l?.state === 'revealed').map(l => ({id: l.id, name: l.published.name}));
  const notes = on('notes').map(e => ({title: e.title, text: e.text, uuid: e.uuid, docType: e.docType}));
  // Only what the GM wrote for players. Nothing is read from the linked document, and the status is the GM's.
  const loot = on('loot').map(e => ({label: e.label, text: e.text, img: e.img, uuid: e.uuid, docType: e.docType, status: e.status}));
  const details = pub.details.filter(d => d.visible).map(d => ({key: d.key, title: d.title, text: d.text, uuid: d.uuid, docType: d.docType}));
  const conditions = pub.sections.conditions ? effectiveConditions(loc, all, {player: true}).map(c => ({label: c.label, text: c.text})) : [];
  const parent = shown.get(pub.parentLocationId);
  if (parent) view.parent = ref(parent);
  const children = [...shown.values()].filter(l => l.published.parentLocationId === loc.id).map(ref).sort((a, b) => a.name.localeCompare(b.name));
  for (const [key, list] of Object.entries({conditions, resources, factions, quests, related, loot, notes, details, children})) if (list.length) view[key] = list;
  // Block order as the GM published it, listing only blocks the player actually has (so no empty or unrevealed titles).
  const present = new Set(Object.keys(view).filter(k => k !== 'details'));
  for (const d of details) present.add(DETAIL_PREFIX + d.key);
  if (view.description) present.add('description');
  view.layout = pub.layout.filter(k => present.has(k));
  return view;
}

/** What the GM's preview shows: the player view this draft would give after Publish in `state`. */
export function previewView(draft, all = [], state, opts) {
  const loc = normalizeLocation(draft);
  const next = {...loc, state: state ?? loc.state, published: publishable(loc)};
  return playerView(next, all.filter(l => l.id !== loc.id).concat(next), opts);
}

/**
 * Map Note presentation for a location's state. Hidden and unidentified pins use the unidentified
 * image, so a pin's art never gives the place away. Revealed/unidentified use the published content.
 */
export function pinPresentation(raw, {label = '', unknownImg = ''} = {}) {
  const loc = normalizeLocation(raw);
  const src = loc.state !== 'hidden' && loc.published ? loc.published : loc;
  const size = src.pin.size || PIN_DEFAULTS.size;
  if (loc.state === 'revealed') return {text: src.name, src: src.pin.img || PIN_DEFAULTS.img, size};
  const unknown = src.pin.unidentifiedImg || safePath(unknownImg) || PIN_DEFAULTS.unidentifiedImg;
  return {text: loc.state === 'unidentified' ? src.unidentifiedLabel || line(label, 80) || DEFAULT_UNIDENTIFIED_LABEL : '', src: unknown, size};
}

/**
 * The update a module-managed Note needs, or null. `flags.<module>.pin` remembers the image and size
 * the module last wrote; if the Note's differ, the GM changed them in Foundry's Note config and they
 * are left alone (a per-placement override). Notes from 1.2.x count as managed while they still have
 * the old default castle icon and size 48. The label is always managed: it is what could leak a name.
 */
export function notePatch(note, pinKey, pres) {
  const ours = note.flags?.[MODULE_ID] ?? {};
  const last = ours.pin;
  const src = note.texture?.src ?? '';
  const ownSrc = last ? src === last.src : !src || src === PIN_DEFAULTS.img;
  const ownSize = last ? note.iconSize === last.size : note.iconSize == null || note.iconSize === PIN_DEFAULTS.size;
  const pin = {src: ownSrc ? pres.src : last?.src ?? '', size: ownSize ? pres.size : last?.size ?? 0};
  const patch = {};
  if (note.text !== pres.text) patch.text = pres.text;
  if (ownSrc && src !== pres.src) patch.texture = {src: pres.src};
  if (ownSize && note.iconSize !== pres.size) patch.iconSize = pres.size;
  if (ours.pinKey !== pinKey || last?.src !== pin.src || last?.size !== pin.size || ours.locationId != null)
    patch.flags = {[MODULE_ID]: {pinKey, pin, ...(ours.locationId != null ? {locationId: null} : {})}};
  return Object.keys(patch).length ? patch : null;
}

/** Node fields in a fixed order. The player copy drops the GM toggles, and the DC unless shown. */
export function nodeForGM(e) {
  const {key, label, skill, tier, dc, dcVisible, materialId, quantity, rareMaterialId, rareQuantity, finite, exhausted, available, visible, uuid, note} = e;
  return {id: key, label, skill, tier, dc, materialId, quantity, rareMaterialId, rareQuantity, finite, exhausted, available, note, uuid, visible, dcVisible};
}
export function nodeForPlayer(e) {
  const {visible, dcVisible, dc, ...rest} = nodeForGM(e);
  return dcVisible ? {...rest, dc} : rest;
}
export const nodeName = n => n.label || n.materialId || n.rareMaterialId || 'Resource';

/** Plain HTML for the player-view Journal page: readable even if the module is later disabled. */
export function viewHtml(view) {
  if (!view) return '';
  const p = s => esc(s).replace(/\r?\n/g, '<br>');
  const parts = [`<h1>${esc(view.name)}</h1>`];
  if (view.state === 'unidentified') return [...parts, view.teaser ? `<p>${p(view.teaser)}</p>` : ''].filter(Boolean).join('\n');
  if (view.parent) parts.push(`<p>Part of ${esc(view.parent.name)}</p>`);
  const meta = [view.type, view.region, view.threat && `Threat: ${threatLabel(view.threat)}`].filter(Boolean);
  if (meta.length) parts.push(`<p><em>${meta.map(esc).join(' · ')}</em></p>`);
  if (view.img) parts.push(`<p><img src="${esc(view.img)}" alt="${esc(view.name)}"></p>`);
  if (view.description) parts.push(`<p>${p(view.description)}</p>`);
  const list = (title, items) => items?.length ? `<h2>${title}</h2><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '';
  const blocks = {
    description: view.description ? `<p>${p(view.description)}</p>` : '',
    conditions: list('Conditions', view.conditions?.map(c => [`<strong>${esc(c.label)}</strong>`, c.text && esc(c.text)].filter(Boolean).join(': '))),
    resources: list('Gathering Resources', view.resources?.map(r => [esc(nodeName(r)), r.skill && esc(`${r.skill} T${r.tier}`), r.dc && `DC ${r.dc}`,
      r.exhausted ? '(exhausted)' : !r.available && '(unavailable)'].filter(Boolean).join(' · '))),
    factions: list('Factions', view.factions?.map(f => esc(f.label))),
    children: list('Places Here', view.children?.map(c => esc(c.name))),
    related: list('Related Locations', view.related?.map(r => esc(r.name))),
    // Plain text only: a Journal page never links a document, so it can't open one the reader may not see.
    loot: list('Loot & Rewards', view.loot?.map(l => [esc(l.label), l.text && esc(l.text), `(${LOOT_STATUS_LABELS[l.status] ?? 'Available'})`].filter(Boolean).join(' · '))),
    notes: (view.notes ?? []).map(n => `<h2>${esc(n.title || 'Note')}</h2>${n.text ? `<p>${p(n.text)}</p>` : ''}`).join('\n')
  };
  for (const d of view.details ?? []) blocks[DETAIL_PREFIX + d.key] = `<h2>${esc(d.title || 'Detail')}</h2>${d.text ? `<p>${p(d.text)}</p>` : ''}`;
  for (const k of view.layout ?? normalizeLayout([], view.details ?? [])) if (blocks[k]) parts.push(blocks[k]);
  return parts.join('\n');
}

/** Gathering nodes at a location, as the given audience may see them (a player passes a playerView). */
export function resourcesOf(locOrView, {gm = false} = {}) {
  if (!locOrView) return [];
  if (!gm) return clone(locOrView.resources ?? []);
  return normalizeLocation(locOrView).resources.map(nodeForGM);
}
/** Which of a node's bundles a material is: 'common', 'rare', 'both' or null. */
export function nodeMatch(node, materialId) {
  const common = node.materialId === materialId, rare = node.rareMaterialId === materialId;
  return common && rare ? 'both' : common ? 'common' : rare ? 'rare' : null;
}

/** Location records travel inside a Manager-style ag-foundry-import/0.2 package. */
export function exportPackage(locations, {packageId = 'AG-LOCATIONS-EXPORT', version = '1.0.0'} = {}) {
  return {
    manifest: {schema_version: IMPORT_SCHEMA, package_id: packageId, version},
    records: locations.map(raw => {
      const loc = normalizeLocation(raw);
      return {id: loc.id, entity_type: 'Location', status: 'draft', version: '1.0.0',
        provenance: {sources: ['ashen-gate-locations export']}, visibility: loc.revealed ? 'player' : 'reveal_gated',
        refs: [], name: loc.name, location: loc};
    })
  };
}

/**
 * Reads Location records from an ag-foundry-import/0.2 package. Other entity types are skipped.
 * Records already in the world are left untouched (user edits win); new ones are returned for creation.
 * `existing` is the world's locations (or just their ids); a parent link that would make a loop is an error.
 */
export function parseImport(pkg, existing = []) {
  if (!pkg || typeof pkg !== 'object' || !Array.isArray(pkg.records)) throw new Error('Not an import package: expected { manifest, records: [...] }.');
  if (pkg.manifest?.schema_version !== IMPORT_SCHEMA) throw new Error(`Unsupported schema_version "${pkg.manifest?.schema_version}"; expected ${IMPORT_SCHEMA}.`);
  const known = existing.map(e => typeof e === 'string' ? {id: e} : e);
  const taken = new Set(known.map(l => l.id));
  const parents = parentMap(known);
  const created = [], skipped = [], errors = [];
  for (const [i, rec] of pkg.records.entries()) {
    if (rec?.entity_type !== 'Location') continue;
    const body = {...(rec.location ?? {}), id: rec.id, name: rec.location?.name ?? rec.name};
    if (!LOCATION_ID.test(body.id ?? '')) { errors.push(`records[${i}]: id must look like LOC-NAME.`); continue; }
    if (taken.has(body.id)) { skipped.push(body.id); continue; }
    const loc = normalizeLocation(body);
    if (wouldCycle(loc.id, loc.parentLocationId, parents)) { errors.push(`records[${i}]: parentLocationId ${loc.parentLocationId} would put ${loc.id} inside itself.`); continue; }
    taken.add(loc.id);
    parents.set(loc.id, loc.parentLocationId);
    created.push(loc);
  }
  return {created, skipped, errors};
}

/** Fields added in 1.3.0 and 1.4.0. An update that leaves one out keeps the world's value instead of clearing it. */
const ADDITIVE = ['parentLocationId', 'unidentifiedLabel', 'teaser', 'pin', 'sceneUuids', 'layout', 'details', 'isRegion', 'conditionOverrides', 'conditions', 'loot'];

/**
 * Imports Location records (Manager's import run, or the package path above) into `existing`.
 * mode 'skip' (default) leaves any existing id untouched; 'update' replaces its definition but
 * keeps the GM's play state: its marker state and what players currently see (the published
 * content, until the GM publishes again), its pin binding, and which finite nodes are exhausted.
 * Map Notes are never touched by an import, so per-pin overrides survive.
 * Returns {created, updated, skipped: [{id, reason}]} with ready-to-save locations in `created`/`updated`.
 */
export function importRecords(records, existing = [], {mode = 'skip'} = {}) {
  if (!['skip', 'update'].includes(mode)) throw new Error(`Unknown import mode "${mode}"; use "skip" or "update".`);
  if (!Array.isArray(records)) throw new Error('Expected an array of Location records.');
  const current = new Map(existing.map(l => [l.id, normalizeLocation(l)]));
  const parents = parentMap([...current.values()]);
  const seen = new Set();
  const created = [], updated = [], skipped = [];
  for (const [i, rec] of records.entries()) {
    const id = rec?.id ?? `records[${i}]`;
    if (rec?.entity_type !== 'Location') { skipped.push({id, reason: 'Not a Location record.'}); continue; }
    const body = {...(rec.location ?? {}), id: rec.id, name: rec.location?.name ?? rec.name};
    if (!LOCATION_ID.test(body.id ?? '')) { skipped.push({id, reason: 'id must look like LOC-NAME.'}); continue; }
    if (seen.has(body.id)) { skipped.push({id, reason: 'Duplicate id in this import.'}); continue; }
    seen.add(body.id);
    const old = current.get(body.id);
    if (old && mode === 'skip') { skipped.push({id, reason: 'Already exists; kept unchanged.'}); continue; }
    if (old) {
      for (const k of ADDITIVE) if (!(k in body)) body[k] = old[k];
      // A package from before 1.4.0 has no switch for the new sections; keep the world's.
      body.sections = {conditions: old.sections.conditions, loot: old.sections.loot, ...(body.sections ?? {})};
    }
    const incoming = normalizeLocation(body);
    if (wouldCycle(incoming.id, incoming.parentLocationId, parents)) { skipped.push({id, reason: `parentLocationId ${incoming.parentLocationId} would put it inside itself.`}); continue; }
    parents.set(incoming.id, incoming.parentLocationId);
    if (!old) { created.push(incoming); continue; }
    const exhausted = new Set(old.resources.filter(n => n.exhausted).map(n => n.key));
    Object.assign(incoming, {pinKey: old.pinKey, state: old.state, revealed: old.revealed, published: old.published});
    for (const n of incoming.resources) if (n.finite && exhausted.has(n.key)) n.exhausted = true;
    updated.push(incoming);
  }
  return {created, updated, skipped};
}

/** Pulls a MAT-* id from an Item's data, wherever Ashen Gate modules record it. */
export function materialIdOf(item) {
  const f = item?.flags ?? {};
  const id = f['ashen-gate-manager']?.source?.sourceId ?? f['ashen-gate-profession-ledger']?.sourceId ?? f['ashen-gate']?.sourceId ?? '';
  return /^MAT-[A-Z0-9-]+$/.test(id) ? id : '';
}

/**
 * Party Notes (1.5.0): one shared text per location, written by the players together. Campaign state, not part
 * of the definition: never in a record, a Publish, an export or an import. One editor at a time (a lock that
 * lapses after `lockMs` or when its holder disconnects); every save also carries the `rev` it started from, so a
 * stale save is refused instead of overwriting someone else's text. Plain text only; always escaped on display.
 */
export const PARTY_NOTES = Object.freeze({maxLength: 20000, lockMs: 120000, renewMs: 30000});
const USER_ID = /^[A-Za-z0-9]{1,64}$/;
const userId = value => USER_ID.test(value ?? '') ? value : '';
const stamp = value => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
/** Plain text: control characters (except tab and newline) removed, newlines unified, capped in length. */
export const cleanNotesText = value => String(value ?? '').replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').slice(0, PARTY_NOTES.maxLength);

/** Fills defaults and drops anything malformed. `locationId` is kept only in the GM-only store. */
export function normalizeNotes(raw = {}, locationId = '') {
  const r = raw && typeof raw === 'object' ? raw : {};
  const lock = r.lock && userId(r.lock.userId) ? {userId: r.lock.userId, until: stamp(r.lock.until)} : null;
  return {locationId: LOCATION_ID.test(locationId || r.locationId || '') ? locationId || r.locationId : '',
    text: cleanNotesText(r.text), rev: stamp(r.rev), updatedBy: userId(r.updatedBy), updatedAt: stamp(r.updatedAt), lock,
    version: versionId(r.version), base: versionId(r.base)};
}
/**
 * 1.7.0: `version` is a random id given to each saved text; `base` (GM store only) is the version the GM store and
 * the shared copy last agreed on, so a later reconcile can tell which side changed. Records from 1.5/1.6 have ''.
 */
const VERSION_ID = /^[A-Za-z0-9]{1,32}$/;
const versionId = value => VERSION_ID.test(value ?? '') ? value : '';
export const newVersionId = () => globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 16) ?? Math.random().toString(36).slice(2, 18);
/** The copy players can read: no LOC id, nothing but the text, its stamps and who holds the lock. */
export const notesMirror = rec => {
  const {text, rev, updatedBy, updatedAt, lock, version} = normalizeNotes(rec);
  return {text, rev, updatedBy, updatedAt, lock, version};
};
/** Who is editing right now, or ''. A lapsed lock, or one held by someone who has left, counts as free. */
export function notesLockHolder(rec, now = Date.now(), isActive = () => true) {
  const lock = rec?.lock;
  return lock && lock.until > now && isActive(lock.userId) ? lock.userId : '';
}

/**
 * One change to a location's notes, decided on the GM's client. Returns the new record; throws with a message
 * the requester can show. ctx: {userId, isGM, now, isActive(userId), nameOf(userId), lockMs?}
 *  - lock: start (or keep) editing. Refused while someone else holds the lock, unless a GM asks to take over.
 *  - release: stop editing (only the holder's own lock is cleared).
 *  - save: needs the `rev` the editor started from and no one else holding the lock; clears the lock.
 *  - clear: GM only; empties the notes.
 */
export function applyNotesOp(raw, {op, text, rev, takeover = false} = {}, ctx) {
  const rec = normalizeNotes(raw);
  const {now, isGM = false} = ctx;
  const me = userId(ctx.userId);
  if (!me) throw new Error('Unknown user.');
  const holder = notesLockHolder(rec, now, ctx.isActive);
  const name = id => ctx.nameOf?.(id) || 'Someone';
  const busy = () => new Error(`${name(holder)} is editing these Party Notes. Try again when they have saved or closed.`);
  switch (op) {
    case 'lock':
      if (holder && holder !== me && !(isGM && takeover)) throw busy();
      return {...rec, lock: {userId: me, until: now + (ctx.lockMs ?? PARTY_NOTES.lockMs)}};
    case 'release':
      return rec.lock?.userId === me ? {...rec, lock: null} : rec;
    case 'save': {
      if (holder && holder !== me) throw busy();
      if (!Number.isInteger(rev) || rev !== rec.rev)
        throw new Error(`These Party Notes were changed by ${name(rec.updatedBy)} after you started editing. Your text was not saved and is still in the box: copy it, click Cancel, then Edit to see the new notes.`);
      if (typeof text !== 'string') throw new TypeError('Party Notes must be text.');
      return {...rec, text: cleanNotesText(text), rev: rec.rev + 1, updatedBy: me, updatedAt: now, lock: null, version: ctx.newVersion?.() ?? newVersionId()};
    }
    case 'clear':
      if (!isGM) throw new Error('Only the GM can clear Party Notes.');
      return {...rec, text: '', rev: rec.rev + 1, updatedBy: me, updatedAt: now, lock: null, version: ctx.newVersion?.() ?? newVersionId()};
    default: throw new Error(`Unknown Party Notes action "${op}".`);
  }
}

export const NOTES_MERGE_DIVIDER = '----- Earlier version, kept when the notes were reconciled';
/**
 * 1.7.0: brings the GM store's record and the shared (player-writable) copy together. Pure; never drops text.
 *  - no shared copy, or both on the same version: the store's record (a lock held on the shared copy is kept);
 *  - only the shared copy changed since they last agreed (players saved while no GM was connected): it wins;
 *  - only the store changed: the store wins (and is pushed to the shared copy);
 *  - both changed: the newer one (higher rev, then later save) wins and the older text is appended under a divider.
 * The result's `base` equals its `version`: once written to both sides they agree again.
 * opts: {now, isActive(userId), nameOf(userId), newVersion?()}. Returns {record, outcome: 'same'|'store'|'shared'|'merged', truncated}: `truncated` is any text cut by the length cap.
 */
export function reconcileNotes(storeRaw, sharedRaw, {now = Date.now(), isActive = () => true, nameOf = () => '', newVersion = newVersionId} = {}) {
  const store = normalizeNotes(storeRaw);
  const done = (rec, outcome, truncated = '') => ({record: {...rec, locationId: store.locationId, base: rec.version}, outcome, truncated});
  if (!sharedRaw) return done(store, store.version === store.base ? 'same' : 'store');
  const shared = normalizeNotes(sharedRaw);
  // A lock someone took on the shared copy while no GM was connected still counts, unless the store holds a live one.
  const lock = notesLockHolder(store, now, isActive) ? store.lock : notesLockHolder(shared, now, isActive) ? shared.lock : store.lock;
  const fields = r => ({text: r.text, rev: r.rev, updatedBy: r.updatedBy, updatedAt: r.updatedAt, version: r.version});
  if (shared.version === store.version) return done({...store, lock}, store.version === store.base && JSON.stringify(lock) === JSON.stringify(store.lock) ? 'same' : 'store');
  const sharedChanged = shared.version !== store.base, storeChanged = store.version !== store.base;
  if (sharedChanged && !storeChanged) return done({...store, ...fields(shared), lock}, 'shared');
  if (!sharedChanged) return done({...store, lock}, 'store');
  const [newer, older] = shared.rev > store.rev || (shared.rev === store.rev && shared.updatedAt > store.updatedAt) ? [shared, store] : [store, shared];
  const when = older.updatedAt ? new Date(older.updatedAt).toISOString().slice(0, 16).replace('T', ' ') : 'unknown time';
  const full = older.text && older.text !== newer.text
    ? `${newer.text}\n\n${NOTES_MERGE_DIVIDER} (saved by ${nameOf(older.updatedBy) || 'someone'}, ${when} UTC) -----\n${older.text}` : newer.text;
  const text = cleanNotesText(full);
  return done({...store, ...fields(newer), text, rev: Math.max(store.rev, shared.rev) + 1, updatedAt: now, version: newVersion(), lock}, 'merged', full.slice(text.length));
}
