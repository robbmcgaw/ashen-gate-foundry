/** 0.46.2: the pop-out hosting wrapper is armed only between steps of a Hub action; roll dialogs are hosted (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {hostWindows, releaseHosting} from '../scripts/popout.mjs';

const MAIN = {name: 'main'}, OTHER = {name: 'popout'};
class FakeApp {
  constructor(o) { this.options = o; this.rendered = false; this._l = []; }
  addEventListener(t, f) { if (t === 'close') this._l.push(f); }
  close() { this.rendered = false; for (const f of this._l.splice(0)) f(); }
  render() { this.rendered = true; return Promise.resolve(this); }
}
class FakeDialog extends FakeApp { static wait(options) { const d = new this(options); d.render({force: true}); return Promise.resolve(d); } }
const tick = () => new Promise(r => setImmediate(r));
const hub = (doc, kids = []) => ({element: {ownerDocument: doc}, renderChild: async a => { kids.push(a); await a.render(); }});
const setup = () => {
  class RollConfigurationDialog extends FakeApp {}
  class D20RollConfigurationDialog extends RollConfigurationDialog {}
  class AttackRollConfigurationDialog extends D20RollConfigurationDialog {}
  class DamageRollConfigurationDialog extends RollConfigurationDialog {}
  class SkillToolRollConfigurationDialog extends D20RollConfigurationDialog {}
  class ActivityUsageDialog extends FakeApp {}
  globalThis.document = MAIN;
  globalThis.dnd5e = {applications: {activity: {ActivityUsageDialog}, dice: {RollConfigurationDialog, D20RollConfigurationDialog, AttackRollConfigurationDialog, DamageRollConfigurationDialog, SkillToolRollConfigurationDialog}}};
  globalThis.foundry = {applications: {api: {DialogV2: FakeDialog}}};
  return {ActivityUsageDialog, ...globalThis.dnd5e.applications.dice};
};
const teardown = () => { delete globalThis.document; delete globalThis.dnd5e; delete globalThis.foundry; };
const origWait = FakeDialog.wait;
const patched = c => Object.hasOwn(c.ActivityUsageDialog.prototype, 'render');
const waitPatched = () => FakeDialog.wait !== origWait;

test('wrapper is off while a hosted dialog is open: a main-window dialog is not hosted; back on for the next step', async () => {
  const c = setup();
  try {
    const kids = [], h = hub(OTHER, kids);
    let release;
    const gate = new Promise(r => { release = r; });
    const action = hostWindows(h, async () => {
      assert.ok(patched(c), 'armed at the start of the action');
      const help = await FakeDialog.wait({}); await tick();                        // hosted (Hub Help)
      assert.equal(kids.length, 1);
      assert.equal(patched(c), false, 'off while Help is open');
      assert.equal(waitPatched(), false);
      const mainConfirm = await FakeDialog.wait({});                  // opened by other code meanwhile
      assert.equal(kids.length, 1, 'the main-window dialog is NOT hosted');
      assert.equal(mainConfirm.rendered, true);
      await new c.DamageRollConfigurationDialog().render({force: true});
      assert.equal(kids.length, 1, 'neither is a roll dialog opened from elsewhere');
      await gate;
      help.close();
      assert.ok(patched(c), 're-armed: the action is still running');
      await new c.DamageRollConfigurationDialog().render({force: true});
      await tick();
      assert.equal(kids.length, 2, 'the next step is hosted');
      assert.equal(patched(c), false, 'off again while it is open');
    });
    release();
    await action;
    assert.equal(patched(c), false); assert.equal(waitPatched(), false, 'restored when the action settles');
  } finally { teardown(); }
});

test('Use -> usage dialog -> attack and damage roll dialogs are all hosted, one after the other', async () => {
  const c = setup();
  try {
    const kids = [], h = hub(OTHER, kids);
    await hostWindows(h, async () => {
      for (const Cls of [c.ActivityUsageDialog, c.AttackRollConfigurationDialog, c.DamageRollConfigurationDialog, c.SkillToolRollConfigurationDialog, c.D20RollConfigurationDialog, c.RollConfigurationDialog]) {
        await new Cls().render({force: true});
        await tick();
        kids.at(-1).close();
      }
    });
    assert.deepEqual(kids.map(k => k.constructor.name), ['ActivityUsageDialog', 'AttackRollConfigurationDialog', 'DamageRollConfigurationDialog', 'SkillToolRollConfigurationDialog', 'D20RollConfigurationDialog', 'RollConfigurationDialog']);
  } finally { teardown(); }
});

test('a hosted re-render of an open dialog passes through, and nothing is hosted after the action settles', async () => {
  const c = setup();
  try {
    const kids = [], h = hub(OTHER, kids);
    let d;
    await hostWindows(h, async () => { d = new c.DamageRollConfigurationDialog(); await d.render({force: true}); await d.render({parts: ['formulas']}); });
    assert.equal(kids.length, 1);
    await new c.ActivityUsageDialog().render({force: true});
    assert.equal(kids.length, 1);
  } finally { teardown(); }
});

test('releaseHosting (Hub close, Pop in/out, window unload) restores every prototype; the action may still settle', async () => {
  const c = setup();
  try {
    const h = hub(OTHER);
    let go;
    const action = hostWindows(h, () => new Promise(r => { go = r; }));
    assert.ok(patched(c)); assert.ok(waitPatched());
    releaseHosting(h);
    assert.equal(patched(c), false); assert.equal(waitPatched(), false);
    go(); await action;
    // pagehide on the pop-out window does the same
    const listeners = {}, view = {addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener() {}};
    const h2 = {element: {ownerDocument: {defaultView: view}}, renderChild: async a => { await a.render(); }};
    const second = hostWindows(h2, () => new Promise(r => { go = r; }));
    assert.ok(patched(c));
    listeners.pagehide();
    assert.equal(patched(c), false);
    go(); await second;
  } finally { teardown(); }
});

test('safety timer disarms a wrapper that waited too long for a window', async () => {
  const c = setup();
  const realSet = globalThis.setTimeout, timers = [];
  globalThis.setTimeout = (f, ms) => { timers.push({f, ms}); return timers.length; };
  try {
    const h = hub(OTHER);
    let go;
    const action = hostWindows(h, () => new Promise(r => { go = r; }));
    assert.ok(patched(c));
    assert.equal(timers.at(-1).ms, 30000);
    timers.at(-1).f();
    assert.equal(patched(c), false);
    go(); await action;
  } finally { globalThis.setTimeout = realSet; teardown(); }
});

test('without a close event the wrapper stays off until the action ends (never hijacks)', async () => {
  const c = setup();
  try {
    const kids = [], h = hub(OTHER, kids);
    c.ActivityUsageDialog.prototype.addEventListener = undefined;
    await hostWindows(h, async () => {
      await new c.ActivityUsageDialog().render({force: true});
      assert.equal(patched(c), false);
    });
    assert.equal(kids.length, 1);
  } finally { teardown(); }
});
