// 0.14.0: shop rules for the coming Shopping feature (pure functions, no UI, nothing saved).
// Mocked Foundry globals are not needed here: these tests prove the logic only, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CP_VALUE,coinValueCp,ELECTRUM_OFF,shopIdFromName,validId,priceToCp,shopPriceText,coinsText,coinsForAmount,normalizeLine,normalizePurse,normalizeShop,normalizeService,
 SERVICE_TYPES,planShopPayment,NO_CHANGE,NOT_WHOLE_CP,presentedTo,checkPurchase,SHOP_REFUSALS,bankQuote,stripSecrets,projectShop,projectService,
 shopPurchaseEntry,bankExchangeEntry,shopLine} from '../scripts/core.mjs';

const C4 = ['cp','sp','gp','pp'], C5 = ['cp','sp','ep','gp','pp'];
const value = (c, list) => list.reduce((n, k) => n + (c[k] ?? 0) * CP_VALUE[k], 0);
const shop = (over = {}) => normalizeShop({id: 'SHOP-TEST-KETTLE', name: '[TEST] The Copper Kettle', merchant: {name: '[TEST] Brin Tallow', img: 'assets/test/brin.webp'},
  flavour: 'A cluttered general store.', gmNotes: 'GM only text.', locationId: 'LOC-TEST-MARKET', purse: {cp: 40, sp: 25, gp: 30, pp: 0},
  presented: {mode: 'users', userIds: ['u1']}, rev: 3,
  lines: [
   {lineId: 'ln1', itemId: 'ITEM-TEST-ROPE', itemUuid: 'Item.abc', priceCp: 100, priceCoin: 'gp', stock: 3, costCp: 50, sort: 10, flavour: 'Coiled.',
    item: {name: '[TEST] Rope', img: 'rope.webp', type: 'consumable', system: {quantity: 1, description: {value: '<p>Rope.</p><section class="secret" id="s1"><p>GM bit</p></section>'}}}},
   {lineId: 'ln2', itemId: 'ITEM-TEST-CRATE', priceCp: 2500, priceCoin: 'gp', stock: 1, hidden: true, sort: 20, item: {name: '[TEST] Sealed Crate', type: 'loot', system: {}}},
   {lineId: 'ln3', priceCp: 150, priceCoin: 'sp', stock: 0, sort: 5, item: {name: '[TEST] Arrows', type: 'consumable', system: {quantity: 20, identified: false, unidentified: {name: '[TEST] Odd arrows', description: 'Strange.'}, description: {value: 'True name'}}}},
   {lineId: 'ln4', priceCp: 1, priceCoin: 'cp', stock: null, sort: 30, item: {name: '[TEST] Torch', type: 'consumable', system: {}}}
  ], ...over});


// ---- ids ----
test('ids from names: prefix, slug, -2/-3 when taken, retired ids never reused', () => {
 assert.equal(shopIdFromName('The Copper Kettle', []), 'SHOP-COPPER-KETTLE');
 assert.equal(shopIdFromName('The Copper Kettle', ['SHOP-COPPER-KETTLE']), 'SHOP-COPPER-KETTLE-2');
 assert.equal(shopIdFromName('The Copper Kettle', ['SHOP-COPPER-KETTLE', 'SHOP-COPPER-KETTLE-2']), 'SHOP-COPPER-KETTLE-3');
 assert.equal(shopIdFromName('The Copper Kettle', [], 'SHOP', ['SHOP-COPPER-KETTLE']), 'SHOP-COPPER-KETTLE-2', 'a retired id is not reused');
 assert.equal(shopIdFromName('[TEST] Counting  House!', [], 'SVC'), 'SVC-TEST-COUNTING-HOUSE');
 assert.equal(shopIdFromName('[TEST] Testford merchants', [], 'MLIST'), 'MLIST-TEST-TESTFORD-MERCHANTS');
 assert.equal(shopIdFromName('Café Été', []), 'SHOP-CAFE-ETE');
 assert.equal(shopIdFromName('***', []), 'SHOP-NEW');
 assert.ok(validId(shopIdFromName('x'.repeat(200), []), 'SHOP'));
 assert.throws(() => shopIdFromName('x', [], 'ITEM'), /prefix/);
 for (const [id, p, ok] of [['SHOP-COPPER-KETTLE', 'SHOP', true], ['SHOP-A1-2', 'SHOP', true], ['SVC-TEST', 'SVC', true], ['MLIST-X', 'MLIST', true],
  ['SHOP-', 'SHOP', false], ['SHOP--A', 'SHOP', false], ['shop-a', 'SHOP', false], ['SHOP-A-', 'SHOP', false], ['SVC-A', 'SHOP', false], ['SHOP-A B', 'SHOP', false], [7, 'SHOP', false]])
  assert.equal(validId(id, p), ok, String(id));
});

// ---- prices ----
test('prices to whole copper; ep converts at 50 cp; fractions of copper and negatives are refused', () => {
 assert.equal(priceToCp({value: 15, denomination: 'sp'}), 150);
 assert.equal(priceToCp({value: 150, denomination: 'cp'}), 150);
 assert.equal(priceToCp({value: 1.5, denomination: 'gp'}), 150);
 assert.equal(priceToCp({value: 3, denomination: 'ep'}), 150);
 assert.equal(priceToCp({value: 0.01, denomination: 'gp'}), 1);
 assert.equal(priceToCp({value: 2, denomination: 'pp'}), 2000);
 assert.throws(() => priceToCp({value: 0.05, denomination: 'sp'}), {message: NOT_WHOLE_CP});
 assert.throws(() => priceToCp({value: 0.005, denomination: 'gp'}), {message: NOT_WHOLE_CP});
 assert.throws(() => priceToCp({value: -1, denomination: 'gp'}));
 assert.throws(() => priceToCp({value: 1, denomination: 'xx'}));
});
test('price text: single coin when it divides, mixed when it does not, never ep while off', () => {
 assert.equal(shopPriceText(150, 'sp'), '15 sp');
 assert.equal(shopPriceText(150, 'gp'), '1 gp 5 sp');
 assert.equal(shopPriceText(155, 'gp'), '1 gp 5 sp 5 cp');
 assert.equal(shopPriceText(100, 'gp'), '1 gp');
 assert.equal(shopPriceText(5, 'gp'), '5 cp');
 assert.equal(shopPriceText(2000, 'pp'), '2 pp');
 assert.equal(shopPriceText(2500, 'pp'), '2 pp 50 sp');
 assert.equal(shopPriceText(150, 'ep'), '15 sp', 'ep price shown in sp while electrum is off');
 assert.equal(shopPriceText(150, 'ep', {electrum: true}), '3 ep');
 assert.equal(shopPriceText(175, 'ep', {electrum: true}), '3 ep 2 sp 5 cp');
 assert.equal(shopPriceText(0, 'gp'), '0 gp');
 for (let cp = 0; cp < 3000; cp += 7) for (const c of C5) assert.doesNotMatch(shopPriceText(cp, c), /ep/);
 assert.equal(coinsText({gp: 2, sp: 5, cp: 0}), '2 gp 5 sp');
 assert.equal(coinsText({}), 'nothing');
});
test('coinsForAmount: largest first, limited by the till, null when it cannot', () => {
 assert.deepEqual(coinsForAmount(1234), {pp: 1, gp: 2, sp: 3, cp: 4});
 assert.deepEqual(coinsForAmount(150, {till: {gp: 0, sp: 10, cp: 100}}), {pp: 0, gp: 0, sp: 10, cp: 50});
 assert.equal(coinsForAmount(5, {till: {sp: 9}}), null);
 assert.equal(coinsForAmount(-1), null);
 assert.deepEqual(coinsForAmount(0, {till: {}}), {pp: 0, gp: 0, sp: 0, cp: 0});
});

// ---- records ----
test('lines: prices stored as copper, stock whole ≥ 0 or unlimited, flavour up to 300 characters', () => {
 const l = normalizeLine({lineId: 'ln1', itemId: 'ITEM-TEST-ROPE', price: {value: 15, denomination: 'sp'}, cost: {value: 5, denomination: 'sp'}, stock: 3});
 assert.deepEqual(l, {lineId: 'ln1', itemId: 'ITEM-TEST-ROPE', itemUuid: null, priceCp: 150, priceCoin: 'sp', flavour: '', stock: 3, stockStart: 3, hidden: false, costCp: 50, sort: 0});
 assert.equal(normalizeLine({lineId: 'a', stock: ''}).stock, null);
 assert.equal(normalizeLine({lineId: 'a', stock: 0}).stock, 0);
 assert.equal(normalizeLine({}, {randomId: () => 'x1'}).lineId, 'ln_x1');
 assert.throws(() => normalizeLine({}), /lineId/);
 for (const stock of [-1, 1.5, 'two']) assert.throws(() => normalizeLine({lineId: 'a', stock}), /Stock must be a whole number/);
 assert.throws(() => normalizeLine({lineId: 'a', stockStart: -2}), /Stock/);
 assert.equal(normalizeLine({lineId: 'a', flavour: 'x'.repeat(300)}).flavour.length, 300);
 assert.throws(() => normalizeLine({lineId: 'a', flavour: 'x'.repeat(301)}), /300 characters/);
 assert.throws(() => normalizeLine({lineId: 'a', price: {value: 0.05, denomination: 'sp'}}), {message: NOT_WHOLE_CP});
 assert.throws(() => normalizeLine({lineId: 'a', priceCp: 1.5}), {message: NOT_WHOLE_CP});
 const snap = {name: 'x'}; assert.equal(normalizeLine({lineId: 'a', item: snap}).item, snap, 'the item snapshot is kept');
});
test('shop record: purse null by default, showPurse on by default, buys off at 50 %, ep only with electrum', () => {
 const s = normalizeShop({id: 'SHOP-TEST-A', name: '[TEST] A'});
 assert.equal(s.schema, 'ag-utilities-shop/1');
 assert.equal(s.purse, null); assert.equal(s.purseStart, null); assert.equal(s.showPurse, true);
 assert.deepEqual(s.buys, {enabled: false, percent: 50, types: []});
 assert.equal(s.presented, null); assert.deepEqual(s.lines, []);
 const p = normalizeShop({id: 'SHOP-TEST-A', name: 'A', purse: {gp: 3, sp: ''}, showPurse: false});
 assert.deepEqual(p.purse, {cp: 0, sp: 0, gp: 3, pp: 0}); assert.deepEqual(p.purseStart, p.purse); assert.notEqual(p.purseStart, p.purse);
 assert.equal(p.showPurse, false);
 assert.throws(() => normalizePurse({gp: -1}), /whole numbers from 0/);
 assert.throws(() => normalizePurse({gp: 1.5}), /whole numbers from 0/);
 assert.throws(() => normalizePurse({ep: 2}), {message: ELECTRUM_OFF});
 assert.deepEqual(normalizePurse({ep: 0, gp: 1}), {cp: 0, sp: 0, gp: 1, pp: 0}, 'no ep key while off');
 assert.deepEqual(normalizePurse({ep: 2}, {electrum: true}), {cp: 0, sp: 0, ep: 2, gp: 0, pp: 0});
 for (const percent of [0, 101, 2.5]) assert.throws(() => normalizeShop({id: 'SHOP-A', name: 'A', buys: {percent}}), /1 to 100/);
 assert.deepEqual(normalizeShop({id: 'SHOP-A', name: 'A', buys: {enabled: true, percent: 100, types: ['weapon', 'weapon', 3]}}).buys, {enabled: true, percent: 100, types: ['weapon']});
 assert.throws(() => normalizeShop({id: 'shop-a', name: 'A'}), /SHOP-/);
 assert.throws(() => normalizeShop({id: 'SHOP-A', name: ' '}), /needs a name/);
 assert.throws(() => normalizeShop({id: 'SHOP-A', name: 'A', flavour: 'x'.repeat(1001)}), /1000/);
 assert.throws(() => normalizeShop({id: 'SHOP-A', name: 'A', lines: [{lineId: 'a'}, {lineId: 'a'}]}), /share/);
 assert.equal(normalizeShop({id: 'SHOP-A', name: 'A', presented: {mode: 'odd'}}).presented, null);
 assert.deepEqual(normalizeShop({id: 'SHOP-A', name: 'A', presented: {mode: 'users', userIds: ['u1', 'u1', '']}}).presented, {mode: 'users', userIds: ['u1'], since: null, by: null});
});
test('services: bank settings checked, an unknown type is kept untouched', () => {
 const b = normalizeService({id: 'SVC-TEST-COUNTING-HOUSE', name: '[TEST] Counting House', service: {type: 'bank'}});
 assert.deepEqual(b.service, {type: 'bank', settings: {feePercent: 0}}); assert.equal(b.known, true);
 assert.throws(() => normalizeService({id: 'SVC-A', name: 'A', service: {type: 'bank', settings: {feePercent: 51}}}), /0 to 50/);
 const u = normalizeService({id: 'SVC-A', name: 'A', service: {type: 'stables', settings: {horses: 3}}});
 assert.deepEqual(u.service, {type: 'stables', settings: {horses: 3}}); assert.equal(u.known, false);
 assert.deepEqual(Object.keys(SERVICE_TYPES), ['bank']);
});

// ---- payment ----
test('payment with no shop purse: price coin first, change largest first, net per coin', () => {
 const p = planShopPayment({hold: {cp: 0, sp: 4, gp: 7, pp: 0}, totalCp: 150, priceCoin: 'gp', shopPurse: null});
 assert.equal(p.ok, true); assert.equal(p.exact, false);
 assert.deepEqual(p.pay, {cp: 0, sp: 0, gp: 2, pp: 0}, '1 gp + 4 sp then a second gp; the 4 sp come straight back, so they are not reported');
 assert.deepEqual(p.back, {cp: 0, sp: 5, gp: 0, pp: 0});
 assert.deepEqual(p.after, {cp: 0, sp: 9, gp: 5, pp: 0}); assert.equal(p.shopAfter, null);
 const q = planShopPayment({hold: {gp: 1, sp: 20}, totalCp: 50, priceCoin: 'sp'});
 assert.deepEqual(q.pay, {cp: 0, sp: 5, gp: 0, pp: 0}, 'the price coin is spent first');
 const r = planShopPayment({hold: {pp: 1}, totalCp: 1, priceCoin: 'cp'});
 assert.deepEqual(r.back, {cp: 9, sp: 9, gp: 9, pp: 0});
});
test('payment with a shop purse: change comes from the till (purse + coins handed over)', () => {
 const p = planShopPayment({hold: {gp: 1}, totalCp: 50, priceCoin: 'sp', shopPurse: {cp: 0, sp: 5, gp: 0, pp: 0}});
 assert.equal(p.ok, true);
 assert.deepEqual(p.back, {cp: 0, sp: 5, gp: 0, pp: 0}); assert.deepEqual(p.shopAfter, {cp: 0, sp: 0, gp: 1, pp: 0});
 const q = planShopPayment({hold: {sp: 3, cp: 0, gp: 1}, totalCp: 120, priceCoin: 'gp', shopPurse: {cp: 0, sp: 0, gp: 0, pp: 0}});
 assert.equal(q.ok, true, 'the payer\'s own sp are in the till for change');
 assert.deepEqual(q.pay, {cp: 0, sp: 2, gp: 1, pp: 0}); assert.deepEqual(q.back, {cp: 0, sp: 0, gp: 0, pp: 0});
});
test('exact payment when the till cannot make change; refused (noChange) when that fails too', () => {
 const p = planShopPayment({hold: {gp: 1, sp: 1, cp: 40}, totalCp: 50, priceCoin: 'sp', shopPurse: {cp: 0, sp: 0, gp: 9, pp: 0}});
 assert.equal(p.ok, true); assert.equal(p.exact, true, 'the normal plan already pays 1 sp + 40 cp, no change needed');
 const q = planShopPayment({hold: {gp: 1, cp: 50}, totalCp: 50, priceCoin: 'gp', shopPurse: {gp: 3}});
 assert.equal(q.ok, true); assert.equal(q.exact, true, 'gp first would need 50 cp change the till lacks; exact pays 50 cp');
 assert.deepEqual(q.pay, {cp: 50, sp: 0, gp: 0, pp: 0}); assert.deepEqual(q.shopAfter, {cp: 50, sp: 0, gp: 3, pp: 0});
 const r = planShopPayment({hold: {cp: 9, sp: 4, gp: 7, pp: 0}, totalCp: 50, priceCoin: 'sp', shopPurse: {cp: 2, sp: 0, gp: 12, pp: 0}});
 assert.deepEqual(r, {ok: false, reason: NO_CHANGE, noChange: true});
 assert.equal(planShopPayment({hold: {cp: 9, sp: 4, gp: 7}, totalCp: 50, priceCoin: 'sp', shopPurse: null}).ok, true, 'no purse = unlimited change');
});
test('payment refusals: not enough coins, unreadable coins, not whole copper', () => {
 const p = planShopPayment({hold: {gp: 1, sp: 4}, totalCp: 150, priceCoin: 'gp'});
 assert.equal(p.ok, false); assert.match(p.reason, /Not enough coins: 1 gp 5 sp needed, 1 gp 4 sp held/);
 assert.equal(planShopPayment({hold: null, totalCp: 1}).ok, false);
 assert.equal(planShopPayment({hold: {gp: 1}, totalCp: 1.5}).reason, NOT_WHOLE_CP);
 assert.equal(planShopPayment({hold: {gp: 1}, totalCp: 0}).ok, true, 'a free item costs nothing');
 assert.equal(planShopPayment({hold: {gp: -5, sp: 2}, totalCp: 20, priceCoin: 'sp'}).ok, true, 'a broken negative count reads as 0');
 assert.equal(planShopPayment({hold: {gp: -5, sp: 2}, totalCp: 30, priceCoin: 'sp'}).ok, false);
});
test('electrum off: ep is never spent, counted, shown or given, even when held', () => {
 const p = planShopPayment({hold: {ep: 10, sp: 5}, totalCp: 50, priceCoin: 'sp', shopPurse: {ep: 4, sp: 0}});
 assert.equal(p.ok, true);
 for (const k of ['pay', 'back', 'after', 'shopAfter']) assert.equal('ep' in p[k], false, k);
 assert.equal(planShopPayment({hold: {ep: 10}, totalCp: 50, priceCoin: 'sp'}).ok, false, 'held ep does not count');
 assert.doesNotMatch(planShopPayment({hold: {ep: 10, cp: 1}, totalCp: 50}).reason, /ep/);
 assert.equal(planShopPayment({hold: {sp: 5}, totalCp: 50, priceCoin: 'ep'}).ok, true, 'an ep price is paid as silver');
});
test('electrum on: ep may be spent but is never given as change', () => {
 const p = planShopPayment({hold: {ep: 1}, totalCp: 20, priceCoin: 'sp', shopPurse: null, electrum: true});
 assert.equal(p.ok, true); assert.equal(p.pay.ep, 1); assert.equal(p.back.ep, 0); assert.deepEqual(p.back, {cp: 0, sp: 3, ep: 0, gp: 0, pp: 0});
 const q = planShopPayment({hold: {gp: 1}, totalCp: 50, priceCoin: 'sp', shopPurse: {ep: 5}, electrum: true});
 assert.equal(q.ok, false, 'the till has only ep, which is never change'); assert.equal(q.noChange, true);
});
test('random holds, prices and purses: value kept, nothing below 0, no coin both out and back, ep rules', () => {
 let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
 for (let i = 0; i < 4000; i++) {
  const electrum = i % 2 === 1, use = electrum ? C5 : C4;
  const hold = Object.fromEntries(C5.map(c => [c, rnd(c === 'pp' ? 3 : 12)]));
  const purse = rnd(3) ? Object.fromEntries(C5.map(c => [c, rnd(8)])) : null;
  const totalCp = rnd(2500), priceCoin = C5[rnd(5)];
  const p = planShopPayment({hold, totalCp, priceCoin, shopPurse: purse, electrum});
  if (!p.ok) { assert.ok(p.noChange || value(hold, use) < totalCp, JSON.stringify({hold, totalCp, purse, p})); if (p.noChange) assert.equal(p.reason, NO_CHANGE); continue; }
  assert.equal(value(p.after, use), value(hold, use) - totalCp);
  assert.equal(value(p.pay, use) - value(p.back, use), totalCp);
  for (const c of use) {
   assert.ok(p.after[c] >= 0 && p.pay[c] >= 0 && p.back[c] >= 0);
   assert.ok(!(p.pay[c] > 0 && p.back[c] > 0), 'net per coin');
   assert.equal(p.after[c], hold[c] - p.pay[c] + p.back[c]);
   if (purse) { assert.ok(p.shopAfter[c] >= 0); assert.equal(p.shopAfter[c], purse[c] + p.pay[c] - p.back[c]); }
  }
  if (purse) assert.equal(value(p.shopAfter, use), value(purse, use) + totalCp);
  if (!electrum) for (const k of ['pay', 'back', 'after']) assert.equal('ep' in p[k], false);
  if (electrum) assert.equal(p.back.ep, 0);
  if (p.exact) assert.equal(value(p.back, use), 0);
 }
});

// ---- purchase checks ----
test('purchase checks: not open, shop changed, hidden line, sold out, bad quantity, stock counting', () => {
 const s = shop();
 assert.equal(presentedTo(s, 'u1'), true); assert.equal(presentedTo(s, 'u2'), false);
 assert.equal(presentedTo({...s, presented: {mode: 'all', userIds: []}}, 'u2'), true);
 assert.equal(presentedTo({...s, presented: null}, 'u1'), false);
 const base = {shop: s, lineId: 'ln1', quantity: 1, rev: 3, userId: 'u1'};
 assert.deepEqual(checkPurchase({...base, userId: 'u2'}), {ok: false, reason: 'This shop is not open for you.'});
 assert.equal(checkPurchase({...base, rev: 2}).reason, 'The shop changed. Look again.');
 assert.equal(checkPurchase({...base, lineId: 'nope'}).reason, SHOP_REFUSALS.changed);
 assert.equal(checkPurchase({...base, lineId: 'ln2'}).reason, SHOP_REFUSALS.changed, 'a hidden line reads as changed, never as hidden');
 assert.equal(checkPurchase({...base, lineId: 'ln3'}).reason, 'Sold out. Nothing was charged.');
 for (const quantity of [0, -1, 1.5, '', null, 'x']) assert.equal(checkPurchase({...base, quantity}).reason, SHOP_REFUSALS.quantity, String(quantity));
 assert.match(checkPurchase({...base, quantity: 4}).reason, /Only 3 left/);
 assert.deepEqual(checkPurchase({...base, quantity: 3}), {ok: true, line: s.lines[0], quantity: 3, totalCp: 300, stockAfter: 0});
 assert.equal(checkPurchase({...base, lineId: 'ln4', quantity: 500}).stockAfter, null, 'unlimited stays unlimited');
});

// ---- bank ----
test('bank: exact conversions at 10:1, ep at 50 cp when on', () => {
 assert.deepEqual(bankQuote({hold: {cp: 245, gp: 7}, from: 'cp', to: 'gp', receive: 2}),
  {ok: true, from: 'cp', to: 'gp', give: 200, fee: 0, total: 200, receive: 2, fromBefore: 245, fromAfter: 45, toBefore: 7, toAfter: 9});
 assert.equal(bankQuote({hold: {gp: 2}, from: 'gp', to: 'sp', receive: 20}).give, 2);
 assert.equal(bankQuote({hold: {pp: 1}, from: 'pp', to: 'cp', receive: 1000}).give, 1);
 assert.equal(bankQuote({hold: {ep: 1}, from: 'ep', to: 'sp', receive: 5, electrum: true}).give, 1);
 assert.equal(bankQuote({hold: {gp: 1}, from: 'gp', to: 'ep', receive: 2, electrum: true}).give, 1);
});
test('bank: the multiple rule, fee rounded up in the from coin, refusals', () => {
 assert.equal(bankQuote({hold: {gp: 9}, from: 'gp', to: 'sp', receive: 25}).reason, 'Ask for a multiple of 10 sp');
 assert.equal(bankQuote({hold: {pp: 9}, from: 'pp', to: 'ep', receive: 3, electrum: true}).reason, 'Ask for a multiple of 20 ep');
 assert.equal(bankQuote({hold: {ep: 9}, from: 'ep', to: 'sp', receive: 3, electrum: true}).reason, 'Ask for a multiple of 5 sp');
 const f = bankQuote({hold: {sp: 30}, from: 'sp', to: 'gp', receive: 2, feePercent: 10});
 assert.equal(f.give, 20); assert.equal(f.fee, 2); assert.equal(f.total, 22); assert.equal(f.fromAfter, 8);
 assert.equal(bankQuote({hold: {sp: 30}, from: 'sp', to: 'gp', receive: 1, feePercent: 1}).fee, 1, '0.1 sp rounds up to 1 sp');
 assert.equal(bankQuote({hold: {cp: 300}, from: 'cp', to: 'gp', receive: 2, feePercent: 50}).total, 300);
 assert.match(bankQuote({hold: {cp: 299}, from: 'cp', to: 'gp', receive: 2, feePercent: 50}).reason, /Not enough copper: 299 cp held, 300 cp needed/);
 assert.equal(bankQuote({hold: {gp: 1}, from: 'gp', to: 'gp', receive: 1}).reason, 'Choose two different coins.');
 for (const receive of [0, -1, 1.5, '']) assert.match(bankQuote({hold: {gp: 1}, from: 'gp', to: 'sp', receive}).reason, /whole number/);
 assert.match(bankQuote({hold: {gp: 1}, from: 'gp', to: 'sp', receive: 10, feePercent: 51}).reason, /0 to 50/);
 assert.equal(bankQuote({hold: {ep: 5}, from: 'ep', to: 'sp', receive: 5}).reason, ELECTRUM_OFF);
 assert.equal(bankQuote({hold: {gp: 5}, from: 'gp', to: 'ep', receive: 2}).reason, ELECTRUM_OFF);
 assert.equal(bankQuote({hold: null, from: 'gp', to: 'sp', receive: 10}).ok, false);
 const g = bankQuote({hold: {gp: 5, sp: -3}, from: 'gp', to: 'sp', receive: 10});
 assert.equal(g.toBefore, 0, 'no negatives');
});

// ---- projection ----
test('player projection: no hidden lines, no GM fields, purse only when shown', () => {
 const s = shop(), p = projectShop(s, {locationName: '[TEST] Market Ward', typeLabel: t => ({consumable: 'Consumable'}[t] ?? t)});
 assert.deepEqual(p.lines.map(l => l.lineId), ['ln3', 'ln1', 'ln4'], 'sorted, hidden line left out');
 const text = JSON.stringify(p);
 for (const leak of ['costCp', 'gmNotes', 'GM only text', 'itemUuid', 'itemId', 'ITEM-TEST', 'purseStart', 'presented', 'u1', 'Sealed Crate', 'GM bit', 'True name', '"item"', 'LOC-TEST'])
  assert.equal(text.includes(leak), false, leak);
 assert.deepEqual(p.purse, {cp: 40, sp: 25, gp: 30, pp: 0});
 assert.deepEqual(p.location, {name: '[TEST] Market Ward'}); assert.equal(p.rev, 3);
 const rope = p.lines[1];
 assert.deepEqual(rope, {lineId: 'ln1', name: '[TEST] Rope', img: 'rope.webp', type: 'Consumable', per: 1, priceCp: 100, priceText: '1 gp', flavour: 'Coiled.', stock: 3, soldOut: false, description: '<p>Rope.</p>'});
 assert.deepEqual([p.lines[0].name, p.lines[0].description, p.lines[0].per, p.lines[0].soldOut, p.lines[0].priceText], ['[TEST] Odd arrows', 'Strange.', 20, true, '15 sp']);
 assert.equal(projectShop({...s, showPurse: false}).purse, null, 'a hidden shop purse never reaches players');
 assert.equal(projectShop({...s, purse: null}).purse, null);
 assert.equal('location' in projectShop(s), false, 'no location unless the caller says it is revealed');
 assert.equal('ep' in projectShop({...s, purse: {gp: 1, ep: 3}}).purse, false, 'no ep while off');
 assert.equal(stripSecrets('a<section class="foo secret">x</section>b'), 'ab');
});
test('service projection: bank shown, unknown type is null', () => {
 const svc = normalizeService({id: 'SVC-TEST-COUNTING-HOUSE', name: '[TEST] Counting House', merchant: {name: '[TEST] Clerk Ames'}, gmNotes: 'secret', service: {type: 'bank', settings: {feePercent: 5}}});
 const p = projectService(svc);
 assert.deepEqual(p, {id: 'SVC-TEST-COUNTING-HOUSE', name: '[TEST] Counting House', merchant: {name: '[TEST] Clerk Ames', img: ''}, flavour: '', rev: 0, kind: 'service',
  service: {type: 'bank', label: 'Bank', settings: {feePercent: 5}}});
 assert.equal(projectService({...svc, service: {type: 'stables'}}), null);
 assert.equal(projectService(null), null);
});

// ---- history ----
test('history entries and lines for purchases and bank exchanges', () => {
 const s = shop(), hold = {cp: 0, sp: 4, gp: 7, pp: 0}, plan = planShopPayment({hold, totalCp: 150, priceCoin: 'gp', shopPurse: s.purse});
 const e = shopPurchaseEntry({id: 's1', shop: s, line: s.lines[0], itemName: '[TEST] Rope', quantity: 1, payFrom: 'purse', payer: {id: 'stash', name: 'Party Stash'},
  actor: {id: 'a1', name: '[TEST] Kestrel'}, user: {id: 'u1', name: 'Ada'}, approval: 'accepted', plan, coinsBefore: hold, shopPurseBefore: s.purse, createdItemIds: ['i1'], realTime: 5});
 assert.equal(e.kind, 'shop-purchase'); assert.equal(e.totalCp, 150); assert.equal(e.totalText, '1 gp 5 sp');
 assert.deepEqual(e.coinsAfter, plan.after); assert.deepEqual(e.shopPurseAfter, plan.shopAfter); assert.deepEqual(e.createdItemIds, ['i1']);
 assert.equal(shopLine(e), 'Ada ([TEST] Kestrel) bought [TEST] Rope at [TEST] The Copper Kettle for 1 gp 5 sp, paid from the party purse');
 assert.equal(shopLine({...e, payFrom: 'actor', payerName: '[TEST] Kestrel', quantity: 2}), 'Ada ([TEST] Kestrel) bought [TEST] Rope ×2 at [TEST] The Copper Kettle for 1 gp 5 sp, paid from [TEST] Kestrel\'s coins');
 assert.throws(() => shopPurchaseEntry({plan, payFrom: 'bank'}), /payFrom/);
 assert.throws(() => shopPurchaseEntry({plan: {ok: false}, payFrom: 'purse'}), /plan/);
 const q = bankQuote({hold: {sp: 30}, from: 'sp', to: 'gp', receive: 2, feePercent: 10});
 const b = bankExchangeEntry({id: 'b1', service: {id: 'SVC-TEST-COUNTING-HOUSE', name: '[TEST] Counting House'}, quote: q, payFrom: 'purse', user: {id: 'u1', name: 'Ada'}, realTime: 1});
 assert.equal(b.kind, 'bank-exchange'); assert.equal(b.total, 22); assert.equal(b.fee, 2);
 assert.equal(shopLine(b), 'Ada changed 22 sp into 2 gp at [TEST] Counting House (fee 2 sp), party purse');
 assert.equal(shopLine({...b, fee: 0, payFrom: 'actor', payerName: '[TEST] Kestrel'}), "Ada changed 22 sp into 2 gp at [TEST] Counting House, [TEST] Kestrel's coins");
 assert.equal(shopLine({kind: 'other'}), '');
});
