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
 * Linking an existing Actor (0.61.0) changes its portrait (`img`) and its prototype token image
 * (`prototypeToken.texture.src`) and nothing else; every other change to an Actor stays with Import → Update existing actors.
 * The one addition (0.63.0) is Foundry's own token ring, when the batch has "Turn on token ring" ticked (see token-ring.js):
 * only for an Actor with a ring rule whose ring is still off.
 */
import {isPlaceholderIcon, managerAssignedIcon, iconFlagUpdate, ICON_FLAGS} from './smart-icons.js';
import {ringKindFor, ringUpdateFor, tokenRingUpdateFor} from './token-ring.js';
import {fileWords, nameWords, matchLevel, MATCH_REASONS, MATCH_RANK} from './asset-names.js';

export const FORGE_SOURCE = 'forgevtt';
export const DATA_SOURCE = 'data';
/** The Forge's Assets Library page (rename, move and delete happen there). */
export const MANAGE_ON_FORGE_URL = 'https://forge-vtt.com/assets';
export const IMAGE_EXTENSIONS = /\.(webp|png|jpe?g|gif|avif|svg)$/i;
/** When two files share an id, the first extension in this list is linked. */
const EXTENSION_ORDER = ['webp', 'png', 'avif', 'jpg', 'jpeg', 'gif', 'svg'];
/** Document kinds whose image is a plain `img` (changed together with Manager's icon flags). */
export const LINKABLE_DOCUMENTS = Object.freeze(['Item', 'RollTable', 'Macro', 'JournalEntry']);
/** Everything a file can be linked to. An Actor gets only its portrait and prototype token image. */
export const LINKABLE_KINDS = Object.freeze([...LINKABLE_DOCUMENTS, 'Actor']);
export const TOKEN_IMAGE_FIELD = 'prototypeToken.texture.src';
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
/** A path without a leading slash, query string or URL encoding, for comparing. */
export function cleanPath(p) { let t = String(p ?? '').trim().replace(/^\.?\//, '').split(/[?#]/)[0]; try { t = decodeURIComponent(t); } catch { /* keep as is */ } return t; }
/** Compares two image paths ignoring a leading slash, query string and URL encoding. */
export function samePath(a, b) {
  return Boolean(norm(a)) && cleanPath(a) === cleanPath(b);
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

const isNpcActor = d => d.documentName === 'Actor' && d.type === 'npc';
const kindWord = d => (d.documentName === 'RollTable' ? 'roll table' : d.documentName === 'JournalEntry' ? 'journal' : d.documentName.toLowerCase());

/** An Actor whose token image differs from its portrait was set apart on purpose. */
const tokenSetApart = doc => doc.documentName === 'Actor' && norm(doc.tokenImg) && !isPlaceholderIcon(doc.tokenImg) && !samePath(doc.tokenImg, doc.img) && !tokenIsImported(doc);
/** The token still shows the image the import gave it (same path, or the same file name after the import moved it into the world), so nobody set it apart. */
function tokenIsImported(doc) {
  const base = norm(doc.baselineTokenImg);
  if (!base) return false;
  return samePath(doc.tokenImg, base) || baseName(doc.tokenImg).toLowerCase() === baseName(base).toLowerCase();
}
function stateFor(doc) {
  const state = imageState(doc);
  return AUTO_TICK.has(state) && tokenSetApart(doc) ? 'edited' : state;
}
function noteFor(doc, state) {
  if (state === 'edited' && tokenSetApart(doc) && AUTO_TICK.has(imageState(doc))) return 'This token has its own image. Choose Yes to replace the portrait and the token image.';
  return state === 'edited' ? 'This image was set in Foundry. Choose Yes to replace it.' : state === 'imported' ? 'This record came with its own image. Choose Yes to replace it.' : '';
}
/** The fields of a row for one record and one file. */
function rowFields(doc, file) {
  const state = stateFor(doc);
  return {uuid: doc.uuid, documentName: doc.documentName, type: doc.type ?? '', name: doc.name, fileName: file.name, from: doc.img ?? '',
    fromToken: doc.documentName === 'Actor' ? (doc.tokenImg ?? '') : '', to: file.path, state, stateLabel: STATE_LABEL[state],
    checked: AUTO_TICK.has(state), noteText: noteFor(doc, state), sourceId: doc.sourceId ?? '', ...ringFields(doc)};
}
/** For an Actor with a ring rule: the colour word, and whether its ring is already on (then it is left alone). */
function ringFields(doc) {
  const look = ringKindFor(doc);
  return {ringLabel: look?.label ?? '', ringKept: Boolean(look && doc.ringEnabled), ringTokens: look && !doc.ringEnabled ? Number(doc.ringTokens) || 0 : 0};
}
const BLANK_FIELDS = Object.freeze({uuid: '', documentName: '', type: '', fileName: '', from: '', fromToken: '', to: '', state: 'default', stateLabel: '', checked: false, noteText: '', sourceId: '', ringLabel: '', ringKept: false, ringTokens: 0});

/**
 * The preview table. `docs` are plain {uuid, documentName, type, name, sourceId, img, tokenImg, flags, baselineImg} for the
 * world's Manager-imported documents (`tokenImg` only matters for Actors). Files are matched in this order:
 *   1. a file named after a record's permanent id (exact, wins);
 *   2. by name: the whole name, then first and last name, then a single first or last name (Actors only for the partial
 *      ones; at least 3 letters and not a very common word). Words like portrait, token, final, sizes and numbers in the
 *      file name are ignored, and so are titles (Mr, Dame, the) in the record name.
 * A file that fits several records equally, or a record that fits several files equally, is never picked for you: its row
 * is `needsPick` with `candidates` and starts unticked. Returns {rows, unmatched, unmatchedFiles}:
 *   rows            {key, uuid, documentName, type, name, fileName, from, fromToken, to, state, stateLabel, checked,
 *                   noteText, alsoFound, matchKind, reason, rank, needsPick, pickBy, candidates, chosen};
 *   unmatched       records no file matched, by id or by name (counted, not listed);
 *   unmatchedFiles  image files that fit no record;
 *   fits, ambiguous, linked  Sets of file paths: fits some record, fits several records equally (needs a pick), is already the
 *                   image of a record. Used by classifyFiles (asset-stage.js) for the staged upload and the no-match list.
 */
export function planAssetLinks(docs, files) {
  const bound = docs.filter(d => d.sourceId);
  const linkable = bound.filter(d => LINKABLE_KINDS.includes(d.documentName) && (d.documentName !== 'JournalEntry' || typeof d.img === 'string'));
  const idMatches = matchFilesToIds(files, new Set(bound.map(d => d.sourceId)));
  const idPaths = new Set([...idMatches.values()].flatMap(h => [h.file.path, ...h.others.map(o => o.path)]));
  const rows = [], covered = new Set(), idDone = new Set();
  const fits = new Set(), ambiguous = new Set(), linked = new Set(); // file paths: fits a record / fits several / already a record's image
  for (const h of idMatches.values()) { fits.add(h.file.path); for (const o of h.others) fits.add(o.path); }
  const imgs = new Set(bound.flatMap(d => [d.img, d.tokenImg]).filter(Boolean).map(cleanPath));
  for (const f of files ?? []) if (imgs.has(cleanPath(f.path))) linked.add(f.path);
  const make = (fields, extra) => ({key: fields.uuid, alsoFound: [], alsoFits: [], needsPick: false, pickBy: '', candidates: [], chosen: '', ...fields, ...extra});

  // 1. permanent-id files
  for (const doc of linkable) {
    const hit = idMatches.get(String(doc.sourceId).toLowerCase());
    if (!hit) continue;
    idDone.add(doc.uuid); covered.add(doc.uuid);
    if (samePath(doc.img, hit.file.path)) continue; // already linked: nothing to do
    rows.push(make(rowFields(doc, hit.file), {alsoFound: hit.others.map(o => o.name), matchKind: 'id', reason: MATCH_REASONS.id, rank: MATCH_RANK.id}));
  }

  // 2. name guesses for the files the id step did not use, and the records it did not fill
  const recs = linkable.filter(d => !idDone.has(d.uuid)).map(d => ({doc: d, words: nameWords(d.name)})).filter(r => r.words.length);
  const guessFiles = (files ?? []).filter(f => isImageName(f.name) && !idPaths.has(f.path)).map(f => ({file: f, words: fileWords(f.name)})).filter(f => f.words.length);
  const byRecord = new Map(); // uuid → [{file, level}] from files that single out this record
  for (const f of guessFiles) {
    let best = 0, list = [];
    for (const r of recs) {
      if (samePath(r.doc.img, f.file.path)) { covered.add(r.doc.uuid); linked.add(f.file.path); continue; }
      const level = matchLevel(f.words, r.words, {partial: r.doc.documentName === 'Actor'});
      if (!level) continue;
      if (level.rank > best) { best = level.rank; list = [{rec: r, level}]; } else if (level.rank === best) list.push({rec: r, level});
    }
    if (!list.length) continue;
    fits.add(f.file.path);
    for (const c of list) covered.add(c.rec.doc.uuid);
    if (list.length > 1) ambiguous.add(f.file.path);
    if (list.length === 1) { (byRecord.get(list[0].rec.doc.uuid) ?? byRecord.set(list[0].rec.doc.uuid, []).get(list[0].rec.doc.uuid)).push({file: f.file, level: list[0].level, rec: list[0].rec}); continue; }
    // a tie between records: ask
    const candidates = list.map(c => ({value: c.rec.doc.uuid, label: `${c.rec.doc.name} (${kindWord(c.rec.doc)})`, fields: rowFields(c.rec.doc, f.file), level: c.level}))
      .sort((a, b) => a.label.localeCompare(b.label));
    rows.push(make({...BLANK_FIELDS, name: f.file.name, fileName: f.file.name, to: ''}, {key: `file:${f.file.path}`, matchKind: list[0].level.kind, reason: 'More than one record fits this file. Pick the right one.',
      rank: best, needsPick: true, pickBy: 'file', candidates, filePath: f.file.path}));
  }
  for (const [, edges] of byRecord) {
    const top = Math.max(...edges.map(e => e.level.rank));
    const best = edges.filter(e => e.level.rank === top);
    const doc = best[0].rec.doc;
    const weaker = edges.filter(e => e.level.rank < top).map(e => e.file.name);
    if (best.length === 1) {
      rows.push(make(rowFields(doc, best[0].file), {alsoFits: weaker, matchKind: best[0].level.kind, reason: best[0].level.reason, rank: top}));
    } else {
      for (const e of best) ambiguous.add(e.file.path);
      const candidates = best.map(e => ({value: e.file.path, label: e.file.name, fields: rowFields(doc, e.file), level: e.level})).sort((a, b) => a.label.localeCompare(b.label));
      rows.push(make({...BLANK_FIELDS, uuid: doc.uuid, documentName: doc.documentName, type: doc.type ?? '', name: doc.name}, {alsoFits: weaker, key: doc.uuid, matchKind: best[0].level.kind,
        reason: 'More than one file fits this record. Pick the right one.', rank: top, needsPick: true, pickBy: 'record', candidates}));
    }
  }
  const order = r => [r.needsPick ? 1 : 0, -r.rank, isNpcActor(r) ? 0 : 1];
  rows.sort((a, b) => { const x = order(a), y = order(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return a.name.localeCompare(b.name); });
  const unmatched = linkable.filter(d => !covered.has(d.uuid)).length;
  const used = new Set(rows.flatMap(r => [r.to, r.filePath, ...r.candidates.flatMap(c => [c.fields.to])]).filter(Boolean));
  const imageFiles = (files ?? []).filter(f => isImageName(f.name));
  for (const p of used) fits.add(p);
  return {rows, unmatched, unmatchedFiles: imageFiles.filter(f => !idPaths.has(f.path) && !used.has(f.path)).length, fits, ambiguous, linked};
}

/**
 * Chooses a candidate on a `needsPick` row (a file for a record, or a record for a file). Choosing fills the row and ticks it
 * the same way a normal row is ticked (so a record whose image the GM set stays unticked). An empty value clears the choice.
 */
export function resolvePick(row, value) {
  if (!row?.needsPick) return row;
  const pick = row.candidates.find(c => c.value === value);
  if (!pick) {
    const keep = row.pickBy === 'file' ? {name: row.name, fileName: row.fileName} : {uuid: row.uuid, documentName: row.documentName, type: row.type, name: row.name};
    Object.assign(row, BLANK_FIELDS, keep, {chosen: ''});
    if (row.pickBy === 'record') { row.fileName = ''; }
    return row;
  }
  Object.assign(row, pick.fields, {chosen: value});
  if (row.pickBy === 'file') row.name = pick.fields.name;
  return row;
}

// ---------- Per-row choices (0.60.13): Yes, No, or a different record ----------
const KIND_GROUP = {npc: 0, actor: 1, Item: 2, RollTable: 3, Macro: 4, JournalEntry: 5};
const KIND_CHIP = {Item: 'Item', RollTable: 'Roll table', Macro: 'Macro', JournalEntry: 'Journal'};
const groupOf = d => (d.documentName === 'Actor' ? (d.type === 'npc' ? KIND_GROUP.npc : KIND_GROUP.actor) : KIND_GROUP[d.documentName] ?? 9);
const chipOf = d => (d.documentName === 'Actor' ? (d.type === 'npc' ? 'NPC' : 'Actor') : KIND_CHIP[d.documentName] ?? d.documentName);

/** Every record this tab can link, for the "Different record" picker: NPCs, other Actors, Items, tables, macros, journals; by name. */
export function linkableRecords(docs) {
  return (docs ?? []).filter(d => d.sourceId && LINKABLE_KINDS.includes(d.documentName) && (d.documentName !== 'JournalEntry' || typeof d.img === 'string'))
    .map(d => ({uuid: d.uuid, name: d.name, documentName: d.documentName, type: d.type ?? '', kindLabel: chipOf(d), group: groupOf(d)}))
    .sort((a, b) => a.group - b.group || a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
}
/** Records whose name contains every word typed (case-insensitive). Empty search lists all. */
export function filterRecords(records, query) {
  const words = norm(query).toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? records.filter(r => words.every(w => `${r.name} ${r.kindLabel}`.toLowerCase().includes(w))) : records;
}

/** A row that can be written: a file, a record, and (if it was a pick) a pick made. */
export const rowReady = r => Boolean(r?.to && r.uuid && !(r.needsPick && !r.chosen));
/** Keys of ticked rows that name a record another ticked row also names (two files for one record). */
export function linkConflicts(rows) {
  const byRecord = new Map();
  for (const r of rows ?? []) if (r.checked && rowReady(r)) (byRecord.get(r.uuid) ?? byRecord.set(r.uuid, []).get(r.uuid)).push(r.key);
  return new Set([...byRecord.values()].filter(keys => keys.length > 1).flat());
}
/** {willLink, skipped, conflicts, undecided} for the count line. A conflicting row counts as skipped until one is chosen. */
export function linkCounts(rows) {
  const list = rows ?? [], conflicts = linkConflicts(list);
  const willLink = list.filter(r => r.checked && rowReady(r) && !conflicts.has(r.key)).length;
  return {willLink, skipped: list.length - willLink, conflicts: conflicts.size, undecided: list.filter(r => r.needsPick && !r.chosen).length};
}
/** Yes or No on one row. Yes needs a file and a record (a row still waiting for a pick stays unchosen). Returns whether it changed. */
export function setRowChoice(row, choice) {
  if (choice === 'yes') { if (!rowReady(row)) return false; row.checked = true; return true; }
  if (choice === 'no') { row.checked = false; return true; }
  return false;
}
/** Yes to every ready row except images set in Foundry (those need their own explicit Yes); No to all. Returns the number of rows changed. */
export function setAllChoices(rows, choice) {
  let n = 0;
  for (const r of rows ?? []) {
    if (choice === 'yes' && (!rowReady(r) || !AUTO_TICK.has(r.state))) continue;
    const want = choice === 'yes';
    if (r.checked !== want) { r.checked = want; n++; }
  }
  return n;
}
/**
 * "Different record": gives this row's file to another record instead. The row takes that record's name, images and notes; it
 * is Yes when that record's image is blank, a placeholder or ours, and No (needs an explicit Yes) when it was set in Foundry or
 * already shows this file. Nothing is written. `doc` is a plain record as planAssetLinks takes. Returns the row, or null when it
 * cannot be done (no file yet, or not a linkable record).
 */
export function assignRecord(row, doc) {
  const path = row?.to || row?.filePath;
  if (!row || !path || !doc || !LINKABLE_KINDS.includes(doc.documentName) || !doc.uuid) return null;
  const fields = rowFields(doc, {name: row.fileName, path});
  Object.assign(row, fields, {needsPick: false, pickBy: '', chosen: '', alsoFound: [], alsoFits: [], reassigned: true, filePath: path,
    reason: 'You chose this record', matchKind: 'chosen'});
  if (samePath(doc.img, path)) { row.checked = false; row.noteText = 'This record already shows this file.'; }
  return row;
}

/**
 * Writes the ticked rows' images. deps: {user, moduleId, getDoc(uuid), updateMany(documentName, updates[]), onProgress, signal}.
 * A document whose image changed since the preview, that is gone, or that is not a linkable kind is skipped; so is a record
 * that an earlier ticked row already set. A row still waiting for a pick is not written.
 * Item, table, macro and journal rows write `img` and Manager's own icon flags. An Actor row writes ONLY its portrait
 * (`img`) and its prototype token image (`prototypeToken.texture.src`): no flags, nothing else. With `tokenRing` true (the
 * "Turn on token ring" box, on by default in the window) an Actor that has a ring rule (token-ring.js) and whose ring is
 * still off also gets Foundry's ring turned on with the rule's colours; an Actor whose ring is already on, or that has no
 * rule, is left exactly as it is. GM only, checked here. `applied` entries carry `ring`: 'enabled', 'kept' or ''.
 */
export async function applyAssetLinks(rows, {user, moduleId, getDoc, updateMany, tokenRing = false, sceneTokens = false, getTokens = () => [], updateTokens = async () => {}, onProgress = () => {}, signal = null, chunk = LINK_CHUNK} = {}) {
  if (!isGM(user)) return {ok: false, message: GM_ONLY, applied: [], skipped: [], errors: []};
  const applied = [], skipped = [], errors = [], seen = new Set();
  const ringOf = new Map(); // uuid → 'enabled' | 'kept' | ''
  const tokenPlans = []; // {name, scenes: Map(sceneId → updates[])} for Actors whose ring this call turned on
  let tokensDone = 0;
  const todo = (rows ?? []).filter(r => r?.checked && r.to && r.uuid && !(r.needsPick && !r.chosen));
  let cancelled = false;
  for (let start = 0; start < todo.length; start += chunk) {
    if (signal?.aborted) { cancelled = true; break; }
    const batch = {};
    tokenPlans.length = 0;
    for (const row of todo.slice(start, start + chunk)) {
      const doc = getDoc(row.uuid);
      if (!doc) { skipped.push({name: row.name, why: 'no longer in the world'}); continue; }
      if (!LINKABLE_KINDS.includes(doc.documentName)) { skipped.push({name: row.name, why: 'this kind of record is not changed here'}); continue; }
      if (seen.has(row.uuid)) { skipped.push({name: row.name, why: 'another ticked row already set it'}); continue; }
      if (!samePath(doc.img, row.from) && !(norm(doc.img) === '' && norm(row.from) === '')) { skipped.push({name: row.name, why: 'its image changed since the preview'}); continue; }
      if (doc.documentName === 'Actor') {
        const token = doc.prototypeToken?.texture?.src;
        if (!samePath(token, row.fromToken) && !(norm(token) === '' && norm(row.fromToken) === '')) { skipped.push({name: row.name, why: 'its token image changed since the preview'}); continue; }
      }
      seen.add(row.uuid);
      (batch[doc.documentName] ??= []).push({row, doc});
    }
    for (const [documentName, list] of Object.entries(batch)) {
      try {
        await updateMany(documentName, list.map(({row, doc}) => {
          if (documentName !== 'Actor') return {_id: doc.id, img: row.to, ...iconFlagUpdate(moduleId, {img: row.to, source: 'authored'})};
          const ring = tokenRing ? ringUpdateFor({documentName, type: doc.type, sourceId: row.sourceId, prototypeToken: doc.prototypeToken}) : {update: {}, status: 'none'};
          ringOf.set(row.uuid, ring.status === 'enable' ? 'enabled' : ring.status === 'kept' ? 'kept' : '');
          if (sceneTokens && ring.status === 'enable') {
            const scenes = new Map();
            for (const t of getTokens(doc) ?? []) {
              const upd = tokenRingUpdateFor(ring.look, t);
              if (Object.keys(upd).length) (scenes.get(t.sceneId) ?? scenes.set(t.sceneId, []).get(t.sceneId)).push({_id: t.id, ...upd});
            }
            if (scenes.size) tokenPlans.push({name: row.name, scenes, uuid: row.uuid});
          }
          return {_id: doc.id, img: row.to, [TOKEN_IMAGE_FIELD]: row.to, ...ring.update};
        }));
        for (const {row} of list) applied.push({name: row.name, from: row.from, to: row.to, ring: ringOf.get(row.uuid) ?? ''});
        for (const plan of tokenPlans.splice(0)) {
          if (!applied.some(a => a.name === plan.name)) continue;
          for (const [sceneId, updates] of plan.scenes) {
            try { await updateTokens(sceneId, updates); tokensDone += updates.length; }
            catch (error) { errors.push({documentName: 'Token', message: String(error?.message ?? error)}); }
          }
        }
      } catch (error) {
        errors.push({documentName, message: String(error?.message ?? error)});
        for (const {row} of list) skipped.push({name: row.name, why: 'the write failed'});
      }
    }
    onProgress({done: Math.min(start + chunk, todo.length), total: todo.length});
  }
  const rings = applied.filter(a => a.ring === 'enabled').length, ringsKept = applied.filter(a => a.ring === 'kept').length;
  const message = `${applied.length} image(s) linked${rings ? `, ${rings} token ring(s) turned on` : ''}${ringsKept ? `, ${ringsKept} already had a ring (left as it is)` : ''}${tokensDone ? `, ${tokensDone} token(s) already on scenes updated` : ''}${skipped.length ? `, ${skipped.length} skipped (${[...new Set(skipped.map(s => s.why))].join('; ')})` : ''}${errors.length ? `, ${errors.length} write error(s): ${errors[0].message}` : ''}${cancelled ? '; cancelled: the rest were not changed' : ''}.`;
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
      fileWaiting: Boolean(foundNames?.has(String(doc.sourceId).toLowerCase())), linkable: LINKABLE_KINDS.includes(doc.documentName)});
  }
  return rows.sort((a, b) => a.documentName.localeCompare(b.documentName) || a.name.localeCompare(b.name));
}
