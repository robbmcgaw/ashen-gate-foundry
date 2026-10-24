/** Shared Ashen Gate contract v0.2 compatibility; no Foundry runtime dependencies. */
export const CONTRACT_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
export const CONTRACT_STATUS = new Set(['proposed','draft','approved','superseded','retired']);
export const CONTRACT_VISIBILITY = new Set(['player','gm','reveal_gated']);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const REFERENCE_TYPES = Object.freeze({
  offers_objective:'Objective',targets_location:'Location',requires_material:'Material',
  requires_profession:'Profession',fulfills_objective:'Objective',uses_resource:'ResourceOpportunity',
  grants_power:'Power',mutation_power:'Power',has_power:'Power',relates_to_mutation:'Mutation',
  has_hireling_perk:'HirelingPerk'
});
const prefixFor = {quest:'QUEST-',work_order:'ORDER-',contract:'CONTRACT-'};
export const isContractImport = pkg => pkg?.manifest?.schema_version === 'ag-foundry-import/0.2';

export function checkContractRecord(rec, label) {
  const errors=[];
  if (!isObj(rec)) return [`${label}: expected object.`];
  if (!CONTRACT_ID.test(rec.id ?? '')) errors.push(`${label}.id: invalid Archie permanent ID format.`);
  if (typeof rec.entity_type !== 'string' || !rec.entity_type.trim()) errors.push(`${label}.entity_type is required.`);
  if (!CONTRACT_STATUS.has(rec.status)) errors.push(`${label}.status: expected approved/draft/proposed/superseded/retired.`);
  if (typeof rec.version !== 'string' || !rec.version.trim()) errors.push(`${label}.version is required.`);
  if (!isObj(rec.provenance) || !Array.isArray(rec.provenance.sources) || rec.provenance.sources.some(s=>typeof s!=='string' || !s.trim()))
    errors.push(`${label}.provenance.sources: array of source identifiers required.`);
  if (rec.provenance?.decision_refs != null && (!Array.isArray(rec.provenance.decision_refs) || rec.provenance.decision_refs.some(s=>typeof s!=='string')))
    errors.push(`${label}.provenance.decision_refs must be an array of strings.`);
  if (!CONTRACT_VISIBILITY.has(rec.visibility)) errors.push(`${label}.visibility: expected player/gm/reveal_gated.`);
  if (!Array.isArray(rec.refs)) errors.push(`${label}.refs: array required.`);
  else for (const [i,ref] of rec.refs.entries()) {
    if (!isObj(ref) || Object.keys(ref).some(k=>!['relation','target_id','mode'].includes(k)) ||
        typeof ref.relation!=='string' || !ref.relation.trim() || !CONTRACT_ID.test(ref.target_id??'') ||
        !['required','optional'].includes(ref.mode)) errors.push(`${label}.refs[${i}]: expected {relation,target_id,mode:required|optional}.`);
  }
  if (rec.scope!=null && !['generic_rules','setting_adapter','campaign_state','publication'].includes(rec.scope))
    errors.push(`${label}.scope: invalid scope.`);
  if(rec.entity_type==='HirelingPerk' || rec.id?.startsWith('HPERK-')) {
    if(rec.entity_type!=='HirelingPerk' || !/^HPERK-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(rec.id??''))
      errors.push(`${label}: HPERK-* IDs require entity_type HirelingPerk.`);
    if(typeof rec.name!=='string'||!rec.name.trim())errors.push(`${label}.name: required for HirelingPerk.`);
    if(!Array.isArray(rec.contexts)||!rec.contexts.length||new Set(rec.contexts).size!==rec.contexts.length||
       rec.contexts.some(x=>!['headquarters','field','passive'].includes(x)))errors.push(`${label}.contexts: nonempty unique headquarters/field/passive values required.`);
    if(!isObj(rec.conditions)||Object.keys(rec.conditions).some(k=>!['requires_working','requires_presence','eligible_facility_refs','required_capability_keys'].includes(k)))
      errors.push(`${label}.conditions: invalid or missing.`);
    else {
      for(const k of ['requires_working','requires_presence'])if(rec.conditions[k]!==undefined&&typeof rec.conditions[k]!=='boolean')errors.push(`${label}.conditions.${k}: boolean required.`);
      if(rec.conditions.eligible_facility_refs!==undefined && (!Array.isArray(rec.conditions.eligible_facility_refs)||new Set(rec.conditions.eligible_facility_refs).size!==rec.conditions.eligible_facility_refs.length||rec.conditions.eligible_facility_refs.some(x=>!/^FAC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(x))))errors.push(`${label}.conditions.eligible_facility_refs: invalid FAC-* refs.`);
      if(rec.conditions.required_capability_keys!==undefined && (!Array.isArray(rec.conditions.required_capability_keys)||rec.conditions.required_capability_keys.some(x=>!/^[a-z][a-z0-9_-]*$/.test(x))))errors.push(`${label}.conditions.required_capability_keys: invalid capability keys.`);
    }
    if(!isObj(rec.stacking)||Object.keys(rec.stacking).some(k=>!['overlap_group','allow_overlap'].includes(k))||
      (rec.stacking?.allow_overlap!==undefined&&typeof rec.stacking.allow_overlap!=='boolean')||
      (rec.stacking?.overlap_group!==undefined&&!/^[a-z][a-z0-9_-]*$/.test(rec.stacking.overlap_group)))
      errors.push(`${label}.stacking: invalid or missing.`);
    if(!['automatic','informational','gm_resolved','hybrid'].includes(rec.implementation))errors.push(`${label}.implementation: invalid.`);
    if(rec.foundry?.document_type==='Item'&&rec.foundry.data?.type!=='feat')errors.push(`${label}.foundry: HirelingPerk Items must project as feat.`);
  }
  if (rec.entity_type==='Objective') {
    if (!['quest','work_order','contract'].includes(rec.objective_kind)) errors.push(`${label}.objective_kind: invalid Objective kind.`);
    else if (!rec.id?.startsWith(prefixFor[rec.objective_kind])) errors.push(`${label}.id: wrong prefix for ${rec.objective_kind} Objective.`);
    if (!isObj(rec.source) || !Array.isArray(rec.objectives) || !rec.objectives.length || !Array.isArray(rec.locations) || !isObj(rec.parameters) || !isObj(rec.outcomes))
      errors.push(`${label}: Objective requires source/objectives/locations/parameters/outcomes.`);
    // 0.51.0: creative (Artistry commissions) joins crafting and production; Quest Log 0.18.0 accepts the same three.
    if (rec.objective_kind==='work_order' && !['crafting','production','creative'].includes(rec.work_order_domain))
      errors.push(`${label}.work_order_domain: Work Order requires a crafting, production or creative domain.`);
  }
  if (rec.entity_type==='Assignment') {
    if (!rec.id?.startsWith('ASSIGN-') || rec.scope!=='campaign_state' || !rec.owner_system_id?.startsWith('SYS-') || !rec.execution_status || !Array.isArray(rec.participants))
      errors.push(`${label}: Assignment needs ASSIGN- id, campaign_state, owner_system_id, execution_status and participants.`);
  }
  return errors;
}

/**
 * 0.44.2: id prefixes owned by another Ashen Gate module, which imports and keeps those records itself.
 * A link to one that is not in this package or world is not a Manager problem, just a record that comes in
 * separately. Ids Manager imports itself (MAT-, PROF-, REC-, PERK-, ITEM-, ...) are not listed and stay "missing".
 */
export const MODULE_OWNED_PREFIXES = Object.freeze([
  {moduleId:'ashen-gate-locations', label:'Locations', prefixes:['LOC-','RTE-']},
  {moduleId:'ashen-gate-factions', label:'Renown', prefixes:['FACTION-','RENOWN-','DEITY-']},
  {moduleId:'ashen-gate-quest-manager', label:'Quest Log', prefixes:['QUEST-','ORDER-','CONTRACT-','ASSIGN-']},
  {moduleId:'ashen-gate-headquarters', label:'Headquarters', prefixes:['FAC-']},
  // 0.44.3: Utilities shops. Not a linkable document; a link to one is informational, like the others.
  {moduleId:'ashen-gate-utilities', label:'Utilities', prefixes:['SHOP-']}
]);
/** The module that owns an id by its prefix, or null when Manager (or nobody) does. */
export function ownerModuleFor(id) {
  const value=String(id ?? '');
  return MODULE_OWNED_PREFIXES.find(o=>o.prefixes.some(p=>value.startsWith(p))) ?? null;
}
/** Preview wording for a link to another module's record. `active` (optional) is whether that module is on here. */
export function moduleLinkNote(recId, targetId, owner, active) {
  return `${recId}: links to ${owner.label} record ${targetId} (imported separately).${active===false?` ${owner.label} is not active in this world.`:''}`;
}

/** Existing index accepts world source flags with entityType/scope, or full source records.
 * `moduleLinks` lists absent optional links to records another module owns; they are informational, not warnings.
 * `isModuleActive(moduleId)` (optional) lets the caller feature-detect the owning module for the wording. */
export function checkContractGraph(records, externalIndex = new Map(), isModuleActive = null) {
  const errors=[],warnings=[],moduleLinks=[];
  const internal=new Map(records.map(rec=>[rec.id,rec]));
  for (const rec of records) if (rec.entity_type === 'Location') {
    for (const child of rec.resource_opportunities ?? []) {
      if (!CONTRACT_ID.test(child.id ?? '') || !child.id.startsWith('RES-')) errors.push(`${rec.id}: invalid RES resource opportunity ID.`);
      if (internal.has(child.id)) errors.push(`${rec.id}: duplicate resource ID ${child.id}.`);
      else internal.set(child.id,{...child,entity_type:'ResourceOpportunity',scope:rec.scope});
    }
  }
  // A bare Set of known ids (no type or scope to compare) still resolves links; anything else is ignored.
  const external=externalIndex instanceof Map ? externalIndex : externalIndex instanceof Set ? new Map([...externalIndex].map(id=>[id,{}])) : new Map();
  for (const rec of records) for (const link of rec.refs ?? []) {
    const target=internal.get(link.target_id) ?? external.get(link.target_id);
    if (!target) {
      const owner=ownerModuleFor(link.target_id);
      const active=owner && typeof isModuleActive==='function' ? Boolean(isModuleActive(owner.moduleId)) : undefined;
      // A required link still blocks (import behaviour unchanged); the message says where the record comes from.
      if (link.mode==='required') errors.push(`${rec.id}: unresolved required reference ${link.target_id}.${owner?` It is a ${owner.label} record (imported separately): import it in ${owner.label} first, or make the link optional.`:''}`);
      else if (owner) moduleLinks.push(moduleLinkNote(rec.id,link.target_id,owner,active));
      else warnings.push(`${rec.id}: optional reference ${link.target_id} absent; its canonical ID will be preserved for later resolution.`);
      continue;
    }
    const type=target.entity_type ?? target.entityType;
    const expected=REFERENCE_TYPES[link.relation];
    if (expected && type && type!==expected) errors.push(`${rec.id}: ${link.relation} expects ${expected}, but ${link.target_id} is ${type}.`);
    if (rec.scope && rec.scope!=='campaign_state' && target.scope==='campaign_state')
      errors.push(`${rec.id}: a reusable definition may not reference campaign state ${link.target_id}.`);
  }
  return {errors,warnings,moduleLinks};
}

/** Only apply if every required dependency is existing or selected for import. */
export function selectionIssues(records, chosenIds, alreadyExistingIds) {
  const chosen=new Set(chosenIds), existing=new Set(alreadyExistingIds), problems=[];
  for (const rec of records) if (chosen.has(rec.id) && rec.entity_type==='Location') {
    for (const child of rec.resource_opportunities ?? []) chosen.add(child.id);
  }
  for (const rec of records) {
    if (!chosen.has(rec.id)) continue;
    for (const ref of rec.refs ?? []) {
      const required = ref?.mode === 'required' || ref?.mode === 'hard_requirement' || typeof ref === 'string' || (ref?.id && !ref.optional);
      const id = typeof ref==='string' ? ref : ref?.target_id ?? ref?.id;
      if (required && !chosen.has(id) && !existing.has(id)) problems.push(`${rec.id}: select required ${id} or import it first.`);
    }
  }
  return problems;
}

/** Preserve canonical refs, including missing optional targets. Resolved UUIDs and
 * unresolved diagnostics are separate, derived bindings. Earlier releases
 * silently discarded absent optional IDs, making future references impossible.
 */
export function projectedReferences(refs, _presentIds) {
  if(!Array.isArray(refs)) throw new TypeError('refs must be an array');
  return structuredClone(refs);
}

/**
 * Final link reconciliation after a batch has created/updated its documents.
 * Required relationships may be cyclic: the stable ID is the link identity.
 * Never leave a required link pointing to a failed or excluded import target.
 * The caller must surface missingRequired and mark the operation incomplete.
 */
export function finalReferenceResolution(refs, presentIds) {
  const present=new Set(presentIds),resolved=[],missingRequired=[];
  for (const ref of refs ?? []) {
    const id=typeof ref==='string' ? ref : ref?.target_id ?? ref?.id;
    const optional=ref?.mode==='optional' || ref?.mode==='optional_integration' || ref?.mode==='coupled' || ref?.optional===true;
    if (present.has(id)) resolved.push(ref);
    else if (!optional) missingRequired.push(id);
  }
  return {resolved,missingRequired};
}

/** Review-only legacy mappings; never silently rebind historical Foundry items. */
export function checkLegacyCrosswalk(entries) {
  const errors=[];
  if (entries===undefined) return errors;
  if (!Array.isArray(entries)) return ['legacy_crosswalk must be an array.'];
  const seen=new Set();
  for (const [i,entry] of entries.entries()) {
    const label=`legacy_crosswalk[${i}]`;
    if (!isObj(entry) || typeof entry.source_ref!=='string' || !entry.source_ref.trim() ||
        typeof entry.legacy_id!=='string' || !entry.legacy_id.trim() ||
        !CONTRACT_ID.test(entry.canonical_id ?? '') ||
        !['malformed','duplicate','namespace_collision','verified_alias'].includes(entry.reason) ||
        !['proposed','reviewed','approved','blocked'].includes(entry.review_status) ||
        (entry.changed_reference_paths!==undefined && (!Array.isArray(entry.changed_reference_paths) || entry.changed_reference_paths.some(x=>typeof x!=='string'))))
      errors.push(`${label}: invalid source-qualified legacy ID crosswalk entry.`);
    if (isObj(entry)) {
      const key=`${entry.source_ref}|${entry.legacy_id}`;
      if (seen.has(key)) errors.push(`${label}: duplicate source/legacy mapping.`);
      seen.add(key);
    }
  }
  return errors;
}
