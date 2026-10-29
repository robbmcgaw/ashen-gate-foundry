/**
 * Ashen Gate General Manager — optional appearance controller (AG-WORK-0014).
 * ag-appearance/0.1-beta is a provisional implementation-level interface,
 * NOT an approved common SDK. Only UI tokens are changed.
 */
export const APPEARANCE_CONTRACT = 'ag-appearance/0.1-beta';
export const WORLD_SKIN_KEY = 'worldSkin';
export const USER_SKIN_KEY = 'userSkin';
// Kit 2 size set, per device (client scope). 'compact' is the kit default and writes no attribute.
export const SIZE_KEY = 'uiSize';
export const SIZES = Object.freeze(['compact','comfortable']);
export const DEFAULT_SIZE = 'compact';
// Chat reskin (0.58.0), per device (client scope), on by default. html[data-ag-chat="on"] scopes styles/chat.css.
export const CHAT_KEY = 'styleChat';
export const DEFAULT_CHAT = true;
// Compact pause (0.59.0), world scope, GM-only, off by default. html[data-ag-pause="compact"] scopes styles/pause.css.
export const PAUSE_KEY = 'compactPause';
export const DEFAULT_PAUSE = false;
// Hide the Journals tab from players (0.79.0), world scope, GM-only, off by default. Purely visual; see sidebar-tabs.js.
export const HIDE_JOURNALS_KEY = 'hideJournalsTab';
export const DEFAULT_HIDE_JOURNALS = false;
// Show players only Player Handouts in the Items tab (0.79.0), world scope, GM-only, off by default; see handouts-filter.js.
export const PLAYER_HANDOUTS_KEY = 'playerHandoutsOnly';
export const DEFAULT_PLAYER_HANDOUTS = false;
// Show players only the Players folder in the Actors tab (0.79.0), world scope, GM-only, off by default.
export const PLAYERS_FOLDER_KEY = 'playersFolderOnly';
export const DEFAULT_PLAYERS_FOLDER = false;
// Hide the Compendiums tab from players (0.80.0), world scope, GM-only, off by default; see sidebar-tabs.js.
export const HIDE_COMPENDIUMS_KEY = 'hideCompendiumsTab';
export const DEFAULT_HIDE_COMPENDIUMS = false;
const SIZE_LABELS = Object.freeze({compact:'Compact',comfortable:'Comfortable'});
const knownSize = value => SIZES.includes(value) ? value : DEFAULT_SIZE;
/** Size options for a picker: [{id,label,selected}]. */
export const listSizes = (current=DEFAULT_SIZE) => SIZES.map(id=>({id,label:SIZE_LABELS[id],selected:id===knownSize(current)}));

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
  Object.freeze({id:'ag-blightgreen',label:'Ashen Gate — Blightgreen',description:'Sickly olive-grey with a pale lime accent, like the blight creeping in',tokens:skinTokens({
    surface:'#1b1f17',sunken:'#13160f',raised:'#252a1e',text:'#e6e9d8',muted:'#b3b99b',border:'#737c5e',
    accent:'#c5e86c',onAccent:'#141a05',danger:'#f2a090',ok:'#8fd49a',warn:'#e6c258',focus:'#e2f79e'})}),
  Object.freeze({id:'ag-cinderlight',label:'Ashen Gate — Cinderlight',description:'Near-black with one glowing orange-gold ember',tokens:skinTokens({
    surface:'#0e0c0b',sunken:'#080706',raised:'#171412',text:'#ece4dc',muted:'#ab9f95',border:'#6e6155',
    accent:'#ff9a2e',onAccent:'#1a0d00',danger:'#f39488',ok:'#86c99b',warn:'#e8c15f',focus:'#ffc266'})}),
  Object.freeze({id:'ag-hearthfire',label:'Ashen Gate — Hearthfire',description:'Warm tavern amber on dark oak, softer and cosier than Ember',tokens:skinTokens({
    surface:'#2a1d14',sunken:'#20150e',raised:'#35261b',text:'#f6e6cf',muted:'#d0b698',border:'#92704f',
    accent:'#e8a93c',onAccent:'#251502',danger:'#f4a08c',ok:'#a6d08a',warn:'#f0c765',focus:'#ffd98a'})}),
  Object.freeze({id:'ag-frostbound',label:'Ashen Gate — Frostbound',description:'Cold blue-white on deep navy',tokens:skinTokens({
    surface:'#0f1a2b',sunken:'#0a1220',raised:'#17263c',text:'#e9f2fb',muted:'#a3b9d2',border:'#547194',
    accent:'#9fd4f5',onAccent:'#06182a',danger:'#f6a6a6',ok:'#8fdcc0',warn:'#f0d27a',focus:'#d6f0ff'})}),
  Object.freeze({id:'ag-high-contrast',label:'Ashen Gate — High Contrast',description:'Pure black and white with a bold yellow focus ring, for accessibility',tokens:skinTokens({
    surface:'#000000',sunken:'#000000',raised:'#141414',text:'#ffffff',muted:'#e2e2e2',border:'#a6a6a6',
    accent:'#ffffff',onAccent:'#000000',danger:'#ffb0a8',ok:'#a6ffbc',warn:'#ffd77a',focus:'#ffe600'})}),
  Object.freeze({id:'ag-daylight',label:'Ashen Gate — Daylight',description:'Cool, low-glare paper with dark ink and a calm teal accent, for bright rooms',tokens:skinTokens({
    surface:'#f1f4f7',sunken:'#fafbfc',raised:'#e4e9ee',text:'#1a2027',muted:'#4a5663',border:'#76828f',
    accent:'#0b5f78',onAccent:'#ffffff',danger:'#9c2926',ok:'#1a5f35',warn:'#7a4a00',focus:'#1558b8'})}),
  // Structural skins: tokens as above plus a stylesheet (scoped by html[data-ag-skin]) that reshapes the kit components.
  Object.freeze({id:'ag-stone-tablet',label:'Ashen Gate — Stone Tablet',description:'Carved stone slabs, engraved headings and inset tabs',
    stylesheet:'styles/skins/stone-tablet.css',tokens:skinTokens({
    surface:'#2b302c',sunken:'#1d211f',raised:'#363c37',text:'#ebe8de',muted:'#c8ccbf',border:'#505850',
    accent:'#b9cc8c',onAccent:'#18200c',danger:'#f9b3aa',ok:'#93d4a4',warn:'#f4be80',focus:'#f5c97d'})}),
  Object.freeze({id:'ag-tome-pages',label:'Ashen Gate — Tome Pages',description:'Vellum pages, ink lettering and a ribbon bookmark',
    stylesheet:'styles/skins/tome-pages.css',tokens:skinTokens({
    surface:'#f1e6cc',sunken:'#f9f2e1',raised:'#e9dbbb',text:'#2c1d10',muted:'#5a4630',border:'#b49b74',
    accent:'#8a2a22',onAccent:'#fff8ec',danger:'#8a2219',ok:'#235a2c',warn:'#6b4400',focus:'#1d4f91'})}),
  Object.freeze({id:'ag-ledger-book',label:'Ashen Gate — Ledger Book',description:"A merchant's account book: ruled lines, column rules and stamped headings on green-cream paper",
    stylesheet:'styles/skins/ledger-book.css',tokens:skinTokens({
    surface:'#e9eddc',sunken:'#f4f7ea',raised:'#dde3cb',text:'#121a10',muted:'#3f4a35',border:'#6f7e63',
    accent:'#2f5d3a',onAccent:'#f7faee',danger:'#8f2a24',ok:'#1f5f35',warn:'#6e4a05',focus:'#1b4f9a'})}),
  Object.freeze({id:'ag-field-journal',label:'Ashen Gate — Field Journal',description:"A surveyor's notebook: leather cover, stitched edges and pasted-note cards",
    stylesheet:'styles/skins/field-journal.css',tokens:skinTokens({
    surface:'#2b2119',sunken:'#201812',raised:'#382c22',text:'#e8dfd0',muted:'#c0b29a',border:'#907a63',
    accent:'#d9b26f',onAccent:'#21160a',danger:'#f2a08c',ok:'#9ccd8a',warn:'#ecc468',focus:'#f2d796'})}),
  Object.freeze({id:'ag-frontier-map',label:'Ashen Gate — Frontier Map',description:'Sepia cartography with faint contour lines and a compass rose',
    stylesheet:'styles/skins/frontier-map.css',tokens:skinTokens({
    surface:'#ecdfc1',sunken:'#f6ecd5',raised:'#e8dbbb',text:'#231911',muted:'#54402a',border:'#8a714d',
    accent:'#7a3b1d',onAccent:'#fff6e4',danger:'#80241a',ok:'#285225',warn:'#6b4300',focus:'#1d4e89'})}),
  // Look-book skins (0.60.16, from the Studio appearance look book): structural stylesheets that also carry type, corner, depth and density tokens.
  Object.freeze({id:'ag-black-ink',label:'Ashen Gate — Black Ink',description:'OLED black with bone-white capitals, square corners and thin outlines',
    stylesheet:'styles/skins/black-ink.css',tokens:skinTokens({
    surface:'#0a0a0b',sunken:'#000000',raised:'#141416',text:'#f4f4f2',muted:'#a3a3a0',border:'#6b6b70',
    accent:'#e8e4da',onAccent:'#0a0a0b',danger:'#ff8a7d',ok:'#8fe0ae',warn:'#f2c14e',focus:'#ffffff'})}),
  Object.freeze({id:'ag-iron-ember',label:'Ashen Gate — Iron and Ember',description:'A cold forge: iron plates, engraved capitals and an orange glow on what matters',
    stylesheet:'styles/skins/iron-ember.css',tokens:skinTokens({
    surface:'#1d1d20',sunken:'#131315',raised:'#2a2a2f',text:'#f1ece6',muted:'#b0a8a0',border:'#6a6a74',
    accent:'#ff7f32',onAccent:'#1d0c00',danger:'#ff8d86',ok:'#8fd6a0',warn:'#f5c453',focus:'#ffb36b'})}),
  Object.freeze({id:'ag-moss-plum',label:'Ashen Gate — Moss Plum',description:'Deep forest green with antler-bone text, rounded corners and soft lamplight depth',
    stylesheet:'styles/skins/moss-plum.css',tokens:skinTokens({
    surface:'#17201a',sunken:'#0f1611',raised:'#1f2b23',text:'#ece8d8',muted:'#a9b5a2',border:'#587063',
    accent:'#d8cba4',onAccent:'#1a1d10',danger:'#f29a82',ok:'#8fd6a0',warn:'#e8bf5e',focus:'#f0e3b8'})})
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
  // Size is optional for older callers: a missing or unregistered setting reads as compact.
  function readSize(){try{return knownSize(read(SIZE_KEY));}catch{return DEFAULT_SIZE;}}
  function readChat(){try{const v=read(CHAT_KEY);return v===undefined||v===null?DEFAULT_CHAT:Boolean(v);}catch{return DEFAULT_CHAT;}}
  function readPause(){try{const v=read(PAUSE_KEY);return v===undefined||v===null?DEFAULT_PAUSE:Boolean(v);}catch{return DEFAULT_PAUSE;}}
  function readHideJournals(){try{const v=read(HIDE_JOURNALS_KEY);return v===undefined||v===null?DEFAULT_HIDE_JOURNALS:Boolean(v);}catch{return DEFAULT_HIDE_JOURNALS;}}
  function readHandouts(){try{const v=read(PLAYER_HANDOUTS_KEY);return v===undefined||v===null?DEFAULT_PLAYER_HANDOUTS:Boolean(v);}catch{return DEFAULT_PLAYER_HANDOUTS;}}
  function readPlayersFolder(){try{const v=read(PLAYERS_FOLDER_KEY);return v===undefined||v===null?DEFAULT_PLAYERS_FOLDER:Boolean(v);}catch{return DEFAULT_PLAYERS_FOLDER;}}
  function readHideCompendiums(){try{const v=read(HIDE_COMPENDIUMS_KEY);return v===undefined||v===null?DEFAULT_HIDE_COMPENDIUMS:Boolean(v);}catch{return DEFAULT_HIDE_COMPENDIUMS;}}
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
      invalidWorld:Boolean(rawWorld&&!findSkin(rawWorld)),invalidUser:Boolean(rawOverride&&!findSkin(rawOverride)),
      size:readSize(),chat:readChat(),compactPause:readPause(),hideJournalsTab:readHideJournals(),hideCompendiumsTab:readHideCompendiums(),playerHandoutsOnly:readHandouts(),playersFolderOnly:readPlayersFolder()};
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
  /** Any signed-in user may set their own size; it is a client (per-device) setting. */
  /** Any signed-in user may switch the chat reskin on or off for this device. */
  async function setChat(value){
    user();const on=Boolean(value);
    await setSetting(CHAT_KEY,on);observed.set(CHAT_KEY,on);emit();return getState();
  }
  /** GM only (rejected here, not just hidden): show the pause as a small indicator instead of Foundry's large banner, for everyone. */
  async function setCompactPause(value){
    if(!user().isGM)throw new Error('Only GMs may change how the pause is shown');
    const on=Boolean(value);
    await setSetting(PAUSE_KEY,on);observed.set(PAUSE_KEY,on);emit();return getState();
  }
  /** GM only (rejected here, not just hidden): hide the Journals sidebar tab from players. No document permission changes. */
  async function setHideJournalsTab(value){
    if(!user().isGM)throw new Error('Only GMs may change whether players see the Journals tab');
    const on=Boolean(value);
    await setSetting(HIDE_JOURNALS_KEY,on);observed.set(HIDE_JOURNALS_KEY,on);emit();return getState();
  }
  /** GM only (rejected here, not just hidden): players see only the Player Handouts folder in the Items tab. Visual only. */
  async function setPlayerHandoutsOnly(value){
    if(!user().isGM)throw new Error('Only GMs may change what players see in the Items tab');
    const on=Boolean(value);
    await setSetting(PLAYER_HANDOUTS_KEY,on);observed.set(PLAYER_HANDOUTS_KEY,on);emit();return getState();
  }
  /** GM only (rejected here, not just hidden): players see only the Players folder in the Actors tab. Visual only. */
  async function setPlayersFolderOnly(value){
    if(!user().isGM)throw new Error('Only GMs may change what players see in the Actors tab');
    const on=Boolean(value);
    await setSetting(PLAYERS_FOLDER_KEY,on);observed.set(PLAYERS_FOLDER_KEY,on);emit();return getState();
  }
  /** GM only (rejected here, not just hidden): hide the Compendiums sidebar tab from players. No document permission changes. */
  async function setHideCompendiumsTab(value){
    if(!user().isGM)throw new Error('Only GMs may change whether players see the Compendiums tab');
    const on=Boolean(value);
    await setSetting(HIDE_COMPENDIUMS_KEY,on);observed.set(HIDE_COMPENDIUMS_KEY,on);emit();return getState();
  }
  async function setSize(value){
    user();
    if(!SIZES.includes(value))throw new TypeError('Unknown Ashen Gate size');
    await setSetting(SIZE_KEY,value);observed.set(SIZE_KEY,value);emit();return getState();
  }
  /**
   * Foundry calls a setting's onChange on every client. The world skin is the same for everyone, so its value is taken
   * as handed over (game.settings.get can still be stale then). The per-user skin is not: a change another user made
   * arrives here too (0.54.1), so it is taken only when it is this user's own (userId = the changing user, when
   * Foundry says), and otherwise this client's own stored value is read again instead of adopting someone else's.
   */
  function noteChange(key,value,userId){
    if(key===USER_SKIN_KEY){
      const me=currentUser()?.id;
      if(userId&&me&&userId!==me){return;}
      if(userId&&userId===me&&(value===undefined||typeof value==='string'))observed.set(key,value??'');
      else observed.delete(key);
      emit();return;
    }
    if(key===CHAT_KEY){if(typeof value==='boolean')observed.set(key,value);else observed.delete(key);emit();return;}
    if(key===PAUSE_KEY||key===HIDE_JOURNALS_KEY||key===PLAYER_HANDOUTS_KEY||key===PLAYERS_FOLDER_KEY||key===HIDE_COMPENDIUMS_KEY){if(typeof value==='boolean')observed.set(key,value);else observed.delete(key);emit();return;}
    if([WORLD_SKIN_KEY,SIZE_KEY].includes(key)&&(value===undefined||typeof value==='string'))observed.set(key,value??'');emit();
  }
  function applyTo(root){
    if(!root?.style || typeof root.style.setProperty!=='function')throw new TypeError('Appearance target must be an application root');
    const state=getState();const skin=findSkin(state.effective)||SKINS[0];
    for(const [key,value] of Object.entries(skin.tokens))root.style.setProperty(key,value);
    if(root.dataset){
      root.dataset.agSkin=skin.id;
      // html[data-ag-size="comfortable"] switches the kit's size tokens; compact is the default, so no attribute.
      if(state.size===DEFAULT_SIZE)delete root.dataset.agSize;else root.dataset.agSize=state.size;
      // html[data-ag-chat="on"] turns on styles/chat.css (the chat sidebar and messages); absent when the user switches it off.
      if(state.chat)root.dataset.agChat='on';else delete root.dataset.agChat;
      // html[data-ag-pause="compact"] turns on styles/pause.css (small Paused indicator instead of the big banner); absent when off.
      if(state.compactPause)root.dataset.agPause='compact';else delete root.dataset.agPause;
    }
    return state;
  }
  function subscribe(fn){if(typeof fn!=='function')throw new TypeError('Appearance subscriber must be callable');
    if(closed)throw new Error('Appearance controller disposed');listeners.add(fn);return ()=>listeners.delete(fn);}
  function dispose(){closed=true;listeners.clear();if(typeof disposeSettings==='function')disposeSettings();}
  return Object.freeze({contract:APPEARANCE_CONTRACT,listSkins,getState,setWorldDefault,setUserOverride,
    listSizes:()=>listSizes(getState().size),setSize,setChat,setCompactPause,setHideJournalsTab,setHideCompendiumsTab,setPlayerHandoutsOnly,setPlayersFolderOnly,applyTo,subscribe,refresh:emit,noteChange,dispose});
}

/** Foundry is the only settings authority. No client-storage or unregistered namespaces. */
/** onSettingChange(key, newValue) runs when a setting changes (world/user: every client; size: this client only). */
export function registerAppearanceSettings({game,namespace,onSettingChange=()=>{}}){
  game.settings.register(namespace,WORLD_SKIN_KEY,{
    name:'Ashen Gate world appearance',scope:'world',config:false,restricted:true,type:String,
    default:DEFAULT_SKIN_ID,onChange:value=>onSettingChange(WORLD_SKIN_KEY,value)
  });
  game.settings.register(namespace,USER_SKIN_KEY,{
    name:'My Ashen Gate appearance',scope:'user',config:false,type:String,
    default:'',onChange:(value,options,userId)=>onSettingChange(USER_SKIN_KEY,value,typeof userId==='string'?userId:options?.userId)
  });
  game.settings.register(namespace,SIZE_KEY,{
    name:'Ashen Gate size',hint:'Comfortable makes text and controls larger on this device only.',
    scope:'client',config:false,type:String,choices:{compact:'Compact',comfortable:'Comfortable'},
    default:DEFAULT_SIZE,onChange:value=>onSettingChange(SIZE_KEY,value)
  });
  game.settings.register(namespace,CHAT_KEY,{
    name:'Style chat with the Ashen Gate skin',
    scope:'client',config:false,type:Boolean,default:DEFAULT_CHAT,onChange:value=>onSettingChange(CHAT_KEY,value)
  });
  // Set in GM Setup, not Game Settings. restricted: Foundry itself also refuses a non-GM write.
  game.settings.register(namespace,PAUSE_KEY,{
    name:'Show the pause as a small indicator',hint:'Hides the large Game Paused banner for everyone and shows a small Paused indicator at the top centre instead.',
    scope:'world',config:false,restricted:true,type:Boolean,default:DEFAULT_PAUSE,onChange:value=>onSettingChange(PAUSE_KEY,value)
  });
  game.settings.register(namespace,HIDE_JOURNALS_KEY,{
    name:'Hide the Journals tab from players',hint:'Players no longer see the Journals tab in the sidebar. Only the tab is hidden: journal permissions are unchanged, and handouts, quests and locations still open for players. GMs always see it.',
    scope:'world',config:false,restricted:true,type:Boolean,default:DEFAULT_HIDE_JOURNALS,onChange:value=>onSettingChange(HIDE_JOURNALS_KEY,value)
  });
  game.settings.register(namespace,HIDE_COMPENDIUMS_KEY,{
    name:'Hide the Compendiums tab from players',hint:'Players no longer see the Compendiums tab in the sidebar. Only the tab is hidden: compendium permissions are unchanged, and links and Ashen Gate windows that open compendium entries still work for players. GMs always see it.',
    scope:'world',config:false,restricted:true,type:Boolean,default:DEFAULT_HIDE_COMPENDIUMS,onChange:value=>onSettingChange(HIDE_COMPENDIUMS_KEY,value)
  });
  game.settings.register(namespace,PLAYER_HANDOUTS_KEY,{
    name:'Show players only Player Handouts in the Items tab',hint:'Players see only the Items inside a folder named Player Handouts (and its subfolders) in the Items tab. Every other Item and folder is hidden from the list. If no folder has that name, players see an empty Items tab. Only the list changes: item access is unchanged, and character sheets, compendiums and links still work. GMs always see everything.',
    scope:'world',config:false,restricted:true,type:Boolean,default:DEFAULT_PLAYER_HANDOUTS,onChange:value=>onSettingChange(PLAYER_HANDOUTS_KEY,value)
  });
  game.settings.register(namespace,PLAYERS_FOLDER_KEY,{
    name:'Show players only the Players folder in the Actors tab',hint:'Players see only the Actors inside a folder named Players (and its subfolders) in the Actors tab. Every other Actor and folder is hidden from the list. If no folder has that name, the list is empty. Only the list changes: Actor access is unchanged, and the Ashen Gate buttons in the Actors tab, character sheets and links still work. GMs always see everything.',
    scope:'world',config:false,restricted:true,type:Boolean,default:DEFAULT_PLAYERS_FOLDER,onChange:value=>onSettingChange(PLAYERS_FOLDER_KEY,value)
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
