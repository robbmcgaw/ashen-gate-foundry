/** 0.47.0 smart icons: a small fake of Foundry's icon library and a FilePicker.browse over it (synthetic test data). */
export const FAKE_ICONS = [
  'icons/environment/traps/caltrops-spiked.webp', 'icons/environment/traps/bear-trap-steel.webp',
  'icons/commodities/metal/ingot-iron.webp', 'icons/commodities/metal/ore-chunk-grey.webp',
  'icons/commodities/wood/log-oak.webp', 'icons/commodities/gems/gem-faceted-red.webp',
  'icons/consumables/potions/bottle-round-corked-red.webp', 'icons/consumables/potions/potion-flask-corked-blue.webp',
  'icons/consumables/potions/bottle-bulb-corked-green.webp', 'icons/consumables/potions/vial-cork-empty.png',
  'icons/consumables/plants/herb-bundle-green.webp', 'icons/consumables/plants/leaf-broad-green.webp',
  'icons/commodities/flowers/heather-purple.webp',
  'icons/equipment/shield/round-wooden-boss-steel.webp', 'icons/equipment/shield/heater-steel-worn.webp',
  'icons/weapons/swords/sword-guard.webp', 'icons/weapons/swords/sword-guard-02.webp', 'icons/weapons/swords/sword-guard.png',
  'icons/sundries/scrolls/scroll-bound-brown.webp', 'icons/sundries/books/book-worn-brown.webp', 'icons/sundries/lights/lantern-iron.webp',
  'icons/environment/people/commoner.webp', 'icons/creatures/mammals/wolf-howl-grey.webp',
  'icons/svg/item-bag.svg', 'icons/svg/mystery-man.svg',
];
export function fakeTree(paths) {
  const dirs = new Map();
  for (const p of paths) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!dirs.has(dir)) dirs.set(dir, {dirs: new Set(), files: []});
      if (i === parts.length - 1) dirs.get(dir).files.push(p);
      else dirs.get(dir).dirs.add(parts.slice(0, i + 1).join('/'));
    }
  }
  const calls = [];
  const browse = async (source, target) => {
    calls.push(`${source}:${target}`);
    const d = dirs.get(target);
    if (!d) throw new Error(`no folder ${target}`);
    return {target, dirs: [...d.dirs], files: d.files};
  };
  return {browse, calls};
}
