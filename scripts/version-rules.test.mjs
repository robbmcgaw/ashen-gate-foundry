import test from 'node:test';
import assert from 'node:assert/strict';
import { locationsVersionCompare, relationshipProblems } from './version-rules.mjs';

test('flags code that compares or pins a Locations version', () => {
  for (const line of [
    "const LOCATIONS_MIGRATION_VERSION = '1.8.0';",
    "  {id: 'ashen-gate-locations', title: 'Locations', min: '1.3.0', why: 'Location import'},",
    "  if (compareVersions(mod.version, LOCATIONS_MIGRATION_VERSION) < 0) return;",
    "  if (game.modules.get('ashen-gate-locations')?.version >= '1.10.0') enableRoutes();",
    "  const ok = foundry.utils.isNewerVersion(locations.version, '1.9.0');",
    "  if ('1.10.0' <= locMod.version) { /* locations */ }",
  ]) assert.equal(locationsVersionCompare(line), true, line);
});

test('allows feature detection and plain version display/recording', () => {
  for (const line of [
    "  return api && typeof api.importRoutes === 'function' && typeof api.listRoutes === 'function' ? api : null;",
    "  {id: 'ashen-gate-locations', title: 'Locations', min: null, needs: ['importLocations'], why: 'Location import'},",
    "  const out=migrateLocationNodes(store,locations,{by:game.user.name,locationsVersion:game.modules?.get?.(LOCATIONS_ID)?.version??''});",
    "    const version = game.modules.get(MODULE_ID)?.version ?? '';",
    "  if (min && compareVersions(v, min) < 0) return warn();",
  ]) assert.equal(locationsVersionCompare(line), false, line);
});

test('a module.json may not pin an Ashen Gate partner at 1.x; 0.x and system pins are fine', () => {
  const rel = compatibility => ({relationships: {requires: [{id: 'ashen-gate-locations', type: 'module', compatibility}],
    systems: [{id: 'dnd5e', type: 'system', compatibility: {minimum: '6'}}]}});
  assert.equal(relationshipProblems(rel({minimum: '1.10.0'})).length, 1);
  assert.match(relationshipProblems(rel({verified: '1.18.0'}))[0], /compatibility\.verified "1\.18\.0"/);
  assert.deepEqual(relationshipProblems(rel({minimum: '0.18.0'})), []);
  assert.deepEqual(relationshipProblems({}), []);
});
