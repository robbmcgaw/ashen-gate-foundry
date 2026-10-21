/** Ashen Gate Profession Ledger checks (0.10.0).
 * Skill and tool checks for gathering and crafting: which check, its bonus, whether the character
 * carries the tool, and the advantage it starts with. Foundry/dnd5e globals are read only where noted,
 * with fallbacks, so the rules stay testable.
 */
import {norm} from './core.mjs';

export const SKILL_LABELS=Object.freeze({acr:'Acrobatics',ani:'Animal Handling',arc:'Arcana',ath:'Athletics',dec:'Deception',his:'History',
  ins:'Insight',itm:'Intimidation',inv:'Investigation',med:'Medicine',nat:'Nature',prc:'Perception',prf:'Performance',per:'Persuasion',
  rel:'Religion',slt:'Sleight of Hand',ste:'Stealth',sur:'Survival'});
export const SKILL_IDS=Object.freeze(Object.keys(SKILL_LABELS));
/** dnd5e tool keys (CONFIG.DND5E.tools) with readable fallbacks for when dnd5e cannot supply a label. */
export const TOOL_LABELS=Object.freeze({alchemist:'Alchemist’s Supplies',brewer:'Brewer’s Supplies',calligrapher:'Calligrapher’s Supplies',
  carpenter:'Carpenter’s Tools',cartographer:'Cartographer’s Tools',cobbler:'Cobbler’s Tools',cook:'Cook’s Utensils',disg:'Disguise Kit',
  forg:'Forgery Kit',glassblower:'Glassblower’s Tools',herb:'Herbalism Kit',jeweler:'Jeweler’s Tools',leatherworker:'Leatherworker’s Tools',
  mason:'Mason’s Tools',navg:'Navigator’s Tools',painter:'Painter’s Supplies',pois:'Poisoner’s Kit',potter:'Potter’s Tools',
  smith:'Smith’s Tools',thief:'Thieves’ Tools',tinker:'Tinker’s Tools',weaver:'Weaver’s Tools',woodcarver:'Woodcarver’s Tools'});
const TOOL_ABILITY={alchemist:'int',brewer:'int',calligrapher:'dex',carpenter:'str',cartographer:'wis',cobbler:'dex',cook:'wis',disg:'cha',
  forg:'dex',glassblower:'int',herb:'int',jeweler:'int',leatherworker:'dex',mason:'str',navg:'wis',painter:'wis',pois:'int',potter:'int',
  smith:'str',thief:'dex',tinker:'dex',weaver:'dex',woodcarver:'dex'};
const SKILL_ABILITY={acr:'dex',ani:'wis',arc:'int',ath:'str',dec:'cha',his:'int',ins:'wis',itm:'cha',inv:'int',med:'wis',nat:'int',prc:'wis',
  prf:'cha',per:'cha',rel:'int',slt:'dex',ste:'dex',sur:'wis'};

/** Profession names are matched without "[TEST]"-style tags or punctuation. The profession is Enchanting; "Arcana" is
 * its old name in existing data (the Arcana SKILL is Enchanting's default check). Locations calls Hunting/Skinning "Skinning & Harvesting". */
const PROFESSION_ALIASES={arcana:'enchanting',skinningharvesting:'huntingskinning',skinning:'huntingskinning',hunting:'huntingskinning'};
export const professionKey=name=>{const key=norm(String(name??'').replace(/\[[^\]]*\]/g,''));return PROFESSION_ALIASES[key]??key;};
/** GM Setup defaults: the tool each profession crafts or gathers with. Blank means no default; the GM can set one. */
export const DEFAULT_PROFESSION_TOOLS=Object.freeze({alchemy:'alchemist',blacksmithing:'smith',cooking:'cook',engineering:'tinker',
  inscription:'calligrapher',jewelcrafting:'jeweler',leatherworking:'leatherworker',tailoring:'weaver',herbalism:'herb',
  mining:'mason',huntingskinning:'leatherworker',enchanting:'',archaeology:'',fishing:''});
/** GM Setup defaults: the skill a profession can roll instead of (or beside) its tool. Gathering professions use it to
 * gather; Enchanting is the one crafting profession whose main check is a skill (Arcana). The GM can change or clear it. */
export const DEFAULT_GATHER_SKILLS=Object.freeze({herbalism:'nat',huntingskinning:'sur',archaeology:'his',fishing:'',mining:'',enchanting:'arc'});
/** Stored GM choices win over defaults; an explicit '' means "none".
 * 0.16.0 crosswalk (AG-F01), additive: per profession, the skills and tools whose proficiency qualifies a character
 * (any-of), and the advantage tools (proficiency with, or carrying, one gives advantage on that profession's checks).
 * 0.20.0 adds `items` (carried core items that qualify) and the baseline-file layer (see effectiveMapping).
 * An explicit [] means "none". `gm` holds only the GM's saved lists. Checks use the GM's and the baseline file's
 * advantage tools, never the catalog's, so an unconfigured profession rolls exactly as before. */
export const CROSSWALK_LISTS=Object.freeze(['qualifySkills','qualifyTools','advantageTools','items']);
/** 0.20.0: core items that qualify a character by being carried (name, or a core/Item UUID). 0.22.0: none built in (Fishing
 * is accessed by the Survival skill instead); `items` from saved GM edits, the catalog or a baseline file still count. */
export const DEFAULT_QUALIFY_ITEMS=Object.freeze({});
/** 0.22.0: built-in qualifying skills for professions with no check skill to seed them. Fishing is accessed by Survival. */
export const DEFAULT_QUALIFY_SKILLS=Object.freeze({fishing:Object.freeze(['sur'])});
const TOOL_KEY=/^[a-z][a-z0-9]*$/;
const ITEM_REF=v=>v.trim().length>0&&v.trim().length<=200;
const cleanList=(v,valid)=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&valid(x)))]:null;
/** Item references, trimmed, without case-insensitive duplicates. */
export const cleanItemList=v=>{if(!Array.isArray(v))return null;const out=[],seen=new Set();
  for(const x of v){if(typeof x!=='string'||!ITEM_REF(x))continue;const t=x.trim(),k=norm(t)||t.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(t);}}return out;};
const LIST_VALID={qualifySkills:v=>SKILL_IDS.includes(v),qualifyTools:v=>TOOL_KEY.test(v),advantageTools:v=>TOOL_KEY.test(v)};
export const cleanCrosswalkList=(list,v)=>list==='items'?cleanItemList(v):cleanList(v,LIST_VALID[list]);
/**
 * Layers, lowest first, decided per profession and per list: built-in defaults < Profession catalog `access` (`catalog`,
 * GM-read) < the GM's imported baseline file (`baseline`, 0.20.0) < GM lists saved in the setting. A layer only counts
 * for a list it actually sets (an array, [] included).
 */
export function effectiveMapping(stored,{catalog=null,baseline=null}={}){
  const s=stored&&typeof stored==='object'?stored:{};
  const pick=(defaults,saved,valid)=>{const out={...defaults};
    for(const [k,v] of Object.entries(saved&&typeof saved==='object'?saved:{}))if(typeof v==='string'&&(v===''||valid(v)))out[PROFESSION_ALIASES[k]??k]=v;return out;};
  const tools=pick(DEFAULT_PROFESSION_TOOLS,s.tools,v=>TOOL_KEY.test(v)),skills=pick(DEFAULT_GATHER_SKILLS,s.skills,v=>SKILL_IDS.includes(v));
  const gm={};
  for(const list of CROSSWALK_LISTS){gm[list]={};
    for(const [k,v] of Object.entries(s[list]&&typeof s[list]==='object'?s[list]:{})){const clean=cleanCrosswalkList(list,v);if(clean)gm[list][PROFESSION_ALIASES[k]??k]=clean;}}
  const keys=[...new Set([...Object.keys(tools),...Object.keys(skills)])];
  const out={tools,skills,gm,qualifySkills:{},qualifyTools:{},advantageTools:{},items:{},origin:{}};
  for(const k of keys){
    const cat=catalog?.[k]??null,file=baseline?.[k]??null;
    const base={qualifySkills:skills[k]?[skills[k]]:[...(DEFAULT_QUALIFY_SKILLS[k]??[])],qualifyTools:tools[k]?[tools[k]]:[],advantageTools:[],items:[...(DEFAULT_QUALIFY_ITEMS[k]??[])]};
    out.origin[k]={};
    for(const list of CROSSWALK_LISTS){
      const fileList=file?cleanCrosswalkList(list,file[list]):null;
      const from=gm[list][k]?'gm':fileList?'baseline':cat&&Array.isArray(cat[list])?'catalog':'default';
      out[list][k]=[...(from==='gm'?gm[list][k]:from==='baseline'?fileList:from==='catalog'?cat[list]:base[list])];
      out.origin[k][list]=from;
    }
  }
  return out;
}

const dnd5eTools=()=>globalThis.CONFIG?.DND5E?.tools??{};
export const toolKeys=()=>[...new Set([...Object.keys(TOOL_LABELS),...Object.keys(dnd5eTools())])].sort((a,b)=>toolLabel(a).localeCompare(toolLabel(b)));
export function toolLabel(key){
  if(!key)return '';
  try{const label=globalThis.dnd5e?.documents?.Trait?.keyLabel?.(key,{trait:'tool'});if(typeof label==='string'&&label&&label!==key)return label;}catch{}
  const cfg=dnd5eTools()[key];
  if(typeof cfg==='string')return cfg;
  if(typeof cfg?.label==='string'&&cfg.label)return cfg.label;
  return TOOL_LABELS[key]??String(key);
}
export const skillLabel=key=>SKILL_LABELS[key]??globalThis.CONFIG?.DND5E?.skills?.[key]?.label??String(key??'');
/** A recipe's tool reference: a dnd5e tool key ("alchemist"), an Item UUID, or a tool Item name. */
export function toolRef(value){
  if(!value)return null;
  if(typeof value==='object'){
    const key=typeof value.key==='string'?value.key:typeof value.tool_key==='string'?value.tool_key:null;
    const out={key:key||null,uuid:typeof value.uuid==='string'?value.uuid:null,name:typeof value.name==='string'?value.name.trim():null};
    return out.key||out.uuid||out.name?out:null;
  }
  const text=String(value).trim();if(!text)return null;
  if(/^[a-z][a-z0-9]*$/.test(text))return {key:text,uuid:null,name:null};
  if(/^(Compendium|Item)\./.test(text))return {key:null,uuid:text,name:null};
  return {key:null,uuid:null,name:text};
}
/** A required_tools entry: like toolRef, and a tool name such as "Carpenter's Tools" also gets its dnd5e key so
 * proficiency and the native tool roll work. Matching ignores case and apostrophe style. */
export function requiredToolRef(value){
  const ref=toolRef(value);
  if(!ref||ref.key||!ref.name)return ref;
  const key=toolKeys().find(k=>norm(toolLabel(k))===norm(ref.name)||norm(TOOL_LABELS[k])===norm(ref.name));
  return key?{...ref,key}:ref;
}
export const toolRefLabel=ref=>!ref?'':ref.name||(ref.key?toolLabel(ref.key):'')||(ref.uuid?(globalThis.fromUuidSync?.(ref.uuid)?.name??'Required tool'):'');

const abilityMod=(actor,ability)=>{const n=Number(actor?.system?.abilities?.[ability]?.mod);return Number.isFinite(n)?n:null;};
/** Prepared dnd5e total for a skill, or null. */
export function skillBonus(actor,key){const n=Number(actor?.system?.skills?.[key]?.total);return Number.isFinite(n)?n:null;}
/** Prepared dnd5e tool total, else the tool's ability modifier (an unproficient check), else null. */
export function toolBonus(actor,key){
  const t=actor?.system?.tools?.[key];
  const n=Number(t?.total);if(Number.isFinite(n))return n;
  return abilityMod(actor,t?.ability??dnd5eTools()[key]?.ability??TOOL_ABILITY[key]);
}
export const toolProficient=(actor,key)=>Number(actor?.system?.tools?.[key]?.value??actor?.system?.tools?.[key]?.effectValue??0)>0;
/** The tool Item the character carries for this reference, or null. */
export function heldTool(actor,ref){
  if(!ref)return null;
  return Array.from(actor?.items??[]).find(i=>i?.type==='tool'&&(
    (ref.key&&(i.system?.type?.baseItem===ref.key||i.system?.baseItem===ref.key))||
    (ref.uuid&&(i.uuid===ref.uuid||i._stats?.compendiumSource===ref.uuid||i.flags?.core?.sourceId===ref.uuid))||
    (ref.name&&norm(i.name)===norm(ref.name))))??null;
}
/** 0.20.0: the Item this character carries for a crosswalk item reference (an Item/Compendium UUID, matched against the
 * Item, its compendium source and General Manager's core link; otherwise a name, any case), or null. Quantity 0 is not carried. */
export function carriedItem(actor,ref){
  const text=String(ref??'').trim();if(!text)return null;
  const uuid=/^(Compendium|Item)\./.test(text)?text:null,name=norm(text);
  return Array.from(actor?.items??[]).find(i=>{
    if(!i||Number(i.system?.quantity??1)<=0)return false;
    if(uuid)return [i.uuid,i._stats?.compendiumSource,i.flags?.core?.sourceId,i.flags?.['ashen-gate-manager']?.coreLink?.uuid].includes(uuid);
    return norm(i.name)===name;})??null;
}
export const formatBonus=n=>Number.isFinite(n)?(n>=0?`+${n}`:`−${Math.abs(n)}`):'—';

/** One check option: {kind:'skill'|'tool', key, label, bonus, proficient, held}. */
export function checkOption(actor,{kind,key,ref=null}){
  if(kind==='skill')return {kind,key,label:skillLabel(key),bonus:skillBonus(actor,key),proficient:Number(actor?.system?.skills?.[key]?.value??0)>0,held:null};
  const tool=ref??{key,uuid:null,name:null};
  const held=heldTool(actor,tool);
  const k=tool.key??held?.system?.type?.baseItem??null;
  return {kind:'tool',key:k,ref:tool,label:toolRefLabel(tool)||held?.name||'Tool',bonus:k?toolBonus(actor,k):null,proficient:k?toolProficient(actor,k):false,held:Boolean(held)};
}

const isOn=v=>!['','0','false','null','undefined'].includes(String(v??'').trim().toLowerCase());
const effectsOf=actor=>{
  const list=typeof actor?.allApplicableEffects==='function'?[...actor.allApplicableEffects()]:[...(actor?.effects??[])];
  return list.filter(e=>e&&!e.disabled&&!e.isSuppressed);
};
/**
 * The advantage a check starts with, read like Utilities' Group Check: dnd5e folds sheet settings and
 * Active Effects into the prepared roll.mode of the skill/tool and its ability check; midi-qol style
 * flags are honoured too. `assists` add advantage. Advantage and disadvantage cancel.
 * Returns {mode:-1|0|1, sources:string[]}; the roller can still change it.
 */
export function rollModeFor(actor,{kind,key},{assists=[],advantageTools=[]}={}){
  const sys=actor?.system,entry=kind==='skill'?sys?.skills?.[key]:sys?.tools?.[key];
  const ability=entry?.ability??(kind==='skill'?SKILL_ABILITY[key]:dnd5eTools()[key]?.ability??TOOL_ABILITY[key]);
  const adv=[],dis=[];
  const note=(mode,label)=>{if(mode>0)adv.push(label);else if(mode<0)dis.push(label);};
  if(key){
    note(Math.sign(Number(entry?.roll?.mode)||0),kind==='skill'?'skill setting':'tool setting');
    if(ability)note(Math.sign(Number(sys?.abilities?.[ability]?.check?.roll?.mode)||0),`${String(ability).toUpperCase()} check setting`);
    const group=kind==='skill'?'skill':'tool';
    const midi=new RegExp(`^flags\\.midi-qol\\.(advantage|disadvantage)\\.(all|${group}\\.(all|${key})${ability?`|ability\\.check\\.(all|${ability})`:''})$`);
    for(const effect of effectsOf(actor))for(const change of effect.changes??[]){
      const m=midi.exec(String(change.key??''));
      if(m&&isOn(change.value))note(m[1]==='advantage'?1:-1,effect.name??effect.label??'effect');
    }
  }
  for(const name of assists)adv.push(`assisted by ${name}`);
  // GM-configured advantage tools (0.16.0): proficiency with, or carrying, one of them.
  for(const tool of advantageTools){const ref={key:tool,uuid:null,name:null};
    if(toolProficient(actor,tool)||heldTool(actor,ref))adv.push(toolLabel(tool));}
  const mode=adv.length&&dis.length?0:adv.length?1:dis.length?-1:0;
  return {mode,sources:[...adv.map(s=>`Advantage: ${s}`),...dis.map(s=>`Disadvantage: ${s}`)]};
}
export const MODE_LABELS=Object.freeze({'1':'Advantage','0':'Normal','-1':'Disadvantage'});

/**
 * Roll the check natively with dnd5e (its own chat message and dice). Returns {total, mode} or null when
 * dnd5e offers no roll for it; throws when the roller cancels.
 */
export async function rollCheck(actor,option,mode){
  const cfg={advantage:mode>0,disadvantage:mode<0};
  let out;
  if(option.kind==='skill'&&typeof actor?.rollSkill==='function')out=await actor.rollSkill({skill:option.key,...cfg},{configure:false});
  else if(option.kind==='tool'&&option.key&&typeof actor?.rollToolCheck==='function')out=await actor.rollToolCheck({tool:option.key,...cfg},{configure:false});
  else if(option.kind==='tool'){
    const item=heldTool(actor,option.ref);
    if(typeof item?.rollToolCheck!=='function')return null;
    out=await item.rollToolCheck(cfg,{configure:false});
  }else return null;
  const roll=Array.isArray(out)?out[0]:out;
  const total=Number(roll?.total);
  if(!Number.isFinite(total))throw Error('The roll was cancelled');
  return {total,mode};
}

/**
 * The checks a craft offers: the recipe's (or profession's) tool and/or the profession's check skill.
 * The tool is the default when the crafter carries it or is proficient; otherwise the skill, if there is one.
 * Returns null when neither applies. `tool` is a toolRef; `skill` a skill id or null.
 */
export function craftCheckPlan(actor,{tool=null,tools=null,skill=null}={}){
  // `tools` (0.15.0): a recipe needing several tools offers a check with each of them.
  const refs=(Array.isArray(tools)&&tools.length?tools:tool?[tool]:[]).filter(Boolean);
  const options=[...refs.map(ref=>({kind:'tool',key:ref.key??null,ref})),...(skill?[{kind:'skill',key:skill}]:[])];
  if(!options.length)return null;
  const toolOptions=options.filter(o=>o.kind==='tool');
  const usable=toolOptions.find(o=>heldTool(actor,o.ref)||(o.ref.key&&checkOption(actor,{kind:'tool',key:o.ref.key,ref:o.ref}).proficient));
  const first=usable??(!skill?toolOptions[0]:null)??options.find(o=>o.kind==='skill')??toolOptions[0];
  return {options,selected:first,choice:`${first.kind}:${first.key??first.ref?.name??first.ref?.uuid}`};
}
