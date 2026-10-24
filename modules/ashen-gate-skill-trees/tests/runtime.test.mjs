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
  assert.equal(api.version,'0.23.1');
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
  // 0.20.0: form dialogs are DialogV2.wait with [Cancel, action]; the fake picks the action (form values, or true for a confirm).
  foundry.applications.api.DialogV2.wait=async o=>{const b=o.buttons.find(x=>x.action!=='cancel');return b.action==='ok'?{label:'Test Scene',amount:'3'}:b.callback();};
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

test('Skill Trees has no importer UI of its own; Manager hands files to the GM-only API',async()=>{
 const fs=await import('node:fs/promises');
 const source=await fs.readFile(new URL('../scripts/main.js',import.meta.url),'utf8');
 const template=await fs.readFile(new URL('../templates/tree.hbs',import.meta.url),'utf8')+await fs.readFile(new URL('../scripts/library.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(template,/data-act="import"|type="file"|Import Tree Layout JSON/);
 assert.doesNotMatch(source,/_readFile|agst-tree-import/);
 assert.match(template,/data-act="export"/);assert.match(template,/data-act="export-all"/);
 assert.match(source,/allowedSourceForProvider\(t\.provider\.kind,id\)/);
});

test('import API rejects source packages and Manager records without writing tree layouts',async()=>{
  game.user.isGM=true;
  const api=game.modules.get('ashen-gate-skill-trees').api;
  const journal=game.journal.contents.find(j=>j.flags?.['ashen-gate-skill-trees']?.privateStore);
  assert.ok(journal,'Test GM storage exists');
  const before=JSON.stringify(journal.flags['ashen-gate-skill-trees'].payload);
  for(const payload of [{schema_version:'ag-source-package/0.1',files:[]},{manifest:{schema_version:'ag-foundry-import/0.2'},records:[]}]){
    assert.ok(api.previewTreeImport(payload).errors.length);
    await assert.rejects(()=>api.importTrees(payload),/Import blocked/);
    assert.equal(JSON.stringify(journal.flags['ashen-gate-skill-trees'].payload),before);
  }
  game.user.isGM=false;
  assert.throws(()=>api.previewTreeImport({schema:'ag-skill-trees/0.3',trees:[]}),/GM only/);
  await assert.rejects(()=>api.importTrees({schema:'ag-skill-trees/0.3',trees:[]}),/GM only/);
  game.user.isGM=true;
});


test('DEC-0068 through DEC-0071: standardized tabbed shell and source/import separation',async()=>{
  const fs=await import('node:fs/promises');
  const template=await fs.readFile(new URL('../templates/tree.hbs',import.meta.url),'utf8');
  const manifest=JSON.parse(await fs.readFile(new URL('../module.json',import.meta.url),'utf8'));
  assert.equal(manifest.id,'ashen-gate-skill-trees');
  assert.equal(manifest.version,'0.23.1');
  assert.match(manifest.title,/Ashen Gate \| Skill Trees/);
  assert.match(template,/data-act="tab-trees"/);
  assert.match(template,/\{\{#if gm\}\}<button type="button" role="tab" data-act="tab-library" class="ag-tab--gm/);
  assert.match(template,/<button type="button" role="tab" data-act="tab-setup" class="ag-tab--gm/);
  assert.match(template,/\{\{#if activeSetup\}\}/);
  assert.match(template,/data-act="tab-library"/);
  assert.match(template,/<details class="ag-devtools">\s*<summary><i class="fa-solid fa-flask" aria-hidden="true"><\/i> Developer Tools<\/summary>/);
  assert.match(template,/data-act="publish"/);
  assert.match(template,/General Manager → Import/);
  assert.match(template,/moduleVersion/);
  // 0.20.0 (ST-04): each Tree Library row exports its own tree; no export that depends on a selection in another tab.
  assert.match(await fs.readFile(new URL('../scripts/library.mjs',import.meta.url),'utf8'),/data-act="export" data-tree="\$\{esc\(r\.id\)\}"/);
  assert.doesNotMatch(template,/Export Selected Tree/);
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

test('GM Setup has settings only; content actions live in the GM-only Tree Library tab',async()=>{
 const fs=await import('node:fs/promises');
 const template=await fs.readFile(new URL('../templates/tree.hbs',import.meta.url),'utf8');
 const setup=template.slice(template.indexOf('{{#if activeSetup}}\n'));
 const library=template.slice(template.indexOf('{{#if activeLibrary}}\n  {{#if initialized}}'),template.indexOf('{{#if activeSetup}}\n'))+await fs.readFile(new URL('../scripts/library.mjs',import.meta.url),'utf8');
 assert.ok(setup.length>100&&library.length>100);
 for(const act of ['create-tree','export','export-all','give-missing','publish','backup-progress','ledger-import','legacy-preview','legacy-clear'])
  assert.match(library,new RegExp(`data-act="${act}"`),`${act} is in Tree Library`),assert.doesNotMatch(setup,new RegExp(`data-act="${act}"`),`${act} is not in GM Setup`);
 assert.match(setup,/name="playerAccessEnabled"/);
 assert.match(setup,/data-act="setup-save"/);
 assert.match(setup,/Developer Tools/);
 const api=game.modules.get('ashen-gate-skill-trees').api;
 const app=api.open();
 game.user.isGM=true;
 await app._clicked({target:{closest:()=>({dataset:{act:'tab-library'}})}});
 assert.equal(app.activeTab,'library');
 game.user.isGM=false;
 await app._clicked({target:{closest:()=>({dataset:{act:'tab-library'}})}});
 app._defaults();
 assert.equal(app.activeTab,'trees','players are returned to the tree view');
 for(const fn of ['publish','backupProgress','exportTrees'])if(api[fn])await assert.rejects(()=>api[fn](),/GM only/);
 game.user.isGM=true;
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

test('Manager import creates the GM-only storage Journal itself when it is missing, and says so',async()=>{
  game.user.isGM=true;
  game.journal.contents=[];
  const created=[];
  globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0}};
  globalThis.JournalEntry={create:async options=>{
    assert.equal(options.ownership.default,0,'no player access');
    const doc={name:options.name,flags:options.flags,async setFlag(m,k,v){this.flags[m][k]=v;return v;}};
    created.push(doc);game.journal.contents.push(doc);return doc;
  }};
  const api=game.modules.get('ashen-gate-skill-trees').api;
  const tree={id:'TREE-TEST-AUTO',name:'[TEST] Auto storage',status:'test',visibility:'player',provider:{kind:'generic_points',maxPoints:3},
    nodes:[{id:'NODE-A',perkId:'PERK-TEST-A',x:100,y:100,requiresAll:[],requiresAny:[],excludes:[],status:'test',visibility:'player',display:'shown'}]};
  const report=await api.importTrees({schema:'ag-skill-trees/0.3',trees:[tree]});
  assert.equal(created.length,1);
  assert.deepEqual(report.failed,[]);
  assert.match(report.notes[0],/Created the GM-only Skill Trees storage Journal/);
  const again=await api.importTrees({schema:'ag-skill-trees/0.3',trees:[tree]});
  assert.equal(created.length,1,'storage is created once');
  assert.equal(again.notes,undefined);
});

test('a failed auto-publish after a world perk changes tells the GM once, until a publish works again',async()=>{
  const errors=[],origError=ui.notifications.error,origSet=game.settings.set,origConsole=console.error;
  ui.notifications.error=msg=>errors.push(msg);console.error=()=>{};
  const fire=async()=>{for(const fn of events.get('createItem'))await fn({parent:null});};
  try{
    game.settings.set=async()=>{throw Error('[TEST] settings write refused');};
    await fire();await fire();
    assert.equal(errors.length,1,'one notification for repeated failures');
    assert.match(errors[0],/Players still see the previous trees.*\[TEST\] settings write refused|\[TEST\] settings write refused.*Players still see the previous trees/);
    game.settings.set=origSet;await fire();
    game.settings.set=async()=>{throw Error('[TEST] refused again');};await fire();
    assert.equal(errors.length,2,'a new failure after a success is reported');
  }finally{ui.notifications.error=origError;game.settings.set=origSet;console.error=origConsole;}
});
