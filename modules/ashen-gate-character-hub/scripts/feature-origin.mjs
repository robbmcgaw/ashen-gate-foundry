/**
 * Where a feature came from (0.58.0), for the Features tab's "Origin" grouping. Display only; nothing is stored or written.
 * Sections, in order: Class and Subclass, Species and Background, Feats, Professions (one group per profession), Cinder powers (one
 * group per Cinder), Everything else. How each is told:
 *   - Cinder powers: Cinders' api.cinder.list (the signature ability / passive Items), and Skill Trees' accounts.grants(actor) rows whose
 *     tree is that Cinder's tree (treeId from api.cinder.list).
 *   - Professions: Skill Trees' accounts.grants(actor) rows on a profession tree (pointsSummary `kind`, listTrees `sourceRef`); an Item with
 *     the Profession Ledger's documented `flags.ashen-gate-profession-ledger.grant`; or, while the Ledger is active, an Item whose
 *     Manager source id is a PROF-* or whose definition names a profession_id. Names from the Ledger's getProfessions.
 *   - Pantheon: an Item carrying Renown's flag flags.ashen-gate-factions.vowItem {deityId, rewardId} (the Vow Item), one group per deity.
 *   - Class, Species, Background: dnd5e's own `flags.dnd5e.advancementOrigin` (the granting Item's type), else system.type.value.
 *   - Feats: dnd5e's system.type.value 'feat'.
 * Every partner is feature-detected and optional: with none of them active, profession and Cinder Items fall into the dnd5e groups.
 */
import {partnerApi} from './partners.mjs';
import {cinderPowerItems} from './cinders.mjs';
import {featuresData} from './items.mjs';

export const ORIGIN_SECTIONS = Object.freeze([['class', 'Class and Subclass'], ['heritage', 'Species and Background'], ['feat', 'Feats'],
  ['profession', 'Professions'], ['cinder', 'Cinder powers'], ['pantheon', 'Pantheon'], ['other', 'Everything else']]);
export const ORIGIN_PARTNER_SECTIONS = Object.freeze(['profession', 'cinder', 'pantheon']);
const LEDGER = 'ashen-gate-profession-ledger', TREES = 'ashen-gate-skill-trees', MANAGER = 'ashen-gate-manager';

const safe = fn => { try { return fn(); } catch { return null; } };
/** Skill Trees' perk grants for the character: Map Item id → {treeId, kind, sourceRef, treeName}. Empty without Skill Trees. */
function treeGrants(actor) {
  const api = partnerApi(TREES), out = new Map();
  const accounts = api?.accounts;
  if (accounts?.contract !== 'ag-tree-accounts/1' || typeof accounts.grants !== 'function') return out;
  const grants = safe(() => accounts.grants(actor));
  if (!Array.isArray(grants)) return out;
  const trees = new Map();
  for (const t of safe(() => api.pointsSummary?.(actor)) ?? []) if (t?.treeId) trees.set(t.treeId, {kind: String(t.kind ?? ''), treeName: String(t.name ?? ''), sourceRef: String(t.sourceRef ?? '')});
  for (const t of safe(() => api.listTrees?.()) ?? []) if (t?.id) trees.set(t.id, {...(trees.get(t.id) ?? {treeName: String(t.name ?? '')}), kind: String(t.provider?.kind ?? trees.get(t.id)?.kind ?? ''), sourceRef: String(t.sourceRef ?? trees.get(t.id)?.sourceRef ?? '')});
  for (const g of grants) if (g?.itemId) out.set(String(g.itemId), {treeId: g.treeId ?? null, ...(trees.get(g.treeId) ?? {kind: '', treeName: '', sourceRef: ''})});
  return out;
}
/** The Ledger's professions on the character: Map PROF id → name. */
function professionNames(actor) {
  const api = partnerApi(LEDGER), out = new Map();
  if (typeof api?.getProfessions !== 'function') return out;
  for (const p of safe(() => api.getProfessions(actor)) ?? []) if (p?.professionId && p?.name) out.set(String(p.professionId), String(p.name));
  return out;
}

const DND5E = {class: 'class', subclass: 'class', race: 'heritage', species: 'heritage', background: 'heritage', feat: 'feat'};
/**
 * Origin of each row: Map row id → {section, key, label, order}. `rows` are featuresData rows (id, name, sourceType).
 * `order` ranks groups inside a section (Cinders keep Cinders' order; professions sort by name).
 */
export function featureOrigins(actor, rows) {
  const out = new Map();
  const cinders = cinderPowerItems(actor), grants = treeGrants(actor), names = professionNames(actor), ledger = !!partnerApi(LEDGER);
  const cinderOfItem = new Map(), cinderOfTree = new Map();
  cinders.forEach((c, i) => { c.itemIds.forEach(id => cinderOfItem.set(id, {c, i})); if (c.treeId) cinderOfTree.set(c.treeId, {c, i}); });
  const cinderGroup = ({c, i}) => ({section: 'cinder', key: c.instanceId || c.name, label: c.name, order: i});
  // A profession Item with no PROF id (a tree whose sourceRef could not be read) is matched to the Ledger's professions by name, else keyed by its name.
  const idByName = new Map([...names].map(([id, n]) => [n.toLowerCase(), id]));
  const profGroup = (id, fallback) => {
    const key = id || idByName.get(String(fallback ?? '').toLowerCase()) || (fallback ? `name:${String(fallback).toLowerCase()}` : 'other');
    return {section: 'profession', key, label: names.get(key) || fallback || 'Other professions', order: 0};
  };
  for (const r of rows) {
    const item = actor.items?.get?.(r.id) ?? null, flags = item?.flags ?? {}, grant = grants.get(r.id);
    const src = flags[MANAGER]?.source, srcId = String(src?.sourceId ?? ''), defProf = String(src?.definition?.profession_id ?? src?.definition?.professionId ?? '');
    let o = null;
    const vow = flags['ashen-gate-factions']?.vowItem;   // Renown's Vow Item (0.60.2): found by its flag alone, no module needed
    if (vow && typeof vow === 'object') o = {section: 'pantheon', key: String(vow.deityId || r.id), label: r.name, order: 0};
    else if (cinderOfItem.has(r.id)) o = cinderGroup(cinderOfItem.get(r.id));
    else if (grant?.kind === 'cinder_milestone' || (grant && cinderOfTree.has(grant.treeId))) {
      o = cinderOfTree.has(grant.treeId) ? cinderGroup(cinderOfTree.get(grant.treeId)) : {section: 'cinder', key: grant.treeId || 'cinder', label: grant.treeName || 'Cinder', order: 99};
    } else if (grant?.kind === 'profession') o = profGroup(grant.sourceRef || defProf, grant.treeName);
    else if (ledger && flags[LEDGER]?.grant) o = profGroup(defProf || (/^PROF-/.test(srcId) ? srcId : ''), /^PROF-/.test(srcId) ? r.name : '');
    else if (ledger && /^PROF-/.test(srcId)) o = profGroup(srcId, r.name);
    else if (ledger && defProf) o = profGroup(defProf);
    if (!o) {
      const section = DND5E[r.sourceType] ?? DND5E[item?.system?.type?.value];
      o = {section: section ?? 'other', key: section ?? 'other', label: '', order: 0};
    }
    out.set(r.id, o);
  }
  return out;
}
/** True when any row has a profession or Cinder origin: the default grouping turns to Origin. */
export const hasPartnerOrigin = origins => [...origins.values()].some(o => ORIGIN_PARTNER_SECTIONS.includes(o.section));

/**
 * The Origin sections for sorted rows: [{key, label, items}], in section order; profession and Cinder sections split per
 * profession / Cinder with the heading "Professions: Herbalism". Empty groups are left out.
 */
export function originGroups(rows, origins) {
  const groups = new Map();
  for (const r of rows) {
    const o = origins.get(r.id) ?? {section: 'other', key: 'other', label: '', order: 0};
    const split = ORIGIN_PARTNER_SECTIONS.includes(o.section), base = ORIGIN_SECTIONS.find(([k]) => k === o.section)?.[1] ?? 'Everything else';
    const key = split ? `${o.section}-${o.key}` : o.section;
    if (!groups.has(key)) groups.set(key, {key, label: split ? `${base}: ${o.label}` : base, section: o.section, order: o.order, name: o.label, items: []});
    groups.get(key).items.push(r);
  }
  const rank = g => ORIGIN_SECTIONS.findIndex(([k]) => k === g.section);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || (a.section === 'cinder' ? a.order - b.order : 0) || a.name.localeCompare(b.name));
}

/** The Features tab's default Group when the user has not picked one: Origin if the character has profession or Cinder features, else Feature type (unchanged). */
export function originDefault(actor) {
  const rows = featuresData(actor).groups.flatMap(g => g.items);
  return hasPartnerOrigin(featureOrigins(actor, rows)) ? 'origin' : 'type';
}
