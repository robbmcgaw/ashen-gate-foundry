/**
 * Coin icons (0.34.0): the same look as Ashen Gate | Utilities' coins (0.24.0): a small metal disc with the coin's
 * letter and a soft glow in copper, silver, electrum, gold or platinum. The Hub ships its own copy (these helpers and
 * the .agch-coin* rules in character-hub.css), so it never needs Utilities' files.
 */
import {esc} from './constants.mjs';

/** The disc with the coin's first letter; decorative (the coin's name is said by the field or chip it sits in). */
export const coinIcon = key => `<span class="agch-coin__icon" aria-hidden="true">${esc(String(key ?? '').slice(0, 1).toUpperCase())}</span>`;
/** An inline amount ("12 gp") as a chip with the coin's icon. */
export const coinChip = (key, n) => `<span class="agch-coinchip agch-coin--${esc(key)}">${coinIcon(key)}<span>${esc(n)} ${esc(key)}</span></span>`;
