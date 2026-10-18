/**
 * Ashen Gate General Manager — optional appearance controller (AG-WORK-0014).
 * ag-appearance/0.1-beta is a provisional implementation-level interface,
 * NOT an approved common SDK. Only UI tokens are changed.
 */
export const APPEARANCE_CONTRACT = 'ag-appearance/0.1-beta';
export const WORLD_SKIN_KEY = 'worldSkin';
export const USER_SKIN_KEY = 'userSkin';

const DEFAULT_TOKENS = Object.freeze({
  '--ag-bg':'#191c21','--ag-panel':'#22252b','--ag-text':'#eadbc9',
  '--ag-muted':'#afafa9','--ag-border':'#4b4640','--ag-accent':'#caa574',
  '--ag-danger':'#d58787','--ag-focus':'#eed2a2'
});
const SKINS = Object.freeze([
  Object.freeze({id:'ag-default',label:'Ashen Gate — Standard',description:'Warm parchment on charcoal',tokens:DEFAULT_TOKENS}),
  Object.freeze({id:'ag-slate',label:'Ashen Gate — Slate',description:'Cool, high-contrast slate',tokens:Object.freeze({
    '--ag-bg':'#151d26','--ag-panel':'#26333e','--ag-text':'#f0f5f7',
    '--ag-muted':'#c1cbd0','--ag-border':'#657d8b','--ag-accent':'#9ed1dc',
    '--ag-danger':'#ef9c9c','--ag-focus':'#c8f4f4'
  })}),
  Object.freeze({id:'ag-ember',label:'Ashen Gate — Ember',description:'Deep brown with copper highlights',tokens:Object.freeze({
    '--ag-bg':'#241c19','--ag-panel':'#33251f','--ag-text':'#ffecdc',
    '--ag-muted':'#d9bda9','--ag-border':'#80624f','--ag-accent':'#f4b278',
    '--ag-danger':'#f09c94','--ag-focus':'#ffdd9d'
  })})
]);
export const DEFAULT_SKIN_ID = 'ag-default';
const findSkin = id => SKINS.find(s=>s.id===id);
const publicSkin = skin => ({id:skin.id,label:skin.label,description:skin.description});

/** Injectable settings facade, so permissions and preference precedence can be unit-tested. */
export function createAppearanceController({getSetting,setSetting,currentUser,subscribeSettings=()=>()=>{}}={}) {
  if (![getSetting,setSetting,currentUser,subscribeSettings].every(x=>typeof x==='function'))
    throw new TypeError('Appearance settings/current user callbacks are required');
  const listeners=new Set();
  let closed=false;
  const emit=()=>{if(closed)return;const state=getState();for(const fn of [...listeners]){try{fn(state);}catch(error){console.warn('[ashen-gate-manager] Appearance subscriber failed',error);}}};
  const disposeSettings=subscribeSettings(emit);
  function user(){const u=currentUser();if(!u?.id)throw new Error('Appearance requires an authenticated Foundry user');return u;}
  function listSkins(){return SKINS.map(publicSkin);}
  function getState(){
    user();
    const rawWorld=getSetting(WORLD_SKIN_KEY);
    const rawOverride=getSetting(USER_SKIN_KEY);
    const worldDefault=findSkin(rawWorld)?rawWorld:DEFAULT_SKIN_ID;
    const userOverride=rawOverride && findSkin(rawOverride) ? rawOverride : null;
    return {contract:APPEARANCE_CONTRACT,worldDefault,userOverride,
      effective:userOverride??worldDefault,source:userOverride?'user':(findSkin(rawWorld)?'world':'fallback'),
      invalidWorld:Boolean(rawWorld&&!findSkin(rawWorld)),invalidUser:Boolean(rawOverride&&!findSkin(rawOverride))};
  }
  async function setWorldDefault(id){
    if(!user().isGM)throw new Error('Only GMs may set the Ashen Gate world appearance');
    if(!findSkin(id))throw new TypeError('Unknown Ashen Gate skin');
    await setSetting(WORLD_SKIN_KEY,id);emit();return getState();
  }
  async function setUserOverride(id=null){
    user();
    if(id!==null && id!=='' && !findSkin(id))throw new TypeError('Unknown Ashen Gate skin');
    await setSetting(USER_SKIN_KEY,id??'');emit();return getState();
  }
  function applyTo(root){
    if(!root?.style || typeof root.style.setProperty!=='function')throw new TypeError('Appearance target must be an application root');
    const state=getState();const skin=findSkin(state.effective)||SKINS[0];
    for(const [key,value] of Object.entries(skin.tokens))root.style.setProperty(key,value);
    if(root.dataset)root.dataset.agSkin=skin.id;
    return state;
  }
  function subscribe(fn){if(typeof fn!=='function')throw new TypeError('Appearance subscriber must be callable');
    if(closed)throw new Error('Appearance controller disposed');listeners.add(fn);return ()=>listeners.delete(fn);}
  function dispose(){closed=true;listeners.clear();if(typeof disposeSettings==='function')disposeSettings();}
  return Object.freeze({contract:APPEARANCE_CONTRACT,listSkins,getState,setWorldDefault,setUserOverride,
    applyTo,subscribe,refresh:emit,dispose});
}

/** Foundry is the only settings authority. No client-storage or unregistered namespaces. */
export function registerAppearanceSettings({game,namespace,onSettingChange=()=>{}}){
  game.settings.register(namespace,WORLD_SKIN_KEY,{
    name:'Ashen Gate world appearance',scope:'world',config:false,restricted:true,type:String,
    default:DEFAULT_SKIN_ID,onChange:onSettingChange
  });
  game.settings.register(namespace,USER_SKIN_KEY,{
    name:'My Ashen Gate appearance',scope:'user',config:false,type:String,
    default:'',onChange:onSettingChange
  });
}
export function makeFoundryAppearanceController({game,namespace}){
  return createAppearanceController({
    currentUser:()=>game.user,
    getSetting:key=>game.settings.get(namespace,key),
    setSetting:(key,value)=>game.settings.set(namespace,key,value),
    // Registered world/user Foundry settings invoke controller.refresh() on change.
    subscribeSettings:()=>()=>{}
  });
}
