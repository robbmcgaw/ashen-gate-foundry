/**
 * RollTable results in the V14 data model (0.60.12). A TableResult is {type, name, description, img, documentUuid,
 * weight, range, drawn, flags}. The older names (text, documentCollection, documentId) are compatibility shims in V14
 * (they log a deprecation, and the documentCollection one can throw) and are gone in V15, so:
 *  - a LIVE result (document.toObject() data) is read only through the V14 names, never the old ones;
 *  - a PACKAGE result may still use the old names (plain JSON, nothing deprecated is touched) and is mapped to V14 names.
 * Pure logic.
 */
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Result keys that are not compared or created from (Foundry owns them). */
export const RESULT_SKIP = Object.freeze(['_id', '_stats', 'drawn', 'sort', 'flags']);
/** Old package names -> V14 name (documentCollection + documentId together become documentUuid). */
const RENAMED = Object.freeze({text: 'description', documentCollection: 'documentUuid', documentId: 'documentUuid'});

/** documentUuid from a package's old documentCollection + documentId (a world collection like "Item", or a compendium pack id). */
export function legacyDocumentUuid(collection, id, packs = globalThis.game?.packs) {
  if (typeof collection !== 'string' || !collection || typeof id !== 'string' || !id) return null;
  if (!collection.includes('.')) return `${collection}.${id}`;
  const docName = packs?.get?.(collection)?.documentName;
  return docName ? `Compendium.${collection}.${docName}.${id}` : `Compendium.${collection}.${id}`;
}

/** A package result as V14 data: text -> description, documentCollection/documentId -> documentUuid. Other keys are kept. */
export function packageResultV14(def, packs) {
  const out = {};
  if (!isObj(def)) return out;
  for (const [k, v] of Object.entries(def)) if (!own(RENAMED, k)) out[k] = v;
  if (own(def, 'description')) out.description = def.description;
  else if (own(def, 'text')) out.description = def.text;
  if (own(def, 'documentUuid')) out.documentUuid = def.documentUuid;
  else if (own(def, 'documentCollection') || own(def, 'documentId')) {
    const uuid = legacyDocumentUuid(def.documentCollection, def.documentId, packs);
    if (uuid) out.documentUuid = uuid;
  }
  return out;
}

/** What the planner compares: every V14 field with its default, from a package result (old names accepted). */
export const normalizePackageResult = (def, packs) => {
  const r = packageResultV14(def, packs);
  return {type: r.type ?? 'text', name: r.name ?? '', description: r.description ?? '', range: r.range ?? [1, 1], weight: r.weight ?? 1, documentUuid: r.documentUuid ?? null, img: r.img ?? null, ...r};
};
/** The same for a live result's toObject() data: V14 names only, null-safe, no deprecated accessor is read. */
export const normalizeLiveResult = raw => {
  const r = isObj(raw) ? raw : {};
  return {type: r.type ?? 'text', name: r.name ?? '', description: r.description ?? '', range: r.range ?? [1, 1], weight: r.weight ?? 1, documentUuid: r.documentUuid ?? null, img: r.img ?? null};
};

/** True when the live result already carries everything the package result defines. */
export function resultMatches(def, liveRaw, same, packs) {
  const want = normalizePackageResult(def, packs), have = normalizeLiveResult(liveRaw);
  const keys = new Set(Object.keys(def ?? {}).map(k => RENAMED[k] ?? k));
  for (const k of keys) {
    if (RESULT_SKIP.includes(k)) continue;
    // A key outside the V14 core set is compared as the live data holds it (own data only, never a getter).
    const live = k in have ? have[k] : (isObj(liveRaw) && Object.getOwnPropertyDescriptor(liveRaw, k)?.value);
    if (!same(want[k] ?? null, live ?? null)) return false;
  }
  return true;
}

/** Data for createEmbeddedDocuments('TableResult'): V14 names only, no _id, drawn reset. */
export function resultCreateData(def, packs) {
  const { _id, drawn, ...rest } = packageResultV14(def, packs);
  return {...rest, drawn: false};
}
