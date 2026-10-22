/**
 * Items tab (0.36.0): the shared filters every Items rail entry uses (search sits in browse.js), and the rail
 * itself. Pure: no Foundry globals, so the Node suite covers it.
 *
 * Origin is read from data the importers already write, never guessed from names:
 *   Ashen Gate      Manager's source flag (flags.ashen-gate-manager.source.sourceId)
 *   DDB / Plutonium flags.ddbimporter (D&D Beyond Importer) or flags.plutonium
 *   Core 2024/2014  positive core evidence (core-links.js coreEvidence, same as Organize): a core source book, a dnd5e
 *                   system pack or a copy from one. dnd5e's default system.source.rules alone is not evidence (0.38.1)
 *   Homebrew        everything else
 */
import {getPath} from './core.js';
import {coreEvidence, coreRefOf} from './core-links.js';

const MODULE_ID = 'ashen-gate-manager';

export const ORIGINS = Object.freeze({ag: 'Ashen Gate', core24: 'Core 2024', core14: 'Core 2014', ddb: 'DDB / Plutonium', homebrew: 'Homebrew'});
/** dnd5e rarity keys (lower case, no spaces) in display order. Colours are the --ag-rarity-* kit tokens (ag-ui.css). */
export const RARITIES = Object.freeze({common: 'Common', uncommon: 'Uncommon', rare: 'Rare', veryrare: 'Very rare', legendary: 'Legendary', artifact: 'Artifact'});
/** Index fields a compendium read needs so pack entries can be filtered like world documents. */
export const FILTER_INDEX_FIELDS = Object.freeze(['system.source', 'flags.plutonium', 'flags.ddbimporter', '_stats.compendiumSource']);

/** "veryRare", "very rare" → "veryrare"; anything not a dnd5e rarity → null. */
export function rarityKey(value) {
  const k = String(value ?? '').replace(/[\s_-]+/g, '').toLowerCase();
  return Object.hasOwn(RARITIES, k) ? k : null;
}

/** Which origin a world document or compendium index entry belongs to. `packId` is set for compendium entries. */
export function originOf(data, packId = null) {
  if (getPath(data, `flags.${MODULE_ID}.source.sourceId`)) return 'ag';
  if (getPath(data, 'flags.ddbimporter') || getPath(data, 'flags.plutonium')) return 'ddb';
  // 0.38.1: positive core evidence only (a core book, a dnd5e pack or a copy from one); dnd5e's default rules value is not.
  // dnd5e's own packs: the 2024 ones end in 24 (as Core Links reads them); the rest are the 2014 SRD.
  const evidence = coreEvidence(data, packId);
  if (evidence.core) return evidence.edition === '2014' ? 'core14' : 'core24';
  return 'homebrew';
}

/** Folder ids from the document's own folder up to the root (empty when unfiled). `lookup` resolves an id to its Folder. */
export function folderChain(folder, lookup = () => null) {
  const ids = [];
  let f = folder && typeof folder === 'object' ? folder : lookup(folder);
  for (let n = 0; f && n < 10; n++) {
    if (f.id ?? f._id) ids.push(f.id ?? f._id);
    const up = f.folder;
    f = up && typeof up === 'object' ? up : up ? lookup(up) : null;
  }
  return ids;
}

/** The filter facts for one document or index entry. Browse entries carry these same fields. */
export function itemFacts(data, {packId = null, lookupFolder = () => null} = {}) {
  return {
    source: packId ?? 'world',
    docType: data?.type ?? null,
    origin: originOf(data, packId),
    rarity: rarityKey(getPath(data, 'system.rarity')),
    coreRef: Boolean(coreRefOf(data)),
    folderIds: folderChain(data?.folder, lookupFolder)
  };
}

export const DEFAULT_FILTERS = Object.freeze({query: '', source: 'all', type: 'all', origin: 'all', rarity: 'all', folder: 'all', coreRef: false});
const set = v => v !== undefined && v !== null && v !== '' && v !== 'all';

/** How many shared filters are on (search counts as one). */
export function activeFilterCount(f = {}) {
  return ['source', 'type', 'origin', 'rarity', 'folder'].filter(k => set(f[k])).length + (f.coreRef ? 1 : 0) + (String(f.query ?? '').trim() ? 1 : 0);
}

/**
 * true when an entry passes the shared source/type/origin/rarity/folder/core_ref filters (search is matched by
 * browse.js). Entries with no source (partner records with no document) only pass when source is "all".
 */
export function sharedMatch(e, f = {}) {
  if (set(f.source) && (e.source ?? null) !== f.source) return false;
  if (set(f.type) && (e.docType ?? null) !== f.type) return false;
  if (set(f.origin) && (e.origin ?? null) !== f.origin) return false;
  if (set(f.rarity) && (e.rarity ?? null) !== f.rarity) return false;
  if (set(f.folder) && !(e.folderIds ?? []).includes(f.folder)) return false;
  if (f.coreRef && !e.coreRef) return false;
  return true;
}

/**
 * Items sub-tabs (0.46.0: text sub-tabs, was an icon rail). Ids are unchanged so saved views and links keep working.
 * NPC Codex is its own top-level tab and Adopt & tag moved to GM Setup → Developer Tools (see resolveTab).
 * `filters` marks the views the shared filter toolbar applies to.
 */
export const ITEM_VIEWS = Object.freeze([
  {id: 'all', label: 'Browse', icon: 'fa-solid fa-magnifying-glass', filters: true},
  {id: 'records', label: 'Records', icon: 'fa-solid fa-list', filters: true},
  {id: 'folders', label: 'Folders', icon: 'fa-solid fa-folder-tree', filters: true},
  {id: 'corelinks', label: 'Core links', icon: 'fa-solid fa-link', filters: true},
  {id: 'checks', label: 'Checks', icon: 'fa-solid fa-stethoscope', filters: false},
  {id: 'export', label: 'Export', icon: 'fa-solid fa-file-export', filters: false}
].map(v => Object.freeze(v)));
/** Top-level tabs (0.46.0), GM Setup last. Import history is a sub-tab of Import. */
export const MANAGER_TABS = Object.freeze([
  {id: 'import', label: 'Import', icon: 'fa-solid fa-file-import'},
  {id: 'items', label: 'Items', icon: 'fa-solid fa-boxes-stacked'},
  {id: 'codex', label: 'NPC Codex', icon: 'fa-solid fa-address-book'},
  {id: 'modules', label: 'Modules', icon: 'fa-solid fa-grip'},
  {id: 'scenes', label: 'Scenes', icon: 'fa-solid fa-cloud-sun'},
  {id: 'setup', label: 'GM Setup', icon: 'fa-solid fa-gears', gm: true}
].map(v => Object.freeze(v)));
export const IMPORT_VIEWS = Object.freeze(['package', 'history']);
export const SETUP_VIEWS = Object.freeze(['general', 'sources', 'developer']);
/** Pre-0.36.0 Library rail ids → Items views (codex and adopt now live elsewhere; resolveTab moves them). */
const LIBRARY_SECTION_VIEW = Object.freeze({records: 'records', check: 'checks', export: 'export', adopt: 'adopt', codex: 'codex'});

/**
 * Old tab and view ids keep working (saved links, other modules, macros): browse → Items → Browse, library → Items →
 * Records (or the Library rail section it was on), organize → Folders, corelinks → Core links, history → Import →
 * Import history, appearance (a tab until 0.38.0, then a header menu until 0.46.0) → GM Setup → General. The Items
 * views codex and adopt (until 0.46.0) open the NPC Codex tab and GM Setup → Developer Tools. Extra keys
 * (importView, setupTab) are only present when the old id asked for a sub-tab. Anything else is unchanged.
 */
export function resolveTab(tab, {view = 'all', librarySection = null} = {}) {
  const known = id => ITEM_VIEWS.some(v => v.id === id);
  const items = v => v === 'codex' ? {tab: 'codex', view: 'all'} : v === 'adopt' ? {tab: 'setup', view: 'all', setupTab: 'developer'} : {tab: 'items', view: known(v) ? v : 'all'};
  const keep = known(view) ? view : 'all';
  switch (tab) {
    case 'appearance': return {tab: 'setup', view: keep, setupTab: 'general'};
    case 'history': return {tab: 'import', view: keep, importView: 'history'};
    case 'browse': return {tab: 'items', view: 'all'};
    case 'library': return items(LIBRARY_SECTION_VIEW[librarySection] ?? 'records');
    case 'organize': return {tab: 'items', view: 'folders'};
    case 'corelinks': return {tab: 'items', view: 'corelinks'};
    case 'items': return items(view);
    default: return {tab: MANAGER_TABS.some(t => t.id === tab) ? tab : 'import', view: keep};
  }
}
