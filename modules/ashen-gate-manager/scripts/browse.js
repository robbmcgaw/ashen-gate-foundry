/**
 * Browse (0.24.0): one GM-only, read-only, searchable index over world documents, compendium indexes and the
 * canonical records partner modules expose through their public APIs (0.34.0: Renown deities and Manager's own
 * NPC Codex too). Not a second source of truth: entries are
 * rebuilt from their owners on demand and never written back. Pure logic with injected Foundry globals so the
 * Node suite can cover it; main.js wires the DOM.
 */
import {collectModuleSections, sourceFlagOf} from './world-export.js';
import {systemOf, normalizeSourceRef} from './browser.js';
import {FILTER_INDEX_FIELDS, itemFacts, rarityKey, sharedMatch} from './item-filters.js';
import {loadItemPreview} from './item-preview.js';

const MODULE_ID = 'ashen-gate-manager';
const GM_ONLY = 'Only the GM can browse Ashen Gate data.';
const WORLD = [['Actor', 'actors'], ['Item', 'items'], ['JournalEntry', 'journal']];
const PACK_TYPES = new Set(['Actor', 'Item', 'JournalEntry']);
const PACK_FIELDS = ['type', 'folder', 'img', `flags.${MODULE_ID}.source`, 'system.rarity', '_stats.modifiedTime', ...FILTER_INDEX_FIELDS];
const TITLES = {'ashen-gate-manager': 'General Manager', 'ashen-gate-locations': 'Locations', 'ashen-gate-quest-manager': 'Quest Log',
  'ashen-gate-factions': 'Renown', 'ashen-gate-skill-trees': 'Skill Trees', 'ashen-gate-headquarters': 'Headquarters',
  'ashen-gate-profession-ledger': 'Profession Ledger', world: 'World'};
/** world-export section -> browse kind for each record; Skill Trees also adds one Perk entry per perk node. */
const SECTION_KIND = {locations: 'Location', routes: 'Route', quests: 'Quest', factions: 'Faction', deities: 'Deity', skill_trees: 'Tree', headquarters: 'Facility'};
const ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
export const FACETS = Object.freeze(['kind', 'entityType', 'owner', 'category', 'profession', 'tier', 'quality', 'status', 'visibility', 'folder']);
export const FACET_LABELS = Object.freeze({kind: 'Kind', entityType: 'AG type', owner: 'Owner / module', category: 'Category', profession: 'Profession',
  tier: 'Tier', quality: 'Rarity / quality', status: 'Status', visibility: 'Visibility', folder: 'Pack / folder'});
export const SORTS = Object.freeze({name: 'Name', type: 'Type', changed: 'Recently changed'});
export const GROUPS = Object.freeze({none: 'No grouping', kind: 'Kind', category: 'Category', owner: 'Owner / module', folder: 'Pack / folder', entityType: 'AG type', profession: 'Profession', tier: 'Tier'});
export const PAGE_SIZE = 100;

/** Lower case, accents removed, so "Héron" finds "heron". */
export const fold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const stripHtml = html => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const listOf = value => [...(value?.contents ?? value ?? [])];
const str = v => v === undefined || v === null || v === '' ? null : String(v);
const first = (...values) => { for (const v of values) { const s = Array.isArray(v) ? str(v[0]) : str(v); if (s) return s; } return null; };
const assertGM = game => { if (!game?.user?.isGM) throw new Error(GM_ONLY); };
const folderPath = folder => {
  const names = [];
  for (let f = folder && typeof folder === 'object' ? folder : null, n = 0; f && n < 20; f = f.folder && typeof f.folder === 'object' ? f.folder : null, n++) names.unshift(f.name);
  return names.join('/');
};

/** Collects Ashen Gate-looking ids (MAT-HERB-01, LOC-…) anywhere in a value, a few levels deep. */
function scanIds(value, out = new Set(), depth = 0) {
  if (depth > 5 || value === null || value === undefined) return out;
  if (typeof value === 'string') { if (value.length < 64 && ID_RE.test(value)) out.add(value); return out; }
  if (Array.isArray(value)) { for (const v of value) scanIds(v, out, depth + 1); return out; }
  if (typeof value === 'object') for (const v of Object.values(value)) scanIds(v, out, depth + 1);
  return out;
}

/** The definition fields shared by most Ashen Gate records, read the same way from world flags and partner data. */
function definitionFields(def = {}, system = {}) {
  const tags = [def.tags, def.keywords].flat().filter(t => typeof t === 'string');
  return {
    profession: first(def.profession, def.profession_id, def.professionId, def.professions),
    tier: first(def.tier, def.tier_id, def.tierId, def.level),
    quality: first(def.quality, def.rarity, typeof system.rarity === 'string' ? system.rarity : null),
    tags,
    description: stripHtml(first(def.summary, def.description, system.description?.value) ?? '').slice(0, 2000)
  };
}

function entry(base) {
  const e = {id: null, uuid: null, docType: null, ag: false, managed: false, entityType: null, status: null, visibility: null,
    profession: null, tier: null, quality: null, tags: [], description: '', folder: null, category: null, modified: 0,
    refIds: [], linked: false, draggable: false, pack: null, sources: [], open: null, chips: [], extraFields: [], searchText: [], ...base};
  e.kinds = [e.kind];
  // Items tab shared filters (0.36.0): partner records with no document have no source and only show under "All sources".
  e.source ??= null; e.origin ??= e.ag ? 'ag' : null; e.rarity ??= rarityKey(e.quality); e.coreRef ??= false; e.folderIds ??= [];
  e.provenance ??= e.pack ? `Compendium: ${e.pack}` : e.owner === 'world' || e.owner === MODULE_ID && e.uuid ? 'World' : TITLES[e.owner] ?? e.owner;
  e.sources = [e.provenance];
  e.hay = fold([e.name, e.id, e.kind, e.docType, e.entityType, e.category, e.profession, e.tier, e.quality, e.status, ...e.tags, e.folder, e.description, ...e.searchText].filter(Boolean).join(' \u0001 '));
  e.idFold = fold(e.id ?? '');
  return e;
}

function agFields(source, system) {
  const def = source.definition ?? {};
  const sys = systemOf({sourceId: source.sourceId, ownerSystemId: source.ownerSystemId, entityType: source.entityType, packageId: source.packageId});
  return {id: source.sourceId, ag: true, managed: true, owner: MODULE_ID, entityType: str(source.entityType), status: str(source.status),
    visibility: str(source.visibility), category: sys.label, ...definitionFields(def, system),
    refIds: [...new Set([...(source.refs ?? []).map(r => normalizeSourceRef(r).targetId).filter(Boolean), ...scanIds(def)])].filter(id => id !== source.sourceId)};
}

function worldDocEntry(doc, kind) {
  const source = sourceFlagOf(doc);
  const tagged = Boolean(source?.sourceId);
  const system = doc.system ?? {};
  return entry({key: doc.uuid ?? `${kind}.${doc.id}`, uuid: doc.uuid ?? null, docId: doc.id ?? null, name: doc.name ?? '(unnamed)', kind, ...itemFacts(doc), docType: str(doc.type),
    owner: 'world', category: str(doc.type), folder: folderPath(doc.folder) || null, modified: doc._stats?.modifiedTime ?? 0,
    linked: true, draggable: true, open: {type: 'document'}, ...(tagged ? agFields(source, system) : definitionFields({}, system))});
}

function worldEntries(game, docs) {
  const out = [];
  for (const [kind, coll] of WORLD) for (const doc of listOf(game[coll])) {
    const e = worldDocEntry(doc, kind);
    docs.set(e.key, doc);
    out.push(e);
    if (kind === 'JournalEntry') for (const page of listOf(doc.pages)) {
      const p = entry({key: page.uuid ?? `${e.key}.JournalEntryPage.${page.id}`, uuid: page.uuid ?? null, name: page.name ?? '(page)', kind: 'JournalEntryPage',
        source: e.source, origin: e.origin, folderIds: e.folderIds, docType: str(page.type), owner: 'world', category: str(page.type), folder: [e.folder, doc.name].filter(Boolean).join('/'),
        modified: page._stats?.modifiedTime ?? 0, linked: true, draggable: true, open: {type: 'document'}, ag: e.ag, parentKey: e.key,
        description: stripHtml(page.text?.content ?? '').slice(0, 2000)});
      docs.set(p.key, page);
      out.push(p);
    }
  }
  return out;
}

/** Renown deity (source definition from getDeities): tier, domain and discovery chips; relations become related ids. */
function deityEntry(r, owner) {
  const d = r.data ?? {}, p = d.deity && typeof d.deity === 'object' ? d.deity : {};
  const relations = (Array.isArray(p.relations) ? p.relations : []).filter(x => typeof x?.deity_id === 'string');
  const tier = p.tier === 'lesser' ? 'lesser' : p.tier === 'major' ? 'major' : str(p.tier);
  const disc = d.discovery ?? {};
  const discovery = `${disc.placeholder ? 'placeholder until discovered' : 'hidden until discovered'}${disc.sharing_enabled === false ? ', no sharing' : ''}`;
  const tone = v => typeof v !== 'number' ? '' : v < 0.5 ? 'Dissonance' : v > 0.5 ? 'Resonance' : 'Neutral';
  return entry({key: `${owner}/${r.id}`, id: r.id, name: r.name ?? r.id, kind: 'Deity', owner, ag: true, entityType: 'Deity',
    status: str(d.status), visibility: str(d.visibility), category: 'Renown', ...definitionFields({tags: d.tags, summary: p.blurb}),
    tier, searchText: [p.title, p.domain, p.portfolio].map(str).filter(Boolean),
    chips: [tier ? `${tier === 'lesser' ? 'Lesser' : tier === 'major' ? 'Major' : tier} deity` : null, p.domain ? `Domain: ${p.domain}` : null, `Discovery: ${discovery}`].filter(Boolean),
    extraFields: [['Title', str(p.title)], ['Domain', str(p.domain)], ['Portfolio', str(p.portfolio)], ['Discovery', discovery],
      ['Relations', relations.map(x => `${x.deity_id}${tone(x.resonance) ? ` (${tone(x.resonance)})` : ''}`).join(', ')]],
    open: {type: 'module', module: owner, kind: 'Deity', id: r.id},
    refIds: [...new Set([...relations.map(x => x.deity_id), ...scanIds(d)])].filter(id => id !== r.id)});
}

/** NPC Codex rows from Manager's own GM read API (api.codex.list). They merge into the NPC's world Actor row by id. */
function codexEntries(game) {
  const list = game.modules?.get?.(MODULE_ID)?.api?.codex?.list;
  if (typeof list !== 'function') return [];
  let npcs;
  try { npcs = list() ?? []; } catch (error) { console.warn(`[${MODULE_ID}] Browse: NPC Codex not read`, error); return []; }
  return npcs.filter(n => n?.id).map(n => {
    const actors = n.discovery?.actors?.length ?? 0;
    const known = n.discoveryMode === 'party' ? 'Known to party' : n.discoveryMode === 'actors' ? `Known to ${actors} character${actors === 1 ? '' : 's'}` : 'Hidden from players';
    const links = Array.isArray(n.links) ? n.links : [];
    const role = n.fields?.find?.(f => f.key === 'role')?.value ?? '';
    return entry({key: `codex/${n.id}`, id: n.id, name: n.name ?? n.id, kind: 'NPC Codex', owner: MODULE_ID, ag: true, entityType: 'NPC',
      status: str(n.status), category: systemOf({sourceId: n.id}).label, linked: true, provenance: 'NPC Codex', description: stripHtml(role).slice(0, 2000),
      searchText: [n.discoveryLabel, ...links.map(l => l.name)].map(str).filter(Boolean),
      chips: [known, `${n.revealedCount ?? 0} field${n.revealedCount === 1 ? '' : 's'} revealed`, `${links.length} link${links.length === 1 ? '' : 's'}`],
      extraFields: [['Codex: known to', str(n.discoveryLabel)], ['Codex: fields revealed', `${n.revealedCount ?? 0} of ${n.fields?.length ?? 0}`],
        ['Codex: connections', links.map(l => l.named ? `${l.name} (${l.id})` : l.id).join(', ')]],
      open: {type: 'codex', id: n.id, label: 'Open in NPC Codex'}, refIds: links.map(l => l.id).filter(id => id && id !== n.id)});
  });
}

/** Partner records through the same adapters World export uses (public APIs only, missing module = no records). */
function partnerEntries(game) {
  const out = [];
  const sections = collectModuleSections(game);
  for (const [section, kind] of Object.entries(SECTION_KIND)) {
    const s = sections[section];
    if (s?.status !== 'ok') continue;
    if (section === 'deities') { for (const r of s.records) out.push(deityEntry(r, s.module_id)); continue; }
    for (const r of s.records) {
      const d = r.data ?? {};
      const data = section === 'quests' ? {...(d.source ?? {}), definitionStatus: d.definitionStatus, kind: d.kind} : d;
      const owner = s.module_id;
      out.push(entry({key: `${owner}/${r.id}`, id: r.id, name: r.name ?? r.id, kind, owner, ag: true,
        entityType: str(data.entity_type ?? data.entityType ?? data.objective_kind ?? data.kind ?? kind),
        status: str(data.definitionStatus ?? data.status), visibility: str(data.visibility),
        category: systemOf({sourceId: r.id}).label, ...definitionFields(data), open: {type: 'module', module: owner, kind, id: r.id},
        refIds: [...scanIds(data)].filter(id => id !== r.id)}));
      if (section === 'skill_trees') for (const node of Array.isArray(data.nodes) ? data.nodes : []) {
        const pid = str(node.perkId ?? node.perk_id);
        const nid = pid ?? `${r.id}/${node.id}`;
        out.push(entry({key: `${owner}/${r.id}/${node.id}`, id: pid, name: node.name ?? node.label ?? pid ?? node.id, kind: 'Perk', owner, ag: true,
          entityType: 'Perk', visibility: str(node.visibility), status: str(node.status), category: 'Skill Trees', folder: r.name ?? r.id,
          ...definitionFields(node), open: {type: 'module', module: owner, kind: 'Tree', id: r.id},
          refIds: [r.id, ...scanIds(node)].filter(id => id !== nid)}));
      }
    }
  }
  // Profession Ledger catalog: its only public lookup is the GM-only exotic.materials (every quality, drafts included).
  const ledger = game.modules?.get?.('ashen-gate-profession-ledger');
  const materials = ledger?.active ? ledger.api?.exotic?.materials : null;
  if (typeof materials === 'function') {
    try {
      for (const m of materials({quality: null, includeUnavailable: true}) ?? []) out.push(entry({key: `ashen-gate-profession-ledger/${m.id}`, id: str(m.id),
        name: m.name ?? m.id, kind: 'Material', owner: 'ashen-gate-profession-ledger', ag: true, entityType: 'Material',
        quality: str(m.quality), tier: str(m.tier), profession: first(m.professions), tags: [], category: 'Professions',
        status: m.available === false ? 'unavailable' : null, open: {type: 'module', module: 'ashen-gate-profession-ledger', kind: 'Material', id: m.id}}));
    } catch (error) { console.warn(`[${MODULE_ID}] Browse: Profession Ledger materials not read`, error); }
  }
  return [...out, ...codexEntries(game)];
}

/** Compendium entries from pack indexes only (no full documents). GM-only caller; packs the user cannot see are skipped. */
export async function compendiumEntries(game) {
  const out = [];
  for (const pack of listOf(game.packs)) {
    const type = pack.documentName ?? pack.metadata?.type;
    if (!PACK_TYPES.has(type) || pack.visible === false) continue;
    const label = pack.metadata?.label ?? pack.title ?? pack.collection;
    const pkg = pack.metadata?.packageName ?? pack.metadata?.package ?? 'world';
    let index;
    try { index = await pack.getIndex({fields: PACK_FIELDS}); }
    catch (error) { console.warn(`[${MODULE_ID}] Browse: compendium ${pack.collection} not indexed`, error); continue; }
    for (const i of listOf(index)) {
      const source = i.flags?.[MODULE_ID]?.source;
      const tagged = Boolean(source?.sourceId);
      const folder = i.folder ? (pack.folders?.get?.(i.folder)?.name ?? null) : null;
      const uuid = i.uuid ?? `Compendium.${pack.collection}.${type}.${i._id}`;
      out.push(entry({key: uuid, uuid, docId: i._id ?? null, name: i.name ?? '(unnamed)', kind: type,
        ...itemFacts(i, {packId: pack.collection, lookupFolder: id => pack.folders?.get?.(id) ?? null}), docType: str(i.type), owner: pkg, pack: label, packId: pack.collection,
        locked: Boolean(pack.locked), category: str(i.type), folder: [label, folder].filter(Boolean).join('/'), modified: i._stats?.modifiedTime ?? 0,
        draggable: true, open: {type: 'compendium'}, ...(tagged ? {...agFields(source, i.system ?? {}), owner: pkg} : definitionFields({}, i.system ?? {}))}));
    }
  }
  return out;
}

/**
 * Merges sources with world documents first, then partner records, then compendium entries. The same record never
 * appears twice: rows with the same canonical id (or uuid) merge into the first, which keeps its uuid for drag/sheet
 * and gains the partner's open action; the others are listed under `sources`.
 */
export function mergeEntries(...lists) {
  const out = [], byId = new Map(), byUuid = new Map();
  for (const e of lists.flat()) {
    e.kinds ??= [e.kind]; e.chips ??= []; e.extraFields ??= [];
    const hit = (e.id && byId.get(e.id)) || (e.uuid && byUuid.get(e.uuid));
    if (hit) {
      if (!hit.sources.includes(e.provenance)) hit.sources.push(e.provenance);
      const jump = t => t?.type === 'module' || t?.type === 'codex';
      if (jump(e.open) && !jump(hit.open)) { hit.moduleOpen = e.open; hit.owner = e.owner; }
      hit.refIds = [...new Set([...hit.refIds, ...e.refIds])];
      for (const f of ['kinds', 'chips']) hit[f] = [...new Set([...hit[f], ...e[f]])];
      hit.extraFields = [...hit.extraFields, ...e.extraFields.filter(([l]) => !hit.extraFields.some(([h]) => h === l))];
      hit.description ||= e.description;
      for (const f of ['profession', 'tier', 'quality', 'status', 'visibility', 'entityType']) hit[f] ??= e[f];
      hit.hay += ' \u0001 ' + e.hay;
      continue;
    }
    out.push(e);
    if (e.id) byId.set(e.id, e);
    if (e.uuid) byUuid.set(e.uuid, e);
  }
  // "Unlinked" = an Ashen Gate record with no world document behind it.
  for (const e of out) e.unlinked = e.ag && !e.linked && !e.pack;
  return out;
}

/** Splits "id:MAT-HERB tag:poison status:draft herb" into prefixes and free words (all must match). */
export function parseQuery(text) {
  const terms = [];
  for (const raw of String(text ?? '').trim().split(/\s+/).filter(Boolean)) {
    const m = raw.match(/^(id|tag|type|kind|status|tier|pack|owner):(.*)$/i);
    if (m && m[2]) terms.push({field: m[1].toLowerCase(), value: fold(m[2])});
    else terms.push({field: null, value: fold(raw)});
  }
  return terms;
}
const termMatch = (e, t) => {
  switch (t.field) {
    case 'id': return e.idFold.startsWith(t.value) || e.idFold.includes(t.value);
    case 'tag': return e.tags.some(tag => fold(tag).includes(t.value));
    // "type:npc-codex" finds the NPC Codex kind (spaces read as hyphens); a merged row matches every kind it was found as.
    case 'type': case 'kind': return [...(e.kinds ?? [e.kind]), e.docType, e.entityType].some(v => fold(v).includes(t.value) || fold(v).replace(/\s+/g, '-').includes(t.value));
    case 'status': return fold(e.status) === t.value;
    case 'tier': return fold(e.tier) === t.value;
    case 'pack': return fold(e.folder).includes(t.value) || fold(e.provenance).includes(t.value);
    case 'owner': return fold(e.owner).includes(t.value) || fold(TITLES[e.owner]).includes(t.value);
    default: return e.hay.includes(t.value);
  }
};

/** Entries matching the search text and the Items tab's shared filters (0.36.0), unpaged: the "selection" other rail entries act on. */
export function filterEntries(entries, {query = '', shared = null} = {}) {
  const terms = parseQuery(query);
  return entries.filter(e => (!shared || sharedMatch(e, shared)) && terms.every(t => termMatch(e, t)));
}

const scopeMatch = (e, scope) => scope === 'ag' ? e.ag : scope === 'nonag' ? !e.ag : true;
const facetValue = (e, f) => e[f] ?? null;
const sortKey = {name: (a, b) => a.name.localeCompare(b.name), type: (a, b) => a.kind.localeCompare(b.kind) || (a.entityType ?? '').localeCompare(b.entityType ?? '') || a.name.localeCompare(b.name),
  changed: (a, b) => (b.modified || 0) - (a.modified || 0) || a.name.localeCompare(b.name)};
export const ownerLabel = id => TITLES[id] ?? id;

/**
 * Filters, counts, sorts, groups and pages the index. Counts per facet value ignore that facet's own filter, so a
 * select always shows what picking another value would give. Pure: no Foundry access.
 */
export function searchIndex(entries, {query = '', scope = 'all', filters = {}, managedOnly = false, unlinkedOnly = false, sort = 'name', group = 'none', page = 0, pageSize = PAGE_SIZE, shared = null} = {}) {
  const terms = parseQuery(query);
  const active = FACETS.filter(f => filters[f] !== undefined && filters[f] !== null && filters[f] !== '' && filters[f] !== 'all');
  // `shared` = the Items tab's source/type/origin/rarity/folder/core_ref filters (0.36.0); scope counts follow them.
  const pool = shared ? entries.filter(e => sharedMatch(e, shared)) : entries;
  const base = pool.filter(e => scopeMatch(e, scope) && (!managedOnly || e.managed) && (!unlinkedOnly || e.unlinked) && terms.every(t => termMatch(e, t)));
  const passes = (e, skip) => active.every(f => f === skip || String(facetValue(e, f) ?? '—') === String(filters[f]));
  const rows = base.filter(e => passes(e));
  const facets = {};
  for (const f of FACETS) {
    const counts = new Map();
    for (const e of base) if (passes(e, f)) { const v = facetValue(e, f); if (v !== null) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1); }
    facets[f] = [...counts].map(([value, count]) => ({value, count, label: f === 'owner' ? ownerLabel(value) : value, selected: String(filters[f]) === value}))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, {numeric: true}));
  }
  const cmp = sortKey[sort] ?? sortKey.name;
  const groupOf = e => group === 'none' ? '' : group === 'owner' ? ownerLabel(e.owner) : String(e[group] ?? '—');
  rows.sort((a, b) => group === 'none' ? cmp(a, b) : groupOf(a).localeCompare(groupOf(b), undefined, {numeric: true}) || cmp(a, b));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.max(0, Math.min(page, pages - 1));
  const slice = rows.slice(p * pageSize, (p + 1) * pageSize);
  const totals = new Map();
  if (group !== 'none') for (const e of rows) totals.set(groupOf(e), (totals.get(groupOf(e)) ?? 0) + 1);
  const groups = [];
  for (const e of slice) {
    const label = groupOf(e);
    if (!groups.length || groups.at(-1).label !== label) groups.push({label, total: totals.get(label) ?? rows.length, rows: []});
    groups.at(-1).rows.push(e);
  }
  const scopes = {all: 0, ag: 0, nonag: 0};
  for (const e of pool) { scopes.all++; scopes[e.ag ? 'ag' : 'nonag']++; }
  return {total: rows.length, page: p, pages, from: rows.length ? p * pageSize + 1 : 0, to: p * pageSize + slice.length, groups, facets, scopes,
    activeFilters: active.length + (managedOnly ? 1 : 0) + (unlinkedOnly ? 1 : 0) + (terms.length ? 1 : 0)};
}

/** Detail view: key fields plus related records (outgoing ids this record names, incoming records that name it). */
export function detailOf(entries, key) {
  const e = entries.find(x => x.key === key);
  if (!e) return null;
  const byId = new Map(entries.filter(x => x.id).map(x => [x.id, x]));
  const outgoing = e.refIds.map(id => ({id, name: byId.get(id)?.name ?? null, key: byId.get(id)?.key ?? null, kind: byId.get(id)?.kind ?? null}));
  const incoming = e.id ? entries.filter(x => x !== e && x.refIds.includes(e.id)).map(x => ({id: x.id, name: x.name, key: x.key, kind: x.kind})) : [];
  const fields = [['Id', e.id], ['Kind', (e.kinds ?? [e.kind]).join(', ')], ['Document type', e.docType], ['AG type', e.entityType], ['Category', e.category], ['Owner', ownerLabel(e.owner)],
    ['Found in', e.sources.join(' • ')], ['Status', e.status], ['Visibility', e.visibility], ['Profession', e.profession], ['Tier', e.tier],
    ['Rarity / quality', e.quality], ['Tags', e.tags.join(', ')], ...(e.extraFields ?? []), ['Pack / folder', e.folder], ['UUID', e.uuid]]
    .filter(([, v]) => v !== null && v !== undefined && v !== '').map(([label, value]) => ({label, value: String(value)}));
  return {entry: e, fields, description: e.description, outgoing, incoming};
}

/** Same payload the core sidebar puts in dataTransfer 'text/plain', so a row drops on sheets, canvas and journals. */
export function dragDataOf(e, doc = null) {
  if (!e?.draggable || !e.uuid) return null;
  if (doc && typeof doc.toDragData === 'function') return doc.toDragData();
  return {type: e.kind, uuid: e.uuid};
}

/**
 * The Browse service: builds the index lazily, rebuilds after document hooks (debounced) or Refresh, and loads
 * compendium indexes only when asked. Every call checks the GM itself.
 */
export function createBrowse({game, hooks = null, fromUuid = null, openCodex = null, debounceMs = 250, now = () => Date.now()} = {}) {
  let entries = null, packEntries = null, packsLoading = null, timer = null, builtAt = 0;
  const docs = new Map();
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) try { fn(); } catch (error) { console.warn(`[${MODULE_ID}] Browse listener failed`, error); } };
  const build = () => {
    docs.clear();
    entries = mergeEntries(worldEntries(game, docs), partnerEntries(game), packEntries ?? []);
    builtAt = now();
    return entries;
  };
  const invalidate = () => {
    entries = null;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; notify(); }, debounceMs);
  };
  const hookNames = ['Actor', 'Item', 'JournalEntry', 'JournalEntryPage'].flatMap(t => [`create${t}`, `update${t}`, `delete${t}`]);
  const hookIds = hooks?.on ? hookNames.map(name => [name, hooks.on(name, invalidate)]) : [];
  const api = {
    getIndex() { assertGM(game); return entries ?? build(); },
    search(options = {}) { assertGM(game); return searchIndex(entries ?? build(), options); },
    detail(key) { assertGM(game); return detailOf(entries ?? build(), key); },
    /** Rebuilds now; with compendiums:true also re-reads pack indexes that were already loaded. */
    async refresh({compendiums = false} = {}) {
      assertGM(game);
      const reload = compendiums && packsLoaded();
      if (reload) packEntries = null;
      build(); notify();
      if (reload) await api.loadCompendiums();
      return api.status();
    },
    /** Reads every visible Actor/Item/Journal pack index once (no full documents); cached until Refresh. */
    async loadCompendiums() {
      assertGM(game);
      packsLoading ??= compendiumEntries(game).then(list => { packEntries = list; entries = null; packsLoading = null; notify(); return list; },
        error => { packsLoading = null; throw error; });
      return packsLoading;
    },
    status() { assertGM(game); return {built: Boolean(entries), builtAt, count: entries?.length ?? 0, compendiums: packsLoaded(), compendiumCount: packEntries?.length ?? 0, loading: Boolean(packsLoading)}; },
    /** Item preview (0.38.0): dnd5e's item card plus where it lives. One document by uuid; never a whole pack. */
    async preview(keyOrUuid) {
      assertGM(game);
      const list = entries ?? build();
      const e = list.find(x => x.key === keyOrUuid) ?? list.find(x => x.uuid === keyOrUuid) ?? null;
      return loadItemPreview({game, entry: e, uuid: e?.uuid ?? keyOrUuid, doc: e ? docs.get(e.key) ?? null : null, fromUuid});
    },
    dragData(key) { assertGM(game); const e = (entries ?? build()).find(x => x.key === key); return dragDataOf(e, docs.get(key)); },
    /** Opens the original: a world sheet, the compendium document, or the owning module at that record when it offers a way. */
    async open(key, {prefer = 'auto'} = {}) {
      assertGM(game);
      const e = (entries ?? build()).find(x => x.key === key);
      if (!e) return {ok: false, message: 'That record is no longer in the index. Press Refresh.'};
      const target = prefer === 'sheet' || !e.moduleOpen ? e.open : e.moduleOpen;
      try {
        if (target?.type === 'document') {
          const doc = docs.get(key);
          if (doc?.documentName === 'JournalEntryPage' || e.kind === 'JournalEntryPage') {
            const parent = doc?.parent;
            if (parent?.sheet?.render) { await parent.sheet.render({force: true, pageId: doc.id}); return {ok: true}; }
          }
          if (doc?.sheet?.render) { await doc.sheet.render({force: true}); return {ok: true}; }
          return {ok: false, message: `${e.name} has no sheet to open.`};
        }
        if (target?.type === 'compendium') {
          const doc = fromUuid ? await fromUuid(e.uuid) : null;
          if (doc?.sheet?.render) { await doc.sheet.render({force: true}); return {ok: true}; }
          return {ok: false, message: `Could not load ${e.name} from ${e.pack}.`};
        }
        if (target?.type === 'module') return await openInModule(game, target, e);
        if (target?.type === 'codex') {
          if (typeof openCodex !== 'function') return {ok: false, message: `Open Library → NPC Codex and pick ${e.name} (${e.id}).`};
          await openCodex(target.id); return {ok: true};
        }
      } catch (error) { return {ok: false, message: `Could not open ${e.name}: ${error?.message ?? error}`}; }
      return {ok: false, message: `${e.name} cannot be opened from here.`};
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    invalidate,
    dispose() { for (const [name, id] of hookIds) hooks?.off?.(name, id); listeners.clear(); if (timer) clearTimeout(timer); }
  };
  const packsLoaded = () => Boolean(packEntries);
  return api;
}

/** Feature-detected open per partner module; a module without an open-by-record call opens its window and says where to look. */
async function openInModule(game, target, e) {
  const mod = game.modules?.get?.(target.module);
  const title = ownerLabel(target.module);
  const api = mod?.active ? mod.api : null;
  if (!api) return {ok: false, message: `${title} is not active, so ${e.id ?? e.name} cannot be opened there.`};
  const fallback = async () => {
    if (typeof api.open !== 'function') return {ok: false, message: `Open it in ${title}: that module has no open API Manager can call.`};
    await api.open();
    return {ok: true, message: `${title} opened. Find ${e.name} (${e.id}) there: it has no open-at-record API.`};
  };
  if (target.kind === 'Location' && typeof api.openLocation === 'function') { await api.openLocation(target.id); return {ok: true}; }
  if (target.kind === 'Quest' && typeof api.openObjective === 'function') {
    const out = await api.openObjective(target.id);
    if (out?.status !== 'not_found') return {ok: true};
  }
  if (target.kind === 'Tree' && typeof api.open === 'function') { await api.open({treeId: target.id}); return {ok: true}; }
  if (target.kind === 'Deity' && typeof api.open === 'function') { await api.open({deityId: target.id, tab: 'pantheon'}); return {ok: true}; }
  return fallback();
}
