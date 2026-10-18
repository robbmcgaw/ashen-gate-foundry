/** AG-FOUNDRY-DEV/1.7 Actors shelf. Each module owns only its own button.
 * Contract shared with Factions: data-ag-sidebar-launchers, data-ag-module-launch,
 * data-ag-launch-order. No Manager or other module is required.
 */
export const SIDEBAR_MODULE_ID='ashen-gate-skill-trees';
export const SIDEBAR_ORDER=30;
export const SIDEBAR_GROUP='actors';

export function orderedSidebarButtons(buttons){
  return [...buttons].sort((a,b)=>Number(a?.dataset?.agLaunchOrder??999)-Number(b?.dataset?.agLaunchOrder??999));
}
/** Do not relocate Foundry's normal search, header actions, or unrelated content. */
export function attachSkillTreesLauncher(app,open,{visible=true}={}){
  const root=(typeof HTMLElement!=='undefined'&&app instanceof HTMLElement)?app:(app?.element??app?.[0]);
  if(!root?.querySelector)return false;
  const header=root.matches?.('.directory-header')?root:root.querySelector('.directory-header');
  if(!header)return false;
  const ownSelector='[data-ag-module-launch="ashen-gate-skill-trees"]';
  const shelfSelector='[data-ag-sidebar-launchers="actors"]';
  const existing=[...root.querySelectorAll(ownSelector),...root.querySelectorAll('button.agst-open-button')]
    .filter((button,i,arr)=>arr.indexOf(button)===i);
  if(!visible){for(const button of existing)button.remove();
    const group=header.querySelector(shelfSelector);
    if(group&&!group.querySelector(':scope > button[data-ag-launch-order]'))group.remove();
    return true;
  }
  let shelf=header.querySelector(shelfSelector);
  if(!shelf){shelf=document.createElement('div');shelf.className='ag-sidebar-launchers';
    shelf.dataset.agSidebarLaunchers=SIDEBAR_GROUP;
    shelf.setAttribute('aria-label','Ashen Gate character modules');header.prepend(shelf);
  }
  // This module owns one button; remove stale duplicates from earlier render hooks.
  const button=existing[0]??document.createElement('button');
  for(const duplicate of existing.slice(1))duplicate.remove();
  if(!button.dataset.agStBound){button.addEventListener('click',event=>{
    event.preventDefault();open();
  });button.dataset.agStBound='true';}
  button.type='button';button.classList.add('agst-open-button','ag-sidebar-open-button');
  button.dataset.agModuleLaunch=SIDEBAR_MODULE_ID;
  button.dataset.agLaunchOrder=String(SIDEBAR_ORDER);
  delete button.dataset.agLauncherRank;
  button.title='Open Ashen Gate Skill Trees';button.setAttribute('aria-label','Open Ashen Gate Skill Trees');
  button.innerHTML='<i class="fa-solid fa-diagram-project" aria-hidden="true"></i><span>Skill Trees</span>';
  if(button.parentElement!==shelf)shelf.append(button);
  for(const child of orderedSidebarButtons(shelf.querySelectorAll(':scope > button[data-ag-launch-order]')))shelf.append(child);
  return true;
}
