/** Cinders backup export (0.17.0). Pure JS, no Foundry runtime: cinder-runtime.mjs hands it what it read through its own readers.
 * `ag-cinders-state-export/0.1` is campaign PLAY STATE (every Cinder instance, the GM's stage art, each character's Strain) plus the
 * settings that change the rules. It is not a definition format, so General Manager's importers never read a backup file as content.
 * No timestamps of its own and no definition text (names and ids only; the content pack holds the Cinders' text). */
export const STATE_EXPORT_SCHEMA='ag-cinders-state-export/0.1';
const byText=(a,b)=>String(a??'').localeCompare(String(b??''));
const ids=list=>[...new Set((Array.isArray(list)?list:[]).filter(x=>typeof x==='string'))].sort(byText);
const who=(id,name)=>id?{actor_id:id,actor_name:name??null}:null;
const stages=list=>Array.isArray(list)?list.map(s=>({art:s.art,at:s.at})):null;
/**
 * @param {object} args
 * @param {boolean} args.isGM  refused unless true (the API checks too; this is the service-level guard)
 * @param {object} args.config  {maxCinders, startingPoints, socketsPerCinder, strain}
 * @param {object[]} args.instances  registry instances, each with the reads added by the runtime:
 *   {...instance, name, bearerName, lastBearerName, unspent, powers:[{powerId,nodeId}], enhancements:[{powerId}], stage:{number,held}|null,
 *    attachedNames:{[itemId]:name}}
 * @param {Object<string,{art:string,at:number}[]>} args.stageArt  the GM's world stage art, keyed by definition id
 * @param {{id:string,name:string,value:number,band:{label:string,from:number,to:number|null},historyLength:number}[]} args.strain
 */
export function buildStateExport({isGM,config={},instances=[],stageArt={},strain=[]}){
  if(isGM!==true)throw Error('GM authorization required.');
  const cinders=(instances??[]).map(i=>({
    instance_id:i.instanceId,definition_id:i.definitionId,name:i.name??null,status:i.status??'unbound',
    bearer:who(i.bearer?.actorId,i.bearerName),last_bearer:who(i.lastBearer,i.lastBearerName),
    points:{awarded:i.progression?.awarded??0,unspent:Number.isFinite(i.unspent)?i.unspent:null,grants:(i.progression?.grants??[]).map(g=>({key:g.key,amount:g.amount})).sort((a,b)=>byText(a.key,b.key))},
    unlocked_node_ids:ids(i.progression?.unlocks),
    powers:(i.powers??[]).map(p=>({power_id:p.powerId,node_id:p.nodeId??null})).sort((a,b)=>byText(a.power_id,b.power_id)),
    enhancements:ids((i.enhancements??[]).map(e=>e.powerId)),
    art:{own:i.art??null,own_stages:stages(i.artStages),stage_hold:i.stageHold??null,stage:i.stage?{number:i.stage.number,held:i.stage.held===true}:null},
    sockets:{count:i.sockets?.count??null,locked:i.sockets?.locked===true,
      attached:(i.sockets?.attached??[]).map(a=>({slot:a.slot,item_id:a.itemId,source_id:a.sourceId??null,item_name:i.attachedNames?.[a.itemId]??null})).sort((a,b)=>a.slot-b.slot)}
  })).sort((a,b)=>byText(a.instance_id,b.instance_id));
  return {
    schema_version:STATE_EXPORT_SCHEMA,
    config:{cinders_per_character:config.maxCinders??null,starting_points:config.startingPoints??null,sockets_per_cinder:config.socketsPerCinder??null,strain:structuredClone(config.strain??null)},
    cinders,
    stage_art:Object.entries(stageArt??{}).map(([id,list])=>({definition_id:id,stages:stages(list)??[]})).sort((a,b)=>byText(a.definition_id,b.definition_id)),
    strain:(strain??[]).map(s=>({actor_id:s.id,actor_name:s.name??null,value:s.value??0,band:s.band?{label:s.band.label,from:s.band.from,to:s.band.to}:null,history_length:s.historyLength??0}))
      .sort((a,b)=>byText(a.actor_name,b.actor_name)||byText(a.actor_id,b.actor_id))
  };
}
