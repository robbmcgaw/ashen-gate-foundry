/** Browse 0.34.0: Renown deities and NPC Codex rows. Proves logic with mocked Foundry and partner APIs, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowse, searchIndex} from '../scripts/browse.js';
import {bodyHtml, DEFAULT_STATE} from '../scripts/browse-view.js';
import {gmEntry} from '../scripts/codex.js';

const M = 'ashen-gate-manager';
const R = 'ashen-gate-factions';
const coll = list => ({contents: list});

function actor(id, name, sourceId) {
  const writes = [];
  return {documentName: 'Actor', id, uuid: `Actor.${id}`, name, type: 'npc', system: {}, folder: null, _stats: {modifiedTime: 5},
    flags: {[M]: {source: {sourceId, entityType: 'NPC', status: 'approved', visibility: 'gm', packageId: 'PKG-TEST', refs: [], definition: {id: sourceId, entity_type: 'NPC', name}}}},
    sheet: {rendered: [], render(opts) { this.rendered.push(opts); return Promise.resolve(); }},
    update: () => writes.push('update'), setFlag: () => writes.push('setFlag'), writes};
}

const deity = (id, name, deity, extra = {}) => ({id, entity_type: 'Deity', status: 'approved', visibility: 'reveal_gated', name, tags: ['test-pantheon'],
  discovery: {placeholder: false, sharing_enabled: true}, deity: {symbol: '', title: '', domain: '', tier: 'major', blurb: '', portfolio: '', relations: [], ...deity}, ...extra});

function world({gm = true, renown = 'full', codex = true} = {}) {
  const calls = [];
  const warden = actor('a1', '[TEST] Warden Pell', 'NPC-TEST-WARDEN');
  const def = warden.flags[M].source.definition;
  const codexApi = {list: () => {
    calls.push(['codex.list']);
    if (!gm) throw new Error('Only a GM can see or change the full NPC Codex.');
    return [gmEntry({def: {...def, role: 'Gatekeeper of the test ward', codex: {links: ['LOC-TEST-TOWN', 'FACTION-TEST-GUILD']}},
      state: {discovery: {party: true, actors: []}, fields: {role: {party: true}, wants: {party: false, actors: ['c1']}}}, uuid: warden.uuid, name: warden.name},
      {nameOf: id => id === 'FACTION-TEST-GUILD' ? '[TEST] Guild' : null})];
  }};
  const modules = new Map([[M, {id: M, active: true, api: codex ? {codex: codexApi} : {}}]]);
  if (renown) {
    const api = {getFactions: () => [{id: 'FACTION-TEST-GUILD', name: '[TEST] Guild', visibility: 'player'}]};
    if (renown === 'full' || renown === 'no-open') api.getDeities = () => { calls.push(['getDeities']); return [
      deity('DEITY-TEST-SUN', '[TEST] Sun Father', {title: 'The Bright Warden', domain: 'Light', portfolio: 'Dawn, oaths', tier: 'major',
        relations: [{deity_id: 'DEITY-TEST-MOON', resonance: 0.2}]}),
      deity('DEITY-TEST-MOON', '[TEST] Moon Sister', {title: 'Keeper of Tides', domain: 'Night', portfolio: 'Dreams', tier: 'lesser'},
        {status: 'draft', discovery: {placeholder: true, sharing_enabled: false}})]; };
    if (renown === 'full') api.open = opts => { calls.push(['renown.open', opts]); };
    modules.set(R, {id: R, active: true, version: '0.11.1', api});
  }
  const game = {user: {isGM: gm}, items: coll([]), actors: coll([warden]), journal: coll([]), packs: coll([]),
    modules: {get: id => modules.get(id), values: () => modules.values()}};
  return {game, calls, warden};
}

test('0.34.0: Renown deities are Deity rows with tier, domain, discovery, status and visibility, searchable by card fields', () => {
  const {game} = world();
  const idx = createBrowse({game}).getIndex();
  const sun = idx.find(e => e.id === 'DEITY-TEST-SUN');
  assert.equal(sun.kind, 'Deity');
  assert.equal(sun.owner, R);
  assert.equal(sun.ag, true);
  assert.equal(sun.tier, 'major');
  assert.equal(sun.status, 'approved');
  assert.equal(sun.visibility, 'reveal_gated');
  assert.deepEqual(sun.chips, ['Major deity', 'Domain: Light', 'Discovery: hidden until discovered']);
  const moon = idx.find(e => e.id === 'DEITY-TEST-MOON');
  assert.deepEqual(moon.chips, ['Lesser deity', 'Domain: Night', 'Discovery: placeholder until discovered, no sharing']);
  // Factions are still Faction rows; getFactions never lists deities.
  assert.equal(idx.find(e => e.id === 'FACTION-TEST-GUILD').kind, 'Faction');
  const ids = q => searchIndex(idx, {query: q, group: 'none'}).groups.flatMap(g => g.rows.map(r => r.id)).sort();
  assert.deepEqual(ids('deity'), ['DEITY-TEST-MOON', 'DEITY-TEST-SUN']);
  assert.deepEqual(ids('type:deity'), ['DEITY-TEST-MOON', 'DEITY-TEST-SUN']);
  assert.deepEqual(ids('id:DEITY-'), ['DEITY-TEST-MOON', 'DEITY-TEST-SUN']);
  assert.deepEqual(ids('sun father'), ['DEITY-TEST-SUN']);
  assert.deepEqual(ids('tag:test-pantheon'), ['DEITY-TEST-MOON', 'DEITY-TEST-SUN']);
  assert.deepEqual(ids('bright warden'), ['DEITY-TEST-SUN']);
  assert.deepEqual(ids('night'), ['DEITY-TEST-MOON']);
  assert.deepEqual(ids('dreams'), ['DEITY-TEST-MOON']);
  assert.deepEqual(ids('tier:lesser'), ['DEITY-TEST-MOON']);
  // Existing filters and groupings apply: kind facet counts, status facet, group by tier.
  const r = searchIndex(idx, {filters: {kind: 'Deity', status: 'draft'}, group: 'tier'});
  assert.equal(r.total, 1);
  assert.equal(r.groups[0].label, 'lesser');
  assert.equal(searchIndex(idx, {}).facets.kind.find(f => f.value === 'Deity').count, 2);
  // Deities count as Ashen Gate in the scope selector.
  assert.ok(searchIndex(idx, {scope: 'ag', filters: {kind: 'Deity'}}).total === 2);
  assert.equal(searchIndex(idx, {scope: 'nonag', filters: {kind: 'Deity'}}).total, 0);
});

test('0.34.0: deity details show card fields and related deities by id; Open uses Renown api.open at the Pantheon tab', async () => {
  const {game, calls} = world();
  const svc = createBrowse({game});
  const d = svc.detail(`${R}/DEITY-TEST-SUN`);
  const field = l => d.fields.find(f => f.label === l)?.value;
  assert.equal(field('Title'), 'The Bright Warden');
  assert.equal(field('Domain'), 'Light');
  assert.equal(field('Portfolio'), 'Dawn, oaths');
  assert.equal(field('Relations'), 'DEITY-TEST-MOON (Dissonance)');
  assert.deepEqual(d.outgoing, [{id: 'DEITY-TEST-MOON', name: '[TEST] Moon Sister', key: `${R}/DEITY-TEST-MOON`, kind: 'Deity'}]);
  // The Moon deity is named by the Sun's relation.
  assert.ok(svc.detail(`${R}/DEITY-TEST-MOON`).incoming.some(x => x.id === 'DEITY-TEST-SUN'));
  // The Codex NPC links to the faction, so it is listed under "Named by".
  assert.ok(svc.detail(`${R}/FACTION-TEST-GUILD`).incoming.some(x => x.id === 'NPC-TEST-WARDEN'));
  assert.deepEqual(await svc.open(`${R}/DEITY-TEST-SUN`), {ok: true});
  assert.deepEqual(calls.find(c => c[0] === 'renown.open'), ['renown.open', {deityId: 'DEITY-TEST-SUN', tab: 'pantheon'}]);
  const html = bodyHtml(DEFAULT_STATE, svc.search({filters: {kind: 'Deity'}}), d);
  assert.match(html, /Open in Renown/);
  assert.match(html, /Domain: Light/);
  assert.match(html, /Discovery: hidden until discovered/);
  // A Renown without api.open: Open says so instead of failing.
  const old = world({renown: 'no-open'});
  const out = await createBrowse({game: old.game}).open(`${R}/DEITY-TEST-SUN`);
  assert.equal(out.ok, false);
  assert.match(out.message, /no open API/);
});

test('0.34.0: absent or older Renown hides deities and never stops Browse', () => {
  for (const renown of [null, 'no-deities']) {
    const {game} = world({renown});
    const idx = createBrowse({game}).getIndex();
    assert.equal(idx.filter(e => e.kind === 'Deity').length, 0, String(renown));
    assert.equal(searchIndex(idx, {}).facets.kind.some(f => f.value === 'Deity'), false);
    assert.ok(idx.some(e => e.id === 'NPC-TEST-WARDEN'));
  }
});

test('0.34.0: an NPC Actor and its Codex entry are one row listing both places; Open jumps to the Codex', async () => {
  const {game, warden} = world();
  const opened = [];
  const svc = createBrowse({game, openCodex: id => { opened.push(id); }});
  const idx = svc.getIndex();
  const rows = idx.filter(e => e.id === 'NPC-TEST-WARDEN');
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.kind, 'Actor');
  assert.deepEqual(row.kinds, ['Actor', 'NPC Codex']);
  assert.deepEqual(row.sources, ['World', 'NPC Codex']);
  assert.equal(row.uuid, warden.uuid);
  assert.deepEqual(row.chips, ['Known to party', '2 fields revealed', '2 links']);
  assert.ok(row.refIds.includes('LOC-TEST-TOWN') && row.refIds.includes('FACTION-TEST-GUILD'));
  const ids = q => searchIndex(idx, {query: q, group: 'none'}).groups.flatMap(g => g.rows.map(r => r.id));
  assert.deepEqual(ids('type:npc-codex'), ['NPC-TEST-WARDEN']);
  assert.deepEqual(ids('gatekeeper'), ['NPC-TEST-WARDEN']);
  assert.equal(searchIndex(idx, {scope: 'ag', query: 'warden pell'}).total, 1);
  const d = svc.detail(row.key);
  assert.equal(d.fields.find(f => f.label === 'Found in').value, 'World • NPC Codex');
  assert.equal(d.fields.find(f => f.label === 'Codex: known to').value, 'Party');
  assert.equal(d.fields.find(f => f.label === 'Codex: connections').value, 'LOC-TEST-TOWN, [TEST] Guild (FACTION-TEST-GUILD)');
  const html = bodyHtml(DEFAULT_STATE, svc.search({query: 'warden'}), d);
  assert.match(html, /Open in NPC Codex/);
  assert.match(html, /data-ag-browse-sheet/);
  assert.deepEqual(await svc.open(row.key), {ok: true});
  assert.deepEqual(opened, ['NPC-TEST-WARDEN']);
  // Sheet still opens the Actor.
  await svc.open(row.key, {prefer: 'sheet'});
  assert.equal(warden.sheet.rendered.length, 1);
  // Without an injected opener, Open says where to look.
  const plain = await createBrowse({game}).open(row.key);
  assert.equal(plain.ok, false);
  assert.match(plain.message, /Library → NPC Codex/);
  // Browse never writes.
  assert.deepEqual(warden.writes, []);
});

test('0.34.0: no Codex API means no Codex rows; the Actor row stays', () => {
  const {game} = world({codex: false});
  const row = createBrowse({game}).getIndex().find(e => e.id === 'NPC-TEST-WARDEN');
  assert.deepEqual(row.kinds, ['Actor']);
  assert.deepEqual(row.sources, ['World']);
});

test('0.34.0: a non-GM is refused before any deity or Codex read', async () => {
  const {game, calls} = world({gm: false});
  const svc = createBrowse({game, openCodex: () => { throw new Error('must not open'); }});
  for (const fn of [() => svc.getIndex(), () => svc.search({query: 'deity'}), () => svc.detail(`${R}/DEITY-TEST-SUN`), () => svc.status()])
    assert.throws(fn, /Only the GM/);
  await assert.rejects(svc.open('codex/NPC-TEST-WARDEN'), /Only the GM/);
  assert.deepEqual(calls, []);
});
