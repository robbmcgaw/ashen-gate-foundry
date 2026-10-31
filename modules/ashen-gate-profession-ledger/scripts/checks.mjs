/** Ashen Gate Profession Ledger checks (0.10.0).
 * Skill and tool checks for gathering and crafting: which check, its bonus, whether the character
 * carries the tool, and the advantage it starts with. Foundry/dnd5e globals are read only where noted,
 * with fallbacks, so the rules stay testable.
 */
import {norm} from './core.mjs';
import {professionKeysIn} from './professions.mjs';

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
  mining:'mason',huntingskinning:'leatherworker',enchanting:'',archaeology:'',fishing:'',artistry:''});
/** GM Setup defaults: the skill a profession can roll instead of (or beside) its tool. Gathering professions use it to
 * gather; Enchanting is the one crafting profession whose main check is a skill (Arcana). The GM can change or clear it. */
export const DEFAULT_GATHER_SKILLS=Object.freeze({herbalism:'nat',huntingskinning:'sur',archaeology:'his',fishing:'sur',mining:'',enchanting:'arc',artistry:'prf'});
/** 0.28.0 (GM decision): built-in tools to access for a profession with no single check tool. Artistry: any musical
 * instrument (a tool group), Disguise Kit, Painter's Supplies or Calligrapher's Supplies; with Performance (its check skill,
 * above) any one qualifies. Shown as "Default" in GM Setup and changeable there like every other cell. */
export const DEFAULT_QUALIFY_TOOLS=Object.freeze({artistry:Object.freeze(['music','disg','painter','calligrapher'])});
/** 0.28.0: tool groups a crosswalk cell or a recipe can name instead of one tool. `music` matches any dnd5e tool whose type
 * is a musical instrument (read from dnd5e's config when it says so), else the built-in instrument list below. */
export const TOOL_GROUPS=Object.freeze({music:Object.freeze({label:'Any musical instrument',type:'music',
  keys:Object.freeze(['bagpipes','drum','dulcimer','flute','horn','lute','lyre','panflute','shawm','viol']),
  aliases:Object.freeze(['anymusicalinstrument','musicalinstrument','musicalinstruments','anyinstrument','instrument','instruments','music'])})});
export const TOOL_GROUP_KEYS=Object.freeze(Object.keys(TOOL_GROUPS));
export const isToolGroup=key=>Object.hasOwn(TOOL_GROUPS,key??'');
/** Readable names for the instrument keys when dnd5e cannot supply a label (also used to match by name). */
const INSTRUMENT_LABELS=Object.freeze({bagpipes:'Bagpipes',drum:'Drum',dulcimer:'Dulcimer',flute:'Flute',horn:'Horn',lute:'Lute',lyre:'Lyre',
  panflute:'Pan Flute',shawm:'Shawm',viol:'Viol'});
/** 0.22.0 migration of the saved checkMapping (version 0 → 1): Fishing's check skill default became Survival. Before 0.22.0
 * every Save wrote the old default (fishing: '') with the rest, so a saved '' is that old default and becomes 'sur'.
 * Nothing else is touched. Returns the new value, or null when there is nothing to change. Safe to run again. */
export function migrateCheckMapping(stored){
  const s=stored&&typeof stored==='object'?stored:null;
  if(!s||!s.skills||typeof s.skills!=='object'||s.skills.fishing!=='')return null;
  return {...s,skills:{...s.skills,fishing:'sur'}};
}
/** 0.26.2: what is stored for the profession tools and check skills is only what differs from the built-in defaults
 * (DEFAULT_PROFESSION_TOOLS, DEFAULT_GATHER_SKILLS); everything else keeps coming from the defaults, so a later default
 * update still reaches the world. Before, Save wrote the whole effective table, freezing every default as if the GM had
 * chosen it. A cell equal to its current default is dropped (unless another stored key, an old alias, names the same
 * profession, where dropping it could change which one wins). Anything else is kept as it is: other values, invalid
 * entries, the crosswalk lists and any other key. Returns a new object; safe to run again (a second run changes nothing). */
export function compactCheckMapping(stored){
  const s=stored&&typeof stored==='object'?stored:{},out={...s};
  for(const [field,defaults] of [['tools',DEFAULT_PROFESSION_TOOLS],['skills',DEFAULT_GATHER_SKILLS]]){
    const src=s[field];if(!src||typeof src!=='object'||Array.isArray(src))continue;
    const canon=k=>PROFESSION_ALIASES[k]??k,count={};
    for(const k of Object.keys(src))count[canon(k)]=(count[canon(k)]??0)+1;
    out[field]=Object.fromEntries(Object.entries(src).filter(([k,v])=>!(count[canon(k)]===1&&Object.hasOwn(defaults,canon(k))&&v===defaults[canon(k)])));
  }
  return out;
}
/** Stored GM choices win over defaults; an explicit '' means "none".
 * 0.16.0 crosswalk (AG-F01), additive: per profession, the skills and tools whose proficiency qualifies a character
 * (any-of), and the advantage tools (proficiency with, or carrying, one gives advantage on that profession's checks).
 * 0.20.0 adds `items` (carried core items that qualify) and the baseline-file layer (see effectiveMapping).
 * An explicit [] means "none". `gm` holds only the GM's saved lists. 0.27.0: gathering checks use the advantage tools in
 * effect, catalog included (main.js rollMapping); before, they skipped the catalog's. */
export const CROSSWALK_LISTS=Object.freeze(['qualifySkills','qualifyTools','advantageTools','items','advantageItems']);
/** 0.27.0: lists of carried items (names or UUIDs, kept as written): `items` qualifies (legacy), `advantageItems` gives
 * advantage on that profession's gathering checks while the character carries one. */
export const ITEM_LISTS=Object.freeze(['items','advantageItems']);
/** 0.20.0: core items that qualify a character by being carried (name, or a core/Item UUID). 0.22.0: none built in (Fishing
 * is accessed by the Survival skill instead); `items` from saved GM edits, the catalog or a baseline file still count. */
export const DEFAULT_QUALIFY_ITEMS=Object.freeze({});
/** 0.22.0: built-in qualifying skills for professions with no check skill to seed them. Fishing is accessed by Survival. */
export const DEFAULT_QUALIFY_SKILLS=Object.freeze({fishing:Object.freeze(['sur'])});
/** 0.27.0 (GM decision): built-in advantage for the two gathering professions the content gives no usable tool for.
 * Archaeology: Calligrapher's Supplies. Fishing: carrying Fishing Tackle (adventuring gear, not a tool proficiency). */
export const DEFAULT_ADVANTAGE_TOOLS=Object.freeze({archaeology:Object.freeze(['calligrapher'])});
export const DEFAULT_ADVANTAGE_ITEMS=Object.freeze({fishing:Object.freeze(['Fishing Tackle'])});
const TOOL_KEY=/^[a-z][a-z0-9]*$/;
const ITEM_REF=v=>v.trim().length>0&&v.trim().length<=200;
const cleanList=(v,valid)=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&valid(x)))]:null;
/** Item references, trimmed, without case-insensitive duplicates. */
export const cleanItemList=v=>{if(!Array.isArray(v))return null;const out=[],seen=new Set();
  for(const x of v){if(typeof x!=='string'||!ITEM_REF(x))continue;const t=x.trim(),k=norm(t)||t.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(t);}}return out;};
const LIST_VALID={qualifySkills:v=>SKILL_IDS.includes(v),qualifyTools:v=>TOOL_KEY.test(v),advantageTools:v=>TOOL_KEY.test(v)};
export const cleanCrosswalkList=(list,v)=>ITEM_LISTS.includes(list)?cleanItemList(v):cleanList(v,LIST_VALID[list]);
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
  // 0.28.0: imported creative professions (registry extras) get a row too.
  const keys=[...new Set([...Object.keys(tools),...Object.keys(skills),...professionKeysIn('creative')])];
  const out={tools,skills,gm,qualifySkills:{},qualifyTools:{},advantageTools:{},items:{},advantageItems:{},origin:{}};
  for(const k of keys){
    const cat=catalog?.[k]??null,file=baseline?.[k]??null;
    const base={qualifySkills:skills[k]?[skills[k]]:[...(DEFAULT_QUALIFY_SKILLS[k]??[])],qualifyTools:tools[k]?[tools[k]]:[...(DEFAULT_QUALIFY_TOOLS[k]??[])],advantageTools:[...(DEFAULT_ADVANTAGE_TOOLS[k]??[])],items:[...(DEFAULT_QUALIFY_ITEMS[k]??[])],advantageItems:[...(DEFAULT_ADVANTAGE_ITEMS[k]??[])]};
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

/** 0.22.0: advantage tools apply to gathering professions only. Crafting checks get none, whatever is saved or loaded
 * for them (the data is kept, just not used). */
export const GATHERING_PROFESSION_KEYS=Object.freeze(['archaeology','fishing','herbalism','huntingskinning','mining']);
export const advantageToolsOf=(map,key)=>GATHERING_PROFESSION_KEYS.includes(key)?[...(map?.advantageTools?.[key]??[])]:[];
/** 0.27.0: carried items that give advantage, same rule (gathering professions only). */
export const advantageItemsOf=(map,key)=>GATHERING_PROFESSION_KEYS.includes(key)?[...(map?.advantageItems?.[key]??[])]:[];

const dnd5eTools=()=>globalThis.CONFIG?.DND5E?.tools??{};
export const toolKeys=()=>[...new Set([...Object.keys(TOOL_LABELS),...Object.keys(dnd5eTools())])].sort((a,b)=>toolLabel(a).localeCompare(toolLabel(b)));
export function toolLabel(key){
  if(!key)return '';
  if(isToolGroup(key))return TOOL_GROUPS[key].label;
  try{const label=globalThis.dnd5e?.documents?.Trait?.keyLabel?.(key,{trait:'tool'});if(typeof label==='string'&&label&&label!==key)return label;}catch{}
  const cfg=dnd5eTools()[key];
  if(typeof cfg==='string')return cfg;
  if(typeof cfg?.label==='string'&&cfg.label)return cfg.label;
  return TOOL_LABELS[key]??INSTRUMENT_LABELS[key]??String(key);
}
/** The tool type dnd5e gives a tool key ("music", "art", "game"), or null when its config does not say. Reads the config
 * entry, else the compendium index entry it points to (fromUuidSync, when available). */
function dnd5eToolType(cfg){
  const direct=cfg?.type?.value??cfg?.type??cfg?.toolType??null;
  if(typeof direct==='string'&&direct)return direct;
  if(typeof cfg?.id!=='string'||typeof globalThis.fromUuidSync!=='function')return null;
  try{const hit=globalThis.fromUuidSync(cfg.id);const t=hit?.system?.type?.value??hit?.system?.toolType;return typeof t==='string'&&t?t:null;}catch{return null;}
}
/** 0.28.0: the tool keys in a group: every dnd5e tool whose type is the group's (e.g. a musical instrument), plus the built-in
 * list (by key, or by a tool whose label is an instrument name) so it still works when dnd5e's config does not give types. */
export function toolGroupMembers(group){
  const g=TOOL_GROUPS[group];if(!g)return [];
  const out=new Set(g.keys),names=new Set(Object.values(INSTRUMENT_LABELS).map(norm));
  for(const [key,cfg] of Object.entries(dnd5eTools()))if(dnd5eToolType(cfg)===g.type||(group==='music'&&names.has(norm(toolLabel(key)))))out.add(key);
  return [...out];
}
/** A tool name as a group key ("Any musical instrument" → music), or null. */
export const toolGroupOf=name=>{const n=norm(name);return TOOL_GROUP_KEYS.find(k=>k===String(name??'').trim()||TOOL_GROUPS[k].aliases.includes(n)||norm(TOOL_GROUPS[k].label)===n)??null;};
export const skillLabel=key=>SKILL_LABELS[key]??globalThis.CONFIG?.DND5E?.skills?.[key]?.label??String(key??'');
/** 0.43.0: a recipe's check name as a dnd5e skill key. Accepts the key ("arc"), the label ("Arcana"), and the label in any case,
 * spacing or punctuation ("sleight-of-hand", "Animal  Handling"), plus the label dnd5e itself shows (CONFIG.DND5E.skills). null when it is not a skill. */
export function skillKeyOf(value){
  const t=String(value??'').trim();if(!t)return null;
  if(SKILL_IDS.includes(t))return t;
  const flat=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const want=flat(t);if(!want)return null;
  const cfg=globalThis.CONFIG?.DND5E?.skills??{};
  return SKILL_IDS.find(k=>flat(k)===want||flat(SKILL_LABELS[k])===want||flat(cfg[k]?.label)===want)??null;
}
/** 0.43.0: how proficient a character is in one skill, from system.skills.<key>.value (0, 0.5 half, 1 proficient, 2 expertise),
 * else its `proficient` field. Returns 'expertise' | 'proficient' | 'half' | 'none'. Half proficiency (Jack of All Trades) is not proficiency. */
export function skillProficiency(actor,key){
  const sk=actor?.system?.skills?.[key];if(!sk)return 'none';
  const n=Number(sk.value??sk.proficient??sk.effectValue??0);
  return n>=2?'expertise':n>=1?'proficient':n>0?'half':'none';
}
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
  const group=toolGroupOf(ref.name);if(group)return {...ref,key:group};
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
/** 0.33.2: half proficiency (0.5, Jack of All Trades) is not proficiency; 1 (proficient) and 2 (expertise) are. */
export const toolProficient=(actor,key)=>Number(actor?.system?.tools?.[key]?.value??actor?.system?.tools?.[key]?.effectValue??0)>=1;
/** 0.28.0: proficiency for a crosswalk tool value: a tool key as toolProficient; a group (music) when the character is
 * proficient with any tool in it (or with the whole group). Returns the tool keys that matched ([] for none). */
export function toolProficiencyMatches(actor,key){
  if(!isToolGroup(key))return toolProficient(actor,key)?[key]:[];
  const listed=toolGroupMembers(key),members=new Set([key,...listed]),labels=new Set(listed.map(m=>norm(toolLabel(m))));
  // A tool on the sheet that is not in dnd5e's list still counts when its label is in the group (e.g. "Lute").
  for(const k of Object.keys(actor?.system?.tools??{}))if(!members.has(k)&&labels.has(norm(toolLabel(k))))members.add(k);
  return [...members].filter(k=>toolProficient(actor,k));
}
export const toolQualifies=(actor,key)=>toolProficiencyMatches(actor,key).length>0;
/** True when a carried tool Item belongs to a group: its dnd5e tool type, base item or name. */
const inGroup=(item,group)=>{const g=TOOL_GROUPS[group];if(!g)return false;
  const type=item?.system?.type?.value,base=item?.system?.type?.baseItem??item?.system?.baseItem;
  return type===g.type||toolGroupMembers(group).includes(base)||Object.values(INSTRUMENT_LABELS).some(n=>group==='music'&&norm(n)===norm(item?.name));};
/** 0.32.2: a tool name compared loosely: no brackets or (source book) tags, no punctuation, apostrophe style or case, and
 * no plural "s", so "Cartographer’s Tools (XGE)", "Cartographers Tool" and "cartographers-tools" are one name. */
export const looseToolName=v=>norm(String(v??'').replace(/\([^)]*\)|\[[^\]]*\]/g,'')).replace(/s$/,'');
const PHYSICAL_TYPES=new Set(['tool','loot','equipment','consumable','weapon','container','backpack']);
/** Items a character carries, flattened: the Actor's own Items (a container's contents are Actor Items that point at the
 * container, so they are included) plus any synchronous `system.contents` list. Quantity 0 and non-gear Items are left out. */
function carriedGear(actor){
  const out=[],seen=new Set(),walk=list=>{for(const i of Array.from(list??[])){
    if(!i||typeof i!=='object'||seen.has(i))continue;seen.add(i);
    if(PHYSICAL_TYPES.has(i.type)&&Number(i.system?.quantity??1)>0)out.push(i);
    const inner=i.system?.contents;if(inner&&typeof inner!=='string'&&typeof inner.then!=='function'&&typeof inner[Symbol.iterator]==='function')walk(inner);}};
  walk(actor?.items);return out;
}
/** Does this Item stand for the tool key? dnd5e base item, identifier or name (any case, punctuation, plural, source tag). */
function itemIsTool(item,key){
  const base=item.system?.type?.baseItem??item.system?.baseItem;
  if(base&&base===key)return true;
  const names=new Set([toolLabel(key),TOOL_LABELS[key],INSTRUMENT_LABELS[key]].filter(Boolean).map(looseToolName));
  if(!names.size)return false;
  return [item.name,item.system?.identifier].some(n=>n&&names.has(looseToolName(n)));
}
/** The tool Item the character carries for this reference, or null. Physical Items only: proficiency never counts here.
 * 0.32.2: Items imported from D&D Beyond (no base item, a different identifier, curly apostrophes, a source tag) match by
 * name or identifier as well; Items inside containers count; quantity 0 and Items that are not gear do not. */
export function heldTool(actor,ref){
  if(!ref)return null;
  const gear=carriedGear(actor);
  if(isToolGroup(ref.key))return gear.find(i=>(i.type==='tool'||i.system?.type?.value==='tool')&&inGroup(i,ref.key))??null;
  return gear.find(i=>
    (ref.key&&itemIsTool(i,ref.key))||
    (ref.uuid&&(i.uuid===ref.uuid||i._stats?.compendiumSource===ref.uuid||i.flags?.core?.sourceId===ref.uuid))||
    (ref.name&&looseToolName(i.name)===looseToolName(ref.name)))??null;
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
/** 0.27.0: a carried item that gives advantage: as carriedItem (UUID, compendium source, core link or name), or a dnd5e
 * item identifier ("fishing-tackle") matching the reference. Quantity 0 is not carried. Qualifying uses carriedItem only. */
export function advantageItem(actor,ref){
  const hit=carriedItem(actor,ref);if(hit)return hit;
  const name=norm(ref);if(!name||/^(Compendium|Item)\./.test(String(ref??'').trim()))return null;
  return Array.from(actor?.items??[]).find(i=>i&&Number(i.system?.quantity??1)>0&&norm(i.system?.identifier)===name)??null;
}
export const formatBonus=n=>Number.isFinite(n)?(n>=0?`+${n}`:`−${Math.abs(n)}`):'—';

/** 0.28.0: a recipe's tool references for one character, with each group (Any musical instrument) replaced by the tools of
 * that group the character is proficient with or carries, so the check rolls a real instrument. A group the character has
 * nothing for stays as it is (shown as missing). */
export function expandToolGroups(actor,refs=[]){
  // Other references are kept exactly as given; only a group's tools are skipped when already listed.
  const out=[],has=ref=>out.some(o=>(ref.key&&o.key===ref.key)||(ref.name&&o.name&&norm(o.name)===norm(ref.name))),add=ref=>{if(!has(ref))out.push(ref);};
  for(const ref of refs){
    if(!ref||!isToolGroup(ref.key)){if(ref)out.push(ref);continue;}
    const found=[...toolProficiencyMatches(actor,ref.key).filter(k=>!isToolGroup(k)).map(k=>({key:k,uuid:null,name:null})),
      ...Array.from(actor?.items??[]).filter(i=>i?.type==='tool'&&inGroup(i,ref.key)).map(i=>({key:i.system?.type?.baseItem??i.system?.baseItem??null,uuid:null,name:i.name}))];
    if(found.length)found.forEach(add);else add(ref);
  }
  return out;
}
/** One check option: {kind:'skill'|'tool', key, label, bonus, proficient, held}. */
export function checkOption(actor,{kind,key,ref=null}){
  if(kind==='skill')return {kind,key,label:skillLabel(key),bonus:skillBonus(actor,key),proficient:Number(actor?.system?.skills?.[key]?.value??0)>=1,held:null};
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
export function rollModeFor(actor,{kind,key},{assists=[],advantageTools=[],advantageItems=[]}={}){
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
    if(toolQualifies(actor,tool)||heldTool(actor,ref))adv.push(toolLabel(tool));}
  // 0.27.0: carried gear that gives advantage (e.g. Fishing Tackle), named as the character's item.
  for(const ref of advantageItems){const item=advantageItem(actor,ref);if(item&&!adv.includes(item.name))adv.push(item.name);}
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
export function craftCheckPlan(actor,{tool=null,tools=null,skill=null,skills=null}={}){
  // `tools` (0.15.0): a recipe needing several tools offers a check with each of them.
  const refs=(Array.isArray(tools)&&tools.length?tools:tool?[tool]:[]).filter(Boolean);
  // `skills` (0.28.0): an activity may offer several skills (its access list) besides the profession's check skill.
  const skillKeys=[...new Set([skill,...(Array.isArray(skills)?skills:[])].filter(Boolean))];
  skill=skillKeys[0]??null;
  const options=[...refs.map(ref=>({kind:'tool',key:ref.key??null,ref})),...skillKeys.map(key=>({kind:'skill',key}))];
  if(!options.length)return null;
  const toolOptions=options.filter(o=>o.kind==='tool');
  const usable=toolOptions.find(o=>heldTool(actor,o.ref)||(o.ref.key&&checkOption(actor,{kind:'tool',key:o.ref.key,ref:o.ref}).proficient));
  const first=usable??(!skill?toolOptions[0]:null)??options.find(o=>o.kind==='skill')??toolOptions[0];
  return {options,selected:first,choice:`${first.kind}:${first.key??first.ref?.name??first.ref?.uuid}`};
}
