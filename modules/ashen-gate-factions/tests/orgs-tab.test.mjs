import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeFaction,revealField,fieldDisclosure,projectedFolders} from '../scripts/core.mjs';
import {addObjectiveRef} from '../scripts/objective-refs.mjs';
import {orgRow,visibilityChip,chipBadge,listOrgsTab,searchMatches,editorTabs,groupsFor,sortsFor,plural,unlockLabel,behaviorLabel,objectiveLabel,objectiveStatusLabel,linkModeAction,revealLabel,CONTENT_ACTIONS,SETUP_ACTIONS,DEV_ACTIONS,CHIPS} from '../scripts/orgs-tab.mjs';
const raw=readFileSync(new URL('../templates/dashboard.hbs',import.meta.url),'utf8');
// Inline partials ({{#*inline}} at the top) are expanded where they are used, so sections are checked as rendered.
const partials=new Map([...raw.matchAll(/\{\{#\*inline "(\w+)"\}\}([\s\S]*?)\{\{\/inline\}\}/g)].map(m=>[m[1],m[2]]));
const expand=t=>{for(let i=0;i<3;i++)t=t.replace(/\{\{> (\w+)[^}]*\}\}/g,(_,n)=>partials.get(n)??'');return t;};
const template=expand(raw.replace(/\{\{#\*inline "\w+"\}\}[\s\S]*?\{\{\/inline\}\}\n?/g,''));
const code=readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');
const mk=(n,discovery={})=>{const f=makeFaction({id:`FACTION-TEST-${n}`,trackId:`RENOWN-TEST-${n}`,name:`[TEST] ${n}`});f.discovery={...f.discovery,...discovery};return f;};
const hidden=mk('Hidden'),chars=mk('Chars',{actors:['A1']}),party=mk('Party',{party:true,placeholder:true});
const rows=[hidden,chars,party].map((faction,i)=>orgRow({faction,score:i*5,rank:'Known',folderName:i?'Guilds':''}));
test('GM roster lists every faction, including hidden and character-only ones',()=>{
 const v=listOrgsTab(rows);assert.equal(v.total,3);assert.equal(v.shown,3);
 assert.deepEqual(v.groups.map(g=>g.label),CHIPS);
 assert.equal(visibilityChip(hidden),'Hidden');assert.equal(visibilityChip(chars),'Characters only');assert.equal(visibilityChip(party),'Revealed to party');
});
test('rows carry renown, linked objectives, placeholder and selective flags',()=>{
 const f=addObjectiveRef(mk('Linked'),{relation:'offers_objective',target_id:'QUEST-TEST-001',mode:'optional'});
 f.field_reveals=revealField(fieldDisclosure({mode:'selective'}),'name',{party:true});
 const r=orgRow({faction:f,score:7,rank:'Trusted'});
 assert.equal(r.objectives,1);assert.equal(r.selective,true);assert.equal(r.score,7);assert.equal(r.folder,'Other factions');
 assert.equal(rows[2].placeholder,true);
});
test('search, visibility filter, sort and group work',()=>{
 assert.equal(listOrgsTab(rows,{search:'chars'}).shown,1);
 assert.equal(listOrgsTab(rows,{status:'Hidden'}).shown,1);
 assert.equal(listOrgsTab(rows,{search:'nothing-matches'}).groups.length,0);
 assert.deepEqual(listOrgsTab(rows,{group:'none',sort:'renown'}).groups[0].rows.map(r=>r.score),[10,5,0]);
 assert.deepEqual(listOrgsTab(rows,{group:'folder'}).groups.map(g=>g.label).sort(),['Guilds','Other factions']);
});
test('players do not get hidden factions from the projection',()=>{
 const folders=[{key:'f',name:'F'}];const all=[hidden,chars,party].map(f=>({...f,folder_key:'f'}));
 const shown=projectedFolders({folders,factions:all,actorIds:['A2']}).flatMap(x=>x.known.map(k=>k.id));
 assert.deepEqual(shown,[party.id]);
});
test('GM Setup holds settings only; the Factions tab holds all content actions',()=>{
 const setup=template.slice(template.indexOf('{{#if tabSetup}}\n'));
 const orgs=template.slice(template.indexOf('{{#if tabOrgs}}\n'),template.indexOf('{{#if tabRequests}}\n'));
 const dev=setup.slice(setup.indexOf('<details class="ag-devtools"'),setup.indexOf('</details>'));
 const settings=setup.replace(dev,'');
 for(const a of CONTENT_ACTIONS){assert.ok(!setup.includes(`data-action="${a}"`),`${a} must not be in GM Setup`);}
 for(const a of SETUP_ACTIONS){assert.ok(settings.includes(`data-action="${a}"`));assert.ok(!orgs.includes(`data-action="${a}"`));}
 // Demo loaders and one-off maintenance (Fill in permanent item ids, FR-06) live only in the collapsed Developer Tools.
 for(const a of DEV_ACTIONS){assert.ok(dev.includes(`data-action="${a}"`),`${a} belongs in Developer Tools`);assert.ok(!settings.includes(`data-action="${a}"`));assert.ok(!orgs.includes(`data-action="${a}"`));}
 assert.ok(setup.indexOf('ag-devtools')>setup.indexOf('name="group-name"'),'Developer Tools come last');
 for(const a of ['create','createDeity','exportAll','addObjective','createFolder','saveFolder','resolveRequest','addEntry','addReward','discovery','removeRelation','toggleFolders'])assert.ok(orgs.includes(`data-action="${a}"`),`${a} missing from Factions`);
 assert.ok(orgs.includes('{{{importButton}}}'),'Import is a kit file button in the Factions toolbar');
 assert.match(template,/data-agf-view="orgs"[\s\S]*data-agf-view="requests"[\s\S]*data-agf-view="setup"/);
});
test('editor sub-tabs: one row per kind, Requests carries its count, unknown ids fall back to Profile',()=>{
 assert.deepEqual(editorTabs('faction','links').tabs.map(t=>t.label),['Profile','Visibility','Information','Rewards','Requests','Links']);
 assert.deepEqual(editorTabs('deity','relations').tabs.map(t=>t.label),['Profile','Visibility','Lore','Rewards','Requests','Relations']);
 assert.equal(editorTabs('faction','relations').selected,'profile');assert.equal(editorTabs('deity','lore').selected,'lore');
 assert.equal(editorTabs('faction','profile',3).tabs.find(t=>t.id==='requests').count,3);
 assert.equal(editorTabs('faction','profile',0).tabs.find(t=>t.id==='requests').count,undefined);
 assert.deepEqual(groupsFor('deity').map(g=>g[1]),['Visibility','Rank','No grouping']);assert.ok(sortsFor('faction').some(s=>s[0]==='renown'));assert.ok(!sortsFor('deity').some(s=>s[0]==='renown'));
 assert.equal(listOrgsTab(rows,{group:'none',kind:'deity'}).groups[0].label,'All deities');
});
test('search matches the same text the rows show, case-insensitively',()=>{
 assert.ok(searchMatches(rows[1].search,'CHARS'));assert.ok(searchMatches(rows[1].search,''));assert.ok(!searchMatches(rows[1].search,'zzz'));
 assert.ok(searchMatches(rows[2].search,'revealed to party'),'the visibility chip is searchable');
});
test('labels: no raw tokens; reveal and link buttons say what they do (FR-07); plurals',()=>{
 assert.equal(revealLabel(false,'[TEST] Hero'),'Reveal to [TEST] Hero');assert.equal(revealLabel(true,'party'),'Hide from party');
 assert.equal(linkModeAction('preview'),'Switch to document link');assert.equal(linkModeAction('document'),'Switch to preview');
 assert.equal(unlockLabel('manual',5),'Revealed by the GM');assert.equal(unlockLabel('group_renown',6),'Unlocks with group Renown at 6 Renown');
 assert.equal(unlockLabel('individual_renown',3,'favour'),'Unlocks with personal standing at 3 favour');
 assert.equal(behaviorLabel('repeatable_service'),'Repeatable service');assert.equal(behaviorLabel(undefined),'One time');
 assert.equal(objectiveLabel('offers_objective','required'),'Offers · Required');
 assert.equal(objectiveStatusLabel('resolved'),'Found in Quest Log');assert.equal(objectiveStatusLabel('unverified'),'Unverified');assert.equal(objectiveStatusLabel('unavailable'),'Not found in Quest Log');
 assert.equal(plural(1,'character'),'1 character');assert.equal(plural(2,'deity','deities'),'2 deities');
});
test('visibility badges: Revealed ok, Characters only accent, Hidden plain',()=>{
 assert.equal(chipBadge('Revealed to party'),'ag-badge--ok');assert.equal(chipBadge('Characters only'),'ag-badge--accent');assert.equal(chipBadge('Hidden'),'');
 assert.deepEqual(rows.map(r=>r.badgeClass),['','ag-badge--accent','ag-badge--ok']);
});
test('GM-only tabs are refused for players in the shell',()=>{
 assert.match(code,/const PAGES=\['group','player','pantheon','orgs','requests','setup'\],GM_PAGES=\['orgs','requests','setup'\];/);
 assert.match(code,/GM_PAGES\.includes\(this\.#tab\)\)this\.#tab='group'/);
 assert.match(code,/GM_PAGES\.includes\(page\)&&!game\.user\.isGM/);
 assert.match(code,/orgs=tabOrgs\?this\.#orgsList/);assert.match(code,/const allRequests=isGM\?this\.#allQueues\(\):\[\]/);
});
