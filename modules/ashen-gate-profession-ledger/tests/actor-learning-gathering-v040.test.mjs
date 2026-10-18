import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
let hooks={},api, prompts=[],errors=[],chats=[],awardWrites=[],consumeFail=false,created=[],rendered=0;
let values={partyRoster:['a'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true};
const player={id:'u1',isGM:false,name:'Player',active:true};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {}}render(){rendered++;this.rendered=true;return this;}},HandlebarsApplicationMixin:cls=>cls,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:esc}};
globalThis.Hooks={once:(name,f)=>hooks[name]=f,on:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(String(e))}};
globalThis.ChatMessage={create:async x=>{chats.push(x);return x},getSpeaker:()=>({alias:'GM'})};
const source=(id,type,visibility='player',status='approved')=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status}}});
const knownRecipe={id:'ri',name:'Recipe: Field Tonic',type:'loot',system:{quantity:2},flags:source('REC-FIELD-TONIC','Recipe')};
const prof={id:'pi',name:'Herbalism',type:'feat',system:{quantity:1},flags:source('PROF-HERBALISM','Profession')};
const inv=[knownRecipe,prof];inv.get=id=>inv.find(x=>x.id===id);
const actor={id:'a',name:'Adventurer',type:'character',hasPlayerOwner:true,items:inv,flags:{},
 testUserPermission:(u,role)=>u.isGM||u.id==='u1',
 setFlag:async (scope,key,value)=>{actor.flags[scope]??={};actor.flags[scope][key]=value;return value},
 updateEmbeddedDocuments:async(type,updates)=>{if(consumeFail)throw Error('Cannot decrement');for(const u of updates){let item=inv.get(u._id);item.system.quantity=u['system.quantity'];}return updates},
 deleteEmbeddedDocuments:async(type,ids)=>{if(consumeFail)throw Error('Cannot delete');for(const id of ids){let i=inv.findIndex(x=>x.id===id);if(i>=0)inv.splice(i,1);}return ids},
 createEmbeddedDocuments:async(type,records)=>{awardWrites.push(records);const a=records.map((r,i)=>({...r,id:'new-'+(created.length+i),name:r.name}));created.push(...a);inv.push(...a);return a}
};
const actors={contents:[actor],get:id=>id==='a'?actor:undefined};
const worldMaterial={testUserPermission:()=>true,id:'worldmat',name:'Hearthleaf Bundle',type:'loot',system:{quantity:1},flags:source('MAT-HEARTHLEAF','Material'),toObject(){return {name:this.name,type:this.type,system:{quantity:1},flags:structuredClone(this.flags),_id:this.id}}};
const secretMaterial={testUserPermission:()=>true,id:'secret',name:'Secret Reagent',type:'loot',flags:source('MAT-SECRET','Material','gm'),toObject(){return {name:this.name,flags:this.flags}}};
const world={contents:[worldMaterial,secretMaterial],get:id=>world.contents.find(i=>i.id===id)};
const moduleObj={active:true,set api(v){api=v},get api(){return api},version:'0.4.0'};
globalThis.game={user:gm,actors,users:{contents:[gm,player]},items:world,
 modules:{get:id=>id==='ashen-gate-profession-ledger'?moduleObj:undefined},
 settings:{register:()=>{},registerMenu:()=>{},get:(id,key)=>values[key],set:async(id,key,value)=>{values[key]=value;return value}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(entry));hooks.init();hooks.ready();
const app=api.open({view:'learning',actorId:'a'});
app.element={querySelector:s=>s.includes('[data-xp-input')?{value:'5'}:null,querySelectorAll:()=>[]};

test('GM Individual view shows held recipe items but leaves learning to the player',async()=>{
 app.view='individual';
 let html=(await app._prepareContext({})).html;
 assert.match(html,/Recipes to learn/);
 assert.match(html,/Field Tonic/);
 assert.match(html,/Adventurer’s player learns this/);
 assert.doesNotMatch(html,/data-action="learn-recipe"/,'GM gets no Learn button for a player-owned character');
 assert.match(html,/hasn’t learned a recipe yet/);
 await app._click('learn-recipe','a:ri');
 assert.ok(errors.some(e=>e.includes('player learns this recipe')),'data layer refuses GM learning for players');
 assert.equal(inv.get('ri').system.quantity,2);
 assert.equal(actor.flags['ashen-gate-profession-ledger'],undefined);
});

test('Player with Actor OWNER permission learns REC ID and consumes exactly one Item',async()=>{
 game.user=player;
 assert.match((await app._prepareContext({})).html,/data-action="learn-recipe" data-id="a:ri"/,'player gets the Learn button');
 await app._click('learn-recipe','ri');
 assert.deepEqual(actor.flags['ashen-gate-profession-ledger'].knownRecipes,['REC-FIELD-TONIC']);
 assert.equal(inv.get('ri').system.quantity,1);
 await app._click('learn-recipe','ri');
 assert.deepEqual(actor.flags['ashen-gate-profession-ledger'].knownRecipes,['REC-FIELD-TONIC']);
 assert.equal(inv.get('ri').system.quantity,1);
 assert.ok(errors.some(x=>x.includes('already learned')));
});

test('Recipe learning failure rolls back knowledge without consuming Item',async()=>{
 actor.flags['ashen-gate-profession-ledger'].knownRecipes=[];consumeFail=true;
 await app._click('learn-recipe','ri');
 assert.deepEqual(actor.flags['ashen-gate-profession-ledger'].knownRecipes,[]);
 assert.equal(inv.get('ri').system.quantity,1);
 assert.ok(errors.some(x=>x.includes('Item consumption failed')));
 consumeFail=false;
});

test('GM awards XP from Actor PROF Item with correct levels; player cannot award XP',async()=>{
 game.user=gm;app.view='individual';
 const html=(await app._prepareContext({})).html;
 assert.match(html,/data-xp-input="PROF-HERBALISM"/);
 await app._click('award-xp','PROF-HERBALISM');
 assert.equal(api.getProfessionProgress(actor,'PROF-HERBALISM').xp,5);
 assert.equal(api.getProfessionProgress(actor,'PROF-HERBALISM').level,2);
 assert.equal(actor.flags['ashen-gate-skill-trees'],undefined);
 game.user=player;await app._click('award-xp','PROF-HERBALISM');
 assert.equal(api.getProfessionProgress(actor,'PROF-HERBALISM').xp,5);
 assert.ok(errors.some(x=>x.includes('GM only')));
});

test('Player Gathering view excludes GM-only encounter config; request whispers to GM only',async()=>{
 app.view='gathering';game.user=player;
 let html=(await app._prepareContext({})).html;
 assert.match(html,/Request gathering/);
 assert.doesNotMatch(html,/data-action="gather-award"|data-action="gather-roll-request"|Secret Reagent|MAT-SECRET/);
 app.gather.profession='Herbalism';
 await app._click('gather-player-request');
 assert.equal(chats.at(-1).whisper.length,1);assert.deepEqual(chats.at(-1).whisper,['gm']);
});

test('GM scene pool selects approved source, check outcome, confirms exactly one material award',async()=>{
 game.user=gm;app.view='gathering';app.gather={actorId:'a',profession:'Herbalism',eligibleProfessions:['Herbalism'],tier:'Apprentice',dc:'12',rollTotal:'15',qty:'2',materialId:'MAT-HEARTHLEAF',locationId:'',preview:null};
 const before=awardWrites.length;
 const html=(await app._prepareContext({})).html;
 assert.match(html,/Gathering encounter/);
 assert.doesNotMatch(html,/Secret Reagent/);
 app._buildGatherPreview();assert.equal(app.gather.preview.passed,true);
 assert.equal(awardWrites.length,before,'preview cannot mutate inventory');
 await app._awardGathering();
 assert.equal(awardWrites.length,before+1);
 assert.equal(created.at(-1).system.quantity,2);
 assert.equal(created.at(-1).flags['ashen-gate-profession-ledger'].sourceId,'MAT-HEARTHLEAF');
 assert.equal(app.gather.preview,null);
 assert.equal(api.getProfessionProgress(actor,'PROF-HERBALISM').xp,5,'gather award does not auto-change progression without GM action');
 assert.match(chats.at(-1).content,/Gathering reward awarded/);
});

test('failed check and wrong material ID never award',async()=>{
 const before=awardWrites.length;
 app.gather.rollTotal='3';app._buildGatherPreview();assert.equal(app.gather.preview.passed,false);
 await assert.rejects(()=>app._awardGathering(),/No successful/);
 app.gather.materialId='MAT-SECRET';assert.throws(()=>app._buildGatherPreview(),/player-visible/);
 assert.equal(awardWrites.length,before);
});

test('Actor progress, known recipes and roster persist as three separately owned fields',()=>{
 assert.deepEqual(values.partyRoster,['a']);
 assert.deepEqual(values.libraryData.recipes,[]);
 assert.equal(actor.flags['ashen-gate-profession-ledger'].professionProgress.professions['PROF-HERBALISM'].xp,5);
 assert.deepEqual(actor.flags['ashen-gate-profession-ledger'].knownRecipes,[]);
});

test('Single-use Recipe Items are deleted only once when learned',async()=>{
 game.user=player;app.view='individual';
 const one={id:'single',name:'Recipe: Rare Sample',type:'loot',system:{quantity:1},flags:source('REC-RARE','Recipe')};
 inv.push(one);
 await app._click('learn-recipe','single');
 assert.equal(inv.get('single'),undefined);
 assert.ok(actor.flags['ashen-gate-profession-ledger'].knownRecipes.includes('REC-RARE'));
 await app._click('learn-recipe','single');
 assert.ok(errors.some(e=>e.includes('Recipe Item is missing')));
});

test('Known recipe IDs survive catalog replacement and do not disclose restricted world data',async()=>{
 values.libraryData={schema:'ag-ledger/0.1',recipes:[],materials:[]};
 assert.ok(api.getKnownRecipes(actor).includes('REC-RARE'));
 app.view='individual';game.user=player;
 const html=(await app._prepareContext({})).html;
 assert.doesNotMatch(html,/Secret Reagent|MAT-SECRET/);
 assert.doesNotMatch(html,/REC-RARE|REC-FIELD-TONIC|PROF-HERBALISM/,'players never see raw IDs');
 assert.match(html,/1 known recipe is not available right now/);
});
