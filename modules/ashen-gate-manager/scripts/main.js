import {bindSkinPicker} from "./skin-picker.js";
import {windowSize, uiState, subTabs, tabPanelAttrs, bindTablist, bindSplitNav, bindFolds, fileButton, bindFileButtons, linkButton} from "./ag-html.mjs";
import {confirmDialog, confirmDanger, guardDirty, infoDialog, promptText, formDialog, choiceDialog} from "./ag-dialogs.mjs";
import {collapseItemDescriptions} from "./chat-style.js";
import {installPauseMirror} from "./pause-indicator.js";
import {installSidebarTabHider, listExtraTabs} from "./sidebar-tabs.js";
import {checklistRows, summarizeRows} from "./sidebar-policy.js";
import {installSceneControlHider} from "./scene-controls.js";
import {startSidebarCollapsed} from "./sidebar-collapse.js";
import {installPlayerDock} from "./player-dock.js";
import {installSidebarIdleCollapse} from "./sidebar-idle.js";
import {installDirectoryFilter,DIRECTORIES} from "./directory-filter.js";
import {pauseGlowReport} from "./pause-glow-report.js";
import {PLAYER_SCREEN_FLAGS, DOCK_CORNERS, createAppearanceController, registerAppearanceSettings, makeFoundryAppearanceController, syncSkinStylesheet, APPEARANCE_CONTRACT, DEFAULT_SKIN_ID} from "./appearance.js";
import {auditTypedReferences, renderGmReferenceMarkers} from "./manager-resolver-bridge.mjs";
import {createManagerDefinitionReader, READER_CONTRACT} from './native-definition-reader.mjs';
import {sourceMetadata as projectionSourceMetadata, replacingSourceFlag} from './source-projection.mjs';
import {MODULE_ID, MANAGED_TYPES, validatePackage, planRecord, exportedFields, getPath, canonical, baselineFields} from "./core.js";
import {checkContractGraph, isContractImport, selectionIssues, projectedReferences, finalReferenceResolution} from "./contract.js";
import {createCodexService, CODEX_QUERY, CODEX_ACCESS_SETTING} from "./codex-service.js";
import {renderPlayerCodexHtml, isNpcDefinition, STATUS_VALUES, STATUS_LABELS} from "./codex.js";
import {askRevealTo, bulkStatus, runBulkReveal} from "./codex-reveal-dialog.mjs";
import {systemOf, browseLibrary, inspectLibrary, describeLaunchers, orderLibraryRows, groupLibraryRows} from "./browser.js";
import {openAshenLauncher} from "./launchers.js";
import {mountManagerLauncher} from "./items-launcher.js";
import {collectPlayerAccess, changePlayerAccess, hideAllPlayerInterfaces, CODEX_SURFACE} from "./player-access.js";
import {followHubVisibility} from "./hub-visibility.js";
import {initialOwnership, releasable, previewRelease, previewText as releasePreviewText, applyRelease, BASELINE_FLAG, ITEMS_READABLE_SETTING, setItemsPolicy} from "./release.js";
import {planVisibility, applyVisibility} from "./item-visibility.js";
import {planMaterialVisibility, applyMaterialVisibility, materialSummary} from "./material-visibility.js";
import {gatherInUseFacts, planInUseRelease, applyInUseRelease, inUseLines, inUseSummary} from "./in-use-release.js";
import {planSourceLabel, applySourceLabel, sourceLabelSummary, withSourceLabel, withSourceLabelFields, SOURCE_LABEL} from "./source-label.js";
import {LAYOUT_SETTING, FOLDS, normalizeLayout, noteDrawerChanges, drawerContext} from "./import-layout.js";
import {moduleCards} from './module-cards.js';
import {itemTooltipAttrs, previewHtml} from './item-preview.js';
import {professionFacts} from './profession-records.js';
import {tokenLabel, relationLabel} from "./labels.js";
import {createReferenceLinks, convertLegacyBlock, AGREF_PATTERN, MARKER_PATTERN} from "./reference-links.mjs";
import {relatedFor, withRelated} from "./related-lists.mjs";
import {offerFor, supersedeMap, collectSpecialistSupersedes, SUPERSEDE_ROW_ID} from "./supersedes.js";
import {previewPartners, applyPartners, renameManagerRefs} from "./supersede-run.js";
import {markerTargets,buildUuidIndex,resolveRichText,resolveTypedRefs,stripReferenceBlock,resolveRefCells} from "./import-fidelity.js";
import {moduleRecordLookup} from "./module-records.js";
import {createIconIndexer, filePickerClass, wantsSmartIcon, pickRecordIcon, chooseImportIcon, existingIconDecision, plannerIcon, iconFlagUpdate, ICON_DOCUMENT_TYPES, NO_CONFIDENT_MATCH} from './smart-icons.js';
import {scanIconDocuments, applyIconChanges, undoIconChanges, iconBackup, ICON_UNDO_SETTING} from './icon-improve.js';
import {ensureFolder, renameManagerFolders, moveManagerFolders, folderDestination, FOLDER_RENAMES_SETTING, FOLDER_MAX_DEPTH} from "./folders.js";
import {readImportZip, readImportBundle, planBundleImport, bundleSummary, autoSelect, decisionText, autoFileCounts, adaptRecordArtwork, uploadMatchingArt} from "./zip-import.js";
import {CAPTURE_TYPES, normalizeCaptureFlag, buildCapturePackage} from "./capture.js";
import {compilePackage, dependencyOrder, normalizeRef, docManagerSnapshot, localEdits, planLifecycle, buildSourceReplacementPatch} from "./workflows.js";
import {downloadJson, downloadText} from "./download.js";
import {isLocationRecord, locationsApi, planLocation, locationsNote, applyLocations, isRouteRecord, routesApi, planRoute, routesNote, applyRoutes, withLocationIds} from './location-handoff.js';
import {isShopRecord, shopsApi, shopIds, planShop, shopsNote, applyShops} from './shop-handoff.js';
import {cinderDefinitionChecks} from './cinder-definitions.js';
import {modifierDefinitionChecks} from './modifier-definitions.js';
import {SPECIALISTS, detectSpecialistFile, specialistCount, specialistApi, describeUnrecognized, planSpecialist, applySpecialist, updatesExisting} from './specialist-handoff.js';
import {classifyDelivery} from './delivery.js';
import {buildWorldExport, saveWorldExport, saveBackup, collectModuleSections, SNAPSHOT_SETTING} from './world-export.js';
import {EDIT_TYPES, TYPE_LABELS, scanWorldEdits, buildEditsFile, saveWorldEdits, previewHtml as editsPreviewHtml, summaryText as editsSummaryText} from './world-edits.js';
import {SYNC_NAME, SYNC_PHRASE, SYNC_RETIRED_SETTING, HANDOFF_LEDGER_SETTING, buildSyncSet, makeSnapshot, nameIndex, planSync, planRebind, phraseOk, phraseRequired, ledgerKey} from './sync.js';
import {executeSync, buildSyncBackup, writeRebind, summarizeErrors} from './sync-apply.js';
import {archiveFolderName, partnerArchiveApi} from './sync-archive.js';
import {bindPackageLinks} from './link-binding.js';
import {withoutActivityEffectRefs, activityLinksNeeded} from './activity-effects.js';
import {bulk, bulkWrite, emitBulkFinished, listenBulkFinished, BULK_FINISHED} from './bulk.js';
import {createConnection, isInterruption} from './sync-connection.js';
import {createProgress, HEARTBEAT_MS, STALL_MS} from './sync-progress.js';
import {readSyncInput, joinSyncInputs} from './sync-load.js';
import {syncView} from './sync-view.js';
import {staleAfterPull, activeStale, staleNotice, STALE_PULL_HINT, STALE_REFUSAL} from './sync-stale.js';
import * as github from './github-pull.js';
import {updateSummary, cleanToken, tokenProblem} from './github-paths.js';
import {githubView, rowsTable, defaultSelection} from './github-view.js';
import * as backup from './github-backup.js';
import {settingsView as backupSettingsView, exportView as backupExportView, confirmFields as backupConfirmFields} from './backup-view.js';
import {runPreSessionCheck,preSessionView} from './pre-session-check.js';
import {readGmSetupForm, saveGmSetup, applyTabPreset, describeTabChoice} from './gm-setup.js';
import {buildImportReport, buildBlockedReport, pushReport} from './import-result.js';
import {ITEM_FLAG, ACTOR_ITEMS_FLAG, itemKeys, matchActors, planActor, applyActorUpdate} from './actor-update.js';
import {mediaFilename, sortBundleFiles} from './zip-import.js';
import {resultCreateData} from './table-results.js';
import {planItemEffects, effectSummary, applyItemEffects, effectCreateData, upgradeEffectChanges, allowedItemFlags, flagWarnings, liveEffects} from './item-effects.js';
import {createSceneMoods, MOODS_SETTING, LAYERS_SETTING, CALM_SETTING, MOOD_FIELDS, FIELD_GROUPS, NO_WEATHER, formatValue, presetIdFromLabel} from './scene-moods.js';
import {createSceneLooks, LOOKS_SETTING, AUTO_LOOK_SETTING, blendSets, rollWeather} from './scene-looks.js';
const MOOD_VIEWS=[{id:'live',label:'Live',icon:'fa-solid fa-sun'},{id:'library',label:'Moods & layers',icon:'fa-solid fa-layer-group'},{id:'looks',label:'Looks',icon:'fa-solid fa-clone'},{id:'share',label:'Export & import',icon:'fa-solid fa-right-left'}];
/** Sub-tab rows (kit 2.2, 0.46.0): one level under a top-level tab; remembered per user with uiState. */
const IMPORT_TABS=[{id:'package',label:'Load and preview'},{id:'history',label:'Import history'}];
const SETUP_TABS=[{id:'general',label:'General'},{id:'screen',label:'Player screen'},{id:'sources',label:'Core sources'},{id:'developer',label:'Developer Tools'}];
const CODEX_TABS=[{id:'reveals',label:'Reveals'},{id:'notes',label:'Edit details'},{id:'preview',label:'Player preview'}];
const CODEX_VIEWS=CODEX_TABS.map(t=>t.id);
/** Kit badge tones for History results, check and pre-session rows (0.46.0). */
const RESULT_TONE=status=>/^(ok|created|updated|linked|pass|done)/i.test(String(status??''))?'ok':/(error|fail)/i.test(String(status??''))?'danger':/(warn|skip|partial)/i.test(String(status??''))?'warn':'';
const MOOD_TRANSITIONS=[{value:'',label:'Preset default'},{value:0,label:'Instant'},{value:3000,label:'3 s'},{value:10000,label:'10 s'},{value:30000,label:'30 s'}];
import {createCoreLinks, SOURCES_SETTING, LINK_HISTORY_SETTING} from './core-links.js';
import {createOrganizer, folderIndex, describePreview, readRulesFile, ORGANIZE_TYPES, SCHEMA_SETTING, HISTORY_SETTING, FLAG_PROTECTED} from './organize.js';
import {createBrowse, PAGE_SIZE, filterEntries} from './browse.js';
import {ITEM_VIEWS, IMPORT_VIEWS, SETUP_VIEWS, ORIGINS, RARITIES, DEFAULT_FILTERS, activeFilterCount, resolveTab} from './item-filters.js';
import {toolbarHtml, bodyHtml, facetsHtml, DEFAULT_STATE} from './browse-view.js';
import {cindersApi, cinderCaps, cinderChoices, worldCinderNames, planCinderArt, assignCinder, setCinderChoice, setAllCinderChoices, cinderConflicts, cinderWillLink, applyCinderArt} from './cinder-art.js';
import {ringRepairPlan, applyRingRepair, RING_SUBJECT_SCALE, listOf, sceneTokenRefs, sceneImagePaths} from './token-ring.js';
import {assetSources, defaultSource, listFolder, scanFolders, filterEntries as filterAssetEntries, crumbs, parentPath, createFolder, uploadFiles, UPLOAD_TONE, UPLOAD_LABEL, planAssetLinks, applyAssetLinks, resolvePick, linkableRecords, linkCounts, linkConflicts, rowReady, setRowChoice, setAllChoices, assignRecord, missingArtRows, ART_KINDS, ART_STATES, MANAGE_ON_FORGE_URL, stem} from './assets.js';
import {classifyFiles, stageFiles, stageSummary, setFileUpload, setUnmatchedUpload, unmatchedTickState, uploadSelection, unmatchedInFolder, removalList, removalText, STATUS_LABEL} from './asset-stage.js';

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const FOLDER_NAMES = {Item: "Ashen Gate — Imported Items", JournalEntry: "Ashen Gate — Imported Journals",
  Actor: "Ashen Gate — Imported Actors", RollTable: "Ashen Gate — Imported Roll Tables", Macro: "Ashen Gate — Imported Macros"};
// 0.47.0: "icon" is a re-import that only fills a placeholder icon (smart icons); nothing else on the document changes.
const actionAllowed = new Set(["create", "update", "metadata", "icon", "rebind"]);
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
/** The source flag with its managed-field baseline read back as flat paths (Foundry may have expanded it, 0.52.2). */
function sourceFlag(doc) {
  const flag=doc.getFlag(MODULE_ID, "source") ?? null;
  return flag?.managedFields ? {...flag, managedFields:baselineFields(flag.managedFields)} : flag;
}
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
  const data = structuredClone(record.foundry.data);
  if (kind==='Item' && data.system) data.system=withoutActivityEffectRefs(data.system); // raw activity eff_id links are resolved after the effects exist
  if (kind==='Item') data.system=withSourceLabel(data).system; // 0.91.0: custom source label "Ashen Gate", only when empty
  data.folder = folder.id;
  let icon=null;
  if(ICON_DOCUMENT_TYPES.includes(kind)) {
    // 0.47.0: a missing or placeholder icon gets a smart pick (the preview's, or the GM's Change… choice); authored icons stay.
    icon=await chooseImportIcon(record,{index:smart?iconIndexer().index:null,smart,probe:probeAsset,planned});
    data.img=icon.img;
    if(icon.source!=='authored') report({id:record.id,action:icon.source==='smart'?'icon-smart':'icon-fallback',status:'ok',icon:icon.img,reason:icon.reason,original:icon.original??null});
  }
  // 0.55.0: approved + player-visible Items, Journals and Actors start readable by players (Observer); everything else stays None.
  const ownershipLevel=initialOwnership({status:record.status,visibility:record.visibility,entityType:record.entity_type,sourceId:record.id},kind,CONST.DOCUMENT_OWNERSHIP_LEVELS);
  data.ownership = {default: ownershipLevel};
  // Keep authored Actor flags, but reserve Manager's own namespace for immutable source bindings.
  // Items keep only allow-listed flags (0.37.0); Manager's own namespace is always written from the record.
  data.flags = {...(kind==='Actor'?data.flags??{}:kind==='Item'?allowedItemFlags(data.flags):{}),[MODULE_ID]:{source:sourceMetadata(record, pkg, availableIds),
    [BASELINE_FLAG]:ownershipLevel,
    ...(icon?{iconSource:icon.source,iconPath:icon.img}:{})}};
  if(kind==='Item') {
    if(Array.isArray(data.effects)&&data.effects.length) data.effects=record.foundry.data.effects.map(effectCreateData);
    else delete data.effects;
  }
  if(kind==='RollTable'&&Array.isArray(data.results)) data.results=data.results.map(r=>resultCreateData(r,game.packs));
  if(kind==='Actor') {
    // Mark the package's embedded Items so a later opt-in update can tell them from player-added ones.
    const keys=itemKeys(data.items??[]);
    data.items=(data.items??[]).map((item,i)=>({...withSourceLabel(item),...(Array.isArray(item.effects)?{effects:upgradeEffectChanges(item.effects)}:{}),flags:{...(item.flags??{}),[MODULE_ID]:{...(item.flags?.[MODULE_ID]??{}),[ITEM_FLAG]:keys[i]}}}));
    data.flags[MODULE_ID][ACTOR_ITEMS_FLAG]={version:1};
  }
  return cls.create(data, bulk());
}
async function updateRecord(record, pkg, doc, patch, availableIds) {
  const update = {...patch};
  const source=sourceMetadata(record, pkg, availableIds);
  update[`flags.${MODULE_ID}.source`] = replacingSourceFlag(doc.getFlag?.(MODULE_ID,'source'), source);
  // 0.55.0: a re-import raises a plain None default to Observer when the record is approved and player-visible. Never lowers.
  if(releasable(doc,source,CONST.DOCUMENT_OWNERSHIP_LEVELS)) Object.assign(update,{'ownership.default':CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,[`flags.${MODULE_ID}.${BASELINE_FLAG}`]:CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER});
  // 0.91.0: an Item with no custom source label gets "Ashen Gate"; a label that is already there is never replaced.
  if(record.foundry?.document_type==='Item') Object.assign(update,withSourceLabelFields(doc,update));
  await doc.update(update, bulk());
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
  // 0.54.2: an unedited description that still carries the old References list is cleaned up on the next import of that record.
  // 0.71.0: an activity whose effect link is missing or stale is refreshed quietly (links are re-resolved after the write).
  if (record.foundry?.document_type==='Item' && matches[0].doc && activityLinksNeeded(record,matches[0].doc.toObject?.()??null))
    return {action:'metadata',patch:{},reason:'Metadata refresh: link activities to their effects.'};
  const live=matches[0].get?.('system.description.value');
  // 0.69.0: not when the source itself ends with a Related list (that list is wanted, see related-lists.mjs).
  if (typeof live==='string' && live!==stripReferenceBlock(live) && live===f?.managedFields?.['system.description.value']
    && !String(exportedFields(record)['system.description.value']??'').includes('data-ag-managed-links'))
    return {action:'metadata',patch:{},reason:'Metadata refresh: remove the old References list from the description (not edited since import).'};
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
const ACTION_TONE={create:'ok',update:'ok',metadata:'ok',icon:'ok',rebind:'ok',blocked:'danger',conflict:'danger'};
/** Preview thumbnails (0.47.0): the first ones only, and lazy, so a big file stays quick. */
const ICON_THUMBS=200;
const ASSET_PAGE=96;
const ICON_CONFIDENCE={high:'good match',medium:'likely match',low:'loose match'};
/** Items toolbar (0.43.0): one Load compendiums button and one Clear filters count for the shared filters and the All items facets. */
const packsLabel=status=>status.loading?'Loading compendiums…':status.compendiums?'Reload compendiums':'Load compendiums';
const browseFacetCount=st=>Object.values(st.filters??{}).filter(v=>v!==undefined&&v!==null&&v!==''&&v!=='all').length+(st.managedOnly?1:0)+(st.unlinkedOnly?1:0);
const statusTone=status=>['active','approved'].includes(status)?'ok':status==='draft'?'warn':'';

/** Help dialog (0.46.0: follows the new tabs). Longer explanations moved here from the tabs. */
const MANAGER_HELP=['<p><strong>Import</strong> (<em>Load and preview</em>): choose Manager JSON or a ZIP with <strong>Choose JSON or ZIP package…</strong>, pick an <strong>Import profile</strong> under Options (Development includes draft, proposed and example records), press <strong>Validate &amp; Preview</strong>, tick records, then <strong>Import</strong>. Load, ZIP files, Options and Preview fold open or shut (remembered on this device). Errors, review notes, links to other modules’ records and results are in the message bar at the bottom, with their counts; it opens by itself on new errors or a new result. A ZIP with several import files lists them: untick any you do not want, press Import selected files, then preview and Apply each in turn (Manager packages first). Or tick <strong>Import everything without stopping</strong> first: each file’s new records are imported without asking, updates to records already in the world only with <strong>Also apply updates to records that already exist</strong>, and it pauses only on a file with errors or a failed import. Scripts in a ZIP never run. <em>Import history</em> lists the imports applied so far.</p>',
  '<p><strong>Supported documents:</strong> Item, JournalEntry, Actor, RollTable and Macro, plus Locations, Routes and Shops (handed to Locations and Utilities). Existing Tables and Macros are never replaced. Existing Actors change only with <strong>Update existing actors</strong>: name, image, token settings and package items follow the file (art you set yourself, a portrait, token image or ring, is kept); HP, XP, level, conditions, player items, notes, ownership, folders and other modules’ data are kept. Item effects (each with a permanent eff_id) are listed under their Item; your own edits and hand-made effects are never touched.</p>',
  '<p><strong>Icons:</strong> with <strong>Choose icons for records without one</strong> (Options, on by default) a record with no icon or a placeholder one (Foundry\u2019s bag, mystery man or d20, dnd5e\u2019s default art, Manager\u2019s generic icons) gets a fitting icon from Foundry\u2019s icon library, picked from its name and tags. The Icon column shows each pick and why; <strong>Change…</strong> picks another. When nothing fits the name well enough it says <strong>no confident match</strong> and the generic icon is used. An icon set in the file, or by you in Foundry, is never replaced. The library is indexed once per browser (\u201cIndexing icons…\u201d); if it cannot be read, generic icons are used. <strong>Re-pick smart icons</strong> picks again for icons Manager chose before. For documents already in the world, use <em>Items \u2192 Checks \u2192 Improve icons</em>.</p>',
  '<p><strong>Items</strong> sub-tabs: <strong>Browse</strong> (one search over world documents, Ashen Gate records from every module and, after Load compendiums, compendium indexes), <strong>Records</strong> (Manager-imported records by permanent id), <strong>Folders</strong>, <strong>Core links</strong>, <strong>Checks</strong> (library check, housekeeping report, <strong>Release player-visible records</strong> and Improve icons), <strong>Assets</strong> (browse, add and link art files, below) and <strong>Export</strong>. The search box and <strong>Filters (n)</strong> (source, type, origin, rarity, folder, has core_ref, and on Browse its own facets) apply on Browse, Records, Folders and Core links and stay as you switch between them. Search words, or prefixes such as type:deity, type:npc-codex, tag:, status:, tier:major. Pick an item’s name to see dnd5e’s item card; drag a world or compendium row onto a sheet, the canvas or a journal. Open on an NPC goes to the NPC Codex tab; Open on a deity opens Renown’s Pantheon.</p>',
  '<p><strong>Folders:</strong> <em>Clean compendiums</em> scans the world sidebar and every compendium against the folder rules and lists each document that is not in its folder; nothing moves until Apply, and Undo puts the last 5 runs back. <em>Organize a selection</em> does the same for what the filters pick, or one folder. Default rules: Ashen Gate records go to <strong>Ashen Gate</strong>; other Items go to <strong>Core 5.5e</strong> only with real evidence (a Plutonium import, a core source book, a copy from a dnd5e compendium or a D&amp;D Beyond import, the last two marked weak); anything else goes to <strong>Homebrew</strong>. dnd5e gives every new item rules "2024", so that alone counts as Homebrew. Player characters, player-owned actors, protected folders and documents marked Keep here never move; locked, module and system compendiums are inspect-only. Only the folder changes: nothing is renamed, edited or deleted.</p>',
  '<p><strong>Assets:</strong> browse the Forge Assets Library (or the Foundry data folder) as thumbnails with folders, search and <em>Copy path</em>. Drop several images onto the folder, or use <em>Choose files…</em>: Manager first reads the file names and shows how many fit a record and how many fit none, under <em>Files waiting to upload</em>. Files that fit no record start unticked and are not uploaded unless you tick them (or tick <em>Upload unmatched files too</em>); nothing is uploaded until you press the upload button, and files already there are only replaced if you say so. Afterwards <em>Link files to records</em> lists the files in the folder with <em>Files with no match</em>: tick the ones to delete and copy the list, because Foundry and The Forge give modules no way to delete files, so you delete them in the Assets Library (<em>Open the Assets Library</em>). Manager never deletes a file, and never lists one that is a record’s image. <em>Create folder…</em> adds a folder. <em>Link files to records</em> finds files named after a record’s permanent id (for example NPC-OREN.webp), lists the old and new image, and changes nothing until you press Link; images you set in Foundry stay unless you tick them, and Actors are not changed (use Import with Update existing actors). Files named like <em>Echo_Cinder_Stage_1.webp</em> (Ember, Frost, Gale, Echo, Lumen, Root, Stone, Tide, Veil, Crimson, and any other one-word Cinder you have imported; stages 1 to 5) are grouped per Cinder and shown as one row with its stages in order; Link sets that Cinder’s art stages through Ashen Gate | Cinders. <em>Missing art</em> lists records with no image or a generic one. Rename, move and delete are not available to modules, so use <em>Manage on Forge…</em>.</p>',
  '<p><strong>NPC Codex:</strong> <em>Reveal to…</em> (on every NPC in the list, on the open NPC and in the header menu of an NPC&rsquo;s Actor sheet) picks characters and fields in one small window. On <em>Reveals</em>, tick several fields, choose Hidden, Whole party or chosen characters, then <em>Apply</em>; <em>Reveal basics</em> and <em>Reveal everything player-safe</em> do it in one click, and <em>Undo last reveal</em> puts the last one back. The chips show who can see each field now; per-field controls below fine-tune one field. All of this applies at once. <em>Edit details</em> edits the NPC&rsquo;s name, role, appearance, signature line, wants, knows, portrayal, session role and GM notes in your world (a layer over the pack record, so a Sync never overwrites it; a changed field shows <em>Edited in your world</em> and <em>Revert to pack text</em>; players see your edited text for anything you have revealed), sets Status (Alive, Deceased or Unknown; players see it only when you reveal Status, and no preset reveals it) and holds what the party has learned, connections and your GM notes, all saved with Save Changes. A lock beside a field, and the single <em>Only you</em> chip by the name, mean players never see it. <em>Player preview</em> shows exactly what the party or one character receives. Whether players can open the codex at all is on the Modules tab.</p>',
  '<p><strong>Who can read imported Items (0.72.0):</strong> by default Items are GM-only: GM Setup &gt; Items and players. To hide or release Items already in your world use Items &gt; Checks &gt; Player access to Items. Handout Items always stay readable.</p>',
  '<p><strong>Materials are visible to players (0.89.0):</strong> an approved Material marked <em>player</em> visibility is created readable by players (default ownership Observer) even while new Items are GM-only, so a player can open one a gather gives them or a recipe links to. A re-import or Sync only raises a plain None default to Observer for such a Material, never lowers anything, and never touches per-player ownership. GM-only and draft Materials and every other Item are untouched. For Materials already in your world use <strong>Items → Checks → Materials visible to players → Make materials visible to players…</strong>: the confirmation lists how many Items change, how many are already visible and how many are skipped, with the reason (draft, GM-only, archived, or hidden on purpose); press the button on the right to apply, Cancel on the left to leave everything as it is. Running it again changes nothing more.</p>',
 '<p><strong>Release items in use (0.95.0):</strong> Skill Trees shows a perk to a player, and the Profession Ledger opens an Item for a player, only when the Item is readable by players, and Manager imports Items GM-only. <strong>Items → Checks → Items your players use → Release items in use…</strong> releases just what the current party uses, one tier at a time: for each character a player owns, the perks and recipes of every profession they hold at their current tier and below (with the materials and output items those recipes need), and for each bound Cinder its signature ability and passive, the core powers whose tier requirement they have reached and the enhancements of powers they have unlocked. Professions and Cinders nobody uses stay GM-only, as do draft, GM-only and revealed-later records. The confirmation lists the Items that would change for each character and profession or Cinder, then <strong>Release N items</strong> on the right and Cancel on the left. Only a default of None is raised, to Observer; nothing is lowered and per-player ownership is untouched. Run it again after a tier-up to release the new tier. Players still see only the recipes they have learned in the Ledger.</p>',
  '<p><strong>Who can see imported records:</strong> since 0.55.0 an Item, Journal entry or Actor whose record is <em>approved</em> and has <em>player</em> visibility is created readable by players (default ownership Observer); GM-only, revealed-later and draft records stay hidden (None). A re-import raises a hidden default to Observer for such a record, never lowers one and never touches a level you set yourself or per-user entries. Worlds imported before 0.55.0 need a one-time fix: <strong>Items → Checks → Release player-visible records…</strong> finds the approved, player-visible records players still cannot read (without it Profession Ledger and other modules show them as <em>Unreleased</em>), lists the counts and a few examples, and releases them in chunks with Cancel. Running it again does nothing. The Pre-session check has a <em>Player visibility</em> line that points here.</p>',
  '<p><strong>Ashen Gate source label (0.91.0):</strong> every Item made from an Ashen Gate record gets the Custom Label <em>Ashen Gate</em> (on the Item sheet, <em>Configure Source</em>), so the sheet header names its source. It is only filled in when the label is empty: a label you typed is never replaced or cleared, and a re-import or Sync fills an empty one but keeps one that is there. Core links keeps the label when it adopts a core item (the core item\u2019s description and source book still replace the Item\u2019s own, as before). For Items already in your world use <strong>Items \u2192 Checks \u2192 Ashen Gate source label \u2192 Set Ashen Gate source label\u2026</strong>: the confirmation says how many Items change and how many already have a label; press the button on the right to apply, Cancel on the left to leave everything as it is. Items that did not come from an Ashen Gate record are never touched, and running it again changes nothing more.</p>',
  '<p><strong>Modules:</strong> open each Ashen Gate module and see whether its player window is <strong>Visible to players</strong> or <strong>Hidden</strong>. Reveal and Hide change that module’s own Player Access setting (General Manager’s card is its NPC Codex); <strong>Hide all</strong> asks first. Hiding never deletes progress. The <strong>Pre-session check</strong> is read-only: it reports module versions, GM storage, Player Access, [TEST] data, hidden names in player views and the Locations migration, plus content links (craft recipes whose result or materials are missing, skill tree perks with no Item, Items with a core_ref still to adopt in Items &gt; Core links, Profession Ledger tool and skill names it cannot match, and quest item rewards whose item is gone). <strong>Clear results</strong> only removes the report from this window.</p>',
  '<p><strong>Scenes:</strong> <em>Live</em> applies a base mood, layers on top and a fine-tune draft to the current scene; <em>Moods &amp; layers</em> edits the presets; <em>Looks</em> saves a mood plus layers and applies it to chosen scenes or a folder after a preview; <em>Export &amp; import</em> shares the presets as a file. Live also has a Time of day blend (fills the fine-tune draft), Random weather (a seeded proposal you preview) and a No flashing switch. Nothing changes a scene until you press Apply.</p>',
  '<p><strong>GM Setup:</strong> <em>General</em> sets the world default skin (players who have not picked their own see it live), whether the game pause shows as a small indicator, who can read new Items, and the NPC Codex note. <em>Player screen</em> holds everything about what players see on their own screen; it is all visual only, you always see the normal screen, and nothing is locked, removed or re-permissioned. It has five groups. <strong>Sidebar tabs</strong> is one checklist, <em>Tabs players keep</em>: untick a tab to hide it from players (Chat is always kept; tabs other modules add are listed too), and the remaining tabs close up with no gap; <em>Keep everything</em> and <em>Keep Chat only</em> tick or untick the whole list for you, and nothing changes until Save Changes. A player who had a hidden tab open lands on Chat, and with the player dock on they can still open Combat and Foundry Settings from it. This list replaces the old Hide the Journals tab, Hide the Compendiums tab and Show players only the Chat tab switches: the first time you open the world as GM your old choices are copied into the checklist (nothing else is changed). <strong>Directory filters</strong>: <em>Show players only Player Handouts in the Items tab</em> (the folder named Player Handouts and its subfolders; an empty list if there is none) and <em>Show players only the Players folder in the Actors tab</em> (the same for a folder named Players; the Ashen Gate buttons in that tab stay). Item and Actor access is unchanged. <strong>Scene controls and navigation</strong>: <em>Hide Region Controls and Journal Notes from players\' scene controls</em> and <em>Move players\' scene controls under the player dock</em> (needs the dock; the tools then show as one row of Select, Select Targets, Measure and Find My Token). The scene navigation always stays in its normal top left place; only when the player dock is in the top left corner is it slid to the right of the dock (and of the token controls under it) so nothing overlaps, with no space reserved for its scene list. In any other corner it is not touched. <strong>Player dock</strong>: <em>Show the player dock</em> and <em>Player dock corner</em> (top left, top right, bottom left or bottom right; the dock, the token controls under it and anything docked to it all move with the corner): Combat, <em>Conditions</em> and <em>Quest Log</em> buttons, a <em>User Settings</em> button, a <em>Foundry Settings</em> button, an Ashen Gate menu of the windows that player may open and a minimize button on the top row (beside the character portrait when the Character Hub shows one). Since 0.94.0 the dock stays in front of Ashen Gate and Foundry windows (Character Hub, Skill Trees, Locations, Quest Log, sheets), so a window dragged over it no longer hides it and its buttons keep working; Foundry dialogs, tooltips, notifications and menus still appear above it, and a minimized dock can still be covered; top to bottom: Combat, Conditions, Quest Log, User Settings, Foundry Settings, Ashen Gate. Combat, Conditions, Quest Log, User Settings and Foundry Settings open on the first press and close on the second (closing User Settings with its own X also resets the button). Each module button, and each window in the Ashen Gate menu, is shown only while its module is active and its Player Access is on, and appears or disappears as soon as you change Player Access, with no reload. Also here: <em>Hide the players list from players</em>. <strong>Collapse</strong>: <em>Start players with the sidebar collapsed</em> (applied once when a player loads the game; they can expand it afterwards) and <em>Auto-collapse chat and Settings after (seconds)</em> (default 8, 0 is off; the sidebar chat or Settings panel a player opened closes after that long unused, never while they type, hover or have a window open from it; you are never collapsed). <em>Core sources</em> tells Core links where to look, and <em>Developer Tools</em> holds the example package, sample files and the Adopt &amp; tag review workflow. Settings save only with <strong>Save Changes</strong>; Cancel drops them. <strong>My Appearance</strong> in the header is your own skin and size.</p>',
  '<p><strong>Pull from GitHub</strong> (Import, above the sync switch): reads your content pack straight from a GitHub repository instead of ZIP files. Enter the repository (owner/name), branch and the folder or manifest file of the pack, paste a read-only token (a fine-grained token for that one repository with Contents set to read), press <strong>Find packs</strong>, tick the packs and press <strong>Pull selected packs</strong>. The token is kept on this device only, never in the world and never visible to players; <strong>Remove token…</strong> deletes it. <strong>Check for updates</strong> says whether the files changed since your last pull. Pulled files go to Sync from package for its full preview (or, if you prefer, to the normal import); nothing changes before you confirm. Pulling again does not replace the files Sync already holds: press <strong>Preview in Sync from package</strong> again to load the new pull (Sync says so while it still holds an older one). If any file cannot be read, nothing is sent on. A folder with no manifest is offered as a pack of its JSON files in name order, but starts unticked: tick it only if you want it. Gathering node files are left for the Profession Ledger\u2019s own import.</p>',
  '<p><strong>Back up world to GitHub</strong> (Items &gt; Export, <em>Back up world now…</em>): copies the current state of your content to a branch of a <em>private</em> GitHub repository so it can be read from GitHub without pasting exports. A confirmation lists one tick box per type and writes only the ones you tick: <em>Edited Items</em>, <em>Edited Journals</em>, <em>Edited Actors</em>, <em>Edited Roll Tables</em> and <em>Edited Macros</em> (together the file <code>manager-edits.json</code>, the same bundle as Export edited records, including records made by hand), <em>Locations</em> (<code>locations.json</code>), <em>Quests, Orders and Contracts</em> (<code>quests.json</code>, Quest Log\u2019s own Export JSON), <em>Factions and deities</em> (<code>factions.json</code>, Renown\u2019s own Export, definitions only) <em>Shops</em> (<code>shops.json</code>) and <em>Renown standings and claims</em> (<code>standings.json</code>, from Renown\u2019s <code>exportState</code>, schema <code>ag-factions-state-export/0.1</code>: <strong>play state</strong> such as each faction\u2019s and character\u2019s standing, claims, requests, reveals, membership and Vows, not content; it needs Renown 0.27.0 or later) and <em>Party characters</em> (<code>party.json</code>, schema <code>ag-party-sheets-export/0.1</code>: <strong>play state</strong>, a slim readable copy of each player\u2019s character sheet: class, abilities, HP, AC, proficiencies, features, spells, inventory and, when those modules are active, Ledger professions, Cinders and Skill Trees points; no biography, notes or effects; only characters a player owns). All are ticked the first time; your last choice is remembered on this device. A type you leave unticked is <strong>not written and not removed</strong>: its earlier file stays on the branch as it was. A module that is missing, inactive or too old to offer its export is not offered and the dialog says why (update Quest Log or Renown if their types are missing; standings need Renown 0.27.0 or later). Quest progress is not included, and a backup changes nothing in your world. Before anything is written, GitHub is asked whether the repository is private, and a public repository or the default branch is refused. The repository, branch (default <em>world-backup</em>, created if missing) and token are set in <strong>GM Setup &gt; General &gt; World backup</strong> and saved with Save Changes; the token stays on this device only and <em>Clear token…</em> removes it. To make the token: (1) on GitHub open Settings, Developer settings, Fine-grained tokens and choose Generate new token; (2) under Repository access choose Only select repositories and pick the backup repository; (3) under Repository permissions set Contents to Read and write.</p>',
  '<p><strong>Sync from package</strong> (Import, switch at the top; off by default): makes the world match the files you choose, as if they were literally the old files. Tick the switch, choose every file of the sync in one go (for the two-ZIP pack, both the main and the sandbox ZIP; a ZIP with an import-order manifest holds a whole pack), press <strong>Preview sync</strong> and read it: <em>Create</em>, <em>Overwrite</em> (open a record for its field-by-field differences), <em>Kept: edited in your world</em>, <em>Delete</em> (every record by name and kind) and <em>Untouched</em>. A record matches by its permanent id, never its name, and a record you have not edited is updated to the package, while one you edited since the import is kept as it is (listed under <em>Kept: edited in your world</em> with what would differ) unless you tick <strong>Also overwrite records I edited</strong>, which lets the package win, your edits included (but never your art: a portrait, token image or token ring you set yourself, for example with Link files to records, is always kept, never makes a record count as edited, and is listed under <em>Keeping your art</em>; only the separate, off-by-default <strong>Also replace art I set</strong> replaces it), and also deletes edited records the files no longer carry (otherwise those are kept too, under <em>Kept: edited in your world, no longer in the package</em>). NPC Actors take the package\u2019s abilities, AC, max HP, items, image and token but keep current and temporary HP, item quantities and uses, and the biography. A record the package <strong>renamed</strong> is renamed in your world too, under <em>Renames</em> (Old name \u2192 New name; the same document, so its id, links, folder, ownership and sheets stay), and when renames are all a run does there is no phrase to type; a name you changed by hand is not renamed unless you tick <em>Also overwrite records I edited</em>. <strong>Also update Actors from the package</strong> (Advanced, off by default) brings an NPC\u2019s new stat block: ability scores, skills, traits, AC, max HP, name and the items, features and spells that came from the package follow the package where it changed since the last import; your art, token settings, ownership, folder, biography notes, items you added, current HP (until the NPC is back at its imported HP), item uses and quantities are kept. They are listed under <em>Actor updates</em>. Only documents Manager imported from the package lines in this sync, and that no chosen file mentions, are deleted; documents Manager did not import are never touched, and neither are Keep here, protected-folder, player-owned, placed-on-a-scene or hotbar documents (listed as <em>Not removed</em>). Character sheets (player characters, their Items, effects and flags, hotbars) are never touched, and an Item that is also on a sheet stays there as it is. <strong>Clear inputs…</strong> empties the Import page (files, preview, ticks, the typed confirmation) without touching your world, backups or settings; after a sync that did not finish it is <strong>Discard the unfinished sync…</strong>, a separate confirmation. The page is three steps (Choose, Preview, Confirm and run) with rarely used options under <strong>Advanced</strong>. An Item activity can link to its effect with <code>effects: [{"eff_id": …}]</code>; Manager points it at the live effect after the effects exist, on every import and sync, and warns about an eff_id it cannot find. Creatures imported earlier into the old Actor folders <em>Draft Frontier Creatures</em> and <em>Draft Ashen Additions</em> are moved once into <em>Ashen Gate/Bestiary</em>; no folder is deleted. A recipe shows one requirement: <em>Workstation</em> for a station recipe, <em>Tools</em> (any one of them) for a tool recipe, or <em>Tools: Profession default</em>. The progress line names the step, the record and the time; if nothing moves for 60 s it says so, <strong>Cancel sync</strong> stops between chunks, and if your connection drops Sync stops with a message: reload the page and run the same Sync again, it resumes without repeating what is done. Quests, trees, factions, deities and the like go to their own modules in update mode (Renown shows what it will update per record, saves a snapshot of the old definitions first, keeps standings, claims, requests, choices and what the party learned, and keeps a definition you edited in Renown unless you tick <strong>Also overwrite records I edited</strong>; an older Renown only adds new ones and the preview says it needs an update); ones a newer package drops are listed as <em>Not removed: remove it in</em> that module. <strong>Locations, routes and shops</strong> (handed to Locations and Utilities) are different: with <strong>Also update existing locations, routes and shops</strong> off (Advanced, the default) Sync never replaces one that Locations or Utilities already holds. It lists them under <em>Kept: update switch off</em> and still creates the new ones; tick the switch to replace their definitions (reveal and play state, shop stock, coins and sales are always kept). <strong>Where the update switches live:</strong> in a plain Import, <em>Update existing locations, routes and shops</em> appears in the file options only when the loaded file has location, route or shop records; in Sync it is the Advanced switch above (it is not remembered between sessions). Quest Log and Renown records are not affected by either: they have their own update mode. Manager remembers what it handed each module, so a record that has not changed since is listed as <em>Already matches the package</em> and is not passed on again; the first Sync after this feature says <em>No earlier import is recorded for this record</em> and passes it on once. A record you edited in that module&rsquo;s own window shows <em>Kept: edited in</em> that module and is replaced only when you tick <strong>Also overwrite records I edited</strong>. Type <strong>Replace content from package</strong> and press the red button; a JSON backup of everything overwritten or deleted downloads first (if it cannot be saved nothing is written). It works in small chunks with <strong>Cancel sync</strong>; running the same files again finishes a cancelled run and changes nothing once done. A deleted id stays retired and is not reused. Records imported by an older Manager have no package line and are kept unless you tick <strong>Also delete records not in these files</strong>.</p>',
  '<p><strong>Replacing a record</strong> (<code>supersedes</code>): when a new record says it replaces an old permanent id and that old document is in your world, the preview shows <em>Replaces &lt;old name&gt;</em> with <strong>Yes, replace it</strong>, <strong>No, add separately</strong> or <strong>Skip</strong>. Yes keeps the same document (tokens, ownership, folder, links, Codex notes) and gives it the new name and content; items and pages you added, current HP and a token ring that is already on stay. A backup of the old documents downloads first; Sync also never deletes a document whose id is replaced. Renown and Quest Log are asked to move their saved ids to the new ones, keeping progress.</p>',
  '<p><strong>Reference links</strong> (<code>@AGRef[id]{Label}</code>): a reference to a person or a handout in any description, journal page or biography shows the record&rsquo;s name with an icon, never its id. A handout opens its Item twin when there is one and you may see it. Players only get links to what they may open (a person opens in the NPC Codex once it reveals them); otherwise it is plain text. For the GM a person opens the Actor sheet, also inside Monk&rsquo;s Enhanced Journal.</p>',
  '<p><strong>Related lists</strong>: an Item whose <em>refs</em> point at a person, a handout or a quest, order or contract ends with a short <strong>Related</strong> list (up to 5 links: handouts, then people, then quests). Import and Sync from package write it and keep it up to date; gear, materials, recipes, shops and locations get none, and an Item you edited in Foundry is left alone. Players see names and only the links they may open.</p>',
  '<p>Back up a test world before importing.</p>'].join('');
class AshenGateManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "ashen-gate-manager-window",
    classes: ["ag-app","ashen-gate-manager"],
    window: {title:"Ashen Gate | General Manager", icon:"fa-solid fa-boxes-stacked", resizable:true},
    position: {width:1000, height:760}
  };
  // One scroll region per pane (header and tabs stay put); the Items list column scrolls on its own. Both keep their place on re-render.
  static PARTS = {main: {template: `modules/${MODULE_ID}/templates/manager.hbs`, scrollable: [".agm-pane", ".aglib-rows", ".ag-split__detail", ".agm-drawer__body", ".agm-preview-table"]}};

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
    this.supersedeChoices = {};
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
    // Items → Assets (0.57.0). Nothing here is saved: it is a view of the file library and of the last scan.
    this.assets = {cinderPickerKey:null, pickerKey:null, source:null, target:'', listing:null, loading:false, query:'', shown:ASSET_PAGE, uploads:[], uploadMessage:'', uploading:false, abort:null,
      scan:null, linkFiles:[], links:null, tokenRing:true, sceneTokens:true, ringRepair:{plan:null,message:'',scene:true}, staged:null, deleteList:new Set(), lastUpload:null, linkMessage:'', scanning:false, missing:{kind:'all', state:'all', query:''}, message:''};
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
    this.previewShown = PREVIEW_PAGE;
    // 0.56.0 Sync from package: off by default; its files, preview and progress live here, apart from the normal import.
    this.sync = {on:false, inputs:[], githubStale:null, set:null, plan:null, deleteUnscoped:false, overwriteEdited:false, replaceArt:false, recreateTypeChange:false, updateActors:false, archiveMissing:false, updateExternal:false, phrase:'', progress:null, stopping:false, abort:null, result:null, message:'Choose the package files, then press Preview sync. Nothing in your world changes before you confirm.'};
    // 0.59.0 Pull from GitHub: the form draft, the packs found and the last pull. The token is never kept here beyond what is typed.
    this.gh = {draft:null, dirty:false, packs:[], selected:[], rows:[], progress:null, message:null, update:null, pulled:null, abort:null, stopping:false};
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
    this.codexMessage = "Reveal an NPC to the party or to single characters: use Reveal to… for a quick pick, or tick several fields on Reveals. Players only ever receive what is revealed.";
    // 0.67.0: the Reveals tab's multi-field panel keeps its ticks per NPC across re-renders; codexNote is the last reveal's confirmation line.
    this.codexBulk = new Map();
    this.codexNote = null;
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
    // 0.61.0: blend slider, random weather, looks. Kept only while the window is open.
    this.moodBlend = {from:'day', to:'night', t:0};
    this.moodRoll = {seed:'', keepMood:true, plan:null};
    this.lookId = ''; this.lookMode = 'scenes'; this.lookScenes = new Set(); this.lookFolder = ''; this.lookPlaylist = false;
    this.lookSave = {playlistId:'', action:'start'};
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
    this.releasePreview = null;
    this.releaseMessage = "";
    this.releaseAbort = null;
    this.itemVis = null;
    this.itemVisMessage = "";
    this.matVisMessage = "";
    this.srcLabelMessage = "";
    this.inUseMessage = "";
    this.releasePct = 0;
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
  /**
   * Export edited records (0.77.0): options, then a preview (counts and the edited records with their changed fields), then one
   * download. Read-only: nothing in the world, no flag and no setting is written (world-edits.js); the GM check is in the data layer.
   */
  async #exportEdits() {
    try {
      if(!game.user?.isGM)throw new Error('Only the GM can export edited records.');
      const form=await formDialog('Export edited records',[
        {name:'types',label:'Record types',type:'checklist',options:EDIT_TYPES.map(t=>({value:t,label:TYPE_LABELS[t],checked:true})),hint:'Untick a type to leave it out of a large world. Player characters are never included.'},
        {name:'unchanged',label:'Include unchanged records',type:'checkbox',checked:false,hint:'Also list records you did not edit (for a complete copy of the imported content).'},
        {name:'worldOnly',label:'Include records not in any package',type:'checkbox',checked:false,hint:'Also list documents you made by hand (name and short text only), so they can be added to the content pack.'}
      ],{ok:'Preview…'});
      if(!form)return;
      const types=form.types??[];
      if(!types.length)return toast('Tick at least one record type.',true);
      const scan=scanWorldEdits(game,{types,includeUnchanged:Boolean(form.unchanged?.length),includeWorldOnly:Boolean(form.worldOnly?.length)});
      for(;;){
        const pick=await choiceDialog('Edited records',editsPreviewHtml(scan),[
          {action:'copy',label:'Copy summary',icon:'fa-solid fa-copy'},
          {action:'download',label:'Download file',icon:'fa-solid fa-download',default:true}]);
        if(pick==='copy'){
          const text=editsSummaryText(scan);
          try{await (game.clipboard?.copyPlainText?.(text)??navigator.clipboard.writeText(text));toast('Summary copied.');}
          catch{toast('Could not copy automatically.',true);}
          continue;
        }
        if(pick==='download'){
          const out=buildEditsFile(game,scan);
          downloadJson(out.filename,out.file);
          toast(`Saved ${out.filename}: ${scan.records.length} record(s)${scan.includeWorldOnly?`, ${scan.worldOnly.length} not in a package`:''}. Nothing in your world changed.`);
        }
        break;
      }
    } catch(error){toast(String(error.message??error),true);}
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
  /**
   * Read-only: runPreSessionCheck never writes; Copy and Download reuse the last result. Clear (0.53.0) only drops that
   * result from this window: the report is kept nowhere else (no setting or flag), so nothing in the world changes.
   */
  async #preSession(name) {
    try {
      if(!game.user?.isGM)throw new Error('Only the GM can run the pre-session check.');
      // Clear disables itself, so focus goes to Run; Run keeps focus on Run.
      if(name==='presession-clear'){this.preSessionResult=null;this.focusAfterRender='[data-ag-action="presession-run"]';await this.render();return;}
      if(name==='presession-run'){this.focusAfterRender='[data-ag-action="presession-run"]';this.preSessionResult=await runPreSessionCheck(game);}
      else if(!this.preSessionResult) this.preSessionResult=await runPreSessionCheck(game);
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
    const ctx={tabsHtml:subTabs({group:'agm-scenes',label:'Scenes sections',tabs:MOOD_VIEWS,selected:this.moodView}),panelAttrs:tabPanelAttrs('agm-scenes',this.moodView),live:this.moodView==='live',library:this.moodView==='library',looks:this.moodView==='looks',share:this.moodView==='share',
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
      const moodOptions=selected=>moods.map(m=>({id:m.id,label:m.label,selected:m.id===selected}));
      ctx.blend={from:moodOptions(this.moodBlend.from),to:moodOptions(this.moodBlend.to),percent:Math.round(this.moodBlend.t*100)};
      ctx.calm=Boolean(list.calm);
      ctx.roll={seed:this.moodRoll.seed,keepMood:this.moodRoll.keepMood,plan:this.moodRoll.plan};
    }
    if(ctx.library){
      const fresh=[...(list.newDefaults?.moods??[]),...(list.newDefaults?.layers??[])];
      ctx.newDefaultsCount=fresh.length;ctx.newDefaultsText=fresh.join(', ');
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
    if(ctx.looks)Object.assign(ctx,this.#looksContext(state,moods,layers));
    if(ctx.share&&this.moodImport) ctx.import={filename:this.moodImport.filename,items:this.moodImport.items.map(i=>{
      const choice=this.moodImport.choices[`${i.kind}:${i.id}`]??'keep';
      return {...i,isNew:i.status==='new',isSame:i.status==='same',isConflict:i.status==='conflict',isInvalid:i.status==='invalid',
        problems:(i.problems??[]).join(' '),keep:choice==='keep',replace:choice==='replace',both:choice==='both'};
    })};
    return ctx;
  }
  /** Looks sub-tab (0.61.0): saved looks, the scenes to apply to, the preview list and the default look. */
  #looksContext(state,moods,layers) {
    const lk=sceneLooks();
    const looks=lk.listLooks().looks??[];
    if(!looks.some(l=>l.id===this.lookId))this.lookId=looks[0]?.id??'';
    const playlists=lk.listPlaylists().playlists??[];
    const playlistName=id=>playlists.find(p=>p.id===id)?.name??'a playlist that is no longer in this world';
    const moodLabel=id=>moods.find(m=>m.id===id)?.label??id, layerLabel=id=>layers.find(l=>l.id===id)?.label??id;
    const describe=l=>[l.moodId?`Mood: ${moodLabel(l.moodId)}`:'Keeps the scene\'s mood',l.layerIds.length?`Layers: ${l.layerIds.map(layerLabel).join(', ')}`:'No layers',
      ...(l.playlist?[`${l.playlist.action==='start'?'Starts':'Stops'} ${playlistName(l.playlist.id)} (only if you tick it)`]:[])].join(' · ');
    const look=looks.find(l=>l.id===this.lookId)??null;
    const sc=lk.listScenes();
    const scenes=(sc.scenes??[]).map(s=>({...s,checked:this.lookScenes.has(s.id),label:s.folder?`${s.name} (${s.folder})`:s.name}));
    const folders=(sc.folders??[]).map(f=>({...f,selected:f.id===this.lookFolder}));
    const targets=this.lookMode==='folder'?(this.lookFolder?lk.sceneIdsInFolder(this.lookFolder).sceneIds:[]):scenes.filter(s=>s.checked).map(s=>s.id);
    const pv=look&&targets.length?lk.previewLook(look.id,targets):null;
    const rows=(pv?.rows??[]).map(r=>{
      const blocked=r.problems.length>0;
      const parts=[r.setsMood?(r.setsMood.alreadyOn?`${r.setsMood.label} already set`:`sets ${r.setsMood.label}`):'',r.adds.length?`adds ${r.adds.join(', ')}`:'',r.already.length?`${r.already.join(', ')} already on`:''].filter(Boolean);
      return {name:r.name,blocked,willChange:!blocked&&r.changes,nothing:!blocked&&!r.changes,
        detail:blocked?r.problems.join(' '):(parts.join(' · ')||'Nothing to change')};
    });
    const undo=lk.describeUndo();
    const dl=state.scene?lk.getDefaultLook(state.scene.id):null;
    return {lookData:{
      hasLooks:looks.length>0,items:looks.map(l=>({...l,selected:l.id===this.lookId,summary:describe(l)})),selected:look?{...look,summary:describe(look)}:null,
      playlistChoice:look?.playlist?{label:`${look.playlist.action==='start'?'Start':'Stop'} playlist ${playlistName(look.playlist.id)}`,checked:this.lookPlaylist}:null,
      modeScenes:this.lookMode==='scenes',modeFolder:this.lookMode==='folder',scenes,folders,hasFolders:folders.length>0,folderChosen:Boolean(this.lookFolder),
      targetCount:targets.length,rows,hasRows:rows.length>0,willChange:pv?.willChange??0,canApply:Boolean(look)&&(pv?.willChange??0)>0,
      undo:undo?{label:undo.label,count:undo.scenes.length,names:undo.scenes.join(', ')}:null,
      savePlaylists:[{id:'',label:'No playlist',selected:!this.lookSave.playlistId},...playlists.map(p=>({id:p.id,label:p.name,selected:p.id===this.lookSave.playlistId}))],
      saveStart:this.lookSave.action==='start',saveStop:this.lookSave.action==='stop',hasPlaylists:playlists.length>0,
      canSave:Boolean(state.scene&&(state.mood||state.layers?.length)),
      defaultOptions:[{id:'',label:'No default look',selected:!dl?.lookId},...looks.map(l=>({id:l.id,label:l.label,selected:l.id===dl?.lookId}))],
      defaultSceneName:state.scene?.name??'',hasDefaultScene:Boolean(state.scene),auto:Boolean(dl?.auto)}};
  }
  async #looksAction(name) {
    const lk=sceneLooks();
    if(name==='look-save'){
      const base=lk.lookFromScene(this.moodSceneId||undefined);
      if(!base.ok){toast(base.message,true);this.moodMessage=base.message;return this.render();}
      const label=await promptText('Save this look',`Name for the look on ${base.sceneName}`,'',{ok:'Save look'});
      if(!label||!String(label).trim())return;
      const playlist=this.lookSave.playlistId?{id:this.lookSave.playlistId,action:this.lookSave.action}:null;
      const trial=lk.listLooks().looks.find(l=>l.label.toLowerCase()===String(label).trim().toLowerCase());
      if(trial&&!await confirmDialog(`A look called "${trial.label}" already exists. Replace it with this scene's current mood and layers? Scenes are not changed.`,{title:'Replace this look?',yes:'Replace look'}))return;
      const out=await lk.saveLook({label,moodId:base.moodId,layerIds:base.layerIds,playlist});
      if(out.ok)this.lookId=out.look.id;
      return this.#moodResult(Promise.resolve(out));
    }
    if(name==='look-remove'){
      const look=lk.listLooks().looks.find(l=>l.id===this.lookId);
      if(!look)return;
      const yes=await confirmDanger(`Remove the look "${look.label}"? Scenes that already show it keep their look.`,{title:'Remove this look?',yes:'Remove look'});
      if(yes)await this.#moodResult(lk.removeLook(look.id));
      return;
    }
    if(name==='look-apply'){
      const pv=this.#lookTargets();
      const look=lk.listLooks().looks.find(l=>l.id===this.lookId);
      if(!look||!pv.length)return;
      const n=lk.previewLook(look.id,pv).willChange;
      const yes=await confirmDialog(`Apply "${look.label}" to ${n} scene${n===1?'':'s'}? Everyone on those scenes sees the change. Undo last batch puts them back.`,{title:'Apply this look?',yes:'Apply look'});
      if(!yes)return;
      await this.#moodResult(lk.applyLook(look.id,pv,{animate:this.#moodAnimate(true),startPlaylist:this.lookPlaylist}));
      this.lookPlaylist=false;return;
    }
    if(name==='look-undo'){
      await this.#moodResult(lk.undoLastBatch());return;
    }
    if(name==='look-scenes-all'){this.lookScenes=new Set((lk.listScenes().scenes??[]).map(s=>s.id));return this.render();}
    if(name==='look-scenes-none'){this.lookScenes=new Set();return this.render();}
  }
  #lookTargets() {
    const lk=sceneLooks();
    if(this.lookMode==='folder')return this.lookFolder?lk.sceneIdsInFolder(this.lookFolder).sceneIds:[];
    return [...this.lookScenes];
  }
  /** Time of day blend: fills the fine-tune draft (still a draft until Apply to scene). */
  async #blendChange() {
    const b=this.moodBlend, list=sceneMoods().listMoods();
    const from=list.presets.find(m=>m.id===b.from), to=list.presets.find(m=>m.id===b.to);
    if(!from||!to||!this.moodDraft)return this.render();
    const set=blendSets(from.set,to.set,b.t);
    const known=sceneMoods().getState(this.moodSceneId||undefined).values??{};
    for(const [path,value] of Object.entries(set)){
      if(!Object.hasOwn(known,path))continue;
      this.moodDraft.values[path]=value;
      if(!this.moodDraft.touched.includes(path))this.moodDraft.touched.push(path);
    }
    this.moodMessage=`Blend of ${from.label} and ${to.label} at ${Math.round(b.t*100)}% is in the fine-tune draft below. Nothing changes for players until Apply to scene.`;
    await this.render();
  }
  #rollNow() {
    const api=sceneMoods(), list=api.listMoods(), state=api.getState(this.moodSceneId||undefined);
    const r=this.moodRoll;
    let seed=String(r.seed).trim();
    if(!seed){seed=String(Math.floor(Math.random()*9000)+1000);r.seed=seed;}
    const plan=rollWeather({seed,moods:list.presets,layers:list.layers,onIds:(state.layers??[]).map(l=>l.id),keepMood:r.keepMood,calm:Boolean(list.calm)});
    const moodLabel=plan.moodId?list.presets.find(m=>m.id===plan.moodId)?.label:null;
    const layerLabels=plan.layerIds.map(id=>list.layers.find(l=>l.id===id)?.label??id);
    r.plan={...plan,text:`Seed ${seed}: ${moodLabel?`mood ${moodLabel}`:'keeps the current mood'}${layerLabels.length?`, adds ${layerLabels.join(', ')}`:', adds no layers'}.`,empty:!plan.moodId&&!plan.layerIds.length};
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
    this.moodEdit=duplicate?{isNew:true,kind,id:'',label:`${preset.label} (copy)`,set:{...preset.set},transitionMs:preset.transitionMs??0,flashing:Boolean(preset.flashing)}
      :{isNew:false,kind,id:preset.id,label:preset.label,set:{...preset.set},transitionMs:preset.transitionMs??0,flashing:Boolean(preset.flashing)};
    await this.render();
  }
  async #saveMood() {
    const root=this.element, edit=this.moodEdit;
    if(!edit)return;
    const label=String(root.querySelector('[data-ag-mood-label]')?.value??'').trim();
    // The id is made from the label when the preset is created and never changes; "Advanced: set id" is optional.
    const typedId=edit.isNew?String(root.querySelector('[data-ag-mood-id]')?.value??'').trim().toLowerCase():'';
    const list=sceneMoods().listMoods(),existing=(edit.kind==='layer'?list.layers:list.presets)??[];
    const id=edit.isNew?(typedId||presetIdFromLabel(label,existing.map(p=>p.id))):edit.id;
    const transitionMs=Number(root.querySelector('[data-ag-mood-edit-transition]')?.value??0)||0;
    const set={};
    for(const f of MOOD_FIELDS){
      if(!root.querySelector(`[data-ag-mood-use="${f.path}"]`)?.checked)continue;
      const input=root.querySelector(`[data-ag-mood-value="${f.path}"]`);
      set[f.path]=f.kind==='number'?Number(input?.value):f.kind==='boolean'?Boolean(input?.checked)
        :f.kind==='color'?(root.querySelector(`[data-ag-mood-none="${f.path}"]`)?.checked?null:String(input?.value??'').toLowerCase()):String(input?.value??'');
    }
    if(edit.isNew&&this.#findPreset(edit.kind,id))return toast(`The id you set is already used by another ${edit.kind}. Clear it to make one from the label.`,true);
    const flashing=Boolean(root.querySelector('[data-ag-mood-flashing]')?.checked);
    this.moodEdit={...edit,id,label,set,transitionMs,flashing};
    const out=await this.#moodResult(sceneMoods().savePreset({id,label,kind:edit.kind,set,...(transitionMs?{transitionMs}:{}),...(flashing?{flashing:true}:{})}),`${edit.kind==='layer'?'Layer':'Mood'} "${label}" saved.`);
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
    const summary = {create:0, update:0, rebind:0, metadata:0, icon:0, unchanged:0, blocked:0, conflict:0, skipped:0, local:0};
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
    const libraryGroups=groupLibraryRows(libraryRows.map(row=>({...row,statusLabel:tokenLabel(row.status),statusTone:statusTone(row.status),focused:row.uuid===this.libraryFocus,tooltip:row.kind==='Item'?itemTooltipAttrs(row.uuid):''})),browser.rows);
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
    const sidebarRows=this.tab==='setup'?checklistRows(this.setupDraft?.playerSidebarTabs??appearanceController?.getState?.()?.playerSidebarTabs,listExtraTabs(globalThis.document)):[];
    const setupSkins=this.tab==='setup'?(()=>{const st=appearanceController?.getState?.()??{};const pick=this.setupDraft?.worldSkin??st.worldDefault;
      return (appearanceController?.listSkins?.()??[]).map(skin=>({...skin,current:skin.id===st.worldDefault,selected:skin.id===pick}));})():[];
    const captureRows = allItems.filter(row => (!this.captureTaggedOnly || row.capture) && (!this.captureSearch || row.name.toLowerCase().includes(this.captureSearch.toLowerCase()) || row.type.toLowerCase().includes(this.captureSearch.toLowerCase())));
    // Validation messages name a record by its permanent id; show the record's name for the ones in the loaded package.
    const nameById=this.preview.filter(r=>r.id&&r.name).map(r=>[String(r.id),String(r.name)]).sort((x,y)=>y[0].length-x[0].length);
    const named=text=>nameById.reduce((out,[id,name])=>out.includes(id)?out.split(id).join(name):out,String(text));
    const previewAll=this.tab==='import'?this.#previewRows():[];
    return {
      ...ctx,
      version: game.modules.get(MODULE_ID)?.version ?? '',
      tab: this.tab,
      importActive: this.tab === "import",
      importTabsHtml: this.tab==='import'?tabRow('agm-import','Import sections',IMPORT_TABS,this.importView):'',
      importPanelAttrs: tabPanelAttrs('agm-import',this.importView),
      importPackage: this.importView==='package', importHistory: this.importView==='history',
      syncOn: this.sync.on, syncHtml: this.sync.on&&this.tab==='import'?this.#syncHtml():'',
      githubHtml: this.tab==='import'&&this.importView==='package'?this.#githubHtml():'',
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
      launcherRows, launcherCount:launcherRows.length, moduleCards:moduleCards(launcherRows,playerAccessRows).map(c=>({...c,slug:c.id})),
      libraryRows, libraryTotal:library.length, librarySelectedCount:this.librarySelected.size,
      libraryInScope:libraryInScope.length, libraryNarrowed:libraryInScope.length!==library.length,
      libraryFilteredCount:browser.rows.length, libraryActiveCount:browser.summary.active,
      libraryEditedCount:browser.summary.edited, librarySystemCount:browser.summary.systems,
      libraryShowArchived:this.libraryShowArchived,
      librarySystemOptions:[{value:'all',label:'All systems',selected:this.librarySystem==='all'},...browser.systemOptions],
      libraryStatusOptions:[{value:'all',label:'All statuses',selected:this.libraryStatus==='all'},...browser.statusOptions.map(r=>({...r,label:tokenLabel(r.value)}))],
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
      preSession:preSessionView(this.preSessionResult,RESULT_TONE),
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
      backupSettingsHtml: this.tab === "setup" ? this.#backupSettingsHtml() : '',
      backupExportHtml: items&&view==='export' ? this.#backupExportHtml() : '',
      setupSkins,
      compactPause: this.tab === "setup" ? Boolean(this.setupDraft?.compactPause ?? appearanceController?.getState?.()?.compactPause) : false,
      sidebarTabRows: sidebarRows,
      sidebarTabSummary: summarizeRows(sidebarRows),
      playerHandoutsOnly: this.tab === "setup" ? Boolean(this.setupDraft?.playerHandoutsOnly ?? appearanceController?.getState?.()?.playerHandoutsOnly) : false,
      playersFolderOnly: this.tab === "setup" ? Boolean(this.setupDraft?.playersFolderOnly ?? appearanceController?.getState?.()?.playersFolderOnly) : false,
      ...Object.fromEntries(PLAYER_SCREEN_FLAGS.map(flag=>[flag.state,this.tab === "setup" ? Boolean(this.setupDraft?.[flag.state] ?? appearanceController?.getState?.()?.[flag.state]) : false])),
      autoCollapseSeconds: this.tab === "setup" ? Number(this.setupDraft?.autoCollapseSeconds ?? appearanceController?.getState?.()?.autoCollapseSeconds ?? 8) : 8,
      playerDockCorner: this.tab === "setup" ? String(this.setupDraft?.playerDockCorner ?? appearanceController?.getState?.()?.playerDockCorner ?? "top-left") : "top-left",
      dockCornerChoices: Object.entries(DOCK_CORNERS).map(([value,label])=>({value,label,selected:value===String(this.setupDraft?.playerDockCorner ?? appearanceController?.getState?.()?.playerDockCorner ?? "top-left")})),
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
      errors: this.errors.map(message => ({message:named(message)})),
      warnings: this.warnings.map(message => ({message:named(message)})),
      hasWarnings: this.warnings.length > 0,
      moduleLinks: (this.moduleLinks ?? []).map(message => ({message:named(message)})),
      hasModuleLinks: (this.moduleLinks?.length ?? 0) > 0,
      schemaVersion: this.specialist ? (this.specialist.payload?.schema_version ?? this.specialist.payload?.schema ?? "list") : (this.pkg?.manifest?.schema_version ?? "—"),
      hasErrors: this.errors.length > 0,
      hasPreview: this.preview.length > 0 && !this.errors.length,
      canApply: !this.busy && !this.zipBundle?.autoRunning && this.errors.length === 0 && this.preview.some(row => actionAllowed.has(row.action) && this.selected.has(row.id)),
      busy: this.busy || Boolean(this.zipBundle?.autoRunning),
      summary,
      rows: previewAll.slice(0,this.previewShown), totalRows: previewAll.length, moreRows: Math.max(0,previewAll.length-this.previewShown), nextPage: Math.min(PREVIEW_PAGE,Math.max(0,previewAll.length-this.previewShown)),
      smartIcons: this.smartIcons, repickIcons: this.repickIcons, iconStatus: this.#iconStatusText(),
      hasIconRows: this.preview.some(row=>row.icon),
      icons: items&&view==='checks'?this.#iconScanContext():null,
      release: items&&view==='checks'?this.#releaseContext():null,
      itemvis: items&&view==='checks'?this.#itemVisContext():null,
      matvis: items&&view==='checks'?{message:this.matVisMessage}:null,
      inuse: items&&view==='checks'?{message:this.inUseMessage}:null,
      srclabel: items&&view==='checks'?{message:this.srcLabelMessage,label:SOURCE_LABEL}:null,
      itemsReadable: game.settings.get(MODULE_ID,ITEMS_READABLE_SETTING)==='player',
      assetsActive: items&&view==='assets',
      assets: items&&view==='assets'?this.#assetsContext():null,
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
    bindSplitNav(root); // stacked Items records / NPC Codex: scroll to the details, Back to list
    bindFileButtons(root,(files,wrap)=>this.#pickFile(wrap.dataset.agFileKind,files[0],files));
    if(this.tab==='items'&&this.itemsView==='records')this.#fillItemPreview(root);
    if(this.tab==='items'&&this.itemsView==='assets'&&!this.assets.listing&&!this.assets.loading)void this.#assetsLoad();
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
    const go=async(tab,sub)=>{
      // 0.96.0: leaving the NPC Codex with unsaved edits asks first.
      if(this.tab==='codex'&&tab!=='codex'){if(!(await this.codexGuard.confirm()))return;this.codexDraft=null;}
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
      list.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',async event=>{
        event.preventDefault();
        // 0.96.0: switching NPC sections with unsaved edits asks first (the draft would otherwise sit unseen on another section).
        if(key==='codexTab'&&el.dataset.tab!==this.codexTab){if(!(await this.codexGuard.confirm()))return;this.codexDraft=null;}
        if(key!=='itemsView'&&key!=='moodView')this.ui.set(key,el.dataset.tab);
        apply(el.dataset.tab);this.focusAfterRender=`.ag-tabs--sub [data-tab="${el.dataset.tab}"]`;void this.render();
      }));
    }
  }
  /** Focus survives a re-render (guidelines §9.6): the control that asked for it is matched again by selector. */
  #restoreFocus(root) {
    const selector=this.focusAfterRender;this.focusAfterRender=null;
    // 0.70.2: a Codex change re-renders the window; the detail pane keeps its scroll and an open Characters menu stays open.
    const kept=this.codexScroll!=null;
    if(kept){const pane=root.querySelector('.agcodex .ag-split__detail');if(pane)pane.scrollTop=this.codexScroll;this.codexScroll=null;}
    if(this.codexReopen){root.querySelector(`[data-ag-codex-actor="${this.codexReopen}"]`)?.closest('details')?.setAttribute('open','');this.codexReopen=null;}
    if(selector)root.querySelector(selector)?.focus?.(kept?{preventScroll:true}:undefined);
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
  async #pickFile(kind,file,files=[file]) {
    if(!file)return;
    if(kind==='sync')return this.#syncPick(files).catch(err=>this.#fail(err));
    if(kind==='assets')return this.#assetsStage(files).catch(err=>this.#fail(err));
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
    // 0.84.0 tab checklist: the two presets only tick or untick the boxes in this form (nothing is saved until Save Changes).
    const tabSummary=()=>{const line=form.querySelector('[data-ag-tab-summary]');if(line)line.textContent=describeTabChoice(form);};
    form.addEventListener('change',event=>{if(event.target?.closest?.('[data-ag-setup-tab]'))tabSummary();});
    for(const button of form.querySelectorAll('[data-ag-tab-preset]'))button.addEventListener('click',event=>{
      event.preventDefault();applyTabPreset(form,button.dataset.agTabPreset);tabSummary();note();
    });
    this.setupGuard.watch(form);
  }
  #setupSources() {
    const src=coreLinks().describeSources(), d=this.setupDraft?.sources;
    if(!d)return src;
    return {...src,auto:d.auto,packs:(src.packs??[]).map(p=>({...p,slug:p.id,configured:d.packs.includes(p.id)})),
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
    // GM-only technical "Details" folds carry a Copy id button (the id itself is never shown outside the fold).
    root.querySelectorAll('[data-ag-copy-id]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();const id=el.dataset.agCopyId;
      Promise.resolve(game.clipboard?.copyPlainText?.(id)??navigator.clipboard.writeText(id)).then(()=>toast('Id copied.'),()=>toast('Could not copy the id.',true));
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
    root.querySelector('[data-ag-blend-from]')?.addEventListener('change',event=>{this.moodBlend.from=event.target.value;});
    root.querySelector('[data-ag-blend-to]')?.addEventListener('change',event=>{this.moodBlend.to=event.target.value;});
    root.querySelector('[data-ag-blend-t]')?.addEventListener('input',event=>{
      const out=root.querySelector('[data-ag-blend-out]');if(out)out.textContent=`${event.target.value}%`;
    });
    root.querySelector('[data-ag-blend-t]')?.addEventListener('change',event=>{this.moodBlend.t=Number(event.target.value)/100;void this.#blendChange();});
    root.querySelector('[data-ag-roll-seed]')?.addEventListener('change',event=>{this.moodRoll.seed=event.target.value;this.moodRoll.plan=null;});
    root.querySelector('[data-ag-roll-keep]')?.addEventListener('change',event=>{this.moodRoll.keepMood=event.target.checked;this.moodRoll.plan=null;});
    root.querySelector('[data-ag-calm]')?.addEventListener('change',event=>{
      void sceneMoods().setCalm(event.target.checked).then(out=>{this.moodMessage=out.message;toast(out.message,!out.ok);return this.render();}).catch(err=>this.#fail(err));
    });
    root.querySelector('[data-ag-look-pick]')?.addEventListener('change',event=>{this.lookId=event.target.value;this.lookPlaylist=false;void this.render();});
    root.querySelectorAll('[data-ag-look-mode]').forEach(el=>el.addEventListener('change',()=>{this.lookMode=el.value;void this.render();}));
    root.querySelector('[data-ag-look-folder]')?.addEventListener('change',event=>{this.lookFolder=event.target.value;void this.render();});
    root.querySelectorAll('[data-ag-look-scene]').forEach(el=>el.addEventListener('change',()=>{
      if(el.checked)this.lookScenes.add(el.dataset.agLookScene);else this.lookScenes.delete(el.dataset.agLookScene);void this.render();}));
    root.querySelector('[data-ag-look-playlist]')?.addEventListener('change',event=>{this.lookPlaylist=event.target.checked;});
    root.querySelector('[data-ag-look-save-playlist]')?.addEventListener('change',event=>{this.lookSave.playlistId=event.target.value;});
    root.querySelectorAll('[data-ag-look-save-action]').forEach(el=>el.addEventListener('change',()=>{this.lookSave.action=el.value;}));
    root.querySelector('[data-ag-look-default]')?.addEventListener('change',event=>{
      const sceneId=sceneMoods().getState(this.moodSceneId||undefined).scene?.id;
      void this.#moodResult(sceneLooks().setDefaultLook(sceneId,event.target.value||null)).catch(err=>this.#fail(err));
    });
    root.querySelector('[data-ag-look-auto]')?.addEventListener('change',event=>{
      void this.#moodResult(sceneLooks().setAutoLook(event.target.checked)).catch(err=>this.#fail(err));
    });
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
    this.#bindSync(root);
    this.#bindGithub(root);
    root.querySelectorAll("[data-ag-supersede]").forEach(el => el.addEventListener("change", async event => {
      if (this.busy || !event.target.checked) return;
      this.supersedeChoices = {...this.supersedeChoices, [event.target.dataset.agSupersede]: event.target.value};
      await this.#preview();
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
    this.#bindAssets(root);
    // Not a data-ag-action: those are ignored while busy, and Cancel must work while the commit runs.
    root.querySelector('[data-ag-clean-stop]')?.addEventListener('click',event=>{
      event.preventDefault();if(!this.cleanAbort)return;
      this.cleanAbort.abort();event.currentTarget.disabled=true;
      const el=root.querySelector('[data-ag-clean-status]');if(el)el.textContent='Cancelling after the current chunk…';
    });
    root.querySelectorAll('[data-ag-itemvis-folder]').forEach(el=>el.addEventListener('change',()=>{
      const g=this.itemVis?.groups?.[Number(el.dataset.agItemvisFolder)];if(!g)return;
      for(const i of g.items){if(el.checked)this.itemVis.selected.add(i.uuid);else this.itemVis.selected.delete(i.uuid);}
      root.querySelectorAll(`[data-ag-itemvis-in="${el.dataset.agItemvisFolder}"]`).forEach(b=>{b.checked=el.checked;});this.#itemVisPaint(root);
    }));
    root.querySelectorAll('[data-ag-itemvis-item]').forEach(el=>el.addEventListener('change',()=>{
      if(!this.itemVis)return;
      if(el.checked)this.itemVis.selected.add(el.dataset.agItemvisItem);else this.itemVis.selected.delete(el.dataset.agItemvisItem);
      const gi=el.dataset.agItemvisIn,g=this.itemVis.groups[Number(gi)],box=root.querySelector(`[data-ag-itemvis-folder="${gi}"]`);
      if(g&&box)box.checked=g.items.every(i=>this.itemVis.selected.has(i.uuid));this.#itemVisPaint(root);
    }));
    root.querySelector('[data-ag-release-stop]')?.addEventListener('click',event=>{
      event.preventDefault();if(!this.releaseAbort)return;
      this.releaseAbort.abort();event.currentTarget.disabled=true;
      const el=root.querySelector('[data-ag-release-status]');if(el)el.textContent='Cancelling after the current chunk…';
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
    // 0.70.2: Codex reveals only write NPC flags and must never be swallowed by an unrelated busy import.
    if ((this.busy || this.zipBundle?.autoRunning) && !String(name).startsWith('codex-')) return;
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
      case "world-edits-export": await this.#exportEdits(); break;
      case "world-export-everything": case "world-export-changed": case "world-export-copy": case "world-backup": await this.#worldExport(name); break;
      case "presession-run": case "presession-clear": case "presession-copy": case "presession-download": await this.#preSession(name); break;
      // Back to normal also drops the fine-tune draft, so the panel shows the restored scene.
      case "mood-restore": this.moodDraft=null; await this.#moodResult(sceneMoods().restore({sceneId:this.moodSceneId||undefined,animate:this.#moodAnimate()})); break;
      case "roll-next": this.moodRoll.seed=String((Number.parseInt(this.moodRoll.seed,10)||0)+1); this.#rollNow(); await this.render(); break;
      case "roll-preview": this.#rollNow(); await this.render(); break;
      case "roll-cancel": this.moodRoll.plan=null; await this.render(); break;
      case "roll-apply": {
        const plan=this.moodRoll.plan;
        if(!plan||plan.empty)break;
        const sceneId=sceneMoods().getState(this.moodSceneId||undefined).scene?.id;
        const out=await this.#moodResult(sceneLooks().applyRoll(plan,sceneId,{animate:this.#moodAnimate(true)}));
        if(out.ok)this.moodRoll.plan=null;
        await this.render(); break;
      }
      case "look-save": case "look-remove": case "look-apply": case "look-undo": case "look-scenes-all": case "look-scenes-none": await this.#looksAction(name); break;
      case "defaults-add": await this.#moodResult(sceneMoods().addNewDefaults()); break;
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
      case "backup-run": await this.#backupRun(); break;
      case "backup-token-clear": await this.#backupTokenClear(); break;
      case "setup-save": await this.#saveSetup(); break;
      case "setup-cancel": this.setupDraft=null; this.setupGuard.markClean(); this.setupMessage="Changes discarded."; await this.render(); break;
      case "release-scan": case "release-cancel": case "release-commit": await this.#releaseAction(name); break;
      case "matvis-run": await this.#materialVisAction(); break;
      case "inuse-run": await this.#inUseReleaseAction(); break;
      case "srclabel-run": await this.#sourceLabelAction(); break;
      case "itemvis-hide-scan": case "itemvis-release-scan": case "itemvis-cancel": case "itemvis-commit": await this.#itemVisAction(name); break;
      case "clean-scan": case "clean-cancel": case "clean-backup": case "clean-commit": await this.#cleanAction(name); break;
      case "assets-up": case "assets-new-folder": case "assets-scan": case "assets-link-apply": case "assets-link-cancel": case "assets-ring-scan": case "assets-ring-apply": case "assets-ring-cancel": await this.#assetsAction(name); break;
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
      case "codex-bulk-apply": case "codex-preset-basics": case "codex-preset-everything": case "codex-undo":
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
      case "gh-save": await this.#ghSave(); break;
      case "gh-find": await this.#ghFind(); break;
      case "gh-check": await this.#ghCheck(); break;
      case "gh-pull": await this.#ghPull(); break;
      case "gh-token-remove": await this.#ghRemoveToken(); break;
      case "gh-send-sync": await this.#ghSendSync(); break;
      case "gh-send-import": await this.#ghSendImport(); break;
      case "sync-preview": await this.#syncPreview(); break;
      case "clear-inputs": await this.#clearInputs(); break;
      case "preview-more": this.previewShown+=PREVIEW_PAGE; await this.render(); break;
      case "sync-cancel": this.#syncDrop('Sync cancelled. Nothing in your world changed.'); await this.render(); break;
      case "sync-report": this.#syncReport(); break;
      case "sync-backup": this.#syncBackupFile(); break;
      case "sync-run": await this.#syncRun(); break;
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
    this.previewShown=PREVIEW_PAGE;
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
    const decisions=(b.autoPlan??[]).map(filename=>({filename,names:b.summary.get(filename)?.decisionNote??''})).filter(d=>d.names);
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
        const entry={label:next.label,needsDecision:needsDecision.map(r=>r.name),decisionNote:decisionText(needsDecision),...autoFileCounts(rows,[],[])};
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
      // An older Renown only adds records: say so once, above the rows.
      this.warnings=plan.errors.length?[]:(plan.notes??[]);
      // 0.64.0: a file that carries `supersedes` (Renown entries) gets one extra row: the owning module re-keys its saved ids first.
      const sup=collectSpecialistSupersedes(kind,payload);
      if(!plan.errors.length&&sup.items.length) {
        const parts=await previewPartners(game,sup.map), pending=parts.reduce((n,x)=>n+x.changes,0);
        this.preview.unshift({id:SUPERSEDE_ROW_ID,name:`${SPECIALISTS[kind].label}: move ${sup.items.length} saved id(s) to their new ids`,kind:'Superseded ids',lifecycle:'',action:pending||!parts.length?'rebind':'unchanged',patch:{},
          reason:pending||!parts.length?`${sup.items.slice(0,4).map(i=>`${i.old} → ${i.new}`).join(', ')}${sup.items.length>4?', …':''}. ${parts.map(x=>`${x.label} would change ${x.changes}`).join('; ')||'No module that can move saved ids is active, so nothing changes.'} Progress is kept.`:'Already moved; nothing to change.'});
      }
    } catch(error) { this.errors=[String(error?.message??error)]; }
    const label=SPECIALISTS[kind].label;
    this.message=this.errors.length ? `Validation failed: ${this.errors.length} issue(s). No changes made.`
      : `Validated ${this.specialist.count} ${label} record(s). ${label} stores them; nothing changes before Apply.`;
    await this.render();
  }
  async #applySpecialist({auto=false}={}) {
    const {kind,payload}=this.specialist, spec=SPECIALISTS[kind];
    const allRows=this.preview.filter(row=>actionAllowed.has(row.action)&&this.selected.has(row.id));
    const wantsSuperseded=allRows.some(r=>r.id===SUPERSEDE_ROW_ID);
    const rows=allRows.filter(r=>r.id!==SUPERSEDE_ROW_ID);
    const fileLabel=this.packageSource??`${spec.label} file`;
    if(!allRows.length){
      this.importReports=pushReport(this.importReports,buildBlockedReport({file:fileLabel,module:spec.label,message:'No records were selected, so nothing was imported.',fix:'Press Select eligible (or tick records) in the preview, then Apply.'}));
      this.message='Nothing selected: nothing was imported. See the result below.';await this.render();return;}
    const api=specialistApi(game,kind);
    if(!api){
      const message=`${spec.label} is not active or is too old to import.`;
      this.errors=[`${message} Enable or update it.`];
      this.importReports=pushReport(this.importReports,buildBlockedReport({file:fileLabel,module:spec.label,message}));
      await this.render();return;}
    const yes=auto || await confirmDialog(`${rows.length} ${spec.kind.toLowerCase()} record(s) will be passed to ${spec.label}, which stores and owns them.\n${updatesExisting(kind,api)&&this.updateExisting?(kind==='factions'?'Factions and deities already in the world have their definitions replaced from the file (Renown saves a snapshot of the old ones first); standings, claims, requests, choices and what the party learned are kept. Definitions you edited in Renown since their last import are kept as they are.':'Records already in the world are replaced; their progress and state are kept.'):'Records already in the world are kept as they are.'} Back up your world first.`,
      {title:`Import into ${spec.label}?`,yes:'Import'});
    if(!yes)return;
    this.applyRan=true;
    this.busy=true;
    await this.render();
    const log={at:new Date().toISOString(),packageId:`${spec.label} file`,packageVersion:payload?.version??'—',results:[]};
    try {
      if(wantsSuperseded) { const sup=collectSpecialistSupersedes(kind,payload); log.results.push(...await applyPartners(game,sup.map,{user:game.user,definitions:sup.definitions})); }
      if(rows.length) log.results.push(...await applySpecialist(kind,payload,api,{ids:rows.map(r=>r.id),updateExisting:this.updateExisting}));
      await saveLedgerEntries(log.results.filter(r=>r.status==='ok'&&['create','update'].includes(r.action))
        .map(r=>({key:ledgerKey(null,kind),id:r.id,info:{kind:r.kind,module:spec.label,name:rows.find(x=>x.id===r.id)?.name??r.id}})));
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
      const graphNotes=checkContractGraph(this.pkg.records,externalIds,id=>Boolean(game.modules?.get?.(id)?.active),supersedeMap(this.pkg.records));
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
    // 0.64.0 `supersedes`: Manager-bound world documents by permanent id, so a record can offer to replace an old one in place.
    const boundIndex=new Map();
    for(const doc of allBoundDocuments()){const sid=sourceFlag(doc).sourceId;(boundIndex.get(sid)??boundIndex.set(sid,[]).get(sid)).push(makeSnapshot(doc));}
    for (const id of graph.order) {
      const record=records.find(r=>r.id===id);
      if (isLocationRecord(record)) {
        const {action,reason}=planLocation(record,{existingIds:locationIds,includeDrafts:this.includeDrafts,updateExisting:this.updateExisting});
        this.preview.push({id:record.id, name:record.location?.name ?? record.name ?? 'Unnamed location', kind:'Location', lifecycle:record.status, action, reason, patch:{}});
        continue;
      }
      if (isRouteRecord(record)) {
        const {action,reason}=planRoute(record,{existingIds:routeIds,locationIds:endpointIds,includeDrafts:this.includeDrafts,updateExisting:this.updateExisting});
        this.preview.push({id:record.id, name:record.route?.name || record.name || 'Unnamed route', kind:'Route', lifecycle:record.status, action, reason, patch:{}});
        continue;
      }
      if (isShopRecord(record)) {
        const {action,reason}=planShop(record,{existingIds:existingShopIds,includeDrafts:this.includeDrafts,updateExisting:this.updateExisting});
        this.preview.push({id:record.id, name:record.name || 'Unnamed record', kind:record.entity_type, lifecycle:record.status, action, reason, patch:{}});
        continue;
      }
      let sup=null;
      const offer=record.status==='approved'||this.includeDrafts?offerFor(record,boundIndex):null;
      if(offer) {
        const choice=['yes','no','skip'].includes(this.supersedeChoices[record.id])?this.supersedeChoices[record.id]:'yes';
        const newName=record.foundry?.data?.name ?? record.name ?? 'Unnamed record', oldName=offer.snap?.name??offer.oldId;
        sup={oldId:offer.oldId,oldName,choice,state:offer.state,reason:offer.reason??null};
        const base={id:record.id,name:newName,kind:record.foundry?.document_type,lifecycle:record.status,supersede:sup,patch:{}};
        if(offer.state!=='offer') {this.preview.push({...base,action:'blocked',reason:offer.reason});continue;}
        if(choice==='skip') {this.preview.push({...base,action:'skipped',reason:`Skipped: ${oldName} and this replacement are both left as they are.`});continue;}
        if(choice==='yes') {
          let p; try{p=planRebind(this.uploadZipArtwork?record:withoutBundledArt(record,this.zipMedia),offer.snap);}catch(error){p={refuse:String(error?.message??error)};}
          if(p.refuse) {this.preview.push({...base,action:'blocked',reason:p.refuse});continue;}
          this.preview.push({...base,action:'rebind',reason:`Replaces ${oldName} in place: the same document keeps its tokens, ownership, folder and links; ${p.changes.length} difference(s) are written. HP, notes you added as items, and anything the GM added stay.`,
            changes:p.changes.map(c=>`${c.label}: ${c.from} → ${c.to}${c.gmEdited?' (replaces a GM edit)':''}`),effects:null});
          continue;
        }
      }
      const {action,reason,patch={},changes=[],effects=null,artKept=[]}=planDocument(record,this.pkg,this).plan;
      // 0.52.2: a folder_path deeper than Foundry allows shows the folder it will actually file into.
      let dest=null; try{dest=folderDestination(record.foundry?.folder_path);}catch{dest=null;}
      this.preview.push({id:record.id, name:record.foundry?.data?.name ?? record.name ?? 'Unnamed record', kind:record.foundry?.document_type ?? record.entity_type+" (unmapped)", detail:professionFacts(record)?.summary ?? '', folderNote:dest?.collapsed?dest.path:'', lifecycle:record.status, action, reason, patch, changes, effects, artKept,
        effectRows:(effects?.rows??[]).map(r=>({...r,label:{create:'New',update:'Update',kept:'Kept',handmade:'Untouched'}[r.action]})),supersede:sup});
      this.warnings.push(...flagWarnings(record));
    }
    const collapsed=new Set(this.preview.map(r=>r.folderNote).filter(Boolean));
    if(collapsed.size) this.warnings.push(`Foundry allows ${FOLDER_MAX_DEPTH} folder levels, so ${collapsed.size} deeper folder path(s) file into one folder at level ${FOLDER_MAX_DEPTH}: ${[...collapsed].slice(0,3).join('; ')}${collapsed.size>3?'; …':''}. The Type column shows each record's folder.`);
    this.#assignIcons();
    const artRecords=this.preview.filter(r=>r.artKept?.length).length;
    this.message = `Validated ${records.length} records. ${this.dependencyNotes}${artRecords?` Keeping your art on ${artRecords} record${artRecords===1?'':'s'}.`:''} Nothing changes before Apply.`;
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
        label:i.pending?'Indexing icons…':this.iconOverrides.has(row.id)?'your choice':i.source==='smart'?(ICON_CONFIDENCE[i.confidence]??'match'):i.reason===NO_CONFIDENT_MATCH?NO_CONFIDENT_MATCH:'generic icon',
        note:i.pending?'A generic icon for now; the pick appears when indexing finishes.':this.iconOverrides.has(row.id)?'Chosen with Change…':i.source==='smart'?`${i.existing?'Replaces a placeholder icon; ':''}${i.reason}.`
          :i.reason===NO_CONFIDENT_MATCH?'Nothing in Foundry\u2019s icon library fits this name well enough, so the generic icon is used. Change… picks one.':'No fitting icon found in the library.'}:null;
      const sup=row.supersede?{...row.supersede,id:row.id,canChoose:row.supersede.state==='offer',yes:row.supersede.choice==='yes',no:row.supersede.choice==='no',skip:row.supersede.choice==='skip'}:null;
      return {...row, supersede:sup, icon, selected:this.selected.has(row.id), canSelect: actionAllowed.has(row.action), kind:tokenLabel(row.kind),lifecycle:tokenLabel(row.lifecycle),badge:capitalize(row.action), badgeTone:ACTION_TONE[row.action]??''};
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
  /** Release player-visible records (0.55.0): the Checks-view section's state. */
  #releaseContext() {
    const p=this.releasePreview;
    return {scan:Boolean(p),total:p?.total??0,kinds:p?.kinds??[],alreadyReleased:p?.alreadyReleased??0,examples:p?.examples??[],
      more:p?Math.max(0,p.total-p.examples.length):0,running:Boolean(this.releaseAbort),pct:this.releasePct,message:this.releaseMessage};
  }
  /** 0.72.0: Hide / Release Items by folder (item-visibility.js). */
  #itemVisContext() {
    const v=this.itemVis, hide=v?.mode==='hide';
    const n=v?v.selected.size:0;
    return {scan:Boolean(v),hide,total:n,keptHandouts:v?.keptHandouts??0,message:this.itemVisMessage,
      verbLabel:hide?'To hide':'To release',commitLabel:hide?`Hide ${n} items…`:`Release ${n} items…`,
      groups:(v?.groups??[]).map((g,index)=>({index,label:g.label,open:v.groups.length===1,allChecked:g.items.every(i=>v.selected.has(i.uuid)),
        items:g.items.map(i=>({uuid:i.uuid,name:i.name,checked:v.selected.has(i.uuid)}))}))};
  }
  #itemVisPaint(root) {
    const v=this.itemVis;if(!v)return;
    const n=v.selected.size, hide=v.mode==='hide';
    const c=root.querySelector('[data-ag-itemvis-count]');if(c)c.textContent=String(n);
    const b=root.querySelector('[data-ag-itemvis-commit]');
    if(b){b.disabled=!n||this.busy;b.textContent=hide?`Hide ${n} items…`:`Release ${n} items…`;}
  }
  async #itemVisAction(name) {
    const say=(text,error=false)=>{this.itemVisMessage=text;toast(text,error);};
    if(!game.user?.isGM)return say('Only the GM can change who can read Items.',true);
    const sourceOf=doc=>sourceFlag(doc), L=CONST.DOCUMENT_OWNERSHIP_LEVELS;
    switch(name){
      case 'itemvis-hide-scan': case 'itemvis-release-scan': {
        const mode=name==='itemvis-hide-scan'?'hide':'release';
        const plan=planVisibility(mode,allBoundDocuments(),sourceOf,L);
        this.itemVis={...plan,selected:new Set(plan.groups.flatMap(g=>g.items.map(i=>i.uuid)))};
        this.itemVisMessage=plan.total?`${plan.total} Item(s) in ${plan.groups.length} folder(s) ${mode==='hide'?'can be read by players now':'are approved and player-visible but hidden from players'}. Untick folders or Items to leave them as they are. Nothing has changed yet.`
          :mode==='hide'?'No Manager Item is readable by players. Nothing to hide.':'No approved, player-visible Item is hidden from players. Nothing to release.';
        if(!plan.total)this.itemVis=null;
        break;
      }
      case 'itemvis-cancel': this.itemVis=null;this.itemVisMessage='Preview cleared. Nothing changed.';break;
      case 'itemvis-commit': {
        const v=this.itemVis;
        if(!v?.selected.size)return say('Tick at least one Item first.',true);
        const n=v.selected.size, hide=v.mode==='hide';
        const yes=hide
          ?await confirmDanger(`Hide ${n} items from players?\nOnly their default ownership changes, to None, so players stop seeing them in the Items directory. Anything you gave a single player, handout Items and the copies on character sheets stay as they are. Features that read these Items for players (recipes, materials, shop goods) will show them as not released until you release them again.`,{title:`Hide ${n} items from players?`,yes:'Hide items'})
          :await confirmDialog(`Release ${n} items to players?\nOnly their default ownership changes, to Observer. Draft and GM-only records are never listed.`,{title:`Release ${n} items to players?`,yes:'Release items'});
        if(!yes)return;
        this.releaseAbort=new AbortController();this.releasePct=0;this.busy=true;
        await this.render();
        try{
          const out=await applyVisibility(v,v.selected,{user:game.user,sourceOf,levels:L,signal:this.releaseAbort.signal,
            write:updates=>CONFIG.Item.documentClass.updateDocuments(updates),
            onProgress:({done,total})=>{this.itemVisMessage=`${hide?'Hid':'Released'} ${done} of ${total}…`;const el=this.element?.querySelector('[data-ag-itemvis-status]');if(el)el.textContent=this.itemVisMessage;}});
          this.itemVis=null;say(out.message,out.skipped>0);
        }catch(error){
          console.error(`[${MODULE_ID}] Item visibility change failed`,error);this.itemVis=null;say(`Stopped: ${error.message??error}. Items already changed stay changed; scan again.`,true);
        }finally{this.busy=false;this.releaseAbort=null;}
        break;
      }
    }
    await this.render();
  }
  /** 0.89.0: Make materials visible to players (material-visibility.js): a labelled confirmation with the counts, then Apply. GM only. */
  async #materialVisAction() {
    const say=(text,error=false)=>{this.matVisMessage=text;toast(text,error);};
    if(!game.user?.isGM)return say('Only the GM can change who can read Items.',true);
    const sourceOf=doc=>sourceFlag(doc), L=CONST.DOCUMENT_OWNERSHIP_LEVELS;
    const plan=planMaterialVisibility(allBoundDocuments(),sourceOf,{user:game.user,levels:L});
    if(!plan.total){this.matVisMessage=`Nothing to change. ${materialSummary(plan)}`;await this.render();return;}
    const yes=await confirmDialog(`Make ${plan.total} material${plan.total===1?'':'s'} visible to players?\n${materialSummary(plan)}\nOnly their default ownership changes, from None to Observer. Nothing is lowered, and per-player ownership and everything else on the Items stay as they are. Running it again changes nothing more.`,
      {title:'Make materials visible to players?',yes:`Make ${plan.total} visible`});
    if(!yes){this.matVisMessage='Cancelled. Nothing changed.';await this.render();return;}
    this.busy=true;
    try{
      const out=await applyMaterialVisibility(plan,{user:game.user,sourceOf,levels:L,write:updates=>CONFIG.Item.documentClass.updateDocuments(updates)});
      say(out.message,out.changedSincePreview>0);
    }catch(error){
      console.error(`[${MODULE_ID}] Making materials visible failed`,error);say(`Stopped: ${error.message??error}. Materials already changed stay changed; run it again.`,true);
    }finally{this.busy=false;}
    await this.render();
  }
  /** 0.95.0: Release items in use (in-use-release.js): the Items the current party uses, one tier at a time. Preview grouped by character, labelled confirmation, then Apply. GM only. */
  async #inUseReleaseAction() {
    const say=(text,error=false)=>{this.inUseMessage=text;toast(text,error);};
    if(!game.user?.isGM)return say('Only the GM can change who can read Items.',true);
    const sourceOf=doc=>sourceFlag(doc), L=CONST.DOCUMENT_OWNERSHIP_LEVELS;
    let plan;
    try{plan=planInUseRelease(allBoundDocuments().filter(d=>d.documentName==='Item'),sourceOf,gatherInUseFacts(game),{user:game.user,levels:L});}
    catch(error){console.error(`[${MODULE_ID}] Release items in use failed`,error);return say(`Stopped: ${error.message??error}. Nothing changed.`,true);}
    if(!plan.total){this.inUseMessage=['Nothing to release.',inUseSummary(plan),...plan.notes].join(' ');await this.render();return;}
    const yes=await confirmDialog([`Release ${plan.total} item${plan.total===1?'':'s'} to players?`,...inUseLines(plan),
      'Only their default ownership changes, from None to Observer. Nothing is lowered, and per-player ownership and everything else on the Items stay as they are. Professions and Cinders nobody uses stay GM-only. Running it again changes nothing more.'].join('\n'),
      {title:`Release ${plan.total} item${plan.total===1?'':'s'} to players?`,yes:`Release ${plan.total} item${plan.total===1?'':'s'}`});
    if(!yes){this.inUseMessage='Cancelled. Nothing changed.';await this.render();return;}
    this.busy=true;
    try{
      const out=await applyInUseRelease(plan,{user:game.user,sourceOf,levels:L,write:updates=>CONFIG.Item.documentClass.updateDocuments(updates)});
      say([out.message,...out.notes].join(' '),out.changedSincePreview>0);
    }catch(error){
      console.error(`[${MODULE_ID}] Release items in use failed`,error);say(`Stopped: ${error.message??error}. Items already released stay released; run it again.`,true);
    }finally{this.busy=false;}
    await this.render();
  }
  /** 0.91.0: Set Ashen Gate source label (source-label.js): fills an EMPTY custom source label on Manager-imported world Items. Preview count, labelled confirmation, then Apply. GM only. */
  async #sourceLabelAction() {
    const say=(text,error=false)=>{this.srcLabelMessage=text;toast(text,error);};
    if(!game.user?.isGM)return say('Only the GM can set the source label on Items.',true);
    const sourceOf=doc=>sourceFlag(doc);
    const plan=planSourceLabel(allBoundDocuments(),sourceOf,{user:game.user});
    if(!plan.total){this.srcLabelMessage=`Nothing to change. ${sourceLabelSummary(plan)}`;await this.render();return;}
    const yes=await confirmDialog(`Set the source label "${SOURCE_LABEL}" on ${plan.total} item${plan.total===1?'':'s'}?\n${sourceLabelSummary(plan)}\nOnly an empty Custom Label (Configure Source on the Item sheet) is filled in. A label that is already there, and everything else on the Items, stays as it is. Items that did not come from an Ashen Gate record are not touched. Running it again changes nothing more.`,
      {title:`Set the source label on ${plan.total} item${plan.total===1?'':'s'}?`,yes:`Set label on ${plan.total}`});
    if(!yes){this.srcLabelMessage='Cancelled. Nothing changed.';await this.render();return;}
    this.busy=true;
    try{
      const out=await applySourceLabel(plan,{user:game.user,sourceOf,write:updates=>CONFIG.Item.documentClass.updateDocuments(updates,bulkWrite())});
      say(out.message,out.changedSincePreview>0);
    }catch(error){
      console.error(`[${MODULE_ID}] Setting the source label failed`,error);say(`Stopped: ${error.message??error}. Items already labelled stay labelled; run it again.`,true);
    }finally{this.busy=false;}
    await this.render();
  }
  async #releaseAction(name) {
    const say=(text,error=false)=>{this.releaseMessage=text;toast(text,error);};
    if(!game.user?.isGM)return say('Only the GM can release records.',true);
    const sourceOf=doc=>sourceFlag(doc);
    const docs=()=>allBoundDocuments().filter(d=>['Item','JournalEntry','Actor'].includes(d.documentName));
    switch(name){
      case 'release-scan': {
        this.releasePreview=previewRelease(docs(),sourceOf,CONST.DOCUMENT_OWNERSHIP_LEVELS);
        this.releaseMessage=`${releasePreviewText(this.releasePreview)} Nothing has changed yet.`;
        break;
      }
      case 'release-cancel': this.releasePreview=null;this.releaseMessage='Release preview cleared. Nothing changed.';break;
      case 'release-commit': {
        const p=this.releasePreview;
        if(!p?.total)return say('Find the hidden records first.',true);
        const kinds=p.kinds.map(k=>`${k.count} ${k.label.toLowerCase()}`).join(', ');
        const yes=await confirmDialog(`Make ${p.total} record(s) readable by players (${kinds})?\nOnly the default ownership changes, from None to Observer. GM-only and draft records, other ownership entries and everything else on the documents stay as they are. Running it again later does nothing.`,
          {title:'Release player-visible records?',yes:`Release ${p.total} record(s)`});
        if(!yes)return;
        this.releaseAbort=new AbortController();this.releasePct=0;this.busy=true;
        await this.render();
        const update=(pct,text)=>{this.releaseMessage=text;this.releasePct=pct;
          const el=this.element?.querySelector('[data-ag-release-status]');if(el)el.textContent=text;
          const bar=this.element?.querySelector('[data-ag-release-bar]');if(bar)bar.value=pct;};
        try{
          const out=await applyRelease(p,sourceOf,{signal:this.releaseAbort.signal,levels:CONST.DOCUMENT_OWNERSHIP_LEVELS,
            write:(kind,updates)=>CONFIG[kind].documentClass.updateDocuments(updates),
            onProgress:({done,total})=>update(total?done/total:1,`Released ${done} of ${total}…`)});
          this.releasePreview=null;say(out.message,out.skipped>0);
        }catch(error){
          console.error(`[${MODULE_ID}] Release failed`,error);this.releasePreview=null;say(`Release stopped: ${error.message??error}. Records already released stay released; run the scan again.`,true);
        }finally{this.busy=false;this.releaseAbort=null;}
        break;
      }
    }
    await this.render();
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
  // ---------- Items → Assets (0.57.0): browse, upload and link art files. GM only; assets.js checks the GM too. ----------
  /** Tokens already on scenes whose own ring is off, counted per Actor id (what "Also update tokens already on scenes" would change). */
  #ringTokenCounts() {
    const counts=new Map();
    for(const scene of listOf(game.scenes))for(const t of listOf(scene.tokens))if(t.actorId&&!t._source?.ring?.enabled)counts.set(t.actorId,(counts.get(t.actorId)??0)+1);
    return counts;
  }
  /** Actors whose ring Manager turned on at subject scale 1 (hidden under square art), with their scene tokens. GM only. */
  #ringRepairScan() {
    if(!game.user?.isGM)return [];
    const actors=(game.actors?.contents??[]).filter(d=>sourceFlag(d)?.sourceId).map(d=>({uuid:d.uuid,id:d.id,name:d.name,documentName:'Actor',type:d.type,sourceId:sourceFlag(d).sourceId,ring:d.prototypeToken?.ring}));
    const tokens=sceneTokenRefs(game.scenes);
    return ringRepairPlan(actors,tokens);
  }
  #assetDocs() {
    const ringTokens=this.#ringTokenCounts();
    return allBoundDocuments().filter(doc=>!doc.getFlag(MODULE_ID,'lifecycle')?.archived).map(doc=>{
      const source=sourceFlag(doc);
      return {uuid:doc.uuid,documentName:doc.documentName,type:doc.type,name:doc.name,sourceId:source.sourceId,img:doc.img,
        tokenImg:doc.documentName==='Actor'?(doc.prototypeToken?.texture?.src??''):undefined,
        ringEnabled:doc.documentName==='Actor'?Boolean(doc.prototypeToken?.ring?.enabled):undefined,
        ringTokens:doc.documentName==='Actor'?(ringTokens.get(doc.id)??0):undefined,
        flags:doc.flags?.[MODULE_ID]??{},baselineImg:source?.managedFields?.img,
        baselineTokenImg:doc.documentName==='Actor'?source?.managedFields?.['prototypeToken.texture.src']:undefined};
    });
  }
  #assetSource() {
    const a=this.assets;
    if(!assetSources().some(s=>s.id===a.source))a.source=defaultSource();
    return a.source;
  }
  #assetUrl(path) {
    if(/^(https?:)?\/\//i.test(path)||/^data:/i.test(path))return path;
    try{return foundry.utils.getRoute(path);}catch{return path;}
  }
  async #assetsLoad() {
    if(!game.user?.isGM)return;
    const a=this.assets;
    a.loading=true;
    const out=await listFolder(filePickerClass(),{source:this.#assetSource(),target:a.target,user:game.user});
    a.loading=false;a.listing=out;a.shown=ASSET_PAGE;
    if(this.rendered&&this.tab==='items'&&this.itemsView==='assets')await this.render();
  }
  #assetsGo(target,focus) {
    const a=this.assets;
    if(a.uploading)return;
    this.#assetsDropStage();
    a.target=target;a.listing=null;a.query='';
    this.focusAfterRender=focus??null;void this.render();
  }
  #assetsContext() {
    const a=this.assets, sources=assetSources(), source=this.#assetSource(), l=a.listing;
    const files=l?filterAssetEntries(l.files,a.query):[], dirs=l?filterAssetEntries(l.dirs,a.query):[];
    const tiles=files.slice(0,a.shown).map(f=>({...f,url:this.#assetUrl(f.path)}));
    const sourceLabel=sources.find(s=>s.id===source)?.label??'Library';
    const onForge=sources.some(s=>s.id==='forgevtt');
    const links=a.links;
    const kindOf=name=>capitalize(name==='RollTable'?'roll table':name==='JournalEntry'?'journal':name);
    const allRows=links?.rows??[], counts=linkCounts(allRows), conflicts=linkConflicts(allRows);
    const pickerRow=a.pickerKey?allRows.find(r=>r.key===a.pickerKey):null;
    const records=pickerRow?linkableRecords(this.#assetDocs()):[];
    const suggested=new Set((pickerRow?.candidates??[]).map(c=>c.value));
    const takenBy=new Map(allRows.filter(r=>r.checked&&rowReady(r)&&r.key!==pickerRow?.key).map(r=>[r.uuid,r.fileName]));
    const pickerRecords=records.map(r=>({...r,search:`${r.name} ${r.kindLabel}`.toLowerCase(),suggested:suggested.has(r.uuid),current:r.uuid===pickerRow.uuid,takenBy:takenBy.get(r.uuid)??''}))
      .sort((x,y)=>Number(y.suggested)-Number(x.suggested));
    const linkRows=allRows.slice(0,300).map(r=>{
      const ready=rowReady(r), waiting=r.needsPick&&!r.chosen, yes=ready&&r.checked, conflict=conflicts.has(r.key);
      return {...r,fromUrl:r.from?this.#assetUrl(r.from):'',toUrl:r.to?this.#assetUrl(r.to):'',
        kindLabel:r.documentName?kindOf(r.documentName):'',stateTone:['default','smart','ours'].includes(r.state)?'ok':'warn',
        pickByFile:r.needsPick&&r.pickBy==='file',pickByRecord:r.needsPick&&r.pickBy==='record',
        hasFromToken:Boolean(r.fromToken)&&r.documentName==='Actor',fromTokenUrl:r.fromToken?this.#assetUrl(r.fromToken):'',isActor:r.documentName==='Actor',
        options:(r.candidates??[]).map(c=>({value:c.value,label:c.label,selected:c.value===r.chosen})),
        canYes:ready,isYes:yes,isNo:!waiting&&!r.checked,isWaiting:waiting,conflict,yesTab:!(!waiting&&!r.checked),noTab:!yes,
        ringWill:Boolean(a.tokenRing&&yes&&r.ringLabel&&!r.ringKept&&!conflicts.has(r.key)),ringOnScenes:Boolean(a.tokenRing&&a.sceneTokens&&yes&&r.ringLabel&&!r.ringKept&&!conflicts.has(r.key))?r.ringTokens:0,ringKeptNote:Boolean(a.tokenRing&&yes&&r.ringKept),
        canDifferent:Boolean(r.to||r.filePath),pickerOpen:Boolean(pickerRow&&pickerRow.key===r.key),
        summary:waiting?'Pick one first':conflict?'Needs a choice':yes?'Will be linked':'Skipped',
        willChange:yes&&!conflict,picker:pickerRow&&pickerRow.key===r.key?{records:pickerRecords,count:pickerRecords.length}:null};
    });
    const cinderAll=links?.cinderRows??[], cinderBlocked=cinderConflicts(cinderAll), cinderPool=this.#cinderList();
    const cinderWill=cinderWillLink(cinderAll);
    const cinderRows=cinderAll.map(r=>{
      const yes=r.ready&&r.checked, blocked=cinderBlocked.has(r.key);
      const stages=r.mode==='art'?[]:r.to.map((t,i)=>({number:t.stage,fileName:t.fileName,toUrl:this.#assetUrl(t.art),at:t.at,
        oldUrl:r.from[i]?this.#assetUrl(r.from[i].art):'',hasOld:Boolean(r.from[i])}));
      const single=r.mode==='art'?r.to.map(t=>({fileName:t.fileName,toUrl:this.#assetUrl(t.art),oldUrl:r.fromArt?this.#assetUrl(r.fromArt):'',hasOld:Boolean(r.fromArt)})):[];
      return {...r,stages,single,hasStages:stages.length>0,hasSingle:single.length>0,canYes:r.ready,isYes:yes,isNo:!r.checked,yesTab:r.checked?true:false,noTab:!yes,conflict:blocked,
        willChange:yes&&!blocked,bearersOne:r.bearers===1,cinderLabel:r.cinderName||`${r.word} (no Cinder yet)`,pickerOpen:a.cinderPickerKey===r.key,
        summary:r.needsPick&&!r.chosen?'Pick one first':blocked?'Needs a choice':yes?'Will be linked':'Skipped',
        options:cinderPool.map(c=>({value:c.definitionId,label:c.name,selected:c.definitionId===r.definitionId})),
        canDifferent:cinderPool.length>0,hasExtras:r.extras.length>0,hasExisting:Boolean(r.from.length||r.fromArt)};
    });
    const st=a.staged, sum=st?stageSummary(st.items):null;
    const stageRow=i=>({...i,key:i.id,tone:i.status==='matched'?'ok':'warn',mustPick:i.status==='ambiguous'});
    const staged=st?{summary:sum.line,total:sum.total,unmatchedRows:st.items.filter(i=>i.status==='unmatched').map(stageRow),
      matchedRows:st.items.filter(i=>i.status!=='unmatched').map(stageRow),hasUnmatched:sum.unmatched>0,hasMatched:sum.total-sum.unmatched>0,
      unmatchedAll:unmatchedTickState(st.items)==='all',unmatchedSome:unmatchedTickState(st.items)==='some',unmatched:sum.unmatched,
      toUpload:sum.toUpload,skipped:sum.skipped,canGo:sum.toUpload>0,rejected:st.rejected,hasRejected:st.rejected.length>0,
      goLabel:`Upload ${sum.toUpload} file${sum.toUpload===1?'':'s'} and preview links`,
      note:sum.toUpload?`${sum.skipped?`${sum.skipped} will not be uploaded or deleted. `:''}Nothing is uploaded until you press the button.`:'No file is ticked, so nothing will be uploaded.'}:null;
    const stale=Boolean(links)&&links.target!==undefined&&links.target!==a.target;
    const un=links&&!stale?unmatchedInFolder(links.classified,{user:game.user,target:a.target}):{files:[],below:0};
    const noMatchRows=un.files.slice(0,300).map(f=>({name:f.name,path:f.path,url:this.#assetUrl(f.path),reason:f.reason,onList:a.deleteList.has(f.path)}));
    const listed=removalList([...a.deleteList],links?.classified,{user:game.user,target:a.target});
    const noMatchTotal=(links?.classified??[]).filter(f=>f.status==='unmatched').length;
    const foundNames=a.scan?new Set(a.scan.files.map(f=>stem(f.name).toLowerCase())):null;
    const missing=missingArtRows(this.#assetDocs(),{...a.missing,foundNames});
    const missingShown=missing.slice(0,300).map(r=>({...r,kindLabel:kindOf(r.documentName),tone:r.state==='none'?'danger':'warn'}));
    const sel=(list,value)=>list.map(o=>({...o,selected:o.value===value}));
    return {
      sources:sources.map(s=>({value:s.id,label:s.label,selected:s.id===source})),multiSource:sources.length>1,sourceLabel,onForge,manageUrl:MANAGE_ON_FORGE_URL,
      crumbs:crumbs(a.target,sourceLabel).map((c,i,all)=>({...c,current:i===all.length-1})),canGoUp:Boolean(a.target),
      loading:a.loading||!l,ok:Boolean(l?.ok),problem:l&&!l.ok?l.message:'',query:a.query,
      dirs,tiles,fileCount:files.length,folderCount:dirs.length,moreCount:Math.max(0,files.length-tiles.length),
      emptyFolder:Boolean(l?.ok)&&!l.files.length&&!l.dirs.length,noMatches:Boolean(l?.ok)&&(l.files.length||l.dirs.length)&&!files.length&&!dirs.length,
      uploading:a.uploading,uploads:a.uploads.map(r=>({...r,label:UPLOAD_LABEL[r.status]??r.status,tone:UPLOAD_TONE[r.status]??''})),hasUploads:a.uploads.length>0,
      uploadMessage:a.uploadMessage,staged,hasStaged:Boolean(staged),
      noMatchRows,hasNoMatch:Boolean(links)&&!stale&&(noMatchRows.length>0||un.below>0),noMatchCount:un.files.length,noMatchOverflow:Math.max(0,un.files.length-noMatchRows.length),
      noMatchBelow:un.below,noMatchStale:Boolean(links)&&stale,deleteCount:listed.allowed.length,hasDeleteList:listed.allowed.length>0,
      chooseFiles:fileButton({label:'Choose files…',accept:'image/*,.webp,.png,.jpg,.jpeg,.gif,.avif,.svg',multiple:true,icon:'fa-solid fa-upload',disabled:a.uploading||!l?.ok,data:{agFileKind:'assets'}}),
      repair:(()=>{const rr=a.ringRepair,plan=rr.plan;return {scanned:Array.isArray(plan),has:Boolean(plan?.length),message:rr.message,scene:rr.scene,
        actorCount:plan?.length??0,tokenCount:rr.scene?(plan??[]).reduce((n,p)=>n+p.tokens.length,0):0,
        rows:(plan??[]).slice(0,100).map(p=>({name:p.name,label:p.label,tokens:p.tokens.length})),overflow:Math.max(0,(plan?.length??0)-100)};})(),
      tokenRing:a.tokenRing,ringOffer:allRows.some(r=>r.ringLabel),ringCount:linkRows.filter(r=>r.ringWill).length,ringKept:linkRows.filter(r=>r.ringKeptNote).length,
      sceneTokens:a.sceneTokens,sceneTokenTotal:linkRows.reduce((n,r)=>n+r.ringOnScenes,0),sceneTokenOffer:allRows.some(r=>r.ringTokens>0),
      scanning:a.scanning,linkMessage:a.linkMessage,hasLinks:Boolean(links),linkRows,linkCount:links?.rows.length??0,cinderRows,hasCinderRows:cinderRows.length>0,hasAnyRows:linkRows.length>0||cinderRows.length>0,
      linkTicked:counts.willLink+cinderWill,linkSkipped:counts.skipped+cinderAll.length-cinderWill,linkConflicts:counts.conflicts+cinderBlocked.size,linkUndecided:counts.undecided+cinderAll.filter(r=>r.needsPick&&!r.chosen).length,
      linkCountLine:`${counts.willLink+cinderWill} will be linked, ${counts.skipped+cinderAll.length-cinderWill} skipped.`,linkCanApply:counts.willLink+cinderWill>0&&!counts.conflicts&&!cinderBlocked.size,linkOverflow:Math.max(0,(links?.rows.length??0)-linkRows.length),
      scanSummary:!links?'':links.fromUpload?`Checked the ${a.linkFiles.length} file(s) you just added. ${noMatchTotal} of them fit no record.`
        :`Looked through ${links.folders} folder(s) and ${a.linkFiles.length} image file(s)${a.scan?.complete===false?' (the scan stopped early; open a deeper folder to narrow it)':''}. ${links.unmatched} record(s) have no file that fits and ${noMatchTotal} file(s) fit no record.`,
      missingKinds:sel(ART_KINDS,a.missing.kind),missingStates:sel(ART_STATES,a.missing.state),missingQuery:a.missing.query,
      missingRows:missingShown,missingCount:missing.length,missingOverflow:Math.max(0,missing.length-missingShown.length),
      missingScanned:Boolean(foundNames),message:a.message
    };
  }
  #linkSummary(rows,cinderRows=[]) {
    const asks=rows.filter(r=>r.needsPick).length, ready=rows.length-asks;
    const cinders=cinderRows.length?` ${cinderRows.length} Cinder(s) have stage art ready to check.`:'';
    return `${ready} record(s) can take a file${asks?`, and ${asks} need${asks===1?'s':''} your pick`:''}.${cinders} Nothing has changed yet.`;
  }
  /** The Cinders a stage-art file can go to (GM only; empty when Ashen Gate | Cinders or its API is missing). */
  #cinderList() {
    const api=cindersApi();
    if(!game.user?.isGM||(!api?.canDefinition&&!api?.canStages&&!api?.canArt))return [];
    try{
      const instances=typeof api.cinder.instances==='function'?api.cinder.instances():[];
      return cinderChoices({docs:this.#assetDocs(),instances,stagesOf:api.canRead?id=>api.cinder.stages(id):()=>null,
        definitionOf:api.canDefinition?id=>api.cinder.getDefinitionArtStages(id):()=>null});
    }catch{return [];}
  }
  /** Record matches for the files, with Cinder stage art (Echo_Cinder_Stage_1.webp …) taken out first so it is never also offered to a record. */
  #planLinks(files) {
    const caps=cinderCaps(cindersApi());
    const {rows:cinderRows,rest}=planCinderArt(files,{user:game.user,cinders:this.#cinderList(),caps,names:worldCinderNames(this.#assetDocs())});
    const plan=planAssetLinks(this.#assetDocs(),rest);
    return {...plan,cinderRows,classified:classifyFiles(files,{plan,cinderRows,inUse:this.#worldImagePaths()})};
  }
  /** Every image path a document in the world uses (portraits, tokens, scenes, tiles…), so a file in use is never offered for deleting. */
  #worldImagePaths() {
    const set=new Set(), add=v=>{if(typeof v==='string'&&v)set.add(v);};
    try{
      for(const d of listOf(game.actors)){add(d.img);add(d.prototypeToken?.texture?.src);}
      for(const d of listOf(game.items))add(d.img);
      for(const d of listOf(game.scenes)){for(const p of sceneImagePaths(d))add(p);add(d.thumb);for(const t of listOf(d.tokens))add(t.texture?.src);for(const t of listOf(d.tiles))add(t.texture?.src);}
      for(const d of listOf(game.journal)){add(d.img);for(const pg of listOf(d.pages))add(pg.src);}
      for(const d of listOf(game.tables))add(d.img);
      for(const d of listOf(game.macros))add(d.img);
    }catch{ /* a collection that cannot be read adds nothing */ }
    return set;
  }
  #assetsDropStage() {
    const a=this.assets;
    if(!a.staged)return;
    this.#revokeThumbs(a.staged);
    a.staged=null;a.linkMessage='The files waiting to upload were cleared. Nothing was uploaded.';
  }
  #revokeThumbs(staged) {
    for(const i of staged?.items??[])if(i.thumb)try{URL.revokeObjectURL(i.thumb);}catch{ /* none */ }
  }
  async #assetsAction(name) {
    if(!game.user?.isGM)throw new Error('Only a GM can manage assets.');
    const a=this.assets, picker=filePickerClass(), source=this.#assetSource();
    const say=(text,error=false)=>{a.message=text;toast(text,error);};
    switch(name){
      case 'assets-up': return this.#assetsGo(parentPath(a.target),'[data-ag-assets-up]');
      case 'assets-new-folder': {
        const typed=await promptText('Create folder','Folder name','',{ok:'Create folder'});
        if(typed===null)break;
        const out=await createFolder(picker,{source,parent:a.target,name:typed,user:game.user});
        say(out.message,!out.ok);
        if(out.ok){a.listing=null;a.scan=null;a.linkFiles=[];a.links=null;}
        break;
      }
      case 'assets-scan': {
        a.scanning=true;a.linkMessage='Looking for files named after records…';await this.render();
        try{
          const scan=await scanFolders(picker,{source,target:a.target,user:game.user});
          a.scan=scan;a.linkFiles=scan.files;
          const plan=this.#planLinks(scan.files);
          a.links={...plan,folders:scan.folders,target:a.target};a.deleteList=new Set();
          a.linkMessage=(plan.rows.length||plan.cinderRows.length)?this.#linkSummary(plan.rows,plan.cinderRows)
            :scan.ok?'No file in this folder (or under it) fits a record by its permanent id or by name. Nothing changed.':`Could not read the folder: ${scan.errors[0]??'unknown error'}`;
        }finally{a.scanning=false;}
        break;
      }
      case 'assets-ring-scan': {
        const plan=this.#ringRepairScan();
        a.ringRepair={...a.ringRepair,plan,message:plan.length?'':'No hidden token rings found. Nothing to fix.'};
        break;
      }
      case 'assets-ring-cancel': a.ringRepair={...a.ringRepair,plan:null,message:'Cleared. Nothing changed.'};this.focusAfterRender='[data-ag-action="assets-ring-scan"]';break;
      case 'assets-ring-apply': {
        const rr=a.ringRepair, plan=rr.plan??[];
        if(!plan.length)return say('Find hidden token rings first.',true);
        const tokenCount=rr.scene?plan.reduce((n,p)=>n+p.tokens.length,0):0;
        const yes=await confirmDialog(`Resize the token ring of ${plan.length} Actor(s) so it shows around the art${tokenCount?`, and of ${tokenCount} token(s) of them already on scenes`:''}?\nOnly the ring's subject scale changes (to ${RING_SUBJECT_SCALE}). Colours, images and everything else stay as they are.`,
          {title:'Fix hidden token rings?',yes:`Fix ${plan.length} ring(s)`});
        if(!yes)return;
        this.busy=true;
        try{
          const out=await applyRingRepair(plan,{user:game.user,sceneTokens:rr.scene,getDoc:uuid=>(globalThis.fromUuidSync??foundry.utils.fromUuidSync)?.(uuid)??null,
            getTokens:actor=>sceneTokenRefs(game.scenes,actor.id),
            updateMany:updates=>globalThis.Actor.updateDocuments(updates),updateTokens:(sceneId,updates)=>game.scenes.get(sceneId).updateEmbeddedDocuments('Token',updates)});
          a.ringRepair={...rr,plan:this.#ringRepairScan(),message:out.message};say(out.message,!out.ok);
        }finally{this.busy=false;}
        break;
      }
      case 'assets-link-cancel': a.pickerKey=null;a.links=null;a.linkFiles=[];a.linkMessage='Preview cleared. Nothing changed.';this.focusAfterRender='[data-ag-action="assets-scan"]';break;
      case 'assets-link-apply': {
        const all=a.links?.rows??[], cinderAll=a.links?.cinderRows??[], blocked=linkConflicts(all);
        if(blocked.size||cinderConflicts(cinderAll).size)return say('Two files are set to go to the same record. Choose one of them (or pick a different record) first.',true);
        const rows=all.filter(r=>r.checked&&rowReady(r));
        const cinderRows=cinderAll.filter(r=>r.checked&&r.ready);
        if(!rows.length&&!cinderRows.length)return say('Choose Yes on at least one match first.',true);
        const actorRows=rows.filter(r=>r.documentName==='Actor').length;
        const replacing=rows.filter(r=>r.state==='edited'||r.state==='imported').length;
        const cinderReplacing=cinderRows.filter(r=>r.from.length||r.fromArt).length;
        const ringRows=a.tokenRing?rows.filter(r=>r.ringLabel&&!r.ringKept).length:0;
        const sceneRows=a.tokenRing&&a.sceneTokens?rows.filter(r=>r.ringLabel&&!r.ringKept).reduce((n,r)=>n+r.ringTokens,0):0;
        const yes=await confirmDialog(`${rows.length?`Set the image of ${rows.length} record(s) to the file shown on each row?`:''}${cinderRows.length?`${rows.length?'\n':''}Set the art of ${cinderRows.length} Cinder(s) to the stage images shown on each row?${cinderReplacing?` ${cinderReplacing} of them already have art; it will be replaced.`:''}`:''}${replacing?`\n${replacing} of the records already have an image that was set in Foundry or came with the import; those will be replaced.`:''}${actorRows?`\n${actorRows} of them are Actors: only the portrait and the token image change, nothing else on the Actor${ringRows?`, except Foundry's token ring, which is turned on for ${ringRows} of them${sceneRows?`, and on the ${sceneRows} token(s) of them already placed on scenes`:''}`:''}.`:''}\nOnly images are changed. A record whose image changed since the preview is skipped.`,
          {title:'Link images?',yes:`Link ${rows.length+cinderRows.length} image set(s)`});
        if(!yes)return;
        const getDoc=uuid=>(globalThis.fromUuidSync??foundry.utils.fromUuidSync)?.(uuid)??null;
        const updateMany=(documentName,updates)=>({Item:globalThis.Item,RollTable:globalThis.RollTable,Macro:globalThis.Macro,JournalEntry:globalThis.JournalEntry,Actor:globalThis.Actor})[documentName].updateDocuments(updates);
        const getTokens=actor=>sceneTokenRefs(game.scenes,actor.id);
        const updateTokens=(sceneId,updates)=>game.scenes.get(sceneId).updateEmbeddedDocuments('Token',updates);
        this.busy=true;
        try{
          const outs=[];
          if(rows.length)outs.push(await applyAssetLinks(rows,{user:game.user,moduleId:MODULE_ID,getDoc,updateMany,tokenRing:a.tokenRing,sceneTokens:a.tokenRing&&a.sceneTokens,getTokens,updateTokens}));
          if(cinderRows.length)outs.push(await applyCinderArt(cinderRows,{user:game.user,api:cindersApi()}));
          const out={ok:outs.every(o=>o.ok),message:outs.map(o=>o.message).filter(Boolean).join(' ')};
          const linked=outs.reduce((n,o)=>n+(o.applied?.length??0),0);
          a.pickerKey=null;a.cinderPickerKey=null;a.links={...this.#planLinks(a.linkFiles??[]),folders:a.links.folders,fromUpload:a.links.fromUpload,target:a.links.target};
          a.linkMessage=a.lastUpload?`${a.lastUpload.uploaded} uploaded, ${linked} linked, ${a.lastUpload.skipped} skipped. ${out.message}`:out.message;a.lastUpload=null;say(a.linkMessage,!out.ok);
        }finally{this.busy=false;}
        break;
      }
    }
    await this.render();
  }
  /** Drop or Choose files…: match the file NAMES against the records first (no network). Nothing is uploaded until the GM presses Upload. */
  async #assetsStage(files) {
    if(!game.user?.isGM)throw new Error('Only a GM can manage assets.');
    const a=this.assets;
    if(a.uploading||!files?.length||!a.listing?.ok)return;
    const out=stageFiles(files,{user:game.user,target:a.target,existing:(a.listing?.files??[]).map(f=>f.name),classify:pseudo=>this.#planLinks(pseudo).classified});
    if(!out.ok)return toast(out.message,true);
    this.#revokeThumbs(a.staged);
    a.uploadMessage='';
    if(!out.items.length){
      a.staged=null;a.uploads=out.rejected;a.uploadMessage='Nothing was uploaded: none of these files can be added.';
    }else{
      for(const i of out.items){try{i.thumb=URL.createObjectURL(i.file);}catch{i.thumb='';}}
      a.staged={items:out.items,rejected:out.rejected,target:a.target};a.uploads=[];
      a.linkMessage='';
    }
    this.focusAfterRender=out.items.length?'[data-ag-assets-upload-go]':null;
    await this.render();
  }
  async #assetsStageAction(name,el) {
    if(!game.user?.isGM)throw new Error('Only a GM can manage assets.');
    const a=this.assets, st=a.staged;
    if(!st||a.uploading)return;
    if(name==='cancel'){this.#revokeThumbs(st);a.staged=null;a.uploadMessage='Nothing was uploaded.';this.focusAfterRender='[data-ag-assets-refresh]';}
    else if(name==='file'){setFileUpload(st.items,el.dataset.agAssetsStageFile,el.checked);this.focusAfterRender=`[data-ag-assets-stage-file="${CSS.escape(el.dataset.agAssetsStageFile)}"]`;}
    else if(name==='unmatched'){setUnmatchedUpload(st.items,el.checked);this.focusAfterRender='[data-ag-assets-stage-unmatched]';}
    else if(name==='go')return this.#assetsUploadStaged();
    await this.render();
  }
  async #assetsUploadStaged() {
    if(!game.user?.isGM)throw new Error('Only a GM can manage assets.');
    const a=this.assets, st=a.staged;
    if(!st||a.uploading)return;
    const sel=uploadSelection(st.items,{user:game.user});
    if(!sel.ok)return toast(sel.message,true);
    if(!sel.files.length){a.uploadMessage='No file is ticked, so nothing was uploaded. Tick the files to add, or cancel.';toast(a.uploadMessage,true);await this.render();return;}
    this.#revokeThumbs(st);a.staged=null;
    await this.#assetsUpload(sel.files,{skipped:sel.skipped.length});
  }
  async #assetsUpload(files,{skipped=0}={}) {
    if(!game.user?.isGM)throw new Error('Only a GM can manage assets.');
    const a=this.assets;
    if(a.uploading||!files?.length||!a.listing?.ok)return;
    const source=this.#assetSource(), target=a.target;
    a.uploading=true;a.abort=new AbortController();a.uploads=[];a.uploadMessage=`Uploading ${files.length} file(s)…`;
    await this.render();
    const decide=async names=>{
      const shown=names.slice(0,12).map(escapeHtml).join(', ')+(names.length>12?` and ${names.length-12} more`:'');
      const yes=await confirmDanger(`${names.length} of these files already exist in this folder: ${shown}.\nReplace them with the new files? Keeping them skips those files; the others are still added.`,
        {title:'Replace existing files?',yes:`Replace ${names.length} file(s)`,no:'Keep existing files'});
      return yes?'overwrite':'skip';
    };
    const onProgress=({results,done,total})=>{
      a.uploads=results;
      const status=this.element?.querySelector('[data-ag-assets-upload-status]');if(status)status.textContent=`Finished ${done} of ${total}…`;
      const bar=this.element?.querySelector('[data-ag-assets-upload-bar]');if(bar)bar.value=total?done/total:1;
    };
    let added=[];
    try{
      const out=await uploadFiles(files,{picker:filePickerClass(),source,target,user:game.user,existing:(a.listing?.files??[]).map(f=>f.name),decide,onProgress,signal:a.abort.signal});
      a.uploads=out.results;
      const count=s=>out.results.filter(r=>r.status===s).length;
      added=out.results.filter(r=>['uploaded','replaced'].includes(r.status)&&r.path).map(r=>({name:r.name,path:r.path}));
      const sent=count('uploaded')+count('replaced'), notSent=count('skipped')+skipped, bad=count('failed')+count('rejected');
      a.lastUpload={uploaded:sent,skipped:notSent};
      a.uploadMessage=out.cancelled&&!sent?'Nothing was uploaded.'
        :`${sent} uploaded${count('replaced')?` (${count('replaced')} replaced)`:''}, ${notSent} skipped${bad?`, ${bad} could not be uploaded`:''}${count('not started')?`, ${count('not started')} not started`:''}.`;
      toast(a.uploadMessage,!out.ok&&!out.cancelled);
    }finally{a.uploading=false;a.abort=null;a.listing=null;a.scan=null;a.links=null;a.linkFiles=[];a.linkMessage='';a.deleteList=new Set();}
    if(added.length){
      // Look for records the new files fit (permanent id first, then name). Only a preview: nothing is written until Link.
      const plan=this.#planLinks(added);
      a.linkFiles=added;a.links={...plan,folders:0,fromUpload:true,target};
      a.linkMessage=(plan.rows.length||plan.cinderRows.length)?`${this.#linkSummary(plan.rows,plan.cinderRows)} See Link files to records below.`:'None of the files you just added fit a record by its permanent id or by name. Nothing changed.';
      a.uploadMessage=a.uploadMessage.replace(/, (\d+) skipped/,`, ${plan.rows.filter(r=>!r.needsPick).length+plan.cinderRows.length} ready to link, $1 skipped`);
    }
    await this.render();
  }
  async #copyAssetPath(path,done='Path copied.') {
    try{await (game.clipboard?.copyPlainText?.(path)??navigator.clipboard.writeText(path));toast(done);}
    catch{toast('Could not copy.',true);}
  }
  /** Files that fit no record: the list to delete in the Assets Library (Foundry gives modules no delete). Only files removalList allows. */
  async #assetsNoMatchAction(name,el) {
    if(!game.user?.isGM)throw new Error('Only a GM can manage assets.');
    const a=this.assets, links=a.links;
    if(!links||a.uploading)return;
    const un=unmatchedInFolder(links.classified,{user:game.user,target:a.target});
    if(name==='toggle'){
      const path=el.dataset.agAssetsNomatchToggle;
      if(!un.files.some(f=>f.path===path))return;
      if(el.checked)a.deleteList.add(path);else a.deleteList.delete(path);
      this.focusAfterRender=`[data-ag-assets-nomatch-toggle="${CSS.escape(path)}"]`;
    }else if(name==='add'){for(const f of un.files)a.deleteList.add(f.path);this.focusAfterRender='[data-ag-assets-nomatch-bulk="add"]';}
    else if(name==='clear'){a.deleteList=new Set();this.focusAfterRender='[data-ag-assets-nomatch-bulk="clear"]';}
    else if(name==='copy'){
      const list=removalList([...a.deleteList],links.classified,{user:game.user,target:a.target});
      if(!list.allowed.length)return toast('No file is on the delete list.',true);
      await this.#copyAssetPath(removalText(list.allowed),`Copied ${list.allowed.length} file name(s). Delete them in the Assets Library.`);
      return;
    }
    await this.render();
  }
  #bindAssets(root) {
    const a=this.assets, pane=root.querySelector('[data-ag-assets]');
    if(!pane)return;
    pane.querySelector('[data-ag-assets-source]')?.addEventListener('change',event=>{
      if(a.uploading)return;
      this.#assetsDropStage();
      a.source=event.target.value;a.target='';a.listing=null;a.query='';a.scan=null;a.linkFiles=[];a.links=null;a.linkMessage='';
      this.focusAfterRender='[data-ag-assets-source]';void this.render();
    });
    pane.querySelectorAll('[data-ag-assets-open]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();this.#assetsGo(el.dataset.agAssetsOpen,`[data-ag-assets-open="${CSS.escape(el.dataset.agAssetsOpen)}"]`);
    }));
    const query=pane.querySelector('[data-ag-assets-query]');
    const search=()=>{if(query.value===a.query)return;a.query=query.value;a.shown=ASSET_PAGE;this.focusAfterRender='[data-ag-assets-query]';void this.render();};
    query?.addEventListener('change',search);query?.addEventListener('search',search);
    pane.querySelector('[data-ag-assets-more]')?.addEventListener('click',event=>{
      event.preventDefault();a.shown+=ASSET_PAGE;this.focusAfterRender='[data-ag-assets-more]';void this.render();
    });
    pane.querySelector('[data-ag-assets-refresh]')?.addEventListener('click',event=>{
      event.preventDefault();if(a.uploading)return;a.listing=null;this.focusAfterRender='[data-ag-assets-refresh]';void this.render();
    });
    pane.querySelectorAll('[data-ag-assets-copy]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();void this.#copyAssetPath(el.dataset.agAssetsCopy);
    }));
    // Not a data-ag-action: those are ignored while busy, and Stop must work during an upload.
    pane.querySelector('[data-ag-assets-stop]')?.addEventListener('click',event=>{
      event.preventDefault();if(!a.abort)return;
      a.abort.abort();event.currentTarget.disabled=true;
      const el=pane.querySelector('[data-ag-assets-upload-status]');if(el)el.textContent='Stopping after the files already started…';
    });
    const drop=pane.querySelector('[data-ag-assets-drop]');
    if(drop){
      const over=on=>drop.classList.toggle('is-over',on);
      drop.addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';over(true);});
      drop.addEventListener('dragleave',()=>over(false));
      drop.addEventListener('drop',event=>{
        event.preventDefault();over(false);
        void this.#assetsStage([...(event.dataTransfer?.files??[])]).catch(err=>this.#fail(err));
      });
    }
    // Staged upload (0.65.0): per-file ticks, the bulk tick for files that fit no record, Upload and Cancel. Nothing uploads before Upload.
    pane.querySelectorAll('[data-ag-assets-stage-file]').forEach(el=>el.addEventListener('change',()=>void this.#assetsStageAction('file',el).catch(err=>this.#fail(err))));
    const bulkTick=pane.querySelector('[data-ag-assets-stage-unmatched]');
    if(bulkTick){bulkTick.indeterminate=bulkTick.dataset.some==='true';bulkTick.addEventListener('change',()=>void this.#assetsStageAction('unmatched',bulkTick).catch(err=>this.#fail(err)));}
    pane.querySelector('[data-ag-assets-upload-go]')?.addEventListener('click',event=>{event.preventDefault();void this.#assetsStageAction('go').catch(err=>this.#fail(err));});
    pane.querySelector('[data-ag-assets-stage-cancel]')?.addEventListener('click',event=>{event.preventDefault();void this.#assetsStageAction('cancel').catch(err=>this.#fail(err));});
    // Files that fit no record (already in the library): the delete list. Manager cannot delete; it builds the list.
    pane.querySelectorAll('[data-ag-assets-nomatch-toggle]').forEach(el=>el.addEventListener('change',()=>void this.#assetsNoMatchAction('toggle',el).catch(err=>this.#fail(err))));
    pane.querySelectorAll('[data-ag-assets-nomatch-bulk]').forEach(el=>el.addEventListener('click',event=>{event.preventDefault();void this.#assetsNoMatchAction(el.dataset.agAssetsNomatchBulk,el).catch(err=>this.#fail(err));}));
    pane.querySelector('[data-ag-assets-nomatch-copy]')?.addEventListener('click',event=>{event.preventDefault();void this.#assetsNoMatchAction('copy').catch(err=>this.#fail(err));});
    // Per-row choice (0.60.13): Yes / No, "Different record…" with a searchable picker, and the bulk buttons.
    // Every one re-renders and puts focus back on the control used; nothing here writes to the world.
    const rowOf=key=>a.links?.rows.find(r=>r.key===key);
    const choose=(key,value)=>{
      const row=rowOf(key);if(!row||!setRowChoice(row,value))return;
      this.focusAfterRender=`[data-ag-assets-choice="${CSS.escape(key)}"][data-value="${value}"]`;void this.render();
    };
    pane.querySelectorAll('[data-ag-assets-choice]').forEach(el=>{
      el.addEventListener('click',event=>{event.preventDefault();choose(el.dataset.agAssetsChoice,el.dataset.value);});
      el.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
        event.preventDefault();choose(el.dataset.agAssetsChoice,el.dataset.value==='yes'?'no':'yes');
      });
    });
    pane.querySelectorAll('[data-ag-assets-different]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();const key=el.dataset.agAssetsDifferent;
      a.pickerKey=a.pickerKey===key?null:key;
      this.focusAfterRender=a.pickerKey?`[data-ag-assets-picker-q="${CSS.escape(key)}"]`:`[data-ag-assets-different="${CSS.escape(key)}"]`;void this.render();
    }));
    pane.querySelectorAll('[data-ag-assets-picker-close]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();const key=el.dataset.agAssetsPickerClose;a.pickerKey=null;
      this.focusAfterRender=`[data-ag-assets-different="${CSS.escape(key)}"]`;void this.render();
    }));
    pane.querySelectorAll('[data-ag-assets-picker]').forEach(box=>{
      const key=box.dataset.agAssetsPicker, input=box.querySelector('[data-ag-assets-picker-q]'), status=box.querySelector('[data-ag-assets-picker-status]');
      const items=[...box.querySelectorAll('[data-ag-assets-record]')];
      const filter=()=>{
        const words=input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);let n=0;
        for(const li of items){const hit=words.every(w=>li.dataset.search.includes(w));li.closest('li').hidden=!hit;if(hit)n++;}
        if(status)status.textContent=n?`${n} record(s) shown.`:'No record matches. Try fewer letters.';
      };
      input?.addEventListener('input',filter);
      box.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();a.pickerKey=null;this.focusAfterRender=`[data-ag-assets-different="${CSS.escape(key)}"]`;void this.render();}});
      items.forEach(el=>el.addEventListener('click',event=>{
        event.preventDefault();const row=rowOf(key);if(!row)return;
        const doc=this.#assetDocs().find(d=>d.uuid===el.dataset.agAssetsRecord);
        if(!doc||!assignRecord(row,doc)){toast('That record cannot be linked here.',true);return;}
        a.pickerKey=null;this.focusAfterRender=`[data-ag-assets-different="${CSS.escape(key)}"]`;void this.render();
      }));
    });
    // Cinder stage art rows: Yes / No, and Different… (another Cinder). Nothing here writes to the world.
    const cinderRowOf=key=>a.links?.cinderRows?.find(r=>r.key===key);
    const chooseCinder=(key,value)=>{
      const row=cinderRowOf(key);if(!row||!setCinderChoice(row,value))return;
      this.focusAfterRender=`[data-ag-assets-cinder-choice="${CSS.escape(key)}"][data-value="${value}"]`;void this.render();
    };
    pane.querySelectorAll('[data-ag-assets-cinder-choice]').forEach(el=>{
      el.addEventListener('click',event=>{event.preventDefault();chooseCinder(el.dataset.agAssetsCinderChoice,el.dataset.value);});
      el.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
        event.preventDefault();chooseCinder(el.dataset.agAssetsCinderChoice,el.dataset.value==='yes'?'no':'yes');
      });
    });
    pane.querySelectorAll('[data-ag-assets-cinder-different]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();const key=el.dataset.agAssetsCinderDifferent;
      a.cinderPickerKey=a.cinderPickerKey===key?null:key;
      this.focusAfterRender=a.cinderPickerKey?`[data-ag-assets-cinder-pick="${CSS.escape(key)}"]`:`[data-ag-assets-cinder-different="${CSS.escape(key)}"]`;void this.render();
    }));
    pane.querySelectorAll('[data-ag-assets-cinder-pick]').forEach(el=>el.addEventListener('change',event=>{
      const key=el.dataset.agAssetsCinderPick,row=cinderRowOf(key);if(!row||!event.target.value)return;
      const api=cindersApi();
      if(!assignCinder(row,event.target.value,this.#cinderList(),cinderCaps(api))){toast('That Cinder cannot be used here.',true);return;}
      a.cinderPickerKey=null;this.focusAfterRender=`[data-ag-assets-cinder-different="${CSS.escape(key)}"]`;void this.render();
    }));
    pane.querySelector('[data-ag-assets-token-ring]')?.addEventListener('change',event=>{
      a.tokenRing=event.currentTarget.checked;this.focusAfterRender='[data-ag-assets-token-ring]';void this.render();
    });
    pane.querySelector('[data-ag-assets-repair-scene]')?.addEventListener('change',event=>{
      a.ringRepair={...a.ringRepair,scene:event.currentTarget.checked};this.focusAfterRender='[data-ag-assets-repair-scene]';void this.render();
    });
    pane.querySelector('[data-ag-assets-scene-tokens]')?.addEventListener('change',event=>{
      a.sceneTokens=event.currentTarget.checked;this.focusAfterRender='[data-ag-assets-scene-tokens]';void this.render();
    });
    pane.querySelectorAll('[data-ag-assets-bulk]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();const kind=el.dataset.agAssetsBulk;a.pickerKey=null;
      if(kind==='reset')a.links={...this.#planLinks(a.linkFiles??[]),folders:a.links.folders,fromUpload:a.links.fromUpload,target:a.links.target};
      else{setAllChoices(a.links?.rows??[],kind);setAllCinderChoices(a.links?.cinderRows??[],kind);}
      this.focusAfterRender=`[data-ag-assets-bulk="${kind}"]`;void this.render();
    }));
    pane.querySelectorAll('[data-ag-assets-pick]').forEach(el=>el.addEventListener('change',event=>{
      const row=a.links?.rows.find(r=>r.key===el.dataset.agAssetsPick);if(!row)return;
      resolvePick(row,event.target.value);
      this.focusAfterRender=`[data-ag-assets-pick="${CSS.escape(row.key)}"]`;void this.render();
    }));
    pane.querySelectorAll('[data-ag-assets-missing]').forEach(el=>{
      const set=()=>{const key=el.dataset.agAssetsMissing;if(a.missing[key]===el.value)return;a.missing[key]=el.value;this.focusAfterRender=`[data-ag-assets-missing="${key}"]`;void this.render();};
      el.addEventListener('change',set);if(el.type==='search')el.addEventListener('search',set);
    });
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
    const rebindRows=docRows.filter(r=>r.action==='rebind');
    if (rebindRows.length && !auto) {
      const list=rebindRows.map(r=>`• ${r.supersede.oldName} → ${r.name}: ${r.changes.slice(0,6).join('; ')}${r.changes.length>6?'; …':''}`).join('\n');
      const sure=await confirmDanger(`This replaces ${rebindRows.length} document(s) already in your world with new records. Each stays the same document, so tokens on scenes, ownership, folders and links are kept, but its name and content become the new record's. The old ids are retired and never reused.\n${list}\nOther modules that saved the old ids (Renown, Quest Log) are asked to move them to the new ids, keeping progress. A JSON backup of these documents downloads automatically before anything is written.`,
        {title:'Replace existing documents?',yes:`Replace ${rebindRows.length} document(s)`});
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
      let importPresent=null;
      // 0.64.0 `supersedes`: replace-in-place first, so the new ids exist before anything links to them.
      await this.#applyRebinds(ordered.filter(r=>r.action==='rebind'),{log,plans,originalMediaPaths});
      for (const row of ordered.filter(r=>r.action!=='rebind')) {
        const record = this.pkg.records.find(r=>r.id===row.id);
        const {plan:current,docs}=planDocument(record,this.pkg,this);
        plans.set(row.id,current);
        if (current.action !== (row.baseAction ?? row.action) || canonical(current.patch ?? {}) !== canonical(row.patch ?? {}) || canonical(current.effects?.rows ?? []) !== canonical(row.effects?.rows ?? [])) {
          log.results.push({id:row.id, status:"skipped", message:"Foundry state changed since preview; preview again."});
          continue;
        }
        try {
          const present=importPresent??=new Set(existingSourceIndex().keys()); // 0.70.1: built once per import, not once per record (the argument is only passed through)
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
      // 0.56.0: remember what was passed to other modules, so a later Sync from package can say what a newer package no longer carries.
      await saveLedgerEntries(log.results.filter(r=>r.status==='ok'&&['create','update'].includes(r.action)&&HANDOFF_KINDS[r.kind])
        .map(r=>({key:ledgerKey(this.pkg.manifest.package_id),id:r.id,info:{kind:r.kind,module:HANDOFF_KINDS[r.kind],name:this.pkg.records.find(x=>x.id===r.id)?.name??r.id}})));
      await resolvePackageLinks({pkg:this.pkg,rows:ordered,log,plans});
      emitBulkFinished('import');
      const prior=game.settings.get(MODULE_ID,"importHistory") ?? [];
      await game.settings.set(MODULE_ID,"importHistory",[...prior,log].slice(-40));
      const created=log.results.filter(r=>r.status==="ok"&&r.action==="create").length;
      const updated=log.results.filter(r=>r.status==="ok"&&["update","rebind"].includes(r.action)).length;
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
          names:new Map(this.pkg?.records?.map(r=>[r.id,r.name??''])??[])}));
        await this.render();
      }
    }
  }
  /**
   * Replaces each old document in place with its superseding record (GM only; the data-layer check is in writeRebind).
   * Returns the set of new ids that were rebound. A failure is logged for that row and the others carry on.
   */
  async #applyRebinds(rows,{log,plans,originalMediaPaths}) {
    const done=new Set();
    if(!rows.length) return done;
    const docs=rows.map(r=>foundDocuments(r.supersede.oldId)[0]).filter(Boolean);
    if(docs.length) this.#downloadSnapshots(docs,`before-replace-${Date.now()}`);
    const map={};
    for(const row of rows) {
      const record=this.pkg.records.find(r=>r.id===row.id), oldId=row.supersede.oldId;
      try {
        const bound=foundDocuments(oldId);
        if(bound.length!==1||foundDocuments(row.id).length) throw new Error('The world changed since the preview (the old document is gone, duplicated, or the new id now exists). Preview again.');
        const doc=bound[0];
        const adapted=adaptRecordArtwork(this.uploadZipArtwork?record:withoutBundledArt(record,this.zipMedia),originalMediaPaths);
        const ops=planRebind(adapted,makeSnapshot(doc));
        if(ops.refuse) throw new Error(ops.refuse);
        const present=new Set(existingSourceIndex().keys()); present.add(row.id);
        const flag=sourceMetadata(adapted,this.pkg,present);
        const levels=CONST.DOCUMENT_OWNERSHIP_LEVELS;
        const extra=releasable(doc,flag,levels)?{'ownership.default':levels.OBSERVER,[`flags.${MODULE_ID}.${BASELINE_FLAG}`]:levels.OBSERVER}:{};
        await writeRebind(doc,{id:row.id,supersedes:{oldId},ops},{user:game.user,flag,extra});
        plans.set(row.id,{patch:{touched:(ops.items?.create?.length||ops.items?.update?.length)?itemKeys(adapted.foundry.data.items??[]):[]}});
        log.results.push({id:row.id,action:'rebind',status:'ok',uuid:doc.uuid,message:`Replaced ${row.supersede.oldName} in place.`});
        map[oldId]=row.id; done.add(row.id);
      } catch(error) {
        console.error(`[${MODULE_ID}] Replacing ${oldId} with ${row.id} failed`,error);
        log.results.push({id:row.id,action:'rebind',status:'error',message:String(error?.message??error)});
      }
    }
    if(done.size) {
      try {
        await game.settings.set(MODULE_ID,SYNC_RETIRED_SETTING,[...new Set([...(game.settings.get(MODULE_ID,SYNC_RETIRED_SETTING)??[]),...Object.keys(map)])].sort());
        const mine=await renameManagerRefs(allBoundDocuments(),map,{user:game.user});
        if(mine.changed) log.results.push({id:MODULE_ID,action:'supersede-ids',status:'ok',message:`Manager: ${mine.changed} document(s) had references or Codex links moved to the new id(s).`});
        log.results.push(...await applyPartners(game,map,{user:game.user}));
      } catch(error) { log.results.push({id:MODULE_ID,action:'supersede-ids',status:'error',message:String(error?.message??error)}); }
    }
    return done;
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
    if(!accepted.length){this.libraryMessage=`No ${action} eligible records. ${denied.map(r=>`${r.name??'This record'}: ${r.reason}`).join(' | ')}`;await this.render();return;}
    const warning=denied.length?`\nSkipped ${denied.length}: ${denied.map(r=>r.name??'a record').join(', ')}`:'';
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
            const lc=row.doc.getFlag(MODULE_ID,'lifecycle')??{};
            const back=Number.isFinite(lc.previousOwnershipDefault)&&(row.doc.ownership?.default??0)===0?lc.previousOwnershipDefault:null;
            await row.doc.update({folder:previous,[`flags.${MODULE_ID}.lifecycle.archived`]:false,...(back!==null?{'ownership.default':back,[`flags.${MODULE_ID}.${BASELINE_FLAG}`]:back}:{})});
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
This can overwrite source-owned fields you edited by hand: ${candidates.flatMap(c=>c.local.map(p=>`${c.row.name??'a record'} (${p})`)).join(', ')||'none'}.
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
      const prefix=doc.name||'A managed record';
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
      // 0.52.0: new search words start on the first page of results (before, only Enter went back to page 1).
      this.browseState.page=0;
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
        Promise.resolve(game.clipboard?.copyPlainText?.(id)??navigator.clipboard.writeText(id)).then(()=>toast('Id copied.'),()=>toast('Could not copy the id.',true));
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
  // ---------- Back up world to GitHub (0.86.0) ----------
  // The write token lives in a client-scope setting and is read only inside github-backup.js; this window never holds it beyond what the GM types.
  #backupSettingsHtml() {
    if(!game.user?.isGM)return '';
    const store=this.#ghStore(), cfg=backup.loadBackupConfig(game.user,{store}).config, d=this.setupDraft?.backup;
    const status=backup.backupTokenStatus(game.user,{store});
    return backupSettingsView({repo:d?.repo??cfg.repo,branch:d?.branch??cfg.branch,token:{saved:status.saved,masked:status.masked},busy:this.busy});
  }
  #backupExportHtml() {
    if(!game.user?.isGM)return '';
    const store=this.#ghStore(), at=backup.lastBackup(game.user,{store});
    return backupExportView({target:backup.loadBackupConfig(game.user,{store}).config,busy:this.busy,lastLabel:at?backup.relativeLabel(at):'',message:this.backupMessage??null});
  }
  async #backupTokenClear() {
    const yes=await confirmDanger('Clear the backup token from this device? Backing up stops working here until you save a token again. The token itself stays valid on GitHub: delete it there too if you no longer want it to exist.',{title:'Clear backup token?',yes:'Clear token'});
    if(!yes)return;
    const r=await backup.clearBackupToken(game.user,{store:this.#ghStore()});
    this.setupMessage=r.message;toast(r.message,!r.ok);await this.render();
  }
  /** Back up world now…: gather, confirm (what is sent, where), then one commit. Nothing in the world is written. */
  async #backupRun() {
    const store=this.#ghStore();
    const say=(tone,text,url=null)=>{this.backupMessage={tone,text,url};toast(text,tone==='danger');};
    try {
      if(!game.user?.isGM)throw new Error(backup.GM_ONLY);
      const target=backup.backupTarget(game.user,{store});
      if(!target.ok){say('danger',`${target.message} Fix it in GM Setup, World backup.`);return;}
      if(!backup.backupTokenStatus(game.user,{store}).saved){say('danger','Save a backup token first (GM Setup, World backup).');return;}
      // 0.87.0: every type is read once so the dialog can show what each would write; the GM ticks the types, the choice is kept on this device.
      const remembered=backup.loadBackupSelection(game.user,{store}).selection;
      const everything=backup.collectBackup(game);
      if(!everything.ok){say('danger',everything.message);return;}
      const shown=new Set(everything.types.filter(t=>t.available).map(t=>t.id));
      const form=await formDialog('Back up world to GitHub',backupConfirmFields(everything,target.config,remembered),{ok:'Back up'});
      if(!form)return;
      const picked=Array.isArray(form.types)?form.types.filter(id=>shown.has(id)):[];
      if(!picked.length){say('danger','Tick at least one type to back up. Nothing was sent.');return;}
      // Types that were not offered (module missing or too old) keep whatever was remembered for them.
      await backup.saveBackupSelection(game.user,{store,selection:[...picked,...remembered.filter(id=>!shown.has(id))]});
      const plan=backup.collectBackup(game,{selection:picked});
      if(!plan.ok){say('danger',plan.message);return;}
      this.busy=true;this.backupMessage={tone:'info',text:'Backing up to GitHub…'};await this.render();
      const r=await backup.runBackup(game,{store,plan});
      if(r.ok)say(r.unchanged?'info':'ok',r.message,r.commitUrl??null);else say('danger',r.message);
    } catch(error){say('danger',String(error?.message??error));}
    finally{this.busy=false;await this.render();}
  }
  /** GM Setup → Save Changes: world appearance, NPC Codex access and core sources save together (D4). */
  async #saveSetup() {
    const form=this.element?.querySelector('[data-ag-setup-form]')??this.element;
    const out=await saveGmSetup(readGmSetupForm(form),{game,moduleId:MODULE_ID,codexAccessKey:CODEX_ACCESS_SETTING,itemsKey:ITEMS_READABLE_SETTING,appearance:appearanceController,coreLinks:coreLinks(),backup:{save:input=>backup.saveBackupSettings(game.user,{store:this.#ghStore(),input})}});
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
    // 0.67.0: chips say at a glance who can see the field now (text, never colour alone).
    const nameOfChar=id=>chars.find(c=>c.id===id)?.name??'Unknown character';
    const chipsOf=rule=>rule.party?[{text:'Whole party',cls:'ag-badge--ok'}]:rule.actors.length?rule.actors.map(id=>({text:nameOfChar(id),cls:'ag-badge--accent'})):[{text:'Hidden',cls:''}];
    const seg=(key,rule,mode)=>({key,isHidden:mode==='hidden',isParty:mode==='party',isActors:mode==='actors',chips:chipsOf(rule),
      hiddenTab:mode==='party'?-1:0,partyTab:mode==='party'?0:-1,actorCount:rule.actors.length,
      chars:chars.map(c=>({...c,checked:rule.actors.includes(c.id)}))});
    const detail=found?{...found,initials:initialsOf(found.name),
      discoverySeg:{...seg('discovery',found.discovery,found.discoveryMode),label:'who knows this NPC',who:found.discoveryLabel},
      fields:found.fields.map(f=>({...f,...seg(f.key,f.rule,f.mode),isLinks:f.key==='links'})),
      gmFields:found.gmFields.map(f=>Array.isArray(f.value)?{label:f.label,items:f.value}:{label:f.label,text:f.value}),
      linksText:found.gmLinks.join(' ')}:null;
    if(detail)detail.bulk=this.#bulkView(detail,chars);
    // Unsaved Notes & links (0.46.0) survive re-renders until Save Changes or Cancel.
    if(detail&&this.codexDraft?.id===detail.id)Object.assign(detail,{learned:this.codexDraft.learned,notes:this.codexDraft.notes,linksText:this.codexDraft.links});
    // 0.96.0: NPC text edits and status are part of the same draft. "Edited in your world" = differs from the pack text, live.
    if(detail){
      const d=this.codexDraft?.id===detail.id?this.codexDraft:null,life=d?.status??detail.life.value;
      detail.editFields=detail.editFields.map(f=>{const value=d?.edits?.[f.key]??f.value;return {...f,value,edited:value!==f.pack};});
      detail.statusOptions=STATUS_VALUES.map(v=>({value:v,label:STATUS_LABELS[v],selected:v===life}));
            detail.statBlock=detail.gmFields.find(f=>f.label==='Stat block')?.text??'';
    }
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
      previewOptions:[{value:'',label:'GM (everything)'},{value:'party',label:'The party'},...chars.map(c=>({value:c.id,label:c.owners?.length?`${c.name} (${c.owners.join(', ')})`:c.name}))]
        .map(o=>({...o,selected:o.value===this.codexPreview})),
      previewHtml,previewing:Boolean(previewHtml),message:this.codexMessage,
      playerAccess:Boolean(game.settings.get(MODULE_ID,CODEX_ACCESS_SETTING))};
  }
  /** 0.67.0: per-NPC ticks for the multi-field panel (selections, not saved data). */
  /** Re-render after a Codex change without losing the detail pane's scroll position. */
  #renderCodex() {
    const pane=this.element?.querySelector?.('.agcodex .ag-split__detail');
    this.codexScroll=pane?pane.scrollTop:null;
    return this.render();
  }
  #bulkFor(id) {
    let b=this.codexBulk.get(id);
    if(!b){b={keys:new Set(),mode:'party',chars:new Set()};this.codexBulk.set(id,b);}
    return b;
  }
  #bulkView(detail,chars) {
    const b=this.#bulkFor(detail.id),known=new Set(chars.map(c=>c.id));
    for(const id of [...b.chars])if(!known.has(id))b.chars.delete(id);
    const rows=[{key:'discovery',label:'Name and portrait',empty:false},...detail.fields.map(f=>({key:f.key,label:f.label,empty:f.empty}))];
    for(const r of rows)if(r.empty)b.keys.delete(r.key);
    const st=bulkStatus({count:b.keys.size,mode:b.mode,charCount:b.chars.size});
    const note=this.codexNote?.id===detail.id?this.codexNote.text:'',noteTone=this.codexNote?.id===detail.id?(this.codexNote.tone??'ok'):'ok';
    let canUndo=false;try{canUndo=codexService().canUndoReveal(detail.id);}catch{/* not a GM */}
    return {fields:rows.map(r=>({...r,checked:b.keys.has(r.key)})),
      isHidden:b.mode==='hidden',isParty:b.mode==='party',isActors:b.mode==='actors',
      hiddenTab:b.mode==='hidden'?0:-1,partyTab:b.mode==='party'?0:-1,actorsTab:b.mode==='actors'?0:-1,
      chars:chars.map(c=>({id:c.id,name:c.name,ownerText:(c.owners??[]).join(', '),checked:b.chars.has(c.id)})),
      applyLabel:st.label,applyDisabled:st.disabled,presetsOk:st.presetsOk,hint:st.hint,note,noteWarn:noteTone==='warn'||noteTone==='danger',canUndo};
  }
  /** Reflects the panel's ticks into the open window without a re-render, so focus and scroll stay put. */
  #syncBulk(root) {
    const panel=root.querySelector('[data-ag-codex-bulk]');if(!panel)return;
    const b=this.#bulkFor(this.codexFocus),st=bulkStatus({count:b.keys.size,mode:b.mode,charCount:b.chars.size});
    panel.querySelectorAll('[data-ag-codex-bulk-mode] [role="radio"]').forEach(r=>{const on=r.dataset.mode===b.mode;r.setAttribute('aria-checked',on?'true':'false');r.setAttribute('tabindex',on?'0':'-1');r.classList?.toggle('is-selected',on);});
    panel.querySelectorAll('[data-ag-codex-bulk-key]').forEach(el=>{el.checked=b.keys.has(el.dataset.agCodexBulkKey);});
    panel.querySelectorAll('[data-ag-codex-bulk-char]').forEach(el=>{el.checked=b.chars.has(el.value);});
    const apply=panel.querySelector('[data-ag-codex-apply]');if(apply){apply.textContent=st.label;apply.disabled=st.disabled;}
    panel.querySelectorAll('[data-ag-codex-preset]').forEach(el=>{el.disabled=!st.presetsOk;});
    const why=panel.querySelector('[data-ag-codex-reason]');if(why)why.hidden=st.presetsOk;
    const hint=panel.querySelector('[data-ag-codex-bulk-hint]');if(hint)hint.textContent=st.hint;
  }
  /** {field: text} for every editable NPC text field in the form. */
  #readCodexEdits(form) {
    const out={};form.querySelectorAll('[data-ag-codex-edit]').forEach(el=>{out[el.dataset.agCodexEdit]=el.value;});return out;
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
      this.codexMessage='Saved. Players see the change next time they open the codex.';await this.#renderCodex();}),{valueKey:'mode'}));
    const form=root.querySelector('[data-ag-codex-form]');
    if(form){
      const note=()=>{this.codexDraft={id:this.codexFocus,learned:form.querySelector('[data-ag-codex-learned]')?.value??'',
        notes:form.querySelector('[data-ag-codex-notes]')?.value??'',links:form.querySelector('[data-ag-codex-links]')?.value??'',
        status:form.querySelector('[data-ag-codex-status-select]')?.value,edits:this.#readCodexEdits(form)};
        // The "Edited in your world" marker and its Revert control follow the text live (differs from the pack text).
        form.querySelectorAll('[data-ag-codex-edit]').forEach(el=>{const row=el.closest('[data-ag-codex-editrow]')?.querySelector('[data-ag-codex-editmark]');if(row)row.hidden=el.value===el.dataset.pack;});};
      form.addEventListener('input',note);form.addEventListener('change',note);
      // Revert to pack text puts the pack text back into the field (an unsaved change); Save Changes then drops the edit.
      form.querySelectorAll('[data-ag-codex-revert]').forEach(btn=>btn.addEventListener('click',e=>{
        e.preventDefault();const el=form.querySelector(`[data-ag-codex-edit="${btn.dataset.agCodexRevert}"]`);if(!el)return;
        el.value=el.dataset.pack??'';el.dispatchEvent(new Event('input',{bubbles:true}));el.focus?.();}));
      this.codexGuard.watch(form);
    }
    root.querySelectorAll('[data-ag-codex-actor]').forEach(el=>el.addEventListener('change',e=>{run(async()=>{
      this.focusAfterRender=`[data-ag-codex-actor="${el.dataset.agCodexActor}"][value="${el.value}"]`;this.codexReopen=el.dataset.agCodexActor;
      await codexService().setReveal(this.codexFocus,el.dataset.agCodexActor,{mode:'actor',actorId:el.value,on:el.checked});
      this.codexMessage='Saved. Players see the change next time they open the codex.';await this.#renderCodex();});}));
    // 0.67.0: Reveal to... on a list row and on the open NPC; the focus returns to the button that opened it.
    root.querySelectorAll('[data-ag-codex-revealto]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();
      run(()=>this.#revealToDialog(el.dataset.agCodexRevealto,el));}));
    // Multi-field panel: ticks live in this.codexBulk; changes are reflected in place (no re-render).
    const panel=root.querySelector('[data-ag-codex-bulk]');
    if(panel&&this.codexFocus){
      const b=this.#bulkFor(this.codexFocus);
      panel.querySelectorAll('[data-ag-codex-bulk-key]').forEach(el=>el.addEventListener('change',()=>{
        if(el.checked)b.keys.add(el.dataset.agCodexBulkKey);else b.keys.delete(el.dataset.agCodexBulkKey);this.#syncBulk(root);}));
      panel.querySelectorAll('[data-ag-codex-bulk-keys]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();
        b.keys.clear();
        if(el.dataset.agCodexBulkKeys==='all')panel.querySelectorAll('[data-ag-codex-bulk-key]:not(:disabled)').forEach(k=>b.keys.add(k.dataset.agCodexBulkKey));
        this.#syncBulk(root);}));
      panel.querySelectorAll('[data-ag-codex-bulk-char]').forEach(el=>el.addEventListener('change',()=>{
        if(el.checked){b.chars.add(el.value);b.mode='actors';}else b.chars.delete(el.value);this.#syncBulk(root);}));
      panel.querySelectorAll('[data-ag-codex-bulk-chars]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();
        b.chars.clear();
        if(el.dataset.agCodexBulkChars==='all'){panel.querySelectorAll('[data-ag-codex-bulk-char]').forEach(c=>b.chars.add(c.value));b.mode='actors';}
        this.#syncBulk(root);}));
      bindSkinPicker(panel.querySelector('[data-ag-codex-bulk-mode]'),mode=>{b.mode=mode;this.#syncBulk(root);},{valueKey:'mode'});
    }
    bindDeityLinks(root);
  }
  /** One reveal result into the visible confirmation line and the toast. */
  #noteReveal(id,result) {
    this.codexNote={id,text:result.message};this.codexMessage='Saved.';
  }
  /** Reveal to... (row or open NPC): pick characters and fields, confirm, apply through the GM-only service. */
  async #revealToDialog(id,trigger) {
    const svc=codexService();
    const pick=await askRevealTo({entry:svc.get(id),characters:svc.characters()});
    this.focusAfterRender=`[data-ag-codex-revealto="${id}"]`;
    if(!pick){await this.#renderCodex();return;}
    const result=await svc.setRevealMany(id,{fields:pick.fields,mode:pick.mode,characters:pick.characters});
    this.#noteReveal(id,result);toast(result.message);await this.#renderCodex();
  }
  async #codexAction(name) {
    const svc=codexService();
    switch(name){
      case 'codex-save': {
        const root=this.element;
        const form=root.querySelector('[data-ag-codex-form]');
        // A blank name is refused by the service with a message; nothing is saved and the draft stays.
        let rejected;
        try{({rejected}=await svc.setDetails(this.codexFocus,{learned:root.querySelector('[data-ag-codex-learned]')?.value??'',
          notes:root.querySelector('[data-ag-codex-notes]')?.value??'',links:root.querySelector('[data-ag-codex-links]')?.value??'',
          status:root.querySelector('[data-ag-codex-status-select]')?.value,edits:form?this.#readCodexEdits(form):undefined}));}
        catch(error){toast(error.message,true);this.codexMessage=error.message;this.focusAfterRender='[data-ag-action="codex-save"]';break;}
        this.codexDraft=null;this.codexGuard.markClean();this.focusAfterRender='[data-ag-action="codex-save"]';
        this.codexMessage=rejected.length?`Saved. Not a linkable id, left out: ${rejected.join(', ')}. Use LOC-, FAC-, DEITY-, QUEST-, NPC- style ids.`:'Saved.';
        toast(this.codexMessage,rejected.length>0);break;
      }
      case 'codex-cancel': this.codexDraft=null;this.codexGuard.markClean();this.focusAfterRender='[data-ag-action="codex-cancel"]';this.codexMessage='Changes discarded.';break;
      case 'codex-close': if(!(await this.codexGuard.confirm()))return;this.codexDraft=null;this.codexFocus=null;break;
      case 'codex-hide-all': {
        const entry=svc.get(this.codexFocus);
        const yes=await confirmDanger(`Hide ${entry.name} and every field from all players? What the party has learned and your notes are kept.`,
          {title:'Hide this NPC from players?',yes:'Hide from players'});
        if(!yes)return;
        for(const key of ['discovery',...entry.fields.map(f=>f.key)])await svc.setReveal(entry.id,key,{mode:'hidden'});
        this.codexMessage=`${entry.name} is hidden from players.`;break;
      }
      case 'codex-bulk-apply': case 'codex-preset-basics': case 'codex-preset-everything': {
        const b=this.#bulkFor(this.codexFocus),id=this.codexFocus,preset=name==='codex-preset-basics'?'basics':name==='codex-preset-everything'?'everything':null;
        this.focusAfterRender=`[data-ag-action="${name}"]`;
        // 0.70.2: always answers on screen (done, nothing to do, or why not); see runBulkReveal.
        const out=await runBulkReveal({svc,id,bulk:b,preset,confirmHide:()=>confirmDanger(
          `Hide ${b.keys.size} field${b.keys.size===1?'':'s'} of ${svc.get(id).name} from all players? The Undo button stays available right after.`,
          {title:'Hide these fields from players?',yes:`Hide ${b.keys.size} field${b.keys.size===1?'':'s'}`})});
        if(out.cancelled)return;
        this.codexNote={id,text:out.message,tone:out.tone};this.codexMessage=out.ok?'Saved.':out.message;
        toast(out.message,out.tone==='danger'||out.tone==='warn');break;
      }
      case 'codex-undo': {
        this.focusAfterRender='[data-ag-codex-apply]';
        try{const result=await svc.undoReveal(this.codexFocus);
          this.codexNote={id:this.codexFocus,text:result.message,tone:'ok'};this.codexMessage='Saved.';toast(result.message);}
        catch(error){this.codexNote={id:this.codexFocus,text:error.message,tone:'warn'};toast(error.message,true);}
        break;
      }
      case 'codex-export': downloadJson(`AG_NPC_Codex_${new Date().toISOString().slice(0,10)}.json`,svc.exportAll());
        this.codexMessage='Codex exported (GM file: it contains GM-only fields).';break;
      case 'codex-player-view': await openCodexPlayerView();return;
      case 'codex-open-actor': {const uuid=svc.get(this.codexFocus).uuid;const doc=uuid?await (globalThis.fromUuid??foundry.utils.fromUuid)(uuid):null;doc?.sheet?.render?.({force:true});return;}
    }
    await this.#renderCodex();
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
    const yes=await confirmDanger(`Replace reveals, learned text, links and notes for ${plan.apply.length} NPC(s) with the ones in ${file.name}?${plan.missing.length?`\n${plan.missing.length} NPC(s) in the file are not in this world and are skipped.`:''}\nNPC content is not changed; it comes from the package import.`,
      {title:'Restore codex reveals?',yes:`Restore ${plan.apply.length} NPC(s)`});
    if(!yes)return;
    const out=await svc.applyImport(plan);
    this.codexMessage=`Restored ${out.done} NPC(s).${out.errors.length?` Failed: ${out.errors.join(' | ')}`:''}`;
    toast(this.codexMessage,out.errors.length>0);await this.render();
  }
  // ---------- Pull from GitHub (0.59.0) ----------
  // The token lives in a client-scope setting and is read only inside github-pull.js; this window never holds it beyond what the GM types.
  #ghStore() { return {get:name=>game.settings.get(MODULE_ID,name),set:(name,value)=>game.settings.set(MODULE_ID,name,value)}; }
  #ghDraft() {
    if(!this.gh.draft) {
      const saved=github.loadConfig(game.user,{store:this.#ghStore()}).config??{};
      this.gh.draft={repo:saved.repo??'',branch:saved.branch??'main',paths:(saved.paths??[]).join('\n'),token:''};
    }
    return this.gh.draft;
  }
  #ghHtml_state() {
    const g=this.gh, status=github.tokenStatus(game.user,{store:this.#ghStore()});
    return {draft:this.#ghDraft(),dirty:g.dirty,token:{saved:status.saved,masked:status.masked},packs:g.packs,selected:g.selected,busy:this.busy,stopping:g.stopping,
      rows:g.rows,progress:g.progress,message:g.message,update:g.update,pulled:g.pulled,syncOn:this.sync.on};
  }
  #githubHtml() {
    if(!game.user?.isGM)return '';
    return githubView(this.#ghHtml_state());
  }
  #bindGithub(root) {
    root.querySelectorAll('[data-ag-gh-field]').forEach(el=>el.addEventListener('input',()=>{
      this.#ghDraft()[el.dataset.agGhField]=el.value;
      if(!this.gh.dirty) { this.gh.dirty=true;void this.#ghDirtyPaint(root); }
    }));
    root.querySelectorAll('[data-ag-gh-pack]').forEach(el=>el.addEventListener('change',()=>{
      const set=new Set(this.gh.selected);
      if(el.checked)set.add(el.dataset.agGhPack);else set.delete(el.dataset.agGhPack);
      this.gh.selected=[...set];
      const pull=root.querySelector('[data-ag-action="gh-pull"]');if(pull)pull.disabled=this.busy||!this.gh.selected.length;
      this.#ghOtherPaint(root);
    }));
    this.#ghOtherBind(root);
    // Not a data-ag-action: those are ignored while busy, and Cancel must work while files are being read.
    root.querySelector('[data-ag-gh-stop]')?.addEventListener('click',event=>{
      event.preventDefault();if(!this.gh.abort)return;
      this.gh.abort.abort();this.gh.stopping=true;event.currentTarget.disabled=true;
      const el=root.querySelector('[data-ag-gh-status]');if(el)el.textContent='Stopping…';
    });
  }
  /** Typing never re-renders (focus stays in the box); only the Save button and its "Unsaved changes" note appear. */
  /** 0.71.4: the closed fold of folders without a manifest. Open/closed is remembered per client (uiState: localStorage, never throws); a ticked folder keeps it open. In place, no re-render. */
  #ghOtherBind(root) {
    const el=root.querySelector('details[data-ag-gh-other]');if(!el)return;
    const ticked=()=>el.querySelectorAll('[data-ag-gh-pack]:checked').length;
    if(!ticked()){const stored=this.ui.get('ghOtherFolders',false);if(typeof stored==='boolean'&&stored!==el.open)el.open=stored;}
    el.addEventListener('toggle',()=>{
      if(ticked()){if(!el.open)el.open=true;return;}
      if(this.ui.get('ghOtherFolders',false)!==el.open)this.ui.set('ghOtherFolders',el.open);
    });
  }
  #ghOtherPaint(root) {
    const el=root.querySelector('details[data-ag-gh-other]');if(!el)return;
    const n=el.querySelectorAll('[data-ag-gh-pack]:checked').length, summary=el.querySelector('summary');
    let count=summary?.querySelector('.ag-fold__count');
    if(n&&summary&&!count){count=document.createElement('span');count.className='ag-fold__count';summary.appendChild(count);}
    if(count){count.textContent=n?`${n} ticked`:'';if(!n)count.remove();}
    if(n)el.open=true;
  }
  async #ghDirtyPaint(root) {
    const save=root.querySelector('[data-ag-action="gh-save"]');
    if(save) { save.disabled=this.busy;
      if(!save.parentElement.querySelector('[data-ag-gh-dirty]')) save.insertAdjacentHTML('afterend','<span class="agmanager-tiny" role="status" data-ag-gh-dirty>Unsaved changes</span>'); }
  }
  /** Saves the form (settings and, when typed, the token). Changing the repository, branch or paths forgets the packs found for the old ones. */
  async #ghCommit({verify=true}={}) {
    const d=this.#ghDraft(), store=this.#ghStore(), before=github.loadConfig(game.user,{store}).config;
    const saved=await github.saveConfig(game.user,{store,input:{repo:d.repo,branch:d.branch,paths:d.paths}});
    if(!saved.ok)return saved;
    d.repo=saved.config.repo;d.branch=saved.config.branch;d.paths=saved.config.paths.join('\n');
    if(JSON.stringify(before)!==JSON.stringify(saved.config)) Object.assign(this.gh,{packs:[],selected:[],rows:[],pulled:null,update:null});
    // A token is saved only when the pasted text is a token AND GitHub accepts it for this repository.
    let tokenNote='';
    if(cleanToken(d.token)) {
      const t=await github.saveToken(game.user,{store,token:d.token,config:verify?saved.config:undefined});
      if(!t.ok)return {ok:false,message:t.message,tokenRefused:true};
      d.token='';tokenNote=t.message;
    } else if(String(d.token??'').trim()) {
      return {ok:false,message:tokenProblem(d.token)||'The token box holds text that is not a token. Clear it and paste the token again.',tokenRefused:true};
    }
    this.gh.dirty=false;
    return {ok:true,config:saved.config,tokenNote};
  }
  async #ghSave() {
    this.busy=true;this.gh.message={tone:'info',text:'Checking the token with GitHub\u2026'};await this.render();
    let r;
    try { r=await this.#ghCommit(); } finally { this.busy=false; }
    const has=github.tokenStatus(game.user,{store:this.#ghStore()}).saved;
    this.gh.message=r.ok?{tone:'ok',text:r.tokenNote?`Settings saved. ${r.tokenNote}`:has?'Settings saved. The token already saved on this device was not changed.':'Settings saved. There is no token yet: paste one and press Save settings.'}
      :{tone:'danger',text:r.message};
    await this.render();
  }
  async #ghRemoveToken() {
    const yes=await confirmDanger('Remove the GitHub token from this device? Pulling from GitHub stops working here until you save a token again. The token itself stays valid on GitHub: delete it there too if you no longer want it to exist.',{title:'Remove token?',yes:'Remove token'});
    if(!yes)return;
    const r=await github.removeToken(game.user,{store:this.#ghStore()});
    this.gh.message={tone:r.ok?'info':'danger',text:r.message};
    await this.render();
  }
  /** Runs one network job with the window locked and a Cancel button; the job gets the abort signal. */
  async #ghWork(job) {
    const committed=await this.#ghCommit();
    if(!committed.ok) { this.gh.message={tone:'danger',text:committed.message};await this.render();return; }
    if(!github.tokenStatus(game.user,{store:this.#ghStore()}).saved) { this.gh.message={tone:'danger',text:'Paste a GitHub token first (see Token above).'};await this.render();return; }
    const controller=new AbortController();
    Object.assign(this.gh,{abort:controller,stopping:false,message:null});
    this.busy=true;await this.render();
    try { await job(controller.signal,committed.config); }
    finally { this.busy=false;Object.assign(this.gh,{abort:null,stopping:false,progress:null});await this.render(); }
  }
  async #ghFind() {
    await this.#ghWork(async (signal,config)=>{
      this.gh.update=null;
      const r=await github.findPacks(game.user,{store:this.#ghStore(),signal,config});
      const notes=(r.notes??[]).slice(0,4).join(' ');
      if(!r.ok) { this.gh.packs=[];this.gh.selected=[];this.gh.message={tone:r.cancelled?'info':'danger',text:r.message}; return; }
      this.gh.packs=r.packs.map(p=>({id:p.id,label:p.label,source:p.kind==='folder'?`Folder ${p.folder}, files in name order`:p.manifestPath.split('/').at(-1),noManifest:p.kind==='folder',fileCount:p.files.length,ledgerCount:p.ledgerFiles?.length??0,missing:p.files.filter(f=>f.missing).length,files:p.files.map(f=>f.path)}));
      this.gh.selected=defaultSelection(this.gh.packs);
      this.gh.pulled=null;this.gh.rows=[];
      this.gh.message={tone:'info',text:`Found ${r.packs.length===1?'1 pack':`${r.packs.length} packs`} on ${config.branch}. Tick the ones to pull; folders without a manifest start unticked.${notes?` ${notes}`:''}`};
    });
  }
  async #ghCheck() {
    await this.#ghWork(async (signal,config)=>{
      const r=await github.checkForUpdates(game.user,{store:this.#ghStore(),signal,config});
      this.gh.update=r.ok?{tone:r.upToDate?'info':'warn',text:updateSummary(r)}:{tone:r.cancelled?'info':'danger',text:r.message};
    });
  }
  async #ghPull() {
    await this.#ghWork(async (signal,config)=>{
      const wanted=this.gh.selected.filter(id=>this.gh.packs.some(p=>p.id===id));
      const rows=new Map();
      for(const pack of this.gh.packs.filter(p=>wanted.includes(p.id))) for(const path of pack.files) rows.set(path,{path,status:'waiting'});
      this.gh.rows=[...rows.values()];this.gh.pulled=null;this.gh.update=null;
      this.gh.progress={done:0,total:rows.size};
      await this.render();
      let lastPaint=0;
      const paint=({path,status,done,total})=>{
        const row=rows.get(path)??{path,status};rows.set(path,row);row.status=status;
        this.gh.progress={done,total};
        const now=Date.now();
        if(now-lastPaint<120&&status!=='failed')return;
        lastPaint=now;
        const bar=this.element?.querySelector('[data-ag-gh-bar]');if(bar)bar.value=total?Math.min(1,done/total):0;
        const label=this.element?.querySelector('[data-ag-gh-status]');if(label&&!this.gh.stopping)label.textContent=`${done} of ${total} file${total===1?'':'s'} read`;
        const table=this.element?.querySelector('[data-ag-gh-rows]');if(table)table.innerHTML=rowsTable([...rows.values()]);
      };
      const r=await github.pullPacks(game.user,{store:this.#ghStore(),signal,config,manifestPaths:wanted,onProgress:paint});
      this.gh.rows=[...rows.values()];
      if(!r.ok) {
        const detail=(r.failed??[]).slice(0,3).map(f=>f.message).join(' ');
        this.gh.message={tone:r.cancelled?'info':'danger',text:`${r.message}${detail&&!r.cancelled&&!r.message.includes(detail)?` ${detail}`:''}`};
        this.sync.githubStale=null;
        return;
      }
      await github.recordPull(game.user,{store:this.#ghStore(),config,state:r.state});
      const usable=r.files.filter(f=>!f.ledger);
      this.gh.pulled={files:r.files,count:usable.length,ledger:[...r.files.filter(f=>f.ledger).map(f=>f.path),...(r.ledgerListed??[])],commit:r.commit,where:`${config.repo}@${config.branch}`};
      this.gh.message={tone:'ok',text:`Read ${r.files.length} file${r.files.length===1?'':'s'} from ${config.repo}@${config.branch} at commit ${String(r.commit??'').slice(0,7)}. Nothing in your world has changed.${r.notes?.length?` ${r.notes.join(' ')}`:''}`};
      // 0.78.0: Sync keeps the files of the earlier pull until Preview in Sync from package; say so instead of re-previewing old files.
      this.sync.githubStale=staleAfterPull(this.sync.inputs,this.sync.github,r.commit);
      if(this.sync.githubStale)this.gh.message={...this.gh.message,text:`${this.gh.message.text} ${STALE_PULL_HINT}`};
    });
  }
  /** The pulled files through Sync's own input stage; if any one is refused none is added (a half-read pack would look like deletions). */
  async #ghSyncInputs() {
    const made=github.syncFiles(game.user,{files:this.gh.pulled?.files});
    if(!made.ok||!made.files.length)return {problems:[made.message??'There are no JSON files to send. The pack lists only gathering node files or files that are not JSON.'],inputs:[]};
    const inputs=[],problems=[];
    for(const file of made.files) {
      try { const input=await this.#syncRead(file);input.github=true;inputs.push(input); }
      catch(error) { problems.push(String(error?.message??error)); }
    }
    return {problems,inputs};
  }
  async #ghSendSync() {
    if(!this.gh.pulled)return;
    const {problems,inputs}=await this.#ghSyncInputs();
    if(problems.length) { this.gh.message={tone:'danger',text:`Nothing was sent to Sync. ${problems.slice(0,3).join(' ')}`};await this.render();return; }
    // An earlier pull's files are replaced as a set, so a file the manifest dropped does not linger; files you chose by hand stay.
    this.sync.inputs=[...this.sync.inputs.filter(i=>!i.github),...inputs];
    this.sync.github={commit:this.gh.pulled.commit,where:this.gh.pulled.where,files:inputs.length};
    this.sync.githubStale=null;
    this.sync.on=true;
    this.#syncDrop('Files pulled from GitHub. Review the preview below; nothing in your world changes until you confirm.');
    this.gh.message={tone:'info',text:`${inputs.length} file${inputs.length===1?'':'s'} sent to Sync from package.`};
    await this.#syncPreview();
  }
  /** Normal import instead of Sync: the files become a ZIP-style list (Manager packages first), each previewed and applied in turn. */
  async #ghSendImport() {
    if(!this.gh.pulled)return;
    const {problems,inputs}=await this.#ghSyncInputs();
    if(problems.length) { this.gh.message={tone:'danger',text:`Nothing was loaded. ${problems.slice(0,3).join(' ')}`};await this.render();return; }
    const files=inputs.flatMap(i=>i.sources.map(src=>({filename:src.filename,kind:src.kind,label:src.label,count:src.records,payload:src.payload,status:'ok',notice:'',duplicateIds:[]})));
    sortBundleFiles(files,files.map(f=>f.filename.split('/').at(-1)));
    this.#clearLoaded('');
    this.zipMedia=new Map();
    this.zipBundle={source:'GitHub',files,skipped:inputs.flatMap(i=>i.skipped),assets:new Map(),duplicateArt:[],picked:new Set(files.map(f=>f.filename)),queue:null,current:null,outcome:new Map(),
      auto:false,autoUpdates:false,autoRunning:false,stopRequested:false,paused:null,summary:new Map()};
    this.message=`GitHub: ${bundleSummary(this.zipBundle)} Tick the files to import, then press Import selected files. Nothing in your world has changed.`;
    this.gh.message={tone:'info',text:'The files are listed under ZIP contents in the normal import.'};
    this.tab='import';await this.render();
  }

  // ---------- Sync from package (0.56.0) ----------
  /** The mode switch and the Sync section. Off by default; while it is on the normal import is paused, never mixed in. */
  #bindSync(root) {
    // The sync picker is bound once, by the shared binding in _onRender (#pickFile sends 'sync' to #syncPick). A second binding on the same input
    // would read input.files after the first one had cleared it, and a real file dialog would then pick nothing (0.60.14).
    root.querySelector('[data-ag-sync-mode]')?.addEventListener('change',event=>{
      if(this.busy)return;
      this.sync.on=Boolean(event.target.checked);
      this.focusAfterRender='[data-ag-sync-mode]';void this.render();
    });
    root.querySelector('[data-ag-sync-edited]')?.addEventListener('change',event=>{
      if(this.busy)return;
      this.sync.overwriteEdited=Boolean(event.target.checked);
      this.#syncDrop('The option changed. Press Preview sync again; nothing in your world changed.');
      this.focusAfterRender='[data-ag-sync-edited]';void this.render();
    });
    root.querySelector('[data-ag-sync-recreate]')?.addEventListener('change',event=>{
      if(this.busy)return;
      this.sync.recreateTypeChange=Boolean(event.target.checked)&&Boolean(game.user?.isGM);
      this.#syncDrop('The option changed. Press Preview sync again; nothing in your world changed.');
      this.focusAfterRender='[data-ag-sync-recreate]';void this.render();
    });
    root.querySelector('[data-ag-sync-actors]')?.addEventListener('change',event=>{
      if(this.busy)return;
      this.sync.updateActors=Boolean(event.target.checked)&&Boolean(game.user?.isGM);
      this.#syncDrop('The option changed. Press Preview sync again; nothing in your world changed.');
      this.focusAfterRender='[data-ag-sync-actors]';void this.render();
    });
    root.querySelector('[data-ag-sync-archive]')?.addEventListener('change',event=>{
      if(this.busy)return;
      this.sync.archiveMissing=Boolean(event.target.checked)&&Boolean(game.user?.isGM);
      this.#syncDrop('The option changed. Press Preview sync again; nothing in your world changed.');
      this.focusAfterRender='[data-ag-sync-archive]';void this.render();
    });
    root.querySelector('[data-ag-sync-update-external]')?.addEventListener('change',event=>{
      if(this.busy)return;
      this.sync.updateExternal=Boolean(event.target.checked)&&Boolean(game.user?.isGM);
      this.#syncDrop('The option changed. Press Preview sync again; nothing in your world changed.');
      this.focusAfterRender='[data-ag-sync-update-external]';void this.render();
    });
    root.querySelector('[data-ag-sync-art]')?.addEventListener('change',event=>{
      if(this.busy)return;
      this.sync.replaceArt=Boolean(event.target.checked)&&Boolean(game.user?.isGM);
      this.#syncDrop('The option changed. Press Preview sync again; nothing in your world changed.');
      this.focusAfterRender='[data-ag-sync-art]';void this.render();
    });
    root.querySelector('[data-ag-sync-unscoped]')?.addEventListener('change',event=>{
      if(this.busy)return;
      this.sync.deleteUnscoped=Boolean(event.target.checked);
      this.#syncDrop('The option changed. Press Preview sync again; nothing in your world changed.');
      this.focusAfterRender='[data-ag-sync-unscoped]';void this.render();
    });
    root.querySelectorAll('[data-ag-sync-supersede]').forEach(el=>el.addEventListener('change',async event=>{
      if(this.busy||!event.target.checked)return;
      this.sync.supersede={...(this.sync.supersede??{}),[event.target.dataset.agSyncSupersede]:event.target.value};
      this.focusAfterRender=`[data-ag-sync-supersede="${event.target.dataset.agSyncSupersede}"][value="${event.target.value}"]`;
      await this.#syncPreview();
    }));
    // The red button only wakes up when the phrase is typed; typing never re-renders, so focus stays in the box.
    root.querySelector('[data-ag-sync-jump]')?.addEventListener('click',()=>{
      const box=root.querySelector('#agm-sync-confirm'),input=root.querySelector('[data-ag-sync-phrase]');
      box?.scrollIntoView({block:'center',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});input?.focus({preventScroll:true});
    });
    root.querySelector('[data-ag-sync-phrase]')?.addEventListener('input',event=>{
      this.sync.phrase=event.target.value;
      const run=root.querySelector('[data-ag-sync-run]');if(run)run.disabled=this.busy||!phraseOk(this.sync.phrase);
    });
    // Not a data-ag-action: those are ignored while busy, and Cancel must work while the sync writes.
    root.querySelector('[data-ag-sync-stop]')?.addEventListener('click',event=>{
      event.preventDefault();if(!this.sync.abort)return;
      this.sync.abort.abort();this.sync.stopping=true;event.currentTarget.disabled=true;
      const el=root.querySelector('[data-ag-sync-status]');if(el)el.textContent='Stopping after the current chunk…';
    });
  }
  /** True while a Sync, an Import or a ZIP run is writing: Clear inputs… is refused then. */
  #importRunning() {
    const z=this.zipBundle;
    return Boolean(this.busy||this.sync.abort||z?.running||(z?.autoMode&&!z?.paused));
  }
  /** Anything left from the last import or sync that Clear inputs… would remove. */
  #hasInputs() {
    return Boolean(this.pkg||this.rawPkg||this.specialist||this.zipBundle||this.sync.inputs.length||this.sync.set||this.sync.plan||this.sync.phrase||this.sync.result
      ||this.importReports.length||this.errors.length||this.warnings.length||this.moduleLinks.length||this.preview.length||this.selected.size||this.gh.rows.length||this.gh.pulled);
  }
  /**
   * 0.70.6 "Clear inputs…" (Import tab, Import and Sync): returns the page to its empty starting state. It only drops what this window holds
   * in memory (chosen files, the preview and its results, ticks, the typed confirmation phrase, messages and progress); it never touches world
   * documents, the hand-off ledger, backups or settings. Refused while something is running; after a cancelled, interrupted or failed Sync it
   * asks separately ("Discard the unfinished sync…", danger) because running the same files again would have finished it.
   */
  async #clearInputs() {
    if(!game.user?.isGM)return;
    if(this.#importRunning()){toast('Wait for the running Sync or Import to finish (or cancel it) before clearing.',true);return;}
    if(!this.#hasInputs()){toast('Nothing to clear: no files are loaded.');return;}
    const unfinished=Boolean(this.sync.unfinished);
    const yes=unfinished
      ? await confirmDanger('The last Sync did not finish. Everything it already wrote stays in your world, and running the same files again would finish it. Discarding forgets the chosen files and the preview, so you would have to choose them again. Nothing in your world, the hand-off record, your backups or your settings changes.',{title:'Discard the unfinished sync?',yes:'Discard the unfinished sync'})
      : await confirmDialog(`Clear the chosen files, the preview and its results, your ticks${this.sync.phrase?', the typed confirmation':''} and the messages? Nothing in your world, the hand-off record, your backups or your settings changes.`,{title:'Clear inputs?',yes:'Clear inputs'});
    if(!yes)return;
    this.pkg=null;this.rawPkg=null;this.specialist=null;this.zipBundle=null;this.zipMedia=new Map();this.packageSource=null;
    this.preview=[];this.errors=[];this.warnings=[];this.moduleLinks=[];this.selected.clear();this.importReports=[];this.auditEntries=[];
    this.iconOverrides=new Map();this.repickIcons=false;this.previewShown=PREVIEW_PAGE;
    this.message='Choose a Manager package or a Quest, Skill Tree, Headquarters or Factions file to begin.';
    Object.assign(this.sync,{inputs:[],githubStale:null,set:null,plan:null,phrase:'',result:null,progress:null,stopping:false,unfinished:false,shown:{},message:'Choose the package files, then press Preview sync. Nothing in your world changes before you confirm.'});
    Object.assign(this.gh,{rows:[],selected:[],pulled:null,update:null,message:null,progress:null});
    toast('Inputs cleared. Nothing in your world changed.');
    await this.render();
  }
  #syncDrop(message) {
    Object.assign(this.sync,{set:null,plan:null,phrase:'',result:null,progress:null,stopping:false,message});
  }
  #syncHtml() {
    const s=this.sync, joined=joinSyncInputs(s.inputs);
    return syncView({inputs:s.inputs.map(i=>({name:i.name,imports:i.sources})),skipped:joined.skipped,fileButton:this.#syncFileButton(),
      deleteUnscoped:s.deleteUnscoped,overwriteEdited:s.overwriteEdited,replaceArt:s.replaceArt,recreateTypeChange:s.recreateTypeChange,updateActors:s.updateActors,archiveMissing:s.archiveMissing,updateExternal:s.updateExternal,isGM:Boolean(game.user?.isGM),plan:s.plan,phrase:s.phrase,busy:this.busy,progress:s.progress,stopping:s.stopping,result:s.result,message:s.message,unfinished:Boolean(s.unfinished),shown:s.shown??{},github:s.inputs.some(i=>i.github)?s.github:null,githubStale:activeStale(s),githubStaleNotice:staleNotice(activeStale(s))});
  }
  #syncFileButton() {
    return fileButton({label:'Choose files or ZIPs for the sync…',accept:'.json,.zip,application/json,application/zip',multiple:true,icon:'fa-solid fa-folder-open',disabled:this.busy,data:{agFileKind:'sync'}});
  }
  /** One chosen file through Sync's own input stage, with the counts the file table shows. */
  async #syncRead(file) {
    const input=await readSyncInput(file);
    input.sources=input.sources.map(src=>({...src,records:src.kind==='manager'?src.payload.records.length:SPECIALIST_COUNT(src),packageId:src.kind==='manager'?src.payload.manifest?.package_id??null:null}));
    return input;
  }
  /** Reads every chosen file (JSON or ZIP) without touching the world; files already chosen stay, a file picked again replaces its earlier copy. */
  async #syncPick(files) {
    if(this.busy)return;
    const problems=[];
    for(const file of files) {
      try {
        const input=await this.#syncRead(file);
        this.sync.inputs=[...this.sync.inputs.filter(i=>i.name!==file.name),input];
      } catch(error) { problems.push(String(error?.message??error)); }
    }
    this.#syncDrop(problems.length?`${problems.join(' ')} The other files were read. Nothing in your world changed.`:'Files read. Press Preview sync to see exactly what would change. Nothing in your world has changed.');
    await this.render();
  }
  /** What a sync must know about the world; the planner never touches Foundry itself. */
  #syncPlanContext() {
    const folders=folderIndex([...(game.folders?.contents??[])]);
    const sceneActorIds=new Set(listOf(game.scenes).flatMap(scene=>listOf(scene.tokens).map(t=>t.actorId).filter(Boolean)));
    const hotbarMacroIds=new Set((game.users?.contents??[]).flatMap(user=>Object.values(user.hotbar??{})));
    const locApi=locationsApi(game), rteApi=routesApi(game), shpApi=shopsApi(game);
    const locationIds=locApi?new Set(locApi.listLocations().map(l=>l.id)):null;
    const routeIds=rteApi?new Set(rteApi.listRoutes().map(r=>r.id)):null;
    const shopSet=shopIds(shpApi);
    const copies=new Map();
    const worldUuid=new Map(allBoundDocuments().filter(d=>d.documentName==='Item').map(d=>[d.uuid,sourceFlag(d).sourceId]));
    for(const actor of (game.actors?.contents??[])) {
      if(actor.type!=='character')continue;
      for(const item of actor.items?.contents??[]) {
        const id=item.getFlag?.(MODULE_ID,'source')?.sourceId??worldUuid.get(item.flags?.core?.sourceId??item._stats?.compendiumSource);
        if(id)copies.set(id,(copies.get(id)??0)+1);
      }
    }
    const handed=moduleRecordIndex(locApi,shpApi);
    return {supersedeChoices:this.sync.supersede??{},supersedePreview:(kind,sup)=>this.sync.supersedePending?.get(JSON.stringify(sup.map)),
      includeDrafts:this.includeDrafts,deleteUnscoped:this.sync.deleteUnscoped,overwriteEdited:this.sync.overwriteEdited,replaceArt:Boolean(this.sync.replaceArt&&game.user?.isGM),recreateTypeChange:Boolean(this.sync.recreateTypeChange&&game.user?.isGM),updateActors:Boolean(this.sync.updateActors&&game.user?.isGM),archiveMissing:Boolean(this.sync.archiveMissing&&game.user?.isGM),updateExternal:Boolean(this.sync.updateExternal&&game.user?.isGM),partnerArchive:kind=>Boolean(partnerArchiveApi(game,kind)),
      retiredIds:new Set(game.settings.get(MODULE_ID,SYNC_RETIRED_SETTING)??[]),ledger:game.settings.get(MODULE_ID,HANDOFF_LEDGER_SETTING)??{},
      buildFlag:(record,manifest,available)=>sourceMetadata(record,{manifest},available),
      externalIds:new Set(withLocationIds(existingSourceIndex(),locApi).keys()),
      sceneActorIds,hotbarMacroIds,isProtectedFolder:id=>Boolean(id&&folders.isProtected(id)),
      locationIds,routeIds,shopIds:shopSet,specialistApi:kind=>specialistApi(game,kind),heldFingerprint:(which,id)=>heldFingerprint(which,id),moduleHas:(kind,id)=>handed(kind,id),
      validateExtra:records=>[...cinderDefinitionChecks(game,records).errors,...modifierDefinitionChecks(game,records).errors],
      copyCount:id=>copies.get(id)??0};
  }
  #syncWorld(ctx) {
    const docs=[];
    for(const type of MANAGED_TYPES) for(const doc of documentsOfType(type)) if(sourceFlag(doc)?.sourceId)docs.push(makeSnapshot(doc,ctx));
    const all=MANAGED_TYPES.flatMap(type=>documentsOfType(type));
    return {docs,characterCount:(game.actors?.contents??[]).filter(a=>a.type==='character').length,unflaggedNames:nameIndex(all)};
  }
  /** ZIP artwork: the same destination folder as a normal import, so the preview shows the paths the upload will give. */
  #syncSources(joined) {
    const assets=joined.assets;
    if(!assets.size)return joined.sources;
    return joined.sources.map(src=>{
      if(src.kind!=='manager')return src;
      const base=this.#syncArtBase(src.payload.manifest.package_id);
      const paths=new Map([...assets.keys()].map(name=>[name,`${base}/${name}`]));
      const records=src.payload.records.map(record=>this.uploadZipArtwork?adaptRecordArtwork(record,paths):withoutBundledArt(record,assets));
      return {...src,payload:{...src.payload,records}};
    });
  }
  #syncArtBase(packageId) { return `worlds/${game.world.id}/ashen-gate-imports/${String(packageId).toLowerCase().replace(/[^a-z0-9-]/g,'-')}`; }
  async #syncPreview() {
    if(activeStale(this.sync)) { this.sync.message=STALE_REFUSAL; return this.render(); }
    const joined=joinSyncInputs(this.sync.inputs);
    if(!joined.sources.length) { this.sync.message='Choose at least one package file first.'; return this.render(); }
    // 0.60.10: say which step failed and log the full stack, so an unexpected error is traceable (F12 > Console) instead of a bare toast.
    let step='reading the files';
    try {
      this.sync.set=buildSyncSet(this.#syncSources(joined));
      step='asking other modules what a superseded id would change';
      this.sync.supersedePending=new Map();
      for(const f of this.sync.set.specialistFiles) if(f.supersedes?.items?.length) {
        const parts=await previewPartners(game,f.supersedes.map);
        this.sync.supersedePending.set(JSON.stringify(f.supersedes.map),parts.length?parts.reduce((n,x)=>n+x.changes,0):null);
      }
      step='reading your world';
      const ctx=this.#syncPlanContext();
      const world=this.#syncWorld(ctx);
      step='comparing the files with your world';
      this.sync.plan=planSync(this.sync.set,world,ctx);
    } catch(error) {
      console.error(`[${MODULE_ID}] ${SYNC_NAME}: preview failed while ${step}`,error);
      this.sync.plan=null;
      this.sync.message=`Preview sync stopped while ${step}: ${String(error?.message??error)}. Nothing has changed. Open the browser console (F12) and send the red error with its stack lines.`;
      return this.render();
    }
    for(const f of this.sync.plan.failures??[]) console.warn(`[${MODULE_ID}] ${SYNC_NAME}: could not compare ${f.id} (${f.step})`,f.stack??f.message);
    this.sync.phrase='';this.sync.result=null;
    const c=this.sync.plan.counts;
    this.sync.message=this.sync.plan.ok?`Preview: ${c.create} to create, ${c.overwrite} to overwrite, ${c.keptEdited} kept (edited in your world), ${c.delete} to delete, ${c.untouched} untouched. Nothing has changed yet.`:'Preview stopped: see the problems below. Nothing has changed.';
    await this.render();
  }
  #syncPreviewFile() {
    const plan=this.sync.plan;
    return {schema:'ag-sync-preview/1',created_at:new Date().toISOString(),counts:plan.counts,gm_edited_fields_lost:plan.lost,scope:plan.scope,notes:plan.notes,errors:plan.errors,
      rows:plan.rows.map(r=>({group:r.group,id:r.id,name:r.name,kind:r.kind,reason:r.reason,refused:Boolean(r.refused),metadata_only:Boolean(r.metadataOnly),module:r.module??null,
        changes:r.changes.map(({label,from,to,gmEdited})=>({field:label,now:from,package:to,gm_edit_replaced:gmEdited})),
        art_kept:(r.artKept??[]).map(a=>({field:a.label,yours:a.live,package:a.package}))}))};
  }
  #syncReport() {
    if(!this.sync.plan)return;
    downloadJson(`AG_Sync_Preview_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`,this.#syncPreviewFile());
    toast('Downloaded the full preview. Nothing changed.');
  }
  #syncBackupData(plan) {
    let modules=null;
    try { modules=collectModuleSections(game); } catch(error) { modules={error:String(error?.message??error)}; }
    return buildSyncBackup(plan,{world:game.world,modules});
  }
  #syncBackupFile() {
    if(!this.sync.plan?.ok)return;
    downloadJson(`AG_Sync_Backup_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`,this.#syncBackupData(this.sync.plan));
    toast('Downloaded the backup of everything this sync would overwrite or delete. Nothing changed.');
  }
  async #syncRun() {
    const plan=this.sync.plan;
    if(!plan?.ok)return;
    if(!game.user?.isGM||activeStale(this.sync)) { toast(STALE_REFUSAL,true); return; }
    if(phraseRequired(plan)&&!phraseOk(this.sync.phrase)) { toast(`Type "${SYNC_PHRASE}" to confirm.`,true); return; }
    const c=plan.counts;
    const yes=!phraseRequired(plan)
      ?await confirmDialog(`${c.rename} record(s) will be renamed to the package's name. Nothing else in your world changes: ids, links, folders, ownership and sheets stay.`,{title:'Rename records?',yes:plan.buttonLabel})
      :plan.metadataOnly
      ?await confirmDialog(`Nothing in your world's content changes. ${c.metadataRefreshes} record(s) will have their stored package data (definition, version, provenance) updated so new package fields reach the world. Nothing is created or deleted.`,{title:`${SYNC_PHRASE}?`,yes:plan.buttonLabel})
      :await confirmDanger(`${c.create} record(s) will be created,${c.rename?` ${c.rename} renamed,`:''}${c.recreate?` ${c.recreate} Item(s) recreated (deleted and created again because their type changed; copies on character sheets stay),`:''} ${c.overwrite} updated${plan.overwriteEdited?` (${plan.lost} GM-edited field(s) replaced)`:''}${plan.replaceArt?', and art you set is REPLACED by the package\'s (Also replace art I set is ticked)':c.artKept?`, your art kept on ${c.artKept} record(s)`:''}${c.keptEdited?`, ${c.keptEdited} edited in your world kept as they are${c.keptRemoved?` (${c.keptRemoved} of them are no longer in the files and are not deleted)`:''}`:''} and ${c.delete} deleted${plan.overwriteEdited?' (including records you edited that the files no longer carry)':''}${c.archive?`, ${c.archive} ARCHIVED (hidden from players, moved to an Archive folder, restorable; nothing is deleted and no id is retired)`:''}${c.restore?`, ${c.restore} restored from the archive`:''}${c.metadataRefreshes?`, and ${c.metadataRefreshes} refreshed with no content change`:''}.\nCharacter sheets, their Items, effects, flags and hotbars are not touched. Documents Manager did not import are not touched. Records other modules own are passed to them in update mode and never deleted from here.\nA JSON backup of everything that will be overwritten or deleted downloads first; if it fails nothing is written. You can cancel while it runs, and running the same files again finishes the job.`,
      {title:`${SYNC_PHRASE}?`,yes:plan.buttonLabel});
    if(!yes)return;
    const set=this.sync.set, controller=new AbortController();
    Object.assign(this.sync,{abort:controller,stopping:false,result:null,progress:{pct:0,label:'Starting…'}});
    this.busy=true;bulkWork.sync=true;await this.render();
    const results=[];
    // 0.70.1: one line that always moves: counts per chunk, the sub-step and record being written, elapsed time, a heartbeat every
    // few seconds even when no count moved, and a plain warning (also in the console) when nothing has moved for a minute.
    const progress=createProgress({
      isStopping:()=>this.sync.stopping,
      warn:text=>console.warn(`[${MODULE_ID}] ${text}`),
      paint:({pct,label,stalled})=>{
        this.sync.progress={pct,label,stalled};
        const bar=this.element?.querySelector('[data-ag-sync-bar]');if(bar)bar.value=pct;
        const el=this.element?.querySelector('[data-ag-sync-status]');if(el)el.textContent=label;
      }});
    const paint=event=>progress.report(event);
    const heartbeat=setInterval(()=>{try{progress.beat();}catch{/* the line is cosmetic */}},HEARTBEAT_MS);
    const log={at:new Date().toISOString(),packageId:`${SYNC_NAME}: ${plan.scope.lines.map(l=>l.packageId).join(', ')||'specialist files'}`,packageVersion:plan.scope.lines.flatMap(l=>l.versions).join(', ')||'—',results:[]};
    let outcome=null,failure=null;
    try {
      await legacyRun; // a reference update still running steps aside at its next chunk (bulkWork.sync is set); never two bulk writers at once
      await runFolderRenames();
      outcome=await executeSync(plan,this.#syncAdapter(set,results),{user:game.user,confirmation:this.sync.phrase,signal:controller.signal,onProgress:paint,chunk:20});
      log.results.push(...outcome.log.filter(r=>r.status!=='note'||r.message));
    } catch(error) {
      failure=String(error?.message??error);
      console.error(`[${MODULE_ID}] ${SYNC_NAME} failed`,error);
      log.results.push({action:'sync-aborted',status:'error',message:failure,id:'—'});
    } finally {
      clearInterval(heartbeat);
      this.sync.connection?.dispose?.();this.sync.connection=null;
      this.busy=false;bulkWork.sync=false;this.sync.abort=null;this.sync.progress=null;this.sync.stopping=false;
      // The history entry is a world setting write: with a dead connection it would never answer, so it may not hold the window.
      try {
        const prior=game.settings.get(MODULE_ID,'importHistory')??[];
        await Promise.race([game.settings.set(MODULE_ID,'importHistory',[...prior,log].slice(-40)),new Promise((_,reject)=>setTimeout(()=>reject(new Error('no answer from the server')),30000))]);
      } catch(error) { console.warn(`[${MODULE_ID}] Sync history not saved`,error); }
      emitBulkFinished('sync');
      void maybeResumeLegacy();
    }
    this.sync.unfinished=Boolean(failure||outcome?.cancelled||outcome?.interrupted||!outcome?.completed);
    const k=outcome?.counts;
    const named=r=>`${r.name??r.id??''} ${r.action??''}: ${r.message??r.status}`;
    const lines=failure?[`${SYNC_NAME} stopped before finishing: ${failure}`,'Anything already written stays; the sync is safe to run again.']
      :outcome.interrupted?[outcome.interrupted.message,`So far: ${k.created} created, ${k.updated} overwritten, ${k.deleted} deleted. Nothing is half-written that the same sync does not finish.`]
      :[`${outcome.cancelled?'Cancelled part way. ':''}${k.created} created, ${k.recreated?`${k.recreated} recreated, `:''}${k.renamed?`${k.renamed} renamed, `:''}${k.updated} overwritten, ${k.metadataRefreshed} metadata refreshed, ${k.deleted} deleted, ${k.archived?`${k.archived} archived (restorable), `:''}${k.restored?`${k.restored} restored, `:''}${k.failed} failed, ${k.skipped} skipped.`,
        ...(outcome.cancelled?['Run the same files again to finish; what is already done is not repeated.']:[]),
        ...summarizeErrors(outcome.log).map(e=>`${e.count} records failed with the same error: ${e.message} (for example ${e.names.join(', ')})`),
        ...outcome.log.filter(r=>['error','skipped'].includes(r.status)&&!summarizeErrors(outcome.log).some(e=>e.message===r.message)).slice(0,8).map(named)];
    await this.#syncPreview();
    this.sync.result={tone:failure||k?.failed||outcome?.interrupted?'danger':outcome?.cancelled||k?.skipped?'warn':'ok',lines};
    toast(lines[0],Boolean(failure||k?.failed||outcome?.interrupted));
    await this.render();
  }
  /** The Foundry-specific half of a sync run (the planner and executor are tested without Foundry). */
  #syncAdapter(set,results) {
    const records=[...set.records.values()].map(r=>r.record);
    // 0.70.1: the id set was rebuilt from the whole world (3 times) for every record; the argument is only passed through, so one set serves the run.
    let presentIds=null;
    const present=id=>{presentIds??=new Set(existingSourceIndex().keys());presentIds.add(id);return presentIds;};
    const connection=createConnection(game.socket?.io);
    const archiveFolders=new Map();
    this.sync.connection=connection;
    return {
      connection,
      docsById:()=>{const map=new Map();for(const doc of allBoundDocuments()){const id=sourceFlag(doc)?.sourceId;if(id)(map.get(id)??map.set(id,[]).get(id)).push(doc);}return map;},
      updateDocuments:(name,updates,opts)=>({Item,JournalEntry,Actor,RollTable,Macro}[name]).updateDocuments(updates,opts),
      backup: async plan=>{ downloadJson(`AG_Sync_Backup_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`,this.#syncBackupData(plan)); },
      replan: async ()=>{ const ctx=this.#syncPlanContext(); return planSync(set,this.#syncWorld(ctx),ctx); },
      uploadArt: async rows=>{
        if(!this.uploadZipArtwork)return;
        const assets=joinSyncInputs(this.sync.inputs).assets;
        if(!assets.size)return;
        const byLine=new Map();
        for(const row of rows)(byLine.get(row.manifest.package_id)??byLine.set(row.manifest.package_id,[]).get(row.manifest.package_id)).push(row.record);
        for(const [line,recs] of byLine) {
          const base=this.#syncArtBase(line), got=await uploadMatchingArt(assets,recs,base,entry=>results.push(entry));
          for(const [name,path] of got) if(path!==`${base}/${name}`) throw new Error(`Foundry stored ${name} at ${path}, not where the preview said (${base}/${name}). Nothing was written; use Foundry's file browser to check the folder.`);
        }
      },
      create: async row=>createRecord(row.record,{manifest:row.manifest},present(row.id),entry=>results.push({...entry,id:entry.id??row.id}),{smart:this.smartIcons}),
      docFor: row=>foundDocuments(row.id)[0],
      buildFlag: row=>sourceMetadata(row.record,{manifest:row.manifest},present(row.id)),
      // The importer's own ownership rule (release.js): an update raises a plain None default to Observer for approved, player-visible records.
      extraUpdate: (doc,row)=>{const levels=CONST.DOCUMENT_OWNERSHIP_LEVELS;return releasable(doc,sourceMetadata(row.record,{manifest:row.manifest},present(row.id)),levels)?{'ownership.default':levels.OBSERVER,[`flags.${MODULE_ID}.${BASELINE_FLAG}`]:levels.OBSERVER}:{};},
      // 0.64.0 `supersedes`: the old ids are retired for good, Manager's own references follow, then the partner modules re-key their saved ids.
      afterRebind: async (map,rows)=>{
        const out=[];
        await game.settings.set(MODULE_ID,SYNC_RETIRED_SETTING,[...new Set([...(game.settings.get(MODULE_ID,SYNC_RETIRED_SETTING)??[]),...Object.keys(map)])].sort());
        const mine=await renameManagerRefs(allBoundDocuments(),map,{user:game.user});
        if(mine.changed)out.push({id:'ashen-gate-manager',kind:'Manager',action:'supersede-ids',status:'ok',message:`Manager: ${mine.changed} document(s) had references or Codex links moved to the new id(s).`});
        out.push(...await applyPartners(game,map,{user:game.user}));
        return out;
      },
      supersedeSpecialist: async sp=>{
        const file=set.specialistFiles.find(f=>f.filename===sp.filename);
        return applyPartners(game,sp.map,{user:game.user,definitions:file?.supersedes?.definitions});
      },
      bindLinks: async (rows,log,{signal,guard,onStep,chunk,pause}={})=>{
        const plans=new Map(rows.filter(r=>r.kind==='Actor'&&['overwrite','rebind'].includes(r.group)).map(r=>[r.id,{patch:{touched:(r.ops.items?.create?.length||r.ops.items?.update?.length)?itemKeys(r.record.foundry.data.items??[]):[]}}]));
        return bindPackageLinks({records,rows:rows.map(r=>({id:r.id,action:r.group==='create'?'create':r.group==='rebind'?'rebind':'update',kind:r.kind})),log:{results:log},plans,signal,guard,onStep,chunk,pause,
          world:{moduleId:MODULE_ID,itemFlag:ITEM_FLAG,documents:allBoundDocuments,sourceFlag,moduleRecord:moduleRecordLookup(game),
            updateDocuments:(name,updates,opts)=>({Item,JournalEntry,Actor,RollTable,Macro}[name]).updateDocuments(updates,opts)}});
      },
      heldFingerprint:row=>heldFingerprint(row.specialist??(['Shop','Service','MerchantList'].includes(row.kind)?'shops':'locations'),row.id),
      apis: {locations:locationsApi(game),routes:routesApi(game),shops:shopsApi(game),specialist:kind=>specialistApi(game,kind)},
      // 0.75.0 archive: the same folder-and-flag archive as Library; one folder per document type, created once per run.
      archiveFolder: documentName=>{
        const name=archiveFolderName(documentName);
        return archiveFolders.get(name)??archiveFolders.set(name,(async()=>game.folders.find(f=>f.type===documentName&&f.name===name&&!f.folder)??await Folder.create({name,type:documentName,sorting:'a'}))()).get(name);
      },
      restoreFolder: async (doc,lifecycle)=>{const prev=lifecycle?.previousFolderId;return prev&&game.folders.get(prev)?.type===doc.documentName?prev:(await destinationFolder(doc.documentName)).id;},
      partnerApi: kind=>partnerArchiveApi(game,kind),
      updateExternal: Boolean(this.sync.updateExternal&&game.user?.isGM),
      retire: async ids=>{ const prior=new Set(game.settings.get(MODULE_ID,SYNC_RETIRED_SETTING)??[]);for(const id of ids)prior.add(id);await game.settings.set(MODULE_ID,SYNC_RETIRED_SETTING,[...prior].sort()); },
      saveLedger: saveLedgerEntries,
      pause: ()=>new Promise(resolve=>setTimeout(resolve,0))
    };
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
    myAppearanceApp=this;this.selection=null;this.sizeSelection=null;this.chatSelection=null;this.status='Select a skin, or inherit the GM world default.';
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
      sizes:appearanceController.listSizes().map(s=>({...s,selected:s.id===size})),
      styleChat:this.chatSelection??state.chat};
  }
  async _onRender(ctx,options){
    await super._onRender(ctx,options);
    const root=this.element;
    bindSkinPicker(root.querySelector('[data-ag-skin-picker="my"]'),value=>{this.selection=value;this.guard.markDirty();});
    bindSkinPicker(root.querySelector('[data-ag-size-picker="my"]'),value=>{this.sizeSelection=value;this.guard.markDirty();},{valueKey:'agSizeValue'});
    root.querySelector('[data-ag-chat-style]')?.addEventListener('change',e=>{this.chatSelection=e.currentTarget.checked;this.guard.markDirty();});
    if(this.guard.dirty)this.guard.markDirty();
    root.querySelector('[data-ag-my-help]')?.addEventListener('click',e=>{e.preventDefault();
      void infoDialog('My Appearance help','<p>Pick a skin for every Ashen Gate window, or <strong>Inherit world default</strong> to follow the GM\u2019s choice. <strong>Size</strong> makes text and controls larger on this device only. Nothing changes until <strong>Save My Appearance</strong>; Cancel puts back what is saved.</p><p>This never opens GM tools, and it never changes Player Access, progress or permissions.</p>');});
    root.querySelector('[data-ag-my-cancel]')?.addEventListener('click',async e=>{
      e.preventDefault();this.selection=null;this.sizeSelection=null;this.chatSelection=null;this.guard.markClean();this.status='Changes discarded.';await this.render();
    });
    root.querySelector('[data-ag-my-save]')?.addEventListener('click',async e=>{
      e.preventDefault();const button=e.currentTarget;button.disabled=true;
      try {const state=appearanceController.getState();
        const chosen=this.selection===null ? (state.userOverride??'') : this.selection;
        await appearanceController.setUserOverride(chosen);
        if(this.sizeSelection&&this.sizeSelection!==state.size)await appearanceController.setSize(this.sizeSelection);
        if(this.chatSelection!==null&&this.chatSelection!==state.chat)await appearanceController.setChat(this.chatSelection);
        this.status=chosen?'Your personal Ashen Gate appearance is saved.':'You now inherit the GM world default.';
        this.selection=null;this.sizeSelection=null;this.chatSelection=null;this.guard.markClean();await this.render();
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
    refLinks().invalidateCodex();
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
    // 0.68.0: a reference link opened the Codex at one NPC: bring that card into view and give it focus.
    const focus=this.focusNpc;this.focusNpc=null;
    if(focus){const card=[...content.querySelectorAll('[data-npc]')].find(el=>el.dataset.npc===focus);
      if(card){card.classList.add('is-focused');card.setAttribute('tabindex','-1');card.scrollIntoView?.({block:'nearest'});card.focus?.({preventScroll:true});}}
  }
}
/** 0.40.0: Codex deity links open Renown's Pantheon (api.open, feature-detected). A failure is a notice, never a crash. */
/**
 * After documents are written: binds [[AGREF]] markers and typed references to real UUIDs and refreshes each document's
 * stored baseline. Shared by Import and Sync from package (0.56.0). `rows` are the written rows ({id, action}); plans holds each
 * Actor row's plan (its touched Items).
 */
async function resolvePackageLinks({pkg,rows,log,plans,signal=null,onStep=null,guard=undefined}) {
  // 0.70.1: link-binding.js builds every lookup once and writes in chunks (it used to scan the whole world for every record).
  return bindPackageLinks({records:pkg.records,rows,log,plans,signal,onStep:onStep??undefined,guard,pause:yieldToBrowser,
    world:{moduleId:MODULE_ID,itemFlag:ITEM_FLAG,documents:allBoundDocuments,sourceFlag,moduleRecord:moduleRecordLookup(game),
      updateDocuments:(name,updates,opts)=>({Item,JournalEntry,Actor,RollTable,Macro}[name]).updateDocuments(updates,opts)}});
}
const yieldToBrowser=()=>new Promise(resolve=>setTimeout(resolve,0));
/** Sync from package (0.56.0): ZIP artwork cannot be uploaded when the GM turned that off, so a record keeps its current image instead of a broken path. */
function withoutBundledArt(record,assets) {
  const data=record.foundry?.data;
  if(!data)return record;
  const named=value=>{const name=mediaFilename(value);return Boolean(name&&assets.has(name));};
  if(!named(data.img)&&!named(data.prototypeToken?.texture?.src))return record;
  const clone=structuredClone(record);
  if(named(clone.foundry.data.img))delete clone.foundry.data.img;
  if(named(clone.foundry.data.prototypeToken?.texture?.src))delete clone.foundry.data.prototypeToken.texture.src;
  return clone;
}
const PREVIEW_PAGE=100; // Import preview rows drawn at a time (the page scrolls; no inner scroll box)
const SPECIALIST_COUNT=src=>specialistCount(src.kind,src.payload);
/** Which module-owned ids still exist, for "Not removed: remove it in <module>" (undefined when Manager cannot tell). */
function moduleRecordIndex(locApi,shpApi) {
  const loc=locApi?new Set(locApi.listLocations().map(l=>l.id)):null, shop=shopIds(shpApi);
  return (kind,id)=>kind==='Location'||kind==='Route'?(loc?loc.has(id):undefined):['Shop','Service','MerchantList'].includes(kind)?(shop?shop.has(id):undefined):undefined;
}
/** Remembers which ids Manager passed to other modules, per package line, so a later sync can say what a newer package no longer carries. */
/** The owning module's own fingerprint of what it holds for an id, when it exposes `contentFingerprint(id)` (feature-detected; null otherwise). */
function heldFingerprint(which,id) {
  try {
    const api=which==='shops'?shopsApi(game):which==='locations'?locationsApi(game):specialistApi(game,which);
    const value=typeof api?.contentFingerprint==='function'?api.contentFingerprint(id):null;
    return typeof value==='string'&&value?value:null;
  } catch { return null; }
}
async function saveLedgerEntries(entries) {
  if(!entries.length)return;
  const ledger=structuredClone(game.settings.get(MODULE_ID,HANDOFF_LEDGER_SETTING)??{});
  for(const e of entries)(ledger[e.key]??={})[e.id]=e.info;
  await game.settings.set(MODULE_ID,HANDOFF_LEDGER_SETTING,ledger);
}
const HANDOFF_KINDS={Location:'Locations',Route:'Locations',Shop:'Utilities',Service:'Utilities',MerchantList:'Utilities'};
function bindDeityLinks(root){
  root?.querySelectorAll?.('[data-ag-codex-deity]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();
    try{codexService().openDeity(el.dataset.agCodexDeity);}catch(err){ui.notifications?.warn?.(err.message);}}));
}
const initialsOf=name=>String(name??'').split(/\s+/).filter(w=>/^[A-Za-z]/.test(w)).slice(0,2).map(w=>w[0]).join('')||'?';
let codexApi=null;
let codexPlayerApp=null;
const codexService=()=>codexApi??=createCodexService({game,moduleId:MODULE_ID});
/** 0.67.0: Reveal to… from outside the Codex window (an NPC Actor sheet, a macro). GM only; the service re-checks. */
async function openRevealDialog(id){
  const svc=codexService();
  const pick=await askRevealTo({entry:svc.get(id),characters:svc.characters()});
  if(!pick)return null;
  const result=await svc.setRevealMany(id,{fields:pick.fields,mode:pick.mode,characters:pick.characters});
  toast(result.message);
  if(activeApp?.rendered){activeApp.codexNote={id,text:result.message};void activeApp.render();}
  return result;
}
/** Header button on an Ashen Gate NPC's Actor sheet. Reads the sheet it was clicked on, so one handler serves every sheet. */
let revealSheetBusy=false; // Foundry versions differ on onClick vs action; either way the dialog opens once
function revealFromSheet(){
  const doc=this?.document,def=doc?.getFlag?.(MODULE_ID,'source')?.definition;
  if(revealSheetBusy||!game.user?.isGM||!isNpcDefinition(def))return;
  revealSheetBusy=true;
  const opener=globalThis.document?.activeElement;
  openRevealDialog(def.id).catch(err=>toast(err.message,true)).finally(()=>{revealSheetBusy=false;if(opener?.isConnected)opener.focus?.();});
}
const openCodexPlayerView=(focusNpc=null)=>{codexPlayerApp??=new AshenGateCodexPlayer();codexPlayerApp.focusNpc=typeof focusNpc==='string'?focusNpc:null;return codexPlayerApp.render({force:true});};
/**
 * Reference links (0.68.0, reference-links.mjs): @AGRef[<id>]{label} is shown, per viewer, as the record's name with its
 * type icon, linking to a handout's Item twin before its journal; hidden or missing targets are plain text.
 */
let refLinksApi=null;
/** 0.69.0: the Quest Log (feature-detected) names a quest, order or contract for the person looking: the GM any, a player only a visible one. */
const questLogApi=()=>{const mod=game.modules.get('ashen-gate-quest-manager');return mod?.active?mod.api??null:null;};
function questLogName(id){
  try{
    const api=questLogApi();if(!api)return null;
    if(game.user?.isGM)return api.listQuests?.().find(q=>q.id===id)?.name??null;
    return api.getVisibleObjective?.(id)?.name??null;
  }catch{return null;}
}
async function openQuestLog(id){
  const api=questLogApi();if(!api)return;
  try{const result=await api.openObjective?.(id);if(result?.status==='opened')return;}catch{/* fall back to the Quest Log itself */}
  await api.open?.();
}
const refLinks=()=>refLinksApi??=createReferenceLinks({game,moduleId:MODULE_ID,
  getDocs:()=>[...(game.items?.contents??[]),...(game.journal?.contents??[]),...(game.actors?.contents??[]),...(game.tables?.contents??[])],
  codexNames:async()=>{if(!game.settings.get(MODULE_ID,CODEX_ACCESS_SETTING))return null;
    return new Map((await codexService().forPlayer()).map(e=>[e.id,e.name]));},
  openCodex:id=>openCodexPlayerView(id),
  questName:questLogName,openQuest:openQuestLog,
  fromUuid:uuid=>(globalThis.fromUuid??foundry.utils.fromUuid)(uuid),
  notify:text=>ui.notifications?.warn?.(text)});
/** Text fields that may hold an older import's References section, per document type. */
function legacyRefTargets(doc){
  if(doc.documentName==='Item')return [{path:'system.description.value'}];
  if(doc.documentName==='Actor')return [{path:'system.details.biography.value'}];
  if(doc.documentName==='RollTable')return [{path:'description'}];
  if(doc.documentName==='JournalEntry')return (doc.pages?.contents??[]).map(page=>({page,path:'text.content'}));
  return [];
}
/**
 * 0.68.0, active GM only, re-runnable: turns an older import's "References" section (raw ids, @UUID links) into a "Related"
 * list of reference links. Touches only the section Manager marked; a description that was unedited since import stays
 * unedited (its baseline moves with it), so a later import still cleans it up as before.
 */
const LEGACY_REFS_SETTING='legacyReferencesDone';
/** Who else is writing in bulk right now (Sync from package, or an Import in the Manager window). Legacy conversion yields to them. */
const bulkWork={sync:false};
let legacyRun=null, legacyPaused=false;
const sleepMs=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const bulkBusy=()=>bulkWork.sync||Boolean(activeApp?.busy);
/** Re-start a conversion that stepped aside for a Sync or an Import (called when one ends). */
function maybeResumeLegacy(){
  if(!legacyPaused||legacyRun||bulkBusy()||!game.user?.isGM)return;
  legacyPaused=false;
  void convertLegacyReferenceBlocks().catch(error=>console.warn(`[${MODULE_ID}] References sections not updated`,error));
}
/**
 * 0.68.0, active GM only, re-runnable: turns an older import's "References" section (raw ids, @UUID links) into a "Related"
 * list of reference links. Touches only the section Manager marked; a description that was unedited since import stayed
 * unedited (its baseline moves with it), so a later import still cleans it up as before.
 * 0.70.1: it used to await one update per document (1391 of them) on every world load, in the background and unannounced, which
 * could saturate The Forge's connection. Now: one quiet notice, chunks of 50 written with updateDocuments (render:false), a pause
 * between chunks, a stop at the next chunk when a Sync or Import starts (it resumes when that ends), and a world setting
 * (legacyReferencesDone) recording that the whole world was converted, so later loads skip the scan. Safe to interrupt at any point.
 */
async function convertLegacyReferenceBlocks({chunk=25}={}){
  if(!game.user?.isGM)throw new Error('Only a GM can update references.');
  if(legacyRun)return legacyRun;
  if(game.settings.get(MODULE_ID,LEGACY_REFS_SETTING))return {changed:0,done:true};
  legacyRun=(async()=>{
    const work=[];
    for(const doc of allBoundDocuments()){
      for(const {page,path} of legacyRefTargets(doc)){
        const target=page??doc, old=getPath(target,path);
        if(typeof old!=='string'||!old.includes('data-ag-managed-links'))continue;
        const next=convertLegacyBlock(old,relationLabel);
        if(next===old)continue;
        const updates={[path]:next};
        if(!page){const fields={...(sourceFlag(doc)?.managedFields??{})};
          if(fields[path]===old){fields[path]=next;updates[`flags.${MODULE_ID}.source.managedFields`]=fields;}}
        work.push({doc,page,target,updates});
      }
    }
    if(!work.length){await game.settings.set(MODULE_ID,LEGACY_REFS_SETTING,true);return {changed:0,done:true};}
    ui.notifications?.info?.(`Ashen Gate | Manager is updating ${work.length} older References section(s) in the background. It pauses while you run Sync or Import.`);
    const write=promise=>Promise.race([promise,sleepMs(60000).then(()=>{throw new Error('no answer from the server');})]);
    const classOf={Item,JournalEntry,Actor,RollTable,Macro};
    let changed=0, errors=0;
    for(let i=0;i<work.length;i+=chunk){
      if(bulkBusy()||!game.user?.isGM){legacyPaused=true;console.info(`[${MODULE_ID}] References update paused at ${i} of ${work.length}; it resumes when Sync or Import finishes.`);return {changed,paused:true};}
      const part=work.slice(i,i+chunk), docs=part.filter(w=>!w.page), pages=part.filter(w=>w.page);
      try {
        for(const [name,list] of new Map([...docs].map(w=>[w.doc.documentName,docs.filter(x=>x.doc.documentName===w.doc.documentName)]))) {
          try{await write(classOf[name].updateDocuments(list.map(w=>({_id:w.doc.id,...w.updates})),bulkWrite()));changed+=list.length;}
          catch(batchError){
            for(const w of list)try{await write(w.doc.update(w.updates,bulkWrite()));changed++;}
            catch(error){errors++;console.warn(`[${MODULE_ID}] References section not updated on ${w.doc.name}`,error);}
          }
        }
        for(const w of pages)try{await write(w.page.update(w.updates,bulkWrite()));changed++;}
        catch(error){errors++;console.warn(`[${MODULE_ID}] References section not updated on ${w.doc.name}`,error);}
      } catch(error){errors++;console.warn(`[${MODULE_ID}] References update stopped`,error);return {changed,errors};}
      await sleepMs(20);
    }
    emitBulkFinished('references');
    if(!errors)await game.settings.set(MODULE_ID,LEGACY_REFS_SETTING,true);
    if(changed)console.info(`[${MODULE_ID}] Updated ${changed} older References section(s) to name-based links.`);
    return {changed,errors};
  })().finally(()=>{legacyRun=null;});
  return legacyRun;
}
let appearanceController=null;
// 0.81.0: the scene controls are built before ready, so the hook is registered at load; it reads the setting lazily and does nothing until attach().
const sceneControlHider=(()=>{try{return typeof Hooks!=='undefined'&&typeof Hooks.on==='function'?installSceneControlHider({game:{get user(){return globalThis.game?.user;}},hooks:Hooks,doc:globalThis.document}):null;}catch(error){console.warn(`[${MODULE_ID}] Scene controls setting not installed`,error);return null;}})();
let definitionsReader=null;
let myAppearanceApp=null;
let activeApp;
let sceneMoodsApi=null;
let browseApi=null;
const browse=()=>browseApi??=createBrowse({game,hooks:Hooks,fromUuid:uuid=>(globalThis.fromUuid??foundry.utils.fromUuid)(uuid),
  // Items → All items → Open on an NPC Codex row: Items → NPC Codex with that NPC selected (GM-only; Browse checks the GM first).
  openCodex:id=>{activeApp??=new AshenGateManager();return activeApp.openCodexAt(id);}});
const sceneMoods=()=>sceneMoodsApi??=createSceneMoods({game});
let sceneLooksApi=null;
const sceneLooks=()=>sceneLooksApi??=createSceneLooks({game,moods:sceneMoods()});
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
    // 0.71.1: creatures filed under the old "Draft ..." folders move into Ashen Gate/Bestiary/... (Manager-imported creatures only; no folder is deleted).
    const mv=await moveManagerFolders({folders:game.folders,done:out.done,create:data=>Folder.create(data),
      moveDocs:async(docs,folderId)=>{for(let i=0;i<docs.length;i+=25){await Actor.updateDocuments(docs.slice(i,i+25).map(d=>({_id:d.id,folder:folderId})),bulkWrite());await new Promise(r=>setTimeout(r,0));}}});
    if(Object.keys(mv.done).length!==Object.keys(out.done).length) await game.settings.set(MODULE_ID,FOLDER_RENAMES_SETTING,mv.done);
    for(const m of mv.moved) console.info(`[${MODULE_ID}] Moved ${m.count} creature(s) from ${m.from} to ${m.to}`);
    for(const note of mv.notes) console.warn(`[${MODULE_ID}] ${note}`);
    if(mv.moved.length){toast(`General Manager moved ${mv.moved.reduce((a,m)=>a+m.count,0)} creature(s) into Ashen Gate/Bestiary.`);try{ui.actors?.render?.();}catch{/* redraws on the next open */}emitBulkFinished('folders');}
    for(const r of out.renamed) console.info(`[${MODULE_ID}] Renamed folder ${r.from} → ${r.to}`);
    for(const note of out.notes) console.warn(`[${MODULE_ID}] ${note}`);
    if(out.renamed.length) toast(`General Manager renamed ${out.renamed.map(r=>r.from).join(', ')} to ${out.renamed[0].to.split('/').at(-1)}.`);
    return out;
  } catch(error) {console.warn(`[${MODULE_ID}] Folder rename skipped`,error);return null;}
}
Hooks.once("init",()=>{
  registerAppearanceSettings({game,namespace:MODULE_ID,onSettingChange:(key,value,userId)=>appearanceController?.noteChange(key,value,userId)});
  game.settings.register(MODULE_ID,SNAPSHOT_SETTING,{name:"World export snapshot",scope:"world",config:false,type:Object,default:{}});
  game.settings.register(MODULE_ID,"importHistory",{name:"Import History",scope:"world",config:false,type:Array,default:[]});
  game.settings.register(MODULE_ID,LEGACY_REFS_SETTING,{name:"Older References sections converted",scope:"world",config:false,type:Boolean,default:false});
  game.settings.register(MODULE_ID,SYNC_RETIRED_SETTING,{name:"Ids retired by Sync from package",scope:"world",config:false,type:Array,default:[]});
  game.settings.register(MODULE_ID,HANDOFF_LEDGER_SETTING,{name:"Records handed to other modules",scope:"world",config:false,type:Object,default:{}});
  // Empty means "use the shipped default moods"; written only by the GM from the Scenes tab.
  game.settings.register(MODULE_ID,MOODS_SETTING,{name:"Scene mood presets",scope:"world",config:false,type:Array,default:[]});
  game.settings.register(MODULE_ID,LAYERS_SETTING,{name:"Scene layer presets",scope:"world",config:false,type:Array,default:[]});
  // 0.61.0: saved looks, the opt-in "restore default looks on activation" switch, and "No flashing" (all off/empty by default).
  game.settings.register(MODULE_ID,LOOKS_SETTING,{name:"Scene looks",scope:"world",config:false,type:Array,default:[]});
  game.settings.register(MODULE_ID,AUTO_LOOK_SETTING,{name:"Restore default looks when a scene is activated",scope:"world",config:false,type:Boolean,default:false});
  game.settings.register(MODULE_ID,CALM_SETTING,{name:"No flashing scene effects",scope:"world",config:false,type:Boolean,default:false});
  // Organize folders (0.25.0). Empty schema means "use the shipped default rules"; history holds the last runs' previous folder ids for Undo.
  game.settings.register(MODULE_ID,SCHEMA_SETTING,{name:"Organize rules",scope:"world",config:false,type:Array,default:[]});
  // Core links (0.26.0): which packs/folders count as 2024 core sources (auto-detect on by default) and the last runs for Undo.
  game.settings.register(MODULE_ID,SOURCES_SETTING,{name:"Core sources",scope:"world",config:false,type:Object,default:{auto:true,packs:[],folders:[]}});
  game.settings.register(MODULE_ID,LINK_HISTORY_SETTING,{name:"Core link history",scope:"world",config:false,type:Array,default:[]});
  game.settings.register(MODULE_ID,HISTORY_SETTING,{name:"Organize history",scope:"world",config:false,type:Array,default:[]});
  // NPC Codex (0.33.0): reveal state lives on each NPC Actor (flags.ashen-gate-manager.codex); this only gates the player view.
  // 0.45.0: the menu follows the setting, so players see NPC Codex in Game Settings only once the GM shares it.
  game.settings.register(MODULE_ID,ITEMS_READABLE_SETTING,{name:"New Items are readable by players",scope:"world",config:false,type:String,default:"gm",onChange:value=>setItemsPolicy(value)});
  setItemsPolicy("gm");
  try{setItemsPolicy(game.settings.get(MODULE_ID,ITEMS_READABLE_SETTING));}catch{/* the GM-only default stays */}
  game.settings.register(MODULE_ID,CODEX_ACCESS_SETTING,{name:"NPC Codex player access",scope:"world",config:false,type:Boolean,default:false,onChange:value=>syncCodexMenu(value)});
  // 0.45.0: one-time folder renames already run in this world ({cinderPowers:true}).
  // 0.45.0: Import tab folds and message drawer, per device (presentation only).
  // 0.59.0 Pull from GitHub. All three are CLIENT scope on purpose: a world setting is readable by every connected player,
  // and the token (and the name of a private repository) must stay in this browser.
  game.settings.register(MODULE_ID,github.GITHUB_SETTINGS.token,{name:"GitHub token (this device only)",scope:"client",config:false,type:String,default:""});
  game.settings.register(MODULE_ID,github.GITHUB_SETTINGS.config,{name:"GitHub pull settings",scope:"client",config:false,type:Object,default:{}});
  game.settings.register(MODULE_ID,backup.BACKUP_SETTINGS.token,{name:"Backup write token (this device only)",scope:"client",config:false,type:String,default:""});
  game.settings.register(MODULE_ID,backup.BACKUP_SETTINGS.config,{name:"World backup repository and branch",scope:"client",config:false,type:Object,default:{}});
  game.settings.register(MODULE_ID,backup.BACKUP_SETTINGS.types,{name:"World backup: types ticked last time",scope:"client",config:false,type:Object,default:{}});
  game.settings.register(MODULE_ID,backup.BACKUP_SETTINGS.last,{name:"World backup last run",scope:"client",config:false,type:Object,default:{}});
  game.settings.register(MODULE_ID,github.GITHUB_SETTINGS.state,{name:"GitHub last pull",scope:"client",config:false,type:Object,default:{}});
  game.settings.register(MODULE_ID,LAYOUT_SETTING,{name:"Import tab layout",scope:"client",config:false,type:Object,default:{}});
  game.settings.register(MODULE_ID,FOLDER_RENAMES_SETTING,{name:"Folder renames",scope:"world",config:false,type:Object,default:{}});
  // 0.47.0: Items → Checks → Improve icons keeps its last run here for one-step Undo ({at, applied:[{uuid, before, after}]}).
  game.settings.register(MODULE_ID,ICON_UNDO_SETTING,{name:"Icon change undo",scope:"world",config:false,type:Object,default:{}});
  // Point-to-point query: a player's client asks the active GM, who answers with that player's projection only.
  if(globalThis.CONFIG){CONFIG.queries??={};CONFIG.queries[CODEX_QUERY]=(data,options)=>codexService().handleQuery(data,options);}
  // 0.68.0: reference links are resolved on each client, for that viewer (feature-detected; without it the label shows).
  const enrichers=globalThis.CONFIG?.TextEditor?.enrichers;
  if(Array.isArray(enrichers)&&!enrichers.some(e=>e?.id==='ag-reference-link'))
    enrichers.push({id:'ag-reference-link',pattern:AGREF_PATTERN,enricher:match=>refLinks().enrich(match)});
  // 0.70.3: until a sync or import has bound its links, a description still holds [[AGREF:ID|label]]; it is drawn as the same
  // viewer-resolved name (never the id, never a broken inline roll). First in the list so Foundry's [[...]] roll enricher never sees it.
  if(Array.isArray(enrichers)&&!enrichers.some(e=>e?.id==='ag-unbound-marker'))
    enrichers.unshift({id:'ag-unbound-marker',pattern:MARKER_PATTERN,enricher:match=>refLinks().enrich(match)});
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
  // Compact pause: mirror Foundry's paused state to html[data-ag-paused]; styles/pause.css only acts when the GM setting is on.
  try{installPauseMirror({game,hooks:Hooks,doc:document});}catch(error){console.warn(`[${MODULE_ID}] Pause indicator not installed`,error);}
  // 0.84.0: copy the old Journals / Compendiums / Chat-only settings into the tab checklist once (GM only; writes only the checklist).
  // Until then the old settings are read as a fallback, so players see no change either way. Safe to run on every load.
  if(game.user?.isGM)void appearanceController.migrateSidebarTabs?.().catch?.(error=>console.warn(`[${MODULE_ID}] Sidebar tabs not migrated`,error));
  // 0.79.0, checklist since 0.84.0: optional, visual-only: hide sidebar tabs from players (never for the GM). Reapplied on setting change and sidebar renders.
  let sidebarTabs=null;
  try{sidebarTabs=installSidebarTabHider({game,hooks:Hooks,doc:document,getUi:()=>globalThis.ui,appearance:appearanceController});}catch(error){console.warn(`[${MODULE_ID}] Sidebar tabs setting not applied`,error);}
  // 0.81.0: optional, visual-only player screen settings (never for the GM): scene control groups, sidebar collapsed at load, player dock.
  try{sceneControlHider?.attach(appearanceController);}catch(error){console.warn(`[${MODULE_ID}] Scene controls setting not applied`,error);}
  try{startSidebarCollapsed({game,hooks:Hooks,getUi:()=>globalThis.ui,appearance:appearanceController}).run();}catch(error){console.warn(`[${MODULE_ID}] Sidebar collapse not applied`,error);}
  // 0.82.0: players' chat and Settings collapse again after a GM-set idle time (never for the GM); the dock arms it when it opens Settings.
  let sidebarIdle=null;
  try{sidebarIdle=installSidebarIdleCollapse({game,hooks:Hooks,doc:document,getUi:()=>globalThis.ui,appearance:appearanceController,onCollapsed:()=>sidebarTabs?.apply?.(),isDockMenuOpen:()=>Boolean(document.getElementById('agm-player-dock')?.agmIsOpen?.())});}catch(error){console.warn(`[${MODULE_ID}] Sidebar auto-collapse not installed`,error);}
  try{installPlayerDock({game,hooks:Hooks,doc:document,getUi:()=>globalThis.ui,appearance:appearanceController,tabs:sidebarTabs,idle:sidebarIdle?.idle});}catch(error){console.warn(`[${MODULE_ID}] Player dock not installed`,error);}
  // 0.79.0: optional, visual-only: players' Items tab lists only the Player Handouts folder (never for the GM).
  // The same for the Actors tab (the Players folder); list rows only, the Ashen Gate launchers in the directory are untouched.
  for(const config of Object.values(DIRECTORIES)){try{installDirectoryFilter({game,hooks:Hooks,getUi:()=>globalThis.ui,appearance:appearanceController,config});}catch(error){console.warn(`[${MODULE_ID}] Sidebar list not applied`,error);}}
  // Chat reskin: dnd5e's own description toggle still opens it; only the initial state is closed.
  if(typeof Hooks.on==='function')Hooks.on('renderChatMessageHTML',(message,html)=>{try{collapseItemDescriptions(html);}catch{/* chat renders as dnd5e made it */}});
  // 0.69.0: Related lists hide, for players, the lines they cannot open (see styles/manager.css).
  try{document.body?.classList?.toggle('agm-viewer-gm',Boolean(game.user?.isGM));}catch{/* lists show every line */}
  // 0.68.0: one delegated listener for our own reference links only (a.agm-ref-link), in the capture phase so it works
  // inside any sheet, tooltip or Monk's Enhanced Journal page. Foundry's own content links are never touched.
  globalThis.document?.addEventListener?.('click',event=>{if(event.target?.closest?.('a.agm-ref-link[data-ag-ref-open]'))void refLinks().onClick(event);},true);
  if(typeof Hooks.on==='function')for(const type of ['Item','JournalEntry','JournalEntryPage','Actor','RollTable'])
    for(const verb of ['create','update','delete'])Hooks.on(`${verb}${type}`,(doc,...rest)=>{if(rest.find(x=>x&&typeof x==='object'&&'agBulk' in x)?.agBulk)return;refLinks().invalidate();});
  if(typeof Hooks.on==='function')Hooks.on(BULK_FINISHED,()=>refLinks().invalidate()); // one invalidate after a bulk write
  try{listenBulkFinished();}catch(error){console.warn(`[${MODULE_ID}] bulk-finished listener`,error);}
  if(game.user?.isGM&&(!game.users?.activeGM||game.users.activeGM.id===game.user.id))
    void convertLegacyReferenceBlocks().catch(error=>console.warn(`[${MODULE_ID}] References sections not updated`,error));
  game.modules.get(MODULE_ID).api = {
    // GM-only, read-only: names what draws a screen effect while paused (see README, Pause glow).
    pauseGlowReport:()=>pauseGlowReport({doc:document,win:window,game}),
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
    // GM-only "Export edited records" (0.77.0): downloads AG_World_Edits_<date>.json (ag-world-edits/0.1); read-only. options: {types, includeUnchanged, includeWorldOnly}.
    exportEdits:options=>saveWorldEdits(game,options,{save:downloadJson}),
    // GM-only scene moods (0.22.0) and layers (0.35.0); every function checks the GM itself and returns {ok,message}.
    // GM-only organize folders (0.25.0); every function checks the GM itself. Only the folder field is ever written.
    // GM-only core links (0.26.0): link AG world Items with core_ref to 2024 core items; every function checks the GM itself.
    coreLinks:(({preview,apply,undoLast,history,describeSources,saveSources})=>({preview,apply,undoLast,history,describeSources,saveSources}))(coreLinks()),
    // 0.36.0 adds cleanPreview/cleanApply (Clean compendiums); existing names unchanged.
    organize:(({listSources,preview,apply,undoLast,history,getSchema,saveSchema,resetSchema,setFolderProtected,setKeepFolder,housekeeping,cleanPreview,cleanApply})=>({listSources,preview,apply,undoLast,history,getSchema,saveSchema,resetSchema,setFolderProtected,setKeepFolder,housekeeping,cleanPreview,cleanApply}))(organizer()),
    // GM-only, read-only Browse index (0.24.0); every function checks the GM itself.
    browse:(({getIndex,search,detail,refresh,loadCompendiums,status,dragData,open})=>({getIndex,search,detail,refresh,loadCompendiums,status,dragData,open}))(browse()),
    // 0.61.0 adds getCalm/setCalm/planPreset/addNewDefaults and the looks API: apply("Name") applies a look, mood or layer by name.
    scenes:(({listMoods,getState,applyMood,addLayer,removeEffect,restore,applyDraft,toggleFavourite,savePreset,removePreset,resetDefaults,exportPresets,previewImport,importPresets,getCalm,setCalm,planPreset,addNewDefaults})=>({listMoods,getState,applyMood,addLayer,removeEffect,restore,applyDraft,toggleFavourite,savePreset,removePreset,resetDefaults,exportPresets,previewImport,importPresets,getCalm,setCalm,planPreset,addNewDefaults,
      apply:(name,opts)=>sceneLooks().applyByName(name,opts),
      names:()=>sceneLooks().namesForApply(),
      listLooks:()=>sceneLooks().listLooks(),
      saveLook:look=>sceneLooks().saveLook(look),
      removeLook:id=>sceneLooks().removeLook(id),
      previewLook:(id,sceneIds)=>sceneLooks().previewLook(id,sceneIds),
      applyLook:(id,sceneIds,opts)=>sceneLooks().applyLook(id,sceneIds,opts),
      undoLastBatch:()=>sceneLooks().undoLastBatch(),
      setDefaultLook:(sceneId,lookId)=>sceneLooks().setDefaultLook(sceneId,lookId),
      setAutoLook:on=>sceneLooks().setAutoLook(on)}))(sceneMoods()),
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
    // 0.68.0 reference links, any client: what this viewer gets for a reference ({mode:'sheet'|'codex'|'quest'|'text', name, ...};
    // text mode carries no id or uuid). convertLegacy is GM only.
    references:Object.freeze({
      resolve:(id,label)=>refLinks().resolve(id,label),
      convertLegacy:()=>convertLegacyReferenceBlocks()
    }),
    codex:Object.freeze({
      list:()=>codexService().list(), get:id=>codexService().get(id), characters:()=>codexService().characters(),
      setReveal:(id,key,opts)=>codexService().setReveal(id,key,opts), setDetails:(id,patch)=>codexService().setDetails(id,patch),
      // 0.67.0, GM only: bulk reveals on top of setReveal (one write per call, all checked first), a macro-friendly revealTo,
      // one level of undo per NPC, and the Reveal to… dialog.
      setRevealMany:(id,opts)=>codexService().setRevealMany(id,opts), revealTo:(id,opts)=>codexService().revealTo(id,opts),
      undoReveal:id=>codexService().undoReveal(id), canUndoReveal:id=>codexService().canUndoReveal(id),
      openRevealTo:id=>openRevealDialog(id),
      previewAs:actorIds=>codexService().previewAs(actorIds), exportAll:()=>codexService().exportAll(),
      forPlayer:()=>codexService().forPlayer(),
      playerAccessEnabled:()=>codexService().playerAccessEnabled(),
      // 0.68.0: optional NPC id: open at that NPC (only shown if the Codex reveals it to this player).
      openPlayerView:id=>openCodexPlayerView(id),
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
// 0.67.0: GM-only "Reveal to…" in the header menu of an Ashen Gate NPC's Actor sheet (ApplicationV2 header controls).
// Feature-detected and fail-soft: any problem leaves the sheet exactly as it was.
if(typeof Hooks.on==='function') Hooks.on('getHeaderControlsApplicationV2',(app,controls)=>{
  try{
    if(!game.user?.isGM||!Array.isArray(controls)||app?.document?.documentName!=='Actor')return;
    if(!isNpcDefinition(app.document.getFlag?.(MODULE_ID,'source')?.definition))return;
    if(app.options?.actions)app.options.actions.agmRevealTo=revealFromSheet;
    controls.push({icon:'fa-solid fa-eye',label:'Reveal to…',action:'agmRevealTo',visible:true,onClick:()=>revealFromSheet.call(app)});
  }catch{/* the sheet keeps its normal header */}
});
if(typeof Hooks.on==='function') Hooks.on('renderItemDirectory',addManagerSidebarButton);
if(typeof Hooks.on==='function') Hooks.on('renderSidebarTab',(app,html)=>{
  const tab=app?.tabName??app?.id??'';
  if(String(tab)==='items')addManagerSidebarButton(app,html);
});
// 0.61.0: opt-in default look when a scene becomes active (only the active GM acts; off unless switched on in Scenes > Looks).
if(typeof Hooks.on==='function') Hooks.on('updateScene',(scene,changes)=>{
  if(changes?.active===true) void sceneLooks().onSceneActivated(scene);
});
// Keep the Scenes tab's "current mood" in step when the viewed scene changes or is updated elsewhere.
if(typeof Hooks.on==='function') for(const hook of ['canvasReady','updateScene']) Hooks.on(hook,()=>{
  if(activeApp?.rendered&&activeApp.tab==='scenes') void activeApp.render();
});
