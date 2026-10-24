/**
 * 0.46.0 integration of the popped-out windows (0.44.4), Add… (0.45.0) and the header buttons (0.46.0): Level up from its
 * header button, the Add menus, dnd5e's compendium browser and the advancement window all open in a popped-out Hub's
 * window. Mocked Foundry: this proves the routing, not the live windows.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {MODULE_ID, VERSION} from '../scripts/constants.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const MAIN = {documentElement: {dataset: {}}, title: 'Foundry Virtual Tabletop'}, OTHER = {name: 'popout'};
class FakeApp { constructor(o) { this.options = o; this.rendered = false; } render() { this.rendered = true; return Promise.resolve(this); } }
class FakeDialog extends FakeApp { static wait(options) { const d = new this(options); d.render({force: true}); return Promise.resolve(null); } }
class CompendiumBrowser extends FakeApp { static async selectOne() { await new this().render({force: true}); return null; } }
class AdvancementManager extends FakeApp {}
const make = (out, user = users.gm) => {
  installGlobals({user, modules: {[MODULE_ID]: {active: true, version: VERSION}}});
  globalThis.document = MAIN;
  globalThis.foundry = {...(globalThis.foundry ?? {}), applications: {...(globalThis.foundry?.applications ?? {}), api: {DialogV2: FakeDialog}}};
  globalThis.dnd5e = {applications: {CompendiumBrowser, advancement: {AdvancementManager}}};
  const actor = makeActor({type: 'character', items: [{id: 'fig', name: '[TEST] Fighter', type: 'class', system: {identifier: 'fighter', levels: 3}}], system: {details: {level: 3}}});
  actor.toObject = () => ({_id: actor.id, name: actor.name, type: actor.type, system: {}, flags: {}, items: [], effects: []});
  const kids = [], sheet = new Hub({document: actor});
  sheet.element = {ownerDocument: out ? OTHER : MAIN};
  sheet.renderChild = async app => { kids.push(app); await app.render(); };
  return {sheet, kids};
};
const done = () => { delete globalThis.dnd5e; delete globalThis.document; };

test('Level up from its header button: the class picker opens in the popped-out Hub (through dispatch), and in the main window otherwise', async () => {
  for (const out of [true, false]) {
    const {sheet, kids} = make(out);
    try {
      await sheet.dispatch('level-up', {dataset: {}}, {});
      assert.equal(kids.length, out ? 1 : 0, out ? 'the class picker is a child of the Hub' : 'not popped out: untouched');
      if (out) assert.ok(kids[0] instanceof FakeDialog);
    } finally { done(); }
  }
});

test('Add… on a popped-out Hub: the Add menu dialog opens in the Hub window', async () => {
  const {sheet, kids} = make(true, users.owner);
  try {
    sheet.document.testUserPermission = () => true;
    await sheet.dispatch('item-add', {dataset: {tab: 'inventory'}}, {});
    assert.equal(kids.length, 1, 'Browse compendiums… / Create new… choice');
    assert.ok(kids[0] instanceof FakeDialog);
  } finally { done(); }
});

test("dnd5e's compendium browser and advancement window are hosted in the Hub window during an action", async () => {
  const {sheet, kids} = make(true);
  const {hostWindows} = await import('../scripts/popout.mjs');
  try {
    await hostWindows(sheet, async () => { await CompendiumBrowser.selectOne(); await new AdvancementManager().render({force: true}); });
    assert.deepEqual(kids.map(k => k.constructor.name), ['CompendiumBrowser', 'AdvancementManager']);
    kids.length = 0;
    await new CompendiumBrowser().render({force: true});
    assert.equal(kids.length, 0, 'outside an action nothing is wrapped');
  } finally { done(); }
});

test('drops on a list run inside hostWindows, so the advancement window follows a popped-out Hub', () => {
  const src = fs.readFileSync(new URL('../scripts/sheet.mjs', import.meta.url), 'utf8');
  assert.match(src, /hostWindows\(this, \(\) => dropOnList\(/);
});

test('header buttons do not break the pop-out label logic: the button flips to Pop in once the Hub is out', async () => {
  const {sheet} = make(false, users.owner);
  try {
    sheet._canDetach = () => true;
    sheet.detachWindow = async () => { sheet.element.ownerDocument = OTHER; };
    sheet.attachWindow = async () => { sheet.element.ownerDocument = MAIN; };
    const label = async () => (await sheet._renderHTML()).match(/<button[^>]*data-action="pop-out"[^>]*aria-label="([^"]+)"/)?.[1];
    assert.equal(await label(), 'Pop out');
    await sheet.dispatch('pop-out', {dataset: {}}, {});
    assert.equal(await label(), 'Pop in');
    const html = await sheet._renderHTML(), head = html.slice(0, html.indexOf('</header>'));
    assert.match(head, /data-action="level-up"/); assert.doesNotMatch(head, /data-action="hotbar-link"/);
    await sheet.dispatch('pop-out', {dataset: {}}, {});
    assert.equal(await label(), 'Pop out');
  } finally { done(); }
});
