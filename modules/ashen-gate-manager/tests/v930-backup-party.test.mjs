// 0.93.0: Back up world: party.json (players' character sheets, play state). Mocked Foundry globals and a mocked GitHub (fetch); synthetic [TEST] data only.
// Proves logic, not the live Forge dialog, real character sheets or a real commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as bk from '../scripts/github-backup.js';
import {plainText, PARTY_SCHEMA} from '../scripts/party-sheets.js';
import {confirmHint, exportView} from '../scripts/backup-view.js';

const TOKEN = 'github_pat_TESTBACKUP0123456789abcdef';
const sha = n => String(n).padStart(40, '0');
const H = {commit: sha(1), tree: sha(2), newTree: sha(3), newCommit: sha(4)};
const mkStore = (init = {}) => { const data = {backupToken: TOKEN, backupConfig: {repo: 'owner/priv', branch: 'world-backup'}, backupLast: {}, ...init}; return {data, get: k => data[k], set: async (k, v) => { data[k] = v; }}; };
const list = contents => ({contents, get: id => contents.find(x => x.id === id), [Symbol.iterator]: () => contents[Symbol.iterator]()});
const item = (type, name, system = {}) => ({id: `i-${name}`, type, name, system});
const users = [{id: 'gm1', name: '[TEST] GM', isGM: true}, {id: 'p1', name: '[TEST] Zed', isGM: false}, {id: 'p2', name: '[TEST] Amy', isGM: false}];
const HERO_DESC = `<p>You gain <strong>power</strong> &amp; @UUID[Item.abc]{Fury}.</p><p>Roll [[/r 1d6]] damage.<br>Done&nbsp;now.</p>`;
function hero(id, name, ownership, extra = {}) {
  return {id, name, type: 'character', ownership, system: {
    details: {level: 3, biography: {value: 'SECRET BIO'}},
    abilities: {wis: {value: 14, mod: 2, proficient: 1, save: {value: 5}}, str: {value: 10, mod: 0, proficient: 0, save: {value: 0}}},
    skills: {prc: {value: 1, ability: 'wis'}, acr: {value: 0, ability: 'dex'}},
    attributes: {hp: {value: 7, max: 24, tempmax: 2}, ac: {value: 16}, movement: {walk: 30, fly: 0, units: 'ft'}, init: {total: 2}},
    traits: {armorProf: {value: new Set(['lgt', 'med']), custom: 'Odd Mail'}, weaponProf: {value: new Set(['sim'])}, languages: {value: new Set(['common']), custom: ''}},
    tools: {thief: {value: 1}, herb: {value: 0}},
    currency: {pp: 0, gp: 12, ep: 0, sp: 3, cp: 1}},
    flags: {secret: 'FLAG'}, effects: [{name: 'EFFECT'}],
    items: [
      item('class', '[TEST] Cleric', {identifier: 'cleric', levels: 3}), item('subclass', '[TEST] Order', {classIdentifier: 'cleric'}),
      item('race', '[TEST] Species'), item('background', '[TEST] Soldier'),
      item('feat', 'Zeal', {identifier: 'zeal', source: {book: 'PHB', custom: 'Ashen Gate'}, activities: list([{activation: {type: 'bonus'}}]), description: {value: HERO_DESC}}),
      item('feat', 'Alert', {identifier: 'alert', source: {custom: ''}, description: {value: 'x'.repeat(2000)}}),
      item('spell', 'Bless', {level: 1, prepared: 1, method: 'spell', school: 'enc'}), item('spell', 'Aid', {level: 2, prepared: 0, school: 'abj'}),
      item('weapon', 'Mace', {quantity: 1, equipped: true, attuned: false, rarity: 'common', description: {value: 'LONG TEXT'}}),
      item('loot', 'Gem', {quantity: 4}), item('class', '[TEST] Fighter', {identifier: 'fighter', levels: 1}),
      ...(extra.items ?? [])
    ]};
}
const ACTORS = () => [
  hero('a2', '[TEST] Zoe', {p1: 3, default: 0}),
  hero('a1', '[TEST] Ada', {p2: 3, gm1: 3}),
  hero('a3', '[TEST] GmOwned', {gm1: 3}),
  hero('a4', '[TEST] Observer', {p1: 2}),
  hero('a5', '[TEST] DefaultOnly', {default: 3}),
  {...hero('a6', '[TEST] Npc', {p1: 3}), type: 'npc'}
];
const LEDGER = () => ({getProfessions: () => [{professionId: 'PROF-TEST-B', name: 'B', level: 2, xp: 5, tier: 'apprentice', unspentPerkChoices: 1}, {professionId: 'PROF-TEST-A', name: 'A', level: 1, xp: 0, tier: 'novice', unspentPerkChoices: 0}],
  getProfessionProgress: (actor, id) => ({selectedPerkIds: id === 'PROF-TEST-B' ? ['PERK-TEST-2', 'PERK-TEST-1'] : []})});
const CINDERS = () => ({cinder: {list: () => [{instanceId: 'inst1', definitionId: 'MUT-TEST', name: '[TEST] Cinder', art: 'big.webp', powers: [{powerId: 'P2', name: 'Zap', modes: [1]}, {powerId: 'P1', name: 'Arc'}], enhancements: []}]}});
const TREES = () => ({pointsSummary: () => [{treeId: 'TREE-TEST', name: '[TEST] Tree', kind: 'generic_points', level: null, earned: 2, spent: 1, available: 1}]});
function mkGame({user = {isGM: true}, actors = ACTORS(), mods = {ledger: LEDGER(), cinders: CINDERS(), trees: TREES()}} = {}) {
  const m = new Map();
  if (mods.ledger) m.set('ashen-gate-profession-ledger', {active: true, api: mods.ledger});
  if (mods.cinders) m.set('ashen-gate-cinders', {active: true, api: mods.cinders});
  if (mods.trees) m.set('ashen-gate-skill-trees', {active: true, api: mods.trees});
  return {user, world: {id: 'w'}, users: {get: id => users.find(u => u.id === id)}, modules: m, actors: list(actors), items: list([]), journal: list([]), tables: list([]), macros: list([])};
}
function fakeGithub({isPrivate = true, defaultBranch = 'main'} = {}) {
  const calls = [];
  const res = (status, body) => ({ok: status < 300, status, headers: {get: () => null}, text: async () => JSON.stringify(body), json: async () => body});
  const fetch = async (url, opts = {}) => {
    const p = decodeURIComponent(new URL(url).pathname), method = opts.method ?? 'GET';
    calls.push({method, p, auth: opts.headers?.Authorization, body: opts.body ? JSON.parse(opts.body) : null});
    if (method === 'GET' && p === '/repos/owner/priv') return res(200, {private: isPrivate, default_branch: defaultBranch});
    if (method === 'GET' && p.includes('/git/ref/heads/world-backup')) return res(200, {object: {sha: H.commit}});
    if (method === 'GET' && p.includes('/git/commits/')) return res(200, {tree: {sha: H.tree}});
    if (method === 'POST' && p.endsWith('/git/trees')) return res(201, {sha: H.newTree});
    if (method === 'POST' && p.endsWith('/git/commits')) return res(201, {sha: H.newCommit});
    if (method === 'PATCH') return res(200, {});
    return res(404, {});
  };
  return {fetch, calls, writes: () => calls.filter(c => c.method !== 'GET')};
}
const party = (game = mkGame()) => { const p = bk.collectBackup(game, {selection: ['party']}); assert.equal(p.ok, true); return {plan: p, doc: JSON.parse(p.files[0].text)}; };

test('party.json: path, own non-content schema, exact top-level shape, no timestamps', () => {
  const {plan, doc} = party();
  assert.deepEqual(plan.files.map(f => f.path), ['world-backup/party.json']);
  assert.deepEqual(plan.files[0].types, ['party']);
  assert.deepEqual(Object.keys(doc), ['schema_version', 'note', 'characters']);
  assert.equal(doc.schema_version, 'ag-party-sheets-export/0.1');
  assert.equal(doc.schema_version, PARTY_SCHEMA);
  assert.match(doc.note, /Never import/);
  assert.doesNotMatch(plan.files[0].text, /20\d\d-\d\d-\d\dT|"(at|timestamp|generated|exported)"/i);
  assert.ok(bk.ALL_TYPE_IDS.includes('party'));
  assert.equal(bk.BACKUP_TYPES.find(t => t.id === 'party').label, 'Party characters');
});

test('only characters a non-GM user owns, sorted by name', () => {
  const {doc} = party();
  assert.deepEqual(doc.characters.map(c => c.name), ['[TEST] Ada', '[TEST] Zoe']);
  assert.deepEqual(doc.characters.map(c => c.owner), ['[TEST] Amy', '[TEST] Zed']); // Ada also lists the GM; only the player is named
  // Different actor order gives identical bytes.
  const reversed = bk.collectBackup(mkGame({actors: ACTORS().reverse()}), {selection: ['party']});
  assert.equal(reversed.files[0].text, party().plan.files[0].text);
});

test('a character row holds the slim sheet and none of the private parts', () => {
  const c = party().doc.characters[0];
  assert.deepEqual(Object.keys(c), ['actor_id', 'name', 'owner', 'level', 'classes', 'species', 'background', 'abilities', 'skills', 'hp', 'ac', 'speed', 'initiative_bonus', 'proficiencies', 'currency', 'features', 'spells', 'inventory', 'ashen_gate']);
  assert.equal(c.actor_id, 'a1'); assert.equal(c.level, 3);
  assert.deepEqual(c.classes, [{name: '[TEST] Cleric', identifier: 'cleric', levels: 3, subclass: '[TEST] Order'}, {name: '[TEST] Fighter', identifier: 'fighter', levels: 1, subclass: null}]);
  assert.equal(c.species, '[TEST] Species'); assert.equal(c.background, '[TEST] Soldier');
  assert.deepEqual(Object.keys(c.abilities), ['str', 'wis']);
  assert.deepEqual(c.abilities.wis, {score: 14, modifier: 2, save_proficient: true, save_bonus: 5});
  assert.deepEqual(c.skills.prc, {proficiency: 1, ability: 'wis'});
  assert.deepEqual(c.hp, {max: 24, temp_max: 2}); assert.equal(c.ac, 16); assert.equal(c.initiative_bonus, 2);
  assert.deepEqual(c.speed, {walk: 30, units: 'ft'});
  assert.deepEqual(c.proficiencies, {armor: ['lgt', 'med', 'Odd Mail'], weapons: ['sim'], tools: ['thief'], languages: ['common']});
  assert.deepEqual(c.currency, {pp: 0, gp: 12, ep: 0, sp: 3, cp: 1});
  assert.deepEqual(c.spells.map(s => [s.name, s.level, s.prepared, s.school]), [['Aid', 2, false, 'abj'], ['Bless', 1, true, 'enc']]);
  assert.deepEqual(c.inventory, [{name: 'Gem', type: 'loot', quantity: 4, equipped: false, attuned: false, rarity: null}, {name: 'Mace', type: 'weapon', quantity: 1, equipped: true, attuned: false, rarity: 'common'}]);
  const raw = JSON.stringify(c);
  for (const secret of ['SECRET BIO', 'FLAG', 'EFFECT', 'LONG TEXT', 'biography']) assert.ok(!raw.includes(secret), secret);
});

test('features: plain text, HTML and enrichers stripped, trimmed to 600, source and activation kept', () => {
  const f = party().doc.characters[0].features;
  assert.deepEqual(f.map(x => x.name), ['Alert', 'Zeal']);
  const zeal = f[1];
  assert.equal(zeal.description, 'You gain power & Fury. Roll 1d6 damage. Done now.');
  assert.equal(zeal.activation, 'bonus'); assert.deepEqual(zeal.source, {book: 'PHB', custom: 'Ashen Gate'}); assert.equal(zeal.identifier, 'zeal');
  assert.equal(f[0].description.length, 600); assert.ok(f[0].description.endsWith('…')); assert.equal(f[0].activation, null);
  assert.equal(plainText('<b>short</b>'), 'short');
  assert.equal(plainText('a'.repeat(600)).length, 600);
  assert.equal(plainText('<script>x</script><p>ok</p> &#65;&lt;'), 'ok A<');
});

test('Ashen Gate state: read through public apis, sorted, without internals', () => {
  const ag = party().doc.characters[0].ashen_gate;
  assert.deepEqual(ag.professions.map(p => p.profession_id), ['PROF-TEST-A', 'PROF-TEST-B']);
  assert.deepEqual(ag.professions[1].selected_perk_ids, ['PERK-TEST-1', 'PERK-TEST-2']);
  assert.deepEqual(ag.cinders[0].unlocked_powers.map(p => p.name), ['Arc', 'Zap']);
  assert.equal(ag.cinders[0].definition_id, 'MUT-TEST'); assert.ok(!JSON.stringify(ag.cinders).includes('big.webp'));
  assert.deepEqual(ag.skill_trees, [{tree_id: 'TREE-TEST', name: '[TEST] Tree', kind: 'generic_points', level: null, earned: 2, spent: 1, available: 1}]);
});

test('absent, inactive or old modules are skipped with a note; the rest of the file is still written', () => {
  const {doc} = party(mkGame({mods: {cinders: {version: '0'}}}));
  const ag = doc.characters[0].ashen_gate;
  assert.match(ag.professions.skipped, /Profession Ledger is not installed/);
  assert.match(ag.cinders.skipped, /no cinder\.list; update it/);
  assert.match(ag.skill_trees.skipped, /Skill Trees is not installed/);
  assert.equal(doc.characters.length, 2);
  const g = mkGame(); g.modules.get('ashen-gate-skill-trees').active = false;
  assert.match(party(g).doc.characters[0].ashen_gate.skill_trees.skipped, /not active/);
  // A read that throws for one character skips that part only, without leaking the message.
  const t = TREES(); t.pointsSummary = actor => { if (actor.id === 'a1') throw new Error('Actor access denied secret-detail'); return []; };
  const p = bk.collectBackup(mkGame({mods: {trees: t}}), {selection: ['party']});
  const rows = JSON.parse(p.files[0].text).characters;
  assert.deepEqual(rows[0].ashen_gate.skill_trees, {skipped: 'it could not be read for this character'});
  assert.deepEqual(rows[1].ashen_gate.skill_trees, []);
  assert.doesNotMatch(p.files[0].text, /secret-detail/);
});

test('GM only: a player gets nothing and the builder refuses on its own', async () => {
  const g = mkGame({user: {isGM: false}});
  const p = bk.collectBackup(g, {selection: ['party']});
  assert.equal(p.ok, false); assert.equal(p.message, bk.GM_ONLY); assert.deepEqual(p.files, []);
  const {buildPartySheets} = await import('../scripts/party-sheets.js');
  assert.throws(() => buildPartySheets(g), /GM only/);
  const s = mkStore();
  assert.equal(bk.loadBackupSelection({isGM: false}, {store: s}).ok, false);
});

test('selection memory: party starts ticked for older saved choices, and an untick is remembered', async () => {
  const gm = {isGM: true};
  assert.ok(bk.loadBackupSelection(gm, {store: mkStore()}).selection.includes('party'));
  // 0.90.0 to 0.92.0 shape: seen lists every type but party.
  const old = mkStore({backupTypes: {types: ['Item', 'locations'], seen: bk.ALL_TYPE_IDS.filter(id => id !== 'party')}});
  assert.deepEqual(bk.loadBackupSelection(gm, {store: old}).selection, ['Item', 'locations', 'party']);
  // Pre-0.90.0 shape (no seen): standings and party both start ticked.
  const older = mkStore({backupTypes: {types: ['Item']}});
  assert.deepEqual(bk.loadBackupSelection(gm, {store: older}).selection, ['Item', 'standings', 'party']);
  // Unticked once, it stays unticked.
  await bk.saveBackupSelection(gm, {store: old, selection: ['Item']});
  assert.deepEqual(bk.loadBackupSelection(gm, {store: old}).selection, ['Item']);
});

test('unticked means untouched: a run without party writes no party path; ticked writes exactly one blob', async () => {
  const g = mkGame(), gh = fakeGithub(), store = mkStore();
  const without = bk.collectBackup(g, {selection: ['shops']});
  assert.ok(!without.files.some(f => f.path.endsWith('party.json')));
  const plan = bk.collectBackup(g, {selection: ['party']});
  const r = await bk.runBackup(g, {store, fetch: gh.fetch, plan});
  assert.equal(r.ok, true);
  const tree = gh.writes().find(c => c.p.endsWith('/git/trees')).body;
  assert.equal(tree.base_tree, H.tree);
  assert.deepEqual(tree.tree.map(t => t.path), ['world-backup/party.json']);
  assert.equal(tree.tree[0].content, plan.files[0].text);
  assert.ok(!gh.writes().some(c => c.method === 'DELETE'));
});

test('safety: public repository and default branch are refused before any write; the token is never in output', async () => {
  const g = mkGame(), plan = bk.collectBackup(g, {selection: ['party']});
  const pub = fakeGithub({isPrivate: false});
  const r1 = await bk.runBackup(g, {store: mkStore(), fetch: pub.fetch, plan});
  assert.equal(r1.ok, false); assert.equal(r1.kind, 'public'); assert.equal(pub.writes().length, 0);
  const def = fakeGithub({defaultBranch: 'world-backup'});
  const r2 = await bk.runBackup(g, {store: mkStore(), fetch: def.fetch, plan});
  assert.equal(r2.ok, false); assert.equal(def.writes().length, 0);
  const ok = fakeGithub(), r3 = await bk.runBackup(g, {store: mkStore(), fetch: ok.fetch, plan});
  assert.ok(!JSON.stringify(r1).includes(TOKEN) && !JSON.stringify(r2).includes(TOKEN) && !JSON.stringify(r3).includes(TOKEN));
  assert.ok(!plan.files[0].text.includes(TOKEN)); assert.ok(!JSON.stringify(plan.types).includes(TOKEN));
});

test('dialog hint, export text, Help, README, docs and changelog say it holds character sheets / play state', () => {
  const plan = bk.collectBackup(mkGame());
  assert.match(confirmHint(plan, {repo: 'owner/priv', branch: 'world-backup'}), /Party characters holds character sheets \(play state\)/);
  assert.match(exportView({target: {branch: 'world-backup'}}), /Party characters/);
  const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.match(read('../scripts/main.js'), /Party characters<\/em> \(<code>party\.json<\/code>/);
  assert.match(read('../README.md'), /Party characters\* \(`world-backup\/party\.json`/);
  assert.match(read('../../../docs/world-backup.md'), /`party\.json` \(`ag-party-sheets-export\/0\.1`/);
  assert.match(read('../../../docs/perks-and-modifiers-for-gpt.md'), /`party\.json`.*read-only play state/s);
  assert.match(read('../CHANGELOG.md'), /^## 0\.93\.0 /m);
});

test('version 0.94.0, 0.x only, download URL agrees', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
  assert.equal(m.version, '0.94.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.94.0/ashen-gate-manager.zip'));
});
