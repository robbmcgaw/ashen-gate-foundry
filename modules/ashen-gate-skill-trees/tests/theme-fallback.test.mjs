import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../styles/'+(process.env.AG_MODULE_TEST_CSS||'trees.css'),import.meta.url),'utf8');
test('scoped app uses the shared kit tokens and never redefines them',()=>{
 assert.match(source,/var\(--ag-surface\)/);assert.match(source,/var\(--ag-accent\)/);assert.match(source,/var\(--ag-text\)/);
 assert.doesNotMatch(source,/--ag-[a-z-]+\s*:/);
});
test('module CSS does not define a global background palette on body/html',()=>{
 assert.doesNotMatch(source,/(?:^|\n)\s*(?:body|html)\s*\{\s*--ag-bg/m);
});
