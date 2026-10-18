/**
 * Actors sidebar launcher — Ashen Gate shared placement convention (proposal for
 * adoption by the other independent modules, not a shared runtime dependency).
 * Buttons appear above the Actors search/list in this declared order:
 * Profession Ledger (10), Factions & Renown (20), Skill Trees (30), Headquarters (40).
 */
export const SIDEBAR_BUTTON_ORDER = Object.freeze({
  actors: Object.freeze({
    'ashen-gate-profession-ledger':10,
    'ashen-gate-factions':20,
    'ashen-gate-skill-trees':30,
    'ashen-gate-headquarters':40
  }),
  items: Object.freeze({'ashen-gate-manager':10,'ashen-gate-locations':20})
});

export function orderedLaunchButtons(buttons) {
  return [...buttons].sort((left,right)=>{
    const leftRank=Number(left?.dataset?.agLaunchOrder ?? 999);
    const rightRank=Number(right?.dataset?.agLaunchOrder ?? 999);
    return leftRank-rightRank;
  });
}

function directoryRoot(app){
  if(!app)return null;
  if(typeof HTMLElement!=='undefined' && app instanceof HTMLElement)return app;
  return app.element ?? app[0] ?? null;
}

/** Idempotent across sidebar renders; only creates/owns the Factions launch button. */
export function attachActorLauncher(app,open,{visible=true}={}){
  const root=directoryRoot(app);
  if(!root?.querySelector)return false;
  const header=root.matches?.('.directory-header')?root:root.querySelector('.directory-header');
  if(!header)return false;
  if(!visible){
    const ownButton=root.querySelector('[data-ag-module-launch="ashen-gate-factions"]')
      ??root.querySelector('button.agf-open-button');
    if(ownButton)ownButton.remove();
    const shelf=header.querySelector('[data-ag-sidebar-launchers="actors"]');
    if(shelf&&!shelf.querySelector(':scope > button[data-ag-launch-order]'))shelf.remove();
    return true;
  }
  let shelf=header.querySelector('[data-ag-sidebar-launchers="actors"]');
  if(!shelf){
    shelf=document.createElement('div');
    shelf.className='ag-sidebar-launchers';
    shelf.dataset.agSidebarLaunchers='actors';
    shelf.setAttribute('aria-label','Ashen Gate character modules');
    header.prepend(shelf);
  }
  const preexisting=root.querySelector('[data-ag-module-launch="ashen-gate-factions"]')
      ??root.querySelector('button.agf-open-button');
  const button=preexisting??document.createElement('button');
  if(!preexisting){
    button.type='button';
    button.addEventListener('click',event=>{
      event.preventDefault();
      try{open();}catch(error){globalThis.ui?.notifications?.warn(error?.message??'Factions access denied.');}
    });
  }
  button.classList.add('ag-sidebar-open-button','agf-open-button');
  button.dataset.agModuleLaunch='ashen-gate-factions';
  button.dataset.agLaunchOrder=String(SIDEBAR_BUTTON_ORDER.actors['ashen-gate-factions']);
  button.title='Open Factions & Renown';
  button.setAttribute('aria-label','Open Factions & Renown');
  button.innerHTML='<i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>Factions & Renown</span>';
  if(button.parentElement!==shelf)shelf.append(button);
  // Ordering only affects buttons inside the shared shelf; never move or
  // restyle another specialist's preexisting sidebar controls.
  const children=orderedLaunchButtons(shelf.querySelectorAll(':scope > button[data-ag-launch-order]'));
  for(const child of children)shelf.append(child);
  return true;
}
