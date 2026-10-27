import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
// 0.37.0: the recipe tree in a real browser DOM (headless Chromium): the search opens and counts what matches, clearing restores the remembered state,
// the tier header is a keyboard-operable button, and ~100 recipes fit at phone and desktop width. Skipped where Playwright is not installed.
const here=path.dirname(fileURLToPath(import.meta.url));
let chromium=null;
for(const base of ['/opt/node-tools/node_modules/x.js',import.meta.url]){try{chromium=createRequire(base)('playwright').chromium;break;}catch{}}
const {buildTree,treeHtml}=await import(pathToFileURL(path.resolve(here,'../scripts/catalog-tree.mjs')));
const treeSource=fs.readFileSync(path.resolve(here,'../scripts/catalog-tree.mjs'),'utf8').split('\n').filter(l=>!/^import /.test(l)).join('\n').replace(/export /g,'');
const css=['ag-ui.css','ledger.css'].map(f=>fs.readFileSync(path.resolve(here,'../styles',f),'utf8')).join('\n');
const PROFS=['Alchemy','Cooking','Herbalism','Mining'],TIERS=['apprentice','journeyman','expert','artisan','master',null];
const rows=Array.from({length:104},(_,i)=>{const g=PROFS[i%4],tier=TIERS[Math.floor(i/4)%6],name=`[TEST] ${g} recipe number ${i}${i%13===0?' with a long and wordy name to test wrapping at phone width':''}`;
  return {group:g,recipe:{name,tier},html:`<article class="ag-card agl-recipe-row" data-recipe-search="${name.toLowerCase()}"><strong>${name}</strong></article>`};});
const page=w=>`<!doctype html><meta charset=utf-8><style>${css}</style><body style="margin:0"><div class="ag-app agl-app" style="width:${w}px"><div class="agl-main" style="padding:12px;overflow:visible">${treeHtml(buildTree(rows),{isOpen:(k,d)=>k==='p:alchemy'?true:d})}</div></div>`;

test('real DOM: search opens and counts what matches; clearing restores what was remembered',{skip:!chromium&&'Playwright is not installed here'},async()=>{
  const browser=await chromium.launch();
  try{
    const p=await browser.newPage({viewport:{width:980,height:900}});await p.setContent(page(980));
    const out=await p.evaluate(source=>{
      const {applyTreeSearch}=new Function(`${source};return {applyTreeSearch};`)();
      const search=q=>{const query=q.toLowerCase();for(const r of document.querySelectorAll('[data-recipe-search]'))r.hidden=Boolean(query)&&!r.dataset.recipeSearch.includes(query);
        for(const f of document.querySelectorAll('[data-folder]'))applyTreeSearch(f,query);};
      const state=()=>[...document.querySelectorAll('[data-folder]')].map(f=>({k:f.dataset.folder,open:f.open,hidden:f.hidden,count:f.querySelector('[data-folder-count]').textContent,
        tiers:[...f.querySelectorAll('[data-tier-group]')].map(g=>({k:g.dataset.tierGroup,hidden:g.hidden,exp:g.querySelector('button').getAttribute('aria-expanded'),panelHidden:g.querySelector('.agl-tier-body').hidden,n:g.querySelector('[data-tier-count]').textContent}))}));
      const before=state();search('mining recipe number 3');const during=state();search('');const after=state();
      return {before,during,after};
    },treeSource);
    const f=(s,k)=>s.find(x=>x.k===k);
    assert.equal(f(out.before,'alchemy').open,true);assert.equal(f(out.before,'mining').open,false,'professions start shut unless remembered open');
    // A query that matches Mining recipes only: Mining opens, the others are hidden, counts say "n of total".
    assert.equal(f(out.during,'mining').open,true);assert.equal(f(out.during,'mining').hidden,false);
    for(const k of ['alchemy','cooking','herbalism'])assert.equal(f(out.during,k).hidden,true,`${k} has no match`);
    assert.match(f(out.during,'mining').count,/^\d+ of 26$/);
    const mt=f(out.during,'mining').tiers;assert.ok(mt.some(t=>t.hidden),'tiers with no match are hidden');assert.ok(mt.filter(t=>!t.hidden).every(t=>t.exp==='true'&&!t.panelHidden&&/^\d+ of \d+$/.test(t.n)),'matching tiers are open with match counts');
    // Clearing the search puts back the remembered state and the plain counts.
    assert.deepEqual(out.after,out.before);
  }finally{await browser.close();}
});

test('real DOM: the tier header is a focusable button in the tab order (Enter and Space activate a native button)',{skip:!chromium&&'Playwright is not installed here'},async()=>{
  const browser=await chromium.launch();
  try{
    const p=await browser.newPage({viewport:{width:980,height:900}});await p.setContent(page(980));
    await p.evaluate(()=>{document.addEventListener('click',e=>{const b=e.target.closest('[data-action="tier-toggle"]');if(b)window.__clicked=(window.__clicked??0)+1;});});
    await p.focus('[data-folder="alchemy"] summary');
    await p.keyboard.press('Tab');
    const focused=await p.evaluate(()=>({tag:document.activeElement.tagName,action:document.activeElement.dataset.action,label:document.activeElement.textContent.trim().replace(/\s+/g,' ')}));
    assert.deepEqual([focused.tag,focused.action],['BUTTON','tier-toggle']);assert.match(focused.label,/^Apprentice \d+$/,'text label and count');
    await p.keyboard.press('Enter');await p.keyboard.press('Space');
    assert.equal(await p.evaluate(()=>window.__clicked),2,'Enter and Space both click it');
  }finally{await browser.close();}
});

for(const width of [360,980])
  test(`real DOM: about 100 recipes at ${width}px: no horizontal scroll; headers and counts stay on screen`,{skip:!chromium&&'Playwright is not installed here'},async()=>{
    const browser=await chromium.launch();
    try{
      const p=await browser.newPage({viewport:{width,height:900}});await p.setContent(page(width));
      const r=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
        heads:[...document.querySelectorAll('.agl-tier-toggle')].every(b=>b.getBoundingClientRect().right<=document.documentElement.clientWidth+1),
        folders:document.querySelectorAll('[data-folder]').length,groups:document.querySelectorAll('[data-tier-group]').length,rows:document.querySelectorAll('[data-recipe-search]').length}));
      assert.equal(r.overflow,false);assert.equal(r.heads,true);assert.equal(r.folders,4);assert.equal(r.groups,24);assert.equal(r.rows,104);
    }finally{await browser.close();}
  });
