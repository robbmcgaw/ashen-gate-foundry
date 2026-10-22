/**
 * World export: one GM-only JSON file of every Ashen Gate tagged world document plus the definitions the other
 * modules expose through their public GM-only APIs. Definitions only: no actor progress, stash, party notes or
 * quest status. Pure logic with injected Foundry globals so the Node suite can cover it.
 */
export const EXPORT_SCHEMA = 'ag-world-export/0.1';
export const SNAPSHOT_SETTING = 'worldExportSnapshot';
const MODULE_ID = 'ashen-gate-manager';
const DOC_TYPES = ['Item', 'JournalEntry', 'Actor', 'RollTable', 'Macro'];
const COLLECTIONS = {Item: 'items', JournalEntry: 'journal', Actor: 'actors', RollTable: 'tables', Macro: 'macros'};
export const MANAGER_FOLDER_NAMES = Object.freeze({Item: 'Ashen Gate — Imported Items', JournalEntry: 'Ashen Gate — Imported Journals',
  Actor: 'Ashen Gate — Imported Actors', RollTable: 'Ashen Gate — Imported Roll Tables', Macro: 'Ashen Gate — Imported Macros'});
/** Actor types whose system data is play state (HP, spell slots, currency), so it is never exported. */
const PLAY_ACTOR_TYPES = new Set(['character', 'group']);
/** Keys that hold play or edit-session state inside another module's definition records; dropped at any depth. */
const PLAY_KEYS = new Set(['exhausted', 'available', 'lock', 'updatedBy', 'updatedAt', 'rev', 'partyNotes', 'progress', 'stash',
  'party_notes', 'play_state', 'sceneUuids']);
const AG_MODULES = ['ashen-gate-manager', 'ashen-gate-locations', 'ashen-gate-quest-manager', 'ashen-gate-factions',
  'ashen-gate-skill-trees', 'ashen-gate-headquarters', 'ashen-gate-profession-ledger', 'ashen-gate-utilities'];

/** Deep copy with object keys sorted, so the same data always serialises the same way. */
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) if (value[key] !== undefined) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}
export const stableStringify = value => JSON.stringify(sortKeys(value));

/** Short change-detection hash (two 53-bit cyrb53 passes). Not cryptographic; it only has to notice edits. */
export function contentHash(value) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, g1 = 0x9e3779b9, g2 = 0x85ebca6b;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
    g1 = Math.imul(g1 ^ c, 2246822507); g2 = Math.imul(g2 ^ c, 3266489909);
  }
  const mix = (a, b) => {
    a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
    b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
    return (4294967296 * (2097151 & b) + (a >>> 0)).toString(16).padStart(14, '0');
  };
  return `h1:${mix(h1, h2)}${mix(g1, g2)}`;
}

/** Removes play and edit-session state from a definition record (loot status is play state too). */
export function stripPlayState(value, key = '') {
  if (Array.isArray(value)) return value.map(v => stripPlayState(v, key));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (PLAY_KEYS.has(k)) continue;
    if (key === 'loot' && k === 'status') continue;
    out[k] = stripPlayState(v, k);
  }
  return out;
}

const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const folderChain = doc => {
  const names = [];
  for (let f = doc.folder && typeof doc.folder === 'object' ? doc.folder : null, n = 0; f && n < 20; f = f.folder && typeof f.folder === 'object' ? f.folder : null, n++) names.unshift(f.name);
  return names.join('/');
};
const OBSERVER = 2;
const accessOf = doc => (doc.ownership?.default ?? 0) >= OBSERVER ? 'visible' : 'gm';

/** A document is Ashen Gate tagged when Manager's source flag carries a permanent source id. */
export const sourceFlagOf = doc => doc?.flags?.[MODULE_ID]?.source ?? doc?.getFlag?.(MODULE_ID, 'source') ?? null;
export const isTagged = doc => Boolean(sourceFlagOf(doc)?.sourceId);

function docRecord(doc) {
  const source = sourceFlagOf(doc);
  const data = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const system = doc.documentName === 'Actor' && PLAY_ACTOR_TYPES.has(doc.type) ? undefined : plain(data.system);
  const flags = plain(data.flags?.[MODULE_ID] ?? doc.flags?.[MODULE_ID] ?? {});
  // NPC Codex reveals, learned text and GM notes are play state (0.33.0); the Codex export carries them.
  delete flags.codex;
  const body = {kind: doc.documentName, type: doc.type ?? null, name: doc.name, folder_path: folderChain(doc), access: accessOf(doc),
    visibility: source.visibility ?? null, flags: {[MODULE_ID]: flags}, ...(system !== undefined ? {system} : {system_omitted: 'actor play state'})};
  return {key: `world/${doc.documentName}/${source.sourceId}`, section: 'world', id: source.sourceId, name: doc.name,
    hash: contentHash(body), uuid: doc.uuid ?? null, ...body};
}

function folderRecords(game, docs) {
  const folders = [...(game.folders?.contents ?? game.folders ?? [])];
  const used = new Set();
  for (const doc of docs) for (let f = doc.folder && typeof doc.folder === 'object' ? doc.folder : null, n = 0; f && n < 20; f = f.folder && typeof f.folder === 'object' ? f.folder : null, n++) used.add(f.id ?? f.name);
  const roots = new Set(Object.values(MANAGER_FOLDER_NAMES));
  return folders.filter(f => used.has(f.id ?? f.name) || roots.has(f.name)).map(f => {
    const path = folderChain({folder: f}).split('/').filter(Boolean);
    const body = {kind: 'Folder', type: f.type ?? null, name: f.name, folder_path: path.slice(0, -1).join('/')};
    const fid = `${f.type}:${path.join('/')}`;
    return {key: `world/Folder/${fid}`, section: 'world', id: fid, name: f.name, hash: contentHash(body), uuid: f.uuid ?? null, ...body};
  });
}

/** Every Ashen Gate tagged world document (plus the folders Manager made for them), sorted by key. */
export function collectWorldRecords(game) {
  const docs = [];
  for (const type of DOC_TYPES) docs.push(...(game[COLLECTIONS[type]]?.contents ?? []).filter(isTagged));
  return [...docs.map(docRecord), ...folderRecords(game, docs)].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

const record = (section, id, name, data) => {
  const clean = sortKeys(stripPlayState(plain(data)));
  return {key: `${section}/${id}`, section, id, name: name ?? id, hash: contentHash(clean), data: clean};
};
const byKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
const activeApi = (game, id) => { const mod = game.modules?.get?.(id); return mod?.active ? {mod, api: mod.api ?? null} : {mod, api: null}; };

/** One section per partner module. A missing, inactive or too-old module is listed as not available, never an error. */
export function collectModuleSections(game) {
  const sections = {};
  const run = (name, id, need, build) => {
    const {mod, api} = activeApi(game, id);
    const head = {module_id: id, version: mod?.version ?? null};
    if (!mod?.active) { sections[name] = {...head, status: 'not available', reason: mod ? 'module is not active' : 'module is not installed', records: []}; return; }
    if (!api || need.some(fn => typeof fn(api) !== 'function')) { sections[name] = {...head, status: 'not available', reason: 'module has no export API (too old?)', records: []}; return; }
    try { sections[name] = {...head, status: 'ok', records: build(api).sort(byKey)}; }
    catch (error) { sections[name] = {...head, status: 'not available', reason: String(error?.message ?? error), records: []}; }
  };
  run('locations', 'ashen-gate-locations', [a => a.listLocations], api => api.listLocations().map(l => record('locations', l.id, l.name, l)));
  // Routes (GM records, endpoints by LOC id) when Locations has listRoutes (old 1.10.0+, every 0.18.0+). Otherwise not available.
  // Discovery, audience, the player-page key and the map-drawing binding are play/world state, not the definition.
  run('routes', 'ashen-gate-locations', [a => a.listRoutes], api => api.listRoutes().map(({viewKey, drawingUuid, state, audience, unknownPath, legs, legKmInEffect, ...r}) =>
    record('routes', r.id, r.name || r.id, {entity_type: 'Route', ...r})));
  run('quests', 'ashen-gate-quest-manager', [a => a.listQuests, a => a.getGMSource],
    api => api.listQuests().map(q => record('quests', q.id, q.name, {definitionStatus: q.definitionStatus, kind: q.kind, source: api.getGMSource(q.id)})));
  run('factions', 'ashen-gate-factions', [a => a.getFactions], api => api.getFactions().map(f => record('factions', f.id, f.name, f)));
  // Renown 0.11.0+: deities (GM gets source definitions; getFactions never lists them). Older Renown: listed as not available.
  run('deities', 'ashen-gate-factions', [a => a.getDeities], api => api.getDeities().map(d => record('deities', d.id, d.name, d)));
  run('skill_trees', 'ashen-gate-skill-trees', [a => a.listTrees], api => api.listTrees().map(t => record('skill_trees', t.id, t.name, t)));
  run('headquarters', 'ashen-gate-headquarters', [a => a.exportState], api => {
    const catalog = api.exportState()?.catalog;
    if (!Array.isArray(catalog)) throw new Error('no facility catalog in the exported state');
    return catalog.map(f => record('headquarters', f.id, f.name, f));
  });
  const {mod} = activeApi(game, 'ashen-gate-profession-ledger');
  sections.profession_ledger = {module_id: 'ashen-gate-profession-ledger', version: mod?.version ?? null,
    status: mod?.active ? 'no definitions to export' : 'not available',
    reason: 'Ledger progress is campaign state and is not exported; profession, recipe and perk definitions are the tagged world Items under "world".', records: []};
  return sections;
}

/** Compare current records with the last snapshot ({key: {hash, section}}; names are never stored, an old snapshot that still has them is read fine and rewritten without). Null snapshot = first run, all new. */
export function diffRecords(records, snapshot) {
  const prev = snapshot?.records ?? null;
  const now = new Map(records.map(r => [r.key, r]));
  const added = [], changed = [], removed = [];
  for (const r of records) {
    if (!prev || !prev[r.key]) added.push(r.key);
    else if (prev[r.key].hash !== r.hash) changed.push(r.key);
  }
  if (prev) for (const key of Object.keys(prev)) if (!now.has(key)) removed.push(key);
  return {firstRun: !prev, new: added.sort(), changed: changed.sort(), removed: removed.sort(),
    removedInfo: removed.sort().map(key => ({key, id: idOfKey(key), section: prev[key].section ?? key.split('/')[0]}))};
}

export const makeSnapshot = (records, date) => ({schema: EXPORT_SCHEMA, date,
  records: Object.fromEntries(records.map(r => [r.key, {hash: r.hash, section: r.section}]))});

const sectionOfKey = key => key.split('/')[0];
const idOfKey = key => { const p = key.split('/'); return (p[0] === 'world' ? p.slice(2) : p.slice(1)).join('/'); };
/** Counts per module/section of new, changed and removed records. */
export function summarize(diff, records, sections) {
  const rows = {};
  const bump = (key, field) => { const s = sectionOfKey(key); (rows[s] ??= {total: 0, new: 0, changed: 0, removed: 0}); rows[s][field]++; };
  for (const r of records) (rows[r.section] ??= {total: 0, new: 0, changed: 0, removed: 0}).total++;
  diff.new.forEach(k => bump(k, 'new')); diff.changed.forEach(k => bump(k, 'changed')); diff.removed.forEach(k => bump(k, 'removed'));
  for (const name of Object.keys(sections)) rows[name] ??= {total: 0, new: 0, changed: 0, removed: 0};
  return Object.fromEntries(Object.keys(rows).sort().map(k => [k, {...rows[k], ...(sections[k] && sections[k].status !== 'ok' ? {status: sections[k].status} : {})}]));
}

export function summaryText(header, diff, counts) {
  const lines = [`Ashen Gate world export (${header.mode}) — ${header.world.title ?? header.world.id}, ${header.date}`];
  if (diff.firstRun) lines.push('First export: everything counts as new.');
  for (const [name, c] of Object.entries(counts)) {
    lines.push(c.status ? `${name}: ${c.status}` : `${name}: ${c.total} records — ${c.new} new, ${c.changed} changed, ${c.removed} removed`);
  }
  const ids = (label, keys) => keys.length ? [`${label}: ${keys.map(idOfKey).join(', ')}`] : [];
  lines.push(...ids('New', diff.new), ...ids('Changed', diff.changed), ...ids('Removed', diff.removed));
  return lines.join('\n');
}

/** Builds the export object and its diff. GM-only: rejects anyone else here, not just in the UI. */
export function buildWorldExport(game, {mode = 'everything', snapshot = null, now = new Date()} = {}) {
  if (!game?.user?.isGM) throw new Error('Only the GM can export Ashen Gate data.');
  if (!['everything', 'changed'].includes(mode)) throw new Error(`Unknown export mode ${mode}.`);
  const sections = collectModuleSections(game);
  const world = collectWorldRecords(game);
  const all = [...world, ...Object.values(sections).flatMap(s => s.records)].sort(byKey);
  const diff = diffRecords(all, snapshot);
  const date = now.toISOString().slice(0, 10);
  const keep = mode === 'everything' || diff.firstRun ? null : new Set([...diff.new, ...diff.changed]);
  const pick = list => keep ? list.filter(r => keep.has(r.key)) : list;
  const strip = ({key, section, ...rest}) => rest;
  const modules = Object.fromEntries(AG_MODULES.map(id => [id, game.modules?.get?.(id)?.version ?? null]).sort());
  const header = {schema: EXPORT_SCHEMA, date, mode: keep ? 'changed' : mode,
    ...(mode === 'changed' && diff.firstRun ? {note: 'First export: no earlier snapshot, so everything is included.'} : {}),
    world: {id: game.world?.id ?? null, title: game.world?.title ?? null},
    versions: {foundry: game.version ?? game.release?.version ?? null, dnd5e: game.system?.version ?? null, modules}};
  const counts = summarize(diff, all, sections);
  const file = {header, summary: counts,
    world: pick(world).map(strip),
    modules: Object.fromEntries(Object.entries(sections).sort(([a], [b]) => a < b ? -1 : 1)
      .map(([name, s]) => [name, {...s, records: pick(s.records).map(strip)}])),
    ...(keep || diff.removed.length ? {removed: diff.removedInfo.map(({id, section}) => ({id, section}))} : {})};
  return {file: sortKeys(file), diff, counts, snapshot: makeSnapshot(all, date), summary: summaryText(header, diff, counts),
    filename: `AG_World_Export_${date}${keep ? '_changed' : ''}.json`};
}

/** Saves the file through Foundry, then (only after that returned) stores the snapshot for the next "changed" run. */
export async function saveWorldExport(game, {mode, save, now} = {}) {
  const snapshot = game.settings.get(MODULE_ID, SNAPSHOT_SETTING);
  const out = buildWorldExport(game, {mode, snapshot: snapshot && snapshot.records ? snapshot : null, now});
  save(out.filename, out.file);
  await game.settings.set(MODULE_ID, SNAPSHOT_SETTING, out.snapshot);
  return out;
}

/**
 * Back up before play: the same "everything" export, saved as AG_Backup_<date>.json. GM-only (buildWorldExport
 * rejects anyone else). Read-only: it never reads or writes the export snapshot, so "changed since last export"
 * still compares with the last real export.
 */
export function buildBackup(game, {now = new Date()} = {}) {
  const out = buildWorldExport(game, {mode: 'everything', snapshot: null, now});
  const date = out.file.header.date;
  const lines = [`Ashen Gate backup — ${game.world?.title ?? game.world?.id}, ${date}`,
    ...Object.entries(out.counts).map(([name, c]) => c.status ? `${name}: ${c.status}` : `${name}: ${c.total} records`)];
  return {file: sortKeys({...out.file, header: {...out.file.header, purpose: 'backup'}}), filename: `AG_Backup_${date}.json`, summary: lines.join('\n')};
}
export function saveBackup(game, {save, now} = {}) {
  const out = buildBackup(game, {now});
  save(out.filename, out.file);
  return out;
}
