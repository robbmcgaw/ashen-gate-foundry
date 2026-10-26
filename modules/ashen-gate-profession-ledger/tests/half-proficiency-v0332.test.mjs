import test from 'node:test';
import assert from 'node:assert/strict';
import {toolProficient} from '../scripts/checks.mjs';

test('half proficiency (Jack of All Trades) is not tool proficiency', () => {
  const actor = v => ({system: {tools: {herb: {value: v}}}});
  assert.equal(toolProficient(actor(0.5), 'herb'), false);
  assert.equal(toolProficient(actor(0), 'herb'), false);
  assert.equal(toolProficient(actor(1), 'herb'), true);
  assert.equal(toolProficient(actor(2), 'herb'), true);
});
