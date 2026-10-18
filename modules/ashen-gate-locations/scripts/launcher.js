/** Locations' GM-only Items launcher. Shares one ordered vertical launcher group
 *  with independently installed Ashen Gate modules (FB-2026-10-16-001).
 *  This file neither imports nor requires General Manager.
 */
export const LOCATION_LAUNCHER = Object.freeze({
  tab: 'items', moduleId: 'ashen-gate-locations', label: 'Location Builder',
  order: 20, icon: 'fa-solid fa-map-location-dot'
});
const GROUP_SELECTOR = '[data-ag-launch-group="items"]';
const BUTTON_SELECTOR = '[data-ag-module="ashen-gate-locations"]';

export function mountLocationLauncher(root, {isGM, onOpen} = {}) {
  const element = root?.jquery ? root[0] : Array.isArray(root) ? root[0] : root;
  if (!element?.querySelector) return false;
  // Render hooks run for every client. Remove stale GM buttons if a client role
  // changes (or a synthetic test deliberately flips the logged-in role).
  if (!isGM || typeof onOpen !== 'function') {
    for (const b of element.querySelectorAll?.(BUTTON_SELECTOR) ?? []) b.remove?.();
    return false;
  }
  const header = element.querySelector('.directory-header, [data-part="header"]');
  const list = element.querySelector('.directory-list, [data-part="directory"]');
  const container = header?.parentElement ?? list?.parentElement ?? element;
  if (!container) return false;

  // Prefer the shared Items group; also recognize legacy Locations and Manager
  // wrappers so module activation order does not produce parallel shelves.
  const groups = [...(element.querySelectorAll?.(GROUP_SELECTOR) ?? [])];
  const legacy = [...(element.querySelectorAll?.('.ag-sidebar-launchers, .ag-sidebar-launch-group') ?? [])]
    .filter(g => !groups.includes(g) && (g.dataset?.agLaunchGroup === 'items' ||
      g.className?.includes('ag-sidebar-launchers')));
  const shelves = [...groups, ...legacy];
  let group = shelves[0];
  if (!group) {
    group = document.createElement('div');
    container.prepend(group);
  }
  group.classList?.add?.('ag-sidebar-launch-group', 'ag-sidebar-launchers');
  // className fallback for DOM-like test harnesses.
  if (typeof group.className === 'string')
    for (const name of ['ag-sidebar-launch-group', 'ag-sidebar-launchers'])
      if (!group.className.split(/\s+/).includes(name)) group.className += ` ${name}`;
  group.dataset.agLaunchGroup = 'items';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Ashen Gate GM tools');
  // Place before Foundry's directory-header search/filter region, not after it.
  if (header?.parentElement === container) header.before(group);
  else if (list?.parentElement === container) list.before(group);

  for (const shelf of shelves.slice(1)) {
    for (const child of [...(shelf.children ?? [])]) group.append(child);
    shelf.remove?.();
  }

  const matches = [...(group.querySelectorAll?.(BUTTON_SELECTOR) ?? [])];
  let button = matches[0];
  for (const duplicate of matches.slice(1)) duplicate.remove?.();
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.agModule = LOCATION_LAUNCHER.moduleId;
    button.dataset.agLaunch = 'locations';
    button.innerHTML = '<i class="fa-solid fa-map-location-dot" aria-hidden="true"></i><span>Location Builder</span>';
    group.append(button);
  }
  button.className = 'ag-sidebar-launch-button';
  button.dataset.agOrder = String(LOCATION_LAUNCHER.order);
  button.dataset.agLaunchOrder = String(LOCATION_LAUNCHER.order);
  button.title = 'Open GM-only Location Builder';
  button.setAttribute('aria-label', 'Open Ashen Gate Location Builder');
  // Guard at invocation as well as visibility; the module API repeats this check.
  button.onclick = event => {
    event.preventDefault();
    if (globalThis.game?.user?.isGM === false) return;
    Promise.resolve().then(onOpen).catch(error => {
      console.error('ashen-gate-locations launcher:', error);
      globalThis.ui?.notifications?.error(error?.message ?? String(error));
    });
  };
  // A legacy Manager launcher may use data-ag-launch="manager" without order.
  // Normalize only known items; leave unknown siblings and their callbacks intact.
  const directChildren = [...(group.children ?? [])];
  for (const child of directChildren) {
    if (child.dataset?.agLaunch === 'manager' || child.dataset?.agModule === 'ashen-gate-manager') {
      child.dataset.agModule = 'ashen-gate-manager';
      child.dataset.agOrder = '10';
      child.dataset.agLaunchOrder = '10';
      child.classList?.add?.('ag-sidebar-launch-button');
    }
  }
  const rank = child => Number(child.dataset?.agOrder ?? child.dataset?.agLaunchOrder ?? 999);
  directChildren.sort((a,b) => rank(a) - rank(b)).forEach(child => group.append(child));
  return true;
}
