// 0.24.0: item tooltips and click-to-open (scripts/item-tips.mjs): dnd5e's loading tooltip for a real Item, registered
// shop data built into a temporary (never created) Item on hover, one delegated listener per client.
// Mocked Foundry globals: proves the logic and the markup, not the live Foundry tooltip, dnd5e's richTooltip or sheets.
import test from 'node:test';
import assert from 'node:assert/strict';

const tips=await import('../scripts/item-tips.mjs');
test('item tips: a real Item gets dnd5e\'s loading tooltip (or a plain one without dnd5e); shop data is registered for hover and click',async()=>{
 globalThis.game={dnd5e:{tooltips:{}}};
 const a=tips.uuidTipAttrs('Actor.k.Item.i1','Open Rope');
 assert.match(a,/data-tooltip-html="&lt;section class=&quot;loading&quot; data-uuid=&quot;Actor\.k\.Item\.i1&quot;&gt;/);assert.match(a,/data-tooltip-class="dnd5e2 dnd5e-tooltip item-tooltip"/);
 assert.match(a,/data-agu-item-uuid="Actor\.k\.Item\.i1"/);assert.doesNotMatch(a,/ data-tooltip="/);
 globalThis.game={};
 assert.equal(tips.uuidTipAttrs('Actor.k.Item.i1','Open Rope'),' data-tooltip="Open Rope" data-agu-item-uuid="Actor.k.Item.i1"');
 const d=tips.dataTipAttrs('SHOP-A:l1',{name:'Rope',type:'loot',system:{}},'Open Rope');
 assert.equal(d,' data-agu-item-tip="SHOP-A:l1" data-tooltip="Open Rope"');assert.equal(tips.registeredTip('SHOP-A:l1').name,'Rope');
 tips.dataTipAttrs('SHOP-A:l1',{name:'Rope v2'});assert.equal(tips.registeredTip('SHOP-A:l1').name,'Rope v2','a re-render replaces the entry');
 const b=tips.itemButton({key:'SHOP-A:l2',data:{name:'Torch'},name:'Torch <lit>',cls:'agu-item-link x'});
 assert.match(b,/^<button type="button" class="agu-item-link x" data-agu-item-open data-agu-item-tip="SHOP-A:l2" data-tooltip="Open Torch &lt;lit&gt;" aria-label="Open Torch &lt;lit&gt;">Torch &lt;lit&gt;<\/button>$/);
});
test('item tips: the temporary Item is never created in the world, readable by the viewer, built without flags; richTooltip fills the tooltip',async()=>{
 const made=[];
 class Item{constructor(data){this.data=data;made.push(data);this.sheet={constructor:Sheet};}async richTooltip(){return {content:`<section>${this.data.name}</section>`,classes:['item-tooltip','extra']};}static create(){throw Error('never created');}}
 const opened=[];class Sheet{constructor(o){this.o=o;}async render(o){opened.push([this.o.document.data.name,this.o.editable,o.force]);}}
 globalThis.CONFIG={Item:{documentClass:Item}};globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};globalThis.foundry={utils:{randomID:()=>'tmp0000000000001'}};
 const it=tips.temporaryItem({_id:'orig',name:'Rope',type:'loot',flags:{gm:1},effects:[{}],folder:'f',ownership:{default:0},system:{}});
 assert.deepEqual(made[0],{name:'Rope',type:'loot',system:{},_id:'tmp0000000000001',ownership:{default:2}});assert.ok(it instanceof Item);
 assert.deepEqual(await tips.richTooltipOf({name:'Rope',type:'loot',system:{}}),{content:'<section>Rope</section>',classes:['item-tooltip','extra']});
 await tips.openDataItem({name:'Rope',type:'loot',system:{}});assert.deepEqual(opened,[['Rope',false,true]],'opened read only');
 delete globalThis.CONFIG;
 assert.equal(await tips.richTooltipOf({name:'Rope'}),null,'no dnd5e: the plain tooltip stays');
});
test('item tips: one delegated listener per client; hover builds the rich tooltip, click opens the item (data or uuid)',async()=>{
 const listeners={};const root={addEventListener:(k,fn)=>{listeners[k]=fn;}};
 class Item{constructor(d){this.d=d;this.sheet={constructor:class{constructor(o){this.o=o;}async render(){openedData.push(o=>o);openedData.push(this.o.document.d.name);}}};}async richTooltip(){return {content:'<b>Rich</b>',classes:['c1']};}}
 const openedData=[];globalThis.CONFIG={Item:{documentClass:Item}};
 const activated=[];globalThis.game={tooltip:{activate:el=>activated.push(el),deactivate:()=>{}}};
 const opened=[];globalThis.fromUuid=async u=>({sheet:{render:()=>opened.push(u)}});
 assert.equal(tips.installItemTips(root),true);assert.equal(tips.installItemTips(root),false,'installed once');
 tips.dataTipAttrs('SHOP-B:l1',{name:'Lantern',type:'loot',system:{}});
 const el={dataset:{aguItemTip:'SHOP-B:l1',tooltip:'Open Lantern'},matches:()=>true,closest:()=>el,tagName:'BUTTON'};
 listeners.pointerover({target:el});await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));
 assert.equal(el.dataset.tooltipHtml,'<b>Rich</b>');assert.match(el.dataset.tooltipClass,/dnd5e2 dnd5e-tooltip item-tooltip c1/);assert.equal('tooltip' in el.dataset,false);assert.deepEqual(activated,[el]);
 const click=(target)=>listeners.click({target,preventDefault:()=>{}});
 click({closest:()=>({dataset:{aguItemTip:'SHOP-B:l1'}})});await new Promise(r=>setTimeout(r,0));
 assert.ok(openedData.includes('Lantern'),'the shop data opens as a temporary Item');
 click({closest:()=>({dataset:{aguItemUuid:'Actor.k.Item.i9'}})});await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(opened,['Actor.k.Item.i9'],'a real Item opens its own sheet');
 delete globalThis.CONFIG;delete globalThis.fromUuid;
});

