import {bindSkinPicker} from "./skin-picker.js";
import {createAppearanceController, registerAppearanceSettings, makeFoundryAppearanceController, syncSkinStylesheet, APPEARANCE_CONTRACT, DEFAULT_SKIN_ID} from "./appearance.js";
import {auditTypedReferences, renderGmReferenceMarkers} from "./manager-resolver-bridge.mjs";
import {createManagerDefinitionReader, READER_CONTRACT} from './native-definition-reader.mjs';
import {sourceMetadata as projectionSourceMetadata} from './source-projection.mjs';
import {MODULE_ID, MANAGED_TYPES, validatePackage, planRecord, exportedFields, getPath, canonical} from "./core.js";
import {checkContractGraph, isContractImport, selectionIssues, projectedReferences, finalReferenceResolution} from "./contract.js";
import {systemOf, browseLibrary, inspectLibrary, describeLaunchers} from "./browser.js";
import {openAshenLauncher} from "./launchers.js";
import {mountManagerLauncher} from "./items-launcher.js";
import {collectPlayerAccess, changePlayerAccess, hideAllPlayerInterfaces} from "./player-access.js";
import {chooseIcon,markerTargets,buildUuidIndex,resolveRichText,resolveTypedRefs,appendReferenceBlock} from "./import-fidelity.js";
import {ensureFolder} from "./folders.js";
import {readImportZip, readImportBundle, planBundleImport, bundleSummary, adaptRecordArtwork, uploadMatchingArt} from "./zip-import.js";
import {CAPTURE_TYPES, normalizeCaptureFlag, buildCapturePackage} from "./capture.js";
import {compilePackage, dependencyOrder, normalizeRef, docManagerSnapshot, localEdits, planLifecycle, buildSourceReplacementPatch} from "./workflows.js";
import {downloadJson, downloadText} from "./download.js";
import {isLocationRecord, locationsApi, planLocation, locationsNote, applyLocations} from './location-handoff.js';
import {SPECIALISTS, detectSpecialistFile, specialistCount, specialistApi, describeUnrecognized, planSpecialist, applySpecialist} from './specialist-handoff.js';
import {classifyDelivery} from './delivery.js';
import {buildWorldExport, saveWorldExport, saveBackup, SNAPSHOT_SETTING} from './world-export.js';
import {runPreSessionCheck} from './pre-session-check.js';
import {buildImportReport, buildBlockedReport, pushReport} from './import-result.js';
import {ITEM_FLAG, ACTOR_ITEMS_FLAG, itemKeys, matchActors, planActor, applyActorUpdate} from './actor-update.js';
import {mediaFilename} from './zip-import.js';
import {createSceneMoods, MOODS_SETTING, MOOD_FIELDS, NO_WEATHER} from './scene-moods.js';
import {createOrganizer, folderIndex, ORGANIZE_TYPES, SCHEMA_SETTING, HISTORY_SETTING, FLAG_PROTECTED} from './organize.js';

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const FOLDER_NAMES = {Item: "Ashen Gate — Imported Items", JournalEntry: "Ashen Gate — Imported Journals",
  Actor: "Ashen Gate — Imported Actors", RollTable: "Ashen Gate — Imported Roll Tables", Macro: "Ashen Gate — Imported Macros"};
const actionAllowed = new Set(["create", "update", "metadata"]);
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
    get: path => getPath(doc, path)
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

async function createRecord(record, pkg, availableIds, report=()=>{}) {
  const kind = record.foundry.document_type;
  const cls = {Item,JournalEntry,Actor,RollTable,Macro}[kind];
  if (!cls) throw new Error(`Cannot create ${kind} document.`);
  const folder = await destinationFolder(kind,record.foundry.folder_path,report);
  // Only explicit allowlisted fields from validated records are copied to a Foundry Document.
  const data = foundry.utils.deepClone(record.foundry.data);
  data.folder = folder.id;
  if(['Item','Actor','RollTable','Macro'].includes(kind)) {
    const icon=await chooseIcon(record,probeAsset);
    data.img=icon.img;
    if(icon.reason!=='authored') report({id:record.id,action:'icon-fallback',status:'ok',icon:icon.img,reason:icon.reason,original:icon.original??null});
  }
  data.ownership = {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE};
  // Keep authored Actor flags, but reserve Manager's own namespace for immutable source bindings.
  data.flags = {...(kind==='Actor'?data.flags??{}:{}),[MODULE_ID]:{source:sourceMetadata(record, pkg, availableIds)}};
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
    return {plan:planActor(record,docs.map(d=>d.toObject()),{updateExisting:updateActors,includeDrafts,sameNameUnmanaged:findSameNameUnmanaged(record),isBundled}),docs};
  }
  const matches=foundDocuments(record.id).map(docWrapper);
  if(matches.some(m=>m.doc.getFlag(MODULE_ID,'lifecycle')?.archived)) return {plan:{action:'blocked',reason:'Existing record is archived; restore it before reimport.'},docs:matches.map(m=>m.doc)};
  return {plan:planWithMetadata(record,matches,findSameNameUnmanaged(record),includeDrafts,pkg),docs:matches.map(m=>m.doc)};
}

class AshenGateManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "ashen-gate-manager-window",
    classes: ["ag-app","ashen-gate-manager"],
    window: {title:"Ashen Gate | General Manager v0.24.0 Beta", icon:"fa-solid fa-boxes-stacked", resizable:true},
    position: {width:1020, height:820}
  };
  static PARTS = {main: {template: `modules/${MODULE_ID}/templates/manager.hbs`}};

  constructor(options={}) {
    super(options);
    this.pkg = null;
    this.rawPkg = null;
    this.preview = [];
    this.errors = [];
    this.warnings = [];
    this.includeDrafts = false;
    this.updateExisting = false;
    this.updateActors = false;
    this.specialist = null;
    this.adoptOpen = false;
    this.selected = new Set();
    this.tab = "import";
    this.playerAccessMessage = "Only supported, active player-facing modules can be revealed or hidden. Manager never stores their access state.";
    this.playerAccessReport = null;
    this.appearanceSelection = null;
    this.appearanceMessage = 'Choose the default appearance for all Ashen Gate modules that support the optional appearance API.';
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
    this.librarySearch = "";
    this.librarySystem = "all";
    this.libraryStatus = "all";
    this.libraryPackage = "all";
    this.libraryFocus = null;
    this.libraryPage = 0;
    this.libraryPageSize = 100;
    this.libraryShowArchived = true;
    this.libraryMessage = "Browse Manager-imported Items, Journals, Actors, Roll Tables and Macros by permanent ID.";
    this.profile = "session-safe";
    this.moodSceneId = "";
    this.moodEdit = null;
    this.moodAnimate = false;
    this.moodMessage = "Pick a mood for the scene. Only the fields a mood lists change; Back to normal restores the scene exactly.";
    this.orgSource = "world";
    this.orgTypes = new Set(ORGANIZE_TYPES);
    this.orgMode = "misfiled";
    this.orgPreview = null;
    this.orgResult = null;
    this.orgSchemaText = null;
    this.orgReport = null;
    this.orgMessage = "Preview shows exactly what would move. Organize only changes which folder a document is in.";
    this.applyProfile();
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
    const presets=(list.presets??[]).map(p=>({...p,active:state.mood?.id===p.id,
      summary:Object.entries(p.set).map(([path,v])=>`${MOOD_FIELDS.find(f=>f.path===path)?.label??path}: ${path==='weather'?(v||'none'):v}`).join(' · ')}));
    const edit=this.moodEdit;
    const fields=edit?MOOD_FIELDS.map(f=>{
      const used=Object.hasOwn(edit.set,f.path), value=edit.set[f.path];
      return {...f,used,value:used?value:(f.kind==='boolean'?false:f.kind==='weather'?NO_WEATHER:0),isNumber:f.kind==='number',isBoolean:f.kind==='boolean',isWeather:f.kind==='weather',
        checked:used&&value===true,
        weatherOptions:[{id:NO_WEATHER,label:'No weather',selected:used&&!value},...weatherIds.map(id=>({id,label:id,selected:used&&value===id})),
          ...(used&&value&&!weatherIds.includes(value)?[{id:value,label:`${value} (not available here)`,selected:true}]:[])]};
    }):[];
    const scenes=(game.scenes?.contents??[]).map(s=>({id:s.id,name:s.name,selected:s.id===this.moodSceneId}));
    return {sceneName:state.scene?.name??'No scene viewed or active',hasScene:Boolean(state.scene),moodLabel:state.mood?.label??'Normal (no mood applied)',
      hasBase:state.hasBase,darknessLock:state.scene?.darknessLock,presets,scenes,currentSelected:!this.moodSceneId,animate:this.moodAnimate,
      message:this.moodMessage,edit:edit?{...edit,fields}:null,hasWeather:weatherIds.length>0};
  }
  async #moodResult(promise,okMessage) {
    const out=await promise;
    this.moodMessage=out.ok?(okMessage??out.message):out.message;
    if(out.ok)toast(this.moodMessage);else{toast(out.message,true);console.warn(`[${MODULE_ID}] Scene mood: ${out.message}`);}
    await this.render();
    return out;
  }
  async #applyMood(id) {
    await this.#moodResult(sceneMoods().applyMood(id,{sceneId:this.moodSceneId||undefined,animate:this.moodAnimate?3000:0}));
  }
  async #editMood(id) {
    const preset=sceneMoods().listMoods().presets?.find(p=>p.id===id);
    if(!preset)return toast(`Mood ${id} not found.`,true);
    this.moodEdit={isNew:false,id:preset.id,label:preset.label,set:{...preset.set}};
    await this.render();
  }
  async #saveMood() {
    const root=this.element, edit=this.moodEdit;
    if(!edit)return;
    const id=edit.isNew?String(root.querySelector('[data-ag-mood-id]')?.value??'').trim().toLowerCase():edit.id;
    const label=String(root.querySelector('[data-ag-mood-label]')?.value??'').trim();
    const set={};
    for(const f of MOOD_FIELDS){
      if(!root.querySelector(`[data-ag-mood-use="${f.path}"]`)?.checked)continue;
      const input=root.querySelector(`[data-ag-mood-value="${f.path}"]`);
      set[f.path]=f.kind==='number'?Number(input?.value):f.kind==='boolean'?Boolean(input?.checked):String(input?.value??'');
    }
    if(edit.isNew&&sceneMoods().listMoods().presets?.some(p=>p.id===id))return toast(`A mood with id ${id} already exists.`,true);
    this.moodEdit={...edit,id,label,set};
    const out=await this.#moodResult(sceneMoods().savePreset({id,label,set}),`Mood "${label}" saved.`);
    if(out.ok){this.moodEdit=null;await this.render();}
  }
  async #removeMood(id) {
    const preset=sceneMoods().listMoods().presets?.find(p=>p.id===id);
    if(!preset)return;
    const yes=await DialogV2.confirm({window:{title:'Remove scene mood'},modal:true,rejectClose:false,
      content:`<p><strong>Remove the mood "${escapeHtml(preset.label)}"?</strong> Scenes already using it keep their look; Back to normal still restores them.</p>`,
      yes:{label:'Remove mood'},no:{label:'Cancel'}});
    if(!yes)return;
    if(this.moodEdit?.id===id)this.moodEdit=null;
    await this.#moodResult(sceneMoods().removePreset(id),`Mood "${preset.label}" removed.`);
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
    const summary = {create:0, update:0, metadata:0, unchanged:0, blocked:0, conflict:0, skipped:0, local:0};
    this.preview.forEach(row => {summary[row.action] = (summary[row.action] ?? 0) + 1;});
    const history = game.settings.get(MODULE_ID,"importHistory") ?? [];
    const allItems = allCaptureRows();
    const library=this.managedRows();
    const browser=browseLibrary(library,{search:this.librarySearch,system:this.librarySystem,
      status:this.libraryStatus,package:this.libraryPackage,showArchived:this.libraryShowArchived});
    const pageCount=Math.max(1,Math.ceil(browser.rows.length/this.libraryPageSize));
    this.libraryPage=Math.max(0,Math.min(this.libraryPage,pageCount-1));
    const libraryRows=browser.rows.slice(this.libraryPage*this.libraryPageSize,(this.libraryPage+1)*this.libraryPageSize);
    const libraryDetail=inspectLibrary(library,this.libraryFocus);
    const menus=game.settings?.menus ? [...game.settings.menus.entries()] : [];
    const playerAccessRows=game.user?.isGM ? await collectPlayerAccess(game.modules?.values?.()??[]) : [];
    const launcherRows=describeLaunchers(game.modules?.values?.()??[],menus).map(row=>({...row,playerAccessState:playerAccessRows.find(entry=>entry.id===row.id)?.state??'Unsupported'}));
    const accessVisibleCount=playerAccessRows.filter(row=>row.canToggle&&row.playerAccessEnabled).length;
    const captureRows = allItems.filter(row => (!this.captureTaggedOnly || row.capture) && (!this.captureSearch || row.name.toLowerCase().includes(this.captureSearch.toLowerCase()) || row.type.toLowerCase().includes(this.captureSearch.toLowerCase())));
    return {
      ...ctx,
      importActive: this.tab === "import",
      importReports: this.importReports, hasImportReports: this.importReports.length>0,
      zipBundle: this.zipBundle ? {source:this.zipBundle.source, running:Boolean(this.zipBundle.queue), summary:bundleSummary(this.zipBundle),
        rows:this.zipBundle.files.map(f=>({filename:f.filename, label:f.label, count:f.count, notice:f.notice,
          status:this.zipBundle.outcome.get(f.filename) ?? (f.status==='error'?'Error':f.status==='warning'?'Ready, with notes':'Ready'),
          isError:f.status==='error', isCurrent:this.zipBundle.current===f.filename,
          picked:this.zipBundle.picked.has(f.filename), canPick:Boolean(f.kind)&&f.status!=='error'&&!this.zipBundle.queue})),
        skipped:this.zipBundle.skipped, pickedCount:this.zipBundle.files.filter(f=>f.kind&&f.status!=='error'&&this.zipBundle.picked.has(f.filename)).length} : null,
      libraryActive: this.tab === "library",
      modulesActive: this.tab === "modules",
      appearanceActive: this.tab === "appearance",
      appearanceMessage:this.appearanceMessage,
      appearanceCurrent: appearanceController?.getState?.()??null,
      appearanceSkinRows:(appearanceController?.listSkins?.()??[]).map(skin=>({...skin,selected:skin.id===(this.appearanceSelection??appearanceController.getState().worldDefault)})),
      playerAccessRows, playerAccessMessage:this.playerAccessMessage, playerAccessReport:this.playerAccessReport,
      playerAccessVisibleCount:accessVisibleCount,
      playerAccessHasVisible:accessVisibleCount>0&&!this.busy,
      launcherRows, launcherCount:launcherRows.length,
      libraryRows, libraryTotal:library.length, librarySelectedCount:this.librarySelected.size,
      libraryFilteredCount:browser.rows.length, libraryActiveCount:browser.summary.active,
      libraryEditedCount:browser.summary.edited, librarySystemCount:browser.summary.systems,
      librarySearch:this.librarySearch, libraryShowArchived:this.libraryShowArchived,
      librarySystemOptions:[{value:'all',label:'All systems',selected:this.librarySystem==='all'},...browser.systemOptions],
      libraryStatusOptions:[{value:'all',label:'All statuses',selected:this.libraryStatus==='all'},...browser.statusOptions.map(r=>({...r,label:r.value}))],
      libraryPackageOptions:[{value:'all',label:'All packages',selected:this.libraryPackage==='all'},...browser.packageOptions.map(r=>({...r,label:r.value}))],
      libraryPageLabel:`${browser.rows.length ? this.libraryPage*this.libraryPageSize+1 : 0}–${Math.min((this.libraryPage+1)*this.libraryPageSize,browser.rows.length)} of ${browser.rows.length}`,
      libraryHasPrevious:this.libraryPage>0,libraryHasNext:this.libraryPage+1<pageCount,
      libraryDetail,libraryHasDetail:Boolean(libraryDetail),
      libraryMessage:this.libraryMessage, worldExportSummary:this.worldExportSummary??'',
      preSession:this.preSessionResult?{summary:this.preSessionResult.summary,rows:this.preSessionResult.rows.map(r=>({...r,css:r.status==='N-A'?'na':r.status.toLowerCase()})),hasText:Boolean(this.preSessionResult.text)}:null,
      profile:this.profile,developmentProfile:this.profile==='development',sessionProfile:this.profile==='session-safe',
      hasLibrarySelected:this.librarySelected.size>0,
      adoptOpen: this.adoptOpen,
      captureRows: captureRows.map(row => ({...row, tagged:Boolean(row.capture), selected:this.captureSelected.has(row.id), kindLabel:row.capture?.entityType??"—"})),
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
      organizeActive: this.tab === "organize",
      org: this.tab === "organize" ? this.#organizeContext() : null,
      hasPackage: Boolean(this.pkg || this.specialist),
      isSpecialist: Boolean(this.specialist),
      specialistLabel: this.specialist ? SPECIALISTS[this.specialist.kind].label : '',
      specialistNoun: this.specialist ? SPECIALISTS[this.specialist.kind].kind.toLowerCase() + 's' : '',
      specialistCanUpdate: Boolean(this.specialist && SPECIALISTS[this.specialist.kind].canUpdate),
      packageId: this.specialist ? `${SPECIALISTS[this.specialist.kind].label} file` : (this.pkg?.manifest?.package_id ?? "—"),
      packageVersion: this.specialist ? (this.specialist.payload?.version ?? "—") : (this.pkg?.manifest?.version ?? "—"),
      recordCount: this.specialist ? this.specialist.count : (this.pkg?.records?.length ?? 0),
      typeSummary: this.specialist ? [{name:SPECIALISTS[this.specialist.kind].kind,count:this.specialist.count}] : Object.entries(this.pkg?.records?.reduce((a,r)=>(a[r.foundry?.document_type??'Unsupported']=(a[r.foundry?.document_type??'Unsupported']??0)+1,a),{})??{}).map(([name,count])=>({name,count})),
      zipPortraitCount:this.zipMedia.size, hasZipPortraits:this.zipMedia.size>0,
      uploadZipArtwork:this.uploadZipArtwork, packageSource:this.packageSource??'—',
      includeDrafts: this.includeDrafts,
      hasLocationRecords: Boolean(this.pkg?.records?.some(isLocationRecord)),
      updateExisting: this.updateExisting,
      hasActorRecords: Boolean(this.pkg?.records?.some(r=>r.foundry?.document_type==='Actor')),
      updateActors: this.updateActors,
      actorUpdateCount: this.preview.filter(r=>r.kind==='Actor'&&r.action==='update').length,
      message: this.message,
      errors: this.errors.map(message => ({message})),
      warnings: this.warnings.map(message => ({message})),
      hasWarnings: this.warnings.length > 0,
      schemaVersion: this.specialist ? (this.specialist.payload?.schema_version ?? this.specialist.payload?.schema ?? "list") : (this.pkg?.manifest?.schema_version ?? "—"),
      hasErrors: this.errors.length > 0,
      hasPreview: this.preview.length > 0 && !this.errors.length,
      canApply: !this.busy && this.errors.length === 0 && this.preview.some(row => actionAllowed.has(row.action) && this.selected.has(row.id)),
      busy: this.busy,
      summary,
      rows: this.preview.map(row => ({...row, selected:this.selected.has(row.id), canSelect: actionAllowed.has(row.action), badge:row.action.toUpperCase()})),
      audit: this.auditEntries,
      hasAudit: this.auditEntries.length > 0,
      history: [...history].reverse(),
      hasHistory: history.length > 0
    };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    bindSkinPicker(root.querySelector('[data-ag-skin-picker="world"]'),value=>{this.appearanceSelection=value;});
    root.querySelectorAll("[data-ag-action]").forEach(el => el.addEventListener("click", event => {
      event.preventDefault();
      this.#action(el.dataset.agAction).catch(err => this.#fail(err));
    }));
    root.querySelectorAll("[data-ag-tab]").forEach(el => el.addEventListener("click", async event => {
      event.preventDefault();
      this.tab = el.dataset.agTab;
      void this.render();
    }));
    root.querySelector("[data-ag-file]")?.addEventListener("change", async event => {
      const f = event.target.files?.[0];
      event.target.value = '';
      if (!f) return;
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
            this.zipBundle={source:f.name,...bundle,picked:new Set(importable.filter(x=>x.status!=='error').map(x=>x.filename)),queue:null,current:null,outcome:new Map()};
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
    });
    root.querySelector('[data-ag-upload-assets]')?.addEventListener('change',async e=>{
      this.uploadZipArtwork=Boolean(e.target.checked);
      await this.render();
    });
    root.querySelector("[data-ag-profile]")?.addEventListener("change", async event => {
      this.profile=event.target.value;this.applyProfile();await this.#preview();
    });
    root.querySelector("[data-ag-library-filter]")?.addEventListener("change", event=>{
      this.librarySearch=event.target.value.trim();this.libraryPage=0;void this.render();
    });
    for(const [field,attribute] of [['system','librarySystem'],['status','libraryStatus'],['package','libraryPackage']]) {
      root.querySelector(`[data-ag-library-${field}]`)?.addEventListener('change',event=>{
        this[attribute]=event.target.value;this.libraryPage=0;void this.render();
      });
    }
    root.querySelectorAll('[data-ag-library-inspect]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();this.libraryFocus=el.dataset.agLibraryInspect;void this.render();
    }));
    root.querySelectorAll('[data-ag-library-jump]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();this.libraryFocus=el.dataset.agLibraryJump;
      this.librarySearch='';this.librarySystem='all';this.libraryStatus='all';this.libraryPackage='all';
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
    root.querySelectorAll('[data-ag-mood-apply],[data-ag-mood-edit],[data-ag-mood-remove]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault();
      const d=el.dataset;
      const run=d.agMoodApply?this.#applyMood(d.agMoodApply):d.agMoodEdit?this.#editMood(d.agMoodEdit):this.#removeMood(d.agMoodRemove);
      run.catch(err=>this.#fail(err));
    }));
    root.querySelector('[data-ag-mood-scene]')?.addEventListener('change',event=>{this.moodSceneId=event.target.value;void this.render();});
    root.querySelector('[data-ag-mood-animate]')?.addEventListener('change',event=>{this.moodAnimate=event.target.checked;});
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
    root.querySelector("[data-ag-drafts]")?.addEventListener("change", async event => {
      this.includeDrafts = event.target.checked;
      await this.#preview();
    });
    root.querySelector("[data-ag-adopt]")?.addEventListener("toggle", event => {this.adoptOpen = event.target.open;});
    root.querySelector("[data-ag-update-existing]")?.addEventListener("change", async event => {
      this.updateExisting = event.target.checked;
      await this.#preview();
    });
    root.querySelector("[data-ag-update-actors]")?.addEventListener("change", async event => {
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
      if(!this.zipBundle||this.zipBundle.queue) return;
      if(event.target.checked) this.zipBundle.picked.add(name); else this.zipBundle.picked.delete(name);
      void this.render();
    }));
    root.querySelectorAll("[data-ag-select]").forEach(el => el.addEventListener("change", event => {
      const id = event.target.dataset.agSelect;
      if (event.target.checked) this.selected.add(id);
      else this.selected.delete(id);
      // Re-render to accurately enable the Apply button.
      void this.render();
    }));
    this.#bindOrganize(root);
  }

  async #action(name) {
    if(!game.user?.isGM) throw new Error('Only GMs can operate the General Manager.');
    if (this.busy) return;
    switch(name) {
      case "demo": {
        const response = await fetch(`modules/${MODULE_ID}/samples/demo-package.json`, {cache:"no-store"});
        if (!response.ok) throw new Error(`Demo request failed (${response.status}).`);
        this.zipBundle=null;this.zipMedia=new Map();this.packageSource="Included demonstration";
        await this.#load(await response.json(), "Included demonstration");
        break;
      }
      case "help": {
        await DialogV2.confirm({window:{title:'Ashen Gate | General Manager Help'},
          content:'<p><strong>Clean import:</strong> Choose Manager JSON or a ZIP; select Development for draft content, Validate & Preview, Select eligible, then Import.</p><p><strong>Supported documents:</strong> Item, JournalEntry, Actor, RollTable and Macro; no Scenes or Playlists. </p><p><strong>ZIP bundles:</strong> a ZIP holding several import files (Manager packages plus Quest, Skill Tree, Headquarters or Factions files) shows a ZIP contents list. Untick any you do not want, press Import selected files, then preview and Apply each file in turn (Manager packages first). Each file gets its own result; Skip this file or Stop ZIP import at any time. ZIP scripts never run. Bundled images are uploaded only if that option is enabled.</p><p><strong>Folders:</strong> foundry.folder_path creates nested folders per document type. <strong>Links:</strong> canonical refs bind after creation. Markers [[AGREF:MAT-EXAMPLE|Material]] are provisional pending Tim.</p><p>Back up a test world. Existing Tables and Macros are never replaced. Existing Actors change only if you tick <strong>Update existing actors</strong>: then their name, image, token settings and package items follow the file, and HP, XP, level, conditions, player items, notes, ownership, folders and other modules\' data are kept.</p>',
          modal:true,rejectClose:false});
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
      case "zip-cancel":
        if(this.zipBundle){
          for(const item of [...(this.zipBundle.queue??[]),...(this.zipBundle.current?[{filename:this.zipBundle.current}]:[])]) this.zipBundle.outcome.set(item.filename,'Not imported');
          this.zipBundle.queue=null;this.zipBundle.current=null;
          this.#clearLoaded(`${this.zipBundle.source}: the rest of the ZIP was not imported. Files already applied keep their results below.`);
          await this.render();
        }
        break;
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
      case "mood-restore": await this.#moodResult(sceneMoods().restore({sceneId:this.moodSceneId||undefined,animate:this.moodAnimate?3000:0})); break;
      case "mood-new": this.moodEdit={isNew:true,id:'',label:'',set:{'environment.darknessLevel':0,weather:NO_WEATHER}}; await this.render(); break;
      case "mood-cancel": this.moodEdit=null; await this.render(); break;
      case "mood-save": await this.#saveMood(); break;
      case "mood-reset": {
        const yes=await DialogV2.confirm({window:{title:'Reset scene moods to defaults'},modal:true,rejectClose:false,
          content:'<p><strong>Replace every mood preset with the shipped defaults?</strong> Your own presets and edits are deleted. Scenes are not changed.</p>',
          yes:{label:'Reset moods to defaults'},no:{label:'Cancel'}});
        if(yes){this.moodEdit=null;await this.#moodResult(sceneMoods().resetDefaults(),'Mood presets reset to the defaults.');}
        break;
      }
      case "org-preview": case "org-apply": case "org-backup": case "org-undo": case "org-clear": case "org-housekeeping":
      case "org-schema-edit": case "org-schema-save": case "org-schema-cancel": case "org-schema-export": case "org-schema-reset": await this.#organizeAction(name); break;
      case "library-check": this.#runAudit(); this.libraryMessage="Library check finished: results are listed above."; await this.render(); break;
      case "appearance-save-world": {
        const choice=this.appearanceSelection??appearanceController?.getState()?.worldDefault;
        await appearanceController.setWorldDefault(choice);
        this.appearanceMessage=`World default saved: ${appearanceController.listSkins().find(s=>s.id===choice)?.label??choice}. Players with no personal override see it right away; anyone who has not reloaded since a module update needs one refresh (F5).`;
        await this.render();break;
      }
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
      this.playerAccessMessage=`${result.title}: Player interface ${result.playerAccessEnabled?'Visible':'Hidden'}${result.changed?' (saved by the specialist module)':' (already set)'}.`;
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
    const confirmed=await DialogV2.confirm({window:{title:'Hide All Player Interfaces — confirm'},modal:true,rejectClose:false,
      content:`<p>Hide <strong>${targets.length}</strong> currently visible player interface(s)?</p><p>Each specialist module saves its own access setting. <strong>No character or campaign progress will be deleted.</strong></p><p>${escapeHtml(names)}</p><p>This is not an atomic operation; any failures will be reported.</p>`});
    if(!confirmed)return;
    this.busy=true;
    try{
      const result=await hideAllPlayerInterfaces(modules,{isGM:game.user.isGM});
      this.playerAccessReport=result;
      const failures=result.failed.map(r=>`${r.title}: ${r.error}`).join(' | ');
      this.playerAccessMessage=`Hide All: ${result.changed.length} hidden, ${result.alreadyHidden.length} already hidden, ${result.skipped.length} skipped, ${result.failed.length} failed.${failures?' Failures: '+failures:''}`;
      toast(this.playerAccessMessage,Boolean(result.failed.length));
    }finally{this.busy=false;await this.render();}
  }
  /** Forgets any loaded file (and its banner) so a failed or new load never shows the previous file as loaded. */
  #clearLoaded(message) {
    this.pkg=null; this.rawPkg=null; this.specialist=null; this.zipMedia=new Map(); this.packageSource=null;
    this.preview=[]; this.errors=[]; this.warnings=[]; this.selected.clear();
    this.message=message;
  }
  /** Starts a multi-file ZIP: the ticked files, Manager package(s) first, each through the normal preview and Apply. */
  async #zipStart() {
    const bundle=this.zipBundle;
    if(!bundle||bundle.queue) return;
    const plan=planBundleImport(bundle,bundle.picked,{isGM:Boolean(game.user?.isGM)});
    if(!plan.length){this.message='No files are ticked in the ZIP contents list, so nothing was imported.';await this.render();return;}
    bundle.queue=plan;bundle.total=plan.length;
    for(const f of bundle.files) if(!plan.some(p=>p.filename===f.filename)) bundle.outcome.set(f.filename,f.status==='error'?'Not imported (error)':'Not ticked');
    await this.#zipNext();
  }
  /** Loads the next queued ZIP file. A file that cannot load or validate gets its own result entry; the rest continue. */
  async #zipNext() {
    const bundle=this.zipBundle;
    if(!bundle?.queue) return;
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
    this.warnings=[]; this.preview=[]; this.selected.clear();
    try {
      const plan=planSpecialist(kind,payload,specialistApi(game,kind),{updateExisting:this.updateExisting});
      this.errors=plan.errors; this.preview=plan.errors.length?[]:plan.rows;
    } catch(error) { this.errors=[String(error?.message??error)]; }
    const label=SPECIALISTS[kind].label;
    this.message=this.errors.length ? `Validation failed: ${this.errors.length} issue(s). No changes made.`
      : `Validated ${this.specialist.count} ${label} record(s). ${label} stores them; nothing changes before Apply.`;
    await this.render();
  }
  async #applySpecialist() {
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
    const yes=await DialogV2.confirm({window:{title:`Import into ${spec.label}`},modal:true,rejectClose:false,
      content:`<p><strong>${rows.length}</strong> ${escapeHtml(spec.kind.toLowerCase())} record(s) will be passed to <strong>${escapeHtml(spec.label)}</strong>, which stores and owns them.</p><p>${spec.canUpdate&&this.updateExisting?'Records already in the world are replaced; their progress and state are kept.':'Records already in the world are kept as they are.'} Back up your world first.</p>`});
    if(!yes)return;
    this.applyRan=true;
    this.busy=true;
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
    const externalIds = existingSourceIndex();
    this.errors = validatePackage(this.pkg, externalIds);
    this.warnings = [];
    if (this.pkg.manifest.schema_version === 'ag-foundry-import/0.1') {
      this.warnings.push('Legacy import package: accepted for compatibility; future exports should use Archie typed references and v0.2 metadata.');
    } else if (isContractImport(this.pkg) && !this.errors.length) {
      this.warnings.push(...checkContractGraph(this.pkg.records,externalIds).warnings);
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
    const fallbackIcons=records.filter(r=>['Item','Actor','RollTable','Macro'].includes(r.foundry?.document_type) && !r.foundry?.data?.img).length;
    this.warnings.push(`${withPaths} folder destination(s), ${fallbackIcons} missing authored image(s); folders and icon fallbacks are applied only after confirmation.`);
    if(this.zipMedia.size) this.warnings.push(`${this.zipMedia.size} artwork file(s) in source ZIP. Matching assets can be uploaded to this world's data folder during Apply; no ZIP scripts execute.`);
    const locApi=locationsApi(game);
    const note=locationsNote(records,locApi);
    if(note) this.warnings.push(note);
    const locationIds=locApi ? new Set(locApi.listLocations().map(l=>l.id)) : null;
    for (const id of graph.order) {
      const record=records.find(r=>r.id===id);
      if (isLocationRecord(record)) {
        const {action,reason}=planLocation(record,{existingIds:locationIds,includeDrafts:this.includeDrafts,updateExisting:this.updateExisting});
        this.preview.push({id:record.id, name:record.location?.name ?? record.name ?? record.id, kind:'Location', lifecycle:record.status, action, reason, patch:{}});
        continue;
      }
      const {action,reason,patch={},changes=[]}=planDocument(record,this.pkg,this).plan;
      this.preview.push({id:record.id, name:record.foundry?.data?.name ?? record.name ?? record.id, kind:record.foundry?.document_type ?? record.entity_type+" (unmapped)", lifecycle:record.status, action, reason, patch, changes});
    }
    this.message = `Validated ${records.length} records. ${this.dependencyNotes} Nothing changes before Apply.`;
    await this.render();
  }
  #exportPreview() {
    const report = {generated_at:new Date().toISOString(), manifest:this.pkg?.manifest ?? (this.specialist?{specialist:SPECIALISTS[this.specialist.kind].label}:null), errors:this.errors, warnings:this.warnings, preview:this.preview.map(({id, name, kind, lifecycle, action, reason, patch, changes})=>({id,name,kind,lifecycle,action,reason,patch,changes}))};
    downloadJson("ag-import-preview.json",report);
  }
  async #tagSelected() {
    if (!game.user.isGM) throw new Error("GM access required.");
    if (!CAPTURE_TYPES.includes(this.captureKind)) throw new Error("Choose a valid classification.");
    const docs=[...this.captureSelected].map(id=>game.items.get(id)).filter(Boolean);
    if (!docs.length) return toast("Select at least one world Item to tag.");
    const yes=await DialogV2.confirm({
      window:{title:"Tag existing Items for review"},
      content:`<p>Tag <strong>${docs.length}</strong> world Items as <strong>${this.captureKind}</strong> candidates?</p><p>This adds only a private module flag. It does not change the Item rules, make it canonical, or link it to a GitHub record. Re-tagging updates the classification but retains the capture ID.</p>`,
      rejectClose:false,modal:true
    });
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
    const yes=await DialogV2.confirm({window:{title:"Remove recovery tags"},
      content:`<p>Remove the review tags from <strong>${docs.length}</strong> world Items?</p><p>Item contents and imported source bindings will remain unchanged. Removing a tag discards its local capture ID; later re-tagging creates a new capture ID.</p>`,
      rejectClose:false,modal:true});
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
    const yes=await DialogV2.confirm({window:{title:"Export tagged Items for review"},
      content:`<p>Download a JSON review package containing <strong>${tagged.length}</strong> tagged world Items?</p><p>The export contains rules text, descriptions, system data, effects, images and other modules' Item flags. <strong>Review for GM secrets and third-party material before sharing.</strong> This does not publish to GitHub and does not authorize any Item as approved.</p>`,
      rejectClose:false,modal:true});
    if(!yes)return;
    const pack=buildCapturePackage(tagged.map(doc=>({
      id:doc.id,uuid:doc.uuid,capture:captureOf(doc),source:sourceFlag(doc),raw:doc.toObject()
    })),{worldId:game.world?.id??null});
    const stamp=new Date().toISOString().slice(0,10);
    downloadJson(`ashen-gate-tagged-items-${stamp}.json`,pack);
    this.captureMessage=`Exported ${pack.records.length} tagged world Items for review. No world content changed.`;
    await this.render();toast(this.captureMessage);
  }
  async #apply() {
    if (!game.user.isGM) throw new Error("Only a GM may import content.");
    if (this.specialist) return this.#applySpecialist();
    if (!this.pkg || this.errors.length) throw new Error("Load a validated package first.");
    const targetRows = this.preview.filter(row => actionAllowed.has(row.action) && this.selected.has(row.id));
    const blocked=(message,fix)=>{this.importReports=pushReport(this.importReports,buildBlockedReport({file:this.packageSource??this.pkg.manifest.package_id,message,fix}));};
    if (!targetRows.length) {blocked('No records were selected, so nothing was imported.','Press Select eligible (or tick records) in the preview, then Apply.');this.message='Nothing selected: nothing was imported. See the result below.';await this.render();return;}
    const missing=selectionIssues(this.pkg.records,targetRows.map(r=>r.id),existingSourceIndex().keys());
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
    const cycleNotice=pendingGraph.cycles.length ? `<p><strong>${pendingGraph.cycles.length} circular reference path(s).</strong> These are permitted because the Manager stores stable Ashen Gate IDs. If any required target fails creation, its references are not finalized and the error is logged.</p>` : '';
    const locRows=targetRows.filter(r=>r.kind==='Location');
    const docRows=targetRows.filter(r=>r.kind!=='Location');
    const actorUpdates=docRows.filter(r=>r.kind==='Actor'&&r.action==='update');
    const wantsScriptMacros=targetRows.some(r=>this.pkg.records.find(rec=>rec.id===r.id)?.foundry?.document_type==='Macro' && this.pkg.records.find(rec=>rec.id===r.id)?.foundry?.data?.type==='script');
    const decision = await DialogV2.confirm({
      window:{title:"Confirm Foundry world changes"},
      content:`<p><strong>${docRows.length} document(s)</strong>${locRows.length?` and <strong>${locRows.length} location(s)</strong> (passed to Locations, after the documents)`:''} will be created/updated in this world.</p>${cycleNotice}<p>Back up your test world. This import is non-transactional: partial writes may remain if anything fails.</p><p><strong>Actors:</strong> ${actorUpdates.length?`${actorUpdates.length} existing Actor(s) will have their definition updated (you confirm this separately next).`:'only new NPC/character definitions; existing Actors are not changed.'} HP, XP, level, conditions and player items are never replaced. ${wantsScriptMacros?'<strong>Warning: this import installs untrusted Script Macro source as GM-only, but never executes it.</strong>':''}</p><p>${this.uploadZipArtwork&&this.zipMedia.size?`${this.zipMedia.size} bundled assets may be uploaded to the current world before importing documents.`:'ZIP artwork will not be uploaded. If actor images reference missing world paths, upload them manually.'}</p>`,
      rejectClose:false,
      modal:true
    });
    if (!decision) return;
    if (actorUpdates.length) {
      const list=actorUpdates.map(r=>`<li><strong>${escapeHtml(r.name)}</strong> <code>${escapeHtml(r.id)}</code><ul>${r.changes.map(c=>`<li>${escapeHtml(c)}</li>`).join('')}</ul></li>`).join('');
      const sure=await DialogV2.confirm({
        window:{title:'Update existing Actors'},
        content:`<p><strong>This changes ${actorUpdates.length} Actor(s) already in your world.</strong> Only the listed definition fields and package items change. HP, XP, level, conditions, player-added items, notes, ownership, folders and other modules' data are kept.</p><ul>${list}</ul><p>A JSON backup of these Actors downloads automatically before anything is written.</p>`,
        yes:{label:`Update ${actorUpdates.length} existing Actor(s)`,icon:'fa-solid fa-triangle-exclamation'},
        no:{label:'Cancel'},
        rejectClose:false,modal:true
      });
      if (!sure) return;
    }
    this.applyRan=true;
    this.busy=true;
    const log = {at:new Date().toISOString(), packageId:this.pkg.manifest.package_id, packageVersion:this.pkg.manifest.version, results:[]};
    let originalMediaPaths=new Map();
    try {
      // Revalidate just before writing. Re-check every target against current Foundry state.
      const externalIds = existingSourceIndex();
      const issues = validatePackage(this.pkg, externalIds);
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
        if (current.action !== row.action || canonical(current.patch ?? {}) !== canonical(row.patch ?? {})) {
          log.results.push({id:row.id, status:"skipped", message:"Foundry state changed since preview; preview again."});
          continue;
        }
        try {
          const present=new Set(existingSourceIndex().keys());
          present.add(record.id);
          for (const child of record.resource_opportunities??[]) present.add(child.id);
          // Never mutate the canonical source record. Only the Foundry write copy gets uploaded asset paths.
          const adapted=adaptRecordArtwork(record,originalMediaPaths);
          const doc = row.action==="create" ? await createRecord(adapted, this.pkg, present, entry=>log.results.push({...entry,id:entry.id??row.id}))
            : row.kind==='Actor' ? await applyActorUpdate(docs[0],current,{user:game.user,source:sourceMetadata(record,this.pkg,present)})
            : await updateRecord(record,this.pkg,docs[0],current.patch,present);
          if (!doc) throw new Error("Foundry did not return a saved document.");
          log.results.push({id:row.id, action:row.action, status:"ok", uuid:doc.uuid});
        } catch(error) {
          console.error(`[${MODULE_ID}] Import of ${row.id} failed`, error);
          log.results.push({id:row.id, action:row.action, status:"error", message:String(error.message ?? error)});
        }
      }
      // Locations come after every document so Material and Quest ids they mention already exist.
      if(locRows.length) log.results.push(...await applyLocations(locRows.map(row=>this.pkg.records.find(r=>r.id===row.id)),locationsApi(game),{updateExisting:this.updateExisting}));
      // Complete-world UUID index: only actual saved documents are addressable.
      // Resolve after the *whole* batch; record order and reference cycles do not matter.
      const uuidIndex=buildUuidIndex(allBoundDocuments());
      for(const row of ordered) {
        if(!log.results.some(r=>r.id===row.id && ['create','update','metadata'].includes(r.action) && r.status==='ok')) continue;
        const record=this.pkg.records.find(r=>r.id===row.id);
        const doc=foundDocuments(row.id)[0];
        if(!doc) continue;
        const {bindings,issues}=resolveTypedRefs(record.refs,uuidIndex);
        for(const issue of issues) log.results.push({id:row.id,action:'link-sync',status:issue.level==='error'?'error':'warning',message:issue.message});
        const updates={};
        const missingRequired=issues.filter(i=>i.level==='error').map(i=>i.id);
        const source=sourceFlag(doc)??{};
        const currentIds=new Set(uuidIndex.keys());
        updates[`flags.${MODULE_ID}.source.refs`]=projectedReferences(record.refs,currentIds);
        const newFields={...(source.managedFields??{})};
        updates[`flags.${MODULE_ID}.source.resolvedUuidRefs`]=bindings;
        updates[`flags.${MODULE_ID}.source.unresolvedRequiredRefs`]=missingRequired;
        updates[`flags.${MODULE_ID}.source.unresolvedOptionalRefs`]=issues.filter(i=>i.level==='warning').map(i=>i.id);
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
      const links=log.results.filter(r=>r.action==='uuid-bind'&&r.status==='ok').reduce((a,r)=>a+(r.bindings??0),0);
      const locOk=log.results.filter(r=>r.kind==='Location'&&r.status==='ok').length;
      const locSkipped=log.results.filter(r=>r.kind==='Location'&&r.status==='skipped').length;
      const locNote=locOk||locSkipped?` (${locOk} location(s) imported${locSkipped?`, ${locSkipped} location(s) skipped: see History for reasons`:''})`:'';
      this.message=`Import results: ${created} created, ${updated} updated, ${folders} folders, ${icons} icon fallbacks, ${links} UUID links, ${errors} errors, ${skipped} skipped${locNote}. Review History.`;
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
        const locOk=last.results.filter(x=>x.kind==='Location'&&x.status==='ok').length;
        const locSkipped=last.results.filter(x=>x.kind==='Location'&&x.status==='skipped').length;
        const locText=locOk||locSkipped?` ${locOk} location(s) imported${locSkipped?`, ${locSkipped} skipped (reasons in History)`:''}.`:'';
        this.message=`Imported ${okay} document(s), created ${folders} folder(s), bound ${links} reference(s); ${bad} error(s).${locText} Details are in the result panel below.`;
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
    const rows=this.managedRows();
    const results=browseLibrary(rows,{search:this.librarySearch,system:this.librarySystem,
      status:this.libraryStatus,package:this.libraryPackage,showArchived:this.libraryShowArchived}).rows;
    return results.slice(this.libraryPage*this.libraryPageSize,(this.libraryPage+1)*this.libraryPageSize);
  }
  async #openOtherModule(moduleId) {
    if(!game.user.isGM) throw new Error('Only a GM can launch modules from Manager.');
    return openAshenLauncher(moduleId,game.modules,game.settings.menus??new Map());
  }
  #getLibrarySelected() {
    return this.managedRows().filter(row=>this.librarySelected.has(row.uuid));
  }
  async #exportManaged() {
    const rows=this.#getLibrarySelected();
    if(!rows.length) return toast('Select managed documents first.');
    const editing=rows.map(r=>({source_id:r.sourceId,uuid:r.uuid,local_edits:localEdits(r.doc),snapshot:docManagerSnapshot(r.doc)}));
    const yes=await DialogV2.confirm({window:{title:'Export managed world documents'},
      content:`<p>Export <strong>${editing.length}</strong> managed documents and their local edits for review?</p><p>This includes rules text and potentially GM-only content. Review before sharing. No changes are made.</p>`,rejectClose:false,modal:true});
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
    const warning=denied.length?`<p>Skipped ${denied.length}: ${denied.map(r=>r.sourceId).join(', ')}</p>`:'';
    const first=await DialogV2.confirm({window:{title:`${action.toUpperCase()} managed content`},
      content:`<p><strong>${accepted.length}</strong> managed world document(s) will be ${action}d.</p>${warning}
      <p>Existing Actor items, player progress, and unmanaged content are not modified. An automatic JSON snapshot download is made first.</p>
      ${action==='delete'?'<p><strong>PERMANENT DELETE.</strong> Only archived, unreferenced documents are eligible. Make a world backup first.</p>':''}`,
      modal:true,rejectClose:false});
    if(!first)return;
    if(action==='delete') {
      const second=await DialogV2.confirm({window:{title:'FINAL DELETE CONFIRMATION'},
        content:`<p>Delete <strong>${accepted.length}</strong> archived Foundry documents permanently? A JSON snapshot is not a full world backup.</p>`,modal:true,rejectClose:false});
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
    const yes=await DialogV2.confirm({window:{title:'REPLACE fields from source — confirm'},modal:true,rejectClose:false,
      content:`<p>Replace <strong>${candidates.length}</strong> managed Item(s) with values from <strong>${this.pkg.manifest.package_id}</strong>?</p>
      <p>This can overwrite manually edited source-owned fields: <strong>${candidates.flatMap(c=>c.local.map(p=>c.row.sourceId+'.'+p)).join(', ')||'None'}</strong>.</p>
      <p>Preserves Foundry IDs, other non-managed fields, and Actor inventories. JSON snapshots will download automatically.</p>`});
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
    const yes=await DialogV2.confirm({window:{title:'Copy into staging Compendium (EXPERIMENTAL)'},modal:true,rejectClose:false,
      content:`<p>Copy <strong>${items.length}</strong> world Items into an Ashen Gate staging Compendium?</p><p>Existing matching source IDs will be skipped, not replaced. This makes a copy, not an independent sandbox or synchronization.</p>`});
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
  #organizeOptions() {return {source:this.orgSource, types:ORGANIZE_TYPES.filter(t=>this.orgTypes.has(t)), mode:this.orgMode};}
  #organizeContext() {
    const api=organizer(), TYPE_LABEL={Item:'Items',Actor:'Actors',JournalEntry:'Journals'};
    const schema=api.getSchema();
    const p=this.orgPreview;
    const world=this.orgSource==='world';
    const worldFolders=world?[...(game.folders?.contents??[])].filter(f=>ORGANIZE_TYPES.includes(f.type)):[];
    const byType=ORGANIZE_TYPES.map(t=>[t,folderIndex(worldFolders.filter(f=>f.type===t))]);
    const folders=byType.flatMap(([t,idx])=>[...idx.byId.values()].map(f=>({id:f.id,label:`${TYPE_LABEL[t]}: ${idx.pathOf(f.id)}`,
      isProtected:Boolean(f.getFlag?.(MODULE_ID,FLAG_PROTECTED))}))).sort((a,b)=>a.label.localeCompare(b.label));
    return {
      sources:api.listSources().map(s=>({...s,selected:s.key===this.orgSource,label:s.writable?s.label:`${s.label} — inspect only`})),
      types:ORGANIZE_TYPES.map(t=>({value:t,label:TYPE_LABEL[t],checked:this.orgTypes.has(t)})),
      modeMisfiled:this.orgMode!=='all', modeAll:this.orgMode==='all', world, message:this.orgMessage,
      preview:p?{totals:p.totals,canApply:p.totals.moves>0&&p.parts.every(x=>x.writable),parts:p.parts.map(x=>({...x,label:TYPE_LABEL[x.documentName],
        hasSkipped:x.skipped.length>0,hasUnmatched:x.unmatched.length>0,hasCreates:x.createFolders.length>0,moveCount:x.moves.length}))}:null,
      result:this.orgResult, hasEmpty:Boolean(this.orgResult?.emptyFolders?.length),
      history:api.history().map(h=>({at:h.at.replace('T',' ').slice(0,16),moved:h.moves.length,mode:h.mode==='all'?'Refile everything':'Unfiled and misfiled',source:h.source==='world'?'World':h.source.slice(5)})),
      protectedFolders:folders.filter(f=>f.isProtected), openFolders:folders.filter(f=>!f.isProtected),
      rules:schema.rules?.map((r,n)=>({n:n+1,...r,types:(r.types??ORGANIZE_TYPES).map(t=>TYPE_LABEL[t]).join(', '),
        match:Object.entries(r.when??{}).map(([k,v])=>`${k}=${[v].flat().join('|')}`).join(', ')||'anything'}))??[],
      schemaIsDefault:schema.isDefault, schemaText:this.orgSchemaText, editing:this.orgSchemaText!==null,
      report:this.orgReport
    };
  }
  #bindOrganize(root) {
    root.querySelector('[data-ag-org-source]')?.addEventListener('change',e=>{this.orgSource=e.target.value;this.orgPreview=null;this.orgResult=null;void this.render();});
    root.querySelectorAll('[data-ag-org-type]').forEach(el=>el.addEventListener('change',e=>{
      if(e.target.checked)this.orgTypes.add(e.target.dataset.agOrgType);else this.orgTypes.delete(e.target.dataset.agOrgType);
      this.orgPreview=null;void this.render();
    }));
    root.querySelector('[data-ag-org-mode]')?.addEventListener('change',e=>{this.orgMode=e.target.value;this.orgPreview=null;void this.render();});
    root.querySelector('[data-ag-org-schema-text]')?.addEventListener('input',e=>{this.orgSchemaText=e.target.value;});
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
    root.querySelector('[data-ag-org-schema-file]')?.addEventListener('change',async e=>{
      const f=e.target.files?.[0];e.target.value='';
      if(!f)return;
      try{
        const data=JSON.parse(await f.text());
        const rules=Array.isArray(data)?data:data?.rules;
        const yes=await DialogV2.confirm({window:{title:'Import organize rules'},modal:true,rejectClose:false,
          content:`<p><strong>Replace the organize rules with the ${Array.isArray(rules)?rules.length:0} rule(s) in ${escapeHtml(f.name)}?</strong> No document moves until you Preview and Apply.</p>`,
          yes:{label:'Replace rules'},no:{label:'Cancel'}});
        if(!yes)return;
        const out=await organizer().saveSchema(rules);
        this.orgMessage=out.ok?`Rules imported from ${f.name}.`:`Rules not imported: ${out.message}`;
        if(!out.ok)toast(out.message,true);
        this.orgPreview=null;await this.render();
      }catch(error){toast(`Could not read ${f.name}: ${error.message??error}`,true);}
    });
  }
  async #organizeAction(name,message) {
    const api=organizer();
    const say=(text,error=false)=>{this.orgMessage=text;toast(text,error);};
    switch(name) {
      case 'org-preview': {
        if(!this.orgTypes.size)return say('Tick at least one of Items, Actors or Journals.',true);
        const out=await api.preview(this.#organizeOptions());
        if(!out.ok){say(out.message,true);break;}
        this.orgPreview=out;this.orgResult=null;
        this.orgMessage=message??(out.totals.moves?`Preview: ${out.totals.moves} document(s) would move, ${out.totals.createFolders} folder(s) would be created. Nothing has changed yet.`:'Everything is already in place. Nothing would move.');
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
        const yes=await DialogV2.confirm({window:{title:'Organize folders'},modal:true,rejectClose:false,
          content:`<p><strong>Move ${p.totals.moves} document(s) into the folders shown and create ${p.totals.createFolders} folder(s)?</strong></p><p>Only the folder changes; names, data, ownership and Actor progression are untouched and no folder is deleted. You can <strong>Undo last organize</strong> afterwards.</p>`,
          yes:{label:'Apply organize'},no:{label:'Cancel'}});
        if(!yes)return;
        this.busy=true;
        try{
          const out=await api.apply(this.#organizeOptions());
          if(!out.ok){say(out.message,true);break;}
          this.orgResult=out;
          const again=await api.preview(this.#organizeOptions());
          this.orgPreview=again.ok?again:null;
          say(out.message);
        }finally{this.busy=false;}
        break;
      }
      case 'org-undo': {
        const last=api.history()[0];
        if(!last)return say('There is no organize run to undo.',true);
        const yes=await DialogV2.confirm({window:{title:'Undo last organize'},modal:true,rejectClose:false,
          content:`<p><strong>Put the ${last.moves.length} document(s) moved on ${escapeHtml(last.at.replace('T',' ').slice(0,16))} back where they were?</strong> Documents you moved yourself since then stay where they are. Folders are not deleted.</p>`,
          yes:{label:'Undo last organize'},no:{label:'Cancel'}});
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
        this.orgMessage='Housekeeping report ready. It is read-only: nothing was changed or deleted.';break;
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
        const yes=await DialogV2.confirm({window:{title:'Reset organize rules'},modal:true,rejectClose:false,
          content:'<p><strong>Replace your organize rules with the shipped defaults?</strong> Your own rules are deleted (export them first to keep a copy). No document moves.</p>',
          yes:{label:'Reset rules to defaults'},no:{label:'Cancel'}});
        if(!yes)return;
        await api.resetSchema();this.orgSchemaText=null;this.orgPreview=null;say('Organize rules reset to the defaults.');break;
      }
    }
    await this.render();
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
    id:'ashen-gate-my-appearance',classes:['ag-app','ag-my-appearance'],
    window:{title:'Ashen Gate | My Appearance',icon:'fa-solid fa-palette',resizable:true},
    position:{width:560,height:520}
  };
  static PARTS={main:{template:`modules/${MODULE_ID}/templates/my-appearance.hbs`}};
  constructor(options={}){super(options);myAppearanceApp=this;this.selection=null;this.status='Select a skin, or inherit the GM world default.';}
  async _prepareContext(options){
    const ctx=await super._prepareContext(options);
    if(!game.user?.id)throw new Error('Sign in to change My Appearance');
    const state=appearanceController.getState();
    const selected=this.selection===null ? (state.userOverride??'') : this.selection;
    return {...ctx,worldDefault:appearanceController.listSkins().find(s=>s.id===state.worldDefault)?.label??state.worldDefault,
      effective:appearanceController.listSkins().find(s=>s.id===state.effective)?.label??state.effective,
      selected,isInherit:selected==='',status:this.status,
      skins:appearanceController.listSkins().map(s=>({...s,current:s.id===state.effective,selected:s.id===selected}))};
  }
  async _onRender(ctx,options){
    await super._onRender(ctx,options);
    bindSkinPicker(this.element.querySelector('[data-ag-skin-picker="my"]'),value=>{this.selection=value;});
    this.element.querySelector('[data-ag-my-save]')?.addEventListener('click',async e=>{
      e.preventDefault();const button=e.currentTarget;button.disabled=true;
      try {const chosen=this.selection===null ? (appearanceController.getState().userOverride??'') : this.selection;
        await appearanceController.setUserOverride(chosen);
        this.status=chosen?'Your personal Ashen Gate appearance is saved.':'You now inherit the GM world default.';
        this.selection=null;await this.render();
      }catch(error){this.status=`Unable to save appearance: ${error.message}`;await this.render();}
      finally{button.disabled=false;}
    });
  }
}

let appearanceController=null;
let definitionsReader=null;
let myAppearanceApp=null;
let activeApp;
let sceneMoodsApi=null;
const sceneMoods=()=>sceneMoodsApi??=createSceneMoods({game});
let organizerApi=null;
const organizer=()=>organizerApi??=createOrganizer({game});
Hooks.once("init",()=>{
  registerAppearanceSettings({game,namespace:MODULE_ID,onSettingChange:(key,value)=>appearanceController?.noteChange(key,value)});
  game.settings.register(MODULE_ID,SNAPSHOT_SETTING,{name:"World export snapshot",scope:"world",config:false,type:Object,default:{}});
  game.settings.register(MODULE_ID,"importHistory",{name:"Import History",scope:"world",config:false,type:Array,default:[]});
  // Empty means "use the shipped default moods"; written only by the GM from the Scenes tab.
  game.settings.register(MODULE_ID,MOODS_SETTING,{name:"Scene mood presets",scope:"world",config:false,type:Array,default:[]});
  // Organize folders (0.24.0). Empty schema means "use the shipped default rules"; history holds the last runs' previous folder ids for Undo.
  game.settings.register(MODULE_ID,SCHEMA_SETTING,{name:"Organize rules",scope:"world",config:false,type:Array,default:[]});
  game.settings.register(MODULE_ID,HISTORY_SETTING,{name:"Organize history",scope:"world",config:false,type:Array,default:[]});
  game.settings.registerMenu(MODULE_ID,"manager",{
    name:"Ashen Gate Manager", label:"Open Import Manager", icon:"fa-solid fa-boxes-stacked",
    hint:"GM-only package validation, preview, import and audit.", type:AshenGateManager, restricted:true
  });
  game.settings.registerMenu(MODULE_ID,'myAppearance',{
    name:'Ashen Gate | My Appearance',label:'Open My Appearance',
    hint:'Choose your own appearance or inherit the GM world default. Player-safe; no Manager administration.',
    icon:'fa-solid fa-palette',type:AshenGateMyAppearance,restricted:false
  });
});
Hooks.once("ready",()=>{
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
      applyTo:root=>appearanceController.applyTo(root),
      subscribe:callback=>appearanceController.subscribe(callback),
      refresh:()=>appearanceController.refresh(),
      setWorldDefault:id=>appearanceController.setWorldDefault(id),
      setUserOverride:id=>appearanceController.setUserOverride(id),
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
      dispose:()=>definitionsReader.dispose()
    },
    // GM-only, read-only health report (0.21.0); the gate is inside runPreSessionCheck.
    preSessionCheck:()=>runPreSessionCheck(game),
    // GM-only "Back up before play" (0.21.0): the everything export as AG_Backup_<date>.json; leaves the export snapshot alone.
    backup:()=>saveBackup(game,{save:downloadJson}),
    // GM-only scene moods (0.22.0); every function checks the GM itself and returns {ok,message}.
    // GM-only organize folders (0.24.0); every function checks the GM itself. Only the folder field is ever written.
    organize:(({listSources,preview,apply,undoLast,history,getSchema,saveSchema,resetSchema,setFolderProtected,setKeepFolder,housekeeping})=>({listSources,preview,apply,undoLast,history,getSchema,saveSchema,resetSchema,setFolderProtected,setKeepFolder,housekeeping}))(organizer()),
    scenes:(({listMoods,getState,applyMood,restore,savePreset,removePreset,resetDefaults})=>({listMoods,getState,applyMood,restore,savePreset,removePreset,resetDefaults}))(sceneMoods()),
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
    playerAccess:{contract:"ag-player-access/1",getState:()=>({contract:"ag-player-access/1",moduleId:MODULE_ID,audience:"gm-only",playerAccessEnabled:false,configurable:false})},
    open:()=>{
      if(!game.user.isGM) return toast("Only GMs can open the Ashen Gate importer.",true);
      activeApp ??= new AshenGateManager();
      return activeApp.render({force:true});
    }
  };
  console.info(`[${MODULE_ID}] v0.24.0 ready. Open from Configure Settings → Module Settings, or game.modules.get("${MODULE_ID}").api.open()`);
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
