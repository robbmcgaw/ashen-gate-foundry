/**
 * Player visibility (owned by the Hub): which parts of the Hub players see, so the GM can introduce systems one at a time.
 * Stored in the world setting `playerVisibility` as {partKey: boolean}; a missing key means shown, so the default ({})
 * shows everything and parts added later start shown. Only the GM can change it. The GM always sees every part.
 *
 * A part backed by another Ashen Gate module is also hidden from players when that module is not active, or when its
 * player-facing interface is off. That is read only through its public api.playerAccess.getState() (contract
 * ag-player-access/1) and, for the party stash, Utilities' api.stash.isEnabled(); never its settings or flags.
 */
import {MODULE_ID, esc} from './constants.mjs';

export const SETTING = 'playerVisibility';

/** Every part, in GM Setup order. `partner` is the module that backs it; `core` parts stay on in the "Core only" preset. */
export const PARTS = [
  {key: 'overview', label: 'Overview (skills, saves, senses)', core: true},
  {key: 'combat', label: 'Combat', core: true},
  {key: 'inventory', label: 'Inventory: character items', core: true},
  {key: 'partyStash', label: 'Inventory: party stash', partner: 'ashen-gate-utilities', partnerLabel: 'Utilities'},
  {key: 'magic', label: 'Magic', core: true},
  {key: 'features', label: 'Features', core: true},
  {key: 'rest', label: 'Short and Long Rest buttons', core: true},
  {key: 'equipment', label: 'Equipment slots (paper doll)', core: true},
  {key: 'companions', label: 'Companions'},
  {key: 'journey', label: 'Journey (alpha): accomplishments log', core: true},
  {key: 'hotbars', label: 'Hotbars (mastery & marks, quick bar)', core: true},
  // 0.18.0: Strain is a character resource, so only this toggle hides the bar (Cinders' Player Access hides the Cinders panel).
  {key: 'strain', label: 'Strain bar (Ashen Gate | Cinders)'},
  {key: 'professions', label: 'Ashen Gate: Professions', partner: 'ashen-gate-profession-ledger', partnerLabel: 'Profession Ledger'},
  {key: 'perks', label: 'Ashen Gate: Perks', partner: 'ashen-gate-skill-trees', partnerLabel: 'Skill Trees'},
  {key: 'cinders', label: 'Ashen Gate: Cinders', partner: 'ashen-gate-cinders', partnerLabel: 'Cinders'},
  {key: 'renown', label: 'Ashen Gate: Renown (and Pantheon)', partner: 'ashen-gate-factions', partnerLabel: 'Renown'},
  {key: 'quests', label: 'Ashen Gate: Quests', partner: 'ashen-gate-quest-manager', partnerLabel: 'Quest Log'},
  {key: 'locations', label: 'Ashen Gate: Locations', partner: 'ashen-gate-locations', partnerLabel: 'Locations'},
  {key: 'base', label: 'Ashen Gate: Base', partner: 'ashen-gate-headquarters', partnerLabel: 'Headquarters'}
];
const BY_KEY = new Map(PARTS.map(p => [p.key, p]));
/** The part key for a partner module's Ashen Gate sub-tab (or the party stash), or null. */
export const partForPartner = id => PARTS.find(p => p.partner === id)?.key ?? null;

export const PRESETS = [
  {id: 'everything', label: 'Everything', values: () => Object.fromEntries(PARTS.map(p => [p.key, true]))},
  {id: 'core', label: 'Core only', values: () => Object.fromEntries(PARTS.map(p => [p.key, p.core === true]))}
];

const refuse = error => ({ok: false, error});
const isGM = (user = globalThis.game?.user) => user?.isGM === true;

/** The stored toggles, cleaned: every known part as a boolean (missing or invalid = shown). */
export function readVisibility() {
  let raw = null;
  try { raw = globalThis.game?.settings?.get?.(MODULE_ID, SETTING); } catch { raw = null; }
  const obj = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(PARTS.map(p => [p.key, obj[p.key] !== false]));
}

/** GM only. `patch` is {partKey: boolean}; unknown keys or non-boolean values are refused, nothing is written. */
export async function setVisibility(patch, user = globalThis.game?.user) {
  if (!isGM(user)) return refuse('Only the GM can change what players see in the Character Hub.');
  if (!patch || typeof patch !== 'object') return refuse('Player visibility needs {part: true/false}.');
  for (const [k, v] of Object.entries(patch)) {
    if (!BY_KEY.has(k)) return refuse(`Unknown Character Hub part ${k}.`);
    if (typeof v !== 'boolean') return refuse(`Player visibility for ${k} must be true or false.`);
  }
  const next = {...readVisibility(), ...patch};
  await globalThis.game.settings.set(MODULE_ID, SETTING, next);
  return {ok: true, result: next};
}
/** GM only: sets every toggle from a preset ('everything' or 'core'). */
export function applyPreset(id, user = globalThis.game?.user) {
  const preset = PRESETS.find(p => p.id === id);
  if (!preset) return Promise.resolve(refuse(`Unknown preset ${id}.`));
  return setVisibility(preset.values(), user);
}

/**
 * Why players can't see a partner module, or null when they can. Uses only the public API: an inactive module,
 * a Player Access state that is off, or a getState() that throws all hide it. A module without playerAccess
 * (older versions) is not hidden here; its own checks still apply.
 */
export function partnerHiddenReason(id, label = id) {
  const m = globalThis.game?.modules?.get?.(id);
  if (!m?.active || !m.api) return `${label} is not active`;
  const access = m.api.playerAccess;
  if (typeof access?.getState === 'function') {
    let state = null;
    try { state = access.getState(); } catch { return `${label} refuses player access`; }
    if (state?.playerAccessEnabled !== true) return `${label} Player Access is off`;
  }
  if (id === 'ashen-gate-utilities' && typeof m.api.stash?.isEnabled === 'function') {
    let on = true;
    try { on = m.api.stash.isEnabled() === true; } catch { on = false; }
    if (!on) return 'the party stash is off in Utilities';
  }
  return null;
}

/** Why players don't see this part, or null when they do (independent of who is asking). */
export function hiddenReason(key, toggles = readVisibility()) {
  const part = BY_KEY.get(key);
  if (!part) return null;
  if (toggles[key] === false) return 'turned off in GM Setup';
  return part.partner ? partnerHiddenReason(part.partner, part.partnerLabel) : null;
}
/** True when this user sees the part: always for the GM, else when nothing hides it from players. */
export const canSee = (key, user = globalThis.game?.user) => isGM(user) || !hiddenReason(key);

/** For Hub-owned actions: a refusal when the part is hidden from this (non-GM) user, else null. */
export function requirePart(key, user = globalThis.game?.user) {
  if (isGM(user)) return null;
  const reason = hiddenReason(key);
  return reason ? refuse(`The GM hasn't shared ${BY_KEY.get(key)?.label ?? key} with players yet.`) : null;
}

/** GM-only badge on a part players can't see: "Hidden from players: <reason>". Empty for players or visible parts. */
export function hiddenBadge(keys, user = globalThis.game?.user) {
  if (!isGM(user)) return '';
  const list = Array.isArray(keys) ? keys : [keys];
  const reasons = list.map(k => hiddenReason(k)).filter(Boolean);
  if (reasons.length < list.length || !reasons.length) return '';
  const text = `Hidden from players: ${reasons[0]}`;
  return ` <span class="ag-badge ag-badge--warn agch-hidden" title="${esc(text)}"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> ${esc(text)}</span>`;
}

/** Registers the world setting (GM-only by Foundry's world scope). */
export function registerVisibilitySetting(settings = globalThis.game?.settings, onChange = () => {}) {
  settings?.register?.(MODULE_ID, SETTING, {scope: 'world', config: false, type: Object, default: {}, onChange});
}
