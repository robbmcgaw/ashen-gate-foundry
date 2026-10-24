// Game Journal. Mocked Foundry documents and socket: proves the rules, the stored shape and the markup, not the live
// Foundry UI or Foundry's own server-side ownership checks.
import test from 'node:test';import assert from 'node:assert/strict';
import {sessionId,nextNumber,freeId,cleanTitle,readSession,sortSessions,currentSession,personalOwnership,partyOwnership,entryOwnership,
 canUseJournal,canReadPage,canWritePage,canRename,sanitizeHtml,htmlToText,htmlToMarkdown,searchJournal,MAX_NAME,journalMarkdown,journalFilename,
 autoFormatHtml,cleanDate,sessionHeading,sessionDate,autoDate,gmOwnership,GM_TARGET,canDelete} from '../scripts/journal-core.mjs';
import {createJournalStore,JournalConflict} from '../scripts/journal-store.mjs';
import {buildJournalModel,journalPaneHTML,newJournalView,FORMAT_COMMANDS,FORMATS,PRESSABLE,showPressed,bindRadios,bindToolbarKeys} from '../scripts/journal-ui.mjs';
import {El} from './helpers/fake-dom.mjs';

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
  async delete(){world.entries.splice(world.entries.indexOf(entry),1);world.changed();},
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
 assert.deepEqual(e.pages.map(p=>[p.name,p.ownership]),[['Party journal',{default:3}],['GM-only notes',{default:0,alice:0,bob:0}],["Alice's journal",{default:0,alice:3,bob:0}],["Bob's journal",{default:0,alice:0,bob:3}]]);
 assert.deepEqual(e.pages.map(p=>p.getFlag(MOD,'journalPage')),[{session:'SESSION-001',kind:'party'},{session:'SESSION-001',kind:'gm'},{session:'SESSION-001',kind:'user',userId:'alice'},{session:'SESSION-001',kind:'user',userId:'bob'}]);
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
 const alicePage=w.entries[0].pages.find(p=>p.getFlag(MOD,'journalPage').userId==='alice');assert.deepEqual(alicePage.writes.map(x=>x.by),['alice']);
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
 // 0.17.0 QJ-02: the kit's segmented control (radios) for My journal / Party journal; one Tab stop.
 assert.match(html,/<div class="ag-segmented agq-jtoggle" role="radiogroup" aria-label="Which journal"><button type="button" role="radio" id="agq-jt-me" data-jaction="target" data-target="me" aria-checked="true" tabindex="0"><i class="fa-solid fa-user"/,'My journal checked');
 assert.match(html,/data-target="party" aria-checked="false" tabindex="-1"/);
 // QJ-07 New session is secondary (Save is the one primary); QJ-04 one Tab stop on the toolbar, toggles carry aria-pressed.
 assert.match(html,/data-jaction="new" class="ag-btn ag-btn--sm"/);assert.equal((html.match(/ag-btn--primary/g)||[]).length,1);
 assert.match(html,/data-format="bold"[^>]*tabindex="0" aria-pressed="false"/);assert.match(html,/data-format="italic"[^>]*tabindex="-1" aria-pressed="false"/);
 assert.match(html,/data-format="h2"[^>]*tabindex="-1"><span aria-hidden="true">H2<\/span>/,'heading and subheading use the same kind of glyph');
 assert.doesNotMatch(html.match(/data-format="h2"[^>]*>/)[0],/aria-pressed/);
 for(const f of FORMATS)assert.match(html,new RegExp(`data-format="${f.id}"`));
 assert.deepEqual(Object.keys(FORMAT_COMMANDS).sort(),FORMATS.map(f=>f.id).sort());
 assert.match(html,/id="agq-journal-editor" contenteditable="true"[^>]*>(<p>Hello <strong>you<\/strong><\/p>)<\/div>/);
 assert.match(html,/Discard changes[\s\S]*data-journal-status>Saved<[\s\S]*Save<\/button>/,'Discard left, Save right');
 assert.doesNotMatch(html,/data-action=/,'journal controls never go through the GM action handler');
 assert.doesNotMatch(html,/Export This Session|Export GM Journal|Archive session|agq-journal-archived/,'no GM tools for players');
 // Bob is not the creator: no rename pencil.
 assert.doesNotMatch(journalPaneHTML(w.as('bob',()=>buildJournalModel(w.store('bob'),newJournalView(false),w.users.get('bob')))),/data-jaction="rename"/);
 const gv={...newJournalView(true),target:'alice'};
 const gh=journalPaneHTML(w.as('gm',()=>buildJournalModel(w.store('gm'),gv,w.users.get('gm'))));
 assert.match(gh,/Whose journal<select id="agq-journal-who"><option value="party" >Party journal<\/option><option value="alice" selected>Alice&#39;s journal/);
 assert.match(gh,/contenteditable="false"/);assert.doesNotMatch(gh,/data-format=|data-journal-status/);
 assert.match(gh,/Only they can write it/);assert.match(gh,/Export This Session/);assert.match(gh,/Archive session/);assert.match(gh,/data-jaction="rename"/);
 // QJ-03 Session actions sit on their own line under the session title, Archive session last.
 assert.match(gh,/<\/header><div class="ag-btn-group agq-jactions" role="group" aria-label="Session actions">[^]*Export This Session[^]*Archive session<\/button><\/div>/);
 assert.doesNotMatch(gh.slice(gh.indexOf('agq-jhead__tools'),gh.indexOf('</header>')),/Export This Session|Export Journal|Archive session/);
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

test('0.17.0 QJ-05: a player with no GM connected sees New session and rename disabled, with a hint',async()=>{
 const w=makeWorld();w.store('gm');await w.call('alice',s=>s.create({}));
 const m=w.as('alice',()=>buildJournalModel(w.store('alice'),newJournalView(false),w.users.get('alice')));
 assert.doesNotMatch(journalPaneHTML(m),/needs a GM connected/);
 m.noGM=true;const html=journalPaneHTML(m);
 assert.match(html,/data-jaction="new" class="ag-btn ag-btn--sm" disabled/);assert.match(html,/New session needs a GM connected\./);
 assert.match(html,/data-jaction="rename" class="[^"]*" data-id="[^"]+" disabled/);
});
test('0.17.0 QJ-02/QJ-04: radios and the formatting toolbar move with the arrow keys; toggles show the caret\'s format',()=>{
 const root=new El();root.innerHTML='<div class="ag-segmented" role="radiogroup"><button role="radio" data-target="me" aria-checked="true"></button><button role="radio" data-target="party" aria-checked="false"></button></div><div class="agq-jtools" role="toolbar"><button data-format="bold" tabindex="0" aria-pressed="false"></button><button data-format="h2" tabindex="-1"></button><button data-format="ul" tabindex="-1" aria-pressed="false"></button></div>';
 const [me,party]=root.querySelectorAll('[role="radio"]');const clicks=[];party.click=()=>clicks.push('party');me.click=()=>clicks.push('me');
 bindRadios(root.querySelector('[role="radiogroup"]'));me.fire('keydown',{key:'ArrowRight'});assert.deepEqual(clicks,['party']);
 me.fire('keydown',{key:'Enter'});assert.deepEqual(clicks,['party'],'other keys do nothing');
 const bar=root.querySelector('.agq-jtools'),[bold,h2,ul]=bar.querySelectorAll('button');bindToolbarKeys(bar);
 bold.fire('keydown',{key:'ArrowLeft'});assert.deepEqual([bold,h2,ul].map(b=>b.getAttribute('tabindex')),['-1','-1','0'],'wraps to the end');
 ul.fire('keydown',{key:'Home'});assert.equal(bold.getAttribute('tabindex'),'0');
 showPressed(root,cmd=>cmd==='insertUnorderedList');
 assert.equal(bold.getAttribute('aria-pressed'),'false');assert.equal(ul.getAttribute('aria-pressed'),'true');assert.equal(h2.getAttribute('aria-pressed'),null);
 assert.deepEqual(Object.keys(PRESSABLE).sort(),['bold','italic','ol','strike','ul','underline']);
});

// ---- 0.20.0 ----
test('0.20.0 sanitizer keeps divider, highlight and strikethrough; nothing else new',()=>{
 assert.equal(sanitizeHtml('<p>a</p><hr class="x"><p><mark style="color:red">hi</mark> <strike>old</strike></p><blockquote>q</blockquote>'),'<p>a</p><hr><p><mark>hi</mark> <s>old</s></p><blockquote>q</blockquote>');
 assert.equal(sanitizeHtml('x</hr>y'),'xy','a stray closing hr is dropped');
 assert.equal(htmlToMarkdown('<p>a</p><hr><p><mark>b</mark></p>'),'a\n\n---\n\nb');
 assert.equal(htmlToText('<p>a</p><hr><p>b</p>'),'a\nb');
});

test('0.20.0 session heading: "Session N - name", no prefix when there is no number or the name already says it',()=>{
 assert.equal(sessionHeading({number:3,name:'Market day'}),'Session 3 - Market day');
 assert.equal(sessionHeading({number:3,name:'Session 3'}),'Session 3');
 assert.equal(sessionHeading({name:'Market day'}),'Market day');
 assert.equal(sessionHeading({number:0,name:'Odd'}),'Odd');
 const html=journalPaneHTML({isGM:false,sessions:[],pages:[],hits:null,query:'',showArchived:false,renaming:null,target:'me',stale:false,dirty:false,
  session:{id:'SESSION-003',number:3,name:'Market day',subtitle:'Rain',createdAt:'2026-10-22T12:00:00.000Z',archived:false},page:{html:'',canWrite:true,label:'My journal',missing:false},error:'',gm:null});
 assert.match(html,/<h2 class="agq-detail__title">Session 3 - Market day<\/h2>/);
});

test('0.20.0 the date: automatic by default, the GM can set it, a player cannot; saved sessions keep working',async()=>{
 assert.equal(cleanDate(' 2026-10-24 '),'2026-10-24');assert.equal(cleanDate(''),'');assert.equal(cleanDate(undefined),'');
 for(const bad of ['2026-02-30','24/10/2026','2026-1-1','tomorrow'])assert.throws(()=>cleanDate(bad),/looks like/);
 assert.equal(autoDate('2026-10-22T12:00:00.000Z').length,10);
 assert.equal(sessionDate({createdAt:'2026-10-22T12:00:00.000Z',date:'2026-09-01'}),'2026-09-01');
 assert.equal(readSession({v:1,id:'SESSION-001',number:1,date:'garbage'}).date,undefined,'a bad stored date is ignored, the session still loads');
 assert.equal(readSession({v:1,id:'SESSION-001',number:1,date:'2026-09-01'}).date,'2026-09-01');
 const w=makeWorld();const id=await w.call('gm',s=>s.create({name:'Night'}));w.store('gm');
 assert.equal(w.entries[0].getFlag(MOD,'session').date,undefined,'new sessions store no date: it stays automatic');
 await w.call('gm',s=>s.rename(id,{name:'Night',subtitle:'',date:'2026-09-01'}));
 assert.equal(w.entries[0].getFlag(MOD,'session').date,'2026-09-01');
 assert.equal((await w.call('gm',async s=>s.get(id))).canSetDate,true);assert.equal((await w.call('alice',async s=>s.get(id))).canSetDate,false);
 // A rename without a date keeps it; an empty date goes back to automatic.
 await w.call('gm',s=>s.rename(id,{name:'Night 2'}));assert.equal(w.entries[0].getFlag(MOD,'session').date,'2026-09-01');
 await w.call('gm',s=>s.rename(id,{name:'Night 2',date:''}));assert.equal('date' in w.entries[0].getFlag(MOD,'session'),false);
 await w.call('gm',s=>s.rename(id,{name:'Night 3',date:'2026-09-02'}));
 // A player may rename but not change the date, even over the socket.
 await assert.rejects(w.call('alice',s=>s.rename(id,{name:'Night 3',date:'2026-12-25'})),/Only the GM/);
 assert.equal(w.entries[0].getFlag(MOD,'session').date,'2026-09-02');
 await assert.rejects(w.call('gm',s=>s.rename(id,{name:'Night 3',date:'2026-02-31'})),/looks like/);
});

test('0.20.0 GM-only notes: a player read, write, list, search and export never reach them',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({name:'Night'}));w.store('gm');
 await w.call('gm',s=>s.write(id,GM_TARGET,'<p>The mayor is the cultist ZZSECRET</p>',{base:''}));
 await w.call('bob',s=>s.write(id,'party','<p>Party text</p>',{base:''}));
 const gmPage=w.entries[0].pages.find(p=>p.name==='GM-only notes');
 assert.deepEqual(gmPage.ownership,{default:0,alice:0,bob:0},'Foundry itself gives players nothing on this page');
 const back=await w.call('gm',async s=>s.read(id,GM_TARGET));assert.equal(back.html,'<p>The mayor is the cultist ZZSECRET</p>');assert.equal(back.canWrite,true);
 assert.equal((await w.call('gm',async s=>s.read(id,'party'))).html,'<p>Party text</p>','not mixed into the party page');
 assert.ok(!(await w.call('gm',async s=>s.pages(id))).some(p=>p.target===GM_TARGET),'it is a section, not a journal in the picker');
 for(const who of ['alice','bob']){
  await assert.rejects(w.call(who,async s=>s.read(id,GM_TARGET)),/can't read/);
  await assert.rejects(w.call(who,s=>s.write(id,GM_TARGET,'<p>overwrite</p>')),/can't write/);
  assert.ok(!(await w.call(who,async s=>s.pages(id))).some(p=>/GM/.test(p.label)||p.target===GM_TARGET));
  assert.deepEqual(await w.call(who,async s=>s.search('ZZSECRET')),[],'search never finds it');
  assert.equal(JSON.stringify(await w.call(who,async s=>s.read(id,'party'))).includes('ZZSECRET'),false);
  await assert.rejects(w.call(who,async s=>s.exportMarkdown(id)),/GM permission/);
 }
 assert.equal(gmPage.text.content,'<p>The mayor is the cultist ZZSECRET</p>','untouched by the refused writes');
 // Even if the Foundry grant were widened by hand, the rules still refuse a player.
 gmPage.ownership={default:3};
 await assert.rejects(w.call('alice',async s=>s.read(id,GM_TARGET)),/can't read/);
 await assert.rejects(w.call('alice',s=>s.write(id,GM_TARGET,'<p>x</p>')),/can't write/);
 // The GM finds it in search; the GM's Markdown export leaves it out unless asked.
 assert.equal((await w.call('gm',async s=>s.search('ZZSECRET'))).length,1);
 assert.doesNotMatch(await w.call('gm',async s=>s.exportMarkdown(id)),/ZZSECRET/);
 assert.match(await w.call('gm',async s=>s.exportMarkdown(id,{includeGmNotes:true})),/ZZSECRET/);
 // Nothing that went over the socket carries page text.
 assert.ok(!JSON.stringify(w.bus).includes('ZZSECRET'));
 // An archived session keeps its GM notes read only.
 await w.call('gm',s=>s.archive(id));
 await assert.rejects(w.call('gm',s=>s.write(id,GM_TARGET,'<p>late</p>')),/archived/);
 assert.equal(canReadPage({id:'a'},{kind:'gm'}),false);assert.equal(canWritePage({id:'a'},{kind:'gm'},{archived:false}),false);
 assert.deepEqual(gmOwnership([{id:'gm',isGM:true},{id:'a'}]),{default:0,a:0});
});

test('0.20.0 GM-only notes UI: the GM sees the section on the party journal; a player\'s page never has it',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({name:'Night'}));
 await w.call('gm',s=>s.write(id,GM_TARGET,'<p>ZZSECRET</p>',{base:''}));
 const html=who=>{const me=w.users.get(who);return w.as(who,()=>{globalThis.game.user=me;const jv=newJournalView(me.isGM);jv.sessionId=id;
  return journalPaneHTML(buildJournalModel(w.store(who),jv,me));});};
 const gm=html('gm');assert.match(gm,/id="agq-journal-gm"/);assert.match(gm,/GM-only notes/);assert.match(gm,/Players cannot see this/);assert.match(gm,/ZZSECRET/);
 for(const who of ['alice','bob']){const p=html(who);assert.doesNotMatch(p,/agq-journal-gm|ZZSECRET|GM-only/);}
});

test('0.20.0 migration: sessions made before the GM-only page get one, once; re-running adds nothing',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({}));
 const e=w.entries[0];e.pages.splice(e.pages.findIndex(p=>p.name==='GM-only notes'),1);// a 0.19 session
 assert.equal(e.pages.length,3);
 assert.equal(await w.call('gm',s=>s.ensurePages()),1);assert.equal(e.pages.length,4);
 assert.equal(await w.call('gm',s=>s.ensurePages()),0);assert.equal(e.pages.length,4);
 assert.equal(await w.call('alice',s=>s.ensurePages()),0,'only a GM client adds pages');
 assert.deepEqual(e.pages.at(-1).ownership,{default:0,alice:0,bob:0});
 // Existing pages are untouched, and the older session still reads and writes.
 await w.call('alice',s=>s.write(id,'me','<p>mine</p>',{base:''}));
 assert.equal((await w.call('alice',async s=>s.read(id,'me'))).html,'<p>mine</p>');
});

test('0.20.0 delete from the archive: GM only, archived sessions only, not a socket operation',async()=>{
 const w=makeWorld();const id=await w.call('gm',s=>s.create({name:'Old'}));await w.call('gm',s=>s.create({name:'New'}));w.store('gm');
 await w.call('alice',s=>s.write(id,'me','<p>my notes</p>',{base:''}));
 await assert.rejects(w.call('alice',s=>s.remove(id)),/GM permission/);
 await assert.rejects(w.call('gm',s=>s.remove(id)),/Archive a session before deleting/,'a live session cannot be deleted');
 await w.call('gm',s=>s.archive(id));
 await assert.rejects(w.call('alice',s=>s.remove(id)),/GM permission/,'a player cannot delete, archived or not');
 const before=w.entries.length;
 w.current=w.users.get('gm');
 await w.store('gm').onSocket({type:'journal-request',requestId:'d1',userId:'alice',op:'remove',id},'alice');
 assert.equal(w.entries.length,before);assert.match(w.bus.at(-1).message,/Unknown Game Journal request/);
 assert.equal(canDelete({isGM:false},{archived:true}),false);assert.equal(canDelete({isGM:true},{archived:false}),false);assert.equal(canDelete({isGM:true},{archived:true}),true);
 assert.equal((await w.call('gm',async s=>s.list({archived:true}))).find(s=>s.id===id).canDelete,true);
 assert.equal((await w.call('alice',async s=>s.get('SESSION-002'))).canDelete,false);
 assert.equal(await w.call('gm',s=>s.remove(id)),id);
 assert.deepEqual(w.entries.map(e=>e.getFlag(MOD,'session').id),['SESSION-002'],'the other session is untouched');
 await assert.rejects(w.call('gm',s=>s.remove(id)),/not available/);
});

test('0.20.0 Delete session… is offered to the GM on an archived session only, as a danger button',()=>{
 const base={isGM:true,sessions:[],pages:[],hits:null,query:'',showArchived:true,renaming:null,target:'party',stale:false,dirty:false,error:'',gm:null,page:{html:'',canWrite:false,label:'Party journal',missing:false}};
 const s={id:'SESSION-001',number:1,name:'Old',subtitle:'',createdAt:'2026-10-22T12:00:00.000Z',archived:true,canDelete:true};
 const gm=journalPaneHTML({...base,session:s});
 assert.match(gm,/<button[^>]*ag-btn--danger[^>]*data-jaction="delete"|<button[^>]*data-jaction="delete"[^>]*ag-btn--danger/);
 assert.match(gm,/Delete session…/);
 assert.doesNotMatch(journalPaneHTML({...base,isGM:false,session:{...s,canDelete:false}}),/data-jaction="delete"/);
 assert.doesNotMatch(journalPaneHTML({...base,session:{...s,archived:false,canDelete:false}}),/data-jaction="delete"/);
});

test('0.20.0 toolbar: the new formats map to commands the editor and sanitizer support',()=>{
 const ids=FORMATS.map(f=>f.id);
 for(const id of ['bold','italic','underline','strike','highlight','h1','h2','h3','ul','ol','quote','hr'])assert.ok(ids.includes(id),id);
 for(const f of FORMATS)assert.ok(f.label&&(f.icon||f.text),`${f.id} has a label and a visible mark`);
 assert.deepEqual(FORMAT_COMMANDS.quote,['formatBlock','<blockquote>']);assert.deepEqual(FORMAT_COMMANDS.hr,['insertHorizontalRule']);
 assert.equal(sanitizeHtml('<h1>T</h1><blockquote>q</blockquote><hr><strike>s</strike>'),'<h1>T</h1><blockquote>q</blockquote><hr><s>s</s>');
 const html=journalPaneHTML({isGM:false,sessions:[],pages:[],hits:null,query:'',showArchived:false,renaming:null,target:'me',stale:false,dirty:false,error:'',gm:null,
  session:{id:'SESSION-001',number:1,name:'N',subtitle:'',createdAt:'',archived:false},page:{html:'',canWrite:true,label:'My journal',missing:false}});
 assert.match(html,/data-jaction="autoformat"/);assert.match(html,/Auto format…/);assert.match(html,/data-jaction="autoformat-undo"[^>]*hidden/);
});

test('Auto format: bullets and numbers become lists, spacing and blank lines are tidied, no words change',()=>{
 const r=autoFormatHtml('<p>Hello ,world.It works  fine </p><p>• rope</p><p>• lamp</p><p>1. open</p><p>2) close</p>');
 assert.equal(r.html,'<p>Hello, world. It works fine</p><ul><li>rope</li><li>lamp</li></ul><ol><li>open</li><li>close</li></ol>');
 assert.ok(r.ok&&r.changes.length>=3);
 const t=autoFormatHtml('Gear:<br>- rope<br>- lamp<br><br><br><br>Done  here ,ok');
 assert.equal(t.html,'<h3>Gear</h3><ul><li>rope</li><li>lamp</li></ul><p>Done here, ok</p>');
 assert.ok(t.changes.some(c=>/blank/.test(c)));
 const letters=h=>(htmlToText(h).match(/\p{L}+/gu)??[]).join('');
 for(const h of ['<p>Gear:<br>- a<br>- b</p><p>NEXT STEPS</p><p>x ,y</p>','<p>•  one</p><p>•two</p>'])assert.equal(letters(autoFormatHtml(h).html),letters(sanitizeHtml(h)));
});

test('Auto format is conservative: leaves clean text, existing formatting and doubtful lines alone',()=>{
 for(const keep of ['<p>Already clean.</p>','<h2>Day one</h2><p>We met <strong>Mara</strong>.</p><ul><li>rope</li></ul><blockquote>Hold.</blockquote><hr>',
  '<p>-5 degrees at night</p>','<p>A single - dash line</p>','<p>1. only one numbered line</p>','<p>1. one</p><p>3. three</p>','<p>3.5 gold, 12:30 sharp</p>','<p>See example.com/a?b=c</p>',
  '<p>NPC</p><p>x</p>','<p>THE END.</p>','<p>Last line:</p>','<p>A very long line that ends in a colon but is far more than eight words so it stays text:</p><p>x</p>']){
  const r=autoFormatHtml(keep);assert.equal(r.html,sanitizeHtml(keep),keep);assert.deepEqual(r.changes,[],keep);
 }
 assert.equal(autoFormatHtml('<p>THE ROAD NORTH</p><p>We left.</p>').html,'<h3>THE ROAD NORTH</h3><p>We left.</p>');
 assert.equal(autoFormatHtml('<p>Plans:</p><p>We left.</p>').html,'<h3>Plans</h3><p>We left.</p>');
 assert.equal(autoFormatHtml('<p>Plans for <em>now</em>:</p><p>We left.</p>').html,'<p>Plans for <em>now</em>:</p><p>We left.</p>');
 assert.equal(autoFormatHtml('<p>one <strong>bold</strong> ,two<br>next line</p>').html,'<p>one <strong>bold</strong>, two<br>next line</p>');
 assert.doesNotMatch(autoFormatHtml('<p onclick="x">a</p><script>x</script>').html,/script|onclick/);
 assert.deepEqual(autoFormatHtml(''),{html:'',changes:[],ok:true});
});

test('Auto format in the window: asks first, applies, and Undo auto format puts the page back; cancel changes nothing',async()=>{
 const {installJournal}=await import('../scripts/journal-ui.mjs');
 const asked=[];let yes=true;
 class App{async render(){}}
 installJournal(App,{store:{},danger:async()=>false,confirm:async(m,o)=>{asked.push([m,o]);return yes;},notify:e=>{throw e;},info:m=>asked.push(['info',m]),download(){}});
 const app=new App();app.jv=newJournalView(true);
 const ed={id:'agq-journal-editor',innerHTML:'<p>• rope</p><p>• lamp</p>',style:{},getAttribute:()=>'true',focus(){},isConnected:true};
 const undo={hidden:true},root={querySelector:sel=>sel==='#agq-journal-editor'?ed:sel==='[data-jaction="autoformat-undo"]'?undo:null};
 app.jRoot=root;app.journalStatus=()=>{};
 yes=false;await app.autoFormatJournal(root);
 assert.equal(ed.innerHTML,'<p>• rope</p><p>• lamp</p>','cancel leaves the text alone');assert.equal(app.jv.dirty,false);
 assert.match(asked[0][0],/bulleted list/);assert.equal(asked[0][1].title,'Auto format this page?');
 yes=true;await app.autoFormatJournal(root);
 assert.equal(ed.innerHTML,'<ul><li>rope</li><li>lamp</li></ul>');assert.equal(app.jv.dirty,true,'unsaved until saved: the usual Unsaved changes rules apply');assert.equal(undo.hidden,false);
 app.undoAutoFormat(root);
 assert.equal(ed.innerHTML,'<p>• rope</p><p>• lamp</p>');assert.equal(undo.hidden,true);
 ed.innerHTML='<p>Already clean.</p>';asked.length=0;await app.autoFormatJournal(root);
 assert.deepEqual(asked,[['info','Nothing to tidy: this page is already clean.']]);
});

// ---- 0.21.0 Export a whole journal ----
async function exportWorld(){
 const w=makeWorld();
 const s1=await w.call('gm',s=>s.create({name:'Market day'})),s2=await w.call('gm',s=>s.create({name:'The road'})),s3=await w.call('gm',s=>s.create({name:'Gate'}));
 await w.call('gm',s=>s.rename(s2,{name:'The road',date:'2026-09-02'}));
 await w.call('alice',s=>s.write(s1,'me','<h1>Day</h1><p>ALICE-ONE</p>',{base:''}));
 await w.call('alice',s=>s.write(s3,'me','<p>ALICE-THREE</p>',{base:''}));
 await w.call('bob',s=>s.write(s2,'me','<p>BOB-TWO</p>',{base:''}));
 await w.call('bob',s=>s.write(s1,'party','<p>PARTY-ONE</p>',{base:''}));
 await w.call('gm',s=>s.write(s2,'party','<p>PARTY-TWO</p>',{base:''}));
 await w.call('gm',s=>s.write(s1,GM_TARGET,'<p>GMSECRET-ONE</p>',{base:''}));
 await w.call('gm',s=>s.write(s2,GM_TARGET,'<p>GMSECRET-TWO</p>',{base:''}));
 await w.call('gm',s=>s.archive(s1));
 return {w,s1,s2,s3};
}

test('journalFilename and journalMarkdown: session order, headings, same body format',()=>{
 assert.equal(journalFilename('My World!','group',{date:new Date('2026-10-24T12:00:00Z')}),'My-World-group-journal-2026-10-24.md');
 assert.equal(journalFilename('w','player',{who:"Zoë O'Neil",date:new Date('2026-10-24T12:00:00Z')}),'w-player-zoe-o-neil-journal-2026-10-24.md');
 assert.equal(journalFilename('','gm',{date:new Date('2026-10-24T12:00:00Z')}),'world-gm-journal-2026-10-24.md');
 const md=journalMarkdown('T',[{session:{id:'SESSION-001',number:1,name:'Session 1',subtitle:'',createdAt:'2026-10-01T00:00:00Z',archived:true},html:'<h1>Big</h1><p>a</p>'},
  {session:{id:'SESSION-002',number:2,name:'The road',subtitle:'Rain',date:'2026-09-02'},html:''}],{note:'n'});
 assert.equal(md,'# T\n\nn\n\n## Session 1\n\nSESSION-001 · started 2026-10-01 · archived\n\n### Big\n\na\n\n## Session 2 - The road\n\n*Rain*\n\nSESSION-002 · dated 2026-09-02\n\n*(empty)*\n');
 assert.equal(htmlToMarkdown('<h1>x</h1>'),'# x','default heading levels unchanged');
});

test('0.21.0 exports: one file per journal, every session in order, archived included for the GM',async()=>{
 const {w}=await exportWorld();
 const gmAlice=await w.call('gm',async s=>s.exportJournal('player',{userId:'alice'}));
 assert.equal(gmAlice.count,3);assert.equal(gmAlice.who,'Alice');
 assert.deepEqual([...gmAlice.markdown.matchAll(/^## (.*)$/gm)].map(m=>m[1]),['Session 1 - Market day','Session 2 - The road','Session 3 - Gate'],'oldest first');
 assert.match(gmAlice.markdown,/ALICE-ONE[^]*ALICE-THREE/);assert.match(gmAlice.markdown,/SESSION-001 · started 2026-10-22 · archived/,'archived is marked');
 assert.match(gmAlice.markdown,/dated 2026-09-02/);assert.match(gmAlice.markdown,/archived sessions included \(1\)/);
 assert.doesNotMatch(gmAlice.markdown,/BOB-TWO|PARTY|GMSECRET/);
 assert.match(gmAlice.markdown,/### Day/,'page headings sit under the session heading');
 const group=await w.call('gm',async s=>s.exportJournal('group'));
 assert.match(group.markdown,/PARTY-ONE[^]*PARTY-TWO/);assert.doesNotMatch(group.markdown,/ALICE|BOB|GMSECRET/);
 const gmj=await w.call('gm',async s=>s.exportJournal('gm'));
 assert.match(gmj.markdown,/GMSECRET-ONE[^]*GMSECRET-TWO/);assert.equal(gmj.count,3);assert.doesNotMatch(gmj.markdown,/ALICE|PARTY/);
 await assert.rejects(w.call('gm',async s=>s.exportJournal('player',{userId:'gm'})),/Pick a player/);
 await assert.rejects(w.call('gm',async s=>s.exportJournal('player',{userId:'nobody'})),/Pick a player/);
 await assert.rejects(w.call('gm',async s=>s.exportJournal('nonsense')),/Unknown/);
});

test('0.21.0 a player exports only what they could read: own journal, the group journal, no archived, never the GM journal',async()=>{
 const {w}=await exportWorld();
 const mine=await w.call('alice',async s=>s.exportJournal('player'));
 assert.equal(mine.count,2,'the archived session is hidden from players');assert.match(mine.markdown,/ALICE-THREE/);assert.doesNotMatch(mine.markdown,/ALICE-ONE|archived/);
 assert.equal((await w.call('alice',async s=>s.exportJournal('player',{userId:'alice'}))).count,2);
 assert.equal((await w.call('alice',async s=>s.exportJournal('player',{userId:'me'}))).count,2);
 await assert.rejects(w.call('alice',async s=>s.exportJournal('player',{userId:'bob'})),/can't read/);
 await assert.rejects(w.call('alice',async s=>s.exportJournal('player',{userId:'gm'})),/Pick a player/);
 const grp=await w.call('alice',async s=>s.exportJournal('group'));assert.match(grp.markdown,/PARTY-TWO/);assert.doesNotMatch(grp.markdown,/PARTY-ONE|GMSECRET|BOB/);
 for(const who of ['alice','bob']){
  await assert.rejects(w.call(who,async s=>s.exportJournal('gm')),/GM permission/);
  await assert.rejects(w.call(who,async s=>s.exportJournal('gm',{userId:who})),/GM permission/);
 }
 // Foundry's own grant still applies: a personal page closed by hand stays closed.
 w.entries[1].pages.find(p=>p.name==="Alice's journal").ownership={default:0,alice:0,bob:0};
 await assert.rejects(w.call('alice',async s=>s.exportJournal('player')),/can't read/);
 // Hidden by the GM: no export at all.
 w.access=false;await assert.rejects(w.call('alice',async s=>s.exportJournal('group')),/hidden/);
});

test('0.21.0 no socket message exports anything or carries page text; a forged export request is refused',async()=>{
 const {w}=await exportWorld();
 const gmSide=w.store('gm');w.store('alice');
 const forged={type:'journal-request',requestId:'x1',userId:'alice',kind:'gm'};
 for(const op of ['exportJournal','export','export-gm','exportMarkdown']){
  w.bus.length=0;
  await w.as('gm',()=>gmSide.onSocket({...forged,op},'alice'));
  const receipt=w.bus.find(m=>m.type==='journal-receipt');
  assert.ok(receipt&&receipt.ok===false&&/Unknown Game Journal request/.test(receipt.message),op);
  assert.ok(!JSON.stringify(w.bus).includes('GMSECRET'));
 }
 w.bus.length=0;await w.call('alice',async s=>s.exportJournal('group'));await w.call('gm',async s=>s.exportJournal('gm'));
 assert.equal(w.bus.length,0,'exporting sends nothing over the socket');
});

test('0.21.0 buttons: Export Journal only on a player journal, Export GM Journal never drawn for players',async()=>{
 const {w,s2}=await exportWorld();
 const pane=(user,jv)=>journalPaneHTML(w.as(user,()=>buildJournalModel(w.store(user),jv,w.users.get(user))));
 const btn=(h,action)=>(h.match(new RegExp(`<button[^>]*data-jaction="${action}"[^>]*>`))||[''])[0];
 let h=pane('alice',{...newJournalView(false),sessionId:s2,target:'me'});
 assert.match(btn(h,'export-player'),/data-tooltip="Download every session of your journal/);assert.doesNotMatch(btn(h,'export-player'),/disabled/);
 assert.match(h,/Export Group Journal/);assert.doesNotMatch(h,/Export GM Journal|export-gm|Export This Session|agq-jexport-hint/);
 h=pane('alice',{...newJournalView(false),sessionId:s2,target:'party'});
 assert.match(btn(h,'export-player'),/disabled[^>]*data-tooltip="Switch to My journal to export it\."/);assert.match(h,/Export Journal is off: Switch to My journal to export it\./);
 h=pane('gm',{...newJournalView(true),sessionId:s2,target:'party'});
 assert.match(btn(h,'export-player'),/disabled/);assert.match(h,/Pick a player&#39;s journal under Whose journal/);assert.match(h,/Export GM Journal/);assert.match(h,/Export Group Journal/);
 h=pane('gm',{...newJournalView(true),sessionId:s2,target:'bob'});
 assert.doesNotMatch(btn(h,'export-player'),/disabled/);assert.match(h,/Download every session of Bob&#39;s journal, archived sessions included/);
 assert.doesNotMatch(h,/Export Journal is off/);
 for(const t of ['me','party'])assert.doesNotMatch(pane('bob',{...newJournalView(false),sessionId:s2,target:t}),/export-gm|GM Journal|gm-notes/);
});
