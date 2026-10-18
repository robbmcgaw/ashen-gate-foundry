/** Just enough of Foundry's JournalEntry / page / permission model for the storage tests. */
const LEVELS = {INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3};
let nextId = 1;
const id = () => `id${nextId++}`;
const getFlag = flags => (scope, key) => flags?.[scope]?.[key];
const merge = (target, source) => {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) merge(target[k], v);
    else target[k] = structuredClone(v);
  }
  return target;
};
const expand = data => {
  const out = {};
  for (const [path, v] of Object.entries(data)) {
    const keys = path.split('.'); let o = out;
    keys.slice(0, -1).forEach(k => { o = o[k] ??= {}; });
    o[keys.at(-1)] = v;
  }
  return out;
};
const level = (ownership, user) => ownership?.[user.id] ?? ownership?.default ?? 0;

class Page {
  constructor(parent, data) { Object.defineProperty(this, 'parent', {value: parent}); this.id = id(); merge(this, structuredClone(data)); }
  getFlag(scope, key) { return getFlag(this.flags)(scope, key); }
  testUserPermission(user, need) {
    if (user.isGM) return true;
    let l = level(this.ownership, user);
    if (l === LEVELS.INHERIT) l = level(this.parent.ownership, user);
    return l >= LEVELS[need];
  }
}
export class Journal {
  constructor(data) { this.id = id(); this.pages = []; merge(this, structuredClone(data)); }
  getFlag(scope, key) { return getFlag(this.flags)(scope, key); }
  async update(data) { merge(this, expand(data)); return this; }
  async createEmbeddedDocuments(_, list) { const made = list.map(d => new Page(this, d)); this.pages.push(...made); return made; }
  async updateEmbeddedDocuments(_, list) { for (const d of list) merge(this.pages.find(p => p.id === d._id), expand(d)); }
  async deleteEmbeddedDocuments(_, ids) { this.pages = this.pages.filter(p => !ids.includes(p.id)); }
}
export class Scene {
  constructor() { this.id = id(); this.notes = []; this.name = 'Test Scene'; }
  async createEmbeddedDocuments(_, list) {
    const made = list.map(d => ({id: id(), ...structuredClone(d), getFlag(s, k) { return this.flags?.[s]?.[k]; }}));
    this.notes.push(...made); return made;
  }
  async updateEmbeddedDocuments(_, list) { for (const d of list) Object.assign(this.notes.find(n => n.id === d._id), d); }
}

export const gm = {id: 'gm', isGM: true};
export const player = {id: 'p1', isGM: false};

export function installFoundry() {
  const journal = [];
  globalThis.CONST = {DOCUMENT_OWNERSHIP_LEVELS: LEVELS, JOURNAL_ENTRY_PAGE_FORMATS: {HTML: 1}};
  globalThis.game = {user: gm, journal, folders: [], scenes: []};
  globalThis.Folder = {create: async d => ({id: id(), ...d})};
  globalThis.JournalEntry = {create: async d => { const j = new Journal(d); journal.push(j); return j; }};
  return globalThis.game;
}
