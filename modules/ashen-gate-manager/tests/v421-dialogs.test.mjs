// 0.42.1: Help and every confirmation go through the shared ag-dialogs.mjs helper (Close / labelled actions, kit classes).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {confirmDialog, infoDialog} from '../scripts/ag-dialogs.mjs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const main = read('../scripts/main.js');

function mockDialog(choose) {
  const calls = [];
  globalThis.foundry = {applications: {api: {DialogV2: {
    wait: async opts => { calls.push(opts); return choose(opts); },
    prompt: async opts => { calls.push(opts); return undefined; }
  }}}};
  return calls;
}

test('Help opens through infoDialog with one Close button and the kit classes', async () => {
  const at = main.indexOf('case "help"');
  assert.match(main.slice(at, at + 120), /await infoDialog\('General Manager help'/);
  const calls = mockDialog(() => undefined);
  await infoDialog('General Manager help', '<p>x</p>');
  assert.equal(calls[0].ok.label, 'Close');
  assert.ok(calls[0].classes.includes('ag-app') && calls[0].classes.includes('ag-dialog'));
});

test('no direct DialogV2 confirm/prompt and no Yes/No or capitalised titles remain', () => {
  assert.doesNotMatch(main, /DialogV2\.(confirm|prompt)\(/);
  assert.doesNotMatch(main, /FINAL DELETE|REPLACE fields|EXPERIMENTAL|toUpperCase\(\)\} managed|Hide All Player Interfaces|pending Tim/);
  assert.doesNotMatch(read('../templates/manager.hbs'), /pending Tim|Other workstreams/);
});

test('destructive confirms use the kit confirmDanger (Cancel is the default) with a verb label', () => {
  for (const [title, yes] of [
    ['Delete managed content permanently?', 'Delete ${accepted.length} archived record(s)'],
    ['Replace fields from the source?', 'Replace fields'],
    ['Hide all player windows?', 'Hide all'],
    ['Reset organize rules?', 'Reset rules to defaults'],
    ['Reset scene moods and layers?', 'Reset moods to defaults'],
    ['Undo the last organize?', 'Undo last organize'],
    ['Remove recovery tags?', 'Remove tags']
  ]) {
    const at = main.indexOf(`title:'${title}'`);
    assert.ok(at > 0, title);
    const opts = main.slice(at, main.indexOf('});', at));
    assert.ok(opts.includes(`yes:${yes.includes('${') ? '`' : "'"}${yes}`), `${title} labels ${yes}`);
    const call = main.lastIndexOf('confirm', at);
    assert.equal(main.slice(call, call + 'confirmDanger('.length), 'confirmDanger(', `${title} is a danger confirm`);
  }
  assert.doesNotMatch(main, /danger:true/, 'no confirmDialog(…, {danger:true}) left: removals use confirmDanger');
  const archive = main.indexOf('managed content?`');
  assert.match(main.slice(archive - 700, archive), /\(action==='restore'\?confirmDialog:confirmDanger\)\(/);
});

test('a danger confirm puts Cancel first, marks the window, and Cancel resolves false', async () => {
  const calls = mockDialog(opts => opts.buttons[0].callback());
  let changed = false;
  if (await confirmDialog('Delete 1 archived Foundry documents permanently?', {title: 'Delete managed content permanently?', yes: 'Delete 1 archived record(s)', danger: true})) changed = true;
  assert.equal(changed, false);
  const [cancel, action] = calls[0].buttons;
  assert.deepEqual([cancel.label, action.label], ['Cancel', 'Delete 1 archived record(s)']);
  assert.ok(calls[0].classes.includes('ag-dialog--danger'));
  assert.equal(calls[0].window.title, 'Delete managed content permanently?');
});
