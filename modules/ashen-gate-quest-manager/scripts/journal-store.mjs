// Game Journal — the store. Sessions are JournalEntries (see journal-core.mjs for the layout and the rules).
//
// Writes to a page go straight to Foundry: the page's ownership lets its player (or, for the party page, every
// player) write it, so no GM needs to be connected and Foundry's server refuses anyone else. Starting a session,
// renaming one, archiving and restoring change the entry, which only the GM owns: the GM does them directly; a
// player's New session / rename is a request the primary GM's client checks and carries out (a GM must be connected).
// The GM-only notes page (kind 'gm', target 'gm-notes') is NONE for every player in Foundry and refused to players
// here (read, write, search, list); no socket message or receipt ever carries page text. Deleting a session (archived
// ones only) is GM-only and is not a socket operation at all.
// The GM-side checks are the real ones for the socket: the sender must be the user named in the request, connected,
// allowed to use the journal, and (for a rename) the session's creator.
import {JOURNAL_CONTRACT,SESSION_ID,MAX_HTML,GM_TARGET,gmOwnership,canDelete,canSetDate,nextNumber,freeId,cleanTitle,readSession,newSession,sortSessions,currentSession,
 entryOwnership,partyOwnership,personalOwnership,pageFlag,readPageFlag,canUseJournal,canReadPage,canWritePage,canRename,
 sanitizeHtml,searchJournal,sessionMarkdown,journalMarkdown,canExportKind} from './journal-core.mjs';

export const JOURNAL_SOCKET_TYPES=Object.freeze({request:'journal-request',receipt:'journal-receipt'});
const OPS=new Set(['create','rename']);
export class JournalConflict extends Error{constructor(current){super('Someone else saved this page while you were writing.');this.code='conflict';this.current=current;}}

/**
 * deps: {moduleId, users() (iterable with get(id)), me(), entries() (iterable JournalEntry), createEntry(data),
 *        folderId() → Promise<id|null>, access() → Player Access, hubShown() → Character Hub shows 'quests',
 *        isPrimaryGM(), socket?: {emit,on}, now?(), timeout?, randomId?()}
 */
export function createJournalStore(deps){
 const MOD=deps.moduleId,SOCKET=`module.${MOD}`;
 const now=deps.now??Date.now;
 const pending=new Map();
 let queue=Promise.resolve();
 const serial=fn=>{const run=queue.then(fn,fn);queue=run.catch(()=>{});return run;};
 const usersList=()=>[...deps.users()];
 const userById=id=>deps.users().get?.(id)??usersList().find(u=>u.id===id)??null;
 const players=()=>usersList().filter(u=>u&&!u.isGM);
 const flagOf=(doc,key)=>{try{return doc?.getFlag?.(MOD,key)??null;}catch{return null;}};

 function allowed(user=deps.me()){return canUseJournal(user,{access:deps.access(),hubShown:deps.hubShown()});}
 function assertAllowed(user=deps.me()){if(!allowed(user))throw new Error('The Game Journal is hidden by the GM.');}
 const assertGM=(user=deps.me())=>{if(!user?.isGM)throw new Error('GM permission required.');};

 /** Every session entry with its record: [{entry, session}], newest first. Duplicated ids keep the first entry. */
 function rows(){
  const seen=new Set(),out=[];
  for(const entry of deps.entries()){const s=readSession(flagOf(entry,'session'));if(!s||seen.has(s.id))continue;seen.add(s.id);out.push({entry,session:s});}
  return out.sort((a,b)=>b.session.number-a.session.number);
 }
 function rowById(id){if(typeof id!=='string'||!SESSION_ID.test(id))return null;return rows().find(r=>r.session.id===id)??null;}
 const pagesOf=entry=>[...(entry?.pages??[])].map(page=>({page,flag:readPageFlag(flagOf(page,'journalPage'))})).filter(x=>x.flag);
 function pageFor(entry,target){
  const list=pagesOf(entry);
  if(target===GM_TARGET)return list.find(x=>x.flag.kind==='gm')??null;
  return target==='party'?list.find(x=>x.flag.kind==='party')??null:list.find(x=>x.flag.kind==='user'&&x.flag.userId===target)??null;
 }
 /** 'me' is the viewer's own page; a GM has none and gets the party page. */
 const resolveTarget=(target,user)=>target==='me'?(user.isGM?'party':user.id):String(target??'party');
 // A player also needs Foundry to agree (the page grants them OBSERVER), so a page whose grant was changed by hand stays closed.
 const foundryAllows=(page,user,level)=>user.isGM||page?.testUserPermission?.(user,level)!==false;
 const label=(flag,user)=>flag.kind==='gm'?'GM-only notes':flag.kind==='party'?'Party journal':flag.userId===user?.id?'My journal':`${userById(flag.userId)?.name??'Removed player'}'s journal`;

 /** Sessions this user may see: archived ones only for the GM when asked. */
 function list({archived=false}={}){
  const me=deps.me();assertAllowed(me);
  const all=rows().map(r=>r.session),cur=currentSession(all);
  return all.filter(s=>!s.archived||me.isGM&&archived).map(s=>({...s,current:s.id===cur?.id,canRename:canRename(me,s),canSetDate:canSetDate(me),canDelete:canDelete(me,s)}));
 }
 function get(id){
  const me=deps.me();assertAllowed(me);const r=rowById(id);
  if(!r||r.session.archived&&!me.isGM)return null;
  return {...r.session,current:currentSession(rows().map(x=>x.session))?.id===r.session.id,canRename:canRename(me,r.session),canSetDate:canSetDate(me),canDelete:canDelete(me,r.session)};
 }
 /** The pages this user may open in a session, party first: [{target, label, userId}]. */
 function pages(id){
  const me=deps.me();assertAllowed(me);const r=rowById(id);if(!r||r.session.archived&&!me.isGM)return [];
  return pagesOf(r.entry).filter(x=>x.flag.kind!=='gm'&&canReadPage(me,x.flag)&&foundryAllows(x.page,me,'OBSERVER'))
   .map(x=>({target:x.flag.kind==='party'?'party':x.flag.userId,label:label(x.flag,me),userId:x.flag.userId??null}))
   .sort((a,b)=>(a.target==='party'?-1:b.target==='party'?1:a.label.localeCompare(b.label)));
 }
 /** One page: {sessionId, target, label, html, canWrite, missing}. Refuses pages the user may not read. */
 function read(id,target='me'){
  const me=deps.me();assertAllowed(me);const r=rowById(id);
  if(!r||r.session.archived&&!me.isGM)throw new Error('That session is not available.');
  const t=resolveTarget(target,me),found=pageFor(r.entry,t);
  const flag=found?.flag??(t==='party'?pageFlag(id,'party'):t===GM_TARGET?pageFlag(id,'gm'):pageFlag(id,'user',t));
  if(!canReadPage(me,flag)||found&&!foundryAllows(found.page,me,'OBSERVER'))throw new Error("You can't read that journal page.");
  if(!found)return {sessionId:id,target:t,label:label(flag,me),html:'',canWrite:false,missing:true};
  return {sessionId:id,target:t,label:label(flag,me),html:sanitizeHtml(found.page.text?.content??''),
   canWrite:canWritePage(me,flag,r.session)&&foundryAllows(found.page,me,'OWNER'),missing:false};
 }
 /** Saves a page. `base` is the text the writer started from: if the page changed since, JournalConflict (unless force). */
 async function write(id,target,html,{base,force=false}={}){
  const me=deps.me();assertAllowed(me);const r=rowById(id);
  if(!r)throw new Error('That session is not available.');
  const t=resolveTarget(target,me),found=pageFor(r.entry,t);
  if(t===GM_TARGET&&!me.isGM)throw new Error("You can't write that journal page.");
  if(!found)throw new Error('This journal page is not set up yet: it is added the next time the GM is connected.');
  if(!canWritePage(me,found.flag,r.session)||!foundryAllows(found.page,me,'OWNER'))throw new Error(r.session.archived?'This session is archived: it can be read, not changed.':"You can't write that journal page.");
  if(typeof html!=='string')throw new TypeError('Journal text must be text.');
  const clean=sanitizeHtml(html);if(clean.length>MAX_HTML)throw new Error('This page is too long to save. Split it across sessions.');
  const current=sanitizeHtml(found.page.text?.content??'');
  if(clean===current)return current;
  if(!force&&base!==undefined&&sanitizeHtml(base)!==current)throw new JournalConflict(current);
  await found.page.update({'text.content':clean});
  return sanitizeHtml(found.page.text?.content??clean);
 }

 /* ---- GM-side changes to the entry ---- */
 function pageData(sessionIdValue,kind,user=null){
  const users=usersList();
  if(kind==='gm')return {name:'GM-only notes',type:'text',text:{format:1,content:''},ownership:gmOwnership(users),flags:{[MOD]:{journalPage:pageFlag(sessionIdValue,'gm')}},sort:200};
  return kind==='party'
   ?{name:'Party journal',type:'text',text:{format:1,content:''},ownership:partyOwnership(),flags:{[MOD]:{journalPage:pageFlag(sessionIdValue,'party')}},sort:0}
   :{name:`${user.name}'s journal`,type:'text',text:{format:1,content:''},ownership:personalOwnership(user.id,users),flags:{[MOD]:{journalPage:pageFlag(sessionIdValue,'user',user.id)}},sort:100};
 }
 function performCreate(input,requester){
  return serial(async()=>{
   assertAllowed(requester);
   const all=rows().map(r=>r.session),{number,id}=freeId(nextNumber(all),all);
   const session=newSession({number,id,name:input?.name,subtitle:input?.subtitle,createdBy:requester.id,now:now()});
   await deps.createEntry({name:`Game Journal — ${session.name}`,folder:await deps.folderId(),ownership:entryOwnership(),
    flags:{[MOD]:{session}},pages:[pageData(id,'party'),pageData(id,'gm'),...players().map(u=>pageData(id,'user',u))]});
   return session.id;
  });
 }
 function performRename(input,requester){
  return serial(async()=>{
   assertAllowed(requester);const r=rowById(input?.id);
   if(!r||r.session.archived&&!requester.isGM)throw new Error('That session is not available.');
   if(!canRename(requester,r.session))throw new Error('Only the GM and the player who started this session can rename it.');
   const t=cleanTitle({name:input.name,subtitle:input.subtitle,date:input.date});
   // The date is the GM's to set; a player's rename that names another date is refused, not ignored.
   if(input.date!==undefined&&!canSetDate(requester)&&t.date!==(r.session.date??''))throw new Error('Only the GM can change the date.');
   const next={...r.session,name:t.name,subtitle:t.subtitle};
   if(input.date!==undefined){if(t.date)next.date=t.date;else delete next.date;}
   if(JSON.stringify(next)!==JSON.stringify(r.session))
    await r.entry.update({name:`Game Journal — ${t.name}`,[`flags.${MOD}.session`]:next});
   return r.session.id;
  });
 }
 async function setArchived(id,archived){
  const me=deps.me();assertGM(me);const r=rowById(id);if(!r)throw new Error('That session is not available.');
  if(r.session.archived!==archived)await r.entry.update({[`flags.${MOD}.session`]:{...r.session,archived}});
  return id;
 }
 /** GM only: permanently deletes an ARCHIVED session and all its pages. Not available over the socket. */
 async function remove(id){
  const me=deps.me();assertGM(me);const r=rowById(id);if(!r)throw new Error('That session is not available.');
  if(!canDelete(me,r.session))throw new Error('Archive a session before deleting it.');
  await r.entry.delete();
  return id;
 }
 /** GM: adds the personal pages missing from a session (a player added after it started) and a missing party page. */
 async function ensurePages(){
  const me=deps.me();if(!me?.isGM)return 0;let added=0;
  for(const {entry,session} of rows()){
   const have=pagesOf(entry),want=[];
   if(!have.some(x=>x.flag.kind==='party'))want.push(pageData(session.id,'party'));
   // 0.20.0 migration: sessions made before the GM-only notes page get one. Re-running adds nothing.
   if(!have.some(x=>x.flag.kind==='gm'))want.push(pageData(session.id,'gm'));
   for(const u of players())if(!have.some(x=>x.flag.kind==='user'&&x.flag.userId===u.id))want.push(pageData(session.id,'user',u));
   if(want.length){await entry.createEmbeddedDocuments('JournalEntryPage',want,{renderSheet:false});added+=want.length;}
  }
  return added;
 }

 /** From any client: a GM acts directly; a player asks the primary GM's client. */
 function request(op,payload){
  const me=deps.me();assertAllowed(me);
  if(me.isGM)return op==='create'?performCreate(payload,me):performRename(payload,me);
  if(!usersList().some(u=>u.isGM&&u.active))return Promise.reject(new Error(op==='create'?'A GM must be connected to start a new session. You can still write in the sessions you have.':'A GM must be connected to rename a session.'));
  if(!deps.socket?.emit)return Promise.reject(new Error('The Quest Log socket is unavailable.'));
  const requestId=deps.randomId?.()??globalThis.crypto.randomUUID();
  return new Promise((ok,fail)=>{
   const timer=setTimeout(()=>{pending.delete(requestId);fail(new Error('The GM client did not answer. Nothing was changed.'));},deps.timeout??15000);
   pending.set(requestId,{ok,fail,timer});
   deps.socket.emit(SOCKET,{type:JOURNAL_SOCKET_TYPES.request,requestId,userId:me.id,op,
    id:payload?.id,name:typeof payload?.name==='string'?payload.name.slice(0,500):undefined,subtitle:typeof payload?.subtitle==='string'?payload.subtitle.slice(0,500):undefined,
    date:typeof payload?.date==='string'?payload.date.slice(0,20):undefined});
  });
 }
 /** Every client: receipts for its own requests; the primary GM: requests. Receipts carry only the session id. */
 async function onSocket(msg,senderId){
  if(!msg||typeof msg!=='object')return false;
  if(msg.type===JOURNAL_SOCKET_TYPES.receipt){
   const p=msg.userId===deps.me()?.id&&pending.get(msg.requestId);if(!p)return true;
   pending.delete(msg.requestId);clearTimeout(p.timer);msg.ok?p.ok(msg.sessionId??null):p.fail(new Error(msg.message||'The GM client refused the request.'));return true;
  }
  if(msg.type!==JOURNAL_SOCKET_TYPES.request)return false;
  if(!deps.me()?.isGM||!deps.isPrimaryGM())return true;
  let ok=false,message='',sessionIdValue=null;
  try{
   if(typeof senderId==='string'&&senderId!==msg.userId)throw new Error('Request sender mismatch.');
   const user=userById(msg.userId);if(!user?.active)throw new Error('Unknown requester.');
   if(!OPS.has(msg.op))throw new Error('Unknown Game Journal request.');
   for(const k of ['name','subtitle','date'])if(msg[k]!==undefined&&typeof msg[k]!=='string')throw new TypeError('Names must be text.');
   sessionIdValue=msg.op==='create'?await performCreate({name:msg.name,subtitle:msg.subtitle},user):await performRename({id:msg.id,name:msg.name,subtitle:msg.subtitle,date:msg.date},user);
   ok=true;
  }catch(e){message=e?.message||String(e);console.warn(`${MOD} | refused Game Journal ${msg.op} from ${msg.userId}: ${message}`);}
  deps.socket?.emit?.(SOCKET,{type:JOURNAL_SOCKET_TYPES.receipt,requestId:msg.requestId,userId:msg.userId,ok,message,sessionId:ok?sessionIdValue:null});
  return true;
 }

 /** Search the session names and every page this user may read. */
 function search(query){
  const me=deps.me();assertAllowed(me);
  const data=rows().filter(r=>!r.session.archived||me.isGM).map(r=>({session:r.session,
   pages:pagesOf(r.entry).filter(x=>canReadPage(me,x.flag)&&foundryAllows(x.page,me,'OBSERVER'))
    .map(x=>({target:x.flag.kind==='party'?'party':x.flag.kind==='gm'?GM_TARGET:x.flag.userId,label:label(x.flag,me),html:x.page.text?.content??''}))}));
  return searchJournal(data,query);
 }
 /** GM only: one session as Markdown (party journal, then each player's). */
 function exportMarkdown(id,opts={}){
  const me=deps.me();assertGM(me);const r=rowById(id);if(!r)throw new Error('That session is not available.');
  const list=pagesOf(r.entry).filter(x=>x.flag.kind!=='gm'||opts?.includeGmNotes===true).map(x=>({party:x.flag.kind==='party',label:label(x.flag,null),html:x.page.text?.content??''}))
   .sort((a,b)=>a.party?-1:b.party?1:a.label.localeCompare(b.label));
  return sessionMarkdown(r.session,list);
 }
 /**
  * One journal across every session, in session order, as Markdown (the same body format as exportMarkdown).
  * kind 'player': opts.userId is whose journal (a player: only their own; the GM: any player's). 'group': the party
  * journal. 'gm': the GM-only notes, GM only. Archived sessions are included for the GM; a player never sees them, so
  * they are not exported either. Every page is checked like a read: nobody exports what they cannot open.
  * Returns {markdown, label, who, count}. Not a socket operation: it only reads what this client may already read.
  */
 function exportJournal(kind,opts={}){
  const me=deps.me();assertAllowed(me);
  if(!canExportKind(me,kind))throw new Error(kind==='gm'?'GM permission required.':'Unknown journal to export.');
  let matches,title,who='';
  if(kind==='gm'){matches=x=>x.kind==='gm';title='GM-only notes';}
  else if(kind==='group'){matches=x=>x.kind==='party';title='Party journal';}
  else{
   const uid=opts?.userId==null||opts.userId==='me'?me.id:String(opts.userId),owner=userById(uid);
   if(!owner||owner.isGM)throw new Error('Pick a player whose journal to export.');
   if(!canReadPage(me,{kind:'user',userId:uid}))throw new Error("You can't read that journal page.");
   matches=x=>x.kind==='user'&&x.userId===uid;who=owner.name;title=uid===me.id?'My journal':`${owner.name}'s journal`;
  }
  const sections=[];
  for(const r of rows().filter(r=>!r.session.archived||me.isGM).sort((a,b)=>a.session.number-b.session.number)){
   const found=pagesOf(r.entry).find(x=>matches(x.flag));
   if(found&&(!canReadPage(me,found.flag)||!foundryAllows(found.page,me,'OBSERVER')))throw new Error("You can't read that journal page.");
   sections.push({session:r.session,html:found?.page.text?.content??''});
  }
  const archived=sections.filter(x=>x.session.archived).length;
  const note=`${sections.length} session${sections.length===1?'':'s'}${me.isGM?`, archived sessions included${archived?` (${archived})`:''}`:''}, oldest first.`;
  return {markdown:journalMarkdown(`${title} — every session`,sections,{note}),label:title,who,count:sections.length};
 }
 const isJournalDoc=doc=>!!readSession(flagOf(doc,'session'))||!!readPageFlag(flagOf(doc,'journalPage'));

 return {contract:JOURNAL_CONTRACT,allowed,list,get,pages,read,write,
  create:(input={})=>request('create',input),rename:(id,input={})=>request('rename',{...input,id}),
  archive:id=>setArchived(id,true),restore:id=>setArchived(id,false),remove,ensurePages,search,exportMarkdown,exportJournal,onSocket,isJournalDoc,
  sortSessions};
}
