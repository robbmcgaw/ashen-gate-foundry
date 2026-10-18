import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../styles/'+'ledger.css',import.meta.url),'utf8');
const manifest=JSON.parse(await readFile(new URL('../module.json',import.meta.url),'utf8'));
test('ledger.css follows the shared UI kit: tokens only, no fallbacks, no hard-coded colours',()=>{
 assert.equal(manifest.styles[0],'styles/ag-ui.css');
 assert.match(source,/var\(--ag-surface\)/);assert.match(source,/var\(--ag-accent\)/);
 assert.doesNotMatch(source,/--ag-[a-z0-9-]+\s*:/,'module CSS never declares --ag-* values');
 assert.doesNotMatch(source,/var\(--ag-[a-z0-9-]+\s*,/,'kit tokens are used without fallbacks');
 assert.doesNotMatch(source,/#[0-9a-f]{3,8}\b|rgba?\(/i,'no hard-coded colours, so light skins work');
});
test('module CSS does not style body/html',()=>{
 assert.doesNotMatch(source,/(?:^|\n)\s*(?:body|html)\s*\{/m);
});
