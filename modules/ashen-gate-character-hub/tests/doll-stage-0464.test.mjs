/**
 * 0.46.4 (Robb): the paper-doll art stage must not turn into a short, wide band again. Before this, a busy character
 * column squeezed the doll to its smallest height, and in a narrow Full window the art ran the whole window width
 * (about 730 x 200). These tests pin the CSS rules that keep it tall. Mocked: they prove the rules, not the live layout
 * (the sizes were measured in headless Chromium; see the PR).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const rule = sel => { const at = CSS.lastIndexOf(`${sel} {`); assert.ok(at >= 0, `rule ${sel}`); return CSS.slice(at, CSS.indexOf('}', at)); };
const FULL = '.agch-app .agch-root:not(.agch-root--compact) .agch-char .agch-doll';
const FIVE_SLOTS = 'calc(var(--agch-slot-max) * 5 + var(--ag-space-2) * 4)';

test('the art is four slots and three gaps tall, never a fixed wide aspect or a capped height', () => {
  const art = rule('.agch-app .agch-doll__art');
  assert.match(art, /height: calc\(var\(--agch-slot\) \* 4 \+ var\(--ag-space-2\) \* 3\)/);
  assert.doesNotMatch(art, /aspect-ratio|max-height|min-width/, 'no rule that lets the art go wide or short');
  for (const m of CSS.matchAll(/([^{}]*agch-doll__art[^{}]*)\{([^}]*)\}/g)) if (/agch-doll__art\s*$/.test(m[1])) assert.doesNotMatch(m[2], /aspect-ratio|max-height/, `no rule (${m[1].trim().slice(-60)}) changes the stage shape`);
});

test('slot sizing is unchanged: the usual size is the maximum, set by the doll\'s own size', () => {
  const doll = rule('.agch-app .agch-char .agch-doll');
  assert.match(doll, /--agch-slot-max: calc\(var\(--ag-slot\) \+ var\(--ag-space-3\)\)/);
  assert.match(doll, /--agch-slot-min: var\(--ag-icon-btn\)/);
  assert.match(doll, new RegExp(`flex: 0 1 ${FIVE_SLOTS.replace(/[()*+]/g, '\\$&')}`));
  assert.match(rule('.agch-app .agch-char .agch-doll > *'), /clamp\(var\(--agch-slot-min\), min\(\(100cqh - var\(--ag-space-2\) \* 4\) \/ 5, \(100cqw - var\(--ag-space-2\) \* 6\) \/ 7\), var\(--agch-slot-max\)\)/);
  assert.doesNotMatch(CSS, /slot-max2|@container agch-doll/, 'no short-doll (0.44.0) arrangement');
});

test('Full: the doll keeps its full height (five slots), so the art is not squeezed; Compact still shrinks', () => {
  const at = CSS.indexOf('\n' + FULL + ' {'), full = CSS.slice(at, CSS.indexOf('}', at));
  assert.ok(at >= 0, 'a top-level Full rule');
  assert.ok(full.includes(`min-height: ${FIVE_SLOTS}`), 'the floor is five full-size slots and four gaps');
  assert.doesNotMatch(rule('.agch-app .agch-char .agch-doll'), /min-height: calc\(var\(--agch-slot-max\)/, 'the base (Compact) floor stays the smallest size');
  assert.match(FULL, /:not\(\.agch-root--compact\)/);
});

test('a narrow Full window (900 px and under) centres a doll no wider than seven slots', () => {
  const at = CSS.indexOf('@container (max-width: 900px) {');
  assert.ok(at >= 0, 'the narrow-window container query');
  const block = CSS.slice(at, CSS.indexOf('\n}', at));
  const line = block.split('\n').find(l => l.includes(FULL + ' {'));
  assert.ok(line, 'the doll is sized inside the narrow-window query');
  assert.match(line, /max-width: calc\(var\(--agch-slot-max\) \* 7 \+ var\(--ag-space-2\) \* 6\)/);
  assert.match(line, /align-self: center/);
  assert.match(line, /width: 100%/);
});

test('the slots still flank the art in the old arrangement', () => {
  assert.match(rule('.agch-app .agch-char .agch-doll'), /grid-template-columns: auto minmax\(0, 1fr\) auto/);
  assert.match(rule('.agch-app .agch-char .agch-doll > .agch-doll__col'), /grid-row: 1 \/ span 2; grid-column: 1/);
  assert.match(rule('.agch-app .agch-char .agch-doll > .agch-doll__col ~ .agch-doll__col'), /grid-column: 3/);
  assert.match(rule('.agch-app .agch-char .agch-doll > .agch-doll__center'), /grid-row: 1; grid-column: 2/);
});
