/**
 * Sorting for the "Browse compendiums…" picker behind Add spell… / Add item… / Add attack… (0.52.0).
 * The picker is dnd5e's own CompendiumBrowser (dnd5e 6.0.6 loads the whole filtered index, sorts it by name and renders it
 * 50 rows at a time as you scroll). This file does not replace it: it opens a thin subclass that
 *   1. adds a "Sort by" select and a Descending toggle above the results,
 *   2. hands the browser's own fetch() a comparator, so the WHOLE filtered result set is ordered before dnd5e batches it
 *      (not only the rows on screen), and asks the index for the few extra fields the sorts need,
 *   3. remembers the choice per user (client setting `browserSort`, spells and items separately).
 * Nothing here is a rule: the keys are dnd5e's own index data (level, school, rarities, price...), only ordered.
 * If this dnd5e has no such browser, or the subclass cannot be built, item-add.mjs falls back to selectOne unchanged.
 */
import {MODULE_ID, esc} from './constants.mjs';

export const SORT_SETTING = 'browserSort';

/** [key, label] in menu order. */
export const SPELL_SORTS = Object.freeze([['name', 'Name'], ['level', 'Level'], ['school', 'School'], ['casting', 'Casting time'], ['range', 'Range'], ['concentration', 'Concentration'], ['ritual', 'Ritual'], ['source', 'Source']]);
export const ITEM_SORTS = Object.freeze([['name', 'Name'], ['type', 'Item type'], ['rarity', 'Rarity'], ['price', 'Price'], ['weight', 'Weight'], ['source', 'Source']]);
export const SORTS = Object.freeze({spell: SPELL_SORTS, item: ITEM_SORTS});
/** First open: spells by level then name, items by name. */
export const DEFAULT_CHOICE = Object.freeze({spell: Object.freeze({key: 'level', dir: 'asc'}), item: Object.freeze({key: 'name', dir: 'asc'})});

/** Extra index fields each kind needs (the browser already indexes system.source). */
export const INDEX_FIELDS = Object.freeze({
  spell: ['system.level', 'system.school', 'system.activation.type', 'system.activation.value', 'system.range.value', 'system.range.units', 'system.properties'],
  item: ['system.rarities', 'system.price.value', 'system.price.denomination', 'system.weight.value', 'system.weight.units']
});

const PHYSICAL = new Set(['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container']);
/** 'spell' for a spell-only picker, 'item' when any physical type is offered, else null (features: no sort control). */
export function kindFor(types) {
  const list = [...(types ?? [])];
  if (!list.length) return null;
  if (list.every(t => t === 'spell')) return 'spell';
  return list.some(t => PHYSICAL.has(t)) ? 'item' : null;
}

/* ---------- keys ---------- */
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'veryrare', 'legendary', 'artifact'];
const RARITY_LABEL = {common: 'Common', uncommon: 'Uncommon', rare: 'Rare', veryrare: 'Very rare', legendary: 'Legendary', artifact: 'Artifact'};
const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
const list = v => v == null ? [] : typeof v === 'string' ? [v] : typeof v[Symbol.iterator] === 'function' ? [...v] : Object.keys(v);
const num = v => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/** common 0 ... artifact 5 (dnd5e keys 'veryRare', 'very rare' and 'very-rare' all work); the lowest of several; null = none. */
export function rarityRank(value) {
  let best = null;
  for (const r of list(value)) { const i = RARITY_ORDER.indexOf(slug(r)); if (i >= 0 && (best == null || i < best)) best = i; }
  return best;
}
const GP_PER = {pp: 0.1, gp: 1, ep: 2, sp: 10, cp: 100};   // dnd5e's currencies.conversion: how many of the coin make 1 gp
/** Price in gp across cp/sp/ep/gp/pp. 0, empty or an unknown coin is "no price" (null). */
export function priceGp(price) {
  const value = num(price?.value);
  if (value == null || value <= 0) return null;
  const denom = price?.denomination || 'gp';
  const per = num(globalThis.CONFIG?.DND5E?.currencies?.[denom]?.conversion) ?? GP_PER[denom];
  return per ? value / per : null;
}
const LB_PER = {lb: 1, tn: 2000, kg: 2.5, Mg: 2500};
/** Weight in pounds (dnd5e's weightUnits.conversion). Null when the item has no number. */
export function weightLb(weight) {
  const value = num(weight?.value);
  if (value == null) return null;
  const per = num(globalThis.CONFIG?.DND5E?.weightUnits?.[weight?.units]?.conversion) ?? LB_PER[weight?.units] ?? 1;
  return value * per;
}
const CAST_ORDER = ['action', 'bonus', 'reaction', 'minute', 'hour', 'day', 'longRest', 'shortRest', 'special'];
const FT_PER = {ft: 1, mi: 5280, m: 10 / 3, km: 10000 / 3};
/** Range in feet: Self 0, Touch 1, then distance; Sight/Unlimited last of the numbers; Special or nothing = null. */
export function rangeFeet(range) {
  const units = range?.units;
  if (!units) return null;
  if (units === 'self') return 0;
  if (units === 'touch') return 1;
  if (units === 'any') return 1e12;
  const per = num(globalThis.CONFIG?.DND5E?.movementUnits?.[units]?.conversion) ?? FT_PER[units];
  const value = num(range.value);
  return per && value != null ? value * per : null;
}

const collator = () => { try { return new Intl.Collator(globalThis.game?.i18n?.lang || undefined, {numeric: true, sensitivity: 'base'}); } catch { return new Intl.Collator(); } };
const label = (table, key, fallback) => {
  const raw = table?.[key]?.label ?? table?.[key];
  let text = null;
  try { text = typeof raw === 'string' ? globalThis.game?.i18n?.localize?.(raw) : null; } catch { text = null; }
  if (text && text !== raw) return text;
  return typeof raw === 'string' && raw && !/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$/.test(raw) ? raw : fallback;   // a plain name stays; an untranslated key shows the short key
};
const schoolName = key => key ? label(globalThis.CONFIG?.DND5E?.spellSchools, key, String(key)) : null;
const sourceName = system => {
  const s = system?.source; if (s == null) return null;
  const raw = typeof s === 'string' ? s : (s.value || s.custom || s.book || '');
  if (!raw) return null;
  return globalThis.CONFIG?.DND5E?.sourceBooks?.[raw] ?? raw;
};
/** "dnd5e.spells" from Compendium.dnd5e.spells.Item.abc (ties inside one source group by pack). */
export const packOf = uuid => { const p = String(uuid ?? '').split('.'); return p[0] === 'Compendium' && p.length > 2 ? `${p[1]}.${p[2]}` : ''; };
const ITEM_TYPE_ORDER = ['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container'];
const flagFirst = flag => flag ? 0 : 1;

/** The ordered key list for one entry under one sort; number | string | null each (null = missing, always last). */
export function sortKeys(kind, key, entry) {
  const s = entry?.system ?? {}, name = String(entry?.name ?? '');
  if (kind === 'spell') {
    const level = num(s.level), props = list(s.properties).map(slug);
    const cast = s.activation?.type ? (CAST_ORDER.indexOf(s.activation.type) + 1 || CAST_ORDER.length + 1) : null;
    switch (key) {
      case 'level': return [level, name];
      case 'school': return [schoolName(s.school), level, name];
      case 'casting': return [cast, cast == null ? null : (num(s.activation.value) ?? 0), level, name];
      case 'range': return [rangeFeet(s.range), level, name];
      case 'concentration': return [flagFirst(props.includes('concentration')), level, name];
      case 'ritual': return [flagFirst(props.includes('ritual')), level, name];
      case 'source': return [sourceName(s), packOf(entry?.uuid), name];
      default: return [name];
    }
  }
  const rarity = rarityRank(s.rarities ?? s.rarity), price = priceGp(s.price);
  switch (key) {
    case 'type': { const i = ITEM_TYPE_ORDER.indexOf(entry?.type); return [i < 0 ? ITEM_TYPE_ORDER.length : i, i < 0 ? String(entry?.type ?? '') : '', name]; }
    case 'rarity': return [rarity, price, name];
    case 'price': return [price, rarity, name];
    case 'weight': return [weightLb(s.weight), name];
    case 'source': return [sourceName(s), packOf(entry?.uuid), name];
    default: return [name];
  }
}

/**
 * A comparator for Array#sort. Keys are worked out once per entry (WeakMap), not on every comparison. Only the first key
 * follows the direction; later keys are the tie-breakers and always run A to Z / low to high. A missing value sorts last in
 * both directions. Equal entries keep their incoming order (Array#sort is stable).
 */
export function makeComparator(kind, choice) {
  const key = choice?.key ?? 'name', sign = choice?.dir === 'desc' ? -1 : 1, cache = new WeakMap(), c = collator();
  const keys = e => { let k = cache.get(e); if (!k) cache.set(e, k = sortKeys(kind, key, e)); return k; };
  return (a, b) => {
    const ka = keys(a), kb = keys(b);
    for (let i = 0; i < ka.length; i++) {
      const x = ka[i], y = kb[i];
      if (x == null && y == null) continue;
      if (x == null) return 1;
      if (y == null) return -1;
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : c.compare(String(x), String(y));
      if (d) return i === 0 ? d * sign : d;
    }
    return 0;
  };
}
export const sortEntries = (kind, entries, choice) => [...entries].sort(makeComparator(kind, choice));

/** Short facts under a row's name, so the order can be seen: "Level 3 · Evocation", "Rare · 500 gp". */
export function entrySummary(kind, entry) {
  const s = entry?.system ?? {};
  if (kind === 'spell') {
    const level = num(s.level), school = schoolName(s.school);
    return [level == null ? '' : level === 0 ? 'Cantrip' : `Level ${level}`, school ?? ''].filter(Boolean).join(' · ');
  }
  const r = rarityRank(s.rarities ?? s.rarity), gp = priceGp(s.price);
  const money = !gp ? '' : s.price?.denomination && s.price.denomination !== 'gp' ? `${s.price.value} ${s.price.denomination}` : `${s.price.value} gp`;
  return [r == null ? '' : RARITY_LABEL[RARITY_ORDER[r]], money].filter(Boolean).join(' · ');
}

/* ---------- the remembered choice ---------- */
export function registerBrowserSortSetting(settings) {
  settings.register(MODULE_ID, SORT_SETTING, {scope: 'client', config: false, type: Object, default: {}});
}
/** {key, dir} for a kind, always valid; a missing or unknown saved value falls back to the default. */
export function loadChoice(kind) {
  let v = null;
  try { v = globalThis.game?.settings?.get?.(MODULE_ID, SORT_SETTING)?.[kind]; } catch { v = null; }
  const d = DEFAULT_CHOICE[kind];
  return {key: SORTS[kind].some(([k]) => k === v?.key) ? v.key : d.key, dir: v?.dir === 'desc' ? 'desc' : v?.dir === 'asc' ? 'asc' : d.dir};
}
export async function saveChoice(kind, choice) {
  if (!SORTS[kind]) return {ok: false, error: 'Unknown sort.'};
  const next = {key: SORTS[kind].some(([k]) => k === choice?.key) ? choice.key : DEFAULT_CHOICE[kind].key, dir: choice?.dir === 'desc' ? 'desc' : 'asc'};
  let all = {};
  try { const cur = globalThis.game?.settings?.get?.(MODULE_ID, SORT_SETTING); all = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {}; } catch { all = {}; }
  try { await globalThis.game?.settings?.set?.(MODULE_ID, SORT_SETTING, {...all, [kind]: next}); } catch (err) { console.warn(`${MODULE_ID} | sort choice not saved`, err); }
  return {ok: true, result: next};
}

/* ---------- markup ---------- */
/** The Sort by select and the Descending toggle (a kit chip: aria-pressed is true while descending). */
export function sortBarHtml(kind, choice, id = 'agch-bsort') {
  const desc = choice.dir === 'desc';
  return `<div class="agch-bsort" role="group" aria-label="Sort results">`
    + `<label class="agch-bsort__label" for="${esc(id)}-key">Sort by</label>`
    + `<select id="${esc(id)}-key" data-ag-sort="key">${SORTS[kind].map(([k, l]) => `<option value="${k}"${k === choice.key ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`
    + `<button type="button" class="ag-chip agch-bsort__dir" data-ag-sort="dir" aria-pressed="${desc}" data-tooltip="Reverse the order">`
    + `<i class="fa-solid ${desc ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-short-wide'}" aria-hidden="true"></i><span>Descending</span></button>`
    + `</div>`;
}
/** Wires a rendered bar. onChange({key?, dir?}) gets what changed. */
export function bindSortBar(root, onChange) {
  root.querySelector('[data-ag-sort="key"]')?.addEventListener('change', e => onChange({key: e.currentTarget.value}));
  root.querySelector('[data-ag-sort="dir"]')?.addEventListener('click', e => onChange({dir: e.currentTarget.getAttribute('aria-pressed') === 'true' ? 'asc' : 'desc'}));
}

/* ---------- the browser subclass ---------- */
/** True when this dnd5e's CompendiumBrowser has the pieces the subclass relies on. */
export const canSort = B => typeof B === 'function' && typeof B.fetch === 'function' && typeof B.prototype?._prepareResultsContext === 'function'
  && typeof B.prototype?._attachPartListeners === 'function' && typeof B.prototype?._renderResult === 'function';

const classes = new WeakMap();
export function sortedBrowserClass(Base) {
  if (classes.has(Base)) return classes.get(Base);
  const Sorted = class AgSortedCompendiumBrowser extends Base {
    get _agKind() { return this.options?.agSort?.kind ?? null; }
    get _agChoice() { return this._agCurrent ??= loadChoice(this._agKind); }

    /** dnd5e calls CompendiumBrowser.fetch() synchronously from here; for that moment only, it gets our comparator and fields. */
    async _prepareResultsContext(context, options) {
      const kind = this._agKind;
      if (!kind) return super._prepareResultsContext(context, options);
      const original = Object.getOwnPropertyDescriptor(Base, 'fetch'), real = Base.fetch, cmp = makeComparator(kind, this._agChoice);
      Base.fetch = function(documentClass, opts = {}) {
        return real.call(this, documentClass, {...opts, sort: cmp, indexFields: new Set([...(opts.indexFields ?? []), ...INDEX_FIELDS[kind]])});
      };
      let pending;
      try { pending = super._prepareResultsContext(context, options); } finally { if (original) Object.defineProperty(Base, 'fetch', original); else delete Base.fetch; }
      return pending;
    }

    _attachPartListeners(partId, htmlElement, options) {
      super._attachPartListeners(partId, htmlElement, options);
      const kind = this._agKind;
      if (!kind || partId !== 'results') return;
      const host = htmlElement.querySelector?.('.inventory-element') ?? htmlElement;
      host.insertAdjacentHTML('afterbegin', sortBarHtml(kind, this._agChoice, `${this.id}-sort`));
      bindSortBar(host, change => this._agChange(change));
    }

    async _agChange(change) {
      const kind = this._agKind, next = {...this._agChoice, ...change};
      this._agCurrent = next;
      saveChoice(kind, next);
      const focus = change.key != null ? 'key' : 'dir';
      await this.render({parts: ['results']});
      this.element?.querySelector?.(`[data-ag-sort="${focus}"]`)?.focus?.();
    }

    async _renderResult(entry, documentClass) {
      const element = await super._renderResult(entry, documentClass);
      const kind = this._agKind;
      if (kind && documentClass === 'Item') {
        const sub = element?.querySelector?.('.subtitle'), text = entrySummary(kind, entry);
        if (sub && text) sub.textContent = `${sub.textContent} · ${text}`;
      }
      return element;
    }
  };
  classes.set(Base, Sorted);
  return Sorted;
}

/**
 * Opens the sorted browser and resolves the picked uuid (or null), as CompendiumBrowser.selectOne does. Returns
 * `undefined` without opening anything when the subclass could not be built, so the caller can use selectOne.
 */
export async function selectOneSorted(Base, options, kind) {
  let browser;
  try {
    const Sorted = sortedBrowserClass(Base);
    browser = new Sorted({...options, selection: {min: 1, max: 1}, agSort: {kind}});
  } catch (err) { console.warn(`${MODULE_ID} | sorted compendium browser not available`, err); return undefined; }
  const picked = await new Promise(resolve => {
    browser.addEventListener('close', () => resolve(browser.selected?.size ? browser.selected : null), {once: true});
    browser.render({force: true});
  });
  return picked?.size ? [...picked][0] : null;
}
