import test from 'node:test';import assert from 'node:assert/strict';
// 0.9.0: GM Setup → Strain editor (pure draft rules, then the window with mocked Foundry globals) and no Cinders settings
// for players in Configure Settings. Proves logic, not the live Foundry UI.
import {draftFromConfig,draftDirty,setDraftField,addBand,removeBand,checkDraft,editorView} from '../scripts/strain-editor.mjs';
import {hideSettingsFromPlayers,stripSettingsCategory} from '../scripts/gm-settings.mjs';
import {defaultConfig,validateConfig} from '../scripts/strain.mjs';

const edit=(d,...pairs)=>{for(let i=0;i<pairs.length;i+=2)d=setDraftField(d,pairs[i],pairs[i+1]);return d;};

test('a draft of the saved config is clean and valid; typed text becomes numbers, empty means none where allowed',()=>{
  const c=defaultConfig(),d=draftFromConfig(c);
  assert.equal(draftDirty(d,c),false);assert.equal(draftDirty(null,c),false);assert.equal(checkDraft(d).ok,true);
  const e=edit(d,'bands.1.label','[TEST] Uneasy','backfire_schedule.3',' 22 ','hard_max','12','rest_recovery.short','1',
    'allow_prevention_at_guarantee',true,'effect_roll.strain_bonus.enabled',false,'effect_roll.strain_bonus.per','3','guarantee_at','9','normal_use_backfire_at','11');
  assert.equal(draftDirty(e,c),true);assert.deepEqual(c,defaultConfig(),'editing the draft never touches the config it came from');
  assert.deepEqual([e.bands[1].label,e.backfire_schedule[3],e.hard_max,e.rest_recovery,e.allow_prevention_at_guarantee,e.effect_roll.strain_bonus,e.guarantee_at,e.normal_use_backfire_at],
    ['[TEST] Uneasy',22,12,{long:1,short:1},true,{enabled:false,from:5,per:3},9,11]);
  const r=checkDraft(e);assert.equal(r.ok,true);assert.equal(r.config.hard_max,12);
  assert.equal(edit(e,'hard_max','  ').hard_max,null,'empty maximum = none');
  assert.equal(edit(d,'bands.6.to','').bands[6].to,null,'empty To = open-ended');
  assert.equal(edit(d,'guarantee_at','').guarantee_at,'','empty where a number is needed stays invalid');
  assert.equal(edit(d,'backfire_schedule.11','50').backfire_schedule.length,11,'no entry past the schedule');
  assert.deepEqual(edit(d,'schema','x','bands.99.label','x'),d,'unknown paths change nothing');
});
test('inline marks sit on the field: schedule entries, band ranges, names, maximum, rest and effect roll',()=>{
  const d=draftFromConfig(defaultConfig());
  let r=checkDraft(edit(d,'backfire_schedule.4','15','backfire_schedule.7','abc','backfire_schedule.10','101'));
  assert.equal(r.ok,false);
  assert.deepEqual(Object.keys(r.errors).sort(),['schedule.10','schedule.4','schedule.7']);
  assert.match(r.errors['schedule.4'][0],/Not below 20% \(Strain 3\)/);assert.match(r.errors['schedule.7'][0],/0 to 100/);
  r=checkDraft(edit(d,'bands.2.from','4'));
  assert.deepEqual(Object.keys(r.errors),['band.2.from']);assert.match(r.errors['band.2.from'][0],/Must be 3/);
  r=checkDraft(edit(d,'bands.3.to',''));
  assert.ok(r.errors['band.3.to'][0].includes('Only the last band'));
  r=checkDraft(edit(d,'bands.6.to','12'));
  assert.deepEqual(Object.keys(r.errors),['band.6.to'],'a closed last band needs a maximum it reaches');
  assert.equal(checkDraft(edit(d,'bands.6.to','12','hard_max','12')).ok,true);
  r=checkDraft(edit(d,'bands.0.label','   '));assert.deepEqual(Object.keys(r.errors),['band.0.label']);
  r=checkDraft(edit(d,'hard_max','0'));assert.deepEqual(Object.keys(r.errors),['hardMax']);
  r=checkDraft(edit(d,'rest_recovery.long','101'));assert.deepEqual(Object.keys(r.errors),['rest.long']);
  r=checkDraft(edit(d,'effect_roll.strain_bonus.per','0'));assert.deepEqual(Object.keys(r.errors),['effect.per']);
  r=checkDraft(edit(d,'guarantee_at','-1'));assert.deepEqual(Object.keys(r.errors),['guarantee']);
  r=checkDraft(edit(d,'normal_use_backfire_at','x'));assert.deepEqual(Object.keys(r.errors),['normalUse']);
});
test('ok is exactly validateConfig: random edits never pass the editor while validateConfig refuses them, and every refusal is marked',()=>{
  const paths=['bands.0.from','bands.1.to','bands.2.label','bands.6.to','backfire_schedule.0','backfire_schedule.5','backfire_schedule.10','guarantee_at',
    'normal_use_backfire_at','hard_max','rest_recovery.long','rest_recovery.short','effect_roll.strain_bonus.from','effect_roll.strain_bonus.per'];
  const values=['','0','1','2','3','5','9','10','12','50','100','101','-1','x','1.5'];
  let seed=7;const rnd=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n;};
  for(let i=0;i<500;i++){
    let d=draftFromConfig(defaultConfig());
    for(let k=0;k<1+rnd(3);k++)d=setDraftField(d,paths[rnd(paths.length)],values[rnd(values.length)]);
    if(rnd(4)===0)d=rnd(2)?addBand(d):removeBand(d,rnd(d.bands.length));
    const r=checkDraft(d),v=validateConfig(d);
    assert.equal(r.ok,v.errors.length===0,JSON.stringify(d));
    if(!r.ok)assert.ok(Object.keys(r.errors).length>0,'a refused draft always shows a mark');
  }
});
test('hard_max below the band 6 start is fine for validateConfig (it warns); the warning shows in the editor',()=>{
  const r=checkDraft(edit(draftFromConfig(defaultConfig()),'hard_max','5'));
  assert.equal(r.ok,true);assert.ok(r.warnings.some(w=>/hard_max is below guarantee_at/.test(w)));
});
test('add and remove bands keep them contiguous and the last one open-ended',()=>{
  const d=draftFromConfig(defaultConfig());
  const more=addBand(d);
  assert.equal(more.bands.length,8);assert.deepEqual(more.bands.slice(-2),[{from:10,to:10,label:'Band 6'},{from:11,to:null,label:'Band 7'}]);
  assert.equal(checkDraft(more).ok,true);
  const fewer=removeBand(d,3);
  assert.deepEqual(fewer.bands.map(b=>[b.from,b.to]),[[0,0],[1,2],[3,6],[7,8],[9,9],[10,null]]);assert.equal(checkDraft(fewer).ok,true);
  const noLast=removeBand(d,6);assert.deepEqual(noLast.bands.at(-1),{from:9,to:null,label:'Band 5'});assert.equal(checkDraft(noLast).ok,true);
  const noFirst=removeBand(d,0);assert.deepEqual(noFirst.bands[0],{from:0,to:2,label:'Band 1'});assert.equal(checkDraft(noFirst).ok,true);
  let one=d;while(one.bands.length>1)one=removeBand(one,0);
  assert.deepEqual(removeBand(one,0),one,'the only band stays');assert.equal(checkDraft(one).ok,true);
});
test('editor view: 11 schedule entries for Strain 0..10, each band with its marks; the last band is open-ended',()=>{
  const d=edit(draftFromConfig(defaultConfig()),'backfire_schedule.2','1');
  const v=editorView(d,checkDraft(d));
  assert.deepEqual(v.schedule.map(x=>x.index),[0,1,2,3,4,5,6,7,8,9,10]);
  assert.equal(v.schedule[2].value,'1');assert.match(v.schedule[2].error,/Not below 5%/);assert.equal(v.schedule[3].error,'');
  assert.equal(v.bands.length,7);assert.deepEqual([v.bands[6].to,v.bands[6].last,v.bands[6].toHint],['',true,'Empty = open-ended']);
  assert.deepEqual([v.hardMax,v.restLong,v.restShort,v.effectEnabled,v.effectFrom,v.effectPer,v.prevention,v.ok],['','1','0',true,'5','2',false,false]);
});

test('Configure Settings: a player client hides every Cinders setting and menu; the GM keeps them; other modules untouched',()=>{
  const fresh=()=>new Map([['ashen-gate-cinders.strainChip',{namespace:'ashen-gate-cinders',key:'strainChip',config:true}],
    ['ashen-gate-cinders.strainConfig',{namespace:'ashen-gate-cinders',key:'strainConfig',config:false}],
    ['other-module.thing',{namespace:'other-module',key:'thing',config:true}]]);
  const menus=()=>new Map([['ashen-gate-cinders.menu',{namespace:'ashen-gate-cinders',restricted:false}]]);
  let game={user:{isGM:true},settings:{settings:fresh(),menus:menus()}};
  assert.equal(hideSettingsFromPlayers(game,'ashen-gate-cinders'),0);assert.equal(game.settings.settings.get('ashen-gate-cinders.strainChip').config,true);
  game={user:{isGM:false},settings:{settings:fresh(),menus:menus()}};
  assert.equal(hideSettingsFromPlayers(game,'ashen-gate-cinders'),2);
  assert.equal(game.settings.settings.get('ashen-gate-cinders.strainChip').config,false);
  assert.equal(game.settings.menus.get('ashen-gate-cinders.menu').restricted,true);
  assert.equal(game.settings.settings.get('other-module.thing').config,true);
  const frozen={user:{isGM:false},settings:{settings:new Map([['ashen-gate-cinders.x',Object.freeze({namespace:'ashen-gate-cinders',config:true})]])}};
  assert.doesNotThrow(()=>hideSettingsFromPlayers(frozen,'ashen-gate-cinders'),'a frozen entry is left to the render guard');
  const removed=[];const node=tag=>({tag,remove:()=>removed.push(tag)});
  const root={querySelectorAll:sel=>sel.includes('[data-tab="ashen-gate-cinders"]')?[node('tab'),node('section')]:[]};
  assert.equal(stripSettingsCategory({user:{isGM:true}},'ashen-gate-cinders',root),0);assert.deepEqual(removed,[]);
  assert.equal(stripSettingsCategory({user:{isGM:false}},'ashen-gate-cinders',root),2);assert.deepEqual(removed,['tab','section']);
});

// ---- The window, with mocked Foundry ----
class FakeApplication {static DEFAULT_OPTIONS={};constructor(options={}){this.options=options;}render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),hooks=new Map(),saved=new Map(),registered=new Map(),settingsMap=new Map(),errors=[];
globalThis.Hooks={once:(e,fn)=>oneTime.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),callAll:()=>{}};
const setProperty=(obj,path,value)=>{const keys=path.split('.');let o=obj;for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=value;};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{wait:async o=>o.buttons.at(-1).callback()}}},utils:{escapeHTML:x=>String(x),randomID:()=>'r'}};
globalThis.CONFIG={statusEffects:[]};
const MOD='ashen-gate-cinders';
const gm={id:'gm',isGM:true,name:'GM'},player={id:'u1',isGM:false,name:'Player'};
const updates=[];
const hero={id:'hero',name:'[TEST] hero',type:'character',flags:{'ashen-gate-strain':{state:{value:6,history:[]}}},items:[],effects:[],
  get isOwner(){return true;},testUserPermission:()=>true,
  async update(data){updates.push(data);for(const [k,v] of Object.entries(data))setProperty(this,k,structuredClone(v));return this;},
  async createEmbeddedDocuments(_t,rows){const made=rows.map((r,i)=>({...r,id:`AE${i}`,statuses:new Set(r.statuses)}));this.effects.push(...made);return made;},
  async updateEmbeddedDocuments(_t,rows){for(const r of rows){const e=this.effects.find(x=>x.id===r._id);Object.assign(e,r,{statuses:new Set(r.statuses)});}},
  async deleteEmbeddedDocuments(_t,ids){this.effects=this.effects.filter(e=>!ids.includes(e.id));}};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}]]),i18n:{localize:x=>x},journal:{contents:[]},items:{contents:[]},
  settings:{settings:settingsMap,menus:new Map(),
    register:(m,k,o)=>{registered.set(k,o);settingsMap.set(`${m}.${k}`,{...o,namespace:m,key:k});if(o?.default!==undefined&&!saved.has(k))saved.set(k,o.default);},registerMenu:()=>{},
    get:(_m,k)=>saved.get(k),set:async(_m,k,v)=>{if(!game.user.isGM&&registered.get(k)?.scope==='world')throw Error('[TEST] server refuses a player world-setting write');saved.set(k,v);registered.get(k)?.onChange?.(v);return v;}},
  actors:{contents:[hero],get(id){return id==='hero'?hero:null;}},
  user:gm,users:{contents:[gm,player],activeGM:gm},socket:{on:()=>{},emit:()=>{}}};
globalThis.ui={actors:null,notifications:{info:()=>{},warn:()=>{},error:m=>errors.push(m)}};
await import('../scripts/main.mjs');
oneTime.get('init')();oneTime.get('setup')();oneTime.get('ready')();
await new Promise(r=>setTimeout(r,5));
const api=game.modules.get(MOD).api;
const settle=()=>new Promise(r=>setTimeout(r,5));
// A tiny stand-in for the rendered GM Setup: the marks and fields _stageStrain updates in place.
const node=(data)=>({dataset:data,textContent:'',hidden:true,attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}});

test('GM Setup → Strain: edits stay in the draft until Save Changes; marks update in place; Cancel drops them',async()=>{
  game.user=gm;saved.set('strainConfig',null);
  const app=api.open();app.tab='setup';
  const mark=node({agcError:'schedule.4'}),field=node({agcKey:'schedule.4'}),status={textContent:''};
  app.element={querySelectorAll:sel=>sel==='[data-agc-error]'?[mark]:sel==='[data-agc-key]'?[field]:[],querySelector:sel=>sel==='[data-agc-status]'?status:null};
  let ctx=await app._prepareContext({});
  assert.equal(ctx.setup.dirty,false);assert.equal(ctx.setup.strain.bands[0].label,'Band 0');assert.equal(ctx.setup.strain.schedule.length,11);
  app._stageStrain('backfire_schedule.4','15');
  assert.equal(saved.get('strainConfig'),null,'typing writes nothing');
  assert.match(mark.textContent,/Not below 20%/);assert.equal(mark.hidden,false);assert.equal(field.attrs['aria-invalid'],'true');assert.equal(status.textContent,'Unsaved changes');
  app._stageStrain('backfire_schedule.4','25');
  assert.equal(mark.hidden,true);assert.equal(field.attrs['aria-invalid'],undefined);
  assert.equal(status.textContent,'','back to the saved value: nothing unsaved');
  app._stageStrain('bands.0.label','[TEST] Calm');
  ctx=await app._prepareContext({});assert.equal(ctx.setup.strain.bands[0].label,'[TEST] Calm','a re-render keeps the draft');assert.equal(ctx.setup.dirty,true);
  await app._act({dataset:{act:'setup-cancel'}});
  ctx=await app._prepareContext({});assert.equal(ctx.setup.strain.bands[0].label,'Band 0');assert.equal(ctx.setup.dirty,false);
  assert.equal(saved.get('strainConfig'),null,'Cancel writes nothing');
  app.element=null;app.tab='cinders';
});
test('Save Changes refuses a draft with marks and writes nothing; a valid draft saves through importConfig, re-registers statuses and renames chips; character Strain never changes',async()=>{
  game.user=gm;saved.set('strainConfig',null);errors.length=0;
  for(const fn of hooks.get('updateActor')??[])fn(hero,{flags:{'ashen-gate-strain':{state:{}}}});await settle();
  assert.equal(hero.effects[0]?.name,'Strain 6/10 (Band 3)');
  const app=api.open();app.tab='setup';
  app._stageStrain('bands.2.from','4');
  await app._act({dataset:{act:'setup-save'}});
  assert.match(errors.at(-1),/fix the marked fields/);assert.equal(saved.get('strainConfig'),null);
  assert.equal(app.strainDraft.bands[2].from,4,'the draft stays for fixing');
  app._stageStrain('bands.2.from','3');
  await app._act({dataset:{act:'strain-band-remove',index:'6'}});
  await app._act({dataset:{act:'strain-band-remove',index:'5'}});
  await app._act({dataset:{act:'strain-band-remove',index:'4'}});
  app._stageStrain('bands.3.label','[TEST] Frayed');app._stageStrain('hard_max','14');app._stageStrain('rest_recovery.short','1');
  updates.length=0;
  await app._act({dataset:{act:'setup-save'}});await settle();
  const c=api.strain.config();
  assert.deepEqual(c.bands.map(b=>[b.from,b.to,b.label]),[[0,0,'Band 0'],[1,2,'Band 1'],[3,4,'Band 2'],[5,null,'[TEST] Frayed']]);
  assert.deepEqual([c.hard_max,c.rest_recovery.short],[14,1]);
  assert.equal(app.strainDraft,null);
  assert.deepEqual(CONFIG.statusEffects.map(s=>s.id),['ag-strain-0','ag-strain-1','ag-strain-2','ag-strain-3'],'one chip status per saved band');
  assert.equal(hero.effects[0].name,'Strain 6/10 ([TEST] Frayed)');
  assert.equal(hero.flags['ashen-gate-strain'].state.value,6);assert.deepEqual(updates,[],'no Actor update: Strain is never changed');
  const again=await app._prepareContext({});assert.equal(again.setup.dirty,false);
  await api.strain.resetConfig();await settle();
});
test('players: no Strain editing through the window or the API; Cinders settings are hidden from their Configure Settings',async()=>{
  game.user=gm;const app=api.open();app.tab='setup';
  app._stageStrain('bands.0.label','[TEST] Draft by GM');
  game.user=player;errors.length=0;
  app._stageStrain('bands.0.label','[TEST] Player');
  assert.equal(app.strainDraft.bands[0].label,'[TEST] Draft by GM','a player cannot stage edits');
  await app._act({dataset:{act:'setup-save'}});assert.match(errors.at(-1),/GM only/);
  await app._act({dataset:{act:'strain-band-add'}});assert.match(errors.at(-1),/GM only/);
  const before=structuredClone(api.strain.config());
  await assert.rejects(api.strain.importConfig({...before,bands:[{from:0,to:null,label:'[TEST] Player'}]}),/GM only/);
  await assert.rejects(api.strain.resetConfig(),/GM only/);
  assert.deepEqual(api.strain.config(),before);
  const ctx=await app._prepareContext({});assert.equal(ctx.setup,null);assert.equal(ctx.tabSetup,false);
  // Configure Settings on a player client (setup + ready hooks run per client).
  oneTime.get('setup')();
  const mine=[...settingsMap.values()].filter(s=>s.namespace===MOD);
  assert.ok(mine.length>=5);assert.deepEqual(mine.filter(s=>s.config),[],'no Cinders setting is shown to a player');
  assert.equal(hooks.get('renderSettingsConfig')?.length,1,'and the rendered Settings window drops the category');
  game.user=gm;app.strainDraft=null;app.tab='cinders';
});
test('the GM still gets the Cinders settings in Configure Settings',()=>{
  // Each client registers its own settings: a GM client never turns them off.
  for(const s of settingsMap.values())if(s.namespace===MOD&&registered.get(s.key)?.config)s.config=true;
  game.user=gm;oneTime.get('setup')();
  assert.ok([...settingsMap.values()].filter(s=>s.namespace===MOD&&s.config).map(s=>s.key).includes('strainChip'));
});

// 0.9.0: the Cinder art turns slowly (CSS). World switch in GM Setup (Save Changes), per-device switch for everyone.
test('rotate art: settings registered off the Settings list, defaults on; spin only with art, the GM switch and this device on',async()=>{
  const {artSpins,sheetView,ROTATE_SETTING,ROTATE_LOCAL_SETTING}=await import('../scripts/main.mjs');
  assert.deepEqual([registered.get(ROTATE_SETTING).scope,registered.get(ROTATE_SETTING).config,registered.get(ROTATE_SETTING).default],['world',false,true]);
  assert.deepEqual([registered.get(ROTATE_LOCAL_SETTING).scope,registered.get(ROTATE_LOCAL_SETTING).config,registered.get(ROTATE_LOCAL_SETTING).default],['client',false,true]);
  for(const [image,world,local,want] of [[true,true,true,true],[true,false,true,false],[true,true,false,false],[false,true,true,false]])
    assert.equal(artSpins({image,world,local}),want,JSON.stringify({image,world,local}));
  const c={instanceId:'cinst_TEST',definitionId:'MUT-TEST-EMBER',name:'[TEST] Ember',art:'ashen-gate/cinders/test-ember.webp',powers:[],enhancements:[]};
  const s={value:3,guaranteeAt:10};
  let v=sheetView(hero,c,null,{strainState:s});assert.deepEqual([v.spin,v.spinToggle,v.spinLocal],[true,true,true]);
  v=sheetView(hero,c,null,{strainState:s,rotate:{world:true,local:false}});assert.deepEqual([v.spin,v.spinToggle,v.spinLocal],[false,true,false],'off on this device: the switch stays to turn it back on');
  v=sheetView(hero,c,null,{strainState:s,rotate:{world:false,local:true}});assert.deepEqual([v.spin,v.spinToggle],[false,false],'GM switched it off: no per-device switch');
  v=sheetView(hero,{...c,art:null},null,{strainState:s});assert.deepEqual([v.image,v.spin,v.spinToggle],[false,false,false],'the default orb never turns');
  const fs=await import('node:fs/promises');
  const hbs=await fs.readFile(new URL('../templates/cinders.hbs',import.meta.url),'utf8'),css=await fs.readFile(new URL('../styles/cinders.css',import.meta.url),'utf8');
  assert.match(hbs,/class="agc-orb\{\{#if image\}\} agc-orb--art\{\{\/if\}\}\{\{#if spin\}\} agc-orb--spin\{\{\/if\}\}"/);
  assert.match(hbs,/<input type="checkbox" data-agc-spin/);assert.match(hbs,/<input type="checkbox" data-agc-rotate/);
  assert.match(css,/\.agc-orb--spin \.agc-orb__img\{animation:agc-spin 90s linear infinite;will-change:transform/);
  assert.match(css,/prefers-reduced-motion: reduce\)\{\.agc-orb__default,\.agc-orb__img\{animation:none!important\}/);
  assert.doesNotMatch(css,/agc-orb--spin \.agc-orb__glow|agc-orb--spin \.agc-orb__default/,'the glow stays still');
});
test('rotate art: the GM switch waits for Save Changes; Cancel drops it; players cannot save it but can turn it off on their own device',async()=>{
  const {ROTATE_SETTING,ROTATE_LOCAL_SETTING}=await import('../scripts/main.mjs');
  game.user=gm;const app=api.open();app.tab='setup';errors.length=0;
  let ctx=await app._prepareContext({});assert.deepEqual([ctx.setup.rotateChecked,ctx.setup.dirty],[true,false]);
  app._stageRotate(false);assert.equal(saved.get(ROTATE_SETTING),true,'unticking writes nothing');
  ctx=await app._prepareContext({});assert.deepEqual([ctx.setup.rotateChecked,ctx.setup.dirty],[false,true]);
  await app._act({dataset:{act:'setup-cancel'}});ctx=await app._prepareContext({});assert.equal(ctx.setup.rotateChecked,true);
  app._stageRotate(false);await app._act({dataset:{act:'setup-save'}});assert.equal(saved.get(ROTATE_SETTING),false,'Save Changes writes it');
  game.user=player;app._stageRotate(true);await app._act({dataset:{act:'setup-save'}});
  assert.match(errors.at(-1),/GM only/);assert.equal(saved.get(ROTATE_SETTING),false);
  app.pendingRotate=null;
  await app._setLocalSpin(false);assert.equal(saved.get(ROTATE_LOCAL_SETTING),false,'a player turns it off for their device');
  await app._setLocalSpin(true);assert.equal(saved.get(ROTATE_LOCAL_SETTING),true);
  game.user=gm;await game.settings.set(MOD,ROTATE_SETTING,true);app.tab='cinders';
});
