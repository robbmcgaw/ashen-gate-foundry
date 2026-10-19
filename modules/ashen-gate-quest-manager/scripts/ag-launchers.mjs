/**
 * Ashen Gate Actors-sidebar launcher group.
 * Every player-facing module ships an identical copy of this file and adds only its own
 * button. Whichever module renders first creates the shared #ashen-gate-launchers group above the
 * directory header;
 * no module depends on another. scripts/check.mjs fails if the copies drift apart.
 *
 * Layout: a two-column grid in LAUNCHER_ORDER. Utilities always takes a full row, and a lone
 * last button (odd count before Utilities) is marked data-ag-span="full" so the grid never
 * leaves a hole. Only modules that are enabled and permitted mount a button, so the grid
 * reflows by itself.
 */
export const LAUNCHER_GROUP_ID='ashen-gate-launchers';
export const LAUNCHER_ORDER=Object.freeze({
  'ashen-gate-quest-manager':10,
  'ashen-gate-factions':20,
  'ashen-gate-profession-ledger':30,
  'ashen-gate-skill-trees':40,
  'ashen-gate-locations':50,
  'ashen-gate-headquarters':60,
  'ashen-gate-utilities':100
});
/** Buttons that always take their own full-width row. */
export const FULL_WIDTH_LAUNCHERS=Object.freeze(['ashen-gate-utilities']);

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

function createButton({moduleId,label,title=label,icon,onClick}){
  const button=document.createElement('button');
  button.type='button';
  button.className='ag-launcher';
  button.dataset.agLauncher=moduleId;
  button.title=`Open ${title}`;
  button.setAttribute('aria-label',`Open ${title}`);
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

function setSpan(node,full){
  if(full){if(node.dataset.agSpan!=='full')node.dataset.agSpan='full';}
  else if(node.dataset.agSpan!==undefined)delete node.dataset.agSpan;
}

/**
 * Sorts only Ashen Gate buttons (moving nodes only when the order is wrong), then marks which
 * ones span both grid columns: the full-width ones, plus a lone last button of the paired rows.
 */
function sortGroup(group){
  const buttons=[...group.children].filter(node=>node.dataset?.agLauncher);
  const sorted=[...buttons].sort((a,b)=>rankOf(a)-rankOf(b));
  if(!sorted.every((node,index)=>node===buttons[index]))for(const node of sorted)group.append(node);
  const paired=sorted.filter(node=>!FULL_WIDTH_LAUNCHERS.includes(node.dataset.agLauncher));
  for(const node of sorted){
    const alone=paired.length%2===1&&node===paired.at(-1);
    setSpan(node,alone||FULL_WIDTH_LAUNCHERS.includes(node.dataset.agLauncher));
  }
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
export function mountLauncher(root,{moduleId,label,title,icon,onClick,visible=true}){
  if(!isElement(root))return false;
  const own=[...root.querySelectorAll(`[data-ag-launcher="${moduleId}"]`)];
  let group=root.querySelector(`#${LAUNCHER_GROUP_ID}`);
  if(!visible){
    for(const button of own)button.remove();
    if(group&&![...group.children].some(node=>node.dataset?.agLauncher))group.remove();
    else if(group)sortGroup(group);// reflow the rest so no hole is left
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
  const [button=createButton({moduleId,label,title,icon,onClick}),...duplicates]=own;
  for(const duplicate of duplicates)duplicate.remove();
  if(button.parentElement!==group)group.append(button);
  sortGroup(group);
  return true;
}
