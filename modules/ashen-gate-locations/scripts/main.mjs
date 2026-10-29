import {MODULE_ID, DEFAULT_UNIDENTIFIED_LABEL} from './model.mjs';
import {readAll, writeAll, readViews, placeNote, legacyJournalCount, isGM, migrate, presentationOptions, readNotes, writeNotes, readPlayerNotes,
  syncSharedNotes, syncSceneCompanions, readSharedNotes, writeSharedNotes, isSharedNotesPage, players, pinsOf, readStoredRoutes, pinReport, removeManagedPins, readNotesStore} from './store.mjs';
import {createApi} from './api.mjs';
import {createNotesService, SOCKET} from './party-notes.mjs';
import {createActiveWatcher} from './active.mjs';
import {createShowService} from './show.mjs';
import {createShareService} from './sharing.mjs';
import {LocationsApp} from './app.mjs';
import {mountLocationLauncher} from './launcher.js';
import {launcherRoot, mountLauncher} from './ag-launchers.mjs';
import {registerPinLook, refreshPins, DEFAULT_PIN_LOOK, PIN_LOOKS, NAME_SIZE} from './pin-look.mjs';
import {registerPinTravel} from './travel-ui.mjs';
import {createEmbed, EMBED_MODES, EMBED_CONTRACT} from './embed.mjs';

const VERSION = '0.33.0';
const playerAccessEnabled = () => game.settings.get(MODULE_ID, 'playerAccessEnabled') === true;
const mayOpen = () => isGM() || playerAccessEnabled();
/** Text of a TableResult (V13+ name/description; older text), without markup. */
const resultText = r => String(r?.name || r?.description || r?.text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
/** 0.20.0: the GM's Roll on a linked RollTable: Foundry's own draw, posted to chat with the table's roll mode. */
const tables = {
  async draw(uuid) {
    let table = null;
    try { table = await fromUuid(uuid); } catch { table = null; }
    if (table?.documentName !== 'RollTable' || typeof table.draw !== 'function') throw new Error('That roll table no longer exists.');
    const draw = await table.draw();
    return {results: (draw?.results ?? []).map(resultText).filter(Boolean)};
  },
  uuidByName: name => (game.tables?.getName?.(name) ?? [...(game.tables ?? [])].find(t => t.name === name))?.uuid ?? ''
};
const notifyError = err => { console.error(`${MODULE_ID} |`, err); ui.notifications?.error(err?.message ?? String(err)); };

// 1.13.0: compact read-only view for partner modules (embed.mjs).
const embed = createEmbed({mayOpen, readViews, api: () => game.modules.get(MODULE_ID)?.api, notifyError});
for (const hook of ['createJournalEntryPage', 'updateJournalEntryPage', 'deleteJournalEntryPage', 'updateJournalEntry'])
  Hooks.on(hook, (doc, ...rest) => { if (rest.some(x => x && typeof x === 'object' && x.agBulk === true)) return; if ((doc?.parent ?? doc)?.getFlag?.(MODULE_ID, 'role') !== undefined) embed.refreshAll(); });

function attachActorsLauncher(app, html, visible = mayOpen()) {
  return mountLauncher(launcherRoot(app, html), {moduleId: MODULE_ID, label: 'Locations', icon: 'fa-solid fa-map-location-dot',
    onClick: () => game.modules.get(MODULE_ID).api.open(), visible});
}
function applyPlayerAccess(enabled) {
  setTimeout(checkActive, 300);
  embed.refreshAll();
  attachActorsLauncher(ui.actors, null, isGM() || enabled);
  if (!isGM() && !enabled && LocationsApp.instance?.rendered) LocationsApp.instance.close().catch(notifyError);
}
// 0.24.0: every client reports when the active set changes (see active.mjs). Re-checked after any Locations journal change.
let activeTimer = null;
const active = createActiveWatcher({read: () => game.modules.get(MODULE_ID)?.api?.activeLocations() ?? [], isGM,
  fire: (name, payload) => Hooks.callAll(name, payload), notify: text => ui.notifications?.info(text)});
const checkActive = () => { clearTimeout(activeTimer); activeTimer = setTimeout(() => { try { active.check(); } catch (err) { console.warn(`${MODULE_ID} |`, err); } }, 150); };
for (const hook of ['createJournalEntryPage', 'updateJournalEntryPage', 'deleteJournalEntryPage', 'updateJournalEntry', 'ashenGate.bulkFinished'])
  Hooks.on(hook, (doc, ...rest) => { if (hook === 'ashenGate.bulkFinished' || (doc?.parent ?? doc)?.getFlag?.(MODULE_ID, 'role') !== undefined) checkActive(); });

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'playerAccessEnabled', {
    name: 'Locations — Player Access',
    hint: 'Show the Locations viewer to players. Players only ever see revealed locations and the parts you mark visible.',
    scope: 'world', config: true, type: Boolean, default: true, restricted: true,
    onChange: value => applyPlayerAccess(value === true)
  });
  // Shown on unidentified pins and pages; edited in GM Setup. Changing one re-labels existing pins.
  const resync = () => { if (isGM() && (game.users?.activeGM?.isSelf ?? true)) writeAll(readAll()).catch(notifyError); };
  game.settings.register(MODULE_ID, 'unidentifiedLabel', {
    name: 'Locations — Unidentified label', scope: 'world', config: false, type: String, default: DEFAULT_UNIDENTIFIED_LABEL, restricted: true, onChange: resync
  });
  game.settings.register(MODULE_ID, 'unknownPinImage', {
    name: 'Locations — Unidentified pin image', scope: 'world', config: false, type: String, default: '', restricted: true, onChange: resync
  });
  // 0.21.0: how this module's Map Notes are drawn on every client. Display only: no Note is rewritten.
  game.settings.register(MODULE_ID, 'pinLook', {
    name: 'Locations — Pin look', scope: 'world', config: false, type: String, default: DEFAULT_PIN_LOOK, restricted: true,
    choices: PIN_LOOKS, onChange: () => refreshPins()
  });
  // 0.22.2: replaced by pinNameMode ('' = not chosen yet, so the old value is read). Kept registered and never rewritten.
  game.settings.register(MODULE_ID, 'pinNameMode', {
    name: 'Locations — Name under the pin', scope: 'world', config: false, type: String, default: '', restricted: true, onChange: () => refreshPins()
  });
  game.settings.register(MODULE_ID, 'pinShowName', {
    name: 'Locations — Show name under the pin (before 0.22.2)', scope: 'world', config: false, type: Boolean, default: false, restricted: true, onChange: () => refreshPins()
  });
  game.settings.register(MODULE_ID, 'pinNameSize', {
    name: 'Locations — Pin name size', scope: 'world', config: false, type: Number, default: NAME_SIZE.default, restricted: true, onChange: () => refreshPins()
  });
  game.settings.register(MODULE_ID, 'pinNameWrap', {
    name: 'Locations — Wrap pin name after (characters)', scope: 'world', config: false, type: Number, default: 0, restricted: true, onChange: () => refreshPins()
  });
  game.settings.register(MODULE_ID, 'pinNameOffset', {
    name: 'Locations — Pin name distance from the pin (pixels)', scope: 'world', config: false, type: Number, default: 0, restricted: true, onChange: () => refreshPins()
  });
  // 0.23.0: what a player's client does when the GM uses Show to Players. On: the Locations window opens. Off: a notification only.
  game.settings.register(MODULE_ID, 'showOpensWindow', {
    name: 'Locations — Open the window when the GM shows a location', scope: 'world', config: false, type: Boolean, default: true, restricted: true
  });
  registerPinLook();
  registerPinTravel(); // 0.33.0: right-click > Travel on a pin
  // 0.20.0: the route settings (defaultLegKm, trackerPosition, trackerOpacity) are no longer registered; stored values stay unused.
});

Hooks.once('ready', () => {
  const mod = game.modules.get(MODULE_ID);
  const isPrimaryGM = () => isGM() && (game.users?.activeGM?.isSelf ?? true);
  // Party Notes: players ask the primary GM's client, which checks and writes; with no GM connected they write
  // the shared page of a location they can see (party-notes.mjs).
  const notes = createNotesService({users: game.users, currentUser: () => game.user, isPrimaryGM, playerAccessEnabled,
    readAll, readNotes, writeNotes, reconcile: loc => syncSharedNotes([loc]),
    shared: {read: readSharedNotes, write: writeSharedNotes}, socket: game.socket});
  // 1.8.0 "Share with...": players ask the primary GM's client to add players to a location they can see (sharing.mjs).
  const sharing = createShareService({users: game.users, currentUser: () => game.user, isPrimaryGM, playerAccessEnabled, readAll, writeAll, socket: game.socket});
  // 0.23.0 "Show to Players": the GM opens a location in the other clients' Locations window (show.mjs).
  const show = createShowService({users: game.users, currentUser: () => game.user, socket: game.socket, readAll,
    getLocation: ref => game.modules.get(MODULE_ID).api.getLocation(ref), mayOpen, autoOpen: () => game.settings.get(MODULE_ID, 'showOpensWindow') !== false,
    open: ref => LocationsApp.showFromGM(ref), notify: text => ui.notifications?.info(text)});
  game.socket?.on?.(SOCKET, (msg, senderId) => {
    if (msg?.type === 'show-location') { show.onSocket(msg, senderId).catch(err => console.warn(`${MODULE_ID} |`, err)); return; }
    if (typeof msg?.type === 'string' && msg.type.startsWith('share-')) sharing.onSocket(msg, senderId).catch(notifyError);
    else notes.onSocket(msg, senderId).catch(notifyError);
  });
  mod.api = createApi({
    embed: {contract: EMBED_CONTRACT, modes: [...EMBED_MODES], mount: embed.mount},
    version: VERSION, isGM, playerAccessEnabled,
    // 0.33.0 Travel: the current user and a way to find a scene by uuid (null when this client does not hold it).
    currentUser: () => game.user,
    resolveScene: uuid => { try { const d = fromUuidSync(uuid); return d?.documentName === 'Scene' ? d : null; } catch { return null; } },
    setPlayerAccess: value => game.settings.set(MODULE_ID, 'playerAccessEnabled', value),
    readAll, writeAll, readViews, placeNote, viewOptions: presentationOptions, pinsOf, playerIds: () => players().map(u => u.id),
    sharing: {request: sharing.request}, show: {send: show.send},
    tables, storedRoutes: readStoredRoutes,
    pins: {report: pinReport, remove: removeManagedPins},
    notedIds: () => new Set([...readNotesStore().values()].filter(n => n.text?.trim()).map(n => n.locationId)),
    open: () => LocationsApp.show(),
    openLocation: ref => LocationsApp.show(ref),
    notes: {readGM: readNotes, readPlayer: readPlayerNotes, request: notes.request, userId: () => game.user?.id, isActive: notes.isActive, nameOf: notes.nameOf}
  });
  if (isGM()) {
    const legacy = legacyJournalCount();
    if (legacy) console.info(`${MODULE_ID} | ignoring ${legacy} Journal(s) from Locations 0.8.x (test data); delete them when you no longer need them.`);
    // One GM migrates 1.2.x data (pin keys, marker states, Note/page flags). Re-runnable; a no-op once done.
    if (game.users?.activeGM?.isSelf ?? true) migrate().then(r => {
      if (r.records || r.pages || r.notes) console.info(`${MODULE_ID} | migrated ${r.records} location(s), ${r.pages} page(s), ${r.notes} Map Note(s) to 1.3.0 pin keys`);
      // 1.8.0: Regions that were passing conditions keep doing so; tell the GM which.
      if (r.unsettled) console.info(`${MODULE_ID} | 1.8.0: settled "Pass conditions to places inside" on ${r.unsettled} record(s); kept on for: ${r.inheritance.map(x => x.id).join(', ') || 'none'}`);
      if (r.inheritance.length) ui.notifications?.info(`Locations 1.8.0: Regions now pass their conditions down only when you switch it on. ${r.inheritance.length} Region(s) were already doing so and still do: ${r.inheritance.map(x => x.name).join(', ')}.`, {permanent: true});
    }).then(() => reconcileShared()).catch(notifyError);
  }
  attachActorsLauncher(ui.actors);
  active.check(); // starting set; no event
  console.info(`${MODULE_ID} | ${VERSION} ready`);
});

// Player-facing viewer in the shared Actors group; GM-only launcher in the Scenes sidebar (Foundry shows that tab to GMs only).
Hooks.on('renderActorDirectory', (app, html) => attachActorsLauncher(app, html));
Hooks.on('renderSceneDirectory', (app, html) => {
  mountLocationLauncher(html ?? app?.element, {isGM: isGM(), onOpen: () => game.modules.get(MODULE_ID).api.open()});
});

// A Map Note for a location opens the Locations window instead of the backing Journal page. Notes
// carry only the opaque pinKey (1.2.x notes a locationId, until the GM's client migrates them).
Hooks.on('activateNote', (note, options) => {
  // 0.20.0: journeys are retired; an old party marker opens nothing (the GM can delete it from the scene).
  if (note?.document?.getFlag?.(MODULE_ID, 'partyMarker') === true) return false;
  let ref = note?.document?.getFlag?.(MODULE_ID, 'pinKey') || note?.document?.getFlag?.(MODULE_ID, 'locationId');
  // 0.28.0: a companion Note opens the generic unidentified entry (its companion key is a view key). The GM, who has no such view, gets the real location.
  const companion = note?.document?.getFlag?.(MODULE_ID, 'companionKey');
  if (!ref && companion) ref = isGM() ? readAll().find(l => l.companionKey === companion)?.pinKey : companion;
  if (!ref) return;
  if (!mayOpen()) { ui.notifications.warn('Locations is hidden from players right now.'); return false; }
  game.modules.get(MODULE_ID).api.openLocation(ref).catch(notifyError);
  return false;
});
// 0.28.0: a real Map Note's companion follows it. Only the GM who made the change reacts (so it runs once), only for Notes with our pin key
// (a companion's own update is ignored, so there is no loop), and the sync is idempotent. A companion the GM deletes by hand comes back on the
// next save of any location; delete the location's option instead.
for (const hook of ['createNote', 'updateNote', 'deleteNote']) {
  Hooks.on(hook, (doc, ...rest) => {
    const userId = rest.at(-1);
    if (!isGM() || userId !== game.user?.id || !doc?.getFlag?.(MODULE_ID, 'pinKey')) return;
    syncSceneCompanions(doc.parent).catch(notifyError);
  });
}
// Dragging a location from the GM list onto the canvas places a Map Note there. (The list only offers this for
// locations marked Placeable on a map, unless the GM shows representative-only ones too.)
Hooks.on('dropCanvasData', (canvas, data) => {
  if (data?.type !== 'AshenGateLocation' || !isGM()) return;
  game.modules.get(MODULE_ID).api.placeOnScene(data.id, {scene: canvas.scene, x: data.x, y: data.y}).catch(notifyError);
  return false;
});

// 1.7.0: the primary GM reconciles shared Party Notes on ready (this also creates the shared Journal and copies
// existing notes in) and whenever another user writes a shared page (players saving with no GM connected, or just
// as the GM arrives). Re-runnable; never deletes notes.
async function reconcileShared() {
  const r = await syncSharedNotes();
  if (r.created || r.fromPlayers || r.merged) console.info(`${MODULE_ID} | shared Party Notes: ${r.created} page(s) created, ${r.fromPlayers} taken from players' saves, ${r.merged} merged`);
  if (r.merged) ui.notifications?.info(`Locations: ${r.merged} location(s) had Party Notes changed on both sides; both versions were kept, the older under a divider.`);
  if (r.truncated) ui.notifications?.warn(`Locations: merged Party Notes for ${r.truncated} location(s) hit the length limit; the end of the older text was cut. See the console.`);
}
let reconcileTimer = null;
Hooks.on('updateJournalEntryPage', (page, _changes, _options, userId) => {
  if (_options?.agBulk === true || !isSharedNotesPage(page) || userId === game.user?.id || !isGM() || !(game.users?.activeGM?.isSelf ?? true)) return;
  clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => reconcileShared().catch(notifyError), 500);
});

// Keep an open window current when another client saves. Never clobber a GM's unsaved edits.
let pending = null;
function refresh() {
  clearTimeout(pending);
  pending = setTimeout(() => {
    const app = LocationsApp.instance;
    if (app?.rendered && !app.dirty && mayOpen()) app.render().catch(notifyError);
  }, 100);
}
// 0.20.4: a Manager bulk write (options.agBulk) wakes nothing; one refresh follows ashenGate.bulkFinished.
const isBulk = (...a) => a.some(x => x && typeof x === 'object' && x.agBulk === true);
for (const hook of ['createJournalEntry', 'updateJournalEntry', 'createJournalEntryPage', 'updateJournalEntryPage', 'deleteJournalEntryPage']) {
  Hooks.on(hook, (doc, ...rest) => { if (isBulk(...rest)) return; if ((doc.parent ?? doc).getFlag?.(MODULE_ID, 'role')) refresh(); });
}
Hooks.on('ashenGate.bulkFinished', () => { refresh(); embed.refreshAll(); });
// 0.28.0: Utilities says a shop's presentation may have changed; redraw the Shops cards (the hook never fires without Utilities).
Hooks.on('ashen-gate-utilities.shopsChanged', refresh);
