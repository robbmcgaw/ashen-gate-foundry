/** Help dialog text. Kept short; the README has the full list. */
export const HELP_HTML = `<p>The Character Hub is another way to look at the <strong>same</strong> character. Everything you change here changes the real character, and the standard dnd5e sheet shows it straight away (and the other way round).</p>
<ul>
  <li><strong>Open native sheet</strong> (top right) opens the standard dnd5e sheet at any time.</li>
  <li><strong>Hit points:</strong> type an amount and press Damage or Heal (damage uses temp HP first), or edit Current / Temp / Max adj. directly.</li>
  <li><strong>Rolls</strong> (skills, checks, saves, initiative) use the system's own roll dialog. Hold Shift/Alt/Ctrl as usual to skip it or roll with advantage/disadvantage.</li>
  <li><strong>Conditions</strong>: click one to turn it on or off, the same as the token HUD.</li>
  <li>If you only observe a character, you can look but not change or roll.</li>
  <li>To switch back for good: the window's sheet menu (<em>Sheet</em> in the title bar) → choose the dnd5e character sheet.</li>
</ul>`;

export function showHelp() {
  const D = globalThis.foundry?.applications?.api?.DialogV2;
  if (!D) return {ok: false, error: 'Help could not open.'};
  return D.prompt({window: {title: 'Character Hub Help'}, content: HELP_HTML, ok: {label: 'Close'}, rejectClose: false});
}
