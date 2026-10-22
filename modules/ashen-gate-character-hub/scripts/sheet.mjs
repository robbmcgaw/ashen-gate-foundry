/**
 * The Character Hub: an alternative ActorSheetV2 for dnd5e characters. It draws its own HTML
 * from the live Actor and sends every change through the Actor/Item (see actions.mjs). It never
 * mounts or hides the native sheet; "Open native sheet" opens that one separately.
 */
import {MODULE_ID, SHEET_LABEL, COMPACT_SETTING, compactPreference} from './constants.mjs';
import {shellHtml, errorHtml} from './views.mjs';
import * as act from './actions.mjs';
import {openNativeSheet} from './native.mjs';
import {startLevelUp, levelUpState} from './level-up.mjs';
import {restoreBackup, backupsFor, sourceOf, restoreLines} from './level-restore.mjs';
import {isBackup} from './level-backup.mjs';
import {showHelp} from './help.mjs';
import * as items from './item-actions.mjs';
import {openPartner, mountEmbeds, unmountEmbeds, depositToParty} from './partners.mjs';
import * as comp from './companions.mjs';
import * as vis from './visibility.mjs';
import {openConfig} from './configure.mjs';
import {toggleSection} from './collapse.mjs';
import {setListChoice} from './organize.mjs';
import {changeArt} from './art.mjs';
import * as journey from './journey.mjs';
import {journeyActor} from './journey-views.mjs';
import * as marks from './marks.mjs';
import * as hotbar from './hotbar.mjs';
import {undoNoticesHtml} from './hotbar-views.mjs';
import {syncEscape, unbindEscape} from './escape.mjs';
import {stepStrain, pushFromHub, socketFromHub, dropOnSocket, openSkillTree} from './cinders.mjs';
import {confirmDialog, confirmDanger, formDialog} from './ag-dialogs.mjs';
import {windowSize, uiState, bindTablist} from './ag-html.mjs';
import {readDrop, resolveItemDrop} from './ag-item-drop.mjs';
import {togglePopOut, isPoppedOut} from './popout.mjs';
import {applyCompactOpacity, saveCompactOpacity} from './compact-opacity.mjs';
import {captureScroll, restoreScroll, captureFocus, restoreFocus, focusFirstIn, fieldKey} from './redraw.mjs';
import {syncQuickKeys, unbindQuickKeys} from './quick-keys.mjs';
import * as look from './look.mjs';
import {openCodex} from './codex.mjs';
import {configChoices} from './character.mjs';

const warn = msg => globalThis.ui?.notifications?.warn?.(msg);
/**
 * Push asks first through the shared dialog: "Push [power]?" with Cancel and Push. 0.33.0 (CH-22): when Backfire is
 * guaranteed it is a danger confirmation (red Push, Cancel is the default), like the row's red Push button.
 */
export const cinderConfirm = (message, {power = '', guaranteed = false} = {}, ui = {confirmDialog, confirmDanger}) => {
  const opts = {title: power ? `Push ${power}?` : 'Push?', yes: 'Push'};
  return guaranteed ? ui.confirmDanger(message, opts) : ui.confirmDialog(message, opts);
};
/** Socket item picker (Attach / Swap): one select of the items that fit; resolves the item id or null. */
export const socketPick = async (title, options, ok) => (await formDialog(title, [{name: 'item', label: 'Item', type: 'select', value: options[0]?.value ?? '', options,
  hint: 'The item stays in this character\'s inventory. Its Cinder modifiers count while it is in an active socket.'}], {ok}))?.item ?? null;
/** Removals (Detach) ask with Cancel as the default button (kit confirmDanger); other questions use confirmDialog. */
const askFor = (message, opts = {}) => opts.danger ? confirmDanger(message, opts) : confirmDialog(message, opts);
const socketUi = {pick: socketPick, confirm: askFor};
/** Shows a refusal or failure from an action; a success is silent (the sheet re-renders itself). */
export const report = result => { if (result && result.ok === false && result.error) warn(result.error); return result; };

/** Click handlers by data-action. Each receives (sheet, target, event). Views add their own entries. */
export const ACTIONS = {
  'hub-tab': (s, t) => { s.tab = t.dataset.tab; s.menu = null; return s.render(); },
  'ag-subtab': (s, t) => { s.agTab = t.dataset.tab ?? t.dataset.partner; return s.render(); },
  'inv-view': (s, t) => { s.invView = t.dataset.view === 'party' ? 'party' : 'character'; return s.render(); },
  'slot-menu': (s, t) => toggleMenu(s, `slot:${t.dataset.slot}`),
  'other-menu': (s, t) => toggleMenu(s, `other:${t.dataset.id}`),
  'section-toggle': (s, t) => toggleSection(s.element ?? t.closest?.('.agch-root'), t.dataset.key),
  'ag-jump': (s, t) => { s.tab = 'ashen-gate'; s.agTab = t.dataset.partner; s.menu = null; return s.render(); },
  'hp-apply': (s, t) => hpApply(s, t),
  'item-more': (s, t) => toggleMore(s, t),
  'journey-add': (s, t) => journeyAdd(s, t),
  'journey-edit': (s, t) => { s.journeyEdit = t.dataset.id; return s.render(); },
  'journey-cancel': s => { s.journeyEdit = null; return s.render(); },
  'journey-save': (s, t) => journeySave(s, t),
  'journey-hide': (s, t) => journey.setHidden(journeyActor({actor: s.document, sheet: s}), t.dataset.id, true),
  'journey-show': (s, t) => journey.setHidden(journeyActor({actor: s.document, sheet: s}), t.dataset.id, false),
  'journey-delete': (s, t) => journeyDelete(s, t),
  'list-filter': (s, t) => { setListFilter(s, t.dataset.tab, t.dataset.key, t.dataset.value); return s.render(); },
  'mark-apply': async (s, t) => { const r = await marks.applyMark(s.document, t.dataset.mark); if (r.ok) s.render(); return r; },
  'mark-remove': async (s, t) => { const r = await marks.removePlaced(s.document, t.dataset.scene, t.dataset.token, t.dataset.mark); if (r.ok) s.render(); return r; },
  'hotbar-use': (s, t, e) => hotbar.useHotbarSlot(s.document, t.dataset.hotbarSlot, e),
  'hotbar-undo': (s, t) => s.undoList.undo(t.dataset.undo),
  'item-favorite': (s, t) => items.toggleFavorite(s.document, t.dataset.id),
  'slot-open': (s, t) => items.openItemSheet(s.document, t.dataset.id),
  'menu-close': s => toggleMenu(s, null),
  'cond-add': s => { s.condAdd = !s.condAdd; return s.render(); },
  'item-deposit': (s, t) => { s.menu = null; return depositToParty(s.document, t.dataset.id, act.canEdit); },
  'slot-equip': (s, t) => { s.menu = null; return items.equipItem(s.document, t.dataset.id, {slot: t.dataset.slot}); },
  'slot-swap': (s, t) => items.swapSlots(s.document, t.dataset.id, t.dataset.slot, t.dataset.other, t.dataset.otherSlot),
  'retry': s => s.render({force: true}),
  'help': s => showHelp(s),
  'open-native': s => { closeMenu(s); return openNativeSheet(s.document); },
  'configure': s => configureAsk(s),
  'art-change': (s, t) => { closeMenu(s); return changeArtFor(s, t.dataset.art); },
  'char-fold': s => { s.charFolded = s.charFolded === false; hubUi().set('charFolded', s.charFolded); return s.render(); },
  'filters-menu': (s, t) => toggleMenu(s, `filters:${t.dataset.tab}`),
  'more-menu': s => toggleMenu(s, s.menu === 'look' ? null : 'more'),
  'level-up': s => levelUp(s),
  'level-restore': s => restoreAsk(s),
  'hp-damage': (s, t) => hpButton(s, t, -1),
  'hp-heal': (s, t) => hpButton(s, t, 1),
  'inspiration': s => act.toggleInspiration(s.document),
  'exhaustion': (s, t) => act.changeExhaustion(s.document, Number(t.dataset.step)),
  // 0.18.0: Strain (GM) and Cinder Push go to Ashen Gate | Cinders' public API; it checks permissions again.
  'strain-step': (s, t) => stepStrain(s.document, Number(t.dataset.step)),
  'cinder-push': (s, t) => pushFromHub(s.document, {instance: t.dataset.instance, power: t.dataset.power, mode: t.dataset.mode}, cinderConfirm),
  // 0.24.0: socket rows change sockets through Cinders' api.sockets (Detach asks first); Cinders checks again.
  'cinder-attach': (s, t) => socketFromHub(s.document, 'attach', {instance: t.dataset.instance, slot: t.dataset.slot}, socketUi),
  'cinder-swap': (s, t) => socketFromHub(s.document, 'swap', {instance: t.dataset.instance, slot: t.dataset.slot}, socketUi),
  'cinder-detach': (s, t) => socketFromHub(s.document, 'detach', {instance: t.dataset.instance, slot: t.dataset.slot}, socketUi),
  // 0.31.0: the header Cinder chip opens Ashen Gate → Cinders here; Open skill tree opens Skill Trees (players: only while Perks is shown).
  // Compact (0.32.0) has no tabs: Full opens at Cinders for this window only (0.33.0, CH-14: the saved Compact choice stays).
  'cinder-open': s => { if (!vis.canSee('cinders')) return refuse('Cinders is hidden from players right now.'); s.tab = 'ashen-gate'; s.agTab = 'ashen-gate-cinders'; s.menu = null; return s.compact ? s.setCompact(false, {save: false}) : s.render(); },
  'cinder-tree': (s, t) => vis.requirePart('perks') ?? openSkillTree(s.document, t.dataset.tree || null),
  'condition': (s, t) => act.toggleCondition(s.document, t.dataset.id),
  'roll-initiative': (s, t, e) => act.rollInitiative(s.document, e),
  'roll-check': (s, t, e) => act.rollAbilityCheck(s.document, t.dataset.ability, e),
  'roll-save': (s, t, e) => act.rollSavingThrow(s.document, t.dataset.ability, e),
  'roll-skill': (s, t, e) => act.rollSkill(s.document, t.dataset.skill, e),
  'roll-death': (s, t, e) => act.rollDeathSave(s.document, e),
  'item-use': (s, t, e) => items.useItem(s.document, t.dataset.id, e),
  'item-sheet': (s, t) => items.openItemSheet(s.document, t.dataset.id),
  'item-qty': (s, t) => { const item = s.document.items?.get?.(t.dataset.id); return items.setQuantity(s.document, t.dataset.id, Number(item?.system?.quantity ?? 0) + Number(t.dataset.step)); },
  'item-equip': (s, t) => items.equipItem(s.document, t.dataset.id),
  'item-unequip': (s, t) => items.unequipItem(s.document, t.dataset.id),
  'item-attune': (s, t) => items.setAttuned(s.document, t.dataset.id, t.dataset.attuned === '1'),
  'spell-prepare': (s, t) => items.togglePrepared(s.document, t.dataset.id),
  'rest': (s, t) => items.rest(s.document, t.dataset.type),
  'partner-open': (s, t) => openPartner(s.document, t.dataset.partner, t.dataset.ref),
  'companion-remove': (s, t) => removeCompanionAsk(s, t.dataset.entry),
  'companion-move': (s, t) => comp.moveCompanion(s.document, t.dataset.entry, Number(t.dataset.step)),
  'companion-detach': (s, t) => comp.detachPerk(s.document, t.dataset.entry, t.dataset.id),
  'companion-unattach': (s, t) => comp.detachExtra(s.document, t.dataset.entry, t.dataset.id),
  'companion-open': (s, t) => openLinkedActor(s.document, t.dataset.entry),
  'visibility-preset': (s, t) => presetAsk(t.dataset.preset),
  'doll-art': s => { s.dollArt = s.dollArt === 'token' ? 'portrait' : 'token'; return s.render(); },
  'compact-toggle': s => s.setCompact(!s.compact),
  // 0.31.0: Appearance (only for this user: Manager's own per-user skin and size, or the built-in look) and the NPC Codex.
  // 0.33.0: both sit in the header's "⋯" menu; Appearance… opens its menu in the same place.
  'look-menu': s => toggleMenu(s, 'look'),
  'look-skin': async (s, t) => { const r = await look.setManagerSkin(t.dataset.value); if (r.ok) s.render(); return r; },
  'look-size': async (s, t) => { const r = await look.setManagerSize(t.dataset.value); if (r.ok) s.render(); return r; },
  'look-set': async (s, t) => { const r = await look.setUserLook(t.dataset.field, t.dataset.value); if (r.ok) { look.applyLook(s.element); s.render(); } return r; },
  'look-more': s => { s.menu = null; s.render(); return look.managerAppearance()?.openMyAppearance?.(); },
  'codex-open': s => { closeMenu(s); return openCodex(); },
  'pop-out': s => { s.menu = null; return togglePopOut(s); }
};
/** Level up (0.27.0): dnd5e's own flow. The shared form dialog asks which class to advance, or to add one. */
export const levelClassPick = async options => (await formDialog('Level up', [{name: 'cls', label: 'Class', type: 'select', value: options[0]?.value ?? '', options,
  hint: 'dnd5e\'s level-up opens for the class you pick. "Add a class" opens dnd5e\'s class browser. A copy of the character as it is now is kept for the GM.'}], {ok: 'Level up'}))?.cls ?? null;
/** How the backup copy went, in plain words (a success is quiet unless it had to wait for the GM). */
export const backupNotice = r => !r ? null : r.ok === false ? ['warn', `Levelled up, but the backup copy was not made: ${r.error}`]
  : r.result === 'queued' ? ['info', 'Levelled up. No GM is connected, so the backup copy will be made when a GM is next on.'] : null;
async function levelUp(sheet) {
  const state = levelUpState(sheet.document), n = globalThis.ui?.notifications;
  if (!state.ok) { n?.info?.(state.reason); return null; }
  const r = await startLevelUp(sheet.document, {choose: levelClassPick, sheet, onBackup: b => { const m = backupNotice(b); if (m) n?.[m[0]]?.(m[1]); }});
  if (r?.notice) n?.info?.(r.notice);
  return r;
}
/**
 * Restore (0.28.0, GM): on a character, pick one of its level backups (newest first); on a backup copy, that copy.
 * Then a labelled red confirmation says what will happen. restoreBackup() checks GM again.
 */
export const backupPick = async backups => (await formDialog('Restore a level backup', [{name: 'id', label: 'Backup', type: 'select', value: backups[0]?.id ?? '',
  options: backups.map(b => ({value: b.id, label: b.name})), hint: 'The newest is first. You confirm on the next step.'}], {ok: 'Next'}))?.id ?? null;
export async function restoreAsk(sheet, {pick = backupPick, confirm = confirmDanger} = {}) {
  const n = globalThis.ui?.notifications, doc = sheet.document;
  if (globalThis.game?.user?.isGM !== true) { n?.warn?.('Only a GM can restore a level backup.'); return refuse('Only a GM can restore a level backup.'); }
  let backup = doc;
  if (!isBackup(doc)) {
    const all = backupsFor(doc);
    if (!all.length) { n?.info?.(`${doc.name} has no level backups.`); return null; }
    const id = all.length === 1 ? all[0].id : await pick(all);
    backup = all.find(b => b.id === id);
    if (!backup) return null;
  }
  const actor = sourceOf(backup);
  if (!actor) { n?.warn?.('The character this backup was made from is gone.'); return null; }
  if (!await confirm(restoreLines(backup, actor).join('\n'), {title: `Restore ${actor.name}?`, yes: 'Restore from backup', danger: true})) return null;   // confirmDanger: Cancel is the default (0.33.0)
  const r = await restoreBackup(backup);
  if (r.ok) { n?.info?.(`${actor.name} was restored from "${backup.name}". The character as it was is kept as a new copy in Ashen Gate / Level backups.`); if (r.warning) n?.warn?.(r.warning); }
  else n?.error?.(r.error);
  return r;
}
const refuse = error => ({ok: false, error});
/** One small menu at a time (a slot's actions or the conditions list); the same key again closes it. */
function toggleMenu(sheet, key) {
  sheet.menu = key && sheet.menu !== key ? key : null;
  return sheet.render();
}
/** A "⋯" menu item that opens another window closes the menu first. */
function closeMenu(sheet) {
  if (!sheet?.menu) return;
  sheet.menu = null;
  sheet.render();
}
/** Per-user UI memory for the Hub (kit uiState): the folded character column of a narrow Full window (CH-09). */
export const hubUi = () => uiState(MODULE_ID);
/** Configure… (0.33.0, CH-11): pick a stat, then dnd5e's own settings window for it opens (as right-click does). */
export const configPick = async options => (await formDialog('Configure a stat', [{name: 'stat', label: 'Stat', type: 'select', value: options[0]?.value ?? '', options,
  hint: 'Opens dnd5e\'s own settings for it, the same window as right-clicking the stat.'}], {ok: 'Open settings'}))?.stat ?? null;
export async function configureAsk(sheet, pick = configPick) {
  if (!act.canEdit(sheet.document)) return refuse(`You don't own ${sheet.document?.name ?? 'this character'}, so you can't change its settings.`);
  const value = await pick(configChoices(sheet.document));
  if (!value) return null;
  const [kind, key = null] = String(value).split(':');
  return openConfig(sheet.document, kind, key);
}
/** Change portrait… / Change token art… (0.33.0, CH-12): the same picker as double-clicking the art. */
function changeArtFor(sheet, mode) {
  if (!sheet.hubContext.editable) return null;
  const pos = sheet.position ? {top: (sheet.position.top ?? 0) + 40, left: (sheet.position.left ?? 0) + 10} : null;
  return changeArt(sheet.document, mode === 'token' ? 'token' : 'portrait', {position: pos});
}
/**
 * Player visibility Quick set (0.33.0, CH-21): it sets every switch at once, so it asks first, naming what players will
 * see. vis.applyPreset checks GM again.
 */
export async function presetAsk(id, ask = confirmDialog) {
  const preset = vis.PRESETS.find(p => p.id === id);
  if (!preset || globalThis.game?.user?.isGM !== true) return vis.applyPreset(id);   // refused there, without asking
  const everything = id === 'everything', core = vis.PARTS.filter(p => p.core).map(p => p.label.split(' (')[0].split(':')[0]);
  const yes = await ask(everything ? 'Every Player visibility switch is turned on, so players see every part of the Hub that their modules allow. You can change single switches afterwards.'
    : `Every Player visibility switch is set at once: players see only the core parts (${[...new Set(core)].join(', ')}). You can change single switches afterwards.`,
  {title: everything ? 'Show everything to players?' : 'Show core only to players?', yes: everything ? 'Show everything to players' : 'Show core only'});
  if (!yes) return {ok: true, result: null};
  return vis.applyPreset(id);
}
/**
 * Hides list rows whose name does not contain the search text (no re-render, so typing keeps focus). A section left
 * with no matching rows is hidden too; a container stays visible while something inside it matches.
 */
export function applyFilter(root, text) {
  const q = String(text ?? '').trim().toLowerCase();
  for (const row of root?.querySelectorAll?.('.agch-body .agch-card, .agch-body .agch-plist > li') ?? []) {
    const name = (row.querySelector?.('.agch-item__name')?.textContent ?? row.textContent ?? '').toLowerCase();
    row.hidden = !!q && !name.includes(q);
  }
  for (const box of root?.querySelectorAll?.('.agch-body .agch-contents') ?? []) {
    const any = [...(box.querySelectorAll?.('.agch-card') ?? [])].some(r => !r.hidden);
    if (any && box.previousElementSibling) box.previousElementSibling.hidden = false;
  }
  for (const sec of root?.querySelectorAll?.('.agch-body .agch-sec') ?? []) {
    if (typeof sec.querySelectorAll !== 'function' || !sec.classList) continue;
    const cards = [...sec.querySelectorAll('.agch-card')];
    sec.classList.toggle('is-filtered-out', !!q && cards.length > 0 && cards.every(r => r.hidden));
  }
}
/**
 * Combat/Magic/Features filters (kept on the open sheet). level and action pick one value (the same again clears it);
 * the others switch on and off; 'clear' turns everything off.
 */
export function setListFilter(sheet, tab, key, value) {
  if (!['combat', 'magic', 'features'].includes(tab)) return null;
  const f = {...(sheet.listFilters[tab] ?? {})};
  if (key === 'clear') sheet.listFilters[tab] = {};
  else if (key === 'level' || key === 'action') { const v = key === 'level' ? Number(value) : String(value); f[key] = f[key] === v ? null : v; sheet.listFilters[tab] = f; }
  else if (['prepared', 'ritual', 'castable', 'uses', 'left', 'equipped'].includes(key)) { f[key] = !f[key]; sheet.listFilters[tab] = f; }
  return sheet.listFilters[tab];
}
/** Journey (GM): read a form's fields. */
const formValues = target => { const f = target.closest?.('[data-journey-form]'); const v = n => f?.querySelector?.(`[name="${n}"]`); return {text: v('text')?.value ?? '', date: v('date')?.value ?? '', hidden: v('hidden')?.checked === true}; };
async function journeyAdd(sheet, target) {
  const {text, date, hidden} = formValues(target);
  const r = await journey.addManual(journeyActor({actor: sheet.document, sheet}), {text, date: date || null, hidden});
  if (r.ok && hidden) sheet.render();
  return r;
}
async function journeySave(sheet, target) {
  const {text, date} = formValues(target);
  const r = await journey.editEntry(journeyActor({actor: sheet.document, sheet}), target.dataset.id, {text, date: date || null});
  if (r.ok) { sheet.journeyEdit = null; sheet.render(); }
  return r;
}
/** Deleting a GM note asks first (destructive actions sit behind a labelled confirmation). */
async function journeyDelete(sheet, target) {
  const yes = await confirmDanger('This GM note is deleted from the Journey. This cannot be undone.', {title: 'Delete note?', yes: 'Delete note'});
  if (!yes) return {ok: true, result: null};
  const r = await journey.deleteEntry(journeyActor({actor: sheet.document, sheet}), target.dataset.id);
  if (r.ok) sheet.render();
  return r;
}
/** Removing a companion asks first; Cancel changes nothing. The linked Actor or Item itself is kept. */
export async function removeCompanionAsk(sheet, entryId, ask = confirmDanger) {
  const actor = sheet.document, entry = comp.storedCompanions(actor).find(e => e.id === entryId);
  if (!entry) return {ok: false, error: 'That companion is no longer listed.'};
  const name = entry.name || comp.linkedActor(entry.actorUuid)?.name || actor.items?.get?.(entry.itemId)?.name || 'this companion';
  const yes = await ask(`${name} is taken off ${actor.name}'s companions and their notes are deleted. The Actor or Item itself is kept.`, {title: `Remove ${name}?`, yes: 'Remove companion', danger: true});
  if (!yes) return {ok: true, result: null};
  return comp.removeCompanion(actor, entryId);
}
/** "More" on a card: shows or hides its full description in place; the sheet remembers it until it closes. */
function toggleMore(sheet, target) {
  const key = target.dataset.key, open = !sheet.expanded.has(key);
  if (open) sheet.expanded.add(key); else sheet.expanded.delete(key);
  const detail = target.closest?.('.agch-card')?.querySelector?.('.agch-card__detail');
  if (detail) detail.hidden = !open;
  target.setAttribute?.('aria-expanded', String(open));
  if ('textContent' in target) target.textContent = open ? 'Less' : 'More';
  return {ok: true, result: open};
}
/** Saves this user's Compact / Full choice (client setting); a failure only logs, the open Hub still switches. */
export function saveCompact(on) {
  try { return globalThis.game?.settings?.set?.(MODULE_ID, COMPACT_SETTING, on === true); } catch (err) { console.warn(`${MODULE_ID} | compact choice not saved`, err); return null; }
}
/** Window sizes before Comfortable scaling (windowSize): Full is the Hub's default, Compact a narrow column. */
export const FULL_SIZE = {width: 1240, height: 800};
export const COMPACT_SIZE = {width: 500, height: 780};
/** Apply in the HP editor: one update with the three values, then the editor closes. */
async function hpApply(sheet, target) {
  const box = target.closest?.('.agch-hpedit');
  const values = Object.fromEntries([...(box?.querySelectorAll?.('[data-hpedit]') ?? [])].map(i => [i.dataset.hpedit, i.value]));
  const result = await act.setHpValues(sheet.document, values);
  if (result.ok) { sheet.menu = null; sheet.render(); }
  return result;
}
function hpButton(sheet, target, sign) {
  const input = target.closest('.agch-hp')?.querySelector('[data-hp-amount]');
  const amount = Math.abs(Math.trunc(Number(input?.value) || 0));
  if (!amount) return {ok: false, error: 'Type an amount first.'};
  return act.adjustHp(sheet.document, sign * amount);
}

/** Change handlers by data-edit. Each receives (sheet, input). */
export const EDITS = {
  'currency': (s, i) => items.setCurrency(s.document, i.dataset.key, i.value),
  'item-qty': (s, i) => items.setQuantity(s.document, i.dataset.id, i.value),
  'item-slot': (s, i) => items.setSlot(s.document, i.dataset.id, i.value),
  'companion-add': (s, i) => i.value ? comp.addCompanion(s.document, i.value, i.dataset.kind) : null,
  'companion-attach': (s, i) => i.value ? comp.attachPerk(s.document, i.dataset.entry, i.value) : null,
  'companion-extra': (s, i) => i.value ? comp.attachExtra(s.document, i.dataset.entry, i.value) : null,
  'companion-clothing': (s, i) => i.value ? comp.attachExtra(s.document, i.dataset.entry, i.value, {slot: i.dataset.slot, list: 'clothing'}) : null,
  'companion-name': (s, i) => comp.setCompanionText(s.document, i.dataset.entry, 'name', i.value),
  'companion-desc': (s, i) => comp.setCompanionText(s.document, i.dataset.entry, 'description', i.value),
  'pet-cap-override': (s, i) => comp.setPetCapOverride(i.dataset.actor, i.value),
  'pet-cap-default': (s, i) => comp.setDefaultPetCap(i.value),
  'journey-actor': (s, i) => { s.journeyActorId = globalThis.game?.user?.isGM ? i.value || null : null; s.journeyEdit = null; return s.render(); },
  // A refused write redraws, so the checkbox shows the stored value again (report() shows why).
  'part-visibility': async (s, i) => { const r = await vis.setVisibility({[i.dataset.part]: i.checked === true}); if (!r?.ok) s.render(); return r; },
  'list-sort': async (s, i) => { const r = await setListChoice(i.dataset.tab, i.dataset.field, i.value); if (r.ok) s.render(); return r; },
  'look-default': async (s, i) => { const r = await look.setWorldLook(i.dataset.field, i.value); if (!r?.ok) s.render(); return r; }
};

/** Reads the Item (or, where `types` allows, the Actor or Macro) from a drop the way dnd5e does; parsing is the shared readDrop. */
export async function droppedItem(event, types = ['Item']) {
  const data = readDrop(event);
  if (!types.includes(data?.type)) return null;
  const Cls = globalThis[data.type]?.implementation ?? globalThis[data.type];
  return Cls?.fromDropData ? Cls.fromDropData(data) : null;
}
/**
 * Companion zones (0.25.0): Items go through the shared item-drop standard, so a folder, a non-Item or a missing item
 * is refused with the shared text ({ok: false, error}). Mount and pet slots also take an Actor, read as before.
 */
export async function droppedCompanionDoc(event, actors = false) {
  const raw = readDrop(event);
  if (actors && raw.type === 'Actor') {
    const Cls = globalThis.Actor?.implementation ?? globalThis.Actor;
    return {ok: true, doc: (await Cls?.fromDropData?.(raw)) ?? null};
  }
  const r = await resolveItemDrop(raw);
  return r.ok ? {ok: true, doc: r.items[0]} : {ok: false, error: r.reason};
}
/** Item cards can be dragged (to the quick bar, Foundry's hotbar or another sheet) as ordinary Item drag data. */
export function onItemDragStart(event) {
  const card = event.target?.closest?.('[data-drag-uuid]');
  if (!card || !event.dataTransfer) return null;
  event.dataTransfer.setData('text/plain', JSON.stringify({type: 'Item', uuid: card.dataset.dragUuid}));
  return true;
}
/** Opens a linked mount/pet Actor's own sheet; Foundry's permissions decide what the user sees there. */
async function openLinkedActor(actor, entryId) {
  const entry = comp.storedCompanions(actor).find(e => e.id === entryId), other = comp.linkedActor(entry?.actorUuid);
  if (!other) return {ok: false, error: 'That Actor is gone.'};
  const user = globalThis.game?.user;
  if (!user?.isGM && other.testUserPermission?.(user, 'LIMITED') !== true) return {ok: false, error: `You can't see ${other.name}.`};
  await other.sheet?.render?.({force: true});
  return {ok: true};
}

/** Arrow keys in a segmented control (radio group) move to the next choice and pick it. */
export function segmentStep(button, step) {
  const all = [...(button.parentElement?.querySelectorAll?.('[role="radio"]') ?? [])];
  const next = all[(all.indexOf(button) + step + all.length) % all.length];
  if (!next || next === button) return null;
  next.focus?.(); next.click?.();
  return next;
}

/** Buttons that open a menu: a click on one is not an "outside" click (it toggles its own menu). */
const MENU_OPENERS = ['slot-menu', 'other-menu', 'look-menu', 'more-menu', 'filters-menu'].map(a => `[data-action="${a}"]`).join(', ');
/** What counts as an open popover for the focus (CH-02): menus, the conditions list, a Journey entry being edited. */
const POPOVER_SELECTOR = '.agch-menu, .agch-conds__list, [data-journey-form="edit"]';

/** Builds the class on top of Foundry's ActorSheetV2 (passed in so tests can supply a stand-in). */
export function createHubSheetClass(Base) {
  return class CharacterHubSheet extends Base {
    static DEFAULT_OPTIONS = {
      classes: ['ag-app', 'agch-app'],
      position: {...FULL_SIZE},  // kit Compact size; Comfortable scales it when the sheet opens (windowSize)
      window: {resizable: true},
      form: {submitOnChange: false, closeOnSubmit: false}
    };
    static LABEL = SHEET_LABEL;
    /**
     * The default size follows the kit size set (Comfortable is 1.2x) and this user's Compact choice (0.29.0); an
     * explicit position still wins.
     */
    constructor(options = {}) {
      const compact = compactPreference();
      super({...options, position: {...windowSize(compact ? COMPACT_SIZE : CharacterHubSheet.DEFAULT_OPTIONS.position), ...options.position}});
      this.compact = compact;
      this.charFolded = hubUi().get('charFolded', true, [true, false]);
    }
    /** Narrow Full window (0.33.0, CH-09): the character column is folded to name, HP and AC (per user, this device). */
    charFolded = true;
    /** Compact view (0.29.0): only the art with its slots, HP and the quick bar. */
    compact = false;
    /** The last Full and Compact window sizes while this Hub is open, so toggling back restores them. */
    _sizes = {};
    tab = 'overview';
    /** Open slot menu: 'slot:<id>' or null. */
    menu = null;
    /** The conditions box shows the inactive conditions to add. */
    condAdd = false;
    /** Partner views mounted in this sheet: key → {element, handle} (see mountEmbeds). */
    _embeds = new Map();
    invView = 'character';
    agTab = null;
    /** Search text per tab (Combat, Inventory, Magic, Features). */
    filters = {};
    /** Cards whose "More" is open (detail keys), kept across re-renders while the sheet is open. */
    expanded = new Set();
    /** Combat, Magic and Features filters while the sheet is open: {combat: {action, equipped, uses, left}, magic: {level, prepared, ritual, castable}, features: {action, uses, left}}. */
    listFilters = {combat: {}, magic: {}, features: {}};
    /** Scroll positions per view ('compact' or a tab id) while the sheet is open (redraw.mjs). */
    _agchScroll = {};

    get hubContext() {
      const actor = this.document, user = globalThis.game?.user;
      const limited = !user?.isGM && actor.limited === true;
      return {actor, sheet: this, tab: this.tab, limited, compact: this.compact === true, editable: !limited && act.canEdit(actor, user) && this.isEditable !== false};
    }

    /** Never a blank window: a failure while drawing shows the error inside the sheet with Retry. */
    async _renderHTML() {
      try { return shellHtml(this.hubContext); } catch (err) {
        console.error(`${MODULE_ID} | render failed`, err);
        return errorHtml(err);
      }
    }

    _replaceHTML(result, content) {
      // Listeners first (0.30.0): a new content element is bound before anything below can throw, so a redraw that
      // fails half-way never leaves a reopened Hub without its change listener (Group / Sort, GM Setup switches ...).
      const fresh = this._agchBound !== content;
      if (fresh) this._bindContent(content);
      // Quiet redraws (0.29.4, redraw.mjs): nothing changes when the HTML is the same; otherwise scroll positions (per
      // tab) and the focused field survive the redraw, so a change made by someone else never moves the player.
      // 0.33.0 (CH-02): buttons and tabs keep the focus too (also across a tab switch or Compact / Full); a popover that
      // opens takes the focus, and when it closes the focus goes back to the button that opened it.
      const view = this.compact ? 'compact' : this.tab, same = !fresh;
      if (same && this._agchHtml === result && this._agchShown === view) {
        for (const m of this._embeds.values()) { try { m.handle?.refresh?.(); } catch {} }
      } else {
        if (same && this._agchShown) this._agchScroll[this._agchShown] = captureScroll(content);
        const focus = same ? captureFocus(content) : null, popBefore = this._agchPop ?? null, popNow = this.popoverKey();
        this._agchHtml = null;   // what is on screen is unknown until this redraw has finished
        content.innerHTML = result;
        mountEmbeds(content, this._embeds);
        applyFilter(content, this.filters[this.tab] ?? '');
        restoreScroll(content, this._agchScroll[view]);
        this._bindTabs(content);
        const pop = popNow && popNow !== popBefore ? content.querySelector?.(POPOVER_SELECTOR) : null;
        if (pop) { this._agchOpener = this._agchActionKey ?? focus?.key ?? null; focusFirstIn(pop); }
        else if (!restoreFocus(content, focus) && popBefore && !popNow && this._agchOpener) restoreFocus(content, {key: this._agchOpener});
        this._agchPop = popNow;
        this._agchHtml = result; this._agchShown = view;
      }
      this._agchActionKey = null;
      applyCompactOpacity(this);
      this._drawUndo(content);
      syncEscape(this);   // Escape closes an open menu/editor only, wherever focus is (escape.mjs)
      syncQuickKeys(this);   // quick bar keys in a popped-out Hub's own window (quick-keys.mjs)
      // <html> carries General Manager's skin to every window in Foundry's own page, so the Hub no longer copies the skin
      // onto its content on each render (0.33.0, GM-CO-04: the copy went stale on a skin change). A popped-out Hub sits
      // in another browser window's <html>, so there it is still applied.
      if (isPoppedOut(this)) try { const a = globalThis.game?.modules?.get('ashen-gate-manager')?.api?.appearance; if (a?.contract === 'ag-appearance/0.1-beta') a.applyTo?.(content); } catch {}
      look.applyLook(this.element);   // 0.31.0: the built-in per-user look while Manager's appearance is absent
    }

    /** What popover is open now (a menu, the conditions list or a Journey entry being edited), or null. */
    popoverKey() {
      return this.menu ?? (this.condAdd ? 'conditions' : null) ?? (this.journeyEdit ? `journey:${this.journeyEdit}` : null);
    }

    /**
     * Arrow keys for the tab rail and the Ashen Gate sub-tabs (0.33.0, CH-20; kit bindTablist). Only the Hub's own rows:
     * an embedded partner view binds its own. Bound again after each redraw, which replaces those rows.
     */
    _bindTabs(content) {
      for (const list of content.querySelectorAll?.('.agch-rail, .agch-agtabs') ?? []) bindTablist(list);
    }

    /**
     * Listeners live on the content element, bound once per element. Foundry builds a new window (and content element)
     * each time a closed Hub is opened again, so a once-per-sheet flag left a reopened Hub with no change, drop,
     * right-click or double-click listeners (0.29.3: GM Setup checkboxes did nothing).
     */
    _bindContent(content) {
      this._agchBound = content;
      content.addEventListener?.('change', ev => this._onHubChange(ev));
      content.addEventListener?.('input', ev => {
        if (ev.target?.matches?.('[data-filter]')) { this.filters[this.tab] = ev.target.value; applyFilter(content, ev.target.value); }
        if (ev.target?.matches?.('[data-compact-opacity]')) applyCompactOpacity(this, ev.target.value);
      });
      content.addEventListener?.('change', ev => { if (ev.target?.matches?.('[data-compact-opacity]')) saveCompactOpacity(ev.target.value); });
      content.addEventListener?.('contextmenu', ev => this._onContextMenu(ev));
      content.addEventListener?.('click', ev => this._onOutsideClick(ev));
      content.addEventListener?.('dblclick', ev => ev.target?.closest?.('[data-art-edit]') ? this._onArtEdit(ev) : this._onHpBarOpen(ev));
      content.addEventListener?.('keydown', ev => {
        if ((ev.key === 'Enter' || ev.key === ' ') && ev.target?.matches?.('[data-hp-bar]')) { this._onHpBarOpen(ev); return; }
        // 0.33.0 (CH-11): Delete or Backspace on a filled quick-bar slot clears it, like right-click (with Undo).
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && ev.target?.matches?.('.agch-quick__slot.is-filled')) { ev.preventDefault(); this._clearQuickSlot(ev.target); return; }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key) && ev.target?.matches?.('.ag-segmented > [role="radio"]')) { ev.preventDefault(); segmentStep(ev.target, ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 1); return; }
        if (ev.key === 'Enter' && ev.target?.matches?.('[data-hpedit]')) { ev.preventDefault(); this.dispatch('hp-apply', ev.target, ev); }
      });
      content.addEventListener?.('submit', ev => ev.preventDefault());
      content.addEventListener?.('dragover', ev => {
        if (ev.target?.closest?.('[data-drop-companion], [data-hotbar-slot], [data-cinder-drop]')) ev.preventDefault();
        this._dropHighlight(ev.target?.closest?.('[data-cinder-drop]'));
      });
      content.addEventListener?.('dragleave', ev => { if (!ev.relatedTarget?.closest?.('[data-cinder-drop]')) this._dropHighlight(null); });
      content.addEventListener?.('drop', ev => ev.target?.closest?.('[data-hotbar-slot]') ? this._onHotbarDrop(ev)
        : ev.target?.closest?.('[data-cinder-drop]') ? this._onSocketDrop(ev) : this._onCompanionDrop(ev));
      content.addEventListener?.('dragstart', ev => onItemDragStart(ev));
    }

    /** Observers still need tabs, Help and Open native sheet; Foundry disables every form control otherwise. */
    _toggleDisabled(disabled) {
      super._toggleDisabled?.(disabled);
      this.element?.querySelectorAll?.('[data-ag-always]').forEach(el => { el.disabled = false; });
    }

    /** ApplicationV2 routes [data-action] clicks without a registered handler here. Embedded partner views handle their own. */
    async _onClickAction(event, target) {
      if (target?.closest?.('.agch-embed')) return null;
      return this.dispatch(target.dataset.action, target, event);
    }

    async dispatch(action, target, event) {
      const handler = ACTIONS[action];
      if (!handler) return null;
      try { this._agchActionKey = target?.attributes ? fieldKey(target) : null; } catch { this._agchActionKey = null; }   // a popover it opens returns the focus here
      try { return report(await handler(this, target, event)); } catch (err) {
        console.error(`${MODULE_ID} | ${action}`, err);
        return report({ok: false, error: err?.message ?? String(err)});
      }
    }

    /**
     * Right-click: on a filled slot (or an Other equipped row) it unequips; on an empty slot it opens the slot's menu;
     * on a stat marked data-config it opens dnd5e's own configuration window for it. Embedded partner views keep theirs.
     */
    _onContextMenu(event) {
      if (event.target?.closest?.('.agch-embed')) return null;
      const quick = event.target?.closest?.('.agch-quick__slot.is-filled');
      if (quick) {
        event.preventDefault(); event.stopPropagation();
        return this._clearQuickSlot(quick);
      }
      const filled = event.target?.closest?.('[data-action="slot-open"]');
      const slot = filled ?? event.target?.closest?.('[data-action="slot-menu"]');
      if (slot) {
        event.preventDefault(); event.stopPropagation();
        if (filled) { this.menu = null; return items.unequipItem(this.document, filled.dataset.id).then(report); }
        this.menu = `slot:${slot.dataset.slot}`;
        return this.render();
      }
      const cfg = event.target?.closest?.('[data-config]');
      if (!cfg) return null;
      event.preventDefault(); event.stopPropagation();
      return openConfig(this.document, cfg.dataset.config, cfg.dataset.configKey ?? null).then(report);
    }

    /** Clears a quick-bar slot (right-click, or Delete / Backspace on it) and offers Undo for 5 seconds. */
    _clearQuickSlot(slot) {
      const actor = this.document;
      return hotbar.clearHotbarSlot(actor, slot.dataset.hotbarSlot).then(r => { if (r?.ok) this.undoList.add(actor, r.result); return report(r); });
    }

    /**
     * Double-click on the big art pane: change the art that is shown (portrait or token). The Portrait/Token art
     * button and the AC shield inside it keep their own clicks. Owner or GM only (changeArt checks it too).
     */
    _onArtEdit(event) {
      const pane = event.target?.closest?.('[data-art-edit]');
      if (!pane || event.target?.closest?.('.agch-doll__toggle, .agch-ac, button')) return null;
      if (!this.hubContext.editable) return null;
      event.preventDefault?.();
      const pos = this.position ? {top: (this.position.top ?? 0) + 40, left: (this.position.left ?? 0) + 10} : null;
      return changeArt(this.document, pane.dataset.artEdit === 'token' ? 'token' : 'portrait', {position: pos}).then(report);
    }

    /** Double-click (or Enter) on the HP bar opens the small HP editor. Only for users who can edit the character. */
    _onHpBarOpen(event) {
      const bar = event.target?.closest?.('[data-hp-bar]');
      if (!bar || !this.hubContext.editable) return null;
      event.preventDefault?.();
      this.menu = 'hp';
      return this.render();
    }

    /**
     * Switches Compact / Full (0.29.0) and saves the choice for this user. The size being left is remembered while the
     * Hub is open, and the other one comes back (first time: its default size, scaled for Comfortable).
     */
    setCompact(on, {save = true} = {}) {
      const next = on === true, pos = this.position;
      if (pos?.width && pos?.height) this._sizes[this.compact ? 'compact' : 'full'] = {width: pos.width, height: pos.height};
      this.compact = next; this.menu = null;
      if (save) saveCompact(next);
      const size = this._sizes[next ? 'compact' : 'full'] ?? windowSize(next ? COMPACT_SIZE : FULL_SIZE);
      return this.render({position: {...size}});
    }

    /** After Foundry moves the Hub to its own browser window or back (V14), redraw so Pop out / Pop in is right. */
    _onDetach(from, to) { unbindEscape(this); unbindQuickKeys(this); this._agchHtml = null; super._onDetach?.(from, to); this.render(); }
    _onAttach(from, to) { unbindEscape(this); unbindQuickKeys(this); this._agchHtml = null; super._onAttach?.(from, to); this.render(); }

    /** Pending quick-bar Undo notices (5 seconds each); redrawn over the content when one is added, used or expires. */
    get undoList() {
      return this._undo ??= hotbar.createUndoList({onChange: () => this._drawUndo()});
    }
    _drawUndo(content = this.element?.querySelector?.('.window-content')) {
      if (!content) return;
      content.querySelector?.('.agch-undo')?.remove?.();
      const html = undoNoticesHtml(this._undo?.list());
      if (html) content.insertAdjacentHTML?.('beforeend', html);
    }

    /**
     * Partner views are unmounted when the sheet closes; pending undos are dropped (the clears stand). Foundry keeps one
     * sheet per character, so everything that is only "while the Hub is open" is reset here (0.30.0): the Magic and
     * Features filters, search text, open "More" texts and any open menu start fresh when the Hub is opened again.
     */
    _onClose(options) {
      unmountEmbeds(this._embeds);
      this._undo?.clear();
      unbindEscape(this); unbindQuickKeys(this);
      this.resetOpenState();
      return super._onClose?.(options);
    }
    resetOpenState() {
      this._agchScroll = {}; this._agchHtml = null; this._agchShown = null; this._dropRow = null; this._agchPop = null; this._agchOpener = null;
      this.listFilters = {combat: {}, magic: {}, features: {}}; this.filters = {}; this.expanded = new Set();
      this.menu = null; this.condAdd = false; this.journeyEdit = null;
    }

    /**
     * A click outside the open menu (and not on a menu opener) closes it. A click on a field (a Group / Sort select, a
     * search box, a number) closes the menu without a redraw (0.30.0): redrawing replaced the select whose list had just
     * opened, so the choice made in it went nowhere and Group / Sort seemed to do nothing.
     */
    _onOutsideClick(event) {
      if (!this.menu) return null;
      const t = event.target;
      if (t?.closest?.(`.agch-menu, ${MENU_OPENERS}`)) return null;
      this.menu = null;
      if (t?.closest?.('select, input, textarea, label')) {
        const root = this.element ?? event.currentTarget;
        for (const m of root?.querySelectorAll?.('.agch-menu') ?? []) m.remove?.();
        this._agchHtml = null; this._agchPop = this.popoverKey();   // the screen no longer matches the last HTML, so the next render draws again
        syncEscape(this);
        return null;
      }
      return this.render();
    }

    /** Drops on a quick bar slot: one of this character's Items or a Macro. */
    async _onHotbarDrop(event) {
      const slot = event.target?.closest?.('[data-hotbar-slot]');
      if (!slot) return null;
      event.preventDefault(); event.stopPropagation();
      try { return report(await hotbar.setHotbarSlot(this.document, slot.dataset.hotbarSlot, await droppedItem(event, ['Item', 'Macro']))); }
      catch (err) { return report({ok: false, error: err?.message ?? String(err)}); }
    }

    /** The socket row under a drag gets the drop highlight (one at a time). */
    _dropHighlight(row) {
      if (this._dropRow === row) return;
      this._dropRow?.classList?.remove?.('is-drop');
      this._dropRow = row ?? null;
      row?.classList?.add?.('is-drop');
    }

    /** Drops on a Cinder socket row: attach to an empty socket, swap into a full one (through Cinders' api.sockets). */
    async _onSocketDrop(event) {
      const row = event.target?.closest?.('[data-cinder-drop]');
      this._dropHighlight(null);
      if (!row) return null;
      event.preventDefault(); event.stopPropagation();
      try { return report(await dropOnSocket(this.document, {instance: row.dataset.instance, slot: row.dataset.slot, filled: row.dataset.filled}, await droppedItem(event))); }
      catch (err) { return report({ok: false, error: err?.message ?? String(err)}); }
    }

    /** Drops on a Companions zone are handled here; other drops fall through to Foundry's own sheet handling. */
    async _onCompanionDrop(event) {
      const zone = event.target?.closest?.('[data-drop-companion]');
      if (!zone) return null;
      event.preventDefault(); event.stopPropagation();
      try {
        const kind = zone.dataset.dropCompanion, entry = zone.dataset.entry;
        const drop = await droppedCompanionDoc(event, kind === 'mount' || kind === 'pet');
        if (!drop.ok) return report(drop);
        const item = drop.doc;
        const result = kind === 'perk' ? await comp.attachDroppedPerk(this.document, entry, item)
          : kind === 'extra' ? await comp.attachDroppedExtra(this.document, entry, item)
          : kind === 'clothing' ? await comp.attachDroppedExtra(this.document, entry, item, {slot: zone.dataset.slot, list: 'clothing'})
          : await comp.addDroppedCompanion(this.document, item, kind);
        return report(result);
      } catch (err) { return report({ok: false, error: err?.message ?? String(err)}); }
    }

    async _onHubChange(event) {
      const input = event.target?.closest?.('[data-edit]') ?? event.target, key = input?.dataset?.edit;
      if (!key || !EDITS[key]) return null;
      event.stopPropagation?.();
      try { return report(await EDITS[key](this, input)); } catch (err) { return report({ok: false, error: err?.message ?? String(err)}); }
    }
  };
}
