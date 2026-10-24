/** 0.46.6: Restore (picker -> confirm) lands in a popped-out Hub's window. DialogV2.wait resolves in the submit handler, before the dialog closes (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {hostWindows} from '../scripts/popout.mjs';

const MAIN = {name: 'main'}, OTHER = {name: 'popout'};
/** Like Foundry's DialogV2: wait() resolves inside options.submit; closing happens after submit() returns. */
class FakeDialog {
  constructor(options) { this.options = options; this.rendered = false; this._l = []; }
  addEventListener(t, f) { if (t === 'close') this._l.push(f); }
  async close() { this.rendered = false; for (const f of this._l.splice(0)) f(); }
  render() { this.rendered = true; return Promise.resolve(this); }
  async submit(result) { await this.options.submit?.(result, this); return this.close(); }
  static wait(config = {}) {
    return new Promise(resolve => {
      const orig = config.submit;
      config.submit = async (result, dialog) => { await orig?.(result, dialog); resolve(result); };
      const d = new this(config);
      d.addEventListener('close', () => resolve(null));
      (globalThis.__made ??= []).push(d);
      d.render({force: true});
    });
  }
}
const tick = () => new Promise(r => setImmediate(r));
const hub = (doc, kids) => ({element: {ownerDocument: doc}, renderChild: async a => { kids.push(a); await a.render(); }});
const setup = () => { globalThis.document = MAIN; globalThis.foundry = {applications: {api: {DialogV2: FakeDialog}}}; globalThis.__made = []; };
const teardown = () => { delete globalThis.document; delete globalThis.foundry; delete globalThis.__made; };
const origWait = FakeDialog.wait;

test('a confirm opened right after a picker is submitted (before the picker closes) is hosted', async () => {
  setup();
  try {
    const kids = [], h = hub(OTHER, kids);
    const action = hostWindows(h, async () => {
      const picked = FakeDialog.wait({});           // picker
      await tick();
      assert.equal(kids.length, 1, 'picker hosted');
      globalThis.__made[0].submit('next');          // the click: resolves wait() first, closes afterwards
      assert.equal(await picked, 'next');
      const confirmed = FakeDialog.wait({});        // next step runs before the picker has closed
      await tick();
      assert.equal(kids.length, 2, 'the confirm is hosted too');
      globalThis.__made[1].submit('yes');
      assert.equal(await confirmed, 'yes');
    });
    await action;
    assert.equal(FakeDialog.wait, origWait, 'wait restored once the action settles');
  } finally { teardown(); }
});

test('a dialog from elsewhere stays in the main window while a Hub dialog is open, and after it is dismissed without submit', async () => {
  setup();
  try {
    const kids = [], h = hub(OTHER, kids);
    let help;
    const action = hostWindows(h, async () => { help = FakeDialog.wait({}); await help; });
    await tick();
    assert.equal(kids.length, 1);
    assert.equal(FakeDialog.wait, origWait, 'not patched while Help is open');
    FakeDialog.wait({});                              // opened by other code (a delete confirm, a rest)
    await tick();
    assert.equal(kids.length, 1, 'the main-window dialog is not hosted');
    globalThis.__made[0].close();                     // Help closed with X
    await action;
    FakeDialog.wait({}); await tick();
    assert.equal(kids.length, 1, 'nothing is hosted after the action ended');
    assert.equal(FakeDialog.wait, origWait);
  } finally { teardown(); }
});

test('an action that ends right after its dialog is submitted restores wait and hosts nothing more', async () => {
  setup();
  try {
    const kids = [], h = hub(OTHER, kids);
    const action = hostWindows(h, async () => { const p = FakeDialog.wait({}); await tick(); globalThis.__made[0].submit('ok'); await p; });
    await action; await tick();
    assert.equal(FakeDialog.wait, origWait);
    FakeDialog.wait({}); await tick();
    assert.equal(kids.length, 1);
  } finally { teardown(); }
});
