/**
 * Smart icon keyword map (0.47.0). Data only: extend it freely, smart-icons.js reads it.
 *
 * Each concept:
 *   id       short name shown in the reason ("matched: potion")
 *   words    words in a record's name, kind or tags that mean this concept (lower case; plurals are folded:
 *            "caltrops" also matches "caltrop", "leaves" matches "leaf")
 *   folders  icon folders that hold fitting art. A hint matches when it appears as whole path segments of a file's folder
 *            ("consumables/potions" matches icons/consumables/potions/...). Hints that do not exist in a world simply
 *            find nothing.
 *   names    optional words in an icon's file name that fit best (file "caltrops-spiked.webp" for caltrops)
 *   modifier true for material or colour words ("iron", "oak") that usually describe the thing rather than name it,
 *            so "Iron Caltrops" is a trap made of iron, not an ingot
 */
export const ICON_CONCEPTS = Object.freeze([
  // Weapons
  {id: 'sword', words: ['sword', 'blade', 'longsword', 'shortsword', 'greatsword', 'broadsword', 'rapier', 'scimitar', 'sabre', 'saber', 'falchion', 'cutlass', 'katana'], folders: ['weapons/swords'], names: ['sword', 'blade']},
  {id: 'dagger', words: ['dagger', 'knife', 'dirk', 'stiletto', 'kris', 'shiv', 'blades'], folders: ['weapons/daggers'], names: ['dagger', 'knife']},
  {id: 'axe', words: ['axe', 'hatchet', 'handaxe', 'battleaxe', 'greataxe', 'tomahawk'], folders: ['weapons/axes'], names: ['axe']},
  {id: 'mace', words: ['mace', 'morningstar', 'flail', 'cudgel'], folders: ['weapons/maces'], names: ['mace', 'flail']},
  {id: 'hammer', words: ['warhammer', 'maul', 'greathammer'], folders: ['weapons/hammers'], names: ['hammer', 'maul']},
  {id: 'club', words: ['club', 'greatclub', 'bludgeon', 'cosh'], folders: ['weapons/clubs'], names: ['club']},
  {id: 'bow', words: ['bow', 'longbow', 'shortbow', 'greatbow'], folders: ['weapons/bows'], names: ['bow']},
  {id: 'crossbow', words: ['crossbow', 'arbalest'], folders: ['weapons/crossbows'], names: ['crossbow']},
  {id: 'polearm', words: ['spear', 'pike', 'halberd', 'glaive', 'lance', 'trident', 'partisan', 'polearm', 'scythe'], folders: ['weapons/polearms'], names: ['spear', 'halberd', 'glaive', 'trident', 'pike']},
  {id: 'staff', words: ['staff', 'quarterstaff', 'stave'], folders: ['weapons/staves'], names: ['staff']},
  {id: 'wand', words: ['wand', 'rod', 'sceptre', 'scepter'], folders: ['weapons/wands'], names: ['wand', 'rod']},
  {id: 'sling', words: ['sling'], folders: ['weapons/slings'], names: ['sling']},
  {id: 'thrown', words: ['javelin', 'dart', 'shuriken', 'boomerang'], folders: ['weapons/thrown'], names: ['javelin', 'dart']},
  {id: 'ammunition', words: ['arrow', 'bolt', 'bullet', 'ammunition', 'ammo', 'quiver', 'shot'], folders: ['weapons/ammunition'], names: ['arrow', 'bolt', 'bullet', 'quiver']},
  {id: 'firearm', words: ['pistol', 'musket', 'rifle', 'gun', 'blunderbuss'], folders: ['weapons/guns'], names: ['pistol', 'musket', 'rifle', 'gun']},
  // Armour and worn things
  {id: 'shield', words: ['shield', 'buckler', 'targe', 'pavise'], folders: ['equipment/shield'], names: ['shield', 'buckler']},
  {id: 'armor', words: ['armor', 'armour', 'mail', 'chainmail', 'breastplate', 'cuirass', 'hauberk', 'brigandine', 'gambeson', 'plate', 'jerkin', 'vest', 'robe', 'tunic', 'coat'], folders: ['equipment/chest'], names: ['armor', 'mail', 'breastplate', 'robe', 'coat']},
  {id: 'helmet', words: ['helm', 'helmet', 'hood', 'hat', 'cap', 'circlet', 'crown', 'cowl', 'mask', 'diadem', 'tiara'], folders: ['equipment/head'], names: ['helm', 'helmet', 'hood', 'hat', 'crown', 'mask', 'circlet']},
  {id: 'boots', words: ['boot', 'shoe', 'sandal', 'slipper', 'greave'], folders: ['equipment/feet'], names: ['boot', 'shoe', 'sandal']},
  {id: 'gloves', words: ['glove', 'gauntlet', 'mitten', 'handwrap'], folders: ['equipment/hand'], names: ['glove', 'gauntlet']},
  {id: 'bracers', words: ['bracer', 'bracelet', 'vambrace', 'wristband', 'bangle'], folders: ['equipment/wrist'], names: ['bracer', 'bracelet']},
  {id: 'ring', words: ['ring', 'signet', 'band'], folders: ['equipment/finger'], names: ['ring']},
  {id: 'amulet', words: ['amulet', 'necklace', 'pendant', 'torc', 'talisman', 'locket', 'medallion', 'charm', 'periapt', 'choker'], folders: ['equipment/neck'], names: ['amulet', 'necklace', 'pendant', 'medallion']},
  {id: 'cloak', words: ['cloak', 'cape', 'mantle', 'shawl'], folders: ['equipment/back'], names: ['cloak', 'cape', 'mantle']},
  {id: 'belt', words: ['belt', 'girdle', 'sash'], folders: ['equipment/waist'], names: ['belt', 'girdle', 'sash']},
  // Consumables
  {id: 'potion', words: ['potion', 'elixir', 'tonic', 'draught', 'philter', 'philtre', 'tincture', 'vial', 'flask', 'brew', 'remedy', 'salve', 'antidote', 'balm', 'ointment', 'poultice', 'serum'], folders: ['consumables/potions'], names: ['potion', 'flask', 'vial', 'bottle']},
  {id: 'poison', words: ['poison', 'venom', 'toxin', 'bane'], folders: ['consumables/potions', 'skills/toxins'], names: ['poison', 'skull', 'green']},
  {id: 'food', words: ['food', 'ration', 'bread', 'loaf', 'cheese', 'meat', 'jerky', 'stew', 'meal', 'biscuit', 'pie', 'cake', 'apple', 'berry', 'honey', 'egg', 'sausage', 'fish', 'grain', 'flour', 'porridge', 'soup'], folders: ['consumables/food', 'consumables/meat', 'consumables/grains', 'consumables/fruit', 'consumables/vegetable'], names: ['bread', 'cheese', 'meat', 'apple', 'berry', 'pie', 'fish', 'egg', 'honey']},
  {id: 'drink', words: ['ale', 'beer', 'wine', 'mead', 'cider', 'tea', 'whisky', 'whiskey', 'rum', 'spirit', 'drink', 'waterskin', 'grog', 'brandy'], folders: ['consumables/drinks'], names: ['wine', 'beer', 'mug', 'tankard', 'bottle', 'waterskin']},
  {id: 'herb', words: ['herb', 'leaf', 'flower', 'root', 'moss', 'petal', 'bloom', 'blossom', 'weed', 'sprig', 'fern', 'thistle', 'nettle', 'lichen', 'seed', 'bud', 'heather', 'sage', 'mint', 'thyme', 'lavender', 'clover', 'reed', 'vine', 'plant', 'bark', 'sap'], folders: ['consumables/plants', 'commodities/flowers', 'consumables/herbs', 'commodities/biological'], names: ['herb', 'leaf', 'flower', 'plant', 'root', 'moss', 'sprig']},
  {id: 'mushroom', words: ['mushroom', 'fungus', 'fungi', 'toadstool', 'spore', 'truffle', 'cap'], folders: ['consumables/mushrooms'], names: ['mushroom']},
  // Commodities and materials
  {id: 'metal', words: ['ore', 'ingot', 'metal', 'iron', 'steel', 'copper', 'bronze', 'tin', 'lead', 'mithral', 'mithril', 'adamantine', 'nugget', 'brass', 'cinderiron'], folders: ['commodities/metal'], names: ['ingot', 'ore', 'nugget', 'bar'], modifier: true},
  {id: 'gem', words: ['gem', 'gemstone', 'jewel', 'ruby', 'sapphire', 'emerald', 'diamond', 'amethyst', 'crystal', 'pearl', 'opal', 'topaz', 'garnet', 'quartz', 'jade', 'onyx', 'amber', 'jet'], folders: ['commodities/gems'], names: ['gem', 'crystal', 'pearl']},
  {id: 'leather', words: ['hide', 'pelt', 'fur', 'leather', 'skin', 'fleece', 'scale'], folders: ['commodities/leather'], names: ['hide', 'leather', 'pelt', 'fur'], modifier: true},
  {id: 'bone', words: ['bone', 'horn', 'antler', 'tusk', 'skull', 'fang', 'tooth', 'teeth', 'claw', 'talon', 'ivory', 'shell'], folders: ['commodities/bones'], names: ['bone', 'horn', 'skull', 'fang', 'claw', 'tooth']},
  {id: 'wood', words: ['wood', 'timber', 'log', 'plank', 'lumber', 'oak', 'yew', 'pine', 'birch', 'elm', 'ash', 'willow', 'branch', 'stick', 'twig'], folders: ['commodities/wood'], names: ['wood', 'log', 'plank', 'branch'], modifier: true},
  {id: 'stone', words: ['stone', 'rock', 'marble', 'granite', 'flint', 'obsidian', 'slate', 'pebble', 'clay', 'salt', 'coal', 'chalk'], folders: ['commodities/stone'], names: ['stone', 'rock', 'coal'], modifier: true},
  {id: 'cloth', words: ['cloth', 'silk', 'linen', 'wool', 'cotton', 'thread', 'yarn', 'fabric', 'bandage', 'blanket', 'bedroll', 'tent'], folders: ['commodities/cloth', 'sundries/survival'], names: ['cloth', 'silk', 'thread', 'bandage', 'bedroll', 'tent'], modifier: true},
  {id: 'treasure', words: ['coin', 'gold', 'silver', 'treasure', 'purse', 'trinket', 'idol', 'statuette', 'figurine', 'relic', 'chalice', 'goblet', 'crown'], folders: ['commodities/treasure', 'commodities/currency'], names: ['coin', 'gold', 'treasure', 'idol', 'chalice', 'goblet']},
  {id: 'biological', words: ['blood', 'heart', 'eye', 'feather', 'wing', 'gland', 'ichor', 'organ', 'egg', 'silk', 'web', 'tail', 'tongue'], folders: ['commodities/biological'], names: ['blood', 'heart', 'eye', 'feather', 'wing']},
  // Sundries
  {id: 'scroll', words: ['scroll', 'parchment', 'vellum'], folders: ['sundries/scrolls'], names: ['scroll']},
  {id: 'book', words: ['book', 'tome', 'grimoire', 'manual', 'journal', 'codex', 'ledger', 'almanac', 'primer', 'diary', 'spellbook', 'bestiary', 'treatise', 'compendium'], folders: ['sundries/books'], names: ['book', 'tome']},
  {id: 'document', words: ['letter', 'map', 'note', 'deed', 'contract', 'writ', 'handout', 'notice', 'poster', 'missive', 'chart', 'recipe', 'formula', 'pattern', 'schematic', 'blueprint', 'license', 'licence', 'permit', 'warrant', 'bounty', 'invitation', 'page'], folders: ['sundries/documents', 'sundries/scrolls'], names: ['document', 'letter', 'map', 'paper', 'parchment']},
  {id: 'key', words: ['key', 'keyring', 'lock', 'padlock'], folders: ['sundries/misc', 'tools/fasteners'], names: ['key', 'lock']},
  {id: 'light', words: ['lamp', 'torch', 'lantern', 'candle', 'brazier', 'beacon'], folders: ['sundries/lights'], names: ['lamp', 'torch', 'lantern', 'candle']},
  {id: 'rope', words: ['rope', 'cord', 'twine', 'lasso', 'grapple', 'grappling', 'chain'], folders: ['sundries/survival', 'tools/fasteners'], names: ['rope', 'chain', 'grapple']},
  {id: 'trap', words: ['trap', 'caltrop', 'snare', 'spike', 'net', 'tripwire'], folders: ['environment/traps'], names: ['caltrop', 'trap', 'spike', 'snare', 'net']},
  {id: 'game', words: ['dice', 'die', 'card', 'cards', 'deck', 'game', 'token', 'chess'], folders: ['sundries/gaming'], names: ['dice', 'card', 'token']},
  {id: 'flag', words: ['flag', 'banner', 'standard', 'pennant', 'sigil', 'insignia', 'badge', 'emblem'], folders: ['sundries/flags'], names: ['flag', 'banner']},
  {id: 'orb', words: ['orb', 'sphere', 'globe'], folders: ['sundries/misc', 'commodities/gems'], names: ['orb', 'sphere', 'globe']},
  {id: 'survival', words: ['kit', 'pack', 'bedroll', 'tinderbox', 'tinder', 'firewood', 'flint', 'canteen', 'rations', 'camp', 'mess'], folders: ['sundries/survival'], names: ['bedroll', 'tinderbox', 'canteen', 'pack']},
  // Tools
  {id: 'tool', words: ['tool', 'tools', 'toolkit', 'implement', 'instrument'], folders: ['tools/hand'], names: ['tool']},
  {id: 'smithing', words: ['anvil', 'tongs', 'bellows', 'smith', 'smithing', 'forge', 'hammer', 'chisel', 'file'], folders: ['tools/smithing', 'tools/hand'], names: ['anvil', 'tongs', 'hammer', 'chisel']},
  {id: 'digging', words: ['pick', 'pickaxe', 'shovel', 'spade', 'hoe', 'crowbar', 'mattock', 'sickle', 'saw'], folders: ['tools/hand'], names: ['pick', 'shovel', 'spade', 'crowbar', 'saw', 'sickle']},
  {id: 'scribe', words: ['quill', 'ink', 'pen', 'inkwell', 'calligraphy', 'scribe', 'cartographer', 'sealing', 'wax'], folders: ['tools/scribal'], names: ['quill', 'ink', 'pen']},
  {id: 'alchemy', words: ['alchemy', 'alchemist', 'alembic', 'mortar', 'pestle', 'retort', 'crucible', 'beaker', 'reagent', 'catalyst', 'distillate', 'herbalism', 'herbalist'], folders: ['tools/laboratory'], names: ['mortar', 'alembic', 'flask', 'beaker']},
  {id: 'thieves', words: ['lockpick', 'picks', 'thieves', 'burglar'], folders: ['tools/hand'], names: ['lockpick', 'pick']},
  {id: 'fishing', words: ['fishing', 'hook', 'lure', 'rod'], folders: ['tools/fishing'], names: ['fishing', 'hook', 'rod']},
  {id: 'cooking', words: ['cook', 'cooking', 'pot', 'pan', 'kettle', 'cauldron', 'utensil', 'ladle'], folders: ['tools/cooking', 'containers/kitchenware'], names: ['pot', 'pan', 'kettle', 'cauldron']},
  {id: 'music', words: ['lute', 'flute', 'drum', 'harp', 'lyre', 'horn', 'fiddle', 'viol', 'bagpipe', 'pipe', 'whistle', 'bell', 'song'], folders: ['tools/instruments'], names: ['lute', 'flute', 'drum', 'harp', 'lyre', 'horn', 'bell']},
  {id: 'navigation', words: ['compass', 'sextant', 'spyglass', 'telescope', 'astrolabe', 'hourglass', 'spectacles', 'magnifying'], folders: ['tools/navigation'], names: ['compass', 'spyglass', 'hourglass']},
  // Containers
  {id: 'bag', words: ['bag', 'sack', 'pouch', 'backpack', 'satchel', 'haversack', 'knapsack', 'purse'], folders: ['containers/bags'], names: ['bag', 'sack', 'pouch', 'backpack', 'satchel']},
  {id: 'chest', words: ['chest', 'box', 'crate', 'case', 'coffer', 'casket', 'strongbox', 'trunk', 'reliquary'], folders: ['containers/chest', 'containers/boxes'], names: ['chest', 'box', 'crate']},
  {id: 'barrel', words: ['barrel', 'keg', 'cask', 'bucket', 'tub'], folders: ['containers/barrels'], names: ['barrel', 'keg', 'bucket']},
  {id: 'jar', words: ['jar', 'jug', 'urn', 'pot', 'bottle', 'vase', 'pitcher', 'ewer'], folders: ['containers/kitchenware', 'containers/misc'], names: ['jar', 'jug', 'urn', 'bottle', 'vase']},
  // Magic, skills and creatures
  {id: 'fire', words: ['fire', 'flame', 'ember', 'cinder', 'blaze', 'inferno', 'burn', 'burning', 'smoke', 'ash', 'pyre', 'scorch'], folders: ['magic/fire'], names: ['fire', 'flame', 'ember']},
  {id: 'frost', words: ['frost', 'ice', 'cold', 'snow', 'winter', 'chill', 'freeze', 'frozen'], folders: ['magic/water'], names: ['ice', 'frost', 'snow']},
  {id: 'lightning', words: ['lightning', 'thunder', 'storm', 'spark', 'shock'], folders: ['magic/lightning'], names: ['lightning', 'thunder', 'storm']},
  {id: 'holy', words: ['holy', 'divine', 'blessing', 'bless', 'prayer', 'saint', 'sacred', 'radiant', 'sun', 'dawn', 'oath'], folders: ['magic/holy', 'magic/light'], names: ['holy', 'prayer', 'sun', 'angel']},
  {id: 'unholy', words: ['unholy', 'curse', 'cursed', 'hex', 'shadow', 'necrotic', 'blight', 'rot', 'doom', 'dread'], folders: ['magic/unholy', 'magic/death'], names: ['skull', 'curse', 'shadow']},
  {id: 'nature', words: ['nature', 'druid', 'wild', 'growth', 'thorn', 'grove', 'beast'], folders: ['magic/nature'], names: ['leaf', 'tree', 'thorn', 'vine']},
  {id: 'healing', words: ['heal', 'healing', 'cure', 'mend', 'restore', 'restoration', 'life', 'vigor', 'vigour'], folders: ['magic/life'], names: ['heal', 'heart', 'life']},
  {id: 'defense', words: ['ward', 'warding', 'protection', 'guard', 'aegis', 'barrier', 'resist', 'resistance'], folders: ['magic/defensive'], names: ['shield', 'ward', 'barrier']},
  {id: 'mind', words: ['mind', 'psychic', 'charm', 'dream', 'illusion', 'insight', 'memory', 'whisper', 'fear'], folders: ['magic/control', 'magic/perception'], names: ['eye', 'mind', 'brain']},
  {id: 'movement', words: ['dash', 'leap', 'jump', 'climb', 'swim', 'stride', 'speed', 'swift', 'sprint', 'travel', 'journey', 'route', 'road', 'path'], folders: ['magic/movement', 'skills/movement'], names: ['boot', 'wing', 'feet', 'path']},
  {id: 'melee', words: ['strike', 'parry', 'riposte', 'cleave', 'smite', 'bash', 'duel', 'fighter', 'brawl', 'grapple'], folders: ['skills/melee'], names: ['strike', 'blade', 'sword']},
  {id: 'ranged', words: ['aim', 'volley', 'shot', 'sharpshooter', 'marksman', 'archery'], folders: ['skills/ranged', 'skills/targeting'], names: ['arrow', 'target', 'bow']},
  {id: 'social', words: ['persuade', 'persuasion', 'deceive', 'deception', 'intimidate', 'intimidation', 'barter', 'haggle', 'trade', 'trader', 'merchant', 'renown', 'reputation', 'faction', 'favor', 'favour', 'contact'], folders: ['skills/social'], names: ['handshake', 'trade', 'coin']},
  {id: 'trade', words: ['craft', 'crafting', 'crafter', 'profession', 'artisan', 'carpenter', 'mason', 'tailor', 'tanner', 'cobbler', 'brewer', 'weaver', 'jeweler', 'jeweller', 'miner', 'mining', 'forager', 'foraging', 'harvest', 'gather', 'gathering', 'salvage'], folders: ['skills/trades'], names: ['craft', 'hammer', 'tool']},
  {id: 'wound', words: ['wound', 'injury', 'bleed', 'bleeding', 'scar', 'fracture', 'disease', 'sickness', 'plague', 'fever', 'infection'], folders: ['skills/wounds'], names: ['blood', 'wound']},
  {id: 'creature', words: ['wolf', 'bear', 'boar', 'rat', 'spider', 'snake', 'serpent', 'bat', 'bird', 'crow', 'raven', 'hawk', 'eagle', 'owl', 'deer', 'stag', 'horse', 'pony', 'mule', 'dog', 'hound', 'cat', 'lion', 'tiger', 'goat', 'sheep', 'ox', 'boar', 'skeleton', 'zombie', 'ghoul', 'ghost', 'wraith', 'specter', 'spectre', 'slime', 'ooze', 'dragon', 'drake', 'wyrm', 'wyvern', 'crab', 'beetle', 'insect', 'worm', 'scorpion', 'toad', 'frog', 'lizard', 'elemental', 'golem', 'troll', 'ogre', 'giant', 'demon', 'devil', 'fiend', 'imp', 'gargoyle', 'harpy', 'griffon', 'griffin'], folders: ['creatures'], names: []},
  {id: 'person', words: ['guard', 'soldier', 'merchant', 'priest', 'cleric', 'farmer', 'villager', 'smith', 'blacksmith', 'innkeeper', 'noble', 'bandit', 'thief', 'knight', 'mage', 'wizard', 'witch', 'hunter', 'sailor', 'captain', 'guildmaster', 'elder', 'monk', 'acolyte', 'scholar', 'sage', 'healer', 'shopkeeper', 'peddler', 'ranger', 'scout', 'mercenary', 'cultist', 'pilgrim', 'beggar', 'child', 'commoner', 'lord', 'lady', 'king', 'queen', 'prince', 'princess', 'chieftain', 'warden', 'sheriff', 'magistrate', 'bard'], folders: ['environment/people'], names: []},
  {id: 'place', words: ['town', 'village', 'city', 'keep', 'castle', 'tower', 'inn', 'tavern', 'temple', 'shrine', 'camp', 'ruin', 'ruins', 'cave', 'mine', 'farm', 'mill', 'bridge', 'gate', 'harbor', 'harbour', 'dock', 'market', 'hall', 'manor', 'fort', 'outpost', 'crypt', 'tomb'], folders: ['environment/settlement', 'environment/wilderness'], names: ['house', 'tower', 'castle', 'tent', 'cave']},
]);

/**
 * Last resort by kind: a dnd5e item type, an Ashen Gate entity type or the Foundry document type. Each points at
 * concept ids above (the first one with art in this world wins). Records whose name and kind find nothing keep
 * Manager's generic category icon.
 */
export const KIND_CONCEPTS = Object.freeze({
  weapon: ['sword'], equipment: ['armor'], consumable: ['potion'], tool: ['tool'], loot: ['treasure'],
  container: ['bag'], backpack: ['bag'], spell: ['holy'], feat: ['melee'], class: ['book'], subclass: ['book'],
  background: ['document'], race: ['person'], species: ['person'],
  potion: ['potion'], scroll: ['scroll'], wand: ['wand'], rod: ['wand'], ammo: ['ammunition'], food: ['food'],
  poison: ['poison'], trinket: ['treasure'], gem: ['gem'], material: ['metal'], art: ['treasure'], junk: ['bag'],
  recipe: ['document'], profession: ['trade'], perk: ['melee'], feature: ['melee'], cinder: ['fire'], power: ['fire'],
  mutation: ['unholy'], handout: ['document'], npc: ['person'], character: ['person'], actor: ['person'],
  rolltable: ['game'], macro: ['game'], resourceopportunity: ['herb'],
});

/** Words that never decide an icon by themselves. */
export const STOPWORDS = Object.freeze(['the', 'and', 'for', 'with', 'from', 'into', 'test', 'item', 'items', 'record',
  'ashen', 'gate', 'common', 'uncommon', 'rare', 'very', 'legendary', 'minor', 'major', 'greater', 'lesser', 'superior',
  'basic', 'fine', 'quality', 'crude', 'small', 'large', 'old', 'new', 'one', 'two', 'three', 'set', 'piece', 'part',
  'kind', 'type', 'level', 'tier', 'rank', 'grade', 'masterwork', 'improved', 'advanced', 'simple',
  'bundle', 'bunch', 'handful', 'pinch', 'batch', 'stack', 'pile', 'dose', 'portion', 'measure', 'sample', 'pair']);
