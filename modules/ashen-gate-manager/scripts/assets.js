/**
 * Items → Assets (0.57.0): browse, upload and link the world's art files. GM only, and every function here checks the
 * GM itself (the window hiding the tab is not the guard). Pure except for the picker/browse functions it is handed, so
 * the Node suite covers it with a mocked FilePicker.
 *
 * What a module can do with files (spike, see the CHANGELOG): Foundry's FilePicker offers browse, createDirectory and
 * upload only. It has no delete, rename or move, and The Forge's Assets Library is reached through that same
 * FilePicker (source "forgevtt"), so none of the three exist here. They are done on the Forge's own Assets Library page
 * ("Manage on Forge…"). Nothing in this file pretends otherwise.
 *
 * Linking never touches Actors: an existing Actor changes only through Import → Update existing actors.
 */
import {isPlaceholderIcon, managerAssignedIcon, iconFlagUpdate, ICON_FLAGS} from './smart-icons.js';

export const FORGE_SOURCE = 'forgevtt';
export const DATA_SOURCE = 'data';
/** The Forge's Assets Library page (rename, move and delete happen there). */
export const MANAGE_ON_FORGE_URL = 'https://forge-vtt.com/assets';
export const IMAGE_EXTENSIONS = /\.(webp|png|jpe?g|gif|avif|svg)$/i;
/** When two files share an id, the first extension in this list is linked. */
const EXTENSION_ORDER = ['webp', 'png', 'avif', 'jpg', 'jpeg', 'gif', 'svg'];
/** Document kinds an id-named file can be linked to. Actors are deliberately absent. */
export const LINKABLE_DOCUMENTS = Object.freeze(['Item', 'RollTable', 'Macro', 'JournalEntry']);
export const UPLOAD_CONCURRENCY = 3;
export const LINK_CHUNK = 50;
export const SCAN_LIMITS = Object.freeze({maxDepth: 4, maxRequests: 200, concurrency: 3});

const GM_ONLY = 'Only a GM can manage assets.';
const isGM = user => Boolean(user?.isGM);
const norm = text => String(text ?? '').trim();

// ---------- Paths and names ----------
/** The last path segment, decoded ("https://x/a/NPC%20A.webp?v=2" → "NPC A.webp"). */
export function baseName(path) {
  const clean = String(path ?? '').split(/[?#]/)[0].replace(/\/+$/, '');
  const last = clean.slice(clean.lastIndexOf('/') + 1);
  try { return decodeURIComponent(last); } catch { return last; }
}
export const stem = name => String(name ?? '').replace(/\.[A-Za-z0-9]+$/, '');
export const extensionOf = name => (String(name ?? '').match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase();
export const isImageName = name => IMAGE_EXTENSIONS.test(String(name ?? ''));
export const joinPath = (...parts) => parts.map(p => String(p ?? '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
/** The parent folder of a target ("assets/npc" → "assets", "assets" → ""). */
export const parentPath = target => joinPath(target).split('/').slice(0, -1).join('/');
/** Breadcrumb steps for a target: [{label, target}], the root first. */
export function crumbs(target, rootLabel = 'Library') {
  const parts = joinPath(target).split('/').filter(Boolean);
  return [{label: rootLabel, target: ''}, ...parts.map((label, i) => ({label, target: parts.slice(0, i + 1).join('/')}))];
}
/** Compares two image paths ignoring a leading slash, query string and URL encoding. */
export function samePath(a, b) {
  const clean = p => { let t = String(p ?? '').trim().replace(/^\.?\//, '').split(/[?#]/)[0]; try { t = decodeURIComponent(t); } catch { /* keep as is */ } return t; };
  return Boolean(norm(a)) && clean(a) === clean(b);
}

/** A folder name the GM may create: letters, digits, spaces, dot, dash, underscore. No slashes, no leading dot. */
export function folderNameProblem(name) {
  const n = String(name ?? '');
  if (!n.trim()) return 'Type a folder name.';
  if (n !== n.trim()) return 'Remove the spaces at the start or end of the name.';
  if (n.length > 64) return 'Use 64 characters or fewer.';
  if (/^\.+$/.test(n) || n.startsWith('.')) return 'A folder name cannot start with a dot.';
  if (!/^[A-Za-z0-9 _.-]+$/.test(n)) return 'Use letters, numbers, spaces, dots, dashes and underscores only.';
  return '';
}

// ---------- Sources ----------
/** Sources the GM can browse: the Forge Assets Library when running on The Forge, always Foundry's own data folder. */
export function assetSources(g = globalThis) {
  const onForge = Boolean(g.ForgeVTT?.usingTheForge);
  return [...(onForge ? [{id: FORGE_SOURCE, label: 'Forge Assets Library'}] : []), {id: DATA_SOURCE, label: 'Foundry data folder'}];
}
export const defaultSource = (g = globalThis) => assetSources(g)[0].id;

// ---------- Browsing ----------
/**
 * Lists one folder as {ok, dirs:[{name, target}], files:[{name, path, image}], message}. `target` of a folder is built
 * from the folder being viewed and the folder's name, so it works whether the source answers with relative paths or
 * (The Forge) absolute URLs. A file's `path` is exactly what the source returned: it is what Foundry stores in an
 * `img` field when that file is picked. Never throws.
 */
export async function listFolder(picker, {source, target = '', user} = {}) {
  if (!isGM(user)) return {ok: false, dirs: [], files: [], message: GM_ONLY};
  if (typeof picker?.browse !== 'function') return {ok: false, dirs: [], files: [], message: 'Foundry\'s file browser is not available here.'};
  try {
    const out = await picker.browse(source, target, {extensions: undefined});
    const dirs = [...new Set((out?.dirs ?? []).filter(d => typeof d === 'string').map(baseName).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'})).map(name => ({name, target: joinPath(target, name)}));
    const files = (out?.files ?? []).filter(f => typeof f === 'string').map(path => ({name: baseName(path), path, image: isImageName(path)}))
      .filter(f => f.image).sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
    return {ok: true, dirs, files, message: ''};
  } catch (error) {
    return {ok: false, dirs: [], files: [], message: `Could not open this folder: ${error?.message ?? error}`};
  }
}

/** Files whose name contains the search words (every word must appear), case-insensitive. */
export function filterEntries(entries, query) {
  const words = norm(query).toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? entries.filter(e => words.every(w => e.name.toLowerCase().includes(w))) : entries;
}

/**
 * Walks a folder and the folders under it (capped: depth, number of folder reads) and returns every image file.
 * Returns {ok, files:[{name, path, folder}], complete, folders, errors}. Never throws.
 */
export async function scanFolders(picker, {source, target = '', user, limits = SCAN_LIMITS, signal = null} = {}) {
  if (!isGM(user)) return {ok: false, files: [], complete: false, folders: 0, errors: [GM_ONLY]};
  const files = [], errors = [], queue = [{target, depth: 0}];
  let requests = 0, complete = true;
  const worker = async () => {
    while (queue.length) {
      if (signal?.aborted || requests >= limits.maxRequests) { complete = false; queue.length = 0; return; }
      const job = queue.shift();
      requests++;
      const out = await listFolder(picker, {source, target: job.target, user});
      if (!out.ok) { errors.push(out.message); if (job.depth === 0) complete = false; continue; }
      for (const f of out.files) files.push({...f, folder: job.target});
      if (job.depth < limits.maxDepth) queue.push(...out.dirs.map(d => ({target: d.target, depth: job.depth + 1})));
      else if (out.dirs.length) complete = false;
    }
  };
  await Promise.all(Array.from({length: Math.max(1, limits.concurrency)}, worker));
  return {ok: !errors.length || files.length > 0, files, complete, folders: requests, errors};
}

// ---------- Creating folders ----------
export async function createFolder(picker, {source, parent = '', name, user} = {}) {
  if (!isGM(user)) return {ok: false, message: GM_ONLY};
  const problem = folderNameProblem(name);
  if (problem) return {ok: false, message: problem};
  if (typeof picker?.createDirectory !== 'function') return {ok: false, message: 'Foundry\'s file browser cannot create folders here.'};
  const target = joinPath(parent, name);
  try {
    const out = await picker.createDirectory(source, target, {});
    if (out === false || out?.error || out?.status === 'error') return {ok: false, message: `Could not create the folder: ${out?.error ?? out?.message ?? 'refused'}`};
    return {ok: true, target, message: `Created the folder ${name}.`};
  } catch (error) {
    return {ok: false, message: `Could not create the folder: ${error?.message ?? error}`};
  }
}

// ---------- Uploading ----------
/**
 * Sorts picked or dropped files into {accepted, rejected}. Only image files are accepted; a name that is a path, empty
 * or a dot-file is refused, and the same name twice in one drop keeps the first.
 */
export function triageUploads(files) {
  const accepted = [], rejected = [], seen = new Set();
  for (const file of files ?? []) {
    const name = String(file?.name ?? '');
    if (!name || /[\\/]/.test(name) || name.startsWith('.')) rejected.push({name: name || '(no name)', status: 'rejected', message: 'Not a usable file name.'});
    else if (!isImageName(name)) rejected.push({name, status: 'rejected', message: 'Not an image file (use webp, png, jpg, gif, avif or svg).'});
    else if (seen.has(name.toLowerCase())) rejected.push({name, status: 'rejected', message: 'The same name is in this drop twice; the first one is used.'});
    else { seen.add(name.toLowerCase()); accepted.push(file); }
  }
  return {accepted, rejected};
}

/**
 * Uploads files into one folder with a per-file result. Files that already exist in the folder are not touched until
 * `decide(names)` answers 'overwrite' or 'skip' (it is asked once, with the list; null/'cancel' uploads nothing).
 * Uploads run UPLOAD_CONCURRENCY at a time, in order. Results are reported through onProgress({results, done, total}).
 * Returns {ok, cancelled, results:[{name, status: 'uploaded'|'replaced'|'skipped'|'failed'|'rejected'|'not started', path?, message}]}.
 */
export async function uploadFiles(files, {picker, source, target = '', user, existing = [], decide = async () => 'skip', onProgress = () => {}, signal = null, concurrency = UPLOAD_CONCURRENCY} = {}) {
  if (!isGM(user)) return {ok: false, cancelled: false, results: [{name: '', status: 'failed', message: GM_ONLY}]};
  if (typeof picker?.upload !== 'function') return {ok: false, cancelled: false, results: [{name: '', status: 'failed', message: 'Foundry\'s file browser cannot upload here.'}]};
  const {accepted, rejected} = triageUploads(files);
  const have = new Set((existing ?? []).map(n => String(n).toLowerCase()));
  const clashes = accepted.filter(f => have.has(f.name.toLowerCase()));
  let choice = 'overwrite';
  if (clashes.length) {
    choice = await decide(clashes.map(f => f.name));
    if (choice !== 'overwrite' && choice !== 'skip') {
      return {ok: false, cancelled: true, results: [...rejected, ...accepted.map(f => ({name: f.name, status: 'not started', message: 'Cancelled before anything was uploaded.'}))]};
    }
  }
  const results = new Map(rejected.map(r => [r.name, r]));
  const order = accepted.map(f => f.name);
  const todo = [];
  for (const file of accepted) {
    if (have.has(file.name.toLowerCase()) && choice === 'skip') results.set(file.name, {name: file.name, status: 'skipped', message: 'Already in this folder; kept.'});
    else todo.push(file);
  }
  const total = accepted.length + rejected.length;
  const report = () => onProgress({results: snapshot(), done: results.size, total});
  const snapshot = () => [...rejected.map(r => r.name), ...order].map(n => results.get(n) ?? {name: n, status: 'waiting', message: 'Waiting…'});
  report();
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      if (signal?.aborted) return;
      const file = queue.shift();
      const replaced = have.has(file.name.toLowerCase());
      try {
        const out = await picker.upload(source, target, file, {}, {notify: false});
        if (!out || out.error || out.status === 'error') results.set(file.name, {name: file.name, status: 'failed', message: String(out?.error ?? out?.message ?? 'The upload was refused.')});
        else results.set(file.name, {name: file.name, status: replaced ? 'replaced' : 'uploaded', path: out.path ?? joinPath(target, file.name), message: replaced ? 'Replaced the file in this folder.' : 'Uploaded.'});
      } catch (error) {
        results.set(file.name, {name: file.name, status: 'failed', message: String(error?.message ?? error)});
      }
      report();
    }
  };
  await Promise.all(Array.from({length: Math.max(1, concurrency)}, worker));
  for (const file of queue) results.set(file.name, {name: file.name, status: 'not started', message: 'Stopped before this file.'});
  for (const file of todo) if (!results.has(file.name)) results.set(file.name, {name: file.name, status: 'not started', message: 'Stopped before this file.'});
  const final = snapshot();
  return {ok: final.every(r => ['uploaded', 'replaced', 'skipped'].includes(r.status)), cancelled: Boolean(signal?.aborted), results: final};
}

export const UPLOAD_TONE = {uploaded: 'ok', replaced: 'ok', skipped: 'warn', failed: 'danger', rejected: 'danger', 'not started': 'warn', waiting: ''};
export const UPLOAD_LABEL = {uploaded: 'Uploaded', replaced: 'Replaced', skipped: 'Skipped', failed: 'Failed', rejected: 'Not uploaded', 'not started': 'Not started', waiting: 'Waiting'};

// ---------- Linking id-named files to records ----------
/**
 * The file chosen for each id: an exact (case-insensitive) match of the file name without its extension. When an id
 * has several files, the preferred extension wins, then the shorter path, and `others` lists the rest.
 * Returns Map(lowercase id → {file, others:[file]}).
 */
export function matchFilesToIds(files, ids) {
  const wanted = new Map([...ids].map(id => [String(id).toLowerCase(), id]));
  const found = new Map();
  for (const file of files ?? []) {
    if (!isImageName(file.name)) continue;
    const key = stem(file.name).toLowerCase();
    if (!wanted.has(key)) continue;
    (found.get(key) ?? found.set(key, []).get(key)).push(file);
  }
  const rank = f => { const i = EXTENSION_ORDER.indexOf(extensionOf(f.name)); return i < 0 ? 99 : i; };
  return new Map([...found].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => rank(a) - rank(b) || a.path.length - b.path.length || a.path.localeCompare(b.path));
    return [key, {id: wanted.get(key), file: sorted[0], others: sorted.slice(1)}];
  }));
}

/**
 * How a record's current image should be treated before a link.
 * 'default' blank or a placeholder; 'smart' an icon Manager chose; 'ours' a file this tab linked earlier and nobody
 * changed; 'imported' the image the import gave it (unchanged since); 'edited' anything else, so a person set it.
 * Only default, smart and ours are ticked for you. Imported and edited are shown, unticked, and can be ticked.
 */
export function imageState({img, flags = {}, baselineImg}) {
  if (!norm(img) || isPlaceholderIcon(img)) return 'default';
  if (managerAssignedIcon(img, flags)) return 'smart';
  if (flags?.[ICON_FLAGS.source] === 'authored' && flags?.[ICON_FLAGS.path] === img) return 'ours';
  if (norm(baselineImg) && samePath(img, baselineImg)) return 'imported';
  return 'edited';
}
export const STATE_LABEL = {default: 'Default image', smart: 'Chosen by Manager', ours: 'Linked before', imported: 'Image from the import', edited: 'Set by you'};
const AUTO_TICK = new Set(['default', 'smart', 'ours']);

/**
 * The preview table. `docs` are plain {uuid, documentName, type, name, sourceId, img, flags, baselineImg} for the
 * world's Manager-imported documents. Returns {rows, actorsSkipped, unmatched}:
 *   rows            one per document with a matching file, ready to tick ({key, uuid, documentName, name, fileName,
 *                   from, to, state, stateLabel, checked, noteText, alsoFound});
 *   actorsSkipped   matching files for Actors, which this tab never changes;
 *   unmatched       ids with no file (counted, not listed).
 */
export function planAssetLinks(docs, files) {
  const linkable = docs.filter(d => d.sourceId && LINKABLE_DOCUMENTS.includes(d.documentName) && (d.documentName !== 'JournalEntry' || typeof d.img === 'string'));
  const actors = docs.filter(d => d.sourceId && d.documentName === 'Actor');
  const matches = matchFilesToIds(files, new Set(docs.filter(d => d.sourceId).map(d => d.sourceId)));
  const rows = [];
  for (const doc of linkable) {
    const hit = matches.get(String(doc.sourceId).toLowerCase());
    if (!hit) continue;
    const to = hit.file.path;
    if (samePath(doc.img, to)) continue; // already linked: nothing to do
    const state = imageState(doc);
    rows.push({key: doc.uuid, uuid: doc.uuid, documentName: doc.documentName, type: doc.type ?? '', name: doc.name, fileName: hit.file.name,
      from: doc.img ?? '', to, state, stateLabel: STATE_LABEL[state], checked: AUTO_TICK.has(state),
      noteText: state === 'edited' ? 'This image was set in Foundry. Tick to replace it.' : state === 'imported' ? 'This record came with its own image. Tick to replace it.' : '',
      alsoFound: hit.others.map(o => o.name)});
  }
  rows.sort((a, b) => a.documentName.localeCompare(b.documentName) || a.name.localeCompare(b.name));
  const actorsSkipped = actors.filter(d => matches.has(String(d.sourceId).toLowerCase()) && !samePath(d.img, matches.get(String(d.sourceId).toLowerCase()).file.path)).map(d => ({name: d.name, fileName: matches.get(String(d.sourceId).toLowerCase()).file.name}));
  const unmatched = linkable.filter(d => !matches.has(String(d.sourceId).toLowerCase())).length;
  return {rows, actorsSkipped, unmatched};
}

/**
 * Writes the ticked rows' images. deps: {user, moduleId, getDoc(uuid), updateMany(documentName, updates[]), onProgress, signal}.
 * A document whose image changed since the preview, that is gone, or that is not a linkable kind (an Actor) is skipped.
 * Only `img` and Manager's own icon flags are written; nothing else on the document. GM only, checked here.
 */
export async function applyAssetLinks(rows, {user, moduleId, getDoc, updateMany, onProgress = () => {}, signal = null, chunk = LINK_CHUNK} = {}) {
  if (!isGM(user)) return {ok: false, message: GM_ONLY, applied: [], skipped: [], errors: []};
  const applied = [], skipped = [], errors = [];
  const todo = (rows ?? []).filter(r => r?.checked && r.to && r.uuid);
  let cancelled = false;
  for (let start = 0; start < todo.length; start += chunk) {
    if (signal?.aborted) { cancelled = true; break; }
    const batch = {};
    for (const row of todo.slice(start, start + chunk)) {
      const doc = getDoc(row.uuid);
      if (!doc) { skipped.push({name: row.name, why: 'no longer in the world'}); continue; }
      if (!LINKABLE_DOCUMENTS.includes(doc.documentName)) { skipped.push({name: row.name, why: 'Actors are not changed here'}); continue; }
      if (!samePath(doc.img, row.from) && !(norm(doc.img) === '' && norm(row.from) === '')) { skipped.push({name: row.name, why: 'its image changed since the preview'}); continue; }
      (batch[doc.documentName] ??= []).push({row, doc});
    }
    for (const [documentName, list] of Object.entries(batch)) {
      try {
        await updateMany(documentName, list.map(({row, doc}) => ({_id: doc.id, img: row.to, ...iconFlagUpdate(moduleId, {img: row.to, source: 'authored'})})));
        for (const {row} of list) applied.push({name: row.name, from: row.from, to: row.to});
      } catch (error) {
        errors.push({documentName, message: String(error?.message ?? error)});
        for (const {row} of list) skipped.push({name: row.name, why: 'the write failed'});
      }
    }
    onProgress({done: Math.min(start + chunk, todo.length), total: todo.length});
  }
  const message = `${applied.length} image(s) linked${skipped.length ? `, ${skipped.length} skipped (${[...new Set(skipped.map(s => s.why))].join('; ')})` : ''}${errors.length ? `, ${errors.length} write error(s): ${errors[0].message}` : ''}${cancelled ? '; cancelled: the rest were not changed' : ''}.`;
  return {ok: !errors.length || applied.length > 0, message, applied, skipped, errors, cancelled};
}

// ---------- Missing art ----------
export const ART_KINDS = Object.freeze([
  {value: 'all', label: 'All kinds'}, {value: 'Item', label: 'Items'}, {value: 'Actor', label: 'Actors'},
  {value: 'RollTable', label: 'Roll tables'}, {value: 'Macro', label: 'Macros'}, {value: 'JournalEntry', label: 'Journals'}]);
export const ART_STATES = Object.freeze([
  {value: 'all', label: 'No image or generic'}, {value: 'none', label: 'No image'}, {value: 'generic', label: 'Generic image'}]);
/** 'none' (blank) or 'generic' (a placeholder) for a record that still needs art; null when it has real art. */
export function missingState(img) {
  if (!norm(img)) return 'none';
  return isPlaceholderIcon(img) ? 'generic' : null;
}
/**
 * Records still needing art. `foundNames` is an optional Set of lowercase file stems from a library scan, so a row can
 * say a file is already waiting. Rows show the record's name and kind; `fileName` is the file name to make
 * ("NPC-OREN.webp"), which is also what the Link section looks for.
 */
export function missingArtRows(docs, {kind = 'all', state = 'all', query = '', foundNames = null} = {}) {
  const words = norm(query).toLowerCase().split(/\s+/).filter(Boolean);
  const rows = [];
  for (const doc of docs) {
    if (!doc.sourceId || (doc.documentName === 'JournalEntry' && typeof doc.img !== 'string')) continue;
    const s = missingState(doc.img);
    if (!s || (kind !== 'all' && doc.documentName !== kind) || (state !== 'all' && s !== state)) continue;
    if (words.length && !words.every(w => `${doc.name} ${doc.type ?? ''}`.toLowerCase().includes(w))) continue;
    rows.push({uuid: doc.uuid, documentName: doc.documentName, name: doc.name, type: doc.type ?? '', state: s,
      stateLabel: s === 'none' ? 'No image' : 'Generic image', fileName: `${doc.sourceId}.webp`,
      fileWaiting: Boolean(foundNames?.has(String(doc.sourceId).toLowerCase())), linkable: LINKABLE_DOCUMENTS.includes(doc.documentName)});
  }
  return rows.sort((a, b) => a.documentName.localeCompare(b.documentName) || a.name.localeCompare(b.name));
}
