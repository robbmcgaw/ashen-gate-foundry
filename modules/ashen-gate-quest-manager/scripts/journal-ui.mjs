// Game Journal tab: a session sidebar (newest first, rename inline, search) and an open-book editor.
// The markup functions take a plain model (buildJournalModel) so they are tested without Foundry. The editor is a
// contenteditable two-page spread with its own toolbar (bold, italic, underline, headings, lists); what it stores
// is cleaned by journal-core.mjs sanitizeHtml, so only those tags (no attributes) ever reach a page.
import {cleanText as E} from './core.mjs';
import {emptyState} from './gm-panels.mjs';
import {sanitizeHtml,MAX_NAME,MAX_SUBTITLE} from './journal-core.mjs';

const KINDS={primary:'ag-btn ag-btn--primary',secondary:'ag-btn',danger:'ag-btn ag-btn--danger',ghost:'ag-btn ag-btn--ghost'};
const tip=t=>t?` data-tooltip="${E(t)}" data-tooltip-class="ag-tooltip"`:'';
const icon=i=>i?`<i class="fa-solid ${E(i)}" aria-hidden="true"></i>`:'';
/** Kit button wired by the journal's own binder (data-jaction), never by the Quest Log's GM action handler. */
export function jbtn(label,jaction,{kind='secondary',sm=false,icon:i='',data={},disabled=false,title='',iconOnly=false,pressed=null}={}){
 const cls=[KINDS[kind]||KINDS.secondary,sm?'ag-btn--sm':'',iconOnly?'ag-btn--icon':''].filter(Boolean).join(' ');
 const attrs=Object.entries(data).map(([k,v])=>` data-${E(k)}="${E(v)}"`).join('');
 const aria=(iconOnly?` aria-label="${E(label)}"${tip(title||label)}`:tip(title))+(pressed===null?'':` aria-pressed="${pressed}"`);
 return `<button type="button" data-jaction="${E(jaction)}" class="${cls}"${attrs}${disabled?' disabled':''}${aria}>${iconOnly?icon(i):i?`${icon(i)} ${E(label)}`:E(label)}</button>`;
}
const day=iso=>{if(!iso)return '';try{const d=new Date(iso);return Number.isNaN(d.getTime())?'':d.toLocaleDateString();}catch{return '';}};

export const FORMATS=Object.freeze([
 {id:'bold',label:'Bold',icon:'fa-bold',key:'Ctrl+B'},{id:'italic',label:'Italic',icon:'fa-italic',key:'Ctrl+I'},
 {id:'underline',label:'Underline',icon:'fa-underline',key:'Ctrl+U'},
 {id:'h2',label:'Heading',icon:'fa-heading'},{id:'h3',label:'Subheading',text:'H3'},{id:'p',label:'Normal text',icon:'fa-paragraph'},
 {id:'ul',label:'Bulleted list',icon:'fa-list-ul'},{id:'ol',label:'Numbered list',icon:'fa-list-ol'}
]);
/** document.execCommand for each toolbar button (supported by the Chromium-based Foundry app and current browsers). */
export const FORMAT_COMMANDS=Object.freeze({bold:['bold'],italic:['italic'],underline:['underline'],h2:['formatBlock','<h2>'],h3:['formatBlock','<h3>'],p:['formatBlock','<p>'],ul:['insertUnorderedList'],ol:['insertOrderedList']});

export const newJournalView=isGM=>({sessionId:null,target:isGM?'party':'me',query:'',showArchived:false,renaming:null,base:'',dirty:false,stale:false,key:''});

/** What the tab shows, read through the store (so every permission check applies). */
export function buildJournalModel(store,jv,me){
 const sessions=store.list({archived:jv.showArchived});
 if(!sessions.some(s=>s.id===jv.sessionId))jv.sessionId=(sessions.find(s=>s.current)??sessions[0])?.id??null;
 const session=sessions.find(s=>s.id===jv.sessionId)??null;
 const pages=session?store.pages(session.id):[];
 if(me.isGM&&!pages.some(p=>p.target===jv.target))jv.target='party';
 if(!me.isGM&&!['me','party'].includes(jv.target))jv.target='me';
 let page=null,error='';
 if(session)try{page=store.read(session.id,jv.target);}catch(e){error=e?.message??String(e);}
 const hits=jv.query.trim()?store.search(jv.query):null;
 return {isGM:!!me.isGM,sessions,session,pages,page,error,hits,query:jv.query,showArchived:jv.showArchived,renaming:jv.renaming,target:jv.target,stale:jv.stale,dirty:jv.dirty};
}

function sessionRow(s,m){
 const on=s.id===m.session?.id;
 if(m.renaming===s.id&&s.canRename)return `<div class="ag-row agq-jsession agq-jsession--edit is-selected" data-session-row="${E(s.id)}">
  <label class="ag-field">Name<input id="agq-jr-name" maxlength="${MAX_NAME}" value="${E(s.name)}"></label>
  <label class="ag-field">Subtitle (optional)<input id="agq-jr-subtitle" maxlength="${MAX_SUBTITLE}" value="${E(s.subtitle)}" placeholder="e.g. The road to the gate"></label>
  <div class="agq-jsession__actions">${jbtn('Cancel','rename-cancel',{kind:'ghost',sm:true})}${jbtn('Save','rename-save',{kind:'primary',sm:true,data:{id:s.id}})}</div></div>`;
 const badges=[s.current?'<span class="ag-badge ag-badge--accent">Current</span>':'',s.archived?`<span class="ag-badge">${icon('fa-box-archive')}Archived</span>`:''].join('');
 return `<div class="ag-row agq-jsession${on?' is-selected':''}" data-session-row="${E(s.id)}"${on?' aria-current="true"':''}>
  <button type="button" class="agq-jsession__main" data-jaction="select" data-id="${E(s.id)}">${icon(on?'fa-folder-open':'fa-folder')}<span class="agq-jsession__text"><span class="ag-row__title">${E(s.name)}</span>${s.subtitle?`<span class="ag-row__meta agq-jsession__sub">${E(s.subtitle)}</span>`:''}<span class="agq-jsession__meta">Session ${E(s.number)}${day(s.createdAt)?` · ${E(day(s.createdAt))}`:''}${badges}</span></span></button>
  ${s.canRename?jbtn(`Rename ${s.name}`,'rename',{kind:'ghost',sm:true,iconOnly:true,icon:'fa-pen',data:{id:s.id},title:'Rename this session'}):''}</div>`;
}
/** The list part of the sidebar: sessions, or the search results while a search is typed. */
export function journalListHTML(m){
 if(m.hits){
  if(!m.hits.length)return emptyState('Nothing found','No session name or journal page you can read matches that search.',{iconName:'fa-magnifying-glass'});
  return `<div class="ag-rows agq-jhits">${m.hits.map(h=>{const s=m.sessions.find(x=>x.id===h.sessionId);return `<button type="button" class="ag-row agq-jhit" data-jaction="hit" data-id="${E(h.sessionId)}" data-target="${E(h.target)}"><span class="ag-row__main"><span class="ag-row__title">${E(s?.name??h.sessionId)}</span><span class="ag-row__meta">${E(h.label)}</span><span class="agq-jhit__snippet">${E(h.snippet)}</span></span></button>`;}).join('')}</div>`;
 }
 if(!m.sessions.length)return emptyState('No sessions yet','Start one with New session: it gets a party journal and a journal for each player.',{iconName:'fa-book',action:jbtn('New session','new',{sm:true,icon:'fa-plus'})});
 return `<div class="ag-rows agq-jsessions">${m.sessions.map(s=>sessionRow(s,m)).join('')}</div>`;
}
export function journalSidebarHTML(m){
 return `<aside class="ag-split__list agq-jside" aria-label="Sessions" data-ag-scroll="journal-list">
  <div class="agq-jside__tools"><label class="ag-search">${icon('fa-magnifying-glass')}<input type="search" id="agq-journal-search" placeholder="Search journals" aria-label="Search the sessions and journal pages you can read" value="${E(m.query)}"></label>${jbtn('New session','new',{kind:'primary',sm:true,icon:'fa-plus',title:'Start a new session: a party journal and one for each player'})}</div>
  ${m.isGM?`<label class="ag-field ag-field--inline agq-jside__archived"><input type="checkbox" id="agq-journal-archived" ${m.showArchived?'checked':''}> Show archived sessions</label>`:''}
  <div id="agq-journal-list">${journalListHTML(m)}</div></aside>`;
}
function whichJournal(m){
 if(m.isGM)return `<label class="ag-field agq-jwho">Journal<select id="agq-journal-who">${m.pages.map(p=>`<option value="${E(p.target)}" ${p.target===m.target?'selected':''}>${E(p.label)}</option>`).join('')}</select></label>`;
 return `<div class="agq-jtoggle" role="group" aria-label="Which journal">${jbtn('My journal','target',{sm:true,icon:'fa-user',data:{target:'me'},pressed:m.target==='me',kind:m.target==='me'?'primary':'secondary'})}${jbtn('Party journal','target',{sm:true,icon:'fa-users',data:{target:'party'},pressed:m.target==='party',kind:m.target==='party'?'primary':'secondary'})}</div>`;
}
const notice=(kind,ic,text)=>`<p class="ag-notice ag-notice--${kind}">${icon(ic)} ${E(text)}</p>`;
export function journalDetailHTML(m){
 const s=m.session;
 if(!s)return `<section class="ag-split__detail agq-jdetail">${emptyState('No session open','Pick a session on the left, or start one with New session.',{iconName:'fa-book-open'})}</section>`;
 const p=m.page,canWrite=!!p?.canWrite;
 const gmTools=m.isGM?`${jbtn('Export Markdown','export',{kind:'ghost',sm:true,icon:'fa-file-arrow-down',title:'Download this session (party journal and every player journal) as a Markdown file'})}${s.archived?jbtn('Restore session','restore',{sm:true,icon:'fa-box-open'}):jbtn('Archive session','archive',{kind:'danger',sm:true,icon:'fa-box-archive'})}`:'';
 const notes=[
  s.archived?notice('warn','fa-box-archive','This session is archived: players no longer see it and its pages are read only. Restore it to write again.'):'',
  m.error?notice('warn','fa-triangle-exclamation',m.error):'',
  p?.missing?notice('info','fa-circle-info','This journal page is not set up yet. It is added the next time the GM is connected.'):'',
  m.isGM&&p&&!p.missing&&p.target!=='party'?notice('info','fa-eye',"You are reading a player's own journal. Only they can write it."):'',
  m.stale?notice('warn','fa-rotate','Someone else saved this page while you were writing. Save asks before replacing their text.'):''
 ].join('');
 const tools=canWrite?`<div class="agq-jtools" role="toolbar" aria-label="Formatting">${FORMATS.map(f=>`<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm${f.icon?' ag-btn--icon':''} agq-jtool" data-format="${f.id}" aria-label="${E(f.label)}"${tip(f.key?`${f.label} (${f.key})`:f.label)}>${f.icon?icon(f.icon):E(f.text)}</button>`).join('')}</div>`:'';
 const label=p?.label??'Journal';
 const book=p&&!p.missing?`<div class="agq-book"><div class="agq-book__pages" id="agq-journal-editor" contenteditable="${canWrite?'true':'false'}" role="textbox" aria-multiline="true" aria-readonly="${canWrite?'false':'true'}" aria-label="${E(`${s.name}: ${label}`)}" spellcheck="true" data-placeholder="${E(canWrite?'Write here…':'Nothing written yet.')}">${sanitizeHtml(p.html)}</div></div>`:'';
 const footer=canWrite?`<footer class="ag-footer agq-footer agq-jfooter">${jbtn('Discard changes','discard',{kind:'ghost'})}<span class="ag-footer__status" role="status" data-journal-status>${m.dirty?'Unsaved changes':'Saved'}</span>${jbtn('Save','save',{kind:'primary',icon:'fa-floppy-disk'})}</footer>`:'';
 return `<section class="ag-split__detail agq-jdetail" data-ag-scroll="journal-page:${E(s.id)}:${E(m.target)}">
  <header class="agq-jhead"><div class="agq-jhead__title"><h2 class="agq-detail__title">${E(s.name)}</h2>${s.subtitle?`<p class="agq-jhead__sub">${E(s.subtitle)}</p>`:''}</div>
  <div class="agq-jhead__tools">${whichJournal(m)}${gmTools}</div></header>${notes}${tools}${book}${footer}</section>`;
}
export function journalPaneHTML(m){return `<div class="ag-split agq-split agq-journal">${journalSidebarHTML(m)}${journalDetailHTML(m)}</div>`;}

/**
 * Adds the journal's methods to the Quest Log window class.
 * ctx: {store, confirm(message, opts), notify(err), info(message), download(name, text, type)}
 */
export function installJournal(App,ctx){
 const {store}=ctx;
 Object.assign(App.prototype,{
  journalView(){return this.jv??=newJournalView(!!game.user?.isGM);},
  journalKey(){const jv=this.journalView();return `${jv.sessionId??''}|${jv.target}`;},
  journalHTML(){
   const jv=this.journalView(),m=buildJournalModel(store,jv,game.user);
   const key=this.journalKey();if(jv.key!==key){jv.key=key;jv.dirty=false;jv.stale=false;}
   if(!jv.dirty)jv.base=m.page?.html??'';m.dirty=jv.dirty;
   return journalPaneHTML(m);
  },
  journalStatus(text){const el=this.jRoot?.querySelector?.('[data-journal-status]');if(el)el.textContent=text;},
  bindJournal(root){
   this.jRoot=root;const jv=this.journalView();
   const pane=root.querySelector('.agq-journal');if(!pane)return;
   pane.addEventListener('click',e=>{const b=e.target?.closest?.('[data-jaction]');if(b&&pane.contains(b))this.journalAction(b.dataset.jaction,b,root).catch(ctx.notify);});
   const search=root.querySelector('#agq-journal-search');
   search?.addEventListener('input',()=>{jv.query=search.value;this.refreshJournalList(root);});
   root.querySelector('#agq-journal-archived')?.addEventListener('change',async e=>{if(!await this.flushJournal())return;jv.showArchived=e.target.checked;await this.render();});
   root.querySelector('#agq-journal-who')?.addEventListener('change',async e=>{const want=e.target.value;if(!await this.flushJournal()){e.target.value=jv.target;return;}jv.target=want;await this.render();});
   for(const el of [root.querySelector('#agq-jr-name'),root.querySelector('#agq-jr-subtitle')])el?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();root.querySelector('[data-jaction="rename-save"]')?.click();}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();root.querySelector('[data-jaction="rename-cancel"]')?.click();}});
   if(jv.renaming){const n=root.querySelector('#agq-jr-name');n?.focus?.();n?.select?.();}
   const ed=root.querySelector('#agq-journal-editor');if(!ed||ed.getAttribute('contenteditable')!=='true'){fitSpread(ed);return;}
   // Enter starts a paragraph, not a div (Chromium's default).
   ed.addEventListener('focus',()=>{try{document.execCommand('defaultParagraphSeparator',false,'p');}catch{}},{once:true});
   ed.addEventListener('input',()=>{jv.dirty=true;this.journalStatus('Unsaved changes');fitSpread(ed,{grow:true});});
   // Pasted text keeps only the formatting the journal allows.
   ed.addEventListener('paste',e=>{const data=e.clipboardData;if(!data)return;e.preventDefault();
    const html=data.getData('text/html'),text=data.getData('text/plain');
    const clean=html?sanitizeHtml(html):E(text).replace(/\r?\n/g,'<br>');
    document.execCommand('insertHTML',false,clean);});
   ed.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key?.toLowerCase()==='s'){e.preventDefault();e.stopPropagation();this.saveJournal(root).catch(ctx.notify);}});
   // Save on blur: leaving the page for anything but its own toolbar saves it.
   ed.addEventListener('focusout',e=>{if(e.relatedTarget&&root.querySelector('.agq-jtools')?.contains(e.relatedTarget))return;
    if(jv.dirty)this.saveJournal(root).catch(ctx.notify);else if(jv.refreshPending){jv.refreshPending=false;this.externalRender=true;this.render();}});
   for(const b of root.querySelectorAll('[data-format]')){
    b.addEventListener('mousedown',e=>e.preventDefault());// keep the text selection in the page
    b.addEventListener('click',()=>{const [cmd,arg]=FORMAT_COMMANDS[b.dataset.format]??[];if(!cmd)return;ed.focus();document.execCommand(cmd,false,arg);jv.dirty=true;this.journalStatus('Unsaved changes');fitSpread(ed,{grow:true});});
   }
   fitSpread(ed);
  },
  refreshJournalList(root){
   const wrap=root.querySelector('#agq-journal-list');if(!wrap)return;
   try{wrap.innerHTML=journalListHTML(buildJournalModel(store,{...this.journalView()},game.user));}catch(e){ctx.notify(e);}
  },
  /** Saves the open page if it has unsaved changes. Resolves false when it could not (the text stays in the page). */
  async saveJournal(root=this.jRoot){
   const jv=this.journalView();
   while(this.jSaving)await this.jSaving.catch(()=>{});
   const ed=root?.querySelector?.('#agq-journal-editor');if(!jv.dirty||!ed)return true;
   const run=(async()=>{
    const html=ed.innerHTML,id=jv.sessionId,target=jv.target;this.journalStatus('Saving…');
    const done=saved=>{jv.base=saved;jv.stale=false;if(ed.innerHTML===html)jv.dirty=false;this.journalStatus(jv.dirty?'Unsaved changes':'Saved');return true;};
    try{return done(await store.write(id,target,html,{base:jv.base}));}
    catch(e){
     if(e?.code!=='conflict'){this.journalStatus('Not saved');ctx.notify(e);return false;}
     jv.stale=true;
     if(await ctx.confirm('Someone else saved this page while you were writing. Replace their text with yours? Their version is lost if you do.',{title:'Replace the newer text?',yes:'Replace with mine',no:'Keep editing',danger:true}))
      return done(await store.write(id,target,html,{force:true}));
     this.journalStatus('Not saved: copy your text, then Discard changes to see theirs.');return false;
    }
   })();
   this.jSaving=run;
   try{return await run;}finally{if(this.jSaving===run)this.jSaving=null;}
  },
  async flushJournal(){if(this.tab!=='journal'||!this.jv?.dirty)return true;return this.saveJournal();},
  /** Another client changed a journal or quest: keep unsaved text; redraw only what is safe to redraw. */
  journalExternal(){
   const jv=this.journalView(),root=this.jRoot;
   if(!jv.renaming)this.refreshJournalList(root??{querySelector:()=>null});
   if(jv.dirty){
    try{const cur=jv.sessionId?store.read(jv.sessionId,jv.target):null;
     if(cur&&cur.html!==jv.base&&!jv.stale){jv.stale=true;this.journalStatus('Someone else saved this page. Save asks before replacing their text.');}}catch{}
    return;
   }
   const ed=root?.querySelector?.('#agq-journal-editor'),active=globalThis.document?.activeElement;
   if(jv.renaming||ed&&active&&ed.contains?.(active)){jv.refreshPending=true;return;}
   this.externalRender=true;this.render();
  },
  async journalAction(action,el,root){
   const jv=this.journalView(),id=el.dataset.id;
   if(action==='save')return void await this.saveJournal(root);
   if(action==='discard'){if(jv.dirty&&!await ctx.confirm('Discard your unsaved changes to this page?',{title:'Discard unsaved changes?',yes:'Discard changes',no:'Keep editing',danger:true}))return;jv.dirty=false;jv.stale=false;jv.key='';return void await this.render();}
   if(action==='rename-cancel'){jv.renaming=null;return void await this.render();}
   if(action==='rename-save'){
    const name=root.querySelector('#agq-jr-name')?.value??'',subtitle=root.querySelector('#agq-jr-subtitle')?.value??'';
    await store.rename(id,{name,subtitle});jv.renaming=null;return void await this.render();
   }
   // Everything below leaves the open page: save it first (a refused save stays put).
   if(!await this.flushJournal())return;
   if(action==='select'){jv.sessionId=id;jv.renaming=null;return void await this.render();}
   if(action==='hit'){jv.sessionId=id;const t=el.dataset.target;jv.target=game.user?.isGM?t:t===game.user?.id?'me':'party';return void await this.render();}
   if(action==='target'){jv.target=el.dataset.target;return void await this.render();}
   if(action==='rename'){jv.renaming=id;return void await this.render();}
   if(action==='new'){
    const sid=await store.create({});jv.sessionId=sid;jv.query='';jv.renaming=sid;jv.target=game.user?.isGM?'party':'me';
    ctx.info('New session started. Give it a name and an optional subtitle.');return void await this.render();
   }
   const s=jv.sessionId?store.get(jv.sessionId):null;if(!s)return;
   if(action==='export')return ctx.download(`${s.id} ${s.name}.md`.replace(/[\\/:*?"<>|]+/g,'-'),store.exportMarkdown(s.id),'text/markdown');
   if(action==='archive'){
    if(!await ctx.confirm(`Archive ${s.name}? Players no longer see it and its pages become read only. Nothing is deleted: tick Show archived sessions to find it and restore it.`,{title:`Archive ${s.name}?`,yes:'Archive session',danger:true}))return;
    await store.archive(s.id);return void await this.render();
   }
   if(action==='restore'){await store.restore(s.id);return void await this.render();}
  }
 });
}
/** Two-page spread: the left page fills first, then the right; past that both pages grow taller together.
    While typing it only grows (no jump); a redraw measures it afresh. */
export function fitSpread(ed,{grow=false}={}){
 if(!ed?.style||typeof globalThis.getComputedStyle!=='function')return;
 try{
  if(!grow)ed.style.height='';
  if(String(getComputedStyle(ed).columnCount)!=='2')return;
  let h=ed.clientHeight,guard=0;
  while(ed.scrollWidth>ed.clientWidth+2&&guard++<200){h+=48;ed.style.height=`${h}px`;}
 }catch{}
}
