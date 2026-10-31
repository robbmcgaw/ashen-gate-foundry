import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPerkCard,groupByTier,firstSentence,textOf,unreleasedPerkMessage} from '../scripts/perk-card.mjs';
// 0.24.4: perk cards in the Hub embed. Mocked Foundry and fake DOM: proves the markup and logic, not the live Forge UI.

const row=(a,b)=>`<tr><th>${a}</th><td>${b}</td></tr>`;
const DESC=`<h3>[TEST] Margin Notes</h3><table><tbody>${row('Profession / Tree','Artistry · Literary Arts')}${row('Specialty','Chronicler')}${row('Tier','Apprentice (level 1)')}${row('Type','Technique')}${row('Automation','GM decides')}${row('Requires','Nothing (open from the start)')}${row('Uses','At will')}${row('Tool',"Calligrapher's Supplies")}</tbody></table>`
  +`<h4>Effect &amp; Rules</h4><p>When you interview a [TEST] witness, you may note one detail. A second sentence follows.</p><h4>Notes</h4><p>Uses Calligrapher's Supplies. Costs one point.</p>`;

test('pure: meta pairs are separate, Requires hidden when Nothing, tree row dropped',()=>{
  const c=buildPerkCard('[TEST] Margin Notes',DESC);
  assert.deepEqual(c.meta.map(r=>r.label),['Specialty','Tier','Type','Automation','Uses','Tool']);
  assert.equal(c.meta.find(r=>r.label==='Tier').value,'Apprentice (level 1)');
  assert.equal(c.tier,'Apprentice (level 1)');
  assert.equal(c.summary,'When you interview a [TEST] witness, you may note one detail.');
});
test('pure: Requires shown when it is a real requirement',()=>{
  const c=buildPerkCard('X',DESC.replace('Nothing (open from the start)','[TEST] Perk A'));
  assert.ok(c.meta.some(r=>r.label==='Requires'&&r.value==='[TEST] Perk A'));
});
test('pure: details keep the effect, notes and headings as HTML, without the meta table or a repeated title',()=>{
  const c=buildPerkCard('[TEST] Margin Notes',DESC);
  assert.match(c.detailsHtml,/<h5>Effect &amp; Rules<\/h5><p>When you interview[\s\S]*second sentence follows\.<\/p><h5>Notes<\/h5><p>Uses Calligrapher's Supplies/);
  assert.doesNotMatch(c.detailsHtml,/<table|Margin Notes|Specialty/);
});
test('pure: no run-together text anywhere in the card',()=>{
  const c=buildPerkCard('[TEST] Margin Notes',DESC);
  const all=[c.summary,...c.meta.flatMap(r=>[r.label,r.value]),textOf(c.detailsHtml)].join('|');
  assert.doesNotMatch(all,/NotesProfession|TreeArtistry|ArtsSpecialty|SpecialtyChronicler|TierApprentice|TypeTechnique|AutomationGM|UsesAt|ToolCalligrapher|RulesWhen|NotesUses/);
  assert.match(textOf(DESC),/Margin Notes Profession \/ Tree Artistry/);
});
test('pure: plain-text and non-table descriptions fall back sensibly; an extra table stays in the details',()=>{
  const p=buildPerkCard('X','','One. Two.');
  assert.equal(p.summary,'One.');assert.equal(p.detailsHtml,'<p>One. Two.</p>');assert.deepEqual(p.meta,[]);
  assert.equal(buildPerkCard('X','','Only one sentence.').detailsHtml,'');
  const t=buildPerkCard('X','<p>Lead sentence.</p><table><tr><td>a</td></tr></table>');
  assert.match(t.detailsHtml,/<table>/);assert.deepEqual(t.meta,[]);
  assert.match(firstSentence('word '.repeat(80)),/…$/);
});
test('pure: tier groups sort by level; untiered last',()=>{
  const g=groupByTier([{tier:'Master (level 9)'},{tier:''},{tier:'Apprentice (level 1)'},{tier:'Master (level 9)'}]);
  assert.deepEqual(g.map(x=>[x.tier,x.items.length]),[['Apprentice (level 1)',1],['Master (level 9)',2],['',1]]);
});
test('error messages by role',()=>{
  assert.equal(unreleasedPerkMessage('[TEST] P',{forPlayer:true}),'The GM has not released this perk to players yet.');
  const gm=unreleasedPerkMessage('[TEST] P');
  assert.match(gm,/^\[TEST\] P is not an approved, player-visible perk yet/);assert.match(gm,/default ownership is not None/);
});
test('card styles use the box radius, never a pill, and wrap',()=>{
  const css=fs.readFileSync(new URL('../styles/trees.css',import.meta.url),'utf8');
  const rule=sel=>css.split('\n').find(l=>l.startsWith(sel));
  assert.match(rule('.agst-embed .agst-perk{'),/border-radius:var\(--ag-radius\)/);
  assert.doesNotMatch(rule('.agst-embed .agst-perk{'),/radius-control|999|radius-lg/);
  assert.match(rule('.agst-embed .agst-perk__head'),/flex-wrap:wrap/);
});
