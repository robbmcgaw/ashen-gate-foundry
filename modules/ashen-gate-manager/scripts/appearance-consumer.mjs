/**
 * Ashen Gate — AG-WORK-0014 optional consumer helper.
 * Proposed consumer adapter for Manager's ag-appearance/0.1-beta API.
 * It neither persists settings nor creates another theme authority.
 * Bundled CSS fallback is always scoped to the provided application root.
 */
export const APPEARANCE_CONTRACT='ag-appearance/0.1-beta';
const FALLBACK = Object.freeze({
  '--ag-bg':'#1c2024',
  '--ag-panel':'#282d32',
  '--ag-text':'#f1eee8',
  '--ag-muted':'#b7b4ab',
  '--ag-border':'#555049',
  '--ag-accent':'#c9a66b',
  '--ag-danger':'#c67770',
  '--ag-focus':'#efca85'
});

function eligibleRoot(root) {
  return root && typeof root === 'object' &&
    root.style && typeof root.style.setProperty === 'function';
}
function getAppearance(modules) {
  const m=typeof modules?.get==='function'?modules.get('ashen-gate-manager'):null;
  const a=m?.active ? m.api?.appearance : null;
  if (!a || a.contract !== APPEARANCE_CONTRACT || typeof a.applyTo!=='function') return null;
  return a;
}
/**
 * Called when a specialist app mounts. Cleanup with dispose when it closes.
 * Refresh feature-detects Manager every time so disabling it doesn't crash.
 */
export function mountAshenGateAppearance({root,modules,logger=()=>{}}={}) {
  if (!eligibleRoot(root)) throw new TypeError('root must be an application element with style.setProperty');
  let active=true,unsubscribe=null,provider=null,revision=0;
  function fallback(){
    for(const [token,val] of Object.entries(FALLBACK)) root.style.setProperty(token,val);
  }
  async function refresh(){
    if (!active) return 'disposed';
    const current=++revision;
    const next=getAppearance(modules);
    if (next !== provider) {
      try { unsubscribe?.(); } catch(error){ logger(error); }
      unsubscribe=null;provider=next;
      if (provider && typeof provider.subscribe==='function') {
        try {
          const cleanup=provider.subscribe(()=>{void refresh();});
          if (typeof cleanup==='function') unsubscribe=cleanup;
          else if (cleanup && typeof cleanup.unsubscribe==='function') unsubscribe=()=>cleanup.unsubscribe();
        }catch(error){logger(error);}
      }
    }
    // The local CSS remains usable even if Manager is absent or provider fails.
    fallback();
    if (!provider) return 'fallback';
    try {
      await provider.applyTo(root);
      return (!active || current!==revision) ? 'stale' : 'applied';
    }catch(error){
      logger(error);
      if (active && current===revision) fallback();
      return 'fallback';
    }
  }
  fallback();
  void refresh();
  return Object.freeze({refresh,dispose(){
    active=false; revision++;
    try {unsubscribe?.();}catch(error){logger(error);}
    provider=null;unsubscribe=null;
  }});
}
