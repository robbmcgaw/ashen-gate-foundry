/** Minimal Foundry/dnd5e stand-ins. They prove the hub's logic and calls, not Foundry's own behaviour. */
export const users = {
  gm: {id: 'gm', name: 'GM', isGM: true},
  owner: {id: 'owner', name: 'Owner', isGM: false},
  observer: {id: 'observer', name: 'Observer', isGM: false}
};
const LEVELS = {NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3};

export function installGlobals({user = users.owner, modules = {}, settings = {}, actors = []} = {}) {
  const notes = [];
  const store = {...settings};
  globalThis.game = {user, users: Object.values(users), actors, modules: {get: id => modules[id] ?? null},
    settings: {store, get: (scope, key) => store[key], async set(scope, key, value) { store[key] = structuredClone(value); return value; }}};
  globalThis.ui = {notifications: {warn: m => notes.push(['warn', m]), error: m => notes.push(['error', m]), info: m => notes.push(['info', m])}};
  globalThis.CONFIG = {
    statusEffects: [{id: 'blinded'}, {id: 'prone'}, {id: 'exhaustion'}, {id: 'poisoned'}],
    DND5E: {
      abilities: {str: {label: 'Strength', abbreviation: 'str'}, dex: {label: 'Dexterity', abbreviation: 'dex'}},
      skills: {ath: {label: 'Athletics'}, ste: {label: 'Stealth'}},
      conditionTypes: {blinded: {label: 'Blinded'}, prone: {label: 'Prone'}, poisoned: {label: 'Poisoned'}, exhaustion: {label: 'Exhaustion', levels: 6}, bleeding: {label: 'Bleeding', pseudo: true}},
      movementTypes: {walk: 'Walk', fly: 'Fly'}
    }
  };
  return notes;
}

export function makeItem(data, actor) {
  const item = {
    documentName: 'Item', id: data.id, name: data.name, type: data.type, img: data.img ?? 'icons/item.webp', parent: actor, actor,
    system: data.system ?? {}, flags: data.flags ?? {}, sort: data.sort ?? 0, calls: [],
    async update(diff) { item.calls.push(['update', diff]); applyDiff(item, diff); return item; },
    async use(...args) { item.calls.push(['use', ...args]); return {used: true}; },
    sheet: {render: (...args) => item.calls.push(['sheet', ...args])},
    getFlag(scope, key) { return item.flags?.[scope]?.[key]; }
  };
  return item;
}

function applyDiff(doc, diff) {
  for (const [path, value] of Object.entries(diff)) {
    const keys = path.split('.'); let o = doc;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    o[keys.at(-1)] = value;
  }
}

/** A dnd5e-shaped character. `perms` maps user id → permission level name. */
export function makeActor({perms = {owner: 'OWNER', observer: 'OBSERVER'}, items = [], system = {}, statuses = []} = {}) {
  const actor = {
    documentName: 'Actor', id: 'actor1', uuid: 'Actor.actor1', name: '[TEST] Hero', type: 'character', img: 'hero.webp', calls: [],
    statuses: new Set(statuses), limited: false, flags: {},
    system: {
      details: {level: 3, race: {name: '[TEST] Elf'}},
      attributes: {hp: {value: 20, temp: 5, max: 24, tempmax: 0, effectiveMax: 24}, ac: {value: 15}, prof: 2, init: {total: 3},
        movement: {walk: 30, fly: 0, units: 'ft'}, inspiration: false, exhaustion: 1, hd: {value: 2, max: 3}},
      abilities: {str: {value: 14, mod: 2, proficient: 1, save: {value: 4}}, dex: {value: 16, mod: 3, proficient: 0, save: {value: 3}}},
      skills: {ath: {ability: 'str', total: 4, passive: 14, proficient: 1}, ste: {ability: 'dex', total: 7, passive: 17, proficient: 2}},
      resources: {primary: {label: 'Ki', value: 2, max: 3}, secondary: {label: '', value: 0, max: 0}},
      currency: {pp: 0, gp: 15, ep: 0, sp: 3, cp: 7},
      spells: {},
      ...system
    },
    testUserPermission(user, level) { return user.isGM || LEVELS[perms[user.id] ?? 'NONE'] >= LEVELS[level]; },
    get isOwner() { return this.testUserPermission(globalThis.game.user, 'OWNER'); },
    async update(diff) { actor.calls.push(['update', diff]); applyDiff(actor, diff); return actor; },
    async updateEmbeddedDocuments(type, rows) { actor.calls.push(['updateEmbedded', type, rows]); for (const r of rows) applyDiff(actor.items.get(r._id), Object.fromEntries(Object.entries(r).filter(([k]) => k !== '_id'))); return rows; },
    async createEmbeddedDocuments(type, rows) { actor.calls.push(['createEmbedded', type, rows]); const made = rows.map((r, n) => makeItem({...r, id: r._id ?? `new${list.length + n}`}, actor)); list.push(...made); return made; },
    async toggleStatusEffect(id, options) { actor.calls.push(['toggleStatusEffect', id, options]); return true; },
    async rollSkill(...a) { actor.calls.push(['rollSkill', ...a]); return []; },
    async rollAbilityCheck(...a) { actor.calls.push(['rollAbilityCheck', ...a]); return []; },
    async rollSavingThrow(...a) { actor.calls.push(['rollSavingThrow', ...a]); return []; },
    async rollInitiativeDialog(...a) { actor.calls.push(['rollInitiativeDialog', ...a]); },
    async rollDeathSave(...a) { actor.calls.push(['rollDeathSave', ...a]); return []; },
    async shortRest(...a) { actor.calls.push(['shortRest', ...a]); return {}; },
    async longRest(...a) { actor.calls.push(['longRest', ...a]); return {}; }
  };
  const list = items.map(d => makeItem(d, actor));
  actor.items = Object.assign(list, {get: id => list.find(i => i.id === id)});
  actor.classes = Object.fromEntries(list.filter(i => i.type === 'class').map(c => [c.system.identifier ?? c.name.toLowerCase(), c]));
  return actor;
}

/** Stand-in for ActorSheetV2: just enough lifecycle for the hub's own methods. */
export class FakeActorSheetV2 {
  constructor(options = {}) { this.options = options; this.document = options.document; this.renders = []; this.isEditable = true; }
  async render(options) { this.renders.push(options ?? {}); return this; }
}
