/**
 * NPC Codex from the Hub (0.31.0): a header button that opens General Manager's read-only Codex window through its public
 * api.codex.openPlayerView (feature-detected). The GM always gets it; players only while Manager's "NPC Codex player
 * access" is on (api.codex.playerAccessEnabled). Manager decides what each user sees; the Hub stores no Codex data.
 */
import {btn} from './buttons.mjs';

const refuse = error => ({ok: false, error});
/** Manager's api.codex when it is active and can open the Codex view, else null. */
export function codexApi() {
  const m = globalThis.game?.modules?.get?.('ashen-gate-manager'), c = m?.active ? m.api?.codex : null;
  return typeof c?.openPlayerView === 'function' ? c : null;
}
/** May this user open the Codex from the Hub? GM: whenever Manager offers it; players: while Manager shares it. */
export function codexAvailable(user = globalThis.game?.user) {
  const c = codexApi();
  if (!c) return false;
  if (user?.isGM === true) return true;
  try { return c.playerAccessEnabled?.() === true; } catch { return false; }
}
export function codexBtn() {
  return codexAvailable() ? btn('codex-open', 'NPC Codex', {kind: 'ghost', icon: 'fa-solid fa-address-book', always: true, title: 'Open the NPC Codex (General Manager): the NPCs revealed to you'}) : '';
}
/** Opens Manager's Codex window. Checked again here, and again by Manager. */
export async function openCodex() {
  if (!codexAvailable()) return refuse(codexApi() ? 'The GM hasn\'t shared the NPC Codex with players.' : 'General Manager\'s NPC Codex is not available.');
  try { return {ok: true, result: await codexApi().openPlayerView()}; } catch (err) { return refuse(`NPC Codex: ${err?.message ?? err}`); }
}
