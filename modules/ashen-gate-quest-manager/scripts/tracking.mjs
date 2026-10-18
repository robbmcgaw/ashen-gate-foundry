// Quest overlay selects ONLY the already-sanitized per-viewer public projections.
// It never reads source definitions, GM progress Journals, or resolver bindings.
const CANONICAL=/^(QUEST|ORDER|CONTRACT)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export function validTrackedId(id){return typeof id==='string'&&CANONICAL.test(id);}
export function trackingState(raw){
 const input=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const ids=[...new Set((Array.isArray(input.ids)?input.ids:[]).filter(validTrackedId))].slice(0,100);
 return {ids,visible:input.visible===true};
}
export function selectTrackedViews(visibleViews,ids){
 const wanted=new Set(trackingState({ids}).ids);
 return (Array.isArray(visibleViews)?visibleViews:[]).filter(v=>v&&validTrackedId(v.id)&&wanted.has(v.id)&&v.status!=='Hidden'&&Array.isArray(v.objectives))
 .map(v=>({id:v.id,name:v.name,status:v.status,objectives:v.objectives.map(o=>({key:o.key,goal:o.goal,complete:o.complete===true,failed:o.failed===true}))}));
}
