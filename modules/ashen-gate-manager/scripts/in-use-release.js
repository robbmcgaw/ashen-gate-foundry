/**
 * Release items in use (0.95.0). A GM-only, re-runnable maintenance action: release to players exactly the world Items the CURRENT
 * party uses, one tier at a time, instead of everything. Pure logic with the Foundry calls injected, so the Node suite covers it.
 *
 * Why: Manager imports Items GM-only (default ownership None, the 0.72.0 setting). Skill Trees only shows and unlocks a perk for a player when
 * the perk Item is readable by all players, and the Profession Ledger falls back to a read-only popup when a player cannot open an Item.
 *
 * Who counts: world Actors of type character that a non-GM user owns (OWNER on the Actor itself; the "default" ownership does not count).
 * What is looked at, per character (read only through each module's public api, feature-detected):
 *  - Professions (Profession Ledger api.getProfessions): for each profession held, the PERK-* perks of that profession and the REC-* recipes
 *    of that profession at the character's CURRENT tier and below, never above. A recipe also brings the MAT-* materials it needs and the
 *    ITEM-* items it makes. Artistry disciplines are professions too (creative category), so the same rule covers them.
 *  - Cinders (Cinders api.cinder.list): the signature ability and passive of each bound Cinder; its core powers (POWER-<CINDER>-NN) whose
 *    `tier_requirement` the character has reached (points earned on the Cinder's tree, Skill Trees api.pointsSummary); and the enhancement
 *    Items (<power>-P / -M / -G) only for powers the character has unlocked.
 * Same eligibility and same rules as 0.89.0 "Materials visible to players" (its decision helper is reused):
 *  - approved + `player` visibility, not archived, default ownership exactly None, and not hidden on purpose (the baseline Manager last set
 *    was Observer but the GM lowered the default since). Their `ownership.default` becomes Observer.
 *  - Never lowers anything, never touches a per-user ownership entry, never writes an Item's content. The only other write is Manager's own
 *    bookkeeping flag (the baseline), the same pair every Manager release writes, so a later Sync does not undo the choice.
 *  - Only world Items (never Items on Actors), only records of the expected kind, never a draft / GM-only / reveal-gated record, never a
 *    profession or Cinder nobody uses. Apply re-checks each Item first, so one changed after the preview is skipped; running it again
 *    after a tier-up releases only the new tier and changes nothing else.
 *  - GM only, checked here (plan, apply and the fact gathering all throw for anyone else).
 */
import {MODULE_ID, LEVEL} from './release.js';
import {materialDecision, materialUpdate, SKIP_REASONS as BASE_SKIP_REASONS, CHUNK} from './material-visibility.js';
import {playerOwners} from './party-sheets.js';

export {CHUNK, MODULE_ID};
export const LEDGER_ID = 'ashen-gate-profession-ledger';
export const CINDERS_ID = 'ashen-gate-cinders';
export const TREES_ID = 'ashen-gate-skill-trees';
/** The Ledger's own tier order (Apprentice 1, Journeyman 4, Expert 7, Artisan 10, Master 13). Used only when the Ledger does not expose its order. */
export const DEFAULT_TIER_ORDER = Object.freeze(['apprentice', 'journeyman', 'expert', 'artisan', 'master']);
export const SKIP_REASONS = Object.freeze({
  ...BASE_SKIP_REASONS,
  noTier: 'No readable tier on the record (left alone)',
  missing: 'Not in this world (not imported)'
});
export const BUCKETS = Object.freeze({
  perks: ['perk', 'perks'], recipes: ['recipe', 'recipes'], materials: ['material', 'materials'], outputs: ['output item', 'output items'],
  signature: ['signature item', 'signature items'], powers: ['core power', 'core powers'], enhancements: ['enhancement', 'enhancements']
});

const norm = v => String(v ?? '').trim().toLowerCase();
const text = v => (typeof v === 'string' ? v.trim() : '');
const list = v => (Array.isArray(v) ? v : []);
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plural = (n, [one, many]) => `${n} ${n === 1 ? one : many}`;

// ---------- Tiers ----------
/** A tier order from the Ledger when it exposes one (api.tiers() or api.tierOrder(): names, or {id|key|name}), else the Ledger's own default. */
export function readTierOrder(api) {
  for (const key of ['tiers', 'tierOrder']) {
    if (typeof api?.[key] !== 'function') continue;
    try {
      const names = list(api[key]()).map(t => norm(typeof t === 'string' ? t : t?.id ?? t?.key ?? t?.name)).filter(Boolean);
      if (names.length >= 2 && new Set(names).size === names.length) return names;
    } catch { /* fall through to the default */ }
  }
  return [...DEFAULT_TIER_ORDER];
}
/** Zero-based rank of a tier ("apprentice", "Apprentice (level 1)", or a whole number from 1) in `order`, or null when it cannot be read. */
export function tierRank(value, order = DEFAULT_TIER_ORDER) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= order.length ? n - 1 : null;
  }
  const t = norm(value), i = order.findIndex(o => t === o || new RegExp(`\\b${escRe(o)}\\b`).test(t));
  return i < 0 ? null : i;
}
/** The tier a perk or recipe record names: whatever the stored definition carries (tier, tierId, tier_id, tier_requirement). */
export const recordTier = def => def?.tier ?? def?.tierId ?? def?.tier_id ?? def?.tier_requirement ?? def?.tierRequirement ?? null;
/** A power's `tier_requirement` as a whole number (3, "3", "Tier 3"), or null. */
export function powerRequirement(def) {
  const raw = def?.tier_requirement ?? def?.tierRequirement ?? def?.power?.tier_requirement ?? null;
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 0 ? raw : null;
  const m = /^\D*(\d+)\D*$/.exec(String(raw ?? ''));
  return m ? Number(m[1]) : null;
}

// ---------- Reading the records ----------
const refTargets = (def, relation) => list(def?.refs).filter(r => r?.relation === relation).map(r => text(r.target_id)).filter(Boolean);
const kindOf = (source, entityType, prefix) => (source?.entityType ?? source?.entity_type) === entityType || String(source?.sourceId ?? '').startsWith(prefix);
const isPerk = s => kindOf(s, 'ProfessionPerk', 'PERK-');
const isRecipe = s => kindOf(s, 'Recipe', 'REC-');
const isMaterial = s => kindOf(s, 'Material', 'MAT-');
const isOutput = s => kindOf(s, 'Item', 'ITEM-');
const isPower = s => kindOf(s, 'Power', 'POWER-');
const professionOf = (def, relation) => text(def?.profession_id ?? def?.professionId) || refTargets(def, relation)[0] || '';
const materialIdsOf = def => [...new Set([
  ...list(def?.ingredients).map(i => text(i?.materialId ?? i?.material_id ?? i?.target_id ?? i?.id)),
  ...refTargets(def, 'requires_material')
].filter(Boolean))];
const outputIdsOf = def => [...new Set([text(def?.result_item_id ?? def?.resultItemId), ...refTargets(def, 'produces')].filter(Boolean))];

/** World Items that came from an Ashen Gate record, indexed by permanent id. Items on Actors are never indexed. */
function indexWorld(docs, sourceOf) {
  const byId = new Map(), all = [];
  for (const doc of docs ?? []) {
    if (doc?.documentName !== 'Item' || doc.parent) continue;
    const source = sourceOf(doc), id = source?.sourceId;
    if (!id) continue;
    all.push({doc, source, id});
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push({doc, source, id});
  }
  return {byId, all};
}

// ---------- Facts (public apis only, feature-detected) ----------
const fn = (api, ...path) => { let at = api; for (const key of path) at = at?.[key]; return typeof at === 'function' ? at : null; };
function moduleApi(game, id, label, calls) {
  const mod = game?.modules?.get?.(id);
  if (!mod) return {skipped: `${label} is not installed`};
  if (!mod.active) return {skipped: `${label} is not active in this world`};
  const api = mod.api ?? null;
  if (!api) return {skipped: `this version of ${label} has no api`};
  const missing = calls.filter(c => !fn(api, ...c));
  if (missing.length) return {skipped: `this version of ${label} has no ${missing.map(c => c.join('.')).join(' or ')}; update it`};
  return {api};
}

/**
 * Who and what, as plain data: {tierOrder, ledger, cinders, trees: {ok} | {skipped: reason}, characters: [{actorId, name,
 * professions: [{professionId, name, tier, level}] | null, cinders: [{definitionId, name, earned, unlocked, unlockedEnhancements, signature}] | null}]}.
 * A module that is absent, inactive or too old gives {skipped: reason}; a character one call fails for gets null in that place. GM only.
 */
export function gatherInUseFacts(game) {
  if (!game?.user?.isGM) throw new Error('Only a GM can change who can read Items.');
  const ledger = moduleApi(game, LEDGER_ID, 'Profession Ledger', [['getProfessions']]);
  const cinders = moduleApi(game, CINDERS_ID, 'Cinders', [['cinder', 'list']]);
  const trees = moduleApi(game, TREES_ID, 'Skill Trees', [['pointsSummary']]);
  const actors = [...(game.actors?.contents ?? game.actors ?? [])].filter(a => a?.type === 'character' && playerOwners(game, a).length)
    .sort((a, b) => text(a.name).localeCompare(text(b.name)) || String(a.id).localeCompare(String(b.id)));
  const characters = actors.map(actor => {
    let professions = null, bound = null;
    if (ledger.api) {
      try {
        professions = list(ledger.api.getProfessions(actor)).map(p => ({professionId: text(p.professionId), name: text(p.name), tier: p.tier ?? null, level: Number.isFinite(Number(p.level)) ? Number(p.level) : null}));
      } catch { professions = null; }
    }
    if (cinders.api) {
      try {
        let rows = null;
        if (trees.api) { try { rows = list(trees.api.pointsSummary(actor)); } catch { rows = null; } }
        bound = list(cinders.api.cinder.list(actor)).map(c => {
          const row = rows?.find(r => r.treeId && r.treeId === c.treeId) ?? null;
          return {definitionId: text(c.definitionId), name: text(c.name) || text(c.definitionId),
            earned: row && Number.isFinite(Number(row.earned)) && row.earned !== null ? Number(row.earned) : null,
            unlocked: list(c.powers).map(p => text(p.powerId)).filter(Boolean),
            unlockedEnhancements: list(c.enhancements).map(p => text(p.powerId)).filter(Boolean),
            signature: [c.signature?.active?.powerId, c.signature?.passive?.powerId].map(text).filter(Boolean)};
        });
      } catch { bound = null; }
    }
    return {actorId: actor.id, name: text(actor.name) || 'Unnamed character', professions, cinders: bound};
  });
  return {tierOrder: readTierOrder(ledger.api), ledger: ledger.api ? {ok: true} : ledger, cinders: cinders.api ? {ok: true} : cinders,
    trees: trees.api ? {ok: true} : trees, characters};
}

// ---------- Plan ----------
/**
 * Preview: {total (will change), groups: [{key, character, label, counts, total}], alreadyVisible, skipped: [{key, label, count}], skippedTotal,
 * notes, characters, targets}. Groups are per character and profession or Cinder, and count only Items that would CHANGE; an Item two
 * groups both reach is counted once, in the first. Nothing is written.
 */
export function planInUseRelease(docs, sourceOf, facts, {user, levels = LEVEL} = {}) {
  if (!user?.isGM) throw new Error('Only a GM can change who can read Items.');
  const {byId} = indexWorld(docs, sourceOf), allDocs = indexWorld(docs, sourceOf).all;
  const order = facts?.tierOrder?.length ? facts.tierOrder : [...DEFAULT_TIER_ORDER];
  const judged = new Set(), missing = new Set(), counts = {}, targets = [], groups = [], notes = [];
  let alreadyVisible = 0;
  const skip = key => { counts[key] = (counts[key] ?? 0) + 1; };
  const entry = (id, accept) => {
    const found = (byId.get(id) ?? []).filter(e => accept(e.source));
    if (!found.length) { if (!missing.has(id)) { missing.add(id); skip('missing'); } }
    return found;
  };
  const consider = (e, bucket, group) => {
    if (judged.has(e.doc)) return;
    judged.add(e.doc);
    const d = materialDecision(e.doc, e.source, levels);
    if (d === 'change') { targets.push(e.doc); group.counts[bucket] = (group.counts[bucket] ?? 0) + 1; group.total++; }
    else if (d === 'visible') alreadyVisible++;
    else skip(d);
  };
  const newGroup = (character, label, key) => ({key, character, label, counts: {}, total: 0});
  const keep = group => { if (group.total) groups.push(group); };

  if (facts?.ledger && !facts.ledger.ok) notes.push(`Profession Ledger: ${facts.ledger.skipped}. Perks and recipes were skipped.`);
  else if (facts?.trees && !facts.trees.ok) notes.push(`Skill Trees: ${facts.trees.skipped}. Perks were skipped (only Skill Trees shows them); recipes are still listed.`);
  if (facts?.cinders && !facts.cinders.ok) notes.push(`Cinders: ${facts.cinders.skipped}. Cinder signature items, powers and enhancements were skipped.`);
  else if (facts?.trees && !facts.trees.ok) notes.push(`Skill Trees: ${facts.trees.skipped}. Points earned cannot be read, so each Cinder gets only the powers already unlocked and the next one.`);
  const doPerks = Boolean(facts?.ledger?.ok && facts?.trees?.ok);

  for (const ch of facts?.characters ?? []) {
    // ---- Professions ----
    if (facts?.ledger?.ok) {
      if (ch.professions === null) notes.push(`${ch.name}: professions could not be read, so none were released.`);
      for (const prof of ch.professions ?? []) {
        const rank = tierRank(prof.tier, order);
        if (rank === null || !prof.professionId) { notes.push(`${ch.name}: ${prof.name || prof.professionId || 'a profession'} has no readable tier, so none of it was released.`); continue; }
        const group = newGroup(ch.name, `${prof.name || prof.professionId} (${cap(order[rank])})`, `${ch.actorId}:${prof.professionId}`);
        for (const e of allDocs) {
          const def = e.source.definition;
          if (isPerk(e.source) && doPerks) {
            if (professionOf(def, 'perk_of') !== prof.professionId) continue;
            const r = tierRank(recordTier(def), order);
            if (r === null) { if (!judged.has(e.doc)) { judged.add(e.doc); skip('noTier'); } continue; }
            if (r <= rank) consider(e, 'perks', group);
          } else if (isRecipe(e.source)) {
            if (professionOf(def, 'crafted_by') !== prof.professionId) continue;
            const r = tierRank(recordTier(def), order);
            if (r === null) { if (!judged.has(e.doc)) { judged.add(e.doc); skip('noTier'); } continue; }
            if (r > rank) continue;
            consider(e, 'recipes', group);
            for (const id of materialIdsOf(def)) for (const m of entry(id, isMaterial)) consider(m, 'materials', group);
            const outs = new Set(outputIdsOf(def));
            for (const o of allDocs) if (isOutput(o.source) && text(o.source.definition?.created_by_recipe_id) === e.id) outs.add(o.id);
            for (const id of outs) for (const o of entry(id, isOutput)) consider(o, 'outputs', group);
          }
        }
        keep(group);
      }
    }
    // ---- Cinders ----
    if (facts?.cinders?.ok) {
      if (ch.cinders === null) notes.push(`${ch.name}: Cinders could not be read, so none were released.`);
      for (const c of ch.cinders ?? []) {
        const reached = Number.isFinite(c.earned) ? c.earned : null;
        const group = newGroup(ch.name, `${c.name || c.definitionId} (${reached === null ? 'points not readable' : plural(reached, ['point', 'points']) + ' earned'})`, `${ch.actorId}:${c.definitionId}`);
        const unlocked = new Set(list(c.unlocked)), power = id => entry(id, isPower);
        // Signature ability and passive: the bound Cinder's own, from the Cinder's record and from what the character carries.
        const bearer = byId.get(c.definitionId)?.map(e => e.source.definition?.cinder?.bearer_items).find(Boolean) ?? {};
        for (const id of new Set([...list(c.signature), text(bearer.active), text(bearer.passive)].filter(Boolean))) for (const e of power(id)) consider(e, 'signature', group);
        // Core powers: POWER-<CINDER>-NN, plus any power the character has unlocked.
        const key = String(c.definitionId).replace(/^MUT-/, ''), re = new RegExp(`^POWER-${escRe(key)}-\\d{2}$`);
        const core = new Map();
        for (const e of allDocs) if (isPower(e.source) && re.test(e.id) && !core.has(e.id)) core.set(e.id, e);
        for (const id of unlocked) if (!core.has(id) && byId.has(id)) core.set(id, byId.get(id).find(x => isPower(x.source)) ?? byId.get(id)[0]);
        const ordered = [...core.values()].map(e => ({e, req: powerRequirement(e.source.definition)}))
          .sort((a, b) => (a.req ?? Infinity) - (b.req ?? Infinity) || a.e.id.localeCompare(b.e.id));
        const open = r => unlocked.has(r.e.id) || (reached !== null && r.req !== null && r.req <= reached);
        // Tier unreadable (no points, or the record names no requirement): only unlocked powers and the next one to unlock.
        const next = ordered.find(r => !open(r) && (reached === null || r.req === null));
        for (const r of ordered) if (open(r) || r === next) consider(r.e, 'powers', group);
        // Enhancements: only for powers the character has unlocked (<power>-P / -M / -G), and any enhancement it unlocked itself.
        const enh = new Set(list(c.unlockedEnhancements));
        for (const id of unlocked) for (const s of ['P', 'M', 'G']) if (byId.has(`${id}-${s}`)) enh.add(`${id}-${s}`);
        for (const id of enh) for (const e of byId.get(id)?.filter(x => isPower(x.source)) ?? []) consider(e, 'enhancements', group);
        keep(group);
      }
    }
  }
  const skipped = Object.keys(SKIP_REASONS).filter(k => counts[k]).map(key => ({key, label: SKIP_REASONS[key], count: counts[key]}));
  return {total: targets.length, groups, alreadyVisible, skipped, skippedTotal: skipped.reduce((n, s) => n + s.count, 0), notes,
    characters: (facts?.characters ?? []).length, targets};
}

/** One preview line for a group: "Quest — Archaeology (Apprentice): 6 perks, 12 recipes, 18 materials, 12 output items". */
export const groupLine = g => `${g.character} — ${g.label}: ${Object.keys(BUCKETS).filter(k => g.counts[k]).map(k => plural(g.counts[k], BUCKETS[k])).join(', ')}`;
/** One-line result text, used by the confirmation and the status line. */
export function inUseSummary(r, {done = false} = {}) {
  const skipped = r.skippedTotal ? ` (${r.skipped.map(s => `${s.count} ${s.label.toLowerCase()}`).join('; ')})` : '';
  return `${done ? 'Released' : 'To release'}: ${r.changed ?? r.total}, already readable: ${r.alreadyVisible}, skipped: ${r.skippedTotal}${skipped}.`;
}
/** The confirmation body: one line per group, the totals, and a plain note for every part that was skipped. */
export const inUseLines = plan => [...plan.groups.map(groupLine), inUseSummary(plan), ...plan.notes];

/** Applies a preview. Each Item is re-checked first (one changed since the preview is left alone). Cancel (signal) stops between chunks. */
export async function applyInUseRelease(plan, {user, sourceOf, write, onProgress = () => {}, signal = null, yieldToUI = () => new Promise(r => setTimeout(r, 0)), levels = LEVEL} = {}) {
  if (!user?.isGM) throw new Error('Only a GM can change who can read Items.');
  const live = plan.targets.filter(doc => doc?.documentName === 'Item' && !doc.parent && materialDecision(doc, sourceOf(doc), levels) === 'change');
  const changedSincePreview = plan.targets.length - live.length;
  let changed = 0, cancelled = false;
  for (let n = 0; n < live.length; n += CHUNK) {
    if (signal?.aborted) { cancelled = true; break; }
    const part = live.slice(n, n + CHUNK);
    await write(part.map(d => materialUpdate(d, levels)));
    changed += part.length;
    onProgress({done: changed, total: live.length});
    await yieldToUI();
  }
  const out = {ok: true, changed, alreadyVisible: plan.alreadyVisible, skipped: plan.skipped, skippedTotal: plan.skippedTotal, changedSincePreview, cancelled, notes: plan.notes};
  const tail = changedSincePreview ? ` ${changedSincePreview} changed since the preview and were left alone.` : '';
  out.message = (cancelled ? `Stopped after ${changed} of ${live.length}. ` : '') + (changed || cancelled ? inUseSummary(out, {done: true}) : `Nothing to change. ${inUseSummary(out, {done: true})}`) + tail;
  return out;
}
