/**
 * Travel (0.37.0 as "overland travel"; player-facing Travel tab and Journal since 0.39.0). The party shares a few actions a day (Travel, Scout, Explore);
 * the GM adjudicates the rest at the table. This file is the state and the service behind the Travel tab and api.overland (the internal names
 * `overland` and `ag-overland/1` stay for compatibility). No Foundry globals: main.mjs supplies them. Nothing here rolls.
 *
 * The state is stored in TWO places, because world settings are readable by every client:
 *  - PUBLIC (the `overland` world setting): {day, used, total, requests, journal}. Players may read all of it.
 *  - SECRET (the GM Data Journal's `overland` flag, GM only): {mounted, announce, conditions}. Never in the world setting.
 * A world saved before 0.39.0 holds the secret keys (and a short `log`) in the public setting; planMigration() moves them.
 */
import {CONDITION_IDS, OVERLAND_CONDITIONS, normalizeConditions, stepsRemaining, effectiveLocationConditions} from './overland-conditions.mjs';
import {blockModifiers, combine, SCOUT_LADDER, MODIFIER_SCOPE, TERRAINS} from './travel-modifiers.mjs';
import {ACTION_LABEL, calculateAction, cleanOverride, mergeSeverities} from './overland-preview.mjs';
import {DEFAULT_UNIDENTIFIED_LABEL} from './model.mjs';

export const OVERLAND_CONTRACT = 'ag-overland/1';
export const BASE_ACTIONS = 3;
export const JOURNAL_MAX = 400;
export const TEXT_MAX = 2000;
export const REQUESTS_MAX = 12;
export const ACTIONS = Object.freeze({travel: 'Travel', scout: 'Scout', explore: 'Explore'});
/** The keys that used to live in the public setting and are now GM only. */
export const SECRET_KEYS = Object.freeze(['mounted', 'announce', 'conditions']);
export const COST_MAX = 5;
const MOVES_MAX = 20;
const LOC_ID = /^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const TERRAIN_BY_TYPE = Object.freeze({'difficult terrain': 'difficult-terrain', marsh: 'marsh', forest: 'forest', hills: 'hills', grassland: 'grassland', road: 'road'});
const whole = (v, min, max) => Number.isSafeInteger(v) && v >= min ? Math.min(v, max) : min;
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const short = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const body = v => typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, TEXT_MAX) : '';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const newEntryId = () => `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The PUBLIC part, whatever is in the world setting: {day, used, total, requests: [{userId, name, action}], journal: [{id, day, kind, text, by}]}. Unknown and legacy keys are dropped. */
export function normalizePublic(raw) {
  const r = obj(raw), seenUsers = new Set(), seenIds = new Set();
  const requests = (Array.isArray(r.requests) ? r.requests : []).filter(q => q && typeof q.userId === 'string' && q.userId && q.userId.length <= 64 && ACTIONS[q.action] && !seenUsers.has(q.userId) && seenUsers.add(q.userId))
    .map(q => ({userId: q.userId, name: short(q.name, 60), action: q.action})).slice(0, REQUESTS_MAX);
  const journal = (Array.isArray(r.journal) ? r.journal : []).filter(e => e && typeof e.id === 'string' && e.id && e.id.length <= 64 && ACTIONS[e.kind] && Number.isSafeInteger(e.day) && e.day >= 1 && !seenIds.has(e.id) && seenIds.add(e.id))
    .map(e => ({id: e.id, day: e.day, kind: e.kind, text: body(e.text), by: short(e.by, 60) || null,
      ...(Number.isSafeInteger(e.cost) && e.cost >= 0 && e.cost <= COST_MAX ? {cost: e.cost} : {}), ...(short(e.area, 80) ? {area: short(e.area, 80)} : {})})).slice(-JOURNAL_MAX);
  return {day: whole(r.day, 1, 99999), used: whole(r.used, 0, 99), total: whole(r.total, BASE_ACTIONS, BASE_ACTIONS + 2), requests, journal, area: short(r.area, 80)};
}
const areaRefOf = v => { const o = obj(v); return LOC_ID.test(o.id ?? '') ? {id: o.id, name: short(o.name, 120)} : null; };
/** The SECRET part: {mounted, announce, conditions: {id: 0..3} (daily, all areas), areaConditions: {LOC id: {id: 1..3}} (daily, one area), areaRef: {id, name} | null (the party's current area), moves: [{entryId, prevRef}] (for Undo)}. */
export function normalizeSecret(raw) {
  const r = obj(raw), areaConditions = {};
  for (const [id, set] of Object.entries(obj(r.areaConditions))) {
    if (!LOC_ID.test(id)) continue;
    const c = Object.fromEntries(Object.entries(normalizeConditions(set)).filter(([, v]) => v > 0));
    if (Object.keys(c).length) areaConditions[id] = c;
  }
  const moves = (Array.isArray(r.moves) ? r.moves : []).filter(m => m && typeof m.entryId === 'string').map(m => ({entryId: m.entryId.slice(0, 64), prevRef: areaRefOf(m.prevRef)})).slice(-MOVES_MAX);
  return {mounted: r.mounted === true, announce: r.announce === true, conditions: normalizeConditions(r.conditions), areaConditions, areaRef: areaRefOf(r.areaRef), moves};
}
const hasSecret = raw => Object.keys(obj(raw)).length > 0;
/** The whole working state: the public setting plus the GM-only store. A world not yet migrated still has the secret keys in the public setting; they are read from there until planMigration moves them. */
export function joinState(publicRaw, secretRaw) {
  return {...normalizePublic(publicRaw), ...normalizeSecret(hasSecret(secretRaw) ? secretRaw : publicRaw)};
}
export const splitState = state => ({
  public: {day: state.day, used: state.used, total: state.total, requests: state.requests.map(q => ({...q})), journal: state.journal.map(e => ({...e})), area: state.area ?? ''},
  secret: {mounted: state.mounted, announce: state.announce, conditions: {...state.conditions}, areaConditions: structuredClone(state.areaConditions ?? {}),
    areaRef: state.areaRef ? {...state.areaRef} : null, moves: (state.moves ?? []).map(m => ({entryId: m.entryId, prevRef: m.prevRef ? {...m.prevRef} : null}))}
});

/**
 * Re-runnable migration planner (0.39.0). From the public setting it takes the secret keys (mounted, announce, conditions) into the GM-only store
 * (an existing GM-only store wins) and turns the old short `log` into journal cards (ids `old-<n>`, so running it twice adds nothing).
 * Returns {changed, public, secret}; `public` has none of the old keys.
 */
export function planMigration(publicRaw, secretRaw) {
  const r = obj(publicRaw);
  const changed = SECRET_KEYS.some(k => k in r) || 'log' in r;
  const pub = normalizePublic(publicRaw);
  if ('log' in r) {
    const old = (Array.isArray(r.log) ? r.log : []).filter(e => e && ACTIONS[e.kind] && Number.isSafeInteger(e.day) && e.day >= 1)
      .map((e, i) => ({id: `old-${i + 1}`, day: e.day, kind: e.kind, text: '', by: null}));
    const have = new Set(pub.journal.map(e => e.id));
    pub.journal = [...old.filter(e => !have.has(e.id)), ...pub.journal].slice(-JOURNAL_MAX);
  }
  return {changed, public: pub, secret: normalizeSecret(hasSecret(secretRaw) ? secretRaw : r)};
}

export const totalActions = bonus => BASE_ACTIONS + whole(bonus, 0, 2);
export const actionsLeft = (state, bonus) => Math.max(0, totalActions(bonus) - state.used);
export const logLine = e => `Day ${e.day}: ${ACTIONS[e.kind]}`;

/** Spends one action and adds a journal card for it. Throws when none are left (the GM can start a New day, or adjudicate a bonus action at the table). */
export function spend(state, kind, bonus, {text = '', by = null, id = newEntryId(), cost = null, area = ''} = {}) {
  if (!ACTIONS[kind]) throw new Error(`Unknown action "${kind}". Use one of: ${Object.keys(ACTIONS).join(', ')}.`);
  const n = cost === null ? 1 : cost;
  if (!Number.isSafeInteger(n) || n < 0 || n > COST_MAX) throw new Error(`The cost is a whole number from 0 to ${COST_MAX}.`);
  if (actionsLeft(state, bonus) < n) throw new Error('No actions left today. Start a New day when the party has rested.');
  const entry = {id, day: state.day, kind, text: body(text), by: short(by, 60) || null, ...(cost === null ? {} : {cost: n}), ...(short(area, 80) ? {area: short(area, 80)} : {})};
  return {...state, used: state.used + n, journal: [...state.journal, entry].slice(-JOURNAL_MAX)};
}
/** Takes back the latest journal card from today and gives its action back. Throws when there is none. */
export function undo(state) {
  const last = state.journal.at(-1);
  const cost = last?.cost ?? 1;
  if (!last || last.day !== state.day || state.used < cost) throw new Error('Nothing to undo today.');
  const move = (state.moves ?? []).find(m => m.entryId === last.id);
  return {...state, used: state.used - cost, journal: state.journal.slice(0, -1),
    ...(move ? {areaRef: move.prevRef, moves: state.moves.filter(m => m !== move)} : {})};
}
/** A new day gives the actions back, adds one to the day and clears the DAILY conditions (all areas and per area) back to 0. Persistent conditions on Locations and Regions are untouched; the journal and waiting requests stay. */
export const newDay = state => ({...state, day: state.day + 1, used: 0, conditions: normalizeConditions(null), areaConditions: {}, moves: []});
/** Sets one DAILY condition (one of the six) to severity 0 to 3, for all areas (default) or for one area (`scope: 'area'` with `areaId`). */
export function setCondition(state, id, severity, {scope = 'all', areaId = ''} = {}) {
  if (!CONDITION_IDS.includes(id)) throw new Error(`Unknown condition "${id}". Use one of: ${CONDITION_IDS.join(', ')}.`);
  if (!Number.isSafeInteger(severity) || severity < 0 || severity > 3) throw new Error('Severity is a whole number from 0 to 3.');
  if (scope !== 'area') return {...state, conditions: {...state.conditions, [id]: severity}};
  if (!LOC_ID.test(areaId)) throw new Error('Choose a current area first.');
  const mine = {...(state.areaConditions?.[areaId] ?? {}), [id]: severity};
  if (!severity) delete mine[id];
  const all = {...(state.areaConditions ?? {})};
  if (Object.keys(mine).length) all[areaId] = mine; else delete all[areaId];
  return {...state, areaConditions: all};
}
/** One waiting request per user: a second one from the same user replaces the first. */
export function addRequest(state, user, action) {
  if (!ACTIONS[action]) throw new Error(`Unknown action "${action}". Use one of: ${Object.keys(ACTIONS).join(', ')}.`);
  if (!user?.id || user.isGM) throw new Error('Only players can ask for an action.');
  if (state.used >= state.total) throw new Error('No actions left today.');
  const others = state.requests.filter(q => q.userId !== user.id);
  return {...state, requests: [...others, {userId: user.id, name: short(user.name, 60), action}].slice(-REQUESTS_MAX)};
}
export function takeRequest(state, userId) {
  const request = state.requests.find(q => q.userId === userId);
  if (!request) throw new Error('That request is no longer waiting.');
  return {request, state: {...state, requests: state.requests.filter(q => q.userId !== userId)}};
}
export function editEntry(state, id, text) {
  if (!state.journal.some(e => e.id === id)) throw new Error('That journal entry is gone.');
  return {...state, journal: state.journal.map(e => e.id === id ? {...e, text: body(text)} : e)};
}
export function deleteEntry(state, id) {
  if (!state.journal.some(e => e.id === id)) throw new Error('That journal entry is gone.');
  return {...state, journal: state.journal.filter(e => e.id !== id)};
}
export const clearJournal = state => ({...state, journal: [], moves: []});

/**
 * Party sources for the table: every Ashen Gate ITEM-* / PERK-* on a party character (player-owned `character` Actor) that carries travel modifiers.
 * Equipment counts while equipped. When Character Hub exposes a character's mount (api.companions), the items assigned to that mount count only
 * while the Mounted switch is on; without the Hub every item is simply "on the character".
 * deps.mountItems?(actor) -> Set of Item ids on that character's mount (or null when unknown).
 */
export function collectSources(actors, {mountItems = null} = {}) {
  const out = [];
  for (const actor of actors ?? []) {
    let mount = null;
    try { mount = mountItems ? mountItems(actor) : null; } catch { mount = null; }
    const seen = new Set();
    for (const item of [...(actor?.items ?? [])]) {
      const src = item?.flags?.['ashen-gate-manager']?.source, id = src?.sourceId;
      if (typeof id !== 'string' || !/^(ITEM|PERK)-/.test(id) || seen.has(id)) continue;
      const modifiers = blockModifiers(src.definition);
      if (!modifiers.length) continue;
      seen.add(id);
      const onMount = mount instanceof Set && mount.has(item.id);
      out.push({sourceId: id, name: item.name ?? id, character: actor.name ?? '', modifiers, mountItem: onMount,
        inactive: !onMount && id.startsWith('ITEM-') && item.type === 'equipment' && item.system?.equipped !== true ? 'not equipped' : null});
    }
  }
  return out;
}

/**
 * The partyModifiers() shape: the combined party rows, plus for each of the six conditions its severity today, the party's
 * mitigation (the condition.mitigation total, capped at 3) and the steps remaining = max(0, severity - mitigation). Condition rows carry the same three numbers.
 */
export function withConditions(mods, conditions) {
  const sev = normalizeConditions(conditions);
  const mitigation = id => mods.rows.find(r => r.target === 'condition.mitigation' && r.condition === id)?.total ?? 0;
  for (const r of mods.rows) if (r.condition) Object.assign(r, {severity: sev[r.condition] ?? 0, remaining: stepsRemaining(sev[r.condition], r.total)});
  const list = OVERLAND_CONDITIONS.map(c => ({id: c.id, label: c.label, kind: c.kind, hits: c.hits, guidance: c.guidance,
    severity: sev[c.id], mitigation: mitigation(c.id), remaining: stepsRemaining(sev[c.id], mitigation(c.id))}));
  return {contract: OVERLAND_CONTRACT, scope: MODIFIER_SCOPE, ...mods, ladder: [...SCOUT_LADDER], conditions: list};
}

/** The name players may read for an area: a Revealed place by name, an Unidentified one by its label, a Hidden one not at all. */
export function publicAreaName(loc) {
  if (!loc) return '';
  if (loc.state === 'revealed') return short(loc.name, 80);
  return loc.state === 'unidentified' ? short(loc.unidentifiedLabel, 80) || DEFAULT_UNIDENTIFIED_LABEL : 'Unknown area';
}
/** The destination terrain a Location's free-text type names ("Forest", "Marsh", ...), or ''. */
export const terrainOfLocation = loc => TERRAIN_BY_TYPE[String(loc?.type ?? '').trim().toLowerCase()] ?? '';
const SHORTCUT_MAX = 12;
/** Buttons that open the area's own Beasts, Hazards, Roll Tables and gathering entries. They only open things; nothing is rolled or awarded. */
export function areaShortcuts(loc) {
  if (!loc) return [];
  const out = [];
  for (const b of loc.beasts ?? []) out.push({kind: 'beast', label: b.label || 'Beast', uuid: b.uuid || '', locationId: loc.id});
  for (const h of loc.hazards ?? []) out.push({kind: 'hazard', label: h.name || 'Hazard', uuid: h.tableUuid || '', locationId: loc.id});
  for (const t of loc.rollTables ?? []) out.push({kind: 'table', label: t.name || 'Roll table', uuid: t.uuid || '', locationId: loc.id});
  for (const r of loc.resources ?? []) out.push({kind: 'resource', label: r.label || r.nodeId || 'Gathering spot', uuid: r.uuid || '', locationId: loc.id});
  return out.slice(0, SHORTCUT_MAX);
}

/**
 * deps: {isGM(), playerTravel() -> is Travel for players on?, read() -> the public setting, write(object) -> Promise,
 *        readSecret() -> the GM-only object (GM clients only), writeSecret(object) -> Promise, actors() -> party character Actors, mountItems?(actor),
 *        announce?(text), sendDeclare?(action) -> Promise (a player's client asks the primary GM's client), id?(),
 *        locations?() -> the GM's normalized Location records (GM clients only; 0.40.0: areas, persistent conditions, shortcuts)}.
 * Players may only publicState() and declare(), and only while Travel for players is on; everything else is GM only. The checks live here, not in the tab.
 */
export function createOverland(deps) {
  const gm = () => deps.isGM() === true;
  const enabled = () => deps.playerTravel?.() === true;
  const requireGM = () => { if (!gm()) throw new Error('Only the GM can use Travel.'); };
  const requireView = () => { if (!gm() && !enabled()) throw new Error('Travel is not open to players. Ask your GM to turn on Travel for players.'); };
  let queue = Promise.resolve();
  const serial = fn => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };
  const stored = () => joinState(deps.read(), deps.readSecret());
  const locs = () => { try { return gm() ? deps.locations?.() ?? [] : []; } catch { return []; } };
  const kindOf = l => (l.isRegion ? 'region' : 'location');
  const refOf = l => ({id: l.id, name: l.name, kind: kindOf(l)});
  /** An area reference from a request: a LOC id -> {id, name, kind}; 'other' -> the "Other area" marker; empty -> null. */
  const resolveArea = (v, {allowOther = false} = {}) => {
    if (v === undefined || v === null || v === '') return null;
    if (v === 'other') { if (!allowOther) throw new Error('Choose a Location or Region for the current area.'); return {id: '', name: 'Other area', kind: 'other'}; }
    const l = locs().find(x => x.id === v);
    if (!l) throw new Error('That area is not one of your Locations or Regions.');
    return refOf(l);
  };
  /** The party's current area: the one chosen or last used, else the Location marked "the party is here" (the Active switch). */
  const currentArea = state => {
    const all = locs(), chosen = state.areaRef && all.find(l => l.id === state.areaRef.id && !l.archived);
    if (chosen) return {...refOf(chosen), source: 'chosen'};
    const marker = all.find(l => l.active === true && !l.archived);
    return marker ? {...refOf(marker), source: 'marker'} : null;
  };
  const dailyFor = (state, areaId) => mergeSeverities(state.conditions, state.areaConditions?.[areaId]);
  const hereOf = (state, area) => {
    const persist = area?.id ? effectiveLocationConditions(area.id, locs()) : {severities: normalizeConditions(null), sources: Object.fromEntries(CONDITION_IDS.map(id => [id, null]))};
    const daily = area?.id ? dailyFor(state, area.id) : normalizeConditions(state.conditions);
    return {persistent: persist.severities, sources: persist.sources, daily, effective: mergeSeverities(persist.severities, daily)};
  };
  const party = state => combine(collectSources(deps.actors(), {mountItems: deps.mountItems}), {mounted: state.mounted});
  const publicView = state => ({contract: OVERLAND_CONTRACT, enabled: enabled(), day: state.day, total: state.total, used: state.used, left: Math.max(0, state.total - state.used),
    area: state.area ?? '',
    requests: state.requests.map(q => ({userId: q.userId, name: q.name, action: q.action})),
    journal: state.journal.map(e => ({...e}))});
  const gmView = (state, mods) => { const area = currentArea(state); return ({contract: OVERLAND_CONTRACT, enabled: enabled(), day: state.day, used: state.used, base: BASE_ACTIONS, bonus: mods.bonus.actions,
    total: totalActions(mods.bonus.actions), left: actionsLeft(state, mods.bonus.actions), mounted: state.mounted, announce: state.announce, conditions: {...state.conditions},
    requests: state.requests.map(q => ({...q})), journal: state.journal.map(e => ({...e})),
    log: state.journal.slice(-20).map(e => ({kind: e.kind, day: e.day, text: logLine(e)})),
    area, areaConditions: structuredClone(state.areaConditions ?? {}), here: hereOf(state, area)}); };
  /** Writes what changed: the GM-only store first, then the public setting (with the live total of actions). */
  const commit = async next => {
    const mods = party(next), area = next.areaRef ? locs().find(l => l.id === next.areaRef.id) : null;
    const state = {...next, total: totalActions(mods.bonus.actions), area: publicAreaName(area)}, parts = splitState(state);
    const rawSecret = deps.readSecret();
    if (!same(rawSecret, parts.secret)) await deps.writeSecret(parts.secret);
    if (!same(deps.read(), parts.public)) await deps.write(parts.public);
    return {state, mods};
  };
  const edit = async change => {
    requireGM();
    return serial(async () => { const done = await commit(change(stored())); return gmView(done.state, done.mods); });
  };
  const speak = async (kind, {state, mods}, cost = 1) => {
    if (state.announce && deps.announce) await deps.announce(`${ACTIONS[kind]}: the party uses ${cost === 1 ? 'a travel action' : `${cost} travel actions`} (${actionsLeft(state, mods.bonus.actions)} left today).`);
  };
  /** The calculator's input for one request, from the stored state. Throws for an unknown action or area. */
  const buildPreview = (state, mods, req = {}) => {
    const r = obj(req);
    if (!ACTIONS[r.action]) throw new Error(`Unknown action "${r.action}". Use one of: ${Object.keys(ACTIONS).join(', ')}.`);
    const area = r.area === undefined ? currentArea(state) : resolveArea(r.area);
    const destination = r.action === 'travel' ? resolveArea(r.destination, {allowOther: true}) : null;
    const all = locs(), destLoc = destination?.id ? all.find(l => l.id === destination.id) : null, areaLoc = area?.id ? all.find(l => l.id === area.id) : null;
    const here = hereOf(state, area), there = destination ? hereOf(state, destination.id ? destination : null) : here;
    // Travel: Difficult Terrain is the destination's; everything else is where the party stands.
    const severities = r.action === 'travel' && destination ? {...here.effective, 'hard-ground': there.effective['hard-ground']} : here.effective;
    const terrain = TERRAINS.includes(r.terrain) ? r.terrain : terrainOfLocation(destLoc);
    const left = actionsLeft(state, mods.bonus.actions);
    const calc = calculateAction({action: r.action, area, destination, severities, party: mods, left, terrain, override: cleanOverride(r.override)});
    return {contract: OVERLAND_CONTRACT, ...calc, day: state.day, total: totalActions(mods.bonus.actions), left, terrain,
      shortcuts: areaShortcuts(r.action === 'travel' ? destLoc ?? areaLoc : areaLoc), requestUserId: typeof r.requestUserId === 'string' ? r.requestUserId : null};
  };
  const api = {
    /** GM: {contract, enabled, day, used, base, bonus, total, left, mounted, announce, conditions, requests, journal, log}. */
    state() { requireGM(); const s = stored(); return gmView(s, party(s)); },
    /** A player (only while Travel for players is on) or the GM: {contract, enabled, day, total, used, left, requests: [{userId, name, action}], journal: [{id, day, kind, text, by}]}. The PUBLIC part only. */
    publicState() { requireView(); return publicView(normalizePublic(deps.read())); },
    /** GM: {contract, scope, mounted, bonus, ladder, conditions, rows}. */
    partyModifiers() { requireGM(); const s = stored(); return withConditions(structuredClone(party(s)), s.conditions); },
    /** A player (only while Travel for players is on): asks the GM for an action. One waiting request per user. Resolves {contract, requested: true, action}. */
    async declare(action) {
      if (gm()) throw new Error('The GM uses the Travel, Scout and Explore buttons directly.');
      requireView();
      if (!ACTIONS[action]) throw new Error(`Unknown action "${action}". Use one of: ${Object.keys(ACTIONS).join(', ')}.`);
      const pub = normalizePublic(deps.read());
      if (pub.used >= pub.total) throw new Error('No actions left today.');
      if (!deps.sendDeclare) throw new Error('Travel is unavailable.');
      await deps.sendDeclare(action);
      return {contract: OVERLAND_CONTRACT, requested: true, action};
    },
    /** The primary GM's client, for a player's request (the socket handler has already matched the sender): the same rules again. */
    async receiveDeclare(user, action) {
      requireGM();
      if (!enabled()) throw new Error('Travel is not open to players.');
      return serial(async () => { await commit(addRequest(stored(), user, action)); return {requested: true}; });
    },
    /** GM: spends one action and adds a journal card with the optional text. */
    async act(kind, {text = ''} = {}) {
      requireGM();
      return serial(async () => {
        const s = stored(), done = await commit(spend(s, kind, party(s).bonus.actions, {text, id: deps.id?.()}));
        await speak(kind, done);
        return gmView(done.state, done.mods);
      });
    },
    /** GM: carries out a waiting request (spends one action, adds a card that names who asked). */
    async resolve(userId, {text = ''} = {}) {
      requireGM();
      return serial(async () => {
        const s = stored(), taken = takeRequest(s, userId);
        const done = await commit(spend(taken.state, taken.request.action, party(s).bonus.actions, {text, by: taken.request.name, id: deps.id?.()}));
        await speak(taken.request.action, done);
        return gmView(done.state, done.mods);
      });
    },
    /** GM: the calculator's answer for one action, from the stored state. Reads only; nothing is spent. */
    previewAction(req) { requireGM(); const s = stored(); return buildPreview(s, party(s), req); },
    /**
     * GM: carries out an action in ONE step: spends the calculated cost (or the GM's adjusted `cost`, 0 to 5), adds the journal card (action, area name, cost;
     * nothing secret), clears the waiting request `requestUserId`, and for Travel moves the party's current area to the destination actually reached (`reached`, default the destination).
     */
    async resolveAction(req = {}) {
      requireGM();
      return serial(async () => {
        const s = stored(), mods = party(s), pv = buildPreview(s, mods, req), r = obj(req);
        const cost = r.cost === undefined || r.cost === null ? pv.cost : r.cost;
        if (!Number.isSafeInteger(cost) || cost < 0 || cost > COST_MAX) throw new Error(`The cost is a whole number from 0 to ${COST_MAX}.`);
        if (actionsLeft(s, mods.bonus.actions) < cost) throw new Error(pv.blocked?.reason ?? 'No actions left today. Start a New day when the party has rested.');
        const taken = typeof r.requestUserId === 'string' && r.requestUserId ? takeRequest(s, r.requestUserId) : {request: null, state: s};
        const all = locs();
        let areaRef = s.areaRef, here = pv.area?.id ? all.find(l => l.id === pv.area.id) : null;
        if (pv.action === 'travel') {
          const reachedRef = resolveArea(r.reached === undefined ? r.destination : r.reached, {allowOther: true});
          here = reachedRef?.id ? all.find(l => l.id === reachedRef.id) : null;
          areaRef = reachedRef?.id ? {id: reachedRef.id, name: reachedRef.name} : areaRef;
        } else if (pv.area?.id) areaRef = {id: pv.area.id, name: pv.area.name};
        const moved = JSON.stringify(areaRef) !== JSON.stringify(s.areaRef);
        const id = deps.id?.() ?? newEntryId(), areaName = publicAreaName(here);
        let next = spend(taken.state, pv.action, mods.bonus.actions, {text: r.text, by: taken.request?.name ?? null, id, cost, area: areaName});
        if (moved) next = {...next, areaRef, moves: [...(next.moves ?? []), {entryId: id, prevRef: s.areaRef}].slice(-MOVES_MAX)};
        const done = await commit(next);
        await speak(pv.action, done, cost);
        const entry = done.state.journal.at(-1);
        return {contract: OVERLAND_CONTRACT, action: pv.action, cost, area: areaName, summary: [ACTION_LABEL[pv.action], areaName, `${cost} ${cost === 1 ? 'action' : 'actions'}`].filter(Boolean).join(' \u00b7 '),
          entry: {...entry}, preview: pv, state: gmView(done.state, done.mods)};
      });
    },
    /** GM: the Locations and Regions the party can be in, for the area pickers: [{id, name, kind, parent, active}]. */
    areas() { requireGM(); const all = locs().filter(l => !l.archived); return all.map(l => ({...refOf(l), parent: all.find(p => p.id === l.parentLocationId)?.name ?? '', active: l.active === true, type: l.type ?? ''})).sort((a, b) => a.name.localeCompare(b.name)); },
    /** GM: sets the party's current area (a Location or Region id, or null). */
    setArea: ref => edit(s => { const a = resolveArea(ref); return {...s, areaRef: a ? {id: a.id, name: a.name} : null}; }),
    dismiss: userId => edit(s => takeRequest(s, userId).state),
    undo: () => edit(undo),
    newDay: () => edit(newDay),
    setMounted: value => edit(s => ({...s, mounted: value === true})),
    /** GM: a DAILY condition, for all areas (default) or `{scope: 'area'}` for the current area. */
    setCondition: (id, severity, opts = {}) => edit(s => setCondition(s, id, severity, {scope: opts?.scope === 'area' ? 'area' : 'all', areaId: opts?.scope === 'area' ? currentArea(s)?.id ?? '' : ''})),
    setAnnounce: value => edit(s => ({...s, announce: value === true})),
    editEntry: (id, text) => edit(s => editEntry(s, id, text)),
    deleteEntry: id => edit(s => deleteEntry(s, id)),
    clearJournal: () => edit(clearJournal),
    /** GM, safe to run again: moves the old secret keys out of the public setting, turns the old log into journal cards and refreshes the public total. Resolves {moved, journal}. */
    async migrate() {
      requireGM();
      return serial(async () => {
        const plan = planMigration(deps.read(), deps.readSecret()), next = {...plan.public, ...plan.secret};
        const before = stored();
        if (!plan.changed) {
          if (before.total !== totalActions(party(before).bonus.actions)) await commit(before);
          return {moved: false, journal: before.journal.length};
        }
        await commit(next);
        return {moved: true, journal: next.journal.length};
      });
    }
  };
  return Object.freeze(api);
}

let current = null;
/** The window's handle on the service (main.mjs sets it on ready). Not part of the public api. */
export const useOverland = service => { current = service; };
export const overland = () => current;
