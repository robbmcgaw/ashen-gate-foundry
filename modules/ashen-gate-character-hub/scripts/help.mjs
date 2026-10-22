import {infoDialog} from './ag-dialogs.mjs';
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

/** Help dialog text. Kept short; the README has the full list. */
export const HELP_HTML = `<p>The Character Hub is another way to look at the <strong>same</strong> character. Everything you change here changes the real character, and the standard dnd5e sheet shows it straight away (and the other way round).</p>
<ul>
  <li><strong>Open native sheet</strong> (top right) opens the standard dnd5e sheet at any time.</li>
  <li><strong>Level up</strong> (top right) starts dnd5e's own level-up: pick the class to advance, or <strong>Add a class</strong> to multiclass (dnd5e's class browser). The GM can always level; a player can when the world uses milestone levelling (or, in XP worlds, once there is enough XP). A copy of the character as it was before is kept for the GM in Actors → Ashen Gate → Level backups. The Journey records the new level as before. The GM can put a copy back with <strong>Restore backup</strong> (top right, GM only; it asks first and saves the character as it is now as another copy).</li>
  <li><strong>Left side</strong> is the character: portrait with equipment slots around it, AC, initiative, speed, proficiency, hit points, the six abilities, conditions, hit dice and rests. The icon buttons down the right edge switch what the middle shows (hover for the name).</li>
  <li><strong>Change the art:</strong> double-click the big picture to choose a new portrait (or new token art, when Token art is shown). Only if you own the character.</li>
  <li><strong>Compact</strong> (top right) shrinks the Hub to the art with its equipment slots, HP and the quick bar; <strong>Full</strong> brings everything back at the size it had. The Hub remembers your choice (only for you). In Compact a small slider (experimental) can fade the window background down to 60 % so the map shows through.</li>
  <li><strong>Pop out</strong> (top right) moves the Hub into its own browser window, e.g. a compact quick bar on a second screen; <strong>Pop in</strong> there puts it back.</li>
  <li><strong>Fold sections:</strong> click a heading (or the arrow on a container in Inventory) to fold it away. The Hub remembers it for you on this computer.</li>
  <li><strong>Hit points:</strong> type an amount and press <strong>−</strong> (damage, temp HP first) or <strong>+</strong> (heal). <strong>Double-click</strong> the HP bar to set current HP, temp HP and the max adjustment. The bar is green at 70% of max HP and up, yellow from 30%, red below. Silver stripes are temp HP; a blue frame is extra max HP; dark green cross-hatching is max HP lost.</li>
  <li><strong>Right-click</strong> AC, initiative, speed, the HP bar, hit dice, an ability, a skill, a save, senses or proficiencies to open dnd5e's own settings for it (the same as the standard sheet), e.g. to set an override or extra speeds.</li>
  <li><strong>Abilities:</strong> click a tile for an ability check, or its Save line for a saving throw.</li>
  <li><strong>Rolls</strong> (skills, checks, saves, initiative) use the system's own roll dialog. Hold Shift/Alt/Ctrl as usual to skip it or roll with advantage/disadvantage.</li>
  <li><strong>Conditions</strong>: the box on the left lists active conditions (click one to remove it); <strong>+</strong> lists the others to add. Same as the token HUD.</li>
  <li><strong>Rests</strong>: the cup (Short Rest) and tent (Long Rest) beside Hit Dice open dnd5e's rest dialogs.</li>
  <li><strong>Strain</strong> (with Ashen Gate | Cinders): shown beside your hit dice (the GM's row under hit points has − and +); the bar fills to 10, then shows how far past it you are, with the band name and the Backfire chance on a Push. Push a Cinder power from Ashen Gate → Cinders. There each Cinder is a small orb with its sockets listed under the Push lines: Attach, Swap or Detach an item, or drag one onto a socket row (unless the GM has locked the Cinder).</li>
  <li><strong>Use</strong> / <strong>Cast</strong> open dnd5e's own dialog, so attacks, slots and uses work as on the native sheet.</li>
  <li><strong>Item lists</strong> (Combat, Inventory, Magic, Features) show key facts in columns. <strong>More</strong> under an item shows its full description. Each tab has a search box. In Magic and Features choose how to <strong>Group</strong> and <strong>Sort</strong>, and use the filter buttons (Magic: a spell level, Prepared only, Ritual only, Castable only; Features: an action type, Has uses, Uses left); the <strong>star</strong> adds an item to your favourites (the same favourites as the standard sheet), shown at the top. The search, filters and (in Inventory) the purse and weight bar stay at the top while you scroll. Weapons show their mastery (hover for dnd5e's rules for it).</li>
  <li><strong>Equipment slots</strong> are a display only. Hover for the item name. <strong>Click</strong> opens the item; <strong>right-click</strong> unequips it. The small <strong>⋯</strong> on a slot has Use, Attune, Swap, Move to party stash and <em>Move to…</em>. Click an empty slot to equip a carried item that fits. A glow means attuned; the border colour is the item's rarity. <em>Other equipped</em> under the rings and trinkets lists equipped items that fit no slot.</li>
  <li><strong>Inventory</strong>: Character shows this character's items (the carry-box button moves one to the party stash); Party stash shows the Utilities stash and purse, where Take brings items back (with the party vote if the GM has it on).</li>
  <li>Equipping an item that needs attunement asks whether to attune. At your limit it lists attuned items so you can unattune one.</li>
  <li><strong>Mastery &amp; marks</strong> (bottom): target a token (T), then click a mark (e.g. Vex from your weapon, Hunter's Mark) to put it on the target, or click again to take it off. Marks only show who is marked; nothing is automated. Marking an enemy needs a GM online. The target count and, with Ashen Gate | Cinders, your Strain (read only) sit at the right end of the strip.</li>
  <li><strong>Quick bar</strong> (bottom): drag your items (from the lists here) or a macro onto a slot. Click to use, right-click to clear (Undo shows for 5 seconds). <strong>Keys 1-9 and 0</strong> use slots 1-10 of the Hub in front (also in a popped-out Hub), never while you type in a box; with no Hub open they stay Foundry's macro bar keys. Change them in Configure Controls → Ashen Gate | Character Hub.</li>
  <li><strong>Journey (alpha)</strong>: your character's accomplishments, newest first: level-ups, Renown ranks reached and quests completed, recorded from now on. The GM can add notes and hide entries.</li>
  <li><strong>Companions</strong>: drop your mount's Actor from the Actors sidebar (or a mount Item), then drop mount gear and mount perks onto its card. Type a name and description in the card's boxes. The stats box shows what gear and perks give (from their own effects; nothing is applied). Pets work the same way, with three clothing slots. One mount; pets up to the GM's limit (no pet slots until the GM raises it).</li>
  <li><strong>Ashen Gate quick bar</strong> (thin bar along the bottom edge; not in Compact): Professions, Skill Trees, Renown and Quests jump to that module's view here; Headquarters and Locations open their own window.</li>
  <li><strong>Professions</strong> (Overview, under Proficiencies, with the Profession Ledger): your professions and levels; click to open Ashen Gate → Professions.</li>
  <li><strong>Ashen Gate</strong> has one section per Ashen Gate module (Professions, Perks, Renown, Quests, Locations, Base). Where a module offers it, its own view shows here and works as in that module; otherwise a summary with an Open button.</li>
  <li><strong>GM: Player visibility</strong> (GM Setup) chooses which parts players see. Parts that are off, or whose module is inactive or has Player Access off, disappear for players; you still see them with a <em>Hidden from players</em> badge saying why. Players can't use a hidden part's Hub actions either.</li>
  <li>If you only observe a character, you can look but not change or roll.</li>
  <li>To switch back for good: the window's sheet menu (<em>Sheet</em> in the title bar) → choose the dnd5e character sheet.</li>
</ul>`;

/** Help opens the shared info dialog with one Close button. */
export function showHelp() {
  return infoDialog('Character Hub Help', HELP_HTML + aboutHtml(), {close: 'Close'});
}
