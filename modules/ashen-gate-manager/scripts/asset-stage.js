/**
 * Items → Assets (0.65.0): match files BEFORE they are uploaded, and tidy the ones that fit no record.
 *
 * Dropping or choosing files no longer uploads them at once. The file NAMES are matched first (no network): the same name
 * matching Link uses (record ids, record names, Cinder stage art). The GM sees "X files: Y matched, Z with no match", ticks
 * which files to upload (files that fit no record start UNTICKED, see UPLOAD_UNMATCHED_BY_DEFAULT) and presses one button.
 *
 * Files already in the library that fit no record are listed in Link files to records. Foundry's FilePicker and The Forge's
 * Assets Library give modules no delete (see the CHANGELOG), so Manager does NOT delete: it builds a list of the paths that are
 * safe to delete (fit no record, are not any record's image, are in the folder being viewed) for the GM to delete in the Assets
 * Library. `removalList` is the guard for that list and refuses anything else.
 *
 * Pure (no Foundry), GM only: every function checks the user itself.
 */
import {isImageName, joinPath, cleanPath, triageUploads} from './assets.js';

/** Whether files that fit no record are ticked for upload when they are dropped. The GM asked for NOT uploading them. */
export const UPLOAD_UNMATCHED_BY_DEFAULT = false;
export const STATUS = Object.freeze({matched: 'matched', ambiguous: 'ambiguous', unmatched: 'unmatched', linked: 'linked'});
export const STATUS_LABEL = Object.freeze({matched: 'Matched', ambiguous: 'Needs a pick', unmatched: 'No match', linked: 'Already linked'});
export const NO_MATCH_REASON = 'No record fits this file name.';
const GM_ONLY = 'Only a GM can manage assets.';
const isGM = user => Boolean(user?.isGM);

/**
 * Says what each file is, from the plan Link made for the same files.
 * `files` are {name, path, folder?}; `plan` is planAssetLinks' result (it carries the fits / ambiguous / linked path sets);
 * `cinderRows` and `plan` come from the same planning call; `inUse` is a Set of image paths other documents in the world use.
 * Statuses: 'matched' (fits one record or is Cinder stage art), 'ambiguous' (fits several records or Cinders equally: needs a pick),
 * 'linked' (already the image of a record, or used elsewhere in the world), 'unmatched' (fits nothing).
 * Returns [{name, path, folder, status, reason}] in the order given.
 */
export function classifyFiles(files, {plan = {}, cinderRows = [], inUse = new Set()} = {}) {
  const stageSeen = new Map(), extras = new Map(); // path → needsPick ; name → why
  for (const row of cinderRows ?? []) {
    for (const f of row.stageFiles?.values?.() ?? []) stageSeen.set(f.path, Boolean(row.needsPick && !row.chosen));
    for (const e of row.extras ?? []) extras.set(String(e.name).toLowerCase(), e.why);
  }
  const used = new Set([...(inUse ?? [])].map(cleanPath));
  const out = [];
  for (const f of files ?? []) {
    const base = {name: f.name, path: f.path, folder: f.folder};
    if (stageSeen.has(f.path)) out.push({...base, status: stageSeen.get(f.path) ? STATUS.ambiguous : STATUS.matched, reason: stageSeen.get(f.path) ? 'More than one Cinder fits. Pick the right one.' : 'Cinder stage art'});
    else if (extras.has(String(f.name).toLowerCase())) out.push({...base, status: STATUS.unmatched, reason: extras.get(String(f.name).toLowerCase())});
    else if (plan.linked?.has(f.path) || used.has(cleanPath(f.path))) out.push({...base, status: STATUS.linked, reason: 'Already the image of a record.'});
    else if (plan.ambiguous?.has(f.path)) out.push({...base, status: STATUS.ambiguous, reason: 'More than one record fits. Pick the right one.'});
    else if (plan.fits?.has(f.path)) out.push({...base, status: STATUS.matched, reason: 'Fits a record'});
    else out.push({...base, status: STATUS.unmatched, reason: NO_MATCH_REASON});
  }
  return out;
}

// ---------- Before uploading ----------
/**
 * Stages dropped or chosen files. `classify(pseudoFiles)` answers classifyFiles for files given a path in the folder being viewed.
 * Unusable files (not images, odd names, repeats) are `rejected`. `existing` are file names already in the folder.
 * Returns {ok, message, items:[{id, file, name, status, label, reason, exists, upload}], rejected}. `upload` starts true for matched and
 * ambiguous files, and UPLOAD_UNMATCHED_BY_DEFAULT for files that fit nothing. Nothing is uploaded here.
 */
export function stageFiles(files, {user, target = '', existing = [], classify, defaultUnmatched = UPLOAD_UNMATCHED_BY_DEFAULT} = {}) {
  if (!isGM(user)) return {ok: false, message: GM_ONLY, items: [], rejected: []};
  const {accepted, rejected} = triageUploads(files);
  const pseudo = accepted.map(file => ({name: file.name, path: joinPath(target, file.name)}));
  const kinds = typeof classify === 'function' ? classify(pseudo) : classifyFiles(pseudo);
  const have = new Set((existing ?? []).map(n => String(n).toLowerCase()));
  const items = accepted.map((file, i) => {
    const k = kinds[i] ?? {status: STATUS.unmatched, reason: NO_MATCH_REASON};
    const status = k.status === STATUS.linked ? STATUS.matched : k.status;
    return {id: `stage-${i}`, file, name: file.name, status, label: STATUS_LABEL[status], reason: k.reason, exists: have.has(file.name.toLowerCase()),
      upload: status === STATUS.unmatched ? Boolean(defaultUnmatched) : true};
  });
  return {ok: true, message: '', items, rejected};
}

/** {total, matched, ambiguous, unmatched, toUpload, skipped, unmatchedTicked, line}: "5 files: 3 matched, 1 needs a pick, 1 with no match". */
export function stageSummary(items) {
  const list = items ?? [], n = s => list.filter(i => i.status === s).length;
  const total = list.length, matched = n(STATUS.matched), ambiguous = n(STATUS.ambiguous), unmatched = n(STATUS.unmatched);
  const toUpload = list.filter(i => i.upload).length;
  const parts = [`${matched} matched`, ...(ambiguous ? [`${ambiguous} need${ambiguous === 1 ? 's' : ''} a pick`] : []), `${unmatched} with no match`];
  return {total, matched, ambiguous, unmatched, toUpload, skipped: total - toUpload, unmatchedTicked: list.filter(i => i.status === STATUS.unmatched && i.upload).length,
    line: `${total} file${total === 1 ? '' : 's'}: ${parts.join(', ')}.`};
}
/** Ticks or unticks one file. Returns whether anything changed. */
export function setFileUpload(items, id, on) {
  const item = (items ?? []).find(i => i.id === id);
  if (!item || item.upload === Boolean(on)) return false;
  item.upload = Boolean(on);
  return true;
}
/** "Upload unmatched files too": ticks or unticks every file that fits no record. Returns the number changed. */
export function setUnmatchedUpload(items, on) {
  let n = 0;
  for (const i of items ?? []) if (i.status === STATUS.unmatched && i.upload !== Boolean(on)) { i.upload = Boolean(on); n++; }
  return n;
}
/** 'all' | 'none' | 'some' of the files that fit no record (drives the bulk tick box; 'none' also when there are no such files). */
export function unmatchedTickState(items) {
  const u = (items ?? []).filter(i => i.status === STATUS.unmatched);
  if (!u.length || u.every(i => !i.upload)) return 'none';
  return u.every(i => i.upload) ? 'all' : 'some';
}
/** What the Upload button sends: only the ticked files. `skipped` are the unticked ones (not uploaded, not deleted). GM only. */
export function uploadSelection(items, {user} = {}) {
  if (!isGM(user)) return {ok: false, message: GM_ONLY, files: [], skipped: []};
  const list = items ?? [];
  return {ok: true, message: '', files: list.filter(i => i.upload).map(i => i.file), skipped: list.filter(i => !i.upload).map(i => i.name)};
}

// ---------- Files already in the library that fit no record ----------
/**
 * The files in the folder being viewed that fit no record, from classifyFiles. Files in folders below (a scan goes down several
 * levels) are left out and counted in `below`, so the list never reaches outside the folder being viewed. GM only.
 */
export function unmatchedInFolder(classified, {user, target = ''} = {}) {
  if (!isGM(user)) return {files: [], below: 0};
  const here = joinPath(target), list = classified ?? [];
  const inHere = f => isImageName(f.name) && joinPath(f.folder ?? target) === here;
  return {files: list.filter(f => f.status === STATUS.unmatched && inHere(f)), below: list.filter(f => f.status === STATUS.unmatched && !inHere(f)).length};
}

/**
 * The guard for deleting files from the library. Foundry gives modules no way to delete, so today the result is a list for the GM to
 * delete in the Assets Library; the same rules would guard a real delete. Of the `paths` asked for, only a file that is in `classified`,
 * fits no record, is not any record's image and is directly in the folder being viewed is allowed. GM only: for anyone else nothing is allowed.
 * Returns {ok, message, allowed:[{name, path, library}], refused:[{path, why}]}; `library` is the folder-and-name to look for in the Assets Library.
 */
export function removalList(paths, classified, {user, target = ''} = {}) {
  if (!isGM(user)) return {ok: false, message: GM_ONLY, allowed: [], refused: []};
  const here = joinPath(target), byPath = new Map((classified ?? []).map(f => [f.path, f]));
  const allowed = [], refused = [];
  for (const path of [...new Set(paths ?? [])]) {
    const f = byPath.get(path);
    if (!f) refused.push({path, why: 'Not one of the files that were checked.'});
    else if (f.status === STATUS.linked) refused.push({path, why: 'It is the image of a record or used elsewhere in the world.'});
    else if (f.status !== STATUS.unmatched) refused.push({path, why: 'It fits a record.'});
    else if (joinPath(f.folder ?? target) !== here) refused.push({path, why: 'It is outside the folder you are viewing.'});
    else allowed.push({name: f.name, path, library: joinPath(here, f.name)});
  }
  return {ok: true, message: '', allowed, refused};
}
/** The text copied for the Assets Library: one folder-and-name per line. */
export const removalText = allowed => (allowed ?? []).map(f => f.library).join('\n');
