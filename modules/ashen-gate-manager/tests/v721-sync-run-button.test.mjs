/** 0.72.1: the Sync run button and confirm block say what the plan does. Mocked data only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncView} from '../scripts/sync-view.js';
import {SYNC_PHRASE} from '../scripts/sync.js';
import * as sync from '../scripts/sync.js';

const row = (id, meta = true) => ({group: 'overwrite', metadataOnly: meta, key: id, id, name: `[TEST] ${id}`, kind: 'Item', reason: 'Content already matches; refreshes definition.', changes: []});
function planOf(counts, rows = []) {
  const plan = {ok: true, errors: [], notes: [], rows, scope: {lines: [], files: []}, characterCount: 0, counts: {create: 0, overwrite: 0, rebind: 0, delete: 0, untouched: 0, refused: 0, notRemoved: 0, keptEdited: 0, keptRemoved: 0, metadataRefreshes: 0, artKept: 0, supersedeFiles: 0, ...counts}};
  const c = plan.counts; plan.records = c.create + c.overwrite + c.rebind;
  return plan;
}
// the label logic lives at the end of planSync's finish(); exercise it through a real planSync with no documents
import {buildSyncSet, makeSnapshot, planSync} from '../scripts/sync.js';
import {sourceMetadata} from '../scripts/source-projection.mjs';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
const prov = {source: 'test'};
const rec = (id, status = 'approved', name = id) => ({id, entity_type: 'Item', status, version: '1.0.0', visibility: 'player', refs: [], provenance: prov, foundry: {document_type: 'Item', data: {name, type: 'loot', system: {description: {value: `<p>${name}</p>`}}}}});
const M = {schema_version: 'ag-foundry-import/0.1', package_id: 'PKG-MAIN', version: '1.0.0'};
const set = records => buildSyncSet([{filename: 'p.json', kind: 'manager', payload: {manifest: M, records}}]);
const snapFor = (record, over = {}) => {
  const raw = structuredClone(record.foundry.data);
  raw.flags = {[MODULE_ID]: {source: {...sourceMetadata(record, {manifest: M}, []), managedFields: exportedFields(record), ...over}}};
  raw._id = record.id; raw.ownership = {default: 0};
  return makeSnapshot({documentName: 'Item', id: record.id, uuid: `Item.${record.id}`, name: raw.name, type: 'loot', toObject: () => structuredClone(raw), getFlag: (s, k) => structuredClone(raw.flags?.[s]?.[k]), flags: raw.flags, raw}, {});
};
const planWith = (records, worldRecords, over = {}) => planSync(set(records), {docs: worldRecords.map(r => snapFor(r, over)), characterCount: 0, unflaggedNames: {}},
  {includeDrafts: true, buildFlag: (record, manifest) => ({...sourceMetadata(record, {manifest}, []), managedFields: exportedFields(record)}), externalIds: new Set()});

test('metadata-only plan: label, notice, fold and a non-danger button', () => {
  const recs = [rec('ITEM-TEST-A'), rec('ITEM-TEST-B')];
  const plan = planWith(recs, recs, {version: '0.0.1'});
  assert.equal(plan.counts.metadataRefreshes, 2); assert.equal(plan.records, 0);
  assert.equal(plan.buttonLabel, 'Refresh metadata on 2 records'); assert.equal(plan.metadataOnly, true); assert.equal(plan.destructive, false);
  const html = syncView({inputs: [], skipped: [], fileButton: '', deleteUnscoped: false, overwriteEdited: false, replaceArt: false, isGM: true, plan, phrase: '', busy: false, progress: null, stopping: false, result: null, message: '', shown: {}});
  assert.match(html, /Nothing in your world's content changes\./); assert.match(html, /former_starting/);
  assert.match(html, /Metadata refreshes<\/span><span class="ag-fold__count">2</);
  assert.ok(html.includes('ITEM-TEST-A</span>'));
  const btn = html.match(/<button[^>]*data-ag-sync-run[^>]*>/)[0];
  assert.doesNotMatch(btn, /ag-btn--danger/); assert.match(btn, /ag-btn--primary/); assert.doesNotMatch(html, /fa-trash-can/);
  assert.ok(html.indexOf('data-ag-sync-phrase') < html.indexOf('data-ag-sync-run') && html.indexOf('data-ag-sync-run') < html.indexOf('<footer'), 'phrase and button sit together before the footer');
  assert.match(html, /data-ag-sync-jump/); assert.doesNotMatch(html, /Also refreshes metadata on/);
});

test('mixed and destructive plans: label names every non-zero part and the button is danger', () => {
  const world = [rec('ITEM-TEST-A'), rec('ITEM-TEST-B'), rec('ITEM-TEST-GONE')];
  const next = [rec('ITEM-TEST-A'), rec('ITEM-TEST-B', 'approved', 'Renamed B'), rec('ITEM-TEST-C')];
  const plan = planSync(set(next), {docs: world.map(r => snapFor(r, r.id === 'ITEM-TEST-A' ? {version: '0.0.1'} : {})), characterCount: 0, unflaggedNames: {}},
    {includeDrafts: true, overwriteEdited: true, deleteUnscoped: true, buildFlag: (record, manifest) => ({...sourceMetadata(record, {manifest}, []), managedFields: exportedFields(record)}), externalIds: new Set()});
  assert.equal(plan.buttonLabel, 'Replace 2 records, refresh metadata on 1 record and delete 1');
  assert.equal(plan.destructive, true);
  const html = syncView({inputs: [], skipped: [], fileButton: '', deleteUnscoped: true, overwriteEdited: true, replaceArt: false, isGM: true, plan, phrase: SYNC_PHRASE, busy: false, progress: null, stopping: false, result: null, message: '', shown: {}});
  assert.match(html.match(/<button[^>]*data-ag-sync-run[^>]*>/)[0], /ag-btn--danger/);
  assert.doesNotMatch(html, /Nothing in your world's content changes/);
});

test('create-only plan reads Create, and an empty plan has no run block', () => {
  const plan = planWith([rec('ITEM-TEST-NEW')], []);
  assert.equal(plan.buttonLabel, 'Create 1 record'); assert.equal(plan.destructive, false);
  const same = [rec('ITEM-TEST-A')];
  assert.equal(planWith(same, same).buttonLabel, 'Apply changes');
});

test('wiring: jump handler, metadata-only confirmation, version', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(main, /data-ag-sync-jump/); assert.match(main, /plan\.metadataOnly\s*\?await confirmDialog/);
  const m = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
  assert.equal(m.version, '0.72.1'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.72.1/ashen-gate-manager.zip'));
});
