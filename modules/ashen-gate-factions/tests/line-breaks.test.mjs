/** 0.18.1 line breaks in reward text. Mocked: proves the schema, round trips and stylesheet/markup, not the live Foundry UI. Synthetic data only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeFaction,sourceDefinition,validateFaction} from '../scripts/core.mjs';
import {planImport,IMPORT_SCHEMA} from '../scripts/import.mjs';
import {diffDefinitions} from '../scripts/update.mjs';
import {readForm} from '../scripts/ag-dialogs.mjs';
const css=readFileSync(new URL('../styles/module.css',import.meta.url),'utf8'),hbs=readFileSync(new URL('../templates/dashboard.hbs',import.meta.url),'utf8');
const TEXT='Grants a favour.\nLimit: once per level.\nPrice: 50 gp';
const withText=(text,key='A')=>{
  const f=makeFaction({id:`FACTION-QA-${key}`,trackId:`RENOWN-QA-${key}`,name:'[TEST] Guild'});
  f.rewards=[{id:'R1',key:'r1',name:'[TEST] Reward',kind:'custom',behavior:'repeatable_service',audience:'group',milestone_id:`RENOWN-QA-${key}-M2`,description:text,teaser:text,tags:[],usage_limit:0}];
  f.renown_track.milestones[1].benefit=text;return f;
};
test('the source schema accepts line breaks in description, teaser and benefit, and keeps them',()=>{
  const f=withText(TEXT);
  assert.deepEqual(validateFaction(f),[]);
  const d=sourceDefinition(f);
  assert.equal(d.rewards[0].description,TEXT);assert.equal(d.rewards[0].teaser,TEXT);assert.equal(d.renown_track.milestones[1].benefit,TEXT);
  assert.deepEqual(validateFaction(withText(TEXT.repeat(60))),[],'no length cap on reward text');
});
test('import keeps the line breaks, and update mode treats a line-break-only change as a change',()=>{
  const file={schema_version:IMPORT_SCHEMA,definitions:[sourceDefinition(withText(TEXT))]};
  const plan=planImport(file);assert.equal(plan.rows[0].definition.rewards[0].description,TEXT);
  const flat=sourceDefinition(withText(TEXT.replaceAll('\n',' ')));
  assert.equal(diffDefinitions(flat,file.definitions[0]).rewards.changed.length,1);
  const ex=new Map([['FACTION-QA-A',{definition:file.definitions[0],hash:null,legacy:false,states:{}}]]);
  assert.equal(planImport(file,new Set(),{mode:'update',existing:ex}).rows[0].action,'unchanged');
});
test('the Edit… reward dialog round-trips line breaks: a textarea value goes through readForm unchanged',()=>{
  const form={elements:[{name:'description',type:'textarea',value:TEXT},{name:'name',type:'text',value:'x'}]};
  assert.equal(readForm(form).description,TEXT);
  const src=readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');
  assert.match(src,/name:'description',label:'Unlocked description',value:reward\.description\?\?'',type:'textarea'/);
  assert.match(src,/Object\.assign\(reward,\{name:name\.trim\(\),teaser,description,/,'description is saved as typed, not trimmed or flattened');
});
test('reward text and benefits render escaped with line breaks preserved; Add a reward has a multi-line box',()=>{
  assert.match(css,/\.agf-reward__text \{[^}]*white-space:pre-line/);
  assert.match(css,/\.agf-milestone__text \{[^}]*white-space:pre-line/);
  assert.match(hbs,/\{\{\{agfParas description "agf-reward__text"\}\}\}/,'0.19.0: paragraphs come from the escaping helper');
  assert.match(hbs,/\{\{\{agfParas benefit "agf-milestone__text"\}\}\}/);
  assert.match(hbs,/<textarea name="reward-description"/);
  assert.equal(/\{\{\{\s*(description|benefit)\b/.test(hbs),false);
});
