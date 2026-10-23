/**
 * Name and title (0.40.0): the owner and the GM rename the character (actor.name) and give it a short title shown
 * beside the name in the header ("Velwin  Warden of the Ford").
 *
 * dnd5e 6.0.6 has no title field on a character (system.details: biography, alignment, ideal, bond, flaw, race,
 * background, originalClass, xp, appearance, trait, gender, eyes, height, faith, hair, skin, age, weight), so the title
 * is an Actor flag in the Hub's own namespace: flags.ashen-gate-character-hub.title, plain text, one line, trimmed, at
 * most TITLE_MAX characters; '' when cleared. A new flag: nothing to migrate.
 *
 * Who may change them (enforced in updateNameTitle, not only by hiding the button): owners and the GM. Never on a level
 * backup copy ("<name> - level X") and never from a limited view. Everyone who can see the header sees the title.
 */
import {MODULE_ID, esc} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {isBackup} from './level-backup.mjs';

export const TITLE_FLAG = 'title', TITLE_MAX = 60;
const refuse = error => ({ok: false, error});

const str = v => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
/** The title as stored: one line of plain text, whitespace (newlines too) collapsed, trimmed, at most TITLE_MAX characters. */
export const cleanTitle = value => str(value).replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX).trim();
/** The name as saved: trimmed (dnd5e sets no other limit). */
export const cleanName = value => str(value).trim();
/** The stored title ('' when there is none). */
export const titleOf = actor => cleanTitle(actor?.flags?.[MODULE_ID]?.[TITLE_FLAG]);

/** Why this user can't change the name and title, or '' when they can. */
export function renameRefusal(actor, user = globalThis.game?.user) {
  if (!actor) return 'No character to rename.';
  if (isBackup(actor)) return 'That is a level backup copy: its name and title stay as they were.';
  if (actor.limited === true && user?.isGM !== true) return `You don't own ${actor.name ?? 'this character'}, so you can't change its name or title.`;
  if (!canEdit(actor, user)) return `You don't own ${actor.name ?? 'this character'}, so you can't change its name or title.`;
  return '';
}
export const canRename = (actor, user = globalThis.game?.user) => renameRefusal(actor, user) === '';

/**
 * Saves {name, title}: owner or GM only, never on a backup. An empty name is refused. Only the fields that differ
 * from what is stored are written, in one actor.update; an empty title clears it. Resolves {ok, result: diff|null}.
 */
export async function updateNameTitle(actor, changes = {}, user = globalThis.game?.user) {
  const why = renameRefusal(actor, user);
  if (why) return refuse(why);
  const diff = {};
  if (changes.name !== undefined) {
    const name = cleanName(changes.name);
    if (!name) return refuse('The character needs a name.');
    if (name !== actor.name) diff.name = name;
  }
  if (changes.title !== undefined) {
    const title = cleanTitle(changes.title);
    if (title !== titleOf(actor)) diff[`flags.${MODULE_ID}.${TITLE_FLAG}`] = title;
  }
  if (!Object.keys(diff).length) return {ok: true, result: null};
  await actor.update(diff);
  return {ok: true, result: diff};
}

/**
 * The title beside the name in the header (text only), or ''. Its full text is the tooltip, since a narrow header may
 * cut even a short title off with "…" (CSS can't tell when).
 */
export function titleHtml(actor) {
  const title = titleOf(actor);
  return title ? `<span class="agch-head__title" data-tooltip="${esc(title)}">${esc(title)}</span>` : '';
}
/** The header's icon-only edit button beside the name; '' for anyone who may not rename. */
export const EDIT_LABEL = 'Edit name and title…';
export function nameEditBtn(actor, user = globalThis.game?.user) {
  if (!canRename(actor, user)) return '';
  return `<button type="button" class="ag-btn ag-btn--ghost ag-btn--icon ag-btn--sm agch-head__edit" data-action="name-edit" aria-label="${esc(EDIT_LABEL)}" data-tooltip="${esc(EDIT_LABEL)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>`;
}
/** The same action as an item of the header's "⋯" menu (for keyboard users). */
export function nameMenuItem(actor, user = globalThis.game?.user) {
  if (!canRename(actor, user)) return '';
  return `<button type="button" class="ag-btn ag-btn--ghost agch-menu__btn" data-action="name-edit" data-menu-item data-tooltip="Change the character's name and the title shown beside it"><i class="fa-solid fa-pen" aria-hidden="true"></i><span>${esc(EDIT_LABEL)}</span></button>`;
}

const dialogV2 = () => globalThis.foundry?.applications?.api?.DialogV2;
const formOf = (event, button, dialog) => button?.form ?? event?.currentTarget?.form ?? dialog?.element?.querySelector?.('form') ?? null;
/**
 * The Name and Title dialog: Cancel (left) and Save (right, primary). Save is disabled while the name is empty, which the
 * kit's formDialog can't do, so this is a DialogV2 with the kit's dialog classes. Resolves {name, title} or null
 * (Cancel, Escape, closed).
 */
export async function nameTitleDialog(actor) {
  const D = dialogV2();
  if (!D?.wait) {
    const fn = globalThis.window?.prompt ?? globalThis.prompt;
    if (typeof fn !== 'function') return null;
    const name = fn('Name', actor?.name ?? '');
    if (name === null || name === undefined) return null;
    const title = fn('Title (optional)', titleOf(actor));
    return title === null || title === undefined ? null : {name, title};
  }
  const content = `<div class="form-group"><label for="agch-rename-name">Name</label><div class="form-fields"><input id="agch-rename-name" type="text" name="name" value="${esc(actor?.name ?? '')}" required autofocus></div></div>
    <div class="form-group"><label for="agch-rename-title">Title</label><div class="form-fields"><input id="agch-rename-title" type="text" name="title" value="${esc(titleOf(actor))}" maxlength="${TITLE_MAX}" placeholder="Warden of the Ford"></div>
    <p class="hint">Shown beside the name, in smaller italic text. Everyone who can see the character sees it. Leave it empty for none.</p></div>`;
  const result = await D.wait({classes: ['ag-app', 'ag-dialog'], window: {title: 'Edit name and title'}, content, modal: true, rejectClose: false, // ag-lint-allow: Save disabled while name is empty
    buttons: [{action: 'cancel', label: 'Cancel', callback: () => null},
      {action: 'ok', label: 'Save', default: true, callback: (event, button, dialog) => { const f = formOf(event, button, dialog); return f ? {name: f.elements.name?.value ?? '', title: f.elements.title?.value ?? ''} : null; }}],
    render: (event, dialog) => {
      const root = dialog?.element ?? event?.target?.element, input = root?.querySelector?.('input[name="name"]'), save = root?.querySelector?.('button[data-action="ok"]');
      if (!input || !save) return;
      const sync = () => { save.disabled = !cleanName(input.value); };
      input.addEventListener?.('input', sync);
      sync();
    }});
  return result && typeof result === 'object' && cleanName(result.name) ? result : null;
}

/**
 * Edit name and title… (header button and ⋯ menu): asks, then saves only what changed. The focus goes back to the
 * header's edit button afterwards. `ask` is the dialog (tests pass their own).
 */
export async function renameAsk(sheet, ask = nameTitleDialog) {
  const actor = sheet?.document, why = renameRefusal(actor);
  if (why) return refuse(why);
  const answer = await ask(actor);
  focusEditBtn(sheet);
  if (!answer) return null;
  return updateNameTitle(actor, answer);
}
export function focusEditBtn(sheet) {
  try { sheet?.element?.querySelector?.('.agch-head__edit')?.focus?.({preventScroll: true}); } catch { /* the Hub was closed */ }
}
