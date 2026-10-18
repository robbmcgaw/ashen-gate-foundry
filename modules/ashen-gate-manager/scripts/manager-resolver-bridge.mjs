/**
 * Ashen Gate — Borris AG-WORK-0013 consumer/diagnostic bridge.
 * Adapter to Archie's TEMPORARY ag-definition-resolver/0.1-prototype.
 * No Foundry world writes. Never replaces the canonical refs or source IDs.
 * GM-only diagnostics cannot be invoked by a player through this API.
 */
const ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const UUID_RE = /^(?:Actor|Item|JournalEntry|RollTable|Macro|Compendium)\.[A-Za-z0-9._-]+$/;
const MARKER = /\[\[AGREF:([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)(?:\|([^\]\r\n]*))?\]\]/g;

export const BRIDGE_TARGET_CONTRACT = 'ag-definition-resolver/0.1-prototype';

function ensureResolver(resolver) {
  if (!resolver || resolver.contract !== BRIDGE_TARGET_CONTRACT || typeof resolver.resolve !== 'function') {
    throw new TypeError('Archie resolver prototype was not provided; do not invent a fallback binding.');
  }
}
function isGM(currentUser) {
  try { return currentUser()?.isGM === true; } catch { return false; }
}
function validatedRef(ref) {
  return Boolean(ref && !Array.isArray(ref) &&
    typeof ref.relation === 'string' && ref.relation.trim() &&
    typeof ref.target_id === 'string' && ID_RE.test(ref.target_id) &&
    (ref.mode === 'required' || ref.mode === 'optional'));
}

/** The native resolver is the authority for lookup and permission checks. */
export function lookupSourceId(resolver, id, options) {
  ensureResolver(resolver);
  if (typeof id !== 'string' || !ID_RE.test(id)) return {status: 'invalid_id'};
  const answer = resolver.resolve(id, options);
  if (!answer || typeof answer.status !== 'string') return {status:'unavailable'};
  // Never return a fabricated UUID: some definitions are domain-owned pointers.
  return answer;
}

/**
 * GM-only read-only audit; required and optional refs always retained in the
 * output even if not resolvable. Does not leak hidden targets to players.
 */
export function auditTypedReferences({records, resolver, currentUser} = {}) {
  if (typeof currentUser !== 'function' || !isGM(currentUser)) return {status:'forbidden'};
  ensureResolver(resolver);
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  const findings = [];
  let examined = 0;
  for (const rec of records) {
    if (!rec || typeof rec.id !== 'string' || !ID_RE.test(rec.id) || !Array.isArray(rec.refs)) {
      findings.push({sourceId:rec?.id ?? null,status:'invalid_source',severity:'error'});
      continue;
    }
    for (const ref of rec.refs) {
      examined++;
      if (!validatedRef(ref)) {
        findings.push({sourceId:rec.id,status:'invalid_ref',severity:'error'});
        continue;
      }
      const target = lookupSourceId(resolver,ref.target_id);
      const status = target.status;
      const item = {
        sourceId: rec.id,
        targetId: ref.target_id,
        relation: ref.relation,
        mode: ref.mode,
        status,
        severity: status === 'ok' ? 'ok' : (ref.mode === 'optional' ? 'warning' : 'error')
      };
      if (status === 'ok') item.binding = structuredClone(target.binding);
      findings.push(item);
    }
  }
  return {
    status:'ok', examined, findings,
    unresolvedRequired:findings.filter(f => f.severity==='error'),
    unresolvedOptional:findings.filter(f => f.severity==='warning')
  };
}

/**
 * Projection helper for GM source-import rich text. Does not modify input.
 * Unresolved markers stay literal and are reported, NOT silently removed.
 */
export function renderGmReferenceMarkers({text, resolver, currentUser} = {}) {
  if (typeof currentUser !== 'function' || !isGM(currentUser)) return {status:'forbidden'};
  ensureResolver(resolver);
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const unresolved = [], resolved = [];
  const html = text.replace(MARKER,(original,id,label) => {
    const answer=lookupSourceId(resolver,id);
    if (answer.status !== 'ok' || answer.binding?.kind !== 'native' ||
        typeof answer.binding?.uuid !== 'string' || !UUID_RE.test(answer.binding.uuid)) {
      unresolved.push({id,status:answer.status==='ok'?'no_native_uuid':answer.status});
      return original;
    }
    const title = String(label || answer.binding.title || id)
      .replace(/[\[\]{}<>\r\n]/g,'').trim() || id;
    resolved.push({id,uuid:answer.binding.uuid});
    return `@UUID[${answer.binding.uuid}]{${title}}`;
  });
  return {status:'ok',text:html,resolved,unresolved};
}
