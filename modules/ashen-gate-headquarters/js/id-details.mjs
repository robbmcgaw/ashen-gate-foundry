// GM-only "Details" fold holding a canonical id (never shown in normal views) with a Copy ID button. No Foundry globals.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function idDetails(id,label='Source ID'){
 return `<details class="aghq-iddetails" data-gm-id-details><summary>Details</summary><span class="aghq-iddetails__body">${esc(label)}: <code class="aghq-coderef">${esc(id)}</code> <button type="button" class="ag-btn ag-btn--sm" data-action="copy-id" data-copy-id="${esc(id)}">Copy ID</button></span></details>`;
}
/** A readable label for a machine token such as "room_owner" or "stage-2" ("Room owner", "Stage 2"). */
export const plainToken=t=>String(t??'').replace(/[_-]+/g,' ').trim().replace(/^./,c=>c.toUpperCase());
