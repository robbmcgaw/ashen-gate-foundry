import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocation,regionRef,regionPath,regionDescendsFrom,validateRegionHierarchy,validateLocation,parseImport,SOURCE_FORMAT} from '../scripts/model.js';
import {newMap,addFrontierPreset,validateMap,validateMapRegistry,matchOverlayTiles,mapOverlayUpdates,fileBasename,FRONTIER_OVERLAYS,emptyMapRegistry} from '../scripts/maps-model.js';
const R=(id,name,parent='')=>{const r=createLocation(id);r.name=name;r.kind='region';if(parent)r.refs.push({relation:'belongs_to_region',target_id:parent,mode:'optional'});return r};
test('Region can belong to one parent Region without inventing a new entity type',()=>{
 const parent=R('LOC-FRONTIER','Fosstryn Frontier'); const child=R('LOC-FOREST','Forest Verge',parent.id);
 assert.deepEqual(validateLocation(child),[]);assert.equal(regionRef(child),parent.id);
 assert.deepEqual(validateRegionHierarchy([parent,child]),[]);
 assert.equal(regionPath(child.id,[parent,child]),'Fosstryn Frontier › Forest Verge');
 assert.equal(regionDescendsFrom(child.id,parent.id,[parent,child]),true);
});
test('reject self-loops, two-node cycles, missing parents and non-Region parents',()=>{
 const a=R('LOC-A','A','LOC-B'),b=R('LOC-B','B','LOC-A');
 assert.match(validateRegionHierarchy([a,b]).join(),/Circular/);
 assert.match(validateLocation(R('LOC-SELF','Self','LOC-SELF')).join(),/different LOC/);
 assert.match(validateRegionHierarchy([R('LOC-A','A','LOC-MISSING')]).join(),/was not found/);
 const regular=createLocation('LOC-ORDINARY');
 assert.match(validateRegionHierarchy([R('LOC-A','A',regular.id),regular]).join(),/kind region/);
});
test('cycle-safe region path and traversal do not hang on malformed source',()=>{
 const a=R('LOC-A','A','LOC-B'),b=R('LOC-B','B','LOC-A');
 assert.ok(regionPath('LOC-A',[a,b]).length<50);
 assert.equal(regionDescendsFrom('LOC-A','LOC-C',[a,b]),false);
});
test('import transport still preserves existing source format and Region parent refs',()=>{
 const r=R('LOC-FOREST','Forest Verge','LOC-FRONTIER');
 assert.equal(parseImport({format:SOURCE_FORMAT,locations:[r]}).locations[0].kind,'region');
});
test('Frontier preset names exactly the seven PNGs and does not fill canonical LOC IDs',()=>{
 const m=addFrontierPreset(newMap('MAP-FRONTIER','Fosstryn Frontier'));
 assert.equal(m.overlays.length,7);assert.equal(new Set(m.overlays.map(x=>x.filename)).size,7);
 assert.ok(m.overlays.every(x=>x.region_id===''&&x.tile_id===''));
 assert.throws(()=>addFrontierPreset(m),/no configured/);
 assert.equal(FRONTIER_OVERLAYS.length,7);
});
test('map requires genuine linked Region, with distinct overlay keys and Tile bindings',()=>{
 const root=R('LOC-FRONTIER','Frontier');
 const m=addFrontierPreset(newMap('MAP-FRONTIER','Frontier'));
 m.region_id=root.id;m.scene_id='scene-1';
 assert.deepEqual(validateMap(m,[root],['scene-1']),[]);
 m.overlays[0].region_id='LOC-UNKNOWN';assert.match(validateMap(m,[root],['scene-1']).join(),/existing LOC/);
 m.overlays[0].region_id='';m.overlays[0].tile_id='A';m.overlays[1].tile_id='A';
 assert.match(validateMap(m,[root],['scene-1']).join(),/One Tile/);
});
test('map filename matching is case-insensitive, URL-safe, not substring-based',()=>{
 assert.equal(fileBasename('worlds/A/forest_verge.png?x=9'),'forest_verge.png');
 const m=addFrontierPreset(newMap('MAP-FRONTIER','Fosstryn Frontier'));
 const t=[{id:'A',texture:{src:'worlds/myworld/overlays/Forest_Verge.PNG'},hidden:false},{id:'B',texture:{src:'worlds/myworld/overlays/forest_verge.png.BAK'},hidden:false}];
 assert.deepEqual(matchOverlayTiles({tiles:{contents:t}},m,m.overlays.find(o=>o.key==='forest_verge')).map(x=>x.id),['A']);
});
test('overlays never auto-toggle ambiguous Tiles, and bulk updates only matching Tile IDs',()=>{
 const m=addFrontierPreset(newMap('MAP-FRONTIER','Fosstryn Frontier'));
 const t=[{id:'A',texture:{src:'worlds/a/forest_verge.png'},hidden:false}, {id:'B',texture:{src:'worlds/b/forest_verge.png'},hidden:false}, {id:'C',texture:{src:'worlds/a/riverlands.png'},hidden:false}, {id:'D',texture:{src:'worlds/a/background.png'},hidden:false}];
 const scene={tiles:{contents:t}};
 let result=mapOverlayUpdates(scene,m,true);
 assert.deepEqual(result.updates,[{_id:'C',hidden:true}]);
 assert.deepEqual(result.ambiguous,['Forest Verge']);
 assert.ok(result.missing.includes('Deepwood Fringe'));
 m.overlays.find(o=>o.key==='forest_verge').tile_id='B';
 result=mapOverlayUpdates(scene,m,true,['forest_verge']);
 assert.deepEqual(result.updates,[{_id:'B',hidden:true}]);
});
test('map registry catches duplicate MAP IDs',()=>{
 const map=newMap('MAP-FRONTIER','Frontier');
 assert.deepEqual(validateMapRegistry({...emptyMapRegistry(),maps:[map,map]}).filter(x=>/Duplicate Map ID/.test(x)),['Duplicate Map ID: MAP-FRONTIER']);
});
