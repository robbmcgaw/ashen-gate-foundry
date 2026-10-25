/**
 * Related lists (0.69.0). Pure; no Foundry globals.
 *
 * An Item's description may end with a short "Related" list of reference links (@AGRef, see reference-links.mjs) that
 * Manager writes on import and Sync, but ONLY where it helps players: a named person (NPC), a handout (the journal or its
 * player Item twin) or a quest/order/contract the Item points to through its typed `refs`. Plain gear, materials, recipes,
 * shops, locations, factions and the like never get a list.
 *
 * relatedFor(record) is the whole rule:
 *  - Only an Item record that is not GM-only (visibility "gm") can have a list.
 *  - A ref qualifies by its TARGET id: NPC-* (a person), HANDOUT-* or ITEM-HANDOUT-* (a handout), QUEST-* / ORDER-* /
 *    CONTRACT-* (a quest, order or contract). Anything else (LOC-, REC-, MAT-, PROF-, PERK-, FAC-, CRE-, SHOP-, ...) is ignored.
 *  - A relation naming the Item's structure is ignored whatever the target (STRUCTURAL_RELATIONS: requires_material,
 *    produces, starting_recipe, ...). Every other relation (related, offers_objective, associated_objective,
 *    fulfills_objective, found_with, created_by, ...) qualifies; unknown relation names qualify too.
 *  - A ref to the Item itself, to its own journal (an Item twin ITEM-HANDOUT-X never lists HANDOUT-X) or declared by
 *    `also_available_as_journal` (the Item IS the player twin) is skipped: the reader already holds it.
 *  - One line per target (a journal and its Item twin are one handout); the first ref in the file wins.
 *  - Order: handouts first, then people, then quests, each in file order. At most RELATED_MAX (5) lines.
 *
 * The line text is the reader-neutral word ("Handout", "Person", "Quest") with a short plain-English lead-in for a few
 * relations ("Offers: "). The reference resolver replaces it with the record's NAME for each viewer, and never writes an
 * id into visible text. The section is a pure function of the record, so the same import twice is byte-identical.
 */
export const RELATED_MAX = 5;
/** The section marker Manager has owned since 0.54 (older imports wrote it, 0.68.0 converted it). Keep it exactly. */
export const SECTION_OPEN = '<section class="ag-managed-links" data-ag-managed-links="1">';
const SECTION_RE = /\n?<section\b[^>]*\bdata-ag-managed-links="1"[^>]*>[\s\S]*?<\/section>/g;
const ID_OK = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9_]+)+$/;

/** Relations that describe what an Item is made of or where it belongs; their targets are never Related-list material. */
export const STRUCTURAL_RELATIONS = Object.freeze(['requires_material', 'produces', 'starting_recipe', 'transformed_form_of', 'requires_profession',
  'has_profession', 'perk_of', 'has_hireling_perk', 'gathered_by', 'crafted_by', 'uses_resource', 'used_by_recipe', 'documents_recipe',
  'for_faction', 'located_at', 'targets_location', 'route_from', 'route_to']);
const STRUCTURAL = new Set(STRUCTURAL_RELATIONS);
/** Short lead-ins, shown to players. A relation not listed here gets no lead-in. */
export const LEAD_INS = Object.freeze({offers_objective: 'Offers', associated_objective: 'Associated with', fulfills_objective: 'Fulfills',
  found_with: 'Found with', created_by: 'Made by', offered_by: 'Offered by'});
const KINDS = [
  {kind: 'handout', rank: 0, label: 'Handout', test: id => /^(?:ITEM-)?HANDOUT-/.test(id)},
  {kind: 'npc', rank: 1, label: 'Person', test: id => /^NPC-/.test(id)},
  {kind: 'quest', rank: 2, label: 'Quest', test: id => /^QUEST-/.test(id)},
  {kind: 'order', rank: 2, label: 'Order', test: id => /^ORDER-/.test(id)},
  {kind: 'contract', rank: 2, label: 'Contract', test: id => /^CONTRACT-/.test(id)}
];

function refParts(ref) {
  if (typeof ref === 'string') return {relation: 'related', id: ref};
  if (!ref || typeof ref !== 'object') return null;
  const id = ref.target_id ?? ref.id, relation = ref.relation ?? ref.type ?? 'related';
  return typeof id === 'string' ? {relation: String(relation), id} : null;
}

/**
 * The Related lines for one source record: [{id, kind, relation, lead, label}], best first, at most RELATED_MAX.
 * `id` is the reference to write (a handout is always its journal id; the resolver prefers the Item twin).
 */
export function relatedFor(record) {
  if (record?.foundry?.document_type !== 'Item' || record.visibility === 'gm' || !Array.isArray(record.refs)) return [];
  const self = String(record.id ?? '');
  const seen = new Set(), found = [];
  record.refs.forEach((ref, order) => {
    const p = refParts(ref);
    if (!p || !ID_OK.test(p.id) || STRUCTURAL.has(p.relation) || p.relation === 'also_available_as_journal') return;
    const kind = KINDS.find(k => k.test(p.id));
    if (!kind) return;
    const id = kind.kind === 'handout' ? p.id.replace(/^ITEM-/, '') : p.id;
    // Itself, or its own journal (the Item twin of HANDOUT-X is ITEM-HANDOUT-X).
    if (p.id === self || id === self || (kind.kind === 'handout' && `ITEM-${id}` === self)) return;
    if (seen.has(id)) return;
    seen.add(id);
    found.push({id, kind: kind.kind, relation: p.relation, lead: LEAD_INS[p.relation] ?? '', label: kind.label, rank: kind.rank, order});
  });
  found.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return found.slice(0, RELATED_MAX).map(({rank, order, ...line}) => line);
}

/** The section's HTML for those lines ('' for none). Same marker the older "References" section used. */
export function relatedSection(lines) {
  if (!lines?.length) return '';
  const items = lines.map(l => `<li>${l.lead ? `${l.lead}: ` : ''}@AGRef[${l.id}]{${l.label}}</li>`).join('');
  return `${SECTION_OPEN}<h4>Related</h4><ul>${items}</ul></section>`;
}

/** Removes every Manager-owned section (and the line break before it). Idempotent. */
export function stripRelated(html) {
  return typeof html === 'string' && html.includes('data-ag-managed-links') ? html.replace(SECTION_RE, '') : html;
}

/**
 * The description with the Related section at its end: any Manager-owned section is replaced (never duplicated); with no
 * lines the description has none. Not a string -> returned as it is.
 */
export function withRelated(html, lines) {
  if (typeof html !== 'string') return html;
  const base = stripRelated(html), section = relatedSection(lines);
  return section ? `${base}\n${section}` : base;
}

/** An Item's `system` object as the import writes it: description + Related section. Other records, and Items without a text description, come back unchanged. */
export function systemWithRelated(record, system) {
  const text = system?.description?.value;
  if (typeof text !== 'string') return system;
  const lines = relatedFor(record);
  if (!lines.length) return system;
  return {...system, description: {...system.description, value: withRelated(text, lines)}};
}
