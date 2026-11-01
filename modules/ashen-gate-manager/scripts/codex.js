/**
 * NPC Codex (0.33.0): pure model, no Foundry globals.
 * Content (role, appearance, wants, ...) comes from the imported NPC record (the Actor's Manager source definition).
 * Play state (who knows what, what the party has learned, GM-added links and notes) is a separate object
 * stored on the NPC Actor as flags.ashen-gate-manager.codex. Re-import never writes it.
 * Each reveal rule is {party, actors[]}: the same shape Renown uses for faction field reveals.
 */
export const CODEX_FLAG = 'codex';
export const CODEX_STATE_VERSION = 1;
export const CODEX_EXPORT_SCHEMA = 'ag-npc-codex-export/0.1';
/** Fields a GM can reveal, in display order. 'learned' and 'links' are Codex play state; the rest come from the record. */
export const REVEAL_FIELDS = Object.freeze(['role', 'status', 'appearance', 'signature_line', 'wants', 'knows', 'learned', 'links']);
/** Record fields that never leave the GM: not revealable, never in a player projection. */
export const GM_FIELDS = Object.freeze(['portrayal', 'session_role', 'stat_block', 'gm_notes']);
export const FIELD_LABELS = Object.freeze({
  role: 'Role', status: 'Status', appearance: 'Appearance', signature_line: 'Signature line', wants: 'Wants', knows: 'Knows',
  learned: 'What the party has learned', links: 'Connections',
  portrayal: 'Portrayal', session_role: 'Session role', stat_block: 'Stat block', gm_notes: 'GM notes'
});
/**
 * 0.96.0: NPC text the GM can edit in the Codex. These are a WORLD LAYER over the pack record: the edit is stored in the Codex
 * state (`edits`), never in `source.definition`, so a Sync or re-import that rewrites the record cannot overwrite it. The
 * Codex reads an edited field first. `stat_block` stays read-only. GM_FIELDS (portrayal, session_role, gm_notes) are editable
 * here and still never leave the GM.
 */
export const EDIT_FIELDS = Object.freeze(['name', 'role', 'appearance', 'signature_line', 'wants', 'knows', 'portrayal', 'session_role', 'gm_notes']);
export const EDIT_LIMITS = Object.freeze({name: 200, role: 400, gm_notes: 8000});
export const EDIT_LIMIT_DEFAULT = 4000;
const editLimit = key => EDIT_LIMITS[key] ?? EDIT_LIMIT_DEFAULT;
/** 0.96.0: life status. A reveal-governed field: a player sees it only when `status` is revealed to them. */
export const STATUS_VALUES = Object.freeze(['alive', 'deceased', 'unknown']);
export const DEFAULT_STATUS = 'alive';
export const STATUS_LABELS = Object.freeze({alive: 'Alive', deceased: 'Deceased', unknown: 'Unknown'});
/** Chip text (never colour alone). */
export const STATUS_CHIPS = Object.freeze({alive: 'Alive', deceased: 'Deceased', unknown: 'Status unknown'});
export const normalizeStatus = v => STATUS_VALUES.includes(v) ? v : DEFAULT_STATUS;
/** Ids a Codex link may point at. FAC- is a Headquarters facility elsewhere, but GPT drafts use it for factions too.
 * DEITY- (0.40.0) is a Renown Pantheon deity: a player only ever sees one they have discovered in Renown. */
export const LINK_PREFIXES = Object.freeze(['LOC', 'FAC', 'FACTION', 'RENOWN', 'DEITY', 'QUEST', 'ORDER', 'CONTRACT', 'NPC']);
/** Shown for a link the player does not know (0.41.1: every kind; 0.40.0: deities): no id, no name. */
export const UNKNOWN_LINK = 'Unknown';
export const UNKNOWN_DEITY = UNKNOWN_LINK;
export const unknownLink = kind => ({id: null, kind, name: UNKNOWN_LINK, unknown: true});
const ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;

const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
const uniq = list => [...new Set(list)];

export function isNpcDefinition(def) {
  return Boolean(def && typeof def === 'object' && def.entity_type === 'NPC' && typeof def.id === 'string');
}
export function isLinkId(id) {
  return typeof id === 'string' && ID_RE.test(id) && LINK_PREFIXES.includes(id.split('-')[0]);
}
const LINK_KIND_LABEL = {location: 'Location', npc: 'NPC', deity: 'Deity', quest: 'Quest', renown: 'Renown'};
export function linkKind(id) {
  const p = str(id).split('-')[0];
  return p === 'LOC' ? 'location' : p === 'NPC' ? 'npc' : p === 'DEITY' ? 'deity' : ['QUEST', 'ORDER', 'CONTRACT'].includes(p) ? 'quest' : 'renown';
}

export function emptyRule() { return {party: false, actors: []}; }
export function normalizeRule(raw) {
  if (raw === 'party') return {party: true, actors: []};
  if (!raw || typeof raw !== 'object') return emptyRule();
  return {party: Boolean(raw.party), actors: Array.isArray(raw.actors) ? uniq(raw.actors.filter(a => typeof a === 'string' && a)) : []};
}
export function ruleMode(rule) {
  const r = normalizeRule(rule);
  return r.party ? 'party' : r.actors.length ? 'actors' : 'hidden';
}
export function knowsRule(rule, actorIds = []) {
  const r = normalizeRule(rule);
  return r.party || actorIds.some(id => r.actors.includes(id));
}

/**
 * Saved state, or the record's codex.default_reveal when nothing is saved yet. Unknown keys are dropped.
 * default_reveal: {discovery: 'hidden'|'party', fields: {role: 'party', ...}}. Only used before the GM saves anything.
 */
export function normalizeState(raw, def = null) {
  const saved = raw && typeof raw === 'object' && !Array.isArray(raw);
  const dflt = !saved && def?.codex?.default_reveal && typeof def.codex.default_reveal === 'object' ? def.codex.default_reveal : {};
  const src = saved ? raw : {discovery: dflt.discovery, fields: dflt.fields};
  const fields = {};
  for (const key of REVEAL_FIELDS) fields[key] = normalizeRule(src.fields?.[key]);
  return {
    version: CODEX_STATE_VERSION,
    discovery: normalizeRule(src.discovery),
    fields,
    learned: str(saved ? raw.learned : ''),
    links: uniq((saved && Array.isArray(raw.links) ? raw.links : []).filter(isLinkId)),
    notes: str(saved ? raw.notes : ''),
    status: normalizeStatus(saved ? raw.status : undefined),
    edits: normalizeEdits(saved ? raw.edits : undefined)
  };
}
const nl = v => str(v).replace(/\r\n?/g, '\n');
/** Stored edits: only EDIT_FIELDS, only strings, cut to the field's cap. A blank name is not an edit. */
export function normalizeEdits(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of EDIT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key) || typeof raw[key] !== 'string') continue;
    const text = nl(raw[key]).slice(0, editLimit(key));
    if (key === 'name' && !text.trim()) continue;
    out[key] = text;
  }
  return out;
}
/** The pack record's text for an editable field, as the editor shows it (gm_notes: one note per line). The name falls back to the Actor name. */
export function packTextOf(npc, key) {
  const def = npc?.def ?? {};
  const v = def[key];
  if (key === 'gm_notes') return (Array.isArray(v) ? v.map(str).filter(Boolean) : str(v) ? [str(v)] : []).join('\n');
  if (key === 'name') return str(v) || str(npc?.name);
  return nl(v);
}
/** What the Codex shows for an editable field: the world edit when there is one, else the pack text. */
export function effectiveText(npc, state, key) {
  const edits = state?.edits;
  return edits && Object.prototype.hasOwnProperty.call(edits, key) ? edits[key] : packTextOf(npc, key);
}
/** Display name everywhere the Codex names an NPC. */
export const displayName = (npc, state = normalizeState(npc?.state, npc?.def)) => effectiveText(npc, state, 'name') || 'Unnamed NPC';

/** Change one rule. key is 'discovery' or a REVEAL_FIELDS key. mode: hidden | party | actor (with actorId, on true/false). */
export function setReveal(state, key, {mode, actorId = null, on = true} = {}) {
  const next = normalizeState(state);
  if (key !== 'discovery' && !REVEAL_FIELDS.includes(key)) throw new Error(GM_FIELDS.includes(key)
    ? `"${key}" is a GM-only field and cannot be revealed.`
    : `"${key}" is not a Codex field. Reveal "discovery" or one of: ${REVEAL_FIELDS.join(', ')}.`);
  const rule = key === 'discovery' ? next.discovery : next.fields[key];
  if (mode === 'hidden') { rule.party = false; rule.actors = []; }
  else if (mode === 'party') { rule.party = true; }
  else if (mode === 'actor') {
    if (!actorId || typeof actorId !== 'string') throw new Error('Choose a character.');
    rule.party = false;
    rule.actors = on ? uniq([...rule.actors, actorId]) : rule.actors.filter(a => a !== actorId);
  } else throw new Error('Reveal must be hidden, party or a character.');
  return next;
}

/**
 * 0.67.0: bulk reveals, built on the same {party, actors[]} rule. Nothing here changes how a reveal is stored.
 * Keys a GM can reveal: 'discovery' (name and portrait) plus REVEAL_FIELDS. GM_FIELDS are never in this list.
 */
export const REVEAL_KEYS = Object.freeze(['discovery', ...REVEAL_FIELDS]);
export const REVEAL_KEY_LABELS = Object.freeze({discovery: 'Name and portrait', ...FIELD_LABELS});
/** Ticked by default in the Reveal to... dialog: what anyone meeting the NPC would see. */
export const DEFAULT_REVEAL_KEYS = Object.freeze(['discovery', 'role', 'appearance', 'signature_line']);
export const REVEAL_PRESETS = Object.freeze({
  basics: Object.freeze({label: 'Reveal basics', keys: Object.freeze(['discovery', 'role', 'appearance'])}),
  // 0.96.0: status is never part of a preset: reveal it on its own, so a bulk reveal cannot announce a death.
  everything: Object.freeze({label: 'Reveal everything player-safe', keys: Object.freeze(REVEAL_KEYS.filter(k => k !== 'status'))})
});
export function presetKeys(name) {
  const preset = REVEAL_PRESETS[name];
  if (!preset) throw new Error(`Unknown preset "${name}". Use one of: ${Object.keys(REVEAL_PRESETS).join(', ')}.`);
  return [...preset.keys];
}
/** Validates a list of reveal keys (all or nothing): at least one, each revealable. Returns them de-duplicated, in display order. */
export function checkRevealKeys(keys) {
  const list = uniq(Array.isArray(keys) ? keys : []);
  if (!list.length) throw new Error('Choose at least one field to reveal.');
  for (const key of list) {
    if (!REVEAL_KEYS.includes(key)) throw new Error(GM_FIELDS.includes(key)
      ? `"${key}" is a GM-only field and cannot be revealed.`
      : `"${key}" is not a Codex field. Reveal "discovery" or one of: ${REVEAL_FIELDS.join(', ')}.`);
  }
  return REVEAL_KEYS.filter(k => list.includes(k));
}
const ruleOf = (state, key) => key === 'discovery' ? state.discovery : state.fields[key];
const sameRule = (a, b) => a.party === b.party && a.actors.length === b.actors.length && a.actors.every((id, i) => id === b.actors[i]);
/**
 * Set several rules to one audience at once. mode: 'hidden' | 'party' | 'actors' (with actorIds, which are ADDED to each
 * field's characters; a field already shown to the whole party stays as it is). Validates everything first, so a bad key
 * changes nothing. Returns {state, changed: keys that actually changed, before, after} for undo.
 */
export function applyReveals(state, {keys, mode, actorIds = []} = {}) {
  const list = checkRevealKeys(keys);
  const ids = uniq((Array.isArray(actorIds) ? actorIds : []).filter(a => typeof a === 'string' && a));
  if (!['hidden', 'party', 'actors'].includes(mode)) throw new Error('Reveal must be hidden, party or characters.');
  if (mode === 'actors' && !ids.length) throw new Error('Choose at least one character.');
  const next = normalizeState(state), changed = [], before = {}, after = {};
  for (const key of list) {
    const rule = ruleOf(next, key), was = structuredClone(rule);
    if (mode === 'hidden') { rule.party = false; rule.actors = []; }
    else if (mode === 'party') rule.party = true;
    else if (!rule.party) rule.actors = uniq([...rule.actors, ...ids]);
    if (!sameRule(was, rule)) { changed.push(key); before[key] = was; after[key] = structuredClone(rule); }
  }
  return {state: next, keys: list, changed, before, after};
}
/** Puts back the rules recorded by applyReveals, but only while they are still exactly as that action left them. */
export function undoReveals(state, {before, after} = {}) {
  const next = normalizeState(state), keys = Object.keys(before ?? {});
  if (!keys.length) throw new Error('There is nothing to undo.');
  if (keys.some(k => !REVEAL_KEYS.includes(k) || !sameRule(ruleOf(next, k), normalizeRule(after?.[k])))) {
    throw new Error('These reveals changed after that action, so it cannot be undone safely.');
  }
  for (const k of keys) { const rule = ruleOf(next, k), old = normalizeRule(before[k]); rule.party = old.party; rule.actors = old.actors; }
  return {state: next, keys};
}
/** 'Aldric', 'Aldric and Merra', 'Aldric, Merra and Tor'. */
export function joinNames(names) {
  const list = names.filter(Boolean);
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}
export function revealMessage({count, mode, names = [], already = 0}) {
  const noun = `${count} field${count === 1 ? '' : 's'}`;
  const note = already ? ` (${already} already ${already === 1 ? 'was' : 'were'} visible)` : '';
  if (mode === 'hidden') return `Hid ${noun} from players.`;
  return `Revealed ${noun} to ${mode === 'party' ? 'the whole party' : joinNames(names)}${note}.`;
}

/** Validates a life status. Anything but alive / deceased / unknown is refused. */
export function setStatus(value) {
  if (!STATUS_VALUES.includes(value)) throw new Error(`Status must be one of: ${STATUS_VALUES.join(', ')}.`);
  return value;
}
/**
 * Change the edit layer. patch: {field: text | null}. null reverts the field to the pack text. Text equal to the pack text is
 * stored as no edit at all, so "edited" always means "differs from the pack". Only EDIT_FIELDS; `stat_block` is read-only.
 * A blank name cannot be saved (revert instead). Returns {edits, changed: [field keys whose stored edit changed]}.
 */
export function setEdits(current, npc, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Edits must be an object of field: text.');
  const edits = normalizeEdits(current), changed = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (!EDIT_FIELDS.includes(key)) throw new Error(key === 'stat_block' ? 'The stat block is read-only here.' : `"${key}" cannot be edited. Editable: ${EDIT_FIELDS.join(', ')}.`);
    const had = Object.prototype.hasOwnProperty.call(edits, key) ? edits[key] : undefined;
    if (raw === null) delete edits[key];
    else {
      if (typeof raw !== 'string') throw new Error(`"${key}" must be text.`);
      const text = nl(raw).slice(0, editLimit(key));
      if (key === 'name' && !text.trim()) throw new Error('A name cannot be blank. Use Revert to pack text instead.');
      if (text === packTextOf(npc, key)) delete edits[key]; else edits[key] = text;
    }
    if (had !== (Object.prototype.hasOwnProperty.call(edits, key) ? edits[key] : undefined)) changed.push(key);
  }
  return {edits, changed};
}

/** GM-editable text and links. Links are filtered to known id prefixes; anything else is reported. */
export function setDetails(state, {learned, notes, links, status, edits} = {}, npc = null) {
  const next = normalizeState(state, npc?.def);
  const rejected = [];
  if (status !== undefined) next.status = setStatus(status);
  if (edits !== undefined) next.edits = setEdits(next.edits, npc, edits).edits;
  if (learned !== undefined) next.learned = str(learned).slice(0, 4000);
  if (notes !== undefined) next.notes = str(notes).slice(0, 8000);
  if (links !== undefined) {
    const list = (Array.isArray(links) ? links : str(links).split(/[\s,]+/)).map(s => str(s).trim().toUpperCase()).filter(Boolean);
    next.links = uniq(list.filter(isLinkId));
    rejected.push(...list.filter(id => !isLinkId(id)));
  }
  return {state: next, rejected};
}

/** Links shown for an NPC: record codex.links, then record refs that point at a linkable id, then GM-added links. */
export function linksOf(def, state) {
  const fromRecord = Array.isArray(def?.codex?.links) ? def.codex.links : [];
  const fromRefs = (Array.isArray(def?.refs) ? def.refs : []).map(r => typeof r === 'string' ? r : r?.target_id ?? r?.id);
  return uniq([...fromRecord, ...fromRefs, ...normalizeState(state).links].filter(isLinkId)).filter(id => id !== def?.id);
}

const fieldValue = (npc, state, key) => key === 'learned' ? state.learned : key === 'links' ? null
  : key === 'status' ? STATUS_CHIPS[state.status] : effectiveText(npc, state, key);
const textOf = v => Array.isArray(v) ? v.map(str).filter(Boolean) : str(v);
const GM_EDIT_SET = new Set(['portrayal', 'session_role', 'gm_notes']);

/**
 * GM view of one NPC. `npc` is {def, state, uuid, img, name}. `nameOf(id)` resolves a link id to a display name (GM side).
 */
export function gmEntry(npc, {nameOf = () => null, characters = []} = {}) {
  const def = npc.def ?? {}, state = normalizeState(npc.state, def);
  const charName = id => characters.find(c => c.id === id)?.name ?? 'Unknown character';
  const describe = rule => rule.party ? 'Party' : rule.actors.length ? rule.actors.map(charName).join(', ') : 'Hidden';
  const links = linksOf(def, state).map(id => { const name = nameOf(id); return {id, kind: linkKind(id), name: name ?? `${LINK_KIND_LABEL[linkKind(id)] ?? 'Linked'} record (not in this world)`, named: Boolean(name), gmAdded: state.links.includes(id)}; });
  const gmText = key => key === 'gm_notes' ? effectiveText(npc, state, key).split('\n').map(l => l.trim()).filter(Boolean) : effectiveText(npc, state, key);
  const edited = key => Object.prototype.hasOwnProperty.call(state.edits, key);
  const name = displayName(npc, state);
  // 0.96.0: one "Only you" chip by the name when the NPC is not yet known to players or the record is GM-only; GM-only fields carry a quiet cue instead.
  const onlyYou = ruleMode(state.discovery) === 'hidden' || def.visibility === 'gm';
  return {
    id: def.id, uuid: npc.uuid ?? null, name, img: npc.img ?? null,
    status: str(def.status), discovery: state.discovery, discoveryMode: ruleMode(state.discovery), discoveryLabel: describe(state.discovery),
    life: {value: state.status, label: STATUS_LABELS[state.status], chip: STATUS_CHIPS[state.status], showChip: state.status !== DEFAULT_STATUS},
    onlyYou,
    fields: REVEAL_FIELDS.map(key => ({key, label: FIELD_LABELS[key], value: fieldValue(npc, state, key), rule: state.fields[key],
      mode: ruleMode(state.fields[key]), who: describe(state.fields[key]), edited: EDIT_FIELDS.includes(key) && edited(key),
      empty: key === 'links' ? !links.length : !fieldValue(npc, state, key)})),
    gmFields: GM_FIELDS.map(key => ({key, label: FIELD_LABELS[key], value: key === 'stat_block' ? textOf(def[key]) : gmText(key), edited: edited(key)}))
      .filter(f => Array.isArray(f.value) ? f.value.length : f.value),
    editFields: EDIT_FIELDS.map(key => ({key, label: key === 'name' ? 'Name' : FIELD_LABELS[key], gmOnly: GM_EDIT_SET.has(key),
      value: effectiveText(npc, state, key), pack: packTextOf(npc, key), edited: edited(key),
      multiline: key !== 'name' && key !== 'role', rows: key === 'gm_notes' ? 4 : 3})),
    learned: state.learned, notes: state.notes, links, gmLinks: state.links,
    revealedCount: REVEAL_FIELDS.filter(k => ruleMode(state.fields[k]) !== 'hidden').length
  };
}

/**
 * What one player may receive about one NPC, or null. Built on the GM side; nothing hidden is ever in the result.
 * actorIds: the characters that player owns. Name and portrait show once the NPC is discovered by the party or
 * one of those characters. Each field shows only when its own rule includes the party or one of those characters.
 * `linkFor(id, kind)` (0.41.1) says what this player may know of one linked record, by the owning module's own player
 * filter: a name, `true` (the player's own client claimed the id and fills in the name itself) or null (not known).
 * A link that is not known is sent as {id: null, kind, name: 'Unknown', unknown: true}: no id, no name, no link.
 * The default knows nothing, so every link is Unknown.
 */
export function playerEntry(npc, actorIds = [], {linkFor = () => null} = {}) {
  const def = npc.def ?? {}, state = normalizeState(npc.state, def);
  if (!knowsRule(state.discovery, actorIds)) return null;
  const out = {id: def.id, name: displayName(npc, state), img: npc.img ?? null, fields: []};
  for (const key of REVEAL_FIELDS) {
    const rule = state.fields[key];
    if (!knowsRule(rule, actorIds)) continue;
    const onlyYou = !rule.party;
    if (key === 'links') {
      const links = linksOf(def, state).map(id => {
        const kind = linkKind(id);
        let known = null;
        try { known = linkFor(id, kind); } catch { known = null; }
        if (known === true) return {id, kind, name: null};
        return typeof known === 'string' && known ? {id, kind, name: known} : unknownLink(kind);
      });
      if (links.length) out.fields.push({key, label: FIELD_LABELS[key], links, onlyYou});
      continue;
    }
    const value = fieldValue(npc, state, key);
    if (!value) continue;
    // 0.96.0: status goes to a player only when it is revealed to them (the rule check above); hidden status adds nothing at all.
    out.fields.push(key === 'status' ? {key, label: FIELD_LABELS[key], value, status: state.status, onlyYou} : {key, label: FIELD_LABELS[key], value, onlyYou});
  }
  return out;
}
export function playerCodex(npcs, actorIds = [], opts = {}) {
  return npcs.map(n => playerEntry(n, actorIds, opts)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}
/**
 * 0.41.1, player client: fill in the links the GM sent back as {id, name: null} (ids this client claimed) from
 * `names` (id -> name, read from the owning modules' player-filtered APIs on this client). Anything the client cannot
 * name becomes Unknown with no id.
 */
export function resolvePlayerLinks(entries, names = new Map()) {
  const link = l => l?.unknown || !l?.id ? unknownLink(l?.kind) : l.name ? l : names.get(l.id) ? {...l, name: names.get(l.id)} : unknownLink(l.kind);
  return (entries ?? []).map(e => !Array.isArray(e?.fields) ? e
    : {...e, fields: e.fields.map(f => Array.isArray(f?.links) ? {...f, links: f.links.map(link)} : f)});
}

/** One GM file: canonical definitions (no Foundry projection) and play state, keyed by NPC id. GM only: holds GM fields. */
export function buildCodexExport(npcs, {exportedAt = new Date().toISOString()} = {}) {
  const sorted = [...npcs].sort((a, b) => str(a.def?.id).localeCompare(str(b.def?.id)));
  return {
    schema_version: CODEX_EXPORT_SCHEMA, exported_at: exportedAt, visibility: 'gm',
    definitions: sorted.map(n => structuredClone(n.def)),
    reveals: Object.fromEntries(sorted.map(n => [n.def.id, normalizeState(n.state, n.def)]))
  };
}

/**
 * 0.96.0: the Codex layer for the world backup (`npc_codex` in manager-edits.json), an additive key beside `records` and `world_only`.
 * Per NPC that has saved Codex state: edits, status, learned, notes, GM-added links, discovery and per-field reveals. GM file only.
 * Actor ids in reveals are world-local; `actor_names` names them. Sorted by id so a re-run changes only what changed.
 */
export function buildCodexBackupLayer(npcs, characters = []) {
  const name = id => characters.find(c => c.id === id)?.name ?? null;
  return [...npcs].filter(n => n.state && typeof n.state === 'object').sort((a, b) => str(a.def?.id).localeCompare(str(b.def?.id))).map(n => {
    const state = normalizeState(n.state, n.def);
    const ids = uniq([...state.discovery.actors, ...Object.values(state.fields).flatMap(r => r.actors)]);
    return {
      id: n.def.id, name: displayName(n, state), pack_name: packTextOf(n, 'name'), status: state.status,
      edits: state.edits, learned: state.learned, notes: state.notes, links: state.links,
      discovery: state.discovery, reveals: state.fields,
      actor_names: Object.fromEntries(ids.map(id => [id, name(id)]).filter(([, v]) => v))
    };
  });
}

/**
 * Plan a reveals restore from a Codex export. Only NPCs already in the world are touched; definitions in the file
 * are ignored (content comes from the package import). Returns {apply:[{id,state}], missing:[id], errors:[]}.
 */
export function planRevealsImport(file, knownIds = []) {
  const errors = [];
  if (!file || typeof file !== 'object') return {apply: [], missing: [], errors: ['Not a JSON object.']};
  if (file.schema_version !== CODEX_EXPORT_SCHEMA) errors.push(`schema_version must be ${CODEX_EXPORT_SCHEMA}.`);
  const reveals = file.reveals && typeof file.reveals === 'object' && !Array.isArray(file.reveals) ? file.reveals : null;
  if (!reveals) errors.push('reveals must be an object keyed by NPC id.');
  if (errors.length) return {apply: [], missing: [], errors};
  const known = new Set(knownIds), apply = [], missing = [];
  for (const [id, raw] of Object.entries(reveals)) {
    if (!known.has(id)) { missing.push(id); continue; }
    apply.push({id, state: normalizeState(raw && typeof raw === 'object' ? raw : {})});
  }
  return {apply, missing, errors};
}

const esc = v => str(v).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
/** Tooltip for a non-deity link the player does not know (0.41.1). */
export const UNKNOWN_TIP = 'Something you have not learned about yet.';
/** Tooltip for a deity link that cannot open. */
export const DEITY_TIPS = Object.freeze({
  unknown: 'A deity you have not discovered yet.',
  noRenown: 'Renown is not active, so this deity cannot be opened.',
  hidden: 'Renown is hidden from players right now.',
  missing: 'This deity is not in this world (Renown does not know it).'
});
/** One player-view link. `deityLink(link)` -> {open, title}: whether Renown can open that deity here (0.40.0). */
function linkHtml(l, deityLink) {
  if (l.kind !== 'deity') return l.unknown || !l.id || !l.name
    ? `<span class="agm-codex-link is-unknown" data-tooltip-class="ag-tooltip" data-tooltip="${esc(UNKNOWN_TIP)}">${esc(UNKNOWN_LINK)}</span>`
    : `<span class="agm-codex-link">${esc(l.name)}</span>`;
  if (l.unknown || !l.id) return `<span class="agm-codex-link agm-codex-link--deity is-unknown" data-tooltip-class="ag-tooltip" data-tooltip="${esc(DEITY_TIPS.unknown)}">${esc(UNKNOWN_DEITY)}</span>`;
  const how = deityLink(l) ?? {};
  if (how.unknown) return `<span class="agm-codex-link agm-codex-link--deity is-unknown" data-tooltip-class="ag-tooltip" data-tooltip="${esc(DEITY_TIPS.unknown)}">${esc(UNKNOWN_DEITY)}</span>`;
  // 0.46.0: a real button, so keyboard users can open the deity (was an <a> with no href).
  if (how.open) return `<button type="button" class="agm-codex-link agm-codex-link--deity is-open" data-ag-codex-deity="${esc(l.id)}" data-tooltip-class="ag-tooltip" data-tooltip="${esc(how.title || 'Open in the Renown Pantheon')}"><i class="fa-solid fa-sun" aria-hidden="true"></i> ${esc(l.name)}</button>`;
  return `<span class="agm-codex-link agm-codex-link--deity" data-tooltip-class="ag-tooltip" data-tooltip="${esc(how.title || DEITY_TIPS.noRenown)}">${esc(l.name)}</span>`;
}
/** Read-only player Codex markup (window body and api.codex.mount). Input is already a player projection.
 * Deity links open only when `deityLink` says so; the default never links (plain text with a tooltip). */
export function renderPlayerCodexHtml(entries, {message = '', deityLink = () => ({open: false, title: DEITY_TIPS.noRenown})} = {}) {
  if (message) return `<div class="agm-codex-player"><p class="ag-notice ag-notice--danger" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> ${esc(message)}</p></div>`;
  if (!entries.length) return `<div class="agm-codex-player"><div class="ag-empty"><i class="fa-solid fa-address-book" aria-hidden="true"></i><p class="ag-empty__title">No NPCs yet</p><p class="ag-empty__text">Your GM hasn't revealed anyone yet. People you meet appear here once your GM shares them.</p></div></div>`;
  const card = e => {
    const initials = esc(e.name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('') || '?');
    const portrait = e.img ? `<img class="agm-codex-portrait" src="${esc(e.img)}" alt="">` : `<span class="agm-codex-portrait" aria-hidden="true">${initials}</span>`;
    const role = e.fields.find(f => f.key === 'role');
    const life = e.fields.find(f => f.key === 'status');
    const chip = life ? ` <span class="ag-badge agm-codex-life agm-codex-life--${esc(life.status)}">${esc(life.value)}</span>` : '';
    const rows = e.fields.filter(f => f.key !== 'role' && f.key !== 'status').map(f => {
      const only = f.onlyYou ? ' <span class="ag-badge ag-badge--accent">only you</span>' : '';
      const body = f.links ? f.links.map(l => linkHtml(l, deityLink)).join(' ')
        : f.key === 'signature_line' ? `<q>${esc(f.value)}</q>` : esc(f.value);
      return `<dt>${esc(f.label)}${only}</dt><dd>${body}</dd>`;
    }).join('');
    return `<article class="ag-card agm-codex-card" data-npc="${esc(e.id)}"><header class="agm-codex-card__head">${portrait}<div><h3>${esc(e.name)}${chip}</h3>`
      + `<p>${role ? esc(role.value) : '<em>Role not known yet</em>'}</p></div></header>${rows ? `<dl>${rows}</dl>` : ''}</article>`;
  };
  return `<div class="agm-codex-player">${entries.map(card).join('')}</div>`;
}
