/**
 * Modules tab cards (0.38.0): each Ashen Gate module's launcher row joined with its live Player Access row
 * (ag-player-access/1, read by player-access.js). Expected player modules that are not installed still get a card
 * so their state stays visible. Pure: Manager never stores access state; toggles go through changePlayerAccess.
 */
const BADGES = {
  Visible: {label: 'Visible to players', tone: 'ok'},
  Hidden: {label: 'Hidden from players', tone: 'warn'},
  'GM only': {label: 'GM only', tone: ''},
  Unavailable: {label: 'Module disabled', tone: 'danger'},
  'Not installed': {label: 'Not installed', tone: ''},
  Unsupported: {label: 'Player access unsupported', tone: ''}
};
export const accessBadge = state => BADGES[state] ?? {label: String(state ?? 'Unsupported'), tone: ''};

/** Shown on a player-facing module's card while at least one Test player is set (they see it even when it is hidden from players). */
export const TEST_PLAYERS_NOTE = 'Test players: on';

/** `testPlayerCount`: how many Test players are set (GM Setup > General); 0 adds no note. */
export function moduleCards(launchers = [], access = [], testPlayerCount = 0) {
  const byId = new Map(access.map(row => [row.id, row]));
  const cards = launchers.map(l => ({...l, access: byId.get(l.id) ?? null}));
  for (const row of access) {
    if (cards.some(c => c.id === row.id)) continue;
    // 0.46.0: Manager gets a card only for its NPC Codex (Player Access); Open goes to the NPC Codex tab.
    if (row.id === 'ashen-gate-manager') {
      if (row.audience === 'Player') cards.push({id: row.id, title: row.title, version: row.version, active: row.active, canOpen: true, opensCodex: true,
        state: 'Ready', role: 'The read-only NPC Codex players open. Reveals are set on the NPC Codex tab.', access: row});
      continue;
    }
    cards.push({id: row.id, title: row.title, version: row.version, active: row.active, canOpen: false, state: row.state, role: row.reason, access: row});
  }
  return cards.map(c => {
    const a = c.access;
    const state = a?.state ?? 'Unsupported';
    return {...c, playerAccessState: state, badge: accessBadge(state), canToggle: Boolean(a?.canToggle),
      testPlayersNote: testPlayerCount > 0 && ['Visible', 'Hidden'].includes(state) ? TEST_PLAYERS_NOTE : '',
      playerAccessEnabled: a?.playerAccessEnabled === true, accessReason: a?.reason ?? 'No compatible Player Access API exposed.'};
  }).sort((x, y) => String(x.title).localeCompare(String(y.title)));
}
