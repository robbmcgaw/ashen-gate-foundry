/** Locations' GM-only launcher in the Scenes sidebar (0.25.1; it was in the Items sidebar, which Manager keeps).
 *  Foundry only renders the Scenes directory for a GM, and the mount is still gated on isGM here.
 *  This file neither imports nor requires General Manager.
 */
export const LOCATION_LAUNCHER = Object.freeze({
  tab: 'scenes', moduleId: 'ashen-gate-locations', label: 'Locations',
  order: 10, icon: 'fa-solid fa-map-location-dot'
});
const GROUP_SELECTOR = '[data-ag-launch-group="scenes"]';
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

  // One shelf, found again on every re-render, so the mount is idempotent.
  let group = element.querySelector?.(GROUP_SELECTOR);
  if (!group) {
    group = document.createElement('div');
    container.prepend(group);
  }
  group.classList?.add?.('ag-sidebar-launch-group', 'ag-sidebar-launchers');
  // className fallback for DOM-like test harnesses.
  if (typeof group.className === 'string')
    for (const name of ['ag-sidebar-launch-group', 'ag-sidebar-launchers'])
      if (!group.className.split(/\s+/).includes(name)) group.className += ` ${name}`;
  group.dataset.agLaunchGroup = 'scenes';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Ashen Gate GM tools');
  // Place before Foundry's directory-header search/filter region, not after it.
  if (header?.parentElement === container) header.before(group);
  else if (list?.parentElement === container) list.before(group);

  const matches = [...(group.querySelectorAll?.(BUTTON_SELECTOR) ?? [])];
  let button = matches[0];
  for (const duplicate of matches.slice(1)) duplicate.remove?.();
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.agModule = LOCATION_LAUNCHER.moduleId;
    button.dataset.agLaunch = 'locations';
    group.append(button);
  }
  // 0.19.0: one name everywhere (LOC-NAV-05): the launcher says Locations, like the window and the Actors launcher.
  button.innerHTML = '<i class="fa-solid fa-map-location-dot" aria-hidden="true"></i><span>Locations</span>';
  button.className = 'ag-sidebar-launch-button';
  button.dataset.agOrder = String(LOCATION_LAUNCHER.order);
  button.dataset.agLaunchOrder = String(LOCATION_LAUNCHER.order);
  button.title = 'Open Ashen Gate Locations (GM only)';
  button.setAttribute('aria-label', 'Open Ashen Gate Locations (GM)');
  // Guard at invocation as well as visibility; the module API repeats this check.
  button.onclick = event => {
    event.preventDefault();
    if (globalThis.game?.user?.isGM === false) return;
    Promise.resolve().then(onOpen).catch(error => {
      console.error('ashen-gate-locations launcher:', error);
      globalThis.ui?.notifications?.error(error?.message ?? String(error));
    });
  };
  return true;
}
