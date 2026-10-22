import test from 'node:test';
import assert from 'node:assert/strict';
import {DIALOGS} from './kit-path.mjs';
const {confirmDanger, confirmDialog} = await import(DIALOGS);

const setup = D => { globalThis.foundry = {applications: {api: {DialogV2: D}}}; delete globalThis.window; };
const press = (o, action) => o.buttons.find(b => b.action === action).callback();

test('confirmDanger: Cancel first and default, labelled red action, danger classes', async () => {
  let seen;
  setup({wait: async o => { seen = o; return press(o, 'confirm'); }});
  assert.equal(await confirmDanger('Players lose access to its notes.', {title: 'Delete [TEST] Location A?', yes: 'Delete location'}), true);
  assert.deepEqual(seen.buttons.map(b => [b.action, b.label, b.default]), [['cancel', 'Cancel', true], ['confirm', 'Delete location', false]]);
  assert.deepEqual(seen.classes, ['ag-app', 'ag-dialog', 'ag-dialog--danger', 'ag-dialog--danger-confirm']);
  assert.equal(seen.window.title, 'Delete [TEST] Location A?');
  assert.equal(seen.content, '<p>Players lose access to its notes.</p>');
  assert.equal(seen.modal, true);
  assert.equal(seen.rejectClose, false);
});

test('confirmDanger resolves false on Cancel, close (Esc) or any other result', async () => {
  setup({wait: async o => press(o, 'cancel')});
  assert.equal(await confirmDanger('x', {yes: 'Delete route'}), false);
  setup({wait: async () => null});
  assert.equal(await confirmDanger('x'), false);
  setup({wait: async () => 'confirm'});
  assert.equal(await confirmDanger('x'), false, 'only the callback result true counts');
});

test('confirmDanger never labels the action OK/Yes/Confirm and escapes the message', async () => {
  let seen;
  setup({wait: async o => { seen = o; return null; }});
  await confirmDanger('<b>gone</b>');
  assert.equal(seen.buttons[1].label, 'Delete');
  assert.equal(seen.window.title, 'Delete?');
  assert.equal(seen.content, '<p>&lt;b&gt;gone&lt;/b&gt;</p>');
});

test('confirmDanger falls back to DialogV2.confirm with Cancel as default, then to window.confirm', async () => {
  let seen;
  setup({confirm: async o => { seen = o; return true; }});
  assert.equal(await confirmDanger('x', {yes: 'Revoke access'}), true);
  assert.deepEqual([seen.yes, seen.no], [{label: 'Revoke access', default: false}, {label: 'Cancel', default: true}]);
  globalThis.foundry = {}; globalThis.window = {confirm: () => true};
  assert.equal(await confirmDanger('x'), true);
  delete globalThis.window;
  assert.equal(await confirmDanger('x'), false);
});

test('confirmDialog is unchanged: the action stays the default even with danger', async () => {
  let seen;
  setup({wait: async o => { seen = o; return null; }});
  await confirmDialog('x', {danger: true, yes: 'Delete'});
  assert.deepEqual(seen.buttons.map(b => b.default ?? false), [false, true]);
  assert.deepEqual(seen.classes, ['ag-app', 'ag-dialog', 'ag-dialog--danger']);
});
