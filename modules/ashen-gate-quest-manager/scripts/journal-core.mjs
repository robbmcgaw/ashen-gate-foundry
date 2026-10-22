// 0.16.0 Game Journal — pure core. No Foundry globals, so every rule here is tested directly.
//
// A session is one Foundry JournalEntry (folder Ashen Gate / Quests / Game Journal) carrying the session record in
// its flag `session`; its pages are the party journal and one personal journal per player user (flag `journalPage`).
// Foundry ownership does the enforcing for writes on the server: the entry is OBSERVER for everyone, the party page
// OWNER for everyone, a personal page OWNER for its player only and NONE (explicit, not inherited) for every other
// player. So a player writes their own page and the party page with no GM connected; the GM reads everything.
// Quest Log's API checks the same rules again (journalAccess below) before it reads or writes anything.

export const JOURNAL_CONTRACT='ag-quest-journal/1';
export const SESSION_ID=/^SESSION-\d{3,}$/;
export const MAX_NAME=80;
export const MAX_SUBTITLE=120;
export const MAX_HTML=200000;
const LEVEL={NONE:0,OBSERVER:2,OWNER:3};

export const sessionId=n=>`SESSION-${String(n).padStart(3,'0')}`;
/** The number the next session gets: one more than the highest so far, archived sessions included. */
export function nextNumber(sessions){return Math.max(0,...[...sessions].map(s=>Number.isInteger(s?.number)?s.number:0))+1;}
/** A free id for that number (a raced duplicate number moves up until the id is unused). */
export function freeId(n,sessions){const used=new Set([...sessions].map(s=>s?.id));let k=n;while(used.has(sessionId(k)))k++;return {number:k,id:sessionId(k)};}

const oneLine=v=>String(v??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
/** Cleans a name/subtitle pair; refuses an empty or too-long name or a too-long subtitle. */
export function cleanTitle({name,subtitle}={},{fallback=''}={}){
 const n=oneLine(name)||oneLine(fallback),s=oneLine(subtitle);
 if(!n)throw new Error('A session needs a name.');
 if(n.length>MAX_NAME)throw new Error(`Session names are at most ${MAX_NAME} characters.`);
 if(s.length>MAX_SUBTITLE)throw new Error(`Subtitles are at most ${MAX_SUBTITLE} characters.`);
 return {name:n,subtitle:s};
}
/** The stored session record, or null when the flag is missing or malformed (such an entry is ignored). */
export function readSession(flag){
 if(!flag||typeof flag!=='object'||flag.v!==1||!SESSION_ID.test(flag.id??'')||!Number.isInteger(flag.number))return null;
 return {v:1,id:flag.id,number:flag.number,name:oneLine(flag.name)||`Session ${flag.number}`,subtitle:oneLine(flag.subtitle),
  createdAt:typeof flag.createdAt==='string'?flag.createdAt:'',createdBy:typeof flag.createdBy==='string'?flag.createdBy:'',archived:flag.archived===true};
}
export function newSession({number,id,name,subtitle,createdBy,now}){
 return {v:1,id,number,...cleanTitle({name,subtitle},{fallback:`Session ${number}`}),createdAt:new Date(now).toISOString(),createdBy:String(createdBy??''),archived:false};
}
/** Newest first (by number). */
export const sortSessions=list=>[...list].sort((a,b)=>b.number-a.number);
/** The current session: the newest one that is not archived. */
export const currentSession=list=>sortSessions(list.filter(s=>!s.archived))[0]??null;

/* ---- Ownership (Foundry levels) ---- */
export const entryOwnership=()=>({default:LEVEL.OBSERVER});
export const partyOwnership=()=>({default:LEVEL.OWNER});
/** Only this player owns it; every other player is set to NONE explicitly so no grant is inherited or merged in. */
export function personalOwnership(userId,users=[]){
 const out={default:LEVEL.NONE};
 for(const u of users)if(u?.id&&!u.isGM)out[u.id]=LEVEL.NONE;
 out[userId]=LEVEL.OWNER;return out;
}
export const pageFlag=(session,kind,userId=null)=>kind==='party'?{session,kind:'party'}:{session,kind:'user',userId};
export function readPageFlag(flag){
 if(!flag||typeof flag!=='object'||!SESSION_ID.test(flag.session??''))return null;
 if(flag.kind==='party')return {session:flag.session,kind:'party'};
 if(flag.kind==='user'&&typeof flag.userId==='string'&&flag.userId)return {session:flag.session,kind:'user',userId:flag.userId};
 return null;
}

/* ---- Who may do what. Every check is made again in the store before anything is read or written. ---- */
/** Players use the journal when Quest Log's Player Access is on and the Character Hub shows 'quests' (Hub absent = shown). */
export const canUseJournal=(user,{access,hubShown})=>!!user?.isGM||(access===true&&hubShown!==false);
/** A page (as readPageFlag gives it): the GM reads every page; a player the party page and their own. */
export function canReadPage(user,page){
 if(!user||!page)return false;
 if(user.isGM)return true;
 return page.kind==='party'||page.kind==='user'&&page.userId===user.id;
}
/** Writes: the party page (GM and players), a personal page by its own player only. Archived sessions are read only. */
export function canWritePage(user,page,session){
 if(!user||!page||!session||session.archived)return false;
 if(page.kind==='party')return true;
 return !user.isGM&&page.kind==='user'&&page.userId===user.id;
}
/** Rename policy: the GM, and the user who started the session. */
export const canRename=(user,session)=>!!user&&!!session&&(user.isGM||!!session.createdBy&&session.createdBy===user.id);

/* ---- HTML: what the editor may store and show ---- */
// Allow-list: these tags only, never any attribute. Everything else is dropped (its text is kept), except the
// elements whose content is code or a widget, which are dropped with their content.
const ALLOWED=new Set(['p','br','strong','em','u','s','h1','h2','h3','h4','ul','ol','li','blockquote']);
const RENAME={b:'strong',i:'em',div:'p',strike:'s',del:'s'};
const DROP_WITH_CONTENT='script|style|iframe|object|embed|template|svg|math|noscript|textarea|select|title|head';
const escText=t=>t.replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function sanitizeHtml(html){
 let s=String(html??'');
 s=s.replace(/<!--[\s\S]*?(?:-->|$)/g,'');
 const block=new RegExp(`<(${DROP_WITH_CONTENT})\\b[^>]*>[\\s\\S]*?(?:<\\/\\1\\s*>|$)`,'gi');
 let prev;do{prev=s;s=s.replace(block,'');}while(s!==prev);
 s=s.replace(new RegExp(`<\\/?(?:${DROP_WITH_CONTENT})\\b[^>]*>`,'gi'),'');
 const out=[];let last=0;
 for(const m of s.matchAll(/<[^>]*>/g)){
  out.push(escText(s.slice(last,m.index)));last=m.index+m[0].length;
  // Not a tag (as in "1 < 2 > 0"): it is text, as a browser reads it.
  const t=m[0].match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/);if(!t){if(!/^<[!?]/.test(m[0]))out.push(escText(m[0]));continue;}
  const name=RENAME[t[2].toLowerCase()]??t[2].toLowerCase();if(!ALLOWED.has(name))continue;
  if(name==='br'){out.push('<br>');continue;}
  out.push(`<${t[1]}${name}>`);
 }
 out.push(escText(s.slice(last)));
 const clean=out.join('').trim();
 return /^(?:<p>)?(?:<br>|\s|&nbsp;)*(?:<\/p>)?$/.test(clean)?'':clean;
}
const ENTITY={amp:'&',lt:'<',gt:'>',quot:'"','#39':"'",nbsp:' '};
const decode=t=>t.replace(/&(amp|lt|gt|quot|#39|nbsp);/g,(_,k)=>ENTITY[k]);
/** Plain text of stored HTML (for search and snippets). */
export function htmlToText(html){
 return decode(String(html??'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi,'\n').replace(/<[^>]*>/g,''))
  .replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
}

/* ---- Markdown export (GM) ---- */
/** Stored HTML as Markdown: headings, bold, italics, lists, quotes. Underline has no Markdown form; its text is kept. */
export function htmlToMarkdown(html){
 const s=sanitizeHtml(html);
 const lists=[],lines=[];let line='',prefix='';
 const flush=()=>{const text=decode(line).replace(/[ \t]+$/g,'');if(text.trim()||prefix)lines.push(prefix+text);line='';prefix='';};
 const gap=()=>{if(lines.length&&lines.at(-1)!=='')lines.push('');};
 let last=0;
 for(const m of s.matchAll(/<(\/?)([a-z0-9]+)>/g)){
  line+=s.slice(last,m.index);last=m.index+m[0].length;
  const [,close,tag]=m;
  if(/^h[1-4]$/.test(tag)){if(close)flush();else{flush();gap();prefix='#'.repeat(Number(tag[1]))+' ';}continue;}
  if(tag==='p'||tag==='blockquote'){if(close){flush();if(!lists.length)lines.push('');}else{flush();if(!lists.length)gap();if(tag==='blockquote')prefix='> ';}continue;}
  if(tag==='ul'||tag==='ol'){flush();if(close){lists.pop();if(!lists.length)lines.push('');}else{if(!lists.length)gap();lists.push({tag,n:0});}continue;}
  if(tag==='li'){if(close)flush();else{flush();const l=lists.at(-1)??{tag:'ul',n:0};l.n++;prefix='  '.repeat(Math.max(0,lists.length-1))+(l.tag==='ol'?`${l.n}. `:'- ');}continue;}
  if(tag==='br'){line+='  \n'+(prefix?' '.repeat(prefix.length):'');continue;}
  if(tag==='strong')line+='**';else if(tag==='em')line+='*';else if(tag==='s')line+='~~';
 }
 line+=s.slice(last);flush();
 return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
/** One session as a Markdown document: the party journal, then each personal journal ({label, html}). */
export function sessionMarkdown(session,pages){
 const head=[`# ${session.name}`];if(session.subtitle)head.push(`*${session.subtitle}*`);
 head.push(`${session.id} · started ${session.createdAt?session.createdAt.slice(0,10):'unknown date'}`);
 return [head.join('\n\n'),...pages.map(p=>`## ${p.label}\n\n${htmlToMarkdown(p.html)||'*(empty)*'}`)].join('\n\n')+'\n';
}

/* ---- Search across what the viewer may read ---- */
/** rows: [{session, pages:[{target, label, html}]}] already limited to what the viewer may read. */
export function searchJournal(rows,query,{limit=50}={}){
 const q=oneLine(query).toLowerCase();if(!q)return [];
 const out=[];
 for(const {session,pages} of rows){
  const title=`${session.name} ${session.subtitle}`.toLowerCase().includes(q);
  let hit=false;
  for(const p of pages){
   const text=htmlToText(p.html),at=text.toLowerCase().indexOf(q);if(at<0)continue;
   hit=true;out.push({sessionId:session.id,target:p.target,label:p.label,snippet:snippet(text,at,q.length)});
  }
  if(title&&!hit)out.push({sessionId:session.id,target:'party',label:'Session name',snippet:session.subtitle?`${session.name} — ${session.subtitle}`:session.name});
  if(out.length>=limit)break;
 }
 return out.slice(0,limit);
}
function snippet(text,at,len,pad=40){
 const a=Math.max(0,at-pad),b=Math.min(text.length,at+len+pad);
 return `${a>0?'…':''}${text.slice(a,b).replace(/\s+/g,' ')}${b<text.length?'…':''}`;
}
