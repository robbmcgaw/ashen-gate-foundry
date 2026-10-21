// Ashen Gate shared item-drop helper, contract ag-item-drop/1 (docs/item-drop-standard.md).
// Byte-identical in every module that accepts item drops (scripts/check.mjs enforces). Pure: reads `game` and
// `foundry` at call time, imports nothing, holds no state, never writes documents and has no UI.

/** The contract this file implements. */
export const ITEM_DROP_CONTRACT = 'ag-item-drop/1';

const ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const MISSING = "That item no longer exists or you can't see it.";
const NOT_ITEM = 'Drop an item.';
const NO_FOLDERS = 'Drop items one at a time.';
const STRIP = ['_id', 'folder', 'sort', 'ownership', '_stats'];

const g = () => globalThis.game;
const whole = (n, fallback = 1) => { const v = Math.floor(Number(n)); return Number.isFinite(v) && v >= 1 ? v : fallback; };
const clone = o => (globalThis.foundry?.utils?.deepClone ?? structuredClone)(o);
const newId = () => globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 18).padEnd(16, '0');
const isItem = doc => doc?.documentName === 'Item';
const managerSource = item => item?.flags?.['ashen-gate-manager']?.source ?? null;
async function load(uuid) {
  if (typeof uuid !== 'string' || !uuid) return null;
  try { return (await globalThis.fromUuid?.(uuid)) ?? null; } catch { return null; }
}
async function packDoc(pack, id) {
  try { return (await pack?.getDocument?.(id)) ?? null; } catch { return null; }
}

/** The drag data of a drop event, or {} when it can't be read. Never throws. */
export function readDrop(event) {
  try {
    const data = globalThis.foundry?.applications?.ux?.TextEditor?.implementation?.getDragEventData?.(event);
    if (data && typeof data === 'object' && Object.keys(data).length) return data;
  } catch { /* fall through */ }
  try {
    const data = JSON.parse(event?.dataTransfer?.getData?.('text/plain') ?? '');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}

/** Resolve and validate drag data: {ok, items, reason}; `reason` is plain text that is safe to show a player. */
export async function resolveItemDrop(raw, {folders = false, maxFolder = 100} = {}) {
  const type = raw?.type;
  if (type === 'Folder') return folders ? resolveFolder(raw, whole(maxFolder, 100)) : {ok: false, items: [], reason: NO_FOLDERS};
  if (type && type !== 'Item') return {ok: false, items: [], reason: NOT_ITEM};
  if (!type) return {ok: false, items: [], reason: MISSING};
  let doc = null;
  try { doc = (await globalThis.Item?.implementation?.fromDropData?.(raw)) ?? null; } catch { doc = null; }
  doc ??= await load(raw.uuid);
  if (!doc) return {ok: false, items: [], reason: MISSING};
  if (!isItem(doc)) return {ok: false, items: [], reason: NOT_ITEM};
  return {ok: true, items: [doc], reason: ''};
}

/** The Items in a dropped folder and its subfolders (world or compendium), at most `max`, skipping non-Items. */
async function resolveFolder(raw, max) {
  const folder = await load(raw.uuid);
  if (!folder) return {ok: false, items: [], reason: MISSING};
  if (folder.documentName !== 'Folder' || folder.type !== 'Item') return {ok: false, items: [], reason: NOT_ITEM};
  const ids = new Set([folder.id, ...(folder.getSubfolders?.(true) ?? []).map(f => f.id)]);
  const inFolder = d => ids.has(d?.folder?.id ?? d?.folder);
  let items = [];
  if (folder.pack) {
    const pack = g()?.packs?.get(folder.pack);
    const index = [...((await pack?.getIndex?.({fields: ['folder']})) ?? pack?.index ?? [])].filter(inFolder);
    for (const entry of index) {
      if (items.length >= max) break;
      const doc = await packDoc(pack, entry._id);
      if (isItem(doc)) items.push(doc);
    }
  } else {
    items = [...(g()?.items?.contents ?? [])].filter(d => isItem(d) && inFolder(d)).slice(0, max);
  }
  if (!items.length) return {ok: false, items: [], reason: 'That folder has no items you can use.'};
  return {ok: true, items, reason: ''};
}

/** The permanent id of an Item (Manager source, then Ledger, then legacy flag), or null. */
export function itemIdOf(item) {
  const f = item?.flags ?? {};
  const id = f['ashen-gate-manager']?.source?.sourceId ?? f['ashen-gate-profession-ledger']?.sourceId ?? f['ashen-gate']?.sourceId;
  return typeof id === 'string' && ID_RE.test(id) ? id : null;
}

/** Active (not retired, superseded or archived) world Items bound to a permanent id. */
function activeWorldItems(itemId) {
  if (typeof itemId !== 'string' || !ID_RE.test(itemId)) return [];
  return [...(g()?.items?.contents ?? [])].filter(doc => {
    const src = managerSource(doc);
    return src?.sourceId === itemId && src.status !== 'retired' && src.status !== 'superseded'
      && doc.flags['ashen-gate-manager'].lifecycle?.archived !== true;
  });
}

/** The single active world Item bound to a permanent id, or null when there is none or several. */
export function worldItemById(itemId) {
  const found = activeWorldItems(itemId);
  return found.length === 1 ? found[0] : null;
}

/** An ag-item-ref/1 snapshot of an Item (async: counts container contents). */
export async function itemRef(item, {quantity} = {}) {
  const sourceKind = item?.pack ? 'compendium' : item?.parent?.documentName === 'Actor' ? 'embedded' : 'world';
  return {
    schema: 'ag-item-ref/1', uuid: item?.uuid ?? null, itemId: itemIdOf(item), name: item?.name ?? '', img: item?.img ?? null,
    type: item?.type ?? null, quantity: whole(quantity ?? item?.system?.quantity), sourceKind,
    packId: item?.pack ?? null, parentUuid: sourceKind === 'embedded' ? item.parent.uuid ?? null : null,
    contents: (await bundleOf(item)).length - 1,
  };
}

/** Find a stored ref again, permanent id first, then uuid: {status:'ok', item} | {status:'conflict'} | {status:'missing'}. */
export async function resolveRef(ref) {
  const byId = activeWorldItems(ref?.itemId);
  if (byId.length > 1) return {status: 'conflict'};
  if (byId.length === 1) return {status: 'ok', item: byId[0]};
  const doc = await load(ref?.uuid);
  return isItem(doc) ? {status: 'ok', item: doc} : {status: 'missing'};
}

/** The Item followed by everything nested inside it (dnd5e system.container), read from the Item's own collection. */
export async function bundleOf(item) {
  if (!item) return [];
  if (item.pack && !item.parent) return packBundle(item);
  const all = [...(item.parent?.items ?? g()?.items?.contents ?? [])];
  const out = [item], seen = new Set([item.id]);
  for (let i = 0; i < out.length; i++) {
    for (const c of all) if (c?.system?.container === out[i].id && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
  }
  return out;
}

/** bundleOf for a compendium Item: walk the pack index, then load each content document from the same pack. */
async function packBundle(item) {
  if (item.type !== 'container') return [item];
  const pack = g()?.packs?.get(item.pack);
  const index = [...((await pack?.getIndex?.({fields: ['system.container']})) ?? pack?.index ?? [])];
  const out = [item], seen = new Set([item.id]);
  for (let i = 0; i < out.length; i++) {
    for (const e of index) {
      if (e?.system?.container !== out[i].id || seen.has(e._id)) continue;
      seen.add(e._id);
      const doc = await packDoc(pack, e._id);
      if (isItem(doc)) out.push(doc);
    }
  }
  return out;
}

/** Create-data for one recipient: {data, contents}. Create all of `data` in one call with {keepId: true}. */
export async function grantBundle(item, {quantity, scope, tag} = {}) {
  const docs = await bundleOf(item);
  const ids = new Map(docs.map(d => [d.id, newId()]));
  const data = docs.map((d, i) => {
    const o = clone(d.toObject());
    for (const k of STRIP) delete o[k];
    o._id = ids.get(d.id);
    o.system = {...(o.system ?? {})};
    if (i === 0) {
      if ('container' in o.system) o.system.container = null;
      o.system.quantity = whole(quantity ?? d.system?.quantity);
    } else o.system.container = ids.get(d.system.container);
    if (scope) o.flags = {...(o.flags ?? {}), [scope]: {...(o.flags?.[scope] ?? {}), ...(tag ?? {})}};
    return o;
  });
  return {data, contents: data.length - 1};
}

/** Drag data for a stored ref: a plain Foundry Item drag that sheets accept, carrying the ref. */
export function dragPayload(ref, extra = {}) {
  return {type: 'Item', uuid: ref?.uuid, agItemRef: ref, ...extra};
}
