/**
 * 0.37.10: a safe snapshot of what a recipe makes, taken on the GM client and stored in a world setting, so a player can look at the
 * produced item without any permission on the world Item. Only player-facing fields: name, picture, type, the item's own description
 * text (Foundry "secret" blocks removed) and a price. Never GM notes, ids or unreleased fields. Pure helpers; main.js does the reads and the write.
 */
export const PREVIEW_SCHEMA='ag-result-previews/0.1';
export const PREVIEW_TEXT_MAX=1200;
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
const priceText=p=>{const v=Number(p?.value);return Number.isFinite(v)&&v>0?`${v} ${String(p.denomination||'gp')}`:'';};
const safeImg=v=>typeof v==='string'&&v.length<400&&!/^\s*(javascript|data):/i.test(v)&&!/["<>]/.test(v)?v:'';
/** One snapshot from a world Item's data (doc.toObject()). null when it has no name. */
export function snapshotItem(data){
  const name=String(data?.name??'').trim().slice(0,120);
  if(!name)return null;
  return {name,img:safeImg(data?.img),type:TYPE_LABELS[data?.type]??'Item',text:plainText(data?.system?.description?.value),price:priceText(data?.system?.price)};
}
const cleanSnap=v=>{
  if(!v||typeof v!=='object')return null;
  const name=String(v.name??'').trim().slice(0,120);if(!name)return null;
  return {name,img:safeImg(v.img),type:String(v.type??'Item').slice(0,40),text:String(v.text??'').slice(0,PREVIEW_TEXT_MAX),price:String(v.price??'').slice(0,40)};
};
/** 0.37.12: what a character may see about the recipes it knows, stored on the Actor (owners and GMs read it; never a world setting):
 * {[recipeId]: {result: snapshot|null, ingredients:[{name,img,text,quantity}], tools:'text', workstation:'text'}}. Malformed parts are dropped; never throws. */
export function readRecipePreviews(raw){
  const src=raw&&typeof raw==='object'&&raw.recipes&&typeof raw.recipes==='object'?raw.recipes:{};
  const out={};
  for(const [id,v] of Object.entries(src)){
    if(!/^REC-[A-Z0-9-]+$/.test(id)||!v||typeof v!=='object')continue;
    out[id]={result:cleanSnap(v.result),
      ingredients:(Array.isArray(v.ingredients)?v.ingredients:[]).slice(0,24).map(i=>({...(cleanSnap(i)??{name:'',img:'',type:'Material',text:'',price:''}),quantity:Math.max(1,Number(i?.quantity)||1)})).filter(i=>i.name),
      tools:String(v.tools??'').slice(0,200),workstation:String(v.workstation??'').slice(0,120)};
  }
  return out;
}
export const storedRecipePreviews=recipes=>({schema:PREVIEW_SCHEMA,recipes});
export const samePreviews=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
