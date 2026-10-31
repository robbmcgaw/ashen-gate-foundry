/**
 * Party characters (0.93.0): a slim, readable copy of the players' character sheets for Back up world now… (`world-backup/party.json`).
 * PLAY STATE, not content: its own schema string, `ag-party-sheets-export/0.1`, which the content reconcile lists and skips.
 *
 *  - GM only: the builder checks the user itself.
 *  - Characters: world Actors of type `character` that a non-GM user owns (OWNER on the Actor itself; the "default" ownership
 *    does not count). GM-owned characters, NPCs and Actors no player owns are left out.
 *  - Plain JSON: no timestamps, no biography, notes, effects or flags. Rows are sorted so a re-run changes only what changed.
 *  - Ashen Gate state (professions, Cinders, Skill Trees) is read only through each module's public api (`game.modules.get(id)?.api`),
 *    feature-detected. A module that is absent, inactive or without the call gives `{skipped: reason}` in that place; nothing
 *    reaches into another module's internals.
 */
export const PARTY_SCHEMA = 'ag-party-sheets-export/0.1';
export const DESCRIPTION_LIMIT = 600;
const OWNER_LEVEL = 3;

const isGM = user => Boolean(user?.isGM);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const text = v => (typeof v === 'string' ? v.trim() : '');
const num = (v, fallback = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);
/** Collections (Foundry), Maps, Sets, arrays and plain objects all read as an array of values. */
const listOf = c => {
  if (!c) return [];
  if (Array.isArray(c)) return c;
  if (Array.isArray(c.contents)) return c.contents;
  if (c instanceof Map) return [...c.values()];
  if (typeof c[Symbol.iterator] === 'function') return [...c];
  return typeof c === 'object' ? Object.values(c) : [];
};
/** The keys of a Set or array, or the truthy keys of an object. */
const keysOf = c => (c instanceof Set || Array.isArray(c) ? [...c] : c && typeof c === 'object' ? Object.keys(c).filter(k => c[k]) : []).map(String);
const sortedBy = (rows, ...fields) => [...rows].sort((a, b) => { for (const f of fields) { const r = cmp(String(a[f] ?? ''), String(b[f] ?? '')); if (r) return r; } return 0; });

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…'};
/** Description HTML as plain text: enrichers become their label, tags go, entities decode, whitespace collapses; at most `limit` characters. */
export function plainText(html, limit = DESCRIPTION_LIMIT) {
  const s = String(html ?? '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/@[A-Za-z]+\[[^\]]*\]\{([^}]*)\}/g, '$1')                    // @UUID[...]{Label}
    .replace(/@[A-Za-z]+\[([^\]]*)\]/g, '$1')                              // @Check[dex]
    .replace(/\[\[\/?[a-z]*\s*([^\]]*?)\]\](?:\{([^}]*)\})?/gi, (m, inner, label) => label ?? inner) // [[/r 1d6]]{label}
    .replace(/<\s*(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, ' ')     // block ends read as a space
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
    })
    .replace(/\s+/g, ' ').trim();
  return s.length > limit ? `${s.slice(0, limit - 1).trimEnd()}…` : s;
}

// ---------- Which characters ----------
/** Names of the non-GM users who own the Actor. Empty when none: the character is not a player's. */
export function playerOwners(game, actor) {
  const names = [];
  for (const [id, level] of Object.entries(actor?.ownership ?? {})) {
    if (id === 'default' || num(level, 0) < OWNER_LEVEL) continue;
    const user = game?.users?.get?.(id);
    if (user && !isGM(user)) names.push(text(user.name) || 'Unnamed player');
  }
  return names.sort(cmp);
}

// ---------- One character ----------
const traitList = trait => {
  const custom = text(trait?.custom).split(/[;\n]/).map(s => s.trim()).filter(Boolean);
  return [...keysOf(trait?.value).sort(cmp), ...custom];
};

function abilitiesOf(sys) {
  const out = {};
  for (const key of Object.keys(sys.abilities ?? {}).sort(cmp)) {
    const a = sys.abilities[key] ?? {}, score = num(a.value, 10), modifier = num(a.mod, Math.floor((score - 10) / 2));
    out[key] = {score, modifier, save_proficient: num(a.proficient, 0) > 0, save_bonus: num(a.save?.value, modifier)};
  }
  return out;
}

function skillsOf(sys) {
  const out = {};
  for (const key of Object.keys(sys.skills ?? {}).sort(cmp)) out[key] = {proficiency: num(sys.skills[key]?.value, 0), ability: text(sys.skills[key]?.ability) || null};
  return out;
}

function speedOf(sys) {
  const m = sys.attributes?.movement ?? {}, out = {};
  for (const key of Object.keys(m).sort(cmp)) if (key !== 'units' && num(m[key], 0) > 0) out[key] = num(m[key]);
  return {...out, units: text(m.units) || null};
}

function toolsOf(sys) {
  const t = sys.tools;
  const keyed = t && typeof t === 'object' && !(t instanceof Set) && !Array.isArray(t) ? Object.keys(t).filter(k => num(t[k]?.value, 0) > 0).sort(cmp) : [];
  return [...keyed, ...traitList(sys.traits?.toolProf)];
}

const activationOf = item => {
  for (const activity of listOf(item.system?.activities)) { const t = text(activity?.activation?.type); if (t) return t; }
  return text(item.system?.activation?.type) || null;
};

function classesOf(items) {
  const subclasses = items.filter(i => i.type === 'subclass');
  return sortedBy(items.filter(i => i.type === 'class').map(c => {
    const identifier = text(c.system?.identifier);
    const sub = identifier ? subclasses.find(s => text(s.system?.classIdentifier) === identifier) : null;
    return {name: text(c.name), identifier, levels: num(c.system?.levels, 0), subclass: sub ? text(sub.name) : null};
  }), 'name', 'identifier');
}

const featureRow = i => ({name: text(i.name), identifier: text(i.system?.identifier),
  source: {book: text(i.system?.source?.book), custom: text(i.system?.source?.custom)},
  activation: activationOf(i), description: plainText(i.system?.description?.value)});
const spellRow = i => {
  const prepared = i.system?.prepared ?? i.system?.preparation?.prepared;
  return {name: text(i.name), level: num(i.system?.level, 0), prepared: prepared === true || num(prepared, 0) > 0,
    preparation: text(i.system?.method ?? i.system?.preparation?.mode) || null, school: text(i.system?.school) || null};
};
const INVENTORY_TYPES = new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container']);
const inventoryRow = i => ({name: text(i.name), type: i.type, quantity: num(i.system?.quantity, 1), equipped: i.system?.equipped === true,
  attuned: i.system?.attuned === true, rarity: text(i.system?.rarity) || null});

// ---------- Ashen Gate state, through public apis only ----------
const fn = (api, ...path) => { let at = api; for (const key of path) at = at?.[key]; return typeof at === 'function' ? at : null; };

/** One reader per module: {ok:true, read(actor)} or {skipped: reason}. read(actor) may throw (that character gets a skipped note). */
function readers(game) {
  const out = {};
  const need = (key, id, label, calls, make) => {
    const mod = game?.modules?.get?.(id);
    if (!mod) return void (out[key] = {skipped: `${label} is not installed`});
    if (!mod.active) return void (out[key] = {skipped: `${label} is not active in this world`});
    const api = mod.api ?? null;
    if (!api) return void (out[key] = {skipped: `this version of ${label} has no api`});
    const missing = calls.filter(c => !fn(api, ...c));
    if (missing.length) return void (out[key] = {skipped: `this version of ${label} has no ${missing.map(c => c.join('.')).join(' or ')}; update it`});
    out[key] = {ok: true, read: make(api)};
  };
  need('professions', 'ashen-gate-profession-ledger', 'Profession Ledger', [['getProfessions']], api => actor => {
    const progressOf = fn(api, 'getProfessionProgress');
    return sortedBy(api.getProfessions(actor).map(p => {
      let perks = null;
      if (progressOf) { try { perks = [...(progressOf.call(api, actor, p.professionId)?.selectedPerkIds ?? [])].sort(cmp); } catch { perks = null; } }
      return {profession_id: p.professionId, name: text(p.name), level: num(p.level, 0), xp: num(p.xp, 0), tier: p.tier ?? null,
        unspent_perk_choices: num(p.unspentPerkChoices, 0), ...(perks ? {selected_perk_ids: perks} : {})};
    }), 'profession_id');
  });
  const power = p => ({power_id: p.powerId, name: text(p.name)});
  need('cinders', 'ashen-gate-cinders', 'Cinders', [['cinder', 'list']], api => actor =>
    sortedBy(api.cinder.list(actor).map(c => ({instance_id: c.instanceId, definition_id: c.definitionId, name: text(c.name),
      unlocked_powers: sortedBy((c.powers ?? []).map(power), 'name', 'power_id'),
      enhancements: sortedBy((c.enhancements ?? []).map(power), 'name', 'power_id')})), 'definition_id', 'instance_id'));
  need('skill_trees', 'ashen-gate-skill-trees', 'Skill Trees', [['pointsSummary']], api => actor =>
    sortedBy(api.pointsSummary(actor).map(t => ({tree_id: t.treeId, name: text(t.name), kind: t.kind ?? null, level: t.level ?? null,
      earned: t.earned ?? null, spent: num(t.spent, 0), available: t.available ?? null})), 'tree_id'));
  return out;
}
const readFor = (reader, actor) => {
  if (!reader.ok) return {skipped: reader.skipped};
  try { return reader.read(actor); } catch { return {skipped: 'it could not be read for this character'}; }
};

// ---------- The file ----------
function characterRow(actor, owners, rd) {
  const sys = actor.system ?? {}, items = listOf(actor.items), classes = classesOf(items);
  const nameOf = type => { const i = items.find(x => x.type === type); return i ? text(i.name) : null; };
  const rows = list => sortedBy(list, 'name', 'identifier', 'type', 'level');
  return {
    actor_id: actor.id, name: text(actor.name), owner: owners.join(', '),
    level: num(sys.details?.level, classes.reduce((n, c) => n + c.levels, 0)),
    classes, species: nameOf('race'), background: nameOf('background'),
    abilities: abilitiesOf(sys), skills: skillsOf(sys),
    hp: {max: num(sys.attributes?.hp?.max, 0), temp_max: num(sys.attributes?.hp?.tempmax, 0)},
    ac: num(sys.attributes?.ac?.value, 0), speed: speedOf(sys),
    initiative_bonus: num(sys.attributes?.init?.total, num(sys.attributes?.init?.mod, 0)),
    proficiencies: {armor: traitList(sys.traits?.armorProf), weapons: traitList(sys.traits?.weaponProf), tools: toolsOf(sys), languages: traitList(sys.traits?.languages)},
    currency: Object.fromEntries(['pp', 'gp', 'ep', 'sp', 'cp'].map(k => [k, num(sys.currency?.[k], 0)])),
    features: rows(items.filter(i => i.type === 'feat').map(featureRow)),
    spells: rows(items.filter(i => i.type === 'spell').map(spellRow)),
    inventory: rows(items.filter(i => INVENTORY_TYPES.has(i.type)).map(inventoryRow)),
    ashen_gate: {professions: readFor(rd.professions, actor), cinders: readFor(rd.cinders, actor), skill_trees: readFor(rd.skill_trees, actor)}
  };
}

/** The party.json document. GM only (throws otherwise: the backup treats a throw as "could not be read just now"). */
export function buildPartySheets(game) {
  if (!isGM(game?.user)) throw new Error('GM only');
  const rd = readers(game), characters = [];
  for (const actor of listOf(game.actors)) {
    if (actor?.type !== 'character') continue;
    const owners = playerOwners(game, actor);
    if (owners.length) characters.push(characterRow(actor, owners, rd));
  }
  return {
    schema_version: PARTY_SCHEMA,
    note: 'Play state, read only. Never import this file. Biography, notes, effects and flags are not included.',
    characters: sortedBy(characters, 'name', 'actor_id')
  };
}
