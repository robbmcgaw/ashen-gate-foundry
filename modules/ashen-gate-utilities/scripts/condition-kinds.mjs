/* 0.38.0: pure helpers for the condition picker's choice list: removing duplicates and grouping by kind. Display only:
   nothing here touches a status effect, an Actor or an Item, and no game rule is decided here. No Foundry globals. */

/** Lower case, accents and every non-alphanumeric removed: "Bardic Inspiration" -> "bardicinspiration". */
export const normKey = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/* ---- Source priority: dnd5e system statuses > Foundry core > anything else (modules, custom). ---- */
export const DND5E_STATUS_IDS = Object.freeze(['bleeding', 'blinded', 'burning', 'burrowing', 'charmed', 'concentrating', 'coverHalf', 'coverThreeQuarters', 'coverTotal', 'cursed', 'dead', 'deafened', 'diseased', 'dodging', 'encumbered', 'ethereal', 'exceedingCarryingCapacity', 'exhaustion', 'falling', 'flying', 'frightened', 'grappled', 'heavilyEncumbered', 'hiding', 'hovering', 'incapacitated', 'invisible', 'marked', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'silenced', 'sleeping', 'stable', 'stunned', 'surprised', 'transformed', 'unconscious']);
export const CORE_STATUS_IDS = Object.freeze(['dead', 'unconscious', 'sleep', 'stun', 'prone', 'restrain', 'paralysis', 'fly', 'blind', 'deaf', 'silence', 'fear', 'burning', 'frozen', 'shock', 'corrode', 'bleeding', 'disease', 'poison', 'curse', 'regen', 'degen', 'hover', 'burrow', 'upgrade', 'downgrade', 'target', 'marked', 'eye', 'bless', 'fireShield', 'coldShield', 'magicShield', 'holyShield', 'invisible']);
export const SOURCE_RANK = Object.freeze({dnd5e: 0, core: 1, other: 2});
/** 'dnd5e' | 'core' | 'other'. `systemIds` adds the ids this dnd5e build registers itself (CONFIG.DND5E.conditionTypes / statusEffects). */
export function statusSource(id, {systemIds = []} = {}) {
  if (DND5E_STATUS_IDS.includes(id) || systemIds.includes(id)) return 'dnd5e';
  return CORE_STATUS_IDS.includes(id) ? 'core' : 'other';
}

const FALLBACK_ICON = /(^|\/)aura\.svg$/i;
/** Icon file name without folder, extension or query: "systems/dnd5e/icons/svg/statuses/prone.svg?x" -> "prone". */
const iconStem = p => String(p ?? '').split('?')[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '').toLowerCase();
/** Same picture, or the same file name in another folder. A missing (or generic) icon cannot tell two statuses apart, so it counts as similar. */
export function similarIcon(a, b) {
  const x = String(a ?? '').trim(), y = String(b ?? '').trim();
  if (!x || !y || FALLBACK_ICON.test(x) || FALLBACK_ICON.test(y)) return true;
  return x === y || iconStem(x) === iconStem(y);
}
const rulesKey = r => JSON.stringify([r.exclusiveGroup ?? '', [...(r.riders ?? [])].map(String).sort()]);

/**
 * Remove duplicates from `rows` ({id, label, img, source, exclusiveGroup?, riders?}), keeping input order for the kept rows.
 * 1) one row per status id (the better source wins, then the earlier row);
 * 2) rows with the same label (case, spacing and accents ignored) and a similar icon are one condition, the better source wins.
 * Rows whose group or riders differ are never merged (they apply different rules). Returns {kept, removed:[{id, label, source, reason, keptId}]}.
 */
export function dedupeConditionRows(rows) {
  const rank = r => SOURCE_RANK[r.source] ?? SOURCE_RANK.other;
  const order = rows.map((r, i) => [r, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]);
  const dropped = new Map(), byId = new Map(), keptByLabel = new Map();
  for (const [r] of order) {
    if (byId.has(r.id)) { dropped.set(r, {reason: 'same id', keptId: r.id}); continue; }
    byId.set(r.id, r);
    const key = normKey(r.label), peers = keptByLabel.get(key) ?? [];
    const twin = key && peers.find(p => similarIcon(p.img, r.img) && rulesKey(p) === rulesKey(r));
    if (twin) { dropped.set(r, {reason: 'same label and icon', keptId: twin.id}); byId.delete(r.id); continue; }
    keptByLabel.set(key, [...peers, r]);
  }
  return {
    kept: rows.filter(r => !dropped.has(r)),
    removed: rows.filter(r => dropped.has(r)).map(r => ({id: r.id, label: r.label, source: r.source, ...dropped.get(r)})),
  };
}
/** Pairs a person should look at: labels that start alike (Exhausted / Exhaustion), or different labels sharing one icon. Never merged. */
export function nearDuplicateRows(rows) {
  const out = [], pick = r => ({id: r.id, label: r.label, source: r.source});
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j], ka = normKey(a.label), kb = normKey(b.label);
    if (!ka || !kb || ka === kb) continue;
    let n = 0; while (n < ka.length && n < kb.length && ka[n] === kb[n]) n++;
    const sameIcon = a.img && b.img && !FALLBACK_ICON.test(a.img) && a.img === b.img;
    if (n >= 5) out.push({a: pick(a), b: pick(b), why: 'similar names'});
    else if (sameIcon) out.push({a: pick(a), b: pick(b), why: 'same icon'});
  }
  return out;
}

/* ---- Kinds ---- */
export const CONDITION_KINDS = Object.freeze([
  {key: 'incapacitating', label: 'Incapacitating'},
  {key: 'movement', label: 'Movement restricting'},
  {key: 'sensory', label: 'Sensory and mental'},
  {key: 'debilitating', label: 'Debilitating'},
  {key: 'buffs', label: 'Buffs and stances'},
  {key: 'other', label: 'Other'},
]);
/** Status ids first, then plain names; both are matched after normKey(). Edit this table to move a condition. */
export const KIND_MAP = Object.freeze({
  incapacitating: ['incapacitated', 'paralyzed', 'paralysis', 'stunned', 'stun', 'unconscious', 'petrified', 'dead', 'dying', 'sleeping', 'sleep', 'asleep'],
  movement: ['grappled', 'restrained', 'restrain', 'prone', 'slowed', 'falling', 'burrowing', 'burrow', 'flying', 'fly', 'ethereal', 'hovering', 'hover'],
  sensory: ['blinded', 'blind', 'deafened', 'deaf', 'charmed', 'charm', 'frightened', 'fear', 'confused', 'distracted', 'invisible', 'concentrating', 'concentration', 'silenced', 'silence'],
  debilitating: ['poisoned', 'poison', 'bleeding', 'burning', 'diseased', 'disease', 'exhausted', 'exhaustion', 'cursed', 'curse', 'dehydration', 'dehydrated', 'weakened', 'bane'],
  buffs: ['blessed', 'bless', 'hasted', 'haste', 'dodging', 'dodge', 'disengage', 'disengaged', 'hiding', 'hidden', 'raging', 'rage', 'inspired', 'inspiration', 'bardicinspiration'],
});
const KIND_LOOKUP = new Map(Object.entries(KIND_MAP).flatMap(([kind, names]) => names.map(n => [normKey(n), kind])));
/** The kind key for a choice ({id, label}): by status id first, then by normalised label, else 'other'. */
export function conditionKind(choice) {
  return KIND_LOOKUP.get(normKey(choice?.id)) ?? KIND_LOOKUP.get(normKey(choice?.label)) ?? 'other';
}
/** Choices grouped for the picker: [{key, label, items}] in the fixed kind order, empty groups left out, items A to Z. */
export function groupConditionChoices(choices) {
  const buckets = new Map(CONDITION_KINDS.map(k => [k.key, []]));
  for (const c of choices ?? []) buckets.get(conditionKind(c)).push(c);
  return CONDITION_KINDS.map(k => ({key: k.key, label: k.label, items: buckets.get(k.key).sort((a, b) => String(a.label).localeCompare(String(b.label)))})).filter(g => g.items.length);
}
