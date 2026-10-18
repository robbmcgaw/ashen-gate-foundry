import test from 'node:test';import assert from 'node:assert/strict';

class FakeApplication {
  static DEFAULT_OPTIONS={};
  constructor(){this.rendered=false;this.element=null;}
  render(){this.rendered=true;return this;}
  async _prepareContext(){return {};}
  async _onRender(){return undefined;}
}
const events=new Map(),oneTime=new Map(),registered=new Map(),menus=new Map();
globalThis.Hooks={
  once:(event,fn)=>oneTime.set(event,fn),
  on:(event,fn)=>{let hooks=events.get(event)??[];hooks.push(fn);events.set(event,hooks);}
};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:Base=>Base,DialogV2:{}}},utils:{escapeHTML:x=>x,randomID:()=> 'abcdefghijklmn'}};
globalThis.game={modules:new Map([['ashen-gate-skill-trees',{id:'ashen-gate-skill-trees',active:true}]]),settings:{
  register:(module,key,options)=>registered.set(key,options),
  registerMenu:(module,key,options)=>menus.set(key,options),
  get:(module,key)=>({treeData:{schema:'ag-skill-trees/0.1',trees:[]},publicTreesV2:{schema:'ag-skill-trees/0.2',trees:[]}})[key],
  set:async()=>{}
},journal:{contents:[]},actors:{contents:[],get:()=>null},items:{contents:[]},user:{isGM:true},users:{contents:[]}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.js');

test('module registers API and hidden public projection settings',async()=>{
  oneTime.get('init')();oneTime.get('ready')();
  assert.equal(registered.get('publicTreesV2').scope,'world');
  assert.equal(registered.get('publicTreesV2').config,false);
  assert.equal(registered.get('treeData').default.schema,'ag-skill-trees/0.1');
  assert.equal(menus.get('open').restricted,false);
  assert.equal(events.get('renderActorDirectory').length,1);
  const api=game.modules.get('ashen-gate-skill-trees').api;
  assert.equal(api.version,'0.6.2');
  assert.ok(api.open());
  assert.deepEqual(api.listTrees(),[]);
  assert.equal(api.actorProgress(null,'MISSING'),null);
});
test('old XP method refuses to invent a profession progression source',async()=>{
  await assert.rejects(()=>game.modules.get('ashen-gate-skill-trees').api.grantXp(),/Ledger/);
});
test('GM-only checks on point grants',async()=>{
  game.user.isGM=false;
  await assert.rejects(()=>game.modules.get('ashen-gate-skill-trees').api.grantPoints(null,'MISSING',1,'Grant'),/GM only/);
  game.user.isGM=true;
});
test('runtime uses a private Journal and a separate sanitized public projection',async()=>{
  const fs=await import('node:fs/promises');const source=await fs.readFile(new URL('../scripts/main.js',import.meta.url),'utf8');
  assert.match(source,/ownership:\{default:CONST\.DOCUMENT_OWNERSHIP_LEVELS\.NONE\}/);
  assert.match(source,/flags:\{\[MODULE\]:\{\[STORAGE_FLAG\]:true/);
  assert.match(source,/publishedPayload=trees/);
  assert.match(source,/publicTree\(/);
  assert.match(source,/source\.visibility==='player'/);
  assert.match(source,/actor\.setFlag\(MODULE,'progressV2'/);
});

test('end-to-end fake GM: initialize, install native QA fixture, grant wallet, record unlock',async()=>{
  const saved=new Map([['treeData',{schema:'ag-skill-trees/0.1',trees:[]}],['publicTreesV2',{schema:'ag-skill-trees/0.2',trees:[]}]]);
  game.settings.get=(_module,key)=>saved.get(key);
  game.settings.set=async(_module,key,value)=>{saved.set(key,value);return value;};
  const Journal={
    name:'[AG] Skill Trees — GM Definitions',
    flags:{'ashen-gate-skill-trees':{privateStore:true,payload:{schema:'ag-skill-trees/0.2',trees:[]}}},
    async setFlag(module,key,value){this.flags[module][key]=value;return value;}
  };
  globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0}};
  globalThis.JournalEntry={create:async(options)=>{
    assert.equal(options.ownership.default,0);
    Journal.flags=options.flags;
    game.journal.contents.push(Journal);
    return Journal;
  }};
  foundry.applications.api.DialogV2.confirm=async()=>true;
  foundry.applications.api.DialogV2.input=async()=>({label:'Test Scene',amount:'3'});
  const actor={id:'ABC',name:'Disposable Actor',type:'character',isOwner:true,flags:{},async setFlag(mod,key,value){this.flags[mod]??={};this.flags[mod][key]=value;return value;}};
  game.actors.contents=[actor];game.actors.get=id=>game.actors.contents.find(a=>a.id===id)??null;
  globalThis.Actor={create:async data=>{const qa={id:'QA-ACTOR',...data,isOwner:true,async delete(){game.actors.contents=game.actors.contents.filter(x=>x!==this);}};game.actors.contents.push(qa);return qa;}};
  globalThis.Item={create:async data=>{const qa={id:`QA-ITEM-${game.items.contents.length+1}`,documentName:'Item',...data,async delete(){game.items.contents=game.items.contents.filter(x=>x!==this);}};game.items.contents.push(qa);return qa;}};
  game.user.isGM=true;
  const app=game.modules.get('ashen-gate-skill-trees').api.open();
  await app._installQa().then(()=>assert.fail('Install before initialization should fail')).catch(e=>assert.match(e.message,/Initialize/));
  const store=await JournalEntry.create({flags:{'ashen-gate-skill-trees':{privateStore:true,payload:{schema:'ag-skill-trees/0.2',trees:[]}}},ownership:{default:0}});
  assert.ok(store);
  await app._installQa();
  assert.equal(Journal.flags['ashen-gate-skill-trees'].payload.trees.length,3);
  assert.equal(game.items.contents.length,2);
  assert.equal(game.actors.contents.length,2);
  assert.equal(saved.get('publicTreesV2').trees.length,2);
  assert.equal(saved.get('publicTreesV2').trees.some(t=>t.id==='QA-ST-PROFESSION'),false);
  assert.equal(saved.get('publicTreesV2').trees.find(t=>t.id==='QA-ST-CINDER').nodes.some(n=>n.name==='QA GM-only Source'),false);
  app.treeId='QA-ST-GENERIC';app.actorId='ABC';app.nodeId='QA-ST-BASE';
  await app._grant();
  assert.equal(actor.flags['ashen-gate-skill-trees'].progressV2['tree:QA-ST-GENERIC'].awarded,3);
  await app._purchase();
  assert.deepEqual(actor.flags['ashen-gate-skill-trees'].progressV2['tree:QA-ST-GENERIC'].unlocks,['QA-ST-BASE']);
  const after=actor.flags['ashen-gate-skill-trees'].progressV2['tree:QA-ST-GENERIC'];
  assert.equal(after.awarded,3); // Purchase tracked as an unlock, points are derived from costs.
  assert.ok(!actor.items); // The alpha must NOT grant Item rewards.
  await assert.rejects(()=>app._purchase(),/Already unlocked/);
  await assert.rejects(()=>app._resetQa(),/another Actor has QA tree progress/);
  assert.equal(game.actors.contents.length,2,'blocked reset never deletes an unrelated Actor');
  delete actor.flags['ashen-gate-skill-trees'].progressV2['tree:QA-ST-GENERIC'];
  await app._resetQa();
  assert.equal(game.actors.contents.length,1,'fixture reset deletes only tagged QA Actor');
  assert.equal(game.actors.contents[0],actor,'unrelated Actor survives QA cleanup');
  assert.equal(game.items.contents.length,0,'two tagged QA Feature Items deleted');
  assert.equal(Journal.flags['ashen-gate-skill-trees'].payload.trees.length,0,'QA layouts removed without disturbing unrelated layouts');
  game.actors.contents=[];
  game.items.contents=[];
});

test('import UI explicitly separates canonical source packages from tree layout imports',async()=>{
 const fs=await import('node:fs/promises');const source=await fs.readFile(new URL('../scripts/main.js',import.meta.url),'utf8');
 assert.match(source,/ag-source-package\/0\.1/);
 assert.match(source,/ag-foundry-import\/0\.2/);
 assert.match(source,/allowedSourceForProvider\(this\.tree\.provider\.kind,id\)/);
 assert.match(source,/unlocks_power/);
});

test('canonical source and Manager projections are rejected without writing tree layouts',async()=>{
  game.user.isGM=true;
  const api=game.modules.get('ashen-gate-skill-trees').api;
  const app=api.open();
  const journal=game.journal.contents.find(j=>j.flags?.['ashen-gate-skill-trees']?.privateStore);
  assert.ok(journal,'Test GM storage exists');
  const before=JSON.stringify(journal.flags['ashen-gate-skill-trees'].payload);
  const notifications=[];
  ui.notifications.error=s=>notifications.push(s);
  for(const [name,payload,expected] of [
    ['source.json',{schema_version:'ag-source-package/0.1',files:[]},'canonical source package'],
    ['manager.json',{manifest:{schema_version:'ag-foundry-import/0.2'},records:[]},'General Manager import records']
  ]){
    const file={name,size:200,text:async()=>JSON.stringify(payload)};
    const event={target:{files:[file],value:'not-yet-cleared'}};
    await app._readFile(event);
    assert.equal(event.target.value,'');
    assert.equal(JSON.stringify(journal.flags['ashen-gate-skill-trees'].payload),before);
    assert.ok(notifications.at(-1).includes(expected),`${name} rejection must be specific`);
  }
});


test('DEC-0068 through DEC-0071: standardized tabbed shell and source/import separation',async()=>{
  const fs=await import('node:fs/promises');
  const template=await fs.readFile(new URL('../templates/tree.hbs',import.meta.url),'utf8');
  const manifest=JSON.parse(await fs.readFile(new URL('../module.json',import.meta.url),'utf8'));
  assert.equal(manifest.id,'ashen-gate-skill-trees');
  assert.equal(manifest.version,'0.6.2');
  assert.match(manifest.title,/Ashen Gate \| Skill Trees/);
  assert.match(template,/data-act="tab-trees"/);
  assert.match(template,/\{\{#if gm\}\}<button type="button" data-act="tab-setup"/);
  assert.match(template,/\{\{#if activeSetup\}\}/);
  assert.match(template,/Developer Tools — Experimental \/ GM only/);
  assert.match(template,/data-act="publish"/);
  assert.match(template,/foundry\.folder_path/);
  assert.match(template,/ag-foundry-import\/0\.2/);
  assert.match(template,/moduleVersion/);
  assert.match(template,/Export Selected Tree/);
  assert.doesNotMatch(template,/agst-footer-label/);
});

test('Actors launcher remains player enabled while GM Setup is guarded in code',async()=>{
 const api=game.modules.get('ashen-gate-skill-trees').api;
 const app=api.open();
 game.user.isGM=true;
 await app._clicked({target:{closest:()=>({dataset:{act:'tab-setup'}})}});
 assert.equal(app.activeTab,'setup');
 game.user.isGM=false;
 await app._clicked({target:{closest:()=>({dataset:{act:'tab-setup'}})}});
 assert.equal(app.activeTab,'setup'); // attempt rejects tab switch; defaults will reset on render
 app._defaults();
 assert.equal(app.activeTab,'trees');
 game.user.isGM=true;
 await app._clicked({target:{closest:()=>({dataset:{act:'tab-trees'}})}});
 assert.equal(app.activeTab,'trees');
});

test('Handlebars template has correctly paired #if/#unless/#each blocks',async()=>{
 const fs=await import('node:fs/promises');
 const template=await fs.readFile(new URL('../templates/tree.hbs',import.meta.url),'utf8');
 const stack=[];
 for(const match of template.matchAll(/\{\{([#\/])(if|unless|each)\b[^}]*\}\}/g)){
   if(match[1]==='#')stack.push(match[2]);
   else assert.equal(stack.pop(),match[2],`unbalanced handlebars block near ${match.index}`);
 }
 assert.deepEqual(stack,[]);
});
