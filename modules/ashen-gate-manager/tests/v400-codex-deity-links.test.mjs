/** 0.40.0: NPC Codex links to Renown deities (DEITY-*). Proves logic with mocked Foundry and a mocked Renown API, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isLinkId, linkKind, setDetails, setReveal, normalizeState, playerEntry, gmEntry, renderPlayerCodexHtml, UNKNOWN_DEITY} from '../scripts/codex.js';
import {createCodexService} from '../scripts/codex-service.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const M = 'ashen-gate-manager', R = 'ashen-gate-factions';
const def = (over = {}) => ({id: 'NPC-TEST-PRIEST', entity_type: 'NPC', name: '[TEST] Priest', role: '[TEST] Keeper', refs: [],
  codex: {links: ['DEITY-TEST-SUN', 'DEITY-TEST-MOON', 'LOC-TEST-SHRINE']}, ...over});
const revealed = () => setReveal(setReveal(normalizeState(null), 'discovery', {mode: 'party'}), 'links', {mode: 'party'});

test('DEITY-* is a linkable id of kind deity; GM can add one by hand', () => {
  assert.equal(isLinkId('DEITY-TEST-SUN'), true);
  assert.equal(linkKind('DEITY-TEST-SUN'), 'deity');
  assert.equal(isLinkId('DEITY'), false);
  const {state, rejected} = setDetails(normalizeState(null), {links: 'deity-test-sun ITEM-TEST-X'});
  assert.deepEqual(state.links, ['DEITY-TEST-SUN']);
  assert.deepEqual(rejected, ['ITEM-TEST-X']);
});

test('a player gets a deity link only when Renown says they discovered it; otherwise no id and no name', () => {
  const nameOf = id => ({'DEITY-TEST-SUN': '[TEST] Sun', 'DEITY-TEST-MOON': 'SECRET-MOON'}[id] ?? null);
  const deityName = id => id === 'DEITY-TEST-SUN' ? '[TEST] Sun' : null;
  const links = playerEntry({def: def(), state: revealed()}, ['a1'], {nameOf, deityName}).fields[0].links;
  assert.deepEqual(links[0], {id: 'DEITY-TEST-SUN', kind: 'deity', name: '[TEST] Sun'});
  assert.deepEqual(links[1], {id: null, kind: 'deity', name: UNKNOWN_DEITY, unknown: true});
  assert.ok(!JSON.stringify(links).includes('MOON'), 'undiscovered deity id and name never reach the player');
  // Default (no deityName): every deity link is Unknown.
  const safe = playerEntry({def: def(), state: revealed()}, ['a1'], {nameOf}).fields[0].links;
  assert.ok(safe.filter(l => l.kind === 'deity').every(l => l.unknown && l.id === null));
});

test('player markup: openable deity is a link, others plain text with a tooltip, unknown shows Unknown', () => {
  const entry = {id: 'NPC-TEST-PRIEST', name: '[TEST] Priest', img: null, fields: [{key: 'links', label: 'Connections',
    links: [{id: 'DEITY-TEST-SUN', kind: 'deity', name: '[TEST] Sun'}, {id: null, kind: 'deity', name: 'Unknown', unknown: true}, {id: 'LOC-TEST-SHRINE', kind: 'location', name: '[TEST] Shrine'}]}]};
  const open = renderPlayerCodexHtml([entry], {deityLink: () => ({open: true, title: 'Open in the Renown Pantheon'})});
  assert.match(open, /data-ag-codex-deity="DEITY-TEST-SUN"[^>]*>.*\[TEST\] Sun/);
  assert.match(open, /is-unknown" title="A deity you have not discovered yet\.">Unknown</);
  assert.equal((open.match(/data-ag-codex-deity/g) ?? []).length, 1);
  const plain = renderPlayerCodexHtml([entry]);
  assert.doesNotMatch(plain, /data-ag-codex-deity/, 'default never links');
  assert.match(plain, /title="Renown is not active[^"]*">\[TEST\] Sun</);
  const masked = renderPlayerCodexHtml([entry], {deityLink: () => ({open: false, unknown: true})});
  assert.doesNotMatch(masked, /\[TEST\] Sun/, 'client-side Renown says unknown: shown as Unknown');
});

function world({isGM = true, renown = true, playerHidden = false} = {}) {
  const calls = [];
  const flags = new Map([['codex', revealed()]]);
  const priest = {id: 'p', uuid: 'Actor.p', name: 'P', img: null, type: 'npc',
    getFlag: (m, k) => k === 'source' ? {definition: def()} : flags.get(k) ?? null, setFlag: async () => {}};
  const ash = {id: 'a1', name: '[TEST] Ash', type: 'character', hasPlayerOwner: true, getFlag: () => null, testUserPermission: u => u.id === 'u1'};
  const bo = {id: 'a2', name: '[TEST] Bo', type: 'character', hasPlayerOwner: true, getFlag: () => null, testUserPermission: u => u.id === 'u2'};
  const users = {u1: {id: 'u1', isGM: false}, u2: {id: 'u2', isGM: false}};
  // Renown's public API. GM: getDeities = all; getPantheon(actor) = deities discovered by party or that actor.
  const known = {a1: ['DEITY-TEST-SUN', 'DEITY-TEST-MOON'], a2: ['DEITY-TEST-SUN']};
  const all = [{id: 'DEITY-TEST-SUN', name: '[TEST] Sun'}, {id: 'DEITY-TEST-MOON', name: 'SECRET-MOON'}];
  const api = {
    open: opts => calls.push(opts),
    getDeities: () => { if (playerHidden) throw new Error('Renown is hidden from players.'); return isGM ? all : all.filter(d => known.a2.includes(d.id)); },
    getPantheon: a => (known[typeof a === 'string' ? a : a?.id] ?? []).map(id => all.find(d => d.id === id))
  };
  const game = {user: {id: isGM ? 'gm' : 'u2', isGM, character: null}, users: {get: id => users[id]},
    actors: {contents: [priest, ash, bo]}, settings: {get: () => true},
    modules: new Map([[R, {active: renown, api}], [M, {active: true}]])};
  return {game, calls, svc: createCodexService({game, moduleId: M})};
}

test('GM side: each player gets only the deities their characters discovered; party view = what every character knows', () => {
  const {svc} = world();
  const names = e => e[0].fields[0].links.filter(l => l.kind === 'deity').map(l => l.name);
  assert.deepEqual(names(svc.forUser('u1')), ['[TEST] Sun', 'SECRET-MOON']);
  assert.deepEqual(names(svc.forUser('u2')), ['[TEST] Sun', 'Unknown']);
  assert.ok(!JSON.stringify(svc.forUser('u2')).includes('MOON'));
  assert.deepEqual(names(svc.previewAs([])), ['[TEST] Sun', 'Unknown']);
  // GM entry names deities and marks the kind.
  assert.deepEqual(svc.list()[0].links.filter(l => l.kind === 'deity').map(l => l.name), ['[TEST] Sun', 'SECRET-MOON']);
});

test('Renown missing: deity links stay Unknown for players, plain text for the GM; nothing throws', () => {
  const {svc} = world({renown: false});
  assert.ok(svc.forUser('u1')[0].fields[0].links.filter(l => l.kind === 'deity').every(l => l.unknown));
  const gm = gmEntry({def: def(), state: revealed()});
  assert.deepEqual(gm.links.filter(l => l.kind === 'deity').map(l => [l.name, l.named]), [['DEITY-TEST-SUN', false], ['DEITY-TEST-MOON', false]]);
  assert.deepEqual(svc.deityLinks()({id: 'DEITY-TEST-SUN'}), {open: false, title: 'Renown is not active, so this deity cannot be opened.'});
  assert.throws(() => svc.openDeity('DEITY-TEST-SUN'), /Renown is not active/);
});

test('client: deity opens Renown Pantheon via api.open; a player cannot open one they have not discovered', () => {
  const gm = world();
  const how = gm.svc.deityLinks();
  assert.equal(how({id: 'DEITY-TEST-SUN'}).open, true);
  assert.match(how({id: 'DEITY-TEST-GONE'}).title, /not in this world/);
  gm.svc.openDeity('DEITY-TEST-SUN');
  assert.deepEqual(gm.calls, [{deityId: 'DEITY-TEST-SUN', tab: 'pantheon'}]);

  const pl = world({isGM: false});
  const ph = pl.svc.deityLinks();
  assert.equal(ph({id: 'DEITY-TEST-SUN'}).open, true);
  assert.equal(ph({id: 'DEITY-TEST-MOON'}).unknown, true);
  pl.svc.openDeity('DEITY-TEST-SUN');
  assert.deepEqual(pl.calls, [{deityId: 'DEITY-TEST-SUN', actorId: 'a2', tab: 'pantheon'}]);
  assert.throws(() => pl.svc.openDeity('DEITY-TEST-MOON'), /not discovered/);

  const hidden = world({isGM: false, playerHidden: true});
  assert.deepEqual(hidden.svc.deityLinks()({id: 'DEITY-TEST-SUN'}), {open: false, title: 'Renown is hidden from players right now.'});
});

test('docs, template and version 0.40.0 are consistent', () => {
  assert.match(read('../../../docs/npc-codex-schema.md'), /`DEITY-`/);
  assert.match(read('../templates/manager.hbs'), /data-ag-codex-deity/);
  const manifest = JSON.parse(read('../module.json'));
  assert.equal(manifest.version, '0.40.0');
  assert.match(manifest.download, /ashen-gate-manager-v0\.40\.0\/ashen-gate-manager\.zip$/);
  assert.match(read('../templates/manager.hbs'), /v0\.40\.0 Beta/);
  assert.match(read('../scripts/main.js'), /General Manager v0\.40\.0 Beta/);
  assert.match(read('../scripts/main.js'), /v0\.40\.0 ready/);
});
