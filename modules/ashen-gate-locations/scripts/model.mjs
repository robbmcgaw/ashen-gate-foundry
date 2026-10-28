/** Ashen Gate Locations: pure data model. No Foundry globals, so everything here is unit-tested. */
export const MODULE_ID = 'ashen-gate-locations';
export const IMPORT_SCHEMA = 'ag-foundry-import/0.2';
/** 1.17.4: a Character Hub level-up backup copy (GM-only "<Name> - level X"); never a watch candidate or target. Safe when the Hub is absent. */
export const isLevelBackup = actor => !!actor?.flags?.['ashen-gate-character-hub']?.levelBackup;
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
  {key: 'hazards', label: 'Hazards'},
  {key: 'rollTables', label: 'Roll Tables'},
  {key: 'notes', label: 'Notes'},
  {key: 'scenes', label: 'Linked Scenes'}
]);
export const DETAIL_PREFIX = 'detail:';
export const LOOT_STATUSES = Object.freeze(['available', 'discovered', 'taken']);
export const LOOT_STATUS_LABELS = Object.freeze({available: 'Available', discovered: 'Discovered', taken: 'Taken'});
/** Gathering nodes (Session 1 runbook §3): skill, tier 1–5, DC defaulting by tier. Rules live in the Ledger.
 * 1.9.0: dcByTier is 10/12/15/18/20, kept equal to the Ledger's DEFAULT_DC_BY_TIER (a test checks both).
 * legacyDcByTier is the pre-1.9.0 table: a stored DC equal to it still counts as "the tier default" in the editor. */
export const GATHERING = Object.freeze({
  // 1.18.0: Hunting (was "Skinning & Harvesting"; that and "Hunting/Skinning" still read, as Hunting).
  skills: Object.freeze(['Herbalism', 'Mining', 'Fishing', 'Hunting', 'Archaeology']),
  dcByTier: Object.freeze({1: 10, 2: 12, 3: 15, 4: 18, 5: 20}),
  legacyDcByTier: Object.freeze({1: 10, 2: 12, 3: 13, 4: 14, 5: 15})
});
/** Old names of the Hunting activity. A stored skill that is one of them reads as "Hunting" (migrate on read; the record
 *  is only rewritten when the GM next saves it). The Ledger reads both names as the same profession. */
const HUNTING_ALIASES = new Set(['skinning & harvesting', 'skinning and harvesting', 'hunting/skinning', 'hunting / skinning', 'hunting & skinning', 'huntingskinning', 'skinning']);
export const gatheringSkill = value => {
  const s = line(value, 80);
  return HUNTING_ALIASES.has(s.toLowerCase()) ? 'Hunting' : s;
};
/** 1.18.0: Profession Ledger 0.25.0 node templates. A gathering entry may refer to one by its permanent NODE-* id. */
export const NODE_ID = /^NODE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
/** The Ledger's activity keys, as Locations shows them. */
export const ACTIVITY_LABELS = Object.freeze({mining: 'Mining', herbalism: 'Herbalism', hunting: 'Hunting', fishing: 'Fishing', archaeology: 'Archaeology'});
export const activityLabel = key => ACTIVITY_LABELS[key] ?? '';
export const isNodeRef = e => NODE_ID.test(e?.nodeId ?? '');
/** Exotic candidates on a node (1.9.0), GM only. The Ledger owns the rules; Locations stores the choice:
 * random discovery, or a designated source with its own chance (1–100, required) and condition (any success / by 5+). */
export const EXOTIC_MODES = Object.freeze(['discovery', 'designated']);
export const EXOTIC_CONDITIONS = Object.freeze({success: 'Any success', rare: 'Success by 5+ only'});
const MAX_EXOTICS = 20;
export function normalizeExotics(list) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const materialId = matId(raw?.materialId);
    if (!materialId || seen.has(materialId)) continue;
    seen.add(materialId);
    if (raw.mode !== 'designated') out.push({materialId, mode: 'discovery'});
    else {
      const c = Number(raw.chance);
      out.push({materialId, mode: 'designated', chance: raw.chance !== '' && raw.chance != null && Number.isFinite(c) && c >= 1 && c <= 100 ? Math.round(c) : null,
        condition: raw.condition === 'rare' ? 'rare' : 'success'});
    }
    if (out.length >= MAX_EXOTICS) break;
  }
  return out;
}
/** True when a node's DC is its tier default (current or pre-1.9.0), so a tier change may move it. */
export const isTierDefaultDc = (dc, tier) => dc === GATHERING.dcByTier[tier] || dc === GATHERING.legacyDcByTier[tier];
export const LOCATION_ID = /^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
/** 0.20.0: routes are retired. An old RTE-* id is only ever read (Convert routes to locations, `convertedFromRoute`). */
export const ROUTE_ID = /^RTE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const ROUTES_RETIRED = 'Routes are retired; make a location with type Route instead.';
/** Suggested values for the free-text Type field (any text is allowed). */
export const TYPE_SUGGESTIONS = Object.freeze(['Route', 'Town', 'Ruin', 'Forest', 'Dungeon', 'Region']);
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
export const text = (value, max = 20000) => String(value ?? '').slice(0, max);
export const line = (value, max = 200) => text(value, max).replace(/[\r\n]+/g, ' ').trim();
export const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
const int = (value, fallback, min, max) => {
  const n = Number(value);
  return value !== '' && value !== null && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const matId = value => /^MAT-[A-Z0-9-]+$/.test(value ?? '') ? value : '';
/** A permanent Item id, same shape ag-item-drop accepts (itemIdOf). */
const ITEM_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
/** Foundry stores relative file paths; reject script/data schemes and markup characters. */
export const safePath = value => {
  const s = line(value, 500);
  return s && !/^(?:javascript|data|vbscript|file):/i.test(s) && !/[<>"'`]/.test(s) ? s : '';
};
export const safeUuid = value => {
  const s = line(value, 300);
  return /^[A-Za-z0-9._-]+$/.test(s) ? s : '';
};
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
/** Optional true/false that falls back to the template's value: null. */
const tri = value => typeof value === 'boolean' ? value : null;
/**
 * 1.18.0: a gathering entry that refers to a Ledger node template. The template (owned by the Ledger) gives the activity,
 * professions, check and material tables; the entry keeps only what belongs to the place. `tier`, `dc`, `dcVisible` and
 * `finite` are null when the template's value applies; `label` '' means the template's name. Play state as before.
 */
const nodeRef = e => {
  const finite = tri(e.finite);
  return {nodeId: e.nodeId, label: line(e.label), tier: int(e.tier, null, 1, 5), dc: int(e.dc, null, 1, 40), dcVisible: tri(e.dcVisible), finite,
    exhausted: finite !== false && bool(e.exhausted, false), available: bool(e.available, true), note: line(e.note, 500)};
};
const ENTRY_SHAPES = {
  // A gathering node. 1.0.x entries (label/materialId/available only) get tier 1, DC 10, finite. With a NODE-* nodeId: a reference (above).
  resources: e => {
    if (isNodeRef(e)) return nodeRef(e);
    const tier = int(e.tier, 1, 1, 5), finite = bool(e.finite, true);
    return {label: line(e.label), skill: gatheringSkill(e.skill), tier, dc: int(e.dc, GATHERING.dcByTier[tier], 1, 40), dcVisible: bool(e.dcVisible, false),
      materialId: matId(e.materialId), quantity: int(e.quantity, 1, 1, 999),
      rareMaterialId: matId(e.rareMaterialId), rareQuantity: int(e.rareQuantity, 1, 1, 999),
      finite, exhausted: finite && bool(e.exhausted, false), available: bool(e.available, true),
      uuid: safeUuid(e.uuid), note: line(e.note, 500), exotics: normalizeExotics(e.exotics)};
  },
  conditions: e => ({label: line(e.label), text: text(e.text, 2000)}),
  factions: e => ({label: line(e.label), ...linked(e), note: line(e.note, 500)}),
  quests: e => ({questId: QUEST_ID.test(e.questId ?? '') ? e.questId : ''}),
  related: e => ({locationId: LOCATION_ID.test(e.locationId ?? '') ? e.locationId : ''}),
  // A loot entry is a plain-text reward (no uuid) or a link to a native Item. `label`, `text` and `img` are what
  // players see; nothing is ever read from the linked document into the view. A link creates no Actor item.
  // `itemId` (1.17.3, optional): the dropped Item's permanent id (ag-item-drop itemIdOf), or null.
  loot: e => ({label: line(e.label), text: text(e.text, 2000), img: safePath(e.img), ...linked(e), itemId: ITEM_ID.test(e.itemId ?? '') ? e.itemId : null,
    status: LOOT_STATUSES.includes(e.status) ? e.status : 'available'}),
  notes: e => ({title: line(e.title), text: text(e.text), ...linked(e)})
};
const DETAIL_SHAPE = e => ({title: line(e.title), text: text(e.text), ...linked(e)});
/**
 * 0.20.0: hazards and linked roll tables, on any location (a "Route" is just a location of type Route). Lists of
 * {id, ...}; `shown` (default false) is the per-entry player toggle, so a new entry is GM only. No chance, no
 * automation: the GM adjudicates and rolls. A hazard's `tableUuid` (optional RollTable) is never sent to players.
 */
const MAX_LIST = 50;
function idList(list, shape, keep) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const e = raw && typeof raw === 'object' ? raw : {};
    let id = line(e.id ?? e.key, 40) || newKey();
    while (seen.has(id)) id = newKey();
    const item = {id, ...shape(e), shown: bool(e.shown, false)};
    if (!keep(item)) continue;
    seen.add(id); out.push(item);
    if (out.length >= MAX_LIST) break;
  }
  return out;
}
export const normalizeHazards = list => idList(list, e => ({name: line(e.name), note: text(e.note, 2000), tableUuid: safeUuid(e.tableUuid)}), h => h.name || h.note || h.tableUuid);
export const normalizeRollTables = list => idList(list, e => ({name: line(e.name), uuid: safeUuid(e.uuid)}), t => t.uuid);
const KEEP_ENTRY = {
  conditions: e => e.label || e.text,
  loot: e => e.label || e.text || e.uuid,
  resources: e => e.nodeId || e.label || e.materialId || e.rareMaterialId || e.uuid,
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
  body.hazards = normalizeHazards(r.hazards);
  body.rollTables = normalizeRollTables(r.rollTables);
  body.isRegion = bool(r.isRegion, false);
  // 1.8.0: a Region passes its Conditions down only while this is on. null = a record from before 1.8.0, read as on
  // (the 1.4.0 behaviour) until the GM's migration settles it (resolvePassConditions); new records get false.
  body.passConditions = typeof r.passConditions === 'boolean' ? r.passConditions : null;
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
/** 0.25.0: {img, unidentifiedImg, size}; '' / 0 = not set here. */
export const normalizeChildPin = raw => ({img: safePath(raw?.img), unidentifiedImg: safePath(raw?.unidentifiedImg), size: int(raw?.size, 0, 16, 256)});
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
  // 1.8.0, GM-only: null = the default (placeable unless it is a Region), see isPlaceable().
  loc.placeable = typeof r.placeable === 'boolean' ? r.placeable : null;
  loc.audience = normalizeAudience(r.audience);
  // 0.25.0, GM-only: the default pin art/size for places inside this one (see inheritedPin). Not published; players never get it.
  loc.childPin = normalizeChildPin(r.childPin);
  // 0.27.0, GM-only presentation: draw this location's pin art at its own proportions (see pin-proportions.mjs). Default off; a record
  // from before 0.27.0 has no field and reads false. On the location itself, not inherited, and not part of the published content.
  loc.pinKeepProportions = r.pinKeepProportions === true;
  // 0.20.0, GM-only: the RTE id this location was converted from (Developer Tools), so a route is never converted twice.
  loc.convertedFromRoute = ROUTE_ID.test(r.convertedFromRoute ?? '') ? r.convertedFromRoute : '';
  loc.state = STATES.includes(r.state) ? r.state : r.revealed === true ? 'revealed' : 'hidden';
  loc.revealed = loc.state === 'revealed';
  // 0.24.0, live play state like `state`: "the party is here now". Never part of the published content; a Hidden location is never active.
  // 0.26.0, GM-only: an archived location is off the list and invisible to players; everything else is kept (see bulk.mjs).
  loc.archived = r.archived === true;
  loc.archivedAt = loc.archived && typeof r.archivedAt === 'string' ? r.archivedAt.slice(0, 40) : '';
  loc.active = r.active === true && loc.state !== 'hidden' && !loc.archived;
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

/**
 * 1.8.0 audience: who may see a location at all, on top of its marker state. 'everyone' (the default, as before) or
 * 'selected': only the listed player user ids. `sharedBy[userId]` names the player who added that user (absent when
 * the GM did). `sharing`: whether those players may add others (they can never remove anyone).
 */
export const AUDIENCE_MODES = Object.freeze(['everyone', 'selected']);
const PLAYER_ID = /^[A-Za-z0-9]{1,64}$/;
export function normalizeAudience(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const mode = AUDIENCE_MODES.includes(r.mode) ? r.mode : 'everyone';
  const userIds = [...new Set((Array.isArray(r.userIds) ? r.userIds : []).filter(u => PLAYER_ID.test(u ?? '')))].slice(0, 100);
  const sharedBy = {};
  for (const u of userIds) if (PLAYER_ID.test(r.sharedBy?.[u] ?? '') && r.sharedBy[u] !== u) sharedBy[u] = r.sharedBy[u];
  return {mode, userIds, sharedBy, sharing: bool(r.sharing, true)};
}
/** May this player see the location at all (marker state aside)? */
export const inAudience = (loc, userId) => loc.audience?.mode !== 'selected' || (loc.audience.userIds ?? []).includes(userId);
/** Can everyone who may read `reader` also see `target`? (reader null: the GM, who sees everything.) */
export function covers(target, reader) {
  if (!reader || target.audience?.mode !== 'selected') return true;
  if (reader.audience?.mode !== 'selected') return false;
  return reader.audience.userIds.every(u => target.audience.userIds.includes(u));
}
/**
 * A player shares a location they can see with other players. Pure; throws a message the player can show.
 * `players`: ids of the world's player (non-GM) users. Returns {audience, added: [userId]}. Nobody is ever removed.
 */
export function applyShare(raw, byUserId, userIds, players) {
  const loc = normalizeLocation(raw);
  const a = loc.audience;
  if (a.mode !== 'selected') throw new Error('Everyone can already see this location.');
  if (!a.userIds.includes(byUserId)) throw new Error("That location isn't available to you.");
  if (!a.sharing) throw new Error('The GM has turned sharing off for this location.');
  if (!Array.isArray(userIds) || !userIds.length) throw new Error('Choose at least one player to share with.');
  const known = new Set(players);
  const added = [...new Set(userIds)].filter(u => known.has(u) && !a.userIds.includes(u));
  if (userIds.some(u => !known.has(u))) throw new Error('You can only share with players in this world.');
  for (const u of added) { a.userIds.push(u); a.sharedBy[u] = byUserId; }
  return {audience: normalizeAudience(a), added};
}

/** 1.8.0 Placeable flag: shown in Place on Scene and the drag-to-map list. Default: yes, unless it is a Region. */
export const isPlaceable = loc => loc.placeable ?? !loc.isRegion;

/**
 * 1.8.0 migration (re-runnable): settles "Pass conditions to places inside" on records from before 1.8.0 (null).
 * A Region that was actually passing conditions (it has some and something sits inside it) is switched on so nothing
 * changes; everything else gets off. The published copy is settled the same way from its own content. Records that
 * already have a value are untouched. Returns {list, turnedOn: [{id, name}], changed: count}.
 */
export function resolvePassConditions(list) {
  const hasChild = new Set(list.map(l => l.parentLocationId).filter(Boolean));
  const pubChild = new Set(list.map(l => l.published?.parentLocationId).filter(Boolean));
  const turnedOn = [];
  let changed = 0;
  for (const l of list) {
    if (l.passConditions === null || l.passConditions === undefined) {
      l.passConditions = !!(l.isRegion && l.conditions?.length && hasChild.has(l.id));
      if (l.passConditions) turnedOn.push({id: l.id, name: l.name});
      changed++;
    }
    if (l.published && (l.published.passConditions === null || l.published.passConditions === undefined)) {
      l.published.passConditions = !!(l.published.isRegion && l.published.conditions?.length && pubChild.has(l.id));
      changed++;
    }
  }
  return {list, turnedOn, changed};
}

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

/** 1.8.0: does this location (or published body) pass its Conditions down? A Region with the switch on; a
 *  pre-1.8.0 Region (switch never set) keeps passing until the migration decides. */
export const passesConditions = body => !!body?.isRegion && (body.passConditions ?? true);
/**
 * Conditions in effect at a location: those it inherits from Region ancestors, then its own. Only Regions with
 * "Pass conditions to places inside" on (passesConditions) pass them down, through any number of places in between; nothing else
 * (resources, factions, quests, loot, state, visibility) is inherited. A child's `conditionOverrides` can turn an
 * inherited condition off or replace its label/text; the Region is never edited.
 * GM (default): saved content, every condition, each with its source. `player: true`: only what the published
 * content allows (Region not hidden and seen by everyone who reads this card, shown section, visible entry);
 * disabled ones are dropped and no source is named.
 */
export function effectiveConditions(raw, all = [], {player = false, normalized = null} = {}) {
  const loc = normalizeLocation(raw);
  const body = player ? loc.published : loc;
  if (!body) return [];
  const byId = new Map((normalized ?? all.map(normalizeLocation)).filter(l => l.id).map(l => [l.id, l]));
  const overrides = new Map(body.conditionOverrides.map(o => [`${o.from}\n${o.conditionKey}`, o]));
  const chain = [], seen = new Set([loc.id]);
  const reader = player ? loc : null;
  for (let id = body.parentLocationId; id && !seen.has(id);) {
    seen.add(id);
    const a = byId.get(id);
    if (!a) break;
    chain.unshift(a);
    id = (player ? a.published : a)?.parentLocationId ?? a.parentLocationId;
  }
  const out = [];
  for (const a of chain) {
    const src = player ? (a.state !== 'hidden' && covers(a, reader) ? a.published : null) : a;
    if (!passesConditions(src) || (player && !src.sections.conditions)) continue;
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
 * what a player sees. `label` is the world fallback for the unidentified label. `normalized` (optional): `all`
 * already run through normalizeLocation, so a caller building many views normalizes the list once, not per view.
 * `nodeView(nodeId, {tier})` (1.18.0, GM client only): the Ledger's templates.playerView, for entries that refer to a node template.
 */
export function playerView(raw, all = [], {label = '', normalized = null, nodeView = null} = {}) {
  const loc = normalizeLocation(raw);
  const pub = loc.published;
  if (!loc.id || loc.state === 'hidden' || loc.archived || !pub) return null;
  const fallback = line(label, 80) || DEFAULT_UNIDENTIFIED_LABEL;
  // Only readers of a "Selected players" location get this view, so the list names no one else.
  const share = loc.audience.mode === 'selected' ? {userIds: [...loc.audience.userIds], canShare: loc.audience.sharing} : null;
  if (loc.state === 'unidentified') {
    const view = {key: loc.pinKey, state: 'unidentified', name: pub.unidentifiedLabel || fallback};
    if (loc.active) view.active = true;
    if (pub.teaser) view.teaser = pub.teaser;
    if (share) view.share = share;
    return view;
  }
  const view = {id: loc.id, key: loc.pinKey, state: 'revealed', name: pub.name};
  if (loc.active) view.active = true;
  for (const f of FIELDS) if (pub.show[f] && pub[f]) view[f] = pub[f];
  const on = key => pub.sections[key] ? pub[key].filter(e => e.visible) : [];
  const resources = on('resources').map(e => nodeForPlayer(e, nodeView));
  const factions = on('factions').map(e => ({label: e.label, uuid: e.uuid, docType: e.docType, note: e.note}));
  const quests = on('quests').map(e => e.questId);
  // A link (parent, children, related) appears only if everyone who can read this card can also see its target.
  const shown = new Map((normalized ?? all.map(normalizeLocation)).filter(l => l.id && l.state !== 'hidden' && !l.archived && l.published && covers(l, loc)).map(l => [l.id, l]));
  const ref = l => l.state === 'revealed' ? {id: l.id, key: l.pinKey, name: l.published.name} : {key: l.pinKey, name: l.published.unidentifiedLabel || fallback};
  const related = on('related').map(e => shown.get(e.locationId)).filter(l => l?.state === 'revealed').map(l => ({id: l.id, name: l.published.name}));
  const notes = on('notes').map(e => ({title: e.title, text: e.text, uuid: e.uuid, docType: e.docType}));
  // Only what the GM wrote for players. Nothing is read from the linked document, and the status is the GM's.
  const loot = on('loot').map(e => ({label: e.label, text: e.text, img: e.img, uuid: e.uuid, docType: e.docType, status: e.status}));
  const details = pub.details.filter(d => d.visible).map(d => ({key: d.key, title: d.title, text: d.text, uuid: d.uuid, docType: d.docType}));
  // 0.20.0: only entries the GM marked shown; never a hazard's linked table (that is the GM's tool).
  const hazards = pub.hazards.filter(h => h.shown).map(h => ({id: h.id, name: h.name, note: h.note}));
  const rollTables = pub.rollTables.filter(t => t.shown).map(t => ({id: t.id, name: t.name, uuid: t.uuid}));
  const conditions = pub.sections.conditions ? effectiveConditions(loc, all, {player: true, normalized}).map(c => ({label: c.label, text: c.text})) : [];
  const parent = shown.get(pub.parentLocationId);
  if (parent) view.parent = ref(parent);
  const children = [...shown.values()].filter(l => l.published.parentLocationId === loc.id).map(ref).sort((a, b) => a.name.localeCompare(b.name));
  for (const [key, list] of Object.entries({conditions, resources, factions, quests, related, loot, hazards, rollTables, notes, details, children})) if (list.length) view[key] = list;
  // Block order as the GM published it, listing only blocks the player actually has (so no empty or unrevealed titles).
  const present = new Set(Object.keys(view).filter(k => k !== 'details'));
  for (const d of details) present.add(DETAIL_PREFIX + d.key);
  if (view.description) present.add('description');
  view.layout = pub.layout.filter(k => present.has(k));
  if (share) view.share = share;
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
export function pinPresentation(raw, {label = '', unknownImg = '', all = null} = {}) {
  const loc = normalizeLocation(raw);
  const src = loc.state !== 'hidden' && loc.published ? loc.published : loc;
  // 0.25.0: a value the location does not set comes from the nearest ancestor's "default pin for places inside" (inheritedPin).
  const inh = inheritedPin(src.parentLocationId, all, loc.id);
  const size = src.pin.size || inh.size || PIN_DEFAULTS.size;
  const revealedImg = src.pin.img || inh.img || PIN_DEFAULTS.img;
  const unknown = src.pin.unidentifiedImg || inh.unidentifiedImg || safePath(unknownImg) || PIN_DEFAULTS.unidentifiedImg;
  // 0.26.0: an archived location's pin is drawn and labelled like a hidden one (players cannot open it either way).
  const keep = loc.pinKeepProportions ? {keep: true} : {};
  if (loc.archived) return {text: '', src: unknown, size, ...keep};
  // 1.8.0: a "Selected players" pin carries no label of its own. Foundry then labels it with its page's name,
  // which only the players who may open that page are shown (the Note is invisible to everyone else).
  if (loc.audience.mode === 'selected') return {text: '', src: loc.state === 'revealed' ? revealedImg : unknown, size, ...keep};
  if (loc.state === 'revealed') return {text: src.name, src: revealedImg, size, ...keep};
  return {text: loc.state === 'unidentified' ? src.unidentifiedLabel || line(label, 80) || DEFAULT_UNIDENTIFIED_LABEL : '', src: unknown, size, ...keep};
}

/** 0.25.0: where each pin value of a location comes from. Same order as pinPresentation (which this mirrors for the editor and API). */
export function effectivePin(raw, all = [], unknownImg = '') {
  const loc = normalizeLocation(raw);
  const src = loc.state !== 'hidden' && loc.published ? loc.published : loc;
  const inh = inheritedPin(src.parentLocationId, all, loc.id);
  const pick = (own, k, world, builtIn) => own ? [own, 'own'] : inh[k] ? [inh[k], inh.from[k]] : world ? [world, 'world'] : [builtIn, 'built-in'];
  const [img, fImg] = pick(src.pin.img, 'img', '', PIN_DEFAULTS.img);
  const [unidentifiedImg, fUnk] = pick(src.pin.unidentifiedImg, 'unidentifiedImg', safePath(unknownImg), PIN_DEFAULTS.unidentifiedImg);
  const [size, fSize] = pick(src.pin.size, 'size', 0, PIN_DEFAULTS.size);
  return {img, unidentifiedImg, size, from: {img: fImg, unidentifiedImg: fUnk, size: fSize}};
}

/**
 * 0.25.0: the pin defaults a place inherits. Walks up from `parentId` and takes, for each of img / unidentifiedImg / size,
 * the first ancestor that sets it. A missing parent ends the walk and a loop is cut (each id is visited once), so bad data
 * can never hang it. Returns {img, unidentifiedImg, size, from: {img, unidentifiedImg, size}} ('' / 0 / '' when none sets one).
 * `all` is the world's locations (any shape; read-only). GM-side only: the result is never sent to players as a record.
 */
export function inheritedPin(parentId, all, selfId = '') {
  const out = {img: '', unidentifiedImg: '', size: 0, from: {img: '', unidentifiedImg: '', size: ''}};
  if (!parentId || !Array.isArray(all)) return out;
  const seen = new Set([selfId]);
  for (let id = parentId; id && !seen.has(id); ) {
    seen.add(id);
    const anc = all.find(l => l?.id === id);
    if (!anc) break;
    const c = normalizeChildPin(anc.childPin);
    for (const k of ['img', 'unidentifiedImg', 'size']) if (!out[k] && c[k]) { out[k] = c[k]; out.from[k] = id; }
    id = anc.parentLocationId;
  }
  return out;
}

/** 0.26.0: has the GM changed this Note's image or size by hand (so it is theirs, not wholly the module's)? Same test as notePatch. */
export function pinOverridden(note) {
  const last = note.flags?.[MODULE_ID]?.pin ?? note.getFlag?.(MODULE_ID, 'pin');
  const src = note.texture?.src ?? '';
  const ownSrc = last ? src === last.src : !src || src === PIN_DEFAULTS.img;
  const ownSize = last ? note.iconSize === last.size : note.iconSize == null || note.iconSize === PIN_DEFAULTS.size;
  return !(ownSrc && ownSize);
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
  // 0.27.0: keep-proportions follows the location (it is not a Note setting the GM edits). Written only when on; a pin that had it and
  // no longer does gets an explicit false, because flag updates merge. Notes that never had it are not rewritten.
  if (pres.keep === true) pin.keep = true; else if (last?.keep === true) pin.keep = false;
  const patch = {};
  if (note.text !== pres.text) patch.text = pres.text;
  if (ownSrc && src !== pres.src) patch.texture = {src: pres.src};
  if (ownSize && note.iconSize !== pres.size) patch.iconSize = pres.size;
  if (ours.pinKey !== pinKey || last?.src !== pin.src || last?.size !== pin.size || (last?.keep === true) !== (pin.keep === true) || ours.locationId != null)
    patch.flags = {[MODULE_ID]: {pinKey, pin, ...(ours.locationId != null ? {locationId: null} : {})}};
  return Object.keys(patch).length ? patch : null;
}

/** Node fields in a fixed order. The player copy drops the GM toggles, and the DC unless shown. A template reference
 *  (1.18.0) keeps its own fields, as the Ledger's templates.resolve(entry) reads them. */
export function nodeForGM(e) {
  if (isNodeRef(e)) {
    const {key, nodeId, label, tier, dc, dcVisible, finite, exhausted, available, visible, note} = e;
    return {id: key, nodeId, label, tier, dc, dcVisible, finite, exhausted, available, note, visible};
  }
  const {key, label, skill, tier, dc, dcVisible, materialId, quantity, rareMaterialId, rareQuantity, finite, exhausted, available, visible, uuid, note} = e;
  return {id: key, label, skill, tier, dc, materialId, quantity, rareMaterialId, rareQuantity, finite, exhausted, available, note, uuid, visible, dcVisible,
    exotics: normalizeExotics(e.exotics)};
}
/**
 * Players never get Exotic candidates (or the GM toggles, or a DC the GM has not shown). A template reference becomes the
 * Ledger's player shape (templates.playerView: no chances, no Exotics, DC only when shown) with the place's own label,
 * DC, finite and play state on top. Without the Ledger, or for a deleted template, players get the place's own fields only.
 */
export function nodeForPlayer(e, nodeView = null) {
  if (isNodeRef(e)) return refForPlayer(e, nodeView);
  const {visible, dcVisible, dc, exotics, ...rest} = nodeForGM(e);
  return dcVisible ? {...rest, dc} : rest;
}
const REF_FIELDS = ['materialId', 'quantity', 'rareMaterialId', 'rareQuantity'];
function refForPlayer(e, nodeView) {
  let v = null;
  try { v = typeof nodeView === 'function' ? nodeView(e.nodeId, {tier: e.tier}) ?? null : null; } catch { v = null; }
  if (v && typeof v !== 'object') v = null;
  const finite = e.finite ?? (typeof v?.finite === 'boolean' ? v.finite : true);
  const out = {id: e.key, nodeId: e.nodeId, label: e.label || line(v?.label) || 'Gathering spot', skill: activityLabel(v?.activity) || gatheringSkill(v?.skill),
    activity: v && ACTIVITY_LABELS[v.activity] ? v.activity : '', tier: int(v?.tier, e.tier, 1, 5)};
  // The DC: the place's own when it sets one, else the template's (which the Ledger only gives when the template shows it).
  const shown = e.dcVisible ?? (v?.dc != null);
  const dc = e.dc ?? int(v?.dc, null, 1, 40);
  if (shown && dc != null) out.dc = dc;
  if (v) for (const k of REF_FIELDS) out[k] = k.endsWith('Id') ? matId(v[k]) : int(v[k], 1, 1, 999);
  Object.assign(out, {finite, exhausted: finite && e.exhausted, available: e.available, note: e.note});
  return out;
}
export const nodeName = n => n.label || 'Resource';

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
    hazards: list('Hazards', view.hazards?.map(h => [esc(h.name || 'Hazard'), h.note && p(h.note)].filter(Boolean).join(': '))),
    rollTables: list('Roll Tables', view.rollTables?.map(t => esc(t.name || 'Roll table'))),
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

/** A Location record's body. 0.20.0: `roll_tables` is read as `rollTables` (export writes `rollTables`). */
function recordBody(rec) {
  const body = {...(rec.location ?? {}), id: rec.id, name: rec.location?.name ?? rec.name};
  if (body.rollTables === undefined) delete body.rollTables;
  if (!('rollTables' in body) && body.roll_tables !== undefined) body.rollTables = body.roll_tables;
  delete body.roll_tables;
  return body;
}

/**
 * Reads Location records from an ag-foundry-import/0.2 package. Other entity types are skipped; Route records (retired in
 * 0.20.0) are listed in `retired` with ROUTES_RETIRED.
 * Records already in the world are left untouched (user edits win); new ones are returned for creation.
 * `existing` is the world's locations (or just their ids); a parent link that would make a loop is an error.
 */
export function parseImport(pkg, existing = []) {
  if (!pkg || typeof pkg !== 'object' || !Array.isArray(pkg.records)) throw new Error('Not an import package: expected { manifest, records: [...] }.');
  if (pkg.manifest?.schema_version !== IMPORT_SCHEMA) throw new Error(`Unsupported schema_version "${pkg.manifest?.schema_version}"; expected ${IMPORT_SCHEMA}.`);
  const known = existing.map(e => typeof e === 'string' ? {id: e} : e);
  const taken = new Set(known.map(l => l.id));
  const parents = parentMap(known);
  const created = [], skipped = [], errors = [], retired = [];
  for (const [i, rec] of pkg.records.entries()) {
    // 0.20.0: Route records are skipped with a message; the rest of the file still imports.
    if (rec?.entity_type === 'Route') { retired.push({id: typeof rec.id === 'string' ? rec.id : `records[${i}]`, reason: ROUTES_RETIRED}); continue; }
    if (rec?.entity_type !== 'Location') continue;
    const body = recordBody(rec);
    if (!LOCATION_ID.test(body.id ?? '')) { errors.push(`records[${i}]: id must look like LOC-NAME.`); continue; }
    if (taken.has(body.id)) { skipped.push(body.id); continue; }
    const loc = normalizeLocation(body);
    if (wouldCycle(loc.id, loc.parentLocationId, parents)) { errors.push(`records[${i}]: parentLocationId ${loc.parentLocationId} would put ${loc.id} inside itself.`); continue; }
    taken.add(loc.id);
    parents.set(loc.id, loc.parentLocationId);
    created.push(loc);
  }
  return {created, skipped, errors, retired};
}

/** Fields added in 1.3.0, 1.4.0, 1.8.0, 0.20.0 and 0.25.0. An update that leaves one out keeps the world's value instead of clearing it. */
const ADDITIVE = ['parentLocationId', 'unidentifiedLabel', 'teaser', 'pin', 'sceneUuids', 'layout', 'details', 'isRegion', 'conditionOverrides', 'conditions', 'loot',
  'passConditions', 'placeable', 'hazards', 'rollTables', 'convertedFromRoute', 'childPin', 'pinKeepProportions'];

/**
 * Imports Location records (Manager's import run, or the package path above) into `existing`.
 * mode 'skip' (default) leaves any existing id untouched; 'update' replaces its definition but
 * keeps the GM's play state: its marker state and what players currently see (the published
 * content, until the GM publishes again), its audience, its pin binding, and which finite nodes are exhausted.
 * Map Notes are never touched by an import, so per-pin overrides survive.
 * Returns {created, updated, skipped: [{id, reason}]} with ready-to-save locations in `created`/`updated`.
 */
export function importRecords(records, existing = [], {mode = 'skip', unarchive = false} = {}) {
  if (!['skip', 'update'].includes(mode)) throw new Error(`Unknown import mode "${mode}"; use "skip" or "update".`);
  if (!Array.isArray(records)) throw new Error('Expected an array of Location records.');
  const current = new Map(existing.map(l => [l.id, normalizeLocation(l)]));
  const parents = parentMap([...current.values()]);
  const seen = new Set();
  const created = [], updated = [], skipped = [];
  for (const [i, rec] of records.entries()) {
    const id = rec?.id ?? `records[${i}]`;
    if (rec?.entity_type === 'Route') { skipped.push({id, reason: ROUTES_RETIRED}); continue; }
    if (rec?.entity_type !== 'Location') { skipped.push({id, reason: 'Not a Location record.'}); continue; }
    const body = recordBody(rec);
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
    incoming.active = false; // a file never makes a place active; the GM does, in play
    if (!old) { created.push(incoming); continue; }
    const exhausted = new Set(old.resources.filter(n => n.exhausted).map(n => n.key));
    // Who may see it is play state too, like the marker state.
    Object.assign(incoming, {pinKey: old.pinKey, state: old.state, revealed: old.revealed, active: old.active, published: old.published, audience: old.audience});
    // 0.26.0: an archived location stays archived when it is imported again, unless the caller says `unarchive` (a package never decides).
    Object.assign(incoming, old.archived && !unarchive ? {archived: true, archivedAt: old.archivedAt, active: false} : {archived: false, archivedAt: ''});
    for (const n of incoming.resources) if (n.finite !== false && exhausted.has(n.key)) n.exhausted = true;
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
