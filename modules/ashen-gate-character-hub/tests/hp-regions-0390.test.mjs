/** 0.39.0: the HP bar's regions side by side (current, temp, empty, reduced or raised max). Mocked Foundry: proves the
 * geometry and markup, not how Foundry's real window draws it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {hpBand, hpBar, hpBarHtml, hpRegions, hpWords} from '../scripts/character.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {HELP_HTML} from '../scripts/help.mjs';
import {VERSION} from '../scripts/constants.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const hp = (value, temp, tempmax, max = 30) => ({value, temp, max, tempmax, effectiveMax: max + tempmax});
const ORDER = ['hp', 'temp', 'empty', 'lost', 'boost'];
const shape = h => hpRegions(h).map(r => [r.kind, r.width]);

/** Every layout holds: widths add up to exactly 100, regions touch without overlapping, in the fixed order, none empty. */
function wellFormed(h, name) {
  const rs = hpRegions(h);
  assert.ok(rs.length >= 1, name);
  assert.equal(Math.round(rs.reduce((s, r) => s + r.width, 0) * 10), 1000, `${name}: sums to 100%`);
  let at = 0;
  for (const r of rs) {
    assert.ok(Math.abs(r.left - at) < 1e-9, `${name}: ${r.kind} starts where the previous ends`);
    assert.ok(r.width >= 0 && r.amount > 0, `${name}: ${r.kind} has a size`);
    assert.equal(Math.round(r.width * 10), r.width * 10, `${name}: one decimal`);
    at = Math.round((at + r.width) * 10) / 10;
  }
  const idx = rs.map(r => ORDER.indexOf(r.kind));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), `${name}: left-to-right order`);
  assert.equal(new Set(idx).size, idx.length, `${name}: one region of each kind`);
  return rs;
}

test('the bar is max + raised max + temp; each region is its own share of it', () => {
  // 18 / 35 HP, +6 temp, +5 max (base 30): D = 41.
  assert.deepEqual(shape(hp(18, 6, 5)), [['hp', 43.9], ['temp', 14.6], ['empty', 29.3], ['boost', 12.2]]);
  assert.deepEqual(shape(hp(18, 0, 0)), [['hp', 60], ['empty', 40]], 'damaged only');
  assert.deepEqual(shape(hp(18, 6, 0)), [['hp', 50], ['temp', 16.7], ['empty', 33.3]], 'damaged + temp (of 36)');
  assert.deepEqual(shape(hp(20, 5, -10)), [['hp', 57.1], ['temp', 14.3], ['lost', 28.6]], 'reduction + temp at full (of 35)');
  assert.deepEqual(shape(hp(10, 5, -10)), [['hp', 28.6], ['temp', 14.3], ['empty', 28.6], ['lost', 28.5]], 'temp sits right after HP, never over the empty part');
});

test('edge cases: every layout sums to 100%, with no overlaps and in order', () => {
  const cases = {
    'max 0, nothing': [{value: 0, temp: 0, max: 0, tempmax: 0, effectiveMax: 0}, [['empty', 100]]],
    'max 0, temp only': [{value: 0, temp: 5, max: 0, tempmax: 0, effectiveMax: 0}, [['temp', 100]]],
    'current 0': [hp(0, 0, 0), [['empty', 100]]],
    'current 0 + temp': [hp(0, 10, 0), [['temp', 25], ['empty', 75]]],
    'above the effective max is clamped': [hp(40, 0, 0), [['hp', 100]]],
    'above a reduced max is clamped': [hp(30, 0, -10), [['hp', 66.7], ['lost', 33.3]]],
    'raise only, full': [hp(35, 0, 5), [['hp', 85.7], ['boost', 14.3]]],
    'raise only, damaged': [hp(10, 0, 5), [['hp', 28.6], ['empty', 57.1], ['boost', 14.3]]],
    'reduction only': [hp(10, 0, -5), [['hp', 33.3], ['empty', 50], ['lost', 16.7]]],
    'reduction larger than max': [{value: 3, temp: 0, max: 10, tempmax: -15, effectiveMax: -5}, [['lost', 100]]],
    'reduction larger than max + temp': [{value: 0, temp: 5, max: 10, tempmax: -15, effectiveMax: -5}, [['temp', 33.3], ['lost', 66.7]]],
    'raise + temp + damage': [hp(18, 6, 5), [['hp', 43.9], ['temp', 14.6], ['empty', 29.3], ['boost', 12.2]]],
    'thirds round to exactly 100': [{value: 1, temp: 1, max: 2, tempmax: 0, effectiveMax: 2}, [['hp', 33.4], ['temp', 33.3], ['empty', 33.3]]],
    'no effectiveMax given': [{value: 5, temp: 0, max: 10, tempmax: 0}, [['hp', 50], ['empty', 50]]],
  };
  for (const [name, [h, want]] of Object.entries(cases)) { wellFormed(h, name); assert.deepEqual(shape(h), want, name); }
  for (let max = 0; max <= 12; max += 3) for (let adj = -14; adj <= 6; adj += 4) for (let temp = 0; temp <= 9; temp += 3) for (let v = 0; v <= max + 8; v += 2)
    wellFormed({value: v, temp, max, tempmax: adj, effectiveMax: max + adj}, `${v}/${max} adj ${adj} temp ${temp}`);
});

test('very small regions keep their place (2px minimum in CSS, shrinking the others, never past 100%)', () => {
  const rs = wellFormed({value: 2999, temp: 1, max: 3000, tempmax: 0, effectiveMax: 3000}, 'tiny');
  assert.deepEqual(rs.map(r => r.kind), ['hp', 'temp', 'empty']);
  assert.ok(rs[1].width <= 0.1 && rs[2].width <= 0.1, 'tiny shares round to a tenth or less');
  const html = hpBarHtml({value: 2999, temp: 1, max: 3000, tempmax: 0, effectiveMax: 3000});
  assert.equal((html.match(/class="agch-hp__seg /g) ?? []).length, 3, 'still one element each');
  assert.match(css, /\.agch-hp__bar \{ display: flex; \}/);
  assert.match(css, /\.agch-hp__seg \{[^}]*flex: 0 1 0; min-width: 2px;/, 'min width with flex-shrink, so neighbours give the room back');
  assert.match(css, /\.agch-hp__seg \+ \.agch-hp__seg \{ border-left: 1px solid var\(--agch-hp-edge\); \}/, '1px divider between neighbours');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.agch-app \.agch-hp__seg \{ transition: none; \} \}/);
});

test('raised max is extra capacity at the far end; HP above the normal max fills it from the left', () => {
  const b = hpRegions(hp(33, 6, 5)).at(-1);
  assert.equal(b.kind, 'boost'); assert.ok(Math.abs(b.used - 0.6) < 1e-9);
  assert.equal(hpRegions(hp(18, 6, 5)).at(-1).used, 0);
  assert.match(hpBarHtml(hp(33, 6, 5)), /agch-hp__boost" style="flex-basis:12\.2%"><span class="agch-hp__used" style="width:60\.0%"><\/span>/);
  assert.doesNotMatch(hpBarHtml(hp(18, 6, 5)), /agch-hp__used/);
  assert.match(css, /\.agch-hp__boost \{ background: color-mix\(in srgb, var\(--agch-hp-boost\) 18%, transparent\); box-shadow: inset 0 0 0 2px var\(--agch-hp-boost\); \}/, 'outlined and tinted blue');
});

test('markup: one element per region, in order; the numbers on top; tooltip and aria-valuetext in words; meter values', () => {
  const html = hpBarHtml(hp(18, 6, 5));
  assert.deepEqual([...html.matchAll(/class="agch-hp__seg agch-hp__(\w+)" style="flex-basis:([\d.]+)%"/g)].map(m => [m[1], Number(m[2])]), [['hp', 43.9], ['temp', 14.6], ['empty', 29.3], ['boost', 12.2]]);
  assert.match(html, /role="meter" aria-valuemin="0" aria-valuemax="35" aria-valuenow="18" aria-valuetext="18 of 35 hit points; 6 temporary hit points; maximum raised by 5" aria-label="Hit points"/);
  assert.match(html, /data-tooltip="18 of 35 hit points; 6 temporary hit points; maximum raised by 5\. Double-click to edit, right-click for dnd5e&#39;s hit point settings"|data-tooltip="18 of 35 hit points; 6 temporary hit points; maximum raised by 5\. Double-click to edit, right-click for dnd5e's hit point settings"/);
  assert.match(html, /<span class="agch-hp__text">18 \/ 35 HP <span class="agch-hp__temptext">\(\+6 TEMP\)<\/span> <span class="agch-hp__boosttext">\(\+5 MAX\)<\/span><\/span><\/div>$/);
  const off = hpBarHtml(hp(18, 6, 5), true);
  assert.match(off, /data-tooltip="18 of 35 hit points; 6 temporary hit points; maximum raised by 5"/, 'read-only: words only');
  assert.doesNotMatch(off, /tabindex|is-editable/);
  assert.equal(hpWords(hp(10, 1, -5)), '10 of 25 hit points; 1 temporary hit point; maximum reduced by 5');
  assert.equal(hpWords({value: 1, temp: 0, max: 1, tempmax: 0, effectiveMax: 1}), '1 of 1 hit point');
  const over = hpBarHtml(hp(40, 0, 0));
  assert.match(over, /aria-valuemax="30" aria-valuenow="30" aria-valuetext="40 of 30 hit points"/, 'the meter value stays in range; the words keep the real number');
  assert.match(hpBarHtml({value: 3, temp: 0, max: 10, tempmax: -15, effectiveMax: -5}), /aria-valuemax="0" aria-valuenow="0" aria-valuetext="3 of 0 hit points; maximum reduced by 15"/);
});

test('short cues: only on temp / lost / boost regions in an outer quarter of the bar, clear of the numbers', () => {
  const at = h => hpRegions(h).filter(r => r.cue).map(r => r.kind);
  assert.deepEqual(at(hp(18, 6, 5)), ['boost'], 'the blue end gets "+5 max"; temp is under the numbers');
  assert.match(hpBarHtml(hp(18, 6, 5)), /agch-hp__boost" style="flex-basis:12\.2%"><span class="agch-hp__cue" aria-hidden="true">\+5 max<\/span>/);
  assert.doesNotMatch(hpBarHtml(hp(10, 0, -10)), /agch-hp__cue/, 'the reduced part starts at 66.7%: not clear of the numbers');
  assert.match(hpBarHtml(hp(10, 0, -5)), /agch-hp__lost" style="flex-basis:16\.7%"><span class="agch-hp__cue" aria-hidden="true">−5 max<\/span>/);
  assert.match(hpBarHtml(hp(2, 4, -5)), /agch-hp__temp" style="flex-basis:11\.8%"><span class="agch-hp__cue" aria-hidden="true">\+4<\/span>/);
  assert.doesNotMatch(hpBarHtml(hp(18, 6, 0)), /agch-hp__cue/);
  assert.match(css, /@container agch-hpseg \(min-width: 4\.5em\) \{ \.agch-app \.agch-hp__cue \{ display: flex; \} \}/, 'shown only when the region is wide enough');
});

test('regression: hpBand and the texts are unchanged', () => {
  for (const [v, eff, band] of [[70, 100, 'high'], [69, 100, 'mid'], [30, 100, 'mid'], [29, 100, 'low'], [0, 0, 'low']]) assert.equal(hpBand(v, eff), band);
  const t = h => { const b = hpBar(h); return [b.band, b.text, b.tempText, b.boostText, b.lostText]; };
  assert.deepEqual(t(hp(18, 6, 5)), ['mid', '18 / 35 HP', '(+6 TEMP)', '(+5 MAX)', '']);
  assert.deepEqual(t(hp(11, 4, -15)), ['high', '11 / 15 HP', '(+4 TEMP)', '', '(−15 MAX)']);
  assert.deepEqual(t(hp(40, 0, 0)), ['high', '40 / 30 HP', '', '', ''], 'above max: the text keeps the real number');
  assert.deepEqual(t(hp(2, 0, 0)), ['low', '2 / 30 HP', '', '', '']);
});

test('Full, Compact and the read-only view all draw the regions; Help describes them', async () => {
  const Hub = createHubSheetClass(FakeActorSheetV2);
  const base = makeActor().system.attributes, h = {value: 18, temp: 6, max: 30, tempmax: 5, effectiveMax: 35};
  const actor = () => makeActor({system: {attributes: {...base, hp: h}}});
  for (const [name, opts] of [['full', {user: users.owner}], ['compact', {user: users.owner, settings: {compactMode: true}}], ['observer', {user: users.observer}]]) {
    installGlobals(opts); globalThis.document = {documentElement: {dataset: {}}};
    const html = await new Hub({document: actor()})._renderHTML();
    assert.deepEqual([...html.matchAll(/class="agch-hp__seg agch-hp__(\w+)"/g)].map(m => m[1]), ['hp', 'temp', 'empty', 'boost'], name);
    assert.match(html, /aria-valuetext="18 of 35 hit points; 6 temporary hit points; maximum raised by 5"/, name);
    assert.equal(/data-hp-bar data-band="mid" tabindex="0"/.test(html), name !== 'observer', `${name}: editable only for the owner`);
  }
  delete globalThis.document;
  assert.match(HELP_HTML, /current HP first, then temp HP in silver stripes, then missing HP/);
  assert.doesNotMatch(HELP_HTML, /blue frame/);
});
