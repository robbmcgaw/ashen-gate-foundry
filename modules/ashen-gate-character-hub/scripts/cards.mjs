/**
 * Item rows as small cards with column headers (Combat, Inventory, Magic, Features). Every fact is read from dnd5e's
 * own prepared item data (item.labels, system.uses, weight, price): the Hub works out no rules of its own. A row shows
 * a short summary of the description; "More" opens the whole text in place (plain text, never HTML from the item).
 */
import {esc, num} from './constants.mjs';
import {toggleButton, bodyAttrs, sectionKey} from './collapse.mjs';
import {tooltipAttrs} from './tooltips.mjs';

// ---------- Description text ----------

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' '};
/**
 * Item description HTML → plain text. Paragraphs and line breaks become new lines; enricher links like
 * @UUID[...]{Name} keep their name and inline rolls like [[/r 1d6]] keep their formula. Tables read one row per line with the cells
 * separated by " | " (0.72.0; they used to run together). Never returns HTML.
 */
export function plainText(html) {
  return String(html ?? '')
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, '$1')
    .replace(/@\w+\[([^\]]*)\]/g, (m, ref) => ref.split(/[.#]/).pop())
    .replace(/\[\[\/?\w*\s*([^\]]*)\]\](\{([^}]*)\})?/g, (m, f, l, label) => label ?? f)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>\s*(?=<t[dh]\b)/gi, ' | ')   // 0.72.0: table cells of one row stay apart ("Cinder Type | Signature power"), not run together
    .replace(/<\/(p|div|li|h[1-6]|tr|caption|blockquote|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1)) || 32) : m))
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
export const SUMMARY_LENGTH = 140;
/** The first sentence or so of the description (whole words), and whether there is more to show. */
export function summaryOf(text, max = SUMMARY_LENGTH) {
  const first = String(text ?? '').split('\n').find(l => l.trim()) ?? '';
  if (first.length <= max) return {summary: first, more: first.length < String(text ?? '').trim().length};
  const cut = first.slice(0, max), at = cut.lastIndexOf(' ');
  return {summary: `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:.\s]+$/, '')}…`, more: true};
}

// ---------- Key facts (dnd5e's own labels) ----------

const str = v => (v === null || v === undefined ? '' : String(v)).trim();
const joinLabels = list => (Array.isArray(list) ? list : []).map(x => str(x?.label ?? x)).filter(Boolean).join(', ');
const damageText = labels => {
  const d = Array.isArray(labels?.damages) ? labels.damages : [];
  if (d.length) return d.map(x => str(x.label) || [str(x.formula), str(x.damageType && (globalThis.CONFIG?.DND5E?.damageTypes?.[x.damageType]?.label ?? x.damageType))].filter(Boolean).join(' ')).filter(Boolean).join(', ');
  return [str(labels?.damage), str(labels?.damageTypes)].filter(Boolean).join(' ');
};
const usesText = s => num(s?.uses?.max) > 0 ? `${num(s.uses.value, num(s.uses.max) - num(s.uses.spent))} / ${num(s.uses.max)}` : '';
const weightText = s => { const w = s?.weight, v = typeof w === 'object' ? num(w?.value) : num(w); return v ? `${v} ${str(typeof w === 'object' ? w?.units : '') || 'lb'}` : ''; };
const priceText = s => { try { const p = s?.priceLabel; if (p) return str(p); } catch {} const v = num(s?.price?.value); return v ? `${v} ${str(s?.price?.denomination) || 'gp'}` : ''; };

/** Every fact the Hub can show for an item, keyed by column. Empty strings are shown as "—". */
export function itemFacts(item) {
  const s = item?.system ?? {}, l = item?.labels ?? {};
  const concentration = item?.requiresConcentration === true || (s.properties?.has?.('concentration') ?? false);
  return {
    damage: damageText(l),
    toHit: str(l.toHit ?? l.modifier),
    range: [str(l.range), str(l.reach)].filter(Boolean).join(', '),
    properties: joinLabels(l.properties?.filter?.(p => p?.abbr !== 'concentration') ?? l.properties),
    activation: str(l.activation),
    uses: usesText(s),
    recovery: str(l.recharge ?? l.recovery),
    level: str(l.level),
    school: str(l.school),
    duration: str(l.concentrationDuration ?? l.duration),
    concentration,
    ritual: s.properties?.has?.('ritual') ?? false,
    components: str(l.components?.vsm),
    quantity: String(num(s.quantity, 1)),
    weight: weightText(s),
    value: priceText(s),
    type: str(l.featType ?? l.type)
  };
}

// ---------- Lists with column headers ----------

/**
 * Columns a list shows: {key, label} for a fact, rendered from row.facts[key] unless the column has its own
 * render(row). Every list also has the item (image + name + summary) first and Actions last.
 */
/** C (concentration) and R (ritual) badges: the letter is the visible text, the word is read out and shown on hover (0.51.0). */
export const flagBadges = f => `${f.concentration ? ' <span class="ag-badge agch-flag" data-tooltip="Concentration"><span aria-hidden="true">C</span><span class="ag-sr-only">Concentration</span></span>' : ''}${f.ritual ? ' <span class="ag-badge agch-flag" data-tooltip="Ritual"><span aria-hidden="true">R</span><span class="ag-sr-only">Ritual</span></span>' : ''}`;
export const COLUMNS = {
  damage: {key: 'damage', label: 'Damage'},
  toHit: {key: 'toHit', label: 'To hit'},
  range: {key: 'range', label: 'Range'},
  properties: {key: 'properties', label: 'Properties'},
  activation: {key: 'activation', label: 'Use time'},
  uses: {key: 'uses', label: 'Uses'},
  recovery: {key: 'recovery', label: 'Recovery'},
  level: {key: 'level', label: 'Level'},
  school: {key: 'school', label: 'School'},
  castTime: {key: 'activation', label: 'Casting'},
  duration: {key: 'duration', label: 'Duration', render: r => `${esc(r.facts.duration || '—')}${flagBadges(r.facts)}`, late: true},
  components: {key: 'components', label: 'Components', late: true},
  quantity: {key: 'quantity', label: 'Qty'},
  weight: {key: 'weight', label: 'Weight'},
  value: {key: 'value', label: 'Value'},
  type: {key: 'type', label: 'Type'}
};

/** `col.cls` adds a class (Magic's fixed-width columns, 0.55.0); `col.tip` puts the plain value in a tooltip, since the cell may be cut with an ellipsis. */
const tipOf = (col, row) => (typeof col.tip === 'function' ? col.tip(row) : col.tip ? row.facts?.[col.key] : '');
export const cell = (col, row) => `<span class="agch-card__fact${col.late ? ' agch-card__fact--late' : ''}${col.cls ? ` ${col.cls}` : ''}" data-label="${esc(col.label)}"${tipOf(col, row) ? ` data-tooltip="${esc(tipOf(col, row))}"` : ''}>${col.render ? col.render(row) : esc(row.facts?.[col.key] || '—')}</span>`;

/**
 * One item card. `expanded` (Set of item ids) keeps "More" open across re-renders. `lead` is HTML before the image
 * (a container's fold toggle), `star` the favourite button, `controls` the row's actions, `extra` HTML after the card
 * (a container's contents). `iconUse` (0.42.0): the user can edit the character, so the icon is a Use button (iconHtml).
 */
/**
 * The item's icon (0.42.0). For someone who can edit the character it is a button: it uses the item (dnd5e's item.use,
 * the activity chooser when there are several), like a quick-bar slot; an item with nothing to use (no activities)
 * opens the item, as the name does. Observers get the plain image. The image inside never starts a drag of its own, so
 * dragging the row still works.
 */
export function iconHtml(row, editable) {
  const img = `<img class="agch-item__img" src="${esc(row.img)}" alt=""${editable ? ' draggable="false"' : ''}>`;
  if (!editable) return img;
  return row.usable
    ? `<button type="button" class="agch-item__icon" data-action="item-use" data-id="${esc(row.id)}" aria-label="${esc(`Use ${row.name}`)}" data-tooltip="Use">${img}</button>`
    : `<button type="button" class="agch-item__icon" data-action="item-sheet" data-id="${esc(row.id)}" aria-label="${esc(`Open ${row.name}`)}" data-tooltip="Nothing to use: opens the item">${img}</button>`;
}
export function cardHtml(row, columns, {controls = '', lead = '', star = '', badges = '', alt = false, expanded = null, listKey = '', iconUse = false} = {}) {
  const detailKey = sectionKey('more', listKey, row.id), open = expanded?.has?.(detailKey) === true;
  // 0.36.0: an activity recipe's effect note: a badge whose tooltip holds the note; the same text is in the row (summary or More).
  if (row.effectNote) badges = `<span class="ag-badge ag-badge--accent agch-effect-badge" data-tooltip="${esc(`Effect (the GM decides): ${row.effectNote}`)}"><i class="fa-solid fa-wand-sparkles" aria-hidden="true"></i> Effect</span>${badges}`;
  const more = row.more ? `<button type="button" class="agch-card__more" data-action="item-more" data-id="${esc(row.id)}" data-key="${esc(detailKey)}" data-ag-always aria-expanded="${open}" aria-controls="${esc(detailKey)}">${open ? 'Less' : 'More'}</button>` : '';
  return `<li class="agch-card${alt ? ' is-alt' : ''}${row.equipped ? ' is-equipped' : ''}${row.rarity ? ' has-rarity ag-rarity-edge' : ''}" data-item-id="${esc(row.id)}"${row.fullName ? ` data-fullname="${esc(row.fullName)}"` : ''}${row.rarity ? ` data-rarity="${row.rarity}"` : ''}${row.uuid ? ` draggable="true" data-drag-uuid="${esc(row.uuid)}"` : ''}>
    <span class="agch-card__lead">${lead}${star}</span>
    ${iconHtml(row, iconUse)}
    <span class="agch-card__main"><button type="button" class="agch-item__name" data-action="item-sheet" data-id="${esc(row.id)}" data-ag-always${tooltipAttrs(row.uuid, `Open ${row.name}`)} aria-label="${esc(`Open ${row.name}`)}">${esc(row.name)}</button>${badges ? `<span class="agch-item__badges">${badges}</span>` : ''}
      ${row.summary ? `<span class="agch-card__summary">${esc(row.summary)} ${more}</span>` : more}</span>
    ${columns.map(c => cell(c, row)).join('')}
    <span class="agch-item__controls agch-card__actions">${controls}</span>
    ${row.more ? `<div class="agch-card__detail" id="${esc(detailKey)}"${open ? '' : ' hidden'}>${esc(row.details)}</div>` : ''}</li>`;
}

/** Column header row for a list. */
export const headHtml = columns => `<li class="agch-card__headrow" aria-hidden="true"><span></span><span></span><span>Item</span>${columns.map(c => `<span${c.cls ? ` class="${c.cls}"` : ''}>${esc(c.label)}</span>`).join('')}<span>Actions</span></li>`;

/**
 * A list of cards with a header row and stripes. `card(row, i)` returns a row's card options; `after(row)` adds HTML
 * after a row (container contents). Stripes count only item rows.
 */
export function cardList(rows, columns, {card = () => ({}), after = () => '', listKey = '', expanded = null, cls = ''} = {}) {
  let i = 0;
  const body = rows.map(r => cardHtml(r, columns, {alt: (i++ % 2) === 1, expanded, listKey, ...card(r)}) + after(r)).join('');
  return `<ul class="ag-list agch-cards${cls ? ` ${cls}` : ''}" style="--agch-cols:${columns.length}">${headHtml(columns)}${body}</ul>`;
}

/** A container's fold toggle and the attributes for its contents row (fold state shared with 0.10.0 sections). */
export const containerKey = row => sectionKey('container', row.id);
export const containerLead = row => row.contents?.length ? toggleButton(containerKey(row), row.name, {icon: true}) : '';
export const containerAttrs = row => bodyAttrs(containerKey(row));
