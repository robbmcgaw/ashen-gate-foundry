/** Disposable real Foundry documents for AG Factions acceptance. Not canon or a demo mode.
 * Import after `ready` using `await import('/modules/ashen-gate-factions/fixtures/setup.mjs')`.
 */
import {factionsFolder} from '../scripts/folder-nesting.mjs';
import {MODULE_ID,makeFaction,makeGroupRecord,makePersonalRecord,blankStanding,adjustStanding,sourceDefinition,extractCampaignDiscovery,fieldDisclosure,revealField} from '../scripts/core.mjs';
export const FIXTURE='AG-FACTIONS-PLAYTEST-2026-10-17';
const gameSafe=()=>{if(!game?.user?.isGM)throw Error('GM-only test fixture.');const mod=game.modules.get(MODULE_ID);if(!mod?.active||typeof mod.api?.refreshPlayerViews!=='function')throw Error('Install/enable Factions v0.6.0 or later before setup.');return mod;};
const marker={ [MODULE_ID]: {testFixture:FIXTURE} };
const flag=d=>d?.getFlag?.(MODULE_ID,'testFixture')===FIXTURE;
const nid=()=>Math.random().toString(36).slice(2,12).toUpperCase();
const standing=(delta,reason)=>adjustStanding(blankStanding(),{delta,reason,eventId:`RENOWN-EVT-${nid()}`,when:new Date().toISOString()}).standing;
export async function reset(){const mod=gameSafe();const groups=[['JournalEntry',game.journal],['Actor',game.actors],['Item',game.items]];let total=0;
  for(const [kind,coll] of groups){const ids=coll.filter(flag).map(d=>d.id);if(ids.length){await globalThis[kind].deleteDocuments(ids);total+=ids.length;}}
  await mod.api.refreshPlayerViews();console.info(`[Factions fixture] removed ${total} tagged documents; player view Journals refreshed.`);return {removed:total};
}
export async function setup(){const mod=gameSafe(),players=game.users.filter(u=>!u.isGM);
  if(players.length<2)throw Error('Requires two separate non-GM Foundry users. Create both users first; no documents were changed.');
  if([...game.journal,...game.actors,...game.items].some(flag))throw Error('Fixture already present. Run reset() first.');
  const [p1,p2]=players.slice(0,2),NONE=CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,OBS=CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,OWNER=CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const owned={default:NONE},fixed=async(entity,data)=>entity.create({...data,flags:{...marker}});
  const actors=[];
  for(const [user,name] of [[p1,'Factions QA — Scout'],[p2,'Factions QA — Broker']])actors.push(await fixed(Actor,{name,type:'character',ownership:{default:NONE,[user.id]:OWNER}}));
  const [actorA,actorB]=actors;
  const readableNote=await fixed(JournalEntry,{name:'QA — Open Route Notes',ownership:{default:NONE,[p1.id]:OBS},pages:[{name:'Western Grasslands',type:'text',text:{content:'The return path runs alongside a wind-bent milestone. This is a fictional test route.'}}]});
  const restrictedNote=await fixed(JournalEntry,{name:'QA — GM Restricted Contact',ownership:owned,pages:[{name:'Private',type:'text',text:{content:'GM test secret: a contact has vanished.'}}]});
  const rewardItem=await fixed(Item,{name:'QA — Scout Charm',type:'loot',ownership:owned,system:{description:{value:'A harmless illustrative charm; no automation or approved game balance.'}}});
  const folder=await factionsFolder();
  const created=[];
  const addFaction=async({key,name,leader,role,party=false,actorIds=[],placeholder=false,groupScore=0,reveal=null,entries=[],rewards=[],refs=[]})=>{
    const faction=makeFaction({id:`FACTION-PLAYTEST-${key}`,trackId:`RENOWN-PLAYTEST-${key}`,name,leader,public_role:role,source:`Synthetic fixture ${FIXTURE}`});
    faction.refs=refs;faction.discovery={party,actors:actorIds,placeholder,sharing_enabled:true};faction.entries=entries;faction.rewards=rewards.map((r,i)=>({...r,id:`rw-playtest-${key.toLowerCase()}-${i+1}`,key:`rw_playtest_${i+1}`,audience:r.audience??'group',milestone_id:r.audience==='individual'?faction.individual_track.milestones[1].id:faction.renown_track.milestones[1].id,tags:[],teaser:r.name}));
    const group=makeGroupRecord({factionId:faction.id,standing:groupScore?standing(groupScore,`QA fixture: ${name}`):blankStanding()});const state=extractCampaignDiscovery(faction);Object.assign(group,state);group.field_reveals=reveal??fieldDisclosure(null);
    const definition=await JournalEntry.create({name,folder:folder.id,ownership:owned,flags:{[MODULE_ID]:{faction:sourceDefinition(faction),testFixture:FIXTURE}}});
    const groupDoc=await JournalEntry.create({name:`QA Group State — ${name}`,folder:folder.id,ownership:owned,flags:{[MODULE_ID]:{groupClaims:group,testFixture:FIXTURE}}});
    created.push({id:faction.id,definition:definition.id,state:groupDoc.id});
    return {faction,definition,groupDoc};
  };
  const entry=(id,name,text,uuid,partyVisible,actorIds=[])=>({id,name,text,uuid,link_mode:'document',unlock:'manual',threshold:0,discovered_party:partyVisible,discovered_actors:actorIds});
  const far=await addFaction({key:'FAR',name:'The Far Lanterns — QA',leader:'Nessa Vale (illustrative)',role:'Scouts and returning caravans from the western grasslands.',party:true,groupScore:5,
    entries:[entry('qa_route','Route notes','Test public description: the route has a wind-bent milestone.',readableNote.uuid,true),entry('qa_private','Missing contact','Test GM-only note; do not expose its contents.',restrictedNote.uuid,true)],
    rewards:[{name:'QA Scout Charm',kind:'uuid',uuid:rewardItem.uuid,document_type:'Item',behavior:'one_time',usage_limit:0,description:'An approved one-time test Item.'},{name:'QA Route Consultation',kind:'custom',behavior:'repeatable_service',usage_limit:1,description:'Ask a scout about a route.'},{name:'QA Familiar Guide',kind:'custom',behavior:'passive',usage_limit:0,description:'Display-only passive privilege.'}],
    refs:[{relation:'offers_objective',target_id:'QUEST-PLAYTEST-SUPPLY-ROAD',mode:'optional'}]});
  const reveal=fieldDisclosure({mode:'selective'});reveal.mode='selective';
  const selectReveal=revealField(reveal,'public_role',{actorId:actorA.id,visible:true});
  const gilt=await addFaction({key:'GILT',name:'The Gilt Compact — QA',leader:'Odran Kell (illustrative)',role:'A private broker offers supply escorts.',party:false,actorIds:[actorA.id],placeholder:true,groupScore:3,reveal:selectReveal,
    entries:[entry('qa_private_broker','Private broker','Only the scout should see this.',null,false,[actorA.id])],
    rewards:[{name:'QA Individual Favor',audience:'individual',kind:'custom',behavior:'one_time',usage_limit:0,description:'A personal choice.'}]});
  const iron=await addFaction({key:'IRON',name:'The Iron March — QA',leader:'Edra Voss (illustrative)',role:'A watch company with private rivals.',party:false,placeholder:true,groupScore:2});
  for(const {faction} of [far,gilt,iron]){for(const actor of actors){const state=makePersonalRecord({factionId:faction.id,actorId:actor.id});if(faction.id===gilt.faction.id&&actor.id===actorA.id)state.standing=standing(4,'QA private errand');
    await JournalEntry.create({name:`QA Individual State — ${actor.name} / ${faction.name}`,folder:folder.id,ownership:owned,flags:{[MODULE_ID]:{individual:state,testFixture:FIXTURE}}});}}
  await mod.api.refreshPlayerViews();
  console.info(`[Factions fixture] created ${created.length} factions, 2 characters, 2 Journals, 1 Item. User 1=${p1.name}; User 2=${p2.name}. See fixtures/README.md`);
  return {tag:FIXTURE,user1:p1.id,user2:p2.id,actor1:actorA.id,actor2:actorB.id,factions:created,rewardItem:rewardItem.uuid};
}
