// Quest Log links and ids for the GM editor (0.23.0). Pure: no Foundry globals. The editor shows names and keeps the
// permanent ids under the hood: a quest's own id is made from its title, and a link to a location, NPC, faction or
// another quest is picked by name. Links live where the quest file already keeps them (source.locations, typed refs,
// state.publicLocationIds), so quests saved before this version keep working unchanged.
import {generateId,checkNewId,pickerOptions} from './ag-html.mjs';

export const KIND_PREFIX = Object.freeze({quest: 'QUEST', work_order: 'ORDER', contract: 'CONTRACT'});
const GIVER_RELATION = /giver|issuer|issued|offered|patron|employer|client|sponsor/i;
const FACTION_RELATION = /faction/i;
const PREREQ_RELATION = /prereq|requires?_quest|follows/i;
const NPC_ID = /^NPC-/;
const FACTION_ID = /^(?:FACTION|FAC|RENOWN)-/;
const QUEST_ID = /^(?:QUEST|ORDER|CONTRACT)-/;
const LOCATION_ID = /^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const refs = source => Array.isArray(source?.refs) ? source.refs : [];
const target = r => typeof r?.target_id === 'string' ? r.target_id : '';

/** The id for a new quest: the typed "Advanced: set id" (checked) or one made from the title. Throws a sentence for the GM. */
export function newQuestId({kind, name, custom = '', taken = []}) {
  const prefix = KIND_PREFIX[kind];
  if (!prefix) throw new Error('Choose a type for this quest first.');
  const typed = String(custom ?? '').trim().toUpperCase();
  if (!typed) return generateId(prefix, name, taken);
  const problem = checkNewId(typed, {prefixes: [prefix], taken});
  if (problem) throw new Error(`Advanced id: ${problem}`);
  return typed;
}

/** The links the editor shows, read from a quest source and its state. */
export function readLinks(source, state = {}) {
  const giverRef = refs(source).find(r => GIVER_RELATION.test(r?.relation ?? '') && NPC_ID.test(target(r)));
  const factionRef = refs(source).find(r => (FACTION_RELATION.test(r?.relation ?? '') || GIVER_RELATION.test(r?.relation ?? '')) && FACTION_ID.test(target(r)));
  return {
    giver: giverRef ? target(giverRef) : '',
    faction: factionRef ? target(factionRef) : '',
    prerequisites: [...new Set(refs(source).filter(r => PREREQ_RELATION.test(r?.relation ?? '') && QUEST_ID.test(target(r))).map(target))],
    locations: [...new Set((source?.locations ?? []).filter(x => typeof x === 'string'))],
    publicLocations: [...new Set((state?.publicLocationIds ?? []).filter(x => typeof x === 'string'))]
  };
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Writes the edited links into a copy of `source`. A link the GM did not change leaves the source exactly as it was
 * (other refs, location objects, the order of refs). Returns {source, publicLocationIds|undefined}.
 */
export function applyLinks(source, next, state = {}) {
  const src = structuredClone(source), was = readLinks(source, state);
  const matchGiver = r => GIVER_RELATION.test(r?.relation ?? '') && NPC_ID.test(target(r));
  const matchFaction = r => (FACTION_RELATION.test(r?.relation ?? '') || GIVER_RELATION.test(r?.relation ?? '')) && FACTION_ID.test(target(r));
  const single = (match, value, was0, relation) => {
    if ((value ?? '') === was0) return;
    const at = src.refs.findIndex(match);
    if (!value) { if (at >= 0) src.refs.splice(at, 1); return; }
    if (at >= 0) src.refs[at] = {...src.refs[at], target_id: value};
    else src.refs.push({relation, target_id: value, mode: 'optional'});
  };
  src.refs = refs(src);
  single(matchGiver, next.giver, was.giver, 'quest_giver');
  single(matchFaction, next.faction, was.faction, 'issuing_faction');
  if (Array.isArray(next.prerequisites) && !sameList(next.prerequisites, was.prerequisites)) {
    const keep = new Map(src.refs.filter(r => PREREQ_RELATION.test(r?.relation ?? '') && QUEST_ID.test(target(r))).map(r => [target(r), r]));
    src.refs = src.refs.filter(r => !(PREREQ_RELATION.test(r?.relation ?? '') && QUEST_ID.test(target(r))));
    for (const id of next.prerequisites) src.refs.push(keep.get(id) ?? {relation: 'prerequisite', target_id: id, mode: 'required'});
  }
  if (Array.isArray(next.locations) && !sameList(next.locations, was.locations)) {
    const bad = next.locations.find(x => !LOCATION_ID.test(x));
    if (bad) throw new Error('One of the linked locations is not a valid location. Replace or remove it.');
    src.locations = [...(source.locations ?? []).filter(x => typeof x !== 'string'), ...next.locations];
  }
  const publicIds = Array.isArray(next.publicLocations) && !sameList(next.publicLocations, was.publicLocations) ? next.publicLocations : undefined;
  return {source: src, publicLocationIds: publicIds};
}

/** Last known names for the linked ids that can be named now: {id: name}. Kept in the quest's campaign state, never shown as ids. */
export function rememberLinkNames(old = {}, ids = [], nameOf = () => null) {
  const out = {};
  for (const id of ids) { const n = nameOf(id) ?? old?.[id]; if (typeof n === 'string' && n.trim()) out[id] = n.trim().slice(0, 120); }
  return out;
}

/* ---- Picker records, one function per kind. Inputs are plain lists from each module's own GM API. ---- */
export const locationRecords = list => (list ?? []).filter(l => l && typeof l.id === 'string' && l.name)
  .map(l => ({value: l.id, label: l.name, kind: 'location', group: l.region || (l.isRegion ? 'Regions' : 'Other places'), hint: l.type || (l.isRegion ? 'Region' : '')}));
export const npcRecords = list => (list ?? []).filter(n => n && typeof n.id === 'string' && n.name)
  .map(n => ({value: n.id, label: n.name, kind: 'npc', hint: n.role || ''}));
export const factionRecords = list => (list ?? []).filter(f => f && typeof f.id === 'string' && f.name)
  .map(f => ({value: f.id, label: f.name, kind: 'faction', hint: f.public_role || ''}));
const KIND_WORD = {quest: 'Quest', work_order: 'Work order', contract: 'Contract'};
export const questRecords = (sources, selfId) => (sources ?? []).filter(s => s && s.id !== selfId && s.name)
  .map(s => ({value: s.id, label: s.name, kind: s.objective_kind, group: KIND_WORD[s.objective_kind] ?? 'Quest', gm: s.visibility === 'gm'}));

export const LINK_KINDS = Object.freeze({giver: ['npc'], faction: ['faction'], prerequisites: ['quest', 'work_order', 'contract'], locations: ['location'], publicLocations: ['location']});
/** Options for one link field: only the kinds that field accepts, GM-only records only for a GM. */
export const linkOptions = (field, records, {gm = false, exclude = []} = {}) => pickerOptions(records, {kinds: LINK_KINDS[field], gm, exclude});
