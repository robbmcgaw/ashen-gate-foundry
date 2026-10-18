/** Pure, defensive macro manifest validation (does not execute commands). */
const allowedFields = new Set(['id','name','version','description','source','category','status']);
export function validateMacroManifest(manifest) {
  if (manifest?.schema_version !== 'ag-macro-manifest/0.1' || !Array.isArray(manifest.entries))
    throw new Error('Expected macro manifest ag-macro-manifest/0.1 with entries array.');
  const seen=new Set();
  return manifest.entries.map((entry,index) => {
    if (!entry || typeof entry!=='object' || Array.isArray(entry)) throw new Error(`Macro ${index}: expected object.`);
    if (Object.keys(entry).some(k=>!allowedFields.has(k))) throw new Error(`Macro ${index}: unrecognized fields.`);
    if (typeof entry.id !== 'string' || !/^[a-z][a-z0-9-]{2,100}$/.test(entry.id)) throw new Error(`Macro ${index}: unsafe registry ID.`);
    if (seen.has(entry.id)) throw new Error(`Duplicate macro registry ID: ${entry.id}.`);
    seen.add(entry.id);
    for(const field of ['name','version','description','category','status','source'])
      if(typeof entry[field]!=='string'|| !entry[field].trim()) throw new Error(`Macro ${entry.id}: missing ${field}.`);
    if(!/^macros\/[a-zA-Z0-9/_-]+\.js$/.test(entry.source)||entry.source.includes('..')||entry.source.includes('//'))
      throw new Error(`Macro ${entry.id}: source must be a safe module-relative .js path inside macros/.`);
    return {...entry};
  });
}
export async function loadMacroSources(manifest,fetchText) {
  const entries=validateMacroManifest(manifest);
  return Promise.all(entries.map(async entry => {
    const command=await fetchText(entry.source);
    if(typeof command!=='string'||!command.trim()) throw new Error(`Macro ${entry.id}: empty source file.`);
    return {...entry,command};
  }));
}

/** A user-provided macro registry is an opt-in script source, never auto-executed. */
export function validateUserMacroRegistry(registry) {
  if (registry?.schema_version !== 'ag-macro-registry/0.4' || !Array.isArray(registry.entries))
    throw new Error('Expected ag-macro-registry/0.4 with entries[].');
  if (registry.entries.length>50) throw new Error('A custom registry may contain at most 50 macros.');
  const seen=new Set();
  return registry.entries.map((entry,i)=>{
    if (!entry || typeof entry!=='object' || Array.isArray(entry)) throw new Error(`entries[${i}] must be an object.`);
    const {id,name,version,description,command} = entry;
    if (typeof id!=='string'|| !/^[a-z][a-z0-9-]{2,100}$/.test(id)) throw new Error(`entries[${i}].id: invalid ID.`);
    if (seen.has(id)) throw new Error(`Duplicate macro ID ${id}.`);
    seen.add(id);
    for (const [key,value] of Object.entries({name,version,description,command}))
      if (typeof value!=='string'||!value.trim()) throw new Error(`entries[${i}].${key}: nonempty string required.`);
    if (command.length>200000) throw new Error(`Macro ${id}: 200KB script limit exceeded.`);
    return {id,name,version,description,command,category:'GM-imported',status:'user-provided'};
  });
}
