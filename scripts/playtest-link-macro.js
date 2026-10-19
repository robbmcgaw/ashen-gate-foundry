// [TEST] Link test data. GM only; safe to run again.
// Links the playtest pack's Items and Journals (a) into the [TEST] Marsh Finds roll table as document results and
// (b) into the loot and note entries of the LOC-PT-* test locations, through the Locations public API, and
// (c) sets the Profession Ledger party to the [TEST] characters (the same world setting as Ledger > GM Setup > Party).
// It only touches [TEST]-named data, never replaces a link that is already set, and reports what it did.
// Source: scripts/playtest-link-macro.js in the ashen-gate-foundry repo (the generator fills in PACK).
const PACK = /*PACK*/ {};
const out = [];
const say = line => out.push(line);
const isTest = doc => typeof doc?.name === 'string' && doc.name.startsWith('[TEST]');
const boundId = doc => doc.getFlag?.('ashen-gate-manager', 'source')?.sourceId;

// A pack record is found by its permanent id (Manager's binding), else by its exact [TEST] name when nothing is bound to it.
function find(collection, id, label = id) {
  const name = PACK.names[id];
  const bound = collection.filter(doc => boundId(doc) === id && isTest(doc));
  const named = bound.length ? [] : collection.filter(doc => doc.name === name && !boundId(doc) && isTest(doc));
  const hits = [...bound, ...named];
  if (hits.length > 1) { say(`SKIPPED ${label}: more than one ${name} in this world.`); return null; }
  return hits[0] ?? null;
}
const worldDoc = id => (id.startsWith('JRN-') ? find(game.journal, id) : find(game.items, id));

async function setLedgerParty() {
  const LEDGER = 'ashen-gate-profession-ledger';
  if (!game.modules.get(LEDGER)?.active || !game.settings.settings.has(`${LEDGER}.partyRoster`)) { say('Ledger party: Profession Ledger is not active; set the party in Ledger > GM Setup.'); return; }
  const have = game.settings.get(LEDGER, 'partyRoster');
  if (Array.isArray(have) && have.length) { say(`Ledger party: already set (${have.length} character(s)); left as is.`); return; }
  const actors = PACK.characters.map(name => game.actors.filter(a => a.name === name && a.type === 'character'));
  const missing = PACK.characters.filter((name, i) => actors[i].length !== 1);
  if (missing.length) { say(`Ledger party: not set. Need exactly one of each: ${missing.join(', ')}. Import the pack, then run this again.`); return; }
  await game.settings.set(LEDGER, 'partyRoster', actors.map(list => list[0].id));
  say(`Ledger party: set to ${PACK.characters.join(', ')}.`);
}

async function run() {
  if (!game.user?.isGM) { ui.notifications?.warn('Link test data is GM only.'); return false; }

  // (a) Roll table: document results for the pack Items and the handout Journal.
  const table = find(game.tables, PACK.table.id, 'Roll table');
  if (!table) say(`Roll table ${PACK.table.name}: not in this world. Import the Manager pack first.`);
  else {
    const have = new Set(table.results.map(r => r.documentUuid).filter(Boolean));
    const oldMax = Math.max(0, ...table.results.map(r => r.range[1]));
    let max = oldMax;
    const rows = [];
    for (const id of PACK.table.add) {
      const doc = worldDoc(id);
      if (!doc) { say(`Table: ${id} not found in this world; skipped.`); continue; }
      if (have.has(doc.uuid)) { say(`Table: ${doc.name} was already a result.`); continue; }
      max += 1;
      rows.push({ type: 'document', name: doc.name, img: doc.img, documentUuid: doc.uuid, weight: 1, range: [max, max] });
    }
    if (rows.length) {
      await table.createEmbeddedDocuments('TableResult', rows);
      if (table.formula === `1d${oldMax}`) await table.update({ formula: `1d${max}` });
      else say(`Table: formula "${table.formula}" left as you set it; make it cover results 1-${max}.`);
      say(`Table: added ${rows.length} document result(s): ${rows.map(r => r.name).join(', ')}.`);
    }
  }

  // (c) Ledger party: gathering needs one. Only an empty party is filled, so a party you chose is never replaced.
  await setLedgerParty();

  // (b) Locations: link loot to Items and notes to Journals.
  const mod = game.modules.get('ashen-gate-locations');
  const api = mod?.active ? mod.api : null;
  if (typeof api?.saveLocation !== 'function' || typeof api?.listLocations !== 'function') {
    say('Locations: module not active (or too old); loot and notes not linked.');
    return true;
  }
  let linked = 0;
  for (const loc of api.listLocations().filter(l => PACK.locations.includes(l.id))) {
    const edit = structuredClone(loc);
    const changes = [];
    const link = (entry, marker, docType, what) => {
      const id = marker.exec(`${entry.text ?? ''}`)?.[0];
      if (!id || entry.uuid) return;
      const doc = worldDoc(id);
      if (!doc) { say(`${loc.name}: ${what} ${id} not found in this world; skipped.`); return; }
      entry.uuid = doc.uuid;
      entry.docType = docType;
      changes.push(`${what} "${entry.label || entry.title}" -> ${doc.name}`);
    };
    for (const e of edit.loot ?? []) link(e, /ITEM-PT-[A-Z0-9-]+/, 'Item', 'loot');
    for (const e of edit.notes ?? []) link(e, /JRN-PT-[A-Z0-9-]+/, 'JournalEntry', 'note');
    if (!changes.length) continue;
    const wasCurrent = loc.state !== 'hidden' && !api.hasUnpublishedChanges(loc.id);
    await api.saveLocation(edit);
    // Players see the link only once published; republish only when nothing else was waiting to be published.
    if (wasCurrent) await api.publishLocation(loc.id);
    else say(`${loc.name}: saved; Publish it in Locations to show players the links.`);
    linked += changes.length;
    for (const c of changes) say(`${loc.name}: linked ${c}.`);
  }
  if (!linked) say('Locations: nothing new to link.');
  return true;
}

let ok = false;
try { ok = await run(); } catch (err) { console.error(err); say(`FAILED: ${err.message}`); }
if (ok !== false || out.length) {
  const text = out.length ? out.join('\n') : 'Nothing to do.';
  console.log(`[TEST] Link test data\n${text}`);
  ChatMessage.create({ content: `<p><strong>[TEST] Link test data</strong></p><pre>${foundry.utils.escapeHTML(text)}</pre>`, whisper: [game.user.id] });
}
