/**
 * Ashen Gate General Manager — optional appearance controller (AG-WORK-0014).
 * ag-appearance/0.1-beta is a provisional implementation-level interface,
 * NOT an approved common SDK. Only UI tokens are changed.
 */
export const APPEARANCE_CONTRACT = 'ag-appearance/0.1-beta';
export const WORLD_SKIN_KEY = 'worldSkin';
export const USER_SKIN_KEY = 'userSkin';

// Base tokens of the shared UI kit (styles/ag-ui.css). --ag-bg/--ag-panel are pre-kit aliases.
const skinTokens=t=>Object.freeze({
  '--ag-surface':t.surface,'--ag-surface-sunken':t.sunken,'--ag-surface-raised':t.raised,
  '--ag-text':t.text,'--ag-muted':t.muted,'--ag-border':t.border,
  '--ag-accent':t.accent,'--ag-accent-contrast':t.onAccent,
  '--ag-danger':t.danger,'--ag-ok':t.ok,'--ag-warn':t.warn,'--ag-focus':t.focus,
  '--ag-bg':t.surface,'--ag-panel':t.raised
});
export const SKIN_TOKEN_NAMES=Object.freeze(['--ag-surface','--ag-surface-sunken','--ag-surface-raised','--ag-text','--ag-muted',
  '--ag-border','--ag-accent','--ag-accent-contrast','--ag-danger','--ag-ok','--ag-warn','--ag-focus','--ag-bg','--ag-panel']);
const DEFAULT_TOKENS=skinTokens({surface:'#17191d',sunken:'#111316',raised:'#1f2227',text:'#ece6dc',muted:'#a7a197',
  border:'#34373d',accent:'#d2a86a',onAccent:'#1a1408',danger:'#e0817a',ok:'#7cc19a',warn:'#e5b85c',focus:'#f0cf94'});
const SKINS = Object.freeze([
  Object.freeze({id:'ag-default',label:'Ashen Gate — Standard',description:'Warm gold on charcoal',tokens:DEFAULT_TOKENS}),
  Object.freeze({id:'ag-slate',label:'Ashen Gate — Slate',description:'Cool, high-contrast slate',tokens:skinTokens({
    surface:'#141a21',sunken:'#0e1318',raised:'#1c242d',text:'#eef3f6',muted:'#9fb0bc',border:'#2f3b47',
    accent:'#8fcbe0',onAccent:'#0b1820',danger:'#f0928f',ok:'#86d3a6',warn:'#f0c46b',focus:'#c4ecf7'})}),
  Object.freeze({id:'ag-ember',label:'Ashen Gate — Ember',description:'Deep brown with copper highlights',tokens:skinTokens({
    surface:'#1d1512',sunken:'#150f0c',raised:'#271c18',text:'#fbeadb',muted:'#c9ab96',border:'#47342b',
    accent:'#f0a35e',onAccent:'#231205',danger:'#f2867c',ok:'#9bcf8e',warn:'#f5c35f',focus:'#ffd59a'})}),
  Object.freeze({id:'ag-verdigris',label:'Ashen Gate — Verdigris',description:'Dark teal with brass accents',tokens:skinTokens({
    surface:'#121b1a',sunken:'#0c1312',raised:'#192423',text:'#e6f0ec',muted:'#97ada6',border:'#2b3b39',
    accent:'#d6b56a',onAccent:'#191304',danger:'#ec8a80',ok:'#74d0a8',warn:'#e9c066',focus:'#b9e8d6'})}),
  Object.freeze({id:'ag-parchment',label:'Ashen Gate — Parchment',description:'Light parchment with ink and bronze',tokens:skinTokens({
    surface:'#f4efe6',sunken:'#fbf8f2',raised:'#ebe3d6',text:'#2a241d',muted:'#6a5f52',border:'#cfc2ae',
    accent:'#734e21',onAccent:'#ffffff',danger:'#94352e',ok:'#25603b',warn:'#734f0c',focus:'#a5772b'})}),
  // Structural skins: tokens as above plus a stylesheet (scoped by html[data-ag-skin]) that reshapes the kit components.
  Object.freeze({id:'ag-stone-tablet',label:'Ashen Gate — Stone Tablet',description:'Carved stone slabs, engraved headings and inset tabs',
    stylesheet:'styles/skins/stone-tablet.css',tokens:skinTokens({
    surface:'#2b302c',sunken:'#1d211f',raised:'#363c37',text:'#ebe8de',muted:'#c8ccbf',border:'#505850',
    accent:'#b9cc8c',onAccent:'#18200c',danger:'#f9b3aa',ok:'#93d4a4',warn:'#f4be80',focus:'#f5c97d'})}),
  Object.freeze({id:'ag-tome-pages',label:'Ashen Gate — Tome Pages',description:'Vellum pages, ink lettering and a ribbon bookmark',
    stylesheet:'styles/skins/tome-pages.css',tokens:skinTokens({
    surface:'#f1e6cc',sunken:'#f9f2e1',raised:'#e9dbbb',text:'#2c1d10',muted:'#5a4630',border:'#b49b74',
    accent:'#8a2a22',onAccent:'#fff8ec',danger:'#8a2219',ok:'#235a2c',warn:'#6b4400',focus:'#1d4f91'})})
]);
export const DEFAULT_SKIN_ID = 'ag-default';
const findSkin = id => SKINS.find(s=>s.id===id);
// swatch: four display colours for previews (surface, raised, accent, text); not the token map.
const publicSkin = skin => ({id:skin.id,label:skin.label,description:skin.description,structural:Boolean(skin.stylesheet),
  swatch:['--ag-surface','--ag-surface-raised','--ag-accent','--ag-text'].map(k=>skin.tokens[k])});

/** Module-relative stylesheet path of a structural skin, or null (colour-only or unknown skin). */
export const skinStylesheet = id => findSkin(id)?.stylesheet ?? null;
export const SKIN_STYLESHEET_ID = 'ashen-gate-skin-stylesheet';
/**
 * Keeps exactly one <link> in <head> for the effective skin's stylesheet, and none for a colour-only skin.
 * The skin CSS only matches html[data-ag-skin="<id>"], so a link lingering for a moment is inert.
 */
export function syncSkinStylesheet(doc,skinId,{basePath,version=''}={}){
  if(!doc?.head || typeof doc.createElement!=='function')return null;
  const file=skinStylesheet(skinId);
  let link=doc.getElementById?.(SKIN_STYLESHEET_ID)??null;
  if(!file){link?.remove?.();return null;}
  const href=`${basePath}/${file}${version?`?v=${encodeURIComponent(version)}`:''}`;
  if(!link){
    link=doc.createElement('link');link.id=SKIN_STYLESHEET_ID;link.rel='stylesheet';
    doc.head.appendChild(link);
  }
  if(link.getAttribute?.('href')!==href)link.setAttribute('href',href);
  link.dataset&&(link.dataset.agSkin=skinId);
  return href;
}

/** Injectable settings facade, so permissions and preference precedence can be unit-tested. */
export function createAppearanceController({getSetting,setSetting,currentUser,subscribeSettings=()=>()=>{}}={}) {
  if (![getSetting,setSetting,currentUser,subscribeSettings].every(x=>typeof x==='function'))
    throw new TypeError('Appearance settings/current user callbacks are required');
  const listeners=new Set();
  // Values Foundry hands to a setting's onChange. On other clients game.settings.get can still return the previous
  // value at that moment, so a change is read from here first (this is what made players lag a change behind).
  const observed=new Map();
  const read=key=>observed.has(key)?observed.get(key):getSetting(key);
  let closed=false;
  const emit=()=>{if(closed)return;const state=getState();for(const fn of [...listeners]){try{fn(state);}catch(error){console.warn('[ashen-gate-manager] Appearance subscriber failed',error);}}};
  const disposeSettings=subscribeSettings(emit);
  function user(){const u=currentUser();if(!u?.id)throw new Error('Appearance requires an authenticated Foundry user');return u;}
  function listSkins(){return SKINS.map(publicSkin);}
  function getState(){
    user();
    const rawWorld=read(WORLD_SKIN_KEY);
    const rawOverride=read(USER_SKIN_KEY);
    const worldDefault=findSkin(rawWorld)?rawWorld:DEFAULT_SKIN_ID;
    const userOverride=rawOverride && findSkin(rawOverride) ? rawOverride : null;
    return {contract:APPEARANCE_CONTRACT,worldDefault,userOverride,
      effective:userOverride??worldDefault,source:userOverride?'user':(findSkin(rawWorld)?'world':'fallback'),
      invalidWorld:Boolean(rawWorld&&!findSkin(rawWorld)),invalidUser:Boolean(rawOverride&&!findSkin(rawOverride))};
  }
  async function setWorldDefault(id){
    if(!user().isGM)throw new Error('Only GMs may set the Ashen Gate world appearance');
    if(!findSkin(id))throw new TypeError('Unknown Ashen Gate skin');
    await setSetting(WORLD_SKIN_KEY,id);observed.set(WORLD_SKIN_KEY,id);emit();return getState();
  }
  async function setUserOverride(id=null){
    user();
    if(id!==null && id!=='' && !findSkin(id))throw new TypeError('Unknown Ashen Gate skin');
    await setSetting(USER_SKIN_KEY,id??'');observed.set(USER_SKIN_KEY,id??'');emit();return getState();
  }
  function noteChange(key,value){if([WORLD_SKIN_KEY,USER_SKIN_KEY].includes(key)&&(value===undefined||typeof value==='string'))observed.set(key,value??'');emit();}
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
    applyTo,subscribe,refresh:emit,noteChange,dispose});
}

/** Foundry is the only settings authority. No client-storage or unregistered namespaces. */
/** onSettingChange(key, newValue) runs on every client when either setting changes. */
export function registerAppearanceSettings({game,namespace,onSettingChange=()=>{}}){
  game.settings.register(namespace,WORLD_SKIN_KEY,{
    name:'Ashen Gate world appearance',scope:'world',config:false,restricted:true,type:String,
    default:DEFAULT_SKIN_ID,onChange:value=>onSettingChange(WORLD_SKIN_KEY,value)
  });
  game.settings.register(namespace,USER_SKIN_KEY,{
    name:'My Ashen Gate appearance',scope:'user',config:false,type:String,
    default:'',onChange:value=>onSettingChange(USER_SKIN_KEY,value)
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
