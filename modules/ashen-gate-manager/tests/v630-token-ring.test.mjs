/** 0.63.0 Items → Assets: Foundry's token ring when art is linked to an Actor. Synthetic [TEST] ids and a mocked world:
 *  this proves the rule, the update shape and the wiring in the source, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ringKindFor, ringUpdateFor, tokenRingUpdateFor, RING_KINDS, RING_RULES, RING_SUBJECT_SCALE} from '../scripts/token-ring.js';
import {planAssetLinks, applyAssetLinks} from '../scripts/assets.js';

const M = 'ashen-gate-manager', GM = {isGM: true}, P = 'https://assets.test/u1/art/';
const f = name => ({name, path: `${P}${name}`});
const actor = (sourceId, extra = {}) => ({documentName: 'Actor', type: 'npc', sourceId, ...extra});
const doc = (sourceId, name, extra = {}) => ({uuid: `Actor.${sourceId}`, documentName: 'Actor', type: 'npc', name, sourceId, img: '', tokenImg: '', flags: {}, ...extra});
const world = (docs, ring = {}) => {
  const written = [];
  const live = new Map(docs.map(d => [d.uuid, {...d, id: d.uuid.replace('.', '_'), prototypeToken: {texture: {src: d.tokenImg}, ring: ring[d.uuid] ?? {enabled: false, colors: {ring: null, background: null}}}}]));
  return {written, getDoc: u => live.get(u) ?? null, updateMany: async (documentName, updates) => { written.push({documentName, updates}); }};
};

test('colour rule: NPC people green, bestiary creatures red, Ashen creatures black', () => {
  assert.equal(ringKindFor(actor('NPC-TEST-ONE')), RING_KINDS.person);
  assert.equal(ringKindFor(actor('CRE-TEST-BEAST')), RING_KINDS.creature);
  assert.equal(ringKindFor(actor('CRE-ASHEN-TEST')), RING_KINDS.ashen);
  assert.equal(ringKindFor(actor('CRE-ASH-TEST-SWARM')), RING_KINDS.ashen);
  assert.equal(ringKindFor(actor('cre-ashen-lower')), RING_KINDS.ashen);
  assert.deepEqual([RING_KINDS.person.label, RING_KINDS.creature.label, RING_KINDS.ashen.label], ['green', 'red', 'black']);
});

test('colour rule: a creature that merely starts with ASH is not Ashen, and unknown kinds have no rule', () => {
  assert.equal(ringKindFor(actor('CRE-ASHTRAY-TEST')), RING_KINDS.creature);
  assert.equal(ringKindFor(actor('CRE-HIDE-TEST')), RING_KINDS.creature);
  for (const id of ['', undefined, 'LOC-TEST', 'FAC-TEST', 'XNPC-TEST', 'NPCX']) assert.equal(ringKindFor(actor(id)), null, String(id));
  assert.equal(ringKindFor(actor('NPC-TEST-ONE', {type: 'character'})), null); // player characters
  assert.equal(ringKindFor(actor('NPC-TEST-ONE', {type: 'vehicle'})), null);
  assert.equal(ringKindFor({documentName: 'Item', type: 'npc', sourceId: 'NPC-X'}), null);
  assert.equal(ringKindFor(null), null);
  assert.ok(RING_RULES.findIndex(r => r.kind === 'ashen') < RING_RULES.findIndex(r => r.kind === 'creature'));
});

test('ring update: off → enabled with both colours; V14 field paths; subject left alone', () => {
  const out = ringUpdateFor({...actor('CRE-ASHEN-TEST'), prototypeToken: {ring: {enabled: false, colors: {ring: null, background: null}}}});
  assert.equal(out.status, 'enable');
  assert.deepEqual(out.update, {'prototypeToken.ring.enabled': true, 'prototypeToken.ring.colors.ring': '#000000', 'prototypeToken.ring.colors.background': '#2b2b2b', 'prototypeToken.ring.subject.scale': 0.6});
  assert.equal(RING_SUBJECT_SCALE, 0.6); // below 1 so Foundry pads the token and the ring frames square art (see token-ring.js)
  assert.ok(!Object.keys(out.update).some(k => k.includes('subject.texture')));
  assert.match(RING_KINDS.person.ring, /^#[0-9a-f]{6}$/i);
});

test('ring update: an existing configured ring is never touched; a GM colour on an off ring is kept', () => {
  const on = ringUpdateFor({...actor('NPC-TEST-ONE'), prototypeToken: {ring: {enabled: true, colors: {ring: '#123456', background: null}}}});
  assert.deepEqual(on, {update: {}, status: 'kept', look: RING_KINDS.person});
  const off = ringUpdateFor({...actor('NPC-TEST-ONE'), prototypeToken: {ring: {enabled: false, colors: {ring: '#123456', background: ''}}}});
  assert.deepEqual(Object.keys(off.update).sort(), ['prototypeToken.ring.colors.background', 'prototypeToken.ring.enabled', 'prototypeToken.ring.subject.scale']);
  const kept = ringUpdateFor({...actor('NPC-TEST-ONE'), prototypeToken: {ring: {enabled: false, subject: {scale: 0.85}}}}); // a GM-chosen scale stays
  assert.ok(!('prototypeToken.ring.subject.scale' in kept.update));
  assert.equal(ringUpdateFor({...actor('LOC-X'), prototypeToken: {}}).status, 'none');
  assert.equal(ringUpdateFor(actor('NPC-TEST-ONE')).status, 'enable'); // no prototypeToken at all
});

test('preview rows say which ring an Actor would get and whether it already has one', () => {
  const docs = [doc('NPC-TEST-ONE', 'Test Person'), doc('CRE-TEST-BEAST', 'Test Beast', {ringEnabled: true}), doc('FAC-TEST', 'Test Other')];
  const plan = planAssetLinks(docs, [f('NPC-TEST-ONE.webp'), f('CRE-TEST-BEAST.webp'), f('FAC-TEST.webp')]);
  const by = id => plan.rows.find(r => r.sourceId === id);
  assert.deepEqual([by('NPC-TEST-ONE').ringLabel, by('NPC-TEST-ONE').ringKept], ['green', false]);
  assert.deepEqual([by('CRE-TEST-BEAST').ringLabel, by('CRE-TEST-BEAST').ringKept], ['red', true]);
  assert.equal(by('FAC-TEST').ringLabel, '');
});

test('Link with the box ticked writes the ring with the images; nothing else; only ticked rows', async () => {
  const docs = [doc('NPC-TEST-ONE', 'Test Person'), doc('CRE-ASHEN-TEST', 'Test Ashen'), doc('CRE-TEST-BEAST', 'Test Beast'), doc('FAC-TEST', 'Test Other'), doc('NPC-TEST-TWO', 'Test Skipped')];
  const plan = planAssetLinks(docs, ['NPC-TEST-ONE', 'CRE-ASHEN-TEST', 'CRE-TEST-BEAST', 'FAC-TEST', 'NPC-TEST-TWO'].map(i => f(`${i}.webp`)));
  plan.rows.find(r => r.sourceId === 'NPC-TEST-TWO').checked = false;
  const w = world(docs);
  const out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany, tokenRing: true});
  assert.equal(out.ok, true);
  const upd = id => w.written.flatMap(x => x.updates).find(u => u._id === `Actor_${id}`);
  assert.deepEqual(upd('NPC-TEST-ONE'), {_id: 'Actor_NPC-TEST-ONE', img: `${P}NPC-TEST-ONE.webp`, 'prototypeToken.texture.src': `${P}NPC-TEST-ONE.webp`,
    'prototypeToken.ring.enabled': true, 'prototypeToken.ring.colors.ring': RING_KINDS.person.ring, 'prototypeToken.ring.colors.background': RING_KINDS.person.background, 'prototypeToken.ring.subject.scale': 0.6});
  assert.equal(upd('CRE-ASHEN-TEST')['prototypeToken.ring.colors.ring'], '#000000');
  assert.equal(upd('CRE-TEST-BEAST')['prototypeToken.ring.colors.ring'], RING_KINDS.creature.ring);
  assert.deepEqual(Object.keys(upd('FAC-TEST')).sort(), ['_id', 'img', 'prototypeToken.texture.src']); // no rule: no ring
  assert.equal(upd('NPC-TEST-TWO'), undefined);
  assert.match(out.message, /3 token ring\(s\) turned on/);
});

test('Link with the box unticked (or off by default in the function) writes no ring field', async () => {
  const docs = [doc('NPC-TEST-ONE', 'Test Person')];
  const plan = () => planAssetLinks(docs, [f('NPC-TEST-ONE.webp')]);
  for (const opts of [{tokenRing: false}, {}]) {
    const w = world(docs);
    await applyAssetLinks(plan().rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany, ...opts});
    assert.deepEqual(Object.keys(w.written[0].updates[0]).sort(), ['_id', 'img', 'prototypeToken.texture.src']);
  }
});

test('an Actor whose ring the GM already turned on keeps it exactly (read live at write time)', async () => {
  const docs = [doc('NPC-TEST-ONE', 'Test Person')];
  const w = world(docs, {'Actor.NPC-TEST-ONE': {enabled: true, colors: {ring: '#abcdef', background: '#fedcba'}}});
  const out = await applyAssetLinks(planAssetLinks(docs, [f('NPC-TEST-ONE.webp')]).rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany, tokenRing: true});
  assert.deepEqual(Object.keys(w.written[0].updates[0]).sort(), ['_id', 'img', 'prototypeToken.texture.src']);
  assert.match(out.message, /1 already had a ring/);
  assert.doesNotMatch(out.message, /turned on/);
});

test('a player character and a non-GM never get a ring', async () => {
  const pc = doc('NPC-TEST-PC', 'Test Hero', {type: 'character'});
  const w = world([pc]);
  await applyAssetLinks(planAssetLinks([pc], [f('NPC-TEST-PC.webp')]).rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany, tokenRing: true});
  assert.ok(!Object.keys(w.written[0].updates[0]).some(k => k.includes('ring')));
  const w2 = world([doc('NPC-TEST-ONE', 'Test Person')]);
  const denied = await applyAssetLinks(planAssetLinks([doc('NPC-TEST-ONE', 'Test Person')], [f('NPC-TEST-ONE.webp')]).rows, {user: {isGM: false}, moduleId: M, getDoc: w2.getDoc, updateMany: w2.updateMany, tokenRing: true});
  assert.equal(denied.ok, false);
  assert.equal(w2.written.length, 0);
});

test('wiring: the window has the box ticked by default, passes it to Link, and reads the live ring', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  const hbs = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  assert.match(main, /links:null, tokenRing:true,/);
  assert.match(main, /applyAssetLinks\(rows,\{[^}]*tokenRing:a\.tokenRing,sceneTokens:a\.tokenRing&&a\.sceneTokens,getTokens,updateTokens\}/);
  assert.match(main, /links:null, tokenRing:true, sceneTokens:true,/);
  assert.match(hbs, /data-ag-assets-scene-tokens \{\{#if assets\.sceneTokens\}\}checked\{\{\/if\}\}/);
  assert.match(main, /ringEnabled:doc\.documentName==='Actor'\?Boolean\(doc\.prototypeToken\?\.ring\?\.enabled\)/);
  assert.match(hbs, /data-ag-assets-token-ring \{\{#if assets\.tokenRing\}\}checked\{\{\/if\}\}> <strong>Turn on token ring<\/strong>/);
  assert.doesNotMatch(hbs, /Tokenizer/);
});

// ---- tokens already placed on scenes (0.66.1) ----
const sceneWorld = (docs, tokens) => {
  const w = world(docs), scenes = [];
  return {...w, scenes, getTokens: d => tokens.filter(t => t.actorId === d.id), updateTokens: async (sceneId, updates) => { scenes.push({sceneId, updates}); }};
};

test('token update: ring off → on with blanks filled; ring already on → untouched', () => {
  const look = RING_KINDS.creature;
  assert.deepEqual(tokenRingUpdateFor(look, {ring: {enabled: false}}), {'ring.enabled': true, 'ring.colors.ring': look.ring, 'ring.colors.background': look.background, 'ring.subject.scale': 0.6});
  assert.deepEqual(tokenRingUpdateFor(look, {ring: {enabled: true, colors: {ring: '#111111'}}}), {});
  assert.deepEqual(Object.keys(tokenRingUpdateFor(look, {ring: {enabled: false, colors: {ring: '#111111', background: '#222222'}, subject: {scale: 0.9}}})), ['ring.enabled']);
  assert.deepEqual(tokenRingUpdateFor(null, {ring: {}}), {});
});

test('Link with both boxes ticked also updates ring-off tokens of the Actors it turned a ring on for', async () => {
  const docs = [doc('NPC-TEST-ONE', 'Test Person'), doc('CRE-TEST-BEAST', 'Test Beast', {ringEnabled: true}), doc('FAC-TEST', 'Test Other')];
  const plan = planAssetLinks(docs, ['NPC-TEST-ONE', 'CRE-TEST-BEAST', 'FAC-TEST'].map(i => f(`${i}.webp`)));
  const ids = id => `Actor_${id}`;
  const tokens = [{actorId: ids('NPC-TEST-ONE'), sceneId: 'S1', id: 'T1', ring: {enabled: false}}, {actorId: ids('NPC-TEST-ONE'), sceneId: 'S1', id: 'T2', ring: {enabled: true}},
    {actorId: ids('NPC-TEST-ONE'), sceneId: 'S2', id: 'T3', ring: {enabled: false, colors: {ring: '#abcdef'}}}, {actorId: ids('CRE-TEST-BEAST'), sceneId: 'S1', id: 'T4', ring: {enabled: false}},
    {actorId: ids('FAC-TEST'), sceneId: 'S1', id: 'T5', ring: {enabled: false}}];
  const w = sceneWorld(docs, tokens);
  // the beast's ring is already on in the live world, so its tokens are left alone
  w.getDoc('Actor.CRE-TEST-BEAST').prototypeToken.ring = {enabled: true, colors: {}};
  const out = await applyAssetLinks(plan.rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany, tokenRing: true, sceneTokens: true, getTokens: w.getTokens, updateTokens: w.updateTokens});
  assert.equal(out.ok, true);
  assert.deepEqual(w.scenes.map(s => [s.sceneId, s.updates.map(u => u._id)]), [['S1', ['T1']], ['S2', ['T3']]]);
  assert.ok(!('ring.colors.ring' in w.scenes[1].updates[0])); // the GM's colour on T3 is kept
  assert.match(out.message, /2 token\(s\) already on scenes updated/);
});

test('scene tokens are untouched unless that box is ticked, and never without the ring box', async () => {
  const docs = [doc('NPC-TEST-ONE', 'Test Person')];
  const tokens = [{actorId: 'Actor_NPC-TEST-ONE', sceneId: 'S1', id: 'T1', ring: {enabled: false}}];
  for (const opts of [{tokenRing: true, sceneTokens: false}, {tokenRing: false, sceneTokens: true}, {}]) {
    const w = sceneWorld(docs, tokens);
    await applyAssetLinks(planAssetLinks(docs, [f('NPC-TEST-ONE.webp')]).rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany, getTokens: w.getTokens, updateTokens: w.updateTokens, ...opts});
    assert.equal(w.scenes.length, 0, JSON.stringify(opts));
  }
});

test('a failed token write is reported but the images and Actor rings stay linked', async () => {
  const docs = [doc('NPC-TEST-ONE', 'Test Person')];
  const w = sceneWorld(docs, [{actorId: 'Actor_NPC-TEST-ONE', sceneId: 'S1', id: 'T1', ring: {enabled: false}}]);
  const out = await applyAssetLinks(planAssetLinks(docs, [f('NPC-TEST-ONE.webp')]).rows, {user: GM, moduleId: M, getDoc: w.getDoc, updateMany: w.updateMany, tokenRing: true, sceneTokens: true,
    getTokens: w.getTokens, updateTokens: async () => { throw new Error('scene locked'); }});
  assert.equal(out.applied.length, 1);
  assert.equal(out.errors[0].documentName, 'Token');
  assert.match(out.message, /write error/);
});
