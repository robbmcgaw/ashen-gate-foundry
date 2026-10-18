/** Spatial-only map metadata and overlay matching; no Location gameplay state lives here. */
import {LOCATION_PATTERN} from './model.js';
export const MAP_PATTERN = /^MAP-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const FRONTIER_OVERLAYS = Object.freeze([
  {key:'fosstryn_approaches', label:'Fosstryn Approaches', filename:'fosstryn_approaches.png'},
  {key:'western_grasslands',label:'Western Grasslands',filename:'western_grasslands.png'},
  {key:'forest_verge',label:'Forest Verge',filename:'forest_verge.png'},
  {key:'deepwood_fringe',label:'Deepwood Fringe',filename:'deepwood_fringe.png'},
  {key:'eastern_foothills',label:'Eastern Foothills',filename:'eastern_foothills.png'},
  {key:'riverlands',label:'Riverlands',filename:'riverlands.png'},
  {key:'outer_grass_sea',label:'Outer Grass Sea',filename:'outer_grass_sea.png'}
]);
export const emptyMapRegistry = () => ({format:'ag-locations-map-registry/0.1',revision:0,maps:[]});
export const newMap = (id,name='New Map') => ({id,name,scene_id:'',region_id:'',overlays:[]});
export const fileBasename = path => {
  const s=String(path??'').split(/[?#]/)[0].replace(/\\/g,'/').split('/').pop()??'';
  try{return decodeURIComponent(s).toLowerCase();}catch{return s.toLowerCase();}
};
export function validateMap(map,records=[],sceneIds=null){
  const errors=[];
  if(!map || typeof map!=='object' || Array.isArray(map))return ['Map must be an object.'];
  if(!MAP_PATTERN.test(map.id??''))errors.push('Map ID must use MAP-*.');
  if(!String(map.name??'').trim())errors.push('Map name is required.');
  if(typeof map.scene_id!=='string')errors.push('Scene ID must be text.');
  if(sceneIds && map.scene_id && !sceneIds.includes(map.scene_id))errors.push('Scene does not exist in this world.');
  if(map.region_id && (!LOCATION_PATTERN.test(map.region_id) || !records.some(r=>r.id===map.region_id&&r.kind==='region')))
    errors.push('Associated Region must be a saved LOC-* Region.');
  if(typeof map.region_id!=='string')errors.push('Region ID must be text.');
  if(!Array.isArray(map.overlays)) errors.push('Overlays must be an array.');
  else {
    const keys=new Set(),tiles=new Set();
    for(const o of map.overlays){
      if(!o || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(o.key??''))errors.push('Overlay key must be a stable slug.');
      if(typeof o?.label!=='string'||!o.label.trim())errors.push('Overlay label is required.');
      if(typeof o?.filename!=='string'||!/\.png$/i.test(fileBasename(o.filename)))errors.push('Overlay filename must be a PNG.');
      if(typeof o?.tile_id!=='string')errors.push('Overlay tile_id must be text.');
      if(typeof o?.region_id!=='string'|| (o.region_id && (!LOCATION_PATTERN.test(o.region_id)||!records.some(r=>r.id===o.region_id&&r.kind==='region'))))errors.push('Overlay Region must be an existing LOC-* Region.');
      if(keys.has(o?.key))errors.push('Duplicate overlay key.');keys.add(o?.key);
      if(o?.tile_id){if(tiles.has(o.tile_id))errors.push('One Tile cannot represent two overlays.');tiles.add(o.tile_id);}
    }
  }
  return errors;
}
export function validateMapRegistry(data,records=[],sceneIds=null){
  if(data?.format!=='ag-locations-map-registry/0.1'||!Number.isInteger(data.revision)||data.revision<0||!Array.isArray(data.maps))
    return ['Invalid map registry envelope.'];
  const seen=new Set(),errors=[];
  for(const map of data.maps){
    if(seen.has(map.id)) errors.push(`Duplicate Map ID: ${map.id}`);seen.add(map.id);
    for(const e of validateMap(map,records,sceneIds))errors.push(`${map.id??'Unknown'}: ${e}`);
  }
  return errors;
}
// The explicit tile binding has priority. Ambiguous filenames cannot silently change two Tiles.
export function matchOverlayTiles(scene,map,overlay){
  if(!scene)return [];
  const tiles=scene.tiles?.contents??[];
  if(overlay.tile_id)return tiles.filter(t=>t.id===overlay.tile_id);
  const assigned=new Set((map.overlays??[]).filter(o=>o.tile_id).map(o=>o.tile_id));
  const target=fileBasename(overlay.filename);
  return tiles.filter(t=>!assigned.has(t.id) && fileBasename(t.texture?.src)===target);
}
export function mapOverlayUpdates(scene,map,hidden,overlayKeys=null){
  const keys=overlayKeys?new Set(overlayKeys):null;
  const updates=[],missing=[],ambiguous=[];
  for(const o of map.overlays){
    if(keys&&!keys.has(o.key))continue;
    const matches=matchOverlayTiles(scene,map,o);
    if(!matches.length){missing.push(o.label);continue;}
    if(matches.length!==1){ambiguous.push(o.label);continue;}
    if(matches[0].hidden!==hidden)updates.push({_id:matches[0].id,hidden});
  }
  if(new Set(updates.map(u=>u._id)).size!==updates.length)throw new Error('Duplicate Tile match: bind each overlay explicitly.');
  return {updates,missing,ambiguous};
}
export function addFrontierPreset(map){
  if((map.overlays??[]).length)throw new Error('Frontier preset is only available on a map with no configured overlays.');
  return {...map,overlays:FRONTIER_OVERLAYS.map(o=>({...o,region_id:'',tile_id:''}))};
}
