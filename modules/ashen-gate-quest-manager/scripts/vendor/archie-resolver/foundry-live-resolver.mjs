// AG-WORK-0013 provisional lifecycle adapter (NOT a registered shared API).
// World hooks invalidate derived index; explicit pack reload is async.
import {TEMPORARY_CONTRACT} from './contracts.mjs';
import {collectFoundryWorldEntries} from './foundry-world-adapter.mjs';
import {createResolver} from './resolver.mjs';
import {createDefinitionProviderRegistry} from './provider-registry.mjs';
import {loadCompendiumEntries} from './foundry-compendium-adapter.mjs';
const WORLD_DOCUMENT_TYPES = Object.freeze(['Actor','Item','JournalEntry','RollTable','Macro']);
const OPERATIONS = Object.freeze(['create','update','delete']);
const EVENTS = Object.freeze(WORLD_DOCUMENT_TYPES.flatMap(type=>OPERATIONS.map(op=>`${op}${type}`)));
export function createFoundryLiveResolver({game,hooks=globalThis.Hooks,domainEntries=()=>[],compendiumPackIds=[],
 currentViewer=()=>game?.user??null,isRevealed=()=>false,onChange=()=>{}}={}) {
  if(!game)throw new TypeError('game is required');
  if(!hooks||typeof hooks.on!=='function'||typeof hooks.off!=='function')throw new TypeError('Foundry Hooks.on and Hooks.off are required');
  for(const [name,fn] of Object.entries({domainEntries,currentViewer,isRevealed,onChange}))
    if(typeof fn!=='function')throw new TypeError(`${name} must be a function`);
  if(!Array.isArray(compendiumPackIds)||compendiumPackIds.some(id=>typeof id!=='string'||!id.trim())||
    new Set(compendiumPackIds).size!==compendiumPackIds.length)throw new TypeError('compendiumPackIds must contain unique nonempty pack IDs');
  let active=true,dirty=true,scheduled=false,revision=0,index=null,diagnostics=[],lastFailure=null;
  let compendiumEntries=[],compendiumDiagnostics=[],compendiumError=null,packGeneration=0;
  const registrations=[];
  const providerRegistry=createDefinitionProviderRegistry({onChange:()=>invalidate()});
  function rebuild() {
    if(!active)return;
    dirty=false;
    try {
      const world=collectFoundryWorldEntries({game});
      const owned=domainEntries();
      if(!Array.isArray(owned))throw new TypeError('domainEntries must return a synchronous array');
      const supplied=providerRegistry.readEntries();
      const next=createResolver([...world.entries,...owned,...supplied,...compendiumEntries],{currentViewer,isRevealed});
      index=next;diagnostics=world.diagnostics;lastFailure=null;
    } catch(error){index=null;diagnostics=[];lastFailure=error instanceof Error?error.message:'unknown index error';}
    revision++;
  }
  function ensureFresh(){if(active&&dirty)rebuild();return active&&index!==null;}
  function notifyOnce(){if(!active||scheduled)return;scheduled=true;
    queueMicrotask(()=>{scheduled=false;if(!active)return;ensureFresh();try{onChange(Object.freeze({revision,ready:index!==null}));}catch{}});
  }
  function invalidate(){if(!active)return;dirty=true;notifyOnce();}
  async function refreshCompendiums() {
    if(!active)return {status:'unavailable'};
    const generation=++packGeneration;
    compendiumEntries=[];compendiumDiagnostics=[];compendiumError=null;invalidate();
    try {
      const snapshot=await loadCompendiumEntries({game,packIds:compendiumPackIds});
      if(!active||generation!==packGeneration)return {status:'superseded'};
      compendiumEntries=snapshot.entries;compendiumDiagnostics=snapshot.diagnostics;invalidate();
      return {status:'ok',count:snapshot.entries.length};
    } catch(error){
      if(!active||generation!==packGeneration)return {status:'superseded'};
      compendiumError=error instanceof Error?error.message:'unknown compendium failure';invalidate();return {status:'unavailable'};
    }
  }
  function worldChanged(doc){if(doc?.pack||doc?.parent)return;invalidate();}
  try{for(const event of EVENTS)registrations.push([event,hooks.on(event,worldChanged)]);}
  catch(error){for(const [name,id] of registrations)try{hooks.off(name,id??worldChanged);}catch{}throw error;}
  return Object.freeze({
    contract:TEMPORARY_CONTRACT,
    capabilities:Object.freeze({contract:TEMPORARY_CONTRACT,readOnly:true,
      sources:Object.freeze(['world','domain','registered_provider','configured_compendium']),gmSourceRead:true,managerRequired:false}),
    registerProvider(config){if(!active)throw new Error('resolver disposed');return providerRegistry.register(config);},
    refreshCompendiums,
    readSource(id,options){return ensureFresh()?index.readSource(id,options):{status:'not_found'};},
    validateReferences(){if(!currentViewer()?.isGM)return {status:'forbidden'};
      return ensureFresh()?index.validateReferences():{status:'unavailable'};},
    resolve(id,options){return ensureFresh()?index.resolve(id,options):{status:'not_found'};},
    list(options){return ensureFresh()?index.list(options):[];},
    audit(){if(!currentViewer()?.isGM)return {status:'forbidden'};
      if(!active)return {status:'unavailable'};
      if(!ensureFresh())return {status:'unavailable',reason:lastFailure};
      return {...index.audit(),worldDiagnostics:diagnostics.slice(),compendiumDiagnostics:compendiumDiagnostics.slice(),
        compendiumError,registeredProviders:providerRegistry.getProviderIds(),revision};},
    refresh(){if(!active)return false;invalidate();ensureFresh();return index!==null;},
    dispose(){if(!active)return;active=false;packGeneration++;providerRegistry.dispose();compendiumEntries=[];
      index=null;dirty=false;for(const [name,id] of registrations)hooks.off(name,id??worldChanged);registrations.length=0;}
  });
}
