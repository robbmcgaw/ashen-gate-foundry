import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spotRange,tierText,compareSpots,spotLabel,groupByTier,tierHeading} from '../scripts/spot-order.mjs';
// 0.37.0: gathering spots are listed by tier (lowest first), then profession, then name; labels carry the tier; no tier last.
const here=path.dirname(fileURLToPath(import.meta.url));

test('tier ranges: a number or name, or {min,max}; text labels; no tier is null',()=>{
 assert.deepEqual(spotRange(2),{min:2,max:2});assert.deepEqual(spotRange('Expert'),{min:3,max:3});assert.deepEqual(spotRange({min:1,max:2}),{min:1,max:2});
 assert.deepEqual(spotRange({min:3,max:1}),{min:3,max:3},'a reversed range is repaired');assert.equal(spotRange(null),null);assert.equal(spotRange('x'),null);assert.equal(spotRange({}),null);
 assert.equal(tierText({min:1,max:1}),'Tier 1');assert.equal(tierText({min:1,max:2}),'Tier 1–2');assert.equal(tierText(null),'');
 assert.equal(spotLabel({range:{min:1,max:2},activity:'Herbalism',name:'Reedbed Ford'}),'Tier 1–2 · Herbalism · Reedbed Ford');
 assert.equal(spotLabel({range:null,activity:'',name:'Odd spot'}),'Odd spot');
});

test('order: tier ascending (a range by its lowest then highest tier), then profession, then name; no tier last',()=>{
 const spots=[['No tier spot',null,'Mining'],['Zed','1-2','Herbalism'],['Alpha','1','Mining'],['Beta','1','Herbalism'],['Gamma','1','Herbalism'],['Deep',{min:4,max:5},'Mining'],['Mid',3,'Fishing'],['Wide',{min:1,max:3},'Fishing']]
  .map(([name,t,activity])=>({name,activity,range:t==='1-2'?{min:1,max:2}:t==='1'?{min:1,max:1}:spotRange(t)}));
 const out=[...spots].sort(compareSpots).map(s=>s.name);
 assert.deepEqual(out,['Beta','Gamma','Alpha','Zed','Wide','Mid','Deep','No tier spot']);
 const groups=groupByTier(spots);
 assert.deepEqual(groups.map(g=>g.label),['Tier 1 · Apprentice','Tier 3 · Expert','Tier 4 · Artisan','No tier'],'a range sits under its lowest tier; no tier is last');
 assert.deepEqual(groups[0].items.map(i=>i.name),['Beta','Gamma','Alpha','Zed','Wide']);
 assert.deepEqual(tierHeading(null),{order:99,label:'No tier'});
});

/* ---- Mocked Foundry: the GM's pickers and the nodes list ----------------------------------------- */
const hooks={},sent=[];let api;
const values={partyRoster:['pa'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeDialog{static async wait(){return true;}render(){return this;}close(){}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{}}};
globalThis.ChatMessage={create:async x=>x,getSpeaker:()=>({})};
const journals=[];
const setPath=(o,k,v)=>{const parts=k.split('.');while(parts.length>1){const p=parts.shift();o[p]??={};o=o[p];}o[parts[0]]=v;};
globalThis.JournalEntry={create:async data=>{const j={id:`j${journals.length}`,...structuredClone(data),getFlag:(sc,k)=>j.flags?.[sc]?.[k],update:async u=>{for(const [k,v] of Object.entries(u))setPath(j,k,structuredClone(v));}};journals.push(j);return j;}};
const mk=(id,label,skill,tier,extra={})=>({id,label,skill,tier,dc:12,dcVisible:true,materialId:'MAT-TG-X',visible:true,available:true,...extra});
const locs=[{id:'LOC-B',name:'[TEST] Zeta Marsh',revealed:true,resources:[mk('b1','[TEST] Deep vein','Mining',4),mk('b2','[TEST] Reedbed Ford','Herbalism',1),mk('b3','[TEST] Odd spot','Herbalism',null,{dc:null})]},
  {id:'LOC-A',name:'[TEST] Alpha Hills',revealed:false,resources:[mk('a1','[TEST] Bank game','Skinning & Harvesting',1),mk('a2','[TEST] Mid pool','Fishing',3),mk('a3','[TEST] Aaa weed','Herbalism',1)]}];
const locApi={listLocations:()=>structuredClone(locs),resourcesAt:id=>structuredClone(locs.find(l=>l.id===id)?.resources??[]),markNodeExhausted:async()=>{}};
const pc={id:'pa',name:'[TEST] Pa',type:'character',hasPlayerOwner:true,items:[],flags:{},system:{skills:{},tools:{},abilities:{}},testUserPermission:()=>true};
const ledgerModule={active:true,version:'0.46.0',set api(v){api=v},get api(){return api}};
globalThis.game={user:gm,users:{contents:[gm,alice],get:id=>[gm,alice].find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:[],get:()=>null},actors:{contents:[pc],get:id=>id==='pa'?pc:null},journal:journals,
  socket:{emit:(n,m)=>sent.push(m),on:()=>{}},modules:{get:id=>id==='ashen-gate-profession-ledger'?ledgerModule:id==='ashen-gate-locations'?{active:true,version:'0.20.4',api:locApi}:null},
  settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const {_test}=await import(new URL('../scripts/main.js',import.meta.url));hooks.init();hooks.ready();
await new Promise(r=>setTimeout(r,5));await _test.nodeWrites();
const app=api.open({view:'gathering'});app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async v=>{app.view=v;return (await app._prepareContext({})).html;};
const optionsOf=h=>[...h.matchAll(/<option value="(LOC-[^"]*)"[^>]*>([^<]*)</g)].map(m=>[m[1],m[2]]);
const groupsOf=h=>[...h.matchAll(/<optgroup label="([^"]*)">/g)].map(m=>m[1]);

test('Gather → Location spot: options under tier headings, sorted by tier then profession then name, each labelled with tier, profession and place; the selection survives',async()=>{
 game.user=gm;Object.assign(app.gather,{source:'location',nodeRef:'LOC-B|b2'});
 let h=await html('gathering');
 assert.deepEqual(groupsOf(h),['Tier 1 · Apprentice','Tier 3 · Expert','Tier 4 · Artisan','No tier']);
 const opts=optionsOf(h);
 assert.deepEqual(opts.map(o=>o[0]),['LOC-A|a3','LOC-B|b2','LOC-A|a1','LOC-A|a2','LOC-B|b1','LOC-B|b3'],'tier, then profession (Herbalism before Hunting), then name');
 assert.match(opts[1][1],/^Tier 1 · Herbalism · \[TEST\] Reedbed Ford · \[TEST\] Zeta Marsh · DC 12/);
 assert.match(opts[0][1],/\(unrevealed\)/);assert.match(opts.at(-1)[1],/^Herbalism · \[TEST\] Odd spot · \[TEST\] Zeta Marsh · no DC/,'no tier: no tier text, last');
 assert.match(h,/<option value="LOC-B\|b2" selected\s*>/,'the selection is kept when the list reorders');
});

test('Gather → Node template: grouped by tier, labelled "Tier 1–2 · Herbalism · name", sorted; Gathering nodes list: folders by tier, lowest first',async()=>{
 game.user=gm;
 const t=(id,name,activity,min,max)=>api.gathering.templates.create({id,name,activity,tier:{min,max},materials:{common:[{materialId:'MAT-TG-X'}]}});
 await t('NODE-TEST-REEDS','[TEST] Reeds','herbalism',1,2);await t('NODE-TEST-ORE','[TEST] Ore','mining',1,1);await t('NODE-TEST-DEEP','[TEST] Deep','mining',4,5);await t('NODE-TEST-HERB','[TEST] Herb','herbalism',1,1);await t('NODE-TEST-FISH','[TEST] Fish','fishing',3,3);
 Object.assign(app.gather,{source:'template',templateId:'NODE-TEST-FISH'});
 let h=await html('gathering');
 const sel=h.slice(h.indexOf('data-gather-field="templateId"'),h.indexOf('</select>',h.indexOf('data-gather-field="templateId"')));
 assert.deepEqual([...sel.matchAll(/<optgroup label="([^"]*)">/g)].map(m=>m[1]),['Tier 1 · Apprentice','Tier 3 · Expert','Tier 4 · Artisan']);
 const labels=[...sel.matchAll(/<option value="NODE-TEST-[A-Z]+"[^>]*>([^<]*)</g)].map(m=>m[1]);
 assert.deepEqual(labels,['Tier 1 · Herbalism · [TEST] Herb','Tier 1 · Mining · [TEST] Ore','Tier 1–2 · Herbalism · [TEST] Reeds','Tier 3 · Fishing · [TEST] Fish','Tier 4–5 · Mining · [TEST] Deep']);
 assert.match(sel,/<option value="NODE-TEST-FISH" selected>/,'selection kept');
 h=await html('nodes');
 const heads=[...h.matchAll(/<summary>[^]*?<strong>([^<]*)<\/strong>/g)].map(m=>m[1]);
 assert.deepEqual(heads,['Tier 1 · Apprentice','Tier 3 · Expert','Tier 4 · Artisan'],'folders run from the lowest tier up');
 assert.ok(h.indexOf('[TEST] Herb')<h.indexOf('[TEST] Reeds'),'within a tier: profession then name');
});

test('a player’s request list: spots within each location sorted by tier then name',async()=>{
 game.user=alice;
 const h=await html('gathering');game.user=gm;
 const names=[...h.matchAll(/<strong>(\[TEST\] [^<]*)<\/strong> <small>/g)].map(m=>m[1]);
 assert.deepEqual(names,['[TEST] Aaa weed','[TEST] Bank game','[TEST] Mid pool','[TEST] Reedbed Ford','[TEST] Deep vein','[TEST] Odd spot'],'within each location: tier, then profession, then name; no tier last');
});

const chromium=(()=>{for(const base of ['/opt/node-tools/node_modules/x.js',import.meta.url]){try{return createRequire(base)('playwright').chromium;}catch{}}return null;})();
for(const width of [360,980])
 test(`real DOM: a long grouped spot list at ${width}px keeps its select and labels inside the window`,{skip:!chromium&&'Playwright is not installed here'},async()=>{
  const css=['ag-ui.css','ledger.css'].map(f=>fs.readFileSync(path.resolve(here,'../styles',f),'utf8')).join('\n');
  const spots=Array.from({length:120},(_,i)=>({range:i%9===0?null:{min:1+(i%5),max:1+(i%5)+(i%3===0?1:0)},activity:['Herbalism','Mining','Fishing','Hunting','Archaeology'][i%5],name:`[TEST] Spot number ${i} with a fairly long descriptive name`}));
  const opts=groupByTier(spots).map(g=>`<optgroup label="${g.label}">${g.items.map(s=>`<option>${spotLabel(s)} · [TEST] A long place name · DC ${10+i0(s)}</option>`).join('')}</optgroup>`).join('');
  function i0(s){return s.range?s.range.min:0;}
  const browser=await chromium.launch();
  try{
   const p=await browser.newPage({viewport:{width,height:800}});
   await p.setContent(`<!doctype html><meta charset=utf-8><style>${css}</style><body style="margin:0"><div class="ag-app agl-app" style="width:${width}px"><div class="agl-main" style="padding:12px;overflow:visible"><label class="ag-field">Gathering spot<select>${opts}</select></label></div></div>`);
   const r=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,selectRight:document.querySelector('select').getBoundingClientRect().right,groups:document.querySelectorAll('optgroup').length,options:document.querySelectorAll('option').length}));
   assert.equal(r.overflow,false);assert.ok(r.selectRight<=width);assert.equal(r.options,120);assert.ok(r.groups>=5);
  }finally{await browser.close();}
 });
