/**
 * Organize folders (0.25.0): GM-only, re-runnable filing of world (or unlocked world-compendium) Items,
 * Actors and Journals into a folder tree described by an editable rule set.
 *
 * Organize only ever writes a document's `folder` field (and creates missing Folders). It never renames,
 * deletes or edits anything else, never deletes folders, and never touches Actor progression or module state.
 * The GM can protect a folder (flag on the Folder, inherited by sub-folders) or a single document
 * (`keepFolder` flag); both are skipped. Player characters and player-owned Actors are left alone by default.
 * Every run is stored (previous folder ids) so the last organize can be undone.
 */
import {MODULE_ID, getPath} from './core.js';
import {isCoreSource} from './core-links.js';

export const SCHEMA_SETTING = 'organizeSchema';
export const HISTORY_SETTING = 'organizeHistory';
export const FLAG_PROTECTED = 'organizeProtected';
export const FLAG_KEEP = 'keepFolder';
export const HISTORY_LIMIT = 5;
export const MAX_DEPTH = 4; // CONST.FOLDER_MAX_DEPTH in Foundry V14
export const ORGANIZE_TYPES = Object.freeze(['Item', 'Actor', 'JournalEntry']);
const GM_ONLY = 'Only the GM can organize folders.';
const fail = message => ({ok:false, message});
const clone = value => JSON.parse(JSON.stringify(value));

const RARITY = {common:'Common', uncommon:'Uncommon', rare:'Rare', veryrare:'Very Rare', legendary:'Legendary', artifact:'Artifact'};
const title = s => String(s).replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
function crBand(cr) {
  if(cr == null || cr === '' || !Number.isFinite(Number(cr))) return null;
  const n = Number(cr);
  return n <= 1 ? 'CR 0-1' : n <= 4 ? 'CR 2-4' : n <= 10 ? 'CR 5-10' : n <= 16 ? 'CR 11-16' : 'CR 17+';
}

/**
 * The facts a rule can match on. Ashen Gate records use Manager's source flag; everything else uses dnd5e fields.
 * `tierIndex` maps recipe ids to tiers so crafted Items can be filed under their recipe's tier.
 */
export function factsOf(doc, documentName, tierIndex = new Map()) {
  const source = getPath(doc, `flags.${MODULE_ID}.source`) ?? null;
  const def = source?.definition ?? {};
  const sys = doc.system ?? {};
  const ag = Boolean(source?.sourceId);
  const status = source?.status ?? null;
  const rarity = String(sys.rarity ?? '').replace(/\s+/g, '').toLowerCase();
  const tierRaw = def.tierId ?? def.tier ?? source?.tierId ?? tierIndex.get(def.created_by_recipe_id) ?? null;
  const level = documentName === 'Item' && doc.type === 'spell' ? Number(sys.level) : null;
  const cr = getPath(sys, 'details.cr');
  const creature = getPath(sys, 'details.type.value');
  return {
    documentType: documentName, ag, sourceId: source?.sourceId ?? null, entityType: source?.entityType ?? null,
    status, visibility: source?.visibility ?? null,
    test: /^\s*\[TEST\]/i.test(doc.name ?? '') || status === 'example_only' || source?.scope === 'example_only',
    tier: tierRaw ? title(tierRaw) : null,
    profession: def.profession_id ?? def.source_profession_id ?? null,
    quality: def.quality ?? null,
    crafted: Boolean(def.created_by_recipe_id),
    itemType: documentName === 'Item' ? doc.type : null,
    subtype: documentName === 'Item' ? (getPath(sys, 'type.value') ?? null) : null,
    rarity: RARITY[rarity] ?? null,
    magic: Boolean(RARITY[rarity]),
    spellLevel: Number.isFinite(level) ? (level === 0 ? 'Cantrips' : `Level ${level}`) : null,
    spellSchool: documentName === 'Item' && doc.type === 'spell' ? (sys.school ?? null) : null,
    actorType: documentName === 'Actor' ? doc.type : null,
    playerOwned: documentName === 'Actor' && Boolean(doc.hasPlayerOwner),
    creatureType: documentName === 'Actor' && creature ? title(creature) : null,
    cr: cr ?? null, crBand: documentName === 'Actor' ? crBand(cr) : null,
    core: String(getPath(doc, '_stats.compendiumSource') ?? '').startsWith('Compendium.dnd5e.'),
    // 0.31.0: Plutonium-imported, or marked 2024 or 2014 core / SRD 5.1. No source, third-party or homebrew → Homebrew.
    // Wider than Core Links' 2024-only test (isSource2024). Key name kept so saved custom rules still match.
    sourceTagged: isCoreSource(doc)
  };
}
export const MATCH_KEYS = Object.freeze(['documentType', 'ag', 'sourceIdPrefix', 'entityType', 'status', 'visibility', 'test', 'tier',
  'profession', 'quality', 'crafted', 'itemType', 'subtype', 'rarity', 'magic', 'spellLevel', 'spellSchool', 'actorType', 'playerOwned',
  'creatureType', 'crBand', 'core', 'sourceTagged']);
const PLACEHOLDERS = Object.freeze(['tier', 'rarity', 'spellLevel', 'creatureType', 'crBand', 'entityType', 'actorType', 'profession', 'quality', 'itemType']);

const T = (types, id, label, when, path) => ({id, label, types, when, ...(path === null ? {leave:true} : {path})});
const I = ['Item'], A = ['Actor'], J = ['JournalEntry'], ALL = [...ORGANIZE_TYPES];
/** Best-guess default schema. First match wins; anything unmatched stays where it is. */
export const DEFAULT_RULES = Object.freeze([
  T(A, 'pc', 'Player characters stay where they are', {actorType:'character'}, null),
  T(A, 'player-owned', 'Player-owned actors stay where they are', {playerOwned:true}, null),
  T(ALL, 'playtest', 'Playtest records ([TEST] and example_only)', {test:true}, 'Ashen Gate/Playtest'),
  T(I, 'ag-profession', 'Profession features', {ag:true, entityType:'Profession'}, 'Ashen Gate/Professions/Professions'),
  T(I, 'ag-material-tier', 'Materials by tier', {ag:true, entityType:'Material'}, 'Ashen Gate/Professions/{tier}/Materials'),
  T(I, 'ag-material', 'Materials (no tier)', {ag:true, entityType:'Material'}, 'Ashen Gate/Professions/Materials'),
  T(I, 'ag-recipe-tier', 'Recipes by tier', {ag:true, entityType:'Recipe'}, 'Ashen Gate/Professions/{tier}/Recipes'),
  T(I, 'ag-recipe', 'Recipes (no tier)', {ag:true, entityType:'Recipe'}, 'Ashen Gate/Professions/Recipes'),
  T(I, 'ag-crafted-tier', 'Crafted items by recipe tier', {ag:true, crafted:true}, 'Ashen Gate/Professions/{tier}/Crafted Items'),
  T(I, 'ag-crafted', 'Crafted items (no tier)', {ag:true, crafted:true}, 'Ashen Gate/Professions/Crafted Items'),
  T(I, 'ag-perk-tier', 'Profession perks by tier', {ag:true, entityType:['ProfessionPerk', 'Perk']}, 'Ashen Gate/Professions/{tier}/Perks'),
  T(I, 'ag-perk', 'Profession perks (no tier)', {ag:true, entityType:['ProfessionPerk', 'Perk']}, 'Ashen Gate/Professions/Perks'),
  T(I, 'ag-item', 'Other Ashen Gate items', {ag:true, entityType:'Item'}, 'Ashen Gate/Items'),
  T(A, 'ag-creature', 'Ashen Gate creatures by CR', {ag:true, entityType:['Creature', 'Monster']}, 'Ashen Gate/Creatures/{crBand}'),
  T(A, 'ag-npc', 'Ashen Gate NPCs', {ag:true}, 'Ashen Gate/NPCs'),
  T(ALL, 'ag-location', 'Locations', {ag:true, entityType:'Location'}, 'Ashen Gate/Locations'),
  T(J, 'ag-gm-notes', 'GM-only journals', {ag:true, visibility:'gm'}, 'Ashen Gate/GM Notes'),
  T(J, 'ag-lore', 'Lore journals', {ag:true, entityType:'Lore'}, 'Ashen Gate/Lore'),
  T(J, 'ag-handouts', 'Player handouts', {ag:true}, 'Ashen Gate/Handouts'),
  T(ALL, 'ag-other', 'Other Ashen Gate records by kind', {ag:true}, 'Ashen Gate/Other/{entityType}'),
  T(I, 'core-spell', 'Spells by level', {ag:false, sourceTagged:true, itemType:'spell'}, 'Core 5.5e/Spells/{spellLevel}'),
  T(I, 'core-magic', 'Magic items by rarity', {ag:false, sourceTagged:true, magic:true}, 'Core 5.5e/Items/{rarity} Magic'),
  T(I, 'core-weapon', 'Weapons', {ag:false, sourceTagged:true, itemType:'weapon'}, 'Core 5.5e/Items/Weapons'),
  T(I, 'core-armor', 'Armor and shields', {ag:false, sourceTagged:true, itemType:'equipment', subtype:['light', 'medium', 'heavy', 'natural', 'shield']}, 'Core 5.5e/Items/Armor'),
  T(I, 'core-consumable', 'Consumables', {ag:false, sourceTagged:true, itemType:'consumable'}, 'Core 5.5e/Items/Consumables'),
  T(I, 'core-tool', 'Tools', {ag:false, sourceTagged:true, itemType:'tool'}, 'Core 5.5e/Items/Tools'),
  T(I, 'core-wondrous', 'Wondrous (no rarity set)', {ag:false, sourceTagged:true, itemType:'equipment', subtype:'wondrous'}, 'Core 5.5e/Items/Wondrous'),
  T(I, 'core-gear', 'Adventuring gear and containers', {ag:false, sourceTagged:true, itemType:['equipment', 'container', 'backpack']}, 'Core 5.5e/Items/Gear'),
  T(I, 'core-loot', 'Loot and treasure', {ag:false, sourceTagged:true, itemType:'loot'}, 'Core 5.5e/Items/Loot'),
  T(I, 'core-feature', 'Feats and features', {ag:false, sourceTagged:true, itemType:'feat'}, 'Core 5.5e/Features'),
  T(I, 'core-options', 'Classes, subclasses, backgrounds, species', {ag:false, sourceTagged:true, itemType:['class', 'subclass', 'background', 'race', 'species']}, 'Core 5.5e/Character Options'),
  T(I, 'homebrew-spell', 'Homebrew spells by level', {ag:false, sourceTagged:false, itemType:'spell'}, 'Homebrew/Spells/{spellLevel}'),
  T(I, 'homebrew-magic', 'Homebrew magic items by rarity', {ag:false, sourceTagged:false, magic:true}, 'Homebrew/Items/{rarity} Magic'),
  T(I, 'homebrew-weapon', 'Homebrew weapons', {ag:false, sourceTagged:false, itemType:'weapon'}, 'Homebrew/Items/Weapons'),
  T(I, 'homebrew-armor', 'Homebrew armor and shields', {ag:false, sourceTagged:false, itemType:'equipment', subtype:['light', 'medium', 'heavy', 'natural', 'shield']}, 'Homebrew/Items/Armor'),
  T(I, 'homebrew-consumable', 'Homebrew consumables', {ag:false, sourceTagged:false, itemType:'consumable'}, 'Homebrew/Items/Consumables'),
  T(I, 'homebrew-tool', 'Homebrew tools', {ag:false, sourceTagged:false, itemType:'tool'}, 'Homebrew/Items/Tools'),
  T(I, 'homebrew-wondrous', 'Homebrew wondrous (no rarity set)', {ag:false, sourceTagged:false, itemType:'equipment', subtype:'wondrous'}, 'Homebrew/Items/Wondrous'),
  T(I, 'homebrew-gear', 'Homebrew adventuring gear and containers', {ag:false, sourceTagged:false, itemType:['equipment', 'container', 'backpack']}, 'Homebrew/Items/Gear'),
  T(I, 'homebrew-loot', 'Homebrew loot and treasure', {ag:false, sourceTagged:false, itemType:'loot'}, 'Homebrew/Items/Loot'),
  T(I, 'homebrew-feature', 'Homebrew feats and features', {ag:false, sourceTagged:false, itemType:'feat'}, 'Homebrew/Features'),
  T(I, 'homebrew-options', 'Homebrew classes, subclasses, backgrounds, species', {ag:false, sourceTagged:false, itemType:['class', 'subclass', 'background', 'race', 'species']}, 'Homebrew/Character Options'),
  T(A, 'core-npc', 'Monsters and NPCs by creature type', {ag:false, actorType:'npc'}, 'Core 5.5e/Actors/{creatureType}'),
  T(A, 'core-npc-other', 'Monsters and NPCs (no creature type)', {ag:false, actorType:'npc'}, 'Core 5.5e/Actors/Other'),
  T(A, 'core-vehicle', 'Vehicles', {ag:false, actorType:'vehicle'}, 'Core 5.5e/Actors/Vehicles')
].map(r => Object.freeze(r)));

export function pathSegments(path) {
  return String(path ?? '').split('/').map(s => s.trim()).filter(Boolean);
}
/** Problems with a rule set (empty = valid). */
export function validateRules(rules) {
  if(!Array.isArray(rules) || !rules.length) return ['The schema needs at least one rule.'];
  const problems = [], ids = new Set();
  rules.forEach((rule, n) => {
    const at = `Rule ${n + 1}${rule?.id ? ` (${rule.id})` : ''}`;
    if(!rule || typeof rule !== 'object') return problems.push(`${at}: must be an object.`);
    if(!/^[a-z0-9][a-z0-9-]{0,59}$/.test(String(rule.id ?? ''))) problems.push(`${at}: id must be lowercase letters, digits or dashes.`);
    else if(ids.has(rule.id)) problems.push(`${at}: id is used twice.`);
    ids.add(rule.id);
    if(rule.types !== undefined && !(Array.isArray(rule.types) && rule.types.length && rule.types.every(t => ORGANIZE_TYPES.includes(t))))
      problems.push(`${at}: types must list Item, Actor and/or JournalEntry.`);
    if(rule.when !== undefined && (typeof rule.when !== 'object' || Array.isArray(rule.when) || rule.when === null)) problems.push(`${at}: when must be an object.`);
    for(const key of Object.keys(rule.when ?? {})) if(!MATCH_KEYS.includes(key)) problems.push(`${at}: unknown match key "${key}".`);
    if(rule.leave) return;
    const segments = pathSegments(rule.path);
    if(!segments.length) problems.push(`${at}: path is required (or "leave": true).`);
    if(segments.length > MAX_DEPTH) problems.push(`${at}: path is deeper than Foundry's ${MAX_DEPTH} folder levels.`);
    for(const [, key] of String(rule.path ?? '').matchAll(/\{(\w+)\}/g)) if(!PLACEHOLDERS.includes(key)) problems.push(`${at}: unknown placeholder {${key}}.`);
  });
  return problems;
}

const norm = v => typeof v === 'string' ? v.toLowerCase() : v;
function conditionHolds(key, want, facts) {
  if(key === 'sourceIdPrefix') return [want].flat().some(p => String(facts.sourceId ?? '').startsWith(p));
  const have = facts[key];
  return [want].flat().some(w => norm(w) === norm(have));
}
/** First matching rule → {rule, path} with placeholders filled; a rule whose placeholder is empty does not match. */
export function matchRule(rules, facts) {
  for(const rule of rules) {
    if(rule.types && !rule.types.includes(facts.documentType)) continue;
    if(!Object.entries(rule.when ?? {}).every(([k, v]) => conditionHolds(k, v, facts))) continue;
    if(rule.leave) return {rule, path:null};
    let missing = false;
    const path = String(rule.path).replace(/\{(\w+)\}/g, (_, key) => {const v = facts[key]; if(v == null || v === '') missing = true; return String(v ?? '');});
    if(missing) continue;
    return {rule, path:pathSegments(path).join('/')};
  }
  return null;
}

const parentId = f => {const p = f?.folder; return (p && typeof p === 'object' ? p.id : p) ?? null;};
const folderIdOf = doc => {const f = doc.folder; return (f && typeof f === 'object' ? f.id : f) ?? null;};

/** Read-only folder index for one document type in one place (world or a pack). */
export function folderIndex(folders) {
  const byId = new Map(folders.map(f => [f.id, f]));
  const pathCache = new Map();
  const pathOf = id => {
    if(!id || !byId.has(id)) return '';
    if(pathCache.has(id)) return pathCache.get(id);
    const f = byId.get(id), up = pathOf(parentId(f));
    const p = up ? `${up}/${f.name}` : f.name;
    pathCache.set(id, p);
    return p;
  };
  const children = new Map();
  for(const f of folders) {const key = JSON.stringify([parentId(f), f.name]); children.set(key, [...(children.get(key) ?? []), f]);}
  /** {folder} when the whole path exists, {missingAt} when part needs creating, {ambiguous} when siblings share a name. */
  const resolve = segments => {
    let parent = null, folder = null;
    for(const [n, name] of segments.entries()) {
      const hits = children.get(JSON.stringify([parent, name])) ?? [];
      if(hits.length > 1) return {ambiguous:segments.slice(0, n + 1).join('/')};
      if(!hits.length) return {missingAt:n};
      folder = hits[0]; parent = folder.id;
    }
    return {folder};
  };
  const protectedIds = new Set();
  const isProtected = id => {
    for(let f = byId.get(id), guard = 0; f && guard < 10; f = byId.get(parentId(f)), guard++)
      if(getPath(f, `flags.${MODULE_ID}.${FLAG_PROTECTED}`)) {protectedIds.add(f.id); return f;}
    return null;
  };
  return {byId, pathOf, resolve, isProtected, protectedIds};
}

/**
 * Plans one source. Pure: reads documents/folders, writes nothing.
 * mode 'misfiled' (default): move unfiled docs and docs already inside the schema's own top folders.
 * mode 'all': refile every matched doc, wherever the GM put it (protected ones still skipped).
 */
export function planSource({documentName, docs, folders, rules, mode = 'misfiled', writable = true, blockedReason = ''}) {
  const index = folderIndex(folders);
  const roots = new Set(rules.filter(r => !r.leave).map(r => pathSegments(r.path)[0]));
  // Manager's own import folders ("Ashen Gate — Imported Items") count as managed too.
  const isManagedRoot = name => roots.has(name) || /^Ashen Gate\b/.test(name ?? '');
  const tierIndex = new Map();
  for(const d of docs) {
    const s = getPath(d, `flags.${MODULE_ID}.source`), t = s?.definition?.tier ?? s?.definition?.tierId;
    if(s?.sourceId && t) tierIndex.set(s.sourceId, t);
  }
  const moves = [], skipped = [], unmatched = [], creates = new Set();
  let inPlace = 0;
  for(const doc of docs) {
    const fromId = folderIdOf(doc);
    const from = index.pathOf(fromId);
    const row = {id:doc._id ?? doc.id, name:doc.name, documentName, fromId, from:from || '(no folder)'};
    if(getPath(doc, `flags.${MODULE_ID}.${FLAG_KEEP}`)) {skipped.push({...row, reason:'Keep my folder is set on this document'}); continue;}
    const guard = fromId && index.isProtected(fromId);
    if(guard) {skipped.push({...row, reason:`In protected folder ${index.pathOf(guard.id)}`}); continue;}
    const facts = factsOf(doc, documentName, tierIndex);
    const hit = matchRule(rules, facts);
    if(!hit) {unmatched.push({...row, reason:'No rule matches'}); continue;}
    if(!hit.path) {skipped.push({...row, reason:hit.rule.label ?? `Left alone by rule ${hit.rule.id}`, rule:hit.rule.id}); continue;}
    if(from === hit.path) {inPlace++; continue;}
    if(mode !== 'all' && fromId && !isManagedRoot(pathSegments(from)[0])) {
      skipped.push({...row, to:hit.path, reason:'In your own folder (use Refile everything to move it)', rule:hit.rule.id}); continue;
    }
    const segments = pathSegments(hit.path);
    const found = index.resolve(segments);
    if(found.ambiguous) {skipped.push({...row, to:hit.path, reason:`Two folders named ${found.ambiguous}; rename one first`, rule:hit.rule.id}); continue;}
    if(found.folder?.id === fromId) {inPlace++; continue;}
    if(found.missingAt !== undefined) for(let n = found.missingAt; n < segments.length; n++) creates.add(segments.slice(0, n + 1).join('/'));
    moves.push({...row, to:hit.path, toId:found.folder?.id ?? null, rule:hit.rule.id});
  }
  const groups = [...moves.reduce((m, r) => m.set(r.to, [...(m.get(r.to) ?? []), r]), new Map())]
    .sort(([a], [b]) => a.localeCompare(b)).map(([path, rows]) => ({path, count:rows.length, rows}));
  return {documentName, writable, blockedReason, moves, groups, skipped, unmatched, inPlace,
    createFolders:[...creates].sort(), protectedFolders:[...index.protectedIds].map(id => index.pathOf(id))};
}

/** Folders with no documents and no sub-folders (report only; Organize never deletes folders). */
export function emptyFolders(folders, docs) {
  const used = new Set(docs.map(folderIdOf).filter(Boolean));
  const parents = new Set(folders.map(parentId).filter(Boolean));
  const index = folderIndex(folders);
  return folders.filter(f => !used.has(f.id) && !parents.has(f.id)).map(f => index.pathOf(f.id)).sort();
}

const INDEX_FIELDS = ['type', 'folder', 'system.rarity', 'system.type', 'system.level', 'system.school', 'system.details.cr', 'system.details.type',
  'system.source', 'flags.plutonium', `flags.${MODULE_ID}`, '_stats.compendiumSource'];

/**
 * Foundry-facing organizer. `updateDocuments(documentName, updates, {pack})` and `createFolder(data, {pack})`
 * are injectable for tests; the defaults call Foundry's own Document classes.
 */
export function createOrganizer({game,
  updateDocuments = (name, updates, opts) => globalThis.CONFIG[name].documentClass.updateDocuments(updates, opts),
  createFolder = (data, opts) => globalThis.CONFIG.Folder.documentClass.create(data, opts)}) {
  const isGM = () => Boolean(game.user?.isGM);
  const collections = {Item:() => game.items, Actor:() => game.actors, JournalEntry:() => game.journal};
  const rules = () => {
    const stored = game.settings.get(MODULE_ID, SCHEMA_SETTING);
    return clone(Array.isArray(stored) && stored.length ? stored : DEFAULT_RULES);
  };
  const history = () => clone(game.settings.get(MODULE_ID, HISTORY_SETTING) ?? []);
  const packList = () => [...(game.packs?.contents ?? game.packs?.values?.() ?? [])].filter(p => ORGANIZE_TYPES.includes(p.documentName));
  const packAccess = pack => {
    if(pack.metadata?.packageType !== 'world') return {writable:false, reason:'Module and system compendiums are inspect-only'};
    if(pack.locked) return {writable:false, reason:'Compendium is locked (unlock it in the Compendium sidebar to organize)'};
    if(!pack.folders) return {writable:false, reason:'This compendium does not support folders'};
    return {writable:true, reason:''};
  };

  function listSources() {
    if(!isGM()) return [];
    return [{key:'world', label:'World (sidebar)', writable:true},
      ...packList().map(p => {const a = packAccess(p); return {key:`pack:${p.collection}`, label:`${p.metadata?.label ?? p.title ?? p.collection} (${p.documentName})`, documentName:p.documentName, writable:a.writable, reason:a.reason};})];
  }
  /** One loaded scope per document type: {documentName, docs, folders, writable, blockedReason, pack}. */
  async function load(source = 'world', types = ORGANIZE_TYPES) {
    if(source === 'world') return types.filter(t => ORGANIZE_TYPES.includes(t)).map(t => ({
      documentName:t, docs:[...(collections[t]()?.contents ?? [])],
      folders:[...(game.folders?.contents ?? game.folders ?? [])].filter(f => f.type === t), writable:true, blockedReason:'', pack:null
    }));
    const pack = packList().find(p => `pack:${p.collection}` === source);
    if(!pack) throw new Error('That compendium is not available.');
    if(!types.includes(pack.documentName)) return [];
    const access = packAccess(pack);
    const index = await pack.getIndex({fields:INDEX_FIELDS});
    return [{documentName:pack.documentName, docs:[...(index?.contents ?? index ?? [])], folders:[...(pack.folders?.contents ?? pack.folders ?? [])],
      writable:access.writable, blockedReason:access.reason, pack}];
  }
  const summarize = parts => ({
    moves:parts.reduce((n, p) => n + p.moves.length, 0), skipped:parts.reduce((n, p) => n + p.skipped.length, 0),
    unmatched:parts.reduce((n, p) => n + p.unmatched.length, 0), inPlace:parts.reduce((n, p) => n + p.inPlace, 0),
    createFolders:parts.reduce((n, p) => n + p.createFolders.length, 0)
  });

  /** Dry run: exactly what Apply would do. Writes nothing. */
  async function preview({source = 'world', types = ORGANIZE_TYPES, mode = 'misfiled'} = {}) {
    if(!isGM()) return fail(GM_ONLY);
    try {
      const schema = rules();
      const parts = (await load(source, types)).map(s => planSource({...s, rules:schema, mode}));
      return {ok:true, source, types, mode, parts, totals:summarize(parts)};
    } catch(error) {return fail(String(error.message ?? error));}
  }

  async function ensurePath(scope, path, cache, created) {
    let parent = null;
    for(const name of pathSegments(path)) {
      const key = JSON.stringify([parent, name]);
      let folder = cache.get(key);
      if(!folder) {
        const hits = scope.folders.filter(f => f.type === scope.documentName && f.name === name && parentId(f) === parent);
        if(hits.length > 1) throw new Error(`Two folders named ${name} share a parent.`);
        folder = hits[0];
        if(!folder) {
          folder = await createFolder({name, type:scope.documentName, folder:parent, sorting:'a'}, scope.pack ? {pack:scope.pack.collection} : {});
          if(!folder?.id) throw new Error(`Could not create folder ${path}.`);
          scope.folders.push(folder);
          created.push({documentName:scope.documentName, id:folder.id, name});
        }
        cache.set(key, folder);
      }
      parent = folder.id;
    }
    return parent;
  }

  /** Re-plans (so it always equals a fresh Preview), creates missing folders, then changes only `folder`. */
  async function apply({source = 'world', types = ORGANIZE_TYPES, mode = 'misfiled'} = {}) {
    if(!isGM()) return fail(GM_ONLY);
    try {
      const schema = rules();
      const scopes = await load(source, types);
      const blocked = scopes.find(s => !s.writable);
      if(blocked) return fail(`${blocked.blockedReason}. Nothing was changed.`);
      const moved = [], created = [];
      for(const scope of scopes) {
        const plan = planSource({...scope, rules:schema, mode});
        if(!plan.moves.length) continue;
        const cache = new Map();
        const updates = [];
        for(const move of plan.moves) {
          const toId = await ensurePath(scope, move.to, cache, created);
          updates.push({_id:move.id, folder:toId});
          moved.push({documentName:scope.documentName, id:move.id, name:move.name, fromId:move.fromId, from:move.from, toId, to:move.to});
        }
        const opts = scope.pack ? {pack:scope.pack.collection} : {};
        for(let n = 0; n < updates.length; n += 250) await updateDocuments(scope.documentName, updates.slice(n, n + 250), opts);
      }
      if(moved.length) {
        const entry = {at:new Date().toISOString(), source, types, mode, moves:moved, createdFolders:created};
        await game.settings.set(MODULE_ID, HISTORY_SETTING, [entry, ...history()].slice(0, HISTORY_LIMIT));
      }
      const after = await load(source, types);
      return {ok:true, moved:moved.length, createdFolders:created.length, moves:moved,
        emptyFolders:after.flatMap(s => emptyFolders(s.folders, s.docs).map(path => `${s.documentName}: ${path}`)),
        message:moved.length ? `Moved ${moved.length} document(s); created ${created.length} folder(s).` : 'Everything is already in place. Nothing changed.'};
    } catch(error) {return fail(`Organize stopped: ${error.message ?? error}`);}
  }

  /** Puts documents from the last run back where they were, if they are still where Organize put them. */
  async function undoLast() {
    if(!isGM()) return fail(GM_ONLY);
    const [last, ...rest] = history();
    if(!last) return fail('There is no organize run to undo.');
    try {
      const scopes = await load(last.source, last.types);
      const blocked = scopes.find(s => !s.writable);
      if(blocked) return fail(`${blocked.blockedReason}. Nothing was changed.`);
      let restored = 0;
      const notes = [];
      for(const scope of scopes) {
        const docs = new Map(scope.docs.map(d => [d._id ?? d.id, d]));
        const folderIds = new Set(scope.folders.map(f => f.id));
        const updates = [];
        for(const move of last.moves.filter(m => m.documentName === scope.documentName)) {
          const doc = docs.get(move.id);
          if(!doc) {notes.push(`${move.name}: no longer exists`); continue;}
          if(folderIdOf(doc) !== move.toId) {notes.push(`${move.name}: moved since, left where it is`); continue;}
          if(move.fromId && !folderIds.has(move.fromId)) {notes.push(`${move.name}: original folder was deleted, left where it is`); continue;}
          updates.push({_id:move.id, folder:move.fromId ?? null});
        }
        const opts = scope.pack ? {pack:scope.pack.collection} : {};
        for(let n = 0; n < updates.length; n += 250) await updateDocuments(scope.documentName, updates.slice(n, n + 250), opts);
        restored += updates.length;
      }
      await game.settings.set(MODULE_ID, HISTORY_SETTING, rest);
      return {ok:true, restored, notes, message:`Put ${restored} document(s) back.${notes.length ? ` ${notes.length} left as they are.` : ''} Folders Organize created are kept (empty ones are listed after the next Preview).`};
    } catch(error) {return fail(`Undo stopped: ${error.message ?? error}`);}
  }

  /** Backup of current folder assignments for everything the plan would move. */
  function backupOf(result) {
    return {kind:'ashen-gate-organize-backup', module:MODULE_ID, at:new Date().toISOString(), source:result.source, mode:result.mode,
      documents:result.parts.flatMap(p => p.moves.map(m => ({documentName:p.documentName, id:m.id, name:m.name, folderId:m.fromId, folder:m.from, plannedFolder:m.to})))};
  }

  async function saveSchema(list) {
    if(!isGM()) return fail(GM_ONLY);
    const problems = validateRules(list);
    if(problems.length) return fail(problems.slice(0, 5).join(' '));
    await game.settings.set(MODULE_ID, SCHEMA_SETTING, clone(list));
    return {ok:true};
  }
  async function resetSchema() {
    if(!isGM()) return fail(GM_ONLY);
    await game.settings.set(MODULE_ID, SCHEMA_SETTING, []);
    return {ok:true};
  }
  const getSchema = () => isGM() ? {ok:true, rules:rules(), isDefault:!(game.settings.get(MODULE_ID, SCHEMA_SETTING) ?? []).length} : fail(GM_ONLY);

  /** Marks (or clears) a folder as protected. This writes only the Folder's own flag. */
  async function setFolderProtected(folder, value) {
    if(!isGM()) return fail(GM_ONLY);
    if(!folder?.setFlag) return fail('Folder not found.');
    if(value) await folder.setFlag(MODULE_ID, FLAG_PROTECTED, true); else await folder.unsetFlag(MODULE_ID, FLAG_PROTECTED);
    return {ok:true};
  }
  /** Per-document "keep my folder". Writes only that flag. */
  async function setKeepFolder(doc, value) {
    if(!isGM()) return fail(GM_ONLY);
    if(!doc?.setFlag) return fail('Document not found.');
    if(value) await doc.setFlag(MODULE_ID, FLAG_KEEP, true); else await doc.unsetFlag(MODULE_ID, FLAG_KEEP);
    return {ok:true};
  }

  /** Read-only housekeeping report: duplicate stable ids and likely temporary records. Never changes anything. */
  async function housekeeping({packs = true} = {}) {
    if(!isGM()) return fail(GM_ONLY);
    const seen = new Map(), temporary = [], drafts = [];
    const note = (where, documentName, doc) => {
      const source = getPath(doc, `flags.${MODULE_ID}.source`);
      if(source?.sourceId) seen.set(source.sourceId, [...(seen.get(source.sourceId) ?? []), {where, documentName, name:doc.name, id:doc._id ?? doc.id}]);
      const facts = factsOf(doc, documentName);
      if(facts.test) temporary.push({where, documentName, name:doc.name, sourceId:facts.sourceId, why:/^\s*\[TEST\]/i.test(doc.name ?? '') ? '[TEST] name' : 'example_only'});
      else if(source?.status === 'draft') drafts.push({where, documentName, name:doc.name, sourceId:facts.sourceId});
    };
    for(const scope of await load('world')) scope.docs.forEach(d => note('World', scope.documentName, d));
    if(packs) for(const pack of packList()) {
      try {const idx = await pack.getIndex({fields:INDEX_FIELDS}); for(const d of idx?.contents ?? idx ?? []) note(pack.metadata?.label ?? pack.collection, pack.documentName, d);}
      catch(error) {console.warn(`[${MODULE_ID}] Housekeeping could not read ${pack.collection}`, error);}
    }
    const duplicates = [...seen].filter(([, rows]) => rows.length > 1).map(([sourceId, rows]) => ({sourceId, count:rows.length, rows})).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    return {ok:true, duplicates, temporary, drafts};
  }

  return {listSources, preview, apply, undoLast, backupOf, history:() => isGM() ? history() : [], getSchema, saveSchema, resetSchema,
    setFolderProtected, setKeepFolder, housekeeping};
}
