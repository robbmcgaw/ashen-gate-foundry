/**
 * Biography (0.38.0): the character's Biography from the dnd5e sheet, in Journey → Biography. dnd5e owns the data; the
 * Hub reads and writes the Actor's own fields (system.details, dnd5e 6.0.6 schema) and stores nothing of its own.
 *
 * Fields (checked against dnd5e 6.0.6: DetailsFields.common / .creature and CharacterData.details):
 *   - biography.value, biography.public: HTML (HTMLField)
 *   - trait, ideal, bond, flaw, appearance: plain text (StringField, edited in a text box on the dnd5e sheet)
 *   - age, height, weight, eyes, skin, hair, gender, faith, alignment: plain text (the sheet's "characteristics")
 * A field shows only when the Actor's data has it, so another dnd5e version or an NPC never shows boxes it can't save.
 *
 * Who sees what (enforced here, not only in the view):
 *   - owner and GM: everything, and they can edit;
 *   - observer: the public biography, the appearance text and the characteristics (never the private biography or the
 *     personality fields);
 *   - limited or no permission: nothing.
 * updateBiography rejects anyone who isn't an owner or the GM and writes only the fields whose value changed, so an
 * untouched field (and its HTML) is never rewritten.
 */
import {canEdit} from './actions.mjs';

export const RICH = [['biography.value', 'Biography'], ['biography.public', 'Public biography']];
export const PERSONALITY = [['trait', 'Personality traits'], ['ideal', 'Ideals'], ['bond', 'Bonds'], ['flaw', 'Flaws']];
export const APPEARANCE = [['appearance', 'Appearance']];
export const CHARACTERISTICS = [['age', 'Age'], ['height', 'Height'], ['weight', 'Weight'], ['eyes', 'Eyes'], ['skin', 'Skin'], ['hair', 'Hair'],
  ['gender', 'Gender'], ['faith', 'Faith'], ['alignment', 'Alignment']];
const ALL = [...RICH, ...PERSONALITY, ...APPEARANCE, ...CHARACTERISTICS];
/** Labels by field key (system.details.<key>). */
export const LABELS = Object.fromEntries(ALL);
const OBSERVER_KEYS = new Set(['biography.public', ...APPEARANCE.map(f => f[0]), ...CHARACTERISTICS.map(f => f[0])]);
const refuse = error => ({ok: false, error});

const at = (obj, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const owns = (obj, path) => { const ks = path.split('.'), parent = ks.length > 1 ? at(obj, ks.slice(0, -1).join('.')) : obj; return !!parent && typeof parent === 'object' && Object.hasOwn(parent, ks.at(-1)); };
/** The stored (source) details, as the dnd5e sheet edits them; the prepared data when there is no source. */
const sourceDetails = actor => actor?._source?.system?.details ?? actor?.system?.details ?? null;
/** True when this Actor's data model has the field (system.details.<key>). */
export function hasField(actor, key) {
  const fields = actor?.system?.schema?.fields?.details?.fields;
  if (fields && key.split('.').reduce((f, k) => f?.[k] ?? f?.fields?.[k], fields)) return true;
  return owns(actor?.system?.details, key) || owns(sourceDetails(actor), key);
}
const str = v => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
/** The stored value of one field ('' when empty). */
export const sourceValue = (actor, key) => str(at(sourceDetails(actor), key));
/** The value to show (dnd5e shows prepared data and edits the source). */
const shownValue = (actor, key) => str(at(actor?.system?.details, key) ?? at(sourceDetails(actor), key));

/** 'owner' (owner or GM: all, editable), 'observer' (public parts only) or 'none' (limited or no permission). */
export function bioAccess(actor, user = globalThis.game?.user) {
  if (!actor || !user) return 'none';
  if (canEdit(actor, user)) return 'owner';
  if (actor.limited === true && user.isGM !== true) return 'none';
  return actor.testUserPermission?.(user, 'OBSERVER') === true ? 'observer' : 'none';
}
/** The field keys this user may read on this Actor. */
export const readableKeys = (actor, user = globalThis.game?.user) => {
  const access = bioAccess(actor, user);
  return access === 'none' ? [] : ALL.map(f => f[0]).filter(k => (access === 'owner' || OBSERVER_KEYS.has(k)) && hasField(actor, k));
};

/**
 * What this user may see of the Biography, by section, or null (nothing). Each field is {key, label, value, source,
 * rich}. Never contains a field the user may not read.
 */
export function biographyFor(actor, user = globalThis.game?.user) {
  const access = bioAccess(actor, user);
  if (access === 'none') return null;
  const keys = new Set(readableKeys(actor, user));
  const pick = list => list.filter(([k]) => keys.has(k)).map(([key, label]) => ({key, label, value: shownValue(actor, key), source: sourceValue(actor, key), rich: key.startsWith('biography.')}));
  return {access, backstory: pick(RICH), personality: pick(PERSONALITY), appearance: pick(APPEARANCE), characteristics: pick(CHARACTERISTICS)};
}

/**
 * Saves Biography edits: {key: value} with keys from the list above. Owner or GM only (refused otherwise). Only fields
 * this Actor has, as text, and only those that differ from what is stored are written, in one actor.update.
 */
export async function updateBiography(actor, changes, user = globalThis.game?.user) {
  if (!actor) return refuse('No character to save the biography to.');
  if (bioAccess(actor, user) !== 'owner') return refuse(`You don't own ${actor.name ?? 'this character'}, so you can't change its biography.`);
  const diff = {};
  for (const [key, value] of Object.entries(changes ?? {})) {
    if (!LABELS[key] || !hasField(actor, key) || typeof value !== 'string') continue;
    if (value !== sourceValue(actor, key)) diff[`system.details.${key}`] = value;
  }
  if (!Object.keys(diff).length) return {ok: true, result: null};
  await actor.update(diff);
  return {ok: true, result: diff};
}

/** Removes <section class="secret"> blocks (Foundry's GM / owner secrets) for a reader who may not see them. */
export function stripSecrets(html) {
  const text = str(html);
  const Parser = globalThis.DOMParser;
  if (Parser) {
    try {
      const doc = new Parser().parseFromString(`<div>${text}</div>`, 'text/html'), root = doc.body.firstElementChild;
      root.querySelectorAll('section.secret').forEach(s => s.remove());
      return root.innerHTML;
    } catch { /* fall back to the pattern below */ }
  }
  return text.replace(/<section\b[^>]*class="[^"]*\bsecret\b[^"]*"[^>]*>[\s\S]*?<\/section>/gi, '');
}
/**
 * The rich fields ready to show, with Foundry's own enrichment (links, rolls) when it is there: secrets only for owners
 * and the GM, like the dnd5e sheet. {key: html}, only for fields this user may read.
 */
export async function enrichBiography(actor, user = globalThis.game?.user) {
  const bio = biographyFor(actor, user);
  if (!bio) return {};
  const secrets = bio.access === 'owner', TE = globalThis.foundry?.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  const out = {};
  for (const f of bio.backstory) {
    let html = f.value;
    try { if (typeof TE?.enrichHTML === 'function') html = await TE.enrichHTML(html, {secrets, relativeTo: actor, rollData: actor.getRollData?.()}); } catch { /* show it as stored */ }
    out[f.key] = secrets ? str(html) : stripSecrets(html);
  }
  return out;
}

// ---------- Draft (the edits typed but not saved, kept on the open sheet so a redraw never loses them) ----------

/** The open sheet's Biography draft for its character: {actorId, values: {key: text}, touched: Set of rich keys}. */
export function bioDraft(sheet) {
  const id = sheet?.document?.id ?? null;
  if (!sheet.bioDraft || sheet.bioDraft.actorId !== id) sheet.bioDraft = {actorId: id, values: {}, touched: new Set()};
  return sheet.bioDraft;
}
export const isBioDirty = sheet => !!sheet?.bioDraft && Object.keys(sheet.bioDraft.values).length > 0;
/** Records one typed value; a value back to what is stored is no longer a change. Returns whether the draft is dirty. */
export function setDraft(sheet, key, value) {
  const d = bioDraft(sheet);
  if (!LABELS[key]) return isBioDirty(sheet);
  if (str(value) === sourceValue(sheet.document, key)) delete d.values[key]; else d.values[key] = str(value);
  return isBioDirty(sheet);
}
export function clearDraft(sheet) { if (sheet) sheet.bioDraft = null; }
/**
 * Reads the rich editors the user has typed in (only those: an editor's own clean-up of untouched HTML is never
 * taken as a change) into the draft. Called before a redraw and before Save.
 */
export function syncRichDraft(sheet, root = sheet?.element) {
  const d = sheet?.bioDraft;
  if (!d?.touched?.size || !root?.querySelectorAll) return;
  for (const el of root.querySelectorAll('prose-mirror[data-bio]')) {
    const key = el.dataset?.bio ?? el.getAttribute?.('data-bio');
    if (!d.touched.has(key)) continue;
    try { if (typeof el.value === 'string') setDraft(sheet, key, el.value); } catch { /* keep what the draft has */ }
  }
}
