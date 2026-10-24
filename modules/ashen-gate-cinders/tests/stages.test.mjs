import test from 'node:test';import assert from 'node:assert/strict';
// Art stages (0.12.0): pure rules and the Stages… editor's draft model and markup. The DialogV2 window itself is proved by hand in Forge.
import {stageProblems,cleanStages,stagesInput,stageState,holdInput,cleanHold,DEFAULT_THRESHOLDS} from '../scripts/stages.mjs';
import {draftFromStages,addRow,removeRow,moveRow,setRow,draftStages,draftErrors,draftChanged,editorHtml} from '../scripts/stage-editor.mjs';
import {normalizeInstance} from '../scripts/cinder.mjs';

const S=(...ats)=>ats.map((at,i)=>({art:`ashen-gate/cinders/[TEST]-s${i+1}.webp`,at}));

test('stage lists: 2 to 5, stage 1 from the bind, strictly rising, same image rule as cinder.art; every problem names its stage',()=>{
  assert.deepEqual(stageProblems(S(...DEFAULT_THRESHOLDS)),[]);
  assert.deepEqual(DEFAULT_THRESHOLDS,[0,3,6,10,14]);
  assert.equal(stageProblems(S(0)).length,1);assert.equal(stageProblems(S(0,1,2,3,4,5)).length,1);
  assert.match(stageProblems(S(2,5))[0],/stage 1 applies from the bind/);
  assert.match(stageProblems(S(0,3,3))[0],/stage 3 needs more unlocks than stage 2 \(3\)/);
  assert.match(stageProblems([{art:'x.png',at:0},{art:'',at:2}])[0],/stage 2 needs an image path/);
  assert.match(stageProblems([{art:'x.png',at:0},{art:'y.png',at:1.5}])[0],/whole number/);
  assert.match(stageProblems([{art:'x.png',at:0},'y.png'])[0],/stage 2 must be an object/);
  assert.equal(cleanStages(S(0)),null,'a broken list reads as none');assert.equal(cleanStages(null),null);
  assert.equal(stagesInput(null),null);assert.equal(stagesInput([]),null);assert.throws(()=>stagesInput(S(0)),/needs 2 to 5/);
  assert.deepEqual(stagesInput([{art:' a.png ',at:0},{art:'b.png',at:4}]),[{art:'a.png',at:0},{art:'b.png',at:4}],'trimmed');
});
test('stage in use: the highest stage whose threshold is reached; a hold wins; no stages = null',()=>{
  const l=S(...DEFAULT_THRESHOLDS);
  const at=(n,h=null)=>{const s=stageState(l,n,h);return [s.index+1,s.held];};
  assert.deepEqual(at(0),[1,false]);assert.deepEqual(at(2),[1,false]);assert.deepEqual(at(3),[2,false]);assert.deepEqual(at(9),[3,false]);assert.deepEqual(at(14),[5,false]);assert.deepEqual(at(99),[5,false]);
  assert.deepEqual(at(0,4),[4,true],'held');assert.deepEqual(at(20,1),[1,true]);
  assert.equal(stageState(l,2).next,1,'one more unlock reaches the next stage');assert.equal(stageState(l,14).next,null);
  assert.equal(stageState(S(0,1),5,5).index,1,'a hold past the last stage reads as the last');
  assert.equal(stageState(null,3),null);assert.equal(stageState(l,NaN).index,0);
  assert.equal(cleanHold(3),3);for(const b of [0,6,2.5,'2',null])assert.equal(cleanHold(b),null);
  assert.equal(holdInput(null,4),null);assert.equal(holdInput(2,4),2);
  assert.throws(()=>holdInput(5,4),/has 4 stages/);assert.throws(()=>holdInput(1,0),/no art stages/);assert.throws(()=>holdInput(9,4),/from 1 to 5/);
});
test('instances: stages and hold are additive; records saved before read as none',()=>{
  const base={instanceId:'cinst_AAAAAAAA',definitionId:'MUT-TEST-A'};
  const old=normalizeInstance(base);assert.deepEqual([old.artStages,old.stageHold],[null,null]);
  const n=normalizeInstance({...base,artStages:S(0,2),stageHold:2});assert.deepEqual([n.artStages.length,n.stageHold],[2,2]);
  assert.deepEqual([normalizeInstance({...base,artStages:S(0),stageHold:9}).artStages,normalizeInstance({...base,stageHold:9}).stageHold],[null,null]);
});

test('editor draft: starts from the stages in force or two empty rows; add up to 5; remove down to 2; reorder moves images only',()=>{
  let d=draftFromStages(null,'ashen-gate/cinders/kind.webp');
  assert.deepEqual(d.rows,[{art:'ashen-gate/cinders/kind.webp',at:'0'},{art:'',at:'3'}],'the definition\'s single art becomes stage 1');
  d=addRow(addRow(addRow(d)));assert.deepEqual(d.rows.map(r=>r.at),['0','3','6','10','14']);assert.equal(addRow(d),d,'five at most');
  d=setRow(d,1,'art','b.png');d=setRow(d,2,'art','c.png');
  const m=moveRow(d,1,1);assert.deepEqual(m.rows.map(r=>[r.art,r.at]).slice(0,3),[['ashen-gate/cinders/kind.webp','0'],['c.png','3'],['b.png','6']],'images swap, thresholds stay');
  assert.equal(moveRow(d,0,-1),d);assert.equal(moveRow(d,4,1),d);
  const r=removeRow(d,0);assert.equal(r.rows.length,4);assert.equal(r.rows[0].at,'0','stage 1 stays at 0');
  let two=draftFromStages(null);assert.equal(removeRow(two,0),two,'two at least');
  assert.deepEqual(draftFromStages(S(0,4)).rows.map(x=>x.at),['0','4']);
});
test('editor checks: every row named; the same rules as import; typed text is read as numbers',()=>{
  let d=draftFromStages(null);
  let e=draftErrors(d);assert.deepEqual(Object.keys(e.errors),['0.art','1.art']);assert.match(e.errors['0.art'][0],/Stage 1: choose an image/);
  d=setRow(setRow(d,0,'art','a.png'),1,'art','javascript:x');assert.match(draftErrors(d).errors['1.art'][0],/not an image path/);
  d=setRow(setRow(d,1,'art','b.png'),1,'at','abc');assert.match(draftErrors(d).errors['1.at'][0],/whole number from 0 to 999/);
  d=setRow(d,1,'at','0');e=draftErrors(d);assert.match(e.errors['1.at'][0],/needs more unlocks than stage 1/);
  d=setRow(d,1,'at',' 4 ');assert.deepEqual(draftErrors(d).list,[]);assert.deepEqual(draftStages(d),[{art:'a.png',at:0},{art:'b.png',at:4}]);
  assert.equal(draftChanged(d,draftFromStages(null)),true);assert.equal(draftChanged(draftFromStages(S(0,3)),draftFromStages(S(0,3))),false);
});
test('editor markup: a row per stage with a preview, picker, Unlocks needed, reorder and remove as labelled buttons; errors inline; stage 1 fixed at 0',()=>{
  const d=setRow(draftFromStages(S(0,3,6)),1,'art','');
  const html=editorHtml(d,{errors:draftErrors(d).errors,source:'definition',unlocked:2,definitionHas:true});
  assert.equal((html.match(/data-agc-row=/g)??[]).length,3);
  assert.match(html,/<img src="ashen-gate\/cinders\/\[TEST\]-s1.webp" alt="Stage 1 preview"/);assert.match(html,/No image/);
  assert.match(html,/aria-label="Move stage 2 image up"/);assert.match(html,/Choose image…/);assert.match(html,/Unlocks needed/);
  assert.match(html,/data-agc-sat="0"[^>]*readonly/,'stage 1 cannot be edited');assert.match(html,/aria-invalid="true"/);assert.match(html,/Stage 2: choose an image/);
  assert.match(html,/These stages come from the Cinder's definition/);assert.match(html,/3 of 5 stages/);assert.match(html,/\(2 now\)/);
  const two=editorHtml(draftFromStages(S(0,3)),{});assert.match(two,/data-agc-sremove="0"[^>]*disabled/,'two is the least');
  const five=editorHtml(draftFromStages(S(0,1,2,3,4)),{source:'cinder'});assert.match(five,/data-agc-sadd[^>]*disabled/);assert.match(five,/Remove this Cinder's stages/);
  assert.equal(/<script|onerror/i.test(editorHtml(setRow(d,0,'art','x"><script>'),{})),false,'typed text is escaped');
});
