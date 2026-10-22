// Game Journal. Mocked Foundry documents and socket: proves the rules, the stored shape and the markup, not the live
// Foundry UI or Foundry's own server-side ownership checks.
import test from 'node:test';import assert from 'node:assert/strict';
import {sessionId,nextNumber,freeId,cleanTitle,readSession,sortSessions,currentSession,personalOwnership,partyOwnership,entryOwnership,
 canUseJournal,canReadPage,canWritePage,canRename,sanitizeHtml,htmlToText,htmlToMarkdown,searchJournal,MAX_NAME} from '../scripts/journal-core.mjs';
import {createJournalStore,JournalConflict} from '../scripts/journal-store.mjs';
import {buildJournalModel,journalPaneHTML,newJournalView,FORMAT_COMMANDS,FORMATS} from '../scripts/journal-ui.mjs';

const MOD='ashen-gate-quest-manager';
globalThis.game={user:null};

test('session ids, numbers and titles',()=>{
 assert.equal(sessionId(1),'SESSION-001');assert.equal(sessionId(1234),'SESSION-1234');
 assert.equal(nextNumber([]),1);assert.equal(nextNumber([{number:2},{number:7,archived:true}]),8,'archived sessions count');
 assert.deepEqual(freeId(2,[{id:'SESSION-002'},{id:'SESSION-003'}]),{number:4,id:'SESSION-004'});
 assert.deepEqual(cleanTitle({name:'  Into\nthe   dark ',subtitle:''}),{name:'Into the dark',subtitle:''});
 assert.deepEqual(cleanTitle({name:''},{fallback:'Session 3'}),{name:'Session 3',subtitle:''});
 assert.throws(()=>cleanTitle({name:'   '}),/needs a name/);
 assert.throws(()=>cleanTitle({name:'x'.repeat(MAX_NAME+1)}),/at most/);
 assert.throws(()=>cleanTitle({name:'ok',subtitle:'y'.repeat(121)}),/Subtitles/);
 assert.equal(readSession({v:1,id:'nope',number:1}),null);assert.equal(readSession(null),null);
 assert.equal(readSession({v:1,id:'SESSION-004',number:4,name:''}).name,'Session 4');
 const list=[{id:'a',number:1},{id:'b',number:3,archived:true},{id:'c',number:2}];
 assert.deepEqual(sortSessions(list).map(s=>s.id),['b','c','a']);assert.equal(currentSession(list).id,'c','newest not archived');
});

test('ownership: party page for everyone, a personal page for its player only (others NONE explicitly)',()=>{
 assert.deepEqual(entryOwnership(),{default:2});assert.deepEqual(partyOwnership(),{default:3});
 assert.deepEqual(personalOwnership('alice',[{id:'gm',isGM:true},{id:'alice'},{id:'bob'}]),{default:0,alice:3,bob:0});
});

test('rules: who reads, writes and renames',()=>{
 const gm={id:'gm',isGM:true},alice={id:'alice'},bob={id:'bob'};
 const party={kind:'party'},mine={kind:'user',userId:'alice'},s={id:'SESSION-001',createdBy:'bob',archived:false};
 assert.ok(canUseJournal(gm,{access:false,hubShown:false}));
 assert.ok(canUseJournal(alice,{access:true,hubShown:true}));assert.ok(canUseJournal(alice,{access:true,hubShown:undefined}));
 assert.ok(!canUseJournal(alice,{access:false,hubShown:true}));assert.ok(!canUseJournal(alice,{access:true,hubShown:false}));
 assert.ok(canReadPage(alice,party)&&canReadPage(alice,mine)&&!canReadPage(bob,mine)&&canReadPage(gm,mine));
 assert.ok(canWritePage(alice,mine,s)&&canWritePage(bob,party,s)&&canWritePage(gm,party,s));
 assert.ok(!canWritePage(bob,mine,s),'not another player\'s page');assert.ok(!canWritePage(gm,mine,s),'the GM reads a player page, never writes it');
 assert.ok(!canWritePage(alice,party,{...s,archived:true}),'archived is read only');
 assert.ok(canRename(gm,s)&&canRename(bob,s)&&!canRename(alice,s));
});

test('sanitizer keeps the toolbar formats only, with no attributes',()=>{
 assert.equal(sanitizeHtml('<p onclick="x()">Hi <b style="color:red">there</b> <i>you</i> <u>u</u></p>'),'<p>Hi <strong>there</strong> <em>you</em> <u>u</u></p>');
 assert.equal(sanitizeHtml('<div>a</div><h2 class="x">T</h2><ul><li>1</li></ul><ol><li>2</li></ol>'),'<p>a</p><h2>T</h2><ul><li>1</li></ul><ol><li>2</li></ol>');
 assert.equal(sanitizeHtml('a<script>alert(1)</script>b<style>p{}</style>c'),'abc');
 assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>ok<a href="javascript:x">link</a>'),'oklink');
 assert.equal(sanitizeHtml('x<script>never closed'),'x');
 assert.equal(sanitizeHtml('<iframe src="//e"><p>in</p></iframe>after'),'after');
 assert.equal(sanitizeHtml('1 < 2 > 0'),'1 &lt; 2 &gt; 0');
 assert.equal(sanitizeHtml('<!-- hidden --><p>v</p>'),'<p>v</p>');
 assert.equal(sanitizeHtml('<p><br></p>'),'');assert.equal(sanitizeHtml('<br/>line'),'<br>line');
 assert.doesNotMatch(sanitizeHtml('<svg><script>x</script></svg><p onmouseover=1>t</p>'),/svg|script|onmouseover/);
 assert.equal(htmlToText('<h2>A</h2><p>b &amp; c</p><ul><li>d</li></ul>'),'A\nb & c\nd');
});

test('Markdown: headings, emphasis, lists, quotes',()=>{
 const md=htmlToMarkdown('<h2>Day one</h2><p>We met <strong>Mara</strong> and <em>ran</em>.</p><ul><li>rope</li><li>lamp</li></ul><ol><li>first</li><li>second</li></ol><blockquote>Hold.</blockquote><p><u>under</u></p>');
 assert.equal(md,'## Day one\n\nWe met **Mara** and *ran*.\n\n- rope\n- lamp\n\n1. first\n2. second\n\n> Hold.\n\nunder');
});

// ---- mocked Foundry documents: ownership is checked the way Foundry does (user entry, else default; GM owns all) ----
const LEVELS={NONE:0,LIMITED:1,OBSERVER:2,OWNER:3};
const permits=(own,user,level)=>user.isGM||(own[user.id]??own.default??0)>=(typeof level==='string'?LEVELS[level]:level);
function fakeEntry(data,world){
 const entry={id:`j${world.entries.length+1}`,name:data.name,ownership:data.ownership,flags:structuredClone(data.flags),folder:data.folder,pages:[],updates:[],
  getFlag(m,k){return this.flags?.[m]?.[k];},testUserPermission(u,l){return permits(this.ownership,u,l);},
  async update(change){this.updates.push(change);if(change.name)this.name=change.name;for(const [k,v] of Object.entries(change))if(k.startsWith('flags.')){const [,m,key]=k.split('.');this.flags[m][key]=structuredClone(v);}world.changed();},
  async createEmbeddedDocuments(type,list,opts){assert.equal(type,'JournalEntryPage');assert.equal(opts?.renderSheet,false);for(const p of list)entry.pages.push(fakePage(p,world,entry));world.changed();}};
 for(const p of data.pages??[])entry.pages.push(fakePage(p,world,entry));
 return entry;
}
function fakePage(data,world,parent){
 return {name:data.name,ownership:data.ownership,flags:structuredClone(data.flags),text:{...data.text},parent,writes:[],
  getFlag(m,k){return this.flags?.[m]?.[k];},testUserPermission(u,l){return permits(this.ownership,u,l);},
  async update(change){
   // Foundry's server refuses a write by a user without OWNER on the page.
   if(!permits(this.ownership,world.me(),'OWNER'))throw new Error('Foundry: no permission');
   this.writes.push({by:world.me().id,change});this.text.content=change['text.content'];world.changed();}};
}
function makeWorld({access=true,hubShown=true}={}){
 const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true},bob={id:'bob',name:'Bob',isGM:false,active:true};
 const users=[gm,alice,bob];users.get=id=>users.find(u=>u.id===id);
 const bus=[];// socket: every client hears every emit (Foundry does not echo to the sender; nor does this)
 const world={users,entries:[],access,hubShown,current:gm,changes:0,me:()=>world.current,changed(){world.changes++;},bus,stores:new Map()};
 const socket=owner=>({emit:(ch,msg)=>{assert.equal(ch,`module.${MOD}`);bus.push(msg);for(const [u,store] of world.stores)if(u!==owner)world.as(u,()=>store.onSocket(msg,owner));},on:()=>{}});
 world.as=(user,fn)=>{const prev=world.current;world.current=users.get(user);try{return fn();}finally{world.current=prev;}};
 world.store=userId=>{if(!world.stores.has(userId))world.stores.set(userId,createJournalStore({moduleId:MOD,users:()=>users,me:()=>world.current,entries:()=>world.entries,
  createEntry:async data=>{world.entries.push(fakeEntry(data,world));world.changed();},folderId:async()=>'folder-gj',
  access:()=>world.access,hubShown:()=>world.hubShown,isPrimaryGM:()=>world.current?.isGM===true,socket:socket(userId),now:()=>Date.UTC(2026,9,22),timeout:200,randomId:(()=>{let n=0;return ()=>`r${userId}${++n}`;})()}));
  return world.stores.get(userId);};
 // Calls a store method as that user (each user is their own client).
 world.call=async(userId,fn)=>{const prev=world.current;world.current=users.get(userId);try{return await fn(world.store(userId));}finally{world.current=prev;}};
 return world;
}

test('GM New session: one entry, a party page and a page for each player, never opened',async()=>{
 const w=makeWorld();
 const id=await w.call('gm',s=>s.create({}));
 assert.equal(id,'SESSION-001');
 const [e]=w.entries;assert.equal(e.name,'Game Journal — Session 1');assert.equal(e.folder,'folder-gj');assert.deepEqual(e.ownership,{default:2});
 assert.deepEqual(e.getFlag(MOD,'session'),{v:1,id:'SESSION-001',number:1,name:'Session 1',subtitle:'',createdAt:'2026-10-22T00:00:00.000Z',createdBy:'gm',archived:false});
 assert.deepEqual(e.pages.map(p=>[p.name,p.ownership]),[['Party journal',{default:3}],["Alice's journal",{default:0,alice:3,bob:0}],["Bob's journal",{default:0,alice:0,bob:3}]]);
 assert.deepEqual(e.pages.map(p=>p.getFlag(MOD,'journalPage')),[{session:'SESSION-001',kind:'party'},{session:'SESSION-001',kind:'user',userId:'alice'},{session:'SESSION-001',kind:'user',userId:'bob'}]);
 await w.call('gm',s=>s.create({name:'The road',subtitle:'Rain'}));
 const list=await w.call('gm',s=>s.list());
 assert.deepEqual(list.map(x=>[x.id,x.name,x.subtitle,x.current]),[['SESSION-002','The road','Rain',true],['SESSION-001','Session 1','',false]]);
});

test('players read the party page and their own; never another player\'s',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({}));
 const pagesA=await w.call('alice',s=>s.pages(id));
 assert.deepEqual(pagesA.map(p=>[p.target,p.label]),[['party','Party journal'],['alice','My journal']]);
 const gmPages=await w.call('gm',s=>s.pages(id));
 assert.deepEqual(gmPages.map(p=>p.label),['Party journal',"Alice's journal","Bob's journal"]);
 const mine=await w.call('alice',s=>s.read(id,'me'));assert.equal(mine.target,'alice');assert.ok(mine.canWrite);
 await assert.rejects(w.call('alice',async s=>s.read(id,'bob')),/can't read/);
 const gmReadsAlice=await w.call('gm',s=>s.read(id,'alice'));assert.equal(gmReadsAlice.canWrite,false);assert.equal(gmReadsAlice.label,"Alice's journal");
 assert.equal((await w.call('gm',s=>s.read(id,'me'))).target,'party','the GM has no personal page');
});

test('writes go straight to the page (no GM needed) and are cleaned; others are refused',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({}));
 w.users.get('gm').active=false;// the GM logs off
 const saved=await w.call('alice',s=>s.write(id,'me','<p onclick="x">Found a <b>key</b></p><script>x</script>',{base:''}));
 assert.equal(saved,'<p>Found a <strong>key</strong></p>');
 const alicePage=w.entries[0].pages[1];assert.deepEqual(alicePage.writes.map(x=>x.by),['alice']);
 await w.call('bob',s=>s.write(id,'party','<p>Bob was here</p>',{base:''}));
 assert.equal(w.entries[0].pages[0].text.content,'<p>Bob was here</p>');
 await assert.rejects(w.call('bob',s=>s.write(id,'alice','<p>hijack</p>')),/can't write/);
 await assert.rejects(w.call('gm',s=>s.write(id,'alice','<p>gm</p>')),/can't write/);
 assert.equal(alicePage.text.content,'<p>Found a <strong>key</strong></p>');
 // A page whose Foundry grant was removed by hand stays closed even though the rule would allow it.
 alicePage.ownership={default:0,alice:0};
 await assert.rejects(w.call('alice',async s=>s.read(id,'me')),/can't read/);
});

test('a page saved by someone else since you started is a conflict; force replaces it',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({}));
 await w.call('bob',s=>s.write(id,'party','<p>Bob</p>',{base:''}));
 await assert.rejects(w.call('alice',s=>s.write(id,'party','<p>Alice</p>',{base:''})),e=>e instanceof JournalConflict&&e.code==='conflict'&&e.current==='<p>Bob</p>');
 assert.equal(await w.call('alice',s=>s.write(id,'party','<p>Alice</p>',{base:'',force:true})),'<p>Alice</p>');
 assert.equal(await w.call('alice',s=>s.write(id,'party','<p>Alice 2</p>',{base:'<p>Alice</p>'})),'<p>Alice 2</p>');
});

test('players start sessions and rename their own through the GM; refusals are checked on the GM client',async()=>{
 const w=makeWorld();w.store('gm');// the GM client is listening
 const id=await w.call('alice',s=>s.create({name:'Ignored? no: kept'}));
 assert.equal(id,'SESSION-001');assert.equal(w.entries[0].getFlag(MOD,'session').createdBy,'alice');
 assert.equal(w.entries[0].getFlag(MOD,'session').name,'Ignored? no: kept');
 await w.call('alice',s=>s.rename(id,{name:'Night watch',subtitle:'Under the gate'}));
 assert.equal(w.entries[0].name,'Game Journal — Night watch');assert.equal(w.entries[0].getFlag(MOD,'session').subtitle,'Under the gate');
 await assert.rejects(w.call('bob',s=>s.rename(id,{name:'Mine now'})),/Only the GM and the player who started/);
 assert.equal(w.entries[0].getFlag(MOD,'session').name,'Night watch');
 await w.call('gm',s=>s.rename(id,{name:'GM name'}));assert.equal(w.entries[0].getFlag(MOD,'session').name,'GM name');
 // A forged request (sender is not the user it names) is refused.
 w.current=w.users.get('gm');const store=w.store('gm');const before=w.entries.length;
 await store.onSocket({type:'journal-request',requestId:'x',userId:'alice',op:'create'},'bob');
 assert.equal(w.entries.length,before);assert.match(w.bus.at(-1).message,/sender mismatch/);assert.equal(w.bus.at(-1).sessionId,null);
 // Receipts carry no page text.
 assert.ok(w.bus.filter(m=>m.type==='journal-receipt').every(m=>Object.keys(m).sort().join()==='message,ok,requestId,sessionId,type,userId'));
});

test('with no GM connected a player cannot start or rename a session (but still writes)',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({}));w.users.get('gm').active=false;
 await assert.rejects(w.call('alice',s=>s.create({})),/A GM must be connected to start/);
 await assert.rejects(w.call('alice',s=>s.rename(id,{name:'x'})),/A GM must be connected to rename/);
});

test('Player Access off or the Character Hub hiding quests closes the journal to players (GM unaffected)',async()=>{
 const w=makeWorld({access:false});const id=await w.call('gm',s=>s.create({}));
 assert.throws(()=>w.as('alice',()=>w.store('alice').list()),/hidden by the GM/);
 await assert.rejects(w.call('alice',s=>s.write(id,'me','<p>x</p>')),/hidden by the GM/);
 w.access=true;w.hubShown=false;
 assert.throws(()=>w.as('bob',()=>w.store('bob').read(id,'party')),/hidden by the GM/);
 assert.equal(w.as('gm',()=>w.store('gm').list()).length,1);
 // The GM client refuses a request from a player who may not use the journal.
 w.store('gm');await assert.rejects(w.call('alice',s=>s.create({})),/hidden by the GM/);
});

test('archive: players lose it, it is read only, the GM restores it (nothing deleted)',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({}));await w.call('gm',s=>s.create({}));
 await w.call('gm',s=>s.archive(id));
 assert.deepEqual(w.as('alice',()=>w.store('alice').list().map(x=>x.id)),['SESSION-002']);
 assert.deepEqual(w.as('gm',()=>w.store('gm').list().map(x=>x.id)),['SESSION-002']);
 assert.deepEqual(w.as('gm',()=>w.store('gm').list({archived:true}).map(x=>[x.id,x.archived])),[['SESSION-002',false],['SESSION-001',true]]);
 assert.deepEqual(w.as('alice',()=>w.store('alice').list({archived:true}).map(x=>x.id)),['SESSION-002'],'players never get archived ones');
 await assert.rejects(w.call('alice',async s=>s.read(id,'me')),/not available/);
 await assert.rejects(w.call('gm',s=>s.write(id,'party','<p>x</p>')),/archived/);
 await assert.rejects(w.call('alice',s=>s.archive('SESSION-002')),/GM permission/);
 await w.call('gm',s=>s.restore(id));assert.equal(w.entries.length,2);
 assert.ok(w.as('alice',()=>w.store('alice').read(id,'me')).canWrite);
});

test('search covers names and the pages the viewer may read only',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({name:'Lantern night'}));
 await w.call('alice',s=>s.write(id,'me','<p>The secret door is behind the lantern.</p>',{base:''}));
 await w.call('bob',s=>s.write(id,'party','<p>We bought rope.</p>',{base:''}));
 assert.deepEqual(w.as('alice',()=>w.store('alice').search('secret')).map(h=>[h.target,h.label]),[['alice','My journal']]);
 assert.deepEqual(w.as('bob',()=>w.store('bob').search('secret')),[],"Bob never finds Alice's page");
 assert.deepEqual(w.as('gm',()=>w.store('gm').search('secret')).map(h=>h.label),["Alice's journal"]);
 assert.deepEqual(w.as('bob',()=>w.store('bob').search('rope')).map(h=>h.label),['Party journal']);
 assert.deepEqual(w.as('bob',()=>w.store('bob').search('lantern night')).map(h=>h.label),['Session name']);
 assert.match(searchJournal([{session:{id:'SESSION-001',name:'x',subtitle:''},pages:[{target:'party',label:'P',html:'<p>'+'a'.repeat(80)+'needle'+'b'.repeat(80)+'</p>'}]}],'needle')[0].snippet,/^…a+needleb+…$/);
});

test('Markdown export is GM only and lists every page',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({name:'Night',subtitle:'Rain'}));
 await w.call('alice',s=>s.write(id,'me','<h2>Notes</h2><p>Mine</p>',{base:''}));
 assert.throws(()=>w.as('alice',()=>w.store('alice').exportMarkdown(id)),/GM permission/);
 const md=w.as('gm',()=>w.store('gm').exportMarkdown(id));
 assert.equal(md,"# Night\n\n*Rain*\n\nSESSION-001 · started 2026-10-22\n\n## Party journal\n\n*(empty)*\n\n## Alice's journal\n\n## Notes\n\nMine\n\n## Bob's journal\n\n*(empty)*\n");
});

test('a player added later gets their page on the GM client (re-runnable, adds nothing twice)',async()=>{
 const w=makeWorld();await w.call('gm',s=>s.create({}));
 const cara={id:'cara',name:'Cara',isGM:false,active:true};w.users.push(cara);
 assert.equal(await w.call('gm',s=>s.ensurePages()),1);assert.equal(await w.call('gm',s=>s.ensurePages()),0);
 assert.deepEqual(w.entries[0].pages.at(-1).ownership,{default:0,alice:0,bob:0,cara:3});
 assert.equal(await w.call('alice',s=>s.ensurePages()),0,'players never add pages');
});

test('markup: sidebar newest first, toggle, toolbar, book; GM view of a player page is read only',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({}));await w.call('gm',s=>s.create({name:'Second',subtitle:'The gate'}));
 await w.call('alice',s=>s.write('SESSION-002','me','<p>Hello <strong>you</strong></p>',{base:''}));
 const jv=newJournalView(false);
 const m=w.as('alice',()=>buildJournalModel(w.store('alice'),jv,w.users.get('alice')));
 const html=journalPaneHTML(m);
 assert.equal(jv.sessionId,'SESSION-002','opens the current session');
 assert.ok(html.indexOf('data-session-row="SESSION-002"')<html.indexOf(`data-session-row="${id}"`),'newest first');
 assert.match(html,/Current<\/span>/);assert.match(html,/The gate/);
 assert.match(html,/aria-pressed="true"[^>]*><i class="fa-solid fa-user"/,'My journal pressed');
 for(const f of FORMATS)assert.match(html,new RegExp(`data-format="${f.id}"`));
 assert.deepEqual(Object.keys(FORMAT_COMMANDS).sort(),FORMATS.map(f=>f.id).sort());
 assert.match(html,/id="agq-journal-editor" contenteditable="true"[^>]*>(<p>Hello <strong>you<\/strong><\/p>)<\/div>/);
 assert.match(html,/Discard changes[\s\S]*data-journal-status>Saved<[\s\S]*Save<\/button>/,'Discard left, Save right');
 assert.doesNotMatch(html,/data-action=/,'journal controls never go through the GM action handler');
 assert.doesNotMatch(html,/Export Markdown|Archive session|agq-journal-archived/,'no GM tools for players');
 // Bob is not the creator: no rename pencil.
 assert.doesNotMatch(journalPaneHTML(w.as('bob',()=>buildJournalModel(w.store('bob'),newJournalView(false),w.users.get('bob')))),/data-jaction="rename"/);
 const gv={...newJournalView(true),target:'alice'};
 const gh=journalPaneHTML(w.as('gm',()=>buildJournalModel(w.store('gm'),gv,w.users.get('gm'))));
 assert.match(gh,/<select id="agq-journal-who"><option value="party" >Party journal<\/option><option value="alice" selected>Alice&#39;s journal/);
 assert.match(gh,/contenteditable="false"/);assert.doesNotMatch(gh,/data-format=|data-journal-status/);
 assert.match(gh,/Only they can write it/);assert.match(gh,/Export Markdown/);assert.match(gh,/Archive session/);assert.match(gh,/data-jaction="rename"/);
 gv.renaming='SESSION-002';
 assert.match(journalPaneHTML(w.as('gm',()=>buildJournalModel(w.store('gm'),gv,w.users.get('gm')))),/id="agq-jr-name" maxlength="80" value="Second"[\s\S]*id="agq-jr-subtitle"[^>]*value="The gate"/);
});

test('markup: empty, archived, and search results',async()=>{
 const w=makeWorld();
 assert.match(journalPaneHTML(w.as('alice',()=>buildJournalModel(w.store('alice'),newJournalView(false),w.users.get('alice')))),/No sessions yet[\s\S]*data-jaction="new"/);
 const id=await w.call('gm',s=>s.create({}));await w.call('gm',s=>s.archive(id));
 const gv={...newJournalView(true),showArchived:true};
 const gh=journalPaneHTML(w.as('gm',()=>buildJournalModel(w.store('gm'),gv,w.users.get('gm'))));
 assert.match(gh,/This session is archived/);assert.match(gh,/Restore session/);assert.match(gh,/contenteditable="false"/);
 await w.call('gm',s=>s.restore(id));await w.call('bob',s=>s.write(id,'party','<p>Rope &amp; <em>lamp</em></p>',{base:''}));
 const hv={...newJournalView(false),query:'lamp'};
 const hh=journalPaneHTML(w.as('alice',()=>buildJournalModel(w.store('alice'),hv,w.users.get('alice'))));
 assert.match(hh,/data-jaction="hit" data-id="SESSION-001" data-target="party"[\s\S]*Rope &amp; lamp/);
});
