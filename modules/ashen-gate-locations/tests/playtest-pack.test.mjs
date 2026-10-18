import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {packFileName} from '../../../scripts/build-test-pack.mjs';
import {parseImport, playerView, viewHtml} from '../scripts/model.mjs';

const pack = JSON.parse(fs.readFileSync(new URL(`../../../test-fixtures/playtest/${packFileName()}`, import.meta.url)));

test('the shared playtest pack imports three locations, one per threat level', () => {
  const {created, skipped, errors} = parseImport(pack, []);
  assert.deepEqual([skipped, errors], [[], []]);
  assert.deepEqual(created.map(l => l.threat).sort(), ['deadly', 'hot', 'normal']);
  const mats = new Set(pack.records.filter(r => r.entity_type === 'Material').map(r => r.id));
  for (const l of created) {
    assert.ok(l.resources.length >= 1 && l.resources.length <= 2, `${l.id} has 1-2 nodes`);
    for (const r of l.resources) {
      assert.ok(mats.has(r.materialId), r.materialId);
      if (r.rareMaterialId) assert.ok(mats.has(r.rareMaterialId), r.rareMaterialId);
      assert.ok(r.skill && r.tier >= 1 && r.dc >= 10 && r.finite && !r.exhausted, r.key);
    }
  }
});

test("players see none of the pack's hidden location content", () => {
  const {created} = parseImport(pack, []);
  const views = created.map(l => playerView(l, created)).filter(Boolean);
  assert.deepEqual(views.map(v => v.id).sort(), ['LOC-PT-CINDER-QUARRY', 'LOC-PT-GREENHOLLOW']);
  const text = JSON.stringify(views) + views.map(viewHtml).join('');
  assert.doesNotMatch(text, /must not see|Ash Hollow|ASH-HOLLOW|GM-only Resin|MAT-PT-COAL|"dc":13/);
  const shown = views.flatMap(v => v.resources ?? []).filter(n => 'dc' in n);
  assert.deepEqual(shown.map(n => [n.id, n.dc]), [['pt-greenhollow-roots', 10]], 'only the one DC the GM shows');
});
