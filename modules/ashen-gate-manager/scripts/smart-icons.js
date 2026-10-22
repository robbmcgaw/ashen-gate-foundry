/**
 * Smart icons (0.47.0). Picks a fitting icon from Foundry's own icon library for records that have no real icon.
 *
 * The rule (also in the CHANGELOG): Manager only fills an icon that is missing or a placeholder (blank, Foundry's
 * default bag / mystery man / d20 / dice art, dnd5e's default item-type art, Manager's own generic category icons, or an
 * authored local file that answers 404). An icon authored on purpose is kept exactly as authored, repeated generic ones
 * included. Remote URLs and paths under assets/ or worlds/ are never touched. On a re-import a world document's icon
 * is filled only when it is itself a placeholder, or when Manager picked it earlier (flags iconSource 'smart' or
 * 'fallback' and iconPath equal to the current icon) and the GM ticked "Re-pick smart icons".
 *
 * Everything here is pure except createIconIndexer, which browses with the FilePicker it is given and never throws.
 */
import {ICON_CONCEPTS, KIND_CONCEPTS, STOPWORDS} from './icon-keywords.js';
import {iconFallback} from './import-fidelity.js';

export const ICON_FLAGS = Object.freeze({source: 'iconSource', path: 'iconPath'});
export const ICON_SOURCES = Object.freeze(['smart', 'authored', 'fallback']);
/** Bump when the stored index shape or the browse rules change; older stored indexes are ignored. */
export const ICON_INDEX_VERSION = 1;
export const ICON_INDEX_KEY = 'ashen-gate-manager.iconIndex';
export const ICON_EXTENSIONS = /\.(webp|png|jpe?g|svg)$/i;

/** Foundry's default art for new Actors, Items, Roll Tables and Macros (other icons/svg files may be chosen on purpose). */
const FOUNDRY_DEFAULTS = new Set(['icons/svg/mystery-man.svg', 'icons/svg/mystery-man-black.svg', 'icons/svg/item-bag.svg',
  'icons/svg/d20-grey.svg', 'icons/svg/d20-black.svg', 'icons/svg/dice-target.svg']);
const norm = path => String(path ?? '').trim().replace(/^\.?\//, '').split(/[?#]/)[0];

/** Blank, Foundry's default document art, dnd5e's default item-type art, or Manager's own generic category icon. */
export function isPlaceholderIcon(path) {
  if (typeof path !== 'string' || !path.trim()) return true;
  const p = norm(path).toLowerCase();
  return FOUNDRY_DEFAULTS.has(p)
    || /^systems\/dnd5e\/icons\/svg\/items\/[a-z0-9-]+\.svg$/.test(p)
    || /^modules\/ashen-gate-manager\/assets\/icons\/[a-z0-9-]+\.svg$/.test(p);
}
/** Paths Manager never replaces, even if they cannot be loaded: remote URLs, data: URIs, world-owned assets/ and worlds/ files. */
export function isProtectedIcon(path) {
  if (typeof path !== 'string') return false;
  const p = path.trim();
  return /^(https?:)?\/\//i.test(p) || /^data:/i.test(p) || /^\/?(assets|worlds)\//i.test(p);
}
/** 'missing' | 'placeholder' | 'protected' | 'authored'. */
export function iconState(path) {
  if (typeof path !== 'string' || !path.trim()) return 'missing';
  if (isProtectedIcon(path)) return 'protected';
  if (isPlaceholderIcon(path)) return 'placeholder';
  return 'authored';
}
/** True when Manager picked the document's current icon (and the GM has not changed it since). */
export function managerAssignedIcon(img, flags) {
  const f = flags ?? {};
  return ['smart', 'fallback'].includes(f[ICON_FLAGS.source]) && typeof img === 'string' && img === f[ICON_FLAGS.path];
}

// ---------- Words ----------
const STOP = new Set(STOPWORDS);
/** The word and its likely singular forms ("caltrops" → caltrop, "leaves" → leaf / leafe, "berries" → berry). */
export function wordForms(word) {
  const w = String(word).toLowerCase(), out = [w];
  if (w.length > 4 && w.endsWith('ies')) out.push(`${w.slice(0, -3)}y`);
  if (w.length > 4 && w.endsWith('ves')) out.push(`${w.slice(0, -3)}f`, `${w.slice(0, -3)}fe`);
  if (w.length > 4 && /(ches|shes|xes|ses|zes|oes)$/.test(w)) out.push(w.slice(0, -2));
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) out.push(w.slice(0, -1));
  return [...new Set(out)];
}
/** Lower-case words of two or more letters, without stop words, [TEST]-style tags or numbers. */
export function tokenize(text) {
  return String(text ?? '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z]+/g, ' ').split(' ')
    .filter(w => w.length >= 2 && !STOP.has(w));
}
const fileWords = text => String(text ?? '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 2);

const WORD_CONCEPTS = (() => {
  const map = new Map();
  ICON_CONCEPTS.forEach((c, i) => {
    for (const w of c.words) {
      if (!map.has(w)) map.set(w, []);
      if (!map.get(w).includes(i)) map.get(w).push(i);
    }
  });
  return map;
})();
const conceptsOf = word => [...new Set(wordForms(word).flatMap(f => WORD_CONCEPTS.get(f) ?? []))];
const CONCEPT_BY_ID = new Map(ICON_CONCEPTS.map((c, i) => [c.id, i]));

// ---------- Index ----------
/**
 * A searchable icon index from a list of file paths. Placeholder art (icons/svg, dnd5e's default svgs) is left out so
 * it is never picked. Paths are de-duplicated and sorted, so the same files always give the same index.
 */
export function createIconIndex(paths = []) {
  const unique = [...new Set((paths ?? []).filter(p => typeof p === 'string' && ICON_EXTENSIONS.test(p)))]
    .filter(p => !isPlaceholderIcon(p) && !/(^|\/)icons\/svg\//i.test(norm(p)) && !/^systems\/dnd5e\/icons\/svg\//i.test(norm(p)))
    .sort();
  const files = unique.map(path => {
    const clean = norm(path), cut = clean.lastIndexOf('/');
    const dir = cut >= 0 ? clean.slice(0, cut).toLowerCase() : '';
    const base = (cut >= 0 ? clean.slice(cut + 1) : clean).replace(ICON_EXTENSIONS, '').toLowerCase();
    const words = fileWords(base);
    return {path, dir, base, words: new Set(words.flatMap(wordForms)), dirWords: new Set(fileWords(dir).flatMap(wordForms)),
      webp: /\.webp$/i.test(path), numbered: /[-_ ]?\d+$/.test(base)};
  });
  const byWord = new Map(), byDir = new Map();
  files.forEach((f, i) => {
    for (const w of f.words) { if (!byWord.has(w)) byWord.set(w, []); byWord.get(w).push(i); }
    if (!byDir.has(f.dir)) byDir.set(f.dir, []);
    byDir.get(f.dir).push(i);
  });
  return {size: files.length, files, byWord, byDir, byPath: new Map(files.map((f, i) => [f.path, i])), folders: new Map()};
}
/** Indexes of files whose folder contains the hint as whole path segments ("consumables/potions"). */
function filesInFolder(index, hint) {
  const cached = index.folders?.get(hint);
  if (cached) return cached;
  const needle = `/${hint.toLowerCase()}/`;
  const out = [];
  for (const [dir, list] of index.byDir) if (`/${dir}/`.includes(needle)) out.push(...list);
  index.folders?.set(hint, out);
  return out;
}

// ---------- Record → words ----------
const stripHtml = html => String(html ?? '').replace(/<[^>]*>/g, ' ').slice(0, 600);
/** What the resolver reads from an import record. */
export function recordIconInput(record) {
  const data = record?.foundry?.data ?? {};
  const tags = [record?.tags, record?.keywords, record?.definition?.tags].find(Array.isArray) ?? [];
  return {
    seed: String(record?.id ?? data.name ?? record?.name ?? ''),
    name: String(data.name ?? record?.name ?? record?.id ?? ''),
    kinds: [data.system?.type?.value, data.type, record?.entity_type, record?.foundry?.document_type, String(record?.id ?? '').split('-')[0]].filter(Boolean),
    tags: tags.filter(t => typeof t === 'string'),
    description: stripHtml(data.system?.description?.value ?? data.system?.details?.biography?.value ?? data.description ?? ''),
  };
}
/** What the resolver reads from a world Item or Actor. */
export function documentIconInput(doc) {
  const source = doc?.flags?.['ashen-gate-manager']?.source ?? doc?.getFlag?.('ashen-gate-manager', 'source') ?? {};
  return {
    seed: String(source.sourceId ?? doc?.uuid ?? doc?.id ?? doc?.name ?? ''),
    name: String(doc?.name ?? ''),
    kinds: [doc?.system?.type?.value, doc?.type, source.entityType, doc?.documentName].filter(Boolean),
    tags: [],
    description: stripHtml(doc?.system?.description?.value ?? ''),
  };
}

/** Stable 32-bit hash (FNV-1a) for picking among equally good icons. */
export function stableHash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * Best icon for one record from an index, or null when nothing fits well enough.
 * Returns {img, reason, confidence: 'high'|'medium'|'low', concept}.
 * Deterministic: the same input and index always give the same icon. Among equally scored icons the pick is by a hash
 * of the record's permanent id over the path-sorted list, so similar records do not all share one icon.
 */
export function resolveIcon(input, index) {
  if (!index?.size) return null;
  const nameWords = tokenize(input?.name);
  const weights = new Map(); // concept index → weight
  const fromName = new Set();
  const add = (ci, w) => weights.set(ci, Math.max(weights.get(ci) ?? 0, w));
  // Name: the last word is usually the thing itself ("Iron Caltrops"), earlier ones describe it.
  const nameHits = nameWords.map((w, i) => ({w, i, cs: conceptsOf(w)})).filter(h => h.cs.length);
  const heads = nameHits.filter(h => h.cs.some(ci => !ICON_CONCEPTS[ci].modifier));
  const lastHead = (heads.length ? heads : nameHits).at(-1)?.i;
  for (const h of nameHits) for (const ci of h.cs) {
    const modifier = ICON_CONCEPTS[ci].modifier && heads.length > 0;
    add(ci, modifier ? 1 : h.i === lastHead ? 4 : 2);
    fromName.add(ci);
  }
  for (const t of input?.tags ?? []) for (const w of tokenize(t)) for (const ci of conceptsOf(w)) add(ci, 1.5);
  let via = weights.size ? 'name' : '';
  if (!weights.size) {
    // Description: only when the name says nothing, and only concepts mentioned at least twice.
    const counts = new Map();
    for (const w of tokenize(input?.description)) for (const ci of conceptsOf(w)) counts.set(ci, (counts.get(ci) ?? 0) + 1);
    for (const [ci, n] of counts) if (n >= 2) add(ci, 1);
    if (weights.size) via = 'description';
  }
  const kindConcepts = [];
  for (const k of input?.kinds ?? []) for (const id of KIND_CONCEPTS[String(k).toLowerCase().replace(/[^a-z]/g, '')] ?? []) {
    const ci = CONCEPT_BY_ID.get(id);
    if (ci !== undefined && !kindConcepts.includes(ci)) kindConcepts.push(ci);
  }
  const score = (concepts, useKind) => {
    const cand = new Map(); // file index → score
    const bump = (i, s) => cand.set(i, (cand.get(i) ?? 0) + s);
    for (const [ci, w] of concepts) {
      const c = ICON_CONCEPTS[ci];
      const inFolder = new Set(c.folders.flatMap(hint => filesInFolder(index, hint)));
      for (const i of inFolder) bump(i, 10 * w);
      // A file-name hint counts once per concept, so "potion-flask" does not beat "bottle-round" on two hints.
      const named = new Set((c.names ?? []).flatMap(n => index.byWord.get(n) ?? []));
      for (const i of named) bump(i, (inFolder.has(i) ? 3 : 2) * w);
    }
    if (!useKind) for (const w of nameWords) {
      if (w.length < 3) continue;
      for (const f of wordForms(w)) for (const i of index.byWord.get(f) ?? []) bump(i, 4);
    }
    for (const [i, s] of cand) {
      const f = index.files[i];
      let extra = (f.webp ? 1 : 0) - (f.numbered ? 1.5 : 0);
      for (const w of nameWords) if (w.length >= 3 && wordForms(w).some(x => f.dirWords.has(x))) extra += 1;
      cand.set(i, s + extra);
    }
    return cand;
  };
  let cand = score(weights, false), kindOnly = false;
  let best = Math.max(-Infinity, ...cand.values());
  if (!(best >= 5) && kindConcepts.length) {
    // Last resort by kind: the first kind concept that has art in this world.
    for (const ci of kindConcepts) {
      cand = score(new Map([[ci, 1]]), true);
      best = Math.max(-Infinity, ...cand.values());
      if (best >= 5) { kindOnly = true; via = `kind: ${ICON_CONCEPTS[ci].id}`; break; }
    }
  }
  if (!(best >= 5)) return null;
  const tier = [...cand].filter(([, s]) => s === best).map(([i]) => index.files[i].path).sort();
  const img = tier[stableHash(input?.seed || input?.name || '') % tier.length];
  const file = index.files[index.byPath.get(img)];
  const top = [...weights].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([ci]) => ci);
  const concept = kindOnly ? via.slice(6) : top.length ? ICON_CONCEPTS[top[0]].id : null;
  const overlap = nameWords.filter(w => w.length >= 3 && wordForms(w).some(x => file.words.has(x)));
  let reason, confidence;
  if (kindOnly) { reason = `matched ${via}`; confidence = 'low'; }
  else if (concept) {
    reason = `matched: ${concept}${via === 'description' ? ' (from the description)' : ''}`;
    confidence = via === 'name' && fromName.has(top[0]) ? (overlap.length || (ICON_CONCEPTS[top[0]].names ?? []).some(n => file.words.has(n)) ? 'high' : 'medium') : 'low';
  } else { reason = `matched words: ${overlap.join(', ')}`; confidence = overlap.length > 1 ? 'medium' : 'low'; }
  return {img, reason, confidence, concept};
}

/**
 * The icon Manager would give a new record whose own icon is missing or a placeholder, without checking files (the
 * preview uses this). Returns null when the record keeps its authored icon.
 * opts: {index, smart = true, override (a path the GM chose in the preview)}.
 * Returns {img, reason, source: 'smart'|'authored'|'fallback', confidence?, original?}.
 */
export function pickRecordIcon(record, {index = null, smart = true, override, why} = {}) {
  const authored = record?.foundry?.data?.img;
  const state = iconState(authored);
  if (typeof override === 'string' && override.trim()) return {img: override.trim(), reason: 'chosen in the preview', source: 'authored'};
  if (!why && (state === 'authored' || state === 'protected')) return null;
  const original = state === 'placeholder' || why === 'missing-authored' ? authored.trim() : undefined;
  // With smart icons off Manager behaves as before 0.47.0: a placeholder is kept, a missing icon gets the generic category icon.
  if (!smart && state === 'placeholder' && !why) return null;
  const found = smart ? resolveIcon(recordIconInput(record), index) : null;
  if (found) return {img: found.img, reason: found.reason, confidence: found.confidence, source: 'smart', ...(original ? {original} : {})};
  return {img: iconFallback(record), reason: why === 'missing-authored' ? 'missing-authored' : 'fallback', source: 'fallback', ...(original ? {original} : {})};
}

/**
 * The icon an import record gets when it is created: the preview's pick (or the GM's Change… choice) when there is
 * one, else the authored icon, unless it is a local file that answers 404 (then a picked one).
 * opts: {index, smart = true, probe(path) → status, planned (the preview's {img, source, reason})}.
 */
export async function chooseImportIcon(record, {index = null, smart = true, probe, planned = null} = {}) {
  if (planned?.img) return {...planned};
  const authored = record?.foundry?.data?.img;
  const state = iconState(authored);
  if (state === 'authored') {
    const value = authored.trim();
    if (typeof probe === 'function') {
      try { const status = await probe(value); if (status === 404 || status === 410) return pickRecordIcon(record, {index, smart, why: 'missing-authored'}); }
      catch { /* Lack of verification is not proof the authored art is missing. */ }
    }
    return {img: value, reason: 'authored', source: 'authored'};
  }
  if (state === 'protected') return {img: authored.trim(), reason: 'authored', source: 'authored'};
  return pickRecordIcon(record, {index, smart}) ?? {img: authored.trim(), reason: 'authored', source: 'authored'};
}

/**
 * Re-import of a record that already has a world document. Fills the icon only when the record has no real icon AND
 * (the document's icon is a placeholder, or Manager picked it AND the GM asked to re-pick). Never touches an icon the GM set.
 * Returns {fill: boolean, why}.
 */
export function existingIconDecision({recordImg, docImg, flags, repick = false, smart = true}) {
  if (!smart) return {fill: false, why: 'smart icons off'};
  const recordState = iconState(recordImg);
  if (recordState === 'authored' || recordState === 'protected') return {fill: false, why: 'the record has its own icon'};
  if (isProtectedIcon(docImg)) return {fill: false, why: 'the world icon is a world or remote file'};
  if (isPlaceholderIcon(docImg)) return {fill: true, why: 'placeholder'};
  if (managerAssignedIcon(docImg, flags)) return repick ? {fill: true, why: 'repick'} : {fill: false, why: 'Manager picked it earlier'};
  return {fill: false, why: 'set in Foundry'};
}

/** The icon a planner should compare against: a Manager-picked icon counts as the last imported value, never a GM edit. */
export function plannerIcon(img, flags, baseline) {
  return managerAssignedIcon(img, flags) ? baseline : img;
}

/** Flag update for a document Manager just gave an icon. */
export function iconFlagUpdate(moduleId, {img, source}) {
  return {[`flags.${moduleId}.${ICON_FLAGS.source}`]: ICON_SOURCES.includes(source) ? source : 'authored', [`flags.${moduleId}.${ICON_FLAGS.path}`]: img};
}

// ---------- Building the index from Foundry's file browser ----------
/** Foundry's file picker class (V14 namespaced first), or null. */
export function filePickerClass(g = globalThis) {
  const fp = g.foundry?.applications?.apps?.FilePicker;
  return fp?.implementation ?? fp ?? g.FilePicker?.implementation ?? g.FilePicker ?? null;
}
const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  Promise.resolve(promise).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
});
/**
 * Walks the icon folders with browse(source, target) → {dirs, files}. Capped so it cannot hang a world: depth,
 * folder count, a timeout per folder and an overall time limit. Never throws.
 * Returns {files, complete, folders, errors: [{target, message}]}.
 */
export async function browseIconFolders(browse, {roots = DEFAULT_ROOTS, maxDepth = 5, maxRequests = 400, requestMs = 8000,
  totalMs = 60000, concurrency = 4, now = () => Date.now(), skip = /(^|\/)icons\/svg(\/|$)|^systems\/dnd5e\/icons\/svg(\/|$)/i} = {}) {
  const started = now(), files = [], errors = [];
  const queue = roots.map(r => ({...r, depth: 0}));
  let requests = 0, complete = true;
  const worker = async () => {
    while (queue.length) {
      if (requests >= maxRequests || now() - started > totalMs) { complete = false; queue.length = 0; return; }
      const job = queue.shift();
      requests++;
      try {
        const out = await withTimeout(browse(job.source, job.target), requestMs);
        for (const f of out?.files ?? []) if (typeof f === 'string' && ICON_EXTENSIONS.test(f)) files.push(f);
        if (job.depth < maxDepth) {
          for (const d of out?.dirs ?? []) if (typeof d === 'string' && !skip.test(norm(d))) queue.push({source: job.source, target: d, depth: job.depth + 1, optional: job.optional});
        } else if ((out?.dirs ?? []).length) complete = false;
      } catch (error) {
        // A missing optional root (dnd5e's icons on The Forge, say) is not a failure of the index.
        if (!(job.optional && job.depth === 0)) complete = false;
        errors.push({target: job.target, message: String(error?.message ?? error)});
      }
    }
  };
  await Promise.all(Array.from({length: Math.max(1, concurrency)}, worker));
  return {files, complete, folders: requests, errors};
}
export const DEFAULT_ROOTS = Object.freeze([{source: 'public', target: 'icons'}, {source: 'data', target: 'systems/dnd5e/icons', optional: true}]);

/** Stored copy of the index paths, grouped by folder to stay small. */
export function packIndex(paths) {
  const byDir = {};
  for (const p of paths) { const cut = p.lastIndexOf('/'); (byDir[p.slice(0, cut)] ??= []).push(p.slice(cut + 1)); }
  return byDir;
}
export function unpackIndex(byDir) {
  return Object.entries(byDir ?? {}).flatMap(([dir, names]) => Array.isArray(names) ? names.map(n => `${dir}/${n}`) : []);
}

/**
 * One icon index per session. ensure() starts indexing in the background (never blocks, never throws) and resolves to
 * the index or null; status() says what is happening for the UI. A stored copy (versioned, keyed by Foundry and system
 * version) is used when present, so most sessions never browse at all.
 * deps: {browse(source, target), storage (localStorage-like), versionKey, now, maxAgeMs, browseOptions, onChange}.
 */
export function createIconIndexer({browse, storage = null, versionKey = '', now = () => Date.now(), maxAgeMs = 30 * 24 * 3600 * 1000,
  browseOptions = {}, onChange = () => {}} = {}) {
  let state = {state: 'idle', count: 0, message: ''}, index = null, running = null;
  const set = next => { state = {...state, ...next}; try { onChange(state); } catch { /* the UI may be closed */ } };
  const read = () => {
    try {
      const raw = storage?.getItem?.(ICON_INDEX_KEY);
      if (!raw) return null;
      const stored = JSON.parse(raw);
      if (stored?.v !== ICON_INDEX_VERSION || stored.key !== versionKey) return null;
      // An index cut short by a cap or a slow server is kept for a day only, then built again.
      if (now() - Number(stored.at ?? 0) > (stored.complete ? maxAgeMs : 24 * 3600 * 1000)) return null;
      return stored;
    } catch { return null; }
  };
  const write = (paths, complete) => {
    try { storage?.setItem?.(ICON_INDEX_KEY, JSON.stringify({v: ICON_INDEX_VERSION, key: versionKey, at: now(), complete, dirs: packIndex(paths)})); }
    catch { /* storage full or blocked: keep the index in memory only */ }
  };
  const ensure = () => {
    if (index) return Promise.resolve(index);
    if (running) return running;
    running = (async () => {
      const stored = read();
      if (stored) {
        index = createIconIndex(unpackIndex(stored.dirs));
        if (index.size) { set({state: 'ready', count: index.size, message: `${index.size} icons available.`, complete: stored.complete}); return index; }
        index = null;
      }
      if (typeof browse !== 'function') { set({state: 'failed', message: 'Foundry\'s file browser is not available, so generic icons are used.'}); return null; }
      set({state: 'indexing', message: 'Indexing icons…'});
      try {
        const out = await browseIconFolders(browse, browseOptions);
        index = createIconIndex(out.files);
        if (!index.size) {
          index = null;
          set({state: 'failed', message: `Could not read Foundry's icon folders${out.errors[0] ? ` (${out.errors[0].message})` : ''}, so generic icons are used.`});
          return null;
        }
        write(out.files, out.complete);
        set({state: 'ready', count: index.size, complete: out.complete,
          message: `${index.size} icons available${out.complete ? '' : ' (some folders could not be read in time)'}.`});
        return index;
      } catch (error) {
        index = null;
        set({state: 'failed', message: `Icon indexing failed (${error?.message ?? error}), so generic icons are used.`});
        return null;
      } finally { running = null; }
    })();
    return running;
  };
  return {
    ensure,
    status: () => ({...state}),
    get index() { return index; },
    /** Forget the stored and in-memory index; the next ensure() browses again. */
    reset() { index = null; try { storage?.removeItem?.(ICON_INDEX_KEY); } catch { /* ignore */ } set({state: 'idle', count: 0, message: ''}); },
  };
}

/** True when an import record's icon would be chosen by Manager (no icon or a placeholder). */
export function wantsSmartIcon(record) {
  return ['missing', 'placeholder'].includes(iconState(record?.foundry?.data?.img));
}
export const ICON_DOCUMENT_TYPES = Object.freeze(['Item', 'Actor', 'RollTable', 'Macro']);
