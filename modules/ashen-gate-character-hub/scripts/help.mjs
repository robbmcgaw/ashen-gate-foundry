/** Help dialog text. Kept short; the README has the full list. */
export const HELP_HTML = `<p>The Character Hub is another way to look at the <strong>same</strong> character. Everything you change here changes the real character, and the standard dnd5e sheet shows it straight away (and the other way round).</p>
<ul>
  <li><strong>Open native sheet</strong> (top right) opens the standard dnd5e sheet at any time.</li>
  <li><strong>Left side</strong> is the character: portrait with equipment slots around it, AC, initiative, speed, proficiency, hit points, the six abilities, conditions, hit dice and rests. The icon buttons down the right edge switch what the middle shows (hover for the name).</li>
  <li><strong>See-through window:</strong> the slider in the header fades the window background so you can see the map. Only for you; text stays solid.</li>
  <li><strong>Hit points:</strong> type an amount and press Damage or Heal (damage uses temp HP first), or edit HP / Temp / Max adj. directly.</li>
  <li><strong>Abilities:</strong> click a tile for an ability check, or its Save line for a saving throw.</li>
  <li><strong>Rolls</strong> (skills, checks, saves, initiative) use the system's own roll dialog. Hold Shift/Alt/Ctrl as usual to skip it or roll with advantage/disadvantage.</li>
  <li><strong>Conditions</strong>: the box on the left lists active conditions (click one to remove it); <strong>+</strong> lists the others to add. Same as the token HUD.</li>
  <li><strong>Rests</strong>: the cup (Short Rest) and tent (Long Rest) beside Hit Dice open dnd5e's rest dialogs.</li>
  <li><strong>Use</strong> / <strong>Cast</strong> open dnd5e's own dialog, so attacks, slots and uses work as on the native sheet.</li>
  <li><strong>Equipment slots</strong> are a display only. Hover for the item name. <strong>Click</strong> opens the item; <strong>right-click</strong> unequips it. The small <strong>⋯</strong> on a slot has Use, Attune, Swap, Move to party stash and <em>Move to…</em>. Click an empty slot to equip a carried item that fits. A glow means attuned. <em>Other</em> holds equipped items that fit no slot.</li>
  <li><strong>Inventory</strong>: Character shows this character's items (the carry-box button moves one to the party stash); Party stash shows the Utilities stash and purse, where Take brings items back (with the party vote if the GM has it on).</li>
  <li>Equipping an item that needs attunement asks whether to attune. At your limit it lists attuned items so you can unattune one.</li>
  <li><strong>Companions</strong>: drop a mount or pet Item (or pick one of your items), then drop perk Items onto it. One mount; pets up to the GM's limit. Perks only show their text.</li>
  <li><strong>Ashen Gate</strong> has one section per Ashen Gate module (Professions, Perks, Standing, Quests, Locations, Base). Where a module offers it, its own view shows here and works as in that module; otherwise a summary with an Open button.</li>
  <li>If you only observe a character, you can look but not change or roll.</li>
  <li>To switch back for good: the window's sheet menu (<em>Sheet</em> in the title bar) → choose the dnd5e character sheet.</li>
</ul>`;

export function showHelp() {
  const D = globalThis.foundry?.applications?.api?.DialogV2;
  if (!D) return {ok: false, error: 'Help could not open.'};
  return D.prompt({window: {title: 'Character Hub Help'}, content: HELP_HTML, ok: {label: 'Close'}, rejectClose: false});
}
