import {folderSegments} from './import-fidelity.js';
import {MODULE_ID} from './core.js';
function parentOf(folder){return folder.folder?.id??folder.folder??null;}

/**
 * Folder names Manager uses instead of the one a package asks for (0.45.0). Packages file Cinder powers under
 * "Ashen Gate/Cinders/Powers"; Manager names that folder "Cinder - Powers" so it isn't mistaken for spell or class
 * "Powers" folders. `isOwn(doc)` says a document in the old folder was imported by Manager as that kind of record.
 */
export const FOLDER_RENAMES = Object.freeze([
  Object.freeze({key:'cinderPowers', path:Object.freeze(['Ashen Gate','Cinders','Powers']), name:'Cinder - Powers',
    isOwn:doc=>{const s=doc?.flags?.[MODULE_ID]?.source??(typeof doc?.getFlag==='function'?doc.getFlag(MODULE_ID,'source'):null);
      return s?.entityType==='Power'||/^POWER-/.test(String(s?.sourceId??''));}})
]);
export const FOLDER_RENAMES_SETTING = 'folderRenames';

/** The segments with any renamed folder swapped for Manager's name (sub-folders below it are kept). */
export function renameSegments(segments){
  let out=[...segments];
  for(const r of FOLDER_RENAMES){
    if(out.length>=r.path.length && r.path.every((name,i)=>out[i]===name)) out=[...r.path.slice(0,-1),r.name,...out.slice(r.path.length)];
  }
  return out;
}
/**
 * Foundry nests folders at most 4 levels deep (CONST.FOLDER_MAX_DEPTH). A deeper path keeps its first 3 levels and
 * joins the rest into the 4th with " - " (0.52.2): "Ashen Gate/Professions/Artistry/Music/Compositions" files into
 * "Ashen Gate/Professions/Artistry/Music - Compositions". Same path in, same folders out, so re-imports find them.
 */
export const FOLDER_JOIN = ' - ';
export const FOLDER_MAX_DEPTH = 4;
export function collapseSegments(segments,max=FOLDER_MAX_DEPTH){
  if(segments.length<=max) return [...segments];
  return [...segments.slice(0,max-1),segments.slice(max-1).join(FOLDER_JOIN)];
}
/** The folder names an import actually creates for a folder_path (renames, then the depth limit); null for no path. */
export function foundryFolderSegments(path){
  const given=folderSegments(path);
  return given?collapseSegments(renameSegments(given)):null;
}
/** {path, collapsed} for the preview: the folder path that will be used, and whether the depth limit shortened it. */
export function folderDestination(path){
  const given=folderSegments(path);
  if(!given) return null;
  const renamed=renameSegments(given), used=collapseSegments(renamed);
  return {path:used.join('/'),collapsed:used.length<renamed.length};
}
/** Create missing typed folders from root down. Never guess if same-name siblings are ambiguous. */
export async function ensureFolder(type,path,{folders,create,cache=new Map(),report=()=>{}}){
  if(!['Item','JournalEntry','Actor','RollTable','Macro'].includes(type)) throw new Error(`Unsupported Foundry folder type ${type}.`);
  const segments=foundryFolderSegments(path);
  if(!segments) throw new Error('ensureFolder requires an explicit folder_path.');
  let parentId=null,last=null;
  for(const [level,name] of segments.entries()){
    const key=JSON.stringify([type,parentId,name]);
    const cached=cache.get(key);
    if(cached && folders.get(cached.id)){last=cached;parentId=cached.id;continue;}
    const matches=folders.filter(f=>f.type===type && f.name===name && parentOf(f)===parentId);
    if(matches.length>1) throw new Error(`Ambiguous ${type} folder ${segments.slice(0,level+1).join('/')}: ${matches.length} folders share this parent.`);
    let folder=matches[0];
    if(!folder){
      try{folder=await create({name,type,folder:parentId,sorting:'a'});}
      catch(e){throw new Error(`Cannot create ${type} folder ${segments.slice(0,level+1).join('/')}: ${e.message??e}`);}
      report({action:'folder-created',name,type,path:segments.slice(0,level+1).join('/'),status:'ok'});
    }
    cache.set(key,folder);last=folder;parentId=folder.id;
  }
  return last;
}

/**
 * One-time rename of folders Manager created under an old name (0.45.0), e.g. "Ashen Gate/Cinders/Powers" →
 * "Cinder - Powers". A folder is renamed only when its whole path matches (root "Ashen Gate", then "Cinders") and it
 * holds at least one document Manager imported as that kind of record, so a folder the GM made is never touched.
 * If the new name already exists beside it, nothing is renamed (no duplicate) and a note says so.
 * `done` is {key: true} for renames already run; returns {renamed, notes, done} with the keys finished now.
 * `update(folder, data)` writes the folder (injectable for tests).
 */
export async function renameManagerFolders({folders, done={}, update=(folder,data)=>folder.update(data)}){
  const list=[...(folders?.contents??folders??[])];
  const byId=new Map(list.map(f=>[f.id,f]));
  const pathOf=f=>{const names=[];for(let x=f,n=0;x&&n<10;x=byId.get(parentOf(x)),n++)names.unshift(x.name);return names;};
  const renamed=[],notes=[],finished={};
  for(const r of FOLDER_RENAMES){
    if(done[r.key])continue;
    const old=list.filter(f=>f.name===r.path.at(-1)&&pathOf(f).join('/')===r.path.join('/'));
    for(const folder of old){
      const docs=[...(folder.contents??[])];
      if(!docs.some(r.isOwn)){notes.push(`${r.path.join('/')} (${folder.type}) holds no Manager-imported records, so it was left as it is.`);continue;}
      const clash=list.some(f=>f!==folder&&f.type===folder.type&&f.name===r.name&&parentOf(f)===parentOf(folder));
      if(clash){notes.push(`${r.path.join('/')} (${folder.type}) was not renamed: a "${r.name}" folder already sits beside it. Move its contents and delete the empty one.`);continue;}
      await update(folder,{name:r.name,[`flags.${MODULE_ID}.renamedFrom`]:folder.name});
      renamed.push({id:folder.id,type:folder.type,from:r.path.join('/'),to:[...r.path.slice(0,-1),r.name].join('/')});
    }
    finished[r.key]=true;
  }
  return {renamed,notes,done:{...done,...finished}};
}

/**
 * 0.71.1: folder MOVES, for packs that moved a record type to a new folder_path (Sync never re-files existing documents). The creature
 * Actors imported under "Draft Frontier Creatures" / "Draft Ashen Additions" now belong under "Ashen Gate/Bestiary/...". Only Actor folders found
 * by their exact old name at the top level, and only the documents in them that Manager imported as that kind of record (`isOwn`, a source id
 * starting CRE-), are moved; anything else in the folder stays, a folder the GM renamed or filed elsewhere is never found, and no folder is
 * ever deleted (the old one is simply left empty). The destination is created when missing and reused when it exists (a merge, no duplicates).
 */
const CREATURE = doc => { const s = doc?.flags?.[MODULE_ID]?.source ?? (typeof doc?.getFlag === 'function' ? doc.getFlag(MODULE_ID, 'source') : null); return /^CRE-/.test(String(s?.sourceId ?? '')); };
export const FOLDER_MOVES = Object.freeze([
  Object.freeze({key: 'bestiaryFrontier', type: 'Actor', from: Object.freeze(['Draft Frontier Creatures']), to: Object.freeze(['Ashen Gate', 'Bestiary', 'Frontier Creatures']), isOwn: CREATURE}),
  Object.freeze({key: 'bestiaryAshen', type: 'Actor', from: Object.freeze(['Draft Ashen Additions']), to: Object.freeze(['Ashen Gate', 'Bestiary', 'Ashen Additions']), isOwn: CREATURE})
]);
/** `moveDocs(docs, folderId)` and `create(data)` are injected (Foundry writes); returns {moved, notes, done}. */
export async function moveManagerFolders({folders, done = {}, create, moveDocs, report = () => {}}) {
  const list = [...(folders?.contents ?? folders ?? [])];
  const byId = new Map(list.map(f => [f.id, f]));
  const pathOf = f => { const names = []; for (let x = f, n = 0; x && n < 10; x = byId.get(parentOf(x)), n++) names.unshift(x.name); return names; };
  const moved = [], notes = [], finished = {};
  for (const m of FOLDER_MOVES) {
    if (done[m.key]) continue;
    let ok = true;
    const old = list.filter(f => f.type === m.type && f.name === m.from.at(-1) && pathOf(f).join('/') === m.from.join('/'));
    const owned = old.map(f => ({folder: f, docs: [...(f.contents ?? [])].filter(m.isOwn)})).filter(x => x.docs.length);
    if (owned.length) {
      try {
        const dest = await ensureFolder(m.type, m.to.join('/'), {folders: {filter: fn => list.filter(fn), get: id => byId.get(id) ?? list.find(f => f.id === id)}, create: async data => { const f = await create(data); list.push(f); byId.set(f.id, f); return f; }, report});
        for (const {folder, docs} of owned) {
          await moveDocs(docs, dest.id);
          moved.push({from: m.from.join('/'), to: m.to.join('/'), count: docs.length, left: Math.max(0, (folder.contents?.length ?? docs.length) - docs.length)});
        }
      } catch (error) { ok = false; notes.push(`${m.from.join('/')} (${m.type}) was not moved: ${String(error?.message ?? error)}`); }
    }
    if (ok) finished[m.key] = true;
  }
  return {moved, notes, done: {...done, ...finished}};
}
