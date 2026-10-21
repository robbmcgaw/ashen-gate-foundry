/** 0.18.1: electrum follows Utilities' "Use electrum" (api.currency, feature-detected); never hides money (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {electrumEnabled, electrumHidden, panelState, PANELS} from '../scripts/partners.mjs';
import {setCurrency} from '../scripts/item-actions.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';

const CURRENCIES = {pp: {label: 'Platinum', abbreviation: 'pp'}, gp: {label: 'Gold', abbreviation: 'gp'}, ep: {label: 'Electrum', abbreviation: 'ep'}, sp: {label: 'Silver', abbreviation: 'sp'}, cp: {label: 'Copper', abbreviation: 'cp'}};
/** Utilities 0.13.2-style API with the electrum switch; `null` = no currency API (older Utilities). */
function world({electrum = false, api = true, utilities = true, user = users.owner, purse = {pp: 0, gp: 42, ep: 0, sp: 5, cp: 0}} = {}) {
  const mods = utilities ? {'ashen-gate-utilities': {active: true, api: {
    ...(api ? {currency: {contract: 'ag-utilities-currency/1', electrumEnabled: () => electrum, coins: () => electrum ? ['cp', 'sp', 'ep', 'gp', 'pp'] : ['cp', 'sp', 'gp', 'pp']}} : {}),
    purse: {totals: () => purse}}}} : {};
  installGlobals({user, modules: mods});
  CONFIG.DND5E.currencies = CURRENCIES;
}
const inventory = async (ep = 0) => {
  const actor = makeActor({system: {currency: {pp: 0, gp: 15, ep, sp: 3, cp: 7}}});
  const s = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); s.tab = 'inventory';
  const html = await s._renderHTML();
  return {actor, html: html.slice(html.indexOf('class="agch-body"'))};
};

test('feature detection: Utilities\' switch when present; missing Utilities or an older one keeps today\'s behaviour', () => {
  world({electrum: false}); assert.equal(electrumEnabled(), false); assert.equal(electrumHidden(), true);
  world({electrum: true}); assert.equal(electrumEnabled(), true); assert.equal(electrumHidden(), false);
  world({api: false}); assert.equal(electrumEnabled(), null, 'older Utilities without api.currency'); assert.equal(electrumHidden(), false);
  world({utilities: false}); assert.equal(electrumEnabled(), null); assert.equal(electrumHidden(), false);
});

test('Inventory coin strip: no ep box while electrum is off; ep left over shows dimmed with a note; on or no Utilities shows it', async () => {
  world({electrum: false});
  let {html} = await inventory(0);
  assert.doesNotMatch(html, /data-key="ep"/); assert.match(html, /data-key="pp"[\s\S]*data-key="gp"[\s\S]*data-key="sp"[\s\S]*data-key="cp"/);
  assert.doesNotMatch(html, /agch-ep-off/);
  ({html} = await inventory(4));
  assert.match(html, /<label class="agch-coin is-off" title="Electrum is off in Utilities[^"]*"><span>ep<\/span><input type="number" min="0" step="1" max="4" data-edit="currency" data-key="ep" value="4"/, 'never hides money');
  assert.match(html, /agch-ep-off">Electrum is off in Utilities: it only shows because this character still has some/);
  assert.doesNotMatch(html, /convert-electrum|data-action="[^"]*convert/, 'no convert action in the Hub (GM-only in Utilities)');
  world({electrum: true}); ({html} = await inventory(0));
  assert.match(html, /<label class="agch-coin"><span>ep<\/span>/);
  world({utilities: false}); ({html} = await inventory(0));
  assert.match(html, /data-key="ep"/, 'without Utilities: as before');
});

test('the action layer follows it too: while off, electrum can go down, never up', async () => {
  world({electrum: false});
  const actor = makeActor({system: {currency: {pp: 0, gp: 1, ep: 4, sp: 0, cp: 0}}});
  assert.match((await setCurrency(actor, 'ep', 5)).error, /Electrum is off/);
  assert.equal((await setCurrency(actor, 'ep', 2)).ok, true);
  assert.deepEqual(actor.calls.at(-1), ['update', {'system.currency.ep': 2}]);
  assert.equal((await setCurrency(actor, 'gp', 50)).ok, true, 'other coins unaffected');
  world({electrum: true});
  assert.equal((await setCurrency(actor, 'ep', 9)).ok, true);
  world({utilities: false});
  assert.equal((await setCurrency(actor, 'ep', 12)).ok, true, 'without Utilities: as before');
});

test('party purse summary (when Utilities has no stash view): ep left out while off; leftover ep noted, not hidden', () => {
  const panel = PANELS.find(p => p.id === 'ashen-gate-utilities'), actor = makeActor();
  world({electrum: false, purse: {pp: 1, gp: 42, ep: 0, sp: 5, cp: 0}});
  let html = panelState(panel, actor).html;
  assert.match(html, /Party purse: 1 pp, 42 gp, 5 sp/); assert.doesNotMatch(html, /ep/);
  world({electrum: false, purse: {pp: 0, gp: 42, ep: 6, sp: 0, cp: 0}});
  html = panelState(panel, actor).html;
  assert.match(html, /Party purse: 42 gp<\/p><p class="agch-muted agch-ep-off">Also 6 ep \(electrum is off in Utilities; the GM can convert it there\)/);
  world({electrum: true, purse: {pp: 0, gp: 42, ep: 6, sp: 0, cp: 0}});
  assert.match(panelState(panel, actor).html, /Party purse: 42 gp, 6 ep/);
});
