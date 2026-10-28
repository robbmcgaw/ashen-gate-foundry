/**
 * Export edited records (0.77.0): one GM-only JSON file (`ag-world-edits/0.1`) of the managed world documents the GM changed since
 * their import, in the shape of the import records, so the content pack can be updated from what was edited in Foundry.
 * Format: docs/world-edits-export.md. Pure logic with injected Foundry globals so the Node suite covers it. READ-ONLY: nothing here
 * writes a document, a flag or a setting.
 *
 * "Edited" is Sync's own judgement (sync.js editedFields: the live value is neither the last import's value nor a value Foundry
 * normalised), plus the embedded parts Sync diffs per piece (Journal pages, Roll Table results, an Actor's package Items, an Item's
 * Manager-made effects). Play state (Actor HP, spell slots, currency, resources, the biography), art, ownership, folders, ids, uuids,
 * sort and stats are never read into the record: an unedited field is written from the import baseline, an edited one from the world.
 */
import {MODULE_ID, getPath, isPlainObject, equal} from './core.js';
import {editedFields, makeSnapshot, sameText, equivalentValue, markerTextMatches} from './sync.js';
import {isArtPath} from './art-fields.js';
import {itemKeys, keyOf, itemLeaves, ITEM_PLAY_STATE} from './actor-update.js';
import {effectFlagOf, effectFields, liveEffectValue, upgradeBaseline} from './item-effects.js';
import {normalizePackageResult, normalizeLiveResult} from './table-results.js';
import {stripRelated} from './related-lists.mjs';
import {neutralLabel} from './reference-links.mjs';
import {readStoredDefinition} from './source-projection.mjs';

export const EDITS_SCHEMA = 'ag-world-edits/0.1';
export const EDIT_TYPES = Object.freeze(['Item', 'JournalEntry', 'Actor', 'RollTable', 'Macro']);
export const TYPE_LABELS = Object.freeze({Item: 'Items', JournalEntry: 'Journals', Actor: 'NPC Actors', RollTable: 'Roll Tables', Macro: 'Macros'});
const COLLECTIONS = {Item: 'items', JournalEntry: 'journal', Actor: 'actors', RollTable: 'tables', Macro: 'macros'};
/** Actor types that are player characters or groups: never read, never exported. */
const PC_ACTOR_TYPES = new Set(['character', 'group']);
const NO_BASELINE = '(no import baseline)';
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const emptyObject = v => isPlainObject(v) && !Object.keys(v).length;
const asList = c => [...(c?.contents ?? c ?? [])];

function setPath(target, path, value) {
  const keys = path.split('.');
  let o = target;
  for (const k of keys.slice(0, -1)) o = (isPlainObject(o[k]) ? o[k] : (o[k] = {}));
  o[keys.at(-1)] = value;
}
const unescapeLabel = t => String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const marker = (id, label) => {
  const text = label == null ? '' : unescapeLabel(label);
  return `[[AGREF:${id}${text && text !== id && text !== neutralLabel(id) ? `|${text}` : ''}]]`;
};

/** Pack-side text: the generated Related list is dropped and Manager's links in the world turn back into [[AGREF:ID|label]] markers. */
export function packText(text, idOfUuid) {
  if (typeof text !== 'string') return text;
  let out = stripRelated(text);
  if (out.includes('@UUID[')) out = out.replace(/@UUID\[([^\]]+)\]\{([^}]*)\}/g, (m, uuid, label) => idOfUuid.has(uuid) ? marker(idOfUuid.get(uuid), label) : m);
  if (out.includes('@AGRef[')) out = out.replace(/@AGRef\[([^\]]+)\](?:\{([^}]*)\})?/g, (m, id, label) => marker(id, label));
  return out;
}
const packDeep = (value, idOfUuid) => Array.isArray(value) ? value.map(v => packDeep(v, idOfUuid))
  : isPlainObject(value) ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, packDeep(v, idOfUuid)])) : packText(value, idOfUuid);

/** Same judgement as Sync, widened by the pack-side text rule: equal when Sync calls them equal or they read the same once links are markers. */
function sameValue(path, live, base, idOfUuid) {
  if (equal(live ?? null, base ?? null) || equivalentValue(path, live, base) || sameText(live, base)) return true;
  if (typeof live === 'string' && typeof base === 'string') {
    if (markerTextMatches(live, base, idOfUuid)) return true;
    return packText(live, idOfUuid) === packText(base, idOfUuid);
  }
  return equal(packDeep(live ?? null, idOfUuid), packDeep(base ?? null, idOfUuid));
}

const normLines = s => String(s ?? '').replace(/\r\n?/g, '\n');

// ---------- what changed, per kind ----------
function topLevelEdits(snap, idOfUuid) {
  const base = snap.flag.managedFields, raw = snap.raw, kind = snap.documentName;
  const out = [];
  for (const path of editedFields(null, snap)) {
    if (isArtPath(path)) continue; // "art is always yours" (art-fields.js): never an edit
    if (kind === 'RollTable' && path === 'results') continue; // compared result by result below
    if (kind === 'Macro' && path === 'command') { if (normLines(getPath(raw, path)) === normLines(base[path])) continue; out.push(path); continue; }
    const live = getPath(raw, path);
    if (sameValue(path, live, base[path], idOfUuid)) continue;
    out.push(path);
  }
  return out;
}

const pageKeys = names => { const seen = new Map(); return names.map(n => { const c = (seen.get(n) ?? 0) + 1; seen.set(n, c); return c === 1 ? n : `${n}#${c}`; }); };
const objects = list => (Array.isArray(list) ? list : []).filter(v => v && typeof v === 'object');

/** Journal pages: {data pages, changed}. Pages match by name (a repeat is #2, #3), as Sync matches them. */
function journalPages(snap, idOfUuid) {
  const baseDefs = objects(snap.flag.pagesDefinition), baseKeys = pageKeys(baseDefs.map(p => p.name));
  const live = objects(snap.raw.pages).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)), liveKeys = pageKeys(live.map(p => p.name));
  const baseByKey = new Map(baseKeys.map((k, i) => [k, baseDefs[i]]));
  const changed = [], pages = [];
  live.forEach((page, i) => {
    const key = liveKeys[i], def = baseByKey.get(key);
    if (page.type && page.type !== 'text') return; // only text pages are package content
    const text = {content: page.text?.content ?? '', ...(page.text?.format !== undefined ? {format: page.text.format} : {})};
    if (!def) { changed.push(`pages[${key}]`); pages.push({name: page.name, type: 'text', text: packDeep(text, idOfUuid)}); return; }
    const out = clone(def);
    out.text = {...(out.text ?? {})};
    for (const path of ['content', ...(own(def.text ?? {}, 'format') ? ['format'] : [])]) {
      const liveValue = text[path], baseValue = def.text?.[path];
      if (sameValue(`page:${key}:text.${path}`, liveValue, baseValue, idOfUuid)) continue;
      changed.push(`pages[${key}].text.${path}`);
      out.text[path] = packDeep(liveValue, idOfUuid);
    }
    pages.push(out);
  });
  for (const [key] of baseByKey) if (!liveKeys.includes(key)) changed.push(`pages[${key}] (removed)`);
  return {pages, changed};
}

/** Roll Table results, row by row in range order. */
function tableResults(snap, idOfUuid) {
  const sortR = list => [...list].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0));
  const baseDefs = sortR(objects(snap.flag.managedFields.results)), live = sortR(objects(snap.raw.results));
  const changed = [], results = [];
  const rowOf = (liveRow, def) => {
    const l = normalizeLiveResult(liveRow);
    const out = def ? clone(def) : {};
    const set = (key, value) => { out[key] = packDeep(value, idOfUuid); };
    for (const key of ['type', 'name', 'range', 'weight']) if (!def || !sameText(normalizePackageResult(def)[key], l[key]) && !equal(normalizePackageResult(def)[key], l[key])) set(key, l[key]);
    const textKey = def && own(def, 'text') && !own(def, 'description') ? 'text' : 'description';
    if (!def || !sameValue('results.description', l.description, normalizePackageResult(def).description, idOfUuid)) set(textKey, l.description);
    if (!def && l.documentUuid && String(l.documentUuid).startsWith('Compendium.')) out.documentUuid = l.documentUuid;
    return out;
  };
  const n = Math.max(baseDefs.length, live.length);
  if (baseDefs.length !== live.length) changed.push('results');
  for (let i = 0; i < live.length; i++) {
    const def = baseDefs[i], out = rowOf(live[i], def);
    results.push(out);
    if (!def) continue;
    const a = normalizePackageResult(def), b = normalizeLiveResult(live[i]);
    for (const key of ['type', 'name', 'range', 'weight']) if (!equal(a[key], b[key]) && !sameText(a[key], b[key])) changed.push(`results[${i + 1}].${key}`);
    if (!sameValue('results.description', b.description, a.description, idOfUuid)) changed.push(`results[${i + 1}].description`);
  }
  return {results, changed: n ? [...new Set(changed)] : []};
}

/** An NPC's package Items (the ones Manager marked); items the GM added stay out. */
function actorItems(snap, idOfUuid) {
  const baseDefs = objects(snap.flag.managedFields.items), keys = itemKeys(baseDefs);
  const marked = new Map(objects(snap.raw.items).filter(keyOf).map(i => [keyOf(i), i]));
  const changed = [], items = [];
  baseDefs.forEach((def, i) => {
    const key = keys[i], liveItem = marked.get(key);
    if (!liveItem) { changed.push(`items[${key}] (removed)`); return; }
    const out = clone(def);
    for (const [path, incoming] of Object.entries(itemLeaves(def))) {
      if (ITEM_PLAY_STATE.has(path) || emptyObject(incoming)) continue;
      const live = getPath(liveItem, path);
      if (sameValue(`item:${key}:${path}`, live, incoming, idOfUuid)) continue;
      changed.push(`items[${key}].${path}`);
      if (live !== undefined) setPath(out, path, packDeep(clone(live), idOfUuid));
    }
    items.push(packDeep(out, idOfUuid));
  });
  return {items, changed};
}

/** An Item's Manager-made effects, each compared with the definition stored when it was made. */
function itemEffects(snap, idOfUuid) {
  const changed = [], effects = [];
  for (const raw of objects(snap.raw.effects)) {
    const flag = effectFlagOf(raw);
    if (!flag?.effId) continue;
    let base = null;
    try { base = upgradeBaseline(JSON.parse(flag.baseline ?? 'null')); } catch { base = null; }
    if (!isPlainObject(base)) continue;
    const out = {eff_id: flag.effId, ...clone(base)};
    for (const [path, want] of Object.entries(effectFields(base))) {
      const live = liveEffectValue(raw, path);
      if (sameText(path === 'statuses' ? [...want].sort() : want, live) || sameValue(`effect:${path}`, live, want, idOfUuid)) continue;
      changed.push(`effects[${flag.effId}].${path}`);
      if (live !== undefined) setPath(out, path, clone(live));
    }
    effects.push(packDeep(out, idOfUuid));
  }
  return {effects, changed};
}

// ---------- one managed document ----------
function folderChain(doc) {
  const names = [];
  for (let f = doc.folder && typeof doc.folder === 'object' ? doc.folder : null, n = 0; f && n < 20; f = f.folder && typeof f.folder === 'object' ? f.folder : null, n++) names.unshift(f.name);
  return names.join('/');
}

function managedEntry(doc, idOfUuid) {
  const snap = makeSnapshot(doc);
  const flag = snap.flag, kind = snap.documentName;
  const definition = {...(flag.definition ? clone(flag.definition) : readStoredDefinition(flag))};
  delete definition.foundry;
  const head = {entity_type: flag.entityType ?? definition.entity_type ?? kind, document_type: kind, id: flag.sourceId, name: doc.name,
    source_package: flag.packageId ?? null, source_package_version: flag.packageVersion ?? null};
  if (!isPlainObject(flag.managedFields)) {
    const data = {name: doc.name, ...(snap.raw.type ? {type: snap.raw.type} : {})};
    return {...head, changed_fields: [NO_BASELINE], record: {...definition, id: flag.sourceId, foundry: {document_type: kind, data}}};
  }
  const base = flag.managedFields, raw = snap.raw;
  const edited = topLevelEdits(snap, idOfUuid), editedSet = new Set(edited);
  const changed = [...edited];
  const data = {};
  for (const [path, baseValue] of Object.entries(base)) {
    if (path === 'items' || (kind === 'RollTable' && path === 'results')) continue;
    const value = editedSet.has(path) ? getPath(raw, path) : baseValue;
    if (value !== undefined) setPath(data, path, packDeep(clone(value), idOfUuid));
  }
  if (kind === 'Item' || kind === 'Actor') data.type = raw.type;
  if (kind === 'Item') {
    const fx = itemEffects(snap, idOfUuid);
    if (fx.effects.length) data.effects = fx.effects;
    changed.push(...fx.changed);
  } else if (kind === 'JournalEntry') {
    const j = journalPages(snap, idOfUuid);
    data.pages = j.pages; changed.push(...j.changed);
  } else if (kind === 'RollTable') {
    if (own(base, 'results')) { const t = tableResults(snap, idOfUuid); data.results = t.results; changed.push(...t.changed); }
  } else if (kind === 'Actor') {
    if (own(base, 'items')) { const a = actorItems(snap, idOfUuid); data.items = a.items; changed.push(...a.changed); }
  }
  return {...head, changed_fields: [...new Set(changed)].sort(), record: {...definition, id: flag.sourceId, foundry: {document_type: kind, data}}};
}

// ---------- a world-only document ----------
function worldOnlyEntry(doc) {
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const kind = doc.documentName, data = {name: doc.name};
  if (raw.type) data.type = raw.type;
  if (kind === 'Item' && typeof raw.system?.description?.value === 'string') data.description = raw.system.description.value;
  else if (kind === 'Actor' && typeof raw.system?.details?.biography?.value === 'string') data.description = raw.system.details.biography.value;
  else if (kind === 'RollTable') { if (raw.description) data.description = raw.description; data.results = objects(raw.results).length; }
  else if (kind === 'JournalEntry') data.pages = objects(raw.pages).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).filter(p => !p.type || p.type === 'text').map(p => ({name: p.name, text: p.text?.content ?? ''}));
  else if (kind === 'Macro') data.scope = raw.scope ?? 'global';
  const folder = folderChain(doc);
  return {entity_type: kind, document_type: kind, ...(raw.type ? {type: raw.type} : {}), name: doc.name, ...(folder ? {folder} : {}), data};
}

const hasSource = doc => Boolean((doc?.flags?.[MODULE_ID]?.source ?? doc?.getFlag?.(MODULE_ID, 'source'))?.sourceId);
const sourceOf = doc => doc.getFlag?.(MODULE_ID, 'source') ?? doc.flags?.[MODULE_ID]?.source ?? null;

/**
 * Looks through the world and returns what the export would contain, without writing anything. GM-only: it rejects anyone else
 * here, not just in the UI.
 * options: {types: [Item|JournalEntry|Actor|RollTable|Macro] (default all), includeUnchanged, includeWorldOnly}.
 */
export function scanWorldEdits(game, {types = EDIT_TYPES, includeUnchanged = false, includeWorldOnly = false} = {}) {
  if (!game?.user?.isGM) throw new Error('Only the GM can export edited records.');
  const chosen = EDIT_TYPES.filter(t => types.includes(t));
  const counts = Object.fromEntries(chosen.map(t => [t, {managed: 0, edited: 0, unchanged: 0, worldOnly: 0}]));
  const skipped = {characters: 0};
  // Every managed document in the world (any type), so a link to one of them can go back to its permanent id.
  const idOfUuid = new Map();
  for (const type of EDIT_TYPES) for (const doc of asList(game[COLLECTIONS[type]])) { const id = sourceOf(doc)?.sourceId; if (id && doc.uuid) idOfUuid.set(doc.uuid, id); }
  const records = [], worldOnly = [];
  for (const type of chosen) {
    for (const doc of asList(game[COLLECTIONS[type]])) {
      if (type === 'Actor' && PC_ACTOR_TYPES.has(doc.type)) { if (doc.type === 'character') skipped.characters++; continue; }
      if (hasSource(doc)) {
        counts[type].managed++;
        const entry = managedEntry(doc, idOfUuid);
        const edited = entry.changed_fields.length > 0;
        counts[type][edited ? 'edited' : 'unchanged']++;
        if (edited || includeUnchanged) records.push(entry);
      } else {
        counts[type].worldOnly++;
        if (includeWorldOnly) worldOnly.push(worldOnlyEntry(doc));
      }
    }
  }
  const byId = (a, b) => a.document_type < b.document_type ? -1 : a.document_type > b.document_type ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  records.sort(byId);
  worldOnly.sort((a, b) => a.document_type < b.document_type ? -1 : a.document_type > b.document_type ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return {types: chosen, includeUnchanged, includeWorldOnly, counts, skipped, records, worldOnly,
    editedCount: Object.values(counts).reduce((n, c) => n + c.edited, 0)};
}

/** The file (ag-world-edits/0.1) for a scan. GM-only again, so a scan cannot be turned into a download by anyone else. */
export function buildEditsFile(game, scan, {now = new Date()} = {}) {
  if (!game?.user?.isGM) throw new Error('Only the GM can export edited records.');
  const file = {schema: EDITS_SCHEMA, created: now.toISOString(), world: game.world?.id ?? null,
    manager_version: game.modules?.get?.(MODULE_ID)?.version ?? null, records: scan.records, world_only: scan.worldOnly};
  return {file, filename: `AG_World_Edits_${now.toISOString().slice(0, 10)}.json`};
}

/** Scan, build and save in one step (the API-level entry). `save(filename, value)` is the download. Writes nothing to the world. */
export function saveWorldEdits(game, options, {save, now} = {}) {
  const scan = scanWorldEdits(game, options);
  const out = buildEditsFile(game, scan, {now});
  save(out.filename, out.file);
  return {...out, scan};
}

// ---------- preview ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Most edited rows the preview lists; the rest are counted. */
export const PREVIEW_ROWS = 200;

/** The preview dialog's body (HTML text): counts per type, then each edited record with the names of its changed fields. */
export function previewHtml(scan) {
  const rows = scan.types.map(t => { const c = scan.counts[t];
    return `<tr><th scope="row">${esc(TYPE_LABELS[t])}</th><td>${c.managed}</td><td>${c.edited}</td>${scan.includeUnchanged ? `<td>${c.unchanged}</td>` : ''}${scan.includeWorldOnly ? `<td>${c.worldOnly}</td>` : ''}</tr>`; }).join('');
  const head = `<th scope="col">Type</th><th scope="col">Imported</th><th scope="col">Edited</th>${scan.includeUnchanged ? '<th scope="col">Unchanged</th>' : ''}${scan.includeWorldOnly ? '<th scope="col">Not in a package</th>' : ''}`;
  const list = scan.records.filter(r => r.changed_fields.length);
  const shown = list.slice(0, PREVIEW_ROWS);
  const items = shown.map(r => `<li><strong>${esc(r.name)}</strong> <span class="agmanager-tiny">(${esc(TYPE_LABELS[r.document_type] ?? r.document_type)})</span>: ${r.changed_fields.map(f => `<code>${esc(f)}</code>`).join(', ')}</li>`).join('');
  const note = [];
  if (scan.skipped.characters) note.push(`${plural(scan.skipped.characters, 'player character')} left out (characters are never exported).`);
  if (scan.includeUnchanged) note.push('Records you did not edit are included.');
  if (scan.includeWorldOnly) note.push(`${plural(scan.worldOnly.length, 'document')} not in any package will be listed separately.`);
  return `<p>Nothing is changed in your world. The file holds only content (names, descriptions, stats as the package defines them), never play state.</p>
<table class="ag-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
${list.length ? `<p><strong>${plural(list.length, 'edited record')}</strong></p><ul>${items}</ul>${list.length > shown.length ? `<p class="agmanager-tiny">and ${list.length - shown.length} more in the file.</p>` : ''}`
  : '<p><strong>No edited records.</strong> Every imported record still matches its import.</p>'}
${note.map(n => `<p class="agmanager-tiny">${esc(n)}</p>`).join('')}`;
}

/** Names only, one line per record, for pasting into chat. */
export function summaryText(scan) {
  const edited = scan.records.filter(r => r.changed_fields.length);
  const lines = [`Edited records: ${edited.length}`];
  for (const t of scan.types) {
    const names = edited.filter(r => r.document_type === t).map(r => r.name);
    if (names.length) lines.push(`${TYPE_LABELS[t]} (${names.length}): ${names.join(', ')}`);
  }
  if (scan.includeWorldOnly) lines.push(`Not in any package: ${scan.worldOnly.length}`);
  return lines.join('\n');
}
