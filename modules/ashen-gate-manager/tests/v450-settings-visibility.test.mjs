/** 0.45.0: nothing of General Manager shows in players' Game Settings; the NPC Codex menu appears only while it is shared. */
import test from 'node:test';
import assert from 'node:assert/strict';

test('every menu is restricted; the NPC Codex menu follows the Codex player access setting live', async () => {
  const callbacks = new Map(), registered = new Map();
  const menus = new Map();
  let codexAccess = true;
  class ApplicationV2 {constructor(o) {this.options = o;} async render() {return this;}}
  globalThis.foundry = {applications:{api:{ApplicationV2, HandlebarsApplicationMixin:P => P, DialogV2:{confirm:async () => true}}}};
  globalThis.Hooks = {once:(e, fn) => callbacks.set(e, fn)};
  globalThis.game = {user:{isGM:false, id:'player'}, modules:new Map([['ashen-gate-manager', {}]]),
    settings:{menus,
      register:(id, key, opt) => registered.set(key, opt),
      registerMenu:(id, key, opt) => menus.set(`${id}.${key}`, {key:`${id}.${key}`, ...opt}),
      get:(id, key) => key === 'codexPlayerAccess' ? codexAccess : key === 'folderRenames' ? {} : undefined}};
  await import('../scripts/main.js');
  callbacks.get('init')();
  assert.deepEqual([...menus.values()].map(m => [m.key, m.restricted]),
    [['ashen-gate-manager.manager', true], ['ashen-gate-manager.myAppearance', true], ['ashen-gate-manager.npcCodex', true]]);
  for(const [key, opt] of registered) assert.notEqual(opt.config, true, `${key} is not shown in Game Settings`);
  assert.equal(registered.get('importLayout').scope, 'client');
  try {callbacks.get('ready')();} catch {/* browser-only parts of ready are not under test */}
  assert.equal(menus.get('ashen-gate-manager.npcCodex').restricted, false, 'shared: players see Open NPC Codex');
  assert.equal(menus.get('ashen-gate-manager.myAppearance').restricted, true);
  registered.get('codexPlayerAccess').onChange(false);
  assert.equal(menus.get('ashen-gate-manager.npcCodex').restricted, true, 'unshared: hidden again on every client');
  registered.get('codexPlayerAccess').onChange(true);
  assert.equal(menus.get('ashen-gate-manager.npcCodex').restricted, false);
});
