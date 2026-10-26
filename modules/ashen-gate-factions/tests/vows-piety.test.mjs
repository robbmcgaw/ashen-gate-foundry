/** 0.19.0 Piety wording, paragraph rendering and Vows. Mocked: logic, markup and stylesheet, not the live Foundry UI. Synthetic data only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paragraphsOf,paragraphHTML} from '../scripts/standing-view.mjs';
import {milestoneProjection,makeFaction} from '../scripts/core.mjs';
import {VOW_BREAK_PENALTY,normalizeVow,getVow,canManageVow,swearVow,endVow,breakVow,migrateVows} from '../scripts/vow.mjs';
const rd=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const hbs=rd('../templates/dashboard.hbs'),src=rd('../scripts/module.mjs'),css=rd('../styles/module.css');
const MOD='ashen-gate-factions';
const actor=(id='A1',owners=['p1'],flags={})=>({id,name:id,flags:{[MOD]:{...flags}},getFlag(m,k){return this.flags[m]?.[k]},async setFlag(m,k,v){(this.flags[m]??={})[k]=structuredClone(v)},async unsetFlag(m,k){delete this.flags[m]?.[k]},testUserPermission(u,l){return owners.includes(u.id)}});
const gm={id:'gm',isGM:true},p1={id:'p1'},p2={id:'p2'};

test('deity score wording is Piety on the Pantheon tab, with Renown kept for factions',()=>{
  const pantheon=hbs.slice(hbs.indexOf('<section class="agf-pantheon"'));
  assert.doesNotMatch(pantheon.replace(/undoFavour/g,''),/favou?r/i);
  assert.match(hbs,/unit="piety" label="Piety"/);assert.match(hbs,/<h3 class="ag-section__title">Piety history<\/h3>/);
  assert.match(src,/Adjust piety for/);assert.match(src,/gains \$\{result\.after-result\.before\} piety with/);
  assert.doesNotMatch(src.replace(/writeFavour|undoFavour|FAVOUR_TRACK/g,''),/favour/i);
  assert.match(hbs,/unit="Renown" label="Individual Renown"/);
});
test('paragraphs: a blank line is a paragraph, single breaks stay, text is escaped',()=>{
  assert.deepEqual(paragraphsOf('One\nstill one\n\nTwo\r\n\r\n\r\nThree'),['One\nstill one','Two','Three']);
  assert.deepEqual(paragraphsOf(''),[]);assert.deepEqual(paragraphsOf(null),[]);
  const h=paragraphHTML('A <b>\n\nB','agf-reward__text');
  assert.equal(h,'<div class="agf-prose agf-reward__text"><p>A &lt;b&gt;</p><p>B</p></div>');
  assert.equal(paragraphHTML('  \n\n '),'');
  assert.match(css,/\.agf-prose > p \+ p \{[^}]*margin-top/);assert.match(css,/\.agf-prose > p \{[^}]*white-space:pre-line/);
  assert.match(hbs,/\{\{\{agfParas description "agf-reward__text"\}\}\}/);assert.match(hbs,/\{\{\{agfParas benefit "agf-milestone__text"\}\}\}/);
  assert.match(src,/registerHelper\?\.\('agfParas'/);
});
test('a rank with a reward shows it (teaser when no description); only a truly empty rank says Nothing to claim',()=>{
  const f=makeFaction({id:'FACTION-QA-V',trackId:'RENOWN-QA-V',name:'[TEST] God'});
  f.rewards=[{id:'R1',key:'r1',name:'[TEST] Gift',kind:'custom',behavior:'passive',audience:'individual',milestone_id:f.individual_track.milestones[0].id,description:'',teaser:'A hint.',tags:[],usage_limit:0}];
  const ms=milestoneProjection({faction:f,scope:'individual',score:5});
  const first=ms[0];assert.equal(first.rewards.length,1);assert.equal(first.rewards[0].description,'A hint.');
  assert.match(hbs,/Nothing to claim at this rank\./);
});
test('How Vows work note leads the Pantheon tab and Help mentions Vows',()=>{
  const i=hbs.indexOf('How Vows work');assert.ok(i>hbs.indexOf('{{#if tabPantheon}}')&&i<hbs.indexOf('pantheon.groups'));
  for(const t of ['one Vow at a time','minute of prayer','Seeker rank','used up','costs piety','Only the GM rules'])assert.ok(hbs.includes(t),t);
  assert.match(src,/<strong>Vows:<\/strong>/);
});
test('Vow: one at a time, swap, toggle off',async()=>{
  const a=actor();
  assert.equal(getVow(a,MOD),null);
  let r=await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'DEITY-A',unlocked:true});
  assert.equal(r.changed,true);assert.equal(getVow(a,MOD).deity_id,'DEITY-A');
  r=await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'DEITY-A',unlocked:true});assert.equal(r.changed,false);
  r=await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'DEITY-B',unlocked:true});
  assert.equal(r.replaced,'DEITY-A');assert.equal(getVow(a,MOD).deity_id,'DEITY-B');assert.equal(Object.keys(a.flags[MOD]).length,1);
  assert.equal((await endVow({moduleId:MOD,actor:a,user:p1})).ended,'DEITY-B');assert.equal(getVow(a,MOD),null);
  assert.equal((await endVow({moduleId:MOD,actor:a,user:p1})).ended,null);
});
test('Vow permissions are enforced in the data layer',async()=>{
  const a=actor();
  assert.equal(canManageVow(p1,a),true);assert.equal(canManageVow(gm,a),true);assert.equal(canManageVow(p2,a),false);assert.equal(canManageVow(null,a),false);
  await assert.rejects(swearVow({moduleId:MOD,actor:a,user:p2,deityId:'D',unlocked:true}),/owner or the GM/);
  await assert.rejects(swearVow({moduleId:MOD,actor:a,user:p1,deityId:'D',unlocked:false}),/not unlocked/);
  await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'D',unlocked:true});
  await assert.rejects(endVow({moduleId:MOD,actor:a,user:p2}),/owner or the GM/);
  await assert.rejects(breakVow({moduleId:MOD,actor:a,user:p1,score:5,writePiety:async()=>{}}),/Only the GM/);
  assert.equal(getVow(a,MOD).deity_id,'D');
});
test('Break Vow: GM only, takes the penalty from a constant, never below 0, logs through the writer, ends the Vow',async()=>{
  assert.equal(VOW_BREAK_PENALTY,3);
  const writes=[],w=async(id,d,reason)=>writes.push([id,d,reason]);
  let a=actor();await swearVow({moduleId:MOD,actor:a,user:gm,deityId:'D',unlocked:true});
  let r=await breakVow({moduleId:MOD,actor:a,user:gm,score:10,writePiety:w});
  assert.deepEqual(r,{deityId:'D',lost:3});assert.deepEqual(writes[0],['D',-3,'Broke a Vow']);assert.equal(getVow(a,MOD),null);
  a=actor();await swearVow({moduleId:MOD,actor:a,user:gm,deityId:'D',unlocked:true});
  r=await breakVow({moduleId:MOD,actor:a,user:gm,score:1,writePiety:w});assert.equal(r.lost,1);assert.equal(writes[1][1],-1);
  a=actor();await swearVow({moduleId:MOD,actor:a,user:gm,deityId:'D',unlocked:true});
  r=await breakVow({moduleId:MOD,actor:a,user:gm,score:0,writePiety:w});assert.equal(r.lost,0);assert.equal(writes.length,2);assert.equal(getVow(a,MOD),null);
  await assert.rejects(breakVow({moduleId:MOD,actor:a,user:gm,score:5,writePiety:w}),/No Vow/);
  assert.match(src,/Break Vow\?',yes:'Break Vow',danger:true/);assert.ok(src.split('VOW_BREAK_PENALTY').length>2);assert.doesNotMatch(src,/-3\b.*Vow|Vow.*-3\b/);
});
test('absent actor and bad input are refused cleanly',async()=>{
  await assert.rejects(swearVow({moduleId:MOD,actor:null,user:gm,deityId:'D',unlocked:true}),/Select a character/);
  await assert.rejects(endVow({moduleId:MOD,actor:undefined,user:gm}),/Select a character/);
  await assert.rejects(breakVow({moduleId:MOD,actor:null,user:gm,writePiety:async()=>{}}),/Select a character/);
  assert.equal(getVow(null,MOD),null);assert.equal(canManageVow(gm,null),false);
  await assert.rejects(swearVow({moduleId:MOD,actor:actor(),user:gm,deityId:'',unlocked:true}),/Choose a god/);
});
test('migration repairs bad flags, is re-runnable, and leaves good or missing flags alone',async()=>{
  const good=actor('G',['p1'],{vow:{deity_id:'D',sworn_at:'2026-10-26T00:00:00.000Z'}}),str=actor('S',['p1'],{vow:'D'}),junk=actor('J',['p1'],{vow:{nope:1}}),none=actor('N');
  const all=[good,str,junk,none];
  assert.deepEqual(await migrateVows(all,MOD),['S','J']);
  assert.deepEqual(good.flags[MOD].vow,{deity_id:'D',sworn_at:'2026-10-26T00:00:00.000Z'});
  assert.deepEqual(str.flags[MOD].vow,{deity_id:'D',sworn_at:null});assert.equal(junk.flags[MOD].vow,undefined);assert.equal('vow' in none.flags[MOD],false);
  assert.deepEqual(await migrateVows(all,MOD),[]);assert.deepEqual(await migrateVows(null,MOD),[]);
  assert.equal(normalizeVow(7),null);
});
test('Vow UI: accessible toggle on the first rank card, status line, embed line',()=>{
  assert.match(hbs,/aria-pressed="\{\{#if vowToggle\.sworn\}\}true\{\{else\}\}false/);assert.match(hbs,/Vow sworn\{\{else\}\}Swear Vow/);
  assert.match(hbs,/ag-btn--danger" data-action="breakVow">Break Vow…</);
  assert.match(src,/Swear a Vow to \$\{names\(deityId\)\}\? This ends your Vow to \$\{names\(cur\.deity_id\)\}\./);
  assert.match(src,/i===0&&info\.show&&m\.unlocked/);assert.match(src,/Vow: \$\{esc\(g\.name\)\}/);assert.match(src,/static async breakVow\(e,t\)\{try\{\s*assertGM\(\)/);
});

test('0.19.1: deity notifications and errors say Piety, factions keep Renown',()=>{
  assert.match(src,/\$\{isDeity\(f\)\?'Piety':'Renown'\}: \$\{result\.before\}/);
  assert.match(src,/\$\{isDeity\(f\)\?'Piety':'Renown'\} no longer qualifies/);
});
