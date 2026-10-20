/** Organize folders (0.25.0). Proves planning/apply/undo logic with mocked Foundry documents, folders and packs, not native Foundry UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrganizer, DEFAULT_RULES, validateRules, matchRule, factsOf, SCHEMA_SETTING, HISTORY_SETTING, FLAG_PROTECTED, FLAG_KEEP} from '../scripts/organize.js';

const M = 'ashen-gate-manager';
let seq = 0;
const ag = (sourceId, entityType, definition = {}, extra = {}) => ({[M]:{source:{sourceId, entityType, status:'draft', visibility:'player', definition, ...extra}}});
const item = (name, type, {flags = {}, system = {}, folder = null, id} = {}) => ({id:id ?? `I${++seq}`, name, type, folder, flags, system});
const actor = (name, type, {flags = {}, system = {}, folder = null, hasPlayerOwner = false} = {}) => ({id:`A${++seq}`, name, type, folder, flags, system, hasPlayerOwner});
const journal = (name, {flags = {}, folder = null} = {}) => ({id:`J${++seq}`, name, folder, flags});
const folder = (name, type, parent = null, flags = {}) => ({id:`F${++seq}`, name, type, folder:parent, flags,
  async setFlag(s, k, v) {(this.flags[s] ??= {})[k] = v;}, async unsetFlag(s, k) {delete this.flags[s]?.[k];}});

function mkWorld({gm = true, items = [], actors = [], journals = [], folders = [], packs = []} = {}) {
  const store = {[SCHEMA_SETTING]:[], [HISTORY_SETTING]:[]};
  const game = {user:{isGM:gm},
    settings:{get:(ns, k) => structuredClone(store[k]), set:async (ns, k, v) => {store[k] = structuredClone(v); return v;}},
    items:{contents:items}, actors:{contents:actors}, journal:{contents:journals}, folders:{contents:folders}, packs:{contents:packs}};
  const calls = {update:[], create:[]};
  const all = () => [...items, ...actors, ...journals];
  const organizer = createOrganizer({game,
    updateDocuments:async (name, updates, opts) => {
      calls.update.push({name, updates:structuredClone(updates), opts});
      const pool = opts.pack ? packs.find(p => p.collection === opts.pack).docs : all();
      for(const u of updates) {const d = pool.find(x => (x._id ?? x.id) === u._id); assert.deepEqual(Object.keys(u).sort(), ['_id', 'folder']); d.folder = u.folder;}
    },
    createFolder:async (data, opts) => {
      calls.create.push({data, opts});
      const f = folder(data.name, data.type, data.folder);
      (opts.pack ? packs.find(p => p.collection === opts.pack).folders.contents : folders).push(f);
      return f;
    }});
  return {organizer, game, store, calls, folders};
}
const pathOf = (folders, id) => {const f = folders.find(x => x.id === id); return f ? [pathOf(folders, f.folder), f.name].filter(Boolean).join('/') : '';};

function sample() {
  seq = 0;
  return {
    items:[
      item('Hearthleaf Bundle', 'loot', {flags:ag('MAT-HERB-APP', 'Material', {tierId:'apprentice', quality:'Common'})}),
      item("Field Medic's Salve (recipe)", 'loot', {flags:ag('REC-ALC-SALVE', 'Recipe', {tier:'journeyman', profession_id:'PROF-ALCHEMY'})}),
      item("Field Medic's Salve", 'loot', {flags:ag('ITEM-ALC-SALVE', 'Item', {created_by_recipe_id:'REC-ALC-SALVE'})}),
      item('Alchemy', 'feat', {flags:ag('PROF-ALCHEMY', 'Profession')}),
      item('Steady Hands', 'feat', {flags:ag('PERK-ALC-1', 'ProfessionPerk', {tierId:'expert'})}),
      item('[TEST] Practice Dagger', 'weapon', {flags:ag('ITEM-TEST-1', 'Item')}),
      item('Cloak of Protection', 'equipment', {system:{rarity:'uncommon', type:{value:'wondrous'}}}),
      item('Longsword', 'weapon', {system:{rarity:'', type:{value:'martialM'}}}),
      item('Chain Mail', 'equipment', {system:{type:{value:'heavy'}}}),
      item('Fire Bolt', 'spell', {system:{level:0, school:'evo'}}),
      item('Fireball', 'spell', {system:{level:3, school:'evo'}}),
      item('Potion of Healing', 'consumable', {system:{rarity:'common', type:{value:'potion'}}}),
      item("Thieves' Tools", 'tool', {system:{type:{value:''}}})
    ],
    actors:[
      actor('Aria (PC)', 'character', {hasPlayerOwner:true}),
      actor('Goblin', 'npc', {system:{details:{cr:0.25, type:{value:'humanoid'}}}}),
      actor('Ash Wraith', 'npc', {flags:ag('ACTOR-ASH-WRAITH', 'Creature'), system:{details:{cr:6}}}),
      actor('Mayor Venn', 'npc', {flags:ag('ACTOR-VENN', 'NPC')})
    ],
    journals:[
      journal('Gate Handout', {flags:ag('JRN-HANDOUT', 'JournalEntry')}),
      journal('Secret Plans', {flags:ag('JRN-SECRET', 'JournalEntry', {}, {visibility:'gm'})}),
      journal('Old Mill', {flags:ag('LOC-MILL', 'Location')}),
      journal('My session notes')
    ]
  };
}

test('default schema is valid and the PC rules come first', () => {
  assert.deepEqual(validateRules(DEFAULT_RULES), []);
  assert.deepEqual(DEFAULT_RULES.slice(0, 2).map(r => r.leave), [true, true]);
});

test('first matching rule wins; a rule with an empty placeholder falls through; unmatched returns null', () => {
  const rules = [{id:'a', types:['Item'], when:{itemType:'loot'}, path:'X/{tier}'}, {id:'b', types:['Item'], when:{itemType:'loot'}, path:'Y'}, {id:'c', when:{itemType:'loot'}, path:'Z'}];
  assert.equal(matchRule(rules, {documentType:'Item', itemType:'loot', tier:'Expert'}).path, 'X/Expert');
  assert.equal(matchRule(rules, {documentType:'Item', itemType:'loot', tier:null}).rule.id, 'b');
  assert.equal(matchRule(rules, {documentType:'Item', itemType:'weapon'}), null);
  assert.deepEqual(validateRules([{id:'x', when:{bogus:1}, path:'A/B/C/D/E/{nope}'}]).length, 3);
});

test('default schema files sample Ashen Gate records and core dnd5e content where expected', async () => {
  const s = sample();
  const {organizer} = mkWorld(s);
  const out = await organizer.preview();
  assert.equal(out.ok, true, out.message);
  const to = Object.fromEntries(out.parts.flatMap(p => p.moves.map(m => [m.name, m.to])));
  assert.deepEqual(to, {
    'Hearthleaf Bundle':'Ashen Gate/Professions/Apprentice/Materials',
    "Field Medic's Salve (recipe)":'Ashen Gate/Professions/Journeyman/Recipes',
    "Field Medic's Salve":'Ashen Gate/Professions/Journeyman/Crafted Items',
    'Alchemy':'Ashen Gate/Professions/Professions',
    'Steady Hands':'Ashen Gate/Professions/Expert/Perks',
    '[TEST] Practice Dagger':'Ashen Gate/Playtest',
    'Cloak of Protection':'Core 5.5e/Items/Uncommon Magic',
    'Longsword':'Core 5.5e/Items/Weapons',
    'Chain Mail':'Core 5.5e/Items/Armor',
    'Fire Bolt':'Core 5.5e/Spells/Cantrips',
    'Fireball':'Core 5.5e/Spells/Level 3',
    'Potion of Healing':'Core 5.5e/Items/Common Magic',
    "Thieves' Tools":'Core 5.5e/Items/Tools',
    'Goblin':'Core 5.5e/Actors/Humanoid',
    'Ash Wraith':'Ashen Gate/Creatures/CR 5-10',
    'Mayor Venn':'Ashen Gate/NPCs',
    'Gate Handout':'Ashen Gate/Handouts',
    'Secret Plans':'Ashen Gate/GM Notes',
    'Old Mill':'Ashen Gate/Locations'
  });
  const actorPart = out.parts.find(p => p.documentName === 'Actor');
  assert.match(actorPart.skipped.find(r => r.name === 'Aria (PC)').reason, /Player characters/);
  assert.equal(out.parts.find(p => p.documentName === 'JournalEntry').unmatched[0].name, 'My session notes');
  const groups = out.parts.find(p => p.documentName === 'Item').groups;
  assert.ok(groups.every(g => g.count === g.rows.length));
});

test('apply creates folders, changes only folder, equals the dry run, and a re-run changes nothing', async () => {
  const s = sample();
  const w = mkWorld(s);
  const dry = await w.organizer.preview();
  const out = await w.organizer.apply();
  assert.equal(out.ok, true, out.message);
  assert.deepEqual(out.moves.map(m => [m.name, m.to]), dry.parts.flatMap(p => p.moves.map(m => [m.name, m.to])));
  assert.equal(out.createdFolders, dry.totals.createFolders);
  for(const m of out.moves) assert.equal(pathOf(w.folders, [...s.items, ...s.actors, ...s.journals].find(d => d.id === m.id).folder), m.to);
  assert.ok(w.folders.every(f => ['Item', 'Actor', 'JournalEntry'].includes(f.type)));
  assert.equal(w.folders.filter(f => f.name === 'Ashen Gate' && f.type === 'Item').length, 1, 'shared parents created once');
  assert.equal(s.actors[0].folder, null, 'PC untouched');
  const again = await w.organizer.preview();
  assert.equal(again.totals.moves, 0);
  assert.equal(again.totals.createFolders, 0);
  const updates = w.calls.update.length;
  const second = await w.organizer.apply();
  assert.equal(second.moved, 0);
  assert.equal(w.calls.update.length, updates, 'no writes on re-run');
});

test('protected folders and keep-my-folder documents are skipped; own folders only move with Refile everything', async () => {
  seq = 100;
  const mine = folder('Session 3 Loot', 'Item');
  const vault = folder('Vault', 'Item', null, {[M]:{[FLAG_PROTECTED]:true}});
  const inner = folder('Deep', 'Item', vault.id);
  const items = [item('Longsword', 'weapon', {folder:mine.id}), item('Dagger', 'weapon', {folder:inner.id}),
    item('Club', 'weapon', {flags:{[M]:{[FLAG_KEEP]:true}}}), item('Spear', 'weapon')];
  const w = mkWorld({items, folders:[mine, vault, inner]});
  let p = (await w.organizer.preview({types:['Item']})).parts[0];
  assert.deepEqual(p.moves.map(m => m.name), ['Spear']);
  assert.match(p.skipped.find(r => r.name === 'Dagger').reason, /protected folder Vault/);
  assert.match(p.skipped.find(r => r.name === 'Club').reason, /Keep my folder/);
  assert.match(p.skipped.find(r => r.name === 'Longsword').reason, /Refile everything/);
  p = (await w.organizer.preview({types:['Item'], mode:'all'})).parts[0];
  assert.deepEqual(p.moves.map(m => m.name).sort(), ['Longsword', 'Spear']);
  await w.organizer.apply({types:['Item'], mode:'all'});
  assert.equal(items[1].folder, inner.id);
  assert.equal(items[2].folder, null);
});

test('undo puts documents back, skips ones moved since, and never deletes folders', async () => {
  seq = 200;
  const old = folder('Ashen Gate — Imported Items', 'Item');
  const items = [item('Longsword', 'weapon', {folder:old.id}), item('Fireball', 'spell', {system:{level:3}}), item('Dagger', 'weapon')];
  const w = mkWorld({items, folders:[old]});
  await w.organizer.apply({types:['Item']});
  assert.notEqual(items[0].folder, old.id);
  items[2].folder = old.id; // GM moved it by hand after organizing
  const folderCount = w.folders.length;
  const out = await w.organizer.undoLast();
  assert.equal(out.ok, true, out.message);
  assert.equal(out.restored, 2);
  assert.equal(items[0].folder, old.id);
  assert.equal(items[1].folder, null);
  assert.equal(items[2].folder, old.id);
  assert.equal(w.folders.length, folderCount);
  assert.equal((await w.organizer.undoLast()).ok, false);
});

test('GM gate is enforced in every write function', async () => {
  const w = mkWorld({gm:false, items:[item('Spear', 'weapon')]});
  for(const out of [await w.organizer.preview(), await w.organizer.apply(), await w.organizer.undoLast(), await w.organizer.saveSchema(DEFAULT_RULES),
    await w.organizer.resetSchema(), await w.organizer.housekeeping(), await w.organizer.setKeepFolder({setFlag(){}}, true)]) assert.equal(out.ok, false);
  assert.equal(w.calls.update.length, 0);
  assert.deepEqual(w.organizer.listSources(), []);
});

function mkPack(collection, {locked = false, packageType = 'world', docs = []} = {}) {
  return {collection, documentName:'Item', locked, metadata:{packageType, label:collection}, docs, folders:{contents:[]},
    async getIndex() {return {contents:docs};}};
}
test('locked and module compendiums are inspect-only; unlocked world packs use pack folders', async () => {
  const docs = () => [{_id:'p1', name:'Longsword', type:'weapon', folder:null, system:{}}, {_id:'p2', name:'Fireball', type:'spell', folder:null, system:{level:3}}];
  const locked = mkPack('world.locked', {locked:true, docs:docs()});
  const system = mkPack('dnd5e.items', {packageType:'system', docs:docs()});
  const open = mkPack('world.open', {docs:docs()});
  const w = mkWorld({packs:[locked, system, open]});
  const sources = w.organizer.listSources();
  assert.deepEqual(sources.map(s => s.writable), [true, false, false, true]);
  const look = await w.organizer.preview({source:'pack:world.locked'});
  assert.equal(look.parts[0].moves.length, 2, 'preview still shows what would move');
  assert.equal(look.parts[0].writable, false);
  assert.equal((await w.organizer.apply({source:'pack:world.locked'})).ok, false);
  assert.equal((await w.organizer.apply({source:'pack:dnd5e.items'})).ok, false);
  assert.equal(w.calls.update.length, 0);
  const out = await w.organizer.apply({source:'pack:world.open'});
  assert.equal(out.moved, 2, out.message);
  assert.ok(w.calls.create.every(c => c.opts.pack === 'world.open'));
  assert.deepEqual(open.folders.contents.map(f => pathOf(open.folders.contents, f.id)).sort(), ['Core 5.5e', 'Core 5.5e/Items', 'Core 5.5e/Items/Weapons', 'Core 5.5e/Spells', 'Core 5.5e/Spells/Level 3']);
  assert.equal((await w.organizer.preview({source:'pack:world.open'})).totals.moves, 0);
});

test('housekeeping lists duplicate ids and temporary records without writing', async () => {
  const pack = mkPack('world.staging', {docs:[{_id:'x', name:'Hearthleaf Bundle', type:'loot', flags:ag('MAT-HERB-APP', 'Material')}]});
  const s = sample();
  const w = mkWorld({...s, packs:[pack]});
  const out = await w.organizer.housekeeping();
  assert.equal(out.ok, true);
  assert.deepEqual(out.duplicates.map(d => [d.sourceId, d.count]), [['MAT-HERB-APP', 2]]);
  assert.deepEqual(out.temporary.map(t => t.name), ['[TEST] Practice Dagger']);
  assert.ok(out.drafts.length > 0);
  assert.equal(w.calls.update.length + w.calls.create.length, 0);
  assert.equal(w.store[HISTORY_SETTING].length, 0);
});

test('schema save validates, export round-trips, reset restores defaults', async () => {
  const w = mkWorld();
  assert.equal((await w.organizer.saveSchema([{id:'bad', path:''}])).ok, false);
  const custom = [{id:'all-weapons', types:['Item'], when:{itemType:'weapon'}, path:'Arms'}];
  assert.equal((await w.organizer.saveSchema(JSON.parse(JSON.stringify(custom)))).ok, true);
  assert.deepEqual(w.organizer.getSchema().rules, custom);
  await w.organizer.resetSchema();
  assert.equal(w.organizer.getSchema().isDefault, true);
  assert.equal(w.organizer.getSchema().rules.length, DEFAULT_RULES.length);
});

test('2000 documents: plan, apply and idempotent re-run stay fast', async () => {
  seq = 1000;
  const items = Array.from({length:2000}, (_, n) => n % 2 ? item(`Spell ${n}`, 'spell', {system:{level:n % 10}}) : item(`Mat ${n}`, 'loot', {flags:ag(`MAT-X-${n}`, 'Material', {tierId:['apprentice', 'journeyman', 'expert', 'artisan', 'master'][n % 5]})}));
  const w = mkWorld({items});
  const t0 = Date.now();
  const out = await w.organizer.apply({types:['Item']});
  assert.equal(out.moved, 2000);
  assert.ok(w.calls.update.every(c => c.updates.length <= 250));
  assert.equal((await w.organizer.preview({types:['Item']})).totals.moves, 0);
  assert.ok(Date.now() - t0 < 5000, 'under 5 s');
});

test('facts: tier from recipe index, rarity labels, CR bands', () => {
  const f = factsOf({name:'Salve', type:'loot', flags:ag('ITEM-A', 'Item', {created_by_recipe_id:'REC-A'}), system:{}}, 'Item', new Map([['REC-A', 'master']]));
  assert.equal(f.tier, 'Master');
  assert.equal(factsOf({name:'Ring', type:'equipment', system:{rarity:'veryRare'}}, 'Item').rarity, 'Very Rare');
  assert.equal(factsOf({name:'Dragon', type:'npc', system:{details:{cr:17}}}, 'Actor').crBand, 'CR 17+');
});
