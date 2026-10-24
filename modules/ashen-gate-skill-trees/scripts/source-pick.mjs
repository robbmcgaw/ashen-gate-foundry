// Skill Trees: the profession or mutation a new tree belongs to is picked by name. Pure; no Foundry globals.
import {definitionSource, isActiveDefinition} from './definition-lookup.mjs';

/** What each provider links to: the record's entity type, its id shape, and the words the form uses. */
export const SOURCE_KINDS = Object.freeze({
  profession: {entityType: 'Profession', id: /^PROF-[A-Z0-9]+(?:-[A-Z0-9]+)*$/, label: 'Profession', none: 'No Profession records found. Import them in General Manager first.'},
  cinder_milestone: {entityType: 'Mutation', id: /^MUT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/, label: 'Mutation', none: 'No Mutation records found. Import them in General Manager first.'}
});

/** Picker records for the active, Manager-bound records of one provider kind in `docs` (world documents). Duplicates by id are dropped. */
export function sourceRecords(docs, providerKind) {
  const kind = SOURCE_KINDS[providerKind];
  if (!kind) return [];
  const seen = new Set(), out = [];
  for (const doc of docs ?? []) {
    const src = definitionSource(doc);
    if (!src || !isActiveDefinition(doc) || src.entityType !== kind.entityType || !kind.id.test(src.sourceId ?? '') || seen.has(src.sourceId)) continue;
    seen.add(src.sourceId);
    out.push({value: src.sourceId, label: String(doc.name ?? '').trim() || kind.label, kind: providerKind, hint: src.status && src.status !== 'approved' ? String(src.status) : ''});
  }
  return out;
}

/** The sentence for a tree that needs a link and has none. */
export const missingSourceMessage = providerKind => SOURCE_KINDS[providerKind] ? `Choose the ${SOURCE_KINDS[providerKind].label.toLowerCase()} this tree is for.` : '';
