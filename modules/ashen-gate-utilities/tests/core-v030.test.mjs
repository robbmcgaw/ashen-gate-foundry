import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,acceptRoll,formatBonus,skillBonus,skillRollMode,tallyHTML,describeTableResult,resolveStatusSources,removeUnknownStatus,VERSION} from '../scripts/core.mjs';

test('version is 0.29.0',()=>assert.equal(VERSION,'0.29.0'));
test('skill bonus reads the prepared dnd5e total and formats signs',()=>{
 const actor={system:{skills:{acr:{total:5},ath:{total:-1},prc:{}}}};
 assert.equal(skillBonus(actor,'acr'),5);assert.equal(skillBonus(actor,'prc'),null);assert.equal(skillBonus({},'acr'),null);
 assert.equal(formatBonus(5),'+5');assert.equal(formatBonus(0),'+0');assert.equal(formatBonus(-1),'−1');assert.equal(formatBonus(null),'—');
});
test('advantage preset comes from skill and ability check roll modes',()=>{
 const base=(skill,abl)=>({system:{skills:{acr:{ability:'dex',roll:{mode:skill}}},abilities:{dex:{check:{roll:{mode:abl}}}}},effects:[]});
 assert.equal(skillRollMode(base(0,0),'acr').mode,0);
 assert.equal(skillRollMode(base(1,0),'acr').mode,1);
 assert.equal(skillRollMode(base(0,1),'acr').mode,1);
 assert.equal(skillRollMode(base(0,-1),'acr').mode,-1);
 assert.equal(skillRollMode(base(1,-1),'acr').mode,0,'advantage and disadvantage cancel');
 assert.deepEqual(skillRollMode(base(1,0),'acr').sources,['Advantage: skill setting']);
});
test('active effects: names the effect behind a dnd5e roll mode and honours midi-qol flags, ignoring disabled ones',()=>{
 const actor={system:{skills:{ste:{ability:'dex',roll:{mode:1}}},abilities:{dex:{check:{roll:{mode:0}}}}},effects:[
  {name:'Boots of Shadow',changes:[{key:'system.skills.ste.roll.mode',value:'1',mode:2}]},
  {name:'Light Sleeper',changes:[{key:'flags.midi-qol.disadvantage.skill.ste',value:'1'}]},
 ]};
 let r=skillRollMode(actor,'ste');assert.equal(r.mode,0);assert.ok(r.sources.some(x=>x.includes('Boots of Shadow')));assert.ok(r.sources.some(x=>x.startsWith('Disadvantage')));
 actor.effects.push({name:'Off',disabled:true,changes:[{key:'flags.midi-qol.advantage.all',value:'1'}]});
 actor.system.skills.ste.roll.mode=0;actor.effects.splice(0,1);actor.effects.splice(0,1);
 assert.equal(skillRollMode(actor,'ste').mode,0,'disabled effect has no influence');
 actor.effects.push({name:'Eagle Eye',changes:[{key:'flags.midi-qol.advantage.skill.all',value:'true'}]});
 assert.equal(skillRollMode(actor,'ste').mode,1);
 actor.effects.push({name:'Wrong skill',changes:[{key:'flags.midi-qol.disadvantage.skill.prc',value:'1'}]});
 assert.equal(skillRollMode(actor,'ste').mode,1,'other skills do not apply');
});
test('tally lists every participant, escapes names and states the verdict',()=>{
 const s=createSession({id:'t',name:'Cross <the> gap',kind:'group',actors:['a','b'],skills:['ath','acr'],dc:12,createdBy:'gm'});
 acceptRoll(s,{actorId:'a',skill:'ath',total:15,userId:'u',proofMessageId:'p1'});
 const html=tallyHTML(s,{actorName:id=>id==='a'?'Aria <b>':'Bo',skillLabel:id=>id.toUpperCase()});
 assert.ok(html.includes('Cross &lt;the&gt; gap'));assert.ok(html.includes('Aria &lt;b&gt;'));assert.ok(html.includes('ATH <strong>15</strong>'));assert.ok(html.includes('no roll'));assert.ok(!html.includes('<b>'));
 acceptRoll(s,{actorId:'b',skill:'acr',total:11,userId:'u',proofMessageId:'p2'});
 const done=tallyHTML(s,{});assert.ok(done.includes('Success'));assert.ok(done.includes('13.0'));assert.ok(done.includes('DC <strong>12</strong>'));
});
test('table results: text strips HTML, documents become UUID links',()=>{
 assert.deepEqual(describeTableResult({type:'text',description:'<p>You find <em>rust</em>.</p>'}),{kind:'text',uuid:null,label:'You find rust.',chat:'You find rust.',img:null});
 assert.equal(describeTableResult({type:'text',name:'Omen',description:'<p>Crows</p>'}).chat,'Omen: Crows');
 const d=describeTableResult({type:'document',name:'Iron Key [rare]',documentUuid:'Compendium.x.y.Item.k',img:'k.webp'});
 assert.equal(d.kind,'document');assert.equal(d.chat,'@UUID[Compendium.x.y.Item.k]{Iron Key rare}');assert.equal(d.img,'k.webp');
});
const mkActor=()=>{const actor={name:'PC',documentName:'Actor',effects:[],deleteEmbeddedDocuments:async(t,ids)=>{actor.deleted=ids;}};return actor;};
test('status sources: finds actor effects and item effects, ignores unrelated ones',()=>{
 const actor=mkActor(),item={documentName:'Item',name:'Cursed Ring'};
 actor.effects=[{id:'a',name:'Haze',statuses:new Set(['thinking']),parent:actor,origin:'Actor.x.Item.y'},{id:'b',name:'Glow',statuses:['magical'],parent:item,disabled:false},{id:'c',name:'Other',statuses:new Set(['burning']),parent:actor}];
 const t=resolveStatusSources(actor,'thinking');assert.equal(t.length,1);assert.equal(t[0].onActor,true);assert.equal(t[0].origin,'Actor.x.Item.y');
 const m=resolveStatusSources(actor,'magical');assert.equal(m[0].onActor,false);assert.equal(m[0].parentName,'Cursed Ring');
 assert.deepEqual(resolveStatusSources(actor,'nothing'),[]);
});
test('removing an unknown status deletes actor effects, disables item effects, and explains when nothing provides it',async()=>{
 const actor=mkActor();let updated=null;const item={documentName:'Item',name:'Cursed Ring'};
 actor.effects=[{id:'a',name:'Haze',statuses:new Set(['thinking']),parent:actor},{id:'b',name:'Glow',statuses:new Set(['magical']),parent:item,update:async d=>{updated=d;}}];
 assert.deepEqual(await removeUnknownStatus(actor,'thinking').then(r=>[r.deleted,r.disabled]),[1,0]);assert.deepEqual(actor.deleted,['a']);
 assert.deepEqual(await removeUnknownStatus(actor,'magical').then(r=>[r.deleted,r.disabled]),[0,1]);assert.deepEqual(updated,{disabled:true});
 await assert.rejects(removeUnknownStatus(actor,'ghost'),/No active effect/);
});
