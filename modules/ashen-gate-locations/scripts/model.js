/** Ashen Gate Locations alpha: framework-independent pure model helpers. */
export const MODULE_ID = "ashen-gate-locations";
export const TIERS = ["", "apprentice", "journeyman", "expert", "artisan", "master"];
export const ABUNDANCE = ["scarce", "common", "abundant"];
export const STATUSES = ["proposed", "draft", "approved", "superseded", "retired"];
export const VISIBILITY = ["gm", "player", "reveal_gated"];
export const ID_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
export const LOCATION_PATTERN = /^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const SOURCE_FORMAT = "ag-locations-source/0.1"; // ALPHA transport; not a canonical package manifest
export const clone = value => JSON.parse(JSON.stringify(value));
export const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
export const safePath = value => {
  const s = String(value ?? "").trim();
  // Prevent active schemes and injected navigation; Foundry uses relative file paths.
  return s && !/^(?:javascript|data|vbscript|file):/i.test(s) && !/[<>"'\r\n]/.test(s) ? s : "";
};
export const paragraph = value => esc(value).split(/\r?\n/).join("<br>");
export const refKey = r => `${r.relation}::${r.target_id}`;
// AG-WORK-0007: editing a typed relation must not silently demote a required
// reference to optional. Newly added edges default to optional, pending an
// explicit GM choice. Does not resolve targets or modify another domain's state.
export function replaceRelationRefs(record, relation, targets) {
  const before = (record.refs ?? []).filter(r => r.relation === relation);
  const modes = new Map(before.map(r => [r.target_id, r.mode]));
  const ids = [...new Set(targets.filter(t => typeof t === "string" && t.trim()))];
  record.refs = (record.refs ?? []).filter(r => r.relation !== relation).concat(
    ids.map(target_id => ({relation, target_id, mode:modes.get(target_id) ?? "optional"}))
  );
  return record.refs;
}
export const OBJECTIVE_RELATIONS = Object.freeze(["associated_objective", "offers_objective"]);
export const OBJECTIVE_PATTERN = /^(?:QUEST|ORDER|CONTRACT)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export function objectiveRefs(record) {
  return (record.refs ?? []).filter(r => OBJECTIVE_RELATIONS.includes(r.relation)).map(r => ({...r}));
}
// Local-only, advisory checks. Never assert that a remote Objective/Facility/Material
// is missing just because its owner module isn't installed or the resolver is pending.
export function auditLocationRefs(records) {
  const available = new Map(records.map(r=>[r.id,r]));
  const issues = [];
  for (const record of records) for (const ref of record.refs ?? []) {
    if (ref.relation === "related_location" || ref.relation === "belongs_to_region") {
      if (!available.has(ref.target_id)) issues.push({location_ref:record.id,relation:ref.relation,target_id:ref.target_id,reason:"local_location_not_found",mode:ref.mode});
      else if (ref.relation === "belongs_to_region" && available.get(ref.target_id).kind !== "region") issues.push({location_ref:record.id,relation:ref.relation,target_id:ref.target_id,reason:"target_not_region",mode:ref.mode});
    }
    if (OBJECTIVE_RELATIONS.includes(ref.relation) && !OBJECTIVE_PATTERN.test(ref.target_id)) issues.push({location_ref:record.id,relation:ref.relation,target_id:ref.target_id,reason:"invalid_objective_id",mode:ref.mode});
  }
  return issues;
}

// For a Region, belongs_to_region is its optional parent Region; for ordinary
// Locations, it is the primary Region. Both use the existing typed-ref contract.
export const regionRef = record => (record.refs ?? []).find(r => r.relation === "belongs_to_region")?.target_id ?? "";
export function validateRegionHierarchy(records,{allowMissing=false}={}) {
  const errors=[];const byId=new Map(records.map(r=>[r.id,r]));
  for(const rec of records){
    const parent=regionRef(rec);if(!parent)continue;
    const found=byId.get(parent);
    if(!found){if(!allowMissing)errors.push(`${rec.id}: Region ${parent} was not found.`);continue;}
    if(found.kind!=="region")errors.push(`${rec.id}: Parent ${parent} must have kind region.`);
    const ancestors=new Set([rec.id]);let pointer=parent;
    while(pointer){
      if(ancestors.has(pointer)){errors.push(`${rec.id}: Circular Region hierarchy.`);break;}
      ancestors.add(pointer);const node=byId.get(pointer);if(!node||node.kind!=="region")break;
      pointer=regionRef(node);
    }
  }
  return [...new Set(errors)];
}
export function regionDescendsFrom(regionId,ancestorId,records){
  if(!regionId||!ancestorId)return false;
  const byId=new Map(records.map(r=>[r.id,r]));let current=regionId;
  const seen=new Set();
  while(current&&!seen.has(current)){
    if(current===ancestorId)return true;
    seen.add(current);current=regionRef(byId.get(current)??{});
  }
  return false;
}
export function regionPath(regionId,records){
  const byId=new Map(records.filter(r=>r.kind==='region').map(r=>[r.id,r]));
  const labels=[],seen=new Set();let current=regionId;
  while(current&&byId.has(current)&&!seen.has(current)){
    seen.add(current);labels.unshift(byId.get(current).name);current=regionRef(byId.get(current));
  }
  return labels.join(' › ');
}
export const emptyState = () => ({revealed_resources:[],revealed_pois:[],revealed_refs:[]});
export function createLocation(id) {
  return {
    id, entity_type:"Location", status:"draft", version:"0.1.0", provenance:{sources:["GM-authored: Foundry world"]},
    visibility:"gm", refs:[], scope:"setting_adapter", owner_system_id:"SYS-LOC",
    kind:"location", name:"New Location", level_min:null, level_max:null, gathering_tier:"",
    description:{player:"", gm:""}, image:"", resources:[], points_of_interest:[], scenes:[]
  };
}
export function validRef(r) {
  return r && typeof r === "object" && Object.keys(r).sort().join(",") === "mode,relation,target_id" &&
    typeof r.relation === "string" && r.relation.length > 0 &&
    ID_PATTERN.test(r.target_id ?? "") && ["optional","required"].includes(r.mode);
}
export function validateLocation(r) {
  const errors = [];
  if (!r || typeof r !== "object" || Array.isArray(r)) return ["Location must be an object."];
  if (!LOCATION_PATTERN.test(r.id ?? "")) errors.push("ID must look like LOC-EXAMPLE-001.");
  if (r.entity_type !== "Location") errors.push("entity_type must be Location.");
  if (!["region","location"].includes(r.kind)) errors.push("kind must be region or location.");
  if (!String(r.name ?? "").trim()) errors.push("Name is required.");
  if (!STATUSES.includes(r.status)) errors.push("Unrecognized status.");
  if (!VISIBILITY.includes(r.visibility)) errors.push("Unrecognized visibility.");
  if (typeof r.version !== "string" || !r.version.trim()) errors.push("Version is required.");
  if (!r.provenance || !Array.isArray(r.provenance.sources) || r.provenance.sources.some(s => typeof s !== "string")) errors.push("provenance.sources must be a string list.");
  if (!Array.isArray(r.refs) || r.refs.some(x => !validRef(x))) errors.push("All refs must use {relation,target_id,mode}.");
  const regionRefs = Array.isArray(r.refs) ? r.refs.filter(x => x.relation === "belongs_to_region") : [];
  if (regionRefs.length > 1) errors.push("Only one primary Region reference is allowed.");
  if (regionRefs.some(x => x.target_id === r.id || !LOCATION_PATTERN.test(x.target_id))) errors.push("Region must reference a different LOC-* record.");
  const levels = [r.level_min,r.level_max];
  if (levels.some(n => n !== null && (!Number.isInteger(n) || n < 1 || n > 20))) errors.push("Levels must be blank or integers 1–20.");
  if (r.level_min !== null && r.level_max !== null && r.level_min > r.level_max) errors.push("Minimum level exceeds maximum level.");
  if (!TIERS.includes(r.gathering_tier)) errors.push("Unknown gathering tier.");
  if (!r.description || typeof r.description.player !== "string" || typeof r.description.gm !== "string") errors.push("Both description fields must be strings.");
  if (typeof r.image !== "string") errors.push("Image must be a string.");
  if (!Array.isArray(r.resources) || !r.resources.every(x => x && /^RES-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(x.id ?? "") &&
    /^MAT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(x.material_ref ?? "") && ABUNDANCE.includes(x.abundance))) errors.push("Resources require RES-* ID, MAT-* ID and abundance.");
  if (Array.isArray(r.resources) && new Set(r.resources.map(x=>x.id)).size!==r.resources.length) errors.push("Duplicate resource IDs.");
  if (!Array.isArray(r.points_of_interest) || !r.points_of_interest.every(x=>x && typeof x.key === "string" && x.key.trim() &&
     typeof x.title === "string" && typeof x.description === "string" && typeof x.reference === "string")) errors.push("Points of interest require a key, title, description and optional reference.");
  if (Array.isArray(r.points_of_interest) && new Set(r.points_of_interest.map(x=>x.key)).size !== r.points_of_interest.length) errors.push("Duplicate point-of-interest keys.");
  if (!Array.isArray(r.scenes) || !r.scenes.every(x=>x && typeof x.uuid === "string" && typeof x.label === "string")) errors.push("Scene links must contain uuid and label.");
  return errors;
}
export function nextResourceId(record) {
  let n=1, ids=new Set((record.resources ?? []).map(r=>r.id));
  while(ids.has(`RES-${record.id.slice(4)}-${String(n).padStart(3,"0")}`)) n++;
  return `RES-${record.id.slice(4)}-${String(n).padStart(3,"0")}`;
}
export function nextPoiKey(record) {
  let n=1, keys=new Set((record.points_of_interest ?? []).map(r=>r.key));
  while(keys.has(`poi-${n}`)) n++;
  return `poi-${n}`;
}
export function normalizeState(raw) {
  const s=emptyState();
  for(const key of Object.keys(s)) s[key]=Array.isArray(raw?.[key]) ? [...new Set(raw[key].filter(x=>typeof x==="string"))] : [];
  return s;
}
export function playerHtml(record,rawState) {
  const s=normalizeState(rawState), resourceSet=new Set(s.revealed_resources), poiSet=new Set(s.revealed_pois), refSet=new Set(s.revealed_refs);
  const resources=record.resources.filter(r=>resourceSet.has(r.id));
  const pois=record.points_of_interest.filter(p=>poiSet.has(p.key));
  const links=record.refs.filter(r=>r.relation!=="belongs_to_region" && refSet.has(refKey(r)));
  const chunks=[`<h1>${esc(record.name)}</h1>`];
  const img=safePath(record.image);if(img)chunks.push(`<figure><img src="${esc(img)}" alt="${esc(record.name)}" style="max-width:100%;height:auto"></figure>`);
  if(record.description.player.trim())chunks.push(`<p>${paragraph(record.description.player)}</p>`);
  if(resources.length)chunks.push(`<h2>Known Resources</h2><ul>${resources.map(r=>`<li>${esc(r.material_ref)} — ${esc(r.abundance)}</li>`).join("")}</ul>`);
  if(pois.length)chunks.push(`<h2>Points of Interest</h2>${pois.map(p=>`<h3>${esc(p.title)}</h3><p>${paragraph(p.description)}</p>${p.reference.trim()?`<p><small>Reference: ${esc(p.reference)}</small></p>`:""}`).join("")}`);
  if(links.length)chunks.push(`<h2>Known Connections</h2><ul>${links.map(r=>`<li>${esc(r.relation.replaceAll("_"," "))}: ${esc(r.target_id)}</li>`).join("")}</ul>`);
  return chunks.join("\n");
}
export function syncDecision(incoming, world, baseRevision) {
  if(!world) return "create";
  if(JSON.stringify(incoming)===JSON.stringify(world.record)) return "unchanged";
  if(!Number.isInteger(baseRevision) || baseRevision < 0 || baseRevision !== world.revision) return "conflict";
  return "update";
}
export function parseImport(json) {
  if (!json || json.format !== SOURCE_FORMAT || !Array.isArray(json.locations)) throw new Error(`Expected ${SOURCE_FORMAT} with locations array.`);
  const seen=new Set();
  for(const item of json.locations) {
    const errors=validateLocation(item);
    if(errors.length)throw new Error(`${item?.id || "Unknown"}: ${errors.join(" ")}`);
    if(seen.has(item.id))throw new Error(`Duplicate ID: ${item.id}`);
    seen.add(item.id);
  }
  if(json.base_revisions!==undefined && (!json.base_revisions || typeof json.base_revisions !== "object" || Array.isArray(json.base_revisions)))throw new Error("base_revisions must be an object.");
  return json;
}
