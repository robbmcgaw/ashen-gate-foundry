import {classifyDelivery} from './delivery.js';
import {SPECIALISTS, STRAIN_CONFIG_ID, detectSpecialistFile, specialistCount, filterSpecialist} from './specialist-handoff.js';
/** Non-executing import bundle loader. JSZip is bundled under its upstream license. */
const PROJECTIONS = ['ag-foundry-import/0.1', 'ag-foundry-import/0.2'];
export const isProjection = obj => PROJECTIONS.includes(obj?.manifest?.schema_version);

/** Opens the ZIP and applies every safety limit; calls onArt/onJson per entry. Nothing in the ZIP is executed. */
async function walkZip(buffer, JSZipClass, {onArt, onJson}) {
  if (!JSZipClass?.loadAsync) throw new Error('Bundled ZIP reader unavailable. Reload Foundry and retry.');
  if (buffer.byteLength > 60_000_000) throw new Error('ZIP exceeds the 60 MB upload limit.');
  const zip = await JSZipClass.loadAsync(buffer, {checkCRC32: true});
  const entries = Object.entries(zip.files).filter(([,entry])=>!entry.dir);
  if(entries.length > 500) throw new Error('ZIP contains more than 500 files. Split the content package.');
  let total = 0;
  for(const [path, entry] of entries) {
    if(path.startsWith('/') || path.includes('\\') || path.split('/').some(part=>part==='..'||part==='.'||!part))
      throw new Error(`Unsafe ZIP entry path: ${path}`);
    const size = entry._data?.uncompressedSize;
    if(typeof size==='number') {
      total += size;
      if(size>25_000_000 || total>100_000_000) throw new Error('ZIP entry or expanded contents exceed safety limits.');
    }
    if(/\.(png|webp|jpe?g)$/i.test(path)) onArt(path.split('/').at(-1), path, entry);
    else if(/\.json$/i.test(path)) {
      if(typeof size==='number' && size>10_000_000) throw new Error(`JSON file ${path} exceeds 10 MB.`);
      await onJson(path, await entry.async('string'));
    }
  }
}

export async function readImportZip(buffer, JSZipClass = globalThis.JSZip) {
  const projections = [], assets = new Map();
  await walkZip(buffer, JSZipClass, {
    onArt(basename, path, entry) {
      if(assets.has(basename)) throw new Error(`ZIP contains duplicate artwork filename ${basename}; cannot choose automatically.`);
      assets.set(basename,{path,entry});
    },
    async onJson(path, text) {
      let obj;
      try {obj=JSON.parse(text);} catch {throw new Error(`Invalid JSON inside ZIP: ${path}`);}
      if(isProjection(obj)) projections.push({filename:path,pkg:obj});
    }
  });
  if(!projections.length) throw new Error('ZIP contains no ag-foundry-import/0.1 or /0.2 projection JSON. Canonical source JSON and Macro JSON are not installed automatically.');
  if(projections.length!==1) throw new Error(`ZIP contains ${projections.length} Manager import projections; extract and choose the intended JSON directly. No world changes made.`);
  return {...projections[0],assets};
}

/** Import order: Manager packages first (specialist files such as Factions depend on their Actors), then each specialist. */
export const BUNDLE_ORDER = Object.freeze(['manager', 'quests', 'skill-trees', 'strain', 'headquarters', 'factions']);
export const BUNDLE_LABELS = Object.freeze({manager: 'Manager package', ...Object.fromEntries(Object.entries(SPECIALISTS).map(([k, s]) => [k, s.label]))});
export const MAX_BUNDLE_FILES = 50;

/** Record ids a detected file carries (Manager records, trees, definitions or facilities). */
export function bundleRecordIds(kind, payload) {
  if (kind === 'strain') return [STRAIN_CONFIG_ID];
  const list = kind === 'manager' ? payload?.records : kind === 'skill-trees' ? payload?.trees : kind === 'factions' ? payload?.definitions
    : Array.isArray(payload) ? payload : payload?.records;
  return Array.isArray(list) ? list.map(r => r?.id).filter(id => typeof id === 'string' && id) : [];
}

/**
 * Reads a ZIP that may hold several import files: Manager projections and the specialist files Manager already
 * recognises one at a time (Quest Log, Skill Trees, Headquarters, Factions). Other JSON is listed as skipped.
 * Same safety limits as readImportZip; reading never writes to the world. Duplicate artwork basenames are left out
 * of the asset map (cannot choose) and reported; ids already used by an earlier file in the ZIP are reported and
 * dropped from the later file so one file never overwrites another.
 */
export async function readImportBundle(buffer, JSZipClass = globalThis.JSZip) {
  const files = [], skipped = [], assets = new Map(), duplicateArt = new Set();
  await walkZip(buffer, JSZipClass, {
    onArt(basename, path, entry) {
      if(assets.has(basename) || duplicateArt.has(basename)) {assets.delete(basename); duplicateArt.add(basename);}
      else assets.set(basename, {path, entry});
    },
    async onJson(path, text) {
      let obj;
      try {obj = JSON.parse(text);} catch {files.push({filename: path, kind: null, label: 'Invalid JSON', count: 0, status: 'error', notice: 'Not valid JSON; this file cannot be imported.', payload: null}); return;}
      if(isProjection(obj)) {
        const count = Array.isArray(obj.records) ? obj.records.length : 0;
        files.push({filename: path, kind: 'manager', label: BUNDLE_LABELS.manager, count, payload: obj,
          status: count ? 'ok' : 'error', notice: !count ? 'The package has no records.' : obj.manifest.schema_version.endsWith('/0.1') ? 'Legacy 0.1 package: accepted for compatibility.' : ''});
        return;
      }
      const kind = detectSpecialistFile(obj);
      if(kind) {
        const count = specialistCount(kind, obj);
        files.push({filename: path, kind, label: BUNDLE_LABELS[kind], count, payload: obj, status: count ? 'ok' : 'error', notice: count ? '' : 'The file has no records.'});
        return;
      }
      const delivery = classifyDelivery(obj);
      skipped.push({filename: path, reason: delivery?.notice ?? 'Not a Manager package or a Quest, Skill Tree, Headquarters or Factions file.'});
    }
  });
  if(files.length > MAX_BUNDLE_FILES) throw new Error(`ZIP holds ${files.length} import files; the limit is ${MAX_BUNDLE_FILES}. Split it into smaller ZIPs. No world changes made.`);
  // A Manager file holding only Route records goes after the other Manager files, so the locations it joins import first.
  const routesOnly = f => f.kind === 'manager' && f.count > 0 && f.payload.records.every(r => r?.entity_type === 'Route');
  files.sort((a, b) => (a.kind ? BUNDLE_ORDER.indexOf(a.kind) : 99) - (b.kind ? BUNDLE_ORDER.indexOf(b.kind) : 99) || routesOnly(a) - routesOnly(b) || a.filename.localeCompare(b.filename));
  const owner = new Map();
  for(const file of files) {
    file.duplicateIds = [];
    for(const id of bundleRecordIds(file.kind, file.payload)) {
      if(owner.has(id) && owner.get(id) !== file.filename) file.duplicateIds.push(id);
      else owner.set(id, file.filename);
    }
    if(file.duplicateIds.length) {
      const left = file.count - file.duplicateIds.length;
      file.notice = [file.notice, `${file.duplicateIds.length} id(s) also in an earlier file of this ZIP are left out (not overwritten): ${file.duplicateIds.slice(0, 5).join(', ')}${file.duplicateIds.length > 5 ? ', …' : ''}.`].filter(Boolean).join(' ');
      if(file.status === 'ok') file.status = left > 0 ? 'warning' : 'error';
    }
  }
  return {files, skipped, assets, duplicateArt: [...duplicateArt]};
}

/** The file's payload without the ids an earlier file in the ZIP already carries. */
export function withoutDuplicates(file) {
  if(!file.duplicateIds?.length) return file.payload;
  if(file.kind === 'manager') {const drop = new Set(file.duplicateIds); return {...file.payload, records: file.payload.records.filter(r => !drop.has(r?.id))};}
  const drop = new Set(file.duplicateIds);
  return filterSpecialist(file.kind, file.payload, bundleRecordIds(file.kind, file.payload).filter(id => !drop.has(id)));
}

/**
 * The files the GM ticked, in import order, ready to load one at a time into the normal preview / Apply flow.
 * GM-only: a player cannot plan a ZIP import. Files with errors are never queued.
 */
export function planBundleImport(bundle, picked, {isGM = false} = {}) {
  if(!isGM) throw new Error('Only a GM may import content.');
  const chosen = new Set(picked ?? []);
  return bundle.files.filter(f => f.kind && f.status !== 'error' && chosen.has(f.filename))
    .map(f => ({filename: f.filename, kind: f.kind, label: f.label, payload: withoutDuplicates(f)}));
}

/**
 * "Import everything without stopping" (0.50.0): the preview rows auto mode ticks. Only rows the manual flow could tick
 * are ever chosen. New records and metadata refreshes are always ticked; rows that change a record already in the world
 * (an update, or an icon-only fill) only when `updates` is on, otherwise they are returned as needing the GM's decision.
 * 0.52.2: Blocked and Conflict rows (auto mode never applies them) are always returned as needing the GM's decision too,
 * so they are listed by name with their reason instead of being counted as skipped.
 */
const AUTO_SAFE = new Set(['create', 'metadata']);
const AUTO_UPDATE = new Set(['update', 'icon']);
const AUTO_REVIEW = new Set(['blocked', 'conflict']);
const AUTO_UNCHANGED = new Set(['unchanged', 'local']);
const KEPT = /kept|already|exists|unchanged/i;
const needsGM = action => AUTO_UPDATE.has(action) || AUTO_REVIEW.has(action);
export function autoSelect(rows, {updates = false} = {}) {
  const selected = [], needsDecision = [];
  for(const row of rows ?? []) {
    if(AUTO_SAFE.has(row.action) || (updates && AUTO_UPDATE.has(row.action))) selected.push(row.id);
    else if(needsGM(row.action)) needsDecision.push(row);
  }
  return {selected, needsDecision};
}

/**
 * The "Needs your decision" line for one file: updates by name, then Blocked / Conflict rows grouped by their reason
 * ("A, B; Blocked (reason): C, D"), so the GM sees why each one was not imported.
 */
export function decisionText(rows = []) {
  const updates = rows.filter(r => AUTO_UPDATE.has(r.action)).map(r => r.name);
  const groups = new Map();
  for(const r of rows.filter(r => AUTO_REVIEW.has(r.action))) {
    const key = `${r.action === 'conflict' ? 'Conflict' : 'Blocked'} (${r.reason || 'no reason given'})`;
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r.name);
  }
  return [updates.length ? updates.join(', ') : null, ...[...groups].map(([k, names]) => `${k}: ${names.join(', ')}`)].filter(Boolean).join('; ');
}

/**
 * One file's line in the auto-mode summary: what happened to each preview row, from the apply's own log results.
 * Tones and labels are the Import results panel's (Done / Done with notes / Needs attention).
 */
export function autoFileCounts(rows = [], selectedIds = [], results = []) {
  const counts = {created: 0, updated: 0, unchanged: 0, needsDecision: 0, skipped: 0, failed: 0};
  const picked = new Set(selectedIds);
  const aborted = results.some(r => r.action === 'import-aborted');
  for(const row of rows) {
    if(!picked.has(row.id)) {
      // A specialist module's "already there, kept" row previews as skipped; it is unchanged, like the results panel's Kept.
      const kept = AUTO_UNCHANGED.has(row.action) || (row.action === 'skipped' && KEPT.test(row.reason ?? ''));
      counts[needsGM(row.action) ? 'needsDecision' : kept ? 'unchanged' : 'skipped']++;
      continue;
    }
    const mine = results.filter(r => r.id === row.id);
    const ok = mine.find(r => r.status === 'ok' && ['create', 'update', 'metadata'].includes(r.action));
    const skipped = mine.find(r => r.status === 'skipped');
    if(ok) counts[ok.action === 'create' ? 'created' : ok.action === 'update' ? 'updated' : 'unchanged']++;
    else if(row.action === 'icon' && !aborted && !mine.some(r => r.status === 'error')) counts.updated++;
    else if(skipped) counts[KEPT.test(skipped.message ?? '') ? 'unchanged' : 'skipped']++;
    else counts.failed++;
  }
  const tone = counts.failed ? 'error' : counts.needsDecision || counts.skipped ? 'warn' : 'ok';
  return {counts, tone, toneLabel: {ok: 'Done', warn: 'Done with notes', error: 'Needs attention'}[tone]};
}

/** Plain summary of the ZIP's contents for the Import tab. */
export function bundleSummary(bundle) {
  const importable = bundle.files.filter(f => f.kind && f.status !== 'error').length;
  const parts = [`${bundle.files.length} import file(s) found, ${importable} can be imported`];
  if(bundle.skipped.length) parts.push(`skipped (not an import file): ${bundle.skipped.map(s => s.filename).join(', ')}`);
  if(bundle.duplicateArt.length) parts.push(`artwork with the same file name in more than one folder is not uploaded: ${bundle.duplicateArt.join(', ')}`);
  return `${parts.join('; ')}.`;
}

export function mediaFilename(path) {
  if(typeof path!=='string' || /^(https?:)?\/\//i.test(path))return null;
  const clean=path.split('?')[0].split('#')[0];
  const name=clean.split('/').at(-1);
  return name&&/^[A-Za-z0-9_.-]+\.(png|webp|jpe?g)$/i.test(name)?name:null;
}
export function referencedArtwork(records) {
  const names = new Set();
  for(const rec of records) {
    const data=rec.foundry?.data;
    for(const value of [data?.img,data?.prototypeToken?.texture?.src]) {
      const name=mediaFilename(value);if(name)names.add(name);
    }
  }
  return names;
}
export function adaptRecordArtwork(record, uploadedPaths) {
  if(!uploadedPaths.size) return record;
  const clone=structuredClone(record);
  const data=clone.foundry?.data;
  for(const holder of [data,data?.prototypeToken?.texture]) {
    if(!holder) continue;
    const key=holder===data?'img':'src';
    const basename=mediaFilename(holder[key]);
    if(basename&&uploadedPaths.has(basename)) holder[key]=uploadedPaths.get(basename);
  }
  return clone;
}
/** Upload ZIP-contained *referenced* portraits before creating any world documents.
 * Returned paths are saved only into per-world Foundry projections, never canonical source.
 */
export async function uploadMatchingArt(assets, records, destination, report=()=>{}, filePicker=undefined) {
  const picker=filePicker ?? globalThis.foundry?.applications?.apps?.FilePicker?.implementation;
  if(!picker?.createDirectory || !picker?.upload)throw new Error('Foundry V14 FilePicker upload API unavailable; turn off ZIP portrait upload and upload images manually.');
  if(!/^worlds\/[a-zA-Z0-9_-]+\/ashen-gate-imports\/[a-z0-9-]+$/.test(destination))throw new Error('Unsafe ZIP artwork destination.');
  const selected = [...referencedArtwork(records)].filter(name=>assets.has(name));
  if(!selected.length)return new Map();
  let dir='';
  for(const segment of destination.split('/')) {
    dir=dir?`${dir}/${segment}`:segment;
    try {await picker.createDirectory('data',dir);} catch(e) {
      // Directory may already exist; verify it exists rather than ignoring a permission error.
      try {await picker.browse('data',dir);} catch {throw new Error(`Could not create or access artwork folder ${dir}: ${e.message??e}`);}
    }
  }
  const mapped=new Map();
  for(const basename of selected) {
    const entry=assets.get(basename)?.entry;
    if(!entry)continue;
    const binary=await entry.async('uint8array');
    const file=new File([binary],basename,{type:basename.toLowerCase().endsWith('.png')?'image/png':basename.toLowerCase().endsWith('.webp')?'image/webp':'image/jpeg'});
    let result;
    try {result=await picker.upload('data',destination,file,{}, {notify:false});}
    catch(e){throw new Error(`Failed to upload ZIP artwork ${basename}: ${e.message??e}. No world documents created.`);}
    if(result?.error || result?.status==='error')throw new Error(`Asset upload rejected for ${basename}: ${JSON.stringify(result)}. No documents created.`);
    const path=result?.path??`${destination}/${basename}`;
    mapped.set(basename,path);
    report({action:'artwork-upload',status:'ok',name:basename,path});
  }
  return mapped;
}
