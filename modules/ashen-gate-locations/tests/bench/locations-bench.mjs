// Run: node tests/bench/locations-bench.mjs [sizes...]   (default 50 200 500)
// Synthetic [TEST] data on the mocked Foundry layer. Measures logic cost only (no DOM, no Foundry document
// validation, no database or network), so the numbers are a floor for the real cost of a save.
import {installFoundry, Scene} from '../foundry-mock.mjs';
import {readAll, writeAll} from '../../scripts/store.mjs';
import {normalizeLocation, playerView, hasUnpublishedChanges} from '../../scripts/model.mjs';
import {buildTree, withAncestors, flatten} from '../../scripts/tree.mjs';
import {searchText, matchesQuery, applyFilters, filterOptions, comparator, groupRows, emptyFilters} from '../../scripts/list-filter.mjs';

const MOD = 'ashen-gate-locations';
const THREATS = ['normal', 'hot', 'deadly'], STATES = ['hidden', 'unidentified', 'revealed'];

/** n synthetic locations: ~1 Region per 10 places, nesting up to 4 deep, mixed states/audiences, notes and resources. */
export function makeLocations(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const region = i % 10 === 0;
    const parent = i === 0 ? '' : out[Math.floor((i - 1) / 4) * 1 % out.length].id; // roughly 4 children per node, depth ~log4(n)
    out.push(normalizeLocation({
      id: `LOC-TEST-${String(i).padStart(4, '0')}`, name: `[TEST] Place ${String(i).padStart(4, '0')}`, type: region ? 'Region' : 'Village',
      region: `[TEST] Region ${i % 12}`, isRegion: region, parentLocationId: parent, threat: THREATS[i % 3],
      state: STATES[i % 3], description: `Synthetic description ${i}. `.repeat(8),
      audience: i % 7 === 0 ? {mode: 'selected', userIds: ['p1', 'p2'], sharing: true} : undefined,
      resources: [0, 1, 2].map(k => ({label: `[TEST] Node ${i}-${k}`, skill: ['Herbalism', 'Mining', 'Foraging'][k], available: true, note: 'Synthetic note text. '.repeat(3)})),
      notes: [{title: 'Rumour', text: `Synthetic rumour ${i}. `.repeat(10)}, {title: 'GM', text: 'Synthetic secret. '.repeat(10), visible: false}],
      factions: [{label: '[TEST] Guild'}], quests: i % 5 === 0 ? [{questId: `QST-TEST-${i % 20}`}] : []
    }));
  }
  return out;
}

const bytes = v => Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v));
async function time(label, fn, reps = 5) {
  await fn(); // warm up
  const t = performance.now();
  for (let i = 0; i < reps; i++) await fn();
  return {label, ms: +((performance.now() - t) / reps).toFixed(2)};
}

async function run(n) {
  const list = makeLocations(n);
  const game = installFoundry();
  game.users = [{id: 'p1', isGM: false}, {id: 'p2', isGM: false}];
  game.scenes.push(Object.assign(new Scene(), {notes: []}));
  await writeAll(list);
  const gmDoc = game.journal.find(j => j.getFlag(MOD, 'role') === 'gm-data');
  const viewDoc = game.journal.find(j => j.getFlag(MOD, 'role') === 'player-view');
  const stored = readAll();
  const sizes = {gmFlagBytes: bytes(gmDoc.getFlag(MOD, 'locations')), perLocationBytes: Math.round(bytes(gmDoc.getFlag(MOD, 'locations')) / n),
    playerViewBytes: bytes(JSON.stringify(viewDoc.pages)), playerPages: viewDoc.pages.length};
  const tally = {gmUpdates: 0, pageUpdates: 0, pageBytes: 0};
  const origUpdate = gmDoc.update.bind(gmDoc), origPages = viewDoc.updateEmbeddedDocuments.bind(viewDoc);
  gmDoc.update = d => { tally.gmUpdates++; return origUpdate(d); };
  viewDoc.updateEmbeddedDocuments = (k, l) => { tally.pageUpdates += l.length; tally.pageBytes += bytes(l); return origPages(k, l); };

  const results = [];
  // "Save one location": what api.saveLocation does at the storage layer, i.e. rewrite everything with one record edited.
  let k = 0;
  results.push(await time('writeAll, nothing changed', () => writeAll(readAll())));
  const afterNoop = {...tally};
  results.push(await time('writeAll, one location edited', () => { const a = readAll(); a[a.length >> 1].description = `edit ${k++}`; return writeAll(a); }));
  results.push(await time('readAll (normalize + sort)', () => readAll()));
  results.push(await time('playerView x all', () => stored.map(l => playerView(l, stored))));
  results.push(await time('hasUnpublishedChanges x all (one list render)', () => stored.filter(hasUnpublishedChanges)));
  const q = 'node 1';
  results.push(await time('search+filter+sort+group (list render logic)', () => {
    let rows = stored.filter(l => matchesQuery(searchText(l), q));
    const f = {...emptyFilters(), status: 'unpublished'};
    const opts = filterOptions(rows, f);
    rows = applyFilters(rows, f).sort(comparator('name', false));
    return [opts, groupRows(rows, 'region')];
  }));
  results.push(await time('filterOptions only (no query)', () => filterOptions(stored, emptyFilters())));
  results.push(await time('buildTree + flatten (all open)', () => flatten(buildTree(stored, {sort: comparator('name')}))));
  results.push(await time('withAncestors + buildTree (filtered)', () => buildTree(stored, {show: withAncestors(stored, stored.filter((_, i) => i % 9 === 0)), sort: comparator('name')})));
  return {n, sizes, noopWrites: {gmUpdates: afterNoop.gmUpdates, pageUpdates: afterNoop.pageUpdates}, results};
}

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const n of sizes.length ? sizes : [50, 200, 500]) {
    const r = await run(n);
    console.log(`\n== ${n} locations ==`);
    console.log(JSON.stringify(r.sizes), 'writes during the no-change writeAll runs (6 calls incl. warm-up):', JSON.stringify(r.noopWrites));
    for (const x of r.results) console.log(`${x.ms.toString().padStart(8)} ms  ${x.label}`);
  }
}
