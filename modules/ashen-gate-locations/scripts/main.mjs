import {MODULE_ID, DEFAULT_UNIDENTIFIED_LABEL} from './model.mjs';
import {readAll, writeAll, readViews, placeNote, legacyJournalCount, isGM, migrate, presentationOptions} from './store.mjs';
import {createApi} from './api.mjs';
import {LocationsApp} from './app.mjs';
import {mountLocationLauncher} from './launcher.js';
import {launcherRoot, mountLauncher} from './ag-launchers.mjs';

const VERSION = '1.3.0';
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
});

Hooks.once('ready', () => {
  const mod = game.modules.get(MODULE_ID);
  mod.api = createApi({
    version: VERSION, isGM, playerAccessEnabled,
    setPlayerAccess: value => game.settings.set(MODULE_ID, 'playerAccessEnabled', value),
    readAll, writeAll, readViews, placeNote, viewOptions: presentationOptions,
    open: () => LocationsApp.show(),
    openLocation: ref => LocationsApp.show(ref)
  });
  if (isGM()) {
    const legacy = legacyJournalCount();
    if (legacy) console.info(`${MODULE_ID} | ignoring ${legacy} Journal(s) from Locations 0.8.x (test data); delete them when you no longer need them.`);
    // One GM migrates 1.2.x data (pin keys, marker states, Note/page flags). Re-runnable; a no-op once done.
    if (game.users?.activeGM?.isSelf ?? true) migrate().then(r => {
      if (r.records || r.pages || r.notes) console.info(`${MODULE_ID} | migrated ${r.records} location(s), ${r.pages} page(s), ${r.notes} Map Note(s) to 1.3.0 pin keys`);
    }).catch(notifyError);
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
// Dragging a location from the GM list onto the canvas places a Map Note there.
Hooks.on('dropCanvasData', (canvas, data) => {
  if (data?.type !== 'AshenGateLocation' || !isGM()) return;
  game.modules.get(MODULE_ID).api.placeOnScene(data.id, {scene: canvas.scene, x: data.x, y: data.y}).catch(notifyError);
  return false;
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
for (const hook of ['updateJournalEntry', 'createJournalEntryPage', 'updateJournalEntryPage', 'deleteJournalEntryPage']) {
  Hooks.on(hook, doc => { if ((doc.parent ?? doc).getFlag?.(MODULE_ID, 'role')) refresh(); });
}
