/** 1.18.0: gathering entries that refer to a Profession Ledger node template ({nodeId: 'NODE-…'}), and "Hunting".
 *  Proves the logic with mocked Foundry globals and a mocked Ledger API (shaped like Ledger 0.25.0's templates API),
 *  not the live window or the real Ledger. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote, presentationOptions} from '../scripts/store.mjs';
import {GATHERING, normalizeLocation, playerView, previewView, viewHtml, resourcesOf, exportPackage, parseImport, importRecords, publishable, newNode, gatheringSkill,
  hasUnpublishedChanges} from '../scripts/model.mjs';
import {checkContent} from '../../../scripts/validate-content.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp, materialsSummary} = await import('../scripts/app.mjs');

const REEDS = {id: 'NODE-TEST-RIVER-REEDS', name: '[TEST] River Reeds', activity: 'hunting', professions: ['huntingskinning'], tier: {min: 1, max: 3},
  check: {skill: 'sur'}, dc: 14, dcVisible: false, finite: true,
  materials: {common: [{materialId: 'MAT-TEST-REED', quantity: 2, chance: 70}, {materialId: 'MAT-TEST-RUSH', quantity: 1, chance: 30}],
    rare: [{materialId: 'MAT-TEST-SILVER-REED', quantity: 1}], exotic: [{materialId: 'MAT-TEST-MOON-PEARL', mode: 'designated', chance: 5, condition: 'rare'}]},
  note: '[TEST] GM-only template note'};
/** Ledger 0.25.0 templatePlayerView, as docs/gathering-nodes-schema.md describes it: no chances, no Exotics, DC only when shown. */
const ledgerPlayerView = (t, {tier = null} = {}) => {
  const at = tier >= t.tier.min && tier <= t.tier.max ? tier : t.tier.min;
  return {nodeId: t.id, label: t.name, skill: 'Hunting/Skinning', activity: t.activity, tier: at, ...(t.dcVisible && t.dc != null ? {dc: t.dc} : {}),
    materialId: t.materials.common[0]?.materialId ?? '', quantity: t.materials.common[0]?.quantity ?? 1,
    rareMaterialId: t.materials.rare[0]?.materialId ?? '', rareQuantity: t.materials.rare[0]?.quantity ?? 1, finite: t.finite};
};
function fakeLedger(templates = [REEDS], {refuse = false} = {}) {
  const gmOnly = () => { if (refuse || !globalThis.game.user.isGM) throw new Error('Only the GM can manage gathering nodes'); };
  const opened = [];
  return {opened, active: true, api: {open: o => opened.push(o), gathering: {templates: {contract: 'ag-gathering-nodes/1',
    list: () => { gmOnly(); return structuredClone(templates); },
    playerView: (id, o) => { gmOnly(); const t = templates.find(x => x.id === id); return t ? ledgerPlayerView(t, o) : null; }}}}};
}
const ref = (over = {}) => ({id: 'r1', nodeId: 'NODE-TEST-RIVER-REEDS', tier: 2, label: '[TEST] Reeds by the ford', exhausted: false, available: true, visible: true, ...over});
const ford = (resources = [ref()]) => ({id: 'LOC-TEST-FORD', name: '[TEST] Ford', state: 'revealed', revealed: true, sections: {resources: true}, resources});
function setup(ledger) {
  const game = installFoundry();
  const mod = {version: '0.19.0', active: true};
  mod.api = createApi({version: '0.19.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}, viewOptions: presentationOptions});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : id === 'ashen-gate-profession-ledger' ? ledger ?? null : null};
  return {game, mod};
}

test('saved data: a nodeId entry keeps only its place fields; entries without nodeId read exactly as before', () => {
  const old = {id: 'o1', label: '[TEST] Herbs', skill: 'Herbalism', tier: 2, materialId: 'MAT-TEST-HERB', exhausted: true, note: '[TEST] old'};
  const loc = normalizeLocation(ford([ref({materialId: 'MAT-TEST-X', skill: 'Mining', exotics: [{materialId: 'MAT-TEST-Y'}], junk: 1}), old]));
  assert.deepEqual(loc.resources[0], {key: 'r1', visible: true, nodeId: 'NODE-TEST-RIVER-REEDS', label: '[TEST] Reeds by the ford', tier: 2, dc: null, dcVisible: null, finite: null,
    exhausted: false, available: true, note: ''}, 'inline material fields belong to the template and are not kept');
  assert.deepEqual(loc.resources[1], {key: 'o1', visible: true, label: '[TEST] Herbs', skill: 'Herbalism', tier: 2, dc: 12, dcVisible: false, materialId: 'MAT-TEST-HERB', quantity: 1,
    rareMaterialId: '', rareQuantity: 1, finite: true, exhausted: true, available: true, uuid: '', note: '[TEST] old', exotics: []});
  assert.deepEqual(normalizeLocation(normalizeLocation(loc)), loc, 're-runnable');
  const own = normalizeLocation(ford([ref({tier: 9, dc: 16, dcVisible: true, finite: false, exhausted: true, label: ''})])).resources[0];
  assert.deepEqual([own.tier, own.dc, own.dcVisible, own.finite, own.exhausted, own.label], [null, 16, true, false, false, ''], 'a bad tier falls back to the template; never finite means never exhausted');
  assert.equal(normalizeLocation(ford([{id: 'x', nodeId: 'reeds'}])).resources.length, 0, 'a malformed nodeId is not a reference (and has nothing else to keep)');
  assert.equal(normalizeLocation(ford([{id: 'x', nodeId: 'reeds', label: '[TEST] Kept'}])).resources[0].skill, '', 'it reads as a plain custom node');
  assert.deepEqual(newNode({nodeId: 'NODE-TEST-RIVER-REEDS', tier: 1}).tier, 1);
});

test('"Skinning & Harvesting" and "Hunting/Skinning" read as Hunting; GATHERING lists Hunting', () => {
  assert.deepEqual(GATHERING.skills, ['Herbalism', 'Mining', 'Fishing', 'Hunting', 'Archaeology']);
  for (const old of ['Skinning & Harvesting', 'skinning & harvesting', 'Hunting/Skinning', 'Hunting & Skinning']) assert.equal(gatheringSkill(old), 'Hunting', old);
  assert.equal(gatheringSkill('Survival'), 'Survival', 'anything else is kept as written');
  const raw = ford([{id: 'h', label: '[TEST] Elk', skill: 'Skinning & Harvesting', materialId: 'MAT-TEST-HIDE'}]);
  const loc = normalizeLocation({...raw, published: structuredClone(raw)});
  assert.equal(loc.resources[0].skill, 'Hunting');
  assert.equal(hasUnpublishedChanges(loc), false, 'the rename alone is not an unpublished change');
  assert.doesNotMatch(viewHtml(playerView(loc)), /Skinning/);
});

test('GM API: resourcesAt gives the reference the Ledger resolves; exhaust works when finite comes from the template', async () => {
  const {game, mod} = setup(fakeLedger());
  await writeAll([normalizeLocation(ford([ref(), ref({id: 'r2', finite: false})]))]);
  const [a, b] = mod.api.resourcesAt('LOC-TEST-FORD');
  assert.deepEqual(a, {id: 'r1', nodeId: 'NODE-TEST-RIVER-REEDS', label: '[TEST] Reeds by the ford', tier: 2, dc: null, dcVisible: null, finite: null, exhausted: false, available: true, note: '', visible: true});
  assert.equal((await mod.api.markNodeExhausted('LOC-TEST-FORD', 'r1')).exhausted, true);
  assert.equal(readAll()[0].published.resources[0].exhausted, true, 'players see it at once');
  await assert.rejects(() => mod.api.markNodeExhausted('LOC-TEST-FORD', b.id), /not finite/);
  game.user = player;
  assert.equal('nodeId' in mod.api.resourcesAt('LOC-TEST-FORD')[0], true);
  game.user = gm;
});

test('players get the Ledger playerView shape: no chances, no Exotics, no hidden DC, no template note', async () => {
  const {game, mod} = setup(fakeLedger());
  const loc = normalizeLocation(ford([ref(), ref({id: 'r2', label: '', dc: 11, dcVisible: true, tier: 3})]));
  loc.published = publishable(loc);
  await writeAll([loc]);
  game.user = player;
  const [a, b] = mod.api.resourcesAt('LOC-TEST-FORD');
  assert.deepEqual(a, {id: 'r1', nodeId: 'NODE-TEST-RIVER-REEDS', label: '[TEST] Reeds by the ford', skill: 'Hunting', activity: 'hunting', tier: 2,
    materialId: 'MAT-TEST-REED', quantity: 2, rareMaterialId: 'MAT-TEST-SILVER-REED', rareQuantity: 1, finite: true, exhausted: false, available: true, note: ''});
  assert.equal(b.label, '[TEST] River Reeds', 'no place label: the template name');
  assert.equal(b.dc, 11, 'the place shows its own DC');assert.equal(b.tier, 3);
  const all = JSON.stringify(readViews());
  assert.doesNotMatch(all, /MOON-PEARL|"chance"|exotic|GM-only template note|"dc":14|RUSH|Skinning/i);
  assert.match(viewHtml(readViews()[0]), /\[TEST\] Reeds by the ford · Hunting T2/);
  game.user = gm;
});

test('a deleted template, a refused call or no Ledger never breaks the Location; players get the place fields only', async () => {
  for (const ledger of [fakeLedger([]), fakeLedger([REEDS], {refuse: true}), null]) {
    const loc = normalizeLocation(ford([ref({note: '[TEST] by the ford'})]));
    loc.published = publishable(loc);
    const view = playerView(loc, [], {nodeView: (id, o) => ledger?.api.gathering.templates.playerView(id, o)});
    assert.deepEqual(view.resources[0], {id: 'r1', nodeId: 'NODE-TEST-RIVER-REEDS', label: '[TEST] Reeds by the ford', skill: '', activity: '', tier: 2,
      finite: true, exhausted: false, available: true, note: '[TEST] by the ford'});
  }
  assert.equal(playerView(normalizeLocation({...ford([ref({label: ''})]), published: undefined})).resources[0].label, 'Gathering spot');
});

test('import/export carry nodeId entries unchanged; an update import keeps exhausted', () => {
  const loc = normalizeLocation(ford([ref({dc: 13, dcVisible: false, finite: true, note: '[TEST] n'}), {id: 'o1', label: '[TEST] Herbs', skill: 'Herbalism', materialId: 'MAT-TEST-HERB'}]));
  const pkg = exportPackage([loc]);
  assert.deepEqual(pkg.records[0].location.resources[0], {key: 'r1', visible: true, nodeId: 'NODE-TEST-RIVER-REEDS', label: '[TEST] Reeds by the ford', tier: 2, dc: 13, dcVisible: false,
    finite: true, exhausted: false, available: true, note: '[TEST] n'});
  const back = parseImport(JSON.parse(JSON.stringify(pkg)), []).created[0];
  assert.deepEqual(back.resources, loc.resources);
  const world = normalizeLocation(ford([ref({exhausted: true})]));
  const {updated} = importRecords([{id: 'LOC-TEST-FORD', entity_type: 'Location', location: {name: '[TEST] Ford', resources: [ref({finite: undefined})]}}], [world], {mode: 'update'});
  assert.equal(updated[0].resources[0].exhausted, true, 'play state survives an update import');
});

test('validate-content: nodeId entries are accepted unchanged; bad ids and inline materials are errors', async () => {
  const pack = resources => ({manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'AG-TEST-NODES', version: '1.0.0'}, records: [{id: 'LOC-TEST-FORD', entity_type: 'Location',
    status: 'approved', version: '1.0.0', provenance: {sources: ['[TEST] synthetic']}, visibility: 'player', refs: [], location: {name: '[TEST] Ford', resources}}]});
  const ok = await checkContent(pack([ref({dc: 13, dcVisible: true, finite: false, note: '[TEST] n'})]));
  assert.deepEqual(ok.errors, []);
  assert.match(ok.notes.join(' '), /refers to node template NODE-TEST-RIVER-REEDS: it must exist in Profession Ledger > Gathering Nodes/);
  assert.deepEqual((await checkContent(pack([ref()]), '', {knownIds: new Set(['NODE-TEST-RIVER-REEDS'])})).notes.filter(n => /NODE-/.test(n)), []);
  const bad = await checkContent(pack([ref({nodeId: 'node-reeds'}), ref({id: 'r2', materialId: 'MAT-TEST-REED', skill: 'Herbalism'}), ref({id: 'r3', tier: 7})]));
  assert.match(bad.errors.join(' | '), /resources\[0\]\.nodeId "node-reeds" is not a NODE-\* id.*resources\[1\] refers to NODE-TEST-RIVER-REEDS, so skill, materialId belong to the node template.*resources\[2\]\.tier 7 was changed to null/);
});

async function editor(ledger) {
  const {mod} = setup(ledger);
  globalThis.game.items = [{name: '[TEST] Reed', flags: {'ashen-gate-manager': {source: {sourceId: 'MAT-TEST-REED'}}}}];
  await writeAll([normalizeLocation(ford())]);
  const app = new LocationsApp();app.select('LOC-TEST-FORD');
  app.render = async () => {};
  return {app, mod};
}

test('editor: pick a template by activity, see it read only (Hunting, tier range, materials), edit the place fields', async () => {
  const ledger = fakeLedger();
  const {app, mod} = await editor(ledger);
  let html = await app._renderHTML();
  assert.match(html, /data-action="add-node"[^>]*><i[^>]*><\/i><span>Add node…<\/span>/, '0.19.0: one Add node… button');
  assert.match(html, /<strong>\[TEST\] River Reeds<\/strong> · Hunting · Tier 1–3/);
  assert.match(html, /Common: \[TEST\] Reed ×2 \(70%\), MAT-TEST-RUSH \(30%\) · Rare \(by 5\+\): MAT-TEST-SILVER-REED · Exotic: 1 candidate/);
  assert.match(html, /data-action="open-ledger-nodes"/);
  assert.doesNotMatch(html, /Skinning/);
  const tierSel = html.slice(html.indexOf('data-bind="resources.r1.tier"'), html.indexOf('</select>', html.indexOf('data-bind="resources.r1.tier"')));
  assert.deepEqual([...tierSel.matchAll(/<option value="(\d)"/g)].map(m => m[1]), ['1', '2', '3'], 'tiers inside the template range only');
  assert.match(html, /data-bind="resources\.r1\.dc" value="" placeholder="14"/, 'blank DC shows the template DC');
  app.setPath('resources.r1.dc', '16');app.setPath('resources.r1.dcVisible', 'true');app.setPath('resources.r1.finite', '');
  assert.deepEqual([app.draft.resources[0].dc, app.draft.resources[0].dcVisible, app.draft.resources[0].finite], [16, true, null]);
  app.setPath('resources.r1.dc', '');
  assert.equal(app.draft.resources[0].dc, null, 'cleared: the template DC applies again');
  // 0.19.0: Add node… asks From template / Custom (kit choiceDialog), then the template from a list labelled by activity.
  const seen = [];
  const prev = foundry.applications.api.DialogV2;
  foundry.applications.api.DialogV2 = {wait: async o => {
    seen.push(o);
    const pick = o.buttons.find(b => b.action === 'template') ?? o.buttons.find(b => b.action === 'ok');
    return pick.callback({}, {form: {elements: [{name: 'template', value: 'NODE-TEST-RIVER-REEDS'}]}});
  }};
  try { await app.onAction({dataset: {action: 'add-node'}}); } finally { foundry.applications.api.DialogV2 = prev; }
  assert.deepEqual(seen[0].buttons.map(b => b.label), ['Cancel', 'From template…', 'Custom…']);
  assert.match(seen[1].content, /<option value="NODE-TEST-RIVER-REEDS"[^>]*>Hunting: \[TEST\] River Reeds \(tier 1–3\)<\/option>/);
  assert.deepEqual(app.draft.resources.at(-1), {...app.draft.resources.at(-1), nodeId: 'NODE-TEST-RIVER-REEDS', tier: 1, label: '', dc: null});
  assert.ok(app.openNodes.has(app.draft.resources.at(-1).key), 'a new node opens its Edit node fold');
  await app.onAction({dataset: {action: 'open-ledger-nodes'}});
  assert.deepEqual(ledger.opened, [{view: 'nodes'}]);
  await mod.api.saveLocation(app.draft);
  assert.equal(readAll()[0].resources.length, 2);
});

test('editor: a deleted template shows "no longer exists" and keeps the data; no Ledger shows the manual entry and a note', async () => {
  let {app} = await editor(fakeLedger([]));
  let html = await app._renderHTML();
  assert.match(html, /Node template NODE-TEST-RIVER-REEDS no longer exists/);
  assert.match(html, /value="\[TEST\] Reeds by the ford"/, 'the place data is still there');
  ({app} = await editor(null));
  html = await app._renderHTML();
  assert.match(html, /Profession Ledger 0\.25\.0 or later is not active, so node templates are not available\. Add a custom node instead\./);
  assert.match(html, /data-action="add-node"/, 'the manual entry is still offered (Add node… goes straight to Custom)');
  assert.doesNotMatch(html, /data-action="open-ledger-nodes"/);
  ({app} = await editor(fakeLedger([REEDS], {refuse: true})));
  assert.match(await app._renderHTML(), /Profession Ledger did not list its node templates \(Only the GM can manage gathering nodes\)/);
  assert.equal(materialsSummary({materials: {common: [], rare: [], exotic: []}}), 'No materials: the GM awards it by hand');
});

test('GM preview uses the same player-safe shape', async () => {
  const {mod} = setup(fakeLedger());
  await writeAll([]);
  const view = mod.api.previewLocation(ford(), 'revealed');
  assert.equal(view.resources[0].materialId, 'MAT-TEST-REED');
  assert.equal('exotics' in view.resources[0] || 'dc' in view.resources[0], false);
  assert.deepEqual(previewView(ford(), [], 'revealed').resources[0].materialId, undefined, 'no nodeView: no template data');
});
