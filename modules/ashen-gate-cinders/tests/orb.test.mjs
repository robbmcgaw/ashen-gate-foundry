import test from 'node:test';import assert from 'node:assert/strict';
// Cinder sheet (0.6.0): pure rules for the orb art, the Strain ring and the socket orbit. Proves logic, not the live Foundry UI.
import {cleanArt,artInput,orbArt,strainTone,ringModel,orbitModel,ART_FOLDER} from '../scripts/orb.mjs';
import {normalizeInstance} from '../scripts/cinder.mjs';

test('art fallback: the Cinder\'s own art, else the default orb; never the definition Item image',()=>{
  assert.deepEqual(orbArt({art:'ashen-gate/cinders/[TEST]-ember.webp',img:'icons/def.svg'}),{kind:'image',src:'ashen-gate/cinders/[TEST]-ember.webp'});
  assert.deepEqual(orbArt({img:'icons/def.svg'}),{kind:'default',src:null},'no art: default orb, not the Item image');
  assert.deepEqual(orbArt({art:'javascript:alert(1)'}),{kind:'default',src:null},'a bad saved value falls back');
  assert.deepEqual(orbArt(null),{kind:'default',src:null});
  assert.equal(ART_FOLDER,'ashen-gate/cinders/');
});
test('art paths: relative or http(s); anything that could run or break an attribute is refused; old records read as none',()=>{
  for(const ok of ['ashen-gate/cinders/a.webp','https://assets.forge-vtt.com/abc/ashen-gate/cinders/a b.png','http://x/y.png'])assert.equal(cleanArt(ok),ok);
  for(const bad of ['', '   ','javascript:alert(1)','data:image/png;base64,AA','file:///etc/x.png','a"b.png',"a'b.png",'<img>.png','a\\b.png','a\nb.png','x'.repeat(1025),7,null,{}])assert.equal(cleanArt(bad),null,String(bad).slice(0,20));
  assert.equal(artInput(null),null);assert.equal(artInput(''),null,'empty = back to the default orb');
  assert.throws(()=>artInput('javascript:x'),/Choose an image file/);
  assert.equal(normalizeInstance({instanceId:'cinst_AAAAAAAA',definitionId:'MUT-TEST-A'}).art,null);
  assert.equal(normalizeInstance({instanceId:'cinst_AAAAAAAA',definitionId:'MUT-TEST-A',art:'ashen-gate/cinders/a.png'}).art,'ashen-gate/cinders/a.png');
});
test('default orb tone follows Strain only: calm 0, warm, ember from half the guarantee point, hot at it',()=>{
  assert.deepEqual([0,1,4,5,9,10,14].map(v=>strainTone(v)),['calm','warm','warm','ember','ember','hot','hot']);
  assert.deepEqual([0,3,4,8].map(v=>strainTone(v,8)),['calm','warm','ember','hot']);
});
test('Strain ring: 10 segments filled to the value, then one pip per point over 10 (shown to players too)',()=>{
  let r=ringModel(6);assert.equal(r.segments.length,10);assert.deepEqual(r.segments.map(s=>s.on),[...Array(6).fill(true),...Array(4).fill(false)]);
  assert.deepEqual([r.over,r.pips.length,r.hot],[0,0,false]);
  r=ringModel(13);assert.ok(r.segments.every(s=>s.on));assert.deepEqual([r.over,r.pips.length,r.hot],[3,3,true]);
  assert.equal(new Set(ringModel(45).pips.map(p=>`${p.cx},${p.cy}`)).size,35,'every pip has its own place');
  assert.equal(ringModel(0).segments.filter(s=>s.on).length,0);
});
test('orbit: capacity positions in slot order, free sockets carry their slot, +1 past the base count, over-capacity items off the orbit',()=>{
  const host={base:3,capacity:4,slots:[{slot:0,itemId:'A',active:true},{slot:2,itemId:'B',active:true}]};
  let o=orbitModel(host);
  assert.deepEqual(o.positions.map(p=>[p.itemId,p.slot,p.empty,p.extra]),[['A',0,false,false],['B',2,false,false],[null,1,true,false],[null,3,true,true]]);
  assert.ok(o.positions.every(p=>p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100));
  o=orbitModel({base:2,capacity:2,slots:[{slot:0,itemId:'A',active:true},{slot:1,itemId:'B',active:true},{slot:2,itemId:'C',active:false}]});
  assert.deepEqual([o.positions.map(p=>p.itemId),o.inactive.map(x=>x.itemId)],[['A','B'],['C']]);
  assert.deepEqual(orbitModel({base:3,capacity:0,slots:[]}).positions,[]);
  assert.deepEqual(orbitModel(null).positions,[]);
});
