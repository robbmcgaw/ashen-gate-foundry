/** Skill Trees backup export (0.25.0). Pure JS, no Foundry runtime: main.js hands it the stored GM layouts and each character's stored progress.
 * `ag-skill-trees-state-export/0.1` is the GM's layouts (which the GM may edit in the world) plus per-character progress. It is not the tree
 * package format (`ag-skill-trees/0.3`), so General Manager's importers never read a backup file as content. No timestamps of its own.
 * Perk text is never exported: a perk node carries its perk id (the content pack holds the text); only a custom node's own name is kept. */
export const STATE_EXPORT_SCHEMA='ag-skill-trees-state-export/0.1';
const byText=(a,b)=>String(a??'').localeCompare(String(b??''));
const ids=list=>[...new Set((Array.isArray(list)?list:[]).filter(x=>typeof x==='string'))].sort(byText);
const num=v=>Number.isFinite(v)?v:null;
function layoutNode(n){
  const out={id:n.id,perk_id:n.perkId??null,x:num(n.x),y:num(n.y),cost:num(n.cost),
    requires_all:ids(n.requiresAll),requires_any:(Array.isArray(n.requiresAny)?n.requiresAny:[]).map(ids).sort((a,b)=>byText(a.join('|'),b.join('|'))),excludes:ids(n.excludes),
    status:n.status??null,visibility:n.visibility??null,display:n.display??null,content_ref:n.contentRef??null,lane:typeof n.lane==='string'?n.lane:null};
  if(!n.perkId)out.name=n.name??'';
  return out;
}
function layout(tree){
  const row={tree_id:tree.id,name:tree.name??'',kind:tree.provider?.kind??'generic_points',status:tree.status??null,visibility:tree.visibility??null,
    source_ref:tree.sourceRef??null,provider:structuredClone(tree.provider??{}),
    access:tree.access?structuredClone(tree.access):null,
    appearance:{node_size:tree.nodeSize??null,background:tree.background?structuredClone(tree.background):null,tiers:Array.isArray(tree.tiers)?structuredClone(tree.tiers):[]},
    nodes:(Array.isArray(tree.nodes)?tree.nodes:[]).map(layoutNode).sort((a,b)=>byText(a.id,b.id))};
  return row;
}
/**
 * @param {object} args
 * @param {boolean} args.isGM  refused unless true (the API checks too; this is the service-level guard)
 * @param {object[]} args.trees  the GM's stored layouts (normalised trees)
 * @param {{id:string,name:string,trees:{treeId:string,wallet:string,awarded:number,unlocks:string[],kept:string[],historyLength:number,points:{level:any,earned:any,spent:any,available:any}}[]}[]} args.actors
 *   characters with stored progress, already read through the module's own readers
 */
export function buildStateExport({isGM,trees=[],actors=[]}){
  if(isGM!==true)throw Error('GM authorization required.');
  return {
    schema_version:STATE_EXPORT_SCHEMA,
    trees:(trees??[]).map(layout).sort((a,b)=>byText(a.tree_id,b.tree_id)),
    progress:(actors??[]).map(a=>({actor_id:a.id,actor_name:a.name??null,
      trees:(a.trees??[]).map(t=>({tree_id:t.treeId,wallet:t.wallet??null,unlocked_node_ids:ids(t.unlocks),kept_node_ids:ids(t.kept),awarded:num(t.awarded)??0,
        history_length:num(t.historyLength)??0,
        points:{level:t.points?.level??null,earned:t.points?.earned??null,spent:t.points?.spent??null,available:t.points?.available??null}}))
        .sort((x,y)=>byText(x.tree_id,y.tree_id))}))
      .filter(a=>a.trees.length)
      .sort((a,b)=>byText(a.actor_name,b.actor_name)||byText(a.actor_id,b.actor_id))
  };
}
