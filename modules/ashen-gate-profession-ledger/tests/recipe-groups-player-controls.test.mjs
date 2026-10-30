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
const app=moduleObj.api.open({view:'catalog'});
let html=(await app._prepareContext({})).html;
assert.match(html,/data-id="gm"/);
assert.doesNotMatch(html,/data-action="demo"/);
assert.match(html,/data-action="manager"/,'GM Catalog tools has the Manager shortcut');
const gm=(await (app.view="gm",app._prepareContext({}))).html;
assert.doesNotMatch(gm,/data-action="demo"|data-action="manager"|data-action="import"/,'GM Setup has no content actions');
app.view="catalog";
assert.match(html,/<details class="agl-folder agl-tree-folder" data-folder="alchemy"/,'catalog is foldered by profession');
assert.match(html,/data-agl-search/);
assert.match(html,/Alchemy/);
assert.match(html,/Blacksmithing/);
assert.match(html,/Unassigned profession/);
assert.ok(html.indexOf('Amber Elixir')<html.indexOf('Crystal Balm'),'alphabetical within profession');
assert.match(html,/Not found by the party yet/,'GM sees which recipes no one has found');
// Search filters rows and hides empty folders without touching recipe definitions.
const row=(text,folder)=>({dataset:{recipeSearch:text},hidden:false,folder});
const rows=[row('amber elixir alchemy','alchemy'),row('banded blade blacksmithing','blacksmithing')];
const folderEl=key=>({dataset:{folder:key},hidden:false,open:false,querySelectorAll:()=>rows.filter(r=>r.folder===key)});
const folders=[folderEl('alchemy'),folderEl('blacksmithing')];
app.element={querySelectorAll:s=>s==='[data-recipe-search]'?rows:s==='[data-folder]'?folders:[],querySelector:()=>null};
app.view='party';// 0.40.0: the GM catalog searches in its list model; the page search still serves the other views
app.query='blade';app._applySearch();
assert.deepEqual(rows.map(r=>r.hidden),[true,false]);
assert.deepEqual(folders.map(f=>f.hidden),[true,false]);
assert.equal(folders[1].open,true,'matching folders open while searching');
app.query='';app._applySearch();
assert.deepEqual(rows.map(r=>r.hidden),[false,false]);
assert.deepEqual(source.map(r=>r.id),['REC-C','REC-A','REC-B','REC-D'],'definitions unchanged');
// Player sees no GM utility controls. API cannot force demo mode for a player.
game.user={id:'player',name:'Player',isGM:false};app.demo=true;
app.view='catalog';html=(await app._prepareContext({})).html;
assert.doesNotMatch(html,/Amber Elixir|Banded Blade/,'players never browse unfound catalog recipes');
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
console.log('PASS foldered catalog, search, GM-only utilities, and player-safe demo API');
