// 0.60.5 A new mood or layer gets its id from its label; nobody types one. Pure id logic (mocked Foundry elsewhere): the editor needs a look in Forge.
import test from 'node:test';import assert from 'node:assert/strict';
import {presetIdFromLabel,validatePreset} from '../scripts/scene-moods.js';
import fs from 'node:fs';

test('presetIdFromLabel: lower-case slug, valid for validatePreset, unique with -2/-3, never empty',()=>{
  assert.equal(presetIdFromLabel('Foggy Dawn!'),'foggy-dawn');
  assert.equal(presetIdFromLabel('Café du Nord'),'cafe-du-nord');
  assert.equal(presetIdFromLabel('Foggy dawn',['foggy-dawn']),'foggy-dawn-2');
  assert.equal(presetIdFromLabel('Foggy dawn',['foggy-dawn','foggy-dawn-2']),'foggy-dawn-3');
  assert.equal(presetIdFromLabel('!!!'),'preset');
  const long=presetIdFromLabel('x'.repeat(100));
  assert.ok(long.length<=40);
  for(const label of ['Foggy Dawn','x'.repeat(100),'!!!'])assert.deepEqual(validatePreset({id:presetIdFromLabel(label,['x']),label:'L',kind:'mood',set:{weather:'fog'}}),[]);
  assert.ok(presetIdFromLabel('x'.repeat(100),['x'.repeat(36)]).length<=40,'a suffix still fits');
});
test('renaming a preset does not change its id: saving an existing preset reuses edit.id, only a new one asks for a made id',()=>{
  const src=fs.readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
  assert.match(src,/const id=edit\.isNew\?\(typedId\|\|presetIdFromLabel\(label,existing\.map\(p=>p\.id\)\)\):edit\.id;/);
  assert.match(src,/duplicate\?\{isNew:true,kind,id:'',label:/,'a duplicate gets a new made id, not "-copy" typed by hand');
});
test('the new-preset editor offers only "Advanced: set id (optional)", for a new preset',()=>{
  const hbs=fs.readFileSync(new URL('../templates/manager.hbs',import.meta.url),'utf8');
  assert.match(hbs,/\{\{#if moods\.edit\.isNew\}\}<label class="ag-field">Advanced: set id \(optional\) <input type="text" data-ag-mood-id/);
  assert.doesNotMatch(hbs,/<label class="ag-field">Id <input/);
});
