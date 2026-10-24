// Game Journal wired into the Quest Log window and API. Mocked Foundry (no DOM): proves the tab gating, the API and
// the save / conflict / save-before-leaving logic, not the live editor or the look of the book.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';
const callbacks=new Map(),hooks=new Map(),dialogs=[],notes=[];let answer='cancel';
globalThis.Hooks={once:(event,fn)=>callbacks.set(event,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),off:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;}async render(){this.rendered=true;this.lastHTML=await this._renderHTML();return this.lastHTML;}async close(){this.rendered=false;}},
  DialogV2:{wait:async o=>{dialogs.push(o);return o.buttons.find(b=>b.action===answer).callback();}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true},bob={id:'bob',name:'Bob',isGM:false,active:true};
const users=[gm,alice,bob];users.get=id=>users.find(u=>u.id===id);
const settings={playerAccessEnabled:true,compendiumPackIds:'',openForPlayers:false};
const LEVELS={NONE:0,LIMITED:1,OBSERVER:2,OWNER:3};
const permits=(own,u,l)=>u.isGM||(own[u.id]??own.default??0)>=LEVELS[l];
const journal=[],emitted=[];
const doc=(data,parent=null)=>{
 const d={...structuredClone(data),parent,getFlag(m,k){return this.flags?.[m]?.[k];},testUserPermission(u,l){return permits(this.ownership??{default:0},u,l);},
  async update(change){if(parent&&!permits(this.ownership,game.user,'OWNER'))throw new Error('Foundry: no permission');
   for(const [k,v] of Object.entries(change)){if(k==='text.content')this.text.content=v;else if(k.startsWith('flags.')){const [,m,key]=k.split('.');this.flags[m][key]=structuredClone(v);}else this[k]=v;}
   (hooks.get(parent?'updateJournalEntryPage':'updateJournalEntry')??[]).forEach(fn=>fn(this,change,{},game.user.id));}};
 if(!parent)d.pages=(data.pages??[]).map(p=>doc(p,d));
 return d;
};
globalThis.JournalEntry={create:async(data,opts)=>{assert.equal(opts?.renderSheet,false,'never opened');const d=doc(data);journal.push(d);return d;}};
globalThis.Folder={create:async data=>({id:`f-${data.name}`,...data})};
const hub={active:true,api:{playerVisibility:{isShown:key=>key!=='quests'||hubQuests}}};let hubQuests=true;
const module={active:true,api:null};const actors=[];actors.get=()=>null;
globalThis.game={user:gm,users,settings:{register:()=>{},get:(m,k)=>settings[k],set:async(m,k,v)=>{settings[k]=v;}},journal,actors,folders:[],
 modules:{get:id=>id===MOD?module:id==='ashen-gate-character-hub'?hub:null},socket:{emit:(ch,msg)=>emitted.push([ch,msg]),on:(ch,fn)=>{if(ch===`module.${MOD}`)socketHandler=fn;}}};
let socketHandler=null;// the listener ready registers on the Quest Log channel
globalThis.document={querySelectorAll:()=>[]};
globalThis.ui={actors:{element:null},notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
console.error=()=>{};console.warn=()=>{};
await import('../scripts/main.mjs');
callbacks.get('init')();callbacks.get('ready')();
const app=await module.api.open();
const tabsOf=html=>[...html.matchAll(/data-tab="(\w+)"/g)].map(m=>m[1]);
// A minimal window root: the editor and the status line the save reads and writes.
const rootWith=html=>{const ed={innerHTML:html,getAttribute:()=>'true'},status={textContent:''};
 return {ed,status,querySelector:sel=>sel==='#agq-journal-editor'?ed:sel==='[data-journal-status]'?status:null};};

test('the Journal tab sits after Individual for players and the GM; the API is there',async()=>{
 game.user=alice;app.tab='party';assert.deepEqual(tabsOf(await app.render()),['party','individual','journal']);
 game.user=gm;assert.deepEqual(tabsOf(await app.render()),['party','individual','journal','quests','setup']);
 assert.equal(module.api.journal.contract,'ag-quest-journal/1');
 assert.ok(Object.isFrozen(module.api.journal));
});

test('Player Access off, or the Character Hub hiding quests, hides the tab and refuses the API for players',async()=>{
 settings.playerAccessEnabled=false;game.user=alice;
 assert.throws(()=>module.api.journal.list(),/hidden/);assert.equal(module.api.journal.isAvailable(),false);
 settings.playerAccessEnabled=true;hubQuests=false;app.tab='journal';
 const html=await app.render();assert.ok(!tabsOf(html).includes('journal'));assert.equal(app.tab,'party','falls back to Party');
 assert.throws(()=>module.api.journal.list(),/hidden/);
 game.user=gm;assert.ok(tabsOf(await app.render()).includes('journal'),'the GM always has it');assert.deepEqual(module.api.journal.list(),[]);
 hubQuests=true;
});

test('GM New session from the tab, then a player writes, saves, and a conflict asks before replacing',async()=>{
 game.user=gm;app.tab='journal';await app.render();
 await app.journalAction('new',{dataset:{}},rootWith(''));
 assert.equal(journal.length,1);assert.equal(app.jv.sessionId,'SESSION-001');assert.equal(app.jv.renaming,null,'0.20.0: the name form no longer pops open at the top of the list by itself');
 assert.doesNotMatch(app.lastHTML,/id="agq-jr-name"/);assert.match(app.lastHTML,/data-jaction="rename"/,'the pencil is there');
 const root={querySelector:sel=>({'#agq-jr-name':{value:'Market day'},'#agq-jr-subtitle':{value:'Ash and rain'}})[sel]??null};
 await app.journalAction('rename-save',{dataset:{id:'SESSION-001'}},root);
 assert.equal(journal[0].getFlag(MOD,'session').name,'Market day');assert.equal(app.jv.renaming,null);

 // Alice's window
 game.user=alice;app.jv=null;app.tab='journal';let html=await app.render();
 assert.match(html,/Market day[\s\S]*Ash and rain/);assert.equal(app.jv.target,'me');
 let r=rootWith('<p>My <b>notes</b></p>');app.jRoot=r;app.jv.dirty=true;
 assert.equal(await app.saveJournal(r),true);assert.equal(r.status.textContent,'Saved');assert.equal(app.jv.dirty,false);
 assert.equal(journal[0].pages.find(p=>p.flags[MOD].journalPage.userId==='alice').text.content,'<p>My <strong>notes</strong></p>');

 // Party page: Bob saves first; Alice's save from the old text is a conflict.
 app.jv.target='party';await app.render();const base=app.jv.base;
 game.user=bob;await module.api.journal.write('SESSION-001','party','<p>Bob</p>',{base:''});game.user=alice;
 r=rootWith('<p>Alice</p>');app.jRoot=r;app.jv.dirty=true;app.jv.base=base;
 answer='cancel';assert.equal(await app.saveJournal(r),false,'Keep editing: nothing saved');
 assert.equal(dialogs.at(-1).window.title,'Replace the newer text?');assert.equal(dialogs.at(-1).buttons[1].label,'Replace with mine');
 assert.equal(journal[0].pages[0].text.content,'<p>Bob</p>');assert.equal(app.jv.dirty,true,'the text stays unsaved in the page');
 answer='confirm';assert.equal(await app.saveJournal(r),true);assert.equal(journal[0].pages[0].text.content,'<p>Alice</p>');
});

test('leaving the page saves it first; a refused save keeps you there',async()=>{
 game.user=alice;app.tab='journal';await app.render();app.jv.target='me';await app.render();
 const r=rootWith('<p>before switching</p>');app.jRoot=r;app.jv.dirty=true;
 await app.journalAction('target',{dataset:{target:'party'}},r);
 assert.equal(app.jv.target,'party');
 assert.equal(journal[0].pages.find(p=>p.flags[MOD].journalPage.userId==='alice').text.content,'<p>before switching</p>');
 // Archived under her: the save is refused and the switch does not happen.
 game.user=gm;await module.api.journal.archive('SESSION-001');game.user=alice;
 app.jRoot=r;app.jv.dirty=true;r.ed.innerHTML='<p>late</p>';
 await app.journalAction('target',{dataset:{target:'me'}},r);
 assert.equal(app.jv.target,'party');assert.match(notes.at(-1)[1],/archived|not available/);
 game.user=gm;await module.api.journal.restore('SESSION-001');
});

test('a player New session asks the GM over the Quest Log socket and settles on its receipt',async()=>{
 game.user=alice;emitted.length=0;
 const p=module.api.journal.create({});
 const [ch,msg]=emitted[0];
 assert.equal(ch,`module.${MOD}`);assert.deepEqual([msg.type,msg.op,msg.userId],['journal-request','create','alice']);
 // The GM client's answer (its checks are covered in journal.test.mjs), delivered as the socket would.
 await socketHandler({type:'journal-receipt',requestId:msg.requestId,userId:'alice',ok:true,message:'',sessionId:'SESSION-002'},'gm');
 assert.equal(await p,'SESSION-002');
});

test('module.json asks Foundry for the module socket',async()=>{
 const fs=await import('node:fs');const m=JSON.parse(fs.readFileSync(new URL('../module.json',import.meta.url),'utf8'));
 assert.equal(m.socket,true);
});
