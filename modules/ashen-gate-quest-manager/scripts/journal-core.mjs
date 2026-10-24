// 0.16.0 Game Journal — pure core. No Foundry globals, so every rule here is tested directly.
//
// A session is one Foundry JournalEntry (folder Ashen Gate / Quests / Game Journal) carrying the session record in
// its flag `session`; its pages are the party journal and one personal journal per player user (flag `journalPage`).
// Foundry ownership does the enforcing for writes on the server: the entry is OBSERVER for everyone, the party page
// OWNER for everyone, a personal page OWNER for its player only and NONE (explicit, not inherited) for every other
// player. 0.20.0: a GM-only notes page (flag kind 'gm') sits with the party journal: NONE for every player, so
// Foundry itself never sends it to one; the rules below refuse it to players as well. So a player writes their own page and the party page with no GM connected; the GM reads everything.
// Quest Log's API checks the same rules again (journalAccess below) before it reads or writes anything.

export const JOURNAL_CONTRACT='ag-quest-journal/1';
export const SESSION_ID=/^SESSION-\d{3,}$/;
export const MAX_NAME=80;
export const MAX_SUBTITLE=120;
export const MAX_HTML=200000;
/** The target name of the GM-only notes page in the store and API ('me', 'party', a player's user id, or this). */
export const GM_TARGET='gm-notes';
const LEVEL={NONE:0,OBSERVER:2,OWNER:3};

export const sessionId=n=>`SESSION-${String(n).padStart(3,'0')}`;
/** The number the next session gets: one more than the highest so far, archived sessions included. */
export function nextNumber(sessions){return Math.max(0,...[...sessions].map(s=>Number.isInteger(s?.number)?s.number:0))+1;}
/** A free id for that number (a raced duplicate number moves up until the id is unused). */
export function freeId(n,sessions){const used=new Set([...sessions].map(s=>s?.id));let k=n;while(used.has(sessionId(k)))k++;return {number:k,id:sessionId(k)};}

const oneLine=v=>String(v??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
/** A calendar date as YYYY-MM-DD, or '' for none/automatic; refuses anything else. */
export function cleanDate(v){
 const t=String(v??'').trim();if(!t)return '';
 const m=t.match(/^(\d{4})-(\d{2})-(\d{2})$/),d=m&&new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
 if(!d||d.getUTCFullYear()!==+m[1]||d.getUTCMonth()!==+m[2]-1||d.getUTCDate()!==+m[3])throw new Error('A date looks like 2026-10-24.');
 return t;
}
const validDate=v=>{try{return cleanDate(v)===v&&v!=='';}catch{return false;}};
const pad=n=>String(n).padStart(2,'0');
/** The date a session got automatically: the day it was started, in the viewer's time zone (YYYY-MM-DD, or ''). */
export function autoDate(createdAt){
 const d=new Date(createdAt);return !createdAt||Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
/** The date to show: the GM's own date when set, else the automatic one. */
export const sessionDate=s=>s?.date||autoDate(s?.createdAt);
/** "Session 3 - The road" for the journal's title; just the name when it already reads "Session 3" or has no number. */
export function sessionHeading(s){
 const name=String(s?.name??'');
 return Number.isInteger(s?.number)&&s.number>0&&name.trim()!==`Session ${s.number}`?`Session ${s.number} - ${name}`:name;
}
/** Cleans a name/subtitle pair; refuses an empty or too-long name or a too-long subtitle. A date is returned only when given. */
export function cleanTitle({name,subtitle,date}={},{fallback=''}={}){
 const n=oneLine(name)||oneLine(fallback),s=oneLine(subtitle);
 if(!n)throw new Error('A session needs a name.');
 if(n.length>MAX_NAME)throw new Error(`Session names are at most ${MAX_NAME} characters.`);
 if(s.length>MAX_SUBTITLE)throw new Error(`Subtitles are at most ${MAX_SUBTITLE} characters.`);
 return date===undefined?{name:n,subtitle:s}:{name:n,subtitle:s,date:cleanDate(date)};
}
/** The stored session record, or null when the flag is missing or malformed (such an entry is ignored). */
export function readSession(flag){
 if(!flag||typeof flag!=='object'||flag.v!==1||!SESSION_ID.test(flag.id??'')||!Number.isInteger(flag.number))return null;
 return {v:1,id:flag.id,number:flag.number,name:oneLine(flag.name)||`Session ${flag.number}`,subtitle:oneLine(flag.subtitle),
  createdAt:typeof flag.createdAt==='string'?flag.createdAt:'',createdBy:typeof flag.createdBy==='string'?flag.createdBy:'',archived:flag.archived===true,
  ...(typeof flag.date==='string'&&validDate(flag.date)?{date:flag.date}:{})};
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
/** The GM-only notes page: NONE for every player (explicit), so Foundry never sends its text to a player. */
export function gmOwnership(users=[]){
 const out={default:LEVEL.NONE};
 for(const u of users)if(u?.id&&!u.isGM)out[u.id]=LEVEL.NONE;
 return out;
}
export const pageFlag=(session,kind,userId=null)=>kind==='party'||kind==='gm'?{session,kind}:{session,kind:'user',userId};
export function readPageFlag(flag){
 if(!flag||typeof flag!=='object'||!SESSION_ID.test(flag.session??''))return null;
 if(flag.kind==='party'||flag.kind==='gm')return {session:flag.session,kind:flag.kind};
 if(flag.kind==='user'&&typeof flag.userId==='string'&&flag.userId)return {session:flag.session,kind:'user',userId:flag.userId};
 return null;
}

/* ---- Who may do what. Every check is made again in the store before anything is read or written. ---- */
/** Players use the journal when Quest Log's Player Access is on and the Character Hub shows 'quests' (Hub absent = shown). */
export const canUseJournal=(user,{access,hubShown})=>!!user?.isGM||(access===true&&hubShown!==false);
/** A page (as readPageFlag gives it): the GM reads every page; a player the party page and their own, never the GM-only notes. */
export function canReadPage(user,page){
 if(!user||!page)return false;
 if(user.isGM)return true;
 if(page.kind==='gm')return false;
 return page.kind==='party'||page.kind==='user'&&page.userId===user.id;
}
/** Writes: the party page (GM and players), a personal page by its own player only, the GM-only notes by the GM only.
    Archived sessions are read only. */
export function canWritePage(user,page,session){
 if(!user||!page||!session||session.archived)return false;
 if(page.kind==='gm')return !!user.isGM;
 if(page.kind==='party')return true;
 return !user.isGM&&page.kind==='user'&&page.userId===user.id;
}
/** Deleting a session (archived ones only) and setting its date: the GM only. */
export const canDelete=(user,session)=>!!user?.isGM&&!!session&&session.archived===true;
export const canSetDate=user=>!!user?.isGM;
/** Rename policy: the GM, and the user who started the session. */
export const canRename=(user,session)=>!!user&&!!session&&(user.isGM||!!session.createdBy&&session.createdBy===user.id);

/* ---- HTML: what the editor may store and show ---- */
// Allow-list: these tags only, never any attribute. Everything else is dropped (its text is kept), except the
// elements whose content is code or a widget, which are dropped with their content.
const ALLOWED=new Set(['p','br','hr','mark','strong','em','u','s','h1','h2','h3','h4','ul','ol','li','blockquote']);
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
  if(name==='hr'){if(!t[1])out.push('<hr>');continue;}
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
/** Stored HTML as Markdown: headings, bold, italics, lists, quotes. Underline and highlight have no Markdown form; their text is kept. */
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
  if(tag==='hr'){flush();gap();lines.push('---','');continue;}
  if(tag==='br'){line+='  \n'+(prefix?' '.repeat(prefix.length):'');continue;}
  if(tag==='strong')line+='**';else if(tag==='em')line+='*';else if(tag==='s')line+='~~';
 }
 line+=s.slice(last);flush();
 return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
/** One session as a Markdown document: the party journal, then each personal journal ({label, html}). */
export function sessionMarkdown(session,pages){
 const head=[`# ${session.name}`];if(session.subtitle)head.push(`*${session.subtitle}*`);
 head.push(`${session.id} · ${session.date?`dated ${session.date}`:`started ${session.createdAt?session.createdAt.slice(0,10):'unknown date'}`}`);
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

/* ---- Auto format: a conservative tidy-up of pasted or typed text ---- */
// Works on the sanitized HTML of one page. It never joins or splits sentences and never rewrites words: it normalises
// spaces and blank lines, turns bullet and numbered lines into real lists, fixes spacing around punctuation, and makes
// a heading of a lone "Title:" or ALL CAPS line only when that is plain text standing alone with something after it.
// Headings, lists, quotes and rules already on the page are left exactly as they are. A final check compares the
// letters before and after; if they differ at all, nothing is changed.
const GLYPHS='\\u2022\\u2023\\u25E6\\u25AA\\u25CF\\u25CB\\u00B7\\u2043\\u2219';
const GLYPH=new RegExp(`^[${GLYPHS}]\\s*(?=\\S)`),DASH=/^[-*\u2013\u2014]\s+(?=\S)/,NUMBER=/^\(?(\d{1,3})[.)]\s+(?=\S)/;
const lettersOf=h=>(htmlToText(h).match(/\p{L}+/gu)??[]).join('');
function tidyLine(line,tally){
 const spaced=line.replace(/&nbsp;|\u00a0/g,' ').replace(/[\u200b\ufeff]/g,'').replace(/[ \t]{2,}/g,' ').trim();
 if(spaced!==line)tally.space++;
 const l=spaced.replace(/\s+([,;])/g,'$1').replace(/\s+([.:!?])(?=\s|$|<)/g,'$1')
  .replace(/([,;])(?=[A-Za-z\u00C0-\u024F])/g,'$1 ')
  .replace(/([a-z\u00DF-\u00FF][.!?])(?=[A-Z\u00C0-\u00DE])/g,'$1 ');
 if(l!==spaced)tally.punct++;
 return l;
}
const words=l=>l.split(/\s+/).filter(Boolean).length;
/** The heading text for a lone line, or ''. Plain text only, short, and followed by something. */
function headingOf(l,hasNext){
 if(!hasNext||/[<&]/.test(l)||l.length>60||words(l)>8)return '';
 if(/^[^:]+:$/.test(l)&&/^[A-Z\u00C0-\u00DE]/.test(l)&&/\p{L}/u.test(l.slice(0,-1)))return l.slice(0,-1).trim();
 if((l.match(/\p{L}/gu)??[]).length>=4&&l===l.toUpperCase()&&!/[.!?,;:]$/.test(l))return l;
 return '';
}
function topBlocks(src){
 const groups=[];let depth=0,start=0,pos=0,kind='',loose='';
 const pushLoose=()=>{if(loose.replace(/<br>/g,'').trim())groups.push({kind:'lines',html:loose});loose='';};
 for(const m of src.matchAll(/<(\/?)(p|h[1-4]|ul|ol|blockquote|hr)>/g)){
  const [tag,close,name]=m,end=m.index+tag.length;
  if(depth===0){
   loose+=src.slice(pos,m.index);pos=end;
   if(name==='hr'){pushLoose();groups.push({kind:'raw',html:'<hr>'});}
   else if(!close){pushLoose();depth=1;start=m.index;kind=name;}
  }else if(name!=='hr'){
   depth+=close?-1:1;
   if(depth===0){const whole=src.slice(start,end),inner=whole.slice(whole.indexOf('>')+1,whole.lastIndexOf('<'));pos=end;
    groups.push(kind==='p'&&!/<(?:ul|ol|blockquote|h[1-4]|p)>/.test(inner)?{kind:'lines',html:inner}:{kind:'raw',html:whole});}
  }
 }
 if(depth>0)groups.push({kind:'raw',html:src.slice(start)});else{loose+=src.slice(pos);pushLoose();}
 return groups;
}
/** {html, changes:[sentence], ok}. `changes` is empty when there is nothing to tidy; ok is false if it refused to change anything. */
export function autoFormatHtml(input){
 const src=sanitizeHtml(input),groups=topBlocks(src);
 const tally={space:0,punct:0,blank:0,bullets:0,numbers:0,heads:[]};
 // Stage 1: raw blocks and tidied paragraphs (a blank line ends a paragraph), each line classified.
 const items=[];
 for(const g of groups){
  if(g.kind==='raw'){items.push({raw:g.html});continue;}
  const lines=g.html.split(/<br>/).map(l=>tidyLine(l,tally));
  const paras=[[]];for(const l of lines){if(l)paras.at(-1).push(l);else if(paras.at(-1).length)paras.push([]);}
  if(!paras.at(-1).length)paras.pop();
  tally.blank+=Math.max(0,lines.filter(l=>!l).length-Math.max(0,paras.length-1));
  for(const p of paras)items.push({cls:p.map(line=>{
   const n=line.match(NUMBER);if(n)return {type:'ol',n:Number(n[1]),line,text:line.slice(n[0].length).trim()};
   const g1=line.match(GLYPH);if(g1)return {type:'ul',glyph:true,line,text:line.slice(g1[0].length).trim()};
   const d=line.match(DASH);if(d)return {type:'ul',glyph:false,line,text:line.slice(d[0].length).trim()};
   return {type:'t',line,text:line};})});
 }
 // Stage 2: lists (a run may span paragraphs when each is only list lines of one kind), headings, paragraphs.
 const out=[];let cur=null;
 const paraHtml=(lines,more)=>{
  const h=lines.length===1?headingOf(lines[0],more):'';
  if(h){tally.heads.push(h);return `<h3>${h}</h3>`;}
  return `<p>${lines.join('<br>')}</p>`;
 };
 const flushList=()=>{
  if(!cur)return;
  const all=cur.paras.flat(),ok=cur.type==='ul'?all.length>=2||all[0].glyph:all[0].n===1&&all.length>=2&&all.every((r,k)=>r.n===k+1);
  if(ok){out.push(`<${cur.type}>${all.map(r=>`<li>${r.text}</li>`).join('')}</${cur.type}>`);
   if(cur.type==='ul')tally.bullets+=all.length;else tally.numbers+=all.length;}
  else for(const p of cur.paras)out.push(`<p>${p.map(r=>r.line).join('<br>')}</p>`);
  cur=null;
 };
 items.forEach((it,idx)=>{
  if(it.raw!==undefined){flushList();out.push(it.raw);return;}
  const t=it.cls[0].type;
  if(t!=='t'&&it.cls.every(c=>c.type===t)){if(cur&&cur.type!==t)flushList();(cur??={type:t,paras:[]}).paras.push(it.cls);return;}
  flushList();
  for(let i=0;i<it.cls.length;){
   let j=i;const ty=it.cls[i].type;while(j<it.cls.length&&it.cls[j].type===ty)j++;
   const run=it.cls.slice(i,j);
   if(ty==='t'){out.push(paraHtml(run.map(r=>r.line),idx<items.length-1||j<it.cls.length));}
   else{cur={type:ty,paras:[run]};flushList();}
   i=j;
  }
 });
 flushList();
 const html=out.join('');
 if(html===src)return {html:src,changes:[],ok:true};
 if(lettersOf(html)!==lettersOf(src))return {html:src,changes:[],ok:false};
 const n=(k,w)=>`${k} ${w}${k===1?'':'s'}`,changes=[];
 if(tally.bullets)changes.push(`Make ${n(tally.bullets,'bullet line')} into a bulleted list.`);
 if(tally.numbers)changes.push(`Make ${n(tally.numbers,'numbered line')} into a numbered list.`);
 if(tally.heads.length)changes.push(`Make ${tally.heads.length===1?'this line a heading':'these lines headings'}: ${tally.heads.map(h=>`"${h}"`).join(', ')}.`);
 if(tally.punct)changes.push(`Fix spacing around punctuation in ${n(tally.punct,'line')}.`);
 if(tally.space)changes.push(`Trim extra and trailing spaces in ${n(tally.space,'line')}.`);
 if(tally.blank)changes.push('Remove extra blank lines.');
 if(!changes.length)changes.push('Tidy the layout.');
 return {html,changes,ok:true};
}
