import {folderSegments} from './import-fidelity.js';
function parentOf(folder){return folder.folder?.id??folder.folder??null;}
/** Create missing typed folders from root down. Never guess if same-name siblings are ambiguous. */
export async function ensureFolder(type,path,{folders,create,cache=new Map(),report=()=>{}}){
  if(!['Item','JournalEntry','Actor','RollTable','Macro'].includes(type)) throw new Error(`Unsupported Foundry folder type ${type}.`);
  const segments=folderSegments(path);
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
