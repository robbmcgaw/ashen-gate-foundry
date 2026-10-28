/**
 * Double-click on the big art pane (0.16.0): change the art that is shown. Portrait → actor.img; Token art → the
 * prototype token's texture. Done the way Foundry's own sheets do it (DocumentSheetV2 "editImage", which the dnd5e
 * sheet uses): FilePicker.implementation (the Forge's Assets Library picker on The Forge) starting at the current path,
 * with the default artwork as the root to fall back to, then a normal document update. A token set to random images
 * opens its Prototype Token settings instead, as the dnd5e sheet does. Owner or GM only.
 *
 * 0.61.0: when the Tokenizer module is active and exposes tokenizeActor, the same double-click (and the Change button, the
 * keyboard route) opens Tokenizer's window for the character instead of the picker. Tokenizer saves the portrait and the
 * token itself (actor.update), which re-renders the Hub. Anything missing or failing falls back to the picker.
 */
import {canEdit} from './actions.mjs';
import {renderBeside} from './popout.mjs';

export const ART_FIELDS = {portrait: 'img', token: 'prototypeToken.texture.src'};
/** File types as on the dnd5e sheet: portraits are images, token art may also be a video. */
export const ART_TYPES = {portrait: 'image', token: 'imagevideo'};
const refuse = error => ({ok: false, error});
const getProp = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

/** The stored path for a mode (from the source data, like Foundry's own image editor). */
export const currentArt = (actor, mode) => getProp(actor?._source ?? actor, ART_FIELDS[mode]) ?? '';

/** Foundry's file picker class (V13+: foundry.applications.apps.FilePicker; The Forge replaces .implementation). */
export const filePickerClass = () => globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker?.implementation ?? globalThis.FilePicker ?? null;

/** MrPrimate's Tokenizer: module id `vtta-tokenizer` (its Foundry package id; `tokenizer` is checked too). */
export const TOKENIZER_IDS = ['vtta-tokenizer', 'tokenizer'];

/** Tokenizer's `tokenizeActor(actor)` when its module is active and the function exists; otherwise null. Never throws. */
export function tokenizerOpener() {
  try {
    for (const id of TOKENIZER_IDS) {
      const mod = globalThis.game?.modules?.get?.(id);
      if (mod?.active !== true) continue;
      const api = mod.api ?? globalThis.Tokenizer;
      if (typeof api?.tokenizeActor === 'function') return actor => api.tokenizeActor(actor);
    }
  } catch { /* fall through to the picker */ }
  return null;
}

/**
 * Opens the picker for the shown art (or Tokenizer, see above). Resolves to {ok, result: 'picker' | 'tokenizer' | 'token-config'} once it is open; choosing a
 * file updates the Actor, and cancelling changes nothing.
 */
export async function changeArt(actor, mode, {position = null, hub = null, notify = msg => globalThis.ui?.notifications?.warn?.(msg)} = {}) {
  if (!canEdit(actor)) return refuse(`You don't own ${actor?.name ?? 'this character'}, so you can't change its art.`);
  const field = ART_FIELDS[mode];
  if (!field) return refuse('Unknown art.');
  if (mode === 'token' && actor.prototypeToken?.randomImg) {
    const Config = globalThis.foundry?.applications?.sheets?.PrototypeTokenConfig ?? globalThis.CONFIG?.Token?.prototypeSheetClass;
    if (!Config) return refuse('This token uses random images: change them in the Prototype Token settings.');
    await renderBeside(hub, new Config({prototype: actor.prototypeToken}));
    return {ok: true, result: 'token-config'};
  }
  const openTokenizer = tokenizerOpener();
  if (openTokenizer) {
    try { await openTokenizer(actor); return {ok: true, result: 'tokenizer'}; }
    catch (err) {
      notify(`Tokenizer could not be opened (${err?.message ?? err}). Choose the art with the file picker instead.`);
      console.warn('Ashen Gate | Character Hub: Tokenizer failed to open', err);
    }
  }
  const FP = filePickerClass();
  if (!FP) return refuse('The file picker is not available.');
  const current = currentArt(actor, mode);
  const defaults = actor.constructor?.getDefaultArtwork?.(actor._source ?? {}) ?? {};
  const fallback = getProp(defaults, mode === 'token' ? 'texture.src' : 'img');
  const picker = new FP({
    type: ART_TYPES[mode], current, redirectToRoot: fallback ? [fallback] : [], ...(position ? {position} : {}),
    callback: async path => {
      if (!path || path === current) return;
      if (!canEdit(actor)) { notify(`You can't change ${actor.name}'s art.`); return; }
      try { await actor.update({[field]: path}); } catch (err) { notify(`The art could not be changed: ${err?.message ?? err}`); }
    }
  });
  await (typeof picker.browse === 'function' ? picker.browse(current) : picker.render?.({force: true}));
  return {ok: true, result: 'picker'};
}
