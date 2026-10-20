/** Help dialog text. Kept short; the README has the full list. */
export const HELP_HTML = `<p>The Character Hub is another way to look at the <strong>same</strong> character. Everything you change here changes the real character, and the standard dnd5e sheet shows it straight away (and the other way round).</p>
<ul>
  <li><strong>Open native sheet</strong> (top right) opens the standard dnd5e sheet at any time.</li>
  <li><strong>Hit points:</strong> type an amount and press Damage or Heal (damage uses temp HP first), or edit Current / Temp / Max adj. directly.</li>
  <li><strong>Rolls</strong> (skills, checks, saves, initiative) use the system's own roll dialog. Hold Shift/Alt/Ctrl as usual to skip it or roll with advantage/disadvantage.</li>
  <li><strong>Conditions</strong>: click one to turn it on or off, the same as the token HUD.</li>
  <li><strong>Use</strong> / <strong>Cast</strong> open dnd5e's own dialog, so attacks, slots and uses work as on the native sheet.</li>
  <li><strong>Equipment</strong> boxes are a display only. <em>Move to…</em> changes where an item shows; <em>Equip…</em> on an empty box lists items that fit.</li>
  <li>Equipping an item that needs attunement asks whether to attune. At your limit it lists attuned items so you can unattune one.</li>
  <li><strong>Companions</strong>: drop a mount or pet Item (or pick one of your items), then drop perk Items onto it. One mount; pets up to the GM's limit. Perks only show their text.</li>
  <li><strong>Ashen Gate</strong> shows summaries from the other Ashen Gate modules. Changes are made in those modules: use each panel's Open button.</li>
  <li>If you only observe a character, you can look but not change or roll.</li>
  <li>To switch back for good: the window's sheet menu (<em>Sheet</em> in the title bar) → choose the dnd5e character sheet.</li>
</ul>`;

export function showHelp() {
  const D = globalThis.foundry?.applications?.api?.DialogV2;
  if (!D) return {ok: false, error: 'Help could not open.'};
  return D.prompt({window: {title: 'Character Hub Help'}, content: HELP_HTML, ok: {label: 'Close'}, rejectClose: false});
}
