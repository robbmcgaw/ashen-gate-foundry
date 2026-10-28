/** AG-WORK-0021 — source-only, closed Faction definition boundary.
 * Mirrors systems/factions/source-state/v0.1/faction-source.schema.json.
 * Do not run against the raw campaign overlay: the caller first removes only
 * known legacy mutable fields. Unknown properties must cause an error, not be dropped.
 * Pure JS; no Foundry API, reward ownership, or permission side effects.
 */
const BASE=['id','entity_type','status','version','provenance','visibility','refs'];
const FACTION=[...BASE,'supersedes','scope','name','leader','public_role','folder_key','tags','discovery','renown_track','individual_track','entries','rewards','relations'];
const DEITY=[...BASE,'supersedes','scope','name','tags','discovery','individual_track','entries','rewards','deity'];
const DEITY_PROFILE=['symbol','title','domain','tier','blurb','portfolio','teachings','followers','practices','saying','relations'];
const TRACK=[...BASE,'default_scope','milestones'];
// 0.25.0: `flavor` is an optional atmospheric line (400 characters at most) players read on a rank they have not unlocked yet.
const MILESTONE=['id','key','name','threshold','benefit','selection_mode','flavor'];
const ENTRY=['supersedes','id','name','text','uuid','link_mode','unlock','threshold'];
// 0.14.0: item rewards may carry the permanent item id (item_id) and a picture (img); both optional.
const REWARD=['id','key','audience','milestone_id','name','teaser','description','kind','uuid','item_id','img','tags','behavior','usage_limit','vow_benefit'];
const REF=['relation','target_id','mode'];
const PROVENANCE=['sources','decision_refs'];
const FIELD_KEYS=['name','leader','public_role'];
const SCOPE=[undefined,null,'generic_rules','setting_adapter','publication'];
const STATUS=['proposed','draft','approved','superseded','retired'];
const VISIBILITY=['player','gm','reveal_gated'];
const SOURCE_ID=/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const ROOT_ID=/^FACTION-[A-Z0-9-]+$/;
const TRACK_ID=/^RENOWN-[A-Z0-9-]+$/;
function object(value,path){if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${path}: object required`);return value;}
function closed(value,keys,path){object(value,path);for(const key of Object.keys(value))if(!keys.includes(key))throw new Error(`${path}: unclassified field ${key}`);}
function list(value,path,fn,min=0,max=Infinity){if(!Array.isArray(value)||value.length<min||value.length>max)throw new TypeError(`${path}: invalid array`);value.forEach((item,i)=>fn(item,`${path}[${i}]`));}
function text(value,path,required=false){if(typeof value!=='string'||(required&&!value.trim()))throw new TypeError(`${path}: string required`);}
function choice(value,options,path){if(!options.includes(value))throw new Error(`${path}: invalid value`);}
function natural(value,path){if(!Number.isSafeInteger(value)||value<0)throw new TypeError(`${path}: nonnegative integer required`);}
function optional(value,path,fn){if(value!==undefined)fn(value,path);}
function strings(value,path,min=0){list(value,path,text,min);}
function provenance(value,path){closed(value,PROVENANCE,path);strings(value.sources,`${path}.sources`,1);optional(value.decision_refs,`${path}.decision_refs`,strings);}
function refs(value,path){list(value,path,(ref,p)=>{closed(ref,REF,p);text(ref.relation,`${p}.relation`,true);if(typeof ref.target_id!=='string'||!SOURCE_ID.test(ref.target_id))throw new Error(`${p}.target_id: canonical ID required`);choice(ref.mode,['required','optional'],`${p}.mode`);});}
function envelope(value,path,type,idPattern){if(!idPattern.test(value.id??''))throw new Error(`${path}.id: invalid canonical identity`);choice(value.entity_type,[type],`${path}.entity_type`);choice(value.status,STATUS,`${path}.status`);text(value.version,`${path}.version`,true);provenance(value.provenance,`${path}.provenance`);choice(value.visibility,VISIBILITY,`${path}.visibility`);refs(value.refs,`${path}.refs`);}
function track(value,path){closed(value,TRACK,path);envelope(value,path,'RenownTrack',TRACK_ID);choice(value.default_scope,['group','individual'],`${path}.default_scope`);list(value.milestones,`${path}.milestones`,(row,p)=>{closed(row,MILESTONE,p);text(row.id,`${p}.id`,true);text(row.key,`${p}.key`,true);text(row.name,`${p}.name`,true);natural(row.threshold,`${p}.threshold`);text(row.benefit,`${p}.benefit`);optional(row.flavor,`${p}.flavor`,(v,q)=>sizedText(v,q,400,false));choice(row.selection_mode,['all','choose_one'],`${p}.selection_mode`);},5,5);}
function supersedes(value,path){optional(value,path,(v,p)=>{list(v,p,(x,q)=>text(x,q,true),1);if(new Set(v).size!==v.length)throw new Error(`${p}: duplicate id`);});}
function entry(value,path){closed(value,ENTRY,path);supersedes(value.supersedes,`${path}.supersedes`);text(value.id,`${path}.id`,true);text(value.name,`${path}.name`,true);choice(value.unlock,['manual','group_renown','individual_renown'],`${path}.unlock`);choice(value.link_mode,['preview','document'],`${path}.link_mode`);optional(value.text,`${path}.text`,text);optional(value.uuid,`${path}.uuid`,text);optional(value.threshold,`${path}.threshold`,natural);}
// 0.21.0: a Seeker reward may carry vow_benefit (the data behind the Vow feature). Closed shape, nothing extra accepted.
const VOW_SKILLS=['acr','ani','arc','ath','dec','his','ins','itm','inv','med','nat','prc','prf','per','rel','slt','ste','sur'],VOW_ABILITIES=['str','dex','con','int','wis','cha'];
function sizedText(value,path,max,required=true){text(value,path,required);if(value.length>max)throw new Error(`${path}: ${max} characters maximum`);}
export function vowBenefit(value,path='vow_benefit'){
 closed(value,['name','bonus','applies_to','uses','summary','requirement'],path);
 sizedText(value.name,`${path}.name`,80);
 if(typeof value.bonus!=='string'||!/^\d+d\d+$/.test(value.bonus))throw new Error(`${path}.bonus: dice string like 1d4 required`);
 list(value.applies_to,`${path}.applies_to`,(a,p)=>{closed(a,['kind','key','condition'],p);choice(a.kind,['skill','save','check','tool','attack'],`${p}.kind`);
  if(a.kind==='skill')choice(a.key,VOW_SKILLS,`${p}.key`);else if(a.kind==='save'||a.kind==='check')choice(a.key,VOW_ABILITIES,`${p}.key`);
  else{text(a.key,`${p}.key`,true);if(a.key.length>40)throw new Error(`${p}.key: 40 characters maximum`);}
  optional(a.condition,`${p}.condition`,(v,q)=>sizedText(v,q,200));},1,4);
 closed(value.uses,['max','recovery'],`${path}.uses`);
 if(!Number.isSafeInteger(value.uses.max)||value.uses.max<1||value.uses.max>9)throw new Error(`${path}.uses.max: integer 1 to 9 required`);
 choice(value.uses.recovery,['lr','sr','day'],`${path}.uses.recovery`);
 sizedText(value.summary,`${path}.summary`,400);sizedText(value.requirement,`${path}.requirement`,300);
}
function reward(value,path){closed(value,REWARD,path);optional(value.vow_benefit,`${path}.vow_benefit`,vowBenefit);for(const key of ['id','key','milestone_id','name'])text(value[key],`${path}.${key}`,true);choice(value.audience,['group','individual'],`${path}.audience`);choice(value.kind,['custom','uuid'],`${path}.kind`);choice(value.behavior,['one_time','repeatable_service','passive'],`${path}.behavior`);strings(value.tags,`${path}.tags`);natural(value.usage_limit,`${path}.usage_limit`);optional(value.teaser,`${path}.teaser`,text);optional(value.description,`${path}.description`,text);optional(value.uuid,`${path}.uuid`,text);optional(value.img,`${path}.img`,text);if(value.item_id!==undefined&&(typeof value.item_id!=='string'||!SOURCE_ID.test(value.item_id)))throw new Error(`${path}.item_id: permanent item id required`);if(value.kind==='uuid')text(value.uuid,`${path}.uuid`,true);}
/** Reject arbitrary top-level AND nested data. This does not migrate or rewrite the input. */
export function assertReusableFactionSource(value){
 if(value?.entity_type==='Deity')return assertReusableDeitySource(value);
 closed(value,FACTION,'Faction');envelope(value,'Faction','Faction',ROOT_ID);supersedes(value.supersedes,'Faction.supersedes');
 choice(value.scope,SCOPE,'Faction.scope');text(value.name,'Faction.name',true);text(value.leader,'Faction.leader');text(value.public_role,'Faction.public_role');
 optional(value.folder_key,'Faction.folder_key',text);optional(value.tags,'Faction.tags',strings);
 closed(value.discovery,['placeholder','sharing_enabled'],'Faction.discovery');for(const key of ['placeholder','sharing_enabled'])if(typeof value.discovery[key]!=='boolean')throw new TypeError(`Faction.discovery.${key}: boolean required`);
 track(value.renown_track,'Faction.renown_track');track(value.individual_track,'Faction.individual_track');
 list(value.entries,'Faction.entries',entry);list(value.rewards,'Faction.rewards',reward);
 // 0.22.0: optional faction-to-faction relations (personal-scope knock-ons). Closed shape; absent on older definitions.
 optional(value.relations,'Faction.relations',(rows,path)=>list(rows,path,(r,p)=>{closed(r,['faction_id','resonance'],p);if(!ROOT_ID.test(r.faction_id??''))throw new Error(`${p}.faction_id: FACTION- id required`);if(typeof r.resonance!=='number'||!Number.isFinite(r.resonance)||r.resonance<0||r.resonance>1)throw new TypeError(`${p}.resonance: number 0..1 required`);}));
 return value;
}
/** Deity source: the faction envelope without group track, leader, description or folder, plus a closed `deity` profile. */
export function assertReusableDeitySource(value){
 closed(value,DEITY,'Deity');envelope(value,'Deity','Deity',/^DEITY-[A-Z0-9-]+$/);supersedes(value.supersedes,'Deity.supersedes');
 choice(value.scope,SCOPE,'Deity.scope');text(value.name,'Deity.name',true);optional(value.tags,'Deity.tags',strings);
 closed(value.discovery,['placeholder','sharing_enabled'],'Deity.discovery');for(const key of ['placeholder','sharing_enabled'])if(typeof value.discovery[key]!=='boolean')throw new TypeError(`Deity.discovery.${key}: boolean required`);
 track(value.individual_track,'Deity.individual_track');
 list(value.entries,'Deity.entries',entry);list(value.rewards,'Deity.rewards',reward);
 const d=value.deity;closed(d,DEITY_PROFILE,'Deity.deity');
 for(const key of DEITY_PROFILE.filter(k=>!['tier','saying','relations'].includes(k)))text(d[key],`Deity.deity.${key}`);
 choice(d.tier,['major','lesser'],'Deity.deity.tier');
 closed(d.saying,['text','attribution'],'Deity.deity.saying');text(d.saying.text,'Deity.deity.saying.text');text(d.saying.attribution,'Deity.deity.saying.attribution');
 list(d.relations,'Deity.deity.relations',(r,p)=>{closed(r,['deity_id','resonance'],p);if(!/^DEITY-[A-Z0-9-]+$/.test(r.deity_id??''))throw new Error(`${p}.deity_id: DEITY- id required`);if(typeof r.resonance!=='number'||!Number.isFinite(r.resonance)||r.resonance<0||r.resonance>1)throw new TypeError(`${p}.resonance: number 0..1 required`);});
 return value;
}
/** Private GM state shape only; personal Actor grants never become party grants. */
export function assertPrivateFieldReveals(value){
 closed(value,['mode','fields'],'field_reveals');choice(value.mode,['legacy','selective'],'field_reveals.mode');closed(value.fields,FIELD_KEYS,'field_reveals.fields');
 for(const key of FIELD_KEYS){const path=`field_reveals.fields.${key}`,row=value.fields[key];closed(row,['party','actors'],path);if(typeof row.party!=='boolean')throw new TypeError(`${path}.party: boolean required`);list(row.actors,`${path}.actors`,(id,p)=>text(id,p,true));if(new Set(row.actors).size!==row.actors.length)throw new Error(`${path}.actors: duplicate Actor ID`);}
 return value;
}

/** Raw legacy references may use relation_type or omit mode; they may NOT carry unknown state.
 * Check before upgradeFaction reconstructs typed refs and discards incidental keys. */
export function assertNoUnclassifiedLegacyRefKeys(input) {
 // v0.6.0 upgradeFaction reconstructs provenance; do not let it silently
 // discard unknown source/state extras. Only recognized legacy alias keys survive.
 for(const [path,value] of [['Faction.provenance',input?.provenance],['Faction.renown_track.provenance',input?.renown_track?.provenance],['Faction.individual_track.provenance',input?.individual_track?.provenance]])
  if(value && typeof value==='object')closed(value,[...PROVENANCE,'source','decisionRefs'],path);
 for (const [path,refs] of [['Faction.refs',input?.refs],['Faction.renown_track.refs',input?.renown_track?.refs],['Faction.individual_track.refs',input?.individual_track?.refs]]) {
  if(!Array.isArray(refs))continue;
  for(let i=0;i<refs.length;i++){
   const row=refs[i],label=`${path}[${i}]`;
   object(row,label);
   for(const key of Object.keys(row))
    if(!['relation','relation_type','target_id','mode'].includes(key))throw new Error(`${label}: unclassified field ${key}`);
  }
 }
 return input;
}
