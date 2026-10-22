// Pre-release version rules (see CLAUDE.md "Versioning"). Every Ashen Gate module is 0.x; Locations was renumbered from
// 1.18.0 to 0.18.0, so partners must feature-detect its API rather than compare its version number. Used by check.mjs.

/** True for a line that compares (or pins a minimum for) an Ashen Gate Locations version. */
export function locationsVersionCompare(line) {
  if (/\bLOCATIONS?_[A-Z_]*VERSION\s*=\s*['"]\d/.test(line)) return true;
  if (!/locations/i.test(line)) return false;
  if (/'ashen-gate-locations'[^\n]*\bmin(?:imum)?\s*:\s*['"]\d/.test(line)) return true;
  return /\b(?:compareVersions|isNewerVersion)\s*\(|\.version\s*(?:[<>]=?|===?|!==?)\s*['"]\d|['"]\d+\.\d+(?:\.\d+)?['"]\s*(?:[<>]=?)\s*[\w.?]*version/.test(line);
}

/** Problems with a module.json's relationships: any Ashen Gate partner pinned at a version that is not 0.x. Foundry
 *  enforces these, so a 1.x minimum would stop the module enabling beside a 0.x partner. */
export function relationshipProblems(manifest) {
  const out = [];
  for (const [kind, list] of Object.entries(manifest?.relationships ?? {})) {
    for (const rel of Array.isArray(list) ? list : []) {
      if (!String(rel?.id ?? '').startsWith('ashen-gate-')) continue;
      for (const [k, want] of Object.entries(rel.compatibility ?? {})) {
        if (!/^0\./.test(String(want))) out.push(`module.json relationships.${kind} ${rel.id} compatibility.${k} "${want}": Ashen Gate modules are 0.x; feature-detect instead`);
      }
    }
  }
  return out;
}
