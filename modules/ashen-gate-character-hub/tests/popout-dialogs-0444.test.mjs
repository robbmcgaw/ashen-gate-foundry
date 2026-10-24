/** 0.44.4: dialogs, dnd5e usage/rest dialogs and the file picker opened from a popped-out Hub open in its window (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {hostWindows} from '../scripts/popout.mjs';

const MAIN = {name: 'main'}, OTHER = {name: 'popout'};
class FakeApp { constructor(o) { this.options = o; this.rendered = false; } render(o) { FakeApp.log.push(['render', this.constructor.name]); this.rendered = true; return Promise.resolve(this); } }
FakeApp.log = [];
class FakeDialog extends FakeApp { static wait(options) { const d = new this(options); d.render({force: true}); return Promise.resolve(d); } }
const hub = (doc, children = []) => ({element: {ownerDocument: doc}, renderChild: async a => { children.push(a); await a.render(); }});
const setup = () => {
  FakeApp.log = [];
  class ActivityUsageDialog extends FakeApp {} class ShortRestDialog extends FakeApp {} class Other extends FakeApp {} class FilePickerImpl extends FakeApp {}
  globalThis.document = MAIN;
  globalThis.dnd5e = {applications: {activity: {ActivityUsageDialog}, actor: {ShortRestDialog, Other}}};
  globalThis.foundry = {applications: {api: {DialogV2: FakeDialog}, apps: {FilePicker: {implementation: FilePickerImpl}}}};
  return {ActivityUsageDialog, ShortRestDialog, Other, FilePickerImpl};
};
const teardown = () => { delete globalThis.document; delete globalThis.dnd5e; delete globalThis.foundry; };

test('popped out: Hub dialogs, usage/rest dialogs and the file picker become children of the Hub', async () => {
  const c = setup();
  try {
    const kids = [], h = hub(OTHER, kids);
    await hostWindows(h, async () => {
      const d = await FakeDialog.wait({x: 1});
      await new c.ActivityUsageDialog().render({force: true});
      await new c.ShortRestDialog().render({force: true});
      await new c.FilePickerImpl().render({force: true});
      await new c.Other().render({force: true});
      assert.equal(d.rendered, true);
    });
    assert.deepEqual(kids.map(k => k.constructor.name === '' ? 'Hosted' : k.constructor.name.replace(/^/, '')), ['', 'ActivityUsageDialog', 'ShortRestDialog', 'FilePickerImpl'].map((n, i) => i ? n : kids[0].constructor.name));
    assert.ok(kids[0] instanceof FakeDialog, 'the Hub dialog is a DialogV2 child');
    assert.equal(kids.length, 4, 'a window class we do not know is left alone');
    assert.equal(FakeApp.log.filter(l => l[0] === 'render').length, 5, 'each window rendered exactly once');
  } finally { teardown(); }
});

test('patches are removed when the action ends (also on failure), so later windows render as before', async () => {
  const c = setup();
  try {
    const kids = [], h = hub(OTHER, kids);
    const waitBefore = FakeDialog.wait, renderBefore = c.ActivityUsageDialog.prototype.render;
    await hostWindows(h, async () => {});
    assert.equal(FakeDialog.wait, waitBefore); assert.equal(c.ActivityUsageDialog.prototype.render, renderBefore);
    assert.equal(Object.hasOwn(c.ActivityUsageDialog.prototype, 'render'), false);
    await assert.rejects(hostWindows(h, async () => { throw new Error('boom'); }), /boom/);
    assert.equal(FakeDialog.wait, waitBefore);
    await new c.ActivityUsageDialog().render({force: true});
    assert.equal(kids.length, 0);
  } finally { teardown(); }
});

test('not popped out, or no renderChild: nothing is wrapped and the result passes through', async () => {
  const c = setup();
  try {
    const kids = [], inMain = hub(MAIN, kids);
    const r = await hostWindows(inMain, async () => { assert.equal(Object.hasOwn(c.ActivityUsageDialog.prototype, 'render'), false); await FakeDialog.wait({}); return 7; });
    assert.equal(r, 7); assert.equal(kids.length, 0);
    const noChild = {element: {ownerDocument: OTHER}};
    assert.equal(await hostWindows(noChild, async () => 8), 8);
    assert.equal(await hostWindows(null, () => 9), 9);
  } finally { teardown(); }
});

test('a renderChild that does not render the window falls back to an ordinary render', async () => {
  const c = setup();
  try {
    const h = {element: {ownerDocument: OTHER}, renderChild: async () => {}};
    await hostWindows(h, async () => { await new c.ShortRestDialog().render({force: true}); });
    assert.equal(FakeApp.log.length, 1);
  } finally { teardown(); }
});
