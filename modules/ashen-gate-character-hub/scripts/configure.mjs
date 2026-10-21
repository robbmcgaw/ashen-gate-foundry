/**
 * Right-click "configure": opens dnd5e's own configuration window for a value, the same one the standard character
 * sheet opens (BaseActorSheet#showConfiguration in dnd5e 6). Those windows edit the Actor through dnd5e's own data,
 * so the Hub stores nothing. Like the standard sheet, only users who can edit the character (owner or GM) may open them.
 */
import {canEdit} from './actions.mjs';

const actorApps = () => globalThis.dnd5e?.applications?.actor ?? {};
const sharedApps = () => globalThis.dnd5e?.applications?.shared ?? {};

/** Proficiency trait → dnd5e trait config class name (as the standard sheet picks it). */
const TRAIT_CLASSES = {languages: 'LanguagesConfig', tool: 'ToolsConfig', weapon: 'WeaponsConfig', armor: 'TraitsConfig'};

/** kind → (actor, key) → {cls, options}. Same classes and options as the dnd5e 6 standard sheet. */
export const CONFIGS = {
  ability: (actor, key) => ({cls: actorApps().AbilityConfig, options: {key}}),
  armorClass: () => ({cls: actorApps().ArmorClassConfig}),
  death: () => ({cls: actorApps().DeathConfig}),
  hitDice: () => ({cls: actorApps().HitDiceConfig}),
  hitPoints: () => ({cls: actorApps().HitPointsConfig}),
  initiative: () => ({cls: actorApps().InitiativeConfig}),
  movement: () => ({cls: sharedApps().MovementSensesConfig, options: {type: 'movement'}}),
  senses: () => ({cls: sharedApps().MovementSensesConfig, options: {type: 'senses'}}),
  skill: (actor, key) => ({cls: actorApps().SkillToolConfig, options: {trait: 'skills', key}}),
  trait: (actor, key) => ({cls: actorApps()[TRAIT_CLASSES[key]], options: {trait: key}})
};

/** Opens dnd5e's configuration window for one value. Resolves to {ok, result | error}. */
export async function openConfig(actor, kind, key = null) {
  const make = CONFIGS[kind];
  if (!make) return {ok: false, error: `Nothing to configure for ${kind}.`};
  if (!canEdit(actor)) return {ok: false, error: `You don't own ${actor?.name ?? 'this character'}, so you can't change its settings.`};
  const {cls, options = {}} = make(actor, key);
  if (typeof cls !== 'function') return {ok: false, error: 'This version of dnd5e has no configuration window for that. Use the native sheet.'};
  try {
    const app = new cls({document: actor, ...options});
    await app.render({force: true});
    return {ok: true, result: app};
  } catch (err) {
    console.error('ashen-gate-character-hub | configure', kind, err);
    return {ok: false, error: `The configuration window could not open: ${err?.message ?? err}`};
  }
}

/** data-* attributes that mark an element as configurable by right-click. */
export const configAttrs = (kind, key = null) => ` data-config="${kind}"${key !== null && key !== undefined ? ` data-config-key="${String(key).replace(/[^A-Za-z0-9_-]/g, '')}"` : ''}`;
