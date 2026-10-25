/**
 * Reference links (0.68.0). A reference to another Ashen Gate record is written into rich text as
 *   @AGRef[<permanent id>]{<label>}
 * and resolved when the text is shown, for the person looking at it (Foundry runs the enricher on each client):
 *  - Target: a handout journal's player Item twin first (ITEM-<journal id>, or an Item whose refs say
 *    also_available_as_journal -> <journal id>), then the record itself. The first one the viewer may see wins.
 *  - Text: the record's name with a type icon. Never the id. A target the viewer may not see, or that is not in the
 *    world, becomes plain text: the author's label when it is a real name, otherwise a neutral word ("Person", "Handout").
 *  - Players see a document only when they have Observer permission on it and its record is not GM-only. An NPC Actor
 *    is shown to a player only when the NPC Codex reveals it to them (the GM answers that), and it opens the Codex.
 *  - A quest, order or contract is a link only when the Quest Log reports it to this viewer (GM: any; player: a visible one);
 *    it opens in the Quest Log. Otherwise plain text.
 *  - Clicks go through one delegated listener on our own links (a.agm-ref-link), never through Foundry's or Monk's
 *    Enhanced Journal's content-link handling. The GM's Actor links call actor.sheet.render(true) directly.
 * The anchor carries no id or uuid for anything the viewer may not see.
 * Older imports (before 0.54.2) appended a "References" section of @UUID[...]{<raw id>} links; convertLegacyBlock turns
 * that section into @AGRef links (GM, once per document, only inside the section Manager wrote).
 */
const ID = '[A-Z][A-Z0-9]*(?:-[A-Z0-9_]+)+';
const ID_LIKE = new RegExp(`^${ID}$`);
/** Enricher pattern (global, as Foundry's enrichers need). */
export const AGREF_PATTERN = new RegExp(`@AGRef\\[(${ID})\\](?:\\{([^}\\r\\n]{0,160})\\})?`, 'g');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const cleanLabel = s => String(s ?? '').replace(/[{}\[\]\r\n]/g, '').trim().slice(0, 160);

/** A neutral word for a record nobody may name here, by id prefix. Never the id. */
const NEUTRAL = {NPC: 'Person', CRE: 'Creature', HANDOUT: 'Handout', ITEM: 'Item', LOC: 'Location', ROUTE: 'Route', QUEST: 'Quest',
  FAC: 'Faction', ORDER: 'Order', CONTRACT: 'Contract', REC: 'Recipe', MAT: 'Material', PROF: 'Profession', PERK: 'Perk', SHOP: 'Shop', TABLE: 'Table', JOURNAL: 'Journal'};
export function neutralLabel(id) { return NEUTRAL[String(id ?? '').split('-')[0]] ?? 'Related record'; }
/** The author's label when it is a real name (not empty, not an id), else ''. */
export function authorLabel(label) { const l = cleanLabel(label); return l && !ID_LIKE.test(l) ? l : ''; }

export const ICONS = {Item: 'fa-solid fa-suitcase', JournalEntry: 'fa-solid fa-book-open', Actor: 'fa-solid fa-user',
  RollTable: 'fa-solid fa-table-list', Macro: 'fa-solid fa-code', codex: 'fa-solid fa-address-book', quest: 'fa-solid fa-scroll'};
const QUEST_ID = /^(?:QUEST|ORDER|CONTRACT)-/;

/**
 * Index of the world's Manager-bound documents: id -> [doc], plus journal id -> [Item twin ids] from refs.
 * `docs` are Foundry documents (or test doubles) with flags.ashen-gate-manager.source.
 */
export function buildReferenceIndex(docs, moduleId = 'ashen-gate-manager') {
  const byId = new Map(), twins = new Map();
  for (const doc of docs ?? []) {
    const f = doc?.flags?.[moduleId] ?? {};
    const src = f.source, id = src?.sourceId;
    if (!id || f.lifecycle?.archived) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(doc);
    if (doc.documentName === 'Item') for (const ref of src.refs ?? []) {
      const rel = ref?.relation ?? ref?.type, target = ref?.target_id ?? ref?.id;
      if (rel === 'also_available_as_journal' && typeof target === 'string') {
        if (!twins.has(target)) twins.set(target, []);
        if (!twins.get(target).includes(id)) twins.get(target).push(id);
      }
    }
  }
  return {byId, twins};
}

/** Ids to try for a reference, best first: the Item twin(s) of a handout journal, then the id itself. */
export function candidateIds(id, twins = new Map()) {
  const out = [];
  if (/^HANDOUT-/.test(id)) out.push(...(twins.get(id) ?? []), `ITEM-${id}`);
  out.push(id);
  return [...new Set(out)];
}

/** May this viewer see this document? GM: yes. Player: Observer permission and a record that is not GM-only. */
export function canSee(doc, viewer, moduleId = 'ashen-gate-manager') {
  if (!doc || !viewer) return false;
  if (viewer.isGM) return true;
  if (doc.flags?.[moduleId]?.source?.visibility === 'gm') return false;
  try { return Boolean(doc.testUserPermission?.(viewer, 'OBSERVER')); } catch { return false; }
}

/**
 * What one viewer gets for one reference. Pure.
 * ctx: {viewer, index (buildReferenceIndex), codex: Map npcId -> name of NPCs the Codex reveals to this player (null = unknown)}
 * A quest, order or contract (QUEST-/ORDER-/CONTRACT-) lives in the Quest Log, not in the world's documents: `quest(id)` (0.69.0)
 * returns its name when this viewer may see it (null otherwise) and it opens in the Quest Log.
 * Returns {mode: 'sheet', uuid, name, icon, documentName} | {mode: 'codex', npc, name, icon} | {mode: 'quest', quest, name, icon} | {mode: 'text', name}.
 */
export function resolveReference(id, label, {viewer, index, codex = null, quest = null, moduleId = 'ashen-gate-manager'} = {}) {
  const fallback = {mode: 'text', name: authorLabel(label) || neutralLabel(id)};
  if (QUEST_ID.test(String(id ?? '')) && ID_LIKE.test(id)) {
    let name = '';
    try { name = String(quest?.(id) ?? '').trim(); } catch { name = ''; }
    return name ? {mode: 'quest', quest: id, name, icon: ICONS.quest} : fallback;
  }
  if (!ID_LIKE.test(String(id ?? '')) || !index) return fallback;
  for (const cid of candidateIds(id, index.twins)) {
    const docs = index.byId.get(cid) ?? [];
    for (const doc of docs) {
      const name = String(doc.name ?? '').trim();
      if (doc.documentName === 'Actor' && !viewer?.isGM) {
        // Players: an NPC opens the Codex only when the Codex reveals it to them, under the name the Codex gives.
        const known = codex?.get?.(cid);
        if (known) return {mode: 'codex', npc: cid, name: String(known), icon: ICONS.codex};
        if (canSee(doc, viewer, moduleId) && name) return {mode: 'sheet', uuid: doc.uuid, name, icon: ICONS.Actor, documentName: 'Actor'};
        continue;
      }
      if (!canSee(doc, viewer, moduleId) || !name) continue;
      return {mode: 'sheet', uuid: doc.uuid, name, icon: ICONS[doc.documentName] ?? 'fa-solid fa-link', documentName: doc.documentName};
    }
  }
  return fallback;
}

/** Markup for a resolved reference. Text mode carries no id or uuid. */
export function referenceHtml(r) {
  if (r.mode === 'sheet') return `<a href="#" class="agm-ref-link" data-ag-ref-open="sheet" data-ag-ref-uuid="${esc(r.uuid)}" data-tooltip="${esc(`Open ${r.name}`)}"><i class="${esc(r.icon)}" aria-hidden="true"></i> ${esc(r.name)}</a>`;
  if (r.mode === 'codex') return `<a href="#" class="agm-ref-link" data-ag-ref-open="codex" data-ag-ref-npc="${esc(r.npc)}" data-tooltip="${esc(`Open ${r.name} in the NPC Codex`)}"><i class="${esc(r.icon)}" aria-hidden="true"></i> ${esc(r.name)}</a>`;
  if (r.mode === 'quest') return `<a href="#" class="agm-ref-link" data-ag-ref-open="quest" data-ag-ref-quest="${esc(r.quest)}" data-tooltip="${esc(`Open ${r.name} in the Quest Log`)}"><i class="${esc(r.icon)}" aria-hidden="true"></i> ${esc(r.name)}</a>`;
  return `<span class="agm-ref-text">${esc(r.name)}</span>`;
}

/** Plain-text-safe token for rich text. The label is what any reader without Manager sees (never empty, never an id). */
export function referenceToken(id, label) {
  return `@AGRef[${id}]{${authorLabel(label) || neutralLabel(id)}}`;
}

const LEGACY_SECTION = /<section\b[^>]*\bdata-ag-managed-links="1"[^>]*>[\s\S]*?<\/section>/g;
const LEGACY_ITEM = new RegExp(`<li>\\s*(?:<span>([^<]*)</span>)?\\s*@UUID\\[[^\\]]+\\]\\{(${ID})\\}\\s*</li>`, 'g');
const QUIET = new Set(['related', 'references', 'legacy_reference']);
/**
 * Older imports' "References" section -> a "Related" list of @AGRef links. Only the section Manager marked
 * (data-ag-managed-links="1") is touched; the marker stays so a later import still recognises it. Idempotent.
 * `relationLabel(token)` gives the friendly relation wording; plain "related"/"references" get no prefix.
 */
export function convertLegacyBlock(html, relationLabel = t => t) {
  if (typeof html !== 'string' || !html.includes('data-ag-managed-links')) return html;
  return html.replace(LEGACY_SECTION, section => {
    if (!LEGACY_ITEM.test(section)) return section;
    LEGACY_ITEM.lastIndex = 0;
    const items = [...section.matchAll(LEGACY_ITEM)].map(m => {
      const rel = String(m[1] ?? '').replace(/:\s*$/, '').trim();
      const prefix = rel && !QUIET.has(rel) ? `${esc(relationLabel(rel))}: ` : '';
      return `<li>${prefix}@AGRef[${m[2]}]{${neutralLabel(m[2])}}</li>`;
    });
    return `<section class="ag-managed-links" data-ag-managed-links="1"><h4>Related</h4><ul>${items.join('')}</ul></section>`;
  });
}

/**
 * Foundry glue. `getDocs()` -> the world's Items, JournalEntries, Actors, RollTables; `codexNames()` -> Promise<Map|null>
 * (player only; the NPCs the Codex reveals to this user); `openCodex(npcId)`; `fromUuid`; `notify(text)`.
 */
export function createReferenceLinks({game, moduleId = 'ashen-gate-manager', getDocs, codexNames = async () => null,
  openCodex = async () => {}, questName = () => null, openQuest = async () => {}, fromUuid = async () => null, notify = () => {}, now = () => Date.now()}) {
  let index = null, codexCache = null;
  const CODEX_TTL = 30000;
  const viewer = () => game.user ?? null;
  const getIndex = () => index ??= buildReferenceIndex(getDocs(), moduleId);
  async function codexFor() {
    if (viewer()?.isGM) return null;
    if (codexCache && now() - codexCache.at < CODEX_TTL) return codexCache.value;
    const value = codexNames().then(m => m instanceof Map ? m : null).catch(() => null);
    codexCache = {at: now(), value};
    return value;
  }
  const api = {
    /** Call when documents or permissions change (Foundry create/update/delete hooks). */
    invalidate() { index = null; },
    /** Call when the Codex may have changed for this player (Codex window refresh). */
    invalidateCodex() { codexCache = null; },
    async resolve(id, label) {
      const codex = /^NPC-|^CRE-/.test(String(id)) ? await codexFor() : null;
      return resolveReference(id, label, {viewer: viewer(), index: getIndex(), codex, quest: questName, moduleId});
    },
    /** TextEditor enricher: match = [token, id, label]. Returns an element (or null to leave the text). */
    async enrich(match) {
      let r;
      try { r = await api.resolve(match[1], match[2]); } catch { r = {mode: 'text', name: authorLabel(match[2]) || neutralLabel(match[1])}; }
      const doc = globalThis.document;
      if (!doc?.createElement) return null;
      const holder = doc.createElement('span');
      holder.innerHTML = referenceHtml(r);
      return holder.firstElementChild;
    },
    /** Delegated click on a.agm-ref-link. Re-checks permission at click time; never throws. Returns what it did. */
    async onClick(event) {
      const link = event?.target?.closest?.('a.agm-ref-link[data-ag-ref-open]');
      if (!link) return null;
      event.preventDefault?.(); event.stopPropagation?.();
      try {
        if (link.dataset.agRefOpen === 'codex') {
          const npc = link.dataset.agRefNpc;
          if (!npc) return null;
          await openCodex(npc);
          return {opened: 'codex', npc};
        }
        if (link.dataset.agRefOpen === 'quest') {
          const quest = link.dataset.agRefQuest;
          // Re-checked now: the Quest Log answers for this viewer (a quest hidden since the page was drawn is not opened).
          if (!quest || !String(questName(quest) ?? '').trim()) { notify('That record is not available to you.'); return {opened: null}; }
          await openQuest(quest);
          return {opened: 'quest', quest};
        }
        const doc = await fromUuid(link.dataset.agRefUuid);
        if (!doc || !canSee(doc, viewer(), moduleId)) { notify('That record is not available to you.'); return {opened: null}; }
        const sheet = doc.sheet;
        if (!sheet?.render) { notify('That record cannot be opened here.'); return {opened: null}; }
        await sheet.render(true);
        return {opened: 'sheet', documentName: doc.documentName};
      } catch (error) {
        notify('That record could not be opened.');
        console.warn(`[${moduleId}] Reference link`, error);
        return {opened: null};
      }
    }
  };
  return api;
}
