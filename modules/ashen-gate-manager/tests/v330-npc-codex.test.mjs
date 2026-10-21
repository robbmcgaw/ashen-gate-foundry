import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeState, setReveal, setDetails, playerEntry, playerCodex, gmEntry, linksOf, buildCodexExport,
  planRevealsImport, renderPlayerCodexHtml, REVEAL_FIELDS, GM_FIELDS, CODEX_EXPORT_SCHEMA} from '../scripts/codex.js';
import {createCodexService, CODEX_ACCESS_SETTING} from '../scripts/codex-service.js';

// Shaped like the GPT-drafted NPC records (role, appearance, portrayal, wants, knows, signature_line,
// session_role, gm_notes[], stat_block, art), with the additive codex block. Synthetic data only.
const def = (over = {}) => ({
  id: 'NPC-TEST-MIRA', entity_type: 'NPC', status: 'draft', version: '0.1.0', visibility: 'gm', scope: 'setting_adapter',
  refs: [{relation: 'found_at', target_id: 'LOC-TEST-FERRY', mode: 'optional'}],
  name: '[TEST] Mira Vane', role: 'Ferry clerk', appearance: 'Ink-stained cuffs.', portrayal: 'SECRET-PORTRAYAL',
  wants: 'Her brother off the roster.', knows: 'SECRET-KNOWS', signature_line: 'Coin or names.',
  session_role: 'SECRET-SESSION', gm_notes: ['SECRET-NOTE-1'], stat_block: 'Commoner (2024)', art: {repo_path: null, forge_path: null},
  ...over
});
const npc = (state = null, over = {}) => ({def: def(over), state, uuid: 'Actor.mira', img: 'mira.webp', name: 'Mira'});

test('0.33.0: default_reveal applies only until the GM saves; saved state always wins (re-import safe)', () => {
  const d = def({codex: {default_reveal: {discovery: 'party', fields: {role: 'party'}}}});
  const fresh = normalizeState(null, d);
  assert.equal(fresh.discovery.party, true);
  assert.equal(fresh.fields.role.party, true);
  assert.equal(fresh.fields.wants.party, false);
  const saved = setReveal(fresh, 'discovery', {mode: 'hidden'});
  assert.equal(normalizeState(saved, d).discovery.party, false, 'a later import with a default never resets a saved choice');
  assert.deepEqual(Object.keys(fresh.fields), [...REVEAL_FIELDS]);
});

test('0.33.0: reveals are hidden, party or characters; GM-only fields can never be revealed', () => {
  let s = normalizeState(null);
  s = setReveal(s, 'wants', {mode: 'actor', actorId: 'a1'});
  s = setReveal(s, 'wants', {mode: 'actor', actorId: 'a2'});
  assert.deepEqual(s.fields.wants, {party: false, actors: ['a1', 'a2']});
  s = setReveal(s, 'wants', {mode: 'actor', actorId: 'a1', on: false});
  assert.deepEqual(s.fields.wants.actors, ['a2']);
  s = setReveal(s, 'wants', {mode: 'party'});
  assert.equal(s.fields.wants.party, true);
  s = setReveal(s, 'wants', {mode: 'hidden'});
  assert.deepEqual(s.fields.wants, {party: false, actors: []});
  for (const key of GM_FIELDS) assert.throws(() => setReveal(s, key, {mode: 'party'}), /GM-only/);
});

test('0.33.0: a player gets only revealed fields for their own characters, never GM fields or notes', () => {
  let s = normalizeState(null);
  assert.equal(playerEntry(npc(s), ['a1']), null, 'undiscovered NPC is not sent at all');
  s = setReveal(s, 'discovery', {mode: 'party'});
  s = setReveal(s, 'role', {mode: 'party'});
  s = setReveal(s, 'wants', {mode: 'actor', actorId: 'a1'});
  s = setDetails(s, {notes: 'SECRET-GM-OWN-NOTE', learned: 'Logs crossings twice.'}).state;
  const p1 = playerEntry(npc(s), ['a1']), p2 = playerEntry(npc(s), ['a2']);
  assert.deepEqual(p1.fields.map(f => f.key), ['role', 'wants']);
  assert.equal(p1.fields.find(f => f.key === 'wants').onlyYou, true);
  assert.deepEqual(p2.fields.map(f => f.key), ['role'], 'another character does not get a per-character field');
  const wire = JSON.stringify([p1, p2]);
  for (const secret of ['SECRET-PORTRAYAL', 'SECRET-KNOWS', 'SECRET-SESSION', 'SECRET-NOTE-1', 'SECRET-GM-OWN-NOTE', 'Commoner', 'Logs crossings'])
    assert.ok(!wire.includes(secret), `${secret} must not reach a player`);
  s = setReveal(s, 'learned', {mode: 'party'});
  assert.equal(playerEntry(npc(s), []).fields.find(f => f.key === 'learned').value, 'Logs crossings twice.');
  const discoveredByOne = setReveal(normalizeState(null), 'discovery', {mode: 'actor', actorId: 'a1'});
  assert.ok(playerEntry(npc(discoveredByOne), ['a1']));
  assert.equal(playerEntry(npc(discoveredByOne), ['a2']), null);
  assert.equal(playerEntry(npc(discoveredByOne), []), null, 'party-level view does not include a one-character discovery');
});

test('0.33.0: connections come from codex.links, refs and GM-added ids; shown to players only when revealed', () => {
  let s = setDetails(normalizeState(null), {links: 'quest-test-ledger  not-an-id NPC-TEST-MIRA'});
  assert.deepEqual(s.rejected, ['NOT-AN-ID']);
  const d = def({codex: {links: ['FAC-TEST-WARDENS']}});
  assert.deepEqual(linksOf(d, s.state), ['FAC-TEST-WARDENS', 'LOC-TEST-FERRY', 'QUEST-TEST-LEDGER'], 'self-links dropped');
  let st = setReveal(s.state, 'discovery', {mode: 'party'});
  const nameOf = id => ({'LOC-TEST-FERRY': '[TEST] Ferry Gate'}[id] ?? null);
  assert.equal(playerEntry({def: d, state: st}, [], {nameOf}).fields.length, 0);
  st = setReveal(st, 'links', {mode: 'party'});
  const links = playerEntry({def: d, state: st}, [], {nameOf}).fields[0].links;
  assert.deepEqual(links.map(l => l.name), ['FAC-TEST-WARDENS', '[TEST] Ferry Gate', 'QUEST-TEST-LEDGER']);
  const gm = gmEntry({def: d, state: st}, {nameOf, characters: [{id: 'a1', name: '[TEST] Ash'}]});
  assert.equal(gm.links.find(l => l.id === 'QUEST-TEST-LEDGER').gmAdded, true);
  assert.deepEqual(gm.gmFields.map(f => f.key), ['portrayal', 'session_role', 'stat_block', 'gm_notes']);
});

test('0.33.0: export holds definitions and reveals; restore touches only NPCs in the world and validates the file', () => {
  const s = setReveal(normalizeState(null), 'discovery', {mode: 'party'});
  const file = buildCodexExport([npc(s)], {exportedAt: 'T'});
  assert.equal(file.schema_version, CODEX_EXPORT_SCHEMA);
  assert.equal(file.definitions[0].portrayal, 'SECRET-PORTRAYAL', 'GM file keeps GM fields');
  assert.equal(file.reveals['NPC-TEST-MIRA'].discovery.party, true);
  const plan = planRevealsImport({...file, reveals: {...file.reveals, 'NPC-TEST-GONE': {}}}, ['NPC-TEST-MIRA']);
  assert.deepEqual(plan.apply.map(a => a.id), ['NPC-TEST-MIRA']);
  assert.deepEqual(plan.missing, ['NPC-TEST-GONE']);
  assert.match(planRevealsImport({schema_version: 'x'}, []).errors.join(' '), /schema_version/);
});

test('0.33.0: player markup escapes text and marks per-character fields', () => {
  const html = renderPlayerCodexHtml([{id: 'NPC-X', name: '<b>[TEST]</b> Eve', img: null,
    fields: [{key: 'role', value: 'Clerk'}, {key: 'wants', label: 'Wants', value: 'a & b', onlyYou: true}]}]);
  assert.ok(html.includes('&lt;b&gt;[TEST]&lt;/b&gt; Eve'));
  assert.ok(html.includes('a &amp; b'));
  assert.match(html, /only you/);
  assert.match(renderPlayerCodexHtml([]), /No one has been added/);
});

function world({isGM = true, access = true} = {}) {
  const flags = new Map();
  const mira = {id: 'mira', uuid: 'Actor.mira', name: 'Mira', img: 'm.webp', type: 'npc',
    getFlag: (m, k) => k === 'source' ? {sourceId: 'NPC-TEST-MIRA', definition: def()} : flags.get(k) ?? null,
    setFlag: async (m, k, v) => { flags.set(k, structuredClone(v)); }};
  const ash = {id: 'a1', name: '[TEST] Ash', type: 'character', hasPlayerOwner: true, getFlag: () => null, testUserPermission: u => u.id === 'u1'};
  const bo = {id: 'a2', name: '[TEST] Bo', type: 'character', hasPlayerOwner: true, getFlag: () => null, testUserPermission: u => u.id === 'u2'};
  const users = new Map([['u1', {id: 'u1', isGM: false}], ['u2', {id: 'u2', isGM: false}], ['gm', {id: 'gm', isGM: true}]]);
  const game = {user: {id: isGM ? 'gm' : 'u1', isGM}, actors: {contents: [mira, ash, bo]}, users, modules: new Map(),
    settings: {get: (m, k) => k === CODEX_ACCESS_SETTING ? access : null}};
  return {game, flags, svc: createCodexService({game, moduleId: 'ashen-gate-manager'})};
}

test('0.33.0: service writes only for a GM, to the NPC Actor flag; player requests are re-checked on the GM side', async () => {
  const {game, flags, svc} = world();
  assert.deepEqual(svc.characters().map(c => c.id), ['a1', 'a2']);
  await svc.setReveal('NPC-TEST-MIRA', 'discovery', {mode: 'party'});
  await svc.setReveal('NPC-TEST-MIRA', 'wants', {mode: 'actor', actorId: 'a1'});
  assert.equal(flags.get('codex').discovery.party, true);
  assert.deepEqual(svc.forUser('u1')[0].fields.map(f => f.key), ['wants']);
  assert.deepEqual(svc.forUser('u2')[0].fields, []);
  assert.equal((await svc.handleQuery({}, {userId: 'nobody'})).ok, false);
  game.settings.get = () => false;
  assert.match((await svc.handleQuery({}, {userId: 'u1'})).message, /not shared/);
  await assert.rejects(svc.setReveal('NPC-TEST-NOPE', 'role', {mode: 'party'}), /No NPC/);
});

test('0.33.0: a player cannot read or write GM data and gets the codex only through the active GM', async () => {
  const {game, svc} = world({isGM: false});
  assert.throws(() => svc.list(), /Only a GM/);
  await assert.rejects(svc.setReveal('NPC-TEST-MIRA', 'role', {mode: 'party'}), /Only a GM/);
  assert.throws(() => svc.exportAll(), /Only a GM/);
  await assert.rejects(svc.forPlayer(), /needs a GM/);
  let asked = null;
  game.users.activeGM = {query: async (name, data) => { asked = name; return {ok: true, entries: [{id: 'NPC-TEST-MIRA'}]}; }};
  assert.deepEqual(await svc.forPlayer(), [{id: 'NPC-TEST-MIRA'}]);
  assert.equal(asked, 'ashen-gate-manager.codexForPlayer');
  game.settings.get = () => false;
  await assert.rejects(svc.forPlayer(), /not shared/);
});

test('0.33.0: Codex sits in the Library rail with labelled hide confirmation and a GM Setup access switch', () => {
  const tpl = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  const views = fs.readFileSync(new URL('../scripts/item-filters.js', import.meta.url), 'utf8');
  assert.match(views, /\{id: 'codex', label: 'NPC Codex'/); // 0.36.0: Items rail (was the Library rail)
  for (const hook of ['data-ag-codex-reveal="{{key}}"', 'data-ag-codex-actor="{{../key}}"', 'data-ag-codex-preview', 'data-ag-codex-import',
    'data-ag-action="codex-save"', 'data-ag-action="codex-export"', 'data-ag-codex-access'])
    assert.ok(tpl.includes(hook), hook);
  assert.match(main, /yes:\{label:'Hide from players'\}/);
  assert.match(main, /CONFIG\.queries\[CODEX_QUERY\]/);
});

test('0.33.0: Codex state never leaves through the world export or gets written by import/update code', async () => {
  const {buildWorldExport} = await import('../scripts/world-export.js');
  const doc = {documentName: 'Actor', type: 'npc', name: '[TEST] Mira', uuid: 'Actor.m', folder: null, ownership: {default: 0}, system: {},
    flags: {'ashen-gate-manager': {source: {sourceId: 'NPC-TEST-MIRA', visibility: 'gm'}, codex: {notes: 'SECRET-CODEX-NOTE'}}},
    toObject() { return {system: this.system, flags: this.flags}; }};
  const coll = list => ({contents: list});
  const g = {user: {isGM: true}, world: {id: 'w'}, version: '14', system: {version: '6.0.6'}, items: coll([]), journal: coll([]),
    actors: coll([doc]), tables: coll([]), macros: coll([]), folders: coll([]), modules: new Map(), settings: {get: () => null, set: async () => {}}};
  const text = JSON.stringify(buildWorldExport(g, {now: new Date('2026-10-20T00:00:00Z')}).file);
  assert.ok(text.includes('NPC-TEST-MIRA'));
  assert.ok(!text.includes('SECRET-CODEX-NOTE'));
  for (const f of ['main.js', 'actor-update.js']) {
    const src = fs.readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /flags\.\$\{MODULE_ID\}\.codex|\[MODULE_ID\]:\s*\{[^}]*codex/, `${f} never writes the codex flag`);
  }
});
