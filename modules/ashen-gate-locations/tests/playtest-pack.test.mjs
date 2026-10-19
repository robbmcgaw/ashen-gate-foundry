import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {packFileName} from '../../../scripts/build-test-pack.mjs';
import {parseImport, playerView, viewHtml} from '../scripts/model.mjs';

const pack = JSON.parse(fs.readFileSync(new URL(`../../../test-fixtures/playtest/${packFileName()}`, import.meta.url)));

test('the shared playtest pack imports its locations: three threat levels plus the point-crawl', () => {
  const {created, skipped, errors} = parseImport(pack, []);
  assert.deepEqual([skipped, errors], [[], []]);
  assert.equal(created.length, 8);
  assert.deepEqual([...new Set(created.map(l => l.threat))].sort(), ['deadly', 'hot', 'normal']);
  const mats = new Set(pack.records.filter(r => r.entity_type === 'Material').map(r => r.id));
  for (const l of created) {
    assert.ok(l.resources.length <= 4, `${l.id} has at most 4 nodes`);
    for (const r of l.resources) {
      assert.ok(mats.has(r.materialId), r.materialId);
      if (r.rareMaterialId) assert.ok(mats.has(r.rareMaterialId), r.rareMaterialId);
      assert.ok(r.skill && r.tier >= 1 && r.dc >= 10, r.key);
    }
  }
});

test("players see none of the pack's hidden location content", () => {
  const {created} = parseImport(pack, []);
  const views = created.map(l => playerView(l, created)).filter(Boolean);
  const revealed = views.filter(v => v.state === 'revealed').map(v => v.id).sort();
  assert.deepEqual(revealed, ['LOC-PT-CHAPEL-CRYPT', 'LOC-PT-CINDER-QUARRY', 'LOC-PT-DROWNED-CHAPEL', 'LOC-PT-GREENHOLLOW', 'LOC-PT-HOLLOWMERE']);
  const unidentified = views.filter(v => v.state === 'unidentified');
  assert.deepEqual(unidentified.map(v => [v.name, Object.keys(v).sort()]), [['[TEST] A distant light', ['key', 'name', 'state', 'teaser']]]);
  const text = JSON.stringify(views) + views.map(viewHtml).join('');
  assert.doesNotMatch(text, /must not see|until revealed|Ash Hollow|ASH-HOLLOW|Sunken Cache|SUNKEN-CACHE|Lantern Mound|LANTERN-MOUND|GM-only Resin|pt-cinder-coal|pt-chapel-seam|"dc":13/);
  const shown = views.flatMap(v => v.resources ?? []).filter(n => 'dc' in n);
  assert.deepEqual(shown.map(n => [n.id, n.dc]), [['pt-greenhollow-roots', 10]], 'only the one DC the GM shows');
});

test('the point-crawl shows players inherited conditions, overrides and the right gathering nodes', () => {
  const {created} = parseImport(pack, []);
  const by = id => playerView(created.find(l => l.id === id), created);
  const chapel = by('LOC-PT-DROWNED-CHAPEL');
  assert.deepEqual(chapel.conditions.map(c => c.label), ['[TEST] Flooded floor', '[TEST] Echoing nave'], 'fog turned off, mire overridden, GM omen never shown');
  assert.deepEqual(chapel.resources.map(n => n.id), ['pt-chapel-reeds', 'pt-chapel-roots', 'pt-chapel-bloom'], 'the GM-only node is omitted');
  assert.equal(chapel.resources.find(n => n.id === 'pt-chapel-bloom').exhausted, true);
  assert.deepEqual(chapel.loot.map(e => e.status), ['available', 'discovered', 'taken', 'available'], 'the GM-only loot entry is omitted');
  assert.deepEqual(by('LOC-PT-HOLLOWMERE').children.map(c => c.name), ['[TEST] A distant light', '[TEST] Drowned Chapel']);
  assert.equal(by('LOC-PT-CHAPEL-CRYPT').parent.id, 'LOC-PT-DROWNED-CHAPEL');
});
