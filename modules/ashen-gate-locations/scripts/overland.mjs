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
import {CONDITION_IDS, OVERLAND_CONDITIONS, normalizeConditions, stepsRemaining} from './overland-conditions.mjs';
import {blockModifiers, combine, SCOUT_LADDER, MODIFIER_SCOPE} from './travel-modifiers.mjs';

export const OVERLAND_CONTRACT = 'ag-overland/1';
export const BASE_ACTIONS = 3;
export const JOURNAL_MAX = 400;
export const TEXT_MAX = 2000;
export const REQUESTS_MAX = 12;
export const ACTIONS = Object.freeze({travel: 'Travel', scout: 'Scout', explore: 'Explore'});
/** The keys that used to live in the public setting and are now GM only. */
export const SECRET_KEYS = Object.freeze(['mounted', 'announce', 'conditions']);
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
    .map(e => ({id: e.id, day: e.day, kind: e.kind, text: body(e.text), by: short(e.by, 60) || null})).slice(-JOURNAL_MAX);
  return {day: whole(r.day, 1, 99999), used: whole(r.used, 0, 99), total: whole(r.total, BASE_ACTIONS, BASE_ACTIONS + 2), requests, journal};
}
/** The SECRET part: {mounted, announce, conditions: {id: 0..3}}. */
export function normalizeSecret(raw) {
  const r = obj(raw);
  return {mounted: r.mounted === true, announce: r.announce === true, conditions: normalizeConditions(r.conditions)};
}
const hasSecret = raw => Object.keys(obj(raw)).length > 0;
/** The whole working state: the public setting plus the GM-only store. A world not yet migrated still has the secret keys in the public setting; they are read from there until planMigration moves them. */
export function joinState(publicRaw, secretRaw) {
  return {...normalizePublic(publicRaw), ...normalizeSecret(hasSecret(secretRaw) ? secretRaw : publicRaw)};
}
export const splitState = state => ({
  public: {day: state.day, used: state.used, total: state.total, requests: state.requests.map(q => ({...q})), journal: state.journal.map(e => ({...e}))},
  secret: {mounted: state.mounted, announce: state.announce, conditions: {...state.conditions}}
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
export function spend(state, kind, bonus, {text = '', by = null, id = newEntryId()} = {}) {
  if (!ACTIONS[kind]) throw new Error(`Unknown action "${kind}". Use one of: ${Object.keys(ACTIONS).join(', ')}.`);
  if (!actionsLeft(state, bonus)) throw new Error('No actions left today. Start a New day when the party has rested.');
  return {...state, used: state.used + 1, journal: [...state.journal, {id, day: state.day, kind, text: body(text), by: short(by, 60) || null}].slice(-JOURNAL_MAX)};
}
/** Takes back the latest journal card from today and gives its action back. Throws when there is none. */
export function undo(state) {
  const last = state.journal.at(-1);
  if (!last || last.day !== state.day || state.used < 1) throw new Error('Nothing to undo today.');
  return {...state, used: state.used - 1, journal: state.journal.slice(0, -1)};
}
/** A new day gives the actions back, adds one to the day and clears every condition back to 0 (the journal and waiting requests stay). */
export const newDay = state => ({...state, day: state.day + 1, used: 0, conditions: normalizeConditions(null)});
/** Sets one condition (one of the six) to severity 0 to 3. */
export function setCondition(state, id, severity) {
  if (!CONDITION_IDS.includes(id)) throw new Error(`Unknown condition "${id}". Use one of: ${CONDITION_IDS.join(', ')}.`);
  if (!Number.isSafeInteger(severity) || severity < 0 || severity > 3) throw new Error('Severity is a whole number from 0 to 3.');
  return {...state, conditions: {...state.conditions, [id]: severity}};
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
export const clearJournal = state => ({...state, journal: []});

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

/**
 * deps: {isGM(), playerTravel() -> is Travel for players on?, read() -> the public setting, write(object) -> Promise,
 *        readSecret() -> the GM-only object (GM clients only), writeSecret(object) -> Promise, actors() -> party character Actors, mountItems?(actor),
 *        announce?(text), sendDeclare?(action) -> Promise (a player's client asks the primary GM's client), id?()}.
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
  const party = state => combine(collectSources(deps.actors(), {mountItems: deps.mountItems}), {mounted: state.mounted});
  const publicView = state => ({contract: OVERLAND_CONTRACT, enabled: enabled(), day: state.day, total: state.total, used: state.used, left: Math.max(0, state.total - state.used),
    requests: state.requests.map(q => ({userId: q.userId, name: q.name, action: q.action})),
    journal: state.journal.map(e => ({id: e.id, day: e.day, kind: e.kind, text: e.text, by: e.by}))});
  const gmView = (state, mods) => ({contract: OVERLAND_CONTRACT, enabled: enabled(), day: state.day, used: state.used, base: BASE_ACTIONS, bonus: mods.bonus.actions,
    total: totalActions(mods.bonus.actions), left: actionsLeft(state, mods.bonus.actions), mounted: state.mounted, announce: state.announce, conditions: {...state.conditions},
    requests: state.requests.map(q => ({...q})), journal: state.journal.map(e => ({...e})),
    log: state.journal.slice(-20).map(e => ({kind: e.kind, day: e.day, text: logLine(e)}))});
  /** Writes what changed: the GM-only store first, then the public setting (with the live total of actions). */
  const commit = async next => {
    const mods = party(next), state = {...next, total: totalActions(mods.bonus.actions)}, parts = splitState(state);
    const rawSecret = deps.readSecret();
    if (!same(rawSecret, parts.secret)) await deps.writeSecret(parts.secret);
    if (!same(deps.read(), parts.public)) await deps.write(parts.public);
    return {state, mods};
  };
  const edit = async change => {
    requireGM();
    return serial(async () => { const done = await commit(change(stored())); return gmView(done.state, done.mods); });
  };
  const speak = async (kind, {state, mods}) => {
    if (state.announce && deps.announce) await deps.announce(`${ACTIONS[kind]}: the party uses a travel action (${actionsLeft(state, mods.bonus.actions)} left today).`);
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
    dismiss: userId => edit(s => takeRequest(s, userId).state),
    undo: () => edit(undo),
    newDay: () => edit(newDay),
    setMounted: value => edit(s => ({...s, mounted: value === true})),
    setCondition: (id, severity) => edit(s => setCondition(s, id, severity)),
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
