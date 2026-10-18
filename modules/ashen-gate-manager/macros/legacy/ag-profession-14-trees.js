// Ashen Gate — Profession Tree Generator (14 unique seven-node layouts)
// Foundry V14 + TheRipper93 Skill Tree module. Experimental; not canonical.
// Each route requires exactly one node at each stage: 4, 7, 10, 13, 16 = 50 total.
// All nodes at a stage lock each other out. Existing journals are SKIPPED by name.
// The six rewards per tree are placeholders from the user's Alchemy export.
if (!game.user?.isGM) { ui.notifications.error("Run as GM."); return; }
if (!game.modules.get("skill-tree")?.active) { ui.notifications.error("Enable Skill Tree module."); return; }

const SPECS = [{"name":"Alchemy","layout":"Early trident","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":1,"parents":[0],"slot":0,"cost":7,"lockouts":[2,3]},{"stage":1,"row":1,"col":3,"parents":[0],"slot":1,"cost":7,"lockouts":[1,3]},{"stage":1,"row":1,"col":5,"parents":[0],"slot":2,"cost":7,"lockouts":[1,2]},{"stage":2,"row":2,"col":3,"parents":[1,2,3],"slot":0,"cost":10,"lockouts":[]},{"stage":3,"row":3,"col":3,"parents":[4],"slot":0,"cost":13,"lockouts":[]},{"stage":4,"row":4,"col":3,"parents":[5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Archaeology","layout":"Centered trident","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":3,"parents":[0],"slot":0,"cost":7,"lockouts":[]},{"stage":2,"row":2,"col":0,"parents":[1],"slot":0,"cost":10,"lockouts":[3,4]},{"stage":2,"row":2,"col":3,"parents":[1],"slot":1,"cost":10,"lockouts":[2,4]},{"stage":2,"row":2,"col":6,"parents":[1],"slot":2,"cost":10,"lockouts":[2,3]},{"stage":3,"row":3,"col":3,"parents":[2,3,4],"slot":0,"cost":13,"lockouts":[]},{"stage":4,"row":4,"col":3,"parents":[5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Blacksmithing","layout":"Late trident","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":3,"parents":[0],"slot":0,"cost":7,"lockouts":[]},{"stage":2,"row":2,"col":3,"parents":[1],"slot":0,"cost":10,"lockouts":[]},{"stage":3,"row":3,"col":1,"parents":[2],"slot":0,"cost":13,"lockouts":[4,5]},{"stage":3,"row":3,"col":3,"parents":[2],"slot":1,"cost":13,"lockouts":[3,5]},{"stage":3,"row":3,"col":5,"parents":[2],"slot":2,"cost":13,"lockouts":[3,4]},{"stage":4,"row":4,"col":3,"parents":[3,4,5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Cooking","layout":"Two independent lanes","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":1,"parents":[0],"slot":0,"cost":7,"lockouts":[2]},{"stage":1,"row":1,"col":5,"parents":[0],"slot":1,"cost":7,"lockouts":[1]},{"stage":2,"row":2,"col":1,"parents":[1],"slot":0,"cost":10,"lockouts":[4]},{"stage":2,"row":2,"col":5,"parents":[2],"slot":1,"cost":10,"lockouts":[3]},{"stage":3,"row":3,"col":3,"parents":[3,4],"slot":0,"cost":13,"lockouts":[]},{"stage":4,"row":4,"col":3,"parents":[5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Enchanting","layout":"Crossed lanes","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":0,"parents":[0],"slot":0,"cost":7,"lockouts":[2]},{"stage":1,"row":1,"col":6,"parents":[0],"slot":1,"cost":7,"lockouts":[1]},{"stage":2,"row":2,"col":0,"parents":[2],"slot":0,"cost":10,"lockouts":[4]},{"stage":2,"row":2,"col":6,"parents":[1],"slot":1,"cost":10,"lockouts":[3]},{"stage":3,"row":3,"col":3,"parents":[3,4],"slot":0,"cost":13,"lockouts":[]},{"stage":4,"row":4,"col":3,"parents":[5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Engineering","layout":"Flexible crossovers","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":2,"parents":[0],"slot":0,"cost":7,"lockouts":[2]},{"stage":1,"row":1,"col":4,"parents":[0],"slot":1,"cost":7,"lockouts":[1]},{"stage":2,"row":2,"col":1,"parents":[1,2],"slot":0,"cost":10,"lockouts":[4]},{"stage":2,"row":2,"col":5,"parents":[1,2],"slot":1,"cost":10,"lockouts":[3]},{"stage":3,"row":3,"col":3,"parents":[3,4],"slot":0,"cost":13,"lockouts":[]},{"stage":4,"row":4,"col":3,"parents":[5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Fishing","layout":"One-way crossover","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":1,"parents":[0],"slot":0,"cost":7,"lockouts":[2]},{"stage":1,"row":1,"col":5,"parents":[0],"slot":1,"cost":7,"lockouts":[1]},{"stage":2,"row":2,"col":1,"parents":[1],"slot":0,"cost":10,"lockouts":[4]},{"stage":2,"row":2,"col":5,"parents":[1,2],"slot":1,"cost":10,"lockouts":[3]},{"stage":3,"row":3,"col":3,"parents":[3,4],"slot":0,"cost":13,"lockouts":[]},{"stage":4,"row":4,"col":3,"parents":[5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Herbalism","layout":"Two separated forks","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":1,"parents":[0],"slot":0,"cost":7,"lockouts":[2]},{"stage":1,"row":1,"col":5,"parents":[0],"slot":1,"cost":7,"lockouts":[1]},{"stage":2,"row":2,"col":3,"parents":[1,2],"slot":0,"cost":10,"lockouts":[]},{"stage":3,"row":3,"col":1,"parents":[3],"slot":0,"cost":13,"lockouts":[5]},{"stage":3,"row":3,"col":5,"parents":[3],"slot":1,"cost":13,"lockouts":[4]},{"stage":4,"row":4,"col":3,"parents":[4,5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Hunting/Skinning","layout":"Offset double fork","nodes":[{"stage":0,"row":0,"col":1,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":0,"parents":[0],"slot":0,"cost":7,"lockouts":[2]},{"stage":1,"row":1,"col":4,"parents":[0],"slot":1,"cost":7,"lockouts":[1]},{"stage":2,"row":2,"col":2,"parents":[1,2],"slot":0,"cost":10,"lockouts":[]},{"stage":3,"row":3,"col":3,"parents":[3],"slot":0,"cost":13,"lockouts":[5]},{"stage":3,"row":3,"col":6,"parents":[3],"slot":1,"cost":13,"lockouts":[4]},{"stage":4,"row":4,"col":4,"parents":[4,5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Inscription","layout":"Late parallel lanes","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":3,"parents":[0],"slot":0,"cost":7,"lockouts":[]},{"stage":2,"row":2,"col":1,"parents":[1],"slot":0,"cost":10,"lockouts":[3]},{"stage":2,"row":2,"col":5,"parents":[1],"slot":1,"cost":10,"lockouts":[2]},{"stage":3,"row":3,"col":1,"parents":[2],"slot":0,"cost":13,"lockouts":[5]},{"stage":3,"row":3,"col":5,"parents":[3],"slot":1,"cost":13,"lockouts":[4]},{"stage":4,"row":4,"col":3,"parents":[4,5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Jewelcrafting","layout":"Late crossed lanes","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":3,"parents":[0],"slot":0,"cost":7,"lockouts":[]},{"stage":2,"row":2,"col":2,"parents":[1],"slot":0,"cost":10,"lockouts":[3]},{"stage":2,"row":2,"col":4,"parents":[1],"slot":1,"cost":10,"lockouts":[2]},{"stage":3,"row":3,"col":1,"parents":[3],"slot":0,"cost":13,"lockouts":[5]},{"stage":3,"row":3,"col":5,"parents":[2],"slot":1,"cost":13,"lockouts":[4]},{"stage":4,"row":4,"col":3,"parents":[4,5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Leatherworking","layout":"Late open crossings","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":3,"parents":[0],"slot":0,"cost":7,"lockouts":[]},{"stage":2,"row":2,"col":0,"parents":[1],"slot":0,"cost":10,"lockouts":[3]},{"stage":2,"row":2,"col":6,"parents":[1],"slot":1,"cost":10,"lockouts":[2]},{"stage":3,"row":3,"col":1,"parents":[2,3],"slot":0,"cost":13,"lockouts":[5]},{"stage":3,"row":3,"col":5,"parents":[2,3],"slot":1,"cost":13,"lockouts":[4]},{"stage":4,"row":4,"col":3,"parents":[4,5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Mining","layout":"Late one-way switch","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":3,"parents":[0],"slot":0,"cost":7,"lockouts":[]},{"stage":2,"row":2,"col":1,"parents":[1],"slot":0,"cost":10,"lockouts":[3]},{"stage":2,"row":2,"col":5,"parents":[1],"slot":1,"cost":10,"lockouts":[2]},{"stage":3,"row":3,"col":0,"parents":[2],"slot":0,"cost":13,"lockouts":[5]},{"stage":3,"row":3,"col":6,"parents":[2,3],"slot":1,"cost":13,"lockouts":[4]},{"stage":4,"row":4,"col":3,"parents":[4,5],"slot":0,"cost":16,"lockouts":[]}]},{"name":"Tailoring","layout":"Narrow staggered lanes","nodes":[{"stage":0,"row":0,"col":3,"parents":[],"slot":0,"cost":4,"lockouts":[]},{"stage":1,"row":1,"col":0,"parents":[0],"slot":0,"cost":7,"lockouts":[2]},{"stage":1,"row":1,"col":6,"parents":[0],"slot":1,"cost":7,"lockouts":[1]},{"stage":2,"row":2,"col":0,"parents":[1],"slot":0,"cost":10,"lockouts":[4]},{"stage":2,"row":2,"col":6,"parents":[2],"slot":1,"cost":10,"lockouts":[3]},{"stage":3,"row":3,"col":3,"parents":[3,4],"slot":0,"cost":13,"lockouts":[]},{"stage":4,"row":4,"col":3,"parents":[5],"slot":0,"cost":16,"lockouts":[]}]}];
const ICON_BASE = "https://assets.forge-vtt.com/62c62bd933be7b591cad34da/worlds/the-ashen-gate/";
const PLACEHOLDERS = [
 "Item.DevHqYxn3oCjo9rR", "Item.0BNsBKvViqLG4EVS", "Item.hqqUgzYDKDLrZAYX",
 "Item.P4i0nOtq0aHSeg50", "Item.Lx2bRQqhYtEGEFwW", "Item.wOqoRbfYvY7GIWhe"
];
const id = () => foundry.utils.randomID(16);
const folderName = "Professions — Skill Trees";
let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === folderName);
if (!folder) folder = await Folder.create({name:folderName,type:"JournalEntry",color:"#ab894e"});
const missing = [];
const results = [];
for (const spec of SPECS) {
 try {
  if (game.journal.some(j => j.name === spec.name)) {results.push(`${spec.name}: skipped (already exists)`);continue;}
  const slug = spec.name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
  const icon = `${ICON_BASE}${slug}_icon.png`;
  const background = `${ICON_BASE}${slug}_background.png`;
  const groupId = id();
  const journal = await JournalEntry.create({
   name:spec.name,folder:folder.id,ownership:{default:0},
   flags:{"skill-tree":{
    isSkillTree:true,linkedSkillRule:"some",multipleItemsRule:"all",skillStyle:"square",
    pointsImage:icon,independentSkillPoints:true,showSkillPointsInGroup:false,
    groups:[{name:spec.name,color:"#ffffff",sound:"",image:background,blurBackground:false,minRows:5,minCols:7,id:groupId}]
   },"ashen-gate-generator":{schema:2,version:"distinct-14",profession:spec.name,layout:spec.layout,placeholderRewards:true}}
  });
  const pageIds = spec.nodes.map(() => id());
  const professionItem = game.items.find(i => i.name.toLowerCase() === spec.name.toLowerCase());
  const pages = [];
  let rewardIndex = 0;
  for (let index=0;index<spec.nodes.length;index++) {
   const node = spec.nodes[index];
   const root = node.stage === 0;
   const rewardUuid = root ? (professionItem?.uuid ?? null) : PLACEHOLDERS[rewardIndex++];
   const reward = rewardUuid ? await fromUuid(rewardUuid) : null;
   if (rewardUuid && !reward) missing.push(`${spec.name}: ${rewardUuid}`);
   const nodeTitle = root ? spec.name : `${spec.name} — Stage ${node.stage+1} ${String.fromCharCode(65+node.slot)}`;
   pages.push({
    _id:pageIds[index],name:nodeTitle,type:"text",src:root?icon:(reward?.img || "icons/svg/upgrade.svg"),
    text:{format:1,content:`<p><strong>PLAYTEST PLACEHOLDER.</strong> Stage ${node.stage+1} of 5; cost ${node.cost} points.</p><p>${spec.layout}. One node can be selected per stage. Each completed route costs 50 points. The linked Item is granted when the node is fully purchased.</p>`},
    flags:{"skill-tree":{
     points:node.cost,linkedSkillRule:0,mutualExclusion:0,allowIncompleteProgression:0,
     minimumPointsInGroup:0,itemUuids:reward?[rewardUuid]:[],
     connectedSkills:node.parents.map(i=>`JournalEntry.${journal.id}.JournalEntryPage.${pageIds[i]}`),
     conditionScript:"",onUnlockScript:"",color:"",skillStyle:"default",sound:"",
     row:node.row,col:node.col,groupId,
     lockoutSkills:node.lockouts.map(i=>`JournalEntry.${journal.id}.JournalEntryPage.${pageIds[i]}`)
    }}
   });
  }
  await journal.createEmbeddedDocuments("JournalEntryPage",pages,{keepId:true});
  results.push(`${spec.name}: ${spec.layout} — 7 nodes, 50 points per route`);
 } catch(err) {console.error("Ashen Gate Skill Tree generation",spec.name,err);results.push(`${spec.name}: ERROR ${err.message}`);}
}
console.table(results);
if(missing.length)console.warn("Missing placeholder Item references:",missing);
const escaped=foundry.utils.escapeHTML(results.join("\n"));
new Dialog({title:"Ashen Gate — Generated Profession Trees",content:`<p>Generated 14 distinct seven-node layout attempts. Every valid route follows <strong>4 → 7 → 10 → 13 → 16 = 50</strong>. Trees with matching names were skipped.</p><pre style="max-height:340px;overflow:auto;white-space:pre-wrap">${escaped}</pre>${missing.length?`<p><strong>${missing.length}</strong> placeholder Item links were missing; see console.</p>`:""}`,buttons:{done:{label:"Done"}}}).render(true);
