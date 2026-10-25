// Contrast for every skin, computed from the skin's own tokens and the kit's colour mixes (styles/ag-ui.css).
// Text 4.5:1; large text, control boundaries and the focus ring 3:1. High Contrast: text 7:1, borders 4.5:1.
// Proves the numbers, not how a skin looks in live Foundry. Set AG_SKIN_TABLE=1 to print every ratio.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppearanceController} from '../scripts/appearance.js';

const NEW_SKINS=['ag-blightgreen','ag-cinderlight','ag-hearthfire','ag-frostbound','ag-high-contrast','ag-daylight','ag-ledger-book','ag-field-journal','ag-frontier-map'];
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const lin=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const lum=c=>{const [r,g,b]=c.map(lin);return .2126*r+.7152*g+.0722*b;};
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
const mix=(a,b,p)=>a.map((v,i)=>v*p+b[i]*(1-p));   // p of a over b, like color-mix(in srgb, a p%, b)

function tokensOf(id){
  const v=new Map();
  createAppearanceController({currentUser:()=>({id:'u'}),getSetting:k=>k==='worldSkin'?id:'',setSetting:async()=>{},subscribeSettings:()=>()=>{}})
    .applyTo({style:{setProperty:(k,x)=>v.set(k,x)},dataset:{}});
  const c=k=>rgb(v.get(k));
  return {c,id};
}

/** Every [label, foreground, background, minimum] the kit paints with this skin's tokens. */
function pairsOf(id){
  const {c}=tokensOf(id);
  const hc=id==='ag-high-contrast';
  const text=hc?7:4.5, edge=hc?4.5:3;
  const out=[];
  const surfaces=['--ag-surface','--ag-surface-sunken','--ag-surface-raised'];
  for(const bg of surfaces){
    for(const fg of ['--ag-text','--ag-muted','--ag-accent','--ag-danger','--ag-ok','--ag-warn'])out.push([`${fg} on ${bg}`,c(fg),c(bg),text]);
    out.push([`--ag-focus ring on ${bg}`,c('--ag-focus'),c(bg),3]);
    out.push([`--ag-border (control boundary) on ${bg}`,c('--ag-border'),c(bg),edge]);
  }
  const raised=c('--ag-surface-raised'),textc=c('--ag-text');
  const ink=t=>mix(c(`--ag-${t}`),textc,.8);            // --ag-<tone>-ink
  const soft=t=>mix(c(`--ag-${t}`),raised,.16);         // --ag-<tone>-soft, badge and danger-button fill
  for(const t of ['accent','ok','warn','danger']){
    out.push([`--ag-${t}-ink on ${t} soft fill (badge)`,ink(t),soft(t),text]);
    out.push([`--ag-${t} on ${t} soft fill (icon chip, tinted button)`,c(`--ag-${t}`),soft(t),t==='accent'||hc?text:4.5]);
  }
  const mutedStrong=mix(c('--ag-muted'),textc,.7);
  for(const [name,bg] of [['selected row',soft('accent')],['hover row',mix(textc,raised,.07)],['striped row',mix(textc,c('--ag-surface'),.05)]])
    out.push([`--ag-muted-strong on ${name}`,mutedStrong,bg,text]);
  out.push(['--ag-accent-contrast on accent (primary button)',c('--ag-accent-contrast'),c('--ag-accent'),text]);
  out.push(['--ag-accent-contrast on accent hover',c('--ag-accent-contrast'),mix(textc,c('--ag-accent'),.14),text]);
  out.push(['--ag-surface on danger (hovered danger button)',c('--ag-surface'),c('--ag-danger'),text]);
  out.push(['--ag-danger-ink on danger button fill',ink('danger'),soft('danger'),text]);
  // Background textures are faint: text must still read on the surface lightened/darkened by up to 10% of the ink.
  for(const fg of ['--ag-text','--ag-muted'])out.push([`${fg} on surface under a 10% line`,c(fg),mix(textc,c('--ag-surface'),.10),text===7?7:4.5]);
  return out;
}

const ids=new Set(createAppearanceController({currentUser:()=>({id:'u'}),getSetting:()=>'',setSetting:async()=>{},subscribeSettings:()=>()=>{}}).listSkins().map(s=>s.id));
test('every new skin is registered',()=>{for(const id of NEW_SKINS)assert.ok(ids.has(id),id);assert.equal(ids.size,5+2+NEW_SKINS.length+3);});

for(const id of NEW_SKINS){
  test(`${id}: all token pairings meet their contrast floor`,()=>{
    const bad=[];
    for(const [label,fg,bg,min] of pairsOf(id)){
      const r=ratio(fg,bg);
      if(process.env.AG_SKIN_TABLE)console.log(`${id}\t${label}\t${r.toFixed(2)}\t(>=${min})`);
      if(r<min)bad.push(`${label}: ${r.toFixed(2)} < ${min}`);
    }
    assert.deepEqual(bad,[]);
  });
}
test('High Contrast is pure black and white with a yellow focus ring',()=>{
  const {c}=tokensOf('ag-high-contrast');
  assert.deepEqual(c('--ag-surface'),[0,0,0]);assert.deepEqual(c('--ag-text'),[255,255,255]);
  const [r,g,b]=c('--ag-focus');assert.ok(r>=240&&g>=200&&b<=60,'yellow');
});
test('light skins are light and dark skins are dark',()=>{
  const light=['ag-daylight','ag-ledger-book','ag-frontier-map'];
  for(const id of NEW_SKINS){const {c}=tokensOf(id);assert.equal(lum(c('--ag-surface'))>.3,light.includes(id),id);}
});
