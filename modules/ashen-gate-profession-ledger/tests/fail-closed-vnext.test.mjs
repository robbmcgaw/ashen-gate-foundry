import test from 'node:test';import assert from 'node:assert/strict';
import {sourceAvailableToPlayer,normalizeLibrary,SCHEMA} from '../scripts/core.mjs';
import {canLearnRecipe,isMaterialAwardCandidate} from '../scripts/progression.mjs';
const source=(id,kind,status='approved',visibility='player')=>({'ashen-gate-manager':{source:{sourceId:id,entityType:kind,status,visibility}}});
test('player catalog disallows legacy absent, GM and unrevealed visibility metadata',()=>{
 assert.equal(sourceAvailableToPlayer({id:'REC-UNKNOWN'}),false);
 assert.equal(sourceAvailableToPlayer({id:'REC-SECRET',visibility:'gm'}),false);
 assert.equal(sourceAvailableToPlayer({id:'REC-UNREVEALED',visibility:'reveal_gated'}),false);
 assert.equal(sourceAvailableToPlayer({id:'REC-OK',visibility:'player',status:'approved'}),true);
});
test('missing source visibility cannot silently become player-indexed recipe',()=>{
 const pkg=normalizeLibrary({schema:SCHEMA,recipes:[{id:'REC-HIDDEN',name:'Hidden'}],materials:[]});
 assert.equal(pkg.recipes.length,0);assert.equal(pkg.importSummary.skippedRestricted,1);
});
test('Actor recipe consumption fails without explicit player-visible source metadata',()=>{
 const it={id:'recipe',system:{quantity:1},flags:{'ashen-gate-manager':{source:{sourceId:'REC-RECIPE',entityType:'Recipe',status:'approved'}}}};
 const actor={items:[it]};assert.equal(canLearnRecipe(actor,it,'REC-RECIPE').ok,false);
});
test('Gathering awards require approved unarchived player-visible MAT source',()=>{
 const it={id:'x',name:'Material',type:'loot',flags:source('MAT-SAMPLE','Material')};
 assert.equal(isMaterialAwardCandidate(it,()=>'MAT-SAMPLE'),true);
 it.flags['ashen-gate-manager'].lifecycle={archived:true};
 assert.equal(isMaterialAwardCandidate(it,()=>'MAT-SAMPLE'),false);
});
