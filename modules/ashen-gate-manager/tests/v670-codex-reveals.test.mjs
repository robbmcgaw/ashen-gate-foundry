import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeState, applyReveals, undoReveals, checkRevealKeys, presetKeys, revealMessage, joinNames, playerEntry,
  REVEAL_KEYS, REVEAL_FIELDS, GM_FIELDS} from '../scripts/codex.js';
import {createCodexService} from '../scripts/codex-service.js';
import {defaultAudience, dialogFields, revealDialogHtml, readRevealDialog, revealDialogProblem, revealDialogSummary, bulkStatus}
  from '../scripts/codex-reveal-dialog.mjs';

// Synthetic data only.
const def = (over = {}) => ({
  id: 'NPC-TEST-MIRA', entity_type: 'NPC', status: 'draft', name: '[TEST] Mira Vane', role: 'Ferry clerk', appearance: 'Ink-stained cuffs.',
  signature_line: 'Coin or names.', wants: 'Her brother off the roster.', knows: '', portrayal: 'SECRET-PORTRAYAL', session_role: 'SECRET-SESSION',
  gm_notes: ['SECRET-NOTE'], stat_block: 'SECRET-STATS', ...over
});
function world({isGM = true} = {}) {
  const flags = new Map(); let writes = 0;
  const mira = {id: 'mira', uuid: 'Actor.mira', name: 'Mira', img: 'm.webp', type: 'npc',
    getFlag: (m, k) => k === 'source' ? {sourceId: 'NPC-TEST-MIRA', definition: def()} : flags.get(k) ?? null,
    setFlag: async (m, k, v) => { writes++; flags.set(k, structuredClone(v)); }};
  const pc = (id, name, user) => ({id, name, type: 'character', hasPlayerOwner: true, getFlag: () => null, testUserPermission: u => u.id === user});
  const users = new Map([['u1', {id: 'u1', name: 'Sam', isGM: false, active: true}], ['u2', {id: 'u2', name: 'Kit', isGM: false, active: false}],
    ['gm', {id: 'gm', name: 'GM', isGM: true, active: true}]]);
  const game = {user: {id: isGM ? 'gm' : 'u1', isGM}, actors: {contents: [mira, pc('a1', '[TEST] Ash', 'u1'), pc('a2', '[TEST] Bo', 'u2')]},
    users, modules: new Map(), settings: {get: () => true}};
  return {flags, writes: () => writes, svc: createCodexService({game, moduleId: 'ashen-gate-manager'})};
}
const ID = 'NPC-TEST-MIRA';

test('0.67.0: applyReveals sets many fields to one audience, adds characters, is idempotent', () => {
  let r = applyReveals(null, {keys: ['role', 'appearance', 'discovery'], mode: 'actors', actorIds: ['a1']});
  assert.deepEqual(r.keys, ['discovery', 'role', 'appearance'], 'display order');
  assert.deepEqual(r.changed, ['discovery', 'role', 'appearance']);
  assert.deepEqual(r.state.fields.role, {party: false, actors: ['a1']});
  const again = applyReveals(r.state, {keys: ['role', 'appearance', 'discovery'], mode: 'actors', actorIds: ['a1']});
  assert.deepEqual(again.changed, [], 'same call twice changes nothing');
  assert.deepEqual(again.state, r.state);
  r = applyReveals(r.state, {keys: ['role'], mode: 'actors', actorIds: ['a2']});
  assert.deepEqual(r.state.fields.role.actors, ['a1', 'a2'], 'characters are added, not replaced');
  r = applyReveals(r.state, {keys: ['role'], mode: 'party'});
  assert.equal(r.state.fields.role.party, true);
  const noDowngrade = applyReveals(r.state, {keys: ['role'], mode: 'actors', actorIds: ['a3']});
  assert.deepEqual(noDowngrade.changed, [], 'a field shown to the party is not narrowed or cluttered');
  const hid = applyReveals(r.state, {keys: ['role', 'appearance'], mode: 'hidden'});
  assert.deepEqual(hid.state.fields.role, {party: false, actors: []});
  assert.deepEqual(hid.changed, ['role', 'appearance']);
});

test('0.67.0: GM-only and unknown keys are refused and change nothing (all or nothing)', () => {
  const s = normalizeState(null);
  for (const key of GM_FIELDS) {
    assert.throws(() => applyReveals(s, {keys: ['role', key], mode: 'party'}), /GM-only/);
    assert.throws(() => checkRevealKeys([key]), /GM-only/);
  }
  assert.throws(() => applyReveals(s, {keys: ['role', 'nope'], mode: 'party'}), /not a Codex field/);
  assert.throws(() => applyReveals(s, {keys: [], mode: 'party'}), /at least one field/);
  assert.throws(() => applyReveals(s, {keys: ['role'], mode: 'actors', actorIds: []}), /at least one character/);
  assert.throws(() => applyReveals(s, {keys: ['role'], mode: 'maybe'}), /hidden, party or characters/);
  assert.deepEqual(s, normalizeState(null), 'input state is not mutated');
  assert.ok(!REVEAL_KEYS.some(k => GM_FIELDS.includes(k)));
  assert.deepEqual(presetKeys('basics'), ['discovery', 'role', 'appearance']);
  assert.deepEqual(presetKeys('everything'), ['discovery', ...REVEAL_FIELDS]);
  assert.throws(() => presetKeys('all'), /Unknown preset/);
});

test('0.67.0: undoReveals restores only while the fields are as that action left them', () => {
  const base = applyReveals(null, {keys: ['role'], mode: 'actors', actorIds: ['a1']}).state;
  const act = applyReveals(base, {keys: ['role', 'wants'], mode: 'party'});
  const undone = undoReveals(act.state, act);
  assert.deepEqual(undone.state.fields.role, {party: false, actors: ['a1']});
  assert.deepEqual(undone.state.fields.wants, {party: false, actors: []});
  const moved = applyReveals(act.state, {keys: ['wants'], mode: 'hidden'}).state;
  assert.throws(() => undoReveals(moved, act), /cannot be undone safely/);
  assert.throws(() => undoReveals(act.state, {before: {}, after: {}}), /nothing to undo/);
});

test('0.67.0: messages name the audience', () => {
  assert.equal(joinNames(['Aldric', 'Merra']), 'Aldric and Merra');
  assert.equal(joinNames(['A', 'B', 'C']), 'A, B and C');
  assert.equal(revealMessage({count: 3, mode: 'actors', names: ['Aldric', 'Merra']}), 'Revealed 3 fields to Aldric and Merra.');
  assert.equal(revealMessage({count: 1, mode: 'party', already: 1}), 'Revealed 1 field to the whole party (1 already was visible).');
  assert.equal(revealMessage({count: 2, mode: 'hidden'}), 'Hid 2 fields from players.');
});

test('0.67.0: service reveals to characters (by id or name) in one write; the player gets exactly those fields', async () => {
  const {svc, flags, writes} = world();
  const out = await svc.revealTo(ID, {characters: ['a1', '[test] bo'], fields: ['discovery', 'role', 'wants']});
  assert.equal(writes(), 1, 'one write for three fields and two characters');
  assert.equal(out.message, 'Revealed 3 fields to [TEST] Ash and [TEST] Bo.');
  assert.deepEqual(flags.get('codex').fields.role.actors, ['a1', 'a2']);
  assert.deepEqual(svc.forUser('u1')[0].fields.map(f => f.key), ['role', 'wants']);
  const wire = JSON.stringify([svc.forUser('u1'), svc.forUser('u2'), svc.previewAs([])]);
  for (const secret of ['SECRET-PORTRAYAL', 'SECRET-SESSION', 'SECRET-NOTE', 'SECRET-STATS']) assert.ok(!wire.includes(secret), secret);
  const again = await svc.revealTo(ID, {characters: ['a1', 'a2'], fields: ['discovery', 'role', 'wants']});
  assert.deepEqual(again.changed, []);
  assert.equal(writes(), 1, 'repeating it writes nothing');
  assert.match(again.message, /3 already were visible/);
});

test('0.67.0: party and presets; presets skip empty fields and never include GM fields', async () => {
  const {svc, flags} = world();
  const basics = await svc.revealTo(ID, {party: true, preset: 'basics'});
  assert.deepEqual(basics.keys, ['discovery', 'role', 'appearance']);
  assert.equal(flags.get('codex').discovery.party, true);
  assert.equal(flags.get('codex').fields.wants.party, false);
  const all = await svc.revealTo(ID, {party: true, preset: 'everything'});
  // knows is empty, learned is empty and there are no links on this record
  assert.deepEqual(all.keys, ['discovery', 'role', 'appearance', 'signature_line', 'wants']);
  assert.deepEqual(all.changed, ['signature_line', 'wants']);
  const entry = svc.forUser('u2')[0];
  assert.deepEqual(entry.fields.map(f => f.key), ['role', 'appearance', 'signature_line', 'wants']);
  for (const key of GM_FIELDS) assert.ok(!JSON.stringify(flags.get('codex')).includes(key), `${key} is not in saved reveals`);
});

test('0.67.0: setRevealMany can hide, and refuses bad input without writing', async () => {
  const {svc, writes} = world();
  await svc.revealTo(ID, {party: true, fields: ['role', 'appearance']});
  const before = writes();
  const hid = await svc.setRevealMany(ID, {fields: ['role', 'appearance'], mode: 'hidden'});
  assert.equal(hid.message, 'Hid 2 fields from players.');
  assert.equal(writes(), before + 1);
  const bad = [
    () => svc.setRevealMany(ID, {fields: ['role', 'gm_notes'], mode: 'party'}),
    () => svc.setRevealMany(ID, {fields: ['portrayal'], mode: 'party'}),
    () => svc.setRevealMany(ID, {fields: ['role'], mode: 'actors', characters: ['a1', 'a9']}),
    () => svc.setRevealMany(ID, {fields: ['role'], mode: 'actors', characters: ['[TEST] Nobody']}),
    () => svc.setRevealMany(ID, {fields: ['role'], mode: 'actors', characters: []}),
    () => svc.setRevealMany(ID, {fields: ['role'], preset: 'basics', mode: 'party'}),
    () => svc.setRevealMany('NPC-TEST-NOPE', {fields: ['role'], mode: 'party'}),
    () => svc.revealTo(ID, {party: true, characters: ['a1'], preset: 'basics'}),
    () => svc.revealTo(ID, {preset: 'basics'}),
    () => svc.revealTo(ID, {party: true})
  ];
  for (const call of bad) await assert.rejects(call());
  assert.equal(writes(), before + 1, 'a refused call never writes');
});

test('0.67.0: a player cannot call any bulk, undo or character function', async () => {
  const {svc, writes} = world({isGM: false});
  await assert.rejects(svc.revealTo(ID, {party: true, preset: 'basics'}), /Only a GM/);
  await assert.rejects(svc.setRevealMany(ID, {fields: ['role'], mode: 'party'}), /Only a GM/);
  await assert.rejects(svc.undoReveal(ID), /Only a GM/);
  assert.throws(() => svc.canUndoReveal(ID), /Only a GM/);
  assert.throws(() => svc.characters(), /Only a GM/);
  assert.equal(writes(), 0);
});

test('0.67.0: undo puts back the last bulk reveal for that NPC, once, and not after a later change', async () => {
  const {svc, flags} = world();
  await svc.setReveal(ID, 'role', {mode: 'actor', actorId: 'a1'});
  assert.equal(svc.canUndoReveal(ID), false);
  await assert.rejects(svc.undoReveal(ID), /no reveal to undo/);
  await svc.revealTo(ID, {party: true, fields: ['role', 'wants']});
  assert.equal(svc.canUndoReveal(ID), true);
  const out = await svc.undoReveal(ID);
  assert.match(out.message, /Undid the last reveal on \[TEST\] Mira Vane/);
  assert.deepEqual(flags.get('codex').fields.role, {party: false, actors: ['a1']});
  assert.equal(flags.get('codex').fields.wants.party, false);
  assert.equal(svc.canUndoReveal(ID), false);
  await svc.revealTo(ID, {party: true, fields: ['wants']});
  await svc.setReveal(ID, 'wants', {mode: 'hidden'});
  await assert.rejects(svc.undoReveal(ID), /cannot be undone safely/);
});

test('0.67.0: characters() lists owners and who is online; existing reveals keep their shape (no migration)', async () => {
  const {svc, flags} = world();
  assert.deepEqual(svc.characters().map(c => [c.id, c.owners, c.present]), [['a1', ['Sam'], true], ['a2', ['Kit'], false]]);
  await svc.setReveal(ID, 'wants', {mode: 'actor', actorId: 'a1'});
  const saved = structuredClone(flags.get('codex'));
  await svc.revealTo(ID, {characters: ['a1'], fields: ['wants']});
  assert.deepEqual(flags.get('codex'), saved, 'revealing what is already revealed leaves the saved state byte-identical');
  assert.deepEqual(Object.keys(saved).sort(), ['discovery', 'fields', 'learned', 'links', 'notes', 'version']);
});

test('0.67.0: Reveal to... dialog markup, defaults and form reading', () => {
  const chars = [{id: 'a1', name: '[TEST] Ash', owners: ['Sam'], present: true}, {id: 'a2', name: 'Bo <b>', owners: [], present: false}];
  assert.deepEqual(defaultAudience(chars), {audience: 'chosen', characterIds: ['a1']}, 'only the players online');
  assert.deepEqual(defaultAudience([{id: 'a', present: true}, {id: 'b', present: true}]).audience, 'party');
  assert.deepEqual(defaultAudience([{id: 'a', present: false}]).audience, 'party');
  const entry = {name: '[TEST] Mira', discoveryLabel: 'Hidden', fields: [
    {key: 'role', label: 'Role', empty: false, who: 'Party'}, {key: 'appearance', label: 'Appearance', empty: false, who: 'Hidden'},
    {key: 'signature_line', label: 'Signature line', empty: false, who: 'Hidden'}, {key: 'wants', label: 'Wants', empty: false, who: 'Hidden'},
    {key: 'knows', label: 'Knows', empty: true, who: 'Hidden'}, {key: 'learned', label: 'What the party has learned', empty: true, who: 'Hidden'},
    {key: 'links', label: 'Connections', empty: true, who: 'Hidden'}]};
  const fields = dialogFields(entry);
  assert.deepEqual(fields.map(f => f.key), REVEAL_KEYS);
  const html = revealDialogHtml({name: entry.name, characters: chars, fields});
  for (const gm of GM_FIELDS) assert.ok(!html.includes(`value="${gm}"`), `${gm} is never offered`);
  assert.match(html, /name="field" value="role" checked/);
  assert.doesNotMatch(html, /value="wants" checked/, 'only public-facing fields are ticked by default');
  assert.match(html, /name="field" value="knows" disabled/);
  assert.match(html, /name="character" value="a1" checked/);
  assert.doesNotMatch(html, /name="character" value="a2" checked/);
  assert.match(html, /Bo &lt;b&gt;/);
  assert.match(html, /\(Sam\)/);
  assert.match(html, /<legend>Who learns it<\/legend>/);
  // read a form shaped like the dialog's
  const el = (name, value, checked, disabled = false) => ({name, value, checked, disabled});
  const form = {elements: [el('audience', 'party', false), el('audience', 'chosen', true), el('character', 'a1', true), el('character', 'a2', false),
    el('field', 'role', true), el('field', 'knows', true, true), el('field', 'wants', true)]};
  const pick = readRevealDialog(form);
  assert.deepEqual(pick, {mode: 'actors', characters: ['a1'], fields: ['role', 'wants']}, 'disabled (empty) fields are never read');
  assert.equal(revealDialogProblem(pick), '');
  assert.match(revealDialogProblem({...pick, characters: []}), /at least one character/);
  assert.match(revealDialogProblem({...pick, fields: []}), /at least one field/);
  assert.equal(revealDialogSummary(pick, chars), 'Will reveal 2 fields to [TEST] Ash.');
  assert.equal(revealDialogSummary({mode: 'party', characters: [], fields: ['role']}, chars), 'Will reveal 1 field to the whole party.');
});

test('0.67.0: the Reveals panel status follows the ticks', () => {
  assert.deepEqual(bulkStatus({count: 0, mode: 'party'}), {label: 'Apply to 0 fields', disabled: true, presetsOk: true, hint: 'Tick at least one field.'});
  const one = bulkStatus({count: 1, mode: 'actors', charCount: 0});
  assert.equal(one.label, 'Apply to 1 field'); assert.equal(one.disabled, true); assert.equal(one.presetsOk, false);
  assert.match(one.hint, /at least one character/);
  assert.equal(bulkStatus({count: 4, mode: 'actors', charCount: 2}).disabled, false);
  const hid = bulkStatus({count: 4, mode: 'hidden'});
  assert.equal(hid.disabled, false); assert.equal(hid.presetsOk, false);
});

test('0.67.0: wiring in the window, the sheet header and the API', () => {
  const tpl = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  for (const hook of ['data-ag-codex-revealto="{{id}}"', 'data-ag-codex-bulk-key="{{key}}"', 'data-ag-codex-bulk-mode', 'data-ag-codex-bulk-char',
    'data-ag-codex-bulk-keys="all"', 'data-ag-codex-bulk-chars="none"', 'data-ag-action="codex-bulk-apply"', 'data-ag-action="codex-preset-basics"',
    'data-ag-action="codex-preset-everything"', 'data-ag-action="codex-undo"', 'aria-label="Reveal {{name}} to players…"', 'role="status" aria-live="polite" data-ag-codex-note'])
    assert.ok(tpl.includes(hook), hook);
  assert.ok(!/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/.test(tpl.slice(tpl.indexOf('agcodex-rowwrap'), tpl.indexOf('aglib-selbar'))), 'no button nested in a button in the list');
  assert.match(main, /Hooks\.on\('getHeaderControlsApplicationV2'/);
  assert.match(main, /if\(!game\.user\?\.isGM\|\|!Array\.isArray\(controls\)/);
  assert.match(main, /setRevealMany:\(id,opts\)=>codexService\(\)\.setRevealMany\(id,opts\), revealTo:/);
  assert.match(main, /title:'Hide these fields from players\?'/);
});
