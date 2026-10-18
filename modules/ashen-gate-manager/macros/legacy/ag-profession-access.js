// Ashen Gate — Sync Profession Skill Tree permissions from official Profession access mapping.
// GM only, preview-first, grant-only. Foundry V14 / D&D5e 6.x.
// The Journal belongs to a USER; proficiency evidence belongs to an ACTOR.
if (!game.user.isGM) { ui.notifications.error("GM only."); return; }
const NAMES = [
  "Alchemy", "Archaeology", "Blacksmithing", "Cooking", "Enchanting",
  "Engineering", "Fishing", "Herbalism", "Hunting/Skinning", "Inscription",
  "Jewelcrafting", "Leatherworking", "Mining", "Tailoring"
];
const slug = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const alias = {
  alc:"alchemist", her:"herbalism", smi:"smith", mas:"mason", coo:"cook",
  bre:"brewer", car:"carpenter", pot:"potter", woo:"woodcarver", tin:"tinker",
  cal:"calligrapher", cart:"cartographer", pai:"painter", gla:"glassblower",
  jew:"jeweler", lea:"leatherworker", cob:"cobbler", wea:"weaver",
  exc:"excavator", exca:"excavator", fishing:"fishing"
};
const toolAliases = {
 alchemist:["alchemist","alchemists supplies"], herbalism:["herbalism","herbalism kit"],
 smith:["smith","smiths tools"], mason:["mason","masons tools"],
 cook:["cook","cooks utensils"], brewer:["brewer","brewers supplies"],
 carpenter:["carpenter","carpenters tools"], potter:["potter","potters tools"],
 woodcarver:["woodcarver","woodcarvers tools"], tinker:["tinker","tinkers tools"],
 calligrapher:["calligrapher","calligraphers supplies"], cartographer:["cartographer","cartographers tools"],
 painter:["painter","painters supplies"], glassblower:["glassblower","glassblowers tools"],
 jeweler:["jeweler","jewelers tools"], leatherworker:["leatherworker","leatherworkers tools"],
 cobbler:["cobbler","cobblers tools"], weaver:["weaver","weavers tools"],
 excavator:["excavator","excavators tools"]
};
function val(entry) {
  if (typeof entry === "number") return entry>0;
  if (typeof entry === "boolean") return entry;
  if (!entry || typeof entry !== "object") return false;
  if (typeof entry.value === "number") return entry.value>0;
  if (typeof entry.value === "boolean") return entry.value;
  if (typeof entry.proficient === "number") return entry.proficient>0;
  if (typeof entry.proficient === "boolean") return entry.proficient;
  return false;
}
function getTools(actor) {
  const names=new Set();
  const t=actor.system?.tools ?? {};
  for (const [key,entry] of Object.entries(t)) {
    if (!val(entry)) continue;
    const normalizedKey=slug(key);
    names.add(alias[normalizedKey]||normalizedKey);
    for (const item of [entry?.label,entry?.name]) if (item) names.add(slug(item));
  }
  // dnd5e custom tool proficiencies; only explicit proficiency fields count.
  for (const part of String(actor.system?.traits?.toolProf?.custom??"").split(/[;,]/)) if(slug(part))names.add(slug(part));
  return names;
}
function toolHas(names,key) {
  return toolAliases[key].some(a=>names.has(slug(a)));
}
function skillHas(actor,skill) {
  const v=actor.system?.skills?.[skill];
  return Number(v?.value ?? v?.proficient ?? 0)>0;
}
function getEvidence(actor,profession) {
  const t=getTools(actor);
  const matches = keys => keys.filter(key=>toolHas(t,key));
  const by = keys => matches(keys).map(k=>`tool: ${k}`);
  switch (profession) {
    case "Alchemy": return by(["alchemist","herbalism"]);
    case "Archaeology": return toolHas(t,"excavator") && (skillHas(actor,"his") || skillHas(actor,"rel"))
      ? [`Excavator's Tools + ${skillHas(actor,"his")?"History":"Religion"}`] : [];
    case "Blacksmithing": return by(["smith","mason"]);
    case "Cooking": return by(["cook","brewer"]);
    case "Enchanting": return by(["carpenter","potter","woodcarver"]);
    case "Engineering": return by(["tinker"]); // Smith's Tools limited metalwork is not unrestricted access.
    case "Fishing": return ["No proficiency required"];
    case "Herbalism": return [...by(["herbalism"]), ...(skillHas(actor,"nat")?["Nature (gathering only)"]:[])];
    case "Hunting/Skinning": return [...by(["leatherworker"]), ...(skillHas(actor,"sur")?["Survival"]:[])];
    case "Inscription": return by(["calligrapher","cartographer","painter"]);
    case "Jewelcrafting": return by(["jeweler","glassblower"]);
    case "Leatherworking": return by(["leatherworker","cobbler"]);
    case "Mining": return by(["mason"]); // Latest direct correction: Mason's Tools only.
    case "Tailoring": return by(["weaver"]);
    default: return [];
  }
}
const players=game.users.filter(u=>!u.isGM);
const actors=game.actors.filter(a=>a.type==="character");
const journals=game.journal.filter(j=>j.getFlag("skill-tree","isSkillTree") && NAMES.includes(j.name));
const plans=[];
for(const tree of journals) {
  for(const user of players) {
    const chars=actors.filter(a=>user.character?.id===a.id || a.testUserPermission(user,"OWNER"));
    const evidence=chars.flatMap(a=>getEvidence(a,tree.name).map(why=>`${a.name}: ${why}`));
    if(!evidence.length)continue;
    const explicit=tree.ownership?.[user.id];
    const inherited=Number(tree.ownership?.default ?? 0);
    const current=explicit===undefined ? inherited : Number(explicit);
    plans.push({tree,user,evidence,current,grant:current<2});
  }
}
const grants=plans.filter(p=>p.grant);
const esc=s=>foundry.utils.escapeHTML(String(s));
const content=`<p><strong>Preview: no changes yet.</strong> Found ${journals.length}/14 named skill trees, ${actors.length} character Actors, and ${grants.length} new Observer grants.</p>
<p>Only exact profession Journal names are scanned. Existing access is never removed or reduced.</p>
<p><strong>Exceptions:</strong> Fishing requires no proficiency. Nature grants Herbalism gathering access only (Journal access cannot distinguish gathering from crafting). Engineering via Smith's Tools requires DM approval and is not automatically granted. Archaeology requires Excavator's Tools plus History or Religion. Mining uses Mason's Tools only.</p>
<div style="max-height:340px;overflow:auto"><table><thead><tr><th>Tree</th><th>User</th><th>Character / Evidence</th><th>Action</th></tr></thead><tbody>
${plans.map(p=>`<tr><td>${esc(p.tree.name)}</td><td>${esc(p.user.name)}</td><td>${esc(p.evidence.join("; "))}</td><td>${p.grant?"Grant Observer":"Already permitted"}</td></tr>`).join("")||"<tr><td colspan='4'>No qualifying tree/user pairs</td></tr>"}</tbody></table></div>
<p><small>Actor proficiency ≠ Journal permission. Permissions are granted to user accounts, so this is a visibility convenience, not an enforcement system. Verify exceptions manually.</small></p>`;
new Dialog({title:"Ashen Gate — Profession Tree Access",content,buttons:{
 cancel:{label:"Close — No changes"},
 apply:{label:`Apply ${grants.length} grant(s)`, callback:async()=>{
   let good=0;const failed=[];
   for(const p of grants)try{await p.tree.update({[`ownership.${p.user.id}`]:2});good++;}catch(err){failed.push(`${p.tree.name}/${p.user.name}: ${err.message}`);console.error(err);}
   ui.notifications.info(`Profession tree access: ${good} granted, ${failed.length} failed.`);
   if(failed.length) console.warn("Profession tree access failures",failed);
 }}
},default:"cancel"}).render(true);
