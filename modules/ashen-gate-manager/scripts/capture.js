/** Ashen Gate Manager — recovery-only Item capture/export helpers, v0.2.0.
 * These records are intentionally NOT canonical source records.
 */
import {isPlainObject, SOURCE_ID_PATTERN, MODULE_ID} from './core.js';

export const CAPTURE_TYPES = Object.freeze([
  'Item', 'Material', 'Profession', 'ProfessionPerk', 'Recipe', 'Mutation', 'Power', 'Other'
]);
export const CAPTURE_ID_PATTERN = /^AGCAP-[A-Za-z0-9_-]{8,}$/;

/** Capture is a review tag, never an approval or ownership claim. */
export function normalizeCaptureFlag(value) {
  if (!isPlainObject(value) || !CAPTURE_ID_PATTERN.test(value.captureId ?? '')) return null;
  return {
    captureId: value.captureId,
    entityType: CAPTURE_TYPES.includes(value.entityType) ? value.entityType : 'Other',
    reviewStatus: 'unreviewed',
    taggedAt: typeof value.taggedAt === 'string' ? value.taggedAt : null
  };
}

/** Copy only export-relevant world Item fields. Do not emit ownership, folder, _stats,
 * Foundry document identity or the manager's private local tracking flags.
 * Module-specific flags are kept because many D&D5e records rely on them.
 */
export function captureItemData(rawItem) {
  if (!isPlainObject(rawItem) || typeof rawItem.name !== 'string' || typeof rawItem.type !== 'string') {
    throw new Error('Item capture requires a Foundry Item source object with name and type.');
  }
  const copy = globalThis.structuredClone ? structuredClone(rawItem) : JSON.parse(JSON.stringify(rawItem));
  const flags = isPlainObject(copy.flags) ? copy.flags : {};
  delete flags[MODULE_ID];
  return {
    name: copy.name,
    type: copy.type,
    img: typeof copy.img === 'string' ? copy.img : null,
    system: isPlainObject(copy.system) ? copy.system : {},
    effects: Array.isArray(copy.effects) ? copy.effects : [],
    flags
  };
}

/** Pure export serializer. `items` are shallow snapshots from Foundry documents:
 * {id, uuid, capture, source, raw}; excludes untagged items.
 */
export function buildCapturePackage(items, {exportedAt = new Date().toISOString(), worldId = null} = {}) {
  const captures = [];
  const seen = new Set();
  for (const item of items) {
    const capture = normalizeCaptureFlag(item.capture);
    if (!capture) continue;
    if (seen.has(capture.captureId)) throw new Error(`Duplicate capture ID: ${capture.captureId}. Export halted.`);
    seen.add(capture.captureId);
    const sourceId = typeof item.source?.sourceId === 'string' && SOURCE_ID_PATTERN.test(item.source.sourceId)
      ? item.source.sourceId : null;
    captures.push({
      capture_id: capture.captureId,
      suggested_entity_type: capture.entityType,
      review_status: 'unreviewed',
      source: {
        kind: 'foundry_world_item',
        document_uuid: typeof item.uuid === 'string' ? item.uuid : null,
        world_item_id: typeof item.id === 'string' ? item.id : null,
        existing_ashen_gate_id: sourceId,
        existing_package_id: item.source?.packageId ?? null,
        tagged_at: capture.taggedAt
      },
      foundry: {document_type: 'Item', data: captureItemData(item.raw)}
    });
  }
  captures.sort((a,b)=>a.foundry.data.name.localeCompare(b.foundry.data.name) || a.capture_id.localeCompare(b.capture_id));
  return {
    manifest: {
      schema_version:'ag-foundry-capture/0.2',
      package_id:'AG-FOUNDRY-WORLD-ITEM-CAPTURE',
      exported_at:exportedAt,
      source_world_id:worldId,
      record_count:captures.length,
      review_status:'unreviewed',
      purpose:'Review and reconcile for potential GitHub source migration; NOT a canonical import package',
      includes:'World Items only; not Actor inventory, macros, or Skill Tree Journals'
    },
    records:captures
  };
}
