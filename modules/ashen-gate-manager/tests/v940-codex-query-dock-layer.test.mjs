// 0.94.0: (1) the NPC Codex query reads the sender the way Foundry V14 build 367 passes it; (2) the player dock layering.
// Mocked Foundry and CSS text checks: proves logic and wiring, not the live V14 stacking. Synthetic [TEST] data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCodexService, querySenderId, CODEX_ACCESS_SETTING} from '../scripts/codex-service.js';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const def = () => ({id: 'NPC-TEST-MIRA', entity_type: 'NPC', status: 'draft', version: '0.1.0', visibility: 'gm', scope: 'setting_adapter',
  name: '[TEST] Mira Vane', role: 'Ferry clerk', wants: 'SECRET-WANTS', portrayal: 'SECRET-PORTRAYAL', gm_notes: ['SECRET-NOTE'], art: {repo_path: null, forge_path: null}});

function world({access = true} = {}) {
  const flags = new Map();
  const mira = {id: 'mira', uuid: 'Actor.mira', name: 'Mira', img: 'm.webp', type: 'npc',
    getFlag: (m, k) => k === 'source' ? {sourceId: 'NPC-TEST-MIRA', definition: def()} : flags.get(k) ?? null,
    setFlag: async (m, k, v) => { flags.set(k, structuredClone(v)); }};
  const ash = {id: 'a1', name: '[TEST] Ash', type: 'character', hasPlayerOwner: true, getFlag: () => null, testUserPermission: u => u.id === 'u1'};
  const bo = {id: 'a2', name: '[TEST] Bo', type: 'character', hasPlayerOwner: true, getFlag: () => null, testUserPermission: u => u.id === 'u2'};
  const users = new Map([['u1', {id: 'u1', isGM: false}], ['u2', {id: 'u2', isGM: false}], ['gm', {id: 'gm', isGM: true}]]);
  const game = {user: {id: 'gm', isGM: true}, actors: {contents: [mira, ash, bo]}, users, modules: new Map(),
    settings: {get: (m, k) => k === CODEX_ACCESS_SETTING ? access : null}};
  return {game, users, svc: createCodexService({game, moduleId: 'ashen-gate-manager'})};
}
const secrets = x => assert.doesNotMatch(JSON.stringify(x), /SECRET/);

test('Foundry-shaped call handler(data, {timeout, user: UserDocument}) returns the player\'s filtered codex', async () => {
  const {svc, users} = world();
  await svc.setReveal('NPC-TEST-MIRA', 'discovery', {mode: 'party'});
  await svc.setReveal('NPC-TEST-MIRA', 'wants', {mode: 'actor', actorId: 'a1'});
  const own = await svc.handleQuery({}, {timeout: 10000, user: users.get('u1')});
  assert.equal(own.ok, true, own.message);
  assert.deepEqual(own.entries[0].fields.map(f => f.key), ['wants']);
  secrets(own.entries.map(e => ({...e, fields: e.fields.filter(f => f.key !== 'wants')})));
  const other = await svc.handleQuery({}, {timeout: 10000, user: users.get('u2')});
  assert.equal(other.ok, true);
  assert.deepEqual(other.entries[0].fields, [], 'another player does not get the first player\'s reveal');
});

test('a GM sender gets the party-level view; the old {userId} and {from} shapes still work', async () => {
  const {svc, users} = world();
  await svc.setReveal('NPC-TEST-MIRA', 'discovery', {mode: 'party'});
  const gm = await svc.handleQuery({}, {timeout: 10000, user: users.get('gm')});
  assert.equal(gm.ok, true); secrets(gm.entries);
  assert.equal((await svc.handleQuery({}, {userId: 'u1'})).ok, true);
  assert.equal((await svc.handleQuery({}, {from: 'u1'})).ok, true);
});

test('no resolvable sender is refused with "Unknown user."; so is an unknown id', async () => {
  const {svc} = world();
  for (const opts of [undefined, {}, {timeout: 1}, {user: {}}, {user: null}, {user: {id: 'nobody'}}]) {
    const r = await svc.handleQuery({}, opts);
    assert.deepEqual([r.ok, r.message], [false, 'Unknown user.'], JSON.stringify(opts));
  }
  assert.equal(querySenderId({user: {id: 'u1'}, userId: 'u2'}), 'u1');
  assert.equal(querySenderId({}), undefined);
});

test('player access off: a player is refused (GM-side re-check kept); a client-supplied payload cannot widen it', async () => {
  const {svc, users} = world({access: false});
  const r = await svc.handleQuery({known: ['NPC-TEST-MIRA']}, {timeout: 10000, user: users.get('u1')});
  assert.equal(r.ok, false); assert.match(r.message, /not shared/);
});

test('a non-GM client answering the query refuses (GM-only recheck stays)', async () => {
  const {svc, game, users} = world();
  game.user = {id: 'u1', isGM: false};
  const r = await svc.handleQuery({}, {timeout: 10000, user: users.get('u1')});
  assert.equal(r.ok, false);
});

test('main.js passes Foundry\'s options object straight to the handler; no other query handler exists in the suite', () => {
  assert.match(read('../scripts/main.js'), /CONFIG\.queries\[CODEX_QUERY\]=\(data,options\)=>codexService\(\)\.handleQuery\(data,options\)/);
  for (const dir of fs.readdirSync(new URL('../../', import.meta.url))) {
    const scripts = new URL(`../../${dir}/scripts/`, import.meta.url);
    if (!fs.existsSync(scripts)) continue;
    for (const f of fs.readdirSync(scripts).filter(f => /\.(m?js)$/.test(f))) {
      const src = fs.readFileSync(new URL(f, scripts), 'utf8');
      const hits = (src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').match(/CONFIG\.queries/g) ?? []).length;
      if (hits) assert.ok(dir === 'ashen-gate-manager' && f === 'main.js', `${dir}/${f} registers a query handler`);
    }
  }
});

// ---------- dock layering
const css = read('../styles/player-dock.css');
const rule = sel => { const m = css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.[\]()*+?^$|\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)); return m?.[1] ?? null; };
const tierOf = () => Number(css.match(/--agm-dock-z:\s*(\d+)/)[1]);

test('dock: a z-index tier above the window counter, below tooltips (9999) and notifications (99999); not absurd', () => {
  const dock = rule('.agm-dock');
  assert.match(dock, /position:\s*fixed/);
  assert.match(dock, /z-index:\s*var\(--agm-dock-z,\s*5000\)/);
  assert.ok(tierOf() > 100 + 1000, 'well above --z-index-window (100) plus a long session of bring-to-front steps');
  assert.ok(tierOf() < 9999, 'under Foundry tooltips (9999)');
  for (const m of css.matchAll(/z-index:\s*(\d+)\b/g)) assert.ok(Number(m[1]) < 9999, `z-index ${m[1]}`);
  assert.doesNotMatch(css, /z-index:\s*(?:\d{5,}|2147\d+)/);
});

test('dock: minimized lowers it back to the old tier so it can be covered', () => {
  const min = rule('.agm-dock[data-minimized="true"]');
  assert.match(min, /z-index:\s*30\b/);
  assert.ok(css.indexOf('.agm-dock[data-minimized="true"] { z-index: 30; }') > css.indexOf('.agm-dock {'));
});

test('dock: Foundry dialogs (class "dialog") sit one step above the dock, only while the dock is drawn', () => {
  const m = css.match(/body\[data-agm-dock-corner\] \.application\.dialog \{\s*z-index:\s*calc\(var\(--agm-dock-z,\s*5000\) \+ 1\) !important;\s*\}/);
  assert.ok(m, 'dialog rule present and scoped to body[data-agm-dock-corner]');
  assert.ok(tierOf() + 1 < 9999);
});

test('dock: never blocks pointer events outside its own box (no full-screen layer, no pointer-events hacks, fixed to a corner)', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/(^|,)\s*(body[^,]*\s)?\.agm-dock(\[[^\]]*\])*\s*(,|$)/.test(m[1]) || /#scene-controls/.test(m[1])) continue;
    assert.doesNotMatch(m[2], /pointer-events|inset:\s*0|width:\s*100(vw|%)|height:\s*100(vh|%)/, m[1].trim());
  }
  const dock = rule('.agm-dock');
  assert.doesNotMatch(dock, /pointer-events|inset|width:\s*100|height:\s*100/);
  assert.match(css, /\.agm-dock\[data-corner="top-left"\] \{ top:/);
});

test('dock: layering is CSS only (no polling, no hooks into bringToFront, no wrapped core methods)', () => {
  const js = read('../scripts/player-dock.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(js, /bringToFront|zIndex|setInterval|requestAnimationFrame/);
});

test('version 0.94.0, 0.x only, download URL, changelog and Help/README mention both fixes', () => {
  const m = JSON.parse(read('../module.json'));
  assert.equal(m.version, '0.94.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.94.0/ashen-gate-manager.zip'));
  const log = read('../CHANGELOG.md');
  assert.match(log, /^## 0\.94\.0 /m);
  assert.match(log.split('## 0.93.0')[0], /NPC Codex/); assert.match(log.split('## 0.93.0')[0], /dock/i);
  assert.doesNotMatch(log.split('## 0.93.0')[0], /\b(Alpha|Beta|Preview)\b/);
  assert.match(read('../README.md'), /0\.94\.0/);
  assert.match(read('../scripts/main.js'), /stays in front of Ashen Gate and Foundry windows/);
});
