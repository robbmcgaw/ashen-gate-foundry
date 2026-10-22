// Factions tab (GM-only) logic: roster rows, chips, filter, sort, group, editor sub-tabs and display labels. No Foundry globals.
import {objectiveRefs} from './objective-refs.mjs';
import {OTHER_FOLDER} from './core.mjs';
export const CHIPS=Object.freeze(['Hidden','Characters only','Revealed to party']);
export const SORTS=Object.freeze([['name','Name A-Z'],['status','Visibility'],['renown','Group Renown (high first)'],['folder','Folder']]);
export const GROUPS=Object.freeze([['status','Visibility'],['folder','Folder'],['none','No grouping']]);
export const DEFAULT_VIEW=Object.freeze({search:'',status:'all',sort:'name',group:'status',kind:'faction'});
// The roster lists factions or deities (FR-04: deities are authored here too, not in the Pantheon view).
export const KINDS=Object.freeze([['faction','Factions'],['deity','Deities']]);
/** Group and sort options per kind: deities have no folders, so "Folder" becomes their rank (Major or Lesser). */
export const groupsFor=kind=>kind==='deity'?[['status','Visibility'],['folder','Rank'],['none','No grouping']]:GROUPS;
export const sortsFor=kind=>kind==='deity'?[['name','Name A-Z'],['status','Visibility'],['folder','Rank']]:SORTS;
// Discovery is campaign state on the faction; party wins over per-character reveals.
export function visibilityChip(faction){
 const d=faction?.discovery??{};
 if(d.party)return 'Revealed to party';
 return (d.actors??[]).length?'Characters only':'Hidden';
}
/** Kit badge modifier for a visibility chip: Revealed ok, Characters only accent, Hidden plain. */
export function chipBadge(chip){return chip==='Revealed to party'?'ag-badge--ok':chip==='Characters only'?'ag-badge--accent':'';}
/** One row per faction: everything the GM roster shows, hidden or not. */
export function orgRow({faction,score=0,rank='',folderName=''}){
 const d=faction.discovery??{};
 const row={id:faction.id,name:faction.name||faction.id,leader:faction.leader||'',tags:[...(faction.tags??[])],
  chip:visibilityChip(faction),badgeClass:chipBadge(visibilityChip(faction)),characters:(d.actors??[]).length,placeholder:Boolean(d.placeholder),
  selective:faction.field_reveals?.mode==='selective',score:Number(score)||0,rank:rank||'',
  folder:folderName||OTHER_FOLDER,objectives:objectiveRefs(faction).length};
 // Lower-case text the search box matches, so the window can filter rows as you type without re-rendering.
 row.search=[row.name,row.id,row.leader,row.chip,row.folder,row.rank,...row.tags].join('\n').toLowerCase();
 return row;
}
/** Whether search text q matches a row's search text (case-insensitive substring). */
export const searchMatches=(haystack,q)=>{const t=String(q??'').trim().toLowerCase();return !t||String(haystack??'').includes(t);};
export function filterRows(rows,v={}){
 const f={...DEFAULT_VIEW,...v};
 return rows.filter(r=>(f.status==='all'||r.chip===f.status)&&searchMatches(r.search??[r.name,r.id].join('\n').toLowerCase(),f.search));
}
const byName=(a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
export function sortRows(rows,sort='name'){
 const cmp={name:byName,status:(a,b)=>CHIPS.indexOf(a.chip)-CHIPS.indexOf(b.chip)||byName(a,b),
  renown:(a,b)=>b.score-a.score||byName(a,b),folder:(a,b)=>a.folder.localeCompare(b.folder)||byName(a,b)}[sort]||byName;
 return [...rows].sort(cmp);
}
/** [{key,label,rows}]; empty groups are dropped. */
export function groupRows(rows,group='status',kind='faction'){
 if(group==='none')return rows.length?[{key:'all',label:kind==='deity'?'All deities':'All factions',rows}]:[];
 const keyOf=r=>group==='folder'?r.folder:r.chip;
 const keys=group==='folder'?[...new Set(rows.map(keyOf))]:CHIPS;
 return keys.map(k=>({key:k,label:k,rows:rows.filter(r=>keyOf(r)===k)})).filter(g=>g.rows.length);
}
export function listOrgsTab(rows,view={}){
 const f={...DEFAULT_VIEW,...view},shown=sortRows(filterRows(rows,f),f.sort);
 return {total:rows.length,shown:shown.length,groups:groupRows(shown,f.group,f.kind)};
}
/** Plural with the count: plural(1,'character') → "1 character", plural(2,'deity','deities') → "2 deities". */
export const plural=(n,one,many=`${one}s`)=>`${n} ${n===1?one:many}`;
// Editor sub-tabs (FR-01, FR-04). One level only; each draft tab (Profile, Visibility) has its own pinned footer.
export const FACTION_TABS=Object.freeze([{id:'profile',label:'Profile'},{id:'visibility',label:'Visibility'},{id:'information',label:'Information'},{id:'rewards',label:'Rewards'},{id:'requests',label:'Requests'},{id:'links',label:'Links'}]);
export const DEITY_TABS=Object.freeze([{id:'profile',label:'Profile'},{id:'visibility',label:'Visibility'},{id:'lore',label:'Lore'},{id:'rewards',label:'Rewards'},{id:'requests',label:'Requests'},{id:'relations',label:'Relations'}]);
export const DRAFT_TABS=Object.freeze(['profile','visibility']);
/** The sub-tab list for a kind with the open-request count on Requests, and the selected id (falls back to Profile). */
export function editorTabs(kind,selected,requestCount=0){
 const tabs=(kind==='deity'?DEITY_TABS:FACTION_TABS).map(t=>t.id==='requests'&&requestCount?{...t,count:requestCount}:{...t});
 return {tabs,selected:tabs.some(t=>t.id===selected)?selected:'profile'};
}
// Display labels for stored tokens (no raw tokens in the UI).
const UNLOCKS={manual:'Revealed by the GM',group_renown:'Unlocks with group Renown',individual_renown:'Unlocks with personal standing'};
export const unlockLabel=(unlock,threshold,unit='Renown')=>`${UNLOCKS[unlock]??UNLOCKS.manual}${unlock!=='manual'&&UNLOCKS[unlock]?` at ${Number(threshold)||0} ${unit}`:''}`;
const BEHAVIORS={one_time:'One time',repeatable_service:'Repeatable service',passive:'Passive'};
export const behaviorLabel=b=>BEHAVIORS[b]??BEHAVIORS.one_time;
const RELATIONS={associated_objective:'Associated with',offers_objective:'Offers'};
export const objectiveLabel=(relation,mode)=>`${RELATIONS[relation]??relation} · ${mode==='required'?'Required':'Optional'}`;
/** Link-mode button (FR-07): names what the button does, not the current state. */
export const linkModeAction=mode=>mode==='preview'?'Switch to document link':'Switch to preview';
const REF_STATUS={resolved:'Found in Quest Log',unverified:'Unverified',invalid_ref:'Invalid id'};
export const objectiveStatusLabel=status=>REF_STATUS[status]??'Not found in Quest Log';
/** Discovery button labels (FR-07): the same words for factions, deities and entries. */
export const revealLabel=(known,who)=>`${known?'Hide from':'Reveal to'} ${who}`;
// Actions that author or manage content. GM Setup must never offer these.
export const CONTENT_ACTIONS=Object.freeze(['create','save','award','createFolder','saveFolder','discovery','addEntry','showEntry','addReward','editReward','removeReward','resolveRequest','resetUsage','resetChoice','saveFieldReveals','addObjective','removeObjective','exportAll','saveDeity','addRelation','removeRelation','createDeity']);
// GM Setup saves every setting with one Save Changes (Player Access, damping, group name).
export const SETUP_ACTIONS=Object.freeze(['saveSetup']);
// Demo data loaders and one-off maintenance (FR-06): only in GM Setup's collapsed Developer Tools.
export const DEV_ACTIONS=Object.freeze(['seed','checkRewardIds','fillRewardIds']);
