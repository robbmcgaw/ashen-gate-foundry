import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../styles/'+'ledger.css',import.meta.url),'utf8');
test('AG-WORK-0016 scoped app uses semantic theme token fallbacks',()=>{
 assert.match(source,/--ag-bg/);assert.match(source,/--ag-panel/);assert.match(source,/--ag-accent/);
 assert.match(source,/--ag-focus/);assert.match(source,/var\(--ag-bg,/);
});
test('module CSS does not define a global background palette on body/html',()=>{
 assert.doesNotMatch(source,/(?:^|\n)\s*(?:body|html)\s*\{\s*--ag-bg/m);
});
