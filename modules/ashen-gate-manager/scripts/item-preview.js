/**
 * Item preview (0.38.0): selecting an Item in the Items tab shows dnd5e's own item card (Item5e#richTooltip, the
 * card the native sheet's tooltip uses) with where the item lives and its key attributes below. GM-only and
 * read-only; a compendium entry is loaded alone by uuid, never the whole pack. Pure builders so the Node suite
 * can check them; main.js mounts the markup.
 */
import {getPath} from './core.js';
import {coreRefOf} from './core-links.js';
import {ORIGINS, RARITIES, originOf, rarityKey} from './item-filters.js';

const MODULE_ID = 'ashen-gate-manager';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const str = v => v === undefined || v === null || v === '' ? null : String(v);

/** dnd5e's lazy tooltip: its tooltip manager sees the loading section, fetches the uuid and fills in richTooltip(). */
export function itemTooltipAttrs(uuid) {
  if (!uuid) return '';
  const html = `<section class="loading" data-uuid="${esc(uuid)}"><i class="fas fa-spinner fa-spin-pulse"></i></section>`;
  return ` data-tooltip-html="${esc(html)}" data-tooltip-class="item-tooltip" data-tooltip-direction="LEFT"`;
}

/** Folder names from the item's own folder up to the root, "/"-joined. Works for world and compendium folders. */
export function folderPathOf(folder, lookup = () => null) {
  const names = [];
  let f = folder && typeof folder === 'object' ? folder : lookup(folder);
  for (let n = 0; f && n < 20; n++) {
    if (f.name) names.unshift(f.name);
    const up = f.folder;
    f = up && typeof up === 'object' ? up : up ? lookup(up) : null;
  }
  return names.join('/');
}

const RULES = {2024: '2024 rules', 2014: '2014 rules'};
function sourceText(data) {
  const s = getPath(data, 'system.source');
  if (!s || typeof s !== 'object') return str(s);
  const parts = [str(s.book) ?? str(s.custom), s.page ? `p. ${s.page}` : null, RULES[s.rules] ?? (s.rules ? `${s.rules} rules` : null)].filter(Boolean);
  return parts.join(' · ') || null;
}
function priceText(data) {
  const p = getPath(data, 'system.price');
  if (p === undefined || p === null || p === '') return null;
  if (typeof p !== 'object') return str(p);
  return p.value || p.value === 0 ? `${p.value} ${p.denomination ?? 'gp'}` : null;
}
function weightText(data) {
  const w = getPath(data, 'system.weight');
  if (w === undefined || w === null || w === '') return null;
  if (typeof w !== 'object') return Number(w) ? `${w} lb` : null;
  return Number(w.value) ? `${w.value} ${w.units ?? 'lb'}` : null;
}
function attunementText(data) {
  const a = getPath(data, 'system.attunement');
  if (a === 'required' || a === 1) return 'Required';
  if (a === 'optional' || a === 2) return 'Optional';
  return null;
}
function typeText(data) {
  const sub = getPath(data, 'system.type.value');
  return [str(data?.type), str(sub)].filter(Boolean).join(' · ') || null;
}

/**
 * Where the item lives and its key attributes, as label/value rows (empty values left out). `entry` is the Browse
 * row (index data), `doc` the loaded document when there is one; the document wins where both have a value.
 */
export function previewFacts(entry = {}, doc = null) {
  const data = doc ?? entry.data ?? {};
  const packId = entry.packId ?? doc?.pack ?? null;
  const packLabel = entry.pack ?? doc?.compendium?.metadata?.label ?? packId;
  const where = packId ? `Compendium: ${packLabel}${packLabel !== packId ? ` (${packId})` : ''}${entry.locked || doc?.compendium?.locked ? ' · locked' : ''}` : 'World (Items sidebar)';
  const folder = doc ? folderPathOf(doc.folder) : null;
  const path = packId ? [packLabel, folder ?? (entry.folder ? String(entry.folder).split('/').slice(1).join('/') : '')].filter(Boolean).join('/') : (folder ?? entry.folder ?? '');
  const rarity = rarityKey(getPath(data, 'system.rarity')) ?? entry.rarity ?? null;
  const origin = doc ? originOf(doc, packId) : entry.origin;
  const ref = coreRefOf(data);
  const agId = str(getPath(data, `flags.${MODULE_ID}.source.sourceId`)) ?? (entry.ag ? str(entry.id) : null);
  return [
    ['Lives in', where],
    ['Folder path', path || '(no folder)'],
    ['UUID', str(doc?.uuid) ?? str(entry.uuid)],
    ['Type', typeText(data) ?? str(entry.docType)],
    ['Rarity', RARITIES[rarity] ?? null],
    ['Source', sourceText(data)],
    ['Origin', ORIGINS[origin] ?? null],
    ['core_ref', ref ? [ref.name, ref.source, ref.type, ref.rarity].filter(Boolean).join(' · ') : null],
    ['Ashen Gate id', agId],
    ['Price', priceText(data)],
    ['Weight', weightText(data)],
    ['Attunement', attunementText(data)]
  ].filter(([, v]) => v !== null && v !== undefined && v !== '').map(([label, value]) => ({label, value: String(value)}));
}

/** The dnd5e card (or a plain fallback) with the facts below it. `card` is richTooltip()'s {content, classes}. */
export function previewHtml({name = '', card = null, facts = [], note = ''} = {}) {
  const classes = (Array.isArray(card?.classes) ? card.classes : []).map(c => String(c).replace(/[^\w-]/g, '')).filter(Boolean).join(' ');
  const top = card?.content
    ? `<div class="agpreview-card ${classes}">${card.content}</div>`
    : `<p class="agmanager-tiny agpreview-nocard">${esc(note || `No dnd5e item card for ${name}.`)}</p>`;
  return `${top}<dl class="agpreview-facts">${facts.map(f => `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl>`;
}

/**
 * Loads one Item for the preview. GM-only. A world item comes from the already-loaded document; a compendium entry
 * is fetched alone by uuid (fromUuid loads that one document, not the pack). Returns null for anything not an Item.
 */
export async function loadItemPreview({game, entry = null, uuid = null, doc = null, fromUuid = null} = {}) {
  if (!game?.user?.isGM) throw new Error('Only the GM can preview items.');
  const id = uuid ?? entry?.uuid;
  if (!id) return null;
  if (entry && entry.kind !== 'Item') return null;
  if (!doc && typeof fromUuid === 'function') doc = await fromUuid(id);
  if (doc && doc.documentName && doc.documentName !== 'Item') return null;
  if (!doc && !entry) return null;
  let card = null, note = '';
  if (typeof doc?.richTooltip === 'function') {
    try { card = await doc.richTooltip(); } catch (error) { note = `The dnd5e item card could not be built: ${error?.message ?? error}`; }
  } else note = doc ? 'This item has no dnd5e item card (not a dnd5e item).' : `Could not load ${entry?.name ?? id}.`;
  return {name: doc?.name ?? entry?.name ?? '', card, note, facts: previewFacts(entry ?? {}, doc)};
}
