/** Save a text file through Foundry's file API, with a browser fallback. */
export function downloadText(filename,content,type='text/plain',{foundryApi=globalThis.foundry?.utils,documentApi=globalThis.document,URLApi=globalThis.URL,BlobApi=globalThis.Blob}={}) {
  if (typeof foundryApi?.saveDataToFile==='function') {
    foundryApi.saveDataToFile(content,type,filename);
    return 'foundry';
  }
  if (!documentApi?.createElement || !URLApi?.createObjectURL || !BlobApi) throw new Error('No supported file download API is available.');
  const blob=new BlobApi([content],{type}), url=URLApi.createObjectURL(blob), link=documentApi.createElement('a');
  link.href=url;link.download=filename;documentApi.body.appendChild(link);link.click();link.remove();
  globalThis.setTimeout?.(()=>URLApi.revokeObjectURL(url),5000);
  return 'browser';
}
/** Save Manager JSON through Foundry's file API, with a browser fallback. */
export function downloadJson(filename,value,apis={}) {
  return downloadText(filename,JSON.stringify(value,null,2),'application/json',apis);
}
