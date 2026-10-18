/** Non-executing import bundle loader. JSZip is bundled under its upstream license. */
export async function readImportZip(buffer, JSZipClass = globalThis.JSZip) {
  if (!JSZipClass?.loadAsync) throw new Error('Bundled ZIP reader unavailable. Reload Foundry and retry.');
  if (buffer.byteLength > 60_000_000) throw new Error('ZIP exceeds the 60 MB upload limit.');
  const zip = await JSZipClass.loadAsync(buffer, {checkCRC32: true});
  const entries = Object.entries(zip.files).filter(([,entry])=>!entry.dir);
  if(entries.length > 500) throw new Error('ZIP contains more than 500 files. Split the content package.');
  const projections = [], assets = new Map();
  let total = 0;
  for(const [path, entry] of entries) {
    if(path.startsWith('/') || path.includes('\\') || path.split('/').some(part=>part==='..'||part==='.'||!part))
      throw new Error(`Unsafe ZIP entry path: ${path}`);
    const size = entry._data?.uncompressedSize;
    if(typeof size==='number') {
      total += size;
      if(size>25_000_000 || total>100_000_000) throw new Error('ZIP entry or expanded contents exceed safety limits.');
    }
    if(/\.(png|webp|jpe?g)$/i.test(path)) {
      const basename=path.split('/').at(-1);
      if(assets.has(basename)) throw new Error(`ZIP contains duplicate artwork filename ${basename}; cannot choose automatically.`);
      assets.set(basename,{path,entry});
    } else if(/\.json$/i.test(path)) {
      if(typeof size==='number' && size>10_000_000) throw new Error(`JSON file ${path} exceeds 10 MB.`);
      let obj;
      try {obj=JSON.parse(await entry.async('string'));} catch {throw new Error(`Invalid JSON inside ZIP: ${path}`);}
      if(obj?.manifest?.schema_version==='ag-foundry-import/0.1' || obj?.manifest?.schema_version==='ag-foundry-import/0.2')
        projections.push({filename:path,pkg:obj});
    }
  }
  if(!projections.length) throw new Error('ZIP contains no ag-foundry-import/0.1 or /0.2 projection JSON. Canonical source JSON and Macro JSON are not installed automatically.');
  if(projections.length!==1) throw new Error(`ZIP contains ${projections.length} Manager import projections; extract and choose the intended JSON directly. No world changes made.`);
  return {...projections[0],assets};
}

export function mediaFilename(path) {
  if(typeof path!=='string' || /^(https?:)?\/\//i.test(path))return null;
  const clean=path.split('?')[0].split('#')[0];
  const name=clean.split('/').at(-1);
  return name&&/^[A-Za-z0-9_.-]+\.(png|webp|jpe?g)$/i.test(name)?name:null;
}
export function referencedArtwork(records) {
  const names = new Set();
  for(const rec of records) {
    const data=rec.foundry?.data;
    for(const value of [data?.img,data?.prototypeToken?.texture?.src]) {
      const name=mediaFilename(value);if(name)names.add(name);
    }
  }
  return names;
}
export function adaptRecordArtwork(record, uploadedPaths) {
  if(!uploadedPaths.size) return record;
  const clone=structuredClone(record);
  const data=clone.foundry?.data;
  for(const holder of [data,data?.prototypeToken?.texture]) {
    if(!holder) continue;
    const key=holder===data?'img':'src';
    const basename=mediaFilename(holder[key]);
    if(basename&&uploadedPaths.has(basename)) holder[key]=uploadedPaths.get(basename);
  }
  return clone;
}
/** Upload ZIP-contained *referenced* portraits before creating any world documents.
 * Returned paths are saved only into per-world Foundry projections, never canonical source.
 */
export async function uploadMatchingArt(assets, records, destination, report=()=>{}, filePicker=undefined) {
  const picker=filePicker ?? globalThis.foundry?.applications?.apps?.FilePicker?.implementation;
  if(!picker?.createDirectory || !picker?.upload)throw new Error('Foundry V14 FilePicker upload API unavailable; turn off ZIP portrait upload and upload images manually.');
  if(!/^worlds\/[a-zA-Z0-9_-]+\/ashen-gate-imports\/[a-z0-9-]+$/.test(destination))throw new Error('Unsafe ZIP artwork destination.');
  const selected = [...referencedArtwork(records)].filter(name=>assets.has(name));
  if(!selected.length)return new Map();
  let dir='';
  for(const segment of destination.split('/')) {
    dir=dir?`${dir}/${segment}`:segment;
    try {await picker.createDirectory('data',dir);} catch(e) {
      // Directory may already exist; verify it exists rather than ignoring a permission error.
      try {await picker.browse('data',dir);} catch {throw new Error(`Could not create or access artwork folder ${dir}: ${e.message??e}`);}
    }
  }
  const mapped=new Map();
  for(const basename of selected) {
    const entry=assets.get(basename)?.entry;
    if(!entry)continue;
    const binary=await entry.async('uint8array');
    const file=new File([binary],basename,{type:basename.toLowerCase().endsWith('.png')?'image/png':basename.toLowerCase().endsWith('.webp')?'image/webp':'image/jpeg'});
    let result;
    try {result=await picker.upload('data',destination,file,{}, {notify:false});}
    catch(e){throw new Error(`Failed to upload ZIP artwork ${basename}: ${e.message??e}. No world documents created.`);}
    if(result?.error || result?.status==='error')throw new Error(`Asset upload rejected for ${basename}: ${JSON.stringify(result)}. No documents created.`);
    const path=result?.path??`${destination}/${basename}`;
    mapped.set(basename,path);
    report({action:'artwork-upload',status:'ok',name:basename,path});
  }
  return mapped;
}
