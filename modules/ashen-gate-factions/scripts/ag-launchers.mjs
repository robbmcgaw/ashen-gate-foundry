/**
 * Ashen Gate Actors-sidebar launcher group.
 * Every player-facing module ships an identical copy of this file and adds only its own
 * button. Whichever module renders first creates the shared #ashen-gate-launchers group above the
 * directory header;
 * no module depends on another. scripts/check.mjs fails if the copies drift apart.
 */
export const LAUNCHER_GROUP_ID='ashen-gate-launchers';
export const LAUNCHER_ORDER=Object.freeze({
  'ashen-gate-profession-ledger':10,
  'ashen-gate-skill-trees':20,
  'ashen-gate-quest-manager':30,
  'ashen-gate-factions':40,
  'ashen-gate-headquarters':50,
  'ashen-gate-locations':55,
  'ashen-gate-utilities':60
});

const rankOf=node=>LAUNCHER_ORDER[node.dataset.agLauncher]??999;
const isElement=node=>typeof node?.querySelector==='function'&&typeof node.querySelectorAll==='function';

/** Rendered element from a hook's (app, html) pair; accepts HTMLElement, jQuery or an app. */
export function launcherRoot(app,html){
  const el=html??app?.element??app;
  const root=el?.jquery?el[0]:el;
  return isElement(root)?root:null;
}

function report(error){
  console.error('Ashen Gate launcher',error);
  globalThis.ui?.notifications?.warn?.(error?.message??String(error));
}

function createButton({moduleId,label,icon,onClick}){
  const button=document.createElement('button');
  button.type='button';
  button.className='ag-launcher';
  button.dataset.agLauncher=moduleId;
  button.title=`Open ${label}`;
  button.setAttribute('aria-label',`Open ${label}`);
  const glyph=document.createElement('i');
  glyph.className=icon;
  glyph.setAttribute('aria-hidden','true');
  const text=document.createElement('span');
  text.textContent=label;
  button.append(glyph);
  button.append(text);
  button.addEventListener('click',event=>{
    event.preventDefault();
    try{Promise.resolve(onClick()).catch(report);}catch(error){report(error);}
  });
  return button;
}

/** Sorts only Ashen Gate buttons, and only moves nodes when the order is wrong. */
function sortGroup(group){
  const buttons=[...group.children].filter(node=>node.dataset?.agLauncher);
  const sorted=[...buttons].sort((a,b)=>rankOf(a)-rankOf(b));
  if(sorted.every((node,index)=>node===buttons[index]))return;
  for(const node of sorted)group.append(node);
}

/**
 * Keeps the group directly above Foundry's directory header, as a sibling, so the header's
 * own Create/Folder buttons and search keep their layout. Falls back to inside the header
 * only when the header has no parent to sit in.
 */
function placeGroup(group,header){
  if(!header)return;
  const parent=header.parentElement;
  if(!parent){if(group.parentElement!==header)header.prepend(group);return;}
  const siblings=[...parent.children];
  if(group.parentElement===parent&&siblings.indexOf(group)===siblings.indexOf(header)-1)return;
  parent.insertBefore(group,header);
}

/**
 * Adds, refreshes or removes this module's button. Idempotent across re-renders.
 * visible=false removes the button, and the group too once it is empty.
 */
export function mountLauncher(root,{moduleId,label,icon,onClick,visible=true}){
  if(!isElement(root))return false;
  const own=[...root.querySelectorAll(`[data-ag-launcher="${moduleId}"]`)];
  let group=root.querySelector(`#${LAUNCHER_GROUP_ID}`);
  if(!visible){
    for(const button of own)button.remove();
    if(group&&![...group.children].some(node=>node.dataset?.agLauncher))group.remove();
    return true;
  }
  const header=root.matches?.('.directory-header')?root:root.querySelector('.directory-header');
  if(!group){
    if(!header)return false;
    group=document.createElement('div');
    group.id=LAUNCHER_GROUP_ID;
    group.className='ag-launchers';
    group.setAttribute('role','group');
    group.setAttribute('aria-label','Ashen Gate');
  }
  placeGroup(group,header);
  const [button=createButton({moduleId,label,icon,onClick}),...duplicates]=own;
  for(const duplicate of duplicates)duplicate.remove();
  if(button.parentElement!==group)group.append(button);
  sortGroup(group);
  return true;
}
