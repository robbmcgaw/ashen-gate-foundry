import {createAppearanceController, registerAppearanceSettings, makeFoundryAppearanceController, APPEARANCE_CONTRACT, DEFAULT_SKIN_ID} from "./appearance.js";
import {auditTypedReferences, renderGmReferenceMarkers} from "./manager-resolver-bridge.mjs";
import {createManagerDefinitionReader, READER_CONTRACT} from './native-definition-reader.mjs';
import {sourceMetadata as projectionSourceMetadata} from './source-projection.mjs';
import {MODULE_ID, MANAGED_TYPES, validatePackage, planRecord, exportedFields, getPath, canonical} from "./core.js";
import {checkContractGraph, isContractImport, selectionIssues, projectedReferences, finalReferenceResolution} from "./contract.js";
import {systemOf, browseLibrary, inspectLibrary, describeLaunchers, headerLaunchers} from "./browser.js";
import {openAshenLauncher} from "./launchers.js";
import {collectPlayerAccess, changePlayerAccess, hideAllPlayerInterfaces} from "./player-access.js";
import {chooseIcon,markerTargets,buildUuidIndex,resolveRichText,resolveTypedRefs,appendReferenceBlock} from "./import-fidelity.js";
import {ensureFolder} from "./folders.js";
import {readImportZip, adaptRecordArtwork, uploadMatchingArt} from "./zip-import.js";
import {loadMacroSources, validateUserMacroRegistry} from "./macros.js";
import {CAPTURE_TYPES, normalizeCaptureFlag, buildCapturePackage} from "./capture.js";
import {compilePackage, dependencyOrder, normalizeRef, docManagerSnapshot, localEdits, planLifecycle, buildSourceReplacementPatch, checkMacroUpdate} from "./workflows.js";
import {downloadJson} from "./download.js";

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

class AshenGateManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "ashen-gate-manager-window",
    classes: ["ag-app","ashen-gate-manager"],
    window: {title:"Ashen Gate | General Manager v0.12.3 Beta", icon:"fa-solid fa-boxes-stacked", resizable:true},
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
    this.selected = new Set();
    this.tab = "import";
    this.playerAccessMessage = "Only supported, active player-facing modules can be revealed or hidden. Manager never stores their access state.";
    this.playerAccessReport = null;
    this.appearanceSelection = null;
    this.appearanceMessage = 'Choose the default appearance for all Ashen Gate modules that support the optional appearance API.';
    this.busy = false;
    this.auditEntries = [];
    this.message = "Choose a Manager-ready JSON projection or ZIP package; no world changes occur until Import.";
    this.zipMedia = new Map();
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
    this.macroSelected = new Set();
    this.registry = null;
    this.userMacros = [];
    this.macroMessage = "Install experimental utilities without executing them. Existing macros retain their Foundry IDs on update.";
    this.lastTemplateInfo = "Templates are compiled from imported JSON; they are not approved game rules.";
    this.profile = "session-safe";
    this.applyProfile();
  }

  applyProfile() {
    const profiles={development:{includeDrafts:true},"session-safe":{includeDrafts:false}};
    this.includeDrafts=profiles[this.profile]?.includeDrafts??true;
  }
  async ensureMacroRegistry() {
    if (this.registry) return this.registry;
    const response=await fetch(`modules/${MODULE_ID}/macros/manifest.json`,{cache:"no-store"});
    if (!response.ok) throw new Error(`Macro manifest unavailable: ${response.status}`);
    const manifest=await response.json();
    const entries=await loadMacroSources(manifest, async source => {
      const macroResponse=await fetch(`modules/${MODULE_ID}/${source}`,{cache:'no-store'});
      if (!macroResponse.ok) throw new Error(`Macro source unavailable ${source}: ${macroResponse.status}`);
      return macroResponse.text();
    });
    this.registry={...manifest,entries};
    return this.registry;
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
  macroRows() {
    return [...(this.registry?.entries??[]), ...this.userMacros].map(entry=>{
      const matches=game.macros?.contents.filter(m=>m.getFlag(MODULE_ID,'macro')?.registryId===entry.id)??[];
      const existing=matches[0];
      const result=matches.length>1 ? {action:'blocked',reason:'Duplicate managed macro IDs.'} : checkMacroUpdate(existing ?
        {command:existing.command,flag:existing.getFlag(MODULE_ID,'macro')} : null,entry);
      return {...entry, action:result.action,reason:result.reason,uuid:existing?.uuid,
        selected:this.macroSelected.has(entry.id),installable:['install','update'].includes(result.action)};
    });
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
    const macros=this.macroRows();
    const captureRows = allItems.filter(row => (!this.captureTaggedOnly || row.capture) && (!this.captureSearch || row.name.toLowerCase().includes(this.captureSearch.toLowerCase()) || row.type.toLowerCase().includes(this.captureSearch.toLowerCase())));
    return {
      ...ctx,
      importActive: this.tab === "import",
      libraryActive: this.tab === "library",
      modulesActive: this.tab === "modules",
      playerAccessActive: this.tab === "player-access",
      appearanceActive: this.tab === "appearance",
      appearanceMessage:this.appearanceMessage,
      appearanceCurrent: appearanceController?.getState?.()??null,
      appearanceSkinRows:(appearanceController?.listSkins?.()??[]).map(skin=>({...skin,selected:skin.id===(this.appearanceSelection??appearanceController.getState().worldDefault)})),
      playerAccessRows, playerAccessMessage:this.playerAccessMessage, playerAccessReport:this.playerAccessReport,
      playerAccessVisibleCount:accessVisibleCount,
      playerAccessHasVisible:accessVisibleCount>0&&!this.busy,
      launcherRows, launcherCount:launcherRows.length, headerLaunchers:headerLaunchers(launcherRows),
      templatesActive: this.tab === "templates",
      macrosActive: this.tab === "macros",
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
      libraryMessage:this.libraryMessage,
      macroRows:macros,macroMessage:this.macroMessage,hasMacroRegistry:Boolean(this.registry),
      macroSelectedCount:this.macroSelected.size,
      templateRows:(Array.isArray(this.rawPkg?.templates)?this.rawPkg.templates:[]).map(t=>({id:t.id,version:t.version??'—',
        kind:t.document_type,used:this.rawPkg.records.filter(r=>r.template_ref===t.id).length})),
      templateCount:Array.isArray(this.rawPkg?.templates)?this.rawPkg.templates.length:0,
      compiledCount:this.pkg?.records?.filter(r=>r.template_ref).length??0,
      templateMessage:this.lastTemplateInfo,
      profile:this.profile,developmentProfile:this.profile==='development',sessionProfile:this.profile==='session-safe',
      hasLibrarySelected:this.librarySelected.size>0,
      captureActive: this.tab === "capture",
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
      auditActive: this.tab === "audit",
      historyActive: this.tab === "history",
      hasPackage: Boolean(this.pkg),
      packageId: this.pkg?.manifest?.package_id ?? "—",
      packageVersion: this.pkg?.manifest?.version ?? "—",
      recordCount: this.pkg?.records?.length ?? 0,
      typeSummary:Object.entries(this.pkg?.records?.reduce((a,r)=>(a[r.foundry?.document_type??'Unsupported']=(a[r.foundry?.document_type??'Unsupported']??0)+1,a),{})??{}).map(([name,count])=>({name,count})),
      zipPortraitCount:this.zipMedia.size, hasZipPortraits:this.zipMedia.size>0,
      uploadZipArtwork:this.uploadZipArtwork, packageSource:this.packageSource??'—',
      includeDrafts: this.includeDrafts,
      message: this.message,
      errors: this.errors.map(message => ({message})),
      warnings: this.warnings.map(message => ({message})),
      hasWarnings: this.warnings.length > 0,
      schemaVersion: this.pkg?.manifest?.schema_version ?? "—",
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
    root.querySelector("[data-ag-world-skin]")?.addEventListener("change",event=>{this.appearanceSelection=event.target.value;});
    root.querySelectorAll("[data-ag-action]").forEach(el => el.addEventListener("click", event => {
      event.preventDefault();
      this.#action(el.dataset.agAction).catch(err => this.#fail(err));
    }));
    root.querySelectorAll("[data-ag-tab]").forEach(el => el.addEventListener("click", async event => {
      event.preventDefault();
      this.tab = el.dataset.agTab;
      if (this.tab === "audit") this.#runAudit();
      if (this.tab === "macros") await this.ensureMacroRegistry();
      void this.render();
    }));
    root.querySelector("[data-ag-file]")?.addEventListener("change", async event => {
      const f = event.target.files?.[0];
      if (!f) return;
      try {
        if(f.size>60_000_000)throw new Error('Maximum source file is 60 MB.');
        if(/\.zip$/i.test(f.name)) {
          const result=await readImportZip(await f.arrayBuffer());
          this.zipMedia=result.assets;
          this.packageSource=`ZIP ${f.name} → ${result.filename}`;
          await this.#load(result.pkg,this.packageSource);
        } else {
          if(!/\.json$/i.test(f.name)||f.size>10_000_000)throw new Error('Choose JSON (up to 10 MB) or ZIP (up to 60 MB).');
          this.zipMedia=new Map();this.packageSource=f.name;
          await this.#load(JSON.parse(await f.text()),f.name);
        }
      } catch (error) {this.pkg=null; this.rawPkg=null; this.zipMedia=new Map();this.preview=[]; this.warnings=[]; this.selected.clear(); this.errors=[`Import not loaded: ${error.message}`]; await this.render();}
    });
    root.querySelector('[data-ag-upload-assets]')?.addEventListener('change',async e=>{
      this.uploadZipArtwork=Boolean(e.target.checked);
      await this.render();
    });
    root.querySelector('[data-ag-macro-json]')?.addEventListener('change', async event => {
      const file=event.target.files?.[0];
      if (!file) return;
      try {
        if(file.size>1_000_000) throw new Error('Custom macro registry exceeds 1MB.');
        const entries=validateUserMacroRegistry(JSON.parse(await file.text()));
        await this.ensureMacroRegistry();
        const bundled=new Set(this.registry.entries.map(e=>e.id));
        for(const entry of entries) if(bundled.has(entry.id)) throw new Error(`Custom macro ${entry.id} would replace a bundled macro; change its registry ID.`);
        this.userMacros=entries;
        this.macroSelected.clear();
        this.macroMessage=`Loaded ${entries.length} custom macro definition(s) for this Manager session. Review commands before installing; loading never executes them. Re-import this JSON when updating its macros later.`;
      } catch(error) { this.macroMessage=`Custom macro registry rejected: ${error.message}. No macros installed.`; }
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
    root.querySelectorAll("[data-ag-macro-select]").forEach(el=>el.addEventListener("change",event=>{
      if(event.target.checked)this.macroSelected.add(event.target.dataset.agMacroSelect);
      else this.macroSelected.delete(event.target.dataset.agMacroSelect);
      void this.render();
    }));
    root.querySelector("[data-ag-drafts]")?.addEventListener("change", async event => {
      this.includeDrafts = event.target.checked;
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
    root.querySelectorAll("[data-ag-select]").forEach(el => el.addEventListener("change", event => {
      const id = event.target.dataset.agSelect;
      if (event.target.checked) this.selected.add(id);
      else this.selected.delete(id);
      // Re-render to accurately enable the Apply button.
      void this.render();
    }));
  }

  async #action(name) {
    if(!game.user?.isGM) throw new Error('Only GMs can operate the General Manager.');
    if (this.busy) return;
    switch(name) {
      case "demo": {
        const response = await fetch(`modules/${MODULE_ID}/samples/demo-package.json`, {cache:"no-store"});
        if (!response.ok) throw new Error(`Demo request failed (${response.status}).`);
        this.zipMedia=new Map();this.packageSource="Included demonstration";
        await this.#load(await response.json(), "Included demonstration");
        break;
      }
      case "help": {
        await DialogV2.confirm({window:{title:'Ashen Gate | General Manager Help'},
          content:'<p><strong>Clean import:</strong> Choose Manager JSON or ZIP containing exactly one Manager projection; select Development for draft content, Validate & Preview, Select eligible, then Import.</p><p><strong>Supported documents:</strong> Item, JournalEntry, Actor, RollTable and Macro; no Scenes or Playlists. ZIP scripts never run. Bundled images are uploaded only if that option is enabled.</p><p><strong>Folders:</strong> foundry.folder_path creates nested folders per document type. <strong>Links:</strong> canonical refs bind after creation. Markers [[AGREF:MAT-EXAMPLE|Material]] are provisional pending Tim.</p><p>Back up a test world. Only new Actors/Tables/Macros are allowed; existing data is never replaced through this adapter.</p>',
          modal:true,rejectClose:false});
        break;
      }
      case "preview": await this.#preview(); break;
      case "select":
        this.selected = new Set(this.preview.filter(row => actionAllowed.has(row.action)).map(row => row.id));
        await this.render(); break;
      case "clear": this.selected.clear(); await this.render(); break;
      case "apply": await this.#apply(); break;
      case "audit": this.#runAudit(); await this.render(); break;
      case "appearance-save-world": {
        const choice=this.appearanceSelection??appearanceController?.getState()?.worldDefault;
        await appearanceController.setWorldDefault(choice);
        this.appearanceMessage=`World default saved: ${appearanceController.listSkins().find(s=>s.id===choice)?.label??choice}. Connected users with no override inherit this skin.`;
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
      case "macro-install": await this.#installMacros();break;
      case "macro-select": this.macroSelected=new Set(this.macroRows().filter(r=>r.installable).map(r=>r.id));await this.render();break;
      case "macro-export": await this.#exportMacros();break;
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
      case "reset": this.pkg=null;this.rawPkg=null;this.preview=[];this.errors=[];this.warnings=[];this.zipMedia=new Map();this.packageSource=null;this.selected.clear();this.message="Choose a Manager JSON or ZIP package to begin."; await this.render();break;
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
  async #load(input, label) {
    this.rawPkg=input;
    this.pkg=compilePackage(input);
    this.selected.clear();
    this.message = `${label} loaded. Preview has NOT modified your world.`;
    this.tab = "import";
    await this.#preview();
  }
  async #preview() {
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
    for (const id of graph.order) {
      const record=records.find(r=>r.id===id);
      const matches = foundDocuments(record.id).map(docWrapper);
      const planned = planWithMetadata(record, matches, findSameNameUnmanaged(record), this.includeDrafts,this.pkg);
      const archived=matches.some(m=>m.doc.getFlag(MODULE_ID,'lifecycle')?.archived);
      const {action,reason,patch={}}=archived?{action:'blocked',reason:'Existing record is archived; restore it before reimport.'}:planned;
      this.preview.push({id:record.id, name:record.foundry?.data?.name ?? record.name ?? record.id, kind:record.foundry?.document_type ?? record.entity_type+" (unmapped)", lifecycle:record.status, action, reason, patch});
    }
    this.message = `Validated ${records.length} records. ${this.dependencyNotes} Nothing changes before Apply.`;
    await this.render();
  }
  #exportPreview() {
    const report = {generated_at:new Date().toISOString(), manifest:this.pkg?.manifest ?? null, errors:this.errors, warnings:this.warnings, preview:this.preview.map(({id, name, kind, lifecycle, action, reason, patch})=>({id,name,kind,lifecycle,action,reason,patch}))};
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
    if (!this.pkg || this.errors.length) throw new Error("Load a validated package first.");
    const targetRows = this.preview.filter(row => actionAllowed.has(row.action) && this.selected.has(row.id));
    if (!targetRows.length) {toast("Select at least one eligible record.");return;}
    const missing=selectionIssues(this.pkg.records,targetRows.map(r=>r.id),existingSourceIndex().keys());
    if (missing.length) {this.errors=missing;this.message='Selected records have missing required dependencies; no changes made.';await this.render();return;}
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
    if(markerProblems.length){this.errors=markerProblems;this.message='Source markers need all their targets; no documents were imported.';await this.render();return;}
    const pendingGraph=dependencyOrder(this.pkg.records.filter(r=>targetRows.some(row=>row.id===r.id)));
    const cycleNotice=pendingGraph.cycles.length ? `<p><strong>${pendingGraph.cycles.length} circular reference path(s).</strong> These are permitted because the Manager stores stable Ashen Gate IDs. If any required target fails creation, its references are not finalized and the error is logged.</p>` : '';
    const wantsScriptMacros=targetRows.some(r=>this.pkg.records.find(rec=>rec.id===r.id)?.foundry?.document_type==='Macro' && this.pkg.records.find(rec=>rec.id===r.id)?.foundry?.data?.type==='script');
    const decision = await DialogV2.confirm({
      window:{title:"Confirm Foundry world changes"},
      content:`<p><strong>${targetRows.length} document(s)</strong> will be created/updated in this world.</p>${cycleNotice}<p>Back up your test world. This import is non-transactional: partial writes may remain if anything fails.</p><p><strong>Actors:</strong> only new NPC/character definitions; existing Actors and player progress are never replaced. ${wantsScriptMacros?'<strong>Warning: this import installs untrusted Script Macro source as GM-only, but never executes it.</strong>':''}</p><p>${this.uploadZipArtwork&&this.zipMedia.size?`${this.zipMedia.size} bundled assets may be uploaded to the current world before importing documents.`:'ZIP artwork will not be uploaded. If actor images reference missing world paths, upload them manually.'}</p>`,
      rejectClose:false,
      modal:true
    });
    if (!decision) return;
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
      const ordered=graph.order.map(id=>targetRows.find(row=>row.id===id)).filter(Boolean);
      const before=ordered.filter(r=>r.action==='update').map(row=>foundDocuments(row.id)[0]).filter(Boolean);
      if(before.length) this.#downloadSnapshots(before,`before-import-${Date.now()}`);
      for (const row of ordered) {
        const record = this.pkg.records.find(r=>r.id===row.id);
        const matches = foundDocuments(row.id).map(docWrapper);
        const current = matches.some(m=>m.doc.getFlag(MODULE_ID,'lifecycle')?.archived)
          ? {action:'blocked'} : planWithMetadata(record, matches, findSameNameUnmanaged(record), this.includeDrafts,this.pkg);
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
          const doc = row.action==="create" ? await createRecord(adapted, this.pkg, present, entry=>log.results.push({...entry,id:entry.id??row.id})) : await updateRecord(record,this.pkg,matches[0].doc,current.patch,present);
          if (!doc) throw new Error("Foundry did not return a saved document.");
          log.results.push({id:row.id, action:row.action, status:"ok", uuid:doc.uuid});
        } catch(error) {
          console.error(`[${MODULE_ID}] Import of ${row.id} failed`, error);
          log.results.push({id:row.id, action:row.action, status:"error", message:String(error.message ?? error)});
        }
      }
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
          const bio=record.foundry.data?.system?.details?.biography?.value;
          if(typeof bio==='string') {
            const resolved=resolveRichText(bio,uuidIndex);
            updates['system.details.biography.value']=appendReferenceBlock(resolved.text,bindings,resolved.resolved);
            for(const issue of resolved.issues)log.results.push({id:row.id,action:'actor-bio-link',status:'error',message:issue.message});
          }
          for(const [i,sourceItem] of (record.foundry.data?.items??[]).entries()) {
            const html=sourceItem.system?.description?.value, embedded=doc.items?.contents?.[i];
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
      this.message=`Import results: ${created} created, ${updated} updated, ${folders} folders, ${icons} icon fallbacks, ${links} UUID links, ${errors} errors, ${skipped} skipped. Review History.`;
      toast(this.message,Boolean(errors));
    } catch(error) {
      const message=String(error?.message??error);
      log.results.push({action:'import-aborted',status:'error',message});
      const prior=game.settings.get(MODULE_ID,'importHistory')??[];
      await game.settings.set(MODULE_ID,'importHistory',[...prior,log].slice(-40));
      this.message=`Import aborted: ${message}. Review History; any earlier successful writes may remain.`;
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
        this.message=`Imported ${okay} document(s), created ${folders} folder(s), bound ${links} reference(s); ${bad} error(s). See History for details.`;
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
  async #installMacros() {
    await this.ensureMacroRegistry();
    const rows=this.macroRows().filter(r=>this.macroSelected.has(r.id)&&r.installable);
    if(!rows.length)return toast('Select macros marked INSTALL or UPDATE.');
    const yes=await DialogV2.confirm({window:{title:'Install / Update Ashen Gate Macros'},modal:true,rejectClose:false,
      content:`<p>Install or update <strong>${rows.length}</strong> managed Script Macros?</p><p>Macros are NOT executed. They may make world changes if you later run them. The included Skill Tree generator remains experimental and is NOT official profession progression.</p><p>Existing edited macro code is protected from automatic overwrite.</p>`});
    if(!yes)return;
    this.busy=true;let installed=0,updated=0,failed=0;
    try{for(const row of rows) {
      try {
        const existing=game.macros.contents.find(m=>m.getFlag(MODULE_ID,'macro')?.registryId===row.id);
        const flag={registryId:row.id,version:row.version,lastCommand:row.command};
        if(existing){await existing.update({command:row.command,[`flags.${MODULE_ID}.macro`]:flag});updated++;}
        else {await Macro.create({name:row.name,type:'script',scope:'global',command:row.command,
          ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},flags:{[MODULE_ID]:{macro:flag}}});installed++;}
      }catch(err){console.error(`[${MODULE_ID}] macro installation failed`,err);failed++;}
    }}finally{this.busy=false;}
    this.macroSelected.clear();this.macroMessage=`${installed} installed, ${updated} updated, ${failed} failed. Macros were not executed.`;
    await this.render();toast(this.macroMessage,Boolean(failed));
  }
  async #exportMacros(){
    const docs=game.macros.contents.filter(m=>m.getFlag(MODULE_ID,'macro')?.registryId);
    if(!docs.length)return toast('No managed macros installed.');
    downloadJson(`ag-managed-macros-${Date.now()}.json`,{schema_version:'ag-macro-registry/0.4',
      entries:docs.map(doc=>({id:doc.getFlag(MODULE_ID,'macro').registryId,name:doc.name,
        version:doc.getFlag(MODULE_ID,'macro').version ?? 'unversioned',
        description:'Exported managed Macro — review source before executing.',command:doc.command}))});
    this.macroMessage=`Exported ${docs.length} reimportable macro definition(s) for backup, without executing them.`;
    await this.render();
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
      skins:appearanceController.listSkins().map(s=>({...s,current:s.id===state.effective})),
      choices:[{id:'',label:'Use GM default',selected:selected===''},
        ...appearanceController.listSkins().map(s=>({...s,selected:s.id===selected}))]};
  }
  async _onRender(ctx,options){
    await super._onRender(ctx,options);
    this.element.querySelector('[data-ag-my-skin]')?.addEventListener('change',e=>{this.selection=e.target.value;});
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
Hooks.once("init",()=>{
  registerAppearanceSettings({game,namespace:MODULE_ID,onSettingChange:()=>appearanceController?.refresh()});
  game.settings.register(MODULE_ID,"importHistory",{name:"Import History",scope:"world",config:false,type:Array,default:[]});
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
  const applyDocumentSkin=()=>{try{appearanceController.applyTo(document.documentElement);}catch(error){console.warn(`[${MODULE_ID}] Appearance not applied`,error);}};
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
  console.info(`[${MODULE_ID}] v0.12.3 ready. Open from Configure Settings → Module Settings, or game.modules.get("${MODULE_ID}").api.open()`);
});

/** Own only the General Manager launcher. Other modules own their sidebar buttons. */
function addManagerSidebarButton(app,html) {
  if(!game.user?.isGM)return;
  const root=html?.[0]??html?.element?.[0]??html?.element??html;
  if(!root || typeof root.querySelector!=='function')return;
  const tab=app?.tabName??app?.id??app?.constructor?.name??'';
  if(!/item/i.test(String(tab)))return;
  if(root.querySelector('[data-ag-launch="manager"]'))return;
  const directory=root.querySelector('.directory-header')??root.querySelector('.directory-list')?.parentElement??root;
  const group=document.createElement('div');
  group.className='ag-sidebar-launch-group';group.dataset.agLaunchGroup='items';
  const button=document.createElement('button');
  button.type='button';button.dataset.agLaunch='manager';button.className='ag-sidebar-launch-button';
  button.innerHTML='<i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i><span>General Manager</span>';
  button.title='Open the GM-only Ashen Gate General Manager';
  button.addEventListener('click',()=>{
    if(!game.user?.isGM) return toast('Only GMs can open the General Manager.',true);
    const open=game.modules.get(MODULE_ID)?.api?.open;
    if(typeof open==='function') return open();
    activeApp??=new AshenGateManager();
    return activeApp.render({force:true});
  });
  group.append(button);
  // Above the directory contents, after any standard header actions.
  if(directory.classList.contains('directory-header')) directory.after(group);
  else directory.prepend(group);
}
if(typeof Hooks.on==='function') Hooks.on('renderItemDirectory',addManagerSidebarButton);
if(typeof Hooks.on==='function') Hooks.on('renderSidebarTab',(app,html)=>{
  const tab=app?.tabName??app?.id??'';
  if(String(tab)==='items')addManagerSidebarButton(app,html);
});
