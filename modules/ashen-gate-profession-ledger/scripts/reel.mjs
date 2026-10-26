/** Ashen Gate Profession Ledger: the slot-machine reveal (0.34.0). Pure HTML strings, no Foundry globals.
 * Everything shown here was decided before the animation starts: the reel is only a picture of a result that already exists.
 * The plain text of every result is always in the page (screen readers, reduced motion, "Skip animation"). */
export const FALLBACK_IMG='icons/svg/item-bag.svg';
const escape=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const hash=s=>{let h=7;for(const c of String(s))h=(h*31+c.charCodeAt(0))>>>0;return h;};
const FILLER=9;
export const STAGGER=0.7,DURATION=2.8;

/** The pictures that scroll past before the reel lands: filler from the pool (a fixed order per player, so a re-render never
 * changes the picture), then the real drop last. */
export function reelStrip(pool,finalItem,seed){
  const items=(pool??[]).filter(Boolean);
  const out=[];
  if(items.length){const start=hash(seed)%items.length;for(let i=0;i<FILLER;i++)out.push(items[(start+i)%items.length]);}
  out.push(finalItem);
  return out;
}
const dropText=d=>d.hidden?'A special find (the GM will give it)':`${d.quantity>1?`${d.quantity} × `:''}${d.name}`;
const verdictText=r=>r.result==='fail'?'Failed':r.result==='rare'?'Success by 5+':'Success';

/**
 * `view`: {title, dcText, rows:[{id,name,total,result,drops:[{name,img,quantity,kind,hidden}],undetermined:bool}], reel:[{img,name}]}.
 * `opts`: {reduced:boolean (plain list only), elapsed: seconds since the reveal began (a re-render joins the animation where it is, or shows the end state)}.
 */
export function revealHtml(view,{reduced=false,elapsed=0,skipId='skip-reveal'}={}){
  const rows=view.rows??[];
  const played=elapsed>=rows.length*STAGGER+DURATION;
  const items=rows.map((r,i)=>{
    const win=r.drops?.length>0;
    const main=r.drops?.[0];
    const strip=!reduced&&win?`<div class="agl-reel" aria-hidden="true" style="--agl-delay:${(i*STAGGER-Math.min(elapsed,9999)).toFixed(2)}s">
        <ul class="agl-reel__strip" style="--agl-n:${reelStrip(view.reel,main,r.id).length}">${reelStrip(view.reel,{img:main.hidden?'':main.img},r.id)
          .map(p=>`<li><img src="${escape(p?.img||FALLBACK_IMG)}" alt="" width="40" height="40"></li>`).join('')}</ul></div>`:'';
    const drops=win?r.drops.map(d=>`<span class="agl-reveal__drop"><img src="${escape(d.hidden?FALLBACK_IMG:d.img||FALLBACK_IMG)}" alt="" width="20" height="20"> ${escape(dropText(d))} <span class="ag-badge">${escape(d.kind[0].toUpperCase()+d.kind.slice(1))}</span></span>`).join(''):
      r.result==='fail'?'<span class="agl-reveal__none">Nothing found</span>'
      :'<span class="agl-reveal__none">The Ledger can’t pick this one: the GM gives it by hand</span>';
    return `<li class="agl-reveal__row" data-result="${escape(r.result)}">
      <div class="agl-reveal__who"><strong>${escape(r.name)}</strong> <span class="agl-sub">${escape(r.total)}${view.dcText?` vs ${escape(view.dcText)}`:''} · ${verdictText(r)}</span></div>
      ${strip}<div class="agl-reveal__drops">${drops}</div></li>`;
  }).join('');
  const summary=rows.map(r=>`${r.name}: ${r.result==='fail'?'nothing':r.drops?.length?r.drops.map(dropText).join(' and '):'by hand'}`).join('. ');
  return `<section class="agl-reveal${reduced?' is-plain':''}${played?' is-played':''}" data-agl-reveal aria-label="Gather results">
    ${reduced||played?'':`<div class="agl-reveal__bar"><button type="button" class="ag-btn ag-btn--sm" data-action="${escape(skipId)}"><i class="fa-solid fa-forward" aria-hidden="true"></i> Skip animation</button></div>`}
    <ul class="agl-reveal__rows">${items||'<li class="agl-sub">Nobody rolled.</li>'}</ul>
    <p class="ag-sr-only" role="status" aria-live="polite">${escape(summary)}</p></section>`;
}
