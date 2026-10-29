/** 0.32.0: an unidentified pin always shows its label; a revealed pin follows the name setting as before. Mocked Foundry: logic only, not the live canvas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULE_ID, normalizeLocation, playerView, pinPresentation, notePatch} from '../scripts/model.mjs';
import {applyPinLook, isUnidentifiedPin} from '../scripts/pin-look.mjs';

/** A Map Note as the canvas holds it: its player page carries the view JSON (what players can already read). */
function note({state = 'unidentified', text = 'Abandoned Hamlet', keep = false, showName = false, hover = false, view, noPage = false} = {}) {
  const flags = {[MODULE_ID]: {pinKey: 'PIN-abc', pin: {src: 'x.webp', size: 48, ...(keep ? {keep: true} : {}), ...(showName ? {showName: true} : {})}}};
  const viewJson = view ?? JSON.stringify({key: 'k', state, name: text});
  const page = noPage ? null : {getFlag: (s, k) => s === MODULE_ID && k === 'view' ? viewJson : undefined};
  const doc = {text, iconSize: 48, fontSize: 32, textAnchor: 1, label: text, page, getFlag: (s, k) => flags[s]?.[k], flags};
  return {hover, controlled: false, isPreview: false, layer: {highlightObjects: false}, renderFlags: {set() {}}, controlIcon: null,
    tooltip: {visible: false, text, position: {x: 0, y: 0, set() {}}, style: {}}, document: doc};
}
const core = n => { n.tooltip.visible = n.hover; return n; };   // core sets tooltip.visible from hover on every refresh, then calls refreshNote

test('data: an unidentified location is labelled with its generic label, a hidden one has no text, a revealed one its name', () => {
  const loc = {id: 'LOC-TEST-HAMLET', name: '[TEST] Real Name', unidentifiedLabel: 'Abandoned Hamlet', pin: {}, published: undefined};
  assert.equal(pinPresentation({...loc, state: 'unidentified'}).text, 'Abandoned Hamlet');
  assert.equal(pinPresentation({...loc, state: 'hidden'}).text, '');
  assert.equal(pinPresentation({...loc, state: 'revealed'}).text, '[TEST] Real Name');
  assert.equal(pinPresentation({...loc, state: 'unidentified'}).text, 'Abandoned Hamlet', 'unchanged by 0.32.0: no new data on the Note');
  // The Note needs no new flag: nothing about the label changes the patch of an up-to-date pin.
  const key = 'k'.repeat(16), pres = pinPresentation({...loc, state: 'unidentified'});
  const settled = {text: pres.text, iconSize: pres.size, texture: {src: pres.src}, flags: {[MODULE_ID]: {pinKey: key, pin: {src: pres.src, size: pres.size}}}};
  assert.equal(notePatch(settled, key, pres), null);
});

test('isUnidentifiedPin: read from the player page; hidden, revealed, pageless and unreadable pins are not', () => {
  const unid = playerView({...normalizeLocation({id: 'LOC-TEST-A', name: 'A', unidentifiedLabel: 'Abandoned Hamlet'}), state: 'unidentified', published: undefined}) ?? {};
  assert.equal(isUnidentifiedPin(note({view: JSON.stringify(unid)})), true);
  assert.equal(isUnidentifiedPin(note({state: 'revealed'})), false);
  assert.equal(isUnidentifiedPin(note({view: ''})), false, 'a Hidden location has a page with no view');
  assert.equal(isUnidentifiedPin(note({noPage: true})), false);
  assert.equal(isUnidentifiedPin(note({view: '{not json unidentified'})), false);
  assert.equal(isUnidentifiedPin(note({view: JSON.stringify({state: 'revealed', name: 'Says unidentified in its description', description: 'unidentified'})})), false);
  assert.equal(isUnidentifiedPin(null), false);
});

test('applyPinLook: an unidentified label is shown without hover in every name mode; a revealed pin still follows the setting', () => {
  for (const nameMode of ['hover', 'always']) {
    const u = core(note({state: 'unidentified'}));
    applyPinLook(u, {nameMode});
    assert.equal(u.tooltip.visible, true, `unidentified, ${nameMode}, not hovered`);
  }
  const hoverRevealed = core(note({state: 'revealed', text: 'The Muster'}));
  applyPinLook(hoverRevealed, {nameMode: 'hover'});
  assert.equal(hoverRevealed.tooltip.visible, false, 'revealed + hover mode: only on hover, as before');
  const hovered = core(note({state: 'revealed', text: 'The Muster', hover: true}));
  applyPinLook(hovered, {nameMode: 'hover'});
  assert.equal(hovered.tooltip.visible, true);
  const alwaysRevealed = core(note({state: 'revealed', text: 'The Muster'}));
  applyPinLook(alwaysRevealed, {nameMode: 'always'});
  assert.equal(alwaysRevealed.tooltip.visible, true, 'revealed + always mode: shown, as before');
});

test('re-render applies it to existing pins with no data written, and it follows a state change', () => {
  const n = core(note({state: 'unidentified'}));
  const before = JSON.stringify(n.document.flags);
  for (let i = 0; i < 3; i++) { core(n); applyPinLook(n, {nameMode: 'hover'}); assert.equal(n.tooltip.visible, true); }
  assert.equal(JSON.stringify(n.document.flags), before, 'no flag, text or label was written');
  assert.equal(n.document.text, 'Abandoned Hamlet');
  // The GM reveals it: the page now carries a revealed view and the next refresh goes back to hover-only.
  n.document.page = {getFlag: () => JSON.stringify({key: 'k', state: 'revealed', name: 'Hamlet'})};
  n.document.text = 'Hamlet'; n.document.label = 'Hamlet';
  core(n); applyPinLook(n, {nameMode: 'hover'});
  assert.equal(n.tooltip.visible, false);
});

test('respects Keep pin art proportions: the name stays hidden unless "show name" is on, and then the unidentified label is shown', () => {
  const hidden = core(note({state: 'unidentified', keep: true}));
  applyPinLook(hidden, {nameMode: 'always'});
  assert.equal(hidden.tooltip.visible, false, 'keep without show name: the art carries the name, nothing is drawn');
  const shown = core(note({state: 'unidentified', keep: true, showName: true}));
  applyPinLook(shown, {nameMode: 'hover'});
  assert.equal(shown.tooltip.visible, true, 'keep + show name: the unidentified label is always drawn');
});

test('never reveals a label that is not ours: an unidentified page but a note with no text and no view is left alone', () => {
  const n = core(note({state: 'unidentified', text: ''}));
  n.document.page = {getFlag: () => JSON.stringify({state: 'unidentified', name: 'Abandoned Hamlet'})};
  n.document.label = 'Abandoned Hamlet'; n.tooltip.text = 'Abandoned Hamlet'; // core falls back to the page name when the text is empty
  applyPinLook(n, {nameMode: 'hover'});
  assert.equal(n.tooltip.visible, true, 'the player page carries a view, so the page-name label is safe (the Selected-players rule)');
  const bare = core(note({state: 'unidentified', text: '', noPage: true}));
  bare.document.label = 'Some page name';
  applyPinLook(bare, {nameMode: 'hover'});
  assert.equal(bare.tooltip.visible, false);
});
