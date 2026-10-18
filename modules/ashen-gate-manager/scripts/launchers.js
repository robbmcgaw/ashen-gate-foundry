/** Shared, optional module launcher convention: game.modules.get(id).api.open(). */
export async function openAshenLauncher(moduleId, modules, menus) {
  const module=modules.get(moduleId);
  if(!module?.active) throw new Error(`${moduleId} is not active in this world.`);
  if(typeof module.api?.open==='function') return await module.api.open();
  const menuKeys=[...menus.keys()].filter(key=>String(key).startsWith(`${moduleId}.`));
  menuKeys.sort((a,b)=>Number(/(manager|ledger|main|open)/i.test(b))-Number(/(manager|ledger|main|open)/i.test(a)));
  const key=menuKeys.find(k=>typeof menus.get(k)?.type==='function');
  if(!key) throw new Error(`${moduleId} has no advertised Open API or registered settings window.`);
  const Type=menus.get(key).type;
  const app=new Type();
  if(typeof app.render!=='function') throw new Error(`${moduleId} settings window cannot render.`);
  return app.render({force:true});
}
