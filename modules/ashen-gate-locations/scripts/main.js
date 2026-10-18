import {mountLocationLauncher} from "./launcher.js";
import {gmOnlyPlayerAccess} from "./player-access.js";
import {ensureLocationJournalFolder} from "./journal-folders.js";
import {
  MODULE_ID, TIERS, ABUNDANCE, STATUSES, VISIBILITY, LOCATION_PATTERN, ID_PATTERN, SOURCE_FORMAT,
  clone, esc, refKey, regionRef, regionDescendsFrom, regionPath, validateRegionHierarchy, emptyState, normalizeState, createLocation, validateLocation,
  nextResourceId, nextPoiKey, playerHtml, syncDecision, parseImport, replaceRelationRefs, objectiveRefs, auditLocationRefs
} from "./model.js";
import {createLocationProvider, createResolverConnections, checkObjectiveLinks} from "./integration.js";
import {MAP_PATTERN, FRONTIER_OVERLAYS, emptyMapRegistry, newMap, validateMapRegistry, addFrontierPreset, matchOverlayTiles, mapOverlayUpdates, fileBasename} from "./maps-model.js";

const BaseApp = foundry.applications.api.ApplicationV2;
const MODULE_VERSION = "0.8.1";
const DialogV2 = foundry.applications.api.DialogV2;
const notify = {
  info: text => ui.notifications.info(text),
  warn: text => ui.notifications.warn(text),
  error: text => ui.notifications.error(text)
};
const sources = () => game.journal.filter(j => j.getFlag(MODULE_ID,"role") === "source");
const fromId = id => sources().find(j=>j.getFlag(MODULE_ID,"record")?.id===id) ?? null;
const sourceData = j => ({ record: clone(j.getFlag(MODULE_ID,"record")), revision: Number(j.getFlag(MODULE_ID,"revision") || 0),
  state:normalizeState(j.getFlag(MODULE_ID,"state")), projectedId:j.getFlag(MODULE_ID,"published_journal_id") || null,
  publishedRevision:Number(j.getFlag(MODULE_ID,"published_revision") || 0) });
function docs(){return sources().map(x=>({...sourceData(x), journal:x}));}
const options = (items,selected) => items.map(([value,label])=>`<option value="${esc(value)}" ${value===selected?"selected":""}>${esc(label)}</option>`).join("");
const field = (name,value,label,opts={}) => `<label class="ag-field"><span>${esc(label)}</span><input data-field="${esc(name)}" type="${opts.type||"text"}" ${opts.type==="number"? 'min="1" max="20"':''} value="${esc(value ?? "")}" ${opts.readonly?'readonly':''}></label>`;
const textarea = (name,value,label,rows=4) => `<label class="ag-field"><span>${esc(label)}</span><textarea rows="${rows}" data-field="${esc(name)}">${esc(value ?? "")}</textarea></label>`;
const select = (name,value,label,items) => `<label class="ag-field"><span>${esc(label)}</span><select data-field="${esc(name)}">${options(items,value)}</select></label>`;
const small = (text)=>`<p class="ag-help">${esc(text)}</p>`;
const act = (name,label,cls="")=>`<button type="button" data-ag-action="${esc(name)}" class="${esc(cls)}">${esc(label)}</button>`;
const csv = arr => arr.join(", ");
const parseCsv = s => [...new Set(String(s).split(/[,\n]/).map(t=>t.trim().toUpperCase()).filter(Boolean))];
const knownRelations = ["belongs_to_region","faction_present","related_location","associated_objective","offers_objective","available_facility","map_view"];
const relationshipFields = [
 ["faction_present","Faction IDs (FACTION-*)"],
 ["related_location","Related Locations (LOC-*)"],
 ["associated_objective","Associated Objectives (QUEST-*, CONTRACT-*, ORDER-*)"],
 ["offers_objective","Objectives offered here (QUEST-*, CONTRACT-*, ORDER-*)"],
 ["available_facility","Facilities (FAC-*)"]
];
const listRefs = (rec,relation) => rec.refs.filter(r=>r.relation===relation).map(r=>r.target_id);
const formRefs = replaceRelationRefs;
const isGm = () => !!game.user?.isGM;
const regionRecords = () => docs().filter(d=>d.record.kind==="region").map(d=>d.record);
const allRecords = () => docs().map(d=>d.record);
// AG-WORK-0007: owner-only source provider. Never returns Location campaign
// reveal state; resolver consumes minimal bindings only. GM-only source.
const locationProvider=createLocationProvider({getLocations:()=>docs(),isGM:()=>isGm()});
const resolverConnections=createResolverConnections(locationProvider);
const objectiveLinkCheck=(id=null)=>checkObjectiveLinks({
  records:id ? [sourceData(fromId(id)).record] : allRecords(),
  modules:game.modules, isGM:()=>isGm()
});
// GM-only world Journal: Foundry world settings can be readable by all clients.
// Map bindings should not expose undiscovered region associations through settings.
const mapRegistryJournal = () => game.journal.filter(j=>j.getFlag(MODULE_ID,'role')==='map_registry')[0]??null;
const readMaps = () => clone(mapRegistryJournal()?.getFlag(MODULE_ID,'map_registry')??emptyMapRegistry());
async function writeMaps(next,expectedRevision){
  ensureGm();
  const currentDoc=mapRegistryJournal();
  const now=readMaps();
  if(now.revision!==expectedRevision)throw new Error('Maps were modified by another GM. Reopen Map Manager before saving.');
  const errors=validateMapRegistry(next,allRecords(),game.scenes.contents.map(s=>s.id));
  if(errors.length)throw new Error(errors.join('\n'));
  next.revision=now.revision+1;
  if(currentDoc)await currentDoc.update({[`flags.${MODULE_ID}.map_registry`]:next});
  else await JournalEntry.create({
    name:'AG Data • Map Registry',ownership:ownedStatus,folder:await ensureLocationJournalFolder('map_registry'),
    flags:{[MODULE_ID]:{role:'map_registry',map_registry:next}}
  });
  return next.revision;
}
function requireHierarchy(record,others=allRecords()){
  const candidates=others.filter(r=>r.id!==record.id).concat([record]);
  const errors=validateRegionHierarchy(candidates,{allowMissing:true});
  // Preserve v0.2's ability to draft an ordinary Location before its Region exists.
  // A Region's own parent must already be a saved Region; no invented parents.
  if(record.kind==='region' && regionRef(record) && !candidates.some(r=>r.id===regionRef(record)&&r.kind==='region'))
    errors.push('Parent Region must be a saved LOC-* Region.');
  if(errors.length)throw new Error(errors.join("\n"));
}
const ensureGm = () => {if(!isGm())throw new Error("Only the GM can manage Location definitions.");};
const ownedStatus = {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE};
const journalFormat = () => CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;

async function saveWorld(record,state,expectedRev=null,options={}) {
  ensureGm();
  const errs=validateLocation(record); if(errs.length)throw new Error(errs.join("\n"));
  if(!options.skipHierarchy)requireHierarchy(record);
  if(record.kind!=="region" && !regionRef(record)) notify.warn("Location has no primary Region; allowed for drafts.");
  const previous=fromId(record.id);
  if(!previous){
    const created=await JournalEntry.create({
      name:`AG Data • ${record.name}`,ownership:ownedStatus,folder:await ensureLocationJournalFolder("source"),
      flags:{[MODULE_ID]:{role:"source",record:clone(record),state:normalizeState(state),revision:1,published_revision:0,published_journal_id:null}}
    });
    resolverConnections.refresh();
    return {journal:created, revision:1};
  }
  const current=sourceData(previous);
  if(expectedRev!==null && current.revision!==expectedRev)throw new Error(`Location was edited elsewhere (world revision ${current.revision}). Reopen before saving.`);
  const changed=JSON.stringify(current.record)!==JSON.stringify(record) || JSON.stringify(current.state)!==JSON.stringify(normalizeState(state));
  if(!changed)return {journal:previous,revision:current.revision};
  const revision=current.revision+1;
  await previous.update({name:`AG Data • ${record.name}`,
    [`flags.${MODULE_ID}.record`]:clone(record),
    [`flags.${MODULE_ID}.state`]:normalizeState(state),
    [`flags.${MODULE_ID}.revision`]:revision
  });
  resolverConnections.refresh();
  return {journal:previous,revision};
}

async function publishLocation(source) {
  ensureGm();
  const {record,state,revision,projectedId}=sourceData(source);
  const html=playerHtml(record,state);
  let publicJournal=projectedId ? game.journal.get(projectedId) : null;
  if(publicJournal && publicJournal.getFlag(MODULE_ID,"role")!=="projection") throw new Error("Linked Journal is not managed by Locations; publish stopped.");
  if(!publicJournal){
    publicJournal=await JournalEntry.create({name:record.name,ownership:ownedStatus,folder:await ensureLocationJournalFolder("projection"),
      flags:{[MODULE_ID]:{role:"projection",location_ref:record.id}}});
    await source.update({[`flags.${MODULE_ID}.published_journal_id`]:publicJournal.id});
  }
  const managed=publicJournal.pages.filter(page=>page.getFlag(MODULE_ID,"managed") === true);
  if(managed.length>1) throw new Error("Multiple managed pages exist; manual review required.");
  if(managed.length){
    await publicJournal.updateEmbeddedDocuments("JournalEntryPage", [{_id:managed[0].id,name:"Location Information",type:"text",text:{content:html,format:journalFormat()}}]);
  } else {
    await publicJournal.createEmbeddedDocuments("JournalEntryPage",[{name:"Location Information",type:"text",text:{content:html,format:journalFormat()},flags:{[MODULE_ID]:{managed:true}}}]);
  }
  await publicJournal.update({name:record.name});
  await source.update({[`flags.${MODULE_ID}.published_revision`]:revision});
  return publicJournal;
}

function runAction(root,handler){
  root.addEventListener("click",event=>{
    const target=event.target.closest("[data-ag-action]");if(!target)return;
    event.preventDefault();
    Promise.resolve().then(()=>{ensureGm();return handler(target.dataset.agAction,target,event);}).catch(err=>{console.error(`${MODULE_ID}:`,err);notify.error(err.message??String(err))});
  });
}
class SimpleApp extends BaseApp {
  static DEFAULT_OPTIONS = {classes:["ag-app","ag-locations-app"],window:{resizable:true},position:{width:870,height:690}};
  async _renderHTML(){ensureGm();const div=document.createElement("div");div.className="ag-root";div.innerHTML=this.html();return div;}
  _replaceHTML(result,content){content.replaceChildren(result);}
  _onRender(context,options){ensureGm();super._onRender(context,options);const root=this.element.querySelector(".ag-root");if(!root)return;
    runAction(root,(action,el,event)=>this.action(action,el,event));this.events(root);}
  events(root){}
  action(action,el,event){ensureGm();}
  async close(options={}) {
    if (this instanceof LocationEditor && this.dirty) {
      const proceed = await DialogV2.confirm({
        window:{title:"Discard unsaved Location edits?"},
        content:`<p>Close ${esc(this.draft.name)} without saving your changes?</p>`,
        yes:{label:"Discard Changes"}, no:{label:"Keep Editing"}, rejectClose:false
      });
      if(!proceed) return this;
    }
    return super.close(options);
  }
}

class LocationLibrary extends SimpleApp {
  static DEFAULT_OPTIONS={id:"ag-locations-library",window:{title:"Ashen Gate • Location Library"},position:{width:875,height:680}};
  constructor(opts={}){super(opts);this.query="";this.regionFilter="";this.tierFilter="";this.levelFilter="";this.collapsedGroups=new Set();this.libraryTab="library";}
  html(){
    const list=docs();const allRegions=list.filter(x=>x.record.kind==="region");
    const filtered=list.filter(({record:r})=>{
      const q=this.query.toLowerCase();if(q && !`${r.id} ${r.name} ${r.description.player} ${r.description.gm} ${r.kind} ${r.gathering_tier}`.toLowerCase().includes(q))return false;
      if(this.regionFilter && !regionDescendsFrom(r.kind==="region"?r.id:regionRef(r),this.regionFilter,list.map(d=>d.record)))return false;
      if(this.tierFilter && r.gathering_tier!==this.tierFilter)return false;
      if(this.levelFilter){const level=Number(this.levelFilter);if((r.level_min??1)>level || (r.level_max??20)<level)return false;}
      return true;
    }).sort((a,b)=>a.record.name.localeCompare(b.record.name));
    return `<header class="ag-header ag-head"><div><h2>Ashen Gate | Locations</h2><p>Location Library • GM management</p></div><div class="ag-actions"><span class="ag-version">v${MODULE_VERSION} Alpha</span>${act("help","Help")}</div></header>
    <nav class="ag-tabs" aria-label="Location library"><button type="button" data-ag-action="library-tab" data-tab="library" class="${this.libraryTab==="library"?"active":""}">Library</button><button type="button" data-ag-action="library-tab" data-tab="maps" class="${this.libraryTab==="maps"?"active":""}">Maps</button></nav>
    ${this.libraryTab==="maps"?`<section class="ag-map-library"><div class="ag-sectionbar"><h3>Registered Maps</h3>${act("open-maps","Open Map Manager","ag-primary")}</div>${readMaps().maps.map(m=>`<div class="ag-map-list-row"><strong>${esc(m.name)}</strong><span>${esc(m.id)} · ${esc(game.scenes.get(m.scene_id)?.name??"Unlinked Scene")} · ${(m.overlays??[]).length} overlays</span><button type="button" data-ag-action="edit-map" data-id="${esc(m.id)}">Manage</button></div>`).join("")||`<p class="ag-empty">No Maps registered yet. Open Map Manager to register an existing Scene and its overlays.</p>`}</section><footer class="ag-bottom"><span>Map metadata only; Locations own resources and discovery.</span></footer>`:`<div class="ag-toolbar"><input aria-label="Search locations" placeholder="Search by name or ID…" id="ag-query" value="${esc(this.query)}">
    <select id="ag-filter-region"><option value="">All Regions</option>${options(allRegions.map(x=>[x.record.id,x.record.name]),this.regionFilter)}</select>
    <select id="ag-filter-tier"><option value="">All Gathering Tiers</option>${options(TIERS.slice(1).map(t=>[t,t]),this.tierFilter)}</select>
    <input type="number" min="1" max="20" id="ag-filter-level" placeholder="Level" value="${esc(this.levelFilter)}">
    <div class="ag-toolbar-actions">${act("clear-filters","Clear Filters")}${act("new","+ New","ag-primary")}${act("more","⋯ More")}</div></div>
    <section class="ag-table">${this.groupedRows(filtered,allRegions)}</section>
    <footer class="ag-bottom"><span>${filtered.length} of ${list.length} Locations</span><span>Journal publication is always a separate GM action.</span></footer>`}
    <input type="file" id="ag-import-file" accept=".json,application/json" hidden>`;
  }
  groupedRows(filtered,allRegions){
    if(!filtered.length) return '<p class="ag-empty">No matching Locations. Clear filters or create a new Location.</p>';
    const byRegion=new Map();
    for(const row of filtered){
      const region=row.record.kind==="region"?"__regions__":(regionRef(row.record)||"__none__");
      if(!byRegion.has(region))byRegion.set(region,[]);
      byRegion.get(region).push(row);
    }
    const groups=[...byRegion.entries()].sort(([a],[b])=>{
      const label = id => id==="__regions__"?"0 Regions":id==="__none__"?"z Unassigned":allRegions.find(r=>r.record.id===id)?.record.name??id;
      return label(a).localeCompare(label(b));
    });
    return groups.map(([region,rows])=>{
      if(region==='__regions__')rows.sort((a,b)=>(regionPath(a.record.id,allRegions.map(d=>d.record))||a.record.name).localeCompare(regionPath(b.record.id,allRegions.map(d=>d.record))||b.record.name));
      const label=region==="__regions__"?"Regions (parent → subregion)":region==="__none__"?"Unassigned":regionPath(region,allRegions.map(d=>d.record))||region;
      return `<details class="ag-region-group" data-ag-region="${esc(region)}" ${this.collapsedGroups.has(region)?"":"open"}>
      <summary>${esc(label)} <small>(${rows.length})</small></summary>
      <div class="ag-table-head"><span>LOCATION</span><span>REGION</span><span>LEVEL</span><span>TIER</span><span></span></div>
      ${rows.map(x=>{const r=x.record,rr=allRegions.find(y=>y.record.id===regionRef(r));return `<div class="ag-table-row"><div><strong>${esc(r.name)}</strong><small>${esc(r.id)} ${r.kind==="region"?"• Region · "+esc(regionPath(r.id,allRegions.map(d=>d.record))):""}</small></div><span>${esc(regionPath(regionRef(r),allRegions.map(d=>d.record))||"—")}</span><span>${r.level_min||"—"}${r.level_max?`–${r.level_max}`:""}</span><span>${esc(r.gathering_tier||"—")}</span><button type="button" data-ag-action="edit" data-id="${esc(r.id)}">Edit</button></div>`}).join("")}</details>`;
    }).join("");
  }
  events(root){
    root.addEventListener("toggle",e=>{const item=e.target;if(!item?.matches?.("details.ag-region-group"))return;
      if(item.open)this.collapsedGroups.delete(item.dataset.agRegion);else this.collapsedGroups.add(item.dataset.agRegion);
    },true);
    root.querySelector("#ag-query")?.addEventListener("input",e=>{
      this.query=e.target.value;clearTimeout(this.searchTimer);
      const cursor=e.target.selectionStart;
      this.searchTimer=setTimeout(async()=>{await this.render();
        const q=this.element?.querySelector("#ag-query");q?.focus();if(q && Number.isInteger(cursor))q.setSelectionRange(cursor,cursor);
      },230);
    });
    const filters={"ag-filter-region":"regionFilter","ag-filter-tier":"tierFilter","ag-filter-level":"levelFilter"};
    for(const [id,key] of Object.entries(filters))root.querySelector(`#${id}`)?.addEventListener("change",e=>{this[key]=e.target.value;this.render()});
    root.querySelector("#ag-import-file")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;
      try{if(f.size>3_000_000)throw new Error("Import exceeds alpha 3 MB limit.");await importFile(await f.text());await this.render();}
      catch(err){console.error(err);notify.error(err.message);}finally{e.target.value="";}
    });
  }
  async action(name,el){
    ensureGm();
    switch(name){
      case "clear-filters": this.query="";this.regionFilter="";this.tierFilter="";this.levelFilter="";return this.render();
      case "library-tab": this.libraryTab=el.dataset.tab;return this.render();
      case "open-maps": return new MapManager().render(true);
      case "edit-map": return new MapManager(el.dataset.id).render(true);
      case "help": return showHelp();
      case "more": {
        const result=await DialogV2.wait({window:{title:"Location Library Tools"},content:"<p>Choose a Location library action. Imports do not publish Journals.</p>",buttons:[{action:"import",label:"Import Locations JSON"},{action:"export",label:"Export Locations JSON"},{action:"audit",label:"Check Location Links"},{action:"audit-objectives",label:"Check Objective Targets"},{action:"cancel",label:"Cancel"}],rejectClose:false});
        if(result==="import") this.element.querySelector("#ag-import-file")?.click();
        if(result==="export") exportFile();
        if(result==="audit-objectives") {
          const checked=await objectiveLinkCheck();
          const errors=checked.filter(x=>x.status!=="ok");
          const counts=new Map();for(const x of checked)counts.set(x.status,(counts.get(x.status)??0)+1);
          const summary=[...counts].map(([status,n])=>`${esc(status)}: ${n}`).join(' · ');
          const body=`<p>${checked.length} typed Objective link(s) checked. ${summary||"No Objective references."}</p>
            ${errors.length?`<ul>${errors.slice(0,30).map(x=>`<li>${esc(x.location_ref)}: ${esc(x.relation)} → ${esc(x.target_id)} (${esc(x.status)})</li>`).join("")}</ul>`:""}
            <p>Quest Manager owns Objective permissions and reveal. Unavailable/unsupported means no verification, not a broken reference. No Quest or Location data was changed.</p>`;
          await DialogV2.prompt({window:{title:"Locations — Objective Link Check"},content:body,ok:{label:"Close"}});
        }
        if(result==="audit") {
          const issues=auditLocationRefs(allRecords());
          const body=issues.length?`<p>${issues.length} local link warning(s). These are advisory and no records were changed.</p><ul>${issues.slice(0,30).map(x=>`<li>${esc(x.location_ref)}: ${esc(x.relation)} → ${esc(x.target_id)} (${esc(x.reason)})</li>`).join("")}</ul>${issues.length>30?`<p>Showing first 30.</p>`:""}`:`<p>No local Location or Objective-ID format problems found. External Objective, Faction, Facility and Material targets are <strong>not verified</strong> until their owning resolver interfaces are available.</p>`;
          await DialogV2.prompt({window:{title:"Location Links — Local Checks"},content:body,ok:{label:"Close"}});
        }
        return;
      }
      case "new": {
        const result=await DialogV2.input({window:{title:"New Location ID"},content:'<label>Permanent Location ID (LOC-*)<input name="id" required placeholder="LOC-YOUR-SITE-001"></label>',ok:{label:"Create"}});
        if(!result)return;const id=String(result.id??"").trim().toUpperCase();
        if(!LOCATION_PATTERN.test(id))throw new Error("Use a permanent ID like LOC-YOUR-SITE-001.");
        if(fromId(id))throw new Error("That Location ID already exists.");
        new LocationEditor(id).render(true);break;
      }
      case "edit": new LocationEditor(el.dataset.id).render(true);break;
      case "export": exportFile();break;
      case "import": this.element.querySelector("#ag-import-file")?.click();break;
    }
  }
}

function stateCheckbox(category,key,rawState){const s=normalizeState(rawState);return `<input type="checkbox" data-reveal-category="${esc(category)}" data-reveal-key="${esc(key)}" ${s[category]?.includes(key)?"checked":""} title="Reveal in the published player journal">`;}
function summaryTab(rec){
  const all=docs().filter(x=>x.record.kind==='region' && x.record.id!==rec.id &&
    (rec.kind!=='region'||!regionDescendsFrom(x.record.id,rec.id,allRecords())));
  return `<div class="ag-two">${field("name",rec.name,"Name")}${select("kind",rec.kind,"Category",[["location","Location"],["region","Region"]])}
  ${field("id",rec.id,"Permanent ID",{readonly:true})}${select("status",rec.status,"Source status",STATUSES.map(x=>[x,x]))}
  ${select("region",regionRef(rec),rec.kind==="region"?"Parent Region (optional)":"Primary Region",[["","Not assigned"],...all.map(x=>[x.record.id,regionPath(x.record.id,all.map(y=>y.record))||x.record.name])])}
  ${select("visibility",rec.visibility,"Definition visibility",VISIBILITY.map(x=>[x,x]))}
  ${field("level_min",rec.level_min,"Recommended level (min)",{type:"number"})}${field("level_max",rec.level_max,"Recommended level (max)",{type:"number"})}
  ${select("gathering_tier",rec.gathering_tier,"Gathering Tier",TIERS.map(t=>[t,t||"Not specified"]))}${field("version",rec.version,"Content version")}</div>
  ${field("image",rec.image,"Optional image path / URL")}
  ${textarea("player_desc",rec.description.player,"Player-facing description",5)}
  ${textarea("gm_desc",rec.description.gm,"GM-only notes (never added to player journal)",5)}
  ${small("A Region may have one parent Region. Ordinary Locations have one primary Region. Neither resource availability nor campaign state is inherited. GM notes stay private.")}`;
}
function resourcesTab(rec,state){
  return `<div class="ag-sectionbar"><div><h3>Available Materials</h3>${small("Scarce / Common / Abundant. No stock or depletion automation.")}</div>${act("add-resource","+ Resource")}</div>
  <div class="ag-column-head ag-resource"><span>Material ID</span><span>Abundance</span><span>Reveal</span><span></span></div>
  ${rec.resources.map((r,i)=>`<div class="ag-resource ag-entry"><input aria-label="Material ID" data-resource="${i}" data-prop="material_ref" value="${esc(r.material_ref)}" placeholder="MAT-...">
  <select data-resource="${i}" data-prop="abundance">${options(ABUNDANCE.map(a=>[a,a]),r.abundance)}</select>
  ${stateCheckbox("revealed_resources",r.id,state)}<button type="button" data-ag-action="remove-resource" data-index="${i}" title="Remove">×</button><small class="ag-subkey">${esc(r.id)}</small></div>`).join("")||'<p class="ag-empty">No materials assigned.</p>'}`;
}
function connectionsTab(rec,state){
  const rows=relationshipFields.map(([rel,label])=>{
    const ids=listRefs(rec,rel),visible=rec.refs.filter(r=>r.relation===rel);
    return `<div class="ag-connection"><label class="ag-field"><span>${esc(label)}</span><input data-refs="${esc(rel)}" value="${esc(csv(ids))}" placeholder="Comma-separated IDs"></label>
    <div class="ag-reveal-list">${visible.map(x=>`<div class="ag-ref-control"><label>${stateCheckbox("revealed_refs",refKey(x),state)} <small>${esc(x.target_id)} — Journal</small></label><label class="ag-mode-label">Mode <select aria-label="Reference mode for ${esc(x.target_id)}" data-ref-mode="${esc(rel)}" data-ref-id="${esc(x.target_id)}">${options([["optional","Optional"],["required","Required"]],x.mode)}</select></label></div>`).join("")}</div></div>`;
  }).join("");
  const others=rec.refs.filter(x=>!knownRelations.includes(x.relation));
  return `${small("References keep source IDs and required/optional modes. Associated means linked context; Offered means available at this Location. Neither grants, accepts, or advances Objectives. The Quest Manager owns Objective state. Journal checkboxes affect only the published player page.")}${rows}
  ${textarea("extra_refs",others.map(r=>`${r.relation}, ${r.target_id}, ${r.mode}`).join("\n"),"Other typed references: relation, ID, mode (one per line)",3)}
  <div class="ag-sectionbar"><h3>Points of Interest</h3>${act("add-poi","+ Point of Interest")}</div>
  ${rec.points_of_interest.map((p,i)=>`<div class="ag-poi ag-entry">
    <div class="ag-entry-top"><input data-poi="${i}" data-prop="title" value="${esc(p.title)}" placeholder="Name / feature">
    <label>${stateCheckbox("revealed_pois",p.key,state)} Show to players</label>${act("remove-poi","Remove") .replace('data-ag-action=',`data-index="${i}" data-ag-action=`)}</div>
    <textarea data-poi="${i}" data-prop="description" rows="2" placeholder="Short description">${esc(p.description)}</textarea>
    <input data-poi="${i}" data-prop="reference" value="${esc(p.reference)}" placeholder="Optional Foundry UUID or source ID">
    <small>${esc(p.key)}</small></div>`).join("")||'<p class="ag-empty">No points of interest.</p>'}`;
}
function scenesTab(rec){
  const matches=readMaps().maps.filter(m=>m.region_id===rec.id || m.overlays.some(o=>o.region_id===rec.id));
  return `<div class="ag-sectionbar"><div><h3>Registered Maps</h3>${small("Link Regions to registered map overlays; overlay visibility stays separate from discovery and Journals.")}</div>${act("open-maps","Open Map Manager")}</div>
  ${matches.length?matches.map(m=>`<div class="ag-map-list-row"><strong>${esc(m.name)}</strong><span>${esc(m.id)}</span><button type="button" data-ag-action="manage-map" data-id="${esc(m.id)}">Manage</button></div>`).join(""):`<p class="ag-empty">No registered Maps linked to this Location yet.</p>`}
  ${field("map_refs",csv(listRefs(rec,"map_view")),"Associated Map IDs (MAP-*, comma-separated)")}
  ${small("Use Foundry Scenes and Journal pins for actual placements/visibility. These are optional links only; no automatic tokens or map-note placement.")}
  <div class="ag-sectionbar"><h3>Maps & Scenes</h3>${act("add-scene","+ Scene reference")}</div>
  ${rec.scenes.map((x,i)=>`<div class="ag-scene ag-entry"><input data-scene="${i}" data-prop="label" value="${esc(x.label)}" placeholder="Label">
  <input data-scene="${i}" data-prop="uuid" value="${esc(x.uuid)}" placeholder="Scene UUID: Scene.ABC...">
  <button type="button" data-ag-action="remove-scene" data-index="${i}">×</button></div>`).join("")||'<p class="ag-empty">No Scene links.</p>'}`;
}
function previewTab(rec,state,publication,publishReady){
  const player=playerHtml(rec,state);
  return `<div class="ag-sectionbar"><div><h3>Journal Preview</h3><p class="ag-help">Preview reflects only player-facing content and revealed entries.</p></div>
  </div>
  <div class="ag-preview-status">${esc(publication)}</div><article class="ag-journal-preview">${player}</article>
  ${small("Publishing creates/updates a separate Journal for map pins. All custom Journal pages are preserved. Player access is controlled by native Foundry Journal permissions, and defaults to GM-only.")}`;
}
class LocationEditor extends SimpleApp {
  static DEFAULT_OPTIONS={window:{title:"Ashen Gate • Location Editor"},position:{width:910,height:760}};
  constructor(id){super({id:`ag-location-editor-${id.toLowerCase()}`});this.locationId=id;
    const src=fromId(id);const data=src?sourceData(src):null;
    this.draft=data?.record ?? createLocation(id);this.reveal=data?.state ?? emptyState();
    this.loadedRevision=data?.revision ?? 0;this.previewedRevision=null;this.tab="overview";
  }
  get dirty(){const src=fromId(this.locationId);if(!src)return true;const d=sourceData(src);return JSON.stringify(d.record)!==JSON.stringify(this.draft)||JSON.stringify(d.state)!==JSON.stringify(normalizeState(this.reveal));}
  html(){const src=fromId(this.locationId),data=src?sourceData(src):null;
    const canPublish=!!data && !this.dirty && this.previewedRevision===data.revision;
    const canPreview=!!data&&!this.dirty;
    const hasPublished=!!(data?.projectedId&&game.journal.get(data.projectedId));
    const tabs=[["overview","Overview"],["resources","Resources"],["connections","Connections"],["scenes","Maps & Scenes"],["preview","Journal Preview"]];
    let body="";
    if(this.tab==="overview")body=summaryTab(this.draft);
    if(this.tab==="resources")body=resourcesTab(this.draft,this.reveal);
    if(this.tab==="connections")body=connectionsTab(this.draft,this.reveal);
    if(this.tab==="scenes")body=scenesTab(this.draft);
    if(this.tab==="preview")body=previewTab(this.draft,this.reveal,!data?"Unsaved Location":this.dirty?"Unsaved changes — save first":this.previewedRevision===data.revision?"Preview reviewed — ready to publish":"Click Preview saved Location before publishing",canPublish);
    return `<header class="ag-header ag-head"><div><h2>Ashen Gate | Locations</h2><p>${esc(this.draft.name)} · ${esc(this.draft.id)} · World revision ${data?.revision??"unsaved"}</p></div><div class="ag-actions"><span class="ag-version">v${MODULE_VERSION} Alpha</span>${act("help","Help")}</div></header>
    <nav class="ag-tabs">${tabs.map(([key,label])=>`<button type="button" data-ag-action="tab" data-tab="${key}" class="${this.tab===key?"active":""}">${label}</button>`).join("")}</nav>
    <div class="ag-editor-content">${body}</div><footer class="ag-bottom ag-editor-footer">
      <div class="ag-footer-left">${act("back","Back / Cancel")}<span>${this.dirty ? "Unsaved changes" : "Saved"}</span></div>
      <div class="ag-footer-right">${this.tab==="preview"?`<button type="button" data-ag-action="open-journal" ${hasPublished?'':'disabled'}>Open Journal</button><button type="button" data-ag-action="preview" ${canPreview?'':'disabled'}>Preview Saved</button><button type="button" data-ag-action="publish" class="${canPublish?'ag-primary':''}" ${canPublish?'':'disabled'}>Publish</button>`:act("save","Save Changes","ag-primary")}</div>
    </footer>`;
  }
  events(root){
    root.addEventListener("input",e=>this.consume(e.target));root.addEventListener("change",e=>this.consume(e.target));
  }
  consume(t){
    if(t.dataset?.field!==undefined){
      const f=t.dataset.field,v=t.value;
      if(f==="id")return;
      if(f==="region"){formRefs(this.draft,"belongs_to_region",v?[v]:[]);}
      else if(f==="map_refs"){formRefs(this.draft,"map_view",parseCsv(v));}
      else if(f==="player_desc")this.draft.description.player=v;
      else if(f==="gm_desc")this.draft.description.gm=v;
      else if(f==="extra_refs"){
        this.extraRefsText=v;return; // Parsed and validated only when leaving field via save/tab action
      }
      else if(["level_min","level_max"].includes(f))this.draft[f]=v===""?null:Number(v);
      else this.draft[f]=v;
      this.previewedRevision=null;
    }
    if(t.dataset?.resource!==undefined){this.draft.resources[Number(t.dataset.resource)][t.dataset.prop]=t.value;this.previewedRevision=null;}
    if(t.dataset?.poi!==undefined){this.draft.points_of_interest[Number(t.dataset.poi)][t.dataset.prop]=t.value;this.previewedRevision=null;}
    if(t.dataset?.scene!==undefined){this.draft.scenes[Number(t.dataset.scene)][t.dataset.prop]=t.value;this.previewedRevision=null;}
    if(t.dataset?.refs!==undefined){formRefs(this.draft,t.dataset.refs,parseCsv(t.value));this.previewedRevision=null;}
    if(t.dataset?.refMode!==undefined){
      const ref=this.draft.refs.find(r=>r.relation===t.dataset.refMode&&r.target_id===t.dataset.refId);
      if(ref && ["required","optional"].includes(t.value)){ref.mode=t.value;this.previewedRevision=null;}
    }
    if(t.dataset?.revealCategory!==undefined){const c=t.dataset.revealCategory,key=t.dataset.revealKey;
      const s=new Set(this.reveal[c]??[]);if(t.checked)s.add(key);else s.delete(key);this.reveal[c]=[...s];this.previewedRevision=null;}
  }
  parseExtraRefs(){
    if(this.extraRefsText===undefined)return;
    const other=[];
    for(const line of this.extraRefsText.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){
      const bits=line.split(",").map(x=>x.trim());
      if(bits.length!==3 || !bits[0] || !ID_PATTERN.test(bits[1]) || !["required","optional"].includes(bits[2]))throw new Error(`Invalid extra ref: ${line}`);
      if(knownRelations.includes(bits[0]))throw new Error(`Use the dedicated field for ${bits[0]}.`);
      other.push({relation:bits[0],target_id:bits[1],mode:bits[2]});
    }
    this.draft.refs=this.draft.refs.filter(r=>knownRelations.includes(r.relation)).concat(other);
    this.extraRefsText=undefined;
  }
  async action(action,el){
    ensureGm();
    if(action==="help")return showHelp();
    if(action==="open-maps")return new MapManager().render(true);
    if(action==="manage-map")return new MapManager(el.dataset.id).render(true);
    if(action==="back"){await this.close();return;}
    if(action==="tab"){this.parseExtraRefs();this.tab=el.dataset.tab;await this.render();return;}
    if(action==="add-resource")this.draft.resources.push({id:nextResourceId(this.draft),material_ref:"",abundance:"common"});
    else if(action==="remove-resource"){
      const r=this.draft.resources.splice(Number(el.dataset.index),1)[0];this.reveal.revealed_resources=this.reveal.revealed_resources.filter(id=>id!==r.id);
    }
    else if(action==="add-poi")this.draft.points_of_interest.push({key:nextPoiKey(this.draft),title:"",description:"",reference:""});
    else if(action==="remove-poi"){
      const p=this.draft.points_of_interest.splice(Number(el.dataset.index),1)[0];this.reveal.revealed_pois=this.reveal.revealed_pois.filter(id=>id!==p.key);
    }
    else if(action==="add-scene")this.draft.scenes.push({uuid:"",label:""});
    else if(action==="remove-scene")this.draft.scenes.splice(Number(el.dataset.index),1);
    else if(action==="save"){
      if(!this.loadedRevision && fromId(this.locationId))throw new Error("Location was created by another GM. Reopen before saving.");
      this.parseExtraRefs();const data=await saveWorld(this.draft,this.reveal,this.loadedRevision||null);
      this.loadedRevision=data.revision;this.previewedRevision=null;notify.info(`Saved ${this.draft.id} at revision ${data.revision}.`);
      for(const lib of LocationLibrary.instances())if(lib.rendered)lib.render();
    }
    else if(action==="preview"){
      if(this.dirty)throw new Error("Save changes before previewing the published journal.");
      const src=fromId(this.locationId);if(!src)throw new Error("Save the Location first.");
      this.previewedRevision=sourceData(src).revision;notify.info("Preview ready. Check the player-visible content before publishing.");
    }
    else if(action==="publish"){
      const src=fromId(this.locationId);if(!src||this.dirty||this.previewedRevision!==sourceData(src).revision)throw new Error("Save and preview the current revision first.");
      const yes=await DialogV2.confirm({window:{title:"Publish Location Journal?"},content:`<p>Publish <strong>${esc(this.draft.name)}</strong> (rev ${this.loadedRevision}) to its Foundry Journal? Only the managed page is updated; custom pages are preserved.</p><p><strong>Player visibility still depends on native Journal permissions.</strong></p>`,rejectClose:false});
      if(!yes)return;
      const now=fromId(this.locationId);if(sourceData(now).revision!==this.previewedRevision)throw new Error("World record changed after preview. Preview again.");
      await publishLocation(now);notify.info("Journal published. Place its Journal Note on Scenes manually.");
    }
    else if(action==="open-journal"){
      const src=fromId(this.locationId);const id=src?.getFlag(MODULE_ID,"published_journal_id");const journal=id?game.journal.get(id):null;
      if(!journal)throw new Error("No published Journal yet. Save, preview and publish first.");
      journal.sheet.render(true);return;
    }
    this.previewedRevision=(action.startsWith("add-")||action.startsWith("remove-"))?null:this.previewedRevision;
    await this.render();
  }
}

/* Registered maps are spatial bindings, not a source of Location or discovery state. */
class MapManager extends SimpleApp {
  static DEFAULT_OPTIONS={id:'ag-locations-map-manager',window:{title:'Ashen Gate | Maps & Scenes'},position:{width:940,height:710}};
  constructor(mapId=null){
    super();const reg=readMaps();this.mapId=mapId??reg.maps[0]?.id??'';
    this.baseRevision=reg.revision;
    this.draft=clone(reg.maps.find(m=>m.id===this.mapId)??newMap('',''));
    this.pristine=JSON.stringify(this.draft);
    this.busy=false;
  }
  get dirty(){return JSON.stringify(this.draft)!==this.pristine;}
  async close(options={}){
    if(this.dirty){
      const okay=await DialogV2.confirm({window:{title:'Discard Map changes?'},content:'<p>Discard your unsaved map settings and Tile bindings?</p>',rejectClose:false});
      if(!okay)return this;
    }
    return super.close(options);
  }
  switchTo(mapId){
    const reg=readMaps();this.baseRevision=reg.revision;this.mapId=mapId;
    this.draft=clone(reg.maps.find(m=>m.id===mapId)??newMap('',''));
    this.pristine=JSON.stringify(this.draft);
  }
  html(){
    const maps=readMaps().maps;const map=this.draft;
    const regions=regionRecords().sort((a,b)=>a.name.localeCompare(b.name));
    const regionOpts=[['','Not linked'],...regions.map(r=>[r.id,regionPath(r.id,regions)||r.name])];
    const scene=game.scenes.get(map.scene_id);
    const tileOpts=[['','Auto-match filename'],...(scene?.tiles?.contents??[]).map(t=>[t.id,`${fileBasename(t.texture?.src)||'Tile'} · ${t.id}`])];
    const saved=!!maps.find(m=>m.id===map.id),canControl=saved&&!this.dirty&&!!scene&&map.overlays.length>0;
    const rowHtml=(o)=>{
      const matches=scene?matchOverlayTiles(scene,map,o):[];
      const valid=matches.length===1;
      const visible=valid&&!matches[0].hidden;
      const status=!scene?'Choose a Foundry Scene':!matches.length?'Tile missing':matches.length>1?'Multiple Tiles match — bind one':visible?'Shown to players':'Hidden from players';
      return `<div class="ag-map-overlay-row" data-key="${esc(o.key)}">
        <div class="ag-map-overlay-name"><strong>${esc(o.label)}</strong><small>${esc(o.filename)}</small><small>${esc(status)}</small></div>
        <label class="ag-field"><span>Linked Region</span><select data-overlay="${esc(o.key)}" data-prop="region_id">${options(regionOpts,o.region_id)}</select></label>
        <label class="ag-field"><span>Foundry Tile</span><select data-overlay="${esc(o.key)}" data-prop="tile_id">${options(tileOpts,o.tile_id)}</select></label>
        <button type="button" data-ag-action="toggle-overlay" data-key="${esc(o.key)}" ${canControl&&valid?'':'disabled title="Save map and bind one matching Tile first"'}>${visible?'Hide':'Show'}</button>
      </div>`;
    };
    return `<header class="ag-header ag-head"><div><h2>Ashen Gate | Maps & Scenes</h2><p>GM map registry · visual overlays only</p></div><div class="ag-actions"><span class="ag-version">v${MODULE_VERSION} Alpha</span>${act('map-help','Help')}</div></header>
      <nav class="ag-tabs"><span class="ag-tab-static">Map Manager</span></nav>
      <div class="ag-map-toolbar"><label class="ag-field"><span>Select registered map</span><select data-map-switch="true">${options([['','Select a map'],...maps.map(m=>[m.id,`${m.name} (${m.id})`])],this.mapId)}</select></label>${act('new-map','+ Register Map','ag-primary')}<button type="button" data-ag-action="remove-map" ${saved?'':'disabled'}>More…</button></div>
      <div class="ag-editor-content ag-map-content">
      ${map.id?`<div class="ag-two">
        ${field('map-name',map.name,'Map display name')}
        ${field('map-id',map.id,'Permanent Map ID',{readonly:true})}
        ${select('scene-id',map.scene_id,'Foundry Scene',[['','Choose Scene'],...game.scenes.contents.map(s=>[s.id,s.name])])}
        ${select('map-region',map.region_id,'Associated parent Region',regionOpts)}
      </div>
      <div class="ag-sectionbar"><div><h3>Region overlay layers</h3>${small('Register existing tinted PNG Tiles; no map artwork or Location discovery changes. Save bindings before toggling visibility.')}</div>${map.overlays.length===0?act('frontier-preset','Use 7 Frontier Overlays'):''}</div>
      ${map.overlays.length?`<div class="ag-map-overlay-head"><span>REGION OVERLAY</span><span>LOCATION LINK</span><span>SCENE TILE</span><span>VISIBILITY</span></div>${map.overlays.map(rowHtml).join('')}`:'<p class="ag-empty">No overlays. Use the Frontier preset to configure seven existing PNG layers.</p>'}
      <div class="ag-map-note">${esc(map.overlays.length?`${map.overlays.length} overlay layer(s). Use Show All/Hide All to control identified Tiles on the selected Scene.`:'Select the Frontier preset to add filenames; no Location IDs are generated automatically.')}</div>
      <div class="ag-map-bulk"><button type="button" data-ag-action="show-all" ${canControl?'':'disabled'}>Show All</button><button type="button" data-ag-action="hide-all" ${canControl?'':'disabled'}>Hide All</button><button type="button" data-ag-action="view-scene" ${scene?'':'disabled'}>Open Scene</button></div>`:`<p class="ag-empty">No Map selected. Register the Fosstryn Frontier map and choose the Scene where you placed the seven overlays.</p>`}
      </div>
      <footer class="ag-bottom ag-editor-footer"><div class="ag-footer-left">${act('map-close','Close')}<span>${this.dirty?'Unsaved changes':`Registry rev ${this.baseRevision}`}</span></div>
      <div class="ag-footer-right"><button type="button" data-ag-action="save-map" class="ag-primary" ${map.id&&this.dirty?'':'disabled'}>Save Changes</button></div></footer>`;
  }
  events(root){
    root.addEventListener('change',async event=>{
      const t=event.target;
      try{
        if(t.dataset?.mapSwitch!==undefined){
          if(this.dirty){
            const yes=await DialogV2.confirm({window:{title:'Discard unsaved Map edits?'},content:'<p>Switch maps without saving the current changes?</p>',rejectClose:false});
            if(!yes){await this.render();return;}
          }
          this.switchTo(t.value);await this.render();return;
        }
        if(t.dataset?.field!==undefined){
          const v=t.value;
          if(t.dataset.field==='map-name')this.draft.name=v;
          if(t.dataset.field==='scene-id'){
            // Explicit Tile IDs belong to the prior Scene. Clear only those bindings.
            if(this.draft.scene_id!==v)this.draft.overlays.forEach(o=>o.tile_id='');
            this.draft.scene_id=v;
          }
          if(t.dataset.field==='map-region')this.draft.region_id=v;
          await this.render();return;
        }
        if(t.dataset?.overlay!==undefined){
          const o=this.draft.overlays.find(o=>o.key===t.dataset.overlay);if(!o)return;
          o[t.dataset.prop]=t.value;
          await this.render();
        }
      }catch(error){console.error(MODULE_ID,error);notify.error(error.message??String(error));}
    });
  }
  async action(action,el){
    ensureGm();
    if(action==='map-close')return this.close();
    if(this.busy)return;this.busy=true;
    try{
      if(action==='map-help'){
        await DialogV2.prompt({window:{title:'Map Manager — Help'},content:'<p>Register a MAP-* map, link an existing Foundry Scene, then choose the seven-overlay Frontier preset. The program auto-matches the exact PNG basenames or you can select explicit Tile IDs.</p><p>Save Changes before Show/Hide. Players see Tile visibility updates, but region discovery and Location information never change. The map registry is GM-only world data.</p>',ok:{label:'Close'}});return;
      }
      if(action==='new-map'){
        if(this.dirty){const yes=await DialogV2.confirm({window:{title:'Discard Map changes?'},content:'<p>Discard unsaved Map changes?</p>',rejectClose:false});if(!yes)return;}
        const answer=await DialogV2.input({window:{title:'Register a Map'},content:'<label>Map permanent ID (MAP-*)<input name="id" required placeholder="MAP-FOSSTRYN-FRONTIER"></label><label>Map name<input name="name" value="Fosstryn Frontier"></label>',ok:{label:'Create Draft'}});
        if(!answer)return;const id=String(answer.id??'').trim().toUpperCase();
        if(!MAP_PATTERN.test(id))throw new Error('Map permanent ID must look like MAP-FOSSTRYN-FRONTIER.');
        if(readMaps().maps.some(m=>m.id===id))throw new Error('A map with that ID already exists.');
        this.mapId=id;this.baseRevision=readMaps().revision;this.draft=newMap(id,String(answer.name??'').trim()||'New Map');this.pristine='';
      }
      else if(action==='frontier-preset') this.draft=addFrontierPreset(this.draft);
      else if(action==='save-map'){
        const current=readMaps(),old=current.maps.find(m=>m.id===this.mapId);
        if(old)current.maps[current.maps.indexOf(old)]=clone(this.draft);
        else current.maps.push(clone(this.draft));
        const rev=await writeMaps(current,this.baseRevision);
        this.baseRevision=rev;this.pristine=JSON.stringify(this.draft);
        notify.info(`Map ${this.mapId} saved (registry revision ${rev}).`);
        for(const lib of LocationLibrary.instances())if(lib.rendered)lib.render();
      }
      else if(action==='remove-map'){
        if(!this.mapId||!readMaps().maps.some(m=>m.id===this.mapId))return;
        const choice=await DialogV2.wait({window:{title:'Map Manager tools'},content:'<p>Choose a map-management action.</p>',buttons:[{action:'remove',label:'Remove Map…'},{action:'cancel',label:'Cancel'}],rejectClose:false});
        if(choice!=='remove')return;
        if(this.dirty)throw new Error('Save or discard Map edits before removal.');
        const yes=await DialogV2.confirm({window:{title:`Remove Map ${this.mapId}?`},content:`<p>Remove <strong>${esc(this.draft.name)}</strong> (${esc(this.mapId)}) from the Locations registry? Foundry Scenes, Tiles, images and Location records are not deleted.</p>`,rejectClose:false});
        if(!yes)return;
        const current=readMaps();current.maps=current.maps.filter(m=>m.id!==this.mapId);
        await writeMaps(current,this.baseRevision);
        this.switchTo(current.maps[0]?.id??'');notify.info('Map registry entry removed. No Foundry Tiles were deleted.');
        for(const lib of LocationLibrary.instances())if(lib.rendered)lib.render();
      }
      else if(action==='view-scene'){
        const scene=game.scenes.get(this.draft.scene_id);if(!scene)throw new Error('Select an existing Foundry Scene first.');
        await scene.view();
      }
      else if(['toggle-overlay','show-all','hide-all'].includes(action)){
        if(this.dirty)throw new Error('Save Map configuration before changing Tile visibility.');
        if(this.baseRevision!==readMaps().revision)throw new Error('Map registry changed; reopen this window.');
        const scene=game.scenes.get(this.draft.scene_id);if(!scene)throw new Error('Choose a Foundry Scene first.');
        let hidden;
        let keys=null;
        if(action==='toggle-overlay'){
          const overlay=this.draft.overlays.find(o=>o.key===el.dataset.key);
          if(!overlay)throw new Error('Unknown overlay.');
          const matched=matchOverlayTiles(scene,this.draft,overlay);
          if(matched.length!==1)throw new Error('Overlay must match exactly one Tile. Choose its Tile ID.');
          hidden=!matched[0].hidden;keys=[overlay.key];
        }else hidden=action==='hide-all';
        const result=mapOverlayUpdates(scene,this.draft,hidden,keys);
        if(result.ambiguous.length)throw new Error(`Ambiguous tiles: ${result.ambiguous.join(', ')}. Bind them explicitly.`);
        if(result.updates.length)await scene.updateEmbeddedDocuments('Tile',result.updates);
        if(result.missing.length)notify.warn(`Unmatched overlays (not changed): ${result.missing.join(', ')}`);
        else notify.info(`${result.updates.length} region Tile(s) ${hidden?'hidden':'shown'} to players.`);
      }
    }finally{this.busy=false;await this.render();}
  }
}

function exportFile(){
  ensureGm();const entries=docs().sort((a,b)=>a.record.id.localeCompare(b.record.id));
  const payload={format:SOURCE_FORMAT,exported_from:"Foundry world",locations:entries.map(x=>x.record),base_revisions:Object.fromEntries(entries.map(x=>[x.record.id,x.revision]))};
  const file=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(file),a=document.createElement("a");
  a.href=url;a.download="AG_Locations_World_v0.8.0_Source.json";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify.info(`Exported ${entries.length} Location definitions; no campaign reveal state included.`);
}
async function importFile(text){
  ensureGm();const payload=parseImport(JSON.parse(text));const plan=[];
  for(const record of payload.locations){
    const src=fromId(record.id),world=src?sourceData(src):null;
    const decision=syncDecision(record,world,payload.base_revisions?.[record.id]);
    plan.push({record,src,world,decision,resolution:decision});
  }
  const count={create:0,update:0,conflict:0,unchanged:0};plan.forEach(p=>count[p.decision]++);
  const okay=await DialogV2.confirm({window:{title:"Review Location Import"},content:`<p><strong>${plan.length} Locations</strong></p><p>New: ${count.create} · Safe updates: ${count.update} · Conflicts requiring choices: ${count.conflict} · Unchanged: ${count.unchanged}</p><p>This import will <strong>not</strong> change campaign reveal state or publish Journals.</p>`,rejectClose:false});
  if(!okay)return;
  for(const item of plan.filter(p=>p.decision==="conflict")){
    const choice=await DialogV2.wait({window:{title:`Import conflict: ${item.record.id}`},content:`<p><strong>${esc(item.record.name)}</strong> conflicts with world revision ${item.world.revision}. Choose how to resolve it.</p><p>Use Import overwrites the <em>definition only</em> and preserves this world's reveal state and custom Journal pages.</p>`,buttons:[{action:"keep_world",label:"Keep World"},{action:"accept_incoming",label:"Use Import"},{action:"cancel",label:"Cancel entire import"}],rejectClose:false});
    if(!choice || choice==="cancel") {notify.warn("Import cancelled before any changes were made.");return;}
    item.resolution=choice;
  }
  // Resolve the proposed final Location graph before any writes; avoid partial invalid imports.
  const finalRecords=new Map(allRecords().map(r=>[r.id,r]));
  for(const p of plan){if(!["unchanged","keep_world"].includes(p.resolution))finalRecords.set(p.record.id,p.record);}
  const resolved=[...finalRecords.values()];
  const hierarchyErrors=validateRegionHierarchy(resolved,{allowMissing:true});
  for(const r of resolved.filter(r=>r.kind==='region'&&regionRef(r))){
    if(!resolved.some(parent=>parent.id===regionRef(r)&&parent.kind==='region'))
      hierarchyErrors.push(`${r.id}: Parent Region must exist and be a Region.`);
  }
  if(hierarchyErrors.length)throw new Error(`Import hierarchy invalid: ${hierarchyErrors.join("; ")}`);
  // Preflight concurrency: if another GM changes a record before writes, cancel rather than silently overwrite.
  for(const p of plan){if(p.src && sourceData(p.src).revision!==p.world.revision)throw new Error(`Concurrent change detected for ${p.record.id}; restart import.`)}
  let writes=0;
  for(const p of plan){
    if(p.resolution==="unchanged" || p.resolution==="keep_world")continue;
    if(p.decision==="create" && fromId(p.record.id))throw new Error(`Concurrent creation of ${p.record.id}. Import stopped after ${writes} writes.`);
    await saveWorld(p.record,p.world?.state??emptyState(),p.world?.revision??null,{skipHierarchy:true});writes++;
  }
  notify.info(`Imported ${writes} Locations. Journals were not published.`);
}

async function showHelp(){
  return DialogV2.prompt({window:{title:"Ashen Gate | Locations — Help"},content:`<p><strong>Maps:</strong> use the Maps tab to register a Scene and bind existing overlay Tiles. Frontier preset recognizes seven PNG filenames without modifying them.</p><p><strong>Hierarchy:</strong> Regions may have one parent Region and cannot create cycles. No resources are inherited.</p><p><strong>Library:</strong> create, search, filter or import/export Location definitions.</p><p><strong>Editor:</strong> save first; in Journal Preview review the player-facing content; then Publish. Custom Journal pages are preserved.</p><p><strong>Objectives:</strong> Associated and offered Objective references preserve required/optional mode and use permanent IDs. Links do not change Quest progress. Use More → Check Location Links or Check Objective Targets for advisory checks. If Quest Manager is absent, targets are unverified.</p><p><strong>Map pins:</strong> place the published Journal onto a Foundry Scene and use native Journal permissions for player access.</p><p><strong>Support:</strong> This alpha is GM-only and has no required Manager dependency.</p>`,ok:{label:"Close"}});
}
function mountOnItemDirectory(app,html){
  if(!game.user?.isGM)return;
  const root=app?.element ?? html;
  mountLocationLauncher(root,{isGM:true,onOpen:()=>game.modules.get(MODULE_ID)?.api?.openLibrary?.() ?? new LocationLibrary().render(true)});
}
Hooks.on("renderItemDirectory",mountOnItemDirectory);
Hooks.on("renderSidebarTab",(app,html)=>{
  if(app?.tabName==="items" || app?.constructor?.name==="ItemDirectory") mountOnItemDirectory(app,html);
});
Hooks.once("init",()=>{
  // No runtime dependency on Ashen Gate Manager. Any launcher may feature-detect this API.
  game.settings.registerMenu(MODULE_ID,"openLibrary",{
    name:"Location Library",label:"Open Location Library",hint:"Create, edit, import, export and publish Location Journals.",
    icon:"fas fa-map-marked-alt",type:LocationLibrary,restricted:true
  });
});
Hooks.once("ready",()=>{
  const mod=game.modules.get(MODULE_ID);
  if(mod)mod.api={...(mod.api??{}),playerAccess:gmOnlyPlayerAccess(),open:()=>{ensureGm();return new LocationLibrary().render(true);},openLibrary:()=>{ensureGm();return new LocationLibrary().render(true);},openEditor:id=>{ensureGm();return new LocationEditor(id).render(true);},openMaps:(mapId=null)=>{ensureGm();return new MapManager(mapId).render(true);},
    // GM-only domain owner read. Source definition, world revision and state
    // are not published by the resolver. No alternate source database.
    getLocationSource:(id)=>{ensureGm();if(!LOCATION_PATTERN.test(id??""))throw new Error("Expected LOC-* ID.");const journal=fromId(id);return journal?sourceData(journal):null;},
    getLocationObjectiveRefs:(id)=>{ensureGm();if(!LOCATION_PATTERN.test(id??""))throw new Error("Expected LOC-* ID.");const journal=fromId(id);return journal?objectiveRefs(sourceData(journal).record):[];},
    locationResolver:{contract:'ag-locations-provider/0.1-alpha',providerId:MODULE_ID,
      // readEntries is intentionally GM-only and yields *definitions*, not state.
      readEntries:locationProvider.readEntries,
      registerWith:resolver=>{ensureGm();return resolverConnections.connect(resolver);},
      unregisterAll:()=>{ensureGm();resolverConnections.disconnectAll();},
      refresh:()=>{ensureGm();resolverConnections.refresh();}},
    checkObjectiveLinks:async(id=null)=>{ensureGm();if(id!==null && (!LOCATION_PATTERN.test(id)||!fromId(id)))throw new Error('Unknown LOC-* source ID.');return objectiveLinkCheck(id);},
    version:MODULE_VERSION};
  // Install after the first sidebar render too; sidebar render hooks re-mount after future renders.
  if(game.user?.isGM && ui.items?.element) mountOnItemDirectory(ui.items,ui.items.element);
  console.info(`${MODULE_ID} | ready. GM: game.modules.get("${MODULE_ID}").api.openLibrary()`);
});

// Foundry clients receive Journal hooks after other GMs change the source.
// Refresh any locally registered resolver without storing a second index.
for(const hook of ['createJournalEntry','updateJournalEntry','deleteJournalEntry']){
  Hooks.on(hook,(doc,change)=>{
    if(doc?.getFlag?.(MODULE_ID,'role')==='source'||change?.flags?.[MODULE_ID]?.role==='source'){
      try{resolverConnections.refresh();}catch(err){console.warn(`${MODULE_ID}: resolver refresh failed`,err);}
    }
  });
}
