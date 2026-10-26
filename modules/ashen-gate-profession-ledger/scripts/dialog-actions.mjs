/** Ashen Gate Profession Ledger: a DialogV2 whose content buttons work (0.35.1). No Foundry globals are read here; the dialog class is passed in.
 * The Give… buttons in the hand-out pop-ups did nothing in Forge when they were wired only from DialogV2's `render` callback. Content buttons
 * (`data-action="name"`) now run `handlers[name](dataset, element)` through three channels that never double-fire (one click is handled once):
 *  1. ApplicationV2's own `actions` (it routes a click on any `[data-action]` inside the window to `options.actions[name]`);
 *  2. the `render` callback (event, dialog);
 *  3. a click listener put on the dialog element once `render()` has resolved (`attach`).
 * Nothing relies on an inline onclick. */
export function makeActionDialog(DialogClass,{id,title,content,handlers,buttons,classes=['agl-consent','ag-app','ag-dialog'],onError=()=>{}}){
  const run=(event,target)=>{
    const el=target?.closest?.('[data-action]');
    const fn=handlers[el?.dataset?.action];
    if(!fn||event?.__aglHandled)return;
    event.__aglHandled=true;event.preventDefault?.();
    try{Promise.resolve(fn(el.dataset,el)).catch(onError);}catch(err){onError(err);}
  };
  const attach=dialog=>{
    const root=dialog?.element;
    if(!root||root.__aglWired||typeof root.addEventListener!=='function')return;
    root.__aglWired=true;root.addEventListener('click',event=>run(event,event.target));
  };
  const actions=Object.fromEntries(Object.keys(handlers).map(name=>[name,(event,target)=>run(event,target)]));
  const dialog=new DialogClass({id,classes,window:{title},modal:false,rejectClose:false,content,buttons,actions,render:(event,d)=>attach(d??event?.target)});
  return {dialog,attach,run};
}
