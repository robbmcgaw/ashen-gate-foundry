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
export const REVEAL_FIELDS = Object.freeze(['role', 'appearance', 'signature_line', 'wants', 'knows', 'learned', 'links']);
/** Record fields that never leave the GM: not revealable, never in a player projection. */
export const GM_FIELDS = Object.freeze(['portrayal', 'session_role', 'stat_block', 'gm_notes']);
export const FIELD_LABELS = Object.freeze({
  role: 'Role', appearance: 'Appearance', signature_line: 'Signature line', wants: 'Wants', knows: 'Knows',
  learned: 'What the party has learned', links: 'Connections',
  portrayal: 'Portrayal', session_role: 'Session role', stat_block: 'Stat block', gm_notes: 'GM notes'
});
/** Ids a Codex link may point at. FAC- is a Headquarters facility elsewhere, but GPT drafts use it for factions too. */
const LINK_PREFIXES = ['LOC', 'FAC', 'FACTION', 'RENOWN', 'QUEST', 'ORDER', 'CONTRACT', 'NPC'];
const ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;

const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
const uniq = list => [...new Set(list)];

export function isNpcDefinition(def) {
  return Boolean(def && typeof def === 'object' && def.entity_type === 'NPC' && typeof def.id === 'string');
}
export function isLinkId(id) {
  return typeof id === 'string' && ID_RE.test(id) && LINK_PREFIXES.includes(id.split('-')[0]);
}
export function linkKind(id) {
  const p = str(id).split('-')[0];
  return p === 'LOC' ? 'location' : p === 'NPC' ? 'npc' : ['QUEST', 'ORDER', 'CONTRACT'].includes(p) ? 'quest' : 'renown';
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
    notes: str(saved ? raw.notes : '')
  };
}

/** Change one rule. key is 'discovery' or a REVEAL_FIELDS key. mode: hidden | party | actor (with actorId, on true/false). */
export function setReveal(state, key, {mode, actorId = null, on = true} = {}) {
  const next = normalizeState(state);
  if (key !== 'discovery' && !REVEAL_FIELDS.includes(key)) throw new Error(`"${key}" cannot be revealed. GM-only fields stay GM-only.`);
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

/** GM-editable text and links. Links are filtered to known id prefixes; anything else is reported. */
export function setDetails(state, {learned, notes, links} = {}) {
  const next = normalizeState(state);
  const rejected = [];
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

const fieldValue = (def, state, key) => key === 'learned' ? state.learned : key === 'links' ? null : str(def?.[key]);
const textOf = v => Array.isArray(v) ? v.map(str).filter(Boolean) : str(v);

/**
 * GM view of one NPC. `npc` is {def, state, uuid, img, name}. `nameOf(id)` resolves a link id to a display name (GM side).
 */
export function gmEntry(npc, {nameOf = () => null, characters = []} = {}) {
  const def = npc.def ?? {}, state = normalizeState(npc.state, def);
  const charName = id => characters.find(c => c.id === id)?.name ?? 'Unknown character';
  const describe = rule => rule.party ? 'Party' : rule.actors.length ? rule.actors.map(charName).join(', ') : 'Hidden';
  const links = linksOf(def, state).map(id => { const name = nameOf(id); return {id, kind: linkKind(id), name: name ?? id, named: Boolean(name), gmAdded: state.links.includes(id)}; });
  return {
    id: def.id, uuid: npc.uuid ?? null, name: str(def.name) || str(npc.name) || def.id, img: npc.img ?? null,
    status: str(def.status), discovery: state.discovery, discoveryMode: ruleMode(state.discovery), discoveryLabel: describe(state.discovery),
    fields: REVEAL_FIELDS.map(key => ({key, label: FIELD_LABELS[key], value: fieldValue(def, state, key), rule: state.fields[key],
      mode: ruleMode(state.fields[key]), who: describe(state.fields[key]),
      empty: key === 'links' ? !links.length : !fieldValue(def, state, key)})),
    gmFields: GM_FIELDS.map(key => ({key, label: FIELD_LABELS[key], value: textOf(def[key])}))
      .filter(f => Array.isArray(f.value) ? f.value.length : f.value),
    learned: state.learned, notes: state.notes, links, gmLinks: state.links,
    revealedCount: REVEAL_FIELDS.filter(k => ruleMode(state.fields[k]) !== 'hidden').length
  };
}

/**
 * What one player may receive about one NPC, or null. Built on the GM side; nothing hidden is ever in the result.
 * actorIds: the characters that player owns. Name and portrait show once the NPC is discovered by the party or
 * one of those characters. Each field shows only when its own rule includes the party or one of those characters.
 * `nameOf` must only return names the GM is happy to show (the GM revealed the links field).
 */
export function playerEntry(npc, actorIds = [], {nameOf = () => null} = {}) {
  const def = npc.def ?? {}, state = normalizeState(npc.state, def);
  if (!knowsRule(state.discovery, actorIds)) return null;
  const out = {id: def.id, name: str(def.name) || str(npc.name) || def.id, img: npc.img ?? null, fields: []};
  for (const key of REVEAL_FIELDS) {
    const rule = state.fields[key];
    if (!knowsRule(rule, actorIds)) continue;
    const onlyYou = !rule.party;
    if (key === 'links') {
      const links = linksOf(def, state).map(id => ({id, kind: linkKind(id), name: str(nameOf(id) ?? id)}));
      if (links.length) out.fields.push({key, label: FIELD_LABELS[key], links, onlyYou});
      continue;
    }
    const value = fieldValue(def, state, key);
    if (value) out.fields.push({key, label: FIELD_LABELS[key], value, onlyYou});
  }
  return out;
}
export function playerCodex(npcs, actorIds = [], opts = {}) {
  return npcs.map(n => playerEntry(n, actorIds, opts)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
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
/** Read-only player Codex markup (window body and api.codex.mount). Input is already a player projection. */
export function renderPlayerCodexHtml(entries, {message = ''} = {}) {
  if (message) return `<div class="ag-codex-player"><p class="ag-empty">${esc(message)}</p></div>`;
  if (!entries.length) return `<div class="ag-codex-player"><p class="ag-empty">No one has been added to your codex yet.</p></div>`;
  const card = e => {
    const initials = esc(e.name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('') || '?');
    const portrait = e.img ? `<img class="ag-codex-portrait" src="${esc(e.img)}" alt="">` : `<span class="ag-codex-portrait" aria-hidden="true">${initials}</span>`;
    const role = e.fields.find(f => f.key === 'role');
    const rows = e.fields.filter(f => f.key !== 'role').map(f => {
      const only = f.onlyYou ? ' <span class="ag-badge ag-badge--accent">only you</span>' : '';
      const body = f.links ? f.links.map(l => `<span class="ag-codex-link">${esc(l.name)}</span>`).join(' ')
        : f.key === 'signature_line' ? `<q>${esc(f.value)}</q>` : esc(f.value);
      return `<dt>${esc(f.label)}${only}</dt><dd>${body}</dd>`;
    }).join('');
    return `<article class="ag-card ag-codex-card" data-npc="${esc(e.id)}"><header class="ag-codex-card__head">${portrait}<div><h3>${esc(e.name)}</h3>`
      + `<p>${role ? esc(role.value) : '<em>Role not known yet</em>'}</p></div></header>${rows ? `<dl>${rows}</dl>` : ''}</article>`;
  };
  return `<div class="ag-codex-player">${entries.map(card).join('')}</div>`;
}
