/**
 * Minimal DOM for Node tests of sidebar markup. Supports what the Ashen Gate launcher
 * code uses: tree edits, dataset, classList, listeners and querySelector(All) with
 * tag, #id, .class, [attr] / [attr="value"] compounds, descendant combinators and
 * comma lists. Not a browser: it proves logic, not layout.
 */
const camel=name=>name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());

function parseCompound(text){
  const out={tag:null,id:null,classes:[],attrs:[]};
  const re=/([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/gy;
  let m;
  while(re.lastIndex<text.length){
    m=re.exec(text);
    if(!m)throw new Error(`mini-dom: unsupported selector "${text}"`);
    if(m[1])out.tag=m[1].toLowerCase();
    else if(m[2])out.id=m[2];
    else if(m[3])out.classes.push(m[3]);
    else out.attrs.push([m[4],m[5]]);
  }
  return out;
}

export class Element {
  constructor(tagName='div'){
    this.tagName=tagName.toUpperCase();
    this.children=[];this.parentElement=null;
    this.dataset={};this.attributes={};this.listeners={};
    this.id='';this.className='';this._text='';
    const self=this;
    this.classList={
      add:(...names)=>{self.className=[...new Set([...self.className.split(' ').filter(Boolean),...names])].join(' ');},
      contains:name=>self.className.split(' ').includes(name)
    };
  }
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  set textContent(value){this.children=[];this._text=String(value);}
  setAttribute(name,value){
    if(name.startsWith('data-'))this.dataset[camel(name.slice(5))]=String(value);
    else if(name==='id')this.id=String(value);
    else if(name==='class')this.className=String(value);
    else this.attributes[name]=String(value);
  }
  getAttribute(name){
    if(name.startsWith('data-'))return this.dataset[camel(name.slice(5))]??null;
    if(name==='id')return this.id||null;
    if(name==='class')return this.className||null;
    return this.attributes[name]??null;
  }
  hasAttribute(name){return this.getAttribute(name)!==null;}
  append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
  prepend(...nodes){for(const node of [...nodes].reverse()){node.remove();node.parentElement=this;this.children.unshift(node);}}
  insertBefore(node,ref){
    if(!ref)return this.append(node);
    node.remove();node.parentElement=this;
    this.children.splice(this.children.indexOf(ref),0,node);return node;
  }
  before(...nodes){for(const node of nodes)this.parentElement.insertBefore(node,this);}
  after(...nodes){const p=this.parentElement;const ref=p.children[p.children.indexOf(this)+1];for(const node of nodes)p.insertBefore(node,ref);}
  remove(){
    if(!this.parentElement)return;
    const siblings=this.parentElement.children;
    siblings.splice(siblings.indexOf(this),1);this.parentElement=null;
  }
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  click(){const event={type:'click',defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){}};
    for(const fn of this.listeners.click??[])fn(event);return event;}
  matchesCompound(c){
    if(c.tag&&this.tagName.toLowerCase()!==c.tag)return false;
    if(c.id&&this.id!==c.id)return false;
    if(c.classes.some(name=>!this.classList.contains(name)))return false;
    return c.attrs.every(([name,value])=>value===undefined?this.hasAttribute(name):this.getAttribute(name)===value);
  }
  matches(selector){
    return selector.split(',').some(part=>{
      const chain=part.trim().split(/\s+/).map(parseCompound);
      if(!this.matchesCompound(chain.at(-1)))return false;
      let node=this.parentElement;
      for(let i=chain.length-2;i>=0;i--){
        while(node&&!node.matchesCompound(chain[i]))node=node.parentElement;
        if(!node)return false;
        node=node.parentElement;
      }
      return true;
    });
  }
  descendants(){return this.children.flatMap(c=>[c,...c.descendants()]);}
  querySelectorAll(selector){return this.descendants().filter(node=>node.matches(selector));}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
}

/** Installs a fresh global document and returns it. */
export function installDocument(){
  const body=new Element('body');
  const document={body,createElement:tag=>new Element(tag),
    querySelector:s=>body.querySelector(s),querySelectorAll:s=>body.querySelectorAll(s)};
  globalThis.document=document;
  globalThis.HTMLElement=Element;
  return document;
}

/** A Foundry-shaped Actors directory: header (actions + search) followed by the list. */
export function actorsDirectory(document=globalThis.document){
  const root=document.createElement('section');root.id='actors';root.dataset.tab='actors';
  const header=document.createElement('header');header.className='directory-header';
  const actions=document.createElement('div');actions.className='header-actions action-buttons';
  const search=document.createElement('div');search.className='header-search';
  header.append(actions,search);
  const list=document.createElement('ol');list.className='directory-list';
  root.append(header,list);
  document.body.append(root);
  return {root,header,actions,search,list};
}
