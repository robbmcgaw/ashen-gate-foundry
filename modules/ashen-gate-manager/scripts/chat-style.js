/** Chat reskin helper (0.58.0). Presentation only: closes dnd5e's own collapsible description on a freshly rendered item card. */
export function collapseItemDescriptions(html,root=globalThis.document?.documentElement){
  if(root?.dataset?.agChat!=='on'||typeof html?.querySelectorAll!=='function')return 0;
  let n=0;
  for(const el of html.querySelectorAll('.chat-card .card-header.collapsible:not(.collapsed), .chat-card .description.collapsible:not(.collapsed)')){
    el.classList.add('collapsed');n++;
  }
  return n;
}
