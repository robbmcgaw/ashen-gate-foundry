import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmDialog, formDialog, promptText, infoDialog, readForm, checklistDialog, esc} from '../scripts/ag-dialogs.mjs';

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
  assert.deepEqual(seen.buttons.map(b => b.action), ['cancel', 'confirm']);
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
  assert.equal(esc('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
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

test('readForm collects ticked checkboxes into an array; formDialog renders checkbox and checklist fields', async () => {
  assert.deepEqual(readForm({elements: [
    {name: 'tags', type: 'checkbox', value: 'a', checked: true}, {name: 'tags', type: 'checkbox', value: 'b', checked: false},
    {name: 'tags', type: 'checkbox', value: 'c', checked: true}, {name: 'none', type: 'checkbox', value: 'x', checked: false}
  ]}), {tags: ['a', 'c']});
  let content;
  setup({wait: async o => { content = o.content; return null; }});
  await formDialog('T', [{name: 'on', label: 'On', type: 'checkbox', checked: true}, {name: 'pick', label: 'Pick', type: 'checklist', options: [{value: 'p', label: 'P', checked: true}]}]);
  assert.match(content, /type="checkbox" name="on" value="1" checked/);
  assert.match(content, /<fieldset class="form-group"><legend>Pick<\/legend>/);
});

test('every DialogV2 window carries the ag-app and ag-dialog classes', async () => {
  const seen = [];
  setup({wait: async o => { seen.push(o); return null; }, prompt: async o => { seen.push(o); }});
  await confirmDialog('x');
  await formDialog('T', []);
  await infoDialog('Help', '<p>hi</p>');
  await checklistDialog('T', 'intro', [{key: 'a', label: 'A'}]);
  assert.equal(seen.length, 4);
  for (const o of seen) assert.deepEqual(o.classes, ['ag-app', 'ag-dialog']);
  setup({confirm: async o => { seen.push(o); return true; }});
  assert.equal(await confirmDialog('x', {danger: true}), true);
  assert.deepEqual(seen.at(-1).classes, ['ag-app', 'ag-dialog', 'ag-dialog--danger']);
});

test('confirmDialog danger: true adds ag-dialog--danger and keeps the button order', async () => {
  let seen;
  setup({wait: async o => { seen = o; return click(o, 'confirm'); }});
  assert.equal(await confirmDialog('Delete?', {title: 'Delete this faction?', yes: 'Delete faction', danger: true}), true);
  assert.deepEqual(seen.classes, ['ag-app', 'ag-dialog', 'ag-dialog--danger']);
  assert.equal(seen.window.title, 'Delete this faction?');
  assert.deepEqual(seen.buttons.map(b => [b.action, b.label]), [['cancel', 'Cancel'], ['confirm', 'Delete faction']]);
});

test('checklistDialog resolves the ticked keys, [] when none, null on cancel', async () => {
  const form = {elements: [{type: 'checkbox', checked: true, dataset: {key: 'a'}}, {type: 'checkbox', checked: false, dataset: {key: 'b'}}]};
  setup({wait: async o => o.buttons.find(b => b.action === 'ok').callback({}, {form})});
  assert.deepEqual(await checklistDialog('T', 'Pick', [{key: 'a', label: 'A'}, {key: 'b', label: 'B'}]), ['a']);
  setup({wait: async o => o.buttons.find(b => b.action === 'ok').callback({}, {form: {elements: []}})});
  assert.deepEqual(await checklistDialog('T', 'Pick', []), []);
  setup({wait: async o => o.buttons.find(b => b.action === 'cancel').callback()});
  assert.equal(await checklistDialog('T', 'Pick', [{key: 'a', label: 'A'}]), null);
});
