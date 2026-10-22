/** Ashen Gate Profession Ledger: the profession registry (0.28.0).
 * One list of the built-in professions, {name, key, id, category}. The first 14 are exactly the professions the Ledger has
 * always known (names, keys and order unchanged); Artistry (0.28.0) is the first `creative` profession. Professions imported
 * later with category `creative` are added at runtime (noteProfession), so a new creative profession works without a code change.
 * Pure data and helpers; no Foundry globals.
 */
export const PROFESSION_CATEGORIES=Object.freeze(['crafting','gathering','creative']);
const keyOf=name=>String(name??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
const p=(name,id,category)=>Object.freeze({name,key:keyOf(name),id,category});
export const BUILTIN_PROFESSIONS=Object.freeze([
  p('Alchemy','PROF-ALCHEMY','crafting'),p('Blacksmithing','PROF-BLACKSMITHING','crafting'),p('Cooking','PROF-COOKING','crafting'),
  p('Enchanting','PROF-ENCHANTING','crafting'),p('Engineering','PROF-ENGINEERING','crafting'),p('Inscription','PROF-INSCRIPTION','crafting'),
  p('Jewelcrafting','PROF-JEWELCRAFTING','crafting'),p('Leatherworking','PROF-LEATHERWORKING','crafting'),p('Tailoring','PROF-TAILORING','crafting'),
  p('Archaeology','PROF-ARCHAEOLOGY','gathering'),p('Fishing','PROF-FISHING','gathering'),p('Herbalism','PROF-HERBALISM','gathering'),
  p('Hunting/Skinning','PROF-HUNTING','gathering'),p('Mining','PROF-MINING','gathering'),
  p('Artistry','PROF-ARTISTRY','creative')
]);
/** The category an imported Profession record declares, or null. Existing content says `profession_kind` (crafting |
 * gathering); `category: "creative"` is accepted too. Read from the record, its stored source definition or Manager's flag. */
export function declaredCategory(raw){
  const def=raw?.flags?.['ashen-gate-manager']?.source?.definition??raw?.sourceDefinition??null;
  for(const src of [raw,def]){
    if(!src||typeof src!=='object')continue;
    const kind=String(src.profession_kind??'').trim().toLowerCase();
    if(PROFESSION_CATEGORIES.includes(kind))return kind;
    // `category` is a common word on other records, so only the new value is read from it.
    if(String(src.category??'').trim().toLowerCase()==='creative')return 'creative';
  }
  return null;
}
/** Creative professions found in this world's imported Profession records (not built in). Runtime only, never saved. */
const extras=new Map();
/** Remember an imported creative profession by name. Built-ins and other categories are ignored. Returns its key or null. */
export function noteProfession({name,category}={}){
  const key=keyOf(String(name??'').replace(/\[[^\]]*\]/g,''));
  if(category!=='creative'||!key||BUILTIN_PROFESSIONS.some(b=>b.key===key))return null;
  if(!extras.has(key))extras.set(key,Object.freeze({name:String(name).replace(/\[[^\]]*\]/g,'').trim(),key,id:null,category:'creative'}));
  return key;
}
export const clearNotedProfessions=()=>extras.clear();
/** Built-ins, then imported creative professions. */
export const allProfessions=()=>[...BUILTIN_PROFESSIONS,...extras.values()];
export const professionByKey=key=>allProfessions().find(x=>x.key===key)??null;
export const professionKeysIn=category=>allProfessions().filter(x=>x.category===category).map(x=>x.key);
export const categoryOfKey=key=>professionByKey(key)?.category??null;
