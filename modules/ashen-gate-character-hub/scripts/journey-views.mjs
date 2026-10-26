/**
 * Journey tab (0.20.0): the character's accomplishments, newest first. Players see their own character's
 * visible entries. The GM sees every character's journey (character picker), hidden entries too, and can add GM
 * notes (text and an optional date), edit any entry, hide or show it, and delete GM notes.
 * 0.38.0: two kit sub-tabs, Journey (the log) and Biography (dnd5e's Biography page, biography.mjs); the choice is
 * remembered per user on this device (sheet.journeyView, kit uiState).
 */
import {esc} from './constants.mjs';
import {btn} from './buttons.mjs';
import {journeyFor, canRead, partyActors, TYPES, TEXT_MAX, displayType} from './journey.mjs';
import {subTabs, tabPanelAttrs} from './ag-html.mjs';
import {biographyFor, isBioDirty} from './biography.mjs';

const ICONS = {level: 'fa-solid fa-arrow-up-right-dots', renown: 'fa-solid fa-flag', piety: 'fa-solid fa-hands-praying', quest: 'fa-solid fa-scroll', reward: 'fa-solid fa-coins', cinder: 'fa-solid fa-fire', manual: 'fa-solid fa-feather-pointed'};
const when = e => e.date ?? (e.at ? new Date(e.at).toISOString().slice(0, 10) : '');

/** The character whose journey is shown: this sheet's, or (GM) the one picked. */
export function journeyActor(ctx) {
  const gm = globalThis.game?.user?.isGM === true, picked = ctx.sheet?.journeyActorId;
  return gm && picked ? globalThis.game?.actors?.get?.(picked) ?? ctx.actor : ctx.actor;
}

/** A reward's item pictures (0.25.0): image, name as alt text, name and quantity as the tooltip. Never ids. */
function rewardItems(e) {
  const list = Array.isArray(e.data?.items) ? e.data.items.filter(i => typeof i?.name === 'string' && i.name) : [];
  if (!list.length) return '';
  return ` <span class="agch-journey__items">${list.map(i => {
    const tip = Number(i.quantity) > 1 ? `${i.quantity} × ${i.name}` : i.name;
    return `<img src="${esc(i.img || 'icons/svg/item-bag.svg')}" alt="${esc(i.name)}" data-tooltip="${esc(tip)}">`;
  }).join('')}</span>`;
}

/**
 * The entry's text and date fields (0.34.0). The forms were nested <form> elements inside the sheet's own <form>, which
 * the browser drops while parsing, so Add entry could not find the text it had to read ("Write something for the entry").
 * They are plain groups now, and the text is a labelled box, so it is clear where the entry is typed.
 */
const textField = (value, placeholder = '') => `<label class="agch-journey__field agch-journey__field--text"><span>Entry</span><textarea name="text" rows="2" maxlength="${TEXT_MAX}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}>${esc(value)}</textarea></label>`;
const dateField = value => `<label class="agch-journey__field"><span>Date (optional)</span><input type="date" name="date" value="${esc(value)}"></label>`;

function row(e, gm, editing) {
  const controls = gm ? `<span class="agch-journey__ctl">${btn('journey-edit', '', {kind: 'ghost', icon: 'fa-solid fa-pen', data: {id: e.id}, title: 'Edit'})}
    ${btn(e.hidden ? 'journey-show' : 'journey-hide', '', {kind: 'ghost', icon: e.hidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash', data: {id: e.id}, title: e.hidden ? 'Show to the player' : 'Hide from the player'})}
    ${e.manual ? btn('journey-delete', '', {kind: 'ghost', icon: 'fa-solid fa-trash', data: {id: e.id}, title: 'Delete this GM note'}) : ''}</span>` : '';
  if (editing) return `<li class="agch-journey__entry is-editing" data-entry="${esc(e.id)}"><div class="agch-journey__form" data-journey-form="edit" role="group" aria-label="Edit entry">
    ${textField(e.text)}${dateField(e.date ?? '')}
    <span class="agch-journey__formbtns">${btn('journey-cancel', 'Cancel', {kind: 'ghost'})}${btn('journey-save', 'Save Changes', {kind: 'primary', data: {id: e.id}})}</span></div></li>`;
  return `<li class="agch-journey__entry${e.hidden ? ' is-hidden' : ''}" data-entry="${esc(e.id)}" data-type="${esc(displayType(e))}">
    <i class="${ICONS[displayType(e)] ?? 'fa-solid fa-circle'} agch-journey__icon" data-tooltip="${esc(TYPES[displayType(e)] ?? e.type)}" aria-hidden="true"></i>
    <span class="agch-journey__when">${esc(when(e))}</span><span class="agch-journey__text">${esc(e.text)}${rewardItems(e)}${e.hidden ? ' <span class="ag-gm-flag"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> Hidden from player</span>' : ''}</span>${controls}</li>`;
}

export function journeyPanel(ctx) {
  const gm = globalThis.game?.user?.isGM === true, actor = journeyActor(ctx);
  const head = `<p class="agch-journey__intro">Accomplishments are recorded from now on: level-ups, Renown and Piety rank changes, completed quests${gm ? ', and your own notes' : ''}.</p>`;
  if (!canRead(actor)) return `${head}<div class="ag-empty"><p class="ag-empty__title">This Journey is private.</p><p class="ag-empty__text">Only this character's owner and the GM can see it.</p></div>`;
  const picker = gm ? `<label class="agch-orgsel"><span>Character</span><select data-edit="journey-actor" aria-label="Show the Journey of">${[...new Map([ctx.actor, ...partyActors()].filter(Boolean).map(a => [a.id, a])).values()]
    .map(a => `<option value="${esc(a.id)}"${a.id === actor.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : '';
  const add = gm ? `<div class="agch-journey__form agch-journey__add" data-journey-form="add" role="group" aria-label="Add a GM note to ${esc(actor.name)}'s Journey">
      ${textField('', `What happened? A GM note for ${actor.name}'s Journey`)}${dateField('')}<label class="agch-journey__hide"><input type="checkbox" name="hidden"> Hidden from player</label>
      ${btn('journey-add', 'Add entry', {kind: 'primary', icon: 'fa-solid fa-plus'})}</div>` : '';
  const entries = journeyFor(actor), editing = ctx.sheet?.journeyEdit ?? null;
  const list = entries.length ? `<ol class="agch-journey" aria-label="${esc(actor.name)}'s Journey, newest first">${entries.map(e => row(e, gm, gm && editing === e.id)).join('')}</ol>`
    : '<div class="ag-empty"><i class="fa-solid fa-book-open" aria-hidden="true"></i><p class="ag-empty__title">No accomplishments yet.</p><p class="ag-empty__text">Level-ups, Renown and Piety ranks and completed quests show here as they happen.</p></div>';
  return `${head}${gm ? `<div class="ag-toolbar agch-toolbar">${picker}</div>${add}` : ''}${list}`;
}

// ---------- Biography (0.38.0) ----------

export const JOURNEY_VIEWS = [{id: 'journey', label: 'Journey'}, {id: 'biography', label: 'Biography'}];
const viewOf = sheet => JOURNEY_VIEWS.some(v => v.id === sheet?.journeyView) ? sheet.journeyView : 'journey';
/** Plain text as dnd5e shows it read-only: escaped, line breaks kept. */
const plain = text => esc(text).replace(/\r?\n/g, '<br>');
const fieldId = (ctx, key) => `${String(ctx.sheet?.id ?? 'agch').replace(/[^A-Za-z0-9_-]/g, '')}-bio-${key.replace(/[^A-Za-z0-9]/g, '-')}`;
/** True when Foundry's rich text editor element (<prose-mirror>, V13+) is there to edit HTML fields in place. */
export const richEditorAvailable = () => { try { return !!globalThis.customElements?.get?.('prose-mirror'); } catch { return false; } };
const HINTS = {'biography.value': 'Only you and the GM see this.', 'biography.public': 'Everyone who can see this character sees this.'};
const nativeLink = '<button type="button" class="ag-link agch-bio__native" data-action="open-native" data-ag-always><i class="fa-solid fa-file-lines" aria-hidden="true"></i>Open native sheet to edit formatting</button>';

/** One rich (HTML) field: shown enriched; edited with <prose-mirror> when Foundry offers it. */
function richField(ctx, f, edit, shown, draft) {
  const id = fieldId(ctx, f.key), html = shown[f.key] ?? f.value;
  const label = `<span class="agch-bio__label" id="${id}-label">${esc(f.label)}</span>`, hint = edit && HINTS[f.key] ? `<p class="ag-field__hint">${esc(HINTS[f.key])}</p>` : '';
  if (edit && richEditorAvailable()) {
    const value = draft.values[f.key] ?? f.source, uuid = ctx.actor?.uuid ? ` document-uuid="${esc(ctx.actor.uuid)}"` : '';
    return `<div class="ag-field agch-bio__rich" role="group" aria-labelledby="${id}-label">${label}<prose-mirror class="agch-bio__editor" name="system.details.${esc(f.key)}" data-bio="${esc(f.key)}" value="${esc(value)}"${uuid}></prose-mirror>${hint}</div>`;
  }
  const body = html ? `<div class="agch-bio__html">${html}</div>` : '<p class="agch-muted agch-bio__none">Nothing written yet.</p>';
  return `<div class="ag-field agch-bio__rich" role="group" aria-labelledby="${id}-label">${label}${body}${edit ? `${hint}${nativeLink}` : ''}</div>`;
}
/** One plain-text field: a text box (one line for a characteristic) or the text, read-only. */
function plainField(ctx, f, edit, draft, {line = false} = {}) {
  const id = fieldId(ctx, f.key), value = draft.values[f.key] ?? f.source;
  if (edit) {
    const box = line ? `<input type="text" id="${id}" data-bio="${esc(f.key)}" value="${esc(value)}">` : `<textarea id="${id}" data-bio="${esc(f.key)}" rows="3">${esc(value)}</textarea>`;
    return `<label class="ag-field${line ? '' : ' agch-bio__text'}" for="${id}"><span>${esc(f.label)}</span>${box}</label>`;
  }
  return `<div class="ag-field agch-bio__text"><span>${esc(f.label)}</span><p class="agch-bio__plain">${plain(f.value)}</p></div>`;
}
const section = (title, icon, body) => body ? `<section class="agch-bio__sec"><h3 class="agch-heading"><i class="${icon}" aria-hidden="true"></i> ${esc(title)}</h3>${body}</section>` : '';
const emptyState = (title, text) => `<div class="ag-empty"><i class="fa-solid fa-feather" aria-hidden="true"></i><p class="ag-empty__title">${esc(title)}</p><p class="ag-empty__text">${esc(text)}</p></div>`;

/**
 * Biography (0.38.0): Backstory, Personality and Appearance from dnd5e's Biography page. Owners and the GM edit it here
 * (Save Changes / Cancel in a footer pinned to the pane; typed text survives redraws); observers see the public parts
 * only (biography.mjs decides, so nothing private reaches this markup); limited viewers never get here.
 */
export function biographyPanel(ctx) {
  const bio = biographyFor(ctx.actor);
  if (!bio) return emptyState('This biography is private.', 'Only this character\'s owner and the GM can see it.');
  const edit = bio.access === 'owner' && ctx.editable === true, draft = ctx.sheet?.bioDraft?.actorId === ctx.actor?.id ? ctx.sheet.bioDraft : {values: {}};
  const shown = ctx.sheet?._bioShown?.actorId === ctx.actor?.id ? ctx.sheet._bioShown.html : {};
  const keep = list => edit ? list : list.filter(f => f.value);
  const backstory = keep(bio.backstory).map(f => richField(ctx, f, edit, shown, draft)).join('');
  const personality = keep(bio.personality).map(f => plainField(ctx, f, edit, draft)).join('');
  const looks = keep(bio.appearance).map(f => plainField(ctx, f, edit, draft)).join('');
  const chars = keep(bio.characteristics);
  const charHtml = !chars.length ? '' : edit ? `<div class="ag-form-grid agch-bio__chars">${chars.map(f => plainField(ctx, f, true, draft, {line: true})).join('')}</div>`
    : `<dl class="ag-kv agch-bio__chars">${chars.map(f => `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl>`;
  const body = `${section('Backstory', 'fa-solid fa-feather', backstory)}${section('Personality', 'fa-solid fa-masks-theater', personality)}${section('Appearance', 'fa-solid fa-image-portrait', `${looks}${charHtml}`)}`;
  if (!edit) {
    if (body) return `<div class="agch-bio">${body}</div>`;
    return bio.access === 'owner' ? emptyState('No biography yet.', 'Nothing has been written for this character yet.')
      : emptyState('Nothing shared yet.', 'This character has no public biography or appearance yet.');
  }
  if (!body) return emptyState('No biography fields.', 'This character\'s system has no Biography to edit.');
  const blank = [...bio.backstory, ...bio.personality, ...bio.appearance, ...bio.characteristics].every(f => !f.source);
  const dirty = isBioDirty(ctx.sheet);
  return `<div class="agch-bio agch-bio--edit" data-bio-form role="group" aria-label="${esc(ctx.actor?.name ?? 'Character')}'s biography">
    ${blank ? '<p class="agch-muted agch-bio__start">Nothing written yet. Type in any box, then Save Changes.</p>' : ''}${body}
    <div class="ag-footer agch-bio__footer">${btn('bio-cancel', 'Cancel', {kind: 'ghost'})}<span class="ag-footer__status" data-bio-status role="status" aria-live="polite"${dirty ? ' data-ag-dirty="true"' : ''}>${dirty ? 'Unsaved changes' : ''}</span>${btn('bio-save', 'Save Changes', {kind: 'primary'})}</div></div>`;
}

/** Journey tab: the Journey | Biography sub-tabs (kit subTabs; the sheet binds the arrow keys) and the chosen panel. */
export function journeyTab(ctx) {
  const view = viewOf(ctx.sheet), group = `${String(ctx.sheet?.id ?? 'agch').replace(/[^A-Za-z0-9_-]/g, '')}-journey`;
  const tabs = subTabs({group, label: 'Journey sections', selected: view, tabs: JOURNEY_VIEWS})
    .replace('class="ag-tabs ag-tabs--sub"', 'class="ag-tabs ag-tabs--sub agch-jtabs"').replaceAll('role="tab" ', 'role="tab" data-action="journey-view" data-ag-always ');
  return `${tabs}<div ${tabPanelAttrs(group, view)} class="agch-jpanel agch-jpanel--${view}">${view === 'biography' ? biographyPanel(ctx) : journeyPanel(ctx)}</div>`;
}
