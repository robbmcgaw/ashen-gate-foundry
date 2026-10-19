import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmDialog, formDialog, promptText, infoDialog, readForm} from '../scripts/dialogs.mjs';

const setup = D => { globalThis.foundry = {applications: {api: {DialogV2: D}}}; delete globalThis.window; };
const click = (opts, action) => {
  const b = opts.buttons.find(x => x.action === action);
  return b.callback({}, {form: {elements: [{name: 'value', value: 'typed'}, {name: 'n', value: '3'}]}});
};

test('confirmDialog resolves true only on the action button; Cancel is first', async () => {
  let seen;
  setup({wait: async o => { seen = o; return click(o, 'confirm'); }});
  assert.equal(await confirmDialog('Remove?', {yes: 'Remove reward'}), true);
  assert.deepEqual(seen.buttons.map(b => b.label), ['Cancel', 'Remove reward']);
  setup({wait: async o => click(o, 'cancel')});
  assert.equal(await confirmDialog('Remove?'), false);
  setup({wait: async () => null}); // window closed
  assert.equal(await confirmDialog('Remove?'), false);
});

test('formDialog returns values on OK and null on cancel/close', async () => {
  setup({wait: async o => click(o, 'ok')});
  assert.deepEqual(await formDialog('T', [{name: 'value', label: 'L', value: 'x'}]), {value: 'typed', n: '3'});
  assert.equal(await promptText('T', 'L', 'x'), 'typed');
  setup({wait: async o => click(o, 'cancel')});
  assert.equal(await promptText('T', 'L', 'x'), null);
  setup({wait: async () => null});
  assert.equal(await formDialog('T', []), null);
});

test('form content escapes values', async () => {
  let content;
  setup({wait: async o => { content = o.content; return null; }});
  await formDialog('T', [{name: 'a', label: 'L<', value: '"><script>', type: 'select', options: [{value: 'x', label: 'X'}]}, {name: 'b', label: 'B', value: '"><b>'}]);
  assert.ok(!content.includes('<script>') && !content.includes('"><b>'));
});

test('falls back to native dialogs only when DialogV2 is absent, else cancels', async () => {
  globalThis.foundry = {}; globalThis.window = {confirm: () => true, prompt: () => 'hi'};
  assert.equal(await confirmDialog('x'), true);
  assert.equal(await promptText('T', 'L'), 'hi');
  delete globalThis.window;
  assert.equal(await confirmDialog('x'), false);
  assert.equal(await promptText('T', 'L'), null);
});

test('infoDialog shows a Close-only prompt; readForm reads named fields', async () => {
  let o;
  setup({prompt: async x => { o = x; }});
  await infoDialog('Help', '<p>hi</p>');
  assert.equal(o.ok.label, 'Close');
  assert.deepEqual(readForm({elements: [{name: 'a', value: '1'}, {value: 'skip'}]}), {a: '1'});
});
