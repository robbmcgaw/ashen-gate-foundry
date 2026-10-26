/** 0.58.4: the professions fallback (no Profession Ledger) says what is true. Mocked Foundry; logic only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {PANELS} from '../scripts/partners.mjs';

const render = modules => { installGlobals({user: users.owner, modules}); const p = PANELS.find(x => x.id === 'ashen-gate-profession-ledger'); return p?.summary?.(makeActor(), {...(modules['ashen-gate-profession-ledger']?.api ?? {})}) ?? ''; };
test('Ledger without getProfessions and Skill Trees active but no visible tree: no "shows here when Skill Trees is active"', () => {
  const ledger = {active: true, api: {getProfessionProgress: () => null, getKnownRecipes: () => []}};
  const html = render({'ashen-gate-profession-ledger': ledger, 'ashen-gate-skill-trees': {active: true, api: {listTrees: () => []}}});
  assert.match(html, /No profession trees yet/); assert.doesNotMatch(html, /when Skill Trees is active/);
});
test('Ledger without getProfessions and no Skill Trees: points at the Ledger', () => {
  const html = render({'ashen-gate-profession-ledger': {active: true, api: {getProfessionProgress: () => null, getKnownRecipes: () => []}}});
  assert.match(html, /Profession levels show here when the Profession Ledger is active/); assert.doesNotMatch(html, /Skill Trees is active/);
});
test('a refusing listTrees (hidden from players) is the same as none', () => {
  const html = render({'ashen-gate-profession-ledger': {active: true, api: {getProfessionProgress: () => null}}, 'ashen-gate-skill-trees': {active: true, api: {listTrees: () => { throw new Error('hidden'); }}}});
  assert.match(html, /No profession trees yet/);
});
