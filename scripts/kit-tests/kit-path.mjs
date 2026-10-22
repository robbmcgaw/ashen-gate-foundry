// The kit tests import General Manager's copies; scripts/check.mjs fails when any module's copy differs from them.
export const HTML = new URL('../../modules/ashen-gate-manager/scripts/ag-html.mjs', import.meta.url).href;
export const DIALOGS = new URL('../../modules/ashen-gate-manager/scripts/ag-dialogs.mjs', import.meta.url).href;
