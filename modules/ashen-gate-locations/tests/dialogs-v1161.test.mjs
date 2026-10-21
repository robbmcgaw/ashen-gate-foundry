/** 1.16.1: Help, confirms and prompts go through the shared ag-dialogs.mjs helper.
 *  Mocked Foundry (a stand-in DialogV2): proves the options the window passes, not how Foundry draws the dialog. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, gm} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {createApi} from '../scripts/api.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp} = await import('../scripts/app.mjs');
globalThis.CSS ??= {escape: v => String(v)};

function boot() {
  const g = installFoundry();
  const mod = {version: '1.16.1', active: true};
  mod.api = createApi({version: '1.16.1', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  game.user = gm;
  return mod.api;
}
/** Stand-in DialogV2: records each call's options and answers with the given button action. */
function dialogs(answer) {
  const seen = [];
  const click = o => { const b = o.buttons?.find(x => x.action === answer); return b?.callback ? b.callback({}, {form: {elements: []}}) : answer; };
  foundry.applications.api.DialogV2 = {
    wait: async o => { seen.push({kind: 'wait', ...o}); return click(o); },
    prompt: async o => { seen.push({kind: 'prompt', ...o}); return undefined; },
    confirm: async () => { throw new Error('DialogV2.confirm must not be called directly'); }
  };
  return seen;
}

test('Help opens the shared info dialog with one Close button and the kit classes', async () => {
  boot();
  const seen = dialogs('ok');
  await new LocationsApp().help();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].ok.label, 'Close');
  assert.ok(seen[0].classes.includes('ag-app') && seen[0].classes.includes('ag-dialog'));
  assert.equal(seen[0].window.title, 'Locations Help');
});

test('Delete location: Cancel keeps the location; the action is a red "Delete location"', async () => {
  const api = boot();
  const saved = await api.saveLocation({name: '[TEST] Hut'});
  const app = new LocationsApp();
  app.render = async () => {};
  app.select(saved.id);
  let seen = dialogs('cancel');
  await app.onAction({dataset: {action: 'delete'}});
  assert.ok(seen[0].classes.includes('ag-dialog--danger'));
  assert.equal(seen[0].window.title, 'Delete location?');
  assert.deepEqual(seen[0].buttons.map(b => b.label), ['Cancel', 'Delete location']);
  assert.match(seen[0].content, /\[TEST\] Hut/);
  assert.doesNotMatch(seen[0].content, new RegExp(saved.id));
  assert.ok(api.listLocations().some(l => l.id === saved.id), 'Cancel changes nothing');
  seen = dialogs('confirm');
  await app.onAction({dataset: {action: 'delete'}});
  assert.ok(!api.listLocations().some(l => l.id === saved.id), 'Delete location removes it');
});

test('Discard unsaved changes asks with Keep editing on the left', async () => {
  boot();
  const app = new LocationsApp();
  app.draft = {name: 'x'}; app.dirty = true;
  const seen = dialogs('cancel');
  assert.equal(await app.confirmDiscard(), false);
  assert.deepEqual(seen[0].buttons.map(b => b.label), ['Keep editing', 'Discard changes']);
});

test('Delete route with a linked drawing: shared choice dialog, Cancel left, both delete choices red; Cancel deletes nothing', async () => {
  const real = boot();
  const deleted = [];
  const api = {...real, routeDrawing: () => ({status: 'linked'}), deleteRoute: async (id, opts) => { deleted.push([id, opts]); }};
  game.modules = {get: id => id === 'ashen-gate-locations' ? {version: '1.16.1', active: true, api} : null};
  const app = new LocationsApp();
  app.render = async () => {};
  app.routeDraft = {id: 'ROUTE-TEST', name: '[TEST] Path'};
  let seen = dialogs('cancel');
  await app.onAction({dataset: {action: 'route-delete'}});
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].classes, ['ag-app', 'ag-dialog', 'ag-dialog--danger', 'ag-dialog--choice']);
  assert.equal(seen[0].window.title, 'Delete route?');
  assert.deepEqual(seen[0].buttons.map(b => [b.action, b.label]), [['cancel', 'Cancel'], ['keep', 'Delete route, keep drawing'], ['both', 'Delete route and drawing']]);
  assert.ok(seen[0].buttons.slice(1).every(b => /ag-dialog__choice--danger/.test(b.class)));
  assert.match(seen[0].content, /\[TEST\] Path/);
  assert.deepEqual(deleted, [], 'Cancel deletes nothing');
  dialogs('keep');
  await app.onAction({dataset: {action: 'route-delete'}});
  app.routeDraft = {id: 'ROUTE-TEST', name: '[TEST] Path'};
  dialogs('both');
  await app.onAction({dataset: {action: 'route-delete'}});
  assert.deepEqual(deleted, [['ROUTE-TEST', {deleteDrawing: false}], ['ROUTE-TEST', {deleteDrawing: true}]]);
});
