/**
 * Optional, read-only bridge for Archie resolver v0.1.3 prototype results.
 * Do not depend on its unapproved distribution API, nor create a new registry.
 * FAC metadata remains definition data; mutable layout/inventory are HQ state.
 */
const FAC=/^FAC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export async function inspectFacilityRef(ref,resolve){
 if(!FAC.test(ref||''))return {status:'invalid_id',ref};
 if(typeof resolve!=='function')return {status:'unavailable',ref};
 try{
   const result=await resolve(ref,{entityType:'Facility'});
   if(!result || typeof result.status!=='string')return {status:'unavailable',ref};
   if(result.status==='ok')return {status:'ok',ref,record:result.record??result.value??result.entry??null};
   if(['not_found','conflict','invalid_id','inactive','stale','forbidden','restricted'].includes(result.status))
      return {status:result.status,ref};
   return {status:'unsupported',ref,reason:result.status};
 }catch(e){return {status:'unavailable',ref,reason:String(e?.message||e).slice(0,140)};}
}
