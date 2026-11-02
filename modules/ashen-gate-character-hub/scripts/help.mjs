import {infoDialog} from './ag-dialogs.mjs';
import {fold} from './ag-html.mjs';
import {MODULE_ID, esc} from './constants.mjs';

/** Ashen Gate modules the Hub works with, for the About lines in Help. */
export const PARTNER_MODULES = ['ashen-gate-manager', 'ashen-gate-profession-ledger', 'ashen-gate-skill-trees', 'ashen-gate-cinders', 'ashen-gate-factions',
  'ashen-gate-quest-manager', 'ashen-gate-locations', 'ashen-gate-headquarters', 'ashen-gate-utilities'];
/** "About": the Hub's version and each active partner module's version (read from Foundry's module list only). */
export function aboutHtml(modules = globalThis.game?.modules) {
  const mod = id => { try { return modules?.get?.(id) ?? null; } catch { return null; } };
  const name = m => String(m?.title ?? m?.id ?? '').replace(/^Ashen Gate \| /, '');
  const hub = mod(MODULE_ID), active = PARTNER_MODULES.map(mod).filter(m => m?.active);
  const rows = active.map(m => `<li>${esc(name(m))} <span class="ag-version">v${esc(m.version ?? '?')}</span></li>`).join('');
  return `<h4 class="agch-help-about">About</h4><p>Ashen Gate | Character Hub <span class="ag-version">v${esc(hub?.version ?? '')}</span></p>${rows ? `<p>Active Ashen Gate modules:</p><ul>${rows}</ul>` : '<p>No other Ashen Gate modules are active.</p>'}`;
}

/**
 * Help dialog text: a quick start, then task-based groups in kit folds (the first starts open). Written for a player at the
 * table; GM-only notes sit in their own fold, shown to the GM only. Names match the Hub's own buttons and tabs.
 */
const li = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
const group = (title, items, open = false) => fold({title, open, body: li(items)});
export const HELP_SECTIONS = [
  ['Getting started', [
    'The Hub is another view of the <strong>same</strong> character. Change something here and the standard dnd5e sheet shows it at once, and the other way round.',
    '<strong>Open it:</strong> click your portrait in the player dock, or use the sheet menu (<em>Sheet</em> in the window title bar) and choose <strong>Ashen Gate Character Hub</strong>. Choose the dnd5e sheet there to switch back.',
    '<strong>Dock portrait:</strong> click it once to open your Hub and click it again to close the Hub. From the keyboard, Tab to it and press Enter or Space.',
    '<strong>Layout:</strong> your character is on the left, the chosen tab is in the middle, and the tab list runs down the right edge. In a narrow window the tabs become one row at the top.',
    '<strong>Hide character</strong> folds the character column down to Cinders, HP and AC in a narrow window. <strong>Show character</strong> opens it again.',
    '<strong>Compact</strong> (top right) shrinks the Hub to one narrow column. <strong>Full</strong> brings everything back.',
    '<strong>Appearance…</strong> changes how the Hub looks for you only. In Compact view it can also make the background see-through.',
    '<strong>Pop out</strong> moves the Hub into its own browser window, for example on a second screen. <strong>Pop in</strong> brings it back. Pop out shows only where Foundry can detach windows.',
    'The <strong>⋯</strong> menu has <strong>Configure…</strong>, <strong>NPC Codex</strong> (if your GM shares it) and <strong>Open native sheet</strong>.',
    'If you only observe a character, you can look but not change or roll.',
    'Some tabs and parts show only if your GM has turned them on or the matching module is active.'
  ]],
  ['Your character', [
    '<strong>Name and title:</strong> the pen button beside the name opens <strong>Edit name and title…</strong>. Everyone who can see the character sees the title.',
    '<strong>Art:</strong> the picture button on the art (<strong>Change portrait…</strong> or <strong>Change token art…</strong>) or a double-click on the big picture. Only the owner can change it. With the Tokenizer module on, it opens Tokenizer.',
    '<strong>Abilities:</strong> click a tile for an ability check. Click the line under it for a saving throw.',
    '<strong>Rolls</strong> open the system\'s own roll dialog. Hold Shift, Alt or Ctrl as usual to skip it or roll with advantage or disadvantage.',
    '<strong>Right-click</strong> AC, initiative, speed, the HP bar, an ability, a skill, senses or proficiencies to open dnd5e\'s settings for it. A right-click never rolls.',
    '<strong>Hit points:</strong> type an amount, then press <strong>−</strong> for damage (temp HP first) or <strong>+</strong> to heal. Double-click the HP bar to set current HP, temp HP and the max adjustment.',
    'The bar shows current HP first, then temp HP in silver stripes, then missing HP. A blue outline is extra max HP. Dark green hatching is max HP lost. Hover for the numbers.',
    '<strong>Rests:</strong> the cup is a Short Rest and the tent is a Long Rest, beside Hit Dice. Both open dnd5e\'s rest dialogs.',
    '<strong>Equipment slots:</strong> hover for the item name. Click to open the item. Right-click to unequip it. Click an empty slot to equip a carried item that fits.',
    'The small <strong>⋯</strong> on a slot has Use, Attune, Swap, Move to party stash and Move to…. A glow means attuned. The border colour is the item\'s rarity.',
    'Equipping an item that needs attunement asks whether to attune. At your limit, it lets you unattune another item.',
    '<strong>Level up</strong> (arrow button, top right) starts dnd5e\'s level-up. Pick a class to advance, or <strong>Add a class</strong> to multiclass. You can level up if your GM uses milestone levelling, or once you have enough XP.',
    'A note in the title bar tells you whether your character carries a resurrection diamond. In a narrow window or Compact view, it becomes a gem button. Hover or click it to read it.'
  ]],
  ['Lists and tabs', [
    '<strong>Overview:</strong> skills, passives, senses and proficiencies. With the Profession Ledger, your professions show with their tier and level. Click them to open Ashen Gate → Professions.',
    '<strong>Combat, Inventory, Magic and Features</strong> show one line per item. Click a name or its chevron to open the description and an <strong>Open</strong> button for the item\'s sheet. Click again to close.',
    'In a narrow window, columns drop off the line. They stay in the open row.',
    'Each tab has a search box. <strong>Filters</strong> holds <strong>Group</strong>, <strong>Sort</strong> and filter buttons. The number shows how many are on. <strong>Clear filters</strong> turns them off.',
    '<strong>Filters → Show item descriptions</strong> (Inventory: <strong>View</strong>) and <strong>Show spell descriptions</strong> (Magic) switch back to long rows. They apply to you only.',
    'The <strong>star</strong> adds an item to your favourites, the same list as the standard sheet. Favourites show at the top.',
    '<strong>Use</strong> and <strong>Cast</strong> open dnd5e\'s own dialog. Click an item\'s icon to use it too.',
    '<strong>Magic:</strong> <strong>C</strong> marks concentration and <strong>R</strong> marks a ritual. <strong>Prepared</strong> (gold) means ready. <strong>Always</strong> means fixed. Spell levels fold, and you can click a level to show only that one.',
    '<strong>Preparing spells:</strong> the strip under the search shows prepared spells against your class limit, for example <em>Wizard 4/6</em>. Cantrips, always-prepared, at-will, innate and ritual-only spells do not count.',
    'Over the limit, the Hub offers to swap one spell for another, or you can Cancel. If dnd5e gives a class no limit, nothing is blocked.',
    '<strong>Features</strong> can be grouped by <strong>Origin</strong>: class, species, feats, professions and Cinders. A profession heading has <strong>Hide</strong>. <strong>Hidden groups (n)</strong> shows it again. Nothing is deleted.',
    '<strong>Inventory:</strong> <strong>Character</strong> shows your items, coins and weight. <strong>Party stash</strong> shows the shared stash. Use <strong>Move to party stash</strong> to hand an item over.',
    '<strong>Add</strong> an item with <strong>Add attack…</strong>, <strong>Add item…</strong>, <strong>Add spell…</strong> or <strong>Add feature…</strong> at the right of the toolbar. Choose <strong>Browse compendiums…</strong> to tick several entries, or <strong>Create new…</strong> for a blank one.',
    'You can also drag an item onto the list from the sidebar, a compendium or another character. Classes are added with Level up.',
    '<strong>Delete</strong> an item: right-click its row (or press the Menu key or Shift+F10) and choose <strong>Delete…</strong>. It asks first. Perks are refunded in Skill Trees instead. The GM removes Cinder items, companion gear, profession features, classes, species and backgrounds.',
    '<strong>Effects:</strong> every effect on your character, grouped like the standard sheet, with its source and time left. The switch turns an effect on or off at once. <strong>Edit</strong>, <strong>Add effect</strong> and <strong>Delete</strong> (it asks first) are for the owner and the GM. An effect from an item is changed on the item.',
    '<strong>Companions:</strong> a Mount box and up to three Pet boxes. Drop an Actor on a box, or use <strong>Find an Actor by name…</strong> or <strong>or link a world Actor…</strong>. You need Observer permission on it.',
    'Pets and mounts you own are listed under <strong>Yours to use</strong>. The active pet or mount list picks which one you manage. <strong>None</strong> clears the box.',
    'Gear and perks come from items on your character that are marked as companion gear or perks. Drop gear on a socket, or use <strong>Add gear…</strong>. <strong>Remove</strong> takes it out.',
    '<strong>Journey</strong> lists your character\'s milestones, newest first: level-ups, Renown and Piety ranks, finished quests and your first bond with each Cinder. The GM can add notes.',
    '<strong>Journey → Biography</strong> is the same Biography as the standard sheet. If you own the character, type and press <strong>Save Changes</strong>. <strong>Cancel</strong> discards your edits. Other players see only the public biography and appearance.',
    'Click a section heading to fold it. The Hub remembers it for you on this computer.'
  ]],
  ['Marks, conditions and the quick bar', [
    '<strong>Mastery &amp; marks</strong> (bottom): target a token (T), then click a mark such as Vex or Hunter\'s Mark. Click again to remove it. Marking an enemy needs the GM online.',
    'Sap and Slow put a real effect on the target. Vex marks the creature. Topple asks for the Constitution save. Cleave, Graze, Nick and Push only show their rule. The ✕ removes a mark early.',
    '<strong>Conditions:</strong> pick <strong>Self</strong> or <strong>Target</strong>, pick a condition, then press <strong>Apply</strong>. Chips show current conditions, and ✕ removes one. These are real Foundry conditions. Your GM\'s rules decide whose you can change.',
    '<strong>Quick bar:</strong> the <strong>Quick bar</strong> button at the right end of the bottom bar opens it under the Hub. Drag an item or macro onto a slot. Click a slot to use it.',
    'Right-click a slot, or press Delete, to clear it. <strong>Undo</strong> shows for five seconds.',
    'The quick bar is <strong>always linked</strong> to page 1 of your Foundry hotbar, for the character whose Hub is in front. Change one and the other follows. Other pages are never touched.'
  ]],
  ['Ashen Gate modules', [
    'The <strong>Ashen Gate</strong> tab has one sub-tab for each active module: <strong>Professions</strong>, <strong>Skill Trees</strong>, <strong>Cinders</strong>, <strong>Renown</strong>, <strong>Quest Log</strong>, <strong>Locations</strong> and <strong>Headquarters</strong>.',
    'Each shows that module\'s own view when it offers one. Otherwise you get a summary and an <strong>Open</strong> button for its window.',
    'The thin bar along the bottom edge has the same buttons. Each opens that sub-tab. It is hidden in Compact.',
    '<strong>Skill Trees</strong> has two tabs. <strong>Professions</strong> shows your profession trees. <strong>Cinders</strong> lists each Cinder you bear with its tree progress and <strong>Open Skill Trees…</strong>.',
    '<strong>Cinders:</strong> a small orb for each Cinder you bear sits at the top of the character column. Click it to open Ashen Gate → Cinders.',
    'Each Cinder lists its Push lines and sockets. Use <strong>Attach</strong> or <strong>Swap</strong> on a socket row, or drag an item onto it. A locked Cinder cannot be changed. <strong>Open skill tree</strong> opens its tree.',
    '<strong>Strain</strong> (with Cinders) sits beside your hit dice. The bar fills to 10, then shows how far past it you are, with the band name and the Backfire chance on a Push.',
    'When a Backfire is guaranteed, Push asks first, and Cancel is the default.'
  ]],
  ['Keyboard and accessibility', [
    'The tab list is one Tab stop. Arrow keys move between tabs and Enter opens one. Escape closes an open menu.',
    'Press Enter or Space to roll from a tile, skill or save.',
    '<strong>Keys 1-9 and 0</strong> use slots 1-10 of the Hub in front, never while you type in a box. Change them in Configure Controls → Ashen Gate | Character Hub.',
    'Right-click menus also open with the Menu key or Shift+F10.',
    'Icon-only buttons have a name for screen readers. Hover or focus one to see it.'
  ]]
];
/** Shown to the GM only, after the player groups. */
export const GM_HELP_SECTION = ['For the GM', [
  '<strong>GM Setup</strong> is the last tab. <strong>Player visibility</strong> chooses which parts players see. Hidden parts show a <em>Hidden from players</em> badge to you. <strong>Quick set</strong> asks first.',
  '<strong>Hub appearance</strong> sets the look players start from. <strong>Spell preparation</strong> has <strong>Enforce spell preparation limits</strong>. You are never blocked, only told.',
  '<strong>Pet slots</strong> sets how many Pet boxes a character has. <strong>Companion types</strong> overrides what kind of companion an NPC counts as.',
  'Each level-up keeps a copy of the character in the Actors sidebar under Ashen Gate / Backups. <strong>Restore backup…</strong> in the <strong>⋯</strong> menu puts one back. It asks first and keeps the current character as another copy.',
  'On a Cinder socket, only you can <strong>Detach</strong> an item. The item stays in the inventory. You can also change Strain with − and +, add Journey notes and hide Journey entries.'
]];

const INTRO = '<p>Start with <em>Getting started</em>. Click a group title to open or close it.</p>';
/** The Help body for a player, or for the GM (adds the "For the GM" fold). Never includes GM-only text for players. */
export function helpHtml(isGM = false) {
  const sections = isGM ? [...HELP_SECTIONS, GM_HELP_SECTION] : HELP_SECTIONS;
  return INTRO + sections.map(([title, items], i) => group(title, items, i === 0)).join('');
}
/** The player version of the Help body (no GM fold, no About). */
export const HELP_HTML = helpHtml(false);

/** Help opens the shared info dialog with one Close button; About (module versions) comes last. */
export function showHelp() {
  const isGM = globalThis.game?.user?.isGM === true;
  return infoDialog('Character Hub Help', helpHtml(isGM) + aboutHtml(), {close: 'Close'});
}
