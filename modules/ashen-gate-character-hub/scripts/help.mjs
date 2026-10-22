import {infoDialog} from './ag-dialogs.mjs';
import {fold} from './ag-html.mjs';
import {MODULE_ID, esc} from './constants.mjs';

/** Ashen Gate modules the Hub works with, for the About lines in Help (0.30.0). */
export const PARTNER_MODULES = ['ashen-gate-manager', 'ashen-gate-profession-ledger', 'ashen-gate-skill-trees', 'ashen-gate-cinders', 'ashen-gate-factions',
  'ashen-gate-quest-manager', 'ashen-gate-locations', 'ashen-gate-headquarters', 'ashen-gate-utilities'];
/** "About": the Hub's version and each active partner module's version (read from Foundry's module list only). */
export function aboutHtml(modules = globalThis.game?.modules) {
  const mod = id => { try { return modules?.get?.(id) ?? null; } catch { return null; } };
  const name = m => String(m?.title ?? m?.id ?? '').replace(/^Ashen Gate \| /, '');
  const hub = mod(MODULE_ID), active = PARTNER_MODULES.map(mod).filter(m => m?.active);
  const rows = active.map(m => `<li>${esc(name(m))} <span class="ag-version">v${esc(m.version ?? '?')}</span></li>`).join('');
  return `<h3>About</h3><p>Ashen Gate | Character Hub <span class="ag-version">v${esc(hub?.version ?? '')}</span></p>${rows ? `<p>Active Ashen Gate modules:</p><ul>${rows}</ul>` : '<p>No other Ashen Gate modules are active.</p>'}`;
}

/**
 * Help dialog text, grouped by topic in kit folds (0.33.0, CH-25; the first group starts open). Kept short; the README has
 * the full list. Names match the Hub's own buttons and tabs.
 */
const li = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
const group = (title, items, open = false) => fold({title, open, body: li(items)});
export const HELP_SECTIONS = [
  ['The character (left side)', [
    '<strong>Top left</strong> is the character: the name with a <strong>Level</strong> badge, and under it species · class and subclass · background (click one to open it). The window title says Ashen Gate | Character Hub. <strong>Left side</strong>: the Cinders and the inspiration star at the top, the portrait with equipment slots around it, AC, initiative, speed, proficiency, hit points, hit dice and rests, and the six abilities. The tabs down the right edge switch what the middle shows (with their names beside the icons when the Hub is wide enough).',
    '<strong>⋯ menu</strong> (top right): <strong>Level up</strong> starts dnd5e\'s own level-up: pick the class to advance, or <strong>Add a class</strong> to multiclass. The GM can always level; a player can when the world uses milestone levelling (or, in XP worlds, once there is enough XP). A copy of the character as it was before is kept for the GM in Actors → Ashen Gate → Level backups, and the Journey records the new level. The GM can put a copy back with <strong>Restore backup…</strong> (it asks first and keeps the character as it is now as another copy). <strong>Configure…</strong> opens dnd5e\'s own settings for a stat you pick.',
    '<strong>Right-click</strong> AC, initiative, speed, the HP bar, hit dice, an ability, a skill, senses or proficiencies to open dnd5e\'s own settings for it (the same as the standard sheet), e.g. to set an override or extra speeds. <strong>Configure…</strong> in the <strong>⋯</strong> menu does the same from the keyboard.',
    '<strong>Change the art:</strong> the picture button on the art (<strong>Change portrait…</strong>, or <strong>Change token art…</strong> while Token art is shown), or double-click the big picture. Only if you own the character.',
    '<strong>Abilities:</strong> click a tile for an ability check, or the line under it for a saving throw (a filled dot means proficient).',
    '<strong>Rolls</strong> (skills, checks, saves, initiative) use the system\'s own roll dialog. Hold Shift/Alt/Ctrl as usual to skip it or roll with advantage/disadvantage.',
    '<strong>Hit points:</strong> type an amount and press <strong>−</strong> (damage, temp HP first) or <strong>+</strong> (heal). <strong>Double-click</strong> the HP bar (or press Enter on it) to set current HP, temp HP and the max adjustment. The bar is green at 70% of max HP and up, yellow from 30%, red below. Silver stripes are temp HP; a blue frame is extra max HP; dark green cross-hatching is max HP lost.',
    '<strong>Rests</strong>: the cup (Short Rest) and tent (Long Rest) beside Hit Dice open dnd5e\'s rest dialogs.',
    '<strong>Equipment slots</strong> are a display only. Hover for the item name. <strong>Click</strong> opens the item; <strong>right-click</strong> unequips it. The small <strong>⋯</strong> on a slot has Use, Attune, Swap, Move to party stash and <em>Move to…</em>. Click an empty slot to equip a carried item that fits. A glow means attuned; the border colour is the item\'s rarity. <em>Other equipped</em> under the rings and trinkets lists equipped items that fit no slot (it shows only when there are some).',
    'Equipping an item that needs attunement asks whether to attune. At your limit it lists attuned items so you can unattune one.',
    '<strong>Narrow window:</strong> when the Full Hub is narrow, the tabs come first and the character folds to its Cinders, the star, HP and AC; <strong>Show character</strong> opens it.'
  ]],
  ['Tabs and lists', [
    '<strong>Overview</strong>: skills, passives and senses, proficiencies and (with the Profession Ledger) your professions with their tier and level (e.g. <em>Archaeology - Apprentice - Level 1</em>); click Professions to open Ashen Gate → Professions.',
    '<strong>Item lists</strong> (Combat, Inventory, Magic, Features) show key facts in columns. <strong>More</strong> under an item shows its full description. Each tab has a search box. In Combat, Magic and Features, <strong>Filters</strong> opens <strong>Group</strong>, <strong>Sort</strong> and the filter buttons (Combat: an action type, Hide unequipped, Has uses, Uses left; Magic: Prepared only, Ritual only, Castable only; Features: an action type, Has uses, Uses left); the number shows how many are on, and <strong>Clear filters</strong> turns them all off. The Filters box opens under its button and always stays inside the window. Magic\'s spell levels stay under the search: click one to show only that level. The <strong>star</strong> adds an item to your favourites (the same favourites as the standard sheet), shown at the top. Weapons show their mastery (hover for dnd5e\'s rules for it).',
    '<strong>Use</strong> / <strong>Cast</strong> open dnd5e\'s own dialog, so attacks, slots and uses work as on the native sheet.',
    '<strong>Inventory</strong>: Character shows this character\'s items, the coin purse and the weight bar (the carry-box button moves an item to the party stash); Party stash shows the Utilities stash and purse, where Take brings items back (with the party vote if the GM has it on).',
    '<strong>Fold sections:</strong> click a heading (or the arrow on a container in Inventory) to fold it away. The Hub remembers it for you on this computer.',
    '<strong>Companions</strong>: drop your mount\'s Actor from the Actors sidebar (or a mount Item), then drop mount gear and mount perks onto its card, or pick them from the lists. Type a name and description in the card\'s boxes. The stats box shows what gear and perks give (from their own effects; nothing is applied). Pets work the same way, with three clothing slots. One mount; pets up to the GM\'s limit.',
    '<strong>Journey</strong> (alpha): your character\'s accomplishments, newest first: level-ups, Renown ranks reached, quests completed and the first time the character is bound to each Cinder. The GM can add notes (type it in <strong>Entry</strong>, an optional date, then <strong>Add entry</strong>), edit them and hide entries.',
    '<strong>Keyboard:</strong> the tabs are one Tab stop; the arrow keys move between them and Enter opens one. Escape closes an open menu.'
  ]],
  ['Mastery & marks, conditions and the quick bar', [
    '<strong>Mastery &amp; marks</strong> (bottom): target a token (T), then click a mark (e.g. Vex from your weapon, Hunter\'s Mark) to put it on the target, or click again to take it off. Marks only show who is marked; nothing is automated. Marking an enemy needs a GM online. The target count and, with Ashen Gate | Cinders, your Strain (read only) sit at the right end of the strip.',
    '<strong>Conditions</strong> (under Mastery &amp; marks): pick <strong>Self</strong> (this character) or <strong>Target</strong> (your targeted tokens, the same targets as marks), a condition, then <strong>Apply</strong>. Conditions on the character and on your targets show as chips; ✕ takes one off. They are real Foundry conditions, so the token and the Utilities Condition Manager show them. The GM can change anyone\'s; players follow the GM\'s condition rules in Ashen Gate | Utilities (or, without Utilities, only their own characters).',
    '<strong>Quick bar</strong>: the <strong>Quick bar</strong> button at the right end of the bottom bar opens it under the Hub (the window grows to make room) and closes it again; the keys work either way. Drag your items (from the lists here) or a macro onto a slot. Click to use; right-click, or Delete on a slot, clears it (Undo shows for 5 seconds). <strong>Keys 1-9 and 0</strong> use slots 1-10 of the Hub in front (also in a popped-out Hub), never while you type in a box; with no Hub open they stay Foundry\'s macro bar keys. Change them in Configure Controls → Ashen Gate | Character Hub.'
  ]],
  ['Ashen Gate modules', [
    '<strong>Ashen Gate</strong> tab: one sub-tab per Ashen Gate module (Professions, Skill Trees, Cinders, Renown, Quest Log, Locations, Headquarters). Where a module offers it, its own view shows here and works as in that module; otherwise a summary with an Open button for the module\'s own window.',
    '<strong>Ashen Gate quick bar</strong> (thin bar along the bottom edge, with the Quick bar button at its end; not in Compact): the same modules with the same icons; each shows that module\'s sub-tab here.',
    '<strong>Cinders</strong> (with Ashen Gate | Cinders): each Cinder your character bears shows at the top of the character column as a small orb; click it to go to Ashen Gate → Cinders. There each Cinder lists its Push lines and sockets: Attach, Swap or Detach an item, or drag one onto a socket row (unless the GM has locked the Cinder). <strong>Open skill tree</strong> next to the Cinders title opens its tree in Skill Trees.',
    '<strong>Strain</strong>: shown beside your hit dice (the GM\'s row under hit points has − and +; in Compact the GM\'s pill has them); the bar fills to 10, then shows how far past it you are, with the band name and the Backfire chance on a Push. When Backfire is guaranteed, Push asks with Cancel as the default.'
  ]],
  ['Compact view, the ⋯ menu and Appearance', [
    '<strong>Compact</strong> (top right) shrinks the Hub to one narrow column: the art with its equipment slots, initiative / speed / proficiency, HP with hit dice, rests, exhaustion and Strain, the six abilities with their saves, then Mastery &amp; marks, Conditions and the Quick bar button at the bottom. <strong>Full</strong> brings everything back at the size it had. The Hub remembers your choice (only for you). Clicking a Cinder in Compact opens Full at Cinders for this window only.',
    '<strong>⋯</strong> (top right) holds <strong>Level up</strong>, <strong>Restore backup…</strong> (GM), <strong>Configure…</strong>, <strong>Appearance…</strong>, <strong>Pop out</strong> / <strong>Pop in</strong> (the Hub in its own browser window, e.g. a compact quick bar on a second screen), <strong>NPC Codex</strong> (with General Manager: the NPCs revealed to you; players once the GM shares it) and <strong>Open native sheet</strong> (the standard dnd5e sheet).',
    '<strong>Appearance…</strong> changes how the Hub looks for you only: with General Manager, its skins and the size on this device; without it, Dark or Light and the size (Compact or Comfortable). <strong>GM default</strong> follows the GM\'s choice. In Compact view it also has the see-through background (experimental): down to 60 % so the map shows through.',
    'To switch back for good: the window\'s sheet menu (<em>Sheet</em> in the title bar) → choose the dnd5e character sheet. If you only observe a character, you can look but not change or roll.'
  ]],
  ['For the GM', [
    '<strong>GM Setup → Player visibility</strong> chooses which parts players see. Parts that are off, or whose module is inactive or has Player Access off, disappear for players; you still see them with a <em>Hidden from players</em> badge saying why. Players can\'t use a hidden part\'s Hub actions either. <strong>Quick set</strong> asks before it changes every switch.',
    '<strong>GM Setup → Hub appearance</strong> is the look every user starts from while General Manager\'s appearance is not active. <strong>Companions</strong> sets the pets per character.'
  ]]
];
export const HELP_HTML = `<p>The Character Hub is another way to look at the <strong>same</strong> character. Everything you change here changes the real character, and the standard dnd5e sheet shows it straight away (and the other way round).</p>
${HELP_SECTIONS.map(([title, items], i) => group(title, items, i === 0)).join('')}`;

/** Help opens the shared info dialog with one Close button. */
export function showHelp() {
  return infoDialog('Character Hub Help', HELP_HTML + aboutHtml(), {close: 'Close'});
}
