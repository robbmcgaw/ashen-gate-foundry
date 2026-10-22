import {bindSkinPicker} from "./skin-picker.js";
import {windowSize, uiState, subTabs, tabPanelAttrs, bindTablist, bindFolds, fileButton, bindFileButtons, linkButton} from "./ag-html.mjs";
import {confirmDialog, confirmDanger, guardDirty, infoDialog} from "./ag-dialogs.mjs";
import {createAppearanceController, registerAppearanceSettings, makeFoundryAppearanceController, syncSkinStylesheet, APPEARANCE_CONTRACT, DEFAULT_SKIN_ID} from "./appearance.js";
import {auditTypedReferences, renderGmReferenceMarkers} from "./manager-resolver-bridge.mjs";
import {createManagerDefinitionReader, READER_CONTRACT} from './native-definition-reader.mjs';
import {sourceMetadata as projectionSourceMetadata} from './source-projection.mjs';
import {MODULE_ID, MANAGED_TYPES, validatePackage, planRecord, exportedFields, getPath, canonical} from "./core.js";
import {checkContractGraph, isContractImport, selectionIssues, projectedReferences, finalReferenceResolution} from "./contract.js";
import {createCodexService, CODEX_QUERY, CODEX_ACCESS_SETTING} from "./codex-service.js";
import {renderPlayerCodexHtml} from "./codex.js";
import {systemOf, browseLibrary, inspectLibrary, describeLaunchers, orderLibraryRows, groupLibraryRows} from "./browser.js";
import {openAshenLauncher} from "./launchers.js";
import {mountManagerLauncher} from "./items-launcher.js";
import {collectPlayerAccess, changePlayerAccess, hideAllPlayerInterfaces, CODEX_SURFACE} from "./player-access.js";
import {followHubVisibility} from "./hub-visibility.js";
import {LAYOUT_SETTING, FOLDS, normalizeLayout, noteDrawerChanges, drawerContext} from "./import-layout.js";
import {moduleCards} from './module-cards.js';
import {itemTooltipAttrs, previewHtml} from './item-preview.js';
import {professionFacts} from './profession-records.js';
import {markerTargets,buildUuidIndex,resolveRichText,resolveTypedRefs,appendReferenceBlock} from "./import-fidelity.js";
import {moduleRecordLookup} from "./module-records.js";
import {createIconIndexer, filePickerClass, wantsSmartIcon, pickRecordIcon, chooseImportIcon, existingIconDecision, plannerIcon, iconFlagUpdate, ICON_DOCUMENT_TYPES} from './smart-icons.js';
import {scanIconDocuments, applyIconChanges, undoIconChanges, iconBackup, ICON_UNDO_SETTING} from './icon-improve.js';
import {ensureFolder, renameManagerFolders, FOLDER_RENAMES_SETTING} from "./folders.js";
import {readImportZip, readImportBundle, planBundleImport, bundleSummary, autoSelect, autoFileCounts, adaptRecordArtwork, uploadMatchingArt} from "./zip-import.js";
import {CAPTURE_TYPES, normalizeCaptureFlag, buildCapturePackage} from "./capture.js";
import {compilePackage, dependencyOrder, normalizeRef, docManagerSnapshot, localEdits, planLifecycle, buildSourceReplacementPatch} from "./workflows.js";
import {downloadJson, downloadText} from "./download.js";
import {isLocationRecord, locationsApi, planLocation, locationsNote, applyLocations, isRouteRecord, routesApi, planRoute, routesNote, applyRoutes, withLocationIds} from './location-handoff.js';
import {isShopRecord, shopsApi, shopIds, planShop, shopsNote, applyShops} from './shop-handoff.js';
import {cinderDefinitionChecks} from './cinder-definitions.js';
import {modifierDefinitionChecks} from './modifier-definitions.js';
import {SPECIALISTS, detectSpecialistFile, specialistCount, specialistApi, describeUnrecognized, planSpecialist, applySpecialist} from './specialist-handoff.js';
import {classifyDelivery} from './delivery.js';
import {buildWorldExport, saveWorldExport, saveBackup, SNAPSHOT_SETTING} from './world-export.js';
import {runPreSessionCheck} from './pre-session-check.js';
import {readGmSetupForm, saveGmSetup} from './gm-setup.js';
import {buildImportReport, buildBlockedReport, pushReport} from './import-result.js';
import {ITEM_FLAG, ACTOR_ITEMS_FLAG, itemKeys, matchActors, planActor, applyActorUpdate} from './actor-update.js';
import {mediaFilename} from './zip-import.js';
import {planItemEffects, effectSummary, applyItemEffects, effectCreateData, allowedItemFlags, flagWarnings, liveEffects} from './item-effects.js';
import {createSceneMoods, MOODS_SETTING, LAYERS_SETTING, MOOD_FIELDS, FIELD_GROUPS, NO_WEATHER, formatValue} from './scene-moods.js';
const MOOD_VIEWS=[{id:'live',label:'Live',icon:'fa-solid fa-sun'},{id:'library',label:'Moods & layers',icon:'fa-solid fa-layer-group'},{id:'share',label:'Export & import',icon:'fa-solid fa-right-left'}];
/** Sub-tab rows (kit 2.2, 0.46.0): one level under a top-level tab; remembered per user with uiState. */
const IMPORT_TABS=[{id:'package',label:'Load and preview'},{id:'history',label:'Import history'}];
const SETUP_TABS=[{id:'general',label:'General'},{id:'sources',label:'Core sources'},{id:'developer',label:'Developer Tools'}];
const CODEX_TABS=[{id:'reveals',label:'Reveals'},{id:'notes',label:'Notes & links'},{id:'preview',label:'Player preview'}];
const CODEX_VIEWS=CODEX_TABS.map(t=>t.id);
/** Kit badge tones for History results, check and pre-session rows (0.46.0). */
const RESULT_TONE=status=>/^(ok|created|updated|linked|pass|done)/i.test(String(status??''))?'ok':/(error|fail)/i.test(String(status??''))?'danger':/(warn|skip|partial)/i.test(String(status??''))?'warn':'';
const MOOD_TRANSITIONS=[{value:'',label:'Preset default'},{value:0,label:'Instant'},{value:3000,label:'3 s'},{value:10000,label:'10 s'},{value:30000,label:'30 s'}];
import {createCoreLinks, SOURCES_SETTING, LINK_HISTORY_SETTING} from './core-links.js';
import {createOrganizer, folderIndex, describePreview, readRulesFile, ORGANIZE_TYPES, SCHEMA_SETTING, HISTORY_SETTING, FLAG_PROTECTED} from './organize.js';
import {createBrowse, PAGE_SIZE, filterEntries} from './browse.js';
import {ITEM_VIEWS, IMPORT_VIEWS, SETUP_VIEWS, ORIGINS, RARITIES, DEFAULT_FILTERS, activeFilterCount, resolveTab} from './item-filters.js';
import {toolbarHtml, bodyHtml, facetsHtml, DEFAULT_STATE} from './browse-view.js';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const FOLDER_NAMES = {Item: "Ashen Gate — Imported Items", JournalEntry: "Ashen Gate — Imported Journals",
  Actor: "Ashen Gate — Imported Actors", RollTable: "Ashen Gate — Imported Roll Tables", Macro: "Ashen Gate — Imported Macros"};
// 0.47.0: "icon" is a re-import that only fills a placeholder icon (smart icons); nothing else on the document changes.
const actionAllowed = new Set(["create", "update", "metadata", "icon"]);
const captureOf = doc => normalizeCaptureFlag(doc.getFlag(MODULE_ID, "capture"));
function allCaptureRows() {
  return [...game.items.contents].sort((a,b)=>a.name.localeCompare(b.name)).map(doc => ({
    id:doc.id, name:doc.name, type:doc.type, uuid:doc.uuid,
    capture:captureOf(doc), source:sourceFlag(doc)
  }));
}
const toast = (message, error=false) => error ? ui.notifications.error(message) : ui.notifications.info(message);
const escapeHtml = value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function documentsOfType(type) {
  const collection={Item:game.items,JournalEntry:game.journal,Actor:game.actors,
    RollTable:game.tables,Macro:game.macros}[type];
  if(!collection) throw new Error(`Unsupported Foundry document type: ${type}`);
  return collection.contents;
}
function sourceFlag(doc) { return doc.getFlag(MODULE_ID, "source") ?? null; }
function docWrapper(doc) {
  return {
    doc,
    documentName: doc.documentName,
    type: doc.type,
    flag: sourceFlag(doc),
    coreLink: doc.getFlag(MODULE_ID, "coreLink") ?? null,
    // 0.47.0: an icon Manager picked (smart icons) reads as the last imported value, so it is never taken for a GM edit.
    get: path => path === "img" ? plannerIcon(doc.img, doc.flags?.[MODULE_ID], sourceFlag(doc)?.managedFields?.img) : getPath(doc, path)
  };
}
function allBoundDocuments() {
  return [...game.items.contents,...game.journal.contents,...(game.actors?.contents??[]),
    ...(game.tables?.contents??[]),...(game.macros?.contents??[])].filter(doc => sourceFlag(doc)?.sourceId);
}
function foundDocuments(id) { return allBoundDocuments().filter(doc => sourceFlag(doc)?.sourceId === id); }
function existingSourceIndex() {
  const map=new Map();
  for (const doc of allBoundDocuments()) {
    if (doc.getFlag(MODULE_ID,'lifecycle')?.archived) continue;
    const f=sourceFlag(doc);
    map.set(f.sourceId,{entity_type:f.entityType,scope:f.scope,document_type:doc.documentName});
    for (const id of f.ownedResourceIds??[]) map.set(id,{entity_type:'ResourceOpportunity',scope:f.scope});
  }
  return map;
}
function findSameNameUnmanaged(record) {
  if (!record.foundry?.data) return false;
  const {document_type: type, data} = record.foundry;
  return documentsOfType(type).some(d => d.name === data.name && !sourceFlag(d)?.sourceId);
}
function getRefs(record) { return record.refs.map(normalizeRef); }
const folderCache=new Map();
const iconProbeCache=new Map();
async function probeAsset(path) {
  if(!iconProbeCache.has(path)) iconProbeCache.set(path,(async()=>{
    const response=await fetch(path,{method:'HEAD',cache:'default'});
    return response.status;
  })());
  return iconProbeCache.get(path);
}
/** Smart icons (0.47.0): one icon index per session, built in the background from Foundry's file browser. */
let iconIndexerInstance=null;
function iconIndexer() {
  if(!iconIndexerInstance) {
    let storage=null;
    try{storage=globalThis.localStorage??null;}catch{storage=null;}
    iconIndexerInstance=createIconIndexer({storage,
      browse:(source,target)=>{const FP=filePickerClass();if(typeof FP?.browse!=='function')throw new Error('file browser unavailable');return FP.browse(source,target);},
      versionKey:`${game.release?.version??game.version??''}|${game.system?.id??''}@${game.system?.version??''}`,
      onChange:status=>activeApp?.noteIconIndex?.(status)});
  }
  return iconIndexerInstance;
}
async function destinationFolder(type,path,report=()=>{}) {
  if(path) return ensureFolder(type,path,{folders:game.folders,create:data=>Folder.create(data),cache:folderCache,report});
  const name=FOLDER_NAMES[type];
  const existing=game.folders.find(f=>f.type===type && f.name===name && !f.folder);
  if(existing) return existing;
  const folder=await Folder.create({name,type,sorting:'a'});
  report({action:'folder-created',name,type,path:name,status:'ok'});
  return folder;
}
function sourceMetadata(record,pkg,availableIds) {
  const refs=isContractImport(pkg) ? projectedReferences(record.refs,availableIds) : projectedReferences(getRefs(record),availableIds);
  const metadata=projectionSourceMetadata(record,pkg,refs);
  metadata.managedFields=exportedFields(record);
  metadata.pagesDefinition=record.foundry.document_type==='JournalEntry'?(record.foundry.data.pages??[]):[];
  return metadata;
}

async function createRecord(record, pkg, availableIds, report=()=>{}, {planned=null, smart=true}={}) {
  const kind = record.foundry.document_type;
  const cls = {Item,JournalEntry,Actor,RollTable,Macro}[kind];
  if (!cls) throw new Error(`Cannot create ${kind} document.`);
  const folder = await destinationFolder(kind,record.foundry.folder_path,report);
  // Only explicit allowlisted fields from validated records are copied to a Foundry Document.
  const data = foundry.utils.deepClone(record.foundry.data);
  data.folder = folder.id;
  let icon=null;
  if(ICON_DOCUMENT_TYPES.includes(kind)) {
    // 0.47.0: a missing or placeholder icon gets a smart pick (the preview's, or the GM's Change… choice); authored icons stay.
    icon=await chooseImportIcon(record,{index:smart?iconIndexer().index:null,smart,probe:probeAsset,planned});
    data.img=icon.img;
    if(icon.source!=='authored') report({id:record.id,action:icon.source==='smart'?'icon-smart':'icon-fallback',status:'ok',icon:icon.img,reason:icon.reason,original:icon.original??null});
  }
  data.ownership = {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE};
  // Keep authored Actor flags, but reserve Manager's own namespace for immutable source bindings.
  // Items keep only allow-listed flags (0.37.0); Manager's own namespace is always written from the record.
  data.flags = {...(kind==='Actor'?data.flags??{}:kind==='Item'?allowedItemFlags(data.flags):{}),[MODULE_ID]:{source:sourceMetadata(record, pkg, availableIds),
    ...(icon?{iconSource:icon.source,iconPath:icon.img}:{})}};
  if(kind==='Item') {
    if(Array.isArray(data.effects)&&data.effects.length) data.effects=record.foundry.data.effects.map(effectCreateData);
    else delete data.effects;
  }
  if(kind==='Actor') {
    // Mark the package's embedded Items so a later opt-in update can tell them from player-added ones.
    const keys=itemKeys(data.items??[]);
    data.items=(data.items??[]).map((item,i)=>({...item,flags:{...(item.flags??{}),[MODULE_ID]:{...(item.flags?.[MODULE_ID]??{}),[ITEM_FLAG]:keys[i]}}}));
    data.flags[MODULE_ID][ACTOR_ITEMS_FLAG]={version:1};
  }
  return cls.create(data);
}
async function updateRecord(record, pkg, doc, patch, availableIds) {
  const update = {...patch};
  update[`flags.${MODULE_ID}.source`] = sourceMetadata(record, pkg, availableIds);
  await doc.update(update);
  return doc;
}
/** Metadata-only reconciliation never touches Foundry rule fields or actor state. */
function planWithMetadata(record,matches,unmanaged,includeDrafts,pkg) {
  const planned=planRecord(record,matches,unmanaged,includeDrafts);
  if (!['unchanged','local'].includes(planned.action) || matches.length !== 1) return planned;
  const f=matches[0].flag;
  const available=new Set(existingSourceIndex().keys());
  available.add(record.id);
  const expected=sourceMetadata(record,pkg,available);
  const keys=['entityType','status','visibility','version','provenance','refs','scope','schemaVersion','ownedResourceIds','ownerSystemId','objectiveKind','definition','sourceVersion'];
  const changed=keys.filter(key=>canonical(f?.[key]??null)!==canonical(expected[key]??null));
  if (changed.length) return {action:'metadata',patch:{},reason:`Metadata refresh: ${changed.join(', ')}. Foundry rule fields remain untouched.`};
  return planned;
}

/** Preview/apply decision for one document record. Actors use the opt-in actor updater. */
function planDocument(record,pkg,{includeDrafts,updateActors,zipMedia}) {
  if(record.foundry?.document_type==='Actor') {
    const docs=matchActors(record,game.actors?.contents??[]);
    if(docs.some(d=>d.getFlag(MODULE_ID,'lifecycle')?.archived)) return {plan:{action:'blocked',reason:'Existing record is archived; restore it before reimport.'},docs};
    const isBundled=path=>Boolean(zipMedia?.size&&zipMedia.has(mediaFilename(path)));
    // 0.47.0: an icon Manager picked reads as the last imported one, never as a GM edit.
    const raws=docs.map(d=>{const raw=d.toObject();raw.img=plannerIcon(raw.img,raw.flags?.[MODULE_ID],raw.flags?.[MODULE_ID]?.source?.managedFields?.img);return raw;});
    return {plan:planActor(record,raws,{updateExisting:updateActors,includeDrafts,sameNameUnmanaged:findSameNameUnmanaged(record),isBundled}),docs};
  }
  const matches=foundDocuments(record.id).map(docWrapper);
  if(matches.some(m=>m.doc.getFlag(MODULE_ID,'lifecycle')?.archived)) return {plan:{action:'blocked',reason:'Existing record is archived; restore it before reimport.'},docs:matches.map(m=>m.doc)};
  const plan=planWithMetadata(record,matches,findSameNameUnmanaged(record),includeDrafts,pkg);
  return {plan:withItemEffects(record,plan,matches),docs:matches.map(m=>m.doc)};
}
/** Item effects (0.37.0): new ones are created, Manager-made ones updated field-wise, the rest kept. Effects alone can make an Item an update. */
function withItemEffects(record,plan,matches) {
  const defs=record.foundry?.document_type==='Item'?record.foundry.data?.effects:null;
  if(!Array.isArray(defs)||!defs.length) return plan;
  if(plan.action==='create') return {...plan,reason:`${plan.reason} Effects: ${defs.length} new.`,effects:{counts:{create:defs.length}}};
  if(matches.length!==1||!['update','unchanged','local','metadata'].includes(plan.action)) return plan;
  const effects=planItemEffects(defs,liveEffects(matches[0].doc));
  const note=effectSummary(effects);
  if(!effects.writes) return {...plan,reason:`${plan.reason} ${note}`,effects};
  return {...plan,action:plan.action==='metadata'||plan.action==='update'?plan.action:'update',patch:plan.patch??{},reason:`${plan.action==='unchanged'?'Item fields unchanged.':plan.reason} ${note}`,effects};
}

const TYPE_LABEL={Item:'Items',Actor:'Actors',JournalEntry:'Journals'};
const capitalize=s=>String(s??'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^\w/,c=>c.toUpperCase());
/** Kit badge tones for import preview actions and record status (0.43.0). */
const ACTION_TONE={create:'ok',update:'ok',metadata:'ok',icon:'ok',blocked:'danger',conflict:'danger'};
/** Preview thumbnails (0.47.0): the first ones only, and lazy, so a big file stays quick. */
const ICON_THUMBS=200;
const ICON_CONFIDENCE={high:'good match',medium:'likely match',low:'loose match'};
/** Items toolbar (0.43.0): one Load compendiums button and one Clear filters count for the shared filters and the All items facets. */
const packsLabel=status=>status.loading?'Loading compendiums…':status.compendiums?'Reload compendiums':'Load compendiums';
const browseFacetCount=st=>Object.values(st.filters??{}).filter(v=>v!==undefined&&v!==null&&v!==''&&v!=='all').length+(st.managedOnly?1:0)+(st.unlinkedOnly?1:0);
const statusTone=status=>['active','approved'].includes(status)?'ok':status==='draft'?'warn':'';

/** Help dialog (0.46.0: follows the new tabs). Longer explanations moved here from the tabs. */
const MANAGER_HELP=['<p><strong>Import</strong> (<em>Load and preview</em>): choose Manager JSON or a ZIP with <strong>Choose JSON or ZIP package…</strong>, pick an <strong>Import profile</strong> under Options (Development includes draft, proposed and example records), press <strong>Validate &amp; Preview</strong>, tick records, then <strong>Import</strong>. Load, ZIP files, Options and Preview fold open or shut (remembered on this device). Errors, review notes, links to other modules’ records and results are in the message bar at the bottom, with their counts; it opens by itself on new errors or a new result. A ZIP with several import files lists them: untick any you do not want, press Import selected files, then preview and Apply each in turn (Manager packages first). Or tick <strong>Import everything without stopping</strong> first: each file’s new records are imported without asking, updates to records already in the world only with <strong>Also apply updates to records that already exist</strong>, and it pauses only on a file with errors or a failed import. Scripts in a ZIP never run. <em>Import history</em> lists the imports applied so far.</p>',
  '<p><strong>Supported documents:</strong> Item, JournalEntry, Actor, RollTable and Macro, plus Locations, Routes and Shops (handed to Locations and Utilities). Existing Tables and Macros are never replaced. Existing Actors change only with <strong>Update existing actors</strong>: name, image, token settings and package items follow the file; HP, XP, level, conditions, player items, notes, ownership, folders and other modules’ data are kept. Item effects (each with a permanent eff_id) are listed under their Item; your own edits and hand-made effects are never touched.</p>',
  '<p><strong>Icons:</strong> with <strong>Choose icons for records without one</strong> (Options, on by default) a record with no icon or a placeholder one (Foundry\u2019s bag, mystery man or d20, dnd5e\u2019s default art, Manager\u2019s generic icons) gets a fitting icon from Foundry\u2019s icon library, picked from its name and kind. The Icon column shows each pick and why; <strong>Change…</strong> picks another. An icon set in the file, or by you in Foundry, is never replaced. The library is indexed once per browser (\u201cIndexing icons…\u201d); if it cannot be read, generic icons are used. <strong>Re-pick smart icons</strong> picks again for icons Manager chose before. For documents already in the world, use <em>Items \u2192 Checks \u2192 Improve icons</em>.</p>',
  '<p><strong>Items</strong> sub-tabs: <strong>Browse</strong> (one search over world documents, Ashen Gate records from every module and, after Load compendiums, compendium indexes), <strong>Records</strong> (Manager-imported records by permanent id), <strong>Folders</strong>, <strong>Core links</strong>, <strong>Checks</strong> (library check, housekeeping report and Improve icons) and <strong>Export</strong>. The search box and <strong>Filters (n)</strong> (source, type, origin, rarity, folder, has core_ref, and on Browse its own facets) apply on Browse, Records, Folders and Core links and stay as you switch between them. Search words, or prefixes such as id:MAT-HERB, id:DEITY-, type:deity, type:npc-codex, tag:, status:, tier:major. Pick an item’s name to see dnd5e’s item card; drag a world or compendium row onto a sheet, the canvas or a journal. Open on an NPC goes to the NPC Codex tab; Open on a deity opens Renown’s Pantheon.</p>',
  '<p><strong>Folders:</strong> <em>Clean compendiums</em> scans the world sidebar and every compendium against the folder rules and lists each document that is not in its folder; nothing moves until Apply, and Undo puts the last 5 runs back. <em>Organize a selection</em> does the same for what the filters pick, or one folder. Default rules: Ashen Gate records go to <strong>Ashen Gate</strong>; other Items go to <strong>Core 5.5e</strong> only with real evidence (a Plutonium import, a core source book, a copy from a dnd5e compendium or a D&amp;D Beyond import, the last two marked weak); anything else goes to <strong>Homebrew</strong>. dnd5e gives every new item rules "2024", so that alone counts as Homebrew. Player characters, player-owned actors, protected folders and documents marked Keep here never move; locked, module and system compendiums are inspect-only. Only the folder changes: nothing is renamed, edited or deleted.</p>',
  '<p><strong>NPC Codex:</strong> set who knows each NPC and each field (Hidden, Party, or chosen characters) on <em>Reveals</em>: these apply at once. <em>Notes &amp; links</em> holds what the party has learned, connections and your GM notes, saved with Save Changes. <em>Player preview</em> shows exactly what the party or one character receives. Whether players can open the codex at all is on the Modules tab.</p>',
  '<p><strong>Modules:</strong> open each Ashen Gate module and see whether its player window is <strong>Visible to players</strong> or <strong>Hidden</strong>. Reveal and Hide change that module’s own Player Access setting (General Manager’s card is its NPC Codex); <strong>Hide all</strong> asks first. Hiding never deletes progress. The Pre-session check is read-only.</p>',
  '<p><strong>Scenes:</strong> <em>Live</em> applies a base mood, layers on top and a fine-tune draft to the current scene; <em>Moods &amp; layers</em> edits the presets; <em>Export &amp; import</em> shares them as a file.</p>',
  '<p><strong>GM Setup:</strong> <em>General</em> sets the world default skin (players who have not picked their own see it live), <em>Core sources</em> tells Core links where to look, and <em>Developer Tools</em> holds the example package, sample files and the Adopt &amp; tag review workflow. Settings save only with <strong>Save Changes</strong>; Cancel drops them. <strong>My Appearance</strong> in the header is your own skin and size.</p>',
  '<p>Back up a test world before importing.</p>'].join('');
class AshenGateManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "ashen-gate-manager-window",
    classes: ["ag-app","ashen-gate-manager"],
    window: {title:"Ashen Gate | General Manager", icon:"fa-solid fa-boxes-stacked", resizable:true},
    position: {width:1020, height:820}
  };
  // One scroll region per pane (header and tabs stay put); the Items list column scrolls on its own. Both keep their place on re-render.
  static PARTS = {main: {template: `modules/${MODULE_ID}/templates/manager.hbs`, scrollable: [".agm-pane", ".aglib-rows", ".agm-drawer__body", ".agm-preview-table"]}};

  constructor(options={}) {
    // Kit 2: the default size grows with the Comfortable size set (read when the window is created).
    super({...options,position:{...windowSize(AshenGateManager.DEFAULT_OPTIONS.position),...options.position}});
    this.pkg = null;
    this.rawPkg = null;
    this.preview = [];
    this.errors = [];
    this.warnings = [];
    this.moduleLinks = [];
    this.includeDrafts = false;
    this.updateExisting = false;
    this.updateActors = false;
    this.specialist = null;
    this.selected = new Set();
    this.tab = "import";
    this.playerAccessMessage = "Only supported, active player-facing modules can be revealed or hidden. Manager never stores their access state.";
    this.playerAccessReport = null;
    // 0.46.0: per-user memory of sub-tabs, folds and the Items filter row (kit uiState, localStorage).
    this.ui = uiState(MODULE_ID);
    this.importView = this.ui.get('importView','package',IMPORT_VIEWS);
    this.setupTab = this.ui.get('setupTab','general',SETUP_VIEWS);
    this.codexTab = this.ui.get('codexTab','reveals',CODEX_VIEWS);
    this.itemFiltersOpen = this.ui.get('itemFiltersOpen',false,[true,false]);
    // 0.47.0 smart icons: the Options switch (remembered per user), Re-pick (per load) and the GM's Change… picks per record id.
    this.smartIcons = this.ui.get('smartIcons',true,[true,false]);
    this.repickIcons = false;
    this.iconOverrides = new Map();
    // Items → Checks → Improve icons.
    this.iconScan = null; this.iconScanWanted = false; this.iconAbort = null; this.iconPct = 0; this.iconMessage = '';
    // Drafts that survive re-renders (GM Setup, NPC Codex notes); the guards show "Unsaved changes" and ask before discarding.
    this.setupDraft = null;
    this.codexDraft = null;
    this.setupGuard = guardDirty({status:()=>this.element?.querySelector('[data-ag-setup-status]')});
    this.codexGuard = guardDirty({status:()=>this.element?.querySelector('[data-ag-codex-status]')});
    this.focusAfterRender = null;
    this.busy = false;
    this.importReports = [];
    this.auditEntries = [];
    this.message = "Choose a Manager-ready JSON projection or ZIP package; no world changes occur until Import.";
    this.zipMedia = new Map();
    this.zipBundle = null;
    this.uploadZipArtwork = true;
    this.packageSource = null;
    this.captureSelected = new Set();
    this.captureSearch = "";
    this.captureTaggedOnly = false;
    this.captureKind = "Item";
    this.captureMessage = "Tag world Items for review without changing their stats or claiming approval.";
    this.librarySelected = new Set();
    this.librarySystem = "all";
    this.libraryStatus = "all";
    this.libraryPackage = "all";
    this.libraryFocus = null;
    this.libraryPage = 0;
    this.libraryPageSize = 100;
    this.libraryShowArchived = true;
    this.librarySection = null; // pre-0.36.0 Library rail id; read once by resolveTab, then the Items sub-tab (itemsView) rules
    this.itemsView = "all";
    this.itemFilters = {...DEFAULT_FILTERS};
    this.browsePaint = null;
    this.codexFocus = null;
    this.codexSearch = "";
    this.codexFilter = "all";
    this.codexPreview = "";
    this.codexMessage = "Reveal an NPC to the party or to single characters, field by field. Players only ever receive what is revealed.";
    this.libraryMessage = "Browse Manager-imported Items, Journals, Actors, Roll Tables and Macros by permanent ID.";
    this.profile = "session-safe";
    this.moodSceneId = "";
    this.moodEdit = null;
    this.moodView = "live";
    this.moodTransition = "";
    this.moodDraft = null;
    this.moodSearch = "";
    this.moodFilter = "all";
    this.moodImport = null;
    this.moodExport = {moods:true, layers:true};
    this.browseState = {...DEFAULT_STATE, filters:{}};
    this.browseUnsub = null;
    this.moodMessage = "Pick a mood, then add layers on top. Each removes only its own changes; Back to normal puts the scene's original values back, fine-tune included.";
    this.orgScope = "all";
    this.orgTypes = new Set(ORGANIZE_TYPES);
    this.orgMode = "misfiled";
    this.orgPreview = null;
    this.orgResult = null;
    this.orgSchemaText = null;
    this.orgReport = null;
    this.orgMessage = "Preview shows exactly what would move. Organize only changes which folder a document is in.";
    this.housekeepingMessage = "";
    this.cleanPreview = null;
    this.cleanUnticked = new Set();
    this.cleanStatus = "";
    this.clPreview = null;
    this.clTicked = new Set();
    this.clLinkOnly = new Set();
    this.clMessage = "Scan finds 2024 core items for Ashen Gate world Items that carry core_ref. Nothing changes until Apply.";
    this.setupMessage = "";
    // 0.45.0: Import tab folds and message drawer, remembered on this device.
    this.layout = null;
    this.drawerSeen = "";
    this.applyProfile();
  }

  #layout() {
    if(!this.layout){let raw=null;try{raw=game.settings.get(MODULE_ID,LAYOUT_SETTING);}catch{raw=null;}this.layout=normalizeLayout(raw);}
    return this.layout;
  }
  #saveLayout() {
    try{void Promise.resolve(game.settings.set(MODULE_ID,LAYOUT_SETTING,this.layout)).catch(()=>{});}catch{/* this device just forgets the layout */}
  }
  applyProfile() {
    const profiles={development:{includeDrafts:true},"session-safe":{includeDrafts:false}};
    this.includeDrafts=profiles[this.profile]?.includeDrafts??true;
  }
  async #worldExport(name) {
    try {
      if(!game.user?.isGM)throw new Error('Only the GM can export Ashen Gate data.');
      if(name==='world-backup'){
        const out=saveBackup(game,{save:downloadJson});
        this.worldExportSummary=out.summary;toast(`Saved ${out.filename}. The "changed since last export" baseline is unchanged.`);
      } else if(name==='world-export-copy'){
        const snap=game.settings.get(MODULE_ID,SNAPSHOT_SETTING);
        const out=buildWorldExport(game,{mode:'changed',snapshot:snap?.records?snap:null});
        this.worldExportSummary=out.summary;
        try{await (game.clipboard?.copyPlainText?.(out.summary)??navigator.clipboard.writeText(out.summary));toast('Summary copied.');}
        catch{toast('Could not copy automatically: select the summary text below and copy it.',true);}
      } else {
        const out=await saveWorldExport(game,{mode:name==='world-export-changed'?'changed':'everything',save:downloadJson});
        this.worldExportSummary=out.summary;toast(`Saved ${out.filename}.`);
      }
    } catch(error){this.worldExportSummary=`Export failed: ${error.message??error}`;toast(String(error.message??error),true);}
    await this.render();
  }
  /** Read-only: runPreSessionCheck never writes; Copy and Download reuse the last result. */
  async #preSession(name) {
    try {
      if(!game.user?.isGM)throw new Error('Only the GM can run the pre-session check.');
      if(name==='presession-run' || !this.preSessionResult) this.preSessionResult=await runPreSessionCheck(game);
      const out=this.preSessionResult;
      if(name==='presession-copy'){
        try{await (game.clipboard?.copyPlainText?.(out.text)??navigator.clipboard.writeText(out.text));toast('Report copied.');}
        catch{toast('Could not copy automatically: select the report text below and copy it.',true);}
      } else if(name==='presession-download'){downloadText(out.filename,out.text);toast(`Saved ${out.filename}.`);}
    } catch(error){this.preSessionResult={rows:[],summary:`Check failed: ${error.message??error}`,text:''};toast(String(error.message??error),true);}
    await this.render();
  }
  #moodContext() {
    const api=sceneMoods();
    const list=api.listMoods(), state=api.getState(this.moodSceneId||undefined);
    const weatherIds=list.weatherIds??[];
    const favourites=new Set(state.favourites??[]);
    const onLayers=new Set((state.layers??[]).map(l=>l.id));
    const summary=p=>[...Object.entries(p.set).map(([path,v])=>`${MOOD_FIELDS.find(f=>f.path===path)?.label??path}: ${formatValue(path,v)}`),
      ...(p.transitionMs?[`${p.transitionMs/1000} s`]:[])].join(' · ');
    const decorate=p=>({...p,isMood:p.kind==='mood',summary:summary(p),favourite:favourites.has(p.id),
      unavailable:p.set.weather&&!weatherIds.includes(p.set.weather)?p.set.weather:null});
    const moods=(list.presets??[]).map(decorate), layers=(list.layers??[]).map(decorate);
    const weatherOptions=(value,used=true)=>[{id:NO_WEATHER,label:'No weather',selected:used&&!value},...weatherIds.map(id=>({id,label:id,selected:used&&value===id})),
      ...(used&&value&&!weatherIds.includes(value)?[{id:value,label:`${value} (not available here)`,selected:true}]:[])];
    const fieldView=(f,value,extra={})=>({...f,value,isNumber:f.kind==='number',isBoolean:f.kind==='boolean',isWeather:f.kind==='weather',isColor:f.kind==='color',
      checked:value===true,isNone:f.kind==='color'&&!value,colorValue:f.kind==='color'&&value?value:'#ffffff',
      display:typeof value==='number'?value.toFixed(2):'',weatherOptions:f.kind==='weather'?weatherOptions(value,extra.used??true):[],...extra});
    const transitions=selected=>MOOD_TRANSITIONS.map(t=>({...t,selected:String(t.value)===String(selected)}));
    const ctx={tabsHtml:subTabs({group:'agm-scenes',label:'Scenes sections',tabs:MOOD_VIEWS,selected:this.moodView}),panelAttrs:tabPanelAttrs('agm-scenes',this.moodView),live:this.moodView==='live',library:this.moodView==='library',share:this.moodView==='share',
      sceneName:state.scene?.name??'No scene viewed or active',hasScene:Boolean(state.scene),hasBase:state.hasBase,darknessLock:state.scene?.darknessLock,
      regions:state.scene?.regions??{weather:0,darkness:0},scenes:(game.scenes?.contents??[]).map(s=>({id:s.id,name:s.name,selected:s.id===this.moodSceneId})),
      currentSelected:!this.moodSceneId,message:this.moodMessage,hasWeather:weatherIds.length>0,transitions:transitions(this.moodTransition),
      moodCount:moods.length,layerTotal:layers.length,exportMoods:this.moodExport.moods,exportLayers:this.moodExport.layers};
    if(ctx.live){
      ctx.liveMoods=[...moods.filter(m=>m.favourite),...moods.filter(m=>!m.favourite)].map(m=>({...m,active:state.mood?.id===m.id}));
      ctx.liveLayers=layers.map(l=>({...l,on:onLayers.has(l.id)}));
      ctx.stack=[...(state.layers??[]).slice().reverse(),...(state.mood?[state.mood]:[])].map(e=>({...e,isMood:e.kind==='mood'}));
      const n=state.layers?.length??0;ctx.layerCount=`${n} layer${n===1?'':'s'}`;
      // Draft: follows the scene for every field the GM has not touched since loading it.
      const values=state.values??{};
      let draft=this.moodDraft;
      if(!draft||draft.sceneId!==state.scene?.id) draft={sceneId:state.scene?.id??null,values:{},touched:[]};
      for(const [path,value] of Object.entries(values)) if(!draft.touched.includes(path)) draft.values[path]=value;
      this.moodDraft=draft;
      ctx.draftGroups=FIELD_GROUPS.map(g=>({...g,fields:MOOD_FIELDS.filter(f=>f.group===g.id&&Object.hasOwn(values,f.path))
        .map(f=>fieldView(f,draft.values[f.path],{touched:draft.touched.includes(f.path)}))})).filter(g=>g.fields.length);
      ctx.missingFields=state.scene?MOOD_FIELDS.filter(f=>!Object.hasOwn(values,f.path)).map(f=>f.label).join(', '):'';
    }
    if(ctx.library){
      const q=this.moodSearch.trim().toLowerCase();
      const match=p=>!q||p.label.toLowerCase().includes(q)||p.id.includes(q)||p.summary.toLowerCase().includes(q);
      ctx.search=this.moodSearch;
      ctx.filters=[['all','All'],['mood','Moods'],['layer','Layers']].map(([value,label])=>({value,label,selected:this.moodFilter===value}));
      ctx.libraryGroups=[{kind:'mood',label:'Moods · the base look, one at a time',items:moods},{kind:'layer',label:'Layers · stack on top',items:layers}]
        .filter(g=>this.moodFilter==='all'||this.moodFilter===g.kind).map(g=>({...g,items:g.items.filter(match)}));
      const edit=this.moodEdit;
      if(edit) ctx.edit={...edit,noun:edit.kind==='layer'?'layer':'mood',transitions:transitions(edit.transitionMs??0).filter(t=>t.value!==''),
        groups:FIELD_GROUPS.map(g=>({...g,fields:MOOD_FIELDS.filter(f=>f.group===g.id).map(f=>{
          const used=Object.hasOwn(edit.set,f.path), value=used?edit.set[f.path]:(f.kind==='boolean'?false:f.kind==='weather'?NO_WEATHER:f.kind==='color'?null:0);
          return fieldView(f,value,{used});
        })}))};
    }
    if(ctx.share&&this.moodImport) ctx.import={filename:this.moodImport.filename,items:this.moodImport.items.map(i=>{
      const choice=this.moodImport.choices[`${i.kind}:${i.id}`]??'keep';
      return {...i,isNew:i.status==='new',isSame:i.status==='same',isConflict:i.status==='conflict',isInvalid:i.status==='invalid',
        problems:(i.problems??[]).join(' '),keep:choice==='keep',replace:choice==='replace',both:choice==='both'};
    })};
    return ctx;
  }
  /** Live transition picker: '' = each preset's own transition (Apply), 0 for restore/remove/fine-tune. */
  #moodAnimate(forPreset=false) {
    if(this.moodTransition==='')return forPreset?undefined:0;
    return Number(this.moodTransition)||0;
  }
  async #moodResult(promise,okMessage) {
    const out=await promise;
    this.moodMessage=out.ok?(okMessage??out.message):out.message;
    if(out.ok)toast(this.moodMessage);else{toast(out.message,true);console.warn(`[${MODULE_ID}] Scene mood: ${out.message}`);}
    await this.render();
    return out;
  }
  async #applyMood(id) {
    await this.#moodResult(sceneMoods().applyMood(id,{sceneId:this.moodSceneId||undefined,animate:this.#moodAnimate(true)}));
  }
  async #addLayer(id) {
    await this.#moodResult(sceneMoods().addLayer(id,{sceneId:this.moodSceneId||undefined,animate:this.#moodAnimate(true)}));
  }
  async #removeEffect(ref) {
    const [kind,id]=ref.split(':');
    await this.#moodResult(sceneMoods().removeEffect(id,{kind,sceneId:this.moodSceneId||undefined,animate:this.#moodAnimate()}));
  }
  #findPreset(kind,id) {
    const list=sceneMoods().listMoods();
    return (kind==='layer'?list.layers:list.presets)?.find(p=>p.id===id)??null;
  }
  async #editMood(ref,{duplicate=false}={}) {
    const [kind,id]=ref.split(':');
    const preset=this.#findPreset(kind,id);
    if(!preset)return toast(`${kind==='layer'?'Layer':'Mood'} ${id} not found.`,true);
    this.moodEdit=duplicate?{isNew:true,kind,id:`${preset.id.slice(0,35)}-copy`,label:`${preset.label} (copy)`,set:{...preset.set},transitionMs:preset.transitionMs??0}
      :{isNew:false,kind,id:preset.id,label:preset.label,set:{...preset.set},transitionMs:preset.transitionMs??0};
    await this.render();
  }
  async #saveMood() {
    const root=this.element, edit=this.moodEdit;
    if(!edit)return;
    const id=edit.isNew?String(root.querySelector('[data-ag-mood-id]')?.value??'').trim().toLowerCase():edit.id;
    const label=String(root.querySelector('[data-ag-mood-label]')?.value??'').trim();
    const transitionMs=Number(root.querySelector('[data-ag-mood-edit-transition]')?.value??0)||0;
    const set={};
    for(const f of MOOD_FIELDS){
      if(!root.querySelector(`[data-ag-mood-use="${f.path}"]`)?.checked)continue;
      const input=root.querySelector(`[data-ag-mood-value="${f.path}"]`);
      set[f.path]=f.kind==='number'?Number(input?.value):f.kind==='boolean'?Boolean(input?.checked)
        :f.kind==='color'?(root.querySelector(`[data-ag-mood-none="${f.path}"]`)?.checked?null:String(input?.value??'').toLowerCase()):String(input?.value??'');
    }
    if(edit.isNew&&this.#findPreset(edit.kind,id))return toast(`A ${edit.kind} with id ${id} already exists.`,true);
    this.moodEdit={...edit,id,label,set,transitionMs};
    const out=await this.#moodResult(sceneMoods().savePreset({id,label,kind:edit.kind,set,...(transitionMs?{transitionMs}:{})}),`${edit.kind==='layer'?'Layer':'Mood'} "${label}" saved.`);
    if(out.ok){this.moodEdit=null;await this.render();}
  }
  async #removeMood() {
    const edit=this.moodEdit;
    const preset=edit&&this.#findPreset(edit.kind,edit.id);
    if(!preset)return;
    const noun=edit.kind==='layer'?'layer':'mood';
    const yes=await confirmDanger(`Remove the ${noun} "${preset.label}"? Scenes already using it keep their look; removing it from a scene or Back to normal still restores them.`,
      {title:`Remove this scene ${noun}?`,yes:`Remove ${noun}`});
    if(!yes)return;
    this.moodEdit=null;
    await this.#moodResult(sceneMoods().removePreset(preset.id,{kind:edit.kind}),`${noun==='layer'?'Layer':'Mood'} "${preset.label}" removed.`);
  }
  /** Reads one fine-tune control into the draft (no render, so dragging stays smooth). */
  #readDraftControl(path) {
    const root=this.element, f=MOOD_FIELDS.find(x=>x.path===path), draft=this.moodDraft;
    if(!f||!draft)return;
    const input=root.querySelector(`[data-ag-draft="${path}"]`);
    const value=f.kind==='number'?Number(input?.value):f.kind==='boolean'?Boolean(input?.checked)
      :f.kind==='color'?(root.querySelector(`[data-ag-draft-none="${path}"]`)?.checked?null:String(input?.value??'').toLowerCase()):String(input?.value??'');
    draft.values[path]=value;
    if(!draft.touched.includes(path))draft.touched.push(path);
    input?.closest('.agscenes-field')?.classList.add('is-touched');
    const out=root.querySelector(`[data-ag-draft-out="${path}"]`);
    if(out&&typeof value==='number')out.textContent=value.toFixed(2);
  }
  #draftSet() {
    const draft=this.moodDraft;
    return Object.fromEntries((draft?.touched??[]).map(path=>[path,draft.values[path]]));
  }
  async #draftAction(name) {
    if(name==='draft-cancel'){this.moodDraft=null;this.moodMessage='Fine-tune reset to what the scene shows now.';await this.render();return;}
    const set=this.#draftSet();
    if(!Object.keys(set).length)return toast('Move a fine-tune control first.',true);
    if(name==='draft-apply'){
      const out=await this.#moodResult(sceneMoods().applyDraft(set,{sceneId:this.moodSceneId||undefined,animate:this.#moodAnimate()}));
      if(out.ok){this.moodDraft=null;await this.render();}
      return;
    }
    const kind=name==='draft-save-layer'?'layer':'mood';
    this.moodEdit={isNew:true,kind,id:'',label:'',set,transitionMs:0};
    this.moodView='library';
    await this.render();
  }
  async #moodImportFile(file) {
    try{
      const data=JSON.parse(await file.text());
      const out=sceneMoods().previewImport(data);
      if(!out.ok){this.moodImport=null;this.moodMessage=`${file.name} was not used: ${out.message}`;toast(this.moodMessage,true);}
      else{this.moodImport={filename:file.name,data,items:out.items,choices:{}};this.moodMessage=`Check the preview of ${file.name}, then Import.`;}
    }catch(error){this.moodImport=null;this.moodMessage=`${file.name} is not readable JSON: ${error.message??error}`;toast(this.moodMessage,true);}
    await this.render();
  }
  async #moodShareAction(name) {
    const api=sceneMoods();
    if(name==='mood-export'){
      const out=api.exportPresets(this.moodExport);
      if(!out.ok)return toast(out.message,true);
      downloadJson(out.filename,out.data);
      this.moodMessage=`Saved ${out.filename} with ${out.data.presets.length} preset(s).`;toast(this.moodMessage);await this.render();return;
    }
    if(name==='mood-import-cancel'){this.moodImport=null;this.moodMessage='Import cancelled. Nothing changed.';await this.render();return;}
    if(name==='mood-import-apply'&&this.moodImport){
      const out=await this.#moodResult(api.importPresets(this.moodImport.data,{choices:this.moodImport.choices}));
      if(out.ok){this.moodImport=null;await this.render();}
    }
  }
  managedRows() {
    const docs=allBoundDocuments().sort((a,b)=>a.name.localeCompare(b.name));
    return docs.map(doc=>{
      const edits=localEdits(doc);
      const source=sourceFlag(doc);
      return ({
      doc,id:doc.id,sourceId:sourceFlag(doc).sourceId,name:doc.name,uuid:doc.uuid,kind:doc.documentName,
      archived:Boolean(doc.getFlag(MODULE_ID,'lifecycle')?.archived),
      edited:edits.length, editedFields:edits.map(edit=>edit.path), version:source.version,
      entityType:sourceFlag(doc).entityType, status:sourceFlag(doc).status??'unknown',
      visibility:sourceFlag(doc).visibility, scope:sourceFlag(doc).scope,
      ownerSystemId:sourceFlag(doc).ownerSystemId, objectiveKind:sourceFlag(doc).objectiveKind,
      refs:sourceFlag(doc).refs??[], ownedResourceIds:sourceFlag(doc).ownedResourceIds??[],
      provenance:sourceFlag(doc).provenance??{}, packageId:sourceFlag(doc).packageId??'unknown',
      selected:this.librarySelected.has(doc.uuid), templateId:sourceFlag(doc).templateId??'—',
      ...((r)=>({systemKey:r.key,systemLabel:r.label}))(systemOf({sourceId:source.sourceId,ownerSystemId:source.ownerSystemId,entityType:source.entityType,packageId:source.packageId}))
    });});
  }
  async _prepareContext(options) {
    if(!game.user?.isGM)throw new Error('Only GMs can open the General Manager.');
    const ctx = await super._prepareContext(options);
    const summary = {create:0, update:0, metadata:0, icon:0, unchanged:0, blocked:0, conflict:0, skipped:0, local:0};
    this.preview.forEach(row => {summary[row.action] = (summary[row.action] ?? 0) + 1;});
    const history = game.settings.get(MODULE_ID,"importHistory") ?? [];
    const allItems = allCaptureRows();
    // Old tab and view ids (browse, library, organize, corelinks, history, appearance; Items → codex/adopt) land on
    // their 0.46.0 home: an Items sub-tab, the NPC Codex tab, Import → Import history or a GM Setup sub-tab.
    const resolved=resolveTab(this.tab,{view:this.itemsView,librarySection:this.librarySection});
    this.tab=resolved.tab;
    if(resolved.tab==='items'||ITEM_VIEWS.every(v=>v.id!==this.itemsView))this.itemsView=resolved.view;
    if(resolved.importView)this.importView=resolved.importView;
    if(resolved.setupTab)this.setupTab=resolved.setupTab;
    this.librarySection=null;
    const items=this.tab==='items', view=this.itemsView;
    const {all:library,rows:libraryInScope,browser}=this.#libraryBrowser();
    const pageCount=Math.max(1,Math.ceil(browser.rows.length/this.libraryPageSize));
    this.libraryPage=Math.max(0,Math.min(this.libraryPage,pageCount-1));
    const libraryRows=browser.rows.slice(this.libraryPage*this.libraryPageSize,(this.libraryPage+1)*this.libraryPageSize);
    const libraryDetail=inspectLibrary(library,this.libraryFocus);
    const libraryGroups=groupLibraryRows(libraryRows.map(row=>({...row,statusTone:statusTone(row.status),focused:row.uuid===this.libraryFocus,tooltip:row.kind==='Item'?itemTooltipAttrs(row.uuid):''})),browser.rows);
    const libraryFilterCount=[this.libraryStatus!=='all',this.libraryPackage!=='all',!this.libraryShowArchived].filter(Boolean).length;
    const menus=game.settings?.menus ? [...game.settings.menus.entries()] : [];
    const playerAccessRows=game.user?.isGM ? await collectPlayerAccess(game.modules?.values?.()??[]) : [];
    const launcherRows=describeLaunchers(game.modules?.values?.()??[],menus).map(row=>({...row,playerAccessState:playerAccessRows.find(entry=>entry.id===row.id)?.state??'Unsupported'}));
    const accessVisibleCount=playerAccessRows.filter(row=>row.canToggle&&row.playerAccessEnabled).length;
    const layout=this.#layout();
    this.drawerSeen=noteDrawerChanges(layout,{errors:this.errors.length,resultsKey:this.importReports.length?`${this.importReports.length}:${this.importReports[0]?.at??''}:${this.importReports[0]?.file??''}`:''},this.drawerSeen);
    const drawer=drawerContext(layout,{errors:this.errors.length,warnings:this.warnings.length,links:this.moduleLinks?.length??0,results:this.importReports.length});
    // 0.46.0: one draft control, the profile (it sets includeDrafts); the summary says what it does.
    const optionsSummary=[this.profile==='development'?'Development: drafts included':'Session-safe: approved only',
      ...(this.updateExisting?['update existing']:[]),...(this.updateActors?['update actors']:[]),
      this.smartIcons?(this.repickIcons?'smart icons, re-pick':'smart icons'):'smart icons off'].join(' · ');
    const tabRow=(group,label,tabs,selected)=>subTabs({group,label,tabs,selected});
    const goto=(label,tab)=>linkButton(label,{data:{agGotoTab:tab}});
    const setupSkins=this.tab==='setup'?(()=>{const st=appearanceController?.getState?.()??{};const pick=this.setupDraft?.worldSkin??st.worldDefault;
      return (appearanceController?.listSkins?.()??[]).map(skin=>({...skin,current:skin.id===st.worldDefault,selected:skin.id===pick}));})():[];
    const captureRows = allItems.filter(row => (!this.captureTaggedOnly || row.capture) && (!this.captureSearch || row.name.toLowerCase().includes(this.captureSearch.toLowerCase()) || row.type.toLowerCase().includes(this.captureSearch.toLowerCase())));
    return {
      ...ctx,
      version: game.modules.get(MODULE_ID)?.version ?? '',
      tab: this.tab,
      importActive: this.tab === "import",
      importTabsHtml: this.tab==='import'?tabRow('agm-import','Import sections',IMPORT_TABS,this.importView):'',
      importPanelAttrs: tabPanelAttrs('agm-import',this.importView),
      importPackage: this.importView==='package', importHistory: this.importView==='history',
      itemsTabsHtml: items?tabRow('agm-items','Items sections',ITEM_VIEWS,view):'',
      itemsPanelAttrs: tabPanelAttrs('agm-items',view),
      itemsFilters: items&&Boolean(ITEM_VIEWS.find(v=>v.id===view)?.filters), itemFiltersOpen:this.itemFiltersOpen,
      setupTabsHtml: this.tab==='setup'?tabRow('agm-setup','GM Setup sections',SETUP_TABS,this.setupTab):'',
      setupPanels: Object.fromEntries(SETUP_VIEWS.map(id=>[id,tabPanelAttrs('agm-setup',id,{hidden:id!==this.setupTab})])),
      fileButtons: {
        import: fileButton({label:'Choose JSON or ZIP package…',accept:'.json,.zip,application/json,application/zip',icon:'fa-solid fa-folder-open',disabled:this.busy,data:{agFileKind:'import'}}),
        rules: fileButton({label:'Import…',accept:'.json,application/json',icon:'fa-solid fa-upload',className:'ag-btn ag-btn--sm',data:{agFileKind:'rules'}}),
        codex: fileButton({label:'Restore reveals from a codex export…',accept:'.json,application/json',className:'agm-menu-item',data:{agFileKind:'codex'}}),
        moods: fileButton({label:'Choose moods file…',accept:'.json,application/json',data:{agFileKind:'moods'}})
      },
      gotoModules: goto('Modules','modules'), gotoSources: goto('GM Setup → Core sources','setup:sources'),
      gotoMyAppearance: linkButton('My Appearance',{data:{agAction:'appearance-my-appearance'}}),
      folds: layout.folds, drawer, optionsSummary,
      selectedCount: this.preview.filter(row => actionAllowed.has(row.action) && this.selected.has(row.id)).length,
      importReports: this.importReports, hasImportReports: this.importReports.length>0,
      zipBundle: this.zipBundle ? {source:this.zipBundle.source, running:Boolean(this.zipBundle.queue), summary:bundleSummary(this.zipBundle), ...this.#zipAutoContext(),
        rows:this.zipBundle.files.map(f=>({filename:f.filename, label:f.label, count:f.count, notice:f.notice,
          status:this.zipBundle.outcome.get(f.filename) ?? (f.status==='error'?'Error':f.status==='warning'?'Ready, with notes':'Ready'),
          isError:f.status==='error', isCurrent:this.zipBundle.current===f.filename,
          picked:this.zipBundle.picked.has(f.filename), canPick:Boolean(f.kind)&&f.status!=='error'&&!this.zipBundle.queue})),
        skipped:this.zipBundle.skipped, pickedCount:this.zipBundle.files.filter(f=>f.kind&&f.status!=='error'&&this.zipBundle.picked.has(f.filename)).length} : null,
      itemsActive: items,
      itemsAll: items&&view==='all',
      itemFilters: items ? this.#filterBarContext() : null,
      modulesActive: this.tab === "modules",
      playerAccessRows, playerAccessMessage:this.playerAccessMessage, playerAccessReport:this.playerAccessReport,
      playerAccessVisibleCount:accessVisibleCount,
      playerAccessHasVisible:accessVisibleCount>0&&!this.busy,
      launcherRows, launcherCount:launcherRows.length, moduleCards:moduleCards(launcherRows,playerAccessRows),
      libraryRows, libraryTotal:library.length, librarySelectedCount:this.librarySelected.size,
      libraryInScope:libraryInScope.length, libraryNarrowed:libraryInScope.length!==library.length,
      libraryFilteredCount:browser.rows.length, libraryActiveCount:browser.summary.active,
      libraryEditedCount:browser.summary.edited, librarySystemCount:browser.summary.systems,
      libraryShowArchived:this.libraryShowArchived,
      librarySystemOptions:[{value:'all',label:'All systems',selected:this.librarySystem==='all'},...browser.systemOptions],
      libraryStatusOptions:[{value:'all',label:'All statuses',selected:this.libraryStatus==='all'},...browser.statusOptions.map(r=>({...r,label:r.value}))],
      libraryPackageOptions:[{value:'all',label:'All packages',selected:this.libraryPackage==='all'},...browser.packageOptions.map(r=>({...r,label:r.value}))],
      libraryPageLabel:`${browser.rows.length ? this.libraryPage*this.libraryPageSize+1 : 0}–${Math.min((this.libraryPage+1)*this.libraryPageSize,browser.rows.length)} of ${browser.rows.length}`,
      libraryHasPrevious:this.libraryPage>0,libraryHasNext:this.libraryPage+1<pageCount,
      libraryDetail:libraryDetail?{...libraryDetail,statusTone:statusTone(libraryDetail.status),isItem:libraryDetail.kind==='Item'}:null,libraryHasDetail:Boolean(libraryDetail),
      libraryGroups, libraryFilterCount, libraryHasFilters:libraryFilterCount>0,
      libraryRecordsActive:items&&view==='records',libraryCheckActive:items&&view==='checks',
      libraryExportActive:items&&view==='export',
      codexActive:this.tab==='codex',
      codex:this.tab==='codex'?this.#codexContext():null,
      housekeeping:items&&view==='checks'?{report:this.orgReport,message:this.housekeepingMessage}:null,
      librarySystemChips:[{value:'all',label:'All',count:libraryInScope.filter(r=>this.libraryShowArchived||!r.archived).length,selected:this.librarySystem==='all'},...browser.systemOptions],
      libraryMessage:this.libraryMessage, worldExportSummary:this.worldExportSummary??'',
      preSession:this.preSessionResult?{summary:this.preSessionResult.summary,rows:this.preSessionResult.rows.map(r=>({...r,css:r.status==='N-A'?'na':r.status.toLowerCase(),tone:RESULT_TONE(r.status)})),hasText:Boolean(this.preSessionResult.text)}:null,
      profile:this.profile,developmentProfile:this.profile==='development',sessionProfile:this.profile==='session-safe',
      hasLibrarySelected:this.librarySelected.size>0,
      captureRows: captureRows.map(row => ({...row, tooltip:itemTooltipAttrs(row.uuid), tagged:Boolean(row.capture), selected:this.captureSelected.has(row.id), kindLabel:row.capture?.entityType??"—"})),
      taggedCount:allItems.filter(row=>row.capture).length,
      worldItemCount:allItems.length,
      captureVisibleCount:captureRows.length,
      hasCaptureSelected: allItems.some(row=>this.captureSelected.has(row.id)),
      canCaptureExport:allItems.some(row=>row.capture),
      captureSearch:this.captureSearch,
      captureTaggedOnly:this.captureTaggedOnly,
      captureKindOptions:CAPTURE_TYPES.map(value=>({value, selected:this.captureKind===value})),
      captureMessage:this.captureMessage,
      historyActive: this.tab === "history",
      scenesActive: this.tab === "scenes",
      moods: this.tab === "scenes" ? this.#moodContext() : null,
      organizeActive: items&&view==='folders',
      org: items&&view==='folders' ? this.#organizeContext() : null,
      coreLinksActive: items&&view==='corelinks',
      cl: items&&view==='corelinks' ? this.#coreLinkContext() : null,
      setupActive: this.tab === "setup",
      setup: this.tab === "setup" ? this.#setupSources() : null,
      setupMessage: this.setupMessage,
      setupSkins,
      codexPlayerAccess: Boolean(game.settings.get(MODULE_ID,CODEX_ACCESS_SETTING)),
      hasPackage: Boolean(this.pkg || this.specialist),
      isSpecialist: Boolean(this.specialist),
      specialistLabel: this.specialist ? SPECIALISTS[this.specialist.kind].label : '',
      specialistNoun: this.specialist ? SPECIALISTS[this.specialist.kind].kind.toLowerCase() + 's' : '',
      specialistCanUpdate: Boolean(this.specialist && SPECIALISTS[this.specialist.kind].canUpdate),
      packageId: this.specialist ? `${SPECIALISTS[this.specialist.kind].label} file` : (this.pkg?.manifest?.package_id ?? "—"),
      packageVersion: this.specialist ? (this.specialist.payload?.version ?? "—") : (this.pkg?.manifest?.version ?? "—"),
      recordCount: this.specialist ? this.specialist.count : (this.pkg?.records?.length ?? 0),
      typeSummary: this.specialist ? [{name:SPECIALISTS[this.specialist.kind].kind,count:this.specialist.count}] : Object.entries(this.pkg?.records?.reduce((a,r)=>(a[r.foundry?.document_type??(isLocationRecord(r)||isRouteRecord(r)?r.entity_type:'Unsupported')]=(a[r.foundry?.document_type??(isLocationRecord(r)||isRouteRecord(r)?r.entity_type:'Unsupported')]??0)+1,a),{})??{}).map(([name,count])=>({name,count})),
      zipPortraitCount:this.zipMedia.size, hasZipPortraits:this.zipMedia.size>0,
      uploadZipArtwork:this.uploadZipArtwork, packageSource:this.packageSource??'—',
      includeDrafts: this.includeDrafts,
      hasLocationRecords: Boolean(this.pkg?.records?.some(r=>isLocationRecord(r)||isRouteRecord(r)||isShopRecord(r))),
      updateExisting: this.updateExisting,
      hasActorRecords: Boolean(this.pkg?.records?.some(r=>r.foundry?.document_type==='Actor')),
      updateActors: this.updateActors,
      actorUpdateCount: this.preview.filter(r=>r.kind==='Actor'&&r.action==='update').length,
      message: this.message,
      errors: this.errors.map(message => ({message})),
      warnings: this.warnings.map(message => ({message})),
      hasWarnings: this.warnings.length > 0,
      moduleLinks: (this.moduleLinks ?? []).map(message => ({message})),
      hasModuleLinks: (this.moduleLinks?.length ?? 0) > 0,
      schemaVersion: this.specialist ? (this.specialist.payload?.schema_version ?? this.specialist.payload?.schema ?? "list") : (this.pkg?.manifest?.schema_version ?? "—"),
      hasErrors: this.errors.length > 0,
      hasPreview: this.preview.length > 0 && !this.errors.length,
      canApply: !this.busy && !this.zipBundle?.autoRunning && this.errors.length === 0 && this.preview.some(row => actionAllowed.has(row.action) && this.selected.has(row.id)),
      busy: this.busy || Boolean(this.zipBundle?.autoRunning),
      summary,
      rows: this.#previewRows(),
      smartIcons: this.smartIcons, repickIcons: this.repickIcons, iconStatus: this.#iconStatusText(),
      hasIconRows: this.preview.some(row=>row.icon),
      icons: items&&view==='checks'?this.#iconScanContext():null,
      audit: this.auditEntries.map(entry=>({...entry,tone:entry.level==='error'?'danger':entry.level==='warning'?'warn':''})),
      hasAudit: this.auditEntries.length > 0,
      history: [...history].reverse().map(run=>{const results=(run.results??[]).map(r=>({...r,tone:RESULT_TONE(r.status)}));
        return {...run,results,failed:results.filter(r=>r.tone==='danger').length};}),
      hasHistory: history.length > 0
    };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    this.#bindNavigation(root);
    this.#bindSetup(root);
    bindFolds(root,this.ui);
    bindFileButtons(root,(files,wrap)=>this.#pickFile(wrap.dataset.agFileKind,files[0]));
    if(this.tab==='items'&&this.itemsView==='records')this.#fillItemPreview(root);
    this.browseUnsub?.();this.browseUnsub=null;this.browsePaint=null;
    if(this.tab==='items'&&this.itemsView==='all')this.#mountBrowse(root.querySelector('[data-ag-browse]'));
    this.#bindItems(root);
    root.querySelectorAll("[data-ag-action]").forEach(el => el.addEventListener("click", event => {
      event.preventDefault();
      this.#action(el.dataset.agAction).catch(err => this.#fail(err));
    }));
    this.#bindControls(root);
    this.#restoreFocus(root);
  }

  /**
   * Tabs (0.46.0): the top row and each sub-tab row are kit tablists (bindTablist: one Tab stop, arrow keys, Home/End).
   * A click switches and re-renders, then focus goes back to the clicked tab. GM Setup's sub-tabs only show and hide
   * their panels, so its draft is never re-rendered away. Link buttons (data-ag-goto-tab="tab[:sub]") jump the same way.
   */
  #bindNavigation(root) {
    bindTablist(root.querySelector('.agmanager-nav'));
    const go=(tab,sub)=>{
      this.tab=tab;
      if(sub&&tab==='setup')this.setupTab=this.ui.set('setupTab',sub);
      if(sub&&tab==='import')this.importView=this.ui.set('importView',sub);
      return this.render();
    };
    root.querySelectorAll('.agmanager-nav [data-ag-tab]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();this.focusAfterRender=`.agmanager-nav [data-ag-tab="${el.dataset.agTab}"]`;void go(el.dataset.agTab);
    }));
    root.querySelectorAll('[data-ag-goto-tab]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();const [tab,sub]=el.dataset.agGotoTab.split(':');
      this.focusAfterRender=`.agmanager-nav [data-ag-tab="${tab}"]`;void go(tab,sub);
    }));
    const sub={'agm-import':['importView',v=>{this.importView=v;}],'agm-items':['itemsView',v=>{this.itemsView=v;this.libraryPage=0;}],
      'agm-scenes':['moodView',v=>{this.moodView=v;}],'agm-codex':['codexTab',v=>{this.codexTab=v;}]};
    for(const list of root.querySelectorAll('.ag-tabs--sub')){
      const group=list.querySelector('[role="tab"]')?.id?.replace(/-tab-.*$/,'');
      bindTablist(list);
      if(group==='agm-setup'){
        list.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',event=>{
          event.preventDefault();this.setupTab=this.ui.set('setupTab',el.dataset.tab);
          for(const t of list.querySelectorAll('[role="tab"]'))t.setAttribute('aria-selected',String(t===el));
          for(const id of SETUP_VIEWS){const panel=root.querySelector(`#agm-setup-panel-${id}`);if(panel)panel.hidden=id!==this.setupTab;}
        }));
        continue;
      }
      const [key,apply]=sub[group]??[];
      if(!key)continue;
      list.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',event=>{
        event.preventDefault();
        if(key!=='itemsView'&&key!=='moodView')this.ui.set(key,el.dataset.tab);
        apply(el.dataset.tab);this.focusAfterRender=`.ag-tabs--sub [data-tab="${el.dataset.tab}"]`;void this.render();
      }));
    }
  }
  /** Focus survives a re-render (guidelines §9.6): the control that asked for it is matched again by selector. */
  #restoreFocus(root) {
    const selector=this.focusAfterRender;this.focusAfterRender=null;
    if(selector)root.querySelector(selector)?.focus?.();
  }
  /** Leaving with unsaved GM Setup or NPC Codex notes asks first (kit guardDirty). Resolves true to go on. */
  async #confirmDiscard() {
    if(!(await this.setupGuard.confirm()))return false;
    this.setupDraft=null;
    if(!(await this.codexGuard.confirm()))return false;
    this.codexDraft=null;
    return true;
  }
  async close(options) {
    if(!(await this.#confirmDiscard()))return this;
    return super.close(options);
  }
  /** Every file button (kit fileButton) in the window: the main import, organize rules, codex restore and moods file. */
  async #pickFile(kind,file) {
    if(!file)return;
    if(kind==='import')return this.#importFile(file);
    if(kind==='rules')return this.#importRules(file).catch(err=>this.#fail(err));
    if(kind==='codex')return this.#codexImport(file).catch(err=>{this.codexMessage=err.message;toast(err.message,true);void this.render();});
    if(kind==='moods')return this.#moodImportFile(file).catch(err=>this.#fail(err));
  }
  /** GM Setup (0.46.0): the skin cards and boxes write a draft that survives re-renders; Save Changes writes it all. */
  #bindSetup(root) {
    const form=root.querySelector('[data-ag-setup-form]');
    if(!form)return;
    const note=()=>{this.setupDraft=readGmSetupForm(form);this.setupGuard.markDirty();};
    bindSkinPicker(form.querySelector('[data-ag-skin-picker="world"]'),()=>note());
    form.addEventListener('change',note);
    this.setupGuard.watch(form);
  }
  #setupSources() {
    const src=coreLinks().describeSources(), d=this.setupDraft?.sources;
    if(!d)return src;
    return {...src,auto:d.auto,packs:(src.packs??[]).map(p=>({...p,configured:d.packs.includes(p.id)})),
      folders:(src.folders??[]).map(f=>({...f,configured:d.folders.includes(f.id)}))};
  }
  /** Import tab file button: JSON or ZIP. */
  async #importFile(f) {
    {
      // 0.44.1: never swap the loaded file while an import is writing; it would null this.pkg mid-apply.
      if (!f || this.busy) return;
      if (this.zipBundle?.autoRunning) return;
      this.#clearLoaded(`Reading ${f.name}…`);
      this.zipBundle=null;
      try {
        if(f.size>60_000_000)throw new Error('Maximum source file is 60 MB.');
        if(/\.zip$/i.test(f.name)) {
          const buffer=await f.arrayBuffer();
          const bundle=await readImportBundle(buffer);
          const importable=bundle.files.filter(x=>x.kind);
          // A ZIP with one Manager package (and no other import file) keeps the single-file path exactly as before.
          if(importable.length>1 || importable[0]?.kind && importable[0].kind!=='manager') {
            // 0.50.0: auto mode (and its updates box) starts off for every new ZIP.
            this.zipBundle={source:f.name,...bundle,picked:new Set(importable.filter(x=>x.status!=='error').map(x=>x.filename)),queue:null,current:null,outcome:new Map(),
              auto:false,autoUpdates:false,autoRunning:false,stopRequested:false,paused:null,summary:new Map()};
            this.message=`${f.name}: ${bundleSummary(bundle)} Tick the files to import, then press Import selected files. Nothing in your world has changed.`;
            this.tab='import';await this.render();return;
          }
          const result=await readImportZip(buffer);
          this.zipMedia=result.assets;
          this.packageSource=`ZIP ${f.name} → ${result.filename}`;
          await this.#load(result.pkg,this.packageSource);
        } else {
          if(!/\.json$/i.test(f.name)||f.size>10_000_000)throw new Error('Choose JSON (up to 10 MB) or ZIP (up to 60 MB).');
          this.zipMedia=new Map();this.packageSource=f.name;
          await this.#load(JSON.parse(await f.text()),f.name);
        }
      } catch (error) {
        this.#clearLoaded(`${f.name} was not loaded. Nothing in your world changed.`);
        this.errors=[`Import not loaded: ${error.message}`];
        this.importReports=pushReport(this.importReports,buildBlockedReport({file:f.name,message:`${f.name} was not loaded: ${error.message}`,fix:'Choose a Manager package or a Quest, Skill Tree, Headquarters facility or Factions JSON file (up to 10 MB), or a ZIP (up to 60 MB). Nothing in your world changed.'}));
        await this.render();
      }
    }
  }
  /** The rest of the window's controls (bound on every render). */
  #bindControls(root) {
    root.querySelector('[data-ag-upload-assets]')?.addEventListener('change',async e=>{
      if(this.busy)return;
      this.uploadZipArtwork=Boolean(e.target.checked);
      await this.render();
    });
    root.querySelector("[data-ag-profile]")?.addEventListener("change", async event => {
      if(this.busy)return;
      this.profile=event.target.value;this.applyProfile();await this.#preview();
    });
    for(const [field,attribute] of [['system','librarySystem'],['status','libraryStatus'],['package','libraryPackage']]) {
      root.querySelector(`[data-ag-library-${field}]`)?.addEventListener('change',event=>{
        this[attribute]=event.target.value;this.libraryPage=0;void this.render();
      });
    }
    this.#bindCodex(root);
    root.querySelectorAll('[data-ag-library-system-chip]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();this.librarySystem=el.dataset.agLibrarySystemChip;this.libraryPage=0;void this.render();
    }));
    // Menus are <details>: close the open one when one of its items is chosen.
    root.querySelectorAll('.aglib-menu [data-ag-action]').forEach(el=>el.addEventListener('click',()=>el.closest('details')?.removeAttribute('open')));
    root.querySelectorAll('[data-ag-library-inspect]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();this.libraryFocus=el.dataset.agLibraryInspect;void this.render();
    }));
    root.querySelectorAll('[data-ag-library-jump]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();this.libraryFocus=el.dataset.agLibraryJump;this.itemsView='records';
      this.itemFilters={...DEFAULT_FILTERS};this.orgPreview=null;this.librarySystem='all';this.libraryStatus='all';this.libraryPackage='all';
      this.libraryShowArchived=true;this.libraryPage=0;void this.render();
    }));
    root.querySelectorAll('[data-ag-library-open]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();const row=this.managedRows().find(r=>r.uuid===el.dataset.agLibraryOpen);
      if(row?.doc?.sheet?.render) void row.doc.sheet.render({force:true});
    }));
    root.querySelectorAll('[data-ag-player-access-toggle]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();
      const id=el.dataset.agPlayerAccessToggle;
      const enabled=el.dataset.agPlayerAccessEnabled==='true';
      void this.#togglePlayerAccess(id,enabled).catch(error=>this.#playerAccessFail(error));
    }));
    const moodClick=(selector,run)=>root.querySelectorAll(selector).forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();Promise.resolve(run(el.dataset)).catch(err=>this.#fail(err));
    }));
    moodClick('[data-ag-mood-apply]',d=>this.#applyMood(d.agMoodApply));
    moodClick('[data-ag-layer-add]',d=>this.#addLayer(d.agLayerAdd));
    moodClick('[data-ag-effect-remove]',d=>this.#removeEffect(d.agEffectRemove));
    moodClick('[data-ag-mood-edit]',d=>this.#editMood(d.agMoodEdit));
    moodClick('[data-ag-mood-duplicate]',d=>this.#editMood(d.agMoodDuplicate,{duplicate:true}));
    moodClick('[data-ag-mood-favourite]',d=>this.#moodResult(sceneMoods().toggleFavourite(d.agMoodFavourite,{sceneId:this.moodSceneId||undefined})));
    moodClick('[data-ag-mood-filter]',d=>{this.moodFilter=d.agMoodFilter;return this.render();});
    root.querySelector('[data-ag-mood-scene]')?.addEventListener('change',event=>{this.moodSceneId=event.target.value;this.moodDraft=null;void this.render();});
    root.querySelector('[data-ag-mood-transition]')?.addEventListener('change',event=>{this.moodTransition=event.target.value;});
    root.querySelector('[data-ag-mood-search]')?.addEventListener('change',event=>{this.moodSearch=event.target.value;void this.render();});
    root.querySelectorAll('[data-ag-draft]').forEach(el=>el.addEventListener(el.type==='range'?'input':'change',()=>this.#readDraftControl(el.dataset.agDraft)));
    root.querySelectorAll('[data-ag-draft-none]').forEach(el=>el.addEventListener('change',()=>this.#readDraftControl(el.dataset.agDraftNone)));
    root.querySelectorAll('[data-ag-mood-export]').forEach(el=>el.addEventListener('change',()=>{this.moodExport[el.dataset.agMoodExport]=el.checked;}));
    root.querySelectorAll('[data-ag-mood-import-choice]').forEach(el=>el.addEventListener('change',()=>{if(this.moodImport)this.moodImport.choices[el.dataset.agMoodImportChoice]=el.value;}));
    root.querySelectorAll('[data-ag-module-open]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();this.#openOtherModule(el.dataset.agModuleOpen).catch(error=>{
        this.libraryMessage=error.message;toast(error.message,true);void this.render();
      });
    }));
    root.querySelector("[data-ag-library-show-archived]")?.addEventListener("change", event=>{
      this.libraryShowArchived=event.target.checked;this.libraryPage=0;void this.render();
    });
    root.querySelectorAll("[data-ag-library-select]").forEach(el=>el.addEventListener("change",event=>{
      if(event.target.checked)this.librarySelected.add(event.target.dataset.agLibrarySelect);
      else this.librarySelected.delete(event.target.dataset.agLibrarySelect);
      void this.render();
    }));
    root.querySelector("[data-ag-update-existing]")?.addEventListener("change", async event => {
      if (this.busy) return;
      this.updateExisting = event.target.checked;
      await this.#preview();
    });
    root.querySelector("[data-ag-update-actors]")?.addEventListener("change", async event => {
      if (this.busy) return;
      this.updateActors = event.target.checked;
      await this.#preview();
    });
    root.querySelector("[data-ag-capture-filter]")?.addEventListener("change", e=>{
      this.captureSearch=e.target.value.trim();void this.render();
    });
    root.querySelector("[data-ag-capture-tagged-only]")?.addEventListener("change", e=>{
      this.captureTaggedOnly=e.target.checked;void this.render();
    });
    root.querySelector("[data-ag-capture-kind]")?.addEventListener("change", e=>{this.captureKind=e.target.value;});
    root.querySelectorAll("[data-ag-capture-select]").forEach(el => el.addEventListener("change", e=>{
      if (e.target.checked) this.captureSelected.add(e.target.dataset.agCaptureSelect);
      else this.captureSelected.delete(e.target.dataset.agCaptureSelect);
      void this.render();
    }));
    root.querySelectorAll("[data-ag-zip-pick]").forEach(el => el.addEventListener("change", event => {
      const name=event.target.dataset.agZipPick;
      if(this.busy||!this.zipBundle||this.zipBundle.queue) return;
      if(event.target.checked) this.zipBundle.picked.add(name); else this.zipBundle.picked.delete(name);
      void this.render();
    }));
    // 0.50.0 auto mode: two opt-in boxes (the second only with the first) and a stop button that works while it runs.
    root.querySelector('[data-ag-zip-auto]')?.addEventListener('change',event=>{
      if(this.busy||!this.zipBundle||this.zipBundle.queue) return;
      this.zipBundle.auto=Boolean(event.target.checked);
      if(!this.zipBundle.auto) this.zipBundle.autoUpdates=false;
      this.focusAfterRender='[data-ag-zip-auto]';void this.render();
    });
    root.querySelector('[data-ag-zip-auto-updates]')?.addEventListener('change',event=>{
      if(this.busy||!this.zipBundle?.auto||this.zipBundle.queue) return;
      this.zipBundle.autoUpdates=Boolean(event.target.checked);
      this.focusAfterRender='[data-ag-zip-auto-updates]';void this.render();
    });
    // Not a data-ag-action: those are ignored while busy, and Stop must work while a file imports.
    root.querySelector('[data-ag-zip-stop]')?.addEventListener('click',event=>{
      event.preventDefault();
      const bundle=this.zipBundle;
      if(!bundle?.queue) return;
      if(bundle.autoRunning) {
        bundle.stopRequested=true;event.currentTarget.disabled=true;
        const el=root.querySelector('[data-ag-zip-progress]');if(el)el.textContent='Stopping after the current file…';
        return;
      }
      this.#zipCancel().catch(err=>this.#fail(err));
    });
    root.querySelectorAll("[data-ag-select]").forEach(el => el.addEventListener("change", event => {
      if (this.busy) return;
      const id = event.target.dataset.agSelect;
      if (event.target.checked) this.selected.add(id);
      else this.selected.delete(id);
      // Re-render to accurately enable the Apply button.
      void this.render();
    }));
    this.#bindImportLayout(root);
    this.#bindOrganize(root);
    this.#bindIcons(root);
    // Not a data-ag-action: those are ignored while busy, and Cancel must work while the commit runs.
    root.querySelector('[data-ag-clean-stop]')?.addEventListener('click',event=>{
      event.preventDefault();if(!this.cleanAbort)return;
      this.cleanAbort.abort();event.currentTarget.disabled=true;
      const el=root.querySelector('[data-ag-clean-status]');if(el)el.textContent='Cancelling after the current chunk…';
    });
    root.querySelectorAll('[data-ag-cl-tick]').forEach(el=>el.addEventListener('change',e=>{
      const id=e.target.dataset.agClTick;if(e.target.checked)this.clTicked.add(id);else this.clTicked.delete(id);void this.render();
    }));
    root.querySelectorAll('[data-ag-cl-linkonly]').forEach(el=>el.addEventListener('change',e=>{
      const id=e.target.dataset.agClLinkonly;if(e.target.checked)this.clLinkOnly.add(id);else this.clLinkOnly.delete(id);
    }));
  }

  /** Import tab: remember folded sections; the drawer's show/hide and kind tabs (0.45.0). */
  #bindImportLayout(root) {
    const layout=this.#layout();
    root.querySelectorAll('details[data-ag-fold]').forEach(el=>el.addEventListener('toggle',()=>{
      const key=el.dataset.agFold;
      if(!FOLDS.includes(key)||layout.folds[key]===el.open)return;
      layout.folds[key]=el.open;this.#saveLayout();
    }));
    root.querySelector('[data-ag-drawer-toggle]')?.addEventListener('click',event=>{
      event.preventDefault();layout.drawerOpen=!layout.drawerOpen;this.#saveLayout();void this.render();
    });
    root.querySelectorAll('[data-ag-drawer-tab]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();layout.drawerTab=el.dataset.agDrawerTab;layout.drawerOpen=true;this.#saveLayout();void this.render();
    }));
  }
  async #action(name) {
    if(!game.user?.isGM) throw new Error('Only GMs can operate the General Manager.');
    if (this.busy || this.zipBundle?.autoRunning) return;
    switch(name) {
      case "demo": {
        const response = await fetch(`modules/${MODULE_ID}/samples/demo-package.json`, {cache:"no-store"});
        if (!response.ok) throw new Error(`Demo request failed (${response.status}).`);
        this.zipBundle=null;this.zipMedia=new Map();this.packageSource="Included demonstration";this.tab="import";this.importView=this.ui.set('importView','package');
        await this.#load(await response.json(), "Included demonstration");
        break;
      }
      case "help": {
        await infoDialog('General Manager help',MANAGER_HELP);
        break;
      }
      case "preview": await this.#preview(); break;
      case "select":
        this.selected = new Set(this.preview.filter(row => actionAllowed.has(row.action)).map(row => row.id));
        await this.render(); break;
      case "clear": this.selected.clear(); await this.render(); break;
      case "apply": {
        this.applyRan=false;
        await this.#apply();
        // In a ZIP bundle, a confirmed Apply records that file's outcome and loads the next ticked file.
        if(this.zipBundle?.current && this.applyRan) {
          this.zipBundle.outcome.set(this.zipBundle.current,this.importReports[0]?.toneLabel??'Done');
          await this.#zipNext();
        }
        break;
      }
      case "zip-start": await this.#zipStart(); break;
      case "zip-skip":
        if(this.zipBundle?.current){this.zipBundle.outcome.set(this.zipBundle.current,'Skipped by GM');await this.#zipNext();}
        break;
      case "zip-cancel": await this.#zipCancel(); break;
      case "backup-actors": {
        if(!game.user.isGM) throw new Error('GM access required.');
        const docs=this.preview.filter(r=>r.kind==='Actor'&&r.action==='update').flatMap(r=>foundDocuments(r.id));
        if(!docs.length) return toast('No existing Actors would be updated.');
        this.#downloadSnapshots(docs,`actor-backup-${Date.now()}`);
        toast(`Downloaded a backup of ${docs.length} Actor(s). Nothing in the world changed.`);
        break;
      }
      case "clear-results": this.importReports=[]; await this.render(); break;
      case "world-export-everything": case "world-export-changed": case "world-export-copy": case "world-backup": await this.#worldExport(name); break;
      case "presession-run": case "presession-copy": case "presession-download": await this.#preSession(name); break;
      // Back to normal also drops the fine-tune draft, so the panel shows the restored scene.
      case "mood-restore": this.moodDraft=null; await this.#moodResult(sceneMoods().restore({sceneId:this.moodSceneId||undefined,animate:this.#moodAnimate()})); break;
      case "mood-new": case "layer-new": this.moodEdit={isNew:true,kind:name==='layer-new'?'layer':'mood',id:'',label:'',set:name==='layer-new'?{weather:NO_WEATHER}:{'environment.darknessLevel':0,weather:NO_WEATHER},transitionMs:0}; await this.render(); break;
      case "mood-cancel": this.moodEdit=null; await this.render(); break;
      case "mood-save": await this.#saveMood(); break;
      case "mood-remove": await this.#removeMood(); break;
      case "draft-cancel": case "draft-apply": case "draft-save-layer": case "draft-save-mood": await this.#draftAction(name); break;
      case "mood-export": case "mood-import-cancel": case "mood-import-apply": await this.#moodShareAction(name); break;
      case "mood-reset": {
        const yes=await confirmDanger('Replace every mood and layer preset with the shipped defaults? Your own presets and edits are deleted. Scenes are not changed.',
          {title:'Reset scene moods and layers?',yes:'Reset moods to defaults'});
        if(yes){this.moodEdit=null;await this.#moodResult(sceneMoods().resetDefaults(),'Moods and layers reset to the defaults.');}
        break;
      }
      // 0.35.1: these org-* actions used to fall through to the Core Links handler, which ignored them silently.
      case "org-preview": case "org-apply": case "org-backup": case "org-undo": case "org-clear": case "org-housekeeping": await this.#organizeAction(name); break;
      case "cl-scan": case "cl-apply": case "cl-backup": case "cl-undo": case "cl-clear": await this.#coreLinkAction(name); break;
      case "setup-save": await this.#saveSetup(); break;
      case "setup-cancel": this.setupDraft=null; this.setupGuard.markClean(); this.setupMessage="Changes discarded."; await this.render(); break;
      case "clean-scan": case "clean-cancel": case "clean-backup": case "clean-commit": await this.#cleanAction(name); break;
      case "icons-scan": case "icons-reindex": case "icons-cancel": case "icons-backup": case "icons-apply": case "icons-undo": await this.#iconAction(name); break;
      case "org-schema-edit": case "org-schema-save": case "org-schema-cancel": case "org-schema-export": case "org-schema-reset": await this.#organizeAction(name); break;
      case "library-check": this.#runAudit(); this.itemsView="checks";this.libraryMessage="Library check finished: results are listed below."; await this.render(); break;
      case "appearance-my-appearance": {
        myAppearanceApp ??= new AshenGateMyAppearance();
        await myAppearanceApp.render({force:true});break;
      }
      case "player-access-refresh": this.playerAccessMessage="Reading each module’s live Player Access state.";this.playerAccessReport=null;await this.render();break;
      case "player-access-hide-all": await this.#hideAllPlayerAccess();break;
      case "export": this.#exportPreview(); break;
      case "capture-select-visible": {
        const rows=allCaptureRows().filter(row => (!this.captureTaggedOnly || row.capture) && (!this.captureSearch || row.name.toLowerCase().includes(this.captureSearch.toLowerCase()) || row.type.toLowerCase().includes(this.captureSearch.toLowerCase())));
        rows.forEach(row=>this.captureSelected.add(row.id)); await this.render(); break;
      }
      case "capture-clear": this.captureSelected.clear();await this.render();break;
      case "capture-tag": await this.#tagSelected();break;
      case "capture-untag": await this.#untagSelected();break;
      case "capture-export": await this.#exportCaptures();break;
      case "library-select-visible": {
        const rows=this.#visibleLibraryRows();rows.forEach(row=>this.librarySelected.add(row.uuid));
        await this.render();break;
      }
      case "library-next": this.libraryPage++;await this.render();break;
      case "codex-save": case "codex-cancel": case "codex-close": case "codex-hide-all": case "codex-export": case "codex-player-view": case "codex-open-actor":
        await this.#codexAction(name);break;
      case "library-previous": this.libraryPage=Math.max(0,this.libraryPage-1);await this.render();break;
      case "library-inspect-clear": this.libraryFocus=null;await this.render();break;
      case "library-clear": this.librarySelected.clear();await this.render();break;
      case "library-archive": await this.#lifecycle("archive");break;
      case "library-restore": await this.#lifecycle("restore");break;
      case "library-delete": await this.#lifecycle("delete");break;
      case "library-export": await this.#exportManaged();break;
      case "library-stage": await this.#stageCompendium();break;
      case "library-replace": await this.#replaceFromSource();break;
      case "template-example": this.#downloadTemplateExample();break;
      case "source-manifest-template": {
        const file='AG_SourcePackage_Manifest_v0.1.0_Example.json';
        const response=await fetch(`modules/${MODULE_ID}/samples/${file}`,{cache:'no-store'});
        if(!response.ok) throw new Error(`Source manifest template unavailable (${response.status}).`);
        downloadJson(file,await response.json());break;
      }
      case "import-format-example": {
        const file='AG_Example_ImportTemplate_v0.1.0_20261015_Import.json';
        const response=await fetch(`modules/${MODULE_ID}/samples/${file}`,{cache:'no-store'});
        if(!response.ok) throw new Error(`Import template unavailable (${response.status}).`);
        downloadJson(file,await response.json());break;
      }
      case "reset": this.zipBundle=null; this.#clearLoaded("Choose a Manager package or a Quest, Skill Tree, Headquarters or Factions file to begin."); await this.render();break;
      default: throw new Error(`Unknown action: ${name}`);
    }
  }
  #playerAccessFail(error) {
    this.playerAccessMessage=`Player Access error: ${error?.message??String(error)}`;
    toast(this.playerAccessMessage,true);
    void this.render();
  }
  async #togglePlayerAccess(id,enabled) {
    if(!game.user?.isGM) throw new Error('Only GMs can change Player Access.');
    if(this.busy) return;
    const mod=game.modules.get(id);
    if(!mod)throw new Error(`${id}: no installed module with this ID.`);
    this.busy=true;
    try {
      const result=await changePlayerAccess(mod,enabled,{isGM:game.user.isGM});
      // 0.45.0: the Character Hub shows (or, for the Strain bar, hides) the parts this module backs.
      const hub=await followHubVisibility(game.modules,id,result.playerAccessEnabled);
      this.playerAccessMessage=`${result.title}: Player interface ${result.playerAccessEnabled?'Visible':'Hidden'}${result.changed?' (saved by the specialist module)':' (already set)'}.${hub.message?` ${hub.message}`:''}`;
      this.playerAccessReport=null;
      toast(this.playerAccessMessage);
    } finally {this.busy=false;await this.render();}
  }
  async #hideAllPlayerAccess() {
    if(!game.user?.isGM)throw new Error('Only GMs can change Player Access.');
    if(this.busy)return;
    const modules=[...(game.modules?.values?.()??[])];
    const rows=await collectPlayerAccess(modules);
    const targets=rows.filter(r=>r.canToggle && r.playerAccessEnabled);
    if(!targets.length){this.playerAccessMessage='No visible supported player interfaces need hiding.';await this.render();return;}
    const names=targets.map(r=>r.title).join(', ');
    const confirmed=await confirmDanger(`Hide ${targets.length} currently visible player window(s)?\nEach module saves its own access setting. No character or campaign progress will be deleted.\n${names}\nModules are hidden one at a time; any failures will be reported.`,
      {title:'Hide all player windows?',yes:'Hide all'});
    if(!confirmed)return;
    this.busy=true;
    try{
      const result=await hideAllPlayerInterfaces(modules,{isGM:game.user.isGM});
      this.playerAccessReport=result;
      // The Strain bar follows Cinders (the Hub hides the other parts itself once their module's Player Access is off).
      for(const row of result.changed) await followHubVisibility(game.modules,row.id,false);
      const failures=result.failed.map(r=>`${r.title}: ${r.error}`).join(' | ');
      this.playerAccessMessage=`Hide All: ${result.changed.length} hidden, ${result.alreadyHidden.length} already hidden, ${result.skipped.length} skipped, ${result.failed.length} failed.${failures?' Failures: '+failures:''}`;
      toast(this.playerAccessMessage,Boolean(result.failed.length));
    }finally{this.busy=false;await this.render();}
  }
  /** Forgets any loaded file (and its banner) so a failed or new load never shows the previous file as loaded. */
  #clearLoaded(message) {
    this.pkg=null; this.rawPkg=null; this.specialist=null; this.zipMedia=new Map(); this.packageSource=null;
    this.preview=[]; this.errors=[]; this.warnings=[]; this.moduleLinks=[]; this.selected.clear();
    this.iconOverrides=new Map(); this.repickIcons=false;
    this.message=message;
  }
  /** ZIP auto mode (0.50.0): the two boxes, progress while it runs and the per-file summary table. */
  #zipAutoContext() {
    const b=this.zipBundle;
    const tone={'Done':'ok','Done with notes':'warn','Needs attention':'danger','Skipped by GM':'warn','Importing':'accent'};
    const summaryRows=(b.autoPlan??[]).map(filename=>{
      const f=b.files.find(x=>x.filename===filename), s=b.summary.get(filename), status=b.outcome.get(filename)??'Waiting';
      return {filename,label:f?.label??'',status,tone:tone[status]??'',hasCounts:Boolean(s),counts:s?.counts??{},note:s?.note??''};
    });
    const decisions=(b.autoPlan??[]).map(filename=>({filename,names:(b.summary.get(filename)?.needsDecision??[]).join(', ')})).filter(d=>d.names);
    return {auto:b.auto, autoUpdates:b.autoUpdates, autoLocked:Boolean(b.queue)||this.busy, autoMode:Boolean(b.auto&&b.queue),
      autoRunning:Boolean(b.autoRunning), paused:Boolean(b.paused), stopping:Boolean(b.stopRequested),
      progress:b.autoRunning&&b.current?`File ${b.step} of ${b.total}: ${b.current}`:b.paused?`Paused at file ${b.step} of ${b.total}: ${b.paused.filename}`:'',
      hasAutoSummary:summaryRows.length>0, summaryRows, decisions, hasDecisions:decisions.length>0};
  }
  /** Ends a ZIP import: the files not yet imported are marked so, and those already applied keep their results. */
  async #zipCancel() {
    const bundle=this.zipBundle;
    if(!bundle) return;
    // A file auto mode paused on keeps its Needs attention: part of it may already be imported.
    const current=bundle.current&&bundle.paused?.filename!==bundle.current?[{filename:bundle.current}]:[];
    for(const item of [...(bundle.queue??[]),...current]) bundle.outcome.set(item.filename,'Not imported');
    bundle.queue=null;bundle.current=null;bundle.paused=null;bundle.stopRequested=false;
    this.#clearLoaded(`${bundle.source}: the rest of the ZIP was not imported. Files already applied keep their results below.`);
    await this.render();
  }
  /** Starts a multi-file ZIP: the ticked files, Manager package(s) first, each through the normal preview and Apply. */
  async #zipStart() {
    const bundle=this.zipBundle;
    if(!bundle||bundle.queue) return;
    const plan=planBundleImport(bundle,bundle.picked,{isGM:Boolean(game.user?.isGM)});
    if(!plan.length){this.message='No files are ticked in the ZIP contents list, so nothing was imported.';await this.render();return;}
    bundle.queue=plan;bundle.total=plan.length;bundle.summary=new Map();bundle.stopRequested=false;bundle.paused=null;
    bundle.autoPlan=bundle.auto?plan.map(p=>p.filename):null;
    for(const f of bundle.files) if(!plan.some(p=>p.filename===f.filename)) bundle.outcome.set(f.filename,f.status==='error'?'Not imported (error)':'Not ticked');
    await this.#zipNext();
  }
  /** Loads the next queued ZIP file. A file that cannot load or validate gets its own result entry; the rest continue. */
  async #zipNext() {
    const bundle=this.zipBundle;
    if(!bundle?.queue) return;
    if(bundle.auto) return this.#zipAutoRun();
    const next=bundle.queue.shift();
    if(!next) {
      bundle.current=null;bundle.queue=null;
      this.#clearLoaded(`${bundle.source}: ZIP import finished. Each file's result is in the ZIP contents list and the Import results panel.`);
      await this.render();return;
    }
    const label=`ZIP ${bundle.source} → ${next.filename}`;
    const step=`File ${bundle.total-bundle.queue.length} of ${bundle.total}`;
    bundle.current=next.filename;bundle.outcome.set(next.filename,'In preview');
    this.zipMedia=next.kind==='manager'?bundle.assets:new Map();this.packageSource=label;
    try {await this.#load(next.payload,label);}
    catch(error) {this.errors=[String(error?.message??error)];}
    if(this.errors.length) {
      this.importReports=pushReport(this.importReports,buildBlockedReport({file:label,module:next.label,
        message:`${next.filename} was not imported: ${this.errors.slice(0,3).join(' ')}`,fix:'Correct this file and import it on its own; the other files in the ZIP continue.'}));
      bundle.outcome.set(next.filename,'Needs attention');
      return this.#zipNext();
    }
    this.message=`${step} from the ZIP: ${next.filename} (${next.label}). ${this.message} Select records and Apply, or press Skip this file.`;
    await this.render();
  }
  /**
   * 0.50.0 "Import everything without stopping": each queued file loads and previews as usual, autoSelect ticks its safe
   * rows, and the same #apply the Import button runs writes them (same revalidation, backups, history and results), only
   * without the confirmation dialogs the GM opted out of. Pauses on a file with errors or a failed apply; Skip this file
   * goes on, Stop ZIP import ends the rest.
   */
  async #zipAutoRun() {
    const bundle=this.zipBundle;
    if(bundle.autoRunning) return;
    bundle.autoRunning=true;bundle.paused=null;
    const pause=async(next,message)=>{
      bundle.paused={filename:next.filename};bundle.outcome.set(next.filename,'Needs attention');
      this.message=`Paused at file ${bundle.step} of ${bundle.total}: ${next.filename}. ${message} Press Skip this file to go on with the rest, or Stop ZIP import.`;
      await this.render();
    };
    try {
      while(bundle.queue?.length && !bundle.stopRequested) {
        const next=bundle.queue.shift();
        const label=`ZIP ${bundle.source} → ${next.filename}`;
        bundle.current=next.filename;bundle.step=bundle.total-bundle.queue.length;bundle.outcome.set(next.filename,'Importing');
        this.zipMedia=next.kind==='manager'?bundle.assets:new Map();this.packageSource=label;
        this.busy=true;
        try {await this.#load(next.payload,label);}
        catch(error) {this.errors=[String(error?.message??error)];}
        if(this.errors.length) {
          this.importReports=pushReport(this.importReports,buildBlockedReport({file:label,module:next.label,
            message:`${next.filename} was not imported: ${this.errors.slice(0,3).join(' ')}`,fix:'Skip this file to go on with the rest of the ZIP, then correct it and import it on its own.'}));
          this.busy=false;return pause(next,'It has errors, so nothing in it was imported.');
        }
        const rows=this.preview.map(r=>({id:r.id,name:r.name,action:r.action,reason:r.reason}));
        const {selected,needsDecision}=autoSelect(rows,{updates:bundle.autoUpdates});
        const entry={label:next.label,needsDecision:needsDecision.map(r=>r.name),...autoFileCounts(rows,[],[])};
        if(!selected.length) {
          // A specialist module that is off or too old previews as one skipped row carrying the reason.
          const why=rows.find(r=>r.action==='skipped'&&r.id===SPECIALISTS[next.kind]?.moduleId)?.reason;
          bundle.summary.set(next.filename,{...entry,note:why??'Nothing in this file needed importing.'});
          bundle.outcome.set(next.filename,entry.counts.needsDecision?'Done with notes':'Nothing to import');
          continue;
        }
        this.selected=new Set(selected);
        this.applyRan=false;
        try {await this.#apply({auto:true});}
        catch(error) {this.errors=[String(error?.message??error)];}
        this.busy=true;
        const log=(game.settings.get(MODULE_ID,'importHistory')??[]).at(-1);
        if(!this.applyRan || !log) {
          bundle.summary.set(next.filename,{...entry,...autoFileCounts(rows,selected,[]),note:this.errors[0]??'The import could not start.'});
          this.busy=false;return pause(next,`The import could not start: ${this.errors.slice(0,2).join(' ')||'see the Import results panel.'}`);
        }
        const result={...entry,...autoFileCounts(rows,selected,log.results??[])};
        bundle.summary.set(next.filename,result);
        bundle.outcome.set(next.filename,result.toneLabel);
        if(result.counts.failed) {this.busy=false;return pause(next,`${result.counts.failed} record(s) failed to import; the reasons are in the Import results panel.`);}
      }
    } finally {bundle.autoRunning=false;this.busy=false;}
    if(bundle.stopRequested) {bundle.current=null;return this.#zipCancel();}
    bundle.current=null;bundle.queue=null;
    this.#clearLoaded(`${bundle.source}: ZIP import finished. The summary below lists each file; the Import results panel has the details.`);
    await this.render();
  }
  async #load(input, label) {
    const keepSource=this.packageSource, keepMedia=this.zipMedia;
    this.#clearLoaded(`Reading ${label}…`);
    this.packageSource=keepSource; this.zipMedia=keepMedia;
    const kind=detectSpecialistFile(input);
    if(kind) {
      this.specialist={kind,payload:input,count:specialistCount(kind,input)};
      this.message = `${label} loaded as a ${SPECIALISTS[kind].label} file. Preview has NOT modified your world.`;
    } else {
      const plain=input && typeof input==='object' && !Array.isArray(input);
      if(!plain || (!classifyDelivery(input) && !Array.isArray(input.records))) throw new Error(describeUnrecognized(input));
      this.rawPkg=input;
      this.pkg=compilePackage(input);
      this.message = `${label} loaded. Preview has NOT modified your world.`;
    }
    this.tab = "import";
    await this.#preview();
  }
  async #previewSpecialist() {
    const {kind,payload}=this.specialist;
    this.warnings=[]; this.moduleLinks=[]; this.preview=[]; this.selected.clear();
    try {
      const plan=planSpecialist(kind,payload,specialistApi(game,kind),{updateExisting:this.updateExisting});
      this.errors=plan.errors; this.preview=plan.errors.length?[]:plan.rows;
    } catch(error) { this.errors=[String(error?.message??error)]; }
    const label=SPECIALISTS[kind].label;
    this.message=this.errors.length ? `Validation failed: ${this.errors.length} issue(s). No changes made.`
      : `Validated ${this.specialist.count} ${label} record(s). ${label} stores them; nothing changes before Apply.`;
    await this.render();
  }
  async #applySpecialist({auto=false}={}) {
    const {kind,payload}=this.specialist, spec=SPECIALISTS[kind];
    const rows=this.preview.filter(row=>actionAllowed.has(row.action)&&this.selected.has(row.id));
    const fileLabel=this.packageSource??`${spec.label} file`;
    if(!rows.length){
      this.importReports=pushReport(this.importReports,buildBlockedReport({file:fileLabel,module:spec.label,message:'No records were selected, so nothing was imported.',fix:'Press Select eligible (or tick records) in the preview, then Apply.'}));
      this.message='Nothing selected: nothing was imported. See the result below.';await this.render();return;}
    const api=specialistApi(game,kind);
    if(!api){
      const message=`${spec.label} is not active or is too old to import.`;
      this.errors=[`${message} Enable or update it.`];
      this.importReports=pushReport(this.importReports,buildBlockedReport({file:fileLabel,module:spec.label,message}));
      await this.render();return;}
    const yes=auto || await confirmDialog(`${rows.length} ${spec.kind.toLowerCase()} record(s) will be passed to ${spec.label}, which stores and owns them.\n${spec.canUpdate&&this.updateExisting?'Records already in the world are replaced; their progress and state are kept.':'Records already in the world are kept as they are.'} Back up your world first.`,
      {title:`Import into ${spec.label}?`,yes:'Import'});
    if(!yes)return;
    this.applyRan=true;
    this.busy=true;
    await this.render();
    const log={at:new Date().toISOString(),packageId:`${spec.label} file`,packageVersion:payload?.version??'—',results:[]};
    try {
      log.results.push(...await applySpecialist(kind,payload,api,{ids:rows.map(r=>r.id),updateExisting:this.updateExisting}));
    } catch(error) { log.results.push({action:'import-aborted',status:'error',message:String(error?.message??error)}); }
    const prior=game.settings.get(MODULE_ID,"importHistory") ?? [];
    await game.settings.set(MODULE_ID,"importHistory",[...prior,log].slice(-40));
    const count=s=>log.results.filter(r=>r.status===s).length;
    const made=log.results.filter(r=>r.status==='ok'&&r.action==='create').length;
    const replaced=log.results.filter(r=>r.status==='ok'&&r.action==='update').length;
    const text=`${spec.label}: ${made} created, ${replaced} updated, ${count('skipped')} skipped, ${count('error')} error(s). Details are in the result panel below.`;
    this.busy=false;
    await this.#preview();
    this.importReports=pushReport(this.importReports,buildImportReport({file:fileLabel,at:log.at,results:log.results,
      names:new Map(rows.map(r=>[r.id,r.name]))}));
    this.message=text; toast(text,Boolean(count('error')));
    await this.render();
  }
  async #preview() {
    if (this.specialist) return this.#previewSpecialist();
    if (!this.pkg) {this.message="No package loaded."; await this.render(); return;}
    // Route endpoints may be locations that live only in Locations (not Manager-bound documents).
    const externalIds = withLocationIds(existingSourceIndex(), locationsApi(game));
    this.errors = validatePackage(this.pkg, externalIds);
    this.warnings = [];
    this.moduleLinks = [];
    // Cinder / Power / Backfire-table blocks are checked by Ashen Gate | Cinders when it is active (0.39.0).
    const cinderChecks = cinderDefinitionChecks(game, this.pkg.records);
    this.errors.push(...cinderChecks.errors); this.warnings.push(...cinderChecks.warnings);
    // Record-level modifiers go to the module that owns each scope (0.41.0).
    const modifierChecks = modifierDefinitionChecks(game, this.pkg.records);
    this.errors.push(...modifierChecks.errors); this.warnings.push(...modifierChecks.warnings);
    if (this.pkg.manifest.schema_version === 'ag-foundry-import/0.1') {
      this.warnings.push('Legacy import package: accepted for compatibility; future exports should use Archie typed references and v0.2 metadata.');
    } else if (isContractImport(this.pkg) && !this.errors.length) {
      // 0.44.2: absent optional links to another module's records (LOC-, FACTION-, QUEST-, FAC-, ...) are informational.
      const graphNotes=checkContractGraph(this.pkg.records,externalIds,id=>Boolean(game.modules?.get?.(id)?.active));
      this.warnings.push(...graphNotes.warnings);
      this.moduleLinks.push(...graphNotes.moduleLinks);
      if (this.pkg.legacy_crosswalk?.length) this.warnings.push(`${this.pkg.legacy_crosswalk.length} legacy crosswalk entry/entries supplied for review only; the Manager will not rebind IDs automatically.`);
    }
    this.preview = [];
    this.selected.clear();
    if (this.errors.length) {this.message=`Validation failed: ${this.errors.length} issue(s). No changes made.`; await this.render(); return;}
    const records = this.pkg.records;
    const graph=dependencyOrder(records);
    this.dependencyNotes=graph.cycles.length ? `${graph.cycles.length} circular reference path(s) detected. Required links are checked against the selected records and existing world IDs before Apply; references remain ID-linked.` : "No required-reference cycles.";
    if (isContractImport(this.pkg) && graph.cycles.length) this.warnings.push('Circular relationships are allowed when targets are selected or already present. The second pass now binds actual world UUIDs.');
    const withPaths=records.filter(r=>r.foundry?.folder_path).length;
    const fallbackIcons=records.filter(r=>ICON_DOCUMENT_TYPES.includes(r.foundry?.document_type) && wantsSmartIcon(r)).length;
    this.warnings.push(`${withPaths} folder destination(s), ${fallbackIcons} record(s) without a real icon; folders and ${this.smartIcons?'chosen icons (see the Icon column)':'generic icons'} are applied only after confirmation.`);
    // 0.47.0: build the icon index in the background; the preview fills in the picks when it is ready.
    if(this.smartIcons&&fallbackIcons) void iconIndexer().ensure();
    if(this.zipMedia.size) this.warnings.push(`${this.zipMedia.size} artwork file(s) in source ZIP. Matching assets can be uploaded to this world's data folder during Apply; no ZIP scripts execute.`);
    const locApi=locationsApi(game);
    const note=locationsNote(records,locApi);
    if(note) this.warnings.push(note);
    const locationIds=locApi ? new Set(locApi.listLocations().map(l=>l.id)) : null;
    const rteApi=routesApi(game);
    const routeNote=routesNote(records,rteApi);
    if(routeNote) this.warnings.push(routeNote);
    const routeIds=rteApi ? new Set(rteApi.listRoutes().map(r=>r.id)) : null;
    const shpApi=shopsApi(game);
    const shopNote=shopsNote(records,shpApi);
    if(shopNote) this.warnings.push(shopNote);
    const existingShopIds=shopIds(shpApi);
    // Endpoints a route may use: locations already in Locations, and those this run passes to it.
    const endpointIds=new Set(locationIds ?? []);
    for (const record of records) if (isLocationRecord(record) && ['create','update'].includes(planLocation(record,{existingIds:locationIds,includeDrafts:this.includeDrafts,updateExisting:this.updateExisting}).action)) endpointIds.add(record.id);
    for (const id of graph.order) {
      const record=records.find(r=>r.id===id);
      if (isLocationRecord(record)) {
        const {action,reason}=planLocation(record,{existingIds:locationIds,includeDrafts:this.includeDrafts,updateExisting:this.updateExisting});
        this.preview.push({id:record.id, name:record.location?.name ?? record.name ?? record.id, kind:'Location', lifecycle:record.status, action, reason, patch:{}});
        continue;
      }
      if (isRouteRecord(record)) {
        const {action,reason}=planRoute(record,{existingIds:routeIds,locationIds:endpointIds,includeDrafts:this.includeDrafts,updateExisting:this.updateExisting});
        this.preview.push({id:record.id, name:record.route?.name || record.name || record.id, kind:'Route', lifecycle:record.status, action, reason, patch:{}});
        continue;
      }
      if (isShopRecord(record)) {
        const {action,reason}=planShop(record,{existingIds:existingShopIds,includeDrafts:this.includeDrafts,updateExisting:this.updateExisting});
        this.preview.push({id:record.id, name:record.name || record.id, kind:record.entity_type, lifecycle:record.status, action, reason, patch:{}});
        continue;
      }
      const {action,reason,patch={},changes=[],effects=null}=planDocument(record,this.pkg,this).plan;
      this.preview.push({id:record.id, name:record.foundry?.data?.name ?? record.name ?? record.id, kind:record.foundry?.document_type ?? record.entity_type+" (unmapped)", detail:professionFacts(record)?.summary ?? '', lifecycle:record.status, action, reason, patch, changes, effects,
        effectRows:(effects?.rows??[]).map(r=>({...r,label:{create:'New',update:'Update',kept:'Kept',handmade:'Untouched'}[r.action]}))});
      this.warnings.push(...flagWarnings(record));
    }
    this.#assignIcons();
    this.message = `Validated ${records.length} records. ${this.dependencyNotes} Nothing changes before Apply.`;
    await this.render();
  }
  /**
   * Smart icons (0.47.0): the Icon column of the preview. Runs after each preview, when an icon option changes and when
   * the icon index becomes ready; ticks are kept. A re-import whose only change is a placeholder icon becomes "icon".
   */
  #assignIcons() {
    if(!this.pkg) return;
    const records=new Map(this.pkg.records.map(r=>[r.id,r]));
    // One pass over the world (not one per row): bound documents by permanent id.
    const bound=new Map();
    for(const doc of allBoundDocuments()){const id=sourceFlag(doc).sourceId;if(!bound.has(id))bound.set(id,[]);bound.get(id).push(doc);}
    for(const row of this.preview) {
      const record=records.get(row.id);
      if(!record||!ICON_DOCUMENT_TYPES.includes(record.foundry?.document_type)) continue;
      row.baseAction??=row.action; row.baseReason??=row.reason;
      row.action=row.baseAction; row.reason=row.baseReason;
      const docs=row.baseAction==='create'?[]:(bound.get(record.id)??[]).filter(d=>d.documentName===record.foundry.document_type);
      row.icon=this.#iconFor(record,row.baseAction,docs);
      if(row.icon?.existing&&['unchanged','local'].includes(row.baseAction)) {
        row.action='icon';
        row.reason=`${row.baseReason} Only the icon changes: ${row.icon.why==='repick'?'a new pick replaces the one Manager chose before':'the world copy has a placeholder icon'}.`;
      }
    }
    for(const row of this.preview) if(!actionAllowed.has(row.action)) this.selected.delete(row.id);
  }
  /** The icon one preview row would get, or null (authored icon kept, or nothing to fill). */
  #iconFor(record,action,docs) {
    const smart=this.smartIcons, index=smart?iconIndexer().index:null, override=this.iconOverrides.get(record.id);
    if(action==='create') {
      const icon=pickRecordIcon(record,{index,smart,override});
      return icon?{...icon,pending:Boolean(smart&&!index&&!override&&iconIndexer().status().state!=='failed')}:null;
    }
    if(!['update','unchanged','local','metadata'].includes(action)||docs.length!==1) return null;
    const doc=docs[0];
    const decision=existingIconDecision({recordImg:record.foundry.data?.img,docImg:doc.img,flags:doc.flags?.[MODULE_ID],repick:this.repickIcons,smart});
    if(!decision.fill||(!index&&!override)) return null;
    const icon=pickRecordIcon(record,{index,smart:true,override});
    // An existing document changes only for a real pick, never from one placeholder to another.
    if(!icon||icon.source==='fallback'||icon.img===doc.img) return null;
    return {...icon,existing:true,why:decision.why,current:doc.img};
  }
  /** After an update or an icon-only row: record who owns the icon now, and fill a placeholder icon if still allowed. */
  async #writeImportIcon(row,current,doc,log) {
    try {
      // The package gave the document its own authored icon: Manager no longer owns it.
      const authoredImg=row.kind==='Actor'?current.patch?.fields?.img:current.patch?.img;
      if(typeof authoredImg==='string') await doc.update(iconFlagUpdate(MODULE_ID,{img:authoredImg,source:'authored'}));
      if(!row.icon?.existing) return;
      const record=this.pkg.records.find(r=>r.id===row.id);
      const decision=existingIconDecision({recordImg:record?.foundry?.data?.img,docImg:doc.img,flags:doc.flags?.[MODULE_ID],repick:this.repickIcons,smart:this.smartIcons});
      if(!decision.fill){log.results.push({id:row.id,action:'icon',status:'note',message:'Icon kept: it was changed in Foundry after the preview.'});return;}
      await doc.update({img:row.icon.img,...iconFlagUpdate(MODULE_ID,{img:row.icon.img,source:row.icon.source})});
      log.results.push({id:row.id,action:'icon',status:'note',uuid:doc.uuid,icon:row.icon.img,message:`Icon set to ${row.icon.img} (${row.icon.reason}).`});
    } catch(error) {log.results.push({id:row.id,action:'icon',status:'error',message:`Icon not changed: ${error?.message??error}`});}
  }
  #previewRows() {
    let thumbs=0;
    return this.preview.map(row=>{
      const i=row.icon;
      const icon=i?{...i,thumb:!i.pending&&thumbs++<ICON_THUMBS,changed:this.iconOverrides.has(row.id),
        label:i.pending?'Indexing icons…':this.iconOverrides.has(row.id)?'your choice':i.source==='smart'?(ICON_CONFIDENCE[i.confidence]??'match'):'generic icon',
        note:i.pending?'A generic icon for now; the pick appears when indexing finishes.':this.iconOverrides.has(row.id)?'Chosen with Change…':i.source==='smart'?`${i.existing?'Replaces a placeholder icon; ':''}${i.reason}.`:'No fitting icon found in the library.'}:null;
      return {...row, icon, selected:this.selected.has(row.id), canSelect: actionAllowed.has(row.action), badge:capitalize(row.action), badgeTone:ACTION_TONE[row.action]??''};
    });
  }
  #iconIndexText() {
    const st=iconIndexer().status();
    if(st.state==='indexing') return 'Indexing icons…';
    if(st.state==='failed') return st.message;
    if(st.state==='ready') return `Foundry's icon library: ${st.message}`;
    return '';
  }
  #iconStatusText() {
    return this.smartIcons?this.#iconIndexText():'Smart icons are off: records without an icon get a generic one.';
  }
  /** Called by the icon indexer when its state changes. */
  noteIconIndex(status) {
    if(status?.state==='indexing'){this.element?.querySelectorAll?.('[data-ag-icon-status]').forEach(el=>{el.textContent='Indexing icons…';});return;}
    if(this.pkg&&this.preview.length) this.#assignIcons();
    if(this.iconScanWanted){this.iconScanWanted=false;this.#scanIcons();}
    if(this.rendered&&!this.busy) void this.render();
  }
  /** Items → Checks → Improve icons: world Items and Actors with a placeholder icon, and a suggestion for each. */
  #scanIcons() {
    const index=iconIndexer().index;
    const rows=scanIconDocuments([...(game.items?.contents??[]),...(game.actors?.contents??[])],index);
    const suggested=rows.filter(r=>r.img).length;
    this.iconScan={rows};
    this.iconMessage=rows.length?`${rows.length} world Item(s) and Actor(s) have a placeholder icon; ${suggested} have a suggestion${index?'':' (the icon library could not be read, so pick icons with Change…)'}. Player characters start unticked. Nothing has changed yet.`
      :'No world Item or Actor has a placeholder icon. Nothing changed.';
  }
  #iconScanContext() {
    const undo=game.settings.get(MODULE_ID,ICON_UNDO_SETTING);
    const rows=this.iconScan?.rows??[];
    let thumbs=0;
    const view=r=>({...r,thumb:thumbs++<ICON_THUMBS,kindLabel:capitalize(r.type||r.documentName),
      label:r.img?(r.source==='authored'?'your choice':ICON_CONFIDENCE[r.confidence]??''):'',noPick:!r.img,
      reasonText:r.source==='authored'?'Chosen with Change…':r.reason});
    const groups=['Item','Actor'].map(kind=>({label:kind==='Item'?'Items':'Actors',rows:rows.filter(r=>r.documentName===kind).map(view)})).filter(g=>g.rows.length);
    return {scan:Boolean(this.iconScan),groups,count:rows.length,ticked:rows.filter(r=>r.checked&&r.img).length,
      running:Boolean(this.iconAbort),pct:this.iconPct,message:this.iconMessage,status:this.#iconIndexText(),
      hasUndo:Boolean(undo?.applied?.length),undoCount:undo?.applied?.length??0};
  }
  #pickIcon(current,done) {
    const FP=filePickerClass();
    if(!FP) return toast('Foundry\'s file picker is not available here.',true);
    new FP({type:'image',current:current??'',callback:path=>done(path)}).render(true);
  }
  async #iconAction(name) {
    if(!game.user?.isGM) throw new Error('Only a GM can change icons.');
    const getDoc=uuid=>(globalThis.fromUuidSync??foundry.utils.fromUuidSync)?.(uuid)??null;
    const updateMany=(documentName,updates)=>({Item:globalThis.Item,Actor:globalThis.Actor})[documentName].updateDocuments(updates);
    const ticked=()=>(this.iconScan?.rows??[]).filter(r=>r.checked&&r.img);
    const say=(text,error=false)=>{this.iconMessage=text;toast(text,error);};
    switch(name){
      case 'icons-scan': {
        const st=iconIndexer().status();
        if(!iconIndexer().index&&st.state!=='failed'){
          this.iconScanWanted=true;this.iconScan=null;
          this.iconMessage='Indexing icons… The list appears when it is ready (the first time on The Forge this can take a minute).';
          void iconIndexer().ensure();break;
        }
        this.#scanIcons();break;
      }
      case 'icons-reindex': iconIndexer().reset();this.iconScanWanted=Boolean(this.iconScan);this.iconMessage='Rebuilding the icon index…';void iconIndexer().ensure();break;
      case 'icons-cancel': this.iconScan=null;this.iconMessage='Icon list cleared. Nothing changed.';break;
      case 'icons-backup': {
        const rows=ticked();
        if(!rows.length)return say('Tick at least one icon to change first.',true);
        downloadJson(`AG_Icon_Backup_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`,iconBackup(rows,getDoc,MODULE_ID));
        say(`Downloaded the current icons of the ${rows.length} ticked document(s). Nothing changed.`);break;
      }
      case 'icons-apply': {
        const rows=ticked();
        if(!rows.length)return say('Nothing is ticked.',true);
        const yes=await confirmDialog(`Change the icons of ${rows.length} world document(s) to the ones shown?\nOnly placeholder icons are replaced; a document whose icon changed since the list was made is skipped. Undo last icon change puts this run back.`,
          {title:'Change icons?',yes:`Change ${rows.length} icon(s)`});
        if(!yes)return;
        this.iconAbort=new AbortController();this.iconPct=0;this.busy=true;
        await this.render();
        const progress=({done,total})=>{this.iconPct=total?done/total:1;
          const el=this.element?.querySelector('[data-ag-icons-status]');if(el)el.textContent=`Changed ${done} of ${total}…`;
          const bar=this.element?.querySelector('[data-ag-icons-bar]');if(bar)bar.value=this.iconPct;};
        try{
          const out=await applyIconChanges(rows,{user:game.user,moduleId:MODULE_ID,getDoc,updateMany,signal:this.iconAbort.signal,onProgress:progress});
          if(out.applied.length) await game.settings.set(MODULE_ID,ICON_UNDO_SETTING,{at:new Date().toISOString(),applied:out.applied});
          this.iconScan=null;
          say(`${out.message}${out.applied.length?' Undo last icon change puts them back.':''}`,!out.ok);
        }finally{this.busy=false;this.iconAbort=null;}
        break;
      }
      case 'icons-undo': {
        const undo=game.settings.get(MODULE_ID,ICON_UNDO_SETTING);
        if(!undo?.applied?.length)return say('There is no icon change to undo.',true);
        const yes=await confirmDialog(`Put back the ${undo.applied.length} icon(s) changed on ${new Date(undo.at).toLocaleString()}?\nAn icon changed again since then is left as it is.`,{title:'Undo last icon change?',yes:'Undo icon change'});
        if(!yes)return;
        this.busy=true;
        try{
          const out=await undoIconChanges(undo,{user:game.user,moduleId:MODULE_ID,getDoc,updateMany});
          if(out.ok) await game.settings.set(MODULE_ID,ICON_UNDO_SETTING,{});
          this.iconScan=null;say(out.message,!out.ok);
        }finally{this.busy=false;}
        break;
      }
    }
    await this.render();
  }
  /** Icon options, Change… buttons and the Improve icons list (0.47.0). */
  #bindIcons(root) {
    root.querySelector('[data-ag-smart-icons]')?.addEventListener('change',event=>{
      if(this.busy)return;
      this.smartIcons=this.ui.set('smartIcons',event.target.checked);
      if(this.smartIcons&&this.pkg) void iconIndexer().ensure();
      this.#assignIcons();this.focusAfterRender='[data-ag-smart-icons]';void this.render();
    });
    root.querySelector('[data-ag-repick-icons]')?.addEventListener('change',event=>{
      if(this.busy)return;
      this.repickIcons=event.target.checked;
      if(this.repickIcons) void iconIndexer().ensure();
      this.#assignIcons();this.focusAfterRender='[data-ag-repick-icons]';void this.render();
    });
    root.querySelectorAll('[data-ag-icon-change]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();if(this.busy)return;
      const id=el.dataset.agIconChange, row=this.preview.find(r=>r.id===id);
      this.#pickIcon(row?.icon?.img,path=>{
        if(!path)return;
        this.iconOverrides.set(id,path);this.#assignIcons();this.focusAfterRender=`[data-ag-icon-change="${CSS.escape(id)}"]`;void this.render();
      });
    }));
    root.querySelectorAll('[data-ag-icon-reset]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();if(this.busy)return;
      const id=el.dataset.agIconReset;
      this.iconOverrides.delete(id);this.#assignIcons();this.focusAfterRender=`[data-ag-icon-change="${CSS.escape(id)}"]`;void this.render();
    }));
    // Ticks: no re-render (the list can be long), just the counter and the buttons that need ticks.
    const count=()=>{const n=(this.iconScan?.rows??[]).filter(r=>r.checked&&r.img).length;
      root.querySelectorAll('[data-ag-icons-count]').forEach(el=>{el.textContent=String(n);});
      root.querySelectorAll('[data-ag-icons-needs-ticks]').forEach(el=>{el.disabled=!n||Boolean(this.iconAbort);});};
    root.querySelectorAll('[data-ag-icons-tick]').forEach(el=>el.addEventListener('change',event=>{
      const row=this.iconScan?.rows.find(r=>r.uuid===el.dataset.agIconsTick);if(row)row.checked=event.target.checked;count();
    }));
    root.querySelectorAll('[data-ag-icons-change]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();if(this.busy)return;
      const row=this.iconScan?.rows.find(r=>r.uuid===el.dataset.agIconsChange);if(!row)return;
      this.#pickIcon(row.img??row.from,path=>{
        if(!path)return;
        Object.assign(row,{img:path,source:'authored',reason:'Chosen with Change…',confidence:'none',checked:true});
        this.focusAfterRender=`[data-ag-icons-change="${CSS.escape(row.uuid)}"]`;void this.render();
      });
    }));
    // Not a data-ag-action: those are ignored while busy, and Cancel must work while the changes are written.
    root.querySelector('[data-ag-icons-stop]')?.addEventListener('click',event=>{
      event.preventDefault();if(!this.iconAbort)return;
      this.iconAbort.abort();event.currentTarget.disabled=true;
      const el=root.querySelector('[data-ag-icons-status]');if(el)el.textContent='Cancelling after the current chunk…';
    });
  }
  #exportPreview() {
    const report = {generated_at:new Date().toISOString(), manifest:this.pkg?.manifest ?? (this.specialist?{specialist:SPECIALISTS[this.specialist.kind].label}:null), errors:this.errors, warnings:this.warnings, module_links:this.moduleLinks??[], preview:this.preview.map(({id, name, kind, detail, lifecycle, action, reason, patch, changes, effects, icon})=>({id,name,kind,detail:detail||undefined,lifecycle,action,reason,patch,changes,effects:effects?.rows??undefined,
      icon:icon?{img:icon.img,source:icon.source,reason:icon.reason}:undefined}))};
    downloadJson("ag-import-preview.json",report);
  }
  async #tagSelected() {
    if (!game.user.isGM) throw new Error("GM access required.");
    if (!CAPTURE_TYPES.includes(this.captureKind)) throw new Error("Choose a valid classification.");
    const docs=[...this.captureSelected].map(id=>game.items.get(id)).filter(Boolean);
    if (!docs.length) return toast("Select at least one world Item to tag.");
    const yes=await confirmDialog(`Tag ${docs.length} world Items as ${this.captureKind} candidates?\nThis adds only a private module flag. It does not change the Item rules, make it canonical, or link it to a GitHub record. Re-tagging updates the classification but keeps the capture tag.`,
      {title:'Tag Items for review?',yes:'Tag Items'});
    if (!yes) return;
    this.busy=true;
    let tagged=0, failures=0;
    try {
      for (const doc of docs) {
        try {
          const previous=captureOf(doc);
          await doc.setFlag(MODULE_ID,"capture",{
            captureId:previous?.captureId ?? `AGCAP-${foundry.utils.randomID()}`,
            entityType:this.captureKind,
            reviewStatus:"unreviewed",
            taggedAt:previous?.taggedAt ?? new Date().toISOString()
          });
          tagged++;
        } catch(err) {console.error(`[${MODULE_ID}] tag failed: ${doc.name}`,err);failures++;}
      }
    } finally {this.busy=false;this.captureSelected.clear();}
    this.captureMessage=`Tagged ${tagged} Item(s); ${failures} failure(s). Changes are metadata flags only.`;
    toast(this.captureMessage,Boolean(failures));await this.render();
  }
  async #untagSelected() {
    if (!game.user.isGM) throw new Error("GM access required.");
    const docs=[...this.captureSelected].map(id=>game.items.get(id)).filter(doc=>doc&&captureOf(doc));
    if (!docs.length) return toast("No tagged world Items selected.");
    const yes=await confirmDanger(`Remove the review tags from ${docs.length} world Items?\nItem contents and imported source bindings stay unchanged. Removing a tag discards its local capture tag; tagging again later starts a new one.`,
      {title:'Remove recovery tags?',yes:'Remove tags'});
    if (!yes) return;
    this.busy=true;let done=0,failures=0;
    try {for (const doc of docs) {try{await doc.unsetFlag(MODULE_ID,"capture");done++;}catch(err){failures++;console.error(`[${MODULE_ID}] untag failed`,err);}}}
    finally{this.busy=false;this.captureSelected.clear();}
    this.captureMessage=`Removed ${done} recovery tags; ${failures} failure(s).`;
    toast(this.captureMessage,Boolean(failures));await this.render();
  }
  async #exportCaptures() {
    if (!game.user.isGM) throw new Error("GM access required.");
    // Export ALL tagged world Items, regardless of the filter or selection currently displayed.
    const tagged=game.items.contents.filter(doc=>captureOf(doc));
    if (!tagged.length) return toast("No tagged world Items to export.");
    const yes=await confirmDialog(`Download a JSON review package containing ${tagged.length} tagged world Items?\nThe export contains rules text, descriptions, system data, effects, images and other modules' Item flags. Review it for GM secrets and third-party material before sharing. This does not publish to GitHub and does not mark any Item as approved.`,
      {title:'Export tagged Items for review?',yes:'Export Items'});
    if(!yes)return;
    const pack=buildCapturePackage(tagged.map(doc=>({
      id:doc.id,uuid:doc.uuid,capture:captureOf(doc),source:sourceFlag(doc),raw:doc.toObject()
    })),{worldId:game.world?.id??null});
    const stamp=new Date().toISOString().slice(0,10);
    downloadJson(`ashen-gate-tagged-items-${stamp}.json`,pack);
    this.captureMessage=`Exported ${pack.records.length} tagged world Items for review. No world content changed.`;
    await this.render();toast(this.captureMessage);
  }
  /** `auto` (ZIP auto mode only): the GM opted out of the confirmation dialogs; every check, backup and log still runs. */
  async #apply({auto=false}={}) {
    if (!game.user.isGM) throw new Error("Only a GM may import content.");
    if (this.specialist) return this.#applySpecialist({auto});
    if (!this.pkg || this.errors.length) throw new Error("Load a validated package first.");
    const targetRows = this.preview.filter(row => actionAllowed.has(row.action) && this.selected.has(row.id));
    const blocked=(message,fix)=>{this.importReports=pushReport(this.importReports,buildBlockedReport({file:this.packageSource??this.pkg.manifest.package_id,message,fix}));};
    if (!targetRows.length) {blocked('No records were selected, so nothing was imported.','Press Select eligible (or tick records) in the preview, then Apply.');this.message='Nothing selected: nothing was imported. See the result below.';await this.render();return;}
    const missing=selectionIssues(this.pkg.records,targetRows.map(r=>r.id),withLocationIds(existingSourceIndex(),locationsApi(game)).keys());
    if (missing.length) {this.errors=missing;blocked(`Selected records have missing required dependencies: ${missing.slice(0,3).join(' ')}`,'Select the records they depend on too, or import the file that contains them first.');this.message='Selected records have missing required dependencies; no changes made.';await this.render();return;}
    const eligibleIds=new Set([...targetRows.map(r=>r.id),...existingSourceIndex().keys()]);
    const markerProblems=[];
    for(const row of targetRows) {
      const rec=this.pkg.records.find(r=>r.id===row.id);
      for(const id of markerTargets(rec)) {
        if(!eligibleIds.has(id)) markerProblems.push(`${row.id}: AGREF ${id} is not selected or present in the world.`);
        const already=foundDocuments(id);
        if(already.length>1) markerProblems.push(`${row.id}: AGREF ${id} matches ${already.length} existing documents (ambiguous).`);
      }
    }
    if(markerProblems.length){this.errors=markerProblems;blocked(`Source markers need their targets: ${markerProblems.slice(0,3).join(' ')}`,'Select the target records too, or import them first, then apply again.');this.message='Source markers need all their targets; no documents were imported.';await this.render();return;}
    const pendingGraph=dependencyOrder(this.pkg.records.filter(r=>targetRows.some(row=>row.id===r.id)));
    const cycleNotice=pendingGraph.cycles.length ? `${pendingGraph.cycles.length} circular reference path(s). These are allowed because the Manager stores stable Ashen Gate ids. If a required target fails to create, its references are not finalized and the error is logged.` : '';
    const locRows=targetRows.filter(r=>r.kind==='Location');
    const routeRows=targetRows.filter(r=>r.kind==='Route');
    const shopRows=targetRows.filter(r=>isShopRecord({entity_type:r.kind}));
    const docRows=targetRows.filter(r=>r.kind!=='Location'&&r.kind!=='Route'&&!isShopRecord({entity_type:r.kind}));
    const actorUpdates=docRows.filter(r=>r.kind==='Actor'&&r.action==='update');
    const wantsScriptMacros=targetRows.some(r=>this.pkg.records.find(rec=>rec.id===r.id)?.foundry?.document_type==='Macro' && this.pkg.records.find(rec=>rec.id===r.id)?.foundry?.data?.type==='script');
    const decision = auto || await confirmDialog(`${docRows.length} document(s)${locRows.length?` and ${locRows.length} location(s) (passed to Locations, after the documents)`:''}${routeRows.length?` and ${routeRows.length} route(s) (passed to Locations, after the locations)`:''}${shopRows.length?` and ${shopRows.length} shop(s), service(s) or merchant list(s) (passed to Utilities, after the Items)`:''} will be created or updated in this world.${cycleNotice?`\n${cycleNotice}`:''}\nBack up your world first. If anything fails part way, the changes already made stay.\nActors: ${actorUpdates.length?`${actorUpdates.length} existing Actor(s) will have their definition updated (you confirm this separately next).`:'only new NPC/character definitions; existing Actors are not changed.'} HP, XP, level, conditions and player items are never replaced.${wantsScriptMacros?' Warning: this import installs untrusted Script Macro source as GM-only, but never runs it.':''}\n${this.uploadZipArtwork&&this.zipMedia.size?`${this.zipMedia.size} bundled assets may be uploaded to the current world before importing documents.`:'ZIP artwork will not be uploaded. If actor images reference missing world paths, upload them manually.'}`,
      {title:'Apply this import to the world?',yes:'Import'});
    if (!decision) return;
    if (actorUpdates.length && !auto) {
      const list=actorUpdates.map(r=>`• ${r.name}: ${r.changes.join('; ')}`).join('\n');
      const sure=await confirmDanger(`This changes ${actorUpdates.length} Actor(s) already in your world. Only the listed definition fields and package items change. HP, XP, level, conditions, player-added items, notes, ownership, folders and other modules' data are kept.\n${list}\nA JSON backup of these Actors downloads automatically before anything is written.`,
        {title:'Update existing Actors?',yes:`Update ${actorUpdates.length} existing Actor(s)`});
      if (!sure) return;
    }
    this.applyRan=true;
    this.busy=true;
    await this.render();
    // 0.45.0: rename an old Manager-made "Powers" folder first, so this import files into it instead of making a second one.
    await runFolderRenames();
    const log = {at:new Date().toISOString(), packageId:this.pkg.manifest.package_id, packageVersion:this.pkg.manifest.version, results:[]};
    let originalMediaPaths=new Map();
    try {
      // Revalidate just before writing. Re-check every target against current Foundry state.
      const externalIds = withLocationIds(existingSourceIndex(), locationsApi(game));
      const issues = validatePackage(this.pkg, externalIds);
      issues.push(...cinderDefinitionChecks(game, this.pkg.records).errors);
      issues.push(...modifierDefinitionChecks(game, this.pkg.records).errors);
      issues.push(...selectionIssues(this.pkg.records,targetRows.map(r=>r.id),externalIds.keys()));
      if (issues.length) throw new Error(`Package validation changed: ${issues.join("; ")}`);
      if(this.uploadZipArtwork && this.zipMedia.size) {
        // Fail before creating Actors if media storage is unavailable. A failed upload is reported clearly.
        const base=`worlds/${game.world.id}/ashen-gate-imports/${this.pkg.manifest.package_id.toLowerCase().replace(/[^a-z0-9-]/g,'-')}`;
        originalMediaPaths=await uploadMatchingArt(this.zipMedia,targetRows.map(row=>this.pkg.records.find(r=>r.id===row.id)),base,entry=>log.results.push(entry));
      }
      const graph=dependencyOrder(this.pkg.records);
      // Circular links are legitimate in the stable-ID model. Selection and type checks
      // have already run; post-import reconciliation verifies actual created targets.
      const ordered=graph.order.map(id=>docRows.find(row=>row.id===id)).filter(Boolean);
      const before=ordered.filter(r=>r.action==='update').map(row=>foundDocuments(row.id)[0]).filter(Boolean);
      if(before.length) this.#downloadSnapshots(before,`before-import-${Date.now()}`);
      const plans=new Map();
      for (const row of ordered) {
        const record = this.pkg.records.find(r=>r.id===row.id);
        const {plan:current,docs}=planDocument(record,this.pkg,this);
        plans.set(row.id,current);
        if (current.action !== (row.baseAction ?? row.action) || canonical(current.patch ?? {}) !== canonical(row.patch ?? {}) || canonical(current.effects?.rows ?? []) !== canonical(row.effects?.rows ?? [])) {
          log.results.push({id:row.id, status:"skipped", message:"Foundry state changed since preview; preview again."});
          continue;
        }
        try {
          const present=new Set(existingSourceIndex().keys());
          present.add(record.id);
          for (const child of record.resource_opportunities??[]) present.add(child.id);
          // Never mutate the canonical source record. Only the Foundry write copy gets uploaded asset paths.
          const adapted=adaptRecordArtwork(record,originalMediaPaths);
          const doc = row.action==="icon" ? docs[0]
            : row.action==="create" ? await createRecord(adapted, this.pkg, present, entry=>log.results.push({...entry,id:entry.id??row.id}),{planned:row.icon&&!row.icon.pending?row.icon:null,smart:this.smartIcons})
            : row.kind==='Actor' ? await applyActorUpdate(docs[0],current,{user:game.user,source:sourceMetadata(record,this.pkg,present)})
            : await updateRecord(record,this.pkg,docs[0],current.patch,present);
          if (!doc) throw new Error("Foundry did not return a saved document.");
          if (row.action!=="icon") log.results.push({id:row.id, action:row.action, status:"ok", uuid:doc.uuid});
          if (row.action!=="create") await this.#writeImportIcon(row,current,doc,log);
          if(row.kind==='Item'&&current.effects) {
            const made=row.action==='create'?{created:current.effects.counts.create,updated:0}:await applyItemEffects(doc,current.effects,{user:game.user});
            const kept=current.effects.counts?.kept??0, hand=current.effects.counts?.handmade??0;
            log.results.push({id:row.id,action:'item-effects',status:'note',message:`Effects: ${made.created} created, ${made.updated} updated, ${kept} kept${hand?`, ${hand} made in Foundry left alone`:''}.`});
          }
        } catch(error) {
          console.error(`[${MODULE_ID}] Import of ${row.id} failed`, error);
          log.results.push({id:row.id, action:row.action, status:"error", message:String(error.message ?? error)});
        }
      }
      // Locations come after every document so Material and Quest ids they mention already exist.
      if(locRows.length) log.results.push(...await applyLocations(locRows.map(row=>this.pkg.records.find(r=>r.id===row.id)),locationsApi(game),{updateExisting:this.updateExisting}));
      // Routes come after the locations they join (Locations checks every endpoint exists).
      if(routeRows.length) log.results.push(...await applyRoutes(routeRows.map(row=>this.pkg.records.find(r=>r.id===row.id)),routesApi(game),{updateExisting:this.updateExisting}));
      // Shops, services and merchant lists come after the Items their lines sell (Utilities finds them by permanent id).
      if(shopRows.length) log.results.push(...await applyShops(shopRows.map(row=>this.pkg.records.find(r=>r.id===row.id)),shopsApi(game),{updateExisting:this.updateExisting}));
      // Complete-world UUID index: only actual saved documents are addressable.
      // Resolve after the *whole* batch; record order and reference cycles do not matter.
      const uuidIndex=buildUuidIndex(allBoundDocuments());
      // 0.44.3: Locations, Renown, Quest Log, Headquarters and Utilities records are asked of their own module's API.
      const moduleRecord=moduleRecordLookup(game);
      for(const row of ordered) {
        if(!log.results.some(r=>r.id===row.id && ['create','update','metadata'].includes(r.action) && r.status==='ok')) continue;
        const record=this.pkg.records.find(r=>r.id===row.id);
        const doc=foundDocuments(row.id)[0];
        if(!doc) continue;
        const {bindings,issues,moduleLinks}=resolveTypedRefs(record.refs,uuidIndex,[],moduleRecord);
        for(const issue of issues) log.results.push({id:row.id,action:'link-sync',status:issue.level==='error'?'error':issue.level==='info'?'note':'warning',message:issue.message});
        if(moduleLinks.length) log.results.push({id:row.id,action:'link-sync',status:'note',message:`Linked by permanent id to ${moduleLinks.map(l=>`${l.module} record ${l.target_id}`).join(', ')}.`});
        const updates={};
        const missingRequired=issues.filter(i=>i.level==='error').map(i=>i.id);
        const source=sourceFlag(doc)??{};
        const currentIds=new Set(uuidIndex.keys());
        updates[`flags.${MODULE_ID}.source.refs`]=projectedReferences(record.refs,currentIds);
        const newFields={...(source.managedFields??{})};
        updates[`flags.${MODULE_ID}.source.resolvedUuidRefs`]=bindings;
        updates[`flags.${MODULE_ID}.source.unresolvedRequiredRefs`]=missingRequired;
        updates[`flags.${MODULE_ID}.source.unresolvedOptionalRefs`]=issues.filter(i=>i.level==='warning'||i.level==='info').map(i=>i.id);
        // Only source-provided rich-text paths receive AGREF substitution.
        // Add a small reference section for canonical refs without explicit markers.
        if(doc.documentName==='Item') {
          const original=record.foundry.data?.system?.description?.value;
          if(typeof original==='string' || bindings.length) {
            const linked=resolveRichText(typeof original==='string'?original:'',uuidIndex);
            const final=appendReferenceBlock(linked.text,bindings,linked.resolved);
            for(const issue of linked.issues) log.results.push({id:row.id,action:'rich-text-link',status:'error',message:issue.message});
            if(doc.system?.description?.value!==final) updates['system.description.value']=final;
            newFields['system.description.value']=final;
            log.results.push({id:row.id,action:'rich-text-link',status:'ok',resolved:linked.resolved.length,added:bindings.length-bindings.filter(b=>linked.resolved.includes(b.target_id)).length});
          }
        } else if(doc.documentName==='Actor') {
          // An updated Actor keeps its biography (GM notes); only Items this run created or changed are re-linked.
          const created=row.action==='create', touched=new Set(plans.get(row.id)?.patch?.touched??[]);
          const keys=itemKeys(record.foundry.data?.items??[]);
          const bio=record.foundry.data?.system?.details?.biography?.value;
          if(created && typeof bio==='string') {
            const resolved=resolveRichText(bio,uuidIndex);
            updates['system.details.biography.value']=appendReferenceBlock(resolved.text,bindings,resolved.resolved);
            for(const issue of resolved.issues)log.results.push({id:row.id,action:'actor-bio-link',status:'error',message:issue.message});
          }
          for(const [i,sourceItem] of (record.foundry.data?.items??[]).entries()) {
            if(!created&&!touched.has(keys[i])) continue;
            const html=sourceItem.system?.description?.value, embedded=doc.items?.contents?.find(it=>it.getFlag?.(MODULE_ID,ITEM_FLAG)===keys[i]);
            if(typeof html!=='string'||!embedded) continue;
            const resolved=resolveRichText(html,uuidIndex);
            for(const issue of resolved.issues)log.results.push({id:row.id,action:'actor-item-link',status:'error',message:issue.message});
            if(embedded.system?.description?.value!==resolved.text) try{await embedded.update({'system.description.value':resolved.text});}catch(e){log.results.push({id:row.id,action:'actor-item-link',status:'error',message:String(e.message??e)});}
          }
        } else if(doc.documentName==='RollTable') {
          const text=record.foundry.data?.description;
          if(typeof text==='string') {
            const resolved=resolveRichText(text,uuidIndex);
            updates.description=appendReferenceBlock(resolved.text,bindings,resolved.resolved);
            for(const issue of resolved.issues)log.results.push({id:row.id,action:'table-link',status:'error',message:issue.message});
          }
        } else if(doc.documentName==='JournalEntry') {
          const pages=record.foundry.data?.pages??[];
          for(const [pi,pageDef] of pages.entries()) {
            const page=doc.pages?.contents?.[pi];
            if(!page || typeof pageDef.text?.content!=='string') continue;
            const linked=resolveRichText(pageDef.text.content,uuidIndex);
            const final=pi===0 ? appendReferenceBlock(linked.text,bindings,linked.resolved) : linked.text;
            for(const issue of linked.issues) log.results.push({id:row.id,action:'rich-text-link',status:'error',message:issue.message});
            try{
              if(page.text?.content!==final) await page.update({'text.content':final});
              log.results.push({id:row.id,action:'rich-text-link',status:'ok',page:page.name,resolved:linked.resolved.length});
            }catch(e){log.results.push({id:row.id,action:'rich-text-link',status:'error',message:`Page ${page.name}: ${e.message??e}`});}
          }
        }
        updates[`flags.${MODULE_ID}.source.managedFields`]=newFields;
        try{
          await doc.update(updates);
          if(bindings.length) log.results.push({id:row.id,action:'uuid-bind',status:'ok',bindings:bindings.length});
        }catch(e){log.results.push({id:row.id,action:'link-sync',status:'error',message:`UUID binding update failed: ${e.message??e}`});}
      }
      const prior=game.settings.get(MODULE_ID,"importHistory") ?? [];
      await game.settings.set(MODULE_ID,"importHistory",[...prior,log].slice(-40));
      const created=log.results.filter(r=>r.status==="ok"&&r.action==="create").length;
      const updated=log.results.filter(r=>r.status==="ok"&&r.action==="update").length;
      const refreshed=log.results.filter(r=>r.status==="ok"&&r.action==="metadata").length;
      const errors=log.results.filter(r=>r.status==="error").length;
      const skipped=log.results.filter(r=>r.status==="skipped").length;
      const folders=log.results.filter(r=>r.action==='folder-created'&&r.status==='ok').length;
      const icons=log.results.filter(r=>r.action==='icon-fallback'&&r.status==='ok').length;
      const smartIcons=log.results.filter(r=>['icon-smart','icon'].includes(r.action)&&['ok','note'].includes(r.status)).length;
      const links=log.results.filter(r=>r.action==='uuid-bind'&&r.status==='ok').reduce((a,r)=>a+(r.bindings??0),0);
      const locOk=log.results.filter(r=>r.kind==='Location'&&r.status==='ok').length;
      const locSkipped=log.results.filter(r=>r.kind==='Location'&&r.status==='skipped').length;
      const rteOk=log.results.filter(r=>r.kind==='Route'&&r.status==='ok').length;
      const rteBad=log.results.filter(r=>r.kind==='Route'&&r.status!=='ok').length;
      const shopOk=log.results.filter(r=>isShopRecord({entity_type:r.kind})&&r.status==='ok').length;
      const shopBad=log.results.filter(r=>isShopRecord({entity_type:r.kind})&&r.status!=='ok').length;
      const locNote=(locOk||locSkipped?` (${locOk} location(s) imported${locSkipped?`, ${locSkipped} location(s) skipped: see History for reasons`:''})`:'')
        +(rteOk||rteBad?` (${rteOk} route(s) imported${rteBad?`, ${rteBad} route(s) skipped or failed: see the result panel`:''})`:'')
        +(shopOk||shopBad?` (${shopOk} shop record(s) imported${shopBad?`, ${shopBad} skipped or failed: see the result panel`:''})`:'');
      this.message=`Import results: ${created} created, ${updated} updated, ${folders} folders, ${smartIcons} chosen icons, ${icons} generic icons, ${links} UUID links, ${errors} errors, ${skipped} skipped${locNote}. Review History.`;
      toast(this.message,Boolean(errors));
    } catch(error) {
      const message=String(error?.message??error);
      log.results.push({action:'import-aborted',status:'error',message});
      const prior=game.settings.get(MODULE_ID,'importHistory')??[];
      await game.settings.set(MODULE_ID,'importHistory',[...prior,log].slice(-40));
      this.message=`Import aborted: ${message}. See the result below; any earlier successful writes may remain.`;
      toast(this.message,true);
    } finally {
      this.busy=false;
      await this.#preview();
      // #preview replaces message; restore result message from last history entry.
      const saved=game.settings.get(MODULE_ID,"importHistory") ?? [];
      const last=saved.at(-1);
      if (last?.at===log.at) {
        const okay=last.results.filter(x=>x.status==='ok'&&['create','update','metadata'].includes(x.action)).length;
        const bad=last.results.filter(x=>x.status==="error").length;
        const folders=last.results.filter(x=>x.action==='folder-created'&&x.status==='ok').length;
        const links=last.results.filter(x=>x.action==='uuid-bind'&&x.status==='ok').reduce((a,x)=>a+(x.bindings??0),0);
        const chosen=last.results.filter(x=>(x.action==='icon-smart'&&x.status==='ok')||(x.action==='icon'&&x.status==='note'&&x.icon)).length;
        const locOk=last.results.filter(x=>x.kind==='Location'&&x.status==='ok').length;
        const locSkipped=last.results.filter(x=>x.kind==='Location'&&x.status==='skipped').length;
        const rteOk=last.results.filter(x=>x.kind==='Route'&&x.status==='ok').length;
        const rteBad=last.results.filter(x=>x.kind==='Route'&&x.status!=='ok').length;
        const shopOk=last.results.filter(x=>isShopRecord({entity_type:x.kind})&&x.status==='ok').length;
        const shopBad=last.results.filter(x=>isShopRecord({entity_type:x.kind})&&x.status!=='ok').length;
        const locText=(locOk||locSkipped?` ${locOk} location(s) imported${locSkipped?`, ${locSkipped} skipped (reasons in History)`:''}.`:'')
          +(rteOk||rteBad?` ${rteOk} route(s) imported${rteBad?`, ${rteBad} skipped or failed (reasons below)`:''}.`:'')
          +(shopOk||shopBad?` ${shopOk} shop record(s) imported${shopBad?`, ${shopBad} skipped or failed (reasons below)`:''}.`:'');
        this.message=`Imported ${okay} document(s), created ${folders} folder(s), bound ${links} reference(s)${chosen?`, chose ${chosen} icon(s)`:''}; ${bad} error(s).${locText} Details are in the result panel below.`;
        this.importReports=pushReport(this.importReports,buildImportReport({file:this.packageSource??log.packageId,at:log.at,results:last.results,
          names:new Map(this.pkg?.records?.map(r=>[r.id,r.name??r.id])??[])}));
        await this.render();
      }
    }
  }
  #downloadSnapshots(docs,label='snapshot') {
    const pack={schema_version:'ag-foundry-snapshot/0.3',created_at:new Date().toISOString(),
      reason:label,world_id:game.world?.id??null,
      documents:docs.map(docManagerSnapshot)};
    downloadJson(`ag-${label}.json`,pack);
    return pack;
  }
  #visibleLibraryRows() {
    const {browser}=this.#libraryBrowser();
    return browser.rows.slice(this.libraryPage*this.libraryPageSize,(this.libraryPage+1)*this.libraryPageSize);
  }
  /** Shared filters without the search text (search is matched by the Browse query parser). */
  #sharedFilters() {const {query,...rest}=this.itemFilters;return rest;}
  /** The Items tab selection (0.36.0): every Browse entry matching the shared search and filters, unpaged. */
  #selection() {return filterEntries(browse().getIndex(),{query:this.itemFilters.query,shared:this.#sharedFilters()});}
  /** uuids/keys in the selection, or null when no shared filter is on (then nothing is narrowed). */
  #selectionKeys() {
    if(!activeFilterCount(this.itemFilters))return null;
    return new Set(this.#selection().flatMap(e=>[e.key,e.uuid].filter(Boolean)));
  }
  /** Ashen Gate records narrowed by the shared filters, then by Library's own system/status/package/archived filters. */
  #libraryBrowser() {
    const all=this.managedRows(), keys=this.#selectionKeys();
    const rows=keys?all.filter(r=>keys.has(r.uuid)):all;
    const browser=browseLibrary(rows,{search:'',system:this.librarySystem,status:this.libraryStatus,package:this.libraryPackage,showArchived:this.libraryShowArchived});
    browser.rows=orderLibraryRows(browser.rows);
    return {all,rows,browser};
  }
  /** Source, type, origin, rarity, folder and core_ref controls shared by every Items rail entry. */
  #filterBarContext() {
    const f=this.itemFilters;
    const opt=(value,label,extra={})=>({value,label,selected:String(f[extra.key])===String(value),...extra});
    const packs=[...(game.packs?.contents??game.packs?.values?.()??[])].filter(p=>ORGANIZE_TYPES.includes(p.documentName)&&p.visible!==false);
    const pack=f.source!=='all'&&f.source!=='world'?packs.find(p=>p.collection===f.source):null;
    let index=[];
    try{index=browse().getIndex();}catch(error){console.warn(`[${MODULE_ID}] Items: index not built`,error);}
    const types=[...new Set(index.filter(e=>(e.kind==='Item'||e.kind==='Actor')&&e.docType).map(e=>e.docType))].sort();
    if(f.type!=='all'&&!types.includes(f.type))types.push(f.type);
    const folderRows=pack?(()=>{const idx=folderIndex([...(pack.folders?.contents??pack.folders??[])]);return [...idx.byId.values()].map(x=>({id:x.id,label:idx.pathOf(x.id)}));})()
      :ORGANIZE_TYPES.flatMap(t=>{const idx=folderIndex([...(game.folders?.contents??game.folders??[])].filter(x=>x.type===t));return [...idx.byId.values()].map(x=>({id:x.id,label:`${TYPE_LABEL[t]}: ${idx.pathOf(x.id)}`}));});
    folderRows.sort((a,b)=>a.label.localeCompare(b.label));
    const status=browse().status();
    const facetCount=this.itemsView==='all'?browseFacetCount(this.browseState):0;
    return {query:f.query,coreRef:f.coreRef,active:activeFilterCount(f)+facetCount,panelCount:activeFilterCount({...f,query:''})+facetCount,
      packsLabel:packsLabel(status),
      sources:[opt('all','All sources',{key:'source'}),opt('world','World',{key:'source'}),...packs.map(p=>opt(p.collection,`${p.metadata?.label??p.title??p.collection} (${p.documentName})`,{key:'source'}))],
      types:[opt('all','All types',{key:'type'}),...types.map(t=>opt(t,capitalize(t),{key:'type'}))],
      origins:[opt('all','All origins',{key:'origin'}),...Object.entries(ORIGINS).map(([k,l])=>opt(k,l,{key:'origin'}))],
      rarities:[opt('all','Any rarity',{key:'rarity'}),...Object.entries(RARITIES).map(([k,l])=>opt(k,l,{key:'rarity'}))],
      folders:[opt('all','All folders',{key:'folder'}),...folderRows.map(r=>opt(r.id,r.label,{key:'folder'}))],
      needsPacks:f.source!=='all'&&f.source!=='world'&&!status.compendiums,
      packsNote:status.loading?'Loading compendium indexes…':status.compendiums?'':'Compendiums are not loaded yet: Browse lists only the world until you press Load compendiums (or pick a compendium under Source).'};
  }
  async #openOtherModule(moduleId) {
    if(!game.user.isGM) throw new Error('Only a GM can launch modules from Manager.');
    // Manager's own card (its NPC Codex, 0.46.0) opens the NPC Codex tab here.
    if(moduleId===MODULE_ID){this.tab='codex';this.focusAfterRender='.agmanager-nav [data-ag-tab="codex"]';return this.render();}
    return openAshenLauncher(moduleId,game.modules,game.settings.menus??new Map());
  }
  #getLibrarySelected() {
    return this.managedRows().filter(row=>this.librarySelected.has(row.uuid));
  }
  async #exportManaged() {
    const rows=this.#getLibrarySelected();
    if(!rows.length) return toast('Select managed documents first.');
    const editing=rows.map(r=>({source_id:r.sourceId,uuid:r.uuid,local_edits:localEdits(r.doc),snapshot:docManagerSnapshot(r.doc)}));
    const yes=await confirmDialog(`Export ${editing.length} managed documents and their local edits for review?\nThis includes rules text and possibly GM-only content. Review it before sharing. Nothing in the world changes.`,
      {title:'Export managed documents?',yes:'Export documents'});
    if (!yes) return;
    downloadJson(`ag-managed-review-${Date.now()}.json`,{
      schema_version:'ag-foundry-review/0.3',review_status:'unreviewed',
      exported_at:new Date().toISOString(),documents:editing});
    this.libraryMessage=`Exported ${editing.length} managed document(s) for review.`;
    await this.render();
  }
  async #lifecycle(action) {
    if(!game.user.isGM) throw new Error('GM required.');
    const rows=this.#getLibrarySelected();
    if(!rows.length) return toast('Select managed documents first.');
    const accepted=[],denied=[];
    const all=allBoundDocuments();
    for (const row of rows) {
      const dependents=all.filter(d=>d.uuid!==row.uuid && (sourceFlag(d)?.refs??[]).some(ref=>normalizeRef(ref).id===row.sourceId)).map(d=>sourceFlag(d).sourceId);
      const embedded=game.actors.contents.flatMap(a=>a.items.contents).filter(i=>i.getFlag(MODULE_ID,'source')?.sourceId===row.sourceId).length;
      const check=planLifecycle({managed:true,kind:row.kind,archived:row.archived,
        sourceId:row.sourceId,entityType:row.entityType,dependentIds:dependents,embeddedCount:embedded,action});
      (check.allowed?accepted:denied).push({...row,reason:check.reason});
    }
    if(!accepted.length){this.libraryMessage=`No ${action} eligible records. ${denied.map(r=>`${r.sourceId}: ${r.reason}`).join(' | ')}`;await this.render();return;}
    const warning=denied.length?`\nSkipped ${denied.length}: ${denied.map(r=>r.name??r.sourceId).join(', ')}`:'';
    const verb=`${action[0].toUpperCase()}${action.slice(1)}`;
    // Archive and delete use the kit danger confirm (Cancel is the default); restore is a plain confirm.
    const first=await (action==='restore'?confirmDialog:confirmDanger)(`${accepted.length} managed world document(s) will be ${action}d.${warning}
Existing Actor items, player progress and unmanaged content are not changed. A JSON snapshot downloads first.${action==='delete'?'\nThis deletes permanently. Only archived documents that nothing refers to can be deleted. Make a world backup first.':''}`,
      {title:`${verb} managed content?`,yes:action==='delete'?'Continue':`${verb} ${accepted.length} record(s)`});
    if(!first)return;
    if(action==='delete') {
      const second=await confirmDanger(`Delete ${accepted.length} archived Foundry documents permanently? A JSON snapshot is not a full world backup.\n${accepted.map(r=>`• ${r.name}`).join('\n')}`,
        {title:'Delete managed content permanently?',yes:`Delete ${accepted.length} archived record(s)`});
      if(!second)return;
    }
    this.#downloadSnapshots(accepted.map(r=>r.doc),`before-${action}-${Date.now()}`);
    this.busy=true;let changed=0,failed=0;
    const history={at:new Date().toISOString(),packageId:`lifecycle:${action}`,packageVersion:'0.3',results:[]};
    try {
      for(const row of accepted){
        try {
          if(action==='delete') await row.doc.delete();
          else if(action==='archive'){
            const folderName=`Ashen Gate — Archive ${row.kind==='Item'?'Items':'Journals'}`;
            let folder=game.folders.find(f=>f.type===row.kind && f.name===folderName && !f.folder);
            folder??=await Folder.create({name:folderName,type:row.kind,sorting:'a'});
            await row.doc.update({folder:folder.id,[`flags.${MODULE_ID}.lifecycle`]:{
              archived:true,previousFolderId:row.doc.folder?.id??null,archivedAt:new Date().toISOString()
            }});
          } else {
            const prev=row.doc.getFlag(MODULE_ID,'lifecycle')?.previousFolderId;
            const previous=prev && game.folders.get(prev)?.type===row.kind?prev:(await destinationFolder(row.kind)).id;
            await row.doc.update({folder:previous,[`flags.${MODULE_ID}.lifecycle.archived`]:false});
          }
          changed++;history.results.push({id:row.sourceId,action,status:'ok',uuid:row.uuid});
        } catch(err){failed++;history.results.push({id:row.sourceId,action,status:'error',message:String(err.message??err)});}
      }
      const prior=game.settings.get(MODULE_ID,'importHistory')??[];
      await game.settings.set(MODULE_ID,'importHistory',[...prior,history].slice(-40));
      this.librarySelected.clear();
      this.libraryMessage=`${action}: ${changed} succeeded, ${failed} failed, ${denied.length} blocked. Review History and downloaded snapshot.`;
      toast(this.libraryMessage,Boolean(failed));
    }finally{this.busy=false;await this.render();}
  }
  async #replaceFromSource() {
    const rows=this.#getLibrarySelected();
    if(!rows.length) return toast('Select managed documents first.');
    if(!this.pkg) return toast('Load a source package on the Import tab first.',true);
    const packageErrors=validatePackage(this.pkg,existingSourceIndex());
    if(packageErrors.length)throw new Error(`Cannot replace from invalid package: ${packageErrors.join('; ')}`);
    const candidates=[];const denied=[];
    for (const row of rows) {
      const record=this.pkg.records.find(r=>r.id===row.sourceId);
      if(!record){denied.push(`${row.sourceId}: absent from loaded package`);continue;}
      if(record.status!=='approved'&&!this.includeDrafts){denied.push(`${row.sourceId}: draft excluded by profile`);continue;}
      if(!['approved','draft','proposed','example_only'].includes(record.status)){denied.push(`${row.sourceId}: inactive source record`);continue;}
      if(row.archived){denied.push(`${row.sourceId}: archived content must be restored before replacement`);continue;}
      const result=buildSourceReplacementPatch(record,docWrapper(row.doc),{allowLocalEdits:true});
      if(!['replace','unchanged'].includes(result.action)){denied.push(`${row.sourceId}: ${result.reason}`);continue;}
      if(result.action==='replace') candidates.push({row,record,patch:result.patch,local:result.localPaths});
    }
    if(!candidates.length){this.libraryMessage=`Nothing eligible to replace. ${denied.join(' | ')}`;await this.render();return;}
    const yes=await confirmDanger(`Replace ${candidates.length} managed Item(s) with values from ${this.pkg.manifest.package_id}?
This can overwrite source-owned fields you edited by hand: ${candidates.flatMap(c=>c.local.map(p=>`${c.row.name??c.row.sourceId} (${p})`)).join(', ')||'none'}.
Foundry links, other fields and Actor inventories are kept. JSON snapshots download automatically.`,
      {title:'Replace fields from the source?',yes:'Replace fields'});
    if(!yes)return;
    this.#downloadSnapshots(candidates.map(c=>c.row.doc),`before-replace-${Date.now()}`);
    this.busy=true;let done=0,errors=[];
    try {for (const c of candidates) {
      try{await updateRecord(c.record,this.pkg,c.row.doc,c.patch);done++;}
      catch(err){errors.push(`${c.row.sourceId}: ${err.message}`);}
    }}finally{this.busy=false;}
    this.libraryMessage=`Replaced ${done} managed Item(s); ${errors.length} errors; ${denied.length} blocked. ${errors.join(' | ')}`;
    await this.#preview();await this.render();
  }
  async #stageCompendium() {
    const items=this.#getLibrarySelected().filter(r=>r.kind==='Item' && r.entityType!=='Location' && r.entityType!=='Region' && !String(r.sourceId).startsWith('LOC-'));
    if(!items.length)return toast('Select one or more managed world Items.');
    const yes=await confirmDialog(`Copy ${items.length} world Items into an Ashen Gate staging compendium?\nItems already in it are skipped, not replaced. This makes a copy; it is not kept in sync.`,
      {title:'Copy into a staging compendium?',yes:'Copy Items'});
    if(!yes)return;
    const cls=foundry.documents.collections.CompendiumCollection;
    const name='ashen-gate-staging-items';
    let pack=game.packs.get(`world.${name}`);
    if(!pack) pack=await cls.createCompendium({name,label:'Ashen Gate — Staging Items',type:'Item',package:'world'});
    if(pack.locked) throw new Error('Staging compendium is locked. Unlock it in Compendium sidebar first.');
    const all=await pack.getDocuments();
    const taken=new Set(all.map(d=>d.getFlag(MODULE_ID,'source')?.sourceId).filter(Boolean));
    let copies=0,skips=0;
    for (const row of items) {
      if(taken.has(row.sourceId)){skips++;continue;}
      await pack.importDocument(row.doc);copies++;taken.add(row.sourceId);
    }
    this.libraryMessage=`Staging Compendium: ${copies} copied, ${skips} existing entries skipped. No updates made to source Items.`;
    await this.render();toast(this.libraryMessage);
  }
  #downloadTemplateExample() {
    const sample={manifest:{schema_version:'ag-foundry-import/0.1',package_id:'TEMPLATE-PLAYTEST',version:'0.1.0'},
      templates:[{id:'basic-loot',version:'0.1',document_type:'Item',defaults:{type:'loot',img:'icons/svg/item-bag.svg',system:{description:{value:'<p>Shared description.</p>'}}}}],
      records:[{id:'ITEM-EXAMPLE-TEMPLATE',entity_type:'Item',status:'example_only',version:'0.1',provenance:{source:'local demonstration'},visibility:'gm',refs:[],
        template_ref:'basic-loot',foundry:{document_type:'Item',data:{name:'Example Template Item',system:{description:{value:'<p>Per-item description.</p>'}}}}}]};
    downloadJson('ag-template-example.json',sample);
  }
  #runAudit() {
    const docs=allBoundDocuments();
    const counts=new Map();
    for(const doc of docs) {
      const id=sourceFlag(doc).sourceId;
      counts.set(id,(counts.get(id)??0)+1);
    }
    const ids=new Set(counts.keys());
    for (const doc of docs) for (const id of (sourceFlag(doc)?.ownedResourceIds??[])) ids.add(id);
    const entries=[];
    for(const doc of docs) {
      const flag=sourceFlag(doc);
      const prefix=`${flag.sourceId} (${doc.name})`;
      if(counts.get(flag.sourceId)>1) entries.push({level:"error", message:`DUPLICATE: ${prefix}`});
      if(!flag.managedFields) entries.push({level:"error", message:`MISSING BASELINE: ${prefix}`});
      if(!flag.version) entries.push({level:"warning", message:`MISSING SOURCE VERSION: ${prefix}`});
      for(const id of (flag.unresolvedRequiredRefs??[])) entries.push({level:"error",message:`UNRESOLVED REQUIRED LINK: ${prefix} → ${id}`});
      for(const id of (flag.unresolvedOptionalRefs??[])) entries.push({level:"warning",message:`UNRESOLVED OPTIONAL LINK: ${prefix} → ${id}`});
      for(const ref of (flag.refs??[])) {
        const link=normalizeRef(ref);
        if(!link.optional && !ids.has(link.id)) entries.push({level:"warning",message:`UNRESOLVED ID: ${prefix} → ${link.id}`});
      }
    }
    if (!entries.length) entries.push({level:"ok",message:`No ID or reference problems found among ${docs.length} managed world document(s). (Unmanaged content not audited.)`});
    this.auditEntries=entries;
  }
  /** Organize works where the shared Source filter points: the world sidebar (World or All sources) or one compendium. */
  #organizeSource() {const s=this.itemFilters.source;return s==='all'||s==='world'?'world':`pack:${s}`;}
  #organizeSourceLabel(source=this.#organizeSource()) {
    const where=source==='world'?'the world sidebar':(organizer().listSources().find(s=>s.key===source)?.label??'that compendium');
    return this.orgScope==='selection'&&activeFilterCount(this.itemFilters)?`the selection in ${where}`:where;
  }
  /** Selected documents Organize can file: Items, Actors and Journals in the Organize source (0.36.0). */
  #organizeSelection() {
    const source=this.#organizeSource(), place=source==='world'?'world':source.slice(5);
    return this.#selection().filter(e=>ORGANIZE_TYPES.includes(e.kind)&&e.source===place&&e.docId);
  }
  #organizeOptions() {
    const o={source:this.#organizeSource(), types:ORGANIZE_TYPES.filter(t=>this.orgTypes.has(t)), mode:this.orgMode};
    // With no filter on there is no selection: plan everything in the source.
    if(this.orgScope==='selection'&&activeFilterCount(this.itemFilters)){
      o.ids=this.#organizeSelection().map(e=>e.docId);
      if(this.itemFilters.folder!=='all')o.folderId=this.itemFilters.folder;
    }
    return o;
  }
  #organizeContext() {
    const api=organizer();
    const schema=api.getSchema();
    const p=this.orgPreview;
    const source=this.#organizeSource();
    const world=source==='world';
    const where=api.listSources().find(s=>s.key===source);
    const filtered=activeFilterCount(this.itemFilters)>0;
    const selected=filtered?this.#organizeSelection().filter(e=>this.orgTypes.has(e.kind)).length:null;
    const worldFolders=world?[...(game.folders?.contents??[])].filter(f=>ORGANIZE_TYPES.includes(f.type)):[];
    const byType=ORGANIZE_TYPES.map(t=>[t,folderIndex(worldFolders.filter(f=>f.type===t))]);
    const folders=byType.flatMap(([t,idx])=>[...idx.byId.values()].map(f=>({id:f.id,label:`${TYPE_LABEL[t]}: ${idx.pathOf(f.id)}`,
      isProtected:Boolean(f.getFlag?.(MODULE_ID,FLAG_PROTECTED))}))).sort((a,b)=>a.label.localeCompare(b.label));
    return {
      whereLabel:where?.label??'World (sidebar)', whereWritable:where?.writable!==false, whereReason:where?.reason??'',
      allSources:this.itemFilters.source==='all',
      scopeAll:!(this.orgScope==='selection'&&filtered), scopeSelection:this.orgScope==='selection'&&filtered, filtered, selectedCount:selected??0,
      folderFilter:this.itemFilters.folder!=='all',
      packsMissing:!world&&!browse().status().compendiums,
      types:ORGANIZE_TYPES.map(t=>({value:t,label:TYPE_LABEL[t],checked:this.orgTypes.has(t)})),
      modeMisfiled:this.orgMode!=='all', modeAll:this.orgMode==='all', world, message:this.orgMessage,
      preview:p?{totals:p.totals,narrowed:Boolean(p.ids||p.folderId),canApply:p.totals.moves>0&&p.parts.every(x=>x.writable),parts:p.parts.map(x=>({...x,label:TYPE_LABEL[x.documentName],
        hasSkipped:x.skipped.length>0,hasUnmatched:x.unmatched.length>0,hasCreates:x.createFolders.length>0,moveCount:x.moves.length}))}:null,
      result:this.orgResult, hasEmpty:Boolean(this.orgResult?.emptyFolders?.length),
      history:api.history().map(h=>({at:h.at.replace('T',' ').slice(0,16),moved:h.moves.length,mode:h.mode==='all'?'Refile everything':'Unfiled and misfiled',
        source:h.source==='clean'?`Clean compendiums (${new Set(h.moves.map(m=>m.source)).size} place(s))`:`${h.source==='world'?'World':h.source.slice(5)}${h.narrowed?' (selection)':''}`})),
      protectedFolders:folders.filter(f=>f.isProtected), openFolders:folders.filter(f=>!f.isProtected),
      rules:schema.rules?.map((r,n)=>({n:n+1,...r,types:(r.types??ORGANIZE_TYPES).map(t=>TYPE_LABEL[t]).join(', '),
        match:Object.entries(r.when??{}).map(([k,v])=>`${k}=${[v].flat().join('|')}`).join(', ')||'anything'}))??[],
      schemaIsDefault:schema.isDefault, schemaText:this.orgSchemaText, editing:this.orgSchemaText!==null,
      report:this.orgReport,
      clean:this.#cleanContext()
    };
  }
  /** Clean compendiums preview (0.36.0): every move grouped by place and document type, each with its own tick. */
  #cleanContext() {
    const p=this.cleanPreview, api=organizer();
    const running=Boolean(this.cleanAbort);
    if(!p)return {status:this.cleanStatus,preview:null,running,pct:this.cleanPct??0};
    const hint=x=>x.locked?'Locked, skipped. Unlock it in the Compendium sidebar (right-click → Toggle Edit Lock), then press Clean compendiums again.'
      :/inspect-only/.test(x.reason)?'Module or system compendium, skipped: Foundry does not allow changing these. Import its entries into the sidebar or a world compendium to sort them.'
      :`Skipped: ${x.reason}.`;
    const sources=p.sources.map(x=>{
      const parts=x.parts.map(part=>({documentName:part.documentName,label:TYPE_LABEL[part.documentName],partKey:`${x.key}|${part.documentName}`,moveCount:part.moves.length,
        skippedCount:part.skipped.length,unmatchedCount:part.unmatched.length,inPlace:part.inPlace,createCount:part.createFolders.length,
        protectedFolders:part.protectedFolders.join(', '),
        groups:part.groups.map(g=>({path:g.path,count:g.count,rows:g.rows.map(r=>{const key=api.moveKey(x.key,part.documentName,r.id);return {key,name:r.name,from:r.from,why:r.why,weak:r.weak,
          keep:x.key==='world'?{id:r.id,documentName:part.documentName}:null,checked:!this.cleanUnticked.has(key)};})}))}));
      return {...x,hint:x.writable?'':hint(x),moveCount:parts.reduce((n,pt)=>n+pt.moveCount,0),parts:parts.filter(pt=>pt.moveCount||pt.skippedCount)};
    });
    const ticked=this.#cleanTicked().length;
    const weak=p.sources.flatMap(x=>x.parts.flatMap(part=>part.moves.filter(m=>m.weak))).length;
    return {status:this.cleanStatus,running,pct:this.cleanPct??0,preview:{totals:p.totals,ticked,weak,skippedSources:sources.filter(x=>!x.writable),
      withMoves:sources.filter(x=>x.writable&&x.moveCount),clean:sources.filter(x=>x.writable&&!x.moveCount).map(x=>x.label).join(', ')}};
  }
  /** Ticked move keys of the Clean compendiums preview. */
  #cleanTicked() {
    const p=this.cleanPreview, api=organizer();
    if(!p)return [];
    return p.sources.flatMap(x=>x.parts.flatMap(part=>part.moves.map(m=>api.moveKey(x.key,part.documentName,m.id)))).filter(k=>!this.cleanUnticked.has(k));
  }
  /** Progress in the Clean card and, where Foundry supports it, a progress notification. */
  #cleanProgress(first) {
    let note=null;
    try{note=ui.notifications?.info?.(first,{progress:true});}catch{note=null;}
    return (pct,text)=>{
      this.cleanStatus=text;this.cleanPct=pct;
      try{note?.update?.({pct,message:text});}catch{/* older notification API: the card text still updates */}
      const el=this.element?.querySelector('[data-ag-clean-status]');if(el)el.textContent=text;
      const bar=this.element?.querySelector('[data-ag-clean-bar]');if(bar)bar.value=pct;
    };
  }
  async #cleanAction(name) {
    const api=organizer();
    const say=(text,error=false)=>{this.cleanStatus=text;toast(text,error);};
    switch(name){
      case 'clean-scan': {
        const progress=this.#cleanProgress('Clean compendiums: reading the world and compendiums…');
        this.busy=true;
        try{
          const out=await api.cleanPreview({onProgress:({done,total,label})=>progress(total?done/total:1,label?`Reading ${label} (${done+1} of ${total})…`:'Read everything.')});
          if(!out.ok){say(out.message,true);break;}
          // 0.38.1: Core-bound moves on weak evidence (copied from a dnd5e compendium, D&D Beyond import) start unticked.
          this.cleanPreview=out;this.cleanUnticked=new Set(out.sources.flatMap(x=>x.parts.flatMap(part=>part.moves.filter(m=>m.weak).map(m=>api.moveKey(x.key,part.documentName,m.id)))));
          const places=out.sources.filter(x=>x.writable).length;
          say(out.totals.moves?`Clean compendiums: ${out.totals.moves} document(s) in ${places} place(s) are not in their folder. Untick any to leave, then Apply. Nothing has moved yet.${out.skippedSources?` ${out.skippedSources} compendium(s) skipped (see below).`:''}`
            :`Everything checked is already in its folder (${places} place(s)).${out.skippedSources?` ${out.skippedSources} compendium(s) skipped (see below).`:''} Nothing changed.`);
        }finally{this.busy=false;}
        break;
      }
      case 'clean-cancel': this.cleanPreview=null;this.cleanUnticked=new Set();this.cleanStatus='Clean preview cleared. Nothing changed.';break;
      case 'clean-backup': {
        const keys=this.#cleanTicked();
        if(!keys.length)return say('Press Clean compendiums and leave at least one move ticked first.',true);
        downloadJson(`AG_Clean_Backup_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`,api.cleanBackupOf(this.cleanPreview,keys));
        say(`Downloaded the current folders of the ${keys.length} ticked document(s). Nothing changed.`);break;
      }
      case 'clean-commit': {
        const keys=this.#cleanTicked();
        if(!keys.length)return say('Nothing is ticked to move.',true);
        const places=new Set(keys.map(k=>k.split('|')[0])).size;
        const yes=await confirmDialog(`Move ${keys.length} ticked document(s) in ${places} place(s) into the folders shown? Missing folders are created.\nOnly the folder changes; nothing is renamed, edited or deleted, and protected folders are not touched. Download the backup first if you want a file copy. You can Undo last organize afterwards.`,
          {title:'Move documents to their folders?',yes:`Move ${keys.length} document(s)`});
        if(!yes)return;
        // 0.45.0: written in small chunks with the window still responsive; Cancel stops between chunks.
        this.cleanAbort=new AbortController();this.cleanPct=0;this.busy=true;
        await this.render();
        const progress=this.#cleanProgress(`Clean compendiums: moving ${keys.length} document(s)…`);
        try{
          const out=await api.cleanApply({moves:keys,signal:this.cleanAbort.signal,onProgress:({done,total})=>progress(total?done/total:1,`Moved ${done} of ${total}…`)});
          if(!out.ok){if(out.moved)this.cleanPreview=null;say(out.message,true);break;}
          this.cleanPreview=null;this.cleanUnticked=new Set();this.orgPreview=null;
          if(out.cancelled){say(out.message,false);break;}
          say(`${out.message} Undo last organize puts this whole run back.`,out.notes.length>0);
        }finally{this.busy=false;this.cleanAbort=null;}
        break;
      }
    }
    await this.render();
  }
  /** Items tab: rail and the shared filter bar (kept across rail entries). */
  #bindItems(root) {
    // Filters (n) opens the second toolbar row (no re-render); the choice is remembered per user.
    const toggle=root.querySelector('[data-ag-items-filters-toggle]'),row=root.querySelector('[data-ag-items-filterrow]');
    toggle?.addEventListener('click',event=>{
      event.preventDefault();this.itemFiltersOpen=this.ui.set('itemFiltersOpen',!this.itemFiltersOpen);
      if(row)row.hidden=!this.itemFiltersOpen;toggle.setAttribute('aria-expanded',String(this.itemFiltersOpen));
    });
    const changed=()=>{this.orgPreview=null;this.orgResult=null;this.libraryPage=0;this.browseState.page=0;};
    const query=root.querySelector('[data-ag-items-query]');
    let typing=null;
    query?.addEventListener('input',event=>{
      this.itemFilters.query=event.target.value;
      if(this.browsePaint){clearTimeout(typing);typing=setTimeout(()=>this.browsePaint?.(),150);}
    });
    // Other rail entries re-render on Enter or leaving the box, so typing never loses focus.
    query?.addEventListener('change',event=>{this.itemFilters.query=event.target.value;changed();if(!this.browsePaint)void this.render();});
    root.querySelectorAll('[data-ag-items-filter]').forEach(el=>el.addEventListener('change',event=>{
      const key=el.dataset.agItemsFilter;
      this.itemFilters[key]=event.target.value;
      if(key==='source'){
        this.itemFilters.folder='all';
        const s=browse().status();
        if(!['all','world'].includes(event.target.value)&&!s.compendiums&&!s.loading)
          void browse().loadCompendiums().then(()=>this.rendered&&this.render(),err=>toast(String(err.message??err),true));
      }
      changed();this.focusAfterRender=`[data-ag-items-filter="${key}"]`;void this.render();
    }));
    root.querySelector('[data-ag-items-coreref]')?.addEventListener('change',event=>{this.itemFilters.coreRef=event.target.checked;changed();this.focusAfterRender='[data-ag-items-coreref]';void this.render();});
    root.querySelector('[data-ag-items-clear]')?.addEventListener('click',event=>{
      event.preventDefault();this.itemFilters={...DEFAULT_FILTERS};Object.assign(this.browseState,{query:'',filters:{},managedOnly:false,unlinkedOnly:false});changed();void this.render();
    });
    root.querySelector('[data-ag-items-packs]')?.addEventListener('click',event=>{
      event.preventDefault();
      const run=browse().status().compendiums?browse().refresh({compendiums:true}):browse().loadCompendiums();
      void run.then(()=>{toast(`Compendium indexes loaded (${browse().status().compendiumCount} entries).`);if(this.rendered)void this.render();},err=>toast(String(err.message??err),true));
      void this.render();
    });
  }
  #bindOrganize(root) {
    root.querySelectorAll('[data-ag-org-scope]').forEach(el=>el.addEventListener('change',e=>{
      if(!e.target.checked)return;
      this.orgScope=e.target.value;this.orgPreview=null;this.orgResult=null;
      // Picking the selection means "file these": include ones sitting in the GM's own folders (Preview still shows every move first).
      if(this.orgScope==='selection'&&this.orgMode!=='all'){this.orgMode='all';this.orgMessage='Move is set to Refile everything so the selected documents in your own folders are included. Press Preview to see what would move.';}
      void this.render();
    }));
    root.querySelectorAll('[data-ag-org-type]').forEach(el=>el.addEventListener('change',e=>{
      if(e.target.checked)this.orgTypes.add(e.target.dataset.agOrgType);else this.orgTypes.delete(e.target.dataset.agOrgType);
      this.orgPreview=null;void this.render();
    }));
    root.querySelector('[data-ag-org-mode]')?.addEventListener('change',e=>{this.orgMode=e.target.value;this.orgPreview=null;this.orgMessage='Move option changed. Press Preview to see what would move.';void this.render();});
    // Clean compendiums ticks: no re-render (a preview can hold thousands of rows), just the counter and Apply label.
    const cleanCount=()=>{const n=this.#cleanTicked().length;root.querySelectorAll('[data-ag-clean-count]').forEach(el=>{el.textContent=String(n);});
      root.querySelectorAll('[data-ag-clean-needs-ticks]').forEach(el=>{el.disabled=!n;});};
    root.querySelectorAll('[data-ag-clean-move]').forEach(el=>el.addEventListener('change',e=>{
      if(e.target.checked)this.cleanUnticked.delete(e.target.dataset.agCleanMove);else this.cleanUnticked.add(e.target.dataset.agCleanMove);cleanCount();
    }));
    root.querySelectorAll('[data-ag-clean-part]').forEach(el=>el.addEventListener('click',e=>{
      e.preventDefault();
      const on=el.dataset.on==='true';
      root.querySelectorAll(`[data-ag-clean-move^="${CSS.escape(el.dataset.agCleanPart)}|"]`).forEach(box=>{
        box.checked=on;if(on)this.cleanUnticked.delete(box.dataset.agCleanMove);else this.cleanUnticked.add(box.dataset.agCleanMove);
      });
      cleanCount();
    }));
    root.querySelector('[data-ag-org-schema-text]')?.addEventListener('input',e=>{this.orgSchemaText=e.target.value;});
    // Clean compendiums (0.38.1): Keep here on a world row sets the document's keepFolder flag and unticks the move.
    root.querySelectorAll('[data-ag-clean-keep]').forEach(el=>el.addEventListener('click',e=>{
      e.preventDefault();
      const doc={Item:game.items,Actor:game.actors,JournalEntry:game.journal}[el.dataset.agCleanDoctype]?.get(el.dataset.agCleanKeep);
      organizer().setKeepFolder(doc,true).then(out=>{
        if(!out.ok)return toast(out.message,true);
        this.cleanUnticked.add(el.dataset.agCleanKey);
        this.cleanStatus=`${doc.name} will keep its folder: Organize and Clean compendiums skip it from now on.`;toast(this.cleanStatus);
        return this.render();
      }).catch(err=>this.#fail(err));
    }));
    root.querySelectorAll('[data-ag-org-keep]').forEach(el=>el.addEventListener('click',e=>{
      e.preventDefault();
      const doc={Item:game.items,Actor:game.actors,JournalEntry:game.journal}[el.dataset.agOrgDoctype]?.get(el.dataset.agOrgKeep);
      organizer().setKeepFolder(doc,true).then(out=>out.ok?this.#organizeAction('org-preview',`${doc.name} will keep its folder. Clear it with game.modules.get('${MODULE_ID}').api.organize.setKeepFolder(doc,false).`):toast(out.message,true)).catch(err=>this.#fail(err));
    }));
    root.querySelectorAll('[data-ag-org-protect],[data-ag-org-unprotect]').forEach(el=>el.addEventListener('click',e=>{
      e.preventDefault();
      const id=el.dataset.agOrgUnprotect??root.querySelector('[data-ag-org-folder]')?.value;
      const folder=game.folders?.get?.(id);
      if(!folder)return toast('Choose a folder first.',true);
      const value=!el.dataset.agOrgUnprotect;
      organizer().setFolderProtected(folder,value).then(out=>{
        if(!out.ok)return toast(out.message,true);
        this.orgPreview=null;this.orgMessage=value?`${folder.name} and its sub-folders are protected: Organize will not move anything in them.`:`${folder.name} is no longer protected.`;
        void this.render();
      }).catch(err=>this.#fail(err));
    }));
  }
  /** Folders → Rules → Import… (file button). */
  async #importRules(f) {
    {
      try{
        const data=JSON.parse(await f.text());
        // 0.41.2: check the file first; a wrong or empty file is refused before anything is asked.
        const read=readRulesFile(data);
        if(!read.ok){this.orgMessage=`Rules not imported from ${f.name}: ${read.message}`;toast(read.message,true);await this.render();return;}
        const rules=read.rules;
        const yes=await confirmDanger(`Replace the organize rules with the ${rules.length} rule(s) in ${f.name}? No document moves until you Preview and Apply.`,
          {title:'Replace the organize rules?',yes:'Replace rules'});
        if(!yes)return;
        const out=await organizer().saveSchema(rules);
        this.orgMessage=out.ok?`Rules imported from ${f.name}.`:`Rules not imported: ${out.message}`;
        if(!out.ok)toast(out.message,true);
        this.orgPreview=null;await this.render();
      }catch(error){toast(`Could not read ${f.name}: ${error.message??error}`,true);}
    }
  }
  async #organizeAction(name,message) {
    const api=organizer();
    const say=(text,error=false)=>{this.orgMessage=text;toast(text,error);};
    switch(name) {
      case 'org-preview': {
        if(!this.orgTypes.size)return say('Tick at least one of Items, Actors or Journals.',true);
        const options=this.#organizeOptions();
        if(options.ids&&!options.ids.length)return say(`No ${[...this.orgTypes].map(t=>TYPE_LABEL[t]).join(', ')} in ${this.#organizeSourceLabel()} match the filters above. Change the filters or choose Everything.`,true);
        const out=await api.preview(options);
        if(!out.ok){say(out.message,true);break;}
        this.orgPreview=out;this.orgResult=null;
        const text=message??describePreview(out,this.#organizeSourceLabel());
        this.orgMessage=text;toast(text);
        break;
      }
      case 'org-backup': {
        if(!this.orgPreview)return say('Run Preview first.',true);
        const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
        downloadJson(`AG_Organize_Backup_${stamp}.json`,api.backupOf(this.orgPreview));
        say('Downloaded the current folders of everything that would move. Nothing in the world changed.');break;
      }
      case 'org-apply': {
        const p=this.orgPreview;
        if(!p?.totals.moves)return say('Run Preview first; there is nothing to move.',true);
        const yes=await confirmDialog(`Move ${p.totals.moves} document(s)${p.ids?' from the selection':''} into the folders shown and create ${p.totals.createFolders} folder(s)?\nOnly the folder changes; names, data, ownership and Actor progression are untouched and no folder is deleted. You can Undo last organize afterwards.`,
          {title:'Organize folders?',yes:'Apply organize'});
        if(!yes)return;
        this.busy=true;
        try{
          // Apply exactly what was previewed (same place, kinds, mode and selection), even if the filters moved since.
          const planned={source:p.source,types:p.types,mode:p.mode,ids:p.ids,folderId:p.folderId};
          const out=await api.apply(planned);
          if(!out.ok){say(out.message,true);break;}
          this.orgResult=out;
          const again=await api.preview(planned);
          this.orgPreview=again.ok?again:null;
          say(out.message);
        }finally{this.busy=false;}
        break;
      }
      case 'org-undo': {
        const last=api.history()[0];
        if(!last)return say('There is no organize run to undo.',true);
        const yes=await confirmDanger(`Put the ${last.moves.length} document(s) moved on ${last.at.replace('T',' ').slice(0,16)} back where they were? Documents you moved yourself since then stay where they are. Folders are not deleted.`,
          {title:'Undo the last organize?',yes:'Undo last organize'});
        if(!yes)return;
        const out=await api.undoLast();
        this.orgPreview=null;this.orgResult=null;
        say(out.ok?out.message+(out.notes?.length?` (${out.notes.slice(0,5).join('; ')})`:''):out.message,!out.ok);break;
      }
      case 'org-clear': this.orgPreview=null;this.orgResult=null;this.orgMessage='Preview cleared. Nothing changed.';break;
      case 'org-housekeeping': {
        const out=await api.housekeeping();
        if(!out.ok){say(out.message,true);break;}
        this.orgReport={...out,hasDuplicates:out.duplicates.length>0,hasTemporary:out.temporary.length>0,draftCount:out.drafts.length};
        this.housekeepingMessage='Housekeeping report ready. It is read-only: nothing was changed or deleted.';break;
      }
      case 'org-schema-edit': this.orgSchemaText=JSON.stringify(api.getSchema().rules,null,2);break;
      case 'org-schema-cancel': this.orgSchemaText=null;break;
      case 'org-schema-save': {
        let rules;
        try{rules=JSON.parse(this.orgSchemaText??'');}catch(error){return say(`Rules are not valid JSON: ${error.message}`,true);}
        const out=await api.saveSchema(rules);
        if(!out.ok)return say(`Rules not saved: ${out.message}`,true);
        this.orgSchemaText=null;this.orgPreview=null;say('Organize rules saved. Run Preview to see their effect.');break;
      }
      case 'org-schema-export': downloadJson('AG_Organize_Rules.json',{kind:'ashen-gate-organize-rules',version:1,rules:api.getSchema().rules});say('Rules downloaded.');break;
      case 'org-schema-reset': {
        const yes=await confirmDanger('Replace your organize rules with the shipped defaults? Your own rules are deleted (export them first to keep a copy). No document moves.',
          {title:'Reset organize rules?',yes:'Reset rules to defaults'});
        if(!yes)return;
        await api.resetSchema();this.orgSchemaText=null;this.orgPreview=null;say('Organize rules reset to the defaults.');break;
      }
    }
    await this.render();
  }
  async _onClose(options) {
    this.browseUnsub?.();this.browseUnsub=null;
    return super._onClose?.(options);
  }
  /**
   * Item preview (0.38.0): fills the [data-ag-item-preview] slot with dnd5e's item card and where the item lives.
   * The last card is reused while the same item repaints (typing, index refresh), then refreshed in the background.
   */
  #fillItemPreview(root) {
    const slot=root?.querySelector?.('[data-ag-item-preview]');if(!slot)return;
    const key=slot.dataset.agItemPreview, token=this.previewToken=(this.previewToken??0)+1;
    if(this.previewCache?.key===key)slot.innerHTML=this.previewCache.html;
    browse().preview(key).then(p=>{
      if(token!==this.previewToken||!slot.isConnected)return;
      const html=p?previewHtml(p):'<p class="agmanager-tiny">No item preview: this is not an Item.</p>';
      this.previewCache={key,html};slot.innerHTML=html;
    },error=>{if(slot.isConnected)slot.innerHTML=`<p class="ag-notice ag-notice--danger"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Preview failed: ${escapeHtml(error?.message??error)}</p>`;});
  }
  /**
   * Items → All items (Browse, 0.24.0): read-only; repaints only its own body so the shared search box keeps focus
   * while typing. Search and the shared filters come from the Items filter bar (0.36.0); only PAGE_SIZE rows are drawn.
   */
  #mountBrowse(el) {
    if(!el)return;
    const st=this.browseState;
    // Sort, Group and Refresh sit in the Items toolbar (one toolbar, 0.43.0); the handlers below listen there too.
    const tools=this.element?.querySelector('[data-ag-browse-tools]');
    if(tools)tools.innerHTML=toolbarHtml(st);
    el.innerHTML='<div data-ag-browse-body></div>';
    const body=el.querySelector('[data-ag-browse-body]');
    // 0.46.0: the facets live in the Items filter row (Filters (n)), so results start right under the toolbar.
    const facets=this.element?.querySelector('[data-ag-browse-facets]');
    const paint=()=>{
      try{
        st.query=this.itemFilters.query;
        const svc=browse(),result=svc.search({...st,shared:this.#sharedFilters(),pageSize:PAGE_SIZE});
        if(st.page!==result.page)st.page=result.page;
        const status=svc.status();
        // Repainting the facets keeps focus on the control the GM just changed (guidelines §9.6).
        const active=facets?.contains(document.activeElement)?document.activeElement.dataset??{}:null;
        const refocus=!active?null:active.agBrowseFacet?`[data-ag-browse-facet="${active.agBrowseFacet}"]`:'agBrowseManaged' in active?'[data-ag-browse-managed]':'agBrowseUnlinked' in active?'[data-ag-browse-unlinked]':null;
        body.innerHTML=bodyHtml(st,result,st.detailKey?svc.detail(st.detailKey):null,status);
        if(facets){facets.innerHTML=facetsHtml(st,result);if(refocus)facets.querySelector(refocus)?.focus?.();}
        bindSkinPicker(body.querySelector('.agbrowse-scope'),value=>{if(st.scope===value)return;st.scope=value;again();body.querySelector(`[data-ag-browse-scope="${value}"]`)?.focus?.();},{valueKey:'agBrowseScope'});
        const label=this.element?.querySelector('[data-ag-items-packs-label]');
        if(label)label.textContent=packsLabel(status);
        const n=activeFilterCount(this.itemFilters)+browseFacetCount(st),clear=this.element?.querySelector('[data-ag-items-clear]');
        if(clear){clear.disabled=!n;const count=clear.querySelector('[data-ag-items-clear-count]');if(count)count.textContent=String(n);}
        const panel=this.element?.querySelector('[data-ag-items-filter-count]');
        if(panel)panel.textContent=String(activeFilterCount({...this.itemFilters,query:''})+browseFacetCount(st));
        this.#fillItemPreview(body);
      }catch(error){body.innerHTML=`<p class="ag-notice ag-notice--danger"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${escapeHtml(error.message??error)}</p>`;}
    };
    const again=()=>{st.page=0;paint();};
    this.browsePaint=again;
    const onChange=event=>{
      const t=event.target,d=t.dataset;
      if('agBrowseSort' in d)st.sort=t.value;
      else if('agBrowseGroup' in d)st.group=t.value;
      else if(d.agBrowseFacet)st.filters[d.agBrowseFacet]=t.value;
      else if('agBrowseManaged' in d)st.managedOnly=t.checked;
      else if('agBrowseUnlinked' in d)st.unlinkedOnly=t.checked;
      else return;
      again();
    };
    const onClick=event=>{
      const b=event.target.closest('button');if(!b||!event.currentTarget.contains(b))return;
      const d=b.dataset;
      if(d.agBrowseScope)return; // the scope radio group handles its own clicks and arrow keys
      else if(d.agBrowseDetail){st.detailKey=d.agBrowseDetail;paint();}
      else if('agBrowseClose' in d){st.detailKey=null;paint();}
      else if(d.agBrowsePage){st.page+=Number(d.agBrowsePage);paint();el.querySelector('.agbrowse-results')?.scrollIntoView?.({block:'start'});}
      else if('agBrowseRefresh' in d)void browse().refresh({compendiums:true}).then(()=>toast('Browse index refreshed.'),err=>toast(String(err.message??err),true));
      else if(d.agBrowseOpen||d.agBrowseSheet){
        void browse().open(d.agBrowseOpen??d.agBrowseSheet,{prefer:d.agBrowseSheet?'sheet':'auto'}).then(out=>{
          if(!out.ok)toast(out.message,true);else if(out.message)toast(out.message);
        });
      }
      else if(d.agBrowseCopy){
        const id=d.agBrowseCopy;
        Promise.resolve(game.clipboard?.copyPlainText?.(id)??navigator.clipboard.writeText(id)).then(()=>toast(`Copied ${id}.`),()=>toast(`Could not copy ${id}.`,true));
      }
      else return;
      event.preventDefault();
    };
    for(const host of [el,tools,facets].filter(Boolean)){host.addEventListener('change',onChange);host.addEventListener('click',onClick);}
    // Same dataTransfer payload the core sidebar uses, so rows drop onto sheets, the canvas and journals.
    el.addEventListener('dragstart',event=>{
      const row=event.target.closest?.('[data-ag-browse-key]');if(!row)return;
      const data=browse().dragData(row.dataset.agBrowseKey);
      if(data)event.dataTransfer.setData('text/plain',JSON.stringify(data));else event.preventDefault();
    });
    this.browseUnsub=browse().subscribe(()=>{if(this.rendered&&this.tab==='items'&&this.itemsView==='all'&&el.isConnected)paint();});
    paint();
  }
  /** Core Links rows inside the shared filters (all rows when none is on). Apply and backup act only on these. */
  #coreLinkShown() {
    const rows=this.clPreview?.rows??[], keys=this.#selectionKeys();
    return keys?rows.filter(r=>keys.has(game.items?.get?.(r.id)?.uuid??`Item.${r.id}`)):rows;
  }
  #coreLinkChosen() {const shown=new Set(this.#coreLinkShown().map(r=>r.id));return [...this.clTicked].filter(id=>shown.has(id));}
  #coreLinkContext() {
    const p=this.clPreview;
    const shown=p?this.#coreLinkShown():[], chosen=new Set(this.#coreLinkChosen());
    const GROUPS=[['adopt','Adopt core data and link'],['link','Link only'],['relink','Re-link (linked core item is gone)'],['review','Needs your review (MEDIUM / LOW match)'],['nomatch','No 2024 core match'],['linked','Already linked']];
    return {message:this.clMessage, noRefs:Boolean(p&&!p.rows.length), history:coreLinks().history().map(h=>({at:h.at.replace('T',' ').slice(0,16),count:h.rows.length,adopted:h.rows.filter(r=>r.adopted).length})),
      preview:p?{counts:p.counts,withoutRef:p.withoutRef,poolSize:p.poolSize,notes:p.notes,tickedCount:chosen.size,
        hiddenByFilters:p.rows.length-shown.length,
        groups:GROUPS.map(([status,label])=>({status,label,rows:shown.filter(r=>r.status===status).map(r=>({...r,
          selectable:['adopt','link','relink','review'].includes(r.status),ticked:this.clTicked.has(r.id),linkOnly:this.clLinkOnly.has(r.id),
          refText:[r.coreRef.name,r.coreRef.source,r.coreRef.type,r.coreRef.rarity].filter(Boolean).join(' · '),
          matchedOn:r.best?.matchedOn?.join(', ')??'',diffCount:r.diff.length,hasOthers:r.others.length>0}))})).filter(g=>g.rows.length)}:null};
  }
  async #coreLinkAction(name) {
    const api=coreLinks();
    const say=(text,error=false)=>{this.clMessage=text;toast(text,error);};
    switch(name){
      case 'cl-scan': {
        const out=await api.preview();
        if(!out.ok){say(out.message,true);break;}
        this.clPreview=out;this.clTicked=new Set(out.rows.filter(r=>r.ticked).map(r=>r.id));this.clLinkOnly=new Set();
        this.clMessage=out.rows.length?`Scan: ${out.rows.length} item(s) with core_ref checked against ${out.poolSize} 2024 core item(s). HIGH matches are ticked. Nothing has changed yet.`
          :`Scan finished: no Ashen Gate item has a core_ref, so there is nothing to link (${out.poolSize} official 2024 item(s) were found to compare with). Nothing changed.`;
        break;
      }
      case 'cl-backup': {
        const ids=this.#coreLinkChosen();
        if(!this.clPreview||!ids.length){say('Scan and tick at least one item first.',true);break;}
        downloadJson(`AG_CoreLink_Backup_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`,api.backupOf(this.clPreview,ids));
        say('Downloaded the current image, data and link of every ticked item. Nothing in the world changed.');break;
      }
      case 'cl-apply': {
        // Only ticked rows that the shared filters show (0.36.0): a hidden tick is never applied.
        const ids=new Set(this.#coreLinkChosen());
        const rows=this.clPreview?.rows.filter(r=>ids.has(r.id))??[];
        if(!rows.length){say('Scan and tick at least one item first.',true);break;}
        const adopt=rows.filter(r=>r.canAdopt&&!this.clLinkOnly.has(r.id)).length;
        const yes=await confirmDialog(`Link ${rows.length} world item(s) to their 2024 core item, and replace the image and data of ${adopt} of them with the core item's?\nNames, Ashen Gate ids, folders, ownership and module data stay. Copies already in player inventories are not touched. You can Undo last core link afterwards.`,
          {title:'Link core items?',yes:'Link core items',danger:adopt>0});
        if(!yes)return;
        this.busy=true;
        try{
          const out=await api.apply({ids:[...ids],linkOnly:[...this.clLinkOnly]});
          if(!out.ok){say(out.message,true);break;}
          const again=await api.preview();
          this.clPreview=again.ok?again:null;this.clTicked=new Set();this.clLinkOnly=new Set();
          say(out.message+(out.failed.length?` ${out.failed.slice(0,5).join('; ')}`:''),out.failed.length>0);
        }finally{this.busy=false;}
        break;
      }
      case 'cl-undo': {
        const last=api.history()[0];
        if(!last){say('There is no core-link run to undo.',true);break;}
        const yes=await confirmDanger(`Put back the image, data and link of the ${last.rows.length} item(s) linked on ${last.at.replace('T',' ').slice(0,16)}? Items changed since then are left as they are.`,
          {title:'Undo the last core link?',yes:'Undo last core link'});
        if(!yes)return;
        const out=await api.undoLast();
        this.clPreview=null;say(out.ok?out.message:out.message,!out.ok);break;
      }
      case 'cl-clear': this.clPreview=null;this.clTicked=new Set();this.clMessage='Scan cleared. Nothing changed.';break;
    }
    await this.render();
  }
  /** GM Setup → Save Changes: world appearance, NPC Codex access and core sources save together (D4). */
  async #saveSetup() {
    const form=this.element?.querySelector('[data-ag-setup-form]')??this.element;
    const out=await saveGmSetup(readGmSetupForm(form),{game,moduleId:MODULE_ID,codexAccessKey:CODEX_ACCESS_SETTING,appearance:appearanceController,coreLinks:coreLinks()});
    this.setupMessage=out.message;toast(out.message,!out.ok);
    if(out.ok){this.setupDraft=null;this.setupGuard.markClean();}
    if(out.saved.includes('core sources'))this.clPreview=null;
    await this.render();
  }
  #codexContext() {
    const svc=codexService();
    const all=svc.list(),chars=svc.characters();
    const text=this.codexSearch.toLowerCase();
    const rows=all.filter(e=>(this.codexFilter==='all'||(this.codexFilter==='hidden')===(e.discoveryMode==='hidden'))
      &&(!text||[e.name,e.id,e.fields.find(f=>f.key==='role')?.value].some(v=>String(v??'').toLowerCase().includes(text))))
      .map(e=>({...e,focused:e.id===this.codexFocus,role:e.fields.find(f=>f.key==='role')?.value??'',
        initials:initialsOf(e.name)}));
    const found=all.find(e=>e.id===this.codexFocus)??null;
    // Who knows: a kit segmented radio group (Hidden | Party) plus a Characters menu; with characters picked neither radio is on.
    const seg=(key,rule,mode)=>({key,isHidden:mode==='hidden',isParty:mode==='party',isActors:mode==='actors',
      hiddenTab:mode==='party'?-1:0,partyTab:mode==='party'?0:-1,actorCount:rule.actors.length,
      chars:chars.map(c=>({...c,checked:rule.actors.includes(c.id)}))});
    const detail=found?{...found,initials:initialsOf(found.name),
      discoverySeg:{...seg('discovery',found.discovery,found.discoveryMode),label:'who knows this NPC',who:found.discoveryLabel},
      fields:found.fields.map(f=>({...f,...seg(f.key,f.rule,f.mode),isLinks:f.key==='links'})),
      gmFields:found.gmFields.map(f=>Array.isArray(f.value)?{label:f.label,items:f.value}:{label:f.label,text:f.value}),
      linksText:found.gmLinks.join(' ')}:null;
    // Unsaved Notes & links (0.46.0) survive re-renders until Save Changes or Cancel.
    if(detail&&this.codexDraft?.id===detail.id)Object.assign(detail,{learned:this.codexDraft.learned,notes:this.codexDraft.notes,linksText:this.codexDraft.links});
    // 0.40.0: a deity link opens Renown's Pantheon when Renown is active and knows it; otherwise plain text with a tooltip.
    if(detail){const how=svc.deityLinks();detail.links=detail.links.map(l=>l.kind==='deity'?{...l,isDeity:true,...how(l)}:l);}
    let previewHtml='';
    if(detail&&this.codexPreview&&this.codexTab==='preview'){
      const ids=this.codexPreview==='party'?[]:[this.codexPreview];
      const entry=svc.previewAs(ids).filter(e=>e.id===detail.id);
      previewHtml=entry.length?renderPlayerCodexHtml(entry,{deityLink:svc.deityLinks()}):renderPlayerCodexHtml([],{message:'This player does not know this NPC yet.'});
      // 0.41.1: Locations, Quest Log and Renown factions can only be checked on the player's own client, so the preview shows them as Unknown.
      if(entry.some(e=>e.fields.some(f=>f.links?.some(l=>l.unknown&&['location','quest','renown'].includes(l.kind)))))
        previewHtml+=`<p class="agmanager-tiny">Locations, quests and factions show as Unknown here. The player sees a name only if their own Locations, Quest Log or Renown shows it to them.</p>`;
    }
    const tab=this.codexTab;
    return {tabsHtml:detail?subTabs({group:'agm-codex',label:'NPC sections',tabs:CODEX_TABS,selected:tab}):'',panelAttrs:tabPanelAttrs('agm-codex',tab),
      onReveals:tab==='reveals',onNotes:tab==='notes',onPreview:tab==='preview',
      rows,total:all.length,known:all.filter(e=>e.discoveryMode!=='hidden').length,
      hidden:all.filter(e=>e.discoveryMode==='hidden').length,detail,chars,hasChars:chars.length>0,
      search:this.codexSearch,filterAll:this.codexFilter==='all',filterKnown:this.codexFilter==='known',filterHidden:this.codexFilter==='hidden',
      previewOptions:[{value:'',label:'GM (everything)'},{value:'party',label:'The party'},...chars.map(c=>({value:c.id,label:c.name}))]
        .map(o=>({...o,selected:o.value===this.codexPreview})),
      previewHtml,previewing:Boolean(previewHtml),message:this.codexMessage,
      playerAccess:Boolean(game.settings.get(MODULE_ID,CODEX_ACCESS_SETTING))};
  }
  #bindCodex(root) {
    const run=fn=>fn().catch(err=>{this.codexMessage=err.message;toast(err.message,true);void this.render();});
    root.querySelector('[data-ag-codex-search]')?.addEventListener('change',e=>{this.codexSearch=e.target.value.trim();void this.render();});
    root.querySelectorAll('[data-ag-codex-filter]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();this.codexFilter=el.dataset.agCodexFilter;void this.render();}));
    root.querySelectorAll('[data-ag-codex-focus]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();void this.#focusCodex(el.dataset.agCodexFocus);}));
    root.querySelector('[data-ag-codex-preview]')?.addEventListener('change',e=>{this.codexPreview=e.target.value;void this.render();});
    // Reveals apply at once ("Applies now"); arrow keys move between Hidden and Party like any radio group.
    root.querySelectorAll('[data-ag-codex-seg]').forEach(group=>bindSkinPicker(group,mode=>run(async()=>{
      await codexService().setReveal(this.codexFocus,group.dataset.agCodexSeg,{mode});
      this.focusAfterRender=`[data-ag-codex-seg="${group.dataset.agCodexSeg}"] [data-mode="${mode}"]`;
      this.codexMessage='Saved. Players see the change next time they open the codex.';await this.render();}),{valueKey:'mode'}));
    const form=root.querySelector('[data-ag-codex-form]');
    if(form){
      const note=()=>{this.codexDraft={id:this.codexFocus,learned:form.querySelector('[data-ag-codex-learned]')?.value??'',
        notes:form.querySelector('[data-ag-codex-notes]')?.value??'',links:form.querySelector('[data-ag-codex-links]')?.value??''};};
      form.addEventListener('input',note);form.addEventListener('change',note);
      this.codexGuard.watch(form);
    }
    root.querySelectorAll('[data-ag-codex-actor]').forEach(el=>el.addEventListener('change',e=>{run(async()=>{
      await codexService().setReveal(this.codexFocus,el.dataset.agCodexActor,{mode:'actor',actorId:el.value,on:el.checked});
      this.codexMessage='Saved. Players see the change next time they open the codex.';await this.render();});}));
    bindDeityLinks(root);
  }
  async #codexAction(name) {
    const svc=codexService();
    switch(name){
      case 'codex-save': {
        const root=this.element;
        const {rejected}=await svc.setDetails(this.codexFocus,{learned:root.querySelector('[data-ag-codex-learned]')?.value??'',
          notes:root.querySelector('[data-ag-codex-notes]')?.value??'',links:root.querySelector('[data-ag-codex-links]')?.value??''});
        this.codexDraft=null;this.codexGuard.markClean();
        this.codexMessage=rejected.length?`Saved. Not a linkable id, left out: ${rejected.join(', ')}. Use LOC-, FAC-, DEITY-, QUEST-, NPC- style ids.`:'Saved.';
        toast(this.codexMessage,rejected.length>0);break;
      }
      case 'codex-cancel': this.codexDraft=null;this.codexGuard.markClean();this.codexMessage='Changes discarded.';break;
      case 'codex-close': if(!(await this.codexGuard.confirm()))return;this.codexDraft=null;this.codexFocus=null;break;
      case 'codex-hide-all': {
        const entry=svc.get(this.codexFocus);
        const yes=await confirmDanger(`Hide ${entry.name} and every field from all players? What the party has learned and your notes are kept.`,
          {title:'Hide this NPC from players?',yes:'Hide from players'});
        if(!yes)return;
        for(const key of ['discovery',...entry.fields.map(f=>f.key)])await svc.setReveal(entry.id,key,{mode:'hidden'});
        this.codexMessage=`${entry.name} is hidden from players.`;break;
      }
      case 'codex-export': downloadJson(`AG_NPC_Codex_${new Date().toISOString().slice(0,10)}.json`,svc.exportAll());
        this.codexMessage='Codex exported (GM file: it contains GM-only fields).';break;
      case 'codex-player-view': await openCodexPlayerView();return;
      case 'codex-open-actor': {const uuid=svc.get(this.codexFocus).uuid;const doc=uuid?await (globalThis.fromUuid??foundry.utils.fromUuid)(uuid):null;doc?.sheet?.render?.({force:true});return;}
    }
    await this.render();
  }
  /** Picks an NPC in the Codex list; unsaved notes for another NPC ask first. */
  async #focusCodex(id) {
    if(this.codexDraft&&this.codexDraft.id!==id){
      if(!(await this.codexGuard.confirm()))return;
      this.codexDraft=null;
    }
    this.codexFocus=id;this.focusAfterRender=`[data-ag-codex-focus="${id}"]`;
    return this.render();
  }
  /** Items → Browse → Open on an NPC Codex row lands here (Browse checks the GM first). */
  async openCodexAt(id) {
    this.tab='codex';
    if(id&&id!==this.codexFocus&&!(this.codexDraft&&this.codexDraft.id!==id&&!(await this.codexGuard.confirm()))){
      if(this.codexDraft?.id!==id)this.codexDraft=null;
      this.codexFocus=id;
    }
    return this.render({force:true});
  }
  async #codexImport(file) {
    const svc=codexService();
    const plan=svc.planImport(JSON.parse(await file.text()));
    if(plan.errors.length){this.codexMessage=`${file.name} was not used: ${plan.errors.join(' ')}`;toast(this.codexMessage,true);await this.render();return;}
    const yes=await confirmDanger(`Replace reveals, learned text, links and notes for ${plan.apply.length} NPC(s) with the ones in ${file.name}?${plan.missing.length?`\nNot in this world, skipped: ${plan.missing.join(', ')}`:''}\nNPC content is not changed; it comes from the package import.`,
      {title:'Restore codex reveals?',yes:`Restore ${plan.apply.length} NPC(s)`});
    if(!yes)return;
    const out=await svc.applyImport(plan);
    this.codexMessage=`Restored ${out.done} NPC(s).${out.errors.length?` Failed: ${out.errors.join(' | ')}`:''}`;
    toast(this.codexMessage,out.errors.length>0);await this.render();
  }
  #fail(error) {
    console.error(`[${MODULE_ID}]`,error);
    this.message=String(error?.message??error);
    toast(this.message,true);
    void this.render();
  }
}


// Separate player-safe view; never inherits General Manager's Library or Import handlers.
class AshenGateMyAppearance extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS={
    id:'ashen-gate-my-appearance',classes:['ag-app','agm-my-appearance'],
    window:{title:'Ashen Gate | My Appearance',icon:'fa-solid fa-palette',resizable:true},
    position:{width:560,height:520}
  };
  static PARTS={main:{template:`modules/${MODULE_ID}/templates/my-appearance.hbs`}};
  constructor(options={}){
    super({...options,position:{...windowSize(AshenGateMyAppearance.DEFAULT_OPTIONS.position),...options.position}});
    myAppearanceApp=this;this.selection=null;this.sizeSelection=null;this.status='Select a skin, or inherit the GM world default.';
    // 0.46.0: skin and size both wait for Save My Appearance; closing with a change asks first.
    this.guard=guardDirty({status:()=>this.element?.querySelector('[data-ag-my-appearance-status]')});
  }
  async _prepareContext(options){
    const ctx=await super._prepareContext(options);
    if(!game.user?.id)throw new Error('Sign in to change My Appearance');
    const state=appearanceController.getState();
    const selected=this.selection===null ? (state.userOverride??'') : this.selection;
    const size=this.sizeSelection??state.size;
    return {...ctx,version:game.modules.get(MODULE_ID)?.version??'',worldDefault:appearanceController.listSkins().find(s=>s.id===state.worldDefault)?.label??state.worldDefault,
      effective:appearanceController.listSkins().find(s=>s.id===state.effective)?.label??state.effective,
      selected,isInherit:selected==='',status:this.status,
      skins:appearanceController.listSkins().map(s=>({...s,current:s.id===state.effective,selected:s.id===selected})),
      sizes:appearanceController.listSizes().map(s=>({...s,selected:s.id===size}))};
  }
  async _onRender(ctx,options){
    await super._onRender(ctx,options);
    const root=this.element;
    bindSkinPicker(root.querySelector('[data-ag-skin-picker="my"]'),value=>{this.selection=value;this.guard.markDirty();});
    bindSkinPicker(root.querySelector('[data-ag-size-picker="my"]'),value=>{this.sizeSelection=value;this.guard.markDirty();},{valueKey:'agSizeValue'});
    if(this.guard.dirty)this.guard.markDirty();
    root.querySelector('[data-ag-my-help]')?.addEventListener('click',e=>{e.preventDefault();
      void infoDialog('My Appearance help','<p>Pick a skin for every Ashen Gate window, or <strong>Inherit world default</strong> to follow the GM\u2019s choice. <strong>Size</strong> makes text and controls larger on this device only. Nothing changes until <strong>Save My Appearance</strong>; Cancel puts back what is saved.</p><p>This never opens GM tools, and it never changes Player Access, progress or permissions.</p>');});
    root.querySelector('[data-ag-my-cancel]')?.addEventListener('click',async e=>{
      e.preventDefault();this.selection=null;this.sizeSelection=null;this.guard.markClean();this.status='Changes discarded.';await this.render();
    });
    root.querySelector('[data-ag-my-save]')?.addEventListener('click',async e=>{
      e.preventDefault();const button=e.currentTarget;button.disabled=true;
      try {const state=appearanceController.getState();
        const chosen=this.selection===null ? (state.userOverride??'') : this.selection;
        await appearanceController.setUserOverride(chosen);
        if(this.sizeSelection&&this.sizeSelection!==state.size)await appearanceController.setSize(this.sizeSelection);
        this.status=chosen?'Your personal Ashen Gate appearance is saved.':'You now inherit the GM world default.';
        this.selection=null;this.sizeSelection=null;this.guard.markClean();await this.render();
      }catch(error){this.status=`Unable to save appearance: ${error.message}`;await this.render();}
      finally{button.disabled=false;}
    });
  }
  async close(options){
    if(!(await this.guard.confirm()))return this;
    this.selection=null;this.sizeSelection=null;
    return super.close(options);
  }
}

/** Read-only player Codex (0.33.0). Holds only the projection the GM sent; no Manager handlers. */
class AshenGateCodexPlayer extends ApplicationV2 {
  static DEFAULT_OPTIONS={id:'ashen-gate-codex-player',classes:['ag-app','agm-codex-window'],
    window:{title:'Ashen Gate | NPC Codex',icon:'fa-solid fa-address-book',resizable:true},position:{width:620,height:640}};
  constructor(options={}){super({...options,position:{...windowSize(AshenGateCodexPlayer.DEFAULT_OPTIONS.position),...options.position}});codexPlayerApp=this;}
  async _renderHTML(){
    let entries=[],message='';
    try{entries=await codexService().forPlayer();}catch(error){message=error.message;}
    const version=game.modules.get(MODULE_ID)?.version??'';
    return `<section class="agm-codex-body"><header class="ag-header"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | NPC Codex</h1></div>`
      +`<div class="ag-header__meta"><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-ag-codex-refresh><i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh</button><span class="ag-version">v${escapeHtml(version)}</span><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-ag-codex-help><i class="fa-solid fa-circle-question" aria-hidden="true"></i> Help</button></div></header>`
      +renderPlayerCodexHtml(entries,{message,deityLink:codexService().deityLinks()})+`</section>`;
  }
  _replaceHTML(result,content){
    content.innerHTML=result;
    content.querySelector('[data-ag-codex-refresh]')?.addEventListener('click',e=>{e.preventDefault();void this.render();});
    content.querySelector('[data-ag-codex-help]')?.addEventListener('click',e=>{e.preventDefault();
      void infoDialog('NPC Codex help','<p>The people your GM has told you about, and only what you have learned about each of them. Some details show <strong>only you</strong>: your character learned them on their own.</p><p>A deity name you can open takes you to Renown\u2019s Pantheon. Press <strong>Refresh</strong> after your GM reveals something new. The GM must be connected for the codex to load.</p>');});
    bindDeityLinks(content);
  }
}
/** 0.40.0: Codex deity links open Renown's Pantheon (api.open, feature-detected). A failure is a notice, never a crash. */
function bindDeityLinks(root){
  root?.querySelectorAll?.('[data-ag-codex-deity]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();
    try{codexService().openDeity(el.dataset.agCodexDeity);}catch(err){ui.notifications?.warn?.(err.message);}}));
}
const initialsOf=name=>String(name??'').split(/\s+/).filter(w=>/^[A-Za-z]/.test(w)).slice(0,2).map(w=>w[0]).join('')||'?';
let codexApi=null;
let codexPlayerApp=null;
const codexService=()=>codexApi??=createCodexService({game,moduleId:MODULE_ID});
const openCodexPlayerView=()=>{codexPlayerApp??=new AshenGateCodexPlayer();return codexPlayerApp.render({force:true});};
let appearanceController=null;
let definitionsReader=null;
let myAppearanceApp=null;
let activeApp;
let sceneMoodsApi=null;
let browseApi=null;
const browse=()=>browseApi??=createBrowse({game,hooks:Hooks,fromUuid:uuid=>(globalThis.fromUuid??foundry.utils.fromUuid)(uuid),
  // Items → All items → Open on an NPC Codex row: Items → NPC Codex with that NPC selected (GM-only; Browse checks the GM first).
  openCodex:id=>{activeApp??=new AshenGateManager();return activeApp.openCodexAt(id);}});
const sceneMoods=()=>sceneMoodsApi??=createSceneMoods({game});
let organizerApi=null;
let coreLinksApi=null;
const coreLinks=()=>coreLinksApi??=createCoreLinks({game});
const organizer=()=>organizerApi??=createOrganizer({game});
/**
 * One-time renames of folders Manager made under an old name (0.45.0: "Ashen Gate/Cinders/Powers" → "Cinder - Powers").
 * GM only, on the active GM's client; each rename is remembered in the world setting, so it runs once per world.
 */
async function runFolderRenames() {
  if(!game.user?.isGM) return null;
  const active=game.users?.activeGM;
  if(active && active.id!==game.user.id) return null;
  try {
    const done=game.settings.get(MODULE_ID,FOLDER_RENAMES_SETTING)??{};
    const out=await renameManagerFolders({folders:game.folders,done});
    if(Object.keys(out.done).length!==Object.keys(done).length) await game.settings.set(MODULE_ID,FOLDER_RENAMES_SETTING,out.done);
    for(const r of out.renamed) console.info(`[${MODULE_ID}] Renamed folder ${r.from} → ${r.to}`);
    for(const note of out.notes) console.warn(`[${MODULE_ID}] ${note}`);
    if(out.renamed.length) toast(`General Manager renamed ${out.renamed.map(r=>r.from).join(', ')} to ${out.renamed[0].to.split('/').at(-1)}.`);
    return out;
  } catch(error) {console.warn(`[${MODULE_ID}] Folder rename skipped`,error);return null;}
}
Hooks.once("init",()=>{
  registerAppearanceSettings({game,namespace:MODULE_ID,onSettingChange:(key,value)=>appearanceController?.noteChange(key,value)});
  game.settings.register(MODULE_ID,SNAPSHOT_SETTING,{name:"World export snapshot",scope:"world",config:false,type:Object,default:{}});
  game.settings.register(MODULE_ID,"importHistory",{name:"Import History",scope:"world",config:false,type:Array,default:[]});
  // Empty means "use the shipped default moods"; written only by the GM from the Scenes tab.
  game.settings.register(MODULE_ID,MOODS_SETTING,{name:"Scene mood presets",scope:"world",config:false,type:Array,default:[]});
  game.settings.register(MODULE_ID,LAYERS_SETTING,{name:"Scene layer presets",scope:"world",config:false,type:Array,default:[]});
  // Organize folders (0.25.0). Empty schema means "use the shipped default rules"; history holds the last runs' previous folder ids for Undo.
  game.settings.register(MODULE_ID,SCHEMA_SETTING,{name:"Organize rules",scope:"world",config:false,type:Array,default:[]});
  // Core links (0.26.0): which packs/folders count as 2024 core sources (auto-detect on by default) and the last runs for Undo.
  game.settings.register(MODULE_ID,SOURCES_SETTING,{name:"Core sources",scope:"world",config:false,type:Object,default:{auto:true,packs:[],folders:[]}});
  game.settings.register(MODULE_ID,LINK_HISTORY_SETTING,{name:"Core link history",scope:"world",config:false,type:Array,default:[]});
  game.settings.register(MODULE_ID,HISTORY_SETTING,{name:"Organize history",scope:"world",config:false,type:Array,default:[]});
  // NPC Codex (0.33.0): reveal state lives on each NPC Actor (flags.ashen-gate-manager.codex); this only gates the player view.
  // 0.45.0: the menu follows the setting, so players see NPC Codex in Game Settings only once the GM shares it.
  game.settings.register(MODULE_ID,CODEX_ACCESS_SETTING,{name:"NPC Codex player access",scope:"world",config:false,type:Boolean,default:false,onChange:value=>syncCodexMenu(value)});
  // 0.45.0: one-time folder renames already run in this world ({cinderPowers:true}).
  // 0.45.0: Import tab folds and message drawer, per device (presentation only).
  game.settings.register(MODULE_ID,LAYOUT_SETTING,{name:"Import tab layout",scope:"client",config:false,type:Object,default:{}});
  game.settings.register(MODULE_ID,FOLDER_RENAMES_SETTING,{name:"Folder renames",scope:"world",config:false,type:Object,default:{}});
  // 0.47.0: Items → Checks → Improve icons keeps its last run here for one-step Undo ({at, applied:[{uuid, before, after}]}).
  game.settings.register(MODULE_ID,ICON_UNDO_SETTING,{name:"Icon change undo",scope:"world",config:false,type:Object,default:{}});
  // Point-to-point query: a player's client asks the active GM, who answers with that player's projection only.
  if(globalThis.CONFIG){CONFIG.queries??={};CONFIG.queries[CODEX_QUERY]=(data,options)=>codexService().handleQuery(data,options);}
  game.settings.registerMenu(MODULE_ID,"manager",{
    name:"General Manager", label:"Open General Manager", icon:"fa-solid fa-boxes-stacked",
    hint:"GM-only package validation, preview, import and audit.", type:AshenGateManager, restricted:true
  });
  // 0.45.0: nothing of Manager shows in players' Game Settings. Players open My Appearance from Utilities'
  // Appearance button (api.appearance.openMyAppearance); NPC Codex appears for them only while the GM shares it.
  game.settings.registerMenu(MODULE_ID,'myAppearance',{
    name:'Ashen Gate | My Appearance',label:'Open My Appearance',
    hint:'Choose your own appearance or inherit the GM world default. Player-safe; no Manager administration.',
    icon:'fa-solid fa-palette',type:AshenGateMyAppearance,restricted:true
  });
  game.settings.registerMenu(MODULE_ID,'npcCodex',{
    name:'Ashen Gate | NPC Codex',label:'Open NPC Codex',
    hint:'The NPCs your GM has revealed to you. Read-only; needs the GM to share the codex and be connected.',
    icon:'fa-solid fa-address-book',type:AshenGateCodexPlayer,restricted:true
  });
});
/** Shows the player NPC Codex menu in Game Settings only while the GM shares the Codex (Foundry reads `restricted` when it draws the list). */
function syncCodexMenu(enabled) {
  const menus=game.settings?.menus, key=`${MODULE_ID}.npcCodex`;
  const entry=menus?.get?.(key);
  if(!entry||typeof menus.set!=='function') return;
  menus.set(key,{...entry,restricted:!enabled});
}
Hooks.once("ready",()=>{
  try{syncCodexMenu(Boolean(game.settings.get(MODULE_ID,CODEX_ACCESS_SETTING)));}catch{/* the menu stays GM-only */}
  void runFolderRenames();
  appearanceController=makeFoundryAppearanceController({game,namespace:MODULE_ID});
  definitionsReader=createManagerDefinitionReader({game,hooks:Hooks});
  // Every Ashen Gate window and launcher inherits the kit's --ag-* tokens from <html>, so
  // writing the effective skin there re-themes all modules live, with no per-app wiring.
  // Presentation only: no Actor/Item/source or specialist-state writes.
  // Structural skins (Stone Tablet, Tome Pages) also load their own stylesheet, only while active.
  const applyDocumentSkin=()=>{try{
    appearanceController.applyTo(document.documentElement);
    syncSkinStylesheet(document,document.documentElement.dataset.agSkin,{basePath:globalThis.foundry?.utils?.getRoute?.(`modules/${MODULE_ID}`)??`modules/${MODULE_ID}`,version:game.modules.get(MODULE_ID)?.version});
  }catch(error){console.warn(`[${MODULE_ID}] Appearance not applied`,error);}};
  applyDocumentSkin();
  appearanceController.subscribe(applyDocumentSkin);
  game.modules.get(MODULE_ID).api = {
    appearance:{
      contract:APPEARANCE_CONTRACT,
      listSkins:()=>appearanceController.listSkins(),
      getState:()=>appearanceController.getState(),
      // Every window under <html> already follows the skin live (ready hook below), so a module never needs to call
      // applyTo on its own window content: that writes a second, stale copy of the tokens (GM-CO-04). Use it only for a
      // detached root that is not inside this document (a pop-out or iframe), and call it again on each change (subscribe).
      applyTo:root=>appearanceController.applyTo(root),
      subscribe:callback=>appearanceController.subscribe(callback),
      refresh:()=>{if(!game.user?.isGM)throw new Error('Only a GM can refresh the shared appearance.');return appearanceController.refresh();},
      setWorldDefault:id=>appearanceController.setWorldDefault(id),
      setUserOverride:id=>appearanceController.setUserOverride(id),
      // Kit 2 size set for this device: 'compact' (default) or 'comfortable'.
      listSizes:()=>appearanceController.listSizes(),
      setSize:value=>appearanceController.setSize(value),
      // Player-safe personal appearance window (never the GM Manager).
      openMyAppearance:()=>{myAppearanceApp??=new AshenGateMyAppearance();return myAppearanceApp.render({force:true});}
    },
    definitions:{
      contract:READER_CONTRACT,
      getState:()=>definitionsReader.getState(),
      capabilities:definitionsReader.capabilities,
      registerProvider:cfg=>definitionsReader.registerProvider(cfg),
      readSource:(id,opts)=>definitionsReader.readSource(id,opts),
      refreshCompendiums:()=>definitionsReader.refreshCompendiums(),
      resolve:(id,opts)=>definitionsReader.resolve(id,opts),
      list:(opts)=>definitionsReader.list(opts),
      audit:()=>definitionsReader.audit(),
      validateReferences:()=>definitionsReader.validateReferences(),
      refresh:()=>definitionsReader.refresh(),
      loadCompendiums:(packIds)=>definitionsReader.loadCompendiums(packIds),
      dispose:()=>{if(!game.user?.isGM)throw new Error('Only a GM can dispose the definitions reader.');return definitionsReader.dispose();}
    },
    // GM-only, read-only health report (0.21.0); the gate is inside runPreSessionCheck.
    preSessionCheck:()=>runPreSessionCheck(game),
    // GM-only "Back up before play" (0.21.0): the everything export as AG_Backup_<date>.json; leaves the export snapshot alone.
    backup:()=>saveBackup(game,{save:downloadJson}),
    // GM-only scene moods (0.22.0) and layers (0.35.0); every function checks the GM itself and returns {ok,message}.
    // GM-only organize folders (0.25.0); every function checks the GM itself. Only the folder field is ever written.
    // GM-only core links (0.26.0): link AG world Items with core_ref to 2024 core items; every function checks the GM itself.
    coreLinks:(({preview,apply,undoLast,history,describeSources,saveSources})=>({preview,apply,undoLast,history,describeSources,saveSources}))(coreLinks()),
    // 0.36.0 adds cleanPreview/cleanApply (Clean compendiums); existing names unchanged.
    organize:(({listSources,preview,apply,undoLast,history,getSchema,saveSchema,resetSchema,setFolderProtected,setKeepFolder,housekeeping,cleanPreview,cleanApply})=>({listSources,preview,apply,undoLast,history,getSchema,saveSchema,resetSchema,setFolderProtected,setKeepFolder,housekeeping,cleanPreview,cleanApply}))(organizer()),
    // GM-only, read-only Browse index (0.24.0); every function checks the GM itself.
    browse:(({getIndex,search,detail,refresh,loadCompendiums,status,dragData,open})=>({getIndex,search,detail,refresh,loadCompendiums,status,dragData,open}))(browse()),
    scenes:(({listMoods,getState,applyMood,addLayer,removeEffect,restore,applyDraft,toggleFavourite,savePreset,removePreset,resetDefaults,exportPresets,previewImport,importPresets})=>({listMoods,getState,applyMood,addLayer,removeEffect,restore,applyDraft,toggleFavourite,savePreset,removePreset,resetDefaults,exportPresets,previewImport,importPresets}))(sceneMoods()),
    resolverBridge:{
      contract:'ag-definition-resolver/0.1-prototype-adapter',
      // Requires a caller-supplied source-reviewed resolver; no invented global provider.
      audit:resolver=>!game.user?.isGM?{status:'forbidden'}:auditTypedReferences({
        records:allBoundDocuments().filter(d=>!d.flags?.[MODULE_ID]?.lifecycle?.archived).map(d=>({
          id:sourceFlag(d)?.sourceId,refs:sourceFlag(d)?.refs??[]
        })),resolver,currentUser:()=>game.user
      }),
      auditPackage:(records,resolver)=>!game.user?.isGM?{status:'forbidden'}:
        auditTypedReferences({records,resolver,currentUser:()=>game.user}),
      renderMarkers:(text,resolver)=>renderGmReferenceMarkers({text,resolver,currentUser:()=>game.user})
    },
    // NPC Codex (0.33.0). GM functions check the GM themselves; forPlayer/mount/openPlayerView are player-safe
    // (a player gets only revealed NPCs and fields for their own characters, through the active GM).
    codex:Object.freeze({
      list:()=>codexService().list(), get:id=>codexService().get(id), characters:()=>codexService().characters(),
      setReveal:(id,key,opts)=>codexService().setReveal(id,key,opts), setDetails:(id,patch)=>codexService().setDetails(id,patch),
      previewAs:actorIds=>codexService().previewAs(actorIds), exportAll:()=>codexService().exportAll(),
      forPlayer:()=>codexService().forPlayer(),
      playerAccessEnabled:()=>codexService().playerAccessEnabled(),
      openPlayerView:()=>openCodexPlayerView(),
      /** Render the read-only player codex into an element (e.g. a Character Hub tab). Returns a refresh function. */
      mount:async element=>{
        const draw=async()=>{let entries=[],message='';try{entries=await codexService().forPlayer();}catch(e){message=e.message;}
          element.innerHTML=renderPlayerCodexHtml(entries,{message,deityLink:codexService().deityLinks()});bindDeityLinks(element);};
        await draw();return draw;
      }
    }),
    // ag-player-access/1 for the one player-facing part of Manager, its read-only NPC Codex (0.46.0; the Manager window
    // itself stays GM-only). State is the existing Codex access setting, so the Modules tab's card and Hide all cover it.
    playerAccess:{contract:"ag-player-access/1",surface:CODEX_SURFACE,
      getState:()=>({contract:"ag-player-access/1",moduleId:MODULE_ID,audience:"player",playerAccessEnabled:Boolean(game.settings.get(MODULE_ID,CODEX_ACCESS_SETTING)),configurable:Boolean(game.user?.isGM)}),
      setEnabled:async enabled=>{
        if(!game.user?.isGM)throw new Error('Only the GM can change who opens the NPC Codex.');
        if(typeof enabled!=='boolean')throw new TypeError('Player Access value must be Boolean.');
        await game.settings.set(MODULE_ID,CODEX_ACCESS_SETTING,enabled);
        return enabled;
      }},
    open:()=>{
      if(!game.user.isGM) return toast("Only GMs can open the Ashen Gate importer.",true);
      activeApp ??= new AshenGateManager();
      return activeApp.render({force:true});
    }
  };
  console.info(`[${MODULE_ID}] v${game.modules.get(MODULE_ID)?.version??""} ready. Open from Configure Settings → Module Settings, or game.modules.get("${MODULE_ID}").api.open()`);
});

/** Own only the General Manager launcher. Other modules own their sidebar buttons. */
function addManagerSidebarButton(app,html) {
  const root=html?.[0]??html?.element?.[0]??html?.element??html;
  const tab=app?.tabName??app?.id??app?.constructor?.name??'';
  if(!/item/i.test(String(tab)))return;
  mountManagerLauncher(root,{isGM:!!game.user?.isGM,onOpen:()=>{
    const open=game.modules.get(MODULE_ID)?.api?.open;
    if(typeof open==='function') return open();
    activeApp??=new AshenGateManager();
    return activeApp.render({force:true});
  }});
}
if(typeof Hooks.on==='function') Hooks.on('renderItemDirectory',addManagerSidebarButton);
if(typeof Hooks.on==='function') Hooks.on('renderSidebarTab',(app,html)=>{
  const tab=app?.tabName??app?.id??'';
  if(String(tab)==='items')addManagerSidebarButton(app,html);
});
// Keep the Scenes tab's "current mood" in step when the viewed scene changes or is updated elsewhere.
if(typeof Hooks.on==='function') for(const hook of ['canvasReady','updateScene']) Hooks.on(hook,()=>{
  if(activeApp?.rendered&&activeApp.tab==='scenes') void activeApp.render();
});
