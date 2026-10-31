/**
 * 0.37.10: a safe snapshot of what a recipe makes, taken on the GM client and stored in a world setting, so a player can look at the
 * produced item without any permission on the world Item. Only player-facing fields: name, picture, type, the item's own description
 * text (Foundry "secret" blocks removed) and a price. Never GM notes, ids or unreleased fields. Pure helpers; main.js does the reads and the write.
 */
export const PREVIEW_SCHEMA='ag-result-previews/0.1';
export const PREVIEW_TEXT_MAX=1200;
/** 0.43.0: longest sanitized description HTML kept in a snapshot; a longer one keeps only its text. */
export const PREVIEW_HTML_MAX=4000;
const TYPE_LABELS={weapon:'Weapon',equipment:'Equipment',consumable:'Consumable',tool:'Tool',loot:'Loot',container:'Container',backpack:'Container',feat:'Feature',spell:'Spell'};
const ENTITIES={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&apos;':"'",'&nbsp;':' ','&rsquo;':'’','&lsquo;':'‘','&ndash;':'–','&mdash;':'—'};
const decode=t=>t.replace(/&[a-z#0-9]+;/gi,m=>ENTITIES[m.toLowerCase()]??'');
/** Description HTML → plain player-facing text. Removes secret blocks, scripts and styles; table rows become "Label: value" lines. */
export function plainText(html,max=PREVIEW_TEXT_MAX){
  let s=String(html??'');
  s=s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,'');
  // Foundry secrets (and anything marked GM-only) are never part of a snapshot.
  s=s.replace(/<section\b[^>]*class="[^"]*\bsecret\b[^"]*"[^>]*>[\s\S]*?<\/section>/gi,'');
  s=s.replace(/<(div|p|span|aside)\b[^>]*(?:class="[^"]*\b(?:secret|gm-only|gm-note)\b[^"]*"|data-gm-only)[^>]*>[\s\S]*?<\/\1>/gi,'');
  s=s.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi,(m,row)=>{
    const cells=[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>decode(c[1].replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim()).filter(Boolean);
    return cells.length?`\n${cells.length===2?`${cells[0]}: ${cells[1]}`:cells.join(' · ')}\n`:'';
  });
  s=s.replace(/<(br|\/p|\/li|\/h[1-6]|\/div)\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,'');
  s=decode(s).replace(/[ \t]+/g,' ').split('\n').map(l=>l.trim()).filter(Boolean).join('\n');
  return s.length>max?`${s.slice(0,max-1).trimEnd()}…`:s;
}

/* ---- 0.43.0: the popup shows the description as safe HTML (tables and headings kept), with Foundry enrichers resolved ---- */
const escText=t=>String(t).replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const KEEP_TAGS=new Set(['p','br','hr','strong','b','em','i','u','s','sub','sup','ul','ol','li','h1','h2','h3','h4','h5','h6','blockquote','table','thead','tbody','tfoot','tr','th','td','caption','span','div']);
const DROP_WITH_CONTENT=/<(script|style|iframe|object|embed|template|noscript|svg|math|form|textarea|select|button)\b[\s\S]*?<\/\1\s*>/gi;
const FALLBACK_LINK='a linked item';
/** @UUID[...]{Label}, @AGRef[...]{Label} and other @Enrichers, and [[/r 1d6]] rolls, as display text. A label wins; without one,
 * `resolve(ref)` may give a name the viewer is allowed to see; else "a linked item". Foundry markup is never left in the text. */
export function resolveEnrichers(text,resolve=null){
  return String(text??'')
    .replace(/@(\w+)\[([^\]]*)\](?:\{([^}]*)\})?/g,(m,kind,ref,label)=>{
      const l=String(label??'').trim();if(l)return l;
      let name=null;if(typeof resolve==='function'){try{name=resolve(ref,kind);}catch{name=null;}}
      return typeof name==='string'&&name.trim()?name.trim():FALLBACK_LINK;})
    .replace(/\[\[\/?\w*\s*([^\]]*)\]\](?:\{([^}]*)\})?/g,(m,formula,label)=>String(label??'').trim()||String(formula).trim());
}
/**
 * Description HTML → safe HTML for the read-only popup. Secret blocks, scripts and any tag or attribute outside a short allow-list
 * (paragraphs, headings, lists, tables, emphasis) are removed; only colspan and rowspan survive, as numbers. Enrichers are resolved
 * with resolveEnrichers. Pure string work, so it runs on the GM client when the snapshot is made and again on the viewer's client.
 */
export function cleanDescription(html,resolve=null){
  let s=String(html??'');
  s=s.replace(/<!--[\s\S]*?-->/g,'');
  s=s.replace(DROP_WITH_CONTENT,'');
  s=s.replace(/<section\b[^>]*class="[^"]*\bsecret\b[^"]*"[^>]*>[\s\S]*?<\/section>/gi,'');
  s=s.replace(/<(div|p|span|aside)\b[^>]*(?:class="[^"]*\b(?:secret|gm-only|gm-note)\b[^"]*"|data-gm-only)[^>]*>[\s\S]*?<\/\1>/gi,'');
  s=resolveEnrichers(s,resolve);
  let out='',last=0;
  for(const m of s.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)){
    out+=escText(s.slice(last,m.index));last=m.index+m[0].length;
    const tag=m[2].toLowerCase();if(!KEEP_TAGS.has(tag))continue;
    if(m[1]){out+=`</${tag}>`;continue;}
    const span=(tag==='td'||tag==='th')?[...m[3].matchAll(/\b(colspan|rowspan)\s*=\s*["']?(\d{1,2})["']?/gi)].map(a=>` ${a[1].toLowerCase()}="${a[2]}"`).join(''):'';
    out+=tag==='br'||tag==='hr'?`<${tag}>`:`<${tag}${span}>`;
  }
  out+=escText(s.slice(last));
  return out.trim();
}
const priceText=p=>{const v=Number(p?.value);return Number.isFinite(v)&&v>0?`${v} ${String(p.denomination||'gp')}`:'';};
const safeImg=v=>typeof v==='string'&&v.length<400&&!/^\s*(javascript|data):/i.test(v)&&!/["<>]/.test(v)?v:'';
/** One snapshot from a world Item's data (doc.toObject()). null when it has no name. */
export function snapshotItem(data){
  const name=String(data?.name??'').trim().slice(0,120);
  if(!name)return null;
  const html=cleanDescription(data?.system?.description?.value);
  return {name,img:safeImg(data?.img),type:TYPE_LABELS[data?.type]??'Item',text:plainText(resolveEnrichers(data?.system?.description?.value)),html:html.length<=PREVIEW_HTML_MAX?html:'',price:priceText(data?.system?.price)};
}
const cleanSnap=v=>{
  if(!v||typeof v!=='object')return null;
  const name=String(v.name??'').trim().slice(0,120);if(!name)return null;
  const html=typeof v.html==='string'&&v.html.length<=PREVIEW_HTML_MAX?v.html:''; // cleaned again when shown: a flag is never trusted
  const uuid=/^Item\.[A-Za-z0-9]{16}$/.test(String(v.uuid??''))?String(v.uuid):''; // a world-local binding, never a canonical id
  return {name,img:safeImg(v.img),type:String(v.type??'Item').slice(0,40),text:String(v.text??'').slice(0,PREVIEW_TEXT_MAX),html,price:String(v.price??'').slice(0,40),...(uuid?{uuid}:{})};
};
/** 0.37.12: what a character may see about the recipes it knows, stored on the Actor (owners and GMs read it; never a world setting):
 * {[recipeId]: {result: snapshot|null, ingredients:[{name,img,text,quantity}], tools:'text', workstation:'text'}}. Malformed parts are dropped; never throws. */
export function readRecipePreviews(raw){
  const src=raw&&typeof raw==='object'&&raw.recipes&&typeof raw.recipes==='object'?raw.recipes:{};
  const out={};
  for(const [id,v] of Object.entries(src)){
    if(!/^REC-[A-Z0-9-]+$/.test(id)||!v||typeof v!=='object')continue;
    out[id]={result:cleanSnap(v.result),
      ingredients:(Array.isArray(v.ingredients)?v.ingredients:[]).slice(0,24).map(i=>({...(cleanSnap(i)??{name:'',img:'',type:'Material',text:'',html:'',price:''}),quantity:Math.max(1,Number(i?.quantity)||1)})).filter(i=>i.name),
      tools:String(v.tools??'').slice(0,200),workstation:String(v.workstation??'').slice(0,120)};
  }
  return out;
}
export const storedRecipePreviews=recipes=>({schema:PREVIEW_SCHEMA,recipes});
export const samePreviews=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
