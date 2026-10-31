import test from 'node:test';import assert from 'node:assert/strict';
// 0.24.4 cards: api.embed.mount(element, {actorId, mode}). Mocked Foundry, a stand-in Ledger and a fake element: proves gates, rendering and the Unlock route, not the live UI.
class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),saved=new Map(),emitted=[],notes=[];let socketFn=null;
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>'r'}};
const MOD='ashen-gate-skill-trees',PROF='PROF-TP-HERB';
const node=(id,cost=1)=>({id,perkId:`PERK-TP-${id}`,cost,x:0,y:0,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'});
const prof={id:'TP-PROF',name:'[TEST] Herbalism Tree',description:'',status:'approved',visibility:'player',sourceRef:PROF,provider:{kind:'profession',maxPoints:null},nodes:[node('P1'),node('P2')]};
const generic={id:'TP-GEN',name:'[TEST] Generic Tree',description:'',status:'approved',visibility:'player',provider:{kind:'generic_points',maxPoints:10},nodes:[node('G1',2)]};
const journal={flags:{[MOD]:{privateStore:true,payload:{schema:'ag-skill-trees/0.3',trees:[prof,generic]}}},async setFlag(m,k,v){this.flags[m][k]=v;}};
const row=(a,b)=>`<tr><th>${a}</th><td>${b}</td></tr>`;
const DESC=id=>`<h3>[TEST] Perk ${id}</h3><table><tbody>${row('Profession / Tree','[TEST] Herbalism')}${row('Specialty','Tester')}${row('Tier',id==='P2'?'Journeyman (level 4)':'Apprentice (level 1)')}${row('Type','Technique')}${row('Automation','GM decides')}${row('Requires','Nothing (open from the start)')}${row('Uses','At will')}${row('Tool','[TEST] Supplies')}</tbody></table><h4>Effect &amp; Rules</h4><p>First [TEST] sentence. Second sentence.</p><h4>Notes</h4><p>A [TEST] note.</p>`;
const perk=(id,cost)=>({id:`W${id}`,uuid:`Item.W${id}`,documentName:'Item',type:'feat',name:`[TEST] Perk ${id}`,img:null,ownership:{default:2},
  system:{description:{value:DESC(id)}},testUserPermission:()=>true,toObject(){return {name:this.name,type:'feat',system:{},flags:structuredClone(this.flags)};},
  flags:{'ashen-gate-manager':{source:{sourceId:`PERK-TP-${id}`,entityType:'ProfessionPerk',status:'approved',visibility:'player',definition:{id:`PERK-TP-${id}`,point_cost:cost}}}}});
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'},other={id:'u2',isGM:false,name:'Other'};
const actorOf=(id,progressV2)=>({id,name:`[TEST] ${id}`,type:'character',flags:progressV2?{[MOD]:{progressV2}}:{},items:[],
  async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},async createEmbeddedDocuments(t,rows){const made=rows.map((r,i)=>({...r,id:`new${i}`,async delete(){}}));this.items.push(...made);return made;},
  get isOwner(){return game.user.isGM||game.user.id==='u1';},testUserPermission:(u,l)=>u.isGM||u.id==='u1'});
const hero=actorOf('hero',{'tree:TP-PROF':{unlocks:[],history:[]},'tree:TP-GEN':{awarded:5,unlocks:['G1'],history:[]}});
const blank=actorOf('blank');
const ledger={active:true,api:{progression:{contract:'ag-ledger-progression/1',level:(a,p)=>p===PROF&&a.id==='hero'?{profId:p,xp:5,level:3,tier:'Apprentice'}:null}}};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-profession-ledger',ledger]]),
  settings:{register:()=>{},registerMenu:()=>{},get:(_m,k)=>saved.get(k)??(k==='playerAccessEnabled'?true:undefined),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[journal]},items:{contents:[perk('P1',1),perk('P2',1),perk('G1',2)]},actors:{contents:[hero,blank],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,owner,other],get:id=>[gm,owner,other].find(u=>u.id===id),activeGM:gm},socket:{on:(n,fn)=>{socketFn=fn;},emit:(n,m)=>emitted.push(m)}};
globalThis.ui={actors:null,notifications:{info:m=>notes.push(['info',m]),error:m=>notes.push(['error',m])}};
await import('../scripts/main.js');
oneTime.get('init')();oneTime.get('ready')();
const api=game.modules.get(MOD).api;

const tick=()=>new Promise(r=>setTimeout(r,0));
function fakeElement(){
  const listeners=[];
  const el={innerHTML:'',isConnected:true,classes:new Set(),listeners,
    classList:{add:c=>el.classes.add(c),remove:c=>el.classes.delete(c)},
    addEventListener(type,fn,{signal}={}){const l={type,fn};listeners.push(l);signal?.addEventListener('abort',()=>listeners.splice(listeners.indexOf(l),1));},
    contains:()=>true,
    async fire(type,target){for(const l of listeners.filter(x=>x.type===type))await l.fn({target,stopPropagation(){},preventDefault(){}});}};
  return el;
}

const click=(el,data)=>el.fire('click',{dataset:data,disabled:false,isConnected:true,getAttribute:k=>data[k]??null,setAttribute(k,v){data[k]=v;},nextElementSibling:{hidden:true},closest(sel){return sel==='[data-agst-embed]'?this:null;}});

test('GM: available perk renders as a structured card, nothing run together',()=>{
  game.user=gm;
  const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero'});
  const h=el.innerHTML;
  assert.match(h,/<li class="agst-perk"[^>]*>\s*<div class="agst-perk__head"><strong class="agst-perk__name">\[TEST\] Perk P2<\/strong><span class="ag-badge agst-perk__cost">1 point<\/span>\s*<button type="button" class="ag-btn ag-btn--sm ag-btn--primary agst-perk__unlock" data-agst-embed="unlock" data-tree="TP-PROF" data-node="P2"/);
  assert.match(h,/<dt>Specialty<\/dt><dd>Tester<\/dd>/);
  assert.match(h,/<dt>Tool<\/dt><dd>\[TEST\] Supplies<\/dd>/);
  assert.doesNotMatch(h,/<dt>Requires<\/dt>/);
  assert.match(h,/<p class="agst-perk__summary">First \[TEST\] sentence\.<\/p>/);
  assert.match(h,/agst-perk-group__title">Journeyman \(level 4\)<\/h5>/);
  assert.match(h,/aria-expanded="false" aria-controls="[^"]+-details">Details<\/button>\s*<div class="agst-perk__details" id="[^"]+-details" hidden><h5>Effect &amp; Rules<\/h5><p>First/);
  assert.match(h,/<h5>Notes<\/h5><p>A \[TEST\] note\.<\/p>/);
  assert.doesNotMatch(h,/NotesProfession|TreeHerbalismSpecialty|SpecialtyTester|agst-embed__text/);
  assert.doesNotMatch(h,/<table/); // the meta table is shown as pairs, not repeated in the fold
  view.unmount();
});

test('Details toggles in place, keeps its state across a re-render, and no card has a pill radius',()=>{
  game.user=gm;
  const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero'});
  return click(el,{agstEmbed:'details',key:'TP-PROF:P2'}).then(()=>{
    view.refresh();
    assert.match(el.innerHTML,/aria-expanded="true" aria-controls="[^"]+-details">Details<\/button>\s*<div class="agst-perk__details" id="[^"]+-details">/);
    view.unmount();
  });
});

test('GM: an unreleased perk (Item default ownership None) shows a disabled Unlock with the reason; clicking reports the technical message plus the hint',async()=>{
  game.user=gm;notes.length=0;
  const item=game.items.contents.find(i=>i.id==='WP2');item.ownership.default=0;const was=item.testUserPermission;item.testUserPermission=u=>u.isGM; // players cannot observe it
  try{
    const el=fakeElement();const view=api.embed.mount(el,{actorId:'hero'});
    assert.match(el.innerHTML,/data-node="P2" data-agst-focus="[^"]+" aria-label="Unlock \[TEST\] Perk P2" disabled aria-disabled="true" data-tooltip="[^"]*default ownership is not None[^"]*" aria-describedby=/);
    await click(el,{agstEmbed:'unlock',tree:'TP-PROF',node:'P2'});
    const err=notes.find(([k])=>k==='error');
    assert.ok(err,JSON.stringify(notes));
    assert.match(err[1],/^Skill Trees: \[TEST\] Perk P2 is not an approved, player-visible perk yet\. Hint: .*default ownership is not None/);
    view.unmount();
  }finally{item.ownership.default=2;item.testUserPermission=was;}
});

test('player request for an unreleased perk gets the actionable sentence',async()=>{
  game.user=gm;emitted.length=0;
  const item=game.items.contents.find(i=>i.id==='WP2');item.ownership.default=0;const was=item.testUserPermission;item.testUserPermission=u=>u.isGM; // players cannot observe it
  try{
    await socketFn({type:'unlock-request',requestId:'r1',userId:'u1',actorId:'hero',treeId:'TP-PROF',nodeId:'P2'},'u1');
    const res=emitted.find(m=>m.type==='unlock-result');
    assert.ok(res&&res.ok===false,JSON.stringify(emitted));
    assert.equal(res.message,'The GM has not released this perk to players yet.');
  }finally{item.ownership.default=2;item.testUserPermission=was;}
});
