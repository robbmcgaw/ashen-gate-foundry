/**
 * Ashen Gate General Manager — optional appearance controller (AG-WORK-0014).
 * ag-appearance/0.1-beta is a provisional implementation-level interface,
 * NOT an approved common SDK. Only UI tokens are changed.
 */
import { parseStoredPolicy, serializePolicy, policyFromLegacy, isEverything } from './sidebar-policy.js';
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
// OLD (0.79.0) Hide the Journals tab from players. Replaced in 0.84.0 by the playerSidebarTabs checklist; still registered and read
// as a fallback until the checklist is first saved or migrated (migrateSidebarTabs), never changed or removed by this module.
export const HIDE_JOURNALS_KEY = 'hideJournalsTab';
export const DEFAULT_HIDE_JOURNALS = false;
// Show players only Player Handouts in the Items tab (0.79.0), world scope, GM-only, off by default; see handouts-filter.js.
export const PLAYER_HANDOUTS_KEY = 'playerHandoutsOnly';
export const DEFAULT_PLAYER_HANDOUTS = false;
// Show players only the Players folder in the Actors tab (0.79.0), world scope, GM-only, off by default.
export const PLAYERS_FOLDER_KEY = 'playersFolderOnly';
export const DEFAULT_PLAYERS_FOLDER = false;
// OLD (0.80.0) Hide the Compendiums tab from players. Same fallback as above.
export const HIDE_COMPENDIUMS_KEY = 'hideCompendiumsTab';
export const DEFAULT_HIDE_COMPENDIUMS = false;
// Player screen settings (0.81.0), all world scope, GM-only, off by default, purely visual (see scene-controls.js, sidebar-tabs.js,
// sidebar-collapse.js, player-dock.js). `state` is the key in getState(), `setter` the controller method, `who` the refusal wording.
export const PLAYER_SCREEN_FLAGS = Object.freeze([
  Object.freeze({key:'hidePlayerSceneTools',state:'hideSceneTools',setter:'setHideSceneTools',who:'which scene controls players see',
    name:'Hide Region Controls and Journal Notes from players\' scene controls',
    hint:'Players no longer see the Region Controls and Journal Notes tool groups in the scene controls. Only the buttons are hidden: nobody\'s permissions change, and notes and regions work as before. GMs always see them.'}),
  Object.freeze({key:'collapsePlayerSidebar',state:'collapsePlayerSidebar',setter:'setCollapsePlayerSidebar',who:'whether the sidebar starts collapsed for players',
    name:'Start players with the sidebar collapsed',
    hint:'When a player loads the game the sidebar starts collapsed, so the scene fills the screen. They can expand and collapse it as usual afterwards. Applied once when the game loads, not live. GMs are never collapsed.'}),
  Object.freeze({key:'playerDock',state:'playerDock',setter:'setPlayerDock',who:'whether players see the player dock',
    name:'Show the player dock',
    hint:'Players get a small group of buttons in a corner of the screen: Combat, Conditions and Quest Log (each only while its module is on and the player may open it), User Settings, Foundry Settings, an Ashen Gate menu of the windows they may open, and a button to minimize the dock. It pairs well with a short list of sidebar tabs: Combat and Foundry Settings open from the dock even when their tabs are hidden. GMs never see it.'}),
  // 0.82.0, both off by default, visual only, never for the GM (see player-dock.js, dock-controls.js).
  Object.freeze({key:'hidePlayersList',state:'hidePlayersList',setter:'setHidePlayersList',who:'whether players see the players list',
    name:'Hide the players list from players',
    hint:'Players no longer see the players, latency and FPS panel at the bottom left of the screen. With the player dock on, the dock has a User Settings link instead. Only the panel is hidden: nobody\'s permissions change. GMs always see it.'}),
  Object.freeze({key:'dockSceneControls',state:'dockSceneControls',setter:'setDockSceneControls',who:'where players\' scene controls sit',
    name:'Move players\' scene controls under the player dock',
    hint:'Players\' scene tools (select, target, measure and so on) sit under the player dock instead of the top left corner, in one row of Select, Select Targets, Measure and Find My Token. Needs Show the player dock. The tools work as before. GMs always see them in the normal place.'}),
  // 0.85.3, off by default, visual only, never for the GM (see dock-controls.js).
  Object.freeze({key:'pullSceneNavigationLeft',state:'pullSceneNavigationLeft',setter:'setPullSceneNavigationLeft',who:'where players\' scene navigation sits',
    name:'Pull the scene navigation to the left',
    hint:'Foundry centres the scene navigation bar, so it sits a long way in from the left. With this on, players\' bar moves left to sit beside the player dock (dock in the top left corner) or beside the scene controls, with a small gap. Works with or without the dock. The bar and its scene list work as before. GMs always see the normal place.'})
]);
// REVERTED (0.85.0): 0.83.0's "Move the scene navigation to the bottom left". The key stays registered (hidden, never shown in GM Setup)
// so old worlds that stored it load without error; nothing reads or writes it any more.
export const MOVE_SCENE_NAV_KEY = 'moveSceneNavigation';
// OLD (0.81.0) Show players only the Chat tab. Replaced in 0.84.0 by the checklist; read as a fallback only (see above).
export const CHAT_ONLY_KEY = 'chatOnlySidebar';
export const LEGACY_TAB_KEYS = Object.freeze({hideJournalsTab:HIDE_JOURNALS_KEY,hideCompendiumsTab:HIDE_COMPENDIUMS_KEY,chatOnlySidebar:CHAT_ONLY_KEY});
// Which sidebar tabs players keep (0.84.0), world scope, GM-only, JSON text (see sidebar-policy.js). Empty = not set yet.
export const PLAYER_TABS_KEY = 'playerSidebarTabs';
// Auto-collapse of the sidebar chat and Settings for players (0.82.0), world scope, GM-only. Seconds of inactivity; 0 = off.
export const AUTO_COLLAPSE_KEY = 'autoCollapseSeconds';
export const DEFAULT_AUTO_COLLAPSE_SECONDS = 8;
export const MAX_AUTO_COLLAPSE_SECONDS = 600;
export const cleanAutoCollapse = value => { const n = Number(value); return Number.isFinite(n) ? Math.min(MAX_AUTO_COLLAPSE_SECONDS, Math.max(0, Math.round(n))) : DEFAULT_AUTO_COLLAPSE_SECONDS; };
// Which screen corner the dock sits in (0.81.0), world scope, GM-only.
export const DOCK_CORNER_KEY = 'playerDockCorner';
export const DOCK_CORNERS = Object.freeze({'top-left':'Top left','top-right':'Top right','bottom-left':'Bottom left','bottom-right':'Bottom right'});
export const DEFAULT_DOCK_CORNER = 'top-left';
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
  function readChatOnly(){try{return read(CHAT_ONLY_KEY)===true;}catch{return false;}}
  /** The checklist as stored, or null when it has not been set (or saved) yet. */
  function readStoredTabs(){try{return parseStoredPolicy(read(PLAYER_TABS_KEY));}catch{return null;}}
  /** What players keep: the stored checklist, else the old three settings read as one (until migrated). */
  function readTabs(){return readStoredTabs()??policyFromLegacy({chatOnlySidebar:readChatOnly(),hideJournalsTab:readHideJournals(),hideCompendiumsTab:readHideCompendiums()});}
  function readHandouts(){try{const v=read(PLAYER_HANDOUTS_KEY);return v===undefined||v===null?DEFAULT_PLAYER_HANDOUTS:Boolean(v);}catch{return DEFAULT_PLAYER_HANDOUTS;}}
  function readPlayersFolder(){try{const v=read(PLAYERS_FOLDER_KEY);return v===undefined||v===null?DEFAULT_PLAYERS_FOLDER:Boolean(v);}catch{return DEFAULT_PLAYERS_FOLDER;}}
  function readHideCompendiums(){try{const v=read(HIDE_COMPENDIUMS_KEY);return v===undefined||v===null?DEFAULT_HIDE_COMPENDIUMS:Boolean(v);}catch{return DEFAULT_HIDE_COMPENDIUMS;}}
  function readFlag(flag){try{const v=read(flag.key);return v===undefined||v===null?false:Boolean(v);}catch{return false;}}
  function readAutoCollapse(){try{const v=read(AUTO_COLLAPSE_KEY);return v===undefined||v===null||v===''?DEFAULT_AUTO_COLLAPSE_SECONDS:cleanAutoCollapse(v);}catch{return DEFAULT_AUTO_COLLAPSE_SECONDS;}}
  function readDockCorner(){try{const v=read(DOCK_CORNER_KEY);return Object.hasOwn(DOCK_CORNERS,v)?v:DEFAULT_DOCK_CORNER;}catch{return DEFAULT_DOCK_CORNER;}}
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
      size:readSize(),chat:readChat(),compactPause:readPause(),playerSidebarTabs:readTabs(),playerSidebarTabsSaved:readStoredTabs()!==null,playerHandoutsOnly:readHandouts(),playersFolderOnly:readPlayersFolder(),
      ...Object.fromEntries(PLAYER_SCREEN_FLAGS.map(flag=>[flag.state,readFlag(flag)])),playerDockCorner:readDockCorner(),autoCollapseSeconds:readAutoCollapse()};
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
  /** GM only (rejected here, not just hidden): which sidebar tabs players keep (Chat always). Visual only. */
  async function setPlayerSidebarTabs(value){
    if(!user().isGM)throw new Error('Only GMs may change which sidebar tabs players see');
    const text=serializePolicy(value);
    await setSetting(PLAYER_TABS_KEY,text);observed.set(PLAYER_TABS_KEY,text);emit();return getState();
  }
  /**
   * 0.84.0, GM only, safe to run on every load: copies the old Journals / Compendiums / Chat-only settings into the checklist once.
   * Writes only the checklist; the old keys stay as they are. Does nothing when the checklist is already saved, or when the old
   * settings were all off (Everything is what an unset checklist already means). Returns {migrated:boolean, reason}.
   */
  async function migrateSidebarTabs(){
    if(!user().isGM)return {migrated:false,reason:'not-gm'};
    if(readStoredTabs()!==null)return {migrated:false,reason:'already-saved'};
    const policy=policyFromLegacy({chatOnlySidebar:readChatOnly(),hideJournalsTab:readHideJournals(),hideCompendiumsTab:readHideCompendiums()});
    if(isEverything(policy))return {migrated:false,reason:'nothing-to-migrate'};
    await setPlayerSidebarTabs(policy);
    return {migrated:true,reason:'copied-from-old-settings',policy};
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
  /** GM only (rejected here, not just hidden): the 0.81.0 player screen settings. Visual only; no document or permission changes. */
  const flagSetters=Object.fromEntries(PLAYER_SCREEN_FLAGS.map(flag=>[flag.setter,async value=>{
    if(!user().isGM)throw new Error(`Only GMs may change ${flag.who}`);
    const on=Boolean(value);
    await setSetting(flag.key,on);observed.set(flag.key,on);emit();return getState();
  }]));
  async function setPlayerDockCorner(value){
    if(!user().isGM)throw new Error('Only GMs may change where the player dock sits');
    if(!Object.hasOwn(DOCK_CORNERS,value))throw new TypeError('Unknown player dock corner');
    await setSetting(DOCK_CORNER_KEY,value);observed.set(DOCK_CORNER_KEY,value);emit();return getState();
  }
  async function setAutoCollapseSeconds(value){
    if(!user().isGM)throw new Error('Only GMs may change when the chat and Settings collapse for players');
    const n=Number(value);
    if(!Number.isFinite(n)||n<0)throw new TypeError('Auto-collapse seconds must be 0 or more');
    const next=cleanAutoCollapse(n);
    await setSetting(AUTO_COLLAPSE_KEY,next);observed.set(AUTO_COLLAPSE_KEY,next);emit();return getState();
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
    if(key===PLAYER_TABS_KEY){if(typeof value==='string')observed.set(key,value);else observed.delete(key);emit();return;}
    if(key===PAUSE_KEY||key===HIDE_JOURNALS_KEY||key===CHAT_ONLY_KEY||key===PLAYER_HANDOUTS_KEY||key===PLAYERS_FOLDER_KEY||key===HIDE_COMPENDIUMS_KEY){if(typeof value==='boolean')observed.set(key,value);else observed.delete(key);emit();return;}
    if(PLAYER_SCREEN_FLAGS.some(flag=>flag.key===key)){if(typeof value==='boolean')observed.set(key,value);else observed.delete(key);emit();return;}
    if(key===AUTO_COLLAPSE_KEY){if(typeof value==='number')observed.set(key,value);else observed.delete(key);emit();return;}
    if(key===DOCK_CORNER_KEY){if(typeof value==='string')observed.set(key,value);else observed.delete(key);emit();return;}
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
    listSizes:()=>listSizes(getState().size),setSize,setChat,setCompactPause,setPlayerSidebarTabs,migrateSidebarTabs,setPlayerHandoutsOnly,setPlayersFolderOnly,...flagSetters,setPlayerDockCorner,setAutoCollapseSeconds,applyTo,subscribe,refresh:emit,noteChange,dispose});
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
  game.settings.register(namespace,PLAYER_TABS_KEY,{
    name:'Sidebar tabs players keep',hint:'Which sidebar tabs players see. Chat is always kept. Only the tabs are hidden: nothing is removed or locked, and journals, compendium entries and Ashen Gate windows still open for players. GMs always see every tab.',
    scope:'world',config:false,restricted:true,type:String,default:'',onChange:value=>onSettingChange(PLAYER_TABS_KEY,value)
  });
  // The three settings the checklist replaced. Kept registered (hidden from Configure Settings) so worlds can still be read and upgraded.
  game.settings.register(namespace,HIDE_JOURNALS_KEY,{
    name:'Hide the Journals tab from players (replaced)',hint:'Replaced by the sidebar tabs checklist in GM Setup. Read only until that checklist is first saved.',
    scope:'world',config:false,restricted:true,type:Boolean,default:DEFAULT_HIDE_JOURNALS,onChange:value=>onSettingChange(HIDE_JOURNALS_KEY,value)
  });
  game.settings.register(namespace,HIDE_COMPENDIUMS_KEY,{
    name:'Hide the Compendiums tab from players (replaced)',hint:'Replaced by the sidebar tabs checklist in GM Setup. Read only until that checklist is first saved.',
    scope:'world',config:false,restricted:true,type:Boolean,default:DEFAULT_HIDE_COMPENDIUMS,onChange:value=>onSettingChange(HIDE_COMPENDIUMS_KEY,value)
  });
  game.settings.register(namespace,CHAT_ONLY_KEY,{
    name:'Show players only the Chat tab (replaced)',hint:'Replaced by the sidebar tabs checklist in GM Setup. Read only until that checklist is first saved.',
    scope:'world',config:false,restricted:true,type:Boolean,default:false,onChange:value=>onSettingChange(CHAT_ONLY_KEY,value)
  });
  game.settings.register(namespace,MOVE_SCENE_NAV_KEY,{
    name:'Scene navigation placement (removed)',hint:'Removed in 0.85.0 and ignored. Kept registered so older worlds load.',
    scope:'world',config:false,restricted:true,type:Boolean,default:false
  });
  for(const flag of PLAYER_SCREEN_FLAGS)game.settings.register(namespace,flag.key,{
    name:flag.name,hint:flag.hint,scope:'world',config:false,restricted:true,type:Boolean,default:false,onChange:value=>onSettingChange(flag.key,value)
  });
  game.settings.register(namespace,DOCK_CORNER_KEY,{
    name:'Player dock corner',hint:'Which corner of the screen the player dock sits in.',
    scope:'world',config:false,restricted:true,type:String,choices:DOCK_CORNERS,default:DEFAULT_DOCK_CORNER,onChange:value=>onSettingChange(DOCK_CORNER_KEY,value)
  });
  game.settings.register(namespace,AUTO_COLLAPSE_KEY,{
    name:'Auto-collapse chat and Settings after (seconds)',hint:'When a player opens the sidebar chat or the Settings panel, it collapses again after this many seconds without use. 0 turns it off. GMs are never collapsed.',
    scope:'world',config:false,restricted:true,type:Number,default:DEFAULT_AUTO_COLLAPSE_SECONDS,onChange:value=>onSettingChange(AUTO_COLLAPSE_KEY,value)
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
