/* AG-WORK-0007 / Locations v0.8.0 — TEST FIXTURE RESET, run as a GM in
 * the disposable test-world console or an explicitly GM-only script Macro.
 * Only tagged source/projection Journals for the SIX exact AGTEST IDs are eligible.
 * Never deletes any Location outside this fixture; does not change Scenes/Tiles.
 * CAUTION: published test Journals and any custom pages inside them are deleted.
 */
(async()=>{
  if(!game.user?.isGM) throw new Error('GM only.');
  const ids=new Set(['LOC-AGTEST-FRONTIER','LOC-AGTEST-VERGE','LOC-AGTEST-ROAD','LOC-AGTEST-MINE','LOC-AGTEST-VIEW','LOC-AGTEST-SEALED']);
  const namespace='ashen-gate-locations';
  const isTagged=j=>{
    const flags=j.flags?.[namespace]??{};
    if(flags.role==='source')return ids.has(flags.record?.id) &&
      flags.record?.provenance?.sources?.some(s=>s.includes('Synthetic TEST ONLY — AG-WORK-0007/2026-10-17'));
    if(flags.role==='projection')return ids.has(flags.location_ref) &&
      game.journal.contents.some(s=>s.flags?.[namespace]?.role==='source' &&
        s.flags?.[namespace]?.record?.id===flags.location_ref &&
        s.flags?.[namespace]?.record?.provenance?.sources?.some(x=>x.includes('Synthetic TEST ONLY — AG-WORK-0007/2026-10-17')));
    return false;
  };
  const targets=game.journal.contents.filter(isTagged);
  if(!targets.length){ui.notifications.info('No tagged AGTEST Locations fixture Journals found.');return;}
  const okay=await foundry.applications.api.DialogV2.confirm({
    window:{title:'Remove AGTEST Locations fixture Journals?'},
    content:`<p>Delete ${targets.length} <strong>TEST</strong> source/published Journals only?</p><p>Any custom pages inside those test Journals will be lost. This does NOT remove Scenes, Tiles, other Locations, or unrelated Journals.</p>`,
    rejectClose:false
  });
  if(!okay){ui.notifications.info('AGTEST cleanup cancelled.');return;}
  for(const j of targets)await j.delete();
  ui.notifications.info(`Deleted ${targets.length} AGTEST Journal(s). Reload Locations to refresh the Library.`);
})();
