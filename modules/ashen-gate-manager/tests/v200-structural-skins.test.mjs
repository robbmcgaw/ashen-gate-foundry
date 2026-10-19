// Structural skins (Stone Tablet, Tome Pages): registry, fallback, stylesheet injection and CSS scoping.
// Proves controller logic and CSS text with a mocked document, not live Foundry rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createAppearanceController,skinStylesheet,syncSkinStylesheet,SKIN_STYLESHEET_ID} from '../scripts/appearance.js';

const STRUCTURAL=['ag-stone-tablet','ag-tome-pages'];
const controller=world=>createAppearanceController({currentUser:()=>({id:'u'}),getSetting:k=>k==='worldSkin'?world:'',setSetting:async()=>{},subscribeSettings:()=>()=>{}});
const tokensOf=id=>{const v=new Map();controller(id).applyTo({style:{setProperty:(k,x)=>v.set(k,x)},dataset:{}});return v;};

function fakeDocument(){
  const nodes=new Map();const head={children:[],appendChild(n){this.children.push(n);n.parent=this;if(n.id)nodes.set(n.id,n);return n;}};
  return {head,getElementById:id=>nodes.get(id)??null,
    createElement:tag=>{const attrs=new Map();const n={tagName:tag,dataset:{},rel:'',
      get id(){return this._id;},set id(v){this._id=v;},
      setAttribute(k,v){attrs.set(k,v);},getAttribute:k=>attrs.get(k)??null,
      remove(){head.children=head.children.filter(c=>c!==n);nodes.delete(n.id);}};return n;}};
}

test('picker lists both structural skins with descriptions; colour skins stay colour-only',()=>{
  const skins=controller('ag-default').listSkins();
  for(const id of STRUCTURAL){
    const s=skins.find(x=>x.id===id);
    assert.ok(s,id);assert.equal(s.structural,true);assert.match(s.description,/\w{8,}/);
    assert.equal('stylesheet' in s,false,'stylesheet path stays internal');
  }
  assert.deepEqual(skins.filter(s=>!s.structural).map(s=>s.id),['ag-default','ag-slate','ag-ember','ag-verdigris','ag-parchment']);
});
test('structural skins are selectable as world default and user override; unknown ids still fall back',async()=>{
  const world=new Map([['worldSkin','ag-default']]),mine=new Map();
  const gm=createAppearanceController({currentUser:()=>({id:'gm',isGM:true}),getSetting:k=>k==='worldSkin'?world.get(k):mine.get(k)??'',
    setSetting:async(k,v)=>{(k==='worldSkin'?world:mine).set(k,v);},subscribeSettings:()=>()=>{}});
  await gm.setWorldDefault('ag-tome-pages');assert.equal(gm.getState().effective,'ag-tome-pages');
  await gm.setUserOverride('ag-stone-tablet');assert.equal(gm.getState().effective,'ag-stone-tablet');
  const root={style:{setProperty(){}},dataset:{}};
  assert.equal(controller('ag-removed-tablet').applyTo(root).effective,'ag-default');assert.equal(root.dataset.agSkin,'ag-default');
});
test('stylesheet path is only known for structural skins and the files ship in the module',()=>{
  for(const id of STRUCTURAL){
    const file=skinStylesheet(id);assert.match(file,/^styles\/skins\/[a-z-]+\.css$/);
    assert.ok(existsSync(new URL(`../${file}`,import.meta.url)),file);
  }
  for(const id of ['ag-default','ag-parchment','nope','__proto__',undefined])assert.equal(skinStylesheet(id),null);
  const manifest=JSON.parse(readFileSync(new URL('../module.json',import.meta.url),'utf8'));
  assert.equal(manifest.styles.some(s=>s.includes('skins/')),false,'skin CSS is injected while active, not always loaded');
});
test('one link element follows the effective skin and is removed for colour skins',()=>{
  const doc=fakeDocument(),opts={basePath:'/modules/ashen-gate-manager',version:'0.20.0'};
  assert.equal(syncSkinStylesheet(doc,'ag-default',opts),null);assert.equal(doc.head.children.length,0);
  syncSkinStylesheet(doc,'ag-stone-tablet',opts);
  const link=doc.getElementById(SKIN_STYLESHEET_ID);
  assert.equal(link.rel,'stylesheet');assert.equal(link.getAttribute('href'),'/modules/ashen-gate-manager/styles/skins/stone-tablet.css?v=0.20.0');
  syncSkinStylesheet(doc,'ag-tome-pages',opts);
  assert.equal(doc.head.children.length,1);assert.equal(doc.getElementById(SKIN_STYLESHEET_ID),link);
  assert.match(link.getAttribute('href'),/tome-pages\.css/);assert.equal(link.dataset.agSkin,'ag-tome-pages');
  syncSkinStylesheet(doc,'ag-slate',opts);assert.equal(doc.head.children.length,0);
  syncSkinStylesheet(doc,'unknown',opts);assert.equal(doc.head.children.length,0);
  assert.equal(syncSkinStylesheet(null,'ag-tome-pages',opts),null,'no document: no-op');
});
test('Manager syncs the skin stylesheet from the document skin each time it applies appearance',()=>{
  const main=readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
  assert.match(main,/applyTo\(document\.documentElement\);\s*syncSkinStylesheet\(document,document\.documentElement\.dataset\.agSkin/);
});

const ruleSelectors=css=>{
  const out=[];let depth=0,buf='';
  for(const ch of css.replace(/\/\*[\s\S]*?\*\//g,'')){
    if(ch==='{'){if(depth===0)out.push(buf.trim());depth++;buf='';}
    else if(ch==='}'){depth--;buf='';}
    else if(depth===0)buf+=ch;
  }
  return out;
};
for(const id of STRUCTURAL){
  const css=readFileSync(new URL(`../${skinStylesheet(id)}`,import.meta.url),'utf8');
  test(`${id}: every selector is scoped to html[data-ag-skin="${id}"]`,()=>{
    const sels=ruleSelectors(css);assert.ok(sels.length>20);
    for(const list of sels){
      assert.ok(!list.startsWith('@'),`no at-rules: ${list}`);
      for(const sel of list.split(/,(?![^(]*\))/))assert.ok(sel.trim().startsWith(`html[data-ag-skin="${id}"]`)||sel.trim().startsWith(`:where(html[data-ag-skin="${id}"])`),sel);
    }
  });
  test(`${id}: no web fonts, remote assets, imports or animation`,()=>{
    assert.doesNotMatch(css,/@font-face|@import|@keyframes|animation\s*:/);
    for(const [,u] of css.matchAll(/url\(\s*["']?([^"')]{0,20})/g))
      assert.ok(u.startsWith('data:image/svg+xml')||u.startsWith('%23'),`only inline SVG: ${u}`);
  });
}

// WCAG relative luminance on the flat token colours.
const lum=hex=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
for(const id of STRUCTURAL){
  test(`${id}: token pairs meet WCAG AA (text 4.5:1, focus ring 3:1)`,()=>{
    const t=tokensOf(id);
    for(const bg of ['--ag-surface','--ag-surface-sunken','--ag-surface-raised']){
      for(const fg of ['--ag-text','--ag-muted','--ag-danger','--ag-ok','--ag-warn'])assert.ok(ratio(t.get(fg),t.get(bg))>=4.5,`${fg} on ${bg}`);
      assert.ok(ratio(t.get('--ag-focus'),t.get(bg))>=3,`focus on ${bg}`);
    }
    assert.ok(ratio(t.get('--ag-accent-contrast'),t.get('--ag-accent'))>=4.5,'text on accent');
  });
}
