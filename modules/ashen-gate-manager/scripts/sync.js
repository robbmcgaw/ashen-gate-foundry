/**
 * Sync from package (0.55.0): planning. One or more package files (a sync set) replace the content Manager imported
 * earlier, as if the new files were literally the old ones. Pure logic: Foundry documents arrive as the snapshots
 * makeSnapshot() builds, so the Node suite covers it; the writes are in sync-apply.js.
 *
 * Rules (Robb's decisions):
 *  - By default a record edited in this world since its import is KEPT (listed, with what would differ); with
 *    "Also overwrite records I edited" the PACKAGE WINS. A record matches a world document by Manager's permanent source id, never by name. Everything the
 *    package defines is overwritten, GM edits included; play state (current HP, quantities, uses, ...) is kept.
 *  - A character sheet is NEVER touched: no Actor of type 'character', nothing embedded on one, no hotbar.
 *  - Delete only what Manager imported: documents carrying Manager's source flag whose package line (flag.packageId) is
 *    one of the lines in this sync and whose id is in none of the sync's files. Unflagged documents are never read.
 *  - Records other modules own go through those modules' import APIs; they are never deleted from here.
 */
import {MODULE_ID, BLOCKED_STATUSES, canonical, equal, flatten, getPath, isPlainObject, exportedFields, baselineFields, validatePackage} from './core.js';
import {canonicalDefinition} from './source-projection.mjs';
import {itemKeys, ITEM_FLAG, ACTOR_ITEMS_FLAG, ITEM_PLAY_STATE, ITEM_SKIP, itemLeaves, keyOf} from './actor-update.js';
import {effectDefinition, effectCreateData, effectFields, liveEffectValue, effectFlagOf} from './item-effects.js';
import {wantsSmartIcon, plannerIcon} from './smart-icons.js';
import {domainHandoff} from './delivery.js';
import {contentHash} from './world-export.js';
import {dependencyOrder} from './workflows.js';
import {isLocationRecord, planLocation, isRouteRecord, planRoute} from './location-handoff.js';
import {isShopRecord, planShop} from './shop-handoff.js';
import {SPECIALISTS, planSpecialist} from './specialist-handoff.js';
import {bundleRecordIds} from './zip-import.js';

export const SYNC_NAME = 'Sync from package';
export const SYNC_PHRASE = 'Replace content from package';
export const SYNC_RETIRED_SETTING = 'syncRetiredIds';
export const HANDOFF_LEDGER_SETTING = 'handoffLedger';
/** Under the source flag: JSON text {path: {raw, live}} for fields Foundry stores differently from the package (rich-text links, normalised numbers). */
export const MEMO_KEY = 'syncMemo';
/** Per ZIP the reader keeps its 50-file limit; a sync may join several ZIPs (Robb's pack is two: main 47 + sandbox 22). */
export const SYNC_MAX_FILES = 150;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const same = (a, b) => equal(a ?? null, b ?? null);
const emptyObject = v => isPlainObject(v) && !Object.keys(v).length;
const show = value => { const t = JSON.stringify(value ?? null); return t.length > 160 ? `${t.slice(0, 157)}…` : t; };
const hasMarker = v => typeof v === 'string' && v.includes('[[AGREF:');
export const ledgerKey = (packageId, kind = null) => kind ? `specialist:${kind}` : String(packageId);

/** Actor system data that is play state for an NPC: kept on an overwrite, never written from the package. */
const ACTOR_KEEP = [/^system\.attributes\.hp\.(value|temp|tempmax)$/, /^system\.attributes\.death\./, /^system\.attributes\.(exhaustion|inspiration)$/,
  /^system\.spells\.[^.]+\.(value|spent)$/, /^system\.resources\.[^.]+\.(value|spent)$/, /^system\.currency\./,
  // The biography is where the GM writes notes about the NPC (Manager has always kept it on an update).
  /^system\.details\.biography\.value$/];
const keptActorPath = path => ACTOR_KEEP.some(re => re.test(path));

/** Numeric dotted-version compare (1.10.0 > 1.9.0); non-numeric parts compare as text. */
export function compareVersions(a, b) {
  const pa = String(a ?? '').split('.'), pb = String(b ?? '').split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '0', y = pb[i] ?? '0', nx = Number(x), ny = Number(y);
    const d = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : (x < y ? -1 : x > y ? 1 : 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// ---------- the sync set: every file the GM chose, as one union ----------
/**
 * sources: [{filename, origin, kind, payload}] with kind 'manager' (ag-foundry-import package) or a specialist kind
 * (quests, skill-trees, headquarters, factions, strain). Returns the union the "missing" comparison uses.
 * An id in two files with identical content counts once; with different content it is refused everywhere (and
 * its existing document is neither overwritten nor deleted).
 */
export function buildSyncSet(sources) {
  const set = {files: [], managerFiles: [], specialistFiles: [], records: new Map(), lines: new Map(), allIds: new Set(), refusedIds: new Map(), duplicates: [], errors: []};
  if (sources.length > SYNC_MAX_FILES) set.errors.push(`This sync holds ${sources.length} files; the limit is ${SYNC_MAX_FILES}. Put the files in a ZIP with an import-order manifest, or sync in parts.`);
  for (const src of sources) {
    const entry = {filename: src.filename, origin: src.origin ?? src.filename, kind: src.kind, records: 0, packageId: null, version: null};
    set.files.push(entry);
    if (src.kind === 'manager') {
      const manifest = src.payload?.manifest ?? {}, records = Array.isArray(src.payload?.records) ? src.payload.records : [];
      entry.records = records.length; entry.packageId = manifest.package_id ?? null; entry.version = manifest.version ?? null;
      set.managerFiles.push({...entry, payload: src.payload});
      const line = set.lines.get(manifest.package_id) ?? {packageId: manifest.package_id, versions: new Set(), files: [], ids: new Set()};
      line.versions.add(manifest.version); line.files.push(src.filename); set.lines.set(manifest.package_id, line);
      for (const record of records) {
        if (typeof record?.id !== 'string') continue;
        set.allIds.add(record.id); line.ids.add(record.id);
        const prior = set.records.get(record.id);
        if (!prior) { if (!set.refusedIds.has(record.id)) set.records.set(record.id, {record, manifest, filename: src.filename}); continue; }
        const identical = canonical(prior.record) === canonical(record);
        set.duplicates.push({id: record.id, files: [prior.filename, src.filename], identical});
        if (!identical) { set.records.delete(record.id); set.refusedIds.set(record.id, `${record.id} is in ${prior.filename} and ${src.filename} with different content; Sync cannot choose, so it leaves the world's copy alone.`); }
      }
    } else {
      const ids = bundleRecordIds(src.kind, src.payload);
      entry.records = ids.length;
      set.specialistFiles.push({...entry, payload: src.payload, ids});
      for (const id of ids) set.allIds.add(id);
    }
  }
  return set;
}

// ---------- world snapshots ----------
/** The facts the planner needs about one Manager-flagged world document. `raw` (toObject) is read lazily. */
export function makeSnapshot(doc, ctx = {}) {
  let raw = null;
  const flagRaw = doc.getFlag?.(MODULE_ID, 'source') ?? null;
  const flag = flagRaw?.managedFields ? {...flagRaw, managedFields: baselineFields(flagRaw.managedFields)} : flagRaw;
  const kind = doc.documentName;
  return {
    doc, documentName: kind, id: doc.id, uuid: doc.uuid, name: doc.name, type: doc.type, flag,
    get raw() { return raw ??= doc.toObject(); },
    coreLink: doc.getFlag?.(MODULE_ID, 'coreLink') ?? null,
    archived: Boolean(doc.getFlag?.(MODULE_ID, 'lifecycle')?.archived),
    keep: Boolean(doc.getFlag?.(MODULE_ID, 'keepFolder')),
    inProtectedFolder: Boolean(ctx.isProtectedFolder?.(doc.folder?.id ?? null)),
    playerOwned: kind === 'Actor' && Boolean(doc.hasPlayerOwner),
    onScene: kind === 'Actor' && Boolean(ctx.sceneActorIds?.has(doc.id)),
    onHotbar: kind === 'Macro' && Boolean(ctx.hotbarMacroIds?.has(doc.id))
  };
}
/** Names of world documents Manager did not import, per document type, so a new record never duplicates one of them. */
export function nameIndex(docs) {
  const out = {};
  for (const d of docs) if (!d.getFlag?.(MODULE_ID, 'source')?.sourceId) (out[d.documentName] ??= new Set()).add(d.name);
  return out;
}
const memoOf = snap => { try { return JSON.parse(snap.flag?.[MEMO_KEY] ?? 'null') ?? {}; } catch { return {}; } };

// ---------- field comparison ----------
function matches(path, live, incoming, memo) {
  if (same(live, incoming)) return true;
  const m = memo?.[path];
  return Boolean(m) && m.raw === contentHash(incoming ?? null) && m.live === contentHash(live ?? null);
}
/**
 * Differences between live data and the package's flat fields. `baseline` is the last import (flat); a changed live value
 * that is neither the baseline nor the incoming value is a GM edit this sync will replace.
 */
export function diffFields(raw, fields, {baseline = {}, memo = {}, skip = () => false, label = p => p} = {}) {
  const changes = [], patch = {};
  for (const [path, incoming] of Object.entries(fields)) {
    if (emptyObject(incoming) || skip(path)) continue;
    const live = getPath(raw, path);
    if (matches(path, live, incoming, memo)) continue;
    const gmEdited = own(baseline, path) && !same(live, baseline[path]);
    patch[path] = incoming;
    changes.push({path, label: label(path), from: hasMarker(incoming) ? '(text with links)' : show(live), to: hasMarker(incoming) ? '(text with links)' : show(incoming), gmEdited});
  }
  return {changes, patch};
}
const lostOf = changes => changes.filter(c => c.gmEdited).length;

// ---------- what a record defines, as flat paths (the plan and the post-write stamp both read it) ----------
export function incomingFields(record) {
  const data = record.foundry.data, type = record.foundry.document_type;
  if (type === 'Item') { const f = exportedFields(record); if (wantsSmartIcon(record)) delete f.img; return f; }
  if (type === 'JournalEntry') return exportedFields(record);
  if (type === 'RollTable') return flatten(Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'results')));
  if (type === 'Macro') return flatten(data);
  const fields = {name: data.name};
  if (own(data, 'img') && !wantsSmartIcon(record)) fields.img = data.img;
  Object.assign(fields, flatten({prototypeToken: data.prototypeToken ?? {}, system: data.system ?? {}}));
  if (isPlainObject(data.flags)) { const { [MODULE_ID]: _own, ...others } = data.flags; Object.assign(fields, flatten({flags: others})); }
  for (const path of Object.keys(fields)) if (keptActorPath(path)) delete fields[path];
  return fields;
}
/** A Journal's pages by name key (a repeat gets #2, #3): {key: {name, text}}. */
export function pageFields(record) {
  const pages = record.foundry.data.pages ?? [], keys = nameKeys(pages.map(p => p.name));
  return Object.fromEntries(keys.map((k, i) => [k, pages[i]]));
}

// ---------- per-type overwrite plans ----------
const refuse = reason => ({refuse: reason});
const nameKeys = names => { const seen = new Map(); return names.map(n => { const c = (seen.get(n) ?? 0) + 1; seen.set(n, c); return c === 1 ? n : `${n}#${c}`; }); };

function effectsPlan(defs, liveRaw) {
  const live = liveRaw ?? [], ours = live.filter(e => effectFlagOf(e)?.effId);
  const out = {create: [], update: [], delete: [], notes: []};
  for (const def of defs) {
    const found = ours.filter(e => effectFlagOf(e).effId === def.eff_id);
    if (found.length > 1) { out.notes.push(`effect ${def.eff_id}: two effects share it; left alone`); continue; }
    if (!found.length) { out.create.push(effectCreateData(def)); continue; }
    const want = effectDefinition(def), fields = effectFields(want), raw = found[0], patch = {};
    for (const [path, value] of Object.entries(fields)) {
      const cur = liveEffectValue(raw, path);
      if (!same(path === 'statuses' ? [...value].sort() : value, cur)) patch[path] = value;
    }
    let baselineSame = false;
    try { baselineSame = same(JSON.parse(effectFlagOf(raw).baseline ?? 'null'), want); } catch { baselineSame = false; }
    if (Object.keys(patch).length || !baselineSame) out.update.push({_id: raw._id, ...patch, [`flags.${MODULE_ID}.effect.baseline`]: JSON.stringify(want), changed: Object.keys(patch)});
  }
  const inFile = new Set(defs.map(d => d.eff_id));
  for (const raw of ours) if (!inFile.has(effectFlagOf(raw).effId)) out.delete.push(raw._id);
  return out;
}

function planItem(record, snap) {
  const data = record.foundry.data, raw = snap.raw;
  if (raw.type !== data.type) return refuse(`The world Item is a ${raw.type} and the package says ${data.type}; Sync does not change an Item's type.`);
  const baseline = snap.flag?.managedFields ?? {}, memo = memoOf(snap);
  const fields = incomingFields(record);
  const link = snap.coreLink?.adopted ? snap.coreLink : null;
  const coreOwned = path => Boolean(link) && (link.adoptedPaths ?? []).some(p => path === p || path.startsWith(`${p}.`));
  const {changes, patch} = diffFields(raw, fields, {baseline, memo, skip: coreOwned});
  const notes = [];
  const kept = Object.keys(fields).filter(coreOwned).filter(p => !matches(p, getPath(raw, p), fields[p], memo));
  if (kept.length) notes.push(`${kept.length} field(s) adopted from a 2024 core item are kept (Core links owns them)`);
  const removed = Object.keys(baseline).filter(p => !own(fields, p) && !coreOwned(p) && p !== 'img');
  if (removed.length) notes.push(`${removed.length} field(s) the package no longer defines are left as they are`);
  const defs = Array.isArray(data.effects) ? data.effects : [];
  const fx = effectsPlan(defs, raw.effects);
  if (fx.create.length) changes.push({path: 'effects', label: 'effects', from: '—', to: `${fx.create.length} new`, gmEdited: false});
  for (const u of fx.update) if (u.changed.length) changes.push({path: 'effects', label: `effect ${u._id}`, from: 'edited or older', to: u.changed.join(', '), gmEdited: true});
  if (fx.delete.length) changes.push({path: 'effects', label: 'effects', from: `${fx.delete.length} Manager-made effect(s) no longer in the package`, to: 'removed', gmEdited: false});
  notes.push(...fx.notes);
  return {fields: patch, effects: fx, changes, notes, contentChange: changes.length > 0 || fx.update.length > 0};
}

function planJournal(record, snap) {
  const data = record.foundry.data, raw = snap.raw, baseline = snap.flag?.managedFields ?? {}, memo = memoOf(snap);
  const fields = incomingFields(record);
  const {changes, patch} = diffFields(raw, fields, {baseline, memo});
  const defs = data.pages ?? [], keys = nameKeys(defs.map(p => p.name));
  const live = raw.pages ?? [], liveKeys = nameKeys(live.map(p => p.name));
  const liveByKey = new Map(liveKeys.map((k, i) => [k, live[i]]));
  const baseKeys = nameKeys((snap.flag?.pagesDefinition ?? []).map(p => p.name));
  const pages = {create: [], update: [], delete: []};
  const baseByKey = new Map(baseKeys.map((k, i) => [k, snap.flag.pagesDefinition[i]]));
  defs.forEach((def, i) => {
    const key = keys[i], page = liveByKey.get(key);
    if (!page) { pages.create.push({name: def.name, type: 'text', text: structuredClone(def.text), sort: (i + 1) * 100000}); changes.push({path: `pages.${key}`, label: `page "${def.name}"`, from: '—', to: 'new page', gmEdited: false}); return; }
    const upd = {_id: page._id}, bits = [];
    for (const [path, value] of [['text.content', def.text.content], ...(own(def.text, 'format') ? [['text.format', def.text.format]] : [])]) {
      const cur = getPath(page, path);
      if (matches(`page:${key}:${path}`, cur, value, memo)) continue;
      upd[path] = value; bits.push(path);
      const baseText = getPath(baseByKey.get(key) ?? {}, path);
      changes.push({path: `pages.${key}`, label: `page "${def.name}" ${path}`, from: hasMarker(value) ? '(text with links)' : '(text)', to: hasMarker(value) ? '(text with links)' : '(text)',
        gmEdited: baseText !== undefined && !hasMarker(value) && !same(cur, baseText) && !same(cur, value)});
    }
    if (bits.length) { upd.key = key; pages.update.push(upd); }
  });
  for (const [key, def] of baseByKey) if (!keys.includes(key) && liveByKey.has(key)) {
    pages.delete.push(liveByKey.get(key)._id);
    changes.push({path: `pages.${key}`, label: `page "${def.name}"`, from: 'in the old package', to: 'removed', gmEdited: false});
  }
  return {fields: patch, pages, changes, notes: [], contentChange: changes.length > 0};
}

const normResult = r => ({type: r.type ?? 'text', text: r.text ?? '', range: r.range ?? [1, 1], weight: r.weight ?? 1, documentCollection: r.documentCollection ?? null, documentId: r.documentId ?? null, img: r.img ?? null});
function planTable(record, snap) {
  const data = record.foundry.data, raw = snap.raw, baseline = snap.flag?.managedFields ?? {}, memo = memoOf(snap);
  const fields = incomingFields(record);
  const {changes, patch} = diffFields(raw, fields, {baseline, memo});
  let results = null;
  if (Array.isArray(data.results)) {
    const sortR = list => [...list].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0));
    const want = sortR(data.results), have = sortR(raw.results ?? []);
    const defined = (a, b) => Object.keys(a).every(k => ['_id', '_stats', 'drawn', 'sort', 'flags'].includes(k) || same(normResult(a)[k] ?? a[k], normResult(b)[k] ?? b[k]));
    const identical = want.length === have.length && want.every((w, i) => defined(w, have[i]));
    if (!identical) {
      results = {create: want.map(w => { const { _id, drawn, ...rest } = w; return {...rest, drawn: false}; }), deleteIds: have.map(h => h._id)};
      changes.push({path: 'results', label: 'results', from: `${have.length} result(s)`, to: `${want.length} result(s) (the table's draw history resets)`, gmEdited: false});
    }
  }
  return {fields: patch, results, changes, notes: [], contentChange: changes.length > 0};
}

const normLines = s => String(s ?? '').replace(/\r\n?/g, '\n');
function planMacro(record, snap) {
  const data = record.foundry.data, raw = snap.raw, baseline = snap.flag?.managedFields ?? {}, memo = memoOf(snap);
  const fields = incomingFields(record);
  const {changes, patch} = diffFields({...raw, command: normLines(raw.command)}, {...fields, command: normLines(fields.command)}, {baseline: {...baseline, command: normLines(baseline.command)}, memo});
  if (own(patch, 'command')) patch.command = data.command;
  const notes = own(patch, 'command') ? ['Macro code will be replaced (it is stored, never run, by Sync)'] : [];
  return {fields: patch, changes, notes, contentChange: changes.length > 0};
}

function planActor(record, snap) {
  const data = record.foundry.data, raw = snap.raw, baseline = snap.flag?.managedFields ?? {}, memo = memoOf(snap);
  if (raw.type === 'character') return refuse('Character sheets are never changed by Sync.');
  if (data.type === 'character') return refuse('The package record is a character; Sync never writes characters.');
  if (raw.type !== data.type) return refuse(`The world Actor is a ${raw.type} and the package says ${data.type}.`);
  const fields = incomingFields(record);
  const {changes, patch} = diffFields(raw, fields, {baseline, memo});
  const notes = [];
  if (Array.isArray(data.effects) && data.effects.length) notes.push('Actor-level effects are not synced (conditions are play state)');
  // Embedded Items: the package's own (marked) Items follow it; anything the GM added stays.
  const defs = data.items ?? [], keys = itemKeys(defs);
  const baseDefs = Array.isArray(baseline.items) ? baseline.items : [];
  const baseByKey = new Map(itemKeys(baseDefs).map((k, i) => [k, baseDefs[i]]));
  const liveItems = raw.items ?? [], marked = new Map(liveItems.filter(keyOf).map(i => [keyOf(i), i]));
  const unmarked = (type, name) => liveItems.filter(i => !keyOf(i) && i.type === type && i.name === name);
  const legacy = !raw.flags?.[MODULE_ID]?.[ACTOR_ITEMS_FLAG];
  const items = {create: [], update: [], adopt: [], delete: []};
  defs.forEach((def, i) => {
    const key = keys[i];
    let liveItem = marked.get(key);
    if (!liveItem && legacy) {
      const found = unmarked(def.type, def.name);
      if (found.length > 1) { notes.push(`item "${def.name}": ${found.length} unmarked copies; left alone`); return; }
      if (found.length === 1) { liveItem = found[0]; items.adopt.push({_id: liveItem._id, key}); }
    }
    if (!liveItem) {
      const copy = structuredClone(def);
      copy.flags = {...(copy.flags ?? {}), [MODULE_ID]: {...(copy.flags?.[MODULE_ID] ?? {}), [ITEM_FLAG]: key}};
      items.create.push(copy); changes.push({path: `items.${key}`, label: `item "${def.name}"`, from: '—', to: 'added', gmEdited: false});
      return;
    }
    const baseLeaves = baseByKey.has(key) ? itemLeaves(baseByKey.get(key)) : {};
    const itemPatch = {}, bits = [];
    let edited = false;
    for (const [path, incoming] of Object.entries(itemLeaves(def))) {
      if (ITEM_PLAY_STATE.has(path) || emptyObject(incoming)) continue;
      const cur = getPath(liveItem, path);
      if (matches(`item:${key}:${path}`, cur, incoming, memo)) continue;
      itemPatch[path] = incoming; bits.push(path);
      if (own(baseLeaves, path) && !same(cur, baseLeaves[path])) edited = true;
    }
    if (bits.length) { items.update.push({_id: liveItem._id, ...itemPatch}); changes.push({path: `items.${key}`, label: `item "${def.name}"`, from: 'edited or older', to: bits.join(', '), gmEdited: edited}); }
  });
  for (const [key, item] of marked) if (!keys.includes(key)) { items.delete.push(item._id); changes.push({path: `items.${key}`, label: `item "${item.name}"`, from: 'in the old package', to: 'removed from the Actor', gmEdited: false}); }
  const stored = snap.flag?.definition, incomingDef = canonicalDefinition(record);
  if (isPlainObject(stored)) {
    const textKeys = [...new Set([...Object.keys(stored), ...Object.keys(incomingDef)])].filter(k => !same(stored[k], incomingDef[k])).sort();
    if (textKeys.length) changes.push({path: 'definition', label: 'record text', from: 'older', to: textKeys.join(', '), gmEdited: false});
  }
  return {fields: patch, items, changes, notes, contentChange: changes.length > 0};
}

/**
 * Fields of this world document changed since Manager last wrote it: the live value is neither the last import's value
 * nor what the previous sync stored (a value Foundry normalised). Paths the package no longer defines, play state and the
 * icon Manager picked itself are not edits. A document with no record of its last import cannot be judged, so it counts as
 * edited (kept) rather than guessed at. Embedded changes (Actor items, Journal pages, effects) come from the plan itself.
 */
export function editedFields(record, snap, plannedChanges = []) {
  // record === null: a document the package no longer carries; every baseline path counts and Actor play state is skipped.
  const isActor = snap.documentName === 'Actor';
  const baseline = snap.flag?.managedFields;
  if (!isPlainObject(baseline)) return ['(no record of the last import, so edits cannot be told apart)'];
  const raw = snap.raw, memo = memoOf(snap), fields = record ? incomingFields(record) : null, out = [];
  for (const [path, base] of Object.entries(baseline)) {
    if ((fields ? !own(fields, path) : isActor && keptActorPath(path)) || emptyObject(base) || path === 'items') continue;
    let live = getPath(raw, path);
    if (path === 'img') live = plannerIcon(live, raw.flags?.[MODULE_ID], base);
    if (same(live, base)) continue;
    const m = memo[path];
    if (m && m.live === contentHash(live ?? null)) continue;
    out.push(path);
  }
  for (const c of plannedChanges) if (c.gmEdited && !out.includes(c.path)) out.push(c.path);
  return out;
}
const PLANNERS = {Item: planItem, JournalEntry: planJournal, RollTable: planTable, Macro: planMacro, Actor: planActor};
const META_KEYS = ['entityType', 'status', 'visibility', 'version', 'sourceVersion', 'provenance', 'scope', 'schemaVersion', 'ownerSystemId', 'objectiveKind', 'definition', 'packageId', 'packageVersion', 'ownedResourceIds'];
const metaDiff = (flag, expected) => META_KEYS.filter(k => canonical(flag?.[k] ?? null) !== canonical(expected?.[k] ?? null));

// ---------- the plan ----------
const rowKey = (group, kind, id) => `${group}|${kind}|${id}`;
function untouched(id, name, kind, reason, extra = {}) { return {group: 'untouched', key: rowKey('untouched', kind, id), id, name, kind, reason, changes: [], lost: 0, ...extra}; }

function deletable(snap, dependents) {
  const f = snap.flag;
  if (snap.archived) return 'archived in Manager; restore or delete it from Items → Records';
  if (snap.keep) return 'marked Keep here';
  if (snap.inProtectedFolder) return 'in a protected folder';
  if (snap.documentName === 'Actor') {
    if (snap.type !== 'npc') return snap.type === 'character' ? 'a character sheet: never touched' : `a ${snap.type} Actor: only NPC Actors are removed`;
    if (snap.playerOwned) return 'owned by a player';
    if (snap.onScene) return 'has tokens on a scene: remove the tokens first';
  }
  if (snap.onHotbar) return 'on a hotbar';
  const refs = dependents.get(f.sourceId);
  if (refs?.length) return `still referenced by ${refs.slice(0, 3).join(', ')}${refs.length > 3 ? ', …' : ''}`;
  return null;
}

/**
 * Builds the preview for a sync set against the world. world: {docs: [snapshots], characterCount}.
 * ctx: {includeDrafts, deleteUnscoped, retiredIds:Set, ledger:{}, buildFlag(record, manifest), externalIds:Set,
 *   locationIds:Set|null, routeIds:Set|null, shopIds:Set|null, specialistApi(kind), moduleHas(kind, id), validateExtra(records),
 *   copyCount(sourceId)}.
 */
export function planSync(set, world, ctx = {}) {
  const errors = [...set.errors], rows = [], notes = [];
  const docs = world.docs ?? [];
  const bySource = new Map();
  for (const snap of docs) { const id = snap.flag?.sourceId; if (id) (bySource.get(id) ?? bySource.set(id, []).get(id)).push(snap); }
  const knownIds = new Set([...bySource.keys(), ...set.allIds, ...(ctx.externalIds ?? [])]);

  // 1. every Manager file must validate as it would on a normal import; one bad file stops the whole sync.
  for (const file of set.managerFiles) {
    for (const e of validatePackage(file.payload, knownIds)) errors.push(`${file.filename}: ${e}`);
  }
  if (!errors.length) errors.push(...(ctx.validateExtra?.([...set.records.values()].map(r => r.record)) ?? []));
  const plan = {ok: !errors.length, errors, rows, notes, set, counts: {}, lost: 0, metadataRefreshes: 0, scope: {}, characterCount: world.characterCount ?? 0, deleteUnscoped: Boolean(ctx.deleteUnscoped), overwriteEdited: Boolean(ctx.overwriteEdited)};
  const lines = [...set.lines.values()];
  plan.scope = {
    files: set.files.map(f => ({filename: f.filename, origin: f.origin, kind: f.kind, records: f.records, packageId: f.packageId, version: f.version})),
    lines: lines.map(l => ({packageId: l.packageId, versions: [...l.versions], files: l.files, records: l.ids.size, inWorld: docs.filter(s => s.flag?.packageId === l.packageId).length})),
    totalIds: set.allIds.size
  };
  if (errors.length) return finish(plan);

  // Version guard: syncing an older package over newer content is allowed but called out.
  for (const l of lines) {
    const newest = docs.filter(s => s.flag?.packageId === l.packageId).map(s => s.flag.packageVersion).filter(Boolean).sort(compareVersions).at(-1);
    const mine = [...l.versions].sort(compareVersions).at(-1);
    if (newest && mine && compareVersions(mine, newest) < 0) notes.push(`${l.packageId}: this sync is version ${mine} but the world has version ${newest}. Package wins, so the older content will replace it.`);
  }

  // 2. records that become world documents
  const recordList = [...set.records.values()].map(r => r.record);
  const order = dependencyOrder(recordList).order;
  const have = new Set(), planned = new Set();
  const available = new Set([...bySource.keys(), ...set.allIds]);
  const kinds = {create: 0, overwrite: 0};
  for (const [id, reason] of set.refusedIds) rows.push(untouched(id, id, 'Record', reason, {refused: true}));
  for (const id of order) {
    const {record, manifest, filename} = set.records.get(id);
    if (isLocationRecord(record) || isRouteRecord(record) || isShopRecord(record)) continue; // handed to their module below
    const kind = record.foundry?.document_type ?? `${record.entity_type} (unmapped)`;
    const name = record.foundry?.data?.name ?? record.name ?? id;
    const base = {id, name, kind, record, manifest, filename};
    const handoff = domainHandoff(record);
    if (record.scope === 'campaign_state') { rows.push(untouched(id, name, kind, 'Campaign state belongs to its own module; Manager never imports it.', base)); continue; }
    if (handoff) { rows.push(untouched(id, name, kind, handoff, {...base, refused: true})); continue; }
    if (!record.foundry?.data) { rows.push(untouched(id, name, kind, 'No Foundry projection; the record stays view-only.', base)); continue; }
    const snaps = bySource.get(id) ?? [];
    if (BLOCKED_STATUSES.has(record.status)) { rows.push(untouched(id, name, kind, `${record.status} records are not synced; any world copy is left as it is.`, base)); continue; }
    if (record.status !== 'approved' && !ctx.includeDrafts) { rows.push(untouched(id, name, kind, 'Unapproved record; the Import profile leaves drafts out. Any world copy is left as it is.', base)); continue; }
    if (record.foundry.document_type === 'Actor' && record.foundry.data.type === 'character') { rows.push(untouched(id, name, kind, 'Player characters are never created or changed by Sync.', {...base, refused: true})); continue; }
    if (snaps.length > 1) { rows.push(untouched(id, name, kind, `${snaps.length} world documents share this id; resolve that in Foundry first.`, {...base, refused: true})); continue; }
    if (!snaps.length) {
      if (ctx.retiredIds?.has(id)) { rows.push(untouched(id, name, kind, 'This id was deleted by an earlier sync and stays retired (ids are never reused). Give the record a new id.', {...base, refused: true})); continue; }
      const sameName = (world.unflaggedNames?.[record.foundry.document_type] ?? new Set());
      if (sameName.has?.(record.foundry.data.name)) { rows.push(untouched(id, name, kind, 'An unmanaged document with this name exists; rename or resolve it first.', {...base, refused: true})); continue; }
      rows.push({group: 'create', key: rowKey('create', kind, id), id, name, kind, reason: 'New record.', changes: [], lost: 0, ...base});
      kinds.create++; planned.add(id); continue;
    }
    const snap = snaps[0];
    if (snap.documentName !== record.foundry.document_type) { rows.push(untouched(id, name, kind, `The world document is a ${snap.documentName}, not a ${record.foundry.document_type}.`, {...base, refused: true})); continue; }
    if (snap.archived) { rows.push(untouched(id, name, kind, 'Archived in Manager; restore it before it can be synced.', {...base, refused: true})); continue; }
    const p = PLANNERS[record.foundry.document_type](record, snap);
    if (p.refuse) { rows.push(untouched(id, name, kind, p.refuse, {...base, refused: true})); continue; }
    const meta = metaDiff(snap.flag, ctx.buildFlag?.(record, manifest, available) ?? snap.flag);
    if (!p.contentChange && !meta.length) { rows.push(untouched(id, name, kind, `Already matches the package.${p.notes.length ? ` ${p.notes.join('; ')}.` : ''}`, {...base, unchanged: true})); have.add(id); continue; }
    const lost = lostOf(p.changes);
    const edited = p.contentChange ? editedFields(record, snap, p.changes) : [];
    if (edited.length && !ctx.overwriteEdited) {
      // Edited in this world since the import: left alone, with what would differ available on expand.
      rows.push(untouched(id, name, kind, `Kept: edited in your world (${edited.slice(0, 4).join(', ')}${edited.length > 4 ? `, +${edited.length - 4} more` : ''}). Tick "Also overwrite records I edited" to replace it with the package's version.`,
        {...base, keptEdited: true, changes: p.changes, editedFields: edited, snap}));
      have.add(id); continue;
    }
    if (!p.contentChange) {
      rows.push({group: 'overwrite', metadataOnly: true, key: rowKey('overwrite', kind, id), id, name, kind, reason: `Content already matches; refreshes ${meta.join(', ')}.`, changes: [], lost: 0, snap, ops: p, ...base});
      plan.metadataRefreshes++; continue;
    }
    rows.push({group: 'overwrite', key: rowKey('overwrite', kind, id), id, name, kind, reason: `${p.changes.length} difference(s) from the package${lost ? `, ${lost} of them replace a GM edit` : ''}.${p.notes.length ? ` ${p.notes.join('; ')}.` : ''}`,
      changes: p.changes, lost: Math.max(lost, edited.length), snap, ops: p, ...base});
    kinds.overwrite++; plan.lost += Math.max(lost, edited.length);
  }

  // 3. records other modules own: passed on in update mode, never deleted from here
  planModuleRows(set, ctx, rows, errors);

  // 4. deletions: Manager-flagged documents of these package lines that no sync file mentions
  const lineIds = new Set(lines.map(l => l.packageId));
  // "Also delete records not in these files" only means something when a Manager package is part of the sync;
  // with specialist files alone it would call every older record missing.
  const unscoped = Boolean(ctx.deleteUnscoped) && set.managerFiles.length > 0;
  if (ctx.deleteUnscoped && !unscoped) notes.push('"Also delete records not in these files" is ignored: this sync has no Manager package, so Sync cannot tell which records are missing.');
  plan.deleteUnscoped = unscoped;
  const candidates = docs.filter(s => {
    const f = s.flag;
    if (!f?.sourceId || set.allIds.has(f.sourceId)) return false;
    const line = f.packageId && f.packageId !== 'unknown' ? f.packageId : null;
    return line ? lineIds.has(line) : unscoped;
  });
  const doomed = new Set(candidates.map(s => s.flag.sourceId));
  const dependents = new Map();
  for (const s of docs) {
    const id = s.flag?.sourceId;
    if (!id || doomed.has(id)) continue; // a document that is itself going away cannot block
    if (set.records.has(id)) continue;   // the package's own refs are validated above
    for (const ref of s.flag.refs ?? []) { const target = typeof ref === 'string' ? ref : ref?.id ?? ref?.target_id; if (target && doomed.has(target)) (dependents.get(target) ?? dependents.set(target, []).get(target)).push(id); }
  }
  let outOfScope = 0, noLine = 0;
  for (const s of docs) {
    const f = s.flag;
    if (!f?.sourceId || set.allIds.has(f.sourceId) || doomed.has(f.sourceId)) continue;
    outOfScope++;
    if (!f.packageId || f.packageId === 'unknown') noLine++;
  }
  for (const snap of candidates) {
    const f = snap.flag, kind = snap.documentName;
    const edited = ctx.overwriteEdited ? [] : editedFields(null, snap);
    const block = (bySource.get(f.sourceId)?.length ?? 0) > 1 ? `${bySource.get(f.sourceId).length} world documents share this id; resolve that in Foundry first` : deletable(snap, dependents);
    if (block) { rows.push(untouched(f.sourceId, snap.name, kind, `Not removed: ${block}.`, {kept: true, snap})); continue; }
    if (edited.length) {
      rows.push(untouched(f.sourceId, snap.name, kind, `Kept: edited in your world, no longer in the package (${edited.slice(0, 4).join(', ')}${edited.length > 4 ? `, +${edited.length - 4} more` : ''}). Tick "Also overwrite records I edited" to delete it too.`,
        {keptEdited: true, keptRemoved: true, snap, editedFields: edited}));
      continue;
    }
    const copies = ctx.copyCount?.(f.sourceId) ?? 0;
    rows.push({group: 'delete', key: rowKey('delete', kind, f.sourceId), id: f.sourceId, name: snap.name, kind, snap, changes: [], lost: 0,
      reason: `Imported by Manager from ${f.packageId ?? 'an earlier import'} and not in this sync.${copies ? ` ${copies} copy/copies on character sheets stay exactly as they are.` : ''}`, copies});
  }
  plan.outOfScope = {records: outOfScope, withoutLine: noLine};
  if (noLine && !unscoped) notes.push(`${noLine} Manager-imported record(s) have no package line (imported by an older version). They are kept; tick "Also delete records not in these files" to let Sync remove those that no file mentions.`);
  if (unscoped && noLine) notes.push(`"Also delete records not in these files" is on: Manager-imported records without a package line that no chosen file mentions are deleted (${candidates.filter(c => !c.flag.packageId || c.flag.packageId === 'unknown').length} of them are in the Delete list or marked Not removed).`);
  plan.kinds = kinds;
  return finish(plan);
}

function planModuleRows(set, ctx, rows, errors) {
  const records = [...set.records.values()].map(r => r.record);
  const upd = true, drafts = Boolean(ctx.includeDrafts);
  const map = (action, reason) => action === 'create' ? 'create' : action === 'update' ? 'overwrite' : 'untouched';
  const push = (record, moduleLabel, kind, res, extra = {}) => {
    const group = map(res.action);
    rows.push({group, key: rowKey(group, kind, record.id), id: record.id, name: record.location?.name ?? record.route?.name ?? record.name ?? record.id, kind, record, external: true, module: moduleLabel,
      reason: group === 'overwrite' ? `${res.reason} Passed to ${moduleLabel}, which keeps its own state; no per-field preview is available.` : res.reason, changes: [], lost: 0, refused: res.action === 'blocked', ...extra});
  };
  const locationIds = ctx.locationIds ?? null;
  const endpoints = new Set(locationIds ?? []);
  for (const r of records) if (isLocationRecord(r) && ['create', 'update'].includes(planLocation(r, {existingIds: locationIds, includeDrafts: drafts, updateExisting: upd}).action)) endpoints.add(r.id);
  for (const r of records) {
    if (isLocationRecord(r)) push(r, 'Locations', 'Location', planLocation(r, {existingIds: locationIds, includeDrafts: drafts, updateExisting: upd}), {line: set.records.get(r.id).manifest.package_id});
    else if (isRouteRecord(r)) push(r, 'Locations', 'Route', planRoute(r, {existingIds: ctx.routeIds ?? null, locationIds: endpoints, includeDrafts: drafts, updateExisting: upd}), {line: set.records.get(r.id).manifest.package_id});
    else if (isShopRecord(r)) push(r, 'Utilities', r.entity_type, planShop(r, {existingIds: ctx.shopIds ?? null, includeDrafts: drafts, updateExisting: upd}), {line: set.records.get(r.id).manifest.package_id});
  }
  for (const file of set.specialistFiles) {
    const spec = SPECIALISTS[file.kind], api = ctx.specialistApi?.(file.kind) ?? null;
    const res = planSpecialist(file.kind, file.payload, api, {updateExisting: spec.canUpdate});
    for (const e of res.errors ?? []) errors.push(`${file.filename}: ${e}`);
    for (const r of res.rows) {
      const group = r.action === 'create' ? 'create' : r.action === 'update' ? 'overwrite' : 'untouched';
      const reason = group === 'untouched' && !spec.canUpdate && /exist|kept/i.test(r.reason ?? '') ? `${spec.label} does not update records that already exist; kept as they are. ${r.reason}` : r.reason;
      rows.push({group, key: rowKey(group, r.kind, r.id), id: r.id, name: r.name, kind: r.kind, external: true, module: spec.label, specialist: file.kind, filename: file.filename,
        reason: group === 'overwrite' ? `${reason} Passed to ${spec.label}, which keeps its own state; no per-field preview is available.` : reason, changes: [], lost: 0, refused: r.action === 'blocked'});
    }
  }
  // Records an earlier import passed on that these files no longer carry: Manager never reaches into the other module to remove them.
  const wanted = new Set(rows.filter(r => r.external).map(r => r.id));
  const keys = [...[...set.lines.keys()].map(p => ledgerKey(p)), ...[...new Set(set.specialistFiles.map(f => f.kind))].map(k => ledgerKey(null, k))];
  for (const key of keys) {
    for (const [id, info] of Object.entries(ctx.ledger?.[key] ?? {})) {
      if (set.allIds.has(id) || wanted.has(id)) continue;
      if (ctx.moduleHas?.(info.kind, id) === false) continue; // already gone from that module
      rows.push(untouched(id, info.name ?? id, info.kind ?? 'Record', `Not removed: remove it in ${info.module ?? 'its module'} (Manager never deletes another module's records).`, {notRemoved: true, module: info.module}));
    }
  }
}

function finish(plan) {
  const c = {create: 0, overwrite: 0, delete: 0, untouched: 0, refused: 0, notRemoved: 0, keptEdited: 0, keptRemoved: 0};
  for (const r of plan.rows) {
    if (r.group === 'overwrite' && r.metadataOnly) { c.metadataRefreshes = (c.metadataRefreshes ?? 0) + 1; continue; }
    c[r.group]++;
    if (r.group === 'untouched' && r.refused) c.refused++;
    if (r.notRemoved) c.notRemoved++;
    if (r.keptEdited) c.keptEdited++;
    if (r.keptRemoved) c.keptRemoved++;
  }
  c.untouched += plan.outOfScope?.records ?? 0;
  c.metadataRefreshes ??= 0;
  plan.counts = c;
  plan.fingerprint = contentHash(plan.rows.map(r => [r.group, r.key, contentHash(r.ops ? {f: r.ops.fields, i: r.ops.items, p: r.ops.pages, r: r.ops.results, e: r.ops.effects} : r.reason)]));
  plan.records = c.create + c.overwrite;
  plan.buttonLabel = `Replace ${plan.records} record${plan.records === 1 ? '' : 's'} and delete ${c.delete}`;
  return plan;
}

/** True when the typed text is the confirmation phrase (case and surrounding space do not matter). */
export const phraseOk = text => String(text ?? '').trim().toLowerCase() === SYNC_PHRASE.toLowerCase();
