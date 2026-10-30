/**
 * Ashen Gate Profession Ledger: the GM's Recipe Catalog list controls (0.40.0): search, filters with counts, Group by, Sort by.
 * Pure functions over small "facts" about each recipe; no Foundry globals and nothing here is saved (the window keeps the choices on this device).
 * It is the same pattern as the Locations list (ashen-gate-locations/scripts/list-filter.mjs): AND filters whose counts follow the other
 * active filters, a search over every shown word, a sort with a direction, and grouping.
 *
 * What the data supports (checked against the Ledger, nothing invented):
 *  - Who knows a recipe: each character's own `knownRecipes` flag. The window passes the party's characters; "the party" knows a recipe when
 *    anyone on the roster does. There is no separate group, workshop, HQ or shared recipe knowledge, so there is no "known by the group"
 *    filter beyond "Known by everyone in the party" (derived: every roster character knows it).
 *  - Not tracked anywhere: when a recipe was learned, and how it was learned (other than the `starting` marker). So there is no "recently
 *    learned" sort and no "how learned" filter.
 * GM only: buildCatalogModel refuses a non-GM caller, so catalog facts (drafts, GM-only recipes) never reach a player view.
 */
import {TIERS} from './progression.mjs';
import {recipeTierName,compareText,lazyNote} from './catalog-tree.mjs';
import {categoryOfKey} from './professions.mjs';
import {recipeProfessionKey} from './assign.mjs';

export const NONE='__none';
export const DISCIPLINES=Object.freeze([{value:'crafting',label:'Crafting'},{value:'gathering',label:'Gathering'},{value:'creative',label:'Creative (Artistry)'}]);
export const KNOWN_FILTERS=Object.freeze([{value:'any',label:'Known by someone'},{value:'none',label:'Known by nobody'},{value:'all',label:'Known by everyone in the party'},
  {value:'found',label:'Recipe item held, not learned'}]);
export const REQUIREMENTS=Object.freeze([{value:'tool',label:'Needs a tool'},{value:'workstation',label:'Needs a workstation'},{value:'both',label:'Tool and workstation'},{value:'neither',label:'Neither'}]);
export const KINDS=Object.freeze([{value:'craft',label:'Crafting recipe'},{value:'activity',label:'Activity'},{value:'enchantment',label:'Enchantment (GM applied)'}]);
export const STARTING=Object.freeze([{value:'yes',label:'Starting recipe'},{value:'no',label:'Not a starting recipe'}]);
export const VISIBILITY=Object.freeze([{value:'released',label:'Released to players'},{value:'draft',label:'Draft or GM only'}]);
/** The dropdowns in the order the window shows them: key, label, and the text of the "no filter" choice. */
export const FILTER_CONTROLS=Object.freeze([
  {key:'profession',label:'Profession',all:'All'},{key:'discipline',label:'Discipline',all:'All'},{key:'tier',label:'Tier',all:'All'},
  {key:'known',label:'Known',all:'Any'},{key:'player',label:'Known by',all:'Anyone'},{key:'starting',label:'Starting',all:'All'},
  {key:'requirement',label:'Requires',all:'All'},{key:'makes',label:'Makes',all:'All'},{key:'kind',label:'Type',all:'All'},{key:'visibility',label:'Players',all:'All'}]);
export const GROUP_MODES=Object.freeze([{value:'profession',label:'Profession'},{value:'tier',label:'Tier'},{value:'discipline',label:'Discipline'},
  {value:'player',label:'Known by (character)'},{value:'none',label:'None'}]);
export const SORTS=Object.freeze([{value:'name',label:'Name'},{value:'profession',label:'Profession, then name'},{value:'tier',label:'Tier'},{value:'known',label:'Characters who know it'}]);
export const emptyFilters=()=>Object.fromEntries(FILTER_CONTROLS.map(c=>[c.key,'']));
export const hasFilters=f=>Object.values(f??{}).some(Boolean);
export const countFilters=f=>Object.values(f??{}).filter(Boolean).length;
export const DEFAULT_PREFS=Object.freeze({group:'profession',sort:'name',sortDesc:false,filtersOpen:false,filters:emptyFilters()});

const label=(list,v)=>list.find(x=>x.value===v)?.label??v;
const TIER_RANK=new Map(TIERS.map((t,i)=>[t,i]));
const typeLabel=t=>{const s=String(t??'').trim();return s?s[0].toUpperCase()+s.slice(1).replace(/([a-z])([A-Z])/g,'$1 $2'):'';};
const textOf=x=>typeof x==='string'?x:(x&&typeof x==='object'?String(x.name??x.label??x.key??''):'');

/**
 * The facts a recipe is listed by. `recipe` is a normalized recipe; ctx gives what only the window can read:
 * {professionName, known:[{id,name}], found:[{id,name}], makesType (the result Item's type, or ''), resultName, ingredientNames:[], released (bool)}.
 */
export function describeRecipe(recipe,ctx={}){
  const known=uniqueBy(ctx.known??[]),found=uniqueBy(ctx.found??[]);
  const profession=String(ctx.professionName??recipe?.profession??'').trim()||'Unassigned profession';
  const tools=[recipe?.tool,...(Array.isArray(recipe?.tools)?recipe.tools:[])].map(textOf).filter(Boolean);
  const workstation=String(recipe?.workstation??'').trim();
  const requirement=tools.length&&workstation?'both':tools.length?'tool':workstation?'workstation':'neither';
  const tier=recipeTierName(recipe)??'';
  const kind=recipe?.gmApplied?'enchantment':recipe?.kind==='activity'?'activity':'craft';
  const discipline=categoryOfKey(recipeProfessionKey(recipe))??'';
  const makes=kind==='craft'?(ctx.makesType?typeLabel(ctx.makesType):(recipe?.resultItemId?'Not imported yet':'')):'';
  const out={id:recipe?.id??'',name:String(recipe?.name??''),profession,discipline,tier,tierRank:tier?TIER_RANK.get(tier):TIERS.length,
    starting:recipe?.starting===true,requirement,kind,makes,released:ctx.released!==false,known,found,knownCount:known.length,
    foundOnly:found.filter(f=>!known.some(k=>k.id===f.id)),partySize:Number(ctx.partySize)||0,ref:recipe};
  out.search=[out.name,profession,label(DISCIPLINES,discipline),tier,makes,label(KINDS,kind),ctx.resultName,...(ctx.ingredientNames??[]),...tools,workstation,
    recipe?.description,recipe?.effectNote,...known.map(k=>k.name)].filter(Boolean).join('\n').toLowerCase();
  return out;
}
function uniqueBy(list){const seen=new Set();return list.filter(x=>x&&!seen.has(x.id)&&seen.add(x.id));}

export const matchesQuery=(text,query)=>String(query??'').toLowerCase().split(/\s+/).filter(Boolean).every(t=>text.includes(t));

const test={
  profession:(r,v)=>r.profession===v,
  discipline:(r,v)=>v===NONE?!r.discipline:r.discipline===v,
  tier:(r,v)=>v===NONE?!r.tier:r.tier===v,
  known:(r,v)=>v==='any'?r.knownCount>0:v==='none'?r.knownCount===0:v==='all'?r.partySize>0&&r.knownCount>=r.partySize:v==='found'?r.foundOnly.length>0:true,
  player:(r,v)=>r.known.some(k=>k.id===v),
  starting:(r,v)=>(v==='yes')===r.starting,
  requirement:(r,v)=>r.requirement===v,
  makes:(r,v)=>v===NONE?!r.makes:r.makes===v,
  kind:(r,v)=>r.kind===v,
  visibility:(r,v)=>(v==='released')===r.released
};
/** Rows that pass every filter (AND), optionally ignoring one so a dropdown can count its own alternatives. */
export function applyFilters(rows,filters,except=null){
  const active=Object.entries(filters??{}).filter(([k,v])=>v&&k!==except&&test[k]);
  return active.length?rows.filter(r=>active.every(([k,v])=>test[k](r,v))):rows;
}
const countBy=(rows,keysOf)=>{const m=new Map();for(const r of rows)for(const k of new Set(keysOf(r)))m.set(k,(m.get(k)??0)+1);return m;};
const byLabel=(a,b)=>compareText(a.label,b.label);
/** Options for each dropdown with counts: {key: [{value,label,count}]}. Counts follow the other active filters. `party` is [{id,name}]. */
export function filterOptions(rows,filters,{party=[]}={}){
  const base=k=>applyFilters(rows,filters,k),opts={};
  const fixed=(key,list)=>{const b=base(key);return list.map(o=>({...o,count:b.filter(r=>test[key](r,o.value)).length}));};
  const profs=countBy(base('profession'),r=>[r.profession]);// every profession in the list stays offered, with a count of 0 when the other filters leave none
  opts.profession=[...new Set(rows.map(r=>r.profession))].sort(compareText).map(k=>({value:k,label:k,count:profs.get(k)??0}));
  opts.discipline=fixed('discipline',DISCIPLINES);
  const noDisc=base('discipline').filter(r=>!r.discipline).length;if(noDisc)opts.discipline.push({value:NONE,label:'No discipline',count:noDisc});
  const tiers=base('tier');
  opts.tier=TIERS.map(t=>({value:t,label:t,count:tiers.filter(r=>r.tier===t).length}));
  const noTier=tiers.filter(r=>!r.tier).length;if(noTier)opts.tier.push({value:NONE,label:'No tier',count:noTier});
  opts.known=fixed('known',KNOWN_FILTERS);
  const players=countBy(base('player'),r=>r.known.map(k=>k.id));
  opts.player=[...party].sort((a,b)=>compareText(a.name,b.name)).map(p=>({value:p.id,label:p.name,count:players.get(p.id)??0}));
  opts.starting=fixed('starting',STARTING);
  opts.requirement=fixed('requirement',REQUIREMENTS);
  const makes=countBy(base('makes'),r=>[r.makes||NONE]);
  opts.makes=[...makes].filter(([k])=>k!==NONE).sort((a,b)=>compareText(a[0],b[0])).map(([k,n])=>({value:k,label:k,count:n}));
  if(makes.has(NONE))opts.makes.push({value:NONE,label:'Makes nothing',count:makes.get(NONE)});
  opts.kind=fixed('kind',KINDS);
  opts.visibility=fixed('visibility',VISIBILITY);
  return opts;
}

const byName=(a,b)=>compareText(a.name,b.name);
/** Row comparator. `desc` flips the main key only; ties always fall back to name A-Z. */
export function comparator(sort='name',desc=false){
  const dir=desc?-1:1;
  if(sort==='name')return (a,b)=>dir*byName(a,b);
  if(sort==='profession')return (a,b)=>dir*compareText(a.profession,b.profession)||byName(a,b);
  if(sort==='tier')return (a,b)=>dir*(a.tierRank-b.tierRank)||byName(a,b);
  if(sort==='known')return (a,b)=>dir*(a.knownCount-b.knownCount)||byName(a,b);
  return (a,b)=>dir*byName(a,b);
}

/** Groups of already-sorted rows: [{key,label,rows}]. Under Known by (character) a recipe appears under every character who knows it. */
export function groupRows(rows,mode,{party=[]}={}){
  if(mode==='none')return rows.length?[{key:'',label:'',rows}]:[];
  const groups=new Map(),put=(key,lbl,r)=>{if(!groups.has(key))groups.set(key,{key,label:lbl,rows:[]});groups.get(key).rows.push(r);};
  for(const r of rows){
    if(mode==='tier')put(r.tier||NONE,r.tier||'No tier',r);
    else if(mode==='discipline')put(r.discipline||NONE,r.discipline?label(DISCIPLINES,r.discipline):'No discipline',r);
    else if(mode==='player'){if(r.known.length)r.known.forEach(k=>put(k.id,k.name,r));else put(NONE,'Known by nobody',r);}
    else put(r.profession,r.profession,r);
  }
  const rank=mode==='tier'?k=>k===NONE?99:TIERS.indexOf(k):mode==='discipline'?k=>k===NONE?99:DISCIPLINES.findIndex(d=>d.value===k):null;
  return [...groups.values()].sort((a,b)=>(a.key===NONE)-(b.key===NONE)||(rank?rank(a.key)-rank(b.key):0)||compareText(a.label,b.label));
}

/** Saved choices read back safely: unknown values fall back to the defaults, filter values must be strings. */
export function cleanPrefs(raw){
  const p=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const filters=emptyFilters();
  for(const k of Object.keys(filters))if(typeof p.filters?.[k]==='string')filters[k]=p.filters[k].slice(0,120);
  return {group:GROUP_MODES.some(g=>g.value===p.group)?p.group:DEFAULT_PREFS.group,sort:SORTS.some(s=>s.value===p.sort)?p.sort:DEFAULT_PREFS.sort,
    sortDesc:p.sortDesc===true,filtersOpen:p.filtersOpen===true,filters};
}

/**
 * The list as data. rows: facts from describeRecipe. options: {gm, query, filters, sort, sortDesc, group, party:[{id,name}]}.
 * GM only (throws otherwise). Returns {total, shown, filtering, empty:''|'none'|'no-match', rows, groups, controls, ...the cleaned choices}.
 */
export function buildCatalogModel(rows,{gm=false,query='',filters={},sort='name',sortDesc=false,group='profession',party=[]}={}){
  if(gm!==true)throw Error('Only the GM can use the recipe catalog list');
  const q=String(query??'').trim(),f=cleanPrefs({filters}).filters;
  const key=SORTS.some(s=>s.value===sort)?sort:'name',mode=GROUP_MODES.some(g=>g.value===group)?group:'profession',desc=sortDesc===true;
  const searched=q?rows.filter(r=>matchesQuery(r.search,q)):rows;
  const shown=applyFilters(searched,f).slice().sort(comparator(key,desc));
  const options=filterOptions(searched,f,{party});
  return {total:rows.length,shown:shown.length,filtering:hasFilters(f)||!!q,empty:shown.length?'':rows.length?'no-match':'none',query:q,
    rows:shown,groups:groupRows(shown,mode,{party}),filters:f,sort:key,sortDesc:desc,group:mode,
    controls:{search:{placeholder:'Search name, profession, makes, ingredients, who knows it…'},
      filters:FILTER_CONTROLS.map(c=>({...c,value:f[c.key],options:options[c.key]})),
      sorts:SORTS.map(s=>({...s})),groups:GROUP_MODES.map(g=>({...g}))}};
}
/** A plain, id-and-name-only copy of the model for the API: no recipe objects, no search text. */
export function plainModel(model){
  const row=r=>({id:r.id,name:r.name,profession:r.profession,discipline:r.discipline,tier:r.tier,kind:r.kind,starting:r.starting,requirement:r.requirement,makes:r.makes,
    released:r.released,knownBy:r.known.map(k=>({id:k.id,name:k.name})),knownCount:r.knownCount});
  return {total:model.total,shown:model.shown,filtering:model.filtering,empty:model.empty,query:model.query,filters:{...model.filters},sort:model.sort,sortDesc:model.sortDesc,
    group:model.group,rows:model.rows.map(row),groups:model.groups.map(g=>({key:g.key,label:g.label,rows:g.rows.map(r=>r.id)})),
    controls:{filters:model.controls.filters.map(c=>({key:c.key,label:c.label,all:c.all,value:c.value,options:c.options.map(o=>({...o}))})),
      sorts:model.controls.sorts,groups:model.controls.groups}};
}

/* ---- markup (pure; the caller passes esc) ---- */
const defaultEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/**
 * The second toolbar row opened by the Filters (n) chip: the filters with counts, Sort by with its direction button, Group by and Clear filters.
 * Same classes and attributes as the Locations filter row (the kit's .ag-toolbar / .ag-field--inline).
 */
export function filterRowHtml(model,{esc=defaultEsc}={}){
  const sel=c=>`<label class="ag-field ag-field--inline agl-ctl"><span>${esc(c.label)}</span><select data-agl-filter="${esc(c.key)}" aria-label="Filter by ${esc(c.label.toLowerCase())}"><option value="">${esc(c.all)}</option>${c.options.map(o=>
    `<option value="${esc(o.value)}" ${c.value===o.value?'selected':''}>${esc(o.label)} (${o.count})</option>`).join('')}</select></label>`;
  const plain=(id,text,list,cur)=>`<label class="ag-field ag-field--inline agl-ctl"><span>${text}</span><select data-agl-${id} aria-label="${text}">${list.map(m=>`<option value="${esc(m.value)}" ${cur===m.value?'selected':''}>${esc(m.label)}</option>`).join('')}</select></label>`;
  const dir=model.sortDesc?'Descending (click for ascending)':'Ascending (click for descending)';
  return `<div class="ag-toolbar agl-filter-row" id="agl-catalog-filters"><div class="ag-toolbar__filters agl-filters" role="group" aria-label="Filter, sort and group the recipes">
    ${model.controls.filters.map(sel).join('')}
    ${plain('sort','Sort by',model.controls.sorts,model.sort)}<button type="button" class="ag-btn ag-btn--icon" data-action="catalog-sortdir" aria-label="Sort direction: ${model.sortDesc?'descending':'ascending'}" data-tooltip="${esc(dir)}"><i class="fa-solid ${model.sortDesc?'fa-arrow-down-wide-short':'fa-arrow-up-short-wide'}" aria-hidden="true"></i></button>
    ${plain('group','Group by',model.controls.groups,model.group)}
    ${model.filtering?`<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="catalog-clear"><i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i> Clear filters</button>`:''}</div></div>`;
}
/** The Filters (n) chip: n counts the filters in use (not the search text). */
export function filtersChipHtml(model,open,{esc=defaultEsc}={}){
  const n=countFilters(model.filters);
  return `<button type="button" class="ag-chip" data-action="catalog-filters" aria-pressed="${open}" aria-expanded="${open}" aria-controls="agl-catalog-filters" data-tooltip="Filter, sort and group the recipes"><i class="fa-solid fa-filter" aria-hidden="true"></i> Filters${n?` (${n})`:''}</button>`;
}
/** The empty state: no recipes at all, or nothing matches (with Clear filters). */
export function emptyHtml(model){
  if(model.empty==='none')return `<div class="ag-empty"><p class="ag-empty__title">No recipes in this world yet.</p><p class="ag-empty__text">Import recipes with General Manager.</p></div>`;
  return `<div class="ag-empty agl-no-matches"><p class="ag-empty__title">No recipes match.</p><p class="ag-empty__text">Change the search or the filters to see more.</p>
    <button type="button" class="ag-btn ag-btn--sm" data-action="catalog-clear"><i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i> Clear filters</button></div>`;
}
/** Recipes per chunk when a long list fills in after the window opens. */
export const LAZY_CHUNK=30;
const chunksOf=(rows,make)=>{const out=[];for(let i=0;i<rows.length;i+=LAZY_CHUNK){const part=rows.slice(i,i+LAZY_CHUNK);out.push(()=>part.map(make).join(''));}return out.length?out:[()=>''];};
/**
 * Groups other than Profession as plain folders (Profession keeps the profession folders with tier groups from catalog-tree.mjs).
 * rowHtml(row, group) gives one recipe's markup. isOpen(key, fallback) is the remembered open state.
 * 0.41.0 lazy(key, build): when given, no recipe markup is built here. Each folder (and the ungrouped list, key "list") is emitted empty and
 * `build()` gives its markup as a list of functions (one per chunk of recipes), to be filled when the folder is open (after the window shows) or when it is opened. A folder is found by its data-tree key.
 */
export function groupFoldersHtml(groups,mode,{rowHtml,isOpen=(k,d)=>d,esc=defaultEsc,lazy=null}={}){
  if(mode==='none'){
    if(!lazy)return groups.map(g=>g.rows.map(r=>rowHtml(r,g)).join('')).join('');
    return groups.map(g=>{lazy('list',()=>chunksOf(g.rows,r=>rowHtml(r,g)));return `<div class="agl-lazy-list" data-lazy="list">${lazyNote(true)}</div>`;}).join('');
  }
  return groups.map(g=>{
    const slug=String(g.key).replace(/[^a-zA-Z0-9]+/g,'-')||'x',name=`${mode}-${slug}`,k=`p:${name}`,open=isOpen(k,true);
    let body;
    if(lazy){lazy(k,()=>chunksOf(g.rows,r=>rowHtml(r,g)));body=lazyNote(open);}else body=g.rows.map(r=>rowHtml(r,g)).join('');
    return `<details class="agl-folder agl-tree-folder agl-group-folder" data-folder="${esc(name)}" data-tree="${esc(k)}" data-stored-open="${open?1:0}" data-total="${g.rows.length}" ${open?'open':''}>
    <summary><i class="fa-solid fa-folder-open" aria-hidden="true"></i> <strong>${esc(g.label)}</strong> <span class="ag-badge" data-folder-count>${g.rows.length}</span></summary>
    <div class="agl-folder-body">${body}</div></details>`;
  }).join('');
}
