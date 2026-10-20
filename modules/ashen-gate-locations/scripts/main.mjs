import {MODULE_ID, DEFAULT_UNIDENTIFIED_LABEL} from './model.mjs';
import {readAll, writeAll, readViews, placeNote, legacyJournalCount, isGM, migrate, presentationOptions, readNotes, writeNotes, readPlayerNotes,
  syncSharedNotes, readSharedNotes, writeSharedNotes, isSharedNotesPage, players, pinsOf, readRoutes, writeRoutes, readRouteViews, usedRouteIds, defaultLegKm} from './store.mjs';
import {ROUTE_DEFAULTS} from './routes.mjs';
import {createApi} from './api.mjs';
import {createNotesService, SOCKET} from './party-notes.mjs';
import {createShareService} from './sharing.mjs';
import {LocationsApp} from './app.mjs';
import {mountLocationLauncher} from './launcher.js';
import {launcherRoot, mountLauncher} from './ag-launchers.mjs';

const VERSION = '1.10.0';
const playerAccessEnabled = () => game.settings.get(MODULE_ID, 'playerAccessEnabled') === true;
const mayOpen = () => isGM() || playerAccessEnabled();
const notifyError = err => { console.error(`${MODULE_ID} |`, err); ui.notifications?.error(err?.message ?? String(err)); };

function attachActorsLauncher(app, html, visible = mayOpen()) {
  return mountLauncher(launcherRoot(app, html), {moduleId: MODULE_ID, label: 'Locations', icon: 'fa-solid fa-map-location-dot',
    onClick: () => game.modules.get(MODULE_ID).api.open(), visible});
}
function applyPlayerAccess(enabled) {
  attachActorsLauncher(ui.actors, null, isGM() || enabled);
  if (!isGM() && !enabled && LocationsApp.instance?.rendered) LocationsApp.instance.close().catch(notifyError);
}

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
  // 1.10.0: leg length for routes that do not set their own (GM Setup). Changing it updates players' leg counts.
  game.settings.register(MODULE_ID, 'defaultLegKm', {
    name: 'Locations — Default leg length (km)', scope: 'world', config: false, type: Number, default: ROUTE_DEFAULTS.legKm, restricted: true, onChange: resync
  });
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
  game.socket?.on?.(SOCKET, (msg, senderId) => {
    if (typeof msg?.type === 'string' && msg.type.startsWith('share-')) sharing.onSocket(msg, senderId).catch(notifyError);
    else notes.onSocket(msg, senderId).catch(notifyError);
  });
  mod.api = createApi({
    version: VERSION, isGM, playerAccessEnabled,
    setPlayerAccess: value => game.settings.set(MODULE_ID, 'playerAccessEnabled', value),
    readAll, writeAll, readViews, placeNote, viewOptions: presentationOptions, pinsOf, playerIds: () => players().map(u => u.id),
    routes: {readAll: readRoutes, writeAll: writeRoutes, readViews: readRouteViews, usedIds: usedRouteIds, defaultLegKm},
    sharing: {request: sharing.request},
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
  console.info(`${MODULE_ID} | ${VERSION} ready`);
});

// Player-facing viewer in the shared Actors group; GM-only builder in the Items sidebar.
Hooks.on('renderActorDirectory', (app, html) => attachActorsLauncher(app, html));
Hooks.on('renderItemDirectory', (app, html) => {
  mountLocationLauncher(html ?? app?.element, {isGM: isGM(), onOpen: () => game.modules.get(MODULE_ID).api.open()});
});

// A Map Note for a location opens the Locations window instead of the backing Journal page. Notes
// carry only the opaque pinKey (1.2.x notes a locationId, until the GM's client migrates them).
Hooks.on('activateNote', (note, options) => {
  const ref = note?.document?.getFlag?.(MODULE_ID, 'pinKey') || note?.document?.getFlag?.(MODULE_ID, 'locationId');
  if (!ref) return;
  if (!mayOpen()) { ui.notifications.warn('Locations is hidden from players right now.'); return false; }
  game.modules.get(MODULE_ID).api.openLocation(ref).catch(notifyError);
  return false;
});
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
  if (!isSharedNotesPage(page) || userId === game.user?.id || !isGM() || !(game.users?.activeGM?.isSelf ?? true)) return;
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
for (const hook of ['createJournalEntry', 'updateJournalEntry', 'createJournalEntryPage', 'updateJournalEntryPage', 'deleteJournalEntryPage']) {
  Hooks.on(hook, doc => { if ((doc.parent ?? doc).getFlag?.(MODULE_ID, 'role')) refresh(); });
}
