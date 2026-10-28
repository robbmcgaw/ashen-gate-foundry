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
const isPlain = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
function withRemovals(stored, incoming) {
  const out = {...incoming};
  for (const [key, value] of Object.entries(incoming)) if (isPlain(value) && isPlain(stored?.[key])) out[key] = withRemovals(stored[key], value);
  // Keys with a dot cannot be named in a Foundry deletion (it would read them as a path); they are left as they are.
  if (isPlain(stored)) for (const key of Object.keys(stored)) if (!(key in incoming) && !key.includes('.') && !key.startsWith('-=')) out[`-=${key}`] = null;
  return out;
}
/**
 * 0.71.3: the source flag to hand to document.update(). Foundry MERGES an object written to a flag, so a field the package
 * no longer carries (a field the package dropped) would stay in the stored definition for ever. Each key that is in the stored
 * `definition` / `provenance` but not in the new flag is added as Foundry's `-=key: null` deletion, so those two are replaced
 * by the package's version. Everything else in the flag (managedFields, memo, ...) merges exactly as before. Pure; `stored` may be missing.
 */
export function replacingSourceFlag(stored, flag) {
  if (!isPlain(flag)) return flag;
  const out = {...flag};
  for (const part of ['definition', 'provenance']) if (isPlain(stored?.[part]) && isPlain(flag[part])) out[part] = withRemovals(stored[part], flag[part]);
  return out;
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
