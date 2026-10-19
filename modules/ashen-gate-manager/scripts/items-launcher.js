/** General Manager's GM-only Items launcher. Shares one ordered "items" group with Locations
 *  (and anything else that joins it) whichever module renders first; Manager is first (order 10).
 *  This file neither imports nor requires any other module.
 */
export const MANAGER_LAUNCHER = Object.freeze({moduleId: 'ashen-gate-manager', order: 10});
const GROUP_SELECTOR = '[data-ag-launch-group="items"]';
const BUTTON_SELECTOR = '[data-ag-launch="manager"]';
const rank = node => Number(node.dataset?.agOrder ?? node.dataset?.agLaunchOrder ?? 999);

export function mountManagerLauncher(root, {isGM, onOpen} = {}) {
  if (typeof root?.querySelector !== 'function') return false;
  // Render hooks run on every client: a non-GM never keeps a button.
  if (!isGM || typeof onOpen !== 'function') {
    for (const b of root.querySelectorAll(BUTTON_SELECTOR)) b.remove();
    return false;
  }
  const header = root.querySelector('.directory-header');
  const container = header?.parentElement ?? root.querySelector('.directory-list')?.parentElement ?? root;
  let group = root.querySelector(GROUP_SELECTOR);
  if (!group) {
    group = document.createElement('div');
    group.className = 'ag-sidebar-launch-group';
    group.dataset.agLaunchGroup = 'items';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Ashen Gate GM tools');
    if (header?.parentElement === container) container.insertBefore(group, header);
    else container.prepend(group);
  }
  const [existing, ...duplicates] = group.querySelectorAll(BUTTON_SELECTOR);
  for (const duplicate of duplicates) duplicate.remove();
  let button = existing;
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.agLaunch = 'manager';
    button.innerHTML = '<i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i><span>General Manager</span>';
    button.addEventListener('click', event => {
      event?.preventDefault?.();
      // Guard at invocation as well as visibility.
      if (globalThis.game?.user?.isGM === false) return;
      Promise.resolve().then(onOpen).catch(error => {
        console.error('ashen-gate-manager launcher:', error);
        globalThis.ui?.notifications?.error(error?.message ?? String(error));
      });
    });
    group.append(button);
  }
  button.className = 'ag-sidebar-launch-button';
  button.dataset.agModule = MANAGER_LAUNCHER.moduleId;
  button.dataset.agOrder = String(MANAGER_LAUNCHER.order);
  button.dataset.agLaunchOrder = String(MANAGER_LAUNCHER.order);
  button.title = 'Open the GM-only Ashen Gate General Manager';
  button.setAttribute('aria-label', 'Open Ashen Gate General Manager');
  const children = [...group.children];
  const sorted = [...children].sort((a, b) => rank(a) - rank(b));
  if (!sorted.every((node, i) => node === children[i])) for (const node of sorted) group.append(node);
  return true;
}
