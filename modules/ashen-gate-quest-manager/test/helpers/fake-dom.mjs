// Tiny fake DOM for the Quest Log tests: parses start tags into a tree, enough for querySelector, values,
// checkboxes, selects and events. Not a browser; proves wiring only.
export const doc={focused:null};
export class El{
 constructor(attrs={},{tag='DIV',parent=null}={}){
  this.attrs={...attrs};this.tagName=tag;this.parent=parent;this.children=[];this.listeners={};this.style={};
  const cls=new Set((attrs.class??'').split(' ').filter(Boolean));
  this.classList={add:c=>cls.add(c),remove:c=>cls.delete(c),contains:c=>cls.has(c),includes:c=>cls.has(c),get list(){return [...cls];}};
  this.scrollTop=0;this.scrollLeft=0;this.value=attrs.value??'';this.type=attrs.type??'';this.id=attrs.id??'';
  this.checked='checked' in attrs;this.disabled='disabled' in attrs;this.hidden='hidden' in attrs;this.open='open' in attrs;
  this.dataset=Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-(\w)/g,(_,c)=>c.toUpperCase()),v]));
 }
 getAttribute(k){return k in this.attrs?this.attrs[k]:null;}
 setAttribute(k,v){this.attrs[k]=v;}
 removeAttribute(k){delete this.attrs[k];}
 addEventListener(ev,fn){(this.listeners[ev]??=[]).push(fn);}
 // Bubbles to ancestors, like a real input/change event.
 fire(ev,e={}){const event={target:this,preventDefault(){},stopPropagation(){},...e};let n=this;while(n){for(const fn of n.listeners[ev]??[])fn(event);n=n.parent;}}
 closest(sel){let n=this;while(n){if(matches(n,sel))return n;n=n.parent;}return null;}
 contains(el){let n=el;while(n){if(n===this)return true;n=n.parent;}return false;}
 all(){return this.children.flatMap(c=>[c,...c.all()]);}
 querySelectorAll(sel){return this.all().filter(c=>matches(c,sel));}
 querySelector(sel){return this.querySelectorAll(sel)[0]??null;}
 focus(){doc.focused=this;}
 setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}
 dispatchEvent(e){this.fire(e.type);}
 set innerHTML(h){this._html=h;this.children=[];parse(h,this);}
 get innerHTML(){return this._html??'';}
 set outerHTML(h){const p=this.parent,at=p.children.indexOf(this),tmp=new El();tmp.innerHTML=h;for(const c of tmp.children)c.parent=p;p.children.splice(at,1,...tmp.children);}
 insertAdjacentHTML(_where,h){const tmp=new El();tmp.innerHTML=h;for(const c of tmp.children){c.parent=this;this.children.push(c);}}
 remove(){const p=this.parent;if(p)p.children.splice(p.children.indexOf(this),1);}
}
// Selectors: tag, #id, .class, [attr], [attr="v"], [attr^="v"], compounds, "A B", "A,B" and :not(X *) (descendant-of exclusion).
export function matches(el,sel){
 if(sel.includes(',')&&!sel.includes('('))return sel.split(',').some(x=>matches(el,x.trim()));
 sel=sel.trim();
 const not=sel.match(/^(.*):not\((.+) \*\)$/);if(not){if(!matches(el,not[1]))return false;let n=el.parent;while(n){if(matches(n,not[2]))return false;n=n.parent;}return true;}
 const parts=sel.split(/\s+/);if(parts.length>1){const last=parts.pop();if(!matches(el,last))return false;let n=el.parent;while(n){if(matches(n,parts.join(' ')))return true;n=n.parent;}return false;}
 const tag=sel.match(/^[a-z]+/);if(tag&&el.tagName!==tag[0].toUpperCase())return false;
 return [...sel.matchAll(/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:(\^?=)"([^"]*)")?\]/g)].every(([,id,cls,attr,op,v])=>id?el.id===id:cls?el.classList.contains(cls):op==='^='?String(el.getAttribute(attr)??'').startsWith(v):op?el.getAttribute(attr)===v:el.getAttribute(attr)!==null);
}
const unescape=v=>v.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const VOID=new Set(['input','i','br','img']);
function parse(html,root){
 const stack=[root];
 for(const m of html.matchAll(/<(\/?)([a-z]+)([^>]*)>/g)){
  const [,close,tag,rest]=m;
  // A closing tag closes its own element (and anything left open inside it); </i> on a void-treated tag is ignored.
  if(close){if(VOID.has(tag))continue;const at=stack.map(e=>e.tagName).lastIndexOf(tag.toUpperCase());if(at>0)stack.length=at;continue;}
  const attrs=Object.fromEntries([...rest.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([,k,v])=>[k,unescape(v??'')]));
  const el=new El(attrs,{tag:tag.toUpperCase(),parent:stack.at(-1)});stack.at(-1).children.push(el);
  if(tag==='textarea'){const from=m.index+m[0].length;el.value=unescape(html.slice(from,html.indexOf('</textarea>',from)));}
  if(!VOID.has(tag))stack.push(el);
 }
 // A select's value is its selected option (or the first one).
 for(const s of root.querySelectorAll('select')){const opts=s.querySelectorAll('option');s.value=(opts.find(o=>'selected' in o.attrs)??opts[0])?.attrs.value??'';}
}
