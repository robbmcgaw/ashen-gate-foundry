// 0.96.0: NPC Codex edits layer, life status, one "Only you" chip, backup layer. Mocked Foundry data and source-text checks:
// proves logic and wiring, not the live Forge window. Synthetic [TEST] data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCodexService, CODEX_ACCESS_SETTING} from '../scripts/codex-service.js';
import {normalizeState, setEdits, presetKeys, REVEAL_FIELDS, EDIT_FIELDS, STATUS_VALUES, renderPlayerCodexHtml, buildCodexExport, planRevealsImport} from '../scripts/codex.js';
import * as bk from '../scripts/github-backup.js';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const ID = 'NPC-TEST-MIRA';
const def = () => ({id: ID, entity_type: 'NPC', status: 'draft', version: '0.1.0', visibility: 'gm', scope: 'setting_adapter',
  name: '[TEST] Mira Vane', role: 'Ferry clerk', appearance: 'Ink-stained cuffs.', wants: 'PACK-WANTS', knows: 'PACK-KNOWS',
  signature_line: 'Toll is paid.', portrayal: 'PACK-PORTRAYAL', session_role: 'PACK-SESSION', stat_block: 'Commoner (2024)',
  gm_notes: ['PACK-NOTE-1', 'PACK-NOTE-2'], art: {repo_path: null, forge_path: null}});

function world({gm = true} = {}) {
  const flags = new Map(); let source = {sourceId: ID, definition: def()};
  const sets = [];
  const mira = {id: 'mira', uuid: 'Actor.mira', name: 'Mira', img: 'm.webp', type: 'npc',
    getFlag: (m, k) => k === 'source' ? source : flags.get(k) ?? null,
    setFlag: async (m, k, v) => { sets.push(k); flags.set(k, structuredClone(v)); }};
  const ash = {id: 'a1', name: '[TEST] Ash', type: 'character', hasPlayerOwner: true, getFlag: () => null, testUserPermission: u => u.id === 'u1'};
  const users = new Map([['u1', {id: 'u1', isGM: false}], ['gm', {id: 'gm', isGM: true}]]);
  const game = {user: gm ? users.get('gm') : users.get('u1'), actors: {contents: [mira, ash]}, users, modules: new Map(),
    settings: {get: (m, k) => k === CODEX_ACCESS_SETTING ? true : null}};
  return {game, flags, sets, users, svc: createCodexService({game, moduleId: 'ashen-gate-manager'}),
    /** A Sync / re-import rewrites the stored record. */
    resync: patch => { source = {sourceId: ID, definition: {...def(), ...patch}}; }, source: () => source};
}
const asPlayer = (w, id = 'u1') => w.svc.forUser(id, {});

test('edits are a world layer: stored in the Codex flag, never in source.definition, and they survive a Sync re-read', async () => {
  const w = world();
  const before = structuredClone(w.source());
  await w.svc.setDetails(ID, {edits: {role: 'Harbour clerk', gm_notes: 'My note one\nMy note two', name: '[TEST] Mira V.'}});
  assert.deepEqual(w.source(), before, 'the pack record is untouched');
  assert.deepEqual(w.flags.get('codex').edits, {role: 'Harbour clerk', gm_notes: 'My note one\nMy note two', name: '[TEST] Mira V.'});
  // Sync rewrites the record with new pack text for the same fields and a new field.
  w.resync({role: 'PACK-ROLE-V2', wants: 'PACK-WANTS-V2', name: '[TEST] Mira Vane II'});
  const g = w.svc.get(ID);
  assert.equal(g.name, '[TEST] Mira V.');
  assert.equal(g.fields.find(f => f.key === 'role').value, 'Harbour clerk');
  assert.equal(g.fields.find(f => f.key === 'role').edited, true);
  assert.equal(g.fields.find(f => f.key === 'wants').value, 'PACK-WANTS-V2', 'unedited fields follow the new pack text');
  assert.equal(g.fields.find(f => f.key === 'wants').edited, false);
  assert.deepEqual(g.gmFields.find(f => f.key === 'gm_notes').value, ['My note one', 'My note two']);
  assert.deepEqual(w.flags.get('codex').edits, {role: 'Harbour clerk', gm_notes: 'My note one\nMy note two', name: '[TEST] Mira V.'});
});

test('revert: null removes the edit; text equal to the pack text is not an edit; the editor lists pack and current text', async () => {
  const w = world();
  await w.svc.setDetails(ID, {edits: {role: 'Harbour clerk', wants: 'Edited wants'}});
  let g = w.svc.get(ID);
  assert.equal(g.editFields.find(f => f.key === 'role').pack, 'Ferry clerk');
  assert.equal(g.editFields.find(f => f.key === 'role').value, 'Harbour clerk');
  await w.svc.revertEdit(ID, 'role');
  assert.deepEqual(w.flags.get('codex').edits, {wants: 'Edited wants'});
  assert.equal(w.svc.get(ID).fields.find(f => f.key === 'role').value, 'Ferry clerk');
  // Saving the pack text back (what the Revert button does in the form) also drops the edit.
  await w.svc.setDetails(ID, {edits: {wants: 'PACK-WANTS'}});
  assert.deepEqual(w.flags.get('codex').edits, {});
  g = w.svc.get(ID);
  assert.equal(g.editFields.every(f => !f.edited), true);
});

test('guards: only a GM may edit; players are refused in the data layer and nothing is written', async () => {
  const w = world({gm: false});
  for (const call of [() => w.svc.setDetails(ID, {edits: {role: 'x'}}), () => w.svc.setDetails(ID, {status: 'deceased'}),
    () => w.svc.revertEdit(ID, 'role'), () => w.svc.backupLayer(), () => w.svc.get(ID), () => w.svc.list()]) {
    await assert.rejects(Promise.resolve().then(call), /Only a GM/);
  }
  assert.deepEqual(w.sets, []);
});

test('refusals change nothing: stat block, unknown field, blank name, bad status, non-text', async () => {
  const w = world();
  await w.svc.setDetails(ID, {edits: {role: 'Kept'}});
  w.sets.length = 0;
  await assert.rejects(w.svc.setDetails(ID, {edits: {role: 'Lost', stat_block: 'Dragon'}}), /stat block is read-only/);
  await assert.rejects(w.svc.setDetails(ID, {edits: {nope: 'x'}}), /cannot be edited/);
  await assert.rejects(w.svc.setDetails(ID, {edits: {name: '   '}}), /cannot be blank/);
  await assert.rejects(w.svc.setDetails(ID, {edits: {role: 5}}), /must be text/);
  await assert.rejects(w.svc.setDetails(ID, {status: 'undead'}), /Status must be one of/);
  assert.deepEqual(w.sets, []);
  assert.deepEqual(w.flags.get('codex').edits, {role: 'Kept'});
});

test('length caps like learned and notes; line endings normalised; only known fields survive a restore', async () => {
  const w = world();
  await w.svc.setDetails(ID, {edits: {name: 'N'.repeat(500), role: 'R'.repeat(900), wants: 'W'.repeat(5000), gm_notes: 'G'.repeat(9000)}});
  const e = w.flags.get('codex').edits;
  assert.deepEqual([e.name.length, e.role.length, e.wants.length, e.gm_notes.length], [200, 400, 4000, 8000]);
  assert.equal(setEdits({}, {def: def()}, {knows: 'a\r\nb'}).edits.knows, 'a\nb');
  assert.deepEqual(normalizeState({edits: {role: 'ok', stat_block: 'x', bogus: 'y', wants: 7}}).edits, {role: 'ok'});
});

test('player projection: revealed fields use the EDITED text; GM-only fields (even edited) and hidden fields never reach a player', async () => {
  const w = world();
  await w.svc.setDetails(ID, {edits: {wants: 'EDITED-WANTS', knows: 'EDITED-KNOWS-HIDDEN', portrayal: 'SECRET-EDIT-PORTRAYAL',
    session_role: 'SECRET-EDIT-SESSION', gm_notes: 'SECRET-EDIT-NOTE', name: '[TEST] Mira (edited)'}, status: 'deceased', notes: 'SECRET-GM-NOTES'});
  await w.svc.setReveal(ID, 'discovery', {mode: 'party'});
  await w.svc.setReveal(ID, 'wants', {mode: 'actor', actorId: 'a1'});
  const mine = asPlayer(w);
  assert.equal(mine[0].name, '[TEST] Mira (edited)');
  assert.deepEqual(mine[0].fields.map(f => [f.key, f.value]), [['wants', 'EDITED-WANTS']]);
  const text = JSON.stringify(mine);
  for (const secret of ['SECRET', 'PACK-PORTRAYAL', 'PACK-SESSION', 'PACK-NOTE', 'EDITED-KNOWS-HIDDEN', 'Commoner', 'eceased', 'deceased']) assert.ok(!text.includes(secret), `leaked ${secret}`);
  await assert.rejects(w.svc.setReveal(ID, 'portrayal', {mode: 'party'}), /GM-only/);
  await assert.rejects(w.svc.setRevealMany(ID, {fields: ['gm_notes'], mode: 'party'}), /GM-only/);
  // An edited name does not show before the NPC is discovered.
  await w.svc.setReveal(ID, 'discovery', {mode: 'hidden'});
  assert.deepEqual(asPlayer(w), []);
});

test('status: defaults to Alive, takes alive / deceased / unknown, saves with the details, touches no Actor', async () => {
  const w = world();
  assert.deepEqual(STATUS_VALUES, ['alive', 'deceased', 'unknown']);
  assert.equal(w.svc.get(ID).life.value, 'alive');
  assert.equal(w.svc.get(ID).life.showChip, false);
  for (const [v, chip] of [['deceased', 'Deceased'], ['unknown', 'Status unknown'], ['alive', 'Alive']]) {
    await w.svc.setDetails(ID, {status: v});
    assert.equal(w.flags.get('codex').status, v);
    assert.equal(w.svc.get(ID).life.chip, chip);
  }
  assert.ok(w.sets.every(k => k === 'codex'), 'only the Codex flag is written (no Actor update, token or combat state)');
  assert.equal(normalizeState({status: 'zombie'}).status, 'alive');
  assert.equal(normalizeState(null).status, 'alive');
});

test('status is reveal-governed: hidden shows nothing at all; revealed shows text; presets and defaults keep it hidden', async () => {
  const w = world();
  await w.svc.setDetails(ID, {status: 'deceased'});
  await w.svc.setReveal(ID, 'discovery', {mode: 'party'});
  await w.svc.setReveal(ID, 'role', {mode: 'party'});
  let entry = asPlayer(w)[0];
  assert.ok(!entry.fields.some(f => f.key === 'status'));
  assert.doesNotMatch(renderPlayerCodexHtml([entry]), /eceased|Status|life/i);
  // Presets never reveal it.
  assert.ok(REVEAL_FIELDS.includes('status'));
  assert.ok(!presetKeys('basics').includes('status') && !presetKeys('everything').includes('status'));
  await w.svc.setRevealMany(ID, {preset: 'everything', mode: 'party'});
  assert.ok(!asPlayer(w)[0].fields.some(f => f.key === 'status'), 'Reveal everything player-safe leaves Status hidden');
  assert.equal(normalizeState(null, {codex: {default_reveal: {discovery: 'party', fields: {role: 'party'}}}}).fields.status.party, false);
  // Revealed on its own: the text chip appears beside the name, in the player view.
  await w.svc.setReveal(ID, 'status', {mode: 'party'});
  entry = asPlayer(w)[0];
  assert.deepEqual(entry.fields.find(f => f.key === 'status'), {key: 'status', label: 'Status', value: 'Deceased', status: 'deceased', onlyYou: false});
  const html = renderPlayerCodexHtml([entry]);
  assert.match(html, /<h3>\[TEST\] Mira Vane <span class="ag-badge agm-codex-life agm-codex-life--deceased">Deceased<\/span><\/h3>/);
  assert.doesNotMatch(html, /<dt>Status/, 'shown as a chip, not as a row');
  await w.svc.setDetails(ID, {status: 'unknown'});
  assert.match(renderPlayerCodexHtml(asPlayer(w)), />Status unknown<\/span>/);
});

test('bulk dialog lists Status as its own revealable field (so it can be ticked deliberately)', async () => {
  const w = world();
  const keys = w.svc.get(ID).fields.map(f => f.key);
  assert.deepEqual(keys, REVEAL_FIELDS);
  await w.svc.setRevealMany(ID, {fields: ['status'], mode: 'party'});
  assert.equal(w.flags.get('codex').fields.status.party, true);
});

test('GM view: exactly one "Only you" chip, by the name; GM-only fields get a quiet cue, not a tag each', () => {
  const tpl = read('../templates/manager.hbs');
  const detail = tpl.slice(tpl.indexOf('{{#with codex.detail}}'), tpl.indexOf('<p class="aglib-status" role="status">{{codex.message}}'));
  const chips = detail.match(/<span class="ag-badge agcodex-onlyyou"[^>]*>Only you<\/span>/g) ?? [];
  assert.equal(chips.length, 1);
  assert.ok(detail.indexOf('agcodex-onlyyou') < detail.indexOf('{{{../codex.tabsHtml}}}'), 'in the header beside the name');
  assert.doesNotMatch(detail, /ag-badge(?![^>]*agcodex-onlyyou)[^>]*>\s*(Only you|GM only)\s*</i);
  // The cue on a GM-only field: lock icon, tooltip "Only you", and text for assistive tech.
  assert.match(detail, /agcodex-lock" data-tooltip="Only you"[^>]*><i class="fa-solid fa-lock" aria-hidden="true"><\/i><span class="ag-sr-only">Only you<\/span>/);
  assert.match(detail, /agcodex-editrow--gm/);
  assert.doesNotMatch(detail, /GM only: never sent to players/);
  const css = read('../styles/manager.css');
  assert.match(css, /\.agcodex-editrow--gm\{[^}]*border-left/);
});

test('Only you chip data: shown while the NPC is hidden from players or the record is GM-only, not after both are lifted', async () => {
  const w = world();
  assert.equal(w.svc.get(ID).onlyYou, true);
  w.resync({visibility: 'player'});
  assert.equal(w.svc.get(ID).onlyYou, true, 'hidden from players');
  await w.svc.setReveal(ID, 'discovery', {mode: 'party'});
  assert.equal(w.svc.get(ID).onlyYou, false);
});

test('editor markup: Edited in your world marker, Revert to pack text, status select, one Save Changes, focus kept', () => {
  const tpl = read('../templates/manager.hbs'), js = read('../scripts/main.js');
  const form = tpl.slice(tpl.indexOf('data-ag-codex-form'), tpl.indexOf('{{#if ../codex.onPreview}}'));
  assert.match(form, /Edited in your world/);
  assert.match(form, /data-ag-codex-revert="\{\{key\}\}" aria-label="Revert \{\{label\}\} to pack text">Revert to pack text</);
  assert.match(form, /<select id="agcodex-status" data-ag-codex-status-select/);
  for (const key of EDIT_FIELDS) assert.ok(read('../scripts/codex.js').includes(`'${key}'`));
  assert.equal((form.match(/data-ag-action="codex-save"/g) ?? []).length, 1);
  assert.match(form, /data-ag-action="codex-cancel">Cancel<[\s\S]*codex-save"/, 'Cancel left, Save Changes right');
  assert.match(form, /role="status" data-ag-codex-status/);
  // Save and Cancel put focus back on their own button after the re-render; a refused save keeps the draft.
  assert.match(js, /this\.codexGuard\.markClean\(\);this\.focusAfterRender='\[data-ag-action="codex-save"\]'/);
  assert.match(js, /this\.focusAfterRender='\[data-ag-action="codex-cancel"\]'/);
  assert.match(js, /catch\(error\)\{toast\(error\.message,true\);this\.codexMessage=error\.message;this\.focusAfterRender='\[data-ag-action="codex-save"\]';break;\}/);
  // Revert puts the pack text in the field as an unsaved change and keeps focus there; edits ride in the same draft.
  assert.match(js, /el\.value=el\.dataset\.pack\?\?'';el\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\);el\.focus\?\.\(\)/);
  assert.match(js, /status:form\.querySelector\('\[data-ag-codex-status-select\]'\)\?\.value,edits:this\.#readCodexEdits\(form\)/);
  // Leaving with unsaved edits asks first: sub-tab switch and top-level tab switch.
  assert.match(js, /key==='codexTab'&&el\.dataset\.tab!==this\.codexTab\)\{if\(!\(await this\.codexGuard\.confirm\(\)\)\)return;/);
  assert.match(js, /this\.tab==='codex'&&tab!=='codex'\)\{if\(!\(await this\.codexGuard\.confirm\(\)\)\)return;/);
});

test('export and restore carry the layer (additive keys; schema string unchanged)', async () => {
  const w = world();
  await w.svc.setDetails(ID, {edits: {role: 'Harbour clerk'}, status: 'deceased', learned: 'L'});
  const file = w.svc.exportAll();
  assert.equal(file.schema_version, 'ag-npc-codex-export/0.1');
  assert.equal(file.reveals[ID].edits.role, 'Harbour clerk');
  assert.equal(file.reveals[ID].status, 'deceased');
  const plan = planRevealsImport(file, [ID]);
  assert.equal(plan.apply[0].state.edits.role, 'Harbour clerk');
  assert.equal(plan.apply[0].state.status, 'deceased');
  assert.equal(buildCodexExport([{def: def(), state: null}]).reveals[ID].status, 'alive');
});

function backupGame(w) {
  const list = contents => ({contents, [Symbol.iterator]: () => contents[Symbol.iterator]()});
  return {user: w.game.user, world: {id: 'w'}, modules: new Map(), users: w.game.users, settings: w.game.settings,
    items: list([]), journal: list([]), actors: list(w.game.actors.contents), tables: list([]), macros: list([])};
}

test('backup: manager-edits.json gains an additive npc_codex layer (edits, status, learned, notes, links, reveals); schema unchanged', async () => {
  const w = world();
  await w.svc.setDetails(ID, {edits: {role: 'Harbour clerk', gm_notes: 'My note'}, status: 'unknown', learned: 'She counts twice.', notes: 'GM jotting', links: 'LOC-TEST-GATE'});
  await w.svc.setReveal(ID, 'discovery', {mode: 'party'});
  await w.svc.setReveal(ID, 'wants', {mode: 'actor', actorId: 'a1'});
  const p = bk.collectBackup(backupGame(w), {selection: ['Actor']});
  assert.equal(p.ok, true);
  const file = JSON.parse(p.files[0].text);
  assert.equal(file.schema, 'ag-world-edits/0.1');
  assert.ok(Array.isArray(file.records) && Array.isArray(file.world_only), 'existing keys unchanged');
  assert.equal(file.npc_codex.length, 1);
  const row = file.npc_codex[0];
  assert.equal(row.id, ID);
  assert.equal(row.pack_name, '[TEST] Mira Vane');
  assert.deepEqual([row.status, row.learned, row.notes, row.links], ['unknown', 'She counts twice.', 'GM jotting', ['LOC-TEST-GATE']]);
  assert.deepEqual(row.edits, {role: 'Harbour clerk', gm_notes: 'My note'});
  assert.deepEqual(row.discovery, {party: true, actors: []});
  assert.deepEqual(row.reveals.wants, {party: false, actors: ['a1']});
  assert.deepEqual(row.actor_names, {a1: '[TEST] Ash'});
  // Not ticked: not written. NPCs with no saved Codex state add no row.
  assert.ok(!('npc_codex' in JSON.parse(bk.collectBackup(backupGame(w), {selection: ['Item']}).files[0].text)));
  const fresh = world();
  assert.deepEqual(JSON.parse(bk.collectBackup(backupGame(fresh), {selection: ['Actor']}).files[0].text).npc_codex, []);
});

test('backup layer is GM-only', () => {
  const w = world({gm: false});
  assert.equal(bk.collectBackup(backupGame(w), {selection: ['Actor']}).ok, false);
});

test('version 0.96.0, 0.x only, download URL, changelog, README, Help and schema doc mention the work', () => {
  const m = JSON.parse(read('../module.json'));
  assert.equal(m.version, '0.98.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.98.0/ashen-gate-manager.zip')); assert.match(m.version, /^0\./);
  const log = read('../CHANGELOG.md');
  assert.match(log, /^## 0\.96\.0 /m);
  const top = log.split('## 0.95.0')[0];
  for (const re of [/Edited in your world/, /Revert to pack text/, /Status/, /Only you/, /npc_codex/, /mocked/i]) assert.match(top, re);
  assert.match(read('../README.md'), /0\.96\.0/);
  assert.match(read('../scripts/main.js'), /Edit details/);
  const doc = read('../../../docs/npc-codex-schema.md');
  assert.match(doc, /`edits`/); assert.match(doc, /`status`/); assert.match(doc, /npc_codex/);
  assert.match(read('../../../docs/world-backup.md'), /npc_codex/);
});
