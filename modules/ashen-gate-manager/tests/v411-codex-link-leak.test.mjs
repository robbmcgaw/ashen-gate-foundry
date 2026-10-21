/**
 * 0.41.1 security: a player's NPC Codex never carries the name or id of a linked record that player cannot already see
 * in the owning module (Locations, Quest Log, Renown, NPC Codex). Proves logic with mocked Foundry and mocked partner
 * APIs, not the live Forge UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setReveal, normalizeState, playerEntry, renderPlayerCodexHtml, resolvePlayerLinks, UNKNOWN_LINK} from '../scripts/codex.js';
import {createCodexService} from '../scripts/codex-service.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const M = 'ashen-gate-manager', L = 'ashen-gate-locations', Q = 'ashen-gate-quest-manager', R = 'ashen-gate-factions';
const LINKS = ['LOC-TEST-SEEN', 'LOC-TEST-SECRET', 'QUEST-TEST-SEEN', 'QUEST-TEST-SECRET', 'FAC-TEST-SEEN', 'FAC-TEST-SECRET',
  'FAC-TEST-MASKED', 'NPC-TEST-FRIEND', 'NPC-TEST-SECRET', 'DEITY-TEST-SECRET'];
const SECRETS = ['LOC-TEST-SECRET', 'QUEST-TEST-SECRET', 'FAC-TEST-SECRET', 'FAC-TEST-MASKED', 'NPC-TEST-SECRET', 'DEITY-TEST-SECRET', 'SECRET-'];
const revealed = (links = true) => {
  let s = setReveal(normalizeState(null), 'discovery', {mode: 'party'});
  return links ? setReveal(s, 'links', {mode: 'party'}) : s;
};
const noSecret = (value, msg) => { const text = JSON.stringify(value); for (const s of SECRETS) assert.ok(!text.includes(s), `${msg}: ${s} leaked`); };

/** Partner APIs as each module ships them: a GM caller gets everything, a player only their own filtered view. */
function partners(game, {fail = false} = {}) {
  const gm = () => game.user.isGM;
  const boom = () => { if (fail) throw new Error('partner broke'); };
  const locs = [{id: 'LOC-TEST-SEEN', name: '[TEST] Seen Gate'}, {id: 'LOC-TEST-SECRET', name: 'SECRET-LOC'}];
  const quests = [{id: 'QUEST-TEST-SEEN', name: '[TEST] Seen Errand'}, {id: 'QUEST-TEST-SECRET', name: 'SECRET-QUEST'}];
  const facs = [{id: 'FAC-TEST-SEEN', name: '[TEST] Seen Guild'}, {id: 'FAC-TEST-SECRET', name: 'SECRET-FAC'}, {id: 'FAC-TEST-MASKED', name: 'SECRET-MASKED'}];
  return new Map([
    [L, {active: true, api: {
      getLocation: id => { boom(); return gm() ? locs.find(l => l.id === id) ?? null : id === 'LOC-TEST-SEEN' ? locs[0] : null; },
      listLocations: () => { boom(); return gm() ? locs : [locs[0], {key: 'pin-x', state: 'unidentified', name: 'Unidentified place'}]; }}}],
    [Q, {active: true, api: {
      listQuests: () => { boom(); if (!gm()) throw new Error('GM only'); return quests; },
      listVisible: () => { boom(); return gm() ? quests : [quests[0]]; }}}],
    [R, {active: true, api: {
      getFactions: () => { boom(); return gm() ? facs : [facs[0], {id: 'FAC-TEST-MASKED', name: 'Unknown Organization'}]; },
      getDeities: () => { boom(); return gm() ? [{id: 'DEITY-TEST-SECRET', name: 'SECRET-DEITY'}] : []; },
      getPantheon: () => { boom(); return []; }}}],
    [M, {active: true}]
  ]);
}

function world({isGM = true, fail = false, partnersOn = true} = {}) {
  const npcActor = (def, state) => ({id: def.id, uuid: `Actor.${def.id}`, name: def.name, img: null, type: 'npc',
    getFlag: (m, k) => k === 'source' ? {definition: def} : k === 'codex' ? state : null, setFlag: async () => {}});
  const priest = npcActor({id: 'NPC-TEST-PRIEST', entity_type: 'NPC', name: '[TEST] Priest', role: '[TEST] Keeper', codex: {links: LINKS}}, revealed());
  const friend = npcActor({id: 'NPC-TEST-FRIEND', entity_type: 'NPC', name: '[TEST] Friend'}, revealed(false));
  const secret = npcActor({id: 'NPC-TEST-SECRET', entity_type: 'NPC', name: 'SECRET-NPC'}, null);
  const ash = {id: 'a1', name: '[TEST] Ash', type: 'character', hasPlayerOwner: true, getFlag: () => null, testUserPermission: u => u.id === 'u1'};
  const users = {u1: {id: 'u1', isGM: false}};
  const game = {user: {id: isGM ? 'gm' : 'u1', isGM, character: null}, users: {get: id => users[id]},
    actors: {contents: [priest, friend, secret, ash]}, settings: {get: () => true}};
  game.modules = partnersOn ? partners(game, {fail}) : new Map([[M, {active: true}]]);
  return {game, svc: createCodexService({game, moduleId: M})};
}
const linksOfEntry = entries => entries.find(e => e.id === 'NPC-TEST-PRIEST').fields.find(f => f.key === 'links').links;

test('GM side, no claims from the player: nothing unseen reaches the player, not even its id', () => {
  const {svc} = world();
  const links = linksOfEntry(svc.forUser('u1'));
  noSecret(links, 'forUser');
  assert.equal(links.length, LINKS.length, 'every connection still shows, as Unknown when not known');
  assert.deepEqual(links.find(l => l.name === '[TEST] Friend'), {id: 'NPC-TEST-FRIEND', kind: 'npc', name: '[TEST] Friend'}, 'a discovered NPC is named');
  for (const l of links.filter(l => l.unknown)) assert.deepEqual(Object.keys(l).sort(), ['id', 'kind', 'name', 'unknown'].sort());
  assert.ok(links.filter(l => l.unknown).every(l => l.id === null && l.name === UNKNOWN_LINK));
});

test('Preview as player (GM) leaks nothing either, party level and per character', () => {
  const {svc} = world();
  noSecret(svc.previewAs([]), 'previewAs party');
  noSecret(svc.previewAs(['a1']), 'previewAs character');
  noSecret(svc.forPlayer ? linksOfEntry(svc.previewAs([])) : [], 'GM forPlayer');
});

test('GM side with claims: only ids the player claims (from their own client) come back, with no GM-side name', () => {
  const {svc} = world();
  const links = linksOfEntry(svc.forUser('u1', {known: ['LOC-TEST-SEEN', 'QUEST-TEST-SEEN', 'FAC-TEST-SEEN', 'not an id', 42]}));
  noSecret(links, 'claims');
  for (const id of ['LOC-TEST-SEEN', 'QUEST-TEST-SEEN', 'FAC-TEST-SEEN']) assert.deepEqual(links.find(l => l.id === id), {id, kind: links.find(l => l.id === id).kind, name: null});
  // A claim never names an NPC or a deity: those are checked GM-side only.
  noSecret(linksOfEntry(svc.forUser('u1', {known: ['NPC-TEST-SECRET', 'DEITY-TEST-SECRET']})), 'npc/deity claims ignored');
});

test('player end to end: names come from the player\'s own Locations, Quest Log and Renown views; the rest is Unknown', async () => {
  const gmSide = world();
  const pl = world({isGM: false});
  let sent = null;
  pl.game.users.activeGM = {query: async (name, data) => { sent = data; return gmSide.svc.handleQuery(data, {userId: 'u1'}); }};
  const entries = await pl.svc.forPlayer();
  noSecret(entries, 'player result');
  noSecret(sent, 'player claims');
  const links = linksOfEntry(entries);
  assert.deepEqual(links.filter(l => !l.unknown).map(l => l.name).sort(),
    ['[TEST] Friend', '[TEST] Seen Errand', '[TEST] Seen Gate', '[TEST] Seen Guild']);
  assert.equal(links.filter(l => l.unknown).length, 6, 'secret loc, quest, faction, masked faction, npc and deity');
  const html = renderPlayerCodexHtml(entries);
  noSecret(html, 'player html');
  assert.match(html, /ag-codex-link is-unknown[^>]*>Unknown</);
});

test('owning module missing or failing: every link it owns is Unknown, nothing throws', async () => {
  for (const opts of [{fail: true}, {partnersOn: false}]) {
    const gmSide = world(opts), pl = world({isGM: false, ...opts});
    pl.game.users.activeGM = {query: async (n, data) => gmSide.svc.handleQuery(data, {userId: 'u1'})};
    const links = linksOfEntry(await pl.svc.forPlayer());
    noSecret(links, JSON.stringify(opts));
    assert.deepEqual(links.filter(l => !l.unknown).map(l => l.name), ['[TEST] Friend']);
  }
});

test('pure model: no resolver means every link is Unknown; resolvePlayerLinks fills only names the client knows', () => {
  const def = {id: 'NPC-TEST-PRIEST', entity_type: 'NPC', name: '[TEST] Priest', codex: {links: ['LOC-TEST-SEEN', 'LOC-TEST-SECRET']}};
  const links = playerEntry({def, state: revealed()}, []).fields[0].links;
  assert.ok(links.every(l => l.unknown && l.id === null));
  const claimed = [{id: 'X', name: 'X', img: null, fields: [{key: 'links', links: [{id: 'LOC-TEST-SEEN', kind: 'location', name: null}, {id: 'LOC-TEST-GONE', kind: 'location', name: null}]}]}];
  const out = resolvePlayerLinks(claimed, new Map([['LOC-TEST-SEEN', '[TEST] Seen Gate']]));
  assert.deepEqual(out[0].fields[0].links, [{id: 'LOC-TEST-SEEN', kind: 'location', name: '[TEST] Seen Gate'},
    {id: null, kind: 'location', name: UNKNOWN_LINK, unknown: true}]);
});

test('docs describe the player link filter (version checks live in the newest test)', () => {
  assert.match(read('../../../docs/npc-codex-schema.md'), /What a player sees of a link/);
  assert.match(read('../CHANGELOG.md'), /## 0\.41\.1/);
});
