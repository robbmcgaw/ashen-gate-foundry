/** Ashen Gate Manager: immutable source definition → native Foundry projection.
 * DEC-0077–0081. Metadata is never a copy of mutable Actor/campaign state.
 */
const clone = value => structuredClone(value);
const OMIT = new Set(['foundry']);
export function canonicalDefinition(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('source record required');
  const result={};
  for(const [key,value] of Object.entries(record)) if(!OMIT.has(key)) result[key]=clone(value);
  return result;
}
export function validateLogicalProjection(record) {
  const errors=[];
  if(record?.foundry?.document_type==='Actor' && (record.entity_type==='Actor' || (record?.id?.startsWith('ACTOR-') && record.entity_type!=='NPC')))
    errors.push(`${record.id}: ACTOR-* reusable NPC definitions must use entity_type NPC, not Foundry Actor.`);
  if(record?.entity_type==='NPC' && record?.foundry?.document_type!=='Actor')
    errors.push(`${record.id}: NPC definition projection must use Foundry Actor.`);
  return errors;
}
export function sourceMetadata(record, pkg, refs) {
  const definition=canonicalDefinition(record);
  return {
    sourceId:record.id, entityType:record.entity_type, status:record.status,
    ownerSystemId:record.owner_system_id??null,objectiveKind:record.objective_kind??null,
    visibility:record.visibility,version:record.version,sourceVersion:record.version,
    provenance:clone(record.provenance),refs:clone(refs),scope:record.scope??null,
    schemaVersion:pkg.manifest.schema_version,
    ownedResourceIds:record.entity_type==='Location'?(record.resource_opportunities??[]).map(x=>x.id):[],
    packageId:pkg.manifest.package_id,packageVersion:pkg.manifest.version,
    // Schema-domain fields (recipe ingredients, materials, perks etc.) remain native
    // definition metadata, never copied from Actor inventories or campaign state.
    definition,
    templateId:record.template_ref??null,templateVersion:record._ag_template_version??null
  };
}
export function readStoredDefinition(flag){
  if(!flag || typeof flag!=='object') return null;
  if(flag.definition) return clone(flag.definition);
  // Historical Manager projections retain the envelope only. Do not fabricate
  // missing material costs, requirements, sources or specialist-specific fields.
  return {id:flag.sourceId,entity_type:flag.entityType,status:flag.status,
    version:flag.sourceVersion??flag.version,provenance:clone(flag.provenance),
    visibility:flag.visibility,refs:clone(flag.refs),...(flag.scope?{scope:flag.scope}:{})};
}
