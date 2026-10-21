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

export function moduleCards(launchers = [], access = []) {
  const byId = new Map(access.map(row => [row.id, row]));
  const cards = launchers.map(l => ({...l, access: byId.get(l.id) ?? null}));
  for (const row of access) if (!cards.some(c => c.id === row.id) && row.id !== 'ashen-gate-manager')
    cards.push({id: row.id, title: row.title, version: row.version, active: row.active, canOpen: false, state: row.state, role: row.reason, access: row});
  return cards.map(c => {
    const a = c.access;
    const state = a?.state ?? 'Unsupported';
    return {...c, playerAccessState: state, badge: accessBadge(state), canToggle: Boolean(a?.canToggle),
      playerAccessEnabled: a?.playerAccessEnabled === true, accessReason: a?.reason ?? 'No compatible Player Access API exposed.'};
  }).sort((x, y) => String(x.title).localeCompare(String(y.title)));
}
