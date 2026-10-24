// Shared test helper: player-visible output must not show Ashen Gate canonical ids (REC-ALCHEMY-FIELD-01 etc.).
// Usage in a module test:
//   import {assertNoIds} from '../../../scripts/test-helpers/no-ids.mjs';
//   assertNoIds(renderedHtml, 'profession ledger recipe list');
// Pass rendered HTML, text, tooltip/aria strings or notification text. Markup is stripped to text plus the
// attributes users can read (title, data-tooltip, aria-label, placeholder, alt, value of option/button text);
// ids in data-*, href, name, class and value attributes used for wiring are fine and ignored.
import assert from 'node:assert/strict';

export const ID_PREFIXES = ['REC', 'MAT', 'ITEM', 'PERK', 'PROF', 'LOC', 'NPC', 'QUEST', 'ORDER', 'CONTRACT', 'FAC', 'SHOP', 'MLIST', 'HANDOUT', 'CRE', 'NODE', 'BF', 'MUT', 'POWER', 'TREE', 'SVC'];
export const ID_PATTERN = /\b(REC|MAT|ITEM|PERK|PROF|LOC|NPC|QUEST|ORDER|CONTRACT|FAC|SHOP|MLIST|HANDOUT|CRE|NODE|BF|MUT|POWER|TREE|SVC)-[A-Z0-9_-]+/;

/** Machine tokens (relation names, status/visibility values, entity types) that must not reach players either. */
export const TOKEN_PATTERN = /\b(also_available_as_journal|starting_recipe|transformed_form_of|reveal_gated|HandoutItem|ProfessionPerk|[a-z]+(?:_[a-z]+)+)\b/;
export const TOKEN_WORDS = ['also_available_as_journal', 'starting_recipe', 'transformed_form_of', 'reveal_gated', 'HandoutItem', 'ProfessionPerk'];

const READABLE_ATTRS = ['title', 'data-tooltip', 'data-tooltip-text', 'aria-label', 'placeholder', 'alt', 'aria-description'];

/** The text a user can read from an HTML string: text nodes plus readable attributes. */
export function visibleText(html) {
  const s = String(html ?? '');
  const attrs = [];
  for (const a of READABLE_ATTRS) for (const m of s.matchAll(new RegExp(`\\s${a}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'gi'))) attrs.push(m[2] ?? m[3]);
  const text = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
  return [text, ...attrs].join('\n');
}

/** First id-looking string in the visible text of `html`, or null. */
export function findId(html) {
  const m = visibleText(html).match(ID_PATTERN);
  return m ? m[0] : null;
}

/** Fails when player-visible output (HTML or plain text) contains a canonical id. */
export function assertNoIds(output, where = 'output') {
  const hit = findId(output);
  assert.equal(hit, null, `${where} shows the id "${hit}" to the user`);
}

/** First machine token (snake_case word or known token) in the visible text, or null. Plain words like "gm" are checked by name. */
export function findToken(html) {
  const text = visibleText(html);
  const m = text.match(TOKEN_PATTERN);
  return m ? m[0] : null;
}

/** Fails when player-visible output shows a canonical id or a machine token such as also_available_as_journal. */
export function assertNoMachineText(output, where = 'output') {
  assertNoIds(output, where);
  const hit = findToken(output);
  assert.equal(hit, null, `${where} shows the machine token "${hit}" to the user`);
}
