/**
 * Core links (0.26.0): GM-only linking of Ashen Gate world Items to 2024 (5.5e) core items.
 *
 * Only world Items whose Manager source definition carries `core_ref` are candidates:
 *   core_ref: {name: "Potion of Healing", source?: "DMG'24", type?: "consumable", rarity?: "common"}
 * Candidates come, read-only and in this order, from: world Items imported by Plutonium or marked 2024,
 * world compendium entries marked 2024, GM-configured core packs/folders, then the dnd5e 2024 system packs
 * (names ending in 24). Legacy 2014 content is never a candidate.
 *
 * Apply always stores flags[ashen-gate-manager].coreLink. For a HIGH match it also adopts the core item's
 * `img` and `system` (description included) into the world item, keeping its name, type, AG id, Manager
 * source flags, folder and ownership. Adopt falls back to link-only when it would change the item type or
 * drop the stack quantity the Ledger and Utilities rely on. Items embedded on Actors are never touched.
 */
import {MODULE_ID, getPath, equal, flatten} from './core.js';

export const LINK_FLAG = 'coreLink';
export const SOURCES_SETTING = 'coreSources';
export const LINK_HISTORY_SETTING = 'coreLinkHistory';
export const LINK_HISTORY_LIMIT = 5;
export const ADOPTED_PATHS = Object.freeze(['img', 'system']);
export const DEFAULT_SOURCES = Object.freeze({auto:true, packs:[], folders:[]});
const GM_ONLY = 'Only the GM can link core items.';
const fail = message => ({ok:false, message});
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const RANK = {HIGH:0, MEDIUM:1, LOW:2};
const KIND_LABEL = {plutonium:'Plutonium world item', world:'World item', 'world-pack':'World compendium', configured:'Core source', system24:'dnd5e 2024 pack'};

/** "PHB'24", "XPHB", "PHB 2024" → PHB24; "PHB'14", "PHB 2014" → PHB; "SRD 5.2" → SRD52; "SRD 5.1", "System Reference Document 5.1" → SRD51. */
export function bookKey(value) {
  const u = String(value ?? '').toUpperCase().replace(/[^A-Z0-9.]/g, '');
  if(!u) return '';
  let m = u.match(/^X(PHB|DMG|MM)$/); if(m) return `${m[1]}24`;
  m = u.match(/^(PHB|DMG|MM)(2024|24)$/); if(m) return `${m[1]}24`;
  m = u.match(/^(PHB|DMG|MM)(2014|14)$/); if(m) return m[1];
  if(/^SRD5\.?2/.test(u)) return 'SRD52';
  if(/^SRD5\.?1/.test(u) || u === 'SRD' || /^SYSTEMREFERENCEDOCUMENT5\.?1/.test(u)) return 'SRD51';
  if(/^SYSTEMREFERENCEDOCUMENT5\.?2/.test(u)) return 'SRD52';
  return u.replace(/\./g, '');
}
const BOOK_2024 = new Set(['PHB24', 'DMG24', 'MM24', 'SRD52']);
const BOOK_2014 = new Set(['PHB', 'DMG', 'MM', 'SRD51', 'PHB2014', 'DMG2014', 'MM2014']);
const bookOf = entry => bookKey(getPath(entry, 'system.source.book') || getPath(entry, 'flags.plutonium.source') || '');
/** true = 2024, false = 2014, null = unknown. */
export function rulesOf(entry) {
  const rules = String(getPath(entry, 'system.source.rules') ?? '');
  if(rules === '2024') return true;
  if(rules === '2014') return false;
  const book = bookOf(entry);
  if(BOOK_2024.has(book)) return true;
  if(BOOK_2014.has(book)) return false;
  return null;
}
/**
 * Core Links (2024 only): imported by Plutonium (flags.plutonium present) or marked 2024 (system.source rules/book).
 * Never true for content marked 2014. Use isCoreSource for Organize's Core vs Homebrew decision.
 */
export const isSource2024 = entry => (Boolean(getPath(entry, 'flags.plutonium')) && rulesOf(entry) !== false) || rulesOf(entry) === true;
/**
 * Organize (0.31.0): counts as Core when imported by Plutonium, or when system.source says 2024 or 2014 core
 * (rules "2014"; books PHB/DMG/MM legacy codes; SRD 5.1 labels). No source, third-party or homebrew → false.
 * Never used to pick Core Links candidates.
 */
export const isCoreSource = entry => Boolean(getPath(entry, 'flags.plutonium')) || rulesOf(entry) !== null;

export function nameKey(value) {
  return String(value ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '')
    .replace(/[^a-z0-9+]+/g, ' ').trim().replace(/^the /, '');
}
const looseKey = value => nameKey(String(value ?? '').replace(/\([^)]*\)/g, ' ').replace(/\+\s*\d+/g, ' '));

/** The core_ref an AG world Item carries, or null (never a candidate). */
export function coreRefOf(doc) {
  const source = getPath(doc, `flags.${MODULE_ID}.source`);
  const ref = source?.sourceId ? source.definition?.core_ref : null;
  if(!ref) return null;
  if(typeof ref === 'string') return {name:ref};
  return typeof ref === 'object' && ref.name ? {name:String(ref.name), source:ref.source ?? null, type:ref.type ?? null, rarity:ref.rarity ?? null} : null;
}

/** Ranked candidates for one core_ref; pool entries are {uuid, name, type, rarity, book, kind, order, ...}. */
export function findMatches(ref, docType, pool) {
  const want = nameKey(ref.name), wantType = ref.type ?? docType, wantBook = ref.source ? bookKey(ref.source) : null;
  const wantRarity = ref.rarity ? String(ref.rarity).replace(/\s+/g, '').toLowerCase() : null;
  const rows = [];
  for(const e of pool) {
    if(nameKey(e.name) === want) {
      const off = [];
      if(e.type !== wantType) off.push('type');
      if(wantBook && e.book && e.book !== wantBook) off.push('source');
      if(wantRarity && String(e.rarity ?? '').toLowerCase() !== wantRarity) off.push('rarity');
      const on = ['name'];
      if(!off.includes('type')) on.push('type');
      if(wantBook && e.book && !off.includes('source')) on.push('source');
      if(wantRarity && !off.includes('rarity')) on.push('rarity');
      rows.push({...e, confidence:off.length ? 'MEDIUM' : 'HIGH', matchedOn:on, mismatched:off});
    } else if(looseKey(e.name) === looseKey(ref.name)) rows.push({...e, confidence:'LOW', matchedOn:['similar name'], mismatched:['name']});
  }
  return rows.sort((a, b) => RANK[a.confidence] - RANK[b.confidence] || a.order - b.order);
}

/** Why adopting would hurt downstream modules (empty = safe to adopt). */
export function adoptBlockers(doc, core) {
  const out = [];
  if(core.type && core.type !== doc.type) out.push(`the core item is a ${core.type} and this one is a ${doc.type}; adopting would change its type`);
  if(getPath(doc, 'system.quantity') !== undefined && core.system && getPath(core, 'system.quantity') === undefined)
    out.push('the core item has no quantity, which the Ledger and Utilities use to stack it');
  return out;
}
/** Field-level diff of what Adopt would change (img + system). */
export function adoptDiff(docData, coreData) {
  const before = flatten({img:docData.img ?? null, system:docData.system ?? {}});
  const after = flatten({img:coreData.img ?? null, system:coreData.system ?? {}});
  const show = v => v === undefined ? '(none)' : typeof v === 'string' ? v : JSON.stringify(v);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .filter(path => !equal(before[path], after[path])).map(path => ({path, before:show(before[path]), after:show(after[path])}));
}

const INDEX_FIELDS = ['type', 'img', 'folder', 'system.rarity', 'system.source', 'system.quantity', 'flags.plutonium', `flags.${MODULE_ID}.source.sourceId`];
const asList = c => [...(c?.contents ?? c ?? [])];

/**
 * `loadCore(uuid)` returns the full core document's data ({name, type, img, system});
 * `update(doc, data, options)` writes one world Item. Both are injectable for tests.
 */
export function createCoreLinks({game,
  loadCore = async uuid => {const d = await globalThis.fromUuid(uuid); return d ? d.toObject() : null;},
  update = (doc, data, options) => doc.update(data, options)}) {
  const isGM = () => Boolean(game.user?.isGM);
  const sources = () => ({...DEFAULT_SOURCES, ...(game.settings.get(MODULE_ID, SOURCES_SETTING) ?? {})});
  const history = () => clone(game.settings.get(MODULE_ID, LINK_HISTORY_SETTING) ?? []);
  const itemPacks = () => asList(game.packs).filter(p => p.documentName === 'Item');
  const isSystem24 = p => p.metadata?.packageName === 'dnd5e' && /24$/.test(p.metadata?.name ?? p.collection.split('.').pop());

  /** Which packs/folders count as core sources, and why. Read-only. */
  function describeSources() {
    const s = sources();
    return {
      ...s,
      packs:itemPacks().map(p => ({id:p.collection, label:p.metadata?.label ?? p.collection,
        configured:s.packs.includes(p.collection), detected:s.auto && (isSystem24(p) || p.metadata?.packageType === 'world'),
        kind:isSystem24(p) ? 'system24' : p.metadata?.packageType === 'world' ? 'world-pack' : 'other'})),
      folders:asList(game.folders).filter(f => f.type === 'Item').map(f => ({id:f.id, name:f.name, configured:s.folders.includes(f.id)}))
    };
  }

  /** Read-only candidate pool, in Robb's priority order. Legacy 2014 content is never included. */
  async function loadPool() {
    const s = sources(), pool = [], notes = [];
    const folderIds = new Set(s.folders);
    const inConfigured = doc => {for(let f = doc.folder, n = 0; f && n < 10; f = f.folder, n++) if(folderIds.has(f.id ?? f)) return true; return false;};
    const push = (e, kind, order, packId = null, label = null) => pool.push({uuid:e.uuid ?? (packId ? `Compendium.${packId}.Item.${e._id}` : `Item.${e._id ?? e.id}`),
      id:e._id ?? e.id, name:e.name, type:e.type, img:e.img, rarity:getPath(e, 'system.rarity') ?? '', book:bookOf(e),
      quantity:getPath(e, 'system.quantity'), kind, order, packId, sourceLabel:label ?? KIND_LABEL[kind]});
    for(const doc of asList(game.items)) {
      if(getPath(doc, `flags.${MODULE_ID}.source.sourceId`)) continue; // never link AG to AG
      const rules = rulesOf(doc), configured = inConfigured(doc);
      if(rules === false) continue;
      if(s.auto && isSource2024(doc)) push(doc, getPath(doc, 'flags.plutonium') ? 'plutonium' : 'world', 0);
      else if(configured) push(doc, 'configured', 1);
    }
    for(const pack of itemPacks()) {
      const configured = s.packs.includes(pack.collection);
      const kind = configured ? 'configured' : s.auto && isSystem24(pack) ? 'system24' : s.auto && pack.metadata?.packageType === 'world' ? 'world-pack' : null;
      if(!kind) continue;
      let index;
      try {index = asList(await pack.getIndex({fields:INDEX_FIELDS}));}
      catch(error) {notes.push(`Could not read ${pack.collection}: ${error.message ?? error}`); continue;}
      for(const e of index) {
        if(getPath(e, `flags.${MODULE_ID}.source.sourceId`)) continue;
        const rules = rulesOf(e);
        if(rules === false) continue;
        if(kind === 'world-pack' && !isSource2024(e)) continue;
        push(e, kind, kind === 'system24' ? 2 : 1, pack.collection, `${KIND_LABEL[kind]}: ${pack.metadata?.label ?? pack.collection}`);
      }
    }
    return {pool, notes};
  }

  /** Dry run over world Items with core_ref. Writes nothing. */
  async function preview() {
    if(!isGM()) return fail(GM_ONLY);
    try {
      const {pool, notes} = await loadPool();
      const byUuid = new Map(pool.map(e => [e.uuid, e]));
      const rows = [];
      let withoutRef = 0;
      for(const doc of asList(game.items)) {
        if(!getPath(doc, `flags.${MODULE_ID}.source.sourceId`)) continue;
        const ref = coreRefOf(doc);
        if(!ref) {withoutRef++; continue;}
        const source = getPath(doc, `flags.${MODULE_ID}.source`);
        const link = getPath(doc, `flags.${MODULE_ID}.${LINK_FLAG}`) ?? null;
        const matches = findMatches(ref, doc.type, pool);
        const best = matches[0] ?? null;
        const row = {id:doc.id, name:doc.name, type:doc.type, sourceId:source.sourceId, coreRef:ref, link,
          best, others:matches.slice(1, 6), status:'nomatch', ticked:false, canAdopt:false, adopt:false, reason:'', diff:[]};
        if(link && byUuid.has(link.uuid)) {
          row.status = 'linked'; row.best = byUuid.get(link.uuid);
          row.reason = link.adopted ? 'Already linked and adopted. Nothing to do.' : 'Already linked (link only). Nothing to do.';
        } else if(!best) {
          row.reason = link ? `Linked core item ${link.name} is gone and no new 2024 match was found.` : 'No 2024 core item with this name was found.';
        } else {
          row.status = link ? 'relink' : best.confidence === 'HIGH' ? 'adopt' : 'review';
          const core = await loadCore(best.uuid);
          if(!core) {row.status = 'nomatch'; row.reason = `${best.name} could not be loaded.`; rows.push(row); continue;}
          const blockers = adoptBlockers(doc, core);
          row.canAdopt = !blockers.length;
          row.adopt = row.canAdopt;
          row.ticked = best.confidence === 'HIGH';
          if(row.canAdopt) row.diff = adoptDiff(doc.toObject?.() ?? doc, core);
          if(row.status === 'adopt' && !row.canAdopt) row.status = 'link';
          row.reason = [link ? `Linked core item ${link.name} is gone; best new match shown.` : '',
            best.confidence !== 'HIGH' ? `${best.confidence} match (${best.mismatched.join(', ')} differs): tick to accept.` : '',
            blockers.length ? `Link only: ${blockers.join('; ')}.` : ''].filter(Boolean).join(' ') || 'Exact 2024 match: adopt core data and link.';
        }
        rows.push(row);
      }
      const order = {adopt:0, link:1, relink:2, review:3, nomatch:4, linked:5};
      rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
      const counts = rows.reduce((c, r) => ({...c, [r.status]:(c[r.status] ?? 0) + 1}), {});
      return {ok:true, rows, counts, withoutRef, poolSize:pool.length, notes};
    } catch(error) {return fail(String(error.message ?? error));}
  }

  /** Re-plans, then links (and adopts, unless the row is link-only) the chosen world Items. */
  async function apply({ids = [], linkOnly = []} = {}) {
    if(!isGM()) return fail(GM_ONLY);
    const plan = await preview();
    if(!plan.ok) return plan;
    const want = new Set(ids), plain = new Set(linkOnly);
    const chosen = plan.rows.filter(r => want.has(r.id) && ['adopt', 'link', 'relink', 'review'].includes(r.status));
    const done = [], failed = [];
    const at = new Date().toISOString();
    for(const row of chosen) {
      const doc = game.items.get(row.id);
      if(!doc) {failed.push(`${row.name}: no longer exists`); continue;}
      try {
        const adopt = row.canAdopt && !plain.has(row.id);
        const raw = doc.toObject?.() ?? doc;
        const prev = {img:raw.img ?? null, system:clone(raw.system ?? {}), link:clone(row.link)};
        if(adopt) {
          const core = await loadCore(row.best.uuid);
          if(!core) throw new Error('core item could not be loaded');
          if(adoptBlockers(doc, core).length) throw new Error('core item changed since preview');
          // recursive:false replaces img and system wholesale; name, type, flags, folder and ownership are not sent.
          await update(doc, {img:core.img, system:clone(core.system)}, {recursive:false});
        }
        const link = {uuid:row.best.uuid, source:row.best.sourceLabel, sourceKind:row.best.kind, packId:row.best.packId, name:row.best.name, type:row.best.type,
          matchedOn:row.best.matchedOn, confidence:row.best.confidence, linkedAt:at, adopted:adopt, adoptedPaths:adopt ? [...ADOPTED_PATHS] : []};
        await update(doc, {[`flags.${MODULE_ID}.${LINK_FLAG}`]:link});
        done.push({id:row.id, name:row.name, adopted:adopt, prev, linkedAt:at});
      } catch(error) {failed.push(`${row.name}: ${error.message ?? error}`);}
    }
    if(done.length) await game.settings.set(MODULE_ID, LINK_HISTORY_SETTING, [{at, rows:done}, ...history()].slice(0, LINK_HISTORY_LIMIT));
    return {ok:true, linked:done.length, adopted:done.filter(d => d.adopted).length, failed,
      message:done.length ? `Linked ${done.length} item(s), adopted core data for ${done.filter(d => d.adopted).length}.${failed.length ? ` ${failed.length} failed.` : ''}` : 'Nothing was linked.'};
  }

  /** Restores img/system/link of the last run's items, if they still carry the link that run wrote. */
  async function undoLast() {
    if(!isGM()) return fail(GM_ONLY);
    const [last, ...rest] = history();
    if(!last) return fail('There is no core-link run to undo.');
    let restored = 0;
    const notes = [];
    for(const row of last.rows) {
      const doc = game.items.get(row.id);
      if(!doc) {notes.push(`${row.name}: no longer exists`); continue;}
      if(getPath(doc, `flags.${MODULE_ID}.${LINK_FLAG}`)?.linkedAt !== row.linkedAt) {notes.push(`${row.name}: changed since, left as it is`); continue;}
      if(row.adopted) await update(doc, {img:row.prev.img, system:row.prev.system}, {recursive:false});
      if(row.prev.link) await update(doc, {[`flags.${MODULE_ID}.${LINK_FLAG}`]:row.prev.link});
      else await doc.unsetFlag(MODULE_ID, LINK_FLAG);
      restored++;
    }
    await game.settings.set(MODULE_ID, LINK_HISTORY_SETTING, rest);
    return {ok:true, restored, notes, message:`Restored ${restored} item(s).${notes.length ? ` ${notes.length} left as they are.` : ''}`};
  }

  /** Current img/system/link of every ticked row, for download before Apply. */
  function backupOf(plan, ids) {
    const want = new Set(ids);
    return {kind:'ashen-gate-core-link-backup', module:MODULE_ID, at:new Date().toISOString(),
      items:plan.rows.filter(r => want.has(r.id)).map(r => {const d = game.items.get(r.id); const raw = d?.toObject?.() ?? d ?? {};
        return {id:r.id, name:r.name, sourceId:r.sourceId, img:raw.img ?? null, system:clone(raw.system ?? {}), coreLink:clone(r.link)};})};
  }

  async function saveSources(value) {
    if(!isGM()) return fail(GM_ONLY);
    const v = {auto:value?.auto !== false, packs:[...new Set((value?.packs ?? []).map(String))], folders:[...new Set((value?.folders ?? []).map(String))]};
    await game.settings.set(MODULE_ID, SOURCES_SETTING, v);
    return {ok:true, sources:v};
  }

  return {preview, apply, undoLast, backupOf, history:() => isGM() ? history() : [], describeSources:() => isGM() ? describeSources() : null, saveSources};
}
