/** Read-only native Foundry world definitions; Manager remains their import owner.
 * Never parse HTML descriptions as canonical capability/perk condition data.
 * Redact everything without explicit player visibility and Foundry permission.
 */
import {HIRE_REF,PERK_REF} from './hirelings.mjs';
const visible=(doc,src,user)=> !!user?.isGM || (src.visibility==='player' && doc?.testUserPermission?.(user,'OBSERVER')===true);
const collectionDocs=coll=>coll?.contents??(typeof coll?.values==='function'?[...coll.values()]:[]);
export function readNativeHirelingDefinitions(game,user){
 const records=new Map(), conflicts=new Set();
 for(const doc of [...collectionDocs(game?.items),...collectionDocs(game?.journal)]){
  const manager=doc?.flags?.['ashen-gate-manager'];
  if(manager?.lifecycle?.archived===true)continue;
  const src=manager?.source??{};
  // A projected campaign-state document is not a reusable HIRE/HPERK definition.
  // Never allow native-source lookups to mistake mutable personnel state for a definition.
  if(src.scope==='campaign_state')continue;
  const id=src.sourceId;const type=src.entityType;
  if(!((type==='Hireling'&&HIRE_REF.test(id||''))||(type==='HirelingPerk'&&PERK_REF.test(id||''))))continue;
  if(!visible(doc,src,user))continue;
  // Only explicitly authored structured payloads supply eligibility fields.
  const structured=src.record??src.canonicalRecord??src.definition??null;
  const record=structured && typeof structured==='object' && structured.id===id && structured.entity_type===type && structured.scope!=='campaign_state' ? structured : null;
  // If the importer published an embedded record whose ID/type/scope contradicts
  // the binding, reject the projection rather than silently displaying a false type.
  if(structured && !record)continue;
  const safe={id,entity_type:type,name:doc.name??id,img:doc.img??null,visibility:src.visibility??'gm',
    role:record?.role??null,capabilities:record?.capabilities??null,
    refs:Array.isArray(record?.refs)?record.refs:Array.isArray(src.refs)?src.refs:[],
    contexts:record?.contexts??null,conditions:record?.conditions??null,stacking:record?.stacking??null,
    description:typeof record?.description==='string'?record.description:'',
    source_uuid:doc.uuid??null,verified_conditions:!!record?.conditions};
  if(records.has(id)){conflicts.add(id);records.delete(id);}
  else if(!conflicts.has(id))records.set(id,safe);
 }
 return {records,conflicts};
}
