/**
 * 0.22.0: Tree Library folders, sorting, search and filters, as pure view data (no Foundry globals, no DOM).
 * The GM's Tree Library and the players' Tree select both use classifyTree(), so a tree sits in the same folder for everyone.
 * Nothing here decides who may see a tree: the caller passes only the trees that person is allowed to see
 * (the GM's private layouts, or the published player snapshot).
 */
import {asArray,groupName,memberName} from './engine.mjs';
import {professionGroups} from './groups.mjs';
import {fold} from './ag-html.mjs';

/** Folders by type, in the order they are listed. */
export const CATEGORIES=Object.freeze([
  {key:'crafting',label:'Crafting professions'},
  {key:'gathering',label:'Gathering professions'},
  {key:'creative',label:'Creative professions'},
  {key:'cinder',label:'Cinder powers'},
  {key:'other',label:'Other trees'},
  {key:'test',label:'Test trees'}
]);
const CATEGORY_LABEL=Object.freeze(Object.fromEntries(CATEGORIES.map(c=>[c.key,c.label])));
export const categoryLabel=key=>CATEGORY_LABEL[key]??CATEGORY_LABEL.other;

// A profession tree names its profession in sourceRef (PROF-ALCHEMY, PROF-TEST-ALCHEMY ...) and in its name. Word starts are matched
// so "PROF-TG-HERBALISM" and "Herbalism · Prototype" both read as gathering. Same split as the Profession Ledger's gathering list.
const GATHERING=['archaeolog','fishing','herb','mining','hunting','skinning'];
const CRAFTING=['alchem','blacksmith','smith','cooking','engineer','enchant','inscription','jewel','leatherwork','tailor'];
const CREATIVE=['artistry'];
const wordsOf=text=>String(text??'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const hasWord=(words,starts)=>words.some(w=>starts.some(s=>w.startsWith(s)));
const TEST_NAME=/\[(ag )?(qa|test)\]|prototype|\bdemo\b/i;
const TEST_ID=/^(DEMO|TEST|QA)-/;
const TEST_REF=/^(PROF|MUT)-(TEST|QA|DEMO)(-|$)/;

/** Why a tree is a test or demo tree: status "test", a [TEST]/[QA]/Prototype/Demo name, or a test-style id or source. */
export function isTestTree(tree) {
  return tree?.status==='test'||TEST_NAME.test(String(tree?.name??''))||TEST_ID.test(String(tree?.id??''))||TEST_REF.test(String(tree?.sourceRef??''));
}
/** Folder key of a tree: test | cinder | crafting | gathering | creative | other. Derived from existing fields only; nothing is stored. */
export function classifyTree(tree) {
  if(isTestTree(tree))return 'test';
  const kind=tree?.provider?.kind;
  if(kind==='cinder_milestone')return 'cinder';
  if(kind==='profession'){
    const words=[...wordsOf(tree.sourceRef).filter(w=>w!=='prof'),...wordsOf(tree.name)];
    if(hasWord(words,GATHERING))return 'gathering';
    if(hasWord(words,CRAFTING))return 'crafting';
    if(hasWord(words,CREATIVE))return 'creative';
  }
  return 'other';
}

/** Lowest and highest level a tree asks for, from its perks' levels, or null when none is recorded. */
export function levelRange(tree) {
  const levels=asArray(tree?.nodes).map(n=>Number.isSafeInteger(n?.requiredLevel)?n.requiredLevel:n?.minLevel).filter(Number.isSafeInteger);
  return levels.length?{min:Math.min(...levels),max:Math.max(...levels)}:null;
}
const levelText=r=>!r?'':r.min===r.max?`Level ${r.min}`:`Levels ${r.min}–${r.max}`;

const KIND_TEXT={profession:'Profession',cinder_milestone:'Cinder',generic_points:'Generic points'};
const STATUS_TEXT={draft:'Draft',test:'Test',approved:'Approved'};
const STATUS_ORDER={approved:0,test:1,draft:2};
const VISIBILITY_TEXT={player:'Player-visible',gm:'GM only'};

/** One Tree Library row from a stored tree (resolve the tree first if the level range should include perk tiers). */
export function libraryRow(tree,selectedId=null) {
  const n=asArray(tree?.nodes).length,range=levelRange(tree),category=classifyTree(tree);
  const status=STATUS_TEXT[tree?.status]?tree.status:'draft',visibility=tree?.visibility==='player'?'player':'gm';
  const name=String(tree?.name||'Unnamed tree'),kind=KIND_TEXT[tree?.provider?.kind]??KIND_TEXT.generic_points;
  return {id:tree.id,name,sourceRef:tree?.provider?.kind==='profession'?tree.sourceRef??null:null,category,kind,
    nodeCount:n,nodeText:`${n} perk${n===1?'':'s'}`,level:range,levelText:levelText(range),
    status,statusText:STATUS_TEXT[status],visibility,visibilityText:VISIBILITY_TEXT[visibility],
    updatedAt:typeof tree?.updatedAt==='string'&&!Number.isNaN(Date.parse(tree.updatedAt))?tree.updatedAt:null,
    selected:tree.id===selectedId,
    search:`${name} ${kind} ${categoryLabel(category)} ${STATUS_TEXT[status]} ${VISIBILITY_TEXT[visibility]}`.toLowerCase()};
}

// ---- sorting ----
export const SORTS=Object.freeze([
  {id:'name',label:'Name A–Z'},
  {id:'name-desc',label:'Name Z–A'},
  {id:'level',label:'Level range, lowest first'},
  {id:'edited',label:'Recently edited'},
  {id:'perks',label:'Most perks'},
  {id:'status',label:'Release status'}
]);
export const GROUPS=Object.freeze([
  {id:'type',label:'Type'},{id:'status',label:'Release status'},{id:'visibility',label:'Visibility'},{id:'none',label:'No folders'}
]);
const nameCmp=(a,b)=>String(a.name).localeCompare(String(b.name),undefined,{sensitivity:'base',numeric:true});
const nullLast=(x,y,cmp)=>x===null&&y===null?0:x===null?1:y===null?-1:cmp(x,y);
const COMPARE={
  name:nameCmp,
  'name-desc':(a,b)=>nameCmp(b,a),
  level:(a,b)=>nullLast(a.level,b.level,(x,y)=>x.min-y.min||x.max-y.max)||nameCmp(a,b),
  edited:(a,b)=>nullLast(a.updatedAt,b.updatedAt,(x,y)=>Date.parse(y)-Date.parse(x))||nameCmp(a,b),
  perks:(a,b)=>b.nodeCount-a.nodeCount||nameCmp(a,b),
  status:(a,b)=>STATUS_ORDER[a.status]-STATUS_ORDER[b.status]||nameCmp(a,b)
};
export const validSort=id=>SORTS.some(s=>s.id===id)?id:'name';
export const validGroup=id=>GROUPS.some(g=>g.id===id)?id:'type';
export const sortRows=(rows,sort='name')=>[...asArray(rows)].sort(COMPARE[validSort(sort)]);

// ---- search and filters ----
export const EMPTY_FILTERS=Object.freeze({category:'all',status:'all',visibility:'all'});
/** Clean filters: unknown values read as "all". */
export function cleanFilters(f={}) {
  return {category:CATEGORY_LABEL[f?.category]?f.category:'all',status:STATUS_TEXT[f?.status]?f.status:'all',visibility:VISIBILITY_TEXT[f?.visibility]?f.visibility:'all'};
}
/** How many filters are on: the n in "Filters (n)". The search box is not counted. */
export const activeFilterCount=f=>Object.values(cleanFilters(f)).filter(v=>v!=='all').length;
/** Rows matching the search text (every word) and every filter. */
export function filterRows(rows,{query='',filters=EMPTY_FILTERS}={}) {
  const words=String(query??'').trim().toLowerCase().split(/\s+/).filter(Boolean),f=cleanFilters(filters);
  return asArray(rows).filter(r=>words.every(w=>r.search.includes(w))
    &&(f.category==='all'||r.category===f.category)&&(f.status==='all'||r.status===f.status)&&(f.visibility==='all'||r.visibility===f.visibility));
}

// ---- folders ----
const FOLDERS={
  type:()=>CATEGORIES.map(c=>({key:c.key,label:c.label})),
  status:()=>['approved','test','draft'].map(k=>({key:k,label:STATUS_TEXT[k]})),
  visibility:()=>['player','gm'].map(k=>({key:k,label:VISIBILITY_TEXT[k]}))
};
const folderOf={type:r=>r.category,status:r=>r.status,visibility:r=>r.visibility};

/** Stable per-user key of a folder's open/closed state (the kit stores it as "fold:<key>"). */
export const libraryFoldKey=(groupBy,folderKey)=>`lib:${validGroup(groupBy)}:${folderKey}`;

/**
 * Units inside one folder: a single tree, or a profession with several trees (heading + shared wallet line). A group lists only the
 * rows passed in, so a search can show some of its trees. names: sourceRef → {name, multi} from professionGroups() of all trees.
 */
function unitsOf(rows,groups,sort,walletText) {
  const cmp=COMPARE[validSort(sort)],units=[],byRef=new Map();
  for(const r of sortRows(rows,sort)){
    const g=r.sourceRef?groups.get(r.sourceRef):null;
    if(!g?.multi){units.push({type:'tree',row:r});continue;}
    let u=byRef.get(r.sourceRef);
    if(!u){u={type:'group',key:r.sourceRef,name:g.name,countText:`${g.size} trees`,walletText:walletText({sourceRef:r.sourceRef,size:g.size}),rows:[]};byRef.set(r.sourceRef,u);units.push(u);}
    u.rows.push({...r,memberName:memberName({name:r.name},g.name)});
  }
  const rep=u=>u.type==='tree'?u.row:{...u.rows[0],name:u.name};
  return units.sort((a,b)=>cmp(rep(a),rep(b)));
}
/**
 * The whole library view: folders with counts, ready to render.
 * trees: the stored trees this person may see (resolved or not). Options: query, filters, sort, groupBy, selectedId,
 * walletText({sourceRef,size}) for a profession with several trees. Empty folders are left out (a folder with no tree, or none left
 * after the search and filters); "No folders" gives one flat list.
 */
export function buildLibrary(trees,{query='',filters=EMPTY_FILTERS,sort='name',groupBy='type',selectedId=null,walletText=()=>''}={}) {
  const list=asArray(trees),rows=list.map(t=>libraryRow(t,selectedId));
  const groups=new Map(professionGroups(list.filter(t=>t?.provider?.kind==='profession')).filter(g=>g.sourceRef)
    .map(g=>[g.sourceRef,{name:g.multi?groupName(g.trees):g.name,multi:g.multi,size:g.trees.length}]));
  const shown=filterRows(rows,{query,filters}),gb=validGroup(groupBy);
  const filtering=Boolean(String(query??'').trim())||activeFilterCount(filters)>0;
  let folders;
  if(gb==='none')folders=shown.length?[{key:'all',label:'All trees',count:shown.length,total:rows.length,units:unitsOf(shown,groups,sort,walletText)}]:[];
  else folders=FOLDERS[gb]().map(f=>{
    const inFolder=rows.filter(r=>folderOf[gb](r)===f.key),match=shown.filter(r=>folderOf[gb](r)===f.key);
    return {...f,count:match.length,total:inFolder.length,units:unitsOf(match,groups,sort,walletText)};
  }).filter(f=>f.count>0);
  return {total:rows.length,shown:shown.length,filtering,groupBy:gb,sort:validSort(sort),folders,
    empty:rows.length===0,noMatch:rows.length>0&&shown.length===0};
}
export const libraryCountText=(shown,total)=>shown===total?`${total} tree${total===1?'':'s'}`:`${shown} of ${total} trees`;
/** Options for the Group and Sort selects: [{value, label, selected}]. */
export const groupOptions=current=>GROUPS.map(g=>({value:g.id,label:g.label,selected:g.id===validGroup(current)}));
export const sortOptions=current=>SORTS.map(s=>({value:s.id,label:s.label,selected:s.id===validSort(current)}));
export const filtersTitle=f=>{const n=activeFilterCount(f);return n?`Filters (${n})`:'Filters';};

// ---- HTML (every value escaped; names only, ids appear only in data-* attributes) ----
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rowHtml(r,member=false) {
  const label=member?r.memberName:r.name;
  return `<li class="ag-row${member?' agst-library-member':''}${r.selected?' is-selected':''}"${r.selected?' aria-current="true"':''} data-agst-library-row data-tree="${esc(r.id)}">`
    +`<div class="ag-row__main"><div class="ag-row__title">${esc(label)}</div><div class="ag-row__meta">${esc([r.kind,r.nodeText,r.levelText].filter(Boolean).join(' · '))}</div></div>`
    +`<div class="ag-row__end"><span class="ag-badge ${r.status==='approved'?'ag-badge--ok':r.status==='test'?'ag-badge--warn':''}">${esc(r.statusText)}</span>`
    +`<span class="ag-badge ${r.visibility==='player'?'ag-badge--ok':''}">${r.visibility==='player'?'':'<i class="fa-solid fa-eye-slash" aria-hidden="true"></i> '}${esc(r.visibilityText)}</span>`
    +`<button type="button" class="ag-btn ag-btn--sm" data-act="open-row" data-tree="${esc(r.id)}" aria-label="Open ${esc(r.name)}"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Open</button>`
    +`<button type="button" class="ag-btn ag-btn--sm" data-act="export" data-tree="${esc(r.id)}" aria-label="Export ${esc(r.name)}"><i class="fa-solid fa-file-export" aria-hidden="true"></i> Export</button></div></li>`;
}
function unitHtml(u) {
  if(u.type==='tree')return rowHtml(u.row);
  return `<li class="agst-library-group"><div class="agst-library-group__head"><h4 class="agst-library-group__title">${esc(u.name)}</h4><span class="ag-badge">Profession · ${esc(u.countText)}</span></div>`
    +(u.walletText?`<p class="ag-field__hint agst-library-group__wallet">${esc(u.walletText)}</p>`:'')+`</li>${u.rows.map(r=>rowHtml(r,true)).join('')}`;
}
/**
 * The folder list. Folders are kit folds (<details>/<summary>: Tab, Enter and Space work, the open state is announced), never nested.
 * While a search or filter is on, folders render open and are not remembered, so results are never hidden in a closed folder.
 * openByDefault: folders with no remembered state start open (the caller opens all when the library is small).
 */
export function renderLibraryHtml(model,{openByDefault=true}={}) {
  if(model.empty)return `<div class="ag-empty"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i><p class="ag-empty__title">No trees yet</p><p class="ag-empty__text">Create one with New tree, or import a tree file through General Manager → Import.</p></div>`;
  if(model.noMatch)return `<div class="ag-empty"><p class="ag-empty__title">Nothing matches</p><p class="ag-empty__text">No tree matches the search and filters.</p><button type="button" class="ag-btn ag-btn--sm" data-agst-library-clear>Clear search and filters</button></div>`;
  if(model.groupBy==='none')return `<ul class="ag-rows">${model.folders[0].units.map(unitHtml).join('')}</ul>`;
  return model.folders.map(f=>fold({
    key:model.filtering?undefined:libraryFoldKey(model.groupBy,f.key),
    title:f.label,count:f.count===f.total?String(f.total):`${f.count} of ${f.total}`,
    open:model.filtering||openByDefault||f.units.some(u=>u.type==='tree'?u.row.selected:u.rows.some(r=>r.selected)),
    body:`<ul class="ag-rows">${f.units.map(unitHtml).join('')}</ul>`})).join('');
}

const optionsHtml=(items,current)=>items.map(([v,l])=>`<option value="${esc(v)}"${v===current?' selected':''}>${esc(l)}</option>`).join('');
/** The "Filters (n)" disclosure: Type, Release status and Visibility selects and Clear filters. Not inside another fold. */
export function renderFiltersFold(filters,{open=false}={}) {
  const f=cleanFilters(filters),all=['all','Any'];
  const body=`<div class="agst-library-filters"><label class="ag-field">Type<select data-agst-library-filter="category" aria-label="Filter by type">${optionsHtml([all,...CATEGORIES.map(c=>[c.key,c.label])],f.category)}</select></label>`
    +`<label class="ag-field">Release status<select data-agst-library-filter="status" aria-label="Filter by release status">${optionsHtml([all,...Object.entries(STATUS_TEXT)],f.status)}</select></label>`
    +`<label class="ag-field">Visibility<select data-agst-library-filter="visibility" aria-label="Filter by visibility">${optionsHtml([all,...Object.entries(VISIBILITY_TEXT)],f.visibility)}</select></label>`
    +`<button type="button" class="ag-btn ag-btn--sm" data-agst-library-clear-filters>Clear filters</button></div>`;
  return fold({key:'lib-filters',title:filtersTitle(f),open,body});
}

// ---- players: the same folders for the Tree select ----
/**
 * Splits the Tree select's options into labelled groups (optgroups) in folder order, each sorted by name.
 * options: treePicker().options; trees: the published trees the player can see. One group or none: returns null (flat select).
 */
export function pickerGroups(options,trees) {
  const byId=new Map(asArray(trees).map(t=>[t.id,t])),buckets=new Map();
  for(const o of asArray(options)){
    const key=classifyTree(byId.get(o.value)??{});
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(o);
  }
  if(buckets.size<2)return null;
  return CATEGORIES.filter(c=>buckets.has(c.key)).map(c=>({label:c.label,options:buckets.get(c.key).sort((a,b)=>nameCmp({name:a.label},{name:b.label}))}));
}
