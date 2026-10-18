import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {groupRecipesByProfession} from '../scripts/core.mjs';

const source=[
 {id:'REC-C',name:'Amber Elixir',profession:'Alchemy',tier:'Apprentice'},
 {id:'REC-A',name:'Crystal Balm',profession:'Alchemy',tier:'Journeyman'},
 {id:'REC-B',name:'Banded Blade',profession:'Blacksmithing',tier:'Apprentice'},
 {id:'REC-D',name:'Unsorted Relic',profession:'',tier:'Master'}
];
const grouped=groupRecipesByProfession(source);
assert.deepEqual(grouped.map(g=>[g.name,g.recipes.length]),[['Alchemy',2],['Blacksmithing',1],['Unassigned profession',1]]);
assert.deepEqual(grouped[0].recipes.map(r=>r.name),['Amber Elixir','Crystal Balm']);
assert.deepEqual(source.map(r=>r.id),['REC-C','REC-A','REC-B','REC-D'],'source ordering unchanged');
const hooks={},settings={},values={partyRoster:[],libraryData:{schema:'ag-ledger/0.1',recipes:source,materials:[]}};
const moduleObj={api:null};
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:B=>B,DialogV2:class{}}},utils:{escapeHTML:esc}};
globalThis.Hooks={once:(name,fn)=>hooks[name]=fn,on:()=>{}};
globalThis.ui={notifications:{info:()=>{},error:()=>{}}};
globalThis.game={user:{id:'gm',name:'GM',isGM:true},settings:{register:(m,k,opts)=>settings[k]=opts,registerMenu:()=>{},get:(m,k)=>values[k]},modules:{get:()=>moduleObj},items:{contents:[]},actors:{contents:[]},users:{contents:[]}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
await import(pathToFileURL(entry));hooks.init();hooks.ready();
const app=moduleObj.api.open({view:'recipes'});
let html=(await app._prepareContext({})).html;
assert.match(html,/data-id="gm"/);
assert.doesNotMatch(html,/data-action="demo"|data-action="manager"/);
const gm=(await (app.view="gm",app._prepareContext({}))).html;
assert.doesNotMatch(gm,/data-action="demo"/);
assert.match(gm,/data-action="manager"/);
app.view="recipes";
assert.match(html,/data-action="recipe-group"/);
assert.match(html,/data-agl-recipe-search/);
assert.match(html,/Expand all/);
assert.match(html,/Collapse all/);
assert.match(html,/Alchemy/);
assert.match(html,/Blacksmithing/);
assert.match(html,/Unassigned profession/);
assert.ok(html.indexOf('Amber Elixir')<html.indexOf('Crystal Balm'),'alphabetical within profession');
app.view='planner';html=(await app._prepareContext({})).html;
assert.match(html,/data-action="recipe-group"/,'crafting planner also groups recipes');
assert.match(html,/data-agl-recipe-search/,'crafting planner also provides recipe search');
// GM can select catalog browser groups and collapse/expand without touching recipe definitions.
let calls=0;app.element={querySelectorAll:()=>[],querySelector:()=>null};app._updateRecipeGroups=()=>calls++;
await app._click('recipe-group','alchemy');
assert.equal(app.expandedRecipeGroups.has('alchemy'),false,'selected group collapses');
await app._click('recipe-group','alchemy');
assert.equal(app.expandedRecipeGroups.has('alchemy'),true,'selected group expands');
assert.equal(calls,2);
// Player sees no GM utility controls. API cannot force demo mode for a player.
game.user={id:'player',name:'Player',isGM:false};app.demo=true;
app.view='recipes';html=(await app._prepareContext({})).html;
assert.doesNotMatch(html,/data-action="demo"/);
assert.doesNotMatch(html,/data-action="manager"/);
assert.doesNotMatch(html,/data-action="import"/);
assert.equal(app.demo,false);
moduleObj.api.open({demo:true});
assert.equal(app.demo,false,'public launcher rejects GM-only demo override');
await app._click('manager');
assert.equal(app.demo,false);
await app._click('demo'); // Unsupported stale action must never activate fictional records.
assert.equal(app.demo,false);
console.log('PASS grouped recipes, both browsers, GM-only utilities, and player-safe demo API');
