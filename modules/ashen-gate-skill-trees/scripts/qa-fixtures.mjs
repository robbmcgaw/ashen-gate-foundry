/** AG-WORK-0011 v0.6.0 real native-document QA fixture. Test-only, not canon.
 * Separate from Profession Ledger. Does not grant XP, recipe knowledge or Perks.
 */
export const QA_FIXTURE='ag-skill-trees-qa/0.1';
export const QA_TREES={generic:'QA-ST-GENERIC',cinder:'QA-ST-CINDER',profession:'QA-ST-PROFESSION'};
export const QA_SOURCE_IDS={profession:'PROF-QA-SKILL-TREES',mutation:'MUT-QA-SKILL-TREES',perk:'PERK-QA-SKILL-TREES',power:'POWER-QA-SKILL-TREES'};
const node=(id,name,x,y,additional={})=>({id,name,description:'QA-only node; no automatic game effect or Item grant.',
 x,y,cost:1,requiresAll:[],requiresAny:[],excludes:[],contentRef:null,sourceUuid:null,
 status:'test',visibility:'player',display:'shown',...additional});
export function qaTreeLayouts(){return [
 {id:QA_TREES.generic,name:'[AG QA] Generic Progression',description:'QA-only points and prerequisites, not approved content.',status:'test',visibility:'player',sourceRef:null,
  provider:{kind:'generic_points',maxPoints:8},nodes:[
  node('QA-ST-BASE','QA Foundation',120,120),
  node('QA-ST-LEFT','QA Left Path',420,50,{requiresAll:['QA-ST-BASE'],excludes:['QA-ST-RIGHT']}),
  node('QA-ST-RIGHT','QA Right Path',420,225,{requiresAll:['QA-ST-BASE'],excludes:['QA-ST-LEFT']}),
  node('QA-ST-FINAL','QA Final Node',750,145,{requiresAny:[['QA-ST-LEFT','QA-ST-RIGHT']]})]},
 {id:QA_TREES.cinder,name:'[AG QA] Cinder Milestones',description:'QA-only 13-point wallet test; does not implement Cinder mechanics.',status:'test',visibility:'player',sourceRef:QA_SOURCE_IDS.mutation,
  provider:{kind:'cinder_milestone',maxPoints:13},nodes:[
  node('QA-CIN-START','QA Manifestation',150,140),node('QA-CIN-NEXT','QA Next Milestone',430,140,{requiresAll:['QA-CIN-START']}),
  node('QA-CIN-HIDDEN','QA GM-only Source',710,180,{visibility:'gm',display:'hidden'})]},
 {id:QA_TREES.profession,name:'[AG QA] Profession Reference',description:'Read-only QA layout; Profession XP and perk selection belong to Ledger.',status:'draft',visibility:'gm',sourceRef:QA_SOURCE_IDS.profession,
  provider:{kind:'profession',maxPoints:null},nodes:[]}
 ];}
export function qaSourceItems(){return [
 {id:QA_SOURCE_IDS.perk,entity_type:'ProfessionPerk',name:'[AG QA] Profession Perk Source',description:'Synthetic draft Feature reference; not a claimable perk.'},
 {id:QA_SOURCE_IDS.power,entity_type:'Power',name:'[AG QA] Cinder Power Source',description:'Synthetic draft Feature reference; not an actual Cinder power.'}
 ].map(record=>{
  const definition={id:record.id,entity_type:record.entity_type,status:'draft',version:'0.1.0',
   name:record.name,description:record.description,visibility:'gm',scope:'generic_rules',refs:[],
   provenance:{sources:['AG-WORK-0011/QA-2026-10-17'],decision_refs:[]}};
  return {name:record.name,type:'feat',img:'icons/svg/item-bag.svg',ownership:{default:0},
   system:{description:{value:`<p>${record.description}</p>`}},
   flags:{'ashen-gate-skill-trees':{qaFixture:QA_FIXTURE},'ashen-gate-manager':{
    source:{sourceId:record.id,entityType:record.entity_type,status:'draft',sourceVersion:'0.1.0',
     version:'0.1.0',visibility:'gm',scope:'generic_rules',refs:[],provenance:definition.provenance,
     definition}}}};
 });}
export function qaActorData(){return {name:'[AG QA] Skill Tree Test Character',type:'character',img:'icons/svg/mystery-man.svg',
 ownership:{default:0},flags:{'ashen-gate-skill-trees':{qaFixture:QA_FIXTURE}}};}
export function isQaDocument(doc){return doc?.flags?.['ashen-gate-skill-trees']?.qaFixture===QA_FIXTURE;}
export function qaCleanupBlockers(trees,actors){
  const ids=new Set(Object.values(QA_TREES));const out=[];
  for(const actor of actors??[]){if(isQaDocument(actor))continue;
   for(const tree of trees??[]){if(!ids.has(tree.id))continue;
    const key=tree.provider?.kind==='cinder_milestone'?`cinder:${tree.sourceRef}`:`tree:${tree.id}`;
    const progress=actor?.flags?.['ashen-gate-skill-trees']?.progressV2?.[key];
    if(progress&&(Number(progress.awarded)>0||progress.unlocks?.length||progress.grants?.length||Number(progress.revision)>0))out.push(`${actor.name??actor.id} has progress on ${tree.id}`);
   }
  }
  return out;
}
