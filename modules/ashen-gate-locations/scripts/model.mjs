/** Ashen Gate Locations: pure data model. No Foundry globals, so everything here is unit-tested. */
export const MODULE_ID = 'ashen-gate-locations';
export const IMPORT_SCHEMA = 'ag-foundry-import/0.2';
export const THREATS = Object.freeze([
  {value: 'normal', label: 'Normal'},
  {value: 'hot', label: 'Hot'},
  {value: 'deadly', label: 'Deadly'}
]);
/** Single-value fields with their own player-visibility toggle. Name is always shown once revealed. */
export const FIELDS = Object.freeze(['type', 'region', 'description', 'img', 'threat']);
/** List sections; each has a section toggle and a per-entry toggle. */
export const SECTIONS = Object.freeze([
  {key: 'resources', label: 'Gathering Resources'},
  {key: 'factions', label: 'Factions'},
  {key: 'quests', label: 'Quests'},
  {key: 'related', label: 'Related Locations'},
  {key: 'notes', label: 'Notes'}
]);
/** Gathering nodes (Session 1 runbook §3): skill, tier 1–5, DC defaulting by tier. Rules live in the Ledger. */
export const GATHERING = Object.freeze({
  skills: Object.freeze(['Herbalism', 'Mining', 'Fishing', 'Skinning & Harvesting', 'Archaeology']),
  dcByTier: Object.freeze({1: 10, 2: 12, 3: 13, 4: 14, 5: 15})
});
export const LOCATION_ID = /^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const QUEST_ID = /^(?:QUEST|ORDER|CONTRACT)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
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
export const threatLabel = value => THREATS.find(t => t.value === value)?.label ?? 'Normal';
export const newKey = () => Math.random().toString(36).slice(2, 10);

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
  factions: e => ({label: line(e.label), ...linked(e), note: line(e.note, 500)}),
  quests: e => ({questId: QUEST_ID.test(e.questId ?? '') ? e.questId : ''}),
  related: e => ({locationId: LOCATION_ID.test(e.locationId ?? '') ? e.locationId : ''}),
  notes: e => ({title: line(e.title), text: text(e.text), ...linked(e)})
};
const KEEP_ENTRY = {
  resources: e => e.label || e.materialId || e.rareMaterialId || e.uuid,
  factions: e => e.label || e.uuid,
  quests: e => e.questId,
  related: e => e.locationId,
  notes: e => e.title || e.text || e.uuid
};

/** Fills defaults and drops anything malformed. Unknown keys are discarded. */
export function normalizeLocation(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const loc = {
    id: LOCATION_ID.test(r.id ?? '') ? r.id : '',
    name: line(r.name) || 'New Location',
    type: line(r.type), region: line(r.region), description: text(r.description),
    img: safePath(r.img),
    threat: THREATS.some(t => t.value === r.threat) ? r.threat : 'normal',
    revealed: bool(r.revealed, false),
    show: {}, sections: {}
  };
  for (const f of FIELDS) loc.show[f] = bool(r.show?.[f], true);
  for (const {key} of SECTIONS) {
    loc.sections[key] = bool(r.sections?.[key], false);
    const list = Array.isArray(r[key]) ? r[key] : [];
    loc[key] = list.map(e => entry(e, ENTRY_SHAPES[key])).filter(KEEP_ENTRY[key]);
  }
  loc.related = loc.related.filter(e => e.locationId !== loc.id);
  return loc;
}

/** A fresh gathering node with every default filled in (the editor's "add" path). */
export const newNode = (data = {}) => ({key: newKey(), visible: true, ...ENTRY_SHAPES.resources(data)});

export function newLocation(name, existingIds) {
  const loc = normalizeLocation({name});
  loc.id = makeLocationId(loc.name, existingIds);
  return loc;
}

/**
 * The only data players ever receive. Returns null for unrevealed locations. Hidden fields,
 * hidden sections and hidden entries are omitted (not blanked), and related links only point
 * at other revealed locations. Quests carry ids only; Quest Manager decides what a player sees.
 */
export function playerView(raw, all = []) {
  const loc = normalizeLocation(raw);
  if (!loc.id || !loc.revealed) return null;
  const view = {id: loc.id, name: loc.name};
  for (const f of FIELDS) if (loc.show[f] && loc[f]) view[f] = loc[f];
  const on = key => loc.sections[key] ? loc[key].filter(e => e.visible) : [];
  const resources = on('resources').map(nodeForPlayer);
  const factions = on('factions').map(e => ({label: e.label, uuid: e.uuid, docType: e.docType, note: e.note}));
  const quests = on('quests').map(e => e.questId);
  const revealed = new Map(all.map(normalizeLocation).filter(l => l.revealed).map(l => [l.id, l.name]));
  const related = on('related').filter(e => revealed.has(e.locationId)).map(e => ({id: e.locationId, name: revealed.get(e.locationId)}));
  const notes = on('notes').map(e => ({title: e.title, text: e.text, uuid: e.uuid, docType: e.docType}));
  for (const [key, list] of Object.entries({resources, factions, quests, related, notes})) if (list.length) view[key] = list;
  return view;
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
  const meta = [view.type, view.region, view.threat && `Threat: ${threatLabel(view.threat)}`].filter(Boolean);
  if (meta.length) parts.push(`<p><em>${meta.map(esc).join(' · ')}</em></p>`);
  if (view.img) parts.push(`<p><img src="${esc(view.img)}" alt="${esc(view.name)}"></p>`);
  if (view.description) parts.push(`<p>${p(view.description)}</p>`);
  const list = (title, items) => items?.length && parts.push(`<h2>${title}</h2><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`);
  list('Gathering Resources', view.resources?.map(r => [esc(nodeName(r)), r.skill && esc(`${r.skill} T${r.tier}`), r.dc && `DC ${r.dc}`,
    r.exhausted ? '(exhausted)' : !r.available && '(unavailable)'].filter(Boolean).join(' · ')));
  list('Factions', view.factions?.map(f => esc(f.label)));
  list('Related Locations', view.related?.map(r => esc(r.name)));
  for (const n of view.notes ?? []) parts.push(`<h2>${esc(n.title || 'Note')}</h2>${n.text ? `<p>${p(n.text)}</p>` : ''}`);
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
 */
export function parseImport(pkg, existingIds = []) {
  if (!pkg || typeof pkg !== 'object' || !Array.isArray(pkg.records)) throw new Error('Not an import package: expected { manifest, records: [...] }.');
  if (pkg.manifest?.schema_version !== IMPORT_SCHEMA) throw new Error(`Unsupported schema_version "${pkg.manifest?.schema_version}"; expected ${IMPORT_SCHEMA}.`);
  const taken = new Set(existingIds);
  const created = [], skipped = [], errors = [];
  for (const [i, rec] of pkg.records.entries()) {
    if (rec?.entity_type !== 'Location') continue;
    const body = {...(rec.location ?? {}), id: rec.id, name: rec.location?.name ?? rec.name};
    if (!LOCATION_ID.test(body.id ?? '')) { errors.push(`records[${i}]: id must look like LOC-NAME.`); continue; }
    if (taken.has(body.id)) { skipped.push(body.id); continue; }
    taken.add(body.id);
    created.push(normalizeLocation(body));
  }
  return {created, skipped, errors};
}

/** Pulls a MAT-* id from an Item's data, wherever Ashen Gate modules record it. */
export function materialIdOf(item) {
  const f = item?.flags ?? {};
  const id = f['ashen-gate-manager']?.source?.sourceId ?? f['ashen-gate-profession-ledger']?.sourceId ?? f['ashen-gate']?.sourceId ?? '';
  return /^MAT-[A-Z0-9-]+$/.test(id) ? id : '';
}
