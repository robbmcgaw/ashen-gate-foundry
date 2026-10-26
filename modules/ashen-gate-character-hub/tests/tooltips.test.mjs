/** 0.15.0 item tooltips: dnd5e's own rich tooltip markup on every item element, plain title fallback (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {tooltipAttrs, loadingSection, richTooltipsAvailable} from '../scripts/tooltips.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import * as c from '../scripts/companions.mjs';
import * as hb from '../scripts/hotbar.mjs';

const ITEMS = [
  {id: 'ss', name: '[TEST] Shortsword', type: 'weapon', system: {equipped: true, mastery: 'vex', masteryOptions: [{value: 'vex', label: 'Vex'}], activities: [{activation: {type: 'action'}}]}},
  {id: 'ring', name: '[TEST] Ring', type: 'equipment', system: {equipped: true, type: {value: 'ring'}}},
  {id: 'odd', name: '[TEST] Odd Stone', type: 'equipment', system: {equipped: true, type: {value: 'wondrous'}}},
  {id: 'hm', name: "[TEST] Hunter's Mark", type: 'spell', system: {identifier: 'hunters-mark', level: 1}},
  {id: 'fighter', name: '[TEST] Fighter', type: 'class', system: {levels: 3}},
  {id: 'cat', name: '[TEST] Cat', type: 'loot'},
  {id: 'hat', name: '[TEST] Tiny Hat', type: 'equipment', flags: {'ashen-gate-character-hub': {companion: {role: 'pet-clothing'}}}},
  {id: 'surge', name: '[TEST] Action Surge', type: 'feat', system: {type: {value: 'class'}}}
];
/** dnd5e's tooltips running (game.dnd5e.tooltips) with its loadingTooltip helper. */
function withDnd5e(user = users.owner, settings = {petCap: 1}) {
  installGlobals({user, settings});
  game.dnd5e = {tooltips: {}};
  globalThis.dnd5e = {utils: {loadingTooltip: ({uuid}) => `<section class="loading" data-uuid="${uuid}"><i class="fas fa-spinner fa-spin-pulse" inert></i></section>`}};
}
const render = async (tab, actor) => { const s = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); s.tab = tab; return s._renderHTML(); };
const tip = uuid => `data-tooltip-html="&lt;section class=&quot;loading&quot; data-uuid=&quot;${uuid.replace(/\./g, '\\.')}&quot;&gt;`;

test('dnd5e\'s loading section with the item UUID, its tooltip classes, and no duplicate browser title', () => {
  withDnd5e();
  assert.equal(richTooltipsAvailable(), true);
  const a = tooltipAttrs('Actor.a.Item.b', 'Open b');
  assert.match(a, /^ data-tooltip-html="&lt;section class=&quot;loading&quot; data-uuid=&quot;Actor\.a\.Item\.b&quot;&gt;/);
  assert.match(a, /data-tooltip-class="dnd5e2 dnd5e-tooltip item-tooltip" data-tooltip-direction="LEFT"$/);
  assert.doesNotMatch(a, /title=/);
  delete globalThis.dnd5e;
  assert.equal(loadingSection('x"y'), '<section class="loading" data-uuid="x&quot;y"><i class="fa-solid fa-spinner fa-spin-pulse" inert></i></section>', 'same markup without the helper, escaped');
  installGlobals();
  assert.equal(richTooltipsAvailable(), false);
  assert.equal(tooltipAttrs('Actor.a.Item.b', 'Open b'), ' data-tooltip="Open b"', 'a Foundry tooltip when dnd5e tooltips are not running');
  assert.equal(tooltipAttrs(null, 'Macro'), ' data-tooltip="Macro"');
});

test('every item element in the Hub gets the rich tooltip: list rows, slots, Other equipped, identity card, quick bar, mastery buttons', async () => {
  withDnd5e();
  const actor = makeActor({items: ITEMS});
  await hb.setHotbarSlot(actor, 0, actor.items.get('hm'));
  game.settings.store.showItemDescriptions = true;   // 0.53.0: the long rows; the compact rows are checked below
  let html = await render('combat', actor);
  assert.match(html, new RegExp(`class="agch-item__name" data-action="item-sheet" data-id="ss" data-ag-always ${tip('Actor.actor1.Item.ss')}`), 'Combat row');
  assert.match(html, new RegExp(`data-action="slot-open" data-slot="mainhand" data-id="ss"[^>]*${tip('Actor.actor1.Item.ss')}`), 'paper doll slot');
  assert.match(html, new RegExp(`class="agch-other__name" data-action="slot-open" data-id="odd" data-ag-always ${tip('Actor.actor1.Item.odd')}`), 'Other equipped');
  assert.match(html, new RegExp(`class="agch-idlink agch-idlink--class" data-action="item-sheet" data-id="fighter" data-ag-always aria-label="[^"]+" ${tip('Actor.actor1.Item.fighter')}`), 'identity line in the header (0.37.0)');
  assert.match(html, new RegExp(`data-action="hotbar-use" data-hotbar-slot="0" ${tip('Actor.actor1.Item.hm')}`), 'quick bar');
  assert.match(html, new RegExp(`data-action="mark-apply" data-mark="vex" ${tip('Actor.actor1.Item.ss')}`), 'mastery button shows its weapon');
  for (const t of ['inventory', 'features']) {
    html = await render(t, actor);
    assert.match(html, /class="agch-item__name" data-action="item-sheet" data-id="\w+" data-ag-always data-tooltip-html=/, t);
  }
  // 0.53.0: compact item rows: the name expands the description; hovering it still shows dnd5e's hover card.
  delete game.settings.store.showItemDescriptions;
  for (const t of ['combat', 'inventory', 'features']) {
    html = await render(t, actor);
    assert.match(html, /class="agch-item__name agch-crow__name" data-action="item-expand" data-id="\w+" data-key="[^"]+" data-ag-always aria-expanded="false" aria-controls="[^"]+" tabindex="-1" data-tooltip-html=/, `${t} compact`);
  }
  // 0.51.0: a compact spell row's name expands the description; hovering it still shows dnd5e's hover card.
  html = await render('magic', actor);
  assert.match(html, /class="agch-item__name agch-spell__name" data-action="spell-expand" data-id="\w+" data-key="[^"]+" data-ag-always aria-expanded="false" aria-controls="[^"]+" tabindex="-1" data-tooltip-html=/, 'magic');
});

test('companion gear and pet clothing get it too; observers get the same dnd5e tooltip (dnd5e decides what they see)', async () => {
  withDnd5e();
  const actor = makeActor({items: ITEMS});
  await c.addActorCompanion(actor, {documentName: 'Actor', id: 'cat1', uuid: 'Actor.cat1', name: '[TEST] Cat', testUserPermission: () => true}, 'pet');
  await c.socketGear(actor, 'pet', 'head', 'hat');
  game.settings.store.showItemDescriptions = true;
  let html = await render('companions', actor);
  assert.match(html, new RegExp(`data-action="item-sheet" data-id="hat" data-ag-always ${tip('Actor.actor1.Item.hat')}`), 'pet clothing slot');
  withDnd5e(users.observer, {petCap: 1, showItemDescriptions: true});
  html = await render('combat', actor);
  assert.match(html, new RegExp(`data-id="ss" data-ag-always ${tip('Actor.actor1.Item.ss')}`));
  assert.doesNotMatch(html, /data-tooltip-html="[^"]*(price|gm)/i, 'the Hub adds no data of its own to the tooltip');
});
