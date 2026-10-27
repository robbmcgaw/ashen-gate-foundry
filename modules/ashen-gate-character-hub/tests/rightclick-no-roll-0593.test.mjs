/** 0.59.3: right-click (contextmenu, button 2, auxclick) never runs an action such as a roll; only a primary click or keyboard activation does. Mocked Foundry. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, primaryActivation} from '../scripts/sheet.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
function setup() {
  installGlobals({user: users.owner});
  const actor = makeActor(); actor.rolls = [];
  actor.rollSkill = async o => { actor.rolls.push(['skill', o.skill]); };
  const sheet = new Hub({document: actor});
  return {actor, sheet, target: {dataset: {action: 'roll-skill', skill: 'ath'}, closest: () => null}};
}
test('primaryActivation: left click and keyboard yes; right, middle, contextmenu, auxclick no; the click after a touch long-press no', () => {
  assert.equal(primaryActivation({type: 'click', button: 0, detail: 1}), true);
  assert.equal(primaryActivation({type: 'click', button: 0, detail: 0}), true, 'Enter / Space on a button');
  assert.equal(primaryActivation(undefined), true);
  for (const e of [{type: 'click', button: 2}, {type: 'click', button: 1}, {type: 'contextmenu', button: 2}, {type: 'auxclick', button: 1}, {type: 'pointerup', button: 2}]) assert.equal(primaryActivation(e), false, e.type + e.button);
  assert.equal(primaryActivation({type: 'click', button: 0, detail: 1}, 1000, 1200), false, 'release right after a context menu');
  assert.equal(primaryActivation({type: 'click', button: 0, detail: 1}, 1000, 1600), true);
  assert.equal(primaryActivation({type: 'click', button: 0, detail: 0}, 1000, 1200), true, 'keyboard is never swallowed');
});
test('a skill tile rolls on a left click and not on a right click or a click right after the context menu', async () => {
  const {actor, sheet, target} = setup();
  await sheet._onClickAction({type: 'click', button: 0, detail: 1}, target);
  assert.deepEqual(actor.rolls, [['skill', 'ath']]);
  await sheet._onClickAction({type: 'click', button: 2, detail: 1}, target);
  await sheet._onClickAction({type: 'contextmenu', button: 2}, target);
  await sheet._onClickAction({type: 'auxclick', button: 1}, target);
  assert.equal(actor.rolls.length, 1, 'no roll from button 2, 1, contextmenu or auxclick');
  sheet._onContextMenu({target: {closest: () => null}, preventDefault() {}, stopPropagation() {}});
  await sheet._onClickAction({type: 'click', button: 0, detail: 1}, target);
  assert.equal(actor.rolls.length, 1, 'a touch long-press release is not a roll');
  await sheet._onClickAction({type: 'click', button: 0, detail: 0}, target);
  assert.equal(actor.rolls.length, 2, 'Enter / Space still rolls');
});
