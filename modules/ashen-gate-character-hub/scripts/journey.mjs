/**
 * Journey (0.20.0, alpha): a per-character log of accomplishments, newest first. Owned by the Hub.
 *
 * Where it lives:
 *   - Visible entries: flags['ashen-gate-character-hub'].journey on the character Actor ({v, entries, seen}).
 *   - Hidden entries: a GM-only JournalEntry the Hub keeps (ownership NONE for everyone else), flag journeyHidden =
 *     {actorId: [entries]}. A player owns their Actor and so receives everything on it; hidden entries are kept off it
 *     (the same reason Renown keeps its internal state in GM-only journals). Hiding moves an entry there, showing moves
 *     it back.
 *   - `seen` holds what the recorders last saw (level, Renown ranks, quest statuses are in a world setting), so a
 *     change is recorded once and nothing before 0.20.0 is back-filled.
 *
 * Automatic entries come only from existing events and public APIs (no new rules): level-ups (dnd5e
 * system.details.level), Renown tier changes (Renown's public getFactions()/getPantheon() as the player sees them) and
 * quests completed (Quest Log's GM API listQuests()/getGMState()). Each has a stable id per event, so a re-fire never
 * duplicates. Quest rewards (items and coins) come only through recordReward() (GM API, called by Quest Log when it
 * grants; 0.25.0 added items and grantId). Nothing else records currency. 0.31.0: the first bind of a Cinder (Cinders'
 * ashenGateCinder.changed hook, kind 'bind'), once per character and Cinder instance.
 * Permissions are checked here: players read only their own characters' visible entries and can't add, edit, hide or
 * delete anything; the recorders only append new automatic entries.
 */
import {MODULE_ID} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {isBackup} from './level-backup.mjs';

export const JOURNEY_FLAG = 'journey';
export const JOURNEY_CAP = 300;
export const TEXT_MAX = 500;
export const TYPES = {level: 'Level up', renown: 'Renown', quest: 'Quest', reward: 'Reward', cinder: 'Cinder', manual: 'Note'};
const AUTO_TYPES = new Set(['level', 'renown', 'quest', 'reward', 'cinder']);
const HIDDEN_FLAG = 'journeyHidden', STORE_FLAG = 'journeyStore', QUEST_SEEN = 'journeyQuestSeen';
const refuse = error => ({ok: false, error});
const isGM = (user = globalThis.game?.user) => user?.isGM === true;
const now = () => Date.now();

// ---------- Stored data ----------

const cleanEntry = e => {
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id || !TYPES[e.type]) return null;
  const at = Number(e.at), date = typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null;
  return {id: e.id, type: e.type, text: String(e.text ?? '').slice(0, TEXT_MAX), at: Number.isFinite(at) ? at : 0, date, manual: e.type === 'manual',
    ...(e.data && typeof e.data === 'object' ? {data: structuredClone(e.data)} : {})};
};
const sortNewest = list => list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.at - a.at);
/** The Actor's journey record, cleaned. */
export function readJourney(actor) {
  const raw = actor?.flags?.[MODULE_ID]?.[JOURNEY_FLAG] ?? {};
  const entries = (Array.isArray(raw.entries) ? raw.entries : []).map(cleanEntry).filter(Boolean);
  return {v: 1, entries, seen: raw.seen && typeof raw.seen === 'object' ? structuredClone(raw.seen) : {}};
}
const writeJourney = (actor, j) => actor.update({[`flags.${MODULE_ID}.${JOURNEY_FLAG}`]: {v: 1, entries: sortNewest(j.entries.map(cleanEntry).filter(Boolean)).slice(0, JOURNEY_CAP), seen: j.seen ?? {}}});

/** The GM-only store (a JournalEntry nobody else can see). GM clients only; created on first use. */
export function hiddenStore() { return [...(globalThis.game?.journal ?? [])].find(j => j?.flags?.[MODULE_ID]?.[STORE_FLAG] === true) ?? null; }
async function ensureHiddenStore() {
  const found = hiddenStore(); if (found) return found;
  const JE = globalThis.JournalEntry;
  return JE.create({name: 'Ashen Gate Hub • Journey (GM only)', ownership: {default: 0}, flags: {[MODULE_ID]: {[STORE_FLAG]: true, [HIDDEN_FLAG]: {}}}});
}
const hiddenFor = actorId => (hiddenStore()?.flags?.[MODULE_ID]?.[HIDDEN_FLAG]?.[actorId] ?? []).map(cleanEntry).filter(Boolean);
async function writeHidden(actorId, list) {
  const store = await ensureHiddenStore();
  return store.update({[`flags.${MODULE_ID}.${HIDDEN_FLAG}.${actorId}`]: sortNewest(list.map(cleanEntry).filter(Boolean)).slice(0, JOURNEY_CAP)});
}

/** May this user read this character's journey? The GM, or an owner (a player's own character). */
export const canRead = (actor, user = globalThis.game?.user) => !!actor && (isGM(user) || actor.testUserPermission?.(user, 'OWNER') === true);

/**
 * The entries this user may see, newest first. Players get only their own character's visible entries; the GM also
 * gets the hidden ones (marked hidden: true).
 */
export function journeyFor(actor, user = globalThis.game?.user) {
  if (!canRead(actor, user)) return [];
  const visible = readJourney(actor).entries.map(e => ({...e, hidden: false}));
  const hidden = isGM(user) ? hiddenFor(actor.id).map(e => ({...e, hidden: true})) : [];
  return sortNewest([...visible, ...hidden]);
}

// ---------- Automatic entries (append only) ----------

/**
 * Adds automatic entries that are not there yet (by id) and saves `seen`. Used by the recorders; works for the GM
 * and for the character's owner (their own Actor). Never changes or removes an existing entry.
 */
export async function appendAuto(actor, entries, seenPatch = null, user = globalThis.game?.user) {
  if (!canEdit(actor, user)) return refuse(`You don't own ${actor?.name ?? 'this character'}.`);
  const j = readJourney(actor), have = new Set([...j.entries.map(e => e.id), ...(isGM(user) ? hiddenFor(actor.id).map(e => e.id) : [])]);
  const fresh = entries.map(cleanEntry).filter(e => e && AUTO_TYPES.has(e.type) && !have.has(e.id));
  const seen = seenPatch ? {...j.seen, ...seenPatch} : j.seen;
  if (!fresh.length && JSON.stringify(seen) === JSON.stringify(j.seen)) return {ok: true, result: []};
  await writeJourney(actor, {entries: [...fresh, ...j.entries], seen});
  return {ok: true, result: fresh.map(e => e.id)};
}

/** Level-ups from dnd5e's character level. First sight only remembers the level (no back-fill). */
export function levelEntries(actor, j = readJourney(actor)) {
  const level = Number(actor?.system?.details?.level) || 0, last = Number(j.seen.level);
  if (!Number.isFinite(last) || !('level' in j.seen)) return {entries: [], seen: {level}};
  // One time for the whole batch: entries that tie keep this order (highest level first), so a clock tick between
  // two entries can never reorder them.
  const entries = [], at = now();
  const classes = Object.values(actor.classes ?? {}).map(c => `${c.name} ${Number(c.system?.levels) || 0}`).join(' / ');
  for (let l = level; l > last; l--) entries.push({id: `level-${l}`, type: 'level', text: `Reached level ${l}${l === level && classes ? ` (${classes})` : ''}`, at, data: {level: l}});
  return {entries, seen: {level}};
}

const rankAt = (milestones, score) => [...(milestones ?? [])].filter(m => Number(score) >= Number(m.threshold)).pop() ?? null;
/**
 * Renown tier changes from Renown's own public read API (what this user is allowed to see): this character's personal
 * rank and the party's rank with each faction, and its standing with each deity (getPantheon). The entry id is
 * tied to the rank reached plus the last history event, so a re-fire doesn't duplicate.
 */
export function renownEntries(actor, api, j = readJourney(actor)) {
  const seenR = j.seen.renown && typeof j.seen.renown === 'object' ? {...j.seen.renown} : null, next = {}, entries = [], at = now();
  let factions = [], deities = [];
  try { factions = api?.getFactions?.() ?? []; } catch { factions = []; }
  try { deities = typeof api?.getPantheon === 'function' ? api.getPantheon(actor) ?? [] : []; } catch { deities = []; }
  const note = (key, rank, text, lastEvent) => {
    next[key] = rank;
    if (seenR && key in seenR && seenR[key] !== rank && rank) entries.push({id: `renown-${key}-${rank}-${lastEvent ?? 'x'}`.replace(/[^A-Za-z0-9:_-]/g, ''), type: 'renown', text, at, data: {key, from: seenR[key], to: rank}});
  };
  for (const f of factions) {
    const mine = f.personal?.[actor.id];
    if (mine && Array.isArray(f.individualTrack?.milestones)) {
      const r = rankAt(f.individualTrack.milestones, mine.score);
      if (r) note(`${f.id}:me`, r.id ?? r.name, `Reached ${r.name} with ${f.name}`, mine.history?.at?.(-1)?.id);
    }
    if (f.group && Array.isArray(f.groupTrack?.milestones)) {
      const r = rankAt(f.groupTrack.milestones, f.group.score);
      if (r) note(`${f.id}:party`, r.id ?? r.name, `The party reached ${r.name} with ${f.name}`, f.group.history?.at?.(-1)?.id);
    }
  }
  for (const d of deities) if (d?.id && d.rank) note(`${d.id}:deity`, d.rank, `Reached ${d.rank} with ${d.name ?? 'a deity'}`, d.score);
  return {entries, seen: {renown: {...(seenR ?? {}), ...next}}};
}

/**
 * Quests completed, from Quest Log's GM API. `seen` is the statuses last seen (a world setting); null means first
 * look (remember only). Returns [{actorIds, entry}] for each quest that newly became Completed.
 */
export function questCompletions(api, seen, partyActorIds) {
  let quests = [];
  try { quests = api?.listQuests?.() ?? []; } catch { return {done: [], seen: seen ?? {}}; }
  const next = Object.fromEntries(quests.map(q => [q.id, q.status]));
  if (!seen) return {done: [], seen: next};
  const done = [], at = now();
  for (const q of quests) {
    if (q.status !== 'Completed' || seen[q.id] === 'Completed') continue;
    let state = null;
    try { state = api.getGMState?.(q.id) ?? null; } catch { state = null; }
    const actorIds = state?.scope === 'individual' && state.actorId ? [state.actorId] : partyActorIds;
    done.push({actorIds, entry: {id: `quest-${q.id}`, type: 'quest', text: `Completed ${q.kind && q.kind !== 'quest' ? `${q.kind} ` : ''}"${q.name}"`, at, data: {questId: q.id}}});
  }
  return {done, seen: next};
}

export const REWARD_ITEMS_MAX = 50;
export const REWARD_NAME_MAX = 120;
const ITEM_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/, GRANT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
/** A reward's item list, cleaned: at most 50 of {name, img, quantity, itemId}; anything else is dropped. */
export function cleanRewardItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const i of items) {
    if (out.length >= REWARD_ITEMS_MAX) break;
    const name = typeof i?.name === 'string' ? i.name.trim().slice(0, REWARD_NAME_MAX) : '';
    if (!name) continue;
    const q = i.quantity === undefined || i.quantity === null ? 1 : Number(i.quantity);
    out.push({name, img: typeof i.img === 'string' && i.img ? i.img : null, quantity: Number.isInteger(q) && q >= 1 ? q : 1,
      itemId: typeof i.itemId === 'string' && ITEM_ID_RE.test(i.itemId) ? i.itemId : null});
  }
  return out;
}

/**
 * GM only: record what a quest awarded a character (items and coins), for Quest Log's grants. One entry per questId,
 * or per questId + grantId when a grantId is given (a later grant or Grant again gets its own entry); re-firing the
 * same grant adds nothing. Older callers (no items, no grantId) get the same entry id and text as before 0.25.0.
 */
export async function recordReward(actor, {questId, questName = '', coins = null, text = '', items = null, grantId = null} = {}) {
  if (!isGM()) return refuse('Only the GM can record quest rewards.');
  if (!questId) return refuse('A reward needs the quest it came from.');
  if (grantId !== null && grantId !== undefined && grantId !== '' && !(typeof grantId === 'string' && GRANT_ID_RE.test(grantId))) return refuse('A grant id uses letters, digits, - and _ (up to 40).');
  const grant = grantId || null, list = cleanRewardItems(items);
  const parts = [...list.map(i => i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name),
    ...(coins && typeof coins === 'object' ? Object.entries(coins).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${Number(n)} ${k}`) : [])];
  const body = text || `Reward${questName ? ` for "${questName}"` : ''}: ${parts.join(', ') || 'recorded'}`;
  return appendAuto(actor, [{id: grant ? `reward-${questId}-${grant}` : `reward-${questId}`, type: 'reward', text: body, at: now(),
    data: {questId, grantId: grant, coins: coins ?? null, items: list}}]);
}

// ---------- GM edits (manual entries, edit, hide, show, delete) ----------

const gmOnly = what => isGM() ? null : refuse(`Only the GM can ${what}.`);
const cleanDate = d => d === undefined || d === null || d === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : undefined;
const newId = () => `manual-${globalThis.foundry?.utils?.randomID?.(12) ?? Math.random().toString(36).slice(2, 14)}`;

export async function addManual(actor, {text, date = null, hidden = false} = {}) {
  const blocked = gmOnly('add Journey entries'); if (blocked) return blocked;
  const t = String(text ?? '').trim();
  if (!t) return refuse('Write something for the entry.');
  const d = cleanDate(date); if (d === undefined) return refuse('Use a date like 2026-10-23, or leave it empty.');
  const entry = cleanEntry({id: newId(), type: 'manual', text: t, at: now(), date: d});
  if (hidden) { await writeHidden(actor.id, [entry, ...hiddenFor(actor.id)]); return {ok: true, result: entry}; }
  const j = readJourney(actor);
  await writeJourney(actor, {...j, entries: [entry, ...j.entries]});
  return {ok: true, result: entry};
}
/** GM: change an entry's text and date (any entry; automatic ones keep their type). */
export async function editEntry(actor, id, {text, date} = {}) {
  const blocked = gmOnly('edit Journey entries'); if (blocked) return blocked;
  const d = date === undefined ? undefined : cleanDate(date);
  if (date !== undefined && d === undefined) return refuse('Use a date like 2026-10-23, or leave it empty.');
  const patch = e => ({...e, ...(text !== undefined ? {text: String(text).trim().slice(0, TEXT_MAX)} : {}), ...(date !== undefined ? {date: d} : {})});
  const j = readJourney(actor);
  if (j.entries.some(e => e.id === id)) { await writeJourney(actor, {...j, entries: j.entries.map(e => e.id === id ? patch(e) : e)}); return {ok: true}; }
  const h = hiddenFor(actor.id);
  if (h.some(e => e.id === id)) { await writeHidden(actor.id, h.map(e => e.id === id ? patch(e) : e)); return {ok: true}; }
  return refuse('That entry is gone.');
}
/** GM: hide an entry from the player (moves it to the GM-only store) or show it again (moves it back). */
export async function setHidden(actor, id, hide) {
  const blocked = gmOnly('hide Journey entries'); if (blocked) return blocked;
  const j = readJourney(actor), h = hiddenFor(actor.id);
  if (hide) {
    const e = j.entries.find(x => x.id === id); if (!e) return h.some(x => x.id === id) ? {ok: true} : refuse('That entry is gone.');
    await writeHidden(actor.id, [e, ...h]);
    await writeJourney(actor, {...j, entries: j.entries.filter(x => x.id !== id)});
  } else {
    const e = h.find(x => x.id === id); if (!e) return j.entries.some(x => x.id === id) ? {ok: true} : refuse('That entry is gone.');
    await writeJourney(actor, {...j, entries: [e, ...j.entries]});
    await writeHidden(actor.id, h.filter(x => x.id !== id));
  }
  return {ok: true};
}
/** GM: delete a manual entry (automatic entries can be hidden, not deleted, so a re-fire can't bring them back). */
export async function deleteEntry(actor, id) {
  const blocked = gmOnly('delete Journey entries'); if (blocked) return blocked;
  if (!String(id).startsWith('manual-')) return refuse('Only GM notes can be deleted; hide an automatic entry instead.');
  const j = readJourney(actor), h = hiddenFor(actor.id);
  if (j.entries.some(e => e.id === id)) await writeJourney(actor, {...j, entries: j.entries.filter(e => e.id !== id)});
  else if (h.some(e => e.id === id)) await writeHidden(actor.id, h.filter(e => e.id !== id));
  else return refuse('That entry is gone.');
  return {ok: true};
}

// ---------- Recorders (who writes what) ----------

const partner = id => { const m = globalThis.game?.modules?.get?.(id); return m?.active ? m.api ?? null : null; };
const activeGMs = () => [...(globalThis.game?.users ?? [])].filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id));
/** The one client that writes for this Actor: the first active GM, else the first active owner. */
export function isWriterFor(actor, user = globalThis.game?.user) {
  const gms = activeGMs();
  if (gms.length) return gms[0].id === user?.id;
  const owners = [...(globalThis.game?.users ?? [])].filter(u => u.active && !u.isGM && actor?.testUserPermission?.(u, 'OWNER')).sort((a, b) => a.id.localeCompare(b.id));
  return owners[0]?.id === user?.id;
}
/** Player characters: characters with at least one non-GM owner (who a party quest counts for). */
export const partyActors = () => [...(globalThis.game?.actors ?? [])].filter(a => a.type === 'character' && !isBackup(a) && [...(globalThis.game?.users ?? [])].some(u => !u.isGM && a.testUserPermission?.(u, 'OWNER')));

export async function recordLevel(actor) {
  if (actor?.type !== 'character' || isBackup(actor) || !isWriterFor(actor)) return null; // level backups (0.27.0) record nothing
  const {entries, seen} = levelEntries(actor);
  return appendAuto(actor, entries, seen);
}
/** Renown is read as this user sees it, so each owner records their own characters (the GM can't read standings). */
export async function recordRenown(actors = null) {
  const api = partner('ashen-gate-factions'), user = globalThis.game?.user;
  if (!api || isGM(user)) return null;
  const mine = (actors ?? [...(globalThis.game?.actors ?? [])]).filter(a => a.type === 'character' && !isBackup(a) && a.testUserPermission?.(user, 'OWNER'));
  for (const a of mine) { const {entries, seen} = renownEntries(a, api); await appendAuto(a, entries, seen); }
  return mine.length;
}
export async function recordQuests() {
  const api = partner('ashen-gate-quest-manager'), g = globalThis.game;
  if (!api?.listQuests || !isGM() || activeGMs()[0]?.id !== g.user?.id) return null;
  let seen = null;
  try { const v = g.settings.get(MODULE_ID, QUEST_SEEN); seen = v && typeof v === 'object' && Object.keys(v).length ? v : null; } catch { seen = null; }
  const party = partyActors().map(a => a.id);
  const {done, seen: next} = questCompletions(api, seen, party);
  for (const d of done) for (const id of d.actorIds) { const a = g.actors?.get?.(id); if (a) await appendAuto(a, [d.entry]); }
  if (JSON.stringify(next) !== JSON.stringify(seen ?? {})) await g.settings.set(MODULE_ID, QUEST_SEEN, next);
  return done.length;
}
/** "Bound to the Ember Cinder" (a name already ending in "Cinder" isn't doubled; no name: "Bound to a Cinder"). */
export const cinderBindText = name => { const n = String(name ?? '').trim(); return !n ? 'Bound to a Cinder' : /\bcinder$/i.test(n) ? `Bound to the ${n}` : `Bound to the ${n} Cinder`; };
const INSTANCE_RE = /^[A-Za-z0-9_-]{1,64}$/;
/**
 * First bind = Journey milestone (0.31.0). Cinders calls the hook ashenGateCinder.changed with {kind, instanceId, actorId}
 * on the GM client that bound the Cinder (binding is GM-only in Cinders), so that GM client writes it. The entry id is
 * cinder-<instanceId>: a re-fire, a reload, a level restore (the Journey never reverts) or a hidden entry never adds a
 * second one. The name is read through Cinders' public api.cinder.list. Players and level backups record nothing.
 */
export async function recordCinderBind(data, user = globalThis.game?.user) {
  if (data?.kind !== 'bind' || !isGM(user)) return null;
  const instanceId = String(data.instanceId ?? '');
  if (!INSTANCE_RE.test(instanceId)) return null;
  const actor = globalThis.game?.actors?.get?.(data.actorId);
  if (actor?.type !== 'character' || isBackup(actor)) return null;
  let name = '';
  try { const c = partner('ashen-gate-cinders')?.cinder; name = c?.contract === 'ag-cinder/1' ? c.list(actor)?.find?.(x => x.instanceId === instanceId)?.name ?? '' : ''; } catch { name = ''; }
  return appendAuto(actor, [{id: `cinder-${instanceId}`, type: 'cinder', text: cinderBindText(name), at: now(), data: {instanceId, definitionId: data.definitionId ?? null}}], null, user);
}
export function registerJourneySettings(settings) {
  settings.register(MODULE_ID, QUEST_SEEN, {scope: 'world', config: false, type: Object, default: {}});
}
