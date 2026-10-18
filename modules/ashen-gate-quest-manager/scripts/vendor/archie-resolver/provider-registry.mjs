// AG-WORK-0013: disposable registry of domain-owned read-only definition readers.
const VALID_PROVIDER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
export function createDefinitionProviderRegistry({onChange = () => {}} = {}) {
  if (typeof onChange !== 'function') throw new TypeError('onChange must be a function');
  const providers = new Map();let disposed = false;let revision = 0;
  function changed() {revision++;try {onChange(revision);} catch {}}
  function requireOpen() {if (disposed) throw new Error('provider registry disposed');}
  function register({providerId, readEntries} = {}) {
    requireOpen();
    if (typeof providerId !== 'string' || !VALID_PROVIDER.test(providerId))
      throw new TypeError('providerId must be a stable module-style ID');
    if (typeof readEntries !== 'function') throw new TypeError('readEntries must be a function');
    if (providers.has(providerId)) throw new Error('duplicate provider: ' + providerId);
    const registration = Object.freeze({providerId, readEntries});providers.set(providerId, registration);changed();let alive = true;
    return Object.freeze({providerId,unregister() {if (!alive) return false;alive=false;
      if (providers.get(providerId)!==registration) return false;providers.delete(providerId);changed();return true;}});
  }
  function readEntries() {
    requireOpen();const rows=[];
    for (const provider of providers.values()) {
      const items=provider.readEntries();
      if (!Array.isArray(items)) throw new TypeError('provider '+provider.providerId+' did not return an array');
      for (const item of items) {
        if (!item || typeof item!=='object' || !item.record || !item.binding)
          throw new TypeError('provider '+provider.providerId+' returned an invalid entry');
        rows.push(item);
      }
    }
    return rows;
  }
  return Object.freeze({register,readEntries,getRevision:()=>revision,
    getProviderIds:()=>Object.freeze([...providers.keys()]),
    dispose() {if (disposed) return;disposed=true;providers.clear();changed();}});
}
