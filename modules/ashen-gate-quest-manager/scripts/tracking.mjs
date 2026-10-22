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
// 0.14.0 Overlay layout, per user (User flag `overlay`): where it was dragged to and its background opacity.
// 100 = opaque background, 0 = no background; text and the header stay opaque either way.
export function clampOpacity(v){if(v===null||v===undefined||v==='')return 100;const n=Math.round(Number(v));return Number.isFinite(n)?Math.min(100,Math.max(0,n)):100;}
export function overlayState(raw){
 const input=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const out={opacity:clampOpacity(input.opacity)};
 if(Number.isFinite(input.left)&&Number.isFinite(input.top)){out.left=Math.round(input.left);out.top=Math.round(input.top);}
 return out;
}
/** Keeps a box of `size` fully on a screen of `screen` (both {width,height}); a box bigger than the screen sits at 0. */
export function clampPosition({left,top},size,screen){
 const fit=(v,box,max)=>Math.max(0,Math.min(Math.max(0,(Number(max)||0)-(Number(box)||0)),Math.round(Number(v)||0)));
 return {left:fit(left,size?.width,screen?.width),top:fit(top,size?.height,screen?.height)};
}
