// Builds the Ashen Gate living style guide (one self-contained HTML page) from the real kit and skins:
//   modules/ashen-gate-manager/styles/ag-ui.css            (the shared kit, as shipped)
//   modules/ashen-gate-manager/styles/skins/*.css           (structural skins, as shipped)
//   modules/ashen-gate-manager/scripts/appearance.js        (skin token tables, as shipped)
//   docs/ui-kit-next/ag-ui-next.draft.css, skins-next.draft.css   (proposed kit 2 additions)
//   modules/ashen-gate-factions/styles/module.css           (Renown today, for the before/after)
// Skin CSS is scoped to html[data-ag-skin]; here it is rescoped to [data-ag-skin] so several skins can show at once.
// Usage: node docs/ui-kit-next/build-style-guide.mjs [out.html]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const out = process.argv[2] ?? path.join(root, 'docs/ui-kit-next/style-guide.html');

const kit = read('modules/ashen-gate-manager/styles/ag-ui.css');
const next = read('docs/ui-kit-next/ag-ui-next.draft.css');
const rescope = css => css.replaceAll('html[data-ag-skin', '[data-ag-skin');
const skinsCss = ['stone-tablet', 'tome-pages'].map(s => rescope(read(`modules/ashen-gate-manager/styles/skins/${s}.css`))).join('\n')
  + '\n' + rescope(read('docs/ui-kit-next/skins-next.draft.css'));
const renownToday = read('modules/ashen-gate-factions/styles/module.css');
const renownVersion = JSON.parse(read('modules/ashen-gate-factions/module.json')).version;
const kitVersion = JSON.parse(read('modules/ashen-gate-manager/module.json')).version;

// Token tables straight from Manager's appearance controller.
const { createAppearanceController } = await import(pathToFileURL(path.join(root, 'modules/ashen-gate-manager/scripts/appearance.js')));
let current = 'ag-default';
const ctl = createAppearanceController({ getSetting: k => (k === 'worldSkin' ? current : ''), setSetting: async () => {}, currentUser: () => ({ id: 'u', isGM: true }) });
const skins = ctl.listSkins().map(s => {
  current = s.id;
  const tokens = {};
  ctl.applyTo({ style: { setProperty: (k, v) => { if (!['--ag-bg', '--ag-panel'].includes(k)) tokens[k] = v; } }, dataset: {} });
  return { id: s.id, label: s.label.replace('Ashen Gate — ', ''), description: s.description, structural: s.structural, tokens };
});
const light = id => ['ag-parchment', 'ag-tome-pages'].includes(id);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fa = (icon, extra = '') => `<i class="fa-solid fa-${icon}${extra}" aria-hidden="true"></i>`;
const code = html => `<details class="sg-code"><summary>Markup</summary><pre><code>${esc(html.trim())}</code></pre></details>`;
// A skinned stage: a bare ApplicationV2-like window so structural skin backgrounds apply.
const stage = (inner, { cls = '', fixed = '' } = {}) =>
  `<div class="sg-skin"${fixed ? ` data-fixed="${fixed}" data-ag-skin="${fixed}"` : ''}><div class="application ag-app sg-bare ${cls}"><section class="window-content">${inner}</section></div></div>`;
const block = ({ id, title, isNew, rule, html, show, wide }) => `
  <article class="sg-block${wide ? ' sg-block--wide' : ''}" id="${id}">
    <header class="sg-block__head"><h3>${title}</h3>${isNew ? '<span class="sg-tag sg-tag--new">New in kit 2</span>' : '<span class="sg-tag">In kit today</span>'}</header>
    <p class="sg-rule">${rule}</p>
    ${stage(show ?? html)}
    ${code(html)}
  </article>`;

// ---------- Specimens ----------
const header = `<header class="ag-header">
  <div class="ag-header__title">
    <h1><span class="ag-header__brand">Ashen Gate</span> | Renown</h1>
    <p>Known allies, rivals and reputations</p>
  </div>
  <div class="ag-header__meta">
    <span class="ag-version">v0.12.0</span>
    <button type="button" class="ag-btn ag-btn--ghost ag-btn--sm">${fa('circle-question')} Help</button>
  </div>
</header>`;

const tabs = `<nav class="ag-tabs ag-tabs--scroll" role="tablist" aria-label="Renown pages">
  <button type="button" role="tab" aria-selected="false">${fa('users')}Group</button>
  <button type="button" role="tab" aria-selected="false">${fa('user')}Player</button>
  <button type="button" role="tab" aria-selected="false">${fa('sun')}Pantheon</button>
  <button type="button" role="tab" aria-selected="true" class="active">${fa('landmark')}Organizations<span class="ag-tab__count">6</span></button>
  <button type="button" role="tab" aria-selected="false" class="ag-tab--gm">${fa('gears')}GM Setup</button>
</nav>`;

const toolbar = `<div class="ag-toolbar">
  <label class="ag-search">${fa('magnifying-glass')}
    <input type="search" placeholder="Search organizations" aria-label="Search organizations"></label>
  <div class="ag-toolbar__filters">
    <select aria-label="Visibility"><option>All visibility</option><option>Revealed</option><option>Hidden</option></select>
    <select aria-label="Sort"><option>Sort: Name</option><option>Sort: Renown</option></select>
  </div>
  <span class="ag-toolbar__count">6 of 6</span>
  <div class="ag-toolbar__end">
    <button type="button" class="ag-btn ag-btn--sm">${fa('file-import')} Import</button>
    <button type="button" class="ag-btn">${fa('plus')} New faction</button>
  </div>
</div>`;

const chips = `<div class="ag-chip-group" role="group" aria-label="Show">
  <button type="button" class="ag-chip" aria-pressed="true">Revealed</button>
  <button type="button" class="ag-chip" aria-pressed="false">Hidden</button>
  <button type="button" class="ag-chip" aria-pressed="false">Characters only</button>
</div>`;

const buttons = `<div class="ag-btn-group">
  <button type="button" class="ag-btn ag-btn--primary">${fa('floppy-disk')} Save changes</button>
  <button type="button" class="ag-btn">${fa('plus')} New faction</button>
  <button type="button" class="ag-btn ag-btn--ghost">Cancel</button>
  <button type="button" class="ag-btn ag-btn--danger">${fa('trash')} Delete faction</button>
</div>
<div class="ag-btn-group">
  <button type="button" class="ag-btn ag-btn--sm">${fa('eye')} Reveal</button>
  <button type="button" class="ag-btn ag-btn--sm ag-btn--danger">Remove</button>
  <button type="button" class="ag-btn ag-btn--icon ag-btn--ghost" aria-label="Remove reward" data-tooltip="Remove reward">${fa('xmark')}</button>
  <button type="button" class="ag-btn ag-btn--primary" disabled>Award (disabled)</button>
</div>`;

const segmented = `<div class="ag-segmented" role="radiogroup" aria-label="View as">
  <button type="button" role="radio" aria-checked="true">GM view</button>
  <button type="button" role="radio" aria-checked="false">Player preview</button>
</div>`;

const fields = `<div class="ag-form-grid">
  <label class="ag-field">Faction name<input value="[TEST] Lantern Wardens"></label>
  <label class="ag-field">Folder<select><option>Guilds</option><option>Temples</option></select></label>
  <label class="ag-field ag-field--wide">Public description<textarea rows="2">A sworn company that keeps the road lamps lit.</textarea>
    <span class="ag-field__hint">Players see this once the faction is revealed.</span></label>
  <label class="ag-field">Renown change<input type="number" value="12" aria-invalid="true">
    <span class="ag-field__hint is-error">Use a whole number from -50 to 50.</span></label>
  <label class="ag-field ag-field--inline"><input type="checkbox" checked> Allow Share with Party</label>
</div>`;

const badges = `<div class="ag-cluster">
  <span class="ag-badge ag-badge--ok">${fa('eye')} Revealed</span>
  <span class="ag-badge">Hidden</span>
  <span class="ag-badge ag-badge--accent">Characters only</span>
  <span class="ag-badge ag-badge--warn">Needs review</span>
  <span class="ag-badge ag-badge--danger">Import error</span>
  <span class="ag-gm-flag">${fa('eye-slash')} GM only</span>
</div>`;

const rarities = [['common', 'Common'], ['uncommon', 'Uncommon'], ['rare', 'Rare'], ['veryRare', 'Very rare'], ['legendary', 'Legendary'], ['artifact', 'Artifact']];
const rarity = `<div class="ag-cluster">
${rarities.map(([k, l]) => `  <span class="ag-rarity-badge" data-rarity="${k}">${l}</span>`).join('\n')}
</div>
<ul class="ag-rows sg-mt">
  <li class="ag-row ag-rarity-edge" data-rarity="veryRare"><span class="ag-row__icon">${fa('ring')}</span>
    <span class="ag-row__main"><span class="ag-row__title">[TEST] Ring of the Lamplighter</span><span class="ag-row__meta">Ring · requires attunement</span></span>
    <span class="ag-row__end"><span class="ag-rarity-badge" data-rarity="veryRare">Very rare</span></span></li>
  <li class="ag-row ag-rarity-edge" data-rarity="common"><span class="ag-row__icon">${fa('flask')}</span>
    <span class="ag-row__main"><span class="ag-row__title">[TEST] Potion of Healing</span><span class="ag-row__meta">Consumable · 2</span></span>
    <span class="ag-row__end"><span class="ag-rarity-badge" data-rarity="common">Common</span></span></li>
</ul>`;

const table = `<div class="ag-table-wrap">
  <table class="ag-table">
    <thead><tr><th scope="col">Rank</th><th scope="col" class="is-num">Renown</th><th scope="col">Reward</th><th scope="col" class="is-actions"><span class="sg-sr">Actions</span></th></tr></thead>
    <tbody>
      <tr><td>Stranger</td><td class="is-num">0</td><td>None</td><td class="is-actions"><button type="button" class="ag-btn ag-btn--sm">Edit</button></td></tr>
      <tr><td>Friend</td><td class="is-num">10</td><td>Safe house</td><td class="is-actions"><button type="button" class="ag-btn ag-btn--sm">Edit</button></td></tr>
      <tr class="is-selected"><td>Ally</td><td class="is-num">25</td><td>Lamp-oil stipend</td><td class="is-actions"><button type="button" class="ag-btn ag-btn--sm">Edit</button></td></tr>
      <tr><td>Sworn</td><td class="is-num">50</td><td>Warden's token</td><td class="is-actions"><button type="button" class="ag-btn ag-btn--sm">Edit</button></td></tr>
    </tbody>
  </table>
</div>`;

const orgs = [
  ['[TEST] Lantern Wardens', 'Marshal Ilse · Guilds', 'ok', 'Revealed', 34, 'Ally'],
  ['[TEST] Copper Syndicate', 'Unknown leader · Guilds', '', 'Hidden', 0, 'Stranger'],
  ['[TEST] Order of the Quiet Bell', 'Abbess Rhun · Temples', 'accent', 'Characters only', 12, 'Friend'],
];
const row = ([name, meta, tone, vis, score, rank], i) => `<li class="ag-row${i === 0 ? ' is-selected' : ''}"${i === 0 ? ' aria-current="true"' : ''}>
    <span class="ag-row__icon">${fa('landmark')}</span>
    <span class="ag-row__main"><span class="ag-row__title">${name}</span><span class="ag-row__meta">${meta}</span></span>
    <span class="ag-row__end"><span class="ag-badge${tone ? ` ag-badge--${tone}` : ''}">${vis}</span><strong class="sg-num">${score}</strong><span class="ag-row__meta">${rank}</span></span></li>`;
const rows = `<div class="ag-eyebrow">Guilds · 2</div>
<ul class="ag-rows">
  ${orgs.slice(0, 2).map(row).join('\n  ')}
</ul>`;

const cards = `<div class="ag-card-grid">
  <section class="ag-card">
    <header class="ag-card__head"><h3 class="ag-card__title">[TEST] The Lamplighter</h3><span class="ag-badge ag-badge--ok">Revealed</span></header>
    <p class="ag-card__meta">Deity of roads and night watches</p>
    <dl class="ag-kv"><dt>Favour</dt><dd>18 / 40</dd><dt>Domain</dt><dd>Light, Travel</dd></dl>
    <div class="ag-card__actions"><button type="button" class="ag-btn ag-btn--sm">Open</button></div>
  </section>
  <section class="ag-card ag-card--accent">
    <header class="ag-card__head"><h3 class="ag-card__title">[TEST] The Tide Mother</h3><span class="ag-badge ag-badge--accent">Patron</span></header>
    <p class="ag-card__meta">Deity of harbours and debts</p>
    <dl class="ag-kv"><dt>Favour</dt><dd>31 / 40</dd><dt>Domain</dt><dd>Tempest</dd></dl>
    <div class="ag-card__actions"><button type="button" class="ag-btn ag-btn--sm">Open</button></div>
  </section>
</div>`;

const notices = `<div class="ag-stack">
  <p class="ag-notice ag-notice--info">${fa('circle-info')}<span>Player preview: hidden fields are not shown.</span></p>
  <p class="ag-notice ag-notice--ok" role="status">${fa('check')}<span>Saved.</span></p>
  <p class="ag-notice ag-notice--warn">${fa('triangle-exclamation')}<span>General Manager is not active, so the default look is used.</span></p>
  <p class="ag-notice ag-notice--danger" role="alert">${fa('circle-xmark')}<span>Import failed: the file is not Renown JSON. Export it from Renown 0.9 or later.</span></p>
</div>`;

const empty = `<div class="ag-empty">${fa('landmark')}
  <p class="ag-empty__title">No organizations yet</p>
  <p class="ag-empty__text">Create one with New faction, or import a file.</p>
  <button type="button" class="ag-btn ag-btn--sm">${fa('plus')} New faction</button>
</div>`;

const meters = `<div class="ag-stack">
  <div class="ag-meter" role="progressbar" aria-label="Standing with [TEST] Lantern Wardens" aria-valuemin="0" aria-valuemax="50" aria-valuenow="34" style="--ag-meter: 68%">
    <span class="ag-meter__label">Standing · Ally</span><span class="ag-meter__value">34 / 50</span>
    <span class="ag-meter__track"><span class="ag-meter__fill"></span></span></div>
  <div class="ag-meter ag-meter--danger" role="progressbar" aria-label="Strain" aria-valuemin="0" aria-valuemax="10" aria-valuenow="8" style="--ag-meter: 80%">
    <span class="ag-meter__label">Strain · Backfire likely</span><span class="ag-meter__value">8 / 10</span>
    <span class="ag-meter__track"><span class="ag-meter__fill"></span></span></div>
  <div class="ag-cluster"><span class="ag-meter__label">Strain</span>
    <span class="ag-pips" aria-label="Strain 6 of 10">${'<i class="is-on"></i>'.repeat(4)}${'<i class="is-warn"></i>'.repeat(2)}${'<i></i>'.repeat(4)}</span></div>
</div>`;

const slots = `<div class="ag-hotbar" role="toolbar" aria-label="Quick bar">
  <button type="button" class="ag-slot is-active" data-rarity="rare" aria-label="1: [TEST] Frost Brand" data-tooltip="[TEST] Frost Brand">${fa('khanda')}<span class="ag-slot__key">1</span></button>
  <button type="button" class="ag-slot" data-rarity="uncommon" aria-label="2: [TEST] Shield +1">${fa('shield-halved')}<span class="ag-slot__key">2</span></button>
  <button type="button" class="ag-slot" aria-label="3: Healing potion">${fa('flask')}<span class="ag-slot__key">3</span><span class="ag-slot__qty">2</span></button>
  <button type="button" class="ag-slot is-empty" aria-label="4: empty slot"><span class="ag-slot__key">4</span></button>
  <button type="button" class="ag-slot is-empty" aria-label="5: empty slot"><span class="ag-slot__key">5</span></button>
</div>`;

const dialog = `<div class="application ag-app ag-dialog ag-dialog--danger sg-dialog" role="dialog" aria-labelledby="sg-dlg-title">
  <header class="window-header"><h1 class="window-title" id="sg-dlg-title">Delete this faction?</h1></header>
  <section class="window-content">
    <p>[TEST] Copper Syndicate and its 3 reputation records will be removed. Character Items already granted stay on the characters. This can't be undone.</p>
    <footer class="form-footer">
      <button type="button" data-action="cancel">Cancel</button>
      <button type="button" data-action="ok">${fa('trash')} Delete faction</button>
    </footer>
  </section>
</div>`;

const tooltip = `<span class="ag-cluster"><button type="button" class="ag-btn ag-btn--icon ag-btn--ghost" aria-label="Zoom in" data-tooltip="Zoom in" data-tooltip-class="ag-tooltip">${fa('magnifying-glass-plus')}</button>
<span class="locked-tooltip ag-tooltip sg-tip">Zoom in</span></span>`;

const footer = `<footer class="ag-footer">
  <button type="button" class="ag-btn ag-btn--ghost">Cancel</button>
  <span class="ag-footer__status" role="status">Unsaved changes</span>
  <button type="button" class="ag-btn ag-btn--primary">Save changes</button>
</footer>`;

const devtools = `<details class="ag-devtools">
  <summary><span class="ag-gm-flag">${fa('screwdriver-wrench')} Developer Tools</span></summary>
  <p class="ag-card__meta">Demo and test helpers. They never touch live campaign data.</p>
  <div class="ag-btn-group"><button type="button" class="ag-btn ag-btn--sm">Load four draft guilds</button></div>
</details>`;

// ---------- Renown pilot window: proposed ----------
const folderList = `<div class="ag-split__list">
  <div class="sg-listpad"><span class="ag-eyebrow">Guilds · 2</span></div>
  <ul class="ag-rows sg-flushrows">
    <li class="ag-row is-selected" aria-current="true"><span class="ag-row__main"><span class="ag-row__title">[TEST] Lantern Wardens</span><span class="ag-row__meta">Ally · 34</span></span></li>
    <li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">[TEST] Copper Syndicate</span><span class="ag-row__meta">Hidden</span></span></li>
  </ul>
  <div class="sg-listpad"><span class="ag-eyebrow">Temples · 1</span></div>
  <ul class="ag-rows sg-flushrows">
    <li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">[TEST] Order of the Quiet Bell</span><span class="ag-row__meta">Friend · 12</span></span></li>
    <li class="ag-row" aria-disabled="true"><span class="ag-row__main"><span class="ag-row__title">${fa('lock')} Undiscovered faction</span></span></li>
  </ul>
</div>`;
const panes = {
  group: `<div class="ag-split">${folderList}
    <div class="ag-split__detail ag-stack">
      <div class="ag-card__head"><div><span class="ag-eyebrow">Faction</span><h2 class="sg-h2">[TEST] Lantern Wardens</h2><p class="ag-card__meta">Marshal Ilse · keeps the road lamps lit</p></div>
        <span class="ag-badge ag-badge--ok">Revealed</span></div>
      ${meters.split('<div class="ag-meter ag-meter--danger"')[0].replace('<div class="ag-stack">', '')}
      <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Milestones</h3></div>${table}</section>
      <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">History</h3><span class="ag-gm-flag">${fa('eye-slash')} GM can adjust</span></div>
        <ul class="ag-rows"><li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">+6 Escorted the lamp convoy</span><span class="ag-row__meta">Session 14</span></span><span class="ag-row__end"><button type="button" class="ag-btn ag-btn--icon ag-btn--sm ag-btn--ghost" aria-label="Undo this change" data-tooltip="Undo this change">${fa('rotate-left')}</button></span></li>
        <li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">+10 Returned the stolen ledger</span><span class="ag-row__meta">Session 12</span></span><span class="ag-row__end"><button type="button" class="ag-btn ag-btn--icon ag-btn--sm ag-btn--ghost" aria-label="Undo this change" data-tooltip="Undo this change">${fa('rotate-left')}</button></span></li></ul></section>
    </div></div>`,
  orgs: `<div class="ag-split">${folderList}
    <div class="ag-split__detail">
      ${toolbar}
      <div class="ag-cluster sg-mb">${chips}</div>
      ${rows}
      <div class="ag-eyebrow sg-mt">Temples · 1</div>
      <ul class="ag-rows">${row(orgs[2], 1)}</ul>
    </div></div>`,
  pantheon: `<div class="ag-scroll ag-pad">
      <div class="ag-toolbar"><label class="ag-field ag-field--inline">Character<select><option>[TEST] Wren</option><option>[TEST] Oskar</option></select></label>
        <div class="ag-toolbar__end"><button type="button" class="ag-btn">${fa('plus')} New deity</button></div></div>
      ${cards}</div>`,
  setup: `<div class="ag-scroll ag-pad ag-stack">
      <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Player access</h3></div>
        <label class="ag-field ag-field--inline"><input type="checkbox" checked> Players can open Renown from the Actors sidebar</label></section>
      <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Group</h3></div>
        <div class="ag-form-grid"><label class="ag-field">Group display name<input value="The Company"></label><label class="ag-field">Pantheon damping<select><option>Gentle</option><option>Standard</option></select></label></div></section>
      ${devtools}
    </div>${footer}`,
};
const renownProposed = `<div class="application ag-app sg-window" data-pane="orgs">
  <header class="window-header"><h1 class="window-title">Ashen Gate | Renown</h1><button type="button" class="header-control" aria-label="Close">${fa('xmark')}</button></header>
  <section class="window-content"><div class="ag-window">
    ${header}
    <nav class="ag-tabs ag-tabs--scroll" role="tablist" aria-label="Renown pages">
      <button type="button" role="tab" data-sg-pane="group" aria-selected="false">${fa('users')}Group</button>
      <button type="button" role="tab" data-sg-pane="group" aria-selected="false">${fa('user')}Player</button>
      <button type="button" role="tab" data-sg-pane="pantheon" aria-selected="false">${fa('sun')}Pantheon</button>
      <button type="button" role="tab" data-sg-pane="orgs" aria-selected="true" class="active">${fa('landmark')}Organizations</button>
      <button type="button" role="tab" data-sg-pane="setup" aria-selected="false" class="ag-tab--gm">${fa('gears')}GM Setup</button>
    </nav>
    ${Object.entries(panes).map(([k, v]) => `<div class="sg-pane" data-pane-id="${k}"${k === 'orgs' ? '' : ' hidden'}>${v}</div>`).join('\n')}
  </div></section>
</div>`;

// ---------- Renown pilot window: today (real module.css, markup from templates/dashboard.hbs) ----------
const renownTodayHtml = `<div class="application ag-app ashen-gate-factions sg-window sg-window--today">
  <header class="window-header"><h1 class="window-title">Ashen Gate | Renown</h1><button type="button" class="header-control" aria-label="Close">${fa('xmark')}</button></header>
  <section class="window-content">
  <section class="agf-shell agf-v3" aria-label="Renown">
    <aside class="agf-sidebar">
      <header class="agf-aside-title"><span class="agf-eyebrow">ASHEN GATE / RENOWN</span><h2>Organizations</h2><p>Known allies, rivals &amp; reputations</p></header>
      <div class="agf-folder-list">
        <div class="agf-folder"><div class="agf-folder-title">${fa('folder')}<strong>Guilds</strong></div>
          <button class="agf-faction-card is-selected" type="button">[TEST] Lantern Wardens</button>
          <button class="agf-faction-card" type="button">[TEST] Copper Syndicate</button></div>
        <div class="agf-folder"><div class="agf-folder-title">${fa('folder')}<strong>Temples</strong></div>
          <button class="agf-faction-card" type="button">[TEST] Order of the Quiet Bell</button>
          <div class="agf-unknown"><i class="fa-solid fa-lock"></i> Undiscovered faction</div></div>
      </div>
    </aside>
    <main class="agf-main">
      <header class="ag-header"><h1>Ashen Gate | Renown</h1><div class="ag-header__actions"><span class="ag-version">v${renownVersion}</span><button type="button">${fa('circle-question')} Help</button></div></header>
      <nav class="ag-tabs agf-tabs" aria-label="Renown pages">
        <button type="button" class="agf-tab"><i class="fa-solid fa-users"></i> Group</button>
        <button type="button" class="agf-tab"><i class="fa-solid fa-user"></i> Player</button>
        <button type="button" class="agf-tab"><i class="fa-solid fa-sun"></i> Pantheon</button>
        <button type="button" class="agf-tab is-active"><i class="fa-solid fa-landmark"></i> Organizations</button><button type="button" class="agf-tab"><i class="fa-solid fa-gears"></i> GM Setup</button>
      </nav>
      <section class="agf-panel agf-orgs-roster" aria-label="All organizations">
        <h2>GM · All organizations <small>(3 of 3)</small></h2>
        <div class="agf-orgs-filters">
          <label>Search<input name="orgs-search" placeholder="Name, leader, tag, folder"></label>
          <label>Visibility<select><option>All</option></select></label>
          <label>Sort<select><option>Name</option></select></label>
          <label>Group by<select><option>Folder</option></select></label>
        </div>
        <section class="agf-orgs-group"><h3>Guilds <small>(2)</small></h3>
          <button type="button" class="agf-org-card is-selected"><strong>[TEST] Lantern Wardens</strong><small>FAC-TEST-01 · Marshal Ilse · Guilds</small><span class="agf-org-chips"><span class="agf-chip agf-chip--revealed-to-party">Revealed to party</span><span class="agf-chip">34 Renown · Ally</span></span></button>
          <button type="button" class="agf-org-card"><strong>[TEST] Copper Syndicate</strong><small>FAC-TEST-02 · Guilds</small><span class="agf-org-chips"><span class="agf-chip agf-chip--hidden">Hidden</span><span class="agf-chip">0 Renown</span></span></button>
        </section>
      </section>
      <section class="agf-panel agf-selected-character"><h2>GM · Selected character</h2><label>Choose the character for personal Renown, information reveals and rewards<select name="actor-id"><option>[TEST] Wren</option></select></label></section>
      <details class="agf-config-section"><summary>Organizations and folders</summary></details>
    </main>
  </section>
  </section>
</div>`;

// ---------- Skin gallery ----------
const miniWindow = s => `<button type="button" class="sg-skincard" data-skin-pick="${s.id}" aria-pressed="false">
  <div class="sg-skin" data-fixed="${s.id}" data-ag-skin="${s.id}">
    <div class="application ag-app sg-mini">
      <header class="window-header"><h1 class="window-title">Ashen Gate | Renown</h1></header>
      <section class="window-content">
        <header class="ag-header"><div class="ag-header__title"><h2><span class="ag-header__brand">Ashen Gate</span> | Renown</h2></div></header>
        <nav class="ag-tabs"><span class="ag-tab active">Group</span><span class="ag-tab">Pantheon</span></nav>
        <div class="sg-mini__body">
          <div class="ag-card ag-card--compact"><div class="ag-cluster"><span class="ag-badge ag-badge--ok">Revealed</span><span class="ag-rarity-badge" data-rarity="rare">Rare</span><span class="ag-rarity-badge" data-rarity="common">Common</span></div>
            <div class="ag-meter sg-mt" style="--ag-meter:62%"><span class="ag-meter__track"><span class="ag-meter__fill"></span></span></div></div>
          <div class="ag-cluster"><span class="ag-btn ag-btn--sm ag-btn--ghost">Cancel</span><span class="ag-btn ag-btn--sm ag-btn--primary">Save changes</span></div>
        </div>
      </section>
    </div>
  </div>
  <span class="sg-skincard__name">${s.label}</span><span class="sg-skincard__desc">${s.description}${s.structural ? ' · structural' : ''}${light(s.id) ? ' · light' : ''}</span>
</button>`;

const blocks = [
  { id: 'c-header', title: 'Window header', rule: '<code>h1</code> with the brand span; one-line subtitle optional; module controls, then version, then Help last on the right. No record names, no Alpha/Beta.', html: header },
  { id: 'c-tabs', title: 'Tabs', isNew: true, rule: 'Kit tabs plus three additions: a count, a GM marker for GM-only tabs (always last, GM Setup at the end) and <code>--scroll</code> so narrow windows scroll the strip instead of wrapping it.', html: tabs },
  { id: 'c-toolbar', title: 'Toolbar', isNew: true, rule: 'Fixed order: search (grows, filters as you type), filters, count, then create on the right. Import/Export as small buttons in the end slot. Seed/demo actions never here.', html: toolbar },
  { id: 'c-chips', title: 'Filter chips', isNew: true, rule: 'Chips are inputs (aria-pressed), badges are status. Use chips for 2–5 toggles; use a select for more.', html: chips },
  { id: 'c-buttons', title: 'Buttons', rule: 'One gold primary per pane, for the commit action. Create is a plain button with a +. Danger only for removing or resetting; rolls are never red. Icon-only buttons need aria-label and a tooltip.', html: buttons },
  { id: 'c-seg', title: 'Segmented control', isNew: true, rule: 'Switch between two to four views of the same thing (GM view / Player preview). Arrow keys move the choice.', html: segmented },
  { id: 'c-fields', title: 'Form fields', isNew: true, rule: '<code>.ag-field</code> everywhere: label above, hint below, error in danger with aria-invalid. <code>.ag-form-grid</code> lays fields out and wraps on narrow windows.', html: fields },
  { id: 'c-badges', title: 'Badges', rule: 'Status only, short, never a sentence and never a button. Errors that need words go in a notice.', html: badges },
  { id: 'c-rarity', title: 'Rarity', isNew: true, rule: 'One token set in the kit, keyed by dnd5e rarity on <code>data-rarity</code>. Hue for dots and edges; text uses an ink colour mixed toward the skin text so it reads on light skins. Common is grey.', html: rarity },
  { id: 'c-table', title: 'Table', isNew: true, rule: 'Real table for 3+ comparable columns: sticky head, stripes, numbers right-aligned, actions last.', html: table },
  { id: 'c-rows', title: 'Record rows', isNew: true, rule: 'Lists of factions, quests, locations, rooms. Title and meta on the left, status and value on the right, stripes, selected row marked with the accent edge. Group long lists under eyebrow headings with counts.', html: rows + `\n<div class="ag-eyebrow sg-mt">Temples · 1</div>\n<ul class="ag-rows">${row(orgs[2], 1)}</ul>` },
  { id: 'c-cards', title: 'Cards', isNew: true, rule: 'For things that stand alone (a deity, a Cinder, a facility), in an auto-fill grid. Never a card inside a panel or a card.', html: cards },
  { id: 'c-notice', title: 'Notices', isNew: true, rule: 'Inline messages with an icon. Saved, GM-only explanations, a missing partner module, errors with the fix.', html: notices },
  { id: 'c-empty', title: 'Empty state', isNew: true, rule: '"No X yet" plus the next step, naming real buttons. Players get what will appear and who reveals it, never GM instructions.', html: empty },
  { id: 'c-meter', title: 'Meters and pips', isNew: true, rule: 'Standing, Strain, progress. Same component in Hub and Cinders. Text sits beside the bar, never on the fill. role="progressbar" with values.', html: meters },
  { id: 'c-slots', title: 'Slots and hotbar', isNew: true, rule: 'Character Hub quick bar and equipment slots: number top-left, quantity bottom-right, rarity border, dashed when empty, accent ring when active.', html: slots },
  { id: 'c-dialog', title: 'Confirmation', isNew: true, rule: 'Shared helper opens DialogV2 with the skin classes. Question title, consequence with names (no ids), Cancel left, the verb on the right; red for destructive.', html: dialog, wide: false },
  { id: 'c-tooltip', title: 'Tooltip', isNew: true, rule: 'Foundry <code>data-tooltip</code> with <code>data-tooltip-class="ag-tooltip"</code>, skinned. Replaces native title text.', html: tooltip },
  { id: 'c-footer', title: 'Footer', rule: 'Editors and GM Setup: Cancel bottom-left, primary bottom-right, status between. Delete never sits next to Cancel.', html: footer },
  { id: 'c-dev', title: 'Developer Tools', isNew: true, rule: 'GM-only, collapsed, last thing in GM Setup. Seeders, QA resets and demo loaders only.', html: devtools },
];

const swatchTokens = [
  ['--ag-surface', 'Window'], ['--ag-surface-sunken', 'Sunken'], ['--ag-surface-raised', 'Raised'], ['--ag-surface-hover', 'Hover'],
  ['--ag-text', 'Text'], ['--ag-muted', 'Muted'], ['--ag-border', 'Border'], ['--ag-border-strong', 'Border strong'],
  ['--ag-accent', 'Accent'], ['--ag-accent-soft', 'Accent soft'], ['--ag-accent-contrast', 'On accent'], ['--ag-focus', 'Focus / info'],
  ['--ag-ok', 'OK'], ['--ag-warn', 'Warn'], ['--ag-danger', 'Danger'], ['--ag-row-alt', 'Stripe'],
];
const typeScale = [['--ag-text-xl', 'Header title · 19'], ['--ag-text-lg', 'Card title · 16'], ['--ag-text-md', 'Body and controls · 14'], ['--ag-text-sm', 'Labels and meta · 12'], ['--ag-text-xs', 'Badges and column heads · 11']];
const spaceScale = [1, 2, 3, 4, 5, 6];

const decisions = [
  ['D1', 'Keep today’s look (gold on charcoal plus the seven skins) as the base?', 'Yes. The audit found drift, not a bad direction.'],
  ['D2', 'New … buttons gold (primary) or plain?', 'Plain with a +. Gold stays for Save/Apply, one per view.'],
  ['D3', 'Character Hub keeps its icon rail?', 'Yes, it is a sheet. Labels become tooltips.'],
  ['D4', 'Player Access saves immediately or with Save changes?', 'With Save changes, like other settings.'],
  ['D5', 'Which rarity colours?', 'Hub’s hues, Common turned grey, one set in the kit.'],
  ['D6', 'Ledger Rare/Exotic finds look like item rarity?', 'No, their own badges.'],
  ['D7', 'Narrow tabs: scroll or wrap?', 'Scroll sideways.'],
  ['D8', 'Help as a dialog or a page in the window?', 'Dialog with Close, everywhere.'],
  ['D9', 'Show Alpha/Beta in headers?', 'No. Stage lives in the CHANGELOG.'],
  ['D10', 'Renown folder list beside every tab?', 'Yes on Group, Player, Organizations; Pantheon full width.'],
  ['D11', 'Foundry tooltips instead of native hover text?', 'Yes, module by module.'],
];

const html = `<title>Ashen Gate UI Standard</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Signika:wght@400;500;600;700&family=Amiri:wght@400;700&family=Roboto+Slab:wght@500;700&display=swap">
<script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/js/all.min.js" data-auto-replace-svg="nest" crossorigin="anonymous"></script>
<style>
/* Page chrome: a quiet workbench around the specimens. Specimens use the real kit; the chrome never uses --ag-* tokens. */
:root {
  --pg-bg: #e8e6e1; --pg-panel: #f6f5f2; --pg-ink: #1c1d1f; --pg-muted: #5c5e62; --pg-line: #d2cfc8; --pg-accent: #87632a; --pg-ok: #2c6a43; --pg-bad: #9a3328;
  --pg-font: "Signika", system-ui, -apple-system, "Segoe UI", sans-serif;
  --pg-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --pg-bg: #0c0d0f; --pg-panel: #15171a; --pg-ink: #e6e2da; --pg-muted: #9a958c; --pg-line: #2a2d31; --pg-accent: #d2a86a; --pg-ok: #7cc19a; --pg-bad: #e0817a; color-scheme: dark; } }
:root[data-theme="dark"] {
  --pg-bg: #0c0d0f; --pg-panel: #15171a; --pg-ink: #e6e2da; --pg-muted: #9a958c; --pg-line: #2a2d31; --pg-accent: #d2a86a; --pg-ok: #7cc19a; --pg-bad: #e0817a; color-scheme: dark; }
body { background: var(--pg-bg); color: var(--pg-ink); font: 400 15px/1.5 var(--pg-font); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--pg-panel); }
.sg-wrap { max-width: 1120px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 0 64px; }
.sg-top { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--pg-panel); border-bottom: 1px solid var(--pg-line); }
.sg-top__inner { max-width: 1120px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.sg-brand { font-weight: 700; letter-spacing: .01em; margin: 0; font-size: 17px; }
.sg-brand span { color: var(--pg-accent); }
.sg-draft { font: 600 11px/1 var(--pg-font); letter-spacing: .08em; text-transform: uppercase; color: var(--pg-muted); border: 1px solid var(--pg-line); border-radius: 999px; padding: 4px 8px; }
.sg-picker { display: flex; align-items: center; gap: 8px; margin-left: auto; min-width: 0; }
.sg-picker label { font-size: 13px; color: var(--pg-muted); }
.sg-picker select { font: 500 14px var(--pg-font); padding: 6px 8px; border: 1px solid var(--pg-line); border-radius: 6px; background: var(--pg-bg); color: var(--pg-ink); max-width: 60vw; }
.sg-nav { display: flex; gap: 6px; overflow-x: auto; padding-block: 2px 10px; scrollbar-width: none; max-width: 1120px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.sg-nav a { flex: none; color: var(--pg-muted); text-decoration: none; font-size: 13px; font-weight: 600; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--pg-line); }
.sg-nav a:hover, .sg-nav a:focus-visible { color: var(--pg-ink); border-color: var(--pg-accent); }
.sg-intro { padding-block: 28px 8px; max-width: 70ch; }
.sg-intro h2 { font-size: 28px; line-height: 1.15; margin: 0 0 10px; text-wrap: balance; }
.sg-intro p { margin: 0 0 8px; color: var(--pg-muted); }
.sg-section { padding-top: 36px; scroll-margin-top: 110px; }
.sg-section > h2 { font-size: 21px; margin: 0 0 4px; }
.sg-section > p { margin: 0 0 16px; color: var(--pg-muted); max-width: 70ch; }
.sg-legend { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 0; }
.sg-tag { font: 600 11px/1 var(--pg-font); letter-spacing: .04em; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--pg-line); color: var(--pg-muted); white-space: nowrap; }
.sg-tag--new { border-color: var(--pg-accent); color: var(--pg-accent); }
:focus-visible { outline: 2px solid var(--pg-accent); outline-offset: 2px; }

/* Skin gallery */
.sg-skins { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); gap: 14px; }
.sg-skincard { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 4px; cursor: pointer; padding: 8px; border-radius: 12px; border: 1px solid var(--pg-line); background: var(--pg-panel); min-width: 0; }
.sg-skincard[aria-pressed="true"] { border-color: var(--pg-accent); box-shadow: inset 0 0 0 1px var(--pg-accent); }
.sg-skincard:focus-visible { outline: 2px solid var(--pg-accent); outline-offset: 2px; }
.sg-skincard__name { font-weight: 600; padding: 4px 4px 0; }
.sg-skincard__desc { font-size: 13px; color: var(--pg-muted); padding: 0 4px 2px; }
.sg-mini { pointer-events: none; }
.sg-mini .window-content { min-height: 0; }
.sg-mini__body { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px; }
.sg-mini .ag-header { padding: 8px 12px; }
.sg-mini .ag-header h2 { font-size: 15px !important; }
.sg-mini .ag-tabs { padding: 4px 8px 0; }
.sg-mini .ag-tabs > .ag-tab { min-height: 28px; padding: 4px 10px; font-size: 12px; }
.sg-mini .ag-card { margin: 0; }

/* Tokens */
.sg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 16px; }
.sg-panel { background: var(--pg-panel); border: 1px solid var(--pg-line); border-radius: 12px; padding: 14px; min-width: 0; }
.sg-panel > h3 { margin: 0 0 10px; font-size: 15px; }
.sg-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.sg-sw { display: flex; flex-direction: column; gap: 2px; font-size: 12px; min-width: 0; }
.sg-sw b { display: block; height: 34px; border-radius: 6px; background: linear-gradient(var(--c), var(--c)), var(--under); box-shadow: inset 0 0 0 1px rgb(127 127 127 / .35); }
.sg-sw code, .sg-mono { font: 11px/1.3 var(--pg-mono); color: var(--pg-muted); overflow-wrap: anywhere; }
.sg-contrast { width: 100%; border-collapse: collapse; font-size: 13px; }
.sg-contrast td { padding: 5px 4px; border-top: 1px solid var(--pg-line); vertical-align: middle; }
.sg-contrast .sg-chipsample { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
.sg-pass { color: var(--pg-ok); font-weight: 600; } .sg-fail { color: var(--pg-bad); font-weight: 600; }
.sg-type > div { display: flex; align-items: baseline; gap: 10px; padding: 4px 0; border-top: 1px solid var(--pg-line); }
.sg-type > div:first-child { border-top: 0; }
.sg-type code { flex: 0 0 120px; font: 11px var(--pg-mono); color: var(--ag-muted); }
.sg-type > div { border-color: var(--ag-border) !important; }
.sg-space > div { display: flex; align-items: center; gap: 10px; font: 12px var(--pg-mono); color: var(--pg-muted); padding: 3px 0; }
.sg-space i { display: block; height: 12px; background: var(--pg-accent); border-radius: 2px; }
.sg-radii { display: flex; gap: 12px; flex-wrap: wrap; }
.sg-radii > div { display: flex; flex-direction: column; align-items: center; gap: 4px; font: 11px var(--pg-mono); color: var(--ag-muted); }
.sg-radii b { width: 56px; height: 40px; border: 2px solid var(--ag-accent); background: var(--ag-surface-raised); }

/* Component blocks */
.sg-blocks { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 480px), 1fr)); gap: 18px; align-items: start; }
.sg-block { min-width: 0; display: flex; flex-direction: column; gap: 8px; scroll-margin-top: 110px; }
.sg-block--wide { grid-column: 1 / -1; }
.sg-block__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sg-block__head h3 { margin: 0; font-size: 16px; }
.sg-rule { margin: 0; font-size: 14px; color: var(--pg-muted); }
.sg-rule code { font: 12px var(--pg-mono); color: var(--pg-ink); }
.sg-code summary { cursor: pointer; font-size: 13px; color: var(--pg-muted); }
.sg-code pre { margin: 6px 0 0; padding: 10px; overflow-x: auto; background: var(--pg-panel); border: 1px solid var(--pg-line); border-radius: 8px; font: 12px/1.45 var(--pg-mono); color: var(--pg-ink); max-height: 320px; }

/* Minimal stand-in for Foundry's ApplicationV2 window shell (Foundry's own CSS is not loaded here). */
.application { display: flex; flex-direction: column; position: relative; min-width: 0; box-sizing: border-box; text-align: left; }
.application *, .application *::before, .application *::after { box-sizing: border-box; }
.application > .window-header { display: flex; align-items: center; gap: 8px; padding: 0 6px 0 12px; height: 34px; flex: none; }
.application > .window-header .window-title { flex: 1; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.application > .window-header .header-control { all: unset; cursor: pointer; width: 26px; height: 26px; display: grid; place-items: center; color: inherit; }
.application > .window-content { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.application.sg-bare > .window-content { padding: 16px; gap: 10px; overflow: visible; }
.sg-skin { min-width: 0; }
.sg-skin .application { box-shadow: none; }
.sg-dialog { max-width: 420px; }
.sg-dialog > .window-content { padding: 16px; gap: 12px; }
.sg-dialog p { margin: 0; }
.sg-tip { position: static; display: inline-block; padding: 4px 8px; }
.sg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.sg-mt { margin-top: var(--ag-space-2); } .sg-mb { margin-bottom: var(--ag-space-3); }
.sg-num { font-variant-numeric: tabular-nums; min-width: 2ch; text-align: right; }
.sg-h2 { margin: 2px 0 2px; font-size: var(--ag-text-xl); }
.sg-listpad { padding: 10px 12px 4px; }
.sg-flushrows { border: 0; border-radius: 0; }
.ag-rows > .ag-row[aria-disabled="true"] { color: var(--ag-muted); }

/* Pilot window */
.sg-pilot-bar { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; margin: 0 0 12px; }
.sg-seg { display: inline-flex; border: 1px solid var(--pg-line); border-radius: 8px; overflow: hidden; }
.sg-seg button { all: unset; cursor: pointer; padding: 6px 14px; font-weight: 600; font-size: 14px; color: var(--pg-muted); }
.sg-seg button[aria-pressed="true"] { background: var(--pg-ink); color: var(--pg-bg); }
.sg-seg button:focus-visible { outline: 2px solid var(--pg-accent); outline-offset: -2px; }
.sg-width { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--pg-muted); }
.sg-width input { width: 160px; accent-color: var(--pg-accent); }
.sg-stagebox { overflow-x: auto; padding-bottom: 6px; }
.sg-window { width: var(--sg-w, 100%); max-width: 100%; height: 620px; margin: 0; }
.sg-window--today { width: 1000px; max-width: none; }
.sg-window .window-content { overflow: hidden; }
.sg-window .ag-window { height: 100%; }
.sg-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.sg-pane > .ag-split, .sg-pane > .ag-scroll { flex: 1; }
.sg-note { font-size: 13px; color: var(--pg-muted); margin: 8px 0 0; }

/* Decisions */
.sg-decisions { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.sg-decisions li { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 2px 10px; padding: 10px 12px; background: var(--pg-panel); border: 1px solid var(--pg-line); border-radius: 10px; }
.sg-decisions b { grid-row: span 2; font: 700 13px var(--pg-mono); color: var(--pg-accent); }
.sg-decisions span { color: var(--pg-muted); font-size: 14px; }
.sg-foot { margin-top: 40px; font-size: 13px; color: var(--pg-muted); }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
@media (max-width: 560px) { .sg-picker { margin-left: 0; width: 100%; } .sg-picker select { flex: 1; max-width: none; } .sg-intro h2 { font-size: 24px; } }
</style>
<style id="ag-ui-kit">/* styles/ag-ui.css as shipped (Manager ${kitVersion}) */
${kit}</style>
<style id="ag-ui-next">${next}</style>
<style id="ag-skins">${skinsCss}</style>
<style id="renown-today">/* modules/ashen-gate-factions/styles/module.css as shipped (Renown ${renownVersion}) */
${renownToday}</style>

<header class="sg-top">
  <div class="sg-top__inner">
    <h1 class="sg-brand"><span>Ashen Gate</span> UI Standard</h1>
    <span class="sg-draft">Draft for approval</span>
    <div class="sg-picker"><label for="sg-skin-select">Skin</label>
      <select id="sg-skin-select">${skins.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</select></div>
  </div>
  <nav class="sg-nav" aria-label="Sections">
    <a href="#skins">Skins</a><a href="#tokens">Tokens</a><a href="#components">Components</a><a href="#pilot">Renown pilot</a><a href="#decisions">Decisions</a>
  </nav>
</header>

<main class="sg-wrap">
  <section class="sg-intro">
    <h2>One look for every Ashen Gate window</h2>
    <p>Every specimen on this page is drawn with the real shared stylesheet and General Manager's real skin files. Parts marked “New in kit 2” come from the draft additions that would ship to all modules in one release.</p>
    <p>Pick a skin at the top and the whole page follows. Tap a skin card to do the same.</p>
    <div class="sg-legend"><span class="sg-tag">In kit today</span><span class="sg-tag sg-tag--new">New in kit 2</span></div>
  </section>

  <section class="sg-section" id="skins">
    <h2>Skins</h2>
    <p>The seven skins from General Manager. Stone Tablet and Tome Pages also reshape kit parts (stone bevels, book pages), which is why modules must use kit parts rather than their own.</p>
    <div class="sg-skins">${skins.map(miniWindow).join('\n')}</div>
  </section>

  <section class="sg-section" id="tokens">
    <h2>Tokens</h2>
    <p>Read live from the selected skin. Modules use these names only; no hex values in module CSS.</p>
    <div class="sg-grid">
      <div class="sg-panel"><h3>Colour · <span id="sg-skin-name"></span></h3><div class="sg-swatches" id="sg-swatches"></div></div>
      <div class="sg-panel"><h3>Contrast in this skin</h3><table class="sg-contrast"><tbody id="sg-contrast"></tbody></table>
        <p class="sg-note">Text needs 4.5:1. The two “today” rows are current problems: Hub Strain text on the accent fill, and the old near-white Common rarity (switch to Parchment or Tome Pages to see it fail).</p></div>
      <div class="sg-panel"><h3>Type scale</h3>${stage(`<div class="sg-type">${typeScale.map(([t, l]) => `<div><code>${t}</code><span style="font-size:var(${t})">${l}</span></div>`).join('')}</div>`)}</div>
      <div class="sg-panel"><h3>Spacing</h3><div class="sg-space">${spaceScale.map(n => `<div><i style="width:calc(var(--ag-space-${n}) * 3)"></i>--ag-space-${n}</div>`).join('')}</div>
        <h3 style="margin-top:14px">Radii (skins change these)</h3>
        ${stage(`<div class="sg-radii">${['sm', '', 'lg'].map(r => `<div><b style="border-radius:var(--ag-radius${r ? '-' + r : ''})"></b>--ag-radius${r ? '-' + r : ''}</div>`).join('')}</div>`)}</div>
      <div class="sg-panel"><h3>Elevation and motion</h3>
        <p class="sg-rule">Flat by default. Borders separate cards; the window shadow is the only big shadow. Hover changes colour in 120ms; meters move in 180ms; nothing moves with reduced motion on.</p>
        <p class="sg-mono">--ag-shadow-sm · --ag-shadow · --ag-dur-fast 120ms · --ag-dur 180ms · --ag-ease</p></div>
      <div class="sg-panel"><h3>Rarity</h3>${stage(`<div class="ag-cluster">${rarities.map(([k, l]) => `<span class="ag-rarity-badge" data-rarity="${k}">${l}</span>`).join('')}</div>`)}
        <p class="sg-note">Today Hub and Manager define different values, and “very rare” is spelt two ways, so they never match.</p></div>
    </div>
  </section>

  <section class="sg-section" id="components">
    <h2>Components</h2>
    <p>The catalogue. Each one shows the rule, the specimen in the selected skin and the markup to copy.</p>
    <div class="sg-blocks">${blocks.map(block).join('\n')}</div>
  </section>

  <section class="sg-section" id="pilot">
    <h2>Renown pilot</h2>
    <p>Renown is the first module to move to the standard. “Today” is drawn with Renown's shipped stylesheet and markup copied from its template, with test data. “Proposed” is the same tab built from kit parts only. The tabs in Proposed work.</p>
    <div class="sg-pilot-bar">
      <div class="sg-seg" role="group" aria-label="Version">
        <button type="button" data-sg-version="proposed" aria-pressed="true">Proposed</button>
        <button type="button" data-sg-version="today" aria-pressed="false">Today</button>
      </div>
      <label class="sg-width" id="sg-width-wrap">Window width <input type="range" id="sg-width" min="380" max="1100" value="1100" step="10"> <span id="sg-width-val" class="sg-mono">full</span></label>
    </div>
    <div class="sg-stagebox" id="sg-proposed"><div class="sg-skin">${renownProposed}</div></div>
    <div class="sg-stagebox" id="sg-today" hidden><div class="sg-skin">${renownTodayHtml}</div></div>
    <p class="sg-note" id="sg-pilot-note">Drag the width to see the window stack its folder list at narrow sizes (container queries, so it follows the Foundry window, not the screen).</p>
  </section>

  <section class="sg-section" id="decisions">
    <h2>Open decisions</h2>
    <p>Robb will be asked these one at a time. The suggested answer is under each question.</p>
    <ol class="sg-decisions">${decisions.map(([id, q, a]) => `<li><b>${id}</b><strong>${q}</strong><span>${a}</span></li>`).join('')}</ol>
  </section>

  <p class="sg-foot">Built ${new Date().toISOString().slice(0, 10)} from the design/ui-standard branch: shared kit from General Manager ${kitVersion}, Renown ${renownVersion}. Foundry's own window CSS is replaced by a small stand-in, so check final details in Forge.</p>
</main>

<script>
const SKINS = ${JSON.stringify(skins)};
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
function paint(el, skin) {
  el.dataset.agSkin = skin.id;
  for (const [k, v] of Object.entries(skin.tokens)) el.style.setProperty(k, v);
}
for (const el of document.querySelectorAll('.sg-skin[data-fixed]')) paint(el, SKINS.find(s => s.id === el.dataset.fixed));

const hex = c => { const m = /^#([0-9a-f]{6})$/i.exec(c.trim()); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
const lum = rgb => .2126 * lin(rgb[0]) + .7152 * lin(rgb[1]) + .0722 * lin(rgb[2]);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
// Resolve any CSS colour (color-mix, oklab…) to sRGB bytes: let the browser compute it, then paint one canvas pixel.
const probe = document.createElement('span'); probe.style.display = 'none';
const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
function resolve(scopeEl, expr) {
  scopeEl.appendChild(probe); probe.style.color = ''; probe.style.color = expr;
  const c = getComputedStyle(probe).color; probe.remove();
  cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
  return [...cx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}

function applySkin(id) {
  const skin = SKINS.find(s => s.id === id) ?? SKINS[0];
  for (const el of document.querySelectorAll('.sg-skin:not([data-fixed])')) paint(el, skin);
  document.getElementById('sg-skin-select').value = skin.id;
  for (const b of document.querySelectorAll('[data-skin-pick]')) b.setAttribute('aria-pressed', String(b.dataset.skinPick === skin.id));
  document.getElementById('sg-skin-name').textContent = skin.label;
  const scope = document.querySelector('.sg-skin:not([data-fixed]) .ag-app');
  const cs = getComputedStyle(scope);
  document.getElementById('sg-swatches').innerHTML = ${JSON.stringify(swatchTokens)}.map(([t, l]) => {
    const v = cs.getPropertyValue(t).trim();
    return '<div class="sg-sw"><b style="--c:' + v + ';--under:' + cs.getPropertyValue('--ag-surface').trim() + '"></b><span>' + l + '</span><code>' + t + '</code></div>';
  }).join('');
  const pairs = [
    ['Body text', '--ag-text', '--ag-surface'], ['Muted on raised', '--ag-muted', '--ag-surface-raised'],
    ['Primary button', '--ag-accent-contrast', '--ag-accent'], ['Accent text on window', '--ag-accent', '--ag-surface'],
    ['Danger text on raised', '--ag-danger', '--ag-surface-raised'], ['OK text on raised', '--ag-ok', '--ag-surface-raised'],
    ['Rare rarity ink', '--ag-rarity-ink-rare', '--ag-surface-raised'], ['Uncommon rarity ink', '--ag-rarity-ink-uncommon', '--ag-surface-raised'],
    ['Today: Hub Strain text on fill', '--ag-text', '--ag-accent', true], ['Today: Common rarity #f4f4f4', '#f4f4f4', '--ag-surface-raised', true],
  ];
  document.getElementById('sg-contrast').innerHTML = pairs.map(([label, fg, bg, old]) => {
    const f = resolve(scope, fg.startsWith('--') ? 'var(' + fg + ')' : fg), b = resolve(scope, 'var(' + bg + ')');
    const r = f && b ? ratio(f, b) : 0; const ok = r >= 4.5;
    return '<tr><td>' + label + '</td><td><span class="sg-chipsample" style="color:rgb(' + f + ');background:rgb(' + b + ')">Aa</span></td><td class="' + (ok ? 'sg-pass' : 'sg-fail') + '">' + r.toFixed(1) + ':1' + (old ? ' (today)' : '') + '</td></tr>';
  }).join('');
  store.set('ag-sg-skin', skin.id);
}
document.getElementById('sg-skin-select').addEventListener('change', e => applySkin(e.target.value));
for (const b of document.querySelectorAll('[data-skin-pick]')) b.addEventListener('click', () => applySkin(b.dataset.skinPick));

// Pilot: tabs, version switch, width
const win = document.querySelector('#sg-proposed .sg-window');
for (const tab of win.querySelectorAll('[data-sg-pane]')) tab.addEventListener('click', () => {
  for (const t of win.querySelectorAll('[data-sg-pane]')) { const on = t === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); }
  for (const p of win.querySelectorAll('.sg-pane')) p.hidden = p.dataset.paneId !== tab.dataset.sgPane;
});
for (const b of document.querySelectorAll('[data-sg-version]')) b.addEventListener('click', () => {
  const today = b.dataset.sgVersion === 'today';
  for (const x of document.querySelectorAll('[data-sg-version]')) x.setAttribute('aria-pressed', String(x === b));
  document.getElementById('sg-today').hidden = !today; document.getElementById('sg-proposed').hidden = today;
  document.getElementById('sg-width-wrap').hidden = today;
  document.getElementById('sg-pilot-note').textContent = today
    ? 'Today: header inset inside the right pane, tabs pulled up over it by a negative margin and drawn as boxed buttons (Renown\\'s own button rule beats the kit tab style), four stacked filters, no create action in view (it sits in the collapsed section). Scroll sideways on a phone; the shipped window has a 760px minimum.'
    : 'Drag the width to see the window stack its folder list at narrow sizes (container queries, so it follows the Foundry window, not the screen).';
});
const width = document.getElementById('sg-width');
width.addEventListener('input', () => {
  const full = Number(width.value) >= 1100;
  win.style.setProperty('--sg-w', full ? '100%' : width.value + 'px');
  document.getElementById('sg-width-val').textContent = full ? 'full' : width.value + 'px';
});
// Chips and segmented specimens toggle.
document.addEventListener('click', e => {
  const chip = e.target.closest('.ag-chip'); if (chip) chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
  const seg = e.target.closest('.ag-segmented > [role="radio"]');
  if (seg) for (const r of seg.parentElement.children) r.setAttribute('aria-checked', String(r === seg));
});
applySkin(store.get('ag-sg-skin') || 'ag-default');
</script>
`;

fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB, ${skins.length} skins)`);
