// 0.26.2: leaving the Gathering Nodes editor (Save, Cancel/Discard, All nodes) returns the list to where it was and puts
// the focus on that node's Edit button. The 0.26.0 test only checked the remembered values; this one runs the real
// render code (_prepareContext, _preRender, _onRender) against a parsed DOM, with the two things a live Foundry does that
// broke it: a modal confirm that answers before it has closed (the window is inert meanwhile, then the focus falls to
// the page), and Save's Journal write, whose update hook renders the window again. Mocked DOM: no layout, no real browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));

// ---- a small parsed DOM: elements, attributes, compound and descendant selectors, focus, inert while a modal is open
const kebab=s=>s.replace(/[A-Z]/g,c=>`-${c.toLowerCase()}`);
const VOID=new Set(['input','br','img','hr','meta','link']);
class El{
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.doc=doc;this.ownerDocument=doc;this.children=[];this.parentElement=null;this.attrs=new Map();this.listeners={};this.scrollTop=0;this.scrollLeft=0;this.open=false;this.hidden=false;this.value='';this.defaultValue='';
    const self=this;this.dataset=new Proxy({},{get:(_,k)=>self.attrs.get(`data-${kebab(String(k))}`),set:(_,k,v)=>{self.attrs.set(`data-${kebab(String(k))}`,String(v));return true;},deleteProperty:(_,k)=>{self.attrs.delete(`data-${kebab(String(k))}`);return true;}});}
  get attributes(){return [...this.attrs].map(([name,value])=>({name,value}));}
  get id(){return this.attrs.get('id')??'';}
  get type(){return this.attrs.get('type')??'';}
  get disabled(){return this.attrs.has('disabled');}
  set disabled(v){if(v)this.attrs.set('disabled','');else this.attrs.delete('disabled');}
  get classList(){const c=()=>(this.attrs.get('class')??'').split(/\s+/).filter(Boolean);return {contains:x=>c().includes(x)};}
  get isConnected(){let el=this;while(el.parentElement)el=el.parentElement;return el===this.doc.body;}
  getAttribute(k){return this.attrs.has(k)?this.attrs.get(k):null;}
  setAttribute(k,v){this.attrs.set(k,String(v));}
  removeAttribute(k){this.attrs.delete(k);}
  append(...kids){for(const k of kids){k.parentElement=this;this.children.push(k);}}
  replaceWith(next){const p=this.parentElement,i=p.children.indexOf(this);p.children[i]=next;next.parentElement=p;this.parentElement=null;}
  remove(){const p=this.parentElement;if(p){p.children.splice(p.children.indexOf(this),1);this.parentElement=null;}}
  contains(el){for(let x=el;x;x=x.parentElement)if(x===this)return true;return false;}
  addEventListener(t,fn){(this.listeners[t]??=[]).push(fn);}
  removeEventListener(t,fn){this.listeners[t]=(this.listeners[t]??[]).filter(f=>f!==fn);}
  dispatch(type){const e={type,target:this};for(let x=this;x;x=x.parentElement)for(const fn of [...(x.listeners[type]??[])])fn(e);}
  /** A modal confirm makes everything outside it inert: focus() there does nothing. */
  focus(){if(this.doc.modal&&!this.doc.modal.contains(this))return;if(!this.isConnected)return;this.doc.activeElement=this;}
  *all(){for(const c of this.children){yield c;yield* c.all();}}
  matches(sel){return sel.split(',').some(one=>matchSel(this,one.trim()));}
  closest(sel){for(let x=this;x;x=x.parentElement)if(x.matches(sel))return x;return null;}
  querySelectorAll(sel){return [...this.all()].filter(el=>el.matches(sel));}
  querySelector(sel){return this.querySelectorAll(sel)[0]??null;}
}
function matchOne(el,sel){
  const parts=sel.match(/^[a-z]+|\.[\w-]+|#[\w-]+|\[[^\]]+\]/gi)??[];
  if(parts.join('')!==sel)throw Error(`fake DOM cannot match "${sel}"`);
  return parts.every(p=>{
    if(p[0]==='.')return el.classList.contains(p.slice(1));
    if(p[0]==='#')return el.id===p.slice(1);
    if(p[0]==='['){const [,n,v]=p.match(/^\[([\w-]+)(?:="((?:[^"\\]|\\.)*)")?\]$/)??[];return v===undefined?el.attrs.has(n):el.getAttribute(n)===v.replace(/\\(.)/g,'$1');}
    return el.tagName===p.toUpperCase();});
}
function matchSel(el,sel){
  const chain=sel.split(/\s+/).filter(Boolean);
  if(!matchOne(el,chain.at(-1)))return false;
  let i=chain.length-2;for(let x=el.parentElement;x&&i>=0;x=x.parentElement)if(matchOne(x,chain[i]))i--;
  return i<0;
}
const unent=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function parse(html,doc){
  const root=new El('div',doc),stack=[root];
  for(const m of html.matchAll(/<!--[\s\S]*?-->|<\/([a-z0-9]+)\s*>|<([a-z0-9]+)((?:\s+[^\s=>\/]+(?:="[^"]*"|='[^']*')?)*)\s*\/?>/gi)){
    if(m[1]){while(stack.length>1&&stack.pop().tagName!==m[1].toUpperCase());continue;}
    if(!m[2])continue;
    const el=new El(m[2],doc);
    for(const a of (m[3]??'').matchAll(/([^\s=>\/]+)(?:="([^"]*)"|='([^']*)')?/g))el.attrs.set(a[1],unent(a[2]??a[3]??''));
    if(el.tagName==='INPUT')el.value=el.defaultValue=el.getAttribute('value')??'';
    if(el.tagName==='DETAILS')el.open=el.attrs.has('open');
    stack.at(-1).append(el);if(!VOID.has(m[2].toLowerCase()))stack.push(el);
  }
  return root.children[0];
}
const doc={activeElement:null,modal:null};doc.body=new El('body',doc);doc.activeElement=doc.body;
globalThis.document=Object.assign(doc,{documentElement:{dataset:{}}});

// ---- Foundry stand-ins. Renders run one after another, as ApplicationV2's do; step mode lets a test overlap two.
const hooks={},on={},errors=[],values={partyRoster:[],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
class FakeApp{
  constructor(options={}){this.options=options;this._queue=Promise.resolve();}
  render(){this._queue=this._queue.then(()=>this._run()).catch(e=>errors.push(e));return this;}
  async _prepare(){const ctx=await this._prepareContext({});await this._preRender(ctx,{});return ctx;}
  async _finish(ctx){
    if(!this.element){this.element=new El('div',doc);this.element.setAttribute('class','application agl-app ag-app');const wc=new El('section',doc);wc.setAttribute('class','window-content');this.element.append(wc);doc.body.append(this.element);}
    const wc=this.element.querySelector('.window-content'),part=parse(`<div class="agl-host" data-application-part="main">${ctx.html}</div>`,doc),prior=wc.children[0];
    if(prior){const lost=prior.contains(doc.activeElement);prior.replaceWith(part);if(lost)doc.activeElement=doc.body;}else wc.append(part);
    this.rendered=true;await this._onRender(ctx,{});
  }
  async _run(){await this._finish(await this._prepare());}
  async _prepareContext(){return {};}async _preRender(){}async _onRender(){}
  async close(){this.closed=true;return this;}
}
/** DialogV2.wait as Foundry runs it: the answer comes back first, the modal closes a moment later and the focus it
 * took returns to its opener, which the re-render removed, so it lands on the page. */
let answer=true;
const DialogV2={async wait(opts){
  const modal=new El('dialog',doc);doc.body.append(modal);doc.modal=modal;doc.activeElement=modal;
  setTimeout(()=>{modal.remove();doc.modal=null;doc.activeElement=doc.body;},30);
  const b=opts.buttons?.find(x=>x.action===(answer?'confirm':'cancel'));return b?.callback?.()??answer;},async prompt(){}};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
globalThis.foundry={applications:{api:{ApplicationV2:FakeApp,HandlebarsApplicationMixin:x=>x,DialogV2}},utils:{escapeHTML:esc,randomID:()=>Math.random().toString(36).slice(2,10)}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:(n,f)=>(on[n]??=[]).push(f),callAll:(n,...a)=>(on[n]??[]).forEach(f=>f(...a))};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(e)}};
globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);
const gm={id:'gm',isGM:true,name:'GM',active:true};
const nodes=Array.from({length:12},(_,i)=>({id:`NODE-TEST-SPOT-${i}`,name:`[TEST] Spot ${i}`,activity:i<6?'mining':'herbalism',professions:[],tierMin:1,tierMax:2,materials:{common:[],rare:[],exotic:[]}}));
const setPath=(o,k,v)=>{const p=k.split('.');while(p.length>1){const x=p.shift();o[x]??={};o=o[x];}o[p[0]]=v;};
const journal={name:'Profession Ledger (GM Data)',flags:{'ashen-gate-profession-ledger':{role:'gm-data',gatheringNodes:{nodes}}},getFlag(s,k){return this.flags?.[s]?.[k];},
  // Foundry runs the update hooks before the update's promise resolves.
  async update(u){for(const [k,v] of Object.entries(u))setPath(this,k,structuredClone(v));Hooks.callAll('updateJournalEntry',this,u);}};
let api=null;const mod={active:true,version:'0.26.2',get api(){return api},set api(v){api=v}};
globalThis.game={user:gm,users:{contents:[gm],get:()=>gm,activeGM:gm},items:{contents:[]},actors:{contents:[],get:()=>null},journal:[journal],socket:{emit(){},on(){}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?mod:undefined},settings:{register(){},registerMenu(){},get:(i,k)=>values[k],set:async(i,k,v)=>{values[k]=v;}}};
await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const app=api.open({view:'nodes'});
const settle=async()=>{await app._queue;await tick(120);await app._queue;};
const main=()=>app.element.querySelector('.agl-main');
const screen=()=>app.element.querySelector('.agl-node-editor')?'editor':app.element.querySelector('[data-action="node-new"]')?'list':'other';
const focused=()=>{const a=doc.activeElement;return a===doc.body?'BODY':`${a.tagName} ${a.dataset.action??''} ${a.dataset.id??''}`.trim();};
const click=async(selector)=>{const b=app.element.querySelector(selector);assert.ok(b,`no ${selector}`);b.focus();await app._click(b.dataset.action,b.dataset.id,b.dataset);};
const ID='NODE-TEST-SPOT-7';
async function openEditor(){
  await settle();
  main().scrollTop=71;
  await click(`[data-action="node-edit"][data-id="${ID}"]`);await settle();
  assert.equal(screen(),'editor');
  assert.equal(main().scrollTop,0,'the editor starts at its top');
  main().scrollTop=142;
}
const edit=()=>{const f=app.element.querySelector('[data-node-field="name"]');f.focus();f.value='[TEST] Renamed';f.dispatch('change');assert.ok(app.nodeGuard.dirty);};

test('All nodes over unsaved edits, Discard changes: back at the same list position, focus on that node\'s Edit',async()=>{
  await openEditor();edit();answer=true;
  await click('.agl-toolbar [data-action="node-cancel"]');await settle();
  assert.equal(screen(),'list');
  assert.equal(main().scrollTop,71,'the list scroll position comes back (not the editor\'s 142)');
  assert.equal(focused(),`BUTTON node-edit ${ID}`,'focus returns once the confirm has closed');
});

test('Footer Cancel over unsaved edits, Discard changes: same',async()=>{
  await openEditor();edit();answer=true;
  await click('footer [data-action="node-cancel"]');await settle();
  assert.equal(main().scrollTop,71);assert.equal(focused(),`BUTTON node-edit ${ID}`);
});

test('All nodes with nothing changed (no confirm): same',async()=>{
  await openEditor();
  await click('.agl-toolbar [data-action="node-cancel"]');await settle();
  assert.equal(main().scrollTop,71);assert.equal(focused(),`BUTTON node-edit ${ID}`);
});

test('Save Changes: the Journal update renders the window again, and the list still keeps its place and the focus',async()=>{
  await openEditor();edit();
  await click('[data-action="node-save"]');await settle();
  assert.equal(journal.flags['ashen-gate-profession-ledger'].gatheringNodes.nodes.find(n=>n.id===ID).name,'[TEST] Renamed','saved');
  assert.equal(screen(),'list');
  assert.equal(main().scrollTop,71);assert.equal(focused(),`BUTTON node-edit ${ID}`);
});

test('Overlapping renders: one started while the editor showed never takes the way back, and the editor\'s scroll never lands on the list',async()=>{
  await openEditor();
  // A live update (another GM client, an Actor change) starts a render of the editor ...
  const stale=await app._prepare();
  // ... the GM goes back to the list before that render has finished ...
  app.nodeGuard.markClean();app.nodeDraft=null;app._backToNodeList(ID);
  const fresh=await app._prepare();
  await app._finish(stale);
  assert.equal(screen(),'editor');
  await app._finish(fresh);await tick(120);
  assert.equal(screen(),'list');
  assert.equal(main().scrollTop,71);assert.equal(focused(),`BUTTON node-edit ${ID}`);
});

test('A re-render of the same screen keeps the focused control (and text typed but not saved)',async()=>{
  await settle();
  await click('[data-action="node-new"]');await settle();
  const f=app.element.querySelector('[data-node-field="name"]');f.focus();f.value='[TEST] Half typed';
  app.render();await settle();
  const again=app.element.querySelector('[data-node-field="name"]');
  assert.notEqual(again,f,'the field was replaced');
  assert.equal(doc.activeElement,again);assert.equal(again.value,'[TEST] Half typed');
  app.nodeGuard.markClean();app.nodeDraft=null;app._backToNodeList();app.render();await settle();
  assert.equal(focused(),'BUTTON node-new','New node gets the focus back');
  assert.deepEqual(errors,[]);
});
