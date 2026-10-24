// Game Journal tab: a session sidebar (newest first, rename inline, search) and an open-book editor.
// The markup functions take a plain model (buildJournalModel) so they are tested without Foundry. The editor is a
// contenteditable two-page spread with its own toolbar (bold, italic, underline, strike, highlight, headings, lists,
// quote, divider) and an Auto format preview; what it stores is cleaned by journal-core.mjs sanitizeHtml, so only
// those tags (no attributes) ever reach a page. On the party journal the GM also gets a GM-only notes section below
// the book (its own page, never sent to players).
import {cleanText as E} from './core.mjs';
import {emptyState} from './gm-panels.mjs';
import {sanitizeHtml,MAX_NAME,MAX_SUBTITLE,GM_TARGET,sessionHeading,sessionDate,autoDate,autoFormatHtml,journalFilename,isBlankPage,SEED_HTML,firstBlockIsQuote,unquoteFirstBlock} from './journal-core.mjs';

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
/** A session's date as the viewer's locale writes it: the GM's own date if set, else the day it was started. */
const day=s=>{
 const v=sessionDate(s),m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return '';
 try{return new Date(+m[1],+m[2]-1,+m[3]).toLocaleDateString();}catch{return '';}
};

export const FORMATS=Object.freeze([
 {id:'bold',label:'Bold',icon:'fa-bold',key:'Ctrl+B'},{id:'italic',label:'Italic',icon:'fa-italic',key:'Ctrl+I'},
 {id:'underline',label:'Underline',icon:'fa-underline',key:'Ctrl+U'},{id:'strike',label:'Strikethrough',icon:'fa-strikethrough'},
 {id:'highlight',label:'Highlight',icon:'fa-highlighter'},
 {id:'h1',label:'Title heading',text:'H1'},{id:'h2',label:'Heading',text:'H2'},{id:'h3',label:'Subheading',text:'H3'},{id:'p',label:'Normal text',icon:'fa-paragraph'},
 {id:'ul',label:'Bulleted list',icon:'fa-list-ul'},{id:'ol',label:'Numbered list',icon:'fa-list-ol'},
 {id:'quote',label:'Quote',icon:'fa-quote-left'},{id:'hr',label:'Divider',icon:'fa-minus'}
]);
/** document.execCommand for each toolbar button (supported by the Chromium-based Foundry app and current browsers). */
export const FORMAT_COMMANDS=Object.freeze({bold:['bold'],italic:['italic'],underline:['underline'],strike:['strikeThrough'],highlight:['hiliteColor','#ffe066'],h1:['formatBlock','<h1>'],quote:['formatBlock','<blockquote>'],hr:['insertHorizontalRule'],h2:['formatBlock','<h2>'],h3:['formatBlock','<h3>'],p:['formatBlock','<p>'],ul:['insertUnorderedList'],ol:['insertOrderedList']});
/** Buttons that show whether the text at the caret has their format (aria-pressed, from document.queryCommandState). */
export const PRESSABLE=Object.freeze({bold:'bold',italic:'italic',underline:'underline',strike:'strikeThrough',ul:'insertUnorderedList',ol:'insertOrderedList'});

/** Shows Remove quote formatting only while the page's first block is a quote. */
export function syncQuoteButton(root,ed){
 const b=root?.querySelector?.('[data-jaction="unquote"]');if(!b||!ed)return;
 b.hidden=!(ed.firstElementChild?.nodeName==='BLOCKQUOTE');
}
export const newJournalView=isGM=>({sessionId:null,target:isGM?'party':'me',query:'',showArchived:false,renaming:null,base:'',dirty:false,gmBase:'',gmDirty:false,stale:false,key:''});
/** True when the page or the GM-only notes have text that is not saved yet. */
export const anyDirty=jv=>!!(jv?.dirty||jv?.gmDirty);

/** Highlight: wraps the selected text in <mark> (the browser's hiliteColor makes a styled span; this turns those into marks).
    With the selection inside an existing mark, takes that highlight off instead. Returns what it did, for the caller. */
export function toggleHighlight(ed,doc=globalThis.document){
 const sel=doc?.getSelection?.();if(!sel||!sel.rangeCount||!ed?.contains?.(sel.anchorNode))return 'none';
 const inside=n=>{for(let x=n;x&&x!==ed;x=x.parentNode)if(x.nodeName==='MARK'||x.nodeName==='SPAN'&&/background/i.test(x.getAttribute?.('style')??''))return x;return null;};
 const at=inside(sel.anchorNode);
 if(at&&at===inside(sel.focusNode)){unwrap(at);return 'removed';}
 if(sel.isCollapsed)return 'none';
 doc.execCommand('hiliteColor',false,FORMAT_COMMANDS.highlight[1]);
 for(const sp of [...ed.querySelectorAll('span[style]')])if(/background/i.test(sp.getAttribute('style')))swapTag(sp,'mark',doc);
 return 'added';
}
const BLOCK=new Set(['P','H1','H2','H3','H4','UL','OL','BLOCKQUOTE','HR','DIV']);
const isBlock=n=>n?.nodeType===1&&BLOCK.has(n.nodeName);
const hasContent=run=>run.some(n=>n.nodeType===3?!!n.textContent.trim():n.nodeName!=='BR');
/** Consecutive loose nodes (text, inline tags, br) between blocks, as runs; blocks stay as they are. */
function groupRuns(nodes){
 const out=[];let run=null;
 for(const n of nodes){if(isBlock(n)){run=null;out.push(n);}else{if(!run){run=[];out.push({run});}run.push(n);}}
 return out;
}
function paragraphOf(run,doc){if(!hasContent(run))return null;const p=doc.createElement('p');for(const n of run)p.appendChild(n);return p;}
/** Takes one quote (and any quote inside it) off: its content becomes ordinary blocks, in place. Returns the last block. */
function unwrapQuote(bq,doc){
 for(const c of [...bq.childNodes])if(c.nodeName==='BLOCKQUOTE')unwrapQuote(c,doc);
 const parent=bq.parentNode;let last=null;
 for(const item of groupRuns([...bq.childNodes])){const node=item.run?paragraphOf(item.run,doc):item;if(node){parent.insertBefore(node,bq);last=node;}}
 parent.removeChild(bq);return last;
}
function caretAtEnd(node,doc){
 try{const sel=doc.getSelection?.(),r=doc.createRange?.();if(!sel||!r||!node)return;r.selectNodeContents(node);r.collapse(false);sel.removeAllRanges();sel.addRange(r);}catch{}
}
/** The editor's page starts as one normal paragraph while it is empty (never a quote, never loose text). Returns true if it seeded. */
export function ensureParagraph(ed,doc=globalThis.document){
 if(!ed||!isBlankPage(ed.innerHTML))return false;
 if(ed.innerHTML!==SEED_HTML)ed.innerHTML=SEED_HTML;
 try{const sel=doc?.getSelection?.(),r=doc?.createRange?.();if(sel&&r&&ed.firstChild){r.setStart(ed.firstChild,0);r.collapse(true);sel.removeAllRanges();sel.addRange(r);}}catch{}
 return true;
}
/** Back to truly empty when nothing was typed (so the placeholder shows and nothing is saved). */
export function tidyBlank(ed){if(ed&&ed.innerHTML!==''&&isBlankPage(ed.innerHTML))ed.innerHTML='';}
/** Text typed straight into the page (no block around it) gets a normal paragraph. */
export function wrapBareText(ed,doc=globalThis.document){
 if(!ed||![...ed.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return false;
 try{doc.execCommand('formatBlock',false,'<p>');}catch{return false;}return true;
}
/** Quote is a real toggle. With the selection in a quote: takes the quote off (every level, text kept). Otherwise puts all the
    blocks the selection touches into ONE quote (never a quote inside a quote). Returns 'removed', 'added' or 'none'. */
export function toggleQuote(ed,doc=globalThis.document){
 const sel=doc?.getSelection?.();if(!sel||!sel.rangeCount||!ed?.contains?.(sel.anchorNode))return 'none';
 if(isBlankPage(ed.innerHTML)){ed.innerHTML=SEED_HTML;caretAtEnd(ed.firstChild,doc);}
 const range=sel.getRangeAt(0),touched=[...ed.childNodes].filter(n=>range.intersectsNode(n));
 if(!touched.length)return 'none';
 const quotes=touched.filter(n=>n.nodeName==='BLOCKQUOTE');
 if(quotes.length){let last=null;for(const q of quotes)last=unwrapQuote(q,doc)??last;caretAtEnd(last,doc);return 'removed';}
 const bq=doc.createElement('blockquote');ed.insertBefore(bq,touched[0]);
 for(const item of groupRuns(touched)){const node=item.run?paragraphOf(item.run,doc):item;if(node)bq.appendChild(node);}
 if(!bq.firstChild){ed.removeChild(bq);return 'none';}
 caretAtEnd(bq.lastChild,doc);return 'added';
}
function unwrap(el){const p=el.parentNode;while(el.firstChild)p.insertBefore(el.firstChild,el);p.removeChild(el);}
function swapTag(el,name,doc){const m=doc.createElement(name);while(el.firstChild)m.appendChild(el.firstChild);el.parentNode.replaceChild(m,el);}

/** What the tab shows, read through the store (so every permission check applies). */
export function buildJournalModel(store,jv,me){
 const sessions=store.list({archived:jv.showArchived});
 if(!sessions.some(s=>s.id===jv.sessionId))jv.sessionId=(sessions.find(s=>s.current)??sessions[0])?.id??null;
 const session=sessions.find(s=>s.id===jv.sessionId)??null;
 const pages=session?store.pages(session.id):[];
 if(me.isGM&&!pages.some(p=>p.target===jv.target))jv.target='party';
 if(!me.isGM&&!['me','party'].includes(jv.target))jv.target='me';
 let page=null,error='',gm=null;
 if(session)try{page=store.read(session.id,jv.target);}catch(e){error=e?.message??String(e);}
 // The GM's own section under the party journal. The store refuses it to anyone else, so a player's model never has it.
 if(session&&me.isGM&&jv.target==='party')try{gm=store.read(session.id,GM_TARGET);}catch{}
 const hits=jv.query.trim()?store.search(jv.query):null;
 // Export Journal needs a player's journal on screen: a player's own, or (GM) the one picked in Whose journal.
 const exportPage=me.isGM?pages.find(p=>p.target===jv.target&&p.target!=='party'):jv.target==='me'?{target:me.id,label:'My journal'}:null;
 return {isGM:!!me.isGM,exportUserId:exportPage?.target??null,exportUserName:exportPage?.label??'',sessions,session,pages,page,gm,error,hits,query:jv.query,showArchived:jv.showArchived,renaming:jv.renaming,target:jv.target,stale:jv.stale,dirty:anyDirty(jv)};
}

function sessionRow(s,m){
 const on=s.id===m.session?.id;
 if(m.renaming===s.id&&s.canRename)return `<div class="ag-row agq-jsession agq-jsession--edit is-selected" data-session-row="${E(s.id)}">
  <label class="ag-field">Name<input id="agq-jr-name" maxlength="${MAX_NAME}" value="${E(s.name)}"></label>
  <label class="ag-field">Subtitle (optional)<input id="agq-jr-subtitle" maxlength="${MAX_SUBTITLE}" value="${E(s.subtitle)}" placeholder="e.g. The road to the gate"></label>
  ${s.canSetDate?`<label class="ag-field">Date<input type="date" id="agq-jr-date" value="${E(sessionDate(s))}"><span class="ag-field__hint">Set to the day the session started. Change it to the day you played; clear it to go back to that.</span></label>`:''}
  <div class="agq-jsession__actions">${jbtn('Cancel','rename-cancel',{kind:'ghost',sm:true})}${jbtn('Save','rename-save',{kind:'primary',sm:true,data:{id:s.id}})}</div></div>`;
 const badges=[s.current?'<span class="ag-badge ag-badge--accent">Current</span>':'',s.archived?`<span class="ag-badge">${icon('fa-box-archive')}Archived</span>`:''].join('');
 return `<div class="ag-row agq-jsession${on?' is-selected':''}" data-session-row="${E(s.id)}"${on?' aria-current="true"':''}>
  <button type="button" class="agq-jsession__main" data-jaction="select" data-id="${E(s.id)}">${icon(on?'fa-folder-open':'fa-folder')}<span class="agq-jsession__text"><span class="ag-row__title">${E(s.name)}</span>${s.subtitle?`<span class="ag-row__meta agq-jsession__sub">${E(s.subtitle)}</span>`:''}<span class="agq-jsession__meta">Session ${E(s.number)}${day(s)?` · ${E(day(s))}`:''}${badges}</span></span></button>
  ${s.canRename?jbtn(`Rename ${s.name}`,'rename',{kind:'ghost',sm:true,iconOnly:true,icon:'fa-pen',data:{id:s.id},title:m.noGM?'Renaming needs a GM connected':'Rename this session',disabled:!!m.noGM}):''}</div>`;
}
/** The list part of the sidebar: sessions, or the search results while a search is typed. */
export function journalListHTML(m){
 if(m.hits){
  if(!m.hits.length)return emptyState('Nothing found','No session name or journal page you can read matches that search.',{iconName:'fa-magnifying-glass'});
  return `<div class="ag-rows agq-jhits">${m.hits.map(h=>{const s=m.sessions.find(x=>x.id===h.sessionId);return `<button type="button" class="ag-row agq-jhit" data-jaction="hit" data-id="${E(h.sessionId)}" data-target="${E(h.target)}"><span class="ag-row__main"><span class="ag-row__title">${E(s?.name??'Session')}</span><span class="ag-row__meta">${E(h.label)}</span><span class="agq-jhit__snippet">${E(h.snippet)}</span></span></button>`;}).join('')}</div>`;
 }
 if(!m.sessions.length)return emptyState('No sessions yet','Start one with New session: it gets a party journal and a journal for each player.',{iconName:'fa-book',action:m.noGM?'':jbtn('New session','new',{sm:true,icon:'fa-plus'})});
 return `<div class="ag-rows agq-jsessions">${m.sessions.map(s=>sessionRow(s,m)).join('')}</div>`;
}
export function journalSidebarHTML(m){
 return `<aside class="ag-split__list agq-jside" aria-label="Sessions" data-ag-scroll="journal-list">
  <div class="agq-jside__tools"><label class="ag-search">${icon('fa-magnifying-glass')}<input type="search" id="agq-journal-search" placeholder="Search journals" aria-label="Search the sessions and journal pages you can read" value="${E(m.query)}"></label>${jbtn('New session','new',{sm:true,icon:'fa-plus',title:'Start a new session: a party journal and one for each player',disabled:!!m.noGM})}</div>
  ${m.noGM?'<p class="ag-field__hint agq-jside__hint">New session needs a GM connected.</p>':''}
  ${m.isGM?`<label class="ag-field ag-field--inline agq-jside__archived"><input type="checkbox" id="agq-journal-archived" ${m.showArchived?'checked':''}> Show archived sessions</label>`:''}
  <div id="agq-journal-list">${journalListHTML(m)}</div></aside>`;
}
// 0.17.0 Players pick My journal / Party journal with the kit's segmented control (radios, arrow keys); the GM picks
// whose journal to read from a select.
function whichJournal(m){
 if(m.isGM)return `<label class="ag-field agq-jwho">Whose journal<select id="agq-journal-who">${m.pages.map(p=>`<option value="${E(p.target)}" ${p.target===m.target?'selected':''}>${E(p.label)}</option>`).join('')}</select></label>`;
 const radio=(target,label,i)=>{const on=m.target===target;return `<button type="button" role="radio" id="agq-jt-${target}" data-jaction="target" data-target="${target}" aria-checked="${on}" tabindex="${on?0:-1}">${icon(i)} ${E(label)}</button>`;};
 return `<div class="ag-segmented agq-jtoggle" role="radiogroup" aria-label="Which journal">${radio('me','My journal','fa-user')}${radio('party','Party journal','fa-users')}</div>`;
}
const notice=(kind,ic,text)=>`<p class="ag-notice ag-notice--${kind}">${icon(ic)} ${E(text)}</p>`;
export function journalDetailHTML(m){
 const s=m.session;
 if(!s)return `<section class="ag-split__detail agq-jdetail">${emptyState('No session open','Pick a session on the left, or start one with New session.',{iconName:'fa-book-open'})}</section>`;
 const p=m.page,canWrite=!!p?.canWrite;
 const gmTools=m.isGM?`${jbtn('Export This Session','export',{kind:'ghost',sm:true,icon:'fa-file-arrow-down',title:'Download only this session (party journal and every player journal) as a Markdown file'})}${s.archived?`${jbtn('Restore session','restore',{sm:true,icon:'fa-box-open'})}${s.canDelete?jbtn('Delete session…','delete',{kind:'danger',sm:true,icon:'fa-trash-can',title:'Permanently delete this archived session and all its pages'}):''}`:jbtn('Archive session','archive',{kind:'danger',sm:true,icon:'fa-box-archive'})}`:'';
 // 0.21.0 One journal across every session. Export Journal waits for a player's journal; Export GM Journal is never drawn for a player.
 const whyNoPlayer=m.isGM?"Pick a player's journal under Whose journal to export it.":'Switch to My journal to export it.';
 const exportTools=`<div class="ag-btn-group agq-jactions agq-jexport" role="group" aria-label="Export journals">${jbtn('Export Journal','export-player',{kind:'ghost',sm:true,icon:'fa-file-arrow-down',disabled:!m.exportUserId,
  title:m.exportUserId?(m.isGM?`Download every session of ${m.exportUserName}, archived sessions included, as one Markdown file`:'Download every session of your journal as one Markdown file'):whyNoPlayer})}${jbtn('Export Group Journal','export-group',{kind:'ghost',sm:true,icon:'fa-users',
  title:m.isGM?'Download the party journal of every session, archived sessions included, as one Markdown file':'Download the party journal of every session as one Markdown file'})}${m.isGM?jbtn('Export GM Journal','export-gm',{kind:'ghost',sm:true,icon:'fa-eye-slash',title:'Download your GM-only notes from every session, archived sessions included, as one Markdown file. Players cannot do this.'}):''}</div>${m.exportUserId?'':`<p class="ag-field__hint agq-jexport-hint">Export Journal is off: ${E(whyNoPlayer)}</p>`}`;
 const notes=[
  s.archived?notice('warn','fa-box-archive','This session is archived: players no longer see it and its pages are read only. Restore it to write again.'):'',
  m.error?notice('warn','fa-triangle-exclamation',m.error):'',
  p?.missing?notice('info','fa-circle-info','This journal page is not set up yet. It is added the next time the GM is connected.'):'',
  m.gm?.missing?notice('info','fa-circle-info','The GM-only notes for this session are being added.')+'<span data-gm-missing hidden></span>':'',
  m.isGM&&p&&!p.missing&&p.target!=='party'?notice('info','fa-eye',"You are reading a player's own journal. Only they can write it."):'',
  m.stale?notice('warn','fa-rotate','Someone else saved this page while you were writing. Save asks before replacing their text.'):''
 ].join('');
 const autoButtons=`<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm agq-jtool agq-jtool--text" data-jaction="autoformat" tabindex="-1"${tip('Tidy spaces, blank lines, lists and punctuation. You see what changes first, and can undo it.')}>${icon('fa-wand-magic-sparkles')} Auto format…</button><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm agq-jtool agq-jtool--text" data-jaction="autoformat-undo" tabindex="-1" hidden>${icon('fa-rotate-left')} Undo auto format</button><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm agq-jtool agq-jtool--text" data-jaction="unquote" tabindex="-1"${m.page&&firstBlockIsQuote(m.page.html??'')?'':' hidden'}${tip('The first block of this page is a quote. Take the quote formatting off it; its text stays.')}>${icon('fa-quote-right')} Remove quote formatting</button>`;
 // One Tab stop for the formatting toolbar (Left/Right/Home/End move along it); toggles carry aria-pressed.
 const canEdit=canWrite||!!m.gm?.canWrite;
 const tools=canEdit?`<div class="agq-jtools" role="toolbar" aria-label="Formatting">${FORMATS.map((f,i)=>`<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm ag-btn--icon agq-jtool" data-format="${f.id}" aria-label="${E(f.label)}"${tip(f.key?`${f.label} (${f.key})`:f.label)} tabindex="${i?-1:0}"${PRESSABLE[f.id]?' aria-pressed="false"':''}>${f.icon?icon(f.icon):`<span aria-hidden="true">${E(f.text)}</span>`}</button>`).join('')}<span class="agq-jtools__sep" aria-hidden="true"></span>${autoButtons}</div>`:'';
 const label=p?.label??'Journal';
 const book=p&&!p.missing?`<div class="agq-book"><div class="agq-book__pages" id="agq-journal-editor" contenteditable="${canWrite?'true':'false'}" role="textbox" aria-multiline="true" aria-readonly="${canWrite?'false':'true'}" aria-label="${E(`${sessionHeading(s)}: ${label}`)}" spellcheck="true" data-placeholder="${E(canWrite?'Write here…':'Nothing written yet.')}">${sanitizeHtml(p.html)}</div></div>`:'';
 const gmBlock=m.gm&&!m.gm.missing?`<section class="agq-gmnotes" aria-labelledby="agq-gmnotes-title"><h3 class="agq-gmnotes__title" id="agq-gmnotes-title">${icon('fa-eye-slash')} GM-only notes <span class="ag-badge">Players cannot see this</span></h3><div class="agq-book__pages agq-book__pages--single" id="agq-journal-gm" contenteditable="${m.gm.canWrite?'true':'false'}" role="textbox" aria-multiline="true" aria-readonly="${m.gm.canWrite?'false':'true'}" aria-label="${E(`${sessionHeading(s)}: GM-only notes`)}" spellcheck="true" data-placeholder="${E(m.gm.canWrite?'Secrets, prep and reminders for you only…':'Nothing written yet.')}">${sanitizeHtml(m.gm.html)}</div></section>`:'';
 const footer=canEdit?`<footer class="ag-footer agq-footer agq-jfooter">${jbtn('Discard changes','discard',{kind:'ghost'})}<span class="ag-footer__status" role="status" data-journal-status>${m.dirty?'Unsaved changes':'Saved'}</span>${jbtn('Save','save',{kind:'primary',icon:'fa-floppy-disk'})}</footer>`:'';
 return `<section class="ag-split__detail agq-jdetail" data-ag-scroll="journal-page:${E(s.id)}:${E(m.target)}">
  <header class="agq-jhead"><div class="agq-jhead__title"><h2 class="agq-detail__title">${E(sessionHeading(s))}</h2>${s.subtitle?`<p class="agq-jhead__sub">${E(s.subtitle)}</p>`:''}${day(s)?`<p class="agq-jhead__date">${E(day(s))}</p>`:''}</div>
  <div class="agq-jhead__tools">${whichJournal(m)}</div></header>${gmTools?`<div class="ag-btn-group agq-jactions" role="group" aria-label="Session actions">${gmTools}</div>`:''}${exportTools}${notes}${tools}${book}${gmBlock}${footer}</section>`;
}
export function journalPaneHTML(m){return `<div class="ag-split agq-split agq-journal">${journalSidebarHTML(m)}${journalDetailHTML(m)}</div>`;}

/**
 * Adds the journal's methods to the Quest Log window class.
 * ctx: {store, danger(message, opts) (a confirmation whose default is Cancel), confirm(message, opts), notify(err), info(message), download(name, text, type)}
 */
export function installJournal(App,ctx){
 const {store}=ctx;
 Object.assign(App.prototype,{
  journalView(){return this.jv??=newJournalView(!!game.user?.isGM);},
  journalKey(){const jv=this.journalView();return `${jv.sessionId??''}|${jv.target}`;},
  journalHTML(){
   const jv=this.journalView(),m=buildJournalModel(store,jv,game.user);
   // A player's New session and rename go through the GM's client: say so up front when no GM is connected.
   m.noGM=!game.user?.isGM&&'activeGM' in (game.users??{})&&!game.users.activeGM;
   const key=this.journalKey();if(jv.key!==key){jv.key=key;jv.dirty=false;jv.gmDirty=false;jv.stale=false;jv.autoUndo=null;}
   if(!jv.dirty)jv.base=m.page?.html??'';
   if(!jv.gmDirty)jv.gmBase=m.gm?.html??'';
   m.dirty=anyDirty(jv);
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
   bindRadios(root.querySelector('.agq-jtoggle'));
   root.querySelector('#agq-journal-who')?.addEventListener('change',async e=>{const want=e.target.value;if(!await this.flushJournal()){e.target.value=jv.target;return;}jv.target=want;await this.render();});
   for(const el of [root.querySelector('#agq-jr-name'),root.querySelector('#agq-jr-subtitle')])el?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();root.querySelector('[data-jaction="rename-save"]')?.click();}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();root.querySelector('[data-jaction="rename-cancel"]')?.click();}});
   if(jv.renaming){const n=root.querySelector('#agq-jr-name');n?.focus?.();n?.select?.();}
   const main=root.querySelector('#agq-journal-editor'),gmEd=root.querySelector('#agq-journal-gm');
   const editable=[main,gmEd].filter(e=>e&&e.getAttribute('contenteditable')==='true');
   // A session from before 0.20.0 has no GM-only page yet: the GM's client adds it, then the tab redraws once.
   if(this.tab==='journal'&&game.user?.isGM&&!jv.ensuring&&root.querySelector('[data-gm-missing]')){jv.ensuring=true;store.ensurePages().then(()=>this.render()).catch(ctx.notify).finally(()=>{jv.ensuring=false;});}
   if(!editable.length){fitSpread(main);return;}
   this.jActive=editable[0];
   const markDirty=ed=>{if(ed===gmEd)jv.gmDirty=true;else jv.dirty=true;this.journalStatus('Unsaved changes');if(ed===main)fitSpread(ed,{grow:true});};
   for(const ed of editable){
    // Enter starts a paragraph, not a div (Chromium's default).
    ed.addEventListener('focus',()=>{try{document.execCommand('defaultParagraphSeparator',false,'p');}catch{}ensureParagraph(ed);});
    ed.addEventListener('focusin',()=>{this.jActive=ed;});
    let fixing=false;
    ed.addEventListener('input',()=>{
     if(!fixing){fixing=true;try{wrapBareText(ed);}finally{fixing=false;}}
     markDirty(ed);syncQuoteButton(root,ed);});
    // Pasted text keeps only the formatting the journal allows.
    ed.addEventListener('paste',e=>{const data=e.clipboardData;if(!data)return;e.preventDefault();
     const html=data.getData('text/html'),text=data.getData('text/plain');
     const clean=html?sanitizeHtml(html):E(text).replace(/\r?\n/g,'<br>');
     document.execCommand('insertHTML',false,clean);});
    ed.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key?.toLowerCase()==='s'){e.preventDefault();e.stopPropagation();this.saveJournal(root).catch(ctx.notify);}});
    // Save on blur: leaving the page for anything but its own toolbar saves it.
    ed.addEventListener('focusout',e=>{if(e.relatedTarget&&(root.querySelector('.agq-jtools')?.contains(e.relatedTarget)||editable.includes(e.relatedTarget)))return;
     tidyBlank(ed);
     if(anyDirty(jv))this.saveJournal(root).catch(ctx.notify);else if(jv.refreshPending){jv.refreshPending=false;this.externalRender=true;this.render();}});
   }
   for(const b of root.querySelectorAll('[data-format]')){
    b.addEventListener('mousedown',e=>e.preventDefault());// keep the text selection in the page
    b.addEventListener('click',()=>{const ed=this.jActive??editable[0];const f=b.dataset.format;
     ed.focus();
     if(f==='highlight')toggleHighlight(ed);
     else if(f==='quote')toggleQuote(ed);
     else{const [cmd,arg]=FORMAT_COMMANDS[f]??[];if(!cmd)return;document.execCommand(cmd,false,arg);}
     markDirty(ed);showPressed(root);});
   }
   for(const b of root.querySelectorAll('.agq-jtool--text'))b.addEventListener('mousedown',e=>e.preventDefault());
   bindToolbarKeys(root.querySelector('.agq-jtools'));
   // Bold, Italic, Underline and the lists show whether the caret's text has them. One listener per window, replaced
   // on each redraw.
   this.jSelection?.abort?.();
   if(typeof AbortController==='function'&&typeof document?.addEventListener==='function'){
    this.jSelection=new AbortController();
    document.addEventListener('selectionchange',()=>{const sel=document.getSelection?.();if(sel?.anchorNode&&editable.some(ed=>ed.contains?.(sel.anchorNode)))showPressed(root);},{signal:this.jSelection.signal});
   }
   fitSpread(main);
  },
  refreshJournalList(root){
   const wrap=root.querySelector('#agq-journal-list');if(!wrap)return;
   try{wrap.innerHTML=journalListHTML(buildJournalModel(store,{...this.journalView()},game.user));}catch(e){ctx.notify(e);}
  },
  /** Auto format: shows what would change and waits for a yes; Undo auto format restores the text from before. */
  async autoFormatJournal(root=this.jRoot){
   const jv=this.journalView(),ed=this.jActive?.isConnected!==false&&this.jActive||root?.querySelector?.('#agq-journal-editor');
   if(!ed||ed.getAttribute?.('contenteditable')!=='true')return;
   let res=autoFormatHtml(ed.innerHTML);
   if(!res.ok)return void ctx.info('Auto format left this page alone: it could not tidy it without risking your words.');
   if(!res.changes.length&&!res.firstQuote)return void ctx.info('Nothing to tidy: this page is already clean.');
   const before=ed.innerHTML,list=res.changes.map(c=>`• ${c}`).join(' ')||'Nothing else to tidy.';
   if(res.firstQuote&&ctx.form){
    // The first block is a quote: offer un-quoting as its own explicit choice, off unless ticked.
    const got=await ctx.form('Auto format this page?',[{name:'unquote',type:'checkbox',value:'1',label:'Un-quote the first block',hint:`The first block of this page is a quote. Tick this to take the quote formatting off it (its text stays). Auto format will: ${list} No words are removed; Undo auto format puts the page back.`}],{ok:'Apply auto format',cancel:'Cancel'});
    if(!got)return;
    if(got.unquote)res=autoFormatHtml(ed.innerHTML,{unquoteFirst:true});
    if(!res.ok||!res.changes.length)return void ctx.info('Nothing to change.');
   }else if(!await (ctx.confirm??ctx.danger)(`Auto format will:\n${res.changes.map(c=>`• ${c}`).join('\n')}\nNo words are removed. Afterwards, Undo auto format puts the page back as it is now.`,{title:'Auto format this page?',yes:'Apply auto format',no:'Cancel'}))return;
   jv.autoUndo={ed,html:before};
   ed.innerHTML=res.html;
   if(ed.id==='agq-journal-gm')jv.gmDirty=true;else jv.dirty=true;
   this.journalStatus('Unsaved changes');fitSpread(ed,{grow:true});
   const undo=root?.querySelector?.('[data-jaction="autoformat-undo"]');if(undo)undo.hidden=false;
   ed.focus?.();
  },
  /** Remove quote formatting: asks, then takes the quote off the page's first block (text stays). Undo auto format reverses it. */
  async unquoteJournal(root=this.jRoot){
   const jv=this.journalView(),ed=this.jActive?.isConnected!==false&&this.jActive||root?.querySelector?.('#agq-journal-editor');
   if(!ed||ed.getAttribute?.('contenteditable')!=='true')return;
   const res=unquoteFirstBlock(ed.innerHTML);
   if(!res.changed)return void ctx.info('The first block of this page is not a quote.');
   if(!await (ctx.confirm??ctx.danger)('The first block of this page is a quote. Remove the quote formatting from it? Its text stays as ordinary paragraphs. Undo auto format puts it back.',{title:'Remove quote formatting?',yes:'Remove quote formatting',no:'Cancel'}))return;
   jv.autoUndo={ed,html:ed.innerHTML};
   ed.innerHTML=res.html;
   if(ed.id==='agq-journal-gm')jv.gmDirty=true;else jv.dirty=true;
   this.journalStatus('Unsaved changes');fitSpread(ed,{grow:true});
   const undo=root?.querySelector?.('[data-jaction="autoformat-undo"]');if(undo)undo.hidden=false;
   syncQuoteButton(root,ed);ed.focus?.();
  },
  undoAutoFormat(root=this.jRoot){
   const jv=this.journalView(),u=jv.autoUndo;if(!u?.ed||u.ed.isConnected===false)return;
   u.ed.innerHTML=u.html;jv.autoUndo=null;
   if(u.ed.id==='agq-journal-gm')jv.gmDirty=true;else jv.dirty=true;
   this.journalStatus('Unsaved changes');fitSpread(u.ed,{grow:true});
   const undo=root?.querySelector?.('[data-jaction="autoformat-undo"]');if(undo)undo.hidden=true;
   syncQuoteButton(root,u.ed);
  },
  /** Saves the open page if it has unsaved changes. Resolves false when it could not (the text stays in the page). */
  async saveJournal(root=this.jRoot){
   const jv=this.journalView();
   while(this.jSaving)await this.jSaving.catch(()=>{});
   // The page, then (GM, party journal) the GM-only notes: each saved to its own page, each with its own conflict check.
   const parts=[{sel:'#agq-journal-editor',dirty:'dirty',base:'base',target:()=>jv.target},{sel:'#agq-journal-gm',dirty:'gmDirty',base:'gmBase',target:()=>GM_TARGET}]
    .map(p=>({...p,ed:root?.querySelector?.(p.sel)})).filter(p=>p.ed&&jv[p.dirty]);
   if(!parts.length)return true;
   const run=(async()=>{
    this.journalStatus('Saving…');
    for(const p of parts){
     const html=p.ed.innerHTML,id=jv.sessionId,target=p.target();
     const done=saved=>{jv[p.base]=saved;jv.stale=false;if(p.ed.innerHTML===html)jv[p.dirty]=false;return true;};
     try{done(await store.write(id,target,html,{base:jv[p.base]}));}
     catch(e){
      if(e?.code!=='conflict'){this.journalStatus('Not saved');ctx.notify(e);return false;}
      jv.stale=true;
      if(await ctx.danger('Someone else saved this page while you were writing. Replace their text with yours? Their version is lost if you do.',{title:'Replace the newer text?',yes:'Replace with mine',no:'Keep editing'}))
       done(await store.write(id,target,html,{force:true}));
      else{this.journalStatus('Not saved: copy your text, then Discard changes to see theirs.');return false;}
     }
    }
    this.journalStatus(anyDirty(jv)?'Unsaved changes':'Saved');return true;
   })();
   this.jSaving=run;
   try{return await run;}finally{if(this.jSaving===run)this.jSaving=null;}
  },
  async flushJournal(){if(this.tab!=='journal'||!anyDirty(this.jv))return true;return this.saveJournal();},
  /** Another client changed a journal or quest: keep unsaved text; redraw only what is safe to redraw. */
  journalExternal(){
   const jv=this.journalView(),root=this.jRoot;
   if(!jv.renaming)this.refreshJournalList(root??{querySelector:()=>null});
   if(anyDirty(jv)){
    try{const cur=jv.sessionId?store.read(jv.sessionId,jv.target):null;
     if(jv.dirty&&cur&&cur.html!==jv.base&&!jv.stale){jv.stale=true;this.journalStatus('Someone else saved this page. Save asks before replacing their text.');}}catch{}
    return;
   }
   const ed=root?.querySelector?.('#agq-journal-editor'),active=globalThis.document?.activeElement;
   if(jv.renaming||ed&&active&&ed.contains?.(active)){jv.refreshPending=true;return;}
   this.externalRender=true;this.render();
  },
  async journalAction(action,el,root){
   const jv=this.journalView(),id=el.dataset.id;
   if(action==='save')return void await this.saveJournal(root);
   if(action==='discard'){if(anyDirty(jv)&&!await ctx.danger('Discard your unsaved changes to this page?',{title:'Discard unsaved changes?',yes:'Discard changes',no:'Keep editing'}))return;jv.dirty=false;jv.gmDirty=false;jv.stale=false;jv.key='';return void await this.render();}
   if(action==='autoformat')return void await this.autoFormatJournal(root);
   if(action==='unquote')return void await this.unquoteJournal(root);
   if(action==='autoformat-undo')return void this.undoAutoFormat(root);
   if(action==='rename-cancel'){jv.renaming=null;return void await this.render();}
   if(action==='rename-save'){
    const name=root.querySelector('#agq-jr-name')?.value??'',subtitle=root.querySelector('#agq-jr-subtitle')?.value??'';
    const input={name,subtitle},dateEl=root.querySelector('#agq-jr-date'),was=store.get(id);
    // The automatic date is not stored as the GM's own: typing the day it started (or clearing the field) keeps it automatic.
    if(dateEl)input.date=!dateEl.value||dateEl.value===autoDate(was?.createdAt)?'':dateEl.value;
    await store.rename(id,input);jv.renaming=null;return void await this.render();
   }
   // Everything below leaves the open page: save it first (a refused save stays put).
   if(!await this.flushJournal())return;
   if(action==='select'){jv.sessionId=id;jv.renaming=null;return void await this.render();}
   if(action==='hit'){jv.sessionId=id;const t=el.dataset.target;jv.target=game.user?.isGM?(t===GM_TARGET?'party':t):t===game.user?.id?'me':'party';return void await this.render();}
   if(action==='target'){jv.target=el.dataset.target;return void await this.render();}
   if(action==='rename'){jv.renaming=id;return void await this.render();}
   if(action==='new'){
    // 0.20.0 The new session opens on its own page; the name form no longer pops open at the top of the list by itself.
    const sid=await store.create({});jv.sessionId=sid;jv.query='';jv.renaming=null;jv.target=game.user?.isGM?'party':'me';
    ctx.info('New session started. Use the pencil beside it in the list to give it a name.');return void await this.render();
   }
   if(action==='export-player'||action==='export-group'||action==='export-gm'){
    const kind=action.slice(7),isGM=!!game.user?.isGM;
    // The save above covers typed text; what is exported is what is saved. The store refuses anything this user cannot read.
    const target=kind==='player'?(isGM?jv.target:game.user?.id):null;
    const who=kind==='player'?(isGM?(store.pages(jv.sessionId).find(p=>p.target===jv.target)?.label??'this player'):'your journal'):kind==='group'?'the party journal':'your GM-only notes';
    const scope=isGM?'every session, archived ones included':'every session you can see';
    const name=kind==='player'?'Export Journal':kind==='group'?'Export Group Journal':'Export GM Journal';
    if(!await ctx.confirm(`This downloads ${who} from ${scope}, oldest first, as one Markdown file.`,{title:`${name}?`,yes:name}))return;
    const out=store.exportJournal(kind,{userId:target});
    return ctx.download(journalFilename(ctx.worldName?.()??'',kind,{who:out.who}),out.markdown,'text/markdown');
   }
   const s=jv.sessionId?store.get(jv.sessionId):null;if(!s)return;
   if(action==='export')return ctx.download(`${s.id} ${s.name}.md`.replace(/[\\/:*?"<>|]+/g,'-'),store.exportMarkdown(s.id),'text/markdown');
   if(action==='archive'){
    if(!await ctx.danger(`Players no longer see ${s.name} and its pages become read only. Nothing is deleted: tick Show archived sessions to find it and restore it.`,{title:`Archive ${s.name}?`,yes:'Archive session'}))return;
    await store.archive(s.id);return void await this.render();
   }
   if(action==='restore'){await store.restore(s.id);return void await this.render();}
   if(action==='delete'){
    if(!await ctx.danger(`This permanently deletes ${s.name} with its party journal, the GM-only notes and every player's journal. It cannot be undone. Restore the session instead if you only want it back, or use Export Markdown first to keep a copy.`,{title:`Delete ${s.name}?`,yes:'Delete session'}))return;
    await store.remove(s.id);jv.sessionId=null;jv.key='';return void await this.render();
   }
  }
 });
}
/** Arrow keys for a role="radiogroup" of buttons: Left/Right (Up/Down) and Home/End pick the next radio and click it. */
export function bindRadios(group){
 if(typeof group?.addEventListener!=='function')return;
 group.addEventListener('keydown',e=>{
  const items=[...group.querySelectorAll('[role="radio"]')],i=items.indexOf(e.target?.closest?.('[role="radio"]')??e.target);if(i<0)return;
  const to={ArrowRight:i+1,ArrowDown:i+1,ArrowLeft:i-1,ArrowUp:i-1,Home:0,End:items.length-1}[e.key];if(to===undefined)return;
  e.preventDefault?.();const next=items[(to+items.length)%items.length];if(next===items[i])return;
  next.focus?.();next.click?.();
 });
}
/** One Tab stop for a role="toolbar": Left/Right move focus along its buttons, Home/End jump to the ends. */
export function bindToolbarKeys(bar){
 if(typeof bar?.addEventListener!=='function')return;
 bar.addEventListener('keydown',e=>{
  const items=[...bar.querySelectorAll('button')].filter(b=>!b.disabled),i=items.indexOf(e.target?.closest?.('button')??e.target);if(i<0)return;
  const to={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:items.length-1}[e.key];if(to===undefined)return;
  e.preventDefault?.();const next=items[(to+items.length)%items.length];
  for(const b of items)b.setAttribute('tabindex',b===next?'0':'-1');next.focus?.();
 });
}
/** aria-pressed on the format toggles, from the text at the caret. */
export function showPressed(root,state=cmd=>globalThis.document?.queryCommandState?.(cmd)){
 for(const b of root?.querySelectorAll?.('[data-format]')??[]){const cmd=PRESSABLE[b.dataset.format];if(!cmd)continue;
  let on=false;try{on=!!state(cmd);}catch{}b.setAttribute('aria-pressed',String(on));}
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
