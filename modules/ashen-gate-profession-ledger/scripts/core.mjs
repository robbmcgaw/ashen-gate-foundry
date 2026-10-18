/** Ashen Gate Profession Ledger core v0.2.3; side-effect-free, reusable transforms. */
export const SCHEMA = 'ag-ledger/0.1';
export const PROFESSION_NAMES = Object.freeze([
  'Alchemy','Arcana','Blacksmithing','Cooking','Engineering','Inscription','Jewelcrafting',
  'Leatherworking','Tailoring','Archaeology','Fishing','Herbalism','Hunting/Skinning','Mining'
]);
export const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
export const toNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const quantity = obj => Math.max(0,Math.floor(toNumber(obj?.system?.quantity ?? obj?.quantity ?? 0)));
export const safePlain = obj => obj && typeof obj==='object' && !Array.isArray(obj);
export const VALID_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
export const VALID_STATUS = new Set(['proposed','draft','approved','superseded','retired']);
export const VALID_VISIBILITY = new Set(['player','gm','reveal_gated']);
/** Explicit source metadata always wins over Foundry document permission. */
export const sourceVisibility = raw => raw?.flags?.['ashen-gate-manager']?.source?.visibility ?? raw?.sourceVisibility ?? raw?.visibility ?? null;
export const sourceAvailableToPlayer = raw => sourceVisibility(raw)==='player' && !['draft','proposed','superseded','retired','placeholder'].includes(raw?.flags?.['ashen-gate-manager']?.source?.status ?? raw?.status ?? 'approved');
const managerKind = raw => raw?.flags?.['ashen-gate-manager']?.source?.entityType ?? raw?.flags?.['ashen-gate-manager']?.capture?.entityType;
export const agSourceId = raw => raw?.flags?.['ashen-gate-manager']?.source?.sourceId || raw?.flags?.['ashen-gate-profession-ledger']?.sourceId || raw?.flags?.['ashen-gate']?.sourceId || raw?.flags?.['ashen-gate']?.entityId || null;
export function classify(raw) {
  const exact=raw?.flags?.['ashen-gate-profession-ledger']?.entityType || managerKind(raw);
  if(exact) return exact;
  const id=agSourceId(raw);
  if(id?.startsWith('MAT-'))return 'Material';
  if(id?.startsWith('REC-'))return 'Recipe';
  if(id?.startsWith('PROF-'))return 'Profession';
  if(id?.startsWith('PERK-'))return 'ProfessionPerk';
  if(/^Recipe\s*:/i.test(raw?.name??''))return 'Recipe';
  if(PROFESSION_NAMES.some(x=>norm(raw?.name)===norm(x))||norm(raw?.name)==='enchanting')return 'Profession';
  return null;
}
export const displayProfession = raw => norm(raw)==='enchanting'?'Arcana':String(raw??'');
export const professionFromTreeName = raw => displayProfession(String(raw??'').split(/\s[·•—–]\s|\s-\s/)[0].trim());
export const cleanName = raw => String(raw??'').replace(/^Recipe\s*:\s*/i,'').trim();
const ingredientName = raw => String(raw?.name??raw?.materialName??raw?.material_id??raw?.materialId??raw?.target_id??raw?.id??'').trim();
/** Retain authored definition values as-is; Foundry projections are not book data. */
export function definitionRecord(raw) {
  if(!safePlain(raw))return null;
  const stored=raw?.flags?.['ashen-gate-manager']?.source?.definition ?? raw?.sourceDefinition;
  const source=safePlain(stored)?stored:raw;
  if(!safePlain(source)||!VALID_ID.test(source.id??'')||typeof source.entity_type!=='string')return null;
  const {foundry,...def}=source;
  return structuredClone(def);
}
export function normalizeRecipe(raw) {
  const def=definitionRecord(raw);
  // Manager 0.11.1 stores structured Recipe fields directly in source.definition.
  // Older Ledger recipe envelopes remain valid if no canonical definition exists.
  const canonical=def?.entity_type==='Recipe' ? def : null;
  const src=(canonical && Object.hasOwn(canonical,'ingredients')) ? canonical : (raw?.recipe ?? raw?.flags?.['ashen-gate-profession-ledger']?.recipe ?? raw?.system?.agRecipe ?? canonical ?? (Array.isArray(raw?.ingredients)?raw:null));
  const name=cleanName(canonical?.name??raw?.name), id=canonical?.id??agSourceId(raw)??raw?.id??null;
  const ingredients=src?.ingredients;
  const validIngredients=Array.isArray(ingredients) && ingredients.length>0 && ingredients.every(x=>safePlain(x) && (ingredientName(x)||x.materialId||x.material_id||x.target_id||x.id) && Number.isInteger(Number(x.quantity)) && Number(x.quantity)>0);
  const clean=validIngredients?ingredients.map(x=>({
    materialId:x.materialId??x.material_id??x.target_id??x.id??null,
    name:ingredientName(x), quantity:Math.max(1,Math.floor(toNumber(x.quantity)))
  })).filter(x=>x.name||x.materialId):[];
  const professionId=canonical?.profession_id ?? src?.profession_id ?? null;
  const resultItemId=canonical?.result_item_id ?? src?.result_item_id ?? null;
  const profession=src?.professionName??src?.profession??raw?.profession??professionId??'';
  return {id, name, profession:displayProfession(profession),professionId,
    resultItemId, tier:src?.tier??raw?.tier??null,effort:src?.effort??raw?.effort??null,
    description:src?.description??src?.rules_summary??'',
    // Optional crafting requirement: a dnd5e tool key, tool Item UUID/name, or a workstation (text).
    tool:canonical?.tool??canonical?.required_tool??canonical?.tool_key??src?.tool??src?.required_tool??null,
    workstation:String(canonical?.workstation??src?.workstation??'').trim()||null,
    ingredients:clean,hasStructuredIngredients:validIngredients,
    sourceUuid:raw?.uuid??null, status:raw?.status??canonical?.status??'unreviewed',
    sourceVisibility:sourceVisibility(raw), isDemo:Boolean(raw?.isDemo),
    // Exact definition and typed refs remain available to consuming adapters.
    // Display/crafting helpers above are intentionally derived views only.
    sourceDefinition:canonical, refs:structuredClone(canonical?.refs??raw?.refs??[])};
}

/** Group indexed recipes using existing profession metadata only. Never infer a profession from names. */
export function groupRecipesByProfession(recipes=[]) {
  const grouped=new Map();
  for(const recipe of recipes) {
    const name=String(recipe?.profession??'').trim()||'Unassigned profession';
    const key=norm(name);
    if(!grouped.has(key))grouped.set(key,{key,name,recipes:[]});
    grouped.get(key).recipes.push(recipe);
  }
  return [...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}))
    .map(group=>({...group,recipes:group.recipes.sort((a,b)=>String(a.name).localeCompare(String(b.name),undefined,{sensitivity:'base'}))}));
}
/** Returns item snapshots for one Actor. Never mutates the Actor or its items. */
export function inventory(actor,{includeRestricted=true}={}) {
  return Array.from(actor?.items??[]).filter(item=>includeRestricted||sourceAvailableToPlayer(item)).map(item=>({
    id:item.id??item._id??null,uuid:item.uuid??null,name:item.name??'',img:item.img??null,
    type:item.type??'',category:classify(item),sourceId:agSourceId(item),qty:quantity(item),sourceVisibility:sourceVisibility(item),
    ownerActorId:actor.id,ownerActorName:actor.name
  }));
}
export function listMaterials(actors, library=[],{includeRestricted=true}={}) {
  const keyed=new Map();
  for(const actor of actors)for(const item of inventory(actor,{includeRestricted})) {
    if(item.category && item.category!=='Material')continue;
    if(item.sourceId && !item.sourceId.startsWith('MAT-'))continue;
    const materialDef=library.find(x=>(x.id && x.id===item.sourceId)||(!item.sourceId && norm(x.name)===norm(item.name)));
    if(item.category!=='Material'&&!materialDef)continue;
    const key=materialDef?.id??item.sourceId??`NAME-${norm(item.name)}`;
    if(!keyed.has(key))keyed.set(key,{id:key,name:materialDef?.name??item.name,total:0,sources:[]});
    const out=keyed.get(key);out.total+=item.qty;
    out.sources.push({actorId:actor.id,actorName:actor.name,itemId:item.id,qty:item.qty,name:item.name});
  }
  return [...keyed.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
const matchesIngredient=(item,ing,defs)=> {
  // A permanent source ID cannot be overridden by a coincidental display name.
  if(item.category && item.category!=='Material')return false;
  if(item.sourceId && !item.sourceId.startsWith('MAT-'))return false;
  if(ing.materialId && item.sourceId)return item.sourceId===ing.materialId;
  if(ing.materialId && !ing.materialId.startsWith('MAT-'))return false;
  const def=defs.find(x=>x.id===ing.materialId);
  const expected=ing.name||def?.name;
  return Boolean(expected)&&norm(item.name)===norm(expected);
};
/** Proposes source allocations only; it NEVER approves, transfers, or consumes materials. */
export function planRecipe(recipe,actors,materialDefs=[],{includeRestricted=true}={}) {
  if(!recipe?.hasStructuredIngredients)return {ready:false,unsupported:true,missing:[],allocations:[],requirements:[]};
  const available=actors.flatMap(a=>inventory(a,{includeRestricted}).filter(i=>i.qty>0 && (!i.category || i.category==='Material') && (!i.sourceId || i.sourceId.startsWith('MAT-'))).map(i=>({...i,actorId:a.id,actorName:a.name}))); 
  const availableLeft=new Map(available.map((i,k)=>[k,i.qty]));
  const requirements=[], allocations=[];
  for(const ing of recipe.ingredients) {
    let needed=ing.quantity;const matched=available.map((it,i)=>({it,i})).filter(x=>matchesIngredient(x.it,ing,materialDefs));
    const total=matched.reduce((n,x)=>n+(availableLeft.get(x.i)??0),0);
    for(const {it,i} of matched){const count=Math.min(needed,availableLeft.get(i)??0);if(count>0){allocations.push({materialId:ing.materialId,name:ing.name||it.name,quantity:count,actorId:it.actorId,actorName:it.actorName,itemId:it.id});availableLeft.set(i,(availableLeft.get(i)??0)-count);needed-=count;}if(!needed)break;}
    requirements.push({name:ing.name||materialDefs.find(x=>x.id===ing.materialId)?.name||ing.materialId,required:ing.quantity,available:total,missing:Math.max(0,needed)});
  }
  return {ready:requirements.every(x=>!x.missing),unsupported:false,missing:requirements.filter(x=>x.missing),allocations,requirements};
}
/** Accepts the Manager 0.1/0.2 envelope, but only projects explicitly player-visible
 * material/recipe definitions. This never creates Items or interprets arbitrary prose. */
export function normalizeLibrary(pkg) {
  if(!safePlain(pkg))throw Error('Expected a JSON object');
  let recipes=[],materials=[],skippedRestricted=0,unmappedRecipes=0;
  let sourceSchema=null;
  if(pkg.schema===SCHEMA) {
    sourceSchema=SCHEMA;
    recipes=pkg.recipes??[];materials=pkg.materials??[];
    if(!Array.isArray(recipes)||!Array.isArray(materials))throw Error('Invalid Ledger catalog arrays');
    // The Ledger catalog is a shared world setting, never a storage area for secrets.
    const restrictedMaterials=new Set(materials.filter(x=>!sourceAvailableToPlayer(x)).map(x=>x.id));
    const wouldExposeRestrictedMaterial=rec => {
      const src=rec?.recipe??rec?.system?.agRecipe??rec?.flags?.['ashen-gate-profession-ledger']?.recipe??rec;
      return (src?.ingredients??[]).some(ing=>restrictedMaterials.has(ing?.materialId??ing?.material_id??ing?.target_id));
    };
    skippedRestricted=[...recipes,...materials].filter(x=>!sourceAvailableToPlayer(x)).length +
      recipes.filter(rec=>sourceAvailableToPlayer(rec)&&wouldExposeRestrictedMaterial(rec)).length;
    recipes=recipes.filter(rec=>sourceAvailableToPlayer(rec)&&!wouldExposeRestrictedMaterial(rec));
    materials=materials.filter(sourceAvailableToPlayer);
  } else if(['ag-foundry-import/0.1','ag-foundry-import/0.2'].includes(pkg.manifest?.schema_version) && Array.isArray(pkg.records)) {
    if(pkg.records.length>5000)throw Error('Oversized Manager source package');
    sourceSchema=pkg.manifest.schema_version;
    const modern=sourceSchema==='ag-foundry-import/0.2';
    const sourceDefinitions=pkg.records.filter(r=>r?.entity_type==='Recipe'||r?.entity_type==='Material');
    if(!sourceDefinitions.length)throw Error('No Recipe or Material records in this Manager package; import it with Manager, not the Ledger');
    const restrictedIds=new Set(pkg.records.filter(r=>r?.visibility!=='player'||r?.scope==='campaign_state'||['superseded','retired'].includes(r?.status)).map(r=>r.id));
    // Manager v0.2 envelopes can carry GM secrets and campaign-state records.
    // Never copy those records or their descriptions into a player-readable world setting.
    for(const rec of sourceDefinitions) {
      if(modern)validateManagerRecord(rec);
      const projected=rec.foundry?.document_type==='Item'?rec.foundry.data:null;
      const recipeData=rec.recipe??projected?.system?.agRecipe??projected?.flags?.['ashen-gate-profession-ledger']?.recipe;
      if(rec.visibility!=='player'||rec.scope==='campaign_state'||['superseded','retired'].includes(rec.status)||
          (rec.entity_type==='Recipe' && ((rec.refs??[]).some(ref=>ref.mode==='required'&&restrictedIds.has(ref.target_id)) ||
            (recipeData?.ingredients??[]).some(ing=>restrictedIds.has(ing?.materialId??ing?.material_id??ing?.target_id))))) {
        skippedRestricted++;continue;
      }
      if(rec.entity_type==='Recipe') {
        const f=rec.foundry?.document_type==='Item'?rec.foundry.data:null;
        // May exist only as a canonical definition pending Tim's Foundry Item projection.
        // Ingredients are accepted only from a structured recipe object, never HTML.
        // Prefer authored, structured fields on the source definition. The old
        // projected agRecipe flag is a fallback, never canonical authority.
        const legacyRecipe=rec.recipe??f?.flags?.['ashen-gate-profession-ledger']?.recipe??f?.system?.agRecipe??null;
        recipes.push({...rec,id:rec.id,name:f?.name??rec.name??rec.id,
          ...(safePlain(legacyRecipe)&&!Array.isArray(rec.ingredients)?{recipe:legacyRecipe}:{}),
          sourceDefinition:definitionRecord(rec),
          visibility:rec.visibility,status:rec.status});
      } else {
        const f=rec.foundry?.document_type==='Item'?rec.foundry.data:null;
        materials.push({...definitionRecord(rec),name:f?.name??rec.name??rec.id,
          sourceDefinition:definitionRecord(rec),visibility:rec.visibility});
      }
    }
  } else throw Error('Expected ag-ledger/0.1, ag-foundry-import/0.1, or ag-foundry-import/0.2 package');
  if(recipes.length>500||materials.length>1000)throw Error('Invalid or oversized library arrays');
  if(sourceSchema!==SCHEMA && !recipes.length && !materials.length)throw Error('No player-visible active Recipes or Materials in this package; existing Ledger catalog was not changed');
  // Explicitly malformed ingredient arrays must not turn into silent free/cheap crafts.
  for(const raw of recipes){
    const src=raw?.recipe??raw?.flags?.['ashen-gate-profession-ledger']?.recipe??raw?.system?.agRecipe??raw;
    if(src?.ingredients!=null && (!Array.isArray(src.ingredients)||src.ingredients.some(x=>!safePlain(x)||!(ingredientName(x)||x.materialId||x.material_id||x.target_id||x.id)||!Number.isInteger(Number(x.quantity))||Number(x.quantity)<=0)))
      throw Error(`Recipe ${raw.id} has invalid ingredient mapping/quantity`);
  }
  const normed=recipes.map(normalizeRecipe);
  const seen=new Set();
  for(const rec of normed){
    if(!rec.id||!VALID_ID.test(rec.id)||!rec.id.startsWith('REC-'))throw Error(`Recipe has an invalid permanent REC- ID: ${rec.id}`);
    if(!rec.name)throw Error(`Recipe ${rec.id} has no display name`);
    if(seen.has(rec.id))throw Error(`Duplicate recipe ${rec.id}`);seen.add(rec.id);
    if(!rec.hasStructuredIngredients){unmappedRecipes++;continue;}
    for(const ing of rec.ingredients)if(ing.materialId && (!VALID_ID.test(ing.materialId)||!ing.materialId.startsWith('MAT-')))
      throw Error(`Recipe ${rec.id} references a non-MAT ingredient ID`);
  }
  const mats=materials.map(x=>({...x,id:x.id,name:String(x.name??''),sourceVisibility:'player',sourceDefinition:x.sourceDefinition??definitionRecord(x)}));
  const matIds=new Set();
  for(const m of mats){
    if(!m.id||!VALID_ID.test(m.id)||!m.id.startsWith('MAT-')||!m.name)throw Error(`Material has invalid MAT- ID/name: ${m.id}`);
    if(matIds.has(m.id))throw Error(`Duplicate Material ${m.id}`);matIds.add(m.id);
  }
  return {schema:SCHEMA,sourceSchema,recipes:normed,materials:mats,source:'imported',status:'draft_library',
    importSummary:{sourceSchema,skippedRestricted,unmappedRecipes}};
}
function validateManagerRecord(rec){
  if(!safePlain(rec)||!VALID_ID.test(rec.id??'')||!VALID_STATUS.has(rec.status)||!VALID_VISIBILITY.has(rec.visibility)||
    typeof rec.version!=='string'||!safePlain(rec.provenance)||!Array.isArray(rec.provenance.sources)||
    rec.provenance.sources.some(src=>typeof src!=='string'||!src.trim())||
    !Array.isArray(rec.refs)||!['Material','Recipe'].includes(rec.entity_type))throw Error(`Invalid Manager v0.2 Material/Recipe record: ${rec?.id??'unknown'}`);
  const expected=rec.entity_type==='Recipe'?'REC-':'MAT-';
  if(!rec.id.startsWith(expected))throw Error(`Invalid ${rec.entity_type} ID: ${rec.id}`);
  for(const ref of rec.refs)if(!safePlain(ref)||!ref.relation||!VALID_ID.test(ref.target_id??'')||!['required','optional'].includes(ref.mode))
    throw Error(`Invalid typed ref on ${rec.id}`);
}
export function demoSnapshot(){
  const item=(id,name,n,type='loot')=>({id,uuid:null,name,img:'',type,system:{quantity:n},flags:{'ashen-gate-profession-ledger':{entityType:'Material',sourceId:id}}});
  return [
    {id:'DEMO-CHAR-A',name:'Mira • Alchemist',isDemo:true,items:[item('MAT-DEMO-HERBS','Demo Herbs',3),item('MAT-DEMO-VIAL','Demo Vial',1)], professions:['Alchemy','Herbalism']},
    {id:'DEMO-CHAR-B',name:'Torren • Gatherer',isDemo:true,items:[item('MAT-DEMO-HERBS','Demo Herbs',2),item('MAT-DEMO-VIAL','Demo Vial',4)], professions:['Mining','Herbalism']},
    {id:'DEMO-CHAR-C',name:'Iven • Smith',isDemo:true,items:[item('MAT-DEMO-HERBS','Demo Herbs',1),item('MAT-DEMO-VIAL','Demo Vial',1)], professions:['Blacksmithing','Engineering']}
  ];
}
export const DEMO_LIBRARY = {
 schema:SCHEMA,source:'demo_only',materials:[{id:'MAT-DEMO-HERBS',name:'Demo Herbs'},{id:'MAT-DEMO-VIAL',name:'Demo Vial'}],
 recipes:[normalizeRecipe({id:'REC-DEMO-TONIC',name:'Demo Field Tonic',profession:'Alchemy',isDemo:true,
  recipe:{profession:'Alchemy',tier:'Apprentice',effort:'Short',ingredients:[{materialId:'MAT-DEMO-HERBS',name:'Demo Herbs',quantity:4},{materialId:'MAT-DEMO-VIAL',name:'Demo Vial',quantity:2}]}}),
  normalizeRecipe({id:'REC-DEMO-POULTICE',name:'Demo Travel Poultice',profession:'Alchemy',isDemo:true,
  recipe:{profession:'Alchemy',tier:'Apprentice',effort:'Short',ingredients:[{materialId:'MAT-DEMO-HERBS',name:'Demo Herbs',quantity:9},{materialId:'MAT-DEMO-VIAL',name:'Demo Vial',quantity:1}]}})]
};
