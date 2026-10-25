import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFaction,sourceDefinition,validateFaction} from '../scripts/core.mjs';
import {planImport} from '../scripts/import.mjs';
import {planSupersede,runSupersede,entrySupersedes} from '../scripts/supersede.mjs';

// Synthetic ids only: this repository is public.
const entry=(id,name,extra={})=>({id,name,text:`${name} text`,link_mode:'preview',unlock:'manual',...extra});
function faction(entries,extra={}){
  const f=makeFaction({id:'FACTION-TEST-GUILD',trackId:'RENOWN-TEST-GUILD',name:'[TEST] Guild',leader:'[TEST] Leader'});
  f.entries=entries;Object.assign(f,extra);return f;
}
const clean=f=>sourceDefinition(structuredClone(f));

test('the closed source schema accepts supersedes on a faction and its entries, and rejects bad shapes',()=>{
  const f=faction([entry('e-new','[TEST] New entry',{supersedes:['e-old']})],{supersedes:['FACTION-TEST-OLDGUILD']});
  assert.deepEqual(validateFaction(f),[]);
  const stored=clean(f);
  assert.equal('supersedes' in stored,false,'the instruction is not stored in the definition');
  assert.equal('supersedes' in stored.entries[0],false);
  for(const bad of [[],'e-old',[1],['a','a']]) assert.throws(()=>clean(faction([entry('e-new','x',{supersedes:bad})])),/supersedes|invalid array|string required|duplicate/);
  assert.throws(()=>clean(faction([entry('e-new','x',{bogus:1})])),/unclassified field bogus/,'other unknown keys still fail');
  const plan=planImport({schema_version:'ag-factions-source-export/0.4',definitions:[f]},new Set());
  assert.deepEqual(plan.errors,[]);
  assert.equal(plan.rows[0].action,'new');
});

test('entrySupersedes lists the pairs from a file',()=>{
  const f=faction([entry('e-new','n',{supersedes:['e-old']}),entry('e-keep','k')]);
  assert.deepEqual(entrySupersedes([f]),[{old:'e-old',new:'e-new',faction:'FACTION-TEST-GUILD'}]);
});

function world({known={}}={}){
  const fac=clean(faction([entry('e-old','[TEST] Old entry'),entry('e-keep','Keep')]));
  const state={faction_id:'FACTION-TEST-GUILD',standing:{score:4},claims:{R1:{status:'claimed'}},knowledge:{'e-old':{party:true,actors:['A1']},'e-keep':{party:false,actors:[]},...known}};
  const docs={F:{faction:fac},G:{state}};
  const writes=[];let after=0,gm=true;
  const io={assertGM:()=>{if(!gm)throw Error('GM authorization required.');},
    factions:()=>[{docId:'F',faction:structuredClone(docs.F.faction)}],groups:()=>[{docId:'G',state:structuredClone(docs.G.state)}],
    writeGroup:async(id,{set,remove})=>{writes.push(['group',set,remove]);for(const [k,v] of Object.entries(set))docs.G.state.knowledge[k]=v;for(const k of remove)delete docs.G.state.knowledge[k];},
    writeEntries:async(id,entries)=>{writes.push(['entries']);docs.F.faction.entries=entries;},after:async()=>{after++;},};
  return {docs,io,writes,get after(){return after;},setGM(v){gm=v;}};
}
const MAP={'e-old':'e-new'};

test('entry ids are renamed and the party\'s knowledge moves with them; standings and claims are untouched',async()=>{
  const w=world();
  const res=await runSupersede(MAP,{},w.io);
  assert.equal(res.changed,1);assert.equal(w.after,1);
  assert.deepEqual(w.docs.F.faction.entries.map(e=>e.id),['e-new','e-keep']);
  assert.deepEqual(w.docs.G.state.knowledge['e-new'],{party:true,actors:['A1']});
  assert.equal('e-old' in w.docs.G.state.knowledge,false);
  assert.equal(w.docs.G.state.standing.score,4);assert.equal(w.docs.G.state.claims.R1.status,'claimed');
});

test('the new entry text replaces the old when the file is given; knowledge stays',async()=>{
  const w=world();
  const def=faction([entry('e-new','[TEST] New entry',{supersedes:['e-old']})]);
  await runSupersede(MAP,{definitions:[clean(def)]},w.io);
  const e=w.docs.F.faction.entries[0];
  assert.equal(e.id,'e-new');assert.equal(e.name,'[TEST] New entry');assert.equal(e.text,'[TEST] New entry text');
  assert.deepEqual(w.docs.G.state.knowledge['e-new'],{party:true,actors:['A1']});
});

test('idempotent, and an old id that is not there does nothing',async()=>{
  const w=world();
  await runSupersede(MAP,{},w.io);const snap=JSON.stringify(w.docs);const n=w.writes.length;
  const again=await runSupersede(MAP,{},w.io);
  assert.equal(again.changed,0);assert.equal(JSON.stringify(w.docs),snap);assert.equal(w.writes.length,n);
  assert.equal((await runSupersede({'e-missing':'e-x'},{},w.io)).changed,0);
});

test('dry run reports and writes nothing; GM only; bad input refused',async()=>{
  const w=world();
  const dry=await runSupersede(MAP,{dryRun:true},w.io);
  assert.equal(dry.changed,1);assert.equal(dry.dryRun,true);assert.equal(w.writes.length,0);assert.equal(w.after,0);
  w.setGM(false);
  await assert.rejects(()=>runSupersede(MAP,{},w.io),/GM authorization/);
  w.setGM(true);
  await assert.rejects(()=>runSupersede(null,{},w.io),/object/);
  await assert.rejects(()=>runSupersede({a:'a'},{},w.io),/two different/);
  assert.equal(w.writes.length,0);
});

test('an existing new entry id is not overwritten; knowledge merges; a faction root is reported, not renamed',()=>{
  const w=world({known:{'e-new':{party:false,actors:['A2']}}});
  const f=w.io.factions()[0].faction;f.entries.push(entry('e-new','Already here'));
  const plan=planSupersede(MAP,{factions:[{docId:'F',faction:f}],groups:w.io.groups()});
  assert.equal(plan.changed,0);assert.match(plan.notes.join(),/already has an entry e-new/);
  const root=planSupersede({'FACTION-TEST-GUILD':'FACTION-TEST-NEW'},{factions:w.io.factions(),groups:w.io.groups()});
  assert.equal(root.changed,0);assert.match(root.notes.join(),/Renaming a whole faction/);
  // Merge when only the knowledge key already exists.
  const merged=planSupersede(MAP,{factions:w.io.factions(),groups:w.io.groups()});
  assert.deepEqual(merged.groupUpdates[0].set['e-new'],{party:true,actors:['A1','A2']});
});

test('wiring: the API is GM-only through runSupersede and listed in the module API',async()=>{
  const {readFileSync}=await import('node:fs');
  const m=readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');
  assert.match(m,/supersedeIds:\(map,options\)=>supersedeIds\(map,options\)/);
  assert.match(m,/runSupersede\(map,options,\{\s*assertGM/);
});
